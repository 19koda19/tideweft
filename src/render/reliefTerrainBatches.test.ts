import { describe, expect, it } from "vitest";

import {
  MAX_RELIEF_PERCEPTION_MATERIAL_BATCHES_PER_CHUNK,
  RELIEF_LOCAL_ILLUMINATION_BANDS,
  RELIEF_PERCEPTION_VISIBILITY_BANDS,
  buildReliefMaterialBatches,
  buildReliefPerceptionMaterialBatches,
  coalesceReliefPerceptionMaterialBatches,
  type ReliefPerceptionMaterialBatch,
} from "./reliefTerrainBatches";
import { buildTerrainMesh } from "./terrainMesh";
import { currentTerrainDetailVisibility } from "./perceptionPresentation";
import type {
  BiomeId,
  TerrainGridView,
  TerrainKind,
  TerrainTileView,
} from "./types";

function grid(columns: number, rows: number, discovered: readonly number[]): TerrainGridView {
  const tiles: TerrainTileView[] = Array.from({ length: columns * rows }, (_, index) => ({
    kind: index % 2 === 0 ? "meadow" : "salt-marsh",
    elevation: 0.2 + (index % 5) * 0.08,
    waterDepth: index % 3 === 0 ? 0.18 : 0,
    discovered: discovered[index] ?? 0,
  }));
  return {
    columns,
    rows,
    tileSize: 24,
    origin: { x: 0, y: 0 },
    tiles,
    revision: "relief-batch-test",
  };
}

