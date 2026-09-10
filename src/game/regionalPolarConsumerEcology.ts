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
  CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
  deriveCoreEcologyPolarConsumerHabitat,
} from "./coreEcologyPolarConsumerHabitat";
import { deriveCoreEcologyPolarShoreTerritory } from "./coreEcologyPolarShoreHabitat";
import {
  canonicalCoreEcologyPolarConsumerResidentPatch,
  coreEcologyPolarConsumerResidentPatchIsAllCoarse,
  coreEcologyPolarConsumerResidentPatchResidenceRegions,
  createCoreEcologyPolarConsumerResidentPatch,
  reconcileCoreEcologyPolarConsumerResidentPatchAtTick,
} from "./regionalPolarConsumerResidents";

export const REGIONAL_POLAR_CONSUMER_ECOLOGY_ROOT_VERSION = 1 as const;
export const REGIONAL_POLAR_CONSUMER_ECOLOGY_DELTA_VERSION = 1 as const;
export const REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID =
  "game:regional-polar-consumer-ecology:v1" as const;
export const REGIONAL_POLAR_CONSUMER_ECOLOGY_BASELINE_POLICY_ID =
  CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND;
export const REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_REGIONS = 32_768 as const;
export const REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES =
  4 * 1_024 * 1_024;
export const REGIONAL_POLAR_CONSUMER_ECOLOGY_ACTIVE_REGION_LIMIT = 9 as const;

export interface RegionalPolarConsumerEcologyWorldBinding {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
}

