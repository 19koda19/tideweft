import type { RootSeed } from "../sim/rng";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  canonicalizePlayerStepStateAnchor,
  canonicalizePlayerStepStateSample,
  playerStepStateHasExactPredecessor,
  playerStepStateProvesDryExhaustion,
  type PlayerStepStateAnchor,
  type PlayerStepStateSample,
} from "./playerStepState";
import {
  canonicalizeSituatedExpressionAdmissionRecord,
  type PlayerExhaustionExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import { situatedExpressionCooldownSteps } from "./situatedExpression";
import { createWorldPosition, isWorldPosition, worldPositionDelta, type WorldPosition } from "./worldPosition";

export const PLAYER_EFFORT_RECENCY_VERSION = 1 as const;
const PLAYER_STEPS_PER_WORLD_TICK = 10;

/** Accepted history, not a pending acoustic event or a presentation queue. */
export interface PlayerEffortRecencyReceipt {
  readonly admission: PlayerExhaustionExpressionAdmissionRecord;
  readonly step: PlayerStepStateSample;
  readonly predecessor: PlayerStepStateAnchor;
  readonly beforePosition: WorldPosition;
  readonly afterPosition: WorldPosition;
}

/** One current consumer needs at most one finite receipt. No prose/audio is stored. */
export interface PlayerEffortRecencyState {
  readonly version: typeof PLAYER_EFFORT_RECENCY_VERSION;
  readonly rootSeed: RootSeed;
  readonly lastAccepted: PlayerEffortRecencyReceipt | null;
}

export interface PlayerEffortRecencyClock {
  readonly completedTick: number;
  readonly playerStepPhase: number;
}

export function createPlayerEffortRecencyState(rootSeed: RootSeed): PlayerEffortRecencyState {
  if (!validSeed(rootSeed)) throw new Error("Invalid effort-recency world seed");
  return freezeState(rootSeed, null);
}

/**
 * Re-derives the original semantic policy/identity and narrow physical facts.
 * These are historical facts: never compare their depths to today's tide.
 * The enclosing save integrity establishes consistency, not secret attestation
 * against an attacker replacing an entirely coherent saved history.
 */
export function canonicalizePlayerEffortRecencyState(
  value: unknown,
  rootSeed: RootSeed,
  clock: PlayerEffortRecencyClock,
): PlayerEffortRecencyState | null {
  if (!plainRecord(value) || !exactKeys(value, ["lastAccepted", "rootSeed", "version"])
    || value.version !== PLAYER_EFFORT_RECENCY_VERSION
    || !validSeed(rootSeed) || !validSeed(value.rootSeed)
    || !validClock(clock)) return null;
  const savedSeed = value.rootSeed;
  if (!rootSeed.every((word, index) => word === savedSeed[index])) return null;
  if (value.lastAccepted === null) return freezeState(rootSeed, null);
  const receipt = canonicalReceipt(value.lastAccepted);
  if (receipt === null) return null;
  const age = playerEffortRecencyAge(receipt, clock);
  const cooldown = situatedExpressionCooldownSteps("need-rest-after-exertion");
  if (age === null || cooldown === null) return null;
  return freezeState(rootSeed, age >= cooldown.meaning ? null : receipt);
}

/** A fresh physical exhaustion can be quiet without erasing any physical event. */
export function playerEffortRecencyAllowsExpression(
  value: unknown,
  rootSeed: RootSeed,
  clock: PlayerEffortRecencyClock,
): boolean | null {
  const state = canonicalizePlayerEffortRecencyState(value, rootSeed, clock);
  return state === null ? null : state.lastAccepted === null;
}

/** Called only after the current domain transaction accepted this expression. */
export function recordAcceptedPlayerEffortExpression(
  rootSeed: RootSeed,
  receipt: PlayerEffortRecencyReceipt,
): PlayerEffortRecencyState | null {
  const canonical = canonicalReceipt(receipt);
  if (canonical === null) return null;
  const ordinal = canonical.step.sampleOrdinal;
  return canonicalizePlayerEffortRecencyState(
    { version: PLAYER_EFFORT_RECENCY_VERSION, rootSeed, lastAccepted: canonical },
    rootSeed,
    {
      completedTick: canonical.admission.committedWorldTick + (ordinal === 9 ? 1 : 0),
      playerStepPhase: (ordinal + 1) % PLAYER_STEPS_PER_WORLD_TICK,
    },
  );
}

/** No persisted countdown: accepted simulation frontiers are the only clock. */
function playerEffortRecencyAge(
  receipt: PlayerEffortRecencyReceipt,
  clock: PlayerEffortRecencyClock,
): number | null {
  if (!validClock(clock)) return null;
  const tickDelta = clock.completedTick - receipt.admission.committedWorldTick;
  const age = tickDelta * PLAYER_STEPS_PER_WORLD_TICK
    + clock.playerStepPhase - receipt.step.sampleOrdinal - 1;
  return Number.isSafeInteger(age) && age >= 0 ? age : null;
}

function canonicalReceipt(value: unknown): PlayerEffortRecencyReceipt | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "admission", "afterPosition", "beforePosition", "predecessor", "step",
  ])) return null;
  const admission = canonicalizeSituatedExpressionAdmissionRecord(value.admission);
  const step = canonicalizePlayerStepStateSample(value.step);
  const predecessor = canonicalizePlayerStepStateAnchor(value.predecessor);
  if (admission?.kind !== "player-exhaustion"
    || admission.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || !playerStepStateProvesDryExhaustion(step) || step.sampleOrdinal > 9
    || !playerStepStateHasExactPredecessor(step, predecessor) || predecessor === null
    || admission.admittedAtPlayerStepPhase !== Math.min(9, step.sampleOrdinal + 1)
    || admission.acceptedDistanceUnits !== step.acceptedDistanceUnits
    || !isWorldPosition(value.beforePosition) || !isWorldPosition(value.afterPosition)) return null;
  try {
    const delta = worldPositionDelta(value.beforePosition, value.afterPosition);
    if (Math.round(Math.hypot(delta.x, delta.y)) !== step.acceptedDistanceUnits) return null;
  } catch { return null; }
  return Object.freeze({
    admission, step, predecessor,
    beforePosition: createWorldPosition(value.beforePosition.region, value.beforePosition.localX, value.beforePosition.localY),
    afterPosition: createWorldPosition(value.afterPosition.region, value.afterPosition.localX, value.afterPosition.localY),
  });
}

function freezeState(rootSeed: RootSeed, lastAccepted: PlayerEffortRecencyReceipt | null): PlayerEffortRecencyState {
  return Object.freeze({
    version: PLAYER_EFFORT_RECENCY_VERSION,
    rootSeed: Object.freeze([...rootSeed]) as RootSeed,
    lastAccepted,
  });
}

function validSeed(value: unknown): value is RootSeed {
  return Array.isArray(value) && value.length === 4
    && Object.keys(value).length === 4
    && value.every((word) => integer(word, 0, 0xffff_ffff));
}

function validClock(value: PlayerEffortRecencyClock): boolean {
  return integer(value.completedTick, 0, Number.MAX_SAFE_INTEGER)
    && integer(value.playerStepPhase, 0, 9);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0)
    && (value as number) >= minimum && (value as number) <= maximum;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}
