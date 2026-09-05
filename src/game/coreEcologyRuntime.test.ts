import { describe, expect, it } from "vitest";

import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  globalTileToRegion,
  regionLocalToGlobalTile,
} from "../sim/regions";
import { seedFromText } from "../sim/rng";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import {
  createCoreEcologyPatch,
  type CoreEcologyPatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyMaterializedActorIds,
  projectCoreEcologyWildlife,
  selectedCoreEcologyActor,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import { createWorldPosition, type WorldPosition } from "./worldPosition";

const ORIGIN = createRegionCoord(-14, 27);
const SEED = seedFromText("core ecology pure runtime seam");

function windowAt(region = ORIGIN): CoreEcologyRuntimeWindow {
  const origin = regionLocalToGlobalTile(region, 0, 0);
  return Object.freeze({
    origin,
    terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
  });
}

function shiftedWindow(
  window: CoreEcologyRuntimeWindow,
  x: number,
  y: number,
): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: { x: window.origin.x + x, y: window.origin.y + y },
    terrain: window.terrain,
  });
}

function positionAt(
  window: CoreEcologyRuntimeWindow,
  windowX: number,
  windowY: number,
): WorldPosition {
  const address = globalTileToRegion(window.origin.x + windowX, window.origin.y + windowY);
  return createWorldPosition(
    address.region,
    address.localX * 1_000 + 500,
    address.localY * 1_000 + 500,
  );
}

function population(
  species: CoreWildlifeSpecies,
  populationKey: string,
  positions: readonly WorldPosition[],
  initiallyMaterialized: ReadonlySet<number> = new Set(),
): CoreEcologyPopulationInput {
  return {
    species,
    populationKey,
    members: positions.map((position, populationOrdinal) => ({
      populationOrdinal,
      position,
      heading: populationOrdinal * 11_000,
      materialization: initiallyMaterialized.has(populationOrdinal)
        ? "materialized" as const
        : "coarse" as const,
    })),
  };
}

function patch(
  populations: readonly CoreEcologyPopulationInput[],
  originRegion = ORIGIN,
): CoreEcologyPatchState {
  return createCoreEcologyPatch({
    seed: SEED,
    patchKey: "runtime:wave-a",
    originRegion,
    populations,
  });
}

function member(
  state: CoreEcologyPatchState,
  populationKey: string,
  ordinal: number,
) {
  const result = state.populations
    .find((candidate) => candidate.populationKey === populationKey)
    ?.members.find(({ populationOrdinal }) => populationOrdinal === ordinal);
  if (result === undefined) throw new Error("Missing ecology runtime fixture member");
  return result;
}

