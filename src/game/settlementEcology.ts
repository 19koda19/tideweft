import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorObservations,
  type ActorObservation,
} from "../sim/actorPerception";
import type { RootSeed } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import { createCraftingInventory } from "./crafting";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregateAreaAnchor,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import type { CoreEcologyAggregateExposedFoodSource } from "./coreEcologyAggregatePerception";
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION,
  CORE_ECOLOGY_SMALL_WORLD_OWNER_ID,
  CORE_ECOLOGY_SMALL_WORLD_VERSION,
  canonicalizeCoreEcologySettlementShadowsStimulusFrame,
  type CoreEcologySettlementShadowsEvent,
} from "./coreEcologySmallWorld";
import {
  addLooseCargoProvision,
  consumeLooseCargoProvisionLot,
  createLooseCargoCarrier,
  validateLooseCargoCarrier,
  type CarriedCargoLot,
  type LooseCargoCarrierState,
} from "./looseCargo";
import {
  isLivingActorSpecies,
  isLivingSpeciesActorAddressable,
  LOCAL_PLAYER_LIVING_ACTOR_ID,
  livingSpeciesActorIdMatchesNamespace,
  livingSpeciesRegistryEntry,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";
import { PROVISION_DEFINITIONS } from "./provisions";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

/** Pure persisted kernel for settlement storehouse ecology and domestic custody. */
export const SETTLEMENT_ECOLOGY_PRIOR_VERSION = 1 as const;
export const SETTLEMENT_ECOLOGY_VERSION = 2 as const;
/** Store IDs predate v2 and must remain stable across the state migration. */
export const SETTLEMENT_ECOLOGY_IDENTITY_VERSION = 1 as const;
export const SETTLEMENT_ECOLOGY_PLAYER_REPORT_VERSION = 1 as const;
export const SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION = 1 as const;
export const SETTLEMENT_DOMESTIC_FOOD_USE_VERSION = 1 as const;
export const SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY = 8 as const;
export const SETTLEMENT_ECOLOGY_MAX_KEEPER_KNOWLEDGE = 8 as const;
export const SETTLEMENT_ECOLOGY_MAX_REDISTRIBUTED_UNITS = 1 as const;
export const SETTLEMENT_ECOLOGY_MAX_LOSS_UNITS = 1 as const;
export const SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY = 1 as const;
export const SETTLEMENT_ECOLOGY_MAX_DOMESTIC_MEMBERS = 16 as const;
export const SETTLEMENT_ECOLOGY_MAX_DOMESTIC_HOME_RADIUS_UNITS =
  32 * WORLD_POSITION_UNITS_PER_TILE;
export const SETTLEMENT_ECOLOGY_MAX_SERIALIZED_BYTES = 64 * 1_024;
export const SETTLEMENT_ECOLOGY_STORE_EVIDENCE_RANGE_UNITS =
  2 * WORLD_POSITION_UNITS_PER_TILE;
export const SETTLEMENT_ECOLOGY_STORE_CAPACITY_MILLI =
  SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY
    * PROVISION_DEFINITIONS["fresh-produce"].loadMilli;
export const SETTLEMENT_ECOLOGY_PLAYER_REPORT_CONFIDENCE = 800_000 as const;

const OPEN_PACKAGING_LEAKAGE = ACTOR_PERCEPTION_SCALE;
const SECURED_PACKAGING_LEAKAGE = 0;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const UINT32_MAX = 0xffff_ffff;
const UTF8_ENCODER = new TextEncoder();
const SETTLEMENT_ECOLOGY_V1_STATE_KEYS = [
  "carrier",
  "closure",
  "identity",
  "keeperKnowledge",
  "lastClosureTransactionId",
  "lastResolvedCauseEventId",
  "lastResolvedCauseEventTick",
  "lastResolvedLossOrdinal",
  "lastResolvedTransactionId",
  "pendingLoss",
  "revision",
  "version",
] as const;
const SETTLEMENT_ECOLOGY_V2_STATE_KEYS = [
  ...SETTLEMENT_ECOLOGY_V1_STATE_KEYS,
  "domesticCustody",
  "lastResolvedDomesticFoodUseCauseEventId",
  "lastResolvedDomesticFoodUseCauseEventTick",
  "lastResolvedDomesticFoodUseMemberActorId",
  "lastResolvedDomesticFoodUseOrdinal",
  "lastResolvedDomesticFoodUseTransactionId",
  "pendingDomesticFoodUse",
] as const;

export type SettlementFoodStoreClosure = "open" | "secured";
export type SettlementFoodStoreRisk = "food-exposed" | "rat-activity";
export type SettlementKeeperKnowledgeSource = "direct-observation" | "player-report";

export type SettlementDomesticAnimalOwner =
  | Readonly<{ readonly kind: "actor"; readonly id: string }>
  | Readonly<{ readonly kind: "settlement"; readonly id: number }>;

/**
 * Settlement-owned social/custody authority only. Actor bodies, needs,
 * locomotion, and momentary positions remain in their representation owners.
 */
export interface SettlementDomesticAnimalCustodyRecord {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION;
  readonly custodyOrdinal: number;
  readonly relationshipId: string;
  readonly homeId: string;
  readonly coopId: string;
  readonly settlementId: number;
  readonly owner: SettlementDomesticAnimalOwner;
  readonly caretakerActorId: string;
  readonly species: LivingActorSpecies;
  readonly memberActorIds: readonly string[];
  readonly memberGroupId: string | null;
  readonly homePosition: WorldPosition;
  readonly homeRadiusUnits: number;
}

export interface CreateSettlementDomesticAnimalCustodyInput {
  readonly custodyOrdinal: number;
  readonly owner: SettlementDomesticAnimalOwner;
  readonly caretakerActorId: string;
  readonly species: LivingActorSpecies;
  readonly memberActorIds: readonly string[];
  readonly memberGroupId: string | null;
  readonly homePosition: WorldPosition;
  readonly homeRadiusUnits: number;
}

export interface SettlementFoodStoreIdentity {
  readonly seedFingerprint: string;
  readonly storeId: string;
  readonly settlementId: number;
  readonly keeperActorId: string;
  readonly foodLotId: string;
  /** Stable settlement tile center, not an animal anchor. */
  readonly position: WorldPosition;
  /** Persisted habitat binding; later generator changes may not relocate it. */
  readonly ratAggregateId: string;
  readonly storeAnchorOrdinal: number;
}

export interface SettlementKeeperKnowledge {
  readonly evidenceId: string;
  readonly risk: SettlementFoodStoreRisk;
  readonly source: SettlementKeeperKnowledgeSource;
  readonly sourceActorId: string;
  readonly learnedAtTick: number;
  /** Fixed-point confidence in evidence, never hidden world truth. */
  readonly confidence: number;
}

export interface SettlementFoodLossTransaction {
  readonly transactionId: string;
  readonly ordinal: number;
  readonly storeId: string;
  readonly foodLotId: string;
  readonly ratAggregateId: string;
  readonly storeAnchorOrdinal: number;
  readonly quantity: typeof SETTLEMENT_ECOLOGY_MAX_LOSS_UNITS;
  readonly causeEventId: string;
  readonly causeEventTick: number;
}

/** Runtime supplies an already witnessed/contact-authorized attempt. */
export interface SettlementDomesticFoodUseRequest {
  readonly version: typeof SETTLEMENT_DOMESTIC_FOOD_USE_VERSION;
  readonly storeId: string;
  readonly foodLotId: string;
  readonly relationshipId: string;
  readonly memberActorId: string;
  readonly requestedQuantity: typeof SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY;
  readonly causeEventId: string;
  readonly causeEventTick: number;
}

export interface SettlementDomesticFoodUseTransaction {
  readonly version: typeof SETTLEMENT_DOMESTIC_FOOD_USE_VERSION;
  readonly transactionId: string;
  readonly ordinal: number;
  readonly storeId: string;
  readonly foodLotId: string;
  readonly relationshipId: string;
  readonly memberActorId: string;
  readonly species: LivingActorSpecies;
  readonly quantity: typeof SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY;
  readonly causeEventId: string;
  readonly causeEventTick: number;
}

export interface SettlementEcologyState {
  readonly version: typeof SETTLEMENT_ECOLOGY_VERSION;
  readonly revision: number;
  readonly identity: SettlementFoodStoreIdentity;
  readonly closure: SettlementFoodStoreClosure;
  /** Sole physical food-stock authority. Quantity is not mirrored elsewhere. */
  readonly carrier: LooseCargoCarrierState;
  readonly keeperKnowledge: readonly SettlementKeeperKnowledge[];
  readonly lastClosureTransactionId: string | null;
  readonly lastResolvedLossOrdinal: number;
  readonly lastResolvedTransactionId: string | null;
  readonly lastResolvedCauseEventId: string | null;
  readonly lastResolvedCauseEventTick: number | null;
  readonly pendingLoss: SettlementFoodLossTransaction | null;
  readonly domesticCustody: SettlementDomesticAnimalCustodyRecord | null;
  readonly lastResolvedDomesticFoodUseOrdinal: number;
  readonly lastResolvedDomesticFoodUseTransactionId: string | null;
  readonly lastResolvedDomesticFoodUseCauseEventId: string | null;
  readonly lastResolvedDomesticFoodUseCauseEventTick: number | null;
  readonly lastResolvedDomesticFoodUseMemberActorId: string | null;
  readonly pendingDomesticFoodUse: SettlementDomesticFoodUseTransaction | null;
}

export interface CreateSettlementEcologyStateInput {
  readonly rootSeed: RootSeed;
  readonly settlementId: number;
  readonly keeperActorId: string;
  readonly position: WorldPosition;
  /** Used once to bind the nearest current brown-rat anchor. */
  readonly aggregatePatch: CoreEcologyAggregatePatchState;
}

export interface SettlementPlayerStoreReport {
  readonly version: typeof SETTLEMENT_ECOLOGY_PLAYER_REPORT_VERSION;
  readonly reportId: string;
  readonly reporterActorId: typeof LOCAL_PLAYER_LIVING_ACTOR_ID;
  readonly recipientKeeperActorId: string;
  readonly storeId: string;
  readonly reportedAtTick: number;
  readonly risk: SettlementFoodStoreRisk;
  readonly confidence: number;
}

export type SettlementKeeperKnowledgeClaim =
  | Readonly<{
      readonly kind: "direct-observation";
      readonly risk: SettlementFoodStoreRisk;
      readonly observation: ActorObservation;
    }>
  | Readonly<{
      readonly kind: "player-report";
      readonly report: SettlementPlayerStoreReport;
    }>;

/** Source projection only; shared perception remains the wind/rain owner. */
export interface SettlementFoodStoreSourceProjection {
  readonly closure: SettlementFoodStoreClosure;
  readonly source: CoreEcologyAggregateExposedFoodSource;
}

/** Adapter authorization; Settlement Shadows remains aggregate-motion owner. */
export interface SettlementRatAttractionProposal {
  readonly proposalId: string;
  readonly executionOwnerId: typeof CORE_ECOLOGY_SMALL_WORLD_OWNER_ID;
  readonly atTick: number;
  readonly storeId: string;
  readonly foodLotId: string;
  readonly ratAggregateId: string;
  readonly storeAnchorOrdinal: number;
  readonly stimulusId: string;
  readonly maximumRedistributedUnits: typeof SETTLEMENT_ECOLOGY_MAX_REDISTRIBUTED_UNITS;
  readonly populationConservation: "required";
  readonly itemConsumption: "none";
}

export interface SettlementKeeperStoreResponseProposal {
  readonly transactionId: string;
  readonly kind: "secure-store";
  readonly keeperActorId: string;
  readonly storeId: string;
  readonly closure: "secured";
  readonly sourceEvidenceId: string;
  readonly source: SettlementKeeperKnowledgeSource;
  readonly proposedAtTick: number;
}

export interface SettlementKeeperStoreResponseResolution {
  readonly state: SettlementEcologyState;
  readonly applied: boolean;
}

export interface SettlementFoodLossStageResult {
  readonly state: SettlementEcologyState;
  readonly transaction: SettlementFoodLossTransaction;
  readonly reusedPendingTransaction: boolean;
}

export interface SettlementFoodLossResolution {
  readonly state: SettlementEcologyState;
  readonly applied: boolean;
  readonly removed: readonly CarriedCargoLot[];
}

export interface SettlementDomesticFoodUseStageResult {
  readonly state: SettlementEcologyState;
  readonly transaction: SettlementDomesticFoodUseTransaction;
  readonly reusedPendingTransaction: boolean;
}

export interface SettlementDomesticFoodUseResolution {
  readonly state: SettlementEcologyState;
  readonly applied: boolean;
  readonly removed: readonly CarriedCargoLot[];
}

/**
 * Completes a transaction that was durably staged before interruption. The
 * saved aggregate patch must still contain the exact physical relocation that
 * authorized it; otherwise recovery fails closed instead of inventing loss.
 */
export function recoverPendingSettlementFoodLoss(
  stateValue: unknown,
  postStepPatchValue: unknown,
): SettlementFoodLossResolution | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  const patch = canonicalizeCoreEcologyAggregatePatch(postStepPatchValue);
  if (state === null || patch === null) return null;
  if (state.pendingLoss === null) {
    return deepFreeze({ state, applied: false, removed: [] });
  }
  if (!postStepPatchAuthenticatesPendingLoss(patch, state.pendingLoss)) return null;
  return resolveSettlementFoodLoss(state, state.pendingLoss);
}

