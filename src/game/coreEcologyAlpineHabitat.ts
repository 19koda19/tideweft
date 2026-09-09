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
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainState,
  type TerrainTile,
} from "../sim/types";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  deriveCoreEcologyRegionalHabitat,
  type CoreEcologyRegionalGuild,
  type CoreEcologyRegionalPopulationAnchor,
} from "./coreEcologyRegionalHabitat";

export const CORE_ECOLOGY_ALPINE_HABITAT_VERSION = 1 as const;
export const CORE_ECOLOGY_ALPINE_HABITAT_OWNER_ID =
  "game:core-ecology-alpine-habitat:v1" as const;
export const CORE_ECOLOGY_ALPINE_DERIVATION_KIND = "regional-alpine-v1" as const;
export const CORE_ECOLOGY_ALPINE_HABITAT_CACHE_LIMIT = 128 as const;
export const CORE_ECOLOGY_ALPINE_TERRITORY_SPAN_BY_SPECIES = Object.freeze({
  "mountain-goat": 2,
  "american-pika": 1,
  "golden-eagle": 2,
} as const);
export const CORE_ECOLOGY_ALPINE_SPECIES = Object.freeze([
  "mountain-goat",
  "american-pika",
  "golden-eagle",
] as const satisfies readonly CoreWildlifeSpecies[]);

export type CoreEcologyAlpineSpecies = (typeof CORE_ECOLOGY_ALPINE_SPECIES)[number];
export type CoreEcologyAlpineGuild = Extract<
  CoreEcologyRegionalGuild,
  "aerial-forager" | "large-herbivore" | "small-prey"
>;
export type CoreEcologyAlpineAdmissionReason =
  | "admitted"
  | "density-roll-failed"
  | "group-size-insufficient"
  | "habitat-capacity-zero"
  | "regional-quiet"
  | "territory-owned-elsewhere"
  | "unsupported-predator";

export interface CoreEcologyAlpineTerritory {
  readonly version: typeof CORE_ECOLOGY_ALPINE_HABITAT_VERSION;
  readonly stableId: string;
  readonly species: CoreEcologyAlpineSpecies;
  readonly address: Readonly<{ readonly x: number; readonly y: number }>;
  readonly spanRegions: number;
  readonly bounds: Readonly<{
    readonly minimum: RegionCoord;
    readonly maximum: RegionCoord;
  }>;
  readonly hostRegion: RegionCoord;
  readonly regionIsHost: boolean;
}

export interface CoreEcologyAlpineTerrainSummary {
  readonly tileCount: number;
  readonly ridgeTileCount: number;
  readonly highRidgeTileCount: number;
  readonly talusTileCount: number;
  readonly exposedRidgeTileCount: number;
  readonly coldRidgeTileCount: number;
  readonly averageRidgeElevation: number;
  readonly averageRidgeRoughness: number;
  readonly averageRidgeExposure: number;
  readonly averageRidgeHeat: number;
  readonly coldSignal: number;
  readonly highCountrySignal: number;
  readonly talusSignal: number;
  readonly soaringSignal: number;
  /** Broad Alpha-32 small-prey support; never an exact target or position. */
  readonly baseSmallPreySupportUnits: number;
}

export interface CoreEcologyAlpineDensityAdmission {
  readonly regionalQuietRoll: number;
  readonly regionalQuietThreshold: number;
  readonly regionalQuiet: boolean;
  readonly guildCeilings: Readonly<Record<CoreEcologyAlpineGuild, number>>;
}

/**
 * Intentionally mirrors the shared regional-population field vocabulary so
 * the core ecology owner can consume it without a species-local patch format.
 */
export interface CoreEcologyAlpinePopulationCandidate {
  readonly version: typeof CORE_ECOLOGY_ALPINE_HABITAT_VERSION;
  readonly stableId: string;
  readonly populationKey: string;
  readonly species: CoreEcologyAlpineSpecies;
  readonly guild: CoreEcologyAlpineGuild;
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
  readonly admissionReason: CoreEcologyAlpineAdmissionReason;
  readonly anchors: readonly CoreEcologyRegionalPopulationAnchor[];
}

