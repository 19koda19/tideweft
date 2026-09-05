import type { WorldPosition } from "../game/worldPosition";
import { REGION_COORD_LIMIT, isRegionCoord } from "./regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./types";

/**
 * Pure authoritative cognition primitives for the first shared-perception
 * slice. F0 connects these only to the existing humans; later actor types may
 * adopt the same contract without changing its ownership.
 */
export const PRIOR_ACTOR_PERCEPTION_VERSION = 1 as const;
export const ACTOR_PERCEPTION_VERSION = 2 as const;
/** All persisted cognition strengths are integer fixed-point on this scale. */
export const ACTOR_PERCEPTION_SCALE = 1_000_000 as const;
export const ACTOR_ATTENTION_CAP = 4 as const;
export const ACTOR_BELIEF_CAP = 24 as const;
export const ACTOR_SALIENT_MEMORY_CAP = 16 as const;
export const MAX_ACTOR_OBSERVATIONS_PER_STEP = 128 as const;
/** Shared stable-actor identity envelope, including lossless regional dog IDs. */
export const ACTOR_ID_MAX_LENGTH = 192 as const;
export const WORLD_POSITION_UNITS_PER_TILE = 1_000 as const;
export const MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS = 250 as const;
export const MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS = 1_000 as const;

/** All planned channels share one vocabulary; only implemented channels enter cognition. */
export const OBSERVATION_CHANNELS = Object.freeze([
  "vision",
  "hearing",
  "scent",
  "touch",
  "evidence",
  "social",
] as const);
export const ACTOR_OBSERVATION_CHANNELS = Object.freeze([
  "vision",
  "hearing",
  "scent",
] as const);
/** Compatibility alias for the first shared-perception implementation. */
export const F0_OBSERVATION_CHANNELS = ACTOR_OBSERVATION_CHANNELS;

export type ObservationChannel = (typeof OBSERVATION_CHANNELS)[number];
export type ActorObservationChannel = (typeof ACTOR_OBSERVATION_CHANNELS)[number];
/** Compatibility alias retained for consumers of the first implementation. */
export type F0ObservationChannel = ActorObservationChannel;
export type ObservationIdentification = "anonymous" | "classified" | "identified";
export type ObservationInterrupt = "none" | "strong";
export type ActorSuspicionState =
  | "unaware"
  | "noticed"
  | "suspicious"
  | "identified"
  | "alert"
  | "searching";

export interface ObservedArea {
  readonly center: WorldPosition;
  /** Zero is an exact visual position. Heard and scented contacts require uncertainty. */
  readonly radiusUnits: number;
}

/** One local sensory event. It contains perception, never world-truth intent. */
export interface ActorObservation {
  readonly version: typeof ACTOR_PERCEPTION_VERSION;
  readonly id: string;
  readonly observerId: string;
  readonly observedAtTick: number;
  readonly channel: ActorObservationChannel;
  readonly perceivedClass: string;
  /** Hearing and scent never expose the authoritative source identity. */
  readonly subjectId: string | null;
  readonly area: ObservedArea;
  /** Integer fixed-point 0..ACTOR_PERCEPTION_SCALE. */
  readonly confidence: number;
  /** Integer fixed-point 0..ACTOR_PERCEPTION_SCALE. */
  readonly salience: number;
  readonly identification: ObservationIdentification;
  readonly interrupt: ObservationInterrupt;
}

export interface ActorObservationInput {
  readonly id: string;
  readonly observerId: string;
  readonly observedAtTick: number;
  readonly channel: ObservationChannel;
  readonly perceivedClass: string;
  readonly subjectId?: string | null;
  readonly area: ObservedArea;
  readonly confidence: number;
  readonly salience: number;
  readonly identification: ObservationIdentification;
  readonly interrupt?: ObservationInterrupt;
}

/** A bounded, channel-neutral belief produced only from accepted observations. */
export interface ActorBelief {
  readonly key: string;
  readonly channel: ActorObservationChannel;
  readonly perceivedClass: string;
  readonly subjectId: string | null;
  readonly area: ObservedArea;
  /** Integer fixed-point 0..ACTOR_PERCEPTION_SCALE. */
  readonly confidence: number;
  /** Integer fixed-point 0..ACTOR_PERCEPTION_SCALE. */
  readonly salience: number;
  readonly identification: ObservationIdentification;
  readonly firstObservedTick: number;
  readonly lastObservedTick: number;
  readonly sourceObservationId: string;
  /** Interrupt strength is fresh for one step and cannot pin attention forever. */
  readonly strongInterrupt: boolean;
}

export interface AgedActorBelief extends ActorBelief {
  readonly ageTicks: number;
}

export interface ActorSalientMemory {
  readonly observationId: string;
  readonly beliefKey: string;
  readonly channel: ActorObservationChannel;
  readonly perceivedClass: string;
  readonly subjectId: string | null;
  readonly area: ObservedArea;
  readonly observedAtTick: number;
  readonly salience: number;
}

export interface ActorSearchState {
  readonly beliefKey: string;
  readonly subjectId: string;
  /** This remains the saved observation, not a live target coordinate. */
  readonly lastKnownArea: ObservedArea;
  readonly lastObservedTick: number;
  readonly startedAtTick: number;
  readonly expiresAtTick: number;
  readonly initialConfidence: number;
  readonly probeOrdinal: number;
}

export interface ActorSearchQuery {
  readonly beliefKey: string;
  readonly subjectId: string;
  readonly lastKnownArea: ObservedArea;
  readonly ageTicks: number;
  readonly confidence: number;
  readonly searchRadiusUnits: number;
  /** Deterministic proposal derived solely from the saved belief. */
  readonly nextProbe: WorldPosition;
}

