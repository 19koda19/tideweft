import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import {
  FOOTING_CAUSE_ORDER,
  FOOTING_VERSION,
  evaluateFooting,
  type FootingInput,
} from "./footing";

const BASE: FootingInput = {
  stability: 700_000,
  moving: true,
  speed: 0,
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

describe("terrain-reactive footing v2", () => {
  it("computes current physical stability directly and is idempotent", () => {
    const physical = {
      surface: "water" as const,
      speed: 650_000,
      waterDepth: 520_000,
      roughness: 700_000,
      current: { x: 0, y: 520_000 },
    };
    const first = evaluate({ ...physical, stability: FIXED_POINT });
    const repeated = evaluate({ ...physical, stability: first.stabilityAfter });

    expect(first.version).toBe(FOOTING_VERSION);
    expect(first.stabilityAfter).toBe(first.stabilityTarget);
    expect(repeated.stabilityAfter).toBe(first.stabilityTarget);
    expect(repeated.delta).toBe(0);
    expect(repeated.trend).toBe("steady");
  });

  it("snaps stale zero to sound ground instead of requiring a recharge loop", () => {
    const result = evaluate({
      stability: 0,
      moving: false,
      speed: 0,
      pace: "rest",
      reliableGround: true,
    });
    expect(result).toMatchObject({
      stabilityBefore: 0,
      stabilityTarget: FIXED_POINT,
      stabilityAfter: FIXED_POINT,
      delta: FIXED_POINT,
      trend: "recovering",
    });
  });

  it("gives a dry braced bank much more stability than the river even in crosswind", () => {
    const shared = {
      stability: 0,
      moving: false,
      speed: 0,
      pace: "rest" as const,
      brace: true,
      wind: { x: 0, y: FIXED_POINT },
      weatherIntensity: FIXED_POINT,
    };
    const bank = evaluate({ ...shared, surface: "soft", moisture: FIXED_POINT, waterDepth: 0 });
    const river = evaluate({
      ...shared,
      surface: "water",
      waterDepth: 650_000,
      roughness: 800_000,
      current: { x: FIXED_POINT, y: 0 },
    });

    expect(bank.causes.some(({ code }) => code === "crosswind")).toBe(true);
    expect(bank.stabilityTarget).toBeGreaterThan(750_000);
    expect(bank.stabilityTarget).toBeGreaterThan(river.stabilityTarget + 100_000);
  });

  it("uses actual speed rather than treating stability as pace stamina", () => {
    const slow = evaluate({ speed: 180_000 });
    const fast = evaluate({ speed: FIXED_POINT, pace: "swift" });
    expect(fast.stabilityTarget).toBeLessThan(slow.stabilityTarget);
    expect(fast.causes.some(({ code }) => code === "swift-motion")).toBe(true);
  });

  it("makes calm and rough riverbeds physically different", () => {
    const shared: Partial<FootingInput> = {
      surface: "water",
      speed: 600_000,
      waterDepth: 520_000,
      current: { x: 0, y: 460_000 },
    };
    const calm = evaluate({ ...shared, roughness: 40_000 });
    const rough = evaluate({ ...shared, roughness: 900_000 });
    expect(rough.stabilityTarget).toBeLessThan(calm.stabilityTarget);
    expect(rough.hazardPressure).toBeGreaterThan(calm.hazardPressure);
  });

  it("reacts distinctly to firm, soft, rock, and water contact", () => {
    const firm = evaluate({ speed: 600_000 });
    const soft = evaluate({ surface: "soft", moisture: 900_000, speed: 600_000 });
    const rock = evaluate({ surface: "rock", roughness: 900_000, speed: 600_000 });
    const water = evaluate({
      surface: "water",
      speed: 600_000,
      roughness: 900_000,
      waterDepth: 700_000,
      current: { x: 0, y: 800_000 },
    });
    expect(firm.stabilityTarget).toBeGreaterThan(soft.stabilityTarget);
    expect(soft.stabilityTarget).toBeGreaterThan(rock.stabilityTarget);
    expect(rock.stabilityTarget).toBeGreaterThan(water.stabilityTarget);
    expect(soft.causes.some(({ code }) => code === "mud-shear")).toBe(true);
    expect(rock.causes.some(({ code }) => code === "loose-rock")).toBe(true);
    expect(water.causes.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "cross-current",
      "deep-water",
    ]));
  });

  it("charges downhill acceleration beyond the same uphill grade", () => {
    const uphill = evaluate({ elevationDelta: 700_000, speed: 600_000 });
    const downhill = evaluate({ elevationDelta: -700_000, speed: 600_000 });
    expect(downhill.stabilityTarget).toBeLessThan(uphill.stabilityTarget);
    expect(downhill.causes.some(({ code }) => code === "downhill-acceleration")).toBe(true);
  });

  it("distinguishes following a current from crossing or opposing it", () => {
    const shared = { surface: "water" as const, waterDepth: 700_000, speed: 600_000 };
    const following = evaluate({ ...shared, current: { x: 800_000, y: 0 } });
    const crossing = evaluate({ ...shared, current: { x: 0, y: 800_000 } });
    const opposing = evaluate({ ...shared, current: { x: -800_000, y: 0 } });
    const pressure = (result: ReturnType<typeof evaluateFooting>) =>
      result.causes.find(({ code }) => code === "cross-current")?.contribution ?? 0;
    expect(pressure(crossing)).toBeGreaterThan(pressure(following));
    expect(pressure(opposing)).toBeGreaterThanOrEqual(pressure(crossing));
  });

  it("makes BRACE, footwear, and fixtures improve the same live target", () => {
    const hazard: Partial<FootingInput> = {
      surface: "rock",
      elevationDelta: -600_000,
      roughness: 900_000,
      speed: 900_000,
      turnPressure: 650_000,
      loadRatio: 900_000,
      pace: "swift",
    };
    const bare = evaluate(hazard);
    const braced = evaluate({ ...hazard, brace: true });
    const shod = evaluate({ ...hazard, footwearGrip: 850_000 });
    const supported = evaluate({ ...hazard, fixtureSupport: 850_000 });
    expect(braced.stabilityTarget).toBeGreaterThan(bare.stabilityTarget);
    expect(shod.stabilityTarget).toBeGreaterThan(bare.stabilityTarget);
    expect(supported.stabilityTarget).toBeGreaterThan(bare.stabilityTarget);
  });

  it("keeps malformed extremes deterministic, integer bounded, and ordered", () => {
    const malformed: FootingInput = {
      ...BASE,
      stability: Number.NaN,
      speed: Number.POSITIVE_INFINITY,
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
    };
    const first = evaluateFooting(malformed);
    expect(evaluateFooting(structuredClone(malformed))).toEqual(first);
    expect(Number.isSafeInteger(first.stabilityTarget)).toBe(true);
    expect(first.stabilityAfter).toBe(first.stabilityTarget);
    expect(first.stabilityTarget).toBeGreaterThanOrEqual(0);
    expect(first.stabilityTarget).toBeLessThanOrEqual(FIXED_POINT);
    for (const cause of first.causes) expect(FOOTING_CAUSE_ORDER).toContain(cause.code);
  });

  it("has no stamina input and stays byte-identical for identical physical state", () => {
    const input = { ...BASE, surface: "soft" as const, speed: 430_000, moisture: 740_000 };
    expect(evaluateFooting(input)).toEqual(evaluateFooting(structuredClone(input)));
    expect("stamina" in input).toBe(false);
  });
});
