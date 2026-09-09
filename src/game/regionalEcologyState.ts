import { createRegionCoord, isRegionCoord, regionKey, type RegionCoord } from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_MAX_STEP_TICKS,
  advanceCoreEcologyDormantAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import type { CoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import {
  canonicalCoreEcologySettlementHomePatch,
} from "./coreEcologySettlementHome";
import {
  canonicalRegionalEcologyRootForWorld,
  canonicalizeRegionalEcologyRoot,
  regionalEcologyResidentDeviation,
  type RegionalEcologyRootV1,
} from "./regionalEcology";
import {
  canonicalRegionalEcologyLegacyCohortPatchForWorld,
  canonicalRegionalEcologyLegacyCohortTransition,
} from "./regionalEcologyLegacyCohort";
import {
  canonicalCoreEcologyRegionalResidentPatchForRoot,
  createCoreEcologyRegionalResidentPatchForRoot,
} from "./regionalEcologyResidents";
import { coreEcologySpeciesCanGuardCarcass } from "./coreEcologySpeciesRuntimePolicy";
import {
  setRegionalEcologyMaterializationForWindow,
  type RegionalEcologyResidentPatch,
} from "./regionalEcologyRuntime";
import type { CoreWildlifeActorState } from "./coreWildlifeActor";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  worldPositionDelta,
} from "./worldPosition";

export const REGIONAL_ECOLOGY_STATE_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_STATE_OWNER_ID = "game:regional-ecology-state:v1" as const;
export const REGIONAL_ECOLOGY_STATE_SNAPSHOT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_ACTIVE_PROJECTION_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_ACTIVE_REGION_LIMIT = 9 as const;
export const REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES = 32 * 1_024 * 1_024;

const UTF8_ENCODER = new TextEncoder();
const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const TRUSTED_STATES = new WeakSet<object>();
const TRUSTED_PROJECTIONS = new WeakSet<object>();

export type RegionalEcologyStateSourceKind =
  | "settlement-home"
  | "regional-habitat"
  | "legacy-cohort";

export type RegionalEcologyActiveSourceKind = Exclude<
  RegionalEcologyStateSourceKind,
  "settlement-home"
>;

/**
 * One canonical coarse save snapshot. Runtime materialization is deliberately
 * absent: it is a bounded projection of this state, never a second authority.
 */
export interface RegionalEcologyResidentSnapshotV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_SNAPSHOT_VERSION;
  readonly kind: RegionalEcologyStateSourceKind;
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly integrity: string;
}

export interface RegionalEcologyStateV1 {
  readonly version: typeof REGIONAL_ECOLOGY_STATE_VERSION;
  readonly ownerId: typeof REGIONAL_ECOLOGY_STATE_OWNER_ID;
  readonly updatedAtTick: number;
  readonly root: RegionalEcologyRootV1;
  /** Compatibility settlement/domestic owner; it exists exactly once. */
  readonly settlementHome: RegionalEcologyResidentSnapshotV1;
  /** Canonical storage-region neighborhood represented by this hot view. */
  readonly activeRegions: readonly RegionCoord[];
  /** Honest empty regions have no snapshot. */
  readonly activeResidents: readonly RegionalEcologyResidentSnapshotV1[];
  readonly integrity: string;
}

export interface RegionalEcologySettlementHomeInput {
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalEcologyActiveResidentInput {
  readonly kind: RegionalEcologyActiveSourceKind;
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface CreateRegionalEcologyStateInput {
  readonly root: RegionalEcologyRootV1;
  readonly settlementHome: RegionalEcologySettlementHomeInput;
  readonly activeRegions: readonly RegionCoord[];
  readonly activeResidents: readonly RegionalEcologyActiveResidentInput[];
}

export interface RegionalEcologyStateWorldBinding {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
  readonly settlementHomeHabitat: CoreEcologyRegionalPredatorHabitatAssemblage;
}

export interface ReplaceRegionalEcologyActiveStateInput
  extends CreateRegionalEcologyStateInput {
  /** Optimistic transaction fence; stale view writers fail closed. */
  readonly expectedIntegrity: string;
  readonly rootSeed: RootSeed;
}

export interface RegionalEcologySourceOwnershipV1 {
  readonly sourceKey: string;
  readonly kind: RegionalEcologyStateSourceKind;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly populationKeys: readonly string[];
  readonly actorIds: readonly string[];
  readonly groupIds: readonly string[];
  readonly aggregateIds: readonly string[];
  readonly mortalityIds: readonly string[];
  readonly bodyIds: readonly string[];
}

export interface RegionalEcologyProjectedResidentV1
  extends RegionalEcologyResidentPatch {
  readonly kind: RegionalEcologyStateSourceKind;
  readonly region: RegionCoord;
  readonly sourcePatchHash: string;
  readonly projectedPatchHash: string;
}

/**
 * Strictly transient root-wide projection. No serializer is provided, and a
 * save envelope must contain RegionalEcologyStateV1 instead.
 */
export interface RegionalEcologyActiveProjectionV1 {
  readonly version: typeof REGIONAL_ECOLOGY_ACTIVE_PROJECTION_VERSION;
  readonly ownerId: "game:regional-ecology-active-projection:v1";
  readonly stateIntegrity: string;
  readonly atTick: number;
  readonly residents: readonly RegionalEcologyProjectedResidentV1[];
  readonly integrity: string;
}

export interface CommitRegionalEcologyActiveProjectionInput {
  readonly root: RegionalEcologyRootV1;
  /** Rebinds the root and every receipt-owned legacy transition to this world. */
  readonly rootSeed: RootSeed;
  /**
   * Required when the home source is outside the projection and time advanced;
   * forbidden when that source is already present in residents.
   */
  readonly settlementHome: RegionalEcologyResidentPatch | null;
  /** Exactly one result for every projected source; no partial commit. */
  readonly residents: readonly RegionalEcologyResidentPatch[];
}

export function createRegionalEcologyState(
  input: CreateRegionalEcologyStateInput,
): RegionalEcologyStateV1 {
  if (!plainRecord(input) || !exactKeys(input, [
    "activeRegions",
    "activeResidents",
    "root",
    "settlementHome",
  ])) throw new TypeError("Regional ecology state input is malformed");
  const root = canonicalizeRegionalEcologyRoot(input.root);
  if (root === null || stableStringify(root) !== stableStringify(input.root)) {
    throw new TypeError("Regional ecology state requires one canonical root");
  }
  if (!Array.isArray(input.activeRegions) || !Array.isArray(input.activeResidents)) {
    throw new TypeError("Regional ecology active state must be arrays");
  }
  const activeRegions = canonicalRegions(input.activeRegions);
  if (
    activeRegions.length === 0
    || activeRegions.length > REGIONAL_ECOLOGY_ACTIVE_REGION_LIMIT
  ) throw new RangeError("Regional ecology active neighborhood is empty or oversized");
  const settlementHome = createSnapshot(
    "settlement-home",
    input.settlementHome,
    root.updatedAtTick,
  );
  const activeResidents = input.activeResidents.map((resident) => {
    if (!plainRecord(resident) || !exactKeys(resident, ["kind", "patch", "sourceKey"])) {
      throw new TypeError("Regional ecology active resident input is malformed");
    }
    if (resident.kind !== "regional-habitat" && resident.kind !== "legacy-cohort") {
      throw new TypeError("Regional ecology active resident kind is unsupported");
    }
    return createSnapshot(resident.kind, {
      sourceKey: resident.sourceKey,
      patch: resident.patch,
    }, root.updatedAtTick);
  }).sort(compareSnapshot);
  if (!validStateSources(root, settlementHome, activeRegions, activeResidents)) {
    throw new RangeError(
      "Regional ecology sources overlap, contain invalid references, or escape the active neighborhood",
    );
  }
  return sealState({
    version: REGIONAL_ECOLOGY_STATE_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_OWNER_ID,
    updatedAtTick: root.updatedAtTick,
    root,
    settlementHome,
    activeRegions,
    activeResidents,
  });
}

export function canonicalizeRegionalEcologyState(
  value: unknown,
): RegionalEcologyStateV1 | null {
  if (typeof value === "object" && value !== null && TRUSTED_STATES.has(value)) {
    return value as RegionalEcologyStateV1;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "activeRegions",
    "activeResidents",
    "integrity",
    "ownerId",
    "root",
    "settlementHome",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_STATE_VERSION
    || value.ownerId !== REGIONAL_ECOLOGY_STATE_OWNER_ID
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.activeRegions)
    || !Array.isArray(value.activeResidents)
    || !validHash(value.integrity)
  ) return null;
  const root = canonicalizeRegionalEcologyRoot(value.root);
  const activeRegions = canonicalRegionsOrNull(value.activeRegions);
  const settlementHome = canonicalSnapshot(value.settlementHome, value.updatedAtTick);
  if (
    root === null
    || stableStringify(root) !== stableStringify(value.root)
    || root.updatedAtTick !== value.updatedAtTick
    || activeRegions === null
    || activeRegions.length === 0
    || activeRegions.length > REGIONAL_ECOLOGY_ACTIVE_REGION_LIMIT
    || stableStringify(activeRegions) !== stableStringify(value.activeRegions)
    || settlementHome === null
    || settlementHome.kind !== "settlement-home"
  ) return null;
  const activeResidents: RegionalEcologyResidentSnapshotV1[] = [];
  for (const raw of value.activeResidents) {
    const resident = canonicalSnapshot(raw, value.updatedAtTick);
    if (
      resident === null
      || (resident.kind !== "regional-habitat" && resident.kind !== "legacy-cohort")
    ) return null;
    activeResidents.push(resident);
  }
  activeResidents.sort(compareSnapshot);
  if (
    stableStringify(activeResidents) !== stableStringify(value.activeResidents)
    || !validStateSources(root, settlementHome, activeRegions, activeResidents)
  ) return null;
  const base = {
    version: REGIONAL_ECOLOGY_STATE_VERSION,
    ownerId: REGIONAL_ECOLOGY_STATE_OWNER_ID,
    updatedAtTick: value.updatedAtTick,
    root,
    settlementHome,
    activeRegions,
    activeResidents: Object.freeze(activeResidents),
  };
  if (hashCanonical(base) !== value.integrity) return null;
  const state = deepFreeze({ ...base, integrity: value.integrity });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES) return null;
  TRUSTED_STATES.add(state);
  return state;
}