export interface ActorPerceptionState {
  readonly version: typeof ACTOR_PERCEPTION_VERSION;
  readonly actorId: string;
  readonly tick: number;
  readonly suspicion: ActorSuspicionState;
  /** Integer fixed-point 0..ACTOR_PERCEPTION_SCALE. */
  readonly suspicionPressure: number;
  /** Ordered best-first and capped independently from the belief store. */
  readonly attentionKeys: readonly string[];
  /** Canonical key order keeps serialization independent of input order. */
  readonly beliefs: readonly ActorBelief[];
  readonly salientMemory: readonly ActorSalientMemory[];
  readonly search: ActorSearchState | null;
}

export interface ActorPerceptionStepInput {
  readonly tick: number;
  readonly observations: readonly ActorObservation[];
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const CLASS_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_OBSERVED_AREA_RADIUS_UNITS = 10_000_000;
const MAX_SERIALIZED_STATE_CODE_UNITS = 256_000;
const BELIEF_CONFIDENCE_DECAY_PER_TICK = 35_000;
const BELIEF_SALIENCE_DECAY_PER_TICK = 50_000;
const SUSPICION_DECAY_PER_TICK = 80_000;
const MIN_ACTIVE_BELIEF_VALUE = 10_000;
const MIN_PRESSURE_SIGNAL = 160_000;
const NOTICE_ENTER = 200_000;
const NOTICE_EXIT = 80_000;
const SUSPICIOUS_ENTER = 450_000;
const SUSPICIOUS_EXIT = 280_000;
const ALERT_ENTER = 900_000;
const ALERT_EXIT = 550_000;
const MIN_SEARCH_DURATION_TICKS = 8;
const SEARCH_CONFIDENCE_DURATION_TICKS = 12;
const SEARCH_CONFIDENCE_DECAY_PER_TICK = 40_000;
const SEARCH_RADIUS_GROWTH_UNITS_PER_TICK = 500;
const MAX_SEARCH_RADIUS_UNITS = 24_000;
const REGION_WIDTH_UNITS = WORLD_WIDTH * WORLD_POSITION_UNITS_PER_TILE;
const REGION_HEIGHT_UNITS = WORLD_HEIGHT * WORLD_POSITION_UNITS_PER_TILE;
const REGION_LIMIT_BIGINT = BigInt(REGION_COORD_LIMIT);

/** Creates a validated frozen sensory observation, or null without partial recovery. */
export function createActorObservation(input: ActorObservationInput): ActorObservation | null {
  if (!plainRecord(input)) return null;
  return canonicalObservation({
    version: ACTOR_PERCEPTION_VERSION,
    id: input.id,
    observerId: input.observerId,
    observedAtTick: input.observedAtTick,
    channel: input.channel,
    perceivedClass: input.perceivedClass,
    subjectId: input.subjectId ?? null,
    area: input.area,
    confidence: input.confidence,
    salience: input.salience,
    identification: input.identification,
    interrupt: input.interrupt ?? "none",
  });
}

/**
 * Canonicalizes and orders observations. One malformed/colliding entry rejects
 * the whole batch so a corrupt input cannot become selective actor knowledge.
 */
export function canonicalizeActorObservations(value: unknown): readonly ActorObservation[] {
  const result = canonicalObservationBatch(value);
  return result.valid ? result.values : EMPTY_OBSERVATIONS;
}

export function createActorPerceptionState(actorId: string, tick = 0): ActorPerceptionState {
  if (!validId(actorId)) throw new TypeError("Actor perception requires a canonical actor ID");
  if (!nonnegativeSafeInteger(tick)) {
    throw new RangeError("Actor perception tick must be a nonnegative safe integer");
  }
  return freezeState({
    version: ACTOR_PERCEPTION_VERSION,
    actorId,
    tick,
    suspicion: "unaware",
    suspicionPressure: 0,
    attentionKeys: EMPTY_KEYS,
    beliefs: EMPTY_BELIEFS,
    salientMemory: EMPTY_MEMORY,
    search: null,
  });
}

/**
 * Strictly validates persisted shape and restores canonical ordering. Version
 * 1 states are explicitly adopted into version 2 only when they contain the
 * original vision/hearing channel domain; scent cannot be smuggled backward.
 */
export function canonicalizeActorPerceptionState(value: unknown): ActorPerceptionState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "actorId",
    "attentionKeys",
    "beliefs",
    "salientMemory",
    "search",
    "suspicion",
    "suspicionPressure",
    "tick",
    "version",
  ])) return null;
  if (
    !isReadablePerceptionVersion(value.version)
    || !validId(value.actorId)
    || !nonnegativeSafeInteger(value.tick)
    || !isSuspicion(value.suspicion)
    || !scaledUnit(value.suspicionPressure)
    || !Array.isArray(value.attentionKeys)
    || value.attentionKeys.length > ACTOR_ATTENTION_CAP
    || !Array.isArray(value.beliefs)
    || value.beliefs.length > ACTOR_BELIEF_CAP
    || !Array.isArray(value.salientMemory)
    || value.salientMemory.length > ACTOR_SALIENT_MEMORY_CAP
  ) return null;

  const beliefs: ActorBelief[] = [];
  const beliefKeys = new Set<string>();
  for (const raw of value.beliefs) {
    const belief = canonicalBelief(raw, value.tick, value.version);
    if (belief === null || beliefKeys.has(belief.key)) return null;
    beliefKeys.add(belief.key);
    beliefs.push(belief);
  }
  beliefs.sort(compareBeliefStorage);

  const suppliedAttention = new Set<string>();
  for (const raw of value.attentionKeys) {
    if (!validBeliefKey(raw) || suppliedAttention.has(raw) || !beliefKeys.has(raw)) return null;
    suppliedAttention.add(raw);
  }

  const memory: ActorSalientMemory[] = [];
  const memoryIds = new Set<string>();
  const memoryBeliefKeys = new Set<string>();
  for (const raw of value.salientMemory) {
    const item = canonicalMemory(raw, value.tick);
    if (
      item === null
      || memoryIds.has(item.observationId)
      || memoryBeliefKeys.has(item.beliefKey)
    ) return null;
    memoryIds.add(item.observationId);
    memoryBeliefKeys.add(item.beliefKey);
    memory.push(item);
  }
  memory.sort(compareMemory);

  const search = value.search === null ? null : canonicalSearch(value.search, value.tick);
  if (value.search !== null && search === null) return null;
  if (search !== null) {
    const source = beliefs.find((belief) => belief.key === search.beliefKey);
    if (
      source === undefined
      || source.subjectId !== search.subjectId
      || source.identification !== "identified"
      || source.lastObservedTick !== search.lastObservedTick
      || !sameArea(source.area, search.lastKnownArea)
      || source.confidence !== decayScaled(
        search.initialConfidence,
        BELIEF_CONFIDENCE_DECAY_PER_TICK,
        value.tick - search.startedAtTick,
      )
    ) return null;
  }
  if ((value.suspicion === "searching") !== (search !== null)) return null;

  const attentionKeys = selectAttention(beliefs).map((belief) => belief.key);
  return freezeState({
    version: ACTOR_PERCEPTION_VERSION,
    actorId: value.actorId,
    tick: value.tick,
    suspicion: value.suspicion,
    suspicionPressure: value.suspicionPressure,
    attentionKeys,
    beliefs,
    salientMemory: memory,
    search,
  });
}

