import { describe, expect, it } from "vitest";
import type { TerrainTileView } from "../sim/types";
import {
  CORE_WILDLIFE_BASE_MOVE_STEP_UNITS,
  coreWildlifeMaximumStepUnits,
  coreWildlifeTraversabilityCell,
} from "./coreWildlifeLocomotionProfile";
import { ADRIFT_STAND_DEPTH } from "./adrift";

function tile(overrides: Partial<TerrainTileView> = {}): TerrainTileView {
  return {
    index: 0,
    x: 0,
    y: 0,
    terrain: "meadow",
    elevation: 400_000,
    moisture: 400_000,
    roughness: 400_000,
    baseTravelCost: 500_000,
    traceStrength: 0,
    waterDepth: 0,
    ...overrides,
  };
}

describe("core wildlife locomotion profiles", () => {
  it("keeps every established terrestrial species on the exact base cost/step", () => {
    for (const species of ["deer", "black-bear", "domestic-cat"] as const) {
      expect(coreWildlifeTraversabilityCell(species, tile()).travelCost).toBe(500_000);
      expect(coreWildlifeMaximumStepUnits(species, "flee"))
        .toBe(CORE_WILDLIFE_BASE_MOVE_STEP_UNITS);
    }
  });

  it("makes real damp rough terrain a rabbit route advantage rather than a private map", () => {
    const cover = tile({ terrain: "marsh", moisture: 850_000, roughness: 700_000 });
    const ridge = tile({ terrain: "ridge", moisture: 150_000, roughness: 700_000 });
    expect(coreWildlifeTraversabilityCell("marsh-rabbit", cover).travelCost)
      .toBeLessThan(coreWildlifeTraversabilityCell("marsh-fox", cover).travelCost);
    expect(coreWildlifeTraversabilityCell("marsh-rabbit", cover).travelCost)
      .toBeLessThan(coreWildlifeTraversabilityCell("marsh-rabbit", ridge).travelCost);
  });

  it("gives fleeing rabbits a bounded cadence and foxes a finite pursuit gait", () => {
    expect(coreWildlifeMaximumStepUnits("marsh-rabbit", "flee"))
      .toBeGreaterThan(coreWildlifeMaximumStepUnits("marsh-rabbit", "forage"));
    expect(coreWildlifeMaximumStepUnits("marsh-fox", "pursue"))
      .toBeGreaterThan(coreWildlifeMaximumStepUnits("marsh-fox", "observe"));
    expect(coreWildlifeMaximumStepUnits("marsh-rabbit", "flee")).toBeLessThan(1_000);
    expect(coreWildlifeMaximumStepUnits("marsh-fox", "pursue")).toBeLessThan(1_000);
  });

  it("rejects nonstandable water identically before gait can matter", () => {
    for (const species of ["marsh-rabbit", "marsh-fox"] as const) {
      expect(coreWildlifeTraversabilityCell(species, tile({
        terrain: "marsh",
        waterDepth: ADRIFT_STAND_DEPTH + 1,
      }))).toEqual({ access: "deep-water", travelCost: 0 });
    }
  });
});
