import type { RootSeed } from "../sim/rng";
import { createRegionCoord, regionKey, type RegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND } from "./coreEcologyPolarConsumerHabitat";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import {
  normalizeRegionalEcologyResidentPatchForStorage,
  regionalEcologyResidentTransitionIsVisitationOnly,
} from "./regionalEcologyState";
import {
  REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV4ActiveProjection,
  canonicalRegionalEcologyStateV4ForWorld,
  canonicalizeRegionalEcologyStateV4,
  commitRegionalEcologyStateV4ActiveProjection,
  regionalEcologyStateV4ActiveSourcePatches,
  regionalEcologyStateV4SourceOwnership,
  replaceRegionalEcologyStateV4ActiveState,
  type CommitRegionalEcologyStateV4ActiveProjectionInput,
  type RegionalEcologyStateV4,
  type RegionalEcologyStateV4ActiveProjection,
  type RegionalEcologyStateV4SourceOwnership,
  type RegionalEcologyStateV4WorldBinding,
  type ReplaceRegionalEcologyStateV4ActiveStateInput,
} from "./regionalEcologyStateV4";
import {
  REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID,
  advanceRegionalPolarConsumerEcologyRoot,
  canonicalRegionalPolarConsumerEcologyRootForWorld,
  canonicalizeRegionalPolarConsumerEcologyRoot,
  createPristineRegionalPolarConsumerEcologyRoot,
  putRegionalPolarConsumerEcologyResidentDeviation,
  regionalPolarConsumerEcologyResidentsForActiveRegions,
  type RegionalPolarConsumerEcologyRootV1,
} from "./regionalPolarConsumerEcology";
import {
  canonicalCoreEcologyPolarConsumerResidentPatch,
  coreEcologyPolarConsumerResidentPatchIsAllCoarse,
  coreEcologyPolarConsumerResidentPatchResidenceRegions,
} from "./regionalPolarConsumerResidents";
import {
  setRegionalEcologyMaterializationForWindow,
  type RegionalEcologyResidentPatch,
} from "./regionalEcologyRuntime";

export const REGIONAL_ECOLOGY_STATE_V5_VERSION = 5 as const;
export const REGIONAL_ECOLOGY_STATE_V5_OWNER_ID =
  "game:regional-ecology-state:v5" as const;
export const REGIONAL_ECOLOGY_STATE_V5_POLAR_CONSUMER_SNAPSHOT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V5_ADOPTION_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID =
  "regional-ecology-v28-wrapper:v1" as const;
export const REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_VERSION = 5 as const;
export const REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_OWNER_ID =
  "game:regional-ecology-active-projection:v5" as const;

/** Exact v4 child, polar-consumer root, and bounded hot-snapshot headroom. */
export const REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES =
  REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES
  + REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES
  + 32 * 1_024 * 1_024;

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const TRANSACTION_PATTERN = /^regional-ecology-v28-wrapper:[0-9a-f]{16}$/u;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_STATES = new WeakSet<object>();
const TRUSTED_PROJECTIONS = new WeakSet<object>();

export interface RegionalEcologyStateV5AdoptionReceiptV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V5_ADOPTION_VERSION;
  readonly status: "committed";
  readonly policyId: typeof REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID;
  readonly transactionId: string;
  readonly sourceOuterVersion: 28;
  readonly sourceEnvelopeIntegrity: string;
  readonly sourceStateIntegrity: string;
  readonly sourceStateHash: string;
  readonly sourceV4LineageHash: string;
  readonly sourceCompletedTick: number;
  readonly resultPolarConsumerRootIntegrity: string;
  readonly integrity: string;
}

/** Authenticated all-coarse hot snapshot owned only by the polar-consumer sibling. */
export interface RegionalEcologyStateV5PolarConsumerSnapshotV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V5_POLAR_CONSUMER_SNAPSHOT_VERSION;
  readonly kind: typeof CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND;
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly integrity: string;
}

export interface RegionalEcologyStateV5 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V5_VERSION;
  readonly ownerId: typeof REGIONAL_ECOLOGY_STATE_V5_OWNER_ID;
  readonly updatedAtTick: number;
  /** Exact authenticated outer-v28 ecology child. */
  readonly base: RegionalEcologyStateV4;
  /** Append-only polar-consumer sibling authority. */
  readonly polarConsumerRoot: RegionalPolarConsumerEcologyRootV1;
  /** Hot snapshots use the exact v1 child's active regions; there is no second window. */
  readonly polarConsumerActiveResidents: readonly RegionalEcologyStateV5PolarConsumerSnapshotV1[];
  /** Migration provenance from v28; null for a fresh v29 world. */
  readonly adoption: RegionalEcologyStateV5AdoptionReceiptV1 | null;
  readonly integrity: string;
}

export type RegionalEcologyStateV5WorldBinding = RegionalEcologyStateV4WorldBinding;

export interface CreateRegionalEcologyStateV5Input {
  readonly base: RegionalEcologyStateV4;
  readonly polarConsumerRoot: RegionalPolarConsumerEcologyRootV1;
  readonly polarConsumerActiveResidents: readonly RegionalEcologyResidentPatch[];
  readonly adoption: RegionalEcologyStateV5AdoptionReceiptV1 | null;
}

export interface MigrateRegionalEcologyStateV4ToV5Input {
  readonly rootSeed: RootSeed;
  readonly sourceEnvelopeIntegrity: string;
}

