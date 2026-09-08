import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { generateRegionTerrain } from "../sim/regionTerrain";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES,
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES,
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES_EVALUATION_BUDGET,
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_VERSION,
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES,
  canonicalizeCoreEcologyRegionalPredatorHabitatAssemblage,
  coreEcologyHabitatSpeciesBounds,
  deriveCoreEcologyRegionalPredatorHabitatAssemblage,
  deriveCoreEcologyRegionalUplandHabitatAssemblage,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  deriveCoreEcologyMaterializedActorIds,
  setCoreEcologyMaterializationForWindow,
} from "./coreEcologyRuntime";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import { WORLD_POSITION_UNITS_PER_TILE, createWorldPosition } from "./worldPosition";

export const ALPHA31_REGIONAL_PREDATOR_HABITAT_OWNER_INTENT =
  "test:alpha31-regional-predator-habitat:v1" as const;
export const ALPHA31_REGIONAL_PREDATOR_MATERIALIZATION_OWNER_INTENT =
  "test:alpha31-regional-predator-materialization:v1" as const;

const CASES = Object.freeze([
  Object.freeze({ seed: "alpha31 cougar rabbit brown bear chain", x: 0, y: 0 }),
  Object.freeze({ seed: "alpha31 regional predators signed", x: -719, y: 304 }),
  Object.freeze({
    seed: "alpha31 regional predators positive edge",
    x: REGION_COORD_LIMIT,
    y: REGION_COORD_LIMIT,
  }),
  Object.freeze({
    seed: "alpha31 regional predators negative edge",
    x: -REGION_COORD_LIMIT,
    y: -REGION_COORD_LIMIT,
  }),
] as const);

