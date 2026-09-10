import { deriveBaselineBiomeClimate } from "../sim/biomes";
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
  type TerrainState,
  type TerrainTile,
} from "../sim/types";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  deriveCoreEcologyPolarShoreHabitat,
  type CoreEcologyPolarShoreHabitat,
  type CoreEcologyPolarShorePopulationAnchor,
} from "./coreEcologyPolarShoreHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION = 1 as const;
export const CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_OWNER_ID =
  "game:core-ecology-polar-consumer-habitat:v1" as const;
export const CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND =
  "regional-polar-consumer-v1" as const;
export const CORE_ECOLOGY_POLAR_CONSUMER_SPECIES = Object.freeze([
  "harbor-seal",
  "polar-bear",
] as const);
export const CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_CACHE_LIMIT = 128 as const;
export const CORE_ECOLOGY_POLAR_CONSUMER_TERRITORY_SPAN_REGIONS = 2 as const;
export const CORE_ECOLOGY_POLAR_CONSUMER_MAXIMUM_FORAGE_DISTANCE_TILES =
  64 as const;
export const CORE_ECOLOGY_POLAR_CONSUMER_BEAR_DENSITY_THRESHOLD =
  320_000 as const;

export type CoreEcologyPolarConsumerSpecies =
  (typeof CORE_ECOLOGY_POLAR_CONSUMER_SPECIES)[number];
export type CoreEcologyPolarConsumerAnchorPurpose =
  "foraging-water" | "dry-haulout" | "bear-land";
export type CoreEcologyPolarConsumerAdmissionReason =
  | "admitted"
  | "bear-land-absent"
  | "density-roll-failed"
  | "dry-haulout-absent"
  | "forage-substrate-absent"
  | "foraging-water-absent"
  | "seal-candidate-absent"
  | "territory-owned-elsewhere";

/** Exact receipt for the already-authenticated Atlantic-capelin substrate. */
export interface CoreEcologyPolarConsumerForageSubstrate {
  readonly polarShoreSourceStableId: string;
  readonly polarShoreHabitatHash: string;
  readonly capelinPopulationStableId: string;
  readonly capelinPopulationKey: string;
  readonly capelinPopulationUnits: number;
  readonly viable: boolean;
}

export interface CoreEcologyPolarConsumerTerritory {
  readonly version: typeof CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION;
  readonly stableId: string;
  readonly species: "polar-bear";
  readonly address: Readonly<{ readonly x: number; readonly y: number }>;
  readonly spanRegions: typeof CORE_ECOLOGY_POLAR_CONSUMER_TERRITORY_SPAN_REGIONS;
  readonly bounds: Readonly<{
    readonly minimum: RegionCoord;
    readonly maximum: RegionCoord;
  }>;
  readonly hostRegion: RegionCoord;
  readonly regionIsHost: boolean;
}

export interface CoreEcologyPolarConsumerTerrainSummary {
  readonly tileCount: number;
  readonly authenticatedForagingWaterCount: number;
  readonly allTideDryTileCount: number;
  readonly reachableDryHauloutTileCount: number;
  readonly bearLandTileCount: number;
  readonly averageEligibleHeat: number;
  readonly averageEligibleSalinity: number;
  readonly coldSignal: number;
  readonly shoreSignal: number;
  readonly habitatSignal: number;
}

export interface CoreEcologyPolarConsumerPopulationAnchor {
  readonly stableId: string;
  readonly anchorOrdinal: number;
  readonly purpose: CoreEcologyPolarConsumerAnchorPurpose;
  readonly medium: "land" | "surface-water";
  readonly sourceAnchorStableId: string | null;
  readonly localX: number;
  readonly localY: number;
  readonly globalX: number;
  readonly globalY: number;
  readonly position: WorldPosition;
  readonly terrain: "deep-water" | "meadow" | "ridge" | "tidal-flat";
  readonly elevation: number;
  readonly lowTideDepth: number;
  readonly highTideDepth: number;
  readonly heat: number;
  readonly salinity: number;
  readonly cold: number;
  readonly forageDistanceTiles: number;
  readonly habitatScore: number;
  readonly allocatedPopulation: 1;
}

export interface CoreEcologyPolarConsumerPopulationCandidate {
  readonly version: typeof CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION;
  readonly stableId: string;
  readonly populationKey: string;
  readonly species: CoreEcologyPolarConsumerSpecies;
  readonly guild: "marine-consumer" | "polar-consumer";
  readonly actorRepresentation: "individual";
  readonly habitatScore: number;
  readonly suitableTileCount: number;
  readonly habitatCapacity: 0 | 1;
  readonly forageSupportPopulationKey: string;
  readonly forageSupportUnits: number;
  readonly sealSupportStableId: string | null;
  readonly sealSupportPopulationKey: string | null;
  readonly sealSupportUnits: 0 | 1;
  readonly territoryId: string | null;
  readonly territoryHostRegion: RegionCoord | null;
  readonly territoryOwnedHere: boolean;
  readonly densityRoll: number;
  readonly densityThreshold: number;
  readonly populationUnits: 0 | 1;
  readonly admissionReason: CoreEcologyPolarConsumerAdmissionReason;
  readonly anchors: readonly CoreEcologyPolarConsumerPopulationAnchor[];
}

