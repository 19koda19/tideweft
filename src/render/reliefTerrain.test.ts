import { describe, expect, it, vi } from "vitest";

import {
  createReliefDiscoverySignatureMemo,
  discoveredReliefSurfaceHeightAt,
  maskReliefTileForDiscovery,
  perceivedReliefSurfaceHeightAt,
  reliefDiscoveryVisibility,
  reliefDiscoverySignature,
} from "./reliefTerrain";
import { buildTerrainMesh, type TerrainMesh } from "./terrainMesh";
import type { TerrainGridView, TerrainTileView } from "./types";

const tile = (changes: Partial<TerrainTileView> = {}): TerrainTileView => ({
  kind: "meadow",
  elevation: 0.8,
  waterDepth: 0.15,
  discovered: 1,
  ...changes,
});

const grid = (
  tiles: readonly TerrainTileView[],
  changes: Partial<TerrainGridView> = {},
): TerrainGridView => ({
  columns: tiles.length,
  rows: 1,
  tileSize: 10,
  origin: { x: 0, y: 0 },
  revision: "fixture",
  tiles,
  ...changes,
});

const reliefGrid = (
  elevations: readonly number[],
  options: {
    readonly discoveries?: readonly number[];
    readonly depths?: readonly number[];
  } = {},
): TerrainGridView => grid(
  elevations.map((elevation, index) => tile({
    elevation,
    waterDepth: options.depths?.[index] ?? 0,
    discovered: options.discoveries?.[index] ?? 1,
  })),
  { columns: 3, rows: 3 },
);

function maskedMesh(source: TerrainGridView, verticalScale: number): TerrainMesh {
  return buildTerrainMesh({
    ...source,
    tiles: source.tiles.map(maskReliefTileForDiscovery),
  }, { chunkSize: 2, verticalScale });
}

function meshTriangleHeightAt(
  mesh: TerrainMesh,
  gridView: TerrainGridView,
  point: { readonly x: number; readonly y: number },
): number {
  const normalizedX = Math.max(0, Math.min(
    gridView.columns,
    (point.x - gridView.origin.x) / gridView.tileSize,
  ));
  const normalizedY = Math.max(0, Math.min(
    gridView.rows,
    (point.y - gridView.origin.y) / gridView.tileSize,
  ));
  const column = Math.min(gridView.columns - 1, Math.floor(normalizedX));
  const row = Math.min(gridView.rows - 1, Math.floor(normalizedY));
  const localX = normalizedX - column;
  const localY = normalizedY - row;
  const chunk = mesh.chunks.find((candidate) =>
    column >= candidate.gridBounds.startColumn
    && column < candidate.gridBounds.endColumn
    && row >= candidate.gridBounds.startRow
    && row < candidate.gridBounds.endRow
  );
  const sourceTile = chunk?.tiles.find((candidate) =>
    candidate.column === column && candidate.row === row
  );
  if (!chunk || !sourceTile) throw new Error("fixture point is outside its mesh");
  const triangleOffset = sourceTile.indexOffset + (localX >= localY ? 0 : 3);
  const vertices = [0, 1, 2].map((offset) => {
    const index = chunk.indices[triangleOffset + offset];
    const vertex = index === undefined ? undefined : chunk.vertices[index];
    if (!vertex) throw new Error("fixture triangle is incomplete");
    return vertex;
  });
  const [first, second, third] = vertices;
  if (!first || !second || !third) throw new Error("fixture triangle is incomplete");
  const denominator = (second.y - third.y) * (first.x - third.x)
    + (third.x - second.x) * (first.y - third.y);
  const firstWeight = ((second.y - third.y) * (point.x - third.x)
    + (third.x - second.x) * (point.y - third.y)) / denominator;
  const secondWeight = ((third.y - first.y) * (point.x - third.x)
    + (first.x - third.x) * (point.y - third.y)) / denominator;
  return firstWeight * first.z
    + secondWeight * second.z
    + (1 - firstWeight - secondWeight) * third.z;
}

