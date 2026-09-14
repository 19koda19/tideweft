import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  regionKey,
  stableRegionId,
  stableRegionObjectId,
  type RegionCoord,
} from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
  CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
  coreEcologyBreadthCohortDefinition,
  coreEcologyBreadthCohortsThroughEpoch,
  deriveCoreEcologyBreadthHabitat,
  type CoreEcologyBreadthCohortDefinition,
  type CoreEcologyBreadthCohortId,
} from "./coreEcologyBreadthHabitat";
import {
  REGIONAL_BREADTH_COHORT_MAX_ACTIVE_REGIONS,
  canonicalCoreEcologyBreadthResidentPatch,
  coreEcologyBreadthResidentPatchIsAllCoarse,
  coreEcologyBreadthResidentPatchResidenceRegions,
  coreEcologyBreadthResidentSourceKey,
  createCoreEcologyBreadthResidentPatch,
  reconcileCoreEcologyBreadthResidentPatchAtTick,
} from "./regionalBreadthCohort";

export const REGIONAL_BREADTH_ECOLOGY_ROOT_VERSION = 1 as const;
export const REGIONAL_BREADTH_ECOLOGY_DELTA_VERSION = 1 as const;
export const REGIONAL_BREADTH_ECOLOGY_ACTIVATION_VERSION = 1 as const;
export const REGIONAL_BREADTH_ECOLOGY_OWNER_ID =
  "game:regional-breadth-ecology:v1" as const;
export const REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID =
  CORE_ECOLOGY_BREADTH_DERIVATION_KIND;
export const REGIONAL_BREADTH_ECOLOGY_MAX_REGIONS = 32_768 as const;
export const REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES =
  16 * 1_024 * 1_024;

export interface RegionalBreadthEcologyWorldBinding {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
}

/** Append-only receipt; a later cohort adds one row, never another root schema. */
export interface RegionalBreadthEcologyCohortActivationV1 {
  readonly version: typeof REGIONAL_BREADTH_ECOLOGY_ACTIVATION_VERSION;
  readonly activationOrdinal: number;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly cohortDefinitionHash: string;
  readonly activatedAtTick: number;
  readonly stableId: string;
  readonly integrity: string;
}

export interface RegionalBreadthEcologyRegionDeltaV1 {
  readonly version: typeof REGIONAL_BREADTH_ECOLOGY_DELTA_VERSION;
  readonly stableId: string;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly cohortDefinitionHash: string;
  readonly region: RegionCoord;
  readonly key: string;
  readonly regionId: string;
  readonly baselineHash: string;
  readonly revision: number;
  readonly eventOrdinal: number;
  readonly residentPatch: CoreEcologyAggregatePatchState;
  readonly residentPatchHash: string;
  readonly integrity: string;
}

/**
 * One permanent Wave-G sibling. `activations` and cohort-scoped delta keys are
 * append-only expansion seams, so later breadth batches do not require V7,
 * V8, ... wrappers merely to add species.
 */
export interface RegionalBreadthEcologyRootV1 {
  readonly version: typeof REGIONAL_BREADTH_ECOLOGY_ROOT_VERSION;
  readonly ownerId: typeof REGIONAL_BREADTH_ECOLOGY_OWNER_ID;
  readonly generationVersion: 1;
  readonly baselinePolicyId: typeof REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID;
  readonly seedFingerprint: string;
  readonly activeThroughEpoch: number;
  readonly activations: readonly RegionalBreadthEcologyCohortActivationV1[];
  readonly updatedAtTick: number;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  readonly regions: readonly RegionalBreadthEcologyRegionDeltaV1[];
  readonly integrity: string;
}

