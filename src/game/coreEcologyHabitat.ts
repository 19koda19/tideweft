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
import { MAX_TIDE_LEVEL, MIN_TIDE_LEVEL } from "../sim/terrain";
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
export const CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION = 3 as const;
export const CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION = 4 as const;
export const CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION = 5 as const;
export const CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION = 6 as const;
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
export const CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES = [
  ...CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES,
  "marsh-rabbit",
  "marsh-fox",
] as const;
export const CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES = [
  ...CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES,
  "fish-crow",
  "northern-harrier",
  "southern-leopard-frog",
] as const;
export const CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES = [
  ...CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES,
  "atlantic-silverside",
  "atlantic-marsh-fiddler-crab",
  "snowy-egret",
] as const;
export const CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES = [
  ...CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES,
  "american-black-duck",
] as const;
export type CoreEcologyWaveAHabitatSpecies =
  (typeof CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES)[number];
export type CoreEcologyHarborEdgeHabitatSpecies =
  (typeof CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES)[number];
export type CoreEcologyMarshEdgeHabitatSpecies =
  (typeof CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES)[number];
export type CoreEcologyRainChorusHabitatSpecies =
  (typeof CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES)[number];
export type CoreEcologyTidalTableHabitatSpecies =
  (typeof CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES)[number];
export type CoreEcologyWaterfowlHabitatSpecies =
  (typeof CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES)[number];
export type CoreEcologyHabitatRepresentation =
  | "aggregate-area"
  | "group-actor"
  | "individual-representatives";
export const CORE_ECOLOGY_HABITAT_TILE_BUDGET = WORLD_WIDTH * WORLD_HEIGHT;
export const CORE_ECOLOGY_HABITAT_SPECIES_EVALUATION_BUDGET =
  CORE_ECOLOGY_HABITAT_TILE_BUDGET * CORE_ECOLOGY_WAVE_A_HABITAT_SPECIES.length;
export const CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES_EVALUATION_BUDGET =
  CORE_ECOLOGY_HABITAT_TILE_BUDGET * CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length;
export const CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES_EVALUATION_BUDGET =
  CORE_ECOLOGY_HABITAT_TILE_BUDGET * CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length;
export const CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES_EVALUATION_BUDGET =
  CORE_ECOLOGY_HABITAT_TILE_BUDGET * CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.length;
export const CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES_EVALUATION_BUDGET =
  CORE_ECOLOGY_HABITAT_TILE_BUDGET * CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length;
export const CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES_EVALUATION_BUDGET =
  CORE_ECOLOGY_HABITAT_TILE_BUDGET * CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES.length;
export const CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS = 11 as const;
export const CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS = 16 as const;
export const CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS = 21 as const;
export const CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS = 28 as const;
export const CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS = 36 as const;
export const CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS = 37 as const;
/** Saved, non-population tidal destinations remain deliberately small and bounded. */
export const CORE_ECOLOGY_TIDAL_TABLE_MAX_ANCHOR_RECORDS = 12 as const;
export const CORE_ECOLOGY_WATERFOWL_MAX_ANCHOR_RECORDS = 15 as const;
export const CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH = 20_000 as const;
export const CORE_ECOLOGY_SNOWY_EGRET_WADING_ANCHORS = 4 as const;
export const CORE_ECOLOGY_SNOWY_EGRET_REFUGE_ANCHORS = 1 as const;
export const CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH = 8_000 as const;
export const CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH = 78_000 as const;
export const CORE_ECOLOGY_AMERICAN_BLACK_DUCK_DABBLING_ANCHORS = 2 as const;
export const CORE_ECOLOGY_AMERICAN_BLACK_DUCK_REFUGE_ANCHORS = 1 as const;
export const CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH = 18_000 as const;
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
    | "burrow-foraging"
    | "chorusing"
    | "dabbling"
    | "foraging"
    | "quartering-search"
    | "roaming"
    | "schooling"
    | "shared-alarm"
    | "shelter-use"
    | "shore-feeding"
    | "wading-search";
  /** Habitat-derived fixed-point likelihood/intensity, never direct perception. */
  readonly intensity: number;
  readonly activePeriod:
    | "crepuscular"
    | "diurnal"
    | "nocturnal"
    | "rain-responsive"
    | "tide-responsive"
    | "variable";
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

