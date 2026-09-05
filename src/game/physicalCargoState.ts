import { hashCanonical, stableStringify } from "../sim/util";
import {
  PACK_LOAD_MILLI_PER_UNIT,
  cargoWeightMilli,
  type PlayerState,
} from "./player";
import { createCraftingInventory } from "./crafting";
import {
  LOOSE_CARGO_MAX_ATOMIC_REGIONS,
  LOOSE_CARGO_MAX_MULTI_WORLD_MANIFEST_ENTRIES,
  createLooseCargoCarrier,
  createLooseCargoExpectedManifest,
  createLooseCargoMultiWorldExpectedManifest,
  createLooseCargoWorld,
  inspectLooseCargoMultiWorldConservation,
  looseCargoRegionKey,
  stepLooseCargoAcrossRegions,
  validateLooseCargoCarrier,
  validateLooseCargoExpectedManifest,
  validateLooseCargoMultiWorldExpectedManifest,
  validateLooseCargoWorld,
  looseCargoCarrierLoadMilli,
  looseCargoPayloadLoadMilli,
  type LooseCargoCarrierState,
  type LooseCargoEntity,
  type LooseCargoExpectedManifest,
  type LooseCargoPayload,
  type LooseCargoRegionHandoff,
  type LooseCargoRegionAddress,
  type LooseCargoRegionalStepEvent,
  type LooseCargoRegionalStepInput,
  type LooseCargoRegionalStepReason,
  type LooseCargoWorldState,
} from "./looseCargo";
import { projectLooseCargoCarrierToPlayer } from "./looseCargoRuntime";

export const PHYSICAL_CARGO_STATE_VERSION = 2 as const;
export const PHYSICAL_CARGO_LEGACY_STATE_VERSION = 1 as const;
export const LOCAL_PORTER_ID = "local-porter" as const;
/** Physical cargo is a sparse subset of the durable 131,072-region manifest. */
export const PHYSICAL_CARGO_MAX_INACTIVE_WORLDS = 131_071;
/** Matches the region-manifest save budget; empty generated worlds are never retained. */
export const PHYSICAL_CARGO_MAX_SERIALIZED_BYTES = 32 * 1_024 * 1_024;
const MAX_SOURCE_LABEL_LENGTH = 96;
const MAX_SOURCE_LOT_ID_LENGTH = 160;
const TRUSTED_PHYSICAL_CARGO_STATES = new WeakSet<object>();
const TRUSTED_INACTIVE_WORLDS = new WeakSet<object>();
interface CachedCargoCollectionMetadata {
  readonly serializedBytes: number;
  readonly integrity: string;
}

const EXPECTED_MANIFEST_METADATA = new WeakMap<object, CachedCargoCollectionMetadata>();
const CARRIER_METADATA = new WeakMap<object, CachedCargoCollectionMetadata>();
const UTF8_ENCODER = new TextEncoder();

export interface PhysicalCargoInactiveWorld {
  readonly regionKey: string;
  readonly world: LooseCargoWorldState;
  /** Inner seal lets active commits hash bounded metadata instead of every unloaded history. */
  readonly integrity: string;
}

interface PhysicalCargoInactiveNode {
  readonly entry: PhysicalCargoInactiveWorld;
  readonly left: PhysicalCargoInactiveNode | null;
  readonly right: PhysicalCargoInactiveNode | null;
  readonly height: number;
  readonly size: number;
  readonly entriesSerializedBytes: number;
  readonly integrity: string;
}

interface PhysicalCargoInactiveIndex {
  readonly kind: "physical-cargo-inactive-avl-v1";
  readonly root: PhysicalCargoInactiveNode | null;
  readonly size: number;
  /** Shape-aware Merkle root; every update recalculates only one AVL path. */
  readonly integrity: string;
  /** Exact byte size of the canonical flat-array save representation. */
  readonly serializedBytes: number;
}

export interface PhysicalCargoState {
  readonly version: typeof PHYSICAL_CARGO_STATE_VERSION;
  /** Monotonic source identity cursor. It advances only with a committed mutation. */
  readonly lastSourceOrdinal: number;
  readonly activeRegion: LooseCargoRegionAddress;
  readonly activeRegionKey: string;
  readonly looseWorld: LooseCargoWorldState;
  /** Strictly sorted, touched-only worlds. Generated empty worlds are reproducible and omitted. */
  /** Runtime-only immutable persistent index; saves flatten it canonically. */
  readonly inactiveWorldIndex: PhysicalCargoInactiveIndex;
  readonly carrier: LooseCargoCarrierState;
  readonly expectedManifest: LooseCargoExpectedManifest;
  /** Canonical integrity for this sidecar; the save envelope adds a second outer seal. */
  readonly integrity: string;
}

/** Stable v2 wire shape retained for existing saves and public persistence. */
export interface SerializedPhysicalCargoState {
  readonly version: typeof PHYSICAL_CARGO_STATE_VERSION;
  readonly lastSourceOrdinal: number;
  readonly activeRegion: LooseCargoRegionAddress;
  readonly activeRegionKey: string;
  readonly looseWorld: LooseCargoWorldState;
  readonly inactiveWorlds: readonly PhysicalCargoInactiveWorld[];
  readonly carrier: LooseCargoCarrierState;
  readonly expectedManifest: LooseCargoExpectedManifest;
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
    | "invalid-region"
    | "invalid-inactive-worlds"
    | "noncanonical-order"
    | "duplicate-identity"
    | "invalid-dimensions"
    | "invalid-capacity"
    | "invalid-reserved-load"
    | "oversized"
    | "manifest-mismatch"
    | "player-mirror-mismatch";
  readonly state: PhysicalCargoState | null;
}

export interface PhysicalCargoRegionalStepResult {
  readonly ok: boolean;
  readonly reason: LooseCargoRegionalStepReason | "invalid-state" | "manifest-mismatch";
  readonly state: PhysicalCargoState;
  readonly events: readonly LooseCargoRegionalStepEvent[];
  readonly handoffs: readonly LooseCargoRegionHandoff[];
}

/** Bounded spatial query diagnostics make accidental whole-save scans testable. */
export interface PhysicalCargoPartitionQuery {
  readonly worlds: readonly LooseCargoWorldState[];
  readonly requestedRegionCount: number;
  readonly inactiveProbeCount: number;
}

export interface PhysicalCargoPromiseCustody {
  readonly carriedQuantity: number;
  readonly looseQuantity: number;
  readonly condition: number;
}

export interface PhysicalCargoPartitionIndexAudit {
  readonly valid: boolean;
  readonly size: number;
  readonly height: number;
  readonly maximumBalance: number;
  readonly inactiveSerializedBytes: number;
  readonly sidecarSerializedBytes: number;
}

/** Build a new v2 custody sidecar without inventing or deleting inventory. */
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
    activeRegion: looseWorld.region,
    activeRegionKey: looseCargoRegionKey(looseWorld.region),
    looseWorld,
    inactiveWorldIndex: createInactiveWorldIndex([]),
    carrier,
    expectedManifest: createLooseCargoMultiWorldExpectedManifest([looseWorld], carrier),
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
  // `actualDelta` above proves the complete active-world/carrier mutation.
  // Inactive owners are immutable and shared by reference, so rebuilding the
  // global manifest from every region here adds no safety. Conserved actions
  // retain the exact trusted manifest; authorized deltas update only their
  // declared structural entries.
  const expectedManifest = authorization.kind === "conserved"
    ? canonicalPrior.expectedManifest
    : applyExpectedManifestAuthorization(canonicalPrior.expectedManifest, authorization);
  return sealPhysicalCargoState({
    version: PHYSICAL_CARGO_STATE_VERSION,
    lastSourceOrdinal: ordinal,
    activeRegion: canonicalPrior.activeRegion,
    activeRegionKey: canonicalPrior.activeRegionKey,
    looseWorld,
    inactiveWorldIndex: canonicalPrior.inactiveWorldIndex,
    carrier,
    expectedManifest,
  });
}

