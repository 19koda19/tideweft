import type { ObservedArea } from "../sim/actorPerception";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeDogActorState,
  type DogActorIntent,
  type DogActorState,
} from "./dogActor";
import {
  createLivingCircadianPolicy,
  livingCircadianPersistentStateFromProjection,
  projectLivingCircadian,
  type LivingCircadianDisturbance,
  type LivingCircadianPersistentState,
  type LivingCircadianPolicy,
  type LivingCircadianPriorityOverride,
  type LivingCircadianProjection,
} from "./livingCircadian";
import {
  SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION,
  SETTLEMENT_DOMESTIC_HOME_STRUCTURE_VERSION,
  SETTLEMENT_ECOLOGY_MAX_DOMESTIC_HOME_RADIUS_UNITS,
  type SettlementDomesticAnimalCustodyRecord,
} from "./settlementEcology";
import {
  canonicalizeSettlementWorkingAnimalAssignment,
  type SettlementWorkingAnimalActorDisposition,
  type SettlementWorkingAnimalAssignment,
} from "./settlementWorkingAnimals";
import { isWorldPosition } from "./worldPosition";

export const SETTLEMENT_WORKING_DOG_CIRCADIAN_VERSION = 1 as const;
export const SETTLEMENT_WORKING_DOG_CIRCADIAN_OWNER_ID =
  "game:settlement-working-dog-circadian:v1" as const;

/**
 * Runtime may persist this as the cause of the adapter's neutral `rest`
 * suggestion. It distinguishes clock-owned rest from a current dog-owned need
 * so the same saved intent cannot pin the dog asleep after dawn.
 */
export const SETTLEMENT_WORKING_DOG_CIRCADIAN_REST_INTENT_REFERENCE_ID =
  "event:settlement-working-dog-circadian-rest" as const;

const CREATED_POLICY = createLivingCircadianPolicy({
  profileId: "day-active",
  drivers: ["clock"],
});
if (CREATED_POLICY === null) {
  throw new Error("Settlement working-dog circadian policy is malformed");
}

export const SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY: LivingCircadianPolicy =
  CREATED_POLICY;

export type SettlementWorkingDogCircadianMotion =
  | Readonly<{ readonly kind: "defer-to-actor-or-work" }>
  | Readonly<{ readonly kind: "hold-at-kennel" }>
  | Readonly<{ readonly kind: "respond-to-disturbance" }>
  | Readonly<{
      readonly kind: "travel-to-kennel";
      readonly targetArea: ObservedArea;
    }>;

export interface ProjectSettlementWorkingDogCircadianInput {
  /** Canonical actor after perception/cognition has reached this exact tick. */
  readonly dog: DogActorState;
  /** The dog's actual settlement-custody record, not an arbitrary target. */
  readonly custody: SettlementDomesticAnimalCustodyRecord;
  /** The one matching persisted work relationship. */
  readonly assignment: SettlementWorkingAnimalAssignment;
  readonly atTick: number;
  /** Physical movement owner confirms this; the routine never infers arrival. */
  readonly kennelArrived: boolean;
}

export interface SettlementWorkingDogCircadianProjection {
  readonly version: typeof SETTLEMENT_WORKING_DOG_CIRCADIAN_VERSION;
  readonly ownerId: typeof SETTLEMENT_WORKING_DOG_CIRCADIAN_OWNER_ID;
  readonly dogActorId: string;
  readonly atTick: number;
  readonly kennelStructureId: string;
  readonly restDestinationId: string;
  readonly kennelArrived: boolean;
  readonly kennelArea: ObservedArea;
  readonly routine: LivingCircadianProjection;
  /** Exact compact receipt for `replaceDogActorCircadian`. */
  readonly receipt: LivingCircadianPersistentState;
  /**
   * A neutral intent suggestion only. Null preserves an actor-owned response;
   * `rest` remains awake while `motion` is `travel-to-kennel`.
   */
  readonly preferredNeutralIntent: Extract<DogActorIntent, "observe" | "rest"> | null;
  /** True only after authenticated arrival, while settling or asleep. */
  readonly restorative: boolean;
  /** Existing work-policy input; no parallel guardian disposition is invented. */
  readonly actorDisposition: SettlementWorkingAnimalActorDisposition;
  readonly motion: SettlementWorkingDogCircadianMotion;
}

/**
 * Stable physical-destination identity. Both identities are included so a
 * kennel replacement or a different dog can never inherit an old rest bout.
 */
export function settlementWorkingDogCircadianRestDestinationId(
  dogStableId: unknown,
  kennelStructureId: unknown,
): string | null {
  if (!validId(dogStableId) || !validId(kennelStructureId)) return null;
  return `kennel:${hashCanonical({
    dogStableId,
    kennelStructureId,
    ownerId: SETTLEMENT_WORKING_DOG_CIRCADIAN_OWNER_ID,
  })}`;
}

/**
 * Pure bridge from existing dog, custody, work, perception, and clock owners
 * into the shared living-circadian kernel. It owns no clock, movement, save
 * root, cognition, or physiology mutation.
 */
