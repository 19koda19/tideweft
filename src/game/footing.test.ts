import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import {
  FOOTING_CAUSE_ORDER,
  FOOTING_VERSION,
  TERRAIN_DRAG_PERMILLE,
  evaluateFooting,
  waterContactPressure,
  type FootingInput,
} from "./footing";

describe("shared terrain movement drag", () => {
  it("preserves the exact five existing player terrain values", () => {
    expect(TERRAIN_DRAG_PERMILLE).toEqual({
      "deep-water": 720,
      "tidal-flat": 610,
      marsh: 690,
      meadow: 930,
      ridge: 570,
    });
  });

  it("keeps every multiplier finite, integral and within neutral drag", () => {
    for (const value of Object.values(TERRAIN_DRAG_PERMILLE)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1_000);
    }
  });

  it("cannot be changed by one consumer for another consumer", () => {
    const before = { ...TERRAIN_DRAG_PERMILLE };
    expect(Object.isFrozen(TERRAIN_DRAG_PERMILLE)).toBe(true);
    expect(Reflect.set(TERRAIN_DRAG_PERMILLE, "marsh", 0)).toBe(false);
    expect(TERRAIN_DRAG_PERMILLE).toEqual(before);
  });
});

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

describe("shared water-contact pressure quote", () => {
  const contact = (overrides: Partial<FootingInput> = {}) => ({
    ...BASE,
    surface: "water" as const,
    waterDepth: 700_000,
    roughness: 0,
    current: { x: 800_000, y: 0 },
    ...overrides,
  });

  it.each([
    { name: "following", current: { x: 800_000, y: 0 }, expected: 70_000 },
    { name: "crossing", current: { x: 0, y: 800_000 }, expected: 560_000 },
    { name: "opposing", current: { x: -800_000, y: 0 }, expected: 560_000 },
  ])("retains the exact $name travel quote", ({ current, expected }) => {
    const input = contact({ current });
    expect(waterContactPressure(input)).toBe(expected);
    expect(evaluateFooting(input).causes.find(({ code }) => code === "cross-current"))
      .toMatchObject({ pressure: expected, contribution: expected });
  });

  it("uses standing force without interpreting a facing vector as travel", () => {
    const input = contact({ moving: false });
    expect(waterContactPressure(input)).toBe(280_000);
    expect(waterContactPressure({ ...input, movement: { x: 0, y: -FIXED_POINT } })).toBe(280_000);
    expect(waterContactPressure({ ...input, movement: { x: Number.NaN, y: Infinity } })).toBe(280_000);
  });

  it("unions the exact rough-bed pressure only for water contact", () => {
    const input = contact({ current: { x: 0, y: 800_000 }, roughness: 900_000 });
    expect(waterContactPressure(input)).toBe(712_460);
    expect(waterContactPressure({ ...input, current: { x: 0, y: 0 } })).toBe(346_500);
    for (const surface of ["firm", "soft", "rock"] as const) {
      expect(waterContactPressure({ ...input, surface })).toBe(560_000);
      expect(waterContactPressure({ ...input, surface, current: { x: 0, y: 0 } })).toBe(0);
    }
  });

  it("preserves pressure on both sides of the separate ordinary-depth gate", () => {
    for (const waterDepth of [34_999, 35_000, 35_001]) {
      const input = contact({ current: { x: 0, y: 800_000 }, waterDepth });
      const expected = Math.trunc(800_000 * waterDepth / FIXED_POINT);
      expect(waterContactPressure(input)).toBe(expected);
      expect(evaluateFooting(input).causes.find(({ code }) => code === "cross-current")?.pressure)
        .toBe(expected);
      expect(evaluateFooting(input).causes.some(({ code }) => code === "deep-water"))
        .toBe(waterDepth > 35_000);
    }
    expect(waterContactPressure(contact({ current: { x: 0, y: 0 }, roughness: 900_000, waterDepth: 35_000 })))
      .toBe(17_325);
    expect(waterContactPressure(contact({ waterDepth: 0, roughness: FIXED_POINT }))).toBe(0);
  });

  it("matches the frozen pre-extraction arithmetic including hostile scalar clamps", () => {
    // Independent quotation of the original local expression, not a second
    // production evaluator or a new capability/depth policy.
    const legacy = (input: ReturnType<typeof contact>) => {
      const unit = (value: number) => !Number.isFinite(value) || value <= 0 ? 0
        : value >= FIXED_POINT ? FIXED_POINT : Math.trunc(value);
      const signed = (value: number) => Number.isFinite(value)
        ? Math.max(-FIXED_POINT, Math.min(FIXED_POINT, Math.trunc(value))) : 0;
      const product = (left: number, right: number) => Math.trunc(unit(left) * unit(right) / FIXED_POINT);
      const forceX = signed(input.current.x);
      const forceY = signed(input.current.y);
      const magnitude = Math.min(FIXED_POINT, Math.trunc((Math.abs(forceX) + Math.abs(forceY)) / 2));
      let transverse = magnitude;
      if (input.moving === true) {
        const size = Math.max(1, Math.abs(signed(input.movement.x)), Math.abs(signed(input.movement.y)));
        const moveX = Math.trunc(signed(input.movement.x) * FIXED_POINT / size);
        const moveY = Math.trunc(signed(input.movement.y) * FIXED_POINT / size);
        const cross = Math.min(FIXED_POINT, Math.trunc(Math.abs(forceX * moveY - forceY * moveX) / FIXED_POINT));
        const opposition = Math.max(0, -Math.trunc((forceX * moveX + forceY * moveY) / FIXED_POINT));
        transverse = Math.min(FIXED_POINT, Math.max(magnitude / 4, cross, opposition));
      }
      const relative = product(transverse, unit(input.waterDepth));
      const bed = input.surface === "water" ? product(product(unit(input.roughness), unit(input.waterDepth)), 550_000) : 0;
      return FIXED_POINT - product(FIXED_POINT - unit(relative), FIXED_POINT - unit(bed));
    };
    const hostile = [Number.NaN, Infinity, -Infinity, -1, 0, 0.9, 35_000.9, FIXED_POINT, Number.MAX_VALUE];
    for (const value of hostile) {
      for (const moving of [true, false]) {
        const input = contact({ moving, roughness: value, waterDepth: value,
          current: { x: value, y: -value }, movement: { x: -value, y: value } });
        const quote = waterContactPressure(input);
        expect(quote).toBe(legacy(input));
        expect(Number.isSafeInteger(quote)).toBe(true);
        expect(quote).toBeGreaterThanOrEqual(0);
        expect(quote).toBeLessThanOrEqual(FIXED_POINT);
        expect(evaluateFooting(input).causes.find(({ code }) => code === "cross-current")?.pressure ?? 0)
          .toBe(quote);
        expect(waterContactPressure(structuredClone(input))).toBe(quote);
      }
    }
    const fractional = contact({ roughness: 123_481.9, waterDepth: 74_217.8,
      current: { x: 280_933.9, y: -420_199.1 }, movement: { x: 670_319.6, y: -103_127.9 } });
    expect(waterContactPressure(fractional)).toBe(legacy(fractional));
  });
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