/**
 * Advances one actor using only its previous cognition and supplied local
 * observations. Invalid step data is a closed no-op; invalid state returns null.
 */
export function stepActorPerception(
  state: unknown,
  input: unknown,
): ActorPerceptionState | null {
  const current = canonicalizeActorPerceptionState(state);
  if (current === null) return null;
  const step = canonicalStepInput(input, current);
  if (step === null) return current;

  const elapsed = step.tick - current.tick;
  const selectedByBelief = selectObservationPerBelief(step.observations);
  const currentKeys = new Set(selectedByBelief.map((observation) => beliefKeyFor(observation)));
  const currentStrong = selectedByBelief.filter((observation) => observation.interrupt === "strong");

  const beliefByKey = new Map<string, ActorBelief>();
  for (const previous of current.beliefs) {
    const confidence = decayScaled(
      previous.confidence,
      BELIEF_CONFIDENCE_DECAY_PER_TICK,
      elapsed,
    );
    const salience = decayScaled(
      previous.salience,
      BELIEF_SALIENCE_DECAY_PER_TICK,
      elapsed,
    );
    if (
      Math.max(confidence, salience) < MIN_ACTIVE_BELIEF_VALUE
      && current.search?.beliefKey !== previous.key
    ) continue;
    beliefByKey.set(previous.key, freezeBelief({
      ...previous,
      confidence,
      salience,
      strongInterrupt: false,
    }));
  }

  for (const observation of selectedByBelief) {
    const key = beliefKeyFor(observation);
    const previous = beliefByKey.get(key)
      ?? current.beliefs.find((belief) => belief.key === key);
    beliefByKey.set(key, beliefFromObservation(observation, previous));
  }

  let beliefs = selectBeliefs([...beliefByKey.values()], current.search?.beliefKey ?? null);
  let suspicionPressure = decayScaled(
    current.suspicionPressure,
    SUSPICION_DECAY_PER_TICK,
    elapsed,
  );
  const strongestSignal = selectedByBelief.reduce(
    (best, observation) => Math.max(best, observationStrength(observation)),
    0,
  );
  if (strongestSignal >= MIN_PRESSURE_SIGNAL) {
    suspicionPressure = Math.max(suspicionPressure, strongestSignal);
  }
  if (currentStrong.length > 0) suspicionPressure = ACTOR_PERCEPTION_SCALE;

  const identifiedVisual = selectBestObservation(selectedByBelief.filter(
    (observation) => observation.channel === "vision"
      && observation.identification === "identified"
      && observation.subjectId !== null,
  ));
  const searchReacquisition = current.search === null
    ? null
    : selectBestObservation(selectedByBelief.filter(
      (observation) => observation.channel === "vision"
        && observation.identification === "identified"
        && observation.subjectId === current.search?.subjectId,
    ));

  let search: ActorSearchState | null = current.search;
  let suspicion: ActorSuspicionState;

  if (currentStrong.length > 0) {
    // A strong local interrupt lawfully preempts the old focus. It does not
    // infer an identity or exact source from an anonymous sound.
    search = null;
    suspicion = "alert";
  } else if (searchReacquisition !== null) {
    search = null;
    suspicion = "identified";
  } else if (search !== null) {
    if (step.tick >= search.expiresAtTick) {
      search = null;
      suspicion = suspicionFromPressure(current.suspicion, suspicionPressure);
    } else {
      search = freezeSearch({
        ...search,
        probeOrdinal: Math.min(Number.MAX_SAFE_INTEGER, search.probeOrdinal + 1),
      });
      suspicion = "searching";
    }
  } else if (identifiedVisual !== null) {
    suspicion = "identified";
  } else {
    const attendedBeliefs = current.attentionKeys.flatMap((key) => {
      const belief = current.beliefs.find((candidate) => candidate.key === key);
      return belief === undefined ? [] : [belief];
    });
    // Direct identification remains the tracked focus even when an ordinary,
    // anonymous contact is momentarily more salient. A strong interrupt sets
    // ALERT and deliberately keeps its top-focus preemption semantics.
    const previousFocus = current.suspicion === "identified"
      ? attendedBeliefs.find((belief) => (
          belief.subjectId !== null && belief.identification === "identified"
        ))
      : attendedBeliefs[0];
    const lostTrack = (current.suspicion === "identified" || current.suspicion === "alert")
      && previousFocus?.subjectId !== null
      && previousFocus?.subjectId !== undefined
      && !currentKeys.has(previousFocus.key);
    if (lostTrack) {
      // Begin search from the belief after it has aged into this step. A
      // prior-state confidence becomes stale when another interrupt delays
      // this loss-of-track transition.
      const searchFocus = beliefByKey.get(previousFocus.key);
      const nextSearch = searchFocus === undefined
        ? null
        : createSearch(searchFocus, step.tick);
      if (nextSearch === null || searchFocus === undefined) {
        search = null;
        suspicion = suspicionFromPressure(current.suspicion, suspicionPressure);
      } else {
        search = nextSearch;
        suspicion = "searching";
        if (!beliefs.some((belief) => belief.key === previousFocus.key)) {
          beliefs = selectBeliefs([...beliefs, searchFocus], previousFocus.key);
        }
      }
    } else {
      suspicion = suspicionFromPressure(current.suspicion, suspicionPressure);
    }
  }

  const salientMemory = updateMemory(current.salientMemory, selectedByBelief);
  const attentionKeys = selectAttention(beliefs).map((belief) => belief.key);
  return freezeState({
    version: ACTOR_PERCEPTION_VERSION,
    actorId: current.actorId,
    tick: step.tick,
    suspicion,
    suspicionPressure,
    attentionKeys,
    beliefs,
    salientMemory,
    search,
  });
}

