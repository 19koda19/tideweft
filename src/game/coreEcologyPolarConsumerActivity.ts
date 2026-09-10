import {
  deriveBiomeProfile,
  deriveMagicalWaterInfluence,
} from "../sim/biomes";
import { generateRegionTerrain, regionTerrainHash } from "../sim/regionTerrain";
import type { RootSeed } from "../sim/rng";
import { regionLocalToGlobalTile } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { compareText } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  deriveCoreEcologyShoreWaterActivityAuthority,
  isTrustedCoreEcologyActivityAuthority,
  type CoreEcologyActivityAuthorityV1,
} from "./coreEcologyActivityAuthority";
import {
  CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
  type CoreEcologyPolarConsumerPopulationAnchor,
} from "./coreEcologyPolarConsumerHabitat";
import type { CoreEcologyTidalWebHabitatAnchor } from "./coreEcologyHabitat";
import { canonicalCoreEcologyPolarConsumerResidentPatch } from "./regionalPolarConsumerResidents";

export interface ProjectCoreEcologyPolarConsumerActivityAuthorityInput {
  readonly rootSeed: RootSeed;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly actorId: string;
}

const HARBOR_SEAL_SPECIES = "harbor-seal" as const;
const AUTHORITY_CACHE_LIMIT = 64;
const AUTHORITY_CACHE = new Map<string, CoreEcologyActivityAuthorityV1>();
const WORLD_BOUND_AUTHORITIES = new WeakSet<object>();

/**
 * Reprojects one seal's amphibious destinations from its authenticated
 * capelin-backed habitat. Callers cannot inject camera tiles or arbitrary
 * water: resident custody, terrain, both anchors, and the actor ID are rebound
 * to the root seed before the shared activity kernel receives them.
 */
export function projectCoreEcologyPolarConsumerActivityAuthority(
  value: unknown,
): CoreEcologyActivityAuthorityV1 | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["actorId", "patch", "rootSeed"])
    || typeof value.actorId !== "string"
  ) return null;

  try {
    const rootSeed = value.rootSeed as RootSeed;
    const structural = canonicalizeCoreEcologyAggregatePatch(value.patch);
    if (structural === null) return null;
    const patch = canonicalCoreEcologyPolarConsumerResidentPatch(value.patch, {
      seed: rootSeed,
      region: structural.originRegion,
      completedTick: structural.updatedAtTick,
    });
    const derivation = patch?.derivation as unknown as Readonly<{
      readonly kind?: unknown;
      readonly habitat?: unknown;
    }> | undefined;
    if (
      patch === null
      || derivation?.kind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND
      || !plainRecord(derivation.habitat)
    ) return null;
    const habitat = derivation.habitat as Readonly<{
      readonly derivationHash: string;
      readonly terrainHash: string;
      readonly populations: readonly Readonly<{
        readonly species: string;
        readonly populationKey: string;
        readonly populationUnits: number;
        readonly anchors: readonly CoreEcologyPolarConsumerPopulationAnchor[];
      }>[];
    }>;
    const owners = patch.populations.flatMap((population) => (
      population.species === HARBOR_SEAL_SPECIES
        ? population.members
            .filter(({ actor }) => actor.identity.stableId === value.actorId)
            .map((member) => Object.freeze({ member, population }))
        : []
    ));
    if (owners.length !== 1) return null;
    const owned = owners[0]!;
    const candidate = habitat.populations.find((population) => (
      population.species === HARBOR_SEAL_SPECIES
      && population.populationKey === owned.population.populationKey
      && population.populationUnits === 1
    ));
    if (candidate === undefined || candidate.anchors.length !== 2) return null;
    const water = candidate.anchors.find(({ purpose }) => purpose === "foraging-water");
    const haulout = candidate.anchors.find(({ purpose }) => purpose === "dry-haulout");
    if (water === undefined || haulout === undefined) return null;

    const cacheKey = `${habitat.derivationHash}:${patch.patchKey}:${value.actorId}`;
    const cached = AUTHORITY_CACHE.get(cacheKey);
    if (cached !== undefined) return cacheAuthority(cacheKey, cached);

    const terrain = generateRegionTerrain(rootSeed, patch.originRegion);
    if (regionTerrainHash(terrain) !== habitat.terrainHash) return null;
    const anchors = [
      activityAnchor(rootSeed, terrain, water, "foraging"),
      activityAnchor(rootSeed, terrain, haulout, "haulout"),
    ];
    if (anchors.some((anchor) => anchor === null)) return null;
    const authority = deriveCoreEcologyShoreWaterActivityAuthority({
      sourceKey: patch.patchKey,
      actorId: value.actorId,
      species: HARBOR_SEAL_SPECIES,
      homeAnchor: haulout.position,
      tidalAnchors: anchors as CoreEcologyTidalWebHabitatAnchor[],
    });
    return authority === null ? null : cacheAuthority(cacheKey, authority);
  } catch {
    return null;
  }
}

