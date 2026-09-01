import { hashCanonical, stableStringify } from "../sim/util";
import {
  PACK_LOAD_MILLI_PER_UNIT,
  cargoWeightMilli,
  type PlayerState,
} from "./player";
import {
  createLooseCargoCarrier,
  createLooseCargoExpectedManifest,
  createLooseCargoWorld,
  validateLooseCargoCarrier,
  validateLooseCargoExpectedManifest,
  validateLooseCargoWorld,
  looseCargoCarrierLoadMilli,
  type LooseCargoCarrierState,
  type LooseCargoExpectedManifest,
  type LooseCargoPayload,
  type LooseCargoWorldState,
} from "./looseCargo";
import { projectLooseCargoCarrierToPlayer } from "./looseCargoRuntime";

export const PHYSICAL_CARGO_STATE_VERSION = 1 as const;
export const LOCAL_PORTER_ID = "local-porter" as const;
const MAX_SOURCE_LABEL_LENGTH = 96;

export interface PhysicalCargoState {
  readonly version: typeof PHYSICAL_CARGO_STATE_VERSION;
  /** Monotonic source identity cursor. It advances only with a committed mutation. */
  readonly lastSourceOrdinal: number;
  readonly looseWorld: LooseCargoWorldState;
  readonly carrier: LooseCargoCarrierState;
  readonly expectedManifest: LooseCargoExpectedManifest;
  /** Canonical integrity for this sidecar; the save envelope adds a second outer seal. */
  readonly integrity: string;
}

export interface PhysicalCargoSourceQuote {
  readonly ordinal: number;
  readonly lotId: string;
}

export type PhysicalCargoCommitAuthorization =
  | {
      /** Drop, pickup, fall split, drift, and material weathering conserve substance. */
      readonly kind: "conserved";
      readonly reservedLoadDeltaMilli?: 0;
    }
  | {
      /** Gather, craft, repair, dismantle, Promise pickup/delivery, or reports. */
      readonly kind: "delta";
      readonly removed: readonly LooseCargoPayload[];
      readonly added: readonly LooseCargoPayload[];
      readonly reservedLoadDeltaMilli?: number;
    };

export interface PhysicalCargoValidation {
  readonly valid: boolean;
  readonly reason:
    | "valid"
    | "invalid-state"
    | "invalid-integrity"
    | "invalid-world"
    | "invalid-carrier"
    | "invalid-owner"
    | "invalid-dimensions"
    | "invalid-capacity"
    | "invalid-reserved-load"
    | "manifest-mismatch"
    | "player-mirror-mismatch";
  readonly state: PhysicalCargoState | null;
}

/** Build the one-time v1/v2 migration without inventing or deleting inventory. */
export function createPhysicalCargoStateFromPlayer(
  player: PlayerState,
  width: number,
  height: number,
): PhysicalCargoState {
  const looseWorld = createLooseCargoWorld(width, height);
  const carrier = createLooseCargoCarrier(
    { kind: "player", id: LOCAL_PORTER_ID },
    player.craftingInventory,
    player.cargo.map((cargo) => ({ ...cargo })),
    player.report ? PACK_LOAD_MILLI_PER_UNIT : 0,
  );
  return sealPhysicalCargoState({
    version: PHYSICAL_CARGO_STATE_VERSION,
    lastSourceOrdinal: 0,
    looseWorld,
    carrier,
    expectedManifest: createLooseCargoExpectedManifest(looseWorld, carrier),
  });
}

/**
 * Re-seal after one authorized atomic transaction. The caller must never call
 * this as load repair: doing so would bless deletion instead of detecting it.
 */
