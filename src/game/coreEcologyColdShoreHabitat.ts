import { deriveBaselineBiomeClimate } from "../sim/biomes";
import { generateRegionTerrain, regionTerrainHash } from "../sim/regionTerrain";
import { keyedRandomU32, type RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  regionLocalToGlobalTile,
  stableRegionId,
  stableRegionObjectId,
  type RegionCoord,
} from "../sim/regions";
import { MAX_TIDE_LEVEL } from "../sim/terrain";
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
} from "./coreEcologyPolarShoreHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION = 1 as const;
export const CORE_ECOLOGY_COLD_SHORE_HABITAT_OWNER_ID =
  "game:core-ecology-cold-shore-habitat:v1" as const;
export const CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND =
  "regional-cold-shore-v1" as const;
export const CORE_ECOLOGY_COLD_SHORE_SPECIES = Object.freeze([
  "arctic-fox",
] as const);
export const CORE_ECOLOGY_COLD_SHORE_HABITAT_CACHE_LIMIT = 128 as const;
export const CORE_ECOLOGY_COLD_SHORE_MAXIMUM_POPULATION = 1 as const;
export const CORE_ECOLOGY_COLD_SHORE_MAXIMUM_ANCHORS = 1 as const;
/**
 * Capelin anchors are selected from the best water cells, not the nearest
 * shoreline cells. A bounded 64-tile same-region reach can therefore connect
 * their authenticated area signal to genuinely all-tide-dry cold ground;
 * 24 excluded every dry tile in known canonical polar hosts.
 */
export const CORE_ECOLOGY_COLD_SHORE_MAXIMUM_FORAGE_DISTANCE_TILES =
  64 as const;

export type CoreEcologyColdShoreSpecies =
  (typeof CORE_ECOLOGY_COLD_SHORE_SPECIES)[number];
export type CoreEcologyColdShoreAdmissionReason =
  "admitted" | "dry-anchor-absent" | "forage-substrate-absent";

/** Read-only receipt for the canonical Alpha-34 forage substrate. */
export interface CoreEcologyColdShoreForageSubstrate {
  readonly polarShoreSourceStableId: string;
  readonly polarShoreHabitatHash: string;
  readonly polarForagePopulationKey: string;
  readonly polarForagePopulationUnits: number;
  readonly viable: boolean;
}

export interface CoreEcologyColdShoreTerrainSummary {
  readonly tileCount: number;
  readonly allTideDryTileCount: number;
  readonly shoreReachableDryTileCount: number;
  readonly coldShoreDryTileCount: number;
  readonly averageEligibleHeat: number;
  readonly averageEligibleSalinity: number;
  readonly coldSignal: number;
  readonly shorelineSignal: number;
  readonly habitatSignal: number;
}

export interface CoreEcologyColdShorePopulationAnchor {
  readonly stableId: string;
  readonly anchorOrdinal: 0;
  readonly purpose: "dry-shore-refuge";
  readonly localX: number;
  readonly localY: number;
  readonly globalX: number;
  readonly globalY: number;
  readonly position: WorldPosition;
  readonly terrain: "meadow" | "ridge";
  readonly elevation: number;
  readonly heat: number;
  readonly salinity: number;
  readonly cold: number;
  readonly forageDistanceTiles: number;
  readonly habitatScore: number;
  readonly allocatedPopulation: 1;
}

export interface CoreEcologyColdShorePopulationCandidate {
  readonly version: typeof CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION;
  readonly stableId: string;
  readonly populationKey: string;
  readonly species: CoreEcologyColdShoreSpecies;
  readonly guild: "shore-predator";
  readonly actorRepresentation: "individual";
  readonly habitatScore: number;
  readonly suitableTileCount: number;
  readonly habitatCapacity: 0 | 1;
  /** Broad aggregate support only; never an exact prey identity or target. */
  readonly preySupportUnits: number;
  readonly trophicCeiling: 0 | 1;
  readonly guildCeiling: typeof CORE_ECOLOGY_COLD_SHORE_MAXIMUM_POPULATION;
  readonly populationUnits: 0 | 1;
  readonly admissionReason: CoreEcologyColdShoreAdmissionReason;
  readonly anchors: readonly CoreEcologyColdShorePopulationAnchor[];
}