export interface CoreEcologyAlpineHabitat {
  readonly version: typeof CORE_ECOLOGY_ALPINE_HABITAT_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_ALPINE_HABITAT_OWNER_ID;
  readonly derivationKind: typeof CORE_ECOLOGY_ALPINE_DERIVATION_KIND;
  readonly region: RegionCoord;
  readonly regionId: string;
  readonly sourceStableId: string;
  readonly terrainHash: string;
  readonly baseRegionalHabitatHash: string;
  readonly baseRegionalSummaryHash: string;
  readonly summary: CoreEcologyAlpineTerrainSummary;
  readonly density: CoreEcologyAlpineDensityAdmission;
  readonly evaluatedSpeciesCount: typeof CORE_ECOLOGY_ALPINE_SPECIES.length;
  readonly populations: readonly CoreEcologyAlpinePopulationCandidate[];
  readonly totalPopulationUnits: number;
  readonly admittedSpeciesCount: number;
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyAlpineHabitatInput {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  /** Optional exact terrain multiset; caller ordering is deliberately ignored. */
  readonly terrain?: TerrainState;
  /** Test/integration seam. The complete fixed roster is always evaluated canonically. */
  readonly speciesOrder?: readonly CoreEcologyAlpineSpecies[];
}

interface AnalyzedAlpineTile {
  readonly tile: TerrainTile;
  readonly globalX: number;
  readonly globalY: number;
  readonly heat: number;
  readonly exposure: number;
  readonly cold: number;
  readonly scoreBySpecies: Readonly<Record<CoreEcologyAlpineSpecies, number>>;
  readonly rankBySpecies: Readonly<Record<CoreEcologyAlpineSpecies, number>>;
}

interface CandidateDraft {
  readonly species: CoreEcologyAlpineSpecies;
  readonly guild: CoreEcologyAlpineGuild;
  readonly territory: CoreEcologyAlpineTerritory;
  readonly suitableTiles: readonly AnalyzedAlpineTile[];
  readonly habitatScore: number;
  readonly habitatCapacity: number;
  readonly densityRoll: number;
  readonly densityThreshold: number;
  populationUnits: number;
  preySupportUnits: number;
  trophicCeiling: number;
  admissionReason: CoreEcologyAlpineAdmissionReason;
}

const UINT32_MAX = 0xffff_ffff;
const ALPINE_HABITAT_DOMAIN = 0x414c_5048;
const ALPINE_DENSITY_DOMAIN = 0x414c_5044;
const ALPINE_TERRITORY_DOMAIN = 0x414c_5054;
const ALPINE_ANCHOR_DOMAIN = 0x414c_5041;
const HASH_PATTERN = /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/u;
const TRUSTED_HABITATS = new WeakSet<object>();
const HABITAT_CACHE = new Map<string, CoreEcologyAlpineHabitat>();

const GUILD_BY_SPECIES: Readonly<Record<CoreEcologyAlpineSpecies, CoreEcologyAlpineGuild>> =
  Object.freeze({
    "mountain-goat": "large-herbivore",
    "american-pika": "small-prey",
    "golden-eagle": "aerial-forager",
  });

const GUILD_CEILINGS: Readonly<Record<CoreEcologyAlpineGuild, number>> = Object.freeze({
  "large-herbivore": 5,
  "small-prey": 32,
  "aerial-forager": 1,
});

const MINIMUM_SITE_SCORE: Readonly<Record<CoreEcologyAlpineSpecies, number>> = Object.freeze({
  "mountain-goat": 545_000,
  "american-pika": 555_000,
  "golden-eagle": 535_000,
});

const ANCHOR_PURPOSE_BY_SPECIES: Readonly<Record<CoreEcologyAlpineSpecies, number>> =
  Object.freeze({
    "mountain-goat": semanticPurpose("anchor:mountain-goat"),
    "american-pika": semanticPurpose("anchor:american-pika"),
    "golden-eagle": semanticPurpose("anchor:golden-eagle"),
  });

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

function alpineFloorDivide(value: number, divisor: number): number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw new RangeError("Alpine territory address must be a canonical safe integer");
  }
  return Math.floor(value / divisor);
}

function canonicalSpeciesOrder(
  value: readonly CoreEcologyAlpineSpecies[] | undefined,
): readonly CoreEcologyAlpineSpecies[] {
  const supplied = value ?? CORE_ECOLOGY_ALPINE_SPECIES;
  if (!Array.isArray(supplied)) throw new TypeError("Alpine species order must be an array");
  const unique = new Set<CoreEcologyAlpineSpecies>();
  for (const species of supplied) {
    if (!(CORE_ECOLOGY_ALPINE_SPECIES as readonly string[]).includes(species)) {
      throw new TypeError(`Unsupported Alpine species ${String(species)}`);
    }
    unique.add(species);
  }
  if (
    unique.size !== CORE_ECOLOGY_ALPINE_SPECIES.length
    || CORE_ECOLOGY_ALPINE_SPECIES.some((species) => !unique.has(species))
  ) throw new TypeError("Alpine habitat requires the complete fixed species roster");
  return CORE_ECOLOGY_ALPINE_SPECIES;
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
  ) throw new TypeError("Supplied Alpine terrain does not match the canonical region dimensions");
  const ordered = [...supplied.tiles].sort((left, right) => left.index - right.index);
  if (
    ordered.some((tile, index) => tile.index !== index)
    || stableStringify({ width: supplied.width, height: supplied.height, tiles: ordered })
      !== stableStringify(generated)
  ) throw new TypeError("Supplied Alpine terrain is not the canonical terrain multiset");
  return generated;
}

function territoryBounds(
  address: Readonly<{ readonly x: number; readonly y: number }>,
  span: number,
): Readonly<{ readonly minimum: RegionCoord; readonly maximum: RegionCoord }> {
  const minimumX = Math.max(-REGION_COORD_LIMIT, address.x * span);
  const minimumY = Math.max(-REGION_COORD_LIMIT, address.y * span);
  return Object.freeze({
    minimum: createRegionCoord(minimumX, minimumY),
    maximum: createRegionCoord(
      Math.min(REGION_COORD_LIMIT, minimumX + span - 1),
      Math.min(REGION_COORD_LIMIT, minimumY + span - 1),
    ),
  });
}

export function deriveCoreEcologyAlpineTerritory(
  seed: RootSeed,
  species: CoreEcologyAlpineSpecies,
  region: RegionCoord,
): CoreEcologyAlpineTerritory {
  requireRootSeed(seed);
  if (!isRegionCoord(region)) throw new RangeError("Alpine territory requires a canonical region");
  if (!(CORE_ECOLOGY_ALPINE_SPECIES as readonly string[]).includes(species)) {
    throw new TypeError("Alpine territory requires a Wave-F species");
  }
  const spanRegions = CORE_ECOLOGY_ALPINE_TERRITORY_SPAN_BY_SPECIES[species];
  const address = Object.freeze({
    x: alpineFloorDivide(region.x, spanRegions),
    y: alpineFloorDivide(region.y, spanRegions),
  });
  const bounds = territoryBounds(address, spanRegions);
  const width = bounds.maximum.x - bounds.minimum.x + 1;
  const height = bounds.maximum.y - bounds.minimum.y + 1;
  const hostOrdinal = keyedRandomInt(
    seed,
    ALPINE_TERRITORY_DOMAIN,
    address.x,
    address.y,
    semanticPurpose(`host:${species}`),
    0,
    width * height - 1,
  );
  const hostRegion = createRegionCoord(
    bounds.minimum.x + hostOrdinal % width,
    bounds.minimum.y + Math.trunc(hostOrdinal / width),
  );
  return deepFreeze({
    version: CORE_ECOLOGY_ALPINE_HABITAT_VERSION,
    stableId: stableRegionObjectId(seed, hostRegion, "alpine-territory", species),
    species,
    address,
    spanRegions,
    bounds,
    hostRegion,
    regionIsHost: hostRegion.x === region.x && hostRegion.y === region.y,
  });
}