export function commitPhysicalCargoState(
  prior: PhysicalCargoState,
  update: {
    readonly looseWorld: LooseCargoWorldState;
    readonly carrier: LooseCargoCarrierState;
    readonly committedSourceOrdinal?: number;
  },
  authorization: PhysicalCargoCommitAuthorization,
): PhysicalCargoState {
  const canonicalPrior = validatePhysicalCargoInternals(prior);
  if (!canonicalPrior) {
    throw new RangeError("Cannot commit from an invalid physical cargo sidecar");
  }
  const nextWorldValidation = validateLooseCargoWorld(update.looseWorld);
  const nextCarrierValidation = validateLooseCargoCarrier(update.carrier);
  if (!nextWorldValidation.valid || !nextWorldValidation.state
    || !nextCarrierValidation.valid || !nextCarrierValidation.carrier) {
    throw new RangeError("Cannot commit an invalid physical cargo world or carrier");
  }
  const looseWorld = nextWorldValidation.state;
  const carrier = nextCarrierValidation.carrier;
  if (
    stableStringify(looseWorld.region) !== stableStringify(canonicalPrior.looseWorld.region)
    || looseWorld.width !== canonicalPrior.looseWorld.width
    || looseWorld.height !== canonicalPrior.looseWorld.height
    || stableStringify(carrier.owner) !== stableStringify(canonicalPrior.carrier.owner)
    || carrier.capacityMilliLoad !== canonicalPrior.carrier.capacityMilliLoad
  ) throw new RangeError("Physical cargo commits cannot silently change region, owner, dimensions, or capacity");
  const reservedDelta = carrier.reservedLoadMilli - canonicalPrior.carrier.reservedLoadMilli;
  const authorizedReservedDelta = authorization.reservedLoadDeltaMilli ?? 0;
  if (!Number.isSafeInteger(authorizedReservedDelta) || reservedDelta !== authorizedReservedDelta) {
    throw new RangeError("Physical cargo reserved load changed without an exact authorization");
  }
  const actualDelta = subtractSubstanceLedgers(
    substanceLedger(looseWorld, carrier),
    substanceLedger(canonicalPrior.looseWorld, canonicalPrior.carrier),
  );
  const expectedDelta = authorization.kind === "conserved"
    ? new Map<string, number>()
    : subtractSubstanceLedgers(
        substanceLedgerFromPayloads(authorization.added),
        substanceLedgerFromPayloads(authorization.removed),
      );
  if (stableStringify([...actualDelta]) !== stableStringify([...expectedDelta])) {
    throw new RangeError("Physical cargo substance changed outside the declared transaction delta");
  }
  assertForwardPhysicalTransition(
    canonicalPrior.looseWorld,
    canonicalPrior.carrier,
    looseWorld,
    carrier,
    authorization,
  );
  const ordinal = update.committedSourceOrdinal ?? canonicalPrior.lastSourceOrdinal;
  if (
    !Number.isSafeInteger(ordinal)
    || ordinal < canonicalPrior.lastSourceOrdinal
    || ordinal > canonicalPrior.lastSourceOrdinal + 1
  ) {
    throw new RangeError("Physical cargo source ordinals must commit monotonically one at a time");
  }
  if (
    ordinal > canonicalPrior.lastSourceOrdinal
    && stableStringify(looseWorld) === stableStringify(canonicalPrior.looseWorld)
    && stableStringify(carrier) === stableStringify(canonicalPrior.carrier)
  ) {
    throw new RangeError("Physical cargo source ordinal cannot advance without a physical mutation");
  }
  return sealPhysicalCargoState({
    version: PHYSICAL_CARGO_STATE_VERSION,
    lastSourceOrdinal: ordinal,
    looseWorld,
    carrier,
    expectedManifest: createLooseCargoExpectedManifest(looseWorld, carrier),
  });
}

/**
 * A valid loose-cargo object is not necessarily a valid successor. This gate
 * rejects old, independently valid snapshots before the outer sidecar can
 * bless them with a fresh seal.
 */
