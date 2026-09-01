import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { seedFromText } from "../sim/rng";
import { regionKey } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  MOBILE_REGION_STREAMING_CONFIG,
  createTerrainRegionStreamingState,
  getLoadedRegion,
} from "./regionStreaming";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  createRegionalTerrainWindow,
  regionLocalToWindowTile,
  regionalWindowTileAddress,
} from "./regionalTravel";

function tileAt(window: ReturnType<typeof createRegionalTerrainWindow>, x: number, y: number) {
  const tile = window.terrain.tiles[y * window.terrain.width + x];
  if (!tile) throw new Error(`missing window tile ${x},${y}`);
  return tile;
}

describe("regional terrain travel window", () => {
  it("maps the center, four streamed edges, and sampled diagonal corners exactly", () => {
    const seed = seedFromText("five regions and four honest corner tiles");
    const stream = createTerrainRegionStreamingState({
      rootSeed: seed,
      center: { x: -7, y: 11 },
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    const window = createRegionalTerrainWindow(seed, stream);

    expect(window.terrain.width).toBe(WORLD_WIDTH + 2);
    expect(window.terrain.height).toBe(WORLD_HEIGHT + 2);
    expect(window.terrain.tiles).toHaveLength(REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS);
    expect(window.addresses).toHaveLength(window.terrain.tiles.length);
    expect(stream.loaded).toHaveLength(5);

    for (const [windowX, windowY] of [
      [0, 0],
      [REGIONAL_TRAVEL_COLUMNS - 1, 0],
      [0, REGIONAL_TRAVEL_ROWS - 1],
      [REGIONAL_TRAVEL_COLUMNS - 1, REGIONAL_TRAVEL_ROWS - 1],
      [1, 1],
      [WORLD_WIDTH, WORLD_HEIGHT],
    ] as const) {
      const address = regionalWindowTileAddress(stream.center, windowX, windowY);
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

    const diagonal = regionalWindowTileAddress(stream.center, 0, 0).region;
    expect(getLoadedRegion(stream, diagonal)).toBeNull();
  });

  it("preserves exact compatibility region 0,0 in the interior and neighbor truth at every seam", () => {
    const seed = seedFromText("the old estuary opens at its edges");
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
      const source = compatibility.tiles[localY * WORLD_WIDTH + localX];
      expect(tileAt(window, localX + 1, localY + 1)).toMatchObject({
        elevation: source?.elevation,
        moisture: source?.moisture,
        roughness: source?.roughness,
        terrain: source?.terrain,
        baseTravelCost: source?.baseTravelCost,
        traceStrength: source?.traceStrength,
      });
    }

    expect(regionalWindowTileAddress(stream.center, 0, 31)).toEqual({
      region: { x: -1, y: 0 }, localX: WORLD_WIDTH - 1, localY: 30,
    });
    expect(regionalWindowTileAddress(stream.center, WORLD_WIDTH + 1, 31)).toEqual({
      region: { x: 1, y: 0 }, localX: 0, localY: 30,
    });
    expect(regionalWindowTileAddress(stream.center, 42, 0)).toEqual({
      region: { x: 0, y: -1 }, localX: 41, localY: WORLD_HEIGHT - 1,
    });
    expect(regionalWindowTileAddress(stream.center, 42, WORLD_HEIGHT + 1)).toEqual({
      region: { x: 0, y: 1 }, localX: 41, localY: 0,
    });
  });

  it("roundtrips local/window addresses across signed neighboring regions", () => {
    const center = { x: -12, y: 8 } as const;
    for (const [target, localX, localY] of [
      [center, 0, 0],
      [{ x: -13, y: 8 }, WORLD_WIDTH - 1, 40],
      [{ x: -11, y: 8 }, 0, 40],
      [{ x: -12, y: 7 }, 55, WORLD_HEIGHT - 1],
      [{ x: -12, y: 9 }, 55, 0],
      [{ x: -13, y: 7 }, WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
    ] as const) {
      const point = regionLocalToWindowTile(center, target, localX, localY);
      expect(point).not.toBeNull();
      expect(regionalWindowTileAddress(center, point!.x, point!.y)).toEqual({
        region: target,
        localX,
        localY,
      });
    }
    expect(regionLocalToWindowTile(center, { x: -10, y: 8 }, 0, 0)).toBeNull();
  });

  it("is deterministic, immutable, seed-bound, and fails closed outside the halo", () => {
    const seed = seedFromText("a bounded floating window");
    const stream = createTerrainRegionStreamingState({ rootSeed: seed, center: { x: 4, y: -3 } });
    const first = createRegionalTerrainWindow(seed, stream);
    const second = createRegionalTerrainWindow(seed, stream);
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.terrain.tiles[0])).toBe(true);
    expect(Object.isFrozen(first.addresses[0]?.region)).toBe(true);
    expect(() => createRegionalTerrainWindow(seedFromText("wrong seed"), stream)).toThrow(RangeError);
    expect(() => regionalWindowTileAddress(stream.center, -1, 0)).toThrow(RangeError);
    expect(() => regionalWindowTileAddress(stream.center, 0, REGIONAL_TRAVEL_ROWS)).toThrow(RangeError);
    expect(regionKey(first.center)).toBe("r:4:-3");
  });
});
