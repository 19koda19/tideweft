import { hashCanonical, stableStringify } from "../sim/util";
import {
  isRegionCoord,
  parseRegionKey,
  regionKey,
  type RegionCoord,
} from "../sim/regions";

export const REGION_MANIFEST_VERSION = 1 as const;
export const REGION_MANIFEST_MAX_REGIONS = 131_072;
export const REGION_MANIFEST_MAX_COLLECTED_PER_REGION = 32_768;
export const REGION_MANIFEST_MAX_MODIFICATIONS_PER_REGION = 32_768;
export const REGION_MANIFEST_MAX_SERIALIZED_BYTES = 32 * 1_024 * 1_024;

const MAX_ID_LENGTH = 192;
const MAX_KIND_LENGTH = 48;
const MAX_VALUE_DEPTH = 16;
const MAX_VALUE_NODES = 4_096;
const MAX_VALUE_STRING_LENGTH = 8_192;
const MAX_VALUE_ARRAY_LENGTH = 1_024;
const MAX_VALUE_OBJECT_KEYS = 1_024;
const MAX_VALUE_KEY_LENGTH = 128;
const MAX_VALUE_SERIALIZED_LENGTH = 65_536;
/** Save seals remain 64-bit; pristine generated-region identities are always 128-bit. */
const INTEGRITY_HASH_PATTERN = /^[0-9a-f]{16}$/;
const TERRAIN_HASH_PATTERN = /^[0-9a-f]{32}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]*$/;
const KIND_PATTERN = /^[a-z][a-z0-9-]*$/;
const TRUSTED_MANIFESTS = new WeakSet<object>();
const UTF8_ENCODER = new TextEncoder();

export type RegionModificationKind =
  | "terrain"
  | "resource"
  | "loose-cargo"
  | "wayknot"
  | "infrastructure"
  | "evidence";

const MODIFICATION_KINDS: ReadonlySet<string> = new Set<RegionModificationKind>([
  "terrain",
  "resource",
  "loose-cargo",
  "wayknot",
  "infrastructure",
  "evidence",
]);

export type RegionManifestValue =
  | null
  | boolean
  | number
  | string
  | readonly RegionManifestValue[]
  | RegionManifestObject;

export interface RegionManifestObject {
  readonly [key: string]: RegionManifestValue;
}

export interface RegionCollectedIdentity {
  readonly id: string;
  readonly eventOrdinal: number;
}

export interface RegionModificationRecord {
  readonly id: string;
  readonly kind: RegionModificationKind;
  /** Revision of this stable modification identity, beginning at one. */
  readonly revision: number;
  readonly eventOrdinal: number;
  /** Removed records remain durable tombstones instead of disappearing. */
  readonly removed: boolean;
  readonly value: RegionManifestValue;
}

export interface DurableRegionRecord {
  readonly coord: RegionCoord;
  readonly key: string;
  /** Hash of the pristine generated region when its first durable change was made. */
  readonly visitedHash: string;
  readonly visitedEventOrdinal: number;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  readonly collected: readonly RegionCollectedIdentity[];
  readonly modifications: readonly RegionModificationRecord[];
}

export interface RegionManifest {
  readonly version: typeof REGION_MANIFEST_VERSION;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  readonly regions: readonly DurableRegionRecord[];
  readonly integrity: string;
}

export interface RegionManifestValidation {
  readonly valid: boolean;
  readonly reason:
    | "valid"
    | "invalid-state"
    | "invalid-integrity"
    | "invalid-region"
    | "invalid-collected"
    | "invalid-modification"
    | "noncanonical-order"
    | "duplicate-identity"
    | "oversized";
  readonly manifest: RegionManifest | null;
}

export interface RegionManifestCommit {
  readonly manifest: RegionManifest;
  readonly region: DurableRegionRecord;
  readonly eventOrdinal: number;
}

export interface RegionManifestMutationInput {
  readonly region: RegionCoord;
  readonly id: string;
  readonly kind: RegionModificationKind;
  readonly expectedManifestRevision: number;
  readonly expectedRegionRevision: number;
  readonly expectedModificationRevision: number;
  readonly removed: boolean;
  readonly value: RegionManifestValue;
}

