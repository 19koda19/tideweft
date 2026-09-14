import { deriveBaselineBiomeClimate } from "../sim/biomes";
import {
  getCoreWildlifeProfile,
  getCoreWildlifeSpeciesMetadata,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { generateRegionTerrain, regionTerrainHash } from "../sim/regionTerrain";
import { keyedRandomInt, keyedRandomU32, type RootSeed } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  isRegionCoord,
  regionLocalToGlobalTile,
  stableRegionId,
  stableRegionObjectId,
  type RegionCoord,
} from "../sim/regions";
import { MAX_TIDE_LEVEL, MIN_TIDE_LEVEL } from "../sim/terrain";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainKind,
  type TerrainState,
  type TerrainTile,
} from "../sim/types";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH,
  CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH,
} from "./coreEcologyHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_BREADTH_HABITAT_VERSION = 1 as const;
export const CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID =
  "game:core-ecology-breadth-habitat:v1" as const;
export const CORE_ECOLOGY_BREADTH_DERIVATION_KIND =
  "regional-breadth-v1" as const;
export const CORE_ECOLOGY_BREADTH_HABITAT_CACHE_LIMIT = 128 as const;
export const CORE_ECOLOGY_BREADTH_MAX_COHORTS = 64 as const;
export const CORE_ECOLOGY_BREADTH_MAX_SPECIES_PER_COHORT = 12 as const;
export const CORE_ECOLOGY_BREADTH_MAX_AGGREGATE_SPECIES_PER_COHORT = 4 as const;
export const CORE_ECOLOGY_BREADTH_MAXIMUM_EPOCH = 64 as const;

export const CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID =
  "estuary-surface-break" as const;
export const CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_EPOCH = 1 as const;
export const CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_SPECIES = Object.freeze([
  "bay-anchovy",
  "atlantic-ghost-crab",
  "great-blue-heron",
  "common-tern",
  "osprey",
] as const satisfies readonly CoreWildlifeSpecies[]);

export const CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID =
  "marsh-channel-web" as const;
export const CORE_ECOLOGY_MARSH_CHANNEL_WEB_EPOCH = 2 as const;
export const CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES = Object.freeze([
  "atlantic-menhaden",
  "mummichog",
  "grass-shrimp",
  "blue-crab",
  "greater-yellowlegs",
  "belted-kingfisher",
  "double-crested-cormorant",
] as const satisfies readonly CoreWildlifeSpecies[]);

export type CoreEcologyBreadthSpecies =
  | (typeof CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_SPECIES)[number]
  | (typeof CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES)[number];
export type CoreEcologyBreadthCohortId =
  | typeof CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID
  | typeof CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID;
export type CoreEcologyBreadthGuild =
  | "aerial-surface-consumer"
  | "aquatic-prey"
  | "benthic-omnivore"
  | "intertidal-detritivore"
  | "wading-consumer";
export type CoreEcologyBreadthAnchorPurpose =
  | "burrow-flat"
  | "flock-perch"
  | "foraging-water"
  | "schooling-water"
  | "surface-perch"
  | "wading-site";
export type CoreEcologyBreadthAnchorMedium =
  | "air-perch"
  | "land"
  | "shallow-water"
  | "surface-water";
export type CoreEcologyBreadthAdmissionReason =
  | "admitted"
  | "density-roll-failed"
  | "group-size-insufficient"
  | "habitat-capacity-zero"
  | "persistent-water-refuge-absent"
  | "regional-quiet"
  | "substrate-absent"
  | "territory-owned-elsewhere";
export type CoreEcologyBreadthActivityKind =
  | "burrow-foraging"
  | "foraging"
  | "quartering-search"
  | "schooling-glint"
  | "wading-search";
export type CoreEcologyBreadthActivePeriod =
  | "diurnal"
  | "tide-responsive";

export interface CoreEcologyBreadthRegionalAdmissionPolicy {
  readonly version: 1;
  readonly signal: "eligible-habitat";
  readonly minimumPresenceThreshold: number;
  readonly presenceSignalRange: number;
  readonly maximumPresenceThreshold: number;
}

type TileSignalKey =
  | "cold"
  | "dry"
  | "elevation"
  | "exposure"
  | "heat"
  | "moisture"
  | "roughness"
  | "salinity"
  | "shallow-water"
  | "shore-proximity"
  | "tidal"
  | "water"
  | "water-proximity";

export interface CoreEcologyBreadthSpeciesDefinition {
  readonly species: CoreEcologyBreadthSpecies;
  readonly guild: CoreEcologyBreadthGuild;
  readonly actorRepresentation: "aggregate" | "individual";
  readonly groupOrganization: "flock" | "school" | null;
  readonly territorySpanRegions: number;
  readonly allowedTerrain: readonly TerrainKind[];
  readonly minimumSiteScore: number;
  readonly minimumSalinity: number;
  readonly minimumHighTideDepth: number;
  readonly maximumHighTideDepth: number;
  readonly maximumLowTideDepth: number;
  readonly maximumShoreDistanceTiles: number;
  readonly maximumWaterDistanceTiles: number;
  readonly minimumElevation: number;
  readonly signalWeights: Readonly<Partial<Record<TileSignalKey, number>>>;
  readonly unitsPerWeightedTile: number;
  readonly minimumPopulationUnits: number;
  readonly maximumPopulationUnits: number;
  readonly maximumAnchors: number;
  readonly unitsPerAnchor: number;
  readonly minimumAnchorSeparationTiles: number;
  /** Aquatic cohorts may not remain conserved on anchors that all expose at low tide. */
  readonly requiresPersistentWaterRefuge: boolean;
  readonly densityMinimum: number;
  readonly densityQualityRange: number;
  readonly dependencySpecies: CoreEcologyBreadthSpecies | null;
  readonly dependencyUnitsPerPopulationUnit: number;
  readonly anchorPurpose: CoreEcologyBreadthAnchorPurpose;
  readonly anchorMedium: CoreEcologyBreadthAnchorMedium;
  readonly activityKind: CoreEcologyBreadthActivityKind;
  readonly activePeriod: CoreEcologyBreadthActivePeriod;
}

export interface CoreEcologyBreadthCohortDefinition {
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly introducedInEpoch: number;
  readonly definitionVersion: 1 | 2;
  /**
   * Epoch 1 deliberately omits this field so its definition hash and admission
   * algorithm remain byte-identical. Later cohorts bind their regional
   * occurrence policy into their own immutable definition hash.
   */
  readonly regionalAdmission?: CoreEcologyBreadthRegionalAdmissionPolicy;
  readonly species: readonly CoreEcologyBreadthSpeciesDefinition[];
  readonly definitionHash: string;
}

export interface CoreEcologyBreadthTerritory {
  readonly version: typeof CORE_ECOLOGY_BREADTH_HABITAT_VERSION;
  readonly stableId: string;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly species: CoreEcologyBreadthSpecies;
  readonly address: Readonly<{ readonly x: number; readonly y: number }>;
  readonly spanRegions: number;
  readonly bounds: Readonly<{
    readonly minimum: RegionCoord;
    readonly maximum: RegionCoord;
  }>;
  readonly hostRegion: RegionCoord;
  readonly regionIsHost: boolean;
}

export interface CoreEcologyBreadthTerrainSummary {
  readonly tileCount: number;
  readonly waterTileCount: number;
  readonly intertidalTileCount: number;
  readonly dryShoreTileCount: number;
  readonly shallowWaterTileCount: number;
  readonly salineWaterTileCount: number;
  readonly perchTileCount: number;
  readonly averageWaterSalinity: number;
  readonly averageWaterHeat: number;
  readonly estuarySignal: number;
  readonly surfaceBreakSignal: number;
}

export interface CoreEcologyBreadthDensityAdmission {
  readonly regionalQuietRoll: number;
  readonly regionalQuietThreshold: number;
  readonly regionalQuiet: boolean;
}

export interface CoreEcologyBreadthPopulationAnchor {
  readonly stableId: string;
  readonly anchorOrdinal: number;
  readonly purpose: CoreEcologyBreadthAnchorPurpose;
  readonly medium: CoreEcologyBreadthAnchorMedium;
  readonly localX: number;
  readonly localY: number;
  readonly globalX: number;
  readonly globalY: number;
  readonly position: WorldPosition;
  readonly terrain: TerrainKind;
  readonly elevation: number;
  readonly lowTideDepth: number;
  readonly highTideDepth: number;
  readonly shorelineDistance: number;
  readonly waterDistance: number;
  readonly habitatScore: number;
  readonly allocatedPopulation: number;
}

export interface CoreEcologyBreadthPopulationCandidate {
  readonly version: typeof CORE_ECOLOGY_BREADTH_HABITAT_VERSION;
  readonly stableId: string;
  readonly populationKey: string;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly species: CoreEcologyBreadthSpecies;
  readonly guild: CoreEcologyBreadthGuild;
  readonly actorRepresentation: "aggregate" | "individual";
  readonly groupOrganization: "flock" | "school" | null;
  readonly territoryId: string;
  readonly territoryHostRegion: RegionCoord;
  readonly territoryOwnedHere: boolean;
  readonly habitatScore: number;
  readonly suitableTileCount: number;
  readonly habitatCapacity: number;
  readonly densityRoll: number;
  readonly densityThreshold: number;
  readonly dependencySpecies: CoreEcologyBreadthSpecies | null;
  readonly dependencyPopulationKey: string | null;
  readonly preySupportUnits: number;
  readonly trophicCeiling: number;
  readonly guildCeiling: number;
  readonly populationUnits: number;
  readonly admissionReason: CoreEcologyBreadthAdmissionReason;
  readonly activitySignal: Readonly<{
    readonly kind: CoreEcologyBreadthActivityKind;
    readonly intensity: number;
    readonly activePeriod: CoreEcologyBreadthActivePeriod;
    readonly source: "habitat-derived";
  }>;
  readonly anchors: readonly CoreEcologyBreadthPopulationAnchor[];
}

/** Minimal saved-depth seam consumed by the shared tidal-table owner. */
export interface CoreEcologyBreadthTidalAnchor {
  readonly species: CoreEcologyBreadthSpecies;
  readonly purpose: "population";
  readonly anchorOrdinal: number;
  readonly position: WorldPosition;
  readonly elevation: number;
}

