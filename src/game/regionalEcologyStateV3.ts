import type { RootSeed } from "../sim/rng";
import { createRegionCoord, regionKey, type RegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND } from "./coreEcologyPolarShoreHabitat";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import {
  REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV2ActiveProjection,
  canonicalRegionalEcologyStateV2ForWorld,
  canonicalizeRegionalEcologyStateV2,
  commitRegionalEcologyStateV2ActiveProjection,
  regionalEcologyStateV2ActiveSourcePatches,
  regionalEcologyStateV2SourceOwnership,
  replaceRegionalEcologyStateV2ActiveState,
  type CommitRegionalEcologyStateV2ActiveProjectionInput,
  type RegionalEcologyStateV2,
  type RegionalEcologyStateV2ActiveProjection,
  type RegionalEcologyStateV2SourceOwnership,
  type RegionalEcologyStateV2WorldBinding,
  type ReplaceRegionalEcologyStateV2ActiveStateInput,
} from "./regionalEcologyStateV2";
import {
  REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID,
  advanceRegionalPolarShoreEcologyRoot,
  canonicalRegionalPolarShoreEcologyRootForWorld,
  canonicalizeRegionalPolarShoreEcologyRoot,
  createPristineRegionalPolarShoreEcologyRoot,
  putRegionalPolarShoreEcologyResidentDeviation,
  regionalPolarShoreEcologyResidentsForActiveRegions,
  type RegionalPolarShoreEcologyRootV1,
} from "./regionalPolarShoreEcology";
import {
  canonicalCoreEcologyPolarShoreResidentPatch,
  coreEcologyPolarShoreResidentPatchResidenceRegions,
} from "./regionalPolarShoreResidents";
import {
  setRegionalEcologyMaterializationForWindow,
  type RegionalEcologyResidentPatch,
} from "./regionalEcologyRuntime";

export const REGIONAL_ECOLOGY_STATE_V3_VERSION = 3 as const;
export const REGIONAL_ECOLOGY_STATE_V3_OWNER_ID =
  "game:regional-ecology-state:v3" as const;
export const REGIONAL_ECOLOGY_STATE_V3_POLAR_SHORE_SNAPSHOT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V3_ADOPTION_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V3_ADOPTION_POLICY_ID =
  "regional-ecology-v26-wrapper:v1" as const;
export const REGIONAL_ECOLOGY_STATE_V3_ACTIVE_PROJECTION_VERSION = 3 as const;
/** Exact v2 child, polar root, and bounded hot-snapshot/migration headroom. */
export const REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES =
  REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES
  + REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES
  + 28 * 1_024 * 1_024;

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const TRANSACTION_PATTERN = /^regional-ecology-v26-wrapper:[0-9a-f]{16}$/u;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_STATES = new WeakSet<object>();
const TRUSTED_PROJECTIONS = new WeakSet<object>();

export interface RegionalEcologyStateV3AdoptionReceiptV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V3_ADOPTION_VERSION;
  readonly status: "committed";
  readonly policyId: typeof REGIONAL_ECOLOGY_STATE_V3_ADOPTION_POLICY_ID;
  readonly transactionId: string;
  readonly sourceOuterVersion: 26;
  readonly sourceEnvelopeIntegrity: string;
  readonly sourceStateIntegrity: string;
  readonly sourceStateHash: string;
  readonly sourceV2LineageHash: string;
  readonly sourceCompletedTick: number;
  readonly resultPolarShoreRootIntegrity: string;
  readonly integrity: string;
}

/** Authenticated non-addressable hot snapshot owned only by the polar sibling. */
export interface RegionalEcologyStateV3PolarShoreSnapshotV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V3_POLAR_SHORE_SNAPSHOT_VERSION;
  readonly kind: "regional-polar-shore";
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly integrity: string;
}

export interface RegionalEcologyStateV3 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V3_VERSION;
  readonly ownerId: typeof REGIONAL_ECOLOGY_STATE_V3_OWNER_ID;
  readonly updatedAtTick: number;
  /** Exact authenticated outer-v26 ecology child. */
  readonly base: RegionalEcologyStateV2;
  /** Append-only polar-shore sibling authority. */
  readonly polarShoreRoot: RegionalPolarShoreEcologyRootV1;
  /** Hot polar snapshots use base.base.activeRegions; there is no second window. */
  readonly polarShoreActiveResidents: readonly RegionalEcologyStateV3PolarShoreSnapshotV1[];
  /** Migration provenance from v26; null for a fresh v27 world. */
  readonly adoption: RegionalEcologyStateV3AdoptionReceiptV1 | null;
  readonly integrity: string;
}

export type RegionalEcologyStateV3WorldBinding = RegionalEcologyStateV2WorldBinding;

