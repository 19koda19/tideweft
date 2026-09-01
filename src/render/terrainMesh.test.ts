import { describe, expect, it } from "vitest";

import { buildTerrainMesh, type TerrainMeshVertex } from "./terrainMesh";
import type { TerrainGridView, TerrainKind, TerrainTileView } from "./types";

function grid(
  columns: number,
  rows: number,
  elevations: readonly number[] = [],
  options: {
    readonly tileSize?: number;
    readonly originX?: number;
    readonly originY?: number;
    readonly depths?: readonly number[];
    readonly kinds?: readonly TerrainKind[];
  } = {},
): TerrainGridView {
  const tiles: TerrainTileView[] = Array.from({ length: columns * rows }, (_, index) => ({
    kind: options.kinds?.[index] ?? "meadow",
    elevation: elevations[index] ?? 0,
    waterDepth: options.depths?.[index] ?? 0,
  }));
  return {
    columns,
    rows,
    tileSize: options.tileSize ?? 10,
    origin: { x: options.originX ?? 0, y: options.originY ?? 0 },
    tiles,
    revision: "mesh-test",
  };
}

function crossZ(
  first: TerrainMeshVertex,
  second: TerrainMeshVertex,
  third: TerrainMeshVertex,
): number {
  const abX = second.x - first.x;
  const abY = second.y - first.y;
  const acX = third.x - first.x;
  const acY = third.y - first.y;
  return abX * acY - abY * acX;
}

describe("terrain mesh chunking", () => {
  it("emits complete tile geometry with predictable edge chunk counts", () => {
    const mesh = buildTerrainMesh(grid(3, 2), { chunkSize: 2, verticalScale: 20 });

    expect(mesh.chunks).toHaveLength(2);
    expect(mesh.chunks[0]?.gridBounds).toEqual({
      startColumn: 0,
      startRow: 0,
      endColumn: 2,
      endRow: 2,
    });
    expect(mesh.chunks[0]?.vertices).toHaveLength(9);
    expect(mesh.chunks[0]?.indices).toHaveLength(24);
    expect(mesh.chunks[0]?.tiles).toHaveLength(4);
    expect(mesh.chunks[1]?.gridBounds).toEqual({
      startColumn: 2,
      startRow: 0,
      endColumn: 3,
      endRow: 2,
    });
    expect(mesh.chunks[1]?.vertices).toHaveLength(6);
    expect(mesh.chunks[1]?.indices).toHaveLength(12);
    expect(mesh.chunks[1]?.tiles).toHaveLength(2);
    expect(mesh.chunks.flatMap((chunk) => chunk.tiles)).toHaveLength(6);
  });

  it("duplicates chunk seams without position, UV, height, or normal cracks", () => {
    const mesh = buildTerrainMesh(
      grid(4, 2, [0, 0.2, 0.7, 1, 0.1, 0.3, 0.65, 0.8]),
      { chunkSize: 2, verticalScale: 30 },
    );
    const left = mesh.chunks[0];
    const right = mesh.chunks[1];
    if (!left || !right) throw new Error("fixture did not produce adjacent chunks");

    const leftSeam = left.vertices.filter((vertex) => vertex.column === 2);
    const rightSeam = right.vertices.filter((vertex) => vertex.column === 2);

    expect(leftSeam).toEqual(rightSeam);
    expect(leftSeam).toHaveLength(3);
    expect(leftSeam.map((vertex) => vertex.v)).toEqual([0, 0.5, 1]);
  });

  it("uses upward counter-clockwise winding and unit-length global normals", () => {
    const mesh = buildTerrainMesh(
      grid(3, 2, [0, 0.15, 0.9, 0.1, 0.45, 1]),
      { chunkSize: 3, verticalScale: 40 },
    );
    const chunk = mesh.chunks[0];
    if (!chunk) throw new Error("fixture did not produce a chunk");

    for (let offset = 0; offset < chunk.indices.length; offset += 3) {
      const first = chunk.vertices[chunk.indices[offset] ?? -1];
      const second = chunk.vertices[chunk.indices[offset + 1] ?? -1];
      const third = chunk.vertices[chunk.indices[offset + 2] ?? -1];
      if (!first || !second || !third) throw new Error("triangle index left its vertex buffer");
      expect(crossZ(first, second, third)).toBeGreaterThan(0);
    }

    for (const vertex of chunk.vertices) {
      expect(Math.hypot(vertex.normal.x, vertex.normal.y, vertex.normal.z)).toBeCloseTo(1, 12);
      expect(vertex.normal.z).toBeGreaterThan(0);
    }
    expect(chunk.vertices.some((vertex) => Math.abs(vertex.normal.x) > 0.01)).toBe(true);
  });

  it("reports tight world and chunk bounds, including partial edge chunks", () => {
    const mesh = buildTerrainMesh(
      grid(5, 3, [
        0, 0, 0, 0, 0,
        0, 0.25, 0.5, 0.75, 1,
        0, 0, 0, 0, 0,
      ], { tileSize: 4, originX: -8, originY: 12 }),
      { chunkSize: 2, verticalScale: 10 },
    );

    expect(mesh.bounds).toEqual({
      min: { x: -8, y: 12, z: 0 },
      // Corner sampling averages neighboring cells, so the lone peak reaches 0.5 here.
      max: { x: 12, y: 24, z: 5 },
    });
    expect(mesh.chunks).toHaveLength(6);
    const edge = mesh.chunks.find((chunk) => chunk.id === "terrain-2-1");
    expect(edge?.gridBounds).toEqual({
      startColumn: 4,
      startRow: 2,
      endColumn: 5,
      endRow: 3,
    });
    expect(edge?.bounds.min.x).toBe(8);
    expect(edge?.bounds.max.x).toBe(12);
    expect(edge?.bounds.min.y).toBe(20);
    expect(edge?.bounds.max.y).toBe(24);
    expect(edge?.vertices).toHaveLength(4);
    expect(edge?.indices).toHaveLength(6);
  });

  it("keeps a 96 by 72 world in independently cullable bounded chunks", () => {
    const mesh = buildTerrainMesh(grid(96, 72));

    expect(mesh.chunks).toHaveLength(30);
    expect(mesh.chunks.every((chunk) => chunk.vertices.length <= 17 * 17)).toBe(true);
    expect(mesh.chunks.every((chunk) => chunk.indices.length <= 16 * 16 * 6)).toBe(true);
    expect(mesh.chunks.reduce((count, chunk) => count + chunk.tiles.length, 0)).toBe(96 * 72);
  });
});

