import type { RootSeed } from "../sim/rng";
import { createRegionCoord, regionKey, type RegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
  CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
  coreEcologyBreadthCohortsThroughEpoch,
  type CoreEcologyBreadthCohortId,
} from "./coreEcologyBreadthHabitat";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import {
  normalizeRegionalEcologyResidentPatchForStorage,
  regionalEcologyResidentTransitionIsVisitationOnly,
} from "./regionalEcologyState";
import {
  REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV5ActiveProjection,
  canonicalRegionalEcologyStateV5ForWorld,
  canonicalizeRegionalEcologyStateV5,
  commitRegionalEcologyStateV5ActiveProjection,
  regionalEcologyStateV5ActiveSourcePatches,
  regionalEcologyStateV5SourceOwnership,
  replaceRegionalEcologyStateV5ActiveState,
  type CommitRegionalEcologyStateV5ActiveProjectionInput,
  type RegionalEcologyStateV5,
  type RegionalEcologyStateV5ActiveProjection,
  type RegionalEcologyStateV5SourceOwnership,
  type RegionalEcologyStateV5WorldBinding,
  type ReplaceRegionalEcologyStateV5ActiveStateInput,
} from "./regionalEcologyStateV5";
import {
  REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
  advanceRegionalBreadthEcologyRoot,
  canonicalRegionalBreadthEcologyRootForWorld,
  canonicalizeRegionalBreadthEcologyRoot,
  createPristineRegionalBreadthEcologyRoot,
  putRegionalBreadthEcologyResidentDeviation,
  regionalBreadthEcologyResidentsForActiveRegions,
  type RegionalBreadthEcologyRootV1,
} from "./regionalBreadthEcology";
import {
  canonicalCoreEcologyBreadthResidentPatch,
  coreEcologyBreadthResidentPatchIsAllCoarse,
  coreEcologyBreadthResidentPatchResidenceRegions,
} from "./regionalBreadthCohort";
import {
  setRegionalEcologyMaterializationForWindow,
  type RegionalEcologyResidentPatch,
} from "./regionalEcologyRuntime";

export const REGIONAL_ECOLOGY_STATE_V6_VERSION = 6 as const;
export const REGIONAL_ECOLOGY_STATE_V6_OWNER_ID =
  "game:regional-ecology-state:v6" as const;
export const REGIONAL_ECOLOGY_STATE_V6_BREADTH_SNAPSHOT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V6_ADOPTION_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_V6_ADOPTION_POLICY_ID =
  "regional-ecology-v29-wrapper:v1" as const;
export const REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_VERSION = 6 as const;
export const REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_OWNER_ID =
  "game:regional-ecology-active-projection:v6" as const;

/** Exact v5 child, one append-only breadth root, and bounded hot snapshots. */
export const REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES =
  REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES
  + REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES
  + 32 * 1_024 * 1_024;

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const TRANSACTION_PATTERN = /^regional-ecology-v29-wrapper:[0-9a-f]{16}$/u;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_STATES = new WeakSet<object>();
const TRUSTED_PROJECTIONS = new WeakSet<object>();

export interface RegionalEcologyStateV6AdoptionReceiptV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V6_ADOPTION_VERSION;
  readonly status: "committed";
  readonly policyId: typeof REGIONAL_ECOLOGY_STATE_V6_ADOPTION_POLICY_ID;
  readonly transactionId: string;
  readonly sourceOuterVersion: 29;
  readonly sourceEnvelopeIntegrity: string;
  readonly sourceStateIntegrity: string;
  readonly sourceStateHash: string;
  readonly sourceV5LineageHash: string;
  readonly sourceCompletedTick: number;
  /** The initially adopted prefix remains valid after later cohort epochs append. */
  readonly resultBreadthActivationEpoch: number;
  readonly resultBreadthActivationPrefixHash: string;
  readonly integrity: string;
}

/** Authenticated all-coarse hot snapshot owned by one breadth cohort source. */
export interface RegionalEcologyStateV6BreadthSnapshotV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V6_BREADTH_SNAPSHOT_VERSION;
  readonly kind: typeof CORE_ECOLOGY_BREADTH_DERIVATION_KIND;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly integrity: string;
}

export interface RegionalEcologyStateV6 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V6_VERSION;
  readonly ownerId: typeof REGIONAL_ECOLOGY_STATE_V6_OWNER_ID;
  readonly updatedAtTick: number;
  /** Exact authenticated outer-v29 ecology child. */
  readonly base: RegionalEcologyStateV5;
  /** Permanent append-only breadth sibling; future cohorts append epochs here. */
  readonly breadthRoot: RegionalBreadthEcologyRootV1;
  /** Hot snapshots use the exact v1 active regions; there is no second window. */
  readonly breadthActiveResidents: readonly RegionalEcologyStateV6BreadthSnapshotV1[];
  /** Migration provenance from v29; null for a fresh v30 world. */
  readonly adoption: RegionalEcologyStateV6AdoptionReceiptV1 | null;
  readonly integrity: string;
}

export type RegionalEcologyStateV6WorldBinding = RegionalEcologyStateV5WorldBinding;

export interface CreateRegionalEcologyStateV6Input {
  readonly base: RegionalEcologyStateV5;
  readonly breadthRoot: RegionalBreadthEcologyRootV1;
  readonly breadthActiveResidents: readonly RegionalEcologyResidentPatch[];
  readonly adoption: RegionalEcologyStateV6AdoptionReceiptV1 | null;
}

export interface MigrateRegionalEcologyStateV5ToV6Input {
  readonly rootSeed: RootSeed;
  readonly sourceEnvelopeIntegrity: string;
}

