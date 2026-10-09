import { describe, expect, it } from "vitest";

import { findAutonomousRoutePlan } from "../sim/network";
import { createRegionCoord } from "../sim/regions";
import {
  RESIDENT_ACTIVITY_OWNER_ID, RESIDENT_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ACTIVITY_VERSION, type ResidentPhysicalTravelTask,
} from "../sim/residentActivity";
import { residentAcceptedPickupBinding, residentRestTargetHasDrySupport } from "../sim/residentActivityWorld";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
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
import { createCoreEcologyAggregatePatch } from "./coreEcology";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "./coreEcologyHabitat";
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
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { playerWorldPositionInRegionalWindow, resolveResidentRouteWorldPlacement, resolveResidentWorldPlacement } from "./residentSpatial";
import { createSettlementEcologyState } from "./settlementEcology";
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

// The original fixtures cover native acceptance/departure and coarse placement.
// The later v7 fixture adds lower-engine/adaptor physical pickup and same-interval
// route motion, not runtime activation, a complete journey or destination handoff.
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

const PHYSICAL_BASE = createWorld("runtime baseline estuary", "wild");
const PHYSICAL_HABITAT = deriveCoreEcologyHarborEdgeHabitatAssemblage({
  rootSeed: PHYSICAL_BASE.meta.rootSeed, originRegion: createRegionCoord(0, 0),
});
const PHYSICAL_PATCH = createCoreEcologyAggregatePatch({
  seed: PHYSICAL_BASE.meta.rootSeed, patchKey: "working-people-physical-departure:v1",
  originRegion: createRegionCoord(0, 0), tick: PHYSICAL_BASE.meta.completedTick,
  populations: PHYSICAL_HABITAT.populations.flatMap((population) => (
    population.representation !== "individual-representatives" || population.populationUnits === 0 ? [] : [{
      species: population.species, populationKey: population.populationKey,
      populationSize: population.populationUnits,
      members: population.allocations.map((allocation) => ({
        populationOrdinal: allocation.allocationOrdinal, representedUnits: allocation.representedUnits,
        position: allocation.position, materialization: "coarse" as const,
      })),
    }]
  )),
  derivation: { kind: "habitat-v2", habitat: PHYSICAL_HABITAT },
});
const PHYSICAL_WINDOW = { origin: { x: 0, y: 0 }, terrain: { width: 120, height: 120 } };

