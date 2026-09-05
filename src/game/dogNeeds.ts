import {
  assertDogIdentityCoherence,
  type DogCondition,
  type DogIdentity,
  type DogNeeds,
} from "../sim/dogIdentity";
import { ACTOR_ID_MAX_LENGTH } from "../sim/actorPerception";
import { FIXED_POINT } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  actorCargoEventId,
  validateActorCargoState,
  type ActorCargoEvent,
  type ActorCargoState,
} from "./actorCargo";
import {
  PROVISION_DEFINITIONS,
  PROVISION_KINDS,
  type ProvisionKind,
} from "./provisions";

export const DOG_NEEDS_STEP_VERSION = 1 as const;
export const DOG_FOOD_CONSUMPTION_VERSION = 1 as const;

const PROVISION_KIND_SET: ReadonlySet<string> = new Set(PROVISION_KINDS);
const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{16}$/u;

export interface DogNeedsStepSample {
  readonly version: typeof DOG_NEEDS_STEP_VERSION;
  readonly exertion: number;
  readonly ambientHeat: number;
  readonly threatPressure: number;
  readonly shelter: number;
  readonly resting: number;
  readonly socialContact: number;
}

/**
 * A compact durable receipt for physical meals already applied to one dog's
 * physiology. Actor-cargo event ordinals are append-only, so a high-water mark
 * is sufficient to reject replay without retaining an unbounded meal log.
 */
export interface DogFoodConsumptionState {
  readonly version: typeof DOG_FOOD_CONSUMPTION_VERSION;
  readonly species: "domestic-dog";
  readonly dogActorId: string;
  readonly lastAppliedEventOrdinal: number;
  readonly lastAppliedEventId: string | null;
  readonly lastAppliedTransactionId: string | null;
  readonly lastAppliedTransactionHash: string | null;
}

/** Exact physical and authored inputs used to derive one hunger reduction. */
export interface DogFoodNutritionEvidence {
  readonly actorCargoEventId: string;
  readonly transactionId: string;
  readonly provision: ProvisionKind;
  readonly quantity: number;
  readonly nutritionPerUnit: number;
  readonly usableNutritionFactor: number;
  readonly satiety: number;
  /** Preserved for the health/contamination consumer; it is not fake calorie loss. */
  readonly contaminationExposure: number;
  readonly materialState: {
    readonly condition: number;
    readonly contamination: number;
    readonly decay: number;
  };
}

export type DogFoodConsumptionRejectionReason =
  | "uncommitted-evidence"
  | "wrong-actor"
  | "not-provision-consumption"
  | "unsupported-provision"
  | "replayed-consumption"
  | "out-of-order-consumption";

export type DogFoodConsumptionApplication =
  | {
      readonly ok: true;
      readonly reason: "applied";
      readonly needs: Readonly<DogNeeds>;
      readonly consumptionState: Readonly<DogFoodConsumptionState>;
      readonly nutrition: Readonly<DogFoodNutritionEvidence>;
    }
  | {
      readonly ok: false;
      readonly reason: DogFoodConsumptionRejectionReason;
      readonly needs: Readonly<DogNeeds>;
      readonly consumptionState: Readonly<DogFoodConsumptionState>;
      readonly nutrition: null;
    };

const BASE_HUNGER_GAIN = 420;
const EXERTION_HUNGER_GAIN = 1_100;
const BASE_THIRST_GAIN = 520;
const EXERTION_THIRST_GAIN = 1_450;
const HEAT_THIRST_GAIN = 1_800;
const EXERTION_REST_GAIN = 2_400;
const INJURY_REST_GAIN = 900;
const REST_RECOVERY = 5_200;
const THREAT_SAFETY_GAIN = 4_800;
const SHELTER_SAFETY_RECOVERY = 2_000;
const BASE_COMPANY_GAIN = 240;
const COMPANY_RECOVERY = 4_000;

