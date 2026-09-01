import { keyedRandomU32, type RootSeed } from "./rng";
import {
  createRegionCoord,
  isRegionCoord,
  regionKey,
  regionLocalToGlobalTile,
  stableRegionId,
  type RegionCoord,
} from "./regions";
import { generateTerrain } from "./terrain";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainKind,
  type TerrainState,
  type TerrainTile,
} from "./types";
import { clampInteger, stableStringify } from "./util";

export const REGION_TERRAIN_VERSION = 1 as const;

export interface RegionTerrainManifest {
  readonly version: typeof REGION_TERRAIN_VERSION;
  readonly coord: RegionCoord;
  readonly key: string;
  readonly regionId: string;
  readonly terrainHash: string;
}

export interface GeneratedRegionTerrain {
  readonly manifest: RegionTerrainManifest;
  readonly terrain: TerrainState;
}

export interface RegionTerrainSampler {
  /** Samples one exact baseline tile without materializing an entire neighbor. */
  readonly sample: (coord: RegionCoord, localX: number, localY: number) => TerrainTile;
}

/** Canonical 128-bit fingerprint for derived baseline terrain manifests. */
export function regionTerrainHash(terrain: TerrainState): string {
  const encoded = `tideweft-region-terrain/1:${stableStringify(terrain)}`;
  let first = 0x811c_9dc5;
  let second = 0x9e37_79b9;
  let third = 0xc2b2_ae35;
  let fourth = 0x27d4_eb2f;
  for (let index = 0; index < encoded.length; index += 1) {
    const code = encoded.charCodeAt(index);
    first = Math.imul(first ^ code, 0x0100_0193) >>> 0;
    second = Math.imul(second ^ code ^ (first >>> 13), 0x85eb_ca6b) >>> 0;
    third = Math.imul(third ^ code ^ (second >>> 11), 0xc2b2_ae35) >>> 0;
    fourth = Math.imul(fourth ^ code ^ (third >>> 16), 0x27d4_eb2f) >>> 0;
  }
  return [first, second, third, fourth]
    .map((lane) => lane.toString(16).padStart(8, "0"))
    .join("");
}

const UINT32_MAX = 0xffff_ffff;
const UINT32_RANGE = 0x1_0000_0000;
const GLOBAL_TERRAIN_DOMAIN = 0x5247_544e;
const ELEVATION_BROAD_DOMAIN = 0x5247_4501;
const ELEVATION_DETAIL_DOMAIN = 0x5247_4502;
const ELEVATION_CONTINENT_DOMAIN = 0x5247_4503;
const CHANNEL_DOMAIN = 0x5247_4304;
const MOISTURE_DOMAIN = 0x5247_4d05;
const ROUGHNESS_DOMAIN = 0x5247_5206;
const COMPATIBILITY_BLEND_TILES = 24;

interface TerrainSignals {
  readonly elevation: number;
  readonly moisture: number;
  readonly roughness: number;
}

interface LegacyField {
  readonly terrain: TerrainState;
}

function assertRootSeed(seed: RootSeed): void {
  const value: unknown = seed;
  if (
    !Array.isArray(value)
    || value.length !== 4
    || !value.every((word) =>
      Number.isSafeInteger(word)
      && word >= 0
      && word <= UINT32_MAX
      && !Object.is(word, -0))
  ) throw new TypeError("Region terrain requires exactly four unsigned 32-bit seed words");
}

function terrainKind(elevation: number): TerrainKind {
  if (elevation < 180_000) return "deep-water";
  if (elevation < 330_000) return "tidal-flat";
  if (elevation < 470_000) return "marsh";
  if (elevation < 760_000) return "meadow";
  return "ridge";
}

function travelCost(kind: TerrainKind, roughness: number): number {
  const roughnessCost = Math.trunc(roughness / 5_000);
  switch (kind) {
    case "deep-water": return 1_100 + roughnessCost;
    case "tidal-flat": return 360 + roughnessCost;
    case "marsh": return 270 + roughnessCost;
    case "meadow": return 120 + roughnessCost;
    case "ridge": return 440 + roughnessCost;
  }
}

function smoothUnit(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * bounded * (bounded * (bounded * 6 - 15) + 10);
}

function interpolateInteger(left: number, right: number, amount: number): number {
  return Math.trunc(left + (right - left) * amount);
}

