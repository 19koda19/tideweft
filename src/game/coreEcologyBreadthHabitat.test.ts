import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { keyedRandomInt, seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { hashCanonical, stableStringify } from "../sim/util";
import { CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH } from "./coreEcologyHabitat";
import {
  CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS,
  CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
  CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID,
  CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
  CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_SPECIES,
  CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
  CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES,
  CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID,
  CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_SPECIES,
  assertBreadthDefinitions,
  canonicalCoreEcologyBreadthHabitatForWorld,
  canonicalizeCoreEcologyBreadthHabitat,
  clearCoreEcologyBreadthHabitatCache,
  coreEcologyBreadthCohortsThroughEpoch,
  deriveCoreEcologyBreadthTerritory,
  deriveCoreEcologyBreadthHabitat,
  type CoreEcologyBreadthHabitat,
  type CoreEcologyBreadthSpecies,
} from "./coreEcologyBreadthHabitat";
import { CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS } from "./coreEcologyTidalTable";

export const ALPHA37_ESTUARY_BREADTH_HABITAT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha37-estuary-breadth-habitat-shared-invariants:v1" as const;
export const ALPHA38_MARSH_CHANNEL_WEB_HABITAT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha38-marsh-channel-web-habitat-shared-invariants:v1" as const;
export const WAVE_G_SALTMARSH_SMALL_WORLDS_HABITAT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha39-saltmarsh-small-worlds-habitat-shared-invariants:v1" as const;

const SEED = seedFromText("alpha37 estuary breadth shared properties");
const FOREIGN_SEED = seedFromText("alpha37 foreign estuary breadth world");
const COHORT = CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID;
const MARSH_COHORT = CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID;
const SALTMARSH_COHORT = CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID;

function corpus() {
  const fixed = [
    createRegionCoord(0, 0),
    createRegionCoord(-1, -1),
    createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    createRegionCoord(-4_194_301, 3_671_113),
    createRegionCoord(4_194_301, -3_671_113),
    createRegionCoord(-5_179, -89_646),
    createRegionCoord(-192_134, -225_672),
    createRegionCoord(-115_499, 73_530),
    createRegionCoord(1_050, 38_043),
  ];
  const generated = Array.from({ length: 8 }, (_, ordinal) => createRegionCoord(
    keyedRandomInt(SEED, 0x4252_5837, ordinal, 1, 2, -50_000, 50_000),
    keyedRandomInt(SEED, 0x4252_5937, ordinal, 3, 4, -50_000, 50_000),
  ));
  return Object.freeze([...fixed, ...generated]);
}

function marshChannelCorpus() {
  return Object.freeze([
    createRegionCoord(0, 0),
    createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    createRegionCoord(-1, -1),
    createRegionCoord(144_181, 147_353),
    createRegionCoord(173_753, 11_507),
    createRegionCoord(91_177, 199_624),
  ]);
}

function saltmarshSmallWorldsCorpus() {
  return Object.freeze([
    createRegionCoord(0, 0),
    createRegionCoord(-1, -1),
    createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    createRegionCoord(-53_756, 241_068),
    createRegionCoord(-227_823, 56_492),
    createRegionCoord(-42_136, 140_086),
    createRegionCoord(-126_625, -214_398),
  ]);
}

function admittedBySpecies(habitats: readonly CoreEcologyBreadthHabitat[]) {
  const result = new Map<CoreEcologyBreadthSpecies, CoreEcologyBreadthHabitat>();
  for (const habitat of habitats) {
    for (const population of habitat.populations) {
      if (population.populationUnits > 0 && !result.has(population.species)) {
        result.set(population.species, habitat);
      }
    }
  }
  return result;
}

describe(`${ALPHA37_ESTUARY_BREADTH_HABITAT_SHARED_INVARIANTS_OWNER_INTENT} append-only habitat authority`, () => {
  it("replays canonical terrain independent of evaluation order and binds authority to its world", () => {
    const region = createRegionCoord(-4_194_301, 3_671_113);
    const terrain = generateRegionTerrain(SEED, region);
    const first = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region,
      cohortId: COHORT,
    });
    const replay = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region,
      cohortId: COHORT,
      terrain: { ...terrain, tiles: [...terrain.tiles].reverse() },
      speciesOrder: [...CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_SPECIES].reverse(),
    });
    expect(replay).toBe(first);
    expect(first).toMatchObject({
      ownerId: CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID,
      cohortId: COHORT,
      evaluatedSpeciesCount: 5,
    });
    expect(first.derivationHash).toBe("df582f3dff6dfb8d");
    expect(first.populations.map(({ species }) => species)).toEqual(
      CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_SPECIES,
    );
    expect(canonicalizeCoreEcologyBreadthHabitat(first)).toBe(first);
    expect(canonicalCoreEcologyBreadthHabitatForWorld(first, SEED, region)).toBe(first);
    expect(
      canonicalCoreEcologyBreadthHabitatForWorld(first, FOREIGN_SEED, region),
    ).toBeNull();
  });

  it("keeps one append-only cohort registry instead of requiring one new root schema per batch", () => {
    expect(CORE_ECOLOGY_BREADTH_CURRENT_EPOCH).toBe(3);
    expect(coreEcologyBreadthCohortsThroughEpoch(0)).toEqual([]);
    expect(coreEcologyBreadthCohortsThroughEpoch(1)).toEqual([
      CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS[0],
    ]);
    expect(coreEcologyBreadthCohortsThroughEpoch(2)).toEqual(
      CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS.slice(0, 2),
    );
    expect(coreEcologyBreadthCohortsThroughEpoch(3)).toEqual(
      CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS,
    );
    expect(() => assertBreadthDefinitions(CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS))
      .not.toThrow();
    const current = CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS[0]!;
    const marshChannel = CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS[1]!;
    const saltmarshSmallWorlds = CORE_ECOLOGY_BREADTH_COHORT_DEFINITIONS[2]!;
    expect(current.definitionHash).toBe("1fd6b2ade34099fd");
    expect(Object.prototype.hasOwnProperty.call(current, "regionalAdmission"))
      .toBe(false);
    expect(marshChannel).toMatchObject({
      cohortId: MARSH_COHORT,
      introducedInEpoch: 2,
      definitionVersion: 2,
      regionalAdmission: {
        signal: "eligible-habitat",
      },
    });
    expect(marshChannel.definitionHash).toBe("774366e24d972720");
    expect(marshChannel.species.map(({ species }) => species)).toEqual(
      CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES,
    );
    expect(marshChannel.species.filter(({ actorRepresentation }) => (
      actorRepresentation === "aggregate"
    ))).toHaveLength(4);
    expect(marshChannel.species.reduce((sum, profile) => (
      sum + (profile.actorRepresentation === "aggregate" ? profile.maximumAnchors : 0)
    ), 0)).toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS);
    expect(saltmarshSmallWorlds).toMatchObject({
      cohortId: SALTMARSH_COHORT,
      introducedInEpoch: 3,
      definitionVersion: 2,
      regionalAdmission: {
        signal: "eligible-habitat",
      },
    });
    expect(saltmarshSmallWorlds.definitionHash).toBe("adb3fa2ee13c29bd");
    expect(saltmarshSmallWorlds.species.map(({ species }) => species)).toEqual(
      CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_SPECIES,
    );
    expect(saltmarshSmallWorlds.species.filter(({ actorRepresentation }) => (
      actorRepresentation === "aggregate"
    ))).toHaveLength(2);
    expect(saltmarshSmallWorlds.species.filter(({ actorRepresentation }) => (
      actorRepresentation === "aggregate"
    )).every(({ maximumAnchors }) => maximumAnchors <= 2)).toBe(true);
    expect(saltmarshSmallWorlds.species.reduce((sum, profile) => (
      sum + (profile.actorRepresentation === "aggregate" ? profile.maximumAnchors : 0)
    ), 0)).toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS);
    expect(() => assertBreadthDefinitions([
      current,
      {
        ...marshChannel,
        regionalAdmission: {
          ...marshChannel.regionalAdmission!,
          minimumPresenceThreshold:
            marshChannel.regionalAdmission!.minimumPresenceThreshold + 1,
        },
      },
    ])).toThrow(/definition hash/u);
    const futureBase = {
      cohortId: "future-wave-g-cohort" as typeof current.cohortId,
      introducedInEpoch: current.introducedInEpoch + 1,
      definitionVersion: 1 as const,
      species: [{
        ...current.species[0]!,
        species: "future-wave-g-species" as typeof current.species[number]["species"],
      }],
    };
    const future = { ...futureBase, definitionHash: hashCanonical(futureBase) };
    expect(() => assertBreadthDefinitions([current, future])).not.toThrow();
    const sameEpochDefinition = {
      ...futureBase,
      introducedInEpoch: current.introducedInEpoch,
    };
    expect(() => assertBreadthDefinitions([
      current,
      {
        ...sameEpochDefinition,
        definitionHash: hashCanonical(sameEpochDefinition),
      },
    ])).toThrow(/reordered/u);
    expect(() => assertBreadthDefinitions([{
      ...current,
      species: [...current.species].reverse(),
    }])).toThrow(/definition hash/u);
    expect(() => deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region: createRegionCoord(0, 0),
      cohortId: COHORT,
      speciesOrder: [...CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_SPECIES, "osprey"],
    })).toThrow(/duplicates|complete cohort/u);
  });

  it("partitions clipped multi-region territories correctly at both signed boundaries", () => {
    for (const species of ["great-blue-heron", "osprey"] as const) {
      for (const boundary of [-REGION_COORD_LIMIT, REGION_COORD_LIMIT]) {
        const region = createRegionCoord(boundary, boundary);
        const territory = deriveCoreEcologyBreadthTerritory(
          SEED,
          COHORT,
          species,
          region,
        );
        expect(region.x).toBeGreaterThanOrEqual(territory.bounds.minimum.x);
        expect(region.x).toBeLessThanOrEqual(territory.bounds.maximum.x);
        expect(region.y).toBeGreaterThanOrEqual(territory.bounds.minimum.y);
        expect(region.y).toBeLessThanOrEqual(territory.bounds.maximum.y);
        expect(territory.hostRegion.x).toBeGreaterThanOrEqual(territory.bounds.minimum.x);
        expect(territory.hostRegion.x).toBeLessThanOrEqual(territory.bounds.maximum.x);
        expect(territory.hostRegion.y).toBeGreaterThanOrEqual(territory.bounds.minimum.y);
        expect(territory.hostRegion.y).toBeLessThanOrEqual(territory.bounds.maximum.y);

        for (let y = territory.bounds.minimum.y; y <= territory.bounds.maximum.y; y += 1) {
          for (let x = territory.bounds.minimum.x; x <= territory.bounds.maximum.x; x += 1) {
            const member = deriveCoreEcologyBreadthTerritory(
              SEED,
              COHORT,
              species,
              createRegionCoord(x, y),
            );
            expect(member.address).toEqual(territory.address);
            expect(member.bounds).toEqual(territory.bounds);
            expect(member.hostRegion).toEqual(territory.hostRegion);
            expect(member.stableId).toBe(territory.stableId);
          }
        }
        const inward = boundary < 0
          ? territory.bounds.maximum.x + 1
          : territory.bounds.minimum.x - 1;
        if (Math.abs(inward) <= REGION_COORD_LIMIT) {
          const neighbor = deriveCoreEcologyBreadthTerritory(
            SEED,
            COHORT,
            species,
            createRegionCoord(inward, boundary),
          );
          expect(neighbor.address.x).not.toBe(territory.address.x);
          expect(neighbor.stableId).not.toBe(territory.stableId);
        }
      }
    }
  });

  it("preserves stable signed/extreme coordinates, honest absence, conservation, and trophic dependencies as batch properties", () => {
    clearCoreEcologyBreadthHabitatCache();
    const habitats = corpus().map((region) => deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region,
      cohortId: COHORT,
    }));
    const replay = [...corpus()].reverse().map((region) => {
      clearCoreEcologyBreadthHabitatCache();
      return deriveCoreEcologyBreadthHabitat({ seed: SEED, region, cohortId: COHORT });
    }).reverse();
    expect(stableStringify(replay)).toBe(stableStringify(habitats));

    const present = admittedBySpecies(habitats);
    expect(
      [...present.keys()].sort(),
      stableStringify(habitats.map(({ region, populations }) => ({
        region,
        present: populations.filter(({ populationUnits }) => populationUnits > 0)
          .map(({ species, populationUnits }) => [species, populationUnits]),
      }))),
    ).toEqual([...CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_SPECIES].sort());
    expect(habitats.some(({ totalPopulationUnits }) => totalPopulationUnits === 0)).toBe(true);
    expect(
      habitats.some(({ region, totalPopulationUnits }) => (
        Math.abs(region.x) > 1_000_000 && totalPopulationUnits > 0
      )),
    ).toBe(true);

    for (const habitat of habitats) {
      expect(habitat.totalPopulationUnits).toBe(habitat.populations.reduce(
        (sum, population) => sum + population.populationUnits,
        0,
      ));
      const ids = new Set<string>();
      const anchovy = habitat.populations.find(({ species }) => species === "bay-anchovy")!;
      if (anchovy.populationUnits > 0) {
        expect(anchovy.anchors.some(({ lowTideDepth }) => (
          lowTideDepth >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
        ))).toBe(true);
        expect(anchovy.anchors[0]?.lowTideDepth)
          .toBeGreaterThanOrEqual(CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH);
      }
      for (const population of habitat.populations) {
        expect(population.anchors.reduce(
          (sum, anchor) => sum + anchor.allocatedPopulation,
          0,
        )).toBe(population.populationUnits);
        for (const anchor of population.anchors) {
          expect(ids.has(anchor.stableId)).toBe(false);
          ids.add(anchor.stableId);
          expect(anchor.position.region).toEqual(habitat.region);
        }
        if (population.dependencySpecies === "bay-anchovy") {
          expect(population.preySupportUnits).toBe(anchovy.populationUnits);
          expect(population.dependencyPopulationKey).toBe(anchovy.populationKey);
          expect(population.populationUnits).toBeLessThanOrEqual(
            population.trophicCeiling,
          );
          if (population.populationUnits > 0) {
            expect(anchovy.populationUnits).toBeGreaterThan(0);
          }
        }
      }
      expect(stableStringify(habitat)).not.toMatch(
        /targetActor|capture|mortality|carcass|consumption|reproduction|soundEvent|voice/u,
      );
    }
  }, 20_000);
});

