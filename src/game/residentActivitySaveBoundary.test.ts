import { describe, expect, it } from "vitest";

import { createWorld, serializeWorld } from "../sim/public";
import {
  captureResidentActivityEventLocus,
  RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS,
} from "../sim/residentActivityEventLocus";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import type { WorldState } from "../sim/types";
import {
  adoptResidentActivities,
  advanceResidentRestActivities,
  prepareResidentRestActivities,
} from "./residentActivityExecution";
import {
  residentActivitiesMatchPerceptionInterval,
  residentActivitySaveExtensionsAbsent,
} from "./residentActivitySaveBoundary";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta } from "./worldPosition";

// Capability/alignment unit evidence only. The real lower-world rest adapter
// supplies these bodies; this does not activate runtime motion or admit a save.
const BASE = createWorld("resident activity executable rest approach", "standard");

function freshWorld(): WorldState {
  const world = structuredClone(BASE);
  world.weather = {
    kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: world.meta.completedTick + 1_000,
  };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = world.meta.completedTick + 1_000;
    contract.dueTick = world.meta.completedTick + 2_000;
  }
  return world;
}

function adoptedFixture(phase = 0) {
  const world = freshWorld();
  const chosen = world.residents.find((resident) => {
    const source = resolveResidentWorldPlacement(world, resident)?.position;
    const target = residentSettlementRestTarget(world, resident);
    if (!source || !target || !residentRestTargetHasDrySupport(world, source)
      || !residentRestTargetHasDrySupport(world, target)) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
  });
  if (chosen === undefined) throw new Error("fixture needs a native dry rest approach");
  chosen.needs.rest = 900_000;
  chosen.condition.exhaustion = 300_000;
  const actorId = chosen.identity.stableId;
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world)).toBe(true);
  for (let accepted = 1; accepted <= phase; accepted += 1) {
    const result = advanceResidentRestActivities(world, accepted);
    expect(result).not.toBeNull();
    if (accepted === 1) expect(result?.movedActorIds).toContain(actorId);
  }
  return world;
}

function firstEvent(world: WorldState) {
  const event = world.events[0];
  if (event === undefined) throw new Error("native world omitted its creation event");
  return event;
}

