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
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION = 1 as const;
export const CORE_ECOLOGY_POLAR_SHORE_HABITAT_OWNER_ID =
  "game:core-ecology-polar-shore-habitat:v1" as const;
export const CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND =
  "regional-polar-shore-v1" as const;
export const CORE_ECOLOGY_POLAR_SHORE_SPECIES = Object.freeze([
  "atlantic-capelin",
] as const);
export const CORE_ECOLOGY_POLAR_SHORE_HABITAT_CACHE_LIMIT = 128 as const;
export const CORE_ECOLOGY_POLAR_SHORE_TERRITORY_SPAN_REGIONS = 2 as const;
export const CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION = 64 as const;
export const CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_ANCHORS = 4 as const;
export const CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH = 35_000 as const;

export type CoreEcologyPolarShoreSpecies =
  (typeof CORE_ECOLOGY_POLAR_SHORE_SPECIES)[number];
export type CoreEcologyPolarShoreAnchorPurpose =
  "low-tide-refuge" | "tidal-edge";
export type CoreEcologyPolarShoreAdmissionReason =
  | "admitted"
  | "density-roll-failed"
  | "habitat-capacity-zero"
  | "regional-quiet"
  | "territory-owned-elsewhere";

export interface CoreEcologyPolarShoreTerritory {
  readonly version: typeof CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION;
  readonly stableId: string;
  readonly species: CoreEcologyPolarShoreSpecies;
  readonly address: Readonly<{ readonly x: number; readonly y: number }>;
  readonly spanRegions: typeof CORE_ECOLOGY_POLAR_SHORE_TERRITORY_SPAN_REGIONS;
  readonly bounds: Readonly<{
    readonly minimum: RegionCoord;
    readonly maximum: RegionCoord;
  }>;
  readonly hostRegion: RegionCoord;
  readonly regionIsHost: boolean;
}

export interface CoreEcologyPolarShoreTerrainSummary {
  readonly tileCount: number;
  readonly openWaterTileCount: number;
  readonly shorelineWaterTileCount: number;
  readonly coldWaterTileCount: number;
  readonly salineWaterTileCount: number;
  readonly coldSalineShoreTileCount: number;
  readonly lowTideRefugeTileCount: number;
  readonly tidalEdgeTileCount: number;
  readonly averageEligibleHeat: number;
  readonly averageEligibleSalinity: number;
  readonly coldSignal: number;
  readonly salinitySignal: number;
  readonly shorelineSignal: number;
  readonly tidalEdgeSignal: number;
  readonly polarShoreSignal: number;
}

export interface CoreEcologyPolarShoreDensityAdmission {
  readonly regionalQuietRoll: number;
  readonly regionalQuietThreshold: number;
  readonly regionalQuiet: boolean;
  readonly aquaticPreyCeiling: typeof CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION;
}

/**
 * Stable depth source and aggregate anchor. Elevation is saved explicitly so
 * later tide projection never needs camera state, hidden presentation data, or
 * a regenerated terrain query.
 */
export interface CoreEcologyPolarShorePopulationAnchor {
  readonly stableId: string;
  readonly anchorOrdinal: number;
  readonly purpose: CoreEcologyPolarShoreAnchorPurpose;
  readonly localX: number;
  readonly localY: number;
  readonly globalX: number;
  readonly globalY: number;
  readonly position: WorldPosition;
  readonly elevation: number;
  readonly lowTideDepth: number;
  readonly highTideDepth: number;
  readonly heat: number;
  readonly salinity: number;
  readonly shorelineDistance: number;
  readonly habitatScore: number;
  readonly allocatedPopulation: number;
}

/** Minimal saved-depth contract consumed by the shared tidal-table owner. */
export interface CoreEcologyPolarShoreTidalAnchor {
  readonly species: CoreEcologyPolarShoreSpecies;
  readonly purpose: "population";
  readonly anchorOrdinal: number;
  readonly position: WorldPosition;
  readonly elevation: number;
}

/**
 * Shape intentionally follows the shared regional population vocabulary.
 * This lets the aggregate patch owner consume it through the same adapter as
 * pikas and signed-region populations instead of minting a polar-only patch.
 */
export interface CoreEcologyPolarShorePopulationCandidate {
  readonly version: typeof CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION;
  readonly stableId: string;
  readonly populationKey: string;
  readonly species: CoreEcologyPolarShoreSpecies;
  readonly guild: "aquatic-prey";
  readonly actorRepresentation: "aggregate";
  readonly territoryId: string;
  readonly territoryHostRegion: RegionCoord;
  readonly territoryOwnedHere: boolean;
  readonly habitatScore: number;
  readonly suitableTileCount: number;
  readonly habitatCapacity: number;
  readonly densityRoll: number;
  readonly densityThreshold: number;
  readonly preySupportUnits: 0;
  readonly trophicCeiling: number;
  readonly guildCeiling: typeof CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION;
  readonly populationUnits: number;
  readonly admissionReason: CoreEcologyPolarShoreAdmissionReason;
  readonly activitySignal: Readonly<{
    readonly kind: "foraging";
    readonly intensity: number;
    readonly activePeriod: "variable";
    readonly source: "habitat-derived";
  }>;
  readonly anchors: readonly CoreEcologyPolarShorePopulationAnchor[];
}