describe(`${ALPHA38_MARSH_CHANNEL_WEB_HABITAT_SHARED_INVARIANTS_OWNER_INTENT} epoch-two declarative cohort`, () => {
  it("replays the complete cohort independent of evaluation order and binds it to epoch two", () => {
    const region = createRegionCoord(-4_194_301, 3_671_113);
    const terrain = generateRegionTerrain(SEED, region);
    const first = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region,
      cohortId: MARSH_COHORT,
    });
    const replay = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region,
      cohortId: MARSH_COHORT,
      terrain: { ...terrain, tiles: [...terrain.tiles].reverse() },
      speciesOrder: [...CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES].reverse(),
    });
    expect(replay).toBe(first);
    expect(first).toMatchObject({
      ownerId: CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID,
      cohortId: MARSH_COHORT,
      cohortEpoch: 2,
      evaluatedSpeciesCount: 7,
    });
    expect(first.populations.map(({ species }) => species)).toEqual(
      CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES,
    );
    expect(canonicalCoreEcologyBreadthHabitatForWorld(first, SEED, region)).toBe(first);
    expect(canonicalCoreEcologyBreadthHabitatForWorld(
      first,
      FOREIGN_SEED,
      region,
    )).toBeNull();
  });

  it("derives honest sparse presence and local food-web ceilings as cohort properties", () => {
    clearCoreEcologyBreadthHabitatCache();
    const habitats = marshChannelCorpus().map((region) => (
      deriveCoreEcologyBreadthHabitat({ seed: SEED, region, cohortId: MARSH_COHORT })
    ));
    const present = admittedBySpecies(habitats);
    expect(
      [...present.keys()].sort(),
      stableStringify(habitats.map(({ region, populations }) => ({
        region,
        present: populations.filter(({ populationUnits }) => populationUnits > 0)
          .map(({ species, populationUnits }) => [species, populationUnits]),
      }))),
    ).toEqual([...CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES].sort());
    expect(habitats.some(({ totalPopulationUnits }) => totalPopulationUnits === 0)).toBe(true);
    expect(habitats.some(({ totalPopulationUnits }) => totalPopulationUnits > 0)).toBe(true);

    const dependencies = new Map<CoreEcologyBreadthSpecies, CoreEcologyBreadthSpecies>([
      ["greater-yellowlegs", "grass-shrimp"],
      ["belted-kingfisher", "mummichog"],
      ["double-crested-cormorant", "atlantic-menhaden"],
    ]);
    for (const habitat of habitats) {
      expect(habitat.populations).toHaveLength(7);
      expect(habitat.populations.filter(({ actorRepresentation }) => (
        actorRepresentation === "aggregate"
      ))).toHaveLength(4);
      expect(habitat.totalPopulationUnits).toBe(habitat.populations.reduce(
        (sum, population) => sum + population.populationUnits,
        0,
      ));
      for (const population of habitat.populations) {
        expect(population.anchors.reduce(
          (sum, anchor) => sum + anchor.allocatedPopulation,
          0,
        )).toBe(population.populationUnits);
        const dependencySpecies = dependencies.get(population.species);
        if (dependencySpecies === undefined) continue;
        const dependency = habitat.populations.find(
          ({ species }) => species === dependencySpecies,
        )!;
        expect(population.dependencySpecies).toBe(dependencySpecies);
        expect(population.preySupportUnits).toBe(dependency.populationUnits);
        expect(population.dependencyPopulationKey).toBe(dependency.populationKey);
        expect(population.populationUnits).toBeLessThanOrEqual(population.trophicCeiling);
        if (population.populationUnits > 0) {
          expect(dependency.populationUnits).toBeGreaterThan(0);
        }
      }
      expect(stableStringify(habitat)).not.toMatch(
        /targetActor|capture|mortality|carcass|consumption|reproduction|soundEvent|voice/u,
      );
    }
  }, 30_000);
});

