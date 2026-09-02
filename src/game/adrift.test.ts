import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import {
  ADRIFT_MAX_VELOCITY,
  ADRIFT_MIN_STROKE_STAMINA,
  ADRIFT_STAND_DEPTH,
  ADRIFT_STAND_STAMINA,
  evaluateAdriftMotion,
  type AdriftMotionInput,
  type AdriftMotionResult,
} from "./adrift";
import { surfaceCurrentDirection } from "./currentDirection";

const BASE_INPUT: AdriftMotionInput = Object.freeze({
  current: Object.freeze({ x: 1, y: 0 }),
  guideDirection: Object.freeze({ x: 1, y: 0 }),
  control: Object.freeze({ x: 0, y: 0 }),
  stamina: 600_000,
  waterDepth: 520_000,
  loadRatioFixed: 0,
  currentMitigationPermille: 0,
  paddleAssistPermille: 0,
  support: null,
});

function evaluate(overrides: Partial<AdriftMotionInput> = {}): AdriftMotionResult {
  return evaluateAdriftMotion({ ...BASE_INPUT, ...overrides });
}

function magnitude(vector: { readonly x: number; readonly y: number }): number {
  return Math.hypot(vector.x, vector.y);
}

describe("ADRIFT motion kernel", () => {
  it("lets an idle floating porter catch their breath slowly without stopping the current", () => {
    const result = evaluate({ stamina: 0 });

    expect(result).toMatchObject({
      paddling: false,
      catchingBreath: true,
      staminaDelta: 2_800,
      canStand: false,
      paddleContribution: { x: 0, y: 0 },
    });
    expect(result.flowContribution.x).toBeGreaterThan(0);
    expect(result.velocity).toEqual(result.flowContribution);
  });

  it("turns a too-exhausted attempted stroke into slower breath recovery", () => {
    const result = evaluate({
      control: { x: 0, y: -1 },
      stamina: ADRIFT_MIN_STROKE_STAMINA - 1,
    });

    expect(result).toMatchObject({
      paddling: false,
      catchingBreath: true,
      staminaDelta: 1_800,
      paddleContribution: { x: 0, y: 0 },
    });
  });

  it("charges every intentional stroke and leaves recovery for non-paddling ticks", () => {
    const stroke = evaluate({ control: { x: 0, y: 1 } });
    const rest = evaluate({ control: { x: 0, y: 0 } });

    expect(stroke.paddling).toBe(true);
    expect(stroke.catchingBreath).toBe(false);
    expect(stroke.staminaDelta).toBeLessThan(0);
    expect(stroke.paddleContribution.y).toBeGreaterThan(0);
    expect(rest.staminaDelta).toBeGreaterThan(0);
  });

  it("allows getting upright only in shallow-enough water with end-of-tick reserve", () => {
    expect(evaluate({
      waterDepth: ADRIFT_STAND_DEPTH,
      stamina: ADRIFT_STAND_STAMINA,
    }).canStand).toBe(true);
    expect(evaluate({
      waterDepth: ADRIFT_STAND_DEPTH + 1,
      stamina: FIXED_POINT,
    }).canStand).toBe(false);
    expect(evaluate({
      waterDepth: ADRIFT_STAND_DEPTH,
      stamina: ADRIFT_STAND_STAMINA - 2_800,
    })).toMatchObject({ staminaDelta: 2_800, canStand: true });
    expect(evaluate({
      waterDepth: ADRIFT_STAND_DEPTH,
      stamina: ADRIFT_STAND_STAMINA - 2_801,
    }).canStand).toBe(false);
  });

  it("keeps the current meaningful when paddling upstream without assistance", () => {
    const upstream = evaluate({ control: { x: -1, y: 0 } });
    const lateral = evaluate({ control: { x: 0, y: 1 } });
    const downstream = evaluate({ control: { x: 1, y: 0 } });

    expect(upstream.paddleContribution.x).toBeLessThan(0);
    expect(upstream.velocity.x).toBeGreaterThan(0);
    expect(upstream.velocity.x).toBeLessThan(upstream.flowContribution.x);
    expect(lateral.velocity.x).toBe(lateral.flowContribution.x);
    expect(lateral.velocity.y).toBeGreaterThan(0);
    expect(downstream.velocity.x).toBeGreaterThan(lateral.velocity.x);
  });

  it("retains the ordered cross-current ratio from the shared public vector", () => {
    const quote = (windY: number) => evaluate({
      current: surfaceCurrentDirection(-1, windY),
      guideDirection: { x: 0, y: 0 },
    }).flowContribution;
    const calm = quote(0);
    const moderate = quote(240_000);
    const maximum = quote(FIXED_POINT);
    const mirrored = quote(-240_000);

    expect(calm.y).toBe(0);
    expect(moderate.y).toBeGreaterThan(0);
    expect(maximum.y).toBeGreaterThan(moderate.y);
    expect(mirrored).toEqual({ x: moderate.x, y: -moderate.y });
    expect(calm.x).toBeGreaterThanOrEqual(moderate.x);
    expect(moderate.x).toBeGreaterThanOrEqual(maximum.x);
  });

  it("never turns maximum supported upstream effort into upstream escape", () => {
    const run = () => {
      let stamina = FIXED_POINT;
      let x = 0;
      const velocities: number[] = [];
      for (let tick = 0; tick < 512; tick += 1) {
        const result = evaluate({
          current: { x: 1, y: 0 },
          // An obstacle-safe guide may bend strongly toward the bank. Direct
          // upstream input still cannot exploit that bend to reverse the
          // physical x-current over time.
          guideDirection: { x: -1, y: 1 },
          control: { x: -1, y: 0 },
          stamina,
          waterDepth: FIXED_POINT,
          loadRatioFixed: 0,
          currentMitigationPermille: 1_000,
          paddleAssistPermille: 1_000,
          support: "ferry",
        });
        stamina = Math.max(0, Math.min(FIXED_POINT, stamina + result.staminaDelta));
        x += result.velocity.x;
        velocities.push(result.velocity.x);
        expect(result.velocity.x).toBeGreaterThanOrEqual(1);
      }
      return { stamina, x, velocities };
    };

    const first = run();
    const second = run();
    expect(first.x).toBeGreaterThan(0);
    expect(first).toEqual(second);
  });

  it("retains lateral steering while enforcing the supported upstream floor", () => {
    const upstream = evaluate({
      control: { x: -1, y: 0 },
      waterDepth: FIXED_POINT,
      currentMitigationPermille: 1_000,
      paddleAssistPermille: 1_000,
      support: "ferry",
    });
    const diagonal = evaluate({
      control: { x: -1, y: 1 },
      waterDepth: FIXED_POINT,
      currentMitigationPermille: 1_000,
      paddleAssistPermille: 1_000,
      support: "ferry",
    });

    expect(upstream.velocity.x).toBeGreaterThanOrEqual(1);
    expect(diagonal.velocity.x).toBeGreaterThanOrEqual(0);
    expect(diagonal.velocity.y).toBeGreaterThan(0);
  });

  it("lets a heavy load weaken paddling without weakening the water itself", () => {
    const light = evaluate({ control: { x: 0, y: 1 }, loadRatioFixed: 0 });
    const heavy = evaluate({ control: { x: 0, y: 1 }, loadRatioFixed: FIXED_POINT });

    expect(heavy.flowContribution).toEqual(light.flowContribution);
    expect(magnitude(heavy.paddleContribution)).toBeLessThan(magnitude(light.paddleContribution));
    expect(heavy.staminaDelta).toBeLessThan(light.staminaDelta);
  });

  it("preserves residual flow under maximum mitigation while ferry support helps physically", () => {
    const unsupported = evaluate({
      control: { x: 0, y: 1 },
      currentMitigationPermille: 1_000,
      paddleAssistPermille: 0,
      support: null,
    });
    const ferry = evaluate({
      control: { x: 0, y: 1 },
      currentMitigationPermille: 1_000,
      paddleAssistPermille: 0,
      support: "ferry",
    });

    expect(unsupported.flowContribution.x).toBeGreaterThan(0);
    expect(ferry.flowContribution.x).toBeGreaterThan(0);
    expect(magnitude(ferry.paddleContribution)).toBeGreaterThan(
      magnitude(unsupported.paddleContribution),
    );
    expect(ferry.staminaDelta).toBeGreaterThan(unsupported.staminaDelta);
    // Assistance changes movement; it never teleports or clears all flow.
    expect(magnitude(ferry.velocity)).toBeLessThanOrEqual(ADRIFT_MAX_VELOCITY);
  });

  it("uses the guide as a bounded downstream bend instead of replacing current", () => {
    const straight = evaluate({ guideDirection: { x: 1, y: 0 } });
    const guided = evaluate({ guideDirection: { x: 0, y: 1 } });
    const opposed = evaluate({ guideDirection: { x: -1, y: 0 } });

    expect(guided.flowContribution.x).toBeGreaterThan(0);
    expect(guided.flowContribution.y).toBeGreaterThan(0);
    expect(guided.flowContribution.x).toBeGreaterThan(guided.flowContribution.y);
    expect(opposed.flowContribution.x).toBeGreaterThan(0);
    expect(straight.flowContribution.y).toBe(0);
  });

  it("normalizes diagonals rather than granting a square-speed advantage", () => {
    const cardinal = evaluate({
      current: { x: 0, y: 0 },
      guideDirection: { x: 0, y: 0 },
      control: { x: 1, y: 0 },
    });
    const diagonal = evaluate({
      current: { x: 0, y: 0 },
      guideDirection: { x: 0, y: 0 },
      control: { x: 1, y: 1 },
    });

    expect(magnitude(diagonal.velocity)).toBeLessThanOrEqual(magnitude(cardinal.velocity));
    expect(diagonal.velocity.x).toBe(diagonal.velocity.y);
  });

  it("fails malformed values closed to finite bounded integer outputs", () => {
    const malformed = evaluateAdriftMotion({
      current: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      guideDirection: { x: Number.NEGATIVE_INFINITY, y: Number.NaN },
      control: { x: Number.POSITIVE_INFINITY, y: Number.NaN },
      stamina: Number.NaN,
      waterDepth: Number.NaN,
      loadRatioFixed: Number.POSITIVE_INFINITY,
      currentMitigationPermille: Number.NaN,
      paddleAssistPermille: Number.POSITIVE_INFINITY,
      support: "raft" as never,
    });

    expect(malformed).toMatchObject({
      velocity: { x: 0, y: 0 },
      flowContribution: { x: 0, y: 0 },
      paddleContribution: { x: 0, y: 0 },
      paddling: false,
      catchingBreath: true,
      canStand: false,
    });
    expectEveryNumberIsBoundedInteger(malformed);
  });

  it("bounds every extreme finite fixture and conserves contribution sums", () => {
    const fixtures: readonly Partial<AdriftMotionInput>[] = [
      {
        current: { x: Number.MAX_VALUE, y: -Number.MAX_VALUE },
        control: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
        stamina: Number.MAX_VALUE,
        waterDepth: Number.MAX_VALUE,
        loadRatioFixed: -Number.MAX_VALUE,
        currentMitigationPermille: -Number.MAX_VALUE,
        paddleAssistPermille: Number.MAX_VALUE,
        support: "ferry",
      },
      {
        current: { x: -999_999, y: 317_000 },
        guideDirection: { x: 314_159, y: -271_828 },
        control: { x: 781_231, y: -992_341 },
        stamina: 16_000,
        waterDepth: 1_000_000,
        loadRatioFixed: 999_999,
        currentMitigationPermille: 999,
        paddleAssistPermille: 1_000,
      },
      {
        current: { x: 1, y: 1 },
        guideDirection: { x: -1, y: 1 },
        control: { x: 1, y: 1 },
        stamina: FIXED_POINT,
        waterDepth: FIXED_POINT,
      },
    ];

    for (const fixture of fixtures) {
      const result = evaluate(fixture);
      expectEveryNumberIsBoundedInteger(result);
      expect(result.velocity).toEqual({
        x: result.flowContribution.x + result.paddleContribution.x,
        y: result.flowContribution.y + result.paddleContribution.y,
      });
      expect(magnitude(result.velocity)).toBeLessThanOrEqual(ADRIFT_MAX_VELOCITY);
    }
  });

  it("is byte-repeatable and never mutates its input", () => {
    const input: AdriftMotionInput = {
      current: { x: -712_341, y: 917_123 },
      guideDirection: { x: -1, y: 0 },
      control: { x: 1, y: -1 },
      stamina: 312_345,
      waterDepth: 741_852,
      loadRatioFixed: 613_579,
      currentMitigationPermille: 317,
      paddleAssistPermille: 191,
      support: "ferry",
    };
    const before = JSON.stringify(input);
    const first = evaluateAdriftMotion(input);
    const second = evaluateAdriftMotion(input);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(input)).toBe(before);
  });
});

function expectEveryNumberIsBoundedInteger(result: AdriftMotionResult): void {
  const values = [
    result.velocity.x,
    result.velocity.y,
    result.flowContribution.x,
    result.flowContribution.y,
    result.paddleContribution.x,
    result.paddleContribution.y,
    result.staminaDelta,
  ];
  for (const value of values) {
    expect(Number.isFinite(value)).toBe(true);
    expect(Number.isSafeInteger(value)).toBe(true);
    expect(Math.abs(value)).toBeLessThanOrEqual(FIXED_POINT);
  }
}
