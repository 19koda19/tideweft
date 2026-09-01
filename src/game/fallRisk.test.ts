import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import {
  FALL_RISK_CAUSE_ORDER,
  FALL_RISK_VERSION,
  evaluateFallRiskOnEntry,
  type FallHazardPressure,
  type FallRiskEntry,
  type FallRiskEvaluationInput,
  type FallRiskPorter,
} from "./fallRisk";

const TEST_SEED = seedFromText("boots remember the crossing");

const BASE_HAZARDS: FallHazardPressure = {
  grade: 450_000,
  rock: 420_000,
  current: 180_000,
  depth: 220_000,
  brambleVines: 120_000,
};

const BASE_PORTER: FallRiskPorter = {
  stability: 540_000,
  loadRatio: 820_000,
  pace: "steady",
  wind: 180_000,
  brace: false,
  footwearGrip: 0,
  fixtureSupport: 0,
};

interface InputOverrides {
  readonly seed?: FallRiskEvaluationInput["seed"];
  readonly actorId?: number;
  readonly traversalOrdinal?: number;
  readonly entry?: Partial<FallRiskEntry>;
  readonly hazards?: Partial<FallHazardPressure>;
  readonly porter?: Partial<FallRiskPorter>;
}

function crossing(overrides: InputOverrides = {}): FallRiskEvaluationInput {
  return {
    seed: overrides.seed ?? TEST_SEED,
    actorId: overrides.actorId ?? 7,
    traversalOrdinal: overrides.traversalOrdinal ?? 41,
    entry: {
      kind: "hazardous-edge",
      fromTileId: 810,
      toTileId: 811,
      ...overrides.entry,
    },
    hazards: {
      ...BASE_HAZARDS,
      ...overrides.hazards,
    },
    porter: {
      ...BASE_PORTER,
      ...overrides.porter,
    },
  };
}

