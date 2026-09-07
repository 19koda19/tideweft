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
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES_EVALUATION_BUDGET,
  canonicalizeCoreEcologyDomesticYardHabitatAssemblage,
  deriveCoreEcologyDomesticYardHabitatAssemblage,
  type CoreEcologyDomesticHabitatAnchorInput,
  type CoreEcologyDomesticYardHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

export const OWNER_INTENT = "test:alpha24-domestic-chicken-performance:v1" as const;

const SEED = seedFromText("alpha24 domestic chicken performance owner");
const REGIONS = Object.freeze([
  createRegionCoord(0, 0),
  createRegionCoord(-17, 29),
  createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
]);
const UTF8_ENCODER = new TextEncoder();

/**
 * Shared-runner regression ceilings, not device frame-rate claims. They leave
 * broad scheduling headroom while still catching accidental all-world scans,
 * population-proportional allocation growth, or unbounded persistence records.
 */
const CANDIDATE_BATCH_BUDGET_MS = 15_000;
const CANDIDATE_HABITAT_BUDGET_BYTES = 384 * 1_024;
const CANDIDATE_SAVE_BUDGET_BYTES = 768 * 1_024;
const MAX_TOTAL_SPECIES_EVALUATIONS =
  REGIONS.length * CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES_EVALUATION_BUDGET;
const MAX_TOTAL_ALLOCATIONS =
  REGIONS.length * CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_MAX_ALLOCATIONS;

interface Candidate {
  readonly habitat: CoreEcologyDomesticYardHabitatAssemblage;
  readonly habitatBytes: number;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly region: RegionCoord;
  readonly saveBytes: number;
  readonly serialized: string;
}

describe("Alpha-24 domestic-yard measured candidate budgets", () => {
  it("bounds deterministic habitat-v8 derivation and aggregate serialization", () => {
    const started = performance.now();
    const candidates = REGIONS.map((region, index): Candidate => {
      const domesticAnchor = candidateAnchor(region, index);
      const habitat = deriveCoreEcologyDomesticYardHabitatAssemblage({
        rootSeed: SEED,
        originRegion: region,
        domesticAnchor,
      });
      const replay = deriveCoreEcologyDomesticYardHabitatAssemblage({
        rootSeed: SEED,
        originRegion: region,
        domesticAnchor,
      });
      const patch = createCoreEcologyAggregatePatch({
        seed: SEED,
        patchKey: `performance:domestic-yard:${index}`,
        originRegion: region,
        populations: individualInputs(habitat),
        derivation: { kind: "habitat-v8", habitat },
      });
      const serialized = serializeCoreEcologyAggregatePatch(patch);
      const replayPatch = createCoreEcologyAggregatePatch({
        seed: SEED,
        patchKey: `performance:domestic-yard:${index}`,
        originRegion: region,
        populations: individualInputs(replay),
        derivation: { kind: "habitat-v8", habitat: replay },
      });

      expect(replay).toEqual(habitat);
      expect(canonicalizeCoreEcologyDomesticYardHabitatAssemblage(habitat)).toEqual(habitat);
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
      const chicken = candidate.habitat.populations.at(-1);

      expect(candidate.patch).toMatchObject({
        derivation: { kind: "habitat-v8" },
        originRegion: candidate.region,
      });
      expect(candidate.habitat.populations.map(({ species }) => species))
        .toEqual(CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES);
      expect(candidate.habitat.speciesEvaluations)
        .toBeLessThanOrEqual(CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES_EVALUATION_BUDGET);
      expect(allocationCount)
        .toBeLessThanOrEqual(CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_MAX_ALLOCATIONS);
      expect(chicken).toMatchObject({
        species: "domestic-chicken",
        representation: "individual-representatives",
      });
      expect(chicken?.populationUnits).toBeGreaterThanOrEqual(2);
      expect(chicken?.populationUnits).toBeLessThanOrEqual(3);
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

    console.info("[alpha24-domestic-chicken-performance]", JSON.stringify({
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
    anchorId: `performance:domestic-yard:${ordinal}`,
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
  habitat: CoreEcologyDomesticYardHabitatAssemblage,
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
