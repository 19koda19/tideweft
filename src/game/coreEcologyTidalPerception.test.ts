import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  setCoreEcologyAggregateActivityIntensity,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  projectCoreEcologyActivity,
  stepCoreEcologyActivityMotion,
} from "./coreEcologyActivity";
import { deriveCoreEcologyAggregateStimulusFrame } from "./coreEcologyAggregatePerception";
import {
  deriveCoreEcologyTidalWebHabitatAssemblage,
  deriveCoreEcologyTidalTableHabitatAssemblage,
  deriveCoreEcologyWaterfowlHabitatAssemblage,
} from "./coreEcologyHabitat";
import { deriveCoreEcologyPolarShoreHabitat } from "./coreEcologyPolarShoreHabitat";
import { deriveCoreEcologyColdShoreHabitat } from "./coreEcologyColdShoreHabitat";
import { deriveCoreEcologyRegionalHabitat } from "./coreEcologyRegionalHabitat";
import {
  collectCoreEcologyAggregateActivityObservationBatches,
  collectCoreEcologyRootAggregateActivityObservationBatches,
} from "./coreEcologyPerception";
import { stepCoreEcologySmallWorld } from "./coreEcologySmallWorld";
import {
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
} from "./coreWildlifeActor";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
} from "./regionalTravel";
import { createRegionalWorldView, regionalTileIndexInView } from "./regionalWorldView";
import { createCoreEcologyRegionalResidentPatch } from "./regionalEcologyResidents";
import { createCoreEcologyPolarShoreResidentPatch } from "./regionalPolarShoreResidents";
import { createCoreEcologyColdShoreResidentPatch } from "./regionalColdShoreResidents";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

const SEED_TEXT = "tidal-triad-1";
const SEED = seedFromText(SEED_TEXT);
const REGION = createRegionCoord(0, 0);

export const ALPHA34_POLAR_CROSS_OWNER_EMERGENCE_OWNER_INTENT =
  "test:alpha34-polar-cross-owner-emergence:v1" as const;
export const ALPHA35_COLD_SHORE_EMERGENCE_OWNER_INTENT =
  "test:alpha35-cold-shore-emergence:v1" as const;