/**
 * Save/runtime trust boundary. Structural seals alone cannot prove which
 * seeded world a resident belongs to, so every source is rebound to the
 * canonical world derivation before a v25 state is accepted.
 */
export function canonicalRegionalEcologyStateForWorld(
  value: unknown,
  binding: RegionalEcologyStateWorldBinding,
): RegionalEcologyStateV1 | null {
  if (
    !plainRecord(binding)
    || !nonnegativeSafeInteger(binding.completedTick)
  ) return null;
  const state = canonicalizeRegionalEcologyState(value);
  if (state === null || state.updatedAtTick !== binding.completedTick) return null;
  const root = canonicalRegionalEcologyRootForWorld(state.root, {
    rootSeed: binding.rootSeed,
    completedTick: binding.completedTick,
  });
  if (root === null) return null;
  const home = canonicalCoreEcologySettlementHomePatch(
    state.settlementHome.patch,
    {
      seed: binding.rootSeed,
      habitat: binding.settlementHomeHabitat,
      completedTick: binding.completedTick,
    },
  );
  if (home === null || home.patchKey !== state.settlementHome.sourceKey) return null;
  const activeRegionKeys = new Set(state.activeRegions.map(regionKey));
  for (const resident of state.activeResidents) {
    if (resident.kind === "regional-habitat") {
      const patch = canonicalCoreEcologyRegionalResidentPatchForRoot(resident.patch, {
        seed: binding.rootSeed,
        root,
        region: resident.region,
        completedTick: binding.completedTick,
      });
      if (patch === null || patch.patchKey !== resident.sourceKey) return null;
      if (!activeRegionKeys.has(regionKey(resident.region))) {
        const deviation = regionalEcologyResidentDeviation(
          root,
          binding.rootSeed,
          resident.region,
        );
        if (
          deviation === null
          || deviation.patchKey !== patch.patchKey
          || sourceLineageHash(deviation) !== resident.lineageHash
        ) {
          return null;
        }
      }
      continue;
    }
    const patch = canonicalRegionalEcologyLegacyCohortPatchForWorld(
      resident.patch,
      {
        rootSeed: binding.rootSeed,
        root,
        completedTick: binding.completedTick,
      },
    );
    if (patch === null || patch.patchKey !== resident.sourceKey) return null;
  }
  const legacyCount = state.activeResidents.filter(({ kind }) => (
    kind === "legacy-cohort"
  )).length;
  if ((root.legacyCohort === null && legacyCount !== 0)
    || (root.legacyCohort !== null && legacyCount !== 1)) return null;
  return state;
}

export function serializeRegionalEcologyState(value: unknown): string {
  const state = canonicalizeRegionalEcologyState(value);
  if (state === null) throw new TypeError("Regional ecology state is malformed");
  const text = stableStringify(state);
  if (UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology state exceeds its save budget");
  }
  return text;
}

export function deserializeRegionalEcologyState(text: unknown): RegionalEcologyStateV1 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeRegionalEcologyState(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

/**
 * Atomically exchange the hot neighborhood. The regional root remains the
 * sole durable deviation owner; these snapshots are exact reload continuity.
 */
export function replaceRegionalEcologyActiveState(
  value: unknown,
  input: ReplaceRegionalEcologyActiveStateInput,
): RegionalEcologyStateV1 {
  const prior = canonicalizeRegionalEcologyState(value);
  if (prior === null) throw new TypeError("Prior regional ecology state is malformed");
  if (!plainRecord(input) || !exactKeys(input, [
    "activeRegions",
    "activeResidents",
    "expectedIntegrity",
    "root",
    "rootSeed",
    "settlementHome",
  ]) || input.expectedIntegrity !== prior.integrity) {
    throw new RangeError("Regional ecology active replacement is stale or malformed");
  }
  const root = canonicalRegionalEcologyRootForWorld(input.root, {
    rootSeed: input.rootSeed,
    completedTick: prior.updatedAtTick,
  });
  if (
    root === null
    || input.settlementHome.sourceKey !== prior.settlementHome.sourceKey
    || stableStringify(input.settlementHome.patch) !== stableStringify(prior.settlementHome.patch)
  ) throw new RangeError("Regional ecology replacement lost bound root or home state");
  requireDurableRegionalReplacement(prior, input, root);
  const next = createRegionalEcologyState({
    root,
    settlementHome: input.settlementHome,
    activeRegions: input.activeRegions,
    activeResidents: input.activeResidents,
  });
  requireStateTransition(prior, next, input.rootSeed);
  return next;
}

/** Canonical all-coarse form used by the v25 save owner. */
export function normalizeRegionalEcologyResidentPatchForStorage(
  value: unknown,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  if (!nonnegativeSafeInteger(atTick)) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null || patch.updatedAtTick !== atTick) return null;
  try {
    return setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick,
      actorIds: [],
    });
  } catch {
    return null;
  }
}

