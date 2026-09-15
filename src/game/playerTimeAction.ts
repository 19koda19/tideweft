import {
  WORLD_DAWN_START_TICK,
  WORLD_TICKS_PER_DAY,
  projectWorldTime,
} from "../sim/worldTime";

export const PLAYER_TIME_ACTION_VERSION = 1 as const;
export const PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE = 10 as const;
export const PLAYER_REST_WORLD_MINUTES = 30 as const;
export const PLAYER_REST_TOTAL_STEPS = (
  PLAYER_REST_WORLD_MINUTES * PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE
) as 300;

export type PlayerTimeActionKind = "rest" | "sleep";

/**
 * Durable authority for an in-progress player REST or SLEEP action. The world
 * and partial player-step phase remain the clock; completedSteps is a receipt
 * that must agree with them exactly rather than an independent timer.
 */
export interface PlayerTimeActionState {
  readonly version: typeof PLAYER_TIME_ACTION_VERSION;
  readonly kind: PlayerTimeActionKind;
  readonly startedAtWorldTick: number;
  readonly startedAtPlayerStepPhase: number;
  readonly targetWorldTick: number;
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly anchorSettlementId: number | null;
}

export interface CreatePlayerTimeActionInput {
  readonly kind: PlayerTimeActionKind;
  readonly startedAtWorldTick: number;
  readonly startedAtPlayerStepPhase: number;
  readonly anchorSettlementId: number | null;
}

export type PlayerTimeActionAdvanceResult =
  | Readonly<{ status: "active"; state: PlayerTimeActionState }>
  | Readonly<{ status: "complete" }>;

const PLAYER_TIME_ACTION_KEYS = Object.freeze([
  "anchorSettlementId",
  "completedSteps",
  "kind",
  "startedAtPlayerStepPhase",
  "startedAtWorldTick",
  "targetWorldTick",
  "totalSteps",
  "version",
] as const);

/** The first 06:00 boundary strictly after the supplied authoritative tick. */
export function nextAuthoritativeDawnWorldTick(atWorldTick: unknown): number | null {
  if (!safeNonnegativeInteger(atWorldTick)) return null;
  const time = projectWorldTime(atWorldTick);
  if (time === null) return null;
  const wrappedDistance = (
    WORLD_DAWN_START_TICK - time.dayTick + WORLD_TICKS_PER_DAY
  ) % WORLD_TICKS_PER_DAY;
  const distance = wrappedDistance === 0 ? WORLD_TICKS_PER_DAY : wrappedDistance;
  const target = atWorldTick + distance;
  return safeNonnegativeInteger(target) ? target : null;
}

/** Creates a fail-closed, canonical REST or SLEEP receipt. */
export function createPlayerTimeAction(
  input: CreatePlayerTimeActionInput,
): PlayerTimeActionState | null {
  if (
    (input.kind !== "rest" && input.kind !== "sleep")
    || !safeNonnegativeInteger(input.startedAtWorldTick)
    || !validPlayerStepPhase(input.startedAtPlayerStepPhase)
  ) return null;
  const startingTime = projectWorldTime(input.startedAtWorldTick);
  if (
    startingTime === null
    || (
      input.kind === "sleep"
      && startingTime.phase !== "dusk"
      && startingTime.phase !== "night"
    )
  ) return null;

  const targetWorldTick = input.kind === "rest"
    ? safeAdd(input.startedAtWorldTick, PLAYER_REST_WORLD_MINUTES)
    : nextAuthoritativeDawnWorldTick(input.startedAtWorldTick);
  if (targetWorldTick === null) return null;

  if (
    (input.kind === "rest" && input.anchorSettlementId !== null)
    || (
      input.kind === "sleep"
      && !safeNonnegativeInteger(input.anchorSettlementId)
    )
  ) return null;

  const totalSteps = exactTotalSteps(
    input.kind,
    input.startedAtWorldTick,
    input.startedAtPlayerStepPhase,
    targetWorldTick,
  );
  if (totalSteps === null || totalSteps <= 0) return null;

  return Object.freeze({
    version: PLAYER_TIME_ACTION_VERSION,
    kind: input.kind,
    startedAtWorldTick: input.startedAtWorldTick,
    startedAtPlayerStepPhase: input.startedAtPlayerStepPhase,
    targetWorldTick,
    totalSteps,
    completedSteps: 0,
    anchorSettlementId: input.anchorSettlementId,
  });
}

