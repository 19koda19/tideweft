import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import { WORLD_NEW_GAME_START_TICK } from "../sim/worldTime";
import { replaceCoreEcologyAggregatePatchActor } from "./coreEcology";
import {
  CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
  CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
  deriveCoreEcologyBreadthHabitat,
} from "./coreEcologyBreadthHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID,
  REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID,
  REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
  activateRegionalBreadthEcologyThroughEpoch,
  advanceRegionalBreadthEcologyActiveResidentsFromReceipt,
  advanceRegionalBreadthEcologyRoot,
  canonicalRegionalBreadthEcologyRootForWorld,
  canonicalizeRegionalBreadthEcologyRoot,
  consumeRegionalBreadthEcologyAdvanceResultReceipt,
  createPristineRegionalBreadthEcologyRoot,
  createRegionalBreadthEcologyRegionDelta,
  deserializeRegionalBreadthEcologyRoot,
  putRegionalBreadthEcologyResidentDeviation,
  regionalBreadthEcologyResidentPatchForRegion,
  regionalBreadthEcologyResidentsForActiveRegions,
  serializeRegionalBreadthEcologyRoot,
  type RegionalBreadthEcologyRootV1,
} from "./regionalBreadthEcology";
import { createCoreEcologyBreadthResidentPatch } from "./regionalBreadthCohort";
import { createWorldPosition } from "./worldPosition";

export const ALPHA37_ESTUARY_BREADTH_ROOT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha37-estuary-breadth-root-shared-invariants:v1" as const;
export const ALPHA38_MARSH_CHANNEL_WEB_ROOT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha38-marsh-channel-web-root-shared-invariants:v1" as const;

const SEED = seedFromText("alpha37 estuary breadth shared properties");
const FOREIGN_SEED = seedFromText("alpha37 foreign breadth root");
const COHORT = CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID;
const TIDAL_FLOCK_REGION = createRegionCoord(-5_179, -89_646);
const HERON_REGION = createRegionCoord(1_050, 38_043);
const THIRD_INDIVIDUAL_REGION = createRegionCoord(-60, -100);
const FOURTH_INDIVIDUAL_REGION = createRegionCoord(-192_134, -225_672);
const ABSENT_REGION = createRegionCoord(-1, -1);
const DESTINATION = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);

function heronHabitat() {
  const habitat = deriveCoreEcologyBreadthHabitat({
    seed: SEED,
    region: HERON_REGION,
    cohortId: COHORT,
  });
  expect(habitat.populations.find(({ species }) => (
    species === "great-blue-heron"
  ))?.populationUnits).toBe(1);
  return habitat;
}

function heronPatch(tick = 0, baselineTick = 0) {
  return createCoreEcologyBreadthResidentPatch({
    seed: SEED,
    habitat: heronHabitat(),
    tick,
    baselineTick,
  });
}

function movedHeronPatch() {
  const patch = heronPatch();
  const actor = patch.populations.find(
    ({ species }) => species === "great-blue-heron",
  )!.members[0]!.actor;
  return replaceCoreEcologyAggregatePatchActor(
    patch,
    repositionCoreWildlifeActor(actor, {
      atTick: 0,
      position: createWorldPosition(DESTINATION, 1_000, 2_000),
      heading: 875_000,
    }),
  );
}

function rotateFirstActor(
  patch: ReturnType<typeof heronPatch>,
  headingDelta: number,
) {
  const actor = patch.populations.flatMap(({ members }) => members)[0]?.actor;
  if (actor === undefined) {
    throw new Error("Durable breadth fixture needs one individual actor");
  }
  return replaceCoreEcologyAggregatePatchActor(
    patch,
    repositionCoreWildlifeActor(actor, {
      atTick: patch.updatedAtTick,
      position: actor.address.position,
      heading: (actor.address.heading + headingDelta) % 1_000_000,
    }),
  );
}

function reseal<T extends Record<string, unknown>>(value: T) {
  const { integrity: _integrity, ...base } = value;
  return { ...base, integrity: hashCanonical(base) };
}

