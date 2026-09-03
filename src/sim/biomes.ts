import { keyedRandomInt, type RootSeed } from "./rng";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainKind,
  type TerrainTile,
  type WeatherState,
} from "./types";

/** Stable presentation/gameplay categories derived from existing terrain and climate signals. */
export const BIOME_IDS = [
  "tide-channel",
  "brine-flat",
  "reed-marsh",
  "rain-meadow",
  "sun-meadow",
  "wind-ridge",
  "glimmerfen",
] as const;

export type BiomeId = (typeof BIOME_IDS)[number];

export type BiomeTerrainInput = Pick<
  TerrainTile,
  "index" | "x" | "y" | "elevation" | "moisture" | "roughness" | "terrain"
>;

export type BiomeWeatherInput = Pick<WeatherState, "kind" | "intensity" | "windX" | "windY">;

/** Every channel is an integer in the simulation's fixed-point 0..1 range. */
export interface BiomeClimate {
  readonly rainfall: number;
  readonly heat: number;
  readonly salinity: number;
  readonly exposure: number;
  readonly magicalWater: number;
}

/**
 * Derived loads/capacities for future systems. They are signals, not resources
 * or currencies, and remain fixed-point integers in the 0..1 range.
 */
export interface BiomeInteraction {
  readonly rainRetention: number;
  readonly heatLoad: number;
  readonly saltStress: number;
  readonly magicalResonance: number;
}

export interface BiomeProfile {
  readonly id: BiomeId;
  readonly climate: BiomeClimate;
  readonly interaction: BiomeInteraction;
}

export interface BiomeProfileInput {
  readonly seed: RootSeed;
  readonly tile: BiomeTerrainInput;
  readonly gridHeight: number;
  /**
   * Stable infinite-world address for a tile projected through a floating
   * window. When absent, finite compatibility worlds retain their original
   * local-coordinate derivation exactly.
   */
  readonly globalTile?: BiomeGlobalTile;
  readonly weather?: BiomeWeatherInput;
  readonly magicalWaterInfluence?: number;
}

export interface BiomeGlobalTile {
  readonly x: number;
  readonly y: number;
}

const CLIMATE_RAIN_DOMAIN = 0x4249_5201;
const CLIMATE_HEAT_DOMAIN = 0x4249_4802;
const CLIMATE_SALT_DOMAIN = 0x4249_5303;
const CLIMATE_EXPOSURE_DOMAIN = 0x4249_4504;
const CLIMATE_MAGIC_DOMAIN = 0x4249_4d05;

const GLIMMER_THRESHOLD = 800_000;
const BRINE_FLAT_THRESHOLD = 560_000;
const DRY_BRINE_MARSH_THRESHOLD = 720_000;
const DRY_BRINE_RAIN_CEILING = 520_000;
const RAIN_MEADOW_THRESHOLD = 600_000;
const HOT_MEADOW_THRESHOLD = 780_000;
const MAX_CLIMATE_COORDINATE = 1_000_000;

interface BiomeCoefficients {
  readonly rainRetention: number;
  readonly heatExposure: number;
  readonly saltTolerance: number;
  readonly magicalConductivity: number;
}

const BIOME_COEFFICIENTS: Readonly<Record<BiomeId, BiomeCoefficients>> = {
  "tide-channel": {
    rainRetention: 850_000,
    heatExposure: 420_000,
    saltTolerance: 900_000,
    magicalConductivity: 700_000,
  },
  "brine-flat": {
    rainRetention: 300_000,
    heatExposure: 860_000,
    saltTolerance: 950_000,
    magicalConductivity: 620_000,
  },
  "reed-marsh": {
    rainRetention: 920_000,
    heatExposure: 340_000,
    saltTolerance: 720_000,
    magicalConductivity: 820_000,
  },
  "rain-meadow": {
    rainRetention: 740_000,
    heatExposure: 480_000,
    saltTolerance: 360_000,
    magicalConductivity: 540_000,
  },
  "sun-meadow": {
    rainRetention: 380_000,
    heatExposure: 820_000,
    saltTolerance: 420_000,
    magicalConductivity: 340_000,
  },
  "wind-ridge": {
    rainRetention: 180_000,
    heatExposure: 700_000,
    saltTolerance: 280_000,
    magicalConductivity: 460_000,
  },
  glimmerfen: {
    rainRetention: FIXED_POINT,
    heatExposure: 240_000,
    saltTolerance: 820_000,
    magicalConductivity: FIXED_POINT,
  },
};

function clampFixed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function clampSignedFixed(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= -FIXED_POINT) return -FIXED_POINT;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function fixedMultiply(left: number, right: number): number {
  return Math.trunc((clampFixed(left) * clampFixed(right)) / FIXED_POINT);
}