function tileScore(
  species: CoreEcologyAlpineSpecies,
  tile: TerrainTile,
  heat: number,
  exposure: number,
): number {
  if (tile.terrain !== "ridge") return 0;
  const cold = FIXED_POINT - heat;
  const elevation = clampFixed(tile.elevation);
  const roughness = clampFixed(tile.roughness);
  switch (species) {
    case "mountain-goat":
      return fixedWeighted([
        [elevation, 4],
        [roughness, 3],
        [cold, 2],
        [exposure, 1],
      ]);
    case "american-pika":
      return fixedWeighted([
        [elevation, 3],
        [roughness, 5],
        [cold, 3],
        [FIXED_POINT - Math.trunc(exposure / 2), 1],
      ]);
    case "golden-eagle":
      return fixedWeighted([
        [elevation, 4],
        [roughness, 1],
        [exposure, 4],
        [cold, 1],
      ]);
  }
}

function analyzeTerrain(
  seed: RootSeed,
  region: RegionCoord,
  terrain: TerrainState,
): Readonly<{
  readonly tiles: readonly AnalyzedAlpineTile[];
  readonly summary: Omit<CoreEcologyAlpineTerrainSummary, "baseSmallPreySupportUnits">;
}> {
  const tiles: AnalyzedAlpineTile[] = [];
  let ridgeTileCount = 0;
  let highRidgeTileCount = 0;
  let talusTileCount = 0;
  let exposedRidgeTileCount = 0;
  let coldRidgeTileCount = 0;
  let ridgeElevation = 0;
  let ridgeRoughness = 0;
  let ridgeExposure = 0;
  let ridgeHeat = 0;

  for (const tile of terrain.tiles) {
    // Every Alpine species in this sealed roster requires ridge terrain.
    // Non-ridge tiles contribute only to the denominator below, so avoid
    // running biome, magical-water, and three anchor-hash derivations for
    // thousands of tiles that can never become a candidate.
    if (tile.terrain !== "ridge") continue;
    const global = regionLocalToGlobalTile(region, tile.x, tile.y);
    // Alpine scoring consumes only baseline heat and exposure. Computing a
    // classified biome, its interaction payload, and an unused magical-water
    // channel here would add four derived values without changing admission.
    const climate = deriveBaselineBiomeClimate(
      seed,
      tile,
      WORLD_HEIGHT,
      0,
      global,
    );
    const heat = climate.heat;
    const exposure = climate.exposure;
    const cold = FIXED_POINT - heat;
    const scoreBySpecies = Object.freeze({
      "mountain-goat": tileScore("mountain-goat", tile, heat, exposure),
      "american-pika": tileScore("american-pika", tile, heat, exposure),
      "golden-eagle": tileScore("golden-eagle", tile, heat, exposure),
    });
    const rankBySpecies = Object.freeze({
      "mountain-goat": keyedRandomU32(
        seed,
        ALPINE_ANCHOR_DOMAIN,
        global.x,
        global.y,
        ANCHOR_PURPOSE_BY_SPECIES["mountain-goat"],
      ),
      "american-pika": keyedRandomU32(
        seed,
        ALPINE_ANCHOR_DOMAIN,
        global.x,
        global.y,
        ANCHOR_PURPOSE_BY_SPECIES["american-pika"],
      ),
      "golden-eagle": keyedRandomU32(
        seed,
        ALPINE_ANCHOR_DOMAIN,
        global.x,
        global.y,
        ANCHOR_PURPOSE_BY_SPECIES["golden-eagle"],
      ),
    });
    tiles.push(Object.freeze({
      tile: Object.freeze({ ...tile }),
      globalX: global.x,
      globalY: global.y,
      heat,
      exposure,
      cold,
      scoreBySpecies,
      rankBySpecies,
    }));
    ridgeTileCount += 1;
    if (tile.elevation >= 820_000) highRidgeTileCount += 1;
    if (tile.elevation >= 760_000 && tile.roughness >= 170_000) talusTileCount += 1;
    if (exposure >= 390_000) exposedRidgeTileCount += 1;
    if (heat <= 420_000) coldRidgeTileCount += 1;
    ridgeElevation += tile.elevation;
    ridgeRoughness += tile.roughness;
    ridgeExposure += exposure;
    ridgeHeat += heat;
  }
  const averageRidgeElevation = ridgeTileCount === 0 ? 0 : Math.trunc(ridgeElevation / ridgeTileCount);
  const averageRidgeRoughness = ridgeTileCount === 0 ? 0 : Math.trunc(ridgeRoughness / ridgeTileCount);
  const averageRidgeExposure = ridgeTileCount === 0 ? 0 : Math.trunc(ridgeExposure / ridgeTileCount);
  const averageRidgeHeat = ridgeTileCount === 0 ? FIXED_POINT : Math.trunc(ridgeHeat / ridgeTileCount);
  const coldSignal = ridgeTileCount === 0 ? 0 : FIXED_POINT - averageRidgeHeat;
  const ridgeShare = ratioFixed(ridgeTileCount, terrain.tiles.length);
  const highRidgeShare = ratioFixed(highRidgeTileCount, Math.max(1, ridgeTileCount));
  const talusShare = ratioFixed(talusTileCount, Math.max(1, ridgeTileCount));
  const exposedShare = ratioFixed(exposedRidgeTileCount, Math.max(1, ridgeTileCount));
  return deepFreeze({
    tiles,
    summary: {
      tileCount: terrain.tiles.length,
      ridgeTileCount,
      highRidgeTileCount,
      talusTileCount,
      exposedRidgeTileCount,
      coldRidgeTileCount,
      averageRidgeElevation,
      averageRidgeRoughness,
      averageRidgeExposure,
      averageRidgeHeat,
      coldSignal,
      highCountrySignal: fixedWeighted([
        [ridgeShare, 5],
        [highRidgeShare, 2],
        [averageRidgeElevation, 3],
        [averageRidgeRoughness, 2],
        [averageRidgeExposure, 2],
        [coldSignal, 2],
      ]),
      talusSignal: fixedWeighted([
        [ridgeShare, 2],
        [talusShare, 5],
        [averageRidgeRoughness, 3],
        [coldSignal, 2],
      ]),
      soaringSignal: fixedWeighted([
        [ridgeShare, 2],
        [exposedShare, 4],
        [averageRidgeElevation, 3],
        [averageRidgeExposure, 3],
      ]),
    },
  });
}

