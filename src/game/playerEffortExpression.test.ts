import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { PLAYER_MAX_FIXED_STEP_DISPLACEMENT_UNITS } from "./player";
import {
  playerEffortExpressionIntent,
  playerEffortExpressionPolicy,
  type PlayerEffortExpressionEvidence,
  type PlayerEffortExpressionInput,
} from "./playerEffortExpression";
import { createWorldPosition } from "./worldPosition";

const INPUT: PlayerEffortExpressionInput = Object.freeze({
  sourceActorId: "player:local",
  position: createWorldPosition(createRegionCoord(-4, 7), 31_000, 18_000),
  committedWorldTick: 28,
  admittedAtPlayerStepPhase: 6,
  acceptedDistanceUnits: 105,
  resolution: "dry-exhaustion-camp",
});

const EVIDENCE: PlayerEffortExpressionEvidence = Object.freeze({
  committedWorldTick: INPUT.committedWorldTick,
  admittedAtPlayerStepPhase: INPUT.admittedAtPlayerStepPhase,
  acceptedDistanceUnits: INPUT.acceptedDistanceUnits,
  resolution: INPUT.resolution,
});

describe("player dry-exhaustion Living Voice adapter", () => {
  it("maps one committed positive-to-zero dry movement transition", () => {
    const intent = playerEffortExpressionIntent(INPUT);
    expect(intent).toMatchObject({
      sourceActorId: "player:local",
      meaning: "need-rest-after-exertion",
      family: "condition",
      tone: "strained",
      volume: "murmur",
      knowledgeBasis: "self-felt-exhaustion",
      priority: 260_000,
      salience: 440_000,
      durationSteps: 8,
    });
    expect(intent?.triggerEventId).toMatch(/^player-dry-exhaustion:[0-9a-f]{16}$/u);
    expect(playerEffortExpressionIntent(INPUT)).toEqual(intent);
  });

  it("binds event identity to the exact causal transition", () => {
    const first = playerEffortExpressionPolicy(INPUT.sourceActorId, EVIDENCE);
    const laterPhase = playerEffortExpressionPolicy(INPUT.sourceActorId, {
      ...EVIDENCE,
      admittedAtPlayerStepPhase: 7,
    });
    const fartherStep = playerEffortExpressionPolicy(INPUT.sourceActorId, {
      ...EVIDENCE,
      acceptedDistanceUnits: 104,
    });
    expect(first).not.toBeNull();
    expect(laterPhase?.triggerEventId).not.toBe(first?.triggerEventId);
    expect(fartherStep?.triggerEventId).not.toBe(first?.triggerEventId);
  });

  it("rejects recovery, stationary, impossible, or non-dry evidence", () => {
    for (const invalid of [
      { ...INPUT, committedWorldTick: -0 },
      { ...INPUT, acceptedDistanceUnits: 0 },
      {
        ...INPUT,
        acceptedDistanceUnits: PLAYER_MAX_FIXED_STEP_DISPLACEMENT_UNITS + 1,
      },
      { ...INPUT, admittedAtPlayerStepPhase: 0 },
      { ...INPUT, admittedAtPlayerStepPhase: 10 },
      { ...INPUT, resolution: "swept" },
    ]) {
      expect(playerEffortExpressionIntent(invalid as PlayerEffortExpressionInput)).toBeNull();
    }
  });

  it("rejects extra best-effort fields instead of silently guessing", () => {
    expect(playerEffortExpressionIntent({
      ...INPUT,
      becameSwept: false,
    } as PlayerEffortExpressionInput)).toBeNull();
  });
});
