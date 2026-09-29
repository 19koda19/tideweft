import { hashCanonical, stableStringify } from "../sim/util";
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
  settlementGuardianAlarmInvestigation,
  type SettlementWorkingAnimalState,
} from "./settlementWorkingAnimals";

export interface GuardianDogWarningExpressionInput {
  readonly dog: DogActorState;
  readonly workingAnimals: SettlementWorkingAnimalState;
  readonly completedTick: number;
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