export function createSettlementEcologyState(
  input: CreateSettlementEcologyStateInput,
): SettlementEcologyState {
  if (
    !plainRecord(input)
    || !exactKeys(input, [
      "aggregatePatch",
      "keeperActorId",
      "position",
      "rootSeed",
      "settlementId",
    ])
    || !canonicalRootSeed(input.rootSeed)
    || !positiveSafeInteger(input.settlementId)
    || !livingSpeciesActorIdMatchesNamespace(input.keeperActorId, "human")
    || !isWorldPosition(input.position)
  ) throw new RangeError("Settlement ecology creation input is malformed");
  const patch = canonicalizeCoreEcologyAggregatePatch(input.aggregatePatch);
  if (patch === null) throw new RangeError("Settlement ecology aggregate patch is malformed");
  const ratBinding = nearestBrownRatAnchor(patch, input.position);
  if (ratBinding === null) throw new RangeError("Settlement ecology requires a brown-rat anchor");

  const seedFingerprint = hashCanonical([...input.rootSeed]);
  const identityDigest = storeIdentityDigest(
    seedFingerprint,
    input.settlementId,
    input.keeperActorId,
    input.position,
    ratBinding.aggregateId,
    ratBinding.anchor.anchorOrdinal,
  );
  const foodLotId = `STORE-FOOD-${identityDigest}`;
  const emptyCarrier = createLooseCargoCarrier(
    { kind: "settlement", id: input.settlementId },
    createCraftingInventory(SETTLEMENT_ECOLOGY_STORE_CAPACITY_MILLI),
  );
  const provision = addLooseCargoProvision(emptyCarrier, {
    sourceLotId: foodLotId,
    provision: "fresh-produce",
    quantity: SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY,
  });
  if (!provision.ok || provision.reason !== "applied") {
    throw new Error("Settlement ecology provision lot could not be created");
  }
  const state = canonicalizeSettlementEcologyState({
    version: SETTLEMENT_ECOLOGY_VERSION,
    revision: 0,
    identity: {
      seedFingerprint,
      storeId: `STORE-${identityDigest}`,
      settlementId: input.settlementId,
      keeperActorId: input.keeperActorId,
      foodLotId,
      position: input.position,
      ratAggregateId: ratBinding.aggregateId,
      storeAnchorOrdinal: ratBinding.anchor.anchorOrdinal,
    },
    closure: "open",
    carrier: provision.carrier,
    keeperKnowledge: [],
    lastClosureTransactionId: null,
    lastResolvedLossOrdinal: 0,
    lastResolvedTransactionId: null,
    lastResolvedCauseEventId: null,
    lastResolvedCauseEventTick: null,
    pendingLoss: null,
    domesticCustody: null,
    lastResolvedDomesticFoodUseOrdinal: 0,
    lastResolvedDomesticFoodUseTransactionId: null,
    lastResolvedDomesticFoodUseCauseEventId: null,
    lastResolvedDomesticFoodUseCauseEventTick: null,
    lastResolvedDomesticFoodUseMemberActorId: null,
    pendingDomesticFoodUse: null,
  });
  if (state === null) throw new Error("Derived settlement ecology state failed validation");
  return state;
}

export function canonicalizeSettlementEcologyState(value: unknown): SettlementEcologyState | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, SETTLEMENT_ECOLOGY_V2_STATE_KEYS)
    || value.version !== SETTLEMENT_ECOLOGY_VERSION
    || !nonnegativeSafeInteger(value.revision)
    || !validClosure(value.closure)
    || !Array.isArray(value.keeperKnowledge)
    || value.keeperKnowledge.length > SETTLEMENT_ECOLOGY_MAX_KEEPER_KNOWLEDGE
    || !nonnegativeSafeInteger(value.lastResolvedLossOrdinal)
    || value.lastResolvedLossOrdinal > SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY
    || !nonnegativeSafeInteger(value.lastResolvedDomesticFoodUseOrdinal)
    || value.lastResolvedDomesticFoodUseOrdinal > SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY
    || value.lastResolvedLossOrdinal + value.lastResolvedDomesticFoodUseOrdinal
      > SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY
  ) return null;
  const identity = canonicalIdentity(value.identity);
  if (identity === null) return null;
  const domesticCustody = value.domesticCustody === null
    ? null
    : canonicalDomesticCustody(value.domesticCustody, identity);
  if (value.domesticCustody !== null && domesticCustody === null) return null;
  const carrierValidation = validateLooseCargoCarrier(value.carrier);
  if (!carrierValidation.valid || carrierValidation.carrier === null) return null;
  const carrier = carrierValidation.carrier;
  if (!carrierMatchesStore(
    carrier,
    identity,
    value.lastResolvedLossOrdinal,
    value.lastResolvedDomesticFoodUseOrdinal,
  )) return null;

  const knowledge: SettlementKeeperKnowledge[] = [];
  const evidenceIds = new Set<string>();
  for (const candidate of value.keeperKnowledge) {
    const record = canonicalKnowledge(candidate, identity);
    if (record === null || evidenceIds.has(record.evidenceId)) return null;
    evidenceIds.add(record.evidenceId);
    knowledge.push(record);
  }
  const orderedKnowledge = [...knowledge].sort(compareKnowledge);
  if (stableStringify(knowledge) !== stableStringify(orderedKnowledge)) return null;
  const closureTransaction = canonicalNullableId(value.lastClosureTransactionId);
  const closureKnowledge = closureTransaction === null || closureTransaction === undefined
    ? undefined
    : orderedKnowledge.find(({ evidenceId }) => (
        closureTransaction === closureTransactionId(identity.storeId, evidenceId)
      ));
  if (
    closureTransaction === undefined
    || value.closure === "open" && closureTransaction !== null
    || value.closure === "secured" && closureKnowledge === undefined
  ) return null;
  const resolved = canonicalResolvedFields(value, identity);
  if (resolved === null) return null;
  const resolvedDomesticFoodUse = canonicalResolvedDomesticFoodUseFields(
    value,
    identity,
    domesticCustody,
  );
  if (resolvedDomesticFoodUse === null) return null;
  const pending = value.pendingLoss === null
    ? null
    : canonicalLossTransaction(value.pendingLoss, identity);
  const pendingDomesticFoodUse = value.pendingDomesticFoodUse === null
    ? null
    : canonicalDomesticFoodUseTransaction(
        value.pendingDomesticFoodUse,
        identity,
        domesticCustody,
      );
  if (
    value.pendingLoss !== null && pending === null
    || value.pendingDomesticFoodUse !== null && pendingDomesticFoodUse === null
    || pending !== null && pendingDomesticFoodUse !== null
    || pending !== null && (
      pending.ordinal !== value.lastResolvedLossOrdinal + 1
      || pending.causeEventTick <= (resolved.lastResolvedCauseEventTick ?? -1)
      || value.closure !== "open"
      || liveFoodQuantity(carrier, identity.foodLotId) < pending.quantity
    )
    || pendingDomesticFoodUse !== null && (
      domesticCustody === null
      || pendingDomesticFoodUse.ordinal !== value.lastResolvedDomesticFoodUseOrdinal + 1
      || pendingDomesticFoodUse.causeEventTick
        <= (resolvedDomesticFoodUse.lastResolvedDomesticFoodUseCauseEventTick ?? -1)
      || value.closure !== "open"
      || liveFoodQuantity(carrier, identity.foodLotId) < pendingDomesticFoodUse.quantity
    )
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_ECOLOGY_VERSION,
    revision: value.revision,
    identity,
    closure: value.closure,
    carrier,
    keeperKnowledge: orderedKnowledge,
    lastClosureTransactionId: closureTransaction,
    lastResolvedLossOrdinal: value.lastResolvedLossOrdinal,
    lastResolvedTransactionId: resolved.lastResolvedTransactionId,
    lastResolvedCauseEventId: resolved.lastResolvedCauseEventId,
    lastResolvedCauseEventTick: resolved.lastResolvedCauseEventTick,
    pendingLoss: pending,
    domesticCustody,
    lastResolvedDomesticFoodUseOrdinal: value.lastResolvedDomesticFoodUseOrdinal,
    lastResolvedDomesticFoodUseTransactionId:
      resolvedDomesticFoodUse.lastResolvedDomesticFoodUseTransactionId,
    lastResolvedDomesticFoodUseCauseEventId:
      resolvedDomesticFoodUse.lastResolvedDomesticFoodUseCauseEventId,
    lastResolvedDomesticFoodUseCauseEventTick:
      resolvedDomesticFoodUse.lastResolvedDomesticFoodUseCauseEventTick,
    lastResolvedDomesticFoodUseMemberActorId:
      resolvedDomesticFoodUse.lastResolvedDomesticFoodUseMemberActorId,
    pendingDomesticFoodUse,
  });
}

