import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  projectWildlifePresentation,
  type WildlifeDirectObservation,
} from "./wildlifePresentation";
import { createWorldPosition } from "./worldPosition";

function wildlife(species: CoreWildlifeSpecies): CoreWildlifeActorState {
  const region = createRegionCoord(-4, 9);
  return createCoreWildlifeActorState({
    seed: [17, 29, 41, 53],
    species,
    originRegion: region,
    populationKey: `presentation-${species}`,
    populationOrdinal: 2,
    position: createWorldPosition(region, 24_000, 35_000),
    tick: 10,
  });
}

function directObservation(
  actor: CoreWildlifeActorState,
  distanceTiles = 4,
  options: Readonly<{ facingRadians?: number; visibleAggregateCount?: number }> = {},
): WildlifeDirectObservation {
  const actorGlobalX = actor.address.position.region.x * WORLD_WIDTH
    + Math.floor(actor.address.position.localX / 1_000);
  const actorGlobalY = actor.address.position.region.y * WORLD_HEIGHT
    + Math.floor(actor.address.position.localY / 1_000);
  const width = Math.max(100, distanceTiles + 2);
  const cells: PerceptionCell[] = Array.from(
    { length: width },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  return Object.freeze({
    window: {
      origin: { x: actorGlobalX - distanceTiles, y: actorGlobalY },
      terrain: { width, height: 1 },
    },
    perception: evaluatePerception({
      columns: width,
      rows: 1,
      cells,
      playerTileIndex: 0,
      facingRadians: options.facingRadians ?? 0,
      weatherVisibility: 1,
      rangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 128,
        forwardConeRadians: Math.PI / 2,
      },
      detailRangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 128,
        forwardConeRadians: Math.PI / 2,
      },
    }),
    ...(options.visibleAggregateCount === undefined
      ? {}
      : { visibleAggregateCount: options.visibleAggregateCount }),
  });
}

function pressuredPursuingBear(): CoreWildlifeActorState {
  const actor = wildlife("black-bear");
  const candidate = canonicalizeCoreWildlifeActorState({
    ...actor,
    condition: { health: 200_000, exhaustion: 800_000, stress: 900_000 },
    needs: { hunger: 990_000, safety: 880_000, rest: 770_000 },
    intent: {
      kind: "pursue",
      cause: { kind: "perception", referenceId: "observation:hidden-prey" },
      focusObservationId: "observation:hidden-prey",
      resourceReference: {
        resourceId: "actor:hidden-prey",
        observationId: "observation:hidden-prey",
        foodClass: "live-prey",
        sourceKind: "living-actor",
        observedAvailableUnits: 1,
      },
      enteredAtTick: 10,
      expiresAtTick: 20,
    },
  });
  if (candidate === null) throw new Error("wildlife fixture should remain canonical");
  return candidate;
}

describe("knowledge-honest wildlife presentation", () => {
  it.each([
    ["deer", "Deer"],
    ["gull", "Gulls"],
    ["black-bear", "Black bear"],
  ] as const)("projects a directly detailed %s without simulation internals", (species, label) => {
    const actor = wildlife(species);
    const presentation = projectWildlifePresentation({
      actor,
      observation: directObservation(actor),
      tileSize: 16,
      selected: true,
    });

    expect(presentation).toMatchObject({
      actorId: actor.identity.stableId,
      species,
      quickLabel: label,
      speciesIdentified: true,
      behavior: "watch",
      behaviorLabel: "Watching",
      selected: true,
    });
    expect(presentation?.appearanceLabel).toBeDefined();
    if (species === "gull") expect(presentation).not.toHaveProperty("lifeStageLabel");
    else expect(presentation?.lifeStageLabel).toBeDefined();
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation?.conditionLabels)).toBe(true);
  });

  it("withholds species and fine details when direct sight lacks clarity", () => {
    const deer = wildlife("deer");
    const gull = wildlife("gull");
    const bear = wildlife("black-bear");
    const deerView = projectWildlifePresentation({
      actor: deer,
      observation: directObservation(deer, 90),
      tileSize: 1,
    });
    const gullView = projectWildlifePresentation({
      actor: gull,
      observation: directObservation(gull, 90, { visibleAggregateCount: 7 }),
      tileSize: 1,
    });
    const bearView = projectWildlifePresentation({
      actor: bear,
      observation: directObservation(bear, 80),
      tileSize: 1,
    });

    expect(deerView).toMatchObject({ quickLabel: "Unknown animal", speciesIdentified: false });
    expect(gullView).toMatchObject({
      quickLabel: "Unknown birds",
      speciesIdentified: false,
      groupSize: 5,
    });
    expect(bearView).toMatchObject({ quickLabel: "Large animal", speciesIdentified: false });
    for (const view of [deerView, gullView, bearView]) {
      expect(view).not.toHaveProperty("appearanceLabel");
      expect(view).not.toHaveProperty("lifeStageLabel");
      expect(view?.conditionLabels).toEqual([]);
    }
  });

  it("buckets visible gull representatives and rejects hidden population substitutes", () => {
    const gull = wildlife("gull");
    const view = projectWildlifePresentation({
      actor: gull,
      observation: directObservation(gull, 4, { visibleAggregateCount: 19 }),
      tileSize: 1,
    });
    expect(view?.groupSize).toBe(20);
    expect(view?.groupSize).not.toBe(19);
    expect(projectWildlifePresentation({
      actor: gull,
      observation: directObservation(gull, 4, { visibleAggregateCount: 25 }),
      tileSize: 1,
    })).toBeNull();

    const deer = wildlife("deer");
    expect(projectWildlifePresentation({
      actor: deer,
      observation: directObservation(deer, 4, { visibleAggregateCount: 4 }),
      tileSize: 1,
    })).toBeNull();
    expect(projectWildlifePresentation({
      actor: gull,
      observation: directObservation(gull),
      tileSize: 1,
    })).not.toHaveProperty("groupSize");
  });

  it("uses observable wording without leaking needs, target, causes, or raw meters", () => {
    const bear = pressuredPursuingBear();
    const presentation = projectWildlifePresentation({
      actor: bear,
      observation: directObservation(bear),
      tileSize: 16,
    });
    expect(presentation).toMatchObject({
      behavior: "pursue",
      behaviorLabel: "Moving with focus",
      conditionLabels: ["MOVING POORLY", "EXHAUSTED", "DISTRESSED"],
    });
    const encoded = JSON.stringify(presentation);
    expect(encoded).not.toMatch(/hidden-prey|resourceReference|focusObservationId|referenceId/iu);
    expect(encoded).not.toMatch(/"needs"|"hunger"|"safety"|"health"|"stress"|"exhaustion"/u);
    expect(encoded).not.toMatch(/200000|800000|900000|990000|880000|770000/u);
  });

  it("requires a valid signed, matching, direct-detail perception frame", () => {
    const actor = wildlife("deer");
    const observed = directObservation(actor);
    expect(projectWildlifePresentation({
      actor,
      observation: {
        ...observed,
        perception: { ...observed.perception, signature: "perception-v2:forged" },
      },
      tileSize: 1,
    })).toBeNull();
    expect(projectWildlifePresentation({
      actor,
      observation: directObservation(actor, 4, { facingRadians: Math.PI }),
      tileSize: 1,
    })).toBeNull();
    expect(projectWildlifePresentation({
      actor,
      observation: { ...observed, hiddenPopulation: 12 } as WildlifeDirectObservation,
      tileSize: 1,
    })).toBeNull();
  });
});
