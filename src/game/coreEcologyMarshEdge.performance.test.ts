import { describe, expect, it } from "vitest";

import { smallWildlifePattern } from "../audio/soundscape";
import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { projectCoreEcologyAggregateEvidence } from "./coreEcologyEvidenceRuntime";
import {
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS,
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
  type CoreEcologyMarshEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  collectCoreEcologyVisualObservationBatches,
  type CoreEcologyObservationBatch,
} from "./coreEcologyPerception";
import {
  projectCoreEcologyWildlife,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  repositionCoreWildlifeActorWithMovementEvidence,
} from "./coreWildlifeActor";
import { evaluatePerception, type PerceptionCell } from "./perception";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  translateWorldPosition,
  worldPositionToSpatialFrame,
  type WorldPosition,
} from "./worldPosition";

const OWNER_INTENT = "test:core-ecology-marsh-edge-performance:v1" as const;
const SEED_TEXT = "alpha sixteen marsh edge pursuit";
const ORIGIN = createRegionCoord(0, 0);
const UTF8_ENCODER = new TextEncoder();

/**
 * Host-side CI ceilings with the same generous shared-runner headroom used by
 * Settlement Shadows. They catch unbounded scans, quadratic roster growth,
 * presentation multiplication, and save inflation; packaged device smoke is
 * still the authority for real frame rate.
 */
const MARSH_EDGE_COLD_MATERIALIZATION_BUDGET_MS = 5_000;
const MARSH_EDGE_SENSORY_BATCH_FRAMES = 32;
const MARSH_EDGE_SENSORY_BATCH_BUDGET_MS = 5_000;
const MARSH_EDGE_MOBILE_PROXY_STEPS = 128;
const MARSH_EDGE_MOBILE_PROXY_BUDGET_MS = 5_000;
const MARSH_EDGE_DESKTOP_PROXY_STEPS = 384;
const MARSH_EDGE_DESKTOP_PROXY_BUDGET_MS = 8_000;
const MARSH_EDGE_CANDIDATE_SAVE_BUDGET_BYTES = 512 * 1_024;
const MARSH_EDGE_MAX_RENDER_OBJECTS =
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS + CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE + 2;
const MARSH_EDGE_MAX_AUDIO_TONE_STEPS = 3;

interface CandidateFixture {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyMarshEdgeHabitatAssemblage;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly window: RegionalTerrainWindow;
  readonly world: ReturnType<typeof createRegionalWorldView>;
  readonly coldMaterializationMs: number;
  readonly rabbitPosition: WorldPosition;
  readonly foxPosition: WorldPosition;
}

interface FixedStepMetrics {
  readonly elapsedMs: number;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly maximumCoreEvents: number;
  readonly maximumObservations: number;
}

