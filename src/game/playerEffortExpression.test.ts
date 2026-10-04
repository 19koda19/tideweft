import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { hashCanonical } from "../sim/util";
import { PLAYER_MAX_FIXED_STEP_DISPLACEMENT_UNITS } from "./player";
import {
  playerEffortExpressionIntent,
  playerEffortExpressionPolicy,
  type PlayerEffortExpressionEvidence,
  type PlayerEffortExpressionInput,
} from "./playerEffortExpression";
import {
  SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT,
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionIntent,
} from "./situatedExpression";
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

  it("censuses the current effort vocabulary with deterministic cooldown and acknowledged checkpoint continuation", () => {
    // Controlled adapter facts and a kernel clock, not physical exhaustion,
    // committed audio, native-play rates, or an hours-long annoyance soak.
    const eventCount = 4_096;
    const firstStep = INPUT.committedWorldTick * 10 + INPUT.admittedAtPlayerStepPhase;
    const spacingSteps = 40;
    function intentAt(step: number): SituatedExpressionIntent {
      const mapped = playerEffortExpressionIntent({
        ...INPUT,
        committedWorldTick: Math.floor(step / 10),
        admittedAtPlayerStepPhase: step % 10,
      });
      if (mapped === null) throw new Error("Controlled effort evidence failed admission");
      return mapped;
    }

    function census(restoreAfter: number | null) {
      let state = createSituatedExpressionState(firstStep);
      const lines: Record<string, number> = {};
      const meanings: Record<string, number> = {};
      const families: Record<string, number> = {};
      const reasons: Record<string, number> = {};
      let priorLine: string | null = null;
      let adjacentExactLineRepeats = 0;
      let acknowledgements = 0;
      let maxRecent = 0;
      let traceDigest = hashCanonical("controlled-player-effort-census:v1");
      for (let index = 0; index < eventCount; index += 1) {
        const step = firstStep + index * spacingSteps;
        expect(state.completedSteps).toBe(step);
        const intent = intentAt(step);
        const admitted = reduceSituatedExpression(state, intent);
        expect(admitted.accepted).toBe(true);
        if (admitted.state === null || admitted.event === null) {
          throw new Error("Controlled effort event was not admitted");
        }
        const projected = projectSituatedExpression(admitted.event);
        if (projected === null) throw new Error("Effort event lost its authored realization");
        lines[projected.text] = (lines[projected.text] ?? 0) + 1;
        meanings[intent.meaning] = (meanings[intent.meaning] ?? 0) + 1;
        families[intent.family] = (families[intent.family] ?? 0) + 1;
        reasons[admitted.reason] = (reasons[admitted.reason] ?? 0) + 1;
        if (priorLine === projected.text) adjacentExactLineRepeats += 1;
        priorLine = projected.text;
        state = admitted.state;
        maxRecent = Math.max(maxRecent, state.recent.length);
        expect(state.recent.length).toBeLessThanOrEqual(SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT);
        const duplicate = reduceSituatedExpression(state, intent);
        expect(duplicate).toMatchObject({ accepted: false, reason: "duplicate-trigger", event: null, state });
        reasons[duplicate.reason] = (reasons[duplicate.reason] ?? 0) + 1;
        const audio = acknowledgeSituatedExpression(state);
        expect(audio.reason).toBe("acknowledged");
        expect(audio.event?.eventId).toBe(admitted.event.eventId);
        if (audio.state === null) throw new Error("Controlled effort acknowledgement failed");
        state = audio.state;
        acknowledgements += 1;
        if (index === restoreAfter) {
          const restored = canonicalizeSituatedExpressionState(JSON.parse(JSON.stringify(state)));
          expect(restored).toEqual(state);
          if (restored === null) throw new Error("Acknowledged effort checkpoint failed validation");
          state = restored;
        }
        expect(acknowledgeSituatedExpression(state)).toMatchObject({
          reason: "already-acknowledged", event: null, state,
        });
        traceDigest = hashCanonical([traceDigest, admitted.event, state]);
        const almostExpired = advanceSituatedExpression(state, 35);
        if (almostExpired === null) throw new Error("Controlled cooldown advancement failed");
        const cooldown = reduceSituatedExpression(almostExpired, intentAt(step + 35));
        expect(cooldown).toMatchObject({
          accepted: false, reason: "meaning-cooldown", event: null, state: almostExpired,
        });
        reasons[cooldown.reason] = (reasons[cooldown.reason] ?? 0) + 1;
        const advanced = advanceSituatedExpression(almostExpired, spacingSteps - 35);
        if (advanced === null) throw new Error("Controlled spacing advancement failed");
        state = advanced;
      }
      return { state, report: {
        scope: "controlled single-player effort adapter; not physical simulation or live-play rates",
        sourceActorId: INPUT.sourceActorId, attempted: eventCount * 3, accepted: eventCount,
        elapsedKernelSteps: state.completedSteps - firstStep,
        acknowledgements, maxRecent, lines, meanings, families, reasons, adjacentExactLineRepeats,
        traceDigest,
      } };
    }

    const uninterrupted = census(null);
    expect(census(null)).toEqual(uninterrupted);
    expect(census(2_047)).toEqual(uninterrupted);
    expect(uninterrupted.report).toMatchObject({
      attempted: 12_288, accepted: 4_096, acknowledgements: 4_096,
      elapsedKernelSteps: 163_840, maxRecent: SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT,
      meanings: { "need-rest-after-exertion": 4_096 },
      families: { condition: 4_096 },
      reasons: { accepted: 4_096, "duplicate-trigger": 4_096, "meaning-cooldown": 4_096 },
    });
    expect(Object.keys(uninterrupted.report.lines).sort()).toEqual([
      "Catch my breath.", "Just a second.", "Need a minute.",
    ]);
    expect(Object.values(uninterrupted.report.lines).reduce((sum, count) => sum + count, 0))
      .toBe(eventCount);
    console.info("Controlled effort-expression repetition census:", JSON.stringify(uninterrupted.report));
  });
});