export interface RegionManifestCollectionInput {
  readonly region: RegionCoord;
  readonly id: string;
  readonly expectedManifestRevision: number;
  readonly expectedRegionRevision: number;
}

interface ManifestPayload {
  readonly version: typeof REGION_MANIFEST_VERSION;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  readonly regions: readonly DurableRegionRecord[];
}

interface ValueBudget {
  nodes: number;
}

export function createRegionManifest(): RegionManifest {
  return sealManifest({
    version: REGION_MANIFEST_VERSION,
    revision: 0,
    lastEventOrdinal: 0,
    regions: [],
  });
}

/**
 * Adopt the durable sidecar without repairing invalid v1 data. An absent
 * sidecar or the exact legacy `{ version: 0 }` marker has no durable regional
 * changes, so it migrates to an empty sparse manifest. The compatibility hash
 * is still validated at the migration boundary, but is not persisted merely
 * because region (0,0) was generated.
 */
export function adoptRegionManifest(
  value: unknown,
  compatibilityTerrainHash: string,
): RegionManifest | null {
  if (!validTerrainHash(compatibilityTerrainHash)) return null;
  if (value === undefined || value === null || isExactV0(value)) {
    return createRegionManifest();
  }
  const validation = validateRegionManifest(value);
  return validation.valid ? validation.manifest : null;
}

/**
 * Verify generated content against any durable hashes already present.
 * Pristine visits intentionally remain ephemeral and never consume manifest
 * capacity, revisions, event ordinals, or serialized bytes.
 */
export function visitRegionManifest(
  manifest: RegionManifest,
  visits: readonly { readonly coord: RegionCoord; readonly visitedHash: string }[],
): RegionManifest {
  const current = requireManifest(manifest);
  if (!Array.isArray(visits)) throw new TypeError("Region visits must be an array");
  if (visits.length === 0) return current;

  const byKey = new Map(current.regions.map((region) => [region.key, region]));
  const requested = new Map<string, { readonly coord: RegionCoord; readonly visitedHash: string }>();
  for (const visit of visits) {
    if (!canonicalCoordShape(visit?.coord) || !validTerrainHash(visit.visitedHash)) {
      throw new RangeError("Region visits require a canonical coordinate and terrain hash");
    }
    const key = regionKey(visit.coord);
    const duplicate = requested.get(key);
    if (duplicate && duplicate.visitedHash !== visit.visitedHash) {
      throw new RangeError("One region cannot be visited with conflicting terrain hashes");
    }
    requested.set(key, { coord: copyCoord(visit.coord), visitedHash: visit.visitedHash });
  }

  for (const [key, visit] of requested) {
    const prior = byKey.get(key);
    if (prior && prior.visitedHash !== visit.visitedHash) {
      throw new RangeError(`Region ${key} regenerated with a different terrain hash`);
    }
  }

  return current;
}

/**
 * Atomically anchor a pristine generated hash and commit its first mutation.
 * Existing durable regions are also checked against the currently generated
 * hash before their mutation is accepted.
 */
export function commitGeneratedRegionModification(
  manifest: RegionManifest,
  visitedHash: string,
  input: RegionManifestMutationInput,
): RegionManifestCommit {
  const current = requireManifest(manifest);
  requireCurrentRevision(current, input.expectedManifestRevision);
  const staged = stageGeneratedRegion(
    current,
    input.region,
    visitedHash,
    input.expectedRegionRevision,
  );
  return commitRegionModification(staged.manifest, {
    ...input,
    expectedManifestRevision: staged.manifest.revision,
    expectedRegionRevision: staged.materialized
      ? staged.region.revision
      : input.expectedRegionRevision,
  });
}

/** Atomically anchor a pristine generated hash and tombstone its first pickup. */
export function collectGeneratedRegionIdentity(
  manifest: RegionManifest,
  visitedHash: string,
  input: RegionManifestCollectionInput,
): RegionManifestCommit {
  const current = requireManifest(manifest);
  requireCurrentRevision(current, input.expectedManifestRevision);
  const staged = stageGeneratedRegion(
    current,
    input.region,
    visitedHash,
    input.expectedRegionRevision,
  );
  return collectRegionIdentity(staged.manifest, {
    ...input,
    expectedManifestRevision: staged.manifest.revision,
    expectedRegionRevision: staged.materialized
      ? staged.region.revision
      : input.expectedRegionRevision,
  });
}

