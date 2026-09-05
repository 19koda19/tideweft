import {
  BIOME_IDS,
  deriveBiomeProfile,
  deriveMagicalWaterInfluence,
  type BiomeClimate,
  type BiomeId,
  type BiomeInteraction,
} from "../sim/biomes";
import { keyedRandomInt, keyedRandomU32, type RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  regionLocalToGlobalTile,
  stableRegionId,
  type GlobalTileCoord,
  type RegionCoord,
} from "../sim/regions";
import { generateRegionTerrain, regionTerrainHash } from "../sim/regionTerrain";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainKind,
  type TerrainState,
  type TerrainTile,
} from "../sim/types";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_HABITAT_VERSION = 1 as const;
export const CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION = 2 as const;
export const CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES = [
  "deer",
  "gull",
  "black-bear",
] as const;
export const CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES = [
  ...CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES,
  "brown-rat",
  "domestic-cat",
] as const;
export type CoreEcologyWaveAHabitatSpecies =
  (typeof CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES)[number];
export type CoreEcologyHarborEdgeHabitatSpecies =
  (typeof CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES)[number];
export type CoreEcologyHabitatRepresentation =
  | "aggregate-area"
  | "individual-representatives";
export const CORE_ECOLOGY_HABITAT_TILE_BUDGET = WORLD_WIDTH * WORLD_HEIGHT;
export const CORE_ECOLOGY_HABITAT_SPECIES_EVALUATION_BUDGET =
  CORE_ECOLOGY_HABITAT_TILE_BUDGET * CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES.length;
export const CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES_EVALUATION_BUDGET =
  CORE_ECOLOGY_HABITAT_TILE_BUDGET * CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length;
export const CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS = 11 as const;
export const CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS = 16 as const;
export const CORE_ECOLOGY_HABITAT_MAX_FOCUS_RADIUS_TILES = 32 as const;
export const CORE_ECOLOGY_HABITAT_MAX_EXCLUDED_TILES = 64 as const;

export const CORE_ECOLOGY_HABITAT_MINIMUM_SITE_SCORE: Readonly<
  Record<CoreEcologyWaveAHabitatSpecies, number>
> = Object.freeze({
  deer: 420_000,
  gull: 430_000,
  "black-bear": 470_000,
});

export const CORE_ECOLOGY_HABITAT_MINIMUM_PERSISTENT_CAPACITY: Readonly<
  Record<CoreEcologyWaveAHabitatSpecies, number>
> = Object.freeze({
  deer: 2,
  gull: 2,
  "black-bear": 1,
});

export type CoreEcologyPopulationTrend = "declining" | "stable" | "growing";

export interface DeriveCoreEcologyHabitatAssemblageInput {
  readonly rootSeed: RootSeed;
  readonly originRegion: RegionCoord;
  /**
   * Optional already-generated baseline. Supplied terrain is accepted only
   * when its complete canonical hash matches this seed and region.
   */
  readonly terrain?: TerrainState;
  /** Optional stable local patch window; no player/camera state is consulted. */
  readonly focus?: CoreEcologyHabitatFocusInput;
}

export interface CoreEcologyHabitatFocusInput {
  readonly position: WorldPosition;
  readonly radiusTiles: number;
  readonly excludedTileIndices?: readonly number[];
}

export interface CoreEcologyHabitatSelection {
  readonly focusPosition: WorldPosition | null;
  readonly radiusTiles: number | null;
  readonly excludedTileIndices: readonly number[];
}

/** Aggregate habitat signals are fixed-point 0..1 unless documented otherwise. */
export interface CoreEcologyHabitatCapacityInputs {
  readonly eligibleTiles: number;
  readonly suitableTiles: number;
  /** Sum of suitable site scores, in fixed-point tile units. */
  readonly weightedHabitatArea: number;
  readonly food: number;
  readonly water: number;
  readonly cover: number;
  readonly nesting: number;
  readonly climate: number;
  readonly predatorPressure: number;
}

export interface CoreEcologyHabitatAllocation {
  /** Stable within this population; suitable for wildlife identity generation. */
  readonly allocationOrdinal: number;
  /** Abstract population units represented by this one active-window allocation. */
  readonly representedUnits: number;
  readonly tileIndex: number;
  /** Fixed world-position units, not tile coordinates. */
  readonly localUnitX: number;
  /** Fixed world-position units, not tile coordinates. */
  readonly localUnitY: number;
  readonly globalTile: GlobalTileCoord;
  readonly position: WorldPosition;
  readonly terrain: TerrainKind;
  readonly biome: BiomeId;
  readonly habitatScore: number;
}

export interface CoreEcologyHabitatPopulationAnalysis {
  readonly species: CoreEcologyWaveAHabitatSpecies;
  readonly populationKey: string;
  readonly capacityInputs: CoreEcologyHabitatCapacityInputs;
  readonly habitatCapacity: number;
  /** Initial authoritative aggregate units. Zero means ecological absence. */
  readonly populationUnits: number;
  /** Population units divided by habitat capacity, fixed-point 0..1. */
  readonly populationPressure: number;
  readonly trend: CoreEcologyPopulationTrend;
  /** Positive values have room to grow; negative values exceed equilibrium. */
  readonly trendSignal: number;
  readonly allocations: readonly CoreEcologyHabitatAllocation[];
}

export interface CoreEcologyHarborEdgeActivitySignal {
  readonly kind:
    | "browsing"
    | "foraging"
    | "roaming"
    | "shelter-use"
    | "shore-feeding";
  /** Habitat-derived fixed-point likelihood/intensity, never direct perception. */
  readonly intensity: number;
  readonly activePeriod: "crepuscular" | "diurnal" | "nocturnal" | "variable";
  readonly source: "habitat-derived";
}

export interface CoreEcologyHarborEdgeHabitatPopulationAnalysis {
  readonly species: CoreEcologyHarborEdgeHabitatSpecies;
  readonly representation: CoreEcologyHabitatRepresentation;
  readonly populationKey: string;
  readonly capacityInputs: CoreEcologyHabitatCapacityInputs;
  readonly habitatCapacity: number;
  readonly populationUnits: number;
  readonly populationPressure: number;
  readonly trend: CoreEcologyPopulationTrend;
  readonly trendSignal: number;
  readonly activitySignal: CoreEcologyHarborEdgeActivitySignal;
  readonly allocations: readonly CoreEcologyHabitatAllocation[];
}

export interface CoreEcologyHabitatAssemblage {
  readonly generationVersion: typeof CORE_ECOLOGY_HABITAT_VERSION;
  readonly originRegion: RegionCoord;
  readonly regionId: string;
  readonly terrainHash: string;
  readonly selection: CoreEcologyHabitatSelection;
  /** Exact selected habitat tiles evaluated; bounded by the regional tile budget. */
  readonly evaluatedTiles: number;
  /** Exact selected tiles multiplied by the fixed Wave-A species count. */
  readonly speciesEvaluations: number;
  readonly maximumAllocationBudget: typeof CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS;
  /** Always one analysis per Wave-A wildlife species, including honest absences. */
  readonly populations: readonly CoreEcologyHabitatPopulationAnalysis[];
}

/**
 * Additive Wave-B habitat record. Version 1 remains byte-for-byte parseable;
 * callers opt into this record when the aggregate patch/runtime is ready.
 */
export interface CoreEcologyHarborEdgeHabitatAssemblage {
  readonly generationVersion: typeof CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION;
  readonly originRegion: RegionCoord;
  readonly regionId: string;
  readonly terrainHash: string;
  readonly selection: CoreEcologyHabitatSelection;
  readonly evaluatedTiles: number;
  readonly speciesEvaluations: number;
  readonly maximumAllocationBudget:
    typeof CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS;
  /** Fixed versioned order, including honest absences. */
  readonly populations: readonly CoreEcologyHarborEdgeHabitatPopulationAnalysis[];
}

interface HabitatSpeciesRule {
  readonly populationKey: string;
  readonly representation: CoreEcologyHabitatRepresentation;
  readonly minimumSiteScore: number;
  readonly minimumPersistentCapacity: number;
  readonly maximumPopulation: number;
  readonly tilesPerCapacityUnit: number;
  readonly maximumAllocations: number;
  readonly minimumAllocationSeparation: number;
}

interface AddressedHabitatTile {
  readonly tile: TerrainTile;
  readonly globalTile: GlobalTileCoord;
  readonly biome: BiomeId;
  readonly climate: BiomeClimate;
  readonly interaction: BiomeInteraction;
  readonly wetDistance: number;
  readonly openWaterDistance: number;
  readonly withinSelection: boolean;
  readonly focusDistance: number | null;
  readonly focusRadius: number | null;
}

