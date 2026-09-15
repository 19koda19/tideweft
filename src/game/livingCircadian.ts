import { FIXED_POINT } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  LIVING_CIRCADIAN_DRIVERS,
  LIVING_CIRCADIAN_OWNER_ID,
  LIVING_CIRCADIAN_PROFILE_IDS,
  LIVING_CIRCADIAN_PROFILES,
  LIVING_CIRCADIAN_STATES,
  LIVING_CIRCADIAN_VERSION,
  canonicalizeLivingCircadianPersistentState,
  canonicalizeLivingCircadianPolicy,
  firstLivingCircadianActiveTick,
  livingCircadianPhaseOffsetTicks,
  livingCircadianProfile,
  projectLivingCircadianClockPreference,
  type LivingCircadianDriver,
  type LivingCircadianPersistentState,
  type LivingCircadianPolicy,
  type LivingCircadianPosture,
  type LivingCircadianPreference,
  type LivingCircadianProfileId,
  type LivingCircadianState,
} from "../sim/livingCircadian";
import {
  projectWorldTime,
  type WorldTimeProjection,
} from "../sim/worldTime";

export {
  LIVING_CIRCADIAN_DRIVERS,
  LIVING_CIRCADIAN_OWNER_ID,
  LIVING_CIRCADIAN_PROFILE_IDS,
  LIVING_CIRCADIAN_PROFILES,
  LIVING_CIRCADIAN_STATES,
  LIVING_CIRCADIAN_VERSION,
  canonicalizeLivingCircadianPersistentState,
  canonicalizeLivingCircadianPolicy,
  firstLivingCircadianActiveTick,
  livingCircadianPhaseOffsetTicks,
  livingCircadianProfile,
  projectLivingCircadianClockPreference,
} from "../sim/livingCircadian";
export type {
  LivingCircadianDriver,
  LivingCircadianPersistentState,
  LivingCircadianPolicy,
  LivingCircadianPosture,
  LivingCircadianPreference,
  LivingCircadianProfile,
  LivingCircadianProfileId,
  LivingCircadianRhythm,
  LivingCircadianState,
} from "../sim/livingCircadian";

export type LivingCircadianSimulationMode = "full" | "coarse";

export interface LivingCircadianRestDestination {
  /** Stable authenticated destination/anchor identity supplied by the physical owner. */
  readonly destinationId: string;
  readonly arrived: boolean;
}

export interface LivingCircadianDriverSignal {
  readonly driver: Exclude<LivingCircadianDriver, "clock">;
  readonly source: "authoritative-environment" | "lawful-observation";
  readonly referenceId: string;
  readonly sampledAtTick: number;
}

export interface LivingCircadianDisturbance {
  readonly source: "lawful-perception" | "physical-contact" | "authoritative-local-hazard";
  readonly referenceId: string;
  readonly observedAtTick: number;
  /** Fixed-point current salience/severity. */
  readonly intensity: number;
}

export interface LivingCircadianPriorityOverride {
  readonly kind: "urgent-need" | "dangerous-weather" | "active-commitment";
  readonly referenceId: string;
  readonly preference: LivingCircadianPreference;
}

export interface ProjectLivingCircadianInput {
  readonly subjectId: string;
  readonly atTick: number;
  readonly mode: LivingCircadianSimulationMode;
  readonly policy: LivingCircadianPolicy;
  readonly current: LivingCircadianPosture;
  readonly restDestination: LivingCircadianRestDestination;
  readonly driverSignals: readonly LivingCircadianDriverSignal[];
  readonly disturbance: LivingCircadianDisturbance | null;
  readonly priorityOverride: LivingCircadianPriorityOverride | null;
}

export type LivingCircadianAction =
  | "remain-active"
  | "travel-to-rest-destination"
  | "settle-at-rest-destination"
  | "sleep-at-rest-destination"
  | "respond-to-disturbance";

