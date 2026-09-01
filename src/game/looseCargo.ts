import {
  evaluateCargoEnvironment,
  type CargoEnvironmentCauseCode,
  type CargoEnvironmentProperty,
  type CargoEnvironmentSample,
  type CargoEnvironmentState,
} from "../sim/cargoEnvironment";
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
export const LOOSE_CARGO_MAX_ORDINAL = Number.MAX_SAFE_INTEGER;
export const LOOSE_CARGO_MAX_RETIRED_LOTS = 32_768;

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
]);

export type LooseCargoOwner =
  | { readonly kind: "unclaimed" }
  | { readonly kind: "player"; readonly id: string }
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
  | "region-boundary-rest";

export type LooseCargoHistoryKind = "drop" | "scatter" | "pickup" | "merge" | "environment";

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

export type LooseCargoPayload =
  | LooseCargoStackPayload
  | LooseCargoGearPayload
  | LooseCargoPromisePayload;

export interface CarriedCargoLot {
  /** Stable while carried. Partial stack drops keep this ID on the remainder. */
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
  /** Canonical recent append-only tail, bounded by LOOSE_CARGO_MAX_HISTORY. */
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
  /** Required for stack lots; a manual drop moves gear and Promise lots whole. */
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
  /** Required for stack and Promise payloads. Durable gear allows one part. */
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
  readonly reason: "valid" | "invalid-world" | "invalid-carrier" | "duplicate-durable-identity";
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
    }
  }
  return {
    craftingInventory: createCraftingInventory(
      canonical.capacityMilliLoad,
      stacks,
      gear,
    ),
    promises,
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

/**
 * Cross-state conservation snapshot. Runtime should validate this after load,
 * after every atomic transfer, and before saving. It catches duplicate durable
 * gear, conflicting Promise definitions, quantity drift, and load drift.
 */
export function inspectLooseCargoConservation(
  world: LooseCargoWorldState,
  carrier: LooseCargoCarrierState,
): LooseCargoConservationSnapshot {
  const worldValidation = validateLooseCargoWorld(world);
  if (!worldValidation.valid || worldValidation.state === null) {
    return invalidConservationSnapshot("invalid-world");
  }
  const carrierValidation = validateLooseCargoCarrier(carrier);
  if (!carrierValidation.valid || carrierValidation.carrier === null) {
    return invalidConservationSnapshot("invalid-carrier");
  }
  const entries = new Map<string, LooseCargoManifestEntry>();
  const gearIds = new Set<number>();
  const promiseDefinitions = new Map<number, string>();
  const promiseQuantities = new Map<number, number>();
  const stackQuantities = new Map<CraftingStackId, number>();
  const values: readonly { readonly payload: LooseCargoPayload; readonly materialState: CargoEnvironmentState }[] = [
    ...worldValidation.state.entities,
    ...carrierValidation.carrier.lots,
  ];
  for (const value of values) {
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
  }
  const canonicalEntries = [...entries.values()].sort((left, right) => left.payloadKey < right.payloadKey ? -1 : 1);
  const totalQuantity = canonicalEntries.reduce((total, entry) => total + entry.quantity, 0);
  const totalLoadMilli = canonicalEntries.reduce((total, entry) => total + entry.loadMilli, 0);
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
  const payload = droppedPayload(lot.payload, request.quantity);
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
    entityId: looseCargoEntityId(canonicalWorld.region, canonicalWorld.lastEntityOrdinal + 1),
    lotId: lot.id,
    transferLoadMilli,
    carrierLoadBeforeMilli: loadBefore,
    carrierLoadAfterMilli: loadBefore - transferLoadMilli,
    message: `Drop ${describePayload(payload)} here. It remains recoverable as ${looseCargoEntityId(canonicalWorld.region, canonicalWorld.lastEntityOrdinal + 1)}.`,
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
  const payload = droppedPayload(lot.payload, request.quantity);
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
    lots.some((candidate) => candidate.id === lot.id) ? [] : [lot.id],
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
    if (lot.payload.kind === "stack" || lot.payload.kind === "promise") {
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
    const payload = parts[index]!;
    const part = request.parts[index]!;
    const entityOrdinal = canonicalWorld.lastEntityOrdinal + index + 1;
    const eventOrdinal = canonicalWorld.lastEventOrdinal + index + 1;
    const origin: LooseCargoOrigin = { region: canonicalWorld.region, ordinal: entityOrdinal };
    const entity: LooseCargoEntity = {
      id: looseCargoEntityId(origin.region, origin.ordinal),
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
  const transferredPayload: LooseCargoPayload = lot.payload.kind === "stack" || lot.payload.kind === "promise"
    ? { ...lot.payload, quantity: stackQuantity }
    : lot.payload;
  const nextLots = removeFromLot(canonicalCarrier.lots, lot, transferredPayload);
  const retiredLotIds = addRetiredLotIds(
    canonicalCarrier.retiredLotIds,
    nextLots.some((candidate) => candidate.id === lot.id) ? [] : [lot.id],
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
  const lotId = matchingLot?.id ?? `loose:${entity.id}`;
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
    message: `Recover ${describePayload(entity.payload)} from world stack ${entity.id}.`,
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
  if (value.kind === "settlement" && validIdentity(value.id)) {
    return { kind: "settlement", id: value.id };
  }
  return null;
}

function canonicalRegionAddress(value: unknown): LooseCargoRegionAddress | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y)) return null;
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
  if (payload === null || materialState === null) return null;
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
    case "entity-capacity-exceeded": return "No safe loaded parcel slot remains in this region.";
    case "id-space-exhausted": return "No safe cargo identity remains in this save.";
    case "history-capacity-exceeded": return "The local parcel history is full; save recovery is required before another transfer.";
  }
}