interface HabitatSiteEvaluation {
  readonly addressed: AddressedHabitatTile;
  readonly eligible: boolean;
  readonly food: number;
  readonly water: number;
  readonly cover: number;
  readonly nesting: number;
  readonly climate: number;
  readonly score: number;
  readonly placementRank: number;
  readonly rankTie: number;
}

interface UnallocatedPopulationAnalysis<
  Species extends CoreEcologyHarborEdgeHabitatSpecies = CoreEcologyHarborEdgeHabitatSpecies,
> {
  readonly species: Species;
  readonly populationKey: string;
  readonly capacityInputs: CoreEcologyHabitatCapacityInputs;
  readonly habitatCapacity: number;
  readonly populationUnits: number;
  readonly populationPressure: number;
  readonly trend: CoreEcologyPopulationTrend;
  readonly trendSignal: number;
  readonly sites: readonly HabitatSiteEvaluation[];
}

interface AllocatedPopulationAnalysis<
  Species extends CoreEcologyHarborEdgeHabitatSpecies = CoreEcologyHarborEdgeHabitatSpecies,
> {
  readonly species: Species;
  readonly populationKey: string;
  readonly capacityInputs: CoreEcologyHabitatCapacityInputs;
  readonly habitatCapacity: number;
  readonly populationUnits: number;
  readonly populationPressure: number;
  readonly trend: CoreEcologyPopulationTrend;
  readonly trendSignal: number;
  readonly allocations: readonly CoreEcologyHabitatAllocation[];
}

const HABITAT_RANDOM_DOMAIN = 0x4841_4231;
const SITE_RANK_PURPOSE = 0x5349_5445;
const POPULATION_PRESSURE_PURPOSE = 0x5052_5352;
const MAX_DISTANCE = WORLD_WIDTH + WORLD_HEIGHT;
const UINT32_MAX = 0xffff_ffff;

const SPECIES_PURPOSE: Readonly<Record<CoreEcologyHarborEdgeHabitatSpecies, number>> = Object.freeze({
  deer: 0x4445_4552,
  gull: 0x4755_4c4c,
  "black-bear": 0x4245_4152,
  "brown-rat": 0x5241_5453,
  "domestic-cat": 0x4341_5453,
});

const SPECIES_RULES: Readonly<Record<CoreEcologyHarborEdgeHabitatSpecies, HabitatSpeciesRule>> =
  Object.freeze({
    deer: Object.freeze({
      populationKey: "habitat-v1/deer",
      representation: "individual-representatives",
      minimumSiteScore: CORE_ECOLOGY_HABITAT_MINIMUM_SITE_SCORE.deer,
      minimumPersistentCapacity: CORE_ECOLOGY_HABITAT_MINIMUM_PERSISTENT_CAPACITY.deer,
      maximumPopulation: 16,
      tilesPerCapacityUnit: 180,
      maximumAllocations: 4,
      minimumAllocationSeparation: 4,
    }),
    gull: Object.freeze({
      populationKey: "habitat-v1/gull",
      representation: "individual-representatives",
      minimumSiteScore: CORE_ECOLOGY_HABITAT_MINIMUM_SITE_SCORE.gull,
      minimumPersistentCapacity: CORE_ECOLOGY_HABITAT_MINIMUM_PERSISTENT_CAPACITY.gull,
      maximumPopulation: 24,
      tilesPerCapacityUnit: 120,
      maximumAllocations: 5,
      minimumAllocationSeparation: 3,
    }),
    "black-bear": Object.freeze({
      populationKey: "habitat-v1/black-bear",
      representation: "individual-representatives",
      minimumSiteScore: CORE_ECOLOGY_HABITAT_MINIMUM_SITE_SCORE["black-bear"],
      minimumPersistentCapacity: CORE_ECOLOGY_HABITAT_MINIMUM_PERSISTENT_CAPACITY["black-bear"],
      maximumPopulation: 4,
      tilesPerCapacityUnit: 700,
      maximumAllocations: 2,
      minimumAllocationSeparation: 12,
    }),
    "brown-rat": Object.freeze({
      populationKey: "habitat-v2/brown-rat",
      representation: "aggregate-area",
      minimumSiteScore: 390_000,
      minimumPersistentCapacity: 4,
      maximumPopulation: 48,
      tilesPerCapacityUnit: 20,
      maximumAllocations: 3,
      minimumAllocationSeparation: 2,
    }),
    "domestic-cat": Object.freeze({
      populationKey: "habitat-v2/domestic-cat",
      representation: "individual-representatives",
      minimumSiteScore: 440_000,
      minimumPersistentCapacity: 1,
      maximumPopulation: 4,
      tilesPerCapacityUnit: 420,
      maximumAllocations: 2,
      minimumAllocationSeparation: 8,
    }),
  });

const ACTIVITY_POLICY: Readonly<Record<
  CoreEcologyHarborEdgeHabitatSpecies,
  Readonly<Pick<CoreEcologyHarborEdgeActivitySignal, "activePeriod" | "kind">>
>> = Object.freeze({
  deer: Object.freeze({ kind: "browsing", activePeriod: "crepuscular" }),
  gull: Object.freeze({ kind: "shore-feeding", activePeriod: "diurnal" }),
  "black-bear": Object.freeze({ kind: "foraging", activePeriod: "variable" }),
  "brown-rat": Object.freeze({ kind: "shelter-use", activePeriod: "nocturnal" }),
  "domestic-cat": Object.freeze({ kind: "roaming", activePeriod: "crepuscular" }),
});

const DEER_FOOD_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 90_000,
  "reed-marsh": 880_000,
  "rain-meadow": 960_000,
  "sun-meadow": 780_000,
  "wind-ridge": 330_000,
  glimmerfen: 760_000,
});

const GULL_FOOD_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 520_000,
  "brine-flat": 900_000,
  "reed-marsh": 820_000,
  "rain-meadow": 300_000,
  "sun-meadow": 340_000,
  "wind-ridge": 260_000,
  glimmerfen: 720_000,
});

const BEAR_FORAGE_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 100_000,
  "reed-marsh": 720_000,
  "rain-meadow": 870_000,
  "sun-meadow": 720_000,
  "wind-ridge": 500_000,
  glimmerfen: 680_000,
});

const DEER_COVER_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 80_000,
  "reed-marsh": 900_000,
  "rain-meadow": 720_000,
  "sun-meadow": 500_000,
  "wind-ridge": 380_000,
  glimmerfen: 820_000,
});

const GULL_NESTING_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 720_000,
  "reed-marsh": 650_000,
  "rain-meadow": 500_000,
  "sun-meadow": 540_000,
  "wind-ridge": 860_000,
  glimmerfen: 560_000,
});

const BEAR_COVER_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 70_000,
  "reed-marsh": 850_000,
  "rain-meadow": 780_000,
  "sun-meadow": 560_000,
  "wind-ridge": 840_000,
  glimmerfen: 760_000,
});

const RAT_FOOD_OPPORTUNITY_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 760_000,
  "reed-marsh": 900_000,
  "rain-meadow": 780_000,
  "sun-meadow": 800_000,
  "wind-ridge": 350_000,
  glimmerfen: 850_000,
});

const RAT_SHELTER_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 820_000,
  "reed-marsh": 920_000,
  "rain-meadow": 710_000,
  "sun-meadow": 620_000,
  "wind-ridge": 520_000,
  glimmerfen: 880_000,
});

const CAT_COVER_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 520_000,
  "reed-marsh": 760_000,
  "rain-meadow": 700_000,
  "sun-meadow": 620_000,
  "wind-ridge": 740_000,
  glimmerfen: 720_000,
});

/**
 * Pure Wave-A habitat analysis. It has no random cursor, live weather, tide,
 * camera, player, or load-order input. Passing the same canonical arguments
 * therefore derives the same regional populations and allocation anchors.
 */