/**
 * Atomically exchange the active regional world. Touched worlds receive one
 * sealed inactive slot; pristine empty worlds are deterministic and are
 * regenerated instead of consuming memory or save budget.
 */
export function transitionPhysicalCargoRegion(
  prior: PhysicalCargoState,
  targetRegion: LooseCargoRegionAddress,
  width: number,
  height: number,
): PhysicalCargoState {
  const canonicalPrior = validatePhysicalCargoInternals(prior);
  if (!canonicalPrior) {
    throw new RangeError("Cannot transition an invalid physical cargo sidecar");
  }
  const emptyTarget = createLooseCargoWorld(width, height, targetRegion);
  if (
    canonicalPrior.looseWorld.width !== width
    || canonicalPrior.looseWorld.height !== height
  ) throw new RangeError("Physical cargo regions must share canonical dimensions");
  const targetKey = looseCargoRegionKey(emptyTarget.region);
  if (targetKey === canonicalPrior.activeRegionKey) {
    return canonicalPrior;
  }

  const storedTarget = inactiveIndexGet(canonicalPrior.inactiveWorldIndex, targetKey);
  const looseWorld = storedTarget?.world ?? emptyTarget;
  if (looseWorld.width !== width || looseWorld.height !== height) {
    throw new RangeError("Stored physical cargo region dimensions do not match the generated target");
  }

  let inactiveWorldIndex = inactiveIndexDelete(canonicalPrior.inactiveWorldIndex, targetKey);
  if (isTouchedLooseCargoWorld(canonicalPrior.looseWorld)) {
    inactiveWorldIndex = inactiveIndexSet(
      inactiveWorldIndex,
      sealInactiveWorld(canonicalPrior.looseWorld),
    );
  }
  if (inactiveWorldIndex.size > PHYSICAL_CARGO_MAX_INACTIVE_WORLDS) {
    throw new RangeError("Physical cargo inactive-region capacity exhausted");
  }
  return sealPhysicalCargoState({
    version: PHYSICAL_CARGO_STATE_VERSION,
    lastSourceOrdinal: canonicalPrior.lastSourceOrdinal,
    activeRegion: looseWorld.region,
    activeRegionKey: targetKey,
    looseWorld,
    inactiveWorldIndex,
    carrier: canonicalPrior.carrier,
    expectedManifest: canonicalPrior.expectedManifest,
  });
}

/**
 * Canonical snapshot of every touched storage owner. Region-key order is
 * stable and independent of which region currently contains the player.
 */
export function physicalCargoWorlds(
  state: PhysicalCargoState,
): readonly LooseCargoWorldState[] {
  const canonical = validatePhysicalCargoInternals(state);
  if (!canonical) throw new RangeError("Cannot inspect an invalid physical cargo sidecar");
  return [
    canonical.looseWorld,
    ...inactiveIndexEntries(canonical.inactiveWorldIndex).map(({ world }) => world),
  ].sort(compareLooseCargoWorlds);
}

/** Explicit O(N) inspection/save helper. Never use from a fixed-step path. */
export function physicalCargoInactiveWorlds(
  state: PhysicalCargoState,
): readonly PhysicalCargoInactiveWorld[] {
  const canonical = validatePhysicalCargoInternals(state);
  if (!canonical) throw new RangeError("Cannot inspect an invalid physical cargo sidecar");
  return inactiveIndexEntries(canonical.inactiveWorldIndex);
}

/** Flatten the persistent runtime index only at a persistence/debug boundary. */
export function snapshotPhysicalCargoState(
  state: PhysicalCargoState,
): SerializedPhysicalCargoState {
  const canonical = validatePhysicalCargoInternals(state);
  if (!canonical) throw new RangeError("Cannot snapshot an invalid physical cargo sidecar");
  const unsealed: Omit<SerializedPhysicalCargoState, "integrity"> = {
    version: canonical.version,
    lastSourceOrdinal: canonical.lastSourceOrdinal,
    activeRegion: canonical.activeRegion,
    activeRegionKey: canonical.activeRegionKey,
    looseWorld: canonical.looseWorld,
    inactiveWorlds: inactiveIndexEntries(canonical.inactiveWorldIndex),
    carrier: canonical.carrier,
    expectedManifest: canonical.expectedManifest,
  };
  return Object.freeze({
    ...unsealed,
    integrity: serializedPhysicalCargoIntegrity(unsealed),
  });
}

/** Deliberately O(N) development/audit surface; fixed-step code must not call it. */
export function inspectPhysicalCargoPartitionIndex(
  state: PhysicalCargoState,
): PhysicalCargoPartitionIndexAudit {
  const canonical = validatePhysicalCargoInternals(state);
  if (!canonical) throw new RangeError("Cannot audit an invalid physical cargo sidecar");
  interface NodeAudit {
    readonly valid: boolean;
    readonly size: number;
    readonly height: number;
    readonly entriesSerializedBytes: number;
    readonly maximumBalance: number;
    readonly minimumKey: string | null;
    readonly maximumKey: string | null;
  }
  const visit = (node: PhysicalCargoInactiveNode | null): NodeAudit => {
    if (!node) return {
      valid: true,
      size: 0,
      height: 0,
      entriesSerializedBytes: 0,
      maximumBalance: 0,
      minimumKey: null,
      maximumKey: null,
    };
    const left = visit(node.left);
    const right = visit(node.right);
    const height = 1 + Math.max(left.height, right.height);
    const size = 1 + left.size + right.size;
    const entriesSerializedBytes = inactiveEntrySerializedBytes(node.entry)
      + left.entriesSerializedBytes
      + right.entriesSerializedBytes;
    const balance = left.height - right.height;
    const integrity = hashCanonical({
      key: node.entry.regionKey,
      entryIntegrity: node.entry.integrity,
      left: node.left?.integrity ?? null,
      right: node.right?.integrity ?? null,
      height,
      size,
    });
    return {
      valid: left.valid
        && right.valid
        && Math.abs(balance) <= 1
        && (left.maximumKey === null || left.maximumKey < node.entry.regionKey)
        && (right.minimumKey === null || node.entry.regionKey < right.minimumKey)
        && node.height === height
        && node.size === size
        && node.entriesSerializedBytes === entriesSerializedBytes
        && node.integrity === integrity,
      size,
      height,
      entriesSerializedBytes,
      maximumBalance: Math.max(Math.abs(balance), left.maximumBalance, right.maximumBalance),
      minimumKey: left.minimumKey ?? node.entry.regionKey,
      maximumKey: right.maximumKey ?? node.entry.regionKey,
    };
  };
  const tree = visit(canonical.inactiveWorldIndex.root);
  return Object.freeze({
    valid: tree.valid
      && tree.size === canonical.inactiveWorldIndex.size
      && canonical.inactiveWorldIndex.integrity
        === (canonical.inactiveWorldIndex.root?.integrity ?? hashCanonical([]))
      && canonical.inactiveWorldIndex.serializedBytes
        === (tree.size === 0 ? 2 : 2 + tree.entriesSerializedBytes + tree.size - 1),
    size: tree.size,
    height: tree.height,
    maximumBalance: tree.maximumBalance,
    inactiveSerializedBytes: canonical.inactiveWorldIndex.serializedBytes,
    sidecarSerializedBytes: physicalCargoSerializedBytes(canonical),
  });
}

