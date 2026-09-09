import type { RootSeed } from "../sim/rng";
import { createRegionCoord, regionKey, type RegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import type { CoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import {
  REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
  advanceRegionalAlpineEcologyRoot,
  canonicalRegionalAlpineEcologyRootForWorld,
  canonicalizeRegionalAlpineEcologyRoot,
  createPristineRegionalAlpineEcologyRoot,
  putRegionalAlpineEcologyResidentDeviation,
  regionalAlpineEcologyResidentsForActiveRegions,
  type RegionalAlpineEcologyRootV1,
} from "./regionalAlpineEcology";
import {
  canonicalCoreEcologyAlpineResidentPatch,
  coreEcologyAlpineResidentPatchIsAllCoarse,
} from "./regionalAlpineResidents";
import {
  bindRegionalEcologyActiveProjection,
  canonicalRegionalEcologyStateForWorld,
  canonicalizeRegionalEcologyState,
  commitRegionalEcologyActiveProjection,
  normalizeRegionalEcologyResidentPatchForStorage,
  regionalEcologyActiveSourceSnapshots,
  regionalEcologyResidentTransitionIsVisitationOnly,
  regionalEcologyPatchResidenceRegions,
  regionalEcologySourceOwnership,
  replaceRegionalEcologyActiveState,
  REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES,
  type CommitRegionalEcologyActiveProjectionInput,
  type ReplaceRegionalEcologyActiveStateInput,
  type RegionalEcologyActiveProjectionV1,
  type RegionalEcologySourceOwnershipV1,
  type RegionalEcologyStateSourceKind,
  type RegionalEcologyStateV1,
} from "./regionalEcologyState";
import {
  setRegionalEcologyMaterializationForWindow,
  type RegionalEcologyResidentPatch,
} from "./regionalEcologyRuntime";

export const REGIONAL_ECOLOGY_STATE_V2_VERSION = 2 as const;
export const REGIONAL_ECOLOGY_STATE_V2_OWNER_ID =
  "game:regional-ecology-state:v2" as const;
export const REGIONAL_ECOLOGY_STATE_V2_ALPINE_SNAPSHOT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V2_ADOPTION_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V2_ADOPTION_POLICY_ID =
  "regional-ecology-v25-wrapper:v1" as const;
export const REGIONAL_ECOLOGY_STATE_V2_ACTIVE_PROJECTION_VERSION = 2 as const;
/** Child maxima plus bounded hot-snapshot/migration headroom. */
export const REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES =
  REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES
  + REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES
  + 28 * 1_024 * 1_024;

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const TRANSACTION_PATTERN = /^regional-ecology-v25-wrapper:[0-9a-f]{16}$/u;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_STATES = new WeakSet<object>();
const TRUSTED_PROJECTIONS = new WeakSet<object>();

export interface RegionalEcologyStateV2AdoptionReceiptV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V2_ADOPTION_VERSION;
  readonly status: "committed";
  readonly policyId: typeof REGIONAL_ECOLOGY_STATE_V2_ADOPTION_POLICY_ID;
  readonly transactionId: string;
  readonly sourceOuterVersion: 25;
  readonly sourceEnvelopeIntegrity: string;
  readonly sourceStateIntegrity: string;
  readonly sourceStateHash: string;
  readonly sourceBaseLineageHash: string;
  readonly sourceCompletedTick: number;
  readonly resultAlpineRootIntegrity: string;
  readonly integrity: string;
}

/** Authenticated, all-coarse hot snapshot owned only by the Alpine sibling. */
export interface RegionalEcologyStateV2AlpineSnapshotV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V2_ALPINE_SNAPSHOT_VERSION;
  readonly kind: "regional-alpine";
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly integrity: string;
}

export interface RegionalEcologyStateV2 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V2_VERSION;
  readonly ownerId: typeof REGIONAL_ECOLOGY_STATE_V2_OWNER_ID;
  readonly updatedAtTick: number;
  /** Exact authenticated v25 child. Its bytes and version remain untouched. */
  readonly base: RegionalEcologyStateV1;
  /** Append-only Wave-F sparse authority. */
  readonly alpineRoot: RegionalAlpineEcologyRootV1;
  /** Hot Alpine snapshots use base.activeRegions; there is no second window. */
  readonly alpineActiveResidents: readonly RegionalEcologyStateV2AlpineSnapshotV1[];
  /** Migration provenance from v25; null for a fresh v26 world. */
  readonly adoption: RegionalEcologyStateV2AdoptionReceiptV1 | null;
  readonly integrity: string;
}

export interface RegionalEcologyStateV2WorldBinding {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
  readonly settlementHomeHabitat: CoreEcologyRegionalPredatorHabitatAssemblage;
}

export interface CreateRegionalEcologyStateV2Input {
  readonly base: RegionalEcologyStateV1;
  readonly alpineRoot: RegionalAlpineEcologyRootV1;
  readonly alpineActiveResidents: readonly RegionalEcologyResidentPatch[];
  readonly adoption: RegionalEcologyStateV2AdoptionReceiptV1 | null;
}

export interface MigrateRegionalEcologyStateV1ToV2Input {
  readonly rootSeed: RootSeed;
  readonly sourceEnvelopeIntegrity: string;
}