export interface CoreEcologyBreadthHabitat {
  readonly version: typeof CORE_ECOLOGY_BREADTH_HABITAT_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID;
  readonly derivationKind: typeof CORE_ECOLOGY_BREADTH_DERIVATION_KIND;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly cohortDefinitionHash: string;
  readonly region: RegionCoord;
  readonly regionId: string;
  readonly sourceStableId: string;
  readonly terrainHash: string;
  readonly summary: CoreEcologyBreadthTerrainSummary;
  readonly density: CoreEcologyBreadthDensityAdmission;
  readonly evaluatedSpeciesCount: number;
  readonly populations: readonly CoreEcologyBreadthPopulationCandidate[];
  readonly tidalAnchors: readonly CoreEcologyBreadthTidalAnchor[];
  readonly totalPopulationUnits: number;
  readonly admittedSpeciesCount: number;
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyBreadthHabitatInput {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly terrain?: TerrainState;
  /** Order is a test seam only; every cohort member remains mandatory. */
  readonly speciesOrder?: readonly CoreEcologyBreadthSpecies[];
}

interface AnalyzedBreadthTile {
  readonly tile: TerrainTile;
  readonly globalX: number;
  readonly globalY: number;
  readonly heat: number;
  readonly salinity: number;
  readonly exposure: number;
  readonly lowTideDepth: number;
  readonly highTideDepth: number;
  readonly shorelineDistance: number;
  readonly waterDistance: number;
  readonly signals: Readonly<Record<TileSignalKey, number>>;
  readonly scoreBySpecies: Readonly<Record<CoreEcologyBreadthSpecies, number>>;
  readonly rankBySpecies: Readonly<Record<CoreEcologyBreadthSpecies, number>>;
}

interface CandidateDraft {
  readonly definition: CoreEcologyBreadthSpeciesDefinition;
  readonly territory: CoreEcologyBreadthTerritory;
  readonly suitableTiles: readonly AnalyzedBreadthTile[];
  readonly persistentWaterRefugeTiles: readonly AnalyzedBreadthTile[];
  readonly habitatScore: number;
  readonly habitatCapacity: number;
  readonly densityRoll: number;
  readonly densityThreshold: number;
  populationUnits: number;
  dependencyPopulationKey: string | null;
  preySupportUnits: number;
  trophicCeiling: number;
  admissionReason: CoreEcologyBreadthAdmissionReason;
}

const UINT32_MAX = 0xffff_ffff;
const BREADTH_QUIET_DOMAIN = 0x4252_5154;
const BREADTH_DENSITY_DOMAIN = 0x4252_444e;
const BREADTH_TERRITORY_DOMAIN = 0x4252_5452;
const BREADTH_ANCHOR_DOMAIN = 0x4252_414e;
const HASH_PATTERN = /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/u;
const TRUSTED_HABITATS = new WeakSet<object>();
const HABITAT_CACHE = new Map<string, CoreEcologyBreadthHabitat>();

function definition(
  value: Omit<CoreEcologyBreadthSpeciesDefinition, "actorRepresentation" | "groupOrganization">,
): CoreEcologyBreadthSpeciesDefinition {
  const metadata = getCoreWildlifeSpeciesMetadata(value.species);
  return deepFreeze({
    ...value,
    actorRepresentation: metadata.actorRepresentation,
    groupOrganization: metadata.groupOrganization === "flock"
      || metadata.groupOrganization === "school"
      ? metadata.groupOrganization
      : null,
  });
}

const ESTUARY_SURFACE_BREAK_SPECIES_DEFINITIONS = Object.freeze([
  definition({
    species: "bay-anchovy",
    guild: "aquatic-prey",
    territorySpanRegions: 1,
    allowedTerrain: Object.freeze(["deep-water", "tidal-flat"]),
    minimumSiteScore: 430_000,
    minimumSalinity: 240_000,
    minimumHighTideDepth: 28_000,
    maximumHighTideDepth: FIXED_POINT,
    maximumLowTideDepth: FIXED_POINT,
    maximumShoreDistanceTiles: 20,
    maximumWaterDistanceTiles: 0,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      water: 5,
      salinity: 3,
      "shore-proximity": 2,
      tidal: 2,
      heat: 1,
    }),
    unitsPerWeightedTile: 2,
    minimumPopulationUnits: 8,
    maximumPopulationUnits: 48,
    maximumAnchors: 4,
    unitsPerAnchor: 12,
    minimumAnchorSeparationTiles: 5,
    requiresPersistentWaterRefuge: true,
    densityMinimum: 520_000,
    densityQualityRange: 300_000,
    dependencySpecies: null,
    dependencyUnitsPerPopulationUnit: 0,
    anchorPurpose: "schooling-water",
    anchorMedium: "surface-water",
    activityKind: "schooling-glint",
    activePeriod: "tide-responsive",
  }),
  definition({
    species: "atlantic-ghost-crab",
    guild: "intertidal-detritivore",
    territorySpanRegions: 1,
    allowedTerrain: Object.freeze(["tidal-flat"]),
    minimumSiteScore: 400_000,
    minimumSalinity: 220_000,
    minimumHighTideDepth: 1,
    maximumHighTideDepth: 380_000,
    maximumLowTideDepth: 50_000,
    maximumShoreDistanceTiles: 3,
    maximumWaterDistanceTiles: 0,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      dry: 3,
      salinity: 3,
      "shore-proximity": 4,
      tidal: 4,
      heat: 2,
    }),
    unitsPerWeightedTile: 2,
    minimumPopulationUnits: 6,
    maximumPopulationUnits: 24,
    maximumAnchors: 4,
    unitsPerAnchor: 6,
    minimumAnchorSeparationTiles: 4,
    requiresPersistentWaterRefuge: false,
    densityMinimum: 450_000,
    densityQualityRange: 260_000,
    dependencySpecies: null,
    dependencyUnitsPerPopulationUnit: 0,
    anchorPurpose: "burrow-flat",
    anchorMedium: "land",
    activityKind: "burrow-foraging",
    activePeriod: "tide-responsive",
  }),
  definition({
    species: "great-blue-heron",
    guild: "wading-consumer",
    territorySpanRegions: 2,
    allowedTerrain: Object.freeze(["marsh", "tidal-flat"]),
    minimumSiteScore: 390_000,
    minimumSalinity: 0,
    minimumHighTideDepth: 1,
    maximumHighTideDepth: CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH,
    maximumLowTideDepth: 120_000,
    maximumShoreDistanceTiles: 5,
    maximumWaterDistanceTiles: 1,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      "shallow-water": 6,
      "shore-proximity": 3,
      water: 2,
      moisture: 2,
      tidal: 2,
    }),
    unitsPerWeightedTile: 8,
    minimumPopulationUnits: 1,
    maximumPopulationUnits: 1,
    maximumAnchors: 1,
    unitsPerAnchor: 1,
    minimumAnchorSeparationTiles: 1,
    requiresPersistentWaterRefuge: false,
    densityMinimum: 240_000,
    densityQualityRange: 230_000,
    dependencySpecies: "bay-anchovy",
    dependencyUnitsPerPopulationUnit: 8,
    anchorPurpose: "wading-site",
    anchorMedium: "shallow-water",
    activityKind: "wading-search",
    activePeriod: "diurnal",
  }),
  definition({
    species: "common-tern",
    guild: "aerial-surface-consumer",
    territorySpanRegions: 2,
    allowedTerrain: Object.freeze(["marsh", "meadow", "ridge", "tidal-flat"]),
    minimumSiteScore: 380_000,
    minimumSalinity: 0,
    minimumHighTideDepth: 0,
    maximumHighTideDepth: FIXED_POINT,
    maximumLowTideDepth: FIXED_POINT,
    maximumShoreDistanceTiles: 14,
    maximumWaterDistanceTiles: 10,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      "water-proximity": 6,
      exposure: 4,
      "shore-proximity": 3,
      dry: 2,
      tidal: 1,
    }),
    unitsPerWeightedTile: 10,
    minimumPopulationUnits: 2,
    maximumPopulationUnits: 4,
    maximumAnchors: 4,
    unitsPerAnchor: 1,
    minimumAnchorSeparationTiles: 3,
    requiresPersistentWaterRefuge: false,
    densityMinimum: 300_000,
    densityQualityRange: 240_000,
    dependencySpecies: "bay-anchovy",
    dependencyUnitsPerPopulationUnit: 5,
    anchorPurpose: "flock-perch",
    anchorMedium: "air-perch",
    activityKind: "foraging",
    activePeriod: "diurnal",
  }),
  definition({
    species: "osprey",
    guild: "aerial-surface-consumer",
    territorySpanRegions: 3,
    allowedTerrain: Object.freeze(["meadow", "ridge"]),
    minimumSiteScore: 440_000,
    minimumSalinity: 0,
    minimumHighTideDepth: 0,
    maximumHighTideDepth: FIXED_POINT,
    maximumLowTideDepth: FIXED_POINT,
    maximumShoreDistanceTiles: 20,
    maximumWaterDistanceTiles: 18,
    minimumElevation: 180_000,
    signalWeights: Object.freeze({
      "water-proximity": 6,
      elevation: 3,
      exposure: 4,
      dry: 2,
      "shore-proximity": 1,
    }),
    unitsPerWeightedTile: 12,
    minimumPopulationUnits: 1,
    maximumPopulationUnits: 1,
    maximumAnchors: 1,
    unitsPerAnchor: 1,
    minimumAnchorSeparationTiles: 1,
    requiresPersistentWaterRefuge: false,
    densityMinimum: 140_000,
    densityQualityRange: 180_000,
    dependencySpecies: "bay-anchovy",
    dependencyUnitsPerPopulationUnit: 18,
    anchorPurpose: "surface-perch",
    anchorMedium: "air-perch",
    activityKind: "quartering-search",
    activePeriod: "diurnal",
  }),
] as const);

