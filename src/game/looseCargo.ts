import {
  evaluateCargoEnvironment,
  type CargoEnvironmentCauseCode,
  type CargoEnvironmentProperty,
  type CargoEnvironmentSample,
  type CargoEnvironmentState,
} from "../sim/cargoEnvironment";
import { ACTOR_ID_MAX_LENGTH } from "../sim/actorPerception";
import { FIXED_POINT, RESOURCE_KINDS, type ResourceKind } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CRAFTED_GEAR_DEFINITIONS,
  CRAFTED_GEAR_KINDS,
  CRAFTING_COMPONENT_IDS,
  CRAFTING_STACK_DEFINITIONS,
  CRAFTING_STACK_IDS,
  RAW_MATERIAL_IDS,
  createCraftingInventory,
  inspectCraftingInventory,
  type CraftedGearItem,
  type CraftedGearKind,
  type CraftingInventory,
  type CraftingStackId,
} from "./crafting";
import {
  PROVISION_DEFINITIONS,
  PROVISION_KINDS,
  type ProvisionKind,
} from "./provisions";

/**
 * Pure loose-cargo transaction and movement foundation.
 *
 * One fixed-point position unit is one terrain tile. The runtime can adapt its
 * smaller player-coordinate scale at the boundary, while this module retains
 * sub-tile current and tumble motion without floating-point state.
 */
export const LOOSE_CARGO_VERSION = 1 as const;
export const LOOSE_CARGO_TILE_UNITS = FIXED_POINT;
/** Shared close-recovery radius; two tiles keeps touch pickup forgiving without remote vacuuming. */
export const LOOSE_CARGO_MAX_PICKUP_REACH = LOOSE_CARGO_TILE_UNITS * 2;
export const LOOSE_CARGO_MAX_VELOCITY = 250_000;
/** Loaded-region mobile budget; distant parcels belong in region summaries. */
export const LOOSE_CARGO_MAX_ENTITIES = 64;
export const LOOSE_CARGO_MAX_HISTORY = 4_096;
/**
 * Runtime states retain a compact recent evidence window. Older records are
 * folded into the chained archive hash, so identity/conservation evidence is
 * preserved without re-hashing thousands of JSON records every 100 ms.
 * Deserialization still accepts the larger legacy maximum above and compacts
 * it on the next authoritative step.
 */
export const LOOSE_CARGO_RETAINED_HISTORY = 256;
export const LOOSE_CARGO_MAX_ORDINAL = Number.MAX_SAFE_INTEGER;
export const LOOSE_CARGO_MAX_RETIRED_LOTS = 32_768;
/** Matches the durable region-manifest ceiling without retaining generated empty regions. */
export const LOOSE_CARGO_MAX_REGIONAL_WORLDS = 131_072;
/** A 32 MiB physical-custody envelope reaches this guard before pathological allocation. */
export const LOOSE_CARGO_MAX_MULTI_WORLD_MANIFEST_ENTRIES = 262_144;
/** Bounded active/persisted actor-carrier set for one custody inspection. */
export const LOOSE_CARGO_MAX_CARRIERS = 4_096;
/**
 * One seamless fixed step can touch only the small storage neighborhood around
 * the simulated parcels. Keeping the transaction bounded prevents a malformed
 * adapter from turning one tick into an unbounded whole-save scan.
 */
export const LOOSE_CARGO_MAX_ATOMIC_REGIONS = 81;
export const LOOSE_CARGO_MAX_ATOMIC_ENTITIES =
  LOOSE_CARGO_MAX_ATOMIC_REGIONS * LOOSE_CARGO_MAX_ENTITIES;

const MAX_WORLD_DIMENSION = 4_096;
const MAX_CARRIER_LOTS = 4_096;
const MAX_QUANTITY = 1_000_000;
const MAX_CAPACITY_MILLI = 9_000_000_000_000;
const MAX_DURABLE_ID = 9_000_000_000_000;
const MAX_LOT_ID_LENGTH = 160;
const MAX_CAUSES_PER_EVENT = 16;
const MAX_PAYLOAD_KEY_LENGTH = 256;
const VELOCITY_RETENTION = 860_000;
const CURRENT_ACCELERATION = 92_000;
const SLOPE_ACCELERATION = 68_000;
const REST_VELOCITY = 250;
const TRUSTED_WORLD_STATES = new WeakSet<object>();

const STACK_ID_SET: ReadonlySet<string> = new Set<string>(CRAFTING_STACK_IDS);
const RAW_MATERIAL_ID_SET: ReadonlySet<string> = new Set<string>(RAW_MATERIAL_IDS);
const COMPONENT_ID_SET: ReadonlySet<string> = new Set<string>(CRAFTING_COMPONENT_IDS);
const GEAR_KIND_SET: ReadonlySet<string> = new Set<string>(CRAFTED_GEAR_KINDS);
const RESOURCE_KIND_SET: ReadonlySet<string> = new Set<string>(RESOURCE_KINDS);
const PROVISION_KIND_SET: ReadonlySet<string> = new Set<string>(PROVISION_KINDS);
const MOTION_SET: ReadonlySet<string> = new Set<LooseCargoMotion>([
  "resting",
  "drifting",
  "tumbling",
  "snagged",
  "boundary-rest",
]);
const HISTORY_KIND_SET: ReadonlySet<string> = new Set<LooseCargoHistoryKind>([
  "drop",
  "scatter",
  "pickup",
  "merge",
  "environment",
  "handoff",
]);
const CAUSE_CODE_SET: ReadonlySet<string> = new Set<LooseCargoCauseCode>([
  "rain-soak",
  "heat-stress",
  "cold-stress",
  "impact-shock",
  "water-immersion",
  "magic-water",
  "current-drift",
  "manual-release",
  "fall-separation",
  "forced-release",
  "recovery",
  "matching-stack-merge",
  "grade-tumble",
  "rock-impact",
  "mangrove-snag",
  "bramble-snag",
  "parcel-momentum",
  "parcel-settled",
  "region-boundary-rest",
  "storage-handoff",
]);

export type LooseCargoOwner =
  | { readonly kind: "unclaimed" }
  | { readonly kind: "player"; readonly id: string }
  /** Species-neutral physical custody keyed by a persistent actor identity. */
  | { readonly kind: "actor"; readonly id: string }
  | { readonly kind: "settlement"; readonly id: number };

/**
 * Global region coordinates are deliberately independent from local parcel
 * coordinates. Compatibility map saves use 0,0; streamed worlds can move the
 * same stable parcel identity between any safely representable region.
 */
export interface LooseCargoRegionAddress {
  readonly x: number;
  readonly y: number;
}

export interface LooseCargoOrigin {
  readonly region: LooseCargoRegionAddress;
  readonly ordinal: number;
}

export type LooseCargoEntityId = string;
export type LooseCargoMotion = "resting" | "drifting" | "tumbling" | "snagged" | "boundary-rest";
export type LooseCargoSnag = "mangrove" | "bramble";

export type LooseCargoCauseCode =
  | CargoEnvironmentCauseCode
  | "manual-release"
  | "fall-separation"
  | "forced-release"
  | "recovery"
  | "matching-stack-merge"
  | "grade-tumble"
  | "rock-impact"
  | "mangrove-snag"
  | "bramble-snag"
  | "parcel-momentum"
  | "parcel-settled"
  | "region-boundary-rest"
  /** Invisible persistence ownership change; never a physical impact. */
  | "storage-handoff";

export type LooseCargoHistoryKind =
  | "drop"
  | "scatter"
  | "pickup"
  | "merge"
  | "environment"
  | "handoff";

export interface LooseCargoPosition {
  readonly region: LooseCargoRegionAddress;
  readonly x: number;
  readonly y: number;
}

/**
 * Immutable causal evidence. Transactions only append; when the fixed history
 * budget is exhausted they fail atomically instead of deleting old evidence.
 */
export interface LooseCargoHistoryRecord {
  readonly id: string;
  readonly ordinal: number;
  readonly step: number;
  readonly kind: LooseCargoHistoryKind;
  readonly entityIds: readonly LooseCargoEntityId[];
  readonly payloadKey: string;
  readonly quantity: number;
  readonly from: LooseCargoPosition | null;
  readonly to: LooseCargoPosition | null;
  readonly causes: readonly LooseCargoCauseCode[];
  readonly conditionLoss: number;
  readonly contaminationGain: number;
  readonly decayGain: number;
}

export interface LooseCargoStackPayload {
  readonly kind: "stack";
  readonly item: CraftingStackId;
  readonly quantity: number;
}

export interface LooseCargoGearPayload {
  readonly kind: "gear";
  /** The durable item's identity survives every drop and recovery. */
  readonly gearId: number;
  readonly gearKind: CraftedGearKind;
}

export interface LooseCargoPromisePayload {
  readonly kind: "promise";
  /** Contract identity is never replaced by a generic cargo-stack ID. */
  readonly contractId: number;
  readonly resource: ResourceKind;
  readonly quantity: number;
  readonly property: CargoEnvironmentProperty;
}

export interface LooseCargoProvisionPayload {
  readonly kind: "provision";
  /**
   * Exact physical-lot identity. A whole lot keeps this identity across
   * carrier/world transitions; deterministic partial splits receive child
   * identities and never masquerade as the source remainder.
   */
  readonly lotId: string;
  readonly provision: ProvisionKind;
  readonly quantity: number;
}

export type LooseCargoPayload =
  | LooseCargoStackPayload
  | LooseCargoGearPayload
  | LooseCargoPromisePayload
  | LooseCargoProvisionPayload;

export interface CarriedCargoLot {
  /** Stable while carried. Partial quantity drops keep this ID on the remainder. */
  readonly id: string;
  readonly payload: LooseCargoPayload;
  readonly materialState: CargoEnvironmentState;
}

export interface LooseCargoCarrierState {
  readonly version: typeof LOOSE_CARGO_VERSION;
  readonly revision: number;
  readonly owner: LooseCargoOwner;
  /** Total shared pack capacity, supplied by the integrating player model. */
  readonly capacityMilliLoad: number;
  /** Reports or future undroppable equipment still consume exact pack space. */
  readonly reservedLoadMilli: number;
  readonly lots: readonly CarriedCargoLot[];
  /** Consumed/transferred source IDs remain tombstoned against event replay. */
  readonly retiredLotIds: readonly string[];
}

export interface LooseCargoEntity {
  /** Region-qualified identity; never reused after pickup or destruction. */
  readonly id: LooseCargoEntityId;
  readonly origin: LooseCargoOrigin;
  readonly owner: LooseCargoOwner;
  readonly payload: LooseCargoPayload;
  readonly materialState: CargoEnvironmentState;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly motion: LooseCargoMotion;
  readonly snaggedBy: LooseCargoSnag | null;
  /** Canonical active-cause signature used to log transitions, not every tick. */
  readonly causalSignature: string;
  /** Last causal record that affected this live entity. */
  readonly lastEventOrdinal: number;
}

export interface LooseCargoWorldState {
  readonly version: typeof LOOSE_CARGO_VERSION;
  readonly revision: number;
  readonly completedSteps: number;
  readonly width: number;
  readonly height: number;
  readonly region: LooseCargoRegionAddress;
  /** Monotonic allocation cursors. Values saturate and never wrap. */
  readonly lastEntityOrdinal: number;
  readonly lastEventOrdinal: number;
  /** Canonical ascending entity-ID order. */
  readonly entities: readonly LooseCargoEntity[];
  /** Number of immutable records folded into historyArchiveHash. */
  readonly historyBaseOrdinal: number;
  /** Deterministic hash chain for compacted causal evidence. */
  readonly historyArchiveHash: string;
  /** Canonical recent append-only tail; legacy saves may contain up to the accepted maximum. */
  readonly history: readonly LooseCargoHistoryRecord[];
}

export interface PromiseCargoAdapterInput {
  readonly contractId: number;
  readonly resource: ResourceKind;
  readonly quantity: number;
  readonly property: CargoEnvironmentProperty;
  readonly condition: number;
  readonly contamination?: number;
  readonly decay?: number;
}

export interface LooseCargoCarrierAdapterResult {
  readonly craftingInventory: CraftingInventory;
  readonly promises: readonly PromiseCargoAdapterInput[];
  readonly provisions: readonly {
    readonly lotId: string;
    readonly provision: ProvisionKind;
    readonly quantity: number;
    readonly materialState: CargoEnvironmentState;
  }[];
  /** Quality remains authoritative even if an older inventory adapter ignores it. */
  readonly lots: readonly CarriedCargoLot[];
  readonly reservedLoadMilli: number;
  readonly retiredLotIds: readonly string[];
}

export type LooseCargoCarrierMutationReason =
  | "applied"
  | "unchanged"
  | "invalid-carrier"
  | "invalid-request"
  | "lot-not-found"
  | "quantity-unavailable"
  | "identity-conflict"
  | "capacity-exceeded"
  | "retirement-space-exhausted"
  | "revision-space-exhausted";

export interface LooseCargoCarrierMutationResult {
  readonly ok: boolean;
  readonly reason: LooseCargoCarrierMutationReason;
  readonly carrier: LooseCargoCarrierState;
  readonly affectedLotId: string | null;
  readonly removed: readonly CarriedCargoLot[];
  readonly loadBeforeMilli: number;
  readonly loadAfterMilli: number;
}

export interface LooseCargoAddStackRequest {
  /** Stable gather/craft event identity supplied by the authoritative caller. */
  readonly sourceLotId: string;
  readonly item: CraftingStackId;
  readonly quantity: number;
  readonly materialState?: CargoEnvironmentState;
}

export interface LooseCargoAddProvisionRequest {
  /** Stable generation, purchase, or preparation event identity. */
  readonly sourceLotId: string;
  readonly provision: ProvisionKind;
  readonly quantity: number;
  readonly materialState?: CargoEnvironmentState;
}

export interface LooseCargoConsumeProvisionRequest {
  readonly provision: ProvisionKind;
  readonly quantity: number;
}

export interface LooseCargoConsumeProvisionLotRequest {
  readonly lotId: string;
  readonly quantity: number;
}

export interface LooseCargoConsumeStackRequest {
  readonly item: CraftingStackId;
  readonly quantity: number;
}

export interface LooseCargoGearUpsertRequest {
  readonly sourceLotId: string;
  readonly gearId: number;
  readonly gearKind: CraftedGearKind;
  readonly materialState: CargoEnvironmentState;
}

export interface LooseCargoPromiseUpsertRequest {
  readonly sourceLotId: string;
  readonly contractId: number;
  readonly resource: ResourceKind;
  readonly quantity: number;
  readonly property: CargoEnvironmentProperty;
  readonly materialState: CargoEnvironmentState;
}

export type LooseCargoValidationReason =
  | "valid"
  | "not-an-object"
  | "invalid-version"
  | "invalid-revision"
  | "invalid-dimensions"
  | "invalid-region"
  | "invalid-ordinal"
  | "too-many-entities"
  | "too-much-history"
  | "invalid-history"
  | "invalid-entity"
  | "duplicate-entity-id"
  | "duplicate-durable-identity";

export type LooseCargoCarrierValidationReason =
  | "valid"
  | "not-an-object"
  | "invalid-version"
  | "invalid-revision"
  | "invalid-owner"
  | "invalid-capacity"
  | "too-many-lots"
  | "invalid-lot"
  | "duplicate-lot-id"
  | "duplicate-durable-identity"
  | "invalid-retired-lot"
  | "over-capacity";

export interface LooseCargoWorldValidation {
  readonly valid: boolean;
  readonly reason: LooseCargoValidationReason;
  readonly state: LooseCargoWorldState | null;
}

export interface LooseCargoCarrierValidation {
  readonly valid: boolean;
  readonly reason: LooseCargoCarrierValidationReason;
  readonly carrier: LooseCargoCarrierState | null;
  readonly loadMilli: number;
  readonly freeMilli: number;
}

export type LooseCargoTransferReason =
  | "ready"
  | "fallback-impact"
  | "invalid-world"
  | "invalid-carrier"
  | "invalid-request"
  | "lot-not-found"
  | "entity-not-found"
  | "quantity-unavailable"
  | "out-of-reach"
  | "not-owner"
  | "capacity-exceeded"
  | "identity-conflict"
  | "entity-capacity-exceeded"
  | "id-space-exhausted"
  | "history-capacity-exceeded";

export interface LooseCargoTransferQuote {
  readonly ok: boolean;
  readonly direction: "drop" | "pickup";
  readonly reason: LooseCargoTransferReason;
  readonly worldRevision: number;
  readonly carrierRevision: number;
  readonly entityId: LooseCargoEntityId | null;
  readonly lotId: string | null;
  readonly transferLoadMilli: number;
  readonly carrierLoadBeforeMilli: number;
  readonly carrierLoadAfterMilli: number;
  readonly message: string;
}

export interface LooseCargoDropRequest {
  readonly lotId: string;
  /** Required for stack/provision lots; a manual drop moves gear and Promise lots whole. */
  readonly quantity?: number;
  readonly x: number;
  readonly y: number;
}

export interface LooseCargoPickupRequest {
  readonly entityId: LooseCargoEntityId;
  readonly x: number;
  readonly y: number;
  /** Manhattan reach in fixed-point tile units. */
  readonly reach: number;
}

export interface LooseCargoTransferResult extends LooseCargoTransferQuote {
  readonly world: LooseCargoWorldState;
  readonly carrier: LooseCargoCarrierState;
  readonly entity: LooseCargoEntity | null;
  readonly conservation: LooseCargoConservationProof | null;
}

