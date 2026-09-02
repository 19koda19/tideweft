import { FIXED_POINT } from "../sim/types";

export const WATER_FLOW_VERSION = 1 as const;

export type WaterFlowVoice = "silent" | "ohm" | "whissh";

/**
 * Authoritative local hydrology inputs. All scalar values use the simulation's
 * fixed-point 0..1 range so gameplay, render, and audio can share one reading.
 */
export interface WaterFlowInput {
  readonly waterDepth: number;
  readonly bedRoughness: number;
  readonly tideLevel: number;
  readonly weatherIntensity: number;
}

export interface WaterFlowProfile {
  readonly version: typeof WATER_FLOW_VERSION;
  /** Local current force, fixed point 0..1. */
  readonly strength: number;
  /** Broken/irregular surface energy, fixed point 0..1. */
  readonly turbulence: number;
  /** Sparse environmental syllable; real water ambience remains separate. */
  readonly voice: WaterFlowVoice;
}

function unit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function fixedProduct(left: number, right: number): number {
  return Math.trunc((unit(left) * unit(right)) / FIXED_POINT);
}

function fixedUnion(left: number, right: number): number {
  return FIXED_POINT - fixedProduct(FIXED_POINT - unit(left), FIXED_POINT - unit(right));
}

/**
 * Derives a stable local river character from physical terrain and live tide.
 * It contains no random state: the same tile under the same conditions always
 * produces the same force, surface motion, vocal cue, and ambience profile.
 */
export function deriveWaterFlowProfile(input: WaterFlowInput): WaterFlowProfile {
  const depth = unit(input.waterDepth);
  if (depth <= 35_000) {
    return {
      version: WATER_FLOW_VERSION,
      strength: 0,
      turbulence: 0,
      voice: "silent",
    };
  }

  const roughness = unit(input.bedRoughness);
  const tide = unit(input.tideLevel);
  const weather = unit(input.weatherIntensity);
  const strength = unit(
    60_000
      + fixedProduct(depth, 380_000)
      + fixedProduct(tide, 240_000)
      + fixedProduct(roughness, 180_000),
  );
  const turbulence = fixedUnion(
    fixedProduct(strength, 560_000),
    fixedUnion(
      fixedProduct(roughness, 620_000),
      fixedProduct(weather, 160_000),
    ),
  );

  return {
    version: WATER_FLOW_VERSION,
    strength,
    turbulence,
    voice: turbulence >= 480_000 || strength >= 620_000 ? "whissh" : "ohm",
  };
}