export interface RegionalEcologyStateV6ProjectedBreadthResidentV1 {
  readonly kind: typeof CORE_ECOLOGY_BREADTH_DERIVATION_KIND;
  readonly cohortId: CoreEcologyBreadthCohortId;
  readonly cohortEpoch: number;
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly sourcePatchHash: string;
  readonly projectedPatchHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalEcologyStateV6ActiveProjection {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_VERSION;
  readonly ownerId: typeof REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_OWNER_ID;
  readonly stateIntegrity: string;
  readonly atTick: number;
  readonly base: RegionalEcologyStateV5ActiveProjection;
  readonly breadthResidents: readonly RegionalEcologyStateV6ProjectedBreadthResidentV1[];
  readonly integrity: string;
}

export interface CommitRegionalEcologyStateV6ActiveProjectionInput {
  readonly base: CommitRegionalEcologyStateV5ActiveProjectionInput;
  readonly breadthResidents: readonly RegionalEcologyResidentPatch[];
}

export interface ReplaceRegionalEcologyStateV6ActiveStateInput {
  readonly expectedIntegrity: string;
  /** Raw v5 exchange input; this owner executes and authenticates the child transaction. */
  readonly base: ReplaceRegionalEcologyStateV5ActiveStateInput;
}

export interface RegionalEcologyStateV6SourceOwnership
  extends Omit<RegionalEcologyStateV5SourceOwnership, "kind" | "layer"> {
  readonly layer: RegionalEcologyStateV5SourceOwnership["layer"] | "breadth";
  readonly kind:
    | RegionalEcologyStateV5SourceOwnership["kind"]
    | typeof CORE_ECOLOGY_BREADTH_DERIVATION_KIND;
}

/** Construct one strict composite without rewriting either canonical child. */
export function createRegionalEcologyStateV6(
  input: CreateRegionalEcologyStateV6Input,
): RegionalEcologyStateV6 {
  if (
    !plainRecord(input)
    || !exactKeys(input, [
      "adoption",
      "base",
      "breadthActiveResidents",
      "breadthRoot",
    ])
    || !Array.isArray(input.breadthActiveResidents)
  ) {
    throw new TypeError("Regional ecology v6 input is malformed");
  }
  const base = canonicalizeRegionalEcologyStateV5(input.base);
  const breadthRoot = canonicalizeRegionalBreadthEcologyRoot(input.breadthRoot);
  if (
    base === null
    || breadthRoot === null
    || stableStringify(base) !== stableStringify(input.base)
    || stableStringify(breadthRoot) !== stableStringify(input.breadthRoot)
    || breadthRoot.updatedAtTick !== base.updatedAtTick
    || breadthRoot.seedFingerprint !== base.polarConsumerRoot.seedFingerprint
  ) {
    throw new RangeError("Regional ecology v6 children are not canonical at one clock");
  }
  const breadthActiveResidents = input.breadthActiveResidents
    .map((resident) => createBreadthSnapshot(resident, base.updatedAtTick))
    .sort(compareSnapshot);
  const adoption = canonicalAdoption(input.adoption, base, breadthRoot);
  if (input.adoption !== null && adoption === null) {
    throw new RangeError("Regional ecology v6 adoption receipt is malformed");
  }
  if (!validBreadthSources(base, breadthRoot, breadthActiveResidents)) {
    throw new RangeError("Regional ecology v6 breadth sources escape the hot window");
  }
  if (!validCrossLayerOwnership(base, breadthRoot, breadthActiveResidents)) {
    throw new RangeError("Regional ecology v6 child ownership overlaps");
  }
  return sealState({
    version: REGIONAL_ECOLOGY_STATE_V6_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V6_OWNER_ID,
    updatedAtTick: base.updatedAtTick,
    base,
    breadthRoot,
    breadthActiveResidents: Object.freeze(breadthActiveResidents),
    adoption,
  });
}

/** Fresh outer-v30 worlds have no migration receipt. */
export function createFreshRegionalEcologyStateV6(
  baseValue: unknown,
  rootSeed: RootSeed,
): RegionalEcologyStateV6 {
  const base = canonicalizeRegionalEcologyStateV5(baseValue);
  if (base === null) throw new TypeError("Fresh regional ecology v6 requires one v5 base");
  const breadthRoot = createPristineRegionalBreadthEcologyRoot({
    rootSeed,
    completedTick: base.updatedAtTick,
  });
  return createRegionalEcologyStateV6({
    base,
    breadthRoot,
    breadthActiveResidents: requireBreadthActiveResidents(breadthRoot, rootSeed, base),
    adoption: null,
  });
}

/** Exact-once append-only wrapping of an authenticated outer-v29 child. */
export function migrateRegionalEcologyStateV5ToV6(
  baseValue: unknown,
  input: MigrateRegionalEcologyStateV5ToV6Input,
): RegionalEcologyStateV6 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["rootSeed", "sourceEnvelopeIntegrity"])
    || !validHash(input.sourceEnvelopeIntegrity)
  ) throw new TypeError("Regional ecology v29 migration input is malformed");
  const base = canonicalizeRegionalEcologyStateV5(baseValue);
  if (base === null || stableStringify(base) !== stableStringify(baseValue)) {
    throw new TypeError("Regional ecology v29 migration requires an exact v5 child");
  }
  const breadthRoot = createPristineRegionalBreadthEcologyRoot({
    rootSeed: input.rootSeed,
    completedTick: base.updatedAtTick,
  });
  const receiptBase = adoptionReceiptBase({
    sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
    sourceStateIntegrity: base.integrity,
    sourceStateHash: hashCanonical(base),
    sourceV5LineageHash: regionalEcologyV5LineageHash(base),
    sourceCompletedTick: base.updatedAtTick,
    resultBreadthActivationEpoch: breadthRoot.activeThroughEpoch,
    resultBreadthActivationPrefixHash: breadthActivationPrefixHash(
      breadthRoot,
      breadthRoot.activeThroughEpoch,
    ),
  });
  const transactionId = `regional-ecology-v29-wrapper:${hashCanonical(receiptBase)}`;
  const withTransaction = { ...receiptBase, transactionId };
  const adoption = deepFreeze({
    ...withTransaction,
    integrity: hashCanonical(withTransaction),
  });
  return createRegionalEcologyStateV6({
    base,
    breadthRoot,
    breadthActiveResidents: requireBreadthActiveResidents(
      breadthRoot,
      input.rootSeed,
      base,
    ),
    adoption,
  });
}

