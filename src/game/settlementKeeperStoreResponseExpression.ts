import type { ResidentState, WorldView } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  LOCAL_PLAYER_LIVING_ACTOR_ID,
  livingSpeciesActorIdMatchesNamespace,
} from "./livingSpeciesRegistry";
import { createLivingActorAddress, headingFromRadians, livingActorAddressForResident, type LivingActorAddress } from "./livingActor";
import { resolveResidentWorldPlacementAtActivityPhase } from "./residentSpatial";
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
  canonicalizeSettlementEcologyState,
  projectSettlementKeeperStoreClosureAuthority,
  type SettlementEcologyState,
  type SettlementKeeperStoreClosureAuthority,
} from "./settlementEcology";

export const SETTLEMENT_KEEPER_STORE_RESPONSE_PRIORITY = 600_000 as const;
export const SETTLEMENT_KEEPER_STORE_RESPONSE_SALIENCE = 700_000 as const;
export const SETTLEMENT_KEEPER_STORE_RESPONSE_DURATION_STEPS = 12 as const;

export interface SettlementKeeperStoreResponseExpressionInput {
  /** Current authoritative economy projection that owns the keeper body. */
  readonly world: WorldView;
  /** Exact post-application settlement root that owns the secured transaction. */
  readonly settlement: SettlementEcologyState;
  /** Recorded admission phase for cold reauthentication; omission uses the live body. */
  readonly sourcePhase?: number;
}

interface SettlementKeeperStoreResponseExpressionAuthority {
  readonly world: WorldView;
  readonly settlement: SettlementEcologyState;
  readonly closure: SettlementKeeperStoreClosureAuthority;
  readonly keeper: ResidentState;
  readonly address: LivingActorAddress;
}

/**
 * Adapts only the immediate, explicit player-report closure into one keeper
 * response. Older direct observations and already-secured historical roots do
 * not acquire retroactive speech.
 */
export function settlementKeeperStoreResponseExpressionIntent(
  inputValue: SettlementKeeperStoreResponseExpressionInput,
): SituatedExpressionIntent | null {
  const authority = expressionAuthority(inputValue);
  if (authority === null) return null;
  const { closure, address } = authority;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "settlement-keeper-store-response-expression:v1",
    keeperActorId: closure.keeperActorId,
    storeId: closure.storeId,
    transactionId: closure.transactionId,
    sourceEvidenceId: closure.sourceEvidenceId,
    sourceEvidenceAtTick: closure.sourceEvidenceAtTick,
  }).slice(0, 8), 16) >>> 0;
  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: closure.keeperActorId,
    triggerEventId: closure.transactionId,
    position: address.position,
    meaning: "keeper-secure-store-response",
    family: "work",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-committed-store-closure",
    priority: SETTLEMENT_KEEPER_STORE_RESPONSE_PRIORITY,
    salience: SETTLEMENT_KEEPER_STORE_RESPONSE_SALIENCE,
    variantSeed,
    durationSteps: SETTLEMENT_KEEPER_STORE_RESPONSE_DURATION_STEPS,
  });
}

/** The same applied closure authenticates the source's retained body and heading. */
export function settlementKeeperStoreResponseExpressionSourceAddress(
  input: SettlementKeeperStoreResponseExpressionInput,
): LivingActorAddress | null {
  return expressionAuthority(input)?.address ?? null;
}

/** Reauthenticates one active event against its exact retained closure root. */
export function settlementKeeperStoreResponseExpressionEventMatchesWorld(
  input: SettlementKeeperStoreResponseExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveSettlementKeeperStoreResponseExpression(
    input,
    expression.triggerEventId,
  );
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates bounded cooldown memory from the same closure authority. */
export function settlementKeeperStoreResponseExpressionMemoryMatchesWorld(
  input: SettlementKeeperStoreResponseExpressionInput,
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
  const derived = deriveSettlementKeeperStoreResponseExpression(
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

/** Re-derives the exact keeper response for persistence authentication. */
export function settlementKeeperStoreResponseExpressionEventForTrigger(
  input: SettlementKeeperStoreResponseExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveSettlementKeeperStoreResponseExpression(input, triggerEventId)?.event ?? null;
}

function deriveSettlementKeeperStoreResponseExpression(
  input: SettlementKeeperStoreResponseExpressionInput,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const intent = settlementKeeperStoreResponseExpressionIntent(input);
  if (intent === null || intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function expressionAuthority(
  inputValue: SettlementKeeperStoreResponseExpressionInput,
): SettlementKeeperStoreResponseExpressionAuthority | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || (!exactKeys(input, ["settlement", "world"])
    && !exactKeys(input, ["settlement", "sourcePhase", "world"]))) return null;
  if (Object.hasOwn(input, "sourcePhase") && (!nonnegativeSafeInteger(input.sourcePhase)
    || input.sourcePhase > 9)) return null;
  const world = input.world as WorldView;
  if (
    !plainRecord(world)
    || !nonnegativeSafeInteger(world.completedTick)
    || !Array.isArray(world.residents)
    || !Array.isArray(world.settlements)
  ) return null;
  const settlement = canonicalizeSettlementEcologyState(input.settlement);
  if (settlement === null) return null;
  const closure = projectSettlementKeeperStoreClosureAuthority(settlement);
  if (
    closure === null
    || closure.source !== "player-report"
    || closure.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || closure.sourceRisk !== "food-exposed"
    || closure.sourceEvidenceAtTick !== world.completedTick
  ) return null;
  const settlements = world.settlements.filter(({ id }) => (
    id === settlement.identity.settlementId
  ));
  if (settlements.length !== 1) return null;
  const keepers = world.residents.filter(({ identity }) => (
    identity.stableId === closure.keeperActorId
  ));
  const keeper = keepers[0];
  if (
    keepers.length !== 1
    || keeper === undefined
    || keeper.identity.species !== "human"
    || keeper.perception.actorId !== keeper.identity.stableId
    || !livingSpeciesActorIdMatchesNamespace(keeper.identity.stableId, "human")
    || keeper.homeSettlementId !== settlement.identity.settlementId
  ) return null;
  let address: LivingActorAddress | null;
  try {
    if (Object.hasOwn(keeper, "activity") && Object.hasOwn(input, "sourcePhase")) {
      const placement = resolveResidentWorldPlacementAtActivityPhase(
        world, keeper, world.completedTick, input.sourcePhase as number,
      );
      address = placement === null ? null : createLivingActorAddress({
        actorId: keeper.identity.stableId, species: "human", persistence: "promoted",
        position: placement.position,
        heading: headingFromRadians(placement.facing),
      });
    } else {
      // An absent legacy body has no invented history; retain its original resolver.
      address = livingActorAddressForResident(world, keeper);
    }
  } catch {
    return null;
  }
  if (address === null) return null;
  return Object.freeze({
    world,
    settlement,
    closure,
    keeper,
    address,
  });
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