export interface CoreEcologyColdShoreHabitat {
  readonly version: typeof CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_COLD_SHORE_HABITAT_OWNER_ID;
  readonly derivationKind: typeof CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND;
  readonly region: RegionCoord;
  readonly regionId: string;
  readonly sourceStableId: string;
  readonly terrainHash: string;
  readonly forageSubstrate: CoreEcologyColdShoreForageSubstrate;
  readonly summary: CoreEcologyColdShoreTerrainSummary;
  readonly evaluatedSpeciesCount: 1;
  readonly populations: readonly [CoreEcologyColdShorePopulationCandidate];
  readonly totalPopulationUnits: 0 | 1;
  readonly admittedSpeciesCount: 0 | 1;
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyColdShoreHabitatInput {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly terrain?: TerrainState;
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
const COLD_SHORE_ANCHOR_DOMAIN = 0x4353_4841;
const HASH_PATTERN = /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/u;
const MINIMUM_COLD_SIGNAL = 450_000;
const MINIMUM_SITE_SCORE = 500_000;
const TRUSTED_HABITATS = new WeakSet<object>();
const HABITAT_CACHE = new Map<string, CoreEcologyColdShoreHabitat>();

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
    throw new TypeError("Supplied cold-shore terrain has invalid dimensions");
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
    throw new TypeError("Supplied cold-shore terrain is not canonical");
  return generated;
}

function forageReceipt(
  habitat: CoreEcologyPolarShoreHabitat,
): CoreEcologyColdShoreForageSubstrate {
  const population = habitat.populations[0];
  if (population === undefined || population.species !== "atlantic-capelin") {
    throw new Error("Canonical polar shore lost its capelin candidate");
  }
  return deepFreeze({
    polarShoreSourceStableId: habitat.sourceStableId,
    polarShoreHabitatHash: habitat.derivationHash,
    polarForagePopulationKey: population.populationKey,
    polarForagePopulationUnits: population.populationUnits,
    viable:
      habitat.totalPopulationUnits > 0 &&
      population.populationUnits > 0 &&
      population.admissionReason === "admitted" &&
      population.anchors.length > 0,
  });
}

function nearestForageDistance(
  tile: TerrainTile,
  polar: CoreEcologyPolarShoreHabitat,
): number {
  let distance = WORLD_WIDTH + WORLD_HEIGHT;
  for (const anchor of polar.populations[0]?.anchors ?? []) {
    distance = Math.min(
      distance,
      Math.abs(tile.x - anchor.localX) + Math.abs(tile.y - anchor.localY),
    );
  }
  return distance;
}

function analyzeTerrain(
  seed: RootSeed,
  region: RegionCoord,
  terrain: TerrainState,
  polar: CoreEcologyPolarShoreHabitat,
): Readonly<{
  readonly tiles: readonly AnalyzedDryTile[];
  readonly summary: CoreEcologyColdShoreTerrainSummary;
}> {
  const tiles: AnalyzedDryTile[] = [];
  let allTideDryTileCount = 0;
  let shoreReachableDryTileCount = 0;
  let coldShoreDryTileCount = 0;
  let eligibleHeat = 0;
  let eligibleSalinity = 0;
  let eligibleProximity = 0;
  for (const tile of terrain.tiles) {
    if (
      (tile.terrain !== "meadow" && tile.terrain !== "ridge") ||
      tile.elevation < MAX_TIDE_LEVEL
    )
      continue;
    allTideDryTileCount += 1;
    const forageDistanceTiles = nearestForageDistance(tile, polar);
    if (
      forageDistanceTiles >
      CORE_ECOLOGY_COLD_SHORE_MAXIMUM_FORAGE_DISTANCE_TILES
    ) {
      continue;
    }
    shoreReachableDryTileCount += 1;
    const global = regionLocalToGlobalTile(region, tile.x, tile.y);
    const climate = deriveBaselineBiomeClimate(
      seed,
      tile,
      WORLD_HEIGHT,
      0,
      global,
    );
    const cold = FIXED_POINT - climate.heat;
    if (cold < MINIMUM_COLD_SIGNAL) continue;
    const proximity = clampFixed(
      FIXED_POINT -
        Math.trunc(
          (forageDistanceTiles * FIXED_POINT) /
            (CORE_ECOLOGY_COLD_SHORE_MAXIMUM_FORAGE_DISTANCE_TILES + 1),
        ),
    );
    const habitatScore = fixedWeighted([
      [cold, 5],
      [proximity, 4],
      [tile.elevation, 2],
      [tile.roughness, 1],
    ]);
    if (habitatScore < MINIMUM_SITE_SCORE) continue;
    const dryTile = tile as TerrainTile & {
      readonly terrain: "meadow" | "ridge";
    };
    coldShoreDryTileCount += 1;
    eligibleHeat += climate.heat;
    eligibleSalinity += climate.salinity;
    eligibleProximity += proximity;
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
          COLD_SHORE_ANCHOR_DOMAIN,
          global.x,
          global.y,
          0,
        ),
      }),
    );
  }
  const count = tiles.length;
  const averageEligibleHeat =
    count === 0 ? FIXED_POINT : Math.trunc(eligibleHeat / count);
  const averageEligibleSalinity =
    count === 0 ? 0 : Math.trunc(eligibleSalinity / count);
  const coldSignal = count === 0 ? 0 : FIXED_POINT - averageEligibleHeat;
  const shorelineSignal =
    count === 0 ? 0 : Math.trunc(eligibleProximity / count);
  return deepFreeze({
    tiles,
    summary: {
      tileCount: terrain.tiles.length,
      allTideDryTileCount,
      shoreReachableDryTileCount,
      coldShoreDryTileCount,
      averageEligibleHeat,
      averageEligibleSalinity,
      coldSignal,
      shorelineSignal,
      habitatSignal:
        count === 0
          ? 0
          : fixedWeighted([
              [coldSignal, 5],
              [shorelineSignal, 4],
              [ratioFixed(count, Math.max(1, allTideDryTileCount)), 1],
            ]),
    },
  });
}

