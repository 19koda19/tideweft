import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  regionKey,
  type RegionCoord,
} from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import type { RegionalTerrainWindow } from "./regionalTravel";

export const REGIONAL_CARTOGRAPHY_VERSION = 1 as const;
export const REGIONAL_CARTOGRAPHY_MAX_REGIONS = 131_072;
export const REGIONAL_CARTOGRAPHY_MAX_SERIALIZED_BYTES = 24 * 1_024 * 1_024;

const UINT32_MAX = 0xffff_ffff;
const HASH_PATTERN = /^[0-9a-f]{16}$/;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_CARTOGRAPHY = new WeakSet<object>();

export interface RegionalCartographyMark {
  readonly tileIndex: number;
  readonly discovered: number;
  readonly depthSounding: number;
}

export interface RegionalCartographyRecord {
  readonly coord: RegionCoord;
  readonly key: string;
  /** Sorted sparse knowledge; terrain and resources remain generator-owned. */
  readonly marks: readonly RegionalCartographyMark[];
}

export interface RegionalCartographyState {
  readonly version: typeof REGIONAL_CARTOGRAPHY_VERSION;
  readonly rootSeedHash: string;
  readonly revision: number;
  readonly regions: readonly RegionalCartographyRecord[];
  readonly integrity: string;
}

export interface RegionalCartographyWindow {
  readonly discovered: readonly number[];
  readonly depthSoundings: readonly number[];
}

interface CartographyPayload {
  readonly version: typeof REGIONAL_CARTOGRAPHY_VERSION;
  readonly rootSeedHash: string;
  readonly revision: number;
  readonly regions: readonly RegionalCartographyRecord[];
}

/** Migrate the finite alpha chart into compatibility region 0,0 exactly once. */
export function createRegionalCartography(
  rootSeed: RootSeed,
  legacy?: {
    readonly discovered: readonly number[];
    readonly depthSoundings: readonly number[];
  },
): RegionalCartographyState {
  const seedHash = hashCanonical(canonicalRootSeed(rootSeed));
  const regions = legacy
    ? [recordFromDense(
        createRegionCoord(0, 0),
        legacy.discovered,
        legacy.depthSoundings,
        true,
      )].filter((record) => record.marks.length > 0)
    : [];
  return seal({
    version: REGIONAL_CARTOGRAPHY_VERSION,
    rootSeedHash: seedHash,
    revision: 0,
    regions,
  });
}

/**
 * Merge the visible floating window into durable knowledge. Both chart fields
 * are monotonic, so unload/reload can neither forget a mark nor reroll a scan.
 */
export function captureRegionalCartographyWindow(
  state: RegionalCartographyState,
  window: RegionalTerrainWindow,
  discovered: readonly number[],
  depthSoundings: readonly number[],
): RegionalCartographyState {
  const current = requireState(state);
  const count = window.terrain.tiles.length;
  if (
    window.addresses.length !== count
    || discovered.length !== count
    || depthSoundings.length !== count
  ) throw new RangeError("Regional chart window dimensions do not match");
  if (current.revision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Regional chart revision capacity exhausted");
  }

  const byKey = new Map<string, {
    coord: RegionCoord;
    marks: Map<number, RegionalCartographyMark>;
  }>();
  for (const record of current.regions) {
    byKey.set(record.key, {
      coord: record.coord,
      marks: new Map(record.marks.map((mark) => [mark.tileIndex, mark])),
    });
  }

  let changed = false;
  for (let windowIndex = 0; windowIndex < count; windowIndex += 1) {
    const address = window.addresses[windowIndex];
    if (!address) throw new RangeError("Regional chart window lost a tile address");
    const learned = canonicalKnowledge(discovered[windowIndex], false);
    const sounded = canonicalKnowledge(depthSoundings[windowIndex], false);
    if (learned === 0 && sounded === 0) continue;
    const key = regionKey(address.region);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { coord: address.region, marks: new Map() };
      byKey.set(key, entry);
    }
    const tileIndex = address.localY * WORLD_WIDTH + address.localX;
    const prior = entry.marks.get(tileIndex);
    const next: RegionalCartographyMark = {
      tileIndex,
      discovered: Math.max(prior?.discovered ?? 0, learned),
      depthSounding: Math.max(prior?.depthSounding ?? 0, sounded),
    };
    if (!prior || stableStringify(prior) !== stableStringify(next)) {
      entry.marks.set(tileIndex, Object.freeze(next));
      changed = true;
    }
  }
  if (!changed) return current;
  if (byKey.size > REGIONAL_CARTOGRAPHY_MAX_REGIONS) {
    throw new RangeError("Regional chart exceeds its visited-region budget");
  }
  return seal({
    version: REGIONAL_CARTOGRAPHY_VERSION,
    rootSeedHash: current.rootSeedHash,
    revision: current.revision + 1,
    regions: materializeRecords(byKey),
  });
}