/**
 * Strictly migrates the only prior payload shape. Current payloads are returned
 * canonically, while future/extra fields fail closed.
 */
export function migrateSettlementEcologyState(value: unknown): SettlementEcologyState | null {
  const current = canonicalizeSettlementEcologyState(value);
  if (current !== null) return current;
  if (
    !plainRecord(value)
    || !exactKeys(value, SETTLEMENT_ECOLOGY_V1_STATE_KEYS)
    || value.version !== SETTLEMENT_ECOLOGY_PRIOR_VERSION
  ) return null;
  return canonicalizeSettlementEcologyState({
    ...value,
    version: SETTLEMENT_ECOLOGY_VERSION,
    domesticCustody: null,
    lastResolvedDomesticFoodUseOrdinal: 0,
    lastResolvedDomesticFoodUseTransactionId: null,
    lastResolvedDomesticFoodUseCauseEventId: null,
    lastResolvedDomesticFoodUseCauseEventTick: null,
    lastResolvedDomesticFoodUseMemberActorId: null,
    pendingDomesticFoodUse: null,
  });
}

export function serializeSettlementEcologyState(value: unknown): string {
  const state = canonicalizeSettlementEcologyState(value);
  if (state === null) throw new TypeError("Cannot serialize malformed settlement ecology state");
  const encoded = stableStringify(state);
  if (UTF8_ENCODER.encode(encoded).byteLength > SETTLEMENT_ECOLOGY_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Settlement ecology state exceeds its serialized budget");
  }
  return encoded;
}

export function deserializeSettlementEcologyState(encoded: unknown): SettlementEcologyState {
  if (
    typeof encoded !== "string"
    || UTF8_ENCODER.encode(encoded).byteLength > SETTLEMENT_ECOLOGY_MAX_SERIALIZED_BYTES
  ) throw new TypeError("Settlement ecology payload is malformed");
  let decoded: unknown;
  try {
    decoded = JSON.parse(encoded) as unknown;
  } catch {
    throw new TypeError("Settlement ecology payload is not valid JSON");
  }
  const state = migrateSettlementEcologyState(decoded);
  if (state === null) throw new TypeError("Settlement ecology payload failed validation");
  return state;
}

/** Derives immutable relationship/home identities without owning animal state. */
export function createSettlementDomesticAnimalCustody(
  stateValue: unknown,
  inputValue: unknown,
): SettlementDomesticAnimalCustodyRecord | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (
    state === null
    || !plainRecord(inputValue)
    || !exactKeys(inputValue, [
      "caretakerActorId",
      "custodyOrdinal",
      "homePosition",
      "homeRadiusUnits",
      "memberActorIds",
      "memberGroupId",
      "owner",
      "species",
    ])
    || !nonnegativeSafeInteger(inputValue.custodyOrdinal)
    || !isLivingActorSpecies(inputValue.species)
    || inputValue.species === "human"
    || !isLivingSpeciesActorAddressable(inputValue.species)
    || !Array.isArray(inputValue.memberActorIds)
    || inputValue.memberActorIds.length === 0
    || inputValue.memberActorIds.length > SETTLEMENT_ECOLOGY_MAX_DOMESTIC_MEMBERS
    || typeof inputValue.caretakerActorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(inputValue.caretakerActorId, "human")
    || !isWorldPosition(inputValue.homePosition)
    || !positiveSafeInteger(inputValue.homeRadiusUnits)
    || inputValue.homeRadiusUnits > SETTLEMENT_ECOLOGY_MAX_DOMESTIC_HOME_RADIUS_UNITS
  ) return null;
  const owner = canonicalDomesticOwner(inputValue.owner, state.identity.settlementId);
  const memberGroupId = canonicalNullableId(inputValue.memberGroupId);
  if (owner === null || memberGroupId === undefined) return null;
  const memberActorIds = inputValue.memberActorIds.map((candidate) => (
    typeof candidate === "string" ? candidate : ""
  ));
  if (
    memberActorIds.some((actorId) => (
      !livingSpeciesActorIdMatchesNamespace(actorId, inputValue.species)
    ))
    || new Set(memberActorIds).size !== memberActorIds.length
    || !domesticGroupMatchesSpecies(memberGroupId, inputValue.species)
  ) return null;
  memberActorIds.sort(compareText);
  const digest = domesticCustodyIdentityDigest(
    state.identity,
    inputValue.custodyOrdinal,
    inputValue.species,
  );
  return canonicalDomesticCustody({
    version: SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION,
    custodyOrdinal: inputValue.custodyOrdinal,
    relationshipId: `DOMESTIC-REL-${digest}`,
    homeId: `DOMESTIC-HOME-${digest}`,
    coopId: `DOMESTIC-COOP-${digest}`,
    settlementId: state.identity.settlementId,
    owner,
    caretakerActorId: inputValue.caretakerActorId,
    species: inputValue.species,
    memberActorIds,
    memberGroupId,
    homePosition: inputValue.homePosition,
    homeRadiusUnits: inputValue.homeRadiusUnits,
  }, state.identity);
}

/** Establishes the one bounded domestic relationship owned by this store. */
export function establishSettlementDomesticAnimalCustody(
  stateValue: unknown,
  inputValue: unknown,
): SettlementEcologyState | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (state === null) return null;
  const custody = createSettlementDomesticAnimalCustody(state, inputValue);
  if (custody === null) return null;
  if (state.domesticCustody !== null) {
    return stableStringify(state.domesticCustody) === stableStringify(custody) ? state : null;
  }
  return canonicalizeSettlementEcologyState({
    ...state,
    revision: increment(state.revision),
    domesticCustody: custody,
  });
}

/**
 * Stages exactly one use of the physical store lot. Runtime retains ownership
 * of contact, perception, cognition, and need authorization.
 */
export function stageSettlementDomesticFoodUse(
  stateValue: unknown,
  requestValue: unknown,
): SettlementDomesticFoodUseStageResult | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (state === null) return null;
  const request = canonicalDomesticFoodUseRequest(requestValue);
  if (request === null) return null;
  if (state.pendingDomesticFoodUse !== null) {
    return domesticFoodUseRequestMatchesTransaction(request, state.pendingDomesticFoodUse)
      ? deepFreeze({
          state,
          transaction: state.pendingDomesticFoodUse,
          reusedPendingTransaction: true,
        })
      : null;
  }
  const custody = state.domesticCustody;
  if (
    custody === null
    || state.pendingLoss !== null
    || state.closure !== "open"
    || request.storeId !== state.identity.storeId
    || request.foodLotId !== state.identity.foodLotId
    || request.relationshipId !== custody.relationshipId
    || !custody.memberActorIds.includes(request.memberActorId)
    || !livingSpeciesActorIdMatchesNamespace(request.memberActorId, custody.species)
    || request.causeEventTick <= (state.lastResolvedDomesticFoodUseCauseEventTick ?? -1)
    || request.causeEventId === state.lastResolvedDomesticFoodUseCauseEventId
    || liveFoodQuantity(state.carrier, state.identity.foodLotId)
      < SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY
  ) return null;
  const ordinal = increment(state.lastResolvedDomesticFoodUseOrdinal);
  const transaction: SettlementDomesticFoodUseTransaction = deepFreeze({
    version: SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
    transactionId: domesticFoodUseTransactionId(
      state.identity,
      custody,
      request.memberActorId,
      ordinal,
      request.causeEventId,
    ),
    ordinal,
    storeId: state.identity.storeId,
    foodLotId: state.identity.foodLotId,
    relationshipId: custody.relationshipId,
    memberActorId: request.memberActorId,
    species: custody.species,
    quantity: SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY,
    causeEventId: request.causeEventId,
    causeEventTick: request.causeEventTick,
  });
  const nextState = canonicalizeSettlementEcologyState({
    ...state,
    revision: increment(state.revision),
    pendingDomesticFoodUse: transaction,
  });
  return nextState === null
    ? null
    : deepFreeze({ state: nextState, transaction, reusedPendingTransaction: false });
}