function activeResidentClaims(
  residents: NonNullable<ReturnType<
    typeof regionalBreadthEcologyResidentsForActiveRegions
  >>,
) {
  return residents.map(({ cohortEpoch, cohortId, patch, sourceKey }) => ({
    sourceKey,
    cohortId,
    cohortEpoch,
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
      groups: patch.groups.groups.map(({ identity, memberOrdinals }) => ({
        identity,
        memberOrdinals,
      })),
      aggregates: patch.aggregatePopulations.map(({
        aggregateId,
        species,
        populationKey,
        habitatCapacity,
        anchors,
      }) => ({
        aggregateId,
        species,
        populationKey,
        habitatCapacity,
        anchorOrdinals: anchors.map(({ anchorOrdinal }) => anchorOrdinal),
      })),
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

function withSimulatedPreparedRootSealedBytes<T>(
  ownerId: string,
  completedTick: number,
  sealedBytes: number,
  run: () => T,
): T {
  const originalEncode = TextEncoder.prototype.encode;
  const integrityMemberBytes = originalEncode.call(
    new TextEncoder(),
    `,"integrity":"${"0".repeat(16)}"`,
  ).byteLength;
  TextEncoder.prototype.encode = function encode(value = "") {
    if (value.includes(`"ownerId":"${ownerId}"`)) {
      const root = JSON.parse(value) as Readonly<{
        integrity?: unknown;
        ownerId?: unknown;
        regions?: unknown;
        updatedAtTick?: unknown;
      }>;
      if (
        !Object.hasOwn(root, "integrity")
        && root.ownerId === ownerId
        && Array.isArray(root.regions)
        && root.regions.length > 0
        && root.updatedAtTick === completedTick
      ) {
        return {
          byteLength: sealedBytes - integrityMemberBytes,
        } as unknown as Uint8Array<ArrayBuffer>;
      }
    }
    return originalEncode.call(this, value);
  };
  try {
    return run();
  } finally {
    TextEncoder.prototype.encode = originalEncode;
  }
}

describe(`${ALPHA37_ESTUARY_BREADTH_ROOT_SHARED_INVARIANTS_OWNER_INTENT} ${ALPHA38_MARSH_CHANNEL_WEB_ROOT_SHARED_INVARIANTS_OWNER_INTENT} append-only sparse root`, () => {
  it("activates an append-only cohort epoch and round-trips one bounded world authority", () => {
    const empty = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 17,
    }, 0);
    expect(empty).toMatchObject({
      ownerId: REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
      activeThroughEpoch: 0,
      activations: [],
      regions: [],
      revision: 0,
    });
    const active = activateRegionalBreadthEcologyThroughEpoch(
      empty,
      { rootSeed: SEED, completedTick: 17 },
      CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
    );
    expect(active.activeThroughEpoch).toBe(CORE_ECOLOGY_BREADTH_CURRENT_EPOCH);
    expect(active.activations).toHaveLength(CORE_ECOLOGY_BREADTH_CURRENT_EPOCH);
    expect(active.activations[0]).toMatchObject({
      activationOrdinal: 0,
      activatedAtTick: 17,
      cohortId: COHORT,
      cohortEpoch: 1,
    });
    expect(active.activations.at(-1)).toMatchObject({
      activationOrdinal: CORE_ECOLOGY_BREADTH_CURRENT_EPOCH - 1,
      activatedAtTick: 17,
      cohortEpoch: CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
    });
    const text = serializeRegionalBreadthEcologyRoot(active);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(
      REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
    );
    const restored = deserializeRegionalBreadthEcologyRoot(text);
    expect(restored).toEqual(active);
    expect(canonicalRegionalBreadthEcologyRootForWorld(restored, {
      rootSeed: SEED,
      completedTick: 17,
    })).toBe(restored);
    expect(canonicalRegionalBreadthEcologyRootForWorld(restored, {
      rootSeed: FOREIGN_SEED,
      completedTick: 17,
    })).toBeNull();
  });

  it("rejects a fully resealed foreign activation identity at the world boundary", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    }, 1);
    const activation = root.activations[0]!;
    const forgedActivation = reseal({
      ...activation,
      stableId: `${activation.stableId}-foreign`,
    });
    const forged = reseal({
      ...root,
      activations: [forgedActivation],
    });
    expect(canonicalizeRegionalBreadthEcologyRoot(forged)).not.toBeNull();
    expect(canonicalRegionalBreadthEcologyRootForWorld(forged, {
      rootSeed: SEED,
      completedTick: 0,
    })).toBeNull();
  });

  it("rederives present and absent baselines without persisting mere visitation", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const present = regionalBreadthEcologyResidentPatchForRegion(
      root,
      SEED,
      COHORT,
      HERON_REGION,
    );
    expect(present).not.toBeNull();
    expect(regionalBreadthEcologyResidentPatchForRegion(
      root,
      SEED,
      COHORT,
      ABSENT_REGION,
    )).toBeNull();
    expect(putRegionalBreadthEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: present!,
    })).toBe(root);
    expect(root.regions).toEqual([]);
    expect(() => createRegionalBreadthEcologyRegionDelta({
      rootSeed: SEED,
      cohortId: COHORT,
      region: HERON_REGION,
      baselineHash: heronHabitat().derivationHash,
      revision: 1,
      eventOrdinal: 1,
      residentPatch: heronPatch(),
    })).toThrow(/does not persist pristine baselines/u);
  });

  it("preserves the released breadth-delta construction encoding", () => {
    const patch = rotateFirstActor(heronPatch(), 101);
    const delta = createRegionalBreadthEcologyRegionDelta({
      rootSeed: SEED,
      cohortId: COHORT,
      region: HERON_REGION,
      baselineHash: heronHabitat().derivationHash,
      revision: 1,
      eventOrdinal: 1,
      residentPatch: patch,
    });

    expect({
      stableId: delta.stableId,
      residentPatchHash: delta.residentPatchHash,
      integrity: delta.integrity,
      serializedHash: hashCanonical(delta),
    }).toEqual({
      stableId: "ro1:e6a006386020d7896edf1875a62f86b1:1050:38043:breadth-deviation:s:0065007300740075006100720079002d0073007500720066006100630065002d0062007200650061006b003a00650031",
      residentPatchHash: "4454d4bf9afa76dd",
      integrity: "b2439f4b2cfbb174",
      serializedHash: "f9c0ff1f519a2f82",
    });
  });

  it("starts new-policy cohorts at activation while legacy roots retain exact tick-zero replay", () => {
    const startTick = WORLD_NEW_GAME_START_TICK;
    const habitat = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region: TIDAL_FLOCK_REGION,
      cohortId: COHORT,
    });
    expect(habitat.populations.some(({ species, populationUnits }) => (
      species === "common-tern" && populationUnits > 0
    ))).toBe(true);

    const fresh = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: startTick,
    });
    expect(fresh.baselinePolicyId).toBe(
      REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID,
    );
    expect(fresh.activations.every(({ activatedAtTick }) => (
      activatedAtTick === startTick
    ))).toBe(true);
    const freshPatch = regionalBreadthEcologyResidentPatchForRegion(
      fresh,
      SEED,
      COHORT,
      TIDAL_FLOCK_REGION,
    );
    if (freshPatch === null) throw new Error("Fresh breadth fixture is absent");
    expect(freshPatch.updatedAtTick).toBe(startTick);
    expect(freshPatch.populations.flatMap(({ members }) => members).every(({
      actor,
    }) => (
      actor.updatedAtTick === startTick
      && actor.perception.tick === startTick
      && actor.intent.enteredAtTick === startTick
      && (actor.intent.expiresAtTick === null || actor.intent.expiresAtTick >= startTick)
    ))).toBe(true);
    expect(freshPatch.groups.groups.every((group) => (
      group.updatedAtTick >= startTick
      && group.nextCoarseTick >= startTick
      && group.lineage.every(({ atTick }) => atTick >= startTick)
      && group.aftermath.every(({ atTick }) => atTick >= startTick)
      && group.signals.every(({ emittedAtTick, lastPropagatedAtTick, expiresAtTick }) => (
        emittedAtTick >= startTick
        && lastPropagatedAtTick >= startTick
        && expiresAtTick >= startTick
      ))
    ))).toBe(true);
    expect(freshPatch.aggregatePopulations.every((population) => (
      population.updatedAtTick >= startTick
      && population.activitySignal.updatedAtTick >= startTick
      && population.evidence.every(({ createdAtTick }) => createdAtTick >= startTick)
      && population.disturbances.every(({ atTick }) => atTick >= startTick)
      && (population.lastTidalRedistributionTick === null
        || population.lastTidalRedistributionTick >= startTick)
    ))).toBe(true);
    expect(putRegionalBreadthEcologyResidentDeviation(fresh, {
      rootSeed: SEED,
      patch: freshPatch,
    })).toBe(fresh);

    const legacy = createPristineRegionalBreadthEcologyRoot(
      { rootSeed: SEED, completedTick: startTick },
      CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
      REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID,
    );
    expect(legacy.baselinePolicyId).toBe(
      REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID,
    );
    const legacyText = serializeRegionalBreadthEcologyRoot(legacy);
    const restoredLegacy = deserializeRegionalBreadthEcologyRoot(legacyText);
    expect(restoredLegacy).not.toBeNull();
    expect(serializeRegionalBreadthEcologyRoot(restoredLegacy)).toBe(legacyText);
    expect(canonicalRegionalBreadthEcologyRootForWorld(restoredLegacy, {
      rootSeed: SEED,
      completedTick: startTick,
    })).toBe(restoredLegacy);
    const legacyResidents = regionalBreadthEcologyResidentsForActiveRegions(
      restoredLegacy,
      SEED,
      [TIDAL_FLOCK_REGION],
    );
    const legacyPatch = legacyResidents?.find(({ cohortId }) => (
      cohortId === COHORT
    ))?.patch;
    expect(legacyPatch).toEqual(createCoreEcologyBreadthResidentPatch({
      seed: SEED,
      habitat,
      tick: startTick,
    }));
    expect(legacyPatch?.aggregatePopulations.some((population) => (
      population.evidence.some(({ createdAtTick }) => createdAtTick < startTick)
      || population.disturbances.some(({ atTick }) => atTick < startTick)
    ))).toBe(true);
    expect(putRegionalBreadthEcologyResidentDeviation(restoredLegacy, {
      rootSeed: SEED,
      patch: legacyPatch!,
    })).toBe(restoredLegacy);
    expect(legacyPatch).not.toEqual(freshPatch);
  });

  it("stores one coarse deviation, finds its extreme physical residence, and reloads without reroll", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const moved = movedHeronPatch();
    const stored = putRegionalBreadthEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: moved,
    });
    expect(stored.regions).toHaveLength(1);
    expect(stored.regions[0]!.residentPatch.populations.flatMap(
      ({ members }) => members,
    ).every(({ materialization }) => materialization === "coarse")).toBe(true);
    const restored = deserializeRegionalBreadthEcologyRoot(
      serializeRegionalBreadthEcologyRoot(stored),
    );
    expect(restored).not.toBeNull();
    const later = advanceRegionalBreadthEcologyRoot(restored, 128);
    const active = regionalBreadthEcologyResidentsForActiveRegions(
      later,
      SEED,
      [DESTINATION],
    );
    expect(active).not.toBeNull();
    const movedSource = active!.find(({ sourceKey }) => (
      sourceKey === stored.regions[0]!.residentPatch.patchKey
    ));
    expect(movedSource).toBeDefined();
    expect(movedSource!.patch.originRegion).toEqual(HERON_REGION);
    expect(movedSource!.patch.updatedAtTick).toBe(128);
    expect(movedSource!.patch.populations.find(
      ({ species }) => species === "great-blue-heron",
    )!.members[0]!.actor.address.position.region).toEqual(DESTINATION);
    expect(movedSource!.patch.mortalityTransactions).toEqual([]);
    expect(movedSource!.patch.carcasses).toEqual([]);
    expect(stableStringify(regionalBreadthEcologyResidentsForActiveRegions(
      deserializeRegionalBreadthEcologyRoot(serializeRegionalBreadthEcologyRoot(later)),
      SEED,
      [DESTINATION],
    ))).toBe(stableStringify(active));
  });

  it("advances one exact active receipt byte-identically to full common-tick derivation", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const prior = regionalBreadthEcologyResidentsForActiveRegions(
      root,
      SEED,
      [TIDAL_FLOCK_REGION],
    );
    if (prior === null) throw new Error("Breadth receipt fixture did not derive");
    const sourceBytes = serializeRegionalBreadthEcologyRoot(root);

    const completedTick = 128;
    const fast = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
      rootSeed: SEED,
      completedTick,
      activeRegions: [TIDAL_FLOCK_REGION],
      expectedResidents: activeResidentClaims(prior),
      durableResidents: [],
    });
    const replay = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
      rootSeed: SEED,
      completedTick,
      activeRegions: [TIDAL_FLOCK_REGION],
      expectedResidents: activeResidentClaims(prior),
      durableResidents: [],
    });
    const oracleRoot = advanceRegionalBreadthEcologyRoot(root, completedTick);
    const oracleResidents = regionalBreadthEcologyResidentsForActiveRegions(
      oracleRoot,
      SEED,
      [TIDAL_FLOCK_REGION],
    );

    expect(fast).not.toBeNull();
    expect(replay).not.toBeNull();
    expect(oracleResidents).not.toBeNull();
    expect(stableStringify(fast?.root)).toBe(stableStringify(oracleRoot));
    expect(stableStringify(fast?.residents)).toBe(stableStringify(oracleResidents));
    expect(serializeRegionalBreadthEcologyRoot(replay!.root))
      .toBe(serializeRegionalBreadthEcologyRoot(fast!.root));
    expect(stableStringify(replay!.residents)).toBe(stableStringify(fast!.residents));
    expect(serializeRegionalBreadthEcologyRoot(root)).toBe(sourceBytes);
  });

  it("issues one exact frozen V6 bridge receipt and rejects every substituted boundary", () => {
    const sourceRoot = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const activeRegions = Object.freeze([TIDAL_FLOCK_REGION]);
    const prior = regionalBreadthEcologyResidentsForActiveRegions(
      sourceRoot,
      SEED,
      activeRegions,
    );
    if (prior === null) throw new Error("V6 bridge receipt fixture did not derive");
    const completedTick = 128;
    const advance = () => {
      const result = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
        sourceRoot,
        {
          rootSeed: SEED,
          completedTick,
          activeRegions,
          expectedResidents: activeResidentClaims(prior),
          durableResidents: [],
        },
      );
      if (result === null) throw new Error("V6 bridge receipt advance failed");
      return result;
    };
    const input = {
      sourceRoot,
      rootSeed: SEED,
      completedTick,
      activeRegions,
    } as const;

    const exact = advance();
    const receipt = consumeRegionalBreadthEcologyAdvanceResultReceipt(exact, input);
    expect(receipt).not.toBeNull();
    expect(receipt).toHaveLength(exact.residents.length);
    expect(receipt?.every((metadata, index) => (
      metadata.resident === exact.residents[index]
      && metadata.patch === exact.residents[index]?.patch
      && metadata.patchHash === hashCanonical(metadata.patch)
      && metadata.lineageHash === activeResidentClaims([
        metadata.resident,
      ])[0]?.lineageHash
    ))).toBe(true);
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(exact, input)).toBeNull();

    const malformedInput = advance();
    expect(() => consumeRegionalBreadthEcologyAdvanceResultReceipt(
      malformedInput,
      null as unknown as typeof input,
    )).not.toThrow();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(malformedInput, input))
      .toBeNull();

    const cloned = advance();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(
      structuredClone(cloned),
      input,
    )).toBeNull();

    const reordered = advance();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(Object.freeze({
      root: reordered.root,
      residents: Object.freeze([...reordered.residents].reverse()),
    }), input)).toBeNull();

    const substituted = advance();
    const replacement = Object.freeze({
      ...substituted.residents[0]!,
      patch: structuredClone(substituted.residents[0]!.patch),
    });
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(Object.freeze({
      root: substituted.root,
      residents: Object.freeze([replacement, ...substituted.residents.slice(1)]),
    }), input)).toBeNull();

    const mutable = advance();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt({
      root: mutable.root,
      residents: mutable.residents,
    }, input)).toBeNull();

    const mutableWindow = [...activeRegions];
    const mutableWindowResult = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
      sourceRoot,
      {
        rootSeed: SEED,
        completedTick,
        activeRegions: mutableWindow,
        expectedResidents: activeResidentClaims(prior),
        durableResidents: [],
      },
    );
    expect(mutableWindowResult).not.toBeNull();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(
      mutableWindowResult,
      { ...input, activeRegions: mutableWindow },
    )).toBeNull();

    const wrongWindow = advance();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(wrongWindow, {
      ...input,
      activeRegions: [...activeRegions],
    })).toBeNull();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(wrongWindow, input))
      .toBeNull();

    const wrongSeed = advance();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(wrongSeed, {
      ...input,
      rootSeed: Object.freeze([...SEED]) as typeof SEED,
    })).toBeNull();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(wrongSeed, input))
      .toBeNull();

    const wrongTick = advance();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(wrongTick, {
      ...input,
      completedTick: completedTick + 1,
    })).toBeNull();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(wrongTick, input))
      .toBeNull();

    const wrongRoot = advance();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(wrongRoot, {
      ...input,
      sourceRoot: structuredClone(sourceRoot),
    })).toBeNull();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(wrongRoot, input))
      .toBeNull();

    const superseded = advance();
    expect(regionalBreadthEcologyResidentsForActiveRegions(
      superseded.root,
      SEED,
      activeRegions,
    )).not.toBeNull();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(superseded, input))
      .toBeNull();
    expect(consumeRegionalBreadthEcologyAdvanceResultReceipt(superseded, input))
      .toBeNull();
  });

  it("rejects a removal batch when scalar clock advance alone crosses the save budget", () => {
    const sourceTick = 9;
    const targetTick = 10;
    const pristineAtSource = heronPatch(sourceTick);
    const root = putRegionalBreadthEcologyResidentDeviation(
      createPristineRegionalBreadthEcologyRoot({
        rootSeed: SEED,
        completedTick: sourceTick,
      }, CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
      REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID),
      { rootSeed: SEED, patch: rotateFirstActor(pristineAtSource, 101) },
    );
    const prior = regionalBreadthEcologyResidentsForActiveRegions(
      root,
      SEED,
      [HERON_REGION],
    );
    if (prior === null || prior.length !== 1) {
      throw new Error("Breadth clock-budget fixture did not derive");
    }

    withSimulatedClockBudgetEdge(
      REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
      REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
      sourceTick,
      targetTick,
      () => {
        expect(() => advanceRegionalBreadthEcologyRoot(root, targetTick)).toThrow();
        const shrinkFirst = putRegionalBreadthEcologyResidentDeviation(root, {
          rootSeed: SEED,
          patch: pristineAtSource,
        });
        expect(advanceRegionalBreadthEcologyRoot(shrinkFirst, targetTick).regions)
          .toEqual([]);
        expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
          rootSeed: SEED,
          completedTick: targetTick,
          activeRegions: [HERON_REGION],
          expectedResidents: activeResidentClaims(prior),
          durableResidents: [{
            sourceKey: prior[0]!.sourceKey,
            patch: heronPatch(targetTick),
          }],
        })).toBeNull();
      },
    );
  });

  it("enforces the prepared root seal byte cap from a consecutive cached-byte receipt", () => {
    const sourceTick = 10;
    const preparedTick = 11;
    const targetTick = 12;
    const root = putRegionalBreadthEcologyResidentDeviation(
      createPristineRegionalBreadthEcologyRoot({
        rootSeed: SEED,
        completedTick: sourceTick,
      }, CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
      REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID),
      { rootSeed: SEED, patch: rotateFirstActor(heronPatch(sourceTick), 303) },
    );
    const prior = regionalBreadthEcologyResidentsForActiveRegions(
      root,
      SEED,
      [HERON_REGION],
    );
    if (prior === null || prior.length !== 1) {
      throw new Error("Prepared breadth byte-cap fixture did not derive");
    }
    const prepared = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
      rootSeed: SEED,
      completedTick: preparedTick,
      activeRegions: [HERON_REGION],
      expectedResidents: activeResidentClaims(prior),
      durableResidents: [],
    });
    if (prepared === null) {
      throw new Error("Prepared breadth byte-cap fixture did not publish cached bytes");
    }
    const preparedBytes = serializeRegionalBreadthEcologyRoot(prepared.root);

    withSimulatedClockBudgetEdge(
      REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
      REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
      preparedTick,
      targetTick,
      () => {
        expect(() => advanceRegionalBreadthEcologyRoot(prepared.root, targetTick))
          .toThrow();
        expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(prepared.root, {
          rootSeed: SEED,
          completedTick: targetTick,
          activeRegions: [HERON_REGION],
          expectedResidents: activeResidentClaims(prepared.residents),
          durableResidents: [],
        })).toBeNull();
      },
    );
    expect(serializeRegionalBreadthEcologyRoot(prepared.root)).toBe(preparedBytes);
  });

  it("rejects cached prepared clock growth before a removal could shrink the root", () => {
    const sourceTick = 8;
    const preparedTick = 9;
    const targetTick = 10;
    const root = putRegionalBreadthEcologyResidentDeviation(
      createPristineRegionalBreadthEcologyRoot({
        rootSeed: SEED,
        completedTick: sourceTick,
      }, CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
      REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID),
      { rootSeed: SEED, patch: rotateFirstActor(heronPatch(sourceTick), 404) },
    );
    const prior = regionalBreadthEcologyResidentsForActiveRegions(
      root,
      SEED,
      [HERON_REGION],
    );
    if (prior === null || prior.length !== 1) {
      throw new Error("Prepared clock-budget fixture did not derive");
    }

    const prepared = withSimulatedPreparedRootSealedBytes(
      REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
      preparedTick,
      REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
      () => advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
        rootSeed: SEED,
        completedTick: preparedTick,
        activeRegions: [HERON_REGION],
        expectedResidents: activeResidentClaims(prior),
        durableResidents: [],
      }),
    );
    if (prepared === null) {
      throw new Error("Prepared clock-budget fixture did not publish cached bytes");
    }
    const preparedBytes = serializeRegionalBreadthEcologyRoot(prepared.root);
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(prepared.root, {
      rootSeed: SEED,
      completedTick: targetTick,
      activeRegions: [HERON_REGION],
      expectedResidents: activeResidentClaims(prepared.residents),
      durableResidents: [{
        sourceKey: prepared.residents[0]!.sourceKey,
        patch: heronPatch(targetTick),
      }],
    })).toBeNull();

    const shrinkFirst = putRegionalBreadthEcologyResidentDeviation(prepared.root, {
      rootSeed: SEED,
      patch: heronPatch(preparedTick),
    });
    expect(advanceRegionalBreadthEcologyRoot(shrinkFirst, targetTick).regions)
      .toEqual([]);
    expect(serializeRegionalBreadthEcologyRoot(prepared.root)).toBe(preparedBytes);
  });

  it("batches source-ordered add, update, removal, and no-op byte-identically to scalar puts", () => {
    const activeRegions = [
      TIDAL_FLOCK_REGION,
      HERON_REGION,
      THIRD_INDIVIDUAL_REGION,
      FOURTH_INDIVIDUAL_REGION,
    ] as const;
    const pristineRoot = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const pristineResidents = regionalBreadthEcologyResidentsForActiveRegions(
      pristineRoot,
      SEED,
      activeRegions,
    );
    if (pristineResidents === null) {
      throw new Error("Durable breadth batch fixture did not derive");
    }
    const individualSources = pristineResidents.filter(({ patch }) => (
      patch.populations.some(({ members }) => members.length > 0)
    )).sort((left, right) => compareText(left.sourceKey, right.sourceKey));
    if (individualSources.length < 4) {
      throw new Error("Durable breadth batch fixture needs four individual sources");
    }
    const [updatedSource, removedSource, addedSource, noopSource] = individualSources;
    if (
      updatedSource === undefined
      || removedSource === undefined
      || addedSource === undefined
      || noopSource === undefined
    ) throw new Error("Durable breadth batch source selection failed");

    let existingRoot = pristineRoot;
    for (const [ordinal, source] of [updatedSource, removedSource].entries()) {
      existingRoot = putRegionalBreadthEcologyResidentDeviation(existingRoot, {
        rootSeed: SEED,
        patch: rotateFirstActor(source.patch, 101 + ordinal),
      });
    }
    const currentResidents = regionalBreadthEcologyResidentsForActiveRegions(
      existingRoot,
      SEED,
      activeRegions,
    );
    if (currentResidents === null) {
      throw new Error("Durable breadth batch receipt did not derive");
    }
    const currentBySource = new Map(
      currentResidents.map((resident) => [resident.sourceKey, resident]),
    );
    const currentUpdated = currentBySource.get(updatedSource.sourceKey);
    const currentAdded = currentBySource.get(addedSource.sourceKey);
    if (currentUpdated === undefined || currentAdded === undefined) {
      throw new Error("Durable breadth batch lost an active source");
    }
    const durableResidents = [
      {
        sourceKey: updatedSource.sourceKey,
        patch: rotateFirstActor(currentUpdated.patch, 17),
      },
      {
        sourceKey: removedSource.sourceKey,
        patch: removedSource.patch,
      },
      {
        sourceKey: addedSource.sourceKey,
        patch: rotateFirstActor(currentAdded.patch, 31),
      },
      {
        sourceKey: noopSource.sourceKey,
        patch: noopSource.patch,
      },
    ];
    const baseInput = {
      rootSeed: SEED,
      completedTick: 0,
      activeRegions,
      expectedResidents: activeResidentClaims(currentResidents),
    } as const;
    const forward = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
      existingRoot,
      { ...baseInput, durableResidents },
    );
    const reversed = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
      existingRoot,
      { ...baseInput, durableResidents: [...durableResidents].reverse() },
    );

    let oracleRoot = advanceRegionalBreadthEcologyRoot(existingRoot, 0);
    for (const resident of [...durableResidents].sort((left, right) => (
      compareText(left.sourceKey, right.sourceKey)
    ))) {
      oracleRoot = putRegionalBreadthEcologyResidentDeviation(oracleRoot, {
        rootSeed: SEED,
        patch: resident.patch,
      });
    }
    const oracleResidents = regionalBreadthEcologyResidentsForActiveRegions(
      oracleRoot,
      SEED,
      activeRegions,
    );
    if (forward === null || reversed === null || oracleResidents === null) {
      throw new Error("Durable breadth batch failed its scalar oracle");
    }

    const forwardText = serializeRegionalBreadthEcologyRoot(forward.root);
    const oracleText = serializeRegionalBreadthEcologyRoot(oracleRoot);
    expect(forwardText).toBe(oracleText);
    expect(serializeRegionalBreadthEcologyRoot(reversed.root))
      .toBe(oracleText);
    expect(forward.root.integrity).toBe(oracleRoot.integrity);
    expect(reversed.root.integrity).toBe(oracleRoot.integrity);
    expect(new TextEncoder().encode(forwardText).byteLength)
      .toBe(new TextEncoder().encode(oracleText).byteLength);
    const restoredForward = deserializeRegionalBreadthEcologyRoot(forwardText);
    expect(restoredForward).not.toBeNull();
    expect(serializeRegionalBreadthEcologyRoot(restoredForward)).toBe(forwardText);
    expect(canonicalRegionalBreadthEcologyRootForWorld(restoredForward, {
      rootSeed: SEED,
      completedTick: 0,
    })).toBe(restoredForward);
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

  it("keeps consecutive durable receipt commits byte-identical through an idle tick, two-cycle jump, and pristine removal", () => {
    const activeRegions = Object.freeze([HERON_REGION]);
    const sourceTick = 67;
    for (const baseline of [
      {
        policy: REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID,
        baselineTick: sourceTick,
      },
      {
        policy: REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID,
        baselineTick: 0,
      },
    ] as const) {
      let fastRoot = createPristineRegionalBreadthEcologyRoot({
        rootSeed: SEED,
        completedTick: sourceTick,
      }, CORE_ECOLOGY_BREADTH_CURRENT_EPOCH, baseline.policy);
      let oracleRoot = fastRoot;
      let fastResidents = regionalBreadthEcologyResidentsForActiveRegions(
        fastRoot,
        SEED,
        activeRegions,
      );
      if (fastResidents === null) {
        throw new Error("Consecutive breadth receipt fixture did not derive");
      }
      const pristine = (tick: number) => heronPatch(tick, baseline.baselineTick);
      const sourceKey = pristine(sourceTick).patchKey;
      const steps = [
        {
          completedTick: sourceTick + 1,
          patch: rotateFirstActor(pristine(sourceTick + 1), 17),
          stored: true,
          rootRevision: 1,
          deltaRevision: 1,
        },
        {
          completedTick: sourceTick + 2,
          patch: null,
          stored: true,
          rootRevision: 1,
          deltaRevision: 1,
        },
        {
          completedTick: sourceTick + 1_440,
          patch: rotateFirstActor(pristine(sourceTick + 1_440), 43),
          stored: true,
          rootRevision: 2,
          deltaRevision: 2,
        },
        {
          completedTick: sourceTick + 1_441,
          patch: pristine(sourceTick + 1_441),
          stored: false,
          rootRevision: 3,
          deltaRevision: null,
        },
      ] as const;

      for (const step of steps) {
        const fast = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
          fastRoot,
          {
            rootSeed: SEED,
            completedTick: step.completedTick,
            activeRegions,
            expectedResidents: activeResidentClaims(fastResidents),
            durableResidents: step.patch === null
              ? []
              : [{ sourceKey, patch: step.patch }],
          },
        );
        oracleRoot = advanceRegionalBreadthEcologyRoot(
          oracleRoot,
          step.completedTick,
        );
        if (step.patch !== null) {
          oracleRoot = putRegionalBreadthEcologyResidentDeviation(oracleRoot, {
            rootSeed: SEED,
            patch: step.patch,
          });
        }
        const oracleResidents = regionalBreadthEcologyResidentsForActiveRegions(
          oracleRoot,
          SEED,
          activeRegions,
        );
        if (fast === null || oracleResidents === null) {
          throw new Error("Consecutive breadth receipt commit failed its scalar oracle");
        }

        expect(serializeRegionalBreadthEcologyRoot(fast.root))
          .toBe(serializeRegionalBreadthEcologyRoot(oracleRoot));
        expect(stableStringify(fast.residents))
          .toBe(stableStringify(oracleResidents));
        expect(fast.root.revision).toBe(step.rootRevision);
        expect(fast.root.lastEventOrdinal).toBe(step.rootRevision);
        const stored = fast.root.regions.find(({ residentPatch }) => (
          residentPatch.patchKey === sourceKey
        ));
        expect(stored !== undefined).toBe(step.stored);
        if (step.deltaRevision !== null) {
          expect(stored?.revision).toBe(step.deltaRevision);
        }

        fastRoot = fast.root;
        fastResidents = fast.residents;
      }
    }
  });

  it("fails the active-receipt fast path closed for clones, reloads, or another window", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const prior = regionalBreadthEcologyResidentsForActiveRegions(
      root,
      SEED,
      [TIDAL_FLOCK_REGION],
    );
    if (prior === null) throw new Error("Breadth receipt fixture did not derive");
    const input = {
      rootSeed: SEED,
      completedTick: 1,
      activeRegions: [TIDAL_FLOCK_REGION],
      expectedResidents: activeResidentClaims(prior),
      durableResidents: [],
    } as const;

    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
      structuredClone(root),
      input,
    )).toBeNull();
    const restored = deserializeRegionalBreadthEcologyRoot(
      serializeRegionalBreadthEcologyRoot(root),
    );
    expect(restored).not.toBeNull();
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
      restored,
      input,
    )).toBeNull();
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
      ...input,
      activeRegions: [ABSENT_REGION],
    })).toBeNull();
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: input.expectedResidents.slice(1),
    })).toBeNull();
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: input.expectedResidents.map((claim, index) => (
        index === 0
          ? { ...claim, patchHash: hashCanonical("forged prior breadth patch") }
          : claim
      )),
    })).toBeNull();
    const rootBytes = serializeRegionalBreadthEcologyRoot(root);
    const malformedPatch = {
      ...prior[0]!.patch,
      preparedDeltaAuthority: true,
    };
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
      ...input,
      durableResidents: [{
        sourceKey: prior[0]!.sourceKey,
        patch: malformedPatch,
      }],
    })).toBeNull();
    expect(serializeRegionalBreadthEcologyRoot(root)).toBe(rootBytes);

    const fallbackRoot = advanceRegionalBreadthEcologyRoot(restored, input.completedTick);
    expect(regionalBreadthEcologyResidentsForActiveRegions(
      fallbackRoot,
      SEED,
      input.activeRegions,
    )).not.toBeNull();

    const prepared = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, input);
    if (prepared === null) throw new Error("Prepared root authority fixture did not advance");
    const preparedBytes = serializeRegionalBreadthEcologyRoot(prepared.root);
    const nextInput = {
      ...input,
      completedTick: input.completedTick + 1,
      expectedResidents: activeResidentClaims(prepared.residents),
    };
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
      structuredClone(prepared.root),
      nextInput,
    )).toBeNull();
    const reloadedPrepared = deserializeRegionalBreadthEcologyRoot(preparedBytes);
    expect(reloadedPrepared).not.toBeNull();
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
      reloadedPrepared,
      nextInput,
    )).toBeNull();
    expect(advanceRegionalBreadthEcologyActiveResidentsFromReceipt(prepared.root, {
      ...nextInput,
      completedTick: prepared.root.updatedAtTick - 1,
    })).toBeNull();
    expect(serializeRegionalBreadthEcologyRoot(prepared.root)).toBe(preparedBytes);
    const publicFallback = advanceRegionalBreadthEcologyRoot(
      reloadedPrepared!,
      nextInput.completedTick,
    );
    expect(canonicalRegionalBreadthEcologyRootForWorld(publicFallback, {
      rootSeed: SEED,
      completedTick: nextInput.completedTick,
    })).toBe(publicFallback);
  });

  it("preserves an off-origin resident at a signed extreme through the active receipt", () => {
    const pristine = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const root = putRegionalBreadthEcologyResidentDeviation(pristine, {
      rootSeed: SEED,
      patch: movedHeronPatch(),
    });
    const prior = regionalBreadthEcologyResidentsForActiveRegions(
      root,
      SEED,
      [DESTINATION],
    );
    if (prior === null) throw new Error("Signed receipt fixture did not derive");
    const movedSourceKey = root.regions[0]!.residentPatch.patchKey;
    expect(prior.find(({ sourceKey }) => sourceKey === movedSourceKey)?.patch.originRegion)
      .toEqual(HERON_REGION);

    const completedTick = 128;
    const fast = advanceRegionalBreadthEcologyActiveResidentsFromReceipt(root, {
      rootSeed: SEED,
      completedTick,
      activeRegions: [DESTINATION],
      expectedResidents: activeResidentClaims(prior),
      durableResidents: [],
    });
    const oracleRoot = advanceRegionalBreadthEcologyRoot(root, completedTick);
    const oracleResidents = regionalBreadthEcologyResidentsForActiveRegions(
      oracleRoot,
      SEED,
      [DESTINATION],
    );

    expect(fast).not.toBeNull();
    expect(stableStringify(fast?.root)).toBe(stableStringify(oracleRoot));
    expect(stableStringify(fast?.residents)).toBe(stableStringify(oracleResidents));
    expect(fast?.residents.find(({ sourceKey }) => sourceKey === movedSourceKey)?.patch)
      .toMatchObject({ originRegion: HERON_REGION, updatedAtTick: completedTick });
  });

  it("fails closed on excessive hot windows, malformed clocks, and unknown keys", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    expect(regionalBreadthEcologyResidentsForActiveRegions(
      root,
      SEED,
      Array.from({ length: 10 }, (_, ordinal) => createRegionCoord(
        ordinal,
        -ordinal,
      )),
    )).toBeNull();
    expect(() => advanceRegionalBreadthEcologyRoot(root, -1)).toThrow(
      /cannot rewind/u,
    );
    expect(canonicalizeRegionalBreadthEcologyRoot({
      ...root,
      anotherBatchNeedsAnotherRoot: true,
    })).toBeNull();
  });
});
