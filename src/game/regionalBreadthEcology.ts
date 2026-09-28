import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  regionKey,
  stableRegionId,
  stableRegionObjectId,
  type RegionCoord,
} from "../sim/regions";
import {
  canonicalIntegrityMetrics,
  compareText,
  hashCanonical,
  stableStringify,
} from "../sim/util";
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
/** Released Alpha-37–39 roots replay every cohort from civil tick zero. */
export const REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID =
  CORE_ECOLOGY_BREADTH_DERIVATION_KIND;
/** New roots begin each cohort at its already-persisted activation tick. */
export const REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID =
  "regional-breadth-activation-clock:v1" as const;
type RegionalBreadthEcologyBaselinePolicyId =
  | typeof REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID
  | typeof REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID;
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
  readonly baselinePolicyId: RegionalBreadthEcologyBaselinePolicyId;
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

/**
 * Authenticated V6 snapshot custody used only to prove that a hot-window
 * receipt still describes the exact prior active lineage set. The patches
 * themselves remain private to this module and are never accepted from the
 * runtime commit output.
 */
export interface RegionalBreadthEcologyActiveReceiptClaim {
  readonly sourceKey: string;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
}

export interface RegionalBreadthEcologyDurableResidentInput {
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface AdvanceRegionalBreadthEcologyActiveResidentsInput {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
  readonly activeRegions: readonly RegionCoord[];
  readonly expectedResidents: readonly RegionalBreadthEcologyActiveReceiptClaim[];
  readonly durableResidents?: readonly RegionalBreadthEcologyDurableResidentInput[];
}

export interface AdvanceRegionalBreadthEcologyActiveResidentsResult {
  readonly root: RegionalBreadthEcologyRootV1;
  readonly residents: readonly RegionalBreadthEcologyActiveResidentInput[];
}

/**
 * Private-process proof carried from one complete breadth advance into the V6
 * wrapper. The values are exported only so the consuming owner can type its
 * local fast path; callers cannot mint one because admission is backed by the
 * exact result object in this module's one-shot WeakMap.
 */
export interface RegionalBreadthEcologyAdvancedResidentReceipt {
  readonly resident: RegionalBreadthEcologyActiveResidentInput;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly sourceKey: string;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
}

export interface ConsumeRegionalBreadthEcologyAdvanceReceiptInput {
  readonly sourceRoot: RegionalBreadthEcologyRootV1;
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
  readonly activeRegions: readonly RegionCoord[];
}

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const UINT32_MAX = 0xffff_ffff;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_ROOTS = new WeakSet<object>();
const WORLD_BOUND_ROOTS = new WeakMap<object, string>();
interface RegionalBreadthEcologyActiveReceiptResident {
  readonly sourceKey: string;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly regionKey: string;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
  /**
   * Exact process-local pristine baseline for this lineage. A sparse resident
   * may retain an older tick here: the next durable comparison reconciles it
   * through the ordinary dormant authority before use. Missing provenance is
   * represented by null and always takes the full deterministic constructor.
   */
  readonly pristinePatch: CoreEcologyAggregatePatchState | null;
}

interface RegionalBreadthEcologyActiveReceipt {
  readonly rootSeed: RootSeed;
  readonly atTick: number;
  readonly activations: RegionalBreadthEcologyRootV1["activations"];
  readonly activeRegionKeys: readonly string[];
  readonly residents: readonly RegionalBreadthEcologyActiveReceiptResident[];
  /**
   * Exact sealed size published by this module's private prepared-root
   * transaction. Roots derived by any other path deliberately carry no byte
   * receipt and retain the ordinary canonical serialization fallback.
   */
  readonly sealedRootSerializedBytes: number | null;
}

/** One bounded hot-window receipt per exact immutable root identity. */
const ACTIVE_RESIDENT_RECEIPTS = new WeakMap<
  object,
  RegionalBreadthEcologyActiveReceipt
>();

interface RegionalBreadthEcologyAdvanceResultReceipt {
  readonly sourceRoot: RegionalBreadthEcologyRootV1;
  readonly resultRoot: RegionalBreadthEcologyRootV1;
  readonly resultResidents: readonly RegionalBreadthEcologyActiveResidentInput[];
  readonly rootSeedIdentity: RootSeed;
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
  readonly activeRegionsIdentity: readonly RegionCoord[];
  readonly activeRegionKeys: readonly string[];
  readonly activeReceipt: RegionalBreadthEcologyActiveReceipt;
  readonly residents: readonly RegionalBreadthEcologyAdvancedResidentReceipt[];
}

/** One bounded bridge receipt per exact frozen advance result. */
const ADVANCE_RESULT_RECEIPTS = new WeakMap<
  object,
  RegionalBreadthEcologyAdvanceResultReceipt
>();

export function createPristineRegionalBreadthEcologyRoot(
  binding: RegionalBreadthEcologyWorldBinding,
  activeThroughEpoch: number = CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
  baselinePolicyId: RegionalBreadthEcologyBaselinePolicyId =
    REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID,
): RegionalBreadthEcologyRootV1 {
  requireBinding(binding);
  requireAvailableEpoch(activeThroughEpoch);
  requireBaselinePolicy(baselinePolicyId);
  return sealAndBindRoot({
    version: REGIONAL_BREADTH_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
    generationVersion: 1,
    baselinePolicyId,
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
    /** Omitted legacy callers preserve the released tick-zero baseline. */
    readonly baselineTick?: number;
    readonly region: RegionCoord;
    readonly baselineHash: string;
    readonly revision: number;
    readonly eventOrdinal: number;
    readonly residentPatch: CoreEcologyAggregatePatchState;
  }>,
): RegionalBreadthEcologyRegionDeltaV1 {
  requireRootSeed(input.rootSeed);
  const cohort = coreEcologyBreadthCohortDefinition(input.cohortId);
  const baselineTick = input.baselineTick ?? 0;
  if (
    cohort === null
    || !nonnegativeSafeInteger(baselineTick)
    || baselineTick > input.residentPatch.updatedAtTick
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
    baselineTick,
  });
  if (stableStringify(pristine) === stableStringify(patch)) {
    throw new RangeError("Regional breadth ecology does not persist pristine baselines");
  }
  return sealPreparedRegionalBreadthEcologyRegionDelta({
    rootSeed: input.rootSeed,
    cohort,
    region: input.region,
    baselineHash: input.baselineHash,
    revision: input.revision,
    eventOrdinal: input.eventOrdinal,
    residentPatch: patch,
  });
}

/**
 * Seal one delta after its caller has already proved the canonical bound patch,
 * cohort metadata, all-coarse state, and non-pristine baseline. This remains
 * private so no structural clone, load, or unvalidated runtime patch can bypass
 * the public constructor's complete authority checks.
 */
function sealPreparedRegionalBreadthEcologyRegionDelta(
  input: Readonly<{
    readonly rootSeed: RootSeed;
    readonly cohort: CoreEcologyBreadthCohortDefinition;
    readonly region: RegionCoord;
    readonly baselineHash: string;
    readonly revision: number;
    readonly eventOrdinal: number;
    readonly residentPatch: CoreEcologyAggregatePatchState;
  }>,
): RegionalBreadthEcologyRegionDeltaV1 {
  const key = deltaKey(input.cohort.cohortId, input.region);
  const base = {
    version: REGIONAL_BREADTH_ECOLOGY_DELTA_VERSION,
    stableId: stableRegionObjectId(
      input.rootSeed,
      input.region,
      "breadth-deviation",
      `${input.cohort.cohortId}:e${input.cohort.introducedInEpoch}`,
    ),
    cohortId: input.cohort.cohortId,
    cohortEpoch: input.cohort.introducedInEpoch,
    cohortDefinitionHash: input.cohort.definitionHash,
    region: createRegionCoord(input.region.x, input.region.y),
    key,
    regionId: stableRegionId(input.rootSeed, input.region),
    baselineHash: input.baselineHash,
    revision: input.revision,
    eventOrdinal: input.eventOrdinal,
    residentPatch: input.residentPatch,
    residentPatchHash: hashCanonical(input.residentPatch),
  } as const;
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

export function canonicalizeRegionalBreadthEcologyRegionDelta(
  value: unknown,
  rootSeed?: RootSeed,
  baselineTick = 0,
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
      !nonnegativeSafeInteger(baselineTick)
      || baselineTick > delta.residentPatch.updatedAtTick
    ) return null;
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
      baselineTick,
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
    || !isBaselinePolicy(value.baselinePolicyId)
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
    baselinePolicyId: value.baselinePolicyId,
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
    const baselineTick = breadthCohortBaselineTick(root, delta.cohortId);
    if (baselineTick === null) return null;
    const bound = canonicalizeRegionalBreadthEcologyRegionDelta(
      delta,
      binding.rootSeed,
      baselineTick,
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
  const baselineTick = habitat === null
    ? null
    : breadthCohortBaselineTick(root, habitat.cohortId);
  if (
    activePatch === null
    || habitat === null
    || baselineTick === null
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
    baselineTick,
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
      baselineTick,
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
  const baselineTick = breadthCohortBaselineTick(root, cohortId);
  if (baselineTick === null) return null;
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
        baselineTick,
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
      || !coreEcologyBreadthResidentPatchIsAllCoarse(patch)
      || patch.nextMortalityOrdinal !== 0
      || patch.mortalityTransactions.length !== 0
      || patch.carcasses.length !== 0
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
      const baselineTick = breadthCohortBaselineTick(root, activation.cohortId);
      if (baselineTick === null) return null;
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
        baselineTick,
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
  const residents = Object.freeze([...bySource.values()].sort(
    (left, right) => compareText(left.sourceKey, right.sourceKey),
  ));
  seedActiveResidentReceipt(root, rootSeed, activeRegions, residents);
  return residents;
}

/**
 * Advances one active breadth set from a prior authoritative derivation. Any
 * durable runtime patches are first rebound to the receipt lineage and applied
 * through one closed sparse-root transaction. Presentation and visitation
 * output is never accepted: unchanged sources advance only from this owner's
 * private receipt and sparse root.
 *
 * Any missing custody proof fails closed so the caller can use the ordinary
 * advance + sparse-put + full-derivation transaction.
 */
export function advanceRegionalBreadthEcologyActiveResidentsFromReceipt(
  value: unknown,
  input: AdvanceRegionalBreadthEcologyActiveResidentsInput,
): AdvanceRegionalBreadthEcologyActiveResidentsResult | null {
  if (
    typeof value !== "object"
    || value === null
    || !plainRecord(input)
    || (!exactKeys(input, [
      "activeRegions",
      "completedTick",
      "expectedResidents",
      "rootSeed",
    ]) && !exactKeys(input, [
      "activeRegions",
      "completedTick",
      "durableResidents",
      "expectedResidents",
      "rootSeed",
    ]))
    || !Array.isArray(input.activeRegions)
    || (input.durableResidents !== undefined
      && !Array.isArray(input.durableResidents))
    || !Array.isArray(input.expectedResidents)
    || !nonnegativeSafeInteger(input.completedTick)
  ) return null;
  const receipt = ACTIVE_RESIDENT_RECEIPTS.get(value);
  if (receipt === undefined) return null;
  const activeRegions = canonicalRegionsOrNull(input.activeRegions);
  const claims = canonicalActiveReceiptClaimsOrNull(input.expectedResidents);
  if (
    activeRegions === null
    || activeRegions.length === 0
    || activeRegions.length > REGIONAL_BREADTH_COHORT_MAX_ACTIVE_REGIONS
    || claims === null
    || !sameRootSeed(input.rootSeed, receipt.rootSeed)
    || input.completedTick < receipt.atTick
    || !sameTextSequence(
      activeRegions.map(regionKey),
      receipt.activeRegionKeys,
    )
    || !claimsMatchActiveReceipt(claims, receipt.residents)
  ) return null;
  const root = canonicalRegionalBreadthEcologyRootForWorld(value, {
    rootSeed: input.rootSeed,
    completedTick: receipt.atTick,
  });
  if (
    root === null
    || root !== value
    || root.updatedAtTick !== receipt.atTick
    || root.activations !== receipt.activations
  ) return null;

  try {
    const batch = applyActiveResidentDeviationBatch(
      root,
      input.rootSeed,
      input.completedTick,
      input.durableResidents ?? Object.freeze([]),
      receipt,
    );
    if (batch === null) return null;
    const nextRoot = batch.root;
    const activeKeys = new Set(activeRegions.map(regionKey));
    const bySource = new Map<string, RegionalBreadthEcologyActiveResidentInput>();
    const receiptSourceKeys = new Set(
      receipt.residents.map(({ sourceKey }) => sourceKey),
    );
    const admit = (
      patch: CoreEcologyAggregatePatchState,
      expectedLineageHash?: string,
    ): boolean => {
      const habitat = habitatFromPatch(patch);
      if (
        patch === null
        || habitat === null
        || !nextRoot.activations.some(({ cohortId, cohortEpoch }) => (
          cohortId === habitat.cohortId && cohortEpoch === habitat.cohortEpoch
        ))
        || !coreEcologyBreadthResidentPatchIsAllCoarse(patch)
        || patch.nextMortalityOrdinal !== 0
        || patch.mortalityTransactions.length !== 0
        || patch.carcasses.length !== 0
        || canonicalCoreEcologyBreadthResidentPatch(patch, {
          seed: input.rootSeed,
          region: patch.originRegion,
          completedTick: input.completedTick,
        }) === null
        || (expectedLineageHash !== undefined
          && breadthResidentLineageHash(patch) !== expectedLineageHash)
        || bySource.has(patch.patchKey)
      ) return false;
      bySource.set(patch.patchKey, Object.freeze({
        kind: CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
        cohortId: habitat.cohortId,
        cohortEpoch: habitat.cohortEpoch,
        sourceKey: patch.patchKey,
        patch,
      }));
      return true;
    };

    for (const resident of receipt.residents) {
      const replacement = batch.durableBySource.get(resident.sourceKey);
      const patch = replacement ?? reconcileCoreEcologyBreadthResidentPatchAtTick(
        resident.patch,
        input.completedTick,
      );
      if (patch === null) return null;
      const originIsActive = activeKeys.has(regionKey(patch.originRegion));
      const residences = originIsActive
        ? Object.freeze([]) as readonly RegionCoord[]
        : coreEcologyBreadthResidentPatchResidenceRegions(patch);
      if (residences === null) return null;
      if (
        (originIsActive
          || residences.some((region) => activeKeys.has(regionKey(region))))
        && !admit(patch, resident.lineageHash)
      ) return null;
    }

    // A dormant sparse deviation can enter the window between ticks. Scan
    // every source not represented by the prior hot receipt so physical
    // residence—not lineage origin—continues to govern admission.
    for (const delta of nextRoot.regions) {
      if (receiptSourceKeys.has(delta.residentPatch.patchKey)) continue;
      if (activeKeys.has(regionKey(delta.region))) return null;
      const patch = reconcileCoreEcologyBreadthResidentPatchAtTick(
        delta.residentPatch,
        input.completedTick,
      );
      if (patch === null) return null;
      const residences = coreEcologyBreadthResidentPatchResidenceRegions(patch);
      if (residences === null) return null;
      if (
        residences.some((region) => activeKeys.has(regionKey(region)))
        && !admit(patch)
      ) return null;
    }

    const residents = Object.freeze([...bySource.values()].sort(
      (left, right) => compareText(left.sourceKey, right.sourceKey),
    ));
    const maximumResidents = activeRegions.length * nextRoot.activations.length
      + nextRoot.regions.length;
    if (residents.length > maximumResidents) return null;
    const activeReceipt = seedActiveResidentReceipt(
      nextRoot,
      input.rootSeed,
      activeRegions,
      residents,
      batch.pristineBySource,
      batch.sealedRootSerializedBytes,
    );
    if (activeReceipt === null) return null;
    const result = Object.freeze({ root: nextRoot, residents });
    seedAdvanceResultReceipt(
      result,
      root,
      input.rootSeed,
      input.completedTick,
      input.activeRegions,
      activeReceipt,
    );
    return result;
  } catch {
    return null;
  }
}

/**
 * @internal Consume the exact process-local bridge into the V6 wrapper. The
 * receipt is deleted before any check, so a failed or successful attempt can
 * never turn one authoritative advance into multiple prepared assemblies.
 */
export function consumeRegionalBreadthEcologyAdvanceResultReceipt(
  value: unknown,
  input: ConsumeRegionalBreadthEcologyAdvanceReceiptInput,
): readonly RegionalBreadthEcologyAdvancedResidentReceipt[] | null {
  if (typeof value !== "object" || value === null) return null;
  const receipt = ADVANCE_RESULT_RECEIPTS.get(value);
  ADVANCE_RESULT_RECEIPTS.delete(value);
  if (
    receipt === undefined
    || !plainRecord(input)
    || !exactKeys(input, [
      "activeRegions",
      "completedTick",
      "rootSeed",
      "sourceRoot",
    ])
    || typeof input.sourceRoot !== "object"
    || input.sourceRoot === null
    || !Array.isArray(input.rootSeed)
    || !Array.isArray(input.activeRegions)
    || !nonnegativeSafeInteger(input.completedTick)
    || !plainRecord(value)
    || !exactKeys(value, ["residents", "root"])
    || !Object.isFrozen(value)
    || value.root !== receipt.resultRoot
    || value.residents !== receipt.resultResidents
    || input.sourceRoot !== receipt.sourceRoot
    || input.rootSeed !== receipt.rootSeedIdentity
    || !sameRootSeed(input.rootSeed, receipt.rootSeed)
    || input.completedTick !== receipt.completedTick
    || input.activeRegions !== receipt.activeRegionsIdentity
    || !Object.isFrozen(receipt.resultRoot)
    || !Object.isFrozen(receipt.resultResidents)
    || ACTIVE_RESIDENT_RECEIPTS.get(receipt.resultRoot) !== receipt.activeReceipt
  ) return null;
  const activeRegions = canonicalRegionsOrNull(input.activeRegions);
  if (
    activeRegions === null
    || !sameTextSequence(activeRegions.map(regionKey), receipt.activeRegionKeys)
    || receipt.residents.length !== receipt.resultResidents.length
  ) return null;
  for (let index = 0; index < receipt.residents.length; index += 1) {
    const metadata = receipt.residents[index]!;
    const resident = receipt.resultResidents[index]!;
    if (
      metadata.resident !== resident
      || metadata.patch !== resident.patch
      || !Object.isFrozen(resident)
      || !Object.isFrozen(resident.patch)
      || resident.sourceKey !== metadata.sourceKey
      || resident.cohortId !== metadata.cohortId
      || resident.cohortEpoch !== metadata.cohortEpoch
      || regionKey(resident.patch.originRegion) !== regionKey(metadata.region)
    ) return null;
  }
  return receipt.residents;
}

interface RegionalBreadthEcologyActiveDeviationBatch {
  readonly root: RegionalBreadthEcologyRootV1;
  readonly sealedRootSerializedBytes: number;
  readonly durableBySource: ReadonlyMap<string, CoreEcologyAggregatePatchState>;
  readonly pristineBySource: ReadonlyMap<string, CoreEcologyAggregatePatchState>;
}

/**
 * Reproduces source-ordered scalar put semantics while sealing the immutable
 * root only once. Validation completes before a candidate root is assembled,
 * so a malformed member cannot partially commit the batch.
 */
function applyActiveResidentDeviationBatch(
  root: RegionalBreadthEcologyRootV1,
  rootSeed: RootSeed,
  completedTick: number,
  values: readonly RegionalBreadthEcologyDurableResidentInput[],
  receipt: RegionalBreadthEcologyActiveReceipt,
): RegionalBreadthEcologyActiveDeviationBatch | null {
  if (
    completedTick < root.updatedAtTick
    || values.length > receipt.residents.length
  ) return null;
  const rootSerializedBytes = receipt.sealedRootSerializedBytes
    ?? serializedBytes(root);
  if (!nonnegativeSafeInteger(rootSerializedBytes)) return null;
  // The scalar transaction advances the root clock before applying any put.
  // That operation changes only this nonnegative safe-integer token; the
  // replacement integrity digest is fixed-width ASCII. This digit delta is
  // therefore the exact clock-only sealed-root byte size without a second
  // canonical seal, and preserves the scalar path's pre-write budget failure.
  const clockAdvancedSerializedBytes = rootSerializedBytes
    + String(completedTick).length
    - String(root.updatedAtTick).length;
  if (clockAdvancedSerializedBytes > REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES) {
    return null;
  }
  const receiptBySource = new Map(
    receipt.residents.map((resident) => [resident.sourceKey, resident]),
  );
  const durableBySource = new Map<string, CoreEcologyAggregatePatchState>();
  const pristineBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const resident of receipt.residents) {
    if (resident.pristinePatch !== null) {
      pristineBySource.set(resident.sourceKey, resident.pristinePatch);
    }
  }
  for (const raw of values) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || durableBySource.has(raw.sourceKey)
      || !plainRecord(raw.patch)
    ) return null;
    const prior = receiptBySource.get(raw.sourceKey);
    if (prior === undefined) return null;
    const bound = canonicalCoreEcologyBreadthResidentPatch(raw.patch, {
      seed: rootSeed,
      region: prior.patch.originRegion,
      completedTick,
    });
    if (bound === null || bound.patchKey !== raw.sourceKey) return null;
    const normalized = setCoreEcologyAggregatePatchMaterializedActors(bound, {
      atTick: completedTick,
      actorIds: [],
    });
    const habitat = habitatFromPatch(normalized);
    if (
      habitat === null
      || habitat.cohortId !== prior.cohortId
      || habitat.cohortEpoch !== prior.cohortEpoch
      || regionKey(normalized.originRegion) !== prior.regionKey
      || breadthResidentLineageHash(normalized) !== prior.lineageHash
      || !coreEcologyBreadthResidentPatchIsAllCoarse(normalized)
      || normalized.nextMortalityOrdinal !== 0
      || normalized.mortalityTransactions.length !== 0
      || normalized.carcasses.length !== 0
    ) return null;
    durableBySource.set(raw.sourceKey, normalized);
  }