function capacityFor(
  species: CoreEcologyAlpineSpecies,
  suitableTiles: readonly AnalyzedAlpineTile[],
): number {
  const weightedTiles = Math.trunc(suitableTiles.reduce(
    (sum, tile) => sum + tile.scoreBySpecies[species],
    0,
  ) / FIXED_POINT);
  switch (species) {
    case "mountain-goat": {
      const units = Math.min(5, Math.trunc(weightedTiles / 12));
      return units < 2 ? 0 : units;
    }
    case "american-pika": {
      const units = Math.min(32, Math.trunc(weightedTiles / 3));
      return units < 4 ? 0 : units;
    }
    case "golden-eagle":
      return weightedTiles >= 12 ? 1 : 0;
  }
}

function densityThresholdFor(species: CoreEcologyAlpineSpecies, habitatScore: number): number {
  const minimum = MINIMUM_SITE_SCORE[species];
  const quality = habitatScore <= minimum
    ? 0
    : ratioFixed(habitatScore - minimum, FIXED_POINT - minimum);
  switch (species) {
    case "mountain-goat": return 550_000 + Math.trunc((quality * 350_000) / FIXED_POINT);
    case "american-pika": return 650_000 + Math.trunc((quality * 300_000) / FIXED_POINT);
    case "golden-eagle": return 450_000 + Math.trunc((quality * 300_000) / FIXED_POINT);
  }
}

function createDraft(
  seed: RootSeed,
  region: RegionCoord,
  species: CoreEcologyAlpineSpecies,
  analysis: ReturnType<typeof analyzeTerrain>,
  regionalQuiet: boolean,
): CandidateDraft {
  const suitableTiles = analysis.tiles.filter((tile) => (
    tile.scoreBySpecies[species] >= MINIMUM_SITE_SCORE[species]
  ));
  const habitatScore = suitableTiles.length === 0
    ? 0
    : Math.trunc(suitableTiles.reduce(
      (sum, tile) => sum + tile.scoreBySpecies[species],
      0,
    ) / suitableTiles.length);
  const habitatCapacity = capacityFor(species, suitableTiles);
  const densityThreshold = densityThresholdFor(species, habitatScore);
  const densityRoll = keyedRandomInt(
    seed,
    ALPINE_DENSITY_DOMAIN,
    region.x,
    region.y,
    semanticPurpose(`density:${species}`),
    0,
    FIXED_POINT - 1,
  );
  const territory = deriveCoreEcologyAlpineTerritory(seed, species, region);
  let admissionReason: CoreEcologyAlpineAdmissionReason = "admitted";
  let populationUnits = habitatCapacity;
  if (habitatCapacity === 0) {
    admissionReason = "habitat-capacity-zero";
    populationUnits = 0;
  } else if (regionalQuiet) {
    admissionReason = "regional-quiet";
    populationUnits = 0;
  } else if (!territory.regionIsHost) {
    admissionReason = "territory-owned-elsewhere";
    populationUnits = 0;
  } else if (densityRoll >= densityThreshold) {
    admissionReason = "density-roll-failed";
    populationUnits = 0;
  } else if (species === "mountain-goat" && populationUnits < 2) {
    admissionReason = "group-size-insufficient";
    populationUnits = 0;
  }
  return {
    species,
    guild: GUILD_BY_SPECIES[species],
    territory,
    suitableTiles,
    habitatScore,
    habitatCapacity,
    densityRoll,
    densityThreshold,
    populationUnits,
    preySupportUnits: 0,
    trophicCeiling: habitatCapacity,
    admissionReason,
  };
}

function applyBroadEagleSupport(
  drafts: readonly CandidateDraft[],
  baseSmallPreySupportUnits: number,
): void {
  const pika = drafts.find(({ species }) => species === "american-pika");
  const eagle = drafts.find(({ species }) => species === "golden-eagle");
  if (eagle === undefined) throw new Error("Alpine roster lost the golden eagle");
  const support = (pika?.populationUnits ?? 0) * 2 + baseSmallPreySupportUnits;
  eagle.preySupportUnits = support;
  eagle.trophicCeiling = support >= 4 ? 1 : 0;
  if (eagle.populationUnits > eagle.trophicCeiling) eagle.populationUnits = eagle.trophicCeiling;
  if (eagle.populationUnits === 0 && eagle.admissionReason === "admitted") {
    eagle.admissionReason = "unsupported-predator";
  }
}

