import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import { evaluateFallRiskOnEntry, type FallRiskEvaluationInput } from "./fallRisk";
import {
  acceptFallFeedback,
  acknowledgeIncidentCue,
  advanceTraversalFeedback,
  canonicalizeTraversalFeedback,
  createTraversalFeedbackState,
  projectPlayerBalance,
  projectTraversalIncident,
  traversalControlLocked,
} from "./traversalFeedback";

const FALL_INPUT: FallRiskEvaluationInput = {
  seed: seedFromText("feedback-test"),
  actorId: 0,
  traversalOrdinal: 0,
  entry: { kind: "hazardous-tile", fromTileId: 4, toTileId: 5 },
  hazards: {
    grade: 850_000,
    rock: FIXED_POINT,
    current: 0,
    depth: 0,
    brambleVines: 0,
    elevationDrop: 700_000,
    unsupportedGap: 0,
    surfaceSlip: 300_000,
  },
  porter: {
    stability: 0,
    loadRatio: 700_000,
    pace: "steady",
    wind: 0,
    turnPressure: 0,
    brace: false,
    footwearGrip: 0,
    fixtureSupport: 0,
  },
};

describe("persistent traversal feedback", () => {
  it("uses actor plus accepted traversal ordinal as identity and the hash only as a variant", () => {
    const evaluation = evaluateFallRiskOnEntry(FALL_INPUT);
    const accepted = acceptFallFeedback(
      createTraversalFeedbackState(),
      evaluation,
      0,
      { x: 5_500, y: 4_500 },
    );
    expect(accepted.ok).toBe(true);
    expect(accepted.incident?.id).toBe("player:0:traversal:0");
    expect(accepted.incident?.variantSeed).toBe(evaluation.feedbackEventId);
    expect(accepted.incident?.primaryCause).toBe(evaluation.forecast.primaryCause);
    expect(accepted.incident?.label).toMatch(/^THUD · (sudden drop|loose rock) \/ lost balance$/u);
    expect(accepted.state.nextTraversalOrdinal).toBe(1);
  });

  it("keeps actor-overhead copy to the short utterance while retaining explanation separately", () => {
    const accepted = acceptFallFeedback(
      createTraversalFeedbackState(),
      evaluateFallRiskOnEntry(FALL_INPUT),
      0,
      { x: 5_500, y: 4_500 },
    );
    const projected = projectTraversalIncident(accepted.incident);

    expect(projected?.label).toMatch(/^(?:THUD|WHK|WHHSH!|oop|nnf|hup|skk)$/u);
    expect(projected?.label).not.toContain("·");
    expect(projected?.label).not.toMatch(/cargo|brace|footing|balance|rock|drop/iu);
    expect(projected?.detail).toBe("Cargo can separate; regain your feet before moving.");
  });

  it("claims one sound exactly once across repeated refreshes", () => {
    const accepted = acceptFallFeedback(
      createTraversalFeedbackState(),
      evaluateFallRiskOnEntry(FALL_INPUT),
      0,
      { x: 1_500, y: 1_500 },
    );
    const first = acknowledgeIncidentCue(accepted.state);
    const second = acknowledgeIncidentCue(first.state);
    expect(first.incident?.cue).toBe("impact");
    expect(second.incident).toBeNull();
  });

  it("suppresses a loaded active incident instead of replaying its cue", () => {
    const accepted = acceptFallFeedback(
      createTraversalFeedbackState(),
      evaluateFallRiskOnEntry(FALL_INPUT),
      0,
      { x: 1_500, y: 1_500 },
    );
    const loaded = canonicalizeTraversalFeedback(structuredClone(accepted.state));
    expect(loaded.lastAudibleIncidentId).toBe(loaded.incident?.id);
    expect(acknowledgeIncidentCue(loaded).incident).toBeNull();
  });

  it("keeps incident text stable while time advances and expires it deterministically", () => {
    const accepted = acceptFallFeedback(
      createTraversalFeedbackState(),
      evaluateFallRiskOnEntry(FALL_INPUT),
      0,
      { x: 1_500, y: 1_500 },
    );
    const initial = projectTraversalIncident(accepted.state.incident);
    let state = accepted.state;
    for (let step = 0; step < 8; step += 1) state = advanceTraversalFeedback(state);
    const later = projectTraversalIncident(state.incident);
    expect(later?.id).toBe(initial?.id);
    expect(later?.label).toBe(initial?.label);
    expect(later?.progress).toBeGreaterThan(initial?.progress ?? 0);
    for (let step = 0; step < 30; step += 1) state = advanceTraversalFeedback(state);
    expect(state.incident).toBeNull();
  });

  it("uses explicit balance-state priority rather than color inference", () => {
    const base = createTraversalFeedbackState();
    expect(projectPlayerBalance(base, {
      swept: false,
      stability: FIXED_POINT,
      stabilityTrend: "steady",
    })).toBe("balanced");
    expect(projectPlayerBalance(base, {
      swept: false,
      stability: 200_000,
      stabilityTrend: "falling",
    })).toBe("swaying");
    expect(projectPlayerBalance(base, {
      swept: true,
      stability: 0,
      stabilityTrend: "falling",
    })).toBe("swept");

    const accepted = acceptFallFeedback(
      base,
      evaluateFallRiskOnEntry(FALL_INPUT),
      0,
      { x: 1_500, y: 1_500 },
    );
    expect(projectPlayerBalance(accepted.state, {
      swept: false,
      stability: 0,
      stabilityTrend: "falling",
    })).toBe("fallen");
    expect(traversalControlLocked(accepted.state)).toBe(true);
    let recovering = accepted.state;
    for (let step = 0; step < 13; step += 1) recovering = advanceTraversalFeedback(recovering);
    expect(traversalControlLocked(recovering)).toBe(false);
    expect(projectPlayerBalance(recovering, {
      swept: false,
      stability: 0,
      stabilityTrend: "falling",
    })).toBe("recovering");
  });

  it("fails closed on a present malformed ordinal instead of resetting it", () => {
    expect(() => canonicalizeTraversalFeedback({
      ...createTraversalFeedbackState(),
      nextTraversalOrdinal: -1,
    })).toThrow(/invalid traversal feedback/u);
    expect(() => canonicalizeTraversalFeedback(undefined)).toThrow(/missing traversal/u);
    expect(canonicalizeTraversalFeedback(undefined, { allowMissingLegacy: true }))
      .toEqual(createTraversalFeedbackState());
  });
});
