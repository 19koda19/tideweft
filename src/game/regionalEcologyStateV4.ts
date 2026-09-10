import type { RootSeed } from "../sim/rng";
import { createRegionCoord, regionKey, type RegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND } from "./coreEcologyColdShoreHabitat";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import {
  normalizeRegionalEcologyResidentPatchForStorage,
  regionalEcologyResidentTransitionIsVisitationOnly,
} from "./regionalEcologyState";
import {
  REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV3ActiveProjection,
  canonicalRegionalEcologyStateV3ForWorld,
  canonicalizeRegionalEcologyStateV3,
  commitRegionalEcologyStateV3ActiveProjection,
  regionalEcologyStateV3ActiveSourcePatches,
  regionalEcologyStateV3SourceOwnership,
  replaceRegionalEcologyStateV3ActiveState,
  type CommitRegionalEcologyStateV3ActiveProjectionInput,
  type RegionalEcologyStateV3,
  type RegionalEcologyStateV3ActiveProjection,
  type RegionalEcologyStateV3SourceOwnership,
  type RegionalEcologyStateV3WorldBinding,
  type ReplaceRegionalEcologyStateV3ActiveStateInput,
} from "./regionalEcologyStateV3";
import {
  REGIONAL_COLD_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_COLD_SHORE_ECOLOGY_OWNER_ID,
  advanceRegionalColdShoreEcologyRoot,
  canonicalRegionalColdShoreEcologyRootForWorld,
  canonicalizeRegionalColdShoreEcologyRoot,
  createPristineRegionalColdShoreEcologyRoot,
  putRegionalColdShoreEcologyResidentDeviation,
  regionalColdShoreEcologyResidentsForActiveRegions,
  type RegionalColdShoreEcologyRootV1,
} from "./regionalColdShoreEcology";
import {
  canonicalCoreEcologyColdShoreResidentPatch,
  coreEcologyColdShoreResidentPatchResidenceRegions,
} from "./regionalColdShoreResidents";
import {
  setRegionalEcologyMaterializationForWindow,
  type RegionalEcologyResidentPatch,
} from "./regionalEcologyRuntime";

export const REGIONAL_ECOLOGY_STATE_V4_VERSION = 4 as const;
export const REGIONAL_ECOLOGY_STATE_V4_OWNER_ID =
  "game:regional-ecology-state:v4" as const;
export const REGIONAL_ECOLOGY_STATE_V4_COLD_SHORE_SNAPSHOT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V4_ADOPTION_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V4_ADOPTION_POLICY_ID =
  "regional-ecology-v27-wrapper:v1" as const;
export const REGIONAL_ECOLOGY_STATE_V4_ACTIVE_PROJECTION_VERSION = 4 as const;

/** Exact v3 child, cold-shore root, and bounded hot-snapshot/migration headroom. */
export const REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES =
  REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES
  + REGIONAL_COLD_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES
  + 28 * 1_024 * 1_024;

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const TRANSACTION_PATTERN = /^regional-ecology-v27-wrapper:[0-9a-f]{16}$/u;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_STATES = new WeakSet<object>();
const TRUSTED_PROJECTIONS = new WeakSet<object>();

export interface RegionalEcologyStateV4AdoptionReceiptV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V4_ADOPTION_VERSION;
  readonly status: "committed";
  readonly policyId: typeof REGIONAL_ECOLOGY_STATE_V4_ADOPTION_POLICY_ID;
  readonly transactionId: string;
  readonly sourceOuterVersion: 27;
  readonly sourceEnvelopeIntegrity: string;
  readonly sourceStateIntegrity: string;
  readonly sourceStateHash: string;
  readonly sourceV3LineageHash: string;
  readonly sourceCompletedTick: number;
  readonly resultColdShoreRootIntegrity: string;
  readonly integrity: string;
}

/** Authenticated all-coarse hot snapshot owned only by the cold-shore sibling. */
export interface RegionalEcologyStateV4ColdShoreSnapshotV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V4_COLD_SHORE_SNAPSHOT_VERSION;
  readonly kind: "regional-cold-shore";
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly integrity: string;
}

export interface RegionalEcologyStateV4 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V4_VERSION;
  readonly ownerId: typeof REGIONAL_ECOLOGY_STATE_V4_OWNER_ID;
  readonly updatedAtTick: number;
  /** Exact authenticated outer-v27 ecology child. */
  readonly base: RegionalEcologyStateV3;
  /** Append-only addressable cold-shore sibling authority. */
  readonly coldShoreRoot: RegionalColdShoreEcologyRootV1;
  /** Hot snapshots use the exact v1 child's active regions; there is no second window. */
  readonly coldShoreActiveResidents: readonly RegionalEcologyStateV4ColdShoreSnapshotV1[];
  /** Migration provenance from v27; null for a fresh v28 world. */
  readonly adoption: RegionalEcologyStateV4AdoptionReceiptV1 | null;
  readonly integrity: string;
}

export type RegionalEcologyStateV4WorldBinding = RegionalEcologyStateV3WorldBinding;

export interface CreateRegionalEcologyStateV4Input {
  readonly base: RegionalEcologyStateV3;
  readonly coldShoreRoot: RegionalColdShoreEcologyRootV1;
  readonly coldShoreActiveResidents: readonly RegionalEcologyResidentPatch[];
  readonly adoption: RegionalEcologyStateV4AdoptionReceiptV1 | null;
}

