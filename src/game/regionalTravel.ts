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
  type GlobalTileCoord,
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

/**
 * A square, bounded spatial frame large enough to retain the complete 52-tile
 * terrain-perception radius around every point in its central safety band.
 * It slides independently of the 96×72 storage regions.
 */
export const REGIONAL_TRAVEL_COLUMNS = 120 as const;
export const REGIONAL_TRAVEL_ROWS = 120 as const;
export const REGIONAL_TRAVEL_SIGHT_TILES = 52 as const;
export const REGIONAL_TRAVEL_SHIFT_TILES = 16 as const;
export const REGIONAL_TRAVEL_SAFE_MIN_X = REGIONAL_TRAVEL_SIGHT_TILES;
export const REGIONAL_TRAVEL_SAFE_MAX_X = REGIONAL_TRAVEL_COLUMNS - 1
  - REGIONAL_TRAVEL_SIGHT_TILES;
export const REGIONAL_TRAVEL_SAFE_MIN_Y = REGIONAL_TRAVEL_SIGHT_TILES;
export const REGIONAL_TRAVEL_SAFE_MAX_Y = REGIONAL_TRAVEL_ROWS - 1
  - REGIONAL_TRAVEL_SIGHT_TILES;
export const REGIONAL_TRAVEL_CENTER_X = Math.floor(REGIONAL_TRAVEL_COLUMNS / 2);
export const REGIONAL_TRAVEL_CENTER_Y = Math.floor(REGIONAL_TRAVEL_ROWS / 2);

/** Alpha 8 v4 saves used a storage-region-aligned one-tile guard. */
export const LEGACY_REGIONAL_TRAVEL_HALO_TILES = 1 as const;
export const LEGACY_REGIONAL_TRAVEL_COLUMNS = WORLD_WIDTH
  + LEGACY_REGIONAL_TRAVEL_HALO_TILES * 2;
export const LEGACY_REGIONAL_TRAVEL_ROWS = WORLD_HEIGHT
  + LEGACY_REGIONAL_TRAVEL_HALO_TILES * 2;

export interface RegionalTerrainWindow {
  /** Streaming residency center; it does not define presentation coordinates. */
  readonly center: RegionCoord;
  /** Stable global tile represented by terrain cell 0,0. */
  readonly origin: GlobalTileCoord;
  readonly terrain: TerrainState;
  /** Source address for every corresponding terrain tile. */
  readonly addresses: readonly RegionTileAddress[];
}

/**
 * Change only which persistence stream owns the player's current activity.
 * The bounded frame and every sampled tile retain the same interpretation.
 */
export function rebindRegionalTerrainWindowCenter(
  window: RegionalTerrainWindow,
  centerInput: RegionCoord,
): RegionalTerrainWindow {
  if (!isRegionCoord(centerInput)) throw new RangeError("Regional stream center is not canonical");
  if (regionKey(window.center) === regionKey(centerInput)) return window;
  return Object.freeze({
    center: createRegionCoord(centerInput.x, centerInput.y),
    origin: window.origin,
    terrain: window.terrain,
    addresses: window.addresses,
  });
}

/** Default frame used by direct tools/tests; live travel centers on the player. */
export function defaultRegionalFrameOrigin(center: RegionCoord): GlobalTileCoord {
  if (!isRegionCoord(center)) throw new RangeError("Regional travel center is not canonical");
  const regionOrigin = regionLocalToGlobalTile(center, 0, 0);
  return checkedFrameOrigin({
    x: regionOrigin.x - Math.floor((REGIONAL_TRAVEL_COLUMNS - WORLD_WIDTH) / 2),
    y: regionOrigin.y - Math.floor((REGIONAL_TRAVEL_ROWS - WORLD_HEIGHT) / 2),
  });
}

/** Center a new frame on one stable tile address. */
export function regionalFrameOriginAtAddress(address: RegionTileAddress): GlobalTileCoord {
  const global = regionLocalToGlobalTile(address.region, address.localX, address.localY);
  return checkedFrameOrigin({
    x: global.x - REGIONAL_TRAVEL_CENTER_X,
    y: global.y - REGIONAL_TRAVEL_CENTER_Y,
  });
}

/** Resolve a frame tile back to its stable region/local address. */
export function regionalWindowTileAddress(
  origin: GlobalTileCoord,
  windowX: number,
  windowY: number,
): RegionTileAddress {
  assertWindowTile(windowX, windowY);
  const canonicalOrigin = checkedFrameOrigin(origin);
  const globalX = canonicalOrigin.x + windowX;
  const globalY = canonicalOrigin.y + windowY;
  if (!Number.isSafeInteger(globalX) || !Number.isSafeInteger(globalY)) {
    throw new RangeError("Regional spatial frame exceeded safe global tile coordinates");
  }
  return globalTileToRegion(globalX, globalY);
}

/** Returns null when the target is outside the current spatial frame. */
export function regionLocalToWindowTile(
  window: Pick<RegionalTerrainWindow, "origin" | "terrain">,
  target: RegionCoord,
  localX: number,
  localY: number,
): { readonly x: number; readonly y: number } | null {
  if (!isRegionCoord(target)) throw new RangeError("Regional target is not canonical");
  const global = regionLocalToGlobalTile(target, localX, localY);
  const x = global.x - window.origin.x;
  const y = global.y - window.origin.y;
  return Number.isSafeInteger(x)
    && Number.isSafeInteger(y)
    && x >= 0
    && x < window.terrain.width
    && y >= 0
    && y < window.terrain.height
    ? Object.freeze({ x, y })
    : null;
}

