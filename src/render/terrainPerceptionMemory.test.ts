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

const grid = (
  tiles: readonly TerrainTileView[],
  columns = tiles.length,
  changes: Partial<TerrainGridView> = {},
): TerrainGridView => ({
  columns,
  rows: columns === 0 ? 0 : Math.ceil(tiles.length / columns),
  tileSize: 24,
  origin: { x: 0, y: 0 },
  tiles,
  revision: "terrain-memory-test",
  ...changes,
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

  it("resets legacy memory on epoch, world, geometry, clock rewind, and reduced-motion transitions", () => {
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

  it("retains and fades only absolute cells shared by consecutive spatial frames", () => {
    const priorTiles = Array.from({ length: 9 }, (_, index) => tile((index + 1) / 10));
    const priorTerrain = grid(priorTiles, 3, {
      worldTileOrigin: { x: -40, y: 70 },
    });
    let state = sampleTerrainPerceptionMemory(undefined, sample(priorTerrain, 0, {
      spatialEpoch: "frame-a",
    }));
    const enteringTiles = Array.from({ length: 9 }, () => tile(0));
    enteringTiles[8] = tile(0.75);
    const shiftedTerrain = grid(enteringTiles, 3, {
      worldTileOrigin: { x: -39, y: 71 },
    });
    const priorValues = state.values;

    state = sampleTerrainPerceptionMemory(state, sample(shiftedTerrain, 90, {
      spatialEpoch: "frame-b",
    }));

    expect(state.values).not.toBe(priorValues);
    expect(Array.from(state.values)).toEqual([
      expect.closeTo(0.4, 5),
      expect.closeTo(0.5, 5),
      0,
      expect.closeTo(0.7, 5),
      expect.closeTo(0.8, 5),
      0,
      0,
      0,
      expect.closeTo(0.75, 5),
    ]);
    expect(state.frame.worldTileOrigin).toEqual({ x: -39, y: 71 });
  });

  it("initializes entering cells from live sight and never leaks cells that left the frame", () => {
    const visible = grid(Array.from({ length: 4 }, () => tile(1)), 2, {
      worldTileOrigin: { x: 10, y: 10 },
    });
    let state = sampleTerrainPerceptionMemory(undefined, sample(visible, 0, {
      spatialEpoch: "near",
    }));
    const far = grid([tile(0), tile(0.65), tile(0), tile(0)], 2, {
      worldTileOrigin: { x: 1_000, y: -1_000 },
    });
    state = sampleTerrainPerceptionMemory(state, sample(far, 40, {
      spatialEpoch: "far",
    }));
    expect(Array.from(state.values)).toEqual([0, expect.closeTo(0.65, 5), 0, 0]);

    // Returning does not resurrect values dropped when their cells left the
    // bounded frame. Only current perception may initialize them again.
    const returnedHidden = grid(Array.from({ length: 4 }, () => tile(0)), 2, {
      worldTileOrigin: { x: 10, y: 10 },
    });
    state = sampleTerrainPerceptionMemory(state, sample(returnedHidden, 80, {
      spatialEpoch: "returned",
    }));
    expect(Array.from(state.values)).toEqual([0, 0, 0, 0]);
  });

  it("does not retain absolute overlap across world replacement or tile-scale changes", () => {
    const visible = grid([tile(1)], 1, { worldTileOrigin: { x: 3, y: 4 } });
    const hidden = grid([tile(0)], 1, { worldTileOrigin: { x: 3, y: 4 } });
    const state = sampleTerrainPerceptionMemory(undefined, sample(visible, 0));

    expect(rememberedTerrainVisibilityAt(sampleTerrainPerceptionMemory(
      state,
      sample(hidden, 100, { worldName: "Another Estuary" }),
    ), 0)).toBe(0);
    expect(rememberedTerrainVisibilityAt(sampleTerrainPerceptionMemory(
      state,
      sample({ ...hidden, tileSize: 12 }, 100),
    ), 0)).toBe(0);
  });

  it("keeps exactly one capped tile array and never grows across repeated samples", () => {
    const tiles = Array.from(
      { length: MAX_TERRAIN_PERCEPTION_MEMORY_TILES + 20 },
      () => tile(1),
    );
    const terrain = grid(tiles, 120);
    let state = sampleTerrainPerceptionMemory(undefined, sample(terrain, 0));
    const values = state.values;
    expect(values).toHaveLength(MAX_TERRAIN_PERCEPTION_MEMORY_TILES);
    for (let frame = 1; frame <= 120; frame += 1) {
      state = sampleTerrainPerceptionMemory(state, sample(terrain, frame * 16));
      expect(state.values).toBe(values);
      expect(state.values.length).toBeLessThanOrEqual(MAX_TERRAIN_PERCEPTION_MEMORY_TILES);
    }
    expect(rememberedTerrainVisibilityAt(state, MAX_TERRAIN_PERCEPTION_MEMORY_TILES)).toBe(0);

    const completeFrame = grid(
      Array.from({ length: 120 * 120 }, () => tile(1)),
      120,
      { worldTileOrigin: { x: -1_000_000, y: 1_000_000 } },
    );
    const complete = sampleTerrainPerceptionMemory(undefined, sample(completeFrame, 0));
    expect(complete.values).toHaveLength(14_400);
    expect(rememberedTerrainVisibilityAt(complete, 14_399)).toBe(1);
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
