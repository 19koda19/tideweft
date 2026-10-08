import { describe, expect, it } from "vitest";

import {
  adoptResidentActivities,
  advanceResidentRestActivities,
  prepareResidentRestActivities,
} from "../game/residentActivityExecution";
import { resolveResidentWorldPlacement } from "../game/residentSpatial";
import {
  createWorldPosition,
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  worldPositionDelta,
} from "../game/worldPosition";
import { createWorld, serializeWorld } from "./public";
import { REGION_COORD_LIMIT } from "./regions";
import {
  captureResidentActivityEventLocus,
  hasResidentActivityEventLocus,
  readResidentActivityEventLocus,
  RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS,
  RESIDENT_ACTIVITY_EVENT_LOCUS_VERSION,
} from "./residentActivityEventLocus";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "./residentActivityWorld";
import type { ResidentState, SimEventDatum, WorldState } from "./types";

// Codec evidence only. These fixtures use the native roster and real adoption
// and rest adapter; they do not establish normal-runtime activation or domain
// authentication of a complete speech event.
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

function residentAt(world: WorldState, stableId: string): ResidentState {
  const resident = world.residents.find(({ identity }) => identity.stableId === stableId);
  if (resident === undefined) throw new Error("fixture lost its native resident");
  return resident;
}

function capturedData(): Readonly<Record<string, SimEventDatum>> {
  const world = freshWorld();
  if (!adoptResidentActivities(world)) throw new Error("native fixture cannot adopt its bodies");
  const data = captureResidentActivityEventLocus(world.residents[0]!, world.meta.completedTick);
  if (data === null) throw new Error("native adopted fixture has no body locus");
  return data;
}

const NATIVE_DATA = capturedData();

function changedData(key: string, value: unknown): Record<string, unknown> {
  return { ...NATIVE_DATA, [key]: value };
}

