import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import {
  createWorld,
  createWorldView,
  type WorldView,
} from "../sim/public";
import {
  coreWildlifeGradeTraversalPolicy,
  coreWildlifeTraversabilityCells,
} from "./coreWildlifeLocomotionProfile";
import {
  createLivingActorTraversabilityElevations,
  createLivingActorTraversabilitySurface,
} from "./livingActorLocomotion";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { runtimeCoreTraversabilityCellBatch } from "./runtimeCoreTraversabilityCellBatch";
import { createWorldPosition } from "./worldPosition";

interface TraversabilityFixture {
  readonly compatibility: WorldView;
  readonly immutableWorld: WorldView;
  readonly mutableWorld: WorldView;
  readonly immutableTwin: WorldView;
}

function createFixture(): TraversabilityFixture {
  const state = createWorld("one exact law may serve many living actors", "standard");
  const compatibility = createWorldView(state);
  const stream = createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed });
  const cartography = createRegionalCartography(state.meta.rootSeed);
  const window = createRegionalTerrainWindow(state.meta.rootSeed, stream);
  const knowledge = projectRegionalCartographyWindow(cartography, window);
  return {
    compatibility,
    immutableWorld: createRegionalWorldView(
      compatibility,
      window,
      knowledge,
      { immutable: true },
    ),
    mutableWorld: createRegionalWorldView(compatibility, window, knowledge),
    immutableTwin: createRegionalWorldView(
      compatibility,
      window,
      knowledge,
      { immutable: true },
    ),
  };
}

