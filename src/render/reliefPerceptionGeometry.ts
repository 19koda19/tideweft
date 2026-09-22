import { reliefSurfaceMaterialColor } from "./reliefMaterialPresentation";
import {
  RELIEF_LOCAL_ILLUMINATION_BANDS,
  type ReliefPerceptionMaterialGroup,
} from "./reliefTerrainBatches";
import type { TerrainMeshChunk, TerrainMeshVertex } from "./terrainMesh";

/** Matches the existing immediate Relief overlay's p5-space vertical lift. */
export const RELIEF_PERCEPTION_GEOMETRY_VERTICAL_OFFSET = -0.12;

/**
 * A flattened vertex contains position xyz, normal xyz, color rgba, and one
 * exact local-light band. Every channel is a 32-bit float in the stream.
 */
export const RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX =
  (3 + 3 + 4 + 1) * Float32Array.BYTES_PER_ELEMENT;

/**
 * Hard defaults keep a malformed or unexpectedly broad sensory surface from
 * allocating an unbounded renderer-side stream. Callers may choose a smaller
 * explicit limit for a particular renderer or device.
 */
export const MAX_RELIEF_PERCEPTION_GEOMETRY_VERTICES = 100_000;
export const MAX_RELIEF_PERCEPTION_GEOMETRY_BYTES = 8 * 1024 * 1024;

/** The narrow chunk shape already supplied by CachedReliefPerception. */
export interface ReliefPerceptionGeometryChunkSource {
  readonly chunk: Pick<TerrainMeshChunk, "vertices">;
}

/**
 * Structurally compatible with the cached perception owner plus its current
 * camera visibility mask. A chunk is visible only when its mask entry is the
 * exact admitted value `1` (or `true` for simple test/integration fixtures).
 */
export interface ReliefPerceptionGeometryStreamInput {
  readonly chunks: readonly ReliefPerceptionGeometryChunkSource[];
  readonly materials: readonly ReliefPerceptionMaterialGroup[];
  readonly visibleChunks: ArrayLike<number | boolean>;
  readonly maximumVertices?: number;
  readonly maximumBytes?: number;
}

interface ReliefPerceptionGeometryStreamCounts {
  /** Required vertices after current-camera chunk culling. */
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** Groups with at least one non-empty visible segment. */
  readonly visibleMaterialGroupCount: number;
  /** Non-empty visible chunk-local segments. */
  readonly visibleSegmentCount: number;
  /** Typed-array payload bytes required by this stream. */
  readonly byteLength: number;
}

export interface ReliefPerceptionGeometryStreamReady
  extends ReliefPerceptionGeometryStreamCounts {
  readonly status: "ready";
  /** p5 coordinates: source `(x, y, z)` becomes `(x, -z - 0.12, y)`. */
  readonly positions: Float32Array;
  /** p5 coordinates: source `(x, y, z)` becomes `(x, -z, y)`. */
  readonly normals: Float32Array;
  /** Normalized authored surface RGBA, with an opaque alpha channel. */
  readonly colors: Float32Array;
  /** Exact present-tense local-light band, 0 through 3, for p5 UV transport. */
  readonly localLightBands: Float32Array;
}

export interface ReliefPerceptionGeometryStreamEmpty
  extends ReliefPerceptionGeometryStreamCounts {
  readonly status: "empty";
}

export interface ReliefPerceptionGeometryStreamOverCap
  extends ReliefPerceptionGeometryStreamCounts {
  readonly status: "over-cap";
  readonly maximumVertices: number;
  readonly maximumBytes: number;
}

export type ReliefPerceptionGeometryInvalidReason =
  | "invalid-limit"
  | "invalid-chunk-index"
  | "incomplete-triangle"
  | "invalid-vertex-index"
  | "invalid-vertex";

/**
 * Invalid visible geometry never yields a partial stream. The coordinates
 * identify the first rejected source entry in deterministic traversal order.
 */
export interface ReliefPerceptionGeometryStreamInvalid {
  readonly status: "invalid";
  readonly reason: ReliefPerceptionGeometryInvalidReason;
  readonly materialGroupIndex?: number;
  readonly segmentIndex?: number;
  readonly indexOffset?: number;
  readonly chunkIndex?: number;
}

export type ReliefPerceptionGeometryStreamResult =
  | ReliefPerceptionGeometryStreamReady
  | ReliefPerceptionGeometryStreamEmpty
  | ReliefPerceptionGeometryStreamOverCap
  | ReliefPerceptionGeometryStreamInvalid;

interface VisibleSegment {
  readonly materialGroupIndex: number;
  readonly chunkIndex: number;
  readonly indices: readonly number[];
}