export function canonicalizeRegionalEcologyStateV6(
  value: unknown,
): RegionalEcologyStateV6 | null {
  if (typeof value === "object" && value !== null && TRUSTED_STATES.has(value)) {
    return value as RegionalEcologyStateV6;
  }
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "adoption",
      "base",
      "breadthActiveResidents",
      "breadthRoot",
      "integrity",
      "ownerId",
      "updatedAtTick",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V6_VERSION
    || value.ownerId !== REGIONAL_ECOLOGY_STATE_V6_OWNER_ID
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.breadthActiveResidents)
    || !validHash(value.integrity)
  ) return null;
  const base = canonicalizeRegionalEcologyStateV5(value.base);
  const breadthRoot = canonicalizeRegionalBreadthEcologyRoot(value.breadthRoot);
  if (
    base === null
    || breadthRoot === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(breadthRoot) !== stableStringify(value.breadthRoot)
    || base.updatedAtTick !== value.updatedAtTick
    || breadthRoot.updatedAtTick !== value.updatedAtTick
    || breadthRoot.seedFingerprint !== base.polarConsumerRoot.seedFingerprint
  ) return null;
  const breadthActiveResidents: RegionalEcologyStateV6BreadthSnapshotV1[] = [];
  for (const raw of value.breadthActiveResidents) {
    const snapshot = canonicalBreadthSnapshot(raw, value.updatedAtTick);
    if (snapshot === null) return null;
    breadthActiveResidents.push(snapshot);
  }
  breadthActiveResidents.sort(compareSnapshot);
  if (
    stableStringify(breadthActiveResidents) !== stableStringify(value.breadthActiveResidents)
    || !validBreadthSources(base, breadthRoot, breadthActiveResidents)
    || !validCrossLayerOwnership(base, breadthRoot, breadthActiveResidents)
  ) return null;
  const adoption = canonicalAdoption(value.adoption, base, breadthRoot);
  if (value.adoption !== null && adoption === null) return null;
  const stateBase = {
    version: REGIONAL_ECOLOGY_STATE_V6_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V6_OWNER_ID,
    updatedAtTick: value.updatedAtTick,
    base,
    breadthRoot,
    breadthActiveResidents: Object.freeze(breadthActiveResidents),
    adoption,
  };
  if (hashCanonical(stateBase) !== value.integrity) return null;
  const state = deepFreeze({ ...stateBase, integrity: value.integrity });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES) {
    return null;
  }
  TRUSTED_STATES.add(state);
  return state;
}