function chooseAnchors(
  seed: RootSeed,
  region: RegionCoord,
  draft: CandidateDraft,
  occupiedTiles: Set<number>,
): readonly CoreEcologyRegionalPopulationAnchor[] {
  if (draft.populationUnits === 0) return Object.freeze([]);
  const desired = draft.species === "mountain-goat"
    ? draft.populationUnits
    : draft.species === "american-pika"
      ? Math.min(3, draft.populationUnits, draft.suitableTiles.length)
      : 1;
  const ordered = [...draft.suitableTiles].sort((left, right) => (
    right.scoreBySpecies[draft.species] - left.scoreBySpecies[draft.species]
    || left.rankBySpecies[draft.species] - right.rankBySpecies[draft.species]
    || left.tile.index - right.tile.index
  ));
  const selected: AnalyzedAlpineTile[] = [];
  const minimumSeparation = draft.species === "american-pika" ? 7 : 5;
  const minimumSquared = minimumSeparation * minimumSeparation;
  for (const candidate of ordered) {
    if (occupiedTiles.has(candidate.tile.index)) continue;
    if (selected.every((current) => {
      const x = current.tile.x - candidate.tile.x;
      const y = current.tile.y - candidate.tile.y;
      return x * x + y * y >= minimumSquared;
    })) selected.push(candidate);
    if (selected.length === desired) break;
  }
  if (selected.length < desired) {
    for (const candidate of ordered) {
      if (occupiedTiles.has(candidate.tile.index) || selected.includes(candidate)) continue;
      selected.push(candidate);
      if (selected.length === desired) break;
    }
  }
  if (selected.length === 0) {
    throw new Error(`Admitted Alpine species ${draft.species} has no usable anchor`);
  }
  for (const tile of selected) occupiedTiles.add(tile.tile.index);
  const baseUnits = Math.trunc(draft.populationUnits / selected.length);
  const remainder = draft.populationUnits % selected.length;
  return Object.freeze(selected.map((entry, ordinal) => Object.freeze({
    stableId: stableRegionObjectId(seed, region, "alpine-anchor", `${draft.species}:${ordinal}`),
    localX: entry.tile.x,
    localY: entry.tile.y,
    globalX: entry.globalX,
    globalY: entry.globalY,
    habitatScore: entry.scoreBySpecies[draft.species],
    allocatedPopulation: baseUnits + (ordinal < remainder ? 1 : 0),
  })));
}

function cacheKey(seed: RootSeed, region: RegionCoord): string {
  return hashCanonical([
    CORE_ECOLOGY_ALPINE_HABITAT_OWNER_ID,
    CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
    seed,
    region.x,
    region.y,
  ]);
}

function cacheHabitat(key: string, habitat: CoreEcologyAlpineHabitat): CoreEcologyAlpineHabitat {
  HABITAT_CACHE.delete(key);
  HABITAT_CACHE.set(key, habitat);
  while (HABITAT_CACHE.size > CORE_ECOLOGY_ALPINE_HABITAT_CACHE_LIMIT) {
    const oldest = HABITAT_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    HABITAT_CACHE.delete(oldest);
  }
  return habitat;
}

/** Cache state is a performance detail and never participates in habitat truth. */
export function clearCoreEcologyAlpineHabitatCache(): void {
  HABITAT_CACHE.clear();
}

/**
 * Derives an append-only high-country layer from canonical terrain and the
 * sealed Alpha-32 regional summary. Presence is sparse and never follows the
 * player, camera, traversal order, or region-load order.
 */
