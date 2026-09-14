import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
} from "./coreEcology";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import {
  CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
  CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
  CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES,
  deriveCoreEcologyBreadthHabitat,
} from "./coreEcologyBreadthHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS,
  projectCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import {
  REGIONAL_BREADTH_COHORT_OWNER_ID,
  canonicalCoreEcologyBreadthResidentPatch,
  coreEcologyBreadthResidentPatchResidenceRegions,
  coreEcologyBreadthResidentSourceKey,
  createCoreEcologyBreadthResidentPatch,
  deriveCoreEcologyBreadthResidentSet,
  reconcileCoreEcologyBreadthResidentPatchAtTick,
} from "./regionalBreadthCohort";
import { createWorldPosition } from "./worldPosition";

export const ALPHA37_ESTUARY_BREADTH_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha37-estuary-breadth-resident-shared-invariants:v1" as const;
export const ALPHA38_MARSH_CHANNEL_WEB_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha38-marsh-channel-web-resident-shared-invariants:v1" as const;

const SEED = seedFromText("alpha37 estuary breadth shared properties");
const COHORT = CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID;
const MARSH_COHORT = CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID;
const AGGREGATE_REGION = createRegionCoord(-5_179, -89_646);
const TERN_REGION = createRegionCoord(-5_179, -89_646);
const HERON_REGION = createRegionCoord(1_050, 38_043);
const OSPREY_REGION = createRegionCoord(-192_134, -225_672);
const ABSENT_REGION = createRegionCoord(-1, -1);
const MARSH_FIXTURE_REGIONS = Object.freeze([
  createRegionCoord(-1, -1),
  createRegionCoord(144_181, 147_353),
  createRegionCoord(173_753, 11_507),
  createRegionCoord(91_177, 199_624),
]);

function patchAt(region: ReturnType<typeof createRegionCoord>, tick = 0) {
  const habitat = deriveCoreEcologyBreadthHabitat({
    seed: SEED,
    region,
    cohortId: COHORT,
  });
  expect(habitat.totalPopulationUnits).toBeGreaterThan(0);
  return {
    habitat,
    patch: createCoreEcologyBreadthResidentPatch({ seed: SEED, habitat, tick }),
  };
}

function marshPatches() {
  return MARSH_FIXTURE_REGIONS.map((region) => {
    const habitat = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region,
      cohortId: MARSH_COHORT,
    });
    expect(habitat.totalPopulationUnits).toBeGreaterThan(0);
    return {
      habitat,
      patch: createCoreEcologyBreadthResidentPatch({ seed: SEED, habitat }),
    };
  });
}