/**
 * Current physical regions occupied by one lineage owner. Lineage origin is
 * deliberately absent: a source remains hot because a living body, group,
 * aggregate, or unretired carcass is there, never merely because it was born
 * there.
 */
export function regionalEcologyPatchResidenceRegions(
  value: unknown,
): readonly RegionCoord[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null) return null;
  const regions: RegionCoord[] = [];
  for (const population of patch.populations) {
    for (const member of population.members) {
      regions.push(member.actor.address.position.region);
    }
  }
  for (const group of patch.groups.groups) {
    regions.push(group.rendezvousAnchor.region);
    for (const component of group.components) regions.push(component.anchor.region);
  }
  for (const population of patch.aggregatePopulations) {
    for (const anchor of population.anchors) regions.push(anchor.position.region);
  }
  for (const carcass of patch.carcasses) {
    if (carcass.retiredAtTick === null) regions.push(carcass.deathPosition.region);
  }
  return canonicalRegionsOrNull(regions) ?? Object.freeze([]);
}

/**
 * Derive every regional owner required by a hot spatial neighborhood. The
 * usual seeded owner is selected by lineage origin; durable deviated owners
 * are additionally selected by current residence. Bodies never transfer
 * between owners at this boundary.
 */
export function regionalEcologyRegionalResidentsForActiveRegions(
  rootValue: unknown,
  rootSeed: RootSeed,
  regionsValue: readonly RegionCoord[],
): readonly RegionalEcologyActiveResidentInput[] | null {
  const structuralRoot = canonicalizeRegionalEcologyRoot(rootValue);
  if (structuralRoot === null || !Array.isArray(regionsValue)) return null;
  const root = canonicalRegionalEcologyRootForWorld(structuralRoot, {
    rootSeed,
    completedTick: structuralRoot.updatedAtTick,
  });
  const activeRegions = canonicalRegionsOrNull(regionsValue);
  if (
    root === null
    || activeRegions === null
    || activeRegions.length === 0
    || activeRegions.length > REGIONAL_ECOLOGY_ACTIVE_REGION_LIMIT
  ) return null;
  const activeKeys = new Set(activeRegions.map(regionKey));
  const bySource = new Map<string, RegionalEcologyActiveResidentInput>();
  const admit = (storedPatch: CoreEcologyAggregatePatchState): boolean => {
    const patch = advanceDormantRegionalPatchToTick(storedPatch, root.updatedAtTick);
    if (patch === null) return false;
    if (bySource.has(patch.patchKey)) return false;
    bySource.set(patch.patchKey, Object.freeze({
      kind: "regional-habitat" as const,
      sourceKey: patch.patchKey,
      patch,
    }));
    return true;
  };

  for (const region of activeRegions) {
    const deviation = regionalEcologyResidentDeviation(root, rootSeed, region);
    const patch = deviation ?? createCoreEcologyRegionalResidentPatchForRoot({
      seed: rootSeed,
      root,
      region,
    });
    if (patch !== null && !admit(patch)) return null;
  }
  for (const delta of root.regions) {
    const patch = delta.residentPatch;
    if (patch === null || activeKeys.has(delta.key)) continue;
    const residence = regionalEcologyPatchResidenceRegions(patch);
    if (residence === null) return null;
    if (!residence.some((region) => activeKeys.has(regionKey(region)))) continue;
    if (!admit(patch)) return null;
  }
  return Object.freeze([...bySource.values()].sort((left, right) => (
    compareText(left.sourceKey, right.sourceKey)
  )));
}

/**
 * True only for a clock/physiology-only step of an otherwise pristine owner.
 * Physical movement, learned observations, injuries, group changes, evidence,
 * mortality, bodies, and claims are all part of the compared durable signal.
 */
export function regionalEcologyResidentTransitionIsVisitationOnly(
  beforeValue: unknown,
  afterValue: unknown,
): boolean {
  const before = canonicalizeCoreEcologyAggregatePatch(beforeValue);
  const after = canonicalizeCoreEcologyAggregatePatch(afterValue);
  if (
    before === null
    || after === null
    || after.updatedAtTick <= before.updatedAtTick
    || before.patchKey !== after.patchKey
  ) return false;
  return stableStringify(regionalResidentDurableSignal(before))
    === stableStringify(regionalResidentDurableSignal(after));
}

/** Sources actually resident in the current spatial neighborhood. */
export function regionalEcologyActiveResidentPatches(
  value: unknown,
): readonly RegionalEcologyResidentPatch[] | null {
  const state = canonicalizeRegionalEcologyState(value);
  if (state === null) return null;
  const activeRegionKeys = new Set(state.activeRegions.map(regionKey));
  const snapshots = [
    ...(snapshotResidesInActiveRegions(state.settlementHome, activeRegionKeys)
      ? [state.settlementHome]
      : []),
    ...state.activeResidents,
  ].sort(compareSnapshot);
  return Object.freeze(snapshots.map(({ sourceKey, patch }) => Object.freeze({
    sourceKey,
    patch,
  })));
}

/**
 * Exact canonical snapshots participating in the current transient projection.
 * Regional and receipt-bound sources remain active as stored; settlement home
 * joins only while its physical residence intersects the hot neighborhood.
 */
export function regionalEcologyActiveSourceSnapshots(
  value: unknown,
): readonly RegionalEcologyResidentSnapshotV1[] | null {
  const state = canonicalizeRegionalEcologyState(value);
  return state === null ? null : activeSnapshots(state);
}

/** Stable ownership manifest used by future transient combine/split work. */
export function regionalEcologySourceOwnership(
  value: unknown,
  activeOnly = false,
): readonly RegionalEcologySourceOwnershipV1[] | null {
  const state = canonicalizeRegionalEcologyState(value);
  if (state === null) return null;
  const activeRegionKeys = new Set(state.activeRegions.map(regionKey));
  const sources = activeOnly
    ? [
        ...(snapshotResidesInActiveRegions(state.settlementHome, activeRegionKeys)
          ? [state.settlementHome]
          : []),
        ...state.activeResidents,
      ]
    : [state.settlementHome, ...state.activeResidents];
  return Object.freeze(sources.map(sourceOwnership).sort((left, right) => (
    compareText(left.sourceKey, right.sourceKey)
  )));
}

/**
 * Apply the one global group-atomic materialization plan while retaining an
 * authenticated map back to each canonical source snapshot.
 */
export function projectRegionalEcologyActiveState(
  value: unknown,
  window: CoreEcologyRuntimeWindow,
): RegionalEcologyActiveProjectionV1 | null {
  const state = canonicalizeRegionalEcologyState(value);
  if (state === null) return null;
  const sources = activeSnapshots(state);
  const materialized = setRegionalEcologyMaterializationForWindow(
    sources.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
    window,
    state.updatedAtTick,
  );
  if (materialized === null || materialized.length !== sources.length) return null;
  return bindRegionalEcologyActiveProjection(state, materialized);
}

/**
 * Bind one externally planned, root-wide materialization split back to this
 * V1 state's exact source snapshots. Only the transient materialization bit may
 * differ: same-tick all-coarse normalization must reproduce every source byte.
 */