/** Best-first bounded attention with belief ages evaluated at the state tick. */
export function queryActorAttention(value: unknown): readonly AgedActorBelief[] {
  const state = canonicalizeActorPerceptionState(value);
  if (state === null) return EMPTY_AGED_BELIEFS;
  const byKey = new Map(state.beliefs.map((belief) => [belief.key, belief]));
  return Object.freeze(state.attentionKeys.flatMap((key) => {
    const belief = byKey.get(key);
    return belief === undefined ? [] : [ageBelief(belief, state.tick)];
  }));
}

export function queryActorBelief(value: unknown, key: unknown): AgedActorBelief | null {
  const state = canonicalizeActorPerceptionState(value);
  if (state === null || !validBeliefKey(key)) return null;
  const belief = state.beliefs.find((candidate) => candidate.key === key);
  return belief === undefined ? null : ageBelief(belief, state.tick);
}

export function queryActorSearch(value: unknown): ActorSearchQuery | null {
  const state = canonicalizeActorPerceptionState(value);
  if (state?.search === null || state === null) return null;
  const search = state.search;
  const ageTicks = state.tick - search.lastObservedTick;
  const searchAge = state.tick - search.startedAtTick;
  const confidence = decayScaled(
    search.initialConfidence,
    SEARCH_CONFIDENCE_DECAY_PER_TICK,
    searchAge,
  );
  const searchRadiusUnits = saturatingGrowth(
    search.lastKnownArea.radiusUnits,
    SEARCH_RADIUS_GROWTH_UNITS_PER_TICK,
    searchAge,
    MAX_SEARCH_RADIUS_UNITS,
  );
  return Object.freeze({
    beliefKey: search.beliefKey,
    subjectId: search.subjectId,
    lastKnownArea: cloneArea(search.lastKnownArea),
    ageTicks,
    confidence,
    searchRadiusUnits,
    nextProbe: searchProbe(state.actorId, search, searchRadiusUnits),
  });
}

export function queryActorSalientMemory(value: unknown): readonly ActorSalientMemory[] {
  const state = canonicalizeActorPerceptionState(value);
  return state === null ? EMPTY_MEMORY : state.salientMemory;
}

export function serializeActorPerceptionState(value: unknown): string | null {
  const state = canonicalizeActorPerceptionState(value);
  return state === null ? null : JSON.stringify(state);
}

export function deserializeActorPerceptionState(text: unknown): ActorPerceptionState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || text.length > MAX_SERIALIZED_STATE_CODE_UNITS
  ) return null;
  try {
    return canonicalizeActorPerceptionState(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

interface CanonicalObservationBatch {
  readonly valid: boolean;
  readonly values: readonly ActorObservation[];
}

function canonicalObservationBatch(value: unknown): CanonicalObservationBatch {
  if (!Array.isArray(value) || value.length > MAX_ACTOR_OBSERVATIONS_PER_STEP) {
    return { valid: false, values: EMPTY_OBSERVATIONS };
  }
  const observations: ActorObservation[] = [];
  for (const raw of value) {
    const observation = canonicalObservation(raw);
    if (observation === null) return { valid: false, values: EMPTY_OBSERVATIONS };
    observations.push(observation);
  }
  observations.sort(compareObservationCanonical);
  const unique: ActorObservation[] = [];
  for (const observation of observations) {
    const previous = unique[unique.length - 1];
    if (previous?.id !== observation.id) {
      unique.push(observation);
      continue;
    }
    if (!sameObservation(previous, observation)) {
      return { valid: false, values: EMPTY_OBSERVATIONS };
    }
  }
  return { valid: true, values: Object.freeze(unique) };
}

function canonicalObservation(value: unknown): ActorObservation | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "area",
    "channel",
    "confidence",
    "id",
    "identification",
    "interrupt",
    "observedAtTick",
    "observerId",
    "perceivedClass",
    "salience",
    "subjectId",
    "version",
  ])) return null;
  if (
    value.version !== ACTOR_PERCEPTION_VERSION
    || !validId(value.id)
    || !validId(value.observerId)
    || !nonnegativeSafeInteger(value.observedAtTick)
    || !isActorObservationChannel(value.channel)
    || typeof value.perceivedClass !== "string"
    || !CLASS_PATTERN.test(value.perceivedClass)
    || !(value.subjectId === null || validId(value.subjectId))
    || !scaledUnit(value.confidence)
    || !scaledUnit(value.salience)
    || !isIdentification(value.identification)
    || !isInterrupt(value.interrupt)
  ) return null;
  const area = canonicalArea(value.area);
  if (area === null) return null;

  if (value.channel === "hearing") {
    if (
      value.subjectId !== null
      || value.identification !== "anonymous"
      || area.radiusUnits < MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS
    ) return null;
  }
  if (value.channel === "scent") {
    if (
      value.subjectId !== null
      || value.identification !== "classified"
      || area.radiusUnits < MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS
    ) return null;
  }
  if (value.identification === "identified" && value.subjectId === null) return null;
  if (value.subjectId !== null && value.identification !== "identified") return null;

  return Object.freeze({
    version: ACTOR_PERCEPTION_VERSION,
    id: value.id,
    observerId: value.observerId,
    observedAtTick: value.observedAtTick,
    channel: value.channel,
    perceivedClass: value.perceivedClass,
    subjectId: value.subjectId,
    area,
    confidence: value.confidence,
    salience: value.salience,
    identification: value.identification,
    interrupt: value.interrupt,
  });
}

