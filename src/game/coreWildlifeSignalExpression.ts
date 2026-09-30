import { hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_WILDLIFE_EVENT_VERSION,
  canonicalizeCoreWildlifeActorState,
  coreWildlifeAlarmEventLocus,
  coreWildlifeBeliefCanTriggerAlarm,
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

export interface CoreWildlifeAlarmExpressionInput {
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

/** Compatibility name retained for the first live core-wildlife signal. */
export type FishCrowAlarmExpressionInput = CoreWildlifeAlarmExpressionInput;
/** The canonical marsh habitat uses the `deer` species key. */
export type DeerAlarmExpressionInput = CoreWildlifeAlarmExpressionInput;

type ExpressiveAlarmSpecies = "fish-crow" | "deer";

interface CoreWildlifeAlarmExpressionProfile {
  readonly species: ExpressiveAlarmSpecies;
  readonly meaning: SituatedExpressionIntent["meaning"];
  readonly variantDomain: string;
}

interface CoreWildlifeAlarmEvidence {
  readonly actor: CoreWildlifeActorState;
  readonly belief: CoreWildlifeActorState["perception"]["beliefs"][number];
  readonly event: CoreWildlifeCausalEvent;
  readonly confidence: number;
  readonly salience: number;
  readonly profile: CoreWildlifeAlarmExpressionProfile;
}

const ALARM_EXPRESSION_PROFILE_BY_SPECIES: Readonly<
  Record<ExpressiveAlarmSpecies, CoreWildlifeAlarmExpressionProfile>
> = Object.freeze({
  "fish-crow": Object.freeze({
    species: "fish-crow",
    meaning: "fish-crow-alarm-call",
    variantDomain: "fish-crow-alarm-expression:v1",
  }),
  deer: Object.freeze({
    species: "deer",
    meaning: "deer-alarm-call",
    variantDomain: "deer-alarm-expression:v1",
  }),
});

/**
 * Adapts a supported core-wildlife alarm into a semantic animal signal.
 *
 * Species select only authored expression semantics. Ecology remains the
 * authority for why the alarm happened, its exact source, and its event locus.
 */
export function coreWildlifeAlarmExpressionIntent(
  inputValue: CoreWildlifeAlarmExpressionInput,
): SituatedExpressionIntent | null {
  return alarmExpressionIntent(inputValue, null, false);
}

/**
 * Replays the first fish-crow Living Voice contract for supported legacy saves.
 *
 * The ecology owner must agree on the exact actor, tick, retained event locus,
 * event, and its identified direct-vision aerial-predator belief. Current
 * production uses the species-aware adapter above and the shared lawful alarm
 * policy; this narrow entry keeps v38-v40 records from gaining later semantics.
 */
export function fishCrowAlarmExpressionIntent(
  inputValue: FishCrowAlarmExpressionInput,
): SituatedExpressionIntent | null {
  return alarmExpressionIntent(inputValue, "fish-crow", true);
}

/** Adapts one freshly committed canonical deer alarm into a semantic snort. */
export function deerAlarmExpressionIntent(
  inputValue: DeerAlarmExpressionInput,
): SituatedExpressionIntent | null {
  return alarmExpressionIntent(inputValue, "deer", false);
}

function alarmExpressionIntent(
  inputValue: CoreWildlifeAlarmExpressionInput,
  expectedSpecies: ExpressiveAlarmSpecies | null,
  requireLegacyFishCrowEvidence: boolean,
): SituatedExpressionIntent | null {
  const evidence = coreWildlifeAlarmEvidence(inputValue, expectedSpecies);
  if (evidence === null) return null;
  if (requireLegacyFishCrowEvidence && !isLegacyFishCrowAlarmEvidence(evidence)) return null;
  const { actor, event, profile } = evidence;
  const triggerEventId = event.eventId;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: profile.variantDomain,
    sourceActorId: actor.identity.stableId,
    triggerEventId,
  }).slice(0, 8), 16) >>> 0;

  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: actor.identity.stableId,
    triggerEventId,
    position: event.position,
    meaning: profile.meaning,
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
  return alarmExpressionEventMatchesWorld(input, expression, "fish-crow", true);
}

/** Reauthenticates one retained deer alarm event from its exact ecology roots. */
export function deerAlarmExpressionEventMatchesWorld(
  input: DeerAlarmExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  return alarmExpressionEventMatchesWorld(input, expression, "deer", false);
}

/** Reauthenticates a supported retained wildlife alarm from exact ecology roots. */
export function coreWildlifeAlarmExpressionEventMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  return alarmExpressionEventMatchesWorld(input, expression, null, false);
}

function alarmExpressionEventMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  expression: SituatedExpressionEvent,
  expectedSpecies: ExpressiveAlarmSpecies | null,
  requireLegacyFishCrowEvidence: boolean,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveCoreWildlifeAlarmExpression(
    input,
    expression.triggerEventId,
    expectedSpecies,
    requireLegacyFishCrowEvidence,
  );
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates bounded crow-alarm cooldown memory from the same roots. */
export function fishCrowAlarmExpressionMemoryMatchesWorld(
  input: FishCrowAlarmExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  return alarmExpressionMemoryMatchesWorld(input, memory, "fish-crow", true);
}