export function projectSettlementWorkingDogCircadian(
  inputValue: ProjectSettlementWorkingDogCircadianInput,
): SettlementWorkingDogCircadianProjection | null {
  const raw: unknown = inputValue;
  if (
    !plainRecord(raw)
    || !exactKeys(raw, ["assignment", "atTick", "custody", "dog", "kennelArrived"])
    || !nonnegativeSafeInteger(raw.atTick)
    || typeof raw.kennelArrived !== "boolean"
  ) return null;

  const dog = canonicalizeDogActorState(raw.dog);
  const assignment = canonicalizeSettlementWorkingAnimalAssignment(raw.assignment);
  const custody = canonicalDogKennelCustody(raw.custody);
  if (
    dog === null
    || assignment === null
    || custody === null
    || dog.updatedAtTick !== raw.atTick
    || assignment.workerActorId !== dog.identity.stableId
    || assignment.workerSpecies !== "domestic-dog"
    || assignment.role !== "guardian"
    || assignment.settlementId !== custody.settlementId
    || assignment.workerCustodyRelationshipId !== custody.relationshipId
    || assignment.handlerActorId !== custody.caretakerActorId
    || custody.memberActorIds.length !== 1
    || custody.memberActorIds[0] !== dog.identity.stableId
    || assignment.createdAtTick > raw.atTick
    || assignment.currentActivity.acceptedAtTick > raw.atTick
  ) return null;

  const restDestinationId = settlementWorkingDogCircadianRestDestinationId(
    dog.identity.stableId,
    custody.homeStructure.structureId,
  );
  if (restDestinationId === null) return null;

  const current = dog.circadian?.posture
    ?? Object.freeze({ state: "awake" as const, enteredAtTick: raw.atTick });
  if (
    dog.circadian !== undefined
    && (
      dog.circadian.restDestinationId !== restDestinationId
      || stableStringify(dog.circadian.policy)
        !== stableStringify(SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY)
    )
  ) return null;

  const actorOverride = dogPriorityOverride(dog);
  const workOverride = actorOverride === null
    ? activeWorkOverride(assignment)
    : null;
  const priorityOverride = actorOverride ?? workOverride;
  const routine = projectLivingCircadian({
    subjectId: dog.identity.stableId,
    atTick: raw.atTick,
    mode: "full",
    policy: SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY,
    current,
    restDestination: {
      destinationId: restDestinationId,
      arrived: raw.kennelArrived,
    },
    driverSignals: [],
    disturbance: currentStrongDisturbance(dog, raw.atTick),
    priorityOverride,
  });
  if (routine === null) return null;

  const kennelArea = deepFreeze({
    center: custody.homeStructure.position,
    radiusUnits: custody.homeStructure.radiusUnits,
  });
  const preferredNeutralIntent = neutralIntentFor(dog, routine, actorOverride);
  const actorDisposition = workDispositionFor(
    dog,
    routine,
    actorOverride,
  );
  const motion = motionFor(routine, kennelArea);
  const restorative = routine.action === "settle-at-rest-destination"
    || routine.action === "sleep-at-rest-destination";

  return deepFreeze({
    version: SETTLEMENT_WORKING_DOG_CIRCADIAN_VERSION,
    ownerId: SETTLEMENT_WORKING_DOG_CIRCADIAN_OWNER_ID,
    dogActorId: dog.identity.stableId,
    atTick: raw.atTick,
    kennelStructureId: custody.homeStructure.structureId,
    restDestinationId,
    kennelArrived: raw.kennelArrived,
    kennelArea,
    routine,
    receipt: livingCircadianPersistentStateFromProjection(routine),
    preferredNeutralIntent,
    restorative,
    actorDisposition,
    motion,
  });
}

function canonicalDogKennelCustody(
  value: unknown,
): SettlementDomesticAnimalCustodyRecord | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "caretakerActorId",
      "custodyOrdinal",
      "homeId",
      "homeStructure",
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
    || !positiveSafeInteger(value.settlementId)
    || value.species !== "domestic-dog"
    || !validId(value.caretakerActorId)
    || !Array.isArray(value.memberActorIds)
    || value.memberActorIds.length !== 1
    || !validId(value.memberActorIds[0])
    || value.memberGroupId !== null
    || !plainRecord(value.owner)
    || !plainRecord(value.homeStructure)
    || !exactKeys(value.homeStructure, [
      "kind",
      "position",
      "radiusUnits",
      "structureId",
      "version",
    ])
    || value.homeStructure.version !== SETTLEMENT_DOMESTIC_HOME_STRUCTURE_VERSION
    || value.homeStructure.kind !== "kennel"
    || !isWorldPosition(value.homeStructure.position)
    || !positiveSafeInteger(value.homeStructure.radiusUnits)
    || value.homeStructure.radiusUnits > SETTLEMENT_ECOLOGY_MAX_DOMESTIC_HOME_RADIUS_UNITS
  ) return null;

  const digest = custodyDigest(value.relationshipId);
  if (
    digest === null
    || value.homeId !== `DOMESTIC-HOME-${digest}`
    || value.homeStructure.structureId !== `DOMESTIC-KENNEL-${digest}`
    || !canonicalCustodyOwner(value.owner, value.settlementId)
  ) return null;
  return value as unknown as SettlementDomesticAnimalCustodyRecord;
}