  const ordered = [...durableBySource.entries()].sort(
    ([left], [right]) => compareText(left, right),
  );
  const regionsByKey = new Map(root.regions.map((delta) => [delta.key, delta]));
  let serializedUpperBound = values.length === 0
    ? 0
    : rootSerializedBytes + 256;
  let revision = root.revision;
  let eventOrdinal = root.lastEventOrdinal;
  let changed = false;
  const preparedDeltas = new Set<RegionalBreadthEcologyRegionDeltaV1>();
  for (const [, normalized] of ordered) {
    const habitat = habitatFromPatch(normalized);
    if (habitat === null) return null;
    const cohort = coreEcologyBreadthCohortDefinition(habitat.cohortId);
    const baselineTick = breadthCohortBaselineTick(root, habitat.cohortId);
    if (
      cohort === null
      || cohort.introducedInEpoch !== habitat.cohortEpoch
      || baselineTick === null
      || !root.activations.some(({ cohortId }) => cohortId === habitat.cohortId)
    ) return null;
    const prior = receiptBySource.get(normalized.patchKey);
    if (prior === undefined) return null;
    let pristine = prior.pristinePatch === null
      ? null
      : reconcileCoreEcologyBreadthResidentPatchAtTick(
          prior.pristinePatch,
          completedTick,
        );
    if (
      pristine === null
      || pristine.patchKey !== normalized.patchKey
      || pristine.derivation.kind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
      || pristine.derivation.habitat.cohortId !== habitat.cohortId
      || pristine.derivation.habitat.cohortEpoch !== habitat.cohortEpoch
      || regionKey(pristine.originRegion) !== prior.regionKey
      || pristine.updatedAtTick !== completedTick
    ) {
      pristine = createCoreEcologyBreadthResidentPatch({
        seed: rootSeed,
        habitat: deriveCoreEcologyBreadthHabitat({
          seed: rootSeed,
          region: normalized.originRegion,
          cohortId: habitat.cohortId,
        }),
        tick: completedTick,
        baselineTick,
      });
    }
    pristineBySource.set(normalized.patchKey, pristine);
    const pristineState = stableStringify(normalized) === stableStringify(pristine);
    const key = deltaKey(habitat.cohortId, normalized.originRegion);
    const existing = regionsByKey.get(key);
    if (pristineState && existing === undefined) continue;
    revision += 1;
    eventOrdinal += 1;
    if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(eventOrdinal)) {
      return null;
    }
    changed = true;
    regionsByKey.delete(key);
    if (!pristineState) {
      const delta = sealPreparedRegionalBreadthEcologyRegionDelta({
        rootSeed,
        cohort,
        region: normalized.originRegion,
        baselineHash: habitat.derivationHash,
        revision: (existing?.revision ?? 0) + 1,
        eventOrdinal,
        residentPatch: normalized,
      });
      serializedUpperBound += serializedBytes(delta) + 1;
      if (serializedUpperBound > REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES) {
        return null;
      }
      preparedDeltas.add(delta);
      regionsByKey.set(key, delta);
    }
    if (regionsByKey.size > REGIONAL_BREADTH_ECOLOGY_MAX_REGIONS) return null;
  }

  let nextRoot = root;
  let sealedRootSerializedBytes = rootSerializedBytes;
  if (completedTick !== root.updatedAtTick || changed) {
    const regions = Object.freeze([...regionsByKey.values()].sort(
      (left, right) => compareText(left.key, right.key),
    ));
    const { integrity: _integrity, ...base } = root;
    const candidate = {
      ...base,
      updatedAtTick: completedTick,
      revision,
      lastEventOrdinal: eventOrdinal,
      regions,
    } as const;
    const prepared = sealPreparedAndBindRoot(
      candidate,
      root,
      receipt,
      preparedDeltas,
    );
    if (prepared === null) {
      // Provenance uncertainty must retain the complete public validator. This
      // branch is deliberately ordinary authority, not another fast path.
      nextRoot = sealAndBindRoot(candidate);
      sealedRootSerializedBytes = serializedBytes(nextRoot);
    } else {
      nextRoot = prepared.root;
      sealedRootSerializedBytes = prepared.sealedSerializedBytes;
    }
  }
  return Object.freeze({
    root: nextRoot,
    sealedRootSerializedBytes,
    durableBySource,
    pristineBySource,
  });
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