export interface MigrateRegionalEcologyStateV3ToV4Input {
  readonly rootSeed: RootSeed;
  readonly sourceEnvelopeIntegrity: string;
}

export interface RegionalEcologyStateV4ProjectedColdShoreResidentV1 {
  readonly kind: "regional-cold-shore";
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly sourcePatchHash: string;
  readonly projectedPatchHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalEcologyStateV4ActiveProjection {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V4_ACTIVE_PROJECTION_VERSION;
  readonly ownerId: "game:regional-ecology-active-projection:v4";
  readonly stateIntegrity: string;
  readonly atTick: number;
  readonly base: RegionalEcologyStateV3ActiveProjection;
  readonly coldShoreResidents: readonly RegionalEcologyStateV4ProjectedColdShoreResidentV1[];
  readonly integrity: string;
}

export interface CommitRegionalEcologyStateV4ActiveProjectionInput {
  readonly base: CommitRegionalEcologyStateV3ActiveProjectionInput;
  readonly coldShoreResidents: readonly RegionalEcologyResidentPatch[];
}

export interface ReplaceRegionalEcologyStateV4ActiveStateInput {
  readonly expectedIntegrity: string;
  /** Raw v3 exchange input; this owner executes and authenticates the child transaction. */
  readonly base: ReplaceRegionalEcologyStateV3ActiveStateInput;
}

export interface RegionalEcologyStateV4SourceOwnership
  extends Omit<RegionalEcologyStateV3SourceOwnership, "kind" | "layer"> {
  readonly layer: "base" | "alpine" | "polar-shore" | "cold-shore";
  readonly kind:
    | RegionalEcologyStateV3SourceOwnership["kind"]
    | "regional-cold-shore";
}

/** Construct one strict composite without rewriting either canonical child. */
export function createRegionalEcologyStateV4(
  input: CreateRegionalEcologyStateV4Input,
): RegionalEcologyStateV4 {
  if (
    !plainRecord(input)
    || !exactKeys(input, [
      "adoption",
      "base",
      "coldShoreActiveResidents",
      "coldShoreRoot",
    ])
    || !Array.isArray(input.coldShoreActiveResidents)
  ) {
    throw new TypeError("Regional ecology v4 input is malformed");
  }
  const base = canonicalizeRegionalEcologyStateV3(input.base);
  const coldShoreRoot = canonicalizeRegionalColdShoreEcologyRoot(
    input.coldShoreRoot,
  );
  if (
    base === null
    || coldShoreRoot === null
    || stableStringify(base) !== stableStringify(input.base)
    || stableStringify(coldShoreRoot) !== stableStringify(input.coldShoreRoot)
    || coldShoreRoot.updatedAtTick !== base.updatedAtTick
    || coldShoreRoot.seedFingerprint !== base.polarShoreRoot.seedFingerprint
  ) {
    throw new RangeError(
      "Regional ecology v4 children are not canonical at one clock",
    );
  }
  const coldShoreActiveResidents = input.coldShoreActiveResidents
    .map((resident) => createColdShoreSnapshot(resident, base.updatedAtTick))
    .sort(compareSnapshot);
  const adoption = canonicalAdoption(input.adoption, base, coldShoreRoot);
  if (input.adoption !== null && adoption === null) {
    throw new RangeError("Regional ecology v4 adoption receipt is malformed");
  }
  if (!validColdShoreSources(base, coldShoreRoot, coldShoreActiveResidents)) {
    throw new RangeError(
      "Regional ecology v4 cold-shore sources overlap or escape the hot window",
    );
  }
  if (!validCrossLayerOwnership(base, coldShoreRoot, coldShoreActiveResidents)) {
    throw new RangeError("Regional ecology v4 child ownership overlaps");
  }
  return sealState({
    version: REGIONAL_ECOLOGY_STATE_V4_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V4_OWNER_ID,
    updatedAtTick: base.updatedAtTick,
    base,
    coldShoreRoot,
    coldShoreActiveResidents: Object.freeze(coldShoreActiveResidents),
    adoption,
  });
}

/** Fresh outer-v28 worlds have no migration receipt. */
export function createFreshRegionalEcologyStateV4(
  baseValue: unknown,
  rootSeed: RootSeed,
): RegionalEcologyStateV4 {
  const base = canonicalizeRegionalEcologyStateV3(baseValue);
  if (base === null) {
    throw new TypeError("Fresh regional ecology v4 requires one v3 base");
  }
  const coldShoreRoot = createPristineRegionalColdShoreEcologyRoot({
    rootSeed,
    completedTick: base.updatedAtTick,
  });
  const coldShoreActiveResidents = requireColdShoreActiveResidents(
    coldShoreRoot,
    rootSeed,
    base,
  );
  return createRegionalEcologyStateV4({
    base,
    coldShoreRoot,
    coldShoreActiveResidents,
    adoption: null,
  });
}

/** Exact-once append-only wrapping of an authenticated outer-v27 child. */
export function migrateRegionalEcologyStateV3ToV4(
  baseValue: unknown,
  input: MigrateRegionalEcologyStateV3ToV4Input,
): RegionalEcologyStateV4 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["rootSeed", "sourceEnvelopeIntegrity"])
    || !validHash(input.sourceEnvelopeIntegrity)
  ) {
    throw new TypeError("Regional ecology v27 migration input is malformed");
  }
  const base = canonicalizeRegionalEcologyStateV3(baseValue);
  if (base === null || stableStringify(base) !== stableStringify(baseValue)) {
    throw new TypeError(
      "Regional ecology v27 migration requires an exact v3 child",
    );
  }
  const coldShoreRoot = createPristineRegionalColdShoreEcologyRoot({
    rootSeed: input.rootSeed,
    completedTick: base.updatedAtTick,
  });
  const receiptBase = {
    version: REGIONAL_ECOLOGY_STATE_V4_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V4_ADOPTION_POLICY_ID,
    transactionId: `regional-ecology-v27-wrapper:${hashCanonical({
      policyId: REGIONAL_ECOLOGY_STATE_V4_ADOPTION_POLICY_ID,
      sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
      sourceStateIntegrity: base.integrity,
      sourceStateHash: hashCanonical(base),
      sourceV3LineageHash: regionalEcologyV3LineageHash(base),
      sourceCompletedTick: base.updatedAtTick,
      resultColdShoreRootIntegrity: coldShoreRoot.integrity,
    })}`,
    sourceOuterVersion: 27 as const,
    sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
    sourceStateIntegrity: base.integrity,
    sourceStateHash: hashCanonical(base),
    sourceV3LineageHash: regionalEcologyV3LineageHash(base),
    sourceCompletedTick: base.updatedAtTick,
    resultColdShoreRootIntegrity: coldShoreRoot.integrity,
  };
  const adoption = deepFreeze({
    ...receiptBase,
    integrity: hashCanonical(receiptBase),
  });
  const coldShoreActiveResidents = requireColdShoreActiveResidents(
    coldShoreRoot,
    input.rootSeed,
    base,
  );
  return createRegionalEcologyStateV4({
    base,
    coldShoreRoot,
    coldShoreActiveResidents,
    adoption,
  });
}

