import { describe, expect, it } from "vitest";

import {
  PLAYER_REST_TOTAL_STEPS,
  PLAYER_REST_WORLD_MINUTES,
  PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE,
  PLAYER_TIME_ACTION_VERSION,
  advancePlayerTimeActionOneStep,
  canonicalizePlayerTimeAction,
  createPlayerTimeAction,
  nextAuthoritativeDawnWorldTick,
  remainingPlayerTimeActionWorldMinutes,
  type PlayerTimeActionState,
} from "./playerTimeAction";

function positionAfter(
  state: PlayerTimeActionState,
  completedSteps: number,
): Readonly<{ worldTick: number; phase: number }> {
  const phaseSteps = state.startedAtPlayerStepPhase + completedSteps;
  return {
    worldTick: state.startedAtWorldTick
      + Math.floor(phaseSteps / PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE),
    phase: phaseSteps % PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE,
  };
}

describe("player time action authority", () => {
  it("creates and advances an exact 30-minute REST from a nonzero phase", () => {
    const state = createPlayerTimeAction({
      kind: "rest",
      startedAtWorldTick: 777,
      startedAtPlayerStepPhase: 7,
      anchorSettlementId: null,
    });
    expect(state).toEqual({
      version: PLAYER_TIME_ACTION_VERSION,
      kind: "rest",
      startedAtWorldTick: 777,
      startedAtPlayerStepPhase: 7,
      targetWorldTick: 777 + PLAYER_REST_WORLD_MINUTES,
      totalSteps: PLAYER_REST_TOTAL_STEPS,
      completedSteps: 0,
      anchorSettlementId: null,
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(canonicalizePlayerTimeAction(state, 777, 7)).toEqual(state);
    expect(remainingPlayerTimeActionWorldMinutes(state)).toBe(30);

    if (state === null) throw new Error("REST fixture was rejected");
    const firstPosition = positionAfter(state, 1);
    const first = advancePlayerTimeActionOneStep(
      state,
      firstPosition.worldTick,
      firstPosition.phase,
    );
    expect(first).toMatchObject({
      status: "active",
      state: { completedSteps: 1 },
    });
    expect(first?.status === "active" && Object.isFrozen(first.state)).toBe(true);
    expect(first?.status === "active"
      ? remainingPlayerTimeActionWorldMinutes(first.state)
      : null).toBe(30);
  });

  it.each([
    ["19:00", 1_140, 1_800, 660],
    ["23:59", 1_439, 1_800, 361],
    ["00:00", 1_440, 1_800, 360],
    ["05:59", 1_799, 1_800, 1],
  ] as const)(
    "targets the next authoritative dawn from %s",
    (_label, startedAtWorldTick, targetWorldTick, minutes) => {
      expect(nextAuthoritativeDawnWorldTick(startedAtWorldTick)).toBe(targetWorldTick);
      const state = createPlayerTimeAction({
        kind: "sleep",
        startedAtWorldTick,
        startedAtPlayerStepPhase: 4,
        anchorSettlementId: 0,
      });
      expect(state).toMatchObject({
        kind: "sleep",
        targetWorldTick,
        totalSteps: minutes * PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE - 4,
        completedSteps: 0,
        anchorSettlementId: 0,
      });
      expect(canonicalizePlayerTimeAction(state, startedAtWorldTick, 4)).toEqual(state);
      expect(remainingPlayerTimeActionWorldMinutes(state)).toBe(minutes);
    },
  );

  it("uses a strictly future dawn at the 06:00 boundary", () => {
    expect(nextAuthoritativeDawnWorldTick(1_800)).toBe(3_240);
    expect(createPlayerTimeAction({
      kind: "sleep",
      startedAtWorldTick: 1_800,
      startedAtPlayerStepPhase: 0,
      anchorSettlementId: 4,
    })).toBeNull();
    expect(createPlayerTimeAction({
      kind: "sleep",
      startedAtWorldTick: 1_860,
      startedAtPlayerStepPhase: 0,
      anchorSettlementId: 4,
    })).toBeNull();
  });

  it("rejects malformed, inconsistent, completed, and replayed receipts", () => {
    const state = createPlayerTimeAction({
      kind: "rest",
      startedAtWorldTick: 500,
      startedAtPlayerStepPhase: 9,
      anchorSettlementId: null,
    });
    if (state === null) throw new Error("REST fixture was rejected");

    expect(canonicalizePlayerTimeAction({ ...state, extra: true }, 500, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction({ ...state, version: 2 }, 500, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction({ ...state, targetWorldTick: 529 }, 500, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction({ ...state, totalSteps: 299 }, 500, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction({ ...state, completedSteps: 1 }, 500, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction({ ...state, completedSteps: state.totalSteps }, 530, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction({ ...state, anchorSettlementId: 4 }, 500, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction(state, 500, 10)).toBeNull();
    expect(canonicalizePlayerTimeAction(state, 499, 9)).toBeNull();

    const withSymbol = { ...state } as Record<PropertyKey, unknown>;
    withSymbol[Symbol("concealed")] = true;
    expect(canonicalizePlayerTimeAction(withSymbol, 500, 9)).toBeNull();

    const sleep = createPlayerTimeAction({
      kind: "sleep",
      startedAtWorldTick: 1_439,
      startedAtPlayerStepPhase: 9,
      anchorSettlementId: 12,
    });
    expect(sleep).not.toBeNull();
    if (sleep === null) throw new Error("SLEEP fixture was rejected");
    expect(canonicalizePlayerTimeAction({ ...sleep, anchorSettlementId: null }, 1_439, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction({ ...sleep, anchorSettlementId: -1 }, 1_439, 9)).toBeNull();
    expect(canonicalizePlayerTimeAction({ ...sleep, targetWorldTick: 1_801 }, 1_439, 9)).toBeNull();

    const oneStepPosition = positionAfter(state, 1);
    const twoStepPosition = positionAfter(state, 2);
    expect(advancePlayerTimeActionOneStep(state, 500, 9)).toBeNull();
    expect(advancePlayerTimeActionOneStep(
      state,
      twoStepPosition.worldTick,
      twoStepPosition.phase,
    )).toBeNull();
    const advanced = advancePlayerTimeActionOneStep(
      state,
      oneStepPosition.worldTick,
      oneStepPosition.phase,
    );
    expect(advanced?.status).toBe("active");
    if (advanced?.status !== "active") throw new Error("REST did not advance");
    expect(advancePlayerTimeActionOneStep(
      advanced.state,
      oneStepPosition.worldTick,
      oneStepPosition.phase,
    )).toBeNull();
  });

  it("fails closed on invalid constructor inputs and unsafe targets", () => {
    expect(createPlayerTimeAction({
      kind: "rest",
      startedAtWorldTick: -0,
      startedAtPlayerStepPhase: 0,
      anchorSettlementId: null,
    })).toBeNull();
    expect(createPlayerTimeAction({
      kind: "rest",
      startedAtWorldTick: 0,
      startedAtPlayerStepPhase: 10,
      anchorSettlementId: null,
    })).toBeNull();
    expect(createPlayerTimeAction({
      kind: "rest",
      startedAtWorldTick: Number.MAX_SAFE_INTEGER - 29,
      startedAtPlayerStepPhase: 0,
      anchorSettlementId: null,
    })).toBeNull();
    expect(createPlayerTimeAction({
      kind: "sleep",
      startedAtWorldTick: 1_200,
      startedAtPlayerStepPhase: 0,
      anchorSettlementId: null,
    })).toBeNull();
    expect(createPlayerTimeAction({
      kind: "sleep",
      startedAtWorldTick: 1_200,
      startedAtPlayerStepPhase: 0,
      anchorSettlementId: -0,
    })).toBeNull();
  });

  it("returns completion only after the final exact ordinary player step", () => {
    let state = createPlayerTimeAction({
      kind: "sleep",
      startedAtWorldTick: 1_799,
      startedAtPlayerStepPhase: 9,
      anchorSettlementId: 44,
    });
    if (state === null) throw new Error("SLEEP fixture was rejected");
    expect(state.totalSteps).toBe(1);

    for (let completedSteps = 1; completedSteps < state.totalSteps; completedSteps += 1) {
      const position = positionAfter(state, completedSteps);
      const result = advancePlayerTimeActionOneStep(
        state,
        position.worldTick,
        position.phase,
      );
      expect(result?.status).toBe("active");
      if (result?.status !== "active") throw new Error("SLEEP completed too early");
      state = result.state;
    }

    expect(remainingPlayerTimeActionWorldMinutes(state)).toBe(1);
    const finalPosition = positionAfter(state, 1);
    expect(finalPosition).toEqual({ worldTick: 1_800, phase: 0 });
    expect(advancePlayerTimeActionOneStep(
      state,
      finalPosition.worldTick,
      finalPosition.phase,
    )).toEqual({ status: "complete" });
  });
});
