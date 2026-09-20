import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregateActivityIntensity,
} from "./coreEcology";
import { deriveCoreEcologyAlpineHabitat } from "./coreEcologyAlpineHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  createCoreEcologyGroupSet,
  reconcileCoreEcologyGroupAnchors,
} from "./coreEcologyGroups";
import {
  REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
  advanceRegionalAlpineEcologyActiveResidentsFromReceipt,
  advanceRegionalAlpineEcologyRoot,
  canonicalRegionalAlpineEcologyRootForWorld,
  canonicalizeRegionalAlpineEcologyRoot,
  createPristineRegionalAlpineEcologyRoot,
  createRegionalAlpineEcologyRegionDelta,
  deserializeRegionalAlpineEcologyRoot,
  putRegionalAlpineEcologyResidentDeviation,
  regionalAlpineEcologyResidentPatchForRegion,
  regionalAlpineEcologyResidentsForActiveRegions,
  serializeRegionalAlpineEcologyRoot,
} from "./regionalAlpineEcology";
import { createCoreEcologyAlpineResidentPatch } from "./regionalAlpineResidents";
import { createWorldPosition } from "./worldPosition";

const SEED = seedFromText("alpine resident property");
const ORIGIN = createRegionCoord(-1, 0);
const EMPTY = createRegionCoord(3, -4);
const DESTINATION = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
const GOAT_SEED = seedFromText("wave-f alpine origin");
const GOAT_ORIGIN = createRegionCoord(0, -1);
const STALE_RESIDENCE = createRegionCoord(123, -456);
const BATCH_UPDATE_REGION = createRegionCoord(-1, 0);
const BATCH_REMOVE_REGION = createRegionCoord(-4_635, 75_650);
const BATCH_ADD_REGION = createRegionCoord(-48_701, -7_702);
const BATCH_NOOP_REGION = createRegionCoord(-27_484, 157_055);

function pristinePatch(tick = 0) {
  const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region: ORIGIN });
  return createCoreEcologyAlpineResidentPatch({ seed: SEED, habitat, tick });
}

function movedPatch() {
  const patch = pristinePatch();
  const eagle = patch.populations.find(({ species }) => species === "golden-eagle")
    ?.members[0]?.actor;
  if (eagle === undefined) throw new Error("Golden-eagle deviation fixture is absent");
  return replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(eagle, {
    atTick: 0,
    position: createWorldPosition(DESTINATION, 1_000, 2_000),
    heading: 875_000,
  }));
}

function alpinePatch(
  region: ReturnType<typeof createRegionCoord>,
  tick = 0,
) {
  const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region });
  if (habitat.totalPopulationUnits === 0) {
    throw new Error(`Alpine receipt fixture ${region.x}:${region.y} is absent`);
  }
  return createCoreEcologyAlpineResidentPatch({ seed: SEED, habitat, tick });
}

function setAlpineActivity(
  patch: ReturnType<typeof alpinePatch>,
  requestedIntensity: number,
) {
  const population = patch.aggregatePopulations[0];
  if (population === undefined) {
    throw new Error("Alpine receipt fixture needs one aggregate population");
  }
  const intensity = population.activitySignal.intensity === requestedIntensity
    ? requestedIntensity + 1
    : requestedIntensity;
  const changed = setCoreEcologyAggregateActivityIntensity(patch, {
    aggregateId: population.aggregateId,
    atTick: patch.updatedAtTick,
    intensity,
  });
  if (changed === null) {
    throw new Error("Alpine receipt fixture activity change failed");
  }
  return changed;
}

function alpineActiveResidentClaims(
  residents: NonNullable<ReturnType<
    typeof regionalAlpineEcologyResidentsForActiveRegions
  >>,
) {
  return residents.map(({ patch, sourceKey }) => {
    if (patch.derivation.kind !== "regional-alpine-v1") {
      throw new Error("Alpine receipt fixture has the wrong derivation");
    }
    return {
      sourceKey,
      region: patch.originRegion,
      habitatHash: patch.derivation.habitat.derivationHash,
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
        actorIds: [
          ...patch.populations.flatMap(({ members }) => (
            members.map(({ actor }) => actor.identity.stableId)
          )),
          ...patch.mortalityTransactions.map(({ retiredActor }) => (
            retiredActor.identity.stableId
          )),
        ].sort(compareText),
        groupIds: patch.groups.groups.map(({ identity }) => identity.stableId)
          .sort(compareText),
        aggregates: patch.aggregatePopulations.map(({
          aggregateId,
          species,
          populationKey,
          habitatCapacity,
        }) => ({ aggregateId, species, populationKey, habitatCapacity })),
      }),
    };
  });
}

