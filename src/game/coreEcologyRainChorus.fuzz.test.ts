import { describe, expect, it } from "vitest";

import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  regionLocalToGlobalTile,
  type RegionCoord,
} from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS,
  CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES_EVALUATION_BUDGET,
  canonicalizeCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  deriveCoreEcologyMaterializedActorIds,
  selectedCoreEcologyActor,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import { livingSpeciesActorIdMatchesNamespace } from "./livingSpeciesRegistry";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

export const OWNER_INTENT = "test:core-ecology-rain-chorus-fuzz:v1" as const;

const COORDINATES = Object.freeze([
  createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
  createRegionCoord(-9_000_001, 7_000_003),
  createRegionCoord(-83_117, -72_019),
  createRegionCoord(-1, 1),
  createRegionCoord(0, 0),
  createRegionCoord(1, -1),
  createRegionCoord(8_000_009, -6_000_011),
  createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
]);

describe("Rain Chorus hostile and signed-world fuzz", () => {
  it("keeps generated actors and population areas deterministic, bounded, and conserved", () => {
    let crowCases = 0;
    let harrierCases = 0;
    let frogCases = 0;
    const habitatSignatures = new Set<string>();
    const frogSignatures = new Set<string>();

    // This samples hostile coordinate classes and seed variation. It is
    // intentionally not an animal-by-animal interaction matrix: shared
    // invariants are proven once at the representation boundary.
    for (let index = 0; index < 24; index += 1) {
      const seed = seedFromText(`rain-chorus-fuzz:${index}`);
      const originRegion = COORDINATES[index % COORDINATES.length]!;
      const leftHabitat = deriveFocused(seed, originRegion);
      const rightHabitat = deriveFocused(seed, originRegion);
      const marshEdge = deriveCoreEcologyMarshEdgeHabitatAssemblage({
        rootSeed: seed,
        originRegion,
        focus: { position: focusAt(originRegion), radiusTiles: 32 },
      });
      expect(leftHabitat).toEqual(rightHabitat);
      expect(stableStringify(leftHabitat.populations.slice(
        0,
        CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length,
      ))).toBe(stableStringify(marshEdge.populations));
      expect(canonicalizeCoreEcologyRainChorusHabitatAssemblage(leftHabitat))
        .toEqual(leftHabitat);
      expect(leftHabitat.speciesEvaluations)
        .toBeLessThanOrEqual(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES_EVALUATION_BUDGET);
      expect(leftHabitat.populations.reduce(
        (sum, population) => sum + population.allocations.length,
        0,
      )).toBeLessThanOrEqual(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS);

      const create = () => createCoreEcologyAggregatePatch({
        seed,
        patchKey: `rain-chorus:fuzz:${index}`,
        originRegion,
        populations: individualInputs(leftHabitat),
        derivation: { kind: "habitat-v4" as const, habitat: leftHabitat },
      });
      const left = create();
      const right = create();
      expect(left).toEqual(right);
      expect(canonicalizeCoreEcologyAggregatePatch(left)).toEqual(left);
      const encoded = serializeCoreEcologyAggregatePatch(left);
      expect(deserializeCoreEcologyAggregatePatch(encoded)).toEqual(left);

      const members = left.populations.flatMap(({ members }) => members);
      const actorIds = members.map(({ actor }) => actor.identity.stableId);
      expect(new Set(actorIds).size).toBe(actorIds.length);
      expect(members.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
      expect(members.every(({ actor }) => (
        actor.identity.species !== "southern-leopard-frog"
        && livingSpeciesActorIdMatchesNamespace(
          actor.identity.stableId,
          actor.identity.species,
        )
      ))).toBe(true);
      expect(left.populations.some(({ species }) => species === "southern-leopard-frog"))
        .toBe(false);
      expect(left.aggregatePopulations.length)
        .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS);

      for (const aggregate of left.aggregatePopulations) {
        expect(aggregate.anchors.length).toBeLessThanOrEqual(
          CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS,
        );
        expect(aggregate.evidence.length).toBeLessThanOrEqual(
          CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
        );
        expect(aggregate.disturbances.length).toBeLessThanOrEqual(
          CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
        );
        expect(aggregate.anchors.reduce(
          (sum, anchor) => sum + anchor.populationUnits,
          0,
        )).toBe(aggregate.populationSize);
        expect(actorIds).not.toContain(aggregate.aggregateId);
      }

      const crows = left.populations.find(({ species }) => species === "fish-crow");
      const harriers = left.populations.find(({ species }) => species === "northern-harrier");
      const frogs = left.aggregatePopulations.find(
        ({ species }) => species === "southern-leopard-frog",
      );
      if (crows !== undefined) {
        crowCases += 1;
        expect(crows.members.length).toBeLessThanOrEqual(3);
      }
      if (harriers !== undefined) {
        harrierCases += 1;
        expect(harriers.members.length).toBeLessThanOrEqual(1);
      }
      if (frogs !== undefined) {
        frogCases += 1;
        expect(frogs.aggregateId).toMatch(/^FROG-AREA-v1-/u);
        expect(frogs.anchors.length).toBeLessThanOrEqual(3);
        frogSignatures.add(JSON.stringify({
          anchors: frogs.anchors.length,
          evidence: frogs.evidence.map(({ kind }) => kind),
          populationSize: frogs.populationSize,
        }));
      }
      habitatSignatures.add(leftHabitat.terrainHash);

      // Exact extrema prove generator/save behavior. Runtime windows that
      // would extend beyond the legal coordinate bank correctly fail closed;
      // all ordinary signed and multi-million-region samples materialize.
      const window = runtimeWindow(originRegion);
      const materialized = setCoreEcologyMaterializationForWindow(left, window, 0);
      if (materialized === null) {
        expect(Math.abs(originRegion.x) === REGION_COORD_LIMIT
          || Math.abs(originRegion.y) === REGION_COORD_LIMIT).toBe(true);
      } else {
        const visibleIds = deriveCoreEcologyMaterializedActorIds(materialized, window);
        expect(visibleIds).not.toBeNull();
        expect(visibleIds?.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
        expect(new Set(visibleIds).size).toBe(visibleIds?.length);
      }
    }

    expect(crowCases).toBeGreaterThan(0);
    expect(harrierCases).toBeGreaterThan(0);
    expect(frogCases).toBeGreaterThan(0);
    expect(habitatSignatures.size).toBeGreaterThan(8);
    expect(frogSignatures.size).toBeGreaterThan(1);
  }, 25_000);

  it("rejects malformed, oversized, forged, and cross-representation input deterministically", () => {
    const seed = seedFromText("rain-chorus-hostile-inputs");
    const originRegion = createRegionCoord(-44_001, 72_003);
    const habitat = deriveFocused(seed, originRegion);
    const patch = createCoreEcologyAggregatePatch({
      seed,
      patchKey: "rain-chorus:hostile",
      originRegion,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v4", habitat },
    });

    expect(canonicalizeCoreEcologyRainChorusHabitatAssemblage({
      ...habitat,
      generationVersion: 999,
    })).toBeNull();
    expect(canonicalizeCoreEcologyRainChorusHabitatAssemblage({
      ...habitat,
      hiddenOverride: true,
    })).toBeNull();
    expect(canonicalizeCoreEcologyAggregatePatch({
      ...patch,
      updatedAtTick: -1,
    })).toBeNull();
    expect(canonicalizeCoreEcologyAggregatePatch({
      ...patch,
      extraPopulationTruth: [],
    })).toBeNull();

    const frogs = patch.aggregatePopulations.find(
      ({ species }) => species === "southern-leopard-frog",
    );
    if (frogs === undefined) throw new Error("Hostile fixture requires frog aggregate state");
    expect(canonicalizeCoreEcologyAggregatePatch({
      ...patch,
      aggregatePopulations: patch.aggregatePopulations.map((population) => (
        population.aggregateId === frogs.aggregateId
          ? { ...population, populationSize: population.populationSize + 1 }
          : population
      )),
    })).toBeNull();

    expect(deserializeCoreEcologyAggregatePatch("")).toBeNull();
    expect(deserializeCoreEcologyAggregatePatch("{not-json")).toBeNull();
    expect(deserializeCoreEcologyAggregatePatch(` ${serializeCoreEcologyAggregatePatch(patch)}`))
      .toBeNull();
    expect(deserializeCoreEcologyAggregatePatch(
      "x".repeat(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES + 1),
    )).toBeNull();

    expect(() => createCoreEcologyAggregatePatch({
      seed,
      patchKey: "rain-chorus:forged-frog-actor",
      originRegion,
      derivation: { kind: "bounded-input-v1" },
      populations: [{
        species: "southern-leopard-frog",
        populationKey: "forged-frog-actor",
        populationSize: 1,
        members: [{
          populationOrdinal: 0,
          representedUnits: 1,
          position: focusAt(originRegion),
          materialization: "coarse",
        }],
      }] as unknown as readonly CoreEcologyPopulationInput[],
    })).toThrow(/individual population input is malformed/u);

    expect(() => createCoreEcologyAggregatePatch({
      seed,
      patchKey: "rain-chorus:duplicate-ordinal",
      originRegion,
      derivation: { kind: "bounded-input-v1" },
      populations: [{
        species: "deer",
        populationKey: "duplicate-ordinal",
        populationSize: 2,
        members: [0, 0].map(() => ({
          populationOrdinal: 0,
          representedUnits: 1,
          position: focusAt(originRegion),
          materialization: "coarse" as const,
        })),
      }],
    })).toThrow(/ordinals must be unique/u);

    const window = runtimeWindow(originRegion);
    expect(setCoreEcologyMaterializationForWindow(patch, {
      ...window,
      terrain: { ...window.terrain, width: REGIONAL_TRAVEL_COLUMNS - 1 },
    }, 0)).toBeNull();
    expect(setCoreEcologyMaterializationForWindow(patch, window, Number.NaN)).toBeNull();

    const crow = patch.populations.find(({ species }) => species === "fish-crow")
      ?.members[0]?.actor;
    const harrier = patch.populations.find(({ species }) => species === "northern-harrier")
      ?.members[0]?.actor;
    if (crow === undefined || harrier === undefined) {
      throw new Error("Hostile fixture requires both individual aerial species");
    }
    expect(selectedCoreEcologyActor(patch, {
      species: "fish-crow",
      actorId: harrier.identity.stableId,
    })).toBeNull();
    expect(selectedCoreEcologyActor(patch, {
      species: "northern-harrier",
      actorId: crow.identity.stableId,
    })).toBeNull();
  }, 25_000);
});

function deriveFocused(
  rootSeed: RootSeed,
  originRegion: RegionCoord,
): CoreEcologyRainChorusHabitatAssemblage {
  return deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed,
    originRegion,
    focus: { position: focusAt(originRegion), radiusTiles: 32 },
  });
}

function focusAt(region: RegionCoord) {
  return createWorldPosition(
    region,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

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

function runtimeWindow(region: RegionCoord): CoreEcologyRuntimeWindow {
  const origin = regionLocalToGlobalTile(region, 0, 0);
  return Object.freeze({
    origin: Object.freeze({ x: origin.x, y: origin.y }),
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
}
