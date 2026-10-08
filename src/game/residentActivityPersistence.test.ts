import { describe, expect, it } from "vitest";

import { findAutonomousRoutePlan } from "../sim/network";
import {
  assertWorldInvariants, createWorld, createWorldView, deserializeWorld,
  serializeWorld, stepWorld, STRAND_AUTOMATION_THRESHOLD,
} from "../sim/public";
import { RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS } from "../sim/residentActivityEventLocus";
import { RESIDENT_ACTIVITY_OWNER_ID, RESIDENT_ACTIVITY_VERSION, RESIDENT_SERVICE_ACTIVITY_OWNER_ID, RESIDENT_SERVICE_ACTIVITY_VERSION } from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import type { SimEvent, WorldState } from "../sim/types";
import { stableStringify } from "../sim/util";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { residentActivitySaveExtensionsValid } from "./residentActivitySaveBoundary";
import { residentIntroductionExpressionIntent } from "./residentIntroductionExpression";
import { residentWeatherHoldExpressionIntent } from "./residentWeatherHoldExpression";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { FIRST_RESIDENT_ACTIVITY_GAME_SAVE_VERSION, FIRST_RESIDENT_SERVICE_GAME_SAVE_VERSION, FIRST_RESIDENT_CIVIC_GAME_SAVE_VERSION } from "./saveCompatibilityPolicy";
import { workingPeopleExpressionIntent } from "./workingPeopleExpression";
import { worldPositionDelta } from "./worldPosition";

// Save-capability boundary evidence from native domain/adoption owners. These
// tests neither activate runtime bodies nor claim a normal-play migration.
const REST_BASE = createWorld("resident activity executable rest approach", "standard");
const TRANSPORT_BASE = createWorld("first lantern", "standard");

function clearWeather(world: WorldState): void {
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: world.meta.completedTick + 1_000 };
}

function restFixture(phase = 0): WorldState {
  const world = structuredClone(REST_BASE);
  clearWeather(world);
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = world.meta.completedTick + 1_000;
    contract.dueTick = world.meta.completedTick + 2_000;
  }
  const chosen = world.residents.find((resident) => {
    const source = resolveResidentWorldPlacement(world, resident)?.position;
    const target = residentSettlementRestTarget(world, resident);
    if (!source || !target || !residentRestTargetHasDrySupport(world, source)
      || !residentRestTargetHasDrySupport(world, target)) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === 1_000;
  });
  if (!chosen) throw new Error("native fixture needs a dry one-tile rest approach");
  chosen.needs.rest = 900_000;
  chosen.condition.exhaustion = 300_000;
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world)).toBe(true);
  for (let step = 1; step <= phase; step += 1) {
    expect(advanceResidentRestActivities(world, step)).not.toBeNull();
  }
  return world;
}

function rationFixture(phase = 0): WorldState {
  const world = restFixture();
  const chosen = world.residents.find((resident) => resident.activity?.restTask?.cause === "urgent-rest")!;
  chosen.needs.rest = 100_000;
  chosen.condition.exhaustion = 100_000;
  chosen.needs.food = 900_000;
  expect(prepareResidentRestActivities(world)).toBe(true);
  expect(world.residents.find(({ id }) => id === chosen.id)?.activity?.rationTask?.phase).toBe("approaching");
  for (let step = 1; step <= phase; step += 1) {
    expect(advanceResidentRestActivities(world, step)).not.toBeNull();
  }
  return world;
}

function preServiceFixture(): WorldState {
  const world = restFixture(1);
  // A deliberate frozen-v1 cold-format reconstruction of the genuine body/rest
  // fixture, not a released outer-session artifact or a physical meal witness.
  for (const resident of world.residents) {
    const { rationTask, materialTask: _materialTask, ...activity } = resident.activity!;
    expect(rationTask).toBeNull();
    resident.activity = { ...activity, version: RESIDENT_ACTIVITY_VERSION, ownerId: RESIDENT_ACTIVITY_OWNER_ID };
  }
  return world;
}

/** Explicit v2 codec reconstruction, not a released or normal-play artifact. */
function preCivicFixture(world: WorldState): WorldState {
  for (const resident of world.residents) {
    const { materialTask: _materialTask, ...activity } = resident.activity!;
    resident.activity = { ...activity, version: RESIDENT_SERVICE_ACTIVITY_VERSION, ownerId: RESIDENT_SERVICE_ACTIVITY_OWNER_ID };
  }
  return world;
}

