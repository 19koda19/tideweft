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
  migrateCoreEcologyPatchToAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  stepCoreEcologyGroupCoarse,
} from "./coreEcologyGroups";
import {
  deriveCoreEcologyMaterializedActorIds,
  projectCoreEcologyWildlife,
  selectedCoreEcologyActor,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import { livingActorAddressInRegionalWindow } from "./livingActor";
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
): CoreEcologyAggregatePatchState {
  const waveA = createCoreEcologyPatch({
    seed: SEED,
    patchKey: "runtime:wave-a",
    originRegion,
    populations,
  });
  const migrated = migrateCoreEcologyPatchToAggregatePatch(waveA);
  if (migrated === null) throw new Error("Could not create v3 runtime fixture");
  return migrated;
}

function aggregatePatchFromWaveA(
  state: ReturnType<typeof createCoreEcologyPatch>,
): CoreEcologyAggregatePatchState {
  const migrated = migrateCoreEcologyPatchToAggregatePatch(state);
  if (migrated === null) throw new Error("Could not migrate runtime fixture");
  return migrated;
}

function member(
  state: CoreEcologyAggregatePatchState,
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

  it("materializes a dormant herd from its moved group anchor rather than stale member addresses", () => {
    const firstWindow = windowAt();
    const initialAnchor = positionAt(firstWindow, 20, 20);
    const movedAnchor = positionAt(firstWindow, 80, 20);
    const initialGroup = createCoreEcologyGroup({
      seed: SEED,
      species: "deer",
      originRegion: ORIGIN,
      populationKey: "deer:moved-group",
      groupOrdinal: 0,
      memberOrdinals: [0, 1],
      anchor: initialAnchor,
    });
    const moved = stepCoreEcologyGroupCoarse(initialGroup, {
      atTick: 8,
      disturbances: [{
        disturbanceId: "disturbance:moved-group",
        atTick: 8,
        causeKind: "habitat-pressure",
        causeReferenceId: "habitat:moved-group",
        pressure: 100_000,
        movementHeading: 250_000,
        destinationAnchors: [movedAnchor],
        rendezvousAnchor: movedAnchor,
        playerAbsent: true,
        nonlethal: true,
        cargoInteraction: false,
      }],
    });
    if (moved === null) throw new Error("Moved-group fixture failed");
    const state = aggregatePatchFromWaveA(createCoreEcologyPatch({
      seed: SEED,
      patchKey: "runtime:moved-group",
      originRegion: ORIGIN,
      tick: 8,
      populations: [population("deer", "deer:moved-group", [
        positionAt(firstWindow, 20, 20),
        positionAt(firstWindow, 21, 20),
      ])],
      groups: createCoreEcologyGroupSet([moved.group]),
    }));
    const movedWindow = shiftedWindow(firstWindow, 50, 0);
    const expectedIds = state.populations[0]!.members
      .map(({ actor }) => actor.identity.stableId)
      .sort();

    expect(deriveCoreEcologyMaterializedActorIds(state, movedWindow)).toEqual(expectedIds);
    const materialized = setCoreEcologyMaterializationForWindow(state, movedWindow, 8);
    if (materialized === null) throw new Error("Moved-group materialization failed");
    for (const groupedMember of materialized.populations[0]!.members) {
      expect(groupedMember.materialization).toBe("materialized");
      expect(groupedMember.actor.address.position.localX).toBeGreaterThanOrEqual(
        movedAnchor.localX - 240,
      );
      expect(groupedMember.actor.address.position.localX).toBeLessThanOrEqual(
        movedAnchor.localX + 240,
      );
      expect(livingActorAddressInRegionalWindow(
        groupedMember.actor.address,
        movedWindow,
      )).not.toBeNull();
    }
  });

  it("does not materialize a stale dormant member whose group anchor is outside the frame", () => {
    const firstWindow = windowAt();
    const group = createCoreEcologyGroup({
      seed: SEED,
      species: "deer",
      originRegion: ORIGIN,
      populationKey: "deer:stale-address",
      groupOrdinal: 0,
      memberOrdinals: [0, 1],
      anchor: positionAt(firstWindow, 20, 20),
    });
    const state = aggregatePatchFromWaveA(createCoreEcologyPatch({
      seed: SEED,
      patchKey: "runtime:stale-address",
      originRegion: ORIGIN,
      populations: [population("deer", "deer:stale-address", [
        positionAt(firstWindow, 20, 20),
        positionAt(firstWindow, 80, 20),
      ])],
      groups: createCoreEcologyGroupSet([group]),
    }));

    expect(deriveCoreEcologyMaterializedActorIds(
      state,
      shiftedWindow(firstWindow, 50, 0),
    )).toEqual([]);
  });

  it("keeps a partially crossing herd exact and idempotent at an unchanged camera window", () => {
    const firstWindow = windowAt();
    const group = createCoreEcologyGroup({
      seed: SEED,
      species: "deer",
      originRegion: ORIGIN,
      populationKey: "deer:partial-crossing",
      groupOrdinal: 0,
      memberOrdinals: [0, 1],
      anchor: positionAt(firstWindow, 10, 20),
    });
    const waveAState = createCoreEcologyPatch({
      seed: SEED,
      patchKey: "runtime:partial-crossing",
      originRegion: ORIGIN,
      populations: [population("deer", "deer:partial-crossing", [
        positionAt(firstWindow, 10, 20),
        positionAt(firstWindow, 80, 20),
      ], new Set([0, 1]))],
      groups: createCoreEcologyGroupSet([group]),
    });
    const state = migrateCoreEcologyPatchToAggregatePatch(waveAState);
    if (state === null) throw new Error("Could not migrate partial-crossing fixture");
    const crossingWindow = shiftedWindow(firstWindow, 50, 0);
    const expected = [member(state, "deer:partial-crossing", 1).actor.identity.stableId];
    const beforePositions = state.populations[0]!.members
      .map(({ actor }) => actor.address.position);

    expect(deriveCoreEcologyMaterializedActorIds(state, crossingWindow)).toEqual(expected);
    const first = setCoreEcologyMaterializationForWindow(state, crossingWindow, 1);
    if (first === null) throw new Error("Partial crossing materialization failed");
    expect(deriveCoreEcologyMaterializedActorIds(first, crossingWindow)).toEqual(expected);
    const repeated = setCoreEcologyMaterializationForWindow(first, crossingWindow, 1);
    expect(repeated).toEqual(first);
    expect(first.populations[0]!.members.map(({ actor }) => actor.address.position))
      .toEqual(beforePositions);

    const widened = setCoreEcologyMaterializationForWindow(first, firstWindow, 2);
    if (widened === null) throw new Error("Partial crossing re-entry failed");
    expect(widened.populations[0]!.members.map(({ actor }) => actor.address.position))
      .toEqual(beforePositions);
    expect(deriveCoreEcologyMaterializedActorIds(widened, firstWindow))
      .toEqual(widened.populations[0]!.members.map(({ actor }) => actor.identity.stableId).sort());
  });

  it("preserves a dormant split component anchor while another component is active", () => {
    const firstWindow = windowAt();
    const initialGroup = createCoreEcologyGroup({
      seed: SEED,
      species: "deer",
      originRegion: ORIGIN,
      populationKey: "deer:split-crossing",
      groupOrdinal: 0,
      memberOrdinals: [0, 1, 2, 3],
      anchor: positionAt(firstWindow, 5, 20),
    });
    const split = stepCoreEcologyGroupCoarse(initialGroup, {
      atTick: 8,
      disturbances: [{
        disturbanceId: "disturbance:split-crossing",
        atTick: 8,
        causeKind: "habitat-pressure",
        causeReferenceId: "habitat:split-crossing",
        pressure: 800_000,
        movementHeading: 250_000,
        destinationAnchors: [
          positionAt(firstWindow, 80, 20),
          positionAt(firstWindow, 90, 20),
        ],
        rendezvousAnchor: positionAt(firstWindow, 85, 20),
        playerAbsent: true,
        nonlethal: true,
        cargoInteraction: false,
      }],
    });
    if (split === null) throw new Error("Split-crossing fixture failed");
    const state = aggregatePatchFromWaveA(createCoreEcologyPatch({
      seed: SEED,
      patchKey: "runtime:split-crossing",
      originRegion: ORIGIN,
      tick: 8,
      populations: [population("deer", "deer:split-crossing", [
        positionAt(firstWindow, 5, 20),
        positionAt(firstWindow, 90, 20),
        positionAt(firstWindow, 6, 20),
        positionAt(firstWindow, 91, 20),
      ], new Set([1, 3]))],
      groups: createCoreEcologyGroupSet([split.group]),
    }));
    const crossingWindow = shiftedWindow(firstWindow, 50, 0);
    const expected = state.populations[0]!.members
      .map(({ actor }) => actor.identity.stableId)
      .sort();

    expect(deriveCoreEcologyMaterializedActorIds(state, crossingWindow)).toEqual(expected);
    const first = setCoreEcologyMaterializationForWindow(state, crossingWindow, 8);
    if (first === null) throw new Error("Split component materialization failed");
    for (const groupedMember of first.populations[0]!.members) {
      expect(groupedMember.materialization).toBe("materialized");
      expect(livingActorAddressInRegionalWindow(groupedMember.actor.address, crossingWindow))
        .not.toBeNull();
    }
    expect(deriveCoreEcologyMaterializedActorIds(first, crossingWindow)).toEqual(expected);
    expect(setCoreEcologyMaterializationForWindow(first, crossingWindow, 8)).toEqual(first);
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