export interface CreateRegionalEcologyStateV3Input {
  readonly base: RegionalEcologyStateV2;
  readonly polarShoreRoot: RegionalPolarShoreEcologyRootV1;
  readonly polarShoreActiveResidents: readonly RegionalEcologyResidentPatch[];
  readonly adoption: RegionalEcologyStateV3AdoptionReceiptV1 | null;
}

export interface MigrateRegionalEcologyStateV2ToV3Input {
  readonly rootSeed: RootSeed;
  readonly sourceEnvelopeIntegrity: string;
}

export interface RegionalEcologyStateV3ProjectedPolarShoreResidentV1 {
  readonly kind: "regional-polar-shore";
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly sourcePatchHash: string;
  readonly projectedPatchHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalEcologyStateV3ActiveProjection {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V3_ACTIVE_PROJECTION_VERSION;
  readonly ownerId: "game:regional-ecology-active-projection:v3";
  readonly stateIntegrity: string;
  readonly atTick: number;
  readonly base: RegionalEcologyStateV2ActiveProjection;
  readonly polarShoreResidents: readonly RegionalEcologyStateV3ProjectedPolarShoreResidentV1[];
  readonly integrity: string;
}

export interface CommitRegionalEcologyStateV3ActiveProjectionInput {
  readonly base: CommitRegionalEcologyStateV2ActiveProjectionInput;
  readonly polarShoreResidents: readonly RegionalEcologyResidentPatch[];
}

export interface ReplaceRegionalEcologyStateV3ActiveStateInput {
  readonly expectedIntegrity: string;
  /** Raw v2 exchange input; this owner executes and authenticates the child transaction. */
  readonly base: ReplaceRegionalEcologyStateV2ActiveStateInput;
}

export interface RegionalEcologyStateV3SourceOwnership
  extends Omit<RegionalEcologyStateV2SourceOwnership, "kind" | "layer"> {
  readonly layer: "base" | "alpine" | "polar-shore";
  readonly kind: RegionalEcologyStateV2SourceOwnership["kind"] | "regional-polar-shore";
}

/** Construct one strict composite without rewriting either canonical child. */
export function createRegionalEcologyStateV3(
  input: CreateRegionalEcologyStateV3Input,
): RegionalEcologyStateV3 {
  if (!plainRecord(input) || !exactKeys(input, [
    "adoption",
    "base",
    "polarShoreActiveResidents",
    "polarShoreRoot",
  ]) || !Array.isArray(input.polarShoreActiveResidents)) {
    throw new TypeError("Regional ecology v3 input is malformed");
  }
  const base = canonicalizeRegionalEcologyStateV2(input.base);
  const polarShoreRoot = canonicalizeRegionalPolarShoreEcologyRoot(input.polarShoreRoot);
  if (
    base === null
    || polarShoreRoot === null
    || stableStringify(base) !== stableStringify(input.base)
    || stableStringify(polarShoreRoot) !== stableStringify(input.polarShoreRoot)
    || polarShoreRoot.updatedAtTick !== base.updatedAtTick
    || polarShoreRoot.seedFingerprint !== base.alpineRoot.seedFingerprint
  ) throw new RangeError("Regional ecology v3 children are not canonical at one clock");
  const polarShoreActiveResidents = input.polarShoreActiveResidents.map((resident) => (
    createPolarShoreSnapshot(resident, base.updatedAtTick)
  )).sort(compareSnapshot);
  const adoption = canonicalAdoption(input.adoption, base, polarShoreRoot);
  if (input.adoption !== null && adoption === null) {
    throw new RangeError("Regional ecology v3 adoption receipt is malformed");
  }
  if (!validPolarShoreSources(base, polarShoreRoot, polarShoreActiveResidents)) {
    throw new RangeError("Regional ecology v3 polar sources overlap or escape the hot window");
  }
  if (!validCrossLayerOwnership(base, polarShoreRoot, polarShoreActiveResidents)) {
    throw new RangeError("Regional ecology v3 child ownership overlaps");
  }
  return sealState({
    version: REGIONAL_ECOLOGY_STATE_V3_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V3_OWNER_ID,
    updatedAtTick: base.updatedAtTick,
    base,
    polarShoreRoot,
    polarShoreActiveResidents: Object.freeze(polarShoreActiveResidents),
    adoption,
  });
}

/** Fresh outer-v27 worlds have no migration receipt. */
export function createFreshRegionalEcologyStateV3(
  baseValue: unknown,
  rootSeed: RootSeed,
): RegionalEcologyStateV3 {
  const base = canonicalizeRegionalEcologyStateV2(baseValue);
  if (base === null) throw new TypeError("Fresh regional ecology v3 requires one v2 base");
  const polarShoreRoot = createPristineRegionalPolarShoreEcologyRoot({
    rootSeed,
    completedTick: base.updatedAtTick,
  });
  const polarShoreActiveResidents = requirePolarShoreActiveResidents(
    polarShoreRoot,
    rootSeed,
    base,
  );
  return createRegionalEcologyStateV3({
    base,
    polarShoreRoot,
    polarShoreActiveResidents,
    adoption: null,
  });
}

/** Exact-once append-only wrapping of an authenticated outer-v26 child. */
export function migrateRegionalEcologyStateV2ToV3(
  baseValue: unknown,
  input: MigrateRegionalEcologyStateV2ToV3Input,
): RegionalEcologyStateV3 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["rootSeed", "sourceEnvelopeIntegrity"])
    || !validHash(input.sourceEnvelopeIntegrity)
  ) throw new TypeError("Regional ecology v26 migration input is malformed");
  const base = canonicalizeRegionalEcologyStateV2(baseValue);
  if (base === null || stableStringify(base) !== stableStringify(baseValue)) {
    throw new TypeError("Regional ecology v26 migration requires an exact v2 child");
  }
  const polarShoreRoot = createPristineRegionalPolarShoreEcologyRoot({
    rootSeed: input.rootSeed,
    completedTick: base.updatedAtTick,
  });
  const receiptBase = {
    version: REGIONAL_ECOLOGY_STATE_V3_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V3_ADOPTION_POLICY_ID,
    transactionId: `regional-ecology-v26-wrapper:${hashCanonical({
      policyId: REGIONAL_ECOLOGY_STATE_V3_ADOPTION_POLICY_ID,
      sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
      sourceStateIntegrity: base.integrity,
      sourceStateHash: hashCanonical(base),
      sourceV2LineageHash: regionalEcologyV2LineageHash(base),
      sourceCompletedTick: base.updatedAtTick,
      resultPolarShoreRootIntegrity: polarShoreRoot.integrity,
    })}`,
    sourceOuterVersion: 26 as const,
    sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
    sourceStateIntegrity: base.integrity,
    sourceStateHash: hashCanonical(base),
    sourceV2LineageHash: regionalEcologyV2LineageHash(base),
    sourceCompletedTick: base.updatedAtTick,
    resultPolarShoreRootIntegrity: polarShoreRoot.integrity,
  };
  const adoption = deepFreeze({ ...receiptBase, integrity: hashCanonical(receiptBase) });
  const polarShoreActiveResidents = requirePolarShoreActiveResidents(
    polarShoreRoot,
    input.rootSeed,
    base,
  );
  return createRegionalEcologyStateV3({
    base,
    polarShoreRoot,
    polarShoreActiveResidents,
    adoption,
  });
}