function chooseAnchor(
  seed: RootSeed,
  region: RegionCoord,
  analysis: ReturnType<typeof analyzeTerrain>,
  admitted: boolean,
): readonly CoreEcologyColdShorePopulationAnchor[] {
  if (!admitted) return Object.freeze([]);
  const entry = [...analysis.tiles].sort(
    (left, right) =>
      right.habitatScore - left.habitatScore ||
      left.placementRank - right.placementRank ||
      left.tile.index - right.tile.index,
  )[0];
  if (entry === undefined)
    throw new Error("Admitted cold shore lacks a dry anchor");
  return Object.freeze([
    deepFreeze({
      stableId: stableRegionObjectId(
        seed,
        region,
        "cold-shore-anchor",
        "arctic-fox:0",
      ),
      anchorOrdinal: 0 as const,
      purpose: "dry-shore-refuge" as const,
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
      heat: entry.heat,
      salinity: entry.salinity,
      cold: entry.cold,
      forageDistanceTiles: entry.forageDistanceTiles,
      habitatScore: entry.habitatScore,
      allocatedPopulation: 1 as const,
    }),
  ]);
}

function cacheKey(seed: RootSeed, region: RegionCoord): string {
  return hashCanonical([
    CORE_ECOLOGY_COLD_SHORE_HABITAT_OWNER_ID,
    CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND,
    seed,
    region.x,
    region.y,
  ]);
}

