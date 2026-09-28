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
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
  deriveCoreEcologyPolarShoreHabitat,
  deriveCoreEcologyPolarShoreTerritory,
} from "./coreEcologyPolarShoreHabitat";
import {
  canonicalCoreEcologyPolarShoreResidentPatch,
  createCoreEcologyPolarShoreResidentPatch,
  reconcileCoreEcologyPolarShoreResidentPatchAtTick,
} from "./regionalPolarShoreResidents";

export const REGIONAL_POLAR_SHORE_ECOLOGY_ROOT_VERSION = 1 as const;
export const REGIONAL_POLAR_SHORE_ECOLOGY_DELTA_VERSION = 1 as const;
export const REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID =
  "game:regional-polar-shore-ecology:v1" as const;
export const REGIONAL_POLAR_SHORE_ECOLOGY_BASELINE_POLICY_ID =
  CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND;
export const REGIONAL_POLAR_SHORE_ECOLOGY_MAX_REGIONS = 32_768 as const;
export const REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES =
  4 * 1_024 * 1_024;
export const REGIONAL_POLAR_SHORE_ECOLOGY_ACTIVE_REGION_LIMIT = 9 as const;

export interface RegionalPolarShoreEcologyWorldBinding {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
}

/** Pristine or merely observed baselines never consume durable save space. */
export interface RegionalPolarShoreEcologyRegionDeltaV1 {
  readonly version: typeof REGIONAL_POLAR_SHORE_ECOLOGY_DELTA_VERSION;
  readonly stableId: string;
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

/** Append-only sibling root; Alpha-33 and RegionalEcologyStateV2 stay frozen. */
export interface RegionalPolarShoreEcologyRootV1 {
  readonly version: typeof REGIONAL_POLAR_SHORE_ECOLOGY_ROOT_VERSION;
  readonly ownerId: typeof REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID;
  readonly generationVersion: 1;
  readonly baselinePolicyId: typeof REGIONAL_POLAR_SHORE_ECOLOGY_BASELINE_POLICY_ID;
  readonly seedFingerprint: string;
  readonly updatedAtTick: number;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  readonly regions: readonly RegionalPolarShoreEcologyRegionDeltaV1[];
  readonly integrity: string;
}

export interface PutRegionalPolarShoreEcologyResidentDeviationInput {
  readonly rootSeed: RootSeed;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalPolarShoreEcologyActiveResidentInput {
  readonly kind: typeof CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND;
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

/** Exact prior V3 snapshot custody; runtime output never supplies authority. */
export interface RegionalPolarShoreEcologyActiveReceiptClaim {
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly patchHash: string;
  readonly lineageHash: string;
}

export interface RegionalPolarShoreEcologyDurableResidentInput {
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface AdvanceRegionalPolarShoreEcologyActiveResidentsInput {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
  readonly activeRegions: readonly RegionCoord[];
  readonly expectedResidents: readonly RegionalPolarShoreEcologyActiveReceiptClaim[];
  readonly durableResidents?: readonly RegionalPolarShoreEcologyDurableResidentInput[];
}

export interface AdvanceRegionalPolarShoreEcologyActiveResidentsResult {
  readonly root: RegionalPolarShoreEcologyRootV1;
  readonly residents: readonly RegionalPolarShoreEcologyActiveResidentInput[];
}

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const UINT32_MAX = 0xffff_ffff;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_ROOTS = new WeakSet<object>();
const WORLD_BOUND_ROOTS = new WeakMap<object, string>();

interface RegionalPolarShoreEcologyActiveReceiptResident {
  readonly sourceKey: string;
  readonly regionKey: string;
  readonly habitatHash: string;
  readonly patchHash: string;
  readonly lineageHash: string;
  readonly patch: CoreEcologyAggregatePatchState;
  /**
   * Exact process-local pristine lineage for this source. Stored deviations
   * may carry an older tick here; the next comparison must reconcile it
   * through the ordinary polar-shore authority before use. Missing provenance
   * is null and always falls back to the full deterministic constructor.
   */
  readonly pristinePatch: CoreEcologyAggregatePatchState | null;
}

/**
 * Same-stack proof that one exact immutable polar patch passed the complete
 * world-bound admission check. This proof never enters the root receipt or a
 * save; it only prevents receipt seeding from immediately repeating the same
 * canonical validation and lineage calculation for the identical object.
 */
interface PreparedPolarShoreResidentAdmission {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly sourceKey: string;
  readonly regionKey: string;
  readonly habitatHash: string;
  readonly atTick: number;
  readonly lineageHash: string;
}

interface RegionalPolarShoreEcologyActiveReceipt {
  readonly rootSeed: RootSeed;
  readonly atTick: number;
  readonly activeRegionKeys: readonly string[];
  readonly residents: readonly RegionalPolarShoreEcologyActiveReceiptResident[];
}

/** One bounded hot-window receipt per exact immutable root identity. */
const ACTIVE_RESIDENT_RECEIPTS = new WeakMap<
  object,
  RegionalPolarShoreEcologyActiveReceipt
>();

export function createPristineRegionalPolarShoreEcologyRoot(
  binding: RegionalPolarShoreEcologyWorldBinding,
): RegionalPolarShoreEcologyRootV1 {
  requireBinding(binding);
  const root = sealRoot({
    version: REGIONAL_POLAR_SHORE_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID,
    generationVersion: 1,
    baselinePolicyId: REGIONAL_POLAR_SHORE_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: seedFingerprint(binding.rootSeed),
    updatedAtTick: binding.completedTick,
    revision: 0,
    lastEventOrdinal: 0,
    regions: Object.freeze([]),
  });
  WORLD_BOUND_ROOTS.set(root, root.seedFingerprint);
  return root;
}

export function createRegionalPolarShoreEcologyRegionDelta(
  input: Readonly<{
    readonly rootSeed: RootSeed;
    readonly region: RegionCoord;
    readonly baselineHash: string;
    readonly revision: number;
    readonly eventOrdinal: number;
    readonly residentPatch: CoreEcologyAggregatePatchState;
  }>,
): RegionalPolarShoreEcologyRegionDeltaV1 {
  requireRootSeed(input.rootSeed);
  if (
    !isRegionCoord(input.region) ||
    !validHash(input.baselineHash) ||
    !positiveSafeInteger(input.revision) ||
    !positiveSafeInteger(input.eventOrdinal)
  )
    throw new RangeError(
      "Regional polar-shore ecology refuses a malformed delta",
    );
  const patch = canonicalCoreEcologyPolarShoreResidentPatch(
    input.residentPatch,
    {
      seed: input.rootSeed,
      region: input.region,
      completedTick: input.residentPatch.updatedAtTick,
    },
  );
  if (
    patch === null ||
    patch.originRegion.x !== input.region.x ||
    patch.originRegion.y !== input.region.y ||
    !isPolarDerivation(patch) ||
    patch.derivation.habitat.derivationHash !== input.baselineHash
  )
    throw new RangeError(
      "Regional polar-shore delta is not a bound resident patch",
    );
  const pristine = createCoreEcologyPolarShoreResidentPatch({
    seed: input.rootSeed,
    habitat: deriveCoreEcologyPolarShoreHabitat({
      seed: input.rootSeed,
      region: input.region,
    }),
    tick: patch.updatedAtTick,
  });
  if (stableStringify(pristine) === stableStringify(patch)) {
    throw new RangeError(
      "Regional polar-shore ecology does not persist pristine baselines",
    );
  }
  const base = {
    version: REGIONAL_POLAR_SHORE_ECOLOGY_DELTA_VERSION,
    stableId: stableRegionObjectId(
      input.rootSeed,
      input.region,
      "polar-shore-deviation",
      "v1",
    ),
    region: createRegionCoord(input.region.x, input.region.y),
    key: regionKey(input.region),
    regionId: stableRegionId(input.rootSeed, input.region),
    baselineHash: input.baselineHash,
    revision: input.revision,
    eventOrdinal: input.eventOrdinal,
    residentPatch: patch,
    residentPatchHash: hashCanonical(patch),
  } as const;
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

export function canonicalizeRegionalPolarShoreEcologyRegionDelta(
  value: unknown,
  rootSeed?: RootSeed,
): RegionalPolarShoreEcologyRegionDeltaV1 | null {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "baselineHash",
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
    ])
  )
    return null;
  if (
    value.version !== REGIONAL_POLAR_SHORE_ECOLOGY_DELTA_VERSION ||
    !validId(value.stableId) ||
    !isRegionCoord(value.region) ||
    value.key !== regionKey(value.region) ||
    !validId(value.regionId) ||
    !validHash(value.baselineHash) ||
    !positiveSafeInteger(value.revision) ||
    !positiveSafeInteger(value.eventOrdinal) ||
    !validHash(value.residentPatchHash) ||
    !validHash(value.integrity)
  )
    return null;
  const patch = canonicalPolarPatchShape(
    value.residentPatch,
    value.region,
    value.baselineHash,
  );
  if (patch === null || value.residentPatchHash !== hashCanonical(patch))
    return null;
  const base = {
    version: REGIONAL_POLAR_SHORE_ECOLOGY_DELTA_VERSION,
    stableId: value.stableId,
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
      delta.stableId !==
        stableRegionObjectId(
          rootSeed,
          delta.region,
          "polar-shore-deviation",
          "v1",
        ) ||
      delta.regionId !== stableRegionId(rootSeed, delta.region)
    )
      return null;
    const habitat = deriveCoreEcologyPolarShoreHabitat({
      seed: rootSeed,
      region: delta.region,
    });
    if (
      habitat.totalPopulationUnits === 0 ||
      delta.baselineHash !== habitat.derivationHash ||
      canonicalCoreEcologyPolarShoreResidentPatch(delta.residentPatch, {
        seed: rootSeed,
        region: delta.region,
        completedTick: delta.residentPatch.updatedAtTick,
      }) === null
    )
      return null;
    const pristine = createCoreEcologyPolarShoreResidentPatch({
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

export function canonicalizeRegionalPolarShoreEcologyRoot(
  value: unknown,
): RegionalPolarShoreEcologyRootV1 | null {
  if (typeof value === "object" && value !== null && TRUSTED_ROOTS.has(value)) {
    return value as RegionalPolarShoreEcologyRootV1;
  }
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
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
    ])
  )
    return null;
  if (
    value.version !== REGIONAL_POLAR_SHORE_ECOLOGY_ROOT_VERSION ||
    value.ownerId !== REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID ||
    value.generationVersion !== 1 ||
    value.baselinePolicyId !==
      REGIONAL_POLAR_SHORE_ECOLOGY_BASELINE_POLICY_ID ||
    !validHash(value.seedFingerprint) ||
    !nonnegativeSafeInteger(value.updatedAtTick) ||
    !nonnegativeSafeInteger(value.revision) ||
    !nonnegativeSafeInteger(value.lastEventOrdinal) ||
    !Array.isArray(value.regions) ||
    value.regions.length > REGIONAL_POLAR_SHORE_ECOLOGY_MAX_REGIONS ||
    !validHash(value.integrity)
  )
    return null;
  const regions: RegionalPolarShoreEcologyRegionDeltaV1[] = [];
  for (const raw of value.regions) {
    const delta = canonicalizeRegionalPolarShoreEcologyRegionDelta(raw);
    if (
      delta === null ||
      delta.revision > value.revision ||
      delta.eventOrdinal > value.lastEventOrdinal ||
      delta.residentPatch.updatedAtTick > value.updatedAtTick
    )
      return null;
    regions.push(delta);
  }
  regions.sort((left, right) => compareText(left.key, right.key));
  if (
    regions.some(
      (region, index) => index > 0 && regions[index - 1]!.key === region.key,
    ) ||
    (value.revision === 0) !== (value.lastEventOrdinal === 0)
  )
    return null;
  const base = {
    version: REGIONAL_POLAR_SHORE_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_POLAR_SHORE_ECOLOGY_OWNER_ID,
    generationVersion: 1 as const,
    baselinePolicyId: REGIONAL_POLAR_SHORE_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: value.seedFingerprint,
    updatedAtTick: value.updatedAtTick,
    revision: value.revision,
    lastEventOrdinal: value.lastEventOrdinal,
    regions: Object.freeze(regions),
  } as const;
  if (hashCanonical(base) !== value.integrity) return null;
  const root = deepFreeze({ ...base, integrity: value.integrity });
  if (serializedBytes(root) > REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES)
    return null;
  TRUSTED_ROOTS.add(root);
  return root;
}

export function canonicalRegionalPolarShoreEcologyRootForWorld(
  value: unknown,
  binding: RegionalPolarShoreEcologyWorldBinding,
): RegionalPolarShoreEcologyRootV1 | null {
  try {
    requireBinding(binding);
  } catch {
    return null;
  }
  const root = canonicalizeRegionalPolarShoreEcologyRoot(value);
  if (
    root === null ||
    root.seedFingerprint !== seedFingerprint(binding.rootSeed) ||
    root.updatedAtTick !== binding.completedTick
  )
    return null;
  if (WORLD_BOUND_ROOTS.get(root) === root.seedFingerprint) return root;
  for (const delta of root.regions) {
    const bound = canonicalizeRegionalPolarShoreEcologyRegionDelta(
      delta,
      binding.rootSeed,
    );
    if (bound === null || stableStringify(bound) !== stableStringify(delta))
      return null;
  }
  WORLD_BOUND_ROOTS.set(root, root.seedFingerprint);
  return root;
}

export function advanceRegionalPolarShoreEcologyRoot(
  value: unknown,
  completedTick: number,
): RegionalPolarShoreEcologyRootV1 {
  const root = canonicalizeRegionalPolarShoreEcologyRoot(value);
  if (
    root === null ||
    !nonnegativeSafeInteger(completedTick) ||
    completedTick < root.updatedAtTick
  )
    throw new RangeError("Regional polar-shore ecology clock cannot rewind");
  if (completedTick === root.updatedAtTick) return root;
  const { integrity: _integrity, ...base } = root;
  const advanced = sealRoot({ ...base, updatedAtTick: completedTick });
  if (WORLD_BOUND_ROOTS.get(root) === root.seedFingerprint) {
    WORLD_BOUND_ROOTS.set(advanced, advanced.seedFingerprint);
  }
  return advanced;
}

/** Stores only a real conserved-state deviation; pristine tide state rederives. */
export function putRegionalPolarShoreEcologyResidentDeviation(
  value: unknown,
  input: PutRegionalPolarShoreEcologyResidentDeviationInput,
): RegionalPolarShoreEcologyRootV1 {
  const structural = canonicalizeRegionalPolarShoreEcologyRoot(value);
  if (structural === null)
    throw new TypeError("Regional polar-shore root is malformed");
  const root = canonicalRegionalPolarShoreEcologyRootForWorld(structural, {
    rootSeed: input.rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null)
    throw new RangeError("Regional polar-shore root belongs to another world");
  const normalized = reconcileCoreEcologyPolarShoreResidentPatchAtTick(
    input.patch,
    root.updatedAtTick,
  );
  if (
    normalized === null ||
    canonicalCoreEcologyPolarShoreResidentPatch(normalized, {
      seed: input.rootSeed,
      region: normalized.originRegion,
      completedTick: root.updatedAtTick,
    }) === null
  )
    throw new RangeError(
      "Regional polar-shore deviation is unbound or tide-unsafe",
    );
  const habitat = deriveCoreEcologyPolarShoreHabitat({
    seed: input.rootSeed,
    region: normalized.originRegion,
  });
  if (habitat.totalPopulationUnits === 0) {
    throw new RangeError(
      "An absent polar-shore baseline cannot own a deviation",
    );
  }
  const pristine = createCoreEcologyPolarShoreResidentPatch({
    seed: input.rootSeed,
    habitat,
    tick: root.updatedAtTick,
  });
  const pristineState =
    stableStringify(normalized) === stableStringify(pristine);
  const key = regionKey(normalized.originRegion);
  const existing = regionalDeltaByKey(root.regions, key);
  if (pristineState && existing === undefined) return root;
  const revision = root.revision + 1;
  const eventOrdinal = root.lastEventOrdinal + 1;
  if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(eventOrdinal)) {
    throw new RangeError("Regional polar-shore ordinal exhausted");
  }
  const regions = root.regions.filter((region) => region.key !== key);
  if (!pristineState) {
    regions.push(
      createRegionalPolarShoreEcologyRegionDelta({
        rootSeed: input.rootSeed,
        region: normalized.originRegion,
        baselineHash: habitat.derivationHash,
        revision: (existing?.revision ?? 0) + 1,
        eventOrdinal,
        residentPatch: normalized,
      }),
    );
  }
  regions.sort((left, right) => compareText(left.key, right.key));
  const { integrity: _integrity, ...base } = root;
  const nextRoot = sealRoot({
    ...base,
    revision,
    lastEventOrdinal: eventOrdinal,
    regions: Object.freeze(regions),
  });
  WORLD_BOUND_ROOTS.set(nextRoot, nextRoot.seedFingerprint);
  return nextRoot;
}

export function regionalPolarShoreEcologyResidentDeviation(
  value: unknown,
  rootSeed: RootSeed,
  region: RegionCoord,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalizeRegionalPolarShoreEcologyRoot(value);
  if (root === null) return null;
  const bound = canonicalRegionalPolarShoreEcologyRootForWorld(root, {
    rootSeed,
    completedTick: root.updatedAtTick,
  });
  if (bound === null || !isRegionCoord(region)) return null;
  return (
    regionalDeltaByKey(bound.regions, regionKey(region))?.residentPatch ?? null
  );
}

/** Returns a stored deviation when present, otherwise a fresh current-tide baseline. */
export function regionalPolarShoreEcologyResidentPatchForRegion(
  value: unknown,
  rootSeed: RootSeed,
  region: RegionCoord,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalizeRegionalPolarShoreEcologyRoot(value);
  if (root === null || !isRegionCoord(region)) return null;
  const bound = canonicalRegionalPolarShoreEcologyRootForWorld(root, {
    rootSeed,
    completedTick: root.updatedAtTick,
  });
  if (bound === null) return null;
  const delta = regionalDeltaByKey(bound.regions, regionKey(region));
  if (delta !== undefined) {
    return reconcileCoreEcologyPolarShoreResidentPatchAtTick(
      delta.residentPatch,
      root.updatedAtTick,
    );
  }
  if (!deriveCoreEcologyPolarShoreTerritory(rootSeed, region).regionIsHost) {
    return null;
  }
  const habitat = deriveCoreEcologyPolarShoreHabitat({
    seed: rootSeed,
    region,
  });
  return habitat.totalPopulationUnits === 0
    ? null
    : createCoreEcologyPolarShoreResidentPatch({
        seed: rootSeed,
        habitat,
        tick: root.updatedAtTick,
      });
}

/**
 * Selects lineage owners for one hot seamless neighborhood. Stored state may
 * also qualify by physical anchor residence; source keys deduplicate both paths.
 */
export function regionalPolarShoreEcologyResidentsForActiveRegions(
  value: unknown,
  rootSeed: RootSeed,
  regionsValue: readonly RegionCoord[],
): readonly RegionalPolarShoreEcologyActiveResidentInput[] | null {
  const structural = canonicalizeRegionalPolarShoreEcologyRoot(value);
  const activeRegions = canonicalRegionsOrNull(regionsValue);
  if (
    structural === null ||
    activeRegions === null ||
    activeRegions.length === 0 ||
    activeRegions.length > REGIONAL_POLAR_SHORE_ECOLOGY_ACTIVE_REGION_LIMIT
  )
    return null;
  const root = canonicalRegionalPolarShoreEcologyRootForWorld(structural, {
    rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null) return null;
  const bySource = new Map<
    string,
    RegionalPolarShoreEcologyActiveResidentInput
  >();
  const admit = (stored: CoreEcologyAggregatePatchState): boolean => {
    const patch = reconcileCoreEcologyPolarShoreResidentPatchAtTick(
      stored,
      root.updatedAtTick,
    );
    if (
      patch === null ||
      canonicalCoreEcologyPolarShoreResidentPatch(patch, {
        seed: rootSeed,
        region: patch.originRegion,
        completedTick: root.updatedAtTick,
      }) === null
    )
      return false;
    if (!bySource.has(patch.patchKey)) {
      bySource.set(
        patch.patchKey,
        Object.freeze({
          kind: CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
          sourceKey: patch.patchKey,
          patch,
        }),
      );
    }
    return true;
  };

  for (const region of activeRegions) {
    const delta = regionalDeltaByKey(root.regions, regionKey(region));
    if (delta !== undefined) {
      if (!admit(delta.residentPatch)) return null;
      continue;
    }
    const territory = deriveCoreEcologyPolarShoreTerritory(rootSeed, region);
    if (!territory.regionIsHost) continue;
    const habitat = deriveCoreEcologyPolarShoreHabitat({
      seed: rootSeed,
      region,
    });
    if (habitat.totalPopulationUnits === 0) continue;
    if (
      !admit(
        createCoreEcologyPolarShoreResidentPatch({
          seed: rootSeed,
          habitat,
          tick: root.updatedAtTick,
        }),
      )
    )
      return null;
  }
  const residents = Object.freeze(
    [...bySource.values()].sort((left, right) =>
      compareText(left.sourceKey, right.sourceKey),
    ),
  );
  seedActiveResidentReceipt(root, rootSeed, activeRegions, residents);
  return residents;
}

/**
 * Advances one exact active polar-shore set from this owner's private prior
 * derivation. Durable outputs are rebound and committed in source-key order;
 * presentation or visitation output is never accepted as authority. Any
 * custody miss returns null so callers retain the ordinary scalar transaction.
 */
export function advanceRegionalPolarShoreEcologyActiveResidentsFromReceipt(
  value: unknown,
  input: AdvanceRegionalPolarShoreEcologyActiveResidentsInput,
): AdvanceRegionalPolarShoreEcologyActiveResidentsResult | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !plainRecord(input) ||
    (!exactKeys(input, [
      "activeRegions",
      "completedTick",
      "expectedResidents",
      "rootSeed",
    ]) &&
      !exactKeys(input, [
        "activeRegions",
        "completedTick",
        "durableResidents",
        "expectedResidents",
        "rootSeed",
      ])) ||
    !Array.isArray(input.activeRegions) ||
    !Array.isArray(input.expectedResidents) ||
    (input.durableResidents !== undefined &&
      !Array.isArray(input.durableResidents)) ||
    !nonnegativeSafeInteger(input.completedTick)
  )
    return null;
  const receipt = ACTIVE_RESIDENT_RECEIPTS.get(value);
  if (receipt === undefined) return null;
  const activeRegions = canonicalRegionsOrNull(input.activeRegions);
  const claims = canonicalActiveReceiptClaimsOrNull(input.expectedResidents);
  if (
    activeRegions === null ||
    activeRegions.length === 0 ||
    activeRegions.length > REGIONAL_POLAR_SHORE_ECOLOGY_ACTIVE_REGION_LIMIT ||
    claims === null ||
    !sameRootSeed(input.rootSeed, receipt.rootSeed) ||
    input.completedTick < receipt.atTick ||
    !sameTextSequence(activeRegions.map(regionKey), receipt.activeRegionKeys) ||
    !claimsMatchActiveReceipt(claims, receipt.residents)
  )
    return null;
  const root = canonicalRegionalPolarShoreEcologyRootForWorld(value, {
    rootSeed: input.rootSeed,
    completedTick: receipt.atTick,
  });
  if (
    root === null ||
    root !== value ||
    root.updatedAtTick !== receipt.atTick
  )
    return null;

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
    const receiptSourceKeys = new Set(
      receipt.residents.map(({ sourceKey }) => sourceKey),
    );
    const bySource = new Map<
      string,
      RegionalPolarShoreEcologyActiveResidentInput
    >();
    const preparedAdmissionByPatch = new WeakMap<
      CoreEcologyAggregatePatchState,
      PreparedPolarShoreResidentAdmission
    >();
    const admit = (
      patch: CoreEcologyAggregatePatchState,
      prior: RegionalPolarShoreEcologyActiveReceiptResident,
    ): boolean => {
      if (
        patch.patchKey !== prior.sourceKey ||
        regionKey(patch.originRegion) !== prior.regionKey ||
        !activeKeys.has(prior.regionKey) ||
        !isPolarDerivation(patch) ||
        patch.derivation.habitat.derivationHash !== prior.habitatHash ||
        bySource.has(patch.patchKey)
      )
        return false;
      const canonicalPatch = canonicalCoreEcologyPolarShoreResidentPatch(patch, {
        seed: input.rootSeed,
        region: patch.originRegion,
        completedTick: input.completedTick,
      });
      if (canonicalPatch === null) return false;
      const lineageHash = polarResidentLineageHash(patch);
      if (lineageHash !== prior.lineageHash) return false;
      bySource.set(
        patch.patchKey,
        Object.freeze({
          kind: CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
          sourceKey: patch.patchKey,
          patch,
        }),
      );
      if (canonicalPatch === patch && Object.isFrozen(patch)) {
        preparedAdmissionByPatch.set(
          patch,
          Object.freeze({
            patch,
            sourceKey: patch.patchKey,
            regionKey: regionKey(patch.originRegion),
            habitatHash: patch.derivation.habitat.derivationHash,
            atTick: input.completedTick,
            lineageHash,
          }),
        );
      }
      return true;
    };

