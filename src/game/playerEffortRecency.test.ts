import { describe, expect, it } from "vitest";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { playerEffortExpressionPolicy } from "./playerEffortExpression";
import {
  canonicalizePlayerEffortRecencyState,
  createPlayerEffortRecencyState,
  playerEffortRecencyAllowsExpression,
  recordAcceptedPlayerEffortExpression,
  type PlayerEffortRecencyReceipt,
} from "./playerEffortRecency";
import { createPlayerStepStateAnchor, createPlayerStepStateSample } from "./playerStepState";
import { createPlayerExhaustionExpressionAdmissionRecord } from "./situatedExpressionAdmissionLedger";
import { createWorldPosition, translateWorldPosition } from "./worldPosition";

const SEED = seedFromText("accepted exhaustion history");
function receipt(ordinal = 0): PlayerEffortRecencyReceipt {
  const evidence = {
    committedWorldTick: 420, admittedAtPlayerStepPhase: Math.min(9, ordinal + 1),
    acceptedDistanceUnits: 105, resolution: "dry-exhaustion-camp" as const,
  };
  const policy = playerEffortExpressionPolicy("player:local", evidence);
  const admission = policy === null ? null : createPlayerExhaustionExpressionAdmissionRecord({
    ...evidence, sourceActorId: "player:local", triggerEventId: policy.triggerEventId, sampleOrdinal: 0,
  });
  const step = createPlayerStepStateSample({
    sampleOrdinal: ordinal, staminaBefore: 12_500, staminaAfter: 0,
    modeBefore: "foot", modeAfter: "camp", acceptedDistanceUnits: 105, moved: true,
    exhausted: true, rescued: false, becameSwept: false, traversalIncidentKind: null,
    startingWaterDepth: 0, endingWaterDepth: 0,
  });
  const predecessor = createPlayerStepStateAnchor(ordinal, 12_500, "foot");
  if (admission?.kind !== "player-exhaustion" || step === null || predecessor === null) throw new Error("invalid fixture");
  const beforePosition = createWorldPosition(createRegionCoord(-1, 2), 63_990, 30_000);
  return { admission, step, predecessor, beforePosition, afterPosition: translateWorldPosition(beforePosition, 105, 0) };
}

describe("bounded accepted effort recency, separate from sound carry", () => {
  it("blocks through35 accepted steps and expires exactly at36 across intervals", () => {
    const state = recordAcceptedPlayerEffortExpression(SEED, receipt());
    expect(state).not.toBeNull();
    for (let steps = 0; steps < 36; steps += 1) {
      const phase = 1 + steps;
      expect(playerEffortRecencyAllowsExpression(state, SEED, {
        completedTick: 420 + Math.floor(phase / 10), playerStepPhase: phase % 10,
      })).toBe(false);
    }
    expect(playerEffortRecencyAllowsExpression(state, SEED, { completedTick: 423, playerStepPhase: 7 })).toBe(true);
  });

  it("normalizes actual phase ten, rather than admission's compatibility phase-nine clamp", () => {
    const state = recordAcceptedPlayerEffortExpression(SEED, receipt(9));
    expect(state?.lastAccepted?.step.sampleOrdinal).toBe(9);
    expect(canonicalizePlayerEffortRecencyState(state, SEED, { completedTick: 420, playerStepPhase: 9 })).toBeNull();
    expect(playerEffortRecencyAllowsExpression(state, SEED, { completedTick: 421, playerStepPhase: 0 })).toBe(false);
    expect(playerEffortRecencyAllowsExpression(state, SEED, { completedTick: 424, playerStepPhase: 5 })).toBe(false);
    expect(playerEffortRecencyAllowsExpression(state, SEED, { completedTick: 424, playerStepPhase: 6 })).toBe(true);
  });

  it("uses only accepted clock frontiers; pause and batched continuation do not invent decay", () => {
    const state = recordAcceptedPlayerEffortExpression(SEED, receipt());
    const paused = { completedTick: 420, playerStepPhase: 1 };
    expect(canonicalizePlayerEffortRecencyState(state, SEED, paused)).toEqual(state);
    expect(canonicalizePlayerEffortRecencyState(JSON.parse(JSON.stringify(state)), SEED, paused)).toEqual(state);
    let sequential = state;
    for (let phase = 2; phase <= 37; phase += 1) {
      sequential = canonicalizePlayerEffortRecencyState(sequential, SEED, {
        completedTick: 420 + Math.floor(phase / 10), playerStepPhase: phase % 10,
      });
    }
    expect(sequential).toEqual(canonicalizePlayerEffortRecencyState(state, SEED, { completedTick: 423, playerStepPhase: 7 }));
    expect(sequential).toEqual(createPlayerEffortRecencyState(SEED));
  });

  it("rejects malformed, cross-world, future or contradictory accepted-history facts", () => {
    const valid = recordAcceptedPlayerEffortExpression(SEED, receipt());
    if (valid?.lastAccepted == null) throw new Error("invalid fixture");
    const last = valid.lastAccepted;
    for (const invalid of [
      { ...valid, version: 2 }, { ...valid, remainingSteps: 35 },
      { ...valid, rootSeed: seedFromText("wrong world") },
      { ...valid, lastAccepted: { ...last, caption: "fake" } },
      { ...valid, lastAccepted: { ...last, admission: { ...last.admission, committedWorldTick: 421 } } },
      { ...valid, lastAccepted: { ...last, admission: { ...last.admission, sourceActorId: "resident:1" } } },
      { ...valid, lastAccepted: { ...last, admission: { ...last.admission, admittedAtPlayerStepPhase: 2 } } },
      { ...valid, lastAccepted: { ...last, predecessor: { ...last.predecessor, stamina: 14_000 } } },
      { ...valid, lastAccepted: { ...last, step: { ...last.step, startingWaterDepth: 1_000_000 } } },
      { ...valid, lastAccepted: { ...last, afterPosition: last.beforePosition } },
      { ...valid, lastAccepted: [last, last] },
    ]) expect(canonicalizePlayerEffortRecencyState(invalid, SEED, { completedTick: 420, playerStepPhase: 1 })).toBeNull();
  });

  it("retains one frozen historical fact without any replayable acoustic authority", () => {
    const state = recordAcceptedPlayerEffortExpression(SEED, receipt());
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state?.lastAccepted?.step)).toBe(true);
    expect(JSON.stringify(state).length).toBeLessThan(2_000);
    expect(Object.keys(state?.lastAccepted ?? {}).sort()).toEqual([
      "admission", "afterPosition", "beforePosition", "predecessor", "step",
    ]);
  });
});
