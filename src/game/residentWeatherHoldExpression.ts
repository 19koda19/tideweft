import {
  FIXED_POINT,
  type ContractState,
  type ResidentState,
  type SimEvent,
  type WorldView,
} from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { livingSpeciesActorIdMatchesNamespace } from "./livingSpeciesRegistry";
import { resolveResidentWorldPlacementAtEventLocation } from "./residentSpatial";
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

export const RESIDENT_WEATHER_HOLD_EXPRESSION_PRIORITY = 300_000 as const;
export const RESIDENT_WEATHER_HOLD_EXPRESSION_SALIENCE = 520_000 as const;
export const RESIDENT_WEATHER_HOLD_EXPRESSION_DURATION_STEPS = 12 as const;

const WEATHER_HOLD_DATA_KEYS = Object.freeze([
  "contractId",
  "eventRouteId",
  "eventRouteProgress",
  "intensity",
  "routeDelayTicks",
  "weather",
] as const);
const OBSERVED_WEATHER_HOLD_DATA_KEYS = Object.freeze([
  ...WEATHER_HOLD_DATA_KEYS,
  "playerObserved",
] as const);
const WEATHER_HOLD_TRIGGER_PATTERN =
  /^sim-event:resident-sheltered:(0|[1-9]\d*):([1-9]\d*)$/u;

export interface ResidentWeatherHoldExpressionInput {
  /** Current authoritative economy projection, never presentation state. */
  readonly world: WorldView;
  /** Exact committed shelter event; shelter state by itself is not a trigger. */
  readonly event: SimEvent;
}

interface ResidentWeatherHoldExpressionAuthority {
  readonly event: SimEvent;
  readonly resident: ResidentState;
  readonly contract: ContractState;
  readonly position: SituatedExpressionIntent["position"];
}

/**
 * Maps one committed transition into weather shelter to restrained human
 * speech. A resident remaining under shelter never manufactures another line:
 * the unique retained `resident-sheltered` event is the sole trigger.
 */
export function residentWeatherHoldExpressionIntent(
  inputValue: ResidentWeatherHoldExpressionInput,
): SituatedExpressionIntent | null {
  const authority = expressionAuthority(inputValue);
  if (authority === null) return null;
  const { contract, event, resident, position } = authority;
  const triggerEventId = residentWeatherHoldTriggerEventId(event);
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "resident-weather-hold-expression:v1",
    sourceActorId: resident.identity.stableId,
    triggerEventId,
    atTick: event.tick,
    contractId: contract.id,
    weather: event.data.weather,
    intensity: event.data.intensity,
    routeId: event.data.eventRouteId,
    routeProgress: event.data.eventRouteProgress,
  }).slice(0, 8), 16) >>> 0;

  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: resident.identity.stableId,
    triggerEventId,
    position,
    meaning: "resident-weather-hold",
    family: "condition",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-weather-distress",
    priority: RESIDENT_WEATHER_HOLD_EXPRESSION_PRIORITY,
    salience: RESIDENT_WEATHER_HOLD_EXPRESSION_SALIENCE,
    variantSeed,
    durationSteps: RESIDENT_WEATHER_HOLD_EXPRESSION_DURATION_STEPS,
  });
}