export interface PutRegionalBreadthEcologyResidentDeviationInput {
  readonly rootSeed: RootSeed;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalBreadthEcologyActiveResidentInput {
  readonly kind: typeof CORE_ECOLOGY_BREADTH_DERIVATION_KIND;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const UINT32_MAX = 0xffff_ffff;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_ROOTS = new WeakSet<object>();
const WORLD_BOUND_ROOTS = new WeakMap<object, string>();

export function createPristineRegionalBreadthEcologyRoot(
  binding: RegionalBreadthEcologyWorldBinding,
  activeThroughEpoch: number = CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
): RegionalBreadthEcologyRootV1 {
  requireBinding(binding);
  requireAvailableEpoch(activeThroughEpoch);
  return sealAndBindRoot({
    version: REGIONAL_BREADTH_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
    generationVersion: 1,
    baselinePolicyId: REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: seedFingerprint(binding.rootSeed),
    activeThroughEpoch,
    activations: createActivations(
      binding.rootSeed,
      activeThroughEpoch,
      binding.completedTick,
    ),
    updatedAtTick: binding.completedTick,
    revision: 0,
    lastEventOrdinal: 0,
    regions: Object.freeze([]),
  });
}

/**
 * Activates newly appended registry epochs without replacing the root. Existing
 * cohort receipts and deviations are immutable prefixes.
 */
export function activateRegionalBreadthEcologyThroughEpoch(
  value: unknown,
  binding: RegionalBreadthEcologyWorldBinding,
  targetEpoch: number,
): RegionalBreadthEcologyRootV1 {
  const root = canonicalRegionalBreadthEcologyRootForWorld(value, binding);
  requireAvailableEpoch(targetEpoch);
  if (root === null) {
    throw new RangeError("Breadth epoch activation requires its bound root");
  }
  if (targetEpoch < root.activeThroughEpoch) {
    throw new RangeError("Breadth ecology epochs cannot be removed or rewound");
  }
  if (targetEpoch === root.activeThroughEpoch) return root;
  const additions = coreEcologyBreadthCohortsThroughEpoch(targetEpoch).filter(
    ({ introducedInEpoch }) => introducedInEpoch > root.activeThroughEpoch,
  );
  const activations = [...root.activations];
  for (const cohort of additions) {
    activations.push(createActivation(
      binding.rootSeed,
      cohort,
      activations.length,
      binding.completedTick,
    ));
  }
  const { integrity: _integrity, ...base } = root;
  return sealAndBindRoot({
    ...base,
    activeThroughEpoch: targetEpoch,
    activations: Object.freeze(activations),
  });
}

export function createRegionalBreadthEcologyRegionDelta(
  input: Readonly<{
    readonly rootSeed: RootSeed;
    readonly cohortId: CoreEcologyBreadthCohortId;
    readonly region: RegionCoord;
    readonly baselineHash: string;
    readonly revision: number;
    readonly eventOrdinal: number;
    readonly residentPatch: CoreEcologyAggregatePatchState;
  }>,
): RegionalBreadthEcologyRegionDeltaV1 {
  requireRootSeed(input.rootSeed);
  const cohort = coreEcologyBreadthCohortDefinition(input.cohortId);
  if (
    cohort === null
    || !isRegionCoord(input.region)
    || !validHash(input.baselineHash)
    || !positiveSafeInteger(input.revision)
    || !positiveSafeInteger(input.eventOrdinal)
  ) throw new RangeError("Regional breadth ecology refuses a malformed delta");
  const patch = canonicalCoreEcologyBreadthResidentPatch(input.residentPatch, {
    seed: input.rootSeed,
    region: input.region,
    completedTick: input.residentPatch.updatedAtTick,
  });
  const derivation = patch?.derivation as unknown as Readonly<{
    readonly habitat?: Readonly<{
      readonly cohortId?: unknown;
      readonly derivationHash?: unknown;
    }>;
  }> | undefined;
  if (
    patch === null
    || !coreEcologyBreadthResidentPatchIsAllCoarse(patch)
    || derivation?.habitat?.cohortId !== cohort.cohortId
    || derivation.habitat.derivationHash !== input.baselineHash
  ) throw new RangeError("Regional breadth delta is not a bound coarse cohort patch");
  const pristine = createCoreEcologyBreadthResidentPatch({
    seed: input.rootSeed,
    habitat: deriveCoreEcologyBreadthHabitat({
      seed: input.rootSeed,
      region: input.region,
      cohortId: cohort.cohortId,
    }),
    tick: patch.updatedAtTick,
  });
  if (stableStringify(pristine) === stableStringify(patch)) {
    throw new RangeError("Regional breadth ecology does not persist pristine baselines");
  }
  const key = deltaKey(cohort.cohortId, input.region);
  const base = {
    version: REGIONAL_BREADTH_ECOLOGY_DELTA_VERSION,
    stableId: stableRegionObjectId(
      input.rootSeed,
      input.region,
      "breadth-deviation",
      `${cohort.cohortId}:e${cohort.introducedInEpoch}`,
    ),
    cohortId: cohort.cohortId,
    cohortEpoch: cohort.introducedInEpoch,
    cohortDefinitionHash: cohort.definitionHash,
    region: createRegionCoord(input.region.x, input.region.y),
    key,
    regionId: stableRegionId(input.rootSeed, input.region),
    baselineHash: input.baselineHash,
    revision: input.revision,
    eventOrdinal: input.eventOrdinal,
    residentPatch: patch,
    residentPatchHash: hashCanonical(patch),
  } as const;
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

export function canonicalizeRegionalBreadthEcologyRegionDelta(
  value: unknown,
  rootSeed?: RootSeed,
): RegionalBreadthEcologyRegionDeltaV1 | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "baselineHash",
    "cohortDefinitionHash",
    "cohortEpoch",
    "cohortId",
    "eventOrdinal",
    "integrity",
    "key",
    "region",
    "regionId",
    "residentPatch",
    "residentPatchHash",
    "revision",
    "stableId",
    "version",
  ])) return null;
  const cohort = typeof value.cohortId === "string"
    ? coreEcologyBreadthCohortDefinition(value.cohortId as CoreEcologyBreadthCohortId)
    : null;
  if (
    cohort === null
    || value.version !== REGIONAL_BREADTH_ECOLOGY_DELTA_VERSION
    || value.cohortEpoch !== cohort.introducedInEpoch
    || value.cohortDefinitionHash !== cohort.definitionHash
    || !validId(value.stableId)
    || !isRegionCoord(value.region)
    || value.key !== deltaKey(cohort.cohortId, value.region)
    || !validId(value.regionId)
    || !validHash(value.baselineHash)
    || !positiveSafeInteger(value.revision)
    || !positiveSafeInteger(value.eventOrdinal)
    || !validHash(value.residentPatchHash)
    || !validHash(value.integrity)
  ) return null;
  const patch = canonicalDeltaPatch(
    value.residentPatch,
    value.region,
    cohort.cohortId,
    value.baselineHash,
  );
  if (patch === null || value.residentPatchHash !== hashCanonical(patch)) return null;
  const base = {
    version: REGIONAL_BREADTH_ECOLOGY_DELTA_VERSION,
    stableId: value.stableId,
    cohortId: cohort.cohortId,
    cohortEpoch: cohort.introducedInEpoch,
    cohortDefinitionHash: cohort.definitionHash,
    region: createRegionCoord(value.region.x, value.region.y),
    key: value.key,
    regionId: value.regionId,
    baselineHash: value.baselineHash,
    revision: value.revision,
    eventOrdinal: value.eventOrdinal,
    residentPatch: patch,
    residentPatchHash: value.residentPatchHash,
  } as const;
  if (hashCanonical(base) !== value.integrity) return null;
  const delta = deepFreeze({ ...base, integrity: value.integrity });
  if (rootSeed === undefined) return delta;
  try {
    requireRootSeed(rootSeed);
    if (
      delta.stableId !== stableRegionObjectId(
        rootSeed,
        delta.region,
        "breadth-deviation",
        `${cohort.cohortId}:e${cohort.introducedInEpoch}`,
      )
      || delta.regionId !== stableRegionId(rootSeed, delta.region)
    ) return null;
    const habitat = deriveCoreEcologyBreadthHabitat({
      seed: rootSeed,
      region: delta.region,
      cohortId: cohort.cohortId,
    });
    if (
      habitat.totalPopulationUnits === 0
      || delta.baselineHash !== habitat.derivationHash
      || canonicalCoreEcologyBreadthResidentPatch(delta.residentPatch, {
        seed: rootSeed,
        region: delta.region,
        completedTick: delta.residentPatch.updatedAtTick,
      }) === null
    ) return null;
    const pristine = createCoreEcologyBreadthResidentPatch({
      seed: rootSeed,
      habitat,
      tick: delta.residentPatch.updatedAtTick,
    });
    return stableStringify(pristine) === stableStringify(delta.residentPatch)
      ? null
      : delta;
  } catch {
    return null;
  }
}

