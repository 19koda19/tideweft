import { generateRegionTerrain, regionTerrainHash } from "../sim/regionTerrain";
import type { RootSeed } from "../sim/rng";
import { stableRegionObjectId } from "../sim/regions";
import type { TerrainTile } from "../sim/types";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
} from "./coreEcologyAlpineHabitat";
import {
  MAX_CORE_ECOLOGY_RIDGE_ACTIVITY_CANDIDATES,
  deriveCoreEcologyRidgeActivityAuthority,
  isTrustedCoreEcologyRidgeActivityAuthority,
  type CoreEcologyRidgeActivityAuthorityV1,
  type CoreEcologyRidgeActivityCandidate,
} from "./coreEcologyRidgeActivityAuthority";
import { canonicalCoreEcologyAlpineResidentPatch } from "./regionalAlpineResidents";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export interface ProjectCoreEcologyAlpineRidgeActivityAuthorityInput {
  readonly rootSeed: RootSeed;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly actorId: string;
}

const GOLDEN_EAGLE_SPECIES = "golden-eagle" as const;
const TERRAIN_TILE_OWNER_KIND = "terrain-tile" as const;
const TILE_CENTER_OFFSET = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
const ALPINE_RIDGE_AUTHORITY_CACHE_LIMIT = 64;
const WORLD_BOUND_ALPINE_AUTHORITIES = new WeakSet<object>();
const ALPINE_RIDGE_AUTHORITY_CACHE = new Map<
  string,
  CoreEcologyRidgeActivityAuthorityV1
>();

/**
 * Reprojects a golden eagle's ridge destinations from canonical world facts.
 *
 * The caller cannot supply terrain candidates. Patch custody is first rebound
 * to the root seed, then the immutable habitat anchor and canonical origin
 * terrain are authenticated before the generic ridge selector receives a
 * bounded candidate set. The resulting receipt is transient and save-free.
 */
export function projectCoreEcologyAlpineRidgeActivityAuthority(
  value: unknown,
): CoreEcologyRidgeActivityAuthorityV1 | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["actorId", "patch", "rootSeed"])
    || typeof value.actorId !== "string"
  ) return null;

  try {
    const rootSeed = value.rootSeed as RootSeed;
    const structuralPatch = canonicalizeCoreEcologyAggregatePatch(value.patch);
    if (structuralPatch === null) return null;
    const patch = canonicalCoreEcologyAlpineResidentPatch(value.patch, {
      seed: rootSeed,
      region: structuralPatch.originRegion,
      completedTick: structuralPatch.updatedAtTick,
    });
    if (
      patch === null
      || patch.derivation.kind !== CORE_ECOLOGY_ALPINE_DERIVATION_KIND
    ) return null;
    // The resident-patch validator above has already rebound this exact
    // embedded habitat to seed, region, and clock. Revalidating it here would
    // regenerate the same full terrain before the candidate projection below.
    const habitat = patch.derivation.habitat;

    const eagleOwners = patch.populations.flatMap((population) => (
      population.species === GOLDEN_EAGLE_SPECIES
        ? population.members
            .filter(({ actor }) => actor.identity.stableId === value.actorId)
            .map((member) => Object.freeze({ member, population }))
        : []
    ));
    if (eagleOwners.length !== 1) return null;
    const owned = eagleOwners[0]!;
    const habitatPopulation = habitat.populations.find((candidate) => (
      candidate.species === GOLDEN_EAGLE_SPECIES
      && candidate.populationKey === owned.population.populationKey
      && candidate.actorRepresentation === "individual"
    ));
    const immutableAnchor = habitatPopulation?.anchors[owned.member.populationOrdinal];
    if (
      habitatPopulation === undefined
      || immutableAnchor === undefined
      || immutableAnchor.allocatedPopulation !== owned.member.representedUnits
    ) return null;
    const homeAnchor = tileCenter(
      patch.originRegion,
      immutableAnchor.localX,
      immutableAnchor.localY,
    );
    const cacheKey = [
      habitat.derivationHash,
      patch.patchKey,
      value.actorId,
    ].join(":");
    const cached = ALPINE_RIDGE_AUTHORITY_CACHE.get(cacheKey);
    if (cached !== undefined) return cacheAlpineRidgeAuthority(cacheKey, cached);

    const terrain = generateRegionTerrain(rootSeed, patch.originRegion);
    if (regionTerrainHash(terrain) !== habitat.terrainHash) return null;
    const homeTile = terrain.tiles.find(({ x, y }) => (
      x === immutableAnchor.localX && y === immutableAnchor.localY
    ));
    if (homeTile?.terrain !== "ridge") return null;

    const rankedRidgeTiles = terrain.tiles
      .filter(({ terrain: kind }) => kind === "ridge")
      .sort((left, right) => compareRidgeTileQuality(left, right, homeAnchor));
    const candidates: CoreEcologyRidgeActivityCandidate[] = rankedRidgeTiles
      .slice(0, MAX_CORE_ECOLOGY_RIDGE_ACTIVITY_CANDIDATES)
      .map((tile) => Object.freeze({
        sourceTileKey: stableRegionObjectId(
          rootSeed,
          patch.originRegion,
          TERRAIN_TILE_OWNER_KIND,
          tile.index,
        ),
        position: tileCenter(patch.originRegion, tile.x, tile.y),
        terrain: "ridge" as const,
        elevation: tile.elevation,
        roughness: tile.roughness,
      }));
    if (candidates.length === 0) return null;

    const authority = deriveCoreEcologyRidgeActivityAuthority({
      sourceKey: patch.patchKey,
      actorId: value.actorId,
      homeAnchor,
      candidates,
    });
    if (authority === null) return null;
    return cacheAlpineRidgeAuthority(cacheKey, authority);
  } catch {
    return null;
  }
}

