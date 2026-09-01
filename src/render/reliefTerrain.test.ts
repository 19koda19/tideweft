import { describe, expect, it, vi } from "vitest";

import {
  createReliefDiscoverySignatureMemo,
  discoveredReliefSurfaceHeightAt,
  maskReliefTileForDiscovery,
  reliefDiscoveryVisibility,
  reliefDiscoverySignature,
} from "./reliefTerrain";
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

describe("discovery-masked Relief surfaces", () => {
  it("cannot distinguish authoritative heights in undiscovered tiles", () => {
    const hiddenLow = grid([tile({ elevation: 0.1, waterDepth: 0.05, discovered: 0 })]);
    const hiddenHigh = grid([tile({ elevation: 0.95, waterDepth: 0.9, discovered: 0 })]);

    expect(discoveredReliefSurfaceHeightAt(hiddenLow, { x: 5, y: 5 }, 100, true)).toBe(0);
    expect(discoveredReliefSurfaceHeightAt(hiddenHigh, { x: 5, y: 5 }, 100, true)).toBe(0);
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