export function canonicalizeRegionalEcologyStateV4(
  value: unknown,
): RegionalEcologyStateV4 | null {
  if (typeof value === "object" && value !== null && TRUSTED_STATES.has(value)) {
    return value as RegionalEcologyStateV4;
  }
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "adoption",
      "base",
      "coldShoreActiveResidents",
      "coldShoreRoot",
      "integrity",
      "ownerId",
      "updatedAtTick",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V4_VERSION
    || value.ownerId !== REGIONAL_ECOLOGY_STATE_V4_OWNER_ID
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.coldShoreActiveResidents)
    || !validHash(value.integrity)
  ) {
    return null;
  }
  const base = canonicalizeRegionalEcologyStateV3(value.base);
  const coldShoreRoot = canonicalizeRegionalColdShoreEcologyRoot(
    value.coldShoreRoot,
  );
  if (
    base === null
    || coldShoreRoot === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(coldShoreRoot) !== stableStringify(value.coldShoreRoot)
    || base.updatedAtTick !== value.updatedAtTick
    || coldShoreRoot.updatedAtTick !== value.updatedAtTick
    || coldShoreRoot.seedFingerprint !== base.polarShoreRoot.seedFingerprint
  ) {
    return null;
  }
  const coldShoreActiveResidents: RegionalEcologyStateV4ColdShoreSnapshotV1[] = [];
  for (const raw of value.coldShoreActiveResidents) {
    const snapshot = canonicalColdShoreSnapshot(raw, value.updatedAtTick);
    if (snapshot === null) return null;
    coldShoreActiveResidents.push(snapshot);
  }
  coldShoreActiveResidents.sort(compareSnapshot);
  if (
    stableStringify(coldShoreActiveResidents)
      !== stableStringify(value.coldShoreActiveResidents)
    || !validColdShoreSources(base, coldShoreRoot, coldShoreActiveResidents)
    || !validCrossLayerOwnership(base, coldShoreRoot, coldShoreActiveResidents)
  ) {
    return null;
  }
  const adoption = canonicalAdoption(value.adoption, base, coldShoreRoot);
  if (value.adoption !== null && adoption === null) return null;
  const stateBase = {
    version: REGIONAL_ECOLOGY_STATE_V4_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V4_OWNER_ID,
    updatedAtTick: value.updatedAtTick,
    base,
    coldShoreRoot,
    coldShoreActiveResidents: Object.freeze(coldShoreActiveResidents),
    adoption,
  };
  if (hashCanonical(stateBase) !== value.integrity) return null;
  const state = deepFreeze({ ...stateBase, integrity: value.integrity });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES) {
    return null;
  }
  TRUSTED_STATES.add(state);
  return state;
}

