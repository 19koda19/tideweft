import {
  canonicalizeActorObservations,
  canonicalizeActorPerceptionState,
  type ActorObservation,
} from "./actorPerception";
import {
  FIXED_POINT,
  type ResidentNeeds,
  type ResidentState,
} from "./types";
import { hashCanonical } from "./util";
import {
  WORLD_DAWN_START_TICK,
  WORLD_DAY_START_TICK,
  WORLD_DUSK_START_TICK,
  WORLD_NIGHT_START_TICK,
  WORLD_TICKS_PER_DAY,
  projectWorldTime,
} from "./worldTime";

/** Shared persistent contract; clock projection remains in the game adapter. */
export const LIVING_CIRCADIAN_VERSION = 1 as const;
export const LIVING_CIRCADIAN_OWNER_ID = "game:living-circadian:v1" as const;

export const LIVING_CIRCADIAN_PROFILE_IDS = Object.freeze([
  "day-active",
  "night-active",
  "twilight-active",
  "adaptive-active",
] as const);
export type LivingCircadianProfileId = (typeof LIVING_CIRCADIAN_PROFILE_IDS)[number];

export const LIVING_CIRCADIAN_DRIVERS = Object.freeze([
  "clock",
  "tide",
  "weather",
  "opportunity",
] as const);
export type LivingCircadianDriver = (typeof LIVING_CIRCADIAN_DRIVERS)[number];

export const LIVING_CIRCADIAN_STATES = Object.freeze([
  "awake",
  "resting",
  "asleep",
  "startled",
] as const);
export type LivingCircadianState = (typeof LIVING_CIRCADIAN_STATES)[number];
export type LivingCircadianRhythm = "diurnal" | "nocturnal" | "crepuscular" | "adaptive";
export type LivingCircadianPreference = "active" | "rest";

interface LivingCircadianWindow {
  readonly startTick: number;
  /** May be below startTick to represent a window crossing midnight. */
  readonly endTick: number;
}

export interface LivingCircadianProfile {
  readonly id: LivingCircadianProfileId;
  readonly rhythm: LivingCircadianRhythm;
  readonly evaluationCadenceTicks: number;
  readonly settleTicks: number;
  readonly startledHoldTicks: number;
  readonly defaultWakeSensitivity: number;
  /** Stable per-subject displacement around authored clock windows. */
  readonly phaseVariationTicks: number;
  readonly schedule:
    | Readonly<{
        readonly kind: "active-windows";
        readonly windows: readonly LivingCircadianWindow[];
      }>
    | Readonly<{
        readonly kind: "staggered-rest-window";
        readonly durationTicks: number;
      }>;
}

/** Four shared routines, not species schedulers. */
export const LIVING_CIRCADIAN_PROFILES: readonly LivingCircadianProfile[] = deepFreeze([
  {
    id: "day-active",
    rhythm: "diurnal",
    evaluationCadenceTicks: 7,
    settleTicks: 21,
    startledHoldTicks: 4,
    defaultWakeSensitivity: 450_000,
    phaseVariationTicks: 30,
    schedule: {
      kind: "active-windows",
      windows: [{ startTick: WORLD_DAWN_START_TICK, endTick: WORLD_NIGHT_START_TICK }],
    },
  },
  {
    id: "night-active",
    rhythm: "nocturnal",
    evaluationCadenceTicks: 7,
    settleTicks: 21,
    startledHoldTicks: 4,
    defaultWakeSensitivity: 400_000,
    phaseVariationTicks: 30,
    schedule: {
      kind: "active-windows",
      windows: [{ startTick: WORLD_NIGHT_START_TICK, endTick: WORLD_DAWN_START_TICK }],
    },
  },
  {
    id: "twilight-active",
    rhythm: "crepuscular",
    evaluationCadenceTicks: 5,
    settleTicks: 20,
    startledHoldTicks: 4,
    defaultWakeSensitivity: 425_000,
    phaseVariationTicks: 20,
    schedule: {
      kind: "active-windows",
      windows: [
        { startTick: WORLD_DAWN_START_TICK - 60, endTick: WORLD_DAY_START_TICK + 60 },
        { startTick: WORLD_DUSK_START_TICK - 60, endTick: WORLD_NIGHT_START_TICK + 60 },
      ],
    },
  },
  {
    id: "adaptive-active",
    rhythm: "adaptive",
    evaluationCadenceTicks: 11,
    settleTicks: 22,
    startledHoldTicks: 4,
    defaultWakeSensitivity: 400_000,
    phaseVariationTicks: 0,
    schedule: { kind: "staggered-rest-window", durationTicks: 300 },
  },
]);

