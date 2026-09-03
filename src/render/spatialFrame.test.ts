import { describe, expect, it } from "vitest";

import {
  captureTerrainSpatialFrame,
  terrainSpatialFrameDelta,
  terrainSpatialFramesEqual,
} from "./spatialFrame";
import type { TerrainGridView } from "./types";

function grid(
  worldTileOrigin: { readonly x: number; readonly y: number } | undefined,
  localOrigin = { x: 0, y: 0 },
  tileSize = 24,
): TerrainGridView {
  return {
    columns: 1,
    rows: 1,
    tileSize,
    origin: localOrigin,
    ...(worldTileOrigin ? { worldTileOrigin } : {}),
    tiles: [],
    revision: "frame-test",
  };
}

describe("terrain spatial-frame translation", () => {
  it("maps the same canonical point through signed axial and diagonal origin shifts", () => {
    const prior = captureTerrainSpatialFrame(grid({ x: -1_000_000, y: 2_000_000 }));
    const axial = captureTerrainSpatialFrame(grid({ x: -999_984, y: 2_000_000 }));
    const diagonal = captureTerrainSpatialFrame(grid({ x: -999_968, y: 1_999_968 }));

    expect(terrainSpatialFrameDelta(prior, axial)).toEqual({ x: -384, y: 0 });
    expect(terrainSpatialFrameDelta(prior, diagonal)).toEqual({ x: -768, y: 768 });
  });

  it("includes a local grid-origin translation and aggregates skipped frames", () => {
    const prior = captureTerrainSpatialFrame(grid({ x: 12, y: -30 }, { x: 8, y: -4 }));
    const next = captureTerrainSpatialFrame(grid({ x: 60, y: 2 }, { x: -10, y: 20 }));

    expect(terrainSpatialFrameDelta(prior, next)).toEqual({
      x: -1_170,
      y: -744,
    });
    expect(terrainSpatialFramesEqual(prior, next)).toBe(false);
    expect(terrainSpatialFramesEqual(next, next)).toBe(true);
  });

  it("fails closed when absolute metadata is absent, malformed, or changes scale", () => {
    const valid = captureTerrainSpatialFrame(grid({ x: 0, y: 0 }));
    expect(captureTerrainSpatialFrame(grid(undefined))).toBeNull();
    expect(captureTerrainSpatialFrame(grid({ x: 0.5, y: 0 }))).toBeNull();
    expect(terrainSpatialFrameDelta(valid, captureTerrainSpatialFrame(grid({ x: 1, y: 0 }, { x: 0, y: 0 }, 18))))
      .toBeNull();
  });
});