/** World/seed trust boundary for the exact v3 child, cold root, and hot snapshots. */
export function canonicalRegionalEcologyStateV4ForWorld(
  value: unknown,
  binding: RegionalEcologyStateV4WorldBinding,
): RegionalEcologyStateV4 | null {
  if (!plainRecord(binding) || !nonnegativeSafeInteger(binding.completedTick)) {
    return null;
  }
  const state = canonicalizeRegionalEcologyStateV4(value);
  if (state === null || state.updatedAtTick !== binding.completedTick) return null;
  if (canonicalRegionalEcologyStateV3ForWorld(state.base, binding) === null) {
    return null;
  }
  const coldShoreRoot = canonicalRegionalColdShoreEcologyRootForWorld(
    state.coldShoreRoot,
    binding,
  );
  if (coldShoreRoot === null) return null;
  const expected = regionalColdShoreEcologyResidentsForActiveRegions(
    coldShoreRoot,
    binding.rootSeed,
    activeRegions(state.base),
  );
  if (
    expected === null
    || expected.length !== state.coldShoreActiveResidents.length
  ) {
    return null;
  }
  const expectedBySource = new Map(
    expected.map((resident) => [resident.sourceKey, resident.patch]),
  );
  for (const snapshot of state.coldShoreActiveResidents) {
    const bound = canonicalCoreEcologyColdShoreResidentPatch(snapshot.patch, {
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

export function serializeRegionalEcologyStateV4(value: unknown): string {
  const state = canonicalizeRegionalEcologyStateV4(value);
  if (state === null) {
    throw new TypeError("Regional ecology v4 state is malformed");
  }
  const text = stableStringify(state);
  if (
    UTF8_ENCODER.encode(text).byteLength
      > REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES
  ) {
    throw new RangeError(
      "Regional ecology v4 state exceeds the composite save budget",
    );
  }
  return text;
}

export function deserializeRegionalEcologyStateV4(
  text: unknown,
): RegionalEcologyStateV4 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength
      > REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES
  ) {
    return null;
  }
  try {
    const state = canonicalizeRegionalEcologyStateV4(
      JSON.parse(text) as unknown,
    );
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

/** Exact source patches participating in the one cross-owner hot projection. */
export function regionalEcologyStateV4ActiveSourcePatches(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  const state = canonicalizeRegionalEcologyStateV4(value);
  if (state === null) return null;
  const baseSources = regionalEcologyStateV3ActiveSourcePatches(state.base);
  if (baseSources === null) return null;
  return Object.freeze([
    ...baseSources.map(({ sourceKey, patch }) => Object.freeze({
      sourceKey,
      patch,
    })),
    ...state.coldShoreActiveResidents.map(({ sourceKey, patch }) => (
      Object.freeze({ sourceKey, patch })
    )),
  ].sort(compareResident));
}

/** One shared group-atomic top-K plan owns all retained and cold-shore sources. */
export function projectRegionalEcologyStateV4ActiveState(
  value: unknown,
  window: CoreEcologyRuntimeWindow,
): RegionalEcologyStateV4ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV4(value);
  if (state === null) return null;
  const sources = regionalEcologyStateV4ActiveSourcePatches(state);
  if (sources === null) return null;
  const materialized = setRegionalEcologyMaterializationForWindow(
    sources,
    window,
    state.updatedAtTick,
  );
  return materialized === null
    ? null
    : bindRegionalEcologyStateV4ActiveProjection(state, materialized);
}

export function bindRegionalEcologyStateV4ActiveProjection(
  value: unknown,
  materializedResidentsValue: unknown,
): RegionalEcologyStateV4ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV4(value);
  if (state === null || !Array.isArray(materializedResidentsValue)) return null;
  const baseSources = regionalEcologyStateV3ActiveSourcePatches(state.base);
  if (baseSources === null) return null;
  const baseKeys = new Set(baseSources.map(({ sourceKey }) => sourceKey));
  const coldKeys = new Set(
    state.coldShoreActiveResidents.map(({ sourceKey }) => sourceKey),
  );
  const baseResidents: RegionalEcologyResidentPatch[] = [];
  const coldResidents: RegionalEcologyResidentPatch[] = [];
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
    else if (coldKeys.has(raw.sourceKey)) coldResidents.push(resident);
    else return null;
    seen.add(raw.sourceKey);
  }
  if (seen.size !== baseKeys.size + coldKeys.size) return null;
  const base = bindRegionalEcologyStateV3ActiveProjection(
    state.base,
    baseResidents,
  );
  const cold = bindColdShoreProjection(state, coldResidents);
  if (base === null || cold === null) return null;
  const projectedPatches = [
    ...v3ProjectionPatches(base),
    ...cold.map(({ patch }) => patch),
  ];
  if (!projectedPatches.every(patchMaterializationIsGroupAtomic)) return null;
  const materializedActorCount = projectedPatches.reduce(
    (sum, patch) => sum + countMaterializedActors(patch),
    0,
  );
  if (materializedActorCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS) {
    return null;
  }
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V4_ACTIVE_PROJECTION_VERSION,
    ownerId: "game:regional-ecology-active-projection:v4" as const,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    coldShoreResidents: cold,
  };
  const projection = deepFreeze({
    ...projectionBase,
    integrity: hashCanonical(projectionBase),
  });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

/** All owners advance together, or this immutable composite returns no result. */
export function commitRegionalEcologyStateV4ActiveProjection(
  stateValue: unknown,
  projectionValue: unknown,
  input: CommitRegionalEcologyStateV4ActiveProjectionInput,
): RegionalEcologyStateV4 | null {
  const state = canonicalizeRegionalEcologyStateV4(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "coldShoreResidents"])
    || !plainRecord(input.base)
    || !Array.isArray(input.coldShoreResidents)
  ) {
    return null;
  }
  const projection = canonicalProjection(projectionValue, state);
  if (projection === null) return null;
  if (
    !projectedMaterializationPlanIsHonored(
      projection.coldShoreResidents,
      input.coldShoreResidents,
    )
  ) {
    return null;
  }
  let base: RegionalEcologyStateV3 | null;
  try {
    base = commitRegionalEcologyStateV3ActiveProjection(
      state.base,
      projection.base,
      input.base,
    );
  } catch {
    return null;
  }
  if (base === null || base.updatedAtTick < state.updatedAtTick) return null;
  const rootSeed = input.base.base.base.rootSeed;
  let coldShoreRoot: RegionalColdShoreEcologyRootV1;
  try {
    coldShoreRoot = advanceRegionalColdShoreEcologyRoot(
      state.coldShoreRoot,
      base.updatedAtTick,
    );
  } catch {
    return null;
  }
  const outputBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of input.coldShoreResidents) {
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
  if (outputBySource.size !== projection.coldShoreResidents.length) return null;
  const originalBySource = new Map(
    state.coldShoreActiveResidents.map((entry) => [entry.sourceKey, entry]),
  );
  for (const projected of projection.coldShoreResidents) {
    const original = originalBySource.get(projected.sourceKey);
    const output = outputBySource.get(projected.sourceKey);
    if (original === undefined || output === undefined) return null;
    const bound = canonicalCoreEcologyColdShoreResidentPatch(output, {
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
        coldShoreRoot = putRegionalColdShoreEcologyResidentDeviation(
          coldShoreRoot,
          { rootSeed, patch: normalized },
        );
      } catch {
        return null;
      }
    }
  }
  try {
    const coldShoreActiveResidents = requireColdShoreActiveResidents(
      coldShoreRoot,
      rootSeed,
      base,
    );
    return createRegionalEcologyStateV4({
      base,
      coldShoreRoot,
      coldShoreActiveResidents,
      adoption: state.adoption,
    });
  } catch {
    return null;
  }
}

