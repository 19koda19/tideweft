import {
  CORE_WILDLIFE_SPECIES,
  getCoreWildlifeProfile,
  getCoreWildlifeSpeciesMetadata,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { deriveBiomeProfile, deriveMagicalWaterInfluence, type BiomeId } from "../sim/biomes";
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
import { isCoreEcologyAggregateSpecies } from "./coreEcologyAggregatePolicy";
import {
  CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH,
  CORE_ECOLOGY_RIVER_OTTER_MAXIMUM_FORAGING_DEPTH,
  CORE_ECOLOGY_RIVER_OTTER_MINIMUM_FORAGING_DEPTH,
  CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH,
  CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH,
  type CoreEcologyTidalWebHabitatAnchor,
} from "./coreEcologyHabitat";
import { LIVING_SPECIES_CATALOG, livingSpeciesModule } from "./livingSpeciesCatalog";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_REGIONAL_HABITAT_VERSION = 1 as const;
export const CORE_ECOLOGY_REGIONAL_HABITAT_OWNER_ID =
  "game:core-ecology-regional-habitat:v1" as const;
export const CORE_ECOLOGY_REGIONAL_CELL_SPAN = 2 as const;
export const CORE_ECOLOGY_REGIONAL_HABITAT_CACHE_LIMIT = 128 as const;

export const CORE_ECOLOGY_DOMESTIC_SPECIES: readonly CoreWildlifeSpecies[] = Object.freeze([
  "domestic-cat",
  "domestic-chicken",
  "domestic-goat",
]);

const DOMESTIC_SPECIES = new Set<CoreWildlifeSpecies>(CORE_ECOLOGY_DOMESTIC_SPECIES);
const LARGE_TERRESTRIAL_PREDATORS: readonly CoreWildlifeSpecies[] = Object.freeze([
  "black-bear",
  "brown-bear",
  "cougar",
  "gray-wolf",
]);
const LARGE_TERRESTRIAL_PREDATOR_SET = new Set<CoreWildlifeSpecies>(
  LARGE_TERRESTRIAL_PREDATORS,
);

export const CORE_ECOLOGY_REGIONAL_WILD_SPECIES: readonly CoreWildlifeSpecies[] =
  Object.freeze(
    CORE_WILDLIFE_SPECIES.filter((species) => !DOMESTIC_SPECIES.has(species)).sort(compareText),
  );

export type CoreEcologyRegionalGuild =
  | "aerial-forager"
  | "apex-predator"
  | "aquatic-prey"
  | "large-herbivore"
  | "large-omnivore"
  | "mesopredator"
  | "small-prey"
  | "tidal-detritivore"
  | "wetland-bird";

export type CoreEcologyPopulationAdmissionReason =
  | "admitted"
  | "density-budget-exhausted"
  | "density-roll-failed"
  | "habitat-capacity-zero"
  | "regional-quiet"
  | "territory-owned-elsewhere"
  | "unsupported-predator";

export interface CoreEcologyRegionalCellAddress {
  readonly x: number;
  readonly y: number;
}

export interface CoreEcologyRegionalBounds {
  readonly minimum: RegionCoord;
  readonly maximum: RegionCoord;
}

export interface CoreEcologyRegionalCellIdentity {
  readonly version: typeof CORE_ECOLOGY_REGIONAL_HABITAT_VERSION;
  readonly stableId: string;
  readonly address: CoreEcologyRegionalCellAddress;
  readonly spanRegions: typeof CORE_ECOLOGY_REGIONAL_CELL_SPAN;
  readonly bounds: CoreEcologyRegionalBounds;
}

export interface CoreEcologyRegionalTerritory {
  readonly version: typeof CORE_ECOLOGY_REGIONAL_HABITAT_VERSION;
  readonly stableId: string;
  readonly species: CoreWildlifeSpecies;
  readonly guild: CoreEcologyRegionalGuild;
  readonly address: CoreEcologyRegionalCellAddress;
  readonly spanRegions: number;
  readonly bounds: CoreEcologyRegionalBounds;
  readonly hostRegion: RegionCoord;
  readonly regionIsHost: boolean;
}

export interface CoreEcologyRegionalTerrainSummary {
  readonly tileCount: number;
  readonly terrainTileCounts: Readonly<Record<TerrainKind, number>>;
  readonly biomeTileCounts: Readonly<Record<BiomeId, number>>;
  readonly shoreTileCount: number;
  readonly averageElevation: number;
  readonly averageMoisture: number;
  readonly averageRoughness: number;
  readonly averageRainfall: number;
  readonly averageHeat: number;
  readonly averageExposure: number;
  readonly terrestrialProductivity: number;
  readonly aquaticProductivity: number;
  readonly cover: number;
  readonly terrainDiversity: number;
  readonly carryingSignal: number;
}

export interface CoreEcologyRegionalDensityAdmission {
  readonly regionalQuietRoll: number;
  readonly regionalQuietThreshold: number;
  readonly regionalQuiet: boolean;
  readonly guildCeilings: Readonly<Record<CoreEcologyRegionalGuild, number>>;
}

export interface CoreEcologyRegionalPopulationAnchor {
  readonly stableId: string;
  readonly localX: number;
  readonly localY: number;
  readonly globalX: number;
  readonly globalY: number;
  readonly habitatScore: number;
  readonly allocatedPopulation: number;
}

export interface CoreEcologyRegionalPopulationCandidate {
  readonly version: typeof CORE_ECOLOGY_REGIONAL_HABITAT_VERSION;
  readonly stableId: string;
  readonly populationKey: string;
  readonly species: CoreWildlifeSpecies;
  readonly guild: CoreEcologyRegionalGuild;
  readonly actorRepresentation: "individual" | "aggregate";
  readonly territoryId: string;
  readonly territoryHostRegion: RegionCoord;
  readonly territoryOwnedHere: boolean;
  readonly habitatScore: number;
  readonly suitableTileCount: number;
  readonly habitatCapacity: number;
  readonly densityRoll: number;
  readonly densityThreshold: number;
  readonly preySupportUnits: number;
  readonly trophicCeiling: number;
  readonly guildCeiling: number;
  readonly populationUnits: number;
  readonly admissionReason: CoreEcologyPopulationAdmissionReason;
  readonly anchors: readonly CoreEcologyRegionalPopulationAnchor[];
}

export interface CoreEcologyRegionalHabitat {
  readonly version: typeof CORE_ECOLOGY_REGIONAL_HABITAT_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_REGIONAL_HABITAT_OWNER_ID;
  readonly region: RegionCoord;
  readonly regionId: string;
  readonly terrainHash: string;
  readonly cell: CoreEcologyRegionalCellIdentity;
  readonly summary: CoreEcologyRegionalTerrainSummary;
  readonly density: CoreEcologyRegionalDensityAdmission;
  readonly catalogSpeciesCount: number;
  readonly evaluatedWildSpeciesCount: number;
  readonly populations: readonly CoreEcologyRegionalPopulationCandidate[];
  readonly totalPopulationUnits: number;
  readonly admittedSpeciesCount: number;
  readonly derivationHash: string;
}

export type CoreEcologyRegionalActivitySpecies =
  | "fish-crow"
  | "northern-harrier"
  | "snowy-egret"
  | "american-black-duck"
  | "north-american-river-otter"
  | "gull";

export interface DeriveCoreEcologyRegionalActivityAnchorsInput {
  readonly seed: RootSeed;
  /** Must be the exact seed/region-derived regional habitat authority. */
  readonly habitat: CoreEcologyRegionalHabitat;
  readonly species: CoreEcologyRegionalActivitySpecies;
  /** Exact resident/adoption anchor; current actor position is not authority. */
  readonly homeAnchor: WorldPosition;
}

export interface CoreEcologyRegionalActivityAnchors {
  readonly homeAnchor: WorldPosition;
  readonly tidalAnchors: readonly CoreEcologyTidalWebHabitatAnchor[];
}

export interface DeriveCoreEcologyRegionalHabitatInput {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  /** Optional canonical baseline supplied by a streaming owner to avoid regenerating it. */
  readonly terrain?: TerrainState;
  /** Tests/integrators may vary iteration order; output remains canonical. */
  readonly speciesOrder?: readonly CoreWildlifeSpecies[];
}

interface GuildRule {
  readonly territorySpan: number;
  readonly minimumSiteScore: number;
  readonly tilesPerPopulationUnit: number;
  readonly maximumPopulationUnits: number;
  readonly maximumAnchors: number;
  readonly anchorSeparation: number;
  readonly minimumOccurrence: number;
  readonly occurrenceRange: number;
  readonly preyUnitsPerPredator: number;
}

const GUILD_RULES: Readonly<Record<CoreEcologyRegionalGuild, GuildRule>> = Object.freeze({
  "aerial-forager": rule(1, 340_000, 260, 12, 3, 8, 210_000, 670_000, 0),
  "apex-predator": rule(5, 500_000, 2_100, 2, 2, 20, 70_000, 500_000, 30),
  "aquatic-prey": rule(1, 390_000, 65, 48, 3, 10, 290_000, 650_000, 0),
  "large-herbivore": rule(2, 440_000, 480, 14, 3, 14, 170_000, 620_000, 0),
  "large-omnivore": rule(3, 470_000, 1_250, 4, 2, 18, 90_000, 520_000, 35),
  mesopredator: rule(2, 430_000, 820, 3, 2, 14, 140_000, 580_000, 10),
  "small-prey": rule(1, 370_000, 70, 72, 3, 7, 290_000, 660_000, 0),
  "tidal-detritivore": rule(1, 390_000, 55, 64, 3, 7, 310_000, 640_000, 0),
  "wetland-bird": rule(2, 410_000, 520, 6, 2, 12, 150_000, 620_000, 0),
});

const REGIONAL_DOMAIN = 0x5248_4231;
const TERRITORY_DOMAIN = 0x5248_5431;
const DENSITY_DOMAIN = 0x5248_4431;
const ANCHOR_DOMAIN = 0x5248_4131;
const REGIONAL_HABITAT_CACHE = new Map<string, CoreEcologyRegionalHabitat>();
/** Sparse authority: habitat capacity permits life; it does not require occupancy. */
const REGIONAL_OCCURRENCE_DENSITY_DIVISOR = 3;
/** One aggregate field anchor can represent many non-actor units without a visual pile. */
const REGIONAL_AGGREGATE_MAX_ANCHORS = 1;

function rule(
  territorySpan: number,
  minimumSiteScore: number,
  tilesPerPopulationUnit: number,
  maximumPopulationUnits: number,
  maximumAnchors: number,
  anchorSeparation: number,
  minimumOccurrence: number,
  occurrenceRange: number,
  preyUnitsPerPredator: number,
): GuildRule {
  return Object.freeze({
    territorySpan,
    minimumSiteScore,
    tilesPerPopulationUnit,
    maximumPopulationUnits,
    maximumAnchors,
    anchorSeparation,
    minimumOccurrence,
    occurrenceRange,
    preyUnitsPerPredator,
  });
}

interface AnalyzedTile {
  readonly tile: TerrainTile;
  readonly globalX: number;
  readonly globalY: number;
  readonly biome: ReturnType<typeof deriveBiomeProfile>;
}

interface TerrainAnalysis {
  readonly terrain: TerrainState;
  readonly terrainHash: string;
  readonly summary: CoreEcologyRegionalTerrainSummary;
  readonly tiles: readonly AnalyzedTile[];
}

interface ScoredTile {
  readonly tile: AnalyzedTile;
  readonly score: number;
  readonly rank: number;
}

interface CandidateDraft {
  readonly species: CoreWildlifeSpecies;
  readonly guild: CoreEcologyRegionalGuild;
  readonly territory: CoreEcologyRegionalTerritory;
  readonly habitatScore: number;
  readonly suitableTiles: readonly ScoredTile[];
  readonly habitatCapacity: number;
  readonly densityRoll: number;
  readonly densityThreshold: number;
  readonly proposedPopulation: number;
  readonly admissionRank: number;
  populationUnits: number;
  preySupportUnits: number;
  trophicCeiling: number;
  admissionReason: CoreEcologyPopulationAdmissionReason;
}

function clampFixed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function fixedWeighted(values: readonly (readonly [number, number])[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const [value, weight] of values) {
    weighted += clampFixed(value) * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : clampFixed(Math.trunc(weighted / totalWeight));
}

function semanticPurpose(value: string): number {
  return Number.parseInt(hashCanonical(value).slice(0, 8), 16) >>> 0;
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

function assertRegion(region: RegionCoord): void {
  if (!isRegionCoord(region)) throw new RangeError("Regional habitat requires a canonical region");
}

/** Mathematical floor division, including regions west/north of the origin. */
export function coreEcologyRegionalFloorDivide(value: number, divisor: number): number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw new RangeError("Dividend must be a canonical safe integer");
  }
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new RangeError("Divisor must be a positive safe integer");
  }
  const result = Math.floor(value / divisor);
  return Object.is(result, -0) ? 0 : result;
}

