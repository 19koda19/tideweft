import {
  canonicalizeActorPerceptionState,
  type ActorBelief,
} from "../sim/actorPerception";
import {
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  residentCircadianUrgentPreference,
  residentHomeRestDestinationId,
} from "../sim/livingCircadian";
import {
  FIXED_POINT,
  type ResidentState,
  type WeatherState,
} from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  canonicalizeLivingCircadianPersistentState,
  livingCircadianPersistentStateFromProjection,
  projectLivingCircadian,
  type LivingCircadianDisturbance,
  type LivingCircadianPersistentState,
  type LivingCircadianPriorityOverride,
  type LivingCircadianProjection,
} from "./livingCircadian";
import {
  livingSpeciesActorIdMatchesNamespace,
} from "./livingSpeciesRegistry";
import {
  canonicalizePorterResponseState,
  type PorterResponseState,
} from "./porterResponse";
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

  const resident = canonicalResidentForRoutine(raw.resident, raw.atTick);
  const settlementEcology = canonicalizeSettlementEcologyState(raw.settlementEcology);
  const porterResponse = canonicalizePorterResponseState(raw.porterResponse);
  const weather = canonicalWeather(raw.weather);
  if (
    resident === null
    || settlementEcology === null
    || porterResponse === null
    || weather === null
    || settlementEcology.identity.keeperActorId !== resident.identity.stableId
    || settlementEcology.identity.settlementId !== resident.homeSettlementId
    || porterResponse.actorId !== resident.identity.stableId
    || porterResponse.tick !== raw.atTick
  ) return null;

  const restDestinationId = residentHomeRestDestinationId(
    resident.identity.stableId,
    resident.homeSettlementId,
  );
  if (restDestinationId === null) return null;
  const restDestinationArrived = resident.location.kind === "settlement"
    && resident.location.settlementId === resident.homeSettlementId
    && resident.activeContractId === null;

  const savedReceipt = resident.circadian === undefined
    ? null
    : canonicalizeLivingCircadianPersistentState(resident.circadian);
  // Legacy residents are adopted only where their actual location already
  // authenticates the home destination. A present receipt may lawfully follow
  // its resident away and will wake when that destination is lost.
  if (resident.circadian === undefined && !restDestinationArrived) return null;
  if (
    resident.circadian !== undefined
    && (
      savedReceipt === null
      || savedReceipt.restDestinationId !== restDestinationId
      || stableStringify(savedReceipt.policy)
        !== stableStringify(SETTLEMENT_KEEPER_CIRCADIAN_POLICY)
    )
  ) return null;

  const priorityOverride = keeperPriorityOverride(resident, porterResponse, weather);
  const routine = projectLivingCircadian({
    subjectId: resident.identity.stableId,
    atTick: raw.atTick,
    mode: "full",
    policy: SETTLEMENT_KEEPER_CIRCADIAN_POLICY,
    current: savedReceipt?.posture
      ?? Object.freeze({ state: "awake" as const, enteredAtTick: raw.atTick }),
    restDestination: {
      destinationId: restDestinationId,
      arrived: restDestinationArrived,
    },
    driverSignals: [],
    disturbance: currentStrongDisturbance(resident, raw.atTick),
    priorityOverride,
  });
  if (routine === null) return null;

  const restorative = restDestinationArrived
    && (routine.posture.state === "resting" || routine.posture.state === "asleep");
  return deepFreeze({
    version: SETTLEMENT_KEEPER_CIRCADIAN_VERSION,
    ownerId: SETTLEMENT_KEEPER_CIRCADIAN_OWNER_ID,
    keeperActorId: resident.identity.stableId,
    residentId: resident.id,
    homeSettlementId: resident.homeSettlementId,
    atTick: raw.atTick,
    restDestinationArrived,
    routine,
    receipt: livingCircadianPersistentStateFromProjection(routine),
    restorative,
    presentationIntent: presentationIntentFor(
      routine,
      restDestinationArrived,
      priorityOverride,
    ),
  });
}

