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
} from "./worldPosition";

export interface CoreWildlifePursuitExpressionInput {
  /** Exact post-commit marsh fox carrying the newly entered pursuit. */
  readonly actor: CoreWildlifeActorState;
  /** Exact pursuit-onset event projected at the fox's committed body address. */
  readonly event: CoreWildlifeCausalEvent;
  /** Exact current ecology root that owns both source fox and living target. */
  readonly world: CoreEcologyAggregatePatchState;
}

/** A brief pursuit yip yields to warnings and carrying alarms. */
export const MARSH_FOX_PURSUIT_YIP_EXPRESSION_PRIORITY = 340_000 as const;

interface CoreWildlifePursuitEvidence {
  readonly actor: CoreWildlifeActorState;
  readonly belief: CoreWildlifeActorState["perception"]["beliefs"][number];
  readonly event: CoreWildlifeCausalEvent;
  readonly memory: CoreWildlifeMemory;
}

/**
 * Adapts one newly entered marsh-fox pursuit into a restrained semantic yip.
 * Ecology owns the pursuit and target; this boundary discloses neither the
 * prey identity nor the fox's private observation.
 */
export function coreWildlifePursuitExpressionIntent(
  inputValue: CoreWildlifePursuitExpressionInput,
): SituatedExpressionIntent | null {
  const evidence = coreWildlifePursuitEvidence(inputValue);
  if (evidence === null) return null;
  const { actor, belief, event } = evidence;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "marsh-fox-pursuit-expression:v1",
    sourceActorId: actor.identity.stableId,
    triggerEventId: event.eventId,
  }).slice(0, 8), 16) >>> 0;

  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: actor.identity.stableId,
    triggerEventId: event.eventId,
    position: event.position,
    meaning: "marsh-fox-pursuit-yip",
    family: "animal-signal",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-perceived-prey",
    priority: MARSH_FOX_PURSUIT_YIP_EXPRESSION_PRIORITY,
    salience: Math.max(420_000, Math.min(belief.confidence, belief.salience)),
    variantSeed,
    durationSteps: 6,
  });
}

/** Re-derives one exact pursuit yip for trajectory/save authentication. */
export function coreWildlifePursuitExpressionEventForTrigger(
  input: CoreWildlifePursuitExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveCoreWildlifePursuitExpression(input, triggerEventId)?.event ?? null;
}

/** Reauthenticates an immutable pursuit-yip event from exact ecology roots. */
export function coreWildlifePursuitExpressionEventMatchesWorld(
  input: CoreWildlifePursuitExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveCoreWildlifePursuitExpression(
    input,
    expression.triggerEventId,
  );
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates bounded pursuit-yip cooldown memory from the same roots. */
export function coreWildlifePursuitExpressionMemoryMatchesWorld(
  input: CoreWildlifePursuitExpressionInput,
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
  const derived = deriveCoreWildlifePursuitExpression(
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

function deriveCoreWildlifePursuitExpression(
  input: CoreWildlifePursuitExpressionInput,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = coreWildlifePursuitExpressionIntent(input);
  if (intent === null || intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function coreWildlifePursuitEvidence(
  inputValue: CoreWildlifePursuitExpressionInput,
): CoreWildlifePursuitEvidence | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, ["actor", "event", "world"])) return null;
  const actor = canonicalizeCoreWildlifeActorState(input.actor);
  const world = canonicalizeCoreEcologyAggregatePatch(input.world);
  if (
    actor === null
    || world === null
    || actor.identity.species !== "marsh-fox"
    || actor.address.species !== "marsh-fox"
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

  const event = canonicalCoreWildlifePursuitEvent(input.event, actor);
  const resource = actor.intent.resourceReference;
  if (
    event === null
    || resource === null
    || situatedExpressionEventIdForTrigger(actor.identity.stableId, event.eventId) === null
    || world.updatedAtTick !== event.atTick
    || actor.updatedAtTick !== event.atTick
    || actor.perception.tick !== event.atTick
    || actor.intent.kind !== "pursue"
    || actor.intent.cause.kind !== "perception"
    || actor.intent.cause.referenceId !== event.observationId
    || actor.intent.cause.referenceId !== event.causeReferenceId
    || actor.intent.focusObservationId !== event.observationId
    || resource.foodClass !== "live-prey"
    || resource.sourceKind !== "living-actor"
    || resource.observationId !== event.observationId
    || resource.observedAvailableUnits !== 1
    || actor.intent.enteredAtTick !== event.atTick
  ) return null;

  const targetMembers = world.populations.flatMap(({ members }) => members).filter(
    ({ actor: candidate }) => candidate.identity.stableId === resource.resourceId,
  );
  const target = targetMembers[0];
  if (
    targetMembers.length !== 1
    || target === undefined
    || target.materialization !== "materialized"
    || target.actor.condition.health <= 0
    || target.actor.identity.stableId === actor.identity.stableId
  ) return null;

  const beliefs = actor.perception.beliefs.filter(({ sourceObservationId }) => (
    sourceObservationId === event.observationId
  ));
  const belief = beliefs[0];
  if (
    beliefs.length !== 1
    || belief === undefined
    || belief.channel !== "vision"
    || belief.perceivedClass !== "live-prey"
    || belief.identification !== "identified"
    || belief.subjectId !== resource.resourceId
    || belief.area.radiusUnits !== 0
    || belief.lastObservedTick !== event.atTick
    || !actor.perception.attentionKeys.includes(belief.key)
  ) return null;

  const committedMemories = actor.memories.filter(({ eventId }) => eventId === event.eventId);
  const memory = committedMemories[0];
  if (
    committedMemories.length !== 1
    || memory === undefined
    || memory.kind !== "pursuit"
    || memory.referenceId !== resource.resourceId
    || memory.observationId !== event.observationId
    || memory.atTick !== event.atTick
  ) return null;

  return Object.freeze({ actor, belief, event, memory });
}

function canonicalCoreWildlifePursuitEvent(
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
    || value.kind !== "pursue"
    || value.species !== "marsh-fox"
    || value.actorId !== actor.identity.stableId
    || !nonnegativeSafeInteger(value.atTick)
    || !validId(value.causeReferenceId)
    || !validId(value.observationId)
    || !isWorldPosition(value.position)
    || actor.intent.resourceReference === null
  ) return null;
  const expectedEventId = `${actor.identity.stableId}:e:${value.atTick.toString(36)}:pursue`;
  if (value.eventId !== expectedEventId) return null;
  const expected = Object.freeze({
    version: CORE_WILDLIFE_EVENT_VERSION,
    eventId: expectedEventId,
    atTick: value.atTick,
    actorId: actor.identity.stableId,
    species: "marsh-fox" as const,
    kind: "pursue" as const,
    causeReferenceId: actor.intent.cause.referenceId,
    observationId: actor.intent.focusObservationId,
    resourceReference: actor.intent.resourceReference,
    position: createWorldPosition(
      actor.address.position.region,
      actor.address.position.localX,
      actor.address.position.localY,
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

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 192
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
}