export function canonicalizeRegionalEcologyStateV3(
  value: unknown,
): RegionalEcologyStateV3 | null {
  if (typeof value === "object" && value !== null && TRUSTED_STATES.has(value)) {
    return value as RegionalEcologyStateV3;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "adoption",
    "base",
    "integrity",
    "ownerId",
    "polarShoreActiveResidents",
    "polarShoreRoot",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_STATE_V3_VERSION
    || value.ownerId !== REGIONAL_ECOLOGY_STATE_V3_OWNER_ID
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.polarShoreActiveResidents)
    || !validHash(value.integrity)
  ) return null;
  const base = canonicalizeRegionalEcologyStateV2(value.base);
  const polarShoreRoot = canonicalizeRegionalPolarShoreEcologyRoot(value.polarShoreRoot);
  if (
    base === null
    || polarShoreRoot === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(polarShoreRoot) !== stableStringify(value.polarShoreRoot)
    || base.updatedAtTick !== value.updatedAtTick
    || polarShoreRoot.updatedAtTick !== value.updatedAtTick
    || polarShoreRoot.seedFingerprint !== base.alpineRoot.seedFingerprint
  ) return null;
  const polarShoreActiveResidents: RegionalEcologyStateV3PolarShoreSnapshotV1[] = [];
  for (const raw of value.polarShoreActiveResidents) {
    const snapshot = canonicalPolarShoreSnapshot(raw, value.updatedAtTick);
    if (snapshot === null) return null;
    polarShoreActiveResidents.push(snapshot);
  }
  polarShoreActiveResidents.sort(compareSnapshot);
  if (
    stableStringify(polarShoreActiveResidents) !== stableStringify(value.polarShoreActiveResidents)
    || !validPolarShoreSources(base, polarShoreRoot, polarShoreActiveResidents)
    || !validCrossLayerOwnership(base, polarShoreRoot, polarShoreActiveResidents)
  ) return null;
  const adoption = canonicalAdoption(value.adoption, base, polarShoreRoot);
  if (value.adoption !== null && adoption === null) return null;
  const stateBase = {
    version: REGIONAL_ECOLOGY_STATE_V3_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V3_OWNER_ID,
    updatedAtTick: value.updatedAtTick,
    base,
    polarShoreRoot,
    polarShoreActiveResidents: Object.freeze(polarShoreActiveResidents),
    adoption,
  };
  if (hashCanonical(stateBase) !== value.integrity) return null;
  const state = deepFreeze({ ...stateBase, integrity: value.integrity });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES) return null;
  TRUSTED_STATES.add(state);
  return state;
}

