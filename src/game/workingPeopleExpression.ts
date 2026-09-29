import {
  FIXED_POINT,
  type ContractState,
  type ResidentState,
  type SimEvent,
  type WorldView,
} from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { livingActorAddressForResident } from "./livingActor";
import { livingSpeciesActorIdMatchesNamespace } from "./livingSpeciesRegistry";
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

const DEPARTURE_DATA_KEYS = Object.freeze([
  "arrivalTick",
  "bottleneckReliability",
  "residentId",
  "routeHops",
] as const);
const OBSERVED_DEPARTURE_DATA_KEYS = Object.freeze([
  ...DEPARTURE_DATA_KEYS,
  "playerObserved",
] as const);

export interface WorkingPeopleExpressionInput {
  /** Current authoritative economy projection, never a render projection. */
  readonly world: WorldView;
  /** Exact simulation event being adapted. It must also exist in `world.events`. */
  readonly event: SimEvent;
}

const CONTRACT_DEPARTURE_TRIGGER_PATTERN =
  /^sim-event:contract-departed:(0|[1-9]\d*):([1-9]\d*)$/u;

/**
 * Maps one committed resident Promise departure into work expression intent.
 *
 * The simulation remains the sole owner of contracts, cargo conservation,
 * resident assignment, and movement. This adapter says nothing unless all of
 * those records agree that the named human has just taken physical custody of
 * a heavy Promise load at their canonical world position.
 */
export function workingPeopleExpressionIntent(
  inputValue: WorkingPeopleExpressionInput,
): SituatedExpressionIntent | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, ["event", "world"])) return null;
  const world = input.world as WorldView;
  if (
    !plainRecord(world)
    || !Array.isArray(world.events)
    || !Array.isArray(world.contracts)
    || !Array.isArray(world.residents)
    || !Array.isArray(world.routes)
  ) return null;

  const requestedEvent = canonicalDepartureEvent(input.event);
  if (requestedEvent === null) return null;
  const committedMatches = world.events.filter((candidate) =>
    plainRecord(candidate) && candidate.sequence === requestedEvent.sequence
  );
  if (committedMatches.length !== 1) return null;
  const committedEvent = canonicalDepartureEvent(committedMatches[0]);
  if (committedEvent === null || !sameEvent(committedEvent, requestedEvent)) return null;

  const contractId = committedEvent.subjectId;
  const residentId = committedEvent.data.residentId;
  if (
    !positiveSafeInteger(contractId)
    || typeof residentId !== "number"
  ) return null;
  const contract = uniqueById(world.contracts, contractId);
  if (
    contract === null
    || !committedHeavyResidentPromise(contract, committedEvent, residentId)
  ) return null;
  const resident = uniqueById(world.residents, residentId);
  if (resident === null || !residentCarriesContract(resident, contract)) return null;

  const firstRouteId = contract.porterRouteIds[0];
  const firstRoute = firstRouteId === undefined
    ? null
    : uniqueById(world.routes, firstRouteId);
  if (
    firstRoute === null
    || resident.location.kind !== "route"
    || resident.location.routeId !== firstRoute.id
  ) return null;
  const departureProgress = firstRoute.fromSettlementId === contract.originSettlementId
    ? 0
    : firstRoute.toSettlementId === contract.originSettlementId
      ? FIXED_POINT
      : null;
  if (departureProgress === null || resident.location.progress !== departureProgress) return null;

  let address: ReturnType<typeof livingActorAddressForResident>;
  try {
    address = livingActorAddressForResident(world, resident);
  } catch {
    return null;
  }
  if (address === null) return null;

  const triggerEventId = contractDepartureTriggerEventId(committedEvent);
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "working-people-expression:v1",
    sourceActorId: address.actorId,
    triggerEventId,
    atTick: committedEvent.tick,
    resource: contract.resource,
    quantity: contract.cargoQuantity,
  }).slice(0, 8), 16) >>> 0;

  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: address.actorId,
    triggerEventId,
    position: address.position,
    meaning: "porter-heavy-load",
    family: "work",
    tone: "strained",
    volume: "spoken",
    knowledgeBasis: "self-handled-heavy-cargo",
    priority: 240_000,
    salience: 420_000,
    variantSeed,
    durationSteps: 8,
  });
}

/**
 * Reauthenticates one persisted porter expression against current simulation
 * authority. The expression kernel owns generic schema/event-ID validation;
 * this adapter additionally proves that the trigger names the exact retained
 * departure and that re-deriving it from current contract, cargo, resident,
 * route, identity, and position facts produces the same immutable event.
 *
 * `remainingSteps` and `audioAcknowledged` are deliberately excluded because
 * fixed-step expiry and exact-once audio acknowledgement lawfully evolve them.
 */
export function workingPeopleExpressionEventMatchesWorld(
  world: WorldView,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveWorkingPeopleExpression(world, expression.triggerEventId);
  if (derived === null) return false;

  return stableStringify(immutableExpressionFields(expression))
    === stableStringify(immutableExpressionFields(derived.event));
}