export interface CoreEcologyMarshEdgeHabitatPopulationAnalysis {
  readonly species: CoreEcologyMarshEdgeHabitatSpecies;
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

export interface CoreEcologyRainChorusHabitatPopulationAnalysis {
  readonly species: CoreEcologyRainChorusHabitatSpecies;
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

export interface CoreEcologyTidalTableHabitatPopulationAnalysis {
  readonly species: CoreEcologyTidalTableHabitatSpecies;
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

export interface CoreEcologyWaterfowlHabitatPopulationAnalysis {
  readonly species: CoreEcologyWaterfowlHabitatSpecies;
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

export type CoreEcologyTidalTableAnchorSpecies =
  | "atlantic-silverside"
  | "atlantic-marsh-fiddler-crab"
  | "snowy-egret"
  | "american-black-duck";

export type CoreEcologyTidalTableAnchorPurpose =
  | "population"
  | "wading"
  | "dabbling"
  | "refuge";

/**
 * Seed/region/habitat-derived tidal destination. Elevation is persisted so
 * live tide can derive local depth without trusting camera state or rebuilding
 * terrain every tick. Population anchors mirror fish/crab allocations;
 * wading/refuge anchors are movement destinations and never mint population.
 */
export interface CoreEcologyTidalTableHabitatAnchor {
  readonly species: CoreEcologyTidalTableAnchorSpecies;
  readonly purpose: CoreEcologyTidalTableAnchorPurpose;
  readonly anchorOrdinal: number;
  readonly tileIndex: number;
  readonly globalTile: GlobalTileCoord;
  readonly position: WorldPosition;
  readonly elevation: number;
  readonly terrain: TerrainKind;
  readonly biome: BiomeId;
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

/**
 * Additive marsh-edge habitat record. The first five analyses are the exact
 * v2 harbor-edge records; only rabbit and fox analyses are appended.
 */
export interface CoreEcologyMarshEdgeHabitatAssemblage {
  readonly generationVersion: typeof CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION;
  readonly originRegion: RegionCoord;
  readonly regionId: string;
  readonly terrainHash: string;
  readonly selection: CoreEcologyHabitatSelection;
  readonly evaluatedTiles: number;
  readonly speciesEvaluations: number;
  readonly maximumAllocationBudget:
    typeof CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS;
  /** Fixed versioned order, including honest absences. */
  readonly populations: readonly CoreEcologyMarshEdgeHabitatPopulationAnalysis[];
}

/**
 * Additive rain-chorus record. The first seven analyses are the exact v3
 * marsh-edge records; crow, harrier, and frog analyses are appended in that
 * fixed order. Frog allocations are non-addressable population-area anchors.
 */
export interface CoreEcologyRainChorusHabitatAssemblage {
  readonly generationVersion: typeof CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION;
  readonly originRegion: RegionCoord;
  readonly regionId: string;
  readonly terrainHash: string;
  readonly selection: CoreEcologyHabitatSelection;
  readonly evaluatedTiles: number;
  readonly speciesEvaluations: number;
  readonly maximumAllocationBudget:
    typeof CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS;
  /** Fixed versioned order, including honest absences. */
  readonly populations: readonly CoreEcologyRainChorusHabitatPopulationAnalysis[];
}

/**
 * Additive tidal-table record. The first ten analyses are the exact v4
 * rain-chorus records. Silverside school, fiddler-crab area, and snowy-egret
 * analyses are appended in fixed order; live tide never participates in this
 * baseline identity/capacity derivation.
 */
export interface CoreEcologyTidalTableHabitatAssemblage {
  readonly generationVersion: typeof CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION;
  readonly originRegion: RegionCoord;
  readonly regionId: string;
  readonly terrainHash: string;
  readonly selection: CoreEcologyHabitatSelection;
  readonly evaluatedTiles: number;
  readonly speciesEvaluations: number;
  readonly maximumAllocationBudget:
    typeof CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS;
  /** Fixed versioned order, including honest absences. */
  readonly populations: readonly CoreEcologyTidalTableHabitatPopulationAnalysis[];
  /** Stable live-tide depth sources and lawful egret movement destinations. */
  readonly tidalAnchors: readonly CoreEcologyTidalTableHabitatAnchor[];
}

/**
 * Additive waterfowl record. The first thirteen population analyses and every
 * v5 tidal anchor are retained byte-for-byte and in order; the duck analysis
 * and its bounded movement destinations are appended only by version 6.
 */
export interface CoreEcologyWaterfowlHabitatAssemblage {
  readonly generationVersion: typeof CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION;
  readonly originRegion: RegionCoord;
  readonly regionId: string;
  readonly terrainHash: string;
  readonly selection: CoreEcologyHabitatSelection;
  readonly evaluatedTiles: number;
  readonly speciesEvaluations: number;
  readonly maximumAllocationBudget:
    typeof CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS;
  readonly populations: readonly CoreEcologyWaterfowlHabitatPopulationAnalysis[];
  readonly tidalAnchors: readonly CoreEcologyTidalTableHabitatAnchor[];
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
  readonly minimumOccupancyTarget: number;
  readonly maximumOccupancyTarget: number;
  readonly minimumPopulationWhenViable: number;
}

export interface CoreEcologyHabitatSpeciesBounds {
  readonly species: CoreEcologyWaterfowlHabitatSpecies;
  readonly representation: CoreEcologyHabitatRepresentation;
  readonly maximumPopulation: number;
  readonly maximumAllocations: number;
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
  Species extends CoreEcologyWaterfowlHabitatSpecies = CoreEcologyWaterfowlHabitatSpecies,
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
  Species extends CoreEcologyWaterfowlHabitatSpecies = CoreEcologyWaterfowlHabitatSpecies,
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

interface PreparedCoreEcologyHabitatContext {
  readonly originRegion: RegionCoord;
  readonly terrainHash: string;
  readonly selection: CoreEcologyHabitatSelection;
  readonly addressedTiles: readonly AddressedHabitatTile[];
}

const HABITAT_RANDOM_DOMAIN = 0x4841_4231;
const SITE_RANK_PURPOSE = 0x5349_5445;
const POPULATION_PRESSURE_PURPOSE = 0x5052_5352;
const MAX_DISTANCE = WORLD_WIDTH + WORLD_HEIGHT;
const UINT32_MAX = 0xffff_ffff;

const SPECIES_PURPOSE: Readonly<Record<CoreEcologyWaterfowlHabitatSpecies, number>> = Object.freeze({
  deer: 0x4445_4552,
  gull: 0x4755_4c4c,
  "black-bear": 0x4245_4152,
  "brown-rat": 0x5241_5453,
  "domestic-cat": 0x4341_5453,
  "marsh-rabbit": 0x5241_4242,
  "marsh-fox": 0x464f_584d,
  "fish-crow": 0x4352_4f57,
  "northern-harrier": 0x4841_5252,
  "southern-leopard-frog": 0x4652_4f47,
  "atlantic-silverside": 0x5349_4c56,
  "atlantic-marsh-fiddler-crab": 0x4649_4444,
  "snowy-egret": 0x4547_5245,
  "american-black-duck": 0x4244_5543,
});

const SPECIES_RULES: Readonly<Record<CoreEcologyWaterfowlHabitatSpecies, HabitatSpeciesRule>> =
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
      minimumOccupancyTarget: 450_000,
      maximumOccupancyTarget: 950_000,
      minimumPopulationWhenViable: 1,
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
      minimumOccupancyTarget: 450_000,
      maximumOccupancyTarget: 950_000,
      minimumPopulationWhenViable: 1,
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
      minimumOccupancyTarget: 450_000,
      maximumOccupancyTarget: 950_000,
      minimumPopulationWhenViable: 1,
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
      minimumOccupancyTarget: 450_000,
      maximumOccupancyTarget: 950_000,
      minimumPopulationWhenViable: 1,
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
      minimumOccupancyTarget: 450_000,
      maximumOccupancyTarget: 950_000,
      minimumPopulationWhenViable: 1,
    }),
    "marsh-rabbit": Object.freeze({
      populationKey: "habitat-v3/marsh-rabbit",
      representation: "individual-representatives",
      minimumSiteScore: 410_000,
      minimumPersistentCapacity: 2,
      maximumPopulation: 24,
      tilesPerCapacityUnit: 84,
      maximumAllocations: 3,
      minimumAllocationSeparation: 4,
      minimumOccupancyTarget: 450_000,
      maximumOccupancyTarget: 950_000,
      minimumPopulationWhenViable: 1,
    }),
    "marsh-fox": Object.freeze({
      populationKey: "habitat-v3/marsh-fox",
      representation: "individual-representatives",
      minimumSiteScore: 430_000,
      minimumPersistentCapacity: 1,
      maximumPopulation: 3,
      tilesPerCapacityUnit: 460,
      maximumAllocations: 2,
      minimumAllocationSeparation: 10,
      minimumOccupancyTarget: 450_000,
      maximumOccupancyTarget: 950_000,
      minimumPopulationWhenViable: 1,
    }),
    "fish-crow": Object.freeze({
      populationKey: "habitat-v4/fish-crow",
      representation: "individual-representatives",
      minimumSiteScore: 410_000,
      minimumPersistentCapacity: 1,
      maximumPopulation: 3,
      tilesPerCapacityUnit: 280,
      maximumAllocations: 3,
      minimumAllocationSeparation: 4,
      minimumOccupancyTarget: 650_000,
      maximumOccupancyTarget: 1_000_000,
      minimumPopulationWhenViable: 1,
    }),
    "northern-harrier": Object.freeze({
      populationKey: "habitat-v4/northern-harrier",
      representation: "individual-representatives",
      minimumSiteScore: 440_000,
      minimumPersistentCapacity: 1,
      maximumPopulation: 1,
      tilesPerCapacityUnit: 760,
      maximumAllocations: 1,
      minimumAllocationSeparation: 16,
      minimumOccupancyTarget: 1_000_000,
      maximumOccupancyTarget: 1_000_000,
      minimumPopulationWhenViable: 1,
    }),
    "southern-leopard-frog": Object.freeze({
      populationKey: "habitat-v4/southern-leopard-frog",
      representation: "aggregate-area",
      minimumSiteScore: 390_000,
      minimumPersistentCapacity: 64,
      maximumPopulation: 72,
      tilesPerCapacityUnit: 5,
      maximumAllocations: 3,
      minimumAllocationSeparation: 3,
      minimumOccupancyTarget: 890_000,
      maximumOccupancyTarget: 1_000_000,
      minimumPopulationWhenViable: 64,
    }),
    "atlantic-silverside": Object.freeze({
      populationKey: "habitat-v5/atlantic-silverside",
      representation: "group-actor",
      minimumSiteScore: 430_000,
      minimumPersistentCapacity: 24,
      maximumPopulation: 48,
      tilesPerCapacityUnit: 4,
      maximumAllocations: 3,
      minimumAllocationSeparation: 3,
      minimumOccupancyTarget: 760_000,
      maximumOccupancyTarget: 980_000,
      minimumPopulationWhenViable: 24,
    }),
    "atlantic-marsh-fiddler-crab": Object.freeze({
      populationKey: "habitat-v5/atlantic-marsh-fiddler-crab",
      representation: "aggregate-area",
      minimumSiteScore: 410_000,
      minimumPersistentCapacity: 32,
      maximumPopulation: 80,
      tilesPerCapacityUnit: 5,
      maximumAllocations: 4,
      minimumAllocationSeparation: 3,
      minimumOccupancyTarget: 740_000,
      maximumOccupancyTarget: 980_000,
      minimumPopulationWhenViable: 32,
    }),
    "snowy-egret": Object.freeze({
      populationKey: "habitat-v5/snowy-egret",
      representation: "individual-representatives",
      minimumSiteScore: 450_000,
      minimumPersistentCapacity: 1,
      maximumPopulation: 1,
      tilesPerCapacityUnit: 480,
      maximumAllocations: 1,
      minimumAllocationSeparation: 16,
      minimumOccupancyTarget: 1_000_000,
      maximumOccupancyTarget: 1_000_000,
      minimumPopulationWhenViable: 1,
    }),
    "american-black-duck": Object.freeze({
      populationKey: "habitat-v6/american-black-duck",
      representation: "individual-representatives",
      minimumSiteScore: 435_000,
      minimumPersistentCapacity: 1,
      maximumPopulation: 1,
      tilesPerCapacityUnit: 520,
      maximumAllocations: 1,
      minimumAllocationSeparation: 16,
      minimumOccupancyTarget: 1_000_000,
      maximumOccupancyTarget: 1_000_000,
      minimumPopulationWhenViable: 1,
    }),
  });

/** Shared read-only seam used to prove habitat, identity, and runtime budgets agree. */
export function coreEcologyHabitatSpeciesBounds(
  value: unknown,
): CoreEcologyHabitatSpeciesBounds | null {
  if (
    typeof value !== "string"
    || !(CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES as readonly string[]).includes(value)
  ) return null;
  const species = value as CoreEcologyWaterfowlHabitatSpecies;
  const rule = SPECIES_RULES[species];
  return Object.freeze({
    species,
    representation: rule.representation,
    maximumPopulation: rule.maximumPopulation,
    maximumAllocations: rule.maximumAllocations,
  });
}

const ACTIVITY_POLICY: Readonly<Record<
  CoreEcologyWaterfowlHabitatSpecies,
  Readonly<Pick<CoreEcologyHarborEdgeActivitySignal, "activePeriod" | "kind">>
>> = Object.freeze({
  deer: Object.freeze({ kind: "browsing", activePeriod: "crepuscular" }),
  gull: Object.freeze({ kind: "shore-feeding", activePeriod: "diurnal" }),
  "black-bear": Object.freeze({ kind: "foraging", activePeriod: "variable" }),
  "brown-rat": Object.freeze({ kind: "shelter-use", activePeriod: "nocturnal" }),
  "domestic-cat": Object.freeze({ kind: "roaming", activePeriod: "crepuscular" }),
  "marsh-rabbit": Object.freeze({ kind: "foraging", activePeriod: "crepuscular" }),
  "marsh-fox": Object.freeze({ kind: "roaming", activePeriod: "variable" }),
  "fish-crow": Object.freeze({ kind: "shared-alarm", activePeriod: "diurnal" }),
  "northern-harrier": Object.freeze({ kind: "quartering-search", activePeriod: "diurnal" }),
  "southern-leopard-frog": Object.freeze({
    kind: "chorusing",
    activePeriod: "rain-responsive",
  }),
  "atlantic-silverside": Object.freeze({
    kind: "schooling",
    activePeriod: "tide-responsive",
  }),
  "atlantic-marsh-fiddler-crab": Object.freeze({
    kind: "burrow-foraging",
    activePeriod: "tide-responsive",
  }),
  "snowy-egret": Object.freeze({
    kind: "wading-search",
    activePeriod: "tide-responsive",
  }),
  "american-black-duck": Object.freeze({
    kind: "dabbling",
    activePeriod: "tide-responsive",
  }),
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

const FISH_CROW_FOOD_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 340_000,
  "brine-flat": 820_000,
  "reed-marsh": 900_000,
  "rain-meadow": 720_000,
  "sun-meadow": 620_000,
  "wind-ridge": 420_000,
  glimmerfen: 860_000,
});

const FISH_CROW_PERCH_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 560_000,
  "reed-marsh": 820_000,
  "rain-meadow": 780_000,
  "sun-meadow": 720_000,
  "wind-ridge": 900_000,
  glimmerfen: 820_000,
});

const HARRIER_SEARCH_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 420_000,
  "reed-marsh": 960_000,
  "rain-meadow": 900_000,
  "sun-meadow": 720_000,
  "wind-ridge": 580_000,
  glimmerfen: 880_000,
});

const FROG_FOOD_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 80_000,
  "reed-marsh": 1_000_000,
  "rain-meadow": 880_000,
  "sun-meadow": 420_000,
  "wind-ridge": 100_000,
  glimmerfen: 960_000,
});

const FROG_COVER_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 0,
  "brine-flat": 60_000,
  "reed-marsh": 960_000,
  "rain-meadow": 760_000,
  "sun-meadow": 320_000,
  "wind-ridge": 80_000,
  glimmerfen: 940_000,
});

const SILVERSIDE_FOOD_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 1_000_000,
  "brine-flat": 780_000,
  "reed-marsh": 820_000,
  "rain-meadow": 80_000,
  "sun-meadow": 60_000,
  "wind-ridge": 0,
  glimmerfen: 520_000,
});

const FIDDLER_FOOD_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 100_000,
  "brine-flat": 1_000_000,
  "reed-marsh": 920_000,
  "rain-meadow": 180_000,
  "sun-meadow": 120_000,
  "wind-ridge": 0,
  glimmerfen: 640_000,
});

const EGRET_SEARCH_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 420_000,
  "brine-flat": 940_000,
  "reed-marsh": 1_000_000,
  "rain-meadow": 340_000,
  "sun-meadow": 240_000,
  "wind-ridge": 120_000,
  glimmerfen: 820_000,
});

