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
  CORE_ECOLOGY_MAX_STEP_TICKS,
  advanceCoreEcologyDormantAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
  deriveCoreEcologyAlpineHabitat,
} from "./coreEcologyAlpineHabitat";
import {
  canonicalCoreEcologyAlpineResidentPatch,
  coreEcologyAlpineResidentPatchResidenceRegions,
  coreEcologyAlpineResidentPatchIsAllCoarse,
  createCoreEcologyAlpineResidentPatch,
} from "./regionalAlpineResidents";

export const REGIONAL_ALPINE_ECOLOGY_ROOT_VERSION = 1 as const;
export const REGIONAL_ALPINE_ECOLOGY_DELTA_VERSION = 1 as const;
export const REGIONAL_ALPINE_ECOLOGY_OWNER_ID =
  "game:regional-alpine-ecology:v1" as const;
export const REGIONAL_ALPINE_ECOLOGY_BASELINE_POLICY_ID =
  CORE_ECOLOGY_ALPINE_DERIVATION_KIND;
export const REGIONAL_ALPINE_ECOLOGY_MAX_REGIONS = 32_768 as const;
export const REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES = 4 * 1_024 * 1_024;
export const REGIONAL_ALPINE_ECOLOGY_ACTIVE_REGION_LIMIT = 9 as const;

export interface RegionalAlpineEcologyWorldBinding {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
}