/**
 * Reauthenticates retained porter cooldown memory after its active event has
 * expired. Identity/semantic fields must equal the memory derived from the
 * exact committed departure, and both cooldown counters must be reachable by
 * one shared fixed-step decay from that derived memory.
 */
export function workingPeopleExpressionMemoryMatchesWorld(
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
  const derived = deriveWorkingPeopleExpression(world, canonicalMemory.triggerEventId);
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

/** Re-derive one exact committed work expression for persistence validation. */
export function workingPeopleExpressionEventForTrigger(
  world: WorldView,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveWorkingPeopleExpression(world, triggerEventId)?.event ?? null;
}

function deriveWorkingPeopleExpression(
  world: WorldView,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  if (!plainRecord(world) || !Array.isArray(world.events)) return null;
  const trigger = parseContractDepartureTriggerEventId(triggerEventId);
  if (trigger === null) return null;

  const committedMatches = world.events.filter((candidate) =>
    plainRecord(candidate) && candidate.sequence === trigger.sequence
  );
  if (committedMatches.length !== 1) return null;
  const committedEvent = canonicalDepartureEvent(committedMatches[0]);
  if (
    committedEvent === null
    || committedEvent.subjectId !== trigger.contractId
    || contractDepartureTriggerEventId(committedEvent) !== triggerEventId
  ) return null;

  const intent = workingPeopleExpressionIntent({ world, event: committedEvent });
  if (intent === null) return null;
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

function contractDepartureTriggerEventId(event: SimEvent): string {
  return `sim-event:contract-departed:${event.sequence}:${event.subjectId}`;
}

function parseContractDepartureTriggerEventId(
  value: string,
): Readonly<{ sequence: number; contractId: number }> | null {
  const match = CONTRACT_DEPARTURE_TRIGGER_PATTERN.exec(value);
  if (match === null) return null;
  const sequence = Number(match[1]);
  const contractId = Number(match[2]);
  return nonnegativeSafeInteger(sequence) && positiveSafeInteger(contractId)
    ? Object.freeze({ sequence, contractId })
    : null;
}

function committedHeavyResidentPromise(
  contract: ContractState,
  event: SimEvent,
  residentId: number,
): boolean {
  return positiveSafeInteger(contract.id)
    && contract.id === event.subjectId
    && contract.status === "in-transit"
    && contract.carrierKind === "resident"
    && contract.assignedResidentId === residentId
    && contract.acceptedTick !== null
    && nonnegativeSafeInteger(contract.acceptedTick)
    && contract.acceptedTick < event.tick
    && contract.departedTick === event.tick
    && contract.arrivalTick === event.data.arrivalTick
    && contract.completedTick === null
    && positiveSafeInteger(contract.quantity)
    && contract.cargoQuantity === contract.quantity
    && heavyPromiseResource(contract.resource)
    && Array.isArray(contract.porterRouteIds)
    && Array.isArray(contract.porterSettlementIds)
    && contract.porterRouteIds.length === event.data.routeHops
    && contract.porterSettlementIds.length === contract.porterRouteIds.length + 1
    && contract.porterSettlementIds[0] === contract.originSettlementId
    && contract.porterSettlementIds.at(-1) === contract.destinationSettlementId;
}

function residentCarriesContract(
  resident: ResidentState,
  contract: ContractState,
): boolean {
  return plainRecord(resident.identity)
    && resident.identity.species === "human"
    && livingSpeciesActorIdMatchesNamespace(resident.identity.stableId, "human")
    && resident.perception?.actorId === resident.identity.stableId
    && resident.activeContractId === contract.id
    && resident.intention === "carry"
    && plainRecord(resident.location)
    && resident.location.kind === "route"
    && nonnegativeSafeInteger(resident.location.progress)
    && resident.location.progress <= FIXED_POINT;
}

/** A Promise's physical handling property is fixed by its resource identity. */
function heavyPromiseResource(resource: ContractState["resource"]): boolean {
  return resource === "freshWater" || resource === "parts";
}

function canonicalDepartureEvent(value: unknown): SimEvent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "data",
    "sequence",
    "subjectId",
    "tick",
    "type",
  ])) return null;
  if (
    value.type !== "contract-departed"
    || !nonnegativeSafeInteger(value.tick)
    || !nonnegativeSafeInteger(value.sequence)
    || !positiveSafeInteger(value.subjectId)
    || !plainRecord(value.data)
  ) return null;
  if (
    (!exactKeys(value.data, DEPARTURE_DATA_KEYS)
      && !exactKeys(value.data, OBSERVED_DEPARTURE_DATA_KEYS))
    || !positiveSafeInteger(value.data.residentId)
    || !positiveSafeInteger(value.data.routeHops)
    || !nonnegativeSafeInteger(value.data.arrivalTick)
    || value.data.arrivalTick <= value.tick
    || !fixedPoint(value.data.bottleneckReliability)
    || (Object.hasOwn(value.data, "playerObserved") && value.data.playerObserved !== true)
  ) return null;
  return value as unknown as SimEvent;
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
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) =>
      key === rightKeys[index] && left[key] === right[key]
    );
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
  return Number.isSafeInteger(value) && (value as number) > 0;
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