export function bindRegionalEcologyActiveProjection(
  value: unknown,
  materializedResidentsValue: unknown,
): RegionalEcologyActiveProjectionV1 | null {
  const state = canonicalizeRegionalEcologyState(value);
  if (state === null || !Array.isArray(materializedResidentsValue)) return null;
  const sources = activeSnapshots(state);
  if (materializedResidentsValue.length !== sources.length) return null;
  const sourceByKey = new Map(sources.map((source) => [source.sourceKey, source]));
  const materializedBySource = new Map<string, CoreEcologyAggregatePatchState>();
  let materializedActorCount = 0;
  for (const raw of materializedResidentsValue) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["patch", "sourceKey"])
      || typeof raw.sourceKey !== "string"
      || materializedBySource.has(raw.sourceKey)
    ) return null;
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
    const materializedActorIds = projected.populations.flatMap(({ members }) => (
      members.filter(({ materialization }) => materialization === "materialized")
        .map(({ actor }) => actor.identity.stableId)
    ));
    materializedActorCount += materializedActorIds.length;
    if (materializedActorCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS) return null;
    let sourceWithMaterialization: CoreEcologyAggregatePatchState;
    try {
      // Replaying the exact split from the canonical all-coarse snapshot is a
      // stronger normalization check than stripping the bit afterward: it
      // also authenticates transient group anchors and rematerialized poses.
      sourceWithMaterialization = setCoreEcologyAggregatePatchMaterializedActors(
        source.patch,
        { atTick: state.updatedAtTick, actorIds: materializedActorIds },
      );
    } catch {
      return null;
    }
    if (stableStringify(projected) !== stableStringify(sourceWithMaterialization)) return null;
    materializedBySource.set(raw.sourceKey, projected);
  }
  if (materializedBySource.size !== sourceByKey.size) return null;
  const residents: RegionalEcologyProjectedResidentV1[] = [];
  for (const source of sources) {
    const projected = materializedBySource.get(source.sourceKey);
    if (projected === undefined) return null;
    residents.push(deepFreeze({
      kind: source.kind,
      sourceKey: source.sourceKey,
      region: copyRegion(source.region),
      sourcePatchHash: source.patchHash,
      projectedPatchHash: hashCanonical(projected),
      patch: projected,
    }));
  }
  residents.sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  const base = {
    version: REGIONAL_ECOLOGY_ACTIVE_PROJECTION_VERSION,
    ownerId: "game:regional-ecology-active-projection:v1" as const,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    residents: Object.freeze(residents),
  };
  const projection = deepFreeze({ ...base, integrity: hashCanonical(base) });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

/**
 * Commit every projected source or none. An unchanged same-tick projection is
 * restored to its exact pre-materialization snapshot, so merely opening or
 * moving a view cannot manufacture a durable ecology mutation.
 */
export function commitRegionalEcologyActiveProjection(
  stateValue: unknown,
  projectionValue: unknown,
  input: CommitRegionalEcologyActiveProjectionInput,
): RegionalEcologyStateV1 | null {
  const state = canonicalizeRegionalEcologyState(stateValue);
  if (state === null || !plainRecord(input) || !exactKeys(input, [
    "residents",
    "root",
    "rootSeed",
    "settlementHome",
  ]) || !Array.isArray(input.residents)) return null;
  const projection = canonicalProjection(projectionValue, state);
  const structuralRoot = canonicalizeRegionalEcologyRoot(input.root);
  const root = structuralRoot === null
    ? null
    : canonicalRegionalEcologyRootForWorld(structuralRoot, {
        rootSeed: input.rootSeed,
        completedTick: structuralRoot.updatedAtTick,
      });
  if (
    projection === null
    || root === null
    || stableStringify(root) !== stableStringify(input.root)
    || root.updatedAtTick < projection.atTick
  ) return null;
  const projectedBySource = new Map(projection.residents.map((entry) => [entry.sourceKey, entry]));
  const outputBySource = new Map<string, CoreEcologyAggregatePatchState>();
  for (const raw of input.residents) {
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
      || patch.updatedAtTick !== root.updatedAtTick
      || !projectedBySource.has(raw.sourceKey)
    ) return null;
    outputBySource.set(raw.sourceKey, patch);
  }
  if (outputBySource.size !== projectedBySource.size) return null;

  const originalBySource = new Map(activeSnapshots(state).map((entry) => [entry.sourceKey, entry]));
  const nextSnapshots = new Map<string, RegionalEcologyResidentSnapshotV1>();
  for (const projected of projection.residents) {
    const original = originalBySource.get(projected.sourceKey);
    const output = outputBySource.get(projected.sourceKey);
    if (original === undefined || output === undefined) return null;
    const presentationOnly = root.updatedAtTick === projection.atTick
      && hashCanonical(output) === projected.projectedPatchHash;
    const normalizedOutput = normalizeRegionalEcologyResidentPatchForStorage(
      output,
      root.updatedAtTick,
    );
    if (normalizedOutput === null) return null;
    let committedPatch = normalizedOutput;
    if (
      projected.kind === "regional-habitat"
      && root.updatedAtTick > projection.atTick
      && regionalPatchMatchesPristineRoot(original.patch, state.root, input.rootSeed)
      && regionalEcologyResidentTransitionIsVisitationOnly(original.patch, normalizedOutput)
    ) {
      const refreshed = createCoreEcologyRegionalResidentPatchForRoot({
        seed: input.rootSeed,
        root,
        region: original.region,
      });
      if (refreshed === null) return null;
      committedPatch = refreshed;
    }
    const next = presentationOnly
      ? original
      : createSnapshot(projected.kind, {
          sourceKey: projected.sourceKey,
          patch: committedPatch,
        }, root.updatedAtTick);
    if (
      next.lineageHash !== original.lineageHash
      || next.kind !== original.kind
      || regionKey(next.region) !== regionKey(original.region)
    ) return null;
    nextSnapshots.set(next.sourceKey, next);
  }

  const homeWasActive = projectedBySource.has(state.settlementHome.sourceKey);
  let settlementHome: RegionalEcologyResidentSnapshotV1;
  if (homeWasActive) {
    if (input.settlementHome !== null) return null;
    const nextHome = nextSnapshots.get(state.settlementHome.sourceKey);
    if (nextHome === undefined || nextHome.kind !== "settlement-home") return null;
    settlementHome = nextHome;
  } else if (input.settlementHome === null) {
    if (root.updatedAtTick !== state.updatedAtTick) return null;
    settlementHome = state.settlementHome;
  } else {
    if (
      !plainRecord(input.settlementHome)
      || !exactKeys(input.settlementHome, ["patch", "sourceKey"])
    ) return null;
    settlementHome = createSnapshot(
      "settlement-home",
      input.settlementHome,
      root.updatedAtTick,
    );
    if (
      settlementHome.sourceKey !== state.settlementHome.sourceKey
      || settlementHome.lineageHash !== state.settlementHome.lineageHash
      || regionKey(settlementHome.region) !== regionKey(state.settlementHome.region)
    ) return null;
  }
  const activeResidents = state.activeResidents.map((resident) => {
    const next = nextSnapshots.get(resident.sourceKey);
    if (next === undefined || next.kind === "settlement-home") {
      throw new Error("Regional ecology projection lost an active source");
    }
    return next;
  });
  let result: RegionalEcologyStateV1;
  try {
    result = createRegionalEcologyState({
      root,
      settlementHome: {
        sourceKey: settlementHome.sourceKey,
        patch: settlementHome.patch,
      },
      activeRegions: state.activeRegions,
      activeResidents: activeResidents.map(({ kind, sourceKey, patch }) => ({
        kind: kind as RegionalEcologyActiveSourceKind,
        sourceKey,
        patch,
      })),
    });
    requireStateTransition(state, result, input.rootSeed);
  } catch {
    return null;
  }
  return result;
}

