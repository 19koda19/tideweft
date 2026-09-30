import type {
  ResidentLocation,
  ResidentState,
  SimEvent,
  WorldView,
} from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { livingSpeciesActorIdMatchesNamespace } from "./livingSpeciesRegistry";
import { resolveResidentWorldPlacementAtEventLocation } from "./residentSpatial";
import {
  SITUATED_EXPRESSION_VERSION,
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionMemory,
} from "./situatedExpression";

export const RESIDENT_INTRODUCTION_EXPRESSION_PRIORITY = 650_000 as const;
export const RESIDENT_INTRODUCTION_EXPRESSION_SALIENCE = 780_000 as const;
/** Preserve the former 5.6-second readable lifetime at the 100 ms fixed step. */
export const RESIDENT_INTRODUCTION_EXPRESSION_DURATION_STEPS = 56 as const;

const INTRODUCTION_DATA_KEYS = Object.freeze([
  "commandId",
  "eventLocationKind",
  "eventRouteId",
  "eventRouteProgress",
  "eventSettlementId",
  "eventSettlementOrdinal",
  "homeSettlementId",
  "knowledgeLevel",
] as const);
const INTRODUCTION_TRIGGER_PATTERN =
  /^sim-event:resident-introduced:(0|[1-9]\d*):([1-9]\d*)$/u;

export interface ResidentIntroductionExpressionInput {
  /** Current authoritative economy projection, never a render projection. */
  readonly world: WorldView;
  /** Exact committed introduction event; it must also exist in `world.events`. */
  readonly event: SimEvent;
}

export interface ResidentIntroductionExpressionProjection {
  /** Contextual player-facing line derived from current authenticated facts. */
  readonly text: string;
}

interface ResidentIntroductionExpressionAuthority {
  readonly world: WorldView;
  readonly event: SimEvent;
  readonly resident: ResidentState;
  readonly position: SituatedExpressionIntent["position"];
  readonly homeName: string;
}

/**
 * Maps one committed resident introduction into semantic speech intent.
 *
 * The simulation event carries no prose, and this adapter does not copy the
 * resident's name, work, or home into the durable expression. Those facts
 * remain owned by the current authenticated world and are resolved only at
 * the contextual projection boundary below.
 */
export function residentIntroductionExpressionIntent(
  inputValue: ResidentIntroductionExpressionInput,
): SituatedExpressionIntent | null {
  const authority = expressionAuthority(inputValue);
  if (authority === null) return null;
  const { event, resident, position } = authority;
  const triggerEventId = residentIntroductionTriggerEventId(event);
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "resident-introduction-expression:v1",
    sourceActorId: resident.identity.stableId,
    triggerEventId,
    atTick: event.tick,
    commandId: event.data.commandId,
  }).slice(0, 8), 16) >>> 0;

  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: resident.identity.stableId,
    triggerEventId,
    position,
    meaning: "resident-introduction",
    family: "social",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-committed-introduction",
    priority: RESIDENT_INTRODUCTION_EXPRESSION_PRIORITY,
    salience: RESIDENT_INTRODUCTION_EXPRESSION_SALIENCE,
    variantSeed,
    durationSteps: RESIDENT_INTRODUCTION_EXPRESSION_DURATION_STEPS,
  });
}