export interface RegionalEcologyStateV2ProjectedAlpineResidentV1 {
  readonly kind: "regional-alpine";
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly sourcePatchHash: string;
  readonly projectedPatchHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalEcologyStateV2ActiveProjection {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V2_ACTIVE_PROJECTION_VERSION;
  readonly ownerId: "game:regional-ecology-active-projection:v2";
  readonly stateIntegrity: string;
  readonly atTick: number;
  readonly base: RegionalEcologyActiveProjectionV1;
  readonly alpineResidents: readonly RegionalEcologyStateV2ProjectedAlpineResidentV1[];
  readonly integrity: string;
}

export interface CommitRegionalEcologyStateV2ActiveProjectionInput {
  readonly base: CommitRegionalEcologyActiveProjectionInput;
  readonly alpineResidents: readonly RegionalEcologyResidentPatch[];
}

export interface ReplaceRegionalEcologyStateV2ActiveStateInput {
  readonly expectedIntegrity: string;
  /** Raw v1 exchange input; this owner executes and authenticates the child transaction. */
  readonly base: ReplaceRegionalEcologyActiveStateInput;
}

export interface RegionalEcologyStateV2SourceOwnership
  extends Omit<RegionalEcologySourceOwnershipV1, "kind"> {
  readonly layer: "base" | "alpine";
  readonly kind: RegionalEcologyStateSourceKind | "regional-alpine";
}

/**
 * Construct one strict composite. The old child is retained by reference after
 * canonicalization; no migration or wrapper operation rewrites its contents.
 */
export function createRegionalEcologyStateV2(
  input: CreateRegionalEcologyStateV2Input,
): RegionalEcologyStateV2 {
  if (!plainRecord(input) || !exactKeys(input, [
    "adoption",
    "alpineActiveResidents",
    "alpineRoot",
    "base",
  ]) || !Array.isArray(input.alpineActiveResidents)) {
    throw new TypeError("Regional ecology v2 input is malformed");
  }
  const base = canonicalizeRegionalEcologyState(input.base);
  const alpineRoot = canonicalizeRegionalAlpineEcologyRoot(input.alpineRoot);
  if (
    base === null
    || alpineRoot === null
    || stableStringify(base) !== stableStringify(input.base)
    || stableStringify(alpineRoot) !== stableStringify(input.alpineRoot)
    || alpineRoot.updatedAtTick !== base.updatedAtTick
    || alpineRoot.seedFingerprint !== base.root.seedFingerprint
  ) throw new RangeError("Regional ecology v2 children are not canonical at one clock");
  const alpineActiveResidents = input.alpineActiveResidents.map((resident) => (
    createAlpineSnapshot(resident, base.updatedAtTick)
  )).sort(compareSnapshot);
  const adoption = canonicalAdoption(input.adoption, base, alpineRoot);
  if (input.adoption !== null && adoption === null) {
    throw new RangeError("Regional ecology v2 adoption receipt is malformed");
  }
  if (!validAlpineSources(base, alpineRoot, alpineActiveResidents)) {
    throw new RangeError("Regional ecology v2 Alpine sources overlap or escape the hot window");
  }
  if (!validCrossLayerOwnership(base, alpineRoot, alpineActiveResidents)) {
    throw new RangeError("Regional ecology v2 child ownership overlaps");
  }
  return sealState({
    version: REGIONAL_ECOLOGY_STATE_V2_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V2_OWNER_ID,
    updatedAtTick: base.updatedAtTick,
    base,
    alpineRoot,
    alpineActiveResidents: Object.freeze(alpineActiveResidents),
    adoption,
  });
}

/** Fresh v26 worlds have no adoption receipt. */
export function createFreshRegionalEcologyStateV2(
  baseValue: unknown,
  rootSeed: RootSeed,
): RegionalEcologyStateV2 {
  const base = canonicalizeRegionalEcologyState(baseValue);
  if (base === null) throw new TypeError("Fresh regional ecology v2 requires one v1 base");
  const alpineRoot = createPristineRegionalAlpineEcologyRoot({
    rootSeed,
    completedTick: base.updatedAtTick,
  });
  const alpineActiveResidents = requireAlpineActiveResidents(alpineRoot, rootSeed, base);
  return createRegionalEcologyStateV2({
    base,
    alpineRoot,
    alpineActiveResidents,
    adoption: null,
  });
}

/** Exact-once append-only wrapping of an authenticated outer-v25 child. */
export function migrateRegionalEcologyStateV1ToV2(
  baseValue: unknown,
  input: MigrateRegionalEcologyStateV1ToV2Input,
): RegionalEcologyStateV2 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["rootSeed", "sourceEnvelopeIntegrity"])
    || !validHash(input.sourceEnvelopeIntegrity)
  ) throw new TypeError("Regional ecology v25 migration input is malformed");
  const base = canonicalizeRegionalEcologyState(baseValue);
  if (base === null || stableStringify(base) !== stableStringify(baseValue)) {
    throw new TypeError("Regional ecology v25 migration requires an exact v1 child");
  }
  const alpineRoot = createPristineRegionalAlpineEcologyRoot({
    rootSeed: input.rootSeed,
    completedTick: base.updatedAtTick,
  });
  const receiptBase = {
    version: REGIONAL_ECOLOGY_STATE_V2_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V2_ADOPTION_POLICY_ID,
    transactionId: `regional-ecology-v25-wrapper:${hashCanonical({
      policyId: REGIONAL_ECOLOGY_STATE_V2_ADOPTION_POLICY_ID,
      sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
      sourceStateIntegrity: base.integrity,
      sourceStateHash: hashCanonical(base),
      sourceBaseLineageHash: regionalEcologyBaseLineageHash(base),
      sourceCompletedTick: base.updatedAtTick,
      resultAlpineRootIntegrity: alpineRoot.integrity,
    })}`,
    sourceOuterVersion: 25 as const,
    sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
    sourceStateIntegrity: base.integrity,
    sourceStateHash: hashCanonical(base),
    sourceBaseLineageHash: regionalEcologyBaseLineageHash(base),
    sourceCompletedTick: base.updatedAtTick,
    resultAlpineRootIntegrity: alpineRoot.integrity,
  };
  const adoption = deepFreeze({ ...receiptBase, integrity: hashCanonical(receiptBase) });
  const alpineActiveResidents = requireAlpineActiveResidents(alpineRoot, input.rootSeed, base);
  return createRegionalEcologyStateV2({
    base,
    alpineRoot,
    alpineActiveResidents,
    adoption,
  });
}