export function commitRegionModification(
  manifest: RegionManifest,
  input: RegionManifestMutationInput,
): RegionManifestCommit {
  const current = requireManifest(manifest);
  requireCurrentRevision(current, input.expectedManifestRevision);
  if (!canonicalCoordShape(input.region) || !validIdentity(input.id) || !validKind(input.kind)) {
    throw new RangeError("Region modification identity, kind, or coordinate is invalid");
  }
  if (typeof input.removed !== "boolean") {
    throw new TypeError("Region modification removal state must be boolean");
  }
  const key = regionKey(input.region);
  const prior = current.regions.find((region) => region.key === key);
  if (!prior) throw new RangeError("A region must be durably materialized before it can be modified");
  requireRegionRevision(prior, input.expectedRegionRevision);
  if (prior.collected.some(({ id }) => id === input.id)) {
    throw new RangeError("A collected stable identity cannot be resurrected as a modification");
  }
  const priorModification = prior.modifications.find(({ id }) => id === input.id);
  const expectedModificationRevision = priorModification?.revision ?? 0;
  if (
    !Number.isSafeInteger(input.expectedModificationRevision)
    || input.expectedModificationRevision !== expectedModificationRevision
  ) throw new RangeError("Region modification quote is stale");
  if (priorModification && priorModification.kind !== input.kind) {
    throw new RangeError("A stable modification identity cannot change kind");
  }
  if (!priorModification && prior.modifications.length >= REGION_MANIFEST_MAX_MODIFICATIONS_PER_REGION) {
    throw new RangeError("Region modification capacity exhausted");
  }
  const value = canonicalValue(input.value);
  if (value === undefined) throw new RangeError("Region modification value is not canonical bounded data");
  if (input.removed && value !== null) {
    throw new RangeError("Removed region modifications must carry a null tombstone value");
  }
  const eventOrdinal = nextOrdinal(current.lastEventOrdinal);
  const nextRecord: RegionModificationRecord = deepFreeze({
    id: input.id,
    kind: input.kind,
    revision: nextOrdinal(expectedModificationRevision),
    eventOrdinal,
    removed: input.removed,
    value,
  });
  const modifications = prior.modifications
    .filter(({ id }) => id !== input.id)
    .concat(nextRecord)
    .sort(compareModifications);
  const region = freezeRegionRecord({
    ...prior,
    revision: nextOrdinal(prior.revision),
    lastEventOrdinal: eventOrdinal,
    modifications,
  });
  return commitRegionRecord(current, prior.key, region, eventOrdinal);
}

export function collectRegionIdentity(
  manifest: RegionManifest,
  input: RegionManifestCollectionInput,
): RegionManifestCommit {
  const current = requireManifest(manifest);
  requireCurrentRevision(current, input.expectedManifestRevision);
  if (!canonicalCoordShape(input.region) || !validIdentity(input.id)) {
    throw new RangeError("Collected identity or coordinate is invalid");
  }
  const key = regionKey(input.region);
  const prior = current.regions.find((region) => region.key === key);
  if (!prior) throw new RangeError("A region must be durably materialized before an identity can be collected");
  requireRegionRevision(prior, input.expectedRegionRevision);
  if (prior.collected.some(({ id }) => id === input.id)) {
    throw new RangeError("A collected stable identity cannot be collected twice");
  }
  if (prior.modifications.some(({ id }) => id === input.id)) {
    throw new RangeError("Collected and modified identities must use distinct stable IDs");
  }
  if (prior.collected.length >= REGION_MANIFEST_MAX_COLLECTED_PER_REGION) {
    throw new RangeError("Collected identity capacity exhausted");
  }
  const eventOrdinal = nextOrdinal(current.lastEventOrdinal);
  const collected = prior.collected
    .concat(deepFreeze({ id: input.id, eventOrdinal }))
    .sort(compareCollected);
  const region = freezeRegionRecord({
    ...prior,
    revision: nextOrdinal(prior.revision),
    lastEventOrdinal: eventOrdinal,
    collected,
  });
  return commitRegionRecord(current, prior.key, region, eventOrdinal);
}

