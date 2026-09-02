import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import {
  FOOTING_CAUSE_ORDER,
  FOOTING_VERSION,
  MAX_FOOTING_LOSS_PER_STEP,
  evaluateFooting,
  type FootingInput,
} from "./footing";

const BASE: FootingInput = {
  stability: 700_000,
  moving: true,
  surface: "firm",
  elevationDelta: 0,
  roughness: 100_000,
  moisture: 200_000,
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

const evaluate = (overrides: Partial<FootingInput> = {}) => evaluateFooting({
  ...BASE,
  ...overrides,
  movement: overrides.movement ?? BASE.movement,
  current: overrides.current ?? BASE.current,
  wind: overrides.wind ?? BASE.wind,
});

describe("terrain-reactive footing", () => {
  it("keeps steady level firm travel neutral instead of draining like stamina", () => {
    const result = evaluate();
    expect(result.version).toBe(FOOTING_VERSION);
    expect(result.delta).toBeGreaterThanOrEqual(0);
    expect(result.trend).not.toBe("falling");
    expect(result.causes).toEqual([]);
    expect(result.primaryCause).toBeNull();
  });

  it("recovers predictably while still on reliable ground even at zero stability", () => {
    const result = evaluate({
      stability: 0,
      moving: false,
      pace: "rest",
      reliableGround: true,
    });
    expect(result).toMatchObject({
      stabilityBefore: 0,
      stabilityAfter: 18_000,
      delta: 18_000,
      trend: "recovering",
      primaryCause: null,
    });
  });

  it("lets a planted porter rebuild footing after leaving water even in a severe crosswind", () => {
    const bank = evaluate({
      stability: 0,
      moving: false,
      pace: "rest",
      surface: "soft",
      brace: true,
      wind: { x: 0, y: FIXED_POINT },
      weatherIntensity: FIXED_POINT,
    });

    expect(bank.causes.some(({ code }) => code === "crosswind")).toBe(true);
    expect(bank.stabilityAfter).toBeGreaterThan(0);
    expect(bank.delta).toBeGreaterThan(0);
    expect(bank.trend).toBe("recovering");
  });

  it("makes bracing buy a meaningful crossing window without making deep water safe", () => {
    const crossing = (brace: boolean): number => {
      let stability = FIXED_POINT;
      for (let step = 0; step < 60; step += 1) {
        stability = evaluate({
          stability,
          moving: true,
          surface: "water",
          waterDepth: 520_000,
          movement: { x: FIXED_POINT, y: 0 },
          current: { x: 0, y: 535_000 },
          wind: { x: 0, y: 300_000 },
          weatherIntensity: 400_000,
          brace,
        }).stabilityAfter;
      }
      return stability;
    };

    expect(crossing(false)).toBe(0);
    expect(crossing(true)).toBeGreaterThan(200_000);
  });

  it("applies a bounded explicit civic recovery bonus only on reliable rest ground", () => {
    const supported = evaluate({
      stability: 100_000,
      moving: false,
      pace: "rest",
      reliableGround: true,
      recoveryBonus: 3_000,
    });
    const moving = evaluate({
      stability: 100_000,
      moving: true,
      reliableGround: true,
      recoveryBonus: 3_000,
    });
    expect(supported.delta).toBe(21_000);
    expect(moving.delta).toBe(1_800);
  });

  it("makes identical movement react differently to firm, soft, rock, and water contact", () => {
    const firm = evaluate();
    const soft = evaluate({ surface: "soft", moisture: 900_000 });
    const rock = evaluate({ surface: "rock", roughness: 900_000 });
    const water = evaluate({
      surface: "water",
      waterDepth: 700_000,
      current: { x: 0, y: 800_000 },
    });
    expect(firm.delta).toBeGreaterThanOrEqual(0);
    expect(soft.delta).toBeLessThan(firm.delta);
    expect(rock.delta).toBeLessThan(soft.delta);
    expect(water.delta).toBeLessThan(rock.delta);
    expect(soft.causes.some(({ code }) => code === "mud-shear")).toBe(true);
    expect(rock.causes.some(({ code }) => code === "loose-rock")).toBe(true);
    expect(water.causes.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "cross-current",
      "deep-water",
    ]));
  });

  it("charges more for downhill acceleration than the same uphill grade", () => {
    const uphill = evaluate({ elevationDelta: 700_000 });
    const downhill = evaluate({ elevationDelta: -700_000 });
    expect(downhill.delta).toBeLessThan(uphill.delta);
    expect(downhill.causes.some(({ code }) => code === "downhill-acceleration")).toBe(true);
    expect(uphill.causes.some(({ code }) => code === "downhill-acceleration")).toBe(false);
  });

  it("distinguishes following a current from crossing or opposing it", () => {
    const following = evaluate({
      surface: "water",
      waterDepth: 700_000,
      current: { x: 800_000, y: 0 },
    });
    const crossing = evaluate({
      surface: "water",
      waterDepth: 700_000,
      current: { x: 0, y: 800_000 },
    });
    const opposing = evaluate({
      surface: "water",
      waterDepth: 700_000,
      current: { x: -800_000, y: 0 },
    });
    const pressure = (result: ReturnType<typeof evaluateFooting>) =>
      result.causes.find(({ code }) => code === "cross-current")?.contribution ?? 0;
    expect(pressure(crossing)).toBeGreaterThan(pressure(following));
    expect(pressure(opposing)).toBeGreaterThanOrEqual(pressure(crossing));
  });

  it("lets BRACE, footwear, and a fixture independently reduce the same physical loss", () => {
    const hazard: Partial<FootingInput> = {
      surface: "rock",
      elevationDelta: -600_000,
      roughness: 900_000,
      turnPressure: 650_000,
      loadRatio: 900_000,
      pace: "swift",
    };
    const bare = evaluate(hazard);
    const braced = evaluate({ ...hazard, brace: true });
    const shod = evaluate({ ...hazard, footwearGrip: 850_000 });
    const supported = evaluate({ ...hazard, fixtureSupport: 850_000 });
    expect(braced.delta).toBeGreaterThan(bare.delta);
    expect(shod.delta).toBeGreaterThan(bare.delta);
    expect(supported.delta).toBeGreaterThan(bare.delta);
    expect(braced.mitigation.brace).toBeGreaterThan(0);
    expect(shod.mitigation.footwear).toBeGreaterThan(0);
    expect(supported.mitigation.fixture).toBeGreaterThan(0);
  });

  it("keeps every output bounded and cause ordering deterministic under malformed extremes", () => {
    const first = evaluate({
      stability: Number.NaN,
      surface: "rock",
      elevationDelta: Number.NEGATIVE_INFINITY,
      roughness: Number.POSITIVE_INFINITY,
      waterDepth: Number.MAX_VALUE,
      movement: { x: Number.MAX_VALUE, y: Number.NaN },
      current: { x: Number.MIN_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
      wind: { x: Number.MAX_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER },
      weatherIntensity: Number.MAX_VALUE,
      turnPressure: Number.MAX_VALUE,
      loadRatio: Number.MAX_VALUE,
      cargoShift: Number.MAX_VALUE,
      pace: "swift",
      footwearGrip: -1,
      fixtureSupport: Number.NaN,
      unsupportedEdge: Number.MAX_VALUE,
    });
    const second = evaluate({
      stability: Number.NaN,
      surface: "rock",
      elevationDelta: Number.NEGATIVE_INFINITY,
      roughness: Number.POSITIVE_INFINITY,
      waterDepth: Number.MAX_VALUE,
      movement: { x: Number.MAX_VALUE, y: Number.NaN },
      current: { x: Number.MIN_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
      wind: { x: Number.MAX_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER },
      weatherIntensity: Number.MAX_VALUE,
      turnPressure: Number.MAX_VALUE,
      loadRatio: Number.MAX_VALUE,
      cargoShift: Number.MAX_VALUE,
      pace: "swift",
      footwearGrip: -1,
      fixtureSupport: Number.NaN,
      unsupportedEdge: Number.MAX_VALUE,
    });
    expect(second).toEqual(first);
    expect(first.stabilityBefore).toBe(0);
    expect(first.stabilityAfter).toBeGreaterThanOrEqual(0);
    expect(first.stabilityAfter).toBeLessThanOrEqual(FIXED_POINT);
    expect(first.delta).toBeGreaterThanOrEqual(-MAX_FOOTING_LOSS_PER_STEP);
    expect(first.hazardPressure).toBeGreaterThanOrEqual(0);
    expect(first.hazardPressure).toBeLessThanOrEqual(FIXED_POINT);
    for (const cause of first.causes) {
      expect(FOOTING_CAUSE_ORDER).toContain(cause.code);
      expect(Number.isSafeInteger(cause.pressure)).toBe(true);
      expect(Number.isSafeInteger(cause.contribution)).toBe(true);
    }
  });

  it("has no stamina input and stays byte-identical for identical physical state", () => {
    const input = {
      ...BASE,
      surface: "soft" as const,
      moisture: 740_000,
      loadRatio: 610_000,
      cargoShift: 120_000,
    };
    expect(evaluateFooting(input)).toEqual(evaluateFooting(structuredClone(input)));
    expect("stamina" in input).toBe(false);
  });
});