/** World/seed trust boundary for the exact v2 child, polar root, and hot snapshots. */
export function canonicalRegionalEcologyStateV3ForWorld(
  value: unknown,
  binding: RegionalEcologyStateV3WorldBinding,
): RegionalEcologyStateV3 | null {
  if (!plainRecord(binding) || !nonnegativeSafeInteger(binding.completedTick)) return null;
  const state = canonicalizeRegionalEcologyStateV3(value);
  if (state === null || state.updatedAtTick !== binding.completedTick) return null;
  if (canonicalRegionalEcologyStateV2ForWorld(state.base, binding) === null) return null;
  const polarShoreRoot = canonicalRegionalPolarShoreEcologyRootForWorld(
    state.polarShoreRoot,
    binding,
  );
  if (polarShoreRoot === null) return null;
  const expected = regionalPolarShoreEcologyResidentsForActiveRegions(
    polarShoreRoot,
    binding.rootSeed,
    state.base.base.activeRegions,
  );
  if (expected === null || expected.length !== state.polarShoreActiveResidents.length) return null;
  const expectedBySource = new Map(expected.map((resident) => [resident.sourceKey, resident.patch]));
  for (const snapshot of state.polarShoreActiveResidents) {
    const bound = canonicalCoreEcologyPolarShoreResidentPatch(snapshot.patch, {
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

export function serializeRegionalEcologyStateV3(value: unknown): string {
  const state = canonicalizeRegionalEcologyStateV3(value);
  if (state === null) throw new TypeError("Regional ecology v3 state is malformed");
  const text = stableStringify(state);
  if (UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology v3 state exceeds the composite save budget");
  }
  return text;
}

export function deserializeRegionalEcologyStateV3(text: unknown): RegionalEcologyStateV3 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeRegionalEcologyStateV3(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

/** Exact source patches participating in the one cross-owner hot projection. */
export function regionalEcologyStateV3ActiveSourcePatches(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  const state = canonicalizeRegionalEcologyStateV3(value);
  if (state === null) return null;
  const baseSources = regionalEcologyStateV2ActiveSourcePatches(state.base);
  if (baseSources === null) return null;
  return Object.freeze([
    ...baseSources.map(({ sourceKey, patch }) => Object.freeze({ sourceKey, patch })),
    ...state.polarShoreActiveResidents.map(({ sourceKey, patch }) => (
      Object.freeze({ sourceKey, patch })
    )),
  ].sort(compareResident));
}

/** One shared group-atomic top-K plan owns all v2 and polar active sources. */
export function projectRegionalEcologyStateV3ActiveState(
  value: unknown,
  window: CoreEcologyRuntimeWindow,
): RegionalEcologyStateV3ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV3(value);
  if (state === null) return null;
  const sources = regionalEcologyStateV3ActiveSourcePatches(state);
  if (sources === null) return null;
  const materialized = setRegionalEcologyMaterializationForWindow(
    sources,
    window,
    state.updatedAtTick,
  );
  return materialized === null
    ? null
    : bindRegionalEcologyStateV3ActiveProjection(state, materialized);
}

export function bindRegionalEcologyStateV3ActiveProjection(
  value: unknown,
  materializedResidentsValue: unknown,
): RegionalEcologyStateV3ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV3(value);
  if (state === null || !Array.isArray(materializedResidentsValue)) return null;
  const baseSources = regionalEcologyStateV2ActiveSourcePatches(state.base);
  if (baseSources === null) return null;
  const baseKeys = new Set(baseSources.map(({ sourceKey }) => sourceKey));
  const polarKeys = new Set(state.polarShoreActiveResidents.map(({ sourceKey }) => sourceKey));
  const baseResidents: RegionalEcologyResidentPatch[] = [];
  const polarResidents: RegionalEcologyResidentPatch[] = [];
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
    else if (polarKeys.has(raw.sourceKey)) polarResidents.push(resident);
    else return null;
    seen.add(raw.sourceKey);
  }
  if (seen.size !== baseKeys.size + polarKeys.size) return null;
  const base = bindRegionalEcologyStateV2ActiveProjection(state.base, baseResidents);
  const polar = bindPolarShoreProjection(state, polarResidents);
  if (base === null || polar === null) return null;
  const projectedPatches = [
    ...v2ProjectionPatches(base),
    ...polar.map(({ patch }) => patch),
  ];
  if (!projectedPatches.every(patchMaterializationIsGroupAtomic)) return null;
  const materializedActorCount = projectedPatches.reduce(
    (sum, patch) => sum + countMaterializedActors(patch),
    0,
  );
  if (materializedActorCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS) return null;
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V3_ACTIVE_PROJECTION_VERSION,
    ownerId: "game:regional-ecology-active-projection:v3" as const,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    polarShoreResidents: polar,
  };
  const projection = deepFreeze({ ...projectionBase, integrity: hashCanonical(projectionBase) });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

/** All owners advance together, or this immutable composite returns no result. */
export function commitRegionalEcologyStateV3ActiveProjection(
  stateValue: unknown,
  projectionValue: unknown,
  input: CommitRegionalEcologyStateV3ActiveProjectionInput,
): RegionalEcologyStateV3 | null {
  const state = canonicalizeRegionalEcologyStateV3(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "polarShoreResidents"])
    || !plainRecord(input.base)
    || !Array.isArray(input.polarShoreResidents)
  ) return null;
  const projection = canonicalProjection(projectionValue, state);
  if (projection === null) return null;
  if (!projectedMaterializationPlanIsHonored(
    projection.polarShoreResidents,
    input.polarShoreResidents,
  )) return null;
  let base: RegionalEcologyStateV2 | null;
  try {
    base = commitRegionalEcologyStateV2ActiveProjection(
      state.base,
      projection.base,
      input.base,
    );
  } catch {
    return null;
  }
  if (base === null || base.updatedAtTick < state.updatedAtTick) return null;
  const rootSeed = input.base.base.rootSeed;
  let polarShoreRoot: RegionalPolarShoreEcologyRootV1;
  try {
    polarShoreRoot = advanceRegionalPolarShoreEcologyRoot(
      state.polarShoreRoot,
      base.updatedAtTick,
    );
  } catch {
    return null;
  }
  const outputBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of input.polarShoreResidents) {
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
  if (outputBySource.size !== projection.polarShoreResidents.length) return null;
  const originalBySource = new Map(state.polarShoreActiveResidents.map((entry) => [
    entry.sourceKey,
    entry,
  ]));
  for (const projected of projection.polarShoreResidents) {
    const original = originalBySource.get(projected.sourceKey);
    const output = outputBySource.get(projected.sourceKey);
    if (original === undefined || output === undefined) return null;
    const bound = canonicalCoreEcologyPolarShoreResidentPatch(output, {
      seed: rootSeed,
      region: original.region,
      completedTick: base.updatedAtTick,
    });
    if (
      bound === null
      || sourceLineageHash(bound) !== original.lineageHash
      || !patchMaterializationIsGroupAtomic(bound)
    ) return null;
    try {
      polarShoreRoot = putRegionalPolarShoreEcologyResidentDeviation(
        polarShoreRoot,
        { rootSeed, patch: bound },
      );
    } catch {
      return null;
    }
  }
  try {
    const polarShoreActiveResidents = requirePolarShoreActiveResidents(
      polarShoreRoot,
      rootSeed,
      base,
    );
    return createRegionalEcologyStateV3({
      base,
      polarShoreRoot,
      polarShoreActiveResidents,
      adoption: state.adoption,
    });
  } catch {
    return null;
  }
}

