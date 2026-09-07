import { describe, expect, it } from "vitest";

import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES,
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES_EVALUATION_BUDGET,
  canonicalizeCoreEcologyDomesticPenHabitatAssemblage,
  deriveCoreEcologyDomesticPenHabitatAssemblage,
  type CoreEcologyDomesticHabitatAnchorInput,
  type CoreEcologyDomesticPenHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

export const OWNER_INTENT =
  "test:alpha25-shared-domestic-livestock-performance:v1" as const;

const SEED = seedFromText("alpha25 shared domestic livestock performance owner");
const REGIONS = Object.freeze([
  createRegionCoord(0, 0),
  createRegionCoord(-17, 29),
  createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
]);
const UTF8_ENCODER = new TextEncoder();

/**
 * Shared-runner regression ceilings, not device frame-rate claims. The batch
 * proves that adding a livestock profile retains fixed habitat, allocation,
 * actor-materialization, and serialized-state ceilings instead of multiplying
 * work by species pairs.
 */
const CANDIDATE_BATCH_BUDGET_MS = 15_000;
const CANDIDATE_HABITAT_BUDGET_BYTES = 448 * 1_024;
const CANDIDATE_SAVE_BUDGET_BYTES = 896 * 1_024;
const MAX_TOTAL_SPECIES_EVALUATIONS =
  REGIONS.length * CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES_EVALUATION_BUDGET;
const MAX_TOTAL_ALLOCATIONS =
  REGIONS.length * CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS;

interface Candidate {
  readonly habitat: CoreEcologyDomesticPenHabitatAssemblage;
  readonly habitatBytes: number;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly region: RegionCoord;
  readonly saveBytes: number;
  readonly serialized: string;
}

describe("Alpha-25 shared domestic-livestock measured candidate budgets", () => {
  it("keeps the catalog-driven habitat and aggregate patch within fixed ceilings", () => {
    const started = performance.now();
    const candidates = REGIONS.map((region, index): Candidate => {
      const domesticAnchor = candidateAnchor(region, index);
      const habitat = deriveCoreEcologyDomesticPenHabitatAssemblage({
        rootSeed: SEED,
        originRegion: region,
        domesticAnchor,
      });
      const replay = deriveCoreEcologyDomesticPenHabitatAssemblage({
        rootSeed: SEED,
        originRegion: region,
        domesticAnchor,
      });
      const patch = createCoreEcologyAggregatePatch({
        seed: SEED,
        patchKey: `performance:domestic-livestock:${index}`,
        originRegion: region,
        populations: individualInputs(habitat),
        derivation: { kind: "habitat-v9", habitat },
      });
      const serialized = serializeCoreEcologyAggregatePatch(patch);
      const replayPatch = createCoreEcologyAggregatePatch({
        seed: SEED,
        patchKey: `performance:domestic-livestock:${index}`,
        originRegion: region,
        populations: individualInputs(replay),
        derivation: { kind: "habitat-v9", habitat: replay },
      });

      expect(replay).toEqual(habitat);
      expect(canonicalizeCoreEcologyDomesticPenHabitatAssemblage(habitat)).toEqual(habitat);
      expect(serializeCoreEcologyAggregatePatch(replayPatch)).toBe(serialized);
      expect(deserializeCoreEcologyAggregatePatch(serialized)).toEqual(patch);

      return Object.freeze({
        habitat,
        habitatBytes: UTF8_ENCODER.encode(stableStringify(habitat)).byteLength,
        patch,
        region,
        saveBytes: UTF8_ENCODER.encode(serialized).byteLength,
        serialized,
      });
    });
    const candidateBatchMs = performance.now() - started;

    let totalAllocations = 0;
    let totalSpeciesEvaluations = 0;
    let maximumHabitatBytes = 0;
    let maximumSaveBytes = 0;
    for (const candidate of candidates) {
      const allocationCount = candidate.habitat.populations.reduce(
        (sum, population) => sum + population.allocations.length,
        0,
      );
      const goats = candidate.habitat.populations.find(
        ({ species }) => species === "domestic-goat",
      );

      expect(candidate.patch).toMatchObject({
        derivation: { kind: "habitat-v9" },
        originRegion: candidate.region,
      });
      expect(candidate.habitat.populations.map(({ species }) => species))
        .toEqual(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES);
      expect(candidate.habitat.speciesEvaluations)
        .toBeLessThanOrEqual(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES_EVALUATION_BUDGET);
      expect(allocationCount)
        .toBeLessThanOrEqual(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS);
      expect(goats).toMatchObject({
        species: "domestic-goat",
        representation: "individual-representatives",
        populationUnits: 2,
      });
      expect(goats?.allocations).toHaveLength(2);
      expect(candidate.habitatBytes).toBeLessThan(CANDIDATE_HABITAT_BUDGET_BYTES);
      expect(candidate.saveBytes).toBeLessThan(CANDIDATE_SAVE_BUDGET_BYTES);
      expect(candidate.saveBytes).toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);

      totalAllocations += allocationCount;
      totalSpeciesEvaluations += candidate.habitat.speciesEvaluations;
      maximumHabitatBytes = Math.max(maximumHabitatBytes, candidate.habitatBytes);
      maximumSaveBytes = Math.max(maximumSaveBytes, candidate.saveBytes);
    }

    expect(candidateBatchMs).toBeLessThan(CANDIDATE_BATCH_BUDGET_MS);
    expect(totalAllocations).toBeLessThanOrEqual(MAX_TOTAL_ALLOCATIONS);
    expect(totalSpeciesEvaluations).toBeLessThanOrEqual(MAX_TOTAL_SPECIES_EVALUATIONS);

    console.info("[alpha25-shared-domestic-livestock-performance]", JSON.stringify({
      ownerIntent: OWNER_INTENT,
      candidateBatchMs: rounded(candidateBatchMs),
      candidates: candidates.length,
      maximumHabitatBytes,
      maximumSaveBytes,
      totalAllocations,
      totalSpeciesEvaluations,
    }));
  }, 25_000);
});

function candidateAnchor(
  region: RegionCoord,
  ordinal: number,
): CoreEcologyDomesticHabitatAnchorInput {
  return Object.freeze({
    anchorId: `performance:domestic-livestock:${ordinal}`,
    species: "domestic-chicken",
    position: createWorldPosition(
      region,
      Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    ),
    radiusTiles: 8,
  });
}

function individualInputs(
  habitat: CoreEcologyDomesticPenHabitatAssemblage,
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

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