export interface CoreEcologyPolarShoreHabitat {
  readonly version: typeof CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_POLAR_SHORE_HABITAT_OWNER_ID;
  readonly derivationKind: typeof CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND;
  readonly region: RegionCoord;
  readonly regionId: string;
  readonly sourceStableId: string;
  readonly terrainHash: string;
  readonly summary: CoreEcologyPolarShoreTerrainSummary;
  readonly density: CoreEcologyPolarShoreDensityAdmission;
  readonly evaluatedSpeciesCount: 1;
  readonly populations: readonly [CoreEcologyPolarShorePopulationCandidate];
  /** Saved elevation projection; the generic tidal table remains sole tide-law owner. */
  readonly tidalAnchors: readonly CoreEcologyPolarShoreTidalAnchor[];
  readonly totalPopulationUnits: number;
  readonly admittedSpeciesCount: 0 | 1;
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyPolarShoreHabitatInput {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  /** Optional canonical terrain multiset; ordering never contributes to truth. */
  readonly terrain?: TerrainState;
}

interface AnalyzedPolarShoreTile {
  readonly tile: TerrainTile;
  readonly globalX: number;
  readonly globalY: number;
  readonly heat: number;
  readonly salinity: number;
  readonly cold: number;
  readonly shorelineDistance: number;
  readonly lowTideDepth: number;
  readonly highTideDepth: number;
  readonly purpose: CoreEcologyPolarShoreAnchorPurpose;
  readonly habitatScore: number;
  readonly placementRank: number;
}

const UINT32_MAX = 0xffff_ffff;
const POLAR_SHORE_HABITAT_DOMAIN = 0x5053_4842;
const POLAR_SHORE_DENSITY_DOMAIN = 0x5053_4844;
const POLAR_SHORE_TERRITORY_DOMAIN = 0x5053_4854;
const POLAR_SHORE_ANCHOR_DOMAIN = 0x5053_4841;
const HASH_PATTERN = /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/u;
const MINIMUM_COLD_SIGNAL = 540_000;
const MINIMUM_SALINITY = 570_000;
const MAXIMUM_SHORELINE_DISTANCE = 14;
const MINIMUM_SITE_SCORE = 560_000;
const MINIMUM_POPULATION = 8;
const TRUSTED_HABITATS = new WeakSet<object>();
const HABITAT_CACHE = new Map<string, CoreEcologyPolarShoreHabitat>();

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

function polarFloorDivide(value: number, divisor: number): number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw new RangeError(
      "Polar-shore territory address must be a canonical safe integer",
    );
  }
  return Math.floor(value / divisor);
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
  )
    throw new TypeError(
      "Supplied polar-shore terrain has noncanonical dimensions",
    );
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
  )
    throw new TypeError(
      "Supplied polar-shore terrain is not the canonical terrain multiset",
    );
  return generated;
}

function territoryBounds(
  address: Readonly<{ readonly x: number; readonly y: number }>,
): Readonly<{ readonly minimum: RegionCoord; readonly maximum: RegionCoord }> {
  const span = CORE_ECOLOGY_POLAR_SHORE_TERRITORY_SPAN_REGIONS;
  const mathematicalMinimumX = address.x * span;
  const mathematicalMinimumY = address.y * span;
  const mathematicalMaximumX = mathematicalMinimumX + span - 1;
  const mathematicalMaximumY = mathematicalMinimumY + span - 1;
  return Object.freeze({
    minimum: createRegionCoord(
      Math.max(-REGION_COORD_LIMIT, mathematicalMinimumX),
      Math.max(-REGION_COORD_LIMIT, mathematicalMinimumY),
    ),
    maximum: createRegionCoord(
      Math.min(REGION_COORD_LIMIT, mathematicalMaximumX),
      Math.min(REGION_COORD_LIMIT, mathematicalMaximumY),
    ),
  });
}