export interface CoreEcologyPolarConsumerHabitat {
  readonly version: typeof CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_OWNER_ID;
  readonly derivationKind: typeof CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND;
  readonly region: RegionCoord;
  readonly regionId: string;
  readonly sourceStableId: string;
  readonly terrainHash: string;
  readonly forageSubstrate: CoreEcologyPolarConsumerForageSubstrate;
  readonly bearTerritory: CoreEcologyPolarConsumerTerritory;
  readonly summary: CoreEcologyPolarConsumerTerrainSummary;
  readonly evaluatedSpeciesCount: 2;
  readonly populations: readonly [
    CoreEcologyPolarConsumerPopulationCandidate,
    CoreEcologyPolarConsumerPopulationCandidate,
  ];
  readonly totalPopulationUnits: 0 | 1 | 2;
  readonly admittedSpeciesCount: 0 | 1 | 2;
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyPolarConsumerHabitatInput {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly terrain?: TerrainState;
}

interface AnalyzedWaterAnchor {
  readonly source: CoreEcologyPolarShorePopulationAnchor;
  readonly tile: TerrainTile & {
    readonly terrain: "deep-water" | "tidal-flat";
  };
  readonly globalX: number;
  readonly globalY: number;
  readonly heat: number;
  readonly salinity: number;
  readonly cold: number;
  readonly habitatScore: number;
  readonly placementRank: number;
}

interface AnalyzedDryTile {
  readonly tile: TerrainTile & { readonly terrain: "meadow" | "ridge" };
  readonly globalX: number;
  readonly globalY: number;
  readonly heat: number;
  readonly salinity: number;
  readonly cold: number;
  readonly forageDistanceTiles: number;
  readonly habitatScore: number;
  readonly placementRank: number;
}

const UINT32_MAX = 0xffff_ffff;
const WATER_ANCHOR_DOMAIN = 0x5043_5741;
const DRY_ANCHOR_DOMAIN = 0x5043_4441;
const BEAR_DENSITY_DOMAIN = 0x5043_4244;
const BEAR_TERRITORY_DOMAIN = 0x5043_4254;
const HASH_PATTERN = /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/u;
const MINIMUM_COLD_SIGNAL = 540_000;
const MINIMUM_SALINITY = 570_000;
const MINIMUM_DRY_COLD_SIGNAL = 450_000;
const MINIMUM_DRY_SITE_SCORE = 480_000;
const TRUSTED_HABITATS = new WeakSet<object>();
const HABITAT_CACHE = new Map<string, CoreEcologyPolarConsumerHabitat>();

function clampFixed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function ratioFixed(numerator: number, denominator: number): number {
  if (denominator <= 0 || numerator <= 0) return 0;
  return clampFixed(Math.trunc((numerator * FIXED_POINT) / denominator));
}

function fixedWeighted(values: readonly (readonly [number, number])[]): number {
  let weighted = 0;
  let weights = 0;
  for (const [value, weight] of values) {
    weighted += clampFixed(value) * weight;
    weights += weight;
  }
  return weights === 0 ? 0 : clampFixed(Math.trunc(weighted / weights));
}

function floorAddress(value: number, divisor: number): number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw new RangeError("Polar-consumer territory address is malformed");
  }
  return Math.floor(value / divisor);
}

function territoryBounds(
  address: Readonly<{ readonly x: number; readonly y: number }>,
): Readonly<{ readonly minimum: RegionCoord; readonly maximum: RegionCoord }> {
  const span = CORE_ECOLOGY_POLAR_CONSUMER_TERRITORY_SPAN_REGIONS;
  const minimumX = address.x * span;
  const minimumY = address.y * span;
  return Object.freeze({
    minimum: createRegionCoord(
      Math.max(-REGION_COORD_LIMIT, minimumX),
      Math.max(-REGION_COORD_LIMIT, minimumY),
    ),
    maximum: createRegionCoord(
      Math.min(REGION_COORD_LIMIT, minimumX + span - 1),
      Math.min(REGION_COORD_LIMIT, minimumY + span - 1),
    ),
  });
}

