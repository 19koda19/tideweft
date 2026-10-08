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
 * A diagnostic presentation summary with no current runtime/UI consumer.
 * Player-facing posture is derived from persisted resident state instead. It
 * intentionally exposes neither the schedule, wake threshold, phase offset,
 * nor opaque rest-destination identity.
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
  /** True only while the body is at a settlement refuge and resting/asleep. */
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
 * movement. The keeper normally rests at home, while the shared resident
 * adapter also permits physically present reciprocal settlement hospitality.
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
  const duty = deriveSettlementKeeperCircadianDuty(
    resident,
    raw.settlementEcology as SettlementEcologyState,
    raw.porterResponse as PorterResponseState,
    raw.atTick,
  );
  if (duty === undefined) return null;
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

/**
 * The keeper's existing response owner supplies the same duty to receipt-only
 * legacy planning and atomic body/task planning. Null is genuine neutral duty;
 * undefined is a failed binding, never permission to erase active work.
 */
export function deriveSettlementKeeperCircadianDuty(
  resident: ResidentState,
  settlementValue: SettlementEcologyState,
  responseValue: PorterResponseState,
  atTick: number,
): ResidentCircadianDuty | null | undefined {
  const settlement = canonicalizeSettlementEcologyState(settlementValue);
  const response = canonicalizePorterResponseState(responseValue);
  if (
    !nonnegativeSafeInteger(atTick)
    || settlement === null
    || response === null
    || !plainRecord(resident)
    || !plainRecord(resident.identity)
    || settlement.identity.keeperActorId !== resident.identity.stableId
    || settlement.identity.settlementId !== resident.homeSettlementId
    || response.actorId !== resident.identity.stableId
    || response.tick !== atTick
  ) return undefined;
  return response.intent === "wait-observe"
    ? null
    : Object.freeze({
        kind: "active-duty" as const,
        referenceId: response.lastDecisionId ?? `porter-response:${response.intent}`,
      });
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