export function deriveCoreEcologyPolarShoreTerritory(
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyPolarShoreTerritory {
  requireRootSeed(seed);
  if (!isRegionCoord(region))
    throw new RangeError("Polar-shore territory requires a region");
  const span = CORE_ECOLOGY_POLAR_SHORE_TERRITORY_SPAN_REGIONS;
  const address = Object.freeze({
    x: polarFloorDivide(region.x, span),
    y: polarFloorDivide(region.y, span),
  });
  const bounds = territoryBounds(address);
  const width = bounds.maximum.x - bounds.minimum.x + 1;
  const height = bounds.maximum.y - bounds.minimum.y + 1;
  const hostOrdinal = keyedRandomInt(
    seed,
    POLAR_SHORE_TERRITORY_DOMAIN,
    address.x,
    address.y,
    semanticPurpose("host:atlantic-capelin"),
    0,
    width * height - 1,
  );
  const hostRegion = createRegionCoord(
    bounds.minimum.x + (hostOrdinal % width),
    bounds.minimum.y + Math.trunc(hostOrdinal / width),
  );
  return deepFreeze({
    version: CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION,
    stableId: stableRegionObjectId(
      seed,
      hostRegion,
      "polar-shore-territory",
      "atlantic-capelin",
    ),
    species: "atlantic-capelin",
    address,
    spanRegions: span,
    bounds,
    hostRegion,
    regionIsHost: hostRegion.x === region.x && hostRegion.y === region.y,
  });
}

function isOpenWater(tile: TerrainTile): boolean {
  return tile.terrain === "deep-water" || tile.terrain === "tidal-flat";
}

/** Exact Manhattan distance to the nearest dry tile in the canonical region. */
function shorelineDistances(terrain: TerrainState): Int16Array {
  const size = terrain.tiles.length;
  const distances = new Int16Array(size);
  distances.fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (const tile of terrain.tiles) {
    if (isOpenWater(tile)) continue;
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

function analyzeTerrain(
  seed: RootSeed,
  region: RegionCoord,
  terrain: TerrainState,
): Readonly<{
  readonly tiles: readonly AnalyzedPolarShoreTile[];
  readonly summary: CoreEcologyPolarShoreTerrainSummary;
}> {
  const distances = shorelineDistances(terrain);
  const tiles: AnalyzedPolarShoreTile[] = [];
  let openWaterTileCount = 0;
  let shorelineWaterTileCount = 0;
  let coldWaterTileCount = 0;
  let salineWaterTileCount = 0;
  let coldSalineShoreTileCount = 0;
  let lowTideRefugeTileCount = 0;
  let tidalEdgeTileCount = 0;
  let eligibleHeat = 0;
  let eligibleSalinity = 0;
  let shorelineProximity = 0;

  for (const tile of terrain.tiles) {
    if (!isOpenWater(tile)) continue;
    openWaterTileCount += 1;
    const shorelineDistance =
      distances[tile.index] === -1
        ? WORLD_WIDTH + WORLD_HEIGHT
        : distances[tile.index]!;
    const global = regionLocalToGlobalTile(region, tile.x, tile.y);
    const climate = deriveBaselineBiomeClimate(
      seed,
      tile,
      WORLD_HEIGHT,
      0,
      global,
    );
    const cold = FIXED_POINT - climate.heat;
    const lowTideDepth = Math.max(0, MIN_TIDE_LEVEL - tile.elevation);
    const highTideDepth = Math.max(0, MAX_TIDE_LEVEL - tile.elevation);
    const purpose: CoreEcologyPolarShoreAnchorPurpose =
      lowTideDepth >= CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH
        ? "low-tide-refuge"
        : "tidal-edge";
    const nearShore = shorelineDistance <= MAXIMUM_SHORELINE_DISTANCE;
    if (nearShore) shorelineWaterTileCount += 1;
    if (cold >= MINIMUM_COLD_SIGNAL) coldWaterTileCount += 1;
    if (climate.salinity >= MINIMUM_SALINITY) salineWaterTileCount += 1;
    if (
      !nearShore ||
      highTideDepth < CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH
    )
      continue;
    const proximity = clampFixed(
      FIXED_POINT -
        Math.trunc(
          (shorelineDistance * FIXED_POINT) / (MAXIMUM_SHORELINE_DISTANCE + 1),
        ),
    );
    const depthSuitability =
      purpose === "low-tide-refuge"
        ? clampFixed(ratioFixed(lowTideDepth, 180_000))
        : fixedWeighted([
            [ratioFixed(highTideDepth, 365_000), 2],
            [
              FIXED_POINT -
                ratioFixed(
                  lowTideDepth,
                  CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH,
                ),
              1,
            ],
          ]);
    const habitatScore = fixedWeighted([
      [cold, 4],
      [climate.salinity, 4],
      [proximity, 2],
      [depthSuitability, 2],
    ]);
    if (
      cold < MINIMUM_COLD_SIGNAL ||
      climate.salinity < MINIMUM_SALINITY ||
      habitatScore < MINIMUM_SITE_SCORE
    )
      continue;
    coldSalineShoreTileCount += 1;
    if (purpose === "low-tide-refuge") lowTideRefugeTileCount += 1;
    else tidalEdgeTileCount += 1;
    eligibleHeat += climate.heat;
    eligibleSalinity += climate.salinity;
    shorelineProximity += proximity;
    tiles.push(
      Object.freeze({
        tile: Object.freeze({ ...tile }),
        globalX: global.x,
        globalY: global.y,
        heat: climate.heat,
        salinity: climate.salinity,
        cold,
        shorelineDistance,
        lowTideDepth,
        highTideDepth,
        purpose,
        habitatScore,
        placementRank: keyedRandomU32(
          seed,
          POLAR_SHORE_ANCHOR_DOMAIN,
          global.x,
          global.y,
          semanticPurpose(`anchor:${purpose}`),
        ),
      }),
    );
  }
  const eligibleCount = tiles.length;
  const averageEligibleHeat =
    eligibleCount === 0
      ? FIXED_POINT
      : Math.trunc(eligibleHeat / eligibleCount);
  const averageEligibleSalinity =
    eligibleCount === 0 ? 0 : Math.trunc(eligibleSalinity / eligibleCount);
  const coldSignal =
    eligibleCount === 0 ? 0 : FIXED_POINT - averageEligibleHeat;
  const salinitySignal = averageEligibleSalinity;
  const shorelineSignal =
    eligibleCount === 0 ? 0 : Math.trunc(shorelineProximity / eligibleCount);
  const tidalEdgeSignal = ratioFixed(
    Math.min(lowTideRefugeTileCount, tidalEdgeTileCount),
    Math.max(1, eligibleCount),
  );
  return deepFreeze({
    tiles,
    summary: {
      tileCount: terrain.tiles.length,
      openWaterTileCount,
      shorelineWaterTileCount,
      coldWaterTileCount,
      salineWaterTileCount,
      coldSalineShoreTileCount,
      lowTideRefugeTileCount,
      tidalEdgeTileCount,
      averageEligibleHeat,
      averageEligibleSalinity,
      coldSignal,
      salinitySignal,
      shorelineSignal,
      tidalEdgeSignal,
      polarShoreSignal:
        eligibleCount === 0
          ? 0
          : fixedWeighted([
              [coldSignal, 4],
              [salinitySignal, 4],
              [shorelineSignal, 2],
              [ratioFixed(eligibleCount, Math.max(1, openWaterTileCount)), 1],
              [tidalEdgeSignal, 1],
            ]),
    },
  });
}

function habitatCapacity(analysis: ReturnType<typeof analyzeTerrain>): number {
  if (
    analysis.summary.lowTideRefugeTileCount === 0 ||
    analysis.summary.tidalEdgeTileCount === 0
  )
    return 0;
  const weightedSites = Math.trunc(
    analysis.tiles.reduce((sum, tile) => sum + tile.habitatScore, 0) /
      FIXED_POINT,
  );
  const units = Math.min(
    CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION,
    Math.trunc(weightedSites / 2),
  );
  return units < MINIMUM_POPULATION ? 0 : units;
}

function chooseAnchors(
  seed: RootSeed,
  region: RegionCoord,
  analysis: ReturnType<typeof analyzeTerrain>,
  populationUnits: number,
): readonly CoreEcologyPolarShorePopulationAnchor[] {
  if (populationUnits === 0) return Object.freeze([]);
  const ordered = [...analysis.tiles].sort(
    (left, right) =>
      right.habitatScore - left.habitatScore ||
      left.placementRank - right.placementRank ||
      left.tile.index - right.tile.index,
  );
  const refuge = ordered.find(({ purpose }) => purpose === "low-tide-refuge");
  const edge = ordered.find(({ purpose }) => purpose === "tidal-edge");
  if (refuge === undefined || edge === undefined) {
    throw new Error("Admitted polar shore lacks a refuge/edge anchor pair");
  }
  const desired = Math.min(
    CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_ANCHORS,
    analysis.tiles.length,
    Math.max(2, Math.ceil(populationUnits / 16)),
  );
  const selected: AnalyzedPolarShoreTile[] = [refuge, edge];
  const minimumSquared = 5 * 5;
  for (const candidate of ordered) {
    if (selected.includes(candidate)) continue;
    if (
      selected.every((current) => {
        const x = current.tile.x - candidate.tile.x;
        const y = current.tile.y - candidate.tile.y;
        return x * x + y * y >= minimumSquared;
      })
    )
      selected.push(candidate);
    if (selected.length === desired) break;
  }
  for (const candidate of ordered) {
    if (selected.length === desired) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  const baseUnits = Math.trunc(populationUnits / selected.length);
  const remainder = populationUnits % selected.length;
  return Object.freeze(
    selected.map((entry, anchorOrdinal) => {
      const localX =
        entry.tile.x * WORLD_POSITION_UNITS_PER_TILE +
        Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
      const localY =
        entry.tile.y * WORLD_POSITION_UNITS_PER_TILE +
        Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
      return deepFreeze({
        stableId: stableRegionObjectId(
          seed,
          region,
          "polar-shore-anchor",
          `atlantic-capelin:${anchorOrdinal}`,
        ),
        anchorOrdinal,
        purpose: entry.purpose,
        localX: entry.tile.x,
        localY: entry.tile.y,
        globalX: entry.globalX,
        globalY: entry.globalY,
        position: createWorldPosition(region, localX, localY),
        elevation: entry.tile.elevation,
        lowTideDepth: entry.lowTideDepth,
        highTideDepth: entry.highTideDepth,
        heat: entry.heat,
        salinity: entry.salinity,
        shorelineDistance: entry.shorelineDistance,
        habitatScore: entry.habitatScore,
        allocatedPopulation: baseUnits + (anchorOrdinal < remainder ? 1 : 0),
      });
    }),
  );
}

function cacheKey(seed: RootSeed, region: RegionCoord): string {
  return hashCanonical([
    CORE_ECOLOGY_POLAR_SHORE_HABITAT_OWNER_ID,
    CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
    seed,
    region.x,
    region.y,
  ]);
}

function cacheHabitat(
  key: string,
  habitat: CoreEcologyPolarShoreHabitat,
): CoreEcologyPolarShoreHabitat {
  HABITAT_CACHE.delete(key);
  HABITAT_CACHE.set(key, habitat);
  while (HABITAT_CACHE.size > CORE_ECOLOGY_POLAR_SHORE_HABITAT_CACHE_LIMIT) {
    const oldest = HABITAT_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    HABITAT_CACHE.delete(oldest);
  }
  return habitat;
}

/** Cache state is a performance detail and never contributes to habitat truth. */
export function clearCoreEcologyPolarShoreHabitatCache(): void {
  HABITAT_CACHE.clear();
}

/**
 * Derives one sparse cold-saline shore candidate. Absence is an authenticated
 * result: warm, fresh, shoreless, refuge-less, non-host, or quiet regions do
 * not receive a substitute school merely because they were loaded.
 */
export function deriveCoreEcologyPolarShoreHabitat(
  input: DeriveCoreEcologyPolarShoreHabitatInput,
): CoreEcologyPolarShoreHabitat {
  if (!plainRecord(input))
    throw new TypeError("Polar-shore habitat input is malformed");
  requireRootSeed(input.seed);
  if (!isRegionCoord(input.region))
    throw new RangeError("Polar-shore habitat requires a region");
  const region = createRegionCoord(input.region.x, input.region.y);
  const key = cacheKey(input.seed, region);
  if (input.terrain === undefined) {
    const cached = HABITAT_CACHE.get(key);
    if (cached !== undefined) return cacheHabitat(key, cached);
  }
  const terrain = canonicalTerrain(input.seed, region, input.terrain);
  const cached = HABITAT_CACHE.get(key);
  if (cached !== undefined) return cacheHabitat(key, cached);
  const analysis = analyzeTerrain(input.seed, region, terrain);
  const territory = deriveCoreEcologyPolarShoreTerritory(input.seed, region);
  const capacity = habitatCapacity(analysis);
  const regionalQuietRoll = keyedRandomInt(
    input.seed,
    POLAR_SHORE_HABITAT_DOMAIN,
    region.x,
    region.y,
    semanticPurpose("regional-quiet"),
    0,
    FIXED_POINT - 1,
  );
  const regionalQuietThreshold = Math.min(
    760_000,
    analysis.summary.polarShoreSignal === 0
      ? 0
      : 180_000 +
          Math.trunc(
            (analysis.summary.polarShoreSignal * 720_000) / FIXED_POINT,
          ),
  );
  const regionalQuiet = regionalQuietRoll >= regionalQuietThreshold;
  const densityRoll = keyedRandomInt(
    input.seed,
    POLAR_SHORE_DENSITY_DOMAIN,
    region.x,
    region.y,
    semanticPurpose("density:atlantic-capelin"),
    0,
    FIXED_POINT - 1,
  );
  const quality =
    analysis.summary.polarShoreSignal <= MINIMUM_SITE_SCORE
      ? 0
      : ratioFixed(
          analysis.summary.polarShoreSignal - MINIMUM_SITE_SCORE,
          FIXED_POINT - MINIMUM_SITE_SCORE,
        );
  // Territory ownership plus the independent regional-quiet gate already make
  // this shoreline layer sparse. Density then rejects only the thinnest viable
  // schools instead of making valid cold-coast hosts nearly impossible.
  const densityThreshold =
    840_000 + Math.trunc((quality * 120_000) / FIXED_POINT);
  let populationUnits = capacity;
  let admissionReason: CoreEcologyPolarShoreAdmissionReason = "admitted";
  if (capacity === 0) {
    populationUnits = 0;
    admissionReason = "habitat-capacity-zero";
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
  const anchors = chooseAnchors(input.seed, region, analysis, populationUnits);
  const candidate: CoreEcologyPolarShorePopulationCandidate = deepFreeze({
    version: CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION,
    stableId: stableRegionObjectId(
      input.seed,
      region,
      "polar-shore-population",
      "atlantic-capelin",
    ),
    populationKey: `ps1:${hashCanonical({
      regionId: stableRegionId(input.seed, region),
      species: "atlantic-capelin",
    })}:atlantic-capelin`,
    species: "atlantic-capelin",
    guild: "aquatic-prey",
    actorRepresentation: "aggregate",
    territoryId: territory.stableId,
    territoryHostRegion: territory.hostRegion,
    territoryOwnedHere: territory.regionIsHost,
    habitatScore: analysis.summary.polarShoreSignal,
    suitableTileCount: analysis.tiles.length,
    habitatCapacity: capacity,
    densityRoll,
    densityThreshold,
    preySupportUnits: 0,
    trophicCeiling: capacity,
    guildCeiling: CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION,
    populationUnits,
    admissionReason,
    activitySignal: Object.freeze({
      kind: "foraging",
      intensity: analysis.summary.polarShoreSignal,
      activePeriod: "variable",
      source: "habitat-derived",
    }),
    anchors,
  });
  const tidalAnchors = Object.freeze(
    anchors.map((anchor) =>
      Object.freeze({
        species: "atlantic-capelin" as const,
        purpose: "population" as const,
        anchorOrdinal: anchor.anchorOrdinal,
        position: anchor.position,
        elevation: anchor.elevation,
      }),
    ),
  );
  const base = {
    version: CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_POLAR_SHORE_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
    region,
    regionId: stableRegionId(input.seed, region),
    sourceStableId: stableRegionObjectId(
      input.seed,
      region,
      "polar-shore-source",
      CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
    ),
    terrainHash: regionTerrainHash(terrain),
    summary: analysis.summary,
    density: deepFreeze({
      regionalQuietRoll,
      regionalQuietThreshold,
      regionalQuiet,
      aquaticPreyCeiling: CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION,
    }),
    evaluatedSpeciesCount: 1 as const,
    populations: Object.freeze([candidate]) as readonly [
      CoreEcologyPolarShorePopulationCandidate,
    ],
    tidalAnchors,
    totalPopulationUnits: populationUnits,
    admittedSpeciesCount: (populationUnits > 0 ? 1 : 0) as 0 | 1,
  } as const;
  const habitat = canonicalizeCoreEcologyPolarShoreHabitat({
    ...base,
    derivationHash: hashCanonical(base),
  });
  if (habitat === null)
    throw new Error("Generated polar-shore habitat failed validation");
  return cacheHabitat(key, habitat);
}

export function canonicalizeCoreEcologyPolarShoreHabitat(
  value: unknown,
): CoreEcologyPolarShoreHabitat | null {
  if (
    typeof value === "object" &&
    value !== null &&
    TRUSTED_HABITATS.has(value)
  ) {
    return value as CoreEcologyPolarShoreHabitat;
  }
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "admittedSpeciesCount",
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
    ])
  )
    return null;
  if (
    value.version !== CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION ||
    value.ownerId !== CORE_ECOLOGY_POLAR_SHORE_HABITAT_OWNER_ID ||
    value.derivationKind !== CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND ||
    !isRegionCoord(value.region) ||
    !validId(value.regionId) ||
    !validId(value.sourceStableId) ||
    !validHash(value.terrainHash) ||
    value.evaluatedSpeciesCount !== 1 ||
    !Array.isArray(value.populations) ||
    value.populations.length !== 1 ||
    !Array.isArray(value.tidalAnchors) ||
    value.tidalAnchors.length > CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_ANCHORS ||
    !nonnegativeSafeInteger(value.totalPopulationUnits) ||
    value.totalPopulationUnits > CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION ||
    (value.admittedSpeciesCount !== 0 && value.admittedSpeciesCount !== 1) ||
    !validHash(value.derivationHash)
  )
    return null;
  const summary = canonicalSummary(value.summary);
  const density = canonicalDensity(value.density);
  if (summary === null || density === null) return null;
  const population = canonicalPopulation(
    value.populations[0],
    value.region,
    summary,
    density,
  );
  if (population === null) return null;
  const tidalAnchors = canonicalTidalAnchors(value.tidalAnchors, population);
  if (tidalAnchors === null) return null;
  const admittedSpeciesCount = population.populationUnits > 0 ? 1 : 0;
  if (
    value.totalPopulationUnits !== population.populationUnits ||
    value.admittedSpeciesCount !== admittedSpeciesCount
  )
    return null;
  const base = {
    version: CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_POLAR_SHORE_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
    region: createRegionCoord(value.region.x, value.region.y),
    regionId: value.regionId,
    sourceStableId: value.sourceStableId,
    terrainHash: value.terrainHash,
    summary,
    density,
    evaluatedSpeciesCount: 1 as const,
    populations: Object.freeze([population]) as readonly [
      CoreEcologyPolarShorePopulationCandidate,
    ],
    tidalAnchors,
    totalPopulationUnits: population.populationUnits,
    admittedSpeciesCount: admittedSpeciesCount as 0 | 1,
  } as const;
  if (hashCanonical(base) !== value.derivationHash) return null;
  const habitat = deepFreeze({ ...base, derivationHash: value.derivationHash });
  TRUSTED_HABITATS.add(habitat);
  return habitat;
}

/** Strict world binding authenticates every derived fact, not just shape/hash. */
export function canonicalCoreEcologyPolarShoreHabitatForWorld(
  value: unknown,
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyPolarShoreHabitat | null {
  const habitat = canonicalizeCoreEcologyPolarShoreHabitat(value);
  if (habitat === null || !isRegionCoord(region)) return null;
  try {
    requireRootSeed(seed);
    const expected = deriveCoreEcologyPolarShoreHabitat({ seed, region });
    return stableStringify(habitat) === stableStringify(expected)
      ? habitat
      : null;
  } catch {
    return null;
  }
}

function canonicalSummary(
  value: unknown,
): CoreEcologyPolarShoreTerrainSummary | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "averageEligibleHeat",
      "averageEligibleSalinity",
      "coldSalineShoreTileCount",
      "coldSignal",
      "coldWaterTileCount",
      "lowTideRefugeTileCount",
      "openWaterTileCount",
      "polarShoreSignal",
      "salineWaterTileCount",
      "salinitySignal",
      "shorelineSignal",
      "shorelineWaterTileCount",
      "tidalEdgeSignal",
      "tidalEdgeTileCount",
      "tileCount",
    ])
  )
    return null;
  if (
    value.tileCount !== WORLD_WIDTH * WORLD_HEIGHT ||
    !countWithin(value.openWaterTileCount, value.tileCount) ||
    !countWithin(value.shorelineWaterTileCount, value.openWaterTileCount) ||
    !countWithin(value.coldWaterTileCount, value.openWaterTileCount) ||
    !countWithin(value.salineWaterTileCount, value.openWaterTileCount) ||
    !countWithin(value.coldSalineShoreTileCount, value.openWaterTileCount) ||
    !countWithin(
      value.lowTideRefugeTileCount,
      value.coldSalineShoreTileCount,
    ) ||
    !countWithin(value.tidalEdgeTileCount, value.coldSalineShoreTileCount) ||
    value.lowTideRefugeTileCount + value.tidalEdgeTileCount !==
      value.coldSalineShoreTileCount ||
    !fixedInteger(value.averageEligibleHeat) ||
    !fixedInteger(value.averageEligibleSalinity) ||
    !fixedInteger(value.coldSignal) ||
    !fixedInteger(value.salinitySignal) ||
    !fixedInteger(value.shorelineSignal) ||
    !fixedInteger(value.tidalEdgeSignal) ||
    !fixedInteger(value.polarShoreSignal) ||
    value.coldSignal !==
      (value.coldSalineShoreTileCount === 0
        ? 0
        : FIXED_POINT - value.averageEligibleHeat) ||
    value.salinitySignal !== value.averageEligibleSalinity
  )
    return null;
  return deepFreeze({
    tileCount: value.tileCount,
    openWaterTileCount: value.openWaterTileCount,
    shorelineWaterTileCount: value.shorelineWaterTileCount,
    coldWaterTileCount: value.coldWaterTileCount,
    salineWaterTileCount: value.salineWaterTileCount,
    coldSalineShoreTileCount: value.coldSalineShoreTileCount,
    lowTideRefugeTileCount: value.lowTideRefugeTileCount,
    tidalEdgeTileCount: value.tidalEdgeTileCount,
    averageEligibleHeat: value.averageEligibleHeat,
    averageEligibleSalinity: value.averageEligibleSalinity,
    coldSignal: value.coldSignal,
    salinitySignal: value.salinitySignal,
    shorelineSignal: value.shorelineSignal,
    tidalEdgeSignal: value.tidalEdgeSignal,
    polarShoreSignal: value.polarShoreSignal,
  });
}