/**
 * Resolve only explicitly requested storage owners. The inactive collection is
 * canonical and sorted, so each lookup is logarithmic and never walks the
 * player's lifetime cargo history. Callers must supply a bounded live spatial
 * neighborhood rather than an arbitrary save-sized region list.
 */
export function queryPhysicalCargoPartitions(
  state: PhysicalCargoState,
  regions: readonly LooseCargoRegionAddress[],
): PhysicalCargoPartitionQuery {
  const canonical = validatePhysicalCargoInternals(state);
  if (!canonical) throw new RangeError("Cannot inspect an invalid physical cargo sidecar");
  if (!Array.isArray(regions) || regions.length > LOOSE_CARGO_MAX_ATOMIC_REGIONS) {
    throw new RangeError("Physical cargo partition query exceeds the bounded live neighborhood");
  }
  const keys = new Set<string>();
  const worlds: LooseCargoWorldState[] = [];
  const audit = { probes: 0 };
  for (const region of regions) {
    const key = looseCargoRegionKey(region);
    if (keys.has(key)) continue;
    keys.add(key);
    if (key === canonical.activeRegionKey) {
      worlds.push(canonical.looseWorld);
      continue;
    }
    const inactive = inactiveIndexGet(canonical.inactiveWorldIndex, key, audit);
    if (inactive) worlds.push(inactive.world);
  }
  worlds.sort(compareLooseCargoWorlds);
  return Object.freeze({
    worlds: Object.freeze(worlds),
    requestedRegionCount: keys.size,
    inactiveProbeCount: audit.probes,
  });
}

/** Global Promise quantities come from the conserved manifest, not a region scan. */
export function physicalCargoPromiseCustody(
  state: PhysicalCargoState,
  contractId: number,
): PhysicalCargoPromiseCustody {
  const canonical = validatePhysicalCargoInternals(state);
  if (!canonical) throw new RangeError("Cannot inspect an invalid physical cargo sidecar");
  if (!Number.isSafeInteger(contractId) || contractId < 0) {
    throw new RangeError("Promise contract identity must be a non-negative safe integer");
  }
  const carried = canonical.carrier.lots.filter((lot) =>
    lot.payload.kind === "promise" && lot.payload.contractId === contractId);
  const carriedQuantity = carried.reduce((total, lot) =>
    total + (lot.payload.kind === "promise" ? lot.payload.quantity : 0), 0);
  const prefix = `promise:${contractId}:`;
  const entries = canonical.expectedManifest.entries;
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (entries[middle]!.payloadKey < prefix) low = middle + 1;
    else high = middle;
  }
  let totalQuantity = 0;
  for (let index = low; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (!entry.payloadKey.startsWith(prefix)) break;
    totalQuantity += entry.quantity;
  }
  if (totalQuantity < carriedQuantity) {
    throw new RangeError("Physical Promise manifest contains less cargo than its carrier");
  }
  const weightedCondition = carried.reduce((total, lot) =>
    total + (lot.payload.kind === "promise"
      ? lot.payload.quantity * lot.materialState.condition
      : 0), 0);
  return Object.freeze({
    carriedQuantity,
    looseQuantity: totalQuantity - carriedQuantity,
    condition: carriedQuantity > 0 ? Math.trunc(weightedCondition / carriedQuantity) : 0,
  });
}

/** Return a touched regional world without changing active player ownership. */
export function physicalCargoWorldAt(
  state: PhysicalCargoState,
  region: LooseCargoRegionAddress,
): LooseCargoWorldState | null {
  const canonical = validatePhysicalCargoInternals(state);
  if (!canonical) throw new RangeError("Cannot inspect an invalid physical cargo sidecar");
  const key = looseCargoRegionKey(region);
  if (key === canonical.activeRegionKey) return canonical.looseWorld;
  return inactiveIndexGet(canonical.inactiveWorldIndex, key)?.world ?? null;
}

/** Locate one parcel without assuming that the player's storage owner owns it. */
export function locatePhysicalCargoEntity(
  state: PhysicalCargoState,
  entityId: string,
): { readonly world: LooseCargoWorldState; readonly entity: LooseCargoEntity } | null {
  for (const world of physicalCargoWorlds(state)) {
    const entity = world.entities.find(({ id }) => id === entityId);
    if (entity) return { world, entity };
  }
  return null;
}

/**
 * Commit a drop/pickup/material mutation against any visible storage owner and
 * restore the player's original active owner before returning. The intermediate
 * owner exchange is never observable or persisted, so the final sidecar is one
 * atomic transaction with the same conservation and forward-history checks as
 * an ordinary active-world commit.
 */
export function commitPhysicalCargoRegionalMutation(
  prior: PhysicalCargoState,
  update: {
    readonly looseWorld: LooseCargoWorldState;
    readonly carrier: LooseCargoCarrierState;
    readonly committedSourceOrdinal?: number;
  },
  authorization: PhysicalCargoCommitAuthorization,
): PhysicalCargoState {
  const canonical = validatePhysicalCargoInternals(prior);
  if (!canonical) throw new RangeError("Cannot commit from an invalid physical cargo sidecar");
  const target = update.looseWorld.region;
  if (looseCargoRegionKey(target) === canonical.activeRegionKey) {
    return commitPhysicalCargoState(canonical, update, authorization);
  }
  const activated = transitionPhysicalCargoRegion(
    canonical,
    target,
    canonical.looseWorld.width,
    canonical.looseWorld.height,
  );
  const committed = commitPhysicalCargoState(activated, update, authorization);
  return transitionPhysicalCargoRegion(
    committed,
    canonical.activeRegion,
    canonical.looseWorld.width,
    canonical.looseWorld.height,
  );
}

/**
 * Advance visible/relevant parcels across any touched storage regions as one
 * sealed custody transaction. All eight possible neighbor owners are loaded
 * before stepping, so an inbound parcel can never overwrite a persisted but
 * currently inactive destination. Any stale input, capacity failure, invalid
 * coordinate, or conservation mismatch returns the exact prior state.
 */
