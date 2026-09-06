import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregateActivityIntensity,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  projectCoreEcologyActivity,
  stepCoreEcologyActivityMotion,
} from "./coreEcologyActivity";
import {
  deriveCoreEcologyTidalTableHabitatAssemblage,
  deriveCoreEcologyWaterfowlHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  collectCoreEcologyAggregateActivityObservationBatches,
} from "./coreEcologyPerception";
import {
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  repositionCoreWildlifeActor,
} from "./coreWildlifeActor";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
} from "./regionalTravel";
import { createRegionalWorldView, regionalTileIndexInView } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

const SEED_TEXT = "tidal-triad-1";
const SEED = seedFromText(SEED_TEXT);
const REGION = createRegionCoord(0, 0);

describe("snowy egret perception of tidal aggregates", () => {
  it("selects every materialized aquatic forager with stable anonymous capped output", () => {
    const seedText = "waterfowl habitat 1";
    const seed = seedFromText(seedText);
    const habitat = deriveCoreEcologyWaterfowlHabitatAssemblage({
      rootSeed: seed,
      originRegion: REGION,
    });
    const created = createCoreEcologyAggregatePatch({
      seed,
      patchKey: "tidal-perception:waterfowl",
      originRegion: REGION,
      tick: 360,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v6", habitat },
    });
    const tidalStep = stepCoreEcologyTidalTable(created, { atTick: 360 });
    if (tidalStep === null) throw new Error("Waterfowl tidal fixture step failed");
    const tidal = projectCoreEcologyTidalTable(tidalStep.patch, 361);
    const cue = tidal?.anchorDepths.find((depth) => (
      depth.activityUsable
      && (tidalStep.patch.aggregatePopulations
        .find(({ aggregateId }) => aggregateId === depth.aggregateId)
        ?.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0
      && (tidal.aggregateActivities
        .find(({ aggregateId }) => aggregateId === depth.aggregateId)?.intensity ?? 0) > 0
    ));
    if (cue === undefined) throw new Error("Waterfowl fixture lacks an aquatic cue");
    let patch = tidalStep.patch;
    for (const species of ["snowy-egret", "american-black-duck"] as const) {
      const actor = patch.populations.find((population) => population.species === species)
        ?.members[0]?.actor;
      if (actor === undefined) throw new Error(`Waterfowl fixture lacks ${species}`);
      patch = replaceCoreEcologyAggregatePatchActor(
        patch,
        repositionCoreWildlifeActor(actor, {
          atTick: 360,
          position: cue.position,
          heading: actor.address.heading,
        }),
      );
    }

    const state = createWorld(seedText, "standard");
    state.weather = {
      ...state.weather,
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
    };
    for (const settlement of state.settlements) settlement.tileIndex = 0;
    const economy = createWorldView(state);
    const window = createRegionalTerrainWindow(
      state.meta.rootSeed,
      createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
      regionalFrameOriginAtAddress({
        region: REGION,
        localX: Math.trunc(WORLD_WIDTH / 2),
        localY: Math.trunc(WORLD_HEIGHT / 2),
      }),
    );
    const world = createRegionalWorldView(
      economy,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
    );
    const duck = patch.populations.find(({ species }) => species === "american-black-duck")
      ?.members[0]?.actor;
    const egret = egretActor(patch);
    if (duck === undefined) throw new Error("Waterfowl fixture lacks duck actor");
    const batches = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [egret, duck].reverse(),
      patch,
      tick: 361,
      window,
      world,
    });
    expect(batches?.map(({ observerId }) => observerId)).toEqual(
      [duck.identity.stableId, egret.identity.stableId].sort(),
    );
    expect(batches).toHaveLength(2);
    for (const batch of batches ?? []) {
      expect(batch.observations.length).toBeGreaterThan(0);
      expect(batch.observations.every((observation) => (
        observation.subjectId === null
        && observation.perceivedClass === "aquatic-activity"
        && observation.channel === "vision"
      ))).toBe(true);
      const serialized = JSON.stringify(batch.observations);
      expect(serialized).not.toContain("populationUnits");
      expect(serialized).not.toContain("SILVERSIDE-AREA");
      expect(serialized).not.toContain("FIDDLE-AREA");
    }
    const repeated = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [duck, egret],
      patch,
      tick: 361,
      window,
      world,
    });
    expect(repeated).toEqual(batches);
  });

  it("creates only a current anonymous visual fact for an occupied, active, depth-usable anchor", () => {
    const { patch, world, window } = visibleCueFixture(360);
    const tidal = projectCoreEcologyTidalTable(patch, 361);
    const egret = egretActor(patch);
    if (tidal === null) throw new Error("missing tidal projection");

    const batches = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [egret],
      patch,
      tick: 361,
      window,
      world,
    });
    const observations = batches?.find(({ observerId }) => (
      observerId === egret.identity.stableId
    ))?.observations ?? [];
    expect(observations.length).toBeGreaterThan(0);
    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "aquatic-activity",
        subjectId: null,
        identification: "classified",
        observedAtTick: 361,
        area: expect.objectContaining({ radiusUnits: 0 }),
      }),
    ]));
    expect(observations.every(({ area }) => tidal.anchorDepths.some((depth) => (
      depth.activityUsable
      && depth.position.region.x === area.center.region.x
      && depth.position.region.y === area.center.region.y
      && depth.position.localX === area.center.localX
      && depth.position.localY === area.center.localY
    )))).toBe(true);
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toContain("SILVERSIDE-AREA");
    expect(serialized).not.toContain("FIDDLE-AREA");
    expect(serialized).not.toContain("populationUnits");
  });

  it("does not disclose an emptied anchor or one unusable at the target tick", () => {
    const fixture = visibleCueFixture(360);
    const tidal = projectCoreEcologyTidalTable(fixture.patch, 361);
    if (tidal === null) throw new Error("missing tidal projection");
    const observedDepth = tidal.anchorDepths.find((depth) => (
      depth.activityUsable
      && (fixture.patch.aggregatePopulations
        .find(({ aggregateId }) => aggregateId === depth.aggregateId)
        ?.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0
    ));
    if (observedDepth === undefined) throw new Error("fixture lacks occupied active depth");
    const population = fixture.patch.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === observedDepth.aggregateId
    ));
    const receiver = population?.anchors.find(({ anchorOrdinal }) => (
      anchorOrdinal !== observedDepth.anchorOrdinal
    ));
    const units = population?.anchors[observedDepth.anchorOrdinal]?.populationUnits ?? 0;
    if (population === undefined || receiver === undefined || units === 0) {
      throw new Error("fixture cannot empty target anchor");
    }
    const displaced = displaceCoreEcologyAggregatePopulation(fixture.patch, {
      aggregateId: population.aggregateId,
      atTick: 360,
      causeKind: "weather-pressure",
      causeReferenceId: "test:empty-visible-tidal-cue",
      fromAnchorOrdinal: observedDepth.anchorOrdinal,
      toAnchorOrdinal: receiver.anchorOrdinal,
      populationUnits: units,
      pressure: 500_000,
    });
    if (displaced === null) throw new Error("valid emptying displacement failed");
    const egret = egretActor(displaced.patch);
    const observations = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [egret],
      patch: displaced.patch,
      tick: 361,
      window: fixture.window,
      world: fixture.world,
    })?.flatMap(({ observations: values }) => values) ?? [];
    expect(observations.some(({ area }) => (
      area.center.region.x === observedDepth.position.region.x
      && area.center.region.y === observedDepth.position.region.y
      && area.center.localX === observedDepth.position.localX
      && area.center.localY === observedDepth.position.localY
    ))).toBe(false);

  });

  it("rejects depth-unusable and occluded activity instead of minting aquatic knowledge", () => {
    const low = visibleCueFixture(360);
    const lowTide = projectCoreEcologyTidalTable(low.patch, 361);
    const unusable = lowTide?.anchorDepths.find(({ activityUsable }) => !activityUsable);
    if (unusable === undefined) throw new Error("fixture lacks a depth-unusable anchor");
    const unusablePopulation = low.patch.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === unusable.aggregateId
    ));
    const occupiedSource = unusablePopulation?.anchors.find(({ populationUnits }) => (
      populationUnits > 0
    ));
    if (unusablePopulation === undefined || occupiedSource === undefined) {
      throw new Error("fixture lacks units for depth rejection");
    }
    const forced = occupiedSource.anchorOrdinal === unusable.anchorOrdinal
      ? low.patch
      : displaceCoreEcologyAggregatePopulation(low.patch, {
          aggregateId: unusablePopulation.aggregateId,
          atTick: 360,
          causeKind: "weather-pressure",
          causeReferenceId: "test:force-unusable-depth",
          fromAnchorOrdinal: occupiedSource.anchorOrdinal,
          toAnchorOrdinal: unusable.anchorOrdinal,
          populationUnits: 1,
          pressure: 500_000,
        })?.patch;
    if (forced === undefined) throw new Error("could not populate unusable anchor");
    const depthEgret = egretActor(forced);
    const depthPatch = replaceCoreEcologyAggregatePatchActor(
      forced,
      repositionCoreWildlifeActor(depthEgret, {
        atTick: 360,
        position: unusable.position,
        heading: depthEgret.address.heading,
      }),
    );
    const depthObservations = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [egretActor(depthPatch)],
      patch: depthPatch,
      tick: 361,
      window: low.window,
      world: low.world,
    })?.flatMap(({ observations }) => observations) ?? [];
    expect(hasObservationAt(depthObservations, unusable.position)).toBe(false);

    const clear = visibleCueFixture(360);
    const clearEgret = egretActor(clear.patch);
    const observerPosition = translateWorldPosition(clear.cuePosition, -4_000, 0);
    const occludedPatch = replaceCoreEcologyAggregatePatchActor(
      clear.patch,
      repositionCoreWildlifeActor(clearEgret, {
        atTick: 360,
        position: observerPosition,
        heading: 0,
      }),
    );
    const blockerPosition = translateWorldPosition(clear.cuePosition, -2_000, 0);
    const blockerStorageIndex = Math.floor(blockerPosition.localY / WORLD_POSITION_UNITS_PER_TILE)
      * WORLD_WIDTH
      + Math.floor(blockerPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
    const blockerIndex = regionalTileIndexInView(
      clear.world,
      blockerPosition.region,
      blockerStorageIndex,
    );
    const blocker = blockerIndex === null ? undefined : clear.world.terrain.tiles[blockerIndex];
    if (blocker === undefined) throw new Error("occlusion blocker left regional frame");
    blocker.terrain = "ridge";
    blocker.elevation = FIXED_POINT;
    const occluded = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [egretActor(occludedPatch)],
      patch: occludedPatch,
      tick: 361,
      window: clear.window,
      world: clear.world,
    })?.flatMap(({ observations }) => observations) ?? [];
    expect(hasObservationAt(occluded, clear.cuePosition)).toBe(false);
  });

  it("uses target-tick tide activity rather than a stale saved crab signal", () => {
    const fixture = visibleCueFixture(360);
    const tidal = projectCoreEcologyTidalTable(fixture.patch, 361);
    const crab = fixture.patch.aggregatePopulations.find(({ species }) => (
      species === "atlantic-marsh-fiddler-crab"
    ));
    const crabActivity = tidal?.aggregateActivities.find(({ aggregateId }) => (
      aggregateId === crab?.aggregateId
    ));
    const occupiedCrab = crab?.anchors.find(({ populationUnits }) => populationUnits > 0);
    if (tidal === null || crab === undefined || crabActivity === undefined || occupiedCrab === undefined) {
      throw new Error("fixture lacks crab activity");
    }
    expect(crabActivity.intensity).toBe(0);
    const stale = setCoreEcologyAggregateActivityIntensity(fixture.patch, {
      aggregateId: crab.aggregateId,
      atTick: 360,
      intensity: 900_000,
    });
    if (stale === null) throw new Error("could not install stale activity control");
    const staleEgret = egretActor(stale);
    const patch = replaceCoreEcologyAggregatePatchActor(
      stale,
      repositionCoreWildlifeActor(staleEgret, {
        atTick: 360,
        position: occupiedCrab.position,
        heading: staleEgret.address.heading,
      }),
    );
    const observations = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [egretActor(patch)],
      patch,
      tick: 361,
      window: fixture.window,
      world: fixture.world,
    })?.flatMap(({ observations: values }) => values) ?? [];
    expect(hasObservationAt(observations, occupiedCrab.position)).toBe(false);
  });

  it("retains the exact current observation that selects the nearest lawful wading anchor", () => {
    const { patch, world, window } = visibleCueFixture(360);
    const egret = egretActor(patch);
    const observations = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [egret],
      patch,
      tick: 361,
      window,
      world,
    })?.flatMap(({ observations: values }) => values) ?? [];
    const selected = [...observations].sort((left, right) => (
      right.salience - left.salience
      || right.confidence - left.confidence
      || left.id.localeCompare(right.id)
    ))[0];
    if (selected === undefined) throw new Error("fixture lacks lawful aquatic observation");
    const stepped = stepCoreEcologyAggregatePatch(patch, {
      tick: 361,
      actorSteps: [{
        actorId: egret.identity.stableId,
        observations,
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
        neutralActivityPreference: "observe",
      }],
    });
    if (stepped === null) throw new Error("egret cognition step rejected lawful observation");
    const activity = projectCoreEcologyActivity(stepped.patch, {
      actorId: egret.identity.stableId,
      atTick: 361,
    });
    expect(activity).toMatchObject({
      sourceObservationId: selected.id,
      state: "seeking-wading-ground",
      presentationSignal: "tidal-relocation-flight",
      motion: { kind: "target-area", verb: "seek-wading-ground" },
    });
    expect(serializeCoreEcologyAggregatePatch(stepped.patch)).toContain(selected.id);
    const restored = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(stepped.patch),
    );
    expect(projectCoreEcologyActivity(restored, {
      actorId: egret.identity.stableId,
      atTick: 361,
    })).toEqual(activity);
    const movement = stepCoreEcologyActivityMotion(stepped.patch, {
      actorId: egret.identity.stableId,
      atTick: 361,
      maximumStepUnits: 740,
    });
    expect(movement?.resolution).toBe("moved");
  });
});