    for (const resident of receipt.residents) {
      const replacement = batch.durableBySource.get(resident.sourceKey);
      const patch =
        replacement ??
        reconcileCoreEcologyPolarShoreResidentPatchAtTick(
          resident.patch,
          input.completedTick,
        );
      if (patch === null || !admit(patch, resident)) return null;
    }

    // Polar admission is origin-key based. Probe only the bounded hot window:
    // an active-origin sparse row absent from the exact prior receipt proves
    // incomplete custody, while off-window rows remain dormant/unreconciled.
    for (const region of activeRegions) {
      const delta = regionalDeltaByKey(nextRoot.regions, regionKey(region));
      if (
        delta !== undefined &&
        !receiptSourceKeys.has(delta.residentPatch.patchKey)
      )
        return null;
    }

    const residents = Object.freeze(
      [...bySource.values()].sort((left, right) =>
        compareText(left.sourceKey, right.sourceKey),
      ),
    );
    if (residents.length > activeRegions.length + nextRoot.regions.length) {
      return null;
    }
    seedActiveResidentReceipt(
      nextRoot,
      input.rootSeed,
      activeRegions,
      residents,
      batch.pristineBySource,
      preparedAdmissionByPatch,
    );
    return Object.freeze({ root: nextRoot, residents });
  } catch {
    return null;
  }
}