function canonicalDensity(
  value: unknown,
): CoreEcologyPolarShoreDensityAdmission | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "aquaticPreyCeiling",
      "regionalQuiet",
      "regionalQuietRoll",
      "regionalQuietThreshold",
    ])
  )
    return null;
  if (
    !fixedInteger(value.regionalQuietRoll) ||
    !fixedInteger(value.regionalQuietThreshold) ||
    typeof value.regionalQuiet !== "boolean" ||
    value.regionalQuiet !==
      value.regionalQuietRoll >= value.regionalQuietThreshold ||
    value.aquaticPreyCeiling !== CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION
  )
    return null;
  return deepFreeze({
    regionalQuietRoll: value.regionalQuietRoll,
    regionalQuietThreshold: value.regionalQuietThreshold,
    regionalQuiet: value.regionalQuiet,
    aquaticPreyCeiling: CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION,
  });
}

function canonicalPopulation(
  value: unknown,
  region: RegionCoord,
  summary: CoreEcologyPolarShoreTerrainSummary,
  density: CoreEcologyPolarShoreDensityAdmission,
): CoreEcologyPolarShorePopulationCandidate | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "activitySignal",
      "actorRepresentation",
      "admissionReason",
      "anchors",
      "densityRoll",
      "densityThreshold",
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
    ])
  )
    return null;
  if (
    value.version !== CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION ||
    value.species !== "atlantic-capelin" ||
    value.guild !== "aquatic-prey" ||
    value.actorRepresentation !== "aggregate" ||
    !validId(value.stableId) ||
    !validId(value.populationKey) ||
    !validId(value.territoryId) ||
    !isRegionCoord(value.territoryHostRegion) ||
    typeof value.territoryOwnedHere !== "boolean" ||
    value.territoryOwnedHere !==
      (value.territoryHostRegion.x === region.x &&
        value.territoryHostRegion.y === region.y) ||
    !fixedInteger(value.habitatScore) ||
    value.habitatScore !== summary.polarShoreSignal ||
    !nonnegativeSafeInteger(value.suitableTileCount) ||
    value.suitableTileCount !== summary.coldSalineShoreTileCount ||
    !nonnegativeSafeInteger(value.habitatCapacity) ||
    value.habitatCapacity > CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION ||
    !fixedInteger(value.densityRoll) ||
    !fixedInteger(value.densityThreshold) ||
    value.preySupportUnits !== 0 ||
    value.trophicCeiling !== value.habitatCapacity ||
    value.guildCeiling !== density.aquaticPreyCeiling ||
    !nonnegativeSafeInteger(value.populationUnits) ||
    value.populationUnits > value.habitatCapacity ||
    !ADMISSION_REASONS.has(
      value.admissionReason as CoreEcologyPolarShoreAdmissionReason,
    ) ||
    !Array.isArray(value.anchors) ||
    value.anchors.length > CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_ANCHORS
  )
    return null;
  const activitySignal = canonicalActivitySignal(
    value.activitySignal,
    value.habitatScore,
  );
  if (activitySignal === null) return null;
  const admitted = value.populationUnits > 0;
  if (
    admitted !== (value.admissionReason === "admitted") ||
    admitted !== value.anchors.length >= 2 ||
    (admitted && (!value.territoryOwnedHere || density.regionalQuiet)) ||
    (admitted && value.densityRoll >= value.densityThreshold) ||
    (admitted && value.populationUnits < MINIMUM_POPULATION) ||
    (!admitted && value.anchors.length !== 0) ||
    (value.habitatCapacity === 0) !==
      (value.admissionReason === "habitat-capacity-zero")
  )
    return null;
  const anchors: CoreEcologyPolarShorePopulationAnchor[] = [];
  const ids = new Set<string>();
  const tiles = new Set<number>();
  let allocated = 0;
  for (let index = 0; index < value.anchors.length; index += 1) {
    const anchor = canonicalPopulationAnchor(
      value.anchors[index],
      index,
      region,
    );
    if (
      anchor === null ||
      ids.has(anchor.stableId) ||
      tiles.has(anchor.localY * WORLD_WIDTH + anchor.localX)
    )
      return null;
    ids.add(anchor.stableId);
    tiles.add(anchor.localY * WORLD_WIDTH + anchor.localX);
    allocated += anchor.allocatedPopulation;
    anchors.push(anchor);
  }
  if (
    allocated !== value.populationUnits ||
    (admitted &&
      !anchors.some(({ purpose }) => purpose === "low-tide-refuge")) ||
    (admitted && !anchors.some(({ purpose }) => purpose === "tidal-edge"))
  )
    return null;
  return deepFreeze({
    version: CORE_ECOLOGY_POLAR_SHORE_HABITAT_VERSION,
    stableId: value.stableId,
    populationKey: value.populationKey,
    species: "atlantic-capelin",
    guild: "aquatic-prey",
    actorRepresentation: "aggregate",
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
    preySupportUnits: 0,
    trophicCeiling: value.trophicCeiling,
    guildCeiling: CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION,
    populationUnits: value.populationUnits,
    admissionReason:
      value.admissionReason as CoreEcologyPolarShoreAdmissionReason,
    activitySignal,
    anchors: Object.freeze(anchors),
  });
}