export function canonicalizeRegionalBreadthEcologyRoot(
  value: unknown,
): RegionalBreadthEcologyRootV1 | null {
  if (typeof value === "object" && value !== null && TRUSTED_ROOTS.has(value)) {
    return value as RegionalBreadthEcologyRootV1;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "activations",
    "activeThroughEpoch",
    "baselinePolicyId",
    "generationVersion",
    "integrity",
    "lastEventOrdinal",
    "ownerId",
    "regions",
    "revision",
    "seedFingerprint",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_BREADTH_ECOLOGY_ROOT_VERSION
    || value.ownerId !== REGIONAL_BREADTH_ECOLOGY_OWNER_ID
    || value.generationVersion !== 1
    || value.baselinePolicyId !== REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID
    || !validHash(value.seedFingerprint)
    || !nonnegativeSafeInteger(value.activeThroughEpoch)
    || value.activeThroughEpoch > CORE_ECOLOGY_BREADTH_CURRENT_EPOCH
    || !Array.isArray(value.activations)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !nonnegativeSafeInteger(value.revision)
    || !nonnegativeSafeInteger(value.lastEventOrdinal)
    || !Array.isArray(value.regions)
    || value.regions.length > REGIONAL_BREADTH_ECOLOGY_MAX_REGIONS
    || !validHash(value.integrity)
  ) return null;
  const activations = canonicalActivations(
    value.activations,
    value.activeThroughEpoch,
    value.updatedAtTick,
  );
  if (activations === null) return null;
  const activeIds = new Set(activations.map(({ cohortId }) => cohortId));
  const regions: RegionalBreadthEcologyRegionDeltaV1[] = [];
  for (const raw of value.regions) {
    const delta = canonicalizeRegionalBreadthEcologyRegionDelta(raw);
    if (
      delta === null
      || !activeIds.has(delta.cohortId)
      || delta.revision > value.revision
      || delta.eventOrdinal > value.lastEventOrdinal
      || delta.residentPatch.updatedAtTick > value.updatedAtTick
    ) return null;
    regions.push(delta);
  }
  regions.sort((left, right) => compareText(left.key, right.key));
  if (
    regions.some((region, index) => (
      index > 0 && regions[index - 1]!.key === region.key
    ))
    || (value.revision === 0) !== (value.lastEventOrdinal === 0)
  ) return null;
  const base = {
    version: REGIONAL_BREADTH_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
    generationVersion: 1 as const,
    baselinePolicyId: REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: value.seedFingerprint,
    activeThroughEpoch: value.activeThroughEpoch,
    activations,
    updatedAtTick: value.updatedAtTick,
    revision: value.revision,
    lastEventOrdinal: value.lastEventOrdinal,
    regions: Object.freeze(regions),
  } as const;
  if (hashCanonical(base) !== value.integrity) return null;
  const root = deepFreeze({ ...base, integrity: value.integrity });
  if (serializedBytes(root) > REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES) {
    return null;
  }
  TRUSTED_ROOTS.add(root);
  return root;
}

