import { describe, expect, it } from "vitest";

import {
  RELIEF_WATER_PALETTE,
  buildReliefWaterMaterialBatches,
  reliefWaterOpacity,
  reliefWaterSurfaceColor,
} from "./reliefWaterBatches";
import type { BiomeId, TerrainGridView, TerrainTileView } from "./types";

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

function rgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function brightness(hex: string): number {
  const [red, green, blue] = rgb(hex);
  return red + green + blue;
}

function expectRecognizablyBlue(hex: string, context: string): void {
  const [red, green, blue] = rgb(hex);
  expect(blue - green, `${context}: blue/green separation for ${hex}`).toBeGreaterThanOrEqual(14);
  expect(green - red, `${context}: green/red separation for ${hex}`).toBeGreaterThanOrEqual(12);
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

  it("keeps Relief water opaque over warm ground and makes depth bands distinct blue shades", () => {
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

    expect(reliefWaterOpacity(shallow!)).toBe(255);
    expect(reliefWaterOpacity(channel!)).toBe(255);
    expect(reliefWaterOpacity(deep!)).toBe(255);
    const shallowBlue = reliefWaterSurfaceColor(shallow!);
    const channelBlue = reliefWaterSurfaceColor(channel!);
    const deepBlue = reliefWaterSurfaceColor(deep!);
    expect(new Set([shallowBlue, channelBlue, deepBlue]).size).toBe(3);
    expect(brightness(shallowBlue)).toBeGreaterThan(brightness(channelBlue));
    expect(brightness(channelBlue)).toBeGreaterThan(brightness(deepBlue));
    expectRecognizablyBlue(shallowBlue, "shallows");
    expectRecognizablyBlue(channelBlue, "channel");
    expectRecognizablyBlue(deepBlue, "deep");
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
    expect(reliefWaterOpacity(barelySeen!)).toBe(255);
    expect(brightness(reliefWaterSurfaceColor(barelySeen!))).toBeLessThan(
      brightness(RELIEF_WATER_PALETTE.deep),
    );
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
    const colors = [0, 1, 2, 3].map((column) =>
      reliefWaterSurfaceColor(byColumn.get(column)!)
    );
    expect(colors.every((color, index) => {
      expectRecognizablyBlue(color, `sensory band ${index}`);
      return true;
    })).toBe(true);
    expect(brightness(colors[0]!)).toBeLessThan(brightness(colors[1]!));
    expect(brightness(colors[1]!)).toBeLessThan(brightness(colors[2]!));
    expect(brightness(colors[2]!)).toBeLessThan(brightness(colors[3]!));
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

  it("keeps every biome, climate extreme, tide, and sensory band in the blue family", () => {
    const biomes: readonly BiomeId[] = [
      "tide-channel",
      "brine-flat",
      "reed-marsh",
      "rain-meadow",
      "sun-meadow",
      "wind-ridge",
      "glimmerfen",
    ];
    const climates = [
      { rainfall: 0, heat: 0, salinity: 0, exposure: 0, magicalWater: 0 },
      { rainfall: 1, heat: 1, salinity: 1, exposure: 1, magicalWater: 1 },
    ] as const;
    const depths = [0.2, 0.5, 0.9] as const;
    const visibilityBands = [1 / 16, 0.25, 0.5, 0.75, 1] as const;
    const tides = [0, 0.5, 1] as const;

    for (const biome of biomes) {
      for (const biomeClimate of climates) {
        for (const waterDepth of depths) {
          for (const currentVisibility of visibilityBands) {
            for (const tide of tides) {
              const material = buildReliefWaterMaterialBatches(grid([tile({
                biome,
                climate: biomeClimate,
                waterDepth,
                currentVisibility,
                currentDetailVisibility: 1,
              })]), tide)[0]?.material;
              if (!material) throw new Error("visible water fixture produced no material");
              const color = reliefWaterSurfaceColor(material);
              expectRecognizablyBlue(
                color,
                `${biome} depth ${waterDepth} visibility ${currentVisibility} tide ${tide}`,
              );
              expect(reliefWaterOpacity(material)).toBe(255);
            }
          }
        }
      }
    }
  });

  it("uses the same neutral blue for unsounded biome water regardless of raw depth", () => {
    const color = (waterDepth: number) => {
      const material = buildReliefWaterMaterialBatches(grid([tile({
        biome: "sun-meadow",
        climate,
        waterDepth,
        currentVisibility: 1,
        currentDetailVisibility: 0,
        depthKnown: 0,
      })]), 0.5)[0]?.material;
      if (!material) throw new Error("unsounded water fixture produced no material");
      return reliefWaterSurfaceColor(material);
    };
    expect(color(0.05)).toBe(color(0.98));
    expectRecognizablyBlue(color(0.05), "unsounded neutral water");
  });
});
