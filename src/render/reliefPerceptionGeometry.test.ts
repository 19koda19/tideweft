import { describe, expect, it } from "vitest";

import {
  MAX_RELIEF_PERCEPTION_GEOMETRY_BYTES,
  MAX_RELIEF_PERCEPTION_GEOMETRY_VERTICES,
  RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX,
  buildReliefPerceptionGeometryStream,
  type ReliefPerceptionGeometryStreamInput,
  type ReliefPerceptionGeometryStreamReady,
} from "./reliefPerceptionGeometry";
import { reliefSurfaceMaterialColor } from "./reliefMaterialPresentation";
import type { ReliefPerceptionMaterialGroup } from "./reliefTerrainBatches";
import type { TerrainMeshVertex } from "./terrainMesh";

const vertex = (
  x: number,
  y: number,
  z: number,
  normal: readonly [number, number, number] = [0, 0, 1],
): TerrainMeshVertex => ({
  x,
  y,
  z,
  u: 0,
  v: 0,
  column: 0,
  row: 0,
  normal: { x: normal[0], y: normal[1], z: normal[2] },
});

const material = (
  segments: ReliefPerceptionMaterialGroup["segments"],
  overrides: Partial<Omit<ReliefPerceptionMaterialGroup, "segments">> = {},
): ReliefPerceptionMaterialGroup => ({
  kind: "meadow",
  biome: "rain-meadow",
  environment: 0.5,
  visibility: 0.75,
  currentVisibility: 0.75,
  currentLocalIllumination: 1 / 3,
  ...overrides,
  segments,
});

const chunks = [
  {
    chunk: {
      vertices: [
        vertex(10, 11, 12, [0.1, 0.2, 0.3]),
        vertex(20, 21, 22, [0.4, 0.5, 0.6]),
        vertex(30, 31, 32, [0.7, 0.8, 0.9]),
        vertex(40, 41, 42, [-0.1, -0.2, -0.3]),
      ],
    },
  },
  {
    chunk: {
      vertices: [
        vertex(110, 111, 112, [-0.4, -0.5, -0.6]),
        vertex(120, 121, 122, [-0.7, -0.8, -0.9]),
        vertex(130, 131, 132, [1, 0, 0]),
      ],
    },
  },
] as const;

function ready(
  result: ReturnType<typeof buildReliefPerceptionGeometryStream>,
): ReliefPerceptionGeometryStreamReady {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(`expected ready, received ${result.status}`);
  return result;
}

function normalizedRgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function repeatedColor(
  rgb: readonly [number, number, number],
  count: number,
): number[] {
  return Array.from({ length: count }, () => [...rgb, 1]).flat();
}