export function canonicalizeRegionalEcologyStateV2(
  value: unknown,
): RegionalEcologyStateV2 | null {
  if (typeof value === "object" && value !== null && TRUSTED_STATES.has(value)) {
    return value as RegionalEcologyStateV2;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "adoption",
    "alpineActiveResidents",
    "alpineRoot",
    "base",
    "integrity",
    "ownerId",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_STATE_V2_VERSION
    || value.ownerId !== REGIONAL_ECOLOGY_STATE_V2_OWNER_ID
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.alpineActiveResidents)
    || !validHash(value.integrity)
  ) return null;
  const base = canonicalizeRegionalEcologyState(value.base);
  const alpineRoot = canonicalizeRegionalAlpineEcologyRoot(value.alpineRoot);
  if (
    base === null
    || alpineRoot === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(alpineRoot) !== stableStringify(value.alpineRoot)
    || base.updatedAtTick !== value.updatedAtTick
    || alpineRoot.updatedAtTick !== value.updatedAtTick
    || alpineRoot.seedFingerprint !== base.root.seedFingerprint
  ) return null;
  const alpineActiveResidents: RegionalEcologyStateV2AlpineSnapshotV1[] = [];
  for (const raw of value.alpineActiveResidents) {
    const snapshot = canonicalAlpineSnapshot(raw, value.updatedAtTick);
    if (snapshot === null) return null;
    alpineActiveResidents.push(snapshot);
  }
  alpineActiveResidents.sort(compareSnapshot);
  if (
    stableStringify(alpineActiveResidents) !== stableStringify(value.alpineActiveResidents)
    || !validAlpineSources(base, alpineRoot, alpineActiveResidents)
    || !validCrossLayerOwnership(base, alpineRoot, alpineActiveResidents)
  ) return null;
  const adoption = canonicalAdoption(value.adoption, base, alpineRoot);
  if (value.adoption !== null && adoption === null) return null;
  const stateBase = {
    version: REGIONAL_ECOLOGY_STATE_V2_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V2_OWNER_ID,
    updatedAtTick: value.updatedAtTick,
    base,
    alpineRoot,
    alpineActiveResidents: Object.freeze(alpineActiveResidents),
    adoption,
  };
  if (hashCanonical(stateBase) !== value.integrity) return null;
  const state = deepFreeze({ ...stateBase, integrity: value.integrity });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES) return null;
  TRUSTED_STATES.add(state);
  return state;
}

/** World/seed trust boundary for both authenticated children and hot snapshots. */
export function canonicalRegionalEcologyStateV2ForWorld(
  value: unknown,
  binding: RegionalEcologyStateV2WorldBinding,
): RegionalEcologyStateV2 | null {
  if (!plainRecord(binding) || !nonnegativeSafeInteger(binding.completedTick)) return null;
  const state = canonicalizeRegionalEcologyStateV2(value);
  if (state === null || state.updatedAtTick !== binding.completedTick) return null;
  if (canonicalRegionalEcologyStateForWorld(state.base, binding) === null) return null;
  const alpineRoot = canonicalRegionalAlpineEcologyRootForWorld(state.alpineRoot, binding);
  if (alpineRoot === null) return null;
  const expected = regionalAlpineEcologyResidentsForActiveRegions(
    alpineRoot,
    binding.rootSeed,
    state.base.activeRegions,
  );
  if (expected === null || expected.length !== state.alpineActiveResidents.length) return null;
  const expectedBySource = new Map(expected.map((resident) => [resident.sourceKey, resident.patch]));
  for (const snapshot of state.alpineActiveResidents) {
    const bound = canonicalCoreEcologyAlpineResidentPatch(snapshot.patch, {
      seed: binding.rootSeed,
      region: snapshot.region,
      completedTick: binding.completedTick,
    });
    const authoritative = expectedBySource.get(snapshot.sourceKey);
    if (
      bound === null
      || authoritative === undefined
      || stableStringify(bound) !== stableStringify(authoritative)
    ) return null;
    expectedBySource.delete(snapshot.sourceKey);
  }
  return expectedBySource.size === 0 ? state : null;
}

export function serializeRegionalEcologyStateV2(value: unknown): string {
  const state = canonicalizeRegionalEcologyStateV2(value);
  if (state === null) throw new TypeError("Regional ecology v2 state is malformed");
  const text = stableStringify(state);
  if (UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology v2 state exceeds the composite save budget");
  }
  return text;
}

export function deserializeRegionalEcologyStateV2(text: unknown): RegionalEcologyStateV2 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeRegionalEcologyStateV2(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

/** Exact canonical source patches participating in the single hot projection. */
export function regionalEcologyStateV2ActiveSourcePatches(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  const state = canonicalizeRegionalEcologyStateV2(value);
  if (state === null) return null;
  const baseSources = regionalEcologyActiveSourceSnapshots(state.base);
  if (baseSources === null) return null;
  return Object.freeze([
    ...baseSources.map(({ sourceKey, patch }) => Object.freeze({ sourceKey, patch })),
    ...state.alpineActiveResidents.map(({ sourceKey, patch }) => Object.freeze({ sourceKey, patch })),
  ].sort(compareResident));
}

/**
 * One call to the shared planner establishes the global 24-body ceiling across
 * Alpha-32 and Alpine sources; only afterward are commands rebound to owners.
 */
export function projectRegionalEcologyStateV2ActiveState(
  value: unknown,
  window: CoreEcologyRuntimeWindow,
): RegionalEcologyStateV2ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV2(value);
  if (state === null) return null;
  const sources = regionalEcologyStateV2ActiveSourcePatches(state);
  if (sources === null) return null;
  const materialized = setRegionalEcologyMaterializationForWindow(
    sources,
    window,
    state.updatedAtTick,
  );
  return materialized === null
    ? null
    : bindRegionalEcologyStateV2ActiveProjection(state, materialized);
}

