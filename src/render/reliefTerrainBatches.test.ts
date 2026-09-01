import { describe, expect, it } from "vitest";

import { buildReliefMaterialBatches } from "./reliefTerrainBatches";
import { buildTerrainMesh } from "./terrainMesh";
import type { TerrainGridView, TerrainTileView } from "./types";

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
});