/** World/seed trust boundary for the exact v5 child, breadth root, and snapshots. */
export function canonicalRegionalEcologyStateV6ForWorld(
  value: unknown,
  binding: RegionalEcologyStateV6WorldBinding,
): RegionalEcologyStateV6 | null {
  if (!plainRecord(binding) || !nonnegativeSafeInteger(binding.completedTick)) return null;
  const state = canonicalizeRegionalEcologyStateV6(value);
  if (state === null || state.updatedAtTick !== binding.completedTick) return null;
  if (canonicalRegionalEcologyStateV5ForWorld(state.base, binding) === null) return null;
  const breadthRoot = canonicalRegionalBreadthEcologyRootForWorld(
    state.breadthRoot,
    binding,
  );
  if (breadthRoot === null) return null;
  const expected = regionalBreadthEcologyResidentsForActiveRegions(
    breadthRoot,
    binding.rootSeed,
    activeRegions(state.base),
  );
  if (expected === null || expected.length !== state.breadthActiveResidents.length) {
    return null;
  }
  const expectedBySource = new Map(expected.map(({ sourceKey, patch }) => [
    sourceKey,
    patch,
  ]));
  for (const snapshot of state.breadthActiveResidents) {
    const bound = canonicalCoreEcologyBreadthResidentPatch(snapshot.patch, {
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

export function serializeRegionalEcologyStateV6(value: unknown): string {
  const state = canonicalizeRegionalEcologyStateV6(value);
  if (state === null) throw new TypeError("Regional ecology v6 state is malformed");
  const text = stableStringify(state);
  if (UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology v6 state exceeds the composite save budget");
  }
  return text;
}

export function deserializeRegionalEcologyStateV6(
  text: unknown,
): RegionalEcologyStateV6 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeRegionalEcologyStateV6(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

/** Exact source patches participating in the one cross-owner hot projection. */
export function regionalEcologyStateV6ActiveSourcePatches(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  const state = canonicalizeRegionalEcologyStateV6(value);
  if (state === null) return null;
  const baseSources = regionalEcologyStateV5ActiveSourcePatches(state.base);
  if (baseSources === null) return null;
  return Object.freeze([
    ...baseSources.map(({ sourceKey, patch }) => Object.freeze({ sourceKey, patch })),
    ...state.breadthActiveResidents.map(({ sourceKey, patch }) => (
      Object.freeze({ sourceKey, patch })
    )),
  ].sort(compareResident));
}

/** One shared group-atomic top-K plan owns all v5 and breadth sources. */
export function projectRegionalEcologyStateV6ActiveState(
  value: unknown,
  window: CoreEcologyRuntimeWindow,
): RegionalEcologyStateV6ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV6(value);
  if (state === null) return null;
  const sources = regionalEcologyStateV6ActiveSourcePatches(state);
  if (sources === null) return null;
  const materialized = setRegionalEcologyMaterializationForWindow(
    sources,
    window,
    state.updatedAtTick,
  );
  return materialized === null
    ? null
    : bindRegionalEcologyStateV6ActiveProjection(state, materialized);
}

export function bindRegionalEcologyStateV6ActiveProjection(
  value: unknown,
  materializedResidentsValue: unknown,
): RegionalEcologyStateV6ActiveProjection | null {
  const state = canonicalizeRegionalEcologyStateV6(value);
  if (state === null || !Array.isArray(materializedResidentsValue)) return null;
  const baseSources = regionalEcologyStateV5ActiveSourcePatches(state.base);
  if (baseSources === null) return null;
  const baseKeys = new Set(baseSources.map(({ sourceKey }) => sourceKey));
  const breadthKeys = new Set(state.breadthActiveResidents.map(({ sourceKey }) => sourceKey));
  const baseResidents: RegionalEcologyResidentPatch[] = [];
  const breadthResidents: RegionalEcologyResidentPatch[] = [];
  const projectedPatches: CoreEcologyAggregatePatchState[] = [];
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
    else if (breadthKeys.has(raw.sourceKey)) breadthResidents.push(resident);
    else return null;
    projectedPatches.push(patch);
    seen.add(raw.sourceKey);
  }
  if (seen.size !== baseKeys.size + breadthKeys.size) return null;
  const base = bindRegionalEcologyStateV5ActiveProjection(state.base, baseResidents);
  const breadth = bindBreadthProjection(state, breadthResidents);
  if (
    base === null
    || breadth === null
    || !projectedPatches.every(patchMaterializationIsGroupAtomic)
    || projectedPatches.reduce((sum, patch) => sum + countMaterializedActors(patch), 0)
      > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) return null;
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_OWNER_ID,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    breadthResidents: breadth,
  };
  const projection = deepFreeze({
    ...projectionBase,
    integrity: hashCanonical(projectionBase),
  });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

/** All owners advance together, or this immutable composite returns no result. */
export function commitRegionalEcologyStateV6ActiveProjection(
  stateValue: unknown,
  projectionValue: unknown,
  input: CommitRegionalEcologyStateV6ActiveProjectionInput,
): RegionalEcologyStateV6 | null {
  const state = canonicalizeRegionalEcologyStateV6(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "breadthResidents"])
    || !plainRecord(input.base)
    || !Array.isArray(input.breadthResidents)
  ) return null;
  const projection = canonicalProjection(projectionValue, state);
  const baseOutputResidents = v5CommitResidentInputs(input.base);
  if (
    projection === null
    || baseOutputResidents === null
    || !projectedMaterializationTransitionIsHonored(
      v5ProjectionResidents(projection.base),
      baseOutputResidents,
      true,
    )
    || !projectedMaterializationTransitionIsHonored(
      projection.breadthResidents,
      input.breadthResidents,
      false,
    )
  ) return null;
  let base: RegionalEcologyStateV5 | null;
  try {
    base = commitRegionalEcologyStateV5ActiveProjection(
      state.base,
      projection.base,
      input.base,
    );
  } catch {
    return null;
  }
  if (base === null || base.updatedAtTick < state.updatedAtTick) return null;
  const rootSeed = input.base.base.base.base.base.rootSeed;
  let breadthRoot: RegionalBreadthEcologyRootV1;
  try {
    breadthRoot = advanceRegionalBreadthEcologyRoot(
      state.breadthRoot,
      base.updatedAtTick,
    );
  } catch {
    return null;
  }
  const outputBySource = canonicalResidentOutputMap(
    input.breadthResidents,
    base.updatedAtTick,
  );
  if (
    outputBySource === null
    || outputBySource.size !== projection.breadthResidents.length
  ) return null;
  const originalBySource = new Map(
    state.breadthActiveResidents.map((entry) => [entry.sourceKey, entry]),
  );
  for (const projected of projection.breadthResidents) {
    const original = originalBySource.get(projected.sourceKey);
    const output = outputBySource.get(projected.sourceKey);
    if (original === undefined || output === undefined) return null;
    const bound = canonicalCoreEcologyBreadthResidentPatch(output, {
      seed: rootSeed,
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
      && regionalEcologyResidentTransitionIsVisitationOnly(
        normalizedProjection,
        normalized,
      );
    if (!presentationOnly && !visitationOnly) {
      try {
        breadthRoot = putRegionalBreadthEcologyResidentDeviation(breadthRoot, {
          rootSeed,
          patch: normalized,
        });
      } catch {
        return null;
      }
    }
  }
  try {
    return createRegionalEcologyStateV6({
      base,
      breadthRoot,
      breadthActiveResidents: requireBreadthActiveResidents(
        breadthRoot,
        rootSeed,
        base,
      ),
      adoption: state.adoption,
    });
  } catch {
    return null;
  }
}

/** Exchange the v5 hot neighborhood, then derive every active breadth cohort. */
export function replaceRegionalEcologyStateV6ActiveState(
  stateValue: unknown,
  input: ReplaceRegionalEcologyStateV6ActiveStateInput,
): RegionalEcologyStateV6 {
  const state = canonicalizeRegionalEcologyStateV6(stateValue);
  if (
    state === null
    || !plainRecord(input)
    || !exactKeys(input, ["base", "expectedIntegrity"])
    || input.expectedIntegrity !== state.integrity
  ) throw new RangeError("Regional ecology v6 active replacement is stale or malformed");
  let base: RegionalEcologyStateV5;
  try {
    base = replaceRegionalEcologyStateV5ActiveState(state.base, input.base);
  } catch {
    throw new RangeError("Regional ecology v6 active replacement breaks v5 lineage");
  }
  const rootSeed = input.base.base.base.base.base.rootSeed;
  // A hot snapshot may carry a committed movement/evidence deviation whose
  // physical residence now crosses the incoming window. Persist every live
  // breadth owner through the sparse root before deriving the replacement;
  // the root drops pristine baselines, so ordinary visitation remains free.
  let breadthRoot = state.breadthRoot;
  for (const resident of state.breadthActiveResidents) {
    const stored = breadthRoot.regions.find(({ residentPatch }) => (
      residentPatch.patchKey === resident.sourceKey
    ));
    if (
      stored !== undefined
      && stableStringify(stored.residentPatch) === stableStringify(resident.patch)
    ) continue;
    try {
      breadthRoot = putRegionalBreadthEcologyResidentDeviation(breadthRoot, {
        rootSeed,
        patch: resident.patch,
      });
    } catch {
      throw new RangeError(
        "Regional ecology v6 active replacement could not preserve breadth residence",
      );
    }
  }
  if (canonicalRegionalBreadthEcologyRootForWorld(breadthRoot, {
    rootSeed,
    completedTick: base.updatedAtTick,
  }) === null) {
    throw new RangeError("Regional ecology v6 active replacement belongs to another world");
  }
  return createRegionalEcologyStateV6({
    base,
    breadthRoot,
    breadthActiveResidents: requireBreadthActiveResidents(
      breadthRoot,
      rootSeed,
      base,
    ),
    adoption: state.adoption,
  });
}

/** Composite diagnostic manifest across the exact v5 child and breadth sibling. */
export function regionalEcologyStateV6SourceOwnership(
  value: unknown,
  activeOnly = false,
): readonly RegionalEcologyStateV6SourceOwnership[] | null {
  const state = canonicalizeRegionalEcologyStateV6(value);
  if (state === null) return null;
  const base = regionalEcologyStateV5SourceOwnership(state.base, activeOnly);
  if (base === null) return null;
  const breadthBySource = new Map<string, CoreEcologyAggregatePatchState>();
  if (!activeOnly) {
    for (const delta of state.breadthRoot.regions) {
      breadthBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
    }
  }
  for (const resident of state.breadthActiveResidents) {
    breadthBySource.set(resident.sourceKey, resident.patch);
  }
  return Object.freeze([
    ...base.map((entry): RegionalEcologyStateV6SourceOwnership => deepFreeze({ ...entry })),
    ...[...breadthBySource].map(
      ([sourceKey, patch]): RegionalEcologyStateV6SourceOwnership => deepFreeze({
        ...sourceOwnership(sourceKey, patch),
        layer: "breadth" as const,
      }),
    ),
  ].sort((left, right) => compareText(left.sourceKey, right.sourceKey)));
}

function activeRegions(base: RegionalEcologyStateV5): readonly RegionCoord[] {
  return base.base.base.base.base.activeRegions;
}

function requireBreadthActiveResidents(
  root: RegionalBreadthEcologyRootV1,
  rootSeed: RootSeed,
  base: RegionalEcologyStateV5,
): readonly RegionalEcologyResidentPatch[] {
  const residents = regionalBreadthEcologyResidentsForActiveRegions(
    root,
    rootSeed,
    activeRegions(base),
  );
  if (residents === null) {
    throw new RangeError("Regional breadth ecology could not derive the active neighborhood");
  }
  return Object.freeze(residents.map(({ sourceKey, patch }) => Object.freeze({
    sourceKey,
    patch,
  })));
}

function createBreadthSnapshot(
  input: RegionalEcologyResidentPatch,
  tick: number,
): RegionalEcologyStateV6BreadthSnapshotV1 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["patch", "sourceKey"])
    || typeof input.sourceKey !== "string"
  ) throw new TypeError("Regional ecology v6 breadth resident is malformed");
  const patch = normalizeRegionalEcologyResidentPatchForStorage(input.patch, tick);
  if (
    patch === null
    || patch.patchKey !== input.sourceKey
    || patch.derivation.kind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
    || !coreEcologyBreadthResidentPatchIsAllCoarse(patch)
    || patch.populations.length + patch.aggregatePopulations.length < 1
    || patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
  ) throw new RangeError("Regional ecology v6 breadth resident breaks cohort conservation");
  const habitat = patch.derivation.habitat;
  const base = {
    version: REGIONAL_ECOLOGY_STATE_V6_BREADTH_SNAPSHOT_VERSION,
    kind: CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
    cohortId: habitat.cohortId,
    cohortEpoch: habitat.cohortEpoch,
    sourceKey: input.sourceKey,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    patch,
  };
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

function canonicalBreadthSnapshot(
  value: unknown,
  tick: number,
): RegionalEcologyStateV6BreadthSnapshotV1 | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "cohortEpoch",
      "cohortId",
      "integrity",
      "kind",
      "lineageHash",
      "patch",
      "patchHash",
      "region",
      "sourceKey",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V6_BREADTH_SNAPSHOT_VERSION
    || value.kind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
    || typeof value.sourceKey !== "string"
    || !validHash(value.patchHash)
    || !validHash(value.lineageHash)
    || !validHash(value.integrity)
  ) return null;
  try {
    const snapshot = createBreadthSnapshot({
      sourceKey: value.sourceKey,
      patch: value.patch as CoreEcologyAggregatePatchState,
    }, tick);
    return stableStringify(snapshot) === stableStringify(value) ? snapshot : null;
  } catch {
    return null;
  }
}

