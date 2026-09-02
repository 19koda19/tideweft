import { describe, expect, it } from "vitest";

import {
  buildReliefWaterMaterialBatches,
  reliefWaterOpacity,
} from "./reliefWaterBatches";
import type { TerrainGridView, TerrainTileView } from "./types";

const climate = {
  rainfall: 0.65,
  heat: 0.35,
  salinity: 0.3,
  exposure: 0.45,
  magicalWater: 0.75,
} as const;

function grid(tiles: readonly TerrainTileView[], columns = tiles.length): TerrainGridView {
  return {
    columns,
    rows: Math.ceil(tiles.length / columns),
    tileSize: 24,
    origin: { x: 0, y: 0 },
    tiles,
    revision: "water-batches",
  };
}

function tile(changes: Partial<TerrainTileView> = {}): TerrainTileView {
  return {
    kind: "channel",
    elevation: 0.2,
    waterDepth: 0.5,
    discovered: 1,
    ...changes,
  };
}

describe("Relief water material batches", () => {
  it("groups chart-colored water while omitting dry and uncharted cells", () => {
    const source = grid([
      tile({ waterDepth: 0.18 }),
      tile({ waterDepth: 0.18 }),
      tile({ waterDepth: 0 }),
      tile({ waterDepth: 0.92, biome: "glimmerfen", climate, discovered: 0 }),
      tile({ waterDepth: 0.52, biome: "rain-meadow", climate }),
      tile({ waterDepth: 0.52, biome: "glimmerfen", climate }),
    ], 3);
    const batches = buildReliefWaterMaterialBatches(source, 0.7);
    const cells = batches.flatMap((batch) => batch.cells);

    expect(cells).toHaveLength(4);
    expect(cells).toContainEqual({ column: 0, row: 0 });
    expect(cells).toContainEqual({ column: 1, row: 0 });
    expect(cells).not.toContainEqual({ column: 2, row: 0 });
    expect(cells).not.toContainEqual({ column: 0, row: 1 });
    expect(new Set(batches.map((batch) => batch.material.biome).filter(Boolean)))
      .toEqual(new Set(["rain-meadow", "glimmerfen"]));
    expect(batches.every((batch) => batch.material.color !== "#49bfd0")).toBe(true);

    const legacyShallows = batches.find((batch) => batch.material.biome === undefined);
    expect(legacyShallows?.cells).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
    ]);
  });

  it("honors viewport bounds and clamps them safely", () => {
    const source = grid(Array.from({ length: 9 }, () => tile()), 3);
    const batches = buildReliefWaterMaterialBatches(source, 0.5, {
      firstColumn: 1,
      lastColumn: 2,
      firstRow: 1,
      lastRow: 2,
    });
    expect(batches.flatMap((batch) => batch.cells)).toEqual([
      { column: 1, row: 1 },
      { column: 2, row: 1 },
      { column: 1, row: 2 },
      { column: 2, row: 2 },
    ]);
    expect(buildReliefWaterMaterialBatches(source, 0.5, {
      firstColumn: 2,
      lastColumn: 0,
      firstRow: 0,
      lastRow: 2,
    })).toEqual([]);
  });

  it("changes the composed Relief material with the live public tide", () => {
    const source = grid([tile({ biome: "tide-channel", climate })]);
    const low = buildReliefWaterMaterialBatches(source, 0.05)[0]?.material;
    const high = buildReliefWaterMaterialBatches(source, 0.95)[0]?.material;
    expect(low?.color).not.toBe(high?.color);
    expect(low?.tideLevel).toBe(1 / 16);
    expect(high?.tideLevel).toBe(15 / 16);
  });

  it("keeps Relief water dark and makes deeper bands strictly more opaque", () => {
    const source = grid([
      tile({ waterDepth: 0.2 }),
      tile({ waterDepth: 0.5 }),
      tile({ waterDepth: 0.9 }),
    ]);
    const materials = buildReliefWaterMaterialBatches(source, 0.5)
      .map((batch) => batch.material);
    const shallow = materials.find((material) => material.band === "shallows");
    const channel = materials.find((material) => material.band === "channel");
    const deep = materials.find((material) => material.band === "deep");

    expect(shallow && reliefWaterOpacity(shallow)).toBeGreaterThanOrEqual(236);
    expect(channel && reliefWaterOpacity(channel)).toBeGreaterThan(reliefWaterOpacity(shallow!));
    expect(deep && reliefWaterOpacity(deep)).toBeGreaterThan(reliefWaterOpacity(channel!));
  });

  it("still omits hidden water and bounds the quantized partial-discovery alpha", () => {
    const barelySeen = buildReliefWaterMaterialBatches(
      grid([tile({ waterDepth: 0.95, discovered: 0.04 })]),
      0.5,
    )[0]?.material;
    const subBand = buildReliefWaterMaterialBatches(
      grid([tile({ waterDepth: 0.95, discovered: 0.01 })]),
      0.5,
    );
    const hidden = buildReliefWaterMaterialBatches(
      grid([tile({ waterDepth: 0.95, discovered: 0 })]),
      0.5,
    );

    expect(barelySeen).toBeDefined();
    expect(reliefWaterOpacity(barelySeen!)).toBeLessThanOrEqual(60);
    expect(subBand).toEqual([]);
    expect(hidden).toEqual([]);
  });

  it("does not render live water outside the current sensory footprint", () => {
    const batches = buildReliefWaterMaterialBatches(grid([
      tile({ currentVisibility: 0 }),
      tile({ currentVisibility: 0.5 }),
      tile({ currentVisibility: 1 }),
    ]), 0.5);
    expect(batches.flatMap((batch) => batch.cells).sort((left, right) => left.column - right.column))
      .toEqual([
      { column: 1, row: 0 },
      { column: 2, row: 0 },
      ]);
  });

  it("fades explored water through the same bounded sensory bands as terrain", () => {
    const batches = buildReliefWaterMaterialBatches(grid([
      tile({ currentVisibility: 0.06 }),
      tile({ currentVisibility: 0.3 }),
      tile({ currentVisibility: 0.74 }),
      tile({ currentVisibility: 1 }),
    ]), 0.5);
    const byColumn = new Map(
      batches.flatMap((batch) => batch.cells.map((cell) => [cell.column, batch.material] as const)),
    );
    expect(byColumn.get(0)?.visibility).toBe(1 / 16);
    expect(byColumn.get(1)?.visibility).toBe(5 / 16);
    expect(byColumn.get(2)?.visibility).toBe(12 / 16);
    expect(byColumn.get(3)?.visibility).toBe(1);
    expect(reliefWaterOpacity(byColumn.get(0)!)).toBeLessThan(
      reliefWaterOpacity(byColumn.get(1)!),
    );
    expect(reliefWaterOpacity(byColumn.get(1)!)).toBeLessThan(
      reliefWaterOpacity(byColumn.get(2)!),
    );
  });

  it("renders currently seen uncharted water without retaining it outside sight", () => {
    const seen = buildReliefWaterMaterialBatches(grid([
      tile({ discovered: 0, currentVisibility: 1, waterDepth: 0.5 }),
      tile({ discovered: 0, currentVisibility: 0, waterDepth: 0.5 }),
    ]), 0.5);

    expect(seen.flatMap((batch) => batch.cells)).toEqual([{ column: 0, row: 0 }]);
    expect(seen[0]?.material.visibility).toBe(1);
  });

  it("batches remote unsounded water identically across raw depth mutations", () => {
    const remoteMaterial = (waterDepth: number, depthKnown = 0) =>
      buildReliefWaterMaterialBatches(grid([tile({
        waterDepth,
        depthKnown,
        currentVisibility: 1,
        currentDetailVisibility: 0,
      })]), 0.5)[0]?.material;

    expect(remoteMaterial(0.08)).toEqual(remoteMaterial(0.96));
    expect(remoteMaterial(0.08)).toMatchObject({
      depth: 0.5,
      depthDisclosed: false,
      band: "channel",
    });
    expect(remoteMaterial(0.08, 1)?.band).toBe("shallows");
    expect(remoteMaterial(0.96, 1)?.band).toBe("deep");
  });
});