describe(`${ALPHA37_ESTUARY_BREADTH_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT} shared cohort adapter`, () => {
  it("materializes five declarative species through shared individual, aggregate, and flock structures", () => {
    const fixtures = [
      patchAt(AGGREGATE_REGION),
      patchAt(TERN_REGION),
      patchAt(HERON_REGION),
      patchAt(OSPREY_REGION),
    ];
    const species = new Set<string>();
    for (const { habitat, patch } of fixtures) {
      for (const population of patch.populations) species.add(population.species);
      for (const population of patch.aggregatePopulations) species.add(population.species);
      expect(canonicalCoreEcologyBreadthResidentPatch(patch, {
        seed: SEED,
        region: habitat.region,
        completedTick: 0,
      })).toBe(patch);
      expect(patch.nextMortalityOrdinal).toBe(0);
      expect(patch.mortalityTransactions).toEqual([]);
      expect(patch.carcasses).toEqual([]);

      for (const candidate of habitat.populations) {
        if (candidate.populationUnits === 0) continue;
        const aggregate = patch.aggregatePopulations.find(
          ({ populationKey }) => populationKey === candidate.populationKey,
        );
        const individuals = patch.populations.find(
          ({ populationKey }) => populationKey === candidate.populationKey,
        );
        if (candidate.actorRepresentation === "aggregate") {
          expect(aggregate?.populationSize).toBe(candidate.populationUnits);
          expect(aggregate?.anchors.reduce(
            (sum, anchor) => sum + anchor.populationUnits,
            0,
          )).toBe(candidate.populationUnits);
          expect(individuals).toBeUndefined();
        } else {
          expect(individuals?.members).toHaveLength(candidate.populationUnits);
          expect(individuals?.members.every(({ representedUnits }) => (
            representedUnits === 1
          ))).toBe(true);
          expect(aggregate).toBeUndefined();
        }
      }
    }
    expect([...species].sort()).toEqual([
      "atlantic-ghost-crab",
      "bay-anchovy",
      "common-tern",
      "great-blue-heron",
      "osprey",
    ]);
    const tern = fixtures[1]!.patch;
    const ternPopulation = tern.populations.find(
      ({ species: candidate }) => candidate === "common-tern",
    )!;
    expect(tern.groups.groups).toHaveLength(1);
    expect(tern.groups.groups[0]).toMatchObject({
      memberOrdinals: ternPopulation.members.map(({ populationOrdinal }) => populationOrdinal),
      identity: {
        species: "common-tern",
        organization: "flock",
        populationKey: ternPopulation.populationKey,
      },
    });
    expect(stableStringify(fixtures.map(({ patch }) => patch))).not.toMatch(
      /capture|consumption|reproduction|soundEvent|voice/u,
    );
  });

  it("deduplicates its bounded region window and leaves unsupported habitat absent", () => {
    const set = deriveCoreEcologyBreadthResidentSet({
      seed: SEED,
      regions: [ABSENT_REGION, AGGREGATE_REGION, AGGREGATE_REGION],
      tick: 64,
      activeThroughEpoch: 1,
    });
    expect(set.ownerId).toBe(REGIONAL_BREADTH_COHORT_OWNER_ID);
    expect(set.residents).toHaveLength(1);
    expect(set.residents[0]!.region).toEqual(AGGREGATE_REGION);
    expect(set.residents[0]!.sourceKey).toBe(
      coreEcologyBreadthResidentSourceKey(set.residents[0]!.habitat),
    );
    expect(deriveCoreEcologyBreadthResidentSet({
      seed: SEED,
      regions: [AGGREGATE_REGION, ABSENT_REGION],
      tick: 64,
      activeThroughEpoch: 1,
    })).toEqual(set);
  });

  it("preserves stable actor identity and aggregate units through coarse materialization and dormant time", () => {
    const { patch } = patchAt(TERN_REGION);
    const actors = patch.populations.flatMap(({ members }) => members.map(
      ({ actor }) => actor.identity.stableId,
    ));
    const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: 0,
      actorIds: actors,
    });
    expect(materialized.populations.flatMap(({ members }) => members).every(
      ({ materialization }) => materialization === "materialized",
    )).toBe(true);
    const coarse = setCoreEcologyAggregatePatchMaterializedActors(materialized, {
      atTick: 0,
      actorIds: [],
    });
    const initialUnits = coarse.aggregatePopulations.reduce(
      (sum, population) => sum + population.populationSize,
      0,
    ) + coarse.populations.reduce(
      (sum, population) => sum + population.populationSize,
      0,
    );
    const later = reconcileCoreEcologyBreadthResidentPatchAtTick(coarse, 128);
    expect(later).not.toBeNull();
    expect(later!.populations.flatMap(({ members }) => members.map(
      ({ actor }) => actor.identity.stableId,
    ))).toEqual(actors);
    expect(later!.aggregatePopulations.reduce(
      (sum, population) => sum + population.populationSize,
      0,
    ) + later!.populations.reduce(
      (sum, population) => sum + population.populationSize,
      0,
    )).toBe(initialUnits);
    expect(later!.mortalityTransactions).toEqual([]);
    expect(later!.carcasses).toEqual([]);
  });

  it("matches continuous empty-world tide replay and never leaves anchovy biomass on a dry anchor", () => {
    const epoch = patchAt(AGGREGATE_REGION, 0).patch;
    const oneShot = reconcileCoreEcologyBreadthResidentPatchAtTick(epoch, 128);
    let continuous = epoch;
    for (let tick = 1; tick <= 128; tick += 1) {
      const next = reconcileCoreEcologyBreadthResidentPatchAtTick(continuous, tick);
      if (next === null) throw new Error(`Breadth tide replay failed at tick ${tick}`);
      continuous = next;
    }
    expect(oneShot).toEqual(continuous);
    expect(createCoreEcologyBreadthResidentPatch({
      seed: SEED,
      habitat: patchAt(AGGREGATE_REGION, 0).habitat,
      tick: 128,
    })).toEqual(oneShot);

    const projection = projectCoreEcologyTidalTable(continuous, 128);
    const anchovy = continuous.aggregatePopulations.find(
      ({ species }) => species === "bay-anchovy",
    );
    if (projection === null || anchovy === undefined) {
      throw new Error("Breadth tide fixture lost its anchovy authority");
    }
    const unitsByAnchor = new Map(anchovy.anchors.map(({ anchorOrdinal, populationUnits }) => (
      [anchorOrdinal, populationUnits] as const
    )));
    expect(projection.anchorDepths
      .filter(({ species, activityUsable }) => species === "bay-anchovy" && !activityUsable)
      .every(({ anchorOrdinal }) => (unitsByAnchor.get(anchorOrdinal) ?? 0) === 0))
      .toBe(true);
    expect(anchovy.anchors.reduce(
      (sum, { populationUnits }) => sum + populationUnits,
      0,
    )).toBe(anchovy.populationSize);
  });

  it("world-binds flock identity rather than accepting a plausible foreign group", () => {
    const { habitat, patch } = patchAt(TERN_REGION);
    const tern = habitat.populations.find(
      ({ species }) => species === "common-tern",
    );
    if (tern === undefined || tern.anchors[0] === undefined) {
      throw new Error("Alpha37 group-integrity fixture lost its tern cohort");
    }
    const groupInput = {
      species: tern.species,
      originRegion: TERN_REGION,
      populationKey: tern.populationKey,
      memberOrdinals: Array.from(
        { length: tern.populationUnits },
        (_, ordinal) => ordinal,
      ),
      anchor: tern.anchors[0].position,
      tick: 0,
    } as const;
    for (const forged of [
      createCoreEcologyGroup({
        ...groupInput,
        seed: seedFromText("alpha37 foreign flock identity"),
        groupOrdinal: 0,
      }),
      createCoreEcologyGroup({
        ...groupInput,
        seed: SEED,
        groupOrdinal: 1,
      }),
    ]) {
      expect(canonicalCoreEcologyBreadthResidentPatch({
        ...patch,
        groups: createCoreEcologyGroupSet([forged]),
      }, {
        seed: SEED,
        region: TERN_REGION,
        completedTick: 0,
      })).toBeNull();
    }
  });

  it("keeps origin custody while physical residence crosses signed coordinate extremes", () => {
    const { patch } = patchAt(HERON_REGION);
    const population = patch.populations.find(
      ({ species }) => species === "great-blue-heron",
    )!;
    const actor = population.members[0]!.actor;
    const destination = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const moved = replaceCoreEcologyAggregatePatchActor(
      patch,
      repositionCoreWildlifeActor(actor, {
        atTick: 0,
        position: createWorldPosition(destination, 1_000, 2_000),
        heading: 875_000,
      }),
    );
    expect(canonicalCoreEcologyBreadthResidentPatch(moved, {
      seed: SEED,
      region: HERON_REGION,
      completedTick: 0,
    })).toBe(moved);
    expect(coreEcologyBreadthResidentPatchResidenceRegions(moved)).toContainEqual(
      destination,
    );
    expect(canonicalCoreEcologyBreadthResidentPatch(moved, {
      seed: seedFromText("alpha37 foreign resident world"),
      region: HERON_REGION,
      completedTick: 0,
    })).toBeNull();
  });
});

