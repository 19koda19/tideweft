import { describe, expect, it } from "vitest";

import { findAutonomousRoutePlan } from "../sim/network";
import {
  STRAND_AUTOMATION_THRESHOLD, assertWorldInvariants, createWorld, createWorldView,
  deserializeWorld, serializeWorld, stepWorld,
} from "../sim/public";
import {
  readResidentActivityEventLocus,
  RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS,
} from "../sim/residentActivityEventLocus";
import { FIXED_POINT, type SimEvent, type WorldState, type WorldView } from "../sim/types";
import { stableStringify } from "../sim/util";
import { headingFromRadians, livingActorAddressForResident, livingActorAddressInRegionalWindow } from "./livingActor";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { createPlayer, playerTileIndex } from "./player";
import { porterHeavyDepartureAdmissionMatchesEventTimePerception } from "./porterHeavyDepartureAdmissionAuthority";
import { projectPerception } from "./projection";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities } from "./residentActivityExecution";
import { playerWorldPositionInRegionalWindow, resolveResidentRouteWorldPlacement } from "./residentSpatial";
import { createSituatedExpressionState, reduceSituatedExpression } from "./situatedExpression";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import { createPorterHeavyDepartureExpressionAdmissionRecord } from "./situatedExpressionAdmissionLedger";
import {
  workingPeopleExpressionEventForTrigger,
  workingPeopleExpressionEventMatchesWorld,
  workingPeopleExpressionIntent,
  workingPeopleExpressionMemoryMatchesWorld,
  workingPeopleExpressionSourceAddressForTrigger,
} from "./workingPeopleExpression";
import { worldPositionDelta } from "./worldPosition";

// Native acceptance, departure, custody, coarse placement and inner save only.
// These tests do not activate bodies in the runtime or claim physical transport.
const BASE = createWorld("first lantern", "standard");
const LEGACY_KEYS = ["arrivalTick", "bottleneckReliability", "residentId", "routeHops"] as const;

function residentAt(state: WorldState, id: number) {
  const resident = state.residents.find((candidate) => candidate.id === id);
  if (resident === undefined) throw new Error("fixture lost its native porter");
  return resident;
}

function fixture(reverse = false, adopt = true) {
  const state = structuredClone(BASE);
  state.weather = {
    kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  for (const route of state.routes) {
    route.traceStrength = Math.max(route.traceStrength, STRAND_AUTOMATION_THRESHOLD);
    route.condition = Math.max(route.condition, 180_000);
  }
  const contract = state.contracts.find((candidate) => {
    const plan = findAutonomousRoutePlan(state, candidate.originSettlementId, candidate.destinationSettlementId);
    const route = state.routes.find(({ id }) => id === plan?.routeIds[0]);
    return candidate.status === "offered" && route !== undefined
      && (route.fromSettlementId !== candidate.originSettlementId) === reverse;
  });
  const origin = state.settlements.find(({ id }) => id === contract?.originSettlementId);
  const resident = state.residents.find((candidate) => candidate.activeContractId === null
    && candidate.location.kind === "settlement"
    && candidate.location.settlementId === contract?.originSettlementId);
  if (contract === undefined || origin === undefined || resident === undefined) {
    throw new Error(`fixture needs a native ${reverse ? "reverse" : "forward"} Promise and origin porter`);
  }
  // Match the existing heavy-resource fixture law: any added physical stock
  // also enters the initial conservation ledger. Do not inject carried cargo.
  contract.resource = "parts";
  contract.quantity = 1;
  if (origin.inventory.parts < contract.quantity) {
    const added = contract.quantity - origin.inventory.parts;
    origin.inventory.parts += added;
    state.ledger.initial.parts += added;
  }
  const id = resident.id;
  stepWorld(state, [{
    id: `body-heavy-accept:${reverse}`, type: "accept-contract", carrier: "resident",
    contractId: contract.id, residentId: id,
  }]);
  expect(contract.status).toBe("accepted");
  if (adopt) {
    expect(adoptResidentActivities(state)).toBe(true);
    expect(state.residents.every((candidate) => Object.hasOwn(candidate, "activity"))).toBe(true);
    for (let phase = 1; phase <= 3; phase += 1) expect(advanceResidentRestActivities(state, phase)).not.toBeNull();
  }
  const before = residentAt(state, id).activity;
  stepWorld(state);
  const departures = state.events.filter((event) => event.type === "contract-departed" && event.subjectId === contract.id);
  const event = departures[0];
  if (departures.length !== 1 || event === undefined) throw new Error("fixture needs one native committed departure");
  const world = createWorldView(state);
  const intent = workingPeopleExpressionIntent({ world, event });
  if (intent === null) throw new Error("native heavy departure did not derive speech");
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.event === null || reduced.state === null) throw new Error("heavy departure speech was not accepted");
  return { state, id, contractId: contract.id, before, event, world, intent,
    expression: reduced.event, memory: reduced.state.recent[0]! };
}