describe("terrain mesh height and water fields", () => {
  it("averages neighboring cell elevations into edge-complete corner heights", () => {
    const mesh = buildTerrainMesh(grid(2, 2, [0, 0.4, 0.8, 1]), {
      chunkSize: 2,
      verticalScale: 10,
    });
    const vertices = mesh.chunks[0]?.vertices;
    if (!vertices) throw new Error("fixture did not produce vertices");

    expect(vertices.map((vertex) => vertex.z)).toEqual([
      0, 2, 4,
      4, 5.5, 7,
      8, 9, 10,
    ]);
    expect(vertices[0]).toMatchObject({ x: 0, y: 0, u: 0, v: 0, column: 0, row: 0 });
    expect(vertices[8]).toMatchObject({ x: 20, y: 20, u: 1, v: 1, column: 2, row: 2 });
  });

  it("derives a water plane, wet bounds, and full depth field from wet tiles", () => {
    const mesh = buildTerrainMesh(
      grid(
        3,
        2,
        [0.2, 0.3, 0.6, 0.1, 0.4, 0.8],
        {
          tileSize: 5,
          originX: 10,
          originY: -5,
          depths: [0, 0.3, 0, 0.5, 0.2, 0],
        },
      ),
      { verticalScale: 20 },
    );
    const water = mesh.waterPlane;
    if (!water) throw new Error("fixture did not produce a water plane");

    // Every wet fixture tile has an elevation + depth surface level of 0.6.
    expect(water.normalizedLevel).toBeCloseTo(0.6, 12);
    expect(water.level).toBeCloseTo(12, 12);
    expect(water.wetTileCount).toBe(3);
    expect(water.maxDepth).toBe(0.5);
    expect(water.minSurfaceLevel).toBeCloseTo(0.6, 12);
    expect(water.maxSurfaceLevel).toBeCloseTo(0.6, 12);
    expect(water.gridBounds).toEqual({
      startColumn: 0,
      startRow: 0,
      endColumn: 2,
      endRow: 2,
    });
    expect(water.bounds).toEqual({
      min: { x: 10, y: -5, z: 12 },
      max: { x: 20, y: 5, z: 12 },
    });
    expect(water.vertices).toHaveLength(4);
    expect(water.indices).toEqual([0, 1, 2, 0, 2, 3]);
    expect(water.depths).toEqual([0, 0.3, 0, 0.5, 0.2, 0]);
  });

  it("omits water geometry for a completely dry grid", () => {
    expect(buildTerrainMesh(grid(2, 2)).waterPlane).toBeNull();
  });
});

