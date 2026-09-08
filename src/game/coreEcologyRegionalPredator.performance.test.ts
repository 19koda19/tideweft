import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { generateRegionTerrain } from "../sim/regionTerrain";
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
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES_EVALUATION_BUDGET,
  deriveCoreEcologyRegionalPredatorHabitatAssemblage,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
} from "./coreEcologyHabitat";
import { deriveCoreEcologyMaterializedActorIds } from "./coreEcologyRuntime";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import { WORLD_POSITION_UNITS_PER_TILE, createWorldPosition } from "./worldPosition";

export const ALPHA31_REGIONAL_PREDATOR_PERFORMANCE_OWNER_INTENT =
  "test:alpha31-regional-predator-performance:v1" as const;

const UTF8_ENCODER = new TextEncoder();
const CANDIDATE_BATCH_BUDGET_MS = 15_000;
const CANDIDATE_HABITAT_BUDGET_BYTES = 720 * 1_024;
const CANDIDATE_SAVE_BUDGET_BYTES = 1_100 * 1_024;
const CANDIDATES = Object.freeze([
  Object.freeze({ seed: "alpha31 cougar rabbit brown bear chain", x: 0, y: 0 }),
  Object.freeze({
    seed: "alpha31 regional predator performance edge",
    x: -REGION_COORD_LIMIT,
    y: REGION_COORD_LIMIT,
  }),
] as const);

describe("Alpha 31 regional-predator shared performance", () => {
  it(`${ALPHA31_REGIONAL_PREDATOR_PERFORMANCE_OWNER_INTENT} bounds one combined duo batch`, () => {
    const started = performance.now();
    let maximumHabitatBytes = 0;
    let maximumSaveBytes = 0;
    let totalAllocations = 0;
    let totalSpeciesEvaluations = 0;

    for (const [ordinal, candidate] of CANDIDATES.entries()) {
      const habitat = habitatFixture(candidate.seed, candidate.x, candidate.y);
      const patch = createCoreEcologyAggregatePatch({
        seed: seedFromText(candidate.seed),
        patchKey: `alpha31:regional-predator:performance:${ordinal}`,
        originRegion: habitat.originRegion,
        derivation: { kind: "habitat-v11", habitat },
        populations: individualInputs(habitat),
      });
      const serialized = serializeCoreEcologyAggregatePatch(patch);
      const materialized = deriveCoreEcologyMaterializedActorIds(patch, {
        origin: {
          x: habitat.regionalHabitat.originRegion.x * WORLD_WIDTH,
          y: habitat.regionalHabitat.originRegion.y * WORLD_HEIGHT,
        },
        terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
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
        CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_MAX_ALLOCATIONS,
      );
      expect(habitat.speciesEvaluations)
        .toBeLessThanOrEqual(CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES_EVALUATION_BUDGET);
      expect(habitatBytes).toBeLessThan(CANDIDATE_HABITAT_BUDGET_BYTES);
      expect(saveBytes).toBeLessThan(CANDIDATE_SAVE_BUDGET_BYTES);
      expect(saveBytes).toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);

      maximumHabitatBytes = Math.max(maximumHabitatBytes, habitatBytes);
      maximumSaveBytes = Math.max(maximumSaveBytes, saveBytes);
      totalAllocations += allocations;
      totalSpeciesEvaluations += habitat.speciesEvaluations;
    }

    const candidateBatchMs = performance.now() - started;
    expect(candidateBatchMs).toBeLessThan(CANDIDATE_BATCH_BUDGET_MS);
    expect(totalAllocations).toBeLessThanOrEqual(
      CANDIDATES.length * CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_MAX_ALLOCATIONS,
    );
    expect(totalSpeciesEvaluations).toBeLessThanOrEqual(
      CANDIDATES.length * CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES_EVALUATION_BUDGET,
    );
    console.info("[alpha31-regional-predator-performance]", JSON.stringify({
      ownerIntent: ALPHA31_REGIONAL_PREDATOR_PERFORMANCE_OWNER_INTENT,
      candidateBatchMs: Math.round(candidateBatchMs * 100) / 100,
      candidates: CANDIDATES.length,
      maximumHabitatBytes,
      maximumSaveBytes,
      totalAllocations,
      totalSpeciesEvaluations,
    }));
  }, 25_000);
});

function habitatFixture(seedText: string, regionX: number, regionY: number) {
  const rootSeed = seedFromText(seedText);
  const originRegion = createRegionCoord(regionX, regionY);
  const terrain = generateRegionTerrain(rootSeed, originRegion);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      try {
        return deriveCoreEcologyRegionalPredatorHabitatAssemblage({
          rootSeed,
          originRegion,
          terrain,
          domesticAnchor: {
            anchorId: `alpha31:predator:performance-yard:${regionX}:${regionY}`,
            species: "domestic-chicken",
            position: createWorldPosition(
              originRegion,
              x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
              y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
            ),
            radiusTiles: 8,
          },
        });
      } catch {
        // Continue through the deterministic bounded anchor candidates.
      }
    }
  }
  throw new Error(`${seedText}: no deterministic domestic anchor supports the performance case`);
}

function individualInputs(
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
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
