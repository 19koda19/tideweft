import { describe, expect, it } from "vitest";

import {
  CARGO_ENVIRONMENT_CAUSE_ORDER,
  CARGO_ENVIRONMENT_PROPERTIES,
  evaluateCargoEnvironment,
  resolveCargoMaterialTraits,
  type CargoEnvironmentEvaluationInput,
  type CargoEnvironmentProperty,
  type CargoEnvironmentSample,
} from "./cargoEnvironment";
import { FIXED_POINT } from "./types";

const CALM: CargoEnvironmentSample = {
  rain: 0,
  heat: 0,
  cold: 0,
  immersion: 0,
  currentX: 0,
  currentY: 0,
  magicalWaterFlux: 0,
};

const exposedInput = (
  property: CargoEnvironmentProperty = "ordinary",
): CargoEnvironmentEvaluationInput => ({
  property,
  state: {
    condition: 875_000,
    contamination: 125_000,
    decay: 80_000,
  },
  environment: {
    rain: 640_000,
    heat: 710_000,
    cold: 90_000,
    immersion: 780_000,
    currentX: -620_000,
    currentY: 240_000,
    magicalWaterFlux: 530_000,
  },
});

describe("cargo environment foundation", () => {
  it("keeps calm exposure inert and never mutates caller-owned data", () => {
    const input: CargoEnvironmentEvaluationInput = {
      property: "fragile",
      state: { condition: 765_432, contamination: 23_456, decay: 34_567 },
      environment: { ...CALM },
      traits: { waterResistance: 123_456 },
    };
    const before = structuredClone(input);

    const result = evaluateCargoEnvironment(input);

    expect(input).toEqual(before);
    expect(result.nextState).toEqual(input.state);
    expect(result.change).toEqual({
      conditionLoss: 0,
      contaminationGain: 0,
      decayGain: 0,
    });
    expect(result.force).toEqual({ x: 0, y: 0, lift: 0, magnitude: 0 });
    expect(result.causes).toEqual([]);
  });

  it("has a stable golden evaluation with canonical cause codes and readable previews", () => {
    const result = evaluateCargoEnvironment(exposedInput());

    expect(result).toMatchObject({
      property: "ordinary",
      nextState: {
        condition: 874_508,
        contamination: 125_388,
        decay: 80_171,
      },
      change: {
        conditionLoss: 492,
        contaminationGain: 388,
        decayGain: 171,
      },
      force: {
        x: -325_341,
        y: 125_938,
        lift: 92_750,
        magnitude: 348_865,
      },
    });
    expect(result.causes.map(({ code }) => code)).toEqual([
      "rain-soak",
      "heat-stress",
      "cold-stress",
      "water-immersion",
      "magic-water",
      "current-drift",
    ]);
    expect(result.causes.every(({ preview }) => preview.length >= 40)).toBe(true);
    expect(result.causes.at(-1)?.preview).toContain("west");
  });

  it("is deterministic and independent of trait override key insertion order", () => {
    const normalOrder = {
      waterResistance: 420_000,
      magicResistance: 610_000,
      buoyancy: 880_000,
      currentCoupling: 330_000,
    };
    const reverseOrder = {
      currentCoupling: 330_000,
      buoyancy: 880_000,
      magicResistance: 610_000,
      waterResistance: 420_000,
    };

    const first = evaluateCargoEnvironment({ ...exposedInput("confidential"), traits: normalOrder });
    for (const property of CARGO_ENVIRONMENT_PROPERTIES) {
      evaluateCargoEnvironment(exposedInput(property));
    }
    const second = evaluateCargoEnvironment({ ...exposedInput("confidential"), traits: reverseOrder });

    expect(second).toEqual(first);
    const emittedCodes = new Set(first.causes.map(({ code }) => code));
    expect(first.causes.map(({ code }) => code)).toEqual(
      CARGO_ENVIRONMENT_CAUSE_ORDER.filter((code) => emittedCodes.has(code)),
    );
  });

  it("makes magic water materially affect every default cargo property", () => {
    for (const property of CARGO_ENVIRONMENT_PROPERTIES) {
      const result = evaluateCargoEnvironment({
        property,
        state: { condition: FIXED_POINT },
        environment: { ...CALM, magicalWaterFlux: FIXED_POINT },
      });
      const magic = result.causes.find(({ code }) => code === "magic-water");

      expect(magic, property).toBeDefined();
      expect(result.change.conditionLoss, property).toBeGreaterThan(0);
      expect(result.change.contaminationGain, property).toBeGreaterThan(0);
      expect(result.force.lift, property).toBeGreaterThan(0);
    }
  });

  it("lets material traits predictably distinguish cargo behavior", () => {
    const heatOnly = {
      ...CALM,
      heat: FIXED_POINT,
    };
    const perishable = evaluateCargoEnvironment({
      property: "perishable",
      state: { condition: FIXED_POINT },
      environment: heatOnly,
    });
    const heavy = evaluateCargoEnvironment({
      property: "heavy",
      state: { condition: FIXED_POINT },
      environment: heatOnly,
    });
    expect(perishable.change.conditionLoss).toBeGreaterThan(heavy.change.conditionLoss);
    expect(perishable.change.decayGain).toBeGreaterThan(heavy.change.decayGain * 8);

    const strongCurrent = { ...CALM, immersion: FIXED_POINT, currentX: FIXED_POINT };
    const floatingFragile = evaluateCargoEnvironment({
      property: "fragile",
      state: { condition: FIXED_POINT },
      environment: strongCurrent,
    });
    const sinkingHeavy = evaluateCargoEnvironment({
      property: "heavy",
      state: { condition: FIXED_POINT },
      environment: strongCurrent,
    });
    expect(floatingFragile.force.x).toBeGreaterThan(sinkingHeavy.force.x);
    expect(floatingFragile.force.lift).toBeGreaterThan(0);
    expect(sinkingHeavy.force.lift).toBeLessThan(0);

    const hardFall = { ...CALM, impact: 800_000 };
    const droppedFragile = evaluateCargoEnvironment({
      property: "fragile",
      state: { condition: FIXED_POINT },
      environment: hardFall,
    });
    const droppedHeavy = evaluateCargoEnvironment({
      property: "heavy",
      state: { condition: FIXED_POINT },
      environment: hardFall,
    });
    expect(droppedFragile.change.conditionLoss).toBeGreaterThan(droppedHeavy.change.conditionLoss * 3);
    expect(droppedFragile.causes.at(0)).toMatchObject({ code: "impact-shock" });
  });

  it("clamps hostile inputs and saturated states to safe fixed-point bounds", () => {
    const result = evaluateCargoEnvironment({
      property: "perishable",
      state: {
        condition: 7,
        contamination: 999_999,
        decay: Number.POSITIVE_INFINITY,
      },
      environment: {
        rain: 9_000_000,
        heat: Number.NaN,
        cold: 4_000_000,
        immersion: Number.POSITIVE_INFINITY,
        currentX: -9_000_000,
        currentY: 9_000_000,
        magicalWaterFlux: 8_000_000,
        impact: 12_000_000,
      },
      traits: {
        waterResistance: -10,
        magicResistance: 5_000_000,
        buoyancy: 9_000_000,
      },
    });

    expect(result.environment).toEqual({
      rain: FIXED_POINT,
      heat: 0,
      cold: FIXED_POINT,
      immersion: 0,
      currentX: -FIXED_POINT,
      currentY: FIXED_POINT,
      magicalWaterFlux: FIXED_POINT,
      impact: FIXED_POINT,
    });
    expect(result.nextState.condition).toBe(0);
    expect(result.change.conditionLoss).toBe(7);
    expect(result.nextState.contamination).toBe(FIXED_POINT);
    expect(result.change.contaminationGain).toBe(1);
    expect(result.nextState.decay).toBeGreaterThanOrEqual(0);
    expect(result.nextState.decay).toBeLessThanOrEqual(FIXED_POINT);
    expect(Math.abs(result.force.x)).toBeLessThanOrEqual(FIXED_POINT);
    expect(Math.abs(result.force.y)).toBeLessThanOrEqual(FIXED_POINT);
    expect(Math.abs(result.force.lift)).toBeLessThanOrEqual(FIXED_POINT);
    expect(result.force.magnitude).toBeLessThanOrEqual(FIXED_POINT);
  });

  it("keeps rates conservative and every public numeric result integral and bounded", () => {
    for (const property of CARGO_ENVIRONMENT_PROPERTIES) {
      const result = evaluateCargoEnvironment({
        property,
        state: { condition: FIXED_POINT },
        environment: {
          rain: FIXED_POINT,
          heat: FIXED_POINT,
          cold: FIXED_POINT,
          immersion: FIXED_POINT,
          currentX: FIXED_POINT,
          currentY: -FIXED_POINT,
          magicalWaterFlux: FIXED_POINT,
          impact: FIXED_POINT,
        },
      });

      expect(result.change.conditionLoss, property).toBeLessThanOrEqual(2_500);
      expect(result.change.contaminationGain, property).toBeLessThanOrEqual(1_200);
      expect(result.change.decayGain, property).toBeLessThanOrEqual(1_700);
      for (const value of Object.values(result.nextState)) {
        expect(Number.isSafeInteger(value), property).toBe(true);
        expect(value, property).toBeGreaterThanOrEqual(0);
        expect(value, property).toBeLessThanOrEqual(FIXED_POINT);
      }
      for (const value of Object.values(result.force)) {
        expect(Number.isSafeInteger(value), property).toBe(true);
        expect(Math.abs(value), property).toBeLessThanOrEqual(FIXED_POINT);
      }
    }
  });

  it("normalizes material overrides without changing the shared defaults", () => {
    const baseline = resolveCargoMaterialTraits("ordinary");
    const overridden = resolveCargoMaterialTraits("ordinary", {
      waterResistance: 2_000_000,
      heatResistance: -1,
      currentCoupling: 123_456.9,
    });

    expect(overridden).toMatchObject({
      waterResistance: FIXED_POINT,
      heatResistance: 0,
      currentCoupling: 123_456,
    });
    expect(resolveCargoMaterialTraits("ordinary")).toEqual(baseline);
    expect(overridden).not.toBe(baseline);
  });
});
