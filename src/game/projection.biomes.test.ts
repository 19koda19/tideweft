import { describe, expect, it } from "vitest";

import {
  BIOME_IDS,
  FIXED_POINT,
  WORLD_WIDTH,
  createWorld,
  createWorldView,
  serializeWorld,
} from "../sim/public";
import {
  chartTerrainDecorationHash01,
  reliefTerrainDecorationHash01,
  terrainTileGlobalCoordinate,
} from "../render/terrainDecoration";
import { globalTileToRegion } from "../sim/regions";
import { TILE_UNITS, createPlayer } from "./player";
import { projectGameView } from "./projection";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import {
  createRegionalWorldView,
  regionalTileIndexInView,
} from "./regionalWorldView";

describe("biome terrain projection", () => {
  it("projects a stable biome and bounded live climate for every generated tile", () => {
    const world = createWorld("the cartographer's weather glass", "standard");
    const calm = createWorldView(world);
    const storm = {
      ...calm,
      weather: {
        ...calm.weather,
        kind: "storm" as const,
        intensity: FIXED_POINT,
        windX: FIXED_POINT,
        windY: -FIXED_POINT,
      },
    };
    const calmTerrain = projectGameView(calm, createPlayer(calm)).terrain.tiles;
    const repeatedCalmTerrain = projectGameView(calm, createPlayer(calm)).terrain.tiles;
    const stormTerrain = projectGameView(storm, createPlayer(storm)).terrain.tiles;
    const relabeled = { ...calm, seedText: "a display-name alias" };
    const relabeledTerrain = projectGameView(relabeled, createPlayer(relabeled)).terrain.tiles;

    expect(calmTerrain).toHaveLength(calm.terrain.tiles.length);
    expect(repeatedCalmTerrain[0]?.climate).toBe(calmTerrain[0]?.climate);
    expect(stormTerrain.map((tile) => tile.biome)).toEqual(
      calmTerrain.map((tile) => tile.biome),
    );
    expect(relabeledTerrain.map((tile) => tile.biome)).toEqual(
      calmTerrain.map((tile) => tile.biome),
    );
    expect(relabeledTerrain.map((tile) => tile.climate)).toEqual(
      calmTerrain.map((tile) => tile.climate),
    );
    expect(stormTerrain.some((tile, index) =>
      tile.climate?.rainfall !== calmTerrain[index]?.climate?.rainfall
        || tile.climate?.exposure !== calmTerrain[index]?.climate?.exposure
    )).toBe(true);

    for (const tile of stormTerrain) {
      expect(BIOME_IDS).toContain(tile.biome);
      expect(tile.climate).toBeDefined();
      for (const signal of Object.values(tile.climate ?? {})) {
        expect(signal).toBeGreaterThanOrEqual(0);
        expect(signal).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic across fresh same-seed worlds and diverse across real generated terrain", () => {
    const seeds = [
      "glass rain archive",
      "lanterns beneath the brine",
      "the hill that whistles back",
      "moss remembers every courier",
      "seven quiet currents",
    ];
    const seen = new Set<string>();

    for (const seed of seeds) {
      const firstWorld = createWorldView(createWorld(seed, "calm"));
      const secondWorld = createWorldView(createWorld(seed, "calm"));
      const first = projectGameView(firstWorld, createPlayer(firstWorld)).terrain.tiles;
      const second = projectGameView(secondWorld, createPlayer(secondWorld)).terrain.tiles;
      expect(second.map((tile) => ({ biome: tile.biome, climate: tile.climate }))).toEqual(
        first.map((tile) => ({ biome: tile.biome, climate: tile.climate })),
      );
      for (const tile of first) if (tile.biome) seen.add(tile.biome);
    }

    expect([...seen].sort()).toEqual([...BIOME_IDS].sort());
  });

  it("invalidates cached baselines when immutable terrain changes under the same seed", () => {
    const base = createWorldView(createWorld("the careful cache", "standard"));
    const original = projectGameView(base, createPlayer(base)).terrain.tiles[0];
    const changed = {
      ...base,
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile, index) => index === 0
          ? {
              ...tile,
              terrain: "ridge" as const,
              elevation: FIXED_POINT,
              moisture: 0,
              roughness: FIXED_POINT,
            }
          : tile),
      },
    };
    const reprojected = projectGameView(changed, createPlayer(changed)).terrain.tiles[0];

    expect(reprojected?.biome).toBe("wind-ridge");
    expect(reprojected).not.toEqual(original);
  });

  it("derives biomes without mutating or migrating the saved world", () => {
    const world = createWorld("old save, new seasons", "wild");
    const before = serializeWorld(world);
    const view = createWorldView(world);

    projectGameView(view, createPlayer(view));

    expect(serializeWorld(world)).toBe(before);
    const envelope = JSON.parse(before) as {
      world: { terrain: { tiles: Array<Record<string, unknown>> } };
    };
    expect(envelope.world.terrain.tiles.every((tile) =>
      !("biome" in tile) && !("climate" in tile)
    )).toBe(true);
  });

  it("keeps overlapping biome, climate, and Chart/Relief detail stable across east-west recentering", () => {
    const world = createWorld("one marsh seen through two floating origins", "wild");
    const compatibility = createWorldView(world);
    const player = createPlayer(compatibility, compatibility.settlements[0]?.id);
    const stream = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed });
    const cartography = createRegionalCartography(world.meta.rootSeed);
    const westWindow = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const westKnowledge = projectRegionalCartographyWindow(cartography, westWindow);
    player.worldWidth = westWindow.terrain.width;
    player.worldHeight = westWindow.terrain.height;
    player.discovered = [...westKnowledge.discovered];
    player.depthSoundings = [...westKnowledge.depthSoundings];
    const projectWorld = (window: typeof westWindow) => createRegionalWorldView(
      compatibility,
      window,
      projectRegionalCartographyWindow(cartography, window),
    );
    const eastWindow = createRegionalTerrainWindow(
      world.meta.rootSeed,
      stream,
      { x: westWindow.origin.x + 16, y: westWindow.origin.y },
    );
    const sharedGlobal = { x: 88, y: 36 };
    const sharedAddress = globalTileToRegion(sharedGlobal.x, sharedGlobal.y);
    const sharedTileIndex = sharedAddress.localY * WORLD_WIDTH + sharedAddress.localX;
    player.x = 60 * TILE_UNITS + 500;
    player.y = 60 * TILE_UNITS + 500;
    player.previousX = player.x;
    player.previousY = player.y;
    player.currentTrace = [60 * player.worldWidth + 60];
    player.surveyTrace = [...player.currentTrace];
    player.sweepPath = [];
    const westWorld = projectWorld(westWindow);
    const west = projectGameView(westWorld, player);
    const westIndex = regionalTileIndexInView(
      westWorld,
      sharedAddress.region,
      sharedTileIndex,
    );
    if (westIndex === null) throw new Error("west frame lost the overlap fixture");

    const eastKnowledge = projectRegionalCartographyWindow(cartography, eastWindow);
    player.x -= 16 * TILE_UNITS;
    player.previousX -= 16 * TILE_UNITS;
    player.discovered = [...eastKnowledge.discovered];
    player.depthSoundings = [...eastKnowledge.depthSoundings];
    player.currentTrace = [Math.floor(player.y / TILE_UNITS) * player.worldWidth
      + Math.floor(player.x / TILE_UNITS)];
    player.surveyTrace = [...player.currentTrace];
    player.sweepPath = [];
    const eastWorld = projectWorld(eastWindow);
    const east = projectGameView(eastWorld, player);
    const eastIndex = regionalTileIndexInView(
      eastWorld,
      sharedAddress.region,
      sharedTileIndex,
    );
    if (eastIndex === null) throw new Error("east interior lost the overlap fixture");
    const westColumn = westIndex % west.terrain.columns;
    const westRow = Math.floor(westIndex / west.terrain.columns);
    const eastColumn = eastIndex % east.terrain.columns;
    const eastRow = Math.floor(eastIndex / east.terrain.columns);
    const westTile = west.terrain.tiles[westIndex];
    const eastTile = east.terrain.tiles[eastIndex];
    const finiteTile = projectGameView(
      compatibility,
      createPlayer(compatibility, compatibility.settlements[0]?.id),
    ).terrain.tiles[sharedGlobal.y * WORLD_WIDTH + sharedGlobal.x];

    expect(west.terrain.worldTileOrigin).toEqual(westWindow.origin);
    expect(east.terrain.worldTileOrigin).toEqual(eastWindow.origin);
    expect(west.spatialEpoch).toBe(`g:${westWindow.origin.x}:${westWindow.origin.y}`);
    expect(east.spatialEpoch).toBe(`g:${eastWindow.origin.x}:${eastWindow.origin.y}`);
    expect(terrainTileGlobalCoordinate(west.terrain, westColumn, westRow)).toEqual(sharedGlobal);
    expect(terrainTileGlobalCoordinate(east.terrain, eastColumn, eastRow)).toEqual(sharedGlobal);
    expect({ biome: eastTile?.biome, climate: eastTile?.climate }).toEqual({
      biome: westTile?.biome,
      climate: westTile?.climate,
    });
    expect({ biome: westTile?.biome, climate: westTile?.climate }).toEqual({
      biome: finiteTile?.biome,
      climate: finiteTile?.climate,
    });
    expect(chartTerrainDecorationHash01(west.terrain, westColumn, westRow, 0x7465_7874))
      .toBe(chartTerrainDecorationHash01(east.terrain, eastColumn, eastRow, 0x7465_7874));
    expect(reliefTerrainDecorationHash01(west.terrain, westColumn, westRow, 0x6269_6f6d))
      .toBe(reliefTerrainDecorationHash01(east.terrain, eastColumn, eastRow, 0x6269_6f6d));

    const returnedWorld = projectWorld(westWindow);
    expect(regionalTileIndexInView(returnedWorld, sharedAddress.region, sharedTileIndex))
      .toBe(westIndex);
  });
});