function cacheAlpineRidgeAuthority(
  key: string,
  authority: CoreEcologyRidgeActivityAuthorityV1,
): CoreEcologyRidgeActivityAuthorityV1 {
  WORLD_BOUND_ALPINE_AUTHORITIES.add(authority);
  ALPINE_RIDGE_AUTHORITY_CACHE.delete(key);
  ALPINE_RIDGE_AUTHORITY_CACHE.set(key, authority);
  while (ALPINE_RIDGE_AUTHORITY_CACHE.size > ALPINE_RIDGE_AUTHORITY_CACHE_LIMIT) {
    const oldest = ALPINE_RIDGE_AUTHORITY_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    ALPINE_RIDGE_AUTHORITY_CACHE.delete(oldest);
  }
  return authority;
}

/** Only canonical Alpine terrain projection can mint production ridge custody. */
export function isTrustedCoreEcologyAlpineRidgeActivityAuthority(
  value: unknown,
): value is CoreEcologyRidgeActivityAuthorityV1 {
  return isTrustedCoreEcologyRidgeActivityAuthority(value)
    && WORLD_BOUND_ALPINE_AUTHORITIES.has(value);
}

function tileCenter(
  region: CoreEcologyAggregatePatchState["originRegion"],
  tileX: number,
  tileY: number,
): WorldPosition {
  return createWorldPosition(
    region,
    tileX * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_OFFSET,
    tileY * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_OFFSET,
  );
}

function compareRidgeTileQuality(
  left: TerrainTile,
  right: TerrainTile,
  homeAnchor: WorldPosition,
): number {
  return right.elevation - left.elevation
    || right.roughness - left.roughness
    || compareDistanceToHome(left, right, homeAnchor)
    || left.index - right.index;
}

function compareDistanceToHome(
  left: TerrainTile,
  right: TerrainTile,
  homeAnchor: WorldPosition,
): number {
  // Every candidate and the habitat anchor are in this one canonical region.
  // Region-local squared distance stays far below Number.MAX_SAFE_INTEGER, so
  // BigInt in this hot sort comparator only added thousands of conversions.
  const leftX = left.x * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_OFFSET;
  const leftY = left.y * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_OFFSET;
  const rightX = right.x * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_OFFSET;
  const rightY = right.y * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_OFFSET;
  const leftDx = leftX - homeAnchor.localX;
  const leftDy = leftY - homeAnchor.localY;
  const rightDx = rightX - homeAnchor.localX;
  const rightDy = rightY - homeAnchor.localY;
  const leftDistance = leftDx * leftDx + leftDy * leftDy;
  const rightDistance = rightDx * rightDx + rightDy * rightDy;
  return leftDistance < rightDistance ? -1 : leftDistance > rightDistance ? 1 : 0;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  const keys = (actual as string[]).sort(compareText);
  const wanted = [...expected].sort(compareText);
  return keys.length === wanted.length
    && keys.every((key, index) => key === wanted[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
