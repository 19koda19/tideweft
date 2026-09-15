import { isRegionCoord, type RegionTileAddress } from "./regions";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainKind,
  type WeatherKind,
} from "./types";
import { projectWorldTime } from "./worldTime";

export const OUTDOOR_ILLUMINATION_VERSION = 1 as const;

/**
 * Callers must spatially query nearby lights before evaluation. Keeping this
 * cap here makes a light sample bounded even inside a dense settlement.
 */
export const MAX_OUTDOOR_LOCAL_LIGHT_SOURCES = 16 as const;
export const MAX_OUTDOOR_LOCAL_LIGHT_RADIUS_TILES = 64 as const;

export const OUTDOOR_LOCAL_LIGHT_KINDS = [
  "settlement-lamp",
  "fire",
  "lantern",
  "other",
] as const;

export type OutdoorLocalLightKind = (typeof OUTDOOR_LOCAL_LIGHT_KINDS)[number];

/**
 * A tile-addressed physical light source. `lineTransmission` must come from
 * simulation geometry (zero for an opaque blocked ray), never rendered pixels.
 * Intensity and transmission are fixed-point values in the inclusive 0..1
 * range. Radius is an integer number of world tiles.
 */
export interface OutdoorLocalLightSource {
  readonly stableId: string;
  readonly kind: OutdoorLocalLightKind;
  readonly position: RegionTileAddress;
  readonly intensity: number;
  readonly radiusTiles: number;
  readonly lineTransmission: number;
}

export interface OutdoorIlluminationTerrain {
  readonly kind: TerrainKind;
  readonly roughness: number;
}

export interface OutdoorIlluminationInput {
  /** Existing authoritative simulation tick; no renderer or wall clock input. */
  readonly tick: number;
  readonly weather: Readonly<{
    readonly kind: WeatherKind;
    readonly intensity: number;
  }>;
  readonly target: RegionTileAddress;
  readonly terrain: OutdoorIlluminationTerrain;
  /** Physical overhead canopy/structure transmission, fixed-point 0..1. */
  readonly coverTransmission: number;
  readonly localLights?: readonly OutdoorLocalLightSource[];
}

/**
 * Every illumination channel is authoritative fixed-point 0..1. Presentation
 * legibility, exposure, palette, gamma, and accessibility brightness are
 * deliberately absent: renderers may derive them but must never feed them back
 * into perception or world rules.
 */
export interface OutdoorIlluminationSample {
  readonly version: typeof OUTDOOR_ILLUMINATION_VERSION;
  readonly tick: number;
  readonly openSkyIllumination: number;
  readonly weatherTransmission: number;
  readonly terrainTransmission: number;
  readonly coverTransmission: number;
  readonly ambientIllumination: number;
  readonly localIllumination: number;
  readonly physicalIllumination: number;
  readonly localSourcesConsidered: number;
  readonly localSourcesContributing: number;
}

const LOCAL_LIGHT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/;
const LOCAL_LIGHT_KIND_SET = new Set<string>(OUTDOOR_LOCAL_LIGHT_KINDS);
const WEATHER_KIND_SET = new Set<string>(["clear", "mist", "rain", "storm"]);
const TERRAIN_KIND_SET = new Set<string>([
  "deep-water",
  "tidal-flat",
  "marsh",
  "meadow",
  "ridge",
]);

/**
 * Derives one local outdoor light sample from world time and physical world
 * state. Malformed or unbounded input fails closed with `null`.
 */