/**
 * Advances need pressure by one authoritative world step. Need values express
 * pressure (zero satisfied, one million urgent); they never directly subtract
 * health or invent an environmental fact.
 */
export function stepDogNeeds(
  needs: Readonly<DogNeeds>,
  condition: Readonly<DogCondition>,
  sample: DogNeedsStepSample,
): Readonly<DogNeeds> {
  assertNeeds(needs);
  assertCondition(condition);
  assertSample(sample);

  const injuryPressure = Math.min(
    FIXED_POINT,
    (FIXED_POINT - condition.health) + condition.injuries.length * 100_000,
  );
  const safeRest = multiplyUnit(
    sample.resting,
    FIXED_POINT - sample.threatPressure,
  );
  const shelteredRest = multiplyUnit(safeRest, unionUnit(sample.shelter, 250_000));

  return deepFreeze({
    hunger: clampUnit(
      needs.hunger
      + BASE_HUNGER_GAIN
      + multiplyUnit(sample.exertion, EXERTION_HUNGER_GAIN),
    ),
    thirst: clampUnit(
      needs.thirst
      + BASE_THIRST_GAIN
      + multiplyUnit(sample.exertion, EXERTION_THIRST_GAIN)
      + multiplyUnit(sample.ambientHeat, HEAT_THIRST_GAIN),
    ),
    rest: clampUnit(
      needs.rest
      + multiplyUnit(sample.exertion, EXERTION_REST_GAIN)
      + multiplyUnit(injuryPressure, INJURY_REST_GAIN)
      - multiplyUnit(shelteredRest, REST_RECOVERY),
    ),
    safety: clampUnit(
      needs.safety
      + multiplyUnit(sample.threatPressure, THREAT_SAFETY_GAIN)
      - multiplyUnit(
        multiplyUnit(sample.shelter, FIXED_POINT - sample.threatPressure),
        SHELTER_SAFETY_RECOVERY,
      ),
    ),
    company: clampUnit(
      needs.company
      + BASE_COMPANY_GAIN
      - multiplyUnit(sample.socialContact, COMPANY_RECOVERY),
    ),
  });
}

/**
 * Starts the durable physiology receipt for one coherent generated dog. This
 * does not invent a name, owner, relationship, bond, or food event.
 */
export function createDogFoodConsumptionState(
  identity: Readonly<DogIdentity>,
): Readonly<DogFoodConsumptionState> {
  assertDogIdentityCoherence(identity as DogIdentity);
  return deepFreeze({
    version: DOG_FOOD_CONSUMPTION_VERSION,
    species: "domestic-dog",
    dogActorId: identity.stableId,
    lastAppliedEventOrdinal: 0,
    lastAppliedEventId: null,
    lastAppliedTransactionId: null,
    lastAppliedTransactionHash: null,
  });
}

/** Strict canonicalization for embedding the receipt in an outer actor save. */
export function canonicalizeDogFoodConsumptionState(
  value: unknown,
): Readonly<DogFoodConsumptionState> {
  if (
    !plainRecord(value)
    || !hasExactKeys(value, [
      "version",
      "species",
      "dogActorId",
      "lastAppliedEventOrdinal",
      "lastAppliedEventId",
      "lastAppliedTransactionId",
      "lastAppliedTransactionHash",
    ])
    || value.version !== DOG_FOOD_CONSUMPTION_VERSION
    || value.species !== "domestic-dog"
    || !validDogActorId(value.dogActorId)
    || !validCounter(value.lastAppliedEventOrdinal)
  ) throw new RangeError("Dog food consumption state is invalid");

  const initial = value.lastAppliedEventOrdinal === 0;
  if (
    initial
      ? value.lastAppliedEventId !== null
        || value.lastAppliedTransactionId !== null
        || value.lastAppliedTransactionHash !== null
      : value.lastAppliedEventId !== actorCargoEventId(value.lastAppliedEventOrdinal)
        || !validOpaqueId(value.lastAppliedTransactionId)
        || typeof value.lastAppliedTransactionHash !== "string"
        || !TRANSACTION_HASH_PATTERN.test(value.lastAppliedTransactionHash)
  ) throw new RangeError("Dog food consumption receipt is incoherent");

  return deepFreeze({
    version: DOG_FOOD_CONSUMPTION_VERSION,
    species: "domestic-dog",
    dogActorId: value.dogActorId,
    lastAppliedEventOrdinal: value.lastAppliedEventOrdinal,
    lastAppliedEventId: value.lastAppliedEventId as string | null,
    lastAppliedTransactionId: value.lastAppliedTransactionId as string | null,
    lastAppliedTransactionHash: value.lastAppliedTransactionHash as string | null,
  });
}