export interface LooseCargoScatterPart {
  /** Required for stack, provision, and Promise payloads. Durable gear allows one part. */
  readonly quantity?: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

export interface LooseCargoScatterRequest {
  readonly lotId: string;
  readonly x: number;
  readonly y: number;
  readonly parts: readonly LooseCargoScatterPart[];
  readonly cause: "fall-separation" | "forced-release";
}

export interface LooseCargoScatterResult {
  readonly ok: boolean;
  readonly reason: LooseCargoTransferReason;
  readonly world: LooseCargoWorldState;
  readonly carrier: LooseCargoCarrierState;
  readonly entities: readonly LooseCargoEntity[];
  readonly message: string;
  readonly conservation: LooseCargoConservationProof | null;
}

export interface LooseCargoStepSample {
  readonly entityId: LooseCargoEntityId;
  readonly environment: CargoEnvironmentSample;
  /** Local depth independently controls whether a current can carry a parcel. */
  readonly waterDepth: number;
  /** Signed downhill vector, fixed-point -1..1, supplied by terrain geometry. */
  readonly downhillX: number;
  readonly downhillY: number;
  /** Deterministic impact severity supplied by a rock/grade/fall resolver. */
  readonly tumbleImpact: number;
  /** Living-cover hooks. Full strength can arrest movement but never deletes. */
  readonly mangroveSnag: number;
  readonly brambleSnag: number;
}

export interface LooseCargoStepEvent {
  readonly eventId: string | null;
  readonly eventOrdinal: number | null;
  readonly entityId: LooseCargoEntityId;
  readonly fromTileIndex: number;
  readonly toTileIndex: number;
  readonly moved: boolean;
  readonly boundaryCollision: boolean;
  readonly impactApplied: number;
  readonly snags: readonly ("mangrove" | "bramble")[];
  readonly conditionLoss: number;
  readonly causes: readonly CargoEnvironmentCauseCode[];
  readonly causalCodes: readonly LooseCargoCauseCode[];
  readonly motion: LooseCargoMotion;
}

export type LooseCargoStepReason =
  | "advanced"
  | "invalid-world"
  | "invalid-sample"
  | "revision-space-exhausted"
  | "history-capacity-exceeded";

export interface LooseCargoManifestEntry {
  readonly payloadKey: string;
  readonly quantity: number;
  readonly loadMilli: number;
}

export interface LooseCargoConservationSnapshot {
  readonly valid: boolean;
  readonly reason:
    | "valid"
    | "invalid-world"
    | "invalid-world-set"
    | "invalid-carrier"
    | "invalid-carrier-set"
    | "duplicate-carrier-owner"
    | "duplicate-region"
    | "duplicate-parcel-identity"
    | "duplicate-durable-identity";
  readonly entries: readonly LooseCargoManifestEntry[];
  readonly totalQuantity: number;
  readonly totalLoadMilli: number;
  readonly fingerprint: string;
}

export interface LooseCargoConservationProof {
  readonly conserved: boolean;
  readonly before: LooseCargoConservationSnapshot;
  readonly after: LooseCargoConservationSnapshot;
}

export const LOOSE_CARGO_EXPECTED_MANIFEST_VERSION = 1 as const;

/** Persist separately from the mutable world/carrier payloads and verify it on
 * load. Transfer and environmental steps do not change this substance ledger. */
export interface LooseCargoExpectedManifest {
  readonly version: typeof LOOSE_CARGO_EXPECTED_MANIFEST_VERSION;
  readonly entries: readonly LooseCargoManifestEntry[];
  readonly totalQuantity: number;
  readonly totalLoadMilli: number;
  readonly fingerprint: string;
}

export interface LooseCargoExpectedManifestValidation {
  readonly valid: boolean;
  readonly reason: "valid" | "invalid-expected" | "invalid-system" | "manifest-mismatch";
  readonly actual: LooseCargoExpectedManifest | null;
}

export interface LooseCargoStepResult {
  readonly ok: boolean;
  readonly reason: LooseCargoStepReason;
  readonly state: LooseCargoWorldState;
  readonly events: readonly LooseCargoStepEvent[];
}

/**
 * Optimistic concurrency boundary for one storage region participating in a
 * seamless fixed step. A repeated/stale request cannot advance the same world
 * twice because its exact pre-step revision is part of the request.
 */
export interface LooseCargoRegionalStepInput {
  readonly region: LooseCargoRegionAddress;
  readonly expectedRevision: number;
  /** Only parcels inside the active simulation neighborhood are included. */
  readonly samples: readonly LooseCargoStepSample[];
}

export interface LooseCargoRegionHandoff {
  readonly entityId: LooseCargoEntityId;
  readonly from: LooseCargoPosition;
  readonly to: LooseCargoPosition;
  readonly sourceEventId: string;
  readonly destinationEventId: string;
}

export interface LooseCargoRegionalStepEvent extends LooseCargoStepEvent {
  readonly from: LooseCargoPosition;
  readonly to: LooseCargoPosition;
  readonly crossedRegion: boolean;
}

export type LooseCargoRegionalStepReason =
  | "advanced"
  | "invalid-world-set"
  | "invalid-sample"
  | "stale-step"
  | "revision-space-exhausted"
  | "history-capacity-exceeded"
  | "entity-capacity-exceeded"
  | "coordinate-space-exhausted";

export interface LooseCargoRegionalStepResult {
  readonly ok: boolean;
  readonly reason: LooseCargoRegionalStepReason;
  /** Canonical region-key order, including newly touched destinations. */
  readonly worlds: readonly LooseCargoWorldState[];
  readonly events: readonly LooseCargoRegionalStepEvent[];
  readonly handoffs: readonly LooseCargoRegionHandoff[];
}

const CALM_ENVIRONMENT: CargoEnvironmentSample = {
  rain: 0,
  heat: 0,
  cold: 0,
  immersion: 0,
  currentX: 0,
  currentY: 0,
  magicalWaterFlux: 0,
  impact: 0,
};

const STACK_PROPERTIES: Readonly<Record<CraftingStackId, CargoEnvironmentProperty>> = {
  bladderkelp: "perishable",
  cordreed: "ordinary",
  driftwood: "heavy",
  "glimmer-spore": "fragile",
  hookstone: "heavy",
  pitchmoss: "perishable",
  shellstone: "heavy",
  stormlichen: "fragile",
  sunfiber: "ordinary",
  "braided-cord": "ordinary",
  "float-cell": "fragile",
  "glimmer-seal": "confidential",
  pitchcloth: "ordinary",
  "stone-fitting": "heavy",
  stormweave: "fragile",
};

const GEAR_PROPERTIES: Readonly<Record<CraftedGearKind, CargoEnvironmentProperty>> = {
  "cargo-rain-shroud": "ordinary",
  "float-sash": "ordinary",
  "glimmer-liner": "fragile",
  ladder: "heavy",
  "marsh-wraps": "ordinary",
  pannier: "heavy",
  "reed-mat": "heavy",
  "ridge-cleats": "heavy",
  "tide-anchor": "heavy",
  "weather-cape": "ordinary",
  "wind-knot": "fragile",
};

export function createLooseCargoWorld(
  width: number,
  height: number,
  region: LooseCargoRegionAddress = { x: 0, y: 0 },
): LooseCargoWorldState {
  if (!validDimension(width) || !validDimension(height)) {
    throw new RangeError("Loose-cargo world dimensions must be positive integers up to 4,096");
  }
  const canonicalRegion = canonicalRegionAddress(region);
  if (canonicalRegion === null) {
    throw new RangeError("Loose-cargo region coordinates must be safe integers");
  }
  return trustWorldState({
    version: LOOSE_CARGO_VERSION,
    revision: 0,
    completedSteps: 0,
    width,
    height,
    region: canonicalRegion,
    lastEntityOrdinal: 0,
    lastEventOrdinal: 0,
    historyBaseOrdinal: 0,
    historyArchiveHash: "0000000000000000",
    entities: [],
    history: [],
  });
}

/**
 * Runtime adapter from today's aggregate crafting inventory. Stack lots begin
 * pristine; recovered lots remain separate after pickup so future crafting can
 * account for weathered ingredients without losing their exact state.
 */
export function createLooseCargoCarrier(
  owner: LooseCargoOwner,
  inventory: CraftingInventory,
  promises: readonly PromiseCargoAdapterInput[] = [],
  reservedLoadMilli = 0,
): LooseCargoCarrierState {
  const inventoryInspection = inspectCraftingInventory(inventory);
  if (!inventoryInspection.valid) {
    throw new RangeError(`Cannot adapt invalid crafting inventory: ${inventoryInspection.reason}`);
  }
  const lots: CarriedCargoLot[] = [];
  for (const item of CRAFTING_STACK_IDS) {
    const quantity = inventory.stacks[item];
    if (quantity > 0) {
      lots.push({
        id: `crafting-stack:${item}`,
        payload: { kind: "stack", item, quantity },
        materialState: pristineMaterialState(),
      });
    }
  }
  for (const gear of inventory.gear) {
    lots.push({
      id: `gear:${gear.id}`,
      payload: { kind: "gear", gearId: gear.id, gearKind: gear.kind },
      materialState: { condition: gear.condition, contamination: 0, decay: 0 },
    });
  }
  for (const promise of promises) {
    lots.push({
      id: `promise:${promise.contractId}`,
      payload: {
        kind: "promise",
        contractId: promise.contractId,
        resource: promise.resource,
        quantity: promise.quantity,
        property: promise.property,
      },
      materialState: {
        condition: promise.condition,
        contamination: promise.contamination ?? 0,
        decay: promise.decay ?? 0,
      },
    });
  }
  const candidate: LooseCargoCarrierState = {
    version: LOOSE_CARGO_VERSION,
    revision: 0,
    owner,
    capacityMilliLoad: inventory.capacityMilliLoad,
    reservedLoadMilli,
    lots,
    retiredLotIds: [],
  };
  const validation = validateLooseCargoCarrier(candidate);
  if (!validation.valid || validation.carrier === null) {
    throw new RangeError(`Cannot create loose-cargo carrier: ${validation.reason}`);
  }
  return validation.carrier;
}

/** Project the kernel carrier back toward the existing inventory/runtime shape. */
export function projectLooseCargoCarrier(
  carrier: LooseCargoCarrierState,
): LooseCargoCarrierAdapterResult {
  const validation = validateLooseCargoCarrier(carrier);
  if (!validation.valid || validation.carrier === null) {
    throw new RangeError(`Cannot project invalid loose-cargo carrier: ${validation.reason}`);
  }
  const canonical = validation.carrier;
  const stacks = Object.fromEntries(
    CRAFTING_STACK_IDS.map((item) => [item, 0]),
  ) as Record<CraftingStackId, number>;
  const gear: CraftedGearItem[] = [];
  const promises: PromiseCargoAdapterInput[] = [];
  const provisions: LooseCargoCarrierAdapterResult["provisions"][number][] = [];
  for (const lot of canonical.lots) {
    switch (lot.payload.kind) {
      case "stack":
        stacks[lot.payload.item] += lot.payload.quantity;
        break;
      case "gear":
        gear.push({
          id: lot.payload.gearId,
          kind: lot.payload.gearKind,
          condition: lot.materialState.condition,
        });
        break;
      case "promise":
        promises.push({
          contractId: lot.payload.contractId,
          resource: lot.payload.resource,
          quantity: lot.payload.quantity,
          property: lot.payload.property,
          condition: lot.materialState.condition,
          contamination: lot.materialState.contamination,
          decay: lot.materialState.decay,
        });
        break;
      case "provision":
        provisions.push({
          lotId: lot.payload.lotId,
          provision: lot.payload.provision,
          quantity: lot.payload.quantity,
          materialState: lot.materialState,
        });
        break;
    }
  }
  return {
    craftingInventory: createCraftingInventory(
      canonical.capacityMilliLoad,
      stacks,
      gear,
    ),
    promises,
    provisions,
    lots: canonical.lots,
    reservedLoadMilli: canonical.reservedLoadMilli,
    retiredLotIds: canonical.retiredLotIds,
  };
}

/** Add one exact stack lot. Reusing a source ID is idempotent only when every
 * field already matches; it never silently doubles a repeated gather event. */
export function addLooseCargoStack(
  carrier: LooseCargoCarrierState,
  request: LooseCargoAddStackRequest,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (
    !isRecord(request)
    || !validLotId(request.sourceLotId)
    || !STACK_ID_SET.has(request.item as string)
    || !validQuantity(request.quantity)
  ) return failedCarrierMutation("invalid-request", carrier);
  const materialState = canonicalMaterialState(request.materialState ?? pristineMaterialState());
  if (materialState === null) return failedCarrierMutation("invalid-request", carrier);
  if (canonical.retiredLotIds.includes(request.sourceLotId)) {
    return failedCarrierMutation("identity-conflict", carrier, request.sourceLotId);
  }
  const existing = canonical.lots.find((lot) => lot.id === request.sourceLotId);
  if (existing !== undefined) {
    const exact = existing.payload.kind === "stack"
      && existing.payload.item === request.item
      && existing.payload.quantity === request.quantity
      && sameMaterialState(existing.materialState, materialState);
    return exact
      ? unchangedCarrierMutation(canonical, existing.id)
      : failedCarrierMutation("identity-conflict", carrier, existing.id);
  }
  return commitCarrierMutation(canonical, [
    ...canonical.lots,
    {
      id: request.sourceLotId,
      payload: { kind: "stack", item: request.item, quantity: request.quantity },
      materialState,
    },
  ], request.sourceLotId);
}

/** Add one exact ordinary provision lot without converting it into crafting or
 * Promise inventory. Replaying the same source identity is idempotent only
 * when the complete physical definition matches. */
export function addLooseCargoProvision(
  carrier: LooseCargoCarrierState,
  request: LooseCargoAddProvisionRequest,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (
    !isRecord(request)
    || !validLotId(request.sourceLotId)
    || !PROVISION_KIND_SET.has(request.provision as string)
    || !validQuantity(request.quantity)
  ) return failedCarrierMutation("invalid-request", carrier);
  const materialState = canonicalMaterialState(request.materialState ?? pristineMaterialState());
  if (materialState === null) return failedCarrierMutation("invalid-request", carrier);
  if (canonical.retiredLotIds.includes(request.sourceLotId)) {
    return failedCarrierMutation("identity-conflict", carrier, request.sourceLotId);
  }
  const existing = canonical.lots.find((lot) => lot.id === request.sourceLotId);
  if (existing !== undefined) {
    const exact = existing.payload.kind === "provision"
      && existing.payload.lotId === request.sourceLotId
      && existing.payload.provision === request.provision
      && existing.payload.quantity === request.quantity
      && sameMaterialState(existing.materialState, materialState);
    return exact
      ? unchangedCarrierMutation(canonical, existing.id)
      : failedCarrierMutation("identity-conflict", carrier, existing.id);
  }
  return commitCarrierMutation(canonical, [
    ...canonical.lots,
    {
      id: request.sourceLotId,
      payload: {
        kind: "provision",
        lotId: request.sourceLotId,
        provision: request.provision,
        quantity: request.quantity,
      },
      materialState,
    },
  ], request.sourceLotId);
}

/**
 * Consume exact stack units in canonical ascending lot-ID order. The returned
 * fragments retain each source material state so crafting can derive honest
 * output quality instead of treating weathered ingredients as pristine.
 */
export function consumeLooseCargoStack(
  carrier: LooseCargoCarrierState,
  request: LooseCargoConsumeStackRequest,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (
    !isRecord(request)
    || !STACK_ID_SET.has(request.item as string)
    || !validQuantity(request.quantity)
  ) return failedCarrierMutation("invalid-request", carrier);
  const available = canonical.lots.reduce((total, lot) => lot.payload.kind === "stack"
    && lot.payload.item === request.item ? total + lot.payload.quantity : total, 0);
  if (available < request.quantity) {
    return failedCarrierMutation("quantity-unavailable", carrier);
  }
  let remaining = request.quantity;
  const removed: CarriedCargoLot[] = [];
  const nextLots: CarriedCargoLot[] = [];
  for (const lot of canonical.lots) {
    if (remaining === 0 || lot.payload.kind !== "stack" || lot.payload.item !== request.item) {
      nextLots.push(lot);
      continue;
    }
    const consumed = Math.min(remaining, lot.payload.quantity);
    removed.push({ ...lot, payload: { ...lot.payload, quantity: consumed } });
    remaining -= consumed;
    if (consumed < lot.payload.quantity) {
      nextLots.push({
        ...lot,
        payload: { ...lot.payload, quantity: lot.payload.quantity - consumed },
      });
    }
  }
  const fullyConsumedIds = removed
    .filter((fragment) => !nextLots.some((lot) => lot.id === fragment.id))
    .map(({ id }) => id);
  const retiredLotIds = addRetiredLotIds(canonical.retiredLotIds, fullyConsumedIds);
  if (retiredLotIds === null) {
    return failedCarrierMutation("retirement-space-exhausted", carrier, removed[0]?.id ?? null);
  }
  return commitCarrierMutation(
    canonical,
    nextLots,
    removed[0]?.id ?? null,
    removed,
    canonical.reservedLoadMilli,
    retiredLotIds,
  );
}

/**
 * Consume ordinary provisions in canonical lot-ID order. Each returned
 * fragment identifies its exact source lot. Fully consumed IDs become durable
 * tombstones; partial remainders retain their identity and material state.
 */
export function consumeLooseCargoProvision(
  carrier: LooseCargoCarrierState,
  request: LooseCargoConsumeProvisionRequest,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (
    !isRecord(request)
    || !PROVISION_KIND_SET.has(request.provision as string)
    || !validQuantity(request.quantity)
  ) return failedCarrierMutation("invalid-request", carrier);
  const available = canonical.lots.reduce((total, lot) => lot.payload.kind === "provision"
    && lot.payload.provision === request.provision ? total + lot.payload.quantity : total, 0);
  if (available < request.quantity) {
    return failedCarrierMutation("quantity-unavailable", carrier);
  }
  let remaining = request.quantity;
  const removed: CarriedCargoLot[] = [];
  const nextLots: CarriedCargoLot[] = [];
  for (const lot of canonical.lots) {
    if (
      remaining === 0
      || lot.payload.kind !== "provision"
      || lot.payload.provision !== request.provision
    ) {
      nextLots.push(lot);
      continue;
    }
    const consumed = Math.min(remaining, lot.payload.quantity);
    removed.push({ ...lot, payload: { ...lot.payload, quantity: consumed } });
    remaining -= consumed;
    if (consumed < lot.payload.quantity) {
      nextLots.push({
        ...lot,
        payload: { ...lot.payload, quantity: lot.payload.quantity - consumed },
      });
    }
  }
  const fullyConsumedIds = removed
    .filter((fragment) => !nextLots.some((lot) => lot.id === fragment.id))
    .map(({ id }) => id);
  const retiredLotIds = addRetiredLotIds(canonical.retiredLotIds, fullyConsumedIds);
  if (retiredLotIds === null) {
    return failedCarrierMutation("retirement-space-exhausted", carrier, removed[0]?.id ?? null);
  }
  return commitCarrierMutation(
    canonical,
    nextLots,
    removed[0]?.id ?? null,
    removed,
    canonical.reservedLoadMilli,
    retiredLotIds,
  );
}

/** Consume from one specifically identified provision lot. */
export function consumeLooseCargoProvisionLot(
  carrier: LooseCargoCarrierState,
  request: LooseCargoConsumeProvisionLotRequest,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (!isRecord(request) || !validLotId(request.lotId) || !validQuantity(request.quantity)) {
    return failedCarrierMutation("invalid-request", carrier);
  }
  const lot = canonical.lots.find((candidate) => candidate.id === request.lotId);
  if (lot === undefined || lot.payload.kind !== "provision") {
    return failedCarrierMutation("lot-not-found", carrier, request.lotId);
  }
  const provisionPayload = lot.payload;
  if (request.quantity > provisionPayload.quantity) {
    return failedCarrierMutation("quantity-unavailable", carrier, lot.id);
  }
  const removed: CarriedCargoLot = {
    ...lot,
    payload: { ...provisionPayload, quantity: request.quantity },
  };
  const fullyConsumed = request.quantity === provisionPayload.quantity;
  const nextLots = fullyConsumed
    ? canonical.lots.filter((candidate) => candidate.id !== lot.id)
    : canonical.lots.map((candidate) => candidate.id === lot.id
      ? {
          ...candidate,
          payload: {
            ...provisionPayload,
            quantity: provisionPayload.quantity - request.quantity,
          },
        }
      : candidate);
  const retiredLotIds = addRetiredLotIds(
    canonical.retiredLotIds,
    fullyConsumed ? [lot.id] : [],
  );
  if (retiredLotIds === null) {
    return failedCarrierMutation("retirement-space-exhausted", carrier, lot.id);
  }
  return commitCarrierMutation(
    canonical,
    nextLots,
    lot.id,
    [removed],
    canonical.reservedLoadMilli,
    retiredLotIds,
  );
}

/** Insert a crafted/found durable, or explicitly replace its material state. */
export function upsertLooseCargoGear(
  carrier: LooseCargoCarrierState,
  request: LooseCargoGearUpsertRequest,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (
    !isRecord(request)
    || !validLotId(request.sourceLotId)
    || !validIdentity(request.gearId)
    || !GEAR_KIND_SET.has(request.gearKind as string)
  ) return failedCarrierMutation("invalid-request", carrier);
  const materialState = canonicalMaterialState(request.materialState);
  if (materialState === null) return failedCarrierMutation("invalid-request", carrier);
  if (canonical.retiredLotIds.includes(request.sourceLotId)) {
    return failedCarrierMutation("identity-conflict", carrier, request.sourceLotId);
  }
  const byLot = canonical.lots.find((lot) => lot.id === request.sourceLotId);
  const byGear = canonical.lots.find((lot) => lot.payload.kind === "gear" && lot.payload.gearId === request.gearId);
  if (byLot !== undefined && byLot !== byGear) {
    return failedCarrierMutation("identity-conflict", carrier, request.sourceLotId);
  }
  if (byGear !== undefined) {
    if (
      byGear.id !== request.sourceLotId
      || byGear.payload.kind !== "gear"
      || byGear.payload.gearKind !== request.gearKind
    ) return failedCarrierMutation("identity-conflict", carrier, byGear.id);
    const replacement: CarriedCargoLot = {
      ...byGear,
      materialState,
    };
    if (sameMaterialState(byGear.materialState, materialState)) {
      return unchangedCarrierMutation(canonical, byGear.id);
    }
    return commitCarrierMutation(
      canonical,
      canonical.lots.map((lot) => lot.id === byGear.id ? replacement : lot),
      byGear.id,
    );
  }
  return commitCarrierMutation(canonical, [
    ...canonical.lots,
    {
      id: request.sourceLotId,
      payload: { kind: "gear", gearId: request.gearId, gearKind: request.gearKind },
      materialState,
    },
  ], request.sourceLotId);
}

export function setLooseCargoGearCondition(
  carrier: LooseCargoCarrierState,
  gearId: number,
  condition: number,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (!validIdentity(gearId) || !validUnit(condition)) {
    return failedCarrierMutation("invalid-request", carrier);
  }
  const lot = canonical.lots.find((candidate) => candidate.payload.kind === "gear"
    && candidate.payload.gearId === gearId);
  if (lot === undefined || lot.payload.kind !== "gear") {
    return failedCarrierMutation("lot-not-found", carrier);
  }
  if (lot.materialState.condition === condition) return unchangedCarrierMutation(canonical, lot.id);
  return commitCarrierMutation(canonical, canonical.lots.map((candidate) => candidate.id === lot.id
    ? { ...candidate, materialState: { ...candidate.materialState, condition } }
    : candidate), lot.id);
}

export function removeLooseCargoGear(
  carrier: LooseCargoCarrierState,
  gearId: number,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (!validIdentity(gearId)) return failedCarrierMutation("invalid-request", carrier);
  const lot = canonical.lots.find((candidate) => candidate.payload.kind === "gear"
    && candidate.payload.gearId === gearId);
  if (lot === undefined) return failedCarrierMutation("lot-not-found", carrier);
  const retiredLotIds = addRetiredLotIds(canonical.retiredLotIds, [lot.id]);
  if (retiredLotIds === null) return failedCarrierMutation("retirement-space-exhausted", carrier, lot.id);
  return commitCarrierMutation(
    canonical,
    canonical.lots.filter((candidate) => candidate.id !== lot.id),
    lot.id,
    [lot],
    canonical.reservedLoadMilli,
    retiredLotIds,
  );
}

/** Add or explicitly replace one identified Promise lot without touching any
 * sibling fragment from the same contract. */
export function upsertLooseCargoPromise(
  carrier: LooseCargoCarrierState,
  request: LooseCargoPromiseUpsertRequest,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  const payload = canonicalPayload({
    kind: "promise",
    contractId: request?.contractId,
    resource: request?.resource,
    quantity: request?.quantity,
    property: request?.property,
  });
  const materialState = canonicalMaterialState(request?.materialState);
  if (!isRecord(request) || !validLotId(request.sourceLotId) || payload?.kind !== "promise" || materialState === null) {
    return failedCarrierMutation("invalid-request", carrier);
  }
  if (canonical.retiredLotIds.includes(request.sourceLotId)) {
    return failedCarrierMutation("identity-conflict", carrier, request.sourceLotId);
  }
  const conflictingDefinition = canonical.lots.some((lot) => lot.payload.kind === "promise"
    && lot.payload.contractId === payload.contractId
    && promiseDefinitionKey(lot.payload) !== promiseDefinitionKey(payload));
  if (conflictingDefinition) return failedCarrierMutation("identity-conflict", carrier, request.sourceLotId);
  const existing = canonical.lots.find((lot) => lot.id === request.sourceLotId);
  if (existing !== undefined && (
    existing.payload.kind !== "promise"
    || promiseDefinitionKey(existing.payload) !== promiseDefinitionKey(payload)
  )) return failedCarrierMutation("identity-conflict", carrier, request.sourceLotId);
  const replacement: CarriedCargoLot = {
    id: request.sourceLotId,
    payload,
    materialState,
  };
  if (existing !== undefined
    && stableStringify(existing.payload) === stableStringify(payload)
    && sameMaterialState(existing.materialState, materialState)) {
    return unchangedCarrierMutation(canonical, existing.id);
  }
  return commitCarrierMutation(canonical, existing === undefined
    ? [...canonical.lots, replacement]
    : canonical.lots.map((lot) => lot.id === existing.id ? replacement : lot), request.sourceLotId);
}

export function setLooseCargoPromiseMaterialState(
  carrier: LooseCargoCarrierState,
  lotId: string,
  materialState: CargoEnvironmentState,
): LooseCargoCarrierMutationResult {
  const result = setLooseCargoLotMaterialState(carrier, lotId, materialState);
  if (!result.ok) return result;
  const lot = result.carrier.lots.find((candidate) => candidate.id === lotId);
  if (lot?.payload.kind === "promise") return result;
  return failedCarrierMutation("lot-not-found", carrier, lotId);
}

/**
 * Replace the physical state of one exact carried lot, regardless of payload
 * kind. Fall and weather integration use this boundary so an item that remains
 * in the pack can still take the same authoritative impact as a separated
 * parcel without rebuilding aggregate inventory or resetting provenance.
 */
export function setLooseCargoLotMaterialState(
  carrier: LooseCargoCarrierState,
  lotId: string,
  materialState: CargoEnvironmentState,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  const state = canonicalMaterialState(materialState);
  if (!validLotId(lotId) || state === null) return failedCarrierMutation("invalid-request", carrier);
  const lot = canonical.lots.find((candidate) => candidate.id === lotId);
  if (lot === undefined) {
    return failedCarrierMutation("lot-not-found", carrier, lotId);
  }
  if (sameMaterialState(lot.materialState, state)) return unchangedCarrierMutation(canonical, lot.id);
  return commitCarrierMutation(canonical, canonical.lots.map((candidate) => candidate.id === lot.id
    ? { ...candidate, materialState: state }
    : candidate), lot.id);
}

export function removeLooseCargoPromise(
  carrier: LooseCargoCarrierState,
  lotId: string,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (!validLotId(lotId)) return failedCarrierMutation("invalid-request", carrier);
  const lot = canonical.lots.find((candidate) => candidate.id === lotId);
  if (lot === undefined || lot.payload.kind !== "promise") {
    return failedCarrierMutation("lot-not-found", carrier, lotId);
  }
  const retiredLotIds = addRetiredLotIds(canonical.retiredLotIds, [lot.id]);
  if (retiredLotIds === null) return failedCarrierMutation("retirement-space-exhausted", carrier, lot.id);
  return commitCarrierMutation(
    canonical,
    canonical.lots.filter((candidate) => candidate.id !== lot.id),
    lot.id,
    [lot],
    canonical.reservedLoadMilli,
    retiredLotIds,
  );
}

/** Atomic signed-report/reserved-load update. */
export function setLooseCargoReservedLoad(
  carrier: LooseCargoCarrierState,
  reservedLoadMilli: number,
): LooseCargoCarrierMutationResult {
  const canonical = mutationCarrier(carrier);
  if (canonical === null) return failedCarrierMutation("invalid-carrier", carrier);
  if (!Number.isSafeInteger(reservedLoadMilli) || reservedLoadMilli < 0 || reservedLoadMilli > MAX_CAPACITY_MILLI) {
    return failedCarrierMutation("invalid-request", carrier);
  }
  if (reservedLoadMilli === canonical.reservedLoadMilli) return unchangedCarrierMutation(canonical, null);
  return commitCarrierMutation(canonical, canonical.lots, null, [], reservedLoadMilli);
}

export function looseCargoPayloadProperty(payload: LooseCargoPayload): CargoEnvironmentProperty {
  switch (payload.kind) {
    case "stack": return STACK_PROPERTIES[payload.item];
    case "gear": return GEAR_PROPERTIES[payload.gearKind];
    case "promise": return payload.property;
    case "provision": return PROVISION_DEFINITIONS[payload.provision].property;
  }
}

export function looseCargoPayloadLoadMilli(payload: LooseCargoPayload): number {
  switch (payload.kind) {
    case "stack":
      return CRAFTING_STACK_DEFINITIONS[payload.item].loadMilli * payload.quantity;
    case "gear":
      return CRAFTED_GEAR_DEFINITIONS[payload.gearKind].loadMilli;
    case "promise":
      return promiseCargoLoadMilli(payload.quantity, payload.property);
    case "provision":
      return PROVISION_DEFINITIONS[payload.provision].loadMilli * payload.quantity;
  }
}

export function promiseCargoLoadMilli(
  quantity: number,
  property: CargoEnvironmentProperty,
): number {
  if (!validQuantity(quantity)) return 0;
  const unitLoadMilli = property === "heavy" ? 2_000 : property === "fragile" ? 1_250 : 1_000;
  return quantity * unitLoadMilli;
}

export function looseCargoCarrierLoadMilli(carrier: LooseCargoCarrierState): number {
  const validation = validateLooseCargoCarrier(carrier);
  return validation.valid ? validation.loadMilli : 0;
}

/** Canonical persistent lookup key for signed regional cargo worlds. */
export function looseCargoRegionKey(region: LooseCargoRegionAddress): string {
  const canonical = canonicalRegionAddress(region);
  if (canonical === null) {
    throw new RangeError("Loose-cargo region keys require canonical safe-integer coordinates");
  }
  return `r:${canonical.x}:${canonical.y}`;
}

export function validateLooseCargoWorld(value: unknown): LooseCargoWorldValidation {
  if (!isRecord(value)) return invalidWorld("not-an-object");
  if (TRUSTED_WORLD_STATES.has(value)) {
    return { valid: true, reason: "valid", state: value as unknown as LooseCargoWorldState };
  }
  if (value.version !== LOOSE_CARGO_VERSION) return invalidWorld("invalid-version");
  if (!validCounter(value.revision) || !validCounter(value.completedSteps)) {
    return invalidWorld("invalid-revision");
  }
  if (!validDimension(value.width) || !validDimension(value.height)) {
    return invalidWorld("invalid-dimensions");
  }
  const region = canonicalRegionAddress(value.region);
  if (region === null) return invalidWorld("invalid-region");
  if (!validOrdinal(value.lastEntityOrdinal) || !validOrdinal(value.lastEventOrdinal)) {
    return invalidWorld("invalid-ordinal");
  }
  if (
    !validOrdinal(value.historyBaseOrdinal)
    || value.historyBaseOrdinal > value.lastEventOrdinal
    || typeof value.historyArchiveHash !== "string"
    || !/^[0-9a-f]{16}$/.test(value.historyArchiveHash)
    || (value.historyBaseOrdinal === 0 && value.historyArchiveHash !== "0000000000000000")
  ) return invalidWorld("invalid-history");
  if (!Array.isArray(value.entities) || value.entities.length > LOOSE_CARGO_MAX_ENTITIES) {
    return invalidWorld("too-many-entities");
  }
  if (!Array.isArray(value.history) || value.history.length > LOOSE_CARGO_MAX_HISTORY) {
    return invalidWorld("too-much-history");
  }
  const width = value.width;
  const height = value.height;
  const entities: LooseCargoEntity[] = [];
  const ids = new Set<string>();
  const gearIds = new Set<number>();
  const provisionLotIds = new Set<string>();
  const contractDefinitions = new Map<number, string>();
  const contractQuantities = new Map<number, number>();
  let maximumEntityOrdinal = 0;
  for (const rawEntity of value.entities) {
    const entity = canonicalEntity(rawEntity, width, height, value.lastEventOrdinal);
    if (entity === null) return invalidWorld("invalid-entity");
    if (ids.has(entity.id)) return invalidWorld("duplicate-entity-id");
    ids.add(entity.id);
    if (sameRegion(entity.origin.region, region)) {
      maximumEntityOrdinal = Math.max(maximumEntityOrdinal, entity.origin.ordinal);
    }
    if (entity.payload.kind === "gear") {
      if (gearIds.has(entity.payload.gearId)) return invalidWorld("duplicate-durable-identity");
      gearIds.add(entity.payload.gearId);
    } else if (entity.payload.kind === "promise") {
      const definition = promiseDefinitionKey(entity.payload);
      const priorDefinition = contractDefinitions.get(entity.payload.contractId);
      if (priorDefinition !== undefined && priorDefinition !== definition) {
        return invalidWorld("duplicate-durable-identity");
      }
      contractDefinitions.set(entity.payload.contractId, definition);
      const quantity = (contractQuantities.get(entity.payload.contractId) ?? 0) + entity.payload.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > MAX_QUANTITY) return invalidWorld("invalid-entity");
      contractQuantities.set(entity.payload.contractId, quantity);
    } else if (entity.payload.kind === "provision") {
      if (provisionLotIds.has(entity.payload.lotId)) {
        return invalidWorld("duplicate-durable-identity");
      }
      provisionLotIds.add(entity.payload.lotId);
    }
    entities.push(entity);
  }
  if (value.lastEntityOrdinal < maximumEntityOrdinal) {
    return invalidWorld("invalid-ordinal");
  }
  const history: LooseCargoHistoryRecord[] = [];
  const historyIds = new Set<string>();
  let priorOrdinal = value.historyBaseOrdinal;
  for (const rawRecord of value.history) {
    const record = canonicalHistoryRecord(rawRecord, region, width, height);
    if (
      record === null
      || historyIds.has(record.id)
      || record.ordinal !== priorOrdinal + 1
      || record.ordinal > value.lastEventOrdinal
    ) return invalidWorld("invalid-history");
    historyIds.add(record.id);
    priorOrdinal = record.ordinal;
    history.push(record);
  }
  if (history.length > 0 && priorOrdinal !== value.lastEventOrdinal) {
    return invalidWorld("invalid-history");
  }
  if (history.length === 0 && value.lastEventOrdinal !== value.historyBaseOrdinal) {
    return invalidWorld("invalid-history");
  }
  entities.sort(compareEntity);
  const state = trustWorldState({
    version: LOOSE_CARGO_VERSION,
    revision: value.revision,
    completedSteps: value.completedSteps,
    width,
    height,
    region,
    lastEntityOrdinal: value.lastEntityOrdinal,
    lastEventOrdinal: value.lastEventOrdinal,
    historyBaseOrdinal: value.historyBaseOrdinal,
    historyArchiveHash: value.historyArchiveHash,
    entities,
    history,
  });
  return {
    valid: true,
    reason: "valid",
    state,
  };
}