export interface RegionalPolarConsumerEcologyRegionDeltaV1 {
  readonly version: typeof REGIONAL_POLAR_CONSUMER_ECOLOGY_DELTA_VERSION;
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

/** Sparse sibling root; pristine or merely visited habitat costs zero rows. */
export interface RegionalPolarConsumerEcologyRootV1 {
  readonly version: typeof REGIONAL_POLAR_CONSUMER_ECOLOGY_ROOT_VERSION;
  readonly ownerId: typeof REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID;
  readonly generationVersion: 1;
  readonly baselinePolicyId: typeof REGIONAL_POLAR_CONSUMER_ECOLOGY_BASELINE_POLICY_ID;
  readonly seedFingerprint: string;
  readonly updatedAtTick: number;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  readonly regions: readonly RegionalPolarConsumerEcologyRegionDeltaV1[];
  readonly integrity: string;
}

export interface PutRegionalPolarConsumerEcologyResidentDeviationInput {
  readonly rootSeed: RootSeed;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalPolarConsumerEcologyActiveResidentInput {
  readonly kind: typeof CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND;
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const UINT32_MAX = 0xffff_ffff;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_ROOTS = new WeakSet<object>();
const WORLD_BOUND_ROOTS = new WeakMap<object, string>();

export function createPristineRegionalPolarConsumerEcologyRoot(
  binding: RegionalPolarConsumerEcologyWorldBinding,
): RegionalPolarConsumerEcologyRootV1 {
  requireBinding(binding);
  const root = sealRoot({
    version: REGIONAL_POLAR_CONSUMER_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID,
    generationVersion: 1,
    baselinePolicyId: REGIONAL_POLAR_CONSUMER_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: seedFingerprint(binding.rootSeed),
    updatedAtTick: binding.completedTick,
    revision: 0,
    lastEventOrdinal: 0,
    regions: Object.freeze([]),
  });
  WORLD_BOUND_ROOTS.set(root, root.seedFingerprint);
  return root;
}

export function createRegionalPolarConsumerEcologyRegionDelta(
  input: Readonly<{
    readonly rootSeed: RootSeed;
    readonly region: RegionCoord;
    readonly baselineHash: string;
    readonly revision: number;
    readonly eventOrdinal: number;
    readonly residentPatch: CoreEcologyAggregatePatchState;
  }>,
): RegionalPolarConsumerEcologyRegionDeltaV1 {
  requireRootSeed(input.rootSeed);
  if (
    !isRegionCoord(input.region) ||
    !validHash(input.baselineHash) ||
    !positiveSafeInteger(input.revision) ||
    !positiveSafeInteger(input.eventOrdinal)
  ) {
    throw new RangeError(
      "Regional polar-consumer ecology refuses a malformed delta",
    );
  }
  const patch = canonicalCoreEcologyPolarConsumerResidentPatch(
    input.residentPatch,
    {
      seed: input.rootSeed,
      region: input.region,
      completedTick: input.residentPatch.updatedAtTick,
    },
  );
  const derivation = patch?.derivation as unknown as
    | Readonly<{
        readonly kind?: unknown;
        readonly habitat?: Readonly<{ readonly derivationHash?: unknown }>;
      }>
    | undefined;
  if (
    patch === null ||
    !coreEcologyPolarConsumerResidentPatchIsAllCoarse(patch) ||
    patch.originRegion.x !== input.region.x ||
    patch.originRegion.y !== input.region.y ||
    derivation?.kind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND ||
    derivation.habitat?.derivationHash !== input.baselineHash
  ) {
    throw new RangeError(
      "Regional polar-consumer ecology requires a bound coarse deviation",
    );
  }
  const pristine = createCoreEcologyPolarConsumerResidentPatch({
    seed: input.rootSeed,
    habitat: deriveCoreEcologyPolarConsumerHabitat({
      seed: input.rootSeed,
      region: input.region,
    }),
    tick: patch.updatedAtTick,
  });
  if (stableStringify(pristine) === stableStringify(patch)) {
    throw new RangeError(
      "Regional polar-consumer ecology does not persist pristine baselines",
    );
  }
  const base = {
    version: REGIONAL_POLAR_CONSUMER_ECOLOGY_DELTA_VERSION,
    stableId: stableRegionObjectId(
      input.rootSeed,
      input.region,
      "polar-consumer-deviation",
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

export function canonicalizeRegionalPolarConsumerEcologyRegionDelta(
  value: unknown,
  rootSeed?: RootSeed,
): RegionalPolarConsumerEcologyRegionDeltaV1 | null {
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
    ]) ||
    value.version !== REGIONAL_POLAR_CONSUMER_ECOLOGY_DELTA_VERSION ||
    !validId(value.stableId) ||
    !isRegionCoord(value.region) ||
    value.key !== regionKey(value.region) ||
    !validId(value.regionId) ||
    !validHash(value.baselineHash) ||
    !positiveSafeInteger(value.revision) ||
    !positiveSafeInteger(value.eventOrdinal) ||
    !validHash(value.residentPatchHash) ||
    !validHash(value.integrity)
  ) {
    return null;
  }
  const patch = canonicalPolarConsumerPatchShape(
    value.residentPatch,
    value.region,
    value.baselineHash,
  );
  if (patch === null || value.residentPatchHash !== hashCanonical(patch)) {
    return null;
  }
  const base = {
    version: REGIONAL_POLAR_CONSUMER_ECOLOGY_DELTA_VERSION,
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
          "polar-consumer-deviation",
          "v1",
        ) ||
      delta.regionId !== stableRegionId(rootSeed, delta.region)
    ) {
      return null;
    }
    const habitat = deriveCoreEcologyPolarConsumerHabitat({
      seed: rootSeed,
      region: delta.region,
    });
    if (
      habitat.totalPopulationUnits === 0 ||
      delta.baselineHash !== habitat.derivationHash ||
      canonicalCoreEcologyPolarConsumerResidentPatch(delta.residentPatch, {
        seed: rootSeed,
        region: delta.region,
        completedTick: delta.residentPatch.updatedAtTick,
      }) === null
    ) {
      return null;
    }
    const pristine = createCoreEcologyPolarConsumerResidentPatch({
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

export function canonicalizeRegionalPolarConsumerEcologyRoot(
  value: unknown,
): RegionalPolarConsumerEcologyRootV1 | null {
  if (typeof value === "object" && value !== null && TRUSTED_ROOTS.has(value)) {
    return value as RegionalPolarConsumerEcologyRootV1;
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
    ]) ||
    value.version !== REGIONAL_POLAR_CONSUMER_ECOLOGY_ROOT_VERSION ||
    value.ownerId !== REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID ||
    value.generationVersion !== 1 ||
    value.baselinePolicyId !==
      REGIONAL_POLAR_CONSUMER_ECOLOGY_BASELINE_POLICY_ID ||
    !validHash(value.seedFingerprint) ||
    !nonnegativeSafeInteger(value.updatedAtTick) ||
    !nonnegativeSafeInteger(value.revision) ||
    !nonnegativeSafeInteger(value.lastEventOrdinal) ||
    !Array.isArray(value.regions) ||
    value.regions.length > REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_REGIONS ||
    !validHash(value.integrity)
  ) {
    return null;
  }
  const regions: RegionalPolarConsumerEcologyRegionDeltaV1[] = [];
  for (const raw of value.regions) {
    const delta = canonicalizeRegionalPolarConsumerEcologyRegionDelta(raw);
    if (
      delta === null ||
      delta.revision > value.revision ||
      delta.eventOrdinal > value.lastEventOrdinal ||
      delta.residentPatch.updatedAtTick > value.updatedAtTick
    ) {
      return null;
    }
    regions.push(delta);
  }
  regions.sort((left, right) => compareText(left.key, right.key));
  if (
    regions.some(
      (region, index) => index > 0 && regions[index - 1]!.key === region.key,
    ) ||
    (value.revision === 0) !== (value.lastEventOrdinal === 0)
  ) {
    return null;
  }
  const base = {
    version: REGIONAL_POLAR_CONSUMER_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID,
    generationVersion: 1 as const,
    baselinePolicyId: REGIONAL_POLAR_CONSUMER_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: value.seedFingerprint,
    updatedAtTick: value.updatedAtTick,
    revision: value.revision,
    lastEventOrdinal: value.lastEventOrdinal,
    regions: Object.freeze(regions),
  } as const;
  if (hashCanonical(base) !== value.integrity) return null;
  const root = deepFreeze({ ...base, integrity: value.integrity });
  if (
    serializedBytes(root) > REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES
  ) {
    return null;
  }
  TRUSTED_ROOTS.add(root);
  return root;
}

export function canonicalRegionalPolarConsumerEcologyRootForWorld(
  value: unknown,
  binding: RegionalPolarConsumerEcologyWorldBinding,
): RegionalPolarConsumerEcologyRootV1 | null {
  try {
    requireBinding(binding);
  } catch {
    return null;
  }
  const root = canonicalizeRegionalPolarConsumerEcologyRoot(value);
  if (
    root === null ||
    root.seedFingerprint !== seedFingerprint(binding.rootSeed) ||
    root.updatedAtTick !== binding.completedTick
  ) {
    return null;
  }
  if (WORLD_BOUND_ROOTS.get(root) === root.seedFingerprint) return root;
  for (const region of root.regions) {
    const bound = canonicalizeRegionalPolarConsumerEcologyRegionDelta(
      region,
      binding.rootSeed,
    );
    if (bound === null || stableStringify(bound) !== stableStringify(region)) {
      return null;
    }
  }
  WORLD_BOUND_ROOTS.set(root, root.seedFingerprint);
  return root;
}

export function advanceRegionalPolarConsumerEcologyRoot(
  value: unknown,
  completedTick: number,
): RegionalPolarConsumerEcologyRootV1 {
  const root = canonicalizeRegionalPolarConsumerEcologyRoot(value);
  if (
    root === null ||
    !nonnegativeSafeInteger(completedTick) ||
    completedTick < root.updatedAtTick
  ) {
    throw new RangeError("Regional polar-consumer ecology clock cannot rewind");
  }
  if (completedTick === root.updatedAtTick) return root;
  const { integrity: _integrity, ...base } = root;
  const advanced = sealRoot({ ...base, updatedAtTick: completedTick });
  if (WORLD_BOUND_ROOTS.get(root) === root.seedFingerprint) {
    WORLD_BOUND_ROOTS.set(advanced, advanced.seedFingerprint);
  }
  return advanced;
}

/** Persists only a real all-coarse deviation; exact baselines stay derived. */
export function putRegionalPolarConsumerEcologyResidentDeviation(
  value: unknown,
  input: PutRegionalPolarConsumerEcologyResidentDeviationInput,
): RegionalPolarConsumerEcologyRootV1 {
  const structural = canonicalizeRegionalPolarConsumerEcologyRoot(value);
  if (structural === null) {
    throw new TypeError("Regional polar-consumer ecology root is malformed");
  }
  const root = canonicalRegionalPolarConsumerEcologyRootForWorld(structural, {
    rootSeed: input.rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null) {
    throw new RangeError(
      "Regional polar-consumer ecology root belongs to another world",
    );
  }
  const activePatch = canonicalCoreEcologyPolarConsumerResidentPatch(
    input.patch,
    {
      seed: input.rootSeed,
      region: input.patch.originRegion,
      completedTick: root.updatedAtTick,
    },
  );
  if (activePatch === null) {
    throw new RangeError(
      "Regional polar-consumer ecology deviation is unbound",
    );
  }
  const normalized = setCoreEcologyAggregatePatchMaterializedActors(
    activePatch,
    { atTick: root.updatedAtTick, actorIds: [] },
  );
  const habitat = deriveCoreEcologyPolarConsumerHabitat({
    seed: input.rootSeed,
    region: normalized.originRegion,
  });
  if (habitat.totalPopulationUnits === 0) {
    throw new RangeError("Empty polar-consumer habitat cannot own a deviation");
  }
  const pristine = createCoreEcologyPolarConsumerResidentPatch({
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
    throw new RangeError("Regional polar-consumer ecology ordinal exhausted");
  }
  const regions = root.regions.filter((entry) => entry.key !== key);
  if (!pristineState) {
    regions.push(
      createRegionalPolarConsumerEcologyRegionDelta({
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

export function regionalPolarConsumerEcologyResidentDeviation(
  value: unknown,
  rootSeed: RootSeed,
  region: RegionCoord,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalizeRegionalPolarConsumerEcologyRoot(value);
  if (root === null || !isRegionCoord(region)) return null;
  const bound = canonicalRegionalPolarConsumerEcologyRootForWorld(root, {
    rootSeed,
    completedTick: root.updatedAtTick,
  });
  return bound === null
    ? null
    : (regionalDeltaByKey(bound.regions, regionKey(region))?.residentPatch ??
        null);
}

export function regionalPolarConsumerEcologyResidentPatchForRegion(
  value: unknown,
  rootSeed: RootSeed,
  region: RegionCoord,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalizeRegionalPolarConsumerEcologyRoot(value);
  if (root === null || !isRegionCoord(region)) return null;
  const bound = canonicalRegionalPolarConsumerEcologyRootForWorld(root, {
    rootSeed,
    completedTick: root.updatedAtTick,
  });
  if (bound === null) return null;
  const delta = regionalDeltaByKey(bound.regions, regionKey(region));
  if (delta !== undefined) {
    return reconcileCoreEcologyPolarConsumerResidentPatchAtTick(
      delta.residentPatch,
      root.updatedAtTick,
    );
  }
  if (!deriveCoreEcologyPolarShoreTerritory(rootSeed, region).regionIsHost) {
    return null;
  }
  const habitat = deriveCoreEcologyPolarConsumerHabitat({
    seed: rootSeed,
    region,
  });
  return habitat.totalPopulationUnits === 0
    ? null
    : createCoreEcologyPolarConsumerResidentPatch({
        seed: rootSeed,
        habitat,
        tick: root.updatedAtTick,
      });
}

/**
 * Selects lineage origins plus stored actors physically inside a bounded active
 * neighborhood, without advancing unrelated pristine world history.
 */
export function regionalPolarConsumerEcologyResidentsForActiveRegions(
  value: unknown,
  rootSeed: RootSeed,
  regionsValue: readonly RegionCoord[],
): readonly RegionalPolarConsumerEcologyActiveResidentInput[] | null {
  const structural = canonicalizeRegionalPolarConsumerEcologyRoot(value);
  const activeRegions = canonicalRegionsOrNull(regionsValue);
  if (
    structural === null ||
    activeRegions === null ||
    activeRegions.length === 0 ||
    activeRegions.length > REGIONAL_POLAR_CONSUMER_ECOLOGY_ACTIVE_REGION_LIMIT
  ) {
    return null;
  }
  const root = canonicalRegionalPolarConsumerEcologyRootForWorld(structural, {
    rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null) return null;
  const activeKeys = new Set(activeRegions.map(regionKey));
  const bySource = new Map<
    string,
    RegionalPolarConsumerEcologyActiveResidentInput
  >();
  const admit = (storedPatch: CoreEcologyAggregatePatchState): boolean => {
    const patch = reconcileCoreEcologyPolarConsumerResidentPatchAtTick(
      storedPatch,
      root.updatedAtTick,
    );
    if (
      patch === null ||
      canonicalCoreEcologyPolarConsumerResidentPatch(patch, {
        seed: rootSeed,
        region: patch.originRegion,
        completedTick: root.updatedAtTick,
      }) === null
    ) {
      return false;
    }
    if (bySource.has(patch.patchKey)) return true;
    bySource.set(
      patch.patchKey,
      Object.freeze({
        kind: CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
        sourceKey: patch.patchKey,
        patch,
      }),
    );
    return true;
  };

  for (const region of activeRegions) {
    const delta = regionalDeltaByKey(root.regions, regionKey(region));
    if (delta !== undefined) {
      if (!admit(delta.residentPatch)) return null;
      continue;
    }
    if (!deriveCoreEcologyPolarShoreTerritory(rootSeed, region).regionIsHost) {
      continue;
    }
    const habitat = deriveCoreEcologyPolarConsumerHabitat({
      seed: rootSeed,
      region,
    });
    if (habitat.totalPopulationUnits === 0) continue;
    if (
      !admit(
        createCoreEcologyPolarConsumerResidentPatch({
          seed: rootSeed,
          habitat,
          tick: root.updatedAtTick,
        }),
      )
    ) {
      return null;
    }
  }

  for (const delta of root.regions) {
    if (activeKeys.has(delta.key)) continue;
    const patch = reconcileCoreEcologyPolarConsumerResidentPatchAtTick(
      delta.residentPatch,
      root.updatedAtTick,
    );
    if (patch === null) return null;
    const residences =
      coreEcologyPolarConsumerResidentPatchResidenceRegions(patch);
    if (residences === null) return null;
    if (!residences.some((region) => activeKeys.has(regionKey(region)))) {
      continue;
    }
    if (!admit(patch)) return null;
  }
  return Object.freeze(
    [...bySource.values()].sort((left, right) =>
      compareText(left.sourceKey, right.sourceKey),
    ),
  );
}

export function serializeRegionalPolarConsumerEcologyRoot(
  value: unknown,
): string {
  const root = canonicalizeRegionalPolarConsumerEcologyRoot(value);
  if (root === null) {
    throw new TypeError("Regional polar-consumer ecology root is malformed");
  }
  const text = stableStringify(root);
  if (
    UTF8_ENCODER.encode(text).byteLength >
    REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES
  ) {
    throw new RangeError(
      "Regional polar-consumer ecology root exceeds its save budget",
    );
  }
  return text;
}

export function deserializeRegionalPolarConsumerEcologyRoot(
  text: unknown,
): RegionalPolarConsumerEcologyRootV1 | null {
  if (
    typeof text !== "string" ||
    text.length === 0 ||
    UTF8_ENCODER.encode(text).byteLength >
      REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    const root = canonicalizeRegionalPolarConsumerEcologyRoot(parsed);
    return root !== null && stableStringify(root) === text ? root : null;
  } catch {
    return null;
  }
}

function canonicalPolarConsumerPatchShape(
  value: unknown,
  region: RegionCoord,
  baselineHash: string,
): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as
    | Readonly<{
        readonly kind?: unknown;
        readonly habitat?: Readonly<{ readonly derivationHash?: unknown }>;
      }>
    | undefined;
  if (
    patch === null ||
    stableStringify(patch) !== stableStringify(value) ||
    derivation?.kind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND ||
    derivation.habitat?.derivationHash !== baselineHash ||
    patch.originRegion.x !== region.x ||
    patch.originRegion.y !== region.y ||
    patch.nextMortalityOrdinal !== 0 ||
    patch.mortalityTransactions.length !== 0 ||
    patch.carcasses.length !== 0 ||
    !coreEcologyPolarConsumerResidentPatchIsAllCoarse(patch)
  ) {
    return null;
  }
  return patch;
}

function sealRoot(
  value: Omit<RegionalPolarConsumerEcologyRootV1, "integrity">,
): RegionalPolarConsumerEcologyRootV1 {
  const root = canonicalizeRegionalPolarConsumerEcologyRoot({
    ...value,
    integrity: hashCanonical(value),
  });
  if (root === null) {
    throw new Error(
      "Generated regional polar-consumer ecology root failed validation",
    );
  }
  return root;
}

function seedFingerprint(seed: RootSeed): string {
  requireRootSeed(seed);
  return hashCanonical([...seed]);
}

function requireBinding(
  binding: RegionalPolarConsumerEcologyWorldBinding,
): void {
  if (
    !plainRecord(binding) ||
    !Object.hasOwn(binding, "rootSeed") ||
    !Object.hasOwn(binding, "completedTick")
  ) {
    throw new TypeError(
      "Regional polar-consumer ecology requires a world binding",
    );
  }
  requireRootSeed(binding.rootSeed as RootSeed);
  if (!nonnegativeSafeInteger(binding.completedTick)) {
    throw new RangeError(
      "Regional polar-consumer ecology tick must be nonnegative",
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
  ) {
    throw new RangeError(
      "Regional polar-consumer seed must contain four uint32 words",
    );
  }
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

function serializedBytes(value: unknown): number {
  return UTF8_ENCODER.encode(stableStringify(value)).byteLength;
}

function regionalDeltaByKey(
  regions: readonly RegionalPolarConsumerEcologyRegionDeltaV1[],
  key: string,
): RegionalPolarConsumerEcologyRegionDeltaV1 | undefined {
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
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
