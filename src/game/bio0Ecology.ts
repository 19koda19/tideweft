import {
  ACTOR_PERCEPTION_SCALE,
  stepActorPerception,
  type ActorBelief,
  type ObservedArea,
} from "../sim/actorPerception";
import type { CargoEnvironmentState } from "../sim/cargoEnvironment";
import type { DogIdentityGenerationInput, GeneratedDogState } from "../sim/dogIdentity";
import type { FixedScentWind } from "../sim/scentPerception";
import { FIXED_POINT } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  ACTOR_CARGO_MAX_EVENTS,
  addActorCargoProvision,
  consumeActorCargoProvision,
  createActorCargoContainer,
  createActorCargoState,
  inspectActorCargoContainerExposure,
  validateActorCargoState,
  type ActorCargoContainer,
  type ActorCargoContainerClosure,
  type ActorCargoEvent,
  type ActorCargoState,
} from "./actorCargo";
import {
  appendDogActorMemory,
  applyDogBehaviorDecision,
  canonicalizeDogActorState,
  createDogActorState,
  learnDogPlayerKnowledge,
  promoteDogActor,
  replaceDogActorPerception,
  replaceDogActorPhysiology,
  type DogActorState,
} from "./dogActor";
import {
  DOG_BEHAVIOR_INTENTS,
  decideDogBehavior,
  type DogActionAccessibility,
  type DogBehaviorDecision,
  type DogBehaviorIntent,
} from "./dogBehavior";
import { DOG_EXPOSURE_VERSION, stepDogExposure, type DogExposureSample } from "./dogExposure";
import {
  DOG_NEEDS_STEP_VERSION,
  applyCommittedDogFoodConsumption,
  canonicalizeDogFoodConsumptionState,
  createDogFoodConsumptionState,
  stepDogNeeds,
  type DogFoodConsumptionState,
} from "./dogNeeds";
import { isLivingActorAddress, type LivingActorAddress } from "./livingActor";
import { collectLivingActorScentObservations } from "./livingActorSenses";
import {
  canonicalizeOfferedProvisionContact,
  type OfferedProvisionContact,
} from "./livingActorActionEnactment";
import { PROVISION_DEFINITIONS, type ProvisionKind } from "./provisions";
import { isWorldPosition, worldPositionDelta, type WorldPosition } from "./worldPosition";

export const BIO0_ECOLOGY_VERSION = 1 as const;
export const BIO0_ECOLOGY_MAX_RETAINED_EVENTS = 64 as const;
export const BIO0_ECOLOGY_MAX_SERIALIZED_BYTES = 2 * 1_024 * 1_024;
export const BIO0_FOOD_CONTACT_RANGE_UNITS = 1_500 as const;
export const BIO0_APPROACH_MAXIMUM_STEP_UNITS = 1_000 as const;

export type Bio0SimulationMode = "full" | "coarse";

const INITIAL_ARCHIVE_HASH = "0000000000000000";
const UTF8_ENCODER = new TextEncoder();
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const MAX_FOOD_UNITS = Math.floor((ACTOR_CARGO_MAX_EVENTS - 1) / 2);

/** The food remains one exact lot even though custody changes before eating. */
export interface Bio0FoodSourceReference {
  readonly providerContainerId: string;
  readonly receiverContainerId: string;
  readonly sourceLotId: string;
}

export type Bio0EcologyEventKind =
  | "ecology-stepped"
  | "food-approached"
  | "food-consumed";

export interface Bio0EcologyEvent {
  readonly id: string;
  readonly ordinal: number;
  readonly tick: number;
  readonly kind: Bio0EcologyEventKind;
  readonly dogActorId: string;
  readonly intent: DogBehaviorIntent;
  /** Opaque classified-scent evidence; it never reveals the true source ID. */
  readonly scentObservationId: string | null;
  /** Current bounded movement request, not proof that movement happened. */
  readonly movementRequestId: string | null;
  readonly contactId: string | null;
  /** Player request causally retained only when contact became a committed meal. */
  readonly requestId: string | null;
  readonly decisionId: string | null;
  readonly transferCargoEventId: string | null;
  readonly consumptionCargoEventId: string | null;
  readonly sourceLotId: string | null;
  readonly consumedLotId: string | null;
  readonly quantity: number;
  readonly satiety: number;
}

/**
 * A cognition-safe locomotion request. The target is the dog's uncertain saved
 * belief area, never the provision's true position. This sidecar does not claim
 * that a pathfinder moved the dog.
 */
export interface Bio0PendingMovement {
  readonly id: string;
  readonly kind: "approach-perceived-area";
  readonly issuedAtTick: number;
  readonly dogActorId: string;
  readonly beliefKey: string;
  readonly targetArea: ObservedArea;
  readonly maximumStepUnits: typeof BIO0_APPROACH_MAXIMUM_STEP_UNITS;
}

export interface Bio0EcologyState {
  readonly version: typeof BIO0_ECOLOGY_VERSION;
  /** Total accepted step count; it is not limited by retained event history. */
  readonly revision: number;
  readonly createdAtTick: number;
  readonly tick: number;
  /** Number of old events folded into historyArchiveHash. */
  readonly historyBaseOrdinal: number;
  readonly historyArchiveHash: string;
  /** Exactly one independently generated dog actor. */
  readonly dog: DogActorState;
  readonly foodConsumption: Readonly<DogFoodConsumptionState>;
  /** Address/reference only; the existing resident remains the human identity owner. */
  readonly porterAddress: LivingActorAddress & { readonly species: "human" };
  /** Exactly one porter pack and one dog-owned direct-contact receiving container. */
  readonly cargo: ActorCargoState;
  readonly foodSource: Bio0FoodSourceReference;
  readonly lastExposure: DogExposureSample;
  readonly lastWind: FixedScentWind;
  readonly pendingMovement: Bio0PendingMovement | null;
  /** Canonical retained tail; older evidence is folded, never a terminal tick cap. */
  readonly events: readonly Bio0EcologyEvent[];
}

export interface Bio0FoodSeed {
  readonly providerContainerId: string;
  readonly receiverContainerId: string;
  readonly lotId: string;
  readonly provision: ProvisionKind;
  readonly quantity: number;
  readonly providerCapacityMilliLoad: number;
  readonly receiverCapacityMilliLoad: number;
  readonly providerClosure: ActorCargoContainerClosure;
  readonly materialState: CargoEnvironmentState;
}

export interface CreateBio0EcologyInput {
  readonly dogGeneration: DogIdentityGenerationInput;
  readonly dogPosition: WorldPosition;
  /** Must be obtained from the existing human/resident identity owner. */
  readonly porterAddress: LivingActorAddress;
  readonly food: Bio0FoodSeed;
  readonly tick?: number;
}

/**
 * Direct/contact confirmation from the physical interaction layer. Scent alone
 * can never synthesize this record. The exact unit moves into dog custody before
 * the dog's own consumption event is allowed to affect physiology.
 */
export type Bio0OfferedFoodContact = OfferedProvisionContact;

export interface Bio0EcologyStepInput {
  readonly tick: number;
  /** Fresh address from the existing resident owner; identity must remain stable. */
  readonly porterAddress: LivingActorAddress & { readonly species: "human" };
  readonly exposure: DogExposureSample;
  readonly wind: FixedScentWind;
  readonly accessibility: DogActionAccessibility;
  readonly foodContact: Bio0OfferedFoodContact | null;
  /**
   * Omitted legacy/current callers retain full local behavior. Runtime must
   * explicitly request coarse mode whenever this causal web is not wholly
   * inside the loaded interaction neighborhood.
   */
  readonly simulationMode?: Bio0SimulationMode;
}