export function bindRegionalEcologyStateV2ActiveProjection(
  value: unknown,
  materializedResidentsValue: unknown,
): RegionalEcologyStateV2ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV2(value);
  if (state === null || !Array.isArray(materializedResidentsValue)) return null;
  const baseSources = regionalEcologyActiveSourceSnapshots(state.base);
  if (baseSources === null) return null;
  const baseKeys = new Set(baseSources.map(({ sourceKey }) => sourceKey));
  const alpineKeys = new Set(state.alpineActiveResidents.map(({ sourceKey }) => sourceKey));
  const baseResidents: RegionalEcologyResidentPatch[] = [];
  const alpineResidents: RegionalEcologyResidentPatch[] = [];
  const seen = new Set<string>();
  for (const raw of materializedResidentsValue) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || seen.has(raw.sourceKey)
    ) return null;
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || patch.patchKey !== raw.sourceKey
    ) return null;
    const resident = Object.freeze({ sourceKey: raw.sourceKey, patch });
    if (baseKeys.has(raw.sourceKey)) baseResidents.push(resident);
    else if (alpineKeys.has(raw.sourceKey)) alpineResidents.push(resident);
    else return null;
    seen.add(raw.sourceKey);
  }
  if (seen.size !== baseKeys.size + alpineKeys.size) return null;
  const base = bindRegionalEcologyActiveProjection(state.base, baseResidents);
  const alpine = bindAlpineProjection(state, alpineResidents);
  if (base === null || alpine === null) return null;
  const projectedPatches = [
    ...base.residents.map(({ patch }) => patch),
    ...alpine.map(({ patch }) => patch),
  ];
  if (!projectedPatches.every(patchMaterializationIsGroupAtomic)) return null;
  const materializedActorCount = projectedPatches.reduce(
    (sum, patch) => sum + countMaterializedActors(patch),
    0,
  );
  if (materializedActorCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS) return null;
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V2_ACTIVE_PROJECTION_VERSION,
    ownerId: "game:regional-ecology-active-projection:v2" as const,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    alpineResidents: alpine,
  };
  const projection = deepFreeze({ ...projectionBase, integrity: hashCanonical(projectionBase) });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

/** All projected owners commit together, or the immutable prior state survives. */
export function commitRegionalEcologyStateV2ActiveProjection(
  stateValue: unknown,
  projectionValue: unknown,
  input: CommitRegionalEcologyStateV2ActiveProjectionInput,
): RegionalEcologyStateV2 | null {
  const state = canonicalizeRegionalEcologyStateV2(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["alpineResidents", "base"])
    || !plainRecord(input.base)
    || !Array.isArray(input.alpineResidents)
  ) return null;
  const projection = canonicalProjection(projectionValue, state);
  if (projection === null) return null;
  if (
    !projectedMaterializationPlanIsHonored(
      projection.base.residents,
      input.base.residents,
      true,
    )
    || !projectedMaterializationPlanIsHonored(
      projection.alpineResidents,
      input.alpineResidents,
      false,
    )
  ) return null;
  let base: RegionalEcologyStateV1 | null;
  try {
    base = commitRegionalEcologyActiveProjection(
      state.base,
      projection.base,
      input.base,
    );
  } catch {
    return null;
  }
  if (base === null || base.updatedAtTick < state.updatedAtTick) return null;
  let alpineRoot: RegionalAlpineEcologyRootV1;
  try {
    alpineRoot = advanceRegionalAlpineEcologyRoot(state.alpineRoot, base.updatedAtTick);
  } catch {
    return null;
  }
  const outputBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of input.alpineResidents) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || outputBySource.has(raw.sourceKey)
    ) return null;
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || patch.patchKey !== raw.sourceKey
      || patch.updatedAtTick !== base.updatedAtTick
    ) return null;
    outputBySource.set(raw.sourceKey, patch);
  }
  if (outputBySource.size !== projection.alpineResidents.length) return null;
  const originalBySource = new Map(state.alpineActiveResidents.map((entry) => [
    entry.sourceKey,
    entry,
  ]));
  for (const projected of projection.alpineResidents) {
    const original = originalBySource.get(projected.sourceKey);
    const output = outputBySource.get(projected.sourceKey);
    if (original === undefined || output === undefined) return null;
    const bound = canonicalCoreEcologyAlpineResidentPatch(output, {
      seed: input.base.rootSeed,
      region: original.region,
      completedTick: base.updatedAtTick,
    });
    if (
      bound === null
      || sourceLineageHash(bound) !== original.lineageHash
      || !patchMaterializationIsGroupAtomic(bound)
    ) return null;
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
      && regionalEcologyResidentTransitionIsVisitationOnly(normalizedProjection, normalized);
    if (!presentationOnly && !visitationOnly) {
      try {
        alpineRoot = putRegionalAlpineEcologyResidentDeviation(alpineRoot, {
          rootSeed: input.base.rootSeed,
          patch: normalized,
        });
      } catch {
        return null;
      }
    }
  }
  try {
    // Re-derive from the post-commit root and the base child's one hot-window
    // authority. This both drops departed owners and admits new origin or
    // current-residence owners during seamless region crossings.
    const alpineActiveResidents = requireAlpineActiveResidents(
      alpineRoot,
      input.base.rootSeed,
      base,
    );
    return createRegionalEcologyStateV2({
      base,
      alpineRoot,
      alpineActiveResidents,
      adoption: state.adoption,
    });
  } catch {
    return null;
  }
}