export function deriveCoreEcologyHabitatAssemblage(
  input: DeriveCoreEcologyHabitatAssemblageInput,
): CoreEcologyHabitatAssemblage {
  if (!plainRecord(input) || !allowedKeys(input, ["focus", "originRegion", "rootSeed", "terrain"])) {
    throw new TypeError("Core ecology habitat input has an unsupported shape");
  }
  if (!isRegionCoord(input.originRegion)) {
    throw new RangeError("Core ecology habitat requires a canonical signed origin region");
  }
  const originRegion = createRegionCoord(input.originRegion.x, input.originRegion.y);
  const canonicalTerrain = generateRegionTerrain(input.rootSeed, originRegion);
  const terrainHash = regionTerrainHash(canonicalTerrain);
  const terrain = input.terrain === undefined
    ? canonicalTerrain
    : requireCanonicalSuppliedTerrain(input.terrain, terrainHash);
  const selection = normalizeSelection(input.focus, originRegion);
  const addressedTiles = addressHabitatTiles(input.rootSeed, originRegion, terrain, selection);
  const evaluatedTiles = addressedTiles.length;
  const speciesEvaluations = evaluatedTiles * CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES.length;

  const deerBase = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "deer",
    addressedTiles,
    0,
    0,
  );
  const deerSupport = ratioFixed(
    deerBase.habitatCapacity,
    SPECIES_RULES.deer.maximumPopulation,
  );
  const bearBase = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "black-bear",
    addressedTiles,
    deerSupport,
    0,
  );
  const bearPressure = multiplyFixed(
    ratioFixed(
      bearBase.habitatCapacity,
      SPECIES_RULES["black-bear"].maximumPopulation,
    ),
    260_000,
  );
  const unallocated = [
    analyzeEnvironmentalCapacity(
      input.rootSeed,
      originRegion,
      "deer",
      addressedTiles,
      0,
      bearPressure,
    ),
    analyzeEnvironmentalCapacity(
      input.rootSeed,
      originRegion,
      "gull",
      addressedTiles,
      0,
      multiplyFixed(bearPressure, 300_000),
    ),
    bearBase,
  ] as const;

  const occupiedTileIndices = new Set<number>();
  const populations = unallocated.map((analysis) =>
    allocatePopulation(analysis, originRegion, occupiedTileIndices));
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS) {
    throw new Error("Core ecology habitat allocation budget diverged");
  }

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_HABITAT_VERSION,
    originRegion,
    regionId: stableRegionId(input.rootSeed, originRegion),
    terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

/**
 * Pure harbor-edge extension. The first three analyses use the frozen Wave-A
 * rules and allocation order; rats add bounded area anchors and cats add only
 * individual-representative allocations. Rat anchors use an independent
 * occupancy plane, so ecologically meaningful overlap does not evict Wave-A
 * actors or manufacture hundreds of identities.
 */
export function deriveCoreEcologyHarborEdgeHabitatAssemblage(
  input: DeriveCoreEcologyHabitatAssemblageInput,
): CoreEcologyHarborEdgeHabitatAssemblage {
  if (!plainRecord(input) || !allowedKeys(input, ["focus", "originRegion", "rootSeed", "terrain"])) {
    throw new TypeError("Core ecology harbor-edge habitat input has an unsupported shape");
  }
  if (!isRegionCoord(input.originRegion)) {
    throw new RangeError("Core ecology harbor-edge habitat requires a canonical signed origin region");
  }
  const originRegion = createRegionCoord(input.originRegion.x, input.originRegion.y);
  const canonicalTerrain = generateRegionTerrain(input.rootSeed, originRegion);
  const terrainHash = regionTerrainHash(canonicalTerrain);
  const terrain = input.terrain === undefined
    ? canonicalTerrain
    : requireCanonicalSuppliedTerrain(input.terrain, terrainHash);
  const selection = normalizeSelection(input.focus, originRegion);
  const addressedTiles = addressHabitatTiles(input.rootSeed, originRegion, terrain, selection);
  const evaluatedTiles = addressedTiles.length;
  const speciesEvaluations =
    evaluatedTiles * CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length;

  const deerBase = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "deer",
    addressedTiles,
    0,
    0,
  );
  const deerSupport = ratioFixed(
    deerBase.habitatCapacity,
    SPECIES_RULES.deer.maximumPopulation,
  );
  const bearBase = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "black-bear",
    addressedTiles,
    deerSupport,
    0,
  );
  const bearPressure = multiplyFixed(
    ratioFixed(
      bearBase.habitatCapacity,
      SPECIES_RULES["black-bear"].maximumPopulation,
    ),
    260_000,
  );
  const deer = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "deer",
    addressedTiles,
    0,
    bearPressure,
  );
  const gull = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "gull",
    addressedTiles,
    0,
    multiplyFixed(bearPressure, 300_000),
  );
  const ratBase = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "brown-rat",
    addressedTiles,
    0,
    0,
  );
  const ratSupport = ratioFixed(
    ratBase.habitatCapacity,
    SPECIES_RULES["brown-rat"].maximumPopulation,
  );
  const cat = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "domestic-cat",
    addressedTiles,
    ratSupport,
    0,
  );
  const catPressure = multiplyFixed(
    ratioFixed(cat.habitatCapacity, SPECIES_RULES["domestic-cat"].maximumPopulation),
    240_000,
  );
  const rat = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "brown-rat",
    addressedTiles,
    0,
    catPressure,
  );

  const individualOccupiedTiles = new Set<number>();
  const allocatedDeer = allocatePopulation(deer, originRegion, individualOccupiedTiles);
  const allocatedGull = allocatePopulation(gull, originRegion, individualOccupiedTiles);
  const allocatedBear = allocatePopulation(bearBase, originRegion, individualOccupiedTiles);
  const ratOccupiedTiles = new Set<number>();
  const allocatedRat = allocatePopulation(rat, originRegion, ratOccupiedTiles);
  const allocatedCat = allocatePopulation(
    cat,
    originRegion,
    individualOccupiedTiles,
    allocatedRat.allocations,
  );
  const allocated = [
    allocatedDeer,
    allocatedGull,
    allocatedBear,
    allocatedRat,
    allocatedCat,
  ] as const;
  const populations = allocated.map((population) => Object.freeze({
    ...population,
    representation: SPECIES_RULES[population.species].representation,
    activitySignal: activitySignalFor(population),
  }));
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS) {
    throw new Error("Core ecology harbor-edge habitat allocation budget diverged");
  }

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION,
    originRegion,
    regionId: stableRegionId(input.rootSeed, originRegion),
    terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

/**
 * Strict shape/coherence canonicalization for an embedded ecology-v2 record.
 * This deliberately does not regenerate terrain or habitat; load integration
 * can separately compare the result with a freshly derived expected record.
 */
export function canonicalizeCoreEcologyHabitatAssemblage(
  value: unknown,
): CoreEcologyHabitatAssemblage | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "evaluatedTiles",
    "generationVersion",
    "maximumAllocationBudget",
    "originRegion",
    "populations",
    "regionId",
    "selection",
    "speciesEvaluations",
    "terrainHash",
  ])) return null;
  if (
    value.generationVersion !== CORE_ECOLOGY_HABITAT_VERSION
    || !isRegionCoord(value.originRegion)
    || typeof value.regionId !== "string"
    || !regionIdMatches(value.regionId, value.originRegion)
    || typeof value.terrainHash !== "string"
    || !/^[0-9a-f]{32}$/u.test(value.terrainHash)
    || value.maximumAllocationBudget !== CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS
    || !Array.isArray(value.populations)
    || value.populations.length !== CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES.length
  ) return null;
  const originRegion = createRegionCoord(value.originRegion.x, value.originRegion.y);
  const selection = canonicalizeSelection(value.selection, originRegion);
  if (selection === null) return null;
  const evaluatedTiles = selectedTileCount(selection);
  const speciesEvaluations = evaluatedTiles * CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES.length;
  if (
    value.evaluatedTiles !== evaluatedTiles
    || value.speciesEvaluations !== speciesEvaluations
    || value.evaluatedTiles > CORE_ECOLOGY_HABITAT_TILE_BUDGET
    || value.speciesEvaluations > CORE_ECOLOGY_HABITAT_SPECIES_EVALUATION_BUDGET
  ) return null;
  const occupiedTileIndices = new Set<number>();
  const populations: CoreEcologyHabitatPopulationAnalysis[] = [];
  for (let index = 0; index < CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES.length; index += 1) {
    const species = CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES[index];
    if (species === undefined) return null;
    const population = canonicalizePopulationAnalysis(
      value.populations[index],
      species,
      originRegion,
      selection,
      evaluatedTiles,
      occupiedTileIndices,
    );
    if (population === null) return null;
    populations.push(population);
  }
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS) return null;

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_HABITAT_VERSION,
    originRegion,
    regionId: value.regionId,
    terrainHash: value.terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

