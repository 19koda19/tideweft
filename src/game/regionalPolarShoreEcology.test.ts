import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
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
  REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID,
  advanceRegionalPolarShoreEcologyRoot,
  advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt,
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
const BATCH_UPDATE_REGION = createRegionCoord(-1_981, -2_000);
const BATCH_REMOVE_REGION = createRegionCoord(-1_871, -2_000);
const BATCH_ADD_REGION = createRegionCoord(-1_720, -2_000);
const BATCH_NOOP_REGION = createRegionCoord(-1_684, -2_000);

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

function polarPatch(
  region: ReturnType<typeof createRegionCoord>,
  tick = 360,
) {
  const derived = deriveCoreEcologyPolarShoreHabitat({ seed: SEED, region });
  if (derived.totalPopulationUnits === 0) {
    throw new Error(`Polar receipt fixture ${region.x}:${region.y} is absent`);
  }
  return createCoreEcologyPolarShoreResidentPatch({
    seed: SEED,
    habitat: derived,
    tick,
  });
}

function displacePolarPatch(
  patch: ReturnType<typeof polarPatch>,
  causeReferenceId: string,
) {
  const school = patch.aggregatePopulations[0];
  const from = school?.anchors.find(({ populationUnits }) => populationUnits > 0);
  const to = school?.anchors.find(({ anchorOrdinal }) => (
    anchorOrdinal !== from?.anchorOrdinal
  ));
  if (school === undefined || from === undefined || to === undefined) {
    throw new Error("Polar receipt fixture needs two aggregate anchors");
  }
  const displaced = displaceCoreEcologyAggregatePopulation(patch, {
    aggregateId: school.aggregateId,
    atTick: patch.updatedAtTick,
    causeKind: "human-disturbance",
    causeReferenceId,
    fromAnchorOrdinal: from.anchorOrdinal,
    toAnchorOrdinal: to.anchorOrdinal,
    populationUnits: 1,
    pressure: 200_000,
  });
  if (displaced === null) {
    throw new Error("Polar receipt fixture displacement failed");
  }
  return displaced.patch;
}

function polarActiveResidentClaims(
  residents: NonNullable<ReturnType<
    typeof regionalPolarShoreEcologyResidentsForActiveRegions
  >>,
) {
  return residents.map(({ patch, sourceKey }) => ({
    sourceKey,
    region: patch.originRegion,
    patchHash: hashCanonical(patch),
    lineageHash: hashCanonical({
      patchKey: patch.patchKey,
      originRegion: patch.originRegion,
      derivation: patch.derivation,
      populations: patch.populations.map(({
        species,
        populationKey,
        baselinePopulationSize,
      }) => ({ species, populationKey, baselinePopulationSize })),
      actorIds: patch.populations.flatMap(({ members }) => (
        members.map(({ actor }) => actor.identity.stableId)
      )).sort(compareText),
      groupIds: patch.groups.groups.map(({ identity }) => identity.stableId)
        .sort(compareText),
      aggregates: patch.aggregatePopulations.map(({
        aggregateId,
        species,
        populationKey,
        habitatCapacity,
      }) => ({ aggregateId, species, populationKey, habitatCapacity })),
    }),
  }));
}

