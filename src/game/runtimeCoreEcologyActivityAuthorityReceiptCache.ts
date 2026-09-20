import type { RootSeed } from "../sim/rng";

export const RUNTIME_CORE_ECOLOGY_ACTIVITY_AUTHORITY_RECEIPT_CACHE_LIMIT = 128;

/**
 * Primitive custody identity for one bounded-activity actor. Keeping this
 * record free of object identity makes cross-tick reuse explicit and auditable.
 */
export interface RuntimeCoreEcologyActivityAuthorityCustody {
  readonly rootSeed: RootSeed;
  readonly sourceKind: string;
  readonly sourceKey: string;
  readonly sourceRegionX: number;
  readonly sourceRegionY: number;
  readonly derivationKind: string;
  readonly lineageKey: string;
  readonly actorId: string;
  readonly species: string;
  readonly populationKey: string;
  readonly populationOrdinal: number;
  readonly representedUnits: number;
  readonly alpineSeedFingerprint: string | null;
  readonly legacyCustodyKey: string | null;
}

export interface RuntimeCoreEcologyActivityAuthorityRequest<
  Receipt extends RuntimeCoreEcologyActivityAuthorityReceiptIdentity,
> {
  readonly sourceKey: string;
  readonly custody: RuntimeCoreEcologyActivityAuthorityCustody;
  readonly project: () => Receipt | null;
  /** Authenticates this source adapter's receipt and actor-specific postconditions. */
  readonly validate: (receipt: unknown) => boolean;
}

export interface RuntimeCoreEcologyActivityAuthorityReceiptIdentity {
  readonly sourceKey: string;
  readonly actorId: string;
}

export interface RuntimeCoreEcologyActivityAuthorityReceiptCacheProjectionInput<
  Receipt extends RuntimeCoreEcologyActivityAuthorityReceiptIdentity,
> {
  /** Every source that must exist in the freshly constructed result bundle. */
  readonly sourceKeys: readonly string[];
  /** The complete current bounded-activity membership, not a delta. */
  readonly requests: readonly RuntimeCoreEcologyActivityAuthorityRequest<Receipt>[];
}

export type RuntimeCoreEcologyActivityAuthorityReceiptBundle<
  Receipt extends RuntimeCoreEcologyActivityAuthorityReceiptIdentity,
> = ReadonlyMap<string, ReadonlyMap<string, Receipt>>;

export interface RuntimeCoreEcologyActivityAuthorityReceiptCache<
  Receipt extends RuntimeCoreEcologyActivityAuthorityReceiptIdentity,
> {
  readonly project: (
    input: RuntimeCoreEcologyActivityAuthorityReceiptCacheProjectionInput<Receipt>,
  ) => RuntimeCoreEcologyActivityAuthorityReceiptBundle<Receipt> | null;
  readonly clear: () => void;
  readonly entryCount: () => number;
}

interface CacheEntry<Receipt> {
  readonly custody: RuntimeCoreEcologyActivityAuthorityCustody;
  readonly receipt: Receipt;
}

interface StagedReceipt<
  Receipt extends RuntimeCoreEcologyActivityAuthorityReceiptIdentity,
> {
  readonly request: RuntimeCoreEcologyActivityAuthorityRequest<Receipt>;
  readonly receipt: Receipt;
}

/**
 * Runtime-local actor-granular receipt reuse. A projection is atomic: cache
 * insertions and LRU touches occur only after the complete current membership
 * has produced a valid bundle.
 */
export function createRuntimeCoreEcologyActivityAuthorityReceiptCache<
  Receipt extends RuntimeCoreEcologyActivityAuthorityReceiptIdentity,