function breadthCohortBaselineTick(
  root: RegionalBreadthEcologyRootV1,
  cohortId: CoreEcologyBreadthCohortId,
): number | null {
  const activation = root.activations.find((candidate) => (
    candidate.cohortId === cohortId
  ));
  if (activation === undefined) return null;
  return root.baselinePolicyId === REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID
    ? activation.activatedAtTick
    : 0;
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
    || (patch !== value && stableStringify(patch) !== stableStringify(value))
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

function seedActiveResidentReceipt(
  root: RegionalBreadthEcologyRootV1,
  rootSeed: RootSeed,
  activeRegions: readonly RegionCoord[],
  residents: readonly RegionalBreadthEcologyActiveResidentInput[],
  preparedPristineBySource: ReadonlyMap<
    string,
    CoreEcologyAggregatePatchState
  > = new Map(),
  sealedRootSerializedBytes: number | null = null,
): RegionalBreadthEcologyActiveReceipt | null {
  const maximumResidents = activeRegions.length * root.activations.length
    + root.regions.length;
  if (
    residents.length > maximumResidents
    || (sealedRootSerializedBytes !== null && (
      !nonnegativeSafeInteger(sealedRootSerializedBytes)
      || sealedRootSerializedBytes > REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES
    ))
  ) return null;
  const receiptResidents: RegionalBreadthEcologyActiveReceiptResident[] = [];
  const seen = new Set<string>();
  const deviationKeys = new Set(root.regions.map(({ key }) => key));
  for (const resident of residents) {
    const habitat = habitatFromPatch(resident.patch);
    if (
      habitat === null
      || resident.sourceKey !== resident.patch.patchKey
      || resident.cohortId !== habitat.cohortId
      || resident.cohortEpoch !== habitat.cohortEpoch
      || resident.patch.updatedAtTick !== root.updatedAtTick
      || seen.has(resident.sourceKey)
      || !coreEcologyBreadthResidentPatchIsAllCoarse(resident.patch)
      || resident.patch.nextMortalityOrdinal !== 0
      || resident.patch.mortalityTransactions.length !== 0
      || resident.patch.carcasses.length !== 0
    ) return null;
    seen.add(resident.sourceKey);
    const hasDeviation = deviationKeys.has(deltaKey(
      habitat.cohortId,
      resident.patch.originRegion,
    ));
    const preparedPristine = preparedPristineBySource.get(resident.sourceKey);
    const pristinePatch = hasDeviation
      ? receiptPristinePatchOrNull(preparedPristine, resident, root.updatedAtTick)
      : resident.patch;
    receiptResidents.push(Object.freeze({
      sourceKey: resident.sourceKey,
      cohortId: resident.cohortId,
      cohortEpoch: resident.cohortEpoch,
      regionKey: regionKey(resident.patch.originRegion),
      patchHash: hashCanonical(resident.patch),
      lineageHash: breadthResidentLineageHash(resident.patch),
      patch: resident.patch,
      pristinePatch,
    }));
  }
  receiptResidents.sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  const receipt = Object.freeze({
    rootSeed: Object.freeze([
      rootSeed[0],
      rootSeed[1],
      rootSeed[2],
      rootSeed[3],
    ] as [number, number, number, number]),
    atTick: root.updatedAtTick,
    activations: root.activations,
    activeRegionKeys: Object.freeze(activeRegions.map(regionKey)),
    residents: Object.freeze(receiptResidents),
    sealedRootSerializedBytes,
  });
  ACTIVE_RESIDENT_RECEIPTS.set(root, receipt);
  return receipt;
}

/**
 * Admit only an exact immutable baseline produced inside this module's active
 * receipt transaction. This is acceleration metadata, never public or saved
 * authority; any uncertainty discards it and preserves the full constructor.
 */
function receiptPristinePatchOrNull(
  patch: CoreEcologyAggregatePatchState | undefined,
  resident: RegionalBreadthEcologyActiveResidentInput,
  receiptTick: number,
): CoreEcologyAggregatePatchState | null {
  const habitat = habitatFromPatch(patch ?? null);
  return patch !== undefined
    && Object.isFrozen(patch)
    && habitat !== null
    && patch.patchKey === resident.sourceKey
    && habitat.cohortId === resident.cohortId
    && habitat.cohortEpoch === resident.cohortEpoch
    && regionKey(patch.originRegion) === regionKey(resident.patch.originRegion)
    && patch.updatedAtTick <= receiptTick
    && coreEcologyBreadthResidentPatchIsAllCoarse(patch)
    && patch.nextMortalityOrdinal === 0
    && patch.mortalityTransactions.length === 0
    && patch.carcasses.length === 0
      ? patch
      : null;
}

function seedAdvanceResultReceipt(
  result: AdvanceRegionalBreadthEcologyActiveResidentsResult,
  sourceRoot: RegionalBreadthEcologyRootV1,
  rootSeed: RootSeed,
  completedTick: number,
  activeRegionsIdentity: readonly RegionCoord[],
  activeReceipt: RegionalBreadthEcologyActiveReceipt,
): boolean {
  // This bridge is reachable only from the completed advance above. Every
  // admitted result patch is either the exact all-coarse output of
  // setCoreEcologyAggregatePatchMaterializedActors (durable replacement) or
  // reconcileCoreEcologyBreadthResidentPatchAtTick (unchanged/dormant
  // source), both at completedTick. The active receipt then authenticates the
  // exact patch identities and computes the patch/lineage metadata. That
  // private provenance is the storage-normal proof consumed by V6; structural
  // callers, mutable windows, and reconstructed patches never receive it.
  if (
    !Object.isFrozen(result)
    || !Object.isFrozen(result.root)
    || !Object.isFrozen(result.residents)
    || !Object.isFrozen(activeRegionsIdentity)
    || activeRegionsIdentity.some((region) => !Object.isFrozen(region))
    || result.root.updatedAtTick !== completedTick
    || activeReceipt.atTick !== completedTick
    || activeReceipt.residents.length !== result.residents.length
  ) return false;
  const residents: RegionalBreadthEcologyAdvancedResidentReceipt[] = [];
  for (let index = 0; index < result.residents.length; index += 1) {
    const resident = result.residents[index]!;
    const metadata = activeReceipt.residents[index]!;
    if (
      !Object.isFrozen(resident)
      || !Object.isFrozen(resident.patch)
      || resident.patch !== metadata.patch
      || resident.sourceKey !== metadata.sourceKey
      || resident.cohortId !== metadata.cohortId
      || resident.cohortEpoch !== metadata.cohortEpoch
      || regionKey(resident.patch.originRegion) !== metadata.regionKey
    ) return false;
    residents.push(Object.freeze({
      resident,
      patch: resident.patch,
      sourceKey: metadata.sourceKey,
      cohortId: metadata.cohortId,
      cohortEpoch: metadata.cohortEpoch,
      region: resident.patch.originRegion,
      patchHash: metadata.patchHash,
      lineageHash: metadata.lineageHash,
    }));
  }
  const receipt = Object.freeze({
    sourceRoot,
    resultRoot: result.root,
    resultResidents: result.residents,
    rootSeedIdentity: rootSeed,
    rootSeed: Object.freeze([
      rootSeed[0],
      rootSeed[1],
      rootSeed[2],
      rootSeed[3],
    ] as [number, number, number, number]),
    completedTick,
    activeRegionsIdentity,
    activeRegionKeys: activeReceipt.activeRegionKeys,
    activeReceipt,
    residents: Object.freeze(residents),
  });
  ADVANCE_RESULT_RECEIPTS.set(result, receipt);
  return true;
}

function canonicalActiveReceiptClaimsOrNull(
  value: unknown,
): readonly RegionalBreadthEcologyActiveReceiptClaim[] | null {
  if (!Array.isArray(value)) return null;
  const claims: RegionalBreadthEcologyActiveReceiptClaim[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, [
        "cohortEpoch",
        "cohortId",
        "lineageHash",
        "patchHash",
        "region",
        "sourceKey",
      ])
      || typeof raw.sourceKey !== "string"
      || seen.has(raw.sourceKey)
      || typeof raw.cohortId !== "string"
      || coreEcologyBreadthCohortDefinition(
        raw.cohortId as CoreEcologyBreadthCohortId,
      ) === null
      || !positiveSafeInteger(raw.cohortEpoch)
      || !isRegionCoord(raw.region)
      || !validHash(raw.patchHash)
      || !validHash(raw.lineageHash)
    ) return null;
    seen.add(raw.sourceKey);
    claims.push(Object.freeze({
      sourceKey: raw.sourceKey,
      cohortId: raw.cohortId as CoreEcologyBreadthCohortId,
      cohortEpoch: raw.cohortEpoch,
      region: createRegionCoord(raw.region.x, raw.region.y),
      patchHash: raw.patchHash,
      lineageHash: raw.lineageHash,
    }));
  }
  claims.sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  return Object.freeze(claims);
}