const BLACK_DUCK_FORAGE_BY_BIOME: Readonly<Record<BiomeId, number>> = Object.freeze({
  "tide-channel": 760_000,
  "brine-flat": 820_000,
  "reed-marsh": 1_000_000,
  "rain-meadow": 420_000,
  "sun-meadow": 280_000,
  "wind-ridge": 80_000,
  glimmerfen: 880_000,
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
    applyPredatorPressure(deerBase, bearPressure),
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
  const context = prepareCoreEcologyHabitatContext(input, "harbor-edge");
  return deriveCoreEcologyHarborEdgeFromPrepared(input.rootSeed, context);
}

function deriveCoreEcologyHarborEdgeFromPrepared(
  rootSeed: RootSeed,
  context: PreparedCoreEcologyHabitatContext,
): CoreEcologyHarborEdgeHabitatAssemblage {
  const { addressedTiles, originRegion, selection, terrainHash } = context;
  const evaluatedTiles = addressedTiles.length;
  const speciesEvaluations =
    evaluatedTiles * CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length;

  const deerBase = analyzeEnvironmentalCapacity(
    rootSeed,
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
    rootSeed,
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
  const deer = applyPredatorPressure(deerBase, bearPressure);
  const gull = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "gull",
    addressedTiles,
    0,
    multiplyFixed(bearPressure, 300_000),
  );
  const ratBase = analyzeEnvironmentalCapacity(
    rootSeed,
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
    rootSeed,
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
  const rat = applyPredatorPressure(ratBase, catPressure);

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
    regionId: stableRegionId(rootSeed, originRegion),
    terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

/**
 * Pure marsh-edge extension. The complete v2 prefix is reused unchanged;
 * rabbit and fox analyses then occupy the remaining individual-representative
 * plane. Fox viability is derived from actual rabbit/rat population support,
 * not from a guaranteed roster or an ambient spawn count.
 */
export function deriveCoreEcologyMarshEdgeHabitatAssemblage(
  input: DeriveCoreEcologyHabitatAssemblageInput,
): CoreEcologyMarshEdgeHabitatAssemblage {
  const context = prepareCoreEcologyHabitatContext(input, "marsh-edge");
  return deriveCoreEcologyMarshEdgeFromPrepared(input.rootSeed, context);
}

function deriveCoreEcologyMarshEdgeFromPrepared(
  rootSeed: RootSeed,
  context: PreparedCoreEcologyHabitatContext,
): CoreEcologyMarshEdgeHabitatAssemblage {
  // Terrain, its canonical hash, selection, distance fields, and biome/climate
  // addressing are shared by the frozen v2 prefix and additive analyses.
  const harborEdge = deriveCoreEcologyHarborEdgeFromPrepared(rootSeed, context);
  const originRegion = harborEdge.originRegion;
  const addressedTiles = context.addressedTiles;
  const rat = harborEdge.populations.find(({ species }) => species === "brown-rat");
  if (rat === undefined) throw new Error("Core ecology harbor-edge rat analysis is missing");

  const rabbitBase = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "marsh-rabbit",
    addressedTiles,
    0,
    0,
  );
  const rabbitSupport = ratioFixed(
    rabbitBase.populationUnits,
    SPECIES_RULES["marsh-rabbit"].maximumPopulation,
  );
  const ratSupport = ratioFixed(
    rat.populationUnits,
    SPECIES_RULES["brown-rat"].maximumPopulation,
  );
  const smallPreySupport = clampFixed(
    multiplyFixed(rabbitSupport, 700_000)
      + multiplyFixed(ratSupport, 400_000),
  );
  const fox = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "marsh-fox",
    addressedTiles,
    smallPreySupport,
    0,
  );
  const foxPressure = multiplyFixed(
    ratioFixed(fox.populationUnits, SPECIES_RULES["marsh-fox"].maximumPopulation),
    260_000,
  );
  const rabbit = applyPredatorPressure(rabbitBase, foxPressure);

  const individualOccupiedTiles = new Set<number>();
  for (const population of harborEdge.populations) {
    if (population.representation !== "individual-representatives") continue;
    for (const allocation of population.allocations) {
      individualOccupiedTiles.add(allocation.tileIndex);
    }
  }
  const allocatedRabbit = allocatePopulation(
    rabbit,
    originRegion,
    individualOccupiedTiles,
  );
  const allocatedFox = allocatePopulation(
    fox,
    originRegion,
    individualOccupiedTiles,
    [...allocatedRabbit.allocations, ...rat.allocations],
  );
  const extension = [allocatedRabbit, allocatedFox].map((population) => Object.freeze({
    ...population,
    representation: SPECIES_RULES[population.species].representation,
    activitySignal: activitySignalFor(population),
  }));
  const populations: CoreEcologyMarshEdgeHabitatPopulationAnalysis[] = [
    ...harborEdge.populations,
    ...extension,
  ];
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS) {
    throw new Error("Core ecology marsh-edge habitat allocation budget diverged");
  }

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION,
    originRegion,
    regionId: harborEdge.regionId,
    terrainHash: harborEdge.terrainHash,
    selection: harborEdge.selection,
    evaluatedTiles: harborEdge.evaluatedTiles,
    speciesEvaluations:
      harborEdge.evaluatedTiles * CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

/**
 * Pure rain-chorus extension. Its first seven records are exactly the v3
 * marsh-edge result. New individual birds share the existing individual
 * occupancy plane, while the frog population area has its own bounded anchor
 * plane and therefore never manufactures frog actors.
 */
export function deriveCoreEcologyRainChorusHabitatAssemblage(
  input: DeriveCoreEcologyHabitatAssemblageInput,
): CoreEcologyRainChorusHabitatAssemblage {
  const context = prepareCoreEcologyHabitatContext(input, "rain-chorus");
  return deriveCoreEcologyRainChorusFromPrepared(input.rootSeed, context);
}

function deriveCoreEcologyRainChorusFromPrepared(
  rootSeed: RootSeed,
  context: PreparedCoreEcologyHabitatContext,
): CoreEcologyRainChorusHabitatAssemblage {
  const marshEdge = deriveCoreEcologyMarshEdgeFromPrepared(rootSeed, context);
  const { addressedTiles } = context;
  const { originRegion } = marshEdge;

  const frogBase = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "southern-leopard-frog",
    addressedTiles,
    0,
    0,
  );
  const rabbit = marshEdge.populations.find(({ species }) => species === "marsh-rabbit");
  if (rabbit === undefined) throw new Error("Core ecology marsh-edge rabbit analysis is missing");
  const frogSupport = ratioFixed(
    frogBase.populationUnits,
    SPECIES_RULES["southern-leopard-frog"].maximumPopulation,
  );
  const rabbitSupport = ratioFixed(
    rabbit.populationUnits,
    SPECIES_RULES["marsh-rabbit"].maximumPopulation,
  );
  const smallPreySupport = clampFixed(
    multiplyFixed(frogSupport, 620_000)
      + multiplyFixed(rabbitSupport, 500_000),
  );
  const fishCrow = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "fish-crow",
    addressedTiles,
    0,
    0,
  );
  const harrier = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "northern-harrier",
    addressedTiles,
    smallPreySupport,
    0,
  );
  const harrierPressure = multiplyFixed(
    ratioFixed(
      harrier.populationUnits,
      SPECIES_RULES["northern-harrier"].maximumPopulation,
    ),
    180_000,
  );
  const frog = applyPredatorPressure(frogBase, harrierPressure);

  const individualOccupiedTiles = new Set<number>();
  for (const population of marshEdge.populations) {
    if (population.representation !== "individual-representatives") continue;
    for (const allocation of population.allocations) {
      individualOccupiedTiles.add(allocation.tileIndex);
    }
  }
  const allocatedFishCrow = allocatePopulation(
    fishCrow,
    originRegion,
    individualOccupiedTiles,
  );
  const frogOccupiedTiles = new Set<number>();
  const allocatedFrog = allocatePopulation(frog, originRegion, frogOccupiedTiles);
  const allocatedHarrier = allocatePopulation(
    harrier,
    originRegion,
    individualOccupiedTiles,
    [...rabbit.allocations, ...allocatedFrog.allocations],
  );
  const extension = [allocatedFishCrow, allocatedHarrier, allocatedFrog].map(
    (population) => Object.freeze({
      ...population,
      representation: SPECIES_RULES[population.species].representation,
      activitySignal: activitySignalFor(population),
    }),
  );
  const populations: CoreEcologyRainChorusHabitatPopulationAnalysis[] = [
    ...marshEdge.populations,
    ...extension,
  ];
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS) {
    throw new Error("Core ecology rain-chorus habitat allocation budget diverged");
  }

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION,
    originRegion: marshEdge.originRegion,
    regionId: marshEdge.regionId,
    terrainHash: marshEdge.terrainHash,
    selection: marshEdge.selection,
    evaluatedTiles: marshEdge.evaluatedTiles,
    speciesEvaluations:
      marshEdge.evaluatedTiles * CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

/**
 * Pure tidal-table extension. The baseline remains independent of the current
 * tide so save/load and visiting the same signed region at another hour cannot
 * reroll population identity. A separate live-tide owner decides which of
 * these stable anchors are active or pressured.
 */
export function deriveCoreEcologyTidalTableHabitatAssemblage(
  input: DeriveCoreEcologyHabitatAssemblageInput,
): CoreEcologyTidalTableHabitatAssemblage {
  const context = prepareCoreEcologyHabitatContext(input, "tidal-table");
  return deriveCoreEcologyTidalTableFromPrepared(input.rootSeed, context);
}

function deriveCoreEcologyTidalTableFromPrepared(
  rootSeed: RootSeed,
  context: PreparedCoreEcologyHabitatContext,
): CoreEcologyTidalTableHabitatAssemblage {
  const rainChorus = deriveCoreEcologyRainChorusFromPrepared(rootSeed, context);
  const { addressedTiles, originRegion } = context;

  const silversideBase = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "atlantic-silverside",
    addressedTiles,
    0,
    0,
  );
  const fiddlerBase = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "atlantic-marsh-fiddler-crab",
    addressedTiles,
    0,
    0,
  );
  const silversideSupport = ratioFixed(
    silversideBase.populationUnits,
    SPECIES_RULES["atlantic-silverside"].maximumPopulation,
  );
  const fiddlerSupport = ratioFixed(
    fiddlerBase.populationUnits,
    SPECIES_RULES["atlantic-marsh-fiddler-crab"].maximumPopulation,
  );
  const aquaticSupport = clampFixed(
    multiplyFixed(silversideSupport, 620_000)
      + multiplyFixed(fiddlerSupport, 520_000),
  );
  const egret = analyzeEnvironmentalCapacity(
    rootSeed,
    originRegion,
    "snowy-egret",
    addressedTiles,
    aquaticSupport,
    0,
  );
  const egretPressure = multiplyFixed(
    ratioFixed(egret.populationUnits, SPECIES_RULES["snowy-egret"].maximumPopulation),
    140_000,
  );
  const silverside = applyPredatorPressure(silversideBase, egretPressure);
  const fiddler = applyPredatorPressure(fiddlerBase, egretPressure);

  const individualOccupiedTiles = new Set<number>();
  for (const population of rainChorus.populations) {
    if (population.representation !== "individual-representatives") continue;
    for (const allocation of population.allocations) {
      individualOccupiedTiles.add(allocation.tileIndex);
    }
  }
  const allocatedSilverside = allocatePopulation(
    silverside,
    originRegion,
    new Set<number>(),
  );
  const allocatedFiddler = allocatePopulation(
    fiddler,
    originRegion,
    new Set<number>(),
  );
  const allocatedEgret = allocatePopulation(
    egret,
    originRegion,
    individualOccupiedTiles,
    [...allocatedSilverside.allocations, ...allocatedFiddler.allocations],
  );
  const extension = [allocatedSilverside, allocatedFiddler, allocatedEgret].map(
    (population) => Object.freeze({
      ...population,
      representation: SPECIES_RULES[population.species].representation,
      activitySignal: activitySignalFor(population),
    }),
  );
  const populations: CoreEcologyTidalTableHabitatPopulationAnalysis[] = [
    ...rainChorus.populations,
    ...extension,
  ];
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS) {
    throw new Error("Core ecology tidal-table habitat allocation budget diverged");
  }
  const tidalAnchors = createTidalTableHabitatAnchors(
    originRegion,
    addressedTiles,
    allocatedSilverside,
    allocatedFiddler,
    egret,
  );
  if (tidalAnchors.length > CORE_ECOLOGY_TIDAL_TABLE_MAX_ANCHOR_RECORDS) {
    throw new Error("Core ecology tidal-table anchor budget diverged");
  }

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION,
    originRegion: rainChorus.originRegion,
    regionId: rainChorus.regionId,
    terrainHash: rainChorus.terrainHash,
    selection: rainChorus.selection,
    evaluatedTiles: rainChorus.evaluatedTiles,
    speciesEvaluations:
      rainChorus.evaluatedTiles * CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
    tidalAnchors,
  });
}

