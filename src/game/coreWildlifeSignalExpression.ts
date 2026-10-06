import { hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  coreEcologyAlarmSignalProfile,
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
/** The canonical marsh habitat uses the `marsh-rabbit` species key. */
export type MarshRabbitAlarmExpressionInput = CoreWildlifeAlarmExpressionInput;

export const CORE_WILDLIFE_EXPRESSIVE_ALARM_SPECIES = Object.freeze([
  "deer",
  "gull",
  "marsh-rabbit",
  "fish-crow",
  "elk",
  "wild-boar",
  "domestic-chicken",
  "american-black-duck",
  "domestic-goat",
] as const);
export type ExpressiveAlarmSpecies =
  (typeof CORE_WILDLIFE_EXPRESSIVE_ALARM_SPECIES)[number];

/** Closed current alarm repertoire; adding an alarm-source species must be explicit. */
export function isExpressiveAlarmSpecies(
  species: CoreWildlifeActorState["identity"]["species"],
): species is ExpressiveAlarmSpecies {
  return CORE_WILDLIFE_EXPRESSIVE_ALARM_SPECIES.includes(
    species as ExpressiveAlarmSpecies,
  );
}

/** Shared semantic lookup; consumers never infer species from prose or IDs. */
export function coreWildlifeAlarmSpeciesForMeaning(
  meaning: SituatedExpressionIntent["meaning"],
): ExpressiveAlarmSpecies | null {
  for (const species of CORE_WILDLIFE_EXPRESSIVE_ALARM_SPECIES) {
    if (ALARM_EXPRESSION_PROFILE_BY_SPECIES[species].meaning === meaning) return species;
  }
  return null;
}

/** Shared inverse lookup; persistence/runtime gates never duplicate the table. */
export function coreWildlifeAlarmMeaningForSpecies(
  species: ExpressiveAlarmSpecies,
): CoreWildlifeAlarmExpressionProfile["meaning"] {
  return ALARM_EXPRESSION_PROFILE_BY_SPECIES[species].meaning;
}

/**
 * A local small-prey signal is meaningful ecological communication, but its
 * restrained listener-facing text must yield to ordinary nearby speech. Ecology keeps
 * the alarm's own salience; this value governs only Living Voice arbitration.
 */
export const MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY = 160_000 as const;
export const RESTRAINED_WILDLIFE_ALARM_EXPRESSION_PRIORITY =
  MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY;
export const CARRYING_WILDLIFE_ALARM_EXPRESSION_PRIORITY = 760_000 as const;

export function coreWildlifeAlarmExpressionPriority(
  species: ExpressiveAlarmSpecies,
): number {
  return coreEcologyAlarmSignalProfile(species).interrupt === "none"
    ? RESTRAINED_WILDLIFE_ALARM_EXPRESSION_PRIORITY
    : CARRYING_WILDLIFE_ALARM_EXPRESSION_PRIORITY;
}

interface CoreWildlifeAlarmExpressionProfile {
  readonly species: ExpressiveAlarmSpecies;
  readonly meaning: SituatedExpressionIntent["meaning"];
  readonly variantDomain: string;
}

interface AuthenticatedCoreWildlifeAlarmEvidence {
  readonly actor: CoreWildlifeActorState;
  readonly belief: CoreWildlifeActorState["perception"]["beliefs"][number];
  readonly event: CoreWildlifeCausalEvent;
  readonly confidence: number;
  readonly salience: number;
}

interface CoreWildlifeAlarmExpressionEvidence
  extends AuthenticatedCoreWildlifeAlarmEvidence {
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
  "marsh-rabbit": Object.freeze({
    species: "marsh-rabbit",
    meaning: "marsh-rabbit-alarm-thump",
    variantDomain: "marsh-rabbit-alarm-expression:v1",
  }),
  gull: Object.freeze({
    species: "gull",
    meaning: "gull-alarm-call",
    variantDomain: "gull-alarm-expression:v1",
  }),
  elk: Object.freeze({
    species: "elk",
    meaning: "elk-alarm-call",
    variantDomain: "elk-alarm-expression:v1",
  }),
  "wild-boar": Object.freeze({
    species: "wild-boar",
    meaning: "wild-boar-alarm-call",
    variantDomain: "wild-boar-alarm-expression:v1",
  }),
  "domestic-chicken": Object.freeze({
    species: "domestic-chicken",
    meaning: "domestic-chicken-alarm-call",
    variantDomain: "domestic-chicken-alarm-expression:v1",
  }),
  "american-black-duck": Object.freeze({
    species: "american-black-duck",
    meaning: "american-black-duck-alarm-call",
    variantDomain: "american-black-duck-alarm-expression:v1",
  }),
  "domestic-goat": Object.freeze({
    species: "domestic-goat",
    meaning: "domestic-goat-alarm-call",
    variantDomain: "domestic-goat-alarm-expression:v1",
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

/** Adapts one freshly committed canonical marsh-rabbit alarm into a foot-thump. */
export function marshRabbitAlarmExpressionIntent(
  inputValue: MarshRabbitAlarmExpressionInput,
): SituatedExpressionIntent | null {
  return alarmExpressionIntent(inputValue, "marsh-rabbit", false);
}

function alarmExpressionIntent(
  inputValue: CoreWildlifeAlarmExpressionInput,
  expectedSpecies: ExpressiveAlarmSpecies | null,
  requireLegacyFishCrowEvidence: boolean,
  representation: "fresh" | "retained" = "fresh",
): SituatedExpressionIntent | null {
  const evidence = coreWildlifeAlarmEvidence(inputValue, expectedSpecies, representation);
  if (evidence === null) return null;
  if (requireLegacyFishCrowEvidence && !isLegacyFishCrowAlarmEvidence(evidence)) return null;
  const { actor, event, profile } = evidence;
  const triggerEventId = event.eventId;
  const signal = coreEcologyAlarmSignalProfile(profile.species);
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
    // Core ecology owns whether an alarm is a full carrying call or a soft
    // small-prey contact signal. The semantic adapter must not promote a
    // rabbit foot-thump into a shout merely because both mean danger.
    volume: signal.interrupt === "strong" ? "shout" : "murmur",
    knowledgeBasis: "self-perceived-threat",
    priority: coreWildlifeAlarmExpressionPriority(profile.species),
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

/** Reauthenticates one retained marsh-rabbit alarm from its exact ecology roots. */
export function marshRabbitAlarmExpressionEventMatchesWorld(
  input: MarshRabbitAlarmExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  return alarmExpressionEventMatchesWorld(input, expression, "marsh-rabbit", false);
}

/** Reauthenticates a supported retained wildlife alarm from exact ecology roots. */
export function coreWildlifeAlarmExpressionEventMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  return alarmExpressionEventMatchesWorld(input, expression, null, false);
}

/** Retained custody is not a fresh producer; legacy semantic fences remain explicit. */
export function retainedCoreWildlifeAlarmExpressionEventMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  expression: SituatedExpressionEvent,
  semantics: "current" | "legacy-fish-crow",
): boolean {
  if (semantics !== "current" && semantics !== "legacy-fish-crow") return false;
  return alarmExpressionEventMatchesWorld(input, expression,
    semantics === "legacy-fish-crow" ? "fish-crow" : null,
    semantics === "legacy-fish-crow", "retained");
}

function alarmExpressionEventMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  expression: SituatedExpressionEvent,
  expectedSpecies: ExpressiveAlarmSpecies | null,
  requireLegacyFishCrowEvidence: boolean,
  representation: "fresh" | "retained" = "fresh",
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveCoreWildlifeAlarmExpression(
    input,
    expression.triggerEventId,
    expectedSpecies,
    requireLegacyFishCrowEvidence,
    representation,
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

/** Reauthenticates bounded marsh-rabbit alarm cooldown memory from exact roots. */
export function marshRabbitAlarmExpressionMemoryMatchesWorld(
  input: MarshRabbitAlarmExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  return alarmExpressionMemoryMatchesWorld(input, memory, "marsh-rabbit", false);
}

/** Reauthenticates bounded supported-alarm cooldown memory from exact roots. */
export function coreWildlifeAlarmExpressionMemoryMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  return alarmExpressionMemoryMatchesWorld(input, memory, null, false);
}

/** Authenticate the reachable cooldown of an exact same-T stored alarm. */
export function retainedCoreWildlifeAlarmExpressionMemoryMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  memory: SituatedExpressionMemory,
  semantics: "current" | "legacy-fish-crow",
): boolean {
  if (semantics !== "current" && semantics !== "legacy-fish-crow") return false;
  return alarmExpressionMemoryMatchesWorld(input, memory,
    semantics === "legacy-fish-crow" ? "fish-crow" : null,
    semantics === "legacy-fish-crow", "retained");
}

function alarmExpressionMemoryMatchesWorld(
  input: CoreWildlifeAlarmExpressionInput,
  memory: SituatedExpressionMemory,
  expectedSpecies: ExpressiveAlarmSpecies | null,
  requireLegacyFishCrowEvidence: boolean,
  representation: "fresh" | "retained" = "fresh",
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
    representation,
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

/** Re-derives one exact marsh-rabbit alarm for trajectory/save authentication. */
export function marshRabbitAlarmExpressionEventForTrigger(
  input: MarshRabbitAlarmExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveCoreWildlifeAlarmExpression(
    input,
    triggerEventId,
    "marsh-rabbit",
    false,
  )?.event ?? null;
}

/** Re-derives one supported alarm for trajectory/save authentication. */
export function coreWildlifeAlarmExpressionEventForTrigger(
  input: CoreWildlifeAlarmExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveCoreWildlifeAlarmExpression(input, triggerEventId, null, false)?.event ?? null;
}

/**
 * Recover only an already committed same-T alarm from normalized storage.
 * Exact event-owned locus, trigger-eligible belief, intent and memory remain
 * mandatory; current coarse representation does not create another alarm.
 */
export function retainedCoreWildlifeAlarmExpressionEventForTrigger(
  input: CoreWildlifeAlarmExpressionInput,
  triggerEventId: string,
  semantics: "current" | "legacy-fish-crow",
): SituatedExpressionEvent | null {
  if (semantics !== "current" && semantics !== "legacy-fish-crow") return null;
  return deriveCoreWildlifeAlarmExpression(input, triggerEventId,
    semantics === "legacy-fish-crow" ? "fish-crow" : null,
    semantics === "legacy-fish-crow", "retained")?.event ?? null;
}

function deriveCoreWildlifeAlarmExpression(
  input: CoreWildlifeAlarmExpressionInput,
  triggerEventId: string,
  expectedSpecies: ExpressiveAlarmSpecies | null,
  requireLegacyFishCrowEvidence: boolean,
  representation: "fresh" | "retained" = "fresh",
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = alarmExpressionIntent(
    input,
    expectedSpecies,
    requireLegacyFishCrowEvidence,
    representation,
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
  representation: "fresh" | "retained",
): CoreWildlifeAlarmExpressionEvidence | null {
  const evidence = authenticatedCoreWildlifeAlarmEvidence(inputValue, representation);
  if (evidence === null) return null;
  const profile = expressiveAlarmProfile(evidence.actor.identity.species);
  if (
    profile === null
    || (expectedSpecies !== null && profile.species !== expectedSpecies)
  ) return null;
  return Object.freeze({ ...evidence, profile });
}

function authenticatedCoreWildlifeAlarmEvidence(
  inputValue: CoreWildlifeAlarmExpressionInput,
  representation: "fresh" | "retained",
): AuthenticatedCoreWildlifeAlarmEvidence | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, ["actor", "event", "world"])) return null;
  const actor = canonicalizeCoreWildlifeActorState(input.actor);
  const world = canonicalizeCoreEcologyAggregatePatch(input.world);
  if (actor === null || world === null) return null;
  if (actor.address.species !== actor.identity.species) return null;

  const ownedMembers = world.populations.flatMap(({ members }) => members).filter(
    ({ actor: candidate }) => candidate.identity.stableId === actor.identity.stableId,
  );
  const owned = ownedMembers[0];
  if (
    ownedMembers.length !== 1
    || owned === undefined
    || (representation === "fresh" && owned.materialization !== "materialized")
    || stableStringify(owned.actor) !== stableStringify(actor)
  ) return null;

  const event = canonicalCoreWildlifeAlarmEvent(
    input.event,
    actor,
    actor.identity.species,
  );
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
  });
}

/** Exact semantic fence retained for the supported v38 fish-crow record kind. */
function isLegacyFishCrowAlarmEvidence(
  evidence: CoreWildlifeAlarmExpressionEvidence,
): boolean {
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
  species: CoreWildlifeActorState["identity"]["species"],
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
    || value.species !== species
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
    species,
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
  return isExpressiveAlarmSpecies(species)
    ? ALARM_EXPRESSION_PROFILE_BY_SPECIES[species]
    : null;
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