const PROFILE_BY_ID = new Map(LIVING_CIRCADIAN_PROFILES.map((profile) => [profile.id, profile]));

export interface LivingCircadianPolicy {
  readonly version: typeof LIVING_CIRCADIAN_VERSION;
  readonly ownerId: typeof LIVING_CIRCADIAN_OWNER_ID;
  readonly profileId: LivingCircadianProfileId;
  readonly drivers: readonly LivingCircadianDriver[];
  /** Fixed-point disturbance strength required to wake/startle this binding. */
  readonly wakeSensitivity: number;
}

export interface LivingCircadianPosture {
  readonly state: LivingCircadianState;
  /** Reuses an actor's existing persisted intent/activity entered-at tick. */
  readonly enteredAtTick: number;
}

/**
 * Small durable posture record embedded by a physical actor owner. It stores
 * no clock, coordinates, perception, or needs; those remain authoritative in
 * their existing owners and are supplied again for every projection.
 */
export interface LivingCircadianPersistentState {
  readonly version: typeof LIVING_CIRCADIAN_VERSION;
  readonly ownerId: typeof LIVING_CIRCADIAN_OWNER_ID;
  readonly policy: LivingCircadianPolicy;
  readonly restDestinationId: string;
  readonly restDestinationArrived: boolean;
  readonly posture: LivingCircadianPosture;
}

/**
 * Persisted receipt authority. The legacy literal is intentionally retained:
 * changing it would rewrite every existing resident's opaque receipt ID.
 */
export const RESIDENT_SETTLEMENT_REST_NETWORK_OWNER_ID =
  "sim:resident-home-rest-destination:v1" as const;

/** @deprecated Use RESIDENT_SETTLEMENT_REST_NETWORK_OWNER_ID. */
export const RESIDENT_HOME_REST_DESTINATION_OWNER_ID =
  RESIDENT_SETTLEMENT_REST_NETWORK_OWNER_ID;

export const RESIDENT_CIRCADIAN_URGENT_FOOD_NEED = 760_000 as const;
export const RESIDENT_CIRCADIAN_URGENT_REST_NEED = 750_000 as const;
export const RESIDENT_CIRCADIAN_URGENT_BELONGING_NEED = 760_000 as const;
export const RESIDENT_CIRCADIAN_URGENT_EXHAUSTION = 720_000 as const;

/** The current compatibility-human roster uses the shared diurnal profile. */
export const RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY: LivingCircadianPolicy = deepFreeze({
  version: LIVING_CIRCADIAN_VERSION,
  ownerId: LIVING_CIRCADIAN_OWNER_ID,
  profileId: "day-active",
  drivers: ["clock"],
  wakeSensitivity: livingCircadianProfile("day-active").defaultWakeSensitivity,
});

export interface ResidentCircadianUrgentPreference {
  readonly referenceId: "need:food" | "need:rest" | "condition:exhaustion" | "need:belonging";
  readonly preference: LivingCircadianPreference;
}

/**
 * Current cognition states that amount to active watch/search work. Weak
 * noticed or suspicious states remain compatible with settling; a resident
 * does not lose an entire night merely for hearing something uncertain.
 */
