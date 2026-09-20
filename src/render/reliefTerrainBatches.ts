import type { TerrainMeshChunk } from "./terrainMesh";
import {
  biomeEnvironmentalEmphasis,
  visibleBiomePresentation,
} from "./biomePresentation";
import { reliefDiscoveryVisibility } from "./reliefTerrain";
import { TERRAIN_PERCEPTION_MEMORY_BANDS } from "./terrainPerceptionMemory";
import { currentTerrainVisibility } from "./perceptionPresentation";
import { isWaterDepthDisclosed } from "./waterPresentation";
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
  /** Observation-gated local light reaching this surface, quantized for bounded draws. */
  readonly currentLocalIllumination: number;
}

/**
 * One chunk's already-validated transient material batches. The coalescer uses
 * the source-array position as the stable chunk index so the renderer can cull
 * that chunk against the current camera without rebuilding presentation data.
 */
export interface ReliefPerceptionChunkMaterialSource {
  readonly materials: readonly ReliefPerceptionMaterialBatch[];
}

/** One chunk-local index segment retained under a cross-chunk material group. */
export interface ReliefPerceptionMaterialSegment {
  readonly chunkIndex: number;
  readonly indices: readonly number[];
}

/**
 * Exact effective transient material state plus its deterministic chunk-local
 * segments. Indices remain local to the chunk identified by each segment.
 */
export interface ReliefPerceptionMaterialGroup {
  readonly kind: TerrainKind;
  readonly biome?: BiomeId;
  readonly environment: number;
  readonly visibility: number;
  readonly currentVisibility: number;
  readonly currentLocalIllumination: number;
  readonly segments: readonly ReliefPerceptionMaterialSegment[];
}

/** Transient sight uses a small, visibly smooth set of lightness steps. */
export const RELIEF_PERCEPTION_VISIBILITY_BANDS = TERRAIN_PERCEPTION_MEMORY_BANDS;
export const RELIEF_LOCAL_ILLUMINATION_BANDS = 3;

/**
 * One transient batch for every possible visible material identity, sensory
 * lightness band, and bounded local-light band: ten TerrainKind values plus
 * seven BiomeId values. Durable terrain keeps its finer environmental identity.
 */
export const MAX_RELIEF_PERCEPTION_MATERIAL_BATCHES_PER_CHUNK =
  RELIEF_PERCEPTION_VISIBILITY_BANDS * 17 * (RELIEF_LOCAL_ILLUMINATION_BANDS + 1);

/**
 * Coalesces chunk-local transient batches by the exact material state the
 * Relief renderer applies. No geometry is flattened: every source batch
 * becomes one ordered segment that retains its original chunk-local indices.
 *
 * Group order is the order in which each material is first encountered while
 * traversing chunks and their material arrays. Segment order follows that same
 * traversal. This function owns no camera, frame, or GPU state; callers remain
 * responsible for culling `segment.chunkIndex` before emitting its indices.
 */