/** Atomically consumes one unit through the shared physical carrier. */
export function resolveSettlementDomesticFoodUse(
  stateValue: unknown,
  transactionValue: unknown,
): SettlementDomesticFoodUseResolution | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (state === null) return null;
  const transaction = canonicalDomesticFoodUseTransaction(
    transactionValue,
    state.identity,
    state.domesticCustody,
  );
  if (transaction === null) return null;
  if (state.pendingDomesticFoodUse === null) {
    const replay = transaction.ordinal === state.lastResolvedDomesticFoodUseOrdinal
      && transaction.transactionId === state.lastResolvedDomesticFoodUseTransactionId
      && transaction.causeEventId === state.lastResolvedDomesticFoodUseCauseEventId
      && transaction.causeEventTick === state.lastResolvedDomesticFoodUseCauseEventTick
      && transaction.memberActorId === state.lastResolvedDomesticFoodUseMemberActorId;
    return replay ? deepFreeze({ state, applied: false, removed: [] }) : null;
  }
  if (stableStringify(transaction) !== stableStringify(state.pendingDomesticFoodUse)) return null;
  const consumed = consumeLooseCargoProvisionLot(state.carrier, {
    lotId: state.identity.foodLotId,
    quantity: transaction.quantity,
  });
  if (
    !consumed.ok
    || consumed.reason !== "applied"
    || consumed.removed.length !== 1
    || consumed.removed[0]?.id !== state.identity.foodLotId
  ) return null;
  const nextState = canonicalizeSettlementEcologyState({
    ...state,
    revision: increment(state.revision),
    carrier: consumed.carrier,
    lastResolvedDomesticFoodUseOrdinal: transaction.ordinal,
    lastResolvedDomesticFoodUseTransactionId: transaction.transactionId,
    lastResolvedDomesticFoodUseCauseEventId: transaction.causeEventId,
    lastResolvedDomesticFoodUseCauseEventTick: transaction.causeEventTick,
    lastResolvedDomesticFoodUseMemberActorId: transaction.memberActorId,
    pendingDomesticFoodUse: null,
  });
  return nextState === null
    ? null
    : deepFreeze({ state: nextState, applied: true, removed: consumed.removed });
}

/** Completes a durably staged, already-authenticated domestic food use. */
export function recoverPendingSettlementDomesticFoodUse(
  stateValue: unknown,
): SettlementDomesticFoodUseResolution | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (state === null) return null;
  return state.pendingDomesticFoodUse === null
    ? deepFreeze({ state, applied: false, removed: [] })
    : resolveSettlementDomesticFoodUse(state, state.pendingDomesticFoodUse);
}

/**
 * Projects stable physical source strength and closure leakage only. Weather,
 * direction, range, and observation stay in aggregate perception.
 */
export function projectSettlementFoodStoreSource(
  stateValue: unknown,
): SettlementFoodStoreSourceProjection | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (state === null || liveFoodQuantity(state.carrier, state.identity.foodLotId) === 0) return null;
  return deepFreeze({
    closure: state.closure,
    source: {
      sourceReferenceId: state.identity.foodLotId,
      position: state.identity.position,
      sourceStrength: PROVISION_DEFINITIONS["fresh-produce"].scentStrength,
      packagingLeakage: state.closure === "open"
        ? OPEN_PACKAGING_LEAKAGE
        : SECURED_PACKAGING_LEAKAGE,
    },
  });
}

/** Authenticates store-food evidence but delegates relocation to v3. */
export function proposeSettlementRatAttraction(
  stateValue: unknown,
  patchValue: unknown,
  frameValue: unknown,
): SettlementRatAttractionProposal | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  const frame = canonicalizeCoreEcologySettlementShadowsStimulusFrame(frameValue);
  if (
    state === null
    || patch === null
    || frame === null
    || state.closure !== "open"
    || liveFoodQuantity(state.carrier, state.identity.foodLotId) === 0
    || frame.atTick !== patch.updatedAtTick
  ) return null;
  const rats = patch.aggregatePopulations.find(({ aggregateId }) => (
    aggregateId === state.identity.ratAggregateId
  ));
  if (
    rats === undefined
    || rats.species !== "brown-rat"
    || !rats.anchors.some(({ anchorOrdinal }) => (
      anchorOrdinal === state.identity.storeAnchorOrdinal
    ))
  ) return null;
  const stimulus = frame.stimuli.filter((candidate) => (
    candidate.targetAggregateId === state.identity.ratAggregateId
    && candidate.sourceReferenceId === state.identity.foodLotId
    && candidate.sourceKind === "exposed-food"
    && candidate.response === "attraction"
    && candidate.channels.length === 1
    && candidate.channels[0] === "scent"
    && (candidate.anchorInfluences.find(({ anchorOrdinal }) => (
      anchorOrdinal === state.identity.storeAnchorOrdinal
    ))?.intensity ?? 0) > 0
  )).sort((left, right) => compareText(left.stimulusId, right.stimulusId))[0];
  if (stimulus === undefined) return null;
  return deepFreeze({
    proposalId: ratAttractionProposalId(state.identity, frame.atTick, stimulus.stimulusId),
    executionOwnerId: CORE_ECOLOGY_SMALL_WORLD_OWNER_ID,
    atTick: frame.atTick,
    storeId: state.identity.storeId,
    foodLotId: state.identity.foodLotId,
    ratAggregateId: state.identity.ratAggregateId,
    storeAnchorOrdinal: state.identity.storeAnchorOrdinal,
    stimulusId: stimulus.stimulusId,
    maximumRedistributedUnits: SETTLEMENT_ECOLOGY_MAX_REDISTRIBUTED_UNITS,
    populationConservation: "required",
    itemConsumption: "none",
  });
}

/** Records only the keeper's direct contact or an explicit in-person report. */
export function recordSettlementKeeperKnowledge(
  stateValue: unknown,
  atTick: unknown,
  claimValue: unknown,
): SettlementEcologyState | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (state === null || !nonnegativeSafeInteger(atTick)) return null;
  const record = knowledgeFromClaim(state, atTick, claimValue);
  if (record === null) return null;
  const existing = state.keeperKnowledge.find(({ evidenceId }) => evidenceId === record.evidenceId);
  if (existing !== undefined) return stableStringify(existing) === stableStringify(record) ? state : null;
  const retained = [...state.keeperKnowledge, record]
    .sort(compareKnowledge)
    .slice(-SETTLEMENT_ECOLOGY_MAX_KEEPER_KNOWLEDGE);
  return canonicalizeSettlementEcologyState({
    ...state,
    revision: increment(state.revision),
    keeperKnowledge: retained,
  });
}

/**
 * Builds the explicit report after runtime has independently authorized an
 * in-person interaction. This kernel never guesses distance or conversation.
 */
export function createSettlementPlayerStoreReport(
  stateValue: unknown,
  atTick: unknown,
): SettlementPlayerStoreReport | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (state === null || !nonnegativeSafeInteger(atTick)) return null;
  return deepFreeze({
    version: SETTLEMENT_ECOLOGY_PLAYER_REPORT_VERSION,
    reportId: playerStoreReportId(state.identity, atTick),
    reporterActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    recipientKeeperActorId: state.identity.keeperActorId,
    storeId: state.identity.storeId,
    reportedAtTick: atTick,
    risk: "food-exposed",
    confidence: SETTLEMENT_ECOLOGY_PLAYER_REPORT_CONFIDENCE,
  });
}

export function proposeSettlementKeeperStoreResponse(
  stateValue: unknown,
  atTick: unknown,
): SettlementKeeperStoreResponseProposal | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (
    state === null
    || !nonnegativeSafeInteger(atTick)
    || state.closure !== "open"
    || liveFoodQuantity(state.carrier, state.identity.foodLotId) === 0
  ) return null;
  const knowledge = state.keeperKnowledge[state.keeperKnowledge.length - 1];
  if (knowledge === undefined || knowledge.learnedAtTick > atTick) return null;
  return deepFreeze({
    transactionId: closureTransactionId(state.identity.storeId, knowledge.evidenceId),
    kind: "secure-store",
    keeperActorId: state.identity.keeperActorId,
    storeId: state.identity.storeId,
    closure: "secured",
    sourceEvidenceId: knowledge.evidenceId,
    source: knowledge.source,
    proposedAtTick: atTick,
  });
}

export function applySettlementKeeperStoreResponse(
  stateValue: unknown,
  proposalValue: unknown,
): SettlementKeeperStoreResponseResolution | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  const proposal = canonicalKeeperResponse(proposalValue);
  if (state === null || proposal === null || proposal.storeId !== state.identity.storeId) return null;
  if (state.closure === "secured") {
    return proposal.transactionId === state.lastClosureTransactionId
      ? deepFreeze({ state, applied: false })
      : null;
  }
  const knowledge = state.keeperKnowledge.find(({ evidenceId }) => (
    evidenceId === proposal.sourceEvidenceId
  ));
  if (
    knowledge === undefined
    || proposal.keeperActorId !== state.identity.keeperActorId
    || proposal.source !== knowledge.source
    || proposal.proposedAtTick < knowledge.learnedAtTick
    || proposal.transactionId !== closureTransactionId(
      state.identity.storeId,
      knowledge.evidenceId,
    )
  ) return null;
  const nextState = canonicalizeSettlementEcologyState({
    ...state,
    revision: increment(state.revision),
    closure: "secured",
    lastClosureTransactionId: proposal.transactionId,
  });
  return nextState === null ? null : deepFreeze({ state: nextState, applied: true });
}