export function canonicalizeCoreEcologyHarborEdgeHabitatAssemblage(
  value: unknown,
): CoreEcologyHarborEdgeHabitatAssemblage | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "evaluatedTiles",
    "generationVersion",
    "maximumAllocationBudget",
    "originRegion",
    "populations",
    "regionId",
    "selection",
    "speciesEvaluations",
    "terrainHash",
  ])) return null;
  if (
    value.generationVersion !== CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION
    || !isRegionCoord(value.originRegion)
    || typeof value.regionId !== "string"
    || !regionIdMatches(value.regionId, value.originRegion)
    || typeof value.terrainHash !== "string"
    || !/^[0-9a-f]{32}$/u.test(value.terrainHash)
    || value.maximumAllocationBudget !== CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS
    || !Array.isArray(value.populations)
    || value.populations.length !== CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length
  ) return null;
  const originRegion = createRegionCoord(value.originRegion.x, value.originRegion.y);
  const selection = canonicalizeSelection(value.selection, originRegion);
  if (selection === null) return null;
  const evaluatedTiles = selectedTileCount(selection);
  const speciesEvaluations =
    evaluatedTiles * CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length;
  if (
    value.evaluatedTiles !== evaluatedTiles
    || value.speciesEvaluations !== speciesEvaluations
    || value.evaluatedTiles > CORE_ECOLOGY_HABITAT_TILE_BUDGET
    || value.speciesEvaluations > CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES_EVALUATION_BUDGET
  ) return null;

  const individualOccupiedTiles = new Set<number>();
  const aggregateOccupiedTiles = new Set<number>();
  const populations: CoreEcologyHarborEdgeHabitatPopulationAnalysis[] = [];
  for (let index = 0; index < CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length; index += 1) {
    const species = CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES[index];
    if (species === undefined) return null;
    const population = canonicalizeHarborEdgePopulationAnalysis(
      value.populations[index],
      species,
      originRegion,
      selection,
      evaluatedTiles,
      species === "brown-rat" ? aggregateOccupiedTiles : individualOccupiedTiles,
    );
    if (population === null) return null;
    populations.push(population);
  }
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS) return null;

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION,
    originRegion,
    regionId: value.regionId,
    terrainHash: value.terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

function canonicalizeHarborEdgePopulationAnalysis(
  value: unknown,
  expectedSpecies: CoreEcologyHarborEdgeHabitatSpecies,
  originRegion: RegionCoord,
  selection: CoreEcologyHabitatSelection,
  evaluatedTiles: number,
  occupiedTileIndices: Set<number>,
): CoreEcologyHarborEdgeHabitatPopulationAnalysis | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "activitySignal",
    "allocations",
    "capacityInputs",
    "habitatCapacity",
    "populationKey",
    "populationPressure",
    "populationUnits",
    "representation",
    "species",
    "trend",
    "trendSignal",
  ])) return null;
  const rule = SPECIES_RULES[expectedSpecies];
  if (
    value.species !== expectedSpecies
    || value.representation !== rule.representation
    || value.populationKey !== rule.populationKey
    || !nonnegativeSafeInteger(value.habitatCapacity)
    || value.habitatCapacity > rule.maximumPopulation
    || !nonnegativeSafeInteger(value.populationUnits)
    || value.populationUnits > value.habitatCapacity
    || !fixedInteger(value.populationPressure)
    || value.populationPressure !== ratioFixed(value.populationUnits, value.habitatCapacity)
    || !signedFixedInteger(value.trendSignal)
    || !validTrend(value.trend, value.trendSignal)
    || !Array.isArray(value.allocations)
  ) return null;
  const viable = value.habitatCapacity >= rule.minimumPersistentCapacity;
  if ((value.populationUnits > 0) !== viable) return null;
  const capacityInputs = canonicalizeCapacityInputs(value.capacityInputs);
  if (
    capacityInputs === null
    || capacityInputs.eligibleTiles > evaluatedTiles
    || capacityInputs.suitableTiles > evaluatedTiles
  ) return null;
  const expectedAllocationCount = value.populationUnits === 0
    ? 0
    : Math.min(value.populationUnits, rule.maximumAllocations);
  if (
    value.allocations.length !== expectedAllocationCount
    || value.allocations.length > capacityInputs.suitableTiles
  ) return null;
  const baseRepresentedUnits = expectedAllocationCount === 0
    ? 0
    : Math.trunc(value.populationUnits / expectedAllocationCount);
  const remainder = expectedAllocationCount === 0
    ? 0
    : value.populationUnits % expectedAllocationCount;
  const allocations: CoreEcologyHabitatAllocation[] = [];
  for (let index = 0; index < value.allocations.length; index += 1) {
    const allocation = canonicalizeAllocation(
      value.allocations[index],
      expectedSpecies,
      originRegion,
      selection,
      index,
      baseRepresentedUnits + (index < remainder ? 1 : 0),
    );
    if (allocation === null || occupiedTileIndices.has(allocation.tileIndex)) return null;
    occupiedTileIndices.add(allocation.tileIndex);
    allocations.push(allocation);
  }
  const allocated: AllocatedPopulationAnalysis = {
    species: expectedSpecies,
    populationKey: rule.populationKey,
    capacityInputs,
    habitatCapacity: value.habitatCapacity,
    populationUnits: value.populationUnits,
    populationPressure: value.populationPressure,
    trend: value.trend as CoreEcologyPopulationTrend,
    trendSignal: value.trendSignal,
    allocations,
  };
  const activitySignal = activitySignalFor(allocated);
  if (!sameActivitySignal(value.activitySignal, activitySignal)) return null;

  return Object.freeze({
    ...allocated,
    representation: rule.representation,
    activitySignal,
    allocations: Object.freeze(allocations),
  });
}

function canonicalizeSelection(
  value: unknown,
  originRegion: RegionCoord,
): CoreEcologyHabitatSelection | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "excludedTileIndices",
    "focusPosition",
    "radiusTiles",
  ])) return null;
  if (!Array.isArray(value.excludedTileIndices)) return null;
  const exclusions = value.excludedTileIndices;
  if (
    exclusions.length > CORE_ECOLOGY_HABITAT_MAX_EXCLUDED_TILES
    || exclusions.some((tileIndex, index) =>
      !nonnegativeSafeInteger(tileIndex)
      || tileIndex >= CORE_ECOLOGY_HABITAT_TILE_BUDGET
      || index > 0 && (exclusions[index - 1] as number) >= tileIndex)
  ) return null;
  if (value.focusPosition === null) {
    if (value.radiusTiles !== null || exclusions.length !== 0) return null;
    return Object.freeze({
      focusPosition: null,
      radiusTiles: null,
      excludedTileIndices: Object.freeze([]),
    });
  }
  if (
    !isWorldPosition(value.focusPosition)
    || value.focusPosition.region.x !== originRegion.x
    || value.focusPosition.region.y !== originRegion.y
    || !Number.isSafeInteger(value.radiusTiles)
    || (value.radiusTiles as number) < 1
    || (value.radiusTiles as number) > CORE_ECOLOGY_HABITAT_MAX_FOCUS_RADIUS_TILES
  ) return null;
  return Object.freeze({
    focusPosition: createWorldPosition(
      originRegion,
      value.focusPosition.localX,
      value.focusPosition.localY,
    ),
    radiusTiles: value.radiusTiles as number,
    excludedTileIndices: Object.freeze([...(exclusions as number[])]),
  });
}

function canonicalizePopulationAnalysis(
  value: unknown,
  expectedSpecies: CoreEcologyWaveAHabitatSpecies,
  originRegion: RegionCoord,
  selection: CoreEcologyHabitatSelection,
  evaluatedTiles: number,
  occupiedTileIndices: Set<number>,
): CoreEcologyHabitatPopulationAnalysis | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "allocations",
    "capacityInputs",
    "habitatCapacity",
    "populationKey",
    "populationPressure",
    "populationUnits",
    "species",
    "trend",
    "trendSignal",
  ])) return null;
  const rule = SPECIES_RULES[expectedSpecies];
  const maximumPopulation = rule.maximumPopulation;
  if (
    value.species !== expectedSpecies
    || value.populationKey !== rule.populationKey
    || !nonnegativeSafeInteger(value.habitatCapacity)
    || value.habitatCapacity > maximumPopulation
    || !nonnegativeSafeInteger(value.populationUnits)
    || value.populationUnits > value.habitatCapacity
    || !fixedInteger(value.populationPressure)
    || value.populationPressure !== ratioFixed(value.populationUnits, value.habitatCapacity)
    || !signedFixedInteger(value.trendSignal)
    || !validTrend(value.trend, value.trendSignal)
    || !Array.isArray(value.allocations)
  ) return null;
  const viable = value.habitatCapacity >= rule.minimumPersistentCapacity;
  if ((value.populationUnits > 0) !== viable) return null;
  const capacityInputs = canonicalizeCapacityInputs(value.capacityInputs);
  if (
    capacityInputs === null
    || capacityInputs.eligibleTiles > evaluatedTiles
    || capacityInputs.suitableTiles > evaluatedTiles
  ) return null;
  const expectedAllocationCount = value.populationUnits === 0
    ? 0
    : Math.min(value.populationUnits, rule.maximumAllocations);
  if (
    value.allocations.length !== expectedAllocationCount
    || value.allocations.length > capacityInputs.suitableTiles
  ) return null;
  const baseRepresentedUnits = expectedAllocationCount === 0
    ? 0
    : Math.trunc(value.populationUnits / expectedAllocationCount);
  const remainder = expectedAllocationCount === 0
    ? 0
    : value.populationUnits % expectedAllocationCount;
  const allocations: CoreEcologyHabitatAllocation[] = [];
  for (let index = 0; index < value.allocations.length; index += 1) {
    const allocation = canonicalizeAllocation(
      value.allocations[index],
      expectedSpecies,
      originRegion,
      selection,
      index,
      baseRepresentedUnits + (index < remainder ? 1 : 0),
    );
    if (
      allocation === null
      || occupiedTileIndices.has(allocation.tileIndex)
    ) return null;
    occupiedTileIndices.add(allocation.tileIndex);
    allocations.push(allocation);
  }

  return Object.freeze({
    species: expectedSpecies,
    populationKey: rule.populationKey,
    capacityInputs,
    habitatCapacity: value.habitatCapacity,
    populationUnits: value.populationUnits,
    populationPressure: value.populationPressure,
    trend: value.trend as CoreEcologyPopulationTrend,
    trendSignal: value.trendSignal,
    allocations: Object.freeze(allocations),
  });
}