function canonicalStepInput(
  value: unknown,
  state: ActorPerceptionState,
): ActorPerceptionStepInput | null {
  if (!plainRecord(value) || !exactKeys(value, ["observations", "tick"])) return null;
  if (!nonnegativeSafeInteger(value.tick) || value.tick <= state.tick) return null;
  const tick = value.tick;
  const batch = canonicalObservationBatch(value.observations);
  if (!batch.valid) return null;
  if (batch.values.some((observation) => (
    observation.observerId !== state.actorId
    || observation.observedAtTick <= state.tick
    || observation.observedAtTick > tick
  ))) return null;
  return Object.freeze({ tick, observations: batch.values });
}

function canonicalBelief(
  value: unknown,
  stateTick: number,
  sourceVersion: typeof PRIOR_ACTOR_PERCEPTION_VERSION | typeof ACTOR_PERCEPTION_VERSION,
): ActorBelief | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "area",
    "channel",
    "confidence",
    "firstObservedTick",
    "identification",
    "key",
    "lastObservedTick",
    "perceivedClass",
    "salience",
    "sourceObservationId",
    "strongInterrupt",
    "subjectId",
  ])) return null;
  if (
    !validBeliefKey(value.key)
    || !isActorObservationChannel(value.channel)
    || (sourceVersion === PRIOR_ACTOR_PERCEPTION_VERSION && value.channel === "scent")
    || typeof value.perceivedClass !== "string"
    || !CLASS_PATTERN.test(value.perceivedClass)
    || !(value.subjectId === null || validId(value.subjectId))
    || !scaledUnit(value.confidence)
    || !scaledUnit(value.salience)
    || !isIdentification(value.identification)
    || !nonnegativeSafeInteger(value.firstObservedTick)
    || !nonnegativeSafeInteger(value.lastObservedTick)
    || value.firstObservedTick > value.lastObservedTick
    || value.lastObservedTick > stateTick
    || !validId(value.sourceObservationId)
    || typeof value.strongInterrupt !== "boolean"
  ) return null;
  const area = canonicalArea(value.area);
  if (area === null) return null;
  const expectedKey = value.subjectId === null
    ? contactBeliefKey(value.channel, value.sourceObservationId)
    : subjectBeliefKey(value.subjectId);
  if (value.key !== expectedKey) return null;
  if (value.channel === "hearing" && (
    value.subjectId !== null
    || value.identification !== "anonymous"
    || area.radiusUnits < MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS
  )) return null;
  if (value.channel === "scent" && (
    value.subjectId !== null
    || value.identification !== "classified"
    || area.radiusUnits < MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS
  )) return null;
  if (value.identification === "identified" && value.subjectId === null) return null;
  if (value.subjectId !== null && value.identification !== "identified") return null;
  return freezeBelief({
    key: value.key,
    channel: value.channel,
    perceivedClass: value.perceivedClass,
    subjectId: value.subjectId,
    area,
    confidence: value.confidence,
    salience: value.salience,
    identification: value.identification,
    firstObservedTick: value.firstObservedTick,
    lastObservedTick: value.lastObservedTick,
    sourceObservationId: value.sourceObservationId,
    strongInterrupt: value.strongInterrupt,
  });
}

function canonicalMemory(value: unknown, stateTick: number): ActorSalientMemory | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "area",
    "beliefKey",
    "channel",
    "observationId",
    "observedAtTick",
    "perceivedClass",
    "salience",
    "subjectId",
  ])) return null;
  if (
    !validId(value.observationId)
    || !validBeliefKey(value.beliefKey)
    // Only an identified visual subject becomes durable memory. Anonymous
    // sound, classified scent, and classified silhouettes remain bounded live
    // beliefs, so persisted state cannot smuggle them into long-term memory.
    || value.channel !== "vision"
    || typeof value.perceivedClass !== "string"
    || !CLASS_PATTERN.test(value.perceivedClass)
    || !validId(value.subjectId)
    || !nonnegativeSafeInteger(value.observedAtTick)
    || value.observedAtTick > stateTick
    || !scaledUnit(value.salience)
  ) return null;
  const area = canonicalArea(value.area);
  if (area === null) return null;
  const expectedKey = subjectBeliefKey(value.subjectId);
  if (value.beliefKey !== expectedKey) return null;
  return freezeMemory({
    observationId: value.observationId,
    beliefKey: value.beliefKey,
    channel: value.channel,
    perceivedClass: value.perceivedClass,
    subjectId: value.subjectId,
    area,
    observedAtTick: value.observedAtTick,
    salience: value.salience,
  });
}

