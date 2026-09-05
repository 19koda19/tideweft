import { describe, expect, it } from "vitest";

import { seedFromText, type RootSeed } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES,
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION,
  canonicalizeCoreEcologyMarshEdgeHabitatAssemblage,
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
  type CoreEcologyMarshEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha sixteen marsh edge pursuit");
const ORIGIN = createRegionCoord(0, 0);

function focusAt(region: RegionCoord) {
  return createWorldPosition(
    region,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function deriveFocused(
  seed: RootSeed = SEED,
  region: RegionCoord = ORIGIN,
  radiusTiles = 32,
): CoreEcologyMarshEdgeHabitatAssemblage {
  return deriveCoreEcologyMarshEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion: region,
    focus: {
      position: focusAt(region),
      radiusTiles,
    },
  });
}

function individualInputs(
  habitat: CoreEcologyMarshEdgeHabitatAssemblage,
  extensionOnly = false,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => {
    if (
      population.representation !== "individual-representatives"
      || population.populationUnits === 0
      || extensionOnly && (
        population.species === "deer"
        || population.species === "gull"
        || population.species === "black-bear"
      )
    ) return [];
    return [{
      species: population.species,
      populationKey: population.populationKey,
      populationSize: population.populationUnits,
      members: population.allocations.map((allocation) => ({
        populationOrdinal: allocation.allocationOrdinal,
        representedUnits: allocation.representedUnits,
        position: allocation.position,
        materialization: "coarse" as const,
      })),
    }];
  });
}

describe("marsh-edge habitat v3", () => {
  it("appends bounded rabbit and fox analyses without changing the v2 prefix", () => {
    const input = {
      rootSeed: SEED,
      originRegion: ORIGIN,
      focus: { position: focusAt(ORIGIN), radiusTiles: 32 },
    } as const;
    const harborEdge = deriveCoreEcologyHarborEdgeHabitatAssemblage(input);
    const marshEdge = deriveCoreEcologyMarshEdgeHabitatAssemblage(input);

    expect(marshEdge.generationVersion).toBe(CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION);
    expect(marshEdge.populations.map(({ species }) => species)).toEqual(
      CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES,
    );
    expect(marshEdge.populations.slice(0, harborEdge.populations.length))
      .toEqual(harborEdge.populations);
    expect(marshEdge.maximumAllocationBudget)
      .toBe(CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS);
    expect(marshEdge.populations.reduce(
      (total, population) => total + population.allocations.length,
      0,
    )).toBeLessThanOrEqual(CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS);
    expect(marshEdge.populations.reduce(
      (total, population) => total + (
        population.representation === "individual-representatives"
          ? population.allocations.length
          : 0
      ),
      0,
    )).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);

    const rabbit = marshEdge.populations[5];
    const fox = marshEdge.populations[6];
    expect(rabbit).toMatchObject({
      species: "marsh-rabbit",
      representation: "individual-representatives",
    });
    expect(fox).toMatchObject({
      species: "marsh-fox",
      representation: "individual-representatives",
    });
    expect(rabbit?.habitatCapacity).toBeLessThanOrEqual(24);
    expect(rabbit?.allocations.length).toBeLessThanOrEqual(3);
    expect(fox?.habitatCapacity).toBeLessThanOrEqual(3);
    expect(fox?.allocations.length).toBeLessThanOrEqual(2);
    expect(rabbit?.allocations.every(({ terrain }) =>
      terrain === "marsh" || terrain === "meadow"
    )).toBe(true);
    expect(fox?.allocations.every(({ terrain }) =>
      terrain === "marsh" || terrain === "meadow" || terrain === "ridge"
    )).toBe(true);
    if ((fox?.populationUnits ?? 0) > 0) {
      const rats = marshEdge.populations[3];
      expect((rabbit?.populationUnits ?? 0) + (rats?.populationUnits ?? 0)).toBeGreaterThan(0);
      expect(fox?.capacityInputs.food).toBeGreaterThanOrEqual(120_000);
      expect(fox?.capacityInputs.cover).toBeGreaterThanOrEqual(260_000);
    }
    expect(canonicalizeCoreEcologyMarshEdgeHabitatAssemblage(marshEdge))
      .toEqual(marshEdge);
    expect(canonicalizeCoreEcologyMarshEdgeHabitatAssemblage(harborEdge)).toBeNull();
  });

  it("preserves honest absence in a tiny local selection", () => {
    const habitat = deriveFocused(seedFromText("quiet marsh edge"), createRegionCoord(-81, 47), 1);
    const rabbit = habitat.populations.find(({ species }) => species === "marsh-rabbit");
    const fox = habitat.populations.find(({ species }) => species === "marsh-fox");

    expect(rabbit).toMatchObject({ populationUnits: 0, allocations: [] });
    expect(fox).toMatchObject({ populationUnits: 0, allocations: [] });
    expect(canonicalizeCoreEcologyMarshEdgeHabitatAssemblage(habitat)).toEqual(habitat);
  });

  it("is deterministic at signed coordinate extremes and rejects reordered records", () => {
    for (const [ordinal, region] of [
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    ].entries()) {
      const habitat = deriveFocused(SEED, region, 12);
      expect(deriveFocused(SEED, region, 12)).toEqual(habitat);
      expect(canonicalizeCoreEcologyMarshEdgeHabitatAssemblage(habitat)).toEqual(habitat);
      expect(canonicalizeCoreEcologyMarshEdgeHabitatAssemblage({
        ...habitat,
        populations: [...habitat.populations].reverse(),
      })).toBeNull();
      const patch = createCoreEcologyAggregatePatch({
        seed: SEED,
        patchKey: `marsh-edge:coordinate-${ordinal}`,
        originRegion: region,
        tick: 17,
        populations: individualInputs(habitat),
        derivation: { kind: "habitat-v3", habitat },
      });
      const text = serializeCoreEcologyAggregatePatch(patch);
      const roundTrip = deserializeCoreEcologyAggregatePatch(text);
      expect(roundTrip).toEqual(patch);
      expect(roundTrip === null ? null : serializeCoreEcologyAggregatePatch(roundTrip)).toBe(text);
    }
  });

  it("stays bounded and admits absence across varied seeds and local windows", () => {
    let absentRabbit = false;
    let absentFox = false;
    for (let ordinal = 0; ordinal < 24; ordinal += 1) {
      const region = createRegionCoord(ordinal * 17 - 190, 130 - ordinal * 11);
      const radiusTiles = [1, 2, 4, 8, 16, 32][ordinal % 6] ?? 1;
      const habitat = deriveFocused(
        seedFromText(`marsh-edge-property-${ordinal}`),
        region,
        radiusTiles,
      );
      const rabbit = habitat.populations[5];
      const fox = habitat.populations[6];
      absentRabbit ||= rabbit?.populationUnits === 0;
      absentFox ||= fox?.populationUnits === 0;
      expect(rabbit?.populationUnits).toBeLessThanOrEqual(24);
      expect(rabbit?.allocations.length).toBeLessThanOrEqual(3);
      expect(fox?.populationUnits).toBeLessThanOrEqual(3);
      expect(fox?.allocations.length).toBeLessThanOrEqual(2);
      expect(canonicalizeCoreEcologyMarshEdgeHabitatAssemblage(habitat)).toEqual(habitat);
    }
    expect(absentRabbit).toBe(true);
    expect(absentFox).toBe(true);
  });
});