const MARSH_CHANNEL_WEB_SPECIES_DEFINITIONS = Object.freeze([
  definition({
    species: "atlantic-menhaden",
    guild: "aquatic-prey",
    territorySpanRegions: 1,
    allowedTerrain: Object.freeze(["deep-water", "tidal-flat"]),
    minimumSiteScore: 420_000,
    minimumSalinity: 120_000,
    minimumHighTideDepth: 60_000,
    maximumHighTideDepth: FIXED_POINT,
    maximumLowTideDepth: FIXED_POINT,
    maximumShoreDistanceTiles: 20,
    maximumWaterDistanceTiles: 0,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      water: 6,
      salinity: 2,
      "shore-proximity": 2,
      tidal: 1,
      heat: 1,
    }),
    unitsPerWeightedTile: 2,
    minimumPopulationUnits: 16,
    maximumPopulationUnits: 48,
    maximumAnchors: 2,
    unitsPerAnchor: 24,
    minimumAnchorSeparationTiles: 5,
    requiresPersistentWaterRefuge: true,
    densityMinimum: 500_000,
    densityQualityRange: 300_000,
    dependencySpecies: null,
    dependencyUnitsPerPopulationUnit: 0,
    anchorPurpose: "schooling-water",
    anchorMedium: "surface-water",
    activityKind: "schooling-glint",
    activePeriod: "tide-responsive",
  }),
  definition({
    species: "mummichog",
    guild: "aquatic-prey",
    territorySpanRegions: 1,
    allowedTerrain: Object.freeze(["deep-water", "marsh", "tidal-flat"]),
    minimumSiteScore: 360_000,
    minimumSalinity: 0,
    minimumHighTideDepth: 1,
    maximumHighTideDepth: 400_000,
    maximumLowTideDepth: 300_000,
    maximumShoreDistanceTiles: 8,
    maximumWaterDistanceTiles: 2,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      "shallow-water": 5,
      moisture: 3,
      water: 3,
      "shore-proximity": 2,
      tidal: 2,
    }),
    unitsPerWeightedTile: 3,
    minimumPopulationUnits: 8,
    maximumPopulationUnits: 32,
    maximumAnchors: 2,
    unitsPerAnchor: 16,
    minimumAnchorSeparationTiles: 4,
    requiresPersistentWaterRefuge: true,
    densityMinimum: 520_000,
    densityQualityRange: 280_000,
    dependencySpecies: null,
    dependencyUnitsPerPopulationUnit: 0,
    anchorPurpose: "schooling-water",
    anchorMedium: "shallow-water",
    activityKind: "schooling-glint",
    activePeriod: "tide-responsive",
  }),
  definition({
    species: "grass-shrimp",
    guild: "aquatic-prey",
    territorySpanRegions: 1,
    allowedTerrain: Object.freeze(["deep-water", "marsh", "tidal-flat"]),
    minimumSiteScore: 350_000,
    minimumSalinity: 0,
    minimumHighTideDepth: 1,
    maximumHighTideDepth: FIXED_POINT,
    maximumLowTideDepth: FIXED_POINT,
    maximumShoreDistanceTiles: 6,
    maximumWaterDistanceTiles: 1,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      "shallow-water": 5,
      moisture: 4,
      tidal: 3,
      "shore-proximity": 2,
      water: 1,
    }),
    unitsPerWeightedTile: 3,
    minimumPopulationUnits: 8,
    maximumPopulationUnits: 32,
    maximumAnchors: 2,
    unitsPerAnchor: 16,
    minimumAnchorSeparationTiles: 3,
    requiresPersistentWaterRefuge: true,
    densityMinimum: 540_000,
    densityQualityRange: 260_000,
    dependencySpecies: null,
    dependencyUnitsPerPopulationUnit: 0,
    anchorPurpose: "foraging-water",
    anchorMedium: "shallow-water",
    activityKind: "foraging",
    activePeriod: "tide-responsive",
  }),
  definition({
    species: "blue-crab",
    guild: "benthic-omnivore",
    territorySpanRegions: 1,
    allowedTerrain: Object.freeze(["deep-water", "marsh", "tidal-flat"]),
    minimumSiteScore: 360_000,
    minimumSalinity: 50_000,
    minimumHighTideDepth: 20_000,
    maximumHighTideDepth: 520_000,
    maximumLowTideDepth: FIXED_POINT,
    maximumShoreDistanceTiles: 10,
    maximumWaterDistanceTiles: 1,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      "shallow-water": 4,
      water: 4,
      tidal: 3,
      salinity: 2,
      moisture: 1,
    }),
    unitsPerWeightedTile: 4,
    minimumPopulationUnits: 4,
    maximumPopulationUnits: 16,
    maximumAnchors: 2,
    unitsPerAnchor: 8,
    minimumAnchorSeparationTiles: 4,
    requiresPersistentWaterRefuge: true,
    densityMinimum: 440_000,
    densityQualityRange: 260_000,
    dependencySpecies: null,
    dependencyUnitsPerPopulationUnit: 0,
    anchorPurpose: "foraging-water",
    anchorMedium: "shallow-water",
    activityKind: "foraging",
    activePeriod: "tide-responsive",
  }),
  definition({
    species: "greater-yellowlegs",
    guild: "wading-consumer",
    territorySpanRegions: 2,
    allowedTerrain: Object.freeze(["marsh", "tidal-flat"]),
    minimumSiteScore: 390_000,
    minimumSalinity: 0,
    minimumHighTideDepth: 1,
    maximumHighTideDepth: CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH,
    maximumLowTideDepth: 120_000,
    maximumShoreDistanceTiles: 6,
    maximumWaterDistanceTiles: 1,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      "shallow-water": 6,
      "shore-proximity": 3,
      moisture: 2,
      tidal: 3,
      water: 1,
    }),
    unitsPerWeightedTile: 8,
    minimumPopulationUnits: 2,
    maximumPopulationUnits: 4,
    maximumAnchors: 4,
    unitsPerAnchor: 1,
    minimumAnchorSeparationTiles: 3,
    requiresPersistentWaterRefuge: false,
    densityMinimum: 360_000,
    densityQualityRange: 260_000,
    dependencySpecies: "grass-shrimp",
    dependencyUnitsPerPopulationUnit: 4,
    anchorPurpose: "wading-site",
    anchorMedium: "shallow-water",
    activityKind: "wading-search",
    activePeriod: "tide-responsive",
  }),
  definition({
    species: "belted-kingfisher",
    guild: "aerial-surface-consumer",
    territorySpanRegions: 2,
    allowedTerrain: Object.freeze(["marsh", "meadow", "ridge"]),
    minimumSiteScore: 400_000,
    minimumSalinity: 0,
    minimumHighTideDepth: 0,
    maximumHighTideDepth: FIXED_POINT,
    maximumLowTideDepth: FIXED_POINT,
    maximumShoreDistanceTiles: 20,
    maximumWaterDistanceTiles: 14,
    minimumElevation: 80_000,
    signalWeights: Object.freeze({
      "water-proximity": 6,
      elevation: 2,
      exposure: 2,
      dry: 3,
      "shore-proximity": 1,
    }),
    unitsPerWeightedTile: 10,
    minimumPopulationUnits: 1,
    maximumPopulationUnits: 1,
    maximumAnchors: 1,
    unitsPerAnchor: 1,
    minimumAnchorSeparationTiles: 1,
    requiresPersistentWaterRefuge: false,
    densityMinimum: 220_000,
    densityQualityRange: 220_000,
    dependencySpecies: "mummichog",
    dependencyUnitsPerPopulationUnit: 8,
    anchorPurpose: "surface-perch",
    anchorMedium: "air-perch",
    activityKind: "foraging",
    activePeriod: "diurnal",
  }),
  definition({
    species: "double-crested-cormorant",
    guild: "aerial-surface-consumer",
    territorySpanRegions: 2,
    allowedTerrain: Object.freeze(["marsh", "meadow", "ridge", "tidal-flat"]),
    minimumSiteScore: 380_000,
    minimumSalinity: 0,
    minimumHighTideDepth: 0,
    maximumHighTideDepth: FIXED_POINT,
    maximumLowTideDepth: FIXED_POINT,
    maximumShoreDistanceTiles: 16,
    maximumWaterDistanceTiles: 12,
    minimumElevation: 0,
    signalWeights: Object.freeze({
      "water-proximity": 6,
      exposure: 3,
      "shore-proximity": 3,
      dry: 2,
      tidal: 1,
    }),
    unitsPerWeightedTile: 10,
    minimumPopulationUnits: 2,
    maximumPopulationUnits: 3,
    maximumAnchors: 3,
    unitsPerAnchor: 1,
    minimumAnchorSeparationTiles: 3,
    requiresPersistentWaterRefuge: false,
    densityMinimum: 320_000,
    densityQualityRange: 260_000,
    dependencySpecies: "atlantic-menhaden",
    dependencyUnitsPerPopulationUnit: 8,
    anchorPurpose: "flock-perch",
    anchorMedium: "air-perch",
    activityKind: "foraging",
    activePeriod: "diurnal",
  }),
] as const);

const MARSH_CHANNEL_WEB_REGIONAL_ADMISSION = deepFreeze({
  version: 1 as const,
  signal: "eligible-habitat" as const,
  minimumPresenceThreshold: 320_000,
  presenceSignalRange: 500_000,
  maximumPresenceThreshold: 850_000,
});

function cohortDefinitionBase() {
  return {
    cohortId: CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
    introducedInEpoch: CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_EPOCH,
    definitionVersion: 1 as const,
    species: ESTUARY_SURFACE_BREAK_SPECIES_DEFINITIONS,
  } as const;
}

function marshChannelWebCohortDefinitionBase() {
  return {
    cohortId: CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
    introducedInEpoch: CORE_ECOLOGY_MARSH_CHANNEL_WEB_EPOCH,
    definitionVersion: 2 as const,
    regionalAdmission: MARSH_CHANNEL_WEB_REGIONAL_ADMISSION,
    species: MARSH_CHANNEL_WEB_SPECIES_DEFINITIONS,
  } as const;
}

export const CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS:
readonly CoreEcologyBreadthCohortDefinition[] = Object.freeze([
  deepFreeze({
    ...cohortDefinitionBase(),
    definitionHash: hashCanonical(cohortDefinitionBase()),
  }),
  deepFreeze({
    ...marshChannelWebCohortDefinitionBase(),
    definitionHash: hashCanonical(marshChannelWebCohortDefinitionBase()),
  }),
]);

export const CORE_ECOLOGY_BREADTH_CURRENT_EPOCH =
  CORE_ECOLOGY_MARSH_CHANNEL_WEB_EPOCH;

assertBreadthDefinitions(CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS);

export function coreEcologyBreadthCohortDefinition(
  cohortId: CoreEcologyBreadthCohortId,
): CoreEcologyBreadthCohortDefinition | null {
  return CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS.find(
    (candidate) => candidate.cohortId === cohortId,
  ) ?? null;
}