/** Exchange the v2 hot neighborhood, then derive the polar sibling from it. */
export function replaceRegionalEcologyStateV3ActiveState(
  stateValue: unknown,
  input: ReplaceRegionalEcologyStateV3ActiveStateInput,
): RegionalEcologyStateV3 {
  const state = canonicalizeRegionalEcologyStateV3(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "expectedIntegrity"])
    || input.expectedIntegrity !== state.integrity
  ) throw new RangeError("Regional ecology v3 active replacement is stale or malformed");
  let base: RegionalEcologyStateV2;
  try {
    base = replaceRegionalEcologyStateV2ActiveState(state.base, input.base);
  } catch {
    throw new RangeError("Regional ecology v3 active replacement breaks v2 lineage");
  }
  const rootSeed = input.base.base.rootSeed;
  const polarShoreRoot = state.polarShoreRoot;
  if (canonicalRegionalPolarShoreEcologyRootForWorld(polarShoreRoot, {
    rootSeed,
    completedTick: base.updatedAtTick,
  }) === null) throw new RangeError("Regional ecology v3 active replacement belongs to another world");
  const polarShoreActiveResidents = requirePolarShoreActiveResidents(
    polarShoreRoot,
    rootSeed,
    base,
  );
  return createRegionalEcologyStateV3({
    base,
    polarShoreRoot,
    polarShoreActiveResidents,
    adoption: state.adoption,
  });
}