function visibleCueFixture(tick: number): Readonly<{
  patch: CoreEcologyAggregatePatchState;
  cuePosition: ReturnType<typeof createWorldPosition>;
  world: WorldView;
  window: ReturnType<typeof createRegionalTerrainWindow>;
}> {
  const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
    rootSeed: SEED,
    originRegion: REGION,
    focus: {
      position: createWorldPosition(
        REGION,
        Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      ),
      radiusTiles: 32,
    },
  });
  const created = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: `tidal-perception:${tick}`,
    originRegion: REGION,
    tick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v5", habitat },
  });
  const tidalStep = stepCoreEcologyTidalTable(created, { atTick: tick });
  if (tidalStep === null) throw new Error("tidal fixture step failed");
  const projection = projectCoreEcologyTidalTable(tidalStep.patch, tick + 1);
  const cue = projection?.anchorDepths.find((depth) => (
    depth.activityUsable
    && (tidalStep.patch.aggregatePopulations
      .find(({ aggregateId }) => aggregateId === depth.aggregateId)
      ?.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0
    && (projection.aggregateActivities
      .find(({ aggregateId }) => aggregateId === depth.aggregateId)?.intensity ?? 0) > 0
  ));
  if (cue === undefined) throw new Error("tidal fixture lacks a visible aggregate cue");
  const egret = egretActor(tidalStep.patch);
  const patch = replaceCoreEcologyAggregatePatchActor(
    tidalStep.patch,
    repositionCoreWildlifeActor(egret, {
      atTick: tick,
      position: cue.position,
      heading: egret.address.heading,
    }),
  );

  const state = createWorld(SEED_TEXT, "standard");
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  for (const settlement of state.settlements) settlement.tileIndex = 0;
  const economy = createWorldView(state);
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
    regionalFrameOriginAtAddress({
      region: REGION,
      localX: Math.trunc(WORLD_WIDTH / 2),
      localY: Math.trunc(WORLD_HEIGHT / 2),
    }),
  );
  const world = createRegionalWorldView(
    economy,
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  return Object.freeze({ patch, cuePosition: cue.position, world, window });
}

function individualInputs(
  habitat:
    | ReturnType<typeof deriveCoreEcologyTidalTableHabitatAssemblage>
    | ReturnType<typeof deriveCoreEcologyWaterfowlHabitatAssemblage>,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: population.species === "snowy-egret"
              || population.species === "american-black-duck"
              ? "materialized" as const
              : "coarse" as const,
          })),
        }]
  ));
}

function egretActor(patch: CoreEcologyAggregatePatchState) {
  const actor = patch.populations.find(({ species }) => species === "snowy-egret")
    ?.members[0]?.actor;
  if (actor === undefined) throw new Error("tidal fixture lacks snowy egret");
  return actor;
}

function hasObservationAt(
  observations: readonly Readonly<{ area: Readonly<{ center: ReturnType<typeof createWorldPosition> }> }>[],
  position: ReturnType<typeof createWorldPosition>,
): boolean {
  return observations.some(({ area }) => (
    area.center.region.x === position.region.x
    && area.center.region.y === position.region.y
    && area.center.localX === position.localX
    && area.center.localY === position.localY
  ));
}