function canonicalResidentForRoutine(
  value: unknown,
  atTick: number,
): ResidentState | null {
  if (!plainRecord(value) || !plainRecord(value.identity)) return null;
  const resident = value as unknown as ResidentState;
  const perception = canonicalizeActorPerceptionState(resident.perception);
  if (
    !positiveSafeInteger(resident.id)
    || !positiveSafeInteger(resident.homeSettlementId)
    || resident.identity.species !== "human"
    || !livingSpeciesActorIdMatchesNamespace(resident.identity.stableId, "human")
    || perception === null
    || perception.actorId !== resident.identity.stableId
    || perception.tick !== atTick
    || !canonicalNeeds(resident.needs)
    || !plainRecord(resident.condition)
    || !fixedPoint(resident.condition.exhaustion)
    || !(resident.activeContractId === null || positiveSafeInteger(resident.activeContractId))
    || !canonicalLocation(resident.location)
  ) return null;
  return resident;
}

function keeperPriorityOverride(
  resident: ResidentState,
  porterResponse: PorterResponseState,
  weather: WeatherState,
): LivingCircadianPriorityOverride | null {
  if (resident.location.kind === "route") {
    return activeOverride(`route:${resident.location.routeId}`);
  }
  if (resident.activeContractId !== null) {
    return activeOverride(`contract:${resident.activeContractId}`);
  }
  if (porterResponse.intent !== "wait-observe") {
    return activeOverride(
      porterResponse.lastDecisionId ?? `porter-response:${porterResponse.intent}`,
    );
  }
  // The simulation's named storm classification is authoritative. The routine
  // does not create a second weather-severity model or infer danger from pixels.
  if (weather.kind === "storm") {
    return Object.freeze({
      kind: "dangerous-weather" as const,
      referenceId: "weather:storm",
      preference: "active" as const,
    });
  }
  return urgentNeedOverride(resident);
}

function urgentNeedOverride(
  resident: ResidentState,
): LivingCircadianPriorityOverride | null {
  const selected = residentCircadianUrgentPreference({
    needs: resident.needs,
    exhaustion: resident.condition.exhaustion,
  });
  return selected === null
    ? null
    : Object.freeze({
        kind: "urgent-need" as const,
        referenceId: selected.referenceId,
        preference: selected.preference,
      });
}

function currentStrongDisturbance(
  resident: ResidentState,
  atTick: number,
): LivingCircadianDisturbance | null {
  const belief = [...resident.perception.beliefs]
    .filter((candidate) => candidate.lastObservedTick === atTick && candidate.strongInterrupt)
    .sort(compareStrongBeliefs)[0];
  return belief === undefined
    ? null
    : Object.freeze({
        source: "lawful-perception" as const,
        referenceId: belief.sourceObservationId,
        observedAtTick: atTick,
        intensity: belief.salience,
      });
}

function compareStrongBeliefs(left: ActorBelief, right: ActorBelief): number {
  return right.salience - left.salience
    || (left.sourceObservationId < right.sourceObservationId
      ? -1
      : left.sourceObservationId > right.sourceObservationId
        ? 1
        : 0);
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

function activeOverride(referenceId: string): LivingCircadianPriorityOverride {
  return Object.freeze({
    kind: "active-commitment" as const,
    referenceId,
    preference: "active" as const,
  });
}

function canonicalNeeds(value: unknown): boolean {
  return plainRecord(value)
    && exactKeys(value, ["belonging", "food", "rest"])
    && fixedPoint(value.food)
    && fixedPoint(value.rest)
    && fixedPoint(value.belonging);
}

function canonicalLocation(value: unknown): boolean {
  if (!plainRecord(value)) return false;
  if (value.kind === "settlement") {
    return exactKeys(value, ["kind", "settlementId"])
      && positiveSafeInteger(value.settlementId);
  }
  return value.kind === "route"
    && exactKeys(value, ["kind", "progress", "routeId"])
    && positiveSafeInteger(value.routeId)
    && fixedPoint(value.progress);
}

function canonicalWeather(value: unknown): WeatherState | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["intensity", "kind", "nextChangeTick", "windX", "windY"])
    || (value.kind !== "clear"
      && value.kind !== "mist"
      && value.kind !== "rain"
      && value.kind !== "storm")
    || !fixedPoint(value.intensity)
    || !signedFixedPoint(value.windX)
    || !signedFixedPoint(value.windY)
    || !nonnegativeSafeInteger(value.nextChangeTick)
  ) return null;
  return value as unknown as WeatherState;
}

function fixedPoint(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= FIXED_POINT
    && !Object.is(value, -0);
}

function signedFixedPoint(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Math.abs(value as number) <= FIXED_POINT
    && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
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
