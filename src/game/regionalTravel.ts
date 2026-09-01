import {
  createRegionTerrainSampler,
  type RegionTerrainSampler,
} from "../sim/regionTerrain";
import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  globalTileToRegion,
  isRegionCoord,
  regionKey,
  regionLocalToGlobalTile,
  type RegionCoord,
  type RegionTileAddress,
} from "../sim/regions";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainState,
  type TerrainTile,
} from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  getLoadedRegion,
  type RegionStreamingState,
} from "./regionStreaming";

export const REGIONAL_TRAVEL_HALO_TILES = 1 as const;
export const REGIONAL_TRAVEL_COLUMNS = WORLD_WIDTH + REGIONAL_TRAVEL_HALO_TILES * 2;
export const REGIONAL_TRAVEL_ROWS = WORLD_HEIGHT + REGIONAL_TRAVEL_HALO_TILES * 2;

export interface RegionalTerrainWindow {
  readonly center: RegionCoord;
  /** A compatibility-sized region plus one exact neighbor tile on each edge. */
  readonly terrain: TerrainState;
  /** Source address for every corresponding terrain tile. */
  readonly addresses: readonly RegionTileAddress[];
}

/**
 * Resolve a tile in the floating-origin window back to a stable region/local
 * address. The one-tile halo makes an ordinary movement step evaluate both
 * sides of a seam before the runtime recenters the origin.
 */
export function regionalWindowTileAddress(
  center: RegionCoord,
  windowX: number,
  windowY: number,
): RegionTileAddress {
  assertWindowTile(windowX, windowY);
  if (!isRegionCoord(center)) throw new RangeError("Regional travel center is not canonical");
  const origin = regionLocalToGlobalTile(center, 0, 0);
  const globalX = origin.x + windowX - REGIONAL_TRAVEL_HALO_TILES;
  const globalY = origin.y + windowY - REGIONAL_TRAVEL_HALO_TILES;
  if (!Number.isSafeInteger(globalX) || !Number.isSafeInteger(globalY)) {
    throw new RangeError("Regional travel halo exceeded safe global tile coordinates");
  }
  return globalTileToRegion(globalX, globalY);
}

/** Returns null when the target is outside the current one-tile window. */
export function regionLocalToWindowTile(
  center: RegionCoord,
  target: RegionCoord,
  localX: number,
  localY: number,
): { readonly x: number; readonly y: number } | null {
  if (!isRegionCoord(center) || !isRegionCoord(target)) {
    throw new RangeError("Regional travel coordinates are not canonical");
  }
  const global = regionLocalToGlobalTile(target, localX, localY);
  const origin = regionLocalToGlobalTile(center, 0, 0);
  const x = global.x - origin.x + REGIONAL_TRAVEL_HALO_TILES;
  const y = global.y - origin.y + REGIONAL_TRAVEL_HALO_TILES;
  return Number.isSafeInteger(x)
    && Number.isSafeInteger(y)
    && x >= 0
    && x < REGIONAL_TRAVEL_COLUMNS
    && y >= 0
    && y < REGIONAL_TRAVEL_ROWS
    ? Object.freeze({ x, y })
    : null;
}

/** Map one stable region-local tile index into this floating view, if loaded. */
export function regionTileIndexToWindowIndex(
  center: RegionCoord,
  target: RegionCoord,
  tileIndex: number,
): number | null {
  if (!Number.isSafeInteger(tileIndex) || tileIndex < 0 || tileIndex >= WORLD_WIDTH * WORLD_HEIGHT) {
    return null;
  }
  const point = regionLocalToWindowTile(
    center,
    target,
    tileIndex % WORLD_WIDTH,
    Math.floor(tileIndex / WORLD_WIDTH),
  );
  return point === null ? null : point.y * REGIONAL_TRAVEL_COLUMNS + point.x;
}

/**
 * Materializes only the 98×74 terrain actually needed for live movement and
 * rendering. Cardinal data comes from the bounded stream; a missing diagonal
 * corner uses the exact single-tile sampler rather than loading 6,912 tiles.
 */
export function createRegionalTerrainWindow(
  rootSeed: RootSeed,
  stream: RegionStreamingState<TerrainState>,
  sampler: RegionTerrainSampler = createRegionTerrainSampler(rootSeed),
): RegionalTerrainWindow {
  if (hashCanonical(rootSeed) !== stream.rootSeedHash) {
    throw new RangeError("Regional travel seed does not match the loaded stream");
  }
  const center = createRegionCoord(stream.center.x, stream.center.y);
  const tiles: TerrainTile[] = [];
  const addresses: RegionTileAddress[] = [];

  for (let windowY = 0; windowY < REGIONAL_TRAVEL_ROWS; windowY += 1) {
    for (let windowX = 0; windowX < REGIONAL_TRAVEL_COLUMNS; windowX += 1) {
      const address = regionalWindowTileAddress(center, windowX, windowY);
      const loaded = getLoadedRegion(stream, address.region);
      const source = loaded?.value.tiles[address.localY * WORLD_WIDTH + address.localX]
        ?? sampler.sample(address.region, address.localX, address.localY);
      if (!source) throw new Error(`Regional terrain source ${regionKey(address.region)} is missing`);
      const index = windowY * REGIONAL_TRAVEL_COLUMNS + windowX;
      tiles.push({
        ...source,
        index,
        x: windowX,
        y: windowY,
      });
      addresses.push(Object.freeze({
        region: createRegionCoord(address.region.x, address.region.y),
        localX: address.localX,
        localY: address.localY,
      }));
    }
  }

  return deepFreeze({
    center,
    terrain: {
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
      tiles,
    },
    addresses,
  });
}

function assertWindowTile(windowX: number, windowY: number): void {
  if (
    !Number.isSafeInteger(windowX)
    || !Number.isSafeInteger(windowY)
    || windowX < 0
    || windowX >= REGIONAL_TRAVEL_COLUMNS
    || windowY < 0
    || windowY >= REGIONAL_TRAVEL_ROWS
  ) throw new RangeError("Regional travel window tile is outside its halo");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