export type LivingCircadianTransitionCause =
  | "none"
  | "clock"
  | "driver"
  | "priority-override"
  | "rest-destination-lost"
  | "settled"
  | "disturbance"
  | "startle-recovered";

export interface LivingCircadianProjection {
  readonly version: typeof LIVING_CIRCADIAN_VERSION;
  readonly ownerId: typeof LIVING_CIRCADIAN_OWNER_ID;
  readonly subjectId: string;
  readonly atTick: number;
  readonly worldTime: WorldTimeProjection;
  readonly profileId: LivingCircadianProfileId;
  /** Binding threshold consumed by the actor cognition wake gate. */
  readonly wakeSensitivity: number;
  readonly policy: LivingCircadianPolicy;
  readonly restDestinationId: string;
  readonly restDestinationArrived: boolean;
  readonly phaseOffsetTicks: number;
  readonly clockPreference: LivingCircadianPreference;
  readonly effectivePreference: LivingCircadianPreference;
  readonly activatingDriver: Exclude<LivingCircadianDriver, "clock"> | null;
  readonly posture: LivingCircadianPosture;
  readonly action: LivingCircadianAction;
  readonly transitionCause: LivingCircadianTransitionCause;
  readonly causeReferenceId: string | null;
  /** Transient stable-ID cadence hint; it need not be added to a save schema. */
  readonly nextEvaluationTick: number;
}

const DRIVER_ORDER = new Map(LIVING_CIRCADIAN_DRIVERS.map((driver, index) => [driver, index]));

export function createLivingCircadianPolicy(input: Readonly<{
  profileId: LivingCircadianProfileId;
  drivers: readonly LivingCircadianDriver[];
  wakeSensitivity?: number;
}>): LivingCircadianPolicy | null {
  const profile = LIVING_CIRCADIAN_PROFILES.find(({ id }) => id === input.profileId);
  if (profile === undefined || !Array.isArray(input.drivers)) return null;
  const drivers = [...input.drivers];
  if (
    drivers.length === 0
    || !drivers.includes("clock")
    || new Set(drivers).size !== drivers.length
    || drivers.some((driver) => !LIVING_CIRCADIAN_DRIVERS.includes(driver))
  ) return null;
  drivers.sort((left, right) => DRIVER_ORDER.get(left)! - DRIVER_ORDER.get(right)!);
  const wakeSensitivity = input.wakeSensitivity ?? profile.defaultWakeSensitivity;
  if (!fixedPoint(wakeSensitivity) || wakeSensitivity === 0) return null;
  return deepFreeze({
    version: LIVING_CIRCADIAN_VERSION,
    ownerId: LIVING_CIRCADIAN_OWNER_ID,
    profileId: input.profileId,
    drivers,
    wakeSensitivity,
  });
}

/**
 * Pure species-neutral circadian projection. It consumes lawful current inputs
 * and an existing persisted actor posture/enteredAtTick; it owns no save schema.
 */