/** Exchange the v3 hot neighborhood, then derive the cold-shore sibling from it. */
export function replaceRegionalEcologyStateV4ActiveState(
  stateValue: unknown,
  input: ReplaceRegionalEcologyStateV4ActiveStateInput,
): RegionalEcologyStateV4 {
  const state = canonicalizeRegionalEcologyStateV4(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "expectedIntegrity"])
    || input.expectedIntegrity !== state.integrity
  ) {
    throw new RangeError(
      "Regional ecology v4 active replacement is stale or malformed",
    );
  }
  let base: RegionalEcologyStateV3;
  try {
    base = replaceRegionalEcologyStateV3ActiveState(state.base, input.base);
  } catch {
    throw new RangeError(
      "Regional ecology v4 active replacement breaks v3 lineage",
    );
  }
  const rootSeed = input.base.base.base.rootSeed;
  const coldShoreRoot = state.coldShoreRoot;
  if (
    canonicalRegionalColdShoreEcologyRootForWorld(coldShoreRoot, {
      rootSeed,
      completedTick: base.updatedAtTick,
    }) === null
  ) {
    throw new RangeError(
      "Regional ecology v4 active replacement belongs to another world",
    );
  }
  const coldShoreActiveResidents = requireColdShoreActiveResidents(
    coldShoreRoot,
    rootSeed,
    base,
  );
  return createRegionalEcologyStateV4({
    base,
    coldShoreRoot,
    coldShoreActiveResidents,
    adoption: state.adoption,
  });
}

/** Composite diagnostic manifest across the exact v3 child and cold sibling. */
export function regionalEcologyStateV4SourceOwnership(
  value: unknown,
  activeOnly = false,
): readonly RegionalEcologyStateV4SourceOwnership[] | null {
  const state = canonicalizeRegionalEcologyStateV4(value);
  if (state === null) return null;
  const base = regionalEcologyStateV3SourceOwnership(state.base, activeOnly);
  if (base === null) return null;
  const coldBySource = new Map<string, CoreEcologyAggregatePatchState>();
  if (!activeOnly) {
    for (const delta of state.coldShoreRoot.regions) {
      coldBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
    }
  }
  for (const resident of state.coldShoreActiveResidents) {
    coldBySource.set(resident.sourceKey, resident.patch);
  }
  return Object.freeze([
    ...base.map((entry): RegionalEcologyStateV4SourceOwnership => (
      deepFreeze({ ...entry })
    )),
    ...[...coldBySource].map(
      ([sourceKey, patch]): RegionalEcologyStateV4SourceOwnership => (
        deepFreeze({
          ...sourceOwnership(sourceKey, patch, "regional-cold-shore"),
          layer: "cold-shore" as const,
        })
      ),
    ),
  ].sort((left, right) => compareText(left.sourceKey, right.sourceKey)));
}

function activeRegions(base: RegionalEcologyStateV3): readonly RegionCoord[] {
  return base.base.base.activeRegions;
}

function requireColdShoreActiveResidents(
  root: RegionalColdShoreEcologyRootV1,
  rootSeed: RootSeed,
  base: RegionalEcologyStateV3,
): readonly RegionalEcologyResidentPatch[] {
  const residents = regionalColdShoreEcologyResidentsForActiveRegions(
    root,
    rootSeed,
    activeRegions(base),
  );
  if (residents === null) {
    throw new RangeError(
      "Regional cold-shore ecology could not derive the active neighborhood",
    );
  }
  return Object.freeze(residents.map(({ sourceKey, patch }) => Object.freeze({
    sourceKey,
    patch,
  })));
}

function createColdShoreSnapshot(
  input: RegionalEcologyResidentPatch,
  tick: number,
): RegionalEcologyStateV4ColdShoreSnapshotV1 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["patch", "sourceKey"])
    || typeof input.sourceKey !== "string"
  ) {
    throw new TypeError("Regional ecology v4 cold-shore resident is malformed");
  }
  const patch = normalizeRegionalEcologyResidentPatchForStorage(
    input.patch,
    tick,
  );
  const derivation = patch?.derivation as unknown as Readonly<{
    readonly kind?: unknown;
  }> | undefined;
  if (
    patch === null
    || patch.patchKey !== input.sourceKey
    || derivation?.kind !== CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND
    || patch.populations.length !== 1
    || patch.populations[0]?.members.length !== 1
    || patch.groups.groups.length !== 0
    || patch.aggregatePopulations.length !== 0
    || patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
  ) {
    throw new RangeError(
      "Regional ecology v4 cold-shore resident is not a conserved solitary source",
    );
  }
  const base = {
    version: REGIONAL_ECOLOGY_STATE_V4_COLD_SHORE_SNAPSHOT_VERSION,
    kind: "regional-cold-shore" as const,
    sourceKey: input.sourceKey,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    patch,
  };
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

