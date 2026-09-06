import { describe, expect, it } from "vitest";

import { createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS,
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  createCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { projectCoreEcologyAggregateEvidence } from "./coreEcologyEvidenceRuntime";
import {
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES_EVALUATION_BUDGET,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  projectCoreEcologyWildlife,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

export const OWNER_INTENT = "test:core-ecology-rain-chorus-performance:v1" as const;

const ORIGIN = createRegionCoord(0, 0);
const SEED = seedFromText("alpha seventeen rain chorus shadow overhead");
const UTF8_ENCODER = new TextEncoder();

// These are deliberately generous shared-runner regression ceilings, not a
// claim about packaged-device frame rate. They catch accidental unbounded
// materialization, aggregate expansion, and renderer multiplication.
const COLD_CANDIDATE_BUDGET_MS = 5_000;
const PROJECTION_FRAMES = 384;
const PROJECTION_BUDGET_MS = 8_000;
const CANDIDATE_SAVE_BUDGET_BYTES = 512 * 1_024;
const MAX_AGGREGATE_ANCHOR_RECORDS =
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS * CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS;
const MAX_RENDER_OBJECTS =
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  + CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS * CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE;

describe("Rain Chorus measured candidate budgets", () => {
  it("bounds representative materialization, aggregate anchors, projections, and save size", () => {
    const coldStarted = performance.now();
    const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
      rootSeed: SEED,
      originRegion: ORIGIN,
      focus: {
        position: focusAtOrigin(),
        radiusTiles: 32,
      },
    });
    const coarse = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "performance:rain-chorus",
      originRegion: ORIGIN,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v4", habitat },
    });
    const window = runtimeWindowAtOrigin();
    const patch = setCoreEcologyMaterializationForWindow(coarse, window, 0);
    if (patch === null) throw new Error("Rain Chorus performance materialization failed");
    const coldCandidateMs = performance.now() - coldStarted;

    const perception = fullDetailPerception();
    const projectedActors = projectCoreEcologyWildlife({
      patch,
      window,
      perception,
      tileSize: 5,
    });
    const projectedEvidence = projectCoreEcologyAggregateEvidence({
      patch,
      window,
      perception,
      tileSize: 5,
    });
    if (projectedActors === null || projectedEvidence === null) {
      throw new Error("Rain Chorus representative projection failed closed");
    }

    // Warm strict canonical caches and presentation code before measuring the
    // repeated release-frame proxy.
    projectCoreEcologyWildlife({ patch, window, perception, tileSize: 5 });
    projectCoreEcologyAggregateEvidence({ patch, window, perception, tileSize: 5 });
    const projectionStarted = performance.now();
    for (let frame = 0; frame < PROJECTION_FRAMES; frame += 1) {
      if (projectCoreEcologyWildlife({ patch, window, perception, tileSize: 5 }) === null) {
        throw new Error(`Rain Chorus actor projection ${frame} failed closed`);
      }
      if (projectCoreEcologyAggregateEvidence({
        patch,
        window,
        perception,
        tileSize: 5,
      }) === null) {
        throw new Error(`Rain Chorus evidence projection ${frame} failed closed`);
      }
    }
    const projectionMs = performance.now() - projectionStarted;

    const allocationCount = habitat.populations.reduce(
      (sum, population) => sum + population.allocations.length,
      0,
    );
    const actors = patch.populations.flatMap(({ members }) => members);
    const materializedActors = actors.filter(
      ({ materialization }) => materialization === "materialized",
    );
    const frogs = patch.aggregatePopulations.find(
      ({ species }) => species === "southern-leopard-frog",
    );
    if (frogs === undefined) throw new Error("Measured seed lost its frog population area");
    const saveBytes = UTF8_ENCODER.encode(serializeCoreEcologyAggregatePatch(patch)).byteLength;

    expect(coldCandidateMs).toBeLessThan(COLD_CANDIDATE_BUDGET_MS);
    expect(projectionMs).toBeLessThan(PROJECTION_BUDGET_MS);
    expect(saveBytes).toBeLessThan(CANDIDATE_SAVE_BUDGET_BYTES);
    expect(saveBytes).toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);
    expect(habitat.speciesEvaluations)
      .toBeLessThanOrEqual(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES_EVALUATION_BUDGET);
    expect(allocationCount)
      .toBeLessThanOrEqual(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS);
    expect(materializedActors.length)
      .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(materializedActors).toHaveLength(actors.length);
    expect(actors.some(({ actor }) => (
      actor.identity.species === "southern-leopard-frog"
    ))).toBe(false);
    expect(materializedActors.some(({ actor }) => actor.identity.species === "fish-crow"))
      .toBe(true);
    expect(materializedActors.some(({ actor }) => actor.identity.species === "northern-harrier"))
      .toBe(true);

    expect(frogs.anchors.length).toBeGreaterThan(0);
    expect(frogs.anchors.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS);
    expect(frogs.evidence.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE);
    expect(frogs.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
      .toBe(frogs.populationSize);
    expect(patch.aggregatePopulations.reduce(
      (sum, population) => sum + population.anchors.length,
      0,
    )).toBeLessThanOrEqual(MAX_AGGREGATE_ANCHOR_RECORDS);
    expect(projectedActors.length).toBeLessThanOrEqual(materializedActors.length);
    expect(projectedActors.length + projectedEvidence.renderEvidence.length)
      .toBeLessThanOrEqual(MAX_RENDER_OBJECTS);
    expect(projectedEvidence.renderEvidence.some(
      ({ species }) => species === "southern-leopard-frog",
    )).toBe(true);
    expect(projectedActors.filter(({ species }) => species === "fish-crow").length)
      .toBeLessThanOrEqual(3);
    expect(projectedActors.filter(({ species }) => species === "northern-harrier").length)
      .toBeLessThanOrEqual(1);

    console.info("[rain-chorus-performance]", JSON.stringify({
      ownerIntent: OWNER_INTENT,
      allocationCount,
      coldCandidateMs: rounded(coldCandidateMs),
      frogAnchors: frogs.anchors.length,
      frogEvidence: frogs.evidence.length,
      materializedActors: materializedActors.length,
      projectedActors: projectedActors.length,
      projectedEvidence: projectedEvidence.renderEvidence.length,
      projectionFrames: PROJECTION_FRAMES,
      projectionMs: rounded(projectionMs),
      saveBytes,
      speciesEvaluations: habitat.speciesEvaluations,
    }));
  }, 25_000);
});

function individualInputs(
  habitat: CoreEcologyRainChorusHabitatAssemblage,
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