interface RegionalPolarShoreEcologyActiveDeviationBatch {
  readonly root: RegionalPolarShoreEcologyRootV1;
  readonly durableBySource: ReadonlyMap<
    string,
    CoreEcologyAggregatePatchState
  >;
  readonly pristineBySource: ReadonlyMap<
    string,
    CoreEcologyAggregatePatchState
  >;
}

/** Replays scalar add/update/remove/no-op semantics with one final root seal. */
function applyActiveResidentDeviationBatch(
  root: RegionalPolarShoreEcologyRootV1,
  rootSeed: RootSeed,
  completedTick: number,
  values: readonly RegionalPolarShoreEcologyDurableResidentInput[],
  receipt: RegionalPolarShoreEcologyActiveReceipt,
): RegionalPolarShoreEcologyActiveDeviationBatch | null {
  if (
    completedTick < root.updatedAtTick ||
    values.length > receipt.residents.length
  )
    return null;
  const rootSerializedBytes = serializedBytes(root);
  // The scalar transaction advances the root clock before applying any put.
  // That operation changes only this nonnegative safe-integer token; the
  // replacement integrity digest is fixed-width ASCII. This digit delta is
  // therefore the exact clock-only sealed-root byte size without a second
  // canonical seal, and preserves the scalar path's pre-write budget failure.
  const clockAdvancedSerializedBytes =
    rootSerializedBytes +
    String(completedTick).length -
    String(root.updatedAtTick).length;
  if (
    clockAdvancedSerializedBytes >
    REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES
  )
    return null;
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
      !plainRecord(raw) ||
      !exactKeys(raw, ["patch", "sourceKey"]) ||
      typeof raw.sourceKey !== "string" ||
      durableBySource.has(raw.sourceKey) ||
      !plainRecord(raw.patch)
    )
      return null;
    const prior = receiptBySource.get(raw.sourceKey);
    if (prior === undefined) return null;
    const reconciled = reconcileCoreEcologyPolarShoreResidentPatchAtTick(
      raw.patch,
      completedTick,
    );
    if (
      reconciled === null ||
      reconciled.patchKey !== raw.sourceKey ||
      regionKey(reconciled.originRegion) !== prior.regionKey ||
      !isPolarDerivation(reconciled) ||
      reconciled.derivation.habitat.derivationHash !== prior.habitatHash ||
      polarResidentLineageHash(reconciled) !== prior.lineageHash ||
      canonicalCoreEcologyPolarShoreResidentPatch(reconciled, {
        seed: rootSeed,
        region: reconciled.originRegion,
        completedTick,
      }) === null
    )
      return null;
    durableBySource.set(raw.sourceKey, reconciled);
  }

  const ordered = [...durableBySource.entries()].sort(([left], [right]) =>
    compareText(left, right),
  );
  const regionsByKey = new Map(root.regions.map((delta) => [delta.key, delta]));
  let serializedUpperBound =
    values.length === 0 ? 0 : rootSerializedBytes + 256;
  let revision = root.revision;
  let eventOrdinal = root.lastEventOrdinal;
  let changed = false;
  for (const [, normalized] of ordered) {
    if (!isPolarDerivation(normalized)) return null;
    // The durable resident was world-authenticated immediately above. Reuse
    // that exact sealed habitat on the receipt hit instead of deriving the
    // same baseline a second time; the constructor fallback remains the sole
    // path that needs a fresh baseline.
    const habitat = normalized.derivation.habitat;
    if (habitat.totalPopulationUnits === 0) return null;
    const prior = receiptBySource.get(normalized.patchKey);
    if (prior === undefined) return null;
    let pristine = prior.pristinePatch === null
      ? null
      : reconcileCoreEcologyPolarShoreResidentPatchAtTick(
          prior.pristinePatch,
          completedTick,
        );
    if (
      pristine === null
      || pristine.patchKey !== normalized.patchKey
      || !isPolarDerivation(pristine)
      || pristine.derivation.habitat.derivationHash !== habitat.derivationHash
      || regionKey(pristine.originRegion) !== prior.regionKey
      || pristine.updatedAtTick !== completedTick
      || polarResidentLineageHash(pristine) !== prior.lineageHash
    ) {
      pristine = createCoreEcologyPolarShoreResidentPatch({
        seed: rootSeed,
        habitat,
        tick: completedTick,
      });
    }
    pristineBySource.set(normalized.patchKey, pristine);
    const pristineState =
      stableStringify(normalized) === stableStringify(pristine);
    const key = regionKey(normalized.originRegion);
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
      const delta = createRegionalPolarShoreEcologyRegionDelta({
        rootSeed,
        region: normalized.originRegion,
        baselineHash: habitat.derivationHash,
        revision: (existing?.revision ?? 0) + 1,
        eventOrdinal,
        residentPatch: normalized,
      });
      serializedUpperBound += serializedBytes(delta) + 1;
      if (
        serializedUpperBound >
        REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES
      )
        return null;
      regionsByKey.set(key, delta);
    }
    if (regionsByKey.size > REGIONAL_POLAR_SHORE_ECOLOGY_MAX_REGIONS) {
      return null;
    }
  }

  let nextRoot = root;
  if (completedTick !== root.updatedAtTick || changed) {
    const regions = Object.freeze(
      [...regionsByKey.values()].sort((left, right) =>
        compareText(left.key, right.key),
      ),
    );
    const { integrity: _integrity, ...base } = root;
    nextRoot = sealRoot({
      ...base,
      updatedAtTick: completedTick,
      revision,
      lastEventOrdinal: eventOrdinal,
      regions,
    });
    WORLD_BOUND_ROOTS.set(nextRoot, nextRoot.seedFingerprint);
  }
  return Object.freeze({ root: nextRoot, durableBySource, pristineBySource });
}

