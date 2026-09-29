import { hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_WILDLIFE_EVENT_VERSION,
  canonicalizeCoreWildlifeActorState,
  coreWildlifeAlarmEventLocus,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
} from "./coreWildlifeActor";
import {
  SITUATED_EXPRESSION_VERSION,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  situatedExpressionEventIdForTrigger,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionMemory,
} from "./situatedExpression";
import { createWorldPosition, isWorldPosition } from "./worldPosition";

export interface FishCrowAlarmExpressionInput {
  /** Exact post-commit actor root carrying the retained alarm-event locus. */
  readonly actor: CoreWildlifeActorState;
  /**
   * Post-locomotion alarm authority projected from that root. Its position is
   * the retained event locus, not necessarily the actor's later body address.
   */
  readonly event: CoreWildlifeCausalEvent;
  /** Exact post-commit ecology root that owns the source actor and memory. */
  readonly world: CoreEcologyAggregatePatchState;
}

interface FishCrowAlarmEvidence {
  readonly actor: CoreWildlifeActorState;
  readonly event: CoreWildlifeCausalEvent;
  readonly confidence: number;
  readonly salience: number;
}

/**
 * Adapts one freshly committed fish-crow alarm authority into semantic intent.
 *
 * The ecology owner must agree on the exact actor, tick, retained event locus,
 * event, and direct aerial-predator perception. The predator identity and
 * causal observation remain inside ecology authority: neither enters the
 * expression intent, its deterministic variant seed, nor its realization.
 */
export function fishCrowAlarmExpressionIntent(
  inputValue: FishCrowAlarmExpressionInput,
): SituatedExpressionIntent | null {
  const evidence = fishCrowAlarmEvidence(inputValue);
  if (evidence === null) return null;
  const { actor, event } = evidence;
  const triggerEventId = event.eventId;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "fish-crow-alarm-expression:v1",
    sourceActorId: actor.identity.stableId,
    triggerEventId,
  }).slice(0, 8), 16) >>> 0;

  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: actor.identity.stableId,
    triggerEventId,
    position: event.position,
    meaning: "fish-crow-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: Math.max(520_000, Math.min(evidence.confidence, evidence.salience)),
    variantSeed,
    durationSteps: 6,
  });
}