/** Signed integer value sample addressed independently by both lattice axes. */
function latticeValue(
  seed: RootSeed,
  latticeX: number,
  latticeY: number,
  domain: number,
): number {
  const sample = keyedRandomU32(
    seed,
    GLOBAL_TERRAIN_DOMAIN,
    latticeX,
    latticeY,
    domain,
  );
  return Math.trunc((sample * (2 * FIXED_POINT)) / UINT32_RANGE) - FIXED_POINT;
}

/** Smooth global-coordinate value noise. Negative remainders are floor-correct. */
function valueNoise(
  seed: RootSeed,
  globalX: number,
  globalY: number,
  cellSize: number,
  domain: number,
): number {
  const west = Math.floor(globalX / cellSize);
  const north = Math.floor(globalY / cellSize);
  const east = west + 1;
  const south = north + 1;
  const localX = globalX - west * cellSize;
  const localY = globalY - north * cellSize;
  const amountX = smoothUnit(localX / cellSize);
  const amountY = smoothUnit(localY / cellSize);
  const northBlend = interpolateInteger(
    latticeValue(seed, west, north, domain),
    latticeValue(seed, east, north, domain),
    amountX,
  );
  const southBlend = interpolateInteger(
    latticeValue(seed, west, south, domain),
    latticeValue(seed, east, south, domain),
    amountX,
  );
  return interpolateInteger(northBlend, southBlend, amountY);
}

function fractalNoise(
  seed: RootSeed,
  globalX: number,
  globalY: number,
  baseCellSize: number,
  octaves: number,
  domain: number,
  persistence: number,
): number {
  let total = 0;
  let totalWeight = 0;
  let weight = FIXED_POINT;
  let cellSize = baseCellSize;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += Math.trunc(
      (valueNoise(seed, globalX, globalY, cellSize, domain + octave * 977) * weight)
      / FIXED_POINT,
    );
    totalWeight += weight;
    weight = Math.max(1, Math.trunc(weight * persistence));
    cellSize = Math.max(2, Math.trunc(cellSize / 2));
  }
  return totalWeight === 0
    ? 0
    : Math.trunc((total * FIXED_POINT) / totalWeight);
}

function globalSignals(seed: RootSeed, globalX: number, globalY: number): TerrainSignals {
  const broad = fractalNoise(
    seed,
    globalX,
    globalY,
    176,
    4,
    ELEVATION_BROAD_DOMAIN,
    0.54,
  );
  const detail = fractalNoise(
    seed,
    globalX,
    globalY,
    38,
    3,
    ELEVATION_DETAIL_DOMAIN,
    0.46,
  );
  const continent = fractalNoise(
    seed,
    globalX,
    globalY,
    448,
    3,
    ELEVATION_CONTINENT_DOMAIN,
    0.58,
  );
  const channelField = Math.abs(fractalNoise(
    seed,
    globalX,
    globalY,
    104,
    3,
    CHANNEL_DOMAIN,
    0.5,
  ));
  const channelCut = Math.max(0, 245_000 - Math.trunc(channelField * 0.72));
  const elevation = clampInteger(
    510_000
      + Math.trunc((broad * 235_000) / FIXED_POINT)
      + Math.trunc((detail * 88_000) / FIXED_POINT)
      + Math.trunc((continent * 135_000) / FIXED_POINT)
      - channelCut,
  );
  const moistureNoise = fractalNoise(
    seed,
    globalX,
    globalY,
    92,
    3,
    MOISTURE_DOMAIN,
    0.55,
  );
  const moisture = clampInteger(
    610_000
      - Math.trunc(Math.max(0, elevation - 590_000) / 3)
      + Math.trunc(channelCut * 0.72)
      + Math.trunc((moistureNoise * 205_000) / FIXED_POINT)
      + Math.trunc((detail * 45_000) / FIXED_POINT),
  );
  const rockField = fractalNoise(
    seed,
    globalX,
    globalY,
    61,
    3,
    ROUGHNESS_DOMAIN,
    0.49,
  );
  const roughness = clampInteger(
    80_000
      + Math.trunc((Math.abs(broad - detail) * 195_000) / FIXED_POINT)
      + Math.trunc((Math.abs(detail) * 285_000) / FIXED_POINT)
      + Math.trunc((Math.abs(rockField) * 180_000) / FIXED_POINT),
  );
  return { elevation, moisture, roughness };
}

function fieldValue(tile: TerrainTile, field: keyof TerrainSignals): number {
  return tile[field];
}