function canonicalColdShoreSnapshot(
  value: unknown,
  tick: number,
): RegionalEcologyStateV4ColdShoreSnapshotV1 | null {
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
    || value.version !== REGIONAL_ECOLOGY_STATE_V4_COLD_SHORE_SNAPSHOT_VERSION
    || value.kind !== "regional-cold-shore"
    || typeof value.sourceKey !== "string"
    || !validHash(value.patchHash)
    || !validHash(value.lineageHash)
    || !validHash(value.integrity)
  ) {
    return null;
  }
  try {
    const snapshot = createColdShoreSnapshot({
      sourceKey: value.sourceKey,
      patch: value.patch as CoreEcologyAggregatePatchState,
    }, tick);
    return stableStringify(snapshot) === stableStringify(value)
      ? snapshot
      : null;
  } catch {
    return null;
  }
}

function validColdShoreSources(
  base: RegionalEcologyStateV3,
  root: RegionalColdShoreEcologyRootV1,
  residents: readonly RegionalEcologyStateV4ColdShoreSnapshotV1[],
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
    const residence = coreEcologyColdShoreResidentPatchResidenceRegions(
      resident.patch,
    );
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
  base: RegionalEcologyStateV3,
  coldShoreRoot: RegionalColdShoreEcologyRootV1,
  coldShoreResidents: readonly RegionalEcologyStateV4ColdShoreSnapshotV1[],
): boolean {
  const baseIds = collectV3Ids(base);
  if (baseIds === null) return false;
  const coldBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const delta of coldShoreRoot.regions) {
    coldBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
  }
  for (const resident of coldShoreResidents) {
    coldBySource.set(resident.sourceKey, resident.patch);
  }
  const coldIds = new Set<string>();
  for (const [sourceKey, patch] of coldBySource) {
    if (baseIds.has(sourceKey) || coldIds.has(sourceKey)) return false;
    for (const id of patchIds(patch)) {
      if (baseIds.has(id) || coldIds.has(id)) return false;
      coldIds.add(id);
    }
  }
  return true;
}

function collectV3Ids(base: RegionalEcologyStateV3): Set<string> | null {
  const ownership = regionalEcologyStateV3SourceOwnership(base, false);
  if (ownership === null) return null;
  const ids = new Set<string>();
  for (const owner of ownership) addOwnershipIds(ids, owner);

  const v2 = base.base;
  const v1 = v2.base;
  addPatchIds(ids, v1.settlementHome.patch);
  for (const resident of v1.activeResidents) addPatchIds(ids, resident.patch);
  for (const delta of v1.root.regions) {
    if (delta.residentPatch !== null) addPatchIds(ids, delta.residentPatch);
    for (const placement of delta.legacyPlacements) {
      ids.add(placement.baselineActorId);
      ids.add(placement.baselinePopulationId);
      ids.add(placement.legacyActorId);
    }
    for (const placement of delta.legacyAggregatePlacements) {
      ids.add(placement.baselinePopulationId);
      ids.add(placement.legacyAggregateId);
    }
  }
  if (v1.root.legacyCohort !== null) {
    addPatchIds(ids, v1.root.legacyCohort.sourcePatch);
    for (const retirement of v1.root.legacyCohort.retirements) {
      ids.add(retirement.actorId);
    }
    for (const retirement of v1.root.legacyCohort.aggregateRetirements) {
      ids.add(retirement.aggregateId);
    }
  }
  for (const delta of v2.alpineRoot.regions) {
    addPatchIds(ids, delta.residentPatch);
  }
  for (const resident of v2.alpineActiveResidents) {
    addPatchIds(ids, resident.patch);
  }
  for (const delta of base.polarShoreRoot.regions) {
    addPatchIds(ids, delta.residentPatch);
  }
  for (const resident of base.polarShoreActiveResidents) {
    addPatchIds(ids, resident.patch);
  }
  return ids;
}