export function evaluateOutdoorIllumination(
  input: OutdoorIlluminationInput,
): OutdoorIlluminationSample | null {
  const raw: unknown = input;
  if (!plainRecord(raw)) return null;
  const time = projectWorldTime(raw.tick);
  const weather = canonicalWeather(raw.weather);
  const target = canonicalTileAddress(raw.target);
  const terrain = canonicalTerrain(raw.terrain);
  const coverTransmission = canonicalUnit(raw.coverTransmission);
  const localLights = raw.localLights === undefined
    ? Object.freeze([] as OutdoorLocalLightSource[])
    : canonicalLocalLights(raw.localLights);
  if (
    time === null
    || weather === null
    || target === null
    || terrain === null
    || coverTransmission === null
    || localLights === null
  ) return null;

  const weatherTransmission = outdoorWeatherTransmission(weather.kind, weather.intensity);
  const terrainTransmission = outdoorTerrainTransmission(terrain.kind, terrain.roughness);
  const ambientIllumination = multiplyFixed(
    multiplyFixed(
      multiplyFixed(time.illumination, weatherTransmission),
      terrainTransmission,
    ),
    coverTransmission,
  );

  let localIllumination = 0;
  let localSourcesContributing = 0;
  // Canonical order ensures future diagnostics cannot inherit region-streaming
  // or caller insertion order. Integer summation itself is exact and
  // order-independent. No source identity is disclosed in the sample: light
  // reaching a tile is not proof that an observer identified its source.
  const orderedLights = [...localLights].sort((left, right) =>
    left.stableId < right.stableId ? -1 : left.stableId > right.stableId ? 1 : 0);
  for (const source of orderedLights) {
    const attenuation = localLightAttenuation(target, source.position, source.radiusTiles);
    const contribution = multiplyFixed(
      multiplyFixed(
        multiplyFixed(source.intensity, attenuation),
        source.lineTransmission,
      ),
      weatherTransmission,
    );
    if (contribution <= 0) continue;
    localSourcesContributing += 1;
    localIllumination = clampUnit(localIllumination + contribution);
  }

  return Object.freeze({
    version: OUTDOOR_ILLUMINATION_VERSION,
    tick: time.tick,
    openSkyIllumination: time.illumination,
    weatherTransmission,
    terrainTransmission,
    coverTransmission,
    ambientIllumination,
    localIllumination,
    physicalIllumination: clampUnit(ambientIllumination + localIllumination),
    localSourcesConsidered: localLights.length,
    localSourcesContributing,
  });
}

/** Weather-filtered light transmission, shared by sky and local outdoor light. */
export function outdoorWeatherTransmission(kind: WeatherKind, intensity: number): number {
  const boundedIntensity = canonicalUnit(intensity);
  if (!WEATHER_KIND_SET.has(kind) || boundedIntensity === null) return 0;
  const maximumLoss = kind === "clear"
    ? 0
    : kind === "mist"
      ? 550_000
      : kind === "rain"
        ? 380_000
        : 670_000;
  return FIXED_POINT - multiplyFixed(boundedIntensity, maximumLoss);
}

/**
 * Bounded v1 sky-view approximation over the terrain data that exists today.
 * Explicit physical cover is applied separately, so later foliage/interior
 * owners can replace this coarse terrain term without changing world time.
 */
export function outdoorTerrainTransmission(kind: TerrainKind, roughness: number): number {
  const boundedRoughness = canonicalUnit(roughness);
  if (!TERRAIN_KIND_SET.has(kind) || boundedRoughness === null) return 0;
  switch (kind) {
    case "deep-water":
      return FIXED_POINT;
    case "tidal-flat":
      return 970_000 - multiplyFixed(boundedRoughness, 30_000);
    case "ridge":
      return 980_000 - multiplyFixed(boundedRoughness, 20_000);
    case "meadow":
      return 940_000 - multiplyFixed(boundedRoughness, 90_000);
    case "marsh":
      return 820_000 - multiplyFixed(boundedRoughness, 220_000);
  }
}

function canonicalWeather(value: unknown): Readonly<{
  kind: WeatherKind;
  intensity: number;
}> | null {
  if (!plainRecord(value)) return null;
  const kind = value.kind;
  const intensity = canonicalUnit(value.intensity);
  if (typeof kind !== "string" || !WEATHER_KIND_SET.has(kind) || intensity === null) return null;
  return Object.freeze({ kind: kind as WeatherKind, intensity });
}

