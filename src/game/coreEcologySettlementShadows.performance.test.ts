import { describe, expect, it } from "vitest";

import { smallWildlifePattern } from "../audio/soundscape";
import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS,
  CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  createCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES,
  deriveCoreEcologySettlementShadowsStimulusFrame,
  selectCoreEcologyAggregateExposedFoodSources,
  type CoreEcologyAggregateExposedFoodSource,
  type CoreEcologyAggregateVisualSource,
} from "./coreEcologyAggregatePerception";
import {
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS,
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import { projectCoreEcologyAggregateEvidence } from "./coreEcologyEvidenceRuntime";
import {
  projectCoreEcologyWildlife,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI,
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
  stepCoreEcologySettlementShadows,
  type CoreEcologySettlementShadowsStimulusFrame,
} from "./coreEcologySmallWorld";
import { CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE } from "./coreWildlifeActor";
import { LOOSE_CARGO_MAX_ENTITIES } from "./looseCargo";
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
  worldPositionToSpatialFrame,
  type WorldPosition,
} from "./worldPosition";

const SEED_TEXT = "harbor edge rats and free ranging cats";
const ORIGIN = createRegionCoord(0, 0);
const UTF8_ENCODER = new TextEncoder();

/**
 * These are CI regression ceilings, not claims about a particular handset.
 * Packaged Electron smoke remains the real desktop/portrait/landscape surface
 * gate. This host-side proxy runs identical rules at both presentation scales
 * and deliberately leaves broad shared-runner headroom while still catching
 * accidental all-world scans, N-squared actor work, or unbounded save growth.
 */
const SETTLEMENT_SHADOWS_COLD_MATERIALIZATION_BUDGET_MS = 5_000;
const SETTLEMENT_SHADOWS_SENSORY_BATCH_FRAMES = 64;
const SETTLEMENT_SHADOWS_SENSORY_BATCH_BUDGET_MS = 5_000;
const SETTLEMENT_SHADOWS_MOBILE_PROXY_STEPS = 256;
const SETTLEMENT_SHADOWS_MOBILE_PROXY_BUDGET_MS = 5_000;
const SETTLEMENT_SHADOWS_DESKTOP_PROXY_STEPS = 768;
const SETTLEMENT_SHADOWS_DESKTOP_PROXY_BUDGET_MS = 8_000;
const SETTLEMENT_SHADOWS_CANDIDATE_SAVE_BUDGET_BYTES = 512 * 1_024;
const SETTLEMENT_SHADOWS_MAX_RENDER_OBJECTS =
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS + CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE;
const SETTLEMENT_SHADOWS_MAX_SMALL_WILDLIFE_TONE_STEPS = 3;

interface CandidateFixture {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyHarborEdgeHabitatAssemblage;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly window: RegionalTerrainWindow;
  readonly world: ReturnType<typeof createRegionalWorldView>;
  readonly coldMaterializationMs: number;
}

interface FixedStepMetrics {
  readonly elapsedMs: number;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly maximumCoreEvents: number;
  readonly maximumSettlementEvents: number;
}