export type Bio0EcologyStepReason =
  | "advanced"
  | "invalid-state"
  | "invalid-input"
  | "ordinal-space-exhausted"
  | "sensory-step-rejected"
  | "behavior-step-rejected"
  | "cargo-step-rejected"
  | "invariant-failed";

export interface Bio0EcologyStepResult {
  readonly ok: boolean;
  readonly reason: Bio0EcologyStepReason;
  readonly state: Bio0EcologyState;
  readonly event: Bio0EcologyEvent | null;
}

export function createBio0Ecology(input: CreateBio0EcologyInput): Bio0EcologyState {
  if (!plainRecord(input) || !allowedCreateKeys(input)) {
    throw new TypeError("BIO0 ecology creation input is malformed");
  }
  if (
    !isWorldPosition(input.dogPosition)
    || !isLivingActorAddress(input.porterAddress)
    || input.porterAddress.species !== "human"
  ) throw new TypeError("BIO0 ecology requires one existing human actor address");
  const tick = input.tick ?? 0;
  if (!schedulableTick(tick)) {
    throw new RangeError("BIO0 ecology creation tick is outside its bounded schedule");
  }
  const food = canonicalFoodSeed(input.food);
  if (food === null) throw new RangeError("BIO0 ecology food seed is invalid");

  const dog = createDogActorState({
    ...input.dogGeneration,
    position: input.dogPosition,
    tick,
  });
  if (dog.identity.stableId === input.porterAddress.actorId) {
    throw new RangeError("BIO0 dog and porter identities must be distinct");
  }
  const provider = createActorCargoContainer({
    id: food.providerContainerId,
    custodianActorId: input.porterAddress.actorId,
    capacityMilliLoad: food.providerCapacityMilliLoad,
    closure: food.providerClosure,
  });
  const receiver = createActorCargoContainer({
    id: food.receiverContainerId,
    custodianActorId: dog.identity.stableId,
    capacityMilliLoad: food.receiverCapacityMilliLoad,
    closure: "open",
  });
  const emptyCargo = createActorCargoState([provider, receiver]);
  const foodSource: Bio0FoodSourceReference = {
    providerContainerId: food.providerContainerId,
    receiverContainerId: food.receiverContainerId,
    sourceLotId: food.lotId,
  };
  const added = addActorCargoProvision(emptyCargo, {
    transactionId: initialCargoTransactionId(foodSource, input.porterAddress.actorId),
    containerId: food.providerContainerId,
    lotId: food.lotId,
    provision: food.provision,
    quantity: food.quantity,
    materialState: food.materialState,
  });
  if (!added.ok || added.reason !== "applied") {
    throw new RangeError(`BIO0 provision creation failed: ${added.reason}`);
  }

  const candidate = {
    version: BIO0_ECOLOGY_VERSION,
    revision: 0,
    createdAtTick: tick,
    tick,
    historyBaseOrdinal: 0,
    historyArchiveHash: INITIAL_ARCHIVE_HASH,
    dog,
    foodConsumption: createDogFoodConsumptionState(dog.identity),
    porterAddress: input.porterAddress,
    cargo: added.state,
    foodSource,
    lastExposure: zeroExposure(),
    lastWind: { x: 0, y: 0 },
    pendingMovement: null,
    events: [],
  };
  const state = canonicalizeBio0EcologyState(candidate);
  if (state === null) throw new Error("Created BIO0 ecology failed its canonical boundary");
  return state;
}

/** Strict persisted-state boundary; forged aliases and extra keys fail closed. */
export function canonicalizeBio0EcologyState(value: unknown): Bio0EcologyState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "cargo",
    "createdAtTick",
    "dog",
    "events",
    "foodConsumption",
    "foodSource",
    "historyArchiveHash",
    "historyBaseOrdinal",
    "lastExposure",
    "lastWind",
    "pendingMovement",
    "porterAddress",
    "revision",
    "tick",
    "version",
  ])) return null;
  if (
    value.version !== BIO0_ECOLOGY_VERSION
    || !nonnegativeSafeInteger(value.revision)
    || !schedulableTick(value.createdAtTick)
    || !schedulableTick(value.tick)
    || value.tick < value.createdAtTick
    || value.revision !== value.tick - value.createdAtTick
    || !nonnegativeSafeInteger(value.historyBaseOrdinal)
    || value.historyBaseOrdinal > value.revision
    || typeof value.historyArchiveHash !== "string"
    || !HASH_PATTERN.test(value.historyArchiveHash)
  ) return null;
  if (
    (value.historyBaseOrdinal === 0) !== (value.historyArchiveHash === INITIAL_ARCHIVE_HASH)
  ) return null;

  const dog = canonicalizeDogActorState(value.dog);
  if (
    dog === null
    || dog.updatedAtTick !== value.tick
    || dog.perception.tick !== value.tick
  ) return null;
  if (
    !isLivingActorAddress(value.porterAddress)
    || value.porterAddress.species !== "human"
    || value.porterAddress.actorId === dog.identity.stableId
  ) return null;
  const porterAddress = value.porterAddress as Bio0EcologyState["porterAddress"];

  const cargoValidation = validateActorCargoState(value.cargo);
  const foodSource = canonicalFoodSource(value.foodSource);
  const lastExposure = canonicalExposure(value.lastExposure);
  const lastWind = canonicalWind(value.lastWind);
  let foodConsumption: Readonly<DogFoodConsumptionState>;
  try {
    foodConsumption = canonicalizeDogFoodConsumptionState(value.foodConsumption);
  } catch {
    return null;
  }
  if (
    !cargoValidation.valid
    || cargoValidation.state === null
    || foodSource === null
    || lastExposure === null
    || lastWind === null
    || foodConsumption.dogActorId !== dog.identity.stableId
  ) return null;
  const cargo = cargoValidation.state;
  if (!validFoodCustody(cargo, foodSource, porterAddress.actorId, dog.identity.stableId, foodConsumption)) {
    return null;
  }

  const pendingMovement = value.pendingMovement === null
    ? null
    : canonicalPendingMovement(value.pendingMovement);
  if (value.pendingMovement !== null && pendingMovement === null) return null;
  if (
    (pendingMovement !== null) !== (dog.intent.kind === "approach-food")
    || (pendingMovement !== null && !pendingMovementMatchesDog(pendingMovement, dog))
  ) return null;

  if (
    !Array.isArray(value.events)
    || value.events.length > BIO0_ECOLOGY_MAX_RETAINED_EVENTS
    || value.events.length !== Math.min(value.revision, BIO0_ECOLOGY_MAX_RETAINED_EVENTS)
    || value.historyBaseOrdinal !== value.revision - value.events.length
  ) return null;
  const events: Bio0EcologyEvent[] = [];
  for (let index = 0; index < value.events.length; index += 1) {
    const event = canonicalEvent(value.events[index]);
    const ordinal = value.historyBaseOrdinal + index + 1;
    if (
      event === null
      || event.ordinal !== ordinal
      || event.id !== bio0EcologyEventId(ordinal)
      || event.tick !== value.createdAtTick + ordinal
      || event.dogActorId !== dog.identity.stableId
    ) return null;
    events.push(event);
  }
  const latestEvent = events[events.length - 1] ?? null;
  if (
    (value.revision === 0) !== (latestEvent === null)
    || (latestEvent !== null && latestEvent.tick !== value.tick)
    || (latestEvent?.movementRequestId ?? null) !== (pendingMovement?.id ?? null)
  ) return null;
  if (pendingMovement !== null && !events.some((event) => (
    event.kind === "food-approached"
    && event.tick === pendingMovement.issuedAtTick
    && event.movementRequestId === pendingMovement.id
  ))) return null;
  if (!retainedConsumptionEvidenceMatches(cargo, foodSource, events)) return null;
  if (!dogFoodMemoriesMatch(
    dog,
    porterAddress.actorId,
    value.createdAtTick,
    value.revision,
    cargo,
    events,
    value.historyBaseOrdinal,
  )) {
    return null;
  }

  return deepFreeze({
    version: BIO0_ECOLOGY_VERSION,
    revision: value.revision,
    createdAtTick: value.createdAtTick,
    tick: value.tick,
    historyBaseOrdinal: value.historyBaseOrdinal,
    historyArchiveHash: value.historyArchiveHash,
    dog,
    foodConsumption,
    porterAddress,
    cargo,
    foodSource,
    lastExposure,
    lastWind,
    pendingMovement,
    events,
  });
}