function physicalDepartureFixture() {
  const state = structuredClone(PHYSICAL_BASE);
  const initialTick = state.meta.completedTick;
  state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: initialTick + 1_000 };
  for (const resident of state.residents) {
    // Prevent unrelated service centering before native automatic acceptance.
    // The resulting actual Promise remains the higher-priority commitment.
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  const contract = state.contracts.find(({ id }) => id === 127);
  if (contract === undefined) throw new Error("Native estuary heavy offer127 is absent");
  expect(contract).toMatchObject({ status: "offered", resource: "parts", quantity: 8,
    carrierKind: null, assignedResidentId: null, cargoQuantity: 0 });
  contract.playerExclusiveUntilTick = initialTick;
  const origin = state.settlements.find(({ id }) => id === contract.originSettlementId)!;
  const stock = origin.inventory[contract.resource];
  const ledger = structuredClone(state.ledger);
  assertWorldInvariants(state);
  stepWorld(state);
  expect(contract).toMatchObject({ status: "accepted", acceptedTick: initialTick + 1,
    carrierKind: "resident", cargoQuantity: 0, departedTick: null });
  expect(origin.inventory[contract.resource]).toBe(stock);
  if (contract.assignedResidentId === null) throw new Error("Native engine did not choose the heavy porter");
  const id = contract.assignedResidentId;
  const chosen = residentAt(state, id);
  const source = resolveResidentWorldPlacement(state, chosen)?.position;
  const binding = residentAcceptedPickupBinding(state, chosen);
  if (source === undefined || binding === null) throw new Error("Accepted native porter has no pickup geometry");
  expect(source).not.toEqual(binding.target);
  expect(residentRestTargetHasDrySupport(state, source)).toBe(true);
  expect(residentRestTargetHasDrySupport(state, binding.target)).toBe(true);
  const store = createSettlementEcologyState({
    rootSeed: state.meta.rootSeed, settlementId: chosen.homeSettlementId,
    keeperActorId: chosen.identity.stableId, position: binding.target, aggregatePatch: PHYSICAL_PATCH,
  });
  expect(adoptResidentActivities(state)).toBe(true);
  expect(prepareResidentRestActivities(state, [], store)).toBe(true);
  expect(state.residents.every(({ activity }) => activity?.version === RESIDENT_TRAVEL_ACTIVITY_VERSION)).toBe(true);
  expect(residentAt(state, id).activity?.pickupTask).toMatchObject({ contractId: contract.id, phase: "approaching" });
  let moved = false;
  for (let phase = 1; phase <= 10; phase += 1) {
    const result = advanceResidentRestActivities(state, phase, PHYSICAL_WINDOW);
    expect(result).not.toBeNull();
    moved ||= result?.movedActorIds.includes(chosen.identity.stableId) ?? false;
    expect(origin.inventory[contract.resource]).toBe(stock);
    expect(contract.cargoQuantity).toBe(0);
  }
  expect(moved).toBe(true);
  expect(residentAt(state, id).activity?.pickupTask?.phase).toBe("arrived");
  expect(residentAt(state, id).activity?.poses.at(-1)?.position).toEqual(binding.target);
  const closing = prepareResidentTravelAdvance(state, PHYSICAL_WINDOW);
  expect(closing).not.toBeNull();
  try { stepWorld(state, [], undefined, undefined, closing!); }
  finally { revokeResidentTravelAdvance(closing!); }
  expect(contract).toMatchObject({ status: "in-transit", cargoQuantity: contract.quantity,
    departedTick: state.meta.completedTick });
  expect(origin.inventory[contract.resource]).toBe(stock - contract.quantity);
  expect(state.ledger).toEqual(ledger);
  expect(residentAt(state, id).activity?.travelTask).toMatchObject({ mode: "physical", contractId: contract.id });
  const departures = state.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === contract.id);
  expect(departures).toHaveLength(1);
  const event = departures[0]!;
  const world = createWorldView(state);
  const intent = workingPeopleExpressionIntent({ world, event });
  if (intent === null) throw new Error("Real physical heavy departure did not derive its fresh speech");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduction.accepted || reduction.event === null || reduction.state?.recent[0] === undefined) {
    throw new Error("Physical departure speech was not accepted");
  }
  const address = workingPeopleExpressionSourceAddressForTrigger(world, intent.triggerEventId);
  if (address === null) throw new Error("Physical departure has no captured source");
  expect(address.position).toEqual(binding.target);
  assertWorldInvariants(state);
  return { state, id, contractId: contract.id, event, intent, address,
    expression: reduction.event, memory: reduction.state.recent[0] };
}