/** Map one stable region-local tile index into this spatial frame. */
export function regionTileIndexToWindowIndex(
  window: Pick<RegionalTerrainWindow, "origin" | "terrain">,
  target: RegionCoord,
  tileIndex: number,
): number | null {
  if (!Number.isSafeInteger(tileIndex) || tileIndex < 0 || tileIndex >= WORLD_WIDTH * WORLD_HEIGHT) {
    return null;
  }
  const point = regionLocalToWindowTile(
    window,
    target,
    tileIndex % WORLD_WIDTH,
    Math.floor(tileIndex / WORLD_WIDTH),
  );
  return point === null ? null : point.y * window.terrain.width + point.x;
}

/**
 * Materialize the bounded frame. Resident region data is reused; portions not
 * in the capped stream use the same exact address sampler and are never saved
 * as duplicate terrain.
 */
export function createRegionalTerrainWindow(
  rootSeed: RootSeed,
  stream: RegionStreamingState<TerrainState>,
  originInput: GlobalTileCoord = defaultRegionalFrameOrigin(stream.center),
  sampler: RegionTerrainSampler = createRegionTerrainSampler(rootSeed),
): RegionalTerrainWindow {
  if (hashCanonical(rootSeed) !== stream.rootSeedHash) {
    throw new RangeError("Regional travel seed does not match the loaded stream");
  }
  const center = createRegionCoord(stream.center.x, stream.center.y);
  const origin = checkedFrameOrigin(originInput);
  const tiles: TerrainTile[] = [];
  const addresses: RegionTileAddress[] = [];

  for (let windowY = 0; windowY < REGIONAL_TRAVEL_ROWS; windowY += 1) {
    for (let windowX = 0; windowX < REGIONAL_TRAVEL_COLUMNS; windowX += 1) {
      // The origin and far corner were validated once above. Avoid repeating
      // those checks for all 14,400 cells whenever the frame slides.
      const address = globalTileToRegion(origin.x + windowX, origin.y + windowY);
      const loaded = getLoadedRegion(stream, address.region);
      const source = loaded?.value.tiles[address.localY * WORLD_WIDTH + address.localX]
        ?? sampler.sample(address.region, address.localX, address.localY);
      if (!source) throw new Error(`Regional terrain source ${regionKey(address.region)} is missing`);
      const index = windowY * REGIONAL_TRAVEL_COLUMNS + windowX;
      tiles.push({ ...source, index, x: windowX, y: windowY });
      addresses.push(Object.freeze({
        region: createRegionCoord(address.region.x, address.region.y),
        localX: address.localX,
        localY: address.localY,
      }));
    }
  }

  return deepFreeze({
    center,
    origin,
    terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS, tiles },
    addresses,
  });
}

/** Shift in fixed quanta only after the player leaves the full-sight safety band. */
export function shiftedRegionalFrameOrigin(
  window: RegionalTerrainWindow,
  playerTileX: number,
  playerTileY: number,
): GlobalTileCoord {
  assertWindowTile(playerTileX, playerTileY);
  const shiftsFor = (value: number, minimum: number, maximum: number): number => {
    if (value < minimum) {
      return -Math.ceil((minimum - value) / REGIONAL_TRAVEL_SHIFT_TILES)
        * REGIONAL_TRAVEL_SHIFT_TILES;
    }
    if (value > maximum) {
      return Math.ceil((value - maximum) / REGIONAL_TRAVEL_SHIFT_TILES)
        * REGIONAL_TRAVEL_SHIFT_TILES;
    }
    return 0;
  };
  return checkedFrameOrigin({
    x: window.origin.x + shiftsFor(playerTileX, REGIONAL_TRAVEL_SAFE_MIN_X, REGIONAL_TRAVEL_SAFE_MAX_X),
    y: window.origin.y + shiftsFor(playerTileY, REGIONAL_TRAVEL_SAFE_MIN_Y, REGIONAL_TRAVEL_SAFE_MAX_Y),
  });
}

function checkedFrameOrigin(value: GlobalTileCoord): GlobalTileCoord {
  if (!Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y)) {
    throw new RangeError("Regional spatial-frame origin must use safe integer tiles");
  }
  if (
    !Number.isSafeInteger(value.x + REGIONAL_TRAVEL_COLUMNS - 1)
    || !Number.isSafeInteger(value.y + REGIONAL_TRAVEL_ROWS - 1)
  ) throw new RangeError("Regional spatial frame exceeds the safe integer envelope");
  globalTileToRegion(value.x, value.y);
  globalTileToRegion(
    value.x + REGIONAL_TRAVEL_COLUMNS - 1,
    value.y + REGIONAL_TRAVEL_ROWS - 1,
  );
  return Object.freeze({
    x: Object.is(value.x, -0) ? 0 : value.x,
    y: Object.is(value.y, -0) ? 0 : value.y,
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
  ) throw new RangeError("Regional travel tile is outside its spatial frame");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