function createSnapshot(
  kind: RegionalEcologyStateSourceKind,
  input: unknown,
  tick: number,
): RegionalEcologyResidentSnapshotV1 {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["patch", "sourceKey"])
    || typeof input.sourceKey !== "string"
  ) throw new TypeError("Regional ecology resident source is malformed");
  const patch = normalizeRegionalEcologyResidentPatchForStorage(input.patch, tick);
  if (patch === null || patch.patchKey !== input.sourceKey) {
    throw new RangeError("Regional ecology resident source does not own its canonical patch");
  }
  if (kind === "regional-habitat" && !isRegionalHabitatDerivation(patch)) {
    throw new RangeError("Regional habitat resident does not use regional habitat derivation");
  }
  if (kind === "settlement-home" && patch.derivation.kind !== "settlement-home-v1") {
    throw new RangeError("Settlement home does not use settlement-home derivation");
  }
  if (kind === "legacy-cohort" && patch.derivation.kind !== "legacy-cohort-v1") {
    throw new RangeError("Legacy cohort does not use receipt-bound legacy derivation");
  }
  if (
    kind === "regional-habitat"
    && patch.populations.length === 0
    && patch.aggregatePopulations.length === 0
    && patch.mortalityTransactions.length === 0
    && patch.carcasses.length === 0
  ) throw new RangeError("Honestly empty regional habitat must not create a hot snapshot");
  const base: Omit<RegionalEcologyResidentSnapshotV1, "integrity"> = {
    version: REGIONAL_ECOLOGY_STATE_SNAPSHOT_VERSION,
    kind,
    sourceKey: input.sourceKey,
    region: copyRegion(patch.originRegion),
    patchHash: hashCanonical(patch),
    lineageHash: sourceLineageHash(patch),
    patch,
  };
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

function isRegionalHabitatDerivation(patch: CoreEcologyAggregatePatchState): boolean {
  return patch.derivation.kind === "regional-habitat-v1"
    || patch.derivation.kind === "regional-habitat-v1-with-adoption-suppression";
}

function canonicalSnapshot(
  value: unknown,
  tick: number,
): RegionalEcologyResidentSnapshotV1 | null {
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
    value.version !== REGIONAL_ECOLOGY_STATE_SNAPSHOT_VERSION
    || (value.kind !== "settlement-home"
      && value.kind !== "regional-habitat"
      && value.kind !== "legacy-cohort")
    || typeof value.sourceKey !== "string"
    || !isRegionCoord(value.region)
    || !validHash(value.patchHash)
    || !validHash(value.lineageHash)
    || !validHash(value.integrity)
  ) return null;
  const patch = normalizeRegionalEcologyResidentPatchForStorage(value.patch, tick);
  if (
    patch === null
    || patch.patchKey !== value.sourceKey
    || stableStringify(patch) !== stableStringify(value.patch)
    || regionKey(patch.originRegion) !== regionKey(value.region)
    || value.patchHash !== hashCanonical(patch)
    || value.lineageHash !== sourceLineageHash(patch)
    || (value.kind === "regional-habitat" && !isRegionalHabitatDerivation(patch))
    || (value.kind === "settlement-home" && patch.derivation.kind !== "settlement-home-v1")
    || (value.kind === "legacy-cohort" && patch.derivation.kind !== "legacy-cohort-v1")
    || (value.kind === "regional-habitat"
      && patch.populations.length === 0
      && patch.aggregatePopulations.length === 0
      && patch.mortalityTransactions.length === 0
      && patch.carcasses.length === 0)
  ) return null;
  const base: Omit<RegionalEcologyResidentSnapshotV1, "integrity"> = {
    version: REGIONAL_ECOLOGY_STATE_SNAPSHOT_VERSION,
    kind: value.kind,
    sourceKey: value.sourceKey,
    region: copyRegion(value.region),
    patchHash: value.patchHash,
    lineageHash: value.lineageHash,
    patch,
  };
  return hashCanonical(base) === value.integrity
    ? deepFreeze({ ...base, integrity: value.integrity })
    : null;
}

function validStateSources(
  root: RegionalEcologyRootV1,
  settlementHome: RegionalEcologyResidentSnapshotV1,
  activeRegions: readonly RegionCoord[],
  activeResidents: readonly RegionalEcologyResidentSnapshotV1[],
): boolean {
  if (
    settlementHome.kind !== "settlement-home"
    || activeResidents.some(({ kind }) => kind === "settlement-home")
  ) return false;
  const activeKeys = new Set(activeRegions.map(regionKey));
  const sourceKeys = new Set<string>();
  const regionalKeys = new Set<string>();
  let legacyCount = 0;
  const ownership = {
    populationKeys: new Set<string>(),
    actorIds: new Set<string>(),
    groupIds: new Set<string>(),
    aggregateIds: new Set<string>(),
    mortalityIds: new Set<string>(),
    bodyIds: new Set<string>(),
  };
  for (const source of [settlementHome, ...activeResidents]) {
    if (sourceKeys.has(source.sourceKey)) return false;
    sourceKeys.add(source.sourceKey);
    if (source.kind === "regional-habitat") {
      const key = regionKey(source.region);
      const residence = regionalEcologyPatchResidenceRegions(source.patch);
      if (
        residence === null
        || (!activeKeys.has(key)
          && !residence.some((region) => activeKeys.has(regionKey(region))))
      ) return false;
      if (regionalKeys.has(key)) return false;
      regionalKeys.add(key);
    } else if (source.kind === "legacy-cohort") {
      legacyCount += 1;
      if (legacyCount > 1) return false;
    }
    const manifest = sourceOwnership(source);
    if (
      overlaps(ownership.populationKeys, manifest.populationKeys)
      || overlaps(ownership.actorIds, manifest.actorIds)
      || overlaps(ownership.groupIds, manifest.groupIds)
      || overlaps(ownership.aggregateIds, manifest.aggregateIds)
      || overlaps(ownership.mortalityIds, manifest.mortalityIds)
      || overlaps(ownership.bodyIds, manifest.bodyIds)
    ) return false;
  }
  return validRootWideActorReferences(root, settlementHome, activeResidents);
}