export function validateLooseCargoCarrier(value: unknown): LooseCargoCarrierValidation {
  if (!isRecord(value)) return invalidCarrier("not-an-object");
  if (value.version !== LOOSE_CARGO_VERSION) return invalidCarrier("invalid-version");
  if (!validCounter(value.revision)) return invalidCarrier("invalid-revision");
  const owner = canonicalOwner(value.owner);
  if (owner === null) return invalidCarrier("invalid-owner");
  if (
    !Number.isSafeInteger(value.capacityMilliLoad)
    || value.capacityMilliLoad < 0
    || value.capacityMilliLoad > MAX_CAPACITY_MILLI
    || !Number.isSafeInteger(value.reservedLoadMilli)
    || value.reservedLoadMilli < 0
    || value.reservedLoadMilli > value.capacityMilliLoad
  ) {
    return invalidCarrier("invalid-capacity");
  }
  if (!Array.isArray(value.lots) || value.lots.length > MAX_CARRIER_LOTS) {
    return invalidCarrier("too-many-lots");
  }
  if (!Array.isArray(value.retiredLotIds) || value.retiredLotIds.length > LOOSE_CARGO_MAX_RETIRED_LOTS) {
    return invalidCarrier("invalid-retired-lot");
  }
  const retiredLotIds: string[] = [];
  const retiredSet = new Set<string>();
  for (const retired of value.retiredLotIds as readonly unknown[]) {
    if (!validLotId(retired) || retiredSet.has(retired)) return invalidCarrier("invalid-retired-lot");
    retiredSet.add(retired);
    retiredLotIds.push(retired);
  }
  retiredLotIds.sort();
  const lots: CarriedCargoLot[] = [];
  const lotIds = new Set<string>();
  const gearIds = new Set<number>();
  const provisionLotIds = new Set<string>();
  const contractDefinitions = new Map<number, string>();
  const contractQuantities = new Map<number, number>();
  const stackQuantities = new Map<CraftingStackId, number>();
  let cargoLoad = 0;
  for (const rawLot of value.lots) {
    const lot = canonicalLot(rawLot);
    if (lot === null) return invalidCarrier("invalid-lot");
    if (lotIds.has(lot.id)) return invalidCarrier("duplicate-lot-id");
    if (retiredSet.has(lot.id)) return invalidCarrier("invalid-retired-lot");
    lotIds.add(lot.id);
    if (lot.payload.kind === "gear") {
      if (gearIds.has(lot.payload.gearId)) return invalidCarrier("duplicate-durable-identity");
      gearIds.add(lot.payload.gearId);
    } else if (lot.payload.kind === "promise") {
      const definition = promiseDefinitionKey(lot.payload);
      const priorDefinition = contractDefinitions.get(lot.payload.contractId);
      if (priorDefinition !== undefined && priorDefinition !== definition) {
        return invalidCarrier("duplicate-durable-identity");
      }
      contractDefinitions.set(lot.payload.contractId, definition);
      const quantity = (contractQuantities.get(lot.payload.contractId) ?? 0) + lot.payload.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > MAX_QUANTITY) return invalidCarrier("invalid-lot");
      contractQuantities.set(lot.payload.contractId, quantity);
    } else if (lot.payload.kind === "provision") {
      if (provisionLotIds.has(lot.payload.lotId)) {
        return invalidCarrier("duplicate-durable-identity");
      }
      provisionLotIds.add(lot.payload.lotId);
    } else {
      const totalQuantity = (stackQuantities.get(lot.payload.item) ?? 0) + lot.payload.quantity;
      if (!Number.isSafeInteger(totalQuantity) || totalQuantity > MAX_QUANTITY) {
        return invalidCarrier("invalid-lot");
      }
      stackQuantities.set(lot.payload.item, totalQuantity);
    }
    cargoLoad += looseCargoPayloadLoadMilli(lot.payload);
    if (!Number.isSafeInteger(cargoLoad)) return invalidCarrier("invalid-lot");
    lots.push(lot);
  }
  const loadMilli = value.reservedLoadMilli + cargoLoad;
  if (!Number.isSafeInteger(loadMilli)) return invalidCarrier("invalid-lot");
  if (loadMilli > value.capacityMilliLoad) {
    return {
      valid: false,
      reason: "over-capacity",
      carrier: null,
      loadMilli,
      freeMilli: 0,
    };
  }
  lots.sort(compareLot);
  return {
    valid: true,
    reason: "valid",
    carrier: {
      version: LOOSE_CARGO_VERSION,
      revision: value.revision,
      owner,
      capacityMilliLoad: value.capacityMilliLoad,
      reservedLoadMilli: value.reservedLoadMilli,
      lots,
      retiredLotIds,
    },
    loadMilli,
    freeMilli: value.capacityMilliLoad - loadMilli,
  };
}

export function serializeLooseCargoWorld(state: LooseCargoWorldState): string {
  const validation = validateLooseCargoWorld(state);
  if (!validation.valid || validation.state === null) {
    throw new RangeError(`Cannot serialize invalid loose-cargo world: ${validation.reason}`);
  }
  return stableStringify(validation.state);
}

export function serializeLooseCargoCarrier(state: LooseCargoCarrierState): string {
  const validation = validateLooseCargoCarrier(state);
  if (!validation.valid || validation.carrier === null) {
    throw new RangeError(`Cannot serialize invalid loose-cargo carrier: ${validation.reason}`);
  }
  return stableStringify(validation.carrier);
}

export function deserializeLooseCargoWorld(text: string): LooseCargoWorldState {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Loose-cargo save is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
  const validation = validateLooseCargoWorld(decoded);
  if (!validation.valid || validation.state === null) {
    throw new Error(`Loose-cargo save is invalid: ${validation.reason}`);
  }
  return validation.state;
}

export function deserializeLooseCargoCarrier(text: string): LooseCargoCarrierState {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Loose-cargo carrier save is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
  const validation = validateLooseCargoCarrier(decoded);
  if (!validation.valid || validation.carrier === null) {
    throw new Error(`Loose-cargo carrier save is invalid: ${validation.reason}`);
  }
  return validation.carrier;
}

export function looseCargoEntityId(
  region: LooseCargoRegionAddress,
  ordinal: number,
): LooseCargoEntityId {
  const address = canonicalRegionAddress(region);
  if (address === null || !validPositiveOrdinal(ordinal)) {
    throw new RangeError("Parcel IDs require a valid region and positive safe ordinal");
  }
  return `lc:${address.x}:${address.y}:parcel:${ordinal}`;
}

export function looseCargoEventId(
  region: LooseCargoRegionAddress,
  ordinal: number,
): string {
  const address = canonicalRegionAddress(region);
  if (address === null || !validPositiveOrdinal(ordinal)) {
    throw new RangeError("Parcel event IDs require a valid region and positive safe ordinal");
  }
  return `lc:${address.x}:${address.y}:event:${ordinal}`;
}

/** Exact child identity for a provision fragment created as one world parcel. */
export function provisionFragmentLotId(entityId: LooseCargoEntityId): string {
  if (!validEntityId(entityId)) {
    throw new RangeError("Provision fragment IDs require a valid parcel identity");
  }
  const lotId = `provision-fragment:${entityId}`;
  if (!validLotId(lotId)) {
    throw new RangeError("Provision fragment identity exceeds the cargo identity budget");
  }
  return lotId;
}

/**
 * Cross-state conservation snapshot. Runtime should validate this after load,
 * after every atomic transfer, and before saving. It catches duplicate durable
 * gear, conflicting Promise definitions, quantity drift, and load drift.
 */
export function inspectLooseCargoConservation(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
): LooseCargoConservationSnapshot {
  return inspectLooseCargoMultiWorldConservation([world], carrier);
}

/**
 * One deterministic custody ledger across every touched regional world and
 * the single global carrier. Input order never affects the fingerprint, while
 * duplicate regions, parcel IDs, or durable identities fail closed.
 */
