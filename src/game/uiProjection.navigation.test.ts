import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { MOBILE_REGION_STREAMING_CONFIG, createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow, regionLocalToWindowTile } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { TILE_UNITS, createPlayer } from "./player";
import { projectNavigationCoordinates } from "./uiProjection";

describe("signed navigation projection", () => {
  it.each([
    [-304, 719, 17, 4],
    [1_000_000, -1_000_000, 95, 71],
  ] as const)(
    "projects region (%i,%i) local (%i,%i) without confusing floating-window coordinates",
    (regionX, regionY, localX, localY) => {
      const state = createWorld(`navigation ${regionX} ${regionY}`, "standard");
      const economy = createWorldView(state);
      const stream = createTerrainRegionStreamingState({
        rootSeed: state.meta.rootSeed,
        center: { x: regionX, y: regionY },
        config: MOBILE_REGION_STREAMING_CONFIG,
      });
      const window = createRegionalTerrainWindow(state.meta.rootSeed, stream);
      const regional = createRegionalWorldView(economy, window, {
        discovered: new Array<number>(window.terrain.tiles.length).fill(0),
        depthSoundings: new Array<number>(window.terrain.tiles.length).fill(0),
      });
      // Generated frontier regions intentionally have no cloned settlements;
      // carry the same persistent courier into the projected window.
      const player = createPlayer(economy);
      const projected = regionLocalToWindowTile(
        window,
        { x: regionX, y: regionY },
        localX,
        localY,
      );
      if (!projected) throw new Error("navigation fixture is absent from its sliding frame");
      player.x = projected.x * TILE_UNITS + TILE_UNITS / 2;
      player.y = projected.y * TILE_UNITS + TILE_UNITS / 2;

      expect(projectNavigationCoordinates(regional, player)).toEqual({
        regionX,
        regionY,
        localX,
        localY,
        globalX: regionX * WORLD_WIDTH + localX,
        globalY: regionY * WORLD_HEIGHT + localY,
      });
    },
  );
});