describe("Alpha-16 marsh-edge measured candidate budgets", () => {
  it("bounds materialization, sensory steps, viewport proxies, save bytes, render objects, and audio", () => {
    const fixture = candidateFixture();
    const rabbitPopulation = fixture.patch.populations.find(({ species }) => (
      species === "marsh-rabbit"
    ));
    const foxPopulation = fixture.patch.populations.find(({ species }) => (
      species === "marsh-fox"
    ));
    if (rabbitPopulation === undefined || foxPopulation === undefined) {
      throw new Error("The measured marsh-edge seed lost its rabbit/fox web");
    }
    const materializedActors = materializedWildlife(fixture.patch);
    const deriveSensoryFrame = () => collectCoreEcologyVisualObservationBatches({
      actors: materializedActors,
      world: fixture.world,
      window: fixture.window,
      tick: fixture.patch.updatedAtTick + 1,
    });
    const initialSensoryFrame = deriveSensoryFrame();
    if (initialSensoryFrame === null) {
      throw new Error("The maximum local wildlife sensory frame failed closed");
    }

    // Canonical parsers and terrain-cell construction are warmed once; cold
    // construction/materialization is independently measured by the fixture.
    deriveSensoryFrame();
    const sensoryStarted = performance.now();
    for (let index = 0; index < MARSH_EDGE_SENSORY_BATCH_FRAMES; index += 1) {
      if (deriveSensoryFrame() === null) {
        throw new Error(`Marsh-edge sensory frame ${index} failed closed`);
      }
    }
    const sensoryElapsedMs = performance.now() - sensoryStarted;

    const mobile = runFixedSteps(
      fixture.patch,
      fixture.world,
      fixture.window,
      MARSH_EDGE_MOBILE_PROXY_STEPS,
    );
    const desktop = runFixedSteps(
      fixture.patch,
      fixture.world,
      fixture.window,
      MARSH_EDGE_DESKTOP_PROXY_STEPS,
    );
    const saveBytes = UTF8_ENCODER.encode(
      serializeCoreEcologyAggregatePatch(desktop.patch),
    ).byteLength;

    const mobileProjection = candidateProjection(
      fixture,
      mobile.patch,
      fixture.rabbitPosition,
      5,
    );
    const desktopProjection = candidateProjection(
      fixture,
      mobile.patch,
      fixture.rabbitPosition,
      12,
    );
    // The initial fixture owns deliberately fresh movement signs for the
    // worst-case render proxy. The fixed-step samples exercise simulation
    // cost; after 128 ticks those original signs have truthfully faded below
    // direct-observation clarity and must not be treated as still visible.
    const mobileEvidence = candidateEvidenceProjection(
      fixture,
      fixture.patch,
      fixture.rabbitPosition,
      5,
    );
    const desktopEvidence = candidateEvidenceProjection(
      fixture,
      fixture.patch,
      fixture.rabbitPosition,
      12,
    );
    const maximumRenderObjects = Math.max(
      mobileProjection.length + mobileEvidence.length,
      desktopProjection.length + desktopEvidence.length,
    );
    const maximumToneSteps = Math.max(
      smallWildlifePattern("rabbit-thump", 0).length,
      smallWildlifePattern("fox-yip", 0).length,
    );
    const allocationCount = fixture.habitat.populations.reduce(
      (total, population) => total + population.allocations.length,
      0,
    );

    expect(fixture.coldMaterializationMs)
      .toBeLessThan(MARSH_EDGE_COLD_MATERIALIZATION_BUDGET_MS);
    expect(sensoryElapsedMs).toBeLessThan(MARSH_EDGE_SENSORY_BATCH_BUDGET_MS);
    expect(mobile.elapsedMs).toBeLessThan(MARSH_EDGE_MOBILE_PROXY_BUDGET_MS);
    expect(desktop.elapsedMs).toBeLessThan(MARSH_EDGE_DESKTOP_PROXY_BUDGET_MS);
    expect(saveBytes).toBeLessThan(MARSH_EDGE_CANDIDATE_SAVE_BUDGET_BYTES);
    expect(saveBytes).toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);

    expect(allocationCount).toBeLessThanOrEqual(
      CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS,
    );
    expect(materializedActors.length).toBeLessThanOrEqual(
      CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
    );
    expect(mobile.maximumCoreEvents).toBeLessThanOrEqual(materializedActors.length);
    expect(desktop.maximumCoreEvents).toBeLessThanOrEqual(materializedActors.length);
    expect(mobile.maximumObservations).toBeLessThanOrEqual(
      materializedActors.length * Math.max(0, materializedActors.length - 1),
    );
    expect(desktop.maximumObservations).toBeLessThanOrEqual(
      materializedActors.length * Math.max(0, materializedActors.length - 1),
    );
    expect(maximumRenderObjects).toBeLessThanOrEqual(MARSH_EDGE_MAX_RENDER_OBJECTS);
    expect(maximumToneSteps).toBeLessThanOrEqual(MARSH_EDGE_MAX_AUDIO_TONE_STEPS);

    // Presentation scale changes geometry only. Both viewport classes expose
    // the same knowledge-filtered actor and evidence identities.
    expect(mobileProjection.map(({ actorId }) => actorId))
      .toEqual(desktopProjection.map(({ actorId }) => actorId));
    expect(mobileEvidence.map(({ evidenceId }) => evidenceId))
      .toEqual(desktopEvidence.map(({ evidenceId }) => evidenceId));
    expect(mobileProjection.some(({ species }) => species === "marsh-rabbit")).toBe(true);
    expect(mobileProjection.some(({ species }) => species === "marsh-fox")).toBe(true);
    expect(mobileEvidence.some(({ species }) => species === "marsh-rabbit")).toBe(true);
    expect(mobileEvidence.some(({ species }) => species === "marsh-fox")).toBe(true);

    console.info("[marsh-edge-performance]", JSON.stringify({
      ownerIntent: OWNER_INTENT,
      allocationCount,
      coldMaterializationMs: rounded(fixture.coldMaterializationMs),
      desktopFixedStepMs: rounded(desktop.elapsedMs),
      desktopFixedSteps: MARSH_EDGE_DESKTOP_PROXY_STEPS,
      materializedActors: materializedActors.length,
      maximumCoreEvents: Math.max(mobile.maximumCoreEvents, desktop.maximumCoreEvents),
      maximumObservations: Math.max(
        mobile.maximumObservations,
        desktop.maximumObservations,
      ),
      maximumRenderObjects,
      maximumSmallWildlifeToneSteps: maximumToneSteps,
      mobileFixedStepMs: rounded(mobile.elapsedMs),
      mobileFixedSteps: MARSH_EDGE_MOBILE_PROXY_STEPS,
      saveBytes,
      sensoryBatchFrames: MARSH_EDGE_SENSORY_BATCH_FRAMES,
      sensoryBatchMs: rounded(sensoryElapsedMs),
    }));
  }, 25_000);

  it("keeps rabbit and fox honestly absent when a deterministic local selection cannot support them", () => {
    const region = createRegionCoord(-81, 47);
    const habitat = deriveCoreEcologyMarshEdgeHabitatAssemblage({
      rootSeed: seedFromText("quiet marsh edge"),
      originRegion: region,
      focus: {
        position: focusAt(region),
        radiusTiles: 1,
      },
    });

    expect(habitat.populations.find(({ species }) => species === "marsh-rabbit"))
      .toMatchObject({ populationUnits: 0, allocations: [] });
    expect(habitat.populations.find(({ species }) => species === "marsh-fox"))
      .toMatchObject({ populationUnits: 0, allocations: [] });
  });
});