export function inspectLooseCargoMultiWorldConservation(
  worlds: readonly LooseCargoWorldState[],
  carrier: LooseCargoCarrierState,
): LooseCargoConservationSnapshot {
  // The legacy world/carrier API has always represented at least one touched
  // regional world. Actor-only custody intentionally uses the newer
  // multi-carrier API, which permits an empty world set.
  if (!Array.isArray(worlds) || worlds.length < 1) {
    return invalidConservationSnapshot("invalid-world-set");
  }
  return inspectLooseCargoMultiCarrierConservation(worlds, [carrier]);
}

/**
 * Canonical custody inspection across any number of actor carriers and any
 * number of touched regional worlds. The legacy single-carrier API delegates
 * here unchanged. Live lot identities must occur exactly once regardless of
 * input order; tombstones are evidence, not live substance.
 */
export function inspectLooseCargoMultiCarrierConservation(
  worlds: readonly LooseCargoWorldState[],
  carriers: readonly LooseCargoCarrierState[],
): LooseCargoConservationSnapshot {
  if (
    !Array.isArray(worlds)
    || worlds.length > LOOSE_CARGO_MAX_REGIONAL_WORLDS
  ) return invalidConservationSnapshot("invalid-world-set");
  if (
    !Array.isArray(carriers)
    || carriers.length < 1
    || carriers.length > LOOSE_CARGO_MAX_CARRIERS
  ) return invalidConservationSnapshot("invalid-carrier-set");
  const canonicalCarriers: LooseCargoCarrierState[] = [];
  const carrierOwnerKeys = new Set<string>();
  const terminalLotIds = new Set<string>();
  let carrierLotCount = 0;
  for (const carrier of carriers) {
    const validation = validateLooseCargoCarrier(carrier);
    if (!validation.valid || validation.carrier === null) {
      return invalidConservationSnapshot("invalid-carrier");
    }
    const key = looseCargoOwnerKey(validation.carrier.owner);
    if (carrierOwnerKeys.has(key)) {
      return invalidConservationSnapshot("duplicate-carrier-owner");
    }
    carrierOwnerKeys.add(key);
    carrierLotCount += validation.carrier.lots.length;
    if (
      !Number.isSafeInteger(carrierLotCount)
      || carrierLotCount > LOOSE_CARGO_MAX_MULTI_WORLD_MANIFEST_ENTRIES
    ) return invalidConservationSnapshot("invalid-carrier-set");
    for (const retiredLotId of validation.carrier.retiredLotIds) {
      if (terminalLotIds.has(retiredLotId)) {
        return invalidConservationSnapshot("duplicate-parcel-identity");
      }
      terminalLotIds.add(retiredLotId);
    }
    canonicalCarriers.push(validation.carrier);
  }
  canonicalCarriers.sort((left, right) => compareOwner(left.owner, right.owner));
  const canonicalWorlds: LooseCargoWorldState[] = [];
  const regionKeys = new Set<string>();
  const parcelIds = new Set<string>();
  const worldLotIds = new Set<string>();
  for (const world of worlds) {
    const validation = validateLooseCargoWorld(world);
    if (!validation.valid || validation.state === null) {
      return invalidConservationSnapshot("invalid-world");
    }
    const key = looseCargoRegionKey(validation.state.region);
    if (regionKeys.has(key)) return invalidConservationSnapshot("duplicate-region");
    regionKeys.add(key);
    if (
      parcelIds.size + validation.state.entities.length
      > LOOSE_CARGO_MAX_MULTI_WORLD_MANIFEST_ENTRIES
    ) return invalidConservationSnapshot("invalid-world-set");
    for (const entity of validation.state.entities) {
      if (parcelIds.has(entity.id)) {
        return invalidConservationSnapshot("duplicate-parcel-identity");
      }
      parcelIds.add(entity.id);
      const physicalLotId = entity.payload.kind === "provision"
        ? entity.payload.lotId
        : entity.id;
      if (terminalLotIds.has(physicalLotId) || worldLotIds.has(physicalLotId)) {
        return invalidConservationSnapshot("duplicate-parcel-identity");
      }
      worldLotIds.add(physicalLotId);
    }
    canonicalWorlds.push(validation.state);
  }
  canonicalWorlds.sort((left, right) => {
    const leftKey = looseCargoRegionKey(left.region);
    const rightKey = looseCargoRegionKey(right.region);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  const carrierLotIds = new Set<string>();
  for (const carrier of canonicalCarriers) {
    for (const lot of carrier.lots) {
      if (terminalLotIds.has(lot.id) || worldLotIds.has(lot.id) || carrierLotIds.has(lot.id)) {
        return invalidConservationSnapshot("duplicate-parcel-identity");
      }
      carrierLotIds.add(lot.id);
    }
  }
  const entries = new Map<string, LooseCargoManifestEntry>();
  const gearIds = new Set<number>();
  const promiseDefinitions = new Map<number, string>();
  const promiseQuantities = new Map<number, number>();
  const stackQuantities = new Map<CraftingStackId, number>();
  const provisionLotIds = new Set<string>();
  const addValue = (value: {
    readonly payload: LooseCargoPayload;
    readonly materialState: CargoEnvironmentState;
  }): LooseCargoConservationSnapshot | null => {
    if (value.payload.kind === "stack") {
      const quantity = (stackQuantities.get(value.payload.item) ?? 0) + value.payload.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > MAX_QUANTITY) {
        return invalidConservationSnapshot("duplicate-durable-identity");
      }
      stackQuantities.set(value.payload.item, quantity);
    } else if (value.payload.kind === "gear") {
      if (gearIds.has(value.payload.gearId)) {
        return invalidConservationSnapshot("duplicate-durable-identity");
      }
      gearIds.add(value.payload.gearId);
    } else if (value.payload.kind === "promise") {
      const definition = promiseDefinitionKey(value.payload);
      const prior = promiseDefinitions.get(value.payload.contractId);
      if (prior !== undefined && prior !== definition) {
        return invalidConservationSnapshot("duplicate-durable-identity");
      }
      promiseDefinitions.set(value.payload.contractId, definition);
      const quantity = (promiseQuantities.get(value.payload.contractId) ?? 0) + value.payload.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > MAX_QUANTITY) {
        return invalidConservationSnapshot("duplicate-durable-identity");
      }
      promiseQuantities.set(value.payload.contractId, quantity);
    } else if (value.payload.kind === "provision") {
      if (provisionLotIds.has(value.payload.lotId)) {
        return invalidConservationSnapshot("duplicate-durable-identity");
      }
      provisionLotIds.add(value.payload.lotId);
    }
    const payloadKey = manifestPayloadKey(value.payload, value.materialState);
    const quantity = payloadQuantity(value.payload);
    const loadMilli = looseCargoPayloadLoadMilli(value.payload);
    const prior = entries.get(payloadKey);
    const combinedQuantity = (prior?.quantity ?? 0) + quantity;
    const combinedLoad = (prior?.loadMilli ?? 0) + loadMilli;
    if (!Number.isSafeInteger(combinedQuantity) || !Number.isSafeInteger(combinedLoad)) {
      return invalidConservationSnapshot("duplicate-durable-identity");
    }
    entries.set(payloadKey, { payloadKey, quantity: combinedQuantity, loadMilli: combinedLoad });
    if (entries.size > LOOSE_CARGO_MAX_MULTI_WORLD_MANIFEST_ENTRIES) {
      return invalidConservationSnapshot("invalid-world-set");
    }
    return null;
  };
  for (const { entities } of canonicalWorlds) {
    for (const entity of entities) {
      const failure = addValue(entity);
      if (failure) return failure;
    }
  }
  for (const carrier of canonicalCarriers) {
    for (const lot of carrier.lots) {
      const failure = addValue(lot);
      if (failure) return failure;
    }
  }
  const canonicalEntries = [...entries.values()].sort((left, right) => left.payloadKey < right.payloadKey ? -1 : 1);
  let totalQuantity = 0;
  let totalLoadMilli = 0;
  for (const entry of canonicalEntries) {
    totalQuantity += entry.quantity;
    totalLoadMilli += entry.loadMilli;
    if (!Number.isSafeInteger(totalQuantity) || !Number.isSafeInteger(totalLoadMilli)) {
      return invalidConservationSnapshot("invalid-world-set");
    }
  }
  return {
    valid: true,
    reason: "valid",
    entries: canonicalEntries,
    totalQuantity,
    totalLoadMilli,
    fingerprint: stableStringify(canonicalEntries),
  };
}

export function proveLooseCargoConservation(
  beforeWorld: LooseCargoWorldState,
  beforeCarrier: LooseCargoCarrierState,
  afterWorld: LooseCargoWorldState,
  afterCarrier: LooseCargoCarrierState,
): LooseCargoConservationProof {
  const before = inspectLooseCargoConservation(beforeWorld, beforeCarrier);
  const after = inspectLooseCargoConservation(afterWorld, afterCarrier);
  return {
    conserved: before.valid
      && after.valid
      && before.totalQuantity === after.totalQuantity
      && before.totalLoadMilli === after.totalLoadMilli
      && before.fingerprint === after.fingerprint,
    before,
    after,
  };
}

export function proveLooseCargoMultiWorldConservation(
  beforeWorlds: readonly LooseCargoWorldState[],
  beforeCarrier: LooseCargoCarrierState,
  afterWorlds: readonly LooseCargoWorldState[],
  afterCarrier: LooseCargoCarrierState,
): LooseCargoConservationProof {
  const before = inspectLooseCargoMultiWorldConservation(beforeWorlds, beforeCarrier);
  const after = inspectLooseCargoMultiWorldConservation(afterWorlds, afterCarrier);
  return {
    conserved: before.valid
      && after.valid
      && before.totalQuantity === after.totalQuantity
      && before.totalLoadMilli === after.totalLoadMilli
      && before.fingerprint === after.fingerprint,
    before,
    after,
  };
}

export function proveLooseCargoMultiCarrierConservation(
  beforeWorlds: readonly LooseCargoWorldState[],
  beforeCarriers: readonly LooseCargoCarrierState[],
  afterWorlds: readonly LooseCargoWorldState[],
  afterCarriers: readonly LooseCargoCarrierState[],
): LooseCargoConservationProof {
  const before = inspectLooseCargoMultiCarrierConservation(beforeWorlds, beforeCarriers);
  const after = inspectLooseCargoMultiCarrierConservation(afterWorlds, afterCarriers);
  return {
    conserved: before.valid
      && after.valid
      && before.totalQuantity === after.totalQuantity
      && before.totalLoadMilli === after.totalLoadMilli
      && before.fingerprint === after.fingerprint,
    before,
    after,
  };
}

export function createLooseCargoExpectedManifest(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
): LooseCargoExpectedManifest {
  const snapshot = inspectLooseCargoConservation(world, carrier);
  if (!snapshot.valid) {
    throw new RangeError(`Cannot create expected parcel manifest: ${snapshot.reason}`);
  }
  return structuralManifest(snapshot);
}

export function validateLooseCargoExpectedManifest(
  expected: unknown,
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
): LooseCargoExpectedManifestValidation {
  const canonicalExpected = canonicalExpectedManifest(expected);
  if (canonicalExpected === null) {
    return { valid: false, reason: "invalid-expected", actual: null };
  }
  const snapshot = inspectLooseCargoConservation(world, carrier);
  if (!snapshot.valid) {
    return { valid: false, reason: "invalid-system", actual: null };
  }
  const actual = structuralManifest(snapshot);
  const valid = actual.fingerprint === canonicalExpected.fingerprint
    && actual.totalQuantity === canonicalExpected.totalQuantity
    && actual.totalLoadMilli === canonicalExpected.totalLoadMilli;
  return { valid, reason: valid ? "valid" : "manifest-mismatch", actual };
}

export function createLooseCargoMultiWorldExpectedManifest(
  worlds: readonly LooseCargoWorldState[],
  carrier: LooseCargoCarrierState,
): LooseCargoExpectedManifest {
  const snapshot = inspectLooseCargoMultiWorldConservation(worlds, carrier);
  if (!snapshot.valid) {
    throw new RangeError(`Cannot create regional expected parcel manifest: ${snapshot.reason}`);
  }
  return structuralManifest(snapshot);
}

export function createLooseCargoMultiCarrierExpectedManifest(
  worlds: readonly LooseCargoWorldState[],
  carriers: readonly LooseCargoCarrierState[],
): LooseCargoExpectedManifest {
  const snapshot = inspectLooseCargoMultiCarrierConservation(worlds, carriers);
  if (!snapshot.valid) {
    throw new RangeError(`Cannot create multi-carrier expected parcel manifest: ${snapshot.reason}`);
  }
  return structuralManifest(snapshot);
}

export function validateLooseCargoMultiWorldExpectedManifest(
  expected: unknown,
  worlds: readonly LooseCargoWorldState[],
  carrier: LooseCargoCarrierState,
): LooseCargoExpectedManifestValidation {
  const canonicalExpected = canonicalExpectedManifest(
    expected,
    LOOSE_CARGO_MAX_MULTI_WORLD_MANIFEST_ENTRIES,
  );
  if (canonicalExpected === null) {
    return { valid: false, reason: "invalid-expected", actual: null };
  }
  const snapshot = inspectLooseCargoMultiWorldConservation(worlds, carrier);
  if (!snapshot.valid) {
    return { valid: false, reason: "invalid-system", actual: null };
  }
  const actual = structuralManifest(snapshot);
  const valid = actual.fingerprint === canonicalExpected.fingerprint
    && actual.totalQuantity === canonicalExpected.totalQuantity
    && actual.totalLoadMilli === canonicalExpected.totalLoadMilli;
  return { valid, reason: valid ? "valid" : "manifest-mismatch", actual };
}

export function validateLooseCargoMultiCarrierExpectedManifest(
  expected: unknown,
  worlds: readonly LooseCargoWorldState[],
  carriers: readonly LooseCargoCarrierState[],
): LooseCargoExpectedManifestValidation {
  const canonicalExpected = canonicalExpectedManifest(
    expected,
    LOOSE_CARGO_MAX_MULTI_WORLD_MANIFEST_ENTRIES,
  );
  if (canonicalExpected === null) {
    return { valid: false, reason: "invalid-expected", actual: null };
  }
  const snapshot = inspectLooseCargoMultiCarrierConservation(worlds, carriers);
  if (!snapshot.valid) {
    return { valid: false, reason: "invalid-system", actual: null };
  }
  const actual = structuralManifest(snapshot);
  const valid = actual.fingerprint === canonicalExpected.fingerprint
    && actual.totalQuantity === canonicalExpected.totalQuantity
    && actual.totalLoadMilli === canonicalExpected.totalLoadMilli;
  return { valid, reason: valid ? "valid" : "manifest-mismatch", actual };
}

export function serializeLooseCargoExpectedManifest(manifest: LooseCargoExpectedManifest): string {
  const canonical = canonicalExpectedManifest(manifest);
  if (canonical === null) throw new RangeError("Cannot serialize invalid expected parcel manifest");
  return stableStringify(canonical);
}

export function deserializeLooseCargoExpectedManifest(text: string): LooseCargoExpectedManifest {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Expected parcel manifest is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
  const canonical = canonicalExpectedManifest(decoded);
  if (canonical === null) throw new Error("Expected parcel manifest is invalid");
  return canonical;
}

export function quoteLooseCargoDrop(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  request: LooseCargoDropRequest,
): LooseCargoTransferQuote {
  const context = transferContext(world, carrier, "drop");
  if (context.quote !== null) return context.quote;
  const canonicalWorld = context.world;
  const canonicalCarrier = context.carrier;
  if (!isRecord(request) || !validLotId(request.lotId)) {
    return failedQuote("drop", "invalid-request", canonicalWorld, canonicalCarrier);
  }
  const lot = canonicalCarrier.lots.find((candidate) => candidate.id === request.lotId);
  if (lot === undefined) {
    return failedQuote("drop", "lot-not-found", canonicalWorld, canonicalCarrier, request.lotId);
  }
  const payload = droppedPayload(
    lot.payload,
    request.quantity,
    "provision-fragment:quote",
  );
  if (payload === null) {
    return failedQuote("drop", "quantity-unavailable", canonicalWorld, canonicalCarrier, lot.id);
  }
  if (!validPosition(request.x, canonicalWorld.width) || !validPosition(request.y, canonicalWorld.height)) {
    return failedQuote("drop", "invalid-request", canonicalWorld, canonicalCarrier, lot.id);
  }
  if (canonicalWorld.entities.length >= LOOSE_CARGO_MAX_ENTITIES) {
    return failedQuote("drop", "entity-capacity-exceeded", canonicalWorld, canonicalCarrier, lot.id);
  }
  if (
    canonicalWorld.lastEntityOrdinal >= LOOSE_CARGO_MAX_ORDINAL
    || canonicalWorld.lastEventOrdinal >= LOOSE_CARGO_MAX_ORDINAL
    || canonicalWorld.revision >= LOOSE_CARGO_MAX_ORDINAL
    || canonicalCarrier.revision >= LOOSE_CARGO_MAX_ORDINAL
  ) {
    return failedQuote("drop", "id-space-exhausted", canonicalWorld, canonicalCarrier, lot.id);
  }
  const entityId = looseCargoEntityId(canonicalWorld.region, canonicalWorld.lastEntityOrdinal + 1);
  if (durableIdentityExists(canonicalWorld.entities, payload)) {
    return failedQuote("drop", "identity-conflict", canonicalWorld, canonicalCarrier, lot.id);
  }
  if (
    payloadRemovesWholeLot(lot.payload, payload)
    && !canonicalCarrier.retiredLotIds.includes(lot.id)
    && canonicalCarrier.retiredLotIds.length >= LOOSE_CARGO_MAX_RETIRED_LOTS
  ) return failedQuote("drop", "id-space-exhausted", canonicalWorld, canonicalCarrier, lot.id);
  const transferLoadMilli = looseCargoPayloadLoadMilli(payload);
  const loadBefore = looseCargoCarrierLoadUnchecked(canonicalCarrier);
  return {
    ok: true,
    direction: "drop",
    reason: "ready",
    worldRevision: canonicalWorld.revision,
    carrierRevision: canonicalCarrier.revision,
    entityId,
    lotId: lot.id,
    transferLoadMilli,
    carrierLoadBeforeMilli: loadBefore,
    carrierLoadAfterMilli: loadBefore - transferLoadMilli,
    message: `Drop ${describePayload(payload)} here. It will remain in the world.`,
  };
}

export function dropLooseCargo(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  request: LooseCargoDropRequest,
): LooseCargoTransferResult {
  const quote = quoteLooseCargoDrop(world, carrier, request);
  if (!quote.ok || quote.entityId === null || quote.lotId === null) {
    return { ...quote, world, carrier, entity: null, conservation: null };
  }
  const canonicalWorld = requireWorld(world);
  const canonicalCarrier = requireCarrier(carrier);
  const lot = canonicalCarrier.lots.find((candidate) => candidate.id === quote.lotId);
  if (lot === undefined) return { ...quote, ok: false, reason: "lot-not-found", world, carrier, entity: null, conservation: null };
  const payload = droppedPayload(
    lot.payload,
    request.quantity,
    provisionFragmentLotId(quote.entityId),
  );
  if (payload === null) return { ...quote, ok: false, reason: "quantity-unavailable", world, carrier, entity: null, conservation: null };
  const origin: LooseCargoOrigin = {
    region: canonicalWorld.region,
    ordinal: canonicalWorld.lastEntityOrdinal + 1,
  };
  const eventOrdinal = canonicalWorld.lastEventOrdinal + 1;
  const entity: LooseCargoEntity = {
    id: quote.entityId,
    origin,
    owner: canonicalCarrier.owner,
    payload,
    materialState: lot.materialState,
    x: request.x,
    y: request.y,
    velocityX: 0,
    velocityY: 0,
    motion: "resting",
    snaggedBy: null,
    causalSignature: "manual-release",
    lastEventOrdinal: eventOrdinal,
  };
  const lots = removeFromLot(canonicalCarrier.lots, lot, payload);
  const retiredLotIds = addRetiredLotIds(
    canonicalCarrier.retiredLotIds,
    lots.some((candidate) => candidate.id === lot.id) || lot.payload.kind === "provision"
      ? []
      : [lot.id],
  );
  if (retiredLotIds === null) {
    return {
      ...failedQuote("drop", "id-space-exhausted", canonicalWorld, canonicalCarrier, lot.id),
      world,
      carrier,
      entity: null,
      conservation: null,
    };
  }
  const appendedHistory = appendLooseCargoHistory(canonicalWorld, [createHistoryRecord(
    canonicalWorld,
    eventOrdinal,
    "drop",
    [entity.id],
    payload,
    null,
    positionOf(canonicalWorld, entity.x, entity.y),
    ["manual-release"],
    zeroEnvironmentChange(),
  )]);
  const nextWorld = trustWorldState({
    ...canonicalWorld,
    revision: canonicalWorld.revision + 1,
    lastEntityOrdinal: origin.ordinal,
    lastEventOrdinal: eventOrdinal,
    entities: [...canonicalWorld.entities, entity].sort(compareEntity),
    ...appendedHistory,
  });
  const nextCarrier: LooseCargoCarrierState = {
    ...canonicalCarrier,
    revision: canonicalCarrier.revision + 1,
    lots,
    retiredLotIds,
  };
  const conservation = proveLooseCargoConservation(
    canonicalWorld,
    canonicalCarrier,
    nextWorld,
    nextCarrier,
  );
  if (!conservation.conserved) {
    return {
      ...failedQuote("drop", "identity-conflict", canonicalWorld, canonicalCarrier, lot.id),
      world,
      carrier,
      entity: null,
      conservation,
    };
  }
  return {
    ...quote,
    world: nextWorld,
    carrier: nextCarrier,
    entity,
    conservation,
  };
}