describe("Settlement Shadows measured candidate budgets", () => {
  it("bounds cold materialization, sensory work, fixed steps, save growth, and presentation", () => {
    const fixture = candidateFixture();
    const rats = fixture.patch.aggregatePopulations.find(({ species }) => (
      species === "brown-rat"
    ));
    const cat = fixture.patch.populations
      .find(({ species }) => species === "domestic-cat")
      ?.members[0]?.actor;
    if (rats === undefined || cat === undefined || rats.anchors.length < 2) {
      throw new Error("The measured Settlement Shadows seed lost its complete rat/cat web");
    }

    const visualSources = maximumVisualSources(rats.anchors[0]!.position);
    const physicalFoodCandidates = maximumPhysicalFoodSources(rats.anchors[0]!.position);
    const selectedFood = selectCoreEcologyAggregateExposedFoodSources(
      fixture.patch,
      physicalFoodCandidates,
    );
    if (selectedFood === null) throw new Error("Bounded physical food selection failed");

    const deriveFrame = () => deriveCoreEcologySettlementShadowsStimulusFrame({
      patch: fixture.patch,
      world: fixture.world,
      window: fixture.window,
      tick: fixture.patch.updatedAtTick,
      visualSources,
      exposedFoodSources: selectedFood,
    });
    const initialFrame = deriveFrame();
    if (initialFrame === null || initialFrame.stimuli.length === 0) {
      throw new Error("The maximum-input aggregate sensory frame failed closed");
    }

    // Warm the deterministic parser/evaluator once; cold construction above is
    // measured separately. Every timed frame still canonicalizes full inputs.
    deriveFrame();
    const sensoryStarted = performance.now();
    for (let index = 0; index < SETTLEMENT_SHADOWS_SENSORY_BATCH_FRAMES; index += 1) {
      if (deriveFrame() === null) throw new Error(`Sensory frame ${index} failed closed`);
    }
    const sensoryElapsedMs = performance.now() - sensoryStarted;

    const mobile = runFixedSteps(
      fixture.patch,
      initialFrame,
      SETTLEMENT_SHADOWS_MOBILE_PROXY_STEPS,
    );
    const desktop = runFixedSteps(
      fixture.patch,
      initialFrame,
      SETTLEMENT_SHADOWS_DESKTOP_PROXY_STEPS,
    );
    const saveBytes = UTF8_ENCODER.encode(
      serializeCoreEcologyAggregatePatch(desktop.patch),
    ).byteLength;

    const mobileProjection = candidateProjection(fixture, mobile.patch, cat.address.position, 5);
    const desktopProjection = candidateProjection(fixture, mobile.patch, cat.address.position, 12);
    const evidencePosition = rats.evidence[0]?.position;
    if (evidencePosition === undefined) throw new Error("Rat evidence disappeared from the web");
    const mobileEvidence = candidateEvidenceProjection(fixture, mobile.patch, evidencePosition, 5);
    const desktopEvidence = candidateEvidenceProjection(fixture, mobile.patch, evidencePosition, 12);
    const maximumRenderObjects = Math.max(
      mobileProjection.length + mobileEvidence.length,
      desktopProjection.length + desktopEvidence.length,
    );
    const maximumToneSteps = Math.max(
      smallWildlifePattern("rat-rustle", 0).length,
      smallWildlifePattern("cat-call", 0).length,
    );

    const materializedActors = fixture.patch.populations.flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized").length;
    const allocationCount = fixture.habitat.populations.reduce(
      (total, population) => total + population.allocations.length,
      0,
    );

    expect(fixture.coldMaterializationMs)
      .toBeLessThan(SETTLEMENT_SHADOWS_COLD_MATERIALIZATION_BUDGET_MS);
    expect(sensoryElapsedMs).toBeLessThan(SETTLEMENT_SHADOWS_SENSORY_BATCH_BUDGET_MS);
    expect(mobile.elapsedMs).toBeLessThan(SETTLEMENT_SHADOWS_MOBILE_PROXY_BUDGET_MS);
    expect(desktop.elapsedMs).toBeLessThan(SETTLEMENT_SHADOWS_DESKTOP_PROXY_BUDGET_MS);
    expect(saveBytes).toBeLessThan(SETTLEMENT_SHADOWS_CANDIDATE_SAVE_BUDGET_BYTES);
    expect(saveBytes).toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);

    expect(allocationCount).toBeLessThanOrEqual(
      CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS,
    );
    expect(materializedActors).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(rats.anchors.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS);
    expect(desktop.patch.aggregatePopulations.every((population) => (
      population.evidence.length <= CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE
      && population.disturbances.length <= CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES
    ))).toBe(true);
    expect(initialFrame.stimuli.length)
      .toBeLessThanOrEqual(CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI);
    expect(mobile.maximumSettlementEvents)
      .toBeLessThanOrEqual(fixture.patch.aggregatePopulations.length);
    expect(desktop.maximumSettlementEvents)
      .toBeLessThanOrEqual(fixture.patch.aggregatePopulations.length);
    expect(mobile.maximumCoreEvents).toBeLessThanOrEqual(materializedActors);
    expect(desktop.maximumCoreEvents).toBeLessThanOrEqual(materializedActors);
    expect(maximumRenderObjects).toBeLessThanOrEqual(SETTLEMENT_SHADOWS_MAX_RENDER_OBJECTS);
    expect(maximumToneSteps).toBeLessThanOrEqual(
      SETTLEMENT_SHADOWS_MAX_SMALL_WILDLIFE_TONE_STEPS,
    );

    // Tile scale changes geometry only. Both viewport classes must expose the
    // exact same knowledge-filtered actor/evidence identities.
    expect(mobileProjection.map(({ actorId }) => actorId))
      .toEqual(desktopProjection.map(({ actorId }) => actorId));
    expect(mobileEvidence.map(({ evidenceId }) => evidenceId))
      .toEqual(desktopEvidence.map(({ evidenceId }) => evidenceId));
    expect(mobileProjection.some(({ species }) => species === "domestic-cat")).toBe(true);
    expect(mobileEvidence.some(({ species }) => species === "brown-rat")).toBe(true);

    // Keep exact measurements in CI output so a release audit can distinguish
    // measured headroom from a declaration inferred only from actor counts.
    console.info("[settlement-shadows-performance]", JSON.stringify({
      allocationCount,
      coldMaterializationMs: rounded(fixture.coldMaterializationMs),
      desktopFixedStepMs: rounded(desktop.elapsedMs),
      desktopFixedSteps: SETTLEMENT_SHADOWS_DESKTOP_PROXY_STEPS,
      materializedActors,
      maximumRenderObjects,
      maximumSettlementEvents: Math.max(
        mobile.maximumSettlementEvents,
        desktop.maximumSettlementEvents,
      ),
      maximumSmallWildlifeToneSteps: maximumToneSteps,
      mobileFixedStepMs: rounded(mobile.elapsedMs),
      mobileFixedSteps: SETTLEMENT_SHADOWS_MOBILE_PROXY_STEPS,
      saveBytes,
      sensoryBatchFrames: SETTLEMENT_SHADOWS_SENSORY_BATCH_FRAMES,
      sensoryBatchMs: rounded(sensoryElapsedMs),
    }));
  }, 25_000);
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
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion: ORIGIN,
  });
  const coarsePatch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "performance:settlement-shadows",
    originRegion: ORIGIN,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
  const ratAnchor = coarsePatch.aggregatePopulations
    .find(({ species }) => species === "brown-rat")
    ?.anchors[0]?.position;
  if (ratAnchor === undefined) throw new Error("Performance fixture requires rat habitat");
  const window = createRegionalTerrainWindow(
    seed,
    createTerrainRegionStreamingState({ rootSeed: seed, center: ORIGIN }),
    regionalFrameOriginAtAddress({
      region: ratAnchor.region,
      localX: Math.floor(ratAnchor.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.floor(ratAnchor.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(seed), window),
  );
  const patch = setCoreEcologyMaterializationForWindow(coarsePatch, window, 0);
  if (patch === null) throw new Error("Performance fixture materialization failed");
  return Object.freeze({
    seed,
    habitat,
    patch,
    window,
    world,
    coldMaterializationMs: performance.now() - started,
  });
}

function individualInputs(
  habitat: CoreEcologyHarborEdgeHabitatAssemblage,
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

function maximumVisualSources(position: WorldPosition): readonly CoreEcologyAggregateVisualSource[] {
  const sourceKinds = ["cat", "dog", "human", "gull"] as const;
  return Object.freeze(Array.from(
    { length: CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES },
    (_, index) => Object.freeze({
      sourceReferenceId: `performance:visual:${index.toString(36)}`,
      sourceKind: sourceKinds[index % sourceKinds.length]!,
      position,
      movementSalience: FIXED_POINT,
    }),
  ));
}

function maximumPhysicalFoodSources(
  position: WorldPosition,
): readonly CoreEcologyAggregateExposedFoodSource[] {
  return Object.freeze(Array.from({ length: LOOSE_CARGO_MAX_ENTITIES }, (_, index) => (
    Object.freeze({
      sourceReferenceId: `physical-food:${index.toString(36)}`,
      position,
      sourceStrength: FIXED_POINT,
      packagingLeakage: FIXED_POINT,
    })
  )));
}

function runFixedSteps(
  initial: CoreEcologyAggregatePatchState,
  sourceFrame: CoreEcologySettlementShadowsStimulusFrame,
  steps: number,
): FixedStepMetrics {
  let patch = initial;
  let maximumCoreEvents = 0;
  let maximumSettlementEvents = 0;
  const started = performance.now();
  for (let index = 0; index < steps; index += 1) {
    const atTick = patch.updatedAtTick;
    const settlement = stepCoreEcologySettlementShadows(
      patch,
      atTick,
      stimulusFrameAtTick(sourceFrame, atTick),
    );
    if (settlement === null) throw new Error(`Settlement step ${index} failed closed`);
    patch = settlement.patch;
    maximumSettlementEvents = Math.max(maximumSettlementEvents, settlement.events.length);

    const actorSteps = patch.populations.flatMap(({ members }) => members
      .filter(({ materialization }) => materialization === "materialized")
      .map(({ actor }) => ({
        actorId: actor.identity.stableId,
        observations: [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      })));
    const advanced = stepCoreEcologyAggregatePatch(patch, {
      tick: atTick + 1,
      actorSteps,
    });
    if (advanced === null) throw new Error(`Core fixed step ${index} failed closed`);
    patch = advanced.patch;
    maximumCoreEvents = Math.max(maximumCoreEvents, advanced.events.length);
  }
  return Object.freeze({
    elapsedMs: performance.now() - started,
    patch,
    maximumCoreEvents,
    maximumSettlementEvents,
  });
}

function stimulusFrameAtTick(
  source: CoreEcologySettlementShadowsStimulusFrame,
  atTick: number,
): CoreEcologySettlementShadowsStimulusFrame {
  return Object.freeze({
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    atTick,
    stimuli: Object.freeze(source.stimuli.map((stimulus, ordinal) => Object.freeze({
      ...stimulus,
      stimulusId: `performance:stimulus:${ordinal.toString(36)}:${atTick.toString(36)}`,
    }))),
  });
}

function candidateProjection(
  fixture: CandidateFixture,
  patch: CoreEcologyAggregatePatchState,
  playerPosition: WorldPosition,
  tileSize: number,
) {
  const perception = fullDetailPerception(fixture.window, playerPosition);
  const window = runtimeProjectionWindow(fixture.window);
  const projection = projectCoreEcologyWildlife({
    patch,
    window,
    perception,
    tileSize,
  });
  if (projection === null) throw new Error("Candidate wildlife projection failed closed");
  return projection;
}

function candidateEvidenceProjection(
  fixture: CandidateFixture,
  patch: CoreEcologyAggregatePatchState,
  playerPosition: WorldPosition,
  tileSize: number,
) {
  const perception = fullDetailPerception(fixture.window, playerPosition);
  const window = runtimeProjectionWindow(fixture.window);
  const projection = projectCoreEcologyAggregateEvidence({
    patch,
    window,
    perception,
    tileSize,
  });
  if (projection === null) throw new Error("Candidate evidence projection failed closed");
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

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
