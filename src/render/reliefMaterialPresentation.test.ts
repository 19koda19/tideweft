import { describe, expect, it } from "vitest";

import {
  RELIEF_TERRAIN_ALBEDO,
  reliefSurfaceMaterialColor,
  reliefTerrainKindIsWater,
} from "./reliefMaterialPresentation";
import type { TerrainKind } from "./types";

const rgb = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

describe("Relief authored ground materials", () => {
  it("keeps every dry terrain albedo out of the cyan water family", () => {
    const dryKinds = (Object.keys(RELIEF_TERRAIN_ALBEDO) as TerrainKind[])
      .filter((kind) => !reliefTerrainKindIsWater(kind));
    for (const kind of dryKinds) {
      const [red, green, blue] = rgb(RELIEF_TERRAIN_ALBEDO[kind]);
      expect(blue, `${kind} blue channel`).toBeLessThan(Math.max(red, green));
      expect(red + green - blue * 2, `${kind} earthy separation`).toBeGreaterThan(20);
    }
  });

  it("renders the reported Brine Flat / Shell Sandbar as warm ground, not mint", () => {
    const brine = reliefSurfaceMaterialColor({
      kind: "sandbar",
      biome: "brine-flat",
      environment: 0.5,
      visibility: 1,
      fog: 0,
      currentVisibility: 1,
    });
    const water = reliefSurfaceMaterialColor({
      kind: "channel",
      biome: "tide-channel",
      environment: 0.5,
      visibility: 1,
      fog: 0,
      currentVisibility: 1,
    });
    const [brineRed, brineGreen, brineBlue] = rgb(brine);
    const [waterRed, waterGreen, waterBlue] = rgb(water);
    expect(brineRed).toBeGreaterThan(brineGreen);
    expect(brineGreen).toBeGreaterThan(brineBlue);
    expect(waterBlue).toBeGreaterThan(waterRed);
    expect(Math.hypot(
      brineRed - waterRed,
      brineGreen - waterGreen,
      brineBlue - waterBlue,
    )).toBeGreaterThan(80);
  });

  it("has the same authored color on the first and later frames", () => {
    const input = {
      kind: "mudflat",
      biome: "brine-flat",
      environment: 0.75,
      visibility: 1,
      fog: 0.1,
      currentVisibility: 1,
    } as const;
    expect(reliefSurfaceMaterialColor(input)).toBe(reliefSurfaceMaterialColor(input));
  });
});