function introductionFixture() {
  const world = structuredClone(REST_BASE);
  clearWeather(world);
  const id = world.residents[0]!.id;
  stepWorld(world, [{ id: "save-body-observe", type: "observe-resident", residentId: id }]);
  const observedTick = world.residents.find((resident) => resident.id === id)!.playerKnowledge.firstObservedTick!;
  expect(adoptResidentActivities(world)).toBe(true);
  for (let phase = 1; phase <= 3; phase += 1) expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
  stepWorld(world, [{ id: "save-body-greet", type: "greet-resident", residentId: id, observedTick }]);
  const event = world.events.find((candidate) => candidate.type === "resident-introduced" && candidate.subjectId === id);
  if (!event || !residentIntroductionExpressionIntent({ world: createWorldView(world), event })) {
    throw new Error("native observed greeting must commit its body source");
  }
  return { world, event, id };
}

function transportFixture() {
  const world = structuredClone(TRANSPORT_BASE);
  clearWeather(world);
  for (const route of world.routes) {
    route.traceStrength = Math.max(route.traceStrength, STRAND_AUTOMATION_THRESHOLD);
    route.condition = Math.max(route.condition, 180_000);
  }
  const contract = world.contracts.find((candidate) => candidate.status === "offered"
    && findAutonomousRoutePlan(world, candidate.originSettlementId, candidate.destinationSettlementId) !== undefined);
  const origin = world.settlements.find(({ id }) => id === contract?.originSettlementId);
  const resident = world.residents.find((candidate) => candidate.activeContractId === null
    && candidate.location.kind === "settlement"
    && candidate.location.settlementId === contract?.originSettlementId);
  if (!contract || !origin || !resident) throw new Error("native fixture needs an offered routed Promise and porter");
  // The existing heavy-load characterization conserves any added origin stock;
  // acceptance/departure, rather than this fixture, transfers physical custody.
  contract.resource = "parts";
  contract.quantity = 1;
  if (origin.inventory.parts < 1) {
    world.ledger.initial.parts += 1 - origin.inventory.parts;
    origin.inventory.parts = 1;
  }
  stepWorld(world, [{ id: "save-body-accept", type: "accept-contract", carrier: "resident",
    contractId: contract.id, residentId: resident.id }]);
  expect(contract.status).toBe("accepted");
  expect(adoptResidentActivities(world)).toBe(true);
  stepWorld(world);
  const departure = world.events.find((event) => event.type === "contract-departed" && event.subjectId === contract.id);
  if (!departure || !workingPeopleExpressionIntent({ world: createWorldView(world), event: departure })) {
    throw new Error("native heavy departure must commit a body source");
  }
  world.weather = { kind: "storm", intensity: 950_000, windX: 500_000, windY: -500_000,
    nextChangeTick: world.meta.completedTick + 1_000 };
  stepWorld(world);
  const shelter = world.events.find((event) => event.type === "resident-sheltered" && event.subjectId === resident.id);
  if (!shelter || !residentWeatherHoldExpressionIntent({ world: createWorldView(world), event: shelter })) {
    throw new Error("native storm hold must commit a body source");
  }
  return { world, departure, shelter, contractId: contract.id, residentId: resident.id };
}

function eventAt(world: WorldState, sequence: number): SimEvent {
  const event = world.events.find((candidate) => candidate.sequence === sequence);
  if (!event) throw new Error("fixture lost its retained committed event");
  return event;
}