export function serializeRegionalPolarShoreEcologyRoot(value: unknown): string {
  const root = canonicalizeRegionalPolarShoreEcologyRoot(value);
  if (root === null)
    throw new TypeError("Regional polar-shore root is malformed");
  const text = stableStringify(root);
  if (
    UTF8_ENCODER.encode(text).byteLength >
    REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES
  ) {
    throw new RangeError("Regional polar-shore root exceeds its save budget");
  }
  return text;
}

export function deserializeRegionalPolarShoreEcologyRoot(
  text: unknown,
): RegionalPolarShoreEcologyRootV1 | null {
  if (
    typeof text !== "string" ||
    text.length === 0 ||
    UTF8_ENCODER.encode(text).byteLength >
      REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES
  )
    return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const root = canonicalizeRegionalPolarShoreEcologyRoot(parsed);
    return root !== null && stableStringify(root) === text ? root : null;
  } catch {
    return null;
  }
}

function seedActiveResidentReceipt(
  root: RegionalPolarShoreEcologyRootV1,
  rootSeed: RootSeed,
  activeRegions: readonly RegionCoord[],
  residents: readonly RegionalPolarShoreEcologyActiveResidentInput[],
  preparedPristineBySource: ReadonlyMap<
    string,
    CoreEcologyAggregatePatchState
  > = new Map(),
  preparedAdmissionByPatch: WeakMap<
    CoreEcologyAggregatePatchState,
    PreparedPolarShoreResidentAdmission
  > | undefined = undefined,
): void {
  if (residents.length > activeRegions.length + root.regions.length) return;
  const activeKeys = new Set(activeRegions.map(regionKey));
  const receiptResidents: RegionalPolarShoreEcologyActiveReceiptResident[] = [];
  const seen = new Set<string>();
  const deviationKeys = new Set(root.regions.map(({ key }) => key));
  for (const resident of residents) {
    const patch = resident.patch;
    if (
      resident.kind !== CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND ||
      resident.sourceKey !== patch.patchKey ||
      patch.updatedAtTick !== root.updatedAtTick ||
      seen.has(resident.sourceKey) ||
      !activeKeys.has(regionKey(patch.originRegion)) ||
      !isPolarDerivation(patch)
    )
      return;
    const preparedAdmission = preparedAdmissionByPatch?.get(patch);
    let lineageHash = preparedPolarShoreAdmissionLineageOrNull(
      preparedAdmission,
      resident,
      root.updatedAtTick,
    );
    if (lineageHash === null) {
      if (
        canonicalCoreEcologyPolarShoreResidentPatch(patch, {
          seed: rootSeed,
          region: patch.originRegion,
          completedTick: root.updatedAtTick,
        }) === null
      )
        return;
      lineageHash = polarResidentLineageHash(patch);
    }
    seen.add(resident.sourceKey);
    const hasDeviation = deviationKeys.has(regionKey(patch.originRegion));
    const preparedPristine = preparedPristineBySource.get(resident.sourceKey);
    const pristinePatch = hasDeviation
      ? receiptPristinePatchOrNull(preparedPristine, resident, root.updatedAtTick)
      : patch;
    receiptResidents.push(
      Object.freeze({
        sourceKey: resident.sourceKey,
        regionKey: regionKey(patch.originRegion),
        habitatHash: patch.derivation.habitat.derivationHash,
        patchHash: hashCanonical(patch),
        lineageHash,
        patch,
        pristinePatch,
      }),
    );
  }
  receiptResidents.sort((left, right) =>
    compareText(left.sourceKey, right.sourceKey),
  );
  ACTIVE_RESIDENT_RECEIPTS.set(
    root,
    Object.freeze({
      rootSeed: Object.freeze([
        rootSeed[0],
        rootSeed[1],
        rootSeed[2],
        rootSeed[3],
      ] as [number, number, number, number]),
      atTick: root.updatedAtTick,
      activeRegionKeys: Object.freeze(activeRegions.map(regionKey)),
      residents: Object.freeze(receiptResidents),
    }),
  );
}