/** Generic append-only registry validator used by future Wave-G cohort additions. */
export function assertBreadthDefinitions(
  definitions: readonly CoreEcologyBreadthCohortDefinition[],
): void {
  if (
    !Array.isArray(definitions)
    || definitions.length === 0
    || definitions.length > CORE_ECOLOGY_BREADTH_MAX_COHORTS
  ) throw new RangeError("Breadth habitat requires a bounded cohort registry");
  const ids = new Set<string>();
  let priorEpoch = 0;
  const species = new Set<string>();
  for (const cohort of definitions) {
    if (
      !plainRecord(cohort)
      || !validCohortId(cohort.cohortId)
      || ids.has(cohort.cohortId)
      || !positiveSafeInteger(cohort.introducedInEpoch)
      || cohort.introducedInEpoch > CORE_ECOLOGY_BREADTH_MAXIMUM_EPOCH
      || (ids.size > 0 && cohort.introducedInEpoch <= priorEpoch)
      || (cohort.definitionVersion !== 1 && cohort.definitionVersion !== 2)
      || !Array.isArray(cohort.species)
      || cohort.species.length === 0
      || cohort.species.length > CORE_ECOLOGY_BREADTH_MAX_SPECIES_PER_COHORT
      || cohort.species.filter(({ actorRepresentation }) => (
        actorRepresentation === "aggregate"
      )).length > CORE_ECOLOGY_BREADTH_MAX_AGGREGATE_SPECIES_PER_COHORT
      || !validHash(cohort.definitionHash)
    ) throw new RangeError("Breadth cohort registry is malformed or reordered");
    const hasRegionalAdmission = Object.prototype.hasOwnProperty.call(
      cohort,
      "regionalAdmission",
    );
    if (
      (cohort.definitionVersion === 1 && hasRegionalAdmission)
      || (
        cohort.definitionVersion === 2
        && canonicalRegionalAdmission(cohort.regionalAdmission) === null
      )
    ) throw new RangeError("Breadth cohort regional admission policy is malformed");
    const base = cohort.definitionVersion === 1
      ? {
          cohortId: cohort.cohortId,
          introducedInEpoch: cohort.introducedInEpoch,
          definitionVersion: cohort.definitionVersion,
          species: cohort.species,
        }
      : {
          cohortId: cohort.cohortId,
          introducedInEpoch: cohort.introducedInEpoch,
          definitionVersion: cohort.definitionVersion,
          regionalAdmission: cohort.regionalAdmission,
          species: cohort.species,
        };
    if (hashCanonical(base) !== cohort.definitionHash) {
      throw new RangeError("Breadth cohort definition hash does not match its rules");
    }
    const orderedSpecies = new Set<CoreEcologyBreadthSpecies>();
    for (const entry of cohort.species) {
      if (species.has(entry.species)) {
        throw new RangeError("A breadth species cannot be owned by two cohorts");
      }
      if (
        entry.dependencySpecies !== null
        && !orderedSpecies.has(entry.dependencySpecies)
      ) {
        throw new RangeError(
          "Breadth cohort dependency must be local and ordered before its consumer",
        );
      }
      orderedSpecies.add(entry.species);
      species.add(entry.species);
    }
    ids.add(cohort.cohortId);
    priorEpoch = cohort.introducedInEpoch;
  }
}

export function coreEcologyBreadthCohortsThroughEpoch(
  epoch: number,
): readonly CoreEcologyBreadthCohortDefinition[] {
  if (!nonnegativeSafeInteger(epoch) || epoch > CORE_ECOLOGY_BREADTH_MAXIMUM_EPOCH) {
    throw new RangeError("Breadth epoch is outside the bounded registry");
  }
  return Object.freeze(CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS.filter(
    ({ introducedInEpoch }) => introducedInEpoch <= epoch,
  ));
}

export function deriveCoreEcologyBreadthTerritory(
  seed: RootSeed,
  cohortId: CoreEcologyBreadthCohortId,
  species: CoreEcologyBreadthSpecies,
  region: RegionCoord,
): CoreEcologyBreadthTerritory {
  requireRootSeed(seed);
  if (!isRegionCoord(region)) {
    throw new RangeError("Breadth territory requires a canonical region");
  }
  const cohort = requireCohort(cohortId);
  const profile = cohort.species.find((candidate) => candidate.species === species);
  if (profile === undefined) {
    throw new TypeError("Breadth territory species is not in the requested cohort");
  }
  const span = profile.territorySpanRegions;
  const address = Object.freeze({
    x: floorAddress(region.x, span),
    y: floorAddress(region.y, span),
  });
  const bounds = territoryBounds(address, span);
  const width = bounds.maximum.x - bounds.minimum.x + 1;
  const height = bounds.maximum.y - bounds.minimum.y + 1;
  const hostOrdinal = keyedRandomInt(
    seed,
    BREADTH_TERRITORY_DOMAIN,
    address.x,
    address.y,
    semanticPurpose(`${cohortId}:${species}`),
    0,
    width * height - 1,
  );
  const hostRegion = createRegionCoord(
    bounds.minimum.x + hostOrdinal % width,
    bounds.minimum.y + Math.trunc(hostOrdinal / width),
  );
  return deepFreeze({
    version: CORE_ECOLOGY_BREADTH_HABITAT_VERSION,
    stableId: stableRegionObjectId(
      seed,
      hostRegion,
      "breadth-territory",
      `${cohortId}:${species}`,
    ),
    cohortId,
    species,
    address,
    spanRegions: span,
    bounds,
    hostRegion,
    regionIsHost: hostRegion.x === region.x && hostRegion.y === region.y,
  });
}

/**
 * Derives one registry-owned ecological cohort. No camera, player, starting
 * region, load order, or presentation state participates in admission.
 */
export function deriveCoreEcologyBreadthHabitat(
  input: DeriveCoreEcologyBreadthHabitatInput,
): CoreEcologyBreadthHabitat {
  if (!plainRecord(input)) throw new TypeError("Breadth habitat input is malformed");
  requireRootSeed(input.seed);
  if (!isRegionCoord(input.region)) {
    throw new RangeError("Breadth habitat requires a canonical region");
  }
  const cohort = requireCohort(input.cohortId);
  canonicalSpeciesOrder(cohort, input.speciesOrder);
  const region = createRegionCoord(input.region.x, input.region.y);
  const key = cacheKey(input.seed, region, cohort);
  if (input.terrain === undefined) {
    const cached = HABITAT_CACHE.get(key);
    if (cached !== undefined) return cacheHabitat(key, cached);
  }
  const terrain = canonicalTerrain(input.seed, region, input.terrain);
  const cached = HABITAT_CACHE.get(key);
  if (cached !== undefined) return cacheHabitat(key, cached);

  const analysis = analyzeTerrain(input.seed, region, terrain, cohort);
  const regionalQuietRoll = keyedRandomInt(
    input.seed,
    BREADTH_QUIET_DOMAIN,
    region.x,
    region.y,
    semanticPurpose(cohort.cohortId),
    0,
    FIXED_POINT - 1,
  );
  // Epoch 1 retains its exact historical admission equation. Later cohorts
  // derive occurrence from their own eligible habitat and bind the parameters
  // into the immutable cohort definition rather than inheriting an estuary-only
  // signal by accident.
  const regionalQuietThreshold = cohort.definitionVersion === 1
    ? Math.min(
        900_000,
        analysis.summary.estuarySignal === 0
          ? 0
          : 380_000 + Math.trunc(
              analysis.summary.estuarySignal * 500_000 / FIXED_POINT,
            ),
      )
    : declarativeRegionalPresenceThreshold(cohort, analysis.tiles);
  const regionalQuiet = regionalQuietRoll >= regionalQuietThreshold;
  const drafts = cohort.species.map((profile) => createDraft(
    input.seed,
    region,
    cohort,
    profile,
    analysis.tiles,
    regionalQuiet,
  ));
  applyDependencies(drafts);
  const populations = drafts.map((draft) => candidateFromDraft(
    input.seed,
    region,
    cohort,
    draft,
  ));
  const totalPopulationUnits = populations.reduce(
    (sum, population) => sum + population.populationUnits,
    0,
  );
  const tidalAnchors = breadthTidalAnchors(populations);
  const base = {
    version: CORE_ECOLOGY_BREADTH_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
    cohortId: cohort.cohortId,
    cohortEpoch: cohort.introducedInEpoch,
    cohortDefinitionHash: cohort.definitionHash,
    region,
    regionId: stableRegionId(input.seed, region),
    sourceStableId: stableRegionObjectId(
      input.seed,
      region,
      "breadth-source",
      `${cohort.cohortId}:e${cohort.introducedInEpoch}`,
    ),
    terrainHash: regionTerrainHash(terrain),
    summary: analysis.summary,
    density: deepFreeze({
      regionalQuietRoll,
      regionalQuietThreshold,
      regionalQuiet,
    }),
    evaluatedSpeciesCount: cohort.species.length,
    populations: Object.freeze(populations),
    tidalAnchors,
    totalPopulationUnits,
    admittedSpeciesCount: populations.filter(
      ({ populationUnits }) => populationUnits > 0,
    ).length,
  } as const;
  const habitat = canonicalizeCoreEcologyBreadthHabitat({
    ...base,
    derivationHash: hashCanonical(base),
  });
  if (habitat === null) {
    throw new Error("Generated breadth habitat failed canonical validation");
  }
  return cacheHabitat(key, habitat);
}

export function canonicalizeCoreEcologyBreadthHabitat(
  value: unknown,
): CoreEcologyBreadthHabitat | null {
  if (typeof value === "object" && value !== null && TRUSTED_HABITATS.has(value)) {
    return value as CoreEcologyBreadthHabitat;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedSpeciesCount",
    "cohortDefinitionHash",
    "cohortEpoch",
    "cohortId",
    "density",
    "derivationHash",
    "derivationKind",
    "evaluatedSpeciesCount",
    "ownerId",
    "populations",
    "region",
    "regionId",
    "sourceStableId",
    "summary",
    "terrainHash",
    "tidalAnchors",
    "totalPopulationUnits",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_BREADTH_HABITAT_VERSION
    || value.ownerId !== CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID
    || value.derivationKind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
    || !validCohortId(value.cohortId)
  ) return null;
  const cohort = coreEcologyBreadthCohortDefinition(
    value.cohortId as CoreEcologyBreadthCohortId,
  );
  if (
    cohort === null
    || value.cohortEpoch !== cohort.introducedInEpoch
    || value.cohortDefinitionHash !== cohort.definitionHash
    || !isRegionCoord(value.region)
    || !validId(value.regionId)
    || !validId(value.sourceStableId)
    || !validHash(value.terrainHash)
    || !validHash(value.derivationHash)
    || value.evaluatedSpeciesCount !== cohort.species.length
    || !Array.isArray(value.populations)
    || value.populations.length !== cohort.species.length
    || !nonnegativeSafeInteger(value.totalPopulationUnits)
    || !nonnegativeSafeInteger(value.admittedSpeciesCount)
    || value.admittedSpeciesCount > cohort.species.length
  ) return null;
  const summary = canonicalSummary(value.summary);
  const density = canonicalDensity(value.density);
  if (summary === null || density === null) return null;
  const populations: CoreEcologyBreadthPopulationCandidate[] = [];
  const populationIds = new Set<string>();
  const populationKeys = new Set<string>();
  const anchorIds = new Set<string>();
  for (let index = 0; index < cohort.species.length; index += 1) {
    const profile = cohort.species[index];
    if (profile === undefined) return null;
    const candidate = canonicalPopulation(
      value.populations[index],
      value.region,
      cohort,
      profile,
      density,
      populationIds,
      populationKeys,
      anchorIds,
    );
    if (candidate === null) return null;
    populations.push(candidate);
  }
  const totalPopulationUnits = populations.reduce(
    (sum, candidate) => sum + candidate.populationUnits,
    0,
  );
  const admittedSpeciesCount = populations.filter(
    ({ populationUnits }) => populationUnits > 0,
  ).length;
  const tidalAnchors = breadthTidalAnchors(populations);
  if (
    totalPopulationUnits !== value.totalPopulationUnits
    || admittedSpeciesCount !== value.admittedSpeciesCount
    || stableStringify(tidalAnchors) !== stableStringify(value.tidalAnchors)
    || !dependenciesAreCoherent(populations, cohort)
  ) return null;
  const base = {
    version: CORE_ECOLOGY_BREADTH_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
    cohortId: cohort.cohortId,
    cohortEpoch: cohort.introducedInEpoch,
    cohortDefinitionHash: cohort.definitionHash,
    region: createRegionCoord(value.region.x, value.region.y),
    regionId: value.regionId,
    sourceStableId: value.sourceStableId,
    terrainHash: value.terrainHash,
    summary,
    density,
    evaluatedSpeciesCount: cohort.species.length,
    populations: Object.freeze(populations),
    tidalAnchors,
    totalPopulationUnits,
    admittedSpeciesCount,
  } as const;
  if (hashCanonical(base) !== value.derivationHash) return null;
  const habitat = deepFreeze({ ...base, derivationHash: value.derivationHash });
  TRUSTED_HABITATS.add(habitat);
  return habitat;
}