/** Stages one loss only after v3 emits a matching conserved relocation. */
export function stageSettlementFoodLoss(
  stateValue: unknown,
  attractionValue: unknown,
  postStepPatchValue: unknown,
  eventValue: unknown,
): SettlementFoodLossStageResult | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  const attraction = canonicalRatAttractionProposal(attractionValue);
  const postStepPatch = canonicalizeCoreEcologyAggregatePatch(postStepPatchValue);
  const event = canonicalRatAttractionEvent(eventValue);
  if (
    state === null
    || attraction === null
    || postStepPatch === null
    || event === null
    || !postStepPatchAuthenticatesAttraction(postStepPatch, event)
  ) return null;
  if (state.pendingLoss !== null) {
    return attractionMatchesPending(attraction, state.pendingLoss)
      && event.eventId === state.pendingLoss.causeEventId
      && eventMatchesAttraction(event, attraction)
      ? deepFreeze({
          state,
          transaction: state.pendingLoss,
          reusedPendingTransaction: true,
        })
      : null;
  }
  if (
    state.closure !== "open"
    || state.pendingDomesticFoodUse !== null
    || liveFoodQuantity(state.carrier, state.identity.foodLotId) < SETTLEMENT_ECOLOGY_MAX_LOSS_UNITS
    || attraction.storeId !== state.identity.storeId
    || attraction.foodLotId !== state.identity.foodLotId
    || attraction.ratAggregateId !== state.identity.ratAggregateId
    || attraction.storeAnchorOrdinal !== state.identity.storeAnchorOrdinal
    || !eventMatchesAttraction(event, attraction)
    || event.atTick <= (state.lastResolvedCauseEventTick ?? -1)
    || event.eventId === state.lastResolvedCauseEventId
  ) return null;
  const ordinal = increment(state.lastResolvedLossOrdinal);
  const transaction: SettlementFoodLossTransaction = deepFreeze({
    transactionId: lossTransactionId(state.identity, ordinal, event.eventId),
    ordinal,
    storeId: state.identity.storeId,
    foodLotId: state.identity.foodLotId,
    ratAggregateId: state.identity.ratAggregateId,
    storeAnchorOrdinal: state.identity.storeAnchorOrdinal,
    quantity: SETTLEMENT_ECOLOGY_MAX_LOSS_UNITS,
    causeEventId: event.eventId,
    causeEventTick: event.atTick,
  });
  const nextState = canonicalizeSettlementEcologyState({
    ...state,
    revision: increment(state.revision),
    pendingLoss: transaction,
  });
  return nextState === null
    ? null
    : deepFreeze({ state: nextState, transaction, reusedPendingTransaction: false });
}

/** Atomically consumes the state's sole physical lot; replay is inert. */
export function resolveSettlementFoodLoss(
  stateValue: unknown,
  transactionValue: unknown,
): SettlementFoodLossResolution | null {
  const state = canonicalizeSettlementEcologyState(stateValue);
  if (state === null) return null;
  const transaction = canonicalLossTransaction(transactionValue, state.identity);
  if (transaction === null) return null;
  if (state.pendingLoss === null) {
    const replay = transaction.ordinal === state.lastResolvedLossOrdinal
      && transaction.transactionId === state.lastResolvedTransactionId
      && transaction.causeEventId === state.lastResolvedCauseEventId
      && transaction.causeEventTick === state.lastResolvedCauseEventTick;
    return replay ? deepFreeze({ state, applied: false, removed: [] }) : null;
  }
  if (stableStringify(transaction) !== stableStringify(state.pendingLoss)) return null;
  const consumed = consumeLooseCargoProvisionLot(state.carrier, {
    lotId: state.identity.foodLotId,
    quantity: transaction.quantity,
  });
  if (
    !consumed.ok
    || consumed.reason !== "applied"
    || consumed.removed.length !== 1
    || consumed.removed[0]?.id !== state.identity.foodLotId
  ) return null;
  const nextState = canonicalizeSettlementEcologyState({
    ...state,
    revision: increment(state.revision),
    carrier: consumed.carrier,
    lastResolvedLossOrdinal: transaction.ordinal,
    lastResolvedTransactionId: transaction.transactionId,
    lastResolvedCauseEventId: transaction.causeEventId,
    lastResolvedCauseEventTick: transaction.causeEventTick,
    pendingLoss: null,
  });
  return nextState === null
    ? null
    : deepFreeze({ state: nextState, applied: true, removed: consumed.removed });
}

function nearestBrownRatAnchor(
  patch: CoreEcologyAggregatePatchState,
  position: WorldPosition,
): Readonly<{ aggregateId: string; anchor: CoreEcologyAggregateAreaAnchor }> | null {
  const candidates = patch.aggregatePopulations
    .filter(({ species }) => species === "brown-rat")
    .flatMap((population) => population.anchors.map((anchor) => ({
      aggregateId: population.aggregateId,
      anchor,
      distanceSquared: worldDistanceSquared(position, anchor.position),
    })))
    .sort((left, right) => compareBigInt(left.distanceSquared, right.distanceSquared)
      || compareText(left.aggregateId, right.aggregateId)
      || left.anchor.anchorOrdinal - right.anchor.anchorOrdinal);
  const selected = candidates[0];
  return selected === undefined
    ? null
    : deepFreeze({ aggregateId: selected.aggregateId, anchor: selected.anchor });
}

function knowledgeFromClaim(
  state: SettlementEcologyState,
  atTick: number,
  value: unknown,
): SettlementKeeperKnowledge | null {
  if (!plainRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "direct-observation") {
    if (!exactKeys(value, ["kind", "observation", "risk"]) || !validRisk(value.risk)) return null;
    const observation = canonicalSingleObservation(value.observation);
    if (
      observation === null
      || observation.observerId !== state.identity.keeperActorId
      || observation.observedAtTick !== atTick
      || observation.channel !== "vision"
      || !observationMatchesRisk(observation, value.risk, state.identity.foodLotId)
      || !observationAreaCanReferToStore(observation, state.identity.position)
    ) return null;
    return deepFreeze({
      evidenceId: observation.id,
      risk: value.risk,
      source: "direct-observation",
      sourceActorId: observation.observerId,
      learnedAtTick: atTick,
      confidence: observation.confidence,
    });
  }
  if (value.kind !== "player-report" || !exactKeys(value, ["kind", "report"])) return null;
  const report = canonicalPlayerReport(value.report);
  if (
    report === null
    || report.reportedAtTick !== atTick
    || report.recipientKeeperActorId !== state.identity.keeperActorId
    || report.storeId !== state.identity.storeId
  ) return null;
  return deepFreeze({
    evidenceId: report.reportId,
    risk: report.risk,
    source: "player-report",
    sourceActorId: report.reporterActorId,
    learnedAtTick: atTick,
    confidence: report.confidence,
  });
}

function canonicalIdentity(value: unknown): SettlementFoodStoreIdentity | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "foodLotId",
      "keeperActorId",
      "position",
      "ratAggregateId",
      "seedFingerprint",
      "settlementId",
      "storeAnchorOrdinal",
      "storeId",
    ])
    || typeof value.seedFingerprint !== "string"
    || !HASH_PATTERN.test(value.seedFingerprint)
    || !positiveSafeInteger(value.settlementId)
    || typeof value.keeperActorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(value.keeperActorId, "human")
    || !isWorldPosition(value.position)
    || !validId(value.ratAggregateId)
    || !nonnegativeSafeInteger(value.storeAnchorOrdinal)
  ) return null;
  const digest = storeIdentityDigest(
    value.seedFingerprint,
    value.settlementId,
    value.keeperActorId,
    value.position,
    value.ratAggregateId,
    value.storeAnchorOrdinal,
  );
  if (value.storeId !== `STORE-${digest}` || value.foodLotId !== `STORE-FOOD-${digest}`) return null;
  return deepFreeze({
    seedFingerprint: value.seedFingerprint,
    storeId: value.storeId,
    settlementId: value.settlementId,
    keeperActorId: value.keeperActorId,
    foodLotId: value.foodLotId,
    position: createWorldPosition(value.position.region, value.position.localX, value.position.localY),
    ratAggregateId: value.ratAggregateId,
    storeAnchorOrdinal: value.storeAnchorOrdinal,
  });
}

function canonicalDomesticOwner(
  value: unknown,
  settlementId: number,
): SettlementDomesticAnimalOwner | null {
  if (!plainRecord(value) || !exactKeys(value, ["id", "kind"])) return null;
  if (value.kind === "actor") {
    return typeof value.id === "string"
      && validId(value.id)
      && livingSpeciesActorIdMatchesNamespace(value.id, "human")
      ? deepFreeze({ kind: "actor", id: value.id })
      : null;
  }
  return value.kind === "settlement" && value.id === settlementId
    ? deepFreeze({ kind: "settlement", id: settlementId })
    : null;
}