interface RegionalEcologyReferenceOwner {
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

type RegionalEcologyActorLineage = Readonly<{
  readonly ownerSourceKey: string;
  readonly actor: CoreWildlifeActorState;
  readonly status: "living";
}> | Readonly<{
  readonly ownerSourceKey: string;
  readonly actor: CoreWildlifeActorState;
  readonly status: "mortality-retired";
  readonly retirementAtTick: number;
  readonly retirementAttackerId: string;
}> | Readonly<{
  readonly ownerSourceKey: "migration:compatibility-retirement";
  readonly actor: CoreWildlifeActorState;
  readonly status: "compatibility-retired";
  readonly retirementAtTick: number;
}>;

/**
 * Patch canonicalization can prove local references, but regional owners may
 * lawfully retain a historical attacker or a current body claimant owned by a
 * different source. The save root therefore closes those references once,
 * over the latest included version of every owner. Active snapshots supersede
 * an older byte of the same sparse-root owner; they are not two lineages.
 */
function validRootWideActorReferences(
  root: RegionalEcologyRootV1,
  settlementHome: RegionalEcologyResidentSnapshotV1,
  activeResidents: readonly RegionalEcologyResidentSnapshotV1[],
): boolean {
  const owners = rootWideReferenceOwners(root, settlementHome, activeResidents);
  if (owners === null) return false;

  const actorLineage = new Map<string, RegionalEcologyActorLineage>();
  const populationKeys = new Set<string>();
  const groupIds = new Set<string>();
  const aggregateIds = new Set<string>();
  const mortalityIds = new Set<string>();
  const mortalityEventIds = new Set<string>();
  const bodyIds = new Set<string>();
  const claimProvenanceIds = new Set<string>();
  for (const owner of owners) {
    for (const population of owner.patch.populations) {
      const populationKey = `${population.species.length}:${population.species}:${population.populationKey}`;
      if (populationKeys.has(populationKey)) return false;
      populationKeys.add(populationKey);
      for (const member of population.members) {
        const actorId = member.actor.identity.stableId;
        if (actorLineage.has(actorId)) return false;
        actorLineage.set(actorId, Object.freeze({
          ownerSourceKey: owner.sourceKey,
          actor: member.actor,
          status: "living" as const,
        }));
      }
    }
    for (const group of owner.patch.groups.groups) {
      if (groupIds.has(group.identity.stableId)) return false;
      groupIds.add(group.identity.stableId);
    }
    for (const aggregate of owner.patch.aggregatePopulations) {
      if (aggregateIds.has(aggregate.aggregateId)) return false;
      aggregateIds.add(aggregate.aggregateId);
    }
    for (const transaction of owner.patch.mortalityTransactions) {
      const actorId = transaction.retiredActor.identity.stableId;
      if (
        actorLineage.has(actorId)
        || mortalityIds.has(transaction.mortalityId)
        || mortalityEventIds.has(transaction.event.eventId)
      ) return false;
      actorLineage.set(actorId, Object.freeze({
        ownerSourceKey: owner.sourceKey,
        actor: transaction.retiredActor,
        status: "mortality-retired" as const,
        retirementAtTick: transaction.event.atTick,
        retirementAttackerId: transaction.event.attackerId,
      }));
      mortalityIds.add(transaction.mortalityId);
      mortalityEventIds.add(transaction.event.eventId);
    }
    for (const carcass of owner.patch.carcasses) {
      if (
        bodyIds.has(carcass.carcassId)
        || (carcass.claimProvenanceId !== null
          && claimProvenanceIds.has(carcass.claimProvenanceId))
      ) return false;
      bodyIds.add(carcass.carcassId);
      if (carcass.claimProvenanceId !== null) {
        claimProvenanceIds.add(carcass.claimProvenanceId);
      }
    }
  }

  // A v24 actor retired only to resolve migration capacity is historical
  // lineage, not a death and never a second living body. It can authenticate a
  // pre-adoption attack without copying the actor into a v25 runtime owner.
  const legacy = root.legacyCohort;
  if (legacy !== null) {
    const sourceActors = new Map(legacy.sourcePatch.populations.flatMap(({ members }) => (
      members.map(({ actor }) => [actor.identity.stableId, actor] as const)
    )));
    for (const retirement of legacy.retirements) {
      const actor = sourceActors.get(retirement.actorId);
      if (actor === undefined || actorLineage.has(retirement.actorId)) return false;
      actorLineage.set(retirement.actorId, Object.freeze({
        ownerSourceKey: "migration:compatibility-retirement" as const,
        actor,
        status: "compatibility-retired" as const,
        retirementAtTick: retirement.retiredAtTick,
      }));
    }
  }

  for (const owner of owners) {
    const locallyOwnedActorIds = new Set([
      ...owner.patch.populations.flatMap(({ members }) => (
        members.map(({ actor }) => actor.identity.stableId)
      )),
      ...owner.patch.mortalityTransactions.map(({ retiredActor }) => (
        retiredActor.identity.stableId
      )),
    ]);
    for (const transaction of owner.patch.mortalityTransactions) {
      const attackerId = transaction.event.attackerId;
      if (locallyOwnedActorIds.has(attackerId)) continue;
      const attacker = actorLineage.get(attackerId);
      if (
        attacker === undefined
        || attacker.ownerSourceKey === owner.sourceKey
        || !lineageWasAliveForExternalMortality(attacker, transaction.event)
      ) return false;
    }
    for (const carcass of owner.patch.carcasses) {
      const claimantId = carcass.currentClaimantActorId;
      if (claimantId === null) continue;
      const claimant = actorLineage.get(claimantId);
      if (
        claimant === undefined
        || claimant.status !== "living"
        || !livingActorOwnsCurrentCarcassClaim(claimant.actor, carcass)
      ) return false;
    }
  }
  return true;
}

function rootWideReferenceOwners(
  root: RegionalEcologyRootV1,
  settlementHome: RegionalEcologyResidentSnapshotV1,
  activeResidents: readonly RegionalEcologyResidentSnapshotV1[],
): readonly RegionalEcologyReferenceOwner[] | null {
  const bySource = new Map<string, RegionalEcologyReferenceOwner>();
  for (const source of [settlementHome, ...activeResidents]) {
    if (bySource.has(source.sourceKey)) return null;
    bySource.set(source.sourceKey, Object.freeze({
      sourceKey: source.sourceKey,
      patch: source.patch,
    }));
  }
  for (const delta of root.regions) {
    const patch = delta.residentPatch;
    if (patch === null) continue;
    const active = bySource.get(patch.patchKey);
    if (active === undefined) {
      bySource.set(patch.patchKey, Object.freeze({ sourceKey: patch.patchKey, patch }));
      continue;
    }
    // One hot snapshot is a later view of this exact sparse owner. An origin
    // collision or lineage rewrite may not hide behind source-key deduplication.
    if (
      active.patch.derivation.kind !== "regional-habitat-v1"
      && active.patch.derivation.kind !== "regional-habitat-v1-with-adoption-suppression"
    ) return null;
    if (
      active.patch.updatedAtTick < patch.updatedAtTick
      || regionKey(active.patch.originRegion) !== regionKey(patch.originRegion)
      || sourceLineageHash(active.patch) !== sourceLineageHash(patch)
    ) return null;
  }
  return Object.freeze([...bySource.values()].sort((left, right) => (
    compareText(left.sourceKey, right.sourceKey)
  )));
}

function lineageWasAliveForExternalMortality(
  lineage: RegionalEcologyActorLineage,
  event: CoreEcologyAggregatePatchState["mortalityTransactions"][number]["event"],
): boolean {
  if (lineage.status === "living") {
    // The current model has immutable generated/adopted individuals and no
    // birth verb. A later canonical living state therefore proves existence at
    // every earlier ecology tick.
    return lineage.actor.updatedAtTick >= event.atTick;
  }
  if (lineage.status === "compatibility-retired") {
    // Migration happens after the frozen v24 envelope is authenticated, so an
    // actor still living in that envelope existed through its completed tick.
    return lineage.actor.updatedAtTick >= event.atTick
      && lineage.retirementAtTick >= event.atTick;
  }
  if (lineage.retirementAtTick > event.atTick) return true;
  if (lineage.retirementAtTick < event.atTick) return false;
  // Runtime resolves current-tick mortality by globally sorted attacker ID.
  // If this attacker also dies at the same tick, its killer must have received
  // a strictly later turn; no cross-owner ordinal is invented here.
  return compareText(lineage.retirementAttackerId, event.attackerId) > 0;
}

function livingActorOwnsCurrentCarcassClaim(
  actor: CoreWildlifeActorState,
  carcass: CoreEcologyAggregatePatchState["carcasses"][number],
): boolean {
  const resource = actor.intent.resourceReference;
  if (
    actor.condition.health === 0
    || actor.updatedAtTick < (carcass.claimedAtTick ?? 0)
    || !coreEcologySpeciesCanGuardCarcass(actor.identity.species)
    || (actor.intent.kind !== "guard" && actor.intent.kind !== "scavenge")
    || resource === null
    || resource.resourceId !== carcass.carcassId
    || resource.foodClass !== "carrion"
    || resource.sourceKind !== "physical-carcass"
  ) return false;
  try {
    const delta = worldPositionDelta(actor.address.position, carcass.deathPosition);
    const squared = BigInt(delta.x) * BigInt(delta.x) + BigInt(delta.y) * BigInt(delta.y);
    const reach = BigInt(Math.min(
      carcass.bodySizeUnits * 100,
      WORLD_POSITION_UNITS_PER_TILE,
    ));
    return squared <= reach * reach;
  } catch {
    return false;
  }
}

function sourceOwnership(
  source: RegionalEcologyResidentSnapshotV1,
): RegionalEcologySourceOwnershipV1 {
  const patch = source.patch;
  const actorIds = new Set<string>();
  for (const population of patch.populations) {
    for (const member of population.members) actorIds.add(member.actor.identity.stableId);
  }
  for (const transaction of patch.mortalityTransactions) {
    actorIds.add(transaction.retiredActor.identity.stableId);
  }
  return deepFreeze({
    sourceKey: source.sourceKey,
    kind: source.kind,
    region: copyRegion(source.region),
    patchHash: source.patchHash,
    lineageHash: source.lineageHash,
    populationKeys: patch.populations.map(({ species, populationKey }) => (
      `${species.length}:${species}:${populationKey}`
    )).sort(compareText),
    actorIds: [...actorIds].sort(compareText),
    groupIds: patch.groups.groups.map(({ identity }) => identity.stableId).sort(compareText),
    aggregateIds: patch.aggregatePopulations.map(({ aggregateId }) => aggregateId).sort(compareText),
    mortalityIds: patch.mortalityTransactions.map(({ mortalityId }) => mortalityId).sort(compareText),
    bodyIds: patch.carcasses.map(({ carcassId }) => carcassId).sort(compareText),
  });
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

function canonicalProjection(
  value: unknown,
  state: RegionalEcologyStateV1,
): RegionalEcologyActiveProjectionV1 | null {
  if (typeof value === "object" && value !== null && TRUSTED_PROJECTIONS.has(value)) {
    const projection = value as RegionalEcologyActiveProjectionV1;
    return projection.stateIntegrity === state.integrity ? projection : null;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "atTick",
    "integrity",
    "ownerId",
    "residents",
    "stateIntegrity",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_ACTIVE_PROJECTION_VERSION
    || value.ownerId !== "game:regional-ecology-active-projection:v1"
    || value.stateIntegrity !== state.integrity
    || value.atTick !== state.updatedAtTick
    || !Array.isArray(value.residents)
    || !validHash(value.integrity)
  ) return null;
  const sources = new Map(activeSnapshots(state).map((source) => [source.sourceKey, source]));
  const residents: RegionalEcologyProjectedResidentV1[] = [];
  for (const raw of value.residents) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "kind",
      "patch",
      "projectedPatchHash",
      "region",
      "sourceKey",
      "sourcePatchHash",
    ])) return null;
    const source = typeof raw.sourceKey === "string" ? sources.get(raw.sourceKey) : undefined;
    const patch = canonicalizeCoreEcologyAggregatePatch(raw.patch);
    if (
      source === undefined
      || patch === null
      || stableStringify(patch) !== stableStringify(raw.patch)
      || raw.kind !== source.kind
      || !isRegionCoord(raw.region)
      || regionKey(raw.region) !== regionKey(source.region)
      || raw.sourcePatchHash !== source.patchHash
      || raw.projectedPatchHash !== hashCanonical(patch)
      || patch.patchKey !== source.sourceKey
      || patch.updatedAtTick !== state.updatedAtTick
    ) return null;
    residents.push(deepFreeze({
      kind: source.kind,
      sourceKey: source.sourceKey,
      region: copyRegion(source.region),
      sourcePatchHash: source.patchHash,
      projectedPatchHash: raw.projectedPatchHash,
      patch,
    }));
    sources.delete(source.sourceKey);
  }
  residents.sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  if (sources.size !== 0 || stableStringify(residents) !== stableStringify(value.residents)) return null;
  const base = {
    version: REGIONAL_ECOLOGY_ACTIVE_PROJECTION_VERSION,
    ownerId: "game:regional-ecology-active-projection:v1" as const,
    stateIntegrity: state.integrity,
    atTick: state.updatedAtTick,
    residents: Object.freeze(residents),
  };
  if (hashCanonical(base) !== value.integrity) return null;
  const projection = deepFreeze({ ...base, integrity: value.integrity });
  TRUSTED_PROJECTIONS.add(projection);
  return projection;
}