function validBreadthSources(
  base: RegionalEcologyStateV5,
  root: RegionalBreadthEcologyRootV1,
  residents: readonly RegionalEcologyStateV6BreadthSnapshotV1[],
): boolean {
  const activeKeys = new Set(activeRegions(base).map(regionKey));
  const sourceKeys = new Set<string>();
  const cohortOrigins = new Set<string>();
  const activeCohorts = new Map(root.activations.map(({ cohortId, cohortEpoch }) => [
    cohortId,
    cohortEpoch,
  ]));
  const rootBySource = new Map(root.regions.map((delta) => [
    delta.residentPatch.patchKey,
    delta.residentPatch,
  ]));
  for (const resident of residents) {
    const originKey = regionKey(resident.region);
    const cohortOrigin = `${resident.cohortId.length}:${resident.cohortId}:${originKey}`;
    const residence = coreEcologyBreadthResidentPatchResidenceRegions(resident.patch);
    if (
      sourceKeys.has(resident.sourceKey)
      || cohortOrigins.has(cohortOrigin)
      || activeCohorts.get(resident.cohortId) !== resident.cohortEpoch
      || residence === null
      || (!activeKeys.has(originKey)
        && !residence.some((region) => activeKeys.has(regionKey(region))))
    ) return false;
    sourceKeys.add(resident.sourceKey);
    cohortOrigins.add(cohortOrigin);
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
  base: RegionalEcologyStateV5,
  breadthRoot: RegionalBreadthEcologyRootV1,
  breadthResidents: readonly RegionalEcologyStateV6BreadthSnapshotV1[],
): boolean {
  const baseIds = collectV5Ids(base);
  if (baseIds === null) return false;
  const breadthBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const delta of breadthRoot.regions) {
    breadthBySource.set(delta.residentPatch.patchKey, delta.residentPatch);
  }
  for (const resident of breadthResidents) {
    breadthBySource.set(resident.sourceKey, resident.patch);
  }
  const breadthIds = new Set<string>();
  for (const [sourceKey, patch] of breadthBySource) {
    if (baseIds.has(sourceKey) || breadthIds.has(sourceKey)) return false;
    breadthIds.add(sourceKey);
    for (const id of patchIds(patch)) {
      if (baseIds.has(id) || breadthIds.has(id)) return false;
      breadthIds.add(id);
    }
  }
  return true;
}