interface StreamPreflight extends ReliefPerceptionGeometryStreamCounts {
  readonly segments: readonly VisibleSegment[];
}

const EMPTY_COUNTS: ReliefPerceptionGeometryStreamCounts = Object.freeze({
  vertexCount: 0,
  triangleCount: 0,
  visibleMaterialGroupCount: 0,
  visibleSegmentCount: 0,
  byteLength: 0,
});

/**
 * Flattens the currently visible Relief perception triangles into one
 * deterministic, p5-ready vertex stream.
 *
 * Traversal is material-group order, then segment order, then source-index
 * order. Hidden segments are never inspected or copied. Visible malformed
 * geometry and either capacity breach return a metadata-only fallback result;
 * no partial typed arrays are exposed and no input object is mutated.
 */
export function buildReliefPerceptionGeometryStream(
  input: ReliefPerceptionGeometryStreamInput,
): ReliefPerceptionGeometryStreamResult {
  const maximumVertices = input.maximumVertices
    ?? MAX_RELIEF_PERCEPTION_GEOMETRY_VERTICES;
  const maximumBytes = input.maximumBytes
    ?? MAX_RELIEF_PERCEPTION_GEOMETRY_BYTES;
  if (!validLimit(maximumVertices) || !validLimit(maximumBytes)) {
    return { status: "invalid", reason: "invalid-limit" };
  }

  const preflight = preflightVisibleSegments(input);
  if ("reason" in preflight) return preflight;
  if (preflight.vertexCount === 0) return { status: "empty", ...EMPTY_COUNTS };
  if (
    preflight.vertexCount > maximumVertices
    || preflight.byteLength > maximumBytes
  ) {
    const { segments: _segments, ...counts } = preflight;
    return {
      status: "over-cap",
      ...counts,
      maximumVertices,
      maximumBytes,
    };
  }

  const positions = new Float32Array(preflight.vertexCount * 3);
  const normals = new Float32Array(preflight.vertexCount * 3);
  const colors = new Float32Array(preflight.vertexCount * 4);
  const localLightBands = new Float32Array(preflight.vertexCount);
  let vertexOffset = 0;

  for (const segment of preflight.segments) {
    const material = input.materials[segment.materialGroupIndex];
    const chunk = input.chunks[segment.chunkIndex]?.chunk;
    // Preflight has already proved both exist. Keeping this guard makes a
    // future structural caller fail closed if it supplies a hostile proxy.
    if (!material || !chunk) {
      return {
        status: "invalid",
        reason: "invalid-chunk-index",
        materialGroupIndex: segment.materialGroupIndex,
        chunkIndex: segment.chunkIndex,
      };
    }
    const [red, green, blue] = normalizedSurfaceRgb(material);
    const localLightBand = quantizedLocalLightBand(material.currentLocalIllumination);

    for (const index of segment.indices) {
      const vertex = chunk.vertices[index];
      // Exact vertex identity/index validity was established in preflight.
      if (!vertex) {
        return {
          status: "invalid",
          reason: "invalid-vertex-index",
          materialGroupIndex: segment.materialGroupIndex,
          chunkIndex: segment.chunkIndex,
        };
      }
      writeVertex({
        positions,
        normals,
        colors,
        localLightBands,
        vertexOffset,
        vertex,
        red,
        green,
        blue,
        localLightBand,
      });
      vertexOffset += 1;
    }
  }

  const { segments: _segments, ...counts } = preflight;
  return {
    status: "ready",
    ...counts,
    positions,
    normals,
    colors,
    localLightBands,
  };
}