function cacheHabitat(
  key: string,
  habitat: CoreEcologyColdShoreHabitat,
): CoreEcologyColdShoreHabitat {
  HABITAT_CACHE.delete(key);
  HABITAT_CACHE.set(key, habitat);
  while (HABITAT_CACHE.size > CORE_ECOLOGY_COLD_SHORE_HABITAT_CACHE_LIMIT) {
    const oldest = HABITAT_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    HABITAT_CACHE.delete(oldest);
  }
  return habitat;
}

export function clearCoreEcologyColdShoreHabitatCache(): void {
  HABITAT_CACHE.clear();
}

/**
 * Derives one solitary fox only above an already admitted capelin substrate.
 * This owner references that substrate but never copies or mutates its patch.
 */
export function deriveCoreEcologyColdShoreHabitat(
  input: DeriveCoreEcologyColdShoreHabitatInput,
): CoreEcologyColdShoreHabitat {
  if (!plainRecord(input))
    throw new TypeError("Cold-shore habitat input is malformed");
  requireRootSeed(input.seed);
  if (!isRegionCoord(input.region)) {
    throw new RangeError("Cold-shore habitat requires a canonical region");
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
  const substrate = forageReceipt(polar);
  const analysis = analyzeTerrain(input.seed, region, terrain, polar);
  const admitted = substrate.viable && analysis.tiles.length > 0;
  const admissionReason: CoreEcologyColdShoreAdmissionReason = admitted
    ? "admitted"
    : substrate.viable
      ? "dry-anchor-absent"
      : "forage-substrate-absent";
  const populationUnits = (admitted ? 1 : 0) as 0 | 1;
  const candidate: CoreEcologyColdShorePopulationCandidate = deepFreeze({
    version: CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION,
    stableId: stableRegionObjectId(
      input.seed,
      region,
      "cold-shore-population",
      "arctic-fox",
    ),
    populationKey: `cs1:${hashCanonical({
      regionId: stableRegionId(input.seed, region),
      species: "arctic-fox",
    })}:arctic-fox`,
    species: "arctic-fox",
    guild: "shore-predator",
    actorRepresentation: "individual",
    habitatScore: analysis.summary.habitatSignal,
    suitableTileCount: analysis.tiles.length,
    habitatCapacity: populationUnits,
    preySupportUnits: substrate.polarForagePopulationUnits,
    trophicCeiling: (substrate.viable ? 1 : 0) as 0 | 1,
    guildCeiling: CORE_ECOLOGY_COLD_SHORE_MAXIMUM_POPULATION,
    populationUnits,
    admissionReason,
    anchors: chooseAnchor(input.seed, region, analysis, admitted),
  });
  const base = {
    version: CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_COLD_SHORE_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND,
    region,
    regionId: stableRegionId(input.seed, region),
    sourceStableId: stableRegionObjectId(
      input.seed,
      region,
      "cold-shore-source",
      CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND,
    ),
    terrainHash: regionTerrainHash(terrain),
    forageSubstrate: substrate,
    summary: analysis.summary,
    evaluatedSpeciesCount: 1 as const,
    populations: Object.freeze([candidate]) as readonly [
      CoreEcologyColdShorePopulationCandidate,
    ],
    totalPopulationUnits: populationUnits,
    admittedSpeciesCount: populationUnits,
  } as const;
  const habitat = canonicalizeCoreEcologyColdShoreHabitat({
    ...base,
    derivationHash: hashCanonical(base),
  });
  if (habitat === null) {
    throw new Error("Generated cold-shore habitat failed canonical validation");
  }
  return cacheHabitat(key, habitat);
}

export function canonicalizeCoreEcologyColdShoreHabitat(
  value: unknown,
): CoreEcologyColdShoreHabitat | null {
  if (
    typeof value === "object" &&
    value !== null &&
    TRUSTED_HABITATS.has(value)
  ) {
    return value as CoreEcologyColdShoreHabitat;
  }
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "admittedSpeciesCount",
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
    ])
  )
    return null;
  if (
    value.version !== CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION ||
    value.ownerId !== CORE_ECOLOGY_COLD_SHORE_HABITAT_OWNER_ID ||
    value.derivationKind !== CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND ||
    !isRegionCoord(value.region) ||
    !validId(value.regionId) ||
    !validId(value.sourceStableId) ||
    !validHash(value.terrainHash) ||
    value.evaluatedSpeciesCount !== 1 ||
    !Array.isArray(value.populations) ||
    value.populations.length !== 1 ||
    (value.totalPopulationUnits !== 0 && value.totalPopulationUnits !== 1) ||
    (value.admittedSpeciesCount !== 0 && value.admittedSpeciesCount !== 1) ||
    value.admittedSpeciesCount !== value.totalPopulationUnits ||
    !validHash(value.derivationHash)
  )
    return null;
  const substrate = canonicalForageSubstrate(value.forageSubstrate);
  const summary = canonicalSummary(value.summary);
  if (substrate === null || summary === null) return null;
  const population = canonicalPopulation(
    value.populations[0],
    value.region,
    substrate,
    summary,
  );
  if (
    population === null ||
    population.populationUnits !== value.totalPopulationUnits
  )
    return null;
  const base = {
    version: CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_COLD_SHORE_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND,
    region: createRegionCoord(value.region.x, value.region.y),
    regionId: value.regionId,
    sourceStableId: value.sourceStableId,
    terrainHash: value.terrainHash,
    forageSubstrate: substrate,
    summary,
    evaluatedSpeciesCount: 1 as const,
    populations: Object.freeze([population]) as readonly [
      CoreEcologyColdShorePopulationCandidate,
    ],
    totalPopulationUnits: population.populationUnits,
    admittedSpeciesCount: population.populationUnits,
  } as const;
  if (hashCanonical(base) !== value.derivationHash) return null;
  const habitat = deepFreeze({ ...base, derivationHash: value.derivationHash });
  TRUSTED_HABITATS.add(habitat);
  return habitat;
}

