import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { hashCanonical } from "../sim/util";
import type { FallRiskEvaluation } from "./fallRisk";
import {
  playerFallCargoRecoveryExpressionIntent,
  playerTraversalExpressionIntent,
  type PlayerTraversalCargoExpressionContext,
} from "./playerTraversalExpression";
import {
  SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT,
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionIntent,
  type SituatedExpressionState,
} from "./situatedExpression";
import type { TraversalIncident } from "./traversalFeedback";
import { createWorldPosition } from "./worldPosition";

const POSITION = createWorldPosition(createRegionCoord(-14, 23), 4_000, 18_000);

function evaluation(overrides: Partial<FallRiskEvaluation> = {}): FallRiskEvaluation {
  return {
    version: 1,
    valid: true,
    evaluated: true,
    outcome: "stumbled",
    fell: false,
    stumbled: true,
    usedTraversalOrdinal: 7,
    nextTraversalOrdinal: 8,
    ordinalExhausted: false,
    roll: 540_000,
    feedbackEventId: 481,
    forecast: {
      chance: 400_000,
      stumbleChance: 280_000,
      band: "high",
      hazardSeverity: 390_000,
      seriousHazard: false,
      guaranteedByZeroStability: false,
      causes: [{
        code: "loose-rock",
        label: "Loose rock",
        intensity: 500_000,
        contribution: 220_000,
      }],
      primaryCause: "loose-rock",
      mitigation: { brace: 0, footwear: 0, fixture: 0, total: 0 },
    },
    consequenceQuote: {
      severity: "stumble",
      motion: "knockback",
      displacementSteps: 0,
      staminaShock: 80_000,
      stabilityShock: 140_000,
      cargoShock: 180_000,
      verticalExposure: 0,
    },
    ...overrides,
  };
}

function incident(overrides: Partial<TraversalIncident> = {}): TraversalIncident {
  return {
    id: "player:0:traversal:7",
    actorId: 0,
    traversalOrdinal: 7,
    kind: "stumble",
    primaryCause: "loose-rock",
    label: "oop · loose rock",
    detail: "Brace or choose a sounder line.",
    position: { x: 12, y: 14 },
    remainingSteps: 10,
    totalSteps: 10,
    variantSeed: 481,
    cue: "stumble",
    ...overrides,
  };
}

function cargo(
  overrides: Partial<PlayerTraversalCargoExpressionContext> = {},
): PlayerTraversalCargoExpressionContext {
  return {
    outcome: "impacted-carried",
    selectedPayload: {
      kind: "stack",
      item: "sunfiber",
      quantity: 2,
    },
    separatedEntityIds: [],
    cargoShock: 180_000,
    ...overrides,
  };
}

function map(
  evaluationValue = evaluation(),
  incidentValue = incident(),
  cargoValue = cargo(),
) {
  return playerTraversalExpressionIntent({
    sourceActorId: "player:local",
    position: POSITION,
    evaluation: evaluationValue,
    incident: incidentValue,
    cargo: cargoValue,
  });
}