describe("marsh-edge aggregate ecology derivations", () => {
  it("accepts current and legacy-preserving v3 derivations without changing patch schema", () => {
    const habitat = deriveFocused();
    const current = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "marsh-edge:current",
      originRegion: ORIGIN,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v3", habitat },
    });
    const legacy = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "marsh-edge:legacy",
      originRegion: ORIGIN,
      populations: [
        ...individualInputs(habitat, true),
        {
          species: "deer",
          populationKey: "legacy-fixed/deer",
          populationSize: 1,
          members: [{
            populationOrdinal: 41,
            representedUnits: 1,
            position: createWorldPosition(ORIGIN, 10_000, 10_000),
            materialization: "coarse",
          }],
        },
      ],
      derivation: { kind: "legacy-fixed-v1-with-habitat-v3", habitat },
    });

    expect(current.version).toBe(CORE_ECOLOGY_AGGREGATE_PATCH_VERSION);
    expect(current.derivation.kind).toBe("habitat-v3");
    expect(current.populations.some(({ species }) => species === "marsh-rabbit")).toBe(true);
    expect(current.populations.some(({ species }) => species === "marsh-fox")).toBe(true);
    expect(current.aggregatePopulations.every(({ species }) => species === "brown-rat"))
      .toBe(true);
    expect(deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(current)))
      .toEqual(current);
    expect(legacy.version).toBe(CORE_ECOLOGY_AGGREGATE_PATCH_VERSION);
    expect(legacy.derivation.kind).toBe("legacy-fixed-v1-with-habitat-v3");
    expect(legacy.populations.find(({ species }) => species === "deer")).toMatchObject({
      populationKey: "legacy-fixed/deer",
      populationSize: 1,
    });
    expect(canonicalizeCoreEcologyAggregatePatch(legacy)).toEqual(legacy);
  });

  it("rejects missing or extra v3 populations while retaining v2 derivation support", () => {
    const habitat = deriveFocused();
    const populations = individualInputs(habitat);
    const patch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "marsh-edge:strict",
      originRegion: ORIGIN,
      populations,
      derivation: { kind: "habitat-v3", habitat },
    });
    const extension = patch.populations.find(({ species }) => species === "marsh-rabbit")
      ?? patch.populations.find(({ species }) => species === "marsh-fox");
    if (extension === undefined) throw new Error("Fixture requires one marsh-edge population");

    expect(canonicalizeCoreEcologyAggregatePatch({
      ...patch,
      populations: patch.populations.filter(({ species }) => species !== extension.species),
    })).toBeNull();

    const harbor = deriveCoreEcologyHarborEdgeHabitatAssemblage({
      rootSeed: SEED,
      originRegion: ORIGIN,
      focus: { position: focusAt(ORIGIN), radiusTiles: 32 },
    });
    const harborInputs: readonly CoreEcologyPopulationInput[] = harbor.populations.flatMap(
      (population) => population.representation === "individual-representatives"
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
        : [],
    );
    expect(() => createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "harbor-edge:still-supported",
      originRegion: ORIGIN,
      populations: harborInputs,
      derivation: { kind: "habitat-v2", habitat: harbor },
    })).not.toThrow();
  });
});