/** Reauthenticates one retained crow alarm event from its exact ecology roots. */
export function fishCrowAlarmExpressionEventMatchesWorld(
  input: FishCrowAlarmExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveFishCrowAlarmExpression(input, expression.triggerEventId);
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates bounded crow-alarm cooldown memory from the same roots. */
export function fishCrowAlarmExpressionMemoryMatchesWorld(
  input: FishCrowAlarmExpressionInput,
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
  const derived = deriveFishCrowAlarmExpression(
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

/** Re-derives one exact fish-crow alarm for trajectory/save authentication. */
export function fishCrowAlarmExpressionEventForTrigger(
  input: FishCrowAlarmExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveFishCrowAlarmExpression(input, triggerEventId)?.event ?? null;
}

function deriveFishCrowAlarmExpression(
  input: FishCrowAlarmExpressionInput,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = fishCrowAlarmExpressionIntent(input);
  if (intent === null || intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function fishCrowAlarmEvidence(
  inputValue: FishCrowAlarmExpressionInput,
): FishCrowAlarmEvidence | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, ["actor", "event", "world"])) return null;
  const actor = canonicalizeCoreWildlifeActorState(input.actor);
  const world = canonicalizeCoreEcologyAggregatePatch(input.world);
  if (
    actor === null
    || world === null
    || actor.identity.species !== "fish-crow"
    || actor.address.species !== "fish-crow"
  ) return null;

  const ownedMembers = world.populations.flatMap(({ members }) => members).filter(
    ({ actor: candidate }) => candidate.identity.stableId === actor.identity.stableId,
  );
  const owned = ownedMembers[0];
  if (
    ownedMembers.length !== 1
    || owned === undefined
    || owned.materialization !== "materialized"
    || stableStringify(owned.actor) !== stableStringify(actor)
  ) return null;

  const event = canonicalFishCrowAlarmEvent(input.event, actor);
  if (
    event === null
    || situatedExpressionEventIdForTrigger(actor.identity.stableId, event.eventId) === null
    || world.updatedAtTick !== event.atTick
    || actor.updatedAtTick !== event.atTick
    || actor.perception.tick !== event.atTick
    || actor.intent.kind !== "alarm"
    || actor.intent.cause.kind !== "perception"
    || actor.intent.cause.referenceId !== event.causeReferenceId
    || actor.intent.focusObservationId !== event.observationId
    || actor.intent.resourceReference !== null
    || actor.intent.enteredAtTick !== event.atTick
  ) return null;

  const beliefs = actor.perception.beliefs.filter(({ sourceObservationId }) => (
    sourceObservationId === event.observationId
  ));
  const belief = beliefs[0];
  if (
    beliefs.length !== 1
    || belief === undefined
    || belief.lastObservedTick !== event.atTick
    || belief.channel !== "vision"
    || belief.perceivedClass !== "aerial-predator"
    || belief.identification !== "identified"
    || belief.subjectId === null
    || belief.area.radiusUnits !== 0
    || !actor.perception.attentionKeys.includes(belief.key)
  ) return null;

  const committedMemories = actor.memories.filter(({ eventId }) => eventId === event.eventId);
  const memory = committedMemories[0];
  if (
    committedMemories.length !== 1
    || memory === undefined
    || memory.kind !== "alarm"
    || memory.referenceId !== belief.subjectId
    || memory.observationId !== event.observationId
    || memory.atTick !== event.atTick
    || memory.eventPosition === undefined
    || !sameWorldPosition(memory.eventPosition, event.position)
  ) return null;

  return Object.freeze({
    actor,
    event,
    confidence: belief.confidence,
    salience: belief.salience,
  });
}

function canonicalFishCrowAlarmEvent(
  value: unknown,
  actor: CoreWildlifeActorState,
): CoreWildlifeCausalEvent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "actorId",
    "atTick",
    "causeReferenceId",
    "eventId",
    "kind",
    "observationId",
    "position",
    "resourceReference",
    "species",
    "version",
  ])) return null;
  if (
    value.version !== CORE_WILDLIFE_EVENT_VERSION
    || value.kind !== "alarm"
    || value.species !== "fish-crow"
    || value.actorId !== actor.identity.stableId
    || !nonnegativeSafeInteger(value.atTick)
    || !validId(value.eventId)
    || !validId(value.causeReferenceId)
    || !validId(value.observationId)
    || value.resourceReference !== null
    || !isWorldPosition(value.position)
  ) return null;
  const expectedEventId = `${actor.identity.stableId}:e:${value.atTick.toString(36)}:alarm`;
  const retainedLocus = coreWildlifeAlarmEventLocus(actor, expectedEventId);
  if (retainedLocus === null) return null;
  const expected = Object.freeze({
    version: CORE_WILDLIFE_EVENT_VERSION,
    eventId: expectedEventId,
    atTick: value.atTick,
    actorId: actor.identity.stableId,
    species: "fish-crow" as const,
    kind: "alarm" as const,
    causeReferenceId: actor.intent.cause.referenceId,
    observationId: actor.intent.focusObservationId,
    resourceReference: null,
    position: createWorldPosition(
      retainedLocus.region,
      retainedLocus.localX,
      retainedLocus.localY,
    ),
  });
  return stableStringify(value) === stableStringify(expected) ? expected : null;
}

function immutableExpressionFields(
  event: SituatedExpressionEvent,
): Readonly<Record<string, unknown>> {
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

function sameWorldPosition(
  left: CoreWildlifeCausalEvent["position"],
  right: CoreWildlifeActorState["address"]["position"],
): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 192
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