function staleGoatResidencePatch() {
  const habitat = deriveCoreEcologyAlpineHabitat({ seed: GOAT_SEED, region: GOAT_ORIGIN });
  const pristine = createCoreEcologyAlpineResidentPatch({
    seed: GOAT_SEED,
    habitat,
    tick: 0,
  });
  const group = pristine.groups.groups[0];
  if (group === undefined) throw new Error("Mountain-goat group fixture is absent");
  const externalPosition = createWorldPosition(STALE_RESIDENCE, 1_000, 2_000);
  const reconciled = reconcileCoreEcologyGroupAnchors(group, {
    atTick: 0,
    componentAnchors: group.components.map(({ componentId }) => ({
      componentId,
      anchor: externalPosition,
    })),
    rendezvousAnchor: externalPosition,
  });
  if (reconciled === null) throw new Error("Mountain-goat group fixture failed to reconcile");
  const deviated = canonicalizeCoreEcologyAggregatePatch({
    ...pristine,
    groups: createCoreEcologyGroupSet([reconciled]),
  });
  if (deviated === null) throw new Error("Mountain-goat residence deviation is invalid");
  return deviated;
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

describe("Wave-F sparse Regional Alpine ecology lineage", () => {
  it("keeps pristine and merely visited regions rederivable instead of storing them", () => {
    const root = createPristineRegionalAlpineEcologyRoot({ rootSeed: SEED, completedTick: 0 });
    expect(root).toMatchObject({
      ownerId: REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
      updatedAtTick: 0,
      revision: 0,
      lastEventOrdinal: 0,
      regions: [],
    });
    expect(Object.hasOwn(root, "adoption")).toBe(false);
    expect(regionalAlpineEcologyResidentPatchForRegion(root, SEED, EMPTY)).toBeNull();
    expect(root.regions).toEqual([]);

    const occupied = regionalAlpineEcologyResidentPatchForRegion(root, SEED, ORIGIN);
    expect(occupied).not.toBeNull();
    expect(root.regions).toEqual([]);
    expect(stableStringify(occupied)).toBe(stableStringify(pristinePatch()));

    const serialized = serializeRegionalAlpineEcologyRoot(root);
    expect(new TextEncoder().encode(serialized).byteLength)
      .toBeLessThan(REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES);
    expect(deserializeRegionalAlpineEcologyRoot(serialized)).toEqual(root);
    expect(canonicalRegionalAlpineEcologyRootForWorld(root, {
      rootSeed: SEED,
      completedTick: 0,
    })).toBe(root);
  });

  it("stores only a coarse deviation, catches it up, and selects its owner by current residence", () => {
    const moved = movedPatch();
    const sourceKey = moved.patchKey;
    let root = putRegionalAlpineEcologyResidentDeviation(
      createPristineRegionalAlpineEcologyRoot({ rootSeed: SEED, completedTick: 0 }),
      { rootSeed: SEED, patch: moved },
    );
    expect(root.regions).toHaveLength(1);
    expect(root.regions[0]?.residentPatch.updatedAtTick).toBe(0);
    expect(root.regions[0]?.residentPatch.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);

    root = advanceRegionalAlpineEcologyRoot(root, 73);
    expect(root.regions[0]?.residentPatch.updatedAtTick).toBe(0);
    const active = regionalAlpineEcologyResidentsForActiveRegions(root, SEED, [DESTINATION]);
    const crossedOwner = active?.find((resident) => resident.sourceKey === sourceKey);
    expect(crossedOwner?.kind).toBe("regional-alpine-v1");
    expect(crossedOwner?.patch.updatedAtTick).toBe(73);
    expect(crossedOwner?.patch.originRegion).toEqual(ORIGIN);
    expect(crossedOwner?.patch.populations.find(({ species }) => species === "golden-eagle")
      ?.members[0]?.actor.address.position.region).toEqual(DESTINATION);
    expect(regionalAlpineEcologyResidentPatchForRegion(root, SEED, ORIGIN)?.updatedAtTick)
      .toBe(73);

    const replay = regionalAlpineEcologyResidentsForActiveRegions(
      deserializeRegionalAlpineEcologyRoot(serializeRegionalAlpineEcologyRoot(root)),
      SEED,
      [DESTINATION, DESTINATION],
    );
    expect(stableStringify(replay)).toBe(stableStringify(active));

    root = putRegionalAlpineEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: pristinePatch(73),
    });
    expect(root.regions).toEqual([]);
    expect(root.revision).toBe(2);
    expect(root.lastEventOrdinal).toBe(2);
    expect(canonicalRegionalAlpineEcologyRootForWorld(root, {
      rootSeed: SEED,
      completedTick: 73,
    })).toBe(root);
  });

  it("selects cross-region owners from caught-up rather than stale group residence", () => {
    const deviated = staleGoatResidencePatch();
    let root = putRegionalAlpineEcologyResidentDeviation(
      createPristineRegionalAlpineEcologyRoot({ rootSeed: GOAT_SEED, completedTick: 0 }),
      { rootSeed: GOAT_SEED, patch: deviated },
    );
    root = advanceRegionalAlpineEcologyRoot(root, 56);

    expect(regionalAlpineEcologyResidentsForActiveRegions(
      root,
      GOAT_SEED,
      [STALE_RESIDENCE],
    )).toEqual([]);
    expect(regionalAlpineEcologyResidentsForActiveRegions(
      root,
      GOAT_SEED,
      [GOAT_ORIGIN],
    )?.find(({ sourceKey }) => sourceKey === deviated.patchKey)?.patch.updatedAtTick).toBe(56);
  });

  it("advances an exact active receipt to the freshly derived world-canonical target baseline", () => {
    const root = createPristineRegionalAlpineEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const prior = regionalAlpineEcologyResidentsForActiveRegions(
      root,
      SEED,
      [BATCH_UPDATE_REGION],
    );
    if (prior === null || prior.length !== 1) {
      throw new Error("Alpine receipt baseline fixture did not derive");
    }

    const completedTick = 73;
    const fast = advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      rootSeed: SEED,
      completedTick,
      activeRegions: [BATCH_UPDATE_REGION],
      expectedResidents: alpineActiveResidentClaims(prior),
      durableResidents: [],
    });
    const oracleRoot = advanceRegionalAlpineEcologyRoot(root, completedTick);
    const oracleResidents = regionalAlpineEcologyResidentsForActiveRegions(
      oracleRoot,
      SEED,
      [BATCH_UPDATE_REGION],
    );

    expect(fast).not.toBeNull();
    expect(oracleResidents).not.toBeNull();
    expect(serializeRegionalAlpineEcologyRoot(fast?.root))
      .toBe(serializeRegionalAlpineEcologyRoot(oracleRoot));
    expect(stableStringify(fast?.residents)).toBe(stableStringify(oracleResidents));
    expect(stableStringify(fast?.residents[0]?.patch))
      .toBe(stableStringify(alpinePatch(BATCH_UPDATE_REGION, completedTick)));
    expect(canonicalRegionalAlpineEcologyRootForWorld(fast?.root, {
      rootSeed: SEED,
      completedTick,
    })).toBe(fast?.root);
  });

  it("rejects a removal batch when scalar clock advance alone crosses the save budget", () => {
    const sourceTick = 9;
    const targetTick = 10;
    const pristineAtSource = alpinePatch(BATCH_UPDATE_REGION, sourceTick);
    const root = putRegionalAlpineEcologyResidentDeviation(
      createPristineRegionalAlpineEcologyRoot({
        rootSeed: SEED,
        completedTick: sourceTick,
      }),
      { rootSeed: SEED, patch: setAlpineActivity(pristineAtSource, 123_456) },
    );
    const prior = regionalAlpineEcologyResidentsForActiveRegions(
      root,
      SEED,
      [BATCH_UPDATE_REGION],
    );
    if (prior === null || prior.length !== 1) {
      throw new Error("Alpine clock-budget fixture did not derive");
    }

    withSimulatedClockBudgetEdge(
      REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
      REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES,
      sourceTick,
      targetTick,
      () => {
        expect(() => advanceRegionalAlpineEcologyRoot(root, targetTick)).toThrow();
        const shrinkFirst = putRegionalAlpineEcologyResidentDeviation(root, {
          rootSeed: SEED,
          patch: pristineAtSource,
        });
        expect(advanceRegionalAlpineEcologyRoot(shrinkFirst, targetTick).regions).toEqual([]);
        expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
          rootSeed: SEED,
          completedTick: targetTick,
          activeRegions: [BATCH_UPDATE_REGION],
          expectedResidents: alpineActiveResidentClaims(prior),
          durableResidents: [{
            sourceKey: prior[0]!.sourceKey,
            patch: alpinePatch(BATCH_UPDATE_REGION, targetTick),
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
    const pristineRoot = createPristineRegionalAlpineEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const pristineResidents = regionalAlpineEcologyResidentsForActiveRegions(
      pristineRoot,
      SEED,
      activeRegions,
    );
    if (pristineResidents === null || pristineResidents.length !== activeRegions.length) {
      throw new Error("Alpine durable batch fixture did not derive four sources");
    }
    const pristineByRegion = new Map(pristineResidents.map((resident) => [
      `${resident.patch.originRegion.x}:${resident.patch.originRegion.y}`,
      resident,
    ]));
    const residentAt = (region: ReturnType<typeof createRegionCoord>) => {
      const resident = pristineByRegion.get(`${region.x}:${region.y}`);
      if (resident === undefined) throw new Error("Alpine durable batch source is absent");
      return resident;
    };
    const updatedSource = residentAt(BATCH_UPDATE_REGION);
    const removedSource = residentAt(BATCH_REMOVE_REGION);
    const addedSource = residentAt(BATCH_ADD_REGION);
    const noopSource = residentAt(BATCH_NOOP_REGION);

    let existingRoot = pristineRoot;
    existingRoot = putRegionalAlpineEcologyResidentDeviation(existingRoot, {
      rootSeed: SEED,
      patch: setAlpineActivity(updatedSource.patch, 123_456),
    });
    existingRoot = putRegionalAlpineEcologyResidentDeviation(existingRoot, {
      rootSeed: SEED,
      patch: setAlpineActivity(removedSource.patch, 345_678),
    });
    const currentResidents = regionalAlpineEcologyResidentsForActiveRegions(
      existingRoot,
      SEED,
      activeRegions,
    );
    if (currentResidents === null || currentResidents.length !== activeRegions.length) {
      throw new Error("Alpine durable batch receipt did not derive");
    }
    const currentBySource = new Map(currentResidents.map((resident) => [
      resident.sourceKey,
      resident,
    ]));
    const currentUpdated = currentBySource.get(updatedSource.sourceKey);
    if (currentUpdated === undefined) {
      throw new Error("Alpine durable batch lost its update source");
    }
    const durableResidents = [
      {
        sourceKey: updatedSource.sourceKey,
        patch: setAlpineActivity(currentUpdated.patch, 234_567),
      },
      {
        sourceKey: removedSource.sourceKey,
        patch: removedSource.patch,
      },
      {
        sourceKey: addedSource.sourceKey,
        patch: setAlpineActivity(addedSource.patch, 456_789),
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
      expectedResidents: alpineActiveResidentClaims(currentResidents),
    } as const;
    const forward = advanceRegionalAlpineEcologyActiveResidentsFromReceipt(
      existingRoot,
      { ...baseInput, durableResidents },
    );
    const reversed = advanceRegionalAlpineEcologyActiveResidentsFromReceipt(
      existingRoot,
      { ...baseInput, durableResidents: [...durableResidents].reverse() },
    );

    let oracleRoot = advanceRegionalAlpineEcologyRoot(existingRoot, 0);
    for (const resident of [...durableResidents].sort((left, right) => (
      compareText(left.sourceKey, right.sourceKey)
    ))) {
      oracleRoot = putRegionalAlpineEcologyResidentDeviation(oracleRoot, {
        rootSeed: SEED,
        patch: resident.patch,
      });
    }
    const oracleResidents = regionalAlpineEcologyResidentsForActiveRegions(
      oracleRoot,
      SEED,
      activeRegions,
    );
    if (forward === null || reversed === null || oracleResidents === null) {
      throw new Error("Alpine durable batch failed its scalar oracle");
    }

    expect(serializeRegionalAlpineEcologyRoot(forward.root))
      .toBe(serializeRegionalAlpineEcologyRoot(oracleRoot));
    expect(serializeRegionalAlpineEcologyRoot(reversed.root))
      .toBe(serializeRegionalAlpineEcologyRoot(oracleRoot));
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

  it("fails receipt custody closed for every binding and malformed durable input", () => {
    const root = createPristineRegionalAlpineEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const oldWindow = [BATCH_UPDATE_REGION, BATCH_REMOVE_REGION] as const;
    const newWindow = [BATCH_ADD_REGION, BATCH_NOOP_REGION] as const;
    const prior = regionalAlpineEcologyResidentsForActiveRegions(root, SEED, oldWindow);
    if (prior === null || prior.length !== oldWindow.length) {
      throw new Error("Alpine receipt custody fixture did not derive");
    }
    const claims = alpineActiveResidentClaims(prior);
    const input = {
      rootSeed: SEED,
      completedTick: 1,
      activeRegions: oldWindow,
      expectedResidents: claims,
      durableResidents: [],
    } as const;

    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(
      structuredClone(root),
      input,
    )).toBeNull();
    const restored = deserializeRegionalAlpineEcologyRoot(
      serializeRegionalAlpineEcologyRoot(root),
    );
    expect(restored).not.toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(restored, input))
      .toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(
      createPristineRegionalAlpineEcologyRoot({ rootSeed: SEED, completedTick: 0 }),
      input,
    )).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      rootSeed: seedFromText("foreign Alpine receipt seed"),
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      completedTick: -1,
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      activeRegions: newWindow,
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.slice(1),
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, sourceKey: `${claim.sourceKey}:forged` }
        : claim),
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, region: EMPTY }
        : claim),
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, habitatHash: hashCanonical("forged Alpine habitat") }
        : claim),
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, patchHash: hashCanonical("forged Alpine patch") }
        : claim),
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      expectedResidents: claims.map((claim, index) => index === 0
        ? { ...claim, lineageHash: hashCanonical("forged Alpine lineage") }
        : claim),
    })).toBeNull();
    const firstDurable = {
      sourceKey: prior[0]!.sourceKey,
      patch: alpinePatch(prior[0]!.patch.originRegion, input.completedTick),
    };
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      durableResidents: [firstDurable, firstDurable],
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      durableResidents: [{
        sourceKey: prior[0]!.sourceKey,
        patch: alpinePatch(prior[1]!.patch.originRegion, input.completedTick),
      }],
    })).toBeNull();
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      durableResidents: [{
        sourceKey: `${prior[0]!.sourceKey}:unknown`,
        patch: firstDurable.patch,
      }],
    })).toBeNull();

    const rootBytes = serializeRegionalAlpineEcologyRoot(root);
    expect(advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      ...input,
      durableResidents: [firstDurable, {
        sourceKey: `${prior[1]!.sourceKey}:unknown`,
        patch: alpinePatch(prior[1]!.patch.originRegion, input.completedTick),
      }],
    })).toBeNull();
    expect(serializeRegionalAlpineEcologyRoot(root)).toBe(rootBytes);

    const fast = advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, input);
    const fallbackRoot = advanceRegionalAlpineEcologyRoot(restored, input.completedTick);
    const fallbackResidents = regionalAlpineEcologyResidentsForActiveRegions(
      fallbackRoot,
      SEED,
      oldWindow,
    );
    expect(fast).not.toBeNull();
    expect(fallbackResidents).not.toBeNull();
    expect(serializeRegionalAlpineEcologyRoot(fast?.root))
      .toBe(serializeRegionalAlpineEcologyRoot(fallbackRoot));
    expect(stableStringify(fast?.residents)).toBe(stableStringify(fallbackResidents));
  });

  it("keeps an off-window physical occupant and drops it once it leaves the active window", () => {
    const moved = movedPatch();
    const pristine = createPristineRegionalAlpineEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const root = putRegionalAlpineEcologyResidentDeviation(pristine, {
      rootSeed: SEED,
      patch: moved,
    });
    const prior = regionalAlpineEcologyResidentsForActiveRegions(
      root,
      SEED,
      [DESTINATION],
    );
    if (prior === null || prior.length !== 1) {
      throw new Error("Alpine signed-coordinate occupant fixture did not derive");
    }
    expect(prior[0]?.patch.originRegion).toEqual(ORIGIN);

    const completedTick = 1;
    const retained = advanceRegionalAlpineEcologyActiveResidentsFromReceipt(root, {
      rootSeed: SEED,
      completedTick,
      activeRegions: [DESTINATION],
      expectedResidents: alpineActiveResidentClaims(prior),
      durableResidents: [],
    });
    const retainedOracleRoot = advanceRegionalAlpineEcologyRoot(root, completedTick);
    const retainedOracleResidents = regionalAlpineEcologyResidentsForActiveRegions(
      retainedOracleRoot,
      SEED,
      [DESTINATION],
    );
    if (retained === null || retainedOracleResidents === null) {
      throw new Error("Alpine off-window occupant receipt did not advance");
    }
    expect(serializeRegionalAlpineEcologyRoot(retained.root))
      .toBe(serializeRegionalAlpineEcologyRoot(retainedOracleRoot));
    expect(stableStringify(retained.residents))
      .toBe(stableStringify(retainedOracleResidents));

    const returnedToOrigin = pristinePatch(completedTick);
    const departed = advanceRegionalAlpineEcologyActiveResidentsFromReceipt(
      retained.root,
      {
        rootSeed: SEED,
        completedTick,
        activeRegions: [DESTINATION],
        expectedResidents: alpineActiveResidentClaims(retained.residents),
        durableResidents: [{ sourceKey: moved.patchKey, patch: returnedToOrigin }],
      },
    );
    const departedOracleRoot = putRegionalAlpineEcologyResidentDeviation(
      retainedOracleRoot,
      { rootSeed: SEED, patch: returnedToOrigin },
    );
    const departedOracleResidents = regionalAlpineEcologyResidentsForActiveRegions(
      departedOracleRoot,
      SEED,
      [DESTINATION],
    );

    expect(departed).not.toBeNull();
    expect(departedOracleResidents).toEqual([]);
    expect(serializeRegionalAlpineEcologyRoot(departed?.root))
      .toBe(serializeRegionalAlpineEcologyRoot(departedOracleRoot));
    expect(stableStringify(departed?.residents))
      .toBe(stableStringify(departedOracleResidents));

    const goatPatch = staleGoatResidencePatch();
    const goatRoot = putRegionalAlpineEcologyResidentDeviation(
      createPristineRegionalAlpineEcologyRoot({
        rootSeed: GOAT_SEED,
        completedTick: 0,
      }),
      { rootSeed: GOAT_SEED, patch: goatPatch },
    );
    const goatPrior = regionalAlpineEcologyResidentsForActiveRegions(
      goatRoot,
      GOAT_SEED,
      [STALE_RESIDENCE],
    );
    if (goatPrior === null || goatPrior.length !== 1) {
      throw new Error("Alpine untouched off-window leaver fixture did not derive");
    }
    const goatFast = advanceRegionalAlpineEcologyActiveResidentsFromReceipt(goatRoot, {
      rootSeed: GOAT_SEED,
      completedTick: 56,
      activeRegions: [STALE_RESIDENCE],
      expectedResidents: alpineActiveResidentClaims(goatPrior),
      durableResidents: [],
    });
    const goatOracleRoot = advanceRegionalAlpineEcologyRoot(goatRoot, 56);
    const goatOracleResidents = regionalAlpineEcologyResidentsForActiveRegions(
      goatOracleRoot,
      GOAT_SEED,
      [STALE_RESIDENCE],
    );
    expect(goatFast).not.toBeNull();
    expect(goatOracleResidents).toEqual([]);
    expect(serializeRegionalAlpineEcologyRoot(goatFast?.root))
      .toBe(serializeRegionalAlpineEcologyRoot(goatOracleRoot));
    expect(stableStringify(goatFast?.residents))
      .toBe(stableStringify(goatOracleResidents));
  });

  it("rejects pristine deltas, foreign authority, excess hot regions, and v24-style adoption fields", () => {
    const patch = pristinePatch();
    const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region: ORIGIN });
    expect(() => createRegionalAlpineEcologyRegionDelta({
      rootSeed: SEED,
      region: ORIGIN,
      baselineHash: habitat.derivationHash,
      revision: 1,
      eventOrdinal: 1,
      residentPatch: patch,
    })).toThrow(/does not persist pristine baselines/u);

    const root = createPristineRegionalAlpineEcologyRoot({ rootSeed: SEED, completedTick: 0 });
    expect(canonicalRegionalAlpineEcologyRootForWorld(root, {
      rootSeed: seedFromText("foreign Alpine sparse root"),
      completedTick: 0,
    })).toBeNull();
    expect(canonicalizeRegionalAlpineEcologyRoot({ ...root, adoption: { version: 24 } }))
      .toBeNull();
    expect(regionalAlpineEcologyResidentsForActiveRegions(root, SEED, Array.from(
      { length: 10 },
      (_, index) => createRegionCoord(index, -index),
    ))).toBeNull();
  });
});