export function canonicalCoreEcologyBreadthHabitatForWorld(
  value: unknown,
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyBreadthHabitat | null {
  const habitat = canonicalizeCoreEcologyBreadthHabitat(value);
  if (habitat === null || !isRegionCoord(region)) return null;
  try {
    requireRootSeed(seed);
    const expected = deriveCoreEcologyBreadthHabitat({
      seed,
      region,
      cohortId: habitat.cohortId,
    });
    return stableStringify(habitat) === stableStringify(expected) ? habitat : null;
  } catch {
    return null;
  }
}

export function clearCoreEcologyBreadthHabitatCache(): void {
  HABITAT_CACHE.clear();
}

function analyzeTerrain(
  seed: RootSeed,
  region: RegionCoord,
  terrain: TerrainState,
  cohort: CoreEcologyBreadthCohortDefinition,
): Readonly<{
  readonly tiles: readonly AnalyzedBreadthTile[];
  readonly summary: CoreEcologyBreadthTerrainSummary;
}> {
  const shoreline = distanceField(terrain, (tile) => !isWaterTerrain(tile.terrain));
  const water = distanceField(terrain, (tile) => isWaterTerrain(tile.terrain));
  const tiles: AnalyzedBreadthTile[] = [];
  let waterTileCount = 0;
  let intertidalTileCount = 0;
  let dryShoreTileCount = 0;
  let shallowWaterTileCount = 0;
  let salineWaterTileCount = 0;
  let perchTileCount = 0;
  let waterSalinity = 0;
  let waterHeat = 0;

  for (const tile of terrain.tiles) {
    const global = regionLocalToGlobalTile(region, tile.x, tile.y);
    const climate = deriveBaselineBiomeClimate(
      seed,
      tile,
      WORLD_HEIGHT,
      0,
      global,
    );
    const lowTideDepth = Math.max(0, MIN_TIDE_LEVEL - tile.elevation);
    const highTideDepth = Math.max(0, MAX_TIDE_LEVEL - tile.elevation);
    const shorelineDistance = normalizedDistance(shoreline[tile.index]);
    const waterDistance = normalizedDistance(water[tile.index]);
    const isWater = isWaterTerrain(tile.terrain);
    if (isWater) {
      waterTileCount += 1;
      waterSalinity += climate.salinity;
      waterHeat += climate.heat;
      if (climate.salinity >= 240_000) salineWaterTileCount += 1;
    }
    if (
      tile.terrain === "tidal-flat"
      && highTideDepth > 0
      && lowTideDepth <= 35_000
    ) intertidalTileCount += 1;
    if (!isWater && waterDistance <= 10) dryShoreTileCount += 1;
    if (highTideDepth > 0 && highTideDepth <= 190_000) {
      shallowWaterTileCount += 1;
    }
    if (
      (tile.terrain === "meadow" || tile.terrain === "ridge")
      && waterDistance <= 18
    ) perchTileCount += 1;

    const signals: Readonly<Record<TileSignalKey, number>> = Object.freeze({
      cold: FIXED_POINT - climate.heat,
      dry: clampFixed(FIXED_POINT - ratioFixed(highTideDepth, 220_000)),
      elevation: clampFixed(tile.elevation),
      exposure: clampFixed(climate.exposure),
      heat: clampFixed(climate.heat),
      moisture: clampFixed(tile.moisture),
      roughness: clampFixed(tile.roughness),
      salinity: clampFixed(climate.salinity),
      "shallow-water": shallowWaterSignal(highTideDepth),
      "shore-proximity": proximitySignal(shorelineDistance, 20),
      tidal: tidalSignal(lowTideDepth, highTideDepth),
      water: isWater ? FIXED_POINT : 0,
      "water-proximity": proximitySignal(waterDistance, 20),
    });
    const scoreBySpecies = {} as Record<CoreEcologyBreadthSpecies, number>;
    const rankBySpecies = {} as Record<CoreEcologyBreadthSpecies, number>;
    for (const profile of cohort.species) {
      scoreBySpecies[profile.species] = tileEligible(profile, tile, {
        highTideDepth,
        lowTideDepth,
        salinity: climate.salinity,
        shorelineDistance,
        waterDistance,
      }) ? weightedSignals(signals, profile.signalWeights) : 0;
      rankBySpecies[profile.species] = keyedRandomU32(
        seed,
        BREADTH_ANCHOR_DOMAIN,
        global.x,
        global.y,
        semanticPurpose(`${cohort.cohortId}:${profile.species}`),
      );
    }
    tiles.push(Object.freeze({
      tile: Object.freeze({ ...tile }),
      globalX: global.x,
      globalY: global.y,
      heat: climate.heat,
      salinity: climate.salinity,
      exposure: climate.exposure,
      lowTideDepth,
      highTideDepth,
      shorelineDistance,
      waterDistance,
      signals,
      scoreBySpecies: Object.freeze(scoreBySpecies),
      rankBySpecies: Object.freeze(rankBySpecies),
    }));
  }
  const estuarySignal = fixedWeighted([
    [ratioFixed(waterTileCount, terrain.tiles.length), 3],
    [ratioFixed(intertidalTileCount, terrain.tiles.length), 4],
    [ratioFixed(dryShoreTileCount, terrain.tiles.length), 2],
    [ratioFixed(salineWaterTileCount, Math.max(1, waterTileCount)), 4],
  ]);
  const surfaceBreakSignal = fixedWeighted([
    [ratioFixed(shallowWaterTileCount, terrain.tiles.length), 4],
    [ratioFixed(perchTileCount, terrain.tiles.length), 2],
    [ratioFixed(intertidalTileCount, terrain.tiles.length), 3],
  ]);
  return deepFreeze({
    tiles,
    summary: {
      tileCount: terrain.tiles.length,
      waterTileCount,
      intertidalTileCount,
      dryShoreTileCount,
      shallowWaterTileCount,
      salineWaterTileCount,
      perchTileCount,
      averageWaterSalinity: waterTileCount === 0
        ? 0
        : Math.trunc(waterSalinity / waterTileCount),
      averageWaterHeat: waterTileCount === 0
        ? 0
        : Math.trunc(waterHeat / waterTileCount),
      estuarySignal,
      surfaceBreakSignal,
    },
  });
}

function declarativeRegionalPresenceThreshold(
  cohort: CoreEcologyBreadthCohortDefinition,
  tiles: readonly AnalyzedBreadthTile[],
): number {
  const policy = canonicalRegionalAdmission(cohort.regionalAdmission);
  if (cohort.definitionVersion !== 2 || policy === null) {
    throw new Error("Declarative breadth cohort has no authenticated admission policy");
  }
  let eligibleTileCount = 0;
  let eligibleQualitySum = 0;
  for (const tile of tiles) {
    let bestScore = 0;
    for (const profile of cohort.species) {
      const score = tile.scoreBySpecies[profile.species];
      if (score >= profile.minimumSiteScore) {
        bestScore = Math.max(bestScore, score);
      }
    }
    if (bestScore === 0) continue;
    eligibleTileCount += 1;
    eligibleQualitySum += bestScore;
  }
  if (eligibleTileCount === 0) return 0;
  const eligibleCoverage = ratioFixed(eligibleTileCount, tiles.length);
  const eligibleQuality = clampFixed(Math.trunc(
    eligibleQualitySum / eligibleTileCount,
  ));
  const presenceSignal = fixedWeighted([
    [eligibleCoverage, 3],
    [eligibleQuality, 2],
  ]);
  return Math.min(
    policy.maximumPresenceThreshold,
    policy.minimumPresenceThreshold + Math.trunc(
      presenceSignal * policy.presenceSignalRange / FIXED_POINT,
    ),
  );
}

function createDraft(
  seed: RootSeed,
  region: RegionCoord,
  cohort: CoreEcologyBreadthCohortDefinition,
  profile: CoreEcologyBreadthSpeciesDefinition,
  tiles: readonly AnalyzedBreadthTile[],
  regionalQuiet: boolean,
): CandidateDraft {
  const territory = deriveCoreEcologyBreadthTerritory(
    seed,
    cohort.cohortId,
    profile.species,
    region,
  );
  const suitableTiles = tiles.filter(
    (tile) => tile.scoreBySpecies[profile.species] >= profile.minimumSiteScore,
  );
  const persistentWaterRefugeTiles = profile.requiresPersistentWaterRefuge
    ? tiles.filter((tile) => (
        tile.scoreBySpecies[profile.species] > 0
        && tile.lowTideDepth >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
      ))
    : Object.freeze([]);
  const habitatScore = suitableTiles.length === 0
    ? 0
    : Math.trunc(suitableTiles.reduce(
        (sum, tile) => sum + tile.scoreBySpecies[profile.species],
        0,
      ) / suitableTiles.length);
  const weightedTiles = Math.trunc(suitableTiles.reduce(
    (sum, tile) => sum + tile.scoreBySpecies[profile.species],
    0,
  ) / FIXED_POINT);
  const rawCapacity = Math.min(
    profile.maximumPopulationUnits,
    Math.trunc(weightedTiles / profile.unitsPerWeightedTile),
  );
  const persistentWaterRefuge = persistentWaterRefugeTiles.length > 0;
  const habitatCapacity = rawCapacity < profile.minimumPopulationUnits
    || (profile.requiresPersistentWaterRefuge && !persistentWaterRefuge)
    ? 0
    : rawCapacity;
  const quality = habitatScore <= profile.minimumSiteScore
    ? 0
    : ratioFixed(
        habitatScore - profile.minimumSiteScore,
        FIXED_POINT - profile.minimumSiteScore,
      );
  const densityThreshold = Math.min(
    FIXED_POINT,
    profile.densityMinimum + Math.trunc(
      profile.densityQualityRange * quality / FIXED_POINT,
    ),
  );
  const densityRoll = keyedRandomInt(
    seed,
    BREADTH_DENSITY_DOMAIN,
    region.x,
    region.y,
    semanticPurpose(`${cohort.cohortId}:${profile.species}`),
    0,
    FIXED_POINT - 1,
  );
  let populationUnits = habitatCapacity;
  let admissionReason: CoreEcologyBreadthAdmissionReason = "admitted";
  if (habitatCapacity === 0) {
    populationUnits = 0;
    admissionReason = profile.requiresPersistentWaterRefuge
      && !persistentWaterRefuge
      && rawCapacity >= profile.minimumPopulationUnits
      ? "persistent-water-refuge-absent"
      : "habitat-capacity-zero";
  } else if (regionalQuiet) {
    populationUnits = 0;
    admissionReason = "regional-quiet";
  } else if (!territory.regionIsHost) {
    populationUnits = 0;
    admissionReason = "territory-owned-elsewhere";
  } else if (densityRoll >= densityThreshold) {
    populationUnits = 0;
    admissionReason = "density-roll-failed";
  }
  return {
    definition: profile,
    territory,
    suitableTiles,
    persistentWaterRefugeTiles,
    habitatScore,
    habitatCapacity,
    densityRoll,
    densityThreshold,
    populationUnits,
    dependencyPopulationKey: null,
    preySupportUnits: 0,
    trophicCeiling: profile.dependencySpecies === null
      ? habitatCapacity
      : 0,
    admissionReason,
  };
}

function applyDependencies(drafts: CandidateDraft[]): void {
  for (const draft of drafts) {
    const dependencySpecies = draft.definition.dependencySpecies;
    if (dependencySpecies === null) continue;
    const dependency = drafts.find(
      (candidate) => candidate.definition.species === dependencySpecies,
    );
    if (dependency === undefined) {
      throw new Error("Breadth cohort dependency is not ordered before its consumer");
    }
    draft.preySupportUnits = dependency.populationUnits;
    draft.dependencyPopulationKey = populationKeyFor(
      dependency.territory.hostRegion,
      dependency.territory.cohortId,
      dependency.definition.species,
    );
    draft.trophicCeiling = Math.min(
      draft.habitatCapacity,
      Math.trunc(
        dependency.populationUnits
          / draft.definition.dependencyUnitsPerPopulationUnit,
      ),
    );
    if (draft.populationUnits === 0) continue;
    draft.populationUnits = Math.min(draft.populationUnits, draft.trophicCeiling);
    if (draft.populationUnits < draft.definition.minimumPopulationUnits) {
      draft.populationUnits = 0;
      draft.admissionReason = dependency.populationUnits === 0
        ? "substrate-absent"
        : "group-size-insufficient";
    }
  }
}

function candidateFromDraft(
  seed: RootSeed,
  region: RegionCoord,
  cohort: CoreEcologyBreadthCohortDefinition,
  draft: CandidateDraft,
): CoreEcologyBreadthPopulationCandidate {
  const anchors = chooseAnchors(seed, region, cohort, draft);
  const profile = draft.definition;
  return deepFreeze({
    version: CORE_ECOLOGY_BREADTH_HABITAT_VERSION,
    stableId: stableRegionObjectId(
      seed,
      region,
      "breadth-population",
      `${cohort.cohortId}:${profile.species}`,
    ),
    populationKey: populationKeyFor(region, cohort.cohortId, profile.species),
    cohortId: cohort.cohortId,
    cohortEpoch: cohort.introducedInEpoch,
    species: profile.species,
    guild: profile.guild,
    actorRepresentation: profile.actorRepresentation,
    groupOrganization: profile.groupOrganization,
    territoryId: draft.territory.stableId,
    territoryHostRegion: draft.territory.hostRegion,
    territoryOwnedHere: draft.territory.regionIsHost,
    habitatScore: draft.habitatScore,
    suitableTileCount: draft.suitableTiles.length,
    habitatCapacity: draft.habitatCapacity,
    densityRoll: draft.densityRoll,
    densityThreshold: draft.densityThreshold,
    dependencySpecies: profile.dependencySpecies,
    dependencyPopulationKey: draft.dependencyPopulationKey,
    preySupportUnits: draft.preySupportUnits,
    trophicCeiling: draft.trophicCeiling,
    guildCeiling: profile.maximumPopulationUnits,
    populationUnits: draft.populationUnits,
    admissionReason: draft.admissionReason,
    activitySignal: {
      kind: profile.activityKind,
      intensity: draft.populationUnits === 0 ? 0 : draft.habitatScore,
      activePeriod: profile.activePeriod,
      source: "habitat-derived",
    },
    anchors,
  });
}

function chooseAnchors(
  seed: RootSeed,
  region: RegionCoord,
  cohort: CoreEcologyBreadthCohortDefinition,
  draft: CandidateDraft,
): readonly CoreEcologyBreadthPopulationAnchor[] {
  if (draft.populationUnits === 0) return Object.freeze([]);
  const profile = draft.definition;
  const desired = profile.actorRepresentation === "individual"
    ? draft.populationUnits
    : Math.min(
        profile.maximumAnchors,
        Math.max(1, Math.ceil(draft.populationUnits / profile.unitsPerAnchor)),
      );
  const ordered = [...draft.suitableTiles].sort((left, right) => (
    right.scoreBySpecies[profile.species] - left.scoreBySpecies[profile.species]
      || left.rankBySpecies[profile.species] - right.rankBySpecies[profile.species]
      || left.tile.index - right.tile.index
  ));
  const selected: AnalyzedBreadthTile[] = [];
  const minimumSquared = profile.minimumAnchorSeparationTiles ** 2;
  if (profile.requiresPersistentWaterRefuge) {
    const refuge = [...draft.persistentWaterRefugeTiles].sort((left, right) => (
      right.lowTideDepth - left.lowTideDepth
        || right.scoreBySpecies[profile.species] - left.scoreBySpecies[profile.species]
        || left.rankBySpecies[profile.species] - right.rankBySpecies[profile.species]
        || left.tile.index - right.tile.index
    ))[0];
    if (refuge === undefined) {
      throw new Error("Admitted aquatic breadth population lacks a persistent refuge");
    }
    selected.push(refuge);
  }
  for (const candidate of ordered) {
    if (selected.length === desired) break;
    if (selected.includes(candidate)) continue;
    if (selected.every((current) => {
      const x = current.tile.x - candidate.tile.x;
      const y = current.tile.y - candidate.tile.y;
      return x * x + y * y >= minimumSquared;
    })) selected.push(candidate);
    if (selected.length === desired) break;
  }
  for (const candidate of ordered) {
    if (selected.length === desired) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  if (selected.length !== desired) {
    throw new Error("Admitted breadth population cannot satisfy its bounded anchors");
  }
  const baseUnits = Math.trunc(draft.populationUnits / selected.length);
  const remainder = draft.populationUnits % selected.length;
  return Object.freeze(selected.map((entry, anchorOrdinal) => {
    const localUnitX = entry.tile.x * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const localUnitY = entry.tile.y * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    return deepFreeze({
      stableId: stableRegionObjectId(
        seed,
        region,
        "breadth-anchor",
        `${cohort.cohortId}:${profile.species}:${anchorOrdinal}`,
      ),
      anchorOrdinal,
      purpose: profile.anchorPurpose,
      medium: profile.anchorMedium,
      localX: entry.tile.x,
      localY: entry.tile.y,
      globalX: entry.globalX,
      globalY: entry.globalY,
      position: createWorldPosition(region, localUnitX, localUnitY),
      terrain: entry.tile.terrain,
      elevation: entry.tile.elevation,
      lowTideDepth: entry.lowTideDepth,
      highTideDepth: entry.highTideDepth,
      shorelineDistance: entry.shorelineDistance,
      waterDistance: entry.waterDistance,
      habitatScore: entry.scoreBySpecies[profile.species],
      allocatedPopulation: baseUnits + (anchorOrdinal < remainder ? 1 : 0),
    });
  }));
}

function breadthTidalAnchors(
  populations: readonly CoreEcologyBreadthPopulationCandidate[],
): readonly CoreEcologyBreadthTidalAnchor[] {
  return Object.freeze(populations.flatMap((population) => (
    population.actorRepresentation === "aggregate"
      && population.activitySignal.activePeriod === "tide-responsive"
      ? population.anchors.map((anchor) => deepFreeze({
          species: population.species,
          purpose: "population" as const,
          anchorOrdinal: anchor.anchorOrdinal,
          position: anchor.position,
          elevation: anchor.elevation,
        }))
      : []
  )));
}

function canonicalPopulation(
  value: unknown,
  region: RegionCoord,
  cohort: CoreEcologyBreadthCohortDefinition,
  profile: CoreEcologyBreadthSpeciesDefinition,
  density: CoreEcologyBreadthDensityAdmission,
  populationIds: Set<string>,
  populationKeys: Set<string>,
  anchorIds: Set<string>,
): CoreEcologyBreadthPopulationCandidate | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "activitySignal",
    "actorRepresentation",
    "admissionReason",
    "anchors",
    "cohortEpoch",
    "cohortId",
    "densityRoll",
    "densityThreshold",
    "dependencyPopulationKey",
    "dependencySpecies",
    "groupOrganization",
    "guild",
    "guildCeiling",
    "habitatCapacity",
    "habitatScore",
    "populationKey",
    "populationUnits",
    "preySupportUnits",
    "species",
    "stableId",
    "suitableTileCount",
    "territoryHostRegion",
    "territoryId",
    "territoryOwnedHere",
    "trophicCeiling",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_BREADTH_HABITAT_VERSION
    || value.cohortId !== cohort.cohortId
    || value.cohortEpoch !== cohort.introducedInEpoch
    || value.species !== profile.species
    || value.guild !== profile.guild
    || value.actorRepresentation !== profile.actorRepresentation
    || value.groupOrganization !== profile.groupOrganization
    || !validId(value.stableId)
    || populationIds.has(value.stableId)
    || !validId(value.populationKey)
    || populationKeys.has(value.populationKey)
    || !validId(value.territoryId)
    || !isRegionCoord(value.territoryHostRegion)
    || typeof value.territoryOwnedHere !== "boolean"
    || value.territoryOwnedHere !== (
      value.territoryHostRegion.x === region.x
        && value.territoryHostRegion.y === region.y
    )
    || !fixedInteger(value.habitatScore)
    || !nonnegativeSafeInteger(value.suitableTileCount)
    || value.suitableTileCount > WORLD_WIDTH * WORLD_HEIGHT
    || !nonnegativeSafeInteger(value.habitatCapacity)
    || value.habitatCapacity > profile.maximumPopulationUnits
    || !fixedInteger(value.densityRoll)
    || !fixedInteger(value.densityThreshold)
    || value.dependencySpecies !== profile.dependencySpecies
    || (value.dependencyPopulationKey !== null && !validId(value.dependencyPopulationKey))
    || !nonnegativeSafeInteger(value.preySupportUnits)
    || !nonnegativeSafeInteger(value.trophicCeiling)
    || value.trophicCeiling > value.habitatCapacity
    || value.guildCeiling !== profile.maximumPopulationUnits
    || !nonnegativeSafeInteger(value.populationUnits)
    || value.populationUnits > value.habitatCapacity
    || !ADMISSION_REASONS.has(value.admissionReason as CoreEcologyBreadthAdmissionReason)
    || !Array.isArray(value.anchors)
    || value.anchors.length > profile.maximumAnchors
  ) return null;
  const admitted = value.populationUnits > 0;
  if (
    admitted !== (value.admissionReason === "admitted")
    || admitted !== (value.anchors.length > 0)
    || (admitted && (!value.territoryOwnedHere || density.regionalQuiet))
    || (profile.groupOrganization === "flock"
      && admitted
      && value.populationUnits < profile.minimumPopulationUnits)
    || (profile.dependencySpecies === null
      && (value.dependencyPopulationKey !== null || value.preySupportUnits !== 0))
    || (profile.dependencySpecies !== null && value.dependencyPopulationKey === null)
  ) return null;
  let allocated = 0;
  const localTiles = new Set<number>();
  const anchors: CoreEcologyBreadthPopulationAnchor[] = [];
  for (let index = 0; index < value.anchors.length; index += 1) {
    const anchor = value.anchors[index];
    if (!plainRecord(anchor) || !exactKeys(anchor, [
      "allocatedPopulation",
      "anchorOrdinal",
      "elevation",
      "globalX",
      "globalY",
      "habitatScore",
      "highTideDepth",
      "localX",
      "localY",
      "lowTideDepth",
      "medium",
      "position",
      "purpose",
      "shorelineDistance",
      "stableId",
      "terrain",
      "waterDistance",
    ])) return null;
    if (
      anchor.anchorOrdinal !== index
      || !validId(anchor.stableId)
      || anchorIds.has(anchor.stableId)
      || anchor.purpose !== profile.anchorPurpose
      || anchor.medium !== profile.anchorMedium
      || !nonnegativeSafeInteger(anchor.localX)
      || anchor.localX >= WORLD_WIDTH
      || !nonnegativeSafeInteger(anchor.localY)
      || anchor.localY >= WORLD_HEIGHT
      || !signedSafeInteger(anchor.globalX)
      || !signedSafeInteger(anchor.globalY)
      || !isWorldPosition(anchor.position)
      || anchor.position.region.x !== region.x
      || anchor.position.region.y !== region.y
      || !TERRAIN_KINDS.has(anchor.terrain as TerrainKind)
      || !fixedInteger(anchor.elevation)
      || !nonnegativeSafeInteger(anchor.lowTideDepth)
      || !nonnegativeSafeInteger(anchor.highTideDepth)
      || !nonnegativeSafeInteger(anchor.shorelineDistance)
      || !nonnegativeSafeInteger(anchor.waterDistance)
      || !fixedInteger(anchor.habitatScore)
      || (
        anchor.habitatScore < profile.minimumSiteScore
        && !(
          profile.requiresPersistentWaterRefuge
          && index === 0
          && anchor.habitatScore > 0
          && anchor.lowTideDepth >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
        )
      )
      || !positiveSafeInteger(anchor.allocatedPopulation)
    ) return null;
    const global = regionLocalToGlobalTile(region, anchor.localX, anchor.localY);
    const localUnitX = anchor.localX * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const localUnitY = anchor.localY * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const tileIndex = anchor.localY * WORLD_WIDTH + anchor.localX;
    if (
      anchor.globalX !== global.x
      || anchor.globalY !== global.y
      || anchor.position.localX !== localUnitX
      || anchor.position.localY !== localUnitY
      || localTiles.has(tileIndex)
    ) return null;
    localTiles.add(tileIndex);
    anchorIds.add(anchor.stableId);
    allocated += anchor.allocatedPopulation;
    anchors.push(deepFreeze({
      stableId: anchor.stableId,
      anchorOrdinal: anchor.anchorOrdinal,
      purpose: anchor.purpose,
      medium: anchor.medium,
      localX: anchor.localX,
      localY: anchor.localY,
      globalX: anchor.globalX,
      globalY: anchor.globalY,
      position: createWorldPosition(region, localUnitX, localUnitY),
      terrain: anchor.terrain,
      elevation: anchor.elevation,
      lowTideDepth: anchor.lowTideDepth,
      highTideDepth: anchor.highTideDepth,
      shorelineDistance: anchor.shorelineDistance,
      waterDistance: anchor.waterDistance,
      habitatScore: anchor.habitatScore,
      allocatedPopulation: anchor.allocatedPopulation,
    }));
  }
  if (allocated !== value.populationUnits) return null;
  if (
    admitted
    && profile.requiresPersistentWaterRefuge
    && !anchors.some(({ lowTideDepth }) => (
      lowTideDepth >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
    ))
  ) return null;
  const activitySignal = canonicalActivitySignal(value.activitySignal, profile, admitted);
  if (activitySignal === null) return null;
  populationIds.add(value.stableId);
  populationKeys.add(value.populationKey);
  return deepFreeze({
    version: CORE_ECOLOGY_BREADTH_HABITAT_VERSION,
    stableId: value.stableId,
    populationKey: value.populationKey,
    cohortId: cohort.cohortId,
    cohortEpoch: cohort.introducedInEpoch,
    species: profile.species,
    guild: profile.guild,
    actorRepresentation: profile.actorRepresentation,
    groupOrganization: profile.groupOrganization,
    territoryId: value.territoryId,
    territoryHostRegion: createRegionCoord(
      value.territoryHostRegion.x,
      value.territoryHostRegion.y,
    ),
    territoryOwnedHere: value.territoryOwnedHere,
    habitatScore: value.habitatScore,
    suitableTileCount: value.suitableTileCount,
    habitatCapacity: value.habitatCapacity,
    densityRoll: value.densityRoll,
    densityThreshold: value.densityThreshold,
    dependencySpecies: profile.dependencySpecies,
    dependencyPopulationKey: value.dependencyPopulationKey,
    preySupportUnits: value.preySupportUnits,
    trophicCeiling: value.trophicCeiling,
    guildCeiling: value.guildCeiling,
    populationUnits: value.populationUnits,
    admissionReason: value.admissionReason as CoreEcologyBreadthAdmissionReason,
    activitySignal,
    anchors: Object.freeze(anchors),
  });
}

