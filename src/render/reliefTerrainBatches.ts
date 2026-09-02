import type { TerrainMeshChunk } from "./terrainMesh";
import {
  biomeEnvironmentalEmphasis,
  visibleBiomePresentation,
} from "./biomePresentation";
import { reliefDiscoveryVisibility } from "./reliefTerrain";
import { currentTerrainVisibility } from "./perceptionPresentation";
import type { BiomeId, TerrainGridView, TerrainKind } from "./types";

export interface ReliefMaterialBatch {
  readonly kind: TerrainKind;
  readonly biome?: BiomeId;
  /** Quantized current climate emphasis for bounded material variation. */
  readonly environment: number;
  /** Quantized discovery confidence. Zero-confidence tiles are never submitted. */
  readonly visibility: number;
  /** Chunk-local vertex indices, grouped as complete pairs of triangles. */
  readonly indices: readonly number[];
}

export interface ReliefPerceptionMaterialBatch extends ReliefMaterialBatch {
  /** Exact current sensory grade. This is never folded into the durable mesh key. */
  readonly currentVisibility: 0.5 | 1;
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
  const groups = new Map<string, {
    kind: TerrainKind;
    biome?: BiomeId;
    environment: number;
    visibility: number;
    indices: number[];
  }>();

  for (const tile of chunk.tiles) {
    const source = grid.tiles[tile.row * grid.columns + tile.column];
    const visibility = Math.round(reliefDiscoveryVisibility(source) * 4) / 4;
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

    const biome = visibleBiomePresentation(source)?.id;
    const environment = Math.round(biomeEnvironmentalEmphasis(source) * 4) / 4;
    const groupKey = `${tile.kind}:${biome ?? "legacy"}:${environment}:${visibility}`;
    const group = groups.get(groupKey) ?? {
      kind: tile.kind,
      ...(biome ? { biome } : {}),
      environment,
      visibility,
      indices: [],
    };
    group.indices.push(...tileIndices);
    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .sort((left, right) =>
      (left.biome ?? left.kind).localeCompare(right.biome ?? right.kind)
        || left.environment - right.environment
        || left.visibility - right.visibility
    );
}

/**
 * Builds only the small currently perceived surface overlay. The durable mesh
 * remains cached by discovery, so turning or weather changes cannot rebuild
 * terrain normals and chunk geometry.
 */
export function buildReliefPerceptionMaterialBatches(
  chunk: TerrainMeshChunk,
  grid: TerrainGridView,
): readonly ReliefPerceptionMaterialBatch[] {
  const groups = new Map<string, {
    kind: TerrainKind;
    biome?: BiomeId;
    environment: number;
    visibility: number;
    currentVisibility: 0.5 | 1;
    indices: number[];
  }>();

  for (const tile of chunk.tiles) {
    const source = grid.tiles[tile.row * grid.columns + tile.column];
    const current = currentTerrainVisibility(source, true);
    if (current !== 0.5 && current !== 1) continue;
    const discovery = Math.round(reliefDiscoveryVisibility(source) * 4) / 4;
    if (discovery <= 0) continue;
    const tileIndices = chunk.indices.slice(tile.indexOffset, tile.indexOffset + 6);
    if (
      tileIndices.length !== 6
      || tileIndices.some((index) =>
        !Number.isSafeInteger(index) || index < 0 || index >= chunk.vertices.length
      )
    ) continue;
    const biome = visibleBiomePresentation(source)?.id;
    const environment = Math.round(biomeEnvironmentalEmphasis(source) * 4) / 4;
    const key = `${tile.kind}:${biome ?? "legacy"}:${environment}:${discovery}:${current}`;
    const group = groups.get(key) ?? {
      kind: tile.kind,
      ...(biome ? { biome } : {}),
      environment,
      visibility: discovery,
      currentVisibility: current,
      indices: [],
    };
    group.indices.push(...tileIndices);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) =>
    left.currentVisibility - right.currentVisibility
      || (left.biome ?? left.kind).localeCompare(right.biome ?? right.kind)
      || left.environment - right.environment
      || left.visibility - right.visibility
  );
}
