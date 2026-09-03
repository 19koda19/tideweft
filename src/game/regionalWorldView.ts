import { waterDepthAt } from "../sim/terrain";
import {
  createRegionCoord,
  globalTileToRegion,
  regionLocalToGlobalTile,
  type GlobalTileCoord,
  type RegionCoord,
  type RegionTileAddress,
} from "../sim/regions";
import { WORLD_WIDTH, type WorldView } from "../sim/types";
import type { RegionalCartographyWindow } from "./regionalCartography";
import {
  regionLocalToWindowTile,
  regionTileIndexToWindowIndex,
  type RegionalTerrainWindow,
} from "./regionalTravel";

const COMPATIBILITY_REGION = createRegionCoord(0, 0);
const REGIONAL_VIEW_METADATA = new WeakMap<object, RegionalTerrainWindow>();
const REGIONAL_VIEW_COMPATIBILITY = new WeakMap<object, WorldView>();

/**
 * Overlay the live compatibility economy on a deterministic floating terrain
 * window. Authored harbors exist only in region 0,0; generated settlement
 * ecology is a later vertical slice and is never faked by cloning them.
 */
export function createRegionalWorldView(
  compatibility: WorldView,
  window: RegionalTerrainWindow,
  cartography: RegionalCartographyWindow,
): WorldView {
  const count = window.terrain.tiles.length;
  if (
    cartography.discovered.length !== count
    || cartography.depthSoundings.length !== count
    || window.addresses.length !== count
  ) throw new RangeError("Regional world projection dimensions do not match");

  const terrainTiles = window.terrain.tiles.map((generated, index) => {
    const address = window.addresses[index];
    if (!address) throw new RangeError("Regional world projection lost a tile address");
    const compatibilityTile = address.region.x === 0
      && address.region.y === 0
      && address.localX < compatibility.terrain.width
      && address.localY < compatibility.terrain.height
      ? compatibility.terrain.tiles[
          address.localY * compatibility.terrain.width + address.localX
        ]
      : undefined;
    const source = compatibilityTile ?? generated;
    return {
      ...source,
      index,
      x: generated.x,
      y: generated.y,
      waterDepth: compatibilityTile?.waterDepth ?? waterDepthAt(generated, compatibility.tide),
    };
  });

  const settlementMappings = compatibility.settlements.flatMap((settlement) => {
    const localX = settlement.tileIndex % compatibility.terrain.width;
    const localY = Math.floor(settlement.tileIndex / compatibility.terrain.width);
    const point = regionLocalToWindowTile(
      window,
      COMPATIBILITY_REGION,
      localX,
      localY,
    );
    return point === null
      ? []
      : [{ source: settlement, tileIndex: point.y * window.terrain.width + point.x }];
  });
  const settlements = settlementMappings.map(({ source, tileIndex }) => ({
    ...source,
    tileIndex,
  }));

  const routes = compatibility.routes.flatMap((route) => {
    const path = route.path.map((tileIndex) => {
      const point = regionLocalToWindowTile(
        window,
        COMPATIBILITY_REGION,
        tileIndex % compatibility.terrain.width,
        Math.floor(tileIndex / compatibility.terrain.width),
      );
      return point === null ? null : point.y * window.terrain.width + point.x;
    });
    return path.every((tileIndex): tileIndex is number => tileIndex !== null)
      ? [{ ...route, path }]
      : [];
  });
  const visibleRouteIds = new Set(routes.map(({ id }) => id));
  const choirs = compatibility.choirs.filter((choir) =>
    choir.routeIds.every((id) => visibleRouteIds.has(id)));

  const view: WorldView = {
    ...compatibility,
    terrain: {
      width: window.terrain.width,
      height: window.terrain.height,
      tiles: terrainTiles,
    },
    settlements,
    routes,
    choirs,
  };
  REGIONAL_VIEW_METADATA.set(view, window);
  REGIONAL_VIEW_COMPATIBILITY.set(view, compatibility);
  return view;
}

