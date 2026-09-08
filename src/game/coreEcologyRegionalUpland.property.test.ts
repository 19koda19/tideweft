import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { generateRegionTerrain } from "../sim/regionTerrain";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
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
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES,
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_VERSION,
  CORE_ECOLOGY_REGIONAL_UPLAND_HARBOR_SEPARATION_REGIONS,
  CORE_ECOLOGY_REGIONAL_UPLAND_SOURCE_CANDIDATE_BUDGET,
  canonicalizeCoreEcologyRegionalUplandHabitatAssemblage,
  coreEcologyHabitatSpeciesBounds,
  deriveCoreEcologyDomesticPenHabitatAssemblage,
  deriveCoreEcologyRegionalUplandHabitatAssemblage,
  type CoreEcologyRegionalUplandHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import {
  deriveCoreEcologyMaterializedActorIds,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import { WORLD_POSITION_UNITS_PER_TILE, createWorldPosition } from "./worldPosition";

export const ALPHA30_REGIONAL_UPLAND_HABITAT_OWNER_INTENT =
  "test:alpha30-regional-upland-habitat:v1" as const;
export const ALPHA30_REGIONAL_UPLAND_MATERIALIZATION_OWNER_INTENT =
  "test:alpha30-regional-upland-materialization:v1" as const;
export const ALPHA30_REGIONAL_UPLAND_STRESS_OWNER_INTENT =
  "test:alpha30-regional-upland-stress:v1" as const;

const REGIONAL_UPLAND_STRESS_CASES = Object.freeze([
  Object.freeze({ label: "zero origin", seed: "alpha30 stress zero", x: 0, y: 0 }),
  Object.freeze({ label: "west signed seam", seed: "alpha30 stress west seam", x: -1, y: 0 }),
  Object.freeze({ label: "north signed seam", seed: "alpha30 stress north seam", x: 0, y: -1 }),
  Object.freeze({ label: "northwest signed seam", seed: "alpha30 stress northwest seam", x: -1, y: -1 }),
  Object.freeze({ label: "southeast signed seam", seed: "alpha30 stress southeast seam", x: 1, y: 1 }),
  Object.freeze({ label: "signed southwest", seed: "alpha30 regional southwest", x: -719, y: 304 }),
  Object.freeze({ label: "signed northeast", seed: "alpha25 pen signed", x: 719, y: -304 }),
  Object.freeze({ label: "positive coordinate limit", seed: "alpha30 regional positive edge", x: REGION_COORD_LIMIT, y: REGION_COORD_LIMIT }),
  Object.freeze({ label: "negative coordinate limit", seed: "alpha30 regional negative edge", x: -REGION_COORD_LIMIT, y: -REGION_COORD_LIMIT }),
] as const);

function fixture(seedText: string, regionX: number, regionY: number) {
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
  return Object.freeze({
    rootSeed,
    originRegion,
    domesticPen: deriveCoreEcologyDomesticPenHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor,
    }),
    regional: deriveCoreEcologyRegionalUplandHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor,
    }),
  });
}

function stressFixture(seedText: string, regionX: number, regionY: number) {
  const rootSeed = seedFromText(seedText);
  const originRegion = createRegionCoord(regionX, regionY);
  const terrain = generateRegionTerrain(rootSeed, originRegion);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  const anchorCandidates: Array<Readonly<{ x: number; y: number; landTiles: number }>> = [];
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      let landTiles = 0;
      for (const tile of terrain.tiles) {
        if (
          Math.abs(tile.x - x) + Math.abs(tile.y - y) <= 8
          && tile.terrain !== "deep-water"
          && tile.terrain !== "tidal-flat"
        ) landTiles += 1;
      }
      anchorCandidates.push(Object.freeze({ x, y, landTiles }));
    }
  }
  anchorCandidates.sort((left, right) => (
    right.landTiles - left.landTiles
    || left.y - right.y
    || left.x - right.x
  ));

  for (const candidate of anchorCandidates) {
    const domesticAnchor = Object.freeze({
      anchorId: "settlement:stress:storehouse-yard",
      species: "domestic-chicken" as const,
      position: createWorldPosition(
        originRegion,
        candidate.x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        candidate.y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
      ),
      radiusTiles: 8,
    });
    const input = Object.freeze({ rootSeed, originRegion, terrain, domesticAnchor });
    let domesticPen;
    try {
      domesticPen = deriveCoreEcologyDomesticPenHabitatAssemblage(input);
    } catch {
      continue;
    }
    const regional = deriveCoreEcologyRegionalUplandHabitatAssemblage(input);
    return Object.freeze({
      rootSeed,
      originRegion,
      domesticPen,
      regional,
      replay: deriveCoreEcologyRegionalUplandHabitatAssemblage(input),
    });
  }
  throw new Error(`${seedText}: no valid deterministic domestic-habitat anchor`);
}