function canonicalizeCapacityInputs(value: unknown): CoreEcologyHabitatCapacityInputs | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "climate",
    "cover",
    "eligibleTiles",
    "food",
    "nesting",
    "predatorPressure",
    "suitableTiles",
    "water",
    "weightedHabitatArea",
  ])) return null;
  if (
    !nonnegativeSafeInteger(value.eligibleTiles)
    || value.eligibleTiles > CORE_ECOLOGY_HABITAT_TILE_BUDGET
    || !nonnegativeSafeInteger(value.suitableTiles)
    || value.suitableTiles > value.eligibleTiles
    || !nonnegativeSafeInteger(value.weightedHabitatArea)
    || value.weightedHabitatArea > value.suitableTiles * FIXED_POINT
    || !fixedInteger(value.food)
    || !fixedInteger(value.water)
    || !fixedInteger(value.cover)
    || !fixedInteger(value.nesting)
    || !fixedInteger(value.climate)
    || !fixedInteger(value.predatorPressure)
  ) return null;
  return Object.freeze({
    eligibleTiles: value.eligibleTiles,
    suitableTiles: value.suitableTiles,
    weightedHabitatArea: value.weightedHabitatArea,
    food: value.food,
    water: value.water,
    cover: value.cover,
    nesting: value.nesting,
    climate: value.climate,
    predatorPressure: value.predatorPressure,
  });
}

function canonicalizeAllocation(
  value: unknown,
  species: CoreEcologyHarborEdgeHabitatSpecies,
  originRegion: RegionCoord,
  selection: CoreEcologyHabitatSelection,
  expectedOrdinal: number,
  expectedRepresentedUnits: number,
): CoreEcologyHabitatAllocation | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "allocationOrdinal",
    "biome",
    "globalTile",
    "habitatScore",
    "localUnitX",
    "localUnitY",
    "position",
    "representedUnits",
    "terrain",
    "tileIndex",
  ])) return null;
  if (
    value.allocationOrdinal !== expectedOrdinal
    || value.representedUnits !== expectedRepresentedUnits
    || !nonnegativeSafeInteger(value.tileIndex)
    || value.tileIndex >= CORE_ECOLOGY_HABITAT_TILE_BUDGET
    || !nonnegativeSafeInteger(value.localUnitX)
    || !nonnegativeSafeInteger(value.localUnitY)
  ) return null;
  const tileX = value.tileIndex % WORLD_WIDTH;
  const tileY = Math.trunc(value.tileIndex / WORLD_WIDTH);
  const expectedLocalUnitX =
    tileX * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  const expectedLocalUnitY =
    tileY * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  if (
    value.localUnitX !== expectedLocalUnitX
    || value.localUnitY !== expectedLocalUnitY
    || !plainRecord(value.globalTile)
    || !exactKeys(value.globalTile, ["x", "y"])
    || !canonicalSafeInteger(value.globalTile.x)
    || !canonicalSafeInteger(value.globalTile.y)
  ) return null;
  const expectedGlobalTile = regionLocalToGlobalTile(originRegion, tileX, tileY);
  if (
    value.globalTile.x !== expectedGlobalTile.x
    || value.globalTile.y !== expectedGlobalTile.y
    || !isWorldPosition(value.position)
    || value.position.region.x !== originRegion.x
    || value.position.region.y !== originRegion.y
    || value.position.localX !== expectedLocalUnitX
    || value.position.localY !== expectedLocalUnitY
  ) return null;
  if (
    typeof value.terrain !== "string"
    || !validAllocationTerrain(species, value.terrain)
    || typeof value.biome !== "string"
    || !(BIOME_IDS as readonly string[]).includes(value.biome)
    || !fixedInteger(value.habitatScore)
    || value.habitatScore < SPECIES_RULES[species].minimumSiteScore
  ) return null;
  if (selection.focusPosition !== null && selection.radiusTiles !== null) {
    const focusTileX = Math.trunc(
      selection.focusPosition.localX / WORLD_POSITION_UNITS_PER_TILE,
    );
    const focusTileY = Math.trunc(
      selection.focusPosition.localY / WORLD_POSITION_UNITS_PER_TILE,
    );
    if (
      Math.abs(tileX - focusTileX) + Math.abs(tileY - focusTileY) > selection.radiusTiles
      || selection.excludedTileIndices.includes(value.tileIndex)
    ) return null;
  }
  return Object.freeze({
    allocationOrdinal: expectedOrdinal,
    representedUnits: expectedRepresentedUnits,
    tileIndex: value.tileIndex,
    localUnitX: expectedLocalUnitX,
    localUnitY: expectedLocalUnitY,
    globalTile: Object.freeze(expectedGlobalTile),
    position: createWorldPosition(originRegion, expectedLocalUnitX, expectedLocalUnitY),
    terrain: value.terrain as TerrainKind,
    biome: value.biome as BiomeId,
    habitatScore: value.habitatScore,
  });
}

function analyzeEnvironmentalCapacity<Species extends CoreEcologyHarborEdgeHabitatSpecies>(
  seed: RootSeed,
  originRegion: RegionCoord,
  species: Species,
  addressedTiles: readonly AddressedHabitatTile[],
  preySupport: number,
  predatorPressure: number,
): UnallocatedPopulationAnalysis<Species> {
  const rule = SPECIES_RULES[species];
  const sites = addressedTiles.map((addressed) =>
    evaluateSite(seed, originRegion, species, addressed, preySupport));
  const eligible = sites.filter((site) => site.eligible);
  const suitable = eligible.filter((site) => site.score >= rule.minimumSiteScore);
  const weightedHabitatArea = suitable.reduce((sum, site) => sum + site.score, 0);
  const averages = averageSiteInputs(suitable);
  let habitatCapacity = Math.min(
    rule.maximumPopulation,
    Math.trunc(weightedHabitatArea / (FIXED_POINT * rule.tilesPerCapacityUnit)),
  );

  // A black bear's broad omnivory still requires either a supported prey base
  // or strong regional plant/shore forage; terrain alone cannot add a predator.
  if (
    species === "black-bear"
    && preySupport < 125_000
    && averages.food < 620_000
  ) habitatCapacity = 0;

  const capacityInputs = Object.freeze({
    eligibleTiles: eligible.length,
    suitableTiles: suitable.length,
    weightedHabitatArea,
    food: averages.food,
    water: averages.water,
    cover: averages.cover,
    nesting: averages.nesting,
    climate: averages.climate,
    predatorPressure,
  });
  const viable = habitatCapacity >= rule.minimumPersistentCapacity;
  const occupancyTarget = keyedRandomInt(
    seed,
    HABITAT_RANDOM_DOMAIN,
    originRegion.x,
    originRegion.y,
    POPULATION_PRESSURE_PURPOSE ^ SPECIES_PURPOSE[species],
    450_000,
    950_000,
  );
  const populationUnits = viable
    ? Math.min(
        habitatCapacity,
        Math.max(1, Math.trunc((habitatCapacity * occupancyTarget + 500_000) / FIXED_POINT)),
      )
    : 0;
  const populationPressure = habitatCapacity === 0
    ? 0
    : ratioFixed(populationUnits, habitatCapacity);
  const averageHabitatScore = suitable.length === 0
    ? 0
    : Math.trunc(weightedHabitatArea / suitable.length);
  const equilibriumPressure = clampFixed(
    320_000
      + multiplyFixed(averageHabitatScore, 610_000)
      - predatorPressure,
  );
  const trendSignal = equilibriumPressure - populationPressure;
  const trend: CoreEcologyPopulationTrend = trendSignal >= 80_000
    ? "growing"
    : trendSignal <= -80_000
    ? "declining"
    : "stable";

  return Object.freeze({
    species,
    populationKey: rule.populationKey,
    capacityInputs,
    habitatCapacity,
    populationUnits,
    populationPressure,
    trend,
    trendSignal,
    sites: Object.freeze(suitable),
  });
}

