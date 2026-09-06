import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { tideAtTick } from "../sim/terrain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS,
  CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
  type CoreWildlifeMaterialization,
} from "./coreEcology";
import {
  coreEcologyActivityTravelMedium,
  projectCoreEcologyActivity,
  stepCoreEcologyActivityMotion,
} from "./coreEcologyActivity";
import {
  CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH,
  CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES_EVALUATION_BUDGET,
  CORE_ECOLOGY_WATERFOWL_MAX_ANCHOR_RECORDS,
  deriveCoreEcologyWaterfowlHabitatAssemblage,
  type CoreEcologyWaterfowlHabitatAssemblage,
  type CoreEcologyWaterfowlHabitatSpecies,
} from "./coreEcologyHabitat";
import {
  collectCoreEcologyAggregateActivityObservationBatches,
  type CoreEcologyObservationBatch,
} from "./coreEcologyPerception";
import {
  setCoreEcologyMaterializationForWindow,
} from "./coreEcologyRuntime";
import {
  CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS,
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import {
  coreEcologySpeciesHasRuntimeCapability,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  repositionCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  MAX_LIVING_ACTOR_TRAVERSABILITY_CELLS,
  createLivingActorTraversabilitySurface,
} from "./livingActorLocomotion";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

export const OWNER_INTENT = "test:core-ecology-waterfowl-performance:v1" as const;

const SEED_TEXT = "waterfowl habitat 1";
const SEED = seedFromText(SEED_TEXT);
const ORIGIN = createRegionCoord(0, 0);
const SIGNED_REGION = createRegionCoord(-17, 29);
const EXTREME_REGION = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
const UTF8_ENCODER = new TextEncoder();

// These intentionally generous shared-runner ceilings catch unbounded work;
// packaged desktop/mobile smoke remains the authority for real frame rate.
const HABITAT_AND_PATCH_BUDGET_MS = 15_000;
const FULL_TIDE_SOAK_TICKS = 720;
const FULL_TIDE_SOAK_BUDGET_MS = 15_000;
const PROJECTION_FRAMES = 384;
const PROJECTION_BUDGET_MS = 12_000;
const OBSERVATION_BRIDGE_FRAMES = 32;
const OBSERVATION_BRIDGE_BUDGET_MS = 8_000;
const SURFACE_ROUTE_SAMPLES = 32;
const SURFACE_ROUTE_BUDGET_MS = 5_000;
const CANDIDATE_SAVE_BUDGET_BYTES = 768 * 1_024;
const MAX_AGGREGATE_ANCHOR_RECORDS =
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS * CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS;

interface Candidate {
  readonly habitat: CoreEcologyWaterfowlHabitatAssemblage;
  readonly replayHabitat: CoreEcologyWaterfowlHabitatAssemblage;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly replayPatch: CoreEcologyAggregatePatchState;
  readonly region: RegionCoord;
}

interface TidalSoakResult {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly maximumDepthRecords: number;
  readonly maximumRedistributions: number;
  readonly totalRedistributions: number;
  readonly sawFallingTide: boolean;
  readonly sawRisingTide: boolean;
}

describe("Alpha-20 waterfowl shared-abstraction budgets", () => {
  it("bounds deterministic v6 habitat, tide, perception, multimodal motion, and save work", () => {
    const habitatStarted = performance.now();
    const candidates: readonly Candidate[] = [ORIGIN, SIGNED_REGION, EXTREME_REGION]
      .map((region, index) => {
        const habitat = deriveCoreEcologyWaterfowlHabitatAssemblage({
          rootSeed: SEED,
          originRegion: region,
        });
        const replayHabitat = deriveCoreEcologyWaterfowlHabitatAssemblage({
          rootSeed: SEED,
          originRegion: region,
        });
        const patch = createCandidatePatch(habitat, region, `performance:waterfowl:${index}`);
        const replayPatch = createCandidatePatch(
          replayHabitat,
          region,
          `performance:waterfowl:${index}`,
        );
        return Object.freeze({ habitat, replayHabitat, patch, replayPatch, region });
      });
    const habitatAndPatchMs = performance.now() - habitatStarted;
    for (const { habitat, replayHabitat, patch, replayPatch, region } of candidates) {
      expect(replayHabitat).toEqual(habitat);
      expect(serializeCoreEcologyAggregatePatch(replayPatch))
        .toBe(serializeCoreEcologyAggregatePatch(patch));
      expect(patch).toMatchObject({
        derivation: { kind: "habitat-v6" },
        originRegion: region,
      });
    }
    const candidate = candidates[0];
    if (candidate === undefined) throw new Error("Waterfowl origin candidate is missing");
    requireCompleteWaterfowlWeb(candidate.patch);

    const soakStarted = performance.now();
    const soak = runFullTideSoak(candidate.patch);
    const soakMs = performance.now() - soakStarted;
    const replay = runFullTideSoak(candidate.patch);
    expect(serializeCoreEcologyAggregatePatch(replay.patch))
      .toBe(serializeCoreEcologyAggregatePatch(soak.patch));
    expect({
      maximumDepthRecords: replay.maximumDepthRecords,
      maximumRedistributions: replay.maximumRedistributions,
      totalRedistributions: replay.totalRedistributions,
      sawFallingTide: replay.sawFallingTide,
      sawRisingTide: replay.sawRisingTide,
    }).toEqual({
      maximumDepthRecords: soak.maximumDepthRecords,
      maximumRedistributions: soak.maximumRedistributions,
      totalRedistributions: soak.totalRedistributions,
      sawFallingTide: soak.sawFallingTide,
      sawRisingTide: soak.sawRisingTide,
    });

    const candidateWorld = observationWorld();
    let materialized = setCoreEcologyMaterializationForWindow(
      soak.patch,
      candidateWorld.window,
      soak.patch.updatedAtTick,
    );
    if (materialized === null) throw new Error("Waterfowl materialization failed closed");
    const currentTide = stepCoreEcologyTidalTable(materialized, {
      atTick: materialized.updatedAtTick,
    });
    if (currentTide === null) throw new Error("Waterfowl post-soak tide step failed closed");
    expect(currentTide).toMatchObject({
      cargoInteraction: false,
      itemConsumption: "none",
      mortality: "none",
      patch: { derivation: { kind: "habitat-v6" } },
    });
    materialized = currentTide.patch;
    const bridgeTick = materialized.updatedAtTick + 1;
    const bridgeProjection = projectCoreEcologyTidalTable(materialized, bridgeTick);
    const cue = activeOccupiedAquaticCue(materialized, bridgeProjection);
    if (cue === null) throw new Error("Waterfowl bridge fixture lacks active aquatic activity");
    for (const actor of materializedWildlife(materialized).filter(isAquaticForager)) {
      materialized = replaceCoreEcologyAggregatePatchActor(
        materialized,
        repositionCoreWildlifeActor(actor, {
          atTick: materialized.updatedAtTick,
          position: cue,
          heading: actor.address.heading,
        }),
      );
    }

    const bridgeActors = materializedWildlife(materialized);
    const duckBridgeActor = bridgeActors.find(({ identity }) => (
      identity.species === "american-black-duck"
    ));
    if (duckBridgeActor === undefined) {
      throw new Error("Waterfowl observation bridge lacks its representative duck actor");
    }
    const aquaticForagerIds = bridgeActors
      .filter(isAquaticForager)
      .map(({ identity }) => identity.stableId)
      .sort(compareText);
    const bridgeInput = Object.freeze({
      actors: Object.freeze([...bridgeActors].reverse()),
      patch: materialized,
      tick: bridgeTick,
      window: candidateWorld.window,
      world: candidateWorld.world,
    });
    const initialBatches = collectCoreEcologyAggregateActivityObservationBatches(bridgeInput);
    if (initialBatches === null) throw new Error("Waterfowl observation bridge failed closed");
    expect(initialBatches.map(({ observerId }) => observerId)).toEqual(aquaticForagerIds);
    expect(initialBatches.find(({ observerId }) => (
      observerId === duckBridgeActor.identity.stableId
    ))?.observations.length ?? 0).toBeGreaterThan(0);
    expect(initialBatches.length).toBeGreaterThan(0);
    expect(initialBatches.every(({ observations }) => (
      observations.length > 0
      && observations.every((observation) => (
        observation.channel === "vision"
        && observation.perceivedClass === "aquatic-activity"
        && observation.subjectId === null
      ))
    ))).toBe(true);

    // The separately capped aggregate bridge is measured independently of
    // habitat construction, tide soak, projections, and surface pathfinding.
    collectCoreEcologyAggregateActivityObservationBatches(bridgeInput);
    let repeatedBatches: readonly CoreEcologyObservationBatch[] = initialBatches;
    const bridgeStarted = performance.now();
    for (let frame = 0; frame < OBSERVATION_BRIDGE_FRAMES; frame += 1) {
      const batches = collectCoreEcologyAggregateActivityObservationBatches(bridgeInput);
      if (batches === null) {
        throw new Error(`Waterfowl observation bridge frame ${frame} failed closed`);
      }
      repeatedBatches = batches;
    }
    const observationBridgeMs = performance.now() - bridgeStarted;
    expect(repeatedBatches).toEqual(initialBatches);

    const observationsByActor = new Map(
      initialBatches.map((batch) => [batch.observerId, batch.observations] as const),
    );
    const observedStep = stepCoreEcologyAggregatePatch(materialized, {
      tick: bridgeTick,
      actorSteps: bridgeActors.map((actor) => ({
        actorId: actor.identity.stableId,
        observations: observationsByActor.get(actor.identity.stableId) ?? [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
        neutralActivityPreference: "observe" as const,
      })),
    });
    if (observedStep === null) throw new Error("Waterfowl shared actor step failed closed");
    expect(observedStep.resourceClaims).toEqual([]);

    const motion = surfaceMotionFixture(candidate.habitat);
    const projectionStarted = performance.now();
    for (let frame = 0; frame < PROJECTION_FRAMES; frame += 1) {
      if (projectCoreEcologyTidalTable(observedStep.patch, bridgeTick) === null) {
        throw new Error(`Waterfowl tidal projection ${frame} failed closed`);
      }
      if (projectCoreEcologyActivity(motion.airPatch, motion.input) === null) {
        throw new Error(`Waterfowl aerial activity projection ${frame} failed closed`);
      }
      if (projectCoreEcologyActivity(motion.surfacePatch, motion.input) === null) {
        throw new Error(`Waterfowl surface activity projection ${frame} failed closed`);
      }
    }
    const projectionMs = performance.now() - projectionStarted;

    const firstSurfaceStep = stepCoreEcologyActivityMotion(motion.surfacePatch, {
      ...motion.input,
      maximumStepUnits: 720,
      surface: motion.surface,
    });
    if (firstSurfaceStep?.resolution !== "moved") {
      throw new Error("Waterfowl surface activity did not use shared locomotion");
    }
    let repeatedSurfaceStep = firstSurfaceStep;
    const surfaceRouteStarted = performance.now();
    for (let sample = 0; sample < SURFACE_ROUTE_SAMPLES; sample += 1) {
      const stepped = stepCoreEcologyActivityMotion(motion.surfacePatch, {
        ...motion.input,
        maximumStepUnits: 720,
        surface: motion.surface,
      });
      if (stepped?.resolution !== "moved") {
        throw new Error(`Waterfowl surface route sample ${sample} failed closed`);
      }
      repeatedSurfaceStep = stepped;
    }
    const surfaceRouteMs = performance.now() - surfaceRouteStarted;
    expect(serializeCoreEcologyAggregatePatch(repeatedSurfaceStep.patch))
      .toBe(serializeCoreEcologyAggregatePatch(firstSurfaceStep.patch));

    const materializedActors = materializedWildlife(observedStep.patch);
    const saveBytes = UTF8_ENCODER.encode(
      serializeCoreEcologyAggregatePatch(observedStep.patch),
    ).byteLength;
    const allocationCount = candidate.habitat.populations.reduce(
      (sum, population) => sum + population.allocations.length,
      0,
    );
    const observationCount = countObservations(initialBatches);

    expect(habitatAndPatchMs).toBeLessThan(HABITAT_AND_PATCH_BUDGET_MS);
    expect(soakMs).toBeLessThan(FULL_TIDE_SOAK_BUDGET_MS);
    expect(projectionMs).toBeLessThan(PROJECTION_BUDGET_MS);
    expect(observationBridgeMs).toBeLessThan(OBSERVATION_BRIDGE_BUDGET_MS);
    expect(surfaceRouteMs).toBeLessThan(SURFACE_ROUTE_BUDGET_MS);
    expect(saveBytes).toBeLessThan(CANDIDATE_SAVE_BUDGET_BYTES);
    expect(saveBytes).toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);
    expect(candidate.habitat.speciesEvaluations)
      .toBeLessThanOrEqual(CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES_EVALUATION_BUDGET);
    expect(allocationCount)
      .toBeLessThanOrEqual(CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS);
    expect(candidate.habitat.tidalAnchors.length)
      .toBeLessThanOrEqual(CORE_ECOLOGY_WATERFOWL_MAX_ANCHOR_RECORDS);
    expect(materializedActors.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(materializedActors.some(({ identity }) => (
      identity.species === "american-black-duck"
    ))).toBe(true);
    expect(observedStep.patch.aggregatePopulations.reduce(
      (sum, population) => sum + population.anchors.length,
      0,
    )).toBeLessThanOrEqual(MAX_AGGREGATE_ANCHOR_RECORDS);
    expect(observedStep.patch.aggregatePopulations.every((population) => (
      population.evidence.length <= CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE
      && population.disturbances.length <= CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES
      && population.evidence.every(({ itemConsumption }) => itemConsumption === "none")
      && population.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0)
        === population.populationSize
      && population.disturbances.every((disturbance) => (
        disturbance.nonlethal
        && !disturbance.cargoInteraction
        && disturbance.itemConsumption === "none"
      ))
    ))).toBe(true);
    expect(soak.maximumDepthRecords)
      .toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS);
    expect(soak.maximumRedistributions)
      .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS);
    expect(soak.sawRisingTide).toBe(true);
    expect(soak.sawFallingTide).toBe(true);
    expect(initialBatches.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(observationCount).toBeLessThanOrEqual(
      initialBatches.length * CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS,
    );
    expect(motion.surface.cells.length).toBeLessThanOrEqual(
      MAX_LIVING_ACTOR_TRAVERSABILITY_CELLS,
    );

    console.info("[waterfowl-performance]", JSON.stringify({
      ownerIntent: OWNER_INTENT,
      allocationCount,
      aquaticForagers: aquaticForagerIds.length,
      habitatAndPatchMs: rounded(habitatAndPatchMs),
      materializedActors: materializedActors.length,
      maximumDepthRecords: soak.maximumDepthRecords,
      maximumRedistributions: soak.maximumRedistributions,
      observationBridgeFrames: OBSERVATION_BRIDGE_FRAMES,
      observationBridgeMs: rounded(observationBridgeMs),
      observations: observationCount,
      projectionFrames: PROJECTION_FRAMES,
      projectionMs: rounded(projectionMs),
      saveBytes,
      soakMs: rounded(soakMs),
      soakTicks: FULL_TIDE_SOAK_TICKS,
      surfaceRouteMs: rounded(surfaceRouteMs),
      surfaceRouteSamples: SURFACE_ROUTE_SAMPLES,
      totalRedistributions: soak.totalRedistributions,
    }));
  }, 60_000);
});