export function projectLivingCircadian(
  input: ProjectLivingCircadianInput,
): LivingCircadianProjection | null {
  if (!validInput(input)) return null;
  const profile = livingCircadianProfile(input.policy.profileId);
  const worldTime = projectWorldTime(input.atTick);
  const phaseOffsetTicks = livingCircadianPhaseOffsetTicks(
    input.subjectId,
    input.policy.profileId,
  );
  const clockPreference = projectLivingCircadianClockPreference(
    input.subjectId,
    input.atTick,
    input.policy,
  );
  if (worldTime === null || phaseOffsetTicks === null || clockPreference === null) return null;

  const activeSignal = [...input.driverSignals].sort(compareSignals)[0] ?? null;
  const effectivePreference = input.priorityOverride?.preference
    ?? (activeSignal === null ? clockPreference : "active");
  const strongDisturbance = input.disturbance !== null
    && input.disturbance.intensity >= input.policy.wakeSensitivity;

  let nextState = input.current.state;
  let enteredAtTick = input.current.enteredAtTick;
  let transitionCause: LivingCircadianTransitionCause = "none";
  let causeReferenceId: string | null = null;

  const transition = (state: LivingCircadianState, cause: LivingCircadianTransitionCause, referenceId: string | null) => {
    if (nextState !== state) enteredAtTick = input.atTick;
    nextState = state;
    transitionCause = cause;
    causeReferenceId = referenceId;
  };

  if (strongDisturbance) {
    transition("startled", "disturbance", input.disturbance!.referenceId);
  } else if (
    (nextState === "asleep" || nextState === "resting")
    && !input.restDestination.arrived
  ) {
    transition("awake", "rest-destination-lost", input.restDestination.destinationId);
  } else if (nextState === "startled") {
    if (input.atTick - enteredAtTick >= profile.startledHoldTicks) {
      transition("awake", "startle-recovered", null);
    }
  } else if (input.priorityOverride !== null) {
    applyPreference(
      input.priorityOverride.preference,
      "priority-override",
      input.priorityOverride.referenceId,
    );
  } else if (activeSignal !== null) {
    applyPreference("active", "driver", activeSignal.referenceId);
  } else {
    applyPreference(clockPreference, "clock", null);
  }

  function applyPreference(
    preference: LivingCircadianPreference,
    cause: LivingCircadianTransitionCause,
    referenceId: string | null,
  ): void {
    if (preference === "active") {
      transition("awake", cause, referenceId);
      return;
    }
    // Travelling toward a roost, den, home, or shelter is still an awake
    // physical action.  RESTING begins only after the authenticated owner says
    // the body has actually arrived.
    if (!input.restDestination.arrived) {
      transition("awake", cause, referenceId);
      return;
    }
    if (nextState === "awake") {
      transition("resting", cause, referenceId);
      return;
    }
    if (
      nextState === "resting"
      && input.restDestination.arrived
      && input.atTick - enteredAtTick >= profile.settleTicks
    ) transition("asleep", "settled", input.restDestination.destinationId);
  }

  const posture = Object.freeze({ state: nextState, enteredAtTick });
  const nextEvaluationTick = nextEvaluationFor(
    input.subjectId,
    input.atTick,
    profile.evaluationCadenceTicks,
  );
  if (nextEvaluationTick === null) return null;
  return deepFreeze({
    version: LIVING_CIRCADIAN_VERSION,
    ownerId: LIVING_CIRCADIAN_OWNER_ID,
    subjectId: input.subjectId,
    atTick: input.atTick,
    worldTime,
    profileId: input.policy.profileId,
    wakeSensitivity: input.policy.wakeSensitivity,
    policy: input.policy,
    restDestinationId: input.restDestination.destinationId,
    restDestinationArrived: input.restDestination.arrived,
    phaseOffsetTicks,
    clockPreference,
    effectivePreference,
    activatingDriver: activeSignal?.driver ?? null,
    posture,
    action: actionFor(
      posture,
      input.restDestination.arrived,
      effectivePreference,
    ),
    transitionCause,
    causeReferenceId,
    nextEvaluationTick,
  });
}

export function livingCircadianPersistentStateFromProjection(
  projection: LivingCircadianProjection,
): LivingCircadianPersistentState {
  return deepFreeze({
    version: LIVING_CIRCADIAN_VERSION,
    ownerId: LIVING_CIRCADIAN_OWNER_ID,
    policy: projection.policy,
    restDestinationId: projection.restDestinationId,
    restDestinationArrived: projection.restDestinationArrived,
    posture: projection.posture,
  });
}