function dependenciesAreCoherent(
  populations: readonly CoreEcologyBreadthPopulationCandidate[],
  cohort: CoreEcologyBreadthCohortDefinition,
): boolean {
  for (const profile of cohort.species) {
    const population = populations.find(({ species }) => species === profile.species);
    if (population === undefined) return false;
    if (profile.dependencySpecies === null) continue;
    const dependency = populations.find(
      ({ species }) => species === profile.dependencySpecies,
    );
    if (
      dependency === undefined
      || population.dependencyPopulationKey !== dependency.populationKey
      || population.preySupportUnits !== dependency.populationUnits
      || population.trophicCeiling !== Math.min(
        population.habitatCapacity,
        Math.trunc(
          dependency.populationUnits / profile.dependencyUnitsPerPopulationUnit,
        ),
      )
      || population.populationUnits > population.trophicCeiling
      || (population.populationUnits > 0 && dependency.populationUnits === 0)
    ) return false;
  }
  return true;
}

function canonicalSummary(value: unknown): CoreEcologyBreadthTerrainSummary | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "averageWaterHeat",
    "averageWaterSalinity",
    "dryShoreTileCount",
    "estuarySignal",
    "intertidalTileCount",
    "perchTileCount",
    "salineWaterTileCount",
    "shallowWaterTileCount",
    "surfaceBreakSignal",
    "tileCount",
    "waterTileCount",
  ])) return null;
  const counts = [
    value.waterTileCount,
    value.intertidalTileCount,
    value.dryShoreTileCount,
    value.shallowWaterTileCount,
    value.salineWaterTileCount,
    value.perchTileCount,
  ];
  if (
    value.tileCount !== WORLD_WIDTH * WORLD_HEIGHT
    || counts.some((count) => !nonnegativeSafeInteger(count) || count > value.tileCount)
    || value.salineWaterTileCount > value.waterTileCount
    || !fixedInteger(value.averageWaterSalinity)
    || !fixedInteger(value.averageWaterHeat)
    || !fixedInteger(value.estuarySignal)
    || !fixedInteger(value.surfaceBreakSignal)
  ) return null;
  return deepFreeze({
    tileCount: value.tileCount,
    waterTileCount: value.waterTileCount,
    intertidalTileCount: value.intertidalTileCount,
    dryShoreTileCount: value.dryShoreTileCount,
    shallowWaterTileCount: value.shallowWaterTileCount,
    salineWaterTileCount: value.salineWaterTileCount,
    perchTileCount: value.perchTileCount,
    averageWaterSalinity: value.averageWaterSalinity,
    averageWaterHeat: value.averageWaterHeat,
    estuarySignal: value.estuarySignal,
    surfaceBreakSignal: value.surfaceBreakSignal,
  });
}