/** Reauthenticates one evolved expression against its exact shelter event. */
export function residentWeatherHoldExpressionEventMatchesWorld(
  world: WorldView,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveResidentWeatherHoldExpression(world, expression.triggerEventId);
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates bounded cooldown memory from the same shelter event. */
export function residentWeatherHoldExpressionMemoryMatchesWorld(
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
  const derived = deriveResidentWeatherHoldExpression(
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

/** Re-derives one exact committed weather-hold expression for validation. */
export function residentWeatherHoldExpressionEventForTrigger(
  world: WorldView,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveResidentWeatherHoldExpression(world, triggerEventId)?.event ?? null;
}

/** Stable trigger identity shared by later admission and persistence owners. */
export function residentWeatherHoldTriggerEventId(event: SimEvent): string {
  return `sim-event:resident-sheltered:${event.sequence}:${event.subjectId}`;
}

function deriveResidentWeatherHoldExpression(
  world: WorldView,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  if (!plainRecord(world) || !Array.isArray(world.events)) return null;
  const trigger = parseResidentWeatherHoldTriggerEventId(triggerEventId);
  if (trigger === null) return null;
  const committedEvent = uniqueEventBySequence(world.events, trigger.sequence);
  if (
    committedEvent === null
    || committedEvent.subjectId !== trigger.residentId
    || residentWeatherHoldTriggerEventId(committedEvent) !== triggerEventId
  ) return null;
  const intent = residentWeatherHoldExpressionIntent({ world, event: committedEvent });
  if (intent === null) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function expressionAuthority(
  inputValue: ResidentWeatherHoldExpressionInput,
): ResidentWeatherHoldExpressionAuthority | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, ["event", "world"])) return null;
  const world = input.world as WorldView;
  if (
    !plainRecord(world)
    || !nonnegativeSafeInteger(world.completedTick)
    || !Array.isArray(world.events)
    || !Array.isArray(world.contracts)
    || !Array.isArray(world.residents)
    || !Array.isArray(world.routes)
  ) return null;
  const requestedEvent = canonicalWeatherHoldEvent(input.event);
  if (requestedEvent === null || requestedEvent.tick > world.completedTick) return null;
  const committedEvent = uniqueEventBySequence(world.events, requestedEvent.sequence);
  if (committedEvent === null || !sameEvent(committedEvent, requestedEvent)) return null;

  const residentId = committedEvent.subjectId;
  const contractId = committedEvent.data.contractId;
  if (!positiveSafeInteger(residentId) || !positiveSafeInteger(contractId)) return null;
  const resident = uniqueById(world.residents, residentId);
  const contract = uniqueById(world.contracts, contractId);
  if (
    resident === null
    || contract === null
    || !residentOwnsWeatherHold(resident, contract, committedEvent)
    || !activeResidentContractMatchesEvent(contract, resident, committedEvent, world.completedTick)
    || !exactWeatherShelterMemory(resident, committedEvent)
  ) return null;

  const routeId = committedEvent.data.eventRouteId;
  const routeProgress = committedEvent.data.eventRouteProgress;
  if (!positiveSafeInteger(routeId) || !fixedPoint(routeProgress)) return null;
  const route = uniqueById(world.routes, routeId);
  if (
    route === null
    || contract.porterRouteIds.filter((id: number) => id === route.id).length !== 1
  ) return null;
  const eventPlacement = resolveResidentWorldPlacementAtEventLocation(
    world,
    resident,
    Object.freeze({ kind: "route", routeId, progress: routeProgress }),
    null,
  );
  if (eventPlacement === null) return null;
  return Object.freeze({
    event: committedEvent,
    resident,
    contract,
    position: eventPlacement.position,
  });
}

function residentOwnsWeatherHold(
  resident: ResidentState,
  contract: ContractState,
  event: SimEvent,
): boolean {
  const eventRouteDelayTicks = event.data.routeDelayTicks;
  return resident.identity.species === "human"
    && livingSpeciesActorIdMatchesNamespace(resident.identity.stableId, "human")
    && resident.perception.actorId === resident.identity.stableId
    && resident.activeContractId === contract.id
    && resident.intention === "carry"
    && resident.location.kind === "route"
    && contract.porterRouteIds.includes(resident.location.routeId)
    && fixedPoint(resident.location.progress)
    && positiveSafeInteger(eventRouteDelayTicks)
    && resident.condition.routeDelayTicks >= eventRouteDelayTicks;
}

function activeResidentContractMatchesEvent(
  contract: ContractState,
  resident: ResidentState,
  event: SimEvent,
  completedTick: number,
): boolean {
  return contract.id === event.data.contractId
    && contract.status === "in-transit"
    && contract.carrierKind === "resident"
    && contract.assignedResidentId === resident.id
    && contract.completedTick === null
    && contract.acceptedTick !== null
    && nonnegativeSafeInteger(contract.acceptedTick)
    && contract.departedTick !== null
    && nonnegativeSafeInteger(contract.departedTick)
    && contract.acceptedTick < contract.departedTick
    && contract.departedTick <= event.tick
    && contract.arrivalTick !== null
    && nonnegativeSafeInteger(contract.arrivalTick)
    && contract.arrivalTick > completedTick
    && positiveSafeInteger(contract.quantity)
    && contract.cargoQuantity === contract.quantity
    && Array.isArray(contract.porterRouteIds)
    && Array.isArray(contract.porterSettlementIds)
    && contract.porterRouteIds.length > 0
    && contract.porterSettlementIds.length === contract.porterRouteIds.length + 1
    && contract.porterSettlementIds[0] === contract.originSettlementId
    && contract.porterSettlementIds.at(-1) === contract.destinationSettlementId;
}

function exactWeatherShelterMemory(resident: ResidentState, event: SimEvent): boolean {
  const matches = resident.memories.filter((memory) => (
    memory.kind === "weather-shelter" && memory.tick === event.tick
  ));
  const memory = matches[0];
  return matches.length === 1
    && memory !== undefined
    && memory.id === `${resident.identity.stableId}:weather-shelter:${event.tick}`
    && memory.cause === "SEVERE_WEATHER";
}

function canonicalWeatherHoldEvent(value: unknown): SimEvent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "data",
    "sequence",
    "subjectId",
    "tick",
    "type",
  ])) return null;
  if (
    value.type !== "resident-sheltered"
    || !nonnegativeSafeInteger(value.tick)
    || !nonnegativeSafeInteger(value.sequence)
    || !positiveSafeInteger(value.subjectId)
    || !plainRecord(value.data)
    || (!exactKeys(value.data, WEATHER_HOLD_DATA_KEYS)
      && !exactKeys(value.data, OBSERVED_WEATHER_HOLD_DATA_KEYS))
    || !positiveSafeInteger(value.data.contractId)
    || !positiveSafeInteger(value.data.eventRouteId)
    || !fixedPoint(value.data.eventRouteProgress)
    || !fixedPoint(value.data.intensity)
    || (value.data.weather !== "rain" && value.data.weather !== "storm")
    || !positiveSafeInteger(value.data.routeDelayTicks)
    || (Object.hasOwn(value.data, "playerObserved") && value.data.playerObserved !== true)
  ) return null;
  return value as unknown as SimEvent;
}

function uniqueEventBySequence(
  events: readonly SimEvent[],
  sequence: number,
): SimEvent | null {
  const matches = events.filter((candidate) => (
    plainRecord(candidate) && candidate.sequence === sequence
  ));
  return matches.length === 1 ? canonicalWeatherHoldEvent(matches[0]) : null;
}

function parseResidentWeatherHoldTriggerEventId(
  value: string,
): Readonly<{ sequence: number; residentId: number }> | null {
  const match = WEATHER_HOLD_TRIGGER_PATTERN.exec(value);
  if (match === null) return null;
  const sequence = Number(match[1]);
  const residentId = Number(match[2]);
  return nonnegativeSafeInteger(sequence) && positiveSafeInteger(residentId)
    ? Object.freeze({ sequence, residentId })
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

function uniqueById<T extends { readonly id: number }>(
  values: readonly T[],
  id: number,
): T | null {
  const matches = values.filter((value) => plainRecord(value) && value.id === id);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function fixedPoint(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
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

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