export function coalesceReliefPerceptionMaterialBatches(
  chunks: readonly ReliefPerceptionChunkMaterialSource[],
): readonly ReliefPerceptionMaterialGroup[] {
  const groups = new Map<string, {
    kind: TerrainKind;
    biome?: BiomeId;
    environment: number;
    visibility: number;
    currentVisibility: number;
    currentLocalIllumination: number;
    segments: ReliefPerceptionMaterialSegment[];
  }>();

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    if (!chunk) continue;
    for (const material of chunk.materials) {
      const key = reliefPerceptionEffectiveMaterialKey(material);
      const group = groups.get(key) ?? {
        kind: material.kind,
        ...(material.biome ? { biome: material.biome } : {}),
        environment: material.environment,
        visibility: material.visibility,
        currentVisibility: material.currentVisibility,
        currentLocalIllumination: material.currentLocalIllumination,
        segments: [],
      };
      group.segments.push({ chunkIndex, indices: material.indices });
      groups.set(key, group);
    }
  }

  return [...groups.values()];
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
    const kind = visibleTerrainKind(tile.kind, source);
    const groupKey = `${kind}:${biome ?? "legacy"}:${environment}:${visibility}`;
    const group = groups.get(groupKey) ?? {
      kind,
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
  rememberedVisibility?: ArrayLike<number>,
): readonly ReliefPerceptionMaterialBatch[] {
  const groups = new Map<string, {
    kind: TerrainKind;
    biome?: BiomeId;
    environment: number;
    visibility: number;
    currentVisibility: number;
    currentLocalIllumination: number;
    indices: number[];
  }>();

  for (const tile of chunk.tiles) {
    const source = grid.tiles[tile.row * grid.columns + tile.column];
    const tileIndex = tile.row * grid.columns + tile.column;
    const remembered = rememberedVisibility?.[tileIndex];
    const rawCurrent = remembered === undefined
      ? currentTerrainVisibility(source, true)
      : Math.max(0, Math.min(1, Number.isFinite(remembered) ? remembered : 0));
    if (rawCurrent <= 0) continue;
    // Eight bounded material levels preserve the smooth horizon without
    // turning every tile into a separate WebGL draw call.
    const current = Math.round(rawCurrent * RELIEF_PERCEPTION_VISIBILITY_BANDS)
      / RELIEF_PERCEPTION_VISIBILITY_BANDS;
    if (current <= 0) continue;
    const rawLocalIllumination = source?.currentLocalIllumination;
    const currentLocalIllumination = Math.round(
      Math.max(
        0,
        Math.min(
          1,
          Number.isFinite(rawLocalIllumination) ? rawLocalIllumination! : 0,
        ),
      ) * RELIEF_LOCAL_ILLUMINATION_BANDS,
    ) / RELIEF_LOCAL_ILLUMINATION_BANDS;
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
    const kind = visibleTerrainKind(tile.kind, source);
    // Present-tense sight may show a projected biome without writing durable
    // chart memory. Using only visibleBiomePresentation here drops the biome
    // on undiscovered flooded land and incorrectly feeds a blue channel base
    // into Relief until the tile is charted.
    const visibleBiome = source?.biome;
    // A built material ignores biome color in Relief. Every other discovered
    // biome is already the complete color identity; its underlying terrain
    // kind does not change materialColor's result.
    const biome = kind === "built" ? undefined : visibleBiome;
    // Current sight is a short-lived lightness overlay. Climate nuance remains
    // in the durable terrain underneath, while one neutral transient emphasis
    // prevents live perception from multiplying draw calls by climate bucket.
    const environment = 0.5;
    const materialIdentity = biome ? `biome:${biome}` : `kind:${kind}`;
    const key = `${materialIdentity}:${current}:${currentLocalIllumination}`;
    const group = groups.get(key) ?? {
      kind,
      ...(biome ? { biome } : {}),
      environment,
      visibility,
      currentVisibility: current,
      currentLocalIllumination,
      indices: [],
    };
    group.indices.push(...tileIndices);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) =>
    left.currentVisibility - right.currentVisibility
      || left.currentLocalIllumination - right.currentLocalIllumination
      || (left.biome ?? left.kind).localeCompare(right.biome ?? right.kind)
      || left.environment - right.environment
      || left.visibility - right.visibility
  );
}

function visibleTerrainKind(
  fallback: TerrainKind,
  source: TerrainGridView["tiles"][number] | undefined,
): TerrainKind {
  const wet = Number.isFinite(source?.waterDepth) && (source?.waterDepth ?? 0) > 0;
  const waterTerrain = fallback === "deep-water" || fallback === "channel" || fallback === "shallows";
  return wet && waterTerrain && !isWaterDepthDisclosed(source) ? "channel" : fallback;
}

function reliefPerceptionEffectiveMaterialKey(
  material: Omit<ReliefPerceptionMaterialBatch, "indices">,
): string {
  // Non-built biome presentation is the complete authored surface-color
  // identity; its underlying terrain kind is deliberately immaterial. Built
  // surfaces and legacy/no-biome surfaces retain their terrain-kind identity.
  const surfaceIdentity = material.kind === "built" || material.biome === undefined
    ? ["kind", material.kind]
    : ["biome", material.biome];
  return JSON.stringify([
    ...surfaceIdentity,
    material.environment,
    material.visibility,
    material.currentVisibility,
    material.currentLocalIllumination,
  ]);
}