/**
 * Consume only the proof calculated for this exact patch in the immediately
 * enclosing admission transaction. Any identity or binding miss keeps the
 * complete world-bound validator and lineage fallback in receipt seeding.
 */
function preparedPolarShoreAdmissionLineageOrNull(
  prepared: PreparedPolarShoreResidentAdmission | undefined,
  resident: RegionalPolarShoreEcologyActiveResidentInput,
  receiptTick: number,
): string | null {
  const patch = resident.patch;
  return prepared !== undefined &&
    prepared.patch === patch &&
    Object.isFrozen(prepared) &&
    Object.isFrozen(prepared.patch) &&
    prepared.sourceKey === resident.sourceKey &&
    prepared.regionKey === regionKey(patch.originRegion) &&
    isPolarDerivation(patch) &&
    prepared.habitatHash === patch.derivation.habitat.derivationHash &&
    prepared.atTick === receiptTick &&
    patch.updatedAtTick === receiptTick &&
    validHash(prepared.lineageHash)
    ? prepared.lineageHash
    : null;
}

/**
 * Admit only a baseline produced inside this module's exact active-root
 * transaction. This process-local pointer is acceleration evidence, never
 * public or serialized authority; uncertainty keeps the constructor fallback.
 */
function receiptPristinePatchOrNull(
  patch: CoreEcologyAggregatePatchState | undefined,
  resident: RegionalPolarShoreEcologyActiveResidentInput,
  receiptTick: number,
): CoreEcologyAggregatePatchState | null {
  const residentPatch = resident.patch;
  return patch !== undefined
    && Object.isFrozen(patch)
    && canonicalizeCoreEcologyAggregatePatch(patch) === patch
    && patch.patchKey === resident.sourceKey
    && isPolarDerivation(patch)
    && isPolarDerivation(residentPatch)
    && patch.derivation.habitat.derivationHash
      === residentPatch.derivation.habitat.derivationHash
    && regionKey(patch.originRegion) === regionKey(residentPatch.originRegion)
    && patch.updatedAtTick <= receiptTick
    && polarResidentLineageHash(patch) === polarResidentLineageHash(residentPatch)
    && patch.populations.length === 0
    && patch.groups.groups.length === 0
    && patch.aggregatePopulations.length > 0
    && patch.nextMortalityOrdinal === 0
    && patch.mortalityTransactions.length === 0
    && patch.carcasses.length === 0
      ? patch
      : null;
}