function canonicalSearch(value: unknown, stateTick: number): ActorSearchState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "beliefKey",
    "expiresAtTick",
    "initialConfidence",
    "lastKnownArea",
    "lastObservedTick",
    "probeOrdinal",
    "startedAtTick",
    "subjectId",
  ])) return null;
  if (
    !validBeliefKey(value.beliefKey)
    || !validId(value.subjectId)
    || value.beliefKey !== subjectBeliefKey(value.subjectId)
    || !nonnegativeSafeInteger(value.lastObservedTick)
    || !nonnegativeSafeInteger(value.startedAtTick)
    || !nonnegativeSafeInteger(value.expiresAtTick)
    || value.lastObservedTick > value.startedAtTick
    || value.startedAtTick > stateTick
    || value.expiresAtTick <= value.startedAtTick
    || value.expiresAtTick <= stateTick
    || !scaledUnit(value.initialConfidence)
    || !nonnegativeSafeInteger(value.probeOrdinal)
  ) return null;
  const lastKnownArea = canonicalArea(value.lastKnownArea);
  if (lastKnownArea === null) return null;
  const duration = MIN_SEARCH_DURATION_TICKS
    + Math.floor(
      value.initialConfidence * SEARCH_CONFIDENCE_DURATION_TICKS / ACTOR_PERCEPTION_SCALE,
    );
  const expectedExpiry = Math.min(Number.MAX_SAFE_INTEGER, value.startedAtTick + duration);
  if (
    value.expiresAtTick !== expectedExpiry
    || value.probeOrdinal > stateTick - value.startedAtTick
  ) return null;
  return freezeSearch({
    beliefKey: value.beliefKey,
    subjectId: value.subjectId,
    lastKnownArea,
    lastObservedTick: value.lastObservedTick,
    startedAtTick: value.startedAtTick,
    expiresAtTick: value.expiresAtTick,
    initialConfidence: value.initialConfidence,
    probeOrdinal: value.probeOrdinal,
  });
}

function canonicalArea(value: unknown): ObservedArea | null {
  if (!plainRecord(value) || !exactKeys(value, ["center", "radiusUnits"])) return null;
  const center = canonicalWorldPosition(value.center);
  if (
    center === null
    || !nonnegativeSafeInteger(value.radiusUnits)
    || value.radiusUnits > MAX_OBSERVED_AREA_RADIUS_UNITS
  ) return null;
  return Object.freeze({ center, radiusUnits: value.radiusUnits });
}

function canonicalWorldPosition(value: unknown): WorldPosition | null {
  if (!plainRecord(value) || !exactKeys(value, ["localX", "localY", "region"])) return null;
  if (
    !isRegionCoord(value.region)
    || !nonnegativeSafeInteger(value.localX)
    || value.localX >= REGION_WIDTH_UNITS
    || !nonnegativeSafeInteger(value.localY)
    || value.localY >= REGION_HEIGHT_UNITS
  ) return null;
  return Object.freeze({
    region: Object.freeze({ x: value.region.x, y: value.region.y }),
    localX: value.localX,
    localY: value.localY,
  });
}

function beliefFromObservation(
  observation: ActorObservation,
  previous: ActorBelief | undefined,
): ActorBelief {
  return freezeBelief({
    key: beliefKeyFor(observation),
    channel: observation.channel,
    perceivedClass: observation.perceivedClass,
    subjectId: observation.subjectId,
    area: observation.area,
    confidence: observation.confidence,
    salience: observation.salience,
    identification: strongerIdentification(previous?.identification, observation.identification),
    firstObservedTick: previous?.firstObservedTick ?? observation.observedAtTick,
    lastObservedTick: observation.observedAtTick,
    sourceObservationId: observation.id,
    strongInterrupt: observation.interrupt === "strong",
  });
}

function selectObservationPerBelief(
  observations: readonly ActorObservation[],
): readonly ActorObservation[] {
  const selected = new Map<string, ActorObservation>();
  for (const observation of observations) {
    const key = beliefKeyFor(observation);
    const previous = selected.get(key);
    if (previous === undefined || compareObservationPreference(observation, previous) < 0) {
      selected.set(key, observation);
    }
  }
  return Object.freeze([...selected.values()].sort(compareObservationCanonical));
}

function selectBestObservation(
  observations: readonly ActorObservation[],
): ActorObservation | null {
  let best: ActorObservation | null = null;
  for (const observation of observations) {
    if (best === null || compareObservationPreference(observation, best) < 0) best = observation;
  }
  return best;
}

function selectBeliefs(
  values: readonly ActorBelief[],
  protectedKey: string | null,
): readonly ActorBelief[] {
  const selected = selectBounded(values, ACTOR_BELIEF_CAP, compareBeliefAttention);
  if (protectedKey !== null && !selected.some((belief) => belief.key === protectedKey)) {
    const protectedBelief = values.find((belief) => belief.key === protectedKey);
    if (protectedBelief !== undefined) {
      selected[selected.length - 1] = protectedBelief;
    }
  }
  return Object.freeze(selected.sort(compareBeliefStorage));
}

function selectAttention(values: readonly ActorBelief[]): ActorBelief[] {
  return selectBounded(
    values.filter((belief) => Math.max(belief.confidence, belief.salience) >= MIN_ACTIVE_BELIEF_VALUE),
    ACTOR_ATTENTION_CAP,
    compareBeliefAttention,
  );
}

function selectBounded<T>(
  values: readonly T[],
  cap: number,
  compare: (left: T, right: T) => number,
): T[] {
  const selected: T[] = [];
  for (const value of values) {
    let index = 0;
    while (index < selected.length && compare(selected[index] as T, value) <= 0) index += 1;
    if (index >= cap) continue;
    selected.splice(index, 0, value);
    if (selected.length > cap) selected.pop();
  }
  return selected;
}