export function stepPhysicalCargoAcrossRegions(
  prior: PhysicalCargoState,
  inputs: readonly LooseCargoRegionalStepInput[],
): PhysicalCargoRegionalStepResult {
  const canonicalPrior = validatePhysicalCargoInternals(prior);
  if (!canonicalPrior) {
    return {
      ok: false,
      reason: "invalid-state",
      state: prior,
      events: [],
      handoffs: [],
    };
  }
  if (
    !Array.isArray(inputs)
    || inputs.length < 1
    || inputs.length > LOOSE_CARGO_MAX_ATOMIC_REGIONS
  ) {
    return failedPhysicalRegionalStep("invalid-sample", prior);
  }
  const participating = new Map<string, LooseCargoWorldState>();
  for (const input of inputs) {
    let sourceKey: string;
    try {
      sourceKey = looseCargoRegionKey(input.region);
    } catch {
      return failedPhysicalRegionalStep("invalid-sample", prior);
    }
    const source = physicalCargoWorldAtCanonicalState(canonicalPrior, sourceKey);
    if (!source) return failedPhysicalRegionalStep("invalid-world-set", prior);
    participating.set(sourceKey, source);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const neighborX = input.region.x + offsetX;
        const neighborY = input.region.y + offsetY;
        if (!Number.isSafeInteger(neighborX) || !Number.isSafeInteger(neighborY)) continue;
        const neighborKey = looseCargoRegionKey({
          x: Object.is(neighborX, -0) ? 0 : neighborX,
          y: Object.is(neighborY, -0) ? 0 : neighborY,
        });
        const neighbor = physicalCargoWorldAtCanonicalState(canonicalPrior, neighborKey);
        if (neighbor) participating.set(neighborKey, neighbor);
      }
    }
  }
  const stepped = stepLooseCargoAcrossRegions([...participating.values()], inputs);
  if (!stepped.ok) {
    return {
      ok: false,
      reason: stepped.reason,
      state: prior,
      events: [],
      handoffs: [],
    };
  }
  try {
    const emptyCarrier = createLooseCargoCarrier(
      { kind: "unclaimed" },
      createCraftingInventory(0),
    );
    const beforeManifest = createLooseCargoMultiWorldExpectedManifest(
      [...participating.values()],
      emptyCarrier,
    );
    const afterManifest = createLooseCargoMultiWorldExpectedManifest(
      stepped.worlds,
      emptyCarrier,
    );
    if (stableStringify(beforeManifest) !== stableStringify(afterManifest)) {
      return failedPhysicalRegionalStep("manifest-mismatch", prior);
    }
  } catch {
    return failedPhysicalRegionalStep("manifest-mismatch", prior);
  }

  let looseWorld = canonicalPrior.looseWorld;
  const inactiveUpdates = new Map<string, PhysicalCargoInactiveWorld | null>();
  for (const world of stepped.worlds) {
    const key = looseCargoRegionKey(world.region);
    if (key === canonicalPrior.activeRegionKey) {
      looseWorld = world;
      continue;
    }
    const priorEntry = inactiveIndexGet(canonicalPrior.inactiveWorldIndex, key);
    if (!isTouchedLooseCargoWorld(world)) {
      if (priorEntry) inactiveUpdates.set(key, null);
      continue;
    }
    if (priorEntry?.world !== world) inactiveUpdates.set(key, sealInactiveWorld(world));
  }
  let inactiveWorldIndex: PhysicalCargoInactiveIndex;
  try {
    inactiveWorldIndex = applyInactiveWorldUpdates(
      canonicalPrior.inactiveWorldIndex,
      inactiveUpdates,
    );
  } catch {
    return failedPhysicalRegionalStep("invalid-world-set", prior);
  }

  let state: PhysicalCargoState;
  try {
    state = sealPhysicalCargoState({
      version: PHYSICAL_CARGO_STATE_VERSION,
      lastSourceOrdinal: canonicalPrior.lastSourceOrdinal,
      activeRegion: canonicalPrior.activeRegion,
      activeRegionKey: canonicalPrior.activeRegionKey,
      looseWorld,
      inactiveWorldIndex,
      carrier: canonicalPrior.carrier,
      expectedManifest: canonicalPrior.expectedManifest,
    });
  } catch {
    return failedPhysicalRegionalStep("invalid-world-set", prior);
  }
  return {
    ok: true,
    reason: "advanced",
    state,
    events: stepped.events,
    handoffs: stepped.handoffs,
  };
}