function canonicalActiveReceiptClaimsOrNull(
  value: unknown,
): readonly RegionalPolarShoreEcologyActiveReceiptClaim[] | null {
  if (!Array.isArray(value)) return null;
  const claims: RegionalPolarShoreEcologyActiveReceiptClaim[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (
      !plainRecord(raw) ||
      !exactKeys(raw, [
        "lineageHash",
        "patchHash",
        "region",
        "sourceKey",
      ]) ||
      typeof raw.sourceKey !== "string" ||
      seen.has(raw.sourceKey) ||
      !isRegionCoord(raw.region) ||
      !validHash(raw.patchHash) ||
      !validHash(raw.lineageHash)
    )
      return null;
    seen.add(raw.sourceKey);
    claims.push(
      Object.freeze({
        sourceKey: raw.sourceKey,
        region: createRegionCoord(raw.region.x, raw.region.y),
        patchHash: raw.patchHash,
        lineageHash: raw.lineageHash,
      }),
    );
  }
  claims.sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  return Object.freeze(claims);
}

function claimsMatchActiveReceipt(
  claims: readonly RegionalPolarShoreEcologyActiveReceiptClaim[],
  residents: readonly RegionalPolarShoreEcologyActiveReceiptResident[],
): boolean {
  if (claims.length !== residents.length) return false;
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index]!;
    const resident = residents[index]!;
    if (
      claim.sourceKey !== resident.sourceKey ||
      regionKey(claim.region) !== resident.regionKey ||
      claim.patchHash !== resident.patchHash ||
      claim.lineageHash !== resident.lineageHash
    )
      return false;
  }
  return true;
}