function candidateFixture(): CandidateFixture {
  const started = performance.now();
  const state = createWorld(SEED_TEXT, "standard");
  state.weather = {
    ...state.weather,
    kind: "rain",
    intensity: 650_000,
    windX: 280_000,
    windY: -120_000,
  };
  const seed = state.meta.rootSeed;
  const habitat = deriveCoreEcologyMarshEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion: ORIGIN,
    focus: {
      position: focusAt(ORIGIN),
      radiusTiles: 32,
    },
  });
  const coarsePatch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "performance:marsh-edge",
    originRegion: ORIGIN,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v3", habitat },
  });
  const rabbitPosition = coarsePatch.populations
    .find(({ species }) => species === "marsh-rabbit")
    ?.members[0]?.actor.address.position;
  const foxPosition = coarsePatch.populations
    .find(({ species }) => species === "marsh-fox")
    ?.members[0]?.actor.address.position;
  if (rabbitPosition === undefined || foxPosition === undefined) {
    throw new Error("Measured Alpha-16 seed must contain both rabbit and fox");
  }
  const window = createRegionalTerrainWindow(
    seed,
    createTerrainRegionStreamingState({ rootSeed: seed, center: ORIGIN }),
    regionalFrameOriginAtAddress({
      region: rabbitPosition.region,
      localX: Math.floor(rabbitPosition.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.floor(rabbitPosition.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(seed), window),
  );
  let patch = setCoreEcologyMaterializationForWindow(coarsePatch, window, 0);
  if (patch === null) throw new Error("Marsh-edge performance materialization failed");
  for (const species of ["marsh-rabbit", "marsh-fox"] as const) {
    const actor = patch.populations.find((population) => population.species === species)
      ?.members[0]?.actor;
    if (actor === undefined) throw new Error(`Measured fixture omitted ${species}`);
    const traced = repositionCoreWildlifeActorWithMovementEvidence(actor, {
      atTick: patch.updatedAtTick,
      position: translateWorldPosition(actor.address.position, 1, 0),
      heading: actor.address.heading,
      strength: 700_000,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, traced);
  }
  return Object.freeze({
    seed,
    habitat,
    patch,
    window,
    world,
    coldMaterializationMs: performance.now() - started,
    rabbitPosition,
    foxPosition,
  });
}

function individualInputs(
  habitat: CoreEcologyMarshEdgeHabitatAssemblage,
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
            materialization: "coarse" as const,
          })),
        }]
  ));
}

