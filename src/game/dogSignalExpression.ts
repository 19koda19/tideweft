import { hashCanonical, stableStringify } from "../sim/util";
import type { AgedActorBelief } from "../sim/actorPerception";
import {
  canonicalizeDogActorState,
  type DogActorState,
} from "./dogActor";
import {
  SITUATED_EXPRESSION_VERSION,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionMemory,
} from "./situatedExpression";
import {
  canonicalizeSettlementWorkingAnimalState,
  settlementGuardianAlarmInvestigation,
  type SettlementWorkingAnimalActivityTransaction,
  type SettlementWorkingAnimalAssignment,
  type SettlementWorkingAnimalState,
} from "./settlementWorkingAnimals";
import { strongestDogThreatBelief } from "./dogBehavior";

export interface GuardianDogWarningExpressionInput {
  readonly dog: DogActorState;
  readonly workingAnimals: SettlementWorkingAnimalState;
  readonly completedTick: number;
}

export interface GuardianDogDefensiveGrowlExpressionInput {
  readonly dog: DogActorState;
  readonly workingAnimals: SettlementWorkingAnimalState;
  readonly completedTick: number;
}

export interface GuardianDogShelterWhineExpressionInput {
  readonly dog: DogActorState;
  readonly workingAnimals: SettlementWorkingAnimalState;
  readonly completedTick: number;
  /** Exact positive fixed-point score of the shelter intent's weather condition. */
  readonly shelterIntentScore: number;
}

/**
 * Binds the event-time weather receipt to the retained expression trigger
 * without changing live expression arbitration. The activity transaction
 * remains independently persisted by the working-animal owner.
 */
export function guardianDogShelterWhineTriggerEventId(
  activityTransactionId: string,
  shelterIntentScore: number,
): string | null {
  if (!validId(activityTransactionId) || !positiveFixedPoint(shelterIntentScore)) return null;
  const triggerEventId = `${activityTransactionId}:shelter-whine-score:${shelterIntentScore}`;
  return validId(triggerEventId) ? triggerEventId : null;
}

/**
 * Adapts one newly committed, perception-backed guardian investigation into a
 * warning bark. The work authority already proved route access and selected
 * the strongest lawful anonymous signal; this adapter never inspects a hidden
 * alarm subject or invents a timer-driven call.
 */
export function guardianDogWarningExpressionIntent(
  inputValue: GuardianDogWarningExpressionInput,
): SituatedExpressionIntent | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "completedTick",
    "dog",
    "workingAnimals",
  ])) return null;
  const dog = canonicalizeDogActorState(input.dog);
  if (
    dog === null
    || dog.address.species !== "domestic-dog"
    || !nonnegativeSafeInteger(input.completedTick)
    || dog.updatedAtTick !== input.completedTick
  ) return null;
  const assignment = inputValue.workingAnimals.assignments.find(({ workerActorId }) => (
    workerActorId === dog.identity.stableId
  ));
  if (assignment === undefined) return null;
  const investigation = settlementGuardianAlarmInvestigation(
    inputValue.workingAnimals,
    dog.perception,
    dog.identity.stableId,
    assignment.currentActivity.transactionId,
    input.completedTick,
  );
  if (investigation === null) return null;

  const triggerEventId = investigation.activity.transactionId;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "guardian-dog-warning-expression:v1",
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    sourceObservationId: investigation.belief.sourceObservationId,
  }).slice(0, 8), 16) >>> 0;
  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    position: dog.address.position,
    meaning: "guardian-dog-warning",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-heard-anonymous-alarm",
    priority: 760_000,
    salience: Math.max(
      520_000,
      Math.min(investigation.belief.confidence, investigation.belief.salience),
    ),
    variantSeed,
    durationSteps: 6,
  });
}

/**
 * Adapts one newly entered, perception-caused guardian retreat into a low
 * defensive growl. Work must have committed the exact actor-owned retreat as
 * `defer-to-actor`; a stale intent, a different belief, or a merely plausible
 * threat label cannot manufacture a call.
 */