describe("player traversal situated-expression adapter", () => {
  it("maps a mild stumble to restrained footing speech", () => {
    expect(map()).toMatchObject({
      triggerEventId: "player:0:traversal:7",
      meaning: "steady-after-stumble",
      family: "footing",
      tone: "restrained",
      knowledgeBasis: "self-felt-stumble",
    });
  });

  it("maps a severe stumble to near-fall relief without calling a fall a near-fall", () => {
    const severe = evaluation({
      forecast: {
        ...evaluation().forecast,
        hazardSeverity: 760_000,
        seriousHazard: true,
      },
    });
    expect(map(severe)).toMatchObject({
      meaning: "relief-after-near-fall",
      tone: "relieved",
      knowledgeBasis: "self-felt-near-fall",
    });

    const fell = evaluation({
      outcome: "fell",
      fell: true,
      stumbled: false,
      consequenceQuote: {
        ...evaluation().consequenceQuote!,
        severity: "fall",
        motion: "impact",
      },
    });
    expect(map(fell, incident({ kind: "fall", cue: "impact" }))).toBeNull();
  });

  it("protects important held cargo before generic near-fall speech", () => {
    const severe = evaluation({
      forecast: {
        ...evaluation().forecast,
        hazardSeverity: 720_000,
        seriousHazard: true,
      },
      consequenceQuote: {
        ...evaluation().consequenceQuote!,
        cargoShock: 520_000,
      },
    });
    expect(map(severe, incident(), cargo({
      selectedPayload: {
        kind: "promise",
        contractId: 44,
        resource: "medicine",
        quantity: 1,
        property: "fragile",
      },
      cargoShock: 520_000,
    }))).toMatchObject({
      meaning: "protect-important-cargo",
      family: "cargo",
      knowledgeBasis: "self-observed-cargo-risk",
    });
  });

  it("maps a committed parcel separation to the highest-priority alarm", () => {
    const fell = evaluation({
      outcome: "fell",
      fell: true,
      stumbled: false,
      consequenceQuote: {
        ...evaluation().consequenceQuote!,
        severity: "fall",
        motion: "impact",
        cargoShock: 880_000,
      },
    });
    expect(map(fell, incident({ kind: "fall", cue: "impact" }), cargo({
      outcome: "separated",
      selectedPayload: {
        kind: "provision",
        lotId: "provision:7",
        provision: "trail-ration",
        quantity: 1,
      },
      separatedEntityIds: ["cargo:r-14:23:18"],
      cargoShock: 880_000,
    }))).toMatchObject({
      meaning: "alarm-at-cargo-loss",
      tone: "alarmed",
      volume: "shout",
      priority: 950_000,
    });
  });

  it("maps causally proven fall-cargo recovery to relief", () => {
    expect(playerFallCargoRecoveryExpressionIntent({
      sourceActorId: "player:local",
      recoveryEventId: "cargo:event:-14:23:19",
      position: POSITION,
      variantSeed: 19,
      recoveredFrom: "fall-separation",
    })).toMatchObject({
      triggerEventId: "cargo:event:-14:23:19",
      meaning: "relief-after-cargo-recovery",
      family: "cargo",
      tone: "relieved",
      knowledgeBasis: "self-recovered-cargo",
    });
  });

  it("fails closed when traversal or cargo evidence disagrees", () => {
    expect(map(
      evaluation({ usedTraversalOrdinal: 8 }),
      incident(),
      cargo(),
    )).toBeNull();
    expect(map(
      evaluation(),
      incident(),
      cargo({ outcome: "rejected" }),
    )).toBeNull();
  });

  it("censuses thousands of controlled traversal expressions without rerolling or replaying acknowledgements", () => {
    // These are explicit adapter-contract facts, not thousands of generated
    // falls, physical pickups, native encounters, or an hours-long playtest.
    const inputCount = 4_096;
    function adapterIntent(index: number): SituatedExpressionIntent {
      const ordinal = index + 1;
      const seed = Math.imul(ordinal, 2_654_435_761) >>> 0;
      if (index % 5 === 4) {
        const recovered = playerFallCargoRecoveryExpressionIntent({
          sourceActorId: "player:local",
          recoveryEventId: `repetition:pickup:${ordinal}`,
          position: POSITION,
          variantSeed: seed,
          recoveredFrom: "fall-separation",
        });
        if (recovered === null) throw new Error("Controlled recovery facts failed admission");
        return recovered;
      }
      const separated = index % 5 === 3;
      const risk = evaluation({
        usedTraversalOrdinal: ordinal,
        nextTraversalOrdinal: ordinal + 1,
        feedbackEventId: seed,
        outcome: separated ? "fell" : "stumbled",
        fell: separated,
        stumbled: !separated,
        forecast: {
          ...evaluation().forecast,
          seriousHazard: index % 5 === 1,
          hazardSeverity: index % 5 === 1 ? 760_000 : 390_000,
        },
        consequenceQuote: {
          ...evaluation().consequenceQuote!,
          severity: separated ? "fall" : "stumble",
          motion: separated ? "impact" : "knockback",
          cargoShock: separated ? 880_000 : index % 5 === 2 ? 520_000 : 180_000,
        },
      });
      const mapped = map(risk, incident({
        id: `repetition:traversal:${ordinal}`,
        traversalOrdinal: ordinal,
        variantSeed: seed,
        kind: separated ? "fall" : "stumble",
        cue: separated ? "impact" : "stumble",
      }), cargo({
        outcome: separated ? "separated" : "impacted-carried",
        selectedPayload: index % 5 >= 2 ? {
          kind: "promise", contractId: 44, resource: "medicine",
          quantity: 1, property: "fragile",
        } : cargo().selectedPayload,
        cargoShock: risk.consequenceQuote!.cargoShock,
        separatedEntityIds: separated ? [`repetition:parcel:${ordinal}`] : [],
      }));
      if (mapped === null) throw new Error("Controlled traversal facts failed admission");
      return mapped;
    }

    function census(restoreAt: number | null) {
      let state: SituatedExpressionState = createSituatedExpressionState();
      const lines: Record<string, number> = {};
      const meanings: Record<string, number> = {};
      const families: Record<string, number> = {};
      const reasons: Record<string, number> = {};
      const priorLine: Record<string, string> = {};
      const sameMeaningRepeats: Record<string, number> = {};
      let acknowledgements = 0;
      let maxRecent = 0;
      let traceDigest = hashCanonical("controlled-player-expression-census:v1");
      for (let index = 0; index < inputCount; index += 1) {
        if (index === restoreAt) {
          const restored = canonicalizeSituatedExpressionState(JSON.parse(JSON.stringify(state)));
          expect(restored).toEqual(state);
          if (restored === null) throw new Error("Current expression checkpoint failed validation");
          state = restored;
          // This boundary is after an acknowledged cargo-protection line and
          // immediately before real adapter priority/resolution arbitration.
          expect(state.active?.meaning).toBe("protect-important-cargo");
          expect(acknowledgeSituatedExpression(state).event).toBeNull();
        }
        // Footing/held-cargo fixtures wait out current cooldowns. Loss then
        // recovery intentionally follow immediately, exercising interruption
        // and the existing loss-resolution exception without changing policy.
        if (index % 5 < 3) {
          const advanced = advanceSituatedExpression(state, 20);
          if (advanced === null) throw new Error("Controlled fixed-step advancement failed");
          state = advanced;
        }
        const intent = adapterIntent(index);
        const admitted = reduceSituatedExpression(state, intent);
        expect(admitted.accepted).toBe(true);
        if (admitted.state === null || admitted.event === null) throw new Error("Controlled event was not admitted");
        const projected = projectSituatedExpression(admitted.event);
        if (projected === null) throw new Error("Controlled event lost its authored realization");
        meanings[intent.meaning] = (meanings[intent.meaning] ?? 0) + 1;
        families[intent.family] = (families[intent.family] ?? 0) + 1;
        lines[projected.text] = (lines[projected.text] ?? 0) + 1;
        reasons[admitted.reason] = (reasons[admitted.reason] ?? 0) + 1;
        if (priorLine[intent.meaning] === projected.text) {
          sameMeaningRepeats[intent.meaning] = (sameMeaningRepeats[intent.meaning] ?? 0) + 1;
        }
        priorLine[intent.meaning] = projected.text;
        state = admitted.state;
        expect(state.recent.length).toBeLessThanOrEqual(SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT);
        maxRecent = Math.max(maxRecent, state.recent.length);
        const duplicate = reduceSituatedExpression(state, intent);
        expect(duplicate).toMatchObject({ accepted: false, reason: "duplicate-trigger", event: null });
        expect(duplicate.state).toEqual(state);
        reasons[duplicate.reason] = (reasons[duplicate.reason] ?? 0) + 1;
        const cooldown = reduceSituatedExpression(state, adapterIntent(index + inputCount * 5));
        expect(cooldown).toMatchObject({ accepted: false, reason: "meaning-cooldown", event: null });
        expect(cooldown.state).toEqual(state);
        reasons[cooldown.reason] = (reasons[cooldown.reason] ?? 0) + 1;
        const audio = acknowledgeSituatedExpression(state);
        expect(audio.reason).toBe("acknowledged");
        expect(audio.event?.eventId).toBe(admitted.event.eventId);
        if (audio.state === null) throw new Error("Controlled acknowledgement failed");
        state = audio.state;
        acknowledgements += 1;
        expect(acknowledgeSituatedExpression(state)).toMatchObject({
          reason: "already-acknowledged", event: null, state,
        });
        expect(projectSituatedExpression(state.active)).toEqual(projected);
        traceDigest = hashCanonical([traceDigest, admitted.event, state]);
      }
      return { state, report: {
        scope: "controlled single-player adapter facts; not physical simulation or live-play rates",
        sourceActorId: "player:local", attempted: inputCount * 3, accepted: inputCount,
        kernelSteps: state.completedSteps, acknowledgements, maxRecent,
        lines, meanings, families, reasons, sameMeaningRepeats, traceDigest,
      } };
    }

    const uninterrupted = census(null);
    expect(census(null)).toEqual(uninterrupted);
    expect(census(2_048)).toEqual(uninterrupted);
    expect(uninterrupted.report).toMatchObject({
      attempted: 12_288, accepted: 4_096, acknowledgements: 4_096,
      kernelSteps: 49_160, maxRecent: SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT,
      meanings: {
        "steady-after-stumble": 820, "relief-after-near-fall": 819,
        "protect-important-cargo": 819, "alarm-at-cargo-loss": 819,
        "relief-after-cargo-recovery": 819,
      },
      families: { footing: 1_639, cargo: 2_457 },
      reasons: { accepted: 2_458, interrupted: 1_638,
        "duplicate-trigger": 4_096, "meaning-cooldown": 4_096 },
    });
    expect(Object.keys(uninterrupted.report.lines)).toHaveLength(15);
    expect(Object.values(uninterrupted.report.lines).reduce((sum, count) => sum + count, 0)).toBe(inputCount);
    console.info("Controlled player-expression repetition census:", JSON.stringify(uninterrupted.report));
  });
});