function compatibilityProjection(
  legacy: TerrainState,
  globalX: number,
  globalY: number,
  field: keyof TerrainSignals,
  maximumStep: number,
): { readonly value: number; readonly distance: number } | null {
  const anchorX = Math.max(0, Math.min(WORLD_WIDTH - 1, globalX));
  const anchorY = Math.max(0, Math.min(WORLD_HEIGHT - 1, globalY));
  const deltaX = globalX - anchorX;
  const deltaY = globalY - anchorY;
  const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  if (distance === 0 || distance > COMPATIBILITY_BLEND_TILES) return null;
  const anchor = legacy.tiles[anchorY * WORLD_WIDTH + anchorX];
  if (!anchor) throw new Error("Compatibility terrain is missing an edge tile");
  let projected = fieldValue(anchor, field);
  if (deltaX !== 0) {
    const inwardX = anchorX - Math.sign(deltaX);
    const inward = legacy.tiles[anchorY * WORLD_WIDTH + inwardX];
    if (inward) {
      const step = Math.max(
        -maximumStep,
        Math.min(maximumStep, fieldValue(anchor, field) - fieldValue(inward, field)),
      );
      projected += step * Math.abs(deltaX);
    }
  }
  if (deltaY !== 0) {
    const inwardY = anchorY - Math.sign(deltaY);
    const inward = legacy.tiles[inwardY * WORLD_WIDTH + anchorX];
    if (inward) {
      const step = Math.max(
        -maximumStep,
        Math.min(maximumStep, fieldValue(anchor, field) - fieldValue(inward, field)),
      );
      projected += step * Math.abs(deltaY);
    }
  }
  const maximumDeparture = maximumStep * distance;
  projected = Math.max(
    fieldValue(anchor, field) - maximumDeparture,
    Math.min(fieldValue(anchor, field) + maximumDeparture, projected),
  );
  return { value: clampInteger(projected), distance };
}

function blendCompatibilitySignals(
  target: TerrainSignals,
  legacyField: LegacyField | null,
  globalX: number,
  globalY: number,
): TerrainSignals {
  if (!legacyField) return target;
  const elevation = compatibilityProjection(
    legacyField.terrain,
    globalX,
    globalY,
    "elevation",
    62_000,
  );
  if (!elevation) return target;
  const moisture = compatibilityProjection(
    legacyField.terrain,
    globalX,
    globalY,
    "moisture",
    80_000,
  );
  const roughness = compatibilityProjection(
    legacyField.terrain,
    globalX,
    globalY,
    "roughness",
    96_000,
  );
  if (!moisture || !roughness) throw new Error("Compatibility blend fields diverged");
  const amount = smoothUnit(elevation.distance / COMPATIBILITY_BLEND_TILES);
  return {
    elevation: clampInteger(interpolateInteger(elevation.value, target.elevation, amount)),
    moisture: clampInteger(interpolateInteger(moisture.value, target.moisture, amount)),
    roughness: clampInteger(interpolateInteger(roughness.value, target.roughness, amount)),
  };
}

/**
 * Generate one bounded compatibility-sized region from stable global tile
 * coordinates. No cache or mutable random cursor survives this call.
 */
export function generateRegionTerrain(
  rootSeed: RootSeed,
  coord: RegionCoord,
): TerrainState {
  assertRootSeed(rootSeed);
  if (!isRegionCoord(coord)) {
    throw new RangeError("Region coordinate is outside the supported world");
  }
  if (coord.x === 0 && coord.y === 0) return generateTerrain(rootSeed);
  const sampler = createRegionTerrainSampler(rootSeed);
  const tiles: TerrainTile[] = [];
  for (let localY = 0; localY < WORLD_HEIGHT; localY += 1) {
    for (let localX = 0; localX < WORLD_WIDTH; localX += 1) {
      tiles.push(sampler.sample(coord, localX, localY));
    }
  }
  return { width: WORLD_WIDTH, height: WORLD_HEIGHT, tiles };
}

/**
 * Creates an order-independent tile sampler for streamed borders and corner
 * halos. Compatibility terrain is generated lazily at most once per sampler,
 * while distant samples remain direct global-coordinate noise lookups.
 */