function canonicalDomesticCustody(
  value: unknown,
  identity: SettlementFoodStoreIdentity,
): SettlementDomesticAnimalCustodyRecord | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "caretakerActorId",
      "coopId",
      "custodyOrdinal",
      "homeId",
      "homePosition",
      "homeRadiusUnits",
      "memberActorIds",
      "memberGroupId",
      "owner",
      "relationshipId",
      "settlementId",
      "species",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION
    || !nonnegativeSafeInteger(value.custodyOrdinal)
    || value.settlementId !== identity.settlementId
    || !isLivingActorSpecies(value.species)
    || value.species === "human"
    || !isLivingSpeciesActorAddressable(value.species)
    || typeof value.caretakerActorId !== "string"
    || !validId(value.caretakerActorId)
    || !livingSpeciesActorIdMatchesNamespace(value.caretakerActorId, "human")
    || !Array.isArray(value.memberActorIds)
    || value.memberActorIds.length === 0
    || value.memberActorIds.length > SETTLEMENT_ECOLOGY_MAX_DOMESTIC_MEMBERS
    || !isWorldPosition(value.homePosition)
    || !positiveSafeInteger(value.homeRadiusUnits)
    || value.homeRadiusUnits > SETTLEMENT_ECOLOGY_MAX_DOMESTIC_HOME_RADIUS_UNITS
  ) return null;
  const owner = canonicalDomesticOwner(value.owner, identity.settlementId);
  const memberGroupId = canonicalNullableId(value.memberGroupId);
  if (
    owner === null
    || memberGroupId === undefined
    || !domesticGroupMatchesSpecies(memberGroupId, value.species)
  ) return null;
  const memberActorIds: string[] = [];
  const seenActorIds = new Set<string>();
  for (const actorId of value.memberActorIds) {
    if (
      typeof actorId !== "string"
      || !validId(actorId)
      || !livingSpeciesActorIdMatchesNamespace(actorId, value.species)
      || seenActorIds.has(actorId)
    ) return null;
    seenActorIds.add(actorId);
    memberActorIds.push(actorId);
  }
  const orderedMemberActorIds = [...memberActorIds].sort(compareText);
  if (stableStringify(memberActorIds) !== stableStringify(orderedMemberActorIds)) return null;
  const digest = domesticCustodyIdentityDigest(identity, value.custodyOrdinal, value.species);
  if (
    value.relationshipId !== `DOMESTIC-REL-${digest}`
    || value.homeId !== `DOMESTIC-HOME-${digest}`
    || value.coopId !== `DOMESTIC-COOP-${digest}`
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION,
    custodyOrdinal: value.custodyOrdinal,
    relationshipId: value.relationshipId,
    homeId: value.homeId,
    coopId: value.coopId,
    settlementId: identity.settlementId,
    owner,
    caretakerActorId: value.caretakerActorId,
    species: value.species,
    memberActorIds: orderedMemberActorIds,
    memberGroupId,
    homePosition: createWorldPosition(
      value.homePosition.region,
      value.homePosition.localX,
      value.homePosition.localY,
    ),
    homeRadiusUnits: value.homeRadiusUnits,
  });
}

function canonicalDomesticFoodUseRequest(
  value: unknown,
): SettlementDomesticFoodUseRequest | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "causeEventId",
      "causeEventTick",
      "foodLotId",
      "memberActorId",
      "relationshipId",
      "requestedQuantity",
      "storeId",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_FOOD_USE_VERSION
    || !validId(value.storeId)
    || !validId(value.foodLotId)
    || !validId(value.relationshipId)
    || !validId(value.memberActorId)
    || value.requestedQuantity !== SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY
    || !validId(value.causeEventId)
    || !nonnegativeSafeInteger(value.causeEventTick)
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
    storeId: value.storeId,
    foodLotId: value.foodLotId,
    relationshipId: value.relationshipId,
    memberActorId: value.memberActorId,
    requestedQuantity: SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY,
    causeEventId: value.causeEventId,
    causeEventTick: value.causeEventTick,
  });
}

function canonicalDomesticFoodUseTransaction(
  value: unknown,
  identity: SettlementFoodStoreIdentity,
  custody: SettlementDomesticAnimalCustodyRecord | null,
): SettlementDomesticFoodUseTransaction | null {
  if (
    custody === null
    || !plainRecord(value)
    || !exactKeys(value, [
      "causeEventId",
      "causeEventTick",
      "foodLotId",
      "memberActorId",
      "ordinal",
      "quantity",
      "relationshipId",
      "species",
      "storeId",
      "transactionId",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_FOOD_USE_VERSION
    || !positiveSafeInteger(value.ordinal)
    || value.ordinal > SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY
    || value.storeId !== identity.storeId
    || value.foodLotId !== identity.foodLotId
    || value.relationshipId !== custody.relationshipId
    || value.species !== custody.species
    || typeof value.memberActorId !== "string"
    || !custody.memberActorIds.includes(value.memberActorId)
    || !livingSpeciesActorIdMatchesNamespace(value.memberActorId, custody.species)
    || value.quantity !== SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY
    || !validId(value.causeEventId)
    || !nonnegativeSafeInteger(value.causeEventTick)
    || value.transactionId !== domesticFoodUseTransactionId(
      identity,
      custody,
      value.memberActorId,
      value.ordinal,
      value.causeEventId,
    )
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
    transactionId: value.transactionId,
    ordinal: value.ordinal,
    storeId: identity.storeId,
    foodLotId: identity.foodLotId,
    relationshipId: custody.relationshipId,
    memberActorId: value.memberActorId,
    species: custody.species,
    quantity: SETTLEMENT_ECOLOGY_DOMESTIC_FOOD_USE_QUANTITY,
    causeEventId: value.causeEventId,
    causeEventTick: value.causeEventTick,
  });
}

function canonicalKnowledge(
  value: unknown,
  identity: SettlementFoodStoreIdentity,
): SettlementKeeperKnowledge | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "confidence",
      "evidenceId",
      "learnedAtTick",
      "risk",
      "source",
      "sourceActorId",
    ])
    || !validId(value.evidenceId)
    || !validRisk(value.risk)
    || !validKnowledgeSource(value.source)
    || !validId(value.sourceActorId)
    || !nonnegativeSafeInteger(value.learnedAtTick)
    || !scaledUnit(value.confidence)
    || value.source === "direct-observation" && value.sourceActorId !== identity.keeperActorId
    || value.source === "player-report" && value.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.source === "player-report" && value.risk !== "food-exposed"
    || value.source === "player-report"
      && value.confidence !== SETTLEMENT_ECOLOGY_PLAYER_REPORT_CONFIDENCE
    || value.source === "player-report"
      && value.evidenceId !== playerStoreReportId(identity, value.learnedAtTick as number)
  ) return null;
  return deepFreeze({
    evidenceId: value.evidenceId,
    risk: value.risk,
    source: value.source,
    sourceActorId: value.sourceActorId,
    learnedAtTick: value.learnedAtTick,
    confidence: value.confidence,
  });
}

function canonicalResolvedFields(
  value: Readonly<Record<string, unknown>>,
  identity: SettlementFoodStoreIdentity,
): Readonly<{
  lastResolvedTransactionId: string | null;
  lastResolvedCauseEventId: string | null;
  lastResolvedCauseEventTick: number | null;
}> | null {
  if (value.lastResolvedLossOrdinal === 0) {
    return value.lastResolvedTransactionId === null
      && value.lastResolvedCauseEventId === null
      && value.lastResolvedCauseEventTick === null
      ? deepFreeze({
          lastResolvedTransactionId: null,
          lastResolvedCauseEventId: null,
          lastResolvedCauseEventTick: null,
        })
      : null;
  }
  if (
    !validId(value.lastResolvedTransactionId)
    || !validId(value.lastResolvedCauseEventId)
    || !nonnegativeSafeInteger(value.lastResolvedCauseEventTick)
    || value.lastResolvedTransactionId !== lossTransactionId(
      identity,
      value.lastResolvedLossOrdinal as number,
      value.lastResolvedCauseEventId,
    )
  ) return null;
  return deepFreeze({
    lastResolvedTransactionId: value.lastResolvedTransactionId,
    lastResolvedCauseEventId: value.lastResolvedCauseEventId,
    lastResolvedCauseEventTick: value.lastResolvedCauseEventTick,
  });
}

function canonicalResolvedDomesticFoodUseFields(
  value: Readonly<Record<string, unknown>>,
  identity: SettlementFoodStoreIdentity,
  custody: SettlementDomesticAnimalCustodyRecord | null,
): Readonly<{
  lastResolvedDomesticFoodUseTransactionId: string | null;
  lastResolvedDomesticFoodUseCauseEventId: string | null;
  lastResolvedDomesticFoodUseCauseEventTick: number | null;
  lastResolvedDomesticFoodUseMemberActorId: string | null;
}> | null {
  if (value.lastResolvedDomesticFoodUseOrdinal === 0) {
    return value.lastResolvedDomesticFoodUseTransactionId === null
      && value.lastResolvedDomesticFoodUseCauseEventId === null
      && value.lastResolvedDomesticFoodUseCauseEventTick === null
      && value.lastResolvedDomesticFoodUseMemberActorId === null
      ? deepFreeze({
          lastResolvedDomesticFoodUseTransactionId: null,
          lastResolvedDomesticFoodUseCauseEventId: null,
          lastResolvedDomesticFoodUseCauseEventTick: null,
          lastResolvedDomesticFoodUseMemberActorId: null,
        })
      : null;
  }
  if (
    custody === null
    || !validId(value.lastResolvedDomesticFoodUseTransactionId)
    || !validId(value.lastResolvedDomesticFoodUseCauseEventId)
    || !nonnegativeSafeInteger(value.lastResolvedDomesticFoodUseCauseEventTick)
    || typeof value.lastResolvedDomesticFoodUseMemberActorId !== "string"
    || !custody.memberActorIds.includes(value.lastResolvedDomesticFoodUseMemberActorId)
    || value.lastResolvedDomesticFoodUseTransactionId !== domesticFoodUseTransactionId(
      identity,
      custody,
      value.lastResolvedDomesticFoodUseMemberActorId,
      value.lastResolvedDomesticFoodUseOrdinal as number,
      value.lastResolvedDomesticFoodUseCauseEventId,
    )
  ) return null;
  return deepFreeze({
    lastResolvedDomesticFoodUseTransactionId: value.lastResolvedDomesticFoodUseTransactionId,
    lastResolvedDomesticFoodUseCauseEventId: value.lastResolvedDomesticFoodUseCauseEventId,
    lastResolvedDomesticFoodUseCauseEventTick: value.lastResolvedDomesticFoodUseCauseEventTick,
    lastResolvedDomesticFoodUseMemberActorId: value.lastResolvedDomesticFoodUseMemberActorId,
  });
}