function withSimulatedClockBudgetEdge(
  ownerId: string,
  maximumBytes: number,
  sourceTick: number,
  targetTick: number,
  run: () => void,
) {
  const originalEncode = TextEncoder.prototype.encode;
  TextEncoder.prototype.encode = function encode(value = "") {
    if (value.includes(`"ownerId":"${ownerId}"`)) {
      const root = JSON.parse(value) as Readonly<{
        ownerId?: unknown;
        regions?: unknown;
        updatedAtTick?: unknown;
      }>;
      if (
        root.ownerId === ownerId
        && Array.isArray(root.regions)
        && root.regions.length > 0
        && (root.updatedAtTick === sourceTick || root.updatedAtTick === targetTick)
      ) {
        return {
          byteLength: maximumBytes + (root.updatedAtTick === targetTick ? 1 : 0),
        } as unknown as Uint8Array<ArrayBuffer>;
      }
    }
    return originalEncode.call(this, value);
  };
  try {
    run();
  } finally {
    TextEncoder.prototype.encode = originalEncode;
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

  it("advances an exact active receipt byte-identically to full common-tick derivation", () => {
    const root = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 360,
    });
    const prior = regionalPolarShoreEcologyResidentsForActiveRegions(
      root,
      SEED,
      [REGION],
    );
    if (prior === null) throw new Error("Polar receipt fixture did not derive");

    const completedTick = 720;
    const fast = advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      rootSeed: SEED,
      completedTick,
      activeRegions: [REGION],
      expectedResidents: polarActiveResidentClaims(prior),
      durableResidents: [],
    });
    const oracleRoot = advanceRegionalPolarShoreEcologyRoot(root, completedTick);
    const oracleResidents = regionalPolarShoreEcologyResidentsForActiveRegions(
      oracleRoot,
      SEED,
      [REGION],
    );

    expect(fast).not.toBeNull();
    expect(oracleResidents).not.toBeNull();
    expect(serializeRegionalPolarShoreEcologyRoot(fast?.root))
      .toBe(serializeRegionalPolarShoreEcologyRoot(oracleRoot));
    expect(stableStringify(fast?.residents)).toBe(stableStringify(oracleResidents));
  });

  it("rejects a removal batch when scalar clock advance alone crosses the save budget", () => {
    const sourceTick = 999;
    const targetTick = 1_000;
    const pristineAtSource = polarPatch(REGION, sourceTick);
    const root = putRegionalPolarShoreEcologyResidentDeviation(
      createPristineRegionalPolarShoreEcologyRoot({
        rootSeed: SEED,
        completedTick: sourceTick,
      }),
      {
        rootSeed: SEED,
        patch: displacePolarPatch(pristineAtSource, "alpha34-clock-budget"),
      },
    );
    const prior = regionalPolarShoreEcologyResidentsForActiveRegions(
      root,
      SEED,
      [REGION],
    );
    if (prior === null || prior.length !== 1) {
      throw new Error("Polar clock-budget fixture did not derive");
    }

    withSimulatedClockBudgetEdge(
      REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID,
      REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
      sourceTick,
      targetTick,
      () => {
        expect(() => advanceRegionalPolarShoreEcologyRoot(root, targetTick)).toThrow();
        const shrinkFirst = putRegionalPolarShoreEcologyResidentDeviation(root, {
          rootSeed: SEED,
          patch: pristineAtSource,
        });
        expect(advanceRegionalPolarShoreEcologyRoot(shrinkFirst, targetTick).regions)
          .toEqual([]);
        expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
          rootSeed: SEED,
          completedTick: targetTick,
          activeRegions: [REGION],
          expectedResidents: polarActiveResidentClaims(prior),
          durableResidents: [{
            sourceKey: prior[0]!.sourceKey,
            patch: polarPatch(REGION, targetTick),
          }],
        })).toBeNull();
      },
    );
  });

  it("batches source-ordered add, update, removal, and no-op exactly like scalar puts", () => {
    const activeRegions = [
      BATCH_UPDATE_REGION,
      BATCH_REMOVE_REGION,
      BATCH_ADD_REGION,
      BATCH_NOOP_REGION,
    ] as const;
    const pristineRoot = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 360,
    });
    const pristineResidents = regionalPolarShoreEcologyResidentsForActiveRegions(
      pristineRoot,
      SEED,
      activeRegions,
    );
    if (pristineResidents === null || pristineResidents.length !== activeRegions.length) {
      throw new Error("Polar durable batch fixture did not derive four sources");
    }
    const pristineByRegion = new Map(pristineResidents.map((resident) => [
      `${resident.patch.originRegion.x}:${resident.patch.originRegion.y}`,
      resident,
    ]));
    const residentAt = (region: ReturnType<typeof createRegionCoord>) => {
      const resident = pristineByRegion.get(`${region.x}:${region.y}`);
      if (resident === undefined) throw new Error("Polar durable batch source is absent");
      return resident;
    };
    const updatedSource = residentAt(BATCH_UPDATE_REGION);
    const removedSource = residentAt(BATCH_REMOVE_REGION);
    const addedSource = residentAt(BATCH_ADD_REGION);
    const noopSource = residentAt(BATCH_NOOP_REGION);

    let existingRoot = pristineRoot;
    for (const [ordinal, source] of [updatedSource, removedSource].entries()) {
      existingRoot = putRegionalPolarShoreEcologyResidentDeviation(existingRoot, {
        rootSeed: SEED,
        patch: displacePolarPatch(source.patch, `alpha34-batch-existing-${ordinal}`),
      });
    }
    const currentResidents = regionalPolarShoreEcologyResidentsForActiveRegions(
      existingRoot,
      SEED,
      activeRegions,
    );
    if (currentResidents === null || currentResidents.length !== activeRegions.length) {
      throw new Error("Polar durable batch receipt did not derive");
    }
    const currentBySource = new Map(currentResidents.map((resident) => [
      resident.sourceKey,
      resident,
    ]));
    const currentUpdated = currentBySource.get(updatedSource.sourceKey);
    if (currentUpdated === undefined) {
      throw new Error("Polar durable batch lost its update source");
    }
    const durableResidents = [
      {
        sourceKey: updatedSource.sourceKey,
        patch: displacePolarPatch(currentUpdated.patch, "alpha34-batch-update"),
      },
      {
        sourceKey: removedSource.sourceKey,
        patch: removedSource.patch,
      },
      {
        sourceKey: addedSource.sourceKey,
        patch: displacePolarPatch(addedSource.patch, "alpha34-batch-add"),
      },
      {
        sourceKey: noopSource.sourceKey,
        patch: noopSource.patch,
      },
    ];
    const baseInput = {
      rootSeed: SEED,
      completedTick: 360,
      activeRegions,
      expectedResidents: polarActiveResidentClaims(currentResidents),
    } as const;
    const forward = advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(
      existingRoot,
      { ...baseInput, durableResidents },
    );
    const reversed = advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(
      existingRoot,
      { ...baseInput, durableResidents: [...durableResidents].reverse() },
    );

    let oracleRoot = advanceRegionalPolarShoreEcologyRoot(existingRoot, 360);
    for (const resident of [...durableResidents].sort((left, right) => (
      compareText(left.sourceKey, right.sourceKey)
    ))) {
      oracleRoot = putRegionalPolarShoreEcologyResidentDeviation(oracleRoot, {
        rootSeed: SEED,
        patch: resident.patch,
      });
    }
    const oracleResidents = regionalPolarShoreEcologyResidentsForActiveRegions(
      oracleRoot,
      SEED,
      activeRegions,
    );
    if (forward === null || reversed === null || oracleResidents === null) {
      throw new Error("Polar durable batch failed its scalar oracle");
    }

    expect(serializeRegionalPolarShoreEcologyRoot(forward.root))
      .toBe(serializeRegionalPolarShoreEcologyRoot(oracleRoot));
    expect(serializeRegionalPolarShoreEcologyRoot(reversed.root))
      .toBe(serializeRegionalPolarShoreEcologyRoot(oracleRoot));
    expect(stableStringify(forward.residents)).toBe(stableStringify(oracleResidents));
    expect(stableStringify(reversed.residents)).toBe(stableStringify(oracleResidents));
    expect(forward.root.revision).toBe(existingRoot.revision + 3);
    expect(forward.root.lastEventOrdinal).toBe(existingRoot.lastEventOrdinal + 3);
    expect(forward.root.regions.find(({ residentPatch }) => (
      residentPatch.patchKey === updatedSource.sourceKey
    ))?.revision).toBe(2);
    expect(forward.root.regions.some(({ residentPatch }) => (
      residentPatch.patchKey === removedSource.sourceKey
    ))).toBe(false);
    expect(forward.root.regions.find(({ residentPatch }) => (
      residentPatch.patchKey === addedSource.sourceKey
    ))?.revision).toBe(1);
    expect(forward.root.regions.some(({ residentPatch }) => (
      residentPatch.patchKey === noopSource.sourceKey
    ))).toBe(false);
    expect(forward.root.regions.map(({ key, revision, eventOrdinal }) => ({
      key,
      revision,
      eventOrdinal,
    }))).toEqual(oracleRoot.regions.map(({ key, revision, eventOrdinal }) => ({
      key,
      revision,
      eventOrdinal,
    })));
  });

  it("fails receipt custody closed and leaves changed-window entry and departure to full derivation", () => {
    const root = createPristineRegionalPolarShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 360,
    });
    const oldWindow = [BATCH_UPDATE_REGION, BATCH_REMOVE_REGION] as const;
    const newWindow = [BATCH_ADD_REGION, BATCH_NOOP_REGION] as const;
    const prior = regionalPolarShoreEcologyResidentsForActiveRegions(
      root,
      SEED,
      oldWindow,
    );
    if (prior === null || prior.length !== oldWindow.length) {
      throw new Error("Polar custody fixture did not derive");
    }
    const claims = polarActiveResidentClaims(prior);
    const input = {
      rootSeed: SEED,
      completedTick: 361,
      activeRegions: oldWindow,
      expectedResidents: claims,
      durableResidents: [],
    } as const;

    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(
      structuredClone(root),
      input,
    )).toBeNull();
    const restored = deserializeRegionalPolarShoreEcologyRoot(
      serializeRegionalPolarShoreEcologyRoot(root),
    );
    expect(restored).not.toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(
      restored,
      input,
    )).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(
      createPristineRegionalPolarShoreEcologyRoot({
        rootSeed: SEED,
        completedTick: 360,
      }),
      input,
    )).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      ...input,
      rootSeed: seedFromText("foreign polar receipt seed"),
    })).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      ...input,
      completedTick: 359,
    })).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      ...input,
      activeRegions: newWindow,
    })).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.slice(1),
    })).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, sourceKey: `${claim.sourceKey}:forged` }
        : claim),
    })).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, region: ABSENT_REGION }
        : claim),
    })).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, patchHash: hashCanonical("forged polar patch") }
        : claim),
    })).toBeNull();
    expect(advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, lineageHash: hashCanonical("forged polar lineage") }
        : claim),
    })).toBeNull();

    const fallbackRoot = advanceRegionalPolarShoreEcologyRoot(root, input.completedTick);
    const entered = regionalPolarShoreEcologyResidentsForActiveRegions(
      fallbackRoot,
      SEED,
      newWindow,
    );
    const departed = regionalPolarShoreEcologyResidentsForActiveRegions(
      fallbackRoot,
      SEED,
      oldWindow,
    );
    expect(entered).not.toBeNull();
    expect(departed).not.toBeNull();
    expect(entered?.map(({ sourceKey }) => sourceKey))
      .not.toEqual(departed?.map(({ sourceKey }) => sourceKey));
    const fallbackClone = deserializeRegionalPolarShoreEcologyRoot(
      serializeRegionalPolarShoreEcologyRoot(fallbackRoot),
    );
    expect(stableStringify(regionalPolarShoreEcologyResidentsForActiveRegions(
      fallbackClone,
      SEED,
      newWindow,
    ))).toBe(stableStringify(entered));
  });
});