export function canonicalRegionalBreadthEcologyRootForWorld(
  value: unknown,
  binding: RegionalBreadthEcologyWorldBinding,
): RegionalBreadthEcologyRootV1 | null {
  try {
    requireBinding(binding);
  } catch {
    return null;
  }
  const root = canonicalizeRegionalBreadthEcologyRoot(value);
  if (
    root === null
    || root.seedFingerprint !== seedFingerprint(binding.rootSeed)
    || root.updatedAtTick !== binding.completedTick
  ) return null;
  if (WORLD_BOUND_ROOTS.get(root) === root.seedFingerprint) return root;
  const expectedActivations = createActivations(
    binding.rootSeed,
    root.activeThroughEpoch,
    0,
  );
  if (root.activations.length !== expectedActivations.length) return null;
  for (let index = 0; index < root.activations.length; index += 1) {
    const activation = root.activations[index]!;
    const expected = expectedActivations[index]!;
    if (
      activation.stableId !== expected.stableId
      || activation.activationOrdinal !== expected.activationOrdinal
      || activation.cohortId !== expected.cohortId
      || activation.cohortEpoch !== expected.cohortEpoch
      || activation.cohortDefinitionHash !== expected.cohortDefinitionHash
    ) return null;
  }
  for (const delta of root.regions) {
    const bound = canonicalizeRegionalBreadthEcologyRegionDelta(
      delta,
      binding.rootSeed,
    );
    if (bound === null || stableStringify(bound) !== stableStringify(delta)) {
      return null;
    }
  }
  WORLD_BOUND_ROOTS.set(root, root.seedFingerprint);
  return root;
}