function individualInputs(
  habitat: CoreEcologyRegionalUplandHabitatAssemblage,
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

function regionalWindow(habitat: CoreEcologyRegionalUplandHabitatAssemblage): CoreEcologyRuntimeWindow {
  return boundedWindowAtRegion(habitat.regionalHabitat.originRegion);
}

function boundedWindowAtRegion(
  region: Readonly<{ x: number; y: number }>,
): CoreEcologyRuntimeWindow {
  const minimumGlobalX = -REGION_COORD_LIMIT * WORLD_WIDTH;
  const minimumGlobalY = -REGION_COORD_LIMIT * WORLD_HEIGHT;
  const maximumGlobalX = REGION_COORD_LIMIT * WORLD_WIDTH + WORLD_WIDTH - 1;
  const maximumGlobalY = REGION_COORD_LIMIT * WORLD_HEIGHT + WORLD_HEIGHT - 1;
  return Object.freeze({
    origin: Object.freeze({
      x: Math.max(
        minimumGlobalX,
        Math.min(region.x * WORLD_WIDTH, maximumGlobalX - REGIONAL_TRAVEL_COLUMNS + 1),
      ),
      y: Math.max(
        minimumGlobalY,
        Math.min(region.y * WORLD_HEIGHT, maximumGlobalY - REGIONAL_TRAVEL_ROWS + 1),
      ),
    }),
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
}

function regionalGroups(
  habitat: CoreEcologyRegionalUplandHabitatAssemblage,
  seed: ReturnType<typeof seedFromText>,
) {
  return createCoreEcologyGroupSet(habitat.populations
    .slice(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length)
    .flatMap((population) => (
      population.allocations.length < 2
        ? []
        : [createCoreEcologyGroup({
            seed,
            species: population.species,
            originRegion: habitat.originRegion,
            populationKey: population.populationKey,
            groupOrdinal: 0,
            memberOrdinals: population.allocations.map(({ allocationOrdinal }) => allocationOrdinal),
            anchor: population.allocations[0]!.position,
          })]
    )));
}

describe("Alpha 30 regional upland habitat properties", () => {
  it.each([
    ["signed southwest", "alpha30 regional southwest", -719, 304],
    ["signed northwest", "alpha25 pen signed", 719, -304],
    ["positive representation edge", "alpha30 regional positive edge", REGION_COORD_LIMIT, REGION_COORD_LIMIT],
    ["negative representation edge", "alpha30 regional negative edge", -REGION_COORD_LIMIT, -REGION_COORD_LIMIT],
  ])("preserves the exact v9 prefix and de-clusters one bounded source: %s", (
    _label,
    seedText,
    regionX,
    regionY,
  ) => {
    const { domesticPen, regional, rootSeed, originRegion } = fixture(
      seedText,
      regionX,
      regionY,
    );
    const replay = fixture(seedText, regionX, regionY).regional;
    const source = regional.regionalHabitat;

    expect(regional).toEqual(replay);
    expect(regional.generationVersion).toBe(CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_VERSION);
    expect(regional.populations.map(({ species }) => species))
      .toEqual(CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES);
    expect(stableStringify(
      regional.populations.slice(0, CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length),
    )).toBe(stableStringify(domesticPen.populations));
    expect(stableStringify(regional.tidalAnchors)).toBe(stableStringify(domesticPen.tidalAnchors));
    expect(stableStringify(regional.domesticAnchor)).toBe(stableStringify(domesticPen.domesticAnchor));
    expect(stableStringify(regional.domesticPenAnchor))
      .toBe(stableStringify(domesticPen.domesticPenAnchor));
    expect(source.habitatClasses).toEqual(["forest-edge", "temperate-upland"]);
    expect(Math.abs(source.originRegion.x - originRegion.x)
      + Math.abs(source.originRegion.y - originRegion.y))
      .toBe(CORE_ECOLOGY_REGIONAL_UPLAND_HARBOR_SEPARATION_REGIONS);
    expect(source.originRegion).not.toEqual(originRegion);
    expect(source.selection).toEqual({
      focusPosition: null,
      radiusTiles: null,
      excludedTileIndices: [],
    });
    expect(source.evaluatedTiles).toBe(WORLD_WIDTH * WORLD_HEIGHT);
    expect(source.sourceCandidateCount).toBeGreaterThan(0);
    expect(source.sourceCandidateCount)
      .toBeLessThanOrEqual(CORE_ECOLOGY_REGIONAL_UPLAND_SOURCE_CANDIDATE_BUDGET);
    expect(regional.maximumAllocationBudget)
      .toBe(CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_MAX_ALLOCATIONS);

    const extension = regional.populations.slice(
      CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length,
    );
    expect(extension.map(({ species }) => species)).toEqual(["wild-boar", "elk", "gray-wolf"]);
    expect(extension.map(({ populationKey }) => populationKey)).toEqual([
      "habitat-v10/temperate-upland/wild-boar",
      "habitat-v10/temperate-upland/elk",
      "habitat-v10/temperate-upland/gray-wolf",
    ]);
    for (const population of extension) {
      expect(population.representation).toBe("individual-representatives");
      expect(population.allocations.map(({ allocationOrdinal }) => allocationOrdinal))
        .toEqual(population.allocations.map((_, ordinal) => ordinal));
      for (const allocation of population.allocations) {
        expect(allocation.position.region).toEqual(source.originRegion);
        expect(allocation.terrain === "meadow" || allocation.terrain === "ridge").toBe(true);
      }
    }
    expect(canonicalizeCoreEcologyRegionalUplandHabitatAssemblage(regional)).toEqual(regional);

    const patch = createCoreEcologyAggregatePatch({
      seed: rootSeed,
      patchKey: `alpha30:regional:${regionX}:${regionY}`,
      originRegion,
      derivation: { kind: "habitat-v10", habitat: regional },
      populations: individualInputs(regional),
    });
    expect(patch.populations.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_POPULATIONS);
    expect(canonicalizeCoreEcologyAggregatePatch(patch)).toEqual(patch);
  });

  it("keeps the regional window deterministic under population order and the shared top-K cap", () => {
    const { regional, rootSeed, originRegion } = fixture(
      "alpha25 shared abstractions",
      -17,
      29,
    );
    const populations = individualInputs(regional);
    const groups = regionalGroups(regional, rootSeed);
    const createPatch = (inputs: readonly CoreEcologyPopulationInput[]) => (
      createCoreEcologyAggregatePatch({
        seed: rootSeed,
        patchKey: "alpha30:regional:materialization",
        originRegion,
        derivation: { kind: "habitat-v10", habitat: regional },
        populations: inputs,
        groups,
      })
    );
    const patch = createPatch(populations);
    const reordered = createPatch([...populations].reverse());
    const window = regionalWindow(regional);
    const selected = deriveCoreEcologyMaterializedActorIds(patch, window);

    expect(selected).not.toBeNull();
    expect(selected).toEqual(deriveCoreEcologyMaterializedActorIds(reordered, window));
    expect(selected?.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS).toBe(24);

    const full = setCoreEcologyMaterializationForWindow(patch, window, 1);
    if (full === null) throw new Error("Regional full-detail transition failed");
    const regionalSpecies = new Set(["wild-boar", "elk", "gray-wolf"]);
    const fullRegionalPopulations = full.populations.filter(({ species }) => (
      regionalSpecies.has(species)
    ));
    expect(fullRegionalPopulations).toHaveLength(3);
    expect(fullRegionalPopulations.every(({ members }) => (
      members.every(({ materialization }) => materialization === "materialized")
    ))).toBe(true);

    const harborWindow: CoreEcologyRuntimeWindow = Object.freeze({
      origin: Object.freeze({
        x: originRegion.x * WORLD_WIDTH,
        y: originRegion.y * WORLD_HEIGHT,
      }),
      terrain: Object.freeze({
        width: REGIONAL_TRAVEL_COLUMNS,
        height: REGIONAL_TRAVEL_ROWS,
      }),
    });
    const coarse = setCoreEcologyMaterializationForWindow(full, harborWindow, 2);
    if (coarse === null) throw new Error("Regional coarse transition failed");
    for (const fullPopulation of fullRegionalPopulations) {
      const coarsePopulation = coarse.populations.find(({ populationKey }) => (
        populationKey === fullPopulation.populationKey
      ));
      expect(coarsePopulation).toBeDefined();
      expect(coarsePopulation?.members.every(({ materialization }) => (
        materialization === "coarse"
      ))).toBe(true);
      expect(coarsePopulation?.members.map(({ actor }) => actor))
        .toEqual(fullPopulation.members.map(({ actor }) => actor));
    }
    expect(coarse.groups.groups.map(({ identity }) => identity))
      .toEqual(full.groups.groups.map(({ identity }) => identity));
  });

  it(`${ALPHA30_REGIONAL_UPLAND_STRESS_OWNER_INTENT} keeps one shared substrate coherent across signed seams and coordinate limits`, () => {
    const viableSpecies = new Set<string>();
    const selectedCandidateOrdinals = new Set<number>();
    const groupContract = Object.freeze({
      "wild-boar": Object.freeze({ organization: "sounder", namespace: "SOUNDER-v1-" }),
      elk: Object.freeze({ organization: "herd", namespace: "HERD-v1-" }),
      "gray-wolf": Object.freeze({ organization: "pack", namespace: "PACK-v1-" }),
    } as const);

    for (const sample of REGIONAL_UPLAND_STRESS_CASES) {
      const { domesticPen, regional, replay, rootSeed, originRegion } = stressFixture(
        sample.seed,
        sample.x,
        sample.y,
      );
      const source = regional.regionalHabitat;
      const extension = regional.populations.slice(
        CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length,
      );
      const groups = regionalGroups(regional, rootSeed);
      const populationInputs = individualInputs(regional);
      const patch = createCoreEcologyAggregatePatch({
        seed: rootSeed,
        patchKey: `alpha30:stress:${sample.x}:${sample.y}`,
        originRegion,
        derivation: { kind: "habitat-v10", habitat: regional },
        populations: populationInputs,
        groups,
      });
      const reordered = createCoreEcologyAggregatePatch({
        seed: rootSeed,
        patchKey: `alpha30:stress:${sample.x}:${sample.y}`,
        originRegion,
        derivation: { kind: "habitat-v10", habitat: regional },
        populations: [...populationInputs].reverse(),
        groups,
      });

      expect(regional, sample.label).toEqual(replay);
      expect(stableStringify(regional.populations.slice(
        0,
        CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length,
      )), sample.label).toBe(stableStringify(domesticPen.populations));
      expect(Math.abs(source.originRegion.x - originRegion.x)
        + Math.abs(source.originRegion.y - originRegion.y), sample.label)
        .toBe(CORE_ECOLOGY_REGIONAL_UPLAND_HARBOR_SEPARATION_REGIONS);
      expect(source.originRegion, sample.label).not.toEqual(originRegion);
      expect(Math.abs(source.originRegion.x), sample.label).toBeLessThanOrEqual(REGION_COORD_LIMIT);
      expect(Math.abs(source.originRegion.y), sample.label).toBeLessThanOrEqual(REGION_COORD_LIMIT);
      expect(source.sourceCandidateCount, sample.label).toBeGreaterThan(0);
      expect(source.sourceCandidateCount, sample.label)
        .toBeLessThanOrEqual(CORE_ECOLOGY_REGIONAL_UPLAND_SOURCE_CANDIDATE_BUDGET);
      selectedCandidateOrdinals.add(source.sourceCandidateOrdinal);

      const occupiedTiles = new Set<number>();
      for (const population of extension) {
        if (
          population.species !== "wild-boar"
          && population.species !== "elk"
          && population.species !== "gray-wolf"
        ) throw new Error(`${sample.label}: non-regional species escaped the v9 prefix`);
        const bounds = coreEcologyHabitatSpeciesBounds(population.species);
        if (bounds === null) throw new Error(`${sample.label}: missing species bounds`);
        expect(population.populationUnits, sample.label)
          .toBeLessThanOrEqual(bounds.maximumPopulation);
        expect(population.allocations.length, sample.label)
          .toBeLessThanOrEqual(bounds.maximumAllocations);
        expect(population.allocations.reduce(
          (sum, allocation) => sum + allocation.representedUnits,
          0,
        ), sample.label).toBe(population.populationUnits);
        expect(population.allocations.map(({ allocationOrdinal }) => allocationOrdinal), sample.label)
          .toEqual(population.allocations.map((_, ordinal) => ordinal));
        for (const allocation of population.allocations) {
          expect(allocation.position.region, sample.label).toEqual(source.originRegion);
          expect(occupiedTiles.has(allocation.tileIndex), sample.label).toBe(false);
          occupiedTiles.add(allocation.tileIndex);
        }
        if (population.populationUnits > 0) viableSpecies.add(population.species);

        const group = groups.groups.find(({ identity }) => (
          identity.species === population.species
          && identity.populationKey === population.populationKey
        ));
        if (population.allocations.length < 2) {
          expect(group, sample.label).toBeUndefined();
        } else {
          const contract = groupContract[population.species];
          expect(group, sample.label).toBeDefined();
          expect(group?.identity.organization, sample.label).toBe(contract.organization);
          expect(group?.identity.stableId.startsWith(contract.namespace), sample.label).toBe(true);
          expect(group?.memberOrdinals, sample.label)
            .toEqual(population.allocations.map(({ allocationOrdinal }) => allocationOrdinal));
          expect(group?.rendezvousAnchor, sample.label).toEqual(population.allocations[0]?.position);
        }
      }

      expect(patch, sample.label).toEqual(reordered);
      expect(patch.populations.length, sample.label)
        .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_POPULATIONS);
      expect(regional.populations.reduce(
        (sum, population) => sum + population.allocations.length,
        0,
      ), sample.label).toBeLessThanOrEqual(CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_MAX_ALLOCATIONS);
      expect(canonicalizeCoreEcologyAggregatePatch(patch), sample.label).toEqual(patch);

      const window = regionalWindow(regional);
      const selected = deriveCoreEcologyMaterializedActorIds(patch, window);
      expect(selected, sample.label).not.toBeNull();
      expect(selected?.length, sample.label)
        .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
      const full = setCoreEcologyMaterializationForWindow(patch, window, 1);
      if (full === null) throw new Error(`${sample.label}: full transition failed`);
      expect(full.populations.flatMap(({ members }) => members)
        .filter(({ materialization }) => materialization === "materialized").length, sample.label)
        .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
      const harborWindow = boundedWindowAtRegion(originRegion);
      const coarse = setCoreEcologyMaterializationForWindow(full, harborWindow, 2);
      if (coarse === null) throw new Error(`${sample.label}: coarse transition failed`);
      for (const population of extension) {
        if (population.populationUnits === 0) {
          expect(full.populations.some(({ populationKey }) => (
            populationKey === population.populationKey
          )), sample.label).toBe(false);
          expect(coarse.populations.some(({ populationKey }) => (
            populationKey === population.populationKey
          )), sample.label).toBe(false);
          continue;
        }
        const fullPopulation = full.populations.find(({ populationKey }) => (
          populationKey === population.populationKey
        ));
        const coarsePopulation = coarse.populations.find(({ populationKey }) => (
          populationKey === population.populationKey
        ));
        expect(coarsePopulation?.members.every(({ materialization }) => (
          materialization === "coarse"
        )), sample.label).toBe(true);
        expect(coarsePopulation?.members.map(({ actor }) => actor), sample.label)
          .toEqual(fullPopulation?.members.map(({ actor }) => actor));
      }
      expect(coarse.groups.groups.map(({ identity }) => identity), sample.label)
        .toEqual(full.groups.groups.map(({ identity }) => identity));
    }

    expect([...viableSpecies].sort()).toEqual(["elk", "gray-wolf", "wild-boar"]);
    expect(selectedCandidateOrdinals.size).toBeGreaterThan(1);
  }, 120_000);

  it("fails source-address and inherited-prefix tampering closed", () => {
    const { regional } = fixture("alpha30 regional tamper", -17, 29);
    expect(canonicalizeCoreEcologyRegionalUplandHabitatAssemblage({
      ...regional,
      regionalHabitat: {
        ...regional.regionalHabitat,
        originRegion: regional.originRegion,
      },
    })).toBeNull();
    expect(canonicalizeCoreEcologyRegionalUplandHabitatAssemblage({
      ...regional,
      populations: [
        { ...regional.populations[0], populationKey: "altered-v9-prefix" },
        ...regional.populations.slice(1),
      ],
    })).toBeNull();
  });
});