export function deriveCoreEcologyPolarConsumerTerritory(
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyPolarConsumerTerritory {
  requireRootSeed(seed);
  if (!isRegionCoord(region)) {
    throw new RangeError("Polar-consumer territory requires a region");
  }
  const span = CORE_ECOLOGY_POLAR_CONSUMER_TERRITORY_SPAN_REGIONS;
  const address = Object.freeze({
    x: floorAddress(region.x, span),
    y: floorAddress(region.y, span),
  });
  const bounds = territoryBounds(address);
  const width = bounds.maximum.x - bounds.minimum.x + 1;
  const height = bounds.maximum.y - bounds.minimum.y + 1;
  const hostOrdinal = keyedRandomInt(
    seed,
    BEAR_TERRITORY_DOMAIN,
    address.x,
    address.y,
    0,
    0,
    width * height - 1,
  );
  const hostRegion = createRegionCoord(
    bounds.minimum.x + (hostOrdinal % width),
    bounds.minimum.y + Math.trunc(hostOrdinal / width),
  );
  return deepFreeze({
    version: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION,
    stableId: stableRegionObjectId(
      seed,
      hostRegion,
      "polar-consumer-territory",
      "polar-bear",
    ),
    species: "polar-bear",
    address,
    spanRegions: span,
    bounds,
    hostRegion,
    regionIsHost: hostRegion.x === region.x && hostRegion.y === region.y,
  });
}

function canonicalTerrain(
  seed: RootSeed,
  region: RegionCoord,
  supplied: TerrainState | undefined,
): TerrainState {
  const generated = generateRegionTerrain(seed, region);
  if (supplied === undefined) return generated;
  if (
    supplied.width !== WORLD_WIDTH ||
    supplied.height !== WORLD_HEIGHT ||
    supplied.tiles.length !== generated.tiles.length
  ) {
    throw new TypeError(
      "Supplied polar-consumer terrain has invalid dimensions",
    );
  }
  const ordered = [...supplied.tiles].sort(
    (left, right) => left.index - right.index,
  );
  if (
    ordered.some((tile, index) => tile.index !== index) ||
    stableStringify({
      width: supplied.width,
      height: supplied.height,
      tiles: ordered,
    }) !== stableStringify(generated)
  ) {
    throw new TypeError("Supplied polar-consumer terrain is not canonical");
  }
  return generated;
}

function forageReceipt(
  polar: CoreEcologyPolarShoreHabitat,
): CoreEcologyPolarConsumerForageSubstrate {
  const population = polar.populations[0];
  if (population === undefined || population.species !== "atlantic-capelin") {
    throw new Error(
      "Canonical polar shore lost its Atlantic-capelin candidate",
    );
  }
  return deepFreeze({
    polarShoreSourceStableId: polar.sourceStableId,
    polarShoreHabitatHash: polar.derivationHash,
    capelinPopulationStableId: population.stableId,
    capelinPopulationKey: population.populationKey,
    capelinPopulationUnits: population.populationUnits,
    viable:
      polar.totalPopulationUnits > 0 &&
      population.populationUnits > 0 &&
      population.admissionReason === "admitted" &&
      population.anchors.length > 0,
  });
}

function analyzeWaterAnchors(
  seed: RootSeed,
  region: RegionCoord,
  terrain: TerrainState,
  polar: CoreEcologyPolarShoreHabitat,
): readonly AnalyzedWaterAnchor[] {
  const entries: AnalyzedWaterAnchor[] = [];
  for (const source of polar.populations[0]?.anchors ?? []) {
    const tile = terrain.tiles[source.localY * terrain.width + source.localX];
    if (
      tile === undefined ||
      (tile.terrain !== "deep-water" && tile.terrain !== "tidal-flat") ||
      tile.x !== source.localX ||
      tile.y !== source.localY
    ) {
      continue;
    }
    const global = regionLocalToGlobalTile(region, tile.x, tile.y);
    const climate = deriveBaselineBiomeClimate(
      seed,
      tile,
      WORLD_HEIGHT,
      0,
      global,
    );
    const cold = FIXED_POINT - climate.heat;
    if (
      cold < MINIMUM_COLD_SIGNAL ||
      climate.salinity < MINIMUM_SALINITY ||
      source.highTideDepth <= 0
    ) {
      continue;
    }
    const waterTile = tile as TerrainTile & {
      readonly terrain: "deep-water" | "tidal-flat";
    };
    entries.push(
      Object.freeze({
        source,
        tile: Object.freeze({ ...waterTile }),
        globalX: global.x,
        globalY: global.y,
        heat: climate.heat,
        salinity: climate.salinity,
        cold,
        habitatScore: fixedWeighted([
          [cold, 5],
          [climate.salinity, 4],
          [source.habitatScore, 3],
        ]),
        placementRank: keyedRandomU32(
          seed,
          WATER_ANCHOR_DOMAIN,
          global.x,
          global.y,
          source.anchorOrdinal,
        ),
      }),
    );
  }
  return Object.freeze(
    entries.sort(
      (left, right) =>
        right.habitatScore - left.habitatScore ||
        left.placementRank - right.placementRank ||
        left.tile.index - right.tile.index,
    ),
  );
}

function analyzeDryTiles(
  seed: RootSeed,
  region: RegionCoord,
  terrain: TerrainState,
  water: AnalyzedWaterAnchor | undefined,
): Readonly<{
  readonly tiles: readonly AnalyzedDryTile[];
  readonly allTideDryTileCount: number;
}> {
  const tiles: AnalyzedDryTile[] = [];
  let allTideDryTileCount = 0;
  for (const tile of terrain.tiles) {
    if (
      (tile.terrain !== "meadow" && tile.terrain !== "ridge") ||
      tile.elevation < MAX_TIDE_LEVEL
    ) {
      continue;
    }
    allTideDryTileCount += 1;
    if (water === undefined) continue;
    const forageDistanceTiles =
      Math.abs(tile.x - water.tile.x) + Math.abs(tile.y - water.tile.y);
    if (
      forageDistanceTiles >
      CORE_ECOLOGY_POLAR_CONSUMER_MAXIMUM_FORAGE_DISTANCE_TILES
    ) {
      continue;
    }
    const global = regionLocalToGlobalTile(region, tile.x, tile.y);
    const climate = deriveBaselineBiomeClimate(
      seed,
      tile,
      WORLD_HEIGHT,
      0,
      global,
    );
    const cold = FIXED_POINT - climate.heat;
    const proximity = clampFixed(
      FIXED_POINT -
        Math.trunc(
          (forageDistanceTiles * FIXED_POINT) /
            (CORE_ECOLOGY_POLAR_CONSUMER_MAXIMUM_FORAGE_DISTANCE_TILES + 1),
        ),
    );
    const habitatScore = fixedWeighted([
      [cold, 5],
      [proximity, 4],
      [tile.elevation, 2],
      [tile.roughness, 1],
    ]);
    if (
      cold < MINIMUM_DRY_COLD_SIGNAL ||
      habitatScore < MINIMUM_DRY_SITE_SCORE
    ) {
      continue;
    }
    const dryTile = tile as TerrainTile & {
      readonly terrain: "meadow" | "ridge";
    };
    tiles.push(
      Object.freeze({
        tile: Object.freeze({ ...dryTile }),
        globalX: global.x,
        globalY: global.y,
        heat: climate.heat,
        salinity: climate.salinity,
        cold,
        forageDistanceTiles,
        habitatScore,
        placementRank: keyedRandomU32(
          seed,
          DRY_ANCHOR_DOMAIN,
          global.x,
          global.y,
          0,
        ),
      }),
    );
  }
  return deepFreeze({
    tiles: tiles.sort(
      (left, right) =>
        right.habitatScore - left.habitatScore ||
        left.placementRank - right.placementRank ||
        left.tile.index - right.tile.index,
    ),
    allTideDryTileCount,
  });
}

function waterAnchor(
  seed: RootSeed,
  region: RegionCoord,
  entry: AnalyzedWaterAnchor,
): CoreEcologyPolarConsumerPopulationAnchor {
  return deepFreeze({
    stableId: stableRegionObjectId(
      seed,
      region,
      "polar-consumer-anchor",
      "harbor-seal:foraging-water",
    ),
    anchorOrdinal: 0,
    purpose: "foraging-water",
    medium: "surface-water",
    sourceAnchorStableId: entry.source.stableId,
    localX: entry.tile.x,
    localY: entry.tile.y,
    globalX: entry.globalX,
    globalY: entry.globalY,
    position: createWorldPosition(
      region,
      entry.tile.x * WORLD_POSITION_UNITS_PER_TILE +
        Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      entry.tile.y * WORLD_POSITION_UNITS_PER_TILE +
        Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    ),
    terrain: entry.tile.terrain,
    elevation: entry.tile.elevation,
    lowTideDepth: Math.max(0, MIN_TIDE_LEVEL - entry.tile.elevation),
    highTideDepth: Math.max(0, MAX_TIDE_LEVEL - entry.tile.elevation),
    heat: entry.heat,
    salinity: entry.salinity,
    cold: entry.cold,
    forageDistanceTiles: 0,
    habitatScore: entry.habitatScore,
    allocatedPopulation: 1,
  });
}

function landAnchor(
  seed: RootSeed,
  region: RegionCoord,
  species: CoreEcologyPolarConsumerSpecies,
  purpose: "bear-land" | "dry-haulout",
  ordinal: number,
  entry: AnalyzedDryTile,
): CoreEcologyPolarConsumerPopulationAnchor {
  return deepFreeze({
    stableId: stableRegionObjectId(
      seed,
      region,
      "polar-consumer-anchor",
      `${species}:${purpose}`,
    ),
    anchorOrdinal: ordinal,
    purpose,
    medium: "land",
    sourceAnchorStableId: null,
    localX: entry.tile.x,
    localY: entry.tile.y,
    globalX: entry.globalX,
    globalY: entry.globalY,
    position: createWorldPosition(
      region,
      entry.tile.x * WORLD_POSITION_UNITS_PER_TILE +
        Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      entry.tile.y * WORLD_POSITION_UNITS_PER_TILE +
        Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    ),
    terrain: entry.tile.terrain,
    elevation: entry.tile.elevation,
    lowTideDepth: 0,
    highTideDepth: 0,
    heat: entry.heat,
    salinity: entry.salinity,
    cold: entry.cold,
    forageDistanceTiles: entry.forageDistanceTiles,
    habitatScore: entry.habitatScore,
    allocatedPopulation: 1,
  });
}

function cacheKey(seed: RootSeed, region: RegionCoord): string {
  return hashCanonical([
    CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_OWNER_ID,
    CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
    seed,
    region.x,
    region.y,
  ]);
}

function cacheHabitat(
  key: string,
  habitat: CoreEcologyPolarConsumerHabitat,
): CoreEcologyPolarConsumerHabitat {
  HABITAT_CACHE.delete(key);
  HABITAT_CACHE.set(key, habitat);
  while (HABITAT_CACHE.size > CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_CACHE_LIMIT) {
    const oldest = HABITAT_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    HABITAT_CACHE.delete(oldest);
  }
  return habitat;
}

export function clearCoreEcologyPolarConsumerHabitatCache(): void {
  HABITAT_CACHE.clear();
}

export function deriveCoreEcologyPolarConsumerHabitat(
  input: DeriveCoreEcologyPolarConsumerHabitatInput,
): CoreEcologyPolarConsumerHabitat {
  if (!plainRecord(input)) {
    throw new TypeError("Polar-consumer habitat input is malformed");
  }
  requireRootSeed(input.seed);
  if (!isRegionCoord(input.region)) {
    throw new RangeError("Polar-consumer habitat requires a canonical region");
  }
  const region = createRegionCoord(input.region.x, input.region.y);
  const key = cacheKey(input.seed, region);
  if (input.terrain === undefined) {
    const cached = HABITAT_CACHE.get(key);
    if (cached !== undefined) return cacheHabitat(key, cached);
  }
  const terrain = canonicalTerrain(input.seed, region, input.terrain);
  const cached = HABITAT_CACHE.get(key);
  if (cached !== undefined) return cacheHabitat(key, cached);
  const polar = deriveCoreEcologyPolarShoreHabitat({
    seed: input.seed,
    region,
    terrain,
  });
  const forageSubstrate = forageReceipt(polar);
  const waterTiles = analyzeWaterAnchors(input.seed, region, terrain, polar);
  const foragingWater = waterTiles[0];
  const dry = analyzeDryTiles(input.seed, region, terrain, foragingWater);
  const haulout = dry.tiles[0];
  const sealAdmitted =
    forageSubstrate.viable &&
    foragingWater !== undefined &&
    haulout !== undefined;
  const sealReason: CoreEcologyPolarConsumerAdmissionReason = sealAdmitted
    ? "admitted"
    : !forageSubstrate.viable
      ? "forage-substrate-absent"
      : foragingWater === undefined
        ? "foraging-water-absent"
        : "dry-haulout-absent";
  const sealUnits = (sealAdmitted ? 1 : 0) as 0 | 1;
  const sealStableId = stableRegionObjectId(
    input.seed,
    region,
    "polar-consumer-population",
    "harbor-seal",
  );
  const sealPopulationKey = `pc1:${hashCanonical({
    regionId: stableRegionId(input.seed, region),
    species: "harbor-seal",
  })}:harbor-seal`;
  const sealAnchors = sealAdmitted
    ? Object.freeze([
        waterAnchor(input.seed, region, foragingWater),
        landAnchor(
          input.seed,
          region,
          "harbor-seal",
          "dry-haulout",
          1,
          haulout,
        ),
      ])
    : Object.freeze([]);
  const habitatSignal =
    !sealAdmitted || foragingWater === undefined || haulout === undefined
      ? 0
      : fixedWeighted([
          [foragingWater.habitatScore, 6],
          [haulout.habitatScore, 4],
          [forageSubstrate.viable ? FIXED_POINT : 0, 2],
        ]);
  const sealCandidate: CoreEcologyPolarConsumerPopulationCandidate = deepFreeze(
    {
      version: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION,
      stableId: sealStableId,
      populationKey: sealPopulationKey,
      species: "harbor-seal",
      guild: "marine-consumer",
      actorRepresentation: "individual",
      habitatScore: habitatSignal,
      suitableTileCount: Math.min(waterTiles.length, dry.tiles.length),
      habitatCapacity: sealUnits,
      forageSupportPopulationKey: forageSubstrate.capelinPopulationKey,
      forageSupportUnits: forageSubstrate.capelinPopulationUnits,
      sealSupportStableId: null,
      sealSupportPopulationKey: null,
      sealSupportUnits: 0,
      territoryId: null,
      territoryHostRegion: null,
      territoryOwnedHere: false,
      densityRoll: 0,
      densityThreshold: 0,
      populationUnits: sealUnits,
      admissionReason: sealReason,
      anchors: sealAnchors,
    },
  );

  const bearTerritory = deriveCoreEcologyPolarConsumerTerritory(
    input.seed,
    region,
  );
  const bearDensityRoll = Math.trunc(
    (keyedRandomU32(input.seed, BEAR_DENSITY_DOMAIN, region.x, region.y, 0) *
      FIXED_POINT) /
      (UINT32_MAX + 1),
  );
  const bearLand = dry.tiles[1] ?? dry.tiles[0];
  const bearAdmitted =
    sealCandidate.populationUnits === 1 &&
    bearTerritory.regionIsHost &&
    bearDensityRoll < CORE_ECOLOGY_POLAR_CONSUMER_BEAR_DENSITY_THRESHOLD &&
    bearLand !== undefined;
  const bearReason: CoreEcologyPolarConsumerAdmissionReason = bearAdmitted
    ? "admitted"
    : sealCandidate.populationUnits === 0
      ? "seal-candidate-absent"
      : !bearTerritory.regionIsHost
        ? "territory-owned-elsewhere"
        : bearDensityRoll >= CORE_ECOLOGY_POLAR_CONSUMER_BEAR_DENSITY_THRESHOLD
          ? "density-roll-failed"
          : "bear-land-absent";
  const bearUnits = (bearAdmitted ? 1 : 0) as 0 | 1;
  const bearCandidate: CoreEcologyPolarConsumerPopulationCandidate = deepFreeze(
    {
      version: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION,
      stableId: stableRegionObjectId(
        input.seed,
        region,
        "polar-consumer-population",
        "polar-bear",
      ),
      populationKey: `pc1:${hashCanonical({
        regionId: stableRegionId(input.seed, region),
        species: "polar-bear",
      })}:polar-bear`,
      species: "polar-bear",
      guild: "polar-consumer",
      actorRepresentation: "individual",
      habitatScore: sealCandidate.habitatScore,
      suitableTileCount: dry.tiles.length,
      habitatCapacity: (sealUnits === 1 && bearLand !== undefined ? 1 : 0) as
        0 | 1,
      forageSupportPopulationKey: forageSubstrate.capelinPopulationKey,
      forageSupportUnits: forageSubstrate.capelinPopulationUnits,
      sealSupportStableId: sealStableId,
      sealSupportPopulationKey: sealPopulationKey,
      sealSupportUnits: sealUnits,
      territoryId: bearTerritory.stableId,
      territoryHostRegion: bearTerritory.hostRegion,
      territoryOwnedHere: bearTerritory.regionIsHost,
      densityRoll: bearDensityRoll,
      densityThreshold: CORE_ECOLOGY_POLAR_CONSUMER_BEAR_DENSITY_THRESHOLD,
      populationUnits: bearUnits,
      admissionReason: bearReason,
      anchors:
        bearAdmitted && bearLand !== undefined
          ? Object.freeze([
              landAnchor(
                input.seed,
                region,
                "polar-bear",
                "bear-land",
                0,
                bearLand,
              ),
            ])
          : Object.freeze([]),
    },
  );
  const totalPopulationUnits = (sealUnits + bearUnits) as 0 | 1 | 2;
  const eligibleCount = dry.tiles.length;
  const averageEligibleHeat =
    eligibleCount === 0
      ? FIXED_POINT
      : Math.trunc(
          dry.tiles.reduce((sum, entry) => sum + entry.heat, 0) / eligibleCount,
        );
  const averageEligibleSalinity =
    eligibleCount === 0
      ? 0
      : Math.trunc(
          dry.tiles.reduce((sum, entry) => sum + entry.salinity, 0) /
            eligibleCount,
        );
  const summary: CoreEcologyPolarConsumerTerrainSummary = deepFreeze({
    tileCount: terrain.tiles.length,
    authenticatedForagingWaterCount: waterTiles.length,
    allTideDryTileCount: dry.allTideDryTileCount,
    reachableDryHauloutTileCount: dry.tiles.length,
    bearLandTileCount: dry.tiles.length,
    averageEligibleHeat,
    averageEligibleSalinity,
    coldSignal: eligibleCount === 0 ? 0 : FIXED_POINT - averageEligibleHeat,
    shoreSignal: ratioFixed(
      eligibleCount,
      Math.max(1, dry.allTideDryTileCount),
    ),
    habitatSignal,
  });
  const base = {
    version: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
    region,
    regionId: stableRegionId(input.seed, region),
    sourceStableId: stableRegionObjectId(
      input.seed,
      region,
      "polar-consumer-source",
      CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
    ),
    terrainHash: regionTerrainHash(terrain),
    forageSubstrate,
    bearTerritory,
    summary,
    evaluatedSpeciesCount: 2 as const,
    populations: Object.freeze([sealCandidate, bearCandidate]) as readonly [
      CoreEcologyPolarConsumerPopulationCandidate,
      CoreEcologyPolarConsumerPopulationCandidate,
    ],
    totalPopulationUnits,
    admittedSpeciesCount: totalPopulationUnits,
  } as const;
  const habitat = canonicalizeCoreEcologyPolarConsumerHabitat({
    ...base,
    derivationHash: hashCanonical(base),
  });
  if (habitat === null) {
    throw new Error("Generated polar-consumer habitat failed validation");
  }
  return cacheHabitat(key, habitat);
}

export function canonicalizeCoreEcologyPolarConsumerHabitat(
  value: unknown,
): CoreEcologyPolarConsumerHabitat | null {
  if (
    typeof value === "object" &&
    value !== null &&
    TRUSTED_HABITATS.has(value)
  ) {
    return value as CoreEcologyPolarConsumerHabitat;
  }
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "admittedSpeciesCount",
      "bearTerritory",
      "derivationHash",
      "derivationKind",
      "evaluatedSpeciesCount",
      "forageSubstrate",
      "ownerId",
      "populations",
      "region",
      "regionId",
      "sourceStableId",
      "summary",
      "terrainHash",
      "totalPopulationUnits",
      "version",
    ]) ||
    value.version !== CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION ||
    value.ownerId !== CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_OWNER_ID ||
    value.derivationKind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND ||
    !isRegionCoord(value.region) ||
    !validId(value.regionId) ||
    !validId(value.sourceStableId) ||
    !validHash(value.terrainHash) ||
    value.evaluatedSpeciesCount !== 2 ||
    !Array.isArray(value.populations) ||
    value.populations.length !== 2 ||
    !countWithin(value.totalPopulationUnits, 2) ||
    value.admittedSpeciesCount !== value.totalPopulationUnits ||
    !validHash(value.derivationHash)
  ) {
    return null;
  }
  const forageSubstrate = canonicalForageSubstrate(value.forageSubstrate);
  const bearTerritory = canonicalTerritory(value.bearTerritory);
  const summary = canonicalSummary(value.summary);
  if (forageSubstrate === null || bearTerritory === null || summary === null) {
    return null;
  }
  const seal = canonicalPopulation(
    value.populations[0],
    value.region,
    "harbor-seal",
    forageSubstrate,
    summary,
  );
  const bear = canonicalPopulation(
    value.populations[1],
    value.region,
    "polar-bear",
    forageSubstrate,
    summary,
  );
  if (
    seal === null ||
    bear === null ||
    seal.populationUnits + bear.populationUnits !==
      value.totalPopulationUnits ||
    bear.sealSupportStableId !== seal.stableId ||
    bear.sealSupportPopulationKey !== seal.populationKey ||
    bear.sealSupportUnits !== seal.populationUnits ||
    bear.territoryId !== bearTerritory.stableId ||
    stableStringify(bear.territoryHostRegion) !==
      stableStringify(bearTerritory.hostRegion) ||
    bear.territoryOwnedHere !== bearTerritory.regionIsHost ||
    (bear.populationUnits === 1 &&
      (seal.populationUnits !== 1 ||
        !bearTerritory.regionIsHost ||
        bear.densityRoll >= bear.densityThreshold))
  ) {
    return null;
  }
  const base = {
    version: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
    region: createRegionCoord(value.region.x, value.region.y),
    regionId: value.regionId,
    sourceStableId: value.sourceStableId,
    terrainHash: value.terrainHash,
    forageSubstrate,
    bearTerritory,
    summary,
    evaluatedSpeciesCount: 2 as const,
    populations: Object.freeze([seal, bear]) as readonly [
      CoreEcologyPolarConsumerPopulationCandidate,
      CoreEcologyPolarConsumerPopulationCandidate,
    ],
    totalPopulationUnits: value.totalPopulationUnits as 0 | 1 | 2,
    admittedSpeciesCount: value.admittedSpeciesCount as 0 | 1 | 2,
  } as const;
  if (hashCanonical(base) !== value.derivationHash) return null;
  const habitat = deepFreeze({ ...base, derivationHash: value.derivationHash });
  TRUSTED_HABITATS.add(habitat);
  return habitat;
}