function captureError(operation: () => unknown): Readonly<{
  readonly name: string;
  readonly message: string;
}> | null {
  try {
    operation();
    return null;
  } catch (error) {
    return Object.freeze({
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

describe("runtime core traversability cell batches", () => {
  it("collapses the seven dense scenario requests to five exact immutable laws", () => {
    const { immutableWorld: world } = createFixture();
    const tick = 421;
    const rabbitDefault = runtimeCoreTraversabilityCellBatch(
      world,
      tick,
      "marsh-rabbit",
    );
    const rabbitLand = runtimeCoreTraversabilityCellBatch(
      world,
      tick,
      "marsh-rabbit",
      "land",
    );
    const cat = runtimeCoreTraversabilityCellBatch(world, tick, "domestic-cat");
    const chicken = runtimeCoreTraversabilityCellBatch(world, tick, "domestic-chicken");
    const domesticGoat = runtimeCoreTraversabilityCellBatch(world, tick, "domestic-goat");
    const mountainGoat = runtimeCoreTraversabilityCellBatch(world, tick, "mountain-goat");
    const arcticFox = runtimeCoreTraversabilityCellBatch(world, tick, "arctic-fox");

    expect(rabbitLand).toBe(rabbitDefault);
    expect(chicken).toBe(cat);
    expect(new Set([
      rabbitDefault,
      rabbitLand,
      cat,
      chicken,
      domesticGoat,
      mountainGoat,
      arcticFox,
    ])).toHaveLength(5);
    expect(rabbitDefault).toHaveLength(world.terrain.tiles.length);
    expect(Object.isFrozen(rabbitDefault)).toBe(true);
    expect(rabbitDefault.every(Object.isFrozen)).toBe(true);
  });

  it("keeps batches world- and tick-current and bypasses unowned views", () => {
    const {
      immutableWorld,
      immutableTwin,
      mutableWorld,
    } = createFixture();
    const first = runtimeCoreTraversabilityCellBatch(
      immutableWorld,
      90,
      "marsh-rabbit",
    );
    expect(runtimeCoreTraversabilityCellBatch(
      immutableWorld,
      90,
      "marsh-rabbit",
      "land",
    )).toBe(first);

    const nextTick = runtimeCoreTraversabilityCellBatch(
      immutableWorld,
      91,
      "marsh-rabbit",
    );
    expect(nextTick).not.toBe(first);
    expect(runtimeCoreTraversabilityCellBatch(
      immutableWorld,
      91,
      "marsh-rabbit",
      "land",
    )).toBe(nextTick);
    expect(runtimeCoreTraversabilityCellBatch(
      immutableTwin,
      90,
      "marsh-rabbit",
    )).not.toBe(first);

    const unownedFrozenTwin = Object.freeze({ ...immutableWorld });
    expect(unownedFrozenTwin.terrain.tiles).toBe(immutableWorld.terrain.tiles);
    expect(runtimeCoreTraversabilityCellBatch(
      unownedFrozenTwin,
      90,
      "marsh-rabbit",
    )).not.toBe(runtimeCoreTraversabilityCellBatch(
      unownedFrozenTwin,
      90,
      "marsh-rabbit",
    ));
    expect(runtimeCoreTraversabilityCellBatch(
      mutableWorld,
      90,
      "marsh-rabbit",
    )).not.toBe(runtimeCoreTraversabilityCellBatch(
      mutableWorld,
      90,
      "marsh-rabbit",
    ));
  });

  it("shares no actor-bound surface or grade/elevation authority", () => {
    const { immutableWorld: world } = createFixture();
    const cells = runtimeCoreTraversabilityCellBatch(world, 57, "domestic-cat");
    expect(runtimeCoreTraversabilityCellBatch(world, 57, "domestic-chicken"))
      .toBe(cells);
    const origin = createWorldPosition(createRegionCoord(0, 0), 0, 0);
    const cat = createLivingActorTraversabilitySurface({
      forActorId: "CAT-CACHE-v1/one",
      sampledAtTick: 57,
      origin,
      widthTiles: world.terrain.width,
      heightTiles: world.terrain.height,
      cells,
    });
    const chicken = createLivingActorTraversabilitySurface({
      forActorId: "CHICKEN-CACHE-v1/two",
      sampledAtTick: 57,
      origin,
      widthTiles: world.terrain.width,
      heightTiles: world.terrain.height,
      cells,
    });
    expect(chicken).not.toBe(cat);
    expect(chicken.forActorId).not.toBe(cat.forActorId);
    expect(chicken.cells).toBe(cat.cells);

    const domesticCells = runtimeCoreTraversabilityCellBatch(
      world,
      57,
      "domestic-goat",
    );
    const mountainCells = runtimeCoreTraversabilityCellBatch(
      world,
      57,
      "mountain-goat",
    );
    const elevations = createLivingActorTraversabilityElevations(
      world.terrain.tiles.map(({ elevation }) => elevation),
    );
    const gradePolicy = coreWildlifeGradeTraversalPolicy("mountain-goat");
    if (gradePolicy === null) throw new Error("Mountain goat lost grade authority");
    const domestic = createLivingActorTraversabilitySurface({
      forActorId: "GOAT-CACHE-v1/domestic",
      sampledAtTick: 57,
      origin,
      widthTiles: world.terrain.width,
      heightTiles: world.terrain.height,
      cells: domesticCells,
    });
    const mountain = createLivingActorTraversabilitySurface({
      forActorId: "GOAT-CACHE-v1/mountain",
      sampledAtTick: 57,
      origin,
      widthTiles: world.terrain.width,
      heightTiles: world.terrain.height,
      cells: mountainCells,
      edgeGradePolicy: gradePolicy,
      elevations,
    });
    expect(mountain.cells).not.toBe(domestic.cells);
    expect(domestic).not.toHaveProperty("edgeGradePolicy");
    expect(domestic).not.toHaveProperty("elevations");
    expect(mountain.edgeGradePolicy).toEqual(gradePolicy);
    expect(mountain.elevations).toEqual(elevations);
  });

  it("preserves the public batch admission errors before any cache hit", () => {
    const { immutableWorld: world } = createFixture();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(captureError(() => runtimeCoreTraversabilityCellBatch(
        world,
        33,
        "gull",
        "land",
      ))).toEqual(captureError(() => coreWildlifeTraversabilityCells(
        "gull",
        world.terrain.tiles,
        "land",
      )));
    }

    const unknownSpecies = "invented-bird" as never;
    expect(captureError(() => runtimeCoreTraversabilityCellBatch(
      world,
      33,
      unknownSpecies,
    ))).toEqual(captureError(() => coreWildlifeTraversabilityCells(
      unknownSpecies,
      world.terrain.tiles,
    )));
  });
});