export function advanceRegionalBreadthEcologyRoot(
  value: unknown,
  completedTick: number,
): RegionalBreadthEcologyRootV1 {
  const root = canonicalizeRegionalBreadthEcologyRoot(value);
  if (
    root === null
    || !nonnegativeSafeInteger(completedTick)
    || completedTick < root.updatedAtTick
  ) throw new RangeError("Regional breadth ecology clock cannot rewind");
  if (completedTick === root.updatedAtTick) return root;
  const { integrity: _integrity, ...base } = root;
  const advanced = sealRoot({ ...base, updatedAtTick: completedTick });
  if (WORLD_BOUND_ROOTS.get(root) === root.seedFingerprint) {
    WORLD_BOUND_ROOTS.set(advanced, advanced.seedFingerprint);
  }
  return advanced;
}

/** Persists only changed, all-coarse states; mere visitation costs no row. */
export function putRegionalBreadthEcologyResidentDeviation(
  value: unknown,
  input: PutRegionalBreadthEcologyResidentDeviationInput,
): RegionalBreadthEcologyRootV1 {
  if (
    !plainRecord(input)
    || !Object.hasOwn(input, "rootSeed")
    || !Object.hasOwn(input, "patch")
    || !plainRecord(input.patch)
  ) throw new TypeError("Regional breadth deviation input is malformed");
  const structural = canonicalizeRegionalBreadthEcologyRoot(value);
  if (structural === null) throw new TypeError("Regional breadth root is malformed");
  const root = canonicalRegionalBreadthEcologyRootForWorld(structural, {
    rootSeed: input.rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null) throw new RangeError("Regional breadth root belongs to another world");
  const activePatch = canonicalCoreEcologyBreadthResidentPatch(input.patch, {
    seed: input.rootSeed,
    region: input.patch.originRegion,
    completedTick: root.updatedAtTick,
  });
  const habitat = habitatFromPatch(activePatch);
  if (
    activePatch === null
    || habitat === null
    || !root.activations.some(({ cohortId }) => cohortId === habitat.cohortId)
  ) throw new RangeError("Regional breadth deviation is unbound or inactive");
  const normalized = setCoreEcologyAggregatePatchMaterializedActors(
    activePatch,
    { atTick: root.updatedAtTick, actorIds: [] },
  );
  const pristine = createCoreEcologyBreadthResidentPatch({
    seed: input.rootSeed,
    habitat: deriveCoreEcologyBreadthHabitat({
      seed: input.rootSeed,
      region: normalized.originRegion,
      cohortId: habitat.cohortId,
    }),
    tick: root.updatedAtTick,
  });
  const pristineState = stableStringify(normalized) === stableStringify(pristine);
  const key = deltaKey(habitat.cohortId, normalized.originRegion);
  const existing = root.regions.find((entry) => entry.key === key);
  if (pristineState && existing === undefined) return root;
  const revision = root.revision + 1;
  const eventOrdinal = root.lastEventOrdinal + 1;
  if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(eventOrdinal)) {
    throw new RangeError("Regional breadth ecology ordinal exhausted");
  }
  const regions = root.regions.filter((entry) => entry.key !== key);
  if (!pristineState) {
    regions.push(createRegionalBreadthEcologyRegionDelta({
      rootSeed: input.rootSeed,
      cohortId: habitat.cohortId,
      region: normalized.originRegion,
      baselineHash: habitat.derivationHash,
      revision: (existing?.revision ?? 0) + 1,
      eventOrdinal,
      residentPatch: normalized,
    }));
  }
  regions.sort((left, right) => compareText(left.key, right.key));
  const { integrity: _integrity, ...base } = root;
  return sealAndBindRoot({
    ...base,
    revision,
    lastEventOrdinal: eventOrdinal,
    regions: Object.freeze(regions),
  });
}