export function residentCircadianWatchReference(
  perceptionValue: unknown,
): string | null {
  const perception = canonicalizeActorPerceptionState(perceptionValue);
  if (perception === null) return null;
  switch (perception.suspicion) {
    case "identified":
    case "alert":
    case "searching":
      return `perception:${perception.suspicion}`;
    case "unaware":
    case "noticed":
    case "suspicious":
      return null;
  }
}

export interface ResidentCircadianBinding {
  readonly residentStableId: string;
  readonly homeSettlementId: number;
  readonly atTick: number;
  readonly arrivedAtSettlementRest: boolean;
}

export interface ReplaceResidentCircadianInput {
  /** Receipt projection and resident cognition must share this world tick. */
  readonly atTick: number;
  readonly circadian: LivingCircadianPersistentState;
}

export interface GateResidentCircadianObservationsInput {
  /** Post-command resident state at the authoritative perception ingress. */
  readonly resident: ResidentState;
  readonly targetTick: number;
  readonly observations: readonly ActorObservation[];
}

/** Strict shared policy parser used by both the simulation owner and game projector. */
export function canonicalizeLivingCircadianPolicy(
  value: unknown,
): LivingCircadianPolicy | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["drivers", "ownerId", "profileId", "version", "wakeSensitivity"])
    || value.version !== LIVING_CIRCADIAN_VERSION
    || value.ownerId !== LIVING_CIRCADIAN_OWNER_ID
    || !LIVING_CIRCADIAN_PROFILE_IDS.includes(value.profileId as LivingCircadianProfileId)
    || !Array.isArray(value.drivers)
    || value.drivers.length === 0
    || !value.drivers.every((driver) => (
      typeof driver === "string"
      && LIVING_CIRCADIAN_DRIVERS.includes(driver as LivingCircadianDriver)
    ))
    || !value.drivers.includes("clock")
    || new Set(value.drivers).size !== value.drivers.length
    || !fixedPoint(value.wakeSensitivity)
    || value.wakeSensitivity === 0
  ) return null;
  const drivers = [...value.drivers] as LivingCircadianDriver[];
  drivers.sort((left, right) => (
    LIVING_CIRCADIAN_DRIVERS.indexOf(left) - LIVING_CIRCADIAN_DRIVERS.indexOf(right)
  ));
  if (drivers.some((driver, index) => driver !== value.drivers[index])) return null;
  return deepFreeze({
    version: LIVING_CIRCADIAN_VERSION,
    ownerId: LIVING_CIRCADIAN_OWNER_ID,
    profileId: value.profileId as LivingCircadianProfileId,
    drivers,
    wakeSensitivity: value.wakeSensitivity,
  });
}

/** Strict parser for the species-neutral durable receipt. */
export function canonicalizeLivingCircadianPersistentState(
  value: unknown,
): LivingCircadianPersistentState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "ownerId",
    "policy",
    "posture",
    "restDestinationArrived",
    "restDestinationId",
    "version",
  ])) return null;
  const policy = canonicalizeLivingCircadianPolicy(value.policy);
  if (
    value.version !== LIVING_CIRCADIAN_VERSION
    || value.ownerId !== LIVING_CIRCADIAN_OWNER_ID
    || policy === null
    || !validId(value.restDestinationId)
    || typeof value.restDestinationArrived !== "boolean"
    || !plainRecord(value.posture)
    || !exactKeys(value.posture, ["enteredAtTick", "state"])
    || !LIVING_CIRCADIAN_STATES.includes(value.posture.state as LivingCircadianState)
    || !nonnegativeSafeInteger(value.posture.enteredAtTick)
    || (
      value.restDestinationArrived === false
      && (value.posture.state === "resting" || value.posture.state === "asleep")
    )
  ) return null;
  return deepFreeze({
    version: LIVING_CIRCADIAN_VERSION,
    ownerId: LIVING_CIRCADIAN_OWNER_ID,
    policy,
    restDestinationId: value.restDestinationId,
    restDestinationArrived: value.restDestinationArrived,
    posture: {
      state: value.posture.state as LivingCircadianState,
      enteredAtTick: value.posture.enteredAtTick,
    },
  });
}