function allocatePopulation<Species extends CoreEcologyHarborEdgeHabitatSpecies>(
  analysis: UnallocatedPopulationAnalysis<Species>,
  originRegion: RegionCoord,
  occupiedTileIndices: Set<number>,
  preferredAllocations: readonly CoreEcologyHabitatAllocation[] = [],
): AllocatedPopulationAnalysis<Species> {
  const rule = SPECIES_RULES[analysis.species];
  const allocationCount = analysis.populationUnits === 0
    ? 0
    : Math.min(analysis.populationUnits, rule.maximumAllocations);
  const rankedSites = [...analysis.sites].sort((left, right) =>
    compareSitesWithPreferredAllocations(left, right, preferredAllocations));
  const selected: HabitatSiteEvaluation[] = [];
  for (const site of rankedSites) {
    if (selected.length >= allocationCount) break;
    if (occupiedTileIndices.has(site.addressed.tile.index)) continue;
    if (
      selected.every((other) =>
        manhattanTiles(site.addressed.tile, other.addressed.tile)
          >= rule.minimumAllocationSeparation)
    ) selected.push(site);
  }
  // Capacity is derived from hundreds of sites, but this fallback keeps the
  // bounded allocation contract total if a highly fragmented habitat cannot
  // satisfy the preferred same-species spacing.
  if (selected.length < allocationCount) {
    for (const site of rankedSites) {
      if (selected.length >= allocationCount) break;
      if (
        occupiedTileIndices.has(site.addressed.tile.index)
        || selected.some((other) => other.addressed.tile.index === site.addressed.tile.index)
      ) continue;
      selected.push(site);
    }
  }
  if (selected.length !== allocationCount) {
    throw new Error(`Core ecology ${analysis.species} habitat cannot place its derived allocations`);
  }

  const baseRepresentedUnits = allocationCount === 0
    ? 0
    : Math.trunc(analysis.populationUnits / allocationCount);
  const remainder = allocationCount === 0
    ? 0
    : analysis.populationUnits % allocationCount;
  const allocations = selected.map((site, allocationOrdinal) => {
    const tile = site.addressed.tile;
    const localUnitX =
      tile.x * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const localUnitY =
      tile.y * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    occupiedTileIndices.add(tile.index);
    return Object.freeze({
      allocationOrdinal,
      representedUnits: baseRepresentedUnits + (allocationOrdinal < remainder ? 1 : 0),
      tileIndex: tile.index,
      localUnitX,
      localUnitY,
      globalTile: Object.freeze({
        x: site.addressed.globalTile.x,
        y: site.addressed.globalTile.y,
      }),
      position: createWorldPosition(originRegion, localUnitX, localUnitY),
      terrain: tile.terrain,
      biome: site.addressed.biome,
      habitatScore: site.score,
    });
  });

  return Object.freeze({
    species: analysis.species,
    populationKey: analysis.populationKey,
    capacityInputs: analysis.capacityInputs,
    habitatCapacity: analysis.habitatCapacity,
    populationUnits: analysis.populationUnits,
    populationPressure: analysis.populationPressure,
    trend: analysis.trend,
    trendSignal: analysis.trendSignal,
    allocations: Object.freeze(allocations),
  });
}

function addressHabitatTiles(
  seed: RootSeed,
  originRegion: RegionCoord,
  terrain: TerrainState,
  selection: CoreEcologyHabitatSelection,
): readonly AddressedHabitatTile[] {
  const wetDistances = distanceField(
    terrain,
    (tile) => tile.terrain === "deep-water"
      || tile.terrain === "tidal-flat"
      || tile.terrain === "marsh",
  );
  const openWaterDistances = distanceField(
    terrain,
    (tile) => tile.terrain === "deep-water" || tile.terrain === "tidal-flat",
  );
  const excluded = new Set(selection.excludedTileIndices);
  const focusTileX = selection.focusPosition === null
    ? null
    : Math.trunc(selection.focusPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
  const focusTileY = selection.focusPosition === null
    ? null
    : Math.trunc(selection.focusPosition.localY / WORLD_POSITION_UNITS_PER_TILE);
  const addressedTiles: AddressedHabitatTile[] = [];
  for (const tile of terrain.tiles) {
    const focusDistance = focusTileX === null || focusTileY === null
      ? null
      : Math.abs(tile.x - focusTileX) + Math.abs(tile.y - focusTileY);
    const withinSelection = !excluded.has(tile.index)
      && (
        focusDistance === null
        || selection.radiusTiles !== null && focusDistance <= selection.radiusTiles
      );
    if (!withinSelection) continue;
    const globalTile = regionLocalToGlobalTile(originRegion, tile.x, tile.y);
    const magicalWaterInfluence = deriveMagicalWaterInfluence(seed, tile, globalTile);
    const biome = deriveBiomeProfile({
      seed,
      tile,
      gridHeight: WORLD_HEIGHT,
      globalTile,
      magicalWaterInfluence,
    });
    addressedTiles.push(Object.freeze({
      tile,
      globalTile,
      biome: biome.id,
      climate: biome.climate,
      interaction: biome.interaction,
      wetDistance: wetDistances[tile.index] ?? MAX_DISTANCE,
      openWaterDistance: openWaterDistances[tile.index] ?? MAX_DISTANCE,
      withinSelection,
      focusDistance,
      focusRadius: selection.radiusTiles,
    }));
  }
  return Object.freeze(addressedTiles);
}

function selectedTileCount(selection: CoreEcologyHabitatSelection): number {
  if (selection.focusPosition === null || selection.radiusTiles === null) {
    return CORE_ECOLOGY_HABITAT_TILE_BUDGET;
  }
  const focusTileX = Math.trunc(
    selection.focusPosition.localX / WORLD_POSITION_UNITS_PER_TILE,
  );
  const focusTileY = Math.trunc(
    selection.focusPosition.localY / WORLD_POSITION_UNITS_PER_TILE,
  );
  const excluded = new Set(selection.excludedTileIndices);
  let count = 0;
  for (let tileY = 0; tileY < WORLD_HEIGHT; tileY += 1) {
    for (let tileX = 0; tileX < WORLD_WIDTH; tileX += 1) {
      const tileIndex = tileY * WORLD_WIDTH + tileX;
      if (
        !excluded.has(tileIndex)
        && Math.abs(tileX - focusTileX) + Math.abs(tileY - focusTileY)
          <= selection.radiusTiles
      ) count += 1;
    }
  }
  return count;
}

function evaluateSite(
  seed: RootSeed,
  originRegion: RegionCoord,
  species: CoreEcologyHarborEdgeHabitatSpecies,
  addressed: AddressedHabitatTile,
  preySupport: number,
): HabitatSiteEvaluation {
  const { tile, biome, climate, interaction } = addressed;
  let eligible = false;
  let food = 0;
  let water = 0;
  let cover = 0;
  let nesting = 0;
  let climateScore = 0;
  let score = 0;

  switch (species) {
    case "deer": {
      eligible = tile.terrain === "marsh" || tile.terrain === "meadow" || tile.terrain === "ridge";
      food = multiplyFixed(
        DEER_FOOD_BY_BIOME[biome],
        FIXED_POINT - Math.trunc(interaction.saltStress / 2),
      );
      water = Math.max(
        distanceScore(addressed.wetDistance, 14),
        multiplyFixed(climate.rainfall, 760_000),
      );
      cover = clampFixed(
        multiplyFixed(DEER_COVER_BY_BIOME[biome], 800_000)
          + multiplyFixed(tile.roughness, 200_000),
      );
      nesting = weightedScore([
        [cover, 650_000],
        [interaction.rainRetention, 350_000],
      ]);
      climateScore = deerClimateScore(climate, interaction);
      score = weightedScore([
        [food, 330_000],
        [water, 170_000],
        [cover, 210_000],
        [nesting, 110_000],
        [climateScore, 180_000],
      ]);
      eligible = eligible && food >= 220_000 && water >= 160_000 && climateScore >= 300_000;
      break;
    }
    case "gull": {
      eligible = tile.terrain !== "deep-water";
      food = clampFixed(
        multiplyFixed(GULL_FOOD_BY_BIOME[biome], 820_000)
          + multiplyFixed(interaction.rainRetention, 180_000),
      );
      water = distanceScore(addressed.openWaterDistance, 10);
      cover = clampFixed(FIXED_POINT - Math.trunc(tile.roughness / 3));
      nesting = multiplyFixed(
        GULL_NESTING_BY_BIOME[biome],
        600_000 + multiplyFixed(water, 400_000),
      );
      climateScore = gullClimateScore(climate, interaction);
      score = weightedScore([
        [food, 260_000],
        [water, 290_000],
        [cover, 90_000],
        [nesting, 210_000],
        [climateScore, 150_000],
      ]);
      eligible = eligible && water >= 300_000 && nesting >= 260_000;
      break;
    }
    case "black-bear": {
      eligible = tile.terrain === "marsh" || tile.terrain === "meadow" || tile.terrain === "ridge";
      const vegetation = multiplyFixed(
        BEAR_FORAGE_BY_BIOME[biome],
        FIXED_POINT - Math.trunc(interaction.saltStress / 3),
      );
      food = weightedScore([
        [vegetation, 680_000],
        [preySupport, 320_000],
      ]);
      water = Math.max(
        distanceScore(addressed.wetDistance, 16),
        multiplyFixed(climate.rainfall, 700_000),
      );
      cover = clampFixed(
        multiplyFixed(BEAR_COVER_BY_BIOME[biome], 720_000)
          + multiplyFixed(tile.roughness, 280_000),
      );
      nesting = weightedScore([
        [cover, 760_000],
        [FIXED_POINT - climate.exposure, 240_000],
      ]);
      climateScore = bearClimateScore(climate, interaction);
      score = weightedScore([
        [food, 300_000],
        [water, 150_000],
        [cover, 260_000],
        [nesting, 140_000],
        [climateScore, 150_000],
      ]);
      eligible = eligible
        && food >= 320_000
        && water >= 150_000
        && cover >= 360_000
        && climateScore >= 300_000;
      break;
    }
    case "brown-rat": {
      eligible = tile.terrain !== "deep-water";
      food = clampFixed(
        multiplyFixed(RAT_FOOD_OPPORTUNITY_BY_BIOME[biome], 820_000)
          + multiplyFixed(interaction.rainRetention, 180_000),
      );
      water = Math.max(
        distanceScore(addressed.wetDistance, 12),
        multiplyFixed(climate.rainfall, 650_000),
      );
      cover = clampFixed(
        multiplyFixed(RAT_SHELTER_BY_BIOME[biome], 760_000)
          + multiplyFixed(tile.roughness, 240_000),
      );
      nesting = weightedScore([
        [cover, 780_000],
        [FIXED_POINT - climate.exposure, 220_000],
      ]);
      climateScore = ratClimateScore(climate, interaction);
      score = weightedScore([
        [food, 330_000],
        [water, 130_000],
        [cover, 250_000],
        [nesting, 190_000],
        [climateScore, 100_000],
      ]);
      eligible = eligible
        && food >= 250_000
        && cover >= 300_000
        && nesting >= 300_000;
      break;
    }
    case "domestic-cat": {
      eligible = tile.terrain !== "deep-water";
      const localRodentOpportunity = weightedScore([
        [RAT_FOOD_OPPORTUNITY_BY_BIOME[biome], 450_000],
        [RAT_SHELTER_BY_BIOME[biome], 550_000],
      ]);
      food = weightedScore([
        [preySupport, 700_000],
        [localRodentOpportunity, 300_000],
      ]);
      water = Math.max(
        distanceScore(addressed.wetDistance, 16),
        multiplyFixed(climate.rainfall, 520_000),
      );
      cover = clampFixed(
        multiplyFixed(CAT_COVER_BY_BIOME[biome], 760_000)
          + multiplyFixed(tile.roughness, 240_000),
      );
      nesting = weightedScore([
        [cover, 680_000],
        [FIXED_POINT - climate.exposure, 320_000],
      ]);
      climateScore = catClimateScore(climate, interaction);
      score = weightedScore([
        [food, 380_000],
        [water, 100_000],
        [cover, 230_000],
        [nesting, 150_000],
        [climateScore, 140_000],
      ]);
      eligible = eligible
        && preySupport >= 125_000
        && food >= 260_000
        && cover >= 300_000
        && climateScore >= 300_000;
      break;
    }
  }

  eligible = eligible && addressed.withinSelection;
  const proximityPreference = addressed.focusDistance === null
    ? 0
    : multiplyFixed(
        distanceScore(addressed.focusDistance, (addressed.focusRadius ?? 0) + 1),
        // A focused runtime patch remains ecological, but its bounded
        // representatives should occupy the playable neighborhood rather than
        // clustering at the far edge of an otherwise suitable 32-tile radius.
        360_000,
      );

  return Object.freeze({
    addressed,
    eligible,
    food,
    water,
    cover,
    nesting,
    climate: climateScore,
    score,
    placementRank: score + proximityPreference,
    rankTie: keyedRandomU32(
      seed,
      HABITAT_RANDOM_DOMAIN,
      originRegion.x,
      originRegion.y,
      SITE_RANK_PURPOSE ^ SPECIES_PURPOSE[species],
      tile.index,
    ),
  });
}

function deerClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [FIXED_POINT - climate.salinity, 340_000],
    [centeredTolerance(climate.heat, 500_000, 700_000), 250_000],
    [FIXED_POINT - interaction.heatLoad, 170_000],
    [FIXED_POINT - climate.exposure, 240_000],
  ]);
}

function gullClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.salinity, 600_000, 800_000), 350_000],
    [centeredTolerance(climate.heat, 540_000, 850_000), 220_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 170_000],
    [centeredTolerance(climate.exposure, 600_000, FIXED_POINT), 260_000],
  ]);
}

function bearClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [FIXED_POINT - climate.salinity, 300_000],
    [centeredTolerance(climate.heat, 420_000, 850_000), 300_000],
    [FIXED_POINT - interaction.heatLoad, 150_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 250_000],
  ]);
}

function ratClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 580_000, 900_000), 300_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 300_000],
    [FIXED_POINT - Math.trunc(interaction.saltStress / 2), 200_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 200_000],
  ]);
}

function catClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 600_000, 850_000), 340_000],
    [FIXED_POINT - climate.exposure, 300_000],
    [FIXED_POINT - Math.trunc(interaction.saltStress / 2), 180_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 180_000],
  ]);
}

function averageSiteInputs(
  sites: readonly HabitatSiteEvaluation[],
): Omit<CoreEcologyHabitatCapacityInputs, "eligibleTiles" | "suitableTiles" | "weightedHabitatArea" | "predatorPressure"> {
  if (sites.length === 0) {
    return { food: 0, water: 0, cover: 0, nesting: 0, climate: 0 };
  }
  let food = 0;
  let water = 0;
  let cover = 0;
  let nesting = 0;
  let climate = 0;
  for (const site of sites) {
    food += site.food;
    water += site.water;
    cover += site.cover;
    nesting += site.nesting;
    climate += site.climate;
  }
  return {
    food: Math.trunc(food / sites.length),
    water: Math.trunc(water / sites.length),
    cover: Math.trunc(cover / sites.length),
    nesting: Math.trunc(nesting / sites.length),
    climate: Math.trunc(climate / sites.length),
  };
}

function distanceField(
  terrain: TerrainState,
  source: (tile: TerrainTile) => boolean,
): readonly number[] {
  const distances = terrain.tiles.map((tile) => source(tile) ? 0 : MAX_DISTANCE);
  for (let y = 0; y < terrain.height; y += 1) {
    for (let x = 0; x < terrain.width; x += 1) {
      const index = y * terrain.width + x;
      const west = x > 0 ? (distances[index - 1] ?? MAX_DISTANCE) + 1 : MAX_DISTANCE;
      const north = y > 0 ? (distances[index - terrain.width] ?? MAX_DISTANCE) + 1 : MAX_DISTANCE;
      distances[index] = Math.min(distances[index] ?? MAX_DISTANCE, west, north);
    }
  }
  for (let y = terrain.height - 1; y >= 0; y -= 1) {
    for (let x = terrain.width - 1; x >= 0; x -= 1) {
      const index = y * terrain.width + x;
      const east = x + 1 < terrain.width
        ? (distances[index + 1] ?? MAX_DISTANCE) + 1
        : MAX_DISTANCE;
      const south = y + 1 < terrain.height
        ? (distances[index + terrain.width] ?? MAX_DISTANCE) + 1
        : MAX_DISTANCE;
      distances[index] = Math.min(distances[index] ?? MAX_DISTANCE, east, south);
    }
  }
  return Object.freeze(distances);
}