/**
 * Atomically separate one carried lot into physical parcels. This is the fall
 * and forced-release entry point: every parcel starts at the carrier's exact
 * position, receives only its declared deterministic impulse, and either the
 * entire split commits or nothing changes.
 */
export function scatterLooseCargo(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  request: LooseCargoScatterRequest,
): LooseCargoScatterResult {
  const context = transferContext(world, carrier, "drop");
  if (context.quote !== null) {
    return failedScatter(context.quote.reason, world, carrier, context.quote.message);
  }
  const canonicalWorld = context.world;
  const canonicalCarrier = context.carrier;
  if (
    !isRecord(request)
    || !validLotId(request.lotId)
    || !validPosition(request.x, canonicalWorld.width)
    || !validPosition(request.y, canonicalWorld.height)
    || (request.cause !== "fall-separation" && request.cause !== "forced-release")
    || !Array.isArray(request.parts)
    || request.parts.length < 1
    || request.parts.length > 16
  ) {
    return failedScatter("invalid-request", world, carrier, "The parcel split request is invalid.");
  }
  const lot = canonicalCarrier.lots.find((candidate) => candidate.id === request.lotId);
  if (lot === undefined) {
    return failedScatter("lot-not-found", world, carrier, "That carried lot is no longer in the pack.");
  }
  if (durableIdentityExists(canonicalWorld.entities, lot.payload)) {
    return failedScatter("identity-conflict", world, carrier, "That durable identity already exists in the world.");
  }

  const parts: LooseCargoPayload[] = [];
  let stackQuantity = 0;
  for (const rawPart of request.parts as readonly unknown[]) {
    if (
      !isRecord(rawPart)
      || !validVelocity(rawPart.velocityX)
      || !validVelocity(rawPart.velocityY)
    ) {
      return failedScatter("invalid-request", world, carrier, "Every parcel impulse must be a bounded integer.");
    }
    if (
      lot.payload.kind === "stack"
      || lot.payload.kind === "promise"
      || lot.payload.kind === "provision"
    ) {
      if (!validQuantity(rawPart.quantity)) {
        return failedScatter("quantity-unavailable", world, carrier, "Every separated stack or Promise fragment needs an exact quantity.");
      }
      stackQuantity += rawPart.quantity;
      if (!Number.isSafeInteger(stackQuantity) || stackQuantity > lot.payload.quantity) {
        return failedScatter("quantity-unavailable", world, carrier, "The split exceeds the carried quantity.");
      }
      parts.push({ ...lot.payload, quantity: rawPart.quantity });
    } else {
      if (request.parts.length !== 1 || rawPart.quantity !== undefined) {
        return failedScatter("quantity-unavailable", world, carrier, "Durable gear cannot be split.");
      }
      parts.push(lot.payload);
    }
  }

  if (canonicalWorld.entities.length + request.parts.length > LOOSE_CARGO_MAX_ENTITIES) {
    return applyScatterCapacityImpact(canonicalWorld, canonicalCarrier, lot, request);
  }
  if (
    canonicalWorld.revision >= LOOSE_CARGO_MAX_ORDINAL
    || canonicalCarrier.revision >= LOOSE_CARGO_MAX_ORDINAL
    || !hasOrdinalSpace(canonicalWorld.lastEntityOrdinal, request.parts.length)
    || !hasOrdinalSpace(canonicalWorld.lastEventOrdinal, request.parts.length)
  ) {
    return failedScatter("id-space-exhausted", world, carrier, "No safe parcel or event identity remains.");
  }

  const entities: LooseCargoEntity[] = [];
  const records: LooseCargoHistoryRecord[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const sourcePayload = parts[index]!;
    const part = request.parts[index]!;
    const entityOrdinal = canonicalWorld.lastEntityOrdinal + index + 1;
    const eventOrdinal = canonicalWorld.lastEventOrdinal + index + 1;
    const origin: LooseCargoOrigin = { region: canonicalWorld.region, ordinal: entityOrdinal };
    const entityId = looseCargoEntityId(origin.region, origin.ordinal);
    const payload: LooseCargoPayload = sourcePayload.kind === "provision"
      ? {
          ...sourcePayload,
          lotId: request.parts.length === 1 && sourcePayload.quantity === payloadQuantity(lot.payload)
            ? sourcePayload.lotId
            : provisionFragmentLotId(entityId),
        }
      : sourcePayload;
    const entity: LooseCargoEntity = {
      id: entityId,
      origin,
      owner: canonicalCarrier.owner,
      payload,
      materialState: lot.materialState,
      x: request.x,
      y: request.y,
      velocityX: part.velocityX,
      velocityY: part.velocityY,
      motion: part.velocityX === 0 && part.velocityY === 0 ? "resting" : "tumbling",
      snaggedBy: null,
      causalSignature: request.cause,
      lastEventOrdinal: eventOrdinal,
    };
    entities.push(entity);
    records.push(createHistoryRecord(
      canonicalWorld,
      eventOrdinal,
      "scatter",
      [entity.id],
      payload,
      null,
      positionOf(canonicalWorld, entity.x, entity.y),
      [request.cause],
      zeroEnvironmentChange(),
    ));
  }
  const transferredPayload: LooseCargoPayload = lot.payload.kind === "stack"
    || lot.payload.kind === "promise"
    || lot.payload.kind === "provision"
    ? { ...lot.payload, quantity: stackQuantity }
    : lot.payload;
  const nextLots = removeFromLot(canonicalCarrier.lots, lot, transferredPayload);
  const retiredLotIds = addRetiredLotIds(
    canonicalCarrier.retiredLotIds,
    nextLots.some((candidate) => candidate.id === lot.id) || lot.payload.kind === "provision"
      ? []
      : [lot.id],
  );
  if (retiredLotIds === null) {
    return failedScatter("id-space-exhausted", world, carrier, "No safe retired source identity remains.");
  }
  const appendedHistory = appendLooseCargoHistory(canonicalWorld, records);
  const nextWorld = trustWorldState({
    ...canonicalWorld,
    revision: canonicalWorld.revision + 1,
    lastEntityOrdinal: canonicalWorld.lastEntityOrdinal + entities.length,
    lastEventOrdinal: canonicalWorld.lastEventOrdinal + records.length,
    entities: [...canonicalWorld.entities, ...entities].sort(compareEntity),
    ...appendedHistory,
  });
  const nextCarrier: LooseCargoCarrierState = {
    ...canonicalCarrier,
    revision: canonicalCarrier.revision + 1,
    lots: nextLots,
    retiredLotIds,
  };
  const conservation = proveLooseCargoConservation(
    canonicalWorld,
    canonicalCarrier,
    nextWorld,
    nextCarrier,
  );
  if (!conservation.conserved) {
    return failedScatter("identity-conflict", world, carrier, "The split failed its exact conservation check.", conservation);
  }
  return {
    ok: true,
    reason: "ready",
    world: nextWorld,
    carrier: nextCarrier,
    entities,
    message: `${entities.length} physical parcels separated and remain recoverable.`,
    conservation,
  };
}

export function quoteLooseCargoPickup(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  request: LooseCargoPickupRequest,
): LooseCargoTransferQuote {
  const context = transferContext(world, carrier, "pickup");
  if (context.quote !== null) return context.quote;
  const canonicalWorld = context.world;
  const canonicalCarrier = context.carrier;
  if (
    !isRecord(request)
    || !validEntityId(request.entityId)
    || !Number.isSafeInteger(request.reach)
    || request.reach < 0
    || request.reach > LOOSE_CARGO_MAX_PICKUP_REACH
    || !validPosition(request.x, canonicalWorld.width)
    || !validPosition(request.y, canonicalWorld.height)
  ) {
    return failedQuote("pickup", "invalid-request", canonicalWorld, canonicalCarrier);
  }
  const entity = canonicalWorld.entities.find((candidate) => candidate.id === request.entityId);
  if (entity === undefined) {
    return failedQuote("pickup", "entity-not-found", canonicalWorld, canonicalCarrier);
  }
  const matchingLot = findMatchingRecoveryLot(canonicalCarrier.lots, entity);
  const lotId = matchingLot?.id
    ?? (entity.payload.kind === "provision" ? entity.payload.lotId : `loose:${entity.id}`);
  if (Math.abs(entity.x - request.x) + Math.abs(entity.y - request.y) > request.reach) {
    return failedQuote("pickup", "out-of-reach", canonicalWorld, canonicalCarrier, lotId, entity.id);
  }
  if (entity.owner.kind !== "unclaimed" && !sameOwner(entity.owner, canonicalCarrier.owner)) {
    return failedQuote("pickup", "not-owner", canonicalWorld, canonicalCarrier, lotId, entity.id);
  }
  if (
    (matchingLot === undefined && canonicalCarrier.lots.some((lot) => lot.id === lotId))
    || (matchingLot === undefined && canonicalCarrier.retiredLotIds.includes(lotId))
    || durableIdentityExists(canonicalCarrier.lots.map(({ payload }) => ({ payload })), entity.payload)
  ) {
    return failedQuote("pickup", "identity-conflict", canonicalWorld, canonicalCarrier, lotId, entity.id);
  }
  if (
    canonicalWorld.lastEventOrdinal >= LOOSE_CARGO_MAX_ORDINAL
    || canonicalWorld.revision >= LOOSE_CARGO_MAX_ORDINAL
    || canonicalCarrier.revision >= LOOSE_CARGO_MAX_ORDINAL
  ) {
    return failedQuote("pickup", "id-space-exhausted", canonicalWorld, canonicalCarrier, lotId, entity.id);
  }
  const transferLoadMilli = looseCargoPayloadLoadMilli(entity.payload);
  const loadBefore = looseCargoCarrierLoadUnchecked(canonicalCarrier);
  if (loadBefore + transferLoadMilli > canonicalCarrier.capacityMilliLoad) {
    return failedQuote(
      "pickup",
      "capacity-exceeded",
      canonicalWorld,
      canonicalCarrier,
      lotId,
      entity.id,
      transferLoadMilli,
    );
  }
  return {
    ok: true,
    direction: "pickup",
    reason: "ready",
    worldRevision: canonicalWorld.revision,
    carrierRevision: canonicalCarrier.revision,
    entityId: entity.id,
    lotId,
    transferLoadMilli,
    carrierLoadBeforeMilli: loadBefore,
    carrierLoadAfterMilli: loadBefore + transferLoadMilli,
    message: `Recover ${describePayload(entity.payload)}.`,
  };
}

export function pickupLooseCargo(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  request: LooseCargoPickupRequest,
): LooseCargoTransferResult {
  const quote = quoteLooseCargoPickup(world, carrier, request);
  if (!quote.ok || quote.entityId === null || quote.lotId === null) {
    return { ...quote, world, carrier, entity: null, conservation: null };
  }
  const canonicalWorld = requireWorld(world);
  const canonicalCarrier = requireCarrier(carrier);
  const entity = canonicalWorld.entities.find((candidate) => candidate.id === quote.entityId);
  if (entity === undefined) return { ...quote, ok: false, reason: "entity-not-found", world, carrier, entity: null, conservation: null };
  const matchingLot = findMatchingRecoveryLot(canonicalCarrier.lots, entity);
  const recoveredLot: CarriedCargoLot = matchingLot === undefined
    ? { id: quote.lotId, payload: entity.payload, materialState: entity.materialState }
    : {
        ...matchingLot,
        payload: mergeQuantityPayload(matchingLot.payload, entity.payload),
      };
  const nextLots = matchingLot === undefined
    ? [...canonicalCarrier.lots, recoveredLot].sort(compareLot)
    : canonicalCarrier.lots.map((lot) => lot.id === matchingLot.id ? recoveredLot : lot);
  const eventOrdinal = canonicalWorld.lastEventOrdinal + 1;
  const kind: LooseCargoHistoryKind = matchingLot === undefined ? "pickup" : "merge";
  const appendedHistory = appendLooseCargoHistory(canonicalWorld, [createHistoryRecord(
    canonicalWorld,
    eventOrdinal,
    kind,
    [entity.id],
    entity.payload,
    positionOf(canonicalWorld, entity.x, entity.y),
    null,
    matchingLot === undefined ? ["recovery"] : ["recovery", "matching-stack-merge"],
    zeroEnvironmentChange(),
  )]);
  const nextWorld = trustWorldState({
    ...canonicalWorld,
    revision: canonicalWorld.revision + 1,
    lastEventOrdinal: eventOrdinal,
    entities: canonicalWorld.entities.filter((candidate) => candidate.id !== entity.id),
    ...appendedHistory,
  });
  const nextCarrier: LooseCargoCarrierState = {
    ...canonicalCarrier,
    revision: canonicalCarrier.revision + 1,
    lots: nextLots,
  };
  const conservation = proveLooseCargoConservation(
    canonicalWorld,
    canonicalCarrier,
    nextWorld,
    nextCarrier,
  );
  if (!conservation.conserved) {
    return {
      ...failedQuote("pickup", "identity-conflict", canonicalWorld, canonicalCarrier, quote.lotId, entity.id),
      world,
      carrier,
      entity: null,
      conservation,
    };
  }
  return {
    ...quote,
    lotId: recoveredLot.id,
    world: nextWorld,
    carrier: nextCarrier,
    entity,
    conservation,
  };
}

/**
 * Advance every world stack once. Samples are addressed by stable entity ID,
 * making output independent of either input array's order. The sample set must
 * cover every live ID exactly once; missing, duplicate, or unknown IDs fail the
 * entire step atomically so adapter omissions cannot grant hazard immunity.
 */
export function stepLooseCargo(
  world: LooseCargoWorldState,
  samples: readonly LooseCargoStepSample[],
): LooseCargoStepResult {
  const validation = validateLooseCargoWorld(world);
  if (!validation.valid || validation.state === null) {
    return { ok: false, reason: "invalid-world", state: world, events: [] };
  }
  const canonicalWorld = validation.state;
  if (
    canonicalWorld.revision >= LOOSE_CARGO_MAX_ORDINAL
    || canonicalWorld.completedSteps >= LOOSE_CARGO_MAX_ORDINAL
  ) {
    return { ok: false, reason: "revision-space-exhausted", state: world, events: [] };
  }
  const sampleMap = canonicalSamples(samples, canonicalWorld.entities);
  if (sampleMap === null) {
    return { ok: false, reason: "invalid-sample", state: world, events: [] };
  }
  const entities: LooseCargoEntity[] = [];
  const events: LooseCargoStepEvent[] = [];
  const records: LooseCargoHistoryRecord[] = [];
  for (const entity of canonicalWorld.entities) {
    const sample = sampleMap.get(entity.id)!;
    const effectiveEnvironment: CargoEnvironmentSample = {
      ...sample.environment,
      immersion: Math.max(sample.environment.immersion, sample.waterDepth),
    };
    const baseEvaluation = evaluateCargoEnvironment({
      property: looseCargoPayloadProperty(entity.payload),
      state: entity.materialState,
      environment: { ...effectiveEnvironment, impact: 0 },
    });
    const retainedX = multiplySigned(entity.velocityX, VELOCITY_RETENTION);
    const retainedY = multiplySigned(entity.velocityY, VELOCITY_RETENTION);
    const currentX = Math.trunc((baseEvaluation.force.x * CURRENT_ACCELERATION) / FIXED_POINT);
    const currentY = Math.trunc((baseEvaluation.force.y * CURRENT_ACCELERATION) / FIXED_POINT);
    const slopeX = Math.trunc((sample.downhillX * SLOPE_ACCELERATION) / FIXED_POINT);
    const slopeY = Math.trunc((sample.downhillY * SLOPE_ACCELERATION) / FIXED_POINT);
    const beforeSnagX = clampVelocity(retainedX + currentX + slopeX);
    const beforeSnagY = clampVelocity(retainedY + currentY + slopeY);
    const snagStrength = unionFixed(sample.mangroveSnag, sample.brambleSnag);
    let velocityX = settleVelocity(multiplySigned(beforeSnagX, FIXED_POINT - snagStrength));
    let velocityY = settleVelocity(multiplySigned(beforeSnagY, FIXED_POINT - snagStrength));
    const maximumX = canonicalWorld.width * LOOSE_CARGO_TILE_UNITS - 1;
    const maximumY = canonicalWorld.height * LOOSE_CARGO_TILE_UNITS - 1;
    const heldX = entity.motion === "boundary-rest"
      && ((entity.x === 0 && velocityX < 0) || (entity.x === maximumX && velocityX > 0));
    const heldY = entity.motion === "boundary-rest"
      && ((entity.y === 0 && velocityY < 0) || (entity.y === maximumY && velocityY > 0));
    if (heldX) velocityX = 0;
    if (heldY) velocityY = 0;
    const rawX = entity.x + velocityX;
    const rawY = entity.y + velocityY;
    const x = clamp(rawX, 0, maximumX);
    const y = clamp(rawY, 0, maximumY);
    const collidedX = x !== rawX;
    const collidedY = y !== rawY;
    const boundaryCollision = collidedX || collidedY || heldX || heldY;
    const boundaryImpact = collidedX || collidedY
      ? Math.trunc(
          (Math.max(collidedX ? Math.abs(velocityX) : 0, collidedY ? Math.abs(velocityY) : 0)
            * FIXED_POINT)
          / LOOSE_CARGO_MAX_VELOCITY,
        )
      : 0;
    if (collidedX) velocityX = 0;
    if (collidedY) velocityY = 0;
    // Mangroves arrest flood debris comparatively softly; thorny bramble can
    // turn the same arrest into a scrape or sudden jerk.
    const brambleImpact = Math.trunc(sample.brambleSnag / 5);
    const impactApplied = unit(Math.max(
      sample.environment.impact ?? 0,
      sample.tumbleImpact,
      boundaryImpact,
      brambleImpact,
    ));
    const evaluation = evaluateCargoEnvironment({
      property: looseCargoPayloadProperty(entity.payload),
      state: entity.materialState,
      environment: { ...effectiveEnvironment, impact: impactApplied },
    });
    const snags: readonly LooseCargoSnag[] = [
      ...(sample.mangroveSnag > 0 ? ["mangrove" as const] : []),
      ...(sample.brambleSnag > 0 ? ["bramble" as const] : []),
    ];
    const stopped = velocityX === 0 && velocityY === 0;
    const snaggedBy: LooseCargoSnag | null = stopped && snags.length > 0
      ? sample.brambleSnag >= sample.mangroveSnag ? "bramble" : "mangrove"
      : null;
    const currentActive = baseEvaluation.force.x !== 0 || baseEvaluation.force.y !== 0;
    const gradeActive = sample.downhillX !== 0 || sample.downhillY !== 0;
    const motion: LooseCargoMotion = snaggedBy !== null
      ? "snagged"
      : boundaryCollision && stopped
        ? "boundary-rest"
        : stopped
          ? "resting"
          : gradeActive
            ? "tumbling"
            : currentActive
              ? "drifting"
              : "tumbling";
    const causalCodes = canonicalCauseCodes([
      ...evaluation.causes.map(({ code }) => code),
      ...(gradeActive ? ["grade-tumble" as const] : []),
      ...(sample.tumbleImpact > 0 ? ["rock-impact" as const] : []),
      ...(sample.mangroveSnag > 0 ? ["mangrove-snag" as const] : []),
      ...(sample.brambleSnag > 0 ? ["bramble-snag" as const] : []),
      ...(entity.velocityX !== 0 || entity.velocityY !== 0 ? ["parcel-momentum" as const] : []),
      ...(boundaryCollision ? ["region-boundary-rest" as const] : []),
    ]);
    const causalSignature = causalSignatureFor(causalCodes, impactApplied);
    const crossedTile = tileIndexAt(entity.x, entity.y, canonicalWorld.width)
      !== tileIndexAt(x, y, canonicalWorld.width);
    const recordable = crossedTile
      || collidedX
      || collidedY
      || causalSignature !== entity.causalSignature
      || materialThresholdBand(entity.materialState) !== materialThresholdBand(evaluation.nextState);
    if (recordable && (
      !hasOrdinalSpace(canonicalWorld.lastEventOrdinal, records.length + 1)
    )) {
      return { ok: false, reason: "history-capacity-exceeded", state: world, events: [] };
    }
    const eventOrdinal = recordable ? canonicalWorld.lastEventOrdinal + records.length + 1 : null;
    const eventId = eventOrdinal === null ? null : looseCargoEventId(canonicalWorld.region, eventOrdinal);
    const nextEntity: LooseCargoEntity = {
      ...entity,
      materialState: evaluation.nextState,
      x,
      y,
      velocityX,
      velocityY,
      motion,
      snaggedBy,
      causalSignature,
      lastEventOrdinal: eventOrdinal ?? entity.lastEventOrdinal,
    };
    entities.push(nextEntity);
    const stepEvent: LooseCargoStepEvent = {
      eventId,
      eventOrdinal,
      entityId: entity.id,
      fromTileIndex: tileIndexAt(entity.x, entity.y, canonicalWorld.width),
      toTileIndex: tileIndexAt(x, y, canonicalWorld.width),
      moved: x !== entity.x || y !== entity.y,
      boundaryCollision,
      impactApplied,
      snags,
      conditionLoss: evaluation.change.conditionLoss,
      causes: evaluation.causes.map(({ code }) => code),
      causalCodes,
      motion,
    };
    events.push(stepEvent);
    if (eventOrdinal !== null) {
      records.push(createHistoryRecord(
        canonicalWorld,
        eventOrdinal,
        "environment",
        [entity.id],
        entity.payload,
        positionOf(canonicalWorld, entity.x, entity.y),
        positionOf(canonicalWorld, x, y),
        causalCodes.length > 0 ? causalCodes : ["parcel-settled"],
        evaluation.change,
      ));
    }
  }
  if (!hasOrdinalSpace(canonicalWorld.lastEventOrdinal, records.length)) {
    return { ok: false, reason: "history-capacity-exceeded", state: world, events: [] };
  }
  const appendedHistory = appendLooseCargoHistory(canonicalWorld, records);
  return {
    ok: true,
    reason: "advanced",
    state: trustWorldState({
      ...canonicalWorld,
      revision: canonicalWorld.revision + 1,
      completedSteps: canonicalWorld.completedSteps + 1,
      lastEventOrdinal: canonicalWorld.lastEventOrdinal + records.length,
      entities,
      ...appendedHistory,
    }),
    events,
  };
}