describe("discovery-masked Relief surfaces", () => {
  it("cannot distinguish authoritative heights in undiscovered tiles", () => {
    const hiddenLow = grid([tile({ elevation: 0.1, waterDepth: 0.05, discovered: 0 })]);
    const hiddenHigh = grid([tile({ elevation: 0.95, waterDepth: 0.9, discovered: 0 })]);

    expect(discoveredReliefSurfaceHeightAt(hiddenLow, { x: 5, y: 5 }, 100, true)).toBe(0);
    expect(discoveredReliefSurfaceHeightAt(hiddenHigh, { x: 5, y: 5 }, 100, true)).toBe(0);
  });

  it("reveals real uncharted surface only while the broad terrain field reaches it", () => {
    const hidden = grid([tile({
      elevation: 0.82,
      waterDepth: 0.13,
      discovered: 0,
      currentVisibility: 0,
    })]);
    const seen: TerrainGridView = {
      ...hidden,
      tiles: hidden.tiles.map((entry) => ({ ...entry, currentVisibility: 1 })),
    };

    expect(perceivedReliefSurfaceHeightAt(hidden, { x: 5, y: 5 }, 100, true)).toBe(0);
    expect(perceivedReliefSurfaceHeightAt(seen, { x: 5, y: 5 }, 100, false))
      .toBeCloseTo(82, 12);
    expect(perceivedReliefSurfaceHeightAt(seen, { x: 5, y: 5 }, 100, true))
      .toBeCloseTo(95, 12);
    expect(seen.tiles[0]?.discovered).toBe(0);
  });

  it("uses the same partial-discovery values for mesh tiles and surface anchors", () => {
    const source = tile({ elevation: 0.8, waterDepth: 0.2, discovered: 0.25 });
    const masked = maskReliefTileForDiscovery(source);
    const terrain = grid([source]);

    expect(masked.elevation).toBeCloseTo(0.2, 12);
    expect(masked.waterDepth).toBeCloseTo(0.05, 12);
    expect(discoveredReliefSurfaceHeightAt(terrain, { x: 5, y: 5 }, 100, false)).toBeCloseTo(20, 12);
    expect(discoveredReliefSurfaceHeightAt(terrain, { x: 5, y: 5 }, 100, true)).toBeCloseTo(25, 12);
  });

  it("keeps omitted discovery compatible with fully visible legacy projections", () => {
    const legacy: TerrainTileView = {
      kind: "meadow",
      elevation: 0.4,
      waterDepth: 0.1,
    };
    const terrain = grid([legacy]);
    expect(discoveredReliefSurfaceHeightAt(terrain, { x: 5, y: 5 }, 100, true)).toBeCloseTo(50, 12);
    expect(reliefDiscoveryVisibility(legacy)).toBe(1);
    expect(reliefDiscoveryVisibility(tile({ discovered: Number.NaN }))).toBe(0);
  });

  it.each([
    ["center-low", [
      0.62, 0.78, 0.91,
      0.55, 0.02, 0.84,
      0.73, 0.96, 0.68,
    ]],
    ["center-high", [
      0.38, 0.22, 0.09,
      0.45, 0.98, 0.16,
      0.27, 0.04, 0.32,
    ]],
  ] as const)("matches emitted mesh triangles for an adversarial %s field", (_name, elevations) => {
    const terrain = reliefGrid(elevations);
    const verticalScale = 120;
    const mesh = maskedMesh(terrain, verticalScale);
    const points = [
      { x: 15, y: 15 }, // center and emitted diagonal
      { x: 17.5, y: 12.5 }, // top-right triangle
      { x: 12.5, y: 17.5 }, // bottom-left triangle
      { x: 10, y: 15 }, // internal tile boundary
      { x: 20, y: 20 }, // shared corner
      { x: 0, y: 0 }, // outer top-left boundary
      { x: 30, y: 30 }, // outer bottom-right boundary
    ] as const;

    for (const point of points) {
      expect(discoveredReliefSurfaceHeightAt(terrain, point, verticalScale, false))
        .toBeCloseTo(meshTriangleHeightAt(mesh, terrain, point), 10);
    }
  });

  it("keeps hidden neighboring authority out of corner averages and interpolation", () => {
    const discoveries = [
      0, 0, 0,
      0, 1, 0,
      0, 0, 0,
    ];
    const low = reliefGrid([
      0.01, 0.02, 0.03,
      0.04, 0.64, 0.05,
      0.06, 0.07, 0.08,
    ], { discoveries });
    const high = reliefGrid([
      0.99, 0.98, 0.97,
      0.96, 0.64, 0.95,
      0.94, 0.93, 0.92,
    ], { discoveries });
    const verticalScale = 90;
    const points = [
      { x: 15, y: 15 },
      { x: 17.5, y: 12.5 },
      { x: 12.5, y: 17.5 },
      { x: 10, y: 15 },
    ];

    for (const point of points) {
      const lowHeight = discoveredReliefSurfaceHeightAt(low, point, verticalScale, false);
      const highHeight = discoveredReliefSurfaceHeightAt(high, point, verticalScale, false);
      expect(lowHeight).toBeCloseTo(meshTriangleHeightAt(maskedMesh(low, verticalScale), low, point), 10);
      expect(highHeight).toBeCloseTo(meshTriangleHeightAt(maskedMesh(high, verticalScale), high, point), 10);
      expect(highHeight).toBeCloseTo(lowHeight, 12);
    }
  });

  it("matches the rendered flat local water sheet without exposing hidden depth", () => {
    const elevations = [
      0.62, 0.78, 0.91,
      0.55, 0.12, 0.84,
      0.73, 0.96, 0.68,
    ];
    const depths = [
      0, 0, 0,
      0, 0.2, 0,
      0, 0, 0,
    ];
    const terrain = reliefGrid(elevations, { depths });
    const verticalScale = 100;
    const mesh = maskedMesh(terrain, verticalScale);
    const center = { x: 15, y: 15 };
    const waterLevel = meshTriangleHeightAt(mesh, terrain, center) + 20;
    const points = [
      center,
      { x: 17.5, y: 12.5 },
      { x: 12.5, y: 17.5 },
    ];

    for (const point of points) {
      const land = meshTriangleHeightAt(mesh, terrain, point);
      expect(discoveredReliefSurfaceHeightAt(terrain, point, verticalScale, true))
        .toBeCloseTo(Math.max(land, waterLevel), 10);
    }
    const dryPoint = { x: 25, y: 15 };
    expect(discoveredReliefSurfaceHeightAt(terrain, dryPoint, verticalScale, true))
      .toBeCloseTo(meshTriangleHeightAt(mesh, terrain, dryPoint), 10);

    const hiddenDepthLow = reliefGrid(elevations, {
      depths,
      discoveries: [1, 1, 1, 1, 0, 1, 1, 1, 1],
    });
    const hiddenDepthHigh = reliefGrid(elevations, {
      depths: depths.map((depth, index) => index === 4 ? 0.95 : depth),
      discoveries: [1, 1, 1, 1, 0, 1, 1, 1, 1],
    });
    expect(discoveredReliefSurfaceHeightAt(hiddenDepthLow, center, verticalScale, true))
      .toBeCloseTo(discoveredReliefSurfaceHeightAt(hiddenDepthHigh, center, verticalScale, true), 12);
  });
});

describe("Relief discovery signature memo", () => {
  it("hashes a stable immutable tile array once across animation frames and wrappers", () => {
    const tiles = [tile({ discovered: 0 }), tile({ discovered: 1 })] as const;
    const compute = vi.fn(reliefDiscoverySignature);
    const signature = createReliefDiscoverySignatureMemo(compute);
    const first = grid(tiles);

    expect(signature(first)).toBe(signature(first));
    expect(signature({ ...first, revision: "new-wrapper" })).toBe(signature(first));
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("re-hashes a replacement tile array so discovery changes cannot go stale", () => {
    const compute = vi.fn(reliefDiscoverySignature);
    const signature = createReliefDiscoverySignatureMemo(compute);
    const hidden = grid([tile({ discovered: 0 })]);
    const revealed = { ...hidden, tiles: [tile({ discovered: 1 })] };

    expect(signature(hidden)).not.toBe(signature(revealed));
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