function sameRootSeed(left: RootSeed, right: RootSeed): boolean {
  try {
    requireRootSeed(left);
  } catch {
    return false;
  }
  return (
    left.length === right.length &&
    left.every((word, index) => Object.is(word, right[index]))
  );
}

function sameTextSequence(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** Must remain byte-identical to the V3 snapshot's independent lineage oracle. */
function polarResidentLineageHash(
  patch: CoreEcologyAggregatePatchState,
): string {
  const livingActorIds = patch.populations.flatMap(({ members }) =>
    members.map(({ actor }) => actor.identity.stableId),
  );
  const retiredActorIds = patch.mortalityTransactions.map(
    ({ retiredActor }) => retiredActor.identity.stableId,
  );
  return hashCanonical({
    patchKey: patch.patchKey,
    originRegion: patch.originRegion,
    derivation: patch.derivation,
    populations: patch.populations.map(
      ({ species, populationKey, baselinePopulationSize }) => ({
        species,
        populationKey,
        baselinePopulationSize,
      }),
    ),
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

function canonicalPolarPatchShape(
  value: unknown,
  region: RegionCoord,
  baselineHash: string,
): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null ||
    stableStringify(patch) !== stableStringify(value) ||
    patch.originRegion.x !== region.x ||
    patch.originRegion.y !== region.y ||
    !isPolarDerivation(patch) ||
    patch.derivation.habitat.derivationHash !== baselineHash ||
    patch.populations.length !== 0 ||
    patch.groups.groups.length !== 0 ||
    patch.nextMortalityOrdinal !== 0 ||
    patch.mortalityTransactions.length !== 0 ||
    patch.carcasses.length !== 0
  )
    return null;
  return patch;
}

function isPolarDerivation(
  patch: CoreEcologyAggregatePatchState,
): patch is CoreEcologyAggregatePatchState &
  Readonly<{
    readonly derivation: Readonly<{
      readonly kind: typeof CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND;
      readonly habitat: ReturnType<typeof deriveCoreEcologyPolarShoreHabitat>;
    }>;
  }> {
  return patch.derivation.kind === CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND;
}

function sealRoot(
  value: Omit<RegionalPolarShoreEcologyRootV1, "integrity">,
): RegionalPolarShoreEcologyRootV1 {
  const root = canonicalizeRegionalPolarShoreEcologyRoot({
    ...value,
    integrity: hashCanonical(value),
  });
  if (root === null)
    throw new Error("Generated regional polar-shore root failed validation");
  return root;
}

function seedFingerprint(seed: RootSeed): string {
  requireRootSeed(seed);
  return hashCanonical([...seed]);
}

function requireBinding(binding: RegionalPolarShoreEcologyWorldBinding): void {
  if (
    !plainRecord(binding) ||
    !Object.hasOwn(binding, "rootSeed") ||
    !Object.hasOwn(binding, "completedTick")
  )
    throw new TypeError(
      "Regional polar-shore ecology requires a world binding",
    );
  requireRootSeed(binding.rootSeed as RootSeed);
  if (!nonnegativeSafeInteger(binding.completedTick)) {
    throw new RangeError(
      "Regional polar-shore tick must be a nonnegative safe integer",
    );
  }
}

function requireRootSeed(seed: RootSeed): void {
  if (
    !Array.isArray(seed) ||
    seed.length !== 4 ||
    seed.some(
      (word) =>
        !Number.isSafeInteger(word) ||
        word < 0 ||
        word > UINT32_MAX ||
        Object.is(word, -0),
    )
  )
    throw new RangeError(
      "Regional polar-shore seed must contain four uint32 words",
    );
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    !Object.is(value, -0)
  );
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function canonicalRegionsOrNull(
  values: readonly unknown[],
): readonly RegionCoord[] | null {
  if (!Array.isArray(values)) return null;
  const byKey = new Map<string, RegionCoord>();
  for (const value of values) {
    if (!isRegionCoord(value)) return null;
    const region = createRegionCoord(value.x, value.y);
    byKey.set(regionKey(region), region);
  }
  return Object.freeze(
    [...byKey.values()].sort(
      (left, right) => left.x - right.x || left.y - right.y,
    ),
  );
}

function regionalDeltaByKey(
  regions: readonly RegionalPolarShoreEcologyRegionDeltaV1[],
  key: string,
): RegionalPolarShoreEcologyRegionDeltaV1 | undefined {
  let low = 0;
  let high = regions.length - 1;
  while (low <= high) {
    const middle = low + Math.trunc((high - low) / 2);
    const candidate = regions[middle];
    if (candidate === undefined) return undefined;
    const order = compareText(candidate.key, key);
    if (order === 0) return candidate;
    if (order < 0) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
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
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