function canonicalPlayerReport(value: unknown): SettlementPlayerStoreReport | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "confidence",
      "recipientKeeperActorId",
      "reportId",
      "reportedAtTick",
      "reporterActorId",
      "risk",
      "storeId",
      "version",
    ])
    || value.version !== SETTLEMENT_ECOLOGY_PLAYER_REPORT_VERSION
    || !validId(value.reportId)
    || value.reporterActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || typeof value.recipientKeeperActorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(value.recipientKeeperActorId, "human")
    || !validId(value.storeId)
    || !nonnegativeSafeInteger(value.reportedAtTick)
    || value.risk !== "food-exposed"
    || value.confidence !== SETTLEMENT_ECOLOGY_PLAYER_REPORT_CONFIDENCE
    || value.reportId !== playerStoreReportId({
      keeperActorId: value.recipientKeeperActorId,
      storeId: value.storeId,
    }, value.reportedAtTick)
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_ECOLOGY_PLAYER_REPORT_VERSION,
    reportId: value.reportId,
    reporterActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    recipientKeeperActorId: value.recipientKeeperActorId,
    storeId: value.storeId,
    reportedAtTick: value.reportedAtTick,
    risk: value.risk,
    confidence: value.confidence,
  });
}

function canonicalLossTransaction(
  value: unknown,
  identity: SettlementFoodStoreIdentity,
): SettlementFoodLossTransaction | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "causeEventId",
      "causeEventTick",
      "foodLotId",
      "ordinal",
      "quantity",
      "ratAggregateId",
      "storeAnchorOrdinal",
      "storeId",
      "transactionId",
    ])
    || !positiveSafeInteger(value.ordinal)
    || value.ordinal > SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY
    || value.storeId !== identity.storeId
    || value.foodLotId !== identity.foodLotId
    || value.ratAggregateId !== identity.ratAggregateId
    || value.storeAnchorOrdinal !== identity.storeAnchorOrdinal
    || value.quantity !== SETTLEMENT_ECOLOGY_MAX_LOSS_UNITS
    || !validId(value.causeEventId)
    || !nonnegativeSafeInteger(value.causeEventTick)
    || value.transactionId !== lossTransactionId(identity, value.ordinal, value.causeEventId)
  ) return null;
  return deepFreeze({
    transactionId: value.transactionId,
    ordinal: value.ordinal,
    storeId: identity.storeId,
    foodLotId: identity.foodLotId,
    ratAggregateId: identity.ratAggregateId,
    storeAnchorOrdinal: identity.storeAnchorOrdinal,
    quantity: SETTLEMENT_ECOLOGY_MAX_LOSS_UNITS,
    causeEventId: value.causeEventId,
    causeEventTick: value.causeEventTick,
  });
}

function canonicalRatAttractionProposal(value: unknown): SettlementRatAttractionProposal | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "atTick",
      "executionOwnerId",
      "foodLotId",
      "itemConsumption",
      "maximumRedistributedUnits",
      "populationConservation",
      "proposalId",
      "ratAggregateId",
      "stimulusId",
      "storeAnchorOrdinal",
      "storeId",
    ])
    || value.executionOwnerId !== CORE_ECOLOGY_SMALL_WORLD_OWNER_ID
    || !nonnegativeSafeInteger(value.atTick)
    || !validId(value.storeId)
    || !validId(value.foodLotId)
    || !validId(value.ratAggregateId)
    || !nonnegativeSafeInteger(value.storeAnchorOrdinal)
    || !validId(value.stimulusId)
    || value.maximumRedistributedUnits !== SETTLEMENT_ECOLOGY_MAX_REDISTRIBUTED_UNITS
    || value.populationConservation !== "required"
    || value.itemConsumption !== "none"
  ) return null;
  const identity = {
    storeId: value.storeId,
    foodLotId: value.foodLotId,
    ratAggregateId: value.ratAggregateId,
    storeAnchorOrdinal: value.storeAnchorOrdinal,
  };
  const expected = ratAttractionProposalId(identity, value.atTick, value.stimulusId);
  if (value.proposalId !== expected) return null;
  return deepFreeze({
    proposalId: expected,
    executionOwnerId: CORE_ECOLOGY_SMALL_WORLD_OWNER_ID,
    atTick: value.atTick,
    storeId: value.storeId,
    foodLotId: value.foodLotId,
    ratAggregateId: value.ratAggregateId,
    storeAnchorOrdinal: value.storeAnchorOrdinal,
    stimulusId: value.stimulusId,
    maximumRedistributedUnits: SETTLEMENT_ECOLOGY_MAX_REDISTRIBUTED_UNITS,
    populationConservation: "required",
    itemConsumption: "none",
  });
}

function canonicalRatAttractionEvent(value: unknown): CoreEcologySettlementShadowsEvent | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "aggregateId",
      "atTick",
      "cargoInteraction",
      "causeKind",
      "channels",
      "displacedUnits",
      "evidenceId",
      "eventId",
      "fromAnchorOrdinal",
      "itemConsumption",
      "kind",
      "mortality",
      "playerKnowledge",
      "response",
      "sourceKind",
      "sourceReferenceId",
      "stimulusId",
      "targetSpecies",
      "toAnchorOrdinal",
      "version",
    ])
    || value.version !== CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION
      && value.version !== CORE_ECOLOGY_SMALL_WORLD_VERSION
    || !validId(value.eventId)
    || value.kind !== "aggregate-redistributed"
    || !nonnegativeSafeInteger(value.atTick)
    || !validId(value.stimulusId)
    || !validId(value.sourceReferenceId)
    || value.sourceKind !== "exposed-food"
    || value.response !== "attraction"
    || !Array.isArray(value.channels)
    || value.channels.length !== 1
    || value.channels[0] !== "scent"
    || value.causeKind !== "food-attraction"
    || !validId(value.aggregateId)
    || value.targetSpecies !== "brown-rat"
    || !validId(value.evidenceId)
    || !nonnegativeSafeInteger(value.fromAnchorOrdinal)
    || !nonnegativeSafeInteger(value.toAnchorOrdinal)
    || value.displacedUnits !== SETTLEMENT_ECOLOGY_MAX_REDISTRIBUTED_UNITS
    || value.playerKnowledge !== "none"
    || value.mortality !== "none"
    || value.cargoInteraction !== false
    || value.itemConsumption !== "none"
  ) return null;
  return value as unknown as CoreEcologySettlementShadowsEvent;
}

function canonicalKeeperResponse(value: unknown): SettlementKeeperStoreResponseProposal | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "closure",
      "keeperActorId",
      "kind",
      "proposedAtTick",
      "source",
      "sourceEvidenceId",
      "storeId",
      "transactionId",
    ])
    || value.kind !== "secure-store"
    || typeof value.keeperActorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(value.keeperActorId, "human")
    || !validId(value.storeId)
    || value.closure !== "secured"
    || !validId(value.sourceEvidenceId)
    || !validKnowledgeSource(value.source)
    || !nonnegativeSafeInteger(value.proposedAtTick)
    || value.transactionId !== closureTransactionId(value.storeId, value.sourceEvidenceId)
  ) return null;
  return deepFreeze({
    transactionId: value.transactionId,
    kind: "secure-store",
    keeperActorId: value.keeperActorId,
    storeId: value.storeId,
    closure: "secured",
    sourceEvidenceId: value.sourceEvidenceId,
    source: value.source,
    proposedAtTick: value.proposedAtTick,
  });
}

function carrierMatchesStore(
  carrier: LooseCargoCarrierState,
  identity: SettlementFoodStoreIdentity,
  resolvedLosses: number,
  resolvedDomesticFoodUses: number,
): boolean {
  const resolvedUses = resolvedLosses + resolvedDomesticFoodUses;
  if (
    carrier.owner.kind !== "settlement"
    || carrier.owner.id !== identity.settlementId
    || carrier.capacityMilliLoad !== SETTLEMENT_ECOLOGY_STORE_CAPACITY_MILLI
    || carrier.reservedLoadMilli !== 0
    || carrier.revision < resolvedUses + 1
  ) return false;
  const expectedQuantity = SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY - resolvedUses;
  if (expectedQuantity === 0) {
    return carrier.lots.length === 0
      && carrier.retiredLotIds.length === 1
      && carrier.retiredLotIds[0] === identity.foodLotId;
  }
  if (carrier.lots.length !== 1 || carrier.retiredLotIds.length !== 0) return false;
  const lot = carrier.lots[0];
  return lot !== undefined
    && lot.id === identity.foodLotId
    && lot.payload.kind === "provision"
    && lot.payload.lotId === identity.foodLotId
    && lot.payload.provision === "fresh-produce"
    && lot.payload.quantity === expectedQuantity;
}

function liveFoodQuantity(carrier: LooseCargoCarrierState, foodLotId: string): number {
  const lot = carrier.lots.find(({ id }) => id === foodLotId);
  return lot?.payload.kind === "provision" ? lot.payload.quantity : 0;
}

function observationMatchesRisk(
  observation: ActorObservation,
  risk: SettlementFoodStoreRisk,
  foodLotId: string,
): boolean {
  return risk === "food-exposed"
    ? observation.perceivedClass === "exposed-food"
      && observation.identification === "identified"
      && observation.subjectId === foodLotId
      && observation.area.radiusUnits === 0
    : observation.perceivedClass === "rat-sign"
      && observation.identification !== "anonymous";
}