export interface RegionalEcologyStateV5ProjectedPolarConsumerResidentV1 {
  readonly kind: typeof CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND;
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly sourcePatchHash: string;
  readonly projectedPatchHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalEcologyStateV5ActiveProjection {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_VERSION;
  readonly ownerId: typeof REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_OWNER_ID;
  readonly stateIntegrity: string;
  readonly atTick: number;
  readonly base: RegionalEcologyStateV4ActiveProjection;
  readonly polarConsumerResidents: readonly RegionalEcologyStateV5ProjectedPolarConsumerResidentV1[];
  readonly integrity: string;
}

export interface CommitRegionalEcologyStateV5ActiveProjectionInput {
  readonly base: CommitRegionalEcologyStateV4ActiveProjectionInput;
  readonly polarConsumerResidents: readonly RegionalEcologyResidentPatch[];
}

export interface ReplaceRegionalEcologyStateV5ActiveStateInput {
  readonly expectedIntegrity: string;
  /** Raw v4 exchange input; this owner executes and authenticates the child transaction. */
  readonly base: ReplaceRegionalEcologyStateV4ActiveStateInput;
}

export interface RegionalEcologyStateV5SourceOwnership
  extends Omit<RegionalEcologyStateV4SourceOwnership, "kind" | "layer"> {
  readonly layer:
    | RegionalEcologyStateV4SourceOwnership["layer"]
    | "polar-consumer";
  readonly kind:
    | RegionalEcologyStateV4SourceOwnership["kind"]
    | typeof CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND;
}

/** Construct one strict composite without rewriting either canonical child. */
export function createRegionalEcologyStateV5(
  input: CreateRegionalEcologyStateV5Input,
): RegionalEcologyStateV5 {
  if (
    !plainRecord(input)
    || !exactKeys(input, [
      "adoption",
      "base",
      "polarConsumerActiveResidents",
      "polarConsumerRoot",
    ])
    || !Array.isArray(input.polarConsumerActiveResidents)
  ) {
    throw new TypeError("Regional ecology v5 input is malformed");
  }
  const base = canonicalizeRegionalEcologyStateV4(input.base);
  const polarConsumerRoot = canonicalizeRegionalPolarConsumerEcologyRoot(
    input.polarConsumerRoot,
  );
  if (
    base === null
    || polarConsumerRoot === null
    || stableStringify(base) !== stableStringify(input.base)
    || stableStringify(polarConsumerRoot) !== stableStringify(input.polarConsumerRoot)
    || polarConsumerRoot.updatedAtTick !== base.updatedAtTick
    || polarConsumerRoot.seedFingerprint !== base.coldShoreRoot.seedFingerprint
  ) {
    throw new RangeError("Regional ecology v5 children are not canonical at one clock");
  }
  const polarConsumerActiveResidents = input.polarConsumerActiveResidents
    .map((resident) => createPolarConsumerSnapshot(resident, base.updatedAtTick))
    .sort(compareSnapshot);
  const adoption = canonicalAdoption(input.adoption, base, polarConsumerRoot);
  if (input.adoption !== null && adoption === null) {
    throw new RangeError("Regional ecology v5 adoption receipt is malformed");
  }
  if (!validPolarConsumerSources(base, polarConsumerRoot, polarConsumerActiveResidents)) {
    throw new RangeError(
      "Regional ecology v5 polar-consumer sources overlap or escape the hot window",
    );
  }
  if (!validCrossLayerOwnership(base, polarConsumerRoot, polarConsumerActiveResidents)) {
    throw new RangeError("Regional ecology v5 child ownership overlaps");
  }
  return sealState({
    version: REGIONAL_ECOLOGY_STATE_V5_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V5_OWNER_ID,
    updatedAtTick: base.updatedAtTick,
    base,
    polarConsumerRoot,
    polarConsumerActiveResidents: Object.freeze(polarConsumerActiveResidents),
    adoption,
  });
}

/** Fresh outer-v29 worlds have no migration receipt. */
export function createFreshRegionalEcologyStateV5(
  baseValue: unknown,
  rootSeed: RootSeed,
): RegionalEcologyStateV5 {
  const base = canonicalizeRegionalEcologyStateV4(baseValue);
  if (base === null) {
    throw new TypeError("Fresh regional ecology v5 requires one v4 base");
  }
  const polarConsumerRoot = createPristineRegionalPolarConsumerEcologyRoot({
    rootSeed,
    completedTick: base.updatedAtTick,
  });
  const polarConsumerActiveResidents = requirePolarConsumerActiveResidents(
    polarConsumerRoot,
    rootSeed,
    base,
  );
  return createRegionalEcologyStateV5({
    base,
    polarConsumerRoot,
    polarConsumerActiveResidents,
    adoption: null,
  });
}

/** Exact-once append-only wrapping of an authenticated outer-v28 child. */
export function migrateRegionalEcologyStateV4ToV5(
  baseValue: unknown,
  input: MigrateRegionalEcologyStateV4ToV5Input,
): RegionalEcologyStateV5 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["rootSeed", "sourceEnvelopeIntegrity"])
    || !validHash(input.sourceEnvelopeIntegrity)
  ) {
    throw new TypeError("Regional ecology v28 migration input is malformed");
  }
  const base = canonicalizeRegionalEcologyStateV4(baseValue);
  if (base === null || stableStringify(base) !== stableStringify(baseValue)) {
    throw new TypeError("Regional ecology v28 migration requires an exact v4 child");
  }
  const polarConsumerRoot = createPristineRegionalPolarConsumerEcologyRoot({
    rootSeed: input.rootSeed,
    completedTick: base.updatedAtTick,
  });
  const receiptBase = {
    version: REGIONAL_ECOLOGY_STATE_V5_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID,
    transactionId: `regional-ecology-v28-wrapper:${hashCanonical({
      policyId: REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID,
      sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
      sourceStateIntegrity: base.integrity,
      sourceStateHash: hashCanonical(base),
      sourceV4LineageHash: regionalEcologyV4LineageHash(base),
      sourceCompletedTick: base.updatedAtTick,
      resultPolarConsumerRootIntegrity: polarConsumerRoot.integrity,
    })}`,
    sourceOuterVersion: 28 as const,
    sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
    sourceStateIntegrity: base.integrity,
    sourceStateHash: hashCanonical(base),
    sourceV4LineageHash: regionalEcologyV4LineageHash(base),
    sourceCompletedTick: base.updatedAtTick,
    resultPolarConsumerRootIntegrity: polarConsumerRoot.integrity,
  };
  const adoption = deepFreeze({
    ...receiptBase,
    integrity: hashCanonical(receiptBase),
  });
  const polarConsumerActiveResidents = requirePolarConsumerActiveResidents(
    polarConsumerRoot,
    input.rootSeed,
    base,
  );
  return createRegionalEcologyStateV5({
    base,
    polarConsumerRoot,
    polarConsumerActiveResidents,
    adoption,
  });
}