function directPerception(window: CoreEcologyRuntimeWindow) {
  const cells: PerceptionCell[] = Array.from(
    { length: REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  return evaluatePerception({
    columns: window.terrain.width,
    rows: window.terrain.height,
    cells,
    playerTileIndex: 60 * REGIONAL_TRAVEL_COLUMNS + 60,
    facingRadians: 0,
    weatherVisibility: 1,
  });
}

describe("core ecology pure runtime seam", () => {
  it("derives and sets the exact in-frame actor set while preserving coarse state", () => {
    const window = windowAt();
    const state = patch([
      population("deer", "deer:crossing", [
        positionAt(window, 5, 5),
        positionAt(window, 130, 5),
      ], new Set([1])),
      population("gull", "gull:flat", [positionAt(window, 60, 60)]),
      population("black-bear", "bear:mangrove", [positionAt(window, -1, 60)], new Set([0])),
    ]);
    const expected = [
      member(state, "deer:crossing", 0).actor.identity.stableId,
      member(state, "gull:flat", 0).actor.identity.stableId,
    ].sort();

    expect(deriveCoreEcologyMaterializedActorIds(state, window)).toEqual(expected);
    const reconciled = setCoreEcologyMaterializationForWindow(state, window, 5);
    if (reconciled === null) throw new Error("Valid materialization reconcile failed");
    expect(reconciled.updatedAtTick).toBe(5);
    for (const populationState of state.populations) {
      for (const prior of populationState.members) {
        const current = member(reconciled, populationState.populationKey, prior.populationOrdinal);
        expect(current.actor).toEqual(prior.actor);
        expect(current.materialization).toBe(
          expected.includes(prior.actor.identity.stableId) ? "materialized" : "coarse",
        );
      }
    }
    expect(state.updatedAtTick).toBe(0);
    expect(member(state, "deer:crossing", 1).materialization).toBe("materialized");
  });

  it("rebases a signed frame without moving, rerolling, or losing either actor", () => {
    const firstWindow = windowAt(createRegionCoord(-31, -47));
    const state = patch([
      population("deer", "deer:rebase", [
        positionAt(firstWindow, 5, 60),
        positionAt(firstWindow, 125, 60),
      ]),
    ], createRegionCoord(-31, -47));
    const first = setCoreEcologyMaterializationForWindow(state, firstWindow, 1);
    if (first === null) throw new Error("First frame materialization failed");
    const secondWindow = shiftedWindow(firstWindow, 16, 0);
    const second = setCoreEcologyMaterializationForWindow(first, secondWindow, 2);
    if (second === null) throw new Error("Rebased frame materialization failed");

    expect(member(first, "deer:rebase", 0).materialization).toBe("materialized");
    expect(member(first, "deer:rebase", 1).materialization).toBe("coarse");
    expect(member(second, "deer:rebase", 0).materialization).toBe("coarse");
    expect(member(second, "deer:rebase", 1).materialization).toBe("materialized");
    for (const ordinal of [0, 1]) {
      expect(member(second, "deer:rebase", ordinal).actor)
        .toEqual(member(state, "deer:rebase", ordinal).actor);
    }
  });

  it.each([
    createRegionCoord(-REGION_COORD_LIMIT, 0),
    createRegionCoord(REGION_COORD_LIMIT, 0),
  ])("accepts a valid signed extreme frame at region $x,$y", (region) => {
    const regionOrigin = regionLocalToGlobalTile(region, 0, 0);
    const window: CoreEcologyRuntimeWindow = {
      origin: {
        x: region.x === REGION_COORD_LIMIT ? regionOrigin.x - 24 : regionOrigin.x,
        y: regionOrigin.y,
      },
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
    };
    const state = patch([
      population("black-bear", "bear:extreme", [positionAt(window, 24, 60)]),
    ], region);
    expect(deriveCoreEcologyMaterializedActorIds(state, window)).toEqual([
      member(state, "bear:extreme", 0).actor.identity.stableId,
    ]);
  });

  it("projects only direct-detail materialized actors and counts visible gulls per population", () => {
    const window = windowAt();
    const state = patch([
      population("deer", "deer:visible", [positionAt(window, 65, 60)]),
      population("gull", "gull:first", [
        positionAt(window, 66, 60),
        positionAt(window, 68, 61),
        positionAt(window, 40, 60),
        positionAt(window, 140, 60),
      ]),
      population("gull", "gull:second", [
        positionAt(window, 67, 63),
        positionAt(window, 140, 63),
      ]),
      population("black-bear", "bear:visible", [positionAt(window, 69, 62)]),
    ]);
    const materialized = setCoreEcologyMaterializationForWindow(state, window, 1);
    if (materialized === null) throw new Error("Projection fixture materialization failed");
    const deer = member(materialized, "deer:visible", 0).actor;
    const views = projectCoreEcologyWildlife({
      patch: materialized,
      window,
      perception: directPerception(window),
      tileSize: 16,
      selectedTarget: { species: "deer", actorId: deer.identity.stableId },
    });
    if (views === null) throw new Error("Valid wildlife projection failed");

    const firstVisibleIds = [0, 1].map((ordinal) =>
      member(materialized, "gull:first", ordinal).actor.identity.stableId
    );
    for (const actorId of firstVisibleIds) {
      expect(views.find((view) => view.actorId === actorId)?.groupSize).toBe(2);
    }
    const secondVisibleId = member(materialized, "gull:second", 0).actor.identity.stableId;
    expect(views.find((view) => view.actorId === secondVisibleId)).not.toHaveProperty("groupSize");
    expect(views.some((view) =>
      view.actorId === member(materialized, "gull:first", 2).actor.identity.stableId
    )).toBe(false);
    expect(views.some((view) =>
      view.actorId === member(materialized, "gull:first", 3).actor.identity.stableId
    )).toBe(false);
    expect(views.filter(({ selected }) => selected).map(({ actorId }) => actorId))
      .toEqual([deer.identity.stableId]);
    expect(JSON.stringify(views)).not.toMatch(/"populationSize"|"populationKey"/u);
    expect(Object.isFrozen(views)).toBe(true);
  });

  it("looks up only an exact materialized species-and-stable-ID target", () => {
    const window = windowAt();
    const state = patch([
      population("deer", "deer:select", [positionAt(window, 60, 60)]),
      population("black-bear", "bear:select", [positionAt(window, 61, 60)]),
    ]);
    const materialized = setCoreEcologyMaterializationForWindow(state, window, 1);
    if (materialized === null) throw new Error("Selection fixture materialization failed");
    const deer = member(materialized, "deer:select", 0).actor;
    const bear = member(materialized, "bear:select", 0).actor;
    expect(selectedCoreEcologyActor(materialized, {
      species: "deer",
      actorId: deer.identity.stableId,
    })).toEqual(deer);
    expect(selectedCoreEcologyActor(materialized, {
      species: "deer",
      actorId: bear.identity.stableId,
    })).toBeNull();
    expect(selectedCoreEcologyActor(materialized, {
      species: "black-bear",
      actorId: deer.identity.stableId,
    })).toBeNull();
    expect(selectedCoreEcologyActor(materialized, {
      species: "deer",
      actorId: "DEER-not-owned",
    })).toBeNull();

    const coarse = setCoreEcologyMaterializationForWindow(materialized, shiftedWindow(window, 120, 0), 2);
    if (coarse === null) throw new Error("Coarse selection fixture failed");
    expect(selectedCoreEcologyActor(coarse, {
      species: "deer",
      actorId: deer.identity.stableId,
    })).toBeNull();
  });

  it("fails malformed state, frames, perception, and over-budget exact sets closed", () => {
    const window = windowAt();
    const state = patch([
      population("deer", "deer:malformed", [positionAt(window, 65, 60)]),
    ]);
    expect(deriveCoreEcologyMaterializedActorIds({ ...state, debug: true }, window)).toBeNull();
    expect(deriveCoreEcologyMaterializedActorIds(state, {
      ...window,
      terrain: { ...window.terrain, width: REGIONAL_TRAVEL_COLUMNS - 1 },
    })).toBeNull();
    expect(deriveCoreEcologyMaterializedActorIds(state, {
      ...window,
      origin: { ...window.origin, x: -0 },
    })).toBeNull();
    expect(setCoreEcologyMaterializationForWindow(state, window, -0)).toBeNull();

    const perception = directPerception(window);
    expect(projectCoreEcologyWildlife({
      patch: state,
      window,
      perception: { ...perception, signature: "perception-v2:forged" },
      tileSize: 16,
    })).toBeNull();
    expect(projectCoreEcologyWildlife({
      patch: state,
      window,
      perception,
      tileSize: 16,
      selectedTarget: {
        species: "deer",
        actorId: "BEAR-cross-species-alias",
      },
    })).toBeNull();

    const crowded = patch([
      population("gull", "gull:crowded", Array.from(
        { length: 24 },
        (_, index) => positionAt(window, 10 + index, 10),
      )),
      population("deer", "deer:crowded", [positionAt(window, 40, 10)]),
    ]);
    expect(deriveCoreEcologyMaterializedActorIds(crowded, window)).toBeNull();
    expect(setCoreEcologyMaterializationForWindow(crowded, window, 1)).toBeNull();
  });
});