export function livingCircadianProfile(
  profileId: LivingCircadianProfileId,
): LivingCircadianProfile {
  return PROFILE_BY_ID.get(profileId)!;
}

/** Stable variation is derived from identity, never call order, wall time, or loaded state. */
export function livingCircadianPhaseOffsetTicks(
  subjectId: string,
  profileId: LivingCircadianProfileId,
): number | null {
  const profile = PROFILE_BY_ID.get(profileId);
  if (!validId(subjectId) || profile === undefined) return null;
  const sample = stableWord("phase", subjectId, profileId);
  if (profile.schedule.kind === "staggered-rest-window") return sample % WORLD_TICKS_PER_DAY;
  const range = profile.phaseVariationTicks;
  return range === 0 ? 0 : (sample % (range * 2 + 1)) - range;
}

/**
 * Exact clock-only preference shared by the higher projector and simulation
 * physiology. Drivers, perception, weather, and commitments remain separate
 * higher-priority inputs.
 */
export function projectLivingCircadianClockPreference(
  subjectId: string,
  atTick: number,
  policy: LivingCircadianPolicy,
): LivingCircadianPreference | null {
  if (!validId(subjectId) || !nonnegativeSafeInteger(atTick)) return null;
  const canonicalPolicy = canonicalizeLivingCircadianPolicy(policy);
  const worldTime = projectWorldTime(atTick);
  if (canonicalPolicy === null || worldTime === null) return null;
  const profile = PROFILE_BY_ID.get(canonicalPolicy.profileId);
  const phaseOffsetTicks = livingCircadianPhaseOffsetTicks(
    subjectId,
    canonicalPolicy.profileId,
  );
  return profile === undefined || phaseOffsetTicks === null
    ? null
    : projectClockPreference(profile, worldTime.dayTick, phaseOffsetTicks);
}

/**
 * Returns the first clock-owned active tick after `fromTick`, bounded to one
 * civil day. Coarse recovery cannot silently cross this boundary.
 */
export function firstLivingCircadianActiveTick(
  subjectId: string,
  fromTick: number,
  throughTick: number,
  policy: LivingCircadianPolicy,
): number | null {
  const canonicalPolicy = canonicalizeLivingCircadianPolicy(policy);
  if (
    !validId(subjectId)
    || !nonnegativeSafeInteger(fromTick)
    || !nonnegativeSafeInteger(throughTick)
    || throughTick <= fromTick
    || canonicalPolicy === null
  ) return null;
  const profile = PROFILE_BY_ID.get(canonicalPolicy.profileId)!;
  const offset = livingCircadianPhaseOffsetTicks(subjectId, canonicalPolicy.profileId);
  if (offset === null) return null;
  const maximumDelta = Math.min(WORLD_TICKS_PER_DAY, throughTick - fromTick);
  for (let delta = 1; delta <= maximumDelta; delta += 1) {
    const tick = fromTick + delta;
    if (!Number.isSafeInteger(tick)) return null;
    const dayTick = tick % WORLD_TICKS_PER_DAY;
    if (projectClockPreference(profile, dayTick, offset) === "active") return tick;
  }
  return null;
}