function failedPhysicalRegionalStep(
  reason: PhysicalCargoRegionalStepResult["reason"],
  state: PhysicalCargoState,
): PhysicalCargoRegionalStepResult {
  return { ok: false, reason, state, events: [], handoffs: [] };
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
  if (payload.kind === "provision") return stableStringify({
    kind: payload.kind,
    provision: payload.provision,
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
  const prefix = `pc:${state.looseWorld.region.x}:${state.looseWorld.region.y}:source:${ordinal}:`;
  const identityHash = hashCanonical(canonicalIdentity);
  const readable = `${prefix}${canonicalCause}:${identityHash}`;
  const lotId = readable.length <= MAX_SOURCE_LOT_ID_LENGTH
    ? readable
    : `${prefix}cause-${hashCanonical(canonicalCause)}:${identityHash}`;
  return {
    ordinal,
    lotId,
  };
}

/** Strict v2 sidecar validation. Legacy adoption is deliberately separate. */
export function validatePhysicalCargoState(
  value: unknown,
  player: PlayerState,
  width: number,
  height: number,
): PhysicalCargoValidation {
  const internal = validatePhysicalCargoInternals(value);
  if (!internal) return invalid(diagnosePhysicalCargoState(value));
  return validatePhysicalCargoPlayerMirror(internal, player, width, height);
}

/**
 * Explicit game-save v3 -> v4 adoption. Strict validation never silently
 * treats malformed v1 data as a fresh state or repairs its substance ledger.
 */
export function adoptPhysicalCargoStateV1(
  value: unknown,
  player: PlayerState,
  width: number,
  height: number,
): PhysicalCargoValidation {
  const legacy = validateLegacyPhysicalCargoInternals(value);
  if (!legacy) return invalid(diagnoseLegacyPhysicalCargoState(value));
  const migrated = sealPhysicalCargoState({
    version: PHYSICAL_CARGO_STATE_VERSION,
    lastSourceOrdinal: legacy.lastSourceOrdinal,
    activeRegion: legacy.looseWorld.region,
    activeRegionKey: looseCargoRegionKey(legacy.looseWorld.region),
    looseWorld: legacy.looseWorld,
    inactiveWorldIndex: createInactiveWorldIndex([]),
    carrier: legacy.carrier,
    expectedManifest: createLooseCargoMultiWorldExpectedManifest(
      [legacy.looseWorld],
      legacy.carrier,
    ),
  });
  return validatePhysicalCargoPlayerMirror(migrated, player, width, height);
}

function validatePhysicalCargoPlayerMirror(
  internal: PhysicalCargoState,
  player: PlayerState,
  width: number,
  height: number,
): PhysicalCargoValidation {
  const { looseWorld, carrier } = internal;
  if (carrier.owner.kind !== "player" || carrier.owner.id !== LOCAL_PORTER_ID) {
    return invalid("invalid-owner");
  }
  if (
    looseWorld.width !== width
    || looseWorld.height !== height
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
    state: internal,
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
  const state: PhysicalCargoState = {
    ...value,
    integrity: physicalCargoIntegrity(value),
  };
  if (physicalCargoSerializedBytes(state) > PHYSICAL_CARGO_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Physical cargo sidecar exceeds its serialized save budget");
  }
  return trustPhysicalCargoState(state);
}

/**
 * The bounded active world is covered directly. The immutable carrier,
 * manifest, and inactive AVL are covered through cached seals so a live
 * environment step never re-hashes lifetime custody history.
 */
function physicalCargoIntegrity(value: Omit<PhysicalCargoState, "integrity">): string {
  const expectedManifest = {
    integrity: expectedManifestMetadata(value.expectedManifest).integrity,
  };
  return hashCanonical({
    version: value.version,
    lastSourceOrdinal: value.lastSourceOrdinal,
    activeRegion: value.activeRegion,
    activeRegionKey: value.activeRegionKey,
    looseWorld: value.looseWorld,
    inactiveWorldIndex: {
      size: value.inactiveWorldIndex.size,
      integrity: value.inactiveWorldIndex.integrity,
      serializedBytes: value.inactiveWorldIndex.serializedBytes,
    },
    carrier: { integrity: carrierMetadata(value.carrier).integrity },
    expectedManifest,
  });
}

function serializedPhysicalCargoIntegrity(
  value: Omit<SerializedPhysicalCargoState, "integrity">,
): string {
  const inactive = {
    count: value.inactiveWorlds.length,
    integrity: hashCanonical(value.inactiveWorlds.map(({ regionKey, integrity }) => ({
      regionKey,
      integrity,
    }))),
  };
  return hashCanonical({
    version: value.version,
    lastSourceOrdinal: value.lastSourceOrdinal,
    activeRegion: value.activeRegion,
    activeRegionKey: value.activeRegionKey,
    looseWorld: value.looseWorld,
    inactiveWorlds: inactive,
    carrier: value.carrier,
    expectedManifest: { integrity: hashCanonical(value.expectedManifest) },
  });
}

/** Accept v2 saves written before cached collection seals were introduced. */
function legacySerializedPhysicalCargoIntegrity(
  value: Omit<SerializedPhysicalCargoState, "integrity">,
): string {
  return hashCanonical({
    ...value,
    inactiveWorlds: value.inactiveWorlds.map(({ regionKey, integrity }) => ({
      regionKey,
      integrity,
    })),
  });
}

function matchesSerializedPhysicalCargoIntegrity(
  integrity: string,
  value: Omit<SerializedPhysicalCargoState, "integrity">,
): boolean {
  return integrity === serializedPhysicalCargoIntegrity(value)
    || integrity === legacySerializedPhysicalCargoIntegrity(value);
}

function validatePhysicalCargoInternals(value: unknown): PhysicalCargoState | null {
  if (typeof value === "object" && value !== null && TRUSTED_PHYSICAL_CARGO_STATES.has(value)) {
    return value as PhysicalCargoState;
  }
  if (!isRecord(value)
    || !hasExactKeys(value, [
      "version",
      "lastSourceOrdinal",
      "activeRegion",
      "activeRegionKey",
      "looseWorld",
      "inactiveWorlds",
      "carrier",
      "expectedManifest",
      "integrity",
    ])
    || value.version !== PHYSICAL_CARGO_STATE_VERSION
    || !Number.isSafeInteger(value.lastSourceOrdinal)
    || (value.lastSourceOrdinal as number) < 0
    || typeof value.activeRegionKey !== "string"
    || !Array.isArray(value.inactiveWorlds)
    || value.inactiveWorlds.length > PHYSICAL_CARGO_MAX_INACTIVE_WORLDS
    || typeof value.integrity !== "string"
    || !/^[0-9a-f]{16}$/u.test(value.integrity)) return null;
  const unsealed = unsealPhysicalCargo(value);
  if (!matchesSerializedPhysicalCargoIntegrity(
    value.integrity,
    unsealed as unknown as Omit<SerializedPhysicalCargoState, "integrity">,
  )) return null;
  const worldValidation = validateLooseCargoWorld(value.looseWorld);
  const carrierValidation = validateLooseCargoCarrier(value.carrier);
  if (!worldValidation.valid || !worldValidation.state
    || !carrierValidation.valid || !carrierValidation.carrier) return null;
  if (
    stableStringify(worldValidation.state) !== stableStringify(value.looseWorld)
    || stableStringify(carrierValidation.carrier) !== stableStringify(value.carrier)
    || !isExactRegionAddress(value.activeRegion)
  ) return null;
  const activeRegionKey = canonicalRegionKey(value.activeRegion);
  const worldRegionKey = looseCargoRegionKey(worldValidation.state.region);
  if (
    activeRegionKey === null
    || activeRegionKey !== value.activeRegionKey
    || activeRegionKey !== worldRegionKey
    || stableStringify(value.activeRegion) !== stableStringify(worldValidation.state.region)
  ) return null;

  const inactiveWorlds: PhysicalCargoInactiveWorld[] = [];
  let previousKey = "";
  for (const rawInactive of value.inactiveWorlds) {
    const inactive = validateInactiveWorld(rawInactive);
    if (
      inactive === null
      || inactive.regionKey === activeRegionKey
      || inactive.world.width !== worldValidation.state.width
      || inactive.world.height !== worldValidation.state.height
      || inactive.regionKey <= previousKey
    ) return null;
    previousKey = inactive.regionKey;
    inactiveWorlds.push(inactive);
  }
  const inactiveWorldIndex = createInactiveWorldIndex(inactiveWorlds);
  const regionalWorlds = [
    worldValidation.state,
    ...inactiveWorlds.map(({ world }) => world),
  ];
  const manifest = validateLooseCargoMultiWorldExpectedManifest(
    value.expectedManifest,
    regionalWorlds,
    carrierValidation.carrier,
  );
  if (!manifest.valid || !manifest.actual) return null;
  if (stableStringify(manifest.actual) !== stableStringify(value.expectedManifest)) return null;
  try {
    return sealPhysicalCargoState({
      version: PHYSICAL_CARGO_STATE_VERSION,
      lastSourceOrdinal: value.lastSourceOrdinal as number,
      activeRegion: worldValidation.state.region,
      activeRegionKey,
      looseWorld: worldValidation.state,
      inactiveWorldIndex,
      carrier: carrierValidation.carrier,
      expectedManifest: manifest.actual,
    });
  } catch {
    return null;
  }
}

function trustPhysicalCargoState(state: PhysicalCargoState): PhysicalCargoState {
  deepFreezePhysicalCargo(state);
  TRUSTED_PHYSICAL_CARGO_STATES.add(state as object);
  return state;
}

function deepFreezePhysicalCargo(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) deepFreezePhysicalCargo(child);
  Object.freeze(value);
}

function unsealPhysicalCargo(value: Record<string, unknown>): Record<string, unknown> {
  return {
    version: value.version,
    lastSourceOrdinal: value.lastSourceOrdinal,
    activeRegion: value.activeRegion,
    activeRegionKey: value.activeRegionKey,
    looseWorld: value.looseWorld,
    inactiveWorlds: value.inactiveWorlds,
    carrier: value.carrier,
    expectedManifest: value.expectedManifest,
  };
}

interface LegacyPhysicalCargoStateV1 {
  readonly version: typeof PHYSICAL_CARGO_LEGACY_STATE_VERSION;
  readonly lastSourceOrdinal: number;
  readonly looseWorld: LooseCargoWorldState;
  readonly carrier: LooseCargoCarrierState;
  readonly expectedManifest: LooseCargoExpectedManifest;
  readonly integrity: string;
}

function validateLegacyPhysicalCargoInternals(value: unknown): LegacyPhysicalCargoStateV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "version",
      "lastSourceOrdinal",
      "looseWorld",
      "carrier",
      "expectedManifest",
      "integrity",
    ])
    || value.version !== PHYSICAL_CARGO_LEGACY_STATE_VERSION
    || !Number.isSafeInteger(value.lastSourceOrdinal)
    || (value.lastSourceOrdinal as number) < 0
    || typeof value.integrity !== "string"
    || !/^[0-9a-f]{16}$/u.test(value.integrity)
  ) return null;
  const unsealed = unsealLegacyPhysicalCargo(value);
  if (value.integrity !== hashCanonical(unsealed)) return null;
  const worldValidation = validateLooseCargoWorld(value.looseWorld);
  const carrierValidation = validateLooseCargoCarrier(value.carrier);
  if (
    !worldValidation.valid
    || !worldValidation.state
    || !carrierValidation.valid
    || !carrierValidation.carrier
    || stableStringify(worldValidation.state) !== stableStringify(value.looseWorld)
    || stableStringify(carrierValidation.carrier) !== stableStringify(value.carrier)
    || worldValidation.state.region.x !== 0
    || worldValidation.state.region.y !== 0
  ) return null;
  const manifest = validateLooseCargoExpectedManifest(
    value.expectedManifest,
    worldValidation.state,
    carrierValidation.carrier,
  );
  if (
    !manifest.valid
    || !manifest.actual
    || stableStringify(manifest.actual) !== stableStringify(value.expectedManifest)
  ) return null;
  if (serializedBytes(value) > PHYSICAL_CARGO_MAX_SERIALIZED_BYTES) return null;
  const legacy: LegacyPhysicalCargoStateV1 = {
    version: PHYSICAL_CARGO_LEGACY_STATE_VERSION,
    lastSourceOrdinal: value.lastSourceOrdinal as number,
    looseWorld: worldValidation.state,
    carrier: carrierValidation.carrier,
    expectedManifest: manifest.actual,
    integrity: value.integrity,
  };
  deepFreezePhysicalCargo(legacy);
  return legacy;
}