function activeSnapshots(
  state: RegionalEcologyStateV1,
): readonly RegionalEcologyResidentSnapshotV1[] {
  const activeKeys = new Set(state.activeRegions.map(regionKey));
  return Object.freeze([
    ...(snapshotResidesInActiveRegions(state.settlementHome, activeKeys)
      ? [state.settlementHome]
      : []),
    ...state.activeResidents,
  ].sort(compareSnapshot));
}

function snapshotResidesInActiveRegions(
  snapshot: RegionalEcologyResidentSnapshotV1,
  activeRegionKeys: ReadonlySet<string>,
): boolean {
  if (activeRegionKeys.has(regionKey(snapshot.region))) return true;
  const residence = regionalEcologyPatchResidenceRegions(snapshot.patch);
  return residence !== null && residence.some((region) => (
    activeRegionKeys.has(regionKey(region))
  ));
}

function requireDurableRegionalReplacement(
  prior: RegionalEcologyStateV1,
  input: ReplaceRegionalEcologyActiveStateInput,
  root: RegionalEcologyRootV1,
): void {
  const nextBySource = new Map<string, Readonly<{
    kind: RegionalEcologyActiveSourceKind;
    patch: CoreEcologyAggregatePatchState;
  }>>();
  for (const resident of input.activeResidents) {
    const patch = normalizeRegionalEcologyResidentPatchForStorage(
      resident.patch,
      prior.updatedAtTick,
    );
    if (patch === null || patch.patchKey !== resident.sourceKey || nextBySource.has(resident.sourceKey)) {
      throw new RangeError("Regional ecology replacement contains a malformed resident");
    }
    nextBySource.set(resident.sourceKey, { kind: resident.kind, patch });
  }
  const priorBySource = new Map(prior.activeResidents.map((resident) => [
    resident.sourceKey,
    resident,
  ] as const));
  for (const resident of prior.activeResidents) {
    const next = nextBySource.get(resident.sourceKey);
    if (next !== undefined) {
      if (
        next.kind !== resident.kind
        || stableStringify(next.patch) !== stableStringify(resident.patch)
      ) throw new RangeError("Regional ecology replacement rewrote a resident in place");
      continue;
    }
    if (resident.kind !== "regional-habitat") {
      throw new RangeError("Legacy ecology cannot unload without durable cohort state");
    }
    if (!regionalPatchMatchesDurableAuthority(resident.patch, root, input.rootSeed)) {
      throw new RangeError("Changed regional ecology must persist before unload");
    }
  }
  for (const [sourceKey, next] of nextBySource) {
    if (priorBySource.has(sourceKey)) continue;
    if (
      next.kind !== "regional-habitat"
      || !regionalPatchMatchesDurableAuthority(next.patch, root, input.rootSeed)
    ) throw new RangeError("Regional ecology entrant lacks durable seeded authority");
  }
}