export function canonicalCoreEcologyPolarConsumerHabitatForWorld(
  value: unknown,
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyPolarConsumerHabitat | null {
  const habitat = canonicalizeCoreEcologyPolarConsumerHabitat(value);
  if (habitat === null || !isRegionCoord(region)) return null;
  try {
    requireRootSeed(seed);
    const expected = deriveCoreEcologyPolarConsumerHabitat({ seed, region });
    return stableStringify(habitat) === stableStringify(expected)
      ? habitat
      : null;
  } catch {
    return null;
  }
}

function canonicalForageSubstrate(
  value: unknown,
): CoreEcologyPolarConsumerForageSubstrate | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "capelinPopulationKey",
      "capelinPopulationStableId",
      "capelinPopulationUnits",
      "polarShoreHabitatHash",
      "polarShoreSourceStableId",
      "viable",
    ]) ||
    !validId(value.polarShoreSourceStableId) ||
    !validHash(value.polarShoreHabitatHash) ||
    !validId(value.capelinPopulationStableId) ||
    !validId(value.capelinPopulationKey) ||
    !nonnegativeSafeInteger(value.capelinPopulationUnits) ||
    typeof value.viable !== "boolean" ||
    value.viable !== value.capelinPopulationUnits > 0
  ) {
    return null;
  }
  return deepFreeze({
    polarShoreSourceStableId: value.polarShoreSourceStableId,
    polarShoreHabitatHash: value.polarShoreHabitatHash,
    capelinPopulationStableId: value.capelinPopulationStableId,
    capelinPopulationKey: value.capelinPopulationKey,
    capelinPopulationUnits: value.capelinPopulationUnits,
    viable: value.viable,
  });
}