/**
 * Exchange the base-owned hot neighborhood and rederive the Alpine sibling
 * from that same window. This owner invokes the raw v1 transaction itself, so
 * callers cannot smuggle a separately advanced or forged child through a seam.
 */
export function replaceRegionalEcologyStateV2ActiveState(
  stateValue: unknown,
  input: ReplaceRegionalEcologyStateV2ActiveStateInput,
): RegionalEcologyStateV2 {
  const state = canonicalizeRegionalEcologyStateV2(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "expectedIntegrity"])
    || input.expectedIntegrity !== state.integrity
  ) throw new RangeError("Regional ecology v2 active replacement is stale or malformed");
  let base: RegionalEcologyStateV1;
  try {
    base = replaceRegionalEcologyActiveState(state.base, input.base);
  } catch {
    throw new RangeError("Regional ecology v2 active replacement breaks base lineage");
  }
  const alpineRoot = state.alpineRoot;
  if (canonicalRegionalAlpineEcologyRootForWorld(alpineRoot, {
    rootSeed: input.base.rootSeed,
    completedTick: base.updatedAtTick,
  }) === null) throw new RangeError("Regional ecology v2 active replacement belongs to another world");
  const alpineActiveResidents = requireAlpineActiveResidents(alpineRoot, input.base.rootSeed, base);
  return createRegionalEcologyStateV2({
    base,
    alpineRoot,
    alpineActiveResidents,
    adoption: state.adoption,
  });
}

/**
 * Composite diagnostic manifest. The base half reports its currently owned
 * snapshots; the Alpine half additionally reports sparse deviations unless
 * `activeOnly` is requested. Admission validation traverses both roots itself
 * and does not treat this asymmetric view as a root-wide custody proof.
 */
export function regionalEcologyStateV2SourceOwnership(
  value: unknown,
  activeOnly = false,
): readonly RegionalEcologyStateV2SourceOwnership[] | null {
  const state = canonicalizeRegionalEcologyStateV2(value);
  if (state === null) return null;
  const base = regionalEcologySourceOwnership(state.base, activeOnly);
  if (base === null) return null;
  const alpineBySource = new Map<string, CoreEcologyAggregatePatchState>();
  if (!activeOnly) {
    for (const delta of state.alpineRoot.regions) {
      alpineBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
    }
  }
  for (const resident of state.alpineActiveResidents) {
    alpineBySource.set(resident.sourceKey, resident.patch);
  }
  return Object.freeze([
    ...base.map((entry) => deepFreeze({ ...entry, layer: "base" as const })),
    ...[...alpineBySource].map(([sourceKey, patch]) => deepFreeze({
      ...sourceOwnership(sourceKey, patch, "regional-alpine"),
      layer: "alpine" as const,
    })),
  ].sort((left, right) => compareText(left.sourceKey, right.sourceKey)));
}

function requireAlpineActiveResidents(
  root: RegionalAlpineEcologyRootV1,
  rootSeed: RootSeed,
  base: RegionalEcologyStateV1,
): readonly RegionalEcologyResidentPatch[] {
  const residents = regionalAlpineEcologyResidentsForActiveRegions(
    root,
    rootSeed,
    base.activeRegions,
  );
  if (residents === null) {
    throw new RangeError("Regional Alpine ecology could not derive the active neighborhood");
  }
  return Object.freeze(residents.map(({ sourceKey, patch }) => Object.freeze({
    sourceKey,
    patch,
  })));
}

function createAlpineSnapshot(
  input: RegionalEcologyResidentPatch,
  tick: number,
): RegionalEcologyStateV2AlpineSnapshotV1 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["patch", "sourceKey"])
    || typeof input.sourceKey !== "string"
  ) throw new TypeError("Regional ecology v2 Alpine resident is malformed");
  const patch = normalizeRegionalEcologyResidentPatchForStorage(input.patch, tick);
  if (
    patch === null
    || patch.patchKey !== input.sourceKey
    || patch.derivation.kind !== "regional-alpine-v1"
    || !coreEcologyAlpineResidentPatchIsAllCoarse(patch)
    || patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
    || (patch.populations.length === 0 && patch.aggregatePopulations.length === 0)
  ) throw new RangeError("Regional ecology v2 Alpine resident is not a conserved source");
  const base = {
    version: REGIONAL_ECOLOGY_STATE_V2_ALPINE_SNAPSHOT_VERSION,
    kind: "regional-alpine" as const,
    sourceKey: input.sourceKey,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    patch,
  };
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

function canonicalAlpineSnapshot(
  value: unknown,
  tick: number,
): RegionalEcologyStateV2AlpineSnapshotV1 | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "integrity",
    "kind",
    "lineageHash",
    "patch",
    "patchHash",
    "region",
    "sourceKey",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_STATE_V2_ALPINE_SNAPSHOT_VERSION
    || value.kind !== "regional-alpine"
    || typeof value.sourceKey !== "string"
    || !validHash(value.patchHash)
    || !validHash(value.lineageHash)
    || !validHash(value.integrity)
  ) return null;
  try {
    const snapshot = createAlpineSnapshot({
      sourceKey: value.sourceKey,
      patch: value.patch as CoreEcologyAggregatePatchState,
    }, tick);
    return stableStringify(snapshot) === stableStringify(value) ? snapshot : null;
  } catch {
    return null;
  }
}