export function guardianDogDefensiveGrowlExpressionIntent(
  inputValue: GuardianDogDefensiveGrowlExpressionInput,
): SituatedExpressionIntent | null {
  const evidence = guardianDogDefensiveGrowlEvidence(inputValue);
  if (evidence === null) return null;
  const { dog, activity, belief } = evidence;
  const triggerEventId = activity.transactionId;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "guardian-dog-defensive-growl-expression:v1",
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    beliefKey: belief.key,
    sourceObservationId: belief.sourceObservationId,
  }).slice(0, 8), 16) >>> 0;
  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    position: dog.address.position,
    meaning: "guardian-dog-defensive-growl",
    family: "animal-signal",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-perceived-threat",
    priority: 780_000,
    salience: Math.max(520_000, Math.min(belief.confidence, belief.salience)),
    variantSeed,
    durationSteps: 8,
  });
}

/**
 * Adapts one newly entered weather-caused guardian shelter request into a
 * restrained whine. The actor intent and committed work deference must agree
 * at the exact completed tick; continuing shelter seeking or a merely
 * plausible weather label cannot manufacture another call.
 */
export function guardianDogShelterWhineExpressionIntent(
  inputValue: GuardianDogShelterWhineExpressionInput,
): SituatedExpressionIntent | null {
  const evidence = guardianDogShelterWhineEvidence(inputValue);
  if (evidence === null) return null;
  const { dog, activity, shelterIntentScore } = evidence;
  const triggerEventId = guardianDogShelterWhineTriggerEventId(
    activity.transactionId,
    shelterIntentScore,
  );
  if (triggerEventId === null) return null;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "guardian-dog-shelter-whine-expression:v1",
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    conditionReferenceId: dog.intent.cause.referenceId,
    shelterIntentScore,
  }).slice(0, 8), 16) >>> 0;
  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    position: dog.address.position,
    meaning: "guardian-dog-shelter-whine",
    family: "animal-signal",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-weather-distress",
    priority: 740_000,
    salience: 650_000,
    variantSeed,
    durationSteps: 8,
  });
}

/** Reauthenticates a pending warning event from the current dog/work roots. */
export function guardianDogWarningExpressionEventMatchesWorld(
  input: GuardianDogWarningExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveGuardianDogWarningExpression(input, expression.triggerEventId);
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates the bounded warning cooldown retained in the same interval. */
export function guardianDogWarningExpressionMemoryMatchesWorld(
  input: GuardianDogWarningExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  const canonicalState = canonicalizeSituatedExpressionState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: 0,
    active: null,
    recent: [memory],
  });
  const canonicalMemory = canonicalState?.recent[0];
  if (canonicalMemory === undefined) return false;
  const derived = deriveGuardianDogWarningExpression(input, canonicalMemory.triggerEventId);
  if (derived === null) return false;
  if (
    canonicalMemory.sourceActorId !== derived.memory.sourceActorId
    || canonicalMemory.triggerEventId !== derived.memory.triggerEventId
    || canonicalMemory.meaning !== derived.memory.meaning
    || canonicalMemory.family !== derived.memory.family
    || canonicalMemory.priority !== derived.memory.priority
  ) return false;
  const elapsedSteps = derived.memory.meaningCooldownRemainingSteps
    - canonicalMemory.meaningCooldownRemainingSteps;
  return nonnegativeSafeInteger(elapsedSteps)
    && (
      canonicalMemory.meaningCooldownRemainingSteps > 0
      || canonicalMemory.familyCooldownRemainingSteps > 0
    )
    && canonicalMemory.familyCooldownRemainingSteps === Math.max(
      0,
      derived.memory.familyCooldownRemainingSteps - elapsedSteps,
    );
}

/** Re-derives one exact guardian warning for trajectory/save authentication. */
export function guardianDogWarningExpressionEventForTrigger(
  input: GuardianDogWarningExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveGuardianDogWarningExpression(input, triggerEventId)?.event ?? null;
}

