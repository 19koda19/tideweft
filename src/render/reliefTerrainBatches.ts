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
  /** Eased current sensory strength. This is never folded into the durable mesh key. */
  readonly currentVisibility: number;
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
    currentVisibility: number;
    indices: number[];
  }>();

  for (const tile of chunk.tiles) {
    const source = grid.tiles[tile.row * grid.columns + tile.column];
    const rawCurrent = currentTerrainVisibility(source, true);
    if (rawCurrent <= 0) continue;
    // Sixteen bounded material levels preserve the smooth horizon without
    // turning every tile into a separate WebGL draw call.
    const current = Math.round(rawCurrent * 16) / 16;
    if (current <= 0) continue;
    // Current sight and durable chart knowledge are deliberately independent.
    // The sensory mesh may show an uncharted ridge while it is in view, then
    // return it to possibility-darkness without writing new map memory.
    const visibility = current;
    const tileIndices = chunk.indices.slice(tile.indexOffset, tile.indexOffset + 6);
    if (
      tileIndices.length !== 6
      || tileIndices.some((index) =>
        !Number.isSafeInteger(index) || index < 0 || index >= chunk.vertices.length
      )
    ) continue;
    const biome = visibleBiomePresentation(source)?.id;
    const environment = Math.round(biomeEnvironmentalEmphasis(source) * 4) / 4;
    const key = `${tile.kind}:${biome ?? "legacy"}:${environment}:${visibility}:${current}`;
    const group = groups.get(key) ?? {
      kind: tile.kind,
      ...(biome ? { biome } : {}),
      environment,
      visibility,
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