function canonicalTerritory(
  value: unknown,
): CoreEcologyPolarConsumerTerritory | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "address",
      "bounds",
      "hostRegion",
      "regionIsHost",
      "spanRegions",
      "species",
      "stableId",
      "version",
    ]) ||
    value.version !== CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION ||
    !validId(value.stableId) ||
    value.species !== "polar-bear" ||
    !plainRecord(value.address) ||
    !exactKeys(value.address, ["x", "y"]) ||
    !Number.isSafeInteger(value.address.x) ||
    !Number.isSafeInteger(value.address.y) ||
    value.spanRegions !== CORE_ECOLOGY_POLAR_CONSUMER_TERRITORY_SPAN_REGIONS ||
    !plainRecord(value.bounds) ||
    !exactKeys(value.bounds, ["maximum", "minimum"]) ||
    !isRegionCoord(value.bounds.minimum) ||
    !isRegionCoord(value.bounds.maximum) ||
    !isRegionCoord(value.hostRegion) ||
    typeof value.regionIsHost !== "boolean"
  ) {
    return null;
  }
  return deepFreeze({
    version: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION,
    stableId: value.stableId,
    species: "polar-bear",
    address: Object.freeze({
      x: value.address.x as number,
      y: value.address.y as number,
    }),
    spanRegions: CORE_ECOLOGY_POLAR_CONSUMER_TERRITORY_SPAN_REGIONS,
    bounds: Object.freeze({
      minimum: createRegionCoord(
        value.bounds.minimum.x,
        value.bounds.minimum.y,
      ),
      maximum: createRegionCoord(
        value.bounds.maximum.x,
        value.bounds.maximum.y,
      ),
    }),
    hostRegion: createRegionCoord(value.hostRegion.x, value.hostRegion.y),
    regionIsHost: value.regionIsHost,
  });
}

