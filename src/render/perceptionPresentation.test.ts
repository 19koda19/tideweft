import { describe, expect, it } from "vitest";

import type { TerrainGridView, TerrainTileView } from "./types";
import {
  currentSettlementVisibility,
  currentTerrainVisibility,
  isDirectlyPerceived,
  isCurrentlyPerceived,
  perceptionVisibilityAt,
} from "./perceptionPresentation";

const tile = (currentVisibility?: 0 | 0.5 | 1): TerrainTileView => ({
  kind: "meadow",
  elevation: 0.2,
  ...(currentVisibility === undefined ? {} : { currentVisibility }),
});

const grid = (tiles: readonly TerrainTileView[]): TerrainGridView => ({
  columns: 2,
  rows: 2,
  tileSize: 10,
  origin: { x: -10, y: 20 },
  tiles,
  revision: 1,
});

describe("perception presentation boundary", () => {
  it("keeps legacy fixtures visible and honors exact hidden/peripheral/direct grades", () => {
    expect(currentTerrainVisibility(tile())).toBe(1);
    expect(currentTerrainVisibility(tile(), true)).toBe(0);
    expect(currentTerrainVisibility(tile(0))).toBe(0);
    expect(currentTerrainVisibility(tile(0.5))).toBe(0.5);
    expect(currentTerrainVisibility(tile(1))).toBe(1);
    expect(currentTerrainVisibility(undefined)).toBe(0);
    expect(currentSettlementVisibility({
      id: "known",
      name: "Known",
      position: { x: 0, y: 0 },
      population: 1,
      status: "steady",
      connection: 0,
      stress: 0,
      currentVisibility: 0,
    })).toBe(0);
  });

  it("samples signed-origin tiles and fails out-of-grid or malformed points closed", () => {
    const view = grid([tile(0), tile(0.5), tile(1), tile(0)]);
    expect(perceptionVisibilityAt(view, { x: -5, y: 25 })).toBe(0);
    expect(perceptionVisibilityAt(view, { x: 5, y: 25 })).toBe(0.5);
    expect(perceptionVisibilityAt(view, { x: -5, y: 35 })).toBe(1);
    expect(isCurrentlyPerceived(view, { x: -5, y: 35 })).toBe(true);
    expect(isDirectlyPerceived(view, { x: 5, y: 25 })).toBe(false);
    expect(isDirectlyPerceived(view, { x: -5, y: 35 })).toBe(true);
    expect(isCurrentlyPerceived(view, { x: 10, y: 40 })).toBe(false);
    expect(perceptionVisibilityAt(view, { x: Number.NaN, y: 25 })).toBe(0);
  });
});