export function deriveCoreEcologyAlpineHabitat(
  input: DeriveCoreEcologyAlpineHabitatInput,
): CoreEcologyAlpineHabitat {
  if (!plainRecord(input)) throw new TypeError("Alpine habitat input is malformed");
  requireRootSeed(input.seed);
  if (!isRegionCoord(input.region)) throw new RangeError("Alpine habitat requires a canonical region");
  canonicalSpeciesOrder(input.speciesOrder);
  const region = createRegionCoord(input.region.x, input.region.y);
  const key = cacheKey(input.seed, region);
  // A caller-supplied terrain value must always be authenticated even when the
  // canonical habitat is cached. The ordinary world-bound path has no supplied
  // terrain, so it can reuse the already authenticated deterministic result
  // without regenerating an entire region merely to rediscover the cache key.
  if (input.terrain === undefined) {
    const cached = HABITAT_CACHE.get(key);
    if (cached !== undefined) return cacheHabitat(key, cached);
  }
  const terrain = canonicalTerrain(input.seed, region, input.terrain);
  const cached = HABITAT_CACHE.get(key);
  if (cached !== undefined) return cacheHabitat(key, cached);
  // The regional habitat owns its own canonical terrain derivation and cache.
  // Avoid hashing this 6,912-tile value a second time when the shared regional
  // layer has already admitted the same active region.
  const base = deriveCoreEcologyRegionalHabitat({ seed: input.seed, region });
  const analysis = analyzeTerrain(input.seed, region, terrain);
  const baseSmallPreySupportUnits = base.populations
    .filter(({ guild }) => guild === "small-prey")
    .reduce((sum, population) => sum + population.populationUnits, 0);
  const summary = deepFreeze({
    ...analysis.summary,
    baseSmallPreySupportUnits,
  });
  const regionalQuietRoll = keyedRandomInt(
    input.seed,
    ALPINE_HABITAT_DOMAIN,
    region.x,
    region.y,
    semanticPurpose("regional-quiet"),
    0,
    FIXED_POINT - 1,
  );
  const regionalQuietThreshold = Math.min(
    900_000,
    summary.ridgeTileCount === 0
      ? 0
      : 400_000 + Math.trunc((summary.highCountrySignal * 800_000) / FIXED_POINT),
  );
  const regionalQuiet = regionalQuietRoll >= regionalQuietThreshold;
  const drafts = CORE_ECOLOGY_ALPINE_SPECIES.map((species) => createDraft(
    input.seed,
    region,
    species,
    analysis,
    regionalQuiet,
  ));
  applyBroadEagleSupport(drafts, baseSmallPreySupportUnits);
  const occupiedTiles = new Set<number>();
  const populations = drafts.map((draft): CoreEcologyAlpinePopulationCandidate => {
    const anchors = chooseAnchors(input.seed, region, draft, occupiedTiles);
    const candidate = {
      version: CORE_ECOLOGY_ALPINE_HABITAT_VERSION,
      stableId: stableRegionObjectId(input.seed, region, "alpine-population", draft.species),
      populationKey: `al1:${hashCanonical({ regionId: stableRegionId(input.seed, region), species: draft.species })}:${draft.species}`,
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
      guildCeiling: GUILD_CEILINGS[draft.guild],
      populationUnits: draft.populationUnits,
      admissionReason: draft.admissionReason,
      anchors,
    } as const;
    return deepFreeze(candidate);
  });
  const totalPopulationUnits = populations.reduce((sum, population) => (
    sum + population.populationUnits
  ), 0);
  const habitatBase = {
    version: CORE_ECOLOGY_ALPINE_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_ALPINE_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
    region,
    regionId: stableRegionId(input.seed, region),
    sourceStableId: stableRegionObjectId(input.seed, region, "alpine-source", "regional-alpine-v1"),
    terrainHash: regionTerrainHash(terrain),
    baseRegionalHabitatHash: base.derivationHash,
    baseRegionalSummaryHash: hashCanonical(base.summary),
    summary,
    density: deepFreeze({
      regionalQuietRoll,
      regionalQuietThreshold,
      regionalQuiet,
      guildCeilings: GUILD_CEILINGS,
    }),
    evaluatedSpeciesCount: CORE_ECOLOGY_ALPINE_SPECIES.length,
    populations: Object.freeze(populations),
    totalPopulationUnits,
    admittedSpeciesCount: populations.filter(({ populationUnits }) => populationUnits > 0).length,
  } as const;
  const habitat = canonicalizeCoreEcologyAlpineHabitat({
    ...habitatBase,
    derivationHash: hashCanonical(habitatBase),
  });
  if (habitat === null) throw new Error("Generated Alpine habitat failed canonical validation");
  return cacheHabitat(key, habitat);
}