describe("terrain mesh safety and determinism", () => {
  it("is deterministic and does not mutate the renderer projection", () => {
    const source = grid(3, 3, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], {
      depths: [0.2, 0.1, 0, 0, 0, 0, 0, 0, 0],
    });
    const snapshot = structuredClone(source);

    const first = buildTerrainMesh(source, { chunkSize: 2, verticalScale: 17 });
    const second = buildTerrainMesh(source, { chunkSize: 2, verticalScale: 17 });

    expect(second).toEqual(first);
    expect(source).toEqual(snapshot);
  });

  it("returns an empty safe value for empty, nonsensical, and excessively large grids", () => {
    const empty = buildTerrainMesh({
      columns: 0,
      rows: 0,
      tileSize: 0,
      origin: { x: 0, y: 0 },
      tiles: [],
      revision: 1,
    });
    expect(empty).toMatchObject({
      columns: 0,
      rows: 0,
      tileSize: 1,
      bounds: null,
      chunks: [],
      waterPlane: null,
    });

    const malformed = buildTerrainMesh({
      columns: Number.NaN,
      rows: -4,
      tileSize: Number.POSITIVE_INFINITY,
      origin: { x: Number.NaN, y: 0 },
      tiles: [{ kind: "meadow", elevation: Number.NaN }],
      revision: 2,
    });
    expect(malformed.chunks).toEqual([]);
    expect(malformed.bounds).toBeNull();

    const huge = buildTerrainMesh({
      columns: 1_001,
      rows: 1_000,
      tileSize: 1,
      origin: { x: 0, y: 0 },
      tiles: [{ kind: "meadow", elevation: 0 }],
      revision: 3,
    });
    expect(huge.chunks).toEqual([]);
  });

  it("sanitizes short and malformed tile arrays without invalid vertices", () => {
    const malformed = {
      columns: 2,
      rows: 2,
      tileSize: 3,
      origin: { x: 1, y: 2 },
      tiles: [
        { kind: "not-a-terrain", elevation: 4, waterDepth: -2 },
      ],
      revision: "malformed",
    } as unknown as TerrainGridView;
    const mesh = buildTerrainMesh(malformed, { chunkSize: 0, verticalScale: -1 });

    expect(mesh.chunkSize).toBe(16);
    expect(mesh.verticalScale).toBe(6);
    expect(mesh.chunks).toHaveLength(1);
    expect(mesh.chunks[0]?.tiles).toHaveLength(4);
    expect(mesh.chunks[0]?.tiles[0]).toMatchObject({ kind: "deep-water", waterDepth: 0 });
    expect(mesh.chunks.flatMap((chunk) => chunk.vertices).every((vertex) =>
      Number.isFinite(vertex.x)
      && Number.isFinite(vertex.y)
      && Number.isFinite(vertex.z)
      && Number.isFinite(vertex.normal.x)
      && Number.isFinite(vertex.normal.y)
      && Number.isFinite(vertex.normal.z)
    )).toBe(true);
  });
});