describe("Relief terrain material batches", () => {
  it("omits uncharted tiles and retains only complete chunk-local triangles", () => {
    const source = grid(4, 3, [
      0, 0.12, 0.74, 1,
      0, 0, 0.51, 0,
      1, 0.26, 0, 0.99,
    ]);
    const mesh = buildTerrainMesh(source, { chunkSize: 2, verticalScale: 40 });

    for (const chunk of mesh.chunks) {
      const batches = buildReliefMaterialBatches(chunk, source);
      const visibleTiles = chunk.tiles.filter((tile) =>
        Math.round(
          (source.tiles[tile.row * source.columns + tile.column]?.discovered ?? 0) * 4,
        ) > 0
      );
      expect(batches.every((batch) => batch.visibility > 0)).toBe(true);
      expect(batches.reduce((count, batch) => count + batch.indices.length, 0))
        .toBe(visibleTiles.length * 6);
      for (const batch of batches) {
        expect(batch.indices.length % 6).toBe(0);
        expect(batch.indices.every((index) =>
          Number.isSafeInteger(index) && index >= 0 && index < chunk.vertices.length
        )).toBe(true);
      }
    }
  });

  it("submits no geometry for a wholly unknown chunk but preserves a discovery island", () => {
    const unknown = grid(16, 16, []);
    const unknownChunk = buildTerrainMesh(unknown, { chunkSize: 16 }).chunks[0];
    if (!unknownChunk) throw new Error("fixture did not create its terrain chunk");
    expect(buildReliefMaterialBatches(unknownChunk, unknown)).toEqual([]);

    const discovered = Array.from({ length: 16 * 16 }, (_, index) => {
      const column = index % 16;
      const row = Math.floor(index / 16);
      return (column - 8) ** 2 + (row - 8) ** 2 <= 25 ? 1 : 0;
    });
    const island = grid(16, 16, discovered);
    const islandChunk = buildTerrainMesh(island, { chunkSize: 16 }).chunks[0];
    if (!islandChunk) throw new Error("fixture did not create its terrain chunk");
    const batches = buildReliefMaterialBatches(islandChunk, island);
    expect(batches.reduce((count, batch) => count + batch.indices.length, 0)).toBe(81 * 6);
  });

  it("keeps discovered biome materials distinct without exposing hidden biome IDs", () => {
    const source = grid(3, 1, [1, 1, 0]);
    const tiles = source.tiles.map((tile, index): TerrainTileView => ({
      ...tile,
      biome: index === 0 ? "rain-meadow" : index === 1 ? "sun-meadow" : "glimmerfen",
      climate: {
        rainfall: 0.8,
        heat: 0.7,
        salinity: 0.2,
        exposure: 0.3,
        magicalWater: 0.9,
      },
    }));
    const withBiomes = { ...source, tiles };
    const chunk = buildTerrainMesh(withBiomes, { chunkSize: 3 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");
    const batches = buildReliefMaterialBatches(chunk, withBiomes);

    expect(new Set(batches.map((batch) => batch.biome))).toEqual(
      new Set(["rain-meadow", "sun-meadow"]),
    );
    expect(batches.reduce((count, batch) => count + batch.indices.length, 0)).toBe(2 * 6);
    expect(batches.every((batch) => batch.environment >= 0 && batch.environment <= 1)).toBe(true);
  });

  it("builds a momentary overlay without submitting hidden or malformed disclosure", () => {
    const source = grid(3, 1, [1, 1, 1]);
    const perceived: TerrainGridView = {
      ...source,
      tiles: source.tiles.map((tile, index) => ({
        ...tile,
        currentVisibility: index === 0 ? 0 : index === 1 ? 0.5 : 1,
      })),
    };
    const chunk = buildTerrainMesh(perceived, { chunkSize: 3 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");
    const batches = buildReliefPerceptionMaterialBatches(chunk, perceived);
    expect(batches.reduce((count, batch) => count + batch.indices.length, 0)).toBe(12);
    expect(new Set(batches.map((batch) => batch.currentVisibility))).toEqual(new Set([0.5, 1]));

    const legacyChunk = buildTerrainMesh(source, { chunkSize: 3 }).chunks[0];
    if (!legacyChunk) throw new Error("fixture did not create a legacy chunk");
    expect(buildReliefPerceptionMaterialBatches(legacyChunk, source)).toEqual([]);
  });

  it("uses shared terrain memory for surface light only while exact detail stays live-closed", () => {
    const source = grid(1, 1, [1]);
    const hidden: TerrainGridView = {
      ...source,
      tiles: [{
        ...source.tiles[0]!,
        currentVisibility: 0,
        currentDetailVisibility: 0,
      }],
    };
    const chunk = buildTerrainMesh(hidden, { chunkSize: 1 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");
    const remembered = new Float32Array([0.63]);
    const batches = buildReliefPerceptionMaterialBatches(chunk, hidden, remembered);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.currentVisibility).toBe(5 / 8);
    expect(currentTerrainDetailVisibility(hidden.tiles[0], true)).toBe(0);
    expect(remembered[0]).toBeCloseTo(0.63, 6);
  });

  it("shows currently seen uncharted terrain without promoting it into durable chart memory", () => {
    const source = grid(3, 1, [0, 0, 0]);
    const perceived: TerrainGridView = {
      ...source,
      tiles: source.tiles.map((tile, index) => ({
        ...tile,
        currentVisibility: index === 0 ? 0 : index === 1 ? 0.5 : 1,
      })),
    };
    const chunk = buildTerrainMesh(perceived, { chunkSize: 3 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");

    expect(buildReliefMaterialBatches(chunk, perceived)).toEqual([]);
    const sensory = buildReliefPerceptionMaterialBatches(chunk, perceived);
    expect(sensory.reduce((count, batch) => count + batch.indices.length, 0)).toBe(12);
    expect(new Set(sensory.map((batch) => batch.visibility))).toEqual(new Set([0.5, 1]));
    expect(new Set(sensory.map((batch) => batch.currentVisibility))).toEqual(new Set([0.5, 1]));
  });

  it("uses one neutral Relief under-material for terrain-visible unsounded water", () => {
    const tiles: readonly TerrainTileView[] = [
      {
        kind: "shallows",
        elevation: 0.2,
        waterDepth: 0.08,
        discovered: 1,
        depthKnown: 0,
        currentVisibility: 1,
        currentDetailVisibility: 0,
      },
      {
        kind: "deep-water",
        elevation: 0.2,
        waterDepth: 0.96,
        discovered: 1,
        depthKnown: 0,
        currentVisibility: 1,
        currentDetailVisibility: 0.5,
      },
    ];
    const hiddenDepth: TerrainGridView = {
      columns: 2,
      rows: 1,
      tileSize: 24,
      origin: { x: 0, y: 0 },
      tiles,
      revision: "neutral-water-underlay",
    };
    const chunk = buildTerrainMesh(hiddenDepth, { chunkSize: 2 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");

    expect(new Set(buildReliefMaterialBatches(chunk, hiddenDepth).map(({ kind }) => kind)))
      .toEqual(new Set(["channel"]));
    expect(new Set(
      buildReliefPerceptionMaterialBatches(chunk, hiddenDepth).map(({ kind }) => kind),
    )).toEqual(new Set(["channel"]));

    const sounded: TerrainGridView = {
      ...hiddenDepth,
      tiles: hiddenDepth.tiles.map((tile) => ({ ...tile, depthKnown: 1 })),
    };
    expect(new Set(buildReliefMaterialBatches(chunk, sounded).map(({ kind }) => kind)))
      .toEqual(new Set(["shallows", "deep-water"]));
  });

  it("keeps flooded land earthy while transient uncharted sight retains its biome material", () => {
    const tiles: readonly TerrainTileView[] = [
      {
        kind: "salt-marsh",
        biome: "brine-flat",
        elevation: 0.18,
        waterDepth: 0.46,
        discovered: 0,
        depthKnown: 0,
        currentVisibility: 1,
        currentDetailVisibility: 0,
      },
      {
        kind: "meadow",
        biome: "rain-meadow",
        elevation: 0.24,
        waterDepth: 0.2,
        discovered: 0,
        depthKnown: 0,
        currentVisibility: 1,
        currentDetailVisibility: 0,
      },
      {
        kind: "deep-water",
        biome: "tide-channel",
        elevation: 0.05,
        waterDepth: 0.9,
        discovered: 0,
        depthKnown: 0,
        currentVisibility: 1,
        currentDetailVisibility: 0,
      },
    ];
    const source: TerrainGridView = {
      columns: 3,
      rows: 1,
      tileSize: 24,
      origin: { x: 0, y: 0 },
      tiles,
      revision: "earth-under-water",
    };
    const chunk = buildTerrainMesh(source, { chunkSize: 3 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");

    const batches = buildReliefPerceptionMaterialBatches(chunk, source);
    expect(batches.map(({ kind, biome }) => ({ kind, biome }))).toEqual([
      { kind: "salt-marsh", biome: "brine-flat" },
      { kind: "meadow", biome: "rain-meadow" },
      { kind: "channel", biome: "tide-channel" },
    ]);
    expect(batches.filter(({ biome }) => biome !== "tide-channel").every(
      ({ kind }) => kind !== "channel" && kind !== "deep-water" && kind !== "shallows",
    )).toBe(true);
  });

  it("quantizes eased terrain strength into bounded monotone material bands", () => {
    const source = grid(4, 1, [0, 0, 0, 0]);
    const perceived: TerrainGridView = {
      ...source,
      tiles: source.tiles.map((tile, index) => ({
        ...tile,
        currentVisibility: [0.07, 0.2, 0.71, 1][index] ?? 0,
      })),
    };
    const chunk = buildTerrainMesh(perceived, { chunkSize: 4 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");
    const strengths = buildReliefPerceptionMaterialBatches(chunk, perceived)
      .map((batch) => batch.currentVisibility)
      .sort((left, right) => left - right);
    expect(strengths).toEqual([1 / 8, 2 / 8, 6 / 8, 1]);
  });

  it("omits sub-band sensory geometry and retains monotone RGB-fade bands", () => {
    const source = grid(5, 1, [0, 0, 0, 0, 0]);
    const perceived: TerrainGridView = {
      ...source,
      tiles: source.tiles.map((tile, index) => ({
        ...tile,
        currentVisibility: [0.01, 0.04, 0.07, 0.5, 1][index] ?? 0,
      })),
    };
    const chunk = buildTerrainMesh(perceived, { chunkSize: 5 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");
    const batches = buildReliefPerceptionMaterialBatches(chunk, perceived);
    const strengths = batches.map((batch) => batch.currentVisibility);

    expect(batches.flatMap((batch) => batch.indices)).toHaveLength(18);
    expect(strengths).toEqual([1 / 8, 0.5, 1]);
  });

  it("uses one neutral transient material for a biome across kind and climate variation", () => {
    const source = grid(2, 1, [1, 1]);
    const perceived: TerrainGridView = {
      ...source,
      tiles: source.tiles.map((tile, index) => ({
        ...tile,
        biome: "rain-meadow" as const,
        climate: {
          rainfall: index,
          heat: 0.5,
          salinity: 0.5,
          exposure: 0.5,
          magicalWater: 0.5,
        },
        currentVisibility: 0.5,
      })),
    };
    const chunk = buildTerrainMesh(perceived, { chunkSize: 2 }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");

    const batches = buildReliefPerceptionMaterialBatches(chunk, perceived);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      biome: "rain-meadow",
      environment: 0.5,
      currentVisibility: 0.5,
    });
    expect(batches[0]?.indices).toHaveLength(12);
  });

  it("hard-caps a chunk across transient identity, visibility, and local-light bands", () => {
    const kinds: readonly TerrainKind[] = [
      "deep-water",
      "channel",
      "shallows",
      "mudflat",
      "sandbar",
      "salt-marsh",
      "meadow",
      "scrub",
      "ridge",
      "built",
    ];
    const biomes: readonly BiomeId[] = [
      "tide-channel",
      "brine-flat",
      "reed-marsh",
      "rain-meadow",
      "sun-meadow",
      "wind-ridge",
      "glimmerfen",
    ];
    const identities: readonly Pick<TerrainTileView, "kind" | "biome" | "discovered">[] = [
      ...kinds.map((kind) => ({ kind, discovered: 0 })),
      ...biomes.map((biome) => ({ kind: "meadow" as const, biome, discovered: 1 })),
    ];
    const columns = identities.length;
    const rows = RELIEF_PERCEPTION_VISIBILITY_BANDS
      * (RELIEF_LOCAL_ILLUMINATION_BANDS + 1);
    const tiles: TerrainTileView[] = Array.from(
      { length: columns * rows },
      (_, index) => {
        const combination = Math.floor(index / columns);
        const visibilityBand = combination % RELIEF_PERCEPTION_VISIBILITY_BANDS;
        const localLightBand = Math.floor(
          combination / RELIEF_PERCEPTION_VISIBILITY_BANDS,
        );
        const identity = identities[index % columns];
        if (!identity) throw new Error("fixture lost a material identity");
        return {
          ...identity,
          elevation: 0.2,
          waterDepth: 0,
          currentVisibility: (visibilityBand + 1) / RELIEF_PERCEPTION_VISIBILITY_BANDS,
          currentLocalIllumination: localLightBand / RELIEF_LOCAL_ILLUMINATION_BANDS,
        };
      },
    );
    const perceived: TerrainGridView = {
      columns,
      rows,
      tileSize: 24,
      origin: { x: 0, y: 0 },
      tiles,
      revision: "transient-material-ceiling",
    };
    const chunk = buildTerrainMesh(perceived, { chunkSize: Math.max(columns, rows) }).chunks[0];
    if (!chunk) throw new Error("fixture did not create a terrain chunk");

    const batches = buildReliefPerceptionMaterialBatches(chunk, perceived);
    expect(batches).toHaveLength(MAX_RELIEF_PERCEPTION_MATERIAL_BATCHES_PER_CHUNK);
    expect(batches.length).toBeLessThanOrEqual(
      MAX_RELIEF_PERCEPTION_MATERIAL_BATCHES_PER_CHUNK,
    );
    expect(batches.flatMap((batch) => batch.indices)).toHaveLength(tiles.length * 6);
    expect(batches.every((batch) => batch.environment === 0.5)).toBe(true);
    expect(new Set(batches.map(({ currentLocalIllumination }) => currentLocalIllumination)))
      .toEqual(new Set([0, 1 / 3, 2 / 3, 1]));
  });
});

describe("cross-chunk Relief perception material coalescing", () => {
  const material = (
    indices: readonly number[],
    overrides: Partial<ReliefPerceptionMaterialBatch> = {},
  ): ReliefPerceptionMaterialBatch => ({
    kind: "meadow",
    environment: 0.5,
    visibility: 0.75,
    currentVisibility: 0.75,
    currentLocalIllumination: 1 / 3,
    indices,
    ...overrides,
  });

  it("groups exact effective materials in first-seen order and preserves ordered chunk segments", () => {
    const rainFirst = material([0, 1, 2, 3, 4, 5], { biome: "rain-meadow" });
    const locallyLit = material([6, 7, 8, 9, 10, 11], {
      biome: "rain-meadow",
      currentLocalIllumination: 2 / 3,
    });
    const ridge = material([12, 13, 14, 15, 16, 17], {
      kind: "ridge",
    });
    // A biome is the complete effective surface identity, so the underlying
    // kind may differ without changing the authored transient material.
    const rainSecond = material([18, 19, 20, 21, 22, 23], {
      kind: "salt-marsh",
      biome: "rain-meadow",
    });
    const rainThird = material([24, 25, 26, 27, 28, 29], { biome: "rain-meadow" });
    const chunks = [
      { materials: [rainFirst, locallyLit] },
      { materials: [ridge, rainSecond] },
      { materials: [rainThird] },
    ] as const;

    const groups = coalesceReliefPerceptionMaterialBatches(chunks);

    expect(groups).toHaveLength(3);
    expect(groups.map(({ biome, kind, currentLocalIllumination }) => ({
      identity: biome ?? kind,
      currentLocalIllumination,
    }))).toEqual([
      { identity: "rain-meadow", currentLocalIllumination: 1 / 3 },
      { identity: "rain-meadow", currentLocalIllumination: 2 / 3 },
      { identity: "ridge", currentLocalIllumination: 1 / 3 },
    ]);
    expect(groups[0]?.segments).toEqual([
      { chunkIndex: 0, indices: rainFirst.indices },
      { chunkIndex: 1, indices: rainSecond.indices },
      { chunkIndex: 2, indices: rainThird.indices },
    ]);
    expect(groups[1]?.segments).toEqual([
      { chunkIndex: 0, indices: locallyLit.indices },
    ]);
    expect(groups[2]?.segments).toEqual([
      { chunkIndex: 1, indices: ridge.indices },
    ]);
  });

  it("keeps every effective material field exact", () => {
    const groups = coalesceReliefPerceptionMaterialBatches([{
      materials: [
        material([0]),
        material([1], { biome: "sun-meadow" }),
        material([2], { environment: 0.25 }),
        material([3], { visibility: 0.5 }),
        material([4], { currentVisibility: 0.5 }),
        material([5], { currentLocalIllumination: 2 / 3 }),
        material([6], { kind: "built" }),
        material([7], { kind: "ridge" }),
      ],
    }]);

    expect(groups).toHaveLength(8);
    expect(groups.flatMap(({ segments }) => segments.flatMap(({ indices }) => indices)))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("retains every input index exactly once without mutating or copying input segments", () => {
    const first = material([31, 32, 33]);
    const second = material([41, 42]);
    const third = material([51, 52, 53, 54], { currentVisibility: 0.5 });
    const chunks = [
      { materials: [first] },
      { materials: [second, third] },
    ] as const;
    const before = chunks.map(({ materials }) => ({
      materials: materials.map((entry) => ({ ...entry, indices: [...entry.indices] })),
    }));

    const groups = coalesceReliefPerceptionMaterialBatches(chunks);
    const outputIndices = groups.flatMap(({ segments }) =>
      segments.flatMap(({ indices }) => indices)
    );

    expect([...outputIndices].sort((left, right) => left - right)).toEqual([
      31, 32, 33, 41, 42, 51, 52, 53, 54,
    ]);
    expect(new Set(outputIndices).size).toBe(outputIndices.length);
    expect(chunks).toEqual(before);
    expect(groups[0]?.segments[0]?.indices).toBe(first.indices);
    expect(groups[0]?.segments[1]?.indices).toBe(second.indices);
    expect(groups[1]?.segments[0]?.indices).toBe(third.indices);
    expect(coalesceReliefPerceptionMaterialBatches(chunks)).toEqual(groups);
  });

  it("returns no groups when no chunk supplies transient material", () => {
    expect(coalesceReliefPerceptionMaterialBatches([])).toEqual([]);
    expect(coalesceReliefPerceptionMaterialBatches([{ materials: [] }])).toEqual([]);
  });
});