/** A pristine or merely visited region has no durable record. */
export interface RegionalAlpineEcologyRegionDeltaV1 {
  readonly version: typeof REGIONAL_ALPINE_ECOLOGY_DELTA_VERSION;
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

/**
 * Append-only sibling of RegionalEcologyStateV1. It has no adoption field:
 * Alpha-32 identities stay in the sealed base child and Alpine baselines are
 * always freshly rederivable from their own owner.
 */
export interface RegionalAlpineEcologyRootV1 {
  readonly version: typeof REGIONAL_ALPINE_ECOLOGY_ROOT_VERSION;
  readonly ownerId: typeof REGIONAL_ALPINE_ECOLOGY_OWNER_ID;
  readonly generationVersion: 1;
  readonly baselinePolicyId: typeof REGIONAL_ALPINE_ECOLOGY_BASELINE_POLICY_ID;
  readonly seedFingerprint: string;
  readonly updatedAtTick: number;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  readonly regions: readonly RegionalAlpineEcologyRegionDeltaV1[];
  readonly integrity: string;
}

export interface PutRegionalAlpineEcologyResidentDeviationInput {
  readonly rootSeed: RootSeed;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalAlpineEcologyActiveResidentInput {
  readonly kind: typeof CORE_ECOLOGY_ALPINE_DERIVATION_KIND;
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const UINT32_MAX = 0xffff_ffff;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_ROOTS = new WeakSet<object>();

export function createPristineRegionalAlpineEcologyRoot(
  binding: RegionalAlpineEcologyWorldBinding,
): RegionalAlpineEcologyRootV1 {
  requireBinding(binding);
  return sealRoot({
    version: REGIONAL_ALPINE_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
    generationVersion: 1,
    baselinePolicyId: REGIONAL_ALPINE_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: seedFingerprint(binding.rootSeed),
    updatedAtTick: binding.completedTick,
    revision: 0,
    lastEventOrdinal: 0,
    regions: Object.freeze([]),
  });
}

export function createRegionalAlpineEcologyRegionDelta(input: Readonly<{
  readonly rootSeed: RootSeed;
  readonly region: RegionCoord;
  readonly baselineHash: string;
  readonly revision: number;
  readonly eventOrdinal: number;
  readonly residentPatch: CoreEcologyAggregatePatchState;
}>): RegionalAlpineEcologyRegionDeltaV1 {
  requireRootSeed(input.rootSeed);
  if (
    !isRegionCoord(input.region)
    || !validHash(input.baselineHash)
    || !positiveSafeInteger(input.revision)
    || !positiveSafeInteger(input.eventOrdinal)
  ) throw new RangeError("Regional Alpine ecology refuses a malformed region delta");
  const patch = canonicalCoreEcologyAlpineResidentPatch(input.residentPatch, {
    seed: input.rootSeed,
    region: input.region,
    completedTick: input.residentPatch.updatedAtTick,
  });
  const derivation = patch?.derivation as unknown as Readonly<{
    readonly kind?: unknown;
    readonly habitat?: Readonly<{ readonly derivationHash?: unknown }>;
  }> | undefined;
  if (
    patch === null
    || !coreEcologyAlpineResidentPatchIsAllCoarse(patch)
    || patch.originRegion.x !== input.region.x
    || patch.originRegion.y !== input.region.y
    || derivation?.kind !== CORE_ECOLOGY_ALPINE_DERIVATION_KIND
    || derivation.habitat?.derivationHash !== input.baselineHash
  ) throw new RangeError("Regional Alpine ecology requires an all-coarse bound deviation");
  const pristine = createCoreEcologyAlpineResidentPatch({
    seed: input.rootSeed,
    habitat: deriveCoreEcologyAlpineHabitat({ seed: input.rootSeed, region: input.region }),
    tick: patch.updatedAtTick,
  });
  if (stableStringify(pristine) === stableStringify(patch)) {
    throw new RangeError("Regional Alpine ecology does not persist pristine baselines");
  }
  const base = {
    version: REGIONAL_ALPINE_ECOLOGY_DELTA_VERSION,
    stableId: stableRegionObjectId(input.rootSeed, input.region, "alpine-deviation", "v1"),
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

export function canonicalizeRegionalAlpineEcologyRegionDelta(
  value: unknown,
  rootSeed?: RootSeed,
): RegionalAlpineEcologyRegionDeltaV1 | null {
  if (!plainRecord(value) || !exactKeys(value, [
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
  ])) return null;
  if (
    value.version !== REGIONAL_ALPINE_ECOLOGY_DELTA_VERSION
    || !validId(value.stableId)
    || !isRegionCoord(value.region)
    || value.key !== regionKey(value.region)
    || !validId(value.regionId)
    || !validHash(value.baselineHash)
    || !positiveSafeInteger(value.revision)
    || !positiveSafeInteger(value.eventOrdinal)
    || !validHash(value.residentPatchHash)
    || !validHash(value.integrity)
  ) return null;
  const patch = canonicalAlpinePatchShape(value.residentPatch, value.region, value.baselineHash);
  if (patch === null || value.residentPatchHash !== hashCanonical(patch)) return null;
  const base = {
    version: REGIONAL_ALPINE_ECOLOGY_DELTA_VERSION,
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
      delta.stableId !== stableRegionObjectId(rootSeed, delta.region, "alpine-deviation", "v1")
      || delta.regionId !== stableRegionId(rootSeed, delta.region)
    ) return null;
    const habitat = deriveCoreEcologyAlpineHabitat({ seed: rootSeed, region: delta.region });
    if (
      habitat.totalPopulationUnits === 0
      || delta.baselineHash !== habitat.derivationHash
      || canonicalCoreEcologyAlpineResidentPatch(delta.residentPatch, {
        seed: rootSeed,
        region: delta.region,
        completedTick: delta.residentPatch.updatedAtTick,
      }) === null
    ) return null;
    const pristine = createCoreEcologyAlpineResidentPatch({
      seed: rootSeed,
      habitat,
      tick: delta.residentPatch.updatedAtTick,
    });
    return stableStringify(pristine) === stableStringify(delta.residentPatch) ? null : delta;
  } catch {
    return null;
  }
}

export function canonicalizeRegionalAlpineEcologyRoot(
  value: unknown,
): RegionalAlpineEcologyRootV1 | null {
  if (typeof value === "object" && value !== null && TRUSTED_ROOTS.has(value)) {
    return value as RegionalAlpineEcologyRootV1;
  }
  if (!plainRecord(value) || !exactKeys(value, [
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
    value.version !== REGIONAL_ALPINE_ECOLOGY_ROOT_VERSION
    || value.ownerId !== REGIONAL_ALPINE_ECOLOGY_OWNER_ID
    || value.generationVersion !== 1
    || value.baselinePolicyId !== REGIONAL_ALPINE_ECOLOGY_BASELINE_POLICY_ID
    || !validHash(value.seedFingerprint)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !nonnegativeSafeInteger(value.revision)
    || !nonnegativeSafeInteger(value.lastEventOrdinal)
    || !Array.isArray(value.regions)
    || value.regions.length > REGIONAL_ALPINE_ECOLOGY_MAX_REGIONS
    || !validHash(value.integrity)
  ) return null;
  const regions: RegionalAlpineEcologyRegionDeltaV1[] = [];
  for (const raw of value.regions) {
    const delta = canonicalizeRegionalAlpineEcologyRegionDelta(raw);
    if (
      delta === null
      || delta.revision > value.revision
      || delta.eventOrdinal > value.lastEventOrdinal
      || delta.residentPatch.updatedAtTick > value.updatedAtTick
    ) return null;
    regions.push(delta);
  }
  regions.sort((left, right) => compareText(left.key, right.key));
  if (
    regions.some((region, index) => index > 0 && regions[index - 1]!.key === region.key)
    || ((value.revision === 0) !== (value.lastEventOrdinal === 0))
  ) return null;
  const base = {
    version: REGIONAL_ALPINE_ECOLOGY_ROOT_VERSION,
    ownerId: REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
    generationVersion: 1 as const,
    baselinePolicyId: REGIONAL_ALPINE_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: value.seedFingerprint,
    updatedAtTick: value.updatedAtTick,
    revision: value.revision,
    lastEventOrdinal: value.lastEventOrdinal,
    regions: Object.freeze(regions),
  } as const;
  if (hashCanonical(base) !== value.integrity) return null;
  const root = deepFreeze({ ...base, integrity: value.integrity });
  if (serializedBytes(root) > REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES) return null;
  TRUSTED_ROOTS.add(root);
  return root;
}

export function canonicalRegionalAlpineEcologyRootForWorld(
  value: unknown,
  binding: RegionalAlpineEcologyWorldBinding,
): RegionalAlpineEcologyRootV1 | null {
  try {
    requireBinding(binding);
  } catch {
    return null;
  }
  const root = canonicalizeRegionalAlpineEcologyRoot(value);
  if (
    root === null
    || root.seedFingerprint !== seedFingerprint(binding.rootSeed)
    || root.updatedAtTick !== binding.completedTick
  ) return null;
  for (const region of root.regions) {
    const bound = canonicalizeRegionalAlpineEcologyRegionDelta(region, binding.rootSeed);
    if (bound === null || stableStringify(bound) !== stableStringify(region)) return null;
  }
  return root;
}

export function advanceRegionalAlpineEcologyRoot(
  value: unknown,
  completedTick: number,
): RegionalAlpineEcologyRootV1 {
  const root = canonicalizeRegionalAlpineEcologyRoot(value);
  if (
    root === null
    || !nonnegativeSafeInteger(completedTick)
    || completedTick < root.updatedAtTick
  ) throw new RangeError("Regional Alpine ecology clock cannot rewind");
  if (completedTick === root.updatedAtTick) return root;
  const { integrity: _integrity, ...base } = root;
  return sealRoot({ ...base, updatedAtTick: completedTick });
}

/**
 * Writes only a real all-coarse deviation. Returning to the exact derivable
 * baseline removes the region record instead of making exploration grow the
 * save forever.
 */
export function putRegionalAlpineEcologyResidentDeviation(
  value: unknown,
  input: PutRegionalAlpineEcologyResidentDeviationInput,
): RegionalAlpineEcologyRootV1 {
  const structural = canonicalizeRegionalAlpineEcologyRoot(value);
  if (structural === null) throw new TypeError("Regional Alpine ecology root is malformed");
  const root = canonicalRegionalAlpineEcologyRootForWorld(structural, {
    rootSeed: input.rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null) throw new RangeError("Regional Alpine ecology root belongs to another world");
  const activePatch = canonicalCoreEcologyAlpineResidentPatch(input.patch, {
    seed: input.rootSeed,
    region: input.patch.originRegion,
    completedTick: root.updatedAtTick,
  });
  if (activePatch === null) throw new RangeError("Regional Alpine ecology deviation is unbound");
  const normalized = setCoreEcologyAggregatePatchMaterializedActors(activePatch, {
    atTick: root.updatedAtTick,
    actorIds: [],
  });
  const habitat = deriveCoreEcologyAlpineHabitat({
    seed: input.rootSeed,
    region: normalized.originRegion,
  });
  if (habitat.totalPopulationUnits === 0) {
    throw new RangeError("An empty Alpine baseline cannot own a resident deviation");
  }
  const pristine = createCoreEcologyAlpineResidentPatch({
    seed: input.rootSeed,
    habitat,
    tick: root.updatedAtTick,
  });
  const pristineState = stableStringify(normalized) === stableStringify(pristine);
  const key = regionKey(normalized.originRegion);
  const existing = root.regions.find((region) => region.key === key);
  if (pristineState && existing === undefined) return root;
  const revision = root.revision + 1;
  const eventOrdinal = root.lastEventOrdinal + 1;
  if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(eventOrdinal)) {
    throw new RangeError("Regional Alpine ecology ordinal exhausted");
  }
  const regions = root.regions.filter((region) => region.key !== key);
  if (!pristineState) {
    regions.push(createRegionalAlpineEcologyRegionDelta({
      rootSeed: input.rootSeed,
      region: normalized.originRegion,
      baselineHash: habitat.derivationHash,
      revision: (existing?.revision ?? 0) + 1,
      eventOrdinal,
      residentPatch: normalized,
    }));
  }
  regions.sort((left, right) => compareText(left.key, right.key));
  const { integrity: _integrity, ...base } = root;
  return sealRoot({
    ...base,
    revision,
    lastEventOrdinal: eventOrdinal,
    regions: Object.freeze(regions),
  });
}

export function regionalAlpineEcologyResidentDeviation(
  value: unknown,
  rootSeed: RootSeed,
  region: RegionCoord,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalizeRegionalAlpineEcologyRoot(value);
  if (root === null) return null;
  const bound = canonicalRegionalAlpineEcologyRootForWorld(root, {
    rootSeed,
    completedTick: root.updatedAtTick,
  });
  if (bound === null || !isRegionCoord(region)) return null;
  return bound.regions.find((candidate) => candidate.key === regionKey(region))
    ?.residentPatch ?? null;
}

/** Returns a deviation when present, otherwise the rederived pristine source. */
export function regionalAlpineEcologyResidentPatchForRegion(
  value: unknown,
  rootSeed: RootSeed,
  region: RegionCoord,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalizeRegionalAlpineEcologyRoot(value);
  if (root === null || !isRegionCoord(region)) return null;
  const bound = canonicalRegionalAlpineEcologyRootForWorld(root, {
    rootSeed,
    completedTick: root.updatedAtTick,
  });
  if (bound === null) return null;
  const delta = bound.regions.find((candidate) => candidate.key === regionKey(region));
  if (delta !== undefined) {
    return advanceDormantAlpinePatchToTick(delta.residentPatch, root.updatedAtTick);
  }
  const habitat = deriveCoreEcologyAlpineHabitat({ seed: rootSeed, region });
  return habitat.totalPopulationUnits === 0
    ? null
    : createCoreEcologyAlpineResidentPatch({
        seed: rootSeed,
        habitat,
        tick: root.updatedAtTick,
      });
}

/**
 * Returns each Alpine owner needed by a hot seamless-world neighborhood.
 * Seeded owners are selected by lineage origin, while stored deviations are
 * also selected by current physical residence. No identity transfers between
 * region owners at this boundary.
 */
export function regionalAlpineEcologyResidentsForActiveRegions(
  value: unknown,
  rootSeed: RootSeed,
  regionsValue: readonly RegionCoord[],
): readonly RegionalAlpineEcologyActiveResidentInput[] | null {
  const structural = canonicalizeRegionalAlpineEcologyRoot(value);
  const activeRegions = canonicalRegionsOrNull(regionsValue);
  if (
    structural === null
    || activeRegions === null
    || activeRegions.length === 0
    || activeRegions.length > REGIONAL_ALPINE_ECOLOGY_ACTIVE_REGION_LIMIT
  ) return null;
  const root = canonicalRegionalAlpineEcologyRootForWorld(structural, {
    rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null) return null;
  const activeKeys = new Set(activeRegions.map(regionKey));
  const bySource = new Map<string, RegionalAlpineEcologyActiveResidentInput>();
  const admit = (storedPatch: CoreEcologyAggregatePatchState): boolean => {
    const patch = advanceDormantAlpinePatchToTick(storedPatch, root.updatedAtTick);
    if (
      patch === null
      || canonicalCoreEcologyAlpineResidentPatch(patch, {
        seed: rootSeed,
        region: patch.originRegion,
        completedTick: root.updatedAtTick,
      }) === null
    ) return false;
    if (bySource.has(patch.patchKey)) return true;
    bySource.set(patch.patchKey, Object.freeze({
      kind: CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
      sourceKey: patch.patchKey,
      patch,
    }));
    return true;
  };

  for (const region of activeRegions) {
    const delta = root.regions.find((candidate) => candidate.key === regionKey(region));
    if (delta !== undefined) {
      if (!admit(delta.residentPatch)) return null;
      continue;
    }
    const habitat = deriveCoreEcologyAlpineHabitat({ seed: rootSeed, region });
    if (habitat.totalPopulationUnits === 0) continue;
    if (!admit(createCoreEcologyAlpineResidentPatch({
      seed: rootSeed,
      habitat,
      tick: root.updatedAtTick,
    }))) return null;
  }

  for (const delta of root.regions) {
    if (activeKeys.has(delta.key)) continue;
    const patch = advanceDormantAlpinePatchToTick(
      delta.residentPatch,
      root.updatedAtTick,
    );
    if (patch === null) return null;
    const residence = coreEcologyAlpineResidentPatchResidenceRegions(patch);
    if (residence === null) return null;
    if (!residence.some((region) => activeKeys.has(regionKey(region)))) continue;
    if (!admit(patch)) return null;
  }
  return Object.freeze([...bySource.values()].sort((left, right) => (
    compareText(left.sourceKey, right.sourceKey)
  )));
}

export function serializeRegionalAlpineEcologyRoot(value: unknown): string {
  const root = canonicalizeRegionalAlpineEcologyRoot(value);
  if (root === null) throw new TypeError("Regional Alpine ecology root is malformed");
  const text = stableStringify(root);
  if (UTF8_ENCODER.encode(text).byteLength > REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional Alpine ecology root exceeds its save budget");
  }
  return text;
}

export function deserializeRegionalAlpineEcologyRoot(
  text: unknown,
): RegionalAlpineEcologyRootV1 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const root = canonicalizeRegionalAlpineEcologyRoot(parsed);
    return root !== null && stableStringify(root) === text ? root : null;
  } catch {
    return null;
  }
}

function canonicalAlpinePatchShape(
  value: unknown,
  region: RegionCoord,
  baselineHash: string,
): CoreEcologyAggregatePatchState | null {
  if (!plainRecord(value)) return null;
  const updatedAtTick = value.updatedAtTick;
  if (!nonnegativeSafeInteger(updatedAtTick)) return null;
  // World-free structure cannot authenticate stable seed identities. Validate
  // the shared patch and Alpine shape here; the world-bound pass below does the
  // authoritative identity check.
  const structural = canonicalizeCoreEcologyAggregatePatch(value);
  if (structural === null || stableStringify(structural) !== stableStringify(value)) return null;
  const derivation = structural.derivation as unknown as Readonly<{
    readonly kind?: unknown;
    readonly habitat?: Readonly<{ readonly derivationHash?: unknown }>;
  }>;
  if (
    derivation.kind !== CORE_ECOLOGY_ALPINE_DERIVATION_KIND
    || derivation.habitat?.derivationHash !== baselineHash
    || structural.originRegion.x !== region.x
    || structural.originRegion.y !== region.y
    || structural.nextMortalityOrdinal !== 0
    || structural.mortalityTransactions.length !== 0
    || structural.carcasses.length !== 0
    || !coreEcologyAlpineResidentPatchIsAllCoarse(structural)
  ) return null;
  return structural;
}

function advanceDormantAlpinePatchToTick(
  value: unknown,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  let patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !nonnegativeSafeInteger(atTick)
    || atTick < patch.updatedAtTick
    || atTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
    || !coreEcologyAlpineResidentPatchIsAllCoarse(patch)
  ) return null;
  while (patch.updatedAtTick < atTick) {
    const accelerated = advanceCoreEcologyDormantAggregatePatch(patch, { atTick });
    if (accelerated !== null) return accelerated;
    const nextTick = Math.min(atTick, patch.updatedAtTick + CORE_ECOLOGY_MAX_STEP_TICKS);
    const stepped = stepCoreEcologyAggregatePatch(patch, {
      tick: nextTick,
      actorSteps: [],
    });
    if (stepped === null) return null;
    patch = stepped.patch;
  }
  return patch;
}

function sealRoot(
  value: Omit<RegionalAlpineEcologyRootV1, "integrity">,
): RegionalAlpineEcologyRootV1 {
  const root = canonicalizeRegionalAlpineEcologyRoot({ ...value, integrity: hashCanonical(value) });
  if (root === null) throw new Error("Generated Regional Alpine ecology root failed validation");
  return root;
}

function seedFingerprint(seed: RootSeed): string {
  requireRootSeed(seed);
  return hashCanonical([...seed]);
}

function requireBinding(binding: RegionalAlpineEcologyWorldBinding): void {
  if (!plainRecord(binding) || !Object.hasOwn(binding, "rootSeed")
    || !Object.hasOwn(binding, "completedTick")) {
    throw new TypeError("Regional Alpine ecology requires a world binding");
  }
  requireRootSeed(binding.rootSeed as RootSeed);
  if (!nonnegativeSafeInteger(binding.completedTick)) {
    throw new RangeError("Regional Alpine ecology tick must be a nonnegative safe integer");
  }
}

function requireRootSeed(seed: RootSeed): void {
  if (!Array.isArray(seed) || seed.length !== 4 || seed.some((word) => (
    !Number.isSafeInteger(word)
    || word < 0
    || word > UINT32_MAX
    || Object.is(word, -0)
  ))) throw new RangeError("Regional Alpine ecology seed must contain four uint32 words");
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function canonicalRegionsOrNull(values: readonly unknown[]): readonly RegionCoord[] | null {
  if (!Array.isArray(values)) return null;
  const byKey = new Map<string, RegionCoord>();
  for (const value of values) {
    if (!isRegionCoord(value)) return null;
    const region = createRegionCoord(value.x, value.y);
    byKey.set(regionKey(region), region);
  }
  return Object.freeze([...byKey.values()].sort((left, right) => (
    left.x - right.x || left.y - right.y
  )));
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