/**
 * Pure waterfowl extension. Habitat-v5 remains the immutable prefix; one
 * addressable duck may be added only when the same selected patch contains a
 * persistent water route, a second tide-sensitive feeding surface, and a dry
 * refuge. Current tide is deliberately absent from identity generation.
 */
export function deriveCoreEcologyWaterfowlHabitatAssemblage(
  input: DeriveCoreEcologyHabitatAssemblageInput,
): CoreEcologyWaterfowlHabitatAssemblage {
  const context = prepareCoreEcologyHabitatContext(input, "waterfowl");
  const tidalTable = deriveCoreEcologyTidalTableFromPrepared(input.rootSeed, context);
  const { addressedTiles, originRegion } = context;
  const silverside = tidalTable.populations.find(({ species }) => (
    species === "atlantic-silverside"
  ));
  const fiddler = tidalTable.populations.find(({ species }) => (
    species === "atlantic-marsh-fiddler-crab"
  ));
  if (silverside === undefined || fiddler === undefined) {
    throw new Error("Core ecology tidal-table aquatic support is missing");
  }
  const aquaticSupport = clampFixed(
    multiplyFixed(
      ratioFixed(silverside.populationUnits, SPECIES_RULES["atlantic-silverside"].maximumPopulation),
      560_000,
    ) + multiplyFixed(
      ratioFixed(fiddler.populationUnits, SPECIES_RULES["atlantic-marsh-fiddler-crab"].maximumPopulation),
      440_000,
    ),
  );
  const duck = analyzeEnvironmentalCapacity(
    input.rootSeed,
    originRegion,
    "american-black-duck",
    addressedTiles,
    aquaticSupport,
    0,
  );
  const individualOccupiedTiles = new Set<number>();
  for (const population of tidalTable.populations) {
    if (population.representation !== "individual-representatives") continue;
    for (const allocation of population.allocations) {
      individualOccupiedTiles.add(allocation.tileIndex);
    }
  }
  const allocatedDuck = allocatePopulation(
    duck,
    originRegion,
    individualOccupiedTiles,
    [
      ...silverside.allocations,
      ...fiddler.allocations,
    ],
  );
  const duckPopulation = Object.freeze({
    ...allocatedDuck,
    representation: SPECIES_RULES["american-black-duck"].representation,
    activitySignal: activitySignalFor(allocatedDuck),
  });
  const populations: CoreEcologyWaterfowlHabitatPopulationAnalysis[] = [
    ...tidalTable.populations,
    duckPopulation,
  ];
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS) {
    throw new Error("Core ecology waterfowl habitat allocation budget diverged");
  }
  const duckAnchors = createAmericanBlackDuckHabitatAnchors(
    originRegion,
    addressedTiles,
    duck,
  );
  const tidalAnchors = Object.freeze([
    ...tidalTable.tidalAnchors,
    ...duckAnchors,
  ]);
  if (tidalAnchors.length > CORE_ECOLOGY_WATERFOWL_MAX_ANCHOR_RECORDS) {
    throw new Error("Core ecology waterfowl anchor budget diverged");
  }
  return Object.freeze({
    generationVersion: CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION,
    originRegion: tidalTable.originRegion,
    regionId: tidalTable.regionId,
    terrainHash: tidalTable.terrainHash,
    selection: tidalTable.selection,
    evaluatedTiles: tidalTable.evaluatedTiles,
    speciesEvaluations:
      tidalTable.evaluatedTiles * CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
    tidalAnchors,
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

export function canonicalizeCoreEcologyMarshEdgeHabitatAssemblage(
  value: unknown,
): CoreEcologyMarshEdgeHabitatAssemblage | null {
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
    value.generationVersion !== CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION
    || !isRegionCoord(value.originRegion)
    || typeof value.regionId !== "string"
    || !regionIdMatches(value.regionId, value.originRegion)
    || typeof value.terrainHash !== "string"
    || !/^[0-9a-f]{32}$/u.test(value.terrainHash)
    || value.maximumAllocationBudget !== CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS
    || !Array.isArray(value.populations)
    || value.populations.length !== CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length
  ) return null;
  const originRegion = createRegionCoord(value.originRegion.x, value.originRegion.y);
  const selection = canonicalizeSelection(value.selection, originRegion);
  if (selection === null) return null;
  const evaluatedTiles = selectedTileCount(selection);
  const speciesEvaluations =
    evaluatedTiles * CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length;
  if (
    value.evaluatedTiles !== evaluatedTiles
    || value.speciesEvaluations !== speciesEvaluations
    || value.evaluatedTiles > CORE_ECOLOGY_HABITAT_TILE_BUDGET
    || value.speciesEvaluations > CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES_EVALUATION_BUDGET
  ) return null;

  const individualOccupiedTiles = new Set<number>();
  const aggregateOccupiedTiles = new Set<number>();
  const populations: CoreEcologyMarshEdgeHabitatPopulationAnalysis[] = [];
  for (let index = 0; index < CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length; index += 1) {
    const species = CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES[index];
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
  if (allocationCount > CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS) return null;

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION,
    originRegion,
    regionId: value.regionId,
    terrainHash: value.terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

export function canonicalizeCoreEcologyRainChorusHabitatAssemblage(
  value: unknown,
): CoreEcologyRainChorusHabitatAssemblage | null {
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
    value.generationVersion !== CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION
    || !isRegionCoord(value.originRegion)
    || typeof value.regionId !== "string"
    || !regionIdMatches(value.regionId, value.originRegion)
    || typeof value.terrainHash !== "string"
    || !/^[0-9a-f]{32}$/u.test(value.terrainHash)
    || value.maximumAllocationBudget !== CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS
    || !Array.isArray(value.populations)
    || value.populations.length !== CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.length
  ) return null;
  const originRegion = createRegionCoord(value.originRegion.x, value.originRegion.y);
  const selection = canonicalizeSelection(value.selection, originRegion);
  if (selection === null) return null;
  const evaluatedTiles = selectedTileCount(selection);
  const speciesEvaluations =
    evaluatedTiles * CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.length;
  if (
    value.evaluatedTiles !== evaluatedTiles
    || value.speciesEvaluations !== speciesEvaluations
    || value.evaluatedTiles > CORE_ECOLOGY_HABITAT_TILE_BUDGET
    || value.speciesEvaluations > CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES_EVALUATION_BUDGET
  ) return null;

  const individualOccupiedTiles = new Set<number>();
  const aggregateOccupiedTiles = new Map<
    Extract<CoreEcologyRainChorusHabitatSpecies, "brown-rat" | "southern-leopard-frog">,
    Set<number>
  >([
    ["brown-rat", new Set<number>()],
    ["southern-leopard-frog", new Set<number>()],
  ]);
  const populations: CoreEcologyRainChorusHabitatPopulationAnalysis[] = [];
  for (let index = 0; index < CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.length; index += 1) {
    const species = CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES[index];
    if (species === undefined) return null;
    const occupied = species === "brown-rat" || species === "southern-leopard-frog"
      ? aggregateOccupiedTiles.get(species)
      : individualOccupiedTiles;
    if (occupied === undefined) return null;
    const population = canonicalizeHarborEdgePopulationAnalysis(
      value.populations[index],
      species,
      originRegion,
      selection,
      evaluatedTiles,
      occupied,
    );
    if (population === null) return null;
    populations.push(population);
  }
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS) return null;

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION,
    originRegion,
    regionId: value.regionId,
    terrainHash: value.terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
  });
}

export function canonicalizeCoreEcologyTidalTableHabitatAssemblage(
  value: unknown,
): CoreEcologyTidalTableHabitatAssemblage | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "evaluatedTiles",
    "generationVersion",
    "maximumAllocationBudget",
    "originRegion",
    "populations",
    "regionId",
    "selection",
    "speciesEvaluations",
    "tidalAnchors",
    "terrainHash",
  ])) return null;
  if (
    value.generationVersion !== CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION
    || !isRegionCoord(value.originRegion)
    || typeof value.regionId !== "string"
    || !regionIdMatches(value.regionId, value.originRegion)
    || typeof value.terrainHash !== "string"
    || !/^[0-9a-f]{32}$/u.test(value.terrainHash)
    || value.maximumAllocationBudget !== CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS
    || !Array.isArray(value.populations)
    || value.populations.length !== CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length
    || !Array.isArray(value.tidalAnchors)
    || value.tidalAnchors.length > CORE_ECOLOGY_TIDAL_TABLE_MAX_ANCHOR_RECORDS
  ) return null;
  const originRegion = createRegionCoord(value.originRegion.x, value.originRegion.y);
  const selection = canonicalizeSelection(value.selection, originRegion);
  if (selection === null) return null;
  const evaluatedTiles = selectedTileCount(selection);
  const speciesEvaluations =
    evaluatedTiles * CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length;
  if (
    value.evaluatedTiles !== evaluatedTiles
    || value.speciesEvaluations !== speciesEvaluations
    || value.evaluatedTiles > CORE_ECOLOGY_HABITAT_TILE_BUDGET
    || value.speciesEvaluations > CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES_EVALUATION_BUDGET
  ) return null;

  const individualOccupiedTiles = new Set<number>();
  const aggregateOccupiedTiles = new Map<
    Extract<
      CoreEcologyTidalTableHabitatSpecies,
      | "brown-rat"
      | "southern-leopard-frog"
      | "atlantic-silverside"
      | "atlantic-marsh-fiddler-crab"
    >,
    Set<number>
  >([
    ["brown-rat", new Set<number>()],
    ["southern-leopard-frog", new Set<number>()],
    ["atlantic-silverside", new Set<number>()],
    ["atlantic-marsh-fiddler-crab", new Set<number>()],
  ]);
  const populations: CoreEcologyTidalTableHabitatPopulationAnalysis[] = [];
  for (let index = 0; index < CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length; index += 1) {
    const species = CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES[index];
    if (species === undefined) return null;
    const occupied = aggregateOccupiedTiles.get(species as Extract<
      CoreEcologyTidalTableHabitatSpecies,
      "brown-rat" | "southern-leopard-frog" | "atlantic-silverside" | "atlantic-marsh-fiddler-crab"
    >) ?? individualOccupiedTiles;
    const population = canonicalizeHarborEdgePopulationAnalysis(
      value.populations[index],
      species,
      originRegion,
      selection,
      evaluatedTiles,
      occupied,
    );
    if (population === null) return null;
    populations.push(population);
  }
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS) return null;
  const tidalAnchors = canonicalizeTidalTableHabitatAnchors(
    value.tidalAnchors,
    originRegion,
    selection,
    populations,
  );
  if (tidalAnchors === null) return null;

  return Object.freeze({
    generationVersion: CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION,
    originRegion,
    regionId: value.regionId,
    terrainHash: value.terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
    tidalAnchors,
  });
}