export function serializeDogFoodConsumptionState(
  state: Readonly<DogFoodConsumptionState>,
): string {
  return stableStringify(canonicalizeDogFoodConsumptionState(state));
}

export function deserializeDogFoodConsumptionState(
  text: string,
): Readonly<DogFoodConsumptionState> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `Dog food consumption save is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
    );
  }
  return canonicalizeDogFoodConsumptionState(decoded);
}

/**
 * The sole public dog-food-to-hunger boundary. Satiety cannot be supplied by a
 * caller: it is derived from an exact, canonical actor-cargo consumption commit
 * for this dog and from the centralized provision definition.
 */
export function applyCommittedDogFoodConsumption(
  identity: Readonly<DogIdentity>,
  needs: Readonly<DogNeeds>,
  consumptionState: Readonly<DogFoodConsumptionState>,
  mutation: unknown,
): Readonly<DogFoodConsumptionApplication> {
  assertDogIdentityCoherence(identity as DogIdentity);
  assertNeeds(needs);
  const canonicalReceipt = canonicalizeDogFoodConsumptionState(consumptionState);
  if (canonicalReceipt.dogActorId !== identity.stableId) {
    throw new RangeError("Dog food consumption state belongs to another dog");
  }
  const unchangedNeeds = deepFreeze({ ...needs });

  if (rawUnsupportedProvision(mutation)) {
    return rejectedFoodConsumption("unsupported-provision", unchangedNeeds, canonicalReceipt);
  }
  const committed = committedActorCargoEvent(mutation);
  if (committed === null) {
    return rejectedFoodConsumption("uncommitted-evidence", unchangedNeeds, canonicalReceipt);
  }
  const { event, state } = committed;
  if (event.kind !== "provision-consumed") {
    return rejectedFoodConsumption("not-provision-consumption", unchangedNeeds, canonicalReceipt);
  }
  if (event.actorId !== identity.stableId) {
    return rejectedFoodConsumption("wrong-actor", unchangedNeeds, canonicalReceipt);
  }
  if (event.provision === null || !PROVISION_KIND_SET.has(event.provision)) {
    return rejectedFoodConsumption("unsupported-provision", unchangedNeeds, canonicalReceipt);
  }
  if (!coherentConsumedLotEvidence(mutation, event)) {
    return rejectedFoodConsumption("uncommitted-evidence", unchangedNeeds, canonicalReceipt);
  }

  if (event.ordinal <= canonicalReceipt.lastAppliedEventOrdinal) {
    return rejectedFoodConsumption("replayed-consumption", unchangedNeeds, canonicalReceipt);
  }
  if (!receiptExistsInCargoHistory(canonicalReceipt, state)) {
    return rejectedFoodConsumption("uncommitted-evidence", unchangedNeeds, canonicalReceipt);
  }
  const nextDogMeal = state.events.find((candidate) =>
    candidate.kind === "provision-consumed"
    && candidate.actorId === identity.stableId
    && candidate.ordinal > canonicalReceipt.lastAppliedEventOrdinal);
  if (nextDogMeal?.id !== event.id) {
    return rejectedFoodConsumption("out-of-order-consumption", unchangedNeeds, canonicalReceipt);
  }

  const definition = PROVISION_DEFINITIONS[event.provision];
  const materialState = event.materialState;
  if (materialState === null) {
    return rejectedFoodConsumption("uncommitted-evidence", unchangedNeeds, canonicalReceipt);
  }
  const usableNutritionFactor = Math.min(
    materialState.condition,
    FIXED_POINT - materialState.decay,
  );
  const satiety = saturatingScaledProduct(
    definition.nutrition,
    event.quantity,
    usableNutritionFactor,
  );
  const contaminationExposure = saturatingIntegerProduct(
    materialState.contamination,
    event.quantity,
  );
  const nutrition: DogFoodNutritionEvidence = {
    actorCargoEventId: event.id,
    transactionId: event.transactionId,
    provision: event.provision,
    quantity: event.quantity,
    nutritionPerUnit: definition.nutrition,
    usableNutritionFactor,
    satiety,
    contaminationExposure,
    materialState: { ...materialState },
  };
  const nextReceipt: DogFoodConsumptionState = {
    version: DOG_FOOD_CONSUMPTION_VERSION,
    species: "domestic-dog",
    dogActorId: identity.stableId,
    lastAppliedEventOrdinal: event.ordinal,
    lastAppliedEventId: event.id,
    lastAppliedTransactionId: event.transactionId,
    lastAppliedTransactionHash: event.transactionHash,
  };
  return deepFreeze({
    ok: true,
    reason: "applied",
    needs: {
      ...needs,
      hunger: Math.max(0, needs.hunger - satiety),
    },
    consumptionState: nextReceipt,
    nutrition,
  });
}

function committedActorCargoEvent(
  value: unknown,
): { readonly state: ActorCargoState; readonly event: ActorCargoEvent } | null {
  if (
    !plainRecord(value)
    || !hasExactKeys(value, ["ok", "reason", "state", "event", "affectedLot", "conservation"])
    || value.ok !== true
    || (value.reason !== "applied" && value.reason !== "already-applied")
    || value.event === null
  ) return null;
  const validation = validateActorCargoState(value.state);
  if (!validation.valid || validation.state === null) return null;
  const eventRecord = plainRecord(value.event) ? value.event : null;
  if (eventRecord === null || !validCounter(eventRecord.ordinal) || eventRecord.ordinal === 0) {
    return null;
  }
  const event = validation.state.events.find(({ ordinal }) => ordinal === eventRecord.ordinal);
  if (event === undefined || !sameCanonicalShape(value.event, event)) return null;
  if (!sameCanonicalShape(value.state, validation.state)) return null;
  if (value.reason === "applied" && event.ordinal !== validation.state.lastEventOrdinal) return null;
  if (
    hashCanonical({
      kind: event.kind,
      request: event.kind === "provision-consumed"
        ? {
            transactionId: event.transactionId,
            containerId: event.sourceContainerId,
            lotId: event.sourceLotId,
            quantity: event.quantity,
          }
        : null,
    }) !== event.transactionHash
    && event.kind === "provision-consumed"
  ) return null;
  return { state: validation.state, event };
}

function coherentConsumedLotEvidence(value: unknown, event: ActorCargoEvent): boolean {
  if (!plainRecord(value) || value.conservation !== null) return false;
  if (value.reason === "already-applied") return value.affectedLot === null;
  if (value.reason !== "applied" || event.materialState === null || event.sourceLotId === null) {
    return false;
  }
  const expected = {
    id: event.sourceLotId,
    payload: {
      kind: "provision",
      lotId: event.sourceLotId,
      provision: event.provision,
      quantity: event.quantity,
    },
    materialState: event.materialState,
  };
  return sameCanonicalShape(value.affectedLot, expected);
}

function receiptExistsInCargoHistory(
  receipt: Readonly<DogFoodConsumptionState>,
  state: Readonly<ActorCargoState>,
): boolean {
  if (receipt.lastAppliedEventOrdinal === 0) return true;
  const prior = state.events.find(({ ordinal }) => ordinal === receipt.lastAppliedEventOrdinal);
  return prior?.kind === "provision-consumed"
    && prior.actorId === receipt.dogActorId
    && prior.id === receipt.lastAppliedEventId
    && prior.transactionId === receipt.lastAppliedTransactionId
    && prior.transactionHash === receipt.lastAppliedTransactionHash;
}

function rawUnsupportedProvision(value: unknown): boolean {
  if (!plainRecord(value) || !plainRecord(value.event)) return false;
  return value.event.kind === "provision-consumed"
    && (typeof value.event.provision !== "string"
      || !PROVISION_KIND_SET.has(value.event.provision));
}

function rejectedFoodConsumption(
  reason: DogFoodConsumptionRejectionReason,
  needs: Readonly<DogNeeds>,
  state: Readonly<DogFoodConsumptionState>,
): Readonly<DogFoodConsumptionApplication> {
  return deepFreeze({
    ok: false,
    reason,
    needs,
    consumptionState: state,
    nutrition: null,
  });
}

function assertNeeds(value: Readonly<DogNeeds>): void {
  if (
    !plainRecord(value)
    || Object.keys(value).sort().join(",") !== "company,hunger,rest,safety,thirst"
    || Object.values(value).some((entry) => !scaledUnit(entry))
  ) throw new RangeError("Dog needs are invalid");
}

function assertCondition(value: Readonly<DogCondition>): void {
  if (
    !plainRecord(value)
    || Object.keys(value).sort().join(",")
      !== "coldStress,exhaustion,health,heatStress,injuries,wetness"
    || !scaledUnit(value.health)
    || !scaledUnit(value.wetness)
    || !scaledUnit(value.coldStress)
    || !scaledUnit(value.heatStress)
    || !scaledUnit(value.exhaustion)
    || !Array.isArray(value.injuries)
    || value.injuries.length > 5
    || new Set(value.injuries).size !== value.injuries.length
    || value.injuries.some((injury) =>
      injury !== "bruise"
      && injury !== "cut"
      && injury !== "sprain"
      && injury !== "bite"
      && injury !== "cold-injury"
    )
  ) throw new RangeError("Dog condition is invalid");
}

function assertSample(value: DogNeedsStepSample): void {
  if (
    !plainRecord(value)
    || Object.keys(value).sort().join(",")
      !== "ambientHeat,exertion,resting,shelter,socialContact,threatPressure,version"
    || value.version !== DOG_NEEDS_STEP_VERSION
    || Object.entries(value).some(([key, entry]) => key !== "version" && !scaledUnit(entry))
  ) throw new RangeError("Dog needs step sample is invalid");
}

function multiplyUnit(left: number, right: number): number {
  return Number(BigInt(left) * BigInt(right) / BigInt(FIXED_POINT));
}

function saturatingScaledProduct(
  perUnit: number,
  quantity: number,
  materialFactor: number,
): number {
  const product = BigInt(perUnit) * BigInt(quantity) * BigInt(materialFactor)
    / BigInt(FIXED_POINT);
  return Number(product > BigInt(FIXED_POINT) ? BigInt(FIXED_POINT) : product);
}

function saturatingIntegerProduct(perUnit: number, quantity: number): number {
  const product = BigInt(perUnit) * BigInt(quantity);
  return Number(product > BigInt(FIXED_POINT) ? BigInt(FIXED_POINT) : product);
}

function unionUnit(left: number, right: number): number {
  return FIXED_POINT - multiplyUnit(FIXED_POINT - left, FIXED_POINT - right);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(FIXED_POINT, Math.trunc(value)));
}

function scaledUnit(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= FIXED_POINT
    && !Object.is(value, -0);
}

function validCounter(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && !Object.is(value, -0);
}

function validDogActorId(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith("D-")
    && value.length <= ACTOR_ID_MAX_LENGTH
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value);
}

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 160
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function sameCanonicalShape(left: unknown, right: unknown): boolean {
  try {
    return stableStringify(left) === stableStringify(right);
  } catch {
    return false;
  }
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
