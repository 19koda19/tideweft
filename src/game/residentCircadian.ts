import {
  canonicalizeActorPerceptionState,
  type ActorBelief,
} from "../sim/actorPerception";
import {
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  residentAtSettlementRestDestination,
  residentCircadianUrgentPreference,
  residentCircadianWatchReference,
  residentSettlementRestNetworkId,
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
import { livingSpeciesActorIdMatchesNamespace } from "./livingSpeciesRegistry";

export const RESIDENT_CIRCADIAN_RUNTIME_VERSION = 1 as const;
export const RESIDENT_CIRCADIAN_RUNTIME_OWNER_ID =
  "game:resident-circadian:v1" as const;

/**
 * A duty fact authenticated by a higher owner, such as the existing keeper's
 * porter-response state. Route and Promise work remain resident-owned and do
 * not need a second duty record.
 */
export interface ResidentCircadianDuty {
  readonly kind: "active-duty";
  readonly referenceId: string;
}

export interface ProjectResidentCircadianInput {
  /** Canonical human resident after perception has reached this exact tick. */
  readonly resident: ResidentState;
  /** Optional current duty already authenticated by its owning subsystem. */
  readonly duty: ResidentCircadianDuty | null;
  readonly weather: WeatherState;
  readonly atTick: number;
}

export interface ResidentCircadianProjection {
  readonly version: typeof RESIDENT_CIRCADIAN_RUNTIME_VERSION;
  readonly ownerId: typeof RESIDENT_CIRCADIAN_RUNTIME_OWNER_ID;
  readonly residentActorId: string;
  readonly residentId: number;
  readonly homeSettlementId: number;
  readonly atTick: number;
  readonly restDestinationArrived: boolean;
  readonly routine: LivingCircadianProjection;
  /** Exact compact receipt for the resident simulation owner to commit. */
  readonly receipt: LivingCircadianPersistentState;
  /** True only while the body is at a settlement refuge and resting/asleep. */
  readonly restorative: boolean;
  /** Internal causal result; presentation must not expose its hidden values. */
  readonly priorityOverride: LivingCircadianPriorityOverride | null;
}

export interface ResidentCircadianUnboundDeferral {
  readonly kind: "unbound-deferred";
  readonly residentActorId: string;
  readonly atTick: number;
  readonly reason: "settlement-arrival-unproven";
}

export type ResidentCircadianPlan =
  | Readonly<{
      readonly kind: "projected";
      readonly projection: ResidentCircadianProjection;
    }>
  | ResidentCircadianUnboundDeferral;

/**
 * Species-neutral human bridge into the shared living-circadian kernel. It
 * owns no movement, home, work, needs, perception, physiology, or save root.
 * The resident's reciprocal settlement network is the honest rest anchor:
 * physical location still owns which refuge they occupy, and no house, bed,
 * interior, commute, or fabricated duty is introduced here.
 */
export function projectResidentCircadian(
  inputValue: ProjectResidentCircadianInput,
): ResidentCircadianProjection | null {
  const plan = planResidentCircadian(inputValue);
  return plan?.kind === "projected" ? plan.projection : null;
}

/**
 * Distinguishes a fully validated legacy resident awaiting physical settlement
 * arrival from malformed input. Runtime transactions may preserve only the
 * former; a generic null result must never be interpreted as lawful deferral.
 */
export function planResidentCircadian(
  inputValue: ProjectResidentCircadianInput,
): ResidentCircadianPlan | null {
  const raw: unknown = inputValue;
  if (
    !plainRecord(raw)
    || !exactKeys(raw, ["atTick", "duty", "resident", "weather"])
    || !nonnegativeSafeInteger(raw.atTick)
  ) return null;

  const resident = canonicalResidentForRoutine(raw.resident, raw.atTick);
  const duty = canonicalDuty(raw.duty);
  const weather = canonicalWeather(raw.weather, raw.atTick);
  if (resident === null || duty === undefined || weather === null) return null;

  const restDestinationId = residentSettlementRestNetworkId(
    resident.identity.stableId,
    resident.homeSettlementId,
  );
  if (restDestinationId === null) return null;
  const restDestinationArrived = residentAtSettlementRestDestination(resident);

  const savedReceipt = resident.circadian === undefined
    ? null
    : canonicalizeLivingCircadianPersistentState(resident.circadian);
  // A legacy human is adopted only where the body already authenticates a
  // physical settlement refuge. A present receipt may follow its owner away
  // and wakes when work or location invalidates rest.
  if (resident.circadian === undefined && !restDestinationArrived) {
    return deepFreeze({
      kind: "unbound-deferred" as const,
      residentActorId: resident.identity.stableId,
      atTick: raw.atTick,
      reason: "settlement-arrival-unproven" as const,
    });
  }
  if (
    resident.circadian !== undefined
    && (
      savedReceipt === null
      || savedReceipt.restDestinationId !== restDestinationId
      || stableStringify(savedReceipt.policy)
        !== stableStringify(RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY)
    )
  ) return null;

  const priorityOverride = residentPriorityOverride(resident, duty, weather);
  const routine = projectLivingCircadian({
    subjectId: resident.identity.stableId,
    atTick: raw.atTick,
    mode: "full",
    policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
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
  const projection = deepFreeze({
    version: RESIDENT_CIRCADIAN_RUNTIME_VERSION,
    ownerId: RESIDENT_CIRCADIAN_RUNTIME_OWNER_ID,
    residentActorId: resident.identity.stableId,
    residentId: resident.id,
    homeSettlementId: resident.homeSettlementId,
    atTick: raw.atTick,
    restDestinationArrived,
    routine,
    receipt: livingCircadianPersistentStateFromProjection(routine),
    restorative,
    priorityOverride,
  });
  return deepFreeze({ kind: "projected" as const, projection });
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

/** Undefined means malformed; null is a valid absence. */
function canonicalDuty(value: unknown): ResidentCircadianDuty | null | undefined {
  if (value === null) return null;
  if (
    !plainRecord(value)
    || !exactKeys(value, ["kind", "referenceId"])
    || value.kind !== "active-duty"
    || !validId(value.referenceId)
  ) return undefined;
  return value as unknown as ResidentCircadianDuty;
}

function residentPriorityOverride(
  resident: ResidentState,
  duty: ResidentCircadianDuty | null,
  weather: WeatherState,
): LivingCircadianPriorityOverride | null {
  if (resident.location.kind === "route") {
    return activeOverride(`route:${resident.location.routeId}`);
  }
  if (resident.activeContractId !== null) {
    return activeOverride(`contract:${resident.activeContractId}`);
  }
  if (duty !== null) return activeOverride(duty.referenceId);
  // The simulation's named storm classification is authoritative. This does
  // not infer danger from rendered weather or create another severity model.
  if (weather.kind === "storm") {
    return Object.freeze({
      kind: "dangerous-weather" as const,
      referenceId: "weather:storm",
      preference: "active" as const,
    });
  }
  const watchReference = residentCircadianWatchReference(resident.perception);
  if (watchReference !== null) return activeOverride(watchReference);
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

function canonicalWeather(value: unknown, atTick: number): WeatherState | null {
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
    || value.nextChangeTick <= atTick
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

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && value === value.trim();
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