function claimsMatchActiveReceipt(
  claims: readonly RegionalBreadthEcologyActiveReceiptClaim[],
  residents: readonly RegionalBreadthEcologyActiveReceiptResident[],
): boolean {
  if (claims.length !== residents.length) return false;
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index]!;
    const resident = residents[index]!;
    if (
      claim.sourceKey !== resident.sourceKey
      || claim.cohortId !== resident.cohortId
      || claim.cohortEpoch !== resident.cohortEpoch
      || regionKey(claim.region) !== resident.regionKey
      || claim.patchHash !== resident.patchHash
      || claim.lineageHash !== resident.lineageHash
    ) return false;
  }
  return true;
}

function sameRootSeed(left: RootSeed, right: RootSeed): boolean {
  try {
    requireRootSeed(left);
  } catch {
    return false;
  }
  return left.length === right.length
    && left.every((word, index) => Object.is(word, right[index]));
}

function sameTextSequence(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function breadthResidentLineageHash(
  patch: CoreEcologyAggregatePatchState,
): string {
  return hashCanonical({
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
  });
}

interface PreparedRegionalBreadthEcologyRootSeal {
  readonly root: RegionalBreadthEcologyRootV1;
  readonly sealedSerializedBytes: number;
}

/**
 * Seal the exact root assembled by `applyActiveResidentDeviationBatch` without
 * asking the public canonicalizer to re-prove every child it just received
 * from that transaction. This is intentionally private and provenance based:
 * every retained delta must be the exact frozen object from the trusted source
 * root, and every replacement must be the exact result of the private prepared
 * delta sealer in the same stack frame. Any uncertainty returns null so the
 * caller uses the complete public `sealRoot` authority unchanged.
 */
function sealPreparedAndBindRoot(
  value: Omit<RegionalBreadthEcologyRootV1, "integrity">,
  sourceRoot: RegionalBreadthEcologyRootV1,
  sourceReceipt: RegionalBreadthEcologyActiveReceipt,
  preparedDeltas: ReadonlySet<RegionalBreadthEcologyRegionDeltaV1>,
): PreparedRegionalBreadthEcologyRootSeal | null {
  if (
    !TRUSTED_ROOTS.has(sourceRoot)
    || WORLD_BOUND_ROOTS.get(sourceRoot) !== sourceRoot.seedFingerprint
    || ACTIVE_RESIDENT_RECEIPTS.get(sourceRoot) !== sourceReceipt
    || !Object.isFrozen(sourceRoot)
    || value.version !== sourceRoot.version
    || value.ownerId !== sourceRoot.ownerId
    || value.generationVersion !== sourceRoot.generationVersion
    || value.baselinePolicyId !== sourceRoot.baselinePolicyId
    || value.seedFingerprint !== sourceRoot.seedFingerprint
    || value.activeThroughEpoch !== sourceRoot.activeThroughEpoch
    || value.activations !== sourceRoot.activations
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !nonnegativeSafeInteger(value.revision)
    || !nonnegativeSafeInteger(value.lastEventOrdinal)
    || value.updatedAtTick < sourceRoot.updatedAtTick
    || value.revision < sourceRoot.revision
    || value.lastEventOrdinal < sourceRoot.lastEventOrdinal
    || (value.revision === 0) !== (value.lastEventOrdinal === 0)
    || !Object.isFrozen(value.regions)
    || value.regions.length > REGIONAL_BREADTH_ECOLOGY_MAX_REGIONS
  ) return null;

  const inheritedDeltas = new Set(sourceRoot.regions);
  const retainedDeltas = new Set(value.regions);
  if (retainedDeltas.size !== value.regions.length) return null;
  for (const delta of preparedDeltas) {
    if (!retainedDeltas.has(delta)) return null;
  }
  const activeCohorts = new Set(value.activations.map(({ cohortId }) => cohortId));
  for (let index = 0; index < value.regions.length; index += 1) {
    const delta = value.regions[index]!;
    if (
      !Object.isFrozen(delta)
      || (!inheritedDeltas.has(delta) && !preparedDeltas.has(delta))
      || !activeCohorts.has(delta.cohortId)
      || delta.revision > value.revision
      || delta.eventOrdinal > value.lastEventOrdinal
      || delta.residentPatch.updatedAtTick > value.updatedAtTick
      || (index > 0 && compareText(value.regions[index - 1]!.key, delta.key) >= 0)
    ) return null;
  }

  const metrics = canonicalIntegrityMetrics(value);
  if (metrics.sealedSerializedBytes > REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional breadth ecology root exceeds its save budget");
  }
  const root: RegionalBreadthEcologyRootV1 = deepFreeze({
    ...value,
    integrity: metrics.integrity,
  });
  TRUSTED_ROOTS.add(root);
  WORLD_BOUND_ROOTS.set(root, root.seedFingerprint);
  return Object.freeze({
    root,
    sealedSerializedBytes: metrics.sealedSerializedBytes,
  });
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

function isBaselinePolicy(
  value: unknown,
): value is RegionalBreadthEcologyBaselinePolicyId {
  return value === REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID
    || value === REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID;
}

function requireBaselinePolicy(
  value: unknown,
): asserts value is RegionalBreadthEcologyBaselinePolicyId {
  if (!isBaselinePolicy(value)) {
    throw new RangeError("Regional breadth baseline policy is unavailable");
  }
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