/** Reauthenticates one evolved expression against its exact introduction. */
export function residentIntroductionExpressionEventMatchesWorld(
  world: WorldView,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveResidentIntroductionExpression(world, expression.triggerEventId);
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates bounded cooldown memory from the same committed event. */
export function residentIntroductionExpressionMemoryMatchesWorld(
  world: WorldView,
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
  const derived = deriveResidentIntroductionExpression(
    world,
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

/** Re-derives one exact committed introduction for persistence validation. */
export function residentIntroductionExpressionEventForTrigger(
  world: WorldView,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveResidentIntroductionExpression(world, triggerEventId)?.event ?? null;
}

/**
 * Rebuilds only the unexpired visual remainder of an authenticated
 * introduction memory. The event is marked audio-acknowledged so restoring a
 * current perception carry can never replay speech or make actors hear it a
 * second time.
 */
export function resumeResidentIntroductionPresentationEvent(
  world: WorldView,
  memory: SituatedExpressionMemory,
): SituatedExpressionEvent | null {
  if (!residentIntroductionExpressionMemoryMatchesWorld(world, memory)) return null;
  const derived = deriveResidentIntroductionExpression(world, memory.triggerEventId);
  if (derived === null) return null;
  const elapsedSteps = derived.memory.meaningCooldownRemainingSteps
    - memory.meaningCooldownRemainingSteps;
  if (!nonnegativeSafeInteger(elapsedSteps)) return null;
  const advanced = advanceSituatedExpression(derived.state, elapsedSteps);
  if (advanced?.active === null || advanced === null) return null;
  const acknowledged = acknowledgeSituatedExpression(advanced);
  return acknowledged.state?.active ?? null;
}

/**
 * Resolves the existing personalized introduction only after the semantic
 * event has been reauthenticated. Other actors hear the ordinary anonymous
 * sound observation; this player-facing projection is not an acoustic fact.
 */
export function projectResidentIntroductionExpression(
  world: WorldView,
  expression: SituatedExpressionEvent,
): ResidentIntroductionExpressionProjection | null {
  if (!residentIntroductionExpressionEventMatchesWorld(world, expression)) return null;
  const trigger = parseResidentIntroductionTriggerEventId(expression.triggerEventId);
  if (trigger === null) return null;
  const event = uniqueEventBySequence(world.events, trigger.sequence);
  if (event === null) return null;
  const authority = expressionAuthority({ world, event });
  if (authority === null) return null;
  return Object.freeze({
    text: `${authority.resident.name}. ${titleCaseWord(authority.resident.role)}, out of ${authority.homeName}.`,
  });
}

/** Stable trigger identity shared by runtime admission and save authentication. */
export function residentIntroductionTriggerEventId(event: SimEvent): string {
  return `sim-event:resident-introduced:${event.sequence}:${event.subjectId}`;
}

function deriveResidentIntroductionExpression(
  world: WorldView,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
  state: NonNullable<ReturnType<typeof reduceSituatedExpression>["state"]>;
}> | null {
  if (!plainRecord(world) || !Array.isArray(world.events)) return null;
  const trigger = parseResidentIntroductionTriggerEventId(triggerEventId);
  if (trigger === null) return null;
  const committedEvent = uniqueEventBySequence(world.events, trigger.sequence);
  if (
    committedEvent === null
    || committedEvent.subjectId !== trigger.residentId
    || residentIntroductionTriggerEventId(committedEvent) !== triggerEventId
  ) return null;
  const intent = residentIntroductionExpressionIntent({ world, event: committedEvent });
  if (intent === null) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (
    !reduction.accepted
    || reduction.state === null
    || reduction.event === null
    || memory === undefined
  ) return null;
  return Object.freeze({ event: reduction.event, memory, state: reduction.state });
}

function expressionAuthority(
  inputValue: ResidentIntroductionExpressionInput,
): ResidentIntroductionExpressionAuthority | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, ["event", "world"])) return null;
  const world = input.world as WorldView;
  if (
    !plainRecord(world)
    || !nonnegativeSafeInteger(world.completedTick)
    || !Array.isArray(world.events)
    || !Array.isArray(world.residents)
    || !Array.isArray(world.settlements)
  ) return null;
  const requestedEvent = canonicalIntroductionEvent(input.event);
  if (requestedEvent === null || requestedEvent.tick > world.completedTick) return null;
  const committedEvent = uniqueEventBySequence(world.events, requestedEvent.sequence);
  if (committedEvent === null || !sameEvent(committedEvent, requestedEvent)) return null;
  const residentId = committedEvent.subjectId;
  if (!positiveSafeInteger(residentId)) return null;
  const residents = world.residents.filter(({ id }) => id === residentId);
  const resident = residents[0];
  if (
    residents.length !== 1
    || resident === undefined
    || resident.identity.species !== "human"
    || !livingSpeciesActorIdMatchesNamespace(resident.identity.stableId, "human")
    || resident.perception.actorId !== resident.identity.stableId
    || resident.homeSettlementId !== committedEvent.data.homeSettlementId
    || resident.playerKnowledge.level !== "acquainted"
    || resident.playerKnowledge.introducedTick !== committedEvent.tick
    || resident.playerKnowledge.firstObservedTick === null
    || !nonnegativeSafeInteger(resident.playerKnowledge.firstObservedTick)
    || resident.playerKnowledge.firstObservedTick > committedEvent.tick
    || !exactIntroductionFacts(resident.playerKnowledge.facts)
    || !exactMetPlayerMemory(resident, committedEvent.tick)
  ) return null;
  const homes = world.settlements.filter(({ id }) => id === resident.homeSettlementId);
  const home = homes[0];
  if (
    homes.length !== 1
    || home === undefined
    || !nonemptyText(home.name)
    || home.residentIds.filter((id: number) => id === resident.id).length !== 1
  ) return null;
  const eventLocation = residentIntroductionEventLocation(committedEvent);
  const eventPlacement = eventLocation === null
    ? null
    : resolveResidentWorldPlacementAtEventLocation(
        world,
        resident,
        eventLocation.location,
        eventLocation.settlementOrdinal,
      );
  if (eventPlacement === null) return null;
  return Object.freeze({
    world,
    event: committedEvent,
    resident,
    position: eventPlacement.position,
    homeName: home.name,
  });
}