export function getDurableRegionRecord(
  manifest: RegionManifest,
  coord: RegionCoord,
): DurableRegionRecord | null {
  const current = requireManifest(manifest);
  if (!canonicalCoordShape(coord)) return null;
  const key = regionKey(coord);
  return current.regions.find((region) => region.key === key) ?? null;
}

export function serializeRegionManifest(manifest: RegionManifest): string {
  const current = requireManifest(manifest);
  const encoded = stableStringify(current);
  if (serializedByteLength(encoded) > REGION_MANIFEST_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Region manifest exceeds the serialized save budget");
  }
  return encoded;
}

export function parseRegionManifest(text: string): RegionManifest | null {
  if (typeof text !== "string" || text.length === 0 || text.length > REGION_MANIFEST_MAX_SERIALIZED_BYTES) {
    return null;
  }
  try {
    const validation = validateRegionManifest(JSON.parse(text) as unknown);
    if (!validation.valid || !validation.manifest) return null;
    return stableStringify(validation.manifest) === text
      && serializedByteLength(text) <= REGION_MANIFEST_MAX_SERIALIZED_BYTES
      ? validation.manifest
      : null;
  } catch {
    return null;
  }
}

export function validateRegionManifest(value: unknown): RegionManifestValidation {
  if (!plainRecord(value) || !exactKeys(value, [
    "integrity",
    "lastEventOrdinal",
    "regions",
    "revision",
    "version",
  ])) return invalid("invalid-state");
  if (
    value.version !== REGION_MANIFEST_VERSION
    || !safeOrdinal(value.revision)
    || !safeOrdinal(value.lastEventOrdinal)
    || value.revision !== value.lastEventOrdinal
    || !Array.isArray(value.regions)
  ) return invalid("invalid-state");
  if (value.regions.length > REGION_MANIFEST_MAX_REGIONS) return invalid("oversized");
  if (!validIntegrityHash(value.integrity)) return invalid("invalid-integrity");

  const regions: DurableRegionRecord[] = [];
  const regionKeys = new Set<string>();
  const visibleEventOrdinals = new Set<number>();
  let maximumEventOrdinal = 0;
  let previousKey = "";
  for (const candidate of value.regions) {
    const result = validateRegionRecord(candidate, value.lastEventOrdinal, visibleEventOrdinals);
    if (!result.record) return invalid(result.reason);
    const record = result.record;
    if (regionKeys.has(record.key)) return invalid("duplicate-identity");
    if (previousKey !== "" && compareText(previousKey, record.key) >= 0) {
      return invalid("noncanonical-order");
    }
    regionKeys.add(record.key);
    previousKey = record.key;
    maximumEventOrdinal = Math.max(maximumEventOrdinal, record.lastEventOrdinal);
    regions.push(record);
  }
  if (
    (regions.length === 0 && value.lastEventOrdinal !== 0)
    || (regions.length > 0 && maximumEventOrdinal !== value.lastEventOrdinal)
  ) return invalid("invalid-state");

  const payload: ManifestPayload = {
    version: REGION_MANIFEST_VERSION,
    revision: value.revision,
    lastEventOrdinal: value.lastEventOrdinal,
    regions,
  };
  if (hashCanonical(payload) !== value.integrity) return invalid("invalid-integrity");
  const manifest = sealManifest(payload);
  try {
    if (serializedByteLength(stableStringify(manifest)) > REGION_MANIFEST_MAX_SERIALIZED_BYTES) {
      return invalid("oversized");
    }
  } catch {
    return invalid("invalid-state");
  }
  return { valid: true, reason: "valid", manifest };
}