function createCandidatePatch(
  habitat: CoreEcologyWaterfowlHabitatAssemblage,
  region: RegionCoord,
  patchKey: string,
  selectMaterialization: (
    species: CoreEcologyWaterfowlHabitatSpecies,
  ) => CoreWildlifeMaterialization = () => "coarse",
): CoreEcologyAggregatePatchState {
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey,
    originRegion: region,
    tick: 360,
    populations: individualInputs(habitat, selectMaterialization),
    derivation: { kind: "habitat-v6", habitat },
  });
}

function individualInputs(
  habitat: CoreEcologyWaterfowlHabitatAssemblage,
  selectMaterialization: (
    species: CoreEcologyWaterfowlHabitatSpecies,
  ) => CoreWildlifeMaterialization,
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
            materialization: selectMaterialization(population.species),
          })),
        }]
  ));
}

function runFullTideSoak(initial: CoreEcologyAggregatePatchState): TidalSoakResult {
  let patch = initial;
  let maximumDepthRecords = 0;
  let maximumRedistributions = 0;
  let totalRedistributions = 0;
  let sawFallingTide = false;
  let sawRisingTide = false;
  const conserved = new Map(initial.aggregatePopulations.map((population) => (
    [population.aggregateId, population.populationSize] as const
  )));

  for (let step = 0; step < FULL_TIDE_SOAK_TICKS; step += 1) {
    const tidal = stepCoreEcologyTidalTable(patch, { atTick: patch.updatedAtTick });
    if (tidal === null) throw new Error(`Waterfowl tide soak step ${step} failed closed`);
    if (
      tidal.mortality !== "none"
      || tidal.cargoInteraction
      || tidal.itemConsumption !== "none"
    ) throw new Error("Waterfowl tide soak crossed its nonlethal item boundary");
    sawFallingTide ||= tidal.projection.tide.direction < 0;
    sawRisingTide ||= tidal.projection.tide.direction > 0;
    maximumDepthRecords = Math.max(maximumDepthRecords, tidal.projection.anchorDepths.length);
    maximumRedistributions = Math.max(maximumRedistributions, tidal.redistributions.length);
    totalRedistributions += tidal.redistributions.length;
    for (const population of tidal.patch.aggregatePopulations) {
      const expected = conserved.get(population.aggregateId);
      if (
        expected === undefined
        || population.populationSize !== expected
        || population.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0)
          !== expected
      ) throw new Error(`Waterfowl tide soak failed to conserve ${population.aggregateId}`);
    }
    const advanced = stepCoreEcologyAggregatePatch(tidal.patch, {
      tick: tidal.patch.updatedAtTick + 1,
      actorSteps: [],
    });
    if (advanced === null) throw new Error(`Waterfowl clock step ${step} failed closed`);
    patch = advanced.patch;
  }

  return Object.freeze({
    patch,
    maximumDepthRecords,
    maximumRedistributions,
    totalRedistributions,
    sawFallingTide,
    sawRisingTide,
  });
}