/** Exact resident need precedence shared by projection and rest physiology. */
export function residentCircadianUrgentPreference(
  inputValue: Readonly<{
    readonly needs: Readonly<ResidentNeeds>;
    readonly exhaustion: number;
  }>,
): ResidentCircadianUrgentPreference | null {
  const input: unknown = inputValue;
  if (
    !plainRecord(input)
    || !exactKeys(input, ["exhaustion", "needs"])
    || !plainRecord(input.needs)
    || !exactKeys(input.needs, ["belonging", "food", "rest"])
    || !fixedPoint(input.needs.food)
    || !fixedPoint(input.needs.rest)
    || !fixedPoint(input.needs.belonging)
    || !fixedPoint(input.exhaustion)
  ) return null;
  const candidates: Array<Readonly<{
    score: number;
    order: number;
    referenceId: ResidentCircadianUrgentPreference["referenceId"];
    preference: LivingCircadianPreference;
  }>> = [];
  if (input.needs.food >= RESIDENT_CIRCADIAN_URGENT_FOOD_NEED) {
    candidates.push({
      score: input.needs.food,
      order: 0,
      referenceId: "need:food",
      preference: "active",
    });
  }
  const restPressure = Math.max(input.needs.rest, input.exhaustion);
  if (
    input.needs.rest >= RESIDENT_CIRCADIAN_URGENT_REST_NEED
    || input.exhaustion >= RESIDENT_CIRCADIAN_URGENT_EXHAUSTION
  ) {
    candidates.push({
      score: restPressure,
      order: 1,
      referenceId: input.exhaustion > input.needs.rest
        ? "condition:exhaustion"
        : "need:rest",
      preference: "rest",
    });
  }
  if (input.needs.belonging >= RESIDENT_CIRCADIAN_URGENT_BELONGING_NEED) {
    candidates.push({
      score: input.needs.belonging,
      order: 2,
      referenceId: "need:belonging",
      preference: "active",
    });
  }
  candidates.sort((left, right) => right.score - left.score || left.order - right.order);
  const selected = candidates[0];
  return selected === undefined
    ? null
    : Object.freeze({
        referenceId: selected.referenceId,
        preference: selected.preference,
      });
}

/**
 * Opaque reciprocal-rest-network identity shared by invariants, physiology,
 * and game adapters. Home identity anchors membership, while current physical
 * location decides which settlement refuge the resident is using.
 *
 * The serialized prefix and hash shape deliberately retain their Alpha 51
 * bytes; this is a semantic API correction, not a save-schema migration.
 */
export function residentSettlementRestNetworkId(
  residentStableId: unknown,
  homeSettlementId: unknown,
): string | null {
  if (!validId(residentStableId) || !positiveSafeInteger(homeSettlementId)) return null;
  return `resident-home:${hashCanonical({
    homeSettlementId,
    ownerId: RESIDENT_SETTLEMENT_REST_NETWORK_OWNER_ID,
    residentStableId,
  })}`;
}

/** @deprecated Use residentSettlementRestNetworkId. */
export function residentHomeRestDestinationId(
  residentStableId: unknown,
  homeSettlementId: unknown,
): string | null {
  return residentSettlementRestNetworkId(residentStableId, homeSettlementId);
}

/**
 * Shared physical eligibility predicate. Settlement existence and reciprocal
 * network membership remain authenticated by the owning world's invariants;
 * this function accepts no route, active contract, or malformed resident.
 */
export function residentAtSettlementRestDestination(
  residentValue: unknown,
): boolean {
  if (
    !plainRecord(residentValue)
    || !positiveSafeInteger(residentValue.homeSettlementId)
    || !validResidentLocation(residentValue.location)
    || !(
      residentValue.activeContractId === null
      || positiveSafeInteger(residentValue.activeContractId)
    )
  ) return false;
  return residentValue.location.kind === "settlement"
    && residentValue.activeContractId === null;
}

/**
 * Adds resident ownership constraints to the generic receipt parser. This is
 * the single boundary used by world invariants and same-tick replacement.
 */
