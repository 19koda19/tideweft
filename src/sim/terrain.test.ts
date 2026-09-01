import { describe, expect, it } from "vitest";

import { generateTerrain } from "./terrain";
import { seedFromText } from "./rng";
import { type TerrainKind } from "./types";

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

describe("seeded gradient terrain", () => {
  it("repeats an identical heightfield for the same seed", () => {
    const seed = seedFromText("perlin remembers the shoals");
    const first = generateTerrain(seed).tiles.map((tile) => tile.elevation);
    const second = generateTerrain(seed).tiles.map((tile) => tile.elevation);
    expect(second).toEqual(first);
  });

  it("changes the heightfield when the seed changes", () => {
    const first = generateTerrain(seedFromText("amber watershed")).tiles.map((tile) => tile.elevation);
    const second = generateTerrain(seedFromText("violet watershed")).tiles.map((tile) => tile.elevation);
    expect(second).not.toEqual(first);
  });

  it("forms continuous landforms with a meaningful estuary-wide elevation range", () => {
    const terrain = generateTerrain(seedFromText("long gradient rain"));
    const adjacentDeltas: number[] = [];
    const distantDeltas: number[] = [];
    for (const tile of terrain.tiles) {
      if (tile.x + 1 < terrain.width) {
        const east = terrain.tiles[tile.index + 1];
        if (east !== undefined) adjacentDeltas.push(Math.abs(tile.elevation - east.elevation));
      }
      if (tile.y + 1 < terrain.height) {
        const south = terrain.tiles[tile.index + terrain.width];
        if (south !== undefined) adjacentDeltas.push(Math.abs(tile.elevation - south.elevation));
      }
      if (tile.x + 24 < terrain.width) {
        const distant = terrain.tiles[tile.index + 24];
        if (distant !== undefined) distantDeltas.push(Math.abs(tile.elevation - distant.elevation));
      }
    }

    const elevations = terrain.tiles.map((tile) => tile.elevation);
    expect(Math.max(...elevations) - Math.min(...elevations)).toBeGreaterThan(600_000);
    expect(mean(adjacentDeltas)).toBeLessThan(55_000);
    expect(mean(distantDeltas)).toBeGreaterThan(mean(adjacentDeltas) * 2);
  });

  it("produces every expected base terrain family across a useful seed sample", () => {
    const expected = new Set<TerrainKind>(["deep-water", "tidal-flat", "marsh", "meadow", "ridge"]);
    const counts = new Map<TerrainKind, number>();
    for (let seedIndex = 0; seedIndex < 16; seedIndex += 1) {
      const terrain = generateTerrain(seedFromText(`gradient-family-${seedIndex}`));
      for (const tile of terrain.tiles) counts.set(tile.terrain, (counts.get(tile.terrain) ?? 0) + 1);
    }
    expect(new Set(counts.keys())).toEqual(expected);
    for (const family of expected) {
      expect(counts.get(family) ?? 0, `${family} should be a recurring part of the estuary`).toBeGreaterThan(100);
    }
  });
});
