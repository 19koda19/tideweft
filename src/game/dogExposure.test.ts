import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import type { DogCondition, DogWeatherAdaptation } from "../sim/dogIdentity";
import { DOG_EXPOSURE_VERSION, stepDogExposure, type DogExposureSample } from "./dogExposure";

const CONDITION: DogCondition = {
  health: FIXED_POINT,
  wetness: 0,
  coldStress: 0,
  heatStress: 0,
  exhaustion: 100_000,
  injuries: [],
};
const ADAPTATION: DogWeatherAdaptation = {
  coldTolerance: 450_000,
  heatTolerance: 450_000,
  rainTolerance: 450_000,
  waterConfidence: 450_000,
};

function sample(overrides: Partial<DogExposureSample> = {}): DogExposureSample {
  return {
    version: DOG_EXPOSURE_VERSION,
    rain: 0,
    immersion: 0,
    ambientCold: 0,
    ambientHeat: 0,
    wind: 0,
    shelter: 0,
    exertion: 0,
    ...overrides,
  };
}

function advance(
  condition: DogCondition,
  weather: DogExposureSample,
  ticks: number,
  adaptation: DogWeatherAdaptation = ADAPTATION,
): DogCondition {
  let current = condition;
  for (let tick = 0; tick < ticks; tick += 1) {
    current = stepDogExposure(current, adaptation, weather);
  }
  return current;
}

describe("dynamic dog weather exposure", () => {
  it("makes exposed rain dynamically wet rather than changing identity", () => {
    const wet = advance(CONDITION, sample({ rain: 800_000 }), 12);
    expect(wet.wetness).toBeGreaterThan(CONDITION.wetness);
    expect(wet.health).toBe(CONDITION.health);
    expect(wet.injuries).toEqual([]);
    expect(Object.isFrozen(wet)).toBe(true);
    expect(Object.isFrozen(wet.injuries)).toBe(true);
  });

  it("makes wet plus cold plus wind worse than any isolated wetting", () => {
    const rainOnly = advance(CONDITION, sample({ rain: 800_000 }), 20);
    const coldRain = advance(CONDITION, sample({ rain: 800_000, ambientCold: 700_000 }), 20);
    const coldRainWind = advance(CONDITION, sample({
      rain: 800_000,
      ambientCold: 700_000,
      wind: 800_000,
    }), 20);
    expect(coldRain.coldStress).toBeGreaterThan(rainOnly.coldStress);
    expect(coldRainWind.coldStress).toBeGreaterThan(coldRain.coldStress);
  });

  it("lets tolerance moderate cold without creating immunity", () => {
    const weather = sample({ rain: FIXED_POINT, ambientCold: FIXED_POINT, wind: FIXED_POINT });
    const vulnerable = advance(CONDITION, weather, 20, { ...ADAPTATION, coldTolerance: 0 });
    const adapted = advance(CONDITION, weather, 20, { ...ADAPTATION, coldTolerance: FIXED_POINT });
    expect(adapted.coldStress).toBeLessThan(vulnerable.coldStress);
    expect(adapted.coldStress).toBeGreaterThan(0);
  });

  it("lets rain tolerance slow wetting without making a dog waterproof", () => {
    const weather = sample({ rain: FIXED_POINT });
    const exposed = advance(CONDITION, weather, 20, { ...ADAPTATION, rainTolerance: 0 });
    const adapted = advance(CONDITION, weather, 20, {
      ...ADAPTATION,
      rainTolerance: FIXED_POINT,
    });
    expect(adapted.wetness).toBeLessThan(exposed.wetness);
    expect(adapted.wetness).toBeGreaterThan(0);
  });

  it("does not turn warm wind alone into cold exposure", () => {
    const windy = advance(CONDITION, sample({ wind: FIXED_POINT }), 30);
    expect(windy.coldStress).toBe(0);
  });

  it("lets dry shelter reverse wetness, cold stress, and exhaustion over time", () => {
    const exposed = advance(CONDITION, sample({
      rain: FIXED_POINT,
      ambientCold: 900_000,
      wind: 800_000,
      exertion: 700_000,
    }), 18);
    const sheltered = advance(exposed, sample({ shelter: FIXED_POINT }), 30);
    expect(sheltered.wetness).toBeLessThan(exposed.wetness);
    expect(sheltered.coldStress).toBeLessThan(exposed.coldStress);
    expect(sheltered.exhaustion).toBeLessThan(exposed.exhaustion);
  });

  it("keeps immersion dangerous even under nominal shelter", () => {
    const immersed = advance(CONDITION, sample({
      immersion: FIXED_POINT,
      ambientCold: 700_000,
      shelter: FIXED_POINT,
    }), 10);
    expect(immersed.wetness).toBeGreaterThan(500_000);
    expect(immersed.coldStress).toBeGreaterThan(0);
  });

  it("rejects malformed and floating-point state instead of partially applying it", () => {
    expect(() => stepDogExposure(CONDITION, ADAPTATION, {
      ...sample(),
      rain: 0.5,
    })).toThrow(/sample/u);
    expect(() => stepDogExposure({ ...CONDITION, wetness: -1 }, ADAPTATION, sample()))
      .toThrow(/condition/u);
    expect(() => stepDogExposure(CONDITION, { ...ADAPTATION, coldTolerance: -0 }, sample()))
      .toThrow(/adaptation/u);
    expect(() => stepDogExposure(CONDITION, ADAPTATION, {
      ...sample(),
      hiddenWeatherFlag: true,
    } as DogExposureSample)).toThrow(/sample/u);
  });
});