/**
 * Canonical bridge for a species-neutral enactment result. This admits lawful
 * closure changes and an exact one-unit pending offer while rejecting cargo
 * mutations that would make the BIO0 ecology state non-canonical.
 */
export function adoptBio0ActorCargoState(
  stateValue: unknown,
  cargoValue: unknown,
): Bio0EcologyState | null {
  const state = canonicalizeBio0EcologyState(stateValue);
  const cargoValidation = validateActorCargoState(cargoValue);
  if (state === null || !cargoValidation.valid || cargoValidation.state === null) return null;
  if (stableStringify(state.cargo) === stableStringify(cargoValidation.state)) return state;
  return canonicalizeBio0EcologyState({ ...state, cargo: cargoValidation.state });
}

/**
 * Pure transactional step. Every mutation is built in local immutable values;
 * any rejected sensory, behavior, custody, nutrition, memory, or final-state
 * boundary returns the exact original input object with no partial effects.
 */
export function stepBio0Ecology(
  state: Bio0EcologyState,
  input: Bio0EcologyStepInput,
): Bio0EcologyStepResult {
  const current = canonicalizeBio0EcologyState(state);
  if (current === null) return failedStep("invalid-state", state);
  if (current.revision >= Number.MAX_SAFE_INTEGER || current.tick >= Number.MAX_SAFE_INTEGER - 8) {
    return failedStep("ordinal-space-exhausted", state);
  }
  const step = canonicalStepInput(input, current);
  if (step === null) return failedStep("invalid-input", state);

  try {
    const provider = containerById(current.cargo, current.foodSource.providerContainerId);
    if (provider === null) return failedStep("invariant-failed", state);
    const liveFood = liveSourceFoodLot(current);
    const exposure = inspectActorCargoContainerExposure(provider, step.exposure.rain);
    const observations = step.simulationMode === "coarse"
      ? Object.freeze([])
      : collectLivingActorScentObservations({
        observer: current.dog.address,
        tick: step.tick,
        wind: step.wind,
        rainIntensity: step.exposure.rain,
        stimuli: liveFood === null ? [] : [{
          stimulusId: foodScentStimulusId(current.foodSource),
          perceivedClass: "food-scent",
          position: step.porterAddress.position,
          sourceStrength: exposure.uncontainedProvisionScent,
          packagingLeakage: FIXED_POINT - exposure.effectiveScentContainment,
        }],
      });
    if (observations === null) return failedStep("sensory-step-rejected", state);
    const perception = stepActorPerception(current.dog.perception, {
      tick: step.tick,
      observations,
    });
    if (perception === null || perception.tick !== step.tick) {
      return failedStep("sensory-step-rejected", state);
    }

    let dog = replaceDogActorPerception(current.dog, perception);
    const condition = stepDogExposure(
      { ...dog.condition, injuries: [...dog.condition.injuries] },
      dog.identity.weatherAdaptation,
      step.exposure,
    );
    const needs = stepDogNeeds(dog.needs, condition, {
      version: DOG_NEEDS_STEP_VERSION,
      exertion: step.exposure.exertion,
      ambientHeat: step.exposure.ambientHeat,
      threatPressure: perception.suspicionPressure,
      shelter: step.exposure.shelter,
      resting: FIXED_POINT - step.exposure.exertion,
      socialContact: step.foodContact === null ? 0 : FIXED_POINT,
    });
    dog = replaceDogActorPhysiology(dog, {
      needs,
      condition,
      humanFamiliarity: dog.humanFamiliarity,
      atTick: step.tick,
    });

    const behaviorDue = step.tick >= dog.intent.nextThinkTick || step.foodContact !== null;
    let decision: DogBehaviorDecision | null = null;
    if (behaviorDue) {
      decision = decideDogBehavior({
        tick: step.tick,
        dog: generatedDogView(dog),
        perception: dog.perception,
        weather: {
          coldPressure: step.exposure.ambientCold,
          heatPressure: step.exposure.ambientHeat,
          rainIntensity: step.exposure.rain,
          windPressure: step.exposure.wind,
        },
        accessibility: step.simulationMode === "coarse"
          ? coarseDogAccessibility()
          : step.foodContact === null
            ? step.accessibility
            : Object.freeze({ ...step.accessibility, "approach-food": false }),
        foodContact: {
          directlyConfirmed: step.foodContact !== null,
          accessible: step.foodContact !== null && step.accessibility.eat,
        },
        current: {
          intent: dog.intent.kind,
          enteredAtTick: dog.intent.enteredAtTick,
        },
      });
      if (decision === null) return failedStep("behavior-step-rejected", state);
      dog = applyDogBehaviorDecision(dog, decision);
    }

    let cargo = current.cargo;
    let foodConsumption = current.foodConsumption;
    let pendingMovement = current.pendingMovement;
    let transferEvent: ActorCargoEvent | null = null;
    let consumptionEvent: ActorCargoEvent | null = null;
    let consumedLotId: string | null = null;
    let satiety = 0;
    const ordinal = current.revision + 1;
    const eventId = bio0EcologyEventId(ordinal);

    if (decision !== null) {
      pendingMovement = decision.intent === "approach-food"
        ? movementFromDecision(decision, dog)
        : null;
      if (decision.intent === "approach-food" && pendingMovement === null) {
        return failedStep("behavior-step-rejected", state);
      }
    }

    if (decision?.intent === "eat") {
      const contact = step.foodContact;
      if (contact === null) return failedStep("behavior-step-rejected", state);

      transferEvent = cargo.events.find(({ id }) => id === contact.transferCargoEventId) ?? null;
      consumedLotId = contact.resultLotId;
      if (transferEvent === null) return failedStep("cargo-step-rejected", state);

      const consumption = consumeActorCargoProvision(cargo, {
        transactionId: consumptionTransactionId(contact, consumedLotId),
        containerId: current.foodSource.receiverContainerId,
        lotId: consumedLotId,
        quantity: 1,
      });
      if (
        !consumption.ok
        || consumption.reason !== "applied"
        || consumption.event?.kind !== "provision-consumed"
        || consumption.event.actorId !== dog.identity.stableId
        || consumption.affectedLot?.payload.kind !== "provision"
        || consumption.affectedLot.payload.quantity !== 1
        || consumption.conservation !== null
      ) return failedStep("cargo-step-rejected", state);
      cargo = consumption.state;
      consumptionEvent = consumption.event;

      const applied = applyCommittedDogFoodConsumption(
        dog.identity,
        dog.needs,
        foodConsumption,
        consumption,
      );
      if (!applied.ok) return failedStep("cargo-step-rejected", state);
      foodConsumption = applied.consumptionState;
      satiety = applied.nutrition.satiety;
      dog = replaceDogActorPhysiology(dog, {
        needs: applied.needs,
        condition: dog.condition,
        humanFamiliarity: dog.humanFamiliarity,
        atTick: step.tick,
      });
      dog = appendDogActorMemory(dog, {
        eventId,
        kind: "human-interaction",
        subjectId: step.porterAddress.actorId,
        atTick: step.tick,
        salience: 900_000,
        location: dog.address.position,
      });
      dog = appendDogActorMemory(dog, {
        eventId: `${eventId}:food`,
        kind: "food",
        subjectId: null,
        atTick: step.tick,
        salience: 900_000,
        location: dog.address.position,
      });
      dog = applyFirstMealPlayerKnowledgeAndPromotion(dog, eventId, step.tick);
      pendingMovement = null;
    }

    const scentObservationId = focusedScentObservationId(decision, dog, observations);
    const kind: Bio0EcologyEventKind = consumptionEvent !== null
      ? "food-consumed"
      : decision?.intent === "approach-food"
        ? "food-approached"
        : "ecology-stepped";
    const event: Bio0EcologyEvent = {
      id: eventId,
      ordinal,
      tick: step.tick,
      kind,
      dogActorId: dog.identity.stableId,
      intent: dog.intent.kind,
      scentObservationId,
      movementRequestId: pendingMovement?.id ?? null,
      contactId: consumptionEvent === null ? null : step.foodContact?.id ?? null,
      requestId: consumptionEvent === null ? null : step.foodContact?.requestId ?? null,
      decisionId: consumptionEvent === null ? null : step.foodContact?.decisionId ?? null,
      transferCargoEventId: transferEvent?.id ?? null,
      consumptionCargoEventId: consumptionEvent?.id ?? null,
      sourceLotId: consumptionEvent === null ? null : current.foodSource.sourceLotId,
      consumedLotId,
      quantity: consumptionEvent === null ? 0 : 1,
      satiety,
    };
    const retained = appendRetainedEvent(current, event);
    const candidate = canonicalizeBio0EcologyState({
      ...current,
      revision: ordinal,
      tick: step.tick,
      historyBaseOrdinal: retained.historyBaseOrdinal,
      historyArchiveHash: retained.historyArchiveHash,
      dog,
      foodConsumption,
      porterAddress: step.porterAddress,
      cargo,
      lastExposure: step.exposure,
      lastWind: step.wind,
      pendingMovement,
      events: retained.events,
    });
    if (candidate === null) return failedStep("invariant-failed", state);
    return {
      ok: true,
      reason: "advanced",
      state: candidate,
      event: candidate.events[candidate.events.length - 1] ?? null,
    };
  } catch {
    return failedStep("invariant-failed", state);
  }
}

