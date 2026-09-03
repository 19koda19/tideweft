import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { globalTileToRegion } from "../sim/regions";
import { waterDepthAt } from "../sim/terrain";
import { WORLD_WIDTH } from "../sim/types";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow, regionLocalToWindowTile } from "./regionalTravel";
import {
  createRegionalWorldView,
  rebindRegionalWorldViewWindow,
  regionalAddressAt,
  regionalStorageRegionsInView,
  regionalTileIndexInView,
  regionalWindowForWorld,
  regionalWorldCenter,
} from "./regionalWorldView";

describe("regional live world projection", () => {
  it("preserves live compatibility terrain and remaps harbors and routes in the sliding frame", () => {
    const world = createWorld("compatibility stays alive", "wild");
    world.terrain.tiles[0]!.traceStrength = 654_321;
    const compatibility = createWorldView(world);
    const stream = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const chart = projectRegionalCartographyWindow(
      createRegionalCartography(world.meta.rootSeed, {
        discovered: Array.from({ length: world.terrain.tiles.length }, () => 1_000_000),
        depthSoundings: Array.from({ length: world.terrain.tiles.length }, () => 0),
      }),
      window,
    );
    const view = createRegionalWorldView(compatibility, window, chart);

    const originZero = regionalTileIndexInView(view, { x: 0, y: 0 }, 0);
    const originPoint = regionLocalToWindowTile(window, { x: 0, y: 0 }, 0, 0);
    expect(originZero).toBe(originPoint!.y * window.terrain.width + originPoint!.x);
    expect(view.terrain.tiles[originZero!]?.traceStrength).toBe(654_321);
    expect(view.settlements).toHaveLength(compatibility.settlements.length);
    expect(view.settlements[0]?.tileIndex).toBe(
      regionalTileIndexInView(view, { x: 0, y: 0 }, compatibility.settlements[0]!.tileIndex),
    );
    expect(view.routes).toHaveLength(compatibility.routes.length);
    expect(regionalWorldCenter(view)).toEqual({ x: 0, y: 0 });
  });

  it("uses the live tide on generated terrain and exposes exact signed tile addresses", () => {
    const world = createWorld("the eastern weather keeps moving", "wild");
    const compatibility = createWorldView(world);
    const stream = createTerrainRegionStreamingState({
      rootSeed: world.meta.rootSeed,
      center: { x: -8, y: 13 },
    });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const cartography = projectRegionalCartographyWindow(
      createRegionalCartography(world.meta.rootSeed),
      window,
    );
    const view = createRegionalWorldView(compatibility, window, cartography);
    const index = 20 * view.terrain.width + 30;
    const address = regionalAddressAt(view, index);
    expect(address).toEqual(globalTileToRegion(window.origin.x + 30, window.origin.y + 20));
    expect(view.terrain.tiles[index]?.waterDepth).toBe(
      waterDepthAt(window.terrain.tiles[index]!, compatibility.tide),
    );
    expect(view.settlements).toEqual([]);
    expect(view.routes).toEqual([]);
    expect(view.choirs).toEqual([]);
    const regionKeysFromTiles = [...new Set(window.addresses.map(({ region }) =>
      `${region.x}:${region.y}`))].sort();
    const regionKeysFromExtent = regionalStorageRegionsInView(view)
      .map(({ x, y }) => `${x}:${y}`)
      .sort();
    expect(regionKeysFromExtent).toEqual(regionKeysFromTiles);
    expect(regionKeysFromExtent.length).toBeLessThanOrEqual(9);
  });

  it("addresses the sliding frame and keeps legacy views compatible with region zero", () => {
    const world = createWorld("two coordinate dialects", "wild");
    const compatibility = createWorldView(world);
    expect(regionalAddressAt(compatibility, WORLD_WIDTH)).toEqual({
      region: { x: 0, y: 0 }, localX: 0, localY: 1,
    });
    expect(regionalTileIndexInView(compatibility, { x: 0, y: 0 }, WORLD_WIDTH)).toBe(WORLD_WIDTH);
    expect(regionalTileIndexInView(compatibility, { x: 1, y: 0 }, 0)).toBeNull();
    expect(regionalStorageRegionsInView(compatibility)).toEqual([{ x: 0, y: 0 }]);

    const stream = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const view = createRegionalWorldView(
      compatibility,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window),
    );
    expect(regionalAddressAt(view, 0)).toEqual(
      globalTileToRegion(window.origin.x, window.origin.y),
    );
  });

  it("retargets unchanged view metadata without rebuilding projected terrain", () => {
    const world = createWorld("ownership moves beneath one unbroken view", "wild");
    const compatibility = createWorldView(world);
    const stream = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const view = createRegionalWorldView(
      compatibility,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window),
    );
    const rebound = Object.freeze({ ...window, center: { x: 1, y: 0 } });
    const terrain = view.terrain;

    rebindRegionalWorldViewWindow(view, rebound);

    expect(view.terrain).toBe(terrain);
    expect(regionalWorldCenter(view)).toEqual({ x: 1, y: 0 });
    expect(regionalWindowForWorld(view)).toBe(rebound);
  });
});