function runFixedSteps(
  initial: CoreEcologyAggregatePatchState,
  world: CandidateFixture["world"],
  window: RegionalTerrainWindow,
  steps: number,
): FixedStepMetrics {
  let patch = initial;
  let maximumCoreEvents = 0;
  let maximumObservations = 0;
  const started = performance.now();
  for (let index = 0; index < steps; index += 1) {
    const actors = materializedWildlife(patch);
    const tick = patch.updatedAtTick + 1;
    const batches = collectCoreEcologyVisualObservationBatches({
      actors,
      world,
      window,
      tick,
    });
    if (batches === null) throw new Error(`Sensory step ${index} failed closed`);
    maximumObservations = Math.max(maximumObservations, observationCount(batches));
    const observationsByActor = new Map(batches.map((batch) => (
      [batch.observerId, batch.observations] as const
    )));
    const advanced = stepCoreEcologyAggregatePatch(patch, {
      tick,
      actorSteps: actors.map((actor) => ({
        actorId: actor.identity.stableId,
        observations: observationsByActor.get(actor.identity.stableId) ?? [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      })),
    });
    if (advanced === null) throw new Error(`Core fixed step ${index} failed closed`);
    patch = advanced.patch;
    maximumCoreEvents = Math.max(maximumCoreEvents, advanced.events.length);
  }
  return Object.freeze({
    elapsedMs: performance.now() - started,
    patch,
    maximumCoreEvents,
    maximumObservations,
  });
}

function materializedWildlife(patch: CoreEcologyAggregatePatchState) {
  return patch.populations.flatMap(({ members }) => members
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actor));
}

function observationCount(batches: readonly CoreEcologyObservationBatch[]): number {
  return batches.reduce((total, batch) => total + batch.observations.length, 0);
}

function candidateProjection(
  fixture: CandidateFixture,
  patch: CoreEcologyAggregatePatchState,
  playerPosition: WorldPosition,
  tileSize: number,
) {
  const perception = fullDetailPerception(fixture.window, playerPosition);
  const projection = projectCoreEcologyWildlife({
    patch,
    window: runtimeProjectionWindow(fixture.window),
    perception,
    tileSize,
  });
  if (projection === null) throw new Error("Marsh-edge wildlife projection failed closed");
  return projection;
}

function candidateEvidenceProjection(
  fixture: CandidateFixture,
  patch: CoreEcologyAggregatePatchState,
  playerPosition: WorldPosition,
  tileSize: number,
) {
  const perception = fullDetailPerception(fixture.window, playerPosition);
  const projection = projectCoreEcologyAggregateEvidence({
    patch,
    window: runtimeProjectionWindow(fixture.window),
    perception,
    tileSize,
  });
  if (projection === null) throw new Error("Marsh-edge evidence projection failed closed");
  return projection.renderEvidence;
}

function runtimeProjectionWindow(window: RegionalTerrainWindow): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: Object.freeze({ x: window.origin.x, y: window.origin.y }),
    terrain: Object.freeze({
      width: window.terrain.width,
      height: window.terrain.height,
    }),
  });
}

function fullDetailPerception(
  window: RegionalTerrainWindow,
  playerPosition: WorldPosition,
) {
  const firstAddress = window.addresses[0];
  if (firstAddress === undefined) throw new Error("Regional window has no first address");
  const frame = createSpatialFrame(
    createWorldPosition(
      firstAddress.region,
      firstAddress.localX * WORLD_POSITION_UNITS_PER_TILE,
      firstAddress.localY * WORLD_POSITION_UNITS_PER_TILE,
    ),
    window.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
    window.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
  );
  const point = worldPositionToSpatialFrame(frame, playerPosition);
  if (point === null) throw new Error("Projection subject left the candidate frame");
  const playerX = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const playerY = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  const cells: readonly PerceptionCell[] = Array.from(
    { length: window.terrain.width * window.terrain.height },
    () => Object.freeze({ elevation: 0, obstruction: 0 }),
  );
  return evaluatePerception({
    columns: window.terrain.width,
    rows: window.terrain.height,
    cells,
    playerTileIndex: playerY * window.terrain.width + playerX,
    facingRadians: 0,
    weatherVisibility: 1,
    rangeOverrides: {
      closePeripheralRange: 200,
      directSightRange: 200,
      forwardConeRadians: Math.PI * 2,
    },
    detailRangeOverrides: {
      closePeripheralRange: 200,
      directSightRange: 200,
      forwardConeRadians: Math.PI * 2,
    },
  });
}

function focusAt(region: ReturnType<typeof createRegionCoord>): WorldPosition {
  return createWorldPosition(
    region,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