/** Composite diagnostic manifest across the exact v2 child and polar sibling. */
export function regionalEcologyStateV3SourceOwnership(
  value: unknown,
  activeOnly = false,
): readonly RegionalEcologyStateV3SourceOwnership[] | null {
  const state = canonicalizeRegionalEcologyStateV3(value);
  if (state === null) return null;
  const base = regionalEcologyStateV2SourceOwnership(state.base, activeOnly);
  if (base === null) return null;
  const polarBySource = new Map<string, CoreEcologyAggregatePatchState>();
  if (!activeOnly) {
    for (const delta of state.polarShoreRoot.regions) {
      polarBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
    }
  }
  for (const resident of state.polarShoreActiveResidents) {
    polarBySource.set(resident.sourceKey, resident.patch);
  }
  return Object.freeze([
    ...base.map((entry): RegionalEcologyStateV3SourceOwnership => deepFreeze({ ...entry })),
    ...[...polarBySource].map(([sourceKey, patch]): RegionalEcologyStateV3SourceOwnership => (
      deepFreeze({
        ...sourceOwnership(sourceKey, patch, "regional-polar-shore"),
        layer: "polar-shore" as const,
      })
    )),
  ].sort((left, right) => compareText(left.sourceKey, right.sourceKey)));
}

function requirePolarShoreActiveResidents(
  root: RegionalPolarShoreEcologyRootV1,
  rootSeed: RootSeed,
  base: RegionalEcologyStateV2,
): readonly RegionalEcologyResidentPatch[] {
  const residents = regionalPolarShoreEcologyResidentsForActiveRegions(
    root,
    rootSeed,
    base.base.activeRegions,
  );
  if (residents === null) {
    throw new RangeError("Regional polar-shore ecology could not derive the active neighborhood");
  }
  return Object.freeze(residents.map(({ sourceKey, patch }) => Object.freeze({
    sourceKey,
    patch,
  })));
}

function createPolarShoreSnapshot(
  input: RegionalEcologyResidentPatch,
  tick: number,
): RegionalEcologyStateV3PolarShoreSnapshotV1 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["patch", "sourceKey"])
    || typeof input.sourceKey !== "string"
  ) throw new TypeError("Regional ecology v3 polar-shore resident is malformed");
  const patch = canonicalizeCoreEcologyAggregatePatch(input.patch);
  if (
    patch === null
    || stableStringify(patch) !== stableStringify(input.patch)
    || patch.patchKey !== input.sourceKey
    || patch.updatedAtTick !== tick
    || patch.derivation.kind !== CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND
    || patch.populations.length !== 0
    || patch.groups.groups.length !== 0
    || patch.aggregatePopulations.length === 0
    || patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
  ) throw new RangeError("Regional ecology v3 polar-shore resident is not conserved");
  const base = {
    version: REGIONAL_ECOLOGY_STATE_V3_POLAR_SHORE_SNAPSHOT_VERSION,
    kind: "regional-polar-shore" as const,
    sourceKey: input.sourceKey,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    patch,
  };
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

function canonicalPolarShoreSnapshot(
  value: unknown,
  tick: number,
): RegionalEcologyStateV3PolarShoreSnapshotV1 | null {
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
    value.version !== REGIONAL_ECOLOGY_STATE_V3_POLAR_SHORE_SNAPSHOT_VERSION
    || value.kind !== "regional-polar-shore"
    || typeof value.sourceKey !== "string"
    || !validHash(value.patchHash)
    || !validHash(value.lineageHash)
    || !validHash(value.integrity)
  ) return null;
  try {
    const snapshot = createPolarShoreSnapshot({
      sourceKey: value.sourceKey,
      patch: value.patch as CoreEcologyAggregatePatchState,
    }, tick);
    return stableStringify(snapshot) === stableStringify(value) ? snapshot : null;
  } catch {
    return null;
  }
}

function validPolarShoreSources(
  base: RegionalEcologyStateV2,
  root: RegionalPolarShoreEcologyRootV1,
  residents: readonly RegionalEcologyStateV3PolarShoreSnapshotV1[],
): boolean {
  const activeKeys = new Set(base.base.activeRegions.map(regionKey));
  const sourceKeys = new Set<string>();
  const originKeys = new Set<string>();
  const rootBySource = new Map(root.regions.map((delta) => [
    delta.residentPatch.patchKey,
    delta.residentPatch,
  ]));
  for (const resident of residents) {
    const originKey = regionKey(resident.region);
    const residence = coreEcologyPolarShoreResidentPatchResidenceRegions(resident.patch);
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
  base: RegionalEcologyStateV2,
  polarShoreRoot: RegionalPolarShoreEcologyRootV1,
  polarShoreResidents: readonly RegionalEcologyStateV3PolarShoreSnapshotV1[],
): boolean {
  const baseIds = collectV2Ids(base);
  if (baseIds === null) return false;
  const polarBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const delta of polarShoreRoot.regions) {
    polarBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
  }
  for (const resident of polarShoreResidents) {
    polarBySource.set(resident.sourceKey, resident.patch);
  }
  const polarIds = new Set<string>();
  for (const [sourceKey, patch] of polarBySource) {
    if (baseIds.has(sourceKey) || polarIds.has(sourceKey)) return false;
    for (const id of patchIds(patch)) {
      if (baseIds.has(id) || polarIds.has(id)) return false;
      polarIds.add(id);
    }
  }
  return true;
}