export function serializeBio0Ecology(value: unknown): string {
  const state = canonicalizeBio0EcologyState(value);
  if (state === null) throw new RangeError("Cannot serialize invalid BIO0 ecology state");
  const encoded = stableStringify(state);
  if (UTF8_ENCODER.encode(encoded).byteLength > BIO0_ECOLOGY_MAX_SERIALIZED_BYTES) {
    throw new RangeError("BIO0 ecology state exceeds its save budget");
  }
  return encoded;
}

export function deserializeBio0Ecology(text: unknown): Bio0EcologyState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > BIO0_ECOLOGY_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeBio0EcologyState(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

export function bio0EcologyEventId(ordinal: number): string {
  if (!positiveSafeInteger(ordinal)) {
    throw new RangeError("BIO0 ecology event ordinal is invalid");
  }
  return `bio0:event:${ordinal}`;
}

function canonicalStepInput(
  value: unknown,
  state: Bio0EcologyState,
): Bio0EcologyStepInput | null {
  if (!plainRecord(value) || !exactKeys(value, Object.hasOwn(value, "simulationMode") ? [
    "accessibility",
    "exposure",
    "foodContact",
    "porterAddress",
    "simulationMode",
    "tick",
    "wind",
  ] : [
    "accessibility",
    "exposure",
    "foodContact",
    "porterAddress",
    "tick",
    "wind",
  ])) return null;
  if (!schedulableTick(value.tick) || value.tick !== state.tick + 1) return null;
  const exposure = canonicalExposure(value.exposure);
  const wind = canonicalWind(value.wind);
  const accessibility = canonicalAccessibility(value.accessibility);
  const porterAddress = isLivingActorAddress(value.porterAddress)
    && value.porterAddress.species === "human"
    && value.porterAddress.actorId === state.porterAddress.actorId
    && value.porterAddress.persistence === state.porterAddress.persistence
    ? value.porterAddress as Bio0EcologyState["porterAddress"]
    : null;
  const foodContact = value.foodContact === null
    ? null
    : canonicalContact(value.foodContact);
  const simulationMode = value.simulationMode === undefined
    ? "full"
    : canonicalSimulationMode(value.simulationMode);
  if (
    exposure === null
    || wind === null
    || accessibility === null
    || porterAddress === null
    || simulationMode === null
    || (value.foodContact !== null && foodContact === null)
    || (simulationMode === "coarse" && foodContact !== null)
  ) return null;
  if (
    foodContact !== null
    && !contactMatchesState(foodContact, state, porterAddress, value.tick)
  ) return null;
  return deepFreeze({
    tick: value.tick,
    porterAddress,
    exposure,
    wind,
    accessibility,
    foodContact,
    simulationMode,
  });
}

function contactMatchesState(
  contact: Bio0OfferedFoodContact,
  state: Bio0EcologyState,
  porterAddress: Bio0EcologyState["porterAddress"],
  tick: number,
): boolean {
  const receiver = containerById(state.cargo, state.foodSource.receiverContainerId);
  if (
    contact.tick !== tick
    || contact.beneficiaryActorId !== state.dog.identity.stableId
    || contact.providerActorId !== porterAddress.actorId
    || contact.providerContainerId !== state.foodSource.providerContainerId
    || contact.receiverContainerId !== state.foodSource.receiverContainerId
    || contact.sourceLotId !== state.foodSource.sourceLotId
    || receiver?.closure !== "open"
    || transferEventDoesNotMatchContact(state.cargo, contact)
  ) return false;
  try {
    const delta = worldPositionDelta(state.dog.address.position, porterAddress.position);
    const squared = BigInt(delta.x) * BigInt(delta.x) + BigInt(delta.y) * BigInt(delta.y);
    return squared <= BigInt(BIO0_FOOD_CONTACT_RANGE_UNITS) ** 2n;
  } catch {
    return false;
  }
}

function transferEventDoesNotMatchContact(
  cargo: ActorCargoState,
  contact: Bio0OfferedFoodContact,
): boolean {
  const event = cargo.events.find(({ id }) => id === contact.transferCargoEventId);
  const receiver = containerById(cargo, contact.receiverContainerId);
  const lot = receiver?.carrier.lots.find(({ id }) => id === contact.resultLotId);
  return event === undefined
    || event.kind !== "provision-transferred"
    || !validBio0TransferTransaction(event.transactionId)
    || event.transactionId !== offeredProvisionTransferTransactionId(contact)
    || event.actorId !== contact.beneficiaryActorId
    || event.sourceContainerId !== contact.providerContainerId
    || event.destinationContainerId !== contact.receiverContainerId
    || event.sourceLotId !== contact.sourceLotId
    || event.resultLotId !== contact.resultLotId
    || event.provision !== contact.provision
    || event.quantity !== contact.quantity
    || event.tombstoned
    || lot?.payload.kind !== "provision"
    || lot.payload.lotId !== contact.resultLotId
    || lot.payload.provision !== contact.provision
    || lot.payload.quantity !== 1
    || stableStringify(lot.materialState) !== stableStringify(event.materialState);
}

function validBio0TransferTransaction(value: string): boolean {
  return /^bio0:transfer:[0-9a-f]{16}$/u.test(value)
    || /^living-enact:[0-9a-f]{16}:(0|[1-9][0-9]*):[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u.test(value);
}

function validFoodCustody(
  cargo: ActorCargoState,
  foodSource: Bio0FoodSourceReference,
  porterActorId: string,
  dogActorId: string,
  receipt: Readonly<DogFoodConsumptionState>,
): boolean {
  if (cargo.containers.length !== 2 || cargo.events.length < 1) return false;
  const provider = containerById(cargo, foodSource.providerContainerId);
  const receiver = containerById(cargo, foodSource.receiverContainerId);
  if (
    provider === null
    || receiver === null
    || provider.custodianActorId !== porterActorId
    || receiver.custodianActorId !== dogActorId
    || provider.carrier.owner.kind !== "actor"
    || provider.carrier.owner.id !== porterActorId
    || receiver.carrier.owner.kind !== "actor"
    || receiver.carrier.owner.id !== dogActorId
    || receiver.closure !== "open"
    || provider.carrier.retiredLotIds.length !== 0
  ) return false;

  const lifecycleEvents = cargo.events.filter(({ kind }) => kind !== "closure-changed");
  const addition = lifecycleEvents[0];
  if (
    addition === undefined
    || addition.kind !== "provision-added"
    || addition.transactionId !== initialCargoTransactionId(foodSource, porterActorId)
    || addition.actorId !== porterActorId
    || addition.destinationContainerId !== provider.id
    || addition.sourceContainerId !== null
    || addition.sourceLotId !== null
    || addition.resultLotId !== foodSource.sourceLotId
    || addition.provision === null
    || addition.quantity <= 0
    || addition.materialState === null
    || addition.tombstoned
  ) return false;

  const consumedResultIds: string[] = [];
  const consumes: ActorCargoEvent[] = [];
  let pendingTransfer: ActorCargoEvent | null = null;
  for (let index = 1; index < lifecycleEvents.length;) {
    const transfer = lifecycleEvents[index];
    const consumption = lifecycleEvents[index + 1];
    if (
      transfer === undefined
      || transfer.kind !== "provision-transferred"
      || !validBio0TransferTransaction(transfer.transactionId)
      || transfer.actorId !== dogActorId
      || transfer.sourceContainerId !== provider.id
      || transfer.destinationContainerId !== receiver.id
      || transfer.sourceLotId !== foodSource.sourceLotId
      || transfer.resultLotId === null
      || transfer.provision !== addition.provision
      || transfer.quantity !== 1
      || stableStringify(transfer.materialState) !== stableStringify(addition.materialState)
      || transfer.tombstoned
    ) return false;

    if (consumption === undefined) {
      pendingTransfer = transfer;
      index += 1;
      continue;
    }
    if (
      consumption.kind !== "provision-consumed"
      || !/^bio0:consume:[0-9a-f]{16}$/u.test(consumption.transactionId)
      || consumption.actorId !== dogActorId
      || consumption.sourceContainerId !== receiver.id
      || consumption.destinationContainerId !== null
      || consumption.sourceLotId !== transfer.resultLotId
      || consumption.resultLotId !== null
      || consumption.provision !== transfer.provision
      || consumption.quantity !== 1
      || stableStringify(consumption.materialState) !== stableStringify(transfer.materialState)
      || !consumption.tombstoned
    ) return false;
    consumedResultIds.push(transfer.resultLotId);
    consumes.push(consumption);
    index += 2;
  }
  const transferredResultIds = pendingTransfer === null
    ? consumedResultIds
    : [...consumedResultIds, pendingTransfer.resultLotId as string];
  if (new Set(transferredResultIds).size !== transferredResultIds.length) return false;
  const expectedRetired = [...consumedResultIds].sort(compareText);
  if (stableStringify(receiver.carrier.retiredLotIds) !== stableStringify(expectedRetired)) return false;
  if (
    receiver.carrier.lots.length !== (pendingTransfer === null ? 0 : 1)
    || (pendingTransfer !== null && (
      receiver.carrier.lots[0]?.id !== pendingTransfer.resultLotId
      || receiver.carrier.lots[0]?.payload.kind !== "provision"
      || receiver.carrier.lots[0]?.payload.quantity !== 1
      || stableStringify(receiver.carrier.lots[0]?.materialState)
        !== stableStringify(pendingTransfer.materialState)
    ))
  ) return false;

  const remaining = addition.quantity - transferredResultIds.length;
  if (remaining < 0 || provider.carrier.lots.length !== (remaining === 0 ? 0 : 1)) return false;
  const live = provider.carrier.lots[0];
  if (remaining > 0 && (
    live === undefined
    || live.id !== foodSource.sourceLotId
    || live.payload.kind !== "provision"
    || live.payload.lotId !== foodSource.sourceLotId
    || live.payload.provision !== addition.provision
    || live.payload.quantity !== remaining
    || stableStringify(live.materialState) !== stableStringify(addition.materialState)
  )) return false;

  const latestConsumption = consumes[consumes.length - 1] ?? null;
  return latestConsumption === null
    ? receipt.lastAppliedEventOrdinal === 0
      && receipt.lastAppliedEventId === null
      && receipt.lastAppliedTransactionId === null
      && receipt.lastAppliedTransactionHash === null
    : receipt.lastAppliedEventOrdinal === latestConsumption.ordinal
      && receipt.lastAppliedEventId === latestConsumption.id
      && receipt.lastAppliedTransactionId === latestConsumption.transactionId
      && receipt.lastAppliedTransactionHash === latestConsumption.transactionHash;
}

function retainedConsumptionEvidenceMatches(
  cargo: ActorCargoState,
  foodSource: Bio0FoodSourceReference,
  ecologyEvents: readonly Bio0EcologyEvent[],
): boolean {
  const byId = new Map(cargo.events.map((event) => [event.id, event]));
  const seenCargoEvents = new Set<string>();
  const seenContacts = new Set<string>();
  for (const event of ecologyEvents) {
    if (event.kind !== "food-consumed") continue;
    const transfer = event.transferCargoEventId === null
      ? undefined
      : byId.get(event.transferCargoEventId);
    const consumption = event.consumptionCargoEventId === null
      ? undefined
      : byId.get(event.consumptionCargoEventId);
    if (
      transfer?.kind !== "provision-transferred"
      || consumption?.kind !== "provision-consumed"
      || event.contactId === null
      || event.requestId === null
      || event.decisionId === null
      || seenContacts.has(event.contactId)
      || seenCargoEvents.has(transfer.id)
      || seenCargoEvents.has(consumption.id)
      || transfer.sourceContainerId !== foodSource.providerContainerId
      || transfer.destinationContainerId !== foodSource.receiverContainerId
      || transfer.sourceLotId !== foodSource.sourceLotId
      || transfer.resultLotId !== event.consumedLotId
      || consumption.sourceContainerId !== foodSource.receiverContainerId
      || consumption.sourceLotId !== event.consumedLotId
      || transfer.quantity !== event.quantity
      || consumption.quantity !== event.quantity
      || consumption.materialState === null
      || consumption.provision === null
      || expectedSatiety(consumption) !== event.satiety
    ) return false;
    const contact = canonicalizeOfferedProvisionContact({
      version: 1,
      id: event.contactId,
      kind: "offered-provision-contact",
      tick: event.tick,
      requestId: event.requestId,
      decisionId: event.decisionId,
      providerActorId: transfer.sourceContainerId === foodSource.providerContainerId
        ? cargo.containers.find(({ id }) => id === foodSource.providerContainerId)?.custodianActorId
        : null,
      beneficiaryActorId: event.dogActorId,
      providerContainerId: foodSource.providerContainerId,
      receiverContainerId: foodSource.receiverContainerId,
      sourceLotId: foodSource.sourceLotId,
      resultLotId: event.consumedLotId,
      provision: transfer.provision,
      quantity: 1,
      transferCargoEventId: transfer.id,
    });
    if (
      contact === null
      || transfer.transactionId !== offeredProvisionTransferTransactionId(contact)
    ) return false;
    seenContacts.add(event.contactId);
    seenCargoEvents.add(transfer.id);
    seenCargoEvents.add(consumption.id);
  }
  const cargoConsumptionCount = cargo.events.filter(
    ({ kind }) => kind === "provision-consumed",
  ).length;
  return ecologyEvents[0]?.ordinal === 1
    ? seenCargoEvents.size === cargoConsumptionCount * 2
    : seenCargoEvents.size <= cargoConsumptionCount * 2;
}

function dogFoodMemoriesMatch(
  dog: DogActorState,
  porterActorId: string,
  createdAtTick: number,
  revision: number,
  cargo: ActorCargoState,
  ecologyEvents: readonly Bio0EcologyEvent[],
  historyBaseOrdinal: number,
): boolean {
  const consumedCount = cargo.events.filter(({ kind }) => kind === "provision-consumed").length;
  const expectedMemoryCount = Math.min(consumedCount * 2, 16);
  if (dog.memories.length !== expectedMemoryCount || dog.memories.length % 2 !== 0) return false;
  const byId = new Map(dog.memories.map((memory) => [memory.eventId, memory]));
  const baseIds = dog.memories
    .filter(({ kind }) => kind === "human-interaction")
    .map(({ eventId }) => eventId);
  if (baseIds.length * 2 !== dog.memories.length) return false;
  for (const baseId of baseIds) {
    const human = byId.get(baseId);
    const food = byId.get(`${baseId}:food`);
    const match = /^bio0:event:([1-9][0-9]*)$/u.exec(baseId);
    if (human === undefined || food === undefined || match === null) return false;
    const ordinal = Number(match[1]);
    if (
      !positiveSafeInteger(ordinal)
      || ordinal > revision
      || human.kind !== "human-interaction"
      || human.subjectId !== porterActorId
      || food.kind !== "food"
      || food.subjectId !== null
      || human.atTick !== createdAtTick + ordinal
      || food.atTick !== human.atTick
      || human.salience !== 900_000
      || food.salience !== 900_000
      || stableStringify(human.location) !== stableStringify(food.location)
    ) return false;
    if (
      ordinal > historyBaseOrdinal
      && !ecologyEvents.some((event) => event.ordinal === ordinal && event.kind === "food-consumed")
    ) return false;
  }
  if (consumedCount > 0) {
    const promotedBy = dog.promotion?.reason;
    const firstMealId = baseIds.reduce<string | null>((oldest, candidate) => {
      if (oldest === null) return candidate;
      const oldestOrdinal = Number(/^bio0:event:([1-9][0-9]*)$/u.exec(oldest)?.[1] ?? Infinity);
      const candidateOrdinal = Number(
        /^bio0:event:([1-9][0-9]*)$/u.exec(candidate)?.[1] ?? Infinity,
      );
      return candidateOrdinal < oldestOrdinal ? candidate : oldest;
    }, null);
    const recognizable = dog.playerKnowledge.facts.find(
      ({ fact }) => fact === "recognizable-individual",
    );
    const familiarity = dog.playerKnowledge.facts.find(
      ({ fact }) => fact === "human-familiarity",
    );
    const significantHistory = dog.playerKnowledge.facts.find(
      ({ fact }) => fact === "significant-history",
    );
    if (
      firstMealId === null
      || dog.address.persistence !== "promoted"
      || promotedBy?.kind !== "causal-event"
      || promotedBy.eventId !== firstMealId
      || recognizable?.source !== "interaction"
      || recognizable.evidenceId !== firstMealId
      || familiarity?.source !== "interaction"
      || familiarity.evidenceId !== `${firstMealId}:food`
      || significantHistory?.source !== "interaction"
      || significantHistory.evidenceId !== firstMealId
    ) return false;
  }
  const latestRetainedMeal = [...ecologyEvents].reverse().find(({ kind }) => kind === "food-consumed");
  if (latestRetainedMeal !== undefined) {
    const latestRememberedMealOrdinal = Math.max(...baseIds.map((baseId) => (
      Number(/^bio0:event:([1-9][0-9]*)$/u.exec(baseId)?.[1] ?? 0)
    )));
    if (latestRememberedMealOrdinal !== latestRetainedMeal.ordinal) return false;
  }
  return true;
}

/**
 * The first physically consumed offered meal is meaningful causal evidence:
 * it makes this exact individual recognizable, establishes bounded human
 * familiarity, and promotes the same stable actor. Replays are idempotent.
 */
export function applyFirstMealPlayerKnowledgeAndPromotion(
  value: unknown,
  ecologyEventId: string,
  atTick: number,
): DogActorState {
  let dog = canonicalizeDogActorState(value);
  if (dog === null || !validId(ecologyEventId) || !nonnegativeSafeInteger(atTick)) {
    throw new RangeError("First-meal knowledge requires canonical causal evidence");
  }
  if (!dog.playerKnowledge.facts.some(({ fact }) => fact === "recognizable-individual")) {
    dog = learnDogPlayerKnowledge(dog, {
      fact: "recognizable-individual",
      source: "interaction",
      evidenceId: ecologyEventId,
      learnedAtTick: atTick,
      confidence: FIXED_POINT,
    });
  }
  if (!dog.playerKnowledge.facts.some(({ fact }) => fact === "human-familiarity")) {
    dog = learnDogPlayerKnowledge(dog, {
      fact: "human-familiarity",
      source: "interaction",
      evidenceId: `${ecologyEventId}:food`,
      learnedAtTick: atTick,
      confidence: 900_000,
    });
  }
  if (!dog.playerKnowledge.facts.some(({ fact }) => fact === "significant-history")) {
    dog = learnDogPlayerKnowledge(dog, {
      fact: "significant-history",
      source: "interaction",
      evidenceId: ecologyEventId,
      learnedAtTick: atTick,
      confidence: 900_000,
    });
  }
  if (dog.promotion === null) {
    dog = promoteDogActor(dog, {
      kind: "causal-event",
      eventId: ecologyEventId,
      atTick,
    });
  }
  return dog;
}

function canonicalEvent(value: unknown): Bio0EcologyEvent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "consumedLotId",
    "consumptionCargoEventId",
    "contactId",
    "decisionId",
    "dogActorId",
    "id",
    "intent",
    "kind",
    "movementRequestId",
    "ordinal",
    "quantity",
    "requestId",
    "satiety",
    "scentObservationId",
    "sourceLotId",
    "tick",
    "transferCargoEventId",
  ])) return null;
  if (
    !validId(value.id)
    || !positiveSafeInteger(value.ordinal)
    || !nonnegativeSafeInteger(value.tick)
    || !isEventKind(value.kind)
    || !validId(value.dogActorId)
    || !isBehaviorIntent(value.intent)
    || !validNullableId(value.scentObservationId)
    || !validNullableId(value.movementRequestId)
    || !validNullableId(value.contactId)
    || !validNullableId(value.decisionId)
    || !validNullableId(value.requestId)
    || !validNullableId(value.transferCargoEventId)
    || !validNullableId(value.consumptionCargoEventId)
    || !validNullableId(value.sourceLotId)
    || !validNullableId(value.consumedLotId)
    || !nonnegativeSafeInteger(value.quantity)
    || !scaledUnit(value.satiety)
  ) return null;
  const consumed = value.kind === "food-consumed";
  if (consumed !== (
    value.intent === "eat"
    && value.contactId !== null
    && value.requestId !== null
    && value.decisionId !== null
    && value.transferCargoEventId !== null
    && value.consumptionCargoEventId !== null
    && value.sourceLotId !== null
    && value.consumedLotId !== null
    && value.quantity === 1
    && value.movementRequestId === null
  )) return null;
  if (!consumed && (
    value.contactId !== null
    || value.decisionId !== null
    || value.requestId !== null
    || value.transferCargoEventId !== null
    || value.consumptionCargoEventId !== null
    || value.sourceLotId !== null
    || value.consumedLotId !== null
    || value.quantity !== 0
    || value.satiety !== 0
  )) return null;
  if (value.kind === "food-approached" && (
    value.intent !== "approach-food"
    || value.scentObservationId === null
    || value.movementRequestId === null
  )) return null;
  if (value.movementRequestId !== null && value.intent !== "approach-food") return null;
  return deepFreeze({
    id: value.id,
    ordinal: value.ordinal,
    tick: value.tick,
    kind: value.kind,
    dogActorId: value.dogActorId,
    intent: value.intent,
    scentObservationId: value.scentObservationId,
    movementRequestId: value.movementRequestId,
    contactId: value.contactId,
    decisionId: value.decisionId,
    requestId: value.requestId,
    transferCargoEventId: value.transferCargoEventId,
    consumptionCargoEventId: value.consumptionCargoEventId,
    sourceLotId: value.sourceLotId,
    consumedLotId: value.consumedLotId,
    quantity: value.quantity,
    satiety: value.satiety,
  });
}

