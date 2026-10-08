import { describe, expect, it } from "vitest";

import {
  assertWorldInvariants, createWorld, createWorldView, deserializeWorld,
  serializeWorld, stepWorld,
} from "../sim/public";
import {
  readResidentActivityEventLocus,
  RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS,
} from "../sim/residentActivityEventLocus";
import type { SimEvent, WorldState, WorldView } from "../sim/types";
import { stableStringify } from "../sim/util";
import { createPlayer } from "./player";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities } from "./residentActivityExecution";
import {
  prepareResidentWeatherHoldEventTimeReceipt,
  residentWeatherHoldAdmissionMatchesWorld,
  residentWeatherHoldReceptionMatchesEventTime,
} from "./residentWeatherHoldAdmissionAuthority";
import {
  residentWeatherHoldExpressionEventForTrigger,
  residentWeatherHoldExpressionEventMatchesWorld,
  residentWeatherHoldExpressionIntent,
  residentWeatherHoldExpressionMemoryMatchesWorld,
} from "./residentWeatherHoldExpression";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSituatedExpressionState, reduceSituatedExpression } from "./situatedExpression";

// Actual native Promise/departure/weather/save owners. Body adoption and this
// source contract remain foundations, not normal runtime adoption or physical
// route transport: native transport still advances through its coarse owner.
const BASE = createWorld("a resident names the weather hold", "standard");
const LEGACY_KEYS = [
  "contractId", "eventRouteId", "eventRouteProgress", "intensity", "routeDelayTicks", "weather",
] as const;

function residentAt(state: WorldState, id: number) {
  const resident = state.residents.find((candidate) => candidate.id === id);
  if (resident === undefined) throw new Error("fixture lost its native resident");
  return resident;
}