function droppedPayload(payload: LooseCargoPayload, requestedQuantity: unknown): LooseCargoPayload | null {
  if (payload.kind !== "stack") {
    return requestedQuantity === undefined ? payload : null;
  }
  if (!validQuantity(requestedQuantity) || requestedQuantity > payload.quantity) return null;
  return { ...payload, quantity: requestedQuantity };
}

function removeFromLot(
  lots: readonly CarriedCargoLot[],
  source: CarriedCargoLot,
  dropped: LooseCargoPayload,
): readonly CarriedCargoLot[] {
  if (
    source.payload.kind === dropped.kind
    && (source.payload.kind === "stack" || source.payload.kind === "promise")
    && (dropped.kind === "stack" || dropped.kind === "promise")
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
  return (moved.kind === "stack" || moved.kind === "promise") && moved.quantity === source.quantity;
}

function durableIdentityExists(
  values: readonly { readonly payload: LooseCargoPayload }[],
  payload: LooseCargoPayload,
): boolean {
  if (payload.kind !== "gear") return false;
  return values.some((value) => value.payload.kind === "gear" && value.payload.gearId === payload.gearId);
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
    message: "The loaded region was full; the parcel stayed carried but took the resolved fall impact.",
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
  }
}

function compareEntity(left: LooseCargoEntity, right: LooseCargoEntity): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function compareLot(left: CarriedCargoLot, right: CarriedCargoLot): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function sameOwner(left: LooseCargoOwner, right: LooseCargoOwner): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "unclaimed" && right.kind === "unclaimed") return true;
  if (left.kind === "player" && right.kind === "player") return left.id === right.id;
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
  }
}

function manifestPayloadKey(
  payload: LooseCargoPayload,
  materialState: CargoEnvironmentState,
): string {
  return `${historyPayloadKey(payload)}@${materialState.condition},${materialState.contamination},${materialState.decay}`;
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
  if (records.length === 0) {
    return {
      historyBaseOrdinal: world.historyBaseOrdinal,
      historyArchiveHash: world.historyArchiveHash,
      history: world.history,
    };
  }
  const combined = [...world.history, ...records];
  const overflow = Math.max(0, combined.length - LOOSE_CARGO_MAX_HISTORY);
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

function canonicalExpectedManifest(value: unknown): LooseCargoExpectedManifest | null {
  if (
    !isRecord(value)
    || value.version !== LOOSE_CARGO_EXPECTED_MANIFEST_VERSION
    || !Array.isArray(value.entries)
    || value.entries.length > MAX_CARRIER_LOTS + LOOSE_CARGO_MAX_ENTITIES
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