function validateRegionRecord(
  value: unknown,
  manifestLastEventOrdinal: number,
  visibleEventOrdinals: Set<number>,
): { readonly record: DurableRegionRecord | null; readonly reason: RegionManifestValidation["reason"] } {
  if (!plainRecord(value) || !exactKeys(value, [
    "collected",
    "coord",
    "key",
    "lastEventOrdinal",
    "modifications",
    "revision",
    "visitedEventOrdinal",
    "visitedHash",
  ])) return { record: null, reason: "invalid-region" };
  if (
    !canonicalCoordShape(value.coord)
    || typeof value.key !== "string"
    || regionKey(value.coord) !== value.key
    || parseRegionKey(value.key) === null
    || !validTerrainHash(value.visitedHash)
    || !positiveOrdinal(value.visitedEventOrdinal)
    || !positiveOrdinal(value.revision)
    || !positiveOrdinal(value.lastEventOrdinal)
    || value.visitedEventOrdinal > value.lastEventOrdinal
    || value.lastEventOrdinal > manifestLastEventOrdinal
    || !Array.isArray(value.collected)
    || !Array.isArray(value.modifications)
  ) return { record: null, reason: "invalid-region" };
  if (
    value.collected.length > REGION_MANIFEST_MAX_COLLECTED_PER_REGION
    || value.modifications.length > REGION_MANIFEST_MAX_MODIFICATIONS_PER_REGION
  ) return { record: null, reason: "oversized" };

  const collected: RegionCollectedIdentity[] = [];
  const modifications: RegionModificationRecord[] = [];
  const ids = new Set<string>();
  let previousCollectedId = "";
  let previousModificationId = "";
  if (!claimVisibleEvent(value.visitedEventOrdinal, visibleEventOrdinals)) {
    return { record: null, reason: "duplicate-identity" };
  }
  for (const candidate of value.collected) {
    if (
      !plainRecord(candidate)
      || !exactKeys(candidate, ["eventOrdinal", "id"])
      || !validIdentity(candidate.id)
      || !positiveOrdinal(candidate.eventOrdinal)
      || candidate.eventOrdinal <= value.visitedEventOrdinal
      || candidate.eventOrdinal > value.lastEventOrdinal
      || ids.has(candidate.id)
      || (previousCollectedId !== "" && compareText(previousCollectedId, candidate.id) >= 0)
      || !claimVisibleEvent(candidate.eventOrdinal, visibleEventOrdinals)
    ) return { record: null, reason: "invalid-collected" };
    ids.add(candidate.id);
    previousCollectedId = candidate.id;
    collected.push(deepFreeze({ id: candidate.id, eventOrdinal: candidate.eventOrdinal }));
  }
  for (const candidate of value.modifications) {
    const record = validateModification(candidate, value, visibleEventOrdinals);
    if (
      !record
      || ids.has(record.id)
      || (previousModificationId !== "" && compareText(previousModificationId, record.id) >= 0)
    ) return { record: null, reason: record ? "duplicate-identity" : "invalid-modification" };
    ids.add(record.id);
    previousModificationId = record.id;
    modifications.push(record);
  }
  if (collected.length === 0 && modifications.length === 0) {
    return { record: null, reason: "invalid-region" };
  }
  const visibleLast = Math.max(
    value.visitedEventOrdinal,
    ...collected.map(({ eventOrdinal }) => eventOrdinal),
    ...modifications.map(({ eventOrdinal }) => eventOrdinal),
  );
  let expectedRevision = 1 + collected.length;
  for (const modification of modifications) {
    if (expectedRevision > Number.MAX_SAFE_INTEGER - modification.revision) {
      return { record: null, reason: "invalid-region" };
    }
    expectedRevision += modification.revision;
  }
  if (
    visibleLast !== value.lastEventOrdinal
    || value.revision !== expectedRevision
    || value.revision > value.lastEventOrdinal
  ) {
    return { record: null, reason: "invalid-region" };
  }
  return {
    reason: "valid",
    record: freezeRegionRecord({
      coord: copyCoord(value.coord),
      key: value.key,
      visitedHash: value.visitedHash,
      visitedEventOrdinal: value.visitedEventOrdinal,
      revision: value.revision,
      lastEventOrdinal: value.lastEventOrdinal,
      collected,
      modifications,
    }),
  };
}

