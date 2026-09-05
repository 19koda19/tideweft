import type { DogCondition, DogWeatherAdaptation } from "../sim/dogIdentity";
import { FIXED_POINT } from "../sim/types";

export const DOG_EXPOSURE_VERSION = 1 as const;

export interface DogExposureSample {
  readonly version: typeof DOG_EXPOSURE_VERSION;
  readonly rain: number;
  readonly immersion: number;
  readonly ambientCold: number;
  readonly ambientHeat: number;
  readonly wind: number;
  readonly shelter: number;
  readonly exertion: number;
}

const RAIN_WET_GAIN = 34_000;
const IMMERSION_WET_GAIN = 120_000;
const BASE_DRYING = 5_000;
const SHELTER_DRYING = 24_000;
const HEAT_DRYING = 15_000;
const EXERTION_DRYING = 5_000;
const BASE_COLD_PRESSURE = 9_000;
const WET_COLD_PRESSURE = 31_000;
const WIND_COLD_PRESSURE = 22_000;
const IMMERSION_COLD_PRESSURE = 45_000;
const COLD_RECOVERY = 18_000;
const HEAT_PRESSURE = 24_000;
const HEAT_RECOVERY = 20_000;
const EXERTION_GAIN = 18_000;
const REST_RECOVERY = 14_000;

/**
 * One deterministic condition tick. Identity determines tolerance, while the
 * physical weather sample determines current state; spawning in rain never
 * creates a permanent `wet` identity flag.
 */
export function stepDogExposure(
  condition: DogCondition,
  adaptation: DogWeatherAdaptation,
  sample: DogExposureSample,
): DogCondition {
  assertCondition(condition);
  assertAdaptation(adaptation);
  assertSample(sample);

  const exposedRain = multiplyUnit(sample.rain, FIXED_POINT - sample.shelter);
  // Rain tolerance represents coat/body adaptation, not waterproof immunity.
  // Even a maximally rain-adapted dog still receives 40% of exposed rain.
  const rainResistance = multiplyUnit(adaptation.rainTolerance, 600_000);
  const rainWetting = multiplyUnit(exposedRain, FIXED_POINT - rainResistance);
  const wetGain = unionUnit(
    multiplyUnit(rainWetting, RAIN_WET_GAIN),
    multiplyUnit(sample.immersion, IMMERSION_WET_GAIN),
  );
  const dryWeather = FIXED_POINT - Math.max(exposedRain, sample.immersion);
  const dryingCapacity = BASE_DRYING
    + multiplyUnit(sample.shelter, SHELTER_DRYING)
    + multiplyUnit(sample.ambientHeat, HEAT_DRYING)
    + multiplyUnit(sample.exertion, EXERTION_DRYING);
  const drying = multiplyUnit(dryWeather, dryingCapacity);
  const wetness = clampUnit(condition.wetness + wetGain - drying);

  const exposedWind = multiplyUnit(sample.wind, FIXED_POINT - sample.shelter);
  const wetCold = multiplyUnit(sample.ambientCold, wetness);
  const windCold = multiplyUnit(sample.ambientCold, exposedWind);
  const wetWindCold = multiplyUnit(wetCold, exposedWind);
  const rawCold = multiplyUnit(sample.ambientCold, BASE_COLD_PRESSURE)
    + multiplyUnit(wetCold, WET_COLD_PRESSURE)
    + multiplyUnit(windCold, WIND_COLD_PRESSURE)
    + multiplyUnit(wetWindCold, WET_COLD_PRESSURE)
    + multiplyUnit(
      multiplyUnit(sample.immersion, sample.ambientCold),
      IMMERSION_COLD_PRESSURE,
    );
  // Tolerance moderates pressure but never creates immunity.
  const coldResistance = multiplyUnit(adaptation.coldTolerance, 700_000);
  const coldGain = multiplyUnit(rawCold, FIXED_POINT - coldResistance);
  const warmth = multiplyUnit(
    FIXED_POINT - sample.ambientCold,
    unionUnit(sample.shelter, sample.exertion),
  );
  const coldRecovery = multiplyUnit(warmth, COLD_RECOVERY);
  const coldStress = clampUnit(condition.coldStress + coldGain - coldRecovery);

  const rawHeat = multiplyUnit(sample.ambientHeat, HEAT_PRESSURE)
    + multiplyUnit(sample.exertion, 8_000);
  const heatResistance = multiplyUnit(adaptation.heatTolerance, 700_000);
  const heatGain = multiplyUnit(rawHeat, FIXED_POINT - heatResistance);
  const cooling = multiplyUnit(
    FIXED_POINT - sample.ambientHeat,
    unionUnit(sample.shelter, sample.wind),
  );
  const heatStress = clampUnit(
    condition.heatStress + heatGain - multiplyUnit(cooling, HEAT_RECOVERY),
  );

  const exhaustionGain = multiplyUnit(sample.exertion, EXERTION_GAIN);
  const restOpportunity = multiplyUnit(
    FIXED_POINT - sample.exertion,
    sample.shelter,
  );
  const exhaustion = clampUnit(
    condition.exhaustion + exhaustionGain - multiplyUnit(restOpportunity, REST_RECOVERY),
  );

  return deepFreeze({
    health: condition.health,
    wetness,
    coldStress,
    heatStress,
    exhaustion,
    injuries: [...condition.injuries],
  });
}

function assertCondition(condition: DogCondition): void {
  if (
    !plainRecord(condition)
    || Object.keys(condition).sort().join(",")
      !== "coldStress,exhaustion,health,heatStress,injuries,wetness"
  ) throw new RangeError("Dog condition is invalid");
  for (const [key, value] of Object.entries(condition)) {
    if (key === "injuries") continue;
    if (!scaledUnit(value)) throw new RangeError(`Dog condition ${key} is invalid`);
  }
  if (
    !Array.isArray(condition.injuries)
    || new Set(condition.injuries).size !== condition.injuries.length
    || condition.injuries.some((injury) =>
      injury !== "bruise"
      && injury !== "cut"
      && injury !== "sprain"
      && injury !== "bite"
      && injury !== "cold-injury"
    )
  ) throw new RangeError("Dog condition injuries are invalid");
}

function assertAdaptation(adaptation: DogWeatherAdaptation): void {
  if (
    !plainRecord(adaptation)
    || Object.keys(adaptation).sort().join(",") !== "coldTolerance,heatTolerance,rainTolerance,waterConfidence"
    || Object.values(adaptation).some((value) => !scaledUnit(value))
  ) throw new RangeError("Dog weather adaptation is invalid");
}

function assertSample(sample: DogExposureSample): void {
  if (
    !plainRecord(sample)
    || Object.keys(sample).sort().join(",")
      !== "ambientCold,ambientHeat,exertion,immersion,rain,shelter,version,wind"
    || sample.version !== DOG_EXPOSURE_VERSION
    || Object.entries(sample).some(([key, value]) => key !== "version" && !scaledUnit(value))
  ) throw new RangeError("Dog exposure sample is invalid");
}

function multiplyUnit(left: number, right: number): number {
  return Number(BigInt(left) * BigInt(right) / BigInt(FIXED_POINT));
}

function unionUnit(left: number, right: number): number {
  return FIXED_POINT - multiplyUnit(FIXED_POINT - left, FIXED_POINT - right);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(FIXED_POINT, Math.trunc(value)));
}

function scaledUnit(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= FIXED_POINT
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