function canonicalFoodSeed(value: unknown): Bio0FoodSeed | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "lotId",
    "materialState",
    "providerCapacityMilliLoad",
    "providerClosure",
    "providerContainerId",
    "provision",
    "quantity",
    "receiverCapacityMilliLoad",
    "receiverContainerId",
  ])) return null;
  if (
    !validCargoId(value.providerContainerId)
    || !validCargoId(value.receiverContainerId)
    || value.providerContainerId === value.receiverContainerId
    || !validCargoId(value.lotId)
    || !Object.hasOwn(PROVISION_DEFINITIONS, value.provision as PropertyKey)
    || !positiveSafeInteger(value.quantity)
    || value.quantity > MAX_FOOD_UNITS
    || !nonnegativeSafeInteger(value.providerCapacityMilliLoad)
    || !nonnegativeSafeInteger(value.receiverCapacityMilliLoad)
    || (value.providerClosure !== "open" && value.providerClosure !== "secured")
  ) return null;
  const materialState = canonicalMaterialState(value.materialState);
  if (materialState === null) return null;
  return deepFreeze({
    providerContainerId: value.providerContainerId,
    receiverContainerId: value.receiverContainerId,
    lotId: value.lotId,
    provision: value.provision as ProvisionKind,
    quantity: value.quantity,
    providerCapacityMilliLoad: value.providerCapacityMilliLoad,
    receiverCapacityMilliLoad: value.receiverCapacityMilliLoad,
    providerClosure: value.providerClosure,
    materialState,
  });
}

