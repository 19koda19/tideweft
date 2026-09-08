import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { createCoreEcologyGroup } from "./coreEcologyGroups";
import {
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES,
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION,
  CORE_ECOLOGY_DOMESTIC_PEN_MINIMUM_CENTER_SEPARATION_TILES,
  CORE_ECOLOGY_DOMESTIC_PEN_MINIMUM_PRIOR_ALLOCATION_SEPARATION_TILES,
  CORE_ECOLOGY_DOMESTIC_PEN_RADIUS_TILES,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES,
  canonicalizeCoreEcologyDomesticPenHabitatAssemblage,
  deriveCoreEcologyDomesticPenHabitatAssemblage,
  deriveCoreEcologyDomesticYardHabitatAssemblage,
  type CoreEcologyDomesticPenHabitatAssemblage,
} from "./coreEcologyHabitat";
import { WORLD_POSITION_UNITS_PER_TILE, createWorldPosition } from "./worldPosition";

function individualInputs(
  habitat: CoreEcologyDomesticPenHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation === "individual-representatives"
      && population.populationUnits > 0
      ? [{
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
      : []
  ));
}

describe("core ecology additive domestic habitat properties", () => {
  it.each([
    ["alpha25 pen ordinary", -17, 29],
    ["alpha25 pen signed", 719, -304],
    ["alpha25 pen extreme", 1_000_000, -1_000_000],
  ])("preserves the exact v8 prefix and selects a stable separated pen: %s", (
    seedText,
    regionX,
    regionY,
  ) => {
    const rootSeed = seedFromText(seedText);
    const originRegion = createRegionCoord(regionX, regionY);
    const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    const domesticAnchor = Object.freeze({
      anchorId: "settlement:start:storehouse-yard",
      species: "domestic-chicken" as const,
      position: createWorldPosition(
        originRegion,
        64 * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        64 * WORLD_POSITION_UNITS_PER_TILE + halfTile,
      ),
      radiusTiles: 8,
    });
    const v8 = deriveCoreEcologyDomesticYardHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor,
    });
    const v9 = deriveCoreEcologyDomesticPenHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor,
    });
    const replay = deriveCoreEcologyDomesticPenHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor,
    });
    const goat = v9.populations.at(-1);

    expect(v9).toEqual(replay);
    expect(v9.generationVersion).toBe(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION);
    expect(v9.populations.map(({ species }) => species))
      .toEqual(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES);
    expect(stableStringify(
      v9.populations.slice(0, CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES.length),
    )).toBe(stableStringify(v8.populations));
    expect(stableStringify(v9.tidalAnchors)).toBe(stableStringify(v8.tidalAnchors));
    expect(stableStringify(v9.domesticAnchor)).toBe(stableStringify(v8.domesticAnchor));
    expect(v9.speciesEvaluations).toBe(WORLD_WIDTH * WORLD_HEIGHT * 17);
    expect(v9.maximumAllocationBudget).toBe(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS);
    expect(goat).toMatchObject({
      species: "domestic-goat",
      representation: "individual-representatives",
      habitatCapacity: 2,
      populationUnits: 2,
      activitySignal: { activePeriod: "variable", kind: "roaming" },
    });
    expect(goat?.allocations).toHaveLength(2);
    expect(v9.domesticPenAnchor).toMatchObject({
      anchorId: `${domesticAnchor.anchorId}/pen/1`,
      species: "domestic-goat",
      radiusTiles: CORE_ECOLOGY_DOMESTIC_PEN_RADIUS_TILES,
    });
    const yardX = Math.trunc(domesticAnchor.position.localX / WORLD_POSITION_UNITS_PER_TILE);
    const yardY = Math.trunc(domesticAnchor.position.localY / WORLD_POSITION_UNITS_PER_TILE);
    const penX = Math.trunc(
      v9.domesticPenAnchor.position.localX / WORLD_POSITION_UNITS_PER_TILE,
    );
    const penY = Math.trunc(
      v9.domesticPenAnchor.position.localY / WORLD_POSITION_UNITS_PER_TILE,
    );
    expect(Math.abs(penX - yardX) + Math.abs(penY - yardY))
      .toBeGreaterThanOrEqual(CORE_ECOLOGY_DOMESTIC_PEN_MINIMUM_CENTER_SEPARATION_TILES);
    const priorAllocations = v8.populations.flatMap((population) => (
      population.representation === "individual-representatives" ? population.allocations : []
    ));
    expect(priorAllocations.every((prior) => {
      const priorX = prior.tileIndex % WORLD_WIDTH;
      const priorY = Math.trunc(prior.tileIndex / WORLD_WIDTH);
      return Math.abs(penX - priorX) + Math.abs(penY - priorY)
        >= CORE_ECOLOGY_DOMESTIC_PEN_MINIMUM_PRIOR_ALLOCATION_SEPARATION_TILES;
    })).toBe(true);
    for (const allocation of goat?.allocations ?? []) {
      const goatX = allocation.tileIndex % WORLD_WIDTH;
      const goatY = Math.trunc(allocation.tileIndex / WORLD_WIDTH);
      expect(Math.abs(goatX - penX) + Math.abs(goatY - penY))
        .toBeLessThanOrEqual(CORE_ECOLOGY_DOMESTIC_PEN_RADIUS_TILES);
      expect(priorAllocations.every((prior) => {
        const priorX = prior.tileIndex % WORLD_WIDTH;
        const priorY = Math.trunc(prior.tileIndex / WORLD_WIDTH);
        return Math.abs(goatX - priorX) + Math.abs(goatY - priorY)
          >= CORE_ECOLOGY_DOMESTIC_PEN_MINIMUM_PRIOR_ALLOCATION_SEPARATION_TILES;
      })).toBe(true);
    }
    const first = goat?.allocations[0];
    const second = goat?.allocations[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) {
      expect(
        Math.abs((first.tileIndex % WORLD_WIDTH) - (second.tileIndex % WORLD_WIDTH))
        + Math.abs(
          Math.trunc(first.tileIndex / WORLD_WIDTH) - Math.trunc(second.tileIndex / WORLD_WIDTH),
        ),
      ).toBeGreaterThanOrEqual(2);
    }
    expect(canonicalizeCoreEcologyDomesticPenHabitatAssemblage(v9)).toEqual(v9);
  });

  it("uses shared population, identity, group, and serialization abstractions", () => {
    const rootSeed = seedFromText("alpha25 shared abstractions");
    const originRegion = createRegionCoord(-17, 29);
    const domesticAnchor = {
      anchorId: "settlement:start:storehouse-yard",
      species: "domestic-chicken" as const,
      position: createWorldPosition(originRegion, 64_500, 64_500),
      radiusTiles: 8,
    };
    const habitat = deriveCoreEcologyDomesticPenHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor,
    });
    const goat = habitat.populations.at(-1);
    if (goat === undefined || goat.species !== "domestic-goat") {
      throw new Error("v9 goat suffix is missing");
    }
    const group = createCoreEcologyGroup({
      seed: rootSeed,
      species: goat.species,
      originRegion,
      populationKey: goat.populationKey,
      groupOrdinal: 0,
      memberOrdinals: goat.allocations.map(({ allocationOrdinal }) => allocationOrdinal),
      anchor: goat.allocations[0]!.position,
    });
    expect(group.identity.stableId.startsWith("HERD-v1-")).toBe(true);
    expect(group.memberOrdinals).toEqual([0, 1]);

    const patch = createCoreEcologyAggregatePatch({
      seed: rootSeed,
      patchKey: "domestic-pen:property",
      originRegion,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v9", habitat },
    });
    expect(patch.populations.find(({ species }) => species === "domestic-goat"))
      .toMatchObject({ populationSize: 2 });
    expect(canonicalizeCoreEcologyAggregatePatch(patch)).toEqual(patch);
    expect(deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(patch)))
      .toEqual(patch);
    expect(CORE_ECOLOGY_MAX_POPULATIONS).toBe(16);
    expect(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS).toBe(24);
  });

  it("fails altered prefixes and pen placement closed", () => {
    const rootSeed = seedFromText("alpha25 canonical tamper");
    const originRegion = createRegionCoord(-17, 29);
    const habitat = deriveCoreEcologyDomesticPenHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor: {
        anchorId: "settlement:start:storehouse-yard",
        species: "domestic-chicken",
        position: createWorldPosition(originRegion, 64_500, 64_500),
        radiusTiles: 8,
      },
    });
    const yardX = Math.trunc(
      habitat.domesticAnchor.position.localX / WORLD_POSITION_UNITS_PER_TILE,
    );
    const yardY = Math.trunc(
      habitat.domesticAnchor.position.localY / WORLD_POSITION_UNITS_PER_TILE,
    );
    const priorAllocation = habitat.populations
      .slice(0, CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES.length)
      .flatMap((population) => (
        population.representation === "individual-representatives" ? population.allocations : []
      ))
      .find(({ tileIndex }) => {
        const priorX = tileIndex % WORLD_WIDTH;
        const priorY = Math.trunc(tileIndex / WORLD_WIDTH);
        return Math.abs(priorX - yardX) + Math.abs(priorY - yardY)
          >= CORE_ECOLOGY_DOMESTIC_PEN_MINIMUM_CENTER_SEPARATION_TILES;
      });
    expect(priorAllocation).toBeDefined();
    if (priorAllocation === undefined) {
      throw new Error("v9 tamper fixture lacks a separated prior individual allocation");
    }
    expect(canonicalizeCoreEcologyDomesticPenHabitatAssemblage({
      ...habitat,
      domesticPenAnchor: {
        ...habitat.domesticPenAnchor,
        position: priorAllocation.position,
      },
    })).toBeNull();
    expect(canonicalizeCoreEcologyDomesticPenHabitatAssemblage({
      ...habitat,
      domesticPenAnchor: {
        ...habitat.domesticPenAnchor,
        position: habitat.domesticAnchor.position,
      },
    })).toBeNull();
    expect(canonicalizeCoreEcologyDomesticPenHabitatAssemblage({
      ...habitat,
      populations: [
        { ...habitat.populations[0], populationKey: "altered-prefix" },
        ...habitat.populations.slice(1),
      ],
    })).toBeNull();
  });
});
