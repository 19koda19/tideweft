import { describe, expect, it } from "vitest";

import { isDirectlyDetailPerceived } from "./perceptionPresentation";
import {
  MAX_TERRAIN_PERCEPTION_MEMORY_TILES,
  TERRAIN_PERCEPTION_MEMORY_FADE_MS,
  createTerrainPerceptionMemoryStore,
  rememberedTerrainVisibilityAt,
  sampleTerrainPerceptionMemory,
  terrainPerceptionMemoryIdentity,
  terrainPerceptionMemoryValue,
} from "./terrainPerceptionMemory";
import type { TerrainGridView, TerrainTileView } from "./types";

const tile = (
  currentVisibility: number,
  currentDetailVisibility: 0 | 0.5 | 1 = 0,
): TerrainTileView => ({
  kind: "meadow",
  elevation: 0.4,
  discovered: 1,
  currentVisibility,
  currentDetailVisibility,
});

const grid = (tiles: readonly TerrainTileView[], columns = tiles.length): TerrainGridView => ({
  columns,
  rows: columns === 0 ? 0 : Math.ceil(tiles.length / columns),
  tileSize: 24,
  origin: { x: 0, y: 0 },
  tiles,
  revision: "terrain-memory-test",
});

const sample = (
  terrain: TerrainGridView,
  timeMs: number,
  overrides: Partial<Parameters<typeof sampleTerrainPerceptionMemory>[1]> = {},
) => ({
  terrain,
  spatialEpoch: "r:0:0",
  worldName: "Memory Estuary",
  tick: Math.floor(timeMs / 50),
  timeMs,
  perceptionEnabled: true,
  reducedMotion: false,
  ...overrides,
});

describe("short-term terrain perception memory", () => {
  it("uses a pure monotone fade that reaches the durable-layer baseline on time", () => {
    const values = [0, 180, 450, 720, 900, 1_800].map((elapsed) =>
      terrainPerceptionMemoryValue(1, 0, elapsed, false)
    );
    expect(values).toHaveLength(6);
    [1, 0.8, 0.5, 0.2, 0, 0].forEach((expected, index) => {
      expect(values[index]).toBeCloseTo(expected, 12);
    });
    expect(values.every((value, index) => index === 0 || value <= values[index - 1]!)).toBe(true);
    expect(terrainPerceptionMemoryValue(0.2, 0.8, 16, false)).toBe(0.8);
  });

  it("holds terrain briefly while exact detail and hit-test disclosure fail closed immediately", () => {
    const visible = grid([tile(1, 1)]);
    let state = sampleTerrainPerceptionMemory(undefined, sample(visible, 0));
    const turnedAway = grid([tile(0, 0)]);
    state = sampleTerrainPerceptionMemory(state, sample(turnedAway, 300));

    expect(rememberedTerrainVisibilityAt(state, 0)).toBeCloseTo(2 / 3, 5);
    expect(isDirectlyDetailPerceived(turnedAway, { x: 12, y: 12 }, true)).toBe(false);
    state = sampleTerrainPerceptionMemory(state, sample(turnedAway, TERRAIN_PERCEPTION_MEMORY_FADE_MS));
    expect(rememberedTerrainVisibilityAt(state, 0)).toBe(0);
  });

  it("rebases on epoch, world, geometry, clock rewind, and reduced-motion transitions", () => {
    const visible = grid([tile(1)]);
    const hidden = grid([tile(0)]);
    let state = sampleTerrainPerceptionMemory(undefined, sample(visible, 100));
    state = sampleTerrainPerceptionMemory(state, sample(hidden, 200));
    expect(rememberedTerrainVisibilityAt(state, 0)).toBeGreaterThan(0);

    for (const overrides of [
      { spatialEpoch: "r:1:0" },
      { worldName: "Replacement Estuary" },
      { tick: -1 },
    ]) {
      const rebased = sampleTerrainPerceptionMemory(state, sample(hidden, 250, overrides));
      expect(rememberedTerrainVisibilityAt(rebased, 0)).toBe(0);
    }
    const resized = sampleTerrainPerceptionMemory(state, sample(grid([tile(0), tile(0)], 2), 250));
    expect(resized.values).toHaveLength(2);
    const rewound = sampleTerrainPerceptionMemory(state, sample(hidden, 50, { tick: 3 }));
    expect(rememberedTerrainVisibilityAt(rewound, 0)).toBe(0);

    const reduced = sampleTerrainPerceptionMemory(state, sample(hidden, 250, { reducedMotion: true }));
    expect(rememberedTerrainVisibilityAt(reduced, 0)).toBe(0);
  });

  it("keeps exactly one capped tile array and never grows across repeated samples", () => {
    const tiles = Array.from(
      { length: MAX_TERRAIN_PERCEPTION_MEMORY_TILES + 20 },
      () => tile(1),
    );
    const terrain = grid(tiles, 98);
    let state = sampleTerrainPerceptionMemory(undefined, sample(terrain, 0));
    const values = state.values;
    expect(values).toHaveLength(MAX_TERRAIN_PERCEPTION_MEMORY_TILES);
    for (let frame = 1; frame <= 120; frame += 1) {
      state = sampleTerrainPerceptionMemory(state, sample(terrain, frame * 16));
      expect(state.values).toBe(values);
      expect(state.values.length).toBeLessThanOrEqual(MAX_TERRAIN_PERCEPTION_MEMORY_TILES);
    }
    expect(rememberedTerrainVisibilityAt(state, MAX_TERRAIN_PERCEPTION_MEMORY_TILES)).toBe(0);
  });

  it("shares elapsed terrain memory across a quick Chart/Relief-style handoff", () => {
    const store = createTerrainPerceptionMemoryStore();
    store.sample(sample(grid([tile(1)]), 0));
    const reliefFrame = store.sample(sample(grid([tile(0)]), 120));
    expect(rememberedTerrainVisibilityAt(reliefFrame, 0)).toBeCloseTo(1 - 120 / 900, 5);
    expect(store.current()).toBe(reliefFrame);
    store.reset();
    expect(store.current()).toBeUndefined();
  });

  it("treats opaque delimiters and invalid geometry as collision-safe identity data", () => {
    const terrain = grid([tile(1)]);
    expect(terrainPerceptionMemoryIdentity({
      terrain,
      spatialEpoch: "a|b",
      worldName: "c",
    })).not.toBe(terrainPerceptionMemoryIdentity({
      terrain,
      spatialEpoch: "a",
      worldName: "b|c",
    }));
    expect(terrainPerceptionMemoryIdentity({
      terrain: { ...terrain, tileSize: Number.NaN },
    })).not.toBe(terrainPerceptionMemoryIdentity({
      terrain: { ...terrain, tileSize: 0 },
    }));
    const epochIdentity = (spatialEpoch: number) => terrainPerceptionMemoryIdentity({
      terrain,
      spatialEpoch,
    });
    expect(epochIdentity(-0)).not.toBe(epochIdentity(0));
    expect(new Set([
      epochIdentity(Number.NaN),
      epochIdentity(Number.POSITIVE_INFINITY),
      epochIdentity(Number.NEGATIVE_INFINITY),
    ])).toHaveLength(3);
  });
});