export function createRegionTerrainSampler(rootSeed: RootSeed): RegionTerrainSampler {
  assertRootSeed(rootSeed);
  const seed = Object.freeze([...rootSeed]) as RootSeed;
  let compatibilityTerrain: TerrainState | null = null;
  const legacy = (): TerrainState => {
    compatibilityTerrain ??= generateTerrain(seed);
    return compatibilityTerrain;
  };

  return Object.freeze({
    sample: (coord: RegionCoord, localX: number, localY: number): TerrainTile => {
      if (!isRegionCoord(coord)) {
        throw new RangeError("Region coordinate is outside the supported world");
      }
      if (
        !Number.isSafeInteger(localX)
        || !Number.isSafeInteger(localY)
        || localX < 0
        || localX >= WORLD_WIDTH
        || localY < 0
        || localY >= WORLD_HEIGHT
      ) throw new RangeError("Region terrain sample is outside its local tile bounds");

      const index = localY * WORLD_WIDTH + localX;
      if (coord.x === 0 && coord.y === 0) {
        const tile = legacy().tiles[index];
        if (!tile) throw new Error("Compatibility terrain sample is missing");
        return { ...tile };
      }

      const global = regionLocalToGlobalTile(coord, localX, localY);
      const legacyField: LegacyField | null = Math.abs(coord.x) <= 1 && Math.abs(coord.y) <= 1
        ? { terrain: legacy() }
        : null;
      const signals = blendCompatibilitySignals(
        globalSignals(seed, global.x, global.y),
        legacyField,
        global.x,
        global.y,
      );
      const terrain = terrainKind(signals.elevation);
      return {
        index,
        x: localX,
        y: localY,
        elevation: signals.elevation,
        moisture: signals.moisture,
        roughness: signals.roughness,
        terrain,
        baseTravelCost: travelCost(terrain, signals.roughness),
        traceStrength: 0,
      };
    },
  });
}

export function generateRegionTerrainBundle(
  rootSeed: RootSeed,
  coord: RegionCoord,
): GeneratedRegionTerrain {
  const terrain = generateRegionTerrain(rootSeed, coord);
  const canonicalCoord = createRegionCoord(coord.x, coord.y);
  const manifest = Object.freeze({
    version: REGION_TERRAIN_VERSION,
    coord: canonicalCoord,
    key: regionKey(canonicalCoord),
    regionId: stableRegionId(rootSeed, canonicalCoord),
    terrainHash: regionTerrainHash(terrain),
  });
  return Object.freeze({
    manifest,
    terrain,
  });
}

export function serializeRegionTerrainManifest(manifest: RegionTerrainManifest): string {
  if (!canonicalManifestShape(manifest)) {
    throw new TypeError("Cannot serialize an invalid region terrain manifest");
  }
  return stableStringify(manifest);
}

export function parseRegionTerrainManifest(text: string): RegionTerrainManifest | null {
  if (typeof text !== "string" || text.length === 0 || text.length > 1_024) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!canonicalManifestShape(parsed)) return null;
    if (stableStringify(parsed) !== text) return null;
    const coord = createRegionCoord(parsed.coord.x, parsed.coord.y);
    return Object.freeze({ ...parsed, coord });
  } catch {
    return null;
  }
}

export function validateRegionTerrainManifest(
  rootSeed: RootSeed,
  manifest: RegionTerrainManifest,
): boolean {
  try {
    assertRootSeed(rootSeed);
    if (!canonicalManifestShape(manifest)) return false;
    const generated = generateRegionTerrainBundle(rootSeed, manifest.coord).manifest;
    return generated.key === manifest.key
      && generated.regionId === manifest.regionId
      && generated.terrainHash === manifest.terrainHash;
  } catch {
    return false;
  }
}

function canonicalManifestShape(value: unknown): value is RegionTerrainManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<RegionTerrainManifest>;
  if (
    candidate.version !== REGION_TERRAIN_VERSION
    || !isRegionCoord(candidate.coord)
    || typeof candidate.key !== "string"
    || candidate.key !== regionKey(candidate.coord)
    || typeof candidate.regionId !== "string"
    || !/^rg1:[0-9a-f]{32}:(0|-?[1-9]\d*):(0|-?[1-9]\d*)$/u.test(candidate.regionId)
    || typeof candidate.terrainHash !== "string"
    || !/^[0-9a-f]{32}$/u.test(candidate.terrainHash)
  ) return false;
  if (Object.keys(candidate.coord as unknown as Record<string, unknown>).sort().join(",") !== "x,y") {
    return false;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return keys.join(",") === "coord,key,regionId,terrainHash,version";
}