function canonicalRegionalAdmission(
  value: unknown,
): CoreEcologyBreadthRegionalAdmissionPolicy | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "maximumPresenceThreshold",
    "minimumPresenceThreshold",
    "presenceSignalRange",
    "signal",
    "version",
  ])) return null;
  if (
    value.version !== 1
    || value.signal !== "eligible-habitat"
    || !fixedInteger(value.minimumPresenceThreshold)
    || !fixedInteger(value.presenceSignalRange)
    || !fixedInteger(value.maximumPresenceThreshold)
    || value.maximumPresenceThreshold < value.minimumPresenceThreshold
  ) return null;
  return Object.freeze({
    version: 1,
    signal: "eligible-habitat",
    minimumPresenceThreshold: value.minimumPresenceThreshold,
    presenceSignalRange: value.presenceSignalRange,
    maximumPresenceThreshold: value.maximumPresenceThreshold,
  });
}

function canonicalDensity(value: unknown): CoreEcologyBreadthDensityAdmission | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "regionalQuiet",
    "regionalQuietRoll",
    "regionalQuietThreshold",
  ])) return null;
  if (
    !fixedInteger(value.regionalQuietRoll)
    || !fixedInteger(value.regionalQuietThreshold)
    || typeof value.regionalQuiet !== "boolean"
    || value.regionalQuiet !== (value.regionalQuietRoll >= value.regionalQuietThreshold)
  ) return null;
  return Object.freeze({
    regionalQuietRoll: value.regionalQuietRoll,
    regionalQuietThreshold: value.regionalQuietThreshold,
    regionalQuiet: value.regionalQuiet,
  });
}