function canonicalFoodSource(value: unknown): Bio0FoodSourceReference | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "providerContainerId",
    "receiverContainerId",
    "sourceLotId",
  ])) return null;
  if (
    !validCargoId(value.providerContainerId)
    || !validCargoId(value.receiverContainerId)
    || value.providerContainerId === value.receiverContainerId
    || !validCargoId(value.sourceLotId)
  ) return null;
  return Object.freeze({
    providerContainerId: value.providerContainerId,
    receiverContainerId: value.receiverContainerId,
    sourceLotId: value.sourceLotId,
  });
}

function canonicalPendingMovement(value: unknown): Bio0PendingMovement | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "beliefKey",
    "dogActorId",
    "id",
    "issuedAtTick",
    "kind",
    "maximumStepUnits",
    "targetArea",
  ])) return null;
  if (
    !validId(value.id)
    || value.kind !== "approach-perceived-area"
    || !nonnegativeSafeInteger(value.issuedAtTick)
    || !validId(value.dogActorId)
    || !validBeliefKey(value.beliefKey)
    || value.maximumStepUnits !== BIO0_APPROACH_MAXIMUM_STEP_UNITS
  ) return null;
  const targetArea = canonicalObservedArea(value.targetArea);
  return targetArea === null ? null : deepFreeze({
    id: value.id,
    kind: "approach-perceived-area",
    issuedAtTick: value.issuedAtTick,
    dogActorId: value.dogActorId,
    beliefKey: value.beliefKey,
    targetArea,
    maximumStepUnits: BIO0_APPROACH_MAXIMUM_STEP_UNITS,
  });
}