function collectV2Ids(base: RegionalEcologyStateV2): Set<string> | null {
  const ownership = regionalEcologyStateV2SourceOwnership(base, false);
  if (ownership === null) return null;
  const ids = new Set<string>();
  for (const owner of ownership) addOwnershipIds(ids, owner);

  const v1 = base.base;
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
  for (const delta of base.alpineRoot.regions) addPatchIds(ids, delta.residentPatch);
  for (const resident of base.alpineActiveResidents) addPatchIds(ids, resident.patch);
  return ids;
}

function bindPolarShoreProjection(
  state: RegionalEcologyStateV3,
  residentsValue: readonly RegionalEcologyResidentPatch[],
): readonly RegionalEcologyStateV3ProjectedPolarShoreResidentV1[] | null {
  if (residentsValue.length !== state.polarShoreActiveResidents.length) return null;
  const sourceByKey = new Map(state.polarShoreActiveResidents.map((source) => [
    source.sourceKey,
    source,
  ]));
  const output: RegionalEcologyStateV3ProjectedPolarShoreResidentV1[] = [];
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
    if (actorIds.length !== 0) return null;
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
      kind: "regional-polar-shore" as const,
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
  state: RegionalEcologyStateV3,
): RegionalEcologyStateV3ActiveProjection | null {
  if (typeof value === "object" && value !== null && TRUSTED_PROJECTIONS.has(value)) {
    const projection = value as RegionalEcologyStateV3ActiveProjection;
    return projection.stateIntegrity === state.integrity ? projection : null;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "atTick",
    "base",
    "integrity",
    "ownerId",
    "polarShoreResidents",
    "stateIntegrity",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_STATE_V3_ACTIVE_PROJECTION_VERSION
    || value.ownerId !== "game:regional-ecology-active-projection:v3"
    || value.stateIntegrity !== state.integrity
    || value.atTick !== state.updatedAtTick
    || !Array.isArray(value.polarShoreResidents)
    || !validHash(value.integrity)
  ) return null;
  if (
    !plainRecord(value.base)
    || !plainRecord(value.base.base)
    || !Array.isArray(value.base.base.residents)
    || !Array.isArray(value.base.alpineResidents)
  ) return null;
  const baseV1Inputs = projectionResidentInputs(value.base.base.residents);
  const alpineInputs = projectionResidentInputs(value.base.alpineResidents);
  const polarInputs = projectionResidentInputs(value.polarShoreResidents);
  if (baseV1Inputs === null || alpineInputs === null || polarInputs === null) return null;
  const base = bindRegionalEcologyStateV2ActiveProjection(
    state.base,
    [...baseV1Inputs, ...alpineInputs],
  );
  const polar = bindPolarShoreProjection(state, polarInputs);
  const projectedPatches = base === null || polar === null
    ? []
    : [...v2ProjectionPatches(base), ...polar.map(({ patch }) => patch)];
  if (
    base === null
    || polar === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(polar) !== stableStringify(value.polarShoreResidents)
    || !projectedPatches.every(patchMaterializationIsGroupAtomic)
    || projectedPatches.reduce((sum, patch) => sum + countMaterializedActors(patch), 0)
      > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) return null;
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V3_ACTIVE_PROJECTION_VERSION,
    ownerId: "game:regional-ecology-active-projection:v3" as const,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    polarShoreResidents: polar,
  };
  if (hashCanonical(projectionBase) !== value.integrity) return null;
  const projection = deepFreeze({ ...projectionBase, integrity: value.integrity });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

