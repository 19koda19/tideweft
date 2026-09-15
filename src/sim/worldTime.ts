import { FIXED_POINT } from "./types";

export const WORLD_TIME_CONTRACT_VERSION = 1 as const;
export const WORLD_TIME_EPOCH = "day-1-midnight" as const;

/** One simulation tick is one displayed world minute. */
export const WORLD_TICKS_PER_DAY = 1_440 as const;
export const WORLD_DAWN_START_TICK = 360 as const;
export const WORLD_DAY_START_TICK = 420 as const;
export const WORLD_DUSK_START_TICK = 1_140 as const;
export const WORLD_NIGHT_START_TICK = 1_200 as const;

/** Open-sky night illumination before weather, cover, or presentation tuning. */
export const WORLD_NIGHT_ILLUMINATION = 100_000 as const;
export const WORLD_DAY_ILLUMINATION = FIXED_POINT;

export type WorldDayPhase = "dawn" | "day" | "dusk" | "night";

export interface WorldTimeProjection {
  readonly version: typeof WORLD_TIME_CONTRACT_VERSION;
  readonly epoch: typeof WORLD_TIME_EPOCH;
  readonly tick: number;
  readonly dayIndex: number;
  readonly dayNumber: number;
  readonly dayTick: number;
  readonly hour: number;
  readonly minute: number;
  readonly phase: WorldDayPhase;
  readonly phaseTick: number;
  readonly phaseDurationTicks: number;
  /** Fixed-point progress through the current phase. */
  readonly phaseProgress: number;
  /** Fixed-point progress through the complete day. */
  readonly cycleProgress: number;
  /** Dawn-to-night solar path; null during night. */
  readonly solarProgress: number | null;
  /** Authoritative open-sky illumination before weather, cover, or local lights. */
  readonly illumination: number;
  /** Compatibility window used by the already-released daytime activity rules. */
  readonly establishedDaylight: boolean;
}

/**
 * Projects the shared world day from the authoritative simulation tick only.
 * No wall clock, renderer frame, locale, timezone, or loaded-region state can
 * enter this calculation.
 */
export function projectWorldTime(atTick: unknown): WorldTimeProjection | null {
  if (!Number.isSafeInteger(atTick) || (atTick as number) < 0) return null;
  const tick = atTick as number;
  const dayIndex = Math.floor(tick / WORLD_TICKS_PER_DAY);
  const dayTick = tick % WORLD_TICKS_PER_DAY;
  const phase = phaseAt(dayTick);
  const { phaseTick, phaseDurationTicks } = phasePosition(phase, dayTick);
  const phaseProgress = ratio(phaseTick, phaseDurationTicks);
  const solarProgress = dayTick >= WORLD_DAWN_START_TICK
    && dayTick < WORLD_NIGHT_START_TICK
    ? ratio(dayTick - WORLD_DAWN_START_TICK, WORLD_NIGHT_START_TICK - WORLD_DAWN_START_TICK)
    : null;
  const illumination = phase === "dawn"
    ? interpolateIllumination(phaseProgress)
    : phase === "dusk"
      ? interpolateIllumination(FIXED_POINT - phaseProgress)
      : phase === "day"
        ? WORLD_DAY_ILLUMINATION
        : WORLD_NIGHT_ILLUMINATION;

  return Object.freeze({
    version: WORLD_TIME_CONTRACT_VERSION,
    epoch: WORLD_TIME_EPOCH,
    tick,
    dayIndex,
    dayNumber: dayIndex + 1,
    dayTick,
    hour: Math.floor(dayTick / 60),
    minute: dayTick % 60,
    phase,
    phaseTick,
    phaseDurationTicks,
    phaseProgress,
    cycleProgress: ratio(dayTick, WORLD_TICKS_PER_DAY),
    solarProgress,
    illumination,
    establishedDaylight: dayTick >= WORLD_DAWN_START_TICK
      && dayTick < WORLD_NIGHT_START_TICK,
  });
}

function phaseAt(dayTick: number): WorldDayPhase {
  if (dayTick < WORLD_DAWN_START_TICK) return "night";
  if (dayTick < WORLD_DAY_START_TICK) return "dawn";
  if (dayTick < WORLD_DUSK_START_TICK) return "day";
  if (dayTick < WORLD_NIGHT_START_TICK) return "dusk";
  return "night";
}

function phasePosition(
  phase: WorldDayPhase,
  dayTick: number,
): Readonly<{ phaseTick: number; phaseDurationTicks: number }> {
  switch (phase) {
    case "dawn":
      return {
        phaseTick: dayTick - WORLD_DAWN_START_TICK,
        phaseDurationTicks: WORLD_DAY_START_TICK - WORLD_DAWN_START_TICK,
      };
    case "day":
      return {
        phaseTick: dayTick - WORLD_DAY_START_TICK,
        phaseDurationTicks: WORLD_DUSK_START_TICK - WORLD_DAY_START_TICK,
      };
    case "dusk":
      return {
        phaseTick: dayTick - WORLD_DUSK_START_TICK,
        phaseDurationTicks: WORLD_NIGHT_START_TICK - WORLD_DUSK_START_TICK,
      };
    case "night":
      return {
        // Night crosses the day-number boundary. Tick zero is therefore 240
        // minutes into the night that began on the preceding civil day.
        phaseTick: dayTick >= WORLD_NIGHT_START_TICK
          ? dayTick - WORLD_NIGHT_START_TICK
          : WORLD_TICKS_PER_DAY - WORLD_NIGHT_START_TICK + dayTick,
        phaseDurationTicks: WORLD_TICKS_PER_DAY
          - WORLD_NIGHT_START_TICK
          + WORLD_DAWN_START_TICK,
      };
  }
}

function interpolateIllumination(progress: number): number {
  const eased = smoothstep(progress);
  return WORLD_NIGHT_ILLUMINATION
    + multiplyFixed(WORLD_DAY_ILLUMINATION - WORLD_NIGHT_ILLUMINATION, eased);
}

function smoothstep(value: number): number {
  const bounded = Math.max(0, Math.min(FIXED_POINT, value));
  const squared = multiplyFixed(bounded, bounded);
  return multiplyFixed(squared, 3 * FIXED_POINT - 2 * bounded);
}

function multiplyFixed(left: number, right: number): number {
  return Math.trunc((left * right) / FIXED_POINT);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.max(
    0,
    Math.min(FIXED_POINT, Math.trunc((numerator * FIXED_POINT) / denominator)),
  );
}
