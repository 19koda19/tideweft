import { FIXED_POINT } from "../sim/types";
import {
  PLAYER_FOOT_MAX_WATER_DEPTH,
  PLAYER_MAX_DRY_FIXED_STEP_STAMINA_SPEND,
  PLAYER_MAX_FIXED_STEP_DISPLACEMENT_UNITS,
  PLAYER_MOVEMENT_STAMINA_GATE,
  type PlayerMode,
} from "./player";
import type { TraversalIncidentKind } from "./traversalFeedback";

/** Generic physical outcome retained for each unfinished fixed player step. */
export const PLAYER_STEP_STATE_SAMPLE_VERSION = 1 as const;
export const PLAYER_STEP_STATE_ANCHOR_VERSION = 1 as const;

/**
 * Authoritative player state immediately before the first non-legacy sample
 * retained in an unfinished perception interval. Historical null prefixes are
 * never mistaken for state evidence.
 */
export interface PlayerStepStateAnchor {
  readonly version: typeof PLAYER_STEP_STATE_ANCHOR_VERSION;
  readonly sampleOrdinal: number;
  readonly stamina: number;
  readonly mode: PlayerMode;
}

export interface PlayerStepStateSample {
  readonly version: typeof PLAYER_STEP_STATE_SAMPLE_VERSION;
  /** Exact parallel index in the current interval's player sensory trajectory. */
  readonly sampleOrdinal: number;
  readonly staminaBefore: number;
  readonly staminaAfter: number;
  readonly modeBefore: PlayerMode;
  readonly modeAfter: PlayerMode;
  readonly acceptedDistanceUnits: number;
  readonly moved: boolean;
  readonly exhausted: boolean;
  readonly rescued: boolean;
  readonly becameSwept: boolean;
  readonly traversalIncidentKind: TraversalIncidentKind | null;
  readonly startingWaterDepth: number;
  readonly endingWaterDepth: number;
}

export interface PlayerStepStateSampleInput
  extends Omit<PlayerStepStateSample, "version"> {}

const PLAYER_MODES: ReadonlySet<PlayerMode> = new Set([
  "foot",
  "wading",
  "skiff",
  "swept",
  "camp",
  "rescued",
]);

const TRAVERSAL_INCIDENT_KINDS: ReadonlySet<TraversalIncidentKind> = new Set([
  "stumble",
  "fall",
  "sweep",
  "cargo-impact",
  "recovery",
]);

export function createPlayerStepStateAnchor(
  sampleOrdinal: number,
  stamina: number,
  mode: PlayerMode,
): PlayerStepStateAnchor | null {
  return canonicalizePlayerStepStateAnchor({
    version: PLAYER_STEP_STATE_ANCHOR_VERSION,
    sampleOrdinal,
    stamina,
    mode,
  });
}

export function canonicalizePlayerStepStateAnchor(
  value: unknown,
): PlayerStepStateAnchor | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["mode", "sampleOrdinal", "stamina", "version"])
    || value.version !== PLAYER_STEP_STATE_ANCHOR_VERSION
    || !boundedInteger(value.sampleOrdinal, 0, 9)
    || !boundedInteger(value.stamina, 0, FIXED_POINT)
    || !PLAYER_MODES.has(value.mode as PlayerMode)
  ) return null;
  return Object.freeze({
    version: PLAYER_STEP_STATE_ANCHOR_VERSION,
    sampleOrdinal: value.sampleOrdinal as number,
    stamina: value.stamina as number,
    mode: value.mode as PlayerMode,
  });
}

/** Creates one movement-owned sample rather than an expression-owned receipt. */
export function createPlayerStepStateSample(
  value: PlayerStepStateSampleInput,
): PlayerStepStateSample | null {
  return canonicalizePlayerStepStateSample({
    ...value,
    version: PLAYER_STEP_STATE_SAMPLE_VERSION,
  });
}