function fixedLerp(left: number, right: number, amount: number): number {
  const boundedAmount = clampFixed(amount);
  return clampFixed(left + Math.trunc(((right - left) * boundedAmount) / FIXED_POINT));
}

function smoothFixed(amount: number): number {
  const bounded = clampFixed(amount);
  const square = fixedMultiply(bounded, bounded);
  return clampFixed(
    Math.trunc((square * (3 * FIXED_POINT - 2 * bounded)) / FIXED_POINT),
  );
}

function safeCoordinate(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return 0;
  return Math.min(value, MAX_CLIMATE_COORDINATE);
}

function validGlobalTile(value: BiomeGlobalTile | undefined): value is BiomeGlobalTile {
  return value !== undefined
    && Number.isSafeInteger(value.x)
    && Number.isSafeInteger(value.y);
}

function positiveRemainder(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

/** Smooth, seed-addressed value noise. It has no cursor and is stable across call order. */
function regionalNoise(
  seed: RootSeed,
  xInput: number,
  yInput: number,
  domain: number,
  cellSize: number,
): number {
  const x = safeCoordinate(xInput);
  const y = safeCoordinate(yInput);
  const west = Math.floor(x / cellSize);
  const north = Math.floor(y / cellSize);
  const east = west + 1;
  const south = north + 1;
  const amountX = smoothFixed(Math.trunc(((x % cellSize) * FIXED_POINT) / cellSize));
  const amountY = smoothFixed(Math.trunc(((y % cellSize) * FIXED_POINT) / cellSize));

  const sample = (latticeX: number, latticeY: number): number =>
    keyedRandomInt(
      seed,
      domain,
      0,
      latticeY * 4_096 + latticeX,
      1,
      0,
      FIXED_POINT,
    );

  const northBlend = fixedLerp(sample(west, north), sample(east, north), amountX);
  const southBlend = fixedLerp(sample(west, south), sample(east, south), amountX);
  return fixedLerp(northBlend, southBlend, amountY);
}

/**
 * Signed, safe-integer variant used only by explicitly globally addressed
 * infinite-world tiles. Separate lattice axes avoid the old 4,096-wide
 * packing alias at distant coordinates while preserving smooth interpolation.
 */
function globalRegionalNoise(
  seed: RootSeed,
  x: number,
  y: number,
  domain: number,
  cellSize: number,
): number {
  const west = Math.floor(x / cellSize);
  const north = Math.floor(y / cellSize);
  const east = west + 1;
  const south = north + 1;
  const offsetX = x - west * cellSize;
  const offsetY = y - north * cellSize;
  const amountX = smoothFixed(Math.trunc((offsetX * FIXED_POINT) / cellSize));
  const amountY = smoothFixed(Math.trunc((offsetY * FIXED_POINT) / cellSize));

  const sample = (latticeX: number, latticeY: number): number => {
    // Only lattice points that can contribute to compatibility region 0,0
    // retain its established one-dimensional address dialect. Extending that
    // legacy packing across all positive space aliases (x + 4096, y - 1) and
    // would eventually repeat climate bands in the unbroken world.
    if (
      latticeX >= 0
      && latticeY >= 0
      && latticeX <= Math.floor((WORLD_WIDTH - 1) / cellSize) + 1
      && latticeY <= Math.floor((WORLD_HEIGHT - 1) / cellSize) + 1
    ) {
      return keyedRandomInt(
        seed,
        domain,
        0,
        latticeY * 4_096 + latticeX,
        1,
        0,
        FIXED_POINT,
      );
    }
    return keyedRandomInt(
      seed,
      domain ^ 0x4754_494c,
      latticeY,
      latticeX,
      1,
      0,
      FIXED_POINT,
    );
  };

  const northBlend = fixedLerp(sample(west, north), sample(east, north), amountX);
  const southBlend = fixedLerp(sample(west, south), sample(east, south), amountX);
  return fixedLerp(northBlend, southBlend, amountY);
}

function globalLatitude(globalY: number, gridHeight: number): number {
  if (gridHeight <= 1) return FIXED_POINT / 2;
  const maximum = gridHeight - 1;
  const period = maximum * 2;
  const phase = positiveRemainder(globalY, period);
  const mirrored = phase <= maximum ? phase : period - phase;
  return Math.trunc((mirrored * FIXED_POINT) / maximum);
}

function terrainSalinity(kind: TerrainKind): number {
  switch (kind) {
    case "deep-water": return 790_000;
    case "tidal-flat": return 680_000;
    case "marsh": return 430_000;
    case "meadow": return 160_000;
    case "ridge": return 80_000;
  }
}

function terrainExposure(kind: TerrainKind): number {
  switch (kind) {
    case "deep-water": return 600_000;
    case "tidal-flat": return 650_000;
    case "marsh": return 250_000;
    case "meadow": return 350_000;
    case "ridge": return 850_000;
  }
}

function terrainMagicAffinity(kind: TerrainKind): number {
  switch (kind) {
    case "deep-water": return 180_000;
    case "tidal-flat": return 140_000;
    case "marsh": return 220_000;
    case "meadow": return 40_000;
    case "ridge": return 20_000;
  }
}

function normalizeClimate(climate: BiomeClimate): BiomeClimate {
  return {
    rainfall: clampFixed(climate.rainfall),
    heat: clampFixed(climate.heat),
    salinity: clampFixed(climate.salinity),
    exposure: clampFixed(climate.exposure),
    magicalWater: clampFixed(climate.magicalWater),
  };
}

/**
 * Builds long-lived local climate from the existing Perlin terrain channels and
 * independent smooth seed fields. Nothing here is persisted or time-dependent.
 */
export function deriveBaselineBiomeClimate(
  seed: RootSeed,
  tile: BiomeTerrainInput,
  gridHeightInput: number,
  magicalWaterInfluence = 0,
  globalTile?: BiomeGlobalTile,
): BiomeClimate {
  const addressed = validGlobalTile(globalTile);
  const x = addressed ? globalTile.x : safeCoordinate(tile.x);
  const y = addressed ? globalTile.y : safeCoordinate(tile.y);
  const gridHeight = Number.isSafeInteger(gridHeightInput) && gridHeightInput > 0
    ? gridHeightInput
    : 1;
  const elevation = clampFixed(tile.elevation);
  const moisture = clampFixed(tile.moisture);
  const roughness = clampFixed(tile.roughness);
  const noise = addressed ? globalRegionalNoise : regionalNoise;
  const rainField = noise(seed, x, y, CLIMATE_RAIN_DOMAIN, 16);
  const heatField = noise(seed, x, y, CLIMATE_HEAT_DOMAIN, 24);
  const saltField = noise(seed, x, y, CLIMATE_SALT_DOMAIN, 20);
  const exposureField = noise(seed, x, y, CLIMATE_EXPOSURE_DOMAIN, 12);
  const latitude = addressed
    ? globalLatitude(y, gridHeight)
    : gridHeight <= 1
    ? FIXED_POINT / 2
    : Math.trunc((Math.min(y, gridHeight - 1) * FIXED_POINT) / (gridHeight - 1));
  const equatorialWarmth = FIXED_POINT - Math.abs(latitude * 2 - FIXED_POINT);

  const rainfall = clampFixed(
    fixedMultiply(moisture, 700_000) + fixedMultiply(rainField, 300_000),
  );
  const heat = clampFixed(
    180_000
      + fixedMultiply(equatorialWarmth, 280_000)
      + fixedMultiply(heatField, 380_000)
      - fixedMultiply(elevation, 260_000)
      - fixedMultiply(moisture, 80_000),
  );
  const saltVariation = Math.trunc(((saltField - 500_000) * 240_000) / FIXED_POINT);
  const salinity = clampFixed(
    terrainSalinity(tile.terrain)
      + saltVariation
      + fixedMultiply(FIXED_POINT - moisture, 140_000)
      - fixedMultiply(rainfall, 120_000),
  );
  const exposure = clampFixed(
    fixedMultiply(terrainExposure(tile.terrain), 300_000)
      + fixedMultiply(roughness, 300_000)
      + fixedMultiply(elevation, 200_000)
      + fixedMultiply(exposureField, 200_000),
  );

  return {
    rainfall,
    heat,
    salinity,
    exposure,
    magicalWater: clampFixed(magicalWaterInfluence),
  };
}

/**
 * Stable regional magic carried by the estuary's water table. This is derived
 * data rather than save state: old worlds gain the same field whenever they
 * are projected, and a passing weather front cannot move or rename it.
 */
export function deriveMagicalWaterInfluence(
  seed: RootSeed,
  tile: BiomeTerrainInput,
  globalTile?: BiomeGlobalTile,
): number {
  const addressed = validGlobalTile(globalTile);
  const regional = (addressed ? globalRegionalNoise : regionalNoise)(
    seed,
    addressed ? globalTile.x : safeCoordinate(tile.x),
    addressed ? globalTile.y : safeCoordinate(tile.y),
    CLIMATE_MAGIC_DOMAIN,
    18,
  );
  return clampFixed(
    fixedMultiply(regional, 850_000)
      + fixedMultiply(clampFixed(tile.moisture), 180_000)
      + terrainMagicAffinity(tile.terrain)
      - 220_000,
  );
}

function approximateWindMagnitude(windX: number, windY: number): number {
  const horizontal = Math.abs(clampSignedFixed(windX));
  const vertical = Math.abs(clampSignedFixed(windY));
  const larger = Math.max(horizontal, vertical);
  const smaller = Math.min(horizontal, vertical);
  return clampFixed(larger + Math.trunc(smaller / 2));
}

/** Applies a live weather front to baseline climate without mutating either input. */
export function applyWeatherToBiomeClimate(
  baselineInput: BiomeClimate,
  weather: BiomeWeatherInput,
): BiomeClimate {
  const baseline = normalizeClimate(baselineInput);
  const intensity = clampFixed(weather.intensity);
  const wind = approximateWindMagnitude(weather.windX, weather.windY);
  let rainfallDelta = 0;
  let heatDelta = 0;
  let exposureDelta = Math.trunc(wind / 6);

  switch (weather.kind) {
    case "clear":
      rainfallDelta = -Math.trunc(intensity / 8);
      heatDelta = Math.trunc(intensity / 5);
      break;
    case "mist":
      rainfallDelta = Math.trunc(intensity / 5);
      heatDelta = -Math.trunc(intensity / 12);
      break;
    case "rain":
      rainfallDelta = fixedMultiply(intensity, 650_000);
      heatDelta = -fixedMultiply(intensity, 160_000);
      exposureDelta += Math.trunc(wind / 12);
      break;
    case "storm":
      rainfallDelta = fixedMultiply(intensity, 850_000);
      heatDelta = -fixedMultiply(intensity, 250_000);
      exposureDelta += fixedMultiply(intensity, 400_000) + Math.trunc(wind / 6);
      break;
  }

  return {
    rainfall: clampFixed(baseline.rainfall + rainfallDelta),
    heat: clampFixed(baseline.heat + heatDelta),
    salinity: clampFixed(
      baseline.salinity - Math.trunc(Math.max(0, rainfallDelta) / 4),
    ),
    exposure: clampFixed(baseline.exposure + exposureDelta),
    magicalWater: baseline.magicalWater,
  };
}

/** Classifies one of the stable biome IDs from authoritative terrain plus bounded climate. */
export function classifyBiome(terrain: TerrainKind, climateInput: BiomeClimate): BiomeId {
  const climate = normalizeClimate(climateInput);
  const wetTerrain = terrain === "deep-water" || terrain === "tidal-flat" || terrain === "marsh";
  if (
    climate.magicalWater >= GLIMMER_THRESHOLD
    && (wetTerrain || climate.rainfall >= 720_000)
  ) {
    return "glimmerfen";
  }

  switch (terrain) {
    case "deep-water":
      return "tide-channel";
    case "tidal-flat":
      return climate.salinity >= BRINE_FLAT_THRESHOLD ? "brine-flat" : "reed-marsh";
    case "marsh":
      return climate.salinity >= DRY_BRINE_MARSH_THRESHOLD
        && climate.rainfall < DRY_BRINE_RAIN_CEILING
        ? "brine-flat"
        : "reed-marsh";
    case "meadow":
      return climate.rainfall >= RAIN_MEADOW_THRESHOLD && climate.heat < HOT_MEADOW_THRESHOLD
        ? "rain-meadow"
        : "sun-meadow";
    case "ridge":
      return "wind-ridge";
  }
}

/** Converts climate into bounded response signals for later movement/ecology systems. */
export function biomeInteractionAt(
  biome: BiomeId,
  climateInput: BiomeClimate,
): BiomeInteraction {
  const climate = normalizeClimate(climateInput);
  const coefficients = BIOME_COEFFICIENTS[biome];
  return {
    rainRetention: fixedMultiply(climate.rainfall, coefficients.rainRetention),
    heatLoad: fixedMultiply(climate.heat, coefficients.heatExposure),
    saltStress: fixedMultiply(
      climate.salinity,
      FIXED_POINT - coefficients.saltTolerance,
    ),
    magicalResonance: fixedMultiply(
      climate.magicalWater,
      coefficients.magicalConductivity,
    ),
  };
}

/** One-call composition for future projection/runtime consumers. */
export function deriveBiomeProfile(input: BiomeProfileInput): BiomeProfile {
  const baseline = deriveBaselineBiomeClimate(
    input.seed,
    input.tile,
    input.gridHeight,
    input.magicalWaterInfluence ?? 0,
    input.globalTile,
  );
  // Biome identity describes the long-lived place. A passing front changes its
  // current loads and capacities, but does not rename a meadow every time it rains.
  const id = classifyBiome(input.tile.terrain, baseline);
  const climate = input.weather === undefined
    ? baseline
    : applyWeatherToBiomeClimate(baseline, input.weather);
  return {
    id,
    climate,
    interaction: biomeInteractionAt(id, climate),
  };
}