export function regionalBreadthEcologyResidentPatchForRegion(
  value: unknown,
  rootSeed: RootSeed,
  cohortId: CoreEcologyBreadthCohortId,
  region: RegionCoord,
): CoreEcologyAggregatePatchState | null {
  const structural = canonicalizeRegionalBreadthEcologyRoot(value);
  if (structural === null || !isRegionCoord(region)) return null;
  const root = canonicalRegionalBreadthEcologyRootForWorld(structural, {
    rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (
    root === null
    || !root.activations.some((activation) => activation.cohortId === cohortId)
  ) return null;
  const delta = root.regions.find((entry) => (
    entry.key === deltaKey(cohortId, region)
  ));
  if (delta !== undefined) {
    return reconcileCoreEcologyBreadthResidentPatchAtTick(
      delta.residentPatch,
      root.updatedAtTick,
    );
  }
  const habitat = deriveCoreEcologyBreadthHabitat({ seed: rootSeed, region, cohortId });
  return habitat.totalPopulationUnits === 0
    ? null
    : createCoreEcologyBreadthResidentPatch({
        seed: rootSeed,
        habitat,
        tick: root.updatedAtTick,
      });
}

/**
 * Projects each active cohort over one bounded region window. Moved saved
 * residents are found through physical residence without camera-edge respawn.
 */
export function regionalBreadthEcologyResidentsForActiveRegions(
  value: unknown,
  rootSeed: RootSeed,
  regionsValue: readonly RegionCoord[],
): readonly RegionalBreadthEcologyActiveResidentInput[] | null {
  const structural = canonicalizeRegionalBreadthEcologyRoot(value);
  const activeRegions = canonicalRegionsOrNull(regionsValue);
  if (
    structural === null
    || activeRegions === null
    || activeRegions.length === 0
    || activeRegions.length > REGIONAL_BREADTH_COHORT_MAX_ACTIVE_REGIONS
  ) return null;
  const root = canonicalRegionalBreadthEcologyRootForWorld(structural, {
    rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null) return null;
  const activeKeys = new Set(activeRegions.map(regionKey));
  const bySource = new Map<string, RegionalBreadthEcologyActiveResidentInput>();
  const admit = (patchValue: CoreEcologyAggregatePatchState): boolean => {
    const patch = reconcileCoreEcologyBreadthResidentPatchAtTick(
      patchValue,
      root.updatedAtTick,
    );
    const habitat = habitatFromPatch(patch);
    if (
      patch === null
      || habitat === null
      || canonicalCoreEcologyBreadthResidentPatch(patch, {
        seed: rootSeed,
        region: patch.originRegion,
        completedTick: root.updatedAtTick,
      }) === null
    ) return false;
    if (!bySource.has(patch.patchKey)) {
      bySource.set(patch.patchKey, Object.freeze({
        kind: CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
        cohortId: habitat.cohortId,
        cohortEpoch: habitat.cohortEpoch,
        sourceKey: patch.patchKey,
        patch,
      }));
    }
    return true;
  };

  for (const region of activeRegions) {
    for (const activation of root.activations) {
      const delta = root.regions.find((entry) => (
        entry.key === deltaKey(activation.cohortId, region)
      ));
      if (delta !== undefined) {
        if (!admit(delta.residentPatch)) return null;
        continue;
      }
      const habitat = deriveCoreEcologyBreadthHabitat({
        seed: rootSeed,
        region,
        cohortId: activation.cohortId,
      });
      if (habitat.totalPopulationUnits === 0) continue;
      if (!admit(createCoreEcologyBreadthResidentPatch({
        seed: rootSeed,
        habitat,
        tick: root.updatedAtTick,
      }))) return null;
    }
  }
  for (const delta of root.regions) {
    if (activeKeys.has(regionKey(delta.region))) continue;
    const patch = reconcileCoreEcologyBreadthResidentPatchAtTick(
      delta.residentPatch,
      root.updatedAtTick,
    );
    if (patch === null) return null;
    const residences = coreEcologyBreadthResidentPatchResidenceRegions(patch);
    if (residences === null) return null;
    if (residences.some((region) => activeKeys.has(regionKey(region)))) {
      if (!admit(patch)) return null;
    }
  }
  return Object.freeze([...bySource.values()].sort(
    (left, right) => compareText(left.sourceKey, right.sourceKey),
  ));
}

export function serializeRegionalBreadthEcologyRoot(value: unknown): string {
  const root = canonicalizeRegionalBreadthEcologyRoot(value);
  if (root === null) throw new TypeError("Regional breadth ecology root is malformed");
  const text = stableStringify(root);
  if (UTF8_ENCODER.encode(text).byteLength > REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional breadth ecology root exceeds its save budget");
  }
  return text;
}

export function deserializeRegionalBreadthEcologyRoot(
  text: unknown,
): RegionalBreadthEcologyRootV1 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const root = canonicalizeRegionalBreadthEcologyRoot(parsed);
    return root !== null && stableStringify(root) === text ? root : null;
  } catch {
    return null;
  }
}

function createActivations(
  seed: RootSeed,
  activeThroughEpoch: number,
  activatedAtTick: number,
): readonly RegionalBreadthEcologyCohortActivationV1[] {
  return Object.freeze(coreEcologyBreadthCohortsThroughEpoch(activeThroughEpoch).map(
    (cohort, activationOrdinal) => createActivation(
      seed,
      cohort,
      activationOrdinal,
      activatedAtTick,
    ),
  ));
}

function createActivation(
  seed: RootSeed,
  cohort: CoreEcologyBreadthCohortDefinition,
  activationOrdinal: number,
  activatedAtTick: number,
): RegionalBreadthEcologyCohortActivationV1 {
  const base = {
    version: REGIONAL_BREADTH_ECOLOGY_ACTIVATION_VERSION,
    activationOrdinal,
    cohortId: cohort.cohortId,
    cohortEpoch: cohort.introducedInEpoch,
    cohortDefinitionHash: cohort.definitionHash,
    activatedAtTick,
    stableId: `breadth-activation:${hashCanonical([
      seedFingerprint(seed),
      activationOrdinal,
      cohort.cohortId,
      cohort.introducedInEpoch,
    ])}`,
  } as const;
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

function canonicalActivations(
  values: readonly unknown[],
  activeThroughEpoch: number,
  updatedAtTick: number,
): readonly RegionalBreadthEcologyCohortActivationV1[] | null {
  const expected = coreEcologyBreadthCohortsThroughEpoch(activeThroughEpoch);
  if (values.length !== expected.length) return null;
  const activations: RegionalBreadthEcologyCohortActivationV1[] = [];
  for (let index = 0; index < expected.length; index += 1) {
    const value = values[index];
    const cohort = expected[index];
    if (
      cohort === undefined
      || !plainRecord(value)
      || !exactKeys(value, [
        "activatedAtTick",
        "activationOrdinal",
        "cohortDefinitionHash",
        "cohortEpoch",
        "cohortId",
        "integrity",
        "stableId",
        "version",
      ])
      || value.version !== REGIONAL_BREADTH_ECOLOGY_ACTIVATION_VERSION
      || value.activationOrdinal !== index
      || value.cohortId !== cohort.cohortId
      || value.cohortEpoch !== cohort.introducedInEpoch
      || value.cohortDefinitionHash !== cohort.definitionHash
      || !nonnegativeSafeInteger(value.activatedAtTick)
      || value.activatedAtTick > updatedAtTick
      || !validId(value.stableId)
      || !validHash(value.integrity)
    ) return null;
    const base = {
      version: REGIONAL_BREADTH_ECOLOGY_ACTIVATION_VERSION,
      activationOrdinal: index,
      cohortId: cohort.cohortId,
      cohortEpoch: cohort.introducedInEpoch,
      cohortDefinitionHash: cohort.definitionHash,
      activatedAtTick: value.activatedAtTick,
      stableId: value.stableId,
    } as const;
    if (hashCanonical(base) !== value.integrity) return null;
    activations.push(deepFreeze({ ...base, integrity: value.integrity }));
  }
  return Object.freeze(activations);
}

function canonicalDeltaPatch(
  value: unknown,
  region: RegionCoord,
  cohortId: CoreEcologyBreadthCohortId,
  baselineHash: string,
): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as Readonly<{
    readonly kind?: unknown;
    readonly habitat?: Readonly<{
      readonly cohortId?: unknown;
      readonly derivationHash?: unknown;
    }>;
  }> | undefined;
  if (
    patch === null
    || stableStringify(patch) !== stableStringify(value)
    || derivation?.kind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
    || derivation.habitat?.cohortId !== cohortId
    || derivation.habitat.derivationHash !== baselineHash
    || patch.originRegion.x !== region.x
    || patch.originRegion.y !== region.y
    || patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
    || !coreEcologyBreadthResidentPatchIsAllCoarse(patch)
  ) return null;
  return patch;
}

function habitatFromPatch(
  patch: CoreEcologyAggregatePatchState | null,
): Readonly<{
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly derivationHash: string;
}> | null {
  const habitat = (patch?.derivation as unknown as Readonly<{
    readonly kind?: unknown;
    readonly habitat?: unknown;
  }> | undefined)?.habitat;
  if (
    patch === null
    || (patch.derivation as Readonly<{ readonly kind: string }>).kind
      !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
    || !plainRecord(habitat)
    || typeof habitat.cohortId !== "string"
    || coreEcologyBreadthCohortDefinition(
      habitat.cohortId as CoreEcologyBreadthCohortId,
    ) === null
    || !positiveSafeInteger(habitat.cohortEpoch)
    || !validHash(habitat.derivationHash)
  ) return null;
  return habitat as unknown as Readonly<{
    readonly cohortId: CoreEcologyBreadthCohortId;
    readonly cohortEpoch: number;
    readonly derivationHash: string;
  }>;
}

function deltaKey(cohortId: CoreEcologyBreadthCohortId, region: RegionCoord): string {
  return `${cohortId}@${regionKey(region)}`;
}

function sealRoot(
  value: Omit<RegionalBreadthEcologyRootV1, "integrity">,
): RegionalBreadthEcologyRootV1 {
  const root = canonicalizeRegionalBreadthEcologyRoot({
    ...value,
    integrity: hashCanonical(value),
  });
  if (root === null) throw new Error("Generated regional breadth root failed validation");
  return root;
}

function sealAndBindRoot(
  value: Omit<RegionalBreadthEcologyRootV1, "integrity">,
): RegionalBreadthEcologyRootV1 {
  const root = sealRoot(value);
  WORLD_BOUND_ROOTS.set(root, root.seedFingerprint);
  return root;
}

function seedFingerprint(seed: RootSeed): string {
  requireRootSeed(seed);
  return hashCanonical([...seed]);
}

function requireAvailableEpoch(value: number): void {
  if (
    !nonnegativeSafeInteger(value)
    || value > CORE_ECOLOGY_BREADTH_CURRENT_EPOCH
  ) throw new RangeError("Regional breadth epoch is not in the current registry");
}

function requireBinding(binding: RegionalBreadthEcologyWorldBinding): void {
  if (
    !plainRecord(binding)
    || !Object.hasOwn(binding, "rootSeed")
    || !Object.hasOwn(binding, "completedTick")
  ) throw new TypeError("Regional breadth ecology requires a world binding");
  requireRootSeed(binding.rootSeed as RootSeed);
  if (!nonnegativeSafeInteger(binding.completedTick)) {
    throw new RangeError("Regional breadth ecology tick must be nonnegative");
  }
}

function requireRootSeed(seed: RootSeed): void {
  if (
    !Array.isArray(seed)
    || seed.length !== 4
    || seed.some((word) => (
      !Number.isSafeInteger(word)
      || word < 0
      || word > UINT32_MAX
      || Object.is(word, -0)
    ))
  ) throw new RangeError("Regional breadth seed must contain four uint32 words");
}

function canonicalRegionsOrNull(value: unknown): readonly RegionCoord[] | null {
  if (!Array.isArray(value)) return null;
  const regions = new Map<string, RegionCoord>();
  for (const raw of value) {
    if (!isRegionCoord(raw)) return null;
    regions.set(regionKey(raw), createRegionCoord(raw.x, raw.y));
  }
  if (regions.size !== value.length) return null;
  return Object.freeze([...regions.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, region]) => region));
}

function serializedBytes(value: unknown): number {
  return UTF8_ENCODER.encode(stableStringify(value)).byteLength;
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function plainRecord(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, any>, keys: readonly string[]): boolean {
  return stableStringify(Object.keys(value).sort(compareText))
    === stableStringify([...keys].sort(compareText));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