/** Reauthenticates an exact defensive-growl event from current dog/work roots. */
export function guardianDogDefensiveGrowlExpressionEventMatchesWorld(
  input: GuardianDogDefensiveGrowlExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveGuardianDogDefensiveGrowlExpression(
    input,
    expression.triggerEventId,
  );
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates a defensive-growl cooldown retained in the same interval. */
export function guardianDogDefensiveGrowlExpressionMemoryMatchesWorld(
  input: GuardianDogDefensiveGrowlExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  const canonicalState = canonicalizeSituatedExpressionState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: 0,
    active: null,
    recent: [memory],
  });
  const canonicalMemory = canonicalState?.recent[0];
  if (canonicalMemory === undefined) return false;
  const derived = deriveGuardianDogDefensiveGrowlExpression(
    input,
    canonicalMemory.triggerEventId,
  );
  if (derived === null) return false;
  if (
    canonicalMemory.sourceActorId !== derived.memory.sourceActorId
    || canonicalMemory.triggerEventId !== derived.memory.triggerEventId
    || canonicalMemory.meaning !== derived.memory.meaning
    || canonicalMemory.family !== derived.memory.family
    || canonicalMemory.priority !== derived.memory.priority
  ) return false;
  const elapsedSteps = derived.memory.meaningCooldownRemainingSteps
    - canonicalMemory.meaningCooldownRemainingSteps;
  return nonnegativeSafeInteger(elapsedSteps)
    && (
      canonicalMemory.meaningCooldownRemainingSteps > 0
      || canonicalMemory.familyCooldownRemainingSteps > 0
    )
    && canonicalMemory.familyCooldownRemainingSteps === Math.max(
      0,
      derived.memory.familyCooldownRemainingSteps - elapsedSteps,
    );
}

/** Re-derives one exact defensive growl for trajectory/save authentication. */
export function guardianDogDefensiveGrowlExpressionEventForTrigger(
  input: GuardianDogDefensiveGrowlExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveGuardianDogDefensiveGrowlExpression(input, triggerEventId)?.event ?? null;
}

/** Reauthenticates an exact shelter-whine event from current dog/work roots. */
export function guardianDogShelterWhineExpressionEventMatchesWorld(
  input: GuardianDogShelterWhineExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveGuardianDogShelterWhineExpression(
    input,
    expression.triggerEventId,
  );
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates a shelter-whine cooldown retained in the same interval. */
export function guardianDogShelterWhineExpressionMemoryMatchesWorld(
  input: GuardianDogShelterWhineExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  const canonicalState = canonicalizeSituatedExpressionState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: 0,
    active: null,
    recent: [memory],
  });
  const canonicalMemory = canonicalState?.recent[0];
  if (canonicalMemory === undefined) return false;
  const derived = deriveGuardianDogShelterWhineExpression(
    input,
    canonicalMemory.triggerEventId,
  );
  if (derived === null) return false;
  if (
    canonicalMemory.sourceActorId !== derived.memory.sourceActorId
    || canonicalMemory.triggerEventId !== derived.memory.triggerEventId
    || canonicalMemory.meaning !== derived.memory.meaning
    || canonicalMemory.family !== derived.memory.family
    || canonicalMemory.priority !== derived.memory.priority
  ) return false;
  const elapsedSteps = derived.memory.meaningCooldownRemainingSteps
    - canonicalMemory.meaningCooldownRemainingSteps;
  return nonnegativeSafeInteger(elapsedSteps)
    && (
      canonicalMemory.meaningCooldownRemainingSteps > 0
      || canonicalMemory.familyCooldownRemainingSteps > 0
    )
    && canonicalMemory.familyCooldownRemainingSteps === Math.max(
      0,
      derived.memory.familyCooldownRemainingSteps - elapsedSteps,
    );
}

/** Re-derives one exact shelter whine for trajectory/save authentication. */
export function guardianDogShelterWhineExpressionEventForTrigger(
  input: GuardianDogShelterWhineExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveGuardianDogShelterWhineExpression(input, triggerEventId)?.event ?? null;
}