function stageGeneratedRegion(
  manifest: RegionManifest,
  coord: RegionCoord,
  visitedHash: string,
  expectedRegionRevision: number,
): {
  readonly manifest: RegionManifest;
  readonly region: DurableRegionRecord;
  readonly materialized: boolean;
} {
  if (!canonicalCoordShape(coord) || !validTerrainHash(visitedHash)) {
    throw new RangeError("A durable region requires a canonical coordinate and generated terrain hash");
  }
  const key = regionKey(coord);
  const prior = manifest.regions.find((region) => region.key === key);
  if (prior) {
    if (prior.visitedHash !== visitedHash) {
      throw new RangeError(`Region ${key} regenerated with a different terrain hash`);
    }
    return { manifest, region: prior, materialized: false };
  }
  if (!safeOrdinal(expectedRegionRevision) || expectedRegionRevision !== 0) {
    throw new RangeError("Durable region quote is stale");
  }
  if (manifest.regions.length >= REGION_MANIFEST_MAX_REGIONS) {
    throw new RangeError("Region manifest capacity exhausted");
  }
  const eventOrdinal = nextOrdinal(manifest.lastEventOrdinal);
  const region = freezeRegionRecord({
    coord,
    key,
    visitedHash,
    visitedEventOrdinal: eventOrdinal,
    revision: 1,
    lastEventOrdinal: eventOrdinal,
    collected: [],
    modifications: [],
  });
  const staged = sealManifest({
    version: REGION_MANIFEST_VERSION,
    revision: nextOrdinal(manifest.revision),
    lastEventOrdinal: eventOrdinal,
    regions: manifest.regions.concat(region).sort(compareRegions),
  });
  return { manifest: staged, region, materialized: true };
}

function validateModification(
  value: unknown,
  region: Readonly<Record<string, unknown>>,
  visibleEventOrdinals: Set<number>,
): RegionModificationRecord | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "eventOrdinal",
    "id",
    "kind",
    "removed",
    "revision",
    "value",
  ])) return null;
  if (
    !validIdentity(value.id)
    || !validKind(value.kind)
    || !positiveOrdinal(value.revision)
    || !positiveOrdinal(value.eventOrdinal)
    || value.revision > value.eventOrdinal
    || value.eventOrdinal <= (region.visitedEventOrdinal as number)
    || value.eventOrdinal > (region.lastEventOrdinal as number)
    || typeof value.removed !== "boolean"
    || (value.removed && value.value !== null)
    || !claimVisibleEvent(value.eventOrdinal, visibleEventOrdinals)
  ) return null;
  const canonical = canonicalValue(value.value);
  if (canonical === undefined) return null;
  return deepFreeze({
    id: value.id,
    kind: value.kind,
    revision: value.revision,
    eventOrdinal: value.eventOrdinal,
    removed: value.removed,
    value: canonical,
  });
}

function commitRegionRecord(
  manifest: RegionManifest,
  key: string,
  region: DurableRegionRecord,
  eventOrdinal: number,
): RegionManifestCommit {
  const regions = manifest.regions
    .filter((candidate) => candidate.key !== key)
    .concat(region)
    .sort(compareRegions);
  const next = sealManifest({
    version: REGION_MANIFEST_VERSION,
    revision: nextOrdinal(manifest.revision),
    lastEventOrdinal: eventOrdinal,
    regions,
  });
  return deepFreeze({ manifest: next, region, eventOrdinal });
}

function requireManifest(value: RegionManifest): RegionManifest {
  if (value !== null && typeof value === "object" && TRUSTED_MANIFESTS.has(value)) return value;
  const validation = validateRegionManifest(value);
  if (!validation.valid || !validation.manifest) {
    throw new RangeError(`Invalid region manifest: ${validation.reason}`);
  }
  return validation.manifest;
}

function sealManifest(payload: ManifestPayload): RegionManifest {
  const canonicalPayload: ManifestPayload = deepFreeze({
    version: REGION_MANIFEST_VERSION,
    revision: payload.revision,
    lastEventOrdinal: payload.lastEventOrdinal,
    regions: [...payload.regions],
  });
  const manifest: RegionManifest = deepFreeze({
    ...canonicalPayload,
    integrity: hashCanonical(canonicalPayload),
  });
  TRUSTED_MANIFESTS.add(manifest);
  return manifest;
}

function freezeRegionRecord(record: DurableRegionRecord): DurableRegionRecord {
  return deepFreeze({
    coord: copyCoord(record.coord),
    key: record.key,
    visitedHash: record.visitedHash,
    visitedEventOrdinal: record.visitedEventOrdinal,
    revision: record.revision,
    lastEventOrdinal: record.lastEventOrdinal,
    collected: [...record.collected],
    modifications: [...record.modifications],
  });
}

