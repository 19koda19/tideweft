import type { TerrainMeshChunk } from "./terrainMesh";
import type { TerrainGridView, TerrainKind } from "./types";

export interface ReliefMaterialBatch {
  readonly kind: TerrainKind;
  /** Quantized discovery confidence. Zero-confidence tiles are never submitted. */
  readonly visibility: number;
  /** Chunk-local vertex indices, grouped as complete pairs of triangles. */
  readonly indices: readonly number[];
}

/**
 * Groups one chunk's triangles by material without ever drawing uncharted land.
 * Keeping this pure makes the index-locality and discovery boundary testable
 * without constructing a browser WebGL context.
 */
export function buildReliefMaterialBatches(
  chunk: TerrainMeshChunk,
  grid: TerrainGridView,
): readonly ReliefMaterialBatch[] {
  const groups = new Map<string, { kind: TerrainKind; visibility: number; indices: number[] }>();

  for (const tile of chunk.tiles) {
    const source = grid.tiles[tile.row * grid.columns + tile.column];
    const visibility = Math.round(unit(source?.discovered, 1) * 4) / 4;
    if (visibility <= 0) continue;

    const tileIndices = chunk.indices.slice(tile.indexOffset, tile.indexOffset + 6);
    if (
      tileIndices.length !== 6
      || tileIndices.some((index) =>
        !Number.isSafeInteger(index) || index < 0 || index >= chunk.vertices.length
      )
    ) {
      continue;
    }

    const groupKey = `${tile.kind}:${visibility}`;
    const group = groups.get(groupKey) ?? { kind: tile.kind, visibility, indices: [] };
    group.indices.push(...tileIndices);
    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.visibility - right.visibility);
}

function unit(value: number | undefined, fallback = 0): number {
  const finite = Number.isFinite(value) ? value as number : fallback;
  return Math.max(0, Math.min(1, finite));
}
