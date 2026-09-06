import { describe, expect, it } from "vitest";
import { createRegionCoord } from "../sim/regions";
import type { TerrainTileView } from "../sim/types";
import { createLivingActorAddress } from "./livingActor";
import {
  createLivingActorTraversabilitySurface,
  resolveLivingActorLocomotion,
} from "./livingActorLocomotion";
import {
  CORE_WILDLIFE_BASE_MOVE_STEP_UNITS,
  CORE_WILDLIFE_LOCOMOTION_PROFILE_VERSION,
  coreWildlifeLocomotionProfile,
  coreWildlifeMaximumStepUnits,
  coreWildlifeTraversabilityCell,
} from "./coreWildlifeLocomotionProfile";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import { createWorldPosition } from "./worldPosition";

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
  it("generalizes bounded aerial travel without reading surface impedance", () => {
    expect(CORE_WILDLIFE_LOCOMOTION_PROFILE_VERSION).toBe(1);
    const blockedSurface = tile({
      terrain: "deep-water",
      waterDepth: ADRIFT_STAND_DEPTH + 900_000,
      baseTravelCost: 1_000_000,
    });
    for (const species of [
      "gull",
      "fish-crow",
      "northern-harrier",
      "snowy-egret",
    ] as const) {
      expect(coreWildlifeLocomotionProfile(species).mode).toBe("aerial");
      expect(coreWildlifeTraversabilityCell(species, blockedSurface)).toMatchObject({
        access: "open",
      });
      expect(coreWildlifeTraversabilityCell(species, blockedSurface).travelCost)
        .toBeLessThan(blockedSurface.baseTravelCost);
    }
  });

  it("selects duck air or surface water through one shared traversability seam", () => {
    const profile = coreWildlifeLocomotionProfile("american-black-duck");
    expect(profile.mode).toBe("aerial");
    expect(profile.aerialTravelCost).toBeGreaterThan(0);
    expect(profile.surfaceWaterTravelCost).toBeGreaterThan(0);

    const dryLand = tile({ terrain: "meadow", waterDepth: 0 });
    const shallowWater = tile({ terrain: "marsh", waterDepth: 18_000 });
    const deepWater = tile({ terrain: "deep-water", waterDepth: 900_000 });
    expect(coreWildlifeTraversabilityCell(
      "american-black-duck",
      dryLand,
      "air",
    )).toMatchObject({ access: "open" });
    expect(coreWildlifeTraversabilityCell(
      "american-black-duck",
      dryLand,
      "surface-water",
    )).toEqual({ access: "blocked", travelCost: 0 });
    expect(coreWildlifeTraversabilityCell(
      "american-black-duck",
      shallowWater,
      "surface-water",
    )).toMatchObject({ access: "open" });
    expect(coreWildlifeTraversabilityCell(
      "american-black-duck",
      deepWater,
      "surface-water",
    )).toMatchObject({ access: "open" });
    expect(() => coreWildlifeTraversabilityCell(
      "snowy-egret",
      shallowWater,
      "surface-water",
    )).toThrow("lacks a surface-water locomotion profile");
  });

  it("routes duck surface travel through the bounded living-actor resolver", () => {
    const tick = 40;
    const origin = createWorldPosition(createRegionCoord(0, 0), 0, 0);
    const actor = createLivingActorAddress({
      actorId: "DUCK-R-v1-locomotion/duck-1",
      species: "american-black-duck",
      position: createWorldPosition(createRegionCoord(0, 0), 500, 500),
      heading: 0,
      persistence: "regional",
    });
    const water = tile({ terrain: "marsh", waterDepth: 24_000 });
    const land = tile({ terrain: "meadow", waterDepth: 0 });
    const surface = createLivingActorTraversabilitySurface({
      forActorId: actor.actorId,
      sampledAtTick: tick,
      origin,
      widthTiles: 3,
      heightTiles: 2,
      cells: [
        ...Array.from({ length: 3 }, () => coreWildlifeTraversabilityCell(
          "american-black-duck",
          water,
          "surface-water",
        )),
        ...Array.from({ length: 3 }, () => coreWildlifeTraversabilityCell(
          "american-black-duck",
          land,
          "surface-water",
        )),
      ],
    });
    const resolution = resolveLivingActorLocomotion({
      requestId: "duck-surface-water:test/40",
      tick,
      actor,
      targetArea: {
        center: createWorldPosition(createRegionCoord(0, 0), 2_500, 500),
        radiusUnits: 0,
      },
      maximumStepUnits: 1_000,
      surface,
    });
    expect(resolution).toMatchObject({ kind: "moved", distanceUnits: 1_000 });
    if (resolution.kind !== "moved") throw new Error("Duck surface route did not move");
    expect(resolution.trajectory.every(({ localY }) => localY < 1_000)).toBe(true);
  });

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

  it("gives crow alarm flight and harrier pursuit distinct bounded aerial cadence", () => {
    expect(coreWildlifeMaximumStepUnits("fish-crow", "alarm"))
      .toBeGreaterThan(coreWildlifeMaximumStepUnits("fish-crow", "forage"));
    expect(coreWildlifeMaximumStepUnits("northern-harrier", "pursue"))
      .toBeGreaterThan(coreWildlifeMaximumStepUnits("northern-harrier", "observe"));
    expect(coreWildlifeMaximumStepUnits("fish-crow", "alarm")).toBeLessThan(1_000);
    expect(coreWildlifeMaximumStepUnits("northern-harrier", "pursue")).toBeLessThan(1_000);
    expect(coreWildlifeMaximumStepUnits("snowy-egret", "observe")).toBeGreaterThan(0);
    expect(coreWildlifeMaximumStepUnits("snowy-egret", "observe")).toBeLessThan(1_000);
  });

  it("rejects nonstandable water identically before gait can matter", () => {
    for (const species of ["marsh-rabbit", "marsh-fox"] as const) {
      expect(coreWildlifeTraversabilityCell(species, tile({
        terrain: "marsh",
        waterDepth: ADRIFT_STAND_DEPTH + 1,
      }))).toEqual({ access: "deep-water", travelCost: 0 });
    }
  });

  it("fails closed when an unregistered species is forced across the typed boundary", () => {
    expect(() => coreWildlifeLocomotionProfile("invented-bird" as never))
      .toThrow("Unknown core wildlife species invented-bird");
  });
});