function updateMemory(
  previous: readonly ActorSalientMemory[],
  observations: readonly ActorObservation[],
): readonly ActorSalientMemory[] {
  const byBelief = new Map(previous.map((memory) => [memory.beliefKey, memory]));
  for (const observation of observations) {
    // Anonymous sound and classified scent remain useful as short-lived
    // belief/attention events, including strong interrupts, but are not durable
    // actor memory. Only direct identified vision can overwrite recognition.
    const durable = observation.channel === "vision"
      && observation.identification === "identified"
      && observation.subjectId !== null;
    if (!durable) continue;
    byBelief.set(beliefKeyFor(observation), freezeMemory({
      observationId: observation.id,
      beliefKey: beliefKeyFor(observation),
      channel: observation.channel,
      perceivedClass: observation.perceivedClass,
      subjectId: observation.subjectId,
      area: observation.area,
      observedAtTick: observation.observedAtTick,
      salience: observation.salience,
    }));
  }
  return Object.freeze(selectBounded(
    [...byBelief.values()],
    ACTOR_SALIENT_MEMORY_CAP,
    compareMemory,
  ));
}

function createSearch(belief: ActorBelief, tick: number): ActorSearchState | null {
  if (belief.subjectId === null) throw new Error("Anonymous beliefs cannot create identity search");
  const duration = MIN_SEARCH_DURATION_TICKS
    + Math.floor(
      belief.confidence * SEARCH_CONFIDENCE_DURATION_TICKS / ACTOR_PERCEPTION_SCALE,
    );
  const expiresAtTick = Math.min(Number.MAX_SAFE_INTEGER, tick + duration);
  if (expiresAtTick <= tick) return null;
  return freezeSearch({
    beliefKey: belief.key,
    subjectId: belief.subjectId,
    lastKnownArea: belief.area,
    lastObservedTick: belief.lastObservedTick,
    startedAtTick: tick,
    expiresAtTick,
    initialConfidence: belief.confidence,
    probeOrdinal: 0,
  });
}

function searchProbe(
  actorId: string,
  search: ActorSearchState,
  radius: number,
): WorldPosition {
  if (radius <= 0) return clonePosition(search.lastKnownArea.center);
  const hash = stableHash(`${actorId}|${search.beliefKey}|${search.startedAtTick}|${search.probeOrdinal}`);
  const directions = Object.freeze([
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ] as const);
  const direction = directions[hash % directions.length] as readonly [number, number];
  const fraction = 0.35 + ((hash >>> 8) % 66) / 100;
  const diagonalScale = direction[0] !== 0 && direction[1] !== 0 ? Math.SQRT1_2 : 1;
  const distance = Math.max(1, Math.floor(radius * fraction * diagonalScale));
  return translateWorldPositionClosed(
    search.lastKnownArea.center,
    direction[0] * distance,
    direction[1] * distance,
  );
}

function translateWorldPositionClosed(
  position: WorldPosition,
  deltaX: number,
  deltaY: number,
): WorldPosition {
  const x = normalizeWorldAxis(
    BigInt(position.localX) + BigInt(deltaX),
    position.region.x,
    REGION_WIDTH_UNITS,
  );
  const y = normalizeWorldAxis(
    BigInt(position.localY) + BigInt(deltaY),
    position.region.y,
    REGION_HEIGHT_UNITS,
  );
  if (x === null || y === null) return clonePosition(position);
  return Object.freeze({
    region: Object.freeze({ x: x.region, y: y.region }),
    localX: x.local,
    localY: y.local,
  });
}

function normalizeWorldAxis(
  local: bigint,
  region: number,
  span: number,
): { readonly region: number; readonly local: number } | null {
  const divisor = BigInt(span);
  let quotient = local / divisor;
  let remainder = local % divisor;
  if (remainder < 0n) {
    quotient -= 1n;
    remainder += divisor;
  }
  const nextRegion = BigInt(region) + quotient;
  if (nextRegion < -REGION_LIMIT_BIGINT || nextRegion > REGION_LIMIT_BIGINT) return null;
  return { region: Number(nextRegion), local: Number(remainder) };
}

function suspicionFromPressure(
  previous: ActorSuspicionState,
  pressure: number,
): ActorSuspicionState {
  if (pressure >= ALERT_ENTER) return "alert";
  if (previous === "alert" && pressure >= ALERT_EXIT) return "alert";
  if (pressure >= SUSPICIOUS_ENTER) return "suspicious";
  if (
    (previous === "suspicious" || previous === "identified" || previous === "searching")
    && pressure >= SUSPICIOUS_EXIT
  ) return "suspicious";
  if (pressure >= NOTICE_ENTER) return "noticed";
  if (previous !== "unaware" && pressure >= NOTICE_EXIT) return "noticed";
  return "unaware";
}

function observationStrength(observation: ActorObservation): number {
  const identityBonus = observation.identification === "identified"
    ? 160_000
    : observation.identification === "classified" ? 60_000 : 0;
  return Math.min(
    ACTOR_PERCEPTION_SCALE,
    weightedStrength(observation.confidence, observation.salience) + identityBonus,
  );
}

function beliefStrength(belief: ActorBelief): number {
  const identityBonus = belief.identification === "identified"
    ? 160_000
    : belief.identification === "classified" ? 60_000 : 0;
  const interruptBonus = belief.strongInterrupt ? ACTOR_PERCEPTION_SCALE : 0;
  return Math.min(
    ACTOR_PERCEPTION_SCALE * 2,
    weightedStrength(belief.confidence, belief.salience) + identityBonus + interruptBonus,
  );
}

function weightedStrength(confidence: number, salience: number): number {
  return Math.floor((confidence * 45 + salience * 55) / 100);
}

function compareBeliefAttention(left: ActorBelief, right: ActorBelief): number {
  const strength = beliefStrength(right) - beliefStrength(left);
  if (strength !== 0) return strength;
  if (left.lastObservedTick !== right.lastObservedTick) {
    return right.lastObservedTick - left.lastObservedTick;
  }
  return compareText(left.key, right.key);
}