function canonicalActivitySignal(value: unknown, intensity: number) {
  if (
    !plainRecord(value) ||
    !exactKeys(value, ["activePeriod", "intensity", "kind", "source"])
  )
    return null;
  if (
    value.kind !== "foraging" ||
    value.intensity !== intensity ||
    value.activePeriod !== "variable" ||
    value.source !== "habitat-derived"
  )
    return null;
  return Object.freeze({
    kind: "foraging" as const,
    intensity,
    activePeriod: "variable" as const,
    source: "habitat-derived" as const,
  });
}

function canonicalPopulationAnchor(
  value: unknown,
  expectedOrdinal: number,
  region: RegionCoord,
): CoreEcologyPolarShorePopulationAnchor | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "allocatedPopulation",
      "anchorOrdinal",
      "elevation",
      "globalX",
      "globalY",
      "habitatScore",
      "heat",
      "highTideDepth",
      "localX",
      "localY",
      "lowTideDepth",
      "position",
      "purpose",
      "salinity",
      "shorelineDistance",
      "stableId",
    ])
  )
    return null;
  if (
    !validId(value.stableId) ||
    value.anchorOrdinal !== expectedOrdinal ||
    (value.purpose !== "low-tide-refuge" && value.purpose !== "tidal-edge") ||
    !nonnegativeSafeInteger(value.localX) ||
    value.localX >= WORLD_WIDTH ||
    !nonnegativeSafeInteger(value.localY) ||
    value.localY >= WORLD_HEIGHT ||
    !signedSafeInteger(value.globalX) ||
    !signedSafeInteger(value.globalY) ||
    !isWorldPosition(value.position) ||
    !fixedInteger(value.elevation) ||
    !nonnegativeSafeInteger(value.lowTideDepth) ||
    !nonnegativeSafeInteger(value.highTideDepth) ||
    !fixedInteger(value.heat) ||
    !fixedInteger(value.salinity) ||
    !nonnegativeSafeInteger(value.shorelineDistance) ||
    value.shorelineDistance > WORLD_WIDTH + WORLD_HEIGHT ||
    !fixedInteger(value.habitatScore) ||
    !positiveSafeInteger(value.allocatedPopulation)
  )
    return null;
  const global = regionLocalToGlobalTile(region, value.localX, value.localY);
  const position = createWorldPosition(
    region,
    value.localX * WORLD_POSITION_UNITS_PER_TILE +
      Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    value.localY * WORLD_POSITION_UNITS_PER_TILE +
      Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
  const lowTideDepth = Math.max(0, MIN_TIDE_LEVEL - value.elevation);
  const highTideDepth = Math.max(0, MAX_TIDE_LEVEL - value.elevation);
  const purpose =
    lowTideDepth >= CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH
      ? ("low-tide-refuge" as const)
      : ("tidal-edge" as const);
  if (
    value.globalX !== global.x ||
    value.globalY !== global.y ||
    stableStringify(value.position) !== stableStringify(position) ||
    value.lowTideDepth !== lowTideDepth ||
    value.highTideDepth !== highTideDepth ||
    value.purpose !== purpose ||
    highTideDepth < CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH
  )
    return null;
  return deepFreeze({
    stableId: value.stableId,
    anchorOrdinal: value.anchorOrdinal,
    purpose,
    localX: value.localX,
    localY: value.localY,
    globalX: value.globalX,
    globalY: value.globalY,
    position,
    elevation: value.elevation,
    lowTideDepth,
    highTideDepth,
    heat: value.heat,
    salinity: value.salinity,
    shorelineDistance: value.shorelineDistance,
    habitatScore: value.habitatScore,
    allocatedPopulation: value.allocatedPopulation,
  });
}