function canonicalActivitySignal(
  value: unknown,
  profile: CoreEcologyBreadthSpeciesDefinition,
  admitted: boolean,
): CoreEcologyBreadthPopulationCandidate["activitySignal"] | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "activePeriod",
    "intensity",
    "kind",
    "source",
  ])) return null;
  if (
    value.kind !== profile.activityKind
    || value.activePeriod !== profile.activePeriod
    || value.source !== "habitat-derived"
    || !fixedInteger(value.intensity)
    || admitted !== (value.intensity > 0)
  ) return null;
  return Object.freeze({
    kind: profile.activityKind,
    intensity: value.intensity,
    activePeriod: profile.activePeriod,
    source: "habitat-derived",
  });
}

function tileEligible(
  profile: CoreEcologyBreadthSpeciesDefinition,
  tile: TerrainTile,
  state: Readonly<{
    highTideDepth: number;
    lowTideDepth: number;
    salinity: number;
    shorelineDistance: number;
    waterDistance: number;
  }>,
): boolean {
  return profile.allowedTerrain.includes(tile.terrain)
    && state.salinity >= profile.minimumSalinity
    && state.highTideDepth >= profile.minimumHighTideDepth
    && state.highTideDepth <= profile.maximumHighTideDepth
    && state.lowTideDepth <= profile.maximumLowTideDepth
    && state.shorelineDistance <= profile.maximumShoreDistanceTiles
    && state.waterDistance <= profile.maximumWaterDistanceTiles
    && tile.elevation >= profile.minimumElevation;
}

function weightedSignals(
  signals: Readonly<Record<TileSignalKey, number>>,
  weights: Readonly<Partial<Record<TileSignalKey, number>>>,
): number {
  let sum = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights) as [TileSignalKey, number][]) {
    sum += signals[key] * weight;
    weightSum += weight;
  }
  return weightSum === 0 ? 0 : clampFixed(Math.trunc(sum / weightSum));
}

function shallowWaterSignal(depth: number): number {
  if (depth <= 0 || depth > 260_000) return 0;
  const center = 95_000;
  return clampFixed(FIXED_POINT - Math.trunc(
    Math.abs(depth - center) * FIXED_POINT / 165_000,
  ));
}

function tidalSignal(lowDepth: number, highDepth: number): number {
  if (highDepth <= lowDepth) return 0;
  return clampFixed(ratioFixed(highDepth - lowDepth, MAX_TIDE_LEVEL - MIN_TIDE_LEVEL));
}

function proximitySignal(distance: number, maximum: number): number {
  return distance > maximum
    ? 0
    : clampFixed(FIXED_POINT - Math.trunc(distance * FIXED_POINT / (maximum + 1)));
}

function distanceField(
  terrain: TerrainState,
  source: (tile: TerrainTile) => boolean,
): Int16Array {
  const distances = new Int16Array(terrain.tiles.length);
  distances.fill(-1);
  const queue = new Int32Array(terrain.tiles.length);
  let head = 0;
  let tail = 0;
  for (const tile of terrain.tiles) {
    if (!source(tile)) continue;
    distances[tile.index] = 0;
    queue[tail] = tile.index;
    tail += 1;
  }
  while (head < tail) {
    const index = queue[head]!;
    head += 1;
    const x = index % terrain.width;
    const y = Math.trunc(index / terrain.width);
    const nextDistance = distances[index]! + 1;
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < terrain.width ? index + 1 : -1,
      y > 0 ? index - terrain.width : -1,
      y + 1 < terrain.height ? index + terrain.width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || distances[neighbor] !== -1) continue;
      distances[neighbor] = nextDistance;
      queue[tail] = neighbor;
      tail += 1;
    }
  }
  return distances;
}

function normalizedDistance(value: number | undefined): number {
  return value === undefined || value < 0 ? WORLD_WIDTH + WORLD_HEIGHT : value;
}

function isWaterTerrain(terrain: TerrainKind): boolean {
  return terrain === "deep-water" || terrain === "tidal-flat";
}

function canonicalTerrain(
  seed: RootSeed,
  region: RegionCoord,
  supplied: TerrainState | undefined,
): TerrainState {
  const generated = generateRegionTerrain(seed, region);
  if (supplied === undefined) return generated;
  if (
    supplied.width !== WORLD_WIDTH
    || supplied.height !== WORLD_HEIGHT
    || supplied.tiles.length !== generated.tiles.length
  ) throw new TypeError("Supplied breadth terrain has noncanonical dimensions");
  const ordered = [...supplied.tiles].sort((left, right) => left.index - right.index);
  if (
    ordered.some((tile, index) => tile.index !== index)
    || stableStringify({ width: supplied.width, height: supplied.height, tiles: ordered })
      !== stableStringify(generated)
  ) throw new TypeError("Supplied breadth terrain is not the canonical terrain multiset");
  return generated;
}

function canonicalSpeciesOrder(
  cohort: CoreEcologyBreadthCohortDefinition,
  value: readonly CoreEcologyBreadthSpecies[] | undefined,
): readonly CoreEcologyBreadthSpecies[] {
  const supplied = value ?? cohort.species.map(({ species }) => species);
  if (!Array.isArray(supplied)) throw new TypeError("Breadth species order must be an array");
  const expected = new Set(cohort.species.map(({ species }) => species));
  const actual = new Set<CoreEcologyBreadthSpecies>();
  for (const species of supplied) {
    if (!expected.has(species)) throw new TypeError("Breadth species order contains another cohort");
    if (actual.has(species)) throw new TypeError("Breadth species order duplicates a cohort member");
    actual.add(species);
  }
  if (
    supplied.length !== expected.size
    || actual.size !== expected.size
    || [...expected].some((species) => !actual.has(species))
  ) {
    throw new TypeError("Breadth habitat requires the complete cohort species set");
  }
  return Object.freeze(cohort.species.map(({ species }) => species));
}

function requireCohort(
  cohortId: CoreEcologyBreadthCohortId,
): CoreEcologyBreadthCohortDefinition {
  const cohort = coreEcologyBreadthCohortDefinition(cohortId);
  if (cohort === null) throw new TypeError("Unknown breadth ecology cohort");
  return cohort;
}

function populationKeyFor(
  region: RegionCoord,
  cohortId: CoreEcologyBreadthCohortId,
  species: CoreEcologyBreadthSpecies,
): string {
  return `br1:${hashCanonical([region.x, region.y, cohortId, species])}:${species}`;
}

function floorAddress(value: number, divisor: number): number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw new RangeError("Breadth territory address must be a canonical safe integer");
  }
  return Math.floor(value / divisor);
}

function territoryBounds(
  address: Readonly<{ readonly x: number; readonly y: number }>,
  span: number,
): Readonly<{ readonly minimum: RegionCoord; readonly maximum: RegionCoord }> {
  const rawMinimumX = address.x * span;
  const rawMinimumY = address.y * span;
  const rawMaximumX = rawMinimumX + span - 1;
  const rawMaximumY = rawMinimumY + span - 1;
  const minimumX = Math.max(-REGION_COORD_LIMIT, rawMinimumX);
  const minimumY = Math.max(-REGION_COORD_LIMIT, rawMinimumY);
  return Object.freeze({
    minimum: createRegionCoord(minimumX, minimumY),
    maximum: createRegionCoord(
      Math.min(REGION_COORD_LIMIT, rawMaximumX),
      Math.min(REGION_COORD_LIMIT, rawMaximumY),
    ),
  });
}

function cacheKey(
  seed: RootSeed,
  region: RegionCoord,
  cohort: CoreEcologyBreadthCohortDefinition,
): string {
  return hashCanonical([
    CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID,
    cohort.cohortId,
    cohort.introducedInEpoch,
    cohort.definitionHash,
    seed,
    region.x,
    region.y,
  ]);
}

function cacheHabitat(
  key: string,
  habitat: CoreEcologyBreadthHabitat,
): CoreEcologyBreadthHabitat {
  HABITAT_CACHE.delete(key);
  HABITAT_CACHE.set(key, habitat);
  while (HABITAT_CACHE.size > CORE_ECOLOGY_BREADTH_HABITAT_CACHE_LIMIT) {
    const oldest = HABITAT_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    HABITAT_CACHE.delete(oldest);
  }
  return habitat;
}

function clampFixed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function ratioFixed(numerator: number, denominator: number): number {
  if (numerator <= 0 || denominator <= 0) return 0;
  return clampFixed(Math.trunc(numerator * FIXED_POINT / denominator));
}

function fixedWeighted(values: readonly (readonly [number, number])[]): number {
  let sum = 0;
  let weights = 0;
  for (const [value, weight] of values) {
    sum += clampFixed(value) * weight;
    weights += weight;
  }
  return weights === 0 ? 0 : clampFixed(Math.trunc(sum / weights));
}

function semanticPurpose(value: string): number {
  return Number.parseInt(hashCanonical(value).slice(0, 8), 16) >>> 0;
}

function requireRootSeed(value: RootSeed): void {
  if (
    !Array.isArray(value)
    || value.length !== 4
    || value.some((word) => !Number.isSafeInteger(word) || word < 0 || word > UINT32_MAX)
  ) throw new TypeError("Breadth habitat requires a canonical root seed");
}

function validCohortId(value: unknown): value is string {
  return typeof value === "string"
    && /^[a-z][a-z0-9-]{0,63}$/u.test(value)
    && value === value.normalize("NFC");
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function signedSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0);
}

function fixedInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function plainRecord(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, any>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return stableStringify(actual) === stableStringify(expected);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

const ADMISSION_REASONS: ReadonlySet<CoreEcologyBreadthAdmissionReason> = new Set([
  "admitted",
  "density-roll-failed",
  "group-size-insufficient",
  "habitat-capacity-zero",
  "persistent-water-refuge-absent",
  "regional-quiet",
  "substrate-absent",
  "territory-owned-elsewhere",
]);

const TERRAIN_KINDS: ReadonlySet<TerrainKind> = new Set([
  "deep-water",
  "marsh",
  "meadow",
  "ridge",
  "tidal-flat",
]);