function unsealLegacyPhysicalCargo(value: Record<string, unknown>): Record<string, unknown> {
  return {
    version: value.version,
    lastSourceOrdinal: value.lastSourceOrdinal,
    looseWorld: value.looseWorld,
    carrier: value.carrier,
    expectedManifest: value.expectedManifest,
  };
}

function sealInactiveWorld(world: LooseCargoWorldState): PhysicalCargoInactiveWorld {
  const validation = validateLooseCargoWorld(world);
  if (!validation.valid || !validation.state || !isTouchedLooseCargoWorld(validation.state)) {
    throw new RangeError("Only valid touched loose-cargo worlds may be retained inactive");
  }
  const regionKey = looseCargoRegionKey(validation.state.region);
  return trustInactiveWorld({
    regionKey,
    world: validation.state,
    integrity: hashCanonical({ regionKey, world: validation.state }),
  });
}

function validateInactiveWorld(value: unknown): PhysicalCargoInactiveWorld | null {
  if (typeof value === "object" && value !== null && TRUSTED_INACTIVE_WORLDS.has(value)) {
    return value as PhysicalCargoInactiveWorld;
  }
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["regionKey", "world", "integrity"])
    || typeof value.regionKey !== "string"
    || typeof value.integrity !== "string"
    || !/^[0-9a-f]{16}$/u.test(value.integrity)
    || value.integrity !== hashCanonical({ regionKey: value.regionKey, world: value.world })
  ) return null;
  const validation = validateLooseCargoWorld(value.world);
  if (
    !validation.valid
    || !validation.state
    || stableStringify(validation.state) !== stableStringify(value.world)
    || looseCargoRegionKey(validation.state.region) !== value.regionKey
    || !isTouchedLooseCargoWorld(validation.state)
  ) return null;
  return trustInactiveWorld({
    regionKey: value.regionKey,
    world: validation.state,
    integrity: value.integrity,
  });
}

function trustInactiveWorld(value: PhysicalCargoInactiveWorld): PhysicalCargoInactiveWorld {
  deepFreezePhysicalCargo(value);
  TRUSTED_INACTIVE_WORLDS.add(value as object);
  return value;
}

const INACTIVE_ENTRY_BYTES = new WeakMap<object, number>();

function inactiveEntrySerializedBytes(entry: PhysicalCargoInactiveWorld): number {
  const cached = INACTIVE_ENTRY_BYTES.get(entry as object);
  if (cached !== undefined) return cached;
  const bytes = serializedBytes(entry);
  INACTIVE_ENTRY_BYTES.set(entry as object, bytes);
  return bytes;
}

function createInactiveNode(
  entry: PhysicalCargoInactiveWorld,
  left: PhysicalCargoInactiveNode | null,
  right: PhysicalCargoInactiveNode | null,
): PhysicalCargoInactiveNode {
  const height = 1 + Math.max(left?.height ?? 0, right?.height ?? 0);
  const size = 1 + (left?.size ?? 0) + (right?.size ?? 0);
  const entriesSerializedBytes = inactiveEntrySerializedBytes(entry)
    + (left?.entriesSerializedBytes ?? 0)
    + (right?.entriesSerializedBytes ?? 0);
  return Object.freeze({
    entry,
    left,
    right,
    height,
    size,
    entriesSerializedBytes,
    integrity: hashCanonical({
      key: entry.regionKey,
      entryIntegrity: entry.integrity,
      left: left?.integrity ?? null,
      right: right?.integrity ?? null,
      height,
      size,
    }),
  });
}

function inactiveIndexFromRoot(root: PhysicalCargoInactiveNode | null): PhysicalCargoInactiveIndex {
  const size = root?.size ?? 0;
  return Object.freeze({
    kind: "physical-cargo-inactive-avl-v1" as const,
    root,
    size,
    integrity: root?.integrity ?? hashCanonical([]),
    serializedBytes: size === 0
      ? 2
      : 2 + root!.entriesSerializedBytes + size - 1,
  });
}

function createInactiveWorldIndex(
  values: readonly PhysicalCargoInactiveWorld[],
): PhysicalCargoInactiveIndex {
  const build = (start: number, end: number): PhysicalCargoInactiveNode | null => {
    if (start >= end) return null;
    const middle = start + Math.floor((end - start) / 2);
    return createInactiveNode(values[middle]!, build(start, middle), build(middle + 1, end));
  };
  return inactiveIndexFromRoot(build(0, values.length));
}

function inactiveIndexEntries(
  index: PhysicalCargoInactiveIndex,
): readonly PhysicalCargoInactiveWorld[] {
  const result: PhysicalCargoInactiveWorld[] = [];
  const visit = (node: PhysicalCargoInactiveNode | null): void => {
    if (!node) return;
    visit(node.left);
    result.push(node.entry);
    visit(node.right);
  };
  visit(index.root);
  return Object.freeze(result);
}

function inactiveIndexGet(
  index: PhysicalCargoInactiveIndex,
  targetKey: string,
  audit?: { probes: number },
): PhysicalCargoInactiveWorld | null {
  let node = index.root;
  while (node) {
    if (audit) audit.probes += 1;
    if (targetKey === node.entry.regionKey) return node.entry;
    node = targetKey < node.entry.regionKey ? node.left : node.right;
  }
  return null;
}

function inactiveNodeBalance(node: PhysicalCargoInactiveNode): number {
  return (node.left?.height ?? 0) - (node.right?.height ?? 0);
}

function rotateInactiveRight(node: PhysicalCargoInactiveNode): PhysicalCargoInactiveNode {
  const pivot = node.left;
  if (!pivot) return node;
  const right = createInactiveNode(node.entry, pivot.right, node.right);
  return createInactiveNode(pivot.entry, pivot.left, right);
}

function rotateInactiveLeft(node: PhysicalCargoInactiveNode): PhysicalCargoInactiveNode {
  const pivot = node.right;
  if (!pivot) return node;
  const left = createInactiveNode(node.entry, node.left, pivot.left);
  return createInactiveNode(pivot.entry, left, pivot.right);
}

function balanceInactiveNode(node: PhysicalCargoInactiveNode): PhysicalCargoInactiveNode {
  const balance = inactiveNodeBalance(node);
  if (balance > 1) {
    const left = node.left!;
    const adjusted = inactiveNodeBalance(left) < 0
      ? createInactiveNode(node.entry, rotateInactiveLeft(left), node.right)
      : node;
    return rotateInactiveRight(adjusted);
  }
  if (balance < -1) {
    const right = node.right!;
    const adjusted = inactiveNodeBalance(right) > 0
      ? createInactiveNode(node.entry, node.left, rotateInactiveRight(right))
      : node;
    return rotateInactiveLeft(adjusted);
  }
  return node;
}