function preflightVisibleSegments(
  input: ReliefPerceptionGeometryStreamInput,
): StreamPreflight | ReliefPerceptionGeometryStreamInvalid {
  const segments: VisibleSegment[] = [];
  let vertexCount = 0;
  let visibleMaterialGroupCount = 0;

  for (
    let materialGroupIndex = 0;
    materialGroupIndex < input.materials.length;
    materialGroupIndex += 1
  ) {
    const material = input.materials[materialGroupIndex];
    if (!material) continue;
    let groupHasVisibleGeometry = false;

    for (let segmentIndex = 0; segmentIndex < material.segments.length; segmentIndex += 1) {
      const segment: ReliefPerceptionMaterialGroup["segments"][number] | undefined =
        material.segments[segmentIndex];
      if (!segment) continue;
      const chunkIndex = segment.chunkIndex;
      // Camera exclusion is the first boundary: a hidden segment contributes
      // neither geometry nor fallback, even when its dormant data is stale.
      if (!chunkIsVisible(input.visibleChunks, chunkIndex)) continue;
      if (
        !Number.isSafeInteger(chunkIndex)
        || chunkIndex < 0
        || chunkIndex >= input.chunks.length
      ) {
        return {
          status: "invalid",
          reason: "invalid-chunk-index",
          materialGroupIndex,
          segmentIndex,
          chunkIndex,
        };
      }
      if (segment.indices.length % 3 !== 0) {
        return {
          status: "invalid",
          reason: "incomplete-triangle",
          materialGroupIndex,
          segmentIndex,
          chunkIndex,
        };
      }
      if (segment.indices.length === 0) continue;

      const vertices = input.chunks[chunkIndex]?.chunk.vertices;
      if (!vertices) {
        return {
          status: "invalid",
          reason: "invalid-chunk-index",
          materialGroupIndex,
          segmentIndex,
          chunkIndex,
        };
      }
      for (let indexOffset = 0; indexOffset < segment.indices.length; indexOffset += 1) {
        const index = segment.indices[indexOffset];
        if (
          !Number.isSafeInteger(index)
          || index === undefined
          || index < 0
          || index >= vertices.length
        ) {
          return {
            status: "invalid",
            reason: "invalid-vertex-index",
            materialGroupIndex,
            segmentIndex,
            indexOffset,
            chunkIndex,
          };
        }
        if (!validVertex(vertices[index])) {
          return {
            status: "invalid",
            reason: "invalid-vertex",
            materialGroupIndex,
            segmentIndex,
            indexOffset,
            chunkIndex,
          };
        }
      }

      if (!groupHasVisibleGeometry) {
        visibleMaterialGroupCount += 1;
        groupHasVisibleGeometry = true;
      }
      vertexCount += segment.indices.length;
      if (!Number.isSafeInteger(vertexCount)) {
        return { status: "invalid", reason: "invalid-limit" };
      }
      segments.push({ materialGroupIndex, chunkIndex, indices: segment.indices });
    }
  }

  return {
    segments,
    vertexCount,
    triangleCount: vertexCount / 3,
    visibleMaterialGroupCount,
    visibleSegmentCount: segments.length,
    byteLength: vertexCount * RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX,
  };
}

function chunkIsVisible(
  visibleChunks: ArrayLike<number | boolean>,
  chunkIndex: number,
): boolean {
  const value = visibleChunks[chunkIndex];
  return value === 1 || value === true;
}

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validVertex(vertex: TerrainMeshVertex | undefined): vertex is TerrainMeshVertex {
  return vertex !== undefined
    && Number.isFinite(vertex.x)
    && Number.isFinite(vertex.y)
    && Number.isFinite(vertex.z)
    && Number.isFinite(vertex.normal?.x)
    && Number.isFinite(vertex.normal?.y)
    && Number.isFinite(vertex.normal?.z);
}

function normalizedSurfaceRgb(
  material: ReliefPerceptionMaterialGroup,
): readonly [number, number, number] {
  const color = reliefSurfaceMaterialColor({
    kind: material.kind,
    ...(material.biome === undefined ? {} : { biome: material.biome }),
    environment: material.environment,
    visibility: material.visibility,
    fog: 0,
    memoryOnly: false,
    currentVisibility: material.currentVisibility,
    currentLocalIllumination: material.currentLocalIllumination,
  });
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ];
}

function quantizedLocalLightBand(currentLocalIllumination: number): number {
  if (!Number.isFinite(currentLocalIllumination)) return 0;
  return Math.max(
    0,
    Math.min(
      RELIEF_LOCAL_ILLUMINATION_BANDS,
      Math.round(currentLocalIllumination * RELIEF_LOCAL_ILLUMINATION_BANDS),
    ),
  );
}

function writeVertex(input: {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly localLightBands: Float32Array;
  readonly vertexOffset: number;
  readonly vertex: TerrainMeshVertex;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly localLightBand: number;
}): void {
  const vectorOffset = input.vertexOffset * 3;
  input.positions[vectorOffset] = input.vertex.x;
  input.positions[vectorOffset + 1] = -input.vertex.z
    + RELIEF_PERCEPTION_GEOMETRY_VERTICAL_OFFSET;
  input.positions[vectorOffset + 2] = input.vertex.y;
  input.normals[vectorOffset] = input.vertex.normal.x;
  input.normals[vectorOffset + 1] = -input.vertex.normal.z;
  input.normals[vectorOffset + 2] = input.vertex.normal.y;
  input.localLightBands[input.vertexOffset] = input.localLightBand;

  const colorOffset = input.vertexOffset * 4;
  input.colors[colorOffset] = input.red;
  input.colors[colorOffset + 1] = input.green;
  input.colors[colorOffset + 2] = input.blue;
  input.colors[colorOffset + 3] = 1;
}