describe(`${ALPHA34_POLAR_CROSS_OWNER_EMERGENCE_OWNER_INTENT} capability-selected perception of tidal aggregates`, () => {
  it("composes one existing aerial observer with polar forage through shared owners", () => {
    const fixture = polarAerialObserverFixture(360);
    expect(fixture.gullOwner.derivation.kind).toBe("regional-habitat-v1");
    expect(fixture.gullOwner.populations.flatMap(({ members }) => members).filter(
      ({ materialization }) => materialization === "materialized",
    )).toHaveLength(1);
    expect(fixture.polarPatch.patchKey).not.toBe(fixture.gullOwner.patchKey);
    expect(fixture.polarPatch.populations).toEqual([]);

    const perceptionFrame = {
      actors: [fixture.gull],
      patches: [fixture.gullOwner, fixture.polarPatch],
      tick: 361,
      window: fixture.window,
      world: fixture.world,
    };
    const observed = collectCoreEcologyRootAggregateActivityObservationBatches(
      perceptionFrame,
    );
    const reordered = collectCoreEcologyRootAggregateActivityObservationBatches({
      ...perceptionFrame,
      patches: [...perceptionFrame.patches].reverse(),
    });
    expect(observed).not.toBeNull();
    expect(reordered).toEqual(observed);
    const observations = observed?.find(({ observerId }) => (
      observerId === fixture.gull.identity.stableId
    ))?.observations ?? [];
    const surfaceObservation = observations.find((observation) => (
      hasObservationAt([observation], fixture.cuePosition)
    ));
    expect(surfaceObservation).toMatchObject({
      observerId: fixture.gull.identity.stableId,
      observedAtTick: 361,
      channel: "vision",
      perceivedClass: "aquatic-activity",
      subjectId: null,
      identification: "classified",
      area: { center: fixture.cuePosition, radiusUnits: 0 },
    });
    const observationPayload = JSON.stringify(surfaceObservation);
    expect(observationPayload).not.toContain(fixture.school.aggregateId);
    expect(observationPayload).not.toContain(fixture.school.populationKey);
    expect(observationPayload).not.toContain("atlantic-capelin");
    expect(observationPayload).not.toContain("populationUnits");
    expect(surfaceObservation).not.toHaveProperty("aggregateId");
    expect(surfaceObservation).not.toHaveProperty("visibleAggregateCount");

    const visualSource = {
      sourceReferenceId: fixture.gull.identity.stableId,
      sourceSpecies: fixture.gull.identity.species,
      position: fixture.gull.address.position,
      movementSalience: FIXED_POINT,
    } as const;
    const responseInput = {
      patch: fixture.polarPatch,
      world: fixture.world,
      window: fixture.window,
      tick: 360,
      visualSources: [visualSource],
      exposedFoodSources: [],
    } as const;
    const stimulus = deriveCoreEcologyAggregateStimulusFrame(responseInput);
    const replayStimulus = deriveCoreEcologyAggregateStimulusFrame(responseInput);
    expect(stimulus).not.toBeNull();
    expect(replayStimulus).toEqual(stimulus);
    expect(stimulus?.stimuli).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceReferenceId: fixture.gull.identity.stableId,
        sourceKind: "gull",
        targetAggregateId: fixture.school.aggregateId,
        response: "pressure",
        channels: ["vision"],
      }),
    ]));

    const response = stepCoreEcologySmallWorld(fixture.polarPatch, 360, stimulus);
    const replayResponse = stepCoreEcologySmallWorld(
      fixture.polarPatch,
      360,
      replayStimulus,
    );
    expect(response).not.toBeNull();
    expect(replayResponse).toEqual(response);
    const gullEvents = response?.events.filter(({ sourceReferenceId }) => (
      sourceReferenceId === fixture.gull.identity.stableId
    )) ?? [];
    expect(gullEvents).toEqual([
      expect.objectContaining({
        displacedUnits: 1,
        mortality: "none",
        cargoInteraction: false,
        itemConsumption: "none",
      }),
    ]);
    expect(response?.events).toHaveLength(1);
    const afterSchool = response?.patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === fixture.school.aggregateId,
    );
    expect(afterSchool?.populationSize).toBe(fixture.school.populationSize);
    expect(afterSchool?.anchors.reduce(
      (sum, anchor) => sum + anchor.populationUnits,
      0,
    )).toBe(fixture.school.populationSize);
    const movedUnits = afterSchool?.anchors.reduce((sum, anchor) => {
      const before = fixture.school.anchors[anchor.anchorOrdinal];
      if (before === undefined) throw new Error("polar response changed anchor identity");
      return sum + Math.abs(anchor.populationUnits - before.populationUnits);
    }, 0) ?? 0;
    expect(movedUnits / 2).toBe(1);
    expect(movedUnits / 2).toBeLessThanOrEqual(1);
    expect(response?.patch.populations).toEqual([]);
    expect(response?.patch.groups.groups).toEqual([]);
    expect(response?.patch.nextMortalityOrdinal).toBe(
      fixture.polarPatch.nextMortalityOrdinal,
    );
    expect(response?.patch.mortalityTransactions).toEqual([]);
    expect(response?.patch.carcasses).toEqual([]);
    expect(JSON.stringify(response)).not.toMatch(/capture|reproduction/u);

    occludePosition(fixture.world, fixture.gull.address.position);
    const hidden = collectCoreEcologyRootAggregateActivityObservationBatches(
      perceptionFrame,
    );
    expect(hidden?.find(({ observerId }) => (
      observerId === fixture.gull.identity.stableId
    ))?.observations.some((observation) => (
      hasObservationAt([observation], fixture.cuePosition)
    ))).toBe(false);
    const hiddenStimulus = deriveCoreEcologyAggregateStimulusFrame(responseInput);
    expect(hiddenStimulus).not.toBeNull();
    expect(hiddenStimulus?.stimuli.some(({ sourceReferenceId }) => (
      sourceReferenceId === fixture.gull.identity.stableId
    ))).toBe(false);
    const hiddenResponse = stepCoreEcologySmallWorld(
      fixture.polarPatch,
      360,
      hiddenStimulus,
    );
    expect(hiddenResponse).not.toBeNull();
    expect(hiddenResponse?.events.some(({ sourceReferenceId }) => (
      sourceReferenceId === fixture.gull.identity.stableId
    ))).toBe(false);
  });

  it(`${ALPHA35_COLD_SHORE_EMERGENCE_OWNER_INTENT} lets one visible fox pressure the conserved school without inventing a catch`, () => {
    const fixture = coldShoreFoxFixture(360);
    const visualSource = {
      sourceReferenceId: fixture.fox.identity.stableId,
      sourceSpecies: fixture.fox.identity.species,
      position: fixture.fox.address.position,
      movementSalience: FIXED_POINT,
    } as const;
    const input = {
      patch: fixture.polarPatch,
      world: fixture.world,
      window: fixture.window,
      tick: 360,
      visualSources: [visualSource],
      exposedFoodSources: [],
    } as const;

    const stimulus = deriveCoreEcologyAggregateStimulusFrame(input);
    expect(stimulus).not.toBeNull();
    expect(stimulus?.stimuli).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceReferenceId: fixture.fox.identity.stableId,
        sourceKind: "arctic-fox",
        targetAggregateId: fixture.school.aggregateId,
        response: "pressure",
        channels: ["vision"],
      }),
    ]));
    const response = stepCoreEcologySmallWorld(fixture.polarPatch, 360, stimulus);
    expect(response).not.toBeNull();
    expect(response?.events).toEqual([
      expect.objectContaining({
        sourceReferenceId: fixture.fox.identity.stableId,
        displacedUnits: 1,
        mortality: "none",
        cargoInteraction: false,
        itemConsumption: "none",
      }),
    ]);
    const schoolAfter = response?.patch.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === fixture.school.aggregateId
    ));
    expect(schoolAfter?.populationSize).toBe(fixture.school.populationSize);
    expect(schoolAfter?.anchors.reduce(
      (sum, anchor) => sum + anchor.populationUnits,
      0,
    )).toBe(fixture.school.populationSize);
    expect(response?.patch.mortalityTransactions).toEqual([]);
    expect(response?.patch.carcasses).toEqual([]);
    expect(JSON.stringify(response)).not.toMatch(/capture|consumption|reproduction/u);

    occludePosition(fixture.world, fixture.fox.address.position);
    const hidden = deriveCoreEcologyAggregateStimulusFrame(input);
    expect(hidden).not.toBeNull();
    expect(hidden?.stimuli.some(({ sourceReferenceId }) => (
      sourceReferenceId === fixture.fox.identity.stableId
    ))).toBe(false);
    expect(stepCoreEcologySmallWorld(fixture.polarPatch, 360, hidden)?.events.some(
      ({ sourceReferenceId }) => sourceReferenceId === fixture.fox.identity.stableId,
    )).toBe(false);
  });

  it("keeps tidal cues visible across owner boundaries and source order", () => {
    const source = visibleCueFixture(360);
    const observerRegion = createRegionCoord(-1, 1);
    const observerHabitat = deriveCoreEcologyRegionalHabitat({
      seed: SEED,
      region: observerRegion,
    });
    const observerCreated = createCoreEcologyRegionalResidentPatch({
      seed: SEED,
      habitat: observerHabitat,
      tick: 360,
    });
    const ownedObserver = observerCreated.populations.find(({ species }) => (
      species === "snowy-egret"
    ))?.members[0]?.actor;
    if (ownedObserver === undefined) throw new Error("regional owner lacks egret observer");
    const observer = repositionCoreWildlifeActor(ownedObserver, {
      atTick: 360,
      position: source.cuePosition,
      heading: 0,
    });
    const observerOwner = setCoreEcologyAggregatePatchMaterializedActors(
      replaceCoreEcologyAggregatePatchActor(observerCreated, observer),
      { atTick: 360, actorIds: [observer.identity.stableId] },
    );
    expect(observerOwner.derivation.kind).toBe("regional-habitat-v1");
    expect(source.patch.populations.flatMap(({ members }) => members).some(({ actor }) => (
      actor.identity.stableId === observer.identity.stableId
    ))).toBe(false);

    const frame = {
      actors: [observer],
      patches: [source.patch, observerOwner],
      tick: 361,
      window: source.window,
      world: source.world,
    };
    const forward = collectCoreEcologyRootAggregateActivityObservationBatches(frame);
    const reverse = collectCoreEcologyRootAggregateActivityObservationBatches({
      ...frame,
      patches: [...frame.patches].reverse(),
    });
    expect(forward).not.toBeNull();
    expect(reverse).toEqual(forward);
    const observations = forward?.find(({ observerId }) => (
      observerId === observer.identity.stableId
    ))?.observations ?? [];
    expect(hasObservationAt(observations, source.cuePosition)).toBe(true);

    expect(collectCoreEcologyRootAggregateActivityObservationBatches({
      ...frame,
      patches: [source.patch],
    })).toBeNull();
    const duplicateOwner = canonicalizeCoreEcologyAggregatePatch({
      ...observerOwner,
      patchKey: `${observerOwner.patchKey}:duplicate`,
    });
    if (duplicateOwner === null) throw new Error("duplicate-owner control is malformed");
    expect(collectCoreEcologyRootAggregateActivityObservationBatches({
      ...frame,
      patches: [...frame.patches, duplicateOwner],
    })).toBeNull();
    expect(collectCoreEcologyRootAggregateActivityObservationBatches({
      ...frame,
      actors: [repositionCoreWildlifeActor(observer, {
        atTick: 360,
        position: translateWorldPosition(source.cuePosition, 1, 0),
        heading: observer.address.heading,
      })],
    })).toBeNull();
  });

  it("selects eligible surface observers, excludes other actors, and is permutation-stable", () => {
    const seedText = "otter habitat 0";
    const seed = seedFromText(seedText);
    const habitat = deriveCoreEcologyTidalWebHabitatAssemblage({
      rootSeed: seed,
      originRegion: REGION,
    });
    const created = createCoreEcologyAggregatePatch({
      seed,
      patchKey: "tidal-perception:tidal-web",
      originRegion: REGION,
      tick: 360,
      populations: individualInputs(habitat, {
        includeGull: true,
        includeIneligibleActor: true,
      }),
      derivation: { kind: "habitat-v7", habitat },
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
    for (const species of [
      "snowy-egret",
      "american-black-duck",
      "north-american-river-otter",
      "gull",
    ] as const) {
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
    const otter = patch.populations.find(
      ({ species }) => species === "north-american-river-otter",
    )?.members[0]?.actor;
    const gull = patch.populations.find(({ species }) => species === "gull")
      ?.members[0]?.actor;
    const harrier = patch.populations.find(({ species }) => species === "northern-harrier")
      ?.members[0]?.actor;
    if (duck === undefined || otter === undefined || gull === undefined || harrier === undefined) {
      throw new Error("Tidal-web fixture lacks a representative observer or exclusion actor");
    }
    const batches = collectCoreEcologyAggregateActivityObservationBatches({
      actors: [egret, duck, otter, gull, harrier].reverse(),
      patch,
      tick: 361,
      window,
      world,
    });
    expect(batches?.map(({ observerId }) => observerId)).toEqual(
      [duck.identity.stableId, egret.identity.stableId, gull.identity.stableId, otter.identity.stableId]
        .sort(),
    );
    expect(batches).toHaveLength(4);
    expect(batches?.some(({ observerId }) => observerId === harrier.identity.stableId)).toBe(false);
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
      actors: [harrier, gull, otter, egret, duck],
      patch,
      tick: 361,
      window,
      world,
    });
    expect(repeated).toEqual(batches);

    const gullBatch = batches?.find(({ observerId }) => (
      observerId === gull.identity.stableId
    ));
    const observedGull = gullBatch === undefined
      ? null
      : stepCoreWildlifeActor(gull, {
          tick: 361,
          observations: gullBatch.observations,
          foodOpportunities: [],
          accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
          neutralActivityPreference: "observe",
        });
    if (observedGull === null) throw new Error("Shared surface cue did not reach the gull");
    const observedPatch = replaceCoreEcologyAggregatePatchActor(patch, observedGull.actor);
    expect(projectCoreEcologyActivity(observedPatch, {
      actorId: gull.identity.stableId,
      atTick: 361,
    })).toMatchObject({
      state: "surface-circling",
      sourceObservationId: gullBatch?.observations[0]?.id,
      presentationSignal: "surface-opportunity-flight",
      motion: { kind: "hold-position" },
    });
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

function coldShoreFoxFixture(tick: number) {
  const seedText = "polar habitat fuzz 29";
  const seed = seedFromText(seedText);
  const region = createRegionCoord(-1_653, 664);
  const coldHabitat = deriveCoreEcologyColdShoreHabitat({ seed, region });
  if (coldHabitat.totalPopulationUnits !== 1) {
    throw new Error("cold-shore emergence fixture lacks its solitary fox");
  }
  const polarHabitat = deriveCoreEcologyPolarShoreHabitat({ seed, region });
  const polarPatch = createCoreEcologyPolarShoreResidentPatch({
    seed,
    habitat: polarHabitat,
    tick,
  });
  const school = polarPatch.aggregatePopulations.find(({ species }) => (
    species === "atlantic-capelin"
  ));
  const tidal = projectCoreEcologyTidalTable(polarPatch, tick + 1);
  const cue = tidal?.anchorDepths.find((depth) => (
    depth.activityUsable
    && depth.aggregateId === school?.aggregateId
    && (school.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0
    && (tidal.aggregateActivities.find(({ aggregateId }) => (
      aggregateId === depth.aggregateId
    ))?.intensity ?? 0) > 0
  ));
  if (school === undefined || cue === undefined) {
    throw new Error("cold-shore emergence fixture lacks an active capelin cue");
  }

  const createdFoxOwner = createCoreEcologyColdShoreResidentPatch({
    seed,
    habitat: coldHabitat,
    tick,
  });
  const existingFox = createdFoxOwner.populations[0]?.members[0]?.actor;
  if (existingFox === undefined) {
    throw new Error("cold-shore emergence fixture lacks its addressable fox");
  }
  const materializedFoxOwner = setCoreEcologyAggregatePatchMaterializedActors(
    createdFoxOwner,
    { atTick: tick, actorIds: [existingFox.identity.stableId] },
  );
  const materializedFox = materializedFoxOwner.populations[0]?.members[0]?.actor;
  if (materializedFox === undefined) {
    throw new Error("cold-shore emergence fixture failed to materialize its fox");
  }
  const fox = repositionCoreWildlifeActor(materializedFox, {
    atTick: tick,
    position: translateWorldPosition(
      cue.position,
      -4 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    ),
    heading: 0,
  });

  const state = createWorld(seedText, "standard");
  state.meta.completedTick = tick;
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
      region,
      localX: Math.trunc(cue.position.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.trunc(cue.position.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const world = createRegionalWorldView(
    economy,
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  for (const tile of world.terrain.tiles) {
    tile.terrain = "meadow";
    tile.elevation = 0;
    tile.roughness = 0;
  }
  return Object.freeze({ fox, polarPatch, school, window, world });
}

function polarAerialObserverFixture(tick: number) {
  const seedText = "polar cross owner 0";
  const seed = seedFromText(seedText);
  const region = createRegionCoord(4, -14);
  const habitat = deriveCoreEcologyPolarShoreHabitat({ seed, region });
  if (habitat.totalPopulationUnits === 0) {
    throw new Error("polar cross-owner fixture lacks its forage school");
  }
  const polarPatch = createCoreEcologyPolarShoreResidentPatch({
    seed,
    habitat,
    tick,
  });
  const school = polarPatch.aggregatePopulations.find(({ species }) => (
    species === "atlantic-capelin"
  ));
  const projection = projectCoreEcologyTidalTable(polarPatch, tick + 1);
  const cue = projection?.anchorDepths.find((depth) => (
    depth.activityUsable
    && depth.aggregateId === school?.aggregateId
    && (school.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0
    && (projection.aggregateActivities.find(({ aggregateId }) => (
      aggregateId === depth.aggregateId
    ))?.intensity ?? 0) > 0
  ));
  if (school === undefined || cue === undefined) {
    throw new Error("polar cross-owner fixture lacks an active lawful cue");
  }

  const gullPosition = translateWorldPosition(
    cue.position,
    -4 * WORLD_POSITION_UNITS_PER_TILE,
    0,
  );
  const regionalHabitat = deriveCoreEcologyRegionalHabitat({ seed, region });
  const createdGullOwner = createCoreEcologyRegionalResidentPatch({
    seed,
    habitat: regionalHabitat,
    tick,
  });
  const existingGull = createdGullOwner.populations.find(({ species }) => (
    species === "gull"
  ))?.members[0]?.actor;
  if (existingGull === undefined) {
    throw new Error("polar cross-owner fixture lacks its existing gull");
  }
  const materializedGullOwner = setCoreEcologyAggregatePatchMaterializedActors(
    createdGullOwner,
    { atTick: tick, actorIds: [existingGull.identity.stableId] },
  );
  const materializedGull = materializedGullOwner.populations.find(({ species }) => (
    species === "gull"
  ))?.members.find(({ actor }) => (
    actor.identity.stableId === existingGull.identity.stableId
  ))?.actor;
  if (materializedGull === undefined) {
    throw new Error("polar cross-owner fixture failed to materialize its gull");
  }
  const gull = repositionCoreWildlifeActor(materializedGull, {
    atTick: tick,
    position: gullPosition,
    heading: 0,
  });
  const gullOwner = replaceCoreEcologyAggregatePatchActor(
    materializedGullOwner,
    gull,
  );

  const state = createWorld(seedText, "standard");
  state.meta.completedTick = tick;
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
      region,
      localX: Math.trunc(WORLD_WIDTH / 2),
      localY: Math.trunc(WORLD_HEIGHT / 2),
    }),
  );
  const world = createRegionalWorldView(
    economy,
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  for (const tile of world.terrain.tiles) {
    tile.terrain = "meadow";
    tile.elevation = 0;
    tile.roughness = 0;
  }
  return Object.freeze({
    cuePosition: cue.position,
    gull,
    gullOwner,
    polarPatch,
    school,
    window,
    world,
  });
}

function occludePosition(
  world: WorldView,
  position: ReturnType<typeof createWorldPosition>,
) {
  for (const [offsetX, offsetY] of [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ] as const) {
    const blockerPosition = translateWorldPosition(
      position,
      offsetX * WORLD_POSITION_UNITS_PER_TILE,
      offsetY * WORLD_POSITION_UNITS_PER_TILE,
    );
    const storageIndex = Math.floor(blockerPosition.localY / WORLD_POSITION_UNITS_PER_TILE)
      * WORLD_WIDTH
      + Math.floor(blockerPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
    const blockerIndex = regionalTileIndexInView(
      world,
      blockerPosition.region,
      storageIndex,
    );
    const blocker = blockerIndex === null ? undefined : world.terrain.tiles[blockerIndex];
    if (blocker === undefined) {
      throw new Error("polar cross-owner occluder left the active frame");
    }
    blocker.terrain = "ridge";
    blocker.elevation = FIXED_POINT;
  }
}

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
    | ReturnType<typeof deriveCoreEcologyWaterfowlHabitatAssemblage>
    | ReturnType<typeof deriveCoreEcologyTidalWebHabitatAssemblage>,
  options: Readonly<{
    includeGull?: boolean;
    includeIneligibleActor?: boolean;
  }> = {},
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
            materialization: (
              population.species === "snowy-egret"
              || population.species === "american-black-duck"
              || population.species === "north-american-river-otter"
              || (options.includeGull === true
                && population.species === "gull"
                && allocation.allocationOrdinal === 0)
              || (options.includeIneligibleActor === true
                && population.species === "northern-harrier"
                && allocation.allocationOrdinal === 0)
            )
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