export function canonicalizeRegionalEcologyStateV5(
  value: unknown,
): RegionalEcologyStateV5 | null {
  if (typeof value === "object" && value !== null && TRUSTED_STATES.has(value)) {
    return value as RegionalEcologyStateV5;
  }
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "adoption",
      "base",
      "integrity",
      "ownerId",
      "polarConsumerActiveResidents",
      "polarConsumerRoot",
      "updatedAtTick",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V5_VERSION
    || value.ownerId !== REGIONAL_ECOLOGY_STATE_V5_OWNER_ID
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.polarConsumerActiveResidents)
    || !validHash(value.integrity)
  ) {
    return null;
  }
  const base = canonicalizeRegionalEcologyStateV4(value.base);
  const polarConsumerRoot = canonicalizeRegionalPolarConsumerEcologyRoot(
    value.polarConsumerRoot,
  );
  if (
    base === null
    || polarConsumerRoot === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(polarConsumerRoot) !== stableStringify(value.polarConsumerRoot)
    || base.updatedAtTick !== value.updatedAtTick
    || polarConsumerRoot.updatedAtTick !== value.updatedAtTick
    || polarConsumerRoot.seedFingerprint !== base.coldShoreRoot.seedFingerprint
  ) {
    return null;
  }
  const polarConsumerActiveResidents: RegionalEcologyStateV5PolarConsumerSnapshotV1[] = [];
  for (const raw of value.polarConsumerActiveResidents) {
    const snapshot = canonicalPolarConsumerSnapshot(raw, value.updatedAtTick);
    if (snapshot === null) return null;
    polarConsumerActiveResidents.push(snapshot);
  }
  polarConsumerActiveResidents.sort(compareSnapshot);
  if (
    stableStringify(polarConsumerActiveResidents)
      !== stableStringify(value.polarConsumerActiveResidents)
    || !validPolarConsumerSources(base, polarConsumerRoot, polarConsumerActiveResidents)
    || !validCrossLayerOwnership(base, polarConsumerRoot, polarConsumerActiveResidents)
  ) {
    return null;
  }
  const adoption = canonicalAdoption(value.adoption, base, polarConsumerRoot);
  if (value.adoption !== null && adoption === null) return null;
  const stateBase = {
    version: REGIONAL_ECOLOGY_STATE_V5_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V5_OWNER_ID,
    updatedAtTick: value.updatedAtTick,
    base,
    polarConsumerRoot,
    polarConsumerActiveResidents: Object.freeze(polarConsumerActiveResidents),
    adoption,
  };
  if (hashCanonical(stateBase) !== value.integrity) return null;
  const state = deepFreeze({ ...stateBase, integrity: value.integrity });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES) {
    return null;
  }
  TRUSTED_STATES.add(state);
  return state;
}

/** World/seed trust boundary for the exact v4 child, polar root, and hot snapshots. */
export function canonicalRegionalEcologyStateV5ForWorld(
  value: unknown,
  binding: RegionalEcologyStateV5WorldBinding,
): RegionalEcologyStateV5 | null {
  if (!plainRecord(binding) || !nonnegativeSafeInteger(binding.completedTick)) {
    return null;
  }
  const state = canonicalizeRegionalEcologyStateV5(value);
  if (state === null || state.updatedAtTick !== binding.completedTick) return null;
  if (canonicalRegionalEcologyStateV4ForWorld(state.base, binding) === null) {
    return null;
  }
  const polarConsumerRoot = canonicalRegionalPolarConsumerEcologyRootForWorld(
    state.polarConsumerRoot,
    binding,
  );
  if (polarConsumerRoot === null) return null;
  const expected = regionalPolarConsumerEcologyResidentsForActiveRegions(
    polarConsumerRoot,
    binding.rootSeed,
    activeRegions(state.base),
  );
  if (expected === null || expected.length !== state.polarConsumerActiveResidents.length) {
    return null;
  }
  const expectedBySource = new Map(
    expected.map((resident) => [resident.sourceKey, resident.patch]),
  );
  for (const snapshot of state.polarConsumerActiveResidents) {
    const bound = canonicalCoreEcologyPolarConsumerResidentPatch(snapshot.patch, {
      seed: binding.rootSeed,
      region: snapshot.region,
      completedTick: binding.completedTick,
    });
    const authoritative = expectedBySource.get(snapshot.sourceKey);
    if (
      bound === null
      || authoritative === undefined
      || stableStringify(bound) !== stableStringify(authoritative)
    ) {
      return null;
    }
    expectedBySource.delete(snapshot.sourceKey);
  }
  return expectedBySource.size === 0 ? state : null;
}

export function serializeRegionalEcologyStateV5(value: unknown): string {
  const state = canonicalizeRegionalEcologyStateV5(value);
  if (state === null) throw new TypeError("Regional ecology v5 state is malformed");
  const text = stableStringify(state);
  if (UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology v5 state exceeds the composite save budget");
  }
  return text;
}

export function deserializeRegionalEcologyStateV5(
  text: unknown,
): RegionalEcologyStateV5 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES
  ) {
    return null;
  }
  try {
    const state = canonicalizeRegionalEcologyStateV5(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

/** Exact source patches participating in the one cross-owner hot projection. */
export function regionalEcologyStateV5ActiveSourcePatches(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  const state = canonicalizeRegionalEcologyStateV5(value);
  if (state === null) return null;
  const baseSources = regionalEcologyStateV4ActiveSourcePatches(state.base);
  if (baseSources === null) return null;
  return Object.freeze([
    ...baseSources.map(({ sourceKey, patch }) => Object.freeze({ sourceKey, patch })),
    ...state.polarConsumerActiveResidents.map(({ sourceKey, patch }) => (
      Object.freeze({ sourceKey, patch })
    )),
  ].sort(compareResident));
}

/** One shared group-atomic top-K plan owns all v4 and polar-consumer sources. */
export function projectRegionalEcologyStateV5ActiveState(
  value: unknown,
  window: CoreEcologyRuntimeWindow,
): RegionalEcologyStateV5ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV5(value);
  if (state === null) return null;
  const sources = regionalEcologyStateV5ActiveSourcePatches(state);
  if (sources === null) return null;
  const materialized = setRegionalEcologyMaterializationForWindow(
    sources,
    window,
    state.updatedAtTick,
  );
  return materialized === null
    ? null
    : bindRegionalEcologyStateV5ActiveProjection(state, materialized);
}

export function bindRegionalEcologyStateV5ActiveProjection(
  value: unknown,
  materializedResidentsValue: unknown,
): RegionalEcologyStateV5ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV5(value);
  if (state === null || !Array.isArray(materializedResidentsValue)) return null;
  const baseSources = regionalEcologyStateV4ActiveSourcePatches(state.base);
  if (baseSources === null) return null;
  const baseKeys = new Set(baseSources.map(({ sourceKey }) => sourceKey));
  const polarKeys = new Set(
    state.polarConsumerActiveResidents.map(({ sourceKey }) => sourceKey),
  );
  const baseResidents: RegionalEcologyResidentPatch[] = [];
  const polarResidents: RegionalEcologyResidentPatch[] = [];
  const allProjectedPatches: CoreEcologyAggregatePatchState[] = [];
  const seen = new Set<string>();
  for (const raw of materializedResidentsValue) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || seen.has(raw.sourceKey)
    ) {
      return null;
    }
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || patch.patchKey !== raw.sourceKey
    ) {
      return null;
    }
    const resident = Object.freeze({ sourceKey: raw.sourceKey, patch });
    if (baseKeys.has(raw.sourceKey)) baseResidents.push(resident);
    else if (polarKeys.has(raw.sourceKey)) polarResidents.push(resident);
    else return null;
    allProjectedPatches.push(patch);
    seen.add(raw.sourceKey);
  }
  if (seen.size !== baseKeys.size + polarKeys.size) return null;
  const base = bindRegionalEcologyStateV4ActiveProjection(state.base, baseResidents);
  const polar = bindPolarConsumerProjection(state, polarResidents);
  if (
    base === null
    || polar === null
    || !allProjectedPatches.every(patchMaterializationIsGroupAtomic)
    || allProjectedPatches.reduce(
      (sum, patch) => sum + countMaterializedActors(patch),
      0,
    ) > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) {
    return null;
  }
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_OWNER_ID,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    polarConsumerResidents: polar,
  };
  const projection = deepFreeze({
    ...projectionBase,
    integrity: hashCanonical(projectionBase),
  });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

