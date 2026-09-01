import { describe, expect, it } from "vitest";

import {
  WATER_PRESENTATION_PALETTE,
  quantizeWaterPresentation,
  visibleWaterPresentation,
} from "./waterPresentation";
import type { BiomeId, TerrainTileView } from "./types";

function waterTile(
  waterDepth: number,
  changes: Partial<TerrainTileView> = {},
): TerrainTileView {
  return {
    kind: "channel",
    elevation: 0.2,
    waterDepth,
    discovered: 1,
    ...changes,
  };
}

function biomeWater(biome: BiomeId): TerrainTileView {
  return waterTile(0.52, {
    biome,
    climate: {
      rainfall: 0.72,
      heat: 0.38,
      salinity: 0.44,
      exposure: 0.61,
      magicalWater: 0.83,
    },
  });
}

describe("shared visible-water presentation", () => {
  it("uses the established Chart palette for shallow, channel, and deep water", () => {
    expect(visibleWaterPresentation(waterTile(0.2))?.baseColor)
      .toBe(WATER_PRESENTATION_PALETTE.shallows);
    expect(visibleWaterPresentation(waterTile(0.5))?.baseColor)
      .toBe(WATER_PRESENTATION_PALETTE.channel);
    expect(visibleWaterPresentation(waterTile(0.9))?.baseColor)
      .toBe(WATER_PRESENTATION_PALETTE.deep);
    expect(visibleWaterPresentation(waterTile(0.2))?.band).toBe("shallows");
    expect(visibleWaterPresentation(waterTile(0.5))?.band).toBe("channel");
    expect(visibleWaterPresentation(waterTile(0.9))?.band).toBe("deep");
  });

  it("adds only public tide and discovered biome variation", () => {
    const rainLow = visibleWaterPresentation(biomeWater("rain-meadow"), { tideLevel: 0.1 });
    const rainHigh = visibleWaterPresentation(biomeWater("rain-meadow"), { tideLevel: 0.9 });
    const glimmerHigh = visibleWaterPresentation(biomeWater("glimmerfen"), { tideLevel: 0.9 });

    expect(rainLow?.biome).toBe("rain-meadow");
    expect(rainLow?.color).not.toBe(rainHigh?.color);
    expect(rainHigh?.color).not.toBe(glimmerHigh?.color);
    expect(rainHigh?.accentColor).not.toBe(glimmerHigh?.accentColor);
    expect(rainHigh?.tideLift).toBeGreaterThan(rainLow?.tideLift ?? 1);
  });

  it("never leaks water or biome bands across the discovery mask", () => {
    expect(visibleWaterPresentation(biomeWater("glimmerfen"), { tideLevel: 1 }))
      .toBeDefined();
    expect(visibleWaterPresentation({
      ...biomeWater("glimmerfen"),
      discovered: 0,
    }, { tideLevel: 1 })).toBeUndefined();

    const barelySeen = visibleWaterPresentation({
      ...biomeWater("glimmerfen"),
      waterDepth: 0.95,
      discovered: 0.01,
    });
    expect(barelySeen?.band).toBe("shallows");
    expect(barelySeen?.depth).toBeLessThan(0.05);
    expect(barelySeen?.opacity).toBeLessThan(2);
  });

  it("uses the live tide fallback only when projected depth is absent", () => {
    const missing: TerrainTileView = {
      kind: "channel",
      elevation: 0.2,
      discovered: 1,
    };
    expect(visibleWaterPresentation(missing, { derivedDepth: 0.62 })?.depth).toBe(0.62);
    expect(visibleWaterPresentation(waterTile(0), { derivedDepth: 0.62 })).toBeUndefined();
  });

  it("quantizes Relief signals while retaining the shared composed color contract", () => {
    const source = visibleWaterPresentation(biomeWater("reed-marsh"), { tideLevel: 0.63 });
    if (!source) throw new Error("fixture did not create visible water");
    const material = quantizeWaterPresentation(source, 4);

    expect(material.depth * 4).toBe(Math.round(material.depth * 4));
    expect(material.visibility * 4).toBe(Math.round(material.visibility * 4));
    expect(material.environment * 4).toBe(Math.round(material.environment * 4));
    expect(material.tideLevel * 4).toBe(Math.round(material.tideLevel * 4));
    expect(material.biome).toBe("reed-marsh");
    expect(material.color).toMatch(/^#[0-9a-f]{6}$/u);
    expect(material.opacity).toBeGreaterThan(0);
    expect(material.opacity).toBeLessThanOrEqual(200);
  });
});
