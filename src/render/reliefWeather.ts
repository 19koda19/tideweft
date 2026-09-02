import type { WeatherView } from "./types";

/** A screen-space rain mark. Relief keeps these transient and rebuilds a bounded set each frame. */
export interface ReliefRainStreak {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly alpha: number;
  readonly width: number;
}

export interface ReliefRainFrameOptions {
  readonly width: number;
  readonly height: number;
  readonly now: number;
  readonly reducedMotion: boolean;
  /** Relief camera yaw used to project authoritative world wind into screen axes. */
  readonly yaw?: number;
  /** Lets callers impose a stricter device budget without changing weather semantics. */
  readonly maximumStreaks?: number;
}

export const RELIEF_RAIN_DESKTOP_BUDGET = 96;
export const RELIEF_RAIN_MOBILE_BUDGET = 52;

const PRECIPITATION_WEIGHT = {
  drizzle: 0.58,
  rain: 0.82,
  squall: 1,
} as const;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function hash01(index: number, salt: number): number {
  let value = Math.imul((index | 0) ^ salt, 0x45d9_f3b);
  value ^= Math.imul(value >>> 16, 0x27d4_eb2d);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_295;
}

export function isReliefRain(
  weather: WeatherView,
): weather is WeatherView & { readonly kind: keyof typeof PRECIPITATION_WEIGHT } {
  return weather.kind === "drizzle" || weather.kind === "rain" || weather.kind === "squall";
}

/**
 * Maps the authoritative precipitation kind/intensity to a normalized visual load.
 * Wind deliberately does not alter load: it changes heading and travel only.
 */
export function reliefRainStrength(weather: WeatherView): number {
  if (!isReliefRain(weather)) return 0;
  return clamp(weather.intensity, 0, 1) * PRECIPITATION_WEIGHT[weather.kind];
}

export function reliefRainBudget(width: number, height: number): number {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  return safeWidth <= 760 || safeHeight <= 520
    ? RELIEF_RAIN_MOBILE_BUDGET
    : RELIEF_RAIN_DESKTOP_BUDGET;
}

/**
 * Produces deterministic, bounded rain without retaining a particle system.
 * Reduced motion freezes the phase while keeping current rain legible.
 */
export function buildReliefRainFrame(
  weather: WeatherView,
  options: ReliefRainFrameOptions,
): readonly ReliefRainStreak[] {
  const strength = reliefRainStrength(weather);
  const width = Math.max(1, Math.floor(Number.isFinite(options.width) ? options.width : 1));
  const height = Math.max(1, Math.floor(Number.isFinite(options.height) ? options.height : 1));
  // Match Chart's existing precipitation threshold exactly.
  if (!isReliefRain(weather) || clamp(weather.intensity, 0, 1) <= 0.01) return [];

  const deviceBudget = reliefRainBudget(width, height);
  const requestedBudget = options.maximumStreaks === undefined
    ? deviceBudget
    : Math.floor(clamp(options.maximumStreaks, 0, deviceBudget));
  if (requestedBudget <= 0) return [];

  // Even light active drizzle gets enough marks to read as weather, while the
  // upper bound protects mobile fill rate (each mark is drawn in two passes).
  const minimum = Math.min(requestedBudget, 14);
  const count = Math.min(
    requestedBudget,
    Math.max(minimum, Math.round(minimum + strength * (requestedBudget - minimum))),
  );
  const windX = clamp(weather.wind.x, -1, 1);
  const windY = clamp(weather.wind.y, -1, 1);
  const yaw = options.yaw === undefined || !Number.isFinite(options.yaw) ? 0 : options.yaw;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const screenWindX = windX * cosine - windY * sine;
  const screenWindY = windX * sine + windY * cosine;
  const phase = options.reducedMotion || !Number.isFinite(options.now)
    ? 0
    : Math.max(0, options.now);
  const margin = 42;
  const travelWidth = width + margin * 2;
  const travelHeight = height + margin * 2;
  const streaks: ReliefRainStreak[] = [];

  for (let index = 0; index < count; index += 1) {
    const length = 8 + strength * 17 + hash01(index, 0x71a9) * 5;
    const fall = length * clamp(0.78 + screenWindY * 0.2, 0.52, 1.02);
    const drift = screenWindX * length * (0.54 + strength * 0.36);
    const speed = 0.045 + strength * 0.055 + hash01(index, 0x33f1) * 0.028;
    const travel = phase * speed;
    const x = wrap(
      hash01(index, 0xa521) * travelWidth + travel * screenWindX * 0.78 + index * 13,
      travelWidth,
    ) - margin;
    const y = wrap(
      hash01(index, 0xd11f) * travelHeight + travel * (0.82 + screenWindY * 0.18),
      travelHeight,
    ) - margin;
    streaks.push({
      x,
      y,
      dx: drift,
      dy: fall,
      alpha: 112 + strength * 112,
      width: (weather.kind === "squall" ? 1.25 : 0.82) + strength * 0.42,
    });
  }
  return streaks;
}
