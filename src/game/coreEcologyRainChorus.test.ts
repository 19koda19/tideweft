import { describe, expect, it } from "vitest";

import { seedFromText, type RootSeed } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  serializeCoreEcologyAggregatePatch,
  stableCoreEcologyAggregatePopulationId,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS,
  coreEcologyAggregateLivingSourceKind,
  coreEcologyAggregateLivingSourceSpecies,
  resolveCoreEcologyAggregateLivingResponse,
  resolveCoreEcologyAggregateActivityIntensity,
  resolveCoreEcologyAggregateDisturbanceActivity,
} from "./coreEcologyAggregatePolicy";
import {
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION,
  canonicalizeCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyMarshEdgeHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";
import { LIVING_ACTOR_SPECIES } from "./livingSpeciesRegistry";

const SEED = seedFromText("alpha seventeen rain chorus shadow overhead");
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
): CoreEcologyRainChorusHabitatAssemblage {
  return deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: seed,
    originRegion: region,
    focus: { position: focusAt(region), radiusTiles },
  });
}

function individualInputs(
  habitat: CoreEcologyMarshEdgeHabitatAssemblage | CoreEcologyRainChorusHabitatAssemblage,
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

describe("rain-chorus habitat v4", () => {
  it("resolves aggregate pressure by shared roles and capabilities without a pair table", () => {
    expect(new Set(CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS).size)
      .toBe(CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS.length);
    expect(CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS).toContain("cat");
    expect(CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS).toContain("dog");
    expect(CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS).not.toContain("domestic-cat");
    expect(CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS).not.toContain("domestic-dog");
    expect(coreEcologyAggregateLivingSourceSpecies("cat")).toBe("domestic-cat");
    expect(coreEcologyAggregateLivingSourceSpecies("dog")).toBe("domestic-dog");
    expect(coreEcologyAggregateLivingSourceSpecies("domestic-cat")).toBeNull();
    expect(coreEcologyAggregateLivingSourceSpecies("domestic-dog")).toBeNull();
    expect(coreEcologyAggregateLivingSourceKind("domestic-cat")).toBe("cat");
    expect(coreEcologyAggregateLivingSourceKind("domestic-dog")).toBe("dog");
    expect(coreEcologyAggregateLivingSourceKind("marsh-fox")).toBe("marsh-fox");
    expect(coreEcologyAggregateLivingSourceKind("marsh-rabbit")).toBe("marsh-rabbit");
    expect(resolveCoreEcologyAggregateLivingResponse("brown-rat", "marsh-fox"))
      .toMatchObject({ sourceKind: "marsh-fox", causeKind: "predator-pressure" });
    expect(resolveCoreEcologyAggregateLivingResponse(
      "southern-leopard-frog",
      "marsh-fox",
    )).toMatchObject({ sourceKind: "marsh-fox", causeKind: "predator-pressure" });
    expect(resolveCoreEcologyAggregateLivingResponse("brown-rat", "marsh-rabbit"))
      .toBeNull();
    expect(resolveCoreEcologyAggregateLivingResponse(
      "southern-leopard-frog",
      "marsh-rabbit",
    )).toBeNull();

    // Property coverage over the roster: the role resolver is total,
    // deterministic, and never turns an aggregate source into a visual actor.
    for (const target of ["brown-rat", "southern-leopard-frog"] as const) {
      for (const source of LIVING_ACTOR_SPECIES) {
        const first = resolveCoreEcologyAggregateLivingResponse(target, source);
        expect(resolveCoreEcologyAggregateLivingResponse(target, source)).toEqual(first);
        if (source === "brown-rat" || source === "southern-leopard-frog") {
          expect(first).toBeNull();
        } else if (first !== null) {
          expect(first).toMatchObject({
            sourceSpecies: source,
            response: "pressure",
          });
        }
      }
    }
  });

  it("appends crow, harrier, and frog after the exact v3 prefix", () => {
    const input = {
      rootSeed: SEED,
      originRegion: ORIGIN,
      focus: { position: focusAt(ORIGIN), radiusTiles: 32 },
    } as const;
    const v3 = deriveCoreEcologyMarshEdgeHabitatAssemblage(input);
    const v4 = deriveCoreEcologyRainChorusHabitatAssemblage(input);

    expect(v4.generationVersion).toBe(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION);
    expect(v4.populations.map(({ species }) => species)).toEqual(
      CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES,
    );
    expect(stableStringify(v4.populations.slice(0, v3.populations.length)))
      .toBe(stableStringify(v3.populations));
    expect(v4.maximumAllocationBudget)
      .toBe(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS);
    expect(v4.populations.reduce(
      (sum, population) => sum + population.allocations.length,
      0,
    )).toBeLessThanOrEqual(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS);
    expect(v4.populations.reduce(
      (sum, population) => sum + (
        population.representation === "individual-representatives"
          ? population.allocations.length
          : 0
      ),
      0,
    )).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);

    const crow = v4.populations[7];
    const harrier = v4.populations[8];
    const frog = v4.populations[9];
    expect(crow).toMatchObject({
      species: "fish-crow",
      representation: "individual-representatives",
      activitySignal: { kind: "shared-alarm", activePeriod: "diurnal" },
    });
    expect(crow?.allocations.length).toBeLessThanOrEqual(3);
    expect(harrier).toMatchObject({
      species: "northern-harrier",
      representation: "individual-representatives",
      activitySignal: { kind: "quartering-search", activePeriod: "diurnal" },
    });
    expect(harrier?.allocations.length).toBeLessThanOrEqual(1);
    expect(frog).toMatchObject({
      species: "southern-leopard-frog",
      representation: "aggregate-area",
      activitySignal: { kind: "chorusing", activePeriod: "rain-responsive" },
    });
    expect(frog?.populationUnits).toBeGreaterThanOrEqual(64);
    expect(frog?.populationUnits).toBeLessThanOrEqual(72);
    expect(frog?.allocations.length).toBeLessThanOrEqual(3);
    expect(frog?.allocations.every(({ terrain }) => (
      terrain === "marsh" || terrain === "meadow"
    ))).toBe(true);
    expect(canonicalizeCoreEcologyRainChorusHabitatAssemblage(v4)).toEqual(v4);

    const v3Patch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "rain-chorus:rat-byte-prefix-v3",
      originRegion: ORIGIN,
      populations: individualInputs(v3),
      derivation: { kind: "habitat-v3", habitat: v3 },
    });
    const v4Patch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "rain-chorus:rat-byte-prefix-v4",
      originRegion: ORIGIN,
      populations: individualInputs(v4),
      derivation: { kind: "habitat-v4", habitat: v4 },
    });
    expect(stableStringify(v4Patch.aggregatePopulations.find(
      ({ species }) => species === "brown-rat",
    ))).toBe(stableStringify(v3Patch.aggregatePopulations.find(
      ({ species }) => species === "brown-rat",
    )));
  });

  it("creates conserved frog population areas without frog actor identities", () => {
    const habitat = deriveFocused();
    const patch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "rain-chorus:aggregate",
      originRegion: ORIGIN,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v4", habitat },
    });
    const frogs = patch.aggregatePopulations.find(
      ({ species }) => species === "southern-leopard-frog",
    );

    expect(patch.populations.some(({ species }) => species === "southern-leopard-frog"))
      .toBe(false);
    expect(frogs).toMatchObject({
      representation: "aggregate-area",
      activitySignal: {
        kind: "rain-chorus",
        activePeriod: "rain-responsive",
      },
    });
    expect(frogs?.aggregateId).toMatch(/^FROG-AREA-v1-/u);
    const frogHabitat = habitat.populations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    expect(frogs?.activitySignal.intensity).toBe(
      resolveCoreEcologyAggregateActivityIntensity(
        "southern-leopard-frog",
        frogHabitat?.activitySignal.intensity ?? 0,
        0,
      ),
    );
    expect(frogs?.anchors.length).toBeGreaterThan(0);
    expect(frogs?.anchors.length).toBeLessThanOrEqual(3);
    expect(frogs?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
      .toBe(frogs?.populationSize);
    expect(frogs?.evidence.every(({ kind }) => kind === "frog-track")).toBe(true);
    expect(canonicalizeCoreEcologyAggregatePatch(patch)).toEqual(patch);

    if (frogs === undefined || frogs.anchors.length < 2) {
      throw new Error("Frog aggregate fixture requires two bounded anchors");
    }
    const from = frogs.anchors.find(({ populationUnits }) => populationUnits > 0);
    const to = frogs.anchors.find(({ anchorOrdinal }) => anchorOrdinal !== from?.anchorOrdinal);
    if (from === undefined || to === undefined) throw new Error("Frog transfer anchors are missing");
    const quieted = displaceCoreEcologyAggregatePopulation(patch, {
      aggregateId: frogs.aggregateId,
      atTick: 1,
      causeKind: "predator-pressure",
      causeReferenceId: "HARRIER-v1-frog-pressure",
      fromAnchorOrdinal: from.anchorOrdinal,
      toAnchorOrdinal: to.anchorOrdinal,
      populationUnits: 1,
      pressure: 600_000,
    });
    expect(quieted?.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ))?.activitySignal.intensity).toBeLessThan(frogs.activitySignal.intensity);
    expect(quieted?.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ))?.populationSize).toBe(frogs.populationSize);
    expect(quieted?.evidence.kind).toBe("frog-track");

    const text = serializeCoreEcologyAggregatePatch(patch);
    expect(deserializeCoreEcologyAggregatePatch(text)).toEqual(patch);
    expect(deserializeCoreEcologyAggregatePatch(text) === null
      ? null
      : serializeCoreEcologyAggregatePatch(deserializeCoreEcologyAggregatePatch(text)))
      .toBe(text);
  });

  it("keeps existing rat IDs exact while adding a disjoint frog namespace", () => {
    const input = {
      seed: SEED,
      originRegion: ORIGIN,
      populationKey: "habitat-v2/brown-rat",
    } as const;
    const legacyDefault = stableCoreEcologyAggregatePopulationId(input);
    const explicitRat = stableCoreEcologyAggregatePopulationId({
      ...input,
      species: "brown-rat",
    });
    const frog = stableCoreEcologyAggregatePopulationId({
      ...input,
      species: "southern-leopard-frog",
    });

    expect(explicitRat).toBe(legacyDefault);
    expect(legacyDefault).toMatch(/^RAT-AREA-v1-/u);
    expect(frog).toMatch(/^FROG-AREA-v1-/u);
    expect(frog.slice("FROG-AREA-v1-".length)).toBe(
      legacyDefault.slice("RAT-AREA-v1-".length),
    );
  });

  it("is stable at signed coordinate extremes and admits honest local absence", () => {
    for (const region of [
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    ]) {
      const habitat = deriveFocused(SEED, region, 12);
      expect(deriveFocused(SEED, region, 12)).toEqual(habitat);
      expect(canonicalizeCoreEcologyRainChorusHabitatAssemblage(habitat)).toEqual(habitat);
      const patch = createCoreEcologyAggregatePatch({
        seed: SEED,
        patchKey: `rain-chorus:extreme:${region.x > 0 ? "p" : "n"}`,
        originRegion: region,
        tick: 17,
        populations: individualInputs(habitat),
        derivation: { kind: "habitat-v4", habitat },
      });
      const text = serializeCoreEcologyAggregatePatch(patch);
      expect(deserializeCoreEcologyAggregatePatch(text)).toEqual(patch);
    }

    const tiny = deriveFocused(
      seedFromText("a tiny quiet patch cannot promise a chorus"),
      createRegionCoord(-71, 43),
      1,
    );
    expect(tiny.populations.find(({ species }) => species === "southern-leopard-frog"))
      .toMatchObject({ populationUnits: 0, allocations: [] });
  });

  it("projects weather into species activity without changing aggregate identity", () => {
    const frogDry = resolveCoreEcologyAggregateActivityIntensity(
      "southern-leopard-frog",
      700_000,
      0,
    );
    const frogRain = resolveCoreEcologyAggregateActivityIntensity(
      "southern-leopard-frog",
      700_000,
      900_000,
    );
    expect(frogRain).toBeGreaterThan(frogDry);
    expect(resolveCoreEcologyAggregateActivityIntensity("brown-rat", 700_000, 900_000))
      .toBe(700_000);
    expect(resolveCoreEcologyAggregateDisturbanceActivity(
      "southern-leopard-frog",
      frogRain,
      "predator-pressure",
      600_000,
    )).toBeLessThan(frogRain);
    expect(resolveCoreEcologyAggregateDisturbanceActivity(
      "southern-leopard-frog",
      frogDry,
      "weather-pressure",
      800_000,
    )).toBe(800_000);
  });
});