/** Reauthenticates bounded deer-alarm cooldown memory from the same roots. */
export function deerAlarmExpressionMemoryMatchesWorld(
  input: DeerAlarmExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  return alarmExpressionMemoryMatchesWorld(input, memory, "deer", false);
}

/** Reauthenticates bounded supported-alarm cooldown memory from exact roots. */
export function coreWildlifeAlarmExpressionMemoryMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  return alarmExpressionMemoryMatchesWorld(input, memory, null, false);
}

function alarmExpressionMemoryMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  memory: SituatedExpressionMemory,
  expectedSpecies: ExpressiveAlarmSpecies | null,
  requireLegacyFishCrowEvidence: boolean,
): boolean {
  const canonicalState = canonicalizeSituatedExpressionState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: 0,
    active: null,
    recent: [memory],
  });
  const canonicalMemory = canonicalState?.recent[0];
  if (canonicalMemory === undefined) return false;
  const derived = deriveCoreWildlifeAlarmExpression(
    input,
    canonicalMemory.triggerEventId,
    expectedSpecies,
    requireLegacyFishCrowEvidence,
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
  return deriveCoreWildlifeAlarmExpression(input, triggerEventId, "fish-crow", true)?.event ?? null;
}

/** Re-derives one exact deer alarm for trajectory/save authentication. */
export function deerAlarmExpressionEventForTrigger(
  input: DeerAlarmExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveCoreWildlifeAlarmExpression(input, triggerEventId, "deer", false)?.event ?? null;
}

/** Re-derives one supported alarm for trajectory/save authentication. */
export function coreWildlifeAlarmExpressionEventForTrigger(
  input: CoreWildlifeAlarmExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveCoreWildlifeAlarmExpression(input, triggerEventId, null, false)?.event ?? null;
}

function deriveCoreWildlifeAlarmExpression(
  input: CoreWildlifeAlarmExpressionInput,
  triggerEventId: string,
  expectedSpecies: ExpressiveAlarmSpecies | null,
  requireLegacyFishCrowEvidence: boolean,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = alarmExpressionIntent(
    input,
    expectedSpecies,
    requireLegacyFishCrowEvidence,
  );
  if (intent === null || intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function coreWildlifeAlarmEvidence(
  inputValue: CoreWildlifeAlarmExpressionInput,
  expectedSpecies: ExpressiveAlarmSpecies | null,
): CoreWildlifeAlarmEvidence | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, ["actor", "event", "world"])) return null;
  const actor = canonicalizeCoreWildlifeActorState(input.actor);
  const world = canonicalizeCoreEcologyAggregatePatch(input.world);
  if (actor === null || world === null) return null;
  const profile = expressiveAlarmProfile(actor.identity.species);
  if (
    profile === null
    || (expectedSpecies !== null && profile.species !== expectedSpecies)
    || actor.address.species !== profile.species
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

  const event = canonicalCoreWildlifeAlarmEvent(input.event, actor, profile);
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
    || !coreWildlifeBeliefCanTriggerAlarm(actor, belief)
    || !actor.perception.attentionKeys.includes(belief.key)
  ) return null;

  const committedMemories = actor.memories.filter(({ eventId }) => eventId === event.eventId);
  const memory = committedMemories[0];
  if (
    committedMemories.length !== 1
    || memory === undefined
    || memory.kind !== "alarm"
    || memory.referenceId !== (belief.subjectId ?? belief.sourceObservationId)
    || memory.observationId !== event.observationId
    || memory.atTick !== event.atTick
    || memory.eventPosition === undefined
    || !sameWorldPosition(memory.eventPosition, event.position)
  ) return null;

  return Object.freeze({
    actor,
    belief,
    event,
    confidence: belief.confidence,
    salience: belief.salience,
    profile,
  });
}

/** Exact semantic fence retained for the supported v38 fish-crow record kind. */
function isLegacyFishCrowAlarmEvidence(evidence: CoreWildlifeAlarmEvidence): boolean {
  const { belief, profile } = evidence;
  return profile.species === "fish-crow"
    && belief.channel === "vision"
    && belief.perceivedClass === "aerial-predator"
    && belief.identification === "identified"
    && belief.subjectId !== null
    && belief.area.radiusUnits === 0;
}

function canonicalCoreWildlifeAlarmEvent(
  value: unknown,
  actor: CoreWildlifeActorState,
  profile: CoreWildlifeAlarmExpressionProfile,
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
    || value.species !== profile.species
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
    species: profile.species,
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

function expressiveAlarmProfile(
  species: CoreWildlifeActorState["identity"]["species"],
): CoreWildlifeAlarmExpressionProfile | null {
  if (species === "fish-crow" || species === "deer") {
    return ALARM_EXPRESSION_PROFILE_BY_SPECIES[species];
  }
  return null;
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