function fixture(adopt = true) {
  const state = structuredClone(BASE);
  const contract = state.contracts.find(({ status }) => status === "offered");
  if (contract === undefined) throw new Error("fixture needs a native offered Promise");
  const resident = state.residents.find(({ activeContractId, location }) => (
    activeContractId === null && location.kind === "settlement"
    && location.settlementId === contract.originSettlementId
  ));
  if (resident === undefined) throw new Error("fixture needs a native origin resident");
  const id = resident.id;
  state.weather = {
    kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  stepWorld(state, [{
    id: "body-weather-hold-native-accept", type: "accept-contract",
    carrier: "resident", contractId: contract.id, residentId: id,
  }]);
  stepWorld(state);
  if (contract.status !== "in-transit" || residentAt(state, id).location.kind !== "route") {
    throw new Error("native fixture did not depart");
  }
  if (adopt) {
    expect(adoptResidentActivities(state)).toBe(true);
    for (let phase = 1; phase <= 3; phase += 1) {
      expect(advanceResidentRestActivities(state, phase)).not.toBeNull();
    }
  }
  const before = residentAt(state, id).activity;
  state.weather = {
    kind: "storm", intensity: 950_000, windX: 500_000, windY: -500_000,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  stepWorld(state);
  const triggers = state.events.filter((event) => event.type === "resident-sheltered" && event.subjectId === id);
  const event = triggers[0];
  if (triggers.length !== 1 || event === undefined || !residentAt(state, id).condition.sheltering) {
    throw new Error("native fixture did not enter a unique weather hold");
  }
  const world = createWorldView(state);
  const intent = residentWeatherHoldExpressionIntent({ world, event });
  if (intent === null) throw new Error("native weather-hold event did not derive an expression");
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.event === null || reduced.state === null) {
    throw new Error("native weather-hold intent was not accepted");
  }
  return {
    state, id, contractId: contract.id, before, event, world, intent,
    expression: reduced.event, memory: reduced.state.recent[0]!,
  };
}

function changedCommittedEvent(world: WorldView, event: SimEvent) {
  return {
    ...world,
    events: world.events.map((candidate) => candidate.sequence === event.sequence ? event : candidate),
  };
}

describe("body-captured resident weather-hold source", () => {
  it("captures the genuine new-tick phase-zero body, retaining native cargo, itinerary and memory", () => {
    const current = fixture();
    const resident = residentAt(current.state, current.id);
    const body = resident.activity!;
    const pose = body.poses[0]!;
    expect(current.before?.poses).toHaveLength(4);
    expect(body.poses).toHaveLength(1);
    expect(body.tick).toBe(current.event.tick);
    expect(current.event.tick).toBe(current.before!.tick + 1);
    expect(readResidentActivityEventLocus(current.event.data)).toEqual({
      tick: current.event.tick, phase: 0, position: pose.position, heading: pose.heading,
    });
    expect(current.intent.position).toEqual(pose.position);
    expect(Object.keys(current.event.data).sort()).toEqual([
      ...LEGACY_KEYS, ...RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS,
    ].sort());
    const contract = current.state.contracts.find(({ id }) => id === current.contractId)!;
    expect(contract).toMatchObject({
      status: "in-transit", carrierKind: "resident", assignedResidentId: resident.id,
      cargoQuantity: contract.quantity,
    });
    expect(contract.porterRouteIds).toContain(current.event.data.eventRouteId);
    expect(contract.porterSettlementIds).toHaveLength(contract.porterRouteIds.length + 1);
    expect(resident.memories.filter(({ kind, tick }) => kind === "weather-shelter" && tick === current.event.tick))
      .toEqual([{
        id: `${resident.identity.stableId}:weather-shelter:${current.event.tick}`,
        kind: "weather-shelter", tick: current.event.tick, cause: "SEVERE_WEATHER",
      }]);
    assertWorldInvariants(current.state);
  });

  it("keeps speech at its committed source through actual coarse resume and exact detached save", () => {
    const current = fixture();
    const originalBytes = stableStringify(current.event);
    current.state.weather = {
      kind: "clear", intensity: 0, windX: 0, windY: 0,
      nextChangeTick: current.state.meta.completedTick + 1_000,
    };
    stepWorld(current.state);
    expect(resolveResidentWorldPlacement(current.state, residentAt(current.state, current.id))?.position)
      .not.toEqual(current.expression.position);
    expect(stableStringify(current.event)).toBe(originalBytes);
    const text = serializeWorld(current.state);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    expect(restored.events).toEqual(current.state.events);
    const world = createWorldView(restored);
    expect(residentWeatherHoldExpressionEventMatchesWorld(world, current.expression)).toBe(true);
    expect(residentWeatherHoldExpressionMemoryMatchesWorld(world, current.memory)).toBe(true);
    expect(residentWeatherHoldExpressionEventForTrigger(world, current.expression.triggerEventId))
      .toEqual(current.expression);
    expect(residentWeatherHoldExpressionEventForTrigger(world, current.expression.triggerEventId)?.position)
      .toEqual(current.expression.position);
    assertWorldInvariants(restored);
  });

  it("accepts exactly the observed body variant without changing its expression or dropping playerObserved", () => {
    const current = fixture();
    current.event.data.playerObserved = true;
    const world = createWorldView(current.state);
    expect(Object.keys(current.event.data)).toHaveLength(15);
    expect(residentWeatherHoldExpressionIntent({ world, event: current.event })).toEqual(current.intent);
    expect(residentWeatherHoldExpressionEventMatchesWorld(world, current.expression)).toBe(true);
    const text = serializeWorld(current.state);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    const event = restored.events.find(({ sequence }) => sequence === current.event.sequence)!;
    expect(event.data.playerObserved).toBe(true);
    expect(Object.keys(event.data)).toHaveLength(15);
    expect(residentWeatherHoldExpressionEventForTrigger(createWorldView(restored), current.expression.triggerEventId))
      .toEqual(current.expression);
  });

  it("admits actual body speech at phase zero through the existing lawful sensory owner", () => {
    const current = fixture();
    const window = createRegionalTerrainWindow(current.state.meta.rootSeed,
      createTerrainRegionStreamingState({ rootSeed: current.state.meta.rootSeed }));
    const spatialWorld = createRegionalWorldView(current.world, window,
      projectRegionalCartographyWindow(createRegionalCartography(current.state.meta.rootSeed), window));
    const resident = residentAt(current.state, current.id);
    const player = createPlayer(current.world, resident.homeSettlementId);
    const x = current.expression.position.localX - window.origin.x * 1_000;
    const y = current.expression.position.localY - window.origin.y * 1_000;
    Object.assign(player, {
      x, y, previousX: x, previousY: y,
      worldWidth: window.terrain.width, worldHeight: window.terrain.height,
    });
    const input = {
      economyWorld: current.world, spatialWorld, window, playerTemplate: player,
      listenerWasSleepingAtIntervalStart: false, event: current.expression,
    };
    const receipt = prepareResidentWeatherHoldEventTimeReceipt({ ...input, sampleOrdinal: 0 });
    expect(receipt).not.toBeNull();
    expect(receipt?.admission.admittedAtPlayerStepPhase).toBe(0);
    expect(readResidentActivityEventLocus(current.event.data)?.phase).toBe(0);
    expect(residentWeatherHoldAdmissionMatchesWorld({ ...input, admission: receipt!.admission })).toBe(true);
    expect(residentWeatherHoldReceptionMatchesEventTime({
      ...input, admission: receipt!.admission, reception: receipt!.reception,
    })).toBe(true);
    expect(receipt!.reception).not.toHaveProperty("name");
    expect(receipt!.reception).not.toHaveProperty("homeName");
  });

  it("rejects incomplete, malformed or wrong-time explicit body extensions rather than using the old route locus", () => {
    const current = fixture();
    for (const key of RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS) {
      const event = structuredClone(current.event);
      delete event.data[key];
      expect(residentWeatherHoldExpressionIntent({ world: changedCommittedEvent(current.world, event), event }), key)
        .toBeNull();
    }
    for (const [key, value] of [
      ["eventBodyVersion", 2], ["eventBodyPhase", 1], ["eventBodyPhase", -0],
      ["eventBodyTick", current.event.tick - 1], ["eventBodyTick", current.event.tick + 1],
      ["eventBodyHeading", 1_000_000], ["eventBodyLocalX", 120_000], ["eventBodyLocalY", -1],
      ["eventBodyRegionX", -0], ["unknownBodyField", 1], ["playerObserved", false],
    ] as const) {
      const event = structuredClone(current.event);
      event.data[key] = value;
      expect(residentWeatherHoldExpressionIntent({ world: changedCommittedEvent(current.world, event), event }), `${key}:${value}`)
        .toBeNull();
    }
    const event = structuredClone(current.event);
    Object.defineProperty(event.data, Symbol("untrusted body extension"), { value: true, enumerable: true });
    expect(residentWeatherHoldExpressionIntent({ world: changedCommittedEvent(current.world, event), event })).toBeNull();
  });

  it("requires exact committed scalar data and rejects an expression relocated from its authentic trigger", () => {
    const current = fixture();
    for (const key of RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS) {
      const event = structuredClone(current.event);
      const value = event.data[key] as number;
      event.data[key] = key === "eventBodyHeading" ? (value + 1) % 1_000_000 : value + 1;
      expect(residentWeatherHoldExpressionIntent({ world: current.world, event }), key).toBeNull();
    }
    const event = structuredClone(current.event);
    event.data.eventBodyLocalX = (event.data.eventBodyLocalX as number) + 1;
    expect(residentWeatherHoldExpressionEventMatchesWorld(changedCommittedEvent(current.world, event), current.expression))
      .toBe(false);
  });

  it("preserves exact legacy six/seven-field events and their derivation after later body adoption", () => {
    const current = fixture(false);
    expect(Object.keys(current.event.data).sort()).toEqual([...LEGACY_KEYS].sort());
    expect(readResidentActivityEventLocus(current.event.data)).toBeNull();
    const bytes = stableStringify(current.event);
    expect(adoptResidentActivities(current.state)).toBe(true);
    expect(stableStringify(current.event)).toBe(bytes);
    expect(residentWeatherHoldExpressionIntent({ world: createWorldView(current.state), event: current.event }))
      .toEqual(current.intent);
    current.event.data.playerObserved = true;
    expect(Object.keys(current.event.data)).toHaveLength(7);
    const observedBytes = stableStringify(current.event);
    expect(residentWeatherHoldExpressionIntent({ world: createWorldView(current.state), event: current.event }))
      .toEqual(current.intent);
    const text = serializeWorld(current.state);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    const event = restored.events.find(({ sequence }) => sequence === current.event.sequence)!;
    expect(stableStringify(event)).toBe(observedBytes);
    expect(residentWeatherHoldExpressionEventForTrigger(createWorldView(restored), current.expression.triggerEventId))
      .toEqual(current.expression);
  });
});