describe("Relief perception single-geometry stream", () => {
  it("flattens group, segment, and index order with the exact p5 transform and material payload", () => {
    const first = material([
      { chunkIndex: 0, indices: [2, 0, 1] },
      { chunkIndex: 1, indices: [1, 2, 0] },
    ]);
    const second: ReliefPerceptionMaterialGroup = {
      kind: "ridge",
      environment: 0.5,
      visibility: 0.5,
      currentVisibility: 0.5,
      currentLocalIllumination: 2 / 3,
      segments: [{ chunkIndex: 0, indices: [3, 1, 2] }],
    };
    const result = ready(buildReliefPerceptionGeometryStream({
      chunks,
      materials: [first, second],
      visibleChunks: new Uint8Array([1, 1]),
    }));

    expect(result.vertexCount).toBe(9);
    expect(result.triangleCount).toBe(3);
    expect(result.visibleMaterialGroupCount).toBe(2);
    expect(result.visibleSegmentCount).toBe(3);
    expect(result.byteLength).toBe(9 * RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX);
    expect(result.byteLength).toBe(
      result.positions.byteLength
        + result.normals.byteLength
        + result.colors.byteLength
        + result.localLightBands.byteLength,
    );
    expect(result.positions).toEqual(new Float32Array([
      30, -32.12, 31,
      10, -12.12, 11,
      20, -22.12, 21,
      120, -122.12, 121,
      130, -132.12, 131,
      110, -112.12, 111,
      40, -42.12, 41,
      20, -22.12, 21,
      30, -32.12, 31,
    ]));
    expect(result.normals).toEqual(new Float32Array([
      0.7, -0.9, 0.8,
      0.1, -0.3, 0.2,
      0.4, -0.6, 0.5,
      -0.7, 0.9, -0.8,
      1, -0, 0,
      -0.4, 0.6, -0.5,
      -0.1, 0.3, -0.2,
      0.4, -0.6, 0.5,
      0.7, -0.9, 0.8,
    ]));

    const firstRgb = normalizedRgb(reliefSurfaceMaterialColor({
      kind: first.kind,
      ...(first.biome === undefined ? {} : { biome: first.biome }),
      environment: first.environment,
      visibility: first.visibility,
      fog: 0,
      memoryOnly: false,
      currentVisibility: first.currentVisibility,
      currentLocalIllumination: first.currentLocalIllumination,
    }));
    const secondRgb = normalizedRgb(reliefSurfaceMaterialColor({
      kind: second.kind,
      environment: second.environment,
      visibility: second.visibility,
      fog: 0,
      memoryOnly: false,
      currentVisibility: second.currentVisibility,
      currentLocalIllumination: second.currentLocalIllumination,
    }));
    expect(result.colors).toEqual(new Float32Array([
      ...repeatedColor(firstRgb, 6),
      ...repeatedColor(secondRgb, 3),
    ]));
    expect(result.localLightBands).toEqual(new Float32Array([
      1, 1, 1, 1, 1, 1,
      2, 2, 2,
    ]));
  });

  it("excludes hidden segments before index validation and returns empty for an invisible surface", () => {
    const source = material([
      { chunkIndex: 0, indices: [0, 1, 2] },
      // This is deliberately malformed, but the current camera excluded it.
      { chunkIndex: 1, indices: [999, -1] },
      // Even an obsolete chunk reference is inert when the mask omits it.
      { chunkIndex: 7, indices: [999] },
    ]);
    const visible = ready(buildReliefPerceptionGeometryStream({
      chunks,
      materials: [source],
      visibleChunks: new Uint8Array([1, 0]),
    }));

    expect(visible.vertexCount).toBe(3);
    expect(visible.visibleSegmentCount).toBe(1);
    expect(visible.positions).toEqual(new Float32Array([
      10, -12.12, 11,
      20, -22.12, 21,
      30, -32.12, 31,
    ]));

    expect(buildReliefPerceptionGeometryStream({
      chunks,
      materials: [source],
      visibleChunks: new Uint8Array([0, 0]),
    })).toEqual({
      status: "empty",
      vertexCount: 0,
      triangleCount: 0,
      visibleMaterialGroupCount: 0,
      visibleSegmentCount: 0,
      byteLength: 0,
    });
  });

  it("encodes the four authoritative local-light bands as exact scalar attributes", () => {
    const materials = [0, 1 / 3, 2 / 3, 1].map((currentLocalIllumination) =>
      material(
        [{ chunkIndex: 0, indices: [0, 1, 2] }],
        { currentLocalIllumination },
      )
    );
    const result = ready(buildReliefPerceptionGeometryStream({
      chunks,
      materials,
      visibleChunks: new Uint8Array([1, 0]),
    }));

    expect(result.localLightBands).toEqual(new Float32Array([
      0, 0, 0,
      1, 1, 1,
      2, 2, 2,
      3, 3, 3,
    ]));
  });

  it.each([
    { indices: [0, 1], reason: "incomplete-triangle", indexOffset: undefined },
    { indices: [0, 1, 99], reason: "invalid-vertex-index", indexOffset: 2 },
    { indices: [0, 1, -1], reason: "invalid-vertex-index", indexOffset: 2 },
    { indices: [0, 1, 1.5], reason: "invalid-vertex-index", indexOffset: 2 },
    { indices: [0, 1, Number.NaN], reason: "invalid-vertex-index", indexOffset: 2 },
  ])("rejects visible malformed indices without exposing a partial stream: $indices", ({
    indices,
    reason,
    indexOffset,
  }) => {
    const result = buildReliefPerceptionGeometryStream({
      chunks,
      materials: [material([{ chunkIndex: 0, indices }])],
      visibleChunks: new Uint8Array([1, 0]),
    });

    expect(result).toMatchObject({
      status: "invalid",
      reason,
      materialGroupIndex: 0,
      segmentIndex: 0,
      chunkIndex: 0,
      ...(indexOffset === undefined ? {} : { indexOffset }),
    });
    expect("positions" in result).toBe(false);
  });

  it("fails closed on invalid visible chunk and vertex data", () => {
    expect(buildReliefPerceptionGeometryStream({
      chunks,
      materials: [material([{ chunkIndex: 2, indices: [0, 1, 2] }])],
      visibleChunks: new Uint8Array([1, 1, 1]),
    })).toMatchObject({
      status: "invalid",
      reason: "invalid-chunk-index",
      chunkIndex: 2,
    });

    const malformedChunks = [{
      chunk: {
        vertices: [
          vertex(0, 0, 0),
          vertex(1, 0, 0),
          vertex(Number.NaN, 1, 0),
        ],
      },
    }];
    expect(buildReliefPerceptionGeometryStream({
      chunks: malformedChunks,
      materials: [material([{ chunkIndex: 0, indices: [0, 1, 2] }])],
      visibleChunks: [true],
    })).toMatchObject({
      status: "invalid",
      reason: "invalid-vertex",
      indexOffset: 2,
    });
  });

  it("applies vertex and byte caps before allocation with all-or-nothing fallback", () => {
    const source = {
      chunks,
      materials: [material([{ chunkIndex: 0, indices: [0, 1, 2] }])],
      visibleChunks: new Uint8Array([1, 0]),
    } satisfies ReliefPerceptionGeometryStreamInput;

    const vertexCapped = buildReliefPerceptionGeometryStream({
      ...source,
      maximumVertices: 2,
    });
    expect(vertexCapped).toEqual({
      status: "over-cap",
      vertexCount: 3,
      triangleCount: 1,
      visibleMaterialGroupCount: 1,
      visibleSegmentCount: 1,
      byteLength: 3 * RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX,
      maximumVertices: 2,
      maximumBytes: MAX_RELIEF_PERCEPTION_GEOMETRY_BYTES,
    });
    expect("positions" in vertexCapped).toBe(false);

    const byteCapped = buildReliefPerceptionGeometryStream({
      ...source,
      maximumBytes: 3 * RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX - 1,
    });
    expect(byteCapped).toMatchObject({
      status: "over-cap",
      vertexCount: 3,
      byteLength: 3 * RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX,
      maximumVertices: MAX_RELIEF_PERCEPTION_GEOMETRY_VERTICES,
      maximumBytes: 3 * RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX - 1,
    });
    expect("positions" in byteCapped).toBe(false);

    expect(buildReliefPerceptionGeometryStream({
      ...source,
      maximumVertices: 3,
      maximumBytes: 3 * RELIEF_PERCEPTION_GEOMETRY_BYTES_PER_VERTEX,
    }).status).toBe("ready");
  });

  it("is deterministic and never mutates cached chunks, groups, segments, indices, or mask", () => {
    const indices = Object.freeze([2, 1, 0]);
    const segments = Object.freeze([Object.freeze({ chunkIndex: 0, indices })]);
    const groups = Object.freeze([Object.freeze(material(segments))]);
    const frozenChunks = Object.freeze(chunks.map(({ chunk }) => Object.freeze({
      chunk: Object.freeze({ vertices: Object.freeze([...chunk.vertices]) }),
    })));
    const visibleChunks = new Uint8Array([1, 0]);
    const before = {
      groups: JSON.stringify(groups),
      chunks: JSON.stringify(frozenChunks),
      mask: [...visibleChunks],
    };
    const input = {
      chunks: frozenChunks,
      materials: groups,
      visibleChunks,
    } satisfies ReliefPerceptionGeometryStreamInput;

    const first = ready(buildReliefPerceptionGeometryStream(input));
    const second = ready(buildReliefPerceptionGeometryStream(input));

    expect(second.positions).toEqual(first.positions);
    expect(second.normals).toEqual(first.normals);
    expect(second.colors).toEqual(first.colors);
    expect(second.localLightBands).toEqual(first.localLightBands);
    expect(JSON.stringify(groups)).toBe(before.groups);
    expect(JSON.stringify(frozenChunks)).toBe(before.chunks);
    expect([...visibleChunks]).toEqual(before.mask);
    expect(groups[0]?.segments[0]?.indices).toBe(indices);
  });

  it("rejects invalid limits instead of silently disabling a capacity boundary", () => {
    const base = {
      chunks,
      materials: [material([{ chunkIndex: 0, indices: [0, 1, 2] }])],
      visibleChunks: new Uint8Array([1, 0]),
    };
    expect(buildReliefPerceptionGeometryStream({
      ...base,
      maximumVertices: Number.POSITIVE_INFINITY,
    })).toEqual({ status: "invalid", reason: "invalid-limit" });
    expect(buildReliefPerceptionGeometryStream({
      ...base,
      maximumBytes: -1,
    })).toEqual({ status: "invalid", reason: "invalid-limit" });
  });
});
