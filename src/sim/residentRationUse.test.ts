import { describe, expect, it } from "vitest";

import {
  adoptResidentActivities,
  advanceResidentRestActivities,
  prepareResidentRestActivities,
} from "../game/residentActivityExecution";
import { createWorldPosition } from "../game/worldPosition";
import {
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
} from "./actorPerception";
import { projectLivingCircadianClockPreference } from "./livingCircadian";
import { createWorld } from "./public";
import {
  consumeResidentRationUse,
  prepareResidentRationUse,
  residentRationPriorityEligible,
  residentRationUseEligible,
  revokeResidentRationUse,
  type ResidentRationDuty,
} from "./residentRationUse";
import { tideAtTick } from "./terrain";
import type { ResidentState, WorldState } from "./types";
import { stableStringify } from "./util";
import { WORLD_NIGHT_START_TICK } from "./worldTime";

// Receipt custody and priority characterization, not enacted meal gameplay.
// No ration task, arrival, use receipt or successful meal result is authored.
const BASE = createWorld("resident ration admission custody", "standard");

function freshWorld(tick = BASE.meta.completedTick): WorldState {
  const world = structuredClone(BASE);
  // Controlled clock/need inputs; this is not an offline-advance witness.
  world.meta.completedTick = tick;
  world.tide = tideAtTick(tick);
  world.weather = {
    kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: tick + 1_000,
  };
  for (const resident of world.residents) {
    resident.perception = createActorPerceptionState(resident.identity.stableId, tick);
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  expect(adoptResidentActivities(world)).toBe(true);
  return world;
}

function explicitDuties(world: WorldState): ResidentRationDuty[] {
  return world.residents.map(({ identity }) => ({ actorId: identity.stableId, duty: null }));
}

function closingWorld(phase = 10): WorldState {
  const world = freshWorld();
  expect(prepareResidentRestActivities(world)).toBe(true);
  for (let current = 1; current <= phase; current += 1) {
    expect(advanceResidentRestActivities(world, current)).not.toBeNull();
  }
  return world;
}

function hungryResident(world: WorldState): ResidentState {
  const resident = world.residents[0]!;
  resident.needs.food = 900_000;
  resident.intention = "eat";
  return resident;
}

describe("prepared resident ration use custody", () => {
  it("captures the complete explicit neutral/active duty cohort once without modifying world state", () => {
    const world = closingWorld();
    const duties = explicitDuties(world);
    const active = duties[0]!;
    duties[0] = { actorId: active.actorId, duty: { kind: "active-duty", referenceId: "porter-response:inspect" } };
    const before = stableStringify(world);
    const prepared = prepareResidentRationUse(world, duties);
    expect(prepared).toEqual({ sourceTick: world.meta.completedTick, targetTick: world.meta.completedTick + 1 });
    expect(Object.isFrozen(prepared)).toBe(true);
    if (prepared === null) throw new Error("Native closing cohort was not admitted");
    // Caller mutation after preparation cannot change the copied admission.
    duties[0] = { actorId: active.actorId, duty: null };
    const admitted = consumeResidentRationUse(world, prepared);
    expect(admitted.size).toBe(world.residents.length);
    expect(admitted.get(active.actorId)).toBe(true);
    expect(world.residents.slice(1).every(({ identity }) => admitted.get(identity.stableId) === false)).toBe(true);
    expect(stableStringify(world)).toBe(before);
    expect(() => consumeResidentRationUse(world, prepared)).toThrow(/already consumed/u);
  });

  it.each([0, 1, 9])("rejects a native body interval at phase %i before closing", (phase) => {
    const world = closingWorld(phase);
    const before = stableStringify(world);
    expect(prepareResidentRationUse(world, explicitDuties(world))).toBeNull();
    expect(stableStringify(world)).toBe(before);
  });

  it.each(["world-clone", "roster-copy", "resident-slot-copy", "activity-slot-copy", "stale-tick"] as const)(
    "rejects %s custody and burns the attempted receipt", (change) => {
      const world = closingWorld();
      const prepared = prepareResidentRationUse(world, explicitDuties(world));
      if (prepared === null) throw new Error("Native closing cohort was not admitted");
      const target = change === "world-clone" ? structuredClone(world) : world;
      if (change === "roster-copy") target.residents = [...target.residents];
      if (change === "resident-slot-copy") target.residents[0] = { ...target.residents[0]! };
      if (change === "activity-slot-copy") target.residents[0]!.activity = { ...target.residents[0]!.activity! };
      if (change === "stale-tick") target.meta.completedTick += 1;
      const before = stableStringify(target);
      expect(() => consumeResidentRationUse(target, prepared)).toThrow(/stale, foreign/u);
      expect(stableStringify(target)).toBe(before);
      expect(() => consumeResidentRationUse(world, prepared)).toThrow(/already consumed/u);
    },
  );

  it("rejects a structural token clone and honors explicit revocation without changing bodies", () => {
    const world = closingWorld();
    const prepared = prepareResidentRationUse(world, explicitDuties(world));
    if (prepared === null) throw new Error("Native closing cohort was not admitted");
    const before = stableStringify(world);
    expect(() => consumeResidentRationUse(world, structuredClone(prepared))).toThrow(/foreign/u);
    revokeResidentRationUse(prepared);
    revokeResidentRationUse(prepared);
    expect(() => consumeResidentRationUse(world, prepared)).toThrow(/already consumed/u);
    expect(stableStringify(world)).toBe(before);
  });

  it("rejects missing, foreign, duplicate and malformed explicit duties atomically", () => {
    const world = closingWorld();
    const valid = explicitDuties(world);
    const invalid: unknown[] = [
      null, undefined, valid.slice(1),
      [valid[0], ...valid.slice(0, -1)],
      [{ actorId: "H-not-in-this-world", duty: null }, ...valid.slice(1)],
      [null, ...valid.slice(1)],
      [{ actorId: valid[0]!.actorId }, ...valid.slice(1)],
      [{ actorId: valid[0]!.actorId, duty: undefined }, ...valid.slice(1)],
      [{ ...valid[0], extra: true }, ...valid.slice(1)],
      [{ ...valid[0], [Symbol("hidden")]: true }, ...valid.slice(1)],
      [{ actorId: valid[0]!.actorId, duty: { kind: "other", referenceId: "duty:test" } }, ...valid.slice(1)],
      [{ actorId: valid[0]!.actorId, duty: { kind: "active-duty", referenceId: "" } }, ...valid.slice(1)],
      [{ actorId: valid[0]!.actorId, duty: { kind: "active-duty", referenceId: "duty:test", extra: true } }, ...valid.slice(1)],
    ];
    const sparse = [...valid];
    delete sparse[0];
    invalid.push(sparse);
    const before = stableStringify(world);
    for (const candidate of invalid) {
      expect(prepareResidentRationUse(world, candidate as ResidentRationDuty[])).toBeNull();
      expect(stableStringify(world)).toBe(before);
    }
  });

  it("rejects non-data duty records and array extras without evaluating getters", () => {
    const world = closingWorld();
    const valid = explicitDuties(world);
    let reads = 0;
    const entry = { actorId: valid[0]!.actorId, get duty() { reads += 1; return null; } };
    const duty = { kind: "active-duty", get referenceId() { reads += 1; return "duty:test"; } };
    const extraArray = Object.assign([...valid], { extra: true });
    const symbolArray = Object.assign([...valid], { [Symbol("hidden")]: true });
    const customEntry = Object.assign(Object.create({ inherited: true }) as object, valid[0]);
    const candidates = [
      [entry, ...valid.slice(1)],
      [{ actorId: valid[0]!.actorId, duty }, ...valid.slice(1)],
      [customEntry, ...valid.slice(1)], extraArray, symbolArray,
    ];
    for (const candidate of candidates) {
      expect(prepareResidentRationUse(world, candidate as ResidentRationDuty[])).toBeNull();
    }
    expect(reads).toBe(0);
  });
});

describe("resident ration priority from existing routine signals", () => {
  it.each([
    [900_000, 800_000, 800_000, 100_000, true],
    [800_000, 900_000, 100_000, 100_000, false],
    [800_000, 100_000, 900_000, 100_000, false],
    [900_000, 900_000, 900_000, 900_000, true],
    [800_000, 100_000, 100_000, 900_000, false],
  ] as const)("resolves food %i/rest %i/exhaustion %i/belonging %i by the shared urgency order", (
    food, rest, exhaustion, belonging, expected,
  ) => {
    const world = freshWorld();
    const resident = hungryResident(world);
    resident.needs = { food, rest, belonging };
    resident.condition.exhaustion = exhaustion;
    expect(residentRationPriorityEligible(resident, world.weather, false, world.meta.completedTick)).toBe(expected);
  });

  it("allows ordinary eating only in its real active clock, but urgent hunger can interrupt night rest", () => {
    for (const [tick, clock] of [
      [BASE.meta.completedTick, "active"],
      [WORLD_NIGHT_START_TICK + 120, "rest"],
    ] as const) {
      const world = freshWorld(tick);
      const resident = world.residents[0]!;
      expect(projectLivingCircadianClockPreference(resident.identity.stableId, tick, resident.circadian!.policy)).toBe(clock);
      resident.intention = "eat";
      expect(residentRationPriorityEligible(resident, world.weather, false, tick)).toBe(clock === "active");
      resident.needs.food = 900_000;
      expect(residentRationPriorityEligible(resident, world.weather, false, tick)).toBe(true);
    }
  });

  it("keeps genuine duty, storm, route/Promise and stale cognition ahead of hunger", () => {
    const world = freshWorld();
    const resident = hungryResident(world);
    const tick = world.meta.completedTick;
    expect(residentRationPriorityEligible(resident, world.weather, false, tick)).toBe(true);
    expect(residentRationPriorityEligible(resident, world.weather, true, tick)).toBe(false);
    expect(residentRationPriorityEligible(resident, { ...world.weather, kind: "storm" }, false, tick)).toBe(false);
    expect(residentRationPriorityEligible({ ...resident, location: { kind: "route", routeId: world.routes[0]!.id, progress: 0 } }, world.weather, false, tick)).toBe(false);
    expect(residentRationPriorityEligible({ ...resident, activeContractId: world.contracts[0]!.id }, world.weather, false, tick)).toBe(false);
    expect(residentRationPriorityEligible(resident, world.weather, false, tick + 1)).toBe(false);
  });

  it.each(["identified-predator", "strong-anonymous"] as const)(
    "preserves actual shared %s attention ahead of urgent hunger", (signal) => {
      const world = freshWorld();
      const resident = hungryResident(world);
      const tick = world.meta.completedTick;
      const observation = createActorObservation({
        id: `ration-priority-${signal}-${tick}`,
        observerId: resident.identity.stableId, observedAtTick: tick,
        channel: signal === "identified-predator" ? "vision" : "hearing",
        perceivedClass: signal === "identified-predator" ? "large-predator" : "movement-sound",
        subjectId: signal === "identified-predator" ? "animal:priority-contract-fixture" : null,
        area: { center: createWorldPosition({ x: 0, y: 0 }, 12_500, 16_500), radiusUnits: signal === "strong-anonymous" ? 2_000 : 0 },
        confidence: 950_000, salience: 980_000,
        identification: signal === "identified-predator" ? "identified" : "anonymous",
        interrupt: signal === "strong-anonymous" ? "strong" : "none",
      });
      if (observation === null) throw new Error("Controlled shared sensory input was rejected");
      const perception = stepActorPerception(createActorPerceptionState(resident.identity.stableId, tick - 1), {
        tick, observations: [observation],
      });
      if (perception === null) throw new Error("Shared perception did not admit its controlled input");
      const perceived = { ...resident, perception };
      expect(perceived.perception.suspicion).toBe(signal === "strong-anonymous" ? "alert" : "identified");
      expect(residentRationPriorityEligible(perceived, world.weather, false, tick)).toBe(false);
    },
  );

  it("does not treat a native rest/body receipt as successful ration use", () => {
    const world = closingWorld();
    const resident = hungryResident(world);
    const prepared = prepareResidentRationUse(world, explicitDuties(world));
    if (prepared === null) throw new Error("Native closing cohort was not admitted");
    const duties = consumeResidentRationUse(world, prepared);
    expect(residentRationUseEligible(world, resident, duties, world.meta.completedTick)).toBe(false);
    expect(residentRationUseEligible(world, resident, null, world.meta.completedTick)).toBe(false);
  });
});