export function canonicalCoreEcologyColdShoreHabitatForWorld(
  value: unknown,
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyColdShoreHabitat | null {
  const habitat = canonicalizeCoreEcologyColdShoreHabitat(value);
  if (habitat === null || !isRegionCoord(region)) return null;
  try {
    requireRootSeed(seed);
    const expected = deriveCoreEcologyColdShoreHabitat({ seed, region });
    return stableStringify(habitat) === stableStringify(expected)
      ? habitat
      : null;
  } catch {
    return null;
  }
}

function canonicalForageSubstrate(
  value: unknown,
): CoreEcologyColdShoreForageSubstrate | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "polarForagePopulationKey",
      "polarForagePopulationUnits",
      "polarShoreHabitatHash",
      "polarShoreSourceStableId",
      "viable",
    ])
  )
    return null;
  if (
    !validId(value.polarShoreSourceStableId) ||
    !validHash(value.polarShoreHabitatHash) ||
    !validId(value.polarForagePopulationKey) ||
    !nonnegativeSafeInteger(value.polarForagePopulationUnits) ||
    typeof value.viable !== "boolean" ||
    value.viable !== value.polarForagePopulationUnits > 0
  )
    return null;
  return deepFreeze({
    polarShoreSourceStableId: value.polarShoreSourceStableId,
    polarShoreHabitatHash: value.polarShoreHabitatHash,
    polarForagePopulationKey: value.polarForagePopulationKey,
    polarForagePopulationUnits: value.polarForagePopulationUnits,
    viable: value.viable,
  });
}