/** Canonicalizes one bounded physical step fact without inferring missing state. */
export function canonicalizePlayerStepStateSample(
  value: unknown,
): PlayerStepStateSample | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "acceptedDistanceUnits",
      "becameSwept",
      "endingWaterDepth",
      "exhausted",
      "modeAfter",
      "modeBefore",
      "moved",
      "rescued",
      "sampleOrdinal",
      "staminaAfter",
      "staminaBefore",
      "startingWaterDepth",
      "traversalIncidentKind",
      "version",
    ])
    || value.version !== PLAYER_STEP_STATE_SAMPLE_VERSION
    || !boundedInteger(value.sampleOrdinal, 0, 63)
    || !boundedInteger(value.staminaBefore, 0, FIXED_POINT)
    || !boundedInteger(value.staminaAfter, 0, FIXED_POINT)
    || !PLAYER_MODES.has(value.modeBefore as PlayerMode)
    || !PLAYER_MODES.has(value.modeAfter as PlayerMode)
    || !boundedInteger(
      value.acceptedDistanceUnits,
      0,
      PLAYER_MAX_FIXED_STEP_DISPLACEMENT_UNITS,
    )
    || typeof value.moved !== "boolean"
    || value.moved !== ((value.acceptedDistanceUnits as number) > 0)
    || typeof value.exhausted !== "boolean"
    || typeof value.rescued !== "boolean"
    || typeof value.becameSwept !== "boolean"
    || (value.rescued && value.becameSwept)
    || (value.rescued && value.modeAfter !== "rescued")
    || (value.becameSwept && value.modeAfter !== "swept")
    || (value.traversalIncidentKind !== null
      && !TRAVERSAL_INCIDENT_KINDS.has(value.traversalIncidentKind as TraversalIncidentKind))
    || !boundedInteger(value.startingWaterDepth, 0, FIXED_POINT)
    || !boundedInteger(value.endingWaterDepth, 0, FIXED_POINT)
  ) return null;
  return Object.freeze({
    version: PLAYER_STEP_STATE_SAMPLE_VERSION,
    sampleOrdinal: value.sampleOrdinal as number,
    staminaBefore: value.staminaBefore as number,
    staminaAfter: value.staminaAfter as number,
    modeBefore: value.modeBefore as PlayerMode,
    modeAfter: value.modeAfter as PlayerMode,
    acceptedDistanceUnits: value.acceptedDistanceUnits as number,
    moved: value.moved,
    exhausted: value.exhausted,
    rescued: value.rescued,
    becameSwept: value.becameSwept,
    traversalIncidentKind: value.traversalIncidentKind as TraversalIncidentKind | null,
    startingWaterDepth: value.startingWaterDepth as number,
    endingWaterDepth: value.endingWaterDepth as number,
  });
}

/**
 * Proves the narrow movement-owned transition eligible for restrained effort
 * expression. The reserve collapse is bounded by the greatest real dry-step
 * spend plus the movement gate; an impossible full-meter depletion is never
 * accepted as exhaustion evidence.
 */
export function playerStepStateProvesDryExhaustion(
  sample: PlayerStepStateSample | null,
): sample is PlayerStepStateSample {
  return sample !== null
    && sample.moved
    && sample.acceptedDistanceUnits > 0
    && sample.staminaBefore > PLAYER_MOVEMENT_STAMINA_GATE
    && sample.staminaBefore
      <= PLAYER_MOVEMENT_STAMINA_GATE + PLAYER_MAX_DRY_FIXED_STEP_STAMINA_SPEND
    && sample.staminaAfter === 0
    && sample.modeBefore === "foot"
    && sample.modeAfter === "camp"
    && sample.exhausted
    && !sample.rescued
    && !sample.becameSwept
    && sample.traversalIncidentKind === null
    && sample.startingWaterDepth <= PLAYER_FOOT_MAX_WATER_DEPTH
    && sample.endingWaterDepth <= PLAYER_FOOT_MAX_WATER_DEPTH;
}

/**
 * Proves that one real step begins at the exact movement-owned frontier.
 * A lawful between-step action may lower stamina, but an unauthenticated gap
 * must never become evidence for exhaustion expression.
 */
export function playerStepStateHasExactPredecessor(
  sample: PlayerStepStateSample | null,
  predecessor: PlayerStepStateSample | PlayerStepStateAnchor | null,
): boolean {
  if (sample === null || predecessor === null) return false;
  if ("staminaAfter" in predecessor) {
    return sample.sampleOrdinal === predecessor.sampleOrdinal + 1
      && sample.staminaBefore === predecessor.staminaAfter
      && sample.modeBefore === predecessor.modeAfter;
  }
  return sample.sampleOrdinal === predecessor.sampleOrdinal
    && sample.staminaBefore === predecessor.stamina
    && sample.modeBefore === predecessor.mode;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= minimum
    && value <= maximum;
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