export function canonicalizeCoreEcologyAlpineHabitat(
  value: unknown,
): CoreEcologyAlpineHabitat | null {
  if (typeof value === "object" && value !== null && TRUSTED_HABITATS.has(value)) {
    return value as CoreEcologyAlpineHabitat;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedSpeciesCount",
    "baseRegionalHabitatHash",
    "baseRegionalSummaryHash",
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
    "totalPopulationUnits",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_ALPINE_HABITAT_VERSION
    || value.ownerId !== CORE_ECOLOGY_ALPINE_HABITAT_OWNER_ID
    || value.derivationKind !== CORE_ECOLOGY_ALPINE_DERIVATION_KIND
    || !isRegionCoord(value.region)
    || !validId(value.regionId)
    || !validId(value.sourceStableId)
    || !validHash(value.terrainHash)
    || !validHash(value.baseRegionalHabitatHash)
    || !validHash(value.baseRegionalSummaryHash)
    || value.evaluatedSpeciesCount !== CORE_ECOLOGY_ALPINE_SPECIES.length
    || !Array.isArray(value.populations)
    || value.populations.length !== CORE_ECOLOGY_ALPINE_SPECIES.length
    || !nonnegativeSafeInteger(value.totalPopulationUnits)
    || !nonnegativeSafeInteger(value.admittedSpeciesCount)
    || value.admittedSpeciesCount > CORE_ECOLOGY_ALPINE_SPECIES.length
    || !validHash(value.derivationHash)
  ) return null;
  const summary = canonicalSummary(value.summary);
  const density = canonicalDensity(value.density);
  if (summary === null || density === null) return null;
  const populations: CoreEcologyAlpinePopulationCandidate[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  const anchorIds = new Set<string>();
  const anchorTiles = new Set<number>();
  for (let index = 0; index < value.populations.length; index += 1) {
    const species = CORE_ECOLOGY_ALPINE_SPECIES[index];
    if (species === undefined) return null;
    const population = canonicalPopulation(
      value.populations[index],
      species,
      value.region,
      density,
      summary,
      ids,
      keys,
      anchorIds,
      anchorTiles,
    );
    if (population === null) return null;
    populations.push(population);
  }
  const totalPopulationUnits = populations.reduce((sum, population) => (
    sum + population.populationUnits
  ), 0);
  const admittedSpeciesCount = populations.filter(({ populationUnits }) => populationUnits > 0).length;
  if (
    totalPopulationUnits !== value.totalPopulationUnits
    || admittedSpeciesCount !== value.admittedSpeciesCount
  ) return null;
  const base = {
    version: CORE_ECOLOGY_ALPINE_HABITAT_VERSION,
    ownerId: CORE_ECOLOGY_ALPINE_HABITAT_OWNER_ID,
    derivationKind: CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
    region: createRegionCoord(value.region.x, value.region.y),
    regionId: value.regionId,
    sourceStableId: value.sourceStableId,
    terrainHash: value.terrainHash,
    baseRegionalHabitatHash: value.baseRegionalHabitatHash,
    baseRegionalSummaryHash: value.baseRegionalSummaryHash,
    summary,
    density,
    evaluatedSpeciesCount: CORE_ECOLOGY_ALPINE_SPECIES.length,
    populations: Object.freeze(populations),
    totalPopulationUnits,
    admittedSpeciesCount,
  } as const;
  if (hashCanonical(base) !== value.derivationHash) return null;
  const habitat = deepFreeze({ ...base, derivationHash: value.derivationHash });
  TRUSTED_HABITATS.add(habitat);
  return habitat;
}

export function canonicalCoreEcologyAlpineHabitatForWorld(
  value: unknown,
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyAlpineHabitat | null {
  const habitat = canonicalizeCoreEcologyAlpineHabitat(value);
  if (habitat === null || !isRegionCoord(region)) return null;
  try {
    requireRootSeed(seed);
    const expected = deriveCoreEcologyAlpineHabitat({ seed, region });
    return stableStringify(habitat) === stableStringify(expected) ? habitat : null;
  } catch {
    return null;
  }
}

function canonicalSummary(value: unknown): CoreEcologyAlpineTerrainSummary | null {
  const keys = [
    "averageRidgeElevation",
    "averageRidgeExposure",
    "averageRidgeHeat",
    "averageRidgeRoughness",
    "baseSmallPreySupportUnits",
    "coldRidgeTileCount",
    "coldSignal",
    "exposedRidgeTileCount",
    "highCountrySignal",
    "highRidgeTileCount",
    "ridgeTileCount",
    "soaringSignal",
    "talusSignal",
    "talusTileCount",
    "tileCount",
  ] as const;
  if (!plainRecord(value) || !exactKeys(value, keys)) return null;
  if (
    value.tileCount !== WORLD_WIDTH * WORLD_HEIGHT
    || !nonnegativeSafeInteger(value.ridgeTileCount)
    || value.ridgeTileCount > value.tileCount
    || !nonnegativeSafeInteger(value.highRidgeTileCount)
    || value.highRidgeTileCount > value.tileCount
    || !nonnegativeSafeInteger(value.talusTileCount)
    || value.talusTileCount > value.tileCount
    || !nonnegativeSafeInteger(value.exposedRidgeTileCount)
    || value.exposedRidgeTileCount > value.tileCount
    || !nonnegativeSafeInteger(value.coldRidgeTileCount)
    || value.coldRidgeTileCount > value.tileCount
    || !nonnegativeSafeInteger(value.baseSmallPreySupportUnits)
    || !fixedInteger(value.averageRidgeElevation)
    || !fixedInteger(value.averageRidgeExposure)
    || !fixedInteger(value.averageRidgeHeat)
    || !fixedInteger(value.averageRidgeRoughness)
    || !fixedInteger(value.coldSignal)
    || !fixedInteger(value.highCountrySignal)
    || !fixedInteger(value.talusSignal)
    || !fixedInteger(value.soaringSignal)
    || value.highRidgeTileCount > value.ridgeTileCount
    || value.talusTileCount > value.ridgeTileCount
    || value.exposedRidgeTileCount > value.ridgeTileCount
    || value.coldRidgeTileCount > value.ridgeTileCount
  ) return null;
  return deepFreeze({
    tileCount: value.tileCount,
    ridgeTileCount: value.ridgeTileCount,
    highRidgeTileCount: value.highRidgeTileCount,
    talusTileCount: value.talusTileCount,
    exposedRidgeTileCount: value.exposedRidgeTileCount,
    coldRidgeTileCount: value.coldRidgeTileCount,
    averageRidgeElevation: value.averageRidgeElevation,
    averageRidgeRoughness: value.averageRidgeRoughness,
    averageRidgeExposure: value.averageRidgeExposure,
    averageRidgeHeat: value.averageRidgeHeat,
    coldSignal: value.coldSignal,
    highCountrySignal: value.highCountrySignal,
    talusSignal: value.talusSignal,
    soaringSignal: value.soaringSignal,
    baseSmallPreySupportUnits: value.baseSmallPreySupportUnits,
  });
}

function canonicalDensity(value: unknown): CoreEcologyAlpineDensityAdmission | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "guildCeilings",
    "regionalQuiet",
    "regionalQuietRoll",
    "regionalQuietThreshold",
  ])) return null;
  if (
    typeof value.regionalQuiet !== "boolean"
    || !fixedInteger(value.regionalQuietRoll)
    || !fixedInteger(value.regionalQuietThreshold)
    || value.regionalQuiet !== (value.regionalQuietRoll >= value.regionalQuietThreshold)
    || !plainRecord(value.guildCeilings)
    || !exactKeys(value.guildCeilings, ["aerial-forager", "large-herbivore", "small-prey"])
    || stableStringify(value.guildCeilings) !== stableStringify(GUILD_CEILINGS)
  ) return null;
  return deepFreeze({
    regionalQuietRoll: value.regionalQuietRoll,
    regionalQuietThreshold: value.regionalQuietThreshold,
    regionalQuiet: value.regionalQuiet,
    guildCeilings: GUILD_CEILINGS,
  });
}