function addressBounds(address: CoreEcologyRegionalCellAddress, span: number): CoreEcologyRegionalBounds {
  const rawMinimumX = address.x * span;
  const rawMinimumY = address.y * span;
  const rawMaximumX = rawMinimumX + span - 1;
  const rawMaximumY = rawMinimumY + span - 1;
  return Object.freeze({
    minimum: createRegionCoord(
      Math.max(-REGION_COORD_LIMIT, rawMinimumX),
      Math.max(-REGION_COORD_LIMIT, rawMinimumY),
    ),
    maximum: createRegionCoord(
      Math.min(REGION_COORD_LIMIT, rawMaximumX),
      Math.min(REGION_COORD_LIMIT, rawMaximumY),
    ),
  });
}

export function deriveCoreEcologyRegionalCellIdentity(
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyRegionalCellIdentity {
  assertRegion(region);
  const address = Object.freeze({
    x: coreEcologyRegionalFloorDivide(region.x, CORE_ECOLOGY_REGIONAL_CELL_SPAN),
    y: coreEcologyRegionalFloorDivide(region.y, CORE_ECOLOGY_REGIONAL_CELL_SPAN),
  });
  const bounds = addressBounds(address, CORE_ECOLOGY_REGIONAL_CELL_SPAN);
  return freezeDeep({
    version: CORE_ECOLOGY_REGIONAL_HABITAT_VERSION,
    stableId: stableRegionObjectId(
      seed,
      bounds.minimum,
      "ecology-cell",
      `v1:${address.x}:${address.y}`,
    ),
    address,
    spanRegions: CORE_ECOLOGY_REGIONAL_CELL_SPAN,
    bounds,
  });
}

export function coreEcologyRegionalGuildForSpecies(
  species: CoreWildlifeSpecies,
): CoreEcologyRegionalGuild {
  if (DOMESTIC_SPECIES.has(species)) {
    throw new TypeError(`Domestic species ${species} has no wild regional guild`);
  }
  const metadata = getCoreWildlifeSpeciesMetadata(species);
  const roles = getCoreWildlifeProfile(species).roles;
  if (roles.includes("small-predator")) return "mesopredator";
  if (roles.includes("small-prey")) {
    if (metadata.taxonomicClass === "fish") return "aquatic-prey";
    if (metadata.dietClass === "detritivore") return "tidal-detritivore";
    if (metadata.taxonomicClass === "bird") return "wetland-bird";
    return "small-prey";
  }
  if (metadata.groupOrganization === "herd" && metadata.dietClass === "herbivore") {
    return "large-herbivore";
  }
  if (metadata.groupOrganization === "sounder") return "large-omnivore";
  if (metadata.taxonomicClass === "bird") {
    return metadata.locomotionClass === "amphibious" ? "wetland-bird" : "aerial-forager";
  }
  if (metadata.dietClass === "omnivore" && metadata.locomotionClass === "terrestrial") {
    return "large-omnivore";
  }
  if (roles.includes("predator") && metadata.dietClass === "carnivore") {
    return "apex-predator";
  }
  throw new TypeError(`No regional guild is defined for ${species}`);
}

export function deriveCoreEcologyRegionalTerritory(
  seed: RootSeed,
  species: CoreWildlifeSpecies,
  region: RegionCoord,
): CoreEcologyRegionalTerritory {
  assertRegion(region);
  const guild = coreEcologyRegionalGuildForSpecies(species);
  if (LARGE_TERRESTRIAL_PREDATOR_SET.has(species)) {
    const radius = 2;
    let hostRegion = region;
    let hostPriority = keyedRandomU32(
      seed,
      TERRITORY_DOMAIN,
      region.x,
      region.y,
      semanticPurpose("large-predator-site-priority"),
    );
    const minimumX = Math.max(-REGION_COORD_LIMIT, region.x - radius);
    const maximumX = Math.min(REGION_COORD_LIMIT, region.x + radius);
    const minimumY = Math.max(-REGION_COORD_LIMIT, region.y - radius);
    const maximumY = Math.min(REGION_COORD_LIMIT, region.y + radius);
    for (let y = minimumY; y <= maximumY; y += 1) {
      for (let x = minimumX; x <= maximumX; x += 1) {
        const candidatePriority = keyedRandomU32(
          seed,
          TERRITORY_DOMAIN,
          x,
          y,
          semanticPurpose("large-predator-site-priority"),
        );
        if (
          candidatePriority > hostPriority
          || (candidatePriority === hostPriority
            && (x < hostRegion.x || (x === hostRegion.x && y < hostRegion.y)))
        ) {
          hostRegion = createRegionCoord(x, y);
          hostPriority = candidatePriority;
        }
      }
    }
    const winner = LARGE_TERRESTRIAL_PREDATORS[keyedRandomInt(
      seed,
      TERRITORY_DOMAIN,
      hostRegion.x,
      hostRegion.y,
      semanticPurpose("large-predator-species-priority"),
      0,
      LARGE_TERRESTRIAL_PREDATORS.length - 1,
    )];
    if (winner === undefined) throw new Error("Large-predator winner selection failed");
    const bounds = Object.freeze({
      minimum: createRegionCoord(
        Math.max(-REGION_COORD_LIMIT, hostRegion.x - radius),
        Math.max(-REGION_COORD_LIMIT, hostRegion.y - radius),
      ),
      maximum: createRegionCoord(
        Math.min(REGION_COORD_LIMIT, hostRegion.x + radius),
        Math.min(REGION_COORD_LIMIT, hostRegion.y + radius),
      ),
    });
    return freezeDeep({
      version: CORE_ECOLOGY_REGIONAL_HABITAT_VERSION,
      stableId: stableRegionObjectId(seed, hostRegion, "wild-territory", "large-predator"),
      species,
      guild,
      address: Object.freeze({ x: hostRegion.x, y: hostRegion.y }),
      spanRegions: radius * 2 + 1,
      bounds,
      hostRegion,
      regionIsHost:
        hostRegion.x === region.x
        && hostRegion.y === region.y
        && winner === species,
    });
  }
  const spanRegions = GUILD_RULES[guild].territorySpan;
  const address = Object.freeze({
    x: coreEcologyRegionalFloorDivide(region.x, spanRegions),
    y: coreEcologyRegionalFloorDivide(region.y, spanRegions),
  });
  const bounds = addressBounds(address, spanRegions);
  const width = bounds.maximum.x - bounds.minimum.x + 1;
  const height = bounds.maximum.y - bounds.minimum.y + 1;
  const hostOrdinal = keyedRandomInt(
    seed,
    TERRITORY_DOMAIN,
    address.x,
    address.y,
    semanticPurpose(`territory-host:${species}`),
    0,
    width * height - 1,
  );
  const hostRegion = createRegionCoord(
    bounds.minimum.x + (hostOrdinal % width),
    bounds.minimum.y + Math.floor(hostOrdinal / width),
  );
  return freezeDeep({
    version: CORE_ECOLOGY_REGIONAL_HABITAT_VERSION,
    stableId: stableRegionObjectId(seed, hostRegion, "wild-territory", species),
    species,
    guild,
    address,
    spanRegions,
    bounds,
    hostRegion,
    regionIsHost: hostRegion.x === region.x && hostRegion.y === region.y,
  });
}

function emptyTerrainCounts(): Record<TerrainKind, number> {
  return {
    "deep-water": 0,
    "tidal-flat": 0,
    marsh: 0,
    meadow: 0,
    ridge: 0,
  };
}

function emptyBiomeCounts(): Record<BiomeId, number> {
  return {
    "tide-channel": 0,
    "brine-flat": 0,
    "reed-marsh": 0,
    "rain-meadow": 0,
    "sun-meadow": 0,
    "wind-ridge": 0,
    glimmerfen: 0,
  };
}

function isWaterTerrain(terrain: TerrainKind): boolean {
  return terrain === "deep-water" || terrain === "tidal-flat" || terrain === "marsh";
}

function terrainAt(terrain: TerrainState, x: number, y: number): TerrainTile | null {
  if (x < 0 || x >= terrain.width || y < 0 || y >= terrain.height) return null;
  return terrain.tiles[y * terrain.width + x] ?? null;
}

function isShoreTile(terrain: TerrainState, tile: TerrainTile): boolean {
  const wet = isWaterTerrain(tile.terrain);
  const neighbors = [
    terrainAt(terrain, tile.x - 1, tile.y),
    terrainAt(terrain, tile.x + 1, tile.y),
    terrainAt(terrain, tile.x, tile.y - 1),
    terrainAt(terrain, tile.x, tile.y + 1),
  ];
  return neighbors.some((neighbor) => neighbor !== null && isWaterTerrain(neighbor.terrain) !== wet);
}

function analyzeTerrain(
  seed: RootSeed,
  region: RegionCoord,
  suppliedTerrain: TerrainState | undefined,
): TerrainAnalysis {
  const canonical = generateRegionTerrain(seed, region);
  if (suppliedTerrain !== undefined) {
    if (
      suppliedTerrain.width !== WORLD_WIDTH
      || suppliedTerrain.height !== WORLD_HEIGHT
      || suppliedTerrain.tiles.length !== WORLD_WIDTH * WORLD_HEIGHT
      || regionTerrainHash(suppliedTerrain) !== regionTerrainHash(canonical)
    ) {
      throw new TypeError("Supplied regional terrain is not the canonical baseline for this seed/region");
    }
  }
  const terrain = suppliedTerrain ?? canonical;
  const terrainTileCounts = emptyTerrainCounts();
  const biomeTileCounts = emptyBiomeCounts();
  const tiles: AnalyzedTile[] = [];
  let elevation = 0;
  let moisture = 0;
  let roughness = 0;
  let rainfall = 0;
  let heat = 0;
  let exposure = 0;
  let shoreTileCount = 0;

  for (const tile of terrain.tiles) {
    const global = regionLocalToGlobalTile(region, tile.x, tile.y);
    const magicalWaterInfluence = deriveMagicalWaterInfluence(seed, tile, global);
    const biome = deriveBiomeProfile({
      seed,
      tile,
      gridHeight: WORLD_HEIGHT,
      globalTile: global,
      magicalWaterInfluence,
    });
    tiles.push({ tile, globalX: global.x, globalY: global.y, biome });
    terrainTileCounts[tile.terrain] += 1;
    biomeTileCounts[biome.id] += 1;
    elevation += tile.elevation;
    moisture += tile.moisture;
    roughness += tile.roughness;
    rainfall += biome.climate.rainfall;
    heat += biome.climate.heat;
    exposure += biome.climate.exposure;
    if (isShoreTile(terrain, tile)) shoreTileCount += 1;
  }

  const tileCount = terrain.tiles.length;
  const averageElevation = Math.trunc(elevation / tileCount);
  const averageMoisture = Math.trunc(moisture / tileCount);
  const averageRoughness = Math.trunc(roughness / tileCount);
  const averageRainfall = Math.trunc(rainfall / tileCount);
  const averageHeat = Math.trunc(heat / tileCount);
  const averageExposure = Math.trunc(exposure / tileCount);
  const ratio = (count: number): number => Math.trunc((count * FIXED_POINT) / tileCount);
  const terrestrialProductivity = fixedWeighted([
    [ratio(terrainTileCounts.meadow), 5],
    [ratio(terrainTileCounts.marsh), 4],
    [averageMoisture, 2],
    [averageRainfall, 1],
  ]);
  const aquaticProductivity = fixedWeighted([
    [ratio(terrainTileCounts["deep-water"]), 4],
    [ratio(terrainTileCounts["tidal-flat"]), 5],
    [ratio(terrainTileCounts.marsh), 4],
    [averageRainfall, 1],
  ]);
  const cover = fixedWeighted([
    [ratio(terrainTileCounts.marsh), 5],
    [ratio(terrainTileCounts.meadow), 2],
    [ratio(terrainTileCounts.ridge), 3],
    [averageRoughness, 2],
  ]);
  const nonemptyTerrainKinds = Object.values(terrainTileCounts).filter((count) => count > 0).length;
  const terrainDiversity = Math.trunc((nonemptyTerrainKinds * FIXED_POINT) / 5);
  const carryingSignal = fixedWeighted([
    [terrestrialProductivity, 4],
    [aquaticProductivity, 3],
    [cover, 2],
    [terrainDiversity, 1],
  ]);

  return {
    terrain,
    terrainHash: regionTerrainHash(terrain),
    tiles,
    summary: freezeDeep({
      tileCount,
      terrainTileCounts,
      biomeTileCounts,
      shoreTileCount,
      averageElevation,
      averageMoisture,
      averageRoughness,
      averageRainfall,
      averageHeat,
      averageExposure,
      terrestrialProductivity,
      aquaticProductivity,
      cover,
      terrainDiversity,
      carryingSignal,
    }),
  };
}

function habitatClassAffinity(habitatClass: string, tile: AnalyzedTile): number {
  const terrain = tile.tile.terrain;
  const biome = tile.biome.id;
  switch (habitatClass) {
    case "marsh":
    case "intertidal-marsh":
      return terrain === "marsh" ? FIXED_POINT : 0;
    case "meadow":
    case "upland-meadow":
      return terrain === "meadow" ? FIXED_POINT : 0;
    case "ridge":
    case "rocky-cover":
    case "wooded-ridge":
      return terrain === "ridge" ? FIXED_POINT : 0;
    case "tidal-flat":
    case "mudflat":
      return terrain === "tidal-flat" ? FIXED_POINT : 0;
    case "retained-wet":
    case "flooded-marsh-edge":
      return terrain === "marsh"
        ? FIXED_POINT
        : terrain === "tidal-flat" || biome === "rain-meadow"
          ? 700_000
          : 0;
    case "estuarine-channel":
    case "tidal-creek":
      return terrain === "deep-water"
        ? FIXED_POINT
        : terrain === "tidal-flat"
          ? 760_000
          : 0;
    case "shallow-water":
      return terrain === "tidal-flat"
        ? FIXED_POINT
        : terrain === "marsh" || terrain === "deep-water"
          ? 620_000
          : 0;
    case "riverbank":
      return terrain === "tidal-flat" || terrain === "marsh"
        ? FIXED_POINT
        : terrain === "meadow"
          ? 480_000
          : 0;
    case "forest-edge":
      return terrain === "meadow" || terrain === "ridge" ? 760_000 : terrain === "marsh" ? 420_000 : 0;
    case "temperate-upland":
      return terrain === "ridge"
        ? FIXED_POINT
        : terrain === "meadow" && tile.biome.climate.heat < 760_000
          ? 720_000
          : 0;
    case "settlement-edge":
    case "storehouse-yard":
    case "livestock-pen":
      return 0;
    default:
      throw new TypeError(`Unsupported regional habitat class ${habitatClass}`);
  }
}

function tileClimateFit(species: CoreWildlifeSpecies, tile: AnalyzedTile): number {
  const metadata = getCoreWildlifeSpeciesMetadata(species);
  const climate = tile.biome.climate;
  const temperatureComfort = FIXED_POINT - Math.abs(climate.heat - 520_000);
  if (metadata.locomotionClass === "aquatic") {
    return fixedWeighted([[tile.tile.moisture, 5], [climate.rainfall, 2], [temperatureComfort, 1]]);
  }
  if (metadata.locomotionClass === "amphibious") {
    return fixedWeighted([[tile.tile.moisture, 4], [climate.rainfall, 2], [temperatureComfort, 2]]);
  }
  if (metadata.locomotionClass === "aerial") {
    return fixedWeighted([[FIXED_POINT - Math.trunc(climate.exposure / 2), 3], [temperatureComfort, 2]]);
  }
  return fixedWeighted([[temperatureComfort, 3], [FIXED_POINT - Math.trunc(climate.exposure / 3), 2]]);
}

function tileProductivity(
  species: CoreWildlifeSpecies,
  summary: CoreEcologyRegionalTerrainSummary,
): number {
  const locomotion = getCoreWildlifeSpeciesMetadata(species).locomotionClass;
  if (locomotion === "aquatic") return summary.aquaticProductivity;
  if (locomotion === "amphibious") {
    return fixedWeighted([[summary.aquaticProductivity, 3], [summary.terrestrialProductivity, 2]]);
  }
  return summary.terrestrialProductivity;
}

function scoreSpeciesTiles(
  seed: RootSeed,
  species: CoreWildlifeSpecies,
  analysis: TerrainAnalysis,
): readonly ScoredTile[] {
  const module = livingSpeciesModule(species);
  if (module === null) throw new TypeError(`Missing Living Weft module for ${species}`);
  const guildRule = GUILD_RULES[coreEcologyRegionalGuildForSpecies(species)];
  return analysis.tiles.map((tile, ordinal) => {
    let affinity = 0;
    for (const habitatClass of module.habitat.habitatClasses) {
      affinity = Math.max(affinity, habitatClassAffinity(habitatClass, tile));
    }
    const score = fixedWeighted([
      [affinity, 7],
      [tileClimateFit(species, tile), 2],
      [tileProductivity(species, analysis.summary), 1],
    ]);
    return {
      tile,
      score,
      rank: keyedRandomU32(
        seed,
        ANCHOR_DOMAIN,
        tile.globalX,
        tile.globalY,
        semanticPurpose(`anchor-rank:${species}`),
        ordinal,
      ),
    };
  }).filter((entry) => entry.score >= guildRule.minimumSiteScore);
}

function deriveGuildCeilings(
  summary: CoreEcologyRegionalTerrainSummary,
): Readonly<Record<CoreEcologyRegionalGuild, number>> {
  const units = (signal: number, maximum: number): number =>
    Math.max(0, Math.min(maximum, Math.trunc((signal * maximum) / FIXED_POINT)));
  return Object.freeze({
    "aerial-forager": units(fixedWeighted([[summary.carryingSignal, 2], [summary.cover, 1]]), 10),
    "apex-predator": units(summary.terrestrialProductivity, 2),
    "aquatic-prey": units(summary.aquaticProductivity, 72),
    "large-herbivore": units(summary.terrestrialProductivity, 18),
    "large-omnivore": units(summary.terrestrialProductivity, 6),
    mesopredator: units(fixedWeighted([[summary.terrestrialProductivity, 2], [summary.cover, 1]]), 5),
    "small-prey": units(fixedWeighted([[summary.terrestrialProductivity, 3], [summary.cover, 1]]), 96),
    "tidal-detritivore": units(summary.aquaticProductivity, 80),
    "wetland-bird": units(fixedWeighted([[summary.aquaticProductivity, 2], [summary.cover, 1]]), 10),
  });
}

function populationDraft(
  seed: RootSeed,
  region: RegionCoord,
  species: CoreWildlifeSpecies,
  analysis: TerrainAnalysis,
  regionalQuiet: boolean,
): CandidateDraft {
  const guild = coreEcologyRegionalGuildForSpecies(species);
  const guildRule = GUILD_RULES[guild];
  const territory = deriveCoreEcologyRegionalTerritory(seed, species, region);
  const suitableTiles = scoreSpeciesTiles(seed, species, analysis);
  const weightedTiles = Math.trunc(
    suitableTiles.reduce((sum, entry) => sum + entry.score, 0) / FIXED_POINT,
  );
  const profile = getCoreWildlifeProfile(species);
  const habitatCapacity = Math.min(
    profile.maximumPatchPopulation,
    guildRule.maximumPopulationUnits,
    Math.trunc(weightedTiles / guildRule.tilesPerPopulationUnit),
  );
  const habitatScore = suitableTiles.length === 0
    ? 0
    : Math.trunc(
      suitableTiles.reduce((sum, entry) => sum + entry.score, 0) / suitableTiles.length,
    );
  const qualityAboveMinimum = habitatScore <= guildRule.minimumSiteScore
    ? 0
    : Math.trunc(
      ((habitatScore - guildRule.minimumSiteScore) * FIXED_POINT)
      / (FIXED_POINT - guildRule.minimumSiteScore),
    );
  const densityThreshold = clampFixed(Math.trunc((
    guildRule.minimumOccurrence
      + Math.trunc((qualityAboveMinimum * guildRule.occurrenceRange) / FIXED_POINT)
  ) / REGIONAL_OCCURRENCE_DENSITY_DIVISOR));
  const densityRoll = keyedRandomInt(
    seed,
    DENSITY_DOMAIN,
    region.x,
    region.y,
    semanticPurpose(`density:${species}`),
    0,
    FIXED_POINT - 1,
  );
  const pressure = keyedRandomInt(
    seed,
    DENSITY_DOMAIN,
    region.y,
    region.x,
    semanticPurpose(`population-pressure:${species}`),
    350_000,
    900_000,
  );
  const proposedPopulation = habitatCapacity === 0
    ? 0
    : Math.max(1, Math.ceil((habitatCapacity * pressure) / FIXED_POINT));
  let admissionReason: CoreEcologyPopulationAdmissionReason = "admitted";
  let populationUnits = proposedPopulation;
  if (regionalQuiet) {
    admissionReason = "regional-quiet";
    populationUnits = 0;
  } else if (!territory.regionIsHost) {
    admissionReason = "territory-owned-elsewhere";
    populationUnits = 0;
  } else if (habitatCapacity === 0) {
    admissionReason = "habitat-capacity-zero";
    populationUnits = 0;
  } else if (densityRoll >= densityThreshold) {
    admissionReason = "density-roll-failed";
    populationUnits = 0;
  }
  return {
    species,
    guild,
    territory,
    habitatScore,
    suitableTiles,
    habitatCapacity,
    densityRoll,
    densityThreshold,
    proposedPopulation,
    admissionRank: keyedRandomU32(
      seed,
      DENSITY_DOMAIN,
      region.x,
      region.y,
      semanticPurpose(`admission-rank:${species}`),
    ),
    populationUnits,
    preySupportUnits: 0,
    trophicCeiling: guildRule.preyUnitsPerPredator === 0 ? proposedPopulation : 0,
    admissionReason,
  };
}

function candidatePriority(left: CandidateDraft, right: CandidateDraft): number {
  return right.habitatScore - left.habitatScore
    || left.admissionRank - right.admissionRank
    || compareText(left.species, right.species);
}

function isPredatorDraft(draft: CandidateDraft): boolean {
  return getCoreWildlifeProfile(draft.species).roles.includes("predator");
}

function consumeGuildBudgets(
  drafts: readonly CandidateDraft[],
  guildCeilings: Readonly<Record<CoreEcologyRegionalGuild, number>>,
  predators: boolean,
): void {
  const used: Record<CoreEcologyRegionalGuild, number> = {
    "aerial-forager": 0,
    "apex-predator": 0,
    "aquatic-prey": 0,
    "large-herbivore": 0,
    "large-omnivore": 0,
    mesopredator: 0,
    "small-prey": 0,
    "tidal-detritivore": 0,
    "wetland-bird": 0,
  };
  if (predators) {
    for (const entry of drafts.filter((candidate) => !isPredatorDraft(candidate))) {
      used[entry.guild] += entry.populationUnits;
    }
  }
  for (const draft of [...drafts].filter((entry) => isPredatorDraft(entry) === predators).sort(candidatePriority)) {
    if (draft.populationUnits === 0) continue;
    const remaining = Math.max(0, guildCeilings[draft.guild] - used[draft.guild]);
    draft.populationUnits = Math.min(draft.populationUnits, remaining);
    used[draft.guild] += draft.populationUnits;
    if (draft.populationUnits === 0) draft.admissionReason = "density-budget-exhausted";
  }
}

function preySupportFor(draft: CandidateDraft, drafts: readonly CandidateDraft[]): number {
  const units = (predicate: (entry: CandidateDraft) => boolean): number => drafts
    .filter((entry) => !isPredatorDraft(entry) && predicate(entry))
    .reduce((sum, entry) => sum + entry.populationUnits, 0);
  if (draft.guild === "mesopredator") {
    const amphibious = getCoreWildlifeSpeciesMetadata(draft.species).locomotionClass === "amphibious";
    return amphibious
      ? units((entry) => entry.guild === "aquatic-prey" || entry.guild === "tidal-detritivore")
      : units((entry) => entry.guild === "small-prey" || entry.guild === "tidal-detritivore");
  }
  return units((entry) => entry.guild === "large-herbivore") * 12
    + units((entry) => entry.species === "wild-boar") * 8
    + Math.trunc(units((entry) => entry.guild === "small-prey") / 3);
}

function applyPredatorSupport(drafts: readonly CandidateDraft[]): void {
  for (const draft of drafts.filter(isPredatorDraft)) {
    const preySupportUnits = preySupportFor(draft, drafts);
    const preyRatio = GUILD_RULES[draft.guild].preyUnitsPerPredator;
    const trophicCeiling = preyRatio === 0 ? draft.proposedPopulation : Math.trunc(preySupportUnits / preyRatio);
    draft.preySupportUnits = preySupportUnits;
    draft.trophicCeiling = trophicCeiling;
    if (draft.populationUnits > trophicCeiling) draft.populationUnits = trophicCeiling;
    if (draft.populationUnits === 0 && draft.admissionReason === "admitted") {
      draft.admissionReason = "unsupported-predator";
    }
  }
}

function squaredDistance(left: ScoredTile, right: ScoredTile): number {
  const x = left.tile.tile.x - right.tile.tile.x;
  const y = left.tile.tile.y - right.tile.tile.y;
  return x * x + y * y;
}

function chooseAnchors(
  seed: RootSeed,
  region: RegionCoord,
  draft: CandidateDraft,
  occupied: Set<number>,
): readonly CoreEcologyRegionalPopulationAnchor[] {
  if (draft.populationUnits === 0) return Object.freeze([]);
  const guildRule = GUILD_RULES[draft.guild];
  const desired = Math.min(
    draft.populationUnits,
    isCoreEcologyAggregateSpecies(draft.species)
      ? REGIONAL_AGGREGATE_MAX_ANCHORS
      : guildRule.maximumAnchors,
    draft.suitableTiles.length,
  );
  const ranked = [...draft.suitableTiles].sort((left, right) =>
    right.score - left.score
      || left.rank - right.rank
      || left.tile.tile.index - right.tile.tile.index,
  );
  const chosen: ScoredTile[] = [];
  const minimumDistanceSquared = guildRule.anchorSeparation * guildRule.anchorSeparation;
  for (const candidate of ranked) {
    if (occupied.has(candidate.tile.tile.index)) continue;
    if (chosen.every((existing) => squaredDistance(existing, candidate) >= minimumDistanceSquared)) {
      chosen.push(candidate);
      if (chosen.length === desired) break;
    }
  }
  if (chosen.length < desired) {
    for (const candidate of ranked) {
      if (occupied.has(candidate.tile.tile.index) || chosen.includes(candidate)) continue;
      chosen.push(candidate);
      if (chosen.length === desired) break;
    }
  }
  for (const entry of chosen) occupied.add(entry.tile.tile.index);
  const baseAllocation = Math.trunc(draft.populationUnits / chosen.length);
  const remainder = draft.populationUnits % chosen.length;
  return Object.freeze(chosen.map((entry, ordinal) => Object.freeze({
    stableId: stableRegionObjectId(seed, region, "wild-anchor", `${draft.species}:${ordinal}`),
    localX: entry.tile.tile.x,
    localY: entry.tile.tile.y,
    globalX: entry.tile.globalX,
    globalY: entry.tile.globalY,
    habitatScore: entry.score,
    allocatedPopulation: baseAllocation + (ordinal < remainder ? 1 : 0),
  })));
}

function canonicalSpeciesOrder(input: readonly CoreWildlifeSpecies[] | undefined): readonly CoreWildlifeSpecies[] {
  const provided = input ?? CORE_ECOLOGY_REGIONAL_WILD_SPECIES;
  const wild = new Set<CoreWildlifeSpecies>();
  for (const species of provided) {
    if (!CORE_WILDLIFE_SPECIES.includes(species)) {
      throw new TypeError(`Unsupported core wildlife species ${String(species)}`);
    }
    if (!DOMESTIC_SPECIES.has(species)) wild.add(species);
  }
  if (
    wild.size !== CORE_ECOLOGY_REGIONAL_WILD_SPECIES.length
    || CORE_ECOLOGY_REGIONAL_WILD_SPECIES.some((species) => !wild.has(species))
  ) {
    throw new TypeError("Regional habitat derivation requires the complete core wild-species catalog");
  }
  return Object.freeze([...wild].sort(compareText));
}

function regionalHabitatCacheKey(seed: RootSeed, region: RegionCoord): string {
  return hashCanonical([
    CORE_ECOLOGY_REGIONAL_HABITAT_OWNER_ID,
    seed,
    region.x,
    region.y,
  ]);
}

/** Test/debug boundary; cache occupancy is never part of ecological truth. */
export function clearCoreEcologyRegionalHabitatCache(): void {
  REGIONAL_HABITAT_CACHE.clear();
}

function cacheRegionalHabitat(
  key: string,
  habitat: CoreEcologyRegionalHabitat,
): CoreEcologyRegionalHabitat {
  REGIONAL_HABITAT_CACHE.delete(key);
  REGIONAL_HABITAT_CACHE.set(key, habitat);
  while (REGIONAL_HABITAT_CACHE.size > CORE_ECOLOGY_REGIONAL_HABITAT_CACHE_LIMIT) {
    const oldest = REGIONAL_HABITAT_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    REGIONAL_HABITAT_CACHE.delete(oldest);
  }
  return habitat;
}

/**
 * Derives one complete candidate assemblage from stable world facts. The
 * result is independent of caller traversal order and may honestly contain no
 * admitted wildlife at all.
 */
export function deriveCoreEcologyRegionalHabitat(
  input: DeriveCoreEcologyRegionalHabitatInput,
): CoreEcologyRegionalHabitat {
  assertRegion(input.region);
  const region = createRegionCoord(input.region.x, input.region.y);
  const species = canonicalSpeciesOrder(input.speciesOrder);
  const cacheKey = regionalHabitatCacheKey(input.seed, region);
  const cached = REGIONAL_HABITAT_CACHE.get(cacheKey);
  if (cached !== undefined) {
    if (input.terrain !== undefined && (
      input.terrain.width !== WORLD_WIDTH
      || input.terrain.height !== WORLD_HEIGHT
      || input.terrain.tiles.length !== WORLD_WIDTH * WORLD_HEIGHT
      || regionTerrainHash(input.terrain) !== cached.terrainHash
    )) {
      throw new TypeError("Supplied regional terrain is not the canonical baseline for this seed/region");
    }
    // LRU order affects performance only; the returned canonical value is fixed.
    return cacheRegionalHabitat(cacheKey, cached);
  }
  const analysis = analyzeTerrain(input.seed, region, input.terrain);
  const regionalQuietRoll = keyedRandomInt(
    input.seed,
    REGIONAL_DOMAIN,
    region.x,
    region.y,
    semanticPurpose("regional-quiet"),
    0,
    FIXED_POINT - 1,
  );
  const regionalQuietThreshold = Math.min(
    900_000,
    120_000 + Math.trunc((analysis.summary.carryingSignal * 680_000) / FIXED_POINT),
  );
  const regionalQuiet = regionalQuietRoll >= regionalQuietThreshold;
  const guildCeilings = deriveGuildCeilings(analysis.summary);
  const drafts = species.map((entry) =>
    populationDraft(input.seed, region, entry, analysis, regionalQuiet),
  );
  consumeGuildBudgets(drafts, guildCeilings, false);
  applyPredatorSupport(drafts);
  consumeGuildBudgets(drafts, guildCeilings, true);

  const occupiedAnchors = new Set<number>();
  const populations: CoreEcologyRegionalPopulationCandidate[] = drafts
    .sort((left, right) => compareText(left.species, right.species))
    .map((draft) => {
      const anchors = chooseAnchors(input.seed, region, draft, occupiedAnchors);
      const module = livingSpeciesModule(draft.species);
      if (module === null) throw new TypeError(`Missing Living Weft module for ${draft.species}`);
      const stableId = stableRegionObjectId(
        input.seed,
        region,
        "wild-population",
        draft.species,
      );
      return freezeDeep({
        version: CORE_ECOLOGY_REGIONAL_HABITAT_VERSION,
        stableId,
        populationKey: `rh1:${hashCanonical({ region: stableRegionId(input.seed, region), species: draft.species })}:${draft.species}`,
        species: draft.species,
        guild: draft.guild,
        actorRepresentation: getCoreWildlifeSpeciesMetadata(draft.species).actorRepresentation,
        territoryId: draft.territory.stableId,
        territoryHostRegion: draft.territory.hostRegion,
        territoryOwnedHere: draft.territory.regionIsHost,
        habitatScore: draft.habitatScore,
        suitableTileCount: draft.suitableTiles.length,
        habitatCapacity: draft.habitatCapacity,
        densityRoll: draft.densityRoll,
        densityThreshold: draft.densityThreshold,
        preySupportUnits: draft.preySupportUnits,
        trophicCeiling: draft.trophicCeiling,
        guildCeiling: guildCeilings[draft.guild],
        populationUnits: draft.populationUnits,
        admissionReason: draft.admissionReason,
        anchors,
      });
    });
  const totalPopulationUnits = populations.reduce((sum, entry) => sum + entry.populationUnits, 0);
  const base = {
    version: CORE_ECOLOGY_REGIONAL_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_REGIONAL_HABITAT_OWNER_ID,
    region,
    regionId: stableRegionId(input.seed, region),
    terrainHash: analysis.terrainHash,
    cell: deriveCoreEcologyRegionalCellIdentity(input.seed, region),
    summary: analysis.summary,
    density: freezeDeep({
      regionalQuietRoll,
      regionalQuietThreshold,
      regionalQuiet,
      guildCeilings,
    }),
    catalogSpeciesCount: LIVING_SPECIES_CATALOG.modules.length,
    evaluatedWildSpeciesCount: species.length,
    populations: Object.freeze(populations),
    totalPopulationUnits,
    admittedSpeciesCount: populations.filter((entry) => entry.populationUnits > 0).length,
  };
  return cacheRegionalHabitat(
    cacheKey,
    freezeDeep({ ...base, derivationHash: hashCanonical(base) }),
  );
}

/**
 * Derives the bounded neutral-activity destinations owned by a regional
 * resident without adding them to the sparse save/root schema. The regional
 * habitat remains the population authority; these sites are a deterministic
 * projection of the same seed, signed region, and canonical terrain.
 */
export function deriveCoreEcologyRegionalActivityAnchors(
  input: DeriveCoreEcologyRegionalActivityAnchorsInput,
): CoreEcologyRegionalActivityAnchors | null {
  if (
    typeof input !== "object"
    || input === null
    || !isWorldPosition(input.homeAnchor)
    || !isRegionCoord(input.habitat.region)
    || input.homeAnchor.region.x !== input.habitat.region.x
    || input.homeAnchor.region.y !== input.habitat.region.y
  ) return null;
  const expected = deriveCoreEcologyRegionalHabitat({
    seed: input.seed,
    region: input.habitat.region,
  });
  if (stableStringify(expected) !== stableStringify(input.habitat)) return null;
  const population = expected.populations.find(({ species }) => species === input.species);
  if (population === undefined || population.populationUnits === 0) return null;
  if (
    input.species === "fish-crow"
    || input.species === "northern-harrier"
    || input.species === "gull"
  ) {
    return freezeDeep({
      homeAnchor: copyActivityPosition(input.homeAnchor),
      tidalAnchors: Object.freeze([]),
    });
  }

  const analysis = analyzeTerrain(input.seed, expected.region, undefined);
  const homeTileX = Math.trunc(input.homeAnchor.localX / WORLD_POSITION_UNITS_PER_TILE);
  const homeTileY = Math.trunc(input.homeAnchor.localY / WORLD_POSITION_UNITS_PER_TILE);
  const distanceFromHome = (entry: AnalyzedTile): number => (
    Math.abs(entry.tile.x - homeTileX) + Math.abs(entry.tile.y - homeTileY)
  );
  const stableRank = (entry: AnalyzedTile, purpose: string): number => keyedRandomU32(
    input.seed,
    ANCHOR_DOMAIN,
    entry.globalX,
    entry.globalY,
    semanticPurpose(`regional-activity:${input.species}:${purpose}`),
  );
  const ordered = (
    candidates: readonly AnalyzedTile[],
    purpose: string,
    targetElevation?: number,
  ): readonly AnalyzedTile[] => [...candidates].sort((left, right) => (
    (targetElevation === undefined
      ? 0
      : Math.abs(left.tile.elevation - targetElevation)
        - Math.abs(right.tile.elevation - targetElevation))
    || distanceFromHome(left) - distanceFromHome(right)
    || stableRank(left, purpose) - stableRank(right, purpose)
    || left.tile.index - right.tile.index
  ));
  // A refuge needs to remain physically dry, not carry a particular terrain
  // label. Regional admission may lawfully place wetland species in a tile set
  // whose only high ground is bramble or another traversable cover class.
  const dry = analysis.tiles.filter(({ tile }) => tile.elevation >= MAX_TIDE_LEVEL);
  if (input.species === "snowy-egret") {
    const refuge = ordered(dry, "egret-refuge")[0];
    if (refuge === undefined) return null;
    const candidates = analysis.tiles.filter(({ tile }) => (
      (tile.terrain === "tidal-flat" || tile.terrain === "marsh" || tile.terrain === "meadow")
      && tile.elevation >= MIN_TIDE_LEVEL - CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH
      && tile.elevation <= MAX_TIDE_LEVEL - CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH
    ));
    const targetElevations = [
      MIN_TIDE_LEVEL - 35_000,
      MIN_TIDE_LEVEL + 75_000,
      MIN_TIDE_LEVEL + 185_000,
      MAX_TIDE_LEVEL - 35_000,
    ] as const;
    const selected = new Set<number>([refuge.tile.index]);
    const anchors: CoreEcologyTidalWebHabitatAnchor[] = [];
    for (const [ordinal, targetElevation] of targetElevations.entries()) {
      const site = ordered(
        candidates.filter(({ tile }) => !selected.has(tile.index)),
        `egret-wading:${ordinal}`,
        targetElevation,
      )[0];
      if (site === undefined) return null;
      selected.add(site.tile.index);
      anchors.push(regionalActivityAnchor(
        input.species,
        "wading",
        ordinal,
        site,
        expected.region,
      ));
    }
    anchors.push(regionalActivityAnchor(
      input.species,
      "refuge",
      0,
      refuge,
      expected.region,
    ));
    return freezeDeep({
      homeAnchor: copyActivityPosition(input.homeAnchor),
      tidalAnchors: Object.freeze(anchors),
    });
  }

  if (input.species === "american-black-duck") {
    const refuge = ordered(dry, "duck-refuge")[0];
    if (refuge === undefined) return null;
    const candidates = analysis.tiles.filter(({ tile }) => (
      (tile.terrain === "deep-water" || tile.terrain === "tidal-flat" || tile.terrain === "marsh")
      && MAX_TIDE_LEVEL - tile.elevation
        >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
    ));
    const targetElevations = [
      MIN_TIDE_LEVEL - 70_000,
      MAX_TIDE_LEVEL - 45_000,
    ] as const;
    const selected = new Set<number>([refuge.tile.index]);
    const anchors: CoreEcologyTidalWebHabitatAnchor[] = [];
    for (const [ordinal, targetElevation] of targetElevations.entries()) {
      const site = ordered(
        candidates.filter(({ tile }) => !selected.has(tile.index)),
        `duck-dabbling:${ordinal}`,
        targetElevation,
      )[0];
      if (site === undefined) return null;
      selected.add(site.tile.index);
      anchors.push(regionalActivityAnchor(
        input.species,
        "dabbling",
        ordinal,
        site,
        expected.region,
      ));
    }
    anchors.push(regionalActivityAnchor(
      input.species,
      "refuge",
      0,
      refuge,
      expected.region,
    ));
    return freezeDeep({
      homeAnchor: copyActivityPosition(input.homeAnchor),
      tidalAnchors: Object.freeze(anchors),
    });
  }

  const foragingCandidates = analysis.tiles.filter(({ tile }) => {
    if (
      tile.terrain !== "deep-water"
      && tile.terrain !== "tidal-flat"
    ) return false;
    const highTideDepth = MAX_TIDE_LEVEL - tile.elevation;
    if (
      highTideDepth < CORE_ECOLOGY_RIVER_OTTER_MINIMUM_FORAGING_DEPTH
      || highTideDepth > CORE_ECOLOGY_RIVER_OTTER_MAXIMUM_FORAGING_DEPTH
    ) return false;
    return dry.length > 0;
  });
  const foraging = ordered(foragingCandidates, "otter-foraging")[0];
  if (foraging === undefined) return null;
  const haulout = [...dry].sort((left, right) => (
    tileManhattan(left.tile, foraging.tile) - tileManhattan(right.tile, foraging.tile)
    || distanceFromHome(left) - distanceFromHome(right)
    || stableRank(left, "otter-haulout") - stableRank(right, "otter-haulout")
    || left.tile.index - right.tile.index
  ))[0];
  if (haulout === undefined) return null;
  return freezeDeep({
    homeAnchor: copyActivityPosition(input.homeAnchor),
    tidalAnchors: Object.freeze([
      regionalActivityAnchor(
        input.species,
        "foraging",
        0,
        foraging,
        expected.region,
      ),
      regionalActivityAnchor(
        input.species,
        "haulout",
        0,
        haulout,
        expected.region,
      ),
    ]),
  });
}

function tileManhattan(left: TerrainTile, right: TerrainTile): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function copyActivityPosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(position.region, position.localX, position.localY);
}

function regionalActivityAnchor(
  species: "snowy-egret" | "american-black-duck" | "north-american-river-otter",
  purpose: "wading" | "dabbling" | "refuge" | "foraging" | "haulout",
  anchorOrdinal: number,
  addressed: AnalyzedTile,
  region: RegionCoord,
): CoreEcologyTidalWebHabitatAnchor {
  const tile = addressed.tile;
  return Object.freeze({
    species,
    purpose,
    anchorOrdinal,
    tileIndex: tile.index,
    globalTile: Object.freeze({ x: addressed.globalX, y: addressed.globalY }),
    position: createWorldPosition(
      region,
      tile.x * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      tile.y * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    ),
    elevation: tile.elevation,
    terrain: tile.terrain,
    biome: addressed.biome.id,
  });
}