describe(`${WAVE_G_SALTMARSH_SMALL_WORLDS_HABITAT_SHARED_INVARIANTS_OWNER_INTENT} epoch-three declarative cohort`, () => {
  it("replays one sparse saltmarsh web independent of evaluation order and world-binds the result", () => {
    const region = createRegionCoord(-126_625, -214_398);
    const terrain = generateRegionTerrain(SEED, region);
    const first = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region,
      cohortId: SALTMARSH_COHORT,
    });
    const replay = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region,
      cohortId: SALTMARSH_COHORT,
      terrain: { ...terrain, tiles: [...terrain.tiles].reverse() },
      speciesOrder: [...CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_SPECIES].reverse(),
    });
    expect(replay).toBe(first);
    expect(first).toMatchObject({
      ownerId: CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID,
      cohortId: SALTMARSH_COHORT,
      cohortEpoch: 3,
      evaluatedSpeciesCount: 4,
      derivationHash: "9c6ed4bb123ad083",
    });
    expect(first.populations.map(({ species }) => species)).toEqual(
      CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_SPECIES,
    );
    expect(canonicalCoreEcologyBreadthHabitatForWorld(first, SEED, region)).toBe(first);
    expect(canonicalCoreEcologyBreadthHabitatForWorld(
      first,
      FOREIGN_SEED,
      region,
    )).toBeNull();
  });

  it("keeps aggregate anchors bounded and addressable consumers locally substrate-dependent", () => {
    clearCoreEcologyBreadthHabitatCache();
    const habitats = saltmarshSmallWorldsCorpus().map((region) => (
      deriveCoreEcologyBreadthHabitat({ seed: SEED, region, cohortId: SALTMARSH_COHORT })
    ));
    const present = admittedBySpecies(habitats);
    expect([...present.keys()].sort()).toEqual(
      [...CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_SPECIES].sort(),
    );
    expect(habitats.some(({ totalPopulationUnits }) => totalPopulationUnits === 0)).toBe(true);
    expect(habitats.some(({ region, totalPopulationUnits }) => (
      Math.abs(region.x) > 1_000_000 && totalPopulationUnits > 0
    ))).toBe(true);

    const dependencyBySpecies = new Map<CoreEcologyBreadthSpecies, CoreEcologyBreadthSpecies>([
      ["seaside-sparrow", "eastern-saltmarsh-mosquito"],
      ["diamondback-terrapin", "marsh-periwinkle"],
    ]);
    for (const habitat of habitats) {
      expect(habitat.populations).toHaveLength(4);
      expect(habitat.totalPopulationUnits).toBe(habitat.populations.reduce(
        (sum, population) => sum + population.populationUnits,
        0,
      ));
      for (const population of habitat.populations) {
        expect(population.anchors.reduce(
          (sum, anchor) => sum + anchor.allocatedPopulation,
          0,
        )).toBe(population.populationUnits);
        if (population.actorRepresentation === "aggregate") {
          expect(population.anchors.length).toBeLessThanOrEqual(2);
        }
        if (population.species === "seaside-sparrow" && population.populationUnits > 0) {
          expect(population.populationUnits).toBeGreaterThanOrEqual(2);
          expect(population.populationUnits).toBeLessThanOrEqual(4);
          expect(population.groupOrganization).toBe("flock");
        }
        if (population.species === "diamondback-terrapin") {
          expect(population.populationUnits).toBeLessThanOrEqual(1);
          expect(population.groupOrganization).toBeNull();
        }
        const dependencySpecies = dependencyBySpecies.get(population.species);
        if (dependencySpecies !== undefined) {
          const dependency = habitat.populations.find(
            ({ species }) => species === dependencySpecies,
          )!;
          expect(population.dependencySpecies).toBe(dependencySpecies);
          expect(population.dependencyPopulationKey).toBe(dependency.populationKey);
          expect(population.preySupportUnits).toBe(dependency.populationUnits);
          expect(population.populationUnits).toBeLessThanOrEqual(population.trophicCeiling);
          if (population.populationUnits > 0) {
            expect(dependency.populationUnits).toBeGreaterThan(0);
          }
        }
        for (const anchor of population.anchors) {
          expect(["marsh", "tidal-flat"]).toContain(anchor.terrain);
          expect(anchor.position.region).toEqual(habitat.region);
        }
      }
      expect(stableStringify(habitat)).not.toMatch(
        /camera|playerPosition|startQuota|targetActor|bite|capture|disease|mortality|carcass|consumption|reproduction|soundEvent|voice/u,
      );
    }

    const originWithoutHabitat = deriveCoreEcologyBreadthHabitat({
      seed: seedFromText("origin-a"),
      region: createRegionCoord(0, 0),
      cohortId: SALTMARSH_COHORT,
    });
    expect(originWithoutHabitat.totalPopulationUnits).toBe(0);
  }, 30_000);
});