export function canonicalizeCoreEcologyWaterfowlHabitatAssemblage(
  value: unknown,
): CoreEcologyWaterfowlHabitatAssemblage | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "evaluatedTiles",
    "generationVersion",
    "maximumAllocationBudget",
    "originRegion",
    "populations",
    "regionId",
    "selection",
    "speciesEvaluations",
    "tidalAnchors",
    "terrainHash",
  ])) return null;
  if (
    value.generationVersion !== CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION
    || !isRegionCoord(value.originRegion)
    || typeof value.regionId !== "string"
    || !regionIdMatches(value.regionId, value.originRegion)
    || typeof value.terrainHash !== "string"
    || !/^[0-9a-f]{32}$/u.test(value.terrainHash)
    || value.maximumAllocationBudget !== CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS
    || !Array.isArray(value.populations)
    || value.populations.length !== CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES.length
    || !Array.isArray(value.tidalAnchors)
    || value.tidalAnchors.length > CORE_ECOLOGY_WATERFOWL_MAX_ANCHOR_RECORDS
  ) return null;
  const originRegion = createRegionCoord(value.originRegion.x, value.originRegion.y);
  const selection = canonicalizeSelection(value.selection, originRegion);
  if (selection === null) return null;
  const evaluatedTiles = selectedTileCount(selection);
  const speciesEvaluations = evaluatedTiles * CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES.length;
  if (
    value.evaluatedTiles !== evaluatedTiles
    || value.speciesEvaluations !== speciesEvaluations
    || value.evaluatedTiles > CORE_ECOLOGY_HABITAT_TILE_BUDGET
    || value.speciesEvaluations > CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES_EVALUATION_BUDGET
  ) return null;

  const v5PopulationValues = value.populations.slice(
    0,
    CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length,
  );
  const v5AnchorCount = expectedTidalTableAnchorCount(v5PopulationValues);
  if (v5AnchorCount === null) return null;
  const tidalTable = canonicalizeCoreEcologyTidalTableHabitatAssemblage({
    generationVersion: CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION,
    originRegion,
    regionId: value.regionId,
    terrainHash: value.terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations: evaluatedTiles * CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS,
    populations: v5PopulationValues,
    tidalAnchors: value.tidalAnchors.slice(0, v5AnchorCount),
  });
  if (tidalTable === null) return null;
  const occupied = new Set<number>();
  for (const population of tidalTable.populations) {
    if (population.representation !== "individual-representatives") continue;
    for (const allocation of population.allocations) occupied.add(allocation.tileIndex);
  }
  const duck = canonicalizeHarborEdgePopulationAnalysis(
    value.populations[CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length],
    "american-black-duck",
    originRegion,
    selection,
    evaluatedTiles,
    occupied,
  );
  if (duck === null) return null;
  const duckAnchors = canonicalizeAmericanBlackDuckHabitatAnchors(
    value.tidalAnchors.slice(v5AnchorCount),
    originRegion,
    selection,
    duck,
  );
  if (duckAnchors === null) return null;
  const populations: CoreEcologyWaterfowlHabitatPopulationAnalysis[] = [
    ...tidalTable.populations,
    duck,
  ];
  const allocationCount = populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
  if (allocationCount > CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS) return null;
  return Object.freeze({
    generationVersion: CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION,
    originRegion,
    regionId: value.regionId,
    terrainHash: value.terrainHash,
    selection,
    evaluatedTiles,
    speciesEvaluations,
    maximumAllocationBudget: CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS,
    populations: Object.freeze(populations),
    tidalAnchors: Object.freeze([...tidalTable.tidalAnchors, ...duckAnchors]),
  });
}

function expectedTidalTableAnchorCount(
  populations: readonly unknown[],
): number | null {
  const silverside = populations[CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.indexOf(
    "atlantic-silverside",
  )];
  const fiddler = populations[CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.indexOf(
    "atlantic-marsh-fiddler-crab",
  )];
  const egret = populations[CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.indexOf("snowy-egret")];
  if (
    !plainRecord(silverside)
    || !Array.isArray(silverside.allocations)
    || !plainRecord(fiddler)
    || !Array.isArray(fiddler.allocations)
    || !plainRecord(egret)
    || !nonnegativeSafeInteger(egret.populationUnits)
  ) return null;
  return silverside.allocations.length
    + fiddler.allocations.length
    + (egret.populationUnits > 0
      ? CORE_ECOLOGY_SNOWY_EGRET_WADING_ANCHORS + CORE_ECOLOGY_SNOWY_EGRET_REFUGE_ANCHORS
      : 0);
}

function canonicalizeTidalTableHabitatAnchors(
  value: readonly unknown[],
  originRegion: RegionCoord,
  selection: CoreEcologyHabitatSelection,
  populations: readonly CoreEcologyTidalTableHabitatPopulationAnalysis[],
): readonly CoreEcologyTidalTableHabitatAnchor[] | null {
  const silverside = populations.find(({ species }) => species === "atlantic-silverside");
  const fiddler = populations.find(({ species }) => species === "atlantic-marsh-fiddler-crab");
  const egret = populations.find(({ species }) => species === "snowy-egret");
  if (silverside === undefined || fiddler === undefined || egret === undefined) return null;
  const expected = [
    ...silverside.allocations.map((allocation) => ({
      species: "atlantic-silverside" as const,
      purpose: "population" as const,
      anchorOrdinal: allocation.allocationOrdinal,
      allocation,
    })),
    ...fiddler.allocations.map((allocation) => ({
      species: "atlantic-marsh-fiddler-crab" as const,
      purpose: "population" as const,
      anchorOrdinal: allocation.allocationOrdinal,
      allocation,
    })),
    ...(egret.populationUnits === 0
      ? []
      : [
          ...Array.from(
            { length: CORE_ECOLOGY_SNOWY_EGRET_WADING_ANCHORS },
            (_, anchorOrdinal) => ({
              species: "snowy-egret" as const,
              purpose: "wading" as const,
              anchorOrdinal,
              allocation: null,
            }),
          ),
          ...Array.from(
            { length: CORE_ECOLOGY_SNOWY_EGRET_REFUGE_ANCHORS },
            (_, anchorOrdinal) => ({
              species: "snowy-egret" as const,
              purpose: "refuge" as const,
              anchorOrdinal,
              allocation: null,
            }),
          ),
        ]),
  ];
  if (value.length !== expected.length) return null;

  const anchors: CoreEcologyTidalTableHabitatAnchor[] = [];
  const egretTiles = new Set<number>();
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const identity = expected[index];
    if (
      identity === undefined
      || !plainRecord(raw)
      || !exactKeys(raw, [
        "anchorOrdinal",
        "biome",
        "elevation",
        "globalTile",
        "position",
        "purpose",
        "species",
        "terrain",
        "tileIndex",
      ])
      || raw.species !== identity.species
      || raw.purpose !== identity.purpose
      || raw.anchorOrdinal !== identity.anchorOrdinal
      || !nonnegativeSafeInteger(raw.tileIndex)
      || raw.tileIndex >= CORE_ECOLOGY_HABITAT_TILE_BUDGET
      || !fixedInteger(raw.elevation)
      || typeof raw.terrain !== "string"
      || terrainKindForElevation(raw.elevation) !== raw.terrain
      || !validTidalAnchorTerrain(identity.species, identity.purpose, raw.terrain)
      || typeof raw.biome !== "string"
      || !(BIOME_IDS as readonly string[]).includes(raw.biome)
      || !plainRecord(raw.globalTile)
      || !exactKeys(raw.globalTile, ["x", "y"])
      || !canonicalSafeInteger(raw.globalTile.x)
      || !canonicalSafeInteger(raw.globalTile.y)
      || !isWorldPosition(raw.position)
    ) return null;
    const tileX = raw.tileIndex % WORLD_WIDTH;
    const tileY = Math.trunc(raw.tileIndex / WORLD_WIDTH);
    const localX = tileX * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const localY = tileY * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const globalTile = regionLocalToGlobalTile(originRegion, tileX, tileY);
    if (
      raw.position.region.x !== originRegion.x
      || raw.position.region.y !== originRegion.y
      || raw.position.localX !== localX
      || raw.position.localY !== localY
      || raw.globalTile.x !== globalTile.x
      || raw.globalTile.y !== globalTile.y
      || !tileInsideSelection(raw.tileIndex, selection)
    ) return null;
    if (identity.allocation !== null && (
      raw.tileIndex !== identity.allocation.tileIndex
      || raw.position.localX !== identity.allocation.position.localX
      || raw.position.localY !== identity.allocation.position.localY
      || raw.terrain !== identity.allocation.terrain
      || raw.biome !== identity.allocation.biome
    )) return null;
    if (identity.species === "snowy-egret") {
      if (egretTiles.has(raw.tileIndex)) return null;
      egretTiles.add(raw.tileIndex);
      if (
        identity.purpose === "wading"
        && !isPotentialSnowyEgretWadingElevation(raw.elevation)
      ) return null;
      if (identity.purpose === "refuge" && raw.elevation < MAX_TIDE_LEVEL) return null;
    }
    anchors.push(Object.freeze({
      species: identity.species,
      purpose: identity.purpose,
      anchorOrdinal: identity.anchorOrdinal,
      tileIndex: raw.tileIndex,
      globalTile: Object.freeze({ x: raw.globalTile.x, y: raw.globalTile.y }),
      position: createWorldPosition(originRegion, localX, localY),
      elevation: raw.elevation,
      terrain: raw.terrain as TerrainKind,
      biome: raw.biome as BiomeId,
    }));
  }
  const lowTideRefuge = anchors.some((anchor) => (
    anchor.species === "atlantic-silverside"
    && anchor.purpose === "population"
    && MIN_TIDE_LEVEL - anchor.elevation >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
  ));
  if ((silverside.populationUnits > 0) !== lowTideRefuge) return null;
  return Object.freeze(anchors);
}

function canonicalizeAmericanBlackDuckHabitatAnchors(
  value: readonly unknown[],
  originRegion: RegionCoord,
  selection: CoreEcologyHabitatSelection,
  duck: VersionedHabitatPopulationAnalysis<"american-black-duck">,
): readonly CoreEcologyTidalTableHabitatAnchor[] | null {
  const expected = duck.populationUnits === 0
    ? []
    : [
        ...Array.from(
          { length: CORE_ECOLOGY_AMERICAN_BLACK_DUCK_DABBLING_ANCHORS },
          (_, anchorOrdinal) => ({ purpose: "dabbling" as const, anchorOrdinal }),
        ),
        ...Array.from(
          { length: CORE_ECOLOGY_AMERICAN_BLACK_DUCK_REFUGE_ANCHORS },
          (_, anchorOrdinal) => ({ purpose: "refuge" as const, anchorOrdinal }),
        ),
      ];
  if (value.length !== expected.length) return null;
  const anchors: CoreEcologyTidalTableHabitatAnchor[] = [];
  const seenTiles = new Set<number>();
  for (let index = 0; index < expected.length; index += 1) {
    const identity = expected[index];
    const raw = value[index];
    if (
      identity === undefined
      || !plainRecord(raw)
      || !exactKeys(raw, [
        "anchorOrdinal",
        "biome",
        "elevation",
        "globalTile",
        "position",
        "purpose",
        "species",
        "terrain",
        "tileIndex",
      ])
      || raw.species !== "american-black-duck"
      || raw.purpose !== identity.purpose
      || raw.anchorOrdinal !== identity.anchorOrdinal
      || !nonnegativeSafeInteger(raw.tileIndex)
      || raw.tileIndex >= CORE_ECOLOGY_HABITAT_TILE_BUDGET
      || seenTiles.has(raw.tileIndex)
      || !fixedInteger(raw.elevation)
      || typeof raw.terrain !== "string"
      || terrainKindForElevation(raw.elevation) !== raw.terrain
      || !validTidalAnchorTerrain("american-black-duck", identity.purpose, raw.terrain)
      || typeof raw.biome !== "string"
      || !(BIOME_IDS as readonly string[]).includes(raw.biome)
      || !plainRecord(raw.globalTile)
      || !exactKeys(raw.globalTile, ["x", "y"])
      || !canonicalSafeInteger(raw.globalTile.x)
      || !canonicalSafeInteger(raw.globalTile.y)
      || !isWorldPosition(raw.position)
      || !tileInsideSelection(raw.tileIndex, selection)
    ) return null;
    const tileX = raw.tileIndex % WORLD_WIDTH;
    const tileY = Math.trunc(raw.tileIndex / WORLD_WIDTH);
    const localX = tileX * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const localY = tileY * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const globalTile = regionLocalToGlobalTile(originRegion, tileX, tileY);
    if (
      raw.position.region.x !== originRegion.x
      || raw.position.region.y !== originRegion.y
      || raw.position.localX !== localX
      || raw.position.localY !== localY
      || raw.globalTile.x !== globalTile.x
      || raw.globalTile.y !== globalTile.y
      || (identity.purpose === "dabbling" && (
        MAX_TIDE_LEVEL - raw.elevation
          < CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
        || identity.anchorOrdinal === 0
          && MIN_TIDE_LEVEL - raw.elevation
            < CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
      ))
      || identity.purpose === "refuge" && raw.elevation < MAX_TIDE_LEVEL
    ) return null;
    seenTiles.add(raw.tileIndex);
    anchors.push(Object.freeze({
      species: "american-black-duck",
      purpose: identity.purpose,
      anchorOrdinal: identity.anchorOrdinal,
      tileIndex: raw.tileIndex,
      globalTile: Object.freeze({ x: raw.globalTile.x, y: raw.globalTile.y }),
      position: createWorldPosition(originRegion, localX, localY),
      elevation: raw.elevation,
      terrain: raw.terrain as TerrainKind,
      biome: raw.biome as BiomeId,
    }));
  }
  return Object.freeze(anchors);
}