function assertForwardPhysicalTransition(
  priorWorld: LooseCargoWorldState,
  priorCarrier: LooseCargoCarrierState,
  nextWorld: LooseCargoWorldState,
  nextCarrier: LooseCargoCarrierState,
  authorization: PhysicalCargoCommitAuthorization,
): void {
  const worldCursors = [
    ["revision", priorWorld.revision, nextWorld.revision],
    ["completed steps", priorWorld.completedSteps, nextWorld.completedSteps],
    ["entity ordinal", priorWorld.lastEntityOrdinal, nextWorld.lastEntityOrdinal],
    ["event ordinal", priorWorld.lastEventOrdinal, nextWorld.lastEventOrdinal],
    ["history base ordinal", priorWorld.historyBaseOrdinal, nextWorld.historyBaseOrdinal],
  ] as const;
  for (const [label, prior, next] of worldCursors) {
    if (next < prior) throw new RangeError(`Physical cargo ${label} cannot roll backward`);
  }
  if (nextCarrier.revision < priorCarrier.revision) {
    throw new RangeError("Physical cargo carrier revision cannot roll backward");
  }
  if (
    nextWorld.completedSteps - priorWorld.completedSteps
      > nextWorld.revision - priorWorld.revision
  ) {
    throw new RangeError("Physical cargo completed steps cannot outrun world revisions");
  }
  if (nextWorld.revision === priorWorld.revision
    && stableStringify(nextWorld) !== stableStringify(priorWorld)) {
    throw new RangeError("Physical cargo world changed without advancing its revision");
  }
  if (nextCarrier.revision === priorCarrier.revision
    && stableStringify(nextCarrier) !== stableStringify(priorCarrier)) {
    throw new RangeError("Physical cargo carrier changed without advancing its revision");
  }
  if (nextCarrier.revision > priorCarrier.revision) {
    const withoutRevision = { ...nextCarrier, revision: priorCarrier.revision };
    if (stableStringify(withoutRevision) === stableStringify(priorCarrier)) {
      throw new RangeError("Physical cargo carrier revision cannot advance without a mutation");
    }
  }
  const nextRetired = new Set(nextCarrier.retiredLotIds);
  if (priorCarrier.retiredLotIds.some((id) => !nextRetired.has(id))) {
    throw new RangeError("Physical cargo retired identities cannot be deleted");
  }
  const nextLotIds = new Set(nextCarrier.lots.map(({ id }) => id));
  if (priorCarrier.lots.some(({ id }) => !nextLotIds.has(id) && !nextRetired.has(id))) {
    throw new RangeError("Physical cargo removed lot identities must remain retired");
  }
  const appendedHistory = assertHistoryContinuation(priorWorld, nextWorld);
  assertWorldMutationEvidence(priorWorld, nextWorld, appendedHistory);
  assertMaterialDoesNotRollback(
    priorWorld,
    priorCarrier,
    nextWorld,
    nextCarrier,
    materialDeltaAllowances(authorization),
  );
}

function assertHistoryContinuation(
  prior: LooseCargoWorldState,
  next: LooseCargoWorldState,
): LooseCargoWorldState["history"] {
  const compactedCount = next.historyBaseOrdinal - prior.historyBaseOrdinal;
  if (compactedCount > prior.history.length) {
    throw new RangeError("Physical cargo history cannot archive unseen future records");
  }
  const compacted = prior.history.slice(0, compactedCount);
  const expectedArchive = compacted.length === 0
    ? prior.historyArchiveHash
    : foldPhysicalCargoHistory(prior.historyArchiveHash, compacted);
  if (next.historyArchiveHash !== expectedArchive) {
    throw new RangeError("Physical cargo history archive cannot roll back or fork");
  }
  const retained = prior.history.slice(compactedCount);
  if (retained.length > next.history.length) {
    throw new RangeError("Physical cargo event history cannot delete retained records");
  }
  for (let index = 0; index < retained.length; index += 1) {
    if (stableStringify(next.history[index]) !== stableStringify(retained[index])) {
      throw new RangeError("Physical cargo event history must preserve its immutable prefix");
    }
  }
  return next.history.slice(retained.length);
}