function postStepPatchAuthenticatesAttraction(
  patch: CoreEcologyAggregatePatchState,
  event: CoreEcologySettlementShadowsEvent,
): boolean {
  if (patch.updatedAtTick !== event.atTick) return false;
  const population = patch.aggregatePopulations.find(({ aggregateId }) => (
    aggregateId === event.aggregateId
  ));
  if (population === undefined || population.species !== "brown-rat") return false;
  const disturbance = population.disturbances.find((candidate) => (
    event.eventId
      === `settlement-shadows:${event.aggregateId}:${candidate.disturbanceOrdinal.toString(36)}`
  ));
  if (
    disturbance === undefined
    || disturbance.atTick !== event.atTick
    || disturbance.causeKind !== "food-attraction"
    || disturbance.causeKind !== event.causeKind
    || disturbance.causeReferenceId !== event.sourceReferenceId
    || disturbance.fromAnchorOrdinal !== event.fromAnchorOrdinal
    || disturbance.toAnchorOrdinal !== event.toAnchorOrdinal
    || disturbance.displacedUnits !== event.displacedUnits
    || disturbance.nonlethal !== true
    || disturbance.cargoInteraction !== false
    || disturbance.itemConsumption !== "none"
  ) return false;
  const evidence = population.evidence.find(({ evidenceId }) => evidenceId === event.evidenceId);
  return evidence !== undefined
    && evidence.createdAtTick === event.atTick
    && evidence.causeKind === event.causeKind
    && evidence.causeReferenceId === event.sourceReferenceId
    && evidence.itemConsumption === "none"
    && evidence.disclosure === "direct-observation-required";
}

function postStepPatchAuthenticatesPendingLoss(
  patch: CoreEcologyAggregatePatchState,
  pending: SettlementFoodLossTransaction,
): boolean {
  if (patch.updatedAtTick < pending.causeEventTick) return false;
  const population = patch.aggregatePopulations.find(({ aggregateId }) => (
    aggregateId === pending.ratAggregateId
  ));
  if (population === undefined || population.species !== "brown-rat") return false;
  const disturbance = population.disturbances.find((candidate) => (
    pending.causeEventId
      === `settlement-shadows:${pending.ratAggregateId}:${candidate.disturbanceOrdinal.toString(36)}`
  ));
  if (
    disturbance === undefined
    || disturbance.atTick !== pending.causeEventTick
    || disturbance.causeKind !== "food-attraction"
    || disturbance.causeReferenceId !== pending.foodLotId
    || disturbance.toAnchorOrdinal !== pending.storeAnchorOrdinal
    || disturbance.displacedUnits !== pending.quantity
    || disturbance.nonlethal !== true
    || disturbance.cargoInteraction !== false
    || disturbance.itemConsumption !== "none"
  ) return false;
  const target = population.anchors.find(({ anchorOrdinal }) => (
    anchorOrdinal === pending.storeAnchorOrdinal
  ));
  return target !== undefined && population.evidence.some((evidence) => (
    evidence.createdAtTick === pending.causeEventTick
    && evidence.causeKind === "food-attraction"
    && evidence.causeReferenceId === pending.foodLotId
    && evidence.position.region.x === target.position.region.x
    && evidence.position.region.y === target.position.region.y
    && evidence.position.localX === target.position.localX
    && evidence.position.localY === target.position.localY
    && evidence.itemConsumption === "none"
    && evidence.disclosure === "direct-observation-required"
  ));
}

function canonicalSingleObservation(value: unknown): ActorObservation | null {
  const batch = canonicalizeActorObservations([value]);
  return batch.length === 1 ? batch[0] ?? null : null;
}

function observationAreaCanReferToStore(
  observation: ActorObservation,
  position: WorldPosition,
): boolean {
  const maximum = BigInt(
    observation.area.radiusUnits + SETTLEMENT_ECOLOGY_STORE_EVIDENCE_RANGE_UNITS,
  );
  return worldDistanceSquared(observation.area.center, position) <= maximum * maximum;
}

function eventMatchesAttraction(
  event: CoreEcologySettlementShadowsEvent,
  attraction: SettlementRatAttractionProposal,
): boolean {
  return event.atTick === attraction.atTick
    && event.stimulusId === attraction.stimulusId
    && event.sourceReferenceId === attraction.foodLotId
    && event.aggregateId === attraction.ratAggregateId
    && event.toAnchorOrdinal === attraction.storeAnchorOrdinal
    && event.displacedUnits <= attraction.maximumRedistributedUnits;
}

function attractionMatchesPending(
  attraction: SettlementRatAttractionProposal,
  pending: SettlementFoodLossTransaction,
): boolean {
  return attraction.storeId === pending.storeId
    && attraction.foodLotId === pending.foodLotId
    && attraction.ratAggregateId === pending.ratAggregateId
    && attraction.storeAnchorOrdinal === pending.storeAnchorOrdinal
    && attraction.atTick === pending.causeEventTick;
}

function domesticFoodUseRequestMatchesTransaction(
  request: SettlementDomesticFoodUseRequest,
  transaction: SettlementDomesticFoodUseTransaction,
): boolean {
  return request.storeId === transaction.storeId
    && request.foodLotId === transaction.foodLotId
    && request.relationshipId === transaction.relationshipId
    && request.memberActorId === transaction.memberActorId
    && request.requestedQuantity === transaction.quantity
    && request.causeEventId === transaction.causeEventId
    && request.causeEventTick === transaction.causeEventTick;
}

function domesticGroupMatchesSpecies(
  memberGroupId: string | null,
  species: LivingActorSpecies,
): boolean {
  const namespace = livingSpeciesRegistryEntry(species)?.groupStableIdNamespace;
  if (namespace === null || namespace === undefined) return memberGroupId === null;
  return memberGroupId !== null && memberGroupId.startsWith(`${namespace}-v1-`);
}

function domesticCustodyIdentityDigest(
  identity: SettlementFoodStoreIdentity,
  custodyOrdinal: number,
  species: LivingActorSpecies,
): string {
  return hashCanonical({
    custodyOrdinal,
    seedFingerprint: identity.seedFingerprint,
    settlementId: identity.settlementId,
    species,
    storeId: identity.storeId,
    version: SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION,
  });
}

function storeIdentityDigest(
  seedFingerprint: string,
  settlementId: number,
  keeperActorId: string,
  position: WorldPosition,
  ratAggregateId: string,
  storeAnchorOrdinal: number,
): string {
  return hashCanonical({
    keeperActorId,
    position,
    ratAggregateId,
    seedFingerprint,
    settlementId,
    storeAnchorOrdinal,
    version: SETTLEMENT_ECOLOGY_IDENTITY_VERSION,
  });
}

function ratAttractionProposalId(
  identity: Readonly<{
    storeId: string;
    foodLotId: string;
    ratAggregateId: string;
    storeAnchorOrdinal: number;
  }>,
  atTick: number,
  stimulusId: string,
): string {
  return `STORE-RAT-ATTRACTION-${hashCanonical({
    atTick,
    foodLotId: identity.foodLotId,
    ratAggregateId: identity.ratAggregateId,
    stimulusId,
    storeAnchorOrdinal: identity.storeAnchorOrdinal,
    storeId: identity.storeId,
  })}`;
}

function lossTransactionId(
  identity: SettlementFoodStoreIdentity,
  ordinal: number,
  causeEventId: string,
): string {
  return `STORE-FOOD-LOSS-${hashCanonical({
    causeEventId,
    foodLotId: identity.foodLotId,
    ordinal,
    ratAggregateId: identity.ratAggregateId,
    storeAnchorOrdinal: identity.storeAnchorOrdinal,
    storeId: identity.storeId,
  })}`;
}

function domesticFoodUseTransactionId(
  identity: SettlementFoodStoreIdentity,
  custody: SettlementDomesticAnimalCustodyRecord,
  memberActorId: string,
  ordinal: number,
  causeEventId: string,
): string {
  return `STORE-DOMESTIC-FOOD-USE-${hashCanonical({
    causeEventId,
    foodLotId: identity.foodLotId,
    memberActorId,
    ordinal,
    relationshipId: custody.relationshipId,
    species: custody.species,
    storeId: identity.storeId,
    version: SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
  })}`;
}

function closureTransactionId(storeId: string, evidenceId: string): string {
  return `STORE-SECURE-${hashCanonical({ evidenceId, storeId })}`;
}

function playerStoreReportId(
  identity: Readonly<{ readonly keeperActorId: string; readonly storeId: string }>,
  atTick: number,
): string {
  return `STORE-REPORT-${hashCanonical({
    keeperActorId: identity.keeperActorId,
    reporterActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    risk: "food-exposed",
    storeId: identity.storeId,
    tick: atTick,
  })}`;
}

function worldDistanceSquared(left: WorldPosition, right: WorldPosition): bigint {
  const dx = (BigInt(left.region.x) - BigInt(right.region.x)) * BigInt(REGION_WIDTH_UNITS)
    + BigInt(left.localX - right.localX);
  const dy = (BigInt(left.region.y) - BigInt(right.region.y)) * BigInt(REGION_HEIGHT_UNITS)
    + BigInt(left.localY - right.localY);
  return dx * dx + dy * dy;
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareKnowledge(left: SettlementKeeperKnowledge, right: SettlementKeeperKnowledge): number {
  return left.learnedAtTick - right.learnedAtTick || compareText(left.evidenceId, right.evidenceId);
}

function canonicalNullableId(value: unknown): string | null | undefined {
  return value === null ? null : validId(value) ? value : undefined;
}

function canonicalRootSeed(value: unknown): value is RootSeed {
  return Array.isArray(value)
    && value.length === 4
    && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= UINT32_MAX);
}

function validClosure(value: unknown): value is SettlementFoodStoreClosure {
  return value === "open" || value === "secured";
}

function validRisk(value: unknown): value is SettlementFoodStoreRisk {
  return value === "food-exposed" || value === "rat-activity";
}

function validKnowledgeSource(value: unknown): value is SettlementKeeperKnowledgeSource {
  return value === "direct-observation" || value === "player-report";
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function scaledUnit(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= FIXED_POINT;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function increment(value: number): number {
  if (!nonnegativeSafeInteger(value) || value === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Settlement ecology ordinal space exhausted");
  }
  return value + 1;
}

function plainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