function changedCommittedEvent(world: WorldView, event: SimEvent): WorldView {
  return { ...world, events: world.events.map((candidate) => candidate.sequence === event.sequence ? event : candidate) };
}

describe("body-captured heavy porter departure", () => {
  it.each(["forward", "reverse"] as const)("captures the committed %s route endpoint and heading, not the earlier settlement body", (direction) => {
    const current = fixture(direction === "reverse");
    const resident = residentAt(current.state, current.id);
    const body = resident.activity!;
    const pose = body.poses[0]!;
    const routePlacement = resolveResidentRouteWorldPlacement(current.world, resident)!;
    expect(current.before?.poses).toHaveLength(4);
    expect(body.poses).toHaveLength(1);
    expect(body.tick).toBe(current.event.tick);
    expect(current.event.tick).toBe(current.before!.tick + 1);
    expect(readResidentActivityEventLocus(current.event.data)).toEqual({
      tick: current.event.tick, phase: 0, position: pose.position, heading: pose.heading,
    });
    expect(pose.position).toEqual(routePlacement.position);
    expect(pose.heading).toBe(headingFromRadians(routePlacement.facing));
    expect(pose.position).not.toEqual(current.before!.poses.at(-1)!.position);
    expect(current.intent.position).toEqual(pose.position);
    const address = workingPeopleExpressionSourceAddressForTrigger(current.world, current.intent.triggerEventId);
    expect(address).toEqual(livingActorAddressForResident(current.world, resident));
    expect(address?.position).toEqual(pose.position);
    expect(address?.heading).toBe(pose.heading);
    expect(Object.isFrozen(address)).toBe(true);
    expect(Object.keys(current.event.data).sort()).toEqual([
      ...LEGACY_KEYS, ...RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS,
    ].sort());
    if (resident.location.kind !== "route") throw new Error("fixture lost its native route membership");
    expect(resident.location.progress).toBe(direction === "reverse" ? FIXED_POINT : 0);
    const contract = current.state.contracts.find(({ id }) => id === current.contractId)!;
    expect(contract).toMatchObject({
      status: "in-transit", carrierKind: "resident", assignedResidentId: current.id,
      departedTick: current.event.tick, quantity: 1, cargoQuantity: 1,
    });
    expect(contract.porterSettlementIds[0]).toBe(contract.originSettlementId);
    expect(contract.porterSettlementIds.at(-1)).toBe(contract.destinationSettlementId);
    expect(contract.porterRouteIds).toHaveLength(current.event.data.routeHops as number);
    assertWorldInvariants(current.state);
  });

  it.each([false, true])("keeps exact detached event/cargo/body bytes and source rederivation for reverse=%s", (reverse) => {
    const current = fixture(reverse);
    const text = serializeWorld(current.state);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    expect(restored.events).toEqual(current.state.events);
    expect(restored.contracts.find(({ id }) => id === current.contractId))
      .toEqual(current.state.contracts.find(({ id }) => id === current.contractId));
    expect(residentAt(restored, current.id).activity).toEqual(residentAt(current.state, current.id).activity);
    expect(residentAt(restored, current.id).activity).not.toBe(residentAt(current.state, current.id).activity);
    const world = createWorldView(restored);
    expect(workingPeopleExpressionEventForTrigger(world, current.expression.triggerEventId)).toEqual(current.expression);
    expect(workingPeopleExpressionEventMatchesWorld(world, current.expression)).toBe(true);
    expect(workingPeopleExpressionMemoryMatchesWorld(world, current.memory)).toBe(true);
    expect(workingPeopleExpressionSourceAddressForTrigger(world, current.expression.triggerEventId))
      .toEqual(workingPeopleExpressionSourceAddressForTrigger(current.world, current.expression.triggerEventId));
    expect(workingPeopleExpressionIntent({ world: structuredClone(current.world), event: structuredClone(current.event) }))
      .toEqual(current.intent);
    assertWorldInvariants(restored);
  });

  it("retains the exact observed body variant through inner save without changing speech", () => {
    const current = fixture();
    current.event.data.playerObserved = true;
    expect(Object.keys(current.event.data)).toHaveLength(13);
    expect(workingPeopleExpressionIntent({ world: createWorldView(current.state), event: current.event })).toEqual(current.intent);
    const text = serializeWorld(current.state);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    const event = restored.events.find(({ sequence }) => sequence === current.event.sequence)!;
    expect(event.data.playerObserved).toBe(true);
    expect(Object.keys(event.data)).toHaveLength(13);
    expect(workingPeopleExpressionEventForTrigger(createWorldView(restored), current.intent.triggerEventId))
      .toEqual(current.expression);
  });

  it("rejects partial and mistimed body extensions, requested scalar forgeries and relocated expressions", () => {
    const current = fixture();
    for (const key of RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS) {
      const event = structuredClone(current.event);
      delete event.data[key];
      const world = changedCommittedEvent(current.world, event);
      expect(workingPeopleExpressionIntent({ world, event }), key).toBeNull();
      expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId), key).toBeNull();
    }
    for (const [key, value] of [
      ["eventBodyVersion", 2], ["eventBodyPhase", 1], ["eventBodyPhase", -0],
      ["eventBodyTick", current.event.tick - 1], ["eventBodyTick", current.event.tick + 1],
      ["eventBodyHeading", 1_000_000], ["eventBodyLocalX", 120_000], ["eventBodyRegionX", -0],
      ["unknownBodyField", 1], ["playerObserved", false],
    ] as const) {
      const event = structuredClone(current.event);
      event.data[key] = value;
      const world = changedCommittedEvent(current.world, event);
      expect(workingPeopleExpressionIntent({ world, event }), `${key}:${value}`).toBeNull();
      expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId), `${key}:${value}`).toBeNull();
    }
    for (const key of RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS) {
      const event = structuredClone(current.event);
      const value = event.data[key] as number;
      event.data[key] = key === "eventBodyHeading" ? (value + 1) % 1_000_000 : value + 1;
      expect(workingPeopleExpressionIntent({ world: current.world, event }), key).toBeNull();
    }
    const moved = { ...current.expression,
      position: { ...current.expression.position, localX: current.expression.position.localX + 1 } };
    expect(workingPeopleExpressionEventMatchesWorld(current.world, moved)).toBe(false);
    expect(workingPeopleExpressionSourceAddressForTrigger(current.world, `${current.intent.triggerEventId}:forged`)).toBeNull();
  });

  it("keeps source identity, cargo custody and coarse endpoint eligibility required by both consumers", () => {
    const current = fixture();
    const malformed: Array<readonly [string, (world: WorldView) => void]> = [
      ["missing cargo", (world) => { world.contracts.find(({ id }) => id === current.contractId)!.cargoQuantity = 0; }],
      ["wrong carrier", (world) => { world.contracts.find(({ id }) => id === current.contractId)!.carrierKind = "player"; }],
      ["lost custody", (world) => { world.residents.find(({ id }) => id === current.id)!.activeContractId = null; }],
      ["foreign identity", (world) => { world.residents.find(({ id }) => id === current.id)!.identity.stableId = "dog:forged-porter"; }],
      ["coarse progression", (world) => {
        const resident = world.residents.find(({ id }) => id === current.id)!;
        if (resident.location.kind !== "route") throw new Error("fixture lost route");
        resident.location.progress = 1;
      }],
      ["lost itinerary", (world) => { world.contracts.find(({ id }) => id === current.contractId)!.porterRouteIds = []; }],
    ];
    for (const [name, mutate] of malformed) {
      const world = structuredClone(current.world);
      mutate(world);
      const event = world.events.find(({ sequence }) => sequence === current.event.sequence)!;
      expect(workingPeopleExpressionIntent({ world, event }), name).toBeNull();
      expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId), name).toBeNull();
      expect(workingPeopleExpressionEventMatchesWorld(world, current.expression), name).toBe(false);
    }
  });

  it("returns null without throwing when the source lookup has no usable event collection", () => {
    const current = fixture();
    const invalidCollections: readonly unknown[] = [
      null, undefined, 1, "events", {}, [], [null], [undefined], [1],
      [null, undefined, false, "not an event", 1],
    ];
    for (const events of invalidCollections) {
      // These are deliberately malformed public-call inputs, not valid saves.
      // Full world validation and unrelated malformed entries remain the
      // decoder's responsibility; this only checks the bounded source lookup.
      const world = { ...current.world, events } as unknown as WorldView;
      let result: unknown;
      expect(() => {
        result = workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId);
      }).not.toThrow();
      expect(result).toBeNull();
    }
  });

  it("rejects duplicate committed source sequences", () => {
    const current = fixture();
    const world = { ...current.world, events: [...current.world.events, structuredClone(current.event)] };
    expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId)).toBeNull();
  });

  it("returns null for malformed trigger types and unknown or incorrectly bound triggers", () => {
    const current = fixture();
    const otherContract = current.world.contracts.find(({ id }) => id !== current.contractId)!;
    const triggers: readonly unknown[] = [
      null, undefined, false, 1, Symbol("not a trigger"), {}, [], "", "not a trigger",
      `sim-event:contract-departed:${current.event.sequence + 100_000}:${current.contractId}`,
      `sim-event:contract-departed:${current.event.sequence}:${otherContract.id}`,
      `sim-event:contract-departed:0${current.event.sequence}:${current.contractId}`,
    ];
    for (const trigger of triggers) {
      // Cast explicitly exposes malformed external inputs to the typed API.
      let result: unknown;
      expect(() => {
        result = workingPeopleExpressionSourceAddressForTrigger(current.world, trigger as string);
      }).not.toThrow();
      expect(result).toBeNull();
    }
  });

  it("joins the real captured source to phase-zero direct sight and hearing admission", () => {
    const current = fixture(true);
    const sourceAddress = workingPeopleExpressionSourceAddressForTrigger(current.world, current.intent.triggerEventId)!;
    const window = createRegionalTerrainWindow(current.state.meta.rootSeed,
      createTerrainRegionStreamingState({ rootSeed: current.state.meta.rootSeed }));
    const spatialWorld = createRegionalWorldView(current.world, window,
      projectRegionalCartographyWindow(createRegionalCartography(current.state.meta.rootSeed), window));
    const source = livingActorAddressInRegionalWindow(sourceAddress, window)!;
    const resident = residentAt(current.state, current.id);
    const player = createPlayer(current.world, resident.homeSettlementId);
    const x = source.point.x;
    const y = source.point.y;
    Object.assign(player, { x, y, previousX: x, previousY: y,
      worldWidth: window.terrain.width, worldHeight: window.terrain.height });
    const position = playerWorldPositionInRegionalWindow(window, player)!;
    expect(projectPerception(spatialWorld, player).detailVisibilityGrades[source.tileIndex]).toBe(VISIBILITY_DIRECT);
    const masking = ambientNoiseAt(spatialWorld, playerTileIndex(player))!;
    const delta = worldPositionDelta(position, current.expression.position);
    const acoustics = situatedExpressionAcoustics(current.expression.volume);
    const heard = evaluateAudibleContact({
      listener: { x: 0, y: 0 }, source: { x: delta.x, y: delta.y },
      baseRange: acoustics.rangeUnits, ambientNoise: masking,
      sourceLoudness: acoustics.loudness / FIXED_POINT,
      wind: { x: spatialWorld.weather.windX / FIXED_POINT, y: spatialWorld.weather.windY / FIXED_POINT },
    });
    expect(heard).not.toBeNull();
    const admission = createPorterHeavyDepartureExpressionAdmissionRecord({
      sourceActorId: current.expression.sourceActorId, triggerEventId: current.expression.triggerEventId,
      sampleOrdinal: 0, admittedAtPlayerStepPhase: 0, receivedAtTick: current.world.completedTick,
      listenerPosition: position, listenerFacingMilliRadians: player.facingMilliRadians,
      hearingCertainty: Math.max(1, Math.round(heard!.certainty * FIXED_POINT)),
    });
    expect(admission).not.toBeNull();
    expect(porterHeavyDepartureAdmissionMatchesEventTimePerception({
      economyWorld: current.world, spatialWorld, window, playerTemplate: player,
      event: current.expression, admission: admission!, completedTick: current.world.completedTick,
    })).toBe(true);
  });

  it("preserves legacy four/five-field bytes and exact current-address derivation after adoption", () => {
    const current = fixture(false, false);
    expect(Object.keys(current.event.data).sort()).toEqual([...LEGACY_KEYS].sort());
    expect(readResidentActivityEventLocus(current.event.data)).toBeNull();
    const bytes = stableStringify(current.event);
    const originalAddress = workingPeopleExpressionSourceAddressForTrigger(current.world, current.intent.triggerEventId);
    expect(originalAddress).toEqual(livingActorAddressForResident(current.world, residentAt(current.state, current.id)));
    expect(adoptResidentActivities(current.state)).toBe(true);
    expect(stableStringify(current.event)).toBe(bytes);
    expect(workingPeopleExpressionIntent({ world: createWorldView(current.state), event: current.event })).toEqual(current.intent);
    expect(workingPeopleExpressionSourceAddressForTrigger(createWorldView(current.state), current.intent.triggerEventId))
      .toEqual(originalAddress);
    current.event.data.playerObserved = true;
    expect(Object.keys(current.event.data)).toHaveLength(5);
    const observedBytes = stableStringify(current.event);
    expect(workingPeopleExpressionIntent({ world: createWorldView(current.state), event: current.event })).toEqual(current.intent);
    const text = serializeWorld(current.state);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    expect(stableStringify(restored.events.find(({ sequence }) => sequence === current.event.sequence))).toBe(observedBytes);
    expect(workingPeopleExpressionEventForTrigger(createWorldView(restored), current.intent.triggerEventId))
      .toEqual(current.expression);
  });
});