function assertWorldMutationEvidence(
  prior: LooseCargoWorldState,
  next: LooseCargoWorldState,
  appendedHistory: LooseCargoWorldState["history"],
): void {
  const priorEntities = new Map(prior.entities.map((entity) => [entity.id, entity]));
  const nextEntities = new Map(next.entities.map((entity) => [entity.id, entity]));
  const added = next.entities.filter((entity) => !priorEntities.has(entity.id));
  const removed = prior.entities.filter((entity) => !nextEntities.has(entity.id));
  for (const [id, entity] of priorEntities) {
    const successor = nextEntities.get(id);
    if (!successor) continue;
    if (
      stableStringify(successor.origin) !== stableStringify(entity.origin)
      || stableStringify(successor.owner) !== stableStringify(entity.owner)
      || stableStringify(successor.payload) !== stableStringify(entity.payload)
    ) {
      throw new RangeError("Physical cargo parcel identity, owner, and payload are immutable while persisted");
    }
    if (successor.lastEventOrdinal < entity.lastEventOrdinal) {
      throw new RangeError("Physical cargo parcel event ordinal cannot roll backward");
    }
  }
  for (const entity of added) {
    const localOrigin = stableStringify(entity.origin.region) === stableStringify(next.region);
    if (localOrigin && entity.origin.ordinal <= prior.lastEntityOrdinal) {
      throw new RangeError("Physical cargo cannot resurrect an allocated parcel identity");
    }
    if (!appendedHistory.some((record) =>
      (record.kind === "drop" || record.kind === "scatter")
      && record.entityIds.includes(entity.id))) {
      throw new RangeError("Physical cargo additions require new drop or scatter evidence");
    }
  }
  for (const entity of removed) {
    if (!appendedHistory.some((record) =>
      (record.kind === "pickup" || record.kind === "merge")
      && record.entityIds.includes(entity.id))) {
      throw new RangeError("Physical cargo removals require new pickup or merge evidence");
    }
  }
  if (next.completedSteps === prior.completedSteps) {
    for (const [id, entity] of priorEntities) {
      const successor = nextEntities.get(id);
      if (successor && stableStringify(successor) !== stableStringify(entity)) {
        throw new RangeError("Physical cargo entity state changed without an environment step");
      }
    }
  }
  if (next.revision > prior.revision) {
    const withoutRevision = { ...next, revision: prior.revision };
    if (stableStringify(withoutRevision) === stableStringify(prior)) {
      throw new RangeError("Physical cargo world revision cannot advance without a mutation");
    }
  }
}

function foldPhysicalCargoHistory(
  priorHash: string,
  records: LooseCargoWorldState["history"],
): string {
  let hash = BigInt(`0x${priorHash}`);
  const prime = 1_099_511_628_211n;
  for (const record of records) {
    const text = stableStringify(record);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= BigInt(text.charCodeAt(index));
      hash = BigInt.asUintN(64, hash * prime);
    }
  }
  return hash.toString(16).padStart(16, "0");
}

interface MaterialProfileEntry {
  readonly quantity: number;
  readonly condition: number;
  readonly contamination: number;
  readonly decay: number;
}

interface MaterialDeltaAllowance {
  readonly removed: number;
  readonly added: number;
}

function materialDeltaAllowances(
  authorization: PhysicalCargoCommitAuthorization,
): ReadonlyMap<string, MaterialDeltaAllowance> {
  if (authorization.kind === "conserved") return new Map();
  const removed = substanceLedgerFromPayloads(authorization.removed);
  const added = substanceLedgerFromPayloads(authorization.added);
  const keys = [...new Set([...removed.keys(), ...added.keys()])].sort();
  return new Map(keys.map((key) => [key, {
    removed: removed.get(key) ?? 0,
    added: added.get(key) ?? 0,
  }]));
}