function bindColdShoreProjection(
  state: RegionalEcologyStateV4,
  residentsValue: readonly RegionalEcologyResidentPatch[],
): readonly RegionalEcologyStateV4ProjectedColdShoreResidentV1[] | null {
  if (residentsValue.length !== state.coldShoreActiveResidents.length) {
    return null;
  }
  const sourceByKey = new Map(
    state.coldShoreActiveResidents.map((source) => [source.sourceKey, source]),
  );
  const output: RegionalEcologyStateV4ProjectedColdShoreResidentV1[] = [];
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
      kind: "regional-cold-shore" as const,
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
  state: RegionalEcologyStateV4,
): RegionalEcologyStateV4ActiveProjection | null {
  if (
    typeof value === "object"
    && value !== null
    && TRUSTED_PROJECTIONS.has(value)
  ) {
    const projection = value as RegionalEcologyStateV4ActiveProjection;
    return projection.stateIntegrity === state.integrity ? projection : null;
  }
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "atTick",
      "base",
      "coldShoreResidents",
      "integrity",
      "ownerId",
      "stateIntegrity",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V4_ACTIVE_PROJECTION_VERSION
    || value.ownerId !== "game:regional-ecology-active-projection:v4"
    || value.stateIntegrity !== state.integrity
    || value.atTick !== state.updatedAtTick
    || !Array.isArray(value.coldShoreResidents)
    || !validHash(value.integrity)
  ) {
    return null;
  }
  const baseInputs = v3ProjectionResidentInputs(value.base);
  const coldInputs = projectionResidentInputs(value.coldShoreResidents);
  if (baseInputs === null || coldInputs === null) return null;
  const base = bindRegionalEcologyStateV3ActiveProjection(
    state.base,
    baseInputs,
  );
  const cold = bindColdShoreProjection(state, coldInputs);
  const projectedPatches = base === null || cold === null
    ? []
    : [...v3ProjectionPatches(base), ...cold.map(({ patch }) => patch)];
  if (
    base === null
    || cold === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(cold) !== stableStringify(value.coldShoreResidents)
    || !projectedPatches.every(patchMaterializationIsGroupAtomic)
    || projectedPatches.reduce(
      (sum, patch) => sum + countMaterializedActors(patch),
      0,
    ) > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) {
    return null;
  }
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V4_ACTIVE_PROJECTION_VERSION,
    ownerId: "game:regional-ecology-active-projection:v4" as const,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    coldShoreResidents: cold,
  };
  if (hashCanonical(projectionBase) !== value.integrity) return null;
  const projection = deepFreeze({
    ...projectionBase,
    integrity: value.integrity,
  });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

function canonicalAdoption(
  value: unknown,
  base: RegionalEcologyStateV3,
  coldShoreRoot: RegionalColdShoreEcologyRootV1,
): RegionalEcologyStateV4AdoptionReceiptV1 | null {
  if (value === null) return null;
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "integrity",
      "policyId",
      "resultColdShoreRootIntegrity",
      "sourceCompletedTick",
      "sourceEnvelopeIntegrity",
      "sourceOuterVersion",
      "sourceStateHash",
      "sourceStateIntegrity",
      "sourceV3LineageHash",
      "status",
      "transactionId",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V4_ADOPTION_VERSION
    || value.status !== "committed"
    || value.policyId !== REGIONAL_ECOLOGY_STATE_V4_ADOPTION_POLICY_ID
    || typeof value.transactionId !== "string"
    || !TRANSACTION_PATTERN.test(value.transactionId)
    || value.sourceOuterVersion !== 27
    || !validHash(value.sourceEnvelopeIntegrity)
    || !validHash(value.sourceStateIntegrity)
    || !validHash(value.sourceStateHash)
    || !validHash(value.sourceV3LineageHash)
    || !nonnegativeSafeInteger(value.sourceCompletedTick)
    || !validHash(value.resultColdShoreRootIntegrity)
    || !validHash(value.integrity)
    || value.sourceCompletedTick > base.updatedAtTick
    || value.sourceV3LineageHash !== regionalEcologyV3LineageHash(base)
    || value.resultColdShoreRootIntegrity
      !== pristineColdShoreRootIntegrity(
        coldShoreRoot,
        value.sourceCompletedTick,
      )
  ) {
    return null;
  }
  const expectedTransactionId = `regional-ecology-v27-wrapper:${hashCanonical({
    policyId: REGIONAL_ECOLOGY_STATE_V4_ADOPTION_POLICY_ID,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceV3LineageHash: value.sourceV3LineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultColdShoreRootIntegrity: value.resultColdShoreRootIntegrity,
  })}`;
  if (value.transactionId !== expectedTransactionId) return null;
  const receiptBase = {
    version: REGIONAL_ECOLOGY_STATE_V4_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V4_ADOPTION_POLICY_ID,
    transactionId: value.transactionId,
    sourceOuterVersion: 27 as const,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceV3LineageHash: value.sourceV3LineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultColdShoreRootIntegrity: value.resultColdShoreRootIntegrity,
  };
  return hashCanonical(receiptBase) === value.integrity
    ? deepFreeze({ ...receiptBase, integrity: value.integrity })
    : null;
}

/** The receipt binds pristine cold-shore identity, not the sibling's later clock. */
function pristineColdShoreRootIntegrity(
  root: RegionalColdShoreEcologyRootV1,
  migrationTick: number,
): string {
  return hashCanonical({
    version: root.version,
    ownerId: REGIONAL_COLD_SHORE_ECOLOGY_OWNER_ID,
    generationVersion: root.generationVersion,
    baselinePolicyId: root.baselinePolicyId,
    seedFingerprint: root.seedFingerprint,
    updatedAtTick: migrationTick,
    revision: 0,
    lastEventOrdinal: 0,
    regions: Object.freeze([]),
  });
}

/** Immutable v3 custody lineage retained across clocks and hot-window exchange. */
function regionalEcologyV3LineageHash(base: RegionalEcologyStateV3): string {
  const v2 = base.base;
  const v1 = v2.base;
  return hashCanonical({
    version: base.version,
    ownerId: base.ownerId,
    adoptionTransactionId: base.adoption?.transactionId ?? null,
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
          legacySourcePatchHash:
            v1.root.legacyCohort?.sourcePatchHash ?? null,
        },
        settlementHome: {
          sourceKey: v1.settlementHome.sourceKey,
          region: v1.settlementHome.region,
          lineageHash: v1.settlementHome.lineageHash,
        },
      },
      alpine: {
        version: v2.alpineRoot.version,
        ownerId: v2.alpineRoot.ownerId,
        generationVersion: v2.alpineRoot.generationVersion,
        baselinePolicyId: v2.alpineRoot.baselinePolicyId,
        seedFingerprint: v2.alpineRoot.seedFingerprint,
      },
    },
    polarShore: {
      version: base.polarShoreRoot.version,
      ownerId: base.polarShoreRoot.ownerId,
      generationVersion: base.polarShoreRoot.generationVersion,
      baselinePolicyId: base.polarShoreRoot.baselinePolicyId,
      seedFingerprint: base.polarShoreRoot.seedFingerprint,
    },
  });
}

