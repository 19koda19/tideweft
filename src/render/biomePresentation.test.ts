import { describe, expect, it } from "vitest";

import { BIOME_IDS, type BiomeId } from "../sim/public";
import {
  BIOME_PRESENTATION,
  biomeEnvironmentalEmphasis,
  visibleBiomePresentation,
} from "./biomePresentation";
import type { TerrainTileView } from "./types";

const biomeTile = (
  biome: BiomeId,
  changes: Partial<TerrainTileView> = {},
): TerrainTileView => ({
  kind: "meadow",
  biome,
  elevation: 0.5,
  discovered: 1,
  climate: {
    rainfall: 0.2,
    heat: 0.3,
    salinity: 0.4,
    exposure: 0.5,
    magicalWater: 0.6,
  },
  ...changes,
});

describe("shared biome presentation", () => {
  it("gives all seven biomes distinct colors and redundant motifs", () => {
    const entries = BIOME_IDS.map((id) => BIOME_PRESENTATION[id]);
    expect(entries.map((entry) => entry.id)).toEqual(BIOME_IDS);
    expect(new Set(entries.map((entry) => entry.chartColor)).size).toBe(BIOME_IDS.length);
    expect(new Set(entries.map((entry) => entry.reliefColor)).size).toBe(BIOME_IDS.length);
    expect(new Set(entries.map((entry) => entry.motif)).size).toBe(BIOME_IDS.length);
  });

  it("never reveals a biome motif on an undiscovered tile", () => {
    expect(visibleBiomePresentation(biomeTile("glimmerfen", { discovered: 0 }))).toBeUndefined();
    expect(visibleBiomePresentation(biomeTile("glimmerfen", { discovered: 0.01 }))?.id)
      .toBe("glimmerfen");
    expect(visibleBiomePresentation({ kind: "meadow", elevation: 0.5, discovered: 1 }))
      .toBeUndefined();
  });

  it("uses each biome's relevant bounded climate signal", () => {
    expect(biomeEnvironmentalEmphasis(biomeTile("brine-flat"))).toBe(0.4);
    expect(biomeEnvironmentalEmphasis(biomeTile("rain-meadow"))).toBe(0.2);
    expect(biomeEnvironmentalEmphasis(biomeTile("sun-meadow"))).toBe(0.3);
    expect(biomeEnvironmentalEmphasis(biomeTile("wind-ridge"))).toBe(0.5);
    expect(biomeEnvironmentalEmphasis(biomeTile("glimmerfen"))).toBe(0.6);
    expect(biomeEnvironmentalEmphasis(biomeTile("wind-ridge", {
      climate: {
        rainfall: -4,
        heat: 2,
        salinity: Number.NaN,
        exposure: 9,
        magicalWater: Number.POSITIVE_INFINITY,
      },
    }))).toBe(1);
  });
});