/** All owners advance together, or this immutable composite returns no result. */
export function commitRegionalEcologyStateV5ActiveProjection(
  stateValue: unknown,
  projectionValue: unknown,
  input: CommitRegionalEcologyStateV5ActiveProjectionInput,
): RegionalEcologyStateV5 | null {
  const state = canonicalizeRegionalEcologyStateV5(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "polarConsumerResidents"])
    || !plainRecord(input.base)
    || !Array.isArray(input.polarConsumerResidents)
  ) {
    return null;
  }
  const projection = canonicalProjection(projectionValue, state);
  const baseOutputResidents = v4CommitResidentInputs(input.base);
  if (
    projection === null
    || baseOutputResidents === null
    || !projectedMaterializationTransitionIsHonored(
      v4ProjectionResidents(projection.base),
      baseOutputResidents,
    )
    || !projectedMaterializationPlanIsHonored(
      projection.polarConsumerResidents,
      input.polarConsumerResidents,
    )
  ) {
    return null;
  }
  let base: RegionalEcologyStateV4 | null;
  try {
    base = commitRegionalEcologyStateV4ActiveProjection(
      state.base,
      projection.base,
      input.base,
    );
  } catch {
    return null;
  }
  if (base === null || base.updatedAtTick < state.updatedAtTick) return null;
  const rootSeed = input.base.base.base.base.rootSeed;
  let polarConsumerRoot: RegionalPolarConsumerEcologyRootV1;
  try {
    polarConsumerRoot = advanceRegionalPolarConsumerEcologyRoot(
      state.polarConsumerRoot,
      base.updatedAtTick,
    );
  } catch {
    return null;
  }
  const outputBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of input.polarConsumerResidents) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || outputBySource.has(raw.sourceKey)
    ) {
      return null;
    }
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || patch.patchKey !== raw.sourceKey
      || patch.updatedAtTick !== base.updatedAtTick
    ) {
      return null;
    }
    outputBySource.set(raw.sourceKey, patch);
  }
  if (outputBySource.size !== projection.polarConsumerResidents.length) return null;
  const originalBySource = new Map(
    state.polarConsumerActiveResidents.map((entry) => [entry.sourceKey, entry]),
  );
  for (const projected of projection.polarConsumerResidents) {
    const original = originalBySource.get(projected.sourceKey);
    const output = outputBySource.get(projected.sourceKey);
    if (original === undefined || output === undefined) return null;
    const bound = canonicalCoreEcologyPolarConsumerResidentPatch(output, {
      seed: rootSeed,
      region: original.region,
      completedTick: base.updatedAtTick,
    });
    if (
      bound === null
      || sourceLineageHash(bound) !== original.lineageHash
      || !patchMaterializationIsGroupAtomic(bound)
    ) {
      return null;
    }
    const normalized = normalizeRegionalEcologyResidentPatchForStorage(
      bound,
      base.updatedAtTick,
    );
    const normalizedProjection = normalizeRegionalEcologyResidentPatchForStorage(
      projected.patch,
      projection.atTick,
    );
    if (normalized === null || normalizedProjection === null) return null;
    const presentationOnly = base.updatedAtTick === projection.atTick
      && stableStringify(normalized) === stableStringify(normalizedProjection);
    const visitationOnly = base.updatedAtTick > projection.atTick
      && regionalEcologyResidentTransitionIsVisitationOnly(
        normalizedProjection,
        normalized,
      );
    if (!presentationOnly && !visitationOnly) {
      try {
        polarConsumerRoot = putRegionalPolarConsumerEcologyResidentDeviation(
          polarConsumerRoot,
          { rootSeed, patch: normalized },
        );
      } catch {
        return null;
      }
    }
  }
  try {
    const polarConsumerActiveResidents = requirePolarConsumerActiveResidents(
      polarConsumerRoot,
      rootSeed,
      base,
    );
    return createRegionalEcologyStateV5({
      base,
      polarConsumerRoot,
      polarConsumerActiveResidents,
      adoption: state.adoption,
    });
  } catch {
    return null;
  }
}

/** Exchange the v4 hot neighborhood, then derive the polar sibling from it. */
export function replaceRegionalEcologyStateV5ActiveState(
  stateValue: unknown,
  input: ReplaceRegionalEcologyStateV5ActiveStateInput,
): RegionalEcologyStateV5 {
  const state = canonicalizeRegionalEcologyStateV5(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "expectedIntegrity"])
    || input.expectedIntegrity !== state.integrity
  ) {
    throw new RangeError("Regional ecology v5 active replacement is stale or malformed");
  }
  let base: RegionalEcologyStateV4;
  try {
    base = replaceRegionalEcologyStateV4ActiveState(state.base, input.base);
  } catch {
    throw new RangeError("Regional ecology v5 active replacement breaks v4 lineage");
  }
  const rootSeed = input.base.base.base.base.rootSeed;
  const polarConsumerRoot = state.polarConsumerRoot;
  if (
    canonicalRegionalPolarConsumerEcologyRootForWorld(polarConsumerRoot, {
      rootSeed,
      completedTick: base.updatedAtTick,
    }) === null
  ) {
    throw new RangeError("Regional ecology v5 active replacement belongs to another world");
  }
  const polarConsumerActiveResidents = requirePolarConsumerActiveResidents(
    polarConsumerRoot,
    rootSeed,
    base,
  );
  return createRegionalEcologyStateV5({
    base,
    polarConsumerRoot,
    polarConsumerActiveResidents,
    adoption: state.adoption,
  });
}

