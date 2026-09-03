import { describe, expect, it } from "vitest";

import {
  chartTerrainDecorationHash01,
  reliefTerrainDecorationHash01,
  terrainTileGlobalCoordinate,
} from "./terrainDecoration";

const legacyChartHash = (x: number, y: number, salt: number): number => {
  let value = Math.imul((x | 0) ^ 0x45d9_f3b, 0x45d9_f3b);
  value ^= Math.imul((y | 0) ^ salt, 0x27d4_eb2d);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_295;
};

const legacyReliefHash = (x: number, y: number, salt: number): number => {
  let value = Math.imul((x | 0) ^ salt, 0x45d9_f3b);
  value ^= Math.imul((y | 0) ^ 0x27d4_eb2d, 0x119d_e1f3);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_295;
};

describe("global terrain decoration identity", () => {
  it("preserves exact finite region-zero Chart and Relief hashes", () => {
    const finite = {};
    const explicitOrigin = { worldTileOrigin: { x: 0, y: 0 } };
    for (const [column, row, salt] of [
      [0, 0, 7],
      [47, 35, 13],
      [95, 71, 0x6269_6f6d],
    ] as const) {
      expect(chartTerrainDecorationHash01(finite, column, row, salt))
        .toBe(legacyChartHash(column, row, salt));
      expect(chartTerrainDecorationHash01(explicitOrigin, column, row, salt))
        .toBe(legacyChartHash(column, row, salt));
      expect(reliefTerrainDecorationHash01(finite, column, row, salt))
        .toBe(legacyReliefHash(column, row, salt));
      expect(reliefTerrainDecorationHash01(explicitOrigin, column, row, salt))
        .toBe(legacyReliefHash(column, row, salt));
    }
  });

  it("keeps one overlap tile identical through east and west floating origins", () => {
    const west = { worldTileOrigin: { x: -1, y: -1 } };
    const east = { worldTileOrigin: { x: 95, y: -1 } };
    const westLocal = { column: 97, row: 24 };
    const eastLocal = { column: 1, row: 24 };

    expect(terrainTileGlobalCoordinate(west, westLocal.column, westLocal.row)).toEqual({
      x: 96,
      y: 23,
    });
    expect(terrainTileGlobalCoordinate(east, eastLocal.column, eastLocal.row)).toEqual({
      x: 96,
      y: 23,
    });
    expect(chartTerrainDecorationHash01(west, westLocal.column, westLocal.row, 0x7465_7874))
      .toBe(chartTerrainDecorationHash01(east, eastLocal.column, eastLocal.row, 0x7465_7874));
    expect(reliefTerrainDecorationHash01(west, westLocal.column, westLocal.row, 0x6269_6f6d))
      .toBe(reliefTerrainDecorationHash01(east, eastLocal.column, eastLocal.row, 0x6269_6f6d));
  });

  it("retains signed and extreme safe-coordinate identity without 32-bit wrapping", () => {
    const target = { x: -8_000_000_000_000_000, y: 7_999_999_999_999_900 };
    const first = {
      grid: { worldTileOrigin: { x: target.x - 40, y: target.y - 30 } },
      column: 40,
      row: 30,
    };
    const second = {
      grid: { worldTileOrigin: { x: target.x - 4, y: target.y - 3 } },
      column: 4,
      row: 3,
    };
    const wrappedAlias = {
      worldTileOrigin: { x: target.x + 0x1_0000_0000, y: target.y },
    };

    expect(terrainTileGlobalCoordinate(first.grid, first.column, first.row)).toEqual(target);
    expect(terrainTileGlobalCoordinate(second.grid, second.column, second.row)).toEqual(target);
    expect(chartTerrainDecorationHash01(first.grid, first.column, first.row, 7))
      .toBe(chartTerrainDecorationHash01(second.grid, second.column, second.row, 7));
    expect(reliefTerrainDecorationHash01(first.grid, first.column, first.row, 13))
      .toBe(reliefTerrainDecorationHash01(second.grid, second.column, second.row, 13));
    expect(chartTerrainDecorationHash01({ worldTileOrigin: target }, 0, 0, 7))
      .not.toBe(chartTerrainDecorationHash01(wrappedAlias, 0, 0, 7));
    expect(reliefTerrainDecorationHash01({ worldTileOrigin: target }, 0, 0, 13))
      .not.toBe(reliefTerrainDecorationHash01(wrappedAlias, 0, 0, 13));
  });
});