function canonicalSummary(
  value: unknown,
): CoreEcologyColdShoreTerrainSummary | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "allTideDryTileCount",
      "averageEligibleHeat",
      "averageEligibleSalinity",
      "coldShoreDryTileCount",
      "coldSignal",
      "habitatSignal",
      "shoreReachableDryTileCount",
      "shorelineSignal",
      "tileCount",
    ])
  )
    return null;
  if (
    value.tileCount !== WORLD_WIDTH * WORLD_HEIGHT ||
    !countWithin(value.allTideDryTileCount, value.tileCount) ||
    !countWithin(value.shoreReachableDryTileCount, value.allTideDryTileCount) ||
    !countWithin(
      value.coldShoreDryTileCount,
      value.shoreReachableDryTileCount,
    ) ||
    !fixedInteger(value.averageEligibleHeat) ||
    !fixedInteger(value.averageEligibleSalinity) ||
    !fixedInteger(value.coldSignal) ||
    !fixedInteger(value.shorelineSignal) ||
    !fixedInteger(value.habitatSignal) ||
    (value.coldShoreDryTileCount === 0 &&
      (value.averageEligibleHeat !== FIXED_POINT ||
        value.averageEligibleSalinity !== 0 ||
        value.coldSignal !== 0 ||
        value.shorelineSignal !== 0 ||
        value.habitatSignal !== 0))
  )
    return null;
  return deepFreeze({
    tileCount: value.tileCount,
    allTideDryTileCount: value.allTideDryTileCount,
    shoreReachableDryTileCount: value.shoreReachableDryTileCount,
    coldShoreDryTileCount: value.coldShoreDryTileCount,
    averageEligibleHeat: value.averageEligibleHeat,
    averageEligibleSalinity: value.averageEligibleSalinity,
    coldSignal: value.coldSignal,
    shorelineSignal: value.shorelineSignal,
    habitatSignal: value.habitatSignal,
  });
}

function canonicalPopulation(
  value: unknown,
  region: RegionCoord,
  substrate: CoreEcologyColdShoreForageSubstrate,
  summary: CoreEcologyColdShoreTerrainSummary,
): CoreEcologyColdShorePopulationCandidate | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "actorRepresentation",
      "admissionReason",
      "anchors",
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
      "trophicCeiling",
      "version",
    ])
  )
    return null;
  if (
    value.version !== CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION ||
    value.species !== "arctic-fox" ||
    value.guild !== "shore-predator" ||
    value.actorRepresentation !== "individual" ||
    !validId(value.stableId) ||
    !validId(value.populationKey) ||
    !fixedInteger(value.habitatScore) ||
    value.habitatScore !== summary.habitatSignal ||
    value.suitableTileCount !== summary.coldShoreDryTileCount ||
    (value.habitatCapacity !== 0 && value.habitatCapacity !== 1) ||
    !nonnegativeSafeInteger(value.preySupportUnits) ||
    value.preySupportUnits !== substrate.polarForagePopulationUnits ||
    (value.trophicCeiling !== 0 && value.trophicCeiling !== 1) ||
    value.trophicCeiling !== (substrate.viable ? 1 : 0) ||
    value.guildCeiling !== CORE_ECOLOGY_COLD_SHORE_MAXIMUM_POPULATION ||
    (value.populationUnits !== 0 && value.populationUnits !== 1) ||
    value.populationUnits > value.habitatCapacity ||
    typeof value.admissionReason !== "string" ||
    !ADMISSION_REASONS.has(
      value.admissionReason as CoreEcologyColdShoreAdmissionReason,
    ) ||
    !Array.isArray(value.anchors) ||
    value.anchors.length > CORE_ECOLOGY_COLD_SHORE_MAXIMUM_ANCHORS
  )
    return null;
  const expectedCapacity =
    substrate.viable && summary.coldShoreDryTileCount > 0 ? 1 : 0;
  const admitted = value.populationUnits === 1;
  if (
    value.habitatCapacity !== expectedCapacity ||
    value.populationUnits !== expectedCapacity ||
    admitted !== (value.admissionReason === "admitted") ||
    admitted !== (value.anchors.length === 1) ||
    (value.admissionReason === "forage-substrate-absent" && substrate.viable) ||
    (value.admissionReason === "dry-anchor-absent" &&
      (!substrate.viable || summary.coldShoreDryTileCount > 0))
  )
    return null;
  const anchors: CoreEcologyColdShorePopulationAnchor[] = [];
  for (const raw of value.anchors) {
    const anchor = canonicalAnchor(raw, region);
    if (anchor === null) return null;
    anchors.push(anchor);
  }
  return deepFreeze({
    version: CORE_ECOLOGY_COLD_SHORE_HABITAT_VERSION,
    stableId: value.stableId,
    populationKey: value.populationKey,
    species: "arctic-fox",
    guild: "shore-predator",
    actorRepresentation: "individual",
    habitatScore: value.habitatScore,
    suitableTileCount: value.suitableTileCount,
    habitatCapacity: value.habitatCapacity,
    preySupportUnits: value.preySupportUnits,
    trophicCeiling: value.trophicCeiling,
    guildCeiling: CORE_ECOLOGY_COLD_SHORE_MAXIMUM_POPULATION,
    populationUnits: value.populationUnits,
    admissionReason:
      value.admissionReason as CoreEcologyColdShoreAdmissionReason,
    anchors: Object.freeze(anchors),
  });
}