function validAlpineSources(
  base: RegionalEcologyStateV1,
  root: RegionalAlpineEcologyRootV1,
  residents: readonly RegionalEcologyStateV2AlpineSnapshotV1[],
): boolean {
  const activeKeys = new Set(base.activeRegions.map(regionKey));
  const sourceKeys = new Set<string>();
  const originKeys = new Set<string>();
  const rootBySource = new Map(root.regions.map((delta) => [
    delta.residentPatch.patchKey,
    delta.residentPatch,
  ]));
  for (const resident of residents) {
    const originKey = regionKey(resident.region);
    const residence = regionalEcologyPatchResidenceRegions(resident.patch);
    if (
      sourceKeys.has(resident.sourceKey)
      || originKeys.has(originKey)
      || residence === null
      || (!activeKeys.has(originKey)
        && !residence.some((region) => activeKeys.has(regionKey(region))))
    ) return false;
    sourceKeys.add(resident.sourceKey);
    originKeys.add(originKey);
    const stored = rootBySource.get(resident.sourceKey);
    if (stored !== undefined && (
      regionKey(stored.originRegion) !== originKey
      || stored.updatedAtTick > resident.patch.updatedAtTick
      || sourceLineageHash(stored) !== resident.lineageHash
    )) return false;
  }
  return true;
}

function validCrossLayerOwnership(
  base: RegionalEcologyStateV1,
  alpineRoot: RegionalAlpineEcologyRootV1,
  alpineResidents: readonly RegionalEcologyStateV2AlpineSnapshotV1[],
): boolean {
  const baseOwnership = regionalEcologySourceOwnership(base, false);
  if (baseOwnership === null) return false;
  const baseIds = new Set<string>();
  for (const owner of baseOwnership) addOwnershipIds(baseIds, owner);
  addPatchIds(baseIds, base.settlementHome.patch);
  for (const resident of base.activeResidents) addPatchIds(baseIds, resident.patch);
  for (const delta of base.root.regions) {
    if (delta.residentPatch !== null) addPatchIds(baseIds, delta.residentPatch);
    for (const placement of delta.legacyPlacements) {
      baseIds.add(placement.baselineActorId);
      baseIds.add(placement.baselinePopulationId);
      baseIds.add(placement.legacyActorId);
    }
    for (const placement of delta.legacyAggregatePlacements) {
      baseIds.add(placement.baselinePopulationId);
      baseIds.add(placement.legacyAggregateId);
    }
  }
  if (base.root.legacyCohort !== null) {
    addPatchIds(baseIds, base.root.legacyCohort.sourcePatch);
    for (const retirement of base.root.legacyCohort.retirements) {
      baseIds.add(retirement.actorId);
    }
    for (const retirement of base.root.legacyCohort.aggregateRetirements) {
      baseIds.add(retirement.aggregateId);
    }
  }

  const alpineBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const delta of alpineRoot.regions) {
    alpineBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
  }
  for (const resident of alpineResidents) alpineBySource.set(resident.sourceKey, resident.patch);
  for (const [sourceKey, patch] of alpineBySource) {
    if (baseIds.has(sourceKey)) return false;
    for (const id of patchIds(patch)) if (baseIds.has(id)) return false;
  }
  return true;
}

function bindAlpineProjection(
  state: RegionalEcologyStateV2,
  residentsValue: readonly RegionalEcologyResidentPatch[],
): readonly RegionalEcologyStateV2ProjectedAlpineResidentV1[] | null {
  if (residentsValue.length !== state.alpineActiveResidents.length) return null;
  const sourceByKey = new Map(state.alpineActiveResidents.map((source) => [source.sourceKey, source]));
  const output: RegionalEcologyStateV2ProjectedAlpineResidentV1[] = [];
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
    ) return null;
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
      kind: "regional-alpine" as const,
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
  state: RegionalEcologyStateV2,
): RegionalEcologyStateV2ActiveProjection | null {
  if (typeof value === "object" && value !== null && TRUSTED_PROJECTIONS.has(value)) {
    const projection = value as RegionalEcologyStateV2ActiveProjection;
    return projection.stateIntegrity === state.integrity ? projection : null;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "alpineResidents",
    "atTick",
    "base",
    "integrity",
    "ownerId",
    "stateIntegrity",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_STATE_V2_ACTIVE_PROJECTION_VERSION
    || value.ownerId !== "game:regional-ecology-active-projection:v2"
    || value.stateIntegrity !== state.integrity
    || value.atTick !== state.updatedAtTick
    || !Array.isArray(value.alpineResidents)
    || !validHash(value.integrity)
  ) return null;
  if (!plainRecord(value.base) || !Array.isArray(value.base.residents)) return null;
  const baseInputs = projectionResidentInputs(value.base.residents);
  const alpineInputs = projectionResidentInputs(value.alpineResidents);
  if (baseInputs === null || alpineInputs === null) return null;
  const base = bindRegionalEcologyActiveProjection(
    state.base,
    baseInputs,
  );
  const alpine = bindAlpineProjection(state, alpineInputs);
  const projectedPatches = base === null || alpine === null
    ? []
    : [...base.residents.map(({ patch }) => patch), ...alpine.map(({ patch }) => patch)];
  if (
    base === null
    || alpine === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(alpine) !== stableStringify(value.alpineResidents)
    || !projectedPatches.every(patchMaterializationIsGroupAtomic)
    || projectedPatches.reduce((sum, patch) => sum + countMaterializedActors(patch), 0)
      > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) return null;
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V2_ACTIVE_PROJECTION_VERSION,
    ownerId: "game:regional-ecology-active-projection:v2" as const,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    alpineResidents: alpine,
  };
  if (hashCanonical(projectionBase) !== value.integrity) return null;
  const projection = deepFreeze({ ...projectionBase, integrity: value.integrity });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