interface RegionalEntityAdvance {
  readonly sourceWorld: LooseCargoWorldState;
  readonly entity: LooseCargoEntity;
  readonly sample: LooseCargoStepSample;
  readonly destinationRegion: LooseCargoRegionAddress;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly materialState: CargoEnvironmentState;
  readonly motion: LooseCargoMotion;
  readonly snaggedBy: LooseCargoSnag | null;
  readonly causalSignature: string;
  readonly causalCodes: readonly LooseCargoCauseCode[];
  readonly environmentCauses: readonly CargoEnvironmentCauseCode[];
  readonly conditionLoss: number;
  readonly contaminationGain: number;
  readonly decayGain: number;
  readonly impactApplied: number;
  readonly snags: readonly LooseCargoSnag[];
  readonly recordable: boolean;
}

type RegionalHistoryRole = "local" | "outbound" | "inbound";

interface RegionalHistoryPlan {
  readonly role: RegionalHistoryRole;
  readonly advance: RegionalEntityAdvance;
}

interface RegionalEventOrdinals {
  local?: number;
  outbound?: number;
  inbound?: number;
}

/**
 * Advance an explicitly selected simulation neighborhood as one immutable
 * transaction. Storage-region edges are ownership boundaries only: a parcel's
 * un-clamped position is normalized into the cardinal/corner neighbor while
 * its stable identity, origin, payload, material state, and velocity survive.
 *
 * `worlds` must include any already-touched neighbor that a selected parcel
 * can enter. Missing destinations are treated as pristine generated storage;
 * the physical-cargo sidecar adapter below supplies all eight neighbors so it
 * can never accidentally replace a persisted destination.
 */
export function stepLooseCargoAcrossRegions(
  worlds: readonly LooseCargoWorldState[],
  inputs: readonly LooseCargoRegionalStepInput[],
): LooseCargoRegionalStepResult {
  if (
    !Array.isArray(worlds)
    || worlds.length < 1
    || worlds.length > LOOSE_CARGO_MAX_ATOMIC_REGIONS
    || !Array.isArray(inputs)
    || inputs.length < 1
    || inputs.length > LOOSE_CARGO_MAX_ATOMIC_REGIONS
  ) return failedRegionalStep("invalid-world-set", worlds);

  const canonicalWorlds: LooseCargoWorldState[] = [];
  const worldByKey = new Map<string, LooseCargoWorldState>();
  let width: number | null = null;
  let height: number | null = null;
  for (const rawWorld of worlds) {
    const validation = validateLooseCargoWorld(rawWorld);
    if (!validation.valid || !validation.state) {
      return failedRegionalStep("invalid-world-set", worlds);
    }
    const world = validation.state;
    if (
      (width !== null && world.width !== width)
      || (height !== null && world.height !== height)
    ) return failedRegionalStep("invalid-world-set", worlds);
    width = world.width;
    height = world.height;
    const key = looseCargoRegionKey(world.region);
    if (worldByKey.has(key)) return failedRegionalStep("invalid-world-set", worlds);
    worldByKey.set(key, world);
    canonicalWorlds.push(world);
  }
  canonicalWorlds.sort(compareWorldRegion);
  const emptyCarrier = createLooseCargoCarrier(
    { kind: "unclaimed" },
    createCraftingInventory(0),
  );
  if (!inspectLooseCargoMultiWorldConservation(canonicalWorlds, emptyCarrier).valid) {
    return failedRegionalStep("invalid-world-set", worlds);
  }

  const advances: RegionalEntityAdvance[] = [];
  const inputRegionKeys = new Set<string>();
  let sampledEntities = 0;
  for (const rawInput of inputs as readonly unknown[]) {
    if (!isRecord(rawInput)) return failedRegionalStep("invalid-sample", worlds);
    const region = canonicalRegionAddress(rawInput.region);
    if (
      region === null
      || !validCounter(rawInput.expectedRevision)
      || !Array.isArray(rawInput.samples)
      || rawInput.samples.length < 1
      || rawInput.samples.length > LOOSE_CARGO_MAX_ENTITIES
    ) return failedRegionalStep("invalid-sample", worlds);
    const key = looseCargoRegionKey(region);
    if (inputRegionKeys.has(key)) return failedRegionalStep("invalid-sample", worlds);
    inputRegionKeys.add(key);
    const sourceWorld = worldByKey.get(key);
    if (!sourceWorld) return failedRegionalStep("invalid-world-set", worlds);
    if (sourceWorld.revision !== rawInput.expectedRevision) {
      return failedRegionalStep("stale-step", worlds);
    }
    if (
      sourceWorld.revision >= LOOSE_CARGO_MAX_ORDINAL
      || sourceWorld.completedSteps >= LOOSE_CARGO_MAX_ORDINAL
    ) return failedRegionalStep("revision-space-exhausted", worlds);

    const entityById = new Map(sourceWorld.entities.map((entity) => [entity.id, entity]));
    const selected: LooseCargoEntity[] = [];
    const selectedIds = new Set<string>();
    for (const rawSample of rawInput.samples as readonly unknown[]) {
      if (!isRecord(rawSample) || !validEntityId(rawSample.entityId)) {
        return failedRegionalStep("invalid-sample", worlds);
      }
      const entity = entityById.get(rawSample.entityId);
      if (!entity || selectedIds.has(entity.id)) {
        return failedRegionalStep("invalid-sample", worlds);
      }
      selectedIds.add(entity.id);
      selected.push(entity);
    }
    const sampleMap = canonicalSamples(
      rawInput.samples as readonly LooseCargoStepSample[],
      selected,
    );
    if (!sampleMap) return failedRegionalStep("invalid-sample", worlds);
    sampledEntities += selected.length;
    if (sampledEntities > LOOSE_CARGO_MAX_ATOMIC_ENTITIES) {
      return failedRegionalStep("invalid-sample", worlds);
    }
    for (const entity of selected) {
      const advance = advanceLooseCargoAcrossRegion(
        sourceWorld,
        entity,
        sampleMap.get(entity.id)!,
      );
      if (!advance) return failedRegionalStep("coordinate-space-exhausted", worlds);
      advances.push(advance);
    }
  }
  advances.sort((left, right) => compareEntity(left.entity, right.entity));

  // Materialize only destinations that are actually crossed into. A caller
  // that supplied a persisted neighbor wins over the deterministic empty one.
  for (const advance of advances) {
    if (sameRegion(advance.sourceWorld.region, advance.destinationRegion)) continue;
    const key = looseCargoRegionKey(advance.destinationRegion);
    if (!worldByKey.has(key)) {
      if (worldByKey.size >= LOOSE_CARGO_MAX_ATOMIC_REGIONS) {
        return failedRegionalStep("invalid-world-set", worlds);
      }
      worldByKey.set(key, createLooseCargoWorld(
        advance.sourceWorld.width,
        advance.sourceWorld.height,
        advance.destinationRegion,
      ));
    }
  }

  const entityCounts = new Map(
    [...worldByKey].map(([key, world]) => [key, world.entities.length]),
  );
  for (const advance of advances) {
    const sourceKey = looseCargoRegionKey(advance.sourceWorld.region);
    const destinationKey = looseCargoRegionKey(advance.destinationRegion);
    if (sourceKey === destinationKey) continue;
    entityCounts.set(sourceKey, (entityCounts.get(sourceKey) ?? 0) - 1);
    entityCounts.set(destinationKey, (entityCounts.get(destinationKey) ?? 0) + 1);
  }
  if ([...entityCounts.values()].some((count) => count < 0 || count > LOOSE_CARGO_MAX_ENTITIES)) {
    return failedRegionalStep("entity-capacity-exceeded", worlds);
  }

  const plansByRegion = new Map<string, RegionalHistoryPlan[]>();
  const selectedByRegion = new Map<string, RegionalEntityAdvance[]>();
  const addPlan = (key: string, plan: RegionalHistoryPlan) => {
    const plans = plansByRegion.get(key) ?? [];
    plans.push(plan);
    plansByRegion.set(key, plans);
  };
  for (const advance of advances) {
    const sourceKey = looseCargoRegionKey(advance.sourceWorld.region);
    const destinationKey = looseCargoRegionKey(advance.destinationRegion);
    const selected = selectedByRegion.get(sourceKey) ?? [];
    selected.push(advance);
    selectedByRegion.set(sourceKey, selected);
    if (sourceKey === destinationKey) {
      if (advance.recordable) addPlan(sourceKey, { role: "local", advance });
    } else {
      addPlan(sourceKey, { role: "outbound", advance });
      addPlan(destinationKey, { role: "inbound", advance });
    }
  }

  const ordinalsByEntity = new Map<LooseCargoEntityId, RegionalEventOrdinals>();
  for (const [key, plans] of plansByRegion) {
    const world = worldByKey.get(key)!;
    plans.sort(compareRegionalHistoryPlan);
    if (
      world.revision >= LOOSE_CARGO_MAX_ORDINAL
      || !hasOrdinalSpace(world.lastEventOrdinal, plans.length)
    ) return failedRegionalStep("history-capacity-exceeded", worlds);
    plans.forEach((plan, index) => {
      const ordinal = world.lastEventOrdinal + index + 1;
      const ordinals = ordinalsByEntity.get(plan.advance.entity.id) ?? {};
      ordinals[plan.role] = ordinal;
      ordinalsByEntity.set(plan.advance.entity.id, ordinals);
    });
  }

  const nextWorlds: LooseCargoWorldState[] = [];
  for (const [key, world] of worldByKey) {
    const selected = selectedByRegion.get(key) ?? [];
    const plans = plansByRegion.get(key) ?? [];
    const inbound = plans.filter(({ role }) => role === "inbound");
    if (selected.length === 0 && inbound.length === 0) {
      nextWorlds.push(world);
      continue;
    }
    const advanceByEntity = new Map(selected.map((advance) => [advance.entity.id, advance]));
    const entities: LooseCargoEntity[] = [];
    for (const entity of world.entities) {
      const advance = advanceByEntity.get(entity.id);
      if (!advance) {
        entities.push(entity);
        continue;
      }
      if (!sameRegion(world.region, advance.destinationRegion)) continue;
      const ordinal = ordinalsByEntity.get(entity.id)?.local;
      entities.push(regionalSuccessorEntity(advance, ordinal ?? entity.lastEventOrdinal));
    }
    for (const { advance } of inbound) {
      const ordinal = ordinalsByEntity.get(advance.entity.id)?.inbound;
      if (ordinal === undefined) {
        return failedRegionalStep("history-capacity-exceeded", worlds);
      }
      entities.push(regionalSuccessorEntity(advance, ordinal));
    }
    entities.sort(compareEntity);

    const records = plans.map((plan) => regionalHistoryRecord(
      world,
      plan,
      ordinalsByEntity.get(plan.advance.entity.id)?.[plan.role],
    ));
    if (records.some((record) => record === null)) {
      return failedRegionalStep("history-capacity-exceeded", worlds);
    }
    const appendedHistory = appendLooseCargoHistory(
      world,
      records as LooseCargoHistoryRecord[],
    );
    nextWorlds.push(trustWorldState({
      ...world,
      revision: world.revision + 1,
      completedSteps: world.completedSteps + (selected.length > 0 ? 1 : 0),
      lastEventOrdinal: world.lastEventOrdinal + records.length,
      entities,
      ...appendedHistory,
    }));
  }
  nextWorlds.sort(compareWorldRegion);
  if (!inspectLooseCargoMultiWorldConservation(nextWorlds, emptyCarrier).valid) {
    return failedRegionalStep("invalid-world-set", worlds);
  }

  const events: LooseCargoRegionalStepEvent[] = advances.map((advance) => {
    const crossedRegion = !sameRegion(advance.sourceWorld.region, advance.destinationRegion);
    const ordinals = ordinalsByEntity.get(advance.entity.id);
    const eventOrdinal = crossedRegion ? ordinals?.inbound : ordinals?.local;
    const eventRegion = crossedRegion ? advance.destinationRegion : advance.sourceWorld.region;
    const from = positionOf(advance.sourceWorld, advance.entity.x, advance.entity.y);
    const to: LooseCargoPosition = {
      region: advance.destinationRegion,
      x: advance.x,
      y: advance.y,
    };
    return {
      eventId: eventOrdinal === undefined ? null : looseCargoEventId(eventRegion, eventOrdinal),
      eventOrdinal: eventOrdinal ?? null,
      entityId: advance.entity.id,
      fromTileIndex: tileIndexAt(
        advance.entity.x,
        advance.entity.y,
        advance.sourceWorld.width,
      ),
      toTileIndex: tileIndexAt(advance.x, advance.y, advance.sourceWorld.width),
      moved: crossedRegion || advance.x !== advance.entity.x || advance.y !== advance.entity.y,
      boundaryCollision: false,
      impactApplied: advance.impactApplied,
      snags: advance.snags,
      conditionLoss: advance.conditionLoss,
      causes: advance.environmentCauses,
      causalCodes: crossedRegion
        ? canonicalCauseCodes([...advance.causalCodes, "storage-handoff"])
        : advance.causalCodes,
      motion: advance.motion,
      from,
      to,
      crossedRegion,
    };
  });
  const handoffs: LooseCargoRegionHandoff[] = advances.flatMap((advance) => {
    if (sameRegion(advance.sourceWorld.region, advance.destinationRegion)) return [];
    const ordinals = ordinalsByEntity.get(advance.entity.id);
    if (ordinals?.outbound === undefined || ordinals.inbound === undefined) return [];
    return [{
      entityId: advance.entity.id,
      from: positionOf(advance.sourceWorld, advance.entity.x, advance.entity.y),
      to: { region: advance.destinationRegion, x: advance.x, y: advance.y },
      sourceEventId: looseCargoEventId(advance.sourceWorld.region, ordinals.outbound),
      destinationEventId: looseCargoEventId(advance.destinationRegion, ordinals.inbound),
    }];
  });
  return { ok: true, reason: "advanced", worlds: nextWorlds, events, handoffs };
}

function advanceLooseCargoAcrossRegion(
  sourceWorld: LooseCargoWorldState,
  entity: LooseCargoEntity,
  sample: LooseCargoStepSample,
): RegionalEntityAdvance | null {
  const effectiveEnvironment: CargoEnvironmentSample = {
    ...sample.environment,
    immersion: Math.max(sample.environment.immersion, sample.waterDepth),
  };
  const baseEvaluation = evaluateCargoEnvironment({
    property: looseCargoPayloadProperty(entity.payload),
    state: entity.materialState,
    environment: { ...effectiveEnvironment, impact: 0 },
  });
  const retainedX = multiplySigned(entity.velocityX, VELOCITY_RETENTION);
  const retainedY = multiplySigned(entity.velocityY, VELOCITY_RETENTION);
  const currentX = Math.trunc((baseEvaluation.force.x * CURRENT_ACCELERATION) / FIXED_POINT);
  const currentY = Math.trunc((baseEvaluation.force.y * CURRENT_ACCELERATION) / FIXED_POINT);
  const slopeX = Math.trunc((sample.downhillX * SLOPE_ACCELERATION) / FIXED_POINT);
  const slopeY = Math.trunc((sample.downhillY * SLOPE_ACCELERATION) / FIXED_POINT);
  const beforeSnagX = clampVelocity(retainedX + currentX + slopeX);
  const beforeSnagY = clampVelocity(retainedY + currentY + slopeY);
  const snagStrength = unionFixed(sample.mangroveSnag, sample.brambleSnag);
  const velocityX = settleVelocity(multiplySigned(beforeSnagX, FIXED_POINT - snagStrength));
  const velocityY = settleVelocity(multiplySigned(beforeSnagY, FIXED_POINT - snagStrength));
  const normalized = normalizeLooseCargoRegionalPosition(
    sourceWorld,
    entity.x + velocityX,
    entity.y + velocityY,
  );
  if (!normalized) return null;
  const brambleImpact = Math.trunc(sample.brambleSnag / 5);
  const impactApplied = unit(Math.max(
    sample.environment.impact ?? 0,
    sample.tumbleImpact,
    brambleImpact,
  ));
  const evaluation = evaluateCargoEnvironment({
    property: looseCargoPayloadProperty(entity.payload),
    state: entity.materialState,
    environment: { ...effectiveEnvironment, impact: impactApplied },
  });
  const snags: readonly LooseCargoSnag[] = [
    ...(sample.mangroveSnag > 0 ? ["mangrove" as const] : []),
    ...(sample.brambleSnag > 0 ? ["bramble" as const] : []),
  ];
  const stopped = velocityX === 0 && velocityY === 0;
  const snaggedBy: LooseCargoSnag | null = stopped && snags.length > 0
    ? sample.brambleSnag >= sample.mangroveSnag ? "bramble" : "mangrove"
    : null;
  const currentActive = baseEvaluation.force.x !== 0 || baseEvaluation.force.y !== 0;
  const gradeActive = sample.downhillX !== 0 || sample.downhillY !== 0;
  const motion: LooseCargoMotion = snaggedBy !== null
    ? "snagged"
    : stopped
      ? "resting"
      : gradeActive
        ? "tumbling"
        : currentActive
          ? "drifting"
          : "tumbling";
  const causalCodes = canonicalCauseCodes([
    ...evaluation.causes.map(({ code }) => code),
    ...(gradeActive ? ["grade-tumble" as const] : []),
    ...(sample.tumbleImpact > 0 ? ["rock-impact" as const] : []),
    ...(sample.mangroveSnag > 0 ? ["mangrove-snag" as const] : []),
    ...(sample.brambleSnag > 0 ? ["bramble-snag" as const] : []),
    ...(entity.velocityX !== 0 || entity.velocityY !== 0 ? ["parcel-momentum" as const] : []),
  ]);
  const causalSignature = causalSignatureFor(causalCodes, impactApplied);
  const crossedRegion = !sameRegion(sourceWorld.region, normalized.region);
  const crossedTile = crossedRegion
    || tileIndexAt(entity.x, entity.y, sourceWorld.width)
      !== tileIndexAt(normalized.x, normalized.y, sourceWorld.width);
  return {
    sourceWorld,
    entity,
    sample,
    destinationRegion: normalized.region,
    x: normalized.x,
    y: normalized.y,
    velocityX,
    velocityY,
    materialState: evaluation.nextState,
    motion,
    snaggedBy,
    causalSignature,
    causalCodes,
    environmentCauses: evaluation.causes.map(({ code }) => code),
    conditionLoss: evaluation.change.conditionLoss,
    contaminationGain: evaluation.change.contaminationGain,
    decayGain: evaluation.change.decayGain,
    impactApplied,
    snags,
    recordable: crossedTile
      || causalSignature !== entity.causalSignature
      || materialThresholdBand(entity.materialState) !== materialThresholdBand(evaluation.nextState),
  };
}