function collectV5Ids(base: RegionalEcologyStateV5): Set<string> | null {
  const ownership = regionalEcologyStateV5SourceOwnership(base, false);
  if (ownership === null) return null;
  const ids = new Set<string>();
  for (const owner of ownership) {
    if (!addOwnershipIds(ids, owner)) return null;
  }
  return ids;
}

function bindBreadthProjection(
  state: RegionalEcologyStateV6,
  residentsValue: readonly RegionalEcologyResidentPatch[],
): readonly RegionalEcologyStateV6ProjectedBreadthResidentV1[] | null {
  if (residentsValue.length !== state.breadthActiveResidents.length) return null;
  const sourceByKey = new Map(
    state.breadthActiveResidents.map((source) => [source.sourceKey, source]),
  );
  const output: RegionalEcologyStateV6ProjectedBreadthResidentV1[] = [];
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
    let replay: CoreEcologyAggregatePatchState;
    try {
      replay = setCoreEcologyAggregatePatchMaterializedActors(source.patch, {
        atTick: state.updatedAtTick,
        actorIds: materializedActorIds(projected),
      });
    } catch {
      return null;
    }
    if (stableStringify(replay) !== stableStringify(projected)) return null;
    output.push(deepFreeze({
      kind: CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
      cohortId: source.cohortId,
      cohortEpoch: source.cohortEpoch,
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
  state: RegionalEcologyStateV6,
): RegionalEcologyStateV6ActiveProjection | null {
  if (typeof value === "object" && value !== null && TRUSTED_PROJECTIONS.has(value)) {
    const projection = value as RegionalEcologyStateV6ActiveProjection;
    return projection.stateIntegrity === state.integrity ? projection : null;
  }
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "atTick",
      "base",
      "breadthResidents",
      "integrity",
      "ownerId",
      "stateIntegrity",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_VERSION
    || value.ownerId !== REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_OWNER_ID
    || value.stateIntegrity !== state.integrity
    || value.atTick !== state.updatedAtTick
    || !Array.isArray(value.breadthResidents)
    || !validHash(value.integrity)
  ) return null;
  const baseInputs = v5ProjectionResidentInputs(value.base);
  const breadthInputs = projectionResidentInputs(value.breadthResidents);
  if (baseInputs === null || breadthInputs === null) return null;
  const base = bindRegionalEcologyStateV5ActiveProjection(state.base, baseInputs);
  const breadth = bindBreadthProjection(state, breadthInputs);
  const projectedPatches = base === null || breadth === null
    ? []
    : [...v5ProjectionPatches(base), ...breadth.map(({ patch }) => patch)];
  if (
    base === null
    || breadth === null
    || stableStringify(base) !== stableStringify(value.base)
    || stableStringify(breadth) !== stableStringify(value.breadthResidents)
    || !projectedPatches.every(patchMaterializationIsGroupAtomic)
    || projectedPatches.reduce((sum, patch) => sum + countMaterializedActors(patch), 0)
      > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) return null;
  const projectionBase = {
    version: REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_V6_ACTIVE_PROJECTION_OWNER_ID,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    base,
    breadthResidents: breadth,
  };
  if (hashCanonical(projectionBase) !== value.integrity) return null;
  const projection = deepFreeze({ ...projectionBase, integrity: value.integrity });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

function canonicalAdoption(
  value: unknown,
  base: RegionalEcologyStateV5,
  breadthRoot: RegionalBreadthEcologyRootV1,
): RegionalEcologyStateV6AdoptionReceiptV1 | null {
  if (value === null) return null;
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "integrity",
      "policyId",
      "resultBreadthActivationEpoch",
      "resultBreadthActivationPrefixHash",
      "sourceCompletedTick",
      "sourceEnvelopeIntegrity",
      "sourceOuterVersion",
      "sourceStateHash",
      "sourceStateIntegrity",
      "sourceV5LineageHash",
      "status",
      "transactionId",
      "version",
    ])
    || value.version !== REGIONAL_ECOLOGY_STATE_V6_ADOPTION_VERSION
    || value.status !== "committed"
    || value.policyId !== REGIONAL_ECOLOGY_STATE_V6_ADOPTION_POLICY_ID
    || typeof value.transactionId !== "string"
    || !TRANSACTION_PATTERN.test(value.transactionId)
    || value.sourceOuterVersion !== 29
    || !validHash(value.sourceEnvelopeIntegrity)
    || !validHash(value.sourceStateIntegrity)
    || !validHash(value.sourceStateHash)
    || !validHash(value.sourceV5LineageHash)
    || !nonnegativeSafeInteger(value.sourceCompletedTick)
    || !nonnegativeSafeInteger(value.resultBreadthActivationEpoch)
    || value.resultBreadthActivationEpoch > breadthRoot.activeThroughEpoch
    || !validHash(value.resultBreadthActivationPrefixHash)
    || !validHash(value.integrity)
    || value.sourceCompletedTick > base.updatedAtTick
    || value.sourceV5LineageHash !== regionalEcologyV5LineageHash(base)
    || value.resultBreadthActivationPrefixHash !== breadthActivationPrefixHash(
      breadthRoot,
      value.resultBreadthActivationEpoch,
    )
  ) return null;
  const receiptBase = adoptionReceiptBase({
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceStateIntegrity: value.sourceStateIntegrity,
    sourceStateHash: value.sourceStateHash,
    sourceV5LineageHash: value.sourceV5LineageHash,
    sourceCompletedTick: value.sourceCompletedTick,
    resultBreadthActivationEpoch: value.resultBreadthActivationEpoch,
    resultBreadthActivationPrefixHash: value.resultBreadthActivationPrefixHash,
  });
  const expectedTransactionId = `regional-ecology-v29-wrapper:${hashCanonical(receiptBase)}`;
  if (value.transactionId !== expectedTransactionId) return null;
  const withTransaction = { ...receiptBase, transactionId: value.transactionId };
  return hashCanonical(withTransaction) === value.integrity
    ? deepFreeze({ ...withTransaction, integrity: value.integrity })
    : null;
}