describe("resident activity event-locus scalar codec", () => {
  it("captures the exact phase-zero adopted pose as frozen primitive fields without mutation", () => {
    const world = freshWorld();
    expect(adoptResidentActivities(world)).toBe(true);
    const resident = world.residents[0]!;
    const before = serializeWorld(world);
    const root = resident.activity;
    const pose = root!.poses[0]!;
    const data = captureResidentActivityEventLocus(resident, world.meta.completedTick)!;
    expect(Object.keys(data)).toEqual(RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS);
    expect(Object.values(data).every((value) => typeof value === "number")).toBe(true);
    expect(Object.isFrozen(data)).toBe(true);
    expect(data).toEqual({
      eventBodyVersion: RESIDENT_ACTIVITY_EVENT_LOCUS_VERSION,
      eventBodyTick: root!.tick, eventBodyPhase: 0,
      eventBodyRegionX: pose.position.region.x, eventBodyRegionY: pose.position.region.y,
      eventBodyLocalX: pose.position.localX, eventBodyLocalY: pose.position.localY,
      eventBodyHeading: pose.heading,
    });
    expect(readResidentActivityEventLocus(data)).toEqual({
      tick: root!.tick, phase: 0, position: pose.position, heading: pose.heading,
    });
    expect(resident.activity).toBe(root);
    expect(serializeWorld(world)).toBe(before);
  });

  it("retains the real nonzero approach pose after the resident moves again", () => {
    const world = freshWorld();
    const chosen = world.residents.find((resident) => {
      const source = resolveResidentWorldPlacement(world, resident)?.position;
      const target = residentSettlementRestTarget(world, resident);
      if (!source || !target || !residentRestTargetHasDrySupport(world, source)
        || !residentRestTargetHasDrySupport(world, target)) return false;
      const delta = worldPositionDelta(source, target);
      return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
    });
    if (chosen === undefined) throw new Error("fixture needs a native one-tile dry rest approach");
    chosen.needs.rest = 900_000;
    chosen.condition.exhaustion = 300_000;
    const actorId = chosen.identity.stableId;
    expect(adoptResidentActivities(world)).toBe(true);
    expect(prepareResidentRestActivities(world)).toBe(true);
    const source = residentAt(world, actorId).activity!.poses[0]!.position;
    expect(advanceResidentRestActivities(world, 1)?.movedActorIds).toContain(actorId);
    const resident = residentAt(world, actorId);
    const pose = resident.activity!.poses[1]!;
    expect(pose.position).not.toEqual(source);
    const before = serializeWorld(world);
    const data = captureResidentActivityEventLocus(resident, world.meta.completedTick)!;
    const decoded = readResidentActivityEventLocus(data)!;
    expect(decoded).toEqual({
      tick: world.meta.completedTick, phase: 1, position: pose.position, heading: pose.heading,
    });
    expect(serializeWorld(world)).toBe(before);
    expect(advanceResidentRestActivities(world, 2)?.movedActorIds).toContain(actorId);
    expect(residentAt(world, actorId).activity!.poses[2]!.position).not.toEqual(pose.position);
    expect(readResidentActivityEventLocus(data)).toEqual(decoded);
  });

  it("leaves the absent legacy body absent without modifying world state", () => {
    const world = freshWorld();
    const resident = world.residents[0]!;
    const before = serializeWorld(world);
    expect(Object.hasOwn(resident, "activity")).toBe(false);
    expect(captureResidentActivityEventLocus(resident, world.meta.completedTick)).toBeNull();
    expect(Object.hasOwn(resident, "activity")).toBe(false);
    expect(serializeWorld(world)).toBe(before);
  });

  it.each([
    ["null", null], ["undefined", undefined], ["empty", {}],
    ["array", []], ["unsupported version", { version: 2 }],
  ] as const)("does not reconstruct a legacy source for explicit malformed %s activity", (_name, activity) => {
    const resident = { ...freshWorld().residents[0]!, activity } as unknown as ResidentState;
    expect(() => captureResidentActivityEventLocus(resident, BASE.meta.completedTick)).toThrow(RangeError);
  });

  it("rejects stale ticks, foreign actor binding and malformed retained pose history", () => {
    const world = freshWorld();
    expect(adoptResidentActivities(world)).toBe(true);
    const resident = world.residents[0]!;
    const activity = resident.activity!;
    const before = serializeWorld(world);
    expect(() => captureResidentActivityEventLocus(resident, world.meta.completedTick + 1)).toThrow(RangeError);
    const foreign = { ...resident, activity: { ...activity, actorId: world.residents[1]!.identity.stableId } };
    expect(() => captureResidentActivityEventLocus(foreign, world.meta.completedTick)).toThrow(RangeError);
    const malformed = { ...resident, activity: { ...activity, poses: [] } };
    expect(() => captureResidentActivityEventLocus(malformed, world.meta.completedTick)).toThrow(RangeError);
    expect(serializeWorld(world)).toBe(before);
  });

  it("roundtrips detached scalar data exactly and freezes every decoded position layer", () => {
    const data = structuredClone(NATIVE_DATA);
    const before = JSON.stringify(data);
    const decoded = readResidentActivityEventLocus(data)!;
    expect(decoded).not.toBeNull();
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.position)).toBe(true);
    expect(Object.isFrozen(decoded.position.region)).toBe(true);
    expect(readResidentActivityEventLocus(JSON.parse(before))).toEqual(decoded);
    expect(JSON.stringify(data)).toBe(before);
  });

  it.each([
    ["minimum signed envelope", -REGION_COORD_LIMIT, REGION_COORD_LIMIT, 0, REGION_HEIGHT_UNITS - 1],
    ["negative regions", -1, -2, REGION_WIDTH_UNITS - 1, 0],
    ["positive regions", 3, 4, 0, REGION_HEIGHT_UNITS - 1],
  ] as const)("reads already-normalized coordinates at %s", (_name, x, y, localX, localY) => {
    const data = {
      ...NATIVE_DATA, eventBodyRegionX: x, eventBodyRegionY: y,
      eventBodyLocalX: localX, eventBodyLocalY: localY,
      eventBodyTick: Number.MAX_SAFE_INTEGER, eventBodyPhase: 10, eventBodyHeading: 999_999,
    };
    expect(readResidentActivityEventLocus(data)).toEqual({
      tick: Number.MAX_SAFE_INTEGER, phase: 10,
      position: createWorldPosition({ x, y }, localX, localY), heading: 999_999,
    });
  });

  it.each(RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS)("recognizes and rejects a partial explicit %s rather than falling back", (key) => {
    const partial = { [key]: NATIVE_DATA[key] };
    expect(hasResidentActivityEventLocus(partial)).toBe(true);
    expect(readResidentActivityEventLocus(partial)).toBeNull();
    const missing = { ...NATIVE_DATA };
    delete missing[key];
    expect(hasResidentActivityEventLocus(missing)).toBe(true);
    expect(readResidentActivityEventLocus(missing)).toBeNull();
  });

  it("detects only own extension fields and leaves unrelated domain schema validation to its owner", () => {
    expect(hasResidentActivityEventLocus({ eventLocationKind: "settlement" })).toBe(false);
    expect(hasResidentActivityEventLocus(Object.create(NATIVE_DATA))).toBe(false);
    const data = { ...NATIVE_DATA, domainFact: "not authenticated by this codec" };
    expect(hasResidentActivityEventLocus(data)).toBe(true);
    expect(readResidentActivityEventLocus(data)).toEqual(readResidentActivityEventLocus(NATIVE_DATA));
  });

  it.each(RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS)("rejects hidden and accessor %s without evaluating the getter", (key) => {
    const hidden = { ...NATIVE_DATA };
    Object.defineProperty(hidden, key, { value: NATIVE_DATA[key], enumerable: false });
    expect(readResidentActivityEventLocus(hidden)).toBeNull();
    let getterCalls = 0;
    const accessor = { ...NATIVE_DATA };
    Object.defineProperty(accessor, key, {
      enumerable: true,
      get: () => { getterCalls += 1; throw new Error("untrusted getter must not execute"); },
    });
    expect(hasResidentActivityEventLocus(accessor)).toBe(true);
    expect(readResidentActivityEventLocus(accessor)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("rejects symbols and non-plain container shapes while accepting a null prototype", () => {
    const withSymbol = { ...NATIVE_DATA, [Symbol("hidden")]: true };
    expect(readResidentActivityEventLocus(withSymbol)).toBeNull();
    expect(readResidentActivityEventLocus(Object.assign(Object.create(null), NATIVE_DATA)))
      .toEqual(readResidentActivityEventLocus(NATIVE_DATA));
    for (const value of [null, undefined, false, 1, "body", [], Object.assign(new Date(), NATIVE_DATA)]) {
      expect(readResidentActivityEventLocus(value)).toBeNull();
    }
    expect(readResidentActivityEventLocus(Object.assign(Object.create({ domain: true }), NATIVE_DATA))).toBeNull();
  });

  const malformedFields: Array<readonly [string, unknown]> = [
    ...[0, -0, 2, null, undefined, "1", Number.NaN, Number.POSITIVE_INFINITY]
      .map((value) => ["eventBodyVersion", value] as const),
    ...[-1, -0, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, "0", null, true]
      .map((value) => ["eventBodyTick", value] as const),
    ...[-1, -0, 0.5, 11, Number.NaN, Number.POSITIVE_INFINITY, "0", null]
      .map((value) => ["eventBodyPhase", value] as const),
    ...[-1, -0, 0.5, 1_000_000, Number.NaN, Number.POSITIVE_INFINITY, "0", null]
      .map((value) => ["eventBodyHeading", value] as const),
    ...["eventBodyRegionX", "eventBodyRegionY"].flatMap((key) => (
      [-REGION_COORD_LIMIT - 1, REGION_COORD_LIMIT + 1, -0, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "0", null]
        .map((value) => [key, value] as const)
    )),
    ...[["eventBodyLocalX", REGION_WIDTH_UNITS], ["eventBodyLocalY", REGION_HEIGHT_UNITS]]
      .flatMap(([key, extent]) => (
        [-1, -0, extent, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "0", null]
          .map((value) => [key as string, value] as const)
      )),
  ];

  it.each(malformedFields)("rejects noncanonical %s = %s rather than normalizing it", (key, value) => {
    expect(readResidentActivityEventLocus(changedData(key, value))).toBeNull();
  });
});