/**
 * Admits only an active receipt whose progress exactly matches the authoritative
 * world tick and partial fixed-step phase supplied by the runtime.
 */
export function canonicalizePlayerTimeAction(
  value: unknown,
  currentWorldTick: unknown,
  currentPlayerStepPhase: unknown,
): PlayerTimeActionState | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, PLAYER_TIME_ACTION_KEYS)
    || value.version !== PLAYER_TIME_ACTION_VERSION
    || (value.kind !== "rest" && value.kind !== "sleep")
    || !safeNonnegativeInteger(value.startedAtWorldTick)
    || !validPlayerStepPhase(value.startedAtPlayerStepPhase)
    || !safeNonnegativeInteger(value.targetWorldTick)
    || !safePositiveInteger(value.totalSteps)
    || !safeNonnegativeInteger(value.completedSteps)
    || value.completedSteps >= value.totalSteps
    || !safeNonnegativeInteger(currentWorldTick)
    || !validPlayerStepPhase(currentPlayerStepPhase)
  ) return null;

  const expectedTarget = value.kind === "rest"
    ? safeAdd(value.startedAtWorldTick, PLAYER_REST_WORLD_MINUTES)
    : nextAuthoritativeDawnWorldTick(value.startedAtWorldTick);
  if (expectedTarget === null || value.targetWorldTick !== expectedTarget) return null;
  const startingTime = projectWorldTime(value.startedAtWorldTick);
  if (
    startingTime === null
    || (
      value.kind === "sleep"
      && startingTime.phase !== "dusk"
      && startingTime.phase !== "night"
    )
  ) return null;

  const expectedTotalSteps = exactTotalSteps(
    value.kind,
    value.startedAtWorldTick,
    value.startedAtPlayerStepPhase,
    value.targetWorldTick,
  );
  if (expectedTotalSteps === null || value.totalSteps !== expectedTotalSteps) return null;

  if (
    (value.kind === "rest" && value.anchorSettlementId !== null)
    || (
      value.kind === "sleep"
      && !safeNonnegativeInteger(value.anchorSettlementId)
    )
    || currentWorldTick < value.startedAtWorldTick
    || currentWorldTick > value.targetWorldTick
  ) return null;

  const completedSteps = elapsedPlayerSteps(
    value.startedAtWorldTick,
    value.startedAtPlayerStepPhase,
    currentWorldTick,
    currentPlayerStepPhase,
  );
  if (completedSteps === null || completedSteps !== value.completedSteps) return null;

  return Object.freeze({
    version: PLAYER_TIME_ACTION_VERSION,
    kind: value.kind,
    startedAtWorldTick: value.startedAtWorldTick,
    startedAtPlayerStepPhase: value.startedAtPlayerStepPhase,
    targetWorldTick: value.targetWorldTick,
    totalSteps: value.totalSteps,
    completedSteps: value.completedSteps,
    anchorSettlementId: value.anchorSettlementId as number | null,
  });
}

/**
 * Accepts exactly one already-committed ordinary player step. Replayed, skipped,
 * or otherwise mismatched authoritative time is rejected rather than repaired.
 */