describe("Alpha 31 additive regional-predator habitat", () => {
  it(`${ALPHA31_REGIONAL_PREDATOR_HABITAT_OWNER_INTENT} preserves v10 exactly and admits one bounded solitary-predator duo`, () => {
    let combinedPresence = false;
    let combinedAbsence = false;
    for (const testCase of CASES) {
      const current = fixture(testCase.seed, testCase.x, testCase.y);
      const replay = deriveCoreEcologyRegionalPredatorHabitatAssemblage(current.input);

      expect(current.predators).toEqual(replay);
      expect(current.predators.generationVersion)
        .toBe(CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_VERSION);
      expect(current.predators.populations.map(({ species }) => species))
        .toEqual(CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES);
      expect(stableStringify(current.predators.populations.slice(
        0,
        CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES.length,
      ))).toBe(stableStringify(current.upland.populations));
      expect(stableStringify(current.predators.regionalHabitat))
        .toBe(stableStringify(current.upland.regionalHabitat));
      expect(stableStringify(current.predators.tidalAnchors))
        .toBe(stableStringify(current.upland.tidalAnchors));
      expect(stableStringify(current.predators.domesticAnchor))
        .toBe(stableStringify(current.upland.domesticAnchor));
      expect(stableStringify(current.predators.domesticPenAnchor))
        .toBe(stableStringify(current.upland.domesticPenAnchor));
      expect(current.predators.selection).toEqual(current.upland.selection);
      expect(current.predators.terrainHash).toBe(current.upland.terrainHash);
      expect(current.predators.evaluatedTiles).toBe(current.upland.evaluatedTiles);
      expect(current.predators.speciesEvaluations).toBe(
        current.upland.speciesEvaluations
          + current.upland.regionalHabitat.evaluatedTiles * 2,
      );
      expect(current.predators.speciesEvaluations)
        .toBeLessThanOrEqual(CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES_EVALUATION_BUDGET);
      expect(allocationCount(current.predators))
        .toBeLessThanOrEqual(CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_MAX_ALLOCATIONS);

      const wolf = requiredPopulation(current.predators, "gray-wolf");
      const cougar = requiredPopulation(current.predators, "cougar");
      const brownBear = requiredPopulation(current.predators, "brown-bear");
      const boar = requiredPopulation(current.predators, "wild-boar");
      const elk = requiredPopulation(current.predators, "elk");
      const preySupport = clampFixed(
        multiplyFixed(ratioFixed(boar.habitatCapacity, 7), 400_000)
          + multiplyFixed(ratioFixed(elk.habitatCapacity, 12), 700_000),
      );
      const wolfSupport = ratioFixed(wolf.habitatCapacity, 6);
      expect(cougar.capacityInputs.predatorPressure)
        .toBe(multiplyFixed(wolfSupport, 220_000));
      expect(brownBear.capacityInputs.predatorPressure).toBe(clampFixed(
        multiplyFixed(wolfSupport, 120_000)
          + multiplyFixed(ratioFixed(cougar.habitatCapacity, 2), 80_000),
      ));

      for (const population of [cougar, brownBear]) {
        const bounds = coreEcologyHabitatSpeciesBounds(population.species);
        expect(bounds).not.toBeNull();
        expect(population.habitatCapacity).toBeLessThanOrEqual(2);
        expect(population.populationUnits).toBeLessThanOrEqual(population.habitatCapacity);
        expect(population.allocations.length).toBeLessThanOrEqual(1);
        expect(population.allocations.reduce(
          (sum, allocation) => sum + allocation.representedUnits,
          0,
        )).toBe(population.populationUnits);
        expect(population.allocations.every(({ position }) => (
          position.region.x === current.predators.regionalHabitat.originRegion.x
          && position.region.y === current.predators.regionalHabitat.originRegion.y
        ))).toBe(true);
        if (population.populationUnits === 0) {
          expect(population.habitatCapacity).toBeLessThan(2);
          expect(population.allocations).toEqual([]);
        }
      }
      if (preySupport < 260_000) expect(cougar.populationUnits).toBe(0);
      if (preySupport < 100_000 && brownBear.capacityInputs.food < 620_000) {
        expect(brownBear.populationUnits).toBe(0);
      }
      combinedPresence ||= cougar.populationUnits > 0 && brownBear.populationUnits > 0;
      combinedAbsence ||= cougar.populationUnits === 0 && brownBear.populationUnits === 0;

      const regionalTiles = current.predators.populations
        .slice(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length)
        .flatMap(({ allocations }) => allocations.map(({ tileIndex }) => tileIndex));
      expect(new Set(regionalTiles).size).toBe(regionalTiles.length);
      expect(canonicalizeCoreEcologyRegionalPredatorHabitatAssemblage(current.predators))
        .toEqual(current.predators);
    }
    expect(combinedPresence).toBe(true);
    expect(combinedAbsence).toBe(true);
  }, 40_000);

  it("rejects a changed frozen prefix, appended overlap, or invented predator population", () => {
    const { predators } = fixture("alpha31 cougar rabbit brown bear chain", 0, 0);
    const changedPrefix = structuredClone(predators);
    (changedPrefix.populations[0] as { populationKey: string }).populationKey += ":tampered";
    expect(canonicalizeCoreEcologyRegionalPredatorHabitatAssemblage(changedPrefix)).toBeNull();

    const cougarIndex = CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES.length;
    const brownBearIndex = cougarIndex + 1;
    const cougar = predators.populations[cougarIndex];
    const brownBear = predators.populations[brownBearIndex];
    if (cougar?.allocations[0] !== undefined && brownBear?.allocations[0] !== undefined) {
      const overlap = structuredClone(predators);
      (overlap.populations[brownBearIndex] as unknown as { allocations: unknown[] }).allocations[0]
        = structuredClone(
        overlap.populations[cougarIndex]!.allocations[0]!,
      );
      expect(canonicalizeCoreEcologyRegionalPredatorHabitatAssemblage(overlap)).toBeNull();
    }

    const absent = predators.populations.slice(-2).find(({ populationUnits }) => populationUnits === 0);
    if (absent !== undefined) {
      const invented = structuredClone(predators);
      const record = invented.populations.find(({ species }) => species === absent.species)! as {
        habitatCapacity: number;
        populationPressure: number;
        populationUnits: number;
      };
      record.populationUnits = 1;
      record.populationPressure = ratioFixed(1, record.habitatCapacity);
      expect(canonicalizeCoreEcologyRegionalPredatorHabitatAssemblage(invented)).toBeNull();
    }
  });

  it(`${ALPHA31_REGIONAL_PREDATOR_MATERIALIZATION_OWNER_INTENT} uses the shared bounded top-K materialization path with no predator groups`, () => {
    const { predators, rootSeed } = fixture("alpha31 cougar rabbit brown bear chain", 0, 0);
    const patch = createCoreEcologyAggregatePatch({
      seed: rootSeed,
      patchKey: "alpha31:regional-predator:property",
      originRegion: predators.originRegion,
      derivation: { kind: "habitat-v11", habitat: predators },
      populations: individualInputs(predators),
    });
    expect(patch.populations.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_POPULATIONS);
    expect(patch.groups.groups.some(({ identity }) => (
      identity.species === "cougar" || identity.species === "brown-bear"
    ))).toBe(false);
    const window = {
      origin: {
        x: predators.regionalHabitat.originRegion.x * WORLD_WIDTH,
        y: predators.regionalHabitat.originRegion.y * WORLD_HEIGHT,
      },
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
    } as const;
    const selected = deriveCoreEcologyMaterializedActorIds(patch, window);
    expect(selected).not.toBeNull();
    expect(selected?.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    const materialized = setCoreEcologyMaterializationForWindow(patch, window, 0);
    expect(materialized).not.toBeNull();
    expect(canonicalizeCoreEcologyAggregatePatch(materialized)).toEqual(materialized);
  });
});

function fixture(seedText: string, regionX: number, regionY: number) {
  const rootSeed = seedFromText(seedText);
  const originRegion = createRegionCoord(regionX, regionY);
  const terrain = generateRegionTerrain(rootSeed, originRegion);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `alpha31:predator:yard:${regionX}:${regionY}`,
        species: "domestic-chicken" as const,
        position: createWorldPosition(
          originRegion,
          x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
          y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        ),
        radiusTiles: 8,
      } as const;
      const input = Object.freeze({ rootSeed, originRegion, terrain, domesticAnchor });
      try {
        const upland = deriveCoreEcologyRegionalUplandHabitatAssemblage(input);
        const predators = deriveCoreEcologyRegionalPredatorHabitatAssemblage(input);
        return Object.freeze({ input, rootSeed, upland, predators });
      } catch {
        // The deterministic scan finds a physically valid settlement yard;
        // absence belongs to wildlife populations, not an invalid home anchor.
      }
    }
  }
  throw new Error(`${seedText}: no deterministic domestic anchor supports the habitat prefix`);
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

function requiredPopulation(
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
  species: (typeof CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES)[number],
) {
  const population = habitat.populations.find((candidate) => candidate.species === species);
  if (population === undefined) throw new Error(`Missing ${species} habitat record`);
  return population;
}

function allocationCount(habitat: CoreEcologyRegionalPredatorHabitatAssemblage): number {
  return habitat.populations.reduce(
    (sum, population) => sum + population.allocations.length,
    0,
  );
}

function ratioFixed(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.trunc((numerator * FIXED_POINT) / denominator);
}

function multiplyFixed(left: number, right: number): number {
  return Math.trunc((left * right) / FIXED_POINT);
}

function clampFixed(value: number): number {
  return Math.max(0, Math.min(FIXED_POINT, Math.trunc(value)));
}