function normalizeLooseCargoRegionalPosition(
  world: LooseCargoWorldState,
  rawX: number,
  rawY: number,
): LooseCargoPosition | null {
  if (!Number.isSafeInteger(rawX) || !Number.isSafeInteger(rawY)) return null;
  const spanX = world.width * LOOSE_CARGO_TILE_UNITS;
  const spanY = world.height * LOOSE_CARGO_TILE_UNITS;
  const regionDeltaX = Math.floor(rawX / spanX);
  const regionDeltaY = Math.floor(rawY / spanY);
  const regionX = world.region.x + regionDeltaX;
  const regionY = world.region.y + regionDeltaY;
  if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return null;
  const x = rawX - regionDeltaX * spanX;
  const y = rawY - regionDeltaY * spanY;
  const region = canonicalRegionAddress({
    x: Object.is(regionX, -0) ? 0 : regionX,
    y: Object.is(regionY, -0) ? 0 : regionY,
  });
  if (region === null || !validPosition(x, world.width) || !validPosition(y, world.height)) {
    return null;
  }
  return { region, x, y };
}

function regionalSuccessorEntity(
  advance: RegionalEntityAdvance,
  lastEventOrdinal: number,
): LooseCargoEntity {
  return {
    ...advance.entity,
    materialState: advance.materialState,
    x: advance.x,
    y: advance.y,
    velocityX: advance.velocityX,
    velocityY: advance.velocityY,
    motion: advance.motion,
    snaggedBy: advance.snaggedBy,
    causalSignature: advance.causalSignature,
    lastEventOrdinal,
  };
}

function regionalHistoryRecord(
  world: LooseCargoWorldState,
  plan: RegionalHistoryPlan,
  ordinal: number | undefined,
): LooseCargoHistoryRecord | null {
  if (ordinal === undefined) return null;
  const { advance } = plan;
  if (plan.role === "local") {
    return createHistoryRecord(
      world,
      ordinal,
      "environment",
      [advance.entity.id],
      advance.entity.payload,
      positionOf(world, advance.entity.x, advance.entity.y),
      positionOf(world, advance.x, advance.y),
      advance.causalCodes.length > 0 ? advance.causalCodes : ["parcel-settled"],
      {
        conditionLoss: advance.conditionLoss,
        contaminationGain: advance.contaminationGain,
        decayGain: advance.decayGain,
      },
    );
  }
  if (plan.role === "outbound") {
    return createHistoryRecord(
      world,
      ordinal,
      "handoff",
      [advance.entity.id],
      advance.entity.payload,
      positionOf(world, advance.entity.x, advance.entity.y),
      null,
      canonicalCauseCodes([...advance.causalCodes, "storage-handoff"]),
      {
        conditionLoss: advance.conditionLoss,
        contaminationGain: advance.contaminationGain,
        decayGain: advance.decayGain,
      },
    );
  }
  return createHistoryRecord(
    world,
    ordinal,
    "handoff",
    [advance.entity.id],
    advance.entity.payload,
    null,
    positionOf(world, advance.x, advance.y),
    ["storage-handoff"],
    zeroEnvironmentChange(),
  );
}

function compareRegionalHistoryPlan(
  left: RegionalHistoryPlan,
  right: RegionalHistoryPlan,
): number {
  const entityOrder = compareEntity(left.advance.entity, right.advance.entity);
  if (entityOrder !== 0) return entityOrder;
  const roleOrder: Readonly<Record<RegionalHistoryRole, number>> = {
    outbound: 0,
    local: 1,
    inbound: 2,
  };
  return roleOrder[left.role] - roleOrder[right.role];
}

function compareWorldRegion(
  left: LooseCargoWorldState,
  right: LooseCargoWorldState,
): number {
  const leftKey = looseCargoRegionKey(left.region);
  const rightKey = looseCargoRegionKey(right.region);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function failedRegionalStep(
  reason: Exclude<LooseCargoRegionalStepReason, "advanced">,
  worlds: readonly LooseCargoWorldState[],
): LooseCargoRegionalStepResult {
  return { ok: false, reason, worlds, events: [], handoffs: [] };
}

function pristineMaterialState(): CargoEnvironmentState {
  return { condition: FIXED_POINT, contamination: 0, decay: 0 };
}

function promiseProperty(resource: ResourceKind): CargoEnvironmentProperty {
  switch (resource) {
    case "medicine": return "fragile";
    case "food": return "perishable";
    case "freshWater":
    case "parts": return "heavy";
    case "reed": return "ordinary";
  }
}

function canonicalPayload(value: unknown): LooseCargoPayload | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "stack") {
    if (!STACK_ID_SET.has(value.item as string) || !validQuantity(value.quantity)) return null;
    return {
      kind: "stack",
      item: value.item as CraftingStackId,
      quantity: value.quantity,
    };
  }
  if (value.kind === "gear") {
    if (!validIdentity(value.gearId) || !GEAR_KIND_SET.has(value.gearKind as string)) return null;
    return {
      kind: "gear",
      gearId: value.gearId,
      gearKind: value.gearKind as CraftedGearKind,
    };
  }
  if (value.kind === "promise") {
    if (
      !validIdentity(value.contractId)
      || !RESOURCE_KIND_SET.has(value.resource as string)
      || !validQuantity(value.quantity)
      || value.property !== promiseProperty(value.resource as ResourceKind)
    ) return null;
    return {
      kind: "promise",
      contractId: value.contractId,
      resource: value.resource as ResourceKind,
      quantity: value.quantity,
      property: value.property,
    };
  }
  if (value.kind === "provision") {
    if (
      !validLotId(value.lotId)
      || !PROVISION_KIND_SET.has(value.provision as string)
      || !validQuantity(value.quantity)
    ) return null;
    return {
      kind: "provision",
      lotId: value.lotId,
      provision: value.provision as ProvisionKind,
      quantity: value.quantity,
    };
  }
  return null;
}

function canonicalMaterialState(value: unknown): CargoEnvironmentState | null {
  if (!isRecord(value)) return null;
  if (!validUnit(value.condition) || !validUnit(value.contamination) || !validUnit(value.decay)) {
    return null;
  }
  return {
    condition: value.condition,
    contamination: value.contamination,
    decay: value.decay,
  };
}

function canonicalOwner(value: unknown): LooseCargoOwner | null {
  if (!isRecord(value)) return null;
  if (value.kind === "unclaimed") return { kind: "unclaimed" };
  if (
    value.kind === "player"
    && typeof value.id === "string"
    && value.id.length > 0
    && value.id.length <= 128
    && value.id.trim() === value.id
  ) {
    return { kind: "player", id: value.id };
  }
  if (
    value.kind === "actor"
    && typeof value.id === "string"
    && value.id.length <= ACTOR_ID_MAX_LENGTH
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(value.id)
  ) {
    return { kind: "actor", id: value.id };
  }
  if (value.kind === "settlement" && validIdentity(value.id)) {
    return { kind: "settlement", id: value.id };
  }
  return null;
}

function canonicalRegionAddress(value: unknown): LooseCargoRegionAddress | null {
  if (
    !isRecord(value)
    || !Number.isSafeInteger(value.x)
    || !Number.isSafeInteger(value.y)
    || Object.is(value.x, -0)
    || Object.is(value.y, -0)
  ) return null;
  return { x: value.x, y: value.y };
}

function canonicalOrigin(value: unknown): LooseCargoOrigin | null {
  if (!isRecord(value)) return null;
  const region = canonicalRegionAddress(value.region);
  if (region === null || !validPositiveOrdinal(value.ordinal)) return null;
  return { region, ordinal: value.ordinal };
}

function canonicalEntity(
  value: unknown,
  width: number,
  height: number,
  worldLastEventOrdinal: number,
): LooseCargoEntity | null {
  if (!isRecord(value) || !validEntityId(value.id)) return null;
  const origin = canonicalOrigin(value.origin);
  const owner = canonicalOwner(value.owner);
  const payload = canonicalPayload(value.payload);
  const materialState = canonicalMaterialState(value.materialState);
  if (
    origin === null
    || value.id !== looseCargoEntityId(origin.region, origin.ordinal)
    || owner === null
    || payload === null
    || materialState === null
    || !validPosition(value.x, width)
    || !validPosition(value.y, height)
    || !validVelocity(value.velocityX)
    || !validVelocity(value.velocityY)
    || !MOTION_SET.has(value.motion as string)
    || (value.snaggedBy !== null && value.snaggedBy !== "mangrove" && value.snaggedBy !== "bramble")
    || typeof value.causalSignature !== "string"
    || value.causalSignature.length > 512
    || !validPositiveOrdinal(value.lastEventOrdinal)
    || value.lastEventOrdinal > worldLastEventOrdinal
  ) return null;
  return {
    id: value.id,
    origin,
    owner,
    payload,
    materialState,
    x: value.x,
    y: value.y,
    velocityX: value.velocityX,
    velocityY: value.velocityY,
    motion: value.motion as LooseCargoMotion,
    snaggedBy: value.snaggedBy as LooseCargoSnag | null,
    causalSignature: value.causalSignature,
    lastEventOrdinal: value.lastEventOrdinal,
  };
}

function canonicalPosition(
  value: unknown,
  expectedRegion: LooseCargoRegionAddress,
  width: number,
  height: number,
): LooseCargoPosition | null {
  if (!isRecord(value)) return null;
  const region = canonicalRegionAddress(value.region);
  if (
    region === null
    || !sameRegion(region, expectedRegion)
    || !validPosition(value.x, width)
    || !validPosition(value.y, height)
  ) return null;
  return { region, x: value.x, y: value.y };
}

function canonicalHistoryRecord(
  value: unknown,
  region: LooseCargoRegionAddress,
  width: number,
  height: number,
): LooseCargoHistoryRecord | null {
  if (
    !isRecord(value)
    || !validPositiveOrdinal(value.ordinal)
    || value.id !== looseCargoEventId(region, value.ordinal)
    || !validCounter(value.step)
    || !HISTORY_KIND_SET.has(value.kind as string)
    || !Array.isArray(value.entityIds)
    || value.entityIds.length < 1
    || value.entityIds.length > 16
    || new Set(value.entityIds).size !== value.entityIds.length
    || value.entityIds.some((id: unknown) => !validEntityId(id))
    || typeof value.payloadKey !== "string"
    || value.payloadKey.length < 1
    || value.payloadKey.length > MAX_PAYLOAD_KEY_LENGTH
    || !validQuantity(value.quantity)
    || !Array.isArray(value.causes)
    || value.causes.length < 1
    || value.causes.length > MAX_CAUSES_PER_EVENT
    || new Set(value.causes).size !== value.causes.length
    || value.causes.some((cause: unknown) => typeof cause !== "string" || !CAUSE_CODE_SET.has(cause))
    || !validUnit(value.conditionLoss)
    || !validUnit(value.contaminationGain)
    || !validUnit(value.decayGain)
  ) return null;
  const from = value.from === null ? null : canonicalPosition(value.from, region, width, height);
  const to = value.to === null ? null : canonicalPosition(value.to, region, width, height);
  if ((value.from !== null && from === null) || (value.to !== null && to === null)) return null;
  return {
    id: value.id,
    ordinal: value.ordinal,
    step: value.step,
    kind: value.kind as LooseCargoHistoryKind,
    entityIds: [...value.entityIds] as LooseCargoEntityId[],
    payloadKey: value.payloadKey,
    quantity: value.quantity,
    from,
    to,
    causes: [...value.causes] as LooseCargoCauseCode[],
    conditionLoss: value.conditionLoss,
    contaminationGain: value.contaminationGain,
    decayGain: value.decayGain,
  };
}

function canonicalLot(value: unknown): CarriedCargoLot | null {
  if (!isRecord(value) || !validLotId(value.id)) return null;
  const payload = canonicalPayload(value.payload);
  const materialState = canonicalMaterialState(value.materialState);
  if (
    payload === null
    || materialState === null
    || (payload.kind === "provision" && payload.lotId !== value.id)
  ) return null;
  return { id: value.id, payload, materialState };
}

function transferContext(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  direction: "drop" | "pickup",
): {
  readonly world: LooseCargoWorldState;
  readonly carrier: LooseCargoCarrierState;
  readonly quote: LooseCargoTransferQuote | null;
} {
  const worldValidation = validateLooseCargoWorld(world);
  if (!worldValidation.valid || worldValidation.state === null) {
    return { world, carrier, quote: failedQuote(direction, "invalid-world", world, carrier) };
  }
  const carrierValidation = validateLooseCargoCarrier(carrier);
  if (!carrierValidation.valid || carrierValidation.carrier === null) {
    return {
      world: worldValidation.state,
      carrier,
      quote: failedQuote(direction, "invalid-carrier", worldValidation.state, carrier),
    };
  }
  const system = inspectLooseCargoConservation(worldValidation.state, carrierValidation.carrier);
  if (!system.valid) {
    return {
      world: worldValidation.state,
      carrier: carrierValidation.carrier,
      quote: failedQuote(direction, "identity-conflict", worldValidation.state, carrierValidation.carrier),
    };
  }
  return { world: worldValidation.state, carrier: carrierValidation.carrier, quote: null };
}

function failedQuote(
  direction: "drop" | "pickup",
  reason: Exclude<LooseCargoTransferReason, "ready">,
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  lotId: string | null = null,
  entityId: LooseCargoEntityId | null = null,
  transferLoadMilli = 0,
): LooseCargoTransferQuote {
  const carrierValidation = validateLooseCargoCarrier(carrier);
  const load = carrierValidation.valid ? carrierValidation.loadMilli : 0;
  return {
    ok: false,
    direction,
    reason,
    worldRevision: validCounter(world.revision) ? world.revision : 0,
    carrierRevision: validCounter(carrier.revision) ? carrier.revision : 0,
    entityId,
    lotId,
    transferLoadMilli,
    carrierLoadBeforeMilli: load,
    carrierLoadAfterMilli: load,
    message: transferFailureMessage(direction, reason),
  };
}

function transferFailureMessage(
  direction: "drop" | "pickup",
  reason: Exclude<LooseCargoTransferReason, "ready">,
): string {
  const verb = direction === "drop" ? "drop" : "recover";
  switch (reason) {
    case "fallback-impact": return "The parcel could not separate, but the carried load still took the resolved impact.";
    case "invalid-world": return `Cannot ${verb} cargo because the loose-cargo world is invalid.`;
    case "invalid-carrier": return `Cannot ${verb} cargo because the carrier pack is invalid.`;
    case "invalid-request": return `Cannot ${verb} cargo because the request is invalid.`;
    case "lot-not-found": return "That carried lot is no longer in the pack.";
    case "entity-not-found": return "That loose stack is no longer in the world.";
    case "quantity-unavailable": return "The carried lot does not contain that exact quantity.";
    case "out-of-reach": return "Move closer before recovering this loose stack.";
    case "not-owner": return "This loose stack still belongs to another porter or settlement.";
    case "capacity-exceeded": return "The pack has no room for this loose stack.";
    case "identity-conflict": return "That durable item or Promise cargo is already represented here.";
    case "entity-capacity-exceeded": return "There is no safe space nearby for another loose parcel.";
    case "id-space-exhausted": return "No safe cargo identity remains in this save.";
    case "history-capacity-exceeded": return "The local parcel history is full; save recovery is required before another transfer.";
  }
}

function droppedPayload(
  payload: LooseCargoPayload,
  requestedQuantity: unknown,
  provisionChildLotId: string,
): LooseCargoPayload | null {
  if (payload.kind !== "stack" && payload.kind !== "provision") {
    return requestedQuantity === undefined ? payload : null;
  }
  if (!validQuantity(requestedQuantity) || requestedQuantity > payload.quantity) return null;
  if (payload.kind === "provision") {
    return {
      ...payload,
      lotId: requestedQuantity === payload.quantity ? payload.lotId : provisionChildLotId,
      quantity: requestedQuantity,
    };
  }
  return { ...payload, quantity: requestedQuantity };
}

function removeFromLot(
  lots: readonly CarriedCargoLot[],
  source: CarriedCargoLot,
  dropped: LooseCargoPayload,
): readonly CarriedCargoLot[] {
  if (
    source.payload.kind === dropped.kind
    && (
      source.payload.kind === "stack"
      || source.payload.kind === "promise"
      || source.payload.kind === "provision"
    )
    && (dropped.kind === "stack" || dropped.kind === "promise" || dropped.kind === "provision")
    && dropped.quantity < source.payload.quantity
  ) {
    const remainingPayload: LooseCargoPayload = {
      ...source.payload,
      quantity: source.payload.quantity - dropped.quantity,
    } as LooseCargoPayload;
    return lots.map((lot) => lot.id === source.id
      ? {
          ...lot,
          payload: remainingPayload,
        }
      : lot);
  }
  return lots.filter((lot) => lot.id !== source.id);
}

function payloadRemovesWholeLot(source: LooseCargoPayload, moved: LooseCargoPayload): boolean {
  if (source.kind !== moved.kind) return false;
  if (source.kind === "gear") return true;
  return (
    moved.kind === "stack"
    || moved.kind === "promise"
    || moved.kind === "provision"
  ) && moved.quantity === source.quantity;
}

function durableIdentityExists(
  values: readonly { readonly payload: LooseCargoPayload }[],
  payload: LooseCargoPayload,
): boolean {
  if (payload.kind === "gear") {
    return values.some((value) => value.payload.kind === "gear" && value.payload.gearId === payload.gearId);
  }
  if (payload.kind === "provision") {
    return values.some((value) => value.payload.kind === "provision"
      && value.payload.lotId === payload.lotId);
  }
  return false;
}

function findMatchingRecoveryLot(
  lots: readonly CarriedCargoLot[],
  entity: LooseCargoEntity,
): CarriedCargoLot | undefined {
  if (entity.payload.kind === "stack") {
    const payload = entity.payload;
    return lots.find((lot) => lot.payload.kind === "stack"
      && lot.payload.item === payload.item
      && sameMaterialState(lot.materialState, entity.materialState));
  }
  if (entity.payload.kind === "promise") {
    const payload = entity.payload;
    return lots.find((lot) => lot.payload.kind === "promise"
      && promiseDefinitionKey(lot.payload) === promiseDefinitionKey(payload)
      && sameMaterialState(lot.materialState, entity.materialState));
  }
  return undefined;
}

function mergeQuantityPayload(
  carried: LooseCargoPayload,
  recovered: LooseCargoPayload,
): LooseCargoPayload {
  if (carried.kind === "stack" && recovered.kind === "stack" && carried.item === recovered.item) {
    return { ...carried, quantity: carried.quantity + recovered.quantity };
  }
  if (
    carried.kind === "promise"
    && recovered.kind === "promise"
    && promiseDefinitionKey(carried) === promiseDefinitionKey(recovered)
  ) {
    return { ...carried, quantity: carried.quantity + recovered.quantity };
  }
  throw new Error("Only identical quantity-bearing payloads can merge");
}

function mutationCarrier(carrier: LooseCargoCarrierState): LooseCargoCarrierState | null {
  const validation = validateLooseCargoCarrier(carrier);
  return validation.valid ? validation.carrier : null;
}

function failedCarrierMutation(
  reason: Exclude<LooseCargoCarrierMutationReason, "applied" | "unchanged">,
  carrier: LooseCargoCarrierState,
  affectedLotId: string | null = null,
): LooseCargoCarrierMutationResult {
  const validation = validateLooseCargoCarrier(carrier);
  const load = validation.valid ? validation.loadMilli : 0;
  return {
    ok: false,
    reason,
    carrier,
    affectedLotId,
    removed: [],
    loadBeforeMilli: load,
    loadAfterMilli: load,
  };
}

function unchangedCarrierMutation(
  carrier: LooseCargoCarrierState,
  affectedLotId: string | null,
): LooseCargoCarrierMutationResult {
  const load = looseCargoCarrierLoadUnchecked(carrier);
  return {
    ok: true,
    reason: "unchanged",
    carrier,
    affectedLotId,
    removed: [],
    loadBeforeMilli: load,
    loadAfterMilli: load,
  };
}