function validInput(input: ProjectLivingCircadianInput): boolean {
  if (
    !validId(input.subjectId)
    || !nonnegativeSafeInteger(input.atTick)
    || (input.mode !== "full" && input.mode !== "coarse")
    || !validPolicy(input.policy)
    || !LIVING_CIRCADIAN_STATES.includes(input.current.state)
    || !nonnegativeSafeInteger(input.current.enteredAtTick)
    || input.current.enteredAtTick > input.atTick
    || !validId(input.restDestination.destinationId)
    || typeof input.restDestination.arrived !== "boolean"
    || !Array.isArray(input.driverSignals)
    || !input.driverSignals.every((signal) => validDriverSignal(signal, input))
    || !validOverride(input.priorityOverride)
    || !validDisturbance(input.disturbance, input.atTick)
  ) return false;
  // Coarse simulation has no lawful new perception/contact channel. Its known
  // needs, commitments, clock, tide, and weather may still advance normally.
  if (input.mode === "coarse" && input.disturbance !== null) return false;
  return !(input.mode === "coarse" && input.driverSignals.some((signal) => (
    signal.source === "lawful-observation"
  )));
}

function validPolicy(policy: LivingCircadianPolicy): boolean {
  return canonicalizeLivingCircadianPolicy(policy) !== null;
}

function validDriverSignal(
  signal: LivingCircadianDriverSignal,
  input: ProjectLivingCircadianInput,
): boolean {
  const driver = signal.driver as LivingCircadianDriver;
  if (
    !LIVING_CIRCADIAN_DRIVERS.includes(driver)
    || driver === "clock"
    || !input.policy.drivers.includes(driver)
    || !validId(signal.referenceId)
    || signal.sampledAtTick !== input.atTick
  ) return false;
  return driver === "opportunity"
    ? signal.source === "lawful-observation"
    : signal.source === "authoritative-environment";
}

function validDisturbance(
  disturbance: LivingCircadianDisturbance | null,
  atTick: number,
): boolean {
  return disturbance === null || (
    (disturbance.source === "lawful-perception"
      || disturbance.source === "physical-contact"
      || disturbance.source === "authoritative-local-hazard")
    && validId(disturbance.referenceId)
    && disturbance.observedAtTick === atTick
    && fixedPoint(disturbance.intensity)
  );
}

function validOverride(value: LivingCircadianPriorityOverride | null): boolean {
  if (value === null) return true;
  if (
    (value.kind !== "urgent-need"
      && value.kind !== "dangerous-weather"
      && value.kind !== "active-commitment")
    || !validId(value.referenceId)
    || (value.preference !== "active" && value.preference !== "rest")
  ) return false;
  return value.kind !== "active-commitment" || value.preference === "active";
}

function actionFor(
  posture: LivingCircadianPosture,
  arrived: boolean,
  preference: LivingCircadianPreference,
): LivingCircadianAction {
  switch (posture.state) {
    case "awake": return preference === "rest" && !arrived
      ? "travel-to-rest-destination"
      : "remain-active";
    case "startled": return "respond-to-disturbance";
    case "asleep": return arrived ? "sleep-at-rest-destination" : "travel-to-rest-destination";
    case "resting": return arrived
      ? "settle-at-rest-destination"
      : "travel-to-rest-destination";
  }
}

function nextEvaluationFor(
  subjectId: string,
  atTick: number,
  cadenceTicks: number,
): number | null {
  const slot = stableWord("cadence", subjectId, String(cadenceTicks)) % cadenceTicks;
  const remainder = atTick % cadenceTicks;
  let delta = (slot - remainder + cadenceTicks) % cadenceTicks;
  if (delta === 0) delta = cadenceTicks;
  const result = atTick + delta;
  return Number.isSafeInteger(result) ? result : null;
}

function compareSignals(left: LivingCircadianDriverSignal, right: LivingCircadianDriverSignal): number {
  const driverOrder = DRIVER_ORDER.get(left.driver)! - DRIVER_ORDER.get(right.driver)!;
  return driverOrder !== 0 ? driverOrder : compareText(left.referenceId, right.referenceId);
}

function stableWord(domain: string, subjectId: string, profileId: string): number {
  return Number.parseInt(hashCanonical({ domain, owner: LIVING_CIRCADIAN_OWNER_ID, profileId, subjectId }).slice(0, 8), 16) >>> 0;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function fixedPoint(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, any>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort(compareText);
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort(compareText)[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