function pendingMovementMatchesDog(movement: Bio0PendingMovement, dog: DogActorState): boolean {
  if (
    movement.dogActorId !== dog.identity.stableId
    || movement.issuedAtTick > dog.updatedAtTick
  ) return false;
  const belief = dog.perception.beliefs.find(({ key }) => key === movement.beliefKey);
  return isFoodScentBelief(belief)
    && stableStringify(belief.area) === stableStringify(movement.targetArea)
    && movement.id === movementId(
      movement.dogActorId,
      movement.beliefKey,
      movement.issuedAtTick,
      movement.targetArea,
    );
}

function canonicalContact(value: unknown): Bio0OfferedFoodContact | null {
  return canonicalizeOfferedProvisionContact(value);
}

function canonicalExposure(value: unknown): DogExposureSample | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "ambientCold",
    "ambientHeat",
    "exertion",
    "immersion",
    "rain",
    "shelter",
    "version",
    "wind",
  ])) return null;
  if (
    value.version !== DOG_EXPOSURE_VERSION
    || !scaledUnit(value.rain)
    || !scaledUnit(value.immersion)
    || !scaledUnit(value.ambientCold)
    || !scaledUnit(value.ambientHeat)
    || !scaledUnit(value.wind)
    || !scaledUnit(value.shelter)
    || !scaledUnit(value.exertion)
  ) return null;
  return Object.freeze({
    version: DOG_EXPOSURE_VERSION,
    rain: value.rain,
    immersion: value.immersion,
    ambientCold: value.ambientCold,
    ambientHeat: value.ambientHeat,
    wind: value.wind,
    shelter: value.shelter,
    exertion: value.exertion,
  });
}

function canonicalWind(value: unknown): FixedScentWind | null {
  if (!plainRecord(value) || !exactKeys(value, ["x", "y"])) return null;
  if (!signedUnit(value.x) || !signedUnit(value.y)) return null;
  return Object.freeze({ x: value.x, y: value.y });
}

function canonicalAccessibility(value: unknown): DogActionAccessibility | null {
  if (!plainRecord(value) || !exactKeys(value, DOG_BEHAVIOR_INTENTS)) return null;
  if (DOG_BEHAVIOR_INTENTS.some((intent) => typeof value[intent] !== "boolean")) return null;
  return Object.freeze(Object.fromEntries(
    DOG_BEHAVIOR_INTENTS.map((intent) => [intent, value[intent]]),
  )) as DogActionAccessibility;
}

function canonicalSimulationMode(value: unknown): Bio0SimulationMode | null {
  return value === "full" || value === "coarse" ? value : null;
}

/** Coarse cognition may rest/observe, but cannot move, eat, or touch hidden state. */
function coarseDogAccessibility(): DogActionAccessibility {
  return Object.freeze({
    retreat: false,
    "seek-shelter": false,
    "avoid-human": false,
    eat: false,
    "approach-food": false,
    rest: true,
    observe: true,
  });
}

