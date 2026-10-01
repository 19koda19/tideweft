import {
  ACTOR_PERCEPTION_SCALE,
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
} from "../sim/actorPerception";
import { getCoreWildlifeProfile } from "../sim/coreWildlifeIdentity";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_WILDLIFE_EVENT_VERSION,
  canonicalizeCoreWildlifeActorState,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
  type CoreWildlifeMemory,
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
import {
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export interface CoreWildlifeWeatherDistressExpressionInput {
  /** Exact post-commit cat root carrying the rain memory and physical trace. */
  readonly actor: CoreWildlifeActorState;
  /** Exact newly entered rain-caused retreat event at the trace locus. */
  readonly event: CoreWildlifeCausalEvent;
  /** Exact current ecology root that materially owns the source actor. */
  readonly world: CoreEcologyAggregatePatchState;
}

/** A restrained weather call yields to speech, warnings, and carrying alarms. */
export const DOMESTIC_CAT_RAIN_DISTRESS_EXPRESSION_PRIORITY = 300_000 as const;

interface CoreWildlifeWeatherDistressEvidence {
  readonly actor: CoreWildlifeActorState;
  readonly belief: CoreWildlifeActorState["perception"]["beliefs"][number];
  readonly event: CoreWildlifeCausalEvent;
  readonly memory: CoreWildlifeMemory;
}

/**
 * Adapts one freshly committed domestic-cat retreat from directly perceived
 * rain. The ecology actor remains authority for the response and its trace;
 * this boundary adds only bounded semantic presentation.
 */
export function coreWildlifeWeatherDistressExpressionIntent(
  inputValue: CoreWildlifeWeatherDistressExpressionInput,
): SituatedExpressionIntent | null {
  const evidence = coreWildlifeWeatherDistressEvidence(inputValue);
  if (evidence === null) return null;
  const { actor, belief, event } = evidence;
  const triggerEventId = event.eventId;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "domestic-cat-rain-distress-expression:v1",
    sourceActorId: actor.identity.stableId,
    triggerEventId,
  }).slice(0, 8), 16) >>> 0;

  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: actor.identity.stableId,
    triggerEventId,
    position: event.position,
    meaning: "domestic-cat-rain-distress-call",
    family: "animal-signal",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-weather-distress",
    priority: DOMESTIC_CAT_RAIN_DISTRESS_EXPRESSION_PRIORITY,
    salience: Math.max(360_000, Math.min(belief.confidence, belief.salience)),
    variantSeed,
    durationSteps: 6,
  });
}

/** Re-derives one exact weather-distress event for trajectory/save authority. */
export function coreWildlifeWeatherDistressExpressionEventForTrigger(
  input: CoreWildlifeWeatherDistressExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveCoreWildlifeWeatherDistressExpression(input, triggerEventId)?.event ?? null;
}