function normalizeSelection(
  focus: CoreEcologyHabitatFocusInput | undefined,
  originRegion: RegionCoord,
): CoreEcologyHabitatSelection {
  if (focus === undefined) {
    return Object.freeze({
      focusPosition: null,
      radiusTiles: null,
      excludedTileIndices: Object.freeze([]),
    });
  }
  if (
    !plainRecord(focus)
    || !allowedKeys(focus, ["excludedTileIndices", "position", "radiusTiles"])
    || !Object.hasOwn(focus, "position")
    || !Object.hasOwn(focus, "radiusTiles")
    || !isWorldPosition(focus.position)
    || focus.position.region.x !== originRegion.x
    || focus.position.region.y !== originRegion.y
    || !Number.isSafeInteger(focus.radiusTiles)
    || focus.radiusTiles < 1
    || focus.radiusTiles > CORE_ECOLOGY_HABITAT_MAX_FOCUS_RADIUS_TILES
  ) throw new RangeError("Core ecology habitat focus is malformed or outside its origin region");
  const excludedInput = focus.excludedTileIndices ?? [];
  if (!Array.isArray(excludedInput) || excludedInput.length > CORE_ECOLOGY_HABITAT_MAX_EXCLUDED_TILES) {
    throw new RangeError("Core ecology habitat exclusions exceed their bounded budget");
  }
  const excluded = [...new Set(excludedInput)].sort((left, right) => left - right);
  if (
    excluded.some((tileIndex) =>
      !Number.isSafeInteger(tileIndex)
      || tileIndex < 0
      || tileIndex >= CORE_ECOLOGY_HABITAT_TILE_BUDGET
      || Object.is(tileIndex, -0))
  ) throw new RangeError("Core ecology habitat exclusions contain an invalid tile address");
  const focusPosition = createWorldPosition(
    originRegion,
    focus.position.localX,
    focus.position.localY,
  );
  return Object.freeze({
    focusPosition,
    radiusTiles: focus.radiusTiles,
    excludedTileIndices: Object.freeze(excluded),
  });
}

function requireCanonicalSuppliedTerrain(
  terrain: TerrainState,
  expectedHash: string,
): TerrainState {
  if (!canonicalTerrainShape(terrain) || regionTerrainHash(terrain) !== expectedHash) {
    throw new RangeError("Supplied ecology terrain is not this seed and region's canonical baseline");
  }
  return terrain;
}

function canonicalTerrainShape(value: unknown): value is TerrainState {
  if (!plainRecord(value) || !exactKeys(value, ["height", "tiles", "width"])) return false;
  if (
    value.width !== WORLD_WIDTH
    || value.height !== WORLD_HEIGHT
    || !Array.isArray(value.tiles)
    || value.tiles.length !== CORE_ECOLOGY_HABITAT_TILE_BUDGET
  ) return false;
  const terrainKinds = new Set<string>([
    "deep-water",
    "tidal-flat",
    "marsh",
    "meadow",
    "ridge",
  ]);
  for (let index = 0; index < value.tiles.length; index += 1) {
    const tile = value.tiles[index];
    if (
      !plainRecord(tile)
      || !exactKeys(tile, [
        "baseTravelCost",
        "elevation",
        "index",
        "moisture",
        "roughness",
        "terrain",
        "traceStrength",
        "x",
        "y",
      ])
      || tile.index !== index
      || tile.x !== index % WORLD_WIDTH
      || tile.y !== Math.trunc(index / WORLD_WIDTH)
      || !fixedInteger(tile.elevation)
      || !fixedInteger(tile.moisture)
      || !fixedInteger(tile.roughness)
      || !terrainKinds.has(tile.terrain as string)
      || !nonnegativeSafeInteger(tile.baseTravelCost)
      || tile.traceStrength !== 0
    ) return false;
  }
  return true;
}

function compareSites(left: HabitatSiteEvaluation, right: HabitatSiteEvaluation): number {
  if (left.placementRank !== right.placementRank) return right.placementRank - left.placementRank;
  if (left.rankTie !== right.rankTie) return right.rankTie - left.rankTie;
  return left.addressed.tile.index - right.addressed.tile.index;
}

function compareSitesWithPreferredAllocations(
  left: HabitatSiteEvaluation,
  right: HabitatSiteEvaluation,
  preferredAllocations: readonly CoreEcologyHabitatAllocation[],
): number {
  if (preferredAllocations.length > 0) {
    const leftDistance = nearestAllocationDistance(left, preferredAllocations);
    const rightDistance = nearestAllocationDistance(right, preferredAllocations);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  }
  return compareSites(left, right);
}

function nearestAllocationDistance(
  site: HabitatSiteEvaluation,
  preferredAllocations: readonly CoreEcologyHabitatAllocation[],
): number {
  let nearest = MAX_DISTANCE;
  for (const allocation of preferredAllocations) {
    const allocationX = allocation.tileIndex % WORLD_WIDTH;
    const allocationY = Math.trunc(allocation.tileIndex / WORLD_WIDTH);
    nearest = Math.min(
      nearest,
      Math.abs(site.addressed.tile.x - allocationX)
        + Math.abs(site.addressed.tile.y - allocationY),
    );
  }
  return nearest;
}

function activitySignalFor(
  population: AllocatedPopulationAnalysis,
): CoreEcologyHarborEdgeActivitySignal {
  const policy = ACTIVITY_POLICY[population.species];
  const intensity = population.populationUnits === 0
    ? 0
    : clampFixed(
        150_000
          + multiplyFixed(population.populationPressure, 650_000)
          + multiplyFixed(
            ratioFixed(
              population.habitatCapacity,
              SPECIES_RULES[population.species].maximumPopulation,
            ),
            200_000,
          ),
      );
  return Object.freeze({
    kind: policy.kind,
    intensity,
    activePeriod: policy.activePeriod,
    source: "habitat-derived",
  });
}

function sameActivitySignal(
  value: unknown,
  expected: CoreEcologyHarborEdgeActivitySignal,
): boolean {
  return plainRecord(value)
    && exactKeys(value, ["activePeriod", "intensity", "kind", "source"])
    && value.activePeriod === expected.activePeriod
    && value.intensity === expected.intensity
    && value.kind === expected.kind
    && value.source === expected.source;
}

function manhattanTiles(left: TerrainTile, right: TerrainTile): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function distanceScore(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  return clampFixed(FIXED_POINT - Math.trunc((distance * FIXED_POINT) / radius));
}

function centeredTolerance(value: number, center: number, span: number): number {
  return clampFixed(FIXED_POINT - Math.trunc((Math.abs(value - center) * FIXED_POINT) / span));
}

function weightedScore(values: readonly (readonly [number, number])[]): number {
  let total = 0;
  let weights = 0;
  for (const [value, weight] of values) {
    total += clampFixed(value) * weight;
    weights += weight;
  }
  return weights === 0 ? 0 : clampFixed(Math.trunc(total / weights));
}

function multiplyFixed(left: number, right: number): number {
  return clampFixed(Math.trunc((clampFixed(left) * clampFixed(right)) / FIXED_POINT));
}

function ratioFixed(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return clampFixed(Math.trunc((numerator * FIXED_POINT) / denominator));
}

function clampFixed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function fixedInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function signedFixedInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= -FIXED_POINT
    && value <= FIXED_POINT
    && !Object.is(value, -0);
}

function canonicalSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0);
}

function validTrend(value: unknown, signal: number): value is CoreEcologyPopulationTrend {
  return signal >= 80_000
    ? value === "growing"
    : signal <= -80_000
    ? value === "declining"
    : value === "stable";
}

function validAllocationTerrain(
  species: CoreEcologyHarborEdgeHabitatSpecies,
  terrain: string,
): boolean {
  if (species === "gull") return terrain !== "deep-water" && isTerrainKind(terrain);
  if (species === "brown-rat" || species === "domestic-cat") {
    return terrain !== "deep-water" && isTerrainKind(terrain);
  }
  return terrain === "marsh" || terrain === "meadow" || terrain === "ridge";
}

function isTerrainKind(value: string): value is TerrainKind {
  return value === "deep-water"
    || value === "tidal-flat"
    || value === "marsh"
    || value === "meadow"
    || value === "ridge";
}

function regionIdMatches(regionId: string, coord: RegionCoord): boolean {
  const match = /^rg1:[0-9a-f]{32}:(0|-?[1-9]\d*):(0|-?[1-9]\d*)$/u.exec(regionId);
  if (match === null) return false;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return canonicalSafeInteger(x)
    && canonicalSafeInteger(y)
    && x === coord.x
    && y === coord.y;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function allowedKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

// Keep purpose/address constants inside the counter-keyed uint32 dialect.
if (
  !Object.values(SPECIES_PURPOSE).every((value) => value >= 0 && value <= UINT32_MAX)
  || CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS
    !== CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES.reduce(
      (sum, species) => sum + SPECIES_RULES[species].maximumAllocations,
      0,
    )
  || CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS
    !== CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.reduce(
      (sum, species) => sum + SPECIES_RULES[species].maximumAllocations,
      0,
    )
) throw new Error("Core ecology habitat generation constants are incoherent");
