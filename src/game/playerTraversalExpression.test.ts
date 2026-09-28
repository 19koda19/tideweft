import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import type { FallRiskEvaluation } from "./fallRisk";
import {
  playerFallCargoRecoveryExpressionIntent,
  playerTraversalExpressionIntent,
  type PlayerTraversalCargoExpressionContext,
} from "./playerTraversalExpression";
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
});
