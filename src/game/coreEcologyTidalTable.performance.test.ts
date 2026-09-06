import { describe, expect, it } from "vitest";

import { createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS,
  CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  createCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { projectCoreEcologyAggregateEvidence } from "./coreEcologyEvidenceRuntime";
import {
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES_EVALUATION_BUDGET,
  deriveCoreEcologyTidalTableHabitatAssemblage,
  type CoreEcologyTidalTableHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  projectCoreEcologyWildlife,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import {
  CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS,
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

export const OWNER_INTENT = "test:core-ecology-tidal-table-performance:v1" as const;

const ORIGIN = createRegionCoord(0, 0);
const SEED = seedFromText("tidal-triad-1");
const UTF8_ENCODER = new TextEncoder();

// These are intentionally generous shared-runner regression ceilings, not a
// packaged-device frame-rate claim. One complete 720-tick tide catches work
// that grows with population units, disturbance history, or elapsed world time.
const COLD_CANDIDATE_BUDGET_MS = 5_000;
const FULL_TIDE_SOAK_TICKS = 720;
const FULL_TIDE_SOAK_BUDGET_MS = 12_000;
const PROJECTION_FRAMES = 384;
const PROJECTION_BUDGET_MS = 8_000;
const CANDIDATE_SAVE_BUDGET_BYTES = 768 * 1_024;
const MAX_AGGREGATE_ANCHOR_RECORDS =
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS * CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS;
const MAX_RENDER_OBJECTS =
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  + CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS * CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE;

interface TidalSoakResult {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly maximumDepthRecords: number;
  readonly maximumRedistributions: number;
  readonly totalRedistributions: number;
  readonly sawFallingTide: boolean;
  readonly sawRisingTide: boolean;
}

describe("Tide Table measured candidate budgets", () => {
  it("bounds a deterministic full-tide soak, projections, and save growth", () => {
    const coldStarted = performance.now();
    const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
      rootSeed: SEED,
      originRegion: ORIGIN,
      focus: {
        position: focusAtOrigin(),
        radiusTiles: 32,
      },
    });
    const initial = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "performance:tidal-table",
      originRegion: ORIGIN,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v5", habitat },
    });
    const coldCandidateMs = performance.now() - coldStarted;
    requireCompleteTidalTriad(initial);

    const soakStarted = performance.now();
    const soak = runFullTideSoak(initial);
    const soakMs = performance.now() - soakStarted;
    const replay = runFullTideSoak(initial);
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

    const window = runtimeWindowAtOrigin();
    const materialized = setCoreEcologyMaterializationForWindow(
      soak.patch,
      window,
      soak.patch.updatedAtTick,
    );
    if (materialized === null) throw new Error("Tide Table materialization failed closed");
    const perception = fullDetailPerception();
    const projectedActors = projectCoreEcologyWildlife({
      patch: materialized,
      window,
      perception,
      tileSize: 5,
    });
    const projectedEvidence = projectCoreEcologyAggregateEvidence({
      patch: materialized,
      window,
      perception,
      tileSize: 5,
    });
    const tidalProjection = projectCoreEcologyTidalTable(
      materialized,
      materialized.updatedAtTick,
    );
    if (projectedActors === null || projectedEvidence === null || tidalProjection === null) {
      throw new Error("Tide Table release projection failed closed");
    }

    // Warm canonical caches before measuring the repeated release-frame proxy.
    projectCoreEcologyWildlife({ patch: materialized, window, perception, tileSize: 5 });
    projectCoreEcologyAggregateEvidence({ patch: materialized, window, perception, tileSize: 5 });
    projectCoreEcologyTidalTable(materialized, materialized.updatedAtTick);
    const projectionStarted = performance.now();
    for (let frame = 0; frame < PROJECTION_FRAMES; frame += 1) {
      if (projectCoreEcologyWildlife({
        patch: materialized,
        window,
        perception,
        tileSize: 5,
      }) === null) throw new Error(`Tide Table actor projection ${frame} failed closed`);
      if (projectCoreEcologyAggregateEvidence({
        patch: materialized,
        window,
        perception,
        tileSize: 5,
      }) === null) throw new Error(`Tide Table evidence projection ${frame} failed closed`);
      if (projectCoreEcologyTidalTable(materialized, materialized.updatedAtTick) === null) {
        throw new Error(`Tide Table depth projection ${frame} failed closed`);
      }
    }
    const projectionMs = performance.now() - projectionStarted;

    const allocationCount = habitat.populations.reduce(
      (sum, population) => sum + population.allocations.length,
      0,
    );
    const materializedActors = materialized.populations.flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized");
    const saveBytes = UTF8_ENCODER.encode(
      serializeCoreEcologyAggregatePatch(materialized),
    ).byteLength;

    expect(coldCandidateMs).toBeLessThan(COLD_CANDIDATE_BUDGET_MS);
    expect(soakMs).toBeLessThan(FULL_TIDE_SOAK_BUDGET_MS);
    expect(projectionMs).toBeLessThan(PROJECTION_BUDGET_MS);
    expect(saveBytes).toBeLessThan(CANDIDATE_SAVE_BUDGET_BYTES);
    expect(saveBytes).toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);
    expect(habitat.speciesEvaluations)
      .toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES_EVALUATION_BUDGET);
    expect(allocationCount)
      .toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS);
    expect(materializedActors.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(soak.patch.aggregatePopulations.reduce(
      (sum, population) => sum + population.anchors.length,
      0,
    )).toBeLessThanOrEqual(MAX_AGGREGATE_ANCHOR_RECORDS);
    expect(soak.patch.aggregatePopulations.every((population) => (
      population.evidence.length <= CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE
      && population.disturbances.length <= CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES
      && population.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0)
        === population.populationSize
    ))).toBe(true);
    expect(soak.maximumDepthRecords)
      .toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS);
    expect(soak.maximumRedistributions)
      .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS);
    expect(soak.sawRisingTide).toBe(true);
    expect(soak.sawFallingTide).toBe(true);
    expect(projectedActors.length + projectedEvidence.renderEvidence.length)
      .toBeLessThanOrEqual(MAX_RENDER_OBJECTS);
    expect(projectedActors.some(({ species }) => species === "snowy-egret")).toBe(true);
    expect(tidalProjection.anchorDepths.length)
      .toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS);

    console.info("[tidal-table-performance]", JSON.stringify({
      ownerIntent: OWNER_INTENT,
      allocationCount,
      coldCandidateMs: rounded(coldCandidateMs),
      materializedActors: materializedActors.length,
      maximumDepthRecords: soak.maximumDepthRecords,
      maximumRedistributions: soak.maximumRedistributions,
      projectedActors: projectedActors.length,
      projectedEvidence: projectedEvidence.renderEvidence.length,
      projectionFrames: PROJECTION_FRAMES,
      projectionMs: rounded(projectionMs),
      saveBytes,
      soakMs: rounded(soakMs),
      soakTicks: FULL_TIDE_SOAK_TICKS,
      totalRedistributions: soak.totalRedistributions,
    }));
  }, 30_000);
});

