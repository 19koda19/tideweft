import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { seedFromText } from "../sim/rng";
import { regionKey, regionLocalToGlobalTile } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  MOBILE_REGION_STREAMING_CONFIG,
  createTerrainRegionStreamingState,
  getLoadedRegion,
} from "./regionStreaming";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_SAFE_MAX_X,
  REGIONAL_TRAVEL_SAFE_MAX_Y,
  REGIONAL_TRAVEL_SAFE_MIN_X,
  REGIONAL_TRAVEL_SAFE_MIN_Y,
  REGIONAL_TRAVEL_SHIFT_TILES,
  createRegionalTerrainWindow,
  regionLocalToWindowTile,
  regionalWindowTileAddress,
  shiftedRegionalFrameOrigin,
} from "./regionalTravel";

function tileAt(window: ReturnType<typeof createRegionalTerrainWindow>, x: number, y: number) {
  const tile = window.terrain.tiles[y * window.terrain.width + x];
  if (!tile) throw new Error(`missing window tile ${x},${y}`);
  return tile;
}

describe("regional terrain travel frame", () => {
  it("maps every sampled frame cell to exact deterministic regional terrain", () => {
    const seed = seedFromText("five regions and an honest sliding frame");
    const stream = createTerrainRegionStreamingState({
      rootSeed: seed,
      center: { x: -7, y: 11 },
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    const window = createRegionalTerrainWindow(seed, stream);

    expect(window.terrain.width).toBe(REGIONAL_TRAVEL_COLUMNS);
    expect(window.terrain.height).toBe(REGIONAL_TRAVEL_ROWS);
    expect(window.terrain.tiles).toHaveLength(REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS);
    expect(window.addresses).toHaveLength(window.terrain.tiles.length);
    expect(stream.loaded).toHaveLength(5);

    for (const [windowX, windowY] of [
      [0, 0],
      [REGIONAL_TRAVEL_COLUMNS - 1, 0],
      [0, REGIONAL_TRAVEL_ROWS - 1],
      [REGIONAL_TRAVEL_COLUMNS - 1, REGIONAL_TRAVEL_ROWS - 1],
      [12, 24],
      [REGIONAL_TRAVEL_COLUMNS / 2, REGIONAL_TRAVEL_ROWS / 2],
    ] as const) {
      const address = regionalWindowTileAddress(window.origin, windowX, windowY);
      const expected = generateRegionTerrain(seed, address.region)
        .tiles[address.localY * WORLD_WIDTH + address.localX];
      const actual = tileAt(window, windowX, windowY);
      expect(actual).toMatchObject({
        elevation: expected?.elevation,
        moisture: expected?.moisture,
        roughness: expected?.roughness,
        terrain: expected?.terrain,
        baseTravelCost: expected?.baseTravelCost,
      });
      expect(window.addresses[actual.index]).toEqual(address);
    }

    const corner = regionalWindowTileAddress(window.origin, 0, 0).region;
    expect(getLoadedRegion(stream, corner)).toBeNull();
  });

  it("preserves compatibility region 0,0 at its stable global addresses", () => {
    const seed = seedFromText("the old estuary remains one place in the world");
    const stream = createTerrainRegionStreamingState({ rootSeed: seed });
    const window = createRegionalTerrainWindow(seed, stream);
    const compatibility = generateRegionTerrain(seed, { x: 0, y: 0 });

    for (const [localX, localY] of [
      [0, 0],
      [WORLD_WIDTH - 1, 0],
      [0, WORLD_HEIGHT - 1],
      [WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
      [47, 35],
    ] as const) {
      const point = regionLocalToWindowTile(window, { x: 0, y: 0 }, localX, localY);
      expect(point).not.toBeNull();
      const source = compatibility.tiles[localY * WORLD_WIDTH + localX];
      expect(tileAt(window, point!.x, point!.y)).toMatchObject({
        elevation: source?.elevation,
        moisture: source?.moisture,
        roughness: source?.roughness,
        terrain: source?.terrain,
        baseTravelCost: source?.baseTravelCost,
        traceStrength: source?.traceStrength,
      });
    }

    const regionOrigin = regionLocalToGlobalTile(stream.center, 0, 0);
    expect(window.origin).toEqual({ x: regionOrigin.x - 12, y: regionOrigin.y - 24 });
  });

  it("roundtrips addresses across signed storage regions through one frame", () => {
    const seed = seedFromText("signed frame address roundtrip");
    const stream = createTerrainRegionStreamingState({
      rootSeed: seed,
      center: { x: -12, y: 8 },
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    const window = createRegionalTerrainWindow(seed, stream);
    for (const [target, localX, localY] of [
      [{ x: -12, y: 8 }, 0, 0],
      [{ x: -13, y: 8 }, WORLD_WIDTH - 1, 40],
      [{ x: -11, y: 8 }, 0, 40],
      [{ x: -12, y: 7 }, 55, WORLD_HEIGHT - 1],
      [{ x: -12, y: 9 }, 55, 0],
      [{ x: -13, y: 7 }, WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
    ] as const) {
      const point = regionLocalToWindowTile(window, target, localX, localY);
      expect(point).not.toBeNull();
      expect(regionalWindowTileAddress(window.origin, point!.x, point!.y)).toEqual({
        region: target,
        localX,
        localY,
      });
    }
    expect(regionLocalToWindowTile(window, { x: -10, y: 8 }, 0, 0)).toBeNull();
  });

  it("slides only outside its full-sight safety band and in fixed quanta", () => {
    const seed = seedFromText("frame shift hysteresis");
    const stream = createTerrainRegionStreamingState({ rootSeed: seed });
    const window = createRegionalTerrainWindow(seed, stream);
    expect(shiftedRegionalFrameOrigin(
      window,
      REGIONAL_TRAVEL_SAFE_MIN_X,
      REGIONAL_TRAVEL_SAFE_MAX_Y,
    )).toEqual(window.origin);
    expect(shiftedRegionalFrameOrigin(
      window,
      REGIONAL_TRAVEL_SAFE_MAX_X + 1,
      REGIONAL_TRAVEL_SAFE_MIN_Y - 1,
    )).toEqual({
      x: window.origin.x + REGIONAL_TRAVEL_SHIFT_TILES,
      y: window.origin.y - REGIONAL_TRAVEL_SHIFT_TILES,
    });
  });

  it("is deterministic, immutable, seed-bound, and fails closed outside the frame", () => {
    const seed = seedFromText("a bounded floating frame");
    const stream = createTerrainRegionStreamingState({ rootSeed: seed, center: { x: 4, y: -3 } });
    const first = createRegionalTerrainWindow(seed, stream);
    const second = createRegionalTerrainWindow(seed, stream, first.origin);
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.terrain.tiles[0])).toBe(true);
    expect(Object.isFrozen(first.addresses[0]?.region)).toBe(true);
    expect(() => createRegionalTerrainWindow(seedFromText("wrong seed"), stream)).toThrow(RangeError);
    expect(() => regionalWindowTileAddress(first.origin, -1, 0)).toThrow(RangeError);
    expect(() => regionalWindowTileAddress(first.origin, 0, REGIONAL_TRAVEL_ROWS)).toThrow(RangeError);
    expect(regionKey(first.center)).toBe("r:4:-3");
  });
});