function canonicalTidalAnchors(
  value: readonly unknown[],
  population: CoreEcologyPolarShorePopulationCandidate,
): readonly CoreEcologyPolarShoreTidalAnchor[] | null {
  if (value.length !== population.anchors.length) return null;
  const result: CoreEcologyPolarShoreTidalAnchor[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const source = population.anchors[index];
    if (
      source === undefined ||
      !plainRecord(raw) ||
      !exactKeys(raw, [
        "anchorOrdinal",
        "elevation",
        "position",
        "purpose",
        "species",
      ]) ||
      raw.species !== "atlantic-capelin" ||
      raw.purpose !== "population" ||
      raw.anchorOrdinal !== index ||
      raw.elevation !== source.elevation ||
      !isWorldPosition(raw.position) ||
      stableStringify(raw.position) !== stableStringify(source.position)
    )
      return null;
    result.push(
      Object.freeze({
        species: "atlantic-capelin",
        purpose: "population",
        anchorOrdinal: index,
        position: source.position,
        elevation: source.elevation,
      }),
    );
  }
  return Object.freeze(result);
}

const ADMISSION_REASONS: ReadonlySet<CoreEcologyPolarShoreAdmissionReason> =
  new Set([
    "admitted",
    "density-roll-failed",
    "habitat-capacity-zero",
    "regional-quiet",
    "territory-owned-elsewhere",
  ]);

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function fixedInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= FIXED_POINT &&
    !Object.is(value, -0)
  );
}

function countWithin(value: unknown, maximum: unknown): value is number {
  return (
    nonnegativeSafeInteger(value) &&
    nonnegativeSafeInteger(maximum) &&
    value <= maximum
  );
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    !Object.is(value, -0)
  );
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function signedSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

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
  )
    throw new RangeError(
      "Polar-shore habitat seed must contain four uint32 words",
    );
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
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