function canonicalAdoption(
  value: unknown,
  base: RegionalEcologyStateV2,
  polarShoreRoot: RegionalPolarShoreEcologyRootV1,
): RegionalEcologyStateV3AdoptionReceiptV1 | null {
  if (value === null) return null;
  if (!plainRecord(value) || !exactKeys(value, [
    "integrity",
    "policyId",
    "resultPolarShoreRootIntegrity",
    "sourceCompletedTick",
    "sourceEnvelopeIntegrity",
    "sourceOuterVersion",
    "sourceStateHash",
    "sourceStateIntegrity",
    "sourceV2LineageHash",
    "status",
    "transactionId",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_STATE_V3_ADOPTION_VERSION
    || value.status !== "committed"
    || value.policyId !== REGIONAL_ECOLOGY_STATE_V3_ADOPTION_POLICY_ID
    || typeof value.transactionId !== "string"
    || !TRANSACTION_PATTERN.test(value.transactionId)
    || value.sourceOuterVersion !== 26
    || !validHash(value.sourceEnvelopeIntegrity)
    || !validHash(value.sourceStateIntegrity)
    || !validHash(value.sourceStateHash)
    || !validHash(value.sourceV2LineageHash)
    || !nonnegativeSafeInteger(value.sourceCompletedTick)
    || !validHash(value.resultPolarShoreRootIntegrity)
    || !validHash(value.integrity)
    || value.sourceCompletedTick > base.updatedAtTick
    || value.sourceV2LineageHash !== regionalEcologyV2LineageHash(base)
    || value.resultPolarShoreRootIntegrity
      !== pristinePolarShoreRootIntegrity(polarShoreRoot, value.sourceCompletedTick)
  ) return null;
  const expectedTransactionId = `regional-ecology-v26-wrapper:${hashCanonical({
    policyId: REGIONAL_ECOLOGY_STATE_V3_ADOPTION_POLICY_ID,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceV2LineageHash: value.sourceV2LineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultPolarShoreRootIntegrity: value.resultPolarShoreRootIntegrity,
  })}`;
  if (value.transactionId !== expectedTransactionId) return null;
  const receiptBase = {
    version: REGIONAL_ECOLOGY_STATE_V3_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V3_ADOPTION_POLICY_ID,
    transactionId: value.transactionId,
    sourceOuterVersion: 26 as const,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceV2LineageHash: value.sourceV2LineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultPolarShoreRootIntegrity: value.resultPolarShoreRootIntegrity,
  };
  return hashCanonical(receiptBase) === value.integrity
    ? deepFreeze({ ...receiptBase, integrity: value.integrity })
    : null;
}

/** The receipt binds pristine polar identity, not the sibling's later clock. */
function pristinePolarShoreRootIntegrity(
  root: RegionalPolarShoreEcologyRootV1,
  migrationTick: number,
): string {
  return hashCanonical({
    version: root.version,
    ownerId: REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID,
    generationVersion: root.generationVersion,
    baselinePolicyId: root.baselinePolicyId,
    seedFingerprint: root.seedFingerprint,
    updatedAtTick: migrationTick,
    revision: 0,
    lastEventOrdinal: 0,
    regions: Object.freeze([]),
  });
}

/** Immutable v2 custody lineage retained across clocks and hot-window exchange. */
function regionalEcologyV2LineageHash(base: RegionalEcologyStateV2): string {
  return hashCanonical({
    version: base.version,
    ownerId: base.ownerId,
    adoptionTransactionId: base.adoption?.transactionId ?? null,
    v1: {
      root: {
        version: base.base.root.version,
        ownerId: base.base.root.ownerId,
        generationVersion: base.base.root.generationVersion,
        baselinePolicyId: base.base.root.baselinePolicyId,
        seedFingerprint: base.base.root.seedFingerprint,
        adoptionTransactionId: base.base.root.adoption?.transactionId ?? null,
        legacySourcePatchHash: base.base.root.legacyCohort?.sourcePatchHash ?? null,
      },
      settlementHome: {
        sourceKey: base.base.settlementHome.sourceKey,
        region: base.base.settlementHome.region,
        lineageHash: base.base.settlementHome.lineageHash,
      },
    },
    alpine: {
      version: base.alpineRoot.version,
      ownerId: base.alpineRoot.ownerId,
      generationVersion: base.alpineRoot.generationVersion,
      baselinePolicyId: base.alpineRoot.baselinePolicyId,
      seedFingerprint: base.alpineRoot.seedFingerprint,
    },
  });
}

function sourceOwnership(
  sourceKey: string,
  patch: CoreEcologyAggregatePatchState,
  kind: RegionalEcologyStateV3SourceOwnership["kind"],
): Omit<RegionalEcologyStateV3SourceOwnership, "layer"> {
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

function addOwnershipIds(
  target: Set<string>,
  ownership: RegionalEcologyStateV2SourceOwnership,
): void {
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

function v2ProjectionPatches(
  projection: RegionalEcologyStateV2ActiveProjection,
): readonly CoreEcologyAggregatePatchState[] {
  return [
    ...projection.base.residents.map(({ patch }) => patch),
    ...projection.alpineResidents.map(({ patch }) => patch),
  ];
}

/** Polar sources are non-addressable; outputs still must honor the exact plan. */
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
    const selected = materializedActorIds(source.patch);
    const returned = materializedActorIds(output);
    if (selected.length !== 0 || returned.length !== 0) return false;
    if (
      output.nextMortalityOrdinal !== source.patch.nextMortalityOrdinal
      || output.mortalityTransactions.length !== source.patch.mortalityTransactions.length
      || output.carcasses.length !== source.patch.carcasses.length
    ) return false;
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
  value: Omit<RegionalEcologyStateV3, "integrity">,
): RegionalEcologyStateV3 {
  const state = deepFreeze({ ...value, integrity: hashCanonical(value) });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology v3 state exceeds the composite save budget");
  }
  TRUSTED_STATES.add(state);
  return state;
}

function copyRegion(region: RegionCoord): RegionCoord {
  return createRegionCoord(region.x, region.y);
}

function compareSnapshot(
  left: Pick<RegionalEcologyStateV3PolarShoreSnapshotV1, "sourceKey">,
  right: Pick<RegionalEcologyStateV3PolarShoreSnapshotV1, "sourceKey">,
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
