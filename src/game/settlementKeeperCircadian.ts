import { RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY } from "../sim/livingCircadian";
import {
  type ResidentState,
  type WeatherState,
} from "../sim/types";
import type {
  LivingCircadianPersistentState,
  LivingCircadianPriorityOverride,
  LivingCircadianProjection,
} from "./livingCircadian";
import {
  canonicalizePorterResponseState,
  type PorterResponseState,
} from "./porterResponse";
import {
  planResidentCircadian,
  type ResidentCircadianDuty,
  type ResidentCircadianUnboundDeferral,
} from "./residentCircadian";
import {
  canonicalizeSettlementEcologyState,
  type SettlementEcologyState,
} from "./settlementEcology";

export const SETTLEMENT_KEEPER_CIRCADIAN_VERSION = 1 as const;
export const SETTLEMENT_KEEPER_CIRCADIAN_OWNER_ID =
  "game:settlement-keeper-circadian:v1" as const;

export {
  RESIDENT_CIRCADIAN_URGENT_BELONGING_NEED as SETTLEMENT_KEEPER_URGENT_BELONGING_NEED,
  RESIDENT_CIRCADIAN_URGENT_EXHAUSTION as SETTLEMENT_KEEPER_URGENT_EXHAUSTION,
  RESIDENT_CIRCADIAN_URGENT_FOOD_NEED as SETTLEMENT_KEEPER_URGENT_FOOD_NEED,
  RESIDENT_CIRCADIAN_URGENT_REST_NEED as SETTLEMENT_KEEPER_URGENT_REST_NEED,
} from "../sim/livingCircadian";

export const SETTLEMENT_KEEPER_CIRCADIAN_POLICY =
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY;

/**
 * A presentation-only summary. It intentionally exposes neither the schedule,
 * wake threshold, phase offset, nor opaque rest-destination identity.
 */
export type SettlementKeeperCircadianPresentationIntent =
  | "watch"
  | "awake"
  | "rest"
  | "asleep";

export interface ProjectSettlementKeeperCircadianInput {
  /** Canonical human resident after perception has reached this exact tick. */
  readonly resident: ResidentState;
  /** The canonical physical store root whose identity names this keeper. */
  readonly settlementEcology: SettlementEcologyState;
  /** Existing same-human response authority; non-neutral work cannot be erased. */
  readonly porterResponse: PorterResponseState;
  readonly weather: WeatherState;
  readonly atTick: number;
}

export interface SettlementKeeperCircadianProjection {
  readonly version: typeof SETTLEMENT_KEEPER_CIRCADIAN_VERSION;
  readonly ownerId: typeof SETTLEMENT_KEEPER_CIRCADIAN_OWNER_ID;
  readonly keeperActorId: string;
  readonly residentId: number;
  readonly homeSettlementId: number;
  readonly atTick: number;
  readonly restDestinationArrived: boolean;
  readonly routine: LivingCircadianProjection;
  /** Exact compact receipt for the resident simulation owner to commit. */
  readonly receipt: LivingCircadianPersistentState;
  /** True only while the authenticated body is at home and resting/asleep. */
  readonly restorative: boolean;
  readonly presentationIntent: SettlementKeeperCircadianPresentationIntent;
}

export type SettlementKeeperCircadianPlan =
  | Readonly<{
      readonly kind: "projected";
      readonly projection: SettlementKeeperCircadianProjection;
    }>
  | ResidentCircadianUnboundDeferral;

/**
 * Pure cross-owner bridge for the one existing settlement food-store keeper.
 * The resident simulation still owns identity, needs, perception, contracts,
 * location, physiology, and receipt mutation. This adapter proposes no human
 * movement and treats the existing home settlement as its complete honest
 * destination resolution.
 */
export function projectSettlementKeeperCircadian(
  inputValue: ProjectSettlementKeeperCircadianInput,
): SettlementKeeperCircadianProjection | null {
  const plan = planSettlementKeeperCircadian(inputValue);
  return plan?.kind === "projected" ? plan.projection : null;
}

/** Strict keeper-root planner used by the roster's atomic runtime commit. */
export function planSettlementKeeperCircadian(
  inputValue: ProjectSettlementKeeperCircadianInput,
): SettlementKeeperCircadianPlan | null {
  const raw: unknown = inputValue;
  if (
    !plainRecord(raw)
    || !exactKeys(raw, [
      "atTick",
      "porterResponse",
      "resident",
      "settlementEcology",
      "weather",
    ])
    || !nonnegativeSafeInteger(raw.atTick)
  ) return null;

  const resident = raw.resident as ResidentState;
  const settlementEcology = canonicalizeSettlementEcologyState(raw.settlementEcology);
  const porterResponse = canonicalizePorterResponseState(raw.porterResponse);
  if (
    settlementEcology === null
    || porterResponse === null
    || !plainRecord(resident)
    || !plainRecord(resident.identity)
    || settlementEcology.identity.keeperActorId !== resident.identity.stableId
    || settlementEcology.identity.settlementId !== resident.homeSettlementId
    || porterResponse.actorId !== resident.identity.stableId
    || porterResponse.tick !== raw.atTick
  ) return null;

  const duty: ResidentCircadianDuty | null = porterResponse.intent === "wait-observe"
    ? null
    : Object.freeze({
        kind: "active-duty" as const,
        referenceId: porterResponse.lastDecisionId
          ?? `porter-response:${porterResponse.intent}`,
      });
  const residentPlan = planResidentCircadian({
    resident,
    duty,
    weather: raw.weather as WeatherState,
    atTick: raw.atTick,
  });
  if (residentPlan === null || residentPlan.kind === "unbound-deferred") {
    return residentPlan;
  }
  const projected = residentPlan.projection;

  const projection = deepFreeze({
    version: SETTLEMENT_KEEPER_CIRCADIAN_VERSION,
    ownerId: SETTLEMENT_KEEPER_CIRCADIAN_OWNER_ID,
    keeperActorId: resident.identity.stableId,
    residentId: resident.id,
    homeSettlementId: resident.homeSettlementId,
    atTick: raw.atTick,
    restDestinationArrived: projected.restDestinationArrived,
    routine: projected.routine,
    receipt: projected.receipt,
    restorative: projected.restorative,
    presentationIntent: presentationIntentFor(
      projected.routine,
      projected.restDestinationArrived,
      projected.priorityOverride,
    ),
  });
  return deepFreeze({ kind: "projected" as const, projection });
}

function presentationIntentFor(
  routine: LivingCircadianProjection,
  restDestinationArrived: boolean,
  priorityOverride: LivingCircadianPriorityOverride | null,
): SettlementKeeperCircadianPresentationIntent {
  if (routine.posture.state === "asleep") return "asleep";
  if (routine.posture.state === "resting") return "rest";
  return restDestinationArrived
    && priorityOverride === null
    && routine.posture.state === "awake"
    && routine.effectivePreference === "active"
    ? "watch"
    : "awake";
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

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
