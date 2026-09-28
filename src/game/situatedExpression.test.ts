import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import {
  SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT,
  SITUATED_EXPRESSION_VERSION,
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionIntent,
  type SituatedExpressionState,
} from "./situatedExpression";
import { createWorldPosition } from "./worldPosition";

const SPEAKER_ID = "H-expression-test";
const POSITION = createWorldPosition(createRegionCoord(-7, 12), 23_000, 41_000);

function stumbleIntent(
  triggerEventId: string,
  overrides: Partial<SituatedExpressionIntent> = {},
): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "steady-after-stumble",
    family: "footing",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-felt-stumble",
    priority: 180_000,
    salience: 260_000,
    variantSeed: 17,
    durationSteps: 4,
    ...overrides,
  };
}

function protectCargoIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "protect-important-cargo",
    family: "cargo",
    tone: "strained",
    volume: "spoken",
    knowledgeBasis: "self-observed-cargo-risk",
    priority: 420_000,
    salience: 540_000,
    variantSeed: 81,
    durationSteps: 12,
  };
}

function cargoLossIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "alarm-at-cargo-loss",
    family: "cargo",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-observed-cargo-loss",
    priority: 950_000,
    salience: 980_000,
    variantSeed: 144,
    durationSteps: 9,
  };
}

function cargoRecoveryIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "relief-after-cargo-recovery",
    family: "cargo",
    tone: "relieved",
    volume: "spoken",
    knowledgeBasis: "self-recovered-cargo",
    priority: 520_000,
    salience: 720_000,
    variantSeed: 233,
    durationSteps: 7,
  };
}

function accepted(
  state: SituatedExpressionState,
  intent: SituatedExpressionIntent,
): SituatedExpressionState {
  const reduction = reduceSituatedExpression(state, intent);
  if (!reduction.accepted || reduction.state === null) {
    throw new Error(`Expected expression acceptance, received ${reduction.reason}`);
  }
  return reduction.state;
}