/** Reauthenticates an immutable cat weather-distress event from ecology roots. */
export function coreWildlifeWeatherDistressExpressionEventMatchesWorld(
  input: CoreWildlifeWeatherDistressExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveCoreWildlifeWeatherDistressExpression(
    input,
    expression.triggerEventId,
  );
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates bounded cat weather-call cooldown from the same roots. */
export function coreWildlifeWeatherDistressExpressionMemoryMatchesWorld(
  input: CoreWildlifeWeatherDistressExpressionInput,
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
  const derived = deriveCoreWildlifeWeatherDistressExpression(
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

function deriveCoreWildlifeWeatherDistressExpression(
  input: CoreWildlifeWeatherDistressExpressionInput,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = coreWildlifeWeatherDistressExpressionIntent(input);
  if (intent === null || intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function coreWildlifeWeatherDistressEvidence(
  inputValue: CoreWildlifeWeatherDistressExpressionInput,
): CoreWildlifeWeatherDistressEvidence | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, ["actor", "event", "world"])) return null;
  const actor = canonicalizeCoreWildlifeActorState(input.actor);
  const world = canonicalizeCoreEcologyAggregatePatch(input.world);
  if (
    actor === null
    || world === null
    || actor.identity.species !== "domestic-cat"
    || actor.address.species !== "domestic-cat"
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

  const event = canonicalCoreWildlifeWeatherDistressEvent(input.event, actor);
  if (
    event === null
    || situatedExpressionEventIdForTrigger(actor.identity.stableId, event.eventId) === null
    || world.updatedAtTick !== event.atTick
    || actor.updatedAtTick !== event.atTick
    || actor.perception.tick !== event.atTick
    || actor.intent.kind !== "retreat"
    || actor.intent.cause.kind !== "perception"
    || actor.intent.cause.referenceId !== event.observationId
    || actor.intent.cause.referenceId !== event.causeReferenceId
    || actor.intent.focusObservationId !== event.observationId
    || actor.intent.resourceReference !== null
    || actor.intent.enteredAtTick !== event.atTick
    || event.atTick > Number.MAX_SAFE_INTEGER - 4
    || actor.intent.expiresAtTick !== event.atTick + 4
  ) return null;

  const beliefs = actor.perception.beliefs.filter(({ sourceObservationId }) => (
    sourceObservationId === event.observationId
  ));
  const belief = beliefs[0];
  if (
    beliefs.length !== 1
    || belief === undefined
    || belief.channel !== "hearing"
    || belief.perceivedClass !== "rain-exposure"
    || belief.subjectId !== null
    || belief.identification !== "anonymous"
    || belief.firstObservedTick !== event.atTick
    || belief.lastObservedTick !== event.atTick
    || belief.area.radiusUnits !== MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS
    || !sameWorldPosition(belief.area.center, event.position)
    || belief.strongInterrupt
    || !actor.perception.attentionKeys.includes(belief.key)
  ) return null;

  const causalMemories = actor.memories.filter(({ eventId }) => eventId === event.eventId);
  const rainMemoriesAtTick = actor.memories.filter((candidate) => (
    candidate.kind === "weather"
    && candidate.referenceId === "weather:rain"
    && candidate.atTick === event.atTick
  ));
  const memory = causalMemories[0];
  if (
    causalMemories.length !== 1
    || rainMemoriesAtTick.length !== 1
    || memory === undefined
    || rainMemoriesAtTick[0] !== memory
    || memory.kind !== "weather"
    || memory.referenceId !== "weather:rain"
    || memory.observationId !== event.observationId
    || memory.atTick !== event.atTick
  ) return null;

  const trace = memory.environmentalEvidence;
  const expectedStrength = Math.floor((belief.confidence + belief.salience) / 2);
  if (
    trace === undefined
    || trace.evidenceId !== `${event.eventId}:wet-tracks`
    || trace.kind !== "wet-tracks"
    || trace.createdAtTick !== event.atTick
    || trace.strength !== expectedStrength
    || trace.itemConsumption !== "none"
    || trace.disclosure !== "direct-observation-required"
    || !sameWorldPosition(trace.position, event.position)
    || !rainBeliefCanOwnCatRetreat(actor, expectedStrength)
  ) return null;

  return Object.freeze({ actor, belief, event, memory });
}

function canonicalCoreWildlifeWeatherDistressEvent(
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
    || value.kind !== "retreat"
    || value.species !== "domestic-cat"
    || value.actorId !== actor.identity.stableId
    || !nonnegativeSafeInteger(value.atTick)
    || !validId(value.causeReferenceId)
    || !validId(value.observationId)
    || value.causeReferenceId !== value.observationId
    || value.resourceReference !== null
    || !isWorldPosition(value.position)
  ) return null;
  const expectedEventId = `${actor.identity.stableId}:e:${value.atTick.toString(36)}:retreat`;
  if (value.eventId !== expectedEventId) return null;
  const expected = Object.freeze({
    version: CORE_WILDLIFE_EVENT_VERSION,
    eventId: expectedEventId,
    atTick: value.atTick,
    actorId: actor.identity.stableId,
    species: "domestic-cat" as const,
    kind: "retreat" as const,
    causeReferenceId: actor.intent.cause.referenceId,
    observationId: actor.intent.focusObservationId,
    resourceReference: null,
    position: createWorldPosition(
      value.position.region,
      value.position.localX,
      value.position.localY,
    ),
  });
  return stableStringify(value) === stableStringify(expected) ? expected : null;
}

function rainBeliefCanOwnCatRetreat(
  actor: CoreWildlifeActorState,
  beliefStrength: number,
): boolean {
  const profile = getCoreWildlifeProfile("domestic-cat");
  const pressure = Math.max(0, Math.min(
    ACTOR_PERCEPTION_SCALE,
    beliefStrength
      + Math.floor(actor.identity.traits.vigilance / 5)
      - Math.floor(actor.identity.traits.boldness / 4),
  ));
  return pressure >= profile.behavior.retreatThreshold;
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

function sameWorldPosition(left: WorldPosition, right: WorldPosition): boolean {
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
