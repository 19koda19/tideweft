import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  displaceCoreEcologyAggregatePopulation,
  stepCoreEcologyAggregatePatch,
} from "./coreEcology";
import { stepCoreEcologySmallWorld } from "./coreEcologySmallWorld";
import {
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import {
  deriveCoreEcologyPolarShoreHabitat,
  deriveCoreEcologyPolarShoreTerritory,
} from "./coreEcologyPolarShoreHabitat";
import {
  advanceRegionalPolarShoreEcologyRoot,
  canonicalRegionalPolarShoreEcologyRootForWorld,
  canonicalizeRegionalPolarShoreEcologyRoot,
  createPristineRegionalPolarShoreEcologyRoot,
  deserializeRegionalPolarShoreEcologyRoot,
  putRegionalPolarShoreEcologyResidentDeviation,
  regionalPolarShoreEcologyResidentPatchForRegion,
  regionalPolarShoreEcologyResidentsForActiveRegions,
  serializeRegionalPolarShoreEcologyRoot,
  type RegionalPolarShoreEcologyRootV1,
} from "./regionalPolarShoreEcology";
import { createCoreEcologyPolarShoreResidentPatch } from "./regionalPolarShoreResidents";

export const ALPHA34_POLAR_SHORE_ROOT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha34-polar-shore-root-shared-invariants:v1" as const;

const SEED = seedFromText("polar habitat fuzz 29");
const REGION = createRegionCoord(-1653, 664);
const ABSENT_REGION = createRegionCoord(4_033, -329);

function habitat() {
  const result = deriveCoreEcologyPolarShoreHabitat({
    seed: SEED,
    region: REGION,
  });
  expect(result.totalPopulationUnits).toBeGreaterThan(0);
  return result;
}

function expectTideSafe(
  patch: NonNullable<
    ReturnType<typeof regionalPolarShoreEcologyResidentPatchForRegion>
  >,
) {
  const projection = projectCoreEcologyTidalTable(patch, patch.updatedAtTick);
  expect(projection).not.toBeNull();
  const aggregate = patch.aggregatePopulations[0]!;
  for (const depth of projection!.anchorDepths.filter(
    ({ aggregateId }) => aggregateId === aggregate.aggregateId,
  )) {
    if ((aggregate.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0) {
      expect(depth.activityUsable).toBe(true);
    }
  }
}

describe(`${ALPHA34_POLAR_SHORE_ROOT_SHARED_INVARIANTS_OWNER_INTENT} sparse root`, () => {
  it("round-trips one world-bound sparse root and rejects forged or foreign authority", () => {
    const root = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 360,
    });
    expect(root.regions).toEqual([]);
    const text = serializeRegionalPolarShoreEcologyRoot(root);
    expect(deserializeRegionalPolarShoreEcologyRoot(text)).toEqual(root);
    expect(
      canonicalRegionalPolarShoreEcologyRootForWorld(root, {
        rootSeed: SEED,
        completedTick: 360,
      }),
    ).toBe(root);
    expect(
      canonicalRegionalPolarShoreEcologyRootForWorld(root, {
        rootSeed: seedFromText("foreign polar root"),
        completedTick: 360,
      }),
    ).toBeNull();
    const forged: RegionalPolarShoreEcologyRootV1 = { ...root, revision: 1 };
    expect(canonicalizeRegionalPolarShoreEcologyRoot(forged)).toBeNull();
  });

  it("rederives present baselines, keeps honest absence null, and never stores pristine visits", () => {
    const root = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 360,
    });
    const patch = regionalPolarShoreEcologyResidentPatchForRegion(
      root,
      SEED,
      REGION,
    );
    expect(patch).not.toBeNull();
    expectTideSafe(patch!);
    expect(
      regionalPolarShoreEcologyResidentPatchForRegion(
        root,
        SEED,
        ABSENT_REGION,
      ),
    ).toBeNull();
    const unchanged = putRegionalPolarShoreEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: patch!,
    });
    expect(unchanged).toBe(root);
    expect(unchanged.regions).toEqual([]);
  });

  it("does not persist a continuously evolved one-tick pristine school", () => {
    const initialRoot = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const initialPatch = createCoreEcologyPolarShoreResidentPatch({
      seed: SEED,
      habitat: habitat(),
      tick: 0,
    });
    const clocked = stepCoreEcologyAggregatePatch(initialPatch, {
      tick: 1,
      actorSteps: [],
    });
    expect(clocked).not.toBeNull();
    const tidal = stepCoreEcologyTidalTable(clocked!.patch, { atTick: 1 });
    expect(tidal).not.toBeNull();
    const autonomous = stepCoreEcologySmallWorld(tidal!.patch, 1);
    expect(autonomous).not.toBeNull();
    const root = advanceRegionalPolarShoreEcologyRoot(initialRoot, 1);
    const unchanged = putRegionalPolarShoreEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: autonomous!.patch,
    });
    expect(unchanged).toBe(root);
    expect(unchanged.regions).toEqual([]);
    expect(stableStringify(autonomous!.patch)).toBe(
      stableStringify(
        createCoreEcologyPolarShoreResidentPatch({
          seed: SEED,
          habitat: habitat(),
          tick: 1,
        }),
      ),
    );
  });

  it("keeps broad pristine non-host exploration root-empty and cheaply prefiltered", () => {
    const root = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 360,
    });
    const sourceBytes = serializeRegionalPolarShoreEcologyRoot(root);
    const nonHosts = Array.from({ length: 512 }, (_, ordinal) =>
      createRegionCoord(-50_000 + ordinal * 17, 40_000 - ordinal * 29),
    ).filter(
      (region) =>
        !deriveCoreEcologyPolarShoreTerritory(SEED, region).regionIsHost,
    );
    expect(nonHosts.length).toBeGreaterThan(300);
    const startedAt = performance.now();
    for (const region of nonHosts) {
      expect(
        regionalPolarShoreEcologyResidentsForActiveRegions(root, SEED, [
          region,
        ]),
      ).toEqual([]);
    }
    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(root.regions).toEqual([]);
    expect(serializeRegionalPolarShoreEcologyRoot(root)).toBe(sourceBytes);
  });

  it("never reconciles an inactive dormant delta while selecting active origin keys", () => {
    const initial = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 360,
    });
    const pristine = createCoreEcologyPolarShoreResidentPatch({
      seed: SEED,
      habitat: habitat(),
      tick: 360,
    });
    const school = pristine.aggregatePopulations[0]!;
    const from = school.anchors.find(
      ({ populationUnits }) => populationUnits > 0,
    )!;
    const to = school.anchors.find(
      ({ anchorOrdinal }) => anchorOrdinal !== from.anchorOrdinal,
    )!;
    const moved = displaceCoreEcologyAggregatePopulation(pristine, {
      aggregateId: school.aggregateId,
      atTick: 360,
      causeKind: "human-disturbance",
      causeReferenceId: "alpha34-inactive-delta",
      fromAnchorOrdinal: from.anchorOrdinal,
      toAnchorOrdinal: to.anchorOrdinal,
      populationUnits: 1,
      pressure: 200_000,
    });
    expect(moved).not.toBeNull();
    const stored = putRegionalPolarShoreEcologyResidentDeviation(initial, {
      rootSeed: SEED,
      patch: moved!.patch,
    });
    const dormant = advanceRegionalPolarShoreEcologyRoot(stored, 1_000_000_000);
    const sourceBytes = serializeRegionalPolarShoreEcologyRoot(dormant);
    const nonHosts = Array.from({ length: 32 }, (_, ordinal) =>
      createRegionCoord(100_000 + ordinal * 37, -90_000 - ordinal * 41),
    ).filter(
      (region) =>
        !deriveCoreEcologyPolarShoreTerritory(SEED, region).regionIsHost,
    );
    expect(nonHosts.length).toBeGreaterThan(16);
    const startedAt = performance.now();
    for (const region of nonHosts) {
      expect(
        regionalPolarShoreEcologyResidentsForActiveRegions(dormant, SEED, [
          region,
        ]),
      ).toEqual([]);
    }
    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(dormant.regions[0]!.residentPatch.updatedAtTick).toBe(360);
    expect(serializeRegionalPolarShoreEcologyRoot(dormant)).toBe(sourceBytes);
  });

  it("persists one conserved deviation and reconciles it to current tide on re-entry", () => {
    const root = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 360,
    });
    const pristine = createCoreEcologyPolarShoreResidentPatch({
      seed: SEED,
      habitat: habitat(),
      tick: 360,
    });
    const school = pristine.aggregatePopulations[0]!;
    const from = school.anchors.find(
      ({ populationUnits }) => populationUnits > 0,
    )!;
    const to = school.anchors.find(
      ({ anchorOrdinal }) => anchorOrdinal !== from.anchorOrdinal,
    )!;
    const moved = displaceCoreEcologyAggregatePopulation(pristine, {
      aggregateId: school.aggregateId,
      atTick: 360,
      causeKind: "human-disturbance",
      causeReferenceId: "alpha34-test-observation",
      fromAnchorOrdinal: from.anchorOrdinal,
      toAnchorOrdinal: to.anchorOrdinal,
      populationUnits: 1,
      pressure: 200_000,
    });
    expect(moved).not.toBeNull();
    const stored = putRegionalPolarShoreEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: moved!.patch,
    });
    expect(stored.regions).toHaveLength(1);
    const restored = deserializeRegionalPolarShoreEcologyRoot(
      serializeRegionalPolarShoreEcologyRoot(stored),
    );
    expect(restored).not.toBeNull();
    const later = advanceRegionalPolarShoreEcologyRoot(restored, 720);
    const reentered = regionalPolarShoreEcologyResidentPatchForRegion(
      later,
      SEED,
      REGION,
    );
    expect(reentered).not.toBeNull();
    expect(reentered!.aggregatePopulations[0]!.populationSize).toBe(
      school.populationSize,
    );
    expect(
      reentered!.aggregatePopulations[0]!.anchors.reduce(
        (sum, anchor) => sum + anchor.populationUnits,
        0,
      ),
    ).toBe(school.populationSize);
    expect(reentered!.populations).toEqual([]);
    expect(reentered!.mortalityTransactions).toEqual([]);
    expect(reentered!.carcasses).toEqual([]);
    expectTideSafe(reentered!);

    const active = regionalPolarShoreEcologyResidentsForActiveRegions(
      later,
      SEED,
      [REGION, REGION],
    );
    expect(active).not.toBeNull();
    expect(active).toHaveLength(1);
    expect(active![0]!.sourceKey).toBe(reentered!.patchKey);
    expect(stableStringify(active![0]!.patch)).toBe(stableStringify(reentered));
  });
});