>(): RuntimeCoreEcologyActivityAuthorityReceiptCache<Receipt> {
  const entries = new Map<string, CacheEntry<Receipt>>();

  const project: RuntimeCoreEcologyActivityAuthorityReceiptCache<Receipt>["project"] = (
    input,
  ) => {
    if (
      !Array.isArray(input.sourceKeys)
      || !Array.isArray(input.requests)
    ) return null;

    const sourceKeys = new Set<string>();
    const bundle = new Map<string, Map<string, Receipt>>();
    for (const sourceKey of input.sourceKeys) {
      if (!validKey(sourceKey) || sourceKeys.has(sourceKey)) return null;
      sourceKeys.add(sourceKey);
      bundle.set(sourceKey, new Map());
    }

    const actorIds = new Set<string>();
    for (const request of input.requests) {
      if (!validRequest(request)) return null;
      const { custody } = request;
      if (
        request.sourceKey !== custody.sourceKey
        || !sourceKeys.has(request.sourceKey)
        || actorIds.has(custody.actorId)
      ) return null;
      const source = bundle.get(request.sourceKey);
      if (source === undefined || source.has(custody.actorId)) return null;
      actorIds.add(custody.actorId);
    }

    const staged: StagedReceipt<Receipt>[] = [];
    for (const request of input.requests) {
      const { custody } = request;
      const source = bundle.get(request.sourceKey)!;
      const cached = entries.get(custody.actorId);
      let receipt = cached !== undefined && sameCustody(cached.custody, custody)
        && validReceipt(cached.receipt, request)
        ? cached.receipt
        : null;
      if (receipt === null) {
        receipt = request.project();
        if (!validReceipt(receipt, request)) return null;
      }
      source.set(custody.actorId, receipt);
      staged.push({ request, receipt });
    }

    // Commit hits, replacements, and LRU promotion only after the whole bundle
    // has succeeded. A rejected or throwing later projector leaves no trace.
    for (const { request, receipt } of staged) {
      const { custody } = request;
      entries.delete(custody.actorId);
      entries.set(custody.actorId, { custody: copyCustody(custody), receipt });
    }
    while (entries.size > RUNTIME_CORE_ECOLOGY_ACTIVITY_AUTHORITY_RECEIPT_CACHE_LIMIT) {
      const oldest = entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    return bundle;
  };

  return Object.freeze({
    project,
    clear: () => entries.clear(),
    entryCount: () => entries.size,
  });
}

function validReceipt<Receipt extends RuntimeCoreEcologyActivityAuthorityReceiptIdentity>(
  receipt: unknown,
  request: RuntimeCoreEcologyActivityAuthorityRequest<Receipt>,
): receipt is Receipt {
  const identity = receipt as Partial<RuntimeCoreEcologyActivityAuthorityReceiptIdentity>;
  return typeof receipt === "object"
    && receipt !== null
    && Object.isFrozen(receipt)
    && request.validate(receipt)
    && identity.sourceKey === request.sourceKey
    && identity.actorId === request.custody.actorId;
}

function validRequest(value: unknown): boolean {
  if (
    typeof value !== "object"
    || value === null
    || !("sourceKey" in value)
    || !("custody" in value)
    || !("project" in value)
    || !("validate" in value)
    || !validKey(value.sourceKey)
    || typeof value.project !== "function"
    || typeof value.validate !== "function"
    || typeof value.custody !== "object"
    || value.custody === null
  ) return false;
  const custody = value.custody as Partial<RuntimeCoreEcologyActivityAuthorityCustody>;
  return exactKeys(custody, [
    "actorId",
    "alpineSeedFingerprint",
    "derivationKind",
    "legacyCustodyKey",
    "lineageKey",
    "populationKey",
    "populationOrdinal",
    "representedUnits",
    "rootSeed",
    "sourceKey",
    "sourceKind",
    "sourceRegionX",
    "sourceRegionY",
    "species",
  ])
    && Array.isArray(custody.rootSeed)
    && custody.rootSeed.length === 4
    && custody.rootSeed.every(validNumber)
    && validKey(custody.sourceKind)
    && validKey(custody.sourceKey)
    && validInteger(custody.sourceRegionX)
    && validInteger(custody.sourceRegionY)
    && validKey(custody.derivationKind)
    && validKey(custody.lineageKey)
    && validKey(custody.actorId)
    && validKey(custody.species)
    && validKey(custody.populationKey)
    && validNonNegativeInteger(custody.populationOrdinal)
    && validPositiveInteger(custody.representedUnits)
    && validNullableKey(custody.alpineSeedFingerprint)
    && validNullableKey(custody.legacyCustodyKey);
}

function sameCustody(
  left: RuntimeCoreEcologyActivityAuthorityCustody,
  right: RuntimeCoreEcologyActivityAuthorityCustody,
): boolean {
  return Object.is(left.rootSeed[0], right.rootSeed[0])
    && Object.is(left.rootSeed[1], right.rootSeed[1])
    && Object.is(left.rootSeed[2], right.rootSeed[2])
    && Object.is(left.rootSeed[3], right.rootSeed[3])
    && left.sourceKind === right.sourceKind
    && left.sourceKey === right.sourceKey
    && Object.is(left.sourceRegionX, right.sourceRegionX)
    && Object.is(left.sourceRegionY, right.sourceRegionY)
    && left.derivationKind === right.derivationKind
    && left.lineageKey === right.lineageKey
    && left.actorId === right.actorId
    && left.species === right.species
    && left.populationKey === right.populationKey
    && Object.is(left.populationOrdinal, right.populationOrdinal)
    && Object.is(left.representedUnits, right.representedUnits)
    && left.alpineSeedFingerprint === right.alpineSeedFingerprint
    && left.legacyCustodyKey === right.legacyCustodyKey;
}

function copyCustody(
  custody: RuntimeCoreEcologyActivityAuthorityCustody,
): RuntimeCoreEcologyActivityAuthorityCustody {
  return Object.freeze({
    ...custody,
    rootSeed: Object.freeze([
      custody.rootSeed[0],
      custody.rootSeed[1],
      custody.rootSeed[2],
      custody.rootSeed[3],
    ]) as RootSeed,
  });
}

function validKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function validNullableKey(value: unknown): value is string | null {
  return value === null || validKey(value);
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validInteger(value: unknown): value is number {
  return validNumber(value) && Number.isInteger(value);
}

function validNonNegativeInteger(value: unknown): value is number {
  return validInteger(value) && value >= 0;
}

function validPositiveInteger(value: unknown): value is number {
  return validInteger(value) && value > 0;
}

function exactKeys(
  value: object,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index]);
}