/** Hydrate the precise moving window without retaining generated terrain. */
export function projectRegionalCartographyWindow(
  state: RegionalCartographyState,
  window: RegionalTerrainWindow,
): RegionalCartographyWindow {
  const current = requireState(state);
  const byKey = new Map(current.regions.map((record) => [record.key, record]));
  const markMaps = new Map<string, ReadonlyMap<number, RegionalCartographyMark>>();
  const discovered: number[] = [];
  const depthSoundings: number[] = [];
  for (const address of window.addresses) {
    const key = regionKey(address.region);
    let marks = markMaps.get(key);
    if (!marks) {
      const record = byKey.get(key);
      marks = new Map(record?.marks.map((mark) => [mark.tileIndex, mark]) ?? []);
      markMaps.set(key, marks);
    }
    const mark = marks.get(address.localY * WORLD_WIDTH + address.localX);
    discovered.push(mark?.discovered ?? 0);
    depthSoundings.push(mark?.depthSounding ?? 0);
  }
  return deepFreeze({ discovered, depthSoundings });
}

/** Exact dense arrays used only for compatibility APIs and migration tests. */
export function projectRegionalCartographyRegion(
  state: RegionalCartographyState,
  coord: RegionCoord,
): RegionalCartographyWindow {
  const current = requireState(state);
  if (!isRegionCoord(coord)) throw new RangeError("Regional chart coordinate is not canonical");
  const discovered = Array.from({ length: WORLD_WIDTH * WORLD_HEIGHT }, () => 0);
  const depthSoundings = Array.from({ length: WORLD_WIDTH * WORLD_HEIGHT }, () => 0);
  const record = current.regions.find((candidate) => candidate.key === regionKey(coord));
  for (const mark of record?.marks ?? []) {
    discovered[mark.tileIndex] = mark.discovered;
    depthSoundings[mark.tileIndex] = mark.depthSounding;
  }
  return deepFreeze({ discovered, depthSoundings });
}

export function serializeRegionalCartography(state: RegionalCartographyState): string {
  const current = requireState(state);
  const encoded = stableStringify(current);
  if (UTF8_ENCODER.encode(encoded).byteLength > REGIONAL_CARTOGRAPHY_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional chart exceeds its serialized save budget");
  }
  return encoded;
}

export function restoreRegionalCartography(
  rootSeed: RootSeed,
  text: string,
): RegionalCartographyState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_CARTOGRAPHY_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!plainRecord(parsed) || !exactKeys(parsed, [
      "integrity", "regions", "revision", "rootSeedHash", "version",
    ])) return null;
    if (
      parsed.version !== REGIONAL_CARTOGRAPHY_VERSION
      || parsed.rootSeedHash !== hashCanonical(canonicalRootSeed(rootSeed))
      || !Number.isSafeInteger(parsed.revision)
      || (parsed.revision as number) < 0
      || typeof parsed.integrity !== "string"
      || !HASH_PATTERN.test(parsed.integrity)
      || !Array.isArray(parsed.regions)
      || parsed.regions.length > REGIONAL_CARTOGRAPHY_MAX_REGIONS
    ) return null;
    const regions = parseRecords(parsed.regions);
    if (!regions) return null;
    const payload: CartographyPayload = {
      version: REGIONAL_CARTOGRAPHY_VERSION,
      rootSeedHash: parsed.rootSeedHash,
      revision: parsed.revision as number,
      regions,
    };
    if (hashCanonical(payload) !== parsed.integrity) return null;
    const restored = seal(payload);
    return stableStringify(restored) === text ? restored : null;
  } catch {
    return null;
  }
}