function assertMaterialDoesNotRollback(
  priorWorld: LooseCargoWorldState,
  priorCarrier: LooseCargoCarrierState,
  nextWorld: LooseCargoWorldState,
  nextCarrier: LooseCargoCarrierState,
  allowances: ReadonlyMap<string, MaterialDeltaAllowance>,
): void {
  const priorProfiles = materialProfiles(priorWorld, priorCarrier);
  const nextProfiles = materialProfiles(nextWorld, nextCarrier);
  for (const [key, prior] of priorProfiles) {
    const next = nextProfiles.get(key);
    if (!next) continue;
    const allowance = allowances.get(key) ?? { removed: 0, added: 0 };
    assertMaterialMetric(prior, next, "condition", "nonincreasing", allowance);
    assertMaterialMetric(prior, next, "contamination", "nondecreasing", allowance);
    assertMaterialMetric(prior, next, "decay", "nondecreasing", allowance);
  }
}

function materialProfiles(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
): Map<string, readonly MaterialProfileEntry[]> {
  const profiles = new Map<string, MaterialProfileEntry[]>();
  for (const value of [
    ...world.entities.map(({ payload, materialState }) => ({ payload, materialState })),
    ...carrier.lots.map(({ payload, materialState }) => ({ payload, materialState })),
  ]) {
    const key = materialPayloadKey(value.payload);
    const quantity = value.payload.kind === "gear" ? 1 : value.payload.quantity;
    const entries = profiles.get(key) ?? [];
    entries.push({ quantity, ...value.materialState });
    profiles.set(key, entries);
  }
  return new Map([...profiles].sort(([left], [right]) => left.localeCompare(right)));
}

function materialPayloadKey(payload: LooseCargoPayload): string {
  if (payload.kind === "stack") return stableStringify({ kind: payload.kind, item: payload.item });
  if (payload.kind === "promise") return stableStringify({
    kind: payload.kind,
    contractId: payload.contractId,
    resource: payload.resource,
    property: payload.property,
  });
  return stableStringify(payload);
}

function assertMaterialMetric(
  prior: readonly MaterialProfileEntry[],
  next: readonly MaterialProfileEntry[],
  metric: "condition" | "contamination" | "decay",
  direction: "nonincreasing" | "nondecreasing",
  allowance: MaterialDeltaAllowance,
): void {
  const descending = direction === "nonincreasing";
  const sortMetric = (left: MaterialProfileEntry, right: MaterialProfileEntry) =>
    descending ? right[metric] - left[metric] : left[metric] - right[metric];
  // The least favorable old units are the ones an authorized removal may
  // consume; the most favorable new units are the ones an authorized addition
  // may introduce. Strip only those declared quantities, then require every
  // conserved quantile to move in the physically irreversible direction.
  const before = trimMaterialProfile([...prior].sort(sortMetric), allowance.removed, "end");
  const after = trimMaterialProfile([...next].sort(sortMetric), allowance.added, "start");
  let beforeIndex = 0;
  let afterIndex = 0;
  let beforeRemaining = before[0]?.quantity ?? 0;
  let afterRemaining = after[0]?.quantity ?? 0;
  while (beforeIndex < before.length && afterIndex < after.length) {
    const beforeEntry = before[beforeIndex]!;
    const afterEntry = after[afterIndex]!;
    const rolledBack = descending
      ? afterEntry[metric] > beforeEntry[metric]
      : afterEntry[metric] < beforeEntry[metric];
    if (rolledBack) {
      throw new RangeError(`Physical cargo ${metric} cannot be rolled back by a conserved transition`);
    }
    const matched = Math.min(beforeRemaining, afterRemaining);
    beforeRemaining -= matched;
    afterRemaining -= matched;
    if (beforeRemaining === 0) {
      beforeIndex += 1;
      beforeRemaining = before[beforeIndex]?.quantity ?? 0;
    }
    if (afterRemaining === 0) {
      afterIndex += 1;
      afterRemaining = after[afterIndex]?.quantity ?? 0;
    }
  }
}

