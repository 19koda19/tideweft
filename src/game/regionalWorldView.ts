import { waterDepthAt } from "../sim/terrain";
import {
  createRegionCoord,
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
      window.center,
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
        window.center,
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

/** Locate a persistent region/local tile inside the current view. */
export function regionalTileIndexInView(
  world: WorldView,
  region: RegionCoord,
  tileIndex: number,
): number | null {
  const window = REGIONAL_VIEW_METADATA.get(world);
  if (window) return regionTileIndexToWindowIndex(window.center, region, tileIndex);
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