export function canonicalizeResidentCircadianState(
  value: unknown,
  bindingValue: ResidentCircadianBinding,
  allowPendingAwakeForeignArrival = false,
): LivingCircadianPersistentState | null {
  const binding: unknown = bindingValue;
  if (
    !plainRecord(binding)
    || !exactKeys(binding, [
      "arrivedAtSettlementRest",
      "atTick",
      "homeSettlementId",
      "residentStableId",
    ])
    || !validId(binding.residentStableId)
    || !positiveSafeInteger(binding.homeSettlementId)
    || !nonnegativeSafeInteger(binding.atTick)
    || typeof binding.arrivedAtSettlementRest !== "boolean"
    || typeof allowPendingAwakeForeignArrival !== "boolean"
  ) return null;
  const state = canonicalizeLivingCircadianPersistentState(value);
  const destinationId = residentSettlementRestNetworkId(
    binding.residentStableId,
    binding.homeSettlementId,
  );
  // Alpha 51 could persist an awake or startled visitor immediately after
  // delivery with the old home-only arrival bit still false. The owning
  // invariant/view boundary opts into this one foreign-arrival transition
  // explicitly. It grants no sleep or physiology and the simulation
  // reconciles it next tick.
  const pendingAwakeArrival = allowPendingAwakeForeignArrival
    && state?.restDestinationArrived === false
    && binding.arrivedAtSettlementRest
    && (state.posture.state === "awake" || state.posture.state === "startled");
  if (
    state === null
    || destinationId === null
    || state.restDestinationId !== destinationId
    || (
      state.restDestinationArrived !== binding.arrivedAtSettlementRest
      && !pendingAwakeArrival
    )
    || state.posture.enteredAtTick > binding.atTick
    || !samePolicy(state.policy, RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY)
  ) return null;
  return state;
}

/**
 * Authenticates an entire resident observation batch before applying the one
 * posture-owned channel rule: an actor still asleep at a settlement refuge
 * cannot see. The saved arrival bit authenticates the prior-tick receipt;
 * current location and contract state independently decide whether sleep
 * remains physically active after same-tick commands. Every nonvisual channel
 * remains available.
 */
export function gateResidentCircadianObservations(
  inputValue: GateResidentCircadianObservationsInput,
): readonly ActorObservation[] | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "observations",
    "resident",
    "targetTick",
  ])) return null;
  const resident = input.resident;
  if (
    !plainRecord(resident)
    || !plainRecord(resident.identity)
    || !plainRecord(resident.location)
    || !Array.isArray(input.observations)
    || !nonnegativeSafeInteger(input.targetTick)
    || !positiveSafeInteger(resident.homeSettlementId)
    || !(
      resident.activeContractId === null
      || positiveSafeInteger(resident.activeContractId)
    )
    || !validResidentLocation(resident.location)
  ) return null;
  const priorState = canonicalizeActorPerceptionState(resident.perception);
  if (
    priorState === null
    || priorState.actorId !== resident.identity.stableId
    || priorState.tick !== input.targetTick - 1
  ) return null;
  const observations = canonicalizeActorObservations(input.observations);
  if (
    observations.length !== input.observations.length
    || observations.some((observation) => (
      observation.observerId !== priorState.actorId
      || observation.observedAtTick !== input.targetTick
    ))
  ) return null;
  if (!Object.hasOwn(resident, "circadian")) return observations;

  const saved = canonicalizeLivingCircadianPersistentState(resident.circadian);
  if (saved === null) return null;
  const circadian = canonicalizeResidentCircadianState(saved, {
    residentStableId: priorState.actorId,
    homeSettlementId: resident.homeSettlementId,
    atTick: priorState.tick,
    // Commands already ran. Authenticate the receipt against the arrival fact
    // its owner actually saved, then consult current physical state below.
    arrivedAtSettlementRest: saved.restDestinationArrived,
  });
  if (circadian === null) return null;
  const stillAtRestDestination = residentAtSettlementRestDestination(resident);
  return circadian.posture.state === "asleep" && stillAtRestDestination
    ? Object.freeze(observations.filter(({ channel }) => channel !== "vision"))
    : observations;
}