function tileInsideSelection(
  tileIndex: number,
  selection: CoreEcologyHabitatSelection,
): boolean {
  if (selection.focusPosition === null || selection.radiusTiles === null) return true;
  if (selection.excludedTileIndices.includes(tileIndex)) return false;
  const tileX = tileIndex % WORLD_WIDTH;
  const tileY = Math.trunc(tileIndex / WORLD_WIDTH);
  const focusX = Math.trunc(selection.focusPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
  const focusY = Math.trunc(selection.focusPosition.localY / WORLD_POSITION_UNITS_PER_TILE);
  return Math.abs(tileX - focusX) + Math.abs(tileY - focusY) <= selection.radiusTiles;
}

function terrainKindForElevation(elevation: number): TerrainKind {
  if (elevation < 180_000) return "deep-water";
  if (elevation < 330_000) return "tidal-flat";
  if (elevation < 470_000) return "marsh";
  if (elevation < 760_000) return "meadow";
  return "ridge";
}

type VersionedHabitatPopulationAnalysis<
  Species extends CoreEcologyWaterfowlHabitatSpecies,
> = Omit<CoreEcologyRainChorusHabitatPopulationAnalysis, "species"> & {
  readonly species: Species;
};

function canonicalizeHarborEdgePopulationAnalysis<
  Species extends CoreEcologyWaterfowlHabitatSpecies,
>(
  value: unknown,
  expectedSpecies: Species,
  originRegion: RegionCoord,
  selection: CoreEcologyHabitatSelection,
  evaluatedTiles: number,
  occupiedTileIndices: Set<number>,
): VersionedHabitatPopulationAnalysis<Species> | null {
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
  const allocated: AllocatedPopulationAnalysis<Species> = {
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
  species: CoreEcologyWaterfowlHabitatSpecies,
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

function analyzeEnvironmentalCapacity<Species extends CoreEcologyWaterfowlHabitatSpecies>(
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
  if (species === "marsh-fox" && preySupport < 120_000) habitatCapacity = 0;
  if (species === "northern-harrier" && preySupport < 150_000) habitatCapacity = 0;
  if (
    species === "snowy-egret"
    && (
      preySupport < 120_000
      || !hasSnowyEgretRefuge(addressedTiles)
      || suitable.filter(({ addressed }) => (
        isPotentialSnowyEgretWadingElevation(addressed.tile.elevation)
      )).length < CORE_ECOLOGY_SNOWY_EGRET_WADING_ANCHORS
    )
  ) habitatCapacity = 0;
  if (
    species === "american-black-duck"
    && (
      preySupport < 80_000
      || !hasAmericanBlackDuckRefuge(addressedTiles)
      || suitable.filter(({ addressed }) => (
        MAX_TIDE_LEVEL - addressed.tile.elevation
          >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
      )).length < CORE_ECOLOGY_AMERICAN_BLACK_DUCK_DABBLING_ANCHORS
      || !suitable.some(({ addressed }) => (
        MIN_TIDE_LEVEL - addressed.tile.elevation
          >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
      ))
    )
  ) habitatCapacity = 0;
  // A school may spread onto tidal flats at flood, but it cannot persist in a
  // patch without one habitat-authenticated refuge that remains wet at the
  // lowest tide. This prevents baseline fish identity from being minted on
  // flats that become wholly dry before the first live-tide projection.
  if (
    species === "atlantic-silverside"
    && !suitable.some(({ addressed }) => (
      MIN_TIDE_LEVEL - addressed.tile.elevation
        >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
    ))
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
    rule.minimumOccupancyTarget,
    rule.maximumOccupancyTarget,
  );
  const populationUnits = viable
    ? Math.min(
        habitatCapacity,
        Math.max(
          rule.minimumPopulationWhenViable,
          Math.trunc((habitatCapacity * occupancyTarget + 500_000) / FIXED_POINT),
        ),
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

/**
 * Predator pressure changes only population trend metadata. Reusing the
 * already-derived site/capacity result keeps the exact habitat contract while
 * avoiding a second full species pass for deer, rats, and rabbits.
 */
function applyPredatorPressure<Species extends CoreEcologyWaterfowlHabitatSpecies>(
  analysis: UnallocatedPopulationAnalysis<Species>,
  predatorPressure: number,
): UnallocatedPopulationAnalysis<Species> {
  if (analysis.capacityInputs.predatorPressure === predatorPressure) return analysis;
  const averageHabitatScore = analysis.capacityInputs.suitableTiles === 0
    ? 0
    : Math.trunc(
        analysis.capacityInputs.weightedHabitatArea
          / analysis.capacityInputs.suitableTiles,
      );
  const equilibriumPressure = clampFixed(
    320_000
      + multiplyFixed(averageHabitatScore, 610_000)
      - predatorPressure,
  );
  const trendSignal = equilibriumPressure - analysis.populationPressure;
  const trend: CoreEcologyPopulationTrend = trendSignal >= 80_000
    ? "growing"
    : trendSignal <= -80_000
    ? "declining"
    : "stable";
  return Object.freeze({
    ...analysis,
    capacityInputs: Object.freeze({
      ...analysis.capacityInputs,
      predatorPressure,
    }),
    trend,
    trendSignal,
  });
}

function hasSnowyEgretRefuge(
  addressedTiles: readonly AddressedHabitatTile[],
): boolean {
  return addressedTiles.some(({ tile, wetDistance }) => (
    tile.elevation >= MAX_TIDE_LEVEL
    && (tile.terrain === "meadow" || tile.terrain === "ridge")
    && wetDistance <= 12
  ));
}

function hasAmericanBlackDuckRefuge(
  addressedTiles: readonly AddressedHabitatTile[],
): boolean {
  return addressedTiles.some(({ tile, openWaterDistance }) => (
    tile.elevation >= MAX_TIDE_LEVEL
    && (tile.terrain === "meadow" || tile.terrain === "ridge")
    && openWaterDistance <= 10
  ));
}

function allocatePopulation<Species extends CoreEcologyWaterfowlHabitatSpecies>(
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
  if (analysis.species === "atlantic-silverside" && allocationCount > 0) {
    const lowTideRefuge = rankedSites.find(({ addressed }) => (
      MIN_TIDE_LEVEL - addressed.tile.elevation
        >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
      && !occupiedTileIndices.has(addressed.tile.index)
    ));
    if (lowTideRefuge === undefined) {
      throw new Error("Core ecology silverside population lacks its low-tide refuge");
    }
    selected.push(lowTideRefuge);
    if (allocationCount > 1) {
      const tidalEdge = rankedSites.find(({ addressed }) => (
        MIN_TIDE_LEVEL - addressed.tile.elevation
          < CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
        && MAX_TIDE_LEVEL - addressed.tile.elevation
          >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
        && !occupiedTileIndices.has(addressed.tile.index)
        && addressed.tile.index !== lowTideRefuge.addressed.tile.index
        && manhattanTiles(addressed.tile, lowTideRefuge.addressed.tile)
          >= rule.minimumAllocationSeparation
      ));
      if (tidalEdge !== undefined) selected.push(tidalEdge);
    }
  }
  for (const site of rankedSites) {
    if (selected.length >= allocationCount) break;
    if (occupiedTileIndices.has(site.addressed.tile.index)) continue;
    if (selected.some((other) => other.addressed.tile.index === site.addressed.tile.index)) {
      continue;
    }
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

const EGRET_WADING_TARGET_ELEVATIONS = Object.freeze([
  MIN_TIDE_LEVEL - 35_000,
  MIN_TIDE_LEVEL + 75_000,
  MIN_TIDE_LEVEL + 185_000,
  MAX_TIDE_LEVEL - 35_000,
] as const);
const BLACK_DUCK_DABBLING_TARGET_ELEVATIONS = Object.freeze([
  MIN_TIDE_LEVEL - 70_000,
  MAX_TIDE_LEVEL - 45_000,
] as const);

function createTidalTableHabitatAnchors(
  originRegion: RegionCoord,
  addressedTiles: readonly AddressedHabitatTile[],
  silverside: AllocatedPopulationAnalysis<"atlantic-silverside">,
  fiddler: AllocatedPopulationAnalysis<"atlantic-marsh-fiddler-crab">,
  egret: UnallocatedPopulationAnalysis<"snowy-egret">,
): readonly CoreEcologyTidalTableHabitatAnchor[] {
  const addressedByTile = new Map(addressedTiles.map((addressed) => (
    [addressed.tile.index, addressed] as const
  )));
  const anchors: CoreEcologyTidalTableHabitatAnchor[] = [];
  for (const population of [silverside, fiddler] as const) {
    for (const allocation of population.allocations) {
      const addressed = addressedByTile.get(allocation.tileIndex);
      if (addressed === undefined) {
        throw new Error(`Core ecology ${population.species} tidal anchor lost terrain custody`);
      }
      anchors.push(tidalAnchorFromSite(
        population.species,
        "population",
        allocation.allocationOrdinal,
        addressed,
        originRegion,
      ));
    }
  }

  if (egret.populationUnits > 0) {
    const refuge = addressedTiles.filter(({ tile, wetDistance }) => (
      tile.elevation >= MAX_TIDE_LEVEL
      && (tile.terrain === "meadow" || tile.terrain === "ridge")
      && wetDistance <= 12
    )).sort((left, right) => (
      left.wetDistance - right.wetDistance
      || right.tile.elevation - left.tile.elevation
      || left.tile.index - right.tile.index
    ))[0];
    if (refuge === undefined || refuge.tile.elevation < MAX_TIDE_LEVEL) {
      throw new Error("Core ecology snowy egret lacks a high-tide refuge");
    }
    const selected = new Set<number>([refuge.tile.index]);
    const wadingSites: HabitatSiteEvaluation[] = [];
    for (const targetElevation of EGRET_WADING_TARGET_ELEVATIONS) {
      const candidate = [...egret.sites]
        .filter(({ addressed }) => !selected.has(addressed.tile.index))
        .filter(({ addressed }) => (
          isPotentialSnowyEgretWadingElevation(addressed.tile.elevation)
        ))
        .sort((left, right) => (
          Math.abs(left.addressed.tile.elevation - targetElevation)
            - Math.abs(right.addressed.tile.elevation - targetElevation)
          || right.placementRank - left.placementRank
          || left.rankTie - right.rankTie
          || left.addressed.tile.index - right.addressed.tile.index
        ))[0];
      if (candidate === undefined) {
        throw new Error("Core ecology snowy egret lacks bounded wading destinations");
      }
      selected.add(candidate.addressed.tile.index);
      wadingSites.push(candidate);
    }
    for (let index = 0; index < wadingSites.length; index += 1) {
      const site = wadingSites[index];
      if (site === undefined) throw new Error("Core ecology snowy egret wading anchor vanished");
      anchors.push(tidalAnchorFromSite(
        "snowy-egret",
        "wading",
        index,
        site.addressed,
        originRegion,
      ));
    }
    anchors.push(tidalAnchorFromSite(
      "snowy-egret",
      "refuge",
      0,
      refuge,
      originRegion,
    ));
  }
  return Object.freeze(anchors);
}

function createAmericanBlackDuckHabitatAnchors(
  originRegion: RegionCoord,
  addressedTiles: readonly AddressedHabitatTile[],
  duck: UnallocatedPopulationAnalysis<"american-black-duck">,
): readonly CoreEcologyTidalTableHabitatAnchor[] {
  if (duck.populationUnits === 0) return Object.freeze([]);
  const refuge = addressedTiles.filter(({ tile, openWaterDistance }) => (
    tile.elevation >= MAX_TIDE_LEVEL
    && (tile.terrain === "meadow" || tile.terrain === "ridge")
    && openWaterDistance <= 10
  )).sort((left, right) => (
    left.openWaterDistance - right.openWaterDistance
    || right.tile.elevation - left.tile.elevation
    || left.tile.index - right.tile.index
  ))[0];
  if (refuge === undefined) {
    throw new Error("Core ecology American black duck lacks a dry refuge");
  }
  const selected = new Set<number>([refuge.tile.index]);
  const candidates = duck.sites.filter(({ addressed, score }) => (
    score >= SPECIES_RULES["american-black-duck"].minimumSiteScore
    && MAX_TIDE_LEVEL - addressed.tile.elevation
      >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
  ));
  const dabblingSites: HabitatSiteEvaluation[] = [];
  for (let ordinal = 0; ordinal < BLACK_DUCK_DABBLING_TARGET_ELEVATIONS.length; ordinal += 1) {
    const targetElevation = BLACK_DUCK_DABBLING_TARGET_ELEVATIONS[ordinal];
    if (targetElevation === undefined) continue;
    const candidate = [...candidates]
      .filter(({ addressed }) => !selected.has(addressed.tile.index))
      .filter(({ addressed }) => ordinal !== 0 || (
        MIN_TIDE_LEVEL - addressed.tile.elevation
          >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
      ))
      .sort((left, right) => (
        Math.abs(left.addressed.tile.elevation - targetElevation)
          - Math.abs(right.addressed.tile.elevation - targetElevation)
        || right.placementRank - left.placementRank
        || left.rankTie - right.rankTie
        || left.addressed.tile.index - right.addressed.tile.index
      ))[0];
    if (candidate === undefined) {
      throw new Error("Core ecology American black duck lacks bounded dabbling destinations");
    }
    selected.add(candidate.addressed.tile.index);
    dabblingSites.push(candidate);
  }
  const anchors = dabblingSites.map((site, anchorOrdinal) => tidalAnchorFromSite(
    "american-black-duck",
    "dabbling",
    anchorOrdinal,
    site.addressed,
    originRegion,
  ));
  anchors.push(tidalAnchorFromSite(
    "american-black-duck",
    "refuge",
    0,
    refuge,
    originRegion,
  ));
  return Object.freeze(anchors);
}

function tidalAnchorFromSite(
  species: CoreEcologyTidalTableAnchorSpecies,
  purpose: CoreEcologyTidalTableAnchorPurpose,
  anchorOrdinal: number,
  addressed: AddressedHabitatTile,
  originRegion: RegionCoord,
): CoreEcologyTidalTableHabitatAnchor {
  const tile = addressed.tile;
  const localX = tile.x * WORLD_POSITION_UNITS_PER_TILE
    + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  const localY = tile.y * WORLD_POSITION_UNITS_PER_TILE
    + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  return Object.freeze({
    species,
    purpose,
    anchorOrdinal,
    tileIndex: tile.index,
    globalTile: Object.freeze({
      x: addressed.globalTile.x,
      y: addressed.globalTile.y,
    }),
    position: createWorldPosition(originRegion, localX, localY),
    elevation: tile.elevation,
    terrain: tile.terrain,
    biome: addressed.biome,
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
  species: CoreEcologyWaterfowlHabitatSpecies,
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
    case "marsh-rabbit": {
      eligible = tile.terrain === "marsh" || tile.terrain === "meadow";
      const terrainForage = tile.terrain === "marsh" ? 900_000 : 760_000;
      food = multiplyFixed(
        terrainForage,
        FIXED_POINT - Math.trunc(interaction.saltStress / 2),
      );
      water = Math.max(
        distanceScore(addressed.wetDistance, 10),
        multiplyFixed(climate.rainfall, 720_000),
      );
      cover = weightedScore([
        [tile.roughness, 650_000],
        [tile.terrain === "marsh" ? 880_000 : 520_000, 350_000],
      ]);
      nesting = weightedScore([
        [cover, 720_000],
        [FIXED_POINT - climate.exposure, 280_000],
      ]);
      climateScore = rabbitClimateScore(climate, interaction);
      score = weightedScore([
        [food, 300_000],
        [water, 150_000],
        [cover, 240_000],
        [nesting, 170_000],
        [climateScore, 140_000],
      ]);
      eligible = eligible
        && food >= 300_000
        && water >= 180_000
        && cover >= 260_000
        && climateScore >= 300_000;
      break;
    }
    case "marsh-fox": {
      eligible = tile.terrain === "marsh"
        || tile.terrain === "meadow"
        || tile.terrain === "ridge";
      const terrainCover = tile.terrain === "marsh"
        ? 760_000
        : tile.terrain === "ridge"
        ? 700_000
        : 520_000;
      food = preySupport;
      water = Math.max(
        distanceScore(addressed.wetDistance, 18),
        multiplyFixed(climate.rainfall, 480_000),
      );
      cover = weightedScore([
        [tile.roughness, 640_000],
        [terrainCover, 360_000],
      ]);
      nesting = weightedScore([
        [cover, 760_000],
        [FIXED_POINT - climate.exposure, 240_000],
      ]);
      climateScore = foxClimateScore(climate, interaction);
      score = weightedScore([
        [food, 390_000],
        [water, 70_000],
        [cover, 250_000],
        [nesting, 150_000],
        [climateScore, 140_000],
      ]);
      eligible = eligible
        && preySupport >= 120_000
        && cover >= 260_000
        && climateScore >= 300_000;
      break;
    }
    case "fish-crow": {
      eligible = tile.terrain !== "deep-water";
      food = clampFixed(
        multiplyFixed(FISH_CROW_FOOD_BY_BIOME[biome], 780_000)
          + multiplyFixed(interaction.rainRetention, 220_000),
      );
      water = Math.max(
        distanceScore(addressed.openWaterDistance, 14),
        multiplyFixed(climate.rainfall, 520_000),
      );
      cover = clampFixed(
        multiplyFixed(FISH_CROW_PERCH_BY_BIOME[biome], 760_000)
          + multiplyFixed(tile.roughness, 240_000),
      );
      nesting = weightedScore([
        [FISH_CROW_PERCH_BY_BIOME[biome], 760_000],
        [FIXED_POINT - climate.exposure, 240_000],
      ]);
      climateScore = fishCrowClimateScore(climate, interaction);
      score = weightedScore([
        [food, 310_000],
        [water, 180_000],
        [cover, 190_000],
        [nesting, 180_000],
        [climateScore, 140_000],
      ]);
      eligible = eligible
        && food >= 260_000
        && water >= 180_000
        && nesting >= 300_000
        && climateScore >= 300_000;
      break;
    }
    case "northern-harrier": {
      eligible = tile.terrain === "marsh"
        || tile.terrain === "meadow"
        || tile.terrain === "ridge";
      food = preySupport;
      water = Math.max(
        distanceScore(addressed.wetDistance, 18),
        multiplyFixed(climate.rainfall, 420_000),
      );
      const openSearch = clampFixed(
        multiplyFixed(HARRIER_SEARCH_BY_BIOME[biome], 780_000)
          + multiplyFixed(FIXED_POINT - tile.roughness, 220_000),
      );
      cover = openSearch;
      nesting = weightedScore([
        [HARRIER_SEARCH_BY_BIOME[biome], 700_000],
        [FIXED_POINT - Math.trunc(climate.exposure / 2), 300_000],
      ]);
      climateScore = harrierClimateScore(climate, interaction);
      score = weightedScore([
        [food, 390_000],
        [water, 80_000],
        [cover, 260_000],
        [nesting, 130_000],
        [climateScore, 140_000],
      ]);
      eligible = eligible
        && preySupport >= 150_000
        && cover >= 360_000
        && climateScore >= 300_000;
      break;
    }
    case "southern-leopard-frog": {
      eligible = tile.terrain === "marsh" || tile.terrain === "meadow";
      food = multiplyFixed(
        FROG_FOOD_BY_BIOME[biome],
        FIXED_POINT - Math.trunc(interaction.saltStress * 3 / 4),
      );
      water = Math.max(
        distanceScore(addressed.wetDistance, 8),
        interaction.rainRetention,
      );
      cover = weightedScore([
        [FROG_COVER_BY_BIOME[biome], 680_000],
        [tile.moisture, 320_000],
      ]);
      nesting = weightedScore([
        [interaction.rainRetention, 620_000],
        [water, 380_000],
      ]);
      climateScore = frogClimateScore(climate, interaction);
      score = weightedScore([
        [food, 220_000],
        [water, 280_000],
        [cover, 180_000],
        [nesting, 190_000],
        [climateScore, 130_000],
      ]);
      eligible = eligible
        && food >= 280_000
        && water >= 400_000
        && cover >= 300_000
        && nesting >= 380_000
        && climateScore >= 300_000;
      break;
    }
    case "atlantic-silverside": {
      eligible = tile.terrain === "deep-water" || tile.terrain === "tidal-flat";
      food = SILVERSIDE_FOOD_BY_BIOME[biome];
      water = tile.terrain === "deep-water"
        ? FIXED_POINT
        : weightedScore([
            [distanceScore(addressed.openWaterDistance, 4), 720_000],
            [tile.moisture, 280_000],
          ]);
      // Cover represents channel refuge and broken current rather than
      // terrestrial concealment. It is a stable habitat property; live tide
      // selects which school anchors are usable in the separate tidal layer.
      cover = weightedScore([
        [tile.terrain === "deep-water" ? 880_000 : 560_000, 620_000],
        [tile.roughness, 220_000],
        [interaction.rainRetention, 160_000],
      ]);
      nesting = weightedScore([
        [water, 680_000],
        [cover, 320_000],
      ]);
      climateScore = silversideClimateScore(climate, interaction);
      score = weightedScore([
        [food, 260_000],
        [water, 300_000],
        [cover, 170_000],
        [nesting, 100_000],
        [climateScore, 170_000],
      ]);
      eligible = eligible
        && food >= 420_000
        && water >= 500_000
        && climateScore >= 300_000;
      break;
    }
    case "atlantic-marsh-fiddler-crab": {
      eligible = tile.terrain === "tidal-flat" || tile.terrain === "marsh";
      food = FIDDLER_FOOD_BY_BIOME[biome];
      water = weightedScore([
        [distanceScore(addressed.openWaterDistance, 5), 620_000],
        [tile.moisture, 380_000],
      ]);
      // Burrowable intertidal substrate is useful at every tide even though
      // surface-foraging activity changes strongly with exposure.
      cover = weightedScore([
        [tile.terrain === "tidal-flat" ? 960_000 : 760_000, 720_000],
        [FIXED_POINT - Math.trunc(tile.roughness / 2), 280_000],
      ]);
      nesting = weightedScore([
        [cover, 720_000],
        [interaction.rainRetention, 280_000],
      ]);
      climateScore = fiddlerClimateScore(climate, interaction);
      score = weightedScore([
        [food, 270_000],
        [water, 210_000],
        [cover, 230_000],
        [nesting, 160_000],
        [climateScore, 130_000],
      ]);
      eligible = eligible
        && food >= 440_000
        && water >= 380_000
        && cover >= 480_000
        && climateScore >= 300_000;
      break;
    }
    case "snowy-egret": {
      eligible = tile.terrain === "tidal-flat"
        || tile.terrain === "marsh"
        || tile.terrain === "meadow";
      food = preySupport;
      water = distanceScore(addressed.openWaterDistance, 8);
      const openSearch = clampFixed(
        multiplyFixed(EGRET_SEARCH_BY_BIOME[biome], 760_000)
          + multiplyFixed(FIXED_POINT - tile.roughness, 240_000),
      );
      cover = openSearch;
      nesting = weightedScore([
        [EGRET_SEARCH_BY_BIOME[biome], 520_000],
        [water, 300_000],
        [FIXED_POINT - Math.trunc(climate.exposure / 2), 180_000],
      ]);
      climateScore = egretClimateScore(climate, interaction);
      score = weightedScore([
        [food, 390_000],
        [water, 230_000],
        [cover, 190_000],
        [nesting, 80_000],
        [climateScore, 110_000],
      ]);
      eligible = eligible
        && preySupport >= 120_000
        && water >= 380_000
        && cover >= 420_000
        && climateScore >= 300_000;
      break;
    }
    case "american-black-duck": {
      eligible = tile.terrain === "deep-water"
        || tile.terrain === "tidal-flat"
        || tile.terrain === "marsh";
      food = clampFixed(
        multiplyFixed(BLACK_DUCK_FORAGE_BY_BIOME[biome], 700_000)
          + multiplyFixed(preySupport, 300_000),
      );
      water = tile.terrain === "deep-water"
        ? FIXED_POINT
        : weightedScore([
            [distanceScore(addressed.openWaterDistance, 6), 680_000],
            [tile.moisture, 320_000],
          ]);
      cover = weightedScore([
        [biome === "reed-marsh" || biome === "glimmerfen" ? 940_000 : 620_000, 620_000],
        [interaction.rainRetention, 220_000],
        [FIXED_POINT - Math.trunc(climate.exposure / 2), 160_000],
      ]);
      nesting = weightedScore([
        [cover, 620_000],
        [water, 240_000],
        [FIXED_POINT - interaction.heatLoad, 140_000],
      ]);
      climateScore = blackDuckClimateScore(climate, interaction);
      score = weightedScore([
        [food, 290_000],
        [water, 270_000],
        [cover, 190_000],
        [nesting, 110_000],
        [climateScore, 140_000],
      ]);
      eligible = eligible
        && food >= 320_000
        && water >= 440_000
        && cover >= 280_000
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

function rabbitClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 560_000, 780_000), 320_000],
    [centeredTolerance(climate.rainfall, 650_000, 900_000), 260_000],
    [FIXED_POINT - climate.exposure, 240_000],
    [FIXED_POINT - interaction.saltStress, 180_000],
  ]);
}

function foxClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 560_000, 900_000), 340_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 260_000],
    [FIXED_POINT - Math.trunc(interaction.saltStress / 2), 200_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 200_000],
  ]);
}

function fishCrowClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 620_000, 900_000), 320_000],
    [centeredTolerance(climate.rainfall, 620_000, 900_000), 260_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 180_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 240_000],
  ]);
}

function harrierClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 540_000, 900_000), 320_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 300_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 190_000],
    [FIXED_POINT - Math.trunc(interaction.saltStress / 2), 190_000],
  ]);
}

function frogClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 700_000, 620_000), 300_000],
    [centeredTolerance(climate.rainfall, 820_000, 500_000), 300_000],
    [interaction.rainRetention, 260_000],
    [FIXED_POINT - interaction.saltStress, 140_000],
  ]);
}

function silversideClimateScore(
  climate: BiomeClimate,
  interaction: BiomeInteraction,
): number {
  return weightedScore([
    [centeredTolerance(climate.salinity, 680_000, 760_000), 390_000],
    [centeredTolerance(climate.heat, 620_000, 820_000), 260_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 170_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 180_000],
  ]);
}

function fiddlerClimateScore(
  climate: BiomeClimate,
  interaction: BiomeInteraction,
): number {
  return weightedScore([
    [centeredTolerance(climate.salinity, 720_000, 700_000), 360_000],
    [centeredTolerance(climate.heat, 680_000, 760_000), 260_000],
    [interaction.rainRetention, 180_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 200_000],
  ]);
}

function egretClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 640_000, 840_000), 330_000],
    [centeredTolerance(climate.salinity, 580_000, 900_000), 260_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 170_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 240_000],
  ]);
}