function parseRecords(values: readonly unknown[]): readonly RegionalCartographyRecord[] | null {
  const records: RegionalCartographyRecord[] = [];
  let priorKey = "";
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, ["coord", "key", "marks"])) return null;
    if (!isRegionCoord(value.coord) || !plainRecord(value.coord)
      || !exactKeys(value.coord, ["x", "y"])) return null;
    const coord = createRegionCoord(value.coord.x, value.coord.y);
    const key = regionKey(coord);
    if (value.key !== key || key <= priorKey || !Array.isArray(value.marks) || value.marks.length === 0
      || value.marks.length > WORLD_WIDTH * WORLD_HEIGHT) return null;
    priorKey = key;
    const marks: RegionalCartographyMark[] = [];
    let priorTileIndex = -1;
    for (const rawMark of value.marks) {
      if (!plainRecord(rawMark) || !exactKeys(rawMark, [
        "depthSounding", "discovered", "tileIndex",
      ])) return null;
      if (
        !Number.isSafeInteger(rawMark.tileIndex)
        || (rawMark.tileIndex as number) <= priorTileIndex
        || (rawMark.tileIndex as number) >= WORLD_WIDTH * WORLD_HEIGHT
      ) return null;
      const discovered = canonicalKnowledge(rawMark.discovered, true);
      const depthSounding = canonicalKnowledge(rawMark.depthSounding, true);
      if (discovered === 0 && depthSounding === 0) return null;
      priorTileIndex = rawMark.tileIndex as number;
      marks.push(Object.freeze({ tileIndex: priorTileIndex, discovered, depthSounding }));
    }
    records.push(deepFreeze({ coord, key, marks }));
  }
  return Object.freeze(records);
}

function recordFromDense(
  coord: RegionCoord,
  discovered: readonly number[],
  depthSoundings: readonly number[],
  migrate: boolean,
): RegionalCartographyRecord {
  const count = WORLD_WIDTH * WORLD_HEIGHT;
  if (discovered.length !== count || depthSoundings.length !== count) {
    throw new RangeError("Compatibility chart dimensions do not match region 0,0");
  }
  const marks: RegionalCartographyMark[] = [];
  for (let tileIndex = 0; tileIndex < count; tileIndex += 1) {
    const learned = canonicalKnowledge(discovered[tileIndex], !migrate);
    const sounded = canonicalKnowledge(depthSoundings[tileIndex], !migrate);
    if (learned > 0 || sounded > 0) {
      marks.push(Object.freeze({ tileIndex, discovered: learned, depthSounding: sounded }));
    }
  }
  return deepFreeze({ coord, key: regionKey(coord), marks });
}

function materializeRecords(
  byKey: ReadonlyMap<string, { coord: RegionCoord; marks: ReadonlyMap<number, RegionalCartographyMark> }>,
): readonly RegionalCartographyRecord[] {
  return Object.freeze([...byKey.entries()]
    .filter(([, value]) => value.marks.size > 0)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, value]) => deepFreeze({
      coord: createRegionCoord(value.coord.x, value.coord.y),
      key,
      marks: [...value.marks.values()].sort((left, right) => left.tileIndex - right.tileIndex),
    })));
}

function canonicalKnowledge(value: unknown, strict: boolean): number {
  if (!Number.isFinite(value)) {
    if (strict) throw new RangeError("Regional chart knowledge is not finite");
    return 0;
  }
  const integer = Math.trunc(value as number);
  if (strict && (integer !== value || integer < 0 || integer > FIXED_POINT)) {
    throw new RangeError("Regional chart knowledge is not canonical");
  }
  return Math.max(0, Math.min(FIXED_POINT, integer));
}

function seal(payload: CartographyPayload): RegionalCartographyState {
  const canonicalPayload: CartographyPayload = deepFreeze({
    version: REGIONAL_CARTOGRAPHY_VERSION,
    rootSeedHash: payload.rootSeedHash,
    revision: payload.revision,
    regions: [...payload.regions],
  });
  const state = deepFreeze({
    ...canonicalPayload,
    integrity: hashCanonical(canonicalPayload),
  });
  TRUSTED_CARTOGRAPHY.add(state);
  return state;
}

function requireState(value: RegionalCartographyState): RegionalCartographyState {
  if (value !== null && typeof value === "object" && TRUSTED_CARTOGRAPHY.has(value)) return value;
  throw new RangeError("Regional chart was not created by the canonical kernel");
}

function canonicalRootSeed(value: RootSeed): RootSeed {
  if (
    !Array.isArray(value)
    || value.length !== 4
    || !value.every((word) => Number.isSafeInteger(word)
      && word >= 0 && word <= UINT32_MAX && !Object.is(word, -0))
  ) throw new RangeError("Regional chart requires exactly four canonical uint32 seed words");
  return Object.freeze([value[0], value[1], value[2], value[3]]) as RootSeed;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