describe("resident body save capability and retained event source validation", () => {
  it("keeps genuine whole-roster absence unchanged in both capability eras", () => {
    const world = structuredClone(REST_BASE);
    const bytes = serializeWorld(world);
    for (const supportsBodies of [false, true]) {
      expect(residentActivitySaveExtensionsValid(world, supportsBodies)).toBe(true);
      expect(world.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
      expect(serializeWorld(world)).toBe(bytes);
    }
  });

  it.each([0, 1, 9])("accepts authentic complete bodies at phase%s only in the body-capable era without mutation", (phase) => {
    const world = restFixture(phase);
    const bytes = serializeWorld(world);
    const root = world.residents;
    const restored = deserializeWorld(bytes);
    for (const candidate of [world, structuredClone(world), restored]) {
      expect(residentActivitySaveExtensionsValid(candidate, true, true, true)).toBe(true);
      expect(residentActivitySaveExtensionsValid(candidate, false)).toBe(false);
      expect(serializeWorld(candidate)).toBe(bytes);
    }
    expect(world.residents).toBe(root);
    expect(restored.residents[0]!.activity).not.toBe(world.residents[0]!.activity);
  });

  it("retains exact cold v1 body/rest bytes under body51 without service capability", () => {
    const world = preServiceFixture();
    const bytes = serializeWorld(world);
    for (const candidate of [world, structuredClone(world), deserializeWorld(bytes)]) {
      expect(residentActivitySaveExtensionsValid(candidate, true)).toBe(true);
      expect(residentActivitySaveExtensionsValid(candidate, true, false)).toBe(true);
      expect(residentActivitySaveExtensionsValid(candidate, true, true)).toBe(true);
      expect(residentActivitySaveExtensionsValid(candidate, false, true)).toBe(false);
      expect(candidate.residents.every((resident) => resident.activity?.version === 1
        && !Object.hasOwn(resident.activity!, "rationTask"))).toBe(true);
      expect(serializeWorld(candidate)).toBe(bytes);
    }
  });

  it("requires service52 capability for v2 rather than body51 alone", () => {
    expect(FIRST_RESIDENT_ACTIVITY_GAME_SAVE_VERSION).toBe(51);
    expect(FIRST_RESIDENT_SERVICE_GAME_SAVE_VERSION).toBe(52);
    // These are the shared outer-capability predicates, not complete session
    // envelope load/relaunch evidence.
    for (const world of [preCivicFixture(restFixture(1)), preCivicFixture(rationFixture(1))]) {
      const bytes = serializeWorld(world);
      for (const candidate of [world, structuredClone(world), deserializeWorld(bytes)]) {
        expect(residentActivitySaveExtensionsValid(candidate, true)).toBe(false);
        expect(residentActivitySaveExtensionsValid(candidate, true, false)).toBe(false);
        expect(residentActivitySaveExtensionsValid(candidate, true, true)).toBe(true);
        expect(residentActivitySaveExtensionsValid(candidate, false, true)).toBe(false);
        expect(serializeWorld(candidate)).toBe(bytes);
      }
    }
  });

  it("requires civic53 capability for current v3 including explicit null material state", () => {
    expect(FIRST_RESIDENT_CIVIC_GAME_SAVE_VERSION).toBe(53);
    for (const world of [restFixture(1), rationFixture(1)]) {
      const bytes = serializeWorld(world);
      for (const candidate of [world, structuredClone(world), deserializeWorld(bytes)]) {
        expect(residentActivitySaveExtensionsValid(candidate, true, true)).toBe(false);
        expect(residentActivitySaveExtensionsValid(candidate, true, true, true)).toBe(true);
        expect(residentActivitySaveExtensionsValid(candidate, true, false, true)).toBe(false);
        expect(serializeWorld(candidate)).toBe(bytes);
      }
    }
  });

  it("rejects a ration field smuggled through v1 even when it is null", () => {
    const ration = rationFixture().residents.find((resident) => resident.activity?.rationTask != null)!.activity!.rationTask;
    for (const rationTask of [null, ration]) {
      const world = preServiceFixture();
      Object.assign(world.residents[0]!.activity!, { rationTask });
      const before = structuredClone(world);
      expect(residentActivitySaveExtensionsValid(world, true, false)).toBe(false);
      expect(residentActivitySaveExtensionsValid(world, true, true)).toBe(false);
      expect(world).toEqual(before);
    }
  });

  it("rejects v2 task exclusivity, missing fields, target and timing forgeries without fallback", () => {
    const source = preCivicFixture(rationFixture(10));
    const index = source.residents.findIndex((resident) => resident.activity?.rationTask != null);
    const admitted = source.residents[index]!.activity!.rationTask!;
    expect(admitted.phase).toBe("arrived");
    const rest = restFixture().residents.find(({ id }) => id === source.residents[index]!.id)!.activity!.restTask;
    expect(rest).not.toBeNull();
    const mutations: Array<(candidate: WorldState) => void> = [
      (candidate) => { Reflect.deleteProperty(candidate.residents[index]!.activity!, "rationTask"); },
      (candidate) => { Object.assign(candidate.residents[index]!.activity!, { rationTask: undefined }); },
      (candidate) => { Object.assign(candidate.residents[index]!.activity!, { restTask: structuredClone(rest) }); },
      (candidate) => {
        const target = candidate.residents[index]!.activity!.rationTask!.target;
        Object.assign(target, { localX: target.localX + 1 });
      },
      (candidate) => { Object.assign(candidate.residents[index]!.activity!.rationTask!, { selectedAtTick: candidate.meta.completedTick + 1 }); },
      (candidate) => { Object.assign(candidate.residents[index]!.activity!.rationTask!, { lastProgressAtTick: candidate.meta.completedTick + 1 }); },
      (candidate) => { Object.assign(candidate.residents[index]!.activity!.rationTask!, { phase: "used", usedAtTick: candidate.meta.completedTick, foodUsed: true }); },
      (candidate) => { Object.assign(candidate.residents[index]!.activity!.rationTask!, { phase: "used", usedAtTick: candidate.meta.completedTick + 60, foodUsed: true }); },
      (candidate) => { Object.assign(candidate.residents[index]!.activity!.rationTask!, { phase: "used", usedAtTick: candidate.meta.completedTick - 1, foodUsed: true }); },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(source);
      mutate(candidate);
      const before = structuredClone(candidate);
      expect(residentActivitySaveExtensionsValid(candidate, true, true)).toBe(false);
      expect(candidate).toEqual(before);
    }
  });

  it("rejects a hostile version descriptor without executing its getter in either capability", () => {
    const world = structuredClone(restFixture());
    let reads = 0;
    Object.defineProperty(world.residents[0]!.activity!, "version", {
      enumerable: true,
      get() { reads += 1; return 2; },
    });
    expect(residentActivitySaveExtensionsValid(world, true, false)).toBe(false);
    expect(residentActivitySaveExtensionsValid(world, true, true)).toBe(false);
    expect(residentActivitySaveExtensionsValid(world, true, true, true)).toBe(false);
    expect(reads).toBe(0);
  });

  it("rejects mixed civic/coarse mode before mutation, while retaining supported v1/v2 mixtures", () => {
    const current = structuredClone(restFixture(1));
    const { materialTask: _material, ...oldService } = current.residents[0]!.activity!;
    current.residents[0]!.activity = {
      ...oldService, version: RESIDENT_SERVICE_ACTIVITY_VERSION, ownerId: RESIDENT_SERVICE_ACTIVITY_OWNER_ID,
    };
    const before = stableStringify(current);
    expect(residentActivitySaveExtensionsValid(current, true, true, true)).toBe(false);
    expect(() => assertWorldInvariants(current)).toThrow(/whole-roster mode/u);
    expect(() => stepWorld(current)).toThrow(/whole-roster mode/u);
    expect(stableStringify(current)).toBe(before);

    const supported = preCivicFixture(restFixture(1));
    const { rationTask: _ration, ...oldBody } = supported.residents[0]!.activity!;
    supported.residents[0]!.activity = { ...oldBody, version: RESIDENT_ACTIVITY_VERSION, ownerId: RESIDENT_ACTIVITY_OWNER_ID };
    expect(() => assertWorldInvariants(supported)).not.toThrow();
    expect(residentActivitySaveExtensionsValid(supported, true, true, true)).toBe(true);
    expect(serializeWorld(deserializeWorld(serializeWorld(supported)))).toBe(serializeWorld(supported));
  });

  it("rejects partial, malformed, foreign-tick bodies and missing or contradictory rest authority without repair", () => {
    const world = restFixture(1);
    const mutations: Array<(candidate: WorldState) => void> = [
      (candidate) => { delete candidate.residents.at(-1)!.activity; },
      (candidate) => { Object.assign(candidate.residents[0]!, { activity: null }); },
      (candidate) => { Object.assign(candidate.residents[0]!, { activity: undefined }); },
      (candidate) => { Object.assign(candidate.residents[0]!.activity!, { tick: candidate.meta.completedTick + 1 }); },
      (candidate) => { Object.assign(candidate.residents[0]!.activity!, { actorId: candidate.residents[1]!.identity.stableId }); },
      (candidate) => { delete candidate.residents[0]!.circadian; },
      (candidate) => {
        const resident = candidate.residents.find((value) => value.activity?.restTask !== null)!;
        Object.assign(resident.activity!.restTask!.target, { localX: resident.activity!.restTask!.target.localX + 1 });
      },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(world);
      mutate(candidate);
      const before = structuredClone(candidate);
      expect(residentActivitySaveExtensionsValid(candidate, true, true, true)).toBe(false);
      expect(candidate).toEqual(before);
    }
  });

  it("accepts a genuine retained introduction after its bounded live-memory cause is absent", () => {
    const current = introductionFixture();
    expect(residentActivitySaveExtensionsValid(current.world, true, true, true)).toBe(true);
    const resident = current.world.residents.find(({ id }) => id === current.id)!;
    // Explicit cold-boundary counterfactual for bounded historical memory,
    // not a claim that this short fixture executes the memory pruning policy.
    resident.memories = resident.memories.filter(({ kind }) => kind !== "met-player");
    assertWorldInvariants(current.world);
    expect(residentIntroductionExpressionIntent({ world: createWorldView(current.world), event: current.event })).toBeNull();
    const bytes = serializeWorld(current.world);
    expect(residentActivitySaveExtensionsValid(deserializeWorld(bytes), true, true, true)).toBe(true);
    expect(serializeWorld(current.world)).toBe(bytes);
  });

  it("keeps native departure and observed shelter history after real delivery, without requiring the old active contract", () => {
    const current = transportFixture();
    current.departure.data.playerObserved = true;
    current.shelter.data.playerObserved = true;
    expect(residentActivitySaveExtensionsValid(current.world, true, true, true)).toBe(true);
    clearWeather(current.world);
    for (let step = 0; step < 120; step += 1) {
      const contract = current.world.contracts.find(({ id }) => id === current.contractId)!;
      if (contract.status === "fulfilled") break;
      stepWorld(current.world);
    }
    expect(current.world.contracts.find(({ id }) => id === current.contractId)?.status).toBe("fulfilled");
    expect(eventAt(current.world, current.departure.sequence)).toEqual(current.departure);
    expect(eventAt(current.world, current.shelter.sequence)).toEqual(current.shelter);
    // Model legitimate bounded terminal-history/memory absence after actual
    // delivery. We do not claim to exercise the 256-contract pruning threshold.
    current.world.contracts = current.world.contracts.filter(({ id }) => id !== current.contractId);
    current.world.residents.find(({ id }) => id === current.residentId)!.memories = [];
    assertWorldInvariants(current.world);
    expect(workingPeopleExpressionIntent({ world: createWorldView(current.world), event: current.departure })).toBeNull();
    expect(residentWeatherHoldExpressionIntent({ world: createWorldView(current.world), event: current.shelter })).toBeNull();
    const bytes = serializeWorld(current.world);
    const restored = deserializeWorld(bytes);
    expect(residentActivitySaveExtensionsValid(restored, true, true, true)).toBe(true);
    expect(residentActivitySaveExtensionsValid(restored, false)).toBe(false);
    expect(serializeWorld(restored)).toBe(bytes);
  });

  it("rejects every partial, malformed or mistimed introduction source even when no active expression consumes it", () => {
    const current = introductionFixture();
    const alterations: Array<(event: SimEvent) => void> = [
      ...RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS.map((key) => (event: SimEvent) => { delete event.data[key]; }),
      (event) => { event.data.eventBodyVersion = 2; },
      (event) => { event.data.eventBodyTick = event.tick; },
      (event) => { event.data.eventBodyPhase = 11; },
      (event) => { event.data.eventBodyLocalX = 120_000; },
      (event) => { event.data.eventBodyRegionY = -0; },
      (event) => { event.data.eventBodyHeading = 1_000_000; },
      (event) => { event.subjectId = 999_999; },
      (event) => { event.tick = current.world.meta.completedTick + 1; },
      (event) => { event.data.unknownBodyField = 1; },
    ];
    for (const alter of alterations) {
      const world = structuredClone(current.world);
      alter(eventAt(world, current.event.sequence));
      const before = stableStringify(world);
      expect(residentActivitySaveExtensionsValid(world, true, true, true)).toBe(false);
      expect(stableStringify(world)).toBe(before);
    }
  });

  it("rejects wrong phase/tick and noncanonical observed variants of each live transport producer", () => {
    const current = transportFixture();
    for (const original of [current.departure, current.shelter]) {
      for (const [key, value] of [["eventBodyPhase", 1], ["eventBodyTick", original.tick - 1],
        ["playerObserved", false], ["playerObserved", "true"], ["foreignField", 1]] as const) {
        const world = structuredClone(current.world);
        eventAt(world, original.sequence).data[key] = value;
        expect(residentActivitySaveExtensionsValid(world, true, true, true), `${original.type}:${key}`).toBe(false);
      }
    }
  });

  it("rejects event-body fields without a body cohort or on an unrelated event, including partial presence", () => {
    const current = introductionFixture();
    const absent = structuredClone(current.world);
    for (const resident of absent.residents) delete resident.activity;
    expect(residentActivitySaveExtensionsValid(absent, true, true, true)).toBe(false);
    const initial = current.world.events.find((event) => event.type === "world-created")!;
    expect(initial).toBeDefined();
    for (const extension of [{ eventBodyVersion: 1 }, Object.fromEntries(
      RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS.map((key) => [key, current.event.data[key]]),
    )]) {
      const world = structuredClone(current.world);
      Object.assign(eventAt(world, initial.sequence).data, extension);
      expect(residentActivitySaveExtensionsValid(world, true, true, true)).toBe(false);
      expect(residentActivitySaveExtensionsValid(world, false)).toBe(false);
    }
  });
});