function sourceOwnership(
  sourceKey: string,
  patch: CoreEcologyAggregatePatchState,
  kind: RegionalEcologyStateV4SourceOwnership["kind"],
): Omit<RegionalEcologyStateV4SourceOwnership, "layer"> {
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
    groupIds: patch.groups.groups
      .map(({ identity }) => identity.stableId)
      .sort(compareText),
    aggregateIds: patch.aggregatePopulations
      .map(({ aggregateId }) => aggregateId)
      .sort(compareText),
    mortalityIds: patch.mortalityTransactions
      .map(({ mortalityId }) => mortalityId)
      .sort(compareText),
    bodyIds: patch.carcasses.map(({ carcassId }) => carcassId).sort(compareText),
  });
}

function v3ProjectionResidentInputs(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  if (
    !plainRecord(value)
    || !plainRecord(value.base)
    || !plainRecord(value.base.base)
    || !Array.isArray(value.base.base.residents)
    || !Array.isArray(value.base.alpineResidents)
    || !Array.isArray(value.polarShoreResidents)
  ) {
    return null;
  }
  const base = projectionResidentInputs(value.base.base.residents);
  const alpine = projectionResidentInputs(value.base.alpineResidents);
  const polar = projectionResidentInputs(value.polarShoreResidents);
  return base === null || alpine === null || polar === null
    ? null
    : Object.freeze([...base, ...alpine, ...polar]);
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
    populations: patch.populations.map(({
      species,
      populationKey,
      baselinePopulationSize,
    }) => ({ species, populationKey, baselinePopulationSize })),
    actorIds: [...livingActorIds, ...retiredActorIds].sort(compareText),
    groupIds: patch.groups.groups
      .map(({ identity }) => identity.stableId)
      .sort(compareText),
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
    ...patch.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    )),
    ...patch.mortalityTransactions.map(({ retiredActor }) => (
      retiredActor.identity.stableId
    )),
    ...patch.groups.groups.map(({ identity }) => identity.stableId),
    ...patch.aggregatePopulations.map(({ aggregateId }) => aggregateId),
    ...patch.mortalityTransactions.flatMap(({ mortalityId, event }) => (
      [mortalityId, event.eventId]
    )),
    ...patch.carcasses.map(({ carcassId }) => carcassId),
  ];
}

function qualifiedPopulationKey(species: string, populationKey: string): string {
  return `${species.length}:${species}:${populationKey}`;
}

function addPatchIds(
  target: Set<string>,
  patch: CoreEcologyAggregatePatchState,
): void {
  for (const id of patchIds(patch)) target.add(id);
}

function addOwnershipIds(
  target: Set<string>,
  ownership: RegionalEcologyStateV3SourceOwnership,
): void {
  target.add(ownership.sourceKey);
  for (const values of [
    ownership.populationKeys,
    ownership.actorIds,
    ownership.groupIds,
    ownership.aggregateIds,
    ownership.mortalityIds,
    ownership.bodyIds,
  ]) {
    for (const id of values) target.add(id);
  }
}

function materializedActorIds(
  patch: CoreEcologyAggregatePatchState,
): readonly string[] {
  return patch.populations.flatMap(({ members }) => members
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actor.identity.stableId));
}

function countMaterializedActors(patch: CoreEcologyAggregatePatchState): number {
  return materializedActorIds(patch).length;
}

function v3ProjectionPatches(
  projection: RegionalEcologyStateV3ActiveProjection,
): readonly CoreEcologyAggregatePatchState[] {
  return [
    ...projection.base.base.residents.map(({ patch }) => patch),
    ...projection.base.alpineResidents.map(({ patch }) => patch),
    ...projection.polarShoreResidents.map(({ patch }) => patch),
  ];
}

/** The transient global plan owns exactly which cold-shore actor participates. */
function projectedMaterializationPlanIsHonored(
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
      || output.nextMortalityOrdinal !== source.patch.nextMortalityOrdinal
      || output.mortalityTransactions.length
        !== source.patch.mortalityTransactions.length
      || output.carcasses.length !== source.patch.carcasses.length
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
  value: Omit<RegionalEcologyStateV4, "integrity">,
): RegionalEcologyStateV4 {
  const state = deepFreeze({ ...value, integrity: hashCanonical(value) });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES) {
    throw new RangeError(
      "Regional ecology v4 state exceeds the composite save budget",
    );
  }
  TRUSTED_STATES.add(state);
  return state;
}

function copyRegion(region: RegionCoord): RegionCoord {
  return createRegionCoord(region.x, region.y);
}

function compareSnapshot(
  left: Pick<RegionalEcologyStateV4ColdShoreSnapshotV1, "sourceKey">,
  right: Pick<RegionalEcologyStateV4ColdShoreSnapshotV1, "sourceKey">,
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
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && !Object.is(value, -0);
}

function serializedBytes(value: unknown): number {
  return UTF8_ENCODER.encode(stableStringify(value)).byteLength;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
