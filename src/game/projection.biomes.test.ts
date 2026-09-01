import { describe, expect, it } from "vitest";

import {
  BIOME_IDS,
  FIXED_POINT,
  createWorld,
  createWorldView,
  serializeWorld,
} from "../sim/public";
import { createPlayer } from "./player";
import { projectGameView } from "./projection";

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
});