describe("generic situated-expression kernel", () => {
  it("suppresses a repeated mild stumble by semantic meaning", () => {
    const first = reduceSituatedExpression(
      createSituatedExpressionState(),
      stumbleIntent("traversal:stumble:1"),
    );
    expect(first).toMatchObject({
      accepted: true,
      reason: "accepted",
      silenceReason: null,
    });
    if (first.state === null) throw new Error("Accepted expression omitted state");

    const afterVisibleExpiry = advanceSituatedExpression(first.state, 4);
    if (afterVisibleExpiry === null) throw new Error("Valid state failed to advance");
    expect(afterVisibleExpiry.active).toBeNull();
    const repeated = reduceSituatedExpression(
      afterVisibleExpiry,
      stumbleIntent("traversal:stumble:2", { variantSeed: 18 }),
    );
    expect(repeated).toMatchObject({
      accepted: false,
      reason: "meaning-cooldown",
      silenceReason: "meaning-cooldown",
      event: null,
    });
    expect(repeated.state).toEqual(afterVisibleExpiry);
    expect(reduceSituatedExpression(
      afterVisibleExpiry,
      stumbleIntent("traversal:stumble:1"),
    )).toMatchObject({
      accepted: false,
      reason: "duplicate-trigger",
    });
  });

  it("lets urgent cargo loss interrupt lower-priority cargo protection", () => {
    const protecting = accepted(
      createSituatedExpressionState(),
      protectCargoIntent("cargo:risk:1"),
    );
    const alarm = reduceSituatedExpression(protecting, cargoLossIntent("cargo:loss:1"));
    expect(alarm).toMatchObject({
      accepted: true,
      reason: "interrupted",
      event: {
        sourceActorId: SPEAKER_ID,
        triggerEventId: "cargo:loss:1",
        meaning: "alarm-at-cargo-loss",
        family: "cargo",
        vocalization: "alarm",
        audioAcknowledged: false,
      },
    });
    expect(alarm.state?.active).toEqual(alarm.event);
  });

  it("lets committed cargo recovery immediately resolve the active loss alarm", () => {
    const protecting = accepted(
      createSituatedExpressionState(),
      protectCargoIntent("cargo:risk:2"),
    );
    const alarm = reduceSituatedExpression(protecting, cargoLossIntent("cargo:loss:2"));
    if (alarm.state === null) throw new Error("Cargo-loss alarm omitted state");

    const recovery = reduceSituatedExpression(
      alarm.state,
      cargoRecoveryIntent("cargo:recovery:2"),
    );
    expect(recovery).toMatchObject({
      accepted: true,
      reason: "interrupted",
      event: {
        meaning: "relief-after-cargo-recovery",
        vocalization: "relief",
        remainingSteps: 7,
      },
    });
    if (recovery.state === null) throw new Error("Cargo recovery omitted state");
    expect(reduceSituatedExpression(
      recovery.state,
      cargoRecoveryIntent("cargo:recovery:3"),
    )).toMatchObject({
      accepted: false,
      reason: "meaning-cooldown",
    });
  });

  it("acknowledges active audio exactly once without consuming text projection", () => {
    const state = accepted(
      createSituatedExpressionState(),
      cargoLossIntent("cargo:loss:audio"),
    );
    const first = acknowledgeSituatedExpression(state);
    expect(first).toMatchObject({
      reason: "acknowledged",
      event: { audioAcknowledged: true, vocalization: "alarm" },
    });
    if (first.state === null || first.event === null) {
      throw new Error("First acknowledgement omitted state or event");
    }
    expect(projectSituatedExpression(first.event)).toMatchObject({
      realizationKey: first.event.realizationKey,
      vocalization: "alarm",
    });

    const second = acknowledgeSituatedExpression(first.state);
    expect(second).toEqual({
      reason: "already-acknowledged",
      state: first.state,
      event: null,
    });
  });

  it("selects authored realization deterministically without storing prose", () => {
    const intent = stumbleIntent("traversal:stable-realization", { variantSeed: 4_294_967_295 });
    const first = reduceSituatedExpression(createSituatedExpressionState(), intent);
    const second = reduceSituatedExpression(createSituatedExpressionState(), structuredClone(intent));
    expect(first.event).toEqual(second.event);
    if (first.event === null) throw new Error("Deterministic expression was not accepted");

    const projection = projectSituatedExpression(first.event);
    expect(projection).toEqual(projectSituatedExpression(structuredClone(first.event)));
    expect(projection?.realizationKey).toBe(first.event.realizationKey);
    expect(projection?.vocalization).toBe("steady");
    expect(projection?.text.length).toBeGreaterThan(0);
    expect(Object.keys(first.event)).not.toContain("text");
    expect(JSON.stringify(first.event)).not.toContain(projection?.text ?? "impossible-text");
  });

  it("fails closed on malformed input and keeps recent memory bounded", () => {
    const validState = createSituatedExpressionState();
    const invalidIntent = {
      ...stumbleIntent("traversal:malformed"),
      knowledgeBasis: "self-observed-cargo-loss",
    };
    expect(reduceSituatedExpression(validState, invalidIntent)).toEqual({
      accepted: false,
      reason: "invalid-intent",
      silenceReason: "invalid-intent",
      state: validState,
      event: null,
    });
    expect(reduceSituatedExpression(
      { ...validState, completedSteps: -1 },
      stumbleIntent("traversal:valid"),
    )).toEqual({
      accepted: false,
      reason: "invalid-state",
      silenceReason: "invalid-state",
      state: null,
      event: null,
    });
    expect(advanceSituatedExpression({ ...validState, recent: [{}] })).toBeNull();
    expect(acknowledgeSituatedExpression({ ...validState, extra: true })).toEqual({
      reason: "invalid-state",
      state: null,
      event: null,
    });

    let state = validState;
    for (let index = 0; index < SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT + 3; index += 1) {
      state = accepted(state, stumbleIntent(`traversal:bounded:${index}`, {
        variantSeed: index,
      }));
      const advanced = advanceSituatedExpression(state, 12);
      if (advanced === null) throw new Error("Bounded-memory state failed to advance");
      state = advanced;
    }
    expect(state.recent).toHaveLength(SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.recent)).toBe(true);

    const projected = reduceSituatedExpression(
      createSituatedExpressionState(),
      stumbleIntent("traversal:forged-projection"),
    ).event;
    if (projected === null) throw new Error("Projection fixture was not accepted");
    const tampered = {
      ...projected,
      realizationKey: "situated-expression.en.v1.forged.0",
    };
    expect(projectSituatedExpression(tampered)).toBeNull();
  });
});