/** Composite diagnostic manifest across the exact v4 child and polar sibling. */
export function regionalEcologyStateV5SourceOwnership(
  value: unknown,
  activeOnly = false,
): readonly RegionalEcologyStateV5SourceOwnership[] | null {
  const state = canonicalizeRegionalEcologyStateV5(value);
  if (state === null) return null;
  const base = regionalEcologyStateV4SourceOwnership(state.base, activeOnly);
  if (base === null) return null;
  const polarBySource = new Map<string, CoreEcologyAggregatePatchState>();
  if (!activeOnly) {
    for (const delta of state.polarConsumerRoot.regions) {
      polarBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
    }
  }
  for (const resident of state.polarConsumerActiveResidents) {
    polarBySource.set(resident.sourceKey, resident.patch);
  }
  return Object.freeze([
    ...base.map((entry): RegionalEcologyStateV5SourceOwnership => deepFreeze({ ...entry })),
    ...[...polarBySource].map(
      ([sourceKey, patch]): RegionalEcologyStateV5SourceOwnership => deepFreeze({
        ...sourceOwnership(sourceKey, patch, CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND),
        layer: "polar-consumer" as const,
      }),
    ),
  ].sort((left, right) => compareText(left.sourceKey, right.sourceKey)));
}

function activeRegions(base: RegionalEcologyStateV4): readonly RegionCoord[] {
  return base.base.base.base.activeRegions;
}

function requirePolarConsumerActiveResidents(
  root: RegionalPolarConsumerEcologyRootV1,
  rootSeed: RootSeed,
  base: RegionalEcologyStateV4,
): readonly RegionalEcologyResidentPatch[] {
  const residents = regionalPolarConsumerEcologyResidentsForActiveRegions(
    root,
    rootSeed,
    activeRegions(base),
  );
  if (residents === null) {
    throw new RangeError(
      "Regional polar-consumer ecology could not derive the active neighborhood",
    );
  }
  return Object.freeze(residents.map(({ sourceKey, patch }) => Object.freeze({
    sourceKey,
    patch,
  })));
}

function createPolarConsumerSnapshot(
  input: RegionalEcologyResidentPatch,
  tick: number,
): RegionalEcologyStateV5PolarConsumerSnapshotV1 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["patch", "sourceKey"])
    || typeof input.sourceKey !== "string"
  ) {
    throw new TypeError("Regional ecology v5 polar-consumer resident is malformed");
  }
  const patch = normalizeRegionalEcologyResidentPatchForStorage(input.patch, tick);
  const derivation = patch?.derivation as unknown as Readonly<{ kind?: unknown }> | undefined;
  const first = patch?.populations[0];
  const second = patch?.populations[1];
  if (
    patch === null
    || patch.patchKey !== input.sourceKey
    || derivation?.kind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND
    || !coreEcologyPolarConsumerResidentPatchIsAllCoarse(patch)
    || patch.populations.length < 1
    || patch.populations.length > 2
    || first?.species !== "harbor-seal"
    || first.members.length !== 1
    || (second !== undefined && (
      second.species !== "polar-bear" || second.members.length !== 1
    ))
    || patch.groups.groups.length !== 0
    || patch.aggregatePopulations.length !== 0
    || patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
  ) {
    throw new RangeError(
      "Regional ecology v5 polar-consumer resident is not a conserved solitary source",
    );
  }
  const base = {
    version: REGIONAL_ECOLOGY_STATE_V5_POLAR_CONSUMER_SNAPSHOT_VERSION,
    kind: CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
    sourceKey: input.sourceKey,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    patch,
  };
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

function canonicalPolarConsumerSnapshot(
  value: unknown,
  tick: number,
): RegionalEcologyStateV5PolarConsumerSnapshotV1 | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "integrity",
      "kind",
      "lineageHash",
      "patch",
      "patchHash",
      "region",
      "sourceKey",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V5_POLAR_CONSUMER_SNAPSHOT_VERSION
    || value.kind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND
    || typeof value.sourceKey !== "string"
    || !validHash(value.patchHash)
    || !validHash(value.lineageHash)
    || !validHash(value.integrity)
  ) {
    return null;
  }
  try {
    const snapshot = createPolarConsumerSnapshot({
      sourceKey: value.sourceKey,
      patch: value.patch as CoreEcologyAggregatePatchState,
    }, tick);
    return stableStringify(snapshot) === stableStringify(value) ? snapshot : null;
  } catch {
    return null;
  }
}

function validPolarConsumerSources(
  base: RegionalEcologyStateV4,
  root: RegionalPolarConsumerEcologyRootV1,
  residents: readonly RegionalEcologyStateV5PolarConsumerSnapshotV1[],
): boolean {
  const activeKeys = new Set(activeRegions(base).map(regionKey));
  const sourceKeys = new Set<string>();
  const originKeys = new Set<string>();
  const rootBySource = new Map(root.regions.map((delta) => [
    delta.residentPatch.patchKey,
    delta.residentPatch,
  ]));
  for (const resident of residents) {
    const originKey = regionKey(resident.region);
    const residence = coreEcologyPolarConsumerResidentPatchResidenceRegions(resident.patch);
    if (
      sourceKeys.has(resident.sourceKey)
      || originKeys.has(originKey)
      || residence === null
      || (!activeKeys.has(originKey)
        && !residence.some((region) => activeKeys.has(regionKey(region))))
    ) {
      return false;
    }
    sourceKeys.add(resident.sourceKey);
    originKeys.add(originKey);
    const stored = rootBySource.get(resident.sourceKey);
    if (
      stored !== undefined
      && (
        regionKey(stored.originRegion) !== originKey
        || stored.updatedAtTick > resident.patch.updatedAtTick
        || sourceLineageHash(stored) !== resident.lineageHash
      )
    ) {
      return false;
    }
  }
  return true;
}

function validCrossLayerOwnership(
  base: RegionalEcologyStateV4,
  polarRoot: RegionalPolarConsumerEcologyRootV1,
  polarResidents: readonly RegionalEcologyStateV5PolarConsumerSnapshotV1[],
): boolean {
  const baseIds = collectV4Ids(base);
  if (baseIds === null) return false;
  const polarBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const delta of polarRoot.regions) {
    polarBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
  }
  for (const resident of polarResidents) {
    polarBySource.set(resident.sourceKey, resident.patch);
  }
  const polarIds = new Set<string>();
  for (const [sourceKey, patch] of polarBySource) {
    if (baseIds.has(sourceKey) || polarIds.has(sourceKey)) return false;
    polarIds.add(sourceKey);
    for (const id of patchIds(patch)) {
      if (baseIds.has(id) || polarIds.has(id)) return false;
      polarIds.add(id);
    }
  }
  return true;
}