function expectFixed(value: number): void {
  expect(Number.isSafeInteger(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(FIXED_POINT);
}

describe("entry-scoped deterministic fall risk", () => {
  it("does not evaluate or consume an ordinal on safe entries", () => {
    const result = evaluateFallRiskOnEntry(crossing({
      entry: { kind: "safe" },
      hazards: {
        grade: FIXED_POINT,
        rock: FIXED_POINT,
        current: FIXED_POINT,
        depth: FIXED_POINT,
        brambleVines: FIXED_POINT,
        elevationDrop: FIXED_POINT,
        unsupportedGap: FIXED_POINT,
        surfaceSlip: FIXED_POINT,
      },
      porter: { stability: 0 },
    }));

    expect(result).toEqual({
      version: FALL_RISK_VERSION,
      valid: true,
      evaluated: false,
      outcome: "not-evaluated",
      fell: false,
      stumbled: false,
      usedTraversalOrdinal: null,
      nextTraversalOrdinal: 41,
      ordinalExhausted: false,
      roll: null,
      feedbackEventId: null,
      forecast: {
        chance: 0,
        stumbleChance: 0,
        band: "none",
        hazardSeverity: 0,
        seriousHazard: false,
        guaranteedByZeroStability: false,
        causes: [],
        primaryCause: null,
        mitigation: { brace: 0, footwear: 0, fixture: 0, total: 0 },
      },
      consequenceQuote: null,
    });
  });

  it("replays the same roll and consequence from the same saved ordinal", () => {
    const input = crossing();
    const first = evaluateFallRiskOnEntry(input);

    for (let index = 0; index < 30; index += 1) {
      evaluateFallRiskOnEntry(crossing({
        actorId: index + 20,
        traversalOrdinal: index * 13,
        entry: { fromTileId: index, toTileId: index + 1 },
      }));
    }

    expect(evaluateFallRiskOnEntry(input)).toEqual(first);
    expect(first.evaluated).toBe(true);
    expect(first.usedTraversalOrdinal).toBe(41);
    expect(first.nextTraversalOrdinal).toBe(42);
    expect(first.roll).not.toBeNull();
    expect(first.valid).toBe(true);
  });

  it("consumes exactly one ordinal per hazardous entry and addresses the next roll independently", () => {
    const first = evaluateFallRiskOnEntry(crossing({ traversalOrdinal: 9_000 }));
    const resumed = evaluateFallRiskOnEntry(crossing({
      traversalOrdinal: first.nextTraversalOrdinal,
    }));

    expect(first.usedTraversalOrdinal).toBe(9_000);
    expect(first.nextTraversalOrdinal).toBe(9_001);
    expect(resumed.usedTraversalOrdinal).toBe(9_001);
    expect(resumed.nextTraversalOrdinal).toBe(9_002);
    expect([resumed.roll, resumed.consequenceQuote]).not.toEqual([
      first.roll,
      first.consequenceQuote,
    ]);
  });

  it("keys results to actor and directed edge without relying on call order", () => {
    const base = evaluateFallRiskOnEntry(crossing());
    const anotherActor = evaluateFallRiskOnEntry(crossing({ actorId: 8 }));
    const reverseEdge = evaluateFallRiskOnEntry(crossing({
      entry: { fromTileId: 811, toTileId: 810 },
    }));

    expect(anotherActor.roll).not.toBe(base.roll);
    expect(reverseEdge.roll).not.toBe(base.roll);
    expect(evaluateFallRiskOnEntry(crossing())).toEqual(base);
  });

  it("folds negative and distant safe-integer addresses into the deterministic event key", () => {
    const nearby = evaluateFallRiskOnEntry(crossing({
      actorId: 23,
      entry: { fromTileId: -81, toTileId: -80 },
    }));
    const distant = evaluateFallRiskOnEntry(crossing({
      actorId: 23 + 0x1_0000_0000,
      entry: {
        fromTileId: -81 - 0x1_0000_0000,
        toTileId: -80 - 0x1_0000_0000,
      },
    }));

    expect(evaluateFallRiskOnEntry(crossing({
      actorId: 23 + 0x1_0000_0000,
      entry: {
        fromTileId: -81 - 0x1_0000_0000,
        toTileId: -80 - 0x1_0000_0000,
      },
    }))).toEqual(distant);
    expect(distant.roll).not.toBe(nearby.roll);
  });

  it("derives one replay-stable feedback event ID from an accepted mishap ordinal", () => {
    const input = crossing({
      traversalOrdinal: 77,
      hazards: { rock: 600_000 },
      porter: { stability: 0 },
    });
    const first = evaluateFallRiskOnEntry(input);
    const next = evaluateFallRiskOnEntry(crossing({
      traversalOrdinal: 78,
      hazards: { rock: 600_000 },
      porter: { stability: 0 },
    }));

    expect(first).toMatchObject({
      valid: true,
      outcome: "fell",
      fell: true,
      stumbled: false,
      usedTraversalOrdinal: 77,
      nextTraversalOrdinal: 78,
    });
    expect(Number.isSafeInteger(first.feedbackEventId)).toBe(true);
    expect(first.feedbackEventId).toBeGreaterThan(0);
    expect(evaluateFallRiskOnEntry(input)).toEqual(first);
    expect(next.feedbackEventId).not.toBe(first.feedbackEventId);
  });
});

describe("fall forecast and mitigation", () => {
  it("returns bounded forecast bands and useful named causes", () => {
    const result = evaluateFallRiskOnEntry(crossing());
    const causeCodes = result.forecast.causes.map((cause) => cause.code);

    expect(result.forecast.band).toBe("high");
    expect(result.forecast.primaryCause).toBe("low-stability");
    expect(causeCodes).toEqual(expect.arrayContaining([
      "steep-grade",
      "loose-rock",
      "strong-current",
      "deep-water",
      "bramble-vines",
      "high-wind",
      "low-stability",
      "heavy-load",
    ]));
    for (const cause of result.forecast.causes) {
      expect(FALL_RISK_CAUSE_ORDER).toContain(cause.code);
      expect(cause.label.length).toBeGreaterThan(0);
      expectFixed(cause.intensity);
      expectFixed(cause.contribution);
    }
    expectFixed(result.forecast.chance);
    expectFixed(result.forecast.hazardSeverity);
  });

  it("lets brace, footwear, and fixtures each reduce an ordinary crossing chance", () => {
    const bare = evaluateFallRiskOnEntry(crossing()).forecast;
    const braced = evaluateFallRiskOnEntry(crossing({
      porter: { brace: true },
    })).forecast;
    const shod = evaluateFallRiskOnEntry(crossing({
      porter: { footwearGrip: FIXED_POINT },
    })).forecast;
    const supported = evaluateFallRiskOnEntry(crossing({
      porter: { fixtureSupport: FIXED_POINT },
    })).forecast;

    expect(braced.chance).toBe(bare.chance - 180_000);
    expect(shod.chance).toBe(bare.chance - 160_000);
    expect(supported.chance).toBe(bare.chance - 340_000);
    expect(braced.mitigation.brace).toBe(180_000);
    expect(shod.mitigation.footwear).toBe(160_000);
    expect(supported.mitigation.fixture).toBe(340_000);
  });

  it("makes zero stability on a serious hazard a guaranteed fall even with full support", () => {
    const result = evaluateFallRiskOnEntry(crossing({
      hazards: {
        grade: 0,
        rock: 500_000,
        current: 0,
        depth: 0,
        brambleVines: 0,
      },
      porter: {
        stability: 0,
        loadRatio: 0,
        pace: "rest",
        wind: 0,
        brace: true,
        footwearGrip: FIXED_POINT,
        fixtureSupport: FIXED_POINT,
      },
    }));

    expect(result.forecast.seriousHazard).toBe(true);
    expect(result.forecast.guaranteedByZeroStability).toBe(true);
    expect(result.forecast.chance).toBe(FIXED_POINT);
    expect(result.forecast.band).toBe("certain");
    expect(result.fell).toBe(true);
    expect(result.outcome).toBe("fell");
  });

  it("does not turn zero stability into a universal fall on trivial exposure", () => {
    const result = evaluateFallRiskOnEntry(crossing({
      hazards: {
        grade: 0,
        rock: 0,
        current: 0,
        depth: 0,
        brambleVines: 100_000,
      },
      porter: {
        stability: 0,
        loadRatio: 0,
        pace: "rest",
        wind: 0,
      },
    }));

    expect(result.forecast.seriousHazard).toBe(false);
    expect(result.forecast.guaranteedByZeroStability).toBe(false);
    expect(result.forecast.chance).toBeLessThan(FIXED_POINT);
  });

  it("accounts for overweight loads and swift pace with integer pressure", () => {
    const ordinary = evaluateFallRiskOnEntry(crossing({
      porter: { loadRatio: 500_000, pace: "steady" },
    })).forecast;
    const strained = evaluateFallRiskOnEntry(crossing({
      porter: { loadRatio: 1_500_000, pace: "swift" },
    })).forecast;

    expect(strained.chance).toBeGreaterThan(ordinary.chance);
    expect(strained.causes.find((cause) => cause.code === "heavy-load")?.contribution)
      .toBeGreaterThan(ordinary.causes.find((cause) => cause.code === "heavy-load")?.contribution ?? 0);
    expect(strained.causes.find((cause) => cause.code === "travel-pace")?.label)
      .toBe("Swift pace on difficult footing");
  });

  it("keeps calm level footing dependable even at zero stability and maximum load", () => {
    const result = evaluateFallRiskOnEntry(crossing({
      hazards: {
        grade: 0,
        rock: 0,
        current: 0,
        depth: 0,
        brambleVines: 0,
        elevationDrop: 0,
        unsupportedGap: 0,
        surfaceSlip: 0,
      },
      porter: {
        stability: 0,
        loadRatio: 2 * FIXED_POINT,
        pace: "steady",
        wind: 0,
        turnPressure: 0,
      },
    }));

    expect(result).toMatchObject({
      valid: true,
      outcome: "held",
      fell: false,
      stumbled: false,
      forecast: {
        chance: 0,
        stumbleChance: 0,
        band: "none",
        seriousHazard: false,
        causes: [],
      },
      consequenceQuote: null,
    });
  });

  it("makes a sharp turn a named multiplier on already difficult footing", () => {
    const straight = evaluateFallRiskOnEntry(crossing({
      hazards: { grade: 300_000, rock: 300_000 },
      porter: {
        stability: FIXED_POINT,
        loadRatio: 0,
        pace: "steady",
        wind: 0,
        turnPressure: 0,
      },
    })).forecast;
    const turning = evaluateFallRiskOnEntry(crossing({
      hazards: { grade: 300_000, rock: 300_000 },
      porter: {
        stability: FIXED_POINT,
        loadRatio: 0,
        pace: "steady",
        wind: 0,
        turnPressure: FIXED_POINT,
      },
    })).forecast;

    expect(turning.chance).toBeGreaterThan(straight.chance);
    expect(turning.causes.find((cause) => cause.code === "sharp-turn"))
      .toMatchObject({ label: "Sharp turn" });
  });

  it("uses the one shared roll's near-miss interval for deterministic stumbles", () => {
    const result = Array.from({ length: 128 }, (_, traversalOrdinal) =>
      evaluateFallRiskOnEntry(crossing({ traversalOrdinal })))
      .find((candidate) => candidate.outcome === "stumbled");
    if (result === undefined) throw new Error("test world should expose a deterministic stumble");

    expect(result.stumbled).toBe(true);
    expect(result.fell).toBe(false);
    expect(result.roll).toBeGreaterThanOrEqual(result.forecast.chance);
    expect(result.roll).toBeLessThan(
      result.forecast.chance + result.forecast.stumbleChance,
    );
    expect(result.consequenceQuote).toMatchObject({
      severity: "stumble",
      displacementSteps: 0,
      verticalExposure: 0,
    });
    expect(result.feedbackEventId).not.toBeNull();
    expect(evaluateFallRiskOnEntry(crossing({
      traversalOrdinal: result.usedTraversalOrdinal ?? -1,
    }))).toEqual(result);
  });

  it("does not treat stamina as a second fall-risk input", () => {
    const base = crossing();
    const withUnknownStamina = {
      ...base,
      porter: { ...base.porter, stamina: 0 },
    } as FallRiskEvaluationInput;

    expect(evaluateFallRiskOnEntry(withUnknownStamina))
      .toEqual(evaluateFallRiskOnEntry(base));
  });
});

describe("quoted fall consequences", () => {
  it("quotes swept motion for current-dominated deep water", () => {
    const result = evaluateFallRiskOnEntry(crossing({
      hazards: {
        grade: 0,
        rock: 0,
        current: 850_000,
        depth: 900_000,
        brambleVines: 0,
        elevationDrop: 0,
        unsupportedGap: 0,
        surfaceSlip: 0,
      },
      porter: { stability: 0 },
    }));

    expect(result.outcome).toBe("fell");
    expect(result.consequenceQuote?.severity).toBe("fall");
    expect(result.consequenceQuote?.motion).toBe("swept");
    expect(result.consequenceQuote?.displacementSteps).toBeGreaterThanOrEqual(2);
    expect(result.consequenceQuote?.displacementSteps).toBeLessThanOrEqual(4);
  });

  it("quotes impact and vertical exposure for ravines and steep drops", () => {
    const result = evaluateFallRiskOnEntry(crossing({
      hazards: {
        grade: 300_000,
        rock: 420_000,
        current: 0,
        depth: 0,
        brambleVines: 0,
        elevationDrop: 600_000,
        unsupportedGap: 700_000,
        surfaceSlip: 180_000,
      },
    }));

    expect(result.consequenceQuote).toMatchObject({
      motion: "impact",
      displacementSteps: 1,
      verticalExposure: 950_000,
    });
    expect(result.forecast.causes.map((cause) => cause.code)).toEqual(
      expect.arrayContaining(["unsupported-gap", "elevation-drop", "slippery-surface"]),
    );
  });

  it("quotes knockback for entangling ground without water or a drop", () => {
    const result = evaluateFallRiskOnEntry(crossing({
      hazards: {
        grade: 300_000,
        rock: 100_000,
        current: 0,
        depth: 0,
        brambleVines: 650_000,
        elevationDrop: 0,
        unsupportedGap: 0,
        surfaceSlip: 0,
      },
      porter: { stability: 0 },
    }));

    expect(result.outcome).toBe("fell");
    expect(result.consequenceQuote?.motion).toBe("knockback");
    expect(result.consequenceQuote?.displacementSteps).toBeGreaterThanOrEqual(1);
    expect(result.consequenceQuote?.displacementSteps).toBeLessThanOrEqual(2);
  });

  it("uses fixture support as the future ladder/rope seam without erasing the quoted drop", () => {
    const exposed = evaluateFallRiskOnEntry(crossing({
      hazards: {
        grade: 0,
        rock: 0,
        current: 0,
        depth: 0,
        brambleVines: 0,
        unsupportedGap: 600_000,
        elevationDrop: 800_000,
        surfaceSlip: 500_000,
      },
      porter: {
        stability: 0,
        loadRatio: 0,
        pace: "rest",
        wind: 0,
        fixtureSupport: 0,
      },
    }));
    const roped = evaluateFallRiskOnEntry(crossing({
      hazards: {
        grade: 0,
        rock: 0,
        current: 0,
        depth: 0,
        brambleVines: 0,
        unsupportedGap: 600_000,
        elevationDrop: 800_000,
        surfaceSlip: 500_000,
      },
      porter: {
        stability: 0,
        loadRatio: 0,
        pace: "rest",
        wind: 0,
        fixtureSupport: FIXED_POINT,
      },
    }));

    expect(roped.forecast.chance).toBe(FIXED_POINT);
    expect(exposed.forecast.chance).toBe(FIXED_POINT);
    expect(roped.forecast.mitigation.fixture).toBe(340_000);
    expect(roped.consequenceQuote?.verticalExposure)
      .toBe(exposed.consequenceQuote?.verticalExposure);
  });

  it("keeps every quoted shock bounded and treats cargo shock as a non-mutating input", () => {
    const input = crossing({
      hazards: {
        grade: FIXED_POINT,
        rock: FIXED_POINT,
        current: FIXED_POINT,
        depth: FIXED_POINT,
        brambleVines: FIXED_POINT,
        elevationDrop: FIXED_POINT,
        unsupportedGap: FIXED_POINT,
        surfaceSlip: FIXED_POINT,
      },
      porter: { loadRatio: 2 * FIXED_POINT },
    });
    const hazardsBefore = { ...input.hazards };
    const porterBefore = { ...input.porter };
    const result = evaluateFallRiskOnEntry(input);
    const quote = result.consequenceQuote;
    if (quote === null) throw new Error("hazardous entries must quote a consequence");

    expectFixed(quote.staminaShock);
    expectFixed(quote.stabilityShock);
    expectFixed(quote.cargoShock);
    expectFixed(quote.verticalExposure);
    expect(input.hazards).toEqual(hazardsBefore);
    expect(input.porter).toEqual(porterBefore);
  });
});

describe("fall risk input hardening", () => {
  it("rejects malformed numeric inputs without consuming an ordinal or mutating input", () => {
    const hazards = {
      grade: Number.NaN,
      rock: Number.POSITIVE_INFINITY,
      current: -400,
      depth: 9_000_000,
      brambleVines: 123_456.9,
      elevationDrop: -FIXED_POINT,
      unsupportedGap: 410_000.8,
      surfaceSlip: 3 * FIXED_POINT,
    };
    const porter = {
      stability: 770_000.9,
      loadRatio: Number.POSITIVE_INFINITY,
      pace: "teleport",
      wind: 2 * FIXED_POINT,
      brace: 1,
      footwearGrip: Number.NaN,
      fixtureSupport: 450_000.2,
    };
    const input = {
      ...crossing(),
      actorId: Number.NaN,
      traversalOrdinal: -90,
      entry: { kind: "hazardous-tile", fromTileId: Number.NaN, toTileId: 51 },
      hazards,
      porter,
    } as unknown as FallRiskEvaluationInput;
    const result = evaluateFallRiskOnEntry(input);

    expect(result).toMatchObject({
      valid: false,
      evaluated: false,
      outcome: "invalid-input",
      fell: false,
      stumbled: false,
      usedTraversalOrdinal: null,
      nextTraversalOrdinal: Number.MAX_SAFE_INTEGER,
      ordinalExhausted: true,
      roll: null,
      feedbackEventId: null,
      consequenceQuote: null,
      forecast: {
        chance: FIXED_POINT,
        stumbleChance: 0,
        band: "certain",
        primaryCause: "invalid-input",
      },
    });
    expect(input.hazards).toBe(hazards);
    expect(input.porter).toBe(porter);
    expect(hazards.brambleVines).toBe(123_456.9);
    expect(porter.stability).toBe(770_000.9);
  });

  it.each([
    null,
    {},
    { ...crossing(), seed: null },
    { ...crossing(), seed: [1, 2, 3, Number.NaN] },
    { ...crossing(), entry: null },
    { ...crossing(), entry: { kind: "teleport", fromTileId: 1, toTileId: 2 } },
    { ...crossing(), hazards: null },
    { ...crossing(), porter: null },
  ])("fails closed instead of throwing for malformed structure %#", (candidate) => {
    expect(evaluateFallRiskOnEntry(candidate as FallRiskEvaluationInput)).toMatchObject({
      valid: false,
      evaluated: false,
      outcome: "invalid-input",
      roll: null,
      feedbackEventId: null,
      consequenceQuote: null,
      forecast: { band: "certain", primaryCause: "invalid-input" },
    });
  });

  it("keeps forecasts, stumble windows, event IDs, and consequences integer-bounded", () => {
    for (let sample = 0; sample < 512; sample += 1) {
      const unit = (sample * 104_729) % (FIXED_POINT + 1);
      const result = evaluateFallRiskOnEntry(crossing({
        actorId: sample % 2 === 0 ? sample : -sample,
        traversalOrdinal: sample,
        entry: {
          fromTileId: Number.MAX_SAFE_INTEGER - sample * 2,
          toTileId: Number.MAX_SAFE_INTEGER - sample * 2 - 1,
        },
        hazards: {
          grade: unit,
          rock: (unit * 3) % (FIXED_POINT + 1),
          current: (unit * 5) % (FIXED_POINT + 1),
          depth: (unit * 7) % (FIXED_POINT + 1),
          brambleVines: (unit * 11) % (FIXED_POINT + 1),
          elevationDrop: (unit * 13) % (FIXED_POINT + 1),
          unsupportedGap: (unit * 17) % (FIXED_POINT + 1),
          surfaceSlip: (unit * 19) % (FIXED_POINT + 1),
        },
        porter: {
          stability: (unit * 23) % (FIXED_POINT + 1),
          loadRatio: (unit * 29) % (2 * FIXED_POINT + 1),
          pace: sample % 3 === 0 ? "rest" : sample % 3 === 1 ? "steady" : "swift",
          wind: (unit * 31) % (FIXED_POINT + 1),
          turnPressure: (unit * 37) % (FIXED_POINT + 1),
          brace: sample % 2 === 0,
          footwearGrip: (unit * 41) % (FIXED_POINT + 1),
          fixtureSupport: (unit * 43) % (FIXED_POINT + 1),
        },
      }));

      expect(result.valid).toBe(true);
      expectFixed(result.forecast.chance);
      expectFixed(result.forecast.stumbleChance);
      expect(result.forecast.chance + result.forecast.stumbleChance)
        .toBeLessThanOrEqual(FIXED_POINT);
      expect(Number.isSafeInteger(result.nextTraversalOrdinal)).toBe(true);
      if (result.feedbackEventId !== null) {
        expect(Number.isSafeInteger(result.feedbackEventId)).toBe(true);
        expect(result.feedbackEventId).toBeGreaterThan(0);
      }
      if (result.consequenceQuote !== null) {
        expect(Number.isSafeInteger(result.consequenceQuote.displacementSteps)).toBe(true);
        expectFixed(result.consequenceQuote.staminaShock);
        expectFixed(result.consequenceQuote.stabilityShock);
        expectFixed(result.consequenceQuote.cargoShock);
        expectFixed(result.consequenceQuote.verticalExposure);
      }
    }
  });

  it("reserves the maximum ordinal as a fail-closed sentinel instead of wrapping", () => {
    const lastUsable = evaluateFallRiskOnEntry(crossing({
      traversalOrdinal: Number.MAX_SAFE_INTEGER - 1,
    }));
    const exhausted = evaluateFallRiskOnEntry(crossing({
      traversalOrdinal: Number.MAX_SAFE_INTEGER,
    }));
    const replay = evaluateFallRiskOnEntry(crossing({
      traversalOrdinal: Number.MAX_SAFE_INTEGER,
    }));

    expect(lastUsable).toMatchObject({
      valid: true,
      evaluated: true,
      usedTraversalOrdinal: Number.MAX_SAFE_INTEGER - 1,
      nextTraversalOrdinal: Number.MAX_SAFE_INTEGER,
      ordinalExhausted: true,
    });
    expect(exhausted).toMatchObject({
      valid: false,
      evaluated: false,
      outcome: "ordinal-exhausted",
      usedTraversalOrdinal: null,
      nextTraversalOrdinal: Number.MAX_SAFE_INTEGER,
      ordinalExhausted: true,
      roll: null,
      feedbackEventId: null,
      consequenceQuote: null,
    });
    expect(replay).toEqual(exhausted);
  });
});