function trimMaterialProfile(
  entries: readonly MaterialProfileEntry[],
  quantity: number,
  side: "start" | "end",
): MaterialProfileEntry[] {
  const result = entries.map((entry) => ({ ...entry }));
  let remaining = quantity;
  while (remaining > 0 && result.length > 0) {
    const index = side === "start" ? 0 : result.length - 1;
    const entry = result[index]!;
    const removed = Math.min(remaining, entry.quantity);
    remaining -= removed;
    if (removed === entry.quantity) result.splice(index, 1);
    else result[index] = { ...entry, quantity: entry.quantity - removed };
  }
  return result;
}

/** Quote a stable event-derived lot ID without mutating the cursor on failure. */
export function quotePhysicalCargoSource(
  state: PhysicalCargoState,
  cause: string,
  identity: string,
): PhysicalCargoSourceQuote {
  if (state.lastSourceOrdinal >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Physical cargo source identity space is exhausted");
  }
  const canonicalCause = canonicalSourceLabel(cause);
  const canonicalIdentity = canonicalSourceIdentity(identity);
  const ordinal = state.lastSourceOrdinal + 1;
  return {
    ordinal,
    lotId: `pc:0:0:source:${ordinal}:${canonicalCause}:${hashCanonical(canonicalIdentity)}`,
  };
}

/** Strict v3 adoption. Missing or inconsistent sidecars are corruption, not migration. */
export function validatePhysicalCargoState(
  value: unknown,
  player: PlayerState,
  width: number,
  height: number,
): PhysicalCargoValidation {
  const internal = validatePhysicalCargoInternals(value);
  if (!internal) {
    if (!isRecord(value)
      || value.version !== PHYSICAL_CARGO_STATE_VERSION
      || !Number.isSafeInteger(value.lastSourceOrdinal)
      || (value.lastSourceOrdinal as number) < 0
      || typeof value.integrity !== "string") return invalid("invalid-state");
    const unsealed = unsealPhysicalCargo(value);
    if (value.integrity !== physicalCargoIntegrity(unsealed)) return invalid("invalid-integrity");
    const worldValidation = validateLooseCargoWorld(value.looseWorld);
    if (!worldValidation.valid) return invalid("invalid-world");
    const carrierValidation = validateLooseCargoCarrier(value.carrier);
    if (!carrierValidation.valid) return invalid("invalid-carrier");
    return invalid("manifest-mismatch");
  }
  const { looseWorld, carrier, expectedManifest } = internal;
  if (carrier.owner.kind !== "player" || carrier.owner.id !== LOCAL_PORTER_ID) {
    return invalid("invalid-owner");
  }
  if (
    looseWorld.width !== width
    || looseWorld.height !== height
    || looseWorld.region.x !== 0
    || looseWorld.region.y !== 0
  ) return invalid("invalid-dimensions");
  if (carrier.capacityMilliLoad !== player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT) {
    return invalid("invalid-capacity");
  }
  if (carrier.reservedLoadMilli !== (player.report ? PACK_LOAD_MILLI_PER_UNIT : 0)) {
    return invalid("invalid-reserved-load");
  }
  const mirror = projectLooseCargoCarrierToPlayer(carrier);
  if (
    stableStringify(mirror.craftingInventory) !== stableStringify(player.craftingInventory)
    || stableStringify(mirror.cargo) !== stableStringify(player.cargo)
    || looseCargoCarrierLoadMilli(carrier) !== cargoWeightMilli(player)
  ) return invalid("player-mirror-mismatch");
  return {
    valid: true,
    reason: "valid",
    state: {
      version: PHYSICAL_CARGO_STATE_VERSION,
      lastSourceOrdinal: internal.lastSourceOrdinal,
      looseWorld,
      carrier,
      expectedManifest,
      integrity: internal.integrity,
    },
  };
}

/** Canonical hash for an entire save envelope, excluding its own seal field. */
export function gameSaveEnvelopeIntegrity(value: Readonly<Record<string, unknown>>): string {
  const { integrity: _integrity, ...unsealed } = value;
  return hashCanonical(unsealed);
}

function sealPhysicalCargoState(
  value: Omit<PhysicalCargoState, "integrity">,
): PhysicalCargoState {
  return { ...value, integrity: physicalCargoIntegrity(value) };
}