function advancePhysicalDeparture(current: ReturnType<typeof physicalDepartureFixture>, phase: number): void {
  for (let next = residentAt(current.state, current.id).activity!.poses.length; next <= phase; next += 1) {
    expect(advanceResidentRestActivities(current.state, next, PHYSICAL_WINDOW)).not.toBeNull();
  }
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

describe("retained heavy departure during real physical route progress", () => {
  it("keeps the captured source and cold event/memory rederivation through actual phase4/9 movement", () => {
    const current = physicalDepartureFixture();
    const eventBytes = stableStringify(current.event);
    expect(residentAt(current.state, current.id).activity?.poses).toHaveLength(1);
    for (const phase of [4, 9]) {
      advancePhysicalDeparture(current, phase);
      const human = residentAt(current.state, current.id);
      expect(human.activity?.poses).toHaveLength(phase + 1);
      expect(human.activity?.poses.at(-1)?.position).not.toEqual(current.address.position);
      expect(human.location.kind).toBe("route");
      expect(stableStringify(current.event)).toBe(eventBytes);
      expect(current.state.meta.completedTick).toBe(current.event.tick);
      const text = serializeWorld(current.state);
      const restored = deserializeWorld(text);
      expect(serializeWorld(restored)).toBe(text);
      expect(restored.events).toEqual(current.state.events);
      expect(restored.contracts).toEqual(current.state.contracts);
      expect(residentAt(restored, current.id).activity).toEqual(human.activity);
      expect(residentAt(restored, current.id).activity).not.toBe(human.activity);
      for (const state of [current.state, restored]) {
        const world = createWorldView(state);
        const before = serializeWorld(state);
        expect(workingPeopleExpressionIntent({ world, event: current.event })).toBeNull();
        expect(workingPeopleExpressionEventForTrigger(world, current.intent.triggerEventId)).toEqual(current.expression);
        expect(workingPeopleExpressionEventMatchesWorld(world, current.expression)).toBe(true);
        expect(workingPeopleExpressionMemoryMatchesWorld(world, current.memory)).toBe(true);
        expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId)).toEqual(current.address);
        expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId)?.position)
          .not.toEqual(livingActorAddressForResident(world, residentAt(state, current.id))?.position);
        expect(serializeWorld(state)).toBe(before);
        assertWorldInvariants(state);
      }
    }
  });

  it("does not select delayed fresh speech even when an accepted phase retained the exact endpoint", () => {
    const current = physicalDepartureFixture();
    // A lower adapter with no admitted local window retains the body. This is
    // a real accepted phase, not an authored pose or a macro-progress claim.
    expect(advanceResidentRestActivities(current.state, 1)).not.toBeNull();
    const human = residentAt(current.state, current.id);
    expect(human.activity?.poses).toHaveLength(2);
    expect(human.activity?.poses.at(-1)?.position).toEqual(current.address.position);
    const world = createWorldView(current.state);
    expect(workingPeopleExpressionIntent({ world, event: current.event })).toBeNull();
    expect(workingPeopleExpressionEventMatchesWorld(world, current.expression)).toBe(true);
    expect(workingPeopleExpressionMemoryMatchesWorld(world, current.memory)).toBe(true);
    expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId)).toEqual(current.address);
  });

  it("rejects wrong commitment/cursor/body/custody and absent or altered captured sources without fallback", () => {
    const current = physicalDepartureFixture();
    advancePhysicalDeparture(current, 4);
    const original = createWorldView(current.state);
    const foreignContractId = original.contracts.find(({ id }) => id !== current.contractId)!.id;
    const human = (world: WorldView) => world.residents.find(({ id }) => id === current.id)!;
    const commitment = (world: WorldView) => world.contracts.find(({ id }) => id === current.contractId)!;
    const changeTask = (world: WorldView, changes: Partial<ResidentPhysicalTravelTask>) => {
      const resident = human(world);
      resident.activity = { ...resident.activity!, travelTask: {
        ...(resident.activity!.travelTask as ResidentPhysicalTravelTask), ...changes,
      } };
    };
    // Deliberately malformed public-call clones, not alternative legal saves.
    const contrasts: Array<readonly [string, (world: WorldView) => void]> = [
      ["wrong active contract", (world) => { human(world).activeContractId = foreignContractId; }],
      ["wrong task contract", (world) => { changeTask(world, { contractId: foreignContractId }); }],
      ["wrong leg", (world) => { changeTask(world, { legIndex: 1 }); }],
      ["wrong waypoint", (world) => { changeTask(world, { waypointIndex: 2 }); }],
      ["wrong selection tick", (world) => { changeTask(world, { selectedAtTick: current.event.tick - 1 }); }],
      ["lost active custody", (world) => { human(world).activeContractId = null; }],
      ["lost cargo", (world) => { commitment(world).cargoQuantity = 0; }],
      ["wrong resident assignment", (world) => { commitment(world).assignedResidentId = world.residents.find(({ id }) => id !== current.id)!.id; }],
      ["missing task", (world) => { human(world).activity = { ...human(world).activity!, travelTask: null }; }],
      ["off-edge current body", (world) => {
        const resident = human(world);
        const poses = [...resident.activity!.poses];
        const last = poses.at(-1)!;
        poses[poses.length - 1] = { ...last, position: { ...last.position,
          localX: last.position.localX + 1, localY: last.position.localY + 1 } };
        resident.activity = { ...resident.activity!, poses };
      }],
      ["changed captured anchor heading", (world) => {
        const resident = human(world);
        const poses = [...resident.activity!.poses];
        poses[0] = { ...poses[0]!, heading: (poses[0]!.heading + 1) % FIXED_POINT };
        resident.activity = { ...resident.activity!, poses };
      }],
      ["backward retained intermediate pose", (world) => {
        const resident = human(world);
        const poses = [...resident.activity!.poses];
        poses[1] = poses[3]!;
        resident.activity = { ...resident.activity!, poses };
      }],
      ["wrong coarse membership", (world) => {
        const resident = human(world);
        if (resident.location.kind !== "route") throw new Error("Physical fixture lost its route");
        resident.location.progress += 1;
      }],
      ["missing source resident", (world) => { world.residents = world.residents.filter(({ id }) => id !== current.id); }],
      ["missing committed event", (world) => { world.events = world.events.filter(({ sequence }) => sequence !== current.event.sequence); }],
      ["missing captured body extension", (world) => {
        const event = world.events.find(({ sequence }) => sequence === current.event.sequence)!;
        for (const key of RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS) delete event.data[key];
      }],
      ["changed captured source", (world) => {
        const event = world.events.find(({ sequence }) => sequence === current.event.sequence)!;
        event.data.eventBodyHeading = ((event.data.eventBodyHeading as number) + 1) % FIXED_POINT;
      }],
    ];
    for (const [name, mutate] of contrasts) {
      const world = structuredClone(original);
      mutate(world);
      const before = stableStringify(world);
      expect(workingPeopleExpressionIntent({ world, event: current.event }), name).toBeNull();
      expect(workingPeopleExpressionEventForTrigger(world, current.intent.triggerEventId), name).toBeNull();
      expect(workingPeopleExpressionEventMatchesWorld(world, current.expression), name).toBe(false);
      expect(workingPeopleExpressionMemoryMatchesWorld(world, current.memory), name).toBe(false);
      expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId), name).toBeNull();
      expect(stableStringify(world), name).toBe(before);
    }
  });

  it("does not extend retained physical speech authority into another civil-minute interval", () => {
    const current = physicalDepartureFixture();
    advancePhysicalDeparture(current, 10);
    const closing = prepareResidentTravelAdvance(current.state, PHYSICAL_WINDOW);
    expect(closing).not.toBeNull();
    try { stepWorld(current.state, [], undefined, undefined, closing!); }
    finally { revokeResidentTravelAdvance(closing!); }
    expect(current.state.meta.completedTick).toBe(current.event.tick + 1);
    expect(current.state.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === current.contractId)).toHaveLength(1);
    const world = createWorldView(current.state);
    expect(workingPeopleExpressionIntent({ world, event: current.event })).toBeNull();
    expect(workingPeopleExpressionEventForTrigger(world, current.intent.triggerEventId)).toBeNull();
    expect(workingPeopleExpressionMemoryMatchesWorld(world, current.memory)).toBe(false);
    expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId)).toBeNull();
    assertWorldInvariants(current.state);
  });

  it("retains frozen v1 coarse endpoint checks rather than treating coarse progression as physical evidence", () => {
    const current = fixture();
    const world = structuredClone(current.world);
    for (const resident of world.residents) {
      const activity = resident.activity!;
      resident.activity = {
        version: RESIDENT_ACTIVITY_VERSION, ownerId: RESIDENT_ACTIVITY_OWNER_ID,
        actorId: activity.actorId, tick: activity.tick, poses: activity.poses, restTask: activity.restTask,
      };
    }
    // Explicit supported-protocol reconstruction, not new physical movement.
    expect(workingPeopleExpressionIntent({ world, event: current.event })).toEqual(current.intent);
    expect(workingPeopleExpressionEventMatchesWorld(world, current.expression)).toBe(true);
    const resident = world.residents.find(({ id }) => id === current.id)!;
    if (resident.location.kind !== "route") throw new Error("Legacy fixture lost its native route");
    resident.location.progress += 1;
    expect(workingPeopleExpressionIntent({ world, event: current.event })).toBeNull();
    expect(workingPeopleExpressionEventMatchesWorld(world, current.expression)).toBe(false);
    expect(workingPeopleExpressionMemoryMatchesWorld(world, current.memory)).toBe(false);
    expect(workingPeopleExpressionSourceAddressForTrigger(world, current.intent.triggerEventId)).toBeNull();
  });
});