/** Only the world-bound polar-consumer adapter mints this production receipt. */
export function isTrustedCoreEcologyPolarConsumerActivityAuthority(
  value: unknown,
): value is CoreEcologyActivityAuthorityV1 {
  return isTrustedCoreEcologyActivityAuthority(value)
    && WORLD_BOUND_AUTHORITIES.has(value);
}

function activityAnchor(
  rootSeed: RootSeed,
  terrain: ReturnType<typeof generateRegionTerrain>,
  source: CoreEcologyPolarConsumerPopulationAnchor,
  purpose: "foraging" | "haulout",
): CoreEcologyTidalWebHabitatAnchor | null {
  const tileIndex = source.localY * WORLD_WIDTH + source.localX;
  const tile = terrain.tiles[tileIndex];
  if (
    tile === undefined
    || tile.index !== tileIndex
    || tile.x !== source.localX
    || tile.y !== source.localY
    || tile.terrain !== source.terrain
    || tile.elevation !== source.elevation
    || (purpose === "foraging"
      ? source.purpose !== "foraging-water"
        || (tile.terrain !== "deep-water" && tile.terrain !== "tidal-flat")
      : source.purpose !== "dry-haulout"
        || (tile.terrain !== "meadow" && tile.terrain !== "ridge"))
  ) return null;
  const globalTile = regionLocalToGlobalTile(
    source.position.region,
    tile.x,
    tile.y,
  );
  if (globalTile.x !== source.globalX || globalTile.y !== source.globalY) {
    return null;
  }
  const biome = deriveBiomeProfile({
    seed: rootSeed,
    tile,
    gridHeight: WORLD_HEIGHT,
    globalTile,
    magicalWaterInfluence: deriveMagicalWaterInfluence(
      rootSeed,
      tile,
      globalTile,
    ),
  });
  return Object.freeze({
    species: HARBOR_SEAL_SPECIES,
    purpose,
    anchorOrdinal: 0,
    tileIndex,
    globalTile,
    position: source.position,
    elevation: tile.elevation,
    terrain: tile.terrain,
    biome: biome.id,
  });
}

function cacheAuthority(
  key: string,
  authority: CoreEcologyActivityAuthorityV1,
): CoreEcologyActivityAuthorityV1 {
  WORLD_BOUND_AUTHORITIES.add(authority);
  AUTHORITY_CACHE.delete(key);
  AUTHORITY_CACHE.set(key, authority);
  while (AUTHORITY_CACHE.size > AUTHORITY_CACHE_LIMIT) {
    const oldest = AUTHORITY_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    AUTHORITY_CACHE.delete(oldest);
  }
  return authority;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  const keys = (actual as string[]).sort(compareText);
  const wanted = [...expected].sort(compareText);
  return keys.length === wanted.length
    && keys.every((key, index) => key === wanted[index]);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