function physicalCargoIntegrity(value: unknown): string {
  return hashCanonical(value);
}

function validatePhysicalCargoInternals(value: unknown): PhysicalCargoState | null {
  if (!isRecord(value)
    || value.version !== PHYSICAL_CARGO_STATE_VERSION
    || !Number.isSafeInteger(value.lastSourceOrdinal)
    || (value.lastSourceOrdinal as number) < 0
    || typeof value.integrity !== "string") return null;
  const unsealed = unsealPhysicalCargo(value);
  if (value.integrity !== physicalCargoIntegrity(unsealed)) return null;
  const worldValidation = validateLooseCargoWorld(value.looseWorld);
  const carrierValidation = validateLooseCargoCarrier(value.carrier);
  if (!worldValidation.valid || !worldValidation.state
    || !carrierValidation.valid || !carrierValidation.carrier) return null;
  const manifest = validateLooseCargoExpectedManifest(
    value.expectedManifest,
    worldValidation.state,
    carrierValidation.carrier,
  );
  if (!manifest.valid || !manifest.actual) return null;
  return {
    version: PHYSICAL_CARGO_STATE_VERSION,
    lastSourceOrdinal: value.lastSourceOrdinal as number,
    looseWorld: worldValidation.state,
    carrier: carrierValidation.carrier,
    expectedManifest: manifest.actual,
    integrity: value.integrity,
  };
}

function unsealPhysicalCargo(value: Record<string, unknown>): Record<string, unknown> {
  return {
    version: value.version,
    lastSourceOrdinal: value.lastSourceOrdinal,
    looseWorld: value.looseWorld,
    carrier: value.carrier,
    expectedManifest: value.expectedManifest,
  };
}

function substanceLedger(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
): Map<string, number> {
  return substanceLedgerFromPayloads([
    ...world.entities.map(({ payload }) => payload),
    ...carrier.lots.map(({ payload }) => payload),
  ]);
}

function substanceLedgerFromPayloads(payloads: readonly LooseCargoPayload[]): Map<string, number> {
  const entries = new Map<string, number>();
  for (const payload of payloads) {
    const [key, quantity] = payload.kind === "stack"
      ? [stableStringify({ kind: payload.kind, item: payload.item }), payload.quantity] as const
      : payload.kind === "promise"
        ? [stableStringify({
            kind: payload.kind,
            contractId: payload.contractId,
            resource: payload.resource,
            property: payload.property,
          }), payload.quantity] as const
        : [stableStringify(payload), 1] as const;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new RangeError("Physical cargo deltas require positive integer payload quantities");
    }
    const total = (entries.get(key) ?? 0) + quantity;
    if (!Number.isSafeInteger(total)) throw new RangeError("Physical cargo substance ledger overflowed");
    entries.set(key, total);
  }
  return new Map([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

function subtractSubstanceLedgers(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): Map<string, number> {
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  const delta = new Map<string, number>();
  for (const key of keys) {
    const amount = (left.get(key) ?? 0) - (right.get(key) ?? 0);
    if (amount !== 0) delta.set(key, amount);
  }
  return delta;
}

function canonicalSourceLabel(value: string): string {
  const trimmed = value.trim().toLocaleLowerCase();
  if (
    trimmed.length < 1
    || trimmed.length > MAX_SOURCE_LABEL_LENGTH
    || !/^[a-z0-9][a-z0-9._:/-]*$/.test(trimmed)
  ) throw new RangeError("Physical cargo source labels must be bounded canonical identifiers");
  return trimmed;
}

function canonicalSourceIdentity(value: string): string {
  const trimmed = value.trim().toLocaleLowerCase();
  if (
    trimmed.length < 1
    || trimmed.length > MAX_SOURCE_LABEL_LENGTH
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) throw new RangeError("Physical cargo source identities must be bounded text without control characters");
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(reason: Exclude<PhysicalCargoValidation["reason"], "valid">): PhysicalCargoValidation {
  return { valid: false, reason, state: null };
}