function adoptionReceiptBase(input: Readonly<{
  readonly sourceEnvelopeIntegrity: string;
  readonly sourceStateIntegrity: string;
  readonly sourceStateHash: string;
  readonly sourceV5LineageHash: string;
  readonly sourceCompletedTick: number;
  readonly resultBreadthActivationEpoch: number;
  readonly resultBreadthActivationPrefixHash: string;
}>) {
  return {
    version: REGIONAL_ECOLOGY_STATE_V6_ADOPTION_VERSION,
    status: "committed" as const,
    policyId: REGIONAL_ECOLOGY_STATE_V6_ADOPTION_POLICY_ID,
    sourceOuterVersion: 29 as const,
    ...input,
  };
}

/** Bind only the adopted activation prefix, never later clocks/deltas/epochs. */
function breadthActivationPrefixHash(
  root: RegionalBreadthEcologyRootV1,
  adoptedEpoch: number,
): string {
  const expectedCohorts = coreEcologyBreadthCohortsThroughEpoch(adoptedEpoch);
  const prefix = root.activations.filter(({ cohortEpoch }) => cohortEpoch <= adoptedEpoch);
  if (
    adoptedEpoch < 0
    || adoptedEpoch > root.activeThroughEpoch
    || prefix.length !== expectedCohorts.length
    || prefix.some((activation, index) => (
      activation.activationOrdinal !== index
      || activation.cohortId !== expectedCohorts[index]?.cohortId
      || activation.cohortEpoch !== expectedCohorts[index]?.introducedInEpoch
      || activation.cohortDefinitionHash !== expectedCohorts[index]?.definitionHash
    ))
  ) return hashCanonical({ invalidBreadthActivationPrefix: true });
  return hashCanonical({
    version: root.version,
    ownerId: REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
    generationVersion: root.generationVersion,
    baselinePolicyId: root.baselinePolicyId,
    seedFingerprint: root.seedFingerprint,
    adoptedEpoch,
    activations: prefix.map((activation) => ({
      version: activation.version,
      activationOrdinal: activation.activationOrdinal,
      cohortId: activation.cohortId,
      cohortEpoch: activation.cohortEpoch,
      cohortDefinitionHash: activation.cohortDefinitionHash,
      activatedAtTick: activation.activatedAtTick,
      stableId: activation.stableId,
      integrity: activation.integrity,
    })),
  });
}

/** Immutable v5 custody lineage retained across clocks and hot-window exchange. */
function regionalEcologyV5LineageHash(base: RegionalEcologyStateV5): string {
  return hashCanonical({
    version: base.version,
    ownerId: base.ownerId,
    adoptionTransactionId: base.adoption?.transactionId ?? null,
    v4: regionalEcologyV4Lineage(base.base),
    polarConsumer: stableRootLineage(base.polarConsumerRoot),
  });
}

function regionalEcologyV4Lineage(base: RegionalEcologyStateV5["base"]) {
  const v3 = base.base;
  const v2 = v3.base;
  const v1 = v2.base;
  return {
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
  };
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
): Omit<RegionalEcologyStateV6SourceOwnership, "layer"> {
  return deepFreeze({
    sourceKey,
    kind: CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    populationKeys: patch.populations.map(({ species, populationKey }) => (
      qualifiedPopulationKey(species, populationKey)
    )).concat(patch.aggregatePopulations.map(({ species, populationKey }) => (
      qualifiedPopulationKey(species, populationKey)
    ))).sort(compareText),
    actorIds: patch.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    )).sort(compareText),
    groupIds: patch.groups.groups.map(({ identity }) => identity.stableId).sort(compareText),
    aggregateIds: patch.aggregatePopulations.map(({ aggregateId }) => aggregateId)
      .sort(compareText),
    mortalityIds: patch.mortalityTransactions.map(({ mortalityId }) => mortalityId)
      .sort(compareText),
    bodyIds: patch.carcasses.map(({ carcassId }) => carcassId).sort(compareText),
  });
}

function v5ProjectionResidentInputs(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  if (
    !plainRecord(value)
    || !plainRecord(value.base)
    || !plainRecord(value.base.base)
    || !plainRecord(value.base.base.base)
    || !plainRecord(value.base.base.base.base)
    || !Array.isArray(value.base.base.base.base.residents)
    || !Array.isArray(value.base.base.base.alpineResidents)
    || !Array.isArray(value.base.base.polarShoreResidents)
    || !Array.isArray(value.base.coldShoreResidents)
    || !Array.isArray(value.polarConsumerResidents)
  ) return null;
  return combineResidentInputArrays([
    value.base.base.base.base.residents,
    value.base.base.base.alpineResidents,
    value.base.base.polarShoreResidents,
    value.base.coldShoreResidents,
    value.polarConsumerResidents,
  ]);
}