function canonicalValue(value: unknown): RegionManifestValue | undefined {
  const budget: ValueBudget = { nodes: 0 };
  const cloned = cloneValue(value, 0, budget);
  if (cloned === undefined) return undefined;
  try {
    if (stableStringify(cloned).length > MAX_VALUE_SERIALIZED_LENGTH) return undefined;
  } catch {
    return undefined;
  }
  return deepFreeze(cloned);
}

function cloneValue(value: unknown, depth: number, budget: ValueBudget): RegionManifestValue | undefined {
  budget.nodes += 1;
  if (budget.nodes > MAX_VALUE_NODES || depth > MAX_VALUE_DEPTH) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === "string") return value.length <= MAX_VALUE_STRING_LENGTH ? value : undefined;
  if (Array.isArray(value)) {
    if (value.length > MAX_VALUE_ARRAY_LENGTH) return undefined;
    const result: RegionManifestValue[] = [];
    for (const candidate of value) {
      const cloned = cloneValue(candidate, depth + 1, budget);
      if (cloned === undefined) return undefined;
      result.push(cloned);
    }
    return result;
  }
  if (!plainRecord(value)) return undefined;
  const keys = Object.keys(value).sort(compareText);
  if (keys.length > MAX_VALUE_OBJECT_KEYS) return undefined;
  const result: Record<string, RegionManifestValue> = Object.create(null) as Record<string, RegionManifestValue>;
  for (const key of keys) {
    if (
      key.length === 0
      || key.length > MAX_VALUE_KEY_LENGTH
      || key === "__proto__"
      || key === "constructor"
      || key === "prototype"
    ) return undefined;
    const cloned = cloneValue(value[key], depth + 1, budget);
    if (cloned === undefined) return undefined;
    result[key] = cloned;
  }
  return result;
}

function requireCurrentRevision(manifest: RegionManifest, expected: number): void {
  if (!safeOrdinal(expected) || expected !== manifest.revision) {
    throw new RangeError("Region manifest quote is stale");
  }
}

function requireRegionRevision(region: DurableRegionRecord, expected: number): void {
  if (!positiveOrdinal(expected) || expected !== region.revision) {
    throw new RangeError("Durable region quote is stale");
  }
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value);
}

function validKind(value: unknown): value is RegionModificationKind {
  return typeof value === "string"
    && value.length <= MAX_KIND_LENGTH
    && KIND_PATTERN.test(value)
    && MODIFICATION_KINDS.has(value);
}

function validIntegrityHash(value: unknown): value is string {
  return typeof value === "string" && INTEGRITY_HASH_PATTERN.test(value);
}

function validTerrainHash(value: unknown): value is string {
  return typeof value === "string" && TERRAIN_HASH_PATTERN.test(value);
}

function safeOrdinal(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveOrdinal(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nextOrdinal(value: number): number {
  assertOrdinalAdvance(value, 1);
  return value + 1;
}

function assertOrdinalAdvance(value: number, amount: number): void {
  if (!safeOrdinal(value) || !safeOrdinal(amount) || value + amount > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Region manifest ordinal capacity exhausted");
  }
}

function claimVisibleEvent(value: number, claimed: Set<number>): boolean {
  if (claimed.has(value)) return false;
  claimed.add(value);
  return true;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function canonicalCoordShape(value: unknown): value is RegionCoord {
  return isRegionCoord(value)
    && plainRecord(value)
    && exactKeys(value, ["x", "y"]);
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isExactV0(value: unknown): boolean {
  return plainRecord(value) && exactKeys(value, ["version"]) && value.version === 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRegions(left: DurableRegionRecord, right: DurableRegionRecord): number {
  return compareText(left.key, right.key);
}

function compareCollected(left: RegionCollectedIdentity, right: RegionCollectedIdentity): number {
  return compareText(left.id, right.id);
}

function compareModifications(left: RegionModificationRecord, right: RegionModificationRecord): number {
  return compareText(left.id, right.id);
}

function copyCoord(coord: RegionCoord): RegionCoord {
  return Object.freeze({ x: coord.x, y: coord.y });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function invalid(reason: RegionManifestValidation["reason"]): RegionManifestValidation {
  return { valid: false, reason, manifest: null };
}

function serializedByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}