function canonicalMaterialState(value: unknown): CargoEnvironmentState | null {
  if (!plainRecord(value) || !exactKeys(value, ["condition", "contamination", "decay"])) {
    return null;
  }
  if (!scaledUnit(value.condition) || !scaledUnit(value.contamination) || !scaledUnit(value.decay)) {
    return null;
  }
  return Object.freeze({
    condition: value.condition,
    contamination: value.contamination,
    decay: value.decay,
  });
}

function canonicalObservedArea(value: unknown): ObservedArea | null {
  if (!plainRecord(value) || !exactKeys(value, ["center", "radiusUnits"])) return null;
  if (
    !isWorldPosition(value.center)
    || !nonnegativeSafeInteger(value.radiusUnits)
    || value.radiusUnits > 10_000_000
  ) return null;
  return deepFreeze({ center: value.center, radiusUnits: value.radiusUnits });
}

function movementFromDecision(
  decision: DogBehaviorDecision,
  dog: DogActorState,
): Bio0PendingMovement | null {
  if (decision.intent !== "approach-food" || decision.focusBeliefKey === null) return null;
  const belief = dog.perception.beliefs.find(({ key }) => key === decision.focusBeliefKey);
  if (!isFoodScentBelief(belief)) return null;
  return deepFreeze({
    id: movementId(dog.identity.stableId, belief.key, decision.tick, belief.area),
    kind: "approach-perceived-area",
    issuedAtTick: decision.tick,
    dogActorId: dog.identity.stableId,
    beliefKey: belief.key,
    targetArea: belief.area,
    maximumStepUnits: BIO0_APPROACH_MAXIMUM_STEP_UNITS,
  });
}

function movementId(
  dogActorId: string,
  beliefKey: string,
  issuedAtTick: number,
  targetArea: ObservedArea,
): string {
  return `bio0:movement:${hashCanonical({
    dogActorId,
    beliefKey,
    issuedAtTick,
    targetArea,
  })}`;
}

function focusedScentObservationId(
  decision: DogBehaviorDecision | null,
  dog: DogActorState,
  observations: readonly Readonly<{ id: string; perceivedClass: string }>[] ,
): string | null {
  if (decision?.focusBeliefKey !== null && decision !== null) {
    const belief = dog.perception.beliefs.find(({ key }) => key === decision.focusBeliefKey);
    if (isFoodScentBelief(belief)) return belief.sourceObservationId;
  }
  return observations.find(({ perceivedClass }) => perceivedClass === "food-scent")?.id ?? null;
}

function isFoodScentBelief(value: ActorBelief | undefined): value is ActorBelief {
  return value !== undefined
    && value.channel === "scent"
    && value.perceivedClass === "food-scent"
    && value.subjectId === null;
}

function generatedDogView(dog: DogActorState): GeneratedDogState {
  return {
    identity: dog.identity,
    needs: { ...dog.needs },
    condition: { ...dog.condition, injuries: [...dog.condition.injuries] },
    humanFamiliarity: { ...dog.humanFamiliarity },
  };
}

function appendRetainedEvent(
  state: Bio0EcologyState,
  event: Bio0EcologyEvent,
): Readonly<{
  historyBaseOrdinal: number;
  historyArchiveHash: string;
  events: readonly Bio0EcologyEvent[];
}> {
  const events = [...state.events, event];
  if (events.length <= BIO0_ECOLOGY_MAX_RETAINED_EVENTS) {
    return deepFreeze({
      historyBaseOrdinal: state.historyBaseOrdinal,
      historyArchiveHash: state.historyArchiveHash,
      events,
    });
  }
  const archived = events.shift();
  if (archived === undefined) throw new Error("BIO0 retained history compaction failed");
  return deepFreeze({
    historyBaseOrdinal: state.historyBaseOrdinal + 1,
    historyArchiveHash: hashCanonical({
      priorArchiveHash: state.historyArchiveHash,
      archived,
    }),
    events,
  });
}

function expectedSatiety(event: ActorCargoEvent): number {
  if (event.provision === null || event.materialState === null) return -1;
  const definition = PROVISION_DEFINITIONS[event.provision];
  const usableNutritionFactor = Math.min(
    event.materialState.condition,
    FIXED_POINT - event.materialState.decay,
  );
  const value = BigInt(definition.nutrition) * BigInt(event.quantity)
    * BigInt(usableNutritionFactor) / BigInt(FIXED_POINT);
  return Number(value > BigInt(FIXED_POINT) ? BigInt(FIXED_POINT) : value);
}

function liveSourceFoodLot(state: Bio0EcologyState) {
  const provider = containerById(state.cargo, state.foodSource.providerContainerId);
  const lot = provider?.carrier.lots.find(({ id }) => id === state.foodSource.sourceLotId);
  return lot?.payload.kind === "provision" ? lot : null;
}

function containerById(state: ActorCargoState, id: string): ActorCargoContainer | null {
  return state.containers.find((container) => container.id === id) ?? null;
}

function initialCargoTransactionId(source: Bio0FoodSourceReference, porterActorId: string): string {
  return `bio0:init:${hashCanonical({ source, porterActorId })}`;
}

function consumptionTransactionId(contact: Bio0OfferedFoodContact, lotId: string): string {
  return `bio0:consume:${hashCanonical({
    contactId: contact.id,
    dogActorId: contact.beneficiaryActorId,
    lotId,
  })}`;
}

function offeredProvisionTransferTransactionId(contact: Bio0OfferedFoodContact): string {
  return `living-enact:${hashCanonical({ requestId: contact.requestId })}:${contact.tick}:${contact.decisionId}`;
}

function foodScentStimulusId(source: Bio0FoodSourceReference): string {
  return `bio0:food:${hashCanonical(source)}`;
}

function zeroExposure(): DogExposureSample {
  return Object.freeze({
    version: DOG_EXPOSURE_VERSION,
    rain: 0,
    immersion: 0,
    ambientCold: 0,
    ambientHeat: 0,
    wind: 0,
    shelter: 0,
    exertion: 0,
  });
}

function allowedCreateKeys(value: Record<string, unknown>): boolean {
  const expected = Object.hasOwn(value, "tick")
    ? ["dogGeneration", "dogPosition", "food", "porterAddress", "tick"]
    : ["dogGeneration", "dogPosition", "food", "porterAddress"];
  return exactKeys(value, expected);
}

function isEventKind(value: unknown): value is Bio0EcologyEventKind {
  return value === "ecology-stepped" || value === "food-approached" || value === "food-consumed";
}

function isBehaviorIntent(value: unknown): value is DogBehaviorIntent {
  return typeof value === "string"
    && (DOG_BEHAVIOR_INTENTS as readonly string[]).includes(value);
}

function validBeliefKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validCargoId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 160
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validNullableId(value: unknown): value is string | null {
  return value === null || validId(value);
}

function scaledUnit(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= ACTOR_PERCEPTION_SCALE
    && !Object.is(value, -0);
}

function signedUnit(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Math.abs(value as number) <= ACTOR_PERCEPTION_SCALE
    && !Object.is(value, -0);
}

function schedulableTick(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= Number.MAX_SAFE_INTEGER - 8;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && !Object.is(value, -0);
}

function exactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  const actual = [...ownKeys as readonly string[]].sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || !actual.every((key, index) => key === expected[index])
  ) return false;
  return actual.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function failedStep(
  reason: Exclude<Bio0EcologyStepReason, "advanced">,
  state: Bio0EcologyState,
): Bio0EcologyStepResult {
  return { ok: false, reason, state, event: null };
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