function canonicalPopulation(
  value: unknown,
  expectedSpecies: CoreEcologyAlpineSpecies,
  region: RegionCoord,
  density: CoreEcologyAlpineDensityAdmission,
  summary: CoreEcologyAlpineTerrainSummary,
  ids: Set<string>,
  populationKeys: Set<string>,
  anchorIds: Set<string>,
  anchorTiles: Set<number>,
): CoreEcologyAlpinePopulationCandidate | null {
  if (!plainRecord(value) || !exactKeys(value, [
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
  ])) return null;
  const species = expectedSpecies;
  if (
    value.version !== CORE_ECOLOGY_ALPINE_HABITAT_VERSION
    || value.species !== species
    || value.guild !== GUILD_BY_SPECIES[species]
    || value.actorRepresentation !== getCoreWildlifeSpeciesMetadata(species).actorRepresentation
    || !validId(value.stableId)
    || ids.has(value.stableId)
    || !validId(value.populationKey)
    || populationKeys.has(value.populationKey)
    || !validId(value.territoryId)
    || !isRegionCoord(value.territoryHostRegion)
    || typeof value.territoryOwnedHere !== "boolean"
    || value.territoryOwnedHere !== (
      value.territoryHostRegion.x === region.x && value.territoryHostRegion.y === region.y
    )
    || !fixedInteger(value.habitatScore)
    || !nonnegativeSafeInteger(value.suitableTileCount)
    || value.suitableTileCount > summary.tileCount
    || !nonnegativeSafeInteger(value.habitatCapacity)
    || value.habitatCapacity > getCoreWildlifeProfile(species).maximumPatchPopulation
    || !fixedInteger(value.densityRoll)
    || !fixedInteger(value.densityThreshold)
    || !nonnegativeSafeInteger(value.preySupportUnits)
    || !nonnegativeSafeInteger(value.trophicCeiling)
    || value.trophicCeiling > getCoreWildlifeProfile(species).maximumPatchPopulation
    || value.guildCeiling !== density.guildCeilings[GUILD_BY_SPECIES[species]]
    || !nonnegativeSafeInteger(value.populationUnits)
    || value.populationUnits > value.habitatCapacity
    || typeof value.admissionReason !== "string"
    || !(ADMISSION_REASONS as ReadonlySet<string>).has(value.admissionReason)
    || !Array.isArray(value.anchors)
    || value.anchors.length > (species === "mountain-goat" ? 5 : 3)
  ) return null;
  const admitted = value.populationUnits > 0;
  if (
    admitted !== (value.admissionReason === "admitted")
    || admitted !== (value.anchors.length > 0)
    || (admitted && !value.territoryOwnedHere)
    || (density.regionalQuiet && admitted)
    || (species === "mountain-goat" && admitted && (value.populationUnits < 2 || value.populationUnits > 5))
    || (species === "american-pika" && admitted && value.populationUnits < 4)
    || (species === "golden-eagle" && value.populationUnits > 1)
    || (species === "golden-eagle" && value.populationUnits > value.trophicCeiling)
    || (species !== "golden-eagle" && value.preySupportUnits !== 0)
  ) return null;
  let allocated = 0;
  for (const anchor of value.anchors) {
    if (!plainRecord(anchor) || !exactKeys(anchor, [
      "allocatedPopulation",
      "globalX",
      "globalY",
      "habitatScore",
      "localX",
      "localY",
      "stableId",
    ])) return null;
    if (
      !validId(anchor.stableId)
      || anchorIds.has(anchor.stableId)
      || !nonnegativeSafeInteger(anchor.localX)
      || anchor.localX >= WORLD_WIDTH
      || !nonnegativeSafeInteger(anchor.localY)
      || anchor.localY >= WORLD_HEIGHT
      || !signedSafeInteger(anchor.globalX)
      || !signedSafeInteger(anchor.globalY)
      || !fixedInteger(anchor.habitatScore)
      || !positiveSafeInteger(anchor.allocatedPopulation)
    ) return null;
    const global = regionLocalToGlobalTile(region, anchor.localX, anchor.localY);
    const tileIndex = anchor.localY * WORLD_WIDTH + anchor.localX;
    if (
      global.x !== anchor.globalX
      || global.y !== anchor.globalY
      || anchorTiles.has(tileIndex)
    ) return null;
    anchorIds.add(anchor.stableId);
    anchorTiles.add(tileIndex);
    allocated += anchor.allocatedPopulation;
  }
  if (allocated !== value.populationUnits) return null;
  ids.add(value.stableId);
  populationKeys.add(value.populationKey);
  return deepFreeze({
    version: CORE_ECOLOGY_ALPINE_HABITAT_VERSION,
    stableId: value.stableId,
    populationKey: value.populationKey,
    species,
    guild: GUILD_BY_SPECIES[species],
    actorRepresentation: getCoreWildlifeSpeciesMetadata(species).actorRepresentation,
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
    preySupportUnits: value.preySupportUnits,
    trophicCeiling: value.trophicCeiling,
    guildCeiling: value.guildCeiling,
    populationUnits: value.populationUnits,
    admissionReason: value.admissionReason as CoreEcologyAlpineAdmissionReason,
    anchors: Object.freeze(value.anchors.map((anchor) => Object.freeze({
      stableId: anchor.stableId,
      localX: anchor.localX,
      localY: anchor.localY,
      globalX: anchor.globalX,
      globalY: anchor.globalY,
      habitatScore: anchor.habitatScore,
      allocatedPopulation: anchor.allocatedPopulation,
    }))),
  });
}

const ADMISSION_REASONS: ReadonlySet<CoreEcologyAlpineAdmissionReason> = new Set([
  "admitted",
  "density-roll-failed",
  "group-size-insufficient",
  "habitat-capacity-zero",
  "regional-quiet",
  "territory-owned-elsewhere",
  "unsupported-predator",
]);

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function fixedInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= FIXED_POINT;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function signedSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function requireRootSeed(seed: RootSeed): void {
  if (!Array.isArray(seed) || seed.length !== 4 || seed.some((word) => (
    !Number.isSafeInteger(word)
    || word < 0
    || word > UINT32_MAX
    || Object.is(word, -0)
  ))) throw new RangeError("Alpine habitat seed must contain four canonical uint32 words");
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