function collectV4Ids(base: RegionalEcologyStateV4): Set<string> | null {
  const ownership = regionalEcologyStateV4SourceOwnership(base, false);
  if (ownership === null) return null;
  const ids = new Set<string>();
  for (const owner of ownership) {
    if (!addOwnershipIds(ids, owner)) return null;
  }
  return ids;
}

function bindPolarConsumerProjection(
  state: RegionalEcologyStateV5,
  residentsValue: readonly RegionalEcologyResidentPatch[],
): readonly RegionalEcologyStateV5ProjectedPolarConsumerResidentV1[] | null {
  if (residentsValue.length !== state.polarConsumerActiveResidents.length) return null;
  const sourceByKey = new Map(
    state.polarConsumerActiveResidents.map((source) => [source.sourceKey, source]),
  );
  const output: RegionalEcologyStateV5ProjectedPolarConsumerResidentV1[] = [];
  for (const raw of residentsValue) {
    const source = sourceByKey.get(raw.sourceKey);
    const projected = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      source === undefined
      || projected === null
      || stableStringify(projected) !== stableStringify(raw.patch)
      || projected.patchKey !== source.sourceKey
      || projected.updatedAtTick !== state.updatedAtTick
      || sourceLineageHash(projected) !== source.lineageHash
    ) {
      return null;
    }
    const actorIds = materializedActorIds(projected);
    let replay: CoreEcologyAggregatePatchState;
    try {
      replay = setCoreEcologyAggregatePatchMaterializedActors(source.patch, {
        atTick: state.updatedAtTick,
        actorIds,
      });
    } catch {
      return null;
    }
    if (stableStringify(replay) !== stableStringify(projected)) return null;
    output.push(deepFreeze({
      kind: CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
      sourceKey: source.sourceKey,
      region: copyRegion(source.region),
      sourcePatchHash: source.patchHash,
      projectedPatchHash: hashCanonical(projected),
      patch: projected,
    }));
    sourceByKey.delete(source.sourceKey);
  }
  output.sort(compareSnapshot);
  return sourceByKey.size === 0 ? Object.freeze(output) : null;
}

function canonicalProjection(
  value: unknown,
  state: RegionalEcologyStateV5,
): RegionalEcologyStateV5ActiveProjection | null {
  if (typeof value === "object" && value !== null && TRUSTED_PROJECTIONS.has(value)) {
    const projection = value as RegionalEcologyStateV5ActiveProjection;
    return projection.stateIntegrity === state.integrity ? projection : null;
  }
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "atTick",
      "base",
      "integrity",
      "ownerId",
      "polarConsumerResidents",
      "stateIntegrity",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_VERSION
    || value.ownerId !== REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_OWNER_ID
    || value.stateIntegrity !== state.integrity
    || value.atTick !== state.updatedAtTick
    || !Array.isArray(value.polarConsumerResidents)
    || !validHash(value.integrity)
  ) {
    return null;
  }
  const baseInputs = v4ProjectionResidentInputs(value.base);
  const polarInputs = projectionResidentInputs(value.polarConsumerResidents);
  if (baseInputs === null || polarInputs === null) return null;
  const base = bindRegionalEcologyStateV4ActiveProjection(state.base, baseInputs);
  const polar = bindPolarConsumerProjection(state, polarInputs);
  const projectedPatches = base === null || polar === null
    ? []
    : [...v4ProjectionPatches(base), ...polar.map(({ patch }) => patch)];
  if (
    base === null
    || polar === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(polar) !== stableStringify(value.polarConsumerResidents)
    || !projectedPatches.every(patchMaterializationIsGroupAtomic)
    || projectedPatches.reduce(
      (sum, patch) => sum + countMaterializedActors(patch),
      0,
    ) > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) {
    return null;
  }
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V5_ACTIVE_PROJECTION_OWNER_ID,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    polarConsumerResidents: polar,
  };
  if (hashCanonical(projectionBase) !== value.integrity) return null;
  const projection = deepFreeze({ ...projectionBase, integrity: value.integrity });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

function canonicalAdoption(
  value: unknown,
  base: RegionalEcologyStateV4,
  polarRoot: RegionalPolarConsumerEcologyRootV1,
): RegionalEcologyStateV5AdoptionReceiptV1 | null {
  if (value === null) return null;
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "integrity",
      "policyId",
      "resultPolarConsumerRootIntegrity",
      "sourceCompletedTick",
      "sourceEnvelopeIntegrity",
      "sourceOuterVersion",
      "sourceStateHash",
      "sourceStateIntegrity",
      "sourceV4LineageHash",
      "status",
      "transactionId",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V5_ADOPTION_VERSION
    || value.status !== "committed"
    || value.policyId !== REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID
    || typeof value.transactionId !== "string"
    || !TRANSACTION_PATTERN.test(value.transactionId)
    || value.sourceOuterVersion !== 28
    || !validHash(value.sourceEnvelopeIntegrity)
    || !validHash(value.sourceStateIntegrity)
    || !validHash(value.sourceStateHash)
    || !validHash(value.sourceV4LineageHash)
    || !nonnegativeSafeInteger(value.sourceCompletedTick)
    || !validHash(value.resultPolarConsumerRootIntegrity)
    || !validHash(value.integrity)
    || value.sourceCompletedTick > base.updatedAtTick
    || value.sourceV4LineageHash !== regionalEcologyV4LineageHash(base)
    || value.resultPolarConsumerRootIntegrity
      !== pristinePolarConsumerRootIntegrity(polarRoot, value.sourceCompletedTick)
  ) {
    return null;
  }
  const expectedTransactionId = `regional-ecology-v28-wrapper:${hashCanonical({
    policyId: REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceV4LineageHash: value.sourceV4LineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultPolarConsumerRootIntegrity: value.resultPolarConsumerRootIntegrity,
  })}`;
  if (value.transactionId !== expectedTransactionId) return null;
  const receiptBase = {
    version: REGIONAL_ECOLOGY_STATE_V5_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID,
    transactionId: value.transactionId,
    sourceOuterVersion: 28 as const,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceV4LineageHash: value.sourceV4LineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultPolarConsumerRootIntegrity: value.resultPolarConsumerRootIntegrity,
  };
  return hashCanonical(receiptBase) === value.integrity
    ? deepFreeze({ ...receiptBase, integrity: value.integrity })
    : null;
}