function setInactiveNode(
  node: PhysicalCargoInactiveNode | null,
  entry: PhysicalCargoInactiveWorld,
): PhysicalCargoInactiveNode {
  if (!node) return createInactiveNode(entry, null, null);
  if (entry.regionKey === node.entry.regionKey) {
    return entry === node.entry ? node : createInactiveNode(entry, node.left, node.right);
  }
  if (entry.regionKey < node.entry.regionKey) {
    const left = setInactiveNode(node.left, entry);
    return left === node.left ? node : balanceInactiveNode(createInactiveNode(node.entry, left, node.right));
  }
  const right = setInactiveNode(node.right, entry);
  return right === node.right ? node : balanceInactiveNode(createInactiveNode(node.entry, node.left, right));
}

function removeMinimumInactiveNode(
  node: PhysicalCargoInactiveNode,
): { readonly minimum: PhysicalCargoInactiveWorld; readonly root: PhysicalCargoInactiveNode | null } {
  if (!node.left) return { minimum: node.entry, root: node.right };
  const removed = removeMinimumInactiveNode(node.left);
  return {
    minimum: removed.minimum,
    root: balanceInactiveNode(createInactiveNode(node.entry, removed.root, node.right)),
  };
}

function deleteInactiveNode(
  node: PhysicalCargoInactiveNode | null,
  targetKey: string,
): PhysicalCargoInactiveNode | null {
  if (!node) return null;
  if (targetKey < node.entry.regionKey) {
    const left = deleteInactiveNode(node.left, targetKey);
    return left === node.left ? node : balanceInactiveNode(createInactiveNode(node.entry, left, node.right));
  }
  if (node.entry.regionKey < targetKey) {
    const right = deleteInactiveNode(node.right, targetKey);
    return right === node.right ? node : balanceInactiveNode(createInactiveNode(node.entry, node.left, right));
  }
  if (!node.left) return node.right;
  if (!node.right) return node.left;
  const removed = removeMinimumInactiveNode(node.right);
  return balanceInactiveNode(createInactiveNode(removed.minimum, node.left, removed.root));
}

function inactiveIndexSet(
  prior: PhysicalCargoInactiveIndex,
  entry: PhysicalCargoInactiveWorld,
): PhysicalCargoInactiveIndex {
  const existing = inactiveIndexGet(prior, entry.regionKey);
  if (!existing && prior.size >= PHYSICAL_CARGO_MAX_INACTIVE_WORLDS) {
    throw new RangeError("Physical cargo inactive-region capacity exhausted");
  }
  const root = setInactiveNode(prior.root, entry);
  return root === prior.root ? prior : inactiveIndexFromRoot(root);
}

function inactiveIndexDelete(
  prior: PhysicalCargoInactiveIndex,
  targetKey: string,
): PhysicalCargoInactiveIndex {
  const root = deleteInactiveNode(prior.root, targetKey);
  return root === prior.root ? prior : inactiveIndexFromRoot(root);
}

function expectedManifestMetadata(value: object): CachedCargoCollectionMetadata {
  const cached = EXPECTED_MANIFEST_METADATA.get(value);
  if (cached) return cached;
  const metadata = Object.freeze({
    serializedBytes: serializedBytes(value),
    integrity: hashCanonical(value),
  });
  EXPECTED_MANIFEST_METADATA.set(value, metadata);
  return metadata;
}

function carrierMetadata(value: LooseCargoCarrierState): CachedCargoCollectionMetadata {
  const cached = CARRIER_METADATA.get(value as object);
  if (cached) return cached;
  const metadata = Object.freeze({
    serializedBytes: serializedBytes(value),
    integrity: hashCanonical(value),
  });
  CARRIER_METADATA.set(value as object, metadata);
  return metadata;
}

function isTouchedLooseCargoWorld(world: LooseCargoWorldState): boolean {
  return world.revision !== 0
    || world.completedSteps !== 0
    || world.lastEntityOrdinal !== 0
    || world.lastEventOrdinal !== 0
    || world.historyBaseOrdinal !== 0
    || world.historyArchiveHash !== "0000000000000000"
    || world.entities.length !== 0
    || world.history.length !== 0;
}

function compareLooseCargoWorlds(
  left: LooseCargoWorldState,
  right: LooseCargoWorldState,
): number {
  const leftKey = looseCargoRegionKey(left.region);
  const rightKey = looseCargoRegionKey(right.region);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function physicalCargoWorldAtCanonicalState(
  state: PhysicalCargoState,
  regionKey: string,
): LooseCargoWorldState | null {
  if (regionKey === state.activeRegionKey) return state.looseWorld;
  return inactiveIndexGet(state.inactiveWorldIndex, regionKey)?.world ?? null;
}

/** Apply only the bounded regional step's changed owners; unchanged entries
 * retain their trusted seals instead of being validated and re-sealed. */
function applyInactiveWorldUpdates(
  prior: PhysicalCargoInactiveIndex,
  updates: ReadonlyMap<string, PhysicalCargoInactiveWorld | null>,
): PhysicalCargoInactiveIndex {
  if (updates.size === 0) return prior;
  const orderedUpdates = [...updates].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0);
  let next = prior;
  for (const [regionKey, entry] of orderedUpdates) {
    next = entry ? inactiveIndexSet(next, entry) : inactiveIndexDelete(next, regionKey);
  }
  return next;
}

function physicalCargoSerializedBytes(state: PhysicalCargoState): number {
  const inactiveBytes = state.inactiveWorldIndex.serializedBytes;
  const manifestBytes = expectedManifestMetadata(state.expectedManifest).serializedBytes;
  const carrierBytes = carrierMetadata(state.carrier).serializedBytes;
  const shellBytes = serializedBytes({
    version: state.version,
    lastSourceOrdinal: state.lastSourceOrdinal,
    activeRegion: state.activeRegion,
    activeRegionKey: state.activeRegionKey,
    looseWorld: state.looseWorld,
    inactiveWorlds: null,
    carrier: null,
    expectedManifest: null,
    integrity: "0000000000000000",
  });
  // Replacing the three canonical `null` values preserves property
  // punctuation, so subtracting their four bytes yields the exact wire size.
  return shellBytes - 12 + inactiveBytes + manifestBytes + carrierBytes;
}

function serializedBytes(value: unknown): number {
  return UTF8_ENCODER.encode(stableStringify(value)).byteLength;
}

function canonicalRegionKey(value: unknown): string | null {
  if (!isExactRegionAddress(value)) return null;
  try {
    return looseCargoRegionKey(value);
  } catch {
    return null;
  }
}

function isExactRegionAddress(value: unknown): value is LooseCargoRegionAddress {
  return isRecord(value) && hasExactKeys(value, ["x", "y"]);
}