function runFullTideSoak(initial: CoreEcologyAggregatePatchState): TidalSoakResult {
  let patch = initial;
  let maximumDepthRecords = 0;
  let maximumRedistributions = 0;
  let totalRedistributions = 0;
  let sawFallingTide = false;
  let sawRisingTide = false;
  const conserved = new Map(initial.aggregatePopulations
    .filter(({ species }) => (
      species === "atlantic-silverside"
      || species === "atlantic-marsh-fiddler-crab"
    ))
    .map(({ aggregateId, populationSize }) => [aggregateId, populationSize] as const));

  for (let step = 0; step < FULL_TIDE_SOAK_TICKS; step += 1) {
    const tidal = stepCoreEcologyTidalTable(patch, { atTick: patch.updatedAtTick });
    if (tidal === null) throw new Error(`Tide Table soak step ${step} failed closed`);
    if (
      tidal.mortality !== "none"
      || tidal.cargoInteraction
      || tidal.itemConsumption !== "none"
    ) throw new Error("Tide Table soak crossed its nonlethal conservation boundary");
    sawFallingTide ||= tidal.projection.tide.direction < 0;
    sawRisingTide ||= tidal.projection.tide.direction > 0;
    maximumDepthRecords = Math.max(
      maximumDepthRecords,
      tidal.projection.anchorDepths.length,
    );
    maximumRedistributions = Math.max(maximumRedistributions, tidal.redistributions.length);
    totalRedistributions += tidal.redistributions.length;
    for (const population of tidal.patch.aggregatePopulations) {
      const expected = conserved.get(population.aggregateId);
      if (expected === undefined) continue;
      if (
        population.populationSize !== expected
        || population.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0)
          !== expected
      ) throw new Error(`Tide Table soak failed to conserve ${population.aggregateId}`);
    }
    const advanced = stepCoreEcologyAggregatePatch(tidal.patch, {
      tick: tidal.patch.updatedAtTick + 1,
      actorSteps: [],
    });
    if (advanced === null) throw new Error(`Tide Table clock step ${step} failed closed`);
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

function requireCompleteTidalTriad(patch: CoreEcologyAggregatePatchState): void {
  for (const species of [
    "atlantic-silverside",
    "atlantic-marsh-fiddler-crab",
  ] as const) {
    if (!patch.aggregatePopulations.some((population) => population.species === species)) {
      throw new Error(`Performance seed omitted ${species}`);
    }
  }
  if (!patch.populations.some(({ species }) => species === "snowy-egret")) {
    throw new Error("Performance seed omitted snowy-egret");
  }
}

function individualInputs(
  habitat: CoreEcologyTidalTableHabitatAssemblage,
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

function runtimeWindowAtOrigin(): CoreEcologyRuntimeWindow {
  const origin = regionLocalToGlobalTile(ORIGIN, 0, 0);
  return Object.freeze({
    origin: Object.freeze({ x: origin.x, y: origin.y }),
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
}

function fullDetailPerception() {
  const cells: readonly PerceptionCell[] = Array.from(
    { length: REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS },
    () => Object.freeze({ elevation: 0, obstruction: 0 }),
  );
  return evaluatePerception({
    columns: REGIONAL_TRAVEL_COLUMNS,
    rows: REGIONAL_TRAVEL_ROWS,
    cells,
    playerTileIndex:
      Math.trunc(WORLD_HEIGHT / 2) * REGIONAL_TRAVEL_COLUMNS
      + Math.trunc(WORLD_WIDTH / 2),
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

function focusAtOrigin() {
  return createWorldPosition(
    ORIGIN,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