export function advancePlayerTimeActionOneStep(
  value: unknown,
  currentWorldTick: unknown,
  currentPlayerStepPhase: unknown,
): PlayerTimeActionAdvanceResult | null {
  const state = canonicalizeAtRecordedProgress(value);
  if (state === null) return null;

  const nextCompletedSteps = state.completedSteps + 1;
  if (!safePositiveInteger(nextCompletedSteps) || nextCompletedSteps > state.totalSteps) {
    return null;
  }
  const expectedPosition = positionAfterCompletedSteps(state, nextCompletedSteps);
  if (
    expectedPosition === null
    || currentWorldTick !== expectedPosition.worldTick
    || currentPlayerStepPhase !== expectedPosition.playerStepPhase
  ) return null;

  if (nextCompletedSteps === state.totalSteps) {
    return Object.freeze({ status: "complete" });
  }

  return Object.freeze({
    status: "active",
    state: Object.freeze({
      ...state,
      completedSteps: nextCompletedSteps,
    }),
  });
}

/** Rounded-up time remaining, suitable for a truthful compact action label. */
export function remainingPlayerTimeActionWorldMinutes(value: unknown): number | null {
  const state = canonicalizeAtRecordedProgress(value);
  if (state === null) return null;
  return Math.ceil(
    (state.totalSteps - state.completedSteps)
    / PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE,
  );
}

function canonicalizeAtRecordedProgress(value: unknown): PlayerTimeActionState | null {
  if (!plainRecord(value) || !safeNonnegativeInteger(value.completedSteps)) return null;
  const position = positionAfterCompletedSteps(value, value.completedSteps);
  if (position === null) return null;
  return canonicalizePlayerTimeAction(
    value,
    position.worldTick,
    position.playerStepPhase,
  );
}

function positionAfterCompletedSteps(
  value: unknown,
  completedSteps: number,
): Readonly<{ worldTick: number; playerStepPhase: number }> | null {
  if (
    !plainRecord(value)
    || !safeNonnegativeInteger(value.startedAtWorldTick)
    || !validPlayerStepPhase(value.startedAtPlayerStepPhase)
    || !safeNonnegativeInteger(completedSteps)
  ) return null;
  const phaseSteps = value.startedAtPlayerStepPhase + completedSteps;
  if (!Number.isSafeInteger(phaseSteps)) return null;
  const elapsedWorldTicks = Math.floor(
    phaseSteps / PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE,
  );
  const worldTick = safeAdd(value.startedAtWorldTick, elapsedWorldTicks);
  if (worldTick === null) return null;
  return Object.freeze({
    worldTick,
    playerStepPhase: phaseSteps % PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE,
  });
}

function elapsedPlayerSteps(
  startedAtWorldTick: number,
  startedAtPlayerStepPhase: number,
  currentWorldTick: number,
  currentPlayerStepPhase: number,
): number | null {
  const elapsedWorldTicks = currentWorldTick - startedAtWorldTick;
  const elapsedSteps = (
    elapsedWorldTicks * PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE
    + currentPlayerStepPhase
    - startedAtPlayerStepPhase
  );
  return safeNonnegativeInteger(elapsedSteps) ? elapsedSteps : null;
}

function exactTotalSteps(
  kind: PlayerTimeActionKind,
  startedAtWorldTick: number,
  startedAtPlayerStepPhase: number,
  targetWorldTick: number,
): number | null {
  const elapsedWorldTicks = targetWorldTick - startedAtWorldTick;
  if (!safePositiveInteger(elapsedWorldTicks)) return null;
  const totalSteps = elapsedWorldTicks * PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE
    - (kind === "sleep" ? startedAtPlayerStepPhase : 0);
  return safePositiveInteger(totalSteps) ? totalSteps : null;
}

function safeAdd(left: number, right: number): number | null {
  const result = left + right;
  return safeNonnegativeInteger(result) ? result : null;
}

function validPlayerStepPhase(value: unknown): value is number {
  return safeNonnegativeInteger(value)
    && value < PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE;
}

function safePositiveInteger(value: unknown): value is number {
  return safeNonnegativeInteger(value) && value > 0;
}

function safeNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  const actualStrings = (actual as string[]).sort();
  const expectedStrings = [...expected].sort();
  return actualStrings.length === expectedStrings.length
    && actualStrings.every((key, index) => key === expectedStrings[index]);
}