/** Stable address of a tile in either a floating or legacy finite view. */
export function regionalAddressAt(
  world: WorldView,
  tileIndex: number,
): RegionTileAddress | null {
  if (!Number.isSafeInteger(tileIndex) || tileIndex < 0 || tileIndex >= world.terrain.tiles.length) {
    return null;
  }
  const window = REGIONAL_VIEW_METADATA.get(world);
  if (window) return window.addresses[tileIndex] ?? null;
  const tile = world.terrain.tiles[tileIndex];
  if (!tile) return null;
  return Object.freeze({
    region: COMPATIBILITY_REGION,
    localX: tile.x,
    localY: tile.y,
  });
}

/** Stable global address of a tile in either a floating or legacy finite view. */
export function regionalGlobalTileAt(
  world: WorldView,
  tileIndex: number,
): GlobalTileCoord | null {
  const address = regionalAddressAt(world, tileIndex);
  return address === null
    ? null
    : regionLocalToGlobalTile(address.region, address.localX, address.localY);
}

/** Locate a persistent region/local tile inside the current view. */
export function regionalTileIndexInView(
  world: WorldView,
  region: RegionCoord,
  tileIndex: number,
): number | null {
  const window = REGIONAL_VIEW_METADATA.get(world);
  if (window) return regionTileIndexToWindowIndex(window, region, tileIndex);
  if (region.x !== 0 || region.y !== 0) return null;
  return Number.isSafeInteger(tileIndex)
    && tileIndex >= 0
    && tileIndex < world.terrain.tiles.length
    ? tileIndex
    : null;
}

export function regionalWorldCenter(world: WorldView): RegionCoord {
  const center = REGIONAL_VIEW_METADATA.get(world)?.center ?? COMPATIBILITY_REGION;
  return createRegionCoord(center.x, center.y);
}

export function regionalWindowForWorld(world: WorldView): RegionalTerrainWindow | null {
  return REGIONAL_VIEW_METADATA.get(world) ?? null;
}

/** Authoritative compatibility economy that a moving terrain view presents. */
export function regionalCompatibilityWorldForWorld(world: WorldView): WorldView | null {
  return REGIONAL_VIEW_COMPATIBILITY.get(world) ?? null;
}

/**
 * Storage owners intersecting the bounded spatial frame, without walking every
 * terrain cell. A 120×120 frame over 96×72 storage regions currently yields
 * at most nine owners, independent of how many regions the save has touched.
 */
export function regionalStorageRegionsInView(world: WorldView): readonly RegionCoord[] {
  const window = REGIONAL_VIEW_METADATA.get(world);
  if (!window) return Object.freeze([COMPATIBILITY_REGION]);
  const lastX = window.origin.x + world.terrain.width - 1;
  const lastY = window.origin.y + world.terrain.height - 1;
  if (!Number.isSafeInteger(lastX) || !Number.isSafeInteger(lastY)) {
    throw new RangeError("Regional view extent exceeded the safe global-tile envelope");
  }
  const first = globalTileToRegion(window.origin.x, window.origin.y).region;
  const last = globalTileToRegion(lastX, lastY).region;
  const regions: RegionCoord[] = [];
  for (let y = first.y; y <= last.y; y += 1) {
    for (let x = first.x; x <= last.x; x += 1) {
      regions.push(createRegionCoord(x, y));
    }
  }
  return Object.freeze(regions);
}

/**
 * Retarget an unchanged projected view to a new internal streaming owner.
 *
 * Storage-region ownership can change while the player remains inside the
 * same bounded global tile window. In that case every visible tile and its
 * canonical address are unchanged, so rebuilding the terrain projection (and
 * its render meshes) would create a technical seam hitch for no visual gain.
 */
export function rebindRegionalWorldViewWindow(
  world: WorldView,
  window: RegionalTerrainWindow,
): void {
  const prior = REGIONAL_VIEW_METADATA.get(world);
  if (
    !prior
    || prior.origin.x !== window.origin.x
    || prior.origin.y !== window.origin.y
    || prior.terrain !== window.terrain
    || prior.addresses !== window.addresses
    || prior.terrain.width !== window.terrain.width
    || prior.terrain.height !== window.terrain.height
  ) {
    throw new RangeError("Regional world view can only rebind an unchanged spatial window");
  }
  REGIONAL_VIEW_METADATA.set(world, window);
}
