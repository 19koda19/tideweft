import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { tideAtTick } from "../sim/terrain";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  stepCoreEcologyAggregatePatch,
} from "./coreEcology";
import {
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import { stepCoreEcologySmallWorld } from "./coreEcologySmallWorld";
import { deriveCoreEcologyPolarShoreHabitat } from "./coreEcologyPolarShoreHabitat";
import {
  CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_OWNER_ID,
  canonicalCoreEcologyPolarShoreResidentPatch,
  coreEcologyPolarShoreResidentPatchResidenceRegions,
  createCoreEcologyPolarShoreResidentPatch,
  deriveCoreEcologyPolarShoreResidentSet,
  reconcileCoreEcologyPolarShoreResidentPatchAtTick,
} from "./regionalPolarShoreResidents";

export const ALPHA34_POLAR_SHORE_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha34-polar-shore-resident-shared-invariants:v1" as const;

const SEED = seedFromText("polar habitat fuzz 29");
const REGION = createRegionCoord(-1653, 664);
const ABSENT_REGION = createRegionCoord(4_033, -329);

function admittedHabitat() {
  const habitat = deriveCoreEcologyPolarShoreHabitat({
    seed: SEED,
    region: REGION,
  });
  expect(habitat.totalPopulationUnits).toBeGreaterThan(0);
  return habitat;
}

function expectTideSafe(
  patch: ReturnType<typeof createCoreEcologyPolarShoreResidentPatch>,
) {
  const projection = projectCoreEcologyTidalTable(patch, patch.updatedAtTick);
  expect(projection).not.toBeNull();
  expect(projection!.tide.level).toBe(tideAtTick(patch.updatedAtTick).level);
  const aggregate = patch.aggregatePopulations[0];
  expect(aggregate).toBeDefined();
  for (const depth of projection!.anchorDepths.filter(
    ({ aggregateId }) => aggregateId === aggregate!.aggregateId,
  )) {
    if ((aggregate!.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0) {
      expect(depth.activityUsable).toBe(true);
    }
  }
}

function continuouslyStepAutonomy(
  initial: ReturnType<typeof createCoreEcologyPolarShoreResidentPatch>,
  targetTick: number,
) {
  let patch = initial;
  for (let tick = patch.updatedAtTick + 1; tick <= targetTick; tick += 1) {
    const clocked = stepCoreEcologyAggregatePatch(patch, {
      tick,
      actorSteps: [],
    });
    if (clocked === null) throw new Error("Continuous ecology clock failed");
    const tidal = stepCoreEcologyTidalTable(clocked.patch, { atTick: tick });
    if (tidal === null) throw new Error("Continuous tidal step failed");
    const smallWorld = stepCoreEcologySmallWorld(tidal.patch, tick);
    if (smallWorld === null)
      throw new Error("Continuous small-world step failed");
    patch = smallWorld.patch;
  }
  return patch;
}

describe(`${ALPHA34_POLAR_SHORE_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT} patch adapter`, () => {
  it("creates exactly one conserved non-addressable school and zero actor-shaped state", () => {
    const habitat = admittedHabitat();
    const patch = createCoreEcologyPolarShoreResidentPatch({
      seed: SEED,
      habitat,
      tick: 0,
    });
    expect(patch.populations).toEqual([]);
    expect(patch.groups.groups).toEqual([]);
    expect(patch.aggregatePopulations).toHaveLength(1);
    const school = patch.aggregatePopulations[0]!;
    expect(school.species).toBe("atlantic-capelin");
    expect(school.populationSize).toBe(habitat.totalPopulationUnits);
    expect(
      school.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0),
    ).toBe(school.populationSize);
    expect(patch.mortalityTransactions).toEqual([]);
    expect(patch.carcasses).toEqual([]);
    expect(patch.nextMortalityOrdinal).toBe(0);
    expect(
      canonicalCoreEcologyPolarShoreResidentPatch(patch, {
        seed: SEED,
        region: REGION,
        completedTick: 0,
      }),
    ).toBe(patch);
    expectTideSafe(patch);
    expect(stableStringify(patch)).not.toMatch(
      /materializedActor|capture|reproduction|voice|snow|ice|polar-bear/u,
    );
  });

  it("uses shared tide policy to keep fresh and re-entered occupancy safe without changing units", () => {
    const habitat = admittedHabitat();
    for (const tick of [0, 90, 180, 270, 360, 540]) {
      const fresh = createCoreEcologyPolarShoreResidentPatch({
        seed: SEED,
        habitat,
        tick,
      });
      expect(fresh.aggregatePopulations[0]!.populationSize).toBe(
        habitat.totalPopulationUnits,
      );
      expectTideSafe(fresh);
    }
    const original = createCoreEcologyPolarShoreResidentPatch({
      seed: SEED,
      habitat,
      tick: 0,
    });
    const populationSize = original.aggregatePopulations[0]!.populationSize;
    let current = original;
    for (const tick of [180, 360, 540, 720, 1_080]) {
      const next = reconcileCoreEcologyPolarShoreResidentPatchAtTick(
        current,
        tick,
      );
      expect(next).not.toBeNull();
      current = next!;
      expect(current.aggregatePopulations[0]!.populationSize).toBe(
        populationSize,
      );
      expect(
        current.aggregatePopulations[0]!.anchors.reduce(
          (sum, anchor) => sum + anchor.populationUnits,
          0,
        ),
      ).toBe(populationSize);
      expect(current.populations).toEqual([]);
      expect(current.mortalityTransactions).toEqual([]);
      expect(current.carcasses).toEqual([]);
      expectTideSafe(current);
    }
  });

  it("makes dormant replay byte-identical to continuous tide history across cycles", () => {
    const initial = createCoreEcologyPolarShoreResidentPatch({
      seed: SEED,
      habitat: admittedHabitat(),
      tick: 0,
    });
    for (const targetTick of [360, 2_160]) {
      const continuous = continuouslyStepAutonomy(initial, targetTick);
      const dormant = reconcileCoreEcologyPolarShoreResidentPatchAtTick(
        initial,
        targetTick,
      );
      expect(dormant).not.toBeNull();
      expect(stableStringify(dormant)).toBe(stableStringify(continuous));
      expect(dormant!.aggregatePopulations[0]).toMatchObject({
        anchors: continuous.aggregatePopulations[0]!.anchors,
        evidence: continuous.aggregatePopulations[0]!.evidence,
        disturbances: continuous.aggregatePopulations[0]!.disturbances,
        lastTidalRedistributionTick:
          continuous.aggregatePopulations[0]!.lastTidalRedistributionTick,
        nextEvidenceOrdinal:
          continuous.aggregatePopulations[0]!.nextEvidenceOrdinal,
        nextDisturbanceOrdinal:
          continuous.aggregatePopulations[0]!.nextDisturbanceOrdinal,
      });
    }
  });

  it("compacts a billion-tick dormant interval independently of raw elapsed time", () => {
    const initial = createCoreEcologyPolarShoreResidentPatch({
      seed: SEED,
      habitat: admittedHabitat(),
      tick: 0,
    });
    const startedAt = performance.now();
    const dormant = reconcileCoreEcologyPolarShoreResidentPatchAtTick(
      initial,
      1_000_000_000,
    );
    const elapsedMilliseconds = performance.now() - startedAt;
    expect(dormant).not.toBeNull();
    expect(elapsedMilliseconds).toBeLessThan(2_000);
    const school = dormant!.aggregatePopulations[0]!;
    expect(dormant!.updatedAtTick).toBe(1_000_000_000);
    expect(
      school.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0),
    ).toBe(school.populationSize);
    expect(school.evidence.length).toBeLessThanOrEqual(
      CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
    );
    expect(school.disturbances.length).toBeLessThanOrEqual(
      CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
    );
    expectTideSafe(dormant!);
  });

  it("deduplicates caller regions, omits absent habitat, and reports physical anchor residence", () => {
    const set = deriveCoreEcologyPolarShoreResidentSet({
      seed: SEED,
      regions: [ABSENT_REGION, REGION, REGION, ABSENT_REGION],
      tick: 360,
    });
    expect(set.ownerId).toBe(CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_OWNER_ID);
    expect(set.residents).toHaveLength(1);
    expect(set.residents[0]?.region).toEqual(REGION);
    expect(
      coreEcologyPolarShoreResidentPatchResidenceRegions(
        set.residents[0]!.patch,
      ),
    ).toEqual([REGION]);
    expectTideSafe(set.residents[0]!.patch);
  });
});