function blackDuckClimateScore(climate: BiomeClimate, interaction: BiomeInteraction): number {
  return weightedScore([
    [centeredTolerance(climate.heat, 560_000, 900_000), 280_000],
    [centeredTolerance(climate.salinity, 520_000, FIXED_POINT), 260_000],
    [centeredTolerance(climate.rainfall, 650_000, 900_000), 220_000],
    [FIXED_POINT - Math.trunc(interaction.heatLoad / 2), 120_000],
    [FIXED_POINT - Math.trunc(climate.exposure / 2), 120_000],
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

function prepareCoreEcologyHabitatContext(
  input: DeriveCoreEcologyHabitatAssemblageInput,
  extension:
    | "harbor-edge"
    | "marsh-edge"
    | "rain-chorus"
    | "tidal-table"
    | "waterfowl",
): PreparedCoreEcologyHabitatContext {
  if (!plainRecord(input) || !allowedKeys(input, ["focus", "originRegion", "rootSeed", "terrain"])) {
    throw new TypeError(`Core ecology ${extension} habitat input has an unsupported shape`);
  }
  if (!isRegionCoord(input.originRegion)) {
    throw new RangeError(
      `Core ecology ${extension} habitat requires a canonical signed origin region`,
    );
  }
  const originRegion = createRegionCoord(input.originRegion.x, input.originRegion.y);
  const canonicalTerrain = generateRegionTerrain(input.rootSeed, originRegion);
  const terrainHash = regionTerrainHash(canonicalTerrain);
  const terrain = input.terrain === undefined
    ? canonicalTerrain
    : requireCanonicalSuppliedTerrain(input.terrain, terrainHash);
  const selection = normalizeSelection(input.focus, originRegion);
  return {
    originRegion,
    terrainHash,
    selection,
    addressedTiles: addressHabitatTiles(input.rootSeed, originRegion, terrain, selection),
  };
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
  species: CoreEcologyWaterfowlHabitatSpecies,
  terrain: string,
): boolean {
  if (species === "gull" || species === "fish-crow") {
    return terrain !== "deep-water" && isTerrainKind(terrain);
  }
  if (species === "brown-rat" || species === "domestic-cat") {
    return terrain !== "deep-water" && isTerrainKind(terrain);
  }
  if (species === "southern-leopard-frog") {
    return terrain === "marsh" || terrain === "meadow";
  }
  if (species === "atlantic-silverside") {
    return terrain === "deep-water" || terrain === "tidal-flat";
  }
  if (species === "atlantic-marsh-fiddler-crab") {
    return terrain === "tidal-flat" || terrain === "marsh";
  }
  if (species === "snowy-egret") {
    return terrain === "tidal-flat" || terrain === "marsh" || terrain === "meadow";
  }
  if (species === "american-black-duck") {
    return terrain === "deep-water" || terrain === "tidal-flat" || terrain === "marsh";
  }
  return terrain === "marsh" || terrain === "meadow" || terrain === "ridge";
}

function validTidalAnchorTerrain(
  species: CoreEcologyTidalTableAnchorSpecies,
  purpose: CoreEcologyTidalTableAnchorPurpose,
  terrain: string,
): boolean {
  if (species === "american-black-duck") {
    if (purpose === "dabbling") {
      return terrain === "deep-water" || terrain === "tidal-flat" || terrain === "marsh";
    }
    return purpose === "refuge" && (terrain === "meadow" || terrain === "ridge");
  }
  if (species !== "snowy-egret") {
    return purpose === "population" && validAllocationTerrain(species, terrain);
  }
  if (purpose === "wading") {
    return terrain === "tidal-flat" || terrain === "marsh" || terrain === "meadow";
  }
  return purpose === "refuge" && (terrain === "meadow" || terrain === "ridge");
}

function isPotentialSnowyEgretWadingElevation(elevation: number): boolean {
  return elevation
      >= MIN_TIDE_LEVEL - CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH
    && elevation
      <= MAX_TIDE_LEVEL - CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH;
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
  || CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS
    !== CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.reduce(
      (sum, species) => sum + SPECIES_RULES[species].maximumAllocations,
      0,
    )
  || CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS
    !== CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.reduce(
      (sum, species) => sum + SPECIES_RULES[species].maximumAllocations,
      0,
    )
  || CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS
    !== CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.reduce(
      (sum, species) => sum + SPECIES_RULES[species].maximumAllocations,
      0,
    )
  || CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS
    !== CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES.reduce(
      (sum, species) => sum + SPECIES_RULES[species].maximumAllocations,
      0,
    )
  || CORE_ECOLOGY_TIDAL_TABLE_MAX_ANCHOR_RECORDS
    !== SPECIES_RULES["atlantic-silverside"].maximumAllocations
      + SPECIES_RULES["atlantic-marsh-fiddler-crab"].maximumAllocations
      + CORE_ECOLOGY_SNOWY_EGRET_WADING_ANCHORS
      + CORE_ECOLOGY_SNOWY_EGRET_REFUGE_ANCHORS
  || CORE_ECOLOGY_WATERFOWL_MAX_ANCHOR_RECORDS
    !== CORE_ECOLOGY_TIDAL_TABLE_MAX_ANCHOR_RECORDS
      + CORE_ECOLOGY_AMERICAN_BLACK_DUCK_DABBLING_ANCHORS
      + CORE_ECOLOGY_AMERICAN_BLACK_DUCK_REFUGE_ANCHORS
) throw new Error("Core ecology habitat generation constants are incoherent");
