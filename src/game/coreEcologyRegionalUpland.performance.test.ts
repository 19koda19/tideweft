import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES_EVALUATION_BUDGET,
  deriveCoreEcologyRegionalUplandHabitatAssemblage,
  type CoreEcologyRegionalUplandHabitatAssemblage,
} from "./coreEcologyHabitat";
import { deriveCoreEcologyMaterializedActorIds } from "./coreEcologyRuntime";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import { WORLD_POSITION_UNITS_PER_TILE, createWorldPosition } from "./worldPosition";

export const ALPHA30_REGIONAL_UPLAND_PERFORMANCE_OWNER_INTENT =
  "test:alpha30-regional-upland-performance:v1" as const;

const UTF8_ENCODER = new TextEncoder();
const CANDIDATE_BATCH_BUDGET_MS = 12_000;
const CANDIDATE_HABITAT_BUDGET_BYTES = 640 * 1_024;
const CANDIDATE_SAVE_BUDGET_BYTES = 1_024 * 1_024;
const CANDIDATES = Object.freeze([
  Object.freeze({ seedText: "alpha25 shared abstractions", x: -17, y: 29 }),
  Object.freeze({
    seedText: "alpha30 regional positive edge",
    x: REGION_COORD_LIMIT,
    y: REGION_COORD_LIMIT,
  }),
]);

describe("Alpha 30 regional-upland shared performance", () => {
  it("bounds regional generation, serialization, allocation, and top-K materialization", () => {
    const started = performance.now();
    let maximumHabitatBytes = 0;
    let maximumSaveBytes = 0;
    let maximumMaterializedActors = 0;
    let totalAllocations = 0;
    let totalSpeciesEvaluations = 0;

    for (const [ordinal, candidate] of CANDIDATES.entries()) {
      const seed = seedFromText(candidate.seedText);
      const originRegion = createRegionCoord(candidate.x, candidate.y);
      const habitat = deriveCoreEcologyRegionalUplandHabitatAssemblage({
        rootSeed: seed,
        originRegion,
        domesticAnchor: {
          anchorId: `performance:regional-upland:${ordinal}`,
          species: "domestic-chicken",
          position: createWorldPosition(
            originRegion,
            64 * WORLD_POSITION_UNITS_PER_TILE
              + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
            64 * WORLD_POSITION_UNITS_PER_TILE
              + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
          ),
          radiusTiles: 8,
        },
      });
      const patch = createCoreEcologyAggregatePatch({
        seed,
        patchKey: `performance:regional-upland:${ordinal}`,
        originRegion,
        derivation: { kind: "habitat-v10", habitat },
        populations: individualInputs(habitat),
      });
      const serialized = serializeCoreEcologyAggregatePatch(patch);
      const materialized = deriveCoreEcologyMaterializedActorIds(patch, {
        origin: {
          x: habitat.regionalHabitat.originRegion.x * WORLD_WIDTH,
          y: habitat.regionalHabitat.originRegion.y * WORLD_HEIGHT,
        },
        terrain: {
          width: REGIONAL_TRAVEL_COLUMNS,
          height: REGIONAL_TRAVEL_ROWS,
        },
      });

      const habitatBytes = UTF8_ENCODER.encode(stableStringify(habitat)).byteLength;
      const saveBytes = UTF8_ENCODER.encode(serialized).byteLength;
      const allocations = habitat.populations.reduce(
        (sum, population) => sum + population.allocations.length,
        0,
      );
      expect(deserializeCoreEcologyAggregatePatch(serialized)).toEqual(patch);
      expect(materialized).not.toBeNull();
      expect(materialized?.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
      expect(allocations).toBeLessThanOrEqual(
        CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_MAX_ALLOCATIONS,
      );
      expect(habitat.speciesEvaluations)
        .toBeLessThanOrEqual(CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES_EVALUATION_BUDGET);
      expect(habitatBytes).toBeLessThan(CANDIDATE_HABITAT_BUDGET_BYTES);
      expect(saveBytes).toBeLessThan(CANDIDATE_SAVE_BUDGET_BYTES);
      expect(saveBytes).toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);

      maximumHabitatBytes = Math.max(maximumHabitatBytes, habitatBytes);
      maximumSaveBytes = Math.max(maximumSaveBytes, saveBytes);
      maximumMaterializedActors = Math.max(
        maximumMaterializedActors,
        materialized?.length ?? 0,
      );
      totalAllocations += allocations;
      totalSpeciesEvaluations += habitat.speciesEvaluations;
    }

    const candidateBatchMs = performance.now() - started;
    expect(candidateBatchMs).toBeLessThan(CANDIDATE_BATCH_BUDGET_MS);
    expect(totalAllocations).toBeLessThanOrEqual(
      CANDIDATES.length * CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_MAX_ALLOCATIONS,
    );
    expect(totalSpeciesEvaluations).toBeLessThanOrEqual(
      CANDIDATES.length * CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES_EVALUATION_BUDGET,
    );
    console.info("[alpha30-regional-upland-performance]", JSON.stringify({
      ownerIntent: ALPHA30_REGIONAL_UPLAND_PERFORMANCE_OWNER_INTENT,
      candidateBatchMs: Math.round(candidateBatchMs * 100) / 100,
      candidates: CANDIDATES.length,
      maximumHabitatBytes,
      maximumMaterializedActors,
      maximumSaveBytes,
      totalAllocations,
      totalSpeciesEvaluations,
    }));
  }, 20_000);
});

function individualInputs(
  habitat: CoreEcologyRegionalUplandHabitatAssemblage,
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
