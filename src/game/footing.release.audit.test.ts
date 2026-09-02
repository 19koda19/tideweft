import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import {
  MAX_FOOTING_LOSS_PER_STEP,
  evaluateFooting,
  type FootingInput,
} from "./footing";

const BASE: FootingInput = {
  stability: FIXED_POINT,
  moving: true,
  surface: "firm",
  elevationDelta: 0,
  roughness: 0,
  moisture: 0,
  waterDepth: 0,
  movement: { x: FIXED_POINT, y: 0 },
  current: { x: 0, y: 0 },
  wind: { x: 0, y: 0 },
  weatherIntensity: 0,
  turnPressure: 0,
  loadRatio: 0,
  cargoShift: 0,
  pace: "steady",
  brace: false,
  footwearGrip: 0,
  fixtureSupport: 0,
  reliableGround: false,
  unsupportedEdge: 0,
};

const DEEP_CROSSING: FootingInput = {
  ...BASE,
  surface: "water",
  waterDepth: 520_000,
  current: { x: 0, y: 535_000 },
  wind: { x: 0, y: 300_000 },
  weatherIntensity: 400_000,
};

function crossingResult(brace: boolean): {
  readonly stepsToZero: number;
  readonly distancePermille: number;
  readonly stabilityAfterSixtySteps: number;
} {
  let stability = FIXED_POINT;
  let stabilityAfterSixtySteps = stability;
  let stepsToZero: number | null = null;
  for (let step = 1; step <= 200; step += 1) {
    stability = evaluateFooting({
      ...DEEP_CROSSING,
      stability,
      brace,
    }).stabilityAfter;
    if (step === 60) stabilityAfterSixtySteps = stability;
    if (stability === 0 && stepsToZero === null) stepsToZero = step;
    if (step >= 60 && stepsToZero !== null) {
      return {
        stepsToZero,
        // Production movement applies the same 0.62 BRACE speed multiplier.
        distancePermille: stepsToZero * (brace ? 620 : 1_000),
        stabilityAfterSixtySteps,
      };
    }
  }
  throw new Error("deep-water pressure incorrectly granted indefinite stability");
}

describe("release audit: crosswind recovery and BRACE crossing balance", () => {
  it("replays the representative crossing byte-identically and buys distance, not immunity", () => {
    const first = {
      unbraced: crossingResult(false),
      braced: crossingResult(true),
    };
    const replay = {
      unbraced: crossingResult(false),
      braced: crossingResult(true),
    };

    expect(replay).toEqual(first);
    expect(first).toEqual({
      unbraced: {
        stepsToZero: 34,
        distancePermille: 34_000,
        stabilityAfterSixtySteps: 0,
      },
      braced: {
        stepsToZero: 88,
        distancePermille: 54_560,
        stabilityAfterSixtySteps: 311_560,
      },
    });
    expect(first.braced.stepsToZero).toBeGreaterThan(first.unbraced.stepsToZero);
    expect(first.braced.distancePermille).toBeGreaterThan(first.unbraced.distancePermille);
  });

  it("lets a planted porter recover on a dry bank under maximum two-axis crosswind", () => {
    const bank = evaluateFooting({
      ...BASE,
      stability: 0,
      moving: false,
      pace: "rest",
      surface: "soft",
      wind: { x: FIXED_POINT, y: FIXED_POINT },
      weatherIntensity: FIXED_POINT,
      brace: true,
    });

    expect(bank.causes.map(({ code }) => code)).toContain("crosswind");
    expect(bank).toMatchObject({
      stabilityBefore: 0,
      stabilityAfter: 1_260,
      delta: 1_260,
      trend: "recovering",
    });
  });

  it("does not allow dry-ground correction on an unsupported edge", () => {
    const edge = evaluateFooting({
      ...BASE,
      stability: 0,
      moving: false,
      pace: "rest",
      brace: true,
      unsupportedEdge: FIXED_POINT,
    });

    expect(edge.primaryCause).toBe("unsupported-edge");
    expect(edge.stabilityAfter).toBe(0);
    expect(edge.delta).toBe(0);

    const bracedRock = evaluateFooting({
      ...BASE,
      surface: "rock",
      roughness: FIXED_POINT,
      elevationDelta: -800_000,
      brace: true,
    });
    expect(bracedRock.causes.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "loose-rock",
      "steep-grade",
      "downhill-acceleration",
    ]));
    expect(bracedRock.delta).toBeLessThan(0);
    expect(bracedRock.trend).toBe("falling");
  });

  it("keeps malformed extremes deterministic, integer bounded, and loss capped", () => {
    const malformed: FootingInput = {
      ...BASE,
      stability: Number.NaN,
      elevationDelta: Number.NEGATIVE_INFINITY,
      roughness: Number.POSITIVE_INFINITY,
      moisture: Number.MAX_VALUE,
      waterDepth: Number.MAX_VALUE,
      movement: { x: Number.NaN, y: Number.MAX_SAFE_INTEGER },
      current: { x: Number.MIN_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
      wind: { x: Number.MAX_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER },
      weatherIntensity: Number.MAX_VALUE,
      turnPressure: Number.MAX_VALUE,
      loadRatio: Number.MAX_VALUE,
      cargoShift: Number.MAX_VALUE,
      pace: "swift",
      brace: true,
      footwearGrip: Number.NaN,
      fixtureSupport: Number.NEGATIVE_INFINITY,
      unsupportedEdge: Number.MAX_VALUE,
    };

    const first = evaluateFooting(malformed);
    const replay = evaluateFooting(structuredClone(malformed));
    expect(replay).toEqual(first);
    expect(Number.isSafeInteger(first.stabilityAfter)).toBe(true);
    expect(first.stabilityAfter).toBeGreaterThanOrEqual(0);
    expect(first.stabilityAfter).toBeLessThanOrEqual(FIXED_POINT);
    expect(first.delta).toBeGreaterThanOrEqual(-MAX_FOOTING_LOSS_PER_STEP);
    expect(first.delta).toBeLessThanOrEqual(MAX_FOOTING_LOSS_PER_STEP);
  });
});