/** The receipt binds pristine polar-consumer identity, not its later clock. */
function pristinePolarConsumerRootIntegrity(
  root: RegionalPolarConsumerEcologyRootV1,
  migrationTick: number,
): string {
  return hashCanonical({
    version: root.version,
    ownerId: REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID,
    generationVersion: root.generationVersion,
    baselinePolicyId: root.baselinePolicyId,
    seedFingerprint: root.seedFingerprint,
    updatedAtTick: migrationTick,
    revision: 0,
    lastEventOrdinal: 0,
    regions: Object.freeze([]),
  });
}

/** Immutable v4 custody lineage retained across clocks and hot-window exchange. */
function regionalEcologyV4LineageHash(base: RegionalEcologyStateV4): string {
  const v3 = base.base;
  const v2 = v3.base;
  const v1 = v2.base;
  return hashCanonical({
    version: base.version,
    ownerId: base.ownerId,
    adoptionTransactionId: base.adoption?.transactionId ?? null,
    v3: {
      version: v3.version,
      ownerId: v3.ownerId,
      adoptionTransactionId: v3.adoption?.transactionId ?? null,
      v2: {
        version: v2.version,
        ownerId: v2.ownerId,
        adoptionTransactionId: v2.adoption?.transactionId ?? null,
        v1: {
          root: {
            version: v1.root.version,
            ownerId: v1.root.ownerId,
            generationVersion: v1.root.generationVersion,
            baselinePolicyId: v1.root.baselinePolicyId,
            seedFingerprint: v1.root.seedFingerprint,
            adoptionTransactionId: v1.root.adoption?.transactionId ?? null,
            legacySourcePatchHash: v1.root.legacyCohort?.sourcePatchHash ?? null,
          },
          settlementHome: {
            sourceKey: v1.settlementHome.sourceKey,
            region: v1.settlementHome.region,
            lineageHash: v1.settlementHome.lineageHash,
          },
        },
        alpine: stableRootLineage(v2.alpineRoot),
      },
      polarShore: stableRootLineage(v3.polarShoreRoot),
    },
    coldShore: stableRootLineage(base.coldShoreRoot),
  });
}

function stableRootLineage(root: Readonly<{
  readonly version: number;
  readonly ownerId: string;
  readonly generationVersion: number;
  readonly baselinePolicyId: string;
  readonly seedFingerprint: string;
}>): Readonly<Record<string, unknown>> {
  return {
    version: root.version,
    ownerId: root.ownerId,
    generationVersion: root.generationVersion,
    baselinePolicyId: root.baselinePolicyId,
    seedFingerprint: root.seedFingerprint,
  };
}

function sourceOwnership(
  sourceKey: string,
  patch: CoreEcologyAggregatePatchState,
  kind: typeof CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
): Omit<RegionalEcologyStateV5SourceOwnership, "layer"> {
  return deepFreeze({
    sourceKey,
    kind,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    populationKeys: patch.populations.map(({ species, populationKey }) => (
      qualifiedPopulationKey(species, populationKey)
    )).sort(compareText),
    actorIds: patch.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    )).sort(compareText),
    groupIds: Object.freeze([]),
    aggregateIds: Object.freeze([]),
    mortalityIds: Object.freeze([]),
    bodyIds: Object.freeze([]),
  });
}

function v4ProjectionResidentInputs(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  if (
    !plainRecord(value)
    || !plainRecord(value.base)
    || !plainRecord(value.base.base)
    || !plainRecord(value.base.base.base)
    || !Array.isArray(value.base.base.base.residents)
    || !Array.isArray(value.base.base.alpineResidents)
    || !Array.isArray(value.base.polarShoreResidents)
    || !Array.isArray(value.coldShoreResidents)
  ) {
    return null;
  }
  const regional = projectionResidentInputs(value.base.base.base.residents);
  const alpine = projectionResidentInputs(value.base.base.alpineResidents);
  const polarShore = projectionResidentInputs(value.base.polarShoreResidents);
  const cold = projectionResidentInputs(value.coldShoreResidents);
  return regional === null || alpine === null || polarShore === null || cold === null
    ? null
    : Object.freeze([...regional, ...alpine, ...polarShore, ...cold]);
}

function projectionResidentInputs(
  value: readonly unknown[],
): readonly RegionalEcologyResidentPatch[] | null {
  const residents: RegionalEcologyResidentPatch[] = [];
  for (const resident of value) {
    if (
      !plainRecord(resident)
      || typeof resident.sourceKey !== "string"
      || !("patch" in resident)
    ) {
      return null;
    }
    residents.push(Object.freeze({
      sourceKey: resident.sourceKey,
      patch: resident.patch as CoreEcologyAggregatePatchState,
    }));
  }
  return Object.freeze(residents);
}

function v4ProjectionPatches(
  projection: RegionalEcologyStateV4ActiveProjection,
): readonly CoreEcologyAggregatePatchState[] {
  return v4ProjectionResidents(projection).map(({ patch }) => patch);
}

function v4ProjectionResidents(
  projection: RegionalEcologyStateV4ActiveProjection,
): readonly Readonly<{
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}>[] {
  return [
    ...projection.base.base.base.residents,
    ...projection.base.base.alpineResidents,
    ...projection.base.polarShoreResidents,
    ...projection.coldShoreResidents,
  ].map(({ sourceKey, patch }) => Object.freeze({ sourceKey, patch }));
}

function v4CommitResidentInputs(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  if (
    !plainRecord(value)
    || !plainRecord(value.base)
    || !plainRecord(value.base.base)
    || !plainRecord(value.base.base.base)
    || !Array.isArray(value.base.base.base.residents)
    || !Array.isArray(value.base.base.alpineResidents)
    || !Array.isArray(value.base.polarShoreResidents)
    || !Array.isArray(value.coldShoreResidents)
  ) {
    return null;
  }
  const regional = projectionResidentInputs(value.base.base.base.residents);
  const alpine = projectionResidentInputs(value.base.base.alpineResidents);
  const polarShore = projectionResidentInputs(value.base.polarShoreResidents);
  const cold = projectionResidentInputs(value.coldShoreResidents);
  return regional === null || alpine === null || polarShore === null || cold === null
    ? null
    : Object.freeze([...regional, ...alpine, ...polarShore, ...cold]);
}

function sourceLineageHash(patch: CoreEcologyAggregatePatchState): string {
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
    groupIds: Object.freeze([]),
    aggregates: Object.freeze([]),
  });
}

function patchIds(patch: CoreEcologyAggregatePatchState): readonly string[] {
  return [
    ...patch.populations.map(({ species, populationKey }) => (
      qualifiedPopulationKey(species, populationKey)
    )),
    ...patch.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    )),
  ];
}