function v5ProjectionPatches(
  projection: RegionalEcologyStateV5ActiveProjection,
): readonly CoreEcologyAggregatePatchState[] {
  return v5ProjectionResidents(projection).map(({ patch }) => patch);
}

function v5ProjectionResidents(
  projection: RegionalEcologyStateV5ActiveProjection,
): readonly Readonly<{
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}>[] {
  return [
    ...projection.base.base.base.base.residents,
    ...projection.base.base.base.alpineResidents,
    ...projection.base.base.polarShoreResidents,
    ...projection.base.coldShoreResidents,
    ...projection.polarConsumerResidents,
  ].map(({ sourceKey, patch }) => Object.freeze({ sourceKey, patch }));
}

function v5CommitResidentInputs(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  if (
    !plainRecord(value)
    || !plainRecord(value.base)
    || !plainRecord(value.base.base)
    || !plainRecord(value.base.base.base)
    || !plainRecord(value.base.base.base.base)
    || !Array.isArray(value.base.base.base.base.residents)
    || !Array.isArray(value.base.base.base.alpineResidents)
    || !Array.isArray(value.base.base.polarShoreResidents)
    || !Array.isArray(value.base.coldShoreResidents)
    || !Array.isArray(value.polarConsumerResidents)
  ) return null;
  return combineResidentInputArrays([
    value.base.base.base.base.residents,
    value.base.base.base.alpineResidents,
    value.base.base.polarShoreResidents,
    value.base.coldShoreResidents,
    value.polarConsumerResidents,
  ]);
}

function combineResidentInputArrays(
  arrays: readonly (readonly unknown[])[],
): readonly RegionalEcologyResidentPatch[] | null {
  const output: RegionalEcologyResidentPatch[] = [];
  for (const value of arrays) {
    const residents = projectionResidentInputs(value);
    if (residents === null) return null;
    output.push(...residents);
  }
  return Object.freeze(output);
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
    ) return null;
    residents.push(Object.freeze({
      sourceKey: resident.sourceKey,
      patch: resident.patch as CoreEcologyAggregatePatchState,
    }));
  }
  return Object.freeze(residents);
}

function canonicalResidentOutputMap(
  value: readonly unknown[],
  tick?: number,
): Map<string, CoreEcologyAggregatePatchState> | null {
  const output = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of value) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || output.has(raw.sourceKey)
    ) return null;
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || patch.patchKey !== raw.sourceKey
      || (tick !== undefined && patch.updatedAtTick !== tick)
    ) return null;
    output.set(raw.sourceKey, patch);
  }
  return output;
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

function patchIds(patch: CoreEcologyAggregatePatchState): readonly string[] {
  return [
    ...patch.populations.map(({ species, populationKey }) => (
      qualifiedPopulationKey(species, populationKey)
    )),
    ...patch.aggregatePopulations.map(({ species, populationKey }) => (
      qualifiedPopulationKey(species, populationKey)
    )),
    ...patch.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    )),
    ...patch.groups.groups.map(({ identity }) => identity.stableId),
    ...patch.aggregatePopulations.map(({ aggregateId }) => aggregateId),
    ...patch.mortalityTransactions.map(({ mortalityId }) => mortalityId),
    ...patch.carcasses.map(({ carcassId }) => carcassId),
  ];
}

function qualifiedPopulationKey(species: string, populationKey: string): string {
  return `${species.length}:${species}:${populationKey}`;
}

function addOwnershipIds(
  target: Set<string>,
  ownership: RegionalEcologyStateV5SourceOwnership,
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

function projectedMaterializationTransitionIsHonored(
  projected: readonly Readonly<{
    readonly sourceKey: string;
    readonly patch: CoreEcologyAggregatePatchState;
  }>[],
  outputValue: unknown,
  inheritedMortalityAllowed: boolean,
): boolean {
  if (!Array.isArray(outputValue)) return false;
  const outputBySource = canonicalResidentOutputMap(outputValue);
  if (outputBySource === null || outputBySource.size !== projected.length) return false;
  for (const source of projected) {
    const output = outputBySource.get(source.sourceKey);
    if (output === undefined) return false;
    const selected = new Set(materializedActorIds(source.patch));
    const returned = new Set(materializedActorIds(output));
    if ([...returned].some((actorId) => !selected.has(actorId))) return false;
    if (!inheritedMortalityAllowed) {
      if (
        output.nextMortalityOrdinal !== 0
        || output.mortalityTransactions.length !== 0
        || output.carcasses.length !== 0
        || selected.size !== returned.size
      ) return false;
      continue;
    }
    const priorMortalityById = new Map(source.patch.mortalityTransactions.map(
      (transaction) => [transaction.mortalityId, transaction] as const,
    ));
    const outputMortalityById = new Map(output.mortalityTransactions.map(
      (transaction) => [transaction.mortalityId, transaction] as const,
    ));
    if ([...priorMortalityById].some(([mortalityId, transaction]) => (
      stableStringify(outputMortalityById.get(mortalityId)) !== stableStringify(transaction)
    ))) return false;
    const newlyRetired = new Set(output.mortalityTransactions
      .filter(({ mortalityId }) => !priorMortalityById.has(mortalityId))
      .map(({ retiredActor }) => retiredActor.identity.stableId));
    if (
      [...newlyRetired].some((actorId) => !selected.has(actorId))
      || [...selected].some((actorId) => (
        !returned.has(actorId) && !newlyRetired.has(actorId)
      ))
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
  value: Omit<RegionalEcologyStateV6, "integrity">,
): RegionalEcologyStateV6 {
  const state = deepFreeze({ ...value, integrity: hashCanonical(value) });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology v6 state exceeds the composite save budget");
  }
  TRUSTED_STATES.add(state);
  return state;
}

function copyRegion(region: RegionCoord): RegionCoord {
  return createRegionCoord(region.x, region.y);
}

function compareSnapshot(
  left: Pick<RegionalEcologyStateV6BreadthSnapshotV1, "sourceKey">,
  right: Pick<RegionalEcologyStateV6BreadthSnapshotV1, "sourceKey">,
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