function canonicalAdoption(
  value: unknown,
  base: RegionalEcologyStateV1,
  alpineRoot: RegionalAlpineEcologyRootV1,
): RegionalEcologyStateV2AdoptionReceiptV1 | null {
  if (value === null) return null;
  if (!plainRecord(value) || !exactKeys(value, [
    "integrity",
    "policyId",
    "resultAlpineRootIntegrity",
    "sourceCompletedTick",
    "sourceEnvelopeIntegrity",
    "sourceOuterVersion",
    "sourceBaseLineageHash",
    "sourceStateHash",
    "sourceStateIntegrity",
    "status",
    "transactionId",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_STATE_V2_ADOPTION_VERSION
    || value.status !== "committed"
    || value.policyId !== REGIONAL_ECOLOGY_STATE_V2_ADOPTION_POLICY_ID
    || typeof value.transactionId !== "string"
    || !TRANSACTION_PATTERN.test(value.transactionId)
    || value.sourceOuterVersion !== 25
    || !validHash(value.sourceEnvelopeIntegrity)
    || !validHash(value.sourceStateIntegrity)
    || !validHash(value.sourceStateHash)
    || !validHash(value.sourceBaseLineageHash)
    || !nonnegativeSafeInteger(value.sourceCompletedTick)
    || !validHash(value.resultAlpineRootIntegrity)
    || !validHash(value.integrity)
    || value.sourceCompletedTick > base.updatedAtTick
    || value.sourceBaseLineageHash !== regionalEcologyBaseLineageHash(base)
    || value.resultAlpineRootIntegrity
      !== pristineAlpineRootIntegrity(alpineRoot, value.sourceCompletedTick)
  ) return null;
  const expectedTransactionId = `regional-ecology-v25-wrapper:${hashCanonical({
    policyId: REGIONAL_ECOLOGY_STATE_V2_ADOPTION_POLICY_ID,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceBaseLineageHash: value.sourceBaseLineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultAlpineRootIntegrity: value.resultAlpineRootIntegrity,
  })}`;
  if (value.transactionId !== expectedTransactionId) return null;
  const receiptBase = {
    version: REGIONAL_ECOLOGY_STATE_V2_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V2_ADOPTION_POLICY_ID,
    transactionId: value.transactionId,
    sourceOuterVersion: 25 as const,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceBaseLineageHash: value.sourceBaseLineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultAlpineRootIntegrity: value.resultAlpineRootIntegrity,
  };
  return hashCanonical(receiptBase) === value.integrity
    ? deepFreeze({ ...receiptBase, integrity: value.integrity })
    : null;
}

/** The receipt binds the pristine Alpine identity, not its later mutable clock. */
function pristineAlpineRootIntegrity(
  root: RegionalAlpineEcologyRootV1,
  migrationTick: number,
): string {
  const pristine = {
    version: root.version,
    ownerId: REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
    generationVersion: root.generationVersion,
    baselinePolicyId: root.baselinePolicyId,
    seedFingerprint: root.seedFingerprint,
    updatedAtTick: migrationTick,
    revision: 0,
    lastEventOrdinal: 0,
    regions: Object.freeze([]),
  };
  return hashCanonical(pristine);
}

/** Immutable V1 custody lineage retained across clocks and hot-window exchanges. */
function regionalEcologyBaseLineageHash(base: RegionalEcologyStateV1): string {
  return hashCanonical({
    root: {
      version: base.root.version,
      ownerId: base.root.ownerId,
      generationVersion: base.root.generationVersion,
      baselinePolicyId: base.root.baselinePolicyId,
      seedFingerprint: base.root.seedFingerprint,
      adoptionTransactionId: base.root.adoption?.transactionId ?? null,
      legacySourcePatchHash: base.root.legacyCohort?.sourcePatchHash ?? null,
    },
    settlementHome: {
      sourceKey: base.settlementHome.sourceKey,
      region: base.settlementHome.region,
      lineageHash: base.settlementHome.lineageHash,
    },
  });
}

function sourceOwnership(
  sourceKey: string,
  patch: CoreEcologyAggregatePatchState,
  kind: RegionalEcologyStateV2SourceOwnership["kind"],
): Omit<RegionalEcologyStateV2SourceOwnership, "layer"> {
  const actorIds = new Set(patch.populations.flatMap(({ members }) => (
    members.map(({ actor }) => actor.identity.stableId)
  )));
  for (const transaction of patch.mortalityTransactions) {
    actorIds.add(transaction.retiredActor.identity.stableId);
  }
  return deepFreeze({
    sourceKey,
    kind,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    populationKeys: patch.populations.map(({ species, populationKey }) => (
      qualifiedPopulationKey(species, populationKey)
    )).sort(compareText),
    actorIds: [...actorIds].sort(compareText),
    groupIds: patch.groups.groups.map(({ identity }) => identity.stableId).sort(compareText),
    aggregateIds: patch.aggregatePopulations.map(({ aggregateId }) => aggregateId).sort(compareText),
    mortalityIds: patch.mortalityTransactions.map(({ mortalityId }) => mortalityId).sort(compareText),
    bodyIds: patch.carcasses.map(({ carcassId }) => carcassId).sort(compareText),
  });
}

function projectionResidentInputs(value: readonly unknown[]): readonly RegionalEcologyResidentPatch[] | null {
  const residents: RegionalEcologyResidentPatch[] = [];
  for (const resident of value) {
    if (
      !plainRecord(resident)
      || typeof resident.sourceKey !== "string"
      || !("patch" in resident)
    ) return null;
    residents.push(Object.freeze({
      sourceKey: resident.sourceKey,
      patch: resident.patch as CoreEcologyAggregatePatchState,
    }));
  }
  return Object.freeze(residents);
}

function sourceLineageHash(patch: CoreEcologyAggregatePatchState): string {
  const livingActorIds = patch.populations.flatMap(({ members }) => (
    members.map(({ actor }) => actor.identity.stableId)
  ));
  const retiredActorIds = patch.mortalityTransactions.map(({ retiredActor }) => (
    retiredActor.identity.stableId
  ));
  return hashCanonical({
    patchKey: patch.patchKey,
    originRegion: patch.originRegion,
    derivation: patch.derivation,
    populations: patch.populations.map(({ species, populationKey, baselinePopulationSize }) => ({
      species,
      populationKey,
      baselinePopulationSize,
    })),
    actorIds: [...livingActorIds, ...retiredActorIds].sort(compareText),
    groupIds: patch.groups.groups.map(({ identity }) => identity.stableId).sort(compareText),
    aggregates: patch.aggregatePopulations.map((population) => ({
      aggregateId: population.aggregateId,
      species: population.species,
      populationKey: population.populationKey,
      habitatCapacity: population.habitatCapacity,
    })),
  });
}

function patchIds(patch: CoreEcologyAggregatePatchState): readonly string[] {
  return [
    patch.patchKey,
    ...patch.populations.map(({ species, populationKey }) => (
      qualifiedPopulationKey(species, populationKey)
    )),
    ...patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor.identity.stableId)),
    ...patch.mortalityTransactions.map(({ retiredActor }) => retiredActor.identity.stableId),
    ...patch.groups.groups.map(({ identity }) => identity.stableId),
    ...patch.aggregatePopulations.map(({ aggregateId }) => aggregateId),
    ...patch.mortalityTransactions.map(({ mortalityId, event }) => [mortalityId, event.eventId]).flat(),
    ...patch.carcasses.map(({ carcassId }) => carcassId),
  ];
}

