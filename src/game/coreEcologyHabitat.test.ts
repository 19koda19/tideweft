import { describe, expect, it } from "vitest";

import { getCoreWildlifeProfile, type CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createWorld } from "../sim/engine";
import { seedFromText } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  regionLocalToGlobalTile,
  type RegionCoord,
} from "../sim/regions";
import { generateRegionTerrain } from "../sim/regionTerrain";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type TerrainState } from "../sim/types";
import { stableStringify } from "../sim/util";
import { createWorldView } from "../sim/view";
import {
  CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_HABITAT_MAX_EXCLUDED_TILES,
  CORE_ECOLOGY_HABITAT_MAX_FOCUS_RADIUS_TILES,
  CORE_ECOLOGY_HABITAT_MINIMUM_PERSISTENT_CAPACITY,
  CORE_ECOLOGY_HABITAT_MINIMUM_SITE_SCORE,
  CORE_ECOLOGY_HABITAT_SPECIES_EVALUATION_BUDGET,
  CORE_ECOLOGY_HABITAT_TILE_BUDGET,
  canonicalizeCoreEcologyHabitatAssemblage,
  deriveCoreEcologyHabitatAssemblage,
  type CoreEcologyHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";
import { livingActorAddressForResident } from "./livingActor";

const ACTIVE_FRAME_MATERIALIZATION_LIMIT = 24;
const ORIGIN = createRegionCoord(0, 0);

function focusAt(
  region: RegionCoord,
  tileX = Math.trunc(WORLD_WIDTH / 2),
  tileY = Math.trunc(WORLD_HEIGHT / 2),
) {
  return createWorldPosition(
    region,
    tileX * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    tileY * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function allocationCount(assemblage: CoreEcologyHabitatAssemblage): number {
  return assemblage.populations.reduce(
    (total, population) => total + population.allocations.length,
    0,
  );
}

function assertPopulationAndAllocationCoherence(
  assemblage: CoreEcologyHabitatAssemblage,
  terrain: TerrainState,
): void {
  const occupied = new Set<number>();
  expect(assemblage.evaluatedTiles).toBeGreaterThan(0);
  expect(assemblage.evaluatedTiles).toBeLessThanOrEqual(CORE_ECOLOGY_HABITAT_TILE_BUDGET);
  expect(assemblage.speciesEvaluations).toBe(
    assemblage.evaluatedTiles * assemblage.populations.length,
  );
  expect(assemblage.speciesEvaluations)
    .toBeLessThanOrEqual(CORE_ECOLOGY_HABITAT_SPECIES_EVALUATION_BUDGET);
  expect(assemblage.maximumAllocationBudget).toBe(CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS);
  expect(allocationCount(assemblage)).toBeLessThanOrEqual(CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS);
  expect(allocationCount(assemblage)).toBeLessThanOrEqual(ACTIVE_FRAME_MATERIALIZATION_LIMIT);

  for (const population of assemblage.populations) {
    const inputs = population.capacityInputs;
    expect(inputs.eligibleTiles).toBeGreaterThanOrEqual(inputs.suitableTiles);
    expect(inputs.eligibleTiles).toBeLessThanOrEqual(assemblage.evaluatedTiles);
    expect(inputs.weightedHabitatArea).toBeLessThanOrEqual(inputs.suitableTiles * FIXED_POINT);
    for (const score of [
      inputs.food,
      inputs.water,
      inputs.cover,
      inputs.nesting,
      inputs.climate,
      inputs.predatorPressure,
    ]) {
      expect(Number.isSafeInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(FIXED_POINT);
    }
    expect(population.habitatCapacity).toBeLessThanOrEqual(
      getCoreWildlifeProfile(population.species).maximumPatchPopulation,
    );
    expect(population.populationUnits).toBeLessThanOrEqual(population.habitatCapacity);
    expect(population.populationPressure).toBe(
      population.habitatCapacity === 0
        ? 0
        : Math.trunc((population.populationUnits * FIXED_POINT) / population.habitatCapacity),
    );
    expect(
      population.populationUnits === 0
        ? population.allocations.length
        : population.allocations.length > 0,
    ).toBe(population.populationUnits === 0 ? 0 : true);
    expect(population.allocations.reduce(
      (total, allocation) => total + allocation.representedUnits,
      0,
    )).toBe(population.populationUnits);

    for (const [ordinal, allocation] of population.allocations.entries()) {
      expect(allocation.allocationOrdinal).toBe(ordinal);
      expect(allocation.habitatScore).toBeGreaterThanOrEqual(
        CORE_ECOLOGY_HABITAT_MINIMUM_SITE_SCORE[population.species],
      );
      expect(allocation.localUnitX).toBeGreaterThanOrEqual(0);
      expect(allocation.localUnitX).toBeLessThan(REGION_WIDTH_UNITS);
      expect(allocation.localUnitY).toBeGreaterThanOrEqual(0);
      expect(allocation.localUnitY).toBeLessThan(REGION_HEIGHT_UNITS);
      expect(allocation.localUnitX % WORLD_POSITION_UNITS_PER_TILE).toBe(500);
      expect(allocation.localUnitY % WORLD_POSITION_UNITS_PER_TILE).toBe(500);
      const tileX = Math.trunc(allocation.localUnitX / WORLD_POSITION_UNITS_PER_TILE);
      const tileY = Math.trunc(allocation.localUnitY / WORLD_POSITION_UNITS_PER_TILE);
      expect(allocation.tileIndex).toBe(tileY * WORLD_WIDTH + tileX);
      const tile = terrain.tiles[allocation.tileIndex];
      expect(tile).toBeDefined();
      expect(allocation.terrain).toBe(tile?.terrain);
      expect(allocation.position).toEqual(createWorldPosition(
        assemblage.originRegion,
        allocation.localUnitX,
        allocation.localUnitY,
      ));
      expect(allocation.globalTile).toEqual(
        regionLocalToGlobalTile(assemblage.originRegion, tileX, tileY),
      );
      if (population.species === "gull") {
        expect(allocation.terrain).not.toBe("deep-water");
        expect(nearestOpenWaterDistance(terrain, tileX, tileY)).toBeLessThanOrEqual(7);
      } else {
        expect(["marsh", "meadow", "ridge"]).toContain(allocation.terrain);
      }
      expect(occupied.has(allocation.tileIndex)).toBe(false);
      occupied.add(allocation.tileIndex);
    }
  }
}

function nearestOpenWaterDistance(terrain: TerrainState, x: number, y: number): number {
  let nearest = WORLD_WIDTH + WORLD_HEIGHT;
  for (const tile of terrain.tiles) {
    if (tile.terrain !== "deep-water" && tile.terrain !== "tidal-flat") continue;
    nearest = Math.min(nearest, Math.abs(tile.x - x) + Math.abs(tile.y - y));
  }
  return nearest;
}

function presentSpecies(assemblage: CoreEcologyHabitatAssemblage): readonly CoreWildlifeSpecies[] {
  return assemblage.populations
    .filter((population) => population.populationUnits > 0)
    .map((population) => population.species);
}

function startingPorter(seedText: string) {
  const world = createWorld(seedText, "wild");
  const economy = createWorldView(world);
  const startingSettlementId = economy.contracts.find(({ status }) => status === "offered")
    ?.originSettlementId ?? economy.settlements[0]?.id;
  const seedResidents = startingSettlementId === undefined
    ? []
    : economy.residents.filter((resident) =>
      resident.location.kind === "settlement"
      && resident.location.settlementId === startingSettlementId);
  const residents = [...(seedResidents.length > 0 ? seedResidents : economy.residents)]
    .sort((left, right) => left.identity.stableId.localeCompare(right.identity.stableId) || left.id - right.id);
  for (const resident of residents) {
    const address = livingActorAddressForResident(economy, resident);
    if (address?.species === "human") {
      return {
        rootSeed: world.meta.rootSeed,
        position: address.position,
        excludedTileIndices: economy.settlements.map((settlement) => settlement.tileIndex),
      };
    }
  }
  throw new Error("calibration world has no starting porter");
}

describe("core ecology habitat-derived assemblage", () => {
  it("is repeatable across call order and accepts only the matching canonical terrain", () => {
    const seed = seedFromText("habitat generation has no cursor");
    const region = createRegionCoord(-17, 29);
    const terrain = generateRegionTerrain(seed, region);
    const input = {
      rootSeed: seed,
      originRegion: region,
      terrain,
      focus: {
        position: focusAt(region),
        radiusTiles: 27,
        excludedTileIndices: [3_500, 7, 3_500, 91],
      },
    } as const;
    const first = deriveCoreEcologyHabitatAssemblage(input);
    deriveCoreEcologyHabitatAssemblage({
      rootSeed: seedFromText("unrelated region between calls"),
      originRegion: createRegionCoord(400, -800),
    });
    const replay = deriveCoreEcologyHabitatAssemblage({
      ...input,
      focus: {
        ...input.focus,
        excludedTileIndices: [91, 3_500, 7],
      },
    });
    const internallyGenerated = deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      focus: input.focus,
    });

    expect(replay).toEqual(first);
    expect(internallyGenerated).toEqual(first);
    expect(replay).not.toBe(first);
    expect(first.selection.excludedTileIndices).toEqual([7, 91, 3_500]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.populations)).toBe(true);

    expect(() => deriveCoreEcologyHabitatAssemblage({
      rootSeed: seedFromText("wrong root for supplied terrain"),
      originRegion: region,
      terrain,
    })).toThrow(RangeError);
    const reordered = structuredClone(terrain);
    reordered.tiles.reverse();
    expect(() => deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      terrain: reordered,
    })).toThrow(RangeError);
  });

  it("derives bounded population pressure, trend, and habitat-valid representative allocations", () => {
    const seed = seedFromText("wildlife alarm crossing habitat");
    const region = ORIGIN;
    const terrain = generateRegionTerrain(seed, region);
    const assemblage = deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      terrain,
      focus: {
        position: focusAt(region),
        radiusTiles: CORE_ECOLOGY_HABITAT_MAX_FOCUS_RADIUS_TILES,
        excludedTileIndices: [Math.trunc(WORLD_HEIGHT / 2) * WORLD_WIDTH + Math.trunc(WORLD_WIDTH / 2)],
      },
    });

    expect(assemblage.populations.map((population) => population.species)).toEqual([
      "deer",
      "gull",
      "black-bear",
    ]);
    expect(new Set(assemblage.populations.map((population) => population.capacityInputs.food)).size)
      .toBeGreaterThan(1);
    assertPopulationAndAllocationCoherence(assemblage, terrain);
  });

  it("keeps focused selection habitat-driven, inside radius, and off excluded settlement tiles", () => {
    const seed = seedFromText("a settlement edge is not an animal anchor");
    const region = createRegionCoord(-4, 6);
    const terrain = generateRegionTerrain(seed, region);
    const position = focusAt(region, 44, 31);
    const baseline = deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      terrain,
      focus: { position, radiusTiles: 30 },
    });
    const initiallyAllocated = baseline.populations.flatMap((population) =>
      population.allocations.map((allocation) => allocation.tileIndex));
    const exclusions = initiallyAllocated.slice(0, CORE_ECOLOGY_HABITAT_MAX_EXCLUDED_TILES);
    const excluded = deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      terrain,
      focus: { position, radiusTiles: 30, excludedTileIndices: exclusions },
    });
    const focusX = Math.trunc(position.localX / WORLD_POSITION_UNITS_PER_TILE);
    const focusY = Math.trunc(position.localY / WORLD_POSITION_UNITS_PER_TILE);

    expect(exclusions.length).toBeGreaterThan(0);
    for (const allocation of excluded.populations.flatMap((population) => population.allocations)) {
      const tileX = allocation.tileIndex % WORLD_WIDTH;
      const tileY = Math.trunc(allocation.tileIndex / WORLD_WIDTH);
      expect(Math.abs(tileX - focusX) + Math.abs(tileY - focusY)).toBeLessThanOrEqual(30);
      expect(exclusions).not.toContain(allocation.tileIndex);
      expect(allocation.habitatScore).toBeGreaterThanOrEqual(
        CORE_ECOLOGY_HABITAT_MINIMUM_SITE_SCORE[
          excluded.populations.find((population) =>
            population.allocations.includes(allocation))?.species ?? "deer"
        ],
      );
    }
    assertPopulationAndAllocationCoherence(excluded, terrain);
  });

  it("represents quiet habitat as ecological absence instead of rerolling or forcing a roster", () => {
    const candidates = [
      ["quiet delta one", createRegionCoord(0, 0)],
      ["quiet delta two", createRegionCoord(-91, 37)],
      ["quiet delta three", createRegionCoord(8_100, -4_200)],
      ["quiet delta four", createRegionCoord(-700_000, 900_000)],
    ] as const;
    const results = candidates.map(([seedText, originRegion]) =>
      deriveCoreEcologyHabitatAssemblage({
        rootSeed: seedFromText(seedText),
        originRegion,
        focus: {
          position: focusAt(originRegion),
          radiusTiles: 8,
        },
      }));
    const absent = results.flatMap((result) => result.populations).find((population) =>
      population.populationUnits === 0
      && population.habitatCapacity
        < CORE_ECOLOGY_HABITAT_MINIMUM_PERSISTENT_CAPACITY[population.species]);

    expect(absent).toBeDefined();
    expect(absent?.allocations).toEqual([]);
    for (const result of results) {
      expect(canonicalizeCoreEcologyHabitatAssemblage(result)).toEqual(result);
    }
  });

  it("keeps global biome addresses exact at both signed representation extremes", () => {
    const seed = seedFromText("habitat at safe-integer shores");
    for (const region of [
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    ]) {
      const terrain = generateRegionTerrain(seed, region);
      const assemblage = deriveCoreEcologyHabitatAssemblage({
        rootSeed: seed,
        originRegion: region,
        terrain,
      });
      assertPopulationAndAllocationCoherence(assemblage, terrain);
      expect(canonicalizeCoreEcologyHabitatAssemblage(assemblage)).toEqual(assemblage);
      for (const allocation of assemblage.populations.flatMap((population) =>
        population.allocations)) {
        expect(Number.isSafeInteger(allocation.globalTile.x)).toBe(true);
        expect(Number.isSafeInteger(allocation.globalTile.y)).toBe(true);
        expect(Object.is(allocation.globalTile.x, -0)).toBe(false);
        expect(Object.is(allocation.globalTile.y, -0)).toBe(false);
      }
    }
  });

  it("canonicalizes strict embedded records without deriving and rejects incoherent fields", () => {
    const seed = seedFromText("strict habitat save record");
    const region = createRegionCoord(-12, -8);
    const assemblage = deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      focus: { position: focusAt(region), radiusTiles: 28 },
    });
    const canonical = canonicalizeCoreEcologyHabitatAssemblage(assemblage);
    expect(canonical).toEqual(assemblage);
    expect(canonical).not.toBe(assemblage);
    expect(stableStringify(canonical)).toBe(stableStringify(assemblage));

    const pressure = structuredClone(assemblage);
    const pressurePopulation = pressure.populations[0] as unknown as { populationPressure: number };
    pressurePopulation.populationPressure = Math.min(
      FIXED_POINT,
      pressurePopulation.populationPressure + 1,
    );
    expect(canonicalizeCoreEcologyHabitatAssemblage(pressure)).toBeNull();

    const reordered = structuredClone(assemblage);
    (reordered.populations as CoreEcologyHabitatAssemblage["populations"] & unknown[]).reverse();
    expect(canonicalizeCoreEcologyHabitatAssemblage(reordered)).toBeNull();

    const allocation = structuredClone(assemblage);
    const firstAllocation = allocation.populations.flatMap((population) =>
      population.allocations)[0];
    if (firstAllocation === undefined) throw new Error("strict-record fixture has no allocation");
    (firstAllocation as unknown as { localUnitX: number }).localUnitX += 1;
    expect(canonicalizeCoreEcologyHabitatAssemblage(allocation)).toBeNull();

    const oversizedFocus = structuredClone(assemblage);
    (oversizedFocus.selection as unknown as { radiusTiles: number }).radiusTiles =
      CORE_ECOLOGY_HABITAT_MAX_FOCUS_RADIUS_TILES + 1;
    expect(canonicalizeCoreEcologyHabitatAssemblage(oversizedFocus)).toBeNull();
  });

  it("rejects malformed or unbounded focus contracts", () => {
    const seed = seedFromText("focus contracts are bounded");
    const region = createRegionCoord(3, -7);
    expect(() => deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      focus: {
        position: focusAt(createRegionCoord(4, -7)),
        radiusTiles: 12,
      },
    })).toThrow(RangeError);
    expect(() => deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      focus: {
        position: focusAt(region),
        radiusTiles: CORE_ECOLOGY_HABITAT_MAX_FOCUS_RADIUS_TILES + 1,
      },
    })).toThrow(RangeError);
    expect(() => deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: region,
      focus: {
        position: focusAt(region),
        radiusTiles: 12,
        excludedTileIndices: Array.from(
          { length: CORE_ECOLOGY_HABITAT_MAX_EXCLUDED_TILES + 1 },
          (_, index) => index,
        ),
      },
    })).toThrow(RangeError);
  });

  it("keeps the shipped quiet-delta and alarm-crossing fixtures playable near their porter", () => {
    for (const seedText of ["quiet-delta", "wildlife alarm crossing"]) {
      const porter = startingPorter(seedText);
      const assemblage = deriveCoreEcologyHabitatAssemblage({
        rootSeed: porter.rootSeed,
        originRegion: porter.position.region,
        focus: {
          position: porter.position,
          radiusTiles: CORE_ECOLOGY_HABITAT_MAX_FOCUS_RADIUS_TILES,
          excludedTileIndices: porter.excludedTileIndices,
        },
      });
      const focusX = Math.trunc(porter.position.localX / WORLD_POSITION_UNITS_PER_TILE);
      const focusY = Math.trunc(porter.position.localY / WORLD_POSITION_UNITS_PER_TILE);
      const nearestAllocation = Math.min(...assemblage.populations.flatMap((population) =>
        population.allocations.map((allocation) => {
          const x = allocation.tileIndex % WORLD_WIDTH;
          const y = Math.trunc(allocation.tileIndex / WORLD_WIDTH);
          return Math.abs(x - focusX) + Math.abs(y - focusY);
        })));
      expect(presentSpecies(assemblage), seedText).toEqual(["deer", "gull", "black-bear"]);
      expect(nearestAllocation, seedText).toBeLessThanOrEqual(10);
      expect(assemblage.populations.flatMap((population) => population.allocations)
        .some((allocation) => porter.excludedTileIndices.includes(allocation.tileIndex))).toBe(false);
    }
  });
});