function canonicalSummary(
  value: unknown,
): CoreEcologyPolarConsumerTerrainSummary | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "allTideDryTileCount",
      "authenticatedForagingWaterCount",
      "averageEligibleHeat",
      "averageEligibleSalinity",
      "bearLandTileCount",
      "coldSignal",
      "habitatSignal",
      "reachableDryHauloutTileCount",
      "shoreSignal",
      "tileCount",
    ]) ||
    value.tileCount !== WORLD_WIDTH * WORLD_HEIGHT ||
    !countWithin(value.authenticatedForagingWaterCount, 4) ||
    !countWithin(value.allTideDryTileCount, value.tileCount) ||
    !countWithin(
      value.reachableDryHauloutTileCount,
      value.allTideDryTileCount,
    ) ||
    value.bearLandTileCount !== value.reachableDryHauloutTileCount ||
    !fixedInteger(value.averageEligibleHeat) ||
    !fixedInteger(value.averageEligibleSalinity) ||
    !fixedInteger(value.coldSignal) ||
    !fixedInteger(value.shoreSignal) ||
    !fixedInteger(value.habitatSignal)
  ) {
    return null;
  }
  return deepFreeze({
    tileCount: value.tileCount,
    authenticatedForagingWaterCount: value.authenticatedForagingWaterCount,
    allTideDryTileCount: value.allTideDryTileCount,
    reachableDryHauloutTileCount: value.reachableDryHauloutTileCount,
    bearLandTileCount: value.bearLandTileCount,
    averageEligibleHeat: value.averageEligibleHeat,
    averageEligibleSalinity: value.averageEligibleSalinity,
    coldSignal: value.coldSignal,
    shoreSignal: value.shoreSignal,
    habitatSignal: value.habitatSignal,
  });
}