function canonicalTerrain(value: unknown): OutdoorIlluminationTerrain | null {
  if (!plainRecord(value)) return null;
  const kind = value.kind;
  const roughness = canonicalUnit(value.roughness);
  if (typeof kind !== "string" || !TERRAIN_KIND_SET.has(kind) || roughness === null) return null;
  return Object.freeze({ kind: kind as TerrainKind, roughness });
}

function canonicalLocalLights(value: unknown): readonly OutdoorLocalLightSource[] | null {
  if (!Array.isArray(value) || value.length > MAX_OUTDOOR_LOCAL_LIGHT_SOURCES) return null;
  const seen = new Set<string>();
  const result: OutdoorLocalLightSource[] = [];
  for (const candidate of value) {
    const source = canonicalLocalLight(candidate);
    if (source === null || seen.has(source.stableId)) return null;
    seen.add(source.stableId);
    result.push(source);
  }
  return Object.freeze(result);
}

function canonicalLocalLight(value: unknown): OutdoorLocalLightSource | null {
  if (!plainRecord(value)) return null;
  const stableId = value.stableId;
  const kind = value.kind;
  const position = canonicalTileAddress(value.position);
  const intensity = canonicalUnit(value.intensity);
  const radiusTiles = value.radiusTiles;
  const lineTransmission = canonicalUnit(value.lineTransmission);
  if (
    typeof stableId !== "string"
    || !LOCAL_LIGHT_ID_PATTERN.test(stableId)
    || typeof kind !== "string"
    || !LOCAL_LIGHT_KIND_SET.has(kind)
    || position === null
    || intensity === null
    || !Number.isSafeInteger(radiusTiles)
    || (radiusTiles as number) <= 0
    || (radiusTiles as number) > MAX_OUTDOOR_LOCAL_LIGHT_RADIUS_TILES
    || lineTransmission === null
  ) return null;
  return Object.freeze({
    stableId,
    kind: kind as OutdoorLocalLightKind,
    position,
    intensity,
    radiusTiles: radiusTiles as number,
    lineTransmission,
  });
}

function canonicalTileAddress(value: unknown): RegionTileAddress | null {
  if (!plainRecord(value) || !isRegionCoord(value.region)) return null;
  const localX = value.localX;
  const localY = value.localY;
  if (
    !Number.isSafeInteger(localX)
    || !Number.isSafeInteger(localY)
    || (localX as number) < 0
    || (localX as number) >= WORLD_WIDTH
    || (localY as number) < 0
    || (localY as number) >= WORLD_HEIGHT
  ) return null;
  return Object.freeze({
    region: Object.freeze({ x: value.region.x, y: value.region.y }),
    localX: localX as number,
    localY: localY as number,
  });
}

function localLightAttenuation(
  target: RegionTileAddress,
  source: RegionTileAddress,
  radiusTiles: number,
): number {
  const deltaX = (BigInt(source.region.x) - BigInt(target.region.x)) * BigInt(WORLD_WIDTH)
    + BigInt(source.localX - target.localX);
  const deltaY = (BigInt(source.region.y) - BigInt(target.region.y)) * BigInt(WORLD_HEIGHT)
    + BigInt(source.localY - target.localY);
  const distanceSquared = deltaX * deltaX + deltaY * deltaY;
  const radiusSquared = BigInt(radiusTiles) * BigInt(radiusTiles);
  if (distanceSquared >= radiusSquared) return 0;
  return Number((radiusSquared - distanceSquared) * BigInt(FIXED_POINT) / radiusSquared);
}

function canonicalUnit(value: unknown): number | null {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= FIXED_POINT
    ? value as number
    : null;
}

function multiplyFixed(left: number, right: number): number {
  return Number(BigInt(left) * BigInt(right) / BigInt(FIXED_POINT));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(FIXED_POINT, Math.trunc(value)));
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