function compareBeliefStorage(left: ActorBelief, right: ActorBelief): number {
  return compareText(left.key, right.key);
}

function compareObservationPreference(left: ActorObservation, right: ActorObservation): number {
  if (left.observedAtTick !== right.observedAtTick) {
    return right.observedAtTick - left.observedAtTick;
  }
  const strength = observationStrength(right) - observationStrength(left);
  if (strength !== 0) return strength;
  return compareText(left.id, right.id);
}

function compareObservationCanonical(left: ActorObservation, right: ActorObservation): number {
  const id = compareText(left.id, right.id);
  if (id !== 0) return id;
  return compareObservationPreference(left, right);
}

function compareMemory(left: ActorSalientMemory, right: ActorSalientMemory): number {
  if (left.salience !== right.salience) return right.salience - left.salience;
  if (left.observedAtTick !== right.observedAtTick) {
    return right.observedAtTick - left.observedAtTick;
  }
  return compareText(left.observationId, right.observationId);
}

function sameObservation(left: ActorObservation, right: ActorObservation): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameArea(left: ObservedArea, right: ObservedArea): boolean {
  return left.radiusUnits === right.radiusUnits
    && left.center.region.x === right.center.region.x
    && left.center.region.y === right.center.region.y
    && left.center.localX === right.center.localX
    && left.center.localY === right.center.localY;
}

function beliefKeyFor(observation: ActorObservation): string {
  return observation.subjectId === null
    ? contactBeliefKey(observation.channel, observation.id)
    : subjectBeliefKey(observation.subjectId);
}

function subjectBeliefKey(subjectId: string): string {
  return `subject:${subjectId}`;
}

function contactBeliefKey(channel: ActorObservationChannel, observationId: string): string {
  return `contact:${channel}:${observationId}`;
}

function strongerIdentification(
  previous: ObservationIdentification | undefined,
  next: ObservationIdentification,
): ObservationIdentification {
  if (previous === undefined) return next;
  const order: Readonly<Record<ObservationIdentification, number>> = {
    anonymous: 0,
    classified: 1,
    identified: 2,
  };
  return order[previous] >= order[next] ? previous : next;
}

function ageBelief(belief: ActorBelief, tick: number): AgedActorBelief {
  return Object.freeze({ ...belief, ageTicks: tick - belief.lastObservedTick });
}

function freezeBelief(belief: ActorBelief): ActorBelief {
  return Object.freeze({ ...belief, area: cloneArea(belief.area) });
}

function freezeMemory(memory: ActorSalientMemory): ActorSalientMemory {
  return Object.freeze({ ...memory, area: cloneArea(memory.area) });
}

function freezeSearch(search: ActorSearchState): ActorSearchState {
  return Object.freeze({ ...search, lastKnownArea: cloneArea(search.lastKnownArea) });
}

function freezeState(state: ActorPerceptionState): ActorPerceptionState {
  return Object.freeze({
    ...state,
    attentionKeys: Object.freeze([...state.attentionKeys]),
    beliefs: Object.freeze([...state.beliefs]),
    salientMemory: Object.freeze([...state.salientMemory]),
    search: state.search === null ? null : freezeSearch(state.search),
  });
}

function cloneArea(area: ObservedArea): ObservedArea {
  return Object.freeze({ center: clonePosition(area.center), radiusUnits: area.radiusUnits });
}

function clonePosition(position: WorldPosition): WorldPosition {
  return Object.freeze({
    region: Object.freeze({ x: position.region.x, y: position.region.y }),
    localX: position.localX,
    localY: position.localY,
  });
}

function stableHash(text: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validBeliefKey(value: unknown): value is string {
  return typeof value === "string"
    && (value.startsWith("subject:") || value.startsWith("contact:"))
    && value.length <= 280;
}

function isActorObservationChannel(value: unknown): value is ActorObservationChannel {
  return value === "vision" || value === "hearing" || value === "scent";
}

function isReadablePerceptionVersion(
  value: unknown,
): value is typeof PRIOR_ACTOR_PERCEPTION_VERSION | typeof ACTOR_PERCEPTION_VERSION {
  return value === PRIOR_ACTOR_PERCEPTION_VERSION || value === ACTOR_PERCEPTION_VERSION;
}

function isIdentification(value: unknown): value is ObservationIdentification {
  return value === "anonymous" || value === "classified" || value === "identified";
}

function isInterrupt(value: unknown): value is ObservationInterrupt {
  return value === "none" || value === "strong";
}

function isSuspicion(value: unknown): value is ActorSuspicionState {
  return value === "unaware"
    || value === "noticed"
    || value === "suspicious"
    || value === "identified"
    || value === "alert"
    || value === "searching";
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= ACTOR_PERCEPTION_SCALE;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= 0;
}

function decayScaled(value: number, perTick: number, elapsed: number): number {
  if (value === 0 || elapsed >= Math.ceil(value / perTick)) return 0;
  return value - perTick * elapsed;
}

function saturatingGrowth(
  initial: number,
  perTick: number,
  elapsed: number,
  maximum: number,
): number {
  if (initial >= maximum) return maximum;
  const remaining = maximum - initial;
  if (elapsed >= Math.ceil(remaining / perTick)) return maximum;
  return initial + perTick * elapsed;
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

const EMPTY_OBSERVATIONS = Object.freeze([]) as readonly ActorObservation[];
const EMPTY_BELIEFS = Object.freeze([]) as readonly ActorBelief[];
const EMPTY_AGED_BELIEFS = Object.freeze([]) as readonly AgedActorBelief[];
const EMPTY_MEMORY = Object.freeze([]) as readonly ActorSalientMemory[];
const EMPTY_KEYS = Object.freeze([]) as readonly string[];