function qualifiedPopulationKey(species: string, populationKey: string): string {
  return `${species.length}:${species}:${populationKey}`;
}

function addOwnershipIds(
  target: Set<string>,
  ownership: RegionalEcologyStateV4SourceOwnership,
): boolean {
  const ids = [
    ownership.sourceKey,
    ...ownership.populationKeys,
    ...ownership.actorIds,
    ...ownership.groupIds,
    ...ownership.aggregateIds,
    ...ownership.mortalityIds,
    ...ownership.bodyIds,
  ];
  for (const id of ids) {
    if (target.has(id)) return false;
    target.add(id);
  }
  return true;
}

function materializedActorIds(patch: CoreEcologyAggregatePatchState): readonly string[] {
  return patch.populations.flatMap(({ members }) => members
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actor.identity.stableId));
}

function countMaterializedActors(patch: CoreEcologyAggregatePatchState): number {
  return materializedActorIds(patch).length;
}

/** The transient global plan owns exactly which polar-consumer actors participate. */
function projectedMaterializationPlanIsHonored(
  projected: readonly Readonly<{
    readonly sourceKey: string;
    readonly patch: CoreEcologyAggregatePatchState;
  }>[],
  outputValue: unknown,
): boolean {
  if (!projectedMaterializationSelectionIsHonored(projected, outputValue)) {
    return false;
  }
  const outputBySource = new Map(
    (outputValue as readonly RegionalEcologyResidentPatch[]).map(({ sourceKey, patch }) => (
      [sourceKey, patch] as const
    )),
  );
  for (const source of projected) {
    const output = outputBySource.get(source.sourceKey);
    if (
      output === undefined
      || output.nextMortalityOrdinal !== 0
      || output.mortalityTransactions.length !== 0
      || output.carcasses.length !== 0
      || output.groups.groups.length !== 0
      || output.aggregatePopulations.length !== 0
    ) {
      return false;
    }
  }
  return true;
}

/** Inherited owners may retire a selected body, but may not swap or hide it. */
function projectedMaterializationTransitionIsHonored(
  projected: readonly Readonly<{
    readonly sourceKey: string;
    readonly patch: CoreEcologyAggregatePatchState;
  }>[],
  outputValue: unknown,
): boolean {
  if (!Array.isArray(outputValue)) return false;
  const outputBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of outputValue) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || outputBySource.has(raw.sourceKey)
    ) {
      return false;
    }
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || patch.patchKey !== raw.sourceKey
    ) {
      return false;
    }
    outputBySource.set(raw.sourceKey, patch);
  }
  if (outputBySource.size !== projected.length) return false;
  for (const source of projected) {
    const output = outputBySource.get(source.sourceKey);
    if (output === undefined) return false;
    const selected = new Set(materializedActorIds(source.patch));
    const returned = new Set(materializedActorIds(output));
    if ([...returned].some((actorId) => !selected.has(actorId))) return false;
    const priorMortalityById = new Map(
      source.patch.mortalityTransactions.map((transaction) => (
        [transaction.mortalityId, transaction] as const
      )),
    );
    const outputMortalityById = new Map(
      output.mortalityTransactions.map((transaction) => (
        [transaction.mortalityId, transaction] as const
      )),
    );
    if ([...priorMortalityById].some(([mortalityId, transaction]) => (
      stableStringify(outputMortalityById.get(mortalityId))
        !== stableStringify(transaction)
    ))) return false;
    const newlyRetired = new Set(output.mortalityTransactions
      .filter(({ mortalityId }) => !priorMortalityById.has(mortalityId))
      .map(({ retiredActor }) => retiredActor.identity.stableId));
    if (
      [...newlyRetired].some((actorId) => !selected.has(actorId))
      || [...selected].some((actorId) => (
        !returned.has(actorId) && !newlyRetired.has(actorId)
      ))
    ) {
      return false;
    }
  }
  return true;
}

function projectedMaterializationSelectionIsHonored(
  projected: readonly Readonly<{
    readonly sourceKey: string;
    readonly patch: CoreEcologyAggregatePatchState;
  }>[],
  outputValue: unknown,
): boolean {
  if (!Array.isArray(outputValue)) return false;
  const outputBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of outputValue) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || outputBySource.has(raw.sourceKey)
    ) {
      return false;
    }
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || patch.patchKey !== raw.sourceKey
    ) {
      return false;
    }
    outputBySource.set(raw.sourceKey, patch);
  }
  if (outputBySource.size !== projected.length) return false;
  for (const source of projected) {
    const output = outputBySource.get(source.sourceKey);
    if (output === undefined) return false;
    const selected = [...materializedActorIds(source.patch)].sort(compareText);
    const returned = [...materializedActorIds(output)].sort(compareText);
    if (
      stableStringify(selected) !== stableStringify(returned)
    ) {
      return false;
    }
  }
  return true;
}

function patchMaterializationIsGroupAtomic(
  patch: CoreEcologyAggregatePatchState,
): boolean {
  for (const group of patch.groups.groups) {
    const population = patch.populations.find(({ populationKey, species }) => (
      species === group.identity.species
      && populationKey === group.identity.populationKey
    ));
    if (population === undefined) return false;
    const selected = population.members.filter(({
      populationOrdinal,
      materialization,
    }) => (
      group.memberOrdinals.includes(populationOrdinal)
      && materialization === "materialized"
    )).length;
    if (selected !== 0 && selected !== group.memberOrdinals.length) return false;
  }
  return true;
}

function sealState(
  value: Omit<RegionalEcologyStateV5, "integrity">,
): RegionalEcologyStateV5 {
  const state = deepFreeze({ ...value, integrity: hashCanonical(value) });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology v5 state exceeds the composite save budget");
  }
  TRUSTED_STATES.add(state);
  return state;
}

function copyRegion(region: RegionCoord): RegionCoord {
  return createRegionCoord(region.x, region.y);
}

function compareSnapshot(
  left: Pick<RegionalEcologyStateV5PolarConsumerSnapshotV1, "sourceKey">,
  right: Pick<RegionalEcologyStateV5PolarConsumerSnapshotV1, "sourceKey">,
): number {
  return compareText(left.sourceKey, right.sourceKey);
}

function compareResident(
  left: Pick<RegionalEcologyResidentPatch, "sourceKey">,
  right: Pick<RegionalEcologyResidentPatch, "sourceKey">,
): number {
  return compareText(left.sourceKey, right.sourceKey);
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function serializedBytes(value: unknown): number {
  return UTF8_ENCODER.encode(stableStringify(value)).byteLength;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