function canonicalAnchor(
  value: unknown,
  region: RegionCoord,
): CoreEcologyColdShorePopulationAnchor | null {
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
      "localX",
      "localY",
      "position",
      "purpose",
      "salinity",
      "stableId",
      "terrain",
    ])
  )
    return null;
  if (
    !validId(value.stableId) ||
    value.anchorOrdinal !== 0 ||
    value.purpose !== "dry-shore-refuge" ||
    !nonnegativeSafeInteger(value.localX) ||
    value.localX >= WORLD_WIDTH ||
    !nonnegativeSafeInteger(value.localY) ||
    value.localY >= WORLD_HEIGHT ||
    !signedSafeInteger(value.globalX) ||
    !signedSafeInteger(value.globalY) ||
    !isWorldPosition(value.position) ||
    (value.terrain !== "meadow" && value.terrain !== "ridge") ||
    !fixedInteger(value.elevation) ||
    value.elevation < MAX_TIDE_LEVEL ||
    !fixedInteger(value.heat) ||
    !fixedInteger(value.salinity) ||
    !fixedInteger(value.cold) ||
    value.cold !== FIXED_POINT - value.heat ||
    !nonnegativeSafeInteger(value.forageDistanceTiles) ||
    value.forageDistanceTiles >
      CORE_ECOLOGY_COLD_SHORE_MAXIMUM_FORAGE_DISTANCE_TILES ||
    !fixedInteger(value.habitatScore) ||
    value.habitatScore < MINIMUM_SITE_SCORE ||
    value.allocatedPopulation !== 1
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
  if (
    global.x !== value.globalX ||
    global.y !== value.globalY ||
    stableStringify(value.position) !== stableStringify(position)
  )
    return null;
  return deepFreeze({
    stableId: value.stableId,
    anchorOrdinal: 0,
    purpose: "dry-shore-refuge",
    localX: value.localX,
    localY: value.localY,
    globalX: value.globalX,
    globalY: value.globalY,
    position,
    terrain: value.terrain,
    elevation: value.elevation,
    heat: value.heat,
    salinity: value.salinity,
    cold: value.cold,
    forageDistanceTiles: value.forageDistanceTiles,
    habitatScore: value.habitatScore,
    allocatedPopulation: 1,
  });
}

const ADMISSION_REASONS = new Set<CoreEcologyColdShoreAdmissionReason>([
  "admitted",
  "dry-anchor-absent",
  "forage-substrate-absent",
]);

function countWithin(value: unknown, maximum: number): value is number {
  return nonnegativeSafeInteger(value) && value <= maximum;
}

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
    (value as number) <= FIXED_POINT
  );
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    !Object.is(value, -0)
  );
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
      "Cold-shore habitat seed must contain four uint32 words",
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