function canonicalPopulation(
  value: unknown,
  region: RegionCoord,
  species: CoreEcologyPolarConsumerSpecies,
  substrate: CoreEcologyPolarConsumerForageSubstrate,
  summary: CoreEcologyPolarConsumerTerrainSummary,
): CoreEcologyPolarConsumerPopulationCandidate | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "actorRepresentation",
      "admissionReason",
      "anchors",
      "densityRoll",
      "densityThreshold",
      "forageSupportPopulationKey",
      "forageSupportUnits",
      "guild",
      "habitatCapacity",
      "habitatScore",
      "populationKey",
      "populationUnits",
      "sealSupportPopulationKey",
      "sealSupportStableId",
      "sealSupportUnits",
      "species",
      "stableId",
      "suitableTileCount",
      "territoryHostRegion",
      "territoryId",
      "territoryOwnedHere",
      "version",
    ]) ||
    value.version !== CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION ||
    value.species !== species ||
    value.guild !==
      (species === "harbor-seal" ? "marine-consumer" : "polar-consumer") ||
    value.actorRepresentation !== "individual" ||
    !validId(value.stableId) ||
    !validId(value.populationKey) ||
    !fixedInteger(value.habitatScore) ||
    !nonnegativeSafeInteger(value.suitableTileCount) ||
    (value.habitatCapacity !== 0 && value.habitatCapacity !== 1) ||
    value.forageSupportPopulationKey !== substrate.capelinPopulationKey ||
    value.forageSupportUnits !== substrate.capelinPopulationUnits ||
    (value.sealSupportUnits !== 0 && value.sealSupportUnits !== 1) ||
    typeof value.territoryOwnedHere !== "boolean" ||
    !fixedInteger(value.densityRoll) ||
    !fixedInteger(value.densityThreshold) ||
    (value.populationUnits !== 0 && value.populationUnits !== 1) ||
    value.populationUnits > value.habitatCapacity ||
    typeof value.admissionReason !== "string" ||
    !ADMISSION_REASONS.has(
      value.admissionReason as CoreEcologyPolarConsumerAdmissionReason,
    ) ||
    !Array.isArray(value.anchors)
  ) {
    return null;
  }
  if (species === "harbor-seal") {
    if (
      value.sealSupportStableId !== null ||
      value.sealSupportPopulationKey !== null ||
      value.sealSupportUnits !== 0 ||
      value.territoryId !== null ||
      value.territoryHostRegion !== null ||
      value.territoryOwnedHere ||
      value.densityRoll !== 0 ||
      value.densityThreshold !== 0 ||
      value.habitatScore !== summary.habitatSignal ||
      value.populationUnits !== value.habitatCapacity ||
      (value.populationUnits === 1) !== (value.anchors.length === 2)
    ) {
      return null;
    }
  } else if (
    !validId(value.sealSupportStableId) ||
    !validId(value.sealSupportPopulationKey) ||
    !validId(value.territoryId) ||
    !isRegionCoord(value.territoryHostRegion) ||
    value.densityThreshold !==
      CORE_ECOLOGY_POLAR_CONSUMER_BEAR_DENSITY_THRESHOLD ||
    (value.populationUnits === 1) !== (value.anchors.length === 1)
  ) {
    return null;
  }
  const anchors: CoreEcologyPolarConsumerPopulationAnchor[] = [];
  for (const raw of value.anchors) {
    const anchor = canonicalAnchor(raw, region, species);
    if (anchor === null) return null;
    anchors.push(anchor);
  }
  if (
    species === "harbor-seal" &&
    anchors.length === 2 &&
    (anchors[0]!.purpose !== "foraging-water" ||
      anchors[1]!.purpose !== "dry-haulout" ||
      (anchors[0]!.globalX === anchors[1]!.globalX &&
        anchors[0]!.globalY === anchors[1]!.globalY))
  ) {
    return null;
  }
  if (
    species === "polar-bear" &&
    anchors.length === 1 &&
    anchors[0]!.purpose !== "bear-land"
  ) {
    return null;
  }
  return deepFreeze({
    version: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_VERSION,
    stableId: value.stableId,
    populationKey: value.populationKey,
    species,
    guild: species === "harbor-seal" ? "marine-consumer" : "polar-consumer",
    actorRepresentation: "individual",
    habitatScore: value.habitatScore,
    suitableTileCount: value.suitableTileCount,
    habitatCapacity: value.habitatCapacity,
    forageSupportPopulationKey: value.forageSupportPopulationKey,
    forageSupportUnits: value.forageSupportUnits,
    sealSupportStableId: value.sealSupportStableId,
    sealSupportPopulationKey: value.sealSupportPopulationKey,
    sealSupportUnits: value.sealSupportUnits,
    territoryId: value.territoryId,
    territoryHostRegion:
      value.territoryHostRegion === null
        ? null
        : createRegionCoord(
            value.territoryHostRegion.x,
            value.territoryHostRegion.y,
          ),
    territoryOwnedHere: value.territoryOwnedHere,
    densityRoll: value.densityRoll,
    densityThreshold: value.densityThreshold,
    populationUnits: value.populationUnits,
    admissionReason:
      value.admissionReason as CoreEcologyPolarConsumerAdmissionReason,
    anchors: Object.freeze(anchors),
  });
}

