import { WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import {
  isRegionCoord,
  regionKey,
  regionLocalToGlobalTile,
  type RegionCoord,
} from "../sim/regions";
import { deriveTideHarps, type TideHarp } from "./tideHarps";
import {
  isWindExposedTile,
  queryWayknotEffects,
  WAYKNOT_RADII,
  type WayknotEffects,
  type WayknotGrid,
  type WayknotState,
  type WayknotTileContext,
} from "./wayknots";
import {
  regionalAddressAt,
  regionalTileIndexInView,
  regionalWindowForWorld,
  regionalWorldCenter,
} from "./regionalWorldView";

const PERSISTENT_REGION_GRID: WayknotGrid = Object.freeze({
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
});
const MAX_WAYKNOT_RADIUS = Math.max(...Object.values(WAYKNOT_RADII));
const CONTINUOUS_INFLUENCE_WIDTH = MAX_WAYKNOT_RADIUS * 2 + 1;
const CONTINUOUS_INFLUENCE_GRID: WayknotGrid = Object.freeze({
  width: CONTINUOUS_INFLUENCE_WIDTH,
  height: CONTINUOUS_INFLUENCE_WIDTH,
});
const CONTINUOUS_INFLUENCE_CENTER = MAX_WAYKNOT_RADIUS * CONTINUOUS_INFLUENCE_WIDTH
  + MAX_WAYKNOT_RADIUS;

export interface RegionalWayknotContext {
  /** Stable signed region containing the queried terrain tile. */
  readonly region: RegionCoord;
  /** Tile index used only by the current floating render/movement view. */
  readonly viewTileIndex: number;
  /** Region-local persistent tile index stored by Wayknots. */
  readonly localTileIndex: number;
  readonly grid: WayknotGrid;
  readonly context: WayknotTileContext;
}

/**
 * Resolve a floating view tile into the address dialect used by persistent
 * Wayknots. Legacy finite fixtures retain their original dimensions/indexes.
 */
export function regionalWayknotContextAt(
  world: WorldView,
  viewTileIndex: number,
): RegionalWayknotContext | undefined {
  const tile = world.terrain.tiles[viewTileIndex];
  const address = regionalAddressAt(world, viewTileIndex);
  if (!tile || !address) return undefined;
  const floating = regionalWindowForWorld(world) !== null;
  const localTileIndex = floating
    ? address.localY * WORLD_WIDTH + address.localX
    : viewTileIndex;
  const grid = floating
    ? PERSISTENT_REGION_GRID
    : world.terrain;
  return Object.freeze({
    region: address.region,
    viewTileIndex,
    localTileIndex,
    grid,
    context: Object.freeze({
      tileIndex: localTileIndex,
      terrain: tile.terrain,
      waterDepth: tile.waterDepth,
      windExposed: isWindExposedTile(tile),
      occupied: world.settlements.some((settlement) => settlement.tileIndex === viewTileIndex),
    }),
  });
}

/**
 * Query physical influence in continuous tile space. Region/local addresses
 * remain authoritative ownership, but the storage partition is not a wall:
 * an edge knot can assist an adjacent cardinal or diagonal tile across it.
 */
export function regionalWayknotEffectsAt(
  state: WayknotState,
  world: WorldView,
  viewTileIndex: number,
  currentTick: number,
): WayknotEffects {
  const resolved = regionalWayknotContextAt(world, viewTileIndex);
  if (resolved) {
    if (regionalWindowForWorld(world) !== null) {
      const projected = projectNearbyWayknots(state, resolved);
      return queryWayknotEffects(
        projected,
        { ...resolved.context, tileIndex: CONTINUOUS_INFLUENCE_CENTER },
        CONTINUOUS_INFLUENCE_GRID,
        currentTick,
        resolved.region,
      );
    }
    return queryWayknotEffects(
      state,
      resolved.context,
      resolved.grid,
      currentTick,
      resolved.region,
    );
  }
  return queryWayknotEffects(
    state,
    {
      tileIndex: -1,
      terrain: "meadow",
      waterDepth: 0,
      windExposed: false,
    },
    { width: world.terrain.width, height: world.terrain.height },
    currentTick,
    regionalWorldCenter(world),
  );
}

/** Derive only the Harps belonging to the queried tile's signed region. */
export function regionalTideHarpsAt(
  state: WayknotState,
  world: WorldView,
  viewTileIndex: number,
): readonly TideHarp[] {
  const resolved = regionalWayknotContextAt(world, viewTileIndex);
  return resolved
    ? deriveTideHarps(state, resolved.grid, resolved.region)
    : Object.freeze([]);
}

/**
 * Derive Harps independently for each region represented by a visible knot.
 * This lets Chart/Relief draw both sides of a seam without allowing a
 * triangle to connect equal-looking local indexes from different regions.
 */
export function visibleRegionalTideHarps(
  state: WayknotState,
  world: WorldView,
): readonly TideHarp[] {
  if (regionalWindowForWorld(world) === null) {
    return deriveTideHarps(state, world.terrain, regionalWorldCenter(world));
  }
  const visibleRegions = new Map<string, RegionCoord>();
  for (const wayknot of state.wayknots) {
    if (wayknot.region === null || wayknot.tileIndex === null) continue;
    if (regionalTileIndexInView(world, wayknot.region, wayknot.tileIndex) === null) continue;
    visibleRegions.set(regionKey(wayknot.region), wayknot.region);
  }
  const harps = [...visibleRegions.values()]
    .sort((left, right) => left.x - right.x || left.y - right.y)
    .flatMap((region) => deriveTideHarps(state, PERSISTENT_REGION_GRID, region))
    .filter((harp) => harp.knots.every((knot) =>
      regionalTileIndexInView(world, harp.region, knot.tileIndex) !== null));
  return Object.freeze(harps);
}

/** Map a persistent knot/Harp tile into the current view without mutation. */
export function regionalWayknotViewTileIndex(
  world: WorldView,
  region: RegionCoord,
  localTileIndex: number,
): number | null {
  return regionalTileIndexInView(world, region, localTileIndex);
}

/**
 * Re-address only nearby deployed aids into a tiny transient grid so the
 * established effect kernel can evaluate true global Manhattan distance.
 * The persistent state, IDs, region owners, and local indexes never change.
 */
function projectNearbyWayknots(
  state: WayknotState,
  target: RegionalWayknotContext,
): WayknotState {
  const targetGlobal = regionLocalToGlobalTile(
    target.region,
    target.localTileIndex % WORLD_WIDTH,
    Math.floor(target.localTileIndex / WORLD_WIDTH),
  );
  const wayknots = state.wayknots.flatMap((wayknot) => {
    if (
      wayknot.region === null
      || wayknot.tileIndex === null
      || !isRegionCoord(wayknot.region)
      || !Number.isSafeInteger(wayknot.tileIndex)
      || wayknot.tileIndex < 0
      || wayknot.tileIndex >= WORLD_WIDTH * WORLD_HEIGHT
      // With a maximum radius smaller than either storage dimension, a knot
      // more than one region away on either axis cannot possibly contribute.
      || Math.abs(wayknot.region.x - target.region.x) > 1
      || Math.abs(wayknot.region.y - target.region.y) > 1
    ) return [];
    const knotGlobal = regionLocalToGlobalTile(
      wayknot.region,
      wayknot.tileIndex % WORLD_WIDTH,
      Math.floor(wayknot.tileIndex / WORLD_WIDTH),
    );
    const deltaX = knotGlobal.x - targetGlobal.x;
    const deltaY = knotGlobal.y - targetGlobal.y;
    if (
      !Number.isSafeInteger(deltaX)
      || !Number.isSafeInteger(deltaY)
      || Math.abs(deltaX) + Math.abs(deltaY) > MAX_WAYKNOT_RADIUS
    ) return [];
    const x = MAX_WAYKNOT_RADIUS + deltaX;
    const y = MAX_WAYKNOT_RADIUS + deltaY;
    return [{
      ...wayknot,
      region: target.region,
      tileIndex: y * CONTINUOUS_INFLUENCE_WIDTH + x,
    }];
  });
  return { ...state, wayknots };
}