describe("resident activity save capability and interval boundary", () => {
  it.each([0, 1, 9])("keeps genuinely absent legacy bodies absent at accepted phase %s", (phase) => {
    const world = freshWorld();
    const residents = world.residents;
    const before = serializeWorld(world);
    expect(residentActivitySaveExtensionsAbsent(world)).toBe(true);
    expect(residentActivitiesMatchPerceptionInterval(residents, world.meta.completedTick, phase)).toBe(true);
    expect(world.residents).toBe(residents);
    expect(residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    expect(serializeWorld(world)).toBe(before);
  });

  it.each([0, 1, 9])("matches all native bodies and their detached clone at actual phase %s", (phase) => {
    const world = adoptedFixture(phase);
    const residents = world.residents;
    const before = serializeWorld(world);
    const detached = structuredClone(residents);
    expect(residents.every((resident) => resident.activity?.poses.length === phase + 1)).toBe(true);
    expect(residentActivitiesMatchPerceptionInterval(residents, world.meta.completedTick, phase)).toBe(true);
    expect(residentActivitiesMatchPerceptionInterval(detached, world.meta.completedTick, phase)).toBe(true);
    expect(residentActivitySaveExtensionsAbsent(world)).toBe(false);
    expect(world.residents).toBe(residents);
    expect(detached).toEqual(residents);
    expect(serializeWorld(world)).toBe(before);
  });

  it("rejects a partial roster, including a missing final body, without repairing it", () => {
    const world = adoptedFixture(1);
    for (const index of [0, world.residents.length - 1]) {
      const residents = structuredClone(world.residents);
      delete residents[index]!.activity;
      const before = structuredClone(residents);
      expect(residentActivitiesMatchPerceptionInterval(residents, world.meta.completedTick, 1)).toBe(false);
      expect(residents).toEqual(before);
    }
  });

  it("rejects foreign identities, ticks and history lengths even for canonical roots", () => {
    const world = adoptedFixture(1);
    expect(residentActivitiesMatchPerceptionInterval(world.residents, world.meta.completedTick, 0)).toBe(false);
    expect(residentActivitiesMatchPerceptionInterval(world.residents, world.meta.completedTick + 1, 1)).toBe(false);
    for (const patch of [
      { actorId: world.residents[0]!.identity.stableId },
      { tick: world.meta.completedTick + 1 },
      { poses: world.residents.at(-1)!.activity!.poses.slice(0, 1) },
    ]) {
      const residents = structuredClone(world.residents);
      const last = residents.at(-1)!;
      last.activity = { ...last.activity!, ...patch };
      expect(residentActivitiesMatchPerceptionInterval(residents, world.meta.completedTick, 1)).toBe(false);
    }
  });

  it("rejects invalid clock/phase inputs, including in-memory phase ten, with either roster", () => {
    const absent = freshWorld();
    const adopted = adoptedFixture(0);
    for (const world of [absent, adopted]) {
      for (const phase of [-0, -1, 0.5, 10, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(residentActivitiesMatchPerceptionInterval(world.residents, world.meta.completedTick, phase)).toBe(false);
      }
      for (const tick of [-0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
        expect(residentActivitiesMatchPerceptionInterval(world.residents, tick, 0)).toBe(false);
      }
    }
  });

  it("treats malformed own bodies as presence rather than legacy absence", () => {
    const world = adoptedFixture(0);
    for (const value of [null, undefined, {}, [], { version: 2 }]) {
      const residents = structuredClone(world.residents);
      Object.assign(residents.at(-1)!, { activity: value });
      expect(residentActivitySaveExtensionsAbsent({ ...world, residents })).toBe(false);
      expect(residentActivitiesMatchPerceptionInterval(residents, world.meta.completedTick, 0)).toBe(false);
    }
  });

  it("rejects hidden/accessor body descriptors without invoking getters", () => {
    const world = adoptedFixture(0);
    for (const accessor of [false, true]) {
      const residents = structuredClone(world.residents);
      const last = residents.at(-1)!;
      const body = last.activity;
      let calls = 0;
      Object.defineProperty(last, "activity", accessor
        ? { enumerable: true, get: () => { calls += 1; throw new Error("must not read body getter"); } }
        : { enumerable: false, value: body });
      expect(residentActivitySaveExtensionsAbsent({ ...world, residents })).toBe(false);
      expect(residentActivitiesMatchPerceptionInterval(residents, world.meta.completedTick, 0)).toBe(false);
      expect(calls).toBe(0);
    }
  });

  it.each(RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS)("forbids even a partial own event extension %s with bodies absent", (key) => {
    const world = freshWorld();
    firstEvent(world).data = { ...firstEvent(world).data, [key]: null };
    const before = structuredClone(world);
    expect(world.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    expect(residentActivitySaveExtensionsAbsent(world)).toBe(false);
    expect(world).toEqual(before);
  });

  it("forbids a complete captured extension even after current body roots are absent", () => {
    const adopted = adoptedFixture(1);
    const data = captureResidentActivityEventLocus(adopted.residents[0]!, adopted.meta.completedTick);
    expect(data).not.toBeNull();
    const world = freshWorld();
    // Presence fixture only: these scalars do not authenticate the unrelated
    // creation event as a genuine acoustic cause or a complete domain event.
    firstEvent(world).data = { ...firstEvent(world).data, ...data };
    expect(residentActivitySaveExtensionsAbsent(world)).toBe(false);
  });

  it("detects hidden/undefined/accessor event keys without reading their values", () => {
    for (const kind of ["hidden", "undefined", "accessor"] as const) {
      const world = freshWorld();
      let calls = 0;
      Object.defineProperty(firstEvent(world).data, "eventBodyTick", kind === "accessor"
        ? { enumerable: true, get: () => { calls += 1; throw new Error("must not read event getter"); } }
        : { enumerable: kind !== "hidden", value: undefined });
      expect(residentActivitySaveExtensionsAbsent(world)).toBe(false);
      expect(calls).toBe(0);
    }
  });

  it("does not confuse unrelated scalar text or inherited keys with own body authority", () => {
    const world = freshWorld();
    firstEvent(world).data = Object.assign(Object.create({ eventBodyTick: world.meta.completedTick }), {
      note: "eventBodyTick is a word, not an owned field",
      eventBodyFutureNote: "unrelated capability fixture",
    });
    expect(residentActivitySaveExtensionsAbsent(world)).toBe(true);
  });
});