function commitCarrierMutation(
  carrier: LooseCargoCarrierState,
  lots: readonly CarriedCargoLot[],
  affectedLotId: string | null,
  removed: readonly CarriedCargoLot[] = [],
  reservedLoadMilli = carrier.reservedLoadMilli,
  retiredLotIds: readonly string[] = carrier.retiredLotIds,
): LooseCargoCarrierMutationResult {
  if (carrier.revision >= LOOSE_CARGO_MAX_ORDINAL) {
    return failedCarrierMutation("revision-space-exhausted", carrier, affectedLotId);
  }
  const candidate: LooseCargoCarrierState = {
    ...carrier,
    revision: carrier.revision + 1,
    reservedLoadMilli,
    lots,
    retiredLotIds,
  };
  const validation = validateLooseCargoCarrier(candidate);
  if (!validation.valid || validation.carrier === null) {
    return failedCarrierMutation(
      validation.reason === "over-capacity" ? "capacity-exceeded" : "identity-conflict",
      carrier,
      affectedLotId,
    );
  }
  return {
    ok: true,
    reason: "applied",
    carrier: validation.carrier,
    affectedLotId,
    removed,
    loadBeforeMilli: looseCargoCarrierLoadUnchecked(carrier),
    loadAfterMilli: validation.loadMilli,
  };
}

function addRetiredLotIds(
  existing: readonly string[],
  additions: readonly string[],
): readonly string[] | null {
  if (additions.length === 0) return existing;
  const combined = new Set(existing);
  for (const id of additions) {
    if (!validLotId(id)) return null;
    combined.add(id);
  }
  if (combined.size > LOOSE_CARGO_MAX_RETIRED_LOTS) return null;
  return [...combined].sort();
}

function failedScatter(
  reason: LooseCargoTransferReason,
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  message: string,
  conservation: LooseCargoConservationProof | null = null,
): LooseCargoScatterResult {
  return { ok: false, reason, world, carrier, entities: [], message, conservation };
}

/** Full loaded-region cap is never a fall-immunity exploit. The physical split
 * cannot allocate, so the exact source lot stays carried and receives a
 * deterministic material impact with persistent causal evidence. */
function applyScatterCapacityImpact(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
  lot: CarriedCargoLot,
  request: LooseCargoScatterRequest,
): LooseCargoScatterResult {
  if (
    world.revision >= LOOSE_CARGO_MAX_ORDINAL
    || carrier.revision >= LOOSE_CARGO_MAX_ORDINAL
    || !hasOrdinalSpace(world.lastEventOrdinal, 1)
  ) {
    return failedScatter("id-space-exhausted", world, carrier, "The cap-impact fallback cannot allocate a safe causal event.");
  }
  const strongestImpulse = request.parts.reduce((strongest, part) => Math.max(
    strongest,
    Math.trunc((Math.hypot(part.velocityX, part.velocityY) * FIXED_POINT) / LOOSE_CARGO_MAX_VELOCITY),
  ), 0);
  const impact = unit(Math.max(request.cause === "fall-separation" ? 350_000 : 200_000, strongestImpulse));
  const evaluation = evaluateCargoEnvironment({
    property: looseCargoPayloadProperty(lot.payload),
    state: lot.materialState,
    environment: { ...CALM_ENVIRONMENT, impact },
  });
  const nextCarrierCandidate: LooseCargoCarrierState = {
    ...carrier,
    revision: carrier.revision + 1,
    lots: carrier.lots.map((candidate) => candidate.id === lot.id
      ? { ...candidate, materialState: evaluation.nextState }
      : candidate),
  };
  const carrierValidation = validateLooseCargoCarrier(nextCarrierCandidate);
  if (!carrierValidation.valid || carrierValidation.carrier === null) {
    return failedScatter("invalid-carrier", world, carrier, "The cap-impact fallback failed carrier validation.");
  }
  const eventOrdinal = world.lastEventOrdinal + 1;
  const appendedHistory = appendLooseCargoHistory(world, [createHistoryRecord(
    world,
    eventOrdinal,
    "scatter",
    [lot.id],
    lot.payload,
    positionOf(world, request.x, request.y),
    positionOf(world, request.x, request.y),
    [request.cause, "rock-impact"],
    evaluation.change,
  )]);
  const nextWorld = trustWorldState({
    ...world,
    revision: world.revision + 1,
    lastEventOrdinal: eventOrdinal,
    ...appendedHistory,
  });
  return {
    ok: true,
    reason: "fallback-impact",
    world: nextWorld,
    carrier: carrierValidation.carrier,
    entities: [],
    message: "There was no safe space for the parcel to separate; it stayed carried but took the resolved fall impact.",
    conservation: null,
  };
}

function canonicalSamples(
  samples: readonly LooseCargoStepSample[],
  entities: readonly LooseCargoEntity[],
): ReadonlyMap<LooseCargoEntityId, LooseCargoStepSample> | null {
  if (!Array.isArray(samples) || samples.length > LOOSE_CARGO_MAX_ENTITIES) return null;
  const entityIds = new Set(entities.map(({ id }) => id));
  const byId = new Map<LooseCargoEntityId, LooseCargoStepSample>();
  for (const value of samples as readonly unknown[]) {
    if (!isRecord(value) || !validEntityId(value.entityId) || !entityIds.has(value.entityId)) return null;
    if (byId.has(value.entityId)) return null;
    if (
      !isRecord(value.environment)
      || !validUnit(value.environment.rain)
      || !validUnit(value.environment.heat)
      || !validUnit(value.environment.cold)
      || !validUnit(value.environment.immersion)
      || !validSignedUnit(value.environment.currentX)
      || !validSignedUnit(value.environment.currentY)
      || !validUnit(value.environment.magicalWaterFlux)
      || !validUnit(value.environment.impact ?? 0)
      || !validUnit(value.waterDepth)
      || !validSignedUnit(value.downhillX)
      || !validSignedUnit(value.downhillY)
      || !validUnit(value.tumbleImpact)
      || !validUnit(value.mangroveSnag)
      || !validUnit(value.brambleSnag)
    ) return null;
    byId.set(value.entityId, {
      entityId: value.entityId,
      environment: {
        rain: value.environment.rain,
        heat: value.environment.heat,
        cold: value.environment.cold,
        immersion: value.environment.immersion,
        currentX: value.environment.currentX,
        currentY: value.environment.currentY,
        magicalWaterFlux: value.environment.magicalWaterFlux,
        impact: value.environment.impact ?? 0,
      },
      waterDepth: value.waterDepth,
      downhillX: value.downhillX,
      downhillY: value.downhillY,
      tumbleImpact: value.tumbleImpact,
      mangroveSnag: value.mangroveSnag,
      brambleSnag: value.brambleSnag,
    });
  }
  if (byId.size !== entities.length) return null;
  return byId;
}

function looseCargoCarrierLoadUnchecked(carrier: LooseCargoCarrierState): number {
  return carrier.reservedLoadMilli
    + carrier.lots.reduce((total, lot) => total + looseCargoPayloadLoadMilli(lot.payload), 0);
}

function requireWorld(world: LooseCargoWorldState): LooseCargoWorldState {
  const validation = validateLooseCargoWorld(world);
  if (!validation.valid || validation.state === null) throw new Error("Expected valid loose-cargo world");
  return validation.state;
}

function requireCarrier(carrier: LooseCargoCarrierState): LooseCargoCarrierState {
  const validation = validateLooseCargoCarrier(carrier);
  if (!validation.valid || validation.carrier === null) throw new Error("Expected valid loose-cargo carrier");
  return validation.carrier;
}

function describePayload(payload: LooseCargoPayload): string {
  switch (payload.kind) {
    case "stack": return `${payload.quantity} ${CRAFTING_STACK_DEFINITIONS[payload.item].label}`;
    case "gear": return CRAFTED_GEAR_DEFINITIONS[payload.gearKind].label;
    case "promise": return `${payload.quantity} ${payload.resource} for Promise ${payload.contractId}`;
    case "provision": return `${payload.quantity} ${PROVISION_DEFINITIONS[payload.provision].label}`;
  }
}

function compareEntity(left: LooseCargoEntity, right: LooseCargoEntity): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function compareLot(left: CarriedCargoLot, right: CarriedCargoLot): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function looseCargoOwnerKey(owner: LooseCargoOwner): string {
  switch (owner.kind) {
    case "unclaimed": return "0:unclaimed";
    case "player": return `1:${owner.id}`;
    case "actor": return `2:${owner.id}`;
    case "settlement": return `3:${owner.id}`;
  }
}

function compareOwner(left: LooseCargoOwner, right: LooseCargoOwner): number {
  const leftKey = looseCargoOwnerKey(left);
  const rightKey = looseCargoOwnerKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function sameOwner(left: LooseCargoOwner, right: LooseCargoOwner): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "unclaimed" && right.kind === "unclaimed") return true;
  if (left.kind === "player" && right.kind === "player") return left.id === right.id;
  if (left.kind === "actor" && right.kind === "actor") return left.id === right.id;
  return left.kind === "settlement" && right.kind === "settlement" && left.id === right.id;
}

function sameRegion(left: LooseCargoRegionAddress, right: LooseCargoRegionAddress): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameMaterialState(left: CargoEnvironmentState, right: CargoEnvironmentState): boolean {
  return left.condition === right.condition
    && left.contamination === right.contamination
    && left.decay === right.decay;
}

function promiseDefinitionKey(payload: LooseCargoPromisePayload): string {
  return `${payload.contractId}:${payload.resource}:${payload.property}`;
}

function payloadQuantity(payload: LooseCargoPayload): number {
  return payload.kind === "gear" ? 1 : payload.quantity;
}

function historyPayloadKey(payload: LooseCargoPayload): string {
  switch (payload.kind) {
    case "stack": return `stack:${payload.item}`;
    case "gear": return `gear:${payload.gearId}:${payload.gearKind}`;
    case "promise": return `promise:${promiseDefinitionKey(payload)}`;
    case "provision": return `provision:${payload.provision}:lot:${payload.lotId}`;
  }
}

function manifestPayloadKey(
  payload: LooseCargoPayload,
  materialState: CargoEnvironmentState,
): string {
  const substanceKey = payload.kind === "provision"
    ? `provision:${payload.provision}`
    : historyPayloadKey(payload);
  return `${substanceKey}@${materialState.condition},${materialState.contamination},${materialState.decay}`;
}

function positionOf(world: LooseCargoWorldState, x: number, y: number): LooseCargoPosition {
  return { region: world.region, x, y };
}

function zeroEnvironmentChange(): {
  readonly conditionLoss: number;
  readonly contaminationGain: number;
  readonly decayGain: number;
} {
  return { conditionLoss: 0, contaminationGain: 0, decayGain: 0 };
}

function canonicalCauseCodes(causes: readonly LooseCargoCauseCode[]): readonly LooseCargoCauseCode[] {
  return [...new Set(causes)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function causalSignatureFor(causes: readonly LooseCargoCauseCode[], impact: number): string {
  const impactBand = impact === 0 ? 0 : Math.min(4, Math.ceil(impact / 250_000));
  return `${causes.join(",")}|impact:${impactBand}`;
}

function materialThresholdBand(state: CargoEnvironmentState): string {
  const band = (value: number) => Math.min(4, Math.floor(value / 250_000));
  return `${band(state.condition)}:${band(state.contamination)}:${band(state.decay)}`;
}

function createHistoryRecord(
  world: LooseCargoWorldState,
  ordinal: number,
  kind: LooseCargoHistoryKind,
  entityIds: readonly LooseCargoEntityId[],
  payload: LooseCargoPayload,
  from: LooseCargoPosition | null,
  to: LooseCargoPosition | null,
  causes: readonly LooseCargoCauseCode[],
  change: {
    readonly conditionLoss: number;
    readonly contaminationGain: number;
    readonly decayGain: number;
  },
): LooseCargoHistoryRecord {
  const canonicalCauses = canonicalCauseCodes(causes);
  if (canonicalCauses.length === 0) throw new Error("Causal parcel history cannot be empty");
  return {
    id: looseCargoEventId(world.region, ordinal),
    ordinal,
    step: world.completedSteps,
    kind,
    entityIds: [...entityIds].sort(),
    payloadKey: historyPayloadKey(payload),
    quantity: payloadQuantity(payload),
    from,
    to,
    causes: canonicalCauses,
    conditionLoss: change.conditionLoss,
    contaminationGain: change.contaminationGain,
    decayGain: change.decayGain,
  };
}

function appendLooseCargoHistory(
  world: LooseCargoWorldState,
  records: readonly LooseCargoHistoryRecord[],
): Pick<LooseCargoWorldState, "historyBaseOrdinal" | "historyArchiveHash" | "history"> {
  if (records.length === 0 && world.history.length <= LOOSE_CARGO_RETAINED_HISTORY) {
    return {
      historyBaseOrdinal: world.historyBaseOrdinal,
      historyArchiveHash: world.historyArchiveHash,
      history: world.history,
    };
  }
  const combined = [...world.history, ...records];
  const overflow = Math.max(0, combined.length - LOOSE_CARGO_RETAINED_HISTORY);
  if (overflow === 0) {
    return {
      historyBaseOrdinal: world.historyBaseOrdinal,
      historyArchiveHash: world.historyArchiveHash,
      history: combined,
    };
  }
  const compacted = combined.slice(0, overflow);
  return {
    historyBaseOrdinal: compacted[compacted.length - 1]!.ordinal,
    historyArchiveHash: foldHistoryHash(world.historyArchiveHash, compacted),
    history: combined.slice(overflow),
  };
}

function foldHistoryHash(
  priorHash: string,
  records: readonly LooseCargoHistoryRecord[],
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

function invalidConservationSnapshot(
  reason: Exclude<LooseCargoConservationSnapshot["reason"], "valid">,
): LooseCargoConservationSnapshot {
  return {
    valid: false,
    reason,
    entries: [],
    totalQuantity: 0,
    totalLoadMilli: 0,
    fingerprint: "",
  };
}

function structuralManifest(snapshot: LooseCargoConservationSnapshot): LooseCargoExpectedManifest {
  const grouped = new Map<string, LooseCargoManifestEntry>();
  for (const entry of snapshot.entries) {
    const separator = entry.payloadKey.lastIndexOf("@");
    const payloadKey = separator < 0 ? entry.payloadKey : entry.payloadKey.slice(0, separator);
    const prior = grouped.get(payloadKey);
    grouped.set(payloadKey, {
      payloadKey,
      quantity: (prior?.quantity ?? 0) + entry.quantity,
      loadMilli: (prior?.loadMilli ?? 0) + entry.loadMilli,
    });
  }
  const entries = [...grouped.values()].sort((left, right) => left.payloadKey < right.payloadKey ? -1 : 1);
  return {
    version: LOOSE_CARGO_EXPECTED_MANIFEST_VERSION,
    entries,
    totalQuantity: entries.reduce((total, entry) => total + entry.quantity, 0),
    totalLoadMilli: entries.reduce((total, entry) => total + entry.loadMilli, 0),
    fingerprint: stableStringify(entries),
  };
}

function canonicalExpectedManifest(
  value: unknown,
  maximumEntries = MAX_CARRIER_LOTS + LOOSE_CARGO_MAX_ENTITIES,
): LooseCargoExpectedManifest | null {
  if (
    !isRecord(value)
    || value.version !== LOOSE_CARGO_EXPECTED_MANIFEST_VERSION
    || !Array.isArray(value.entries)
    || !Number.isSafeInteger(maximumEntries)
    || maximumEntries < 0
    || value.entries.length > maximumEntries
  ) return null;
  const entries: LooseCargoManifestEntry[] = [];
  let previousKey = "";
  let totalQuantity = 0;
  let totalLoadMilli = 0;
  for (const rawEntry of value.entries) {
    if (
      !isRecord(rawEntry)
      || typeof rawEntry.payloadKey !== "string"
      || rawEntry.payloadKey.length < 1
      || rawEntry.payloadKey.length > MAX_PAYLOAD_KEY_LENGTH
      || rawEntry.payloadKey <= previousKey
      || !Number.isSafeInteger(rawEntry.quantity)
      || rawEntry.quantity <= 0
      || !Number.isSafeInteger(rawEntry.loadMilli)
      || rawEntry.loadMilli < 0
    ) return null;
    totalQuantity += rawEntry.quantity;
    totalLoadMilli += rawEntry.loadMilli;
    if (!Number.isSafeInteger(totalQuantity) || !Number.isSafeInteger(totalLoadMilli)) return null;
    entries.push({
      payloadKey: rawEntry.payloadKey,
      quantity: rawEntry.quantity,
      loadMilli: rawEntry.loadMilli,
    });
    previousKey = rawEntry.payloadKey;
  }
  if (
    value.totalQuantity !== totalQuantity
    || value.totalLoadMilli !== totalLoadMilli
    || value.fingerprint !== stableStringify(entries)
  ) return null;
  return {
    version: LOOSE_CARGO_EXPECTED_MANIFEST_VERSION,
    entries,
    totalQuantity,
    totalLoadMilli,
    fingerprint: value.fingerprint,
  };
}

function hasOrdinalSpace(lastOrdinal: number, amount: number): boolean {
  return validOrdinal(lastOrdinal)
    && Number.isSafeInteger(amount)
    && amount >= 0
    && amount <= LOOSE_CARGO_MAX_ORDINAL - lastOrdinal;
}

function trustWorldState(state: LooseCargoWorldState): LooseCargoWorldState {
  deepFreeze(state);
  TRUSTED_WORLD_STATES.add(state as object);
  return state;
}

function deepFreeze(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}

function tileIndexAt(x: number, y: number, width: number): number {
  return Math.floor(y / LOOSE_CARGO_TILE_UNITS) * width
    + Math.floor(x / LOOSE_CARGO_TILE_UNITS);
}

function unionFixed(left: number, right: number): number {
  const unblocked = Math.trunc(((FIXED_POINT - unit(left)) * (FIXED_POINT - unit(right))) / FIXED_POINT);
  return FIXED_POINT - unblocked;
}

function multiplySigned(signed: number, unsigned: number): number {
  return Math.trunc((signedUnit(signed) * unit(unsigned)) / FIXED_POINT);
}

function clampVelocity(value: number): number {
  return clamp(Math.trunc(value), -LOOSE_CARGO_MAX_VELOCITY, LOOSE_CARGO_MAX_VELOCITY);
}

function settleVelocity(value: number): number {
  const bounded = clampVelocity(value);
  return Math.abs(bounded) <= REST_VELOCITY ? 0 : bounded;
}

function unit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(Math.trunc(value), 0, FIXED_POINT)
    : 0;
}

function signedUnit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(Math.trunc(value), -FIXED_POINT, FIXED_POINT)
    : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function validUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= FIXED_POINT;
}

function validVelocity(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= -LOOSE_CARGO_MAX_VELOCITY
    && value <= LOOSE_CARGO_MAX_VELOCITY;
}

function validSignedUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= -FIXED_POINT
    && value <= FIXED_POINT;
}

function validDimension(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    && value <= MAX_WORLD_DIMENSION;
}

function validPosition(value: unknown, dimension: number): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value < dimension * LOOSE_CARGO_TILE_UNITS;
}

function validCounter(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= LOOSE_CARGO_MAX_ORDINAL;
}

function validOrdinal(value: unknown): value is number {
  return validCounter(value);
}

function validPositiveOrdinal(value: unknown): value is number {
  return validCounter(value) && value > 0;
}

function validIdentity(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    && value <= MAX_DURABLE_ID;
}

function validEntityId(value: unknown): value is LooseCargoEntityId {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_LOT_ID_LENGTH
    && value.trim() === value;
}

function validQuantity(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    && value <= MAX_QUANTITY;
}

function validLotId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_LOT_ID_LENGTH
    && value.trim() === value;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidWorld(reason: Exclude<LooseCargoValidationReason, "valid">): LooseCargoWorldValidation {
  return { valid: false, reason, state: null };
}

function invalidCarrier(
  reason: Exclude<LooseCargoCarrierValidationReason, "valid" | "over-capacity">,
): LooseCargoCarrierValidation {
  return { valid: false, reason, carrier: null, loadMilli: 0, freeMilli: 0 };
}

/** Public vocabulary checks useful to inventory and UI adapters. */
export function looseCargoStackTier(item: CraftingStackId): "raw" | "component" {
  if (RAW_MATERIAL_ID_SET.has(item)) return "raw";
  if (COMPONENT_ID_SET.has(item)) return "component";
  throw new RangeError(`Unknown crafting stack ${item}`);
}