function canonicalIntroductionEvent(value: unknown): SimEvent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "data",
    "sequence",
    "subjectId",
    "tick",
    "type",
  ])) return null;
  if (
    value.type !== "resident-introduced"
    || !nonnegativeSafeInteger(value.tick)
    || !nonnegativeSafeInteger(value.sequence)
    || !positiveSafeInteger(value.subjectId)
    || !plainRecord(value.data)
    || !exactKeys(value.data, INTRODUCTION_DATA_KEYS)
    || !validCommandId(value.data.commandId)
    || value.data.knowledgeLevel !== "acquainted"
    || !positiveSafeInteger(value.data.homeSettlementId)
    || residentIntroductionEventLocation(value as unknown as SimEvent) === null
  ) return null;
  return value as unknown as SimEvent;
}

/** Exact event-time source locus, independent of the resident's later travel. */
function residentIntroductionEventLocation(event: SimEvent): Readonly<{
  location: ResidentLocation;
  settlementOrdinal: number | null;
}> | null {
  const kind = event.data.eventLocationKind;
  const settlementId = event.data.eventSettlementId;
  const settlementOrdinal = event.data.eventSettlementOrdinal;
  const routeId = event.data.eventRouteId;
  const routeProgress = event.data.eventRouteProgress;
  if (
    kind === "settlement"
    && positiveSafeInteger(settlementId)
    && nonnegativeSafeInteger(settlementOrdinal)
    && routeId === null
    && routeProgress === null
  ) {
    return Object.freeze({
      location: Object.freeze({ kind, settlementId }),
      settlementOrdinal,
    });
  }
  if (
    kind === "route"
    && settlementId === null
    && settlementOrdinal === null
    && positiveSafeInteger(routeId)
    && nonnegativeSafeInteger(routeProgress)
    && routeProgress <= 1_000_000
  ) {
    return Object.freeze({
      location: Object.freeze({ kind, routeId, progress: routeProgress }),
      settlementOrdinal: null,
    });
  }
  return null;
}

function uniqueEventBySequence(
  events: readonly SimEvent[],
  sequence: number,
): SimEvent | null {
  const matches = events.filter((candidate) => (
    plainRecord(candidate) && candidate.sequence === sequence
  ));
  if (matches.length !== 1) return null;
  return canonicalIntroductionEvent(matches[0]);
}

function parseResidentIntroductionTriggerEventId(
  value: string,
): Readonly<{ sequence: number; residentId: number }> | null {
  const match = INTRODUCTION_TRIGGER_PATTERN.exec(value);
  if (match === null) return null;
  const sequence = Number(match[1]);
  const residentId = Number(match[2]);
  return nonnegativeSafeInteger(sequence) && positiveSafeInteger(residentId)
    ? Object.freeze({ sequence, residentId })
    : null;
}

function exactIntroductionFacts(value: readonly unknown[]): boolean {
  return Array.isArray(value)
    && value.length === 3
    && value[0] === "name"
    && value[1] === "occupation"
    && value[2] === "home";
}

function exactMetPlayerMemory(resident: ResidentState, introducedTick: number): boolean {
  const matches = resident.memories.filter(({ kind }) => kind === "met-player");
  const memory = matches[0];
  return matches.length === 1
    && memory !== undefined
    && memory.id === `${resident.identity.stableId}:met-player`
    && memory.tick === introducedTick
    && memory.cause === "PLAYER_GREETING";
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

function sameEvent(left: SimEvent, right: SimEvent): boolean {
  return left.tick === right.tick
    && left.sequence === right.sequence
    && left.type === right.type
    && left.subjectId === right.subjectId
    && samePrimitiveRecord(left.data, right.data);
}

function samePrimitiveRecord(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const leftKeys = Object.keys(left).sort(compareText);
  const rightKeys = Object.keys(right).sort(compareText);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index] && left[key] === right[key]
    ));
}

function titleCaseWord(value: string): string {
  return value.length === 0
    ? value
    : `${value[0]?.toLocaleUpperCase() ?? ""}${value.slice(1)}`;
}

function validCommandId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function nonemptyText(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
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