function observationWorld() {
  const state = createWorld(SEED_TEXT, "standard");
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  for (const settlement of state.settlements) settlement.tileIndex = 0;
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center: ORIGIN }),
    regionalFrameOriginAtAddress({
      region: ORIGIN,
      localX: Math.trunc(WORLD_WIDTH / 2),
      localY: Math.trunc(WORLD_HEIGHT / 2),
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  return Object.freeze({ window, world });
}

function activeOccupiedAquaticCue(
  patch: CoreEcologyAggregatePatchState,
  tidal: ReturnType<typeof projectCoreEcologyTidalTable>,
) {
  if (tidal === null) return null;
  return tidal.anchorDepths.find((depth) => (
    depth.activityUsable
    && (patch.aggregatePopulations
      .find(({ aggregateId }) => aggregateId === depth.aggregateId)
      ?.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0
    && (tidal.aggregateActivities
      .find(({ aggregateId }) => aggregateId === depth.aggregateId)?.intensity ?? 0) > 0
  ))?.position ?? null;
}

function surfaceMotionFixture(habitat: CoreEcologyWaterfowlHabitatAssemblage) {
  const activityPatch = createCandidatePatch(
    habitat,
    ORIGIN,
    "performance:waterfowl:motion",
    (species) => species === "american-black-duck"
      ? "materialized"
      : "coarse",
  );
  const actor = materializedWildlife(activityPatch).find(({ identity }) => (
    identity.species === "american-black-duck"
  ));
  if (actor === undefined) throw new Error("Waterfowl motion fixture lacks an aquatic actor");
  const tide = tideAtTick(activityPatch.updatedAtTick);
  const dabbling = habitat.tidalAnchors.find((anchor) => (
    anchor.species === actor.identity.species
    && anchor.purpose === "dabbling"
    && tide.level - anchor.elevation
      >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
  ));
  const refuge = habitat.tidalAnchors.find((anchor) => (
    anchor.species === actor.identity.species && anchor.purpose === "refuge"
  ));
  if (dabbling === undefined || refuge === undefined) {
    throw new Error("Waterfowl motion fixture lacks authenticated tidal destinations");
  }

  const input = Object.freeze({
    actorId: actor.identity.stableId,
    atTick: activityPatch.updatedAtTick,
  });
  const airPatch = replaceCoreEcologyAggregatePatchActor(
    activityPatch,
    repositionCoreWildlifeActor(actor, {
      atTick: activityPatch.updatedAtTick,
      position: refuge.position,
      heading: actor.address.heading,
    }),
  );
  const airActivity = projectCoreEcologyActivity(airPatch, input);
  if (
    airActivity === null
    || airActivity.motion.kind !== "target-area"
    || coreEcologyActivityTravelMedium(airActivity.motion) !== "air"
  ) throw new Error("Waterfowl refuge did not select shared aerial travel");

  const offsetX = dabbling.position.localX
    < WORLD_WIDTH * WORLD_POSITION_UNITS_PER_TILE / 2
    ? 2 * WORLD_POSITION_UNITS_PER_TILE
    : -2 * WORLD_POSITION_UNITS_PER_TILE;
  const surfacePatch = replaceCoreEcologyAggregatePatchActor(
    activityPatch,
    repositionCoreWildlifeActor(actor, {
      atTick: activityPatch.updatedAtTick,
      position: translateWorldPosition(dabbling.position, offsetX, 0),
      heading: actor.address.heading,
    }),
  );
  const surfaceActivity = projectCoreEcologyActivity(surfacePatch, input);
  if (
    surfaceActivity === null
    || surfaceActivity.motion.kind !== "target-area"
    || coreEcologyActivityTravelMedium(surfaceActivity.motion) !== "surface-water"
  ) throw new Error("Waterfowl dabbling route did not select shared surface-water travel");
  const surface = createLivingActorTraversabilitySurface({
    forActorId: actor.identity.stableId,
    sampledAtTick: activityPatch.updatedAtTick,
    origin: createWorldPosition(ORIGIN, 0, 0),
    widthTiles: WORLD_WIDTH,
    heightTiles: WORLD_HEIGHT,
    cells: Array.from(
      { length: WORLD_WIDTH * WORLD_HEIGHT },
      () => Object.freeze({ access: "open" as const, travelCost: 300_000 }),
    ),
  });
  const target = surfaceActivity.motion.targetArea.center;
  const before = worldPositionDelta(actorPosition(surfacePatch, actor.identity.stableId), target);
  const check = stepCoreEcologyActivityMotion(surfacePatch, {
    ...input,
    maximumStepUnits: 720,
    surface,
  });
  if (check?.resolution !== "moved") {
    throw new Error("Waterfowl surface movement fixture failed its warm step");
  }
  const after = worldPositionDelta(actorPosition(check.patch, actor.identity.stableId), target);
  expect(Math.hypot(after.x, after.y)).toBeLessThan(Math.hypot(before.x, before.y));
  return Object.freeze({ airPatch, input, surface, surfacePatch });
}

function requireCompleteWaterfowlWeb(patch: CoreEcologyAggregatePatchState): void {
  if (!patch.aggregatePopulations.some(({ species }) => species === "atlantic-silverside")) {
    throw new Error("Measured waterfowl seed omitted its schooling forage aggregate");
  }
  if (!patch.aggregatePopulations.some(({ species }) => (
    species === "atlantic-marsh-fiddler-crab"
  ))) throw new Error("Measured waterfowl seed omitted its tidal invertebrate aggregate");
  if (!patch.populations.some(({ species, members }) => (
    species === "american-black-duck" && members.length === 1
  ))) throw new Error("Measured waterfowl seed omitted its bounded duck actor");
  const materializableForagers = patch.populations.flatMap(({ members }) => members)
    .filter(({ actor }) => isAquaticForager(actor));
  if (materializableForagers.length < 2) {
    throw new Error("Measured waterfowl seed omitted its shared aquatic-forager roles");
  }
}

function materializedWildlife(
  patch: CoreEcologyAggregatePatchState,
): readonly CoreWildlifeActorState[] {
  return patch.populations.flatMap(({ members }) => members)
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actor);
}

function isAquaticForager(actor: CoreWildlifeActorState): boolean {
  return coreEcologySpeciesHasRuntimeCapability(actor.identity.species, "aquatic-foraging");
}

function actorPosition(patch: CoreEcologyAggregatePatchState, actorId: string) {
  const actor = patch.populations.flatMap(({ members }) => members)
    .find(({ actor: candidate }) => candidate.identity.stableId === actorId)?.actor;
  if (actor === undefined) throw new Error(`Waterfowl fixture lost actor ${actorId}`);
  return actor.address.position;
}

function countObservations(batches: readonly CoreEcologyObservationBatch[]): number {
  return batches.reduce((sum, batch) => sum + batch.observations.length, 0);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