function diagnosePhysicalCargoState(
  value: unknown,
): Exclude<PhysicalCargoValidation["reason"], "valid"> {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "version",
      "lastSourceOrdinal",
      "activeRegion",
      "activeRegionKey",
      "looseWorld",
      "inactiveWorlds",
      "carrier",
      "expectedManifest",
      "integrity",
    ])
    || value.version !== PHYSICAL_CARGO_STATE_VERSION
    || !Number.isSafeInteger(value.lastSourceOrdinal)
    || (value.lastSourceOrdinal as number) < 0
    || typeof value.activeRegionKey !== "string"
    || !Array.isArray(value.inactiveWorlds)
    || typeof value.integrity !== "string"
  ) return "invalid-state";
  if (value.inactiveWorlds.length > PHYSICAL_CARGO_MAX_INACTIVE_WORLDS) {
    return "invalid-inactive-worlds";
  }
  if (!matchesSerializedPhysicalCargoIntegrity(
    value.integrity,
    unsealPhysicalCargo(value) as unknown as Omit<SerializedPhysicalCargoState, "integrity">,
  )) {
    return "invalid-integrity";
  }
  const worldValidation = validateLooseCargoWorld(value.looseWorld);
  if (
    !worldValidation.valid
    || !worldValidation.state
    || stableStringify(worldValidation.state) !== stableStringify(value.looseWorld)
  ) return "invalid-world";
  const carrierValidation = validateLooseCargoCarrier(value.carrier);
  if (
    !carrierValidation.valid
    || !carrierValidation.carrier
    || stableStringify(carrierValidation.carrier) !== stableStringify(value.carrier)
  ) return "invalid-carrier";
  const activeKey = canonicalRegionKey(value.activeRegion);
  if (
    activeKey === null
    || activeKey !== value.activeRegionKey
    || activeKey !== looseCargoRegionKey(worldValidation.state.region)
  ) return "invalid-region";
  const inactiveWorlds: PhysicalCargoInactiveWorld[] = [];
  let previousKey = "";
  for (const raw of value.inactiveWorlds) {
    const inactive = validateInactiveWorld(raw);
    if (!inactive) return "invalid-inactive-worlds";
    if (inactive.regionKey === activeKey) return "invalid-region";
    if (
      inactive.world.width !== worldValidation.state.width
      || inactive.world.height !== worldValidation.state.height
    ) return "invalid-dimensions";
    if (inactive.regionKey <= previousKey) return "noncanonical-order";
    previousKey = inactive.regionKey;
    inactiveWorlds.push(inactive);
  }
  const worlds = [worldValidation.state, ...inactiveWorlds.map(({ world }) => world)];
  const snapshot = inspectLooseCargoMultiWorldConservation(worlds, carrierValidation.carrier);
  if (!snapshot.valid) return snapshot.reason === "invalid-world"
    ? "invalid-world"
    : "duplicate-identity";
  const manifest = validateLooseCargoMultiWorldExpectedManifest(
    value.expectedManifest,
    worlds,
    carrierValidation.carrier,
  );
  if (!manifest.valid || !manifest.actual) return "manifest-mismatch";
  const candidate: PhysicalCargoState = {
    version: PHYSICAL_CARGO_STATE_VERSION,
    lastSourceOrdinal: value.lastSourceOrdinal as number,
    activeRegion: worldValidation.state.region,
    activeRegionKey: activeKey,
    looseWorld: worldValidation.state,
    inactiveWorldIndex: createInactiveWorldIndex(inactiveWorlds),
    carrier: carrierValidation.carrier,
    expectedManifest: manifest.actual,
    integrity: value.integrity,
  };
  if (physicalCargoSerializedBytes(candidate) > PHYSICAL_CARGO_MAX_SERIALIZED_BYTES) {
    return "oversized";
  }
  return "invalid-state";
}

function diagnoseLegacyPhysicalCargoState(
  value: unknown,
): Exclude<PhysicalCargoValidation["reason"], "valid"> {
  if (
    !isRecord(value)
    || value.version !== PHYSICAL_CARGO_LEGACY_STATE_VERSION
    || !Number.isSafeInteger(value.lastSourceOrdinal)
    || (value.lastSourceOrdinal as number) < 0
    || typeof value.integrity !== "string"
  ) return "invalid-state";
  if (value.integrity !== hashCanonical(unsealLegacyPhysicalCargo(value))) {
    return "invalid-integrity";
  }
  const world = validateLooseCargoWorld(value.looseWorld);
  if (!world.valid || !world.state) return "invalid-world";
  const carrier = validateLooseCargoCarrier(value.carrier);
  if (!carrier.valid || !carrier.carrier) return "invalid-carrier";
  const manifest = validateLooseCargoExpectedManifest(
    value.expectedManifest,
    world.state,
    carrier.carrier,
  );
  if (!manifest.valid) return "manifest-mismatch";
  return "invalid-state";
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  return stableStringify(actual) === stableStringify(canonicalExpected);
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
        : payload.kind === "provision"
          ? [stableStringify({
              kind: payload.kind,
              provision: payload.provision,
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

function structuralPayloadKey(payload: LooseCargoPayload): string {
  switch (payload.kind) {
    case "stack": return `stack:${payload.item}`;
    case "gear": return `gear:${payload.gearId}:${payload.gearKind}`;
    case "promise": return `promise:${payload.contractId}:${payload.resource}:${payload.property}`;
    case "provision": return `provision:${payload.provision}`;
  }
}

function applyExpectedManifestAuthorization(
  prior: LooseCargoExpectedManifest,
  authorization: Extract<PhysicalCargoCommitAuthorization, { readonly kind: "delta" }>,
): LooseCargoExpectedManifest {
  const changes = new Map<string, { quantity: number; loadMilli: number }>();
  const addChange = (payload: LooseCargoPayload, direction: -1 | 1): void => {
    const key = structuralPayloadKey(payload);
    const quantity = payload.kind === "gear" ? 1 : payload.quantity;
    const loadMilli = looseCargoPayloadLoadMilli(payload);
    const current = changes.get(key) ?? { quantity: 0, loadMilli: 0 };
    const nextQuantity = current.quantity + direction * quantity;
    const nextLoadMilli = current.loadMilli + direction * loadMilli;
    if (!Number.isSafeInteger(nextQuantity) || !Number.isSafeInteger(nextLoadMilli)) {
      throw new RangeError("Physical cargo expected-manifest delta overflowed");
    }
    changes.set(key, { quantity: nextQuantity, loadMilli: nextLoadMilli });
  };
  for (const payload of authorization.removed) addChange(payload, -1);
  for (const payload of authorization.added) addChange(payload, 1);

  const priorEntries = new Map(prior.entries.map((entry) => [entry.payloadKey, entry]));
  for (const [payloadKey, delta] of changes) {
    const entry = priorEntries.get(payloadKey);
    const quantity = (entry?.quantity ?? 0) + delta.quantity;
    const loadMilli = (entry?.loadMilli ?? 0) + delta.loadMilli;
    if (
      !Number.isSafeInteger(quantity)
      || !Number.isSafeInteger(loadMilli)
      || quantity < 0
      || loadMilli < 0
      || (quantity === 0) !== (loadMilli === 0)
    ) throw new RangeError("Physical cargo authorization contradicts its expected manifest");
    if (quantity === 0) priorEntries.delete(payloadKey);
    else priorEntries.set(payloadKey, { payloadKey, quantity, loadMilli });
  }
  if (priorEntries.size > LOOSE_CARGO_MAX_MULTI_WORLD_MANIFEST_ENTRIES) {
    throw new RangeError("Physical cargo expected manifest exceeds its entry budget");
  }
  const entries = [...priorEntries.values()].sort((left, right) =>
    left.payloadKey < right.payloadKey ? -1 : left.payloadKey > right.payloadKey ? 1 : 0);
  let totalQuantity = 0;
  let totalLoadMilli = 0;
  for (const entry of entries) {
    totalQuantity += entry.quantity;
    totalLoadMilli += entry.loadMilli;
    if (!Number.isSafeInteger(totalQuantity) || !Number.isSafeInteger(totalLoadMilli)) {
      throw new RangeError("Physical cargo expected manifest totals overflowed");
    }
  }
  return {
    version: prior.version,
    entries,
    totalQuantity,
    totalLoadMilli,
    fingerprint: stableStringify(entries),
  };
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