function dogPriorityOverride(
  dog: DogActorState,
): LivingCircadianPriorityOverride | null {
  switch (dog.intent.kind) {
    case "observe":
      return null;
    case "rest":
      return scheduleOwnedRestIntent(dog)
        ? null
        : Object.freeze({
            kind: "urgent-need" as const,
            referenceId: dog.intent.cause.referenceId,
            preference: "rest" as const,
          });
    case "seek-shelter":
      return Object.freeze({
        kind: "urgent-need" as const,
        referenceId: dog.intent.cause.referenceId,
        preference: "rest" as const,
      });
    case "approach-food":
    case "avoid-human":
    case "eat":
    case "retreat":
      return Object.freeze({
        kind: "urgent-need" as const,
        referenceId: dog.intent.cause.referenceId,
        preference: "active" as const,
      });
  }
}

function activeWorkOverride(
  assignment: SettlementWorkingAnimalAssignment,
): LivingCircadianPriorityOverride | null {
  const task = assignment.currentTask;
  if (task !== null && task.suspension !== null) return null;
  if (task?.phase === "investigating" || task?.phase === "returning") {
    return Object.freeze({
      kind: "active-commitment" as const,
      referenceId: task.taskId,
      preference: "active" as const,
    });
  }
  return assignment.currentActivity.activity === "investigate"
    || assignment.currentActivity.activity === "return"
    ? Object.freeze({
        kind: "active-commitment" as const,
        referenceId: assignment.currentActivity.transactionId,
        preference: "active" as const,
      })
    : null;
}

function currentStrongDisturbance(
  dog: DogActorState,
  atTick: number,
): LivingCircadianDisturbance | null {
  const belief = [...dog.perception.beliefs].filter((candidate) => (
    candidate.lastObservedTick === atTick && candidate.strongInterrupt
  )).sort((left, right) => (
    right.salience - left.salience
    || (left.sourceObservationId < right.sourceObservationId ? -1 : 1)
  ))[0];
  return belief === undefined
    ? null
    : Object.freeze({
        source: "lawful-perception" as const,
        referenceId: belief.sourceObservationId,
        observedAtTick: atTick,
        intensity: belief.salience,
      });
}

function neutralIntentFor(
  dog: DogActorState,
  routine: LivingCircadianProjection,
  actorOverride: LivingCircadianPriorityOverride | null,
): Extract<DogActorIntent, "observe" | "rest"> | null {
  if (actorOverride !== null || routine.posture.state === "startled") return null;
  if (routine.effectivePreference === "rest") return "rest";
  return dog.intent.kind === "observe" || scheduleOwnedRestIntent(dog)
    ? "observe"
    : null;
}

function workDispositionFor(
  dog: DogActorState,
  routine: LivingCircadianProjection,
  actorOverride: LivingCircadianPriorityOverride | null,
): SettlementWorkingAnimalActorDisposition {
  if (routine.posture.state === "startled") {
    return Object.freeze({
      kind: "defer-to-actor" as const,
      referenceId: `actor-intent:${dog.intent.kind}`,
    });
  }
  if (actorOverride !== null) {
    return Object.freeze({
      kind: "defer-to-actor" as const,
      referenceId: `actor-intent:${dog.intent.kind}`,
    });
  }
  if (routine.effectivePreference === "rest") {
    return Object.freeze({
      kind: "defer-to-actor" as const,
      referenceId: "actor-intent:rest",
    });
  }
  return Object.freeze({ kind: "available" as const });
}

function motionFor(
  routine: LivingCircadianProjection,
  kennelArea: ObservedArea,
): SettlementWorkingDogCircadianMotion {
  switch (routine.action) {
    case "travel-to-rest-destination":
      return deepFreeze({ kind: "travel-to-kennel" as const, targetArea: kennelArea });
    case "settle-at-rest-destination":
    case "sleep-at-rest-destination":
      return Object.freeze({ kind: "hold-at-kennel" as const });
    case "respond-to-disturbance":
      return Object.freeze({ kind: "respond-to-disturbance" as const });
    case "remain-active":
      return Object.freeze({ kind: "defer-to-actor-or-work" as const });
  }
}

function scheduleOwnedRestIntent(dog: DogActorState): boolean {
  return dog.intent.kind === "rest"
    && dog.intent.cause.kind === "world-event"
    && dog.intent.cause.referenceId
      === SETTLEMENT_WORKING_DOG_CIRCADIAN_REST_INTENT_REFERENCE_ID;
}

function custodyDigest(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^DOMESTIC-REL-([0-9a-f]{16})$/u.exec(value);
  return match?.[1] ?? null;
}

function canonicalCustodyOwner(value: Record<string, unknown>, settlementId: number): boolean {
  if (value.kind === "settlement") {
    return exactKeys(value, ["id", "kind"])
      && value.id === settlementId;
  }
  return value.kind === "actor"
    && exactKeys(value, ["id", "kind"])
    && validId(value.id);
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length
    && keys.every((key, index) => key === sortedExpected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