function qualifiedPopulationKey(species: string, populationKey: string): string {
  return `${species.length}:${species}:${populationKey}`;
}

function addPatchIds(target: Set<string>, patch: CoreEcologyAggregatePatchState): void {
  for (const id of patchIds(patch)) target.add(id);
}

function addOwnershipIds(target: Set<string>, ownership: RegionalEcologySourceOwnershipV1): void {
  target.add(ownership.sourceKey);
  for (const values of [
    ownership.populationKeys,
    ownership.actorIds,
    ownership.groupIds,
    ownership.aggregateIds,
    ownership.mortalityIds,
    ownership.bodyIds,
  ]) for (const id of values) target.add(id);
}

function materializedActorIds(patch: CoreEcologyAggregatePatchState): readonly string[] {
  return patch.populations.flatMap(({ members }) => members
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actor.identity.stableId));
}

function countMaterializedActors(patch: CoreEcologyAggregatePatchState): number {
  return materializedActorIds(patch).length;
}

/**
 * The transient top-K result owns who participates in this atomic step. Output
 * may retire a selected base actor only through a newly committed canonical
 * mortality transaction; Wave-F Alpine owners authorize no mortality at all.
 */
function projectedMaterializationPlanIsHonored(
  projected: readonly Readonly<{
    readonly sourceKey: string;
    readonly patch: CoreEcologyAggregatePatchState;
  }>[],
  outputValue: unknown,
  allowNewMortality: boolean,
): boolean {
  if (!Array.isArray(outputValue)) return false;
  const outputBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of outputValue) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || outputBySource.has(raw.sourceKey)
    ) return false;
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || patch.patchKey !== raw.sourceKey
    ) return false;
    outputBySource.set(raw.sourceKey, patch);
  }
  if (outputBySource.size !== projected.length) return false;
  for (const source of projected) {
    const output = outputBySource.get(source.sourceKey);
    if (output === undefined) return false;
    const selected = new Set(materializedActorIds(source.patch));
    const returned = new Set(materializedActorIds(output));
    if ([...returned].some((actorId) => !selected.has(actorId))) return false;
    const priorMortality = new Set(source.patch.mortalityTransactions.map(({ mortalityId }) => (
      mortalityId
    )));
    const newlyRetired = allowNewMortality
      ? new Set(output.mortalityTransactions
          .filter(({ mortalityId }) => !priorMortality.has(mortalityId))
          .map(({ retiredActor }) => retiredActor.identity.stableId))
      : new Set<string>();
    if ([...selected].some((actorId) => (
      !returned.has(actorId) && !newlyRetired.has(actorId)
    ))) return false;
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
    const selected = population.members.filter(({ populationOrdinal, materialization }) => (
      group.memberOrdinals.includes(populationOrdinal)
      && materialization === "materialized"
    )).length;
    if (selected !== 0 && selected !== group.memberOrdinals.length) return false;
  }
  return true;
}

function sealState(
  value: Omit<RegionalEcologyStateV2, "integrity">,
): RegionalEcologyStateV2 {
  const state = deepFreeze({ ...value, integrity: hashCanonical(value) });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology v2 state exceeds the composite save budget");
  }
  TRUSTED_STATES.add(state);
  return state;
}

function copyRegion(region: RegionCoord): RegionCoord {
  return createRegionCoord(region.x, region.y);
}

function compareSnapshot(
  left: Pick<RegionalEcologyStateV2AlpineSnapshotV1, "sourceKey">,
  right: Pick<RegionalEcologyStateV2AlpineSnapshotV1, "sourceKey">,
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