describe(`${ALPHA38_MARSH_CHANNEL_WEB_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT} generic cohort adapter`, () => {
  it("materializes the seven-species web through bounded aggregate, individual, and flock structures", () => {
    const fixtures = marshPatches();
    const species = new Set<string>();
    for (const { habitat, patch } of fixtures) {
      for (const population of patch.populations) species.add(population.species);
      for (const population of patch.aggregatePopulations) species.add(population.species);
      expect(canonicalCoreEcologyBreadthResidentPatch(patch, {
        seed: SEED,
        region: habitat.region,
        completedTick: 0,
      })).toBe(patch);
      expect(patch.aggregatePopulations).toHaveLength(
        habitat.populations.filter(({ actorRepresentation, populationUnits }) => (
          actorRepresentation === "aggregate" && populationUnits > 0
        )).length,
      );
      expect(patch.nextMortalityOrdinal).toBe(0);
      expect(patch.mortalityTransactions).toEqual([]);
      expect(patch.carcasses).toEqual([]);

      const projection = projectCoreEcologyTidalTable(patch, 0);
      expect(projection).not.toBeNull();
      expect(projection!.anchorDepths.length)
        .toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS);

      for (const candidate of habitat.populations) {
        if (candidate.populationUnits === 0) continue;
        const aggregate = patch.aggregatePopulations.find(
          ({ populationKey }) => populationKey === candidate.populationKey,
        );
        const individual = patch.populations.find(
          ({ populationKey }) => populationKey === candidate.populationKey,
        );
        if (candidate.actorRepresentation === "aggregate") {
          expect(individual).toBeUndefined();
          expect(aggregate?.populationSize).toBe(candidate.populationUnits);
          expect(aggregate?.anchors.reduce(
            (sum, anchor) => sum + anchor.populationUnits,
            0,
          )).toBe(candidate.populationUnits);
          continue;
        }
        expect(aggregate).toBeUndefined();
        expect(individual?.members).toHaveLength(candidate.populationUnits);
        expect(individual?.members.every(({ representedUnits, materialization }) => (
          representedUnits === 1 && materialization === "coarse"
        ))).toBe(true);
        const group = patch.groups.groups.find(
          ({ identity }) => identity.populationKey === candidate.populationKey,
        );
        if (candidate.groupOrganization === "flock") {
          expect(group).toMatchObject({
            memberOrdinals: individual!.members.map(
              ({ populationOrdinal }) => populationOrdinal,
            ),
            identity: {
              species: candidate.species,
              organization: "flock",
              populationKey: candidate.populationKey,
            },
          });
        } else {
          expect(group).toBeUndefined();
        }
      }
      expect(patch.groups.groups).toHaveLength(habitat.populations.filter(
        ({ actorRepresentation, groupOrganization, populationUnits }) => (
          actorRepresentation === "individual"
          && groupOrganization === "flock"
          && populationUnits > 0
        ),
      ).length);
    }
    expect([...species].sort()).toEqual([...CORE_ECOLOGY_MARSH_CHANNEL_WEB_SPECIES].sort());
    expect(stableStringify(fixtures.map(({ patch }) => patch))).not.toMatch(
      /capture|consumption|reproduction|soundEvent|voice/u,
    );
  });

  it("admits epoch two through the existing resident-set root without changing epoch-one selection", () => {
    const current = deriveCoreEcologyBreadthResidentSet({
      seed: SEED,
      regions: MARSH_FIXTURE_REGIONS,
    });
    expect(current.activeThroughEpoch).toBe(2);
    expect(current.residents.some(({ cohortId }) => cohortId === MARSH_COHORT)).toBe(true);
    const epochOne = deriveCoreEcologyBreadthResidentSet({
      seed: SEED,
      regions: MARSH_FIXTURE_REGIONS,
      activeThroughEpoch: 1,
    });
    expect(epochOne.residents.every(({ cohortId }) => cohortId === COHORT)).toBe(true);
  });
});