function deriveGuardianDogWarningExpression(
  input: GuardianDogWarningExpressionInput,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = guardianDogWarningExpressionIntent(input);
  if (intent === null || intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function deriveGuardianDogDefensiveGrowlExpression(
  input: GuardianDogDefensiveGrowlExpressionInput,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = guardianDogDefensiveGrowlExpressionIntent(input);
  if (intent === null || intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function deriveGuardianDogShelterWhineExpression(
  input: GuardianDogShelterWhineExpressionInput,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = guardianDogShelterWhineExpressionIntent(input);
  if (intent === null || intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

interface GuardianDogDefensiveGrowlEvidence {
  readonly dog: DogActorState;
  readonly assignment: SettlementWorkingAnimalAssignment;
  readonly activity: SettlementWorkingAnimalActivityTransaction;
  readonly belief: AgedActorBelief;
}

function guardianDogDefensiveGrowlEvidence(
  inputValue: GuardianDogDefensiveGrowlExpressionInput,
): GuardianDogDefensiveGrowlEvidence | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "completedTick",
    "dog",
    "workingAnimals",
  ])) return null;
  const dog = canonicalizeDogActorState(input.dog);
  const workingAnimals = canonicalizeSettlementWorkingAnimalState(input.workingAnimals);
  if (
    dog === null
    || workingAnimals === null
    || dog.address.species !== "domestic-dog"
    || !nonnegativeSafeInteger(input.completedTick)
    || dog.updatedAtTick !== input.completedTick
    || dog.perception.tick !== input.completedTick
    || dog.intent.kind !== "retreat"
    || dog.intent.enteredAtTick !== input.completedTick
    || dog.intent.cause.kind !== "perception"
  ) return null;

  const assignments = workingAnimals.assignments.filter(({ workerActorId }) => (
    workerActorId === dog.identity.stableId
  ));
  if (assignments.length !== 1) return null;
  const assignment = assignments[0];
  if (assignment === undefined) return null;
  const activity = assignment.currentActivity;
  if (
    assignment.role !== "guardian"
    || assignment.workerSpecies !== "domestic-dog"
    || assignment.pendingActivity !== null
    || activity.activity !== "defer-to-actor"
    || activity.acceptedAtTick !== input.completedTick
    || activity.cause.kind !== "actor-disposition"
    || activity.cause.referenceId !== "actor-intent:retreat"
    || activity.perceivedArea !== null
  ) return null;

  const belief = strongestDogThreatBelief(dog.perception);
  if (
    belief === null
    || belief.key !== dog.intent.cause.referenceId
    || belief.ageTicks !== 0
  ) return null;
  return Object.freeze({ dog, assignment, activity, belief });
}

interface GuardianDogShelterWhineEvidence {
  readonly dog: DogActorState;
  readonly assignment: SettlementWorkingAnimalAssignment;
  readonly activity: SettlementWorkingAnimalActivityTransaction;
  readonly shelterIntentScore: number;
}

function guardianDogShelterWhineEvidence(
  inputValue: GuardianDogShelterWhineExpressionInput,
): GuardianDogShelterWhineEvidence | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "completedTick",
    "dog",
    "shelterIntentScore",
    "workingAnimals",
  ])) return null;
  const dog = canonicalizeDogActorState(input.dog);
  const workingAnimals = canonicalizeSettlementWorkingAnimalState(input.workingAnimals);
  if (
    dog === null
    || workingAnimals === null
    || dog.address.species !== "domestic-dog"
    || !nonnegativeSafeInteger(input.completedTick)
    || !positiveFixedPoint(input.shelterIntentScore)
    || dog.updatedAtTick !== input.completedTick
    || dog.perception.tick !== input.completedTick
    || dog.intent.kind !== "seek-shelter"
    || dog.intent.enteredAtTick !== input.completedTick
    || dog.intent.cause.kind !== "condition"
    || dog.intent.cause.referenceId !== "condition:weather-exposure"
  ) return null;

  const assignments = workingAnimals.assignments.filter(({ workerActorId }) => (
    workerActorId === dog.identity.stableId
  ));
  if (assignments.length !== 1) return null;
  const assignment = assignments[0];
  if (assignment === undefined) return null;
  const activity = assignment.currentActivity;
  if (
    assignment.role !== "guardian"
    || assignment.workerSpecies !== "domestic-dog"
    || assignment.pendingActivity !== null
    || activity.activity !== "defer-to-actor"
    || activity.acceptedAtTick !== input.completedTick
    || activity.cause.kind !== "actor-disposition"
    || activity.cause.referenceId !== "actor-intent:seek-shelter"
    || activity.perceivedArea !== null
  ) return null;
  return Object.freeze({
    dog,
    assignment,
    activity,
    shelterIntentScore: input.shelterIntentScore,
  });
}

function immutableExpressionFields(event: SituatedExpressionEvent): Readonly<Record<string, unknown>> {
  return {
    version: event.version,
    catalogVersion: event.catalogVersion,
    eventId: event.eventId,
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    position: event.position,
    meaning: event.meaning,
    family: event.family,
    tone: event.tone,
    volume: event.volume,
    knowledgeBasis: event.knowledgeBasis,
    vocalization: event.vocalization,
    priority: event.priority,
    salience: event.salience,
    variantSeed: event.variantSeed,
    realizationKey: event.realizationKey,
    durationSteps: event.durationSteps,
  };
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function positiveFixedPoint(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= 1_000_000;
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const canonical = [...expected].sort(compareText);
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