/** Commits only a resident routine posture projected for the cognition's exact tick. */
export function replaceResidentCircadian(
  residentValue: ResidentState,
  replacementValue: ReplaceResidentCircadianInput,
): ResidentState {
  const resident: unknown = residentValue;
  const replacement: unknown = replacementValue;
  if (
    !plainRecord(resident)
    || !plainRecord(resident.identity)
    || !validId(resident.identity.stableId)
    || !positiveSafeInteger(resident.homeSettlementId)
    || !plainRecord(resident.perception)
    || resident.perception.actorId !== resident.identity.stableId
    || !nonnegativeSafeInteger(resident.perception.tick)
    || !plainRecord(resident.location)
    || !plainRecord(replacement)
    || !exactKeys(replacement, ["atTick", "circadian"])
    || !nonnegativeSafeInteger(replacement.atTick)
    || replacement.atTick !== resident.perception.tick
  ) throw new RangeError("Resident circadian replacement must share the resident's current tick");
  const arrivedAtSettlementRest = residentAtSettlementRestDestination(resident);
  const circadian = canonicalizeResidentCircadianState(replacement.circadian, {
    residentStableId: resident.identity.stableId,
    homeSettlementId: resident.homeSettlementId,
    atTick: replacement.atTick,
    arrivedAtSettlementRest,
  });
  if (circadian === null) {
    throw new RangeError("Resident circadian posture is malformed, unbound, or future-dated");
  }
  return { ...(residentValue as ResidentState), circadian };
}

function samePolicy(left: LivingCircadianPolicy, right: LivingCircadianPolicy): boolean {
  return left.version === right.version
    && left.ownerId === right.ownerId
    && left.profileId === right.profileId
    && left.wakeSensitivity === right.wakeSensitivity
    && left.drivers.length === right.drivers.length
    && left.drivers.every((driver, index) => driver === right.drivers[index]);
}

function projectClockPreference(
  profile: LivingCircadianProfile,
  dayTick: number,
  phaseOffsetTicks: number,
): LivingCircadianPreference {
  if (profile.schedule.kind === "staggered-rest-window") {
    return inWindow(dayTick, phaseOffsetTicks, (
      phaseOffsetTicks + profile.schedule.durationTicks
    ) % WORLD_TICKS_PER_DAY) ? "rest" : "active";
  }
  const shiftedTick = wrapDayTick(dayTick - phaseOffsetTicks);
  return profile.schedule.windows.some((window) => (
    inWindow(shiftedTick, window.startTick, window.endTick)
  )) ? "active" : "rest";
}

function inWindow(dayTick: number, startTick: number, endTick: number): boolean {
  const start = wrapDayTick(startTick);
  const end = wrapDayTick(endTick);
  return start < end
    ? dayTick >= start && dayTick < end
    : dayTick >= start || dayTick < end;
}

function stableWord(domain: string, subjectId: string, profileId: string): number {
  return Number.parseInt(hashCanonical({
    domain,
    owner: LIVING_CIRCADIAN_OWNER_ID,
    profileId,
    subjectId,
  }).slice(0, 8), 16) >>> 0;
}

function wrapDayTick(value: number): number {
  return ((value % WORLD_TICKS_PER_DAY) + WORLD_TICKS_PER_DAY) % WORLD_TICKS_PER_DAY;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function fixedPoint(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && !Object.is(value, -0);
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
  const sortedExpected = [...expected].sort(compareText);
  return keys.length === sortedExpected.length
    && keys.every((key, index) => key === sortedExpected[index]);
}

function validResidentLocation(value: Record<string, any>): boolean {
  if (value.kind === "settlement") {
    return exactKeys(value, ["kind", "settlementId"])
      && positiveSafeInteger(value.settlementId);
  }
  if (value.kind === "route") {
    return exactKeys(value, ["kind", "progress", "routeId"])
      && positiveSafeInteger(value.routeId)
      && fixedPoint(value.progress);
  }
  return false;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