function regionalPatchMatchesDurableAuthority(
  patch: CoreEcologyAggregatePatchState,
  root: RegionalEcologyRootV1,
  seed: RootSeed,
): boolean {
  const bound = canonicalCoreEcologyRegionalResidentPatchForRoot(patch, {
    seed,
    root,
    region: patch.originRegion,
    completedTick: root.updatedAtTick,
  });
  if (bound === null) return false;
  const deviation = regionalEcologyResidentDeviation(root, seed, patch.originRegion);
  if (deviation !== null) {
    // A dormant deviation keeps its last committed tick while the regional
    // root clock advances. Re-entry derives the same no-action catch-up in
    // regionalEcologyRegionalResidentsForActiveRegions; authenticate that
    // derived snapshot rather than comparing it with the older stored bytes.
    const currentDeviation = advanceDormantRegionalPatchToTick(
      deviation,
      root.updatedAtTick,
    );
    return currentDeviation !== null
      && stableStringify(currentDeviation) === stableStringify(bound);
  }
  const baseline = createCoreEcologyRegionalResidentPatchForRoot({
    seed,
    root,
    region: patch.originRegion,
  });
  return baseline !== null && stableStringify(baseline) === stableStringify(bound);
}

/**
 * Bring one sparse all-coarse resident to the root clock without inventing
 * observations or bypassing the core patch owner's bounded-step contract.
 * The core owner may exactly compress settled actor and group clocks. Any
 * step-sensitive state retains canonical bounded chunks, so entrant derivation
 * and authority replay remain byte-identical.
 */
function advanceDormantRegionalPatchToTick(
  value: unknown,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  let patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !nonnegativeSafeInteger(atTick)
    || atTick < patch.updatedAtTick
    || atTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
  ) return null;
  if (atTick === patch.updatedAtTick) return patch;
  while (patch.updatedAtTick < atTick) {
    const accelerated = advanceCoreEcologyDormantAggregatePatch(patch, { atTick });
    if (accelerated !== null) return accelerated;
    const nextTick = Math.min(
      atTick,
      patch.updatedAtTick + CORE_ECOLOGY_MAX_STEP_TICKS,
    );
    const stepped = stepCoreEcologyAggregatePatch(patch, {
      tick: nextTick,
      actorSteps: [],
    });
    if (stepped === null) return null;
    patch = stepped.patch;
  }
  return patch;
}

function regionalPatchMatchesPristineRoot(
  patch: CoreEcologyAggregatePatchState,
  root: RegionalEcologyRootV1,
  seed: RootSeed,
): boolean {
  const baseline = createCoreEcologyRegionalResidentPatchForRoot({
    seed,
    root,
    region: patch.originRegion,
  });
  return baseline !== null && stableStringify(baseline) === stableStringify(patch);
}

function regionalResidentDurableSignal(
  patch: CoreEcologyAggregatePatchState,
): Readonly<Record<string, unknown>> {
  return {
    aggregatePopulations: patch.aggregatePopulations.map((population) => {
      const { updatedAtTick: _updatedAtTick, activitySignal, ...durable } = population;
      const { updatedAtTick: _activityTick, ...durableActivity } = activitySignal;
      return { ...durable, activitySignal: durableActivity };
    }),
    carcasses: patch.carcasses,
    derivation: patch.derivation,
    groups: patch.groups.groups.map((group) => {
      const {
        nextCoarseTick: _nextCoarseTick,
        updatedAtTick: _updatedAtTick,
        ...durable
      } = group;
      return durable;
    }),
    mortalityTransactions: patch.mortalityTransactions,
    nextMortalityOrdinal: patch.nextMortalityOrdinal,
    originRegion: patch.originRegion,
    patchKey: patch.patchKey,
    populations: patch.populations.map((population) => ({
      baselinePopulationSize: population.baselinePopulationSize,
      members: population.members.map((member) => {
        const actor = member.actor;
        const { tick: _perceptionTick, ...perception } = actor.perception;
        const {
          enteredAtTick: _enteredAtTick,
          expiresAtTick: _expiresAtTick,
          ...timelessIntent
        } = actor.intent;
        const intent = timelessIntent.focusObservationId === null
          && timelessIntent.resourceReference === null
          && (timelessIntent.cause.kind === "condition" || timelessIntent.cause.kind === "need")
          ? null
          : timelessIntent;
        return {
          actor: {
            address: actor.address,
            conditionHealth: actor.condition.health,
            identity: actor.identity,
            intent,
            memories: actor.memories,
            perception,
          },
          populationOrdinal: member.populationOrdinal,
          representedUnits: member.representedUnits,
        };
      }),
      populationKey: population.populationKey,
      populationSize: population.populationSize,
      reserveUnits: population.reserveUnits,
      species: population.species,
    })),
  };
}

function requireStateTransition(
  prior: RegionalEcologyStateV1,
  next: RegionalEcologyStateV1,
  rootSeed: RootSeed,
): void {
  if (
    next.updatedAtTick < prior.updatedAtTick
    || next.root.seedFingerprint !== prior.root.seedFingerprint
    || next.root.baselinePolicyId !== prior.root.baselinePolicyId
    || next.root.revision < prior.root.revision
    || next.root.lastEventOrdinal < prior.root.lastEventOrdinal
    || next.settlementHome.sourceKey !== prior.settlementHome.sourceKey
    || regionKey(next.settlementHome.region) !== regionKey(prior.settlementHome.region)
    || next.settlementHome.lineageHash !== prior.settlementHome.lineageHash
    || (prior.root.adoption !== null
      && next.root.adoption?.transactionId !== prior.root.adoption.transactionId)
    || (prior.root.legacyCohort !== null
      && next.root.legacyCohort?.sourcePatchHash !== prior.root.legacyCohort.sourcePatchHash)
  ) throw new RangeError("Regional ecology active replacement breaks durable lineage");
  const priorBySource = new Map(prior.activeResidents.map((source) => [source.sourceKey, source]));
  for (const source of next.activeResidents) {
    const previous = priorBySource.get(source.sourceKey);
    if (previous === undefined) continue;
    if (
      source.kind !== previous.kind
      || regionKey(source.region) !== regionKey(previous.region)
      || source.lineageHash !== previous.lineageHash
    ) throw new RangeError("Regional ecology resident source changed identity in place");
    if (
      source.kind === "legacy-cohort"
      && canonicalRegionalEcologyLegacyCohortTransition(
        previous.patch,
        source.patch,
        {
          rootSeed,
          root: next.root,
          completedTick: next.updatedAtTick,
        },
      ) === null
    ) throw new RangeError("Regional ecology legacy cohort transition broke receipt authority");
  }
}

function sealState(
  base: Omit<RegionalEcologyStateV1, "integrity">,
): RegionalEcologyStateV1 {
  const state = deepFreeze({ ...base, integrity: hashCanonical(base) });
  if (serializedBytes(state) > REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology state exceeds its save budget");
  }
  TRUSTED_STATES.add(state);
  return state;
}

function canonicalRegions(values: readonly RegionCoord[]): readonly RegionCoord[] {
  const result = canonicalRegionsOrNull(values);
  if (result === null) throw new RangeError("Regional ecology neighborhood is malformed");
  return result;
}

function canonicalRegionsOrNull(values: readonly unknown[]): readonly RegionCoord[] | null {
  const byKey = new Map<string, RegionCoord>();
  for (const value of values) {
    if (!isRegionCoord(value)) return null;
    byKey.set(regionKey(value), copyRegion(value));
  }
  return Object.freeze([...byKey.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, region]) => region));
}

function overlaps(owned: Set<string>, values: readonly string[]): boolean {
  for (const value of values) {
    if (owned.has(value)) return true;
    owned.add(value);
  }
  return false;
}

function compareSnapshot(
  left: Pick<RegionalEcologyResidentSnapshotV1, "sourceKey">,
  right: Pick<RegionalEcologyResidentSnapshotV1, "sourceKey">,
): number {
  return compareText(left.sourceKey, right.sourceKey);
}

function copyRegion(value: RegionCoord): RegionCoord {
  return createRegionCoord(value.x, value.y);
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function serializedBytes(value: unknown): number {
  return UTF8_ENCODER.encode(stableStringify(value)).byteLength;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