function canonicalAnchor(
  value: unknown,
  region: RegionCoord,
  species: CoreEcologyPolarConsumerSpecies,
): CoreEcologyPolarConsumerPopulationAnchor | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "allocatedPopulation",
      "anchorOrdinal",
      "cold",
      "elevation",
      "forageDistanceTiles",
      "globalX",
      "globalY",
      "habitatScore",
      "heat",
      "highTideDepth",
      "localX",
      "localY",
      "lowTideDepth",
      "medium",
      "position",
      "purpose",
      "salinity",
      "sourceAnchorStableId",
      "stableId",
      "terrain",
    ]) ||
    !validId(value.stableId) ||
    !nonnegativeSafeInteger(value.anchorOrdinal) ||
    !ANCHOR_PURPOSES.has(
      value.purpose as CoreEcologyPolarConsumerAnchorPurpose,
    ) ||
    (value.medium !== "land" && value.medium !== "surface-water") ||
    (value.sourceAnchorStableId !== null &&
      !validId(value.sourceAnchorStableId)) ||
    !nonnegativeSafeInteger(value.localX) ||
    value.localX >= WORLD_WIDTH ||
    !nonnegativeSafeInteger(value.localY) ||
    value.localY >= WORLD_HEIGHT ||
    !Number.isSafeInteger(value.globalX) ||
    !Number.isSafeInteger(value.globalY) ||
    !isWorldPosition(value.position) ||
    value.position.region.x !== region.x ||
    value.position.region.y !== region.y ||
    !TERRAINS.has(
      value.terrain as CoreEcologyPolarConsumerPopulationAnchor["terrain"],
    ) ||
    !fixedInteger(value.elevation) ||
    !nonnegativeSafeInteger(value.lowTideDepth) ||
    !nonnegativeSafeInteger(value.highTideDepth) ||
    !fixedInteger(value.heat) ||
    !fixedInteger(value.salinity) ||
    !fixedInteger(value.cold) ||
    value.cold !== FIXED_POINT - value.heat ||
    !nonnegativeSafeInteger(value.forageDistanceTiles) ||
    !fixedInteger(value.habitatScore) ||
    value.allocatedPopulation !== 1
  ) {
    return null;
  }
  const purpose = value.purpose as CoreEcologyPolarConsumerAnchorPurpose;
  const water = purpose === "foraging-water";
  if (
    water !== (value.medium === "surface-water") ||
    water !== (value.sourceAnchorStableId !== null) ||
    water !==
      (value.terrain === "deep-water" || value.terrain === "tidal-flat") ||
    (!water && value.elevation < MAX_TIDE_LEVEL) ||
    (!water && (value.lowTideDepth !== 0 || value.highTideDepth !== 0)) ||
    (species === "harbor-seal" &&
      !(
        (purpose === "foraging-water" && value.anchorOrdinal === 0) ||
        (purpose === "dry-haulout" && value.anchorOrdinal === 1)
      )) ||
    (species === "polar-bear" &&
      (purpose !== "bear-land" || value.anchorOrdinal !== 0))
  ) {
    return null;
  }
  return deepFreeze({
    stableId: value.stableId,
    anchorOrdinal: value.anchorOrdinal,
    purpose,
    medium: value.medium,
    sourceAnchorStableId: value.sourceAnchorStableId,
    localX: value.localX,
    localY: value.localY,
    globalX: value.globalX as number,
    globalY: value.globalY as number,
    position: value.position,
    terrain:
      value.terrain as CoreEcologyPolarConsumerPopulationAnchor["terrain"],
    elevation: value.elevation,
    lowTideDepth: value.lowTideDepth,
    highTideDepth: value.highTideDepth,
    heat: value.heat,
    salinity: value.salinity,
    cold: value.cold,
    forageDistanceTiles: value.forageDistanceTiles,
    habitatScore: value.habitatScore,
    allocatedPopulation: 1,
  });
}

const ADMISSION_REASONS = new Set<CoreEcologyPolarConsumerAdmissionReason>([
  "admitted",
  "bear-land-absent",
  "density-roll-failed",
  "dry-haulout-absent",
  "forage-substrate-absent",
  "foraging-water-absent",
  "seal-candidate-absent",
  "territory-owned-elsewhere",
]);
const ANCHOR_PURPOSES = new Set<CoreEcologyPolarConsumerAnchorPurpose>([
  "foraging-water",
  "dry-haulout",
  "bear-land",
]);
const TERRAINS = new Set<CoreEcologyPolarConsumerPopulationAnchor["terrain"]>([
  "deep-water",
  "meadow",
  "ridge",
  "tidal-flat",
]);

function requireRootSeed(seed: RootSeed): void {
  if (
    !Array.isArray(seed) ||
    seed.length !== 4 ||
    seed.some(
      (word) =>
        !Number.isSafeInteger(word) ||
        word < 0 ||
        word > UINT32_MAX ||
        Object.is(word, -0),
    )
  ) {
    throw new RangeError("Polar-consumer seed must contain four uint32 words");
  }
}

function fixedInteger(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= FIXED_POINT &&
    !Object.is(value, -0)
  );
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    !Object.is(value, -0)
  );
}

function countWithin(value: unknown, maximum: number): value is number {
  return nonnegativeSafeInteger(value) && value <= maximum;
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
