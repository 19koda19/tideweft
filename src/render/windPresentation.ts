import type { WeatherView, WorldPoint } from "./types";

export interface WindThread {
  readonly start: WorldPoint;
  readonly controlA: WorldPoint;
  readonly controlB: WorldPoint;
  readonly end: WorldPoint;
  readonly alpha: number;
  readonly width: number;
}

export interface WindThreadFrameOptions {
  readonly width: number;
  readonly height: number;
  readonly now: number;
  readonly reducedMotion: boolean;
  /** Relief passes camera yaw; Chart leaves it at zero. */
  readonly yaw?: number;
  readonly maximumThreads?: number;
}

export const WIND_THREAD_DESKTOP_BUDGET = 28;
export const WIND_THREAD_MOBILE_BUDGET = 16;
export const WIND_CALM_THRESHOLD = 0.025;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, finite(value, low)));
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

export function authoritativeWindMagnitude(weather: WeatherView): number {
  return Math.hypot(clamp(weather.wind.x, -1, 1), clamp(weather.wind.y, -1, 1));
}

/** Projects world wind into camera-relative screen axes without changing compass truth. */
export function screenWindDirection(weather: WeatherView, yaw = 0): WorldPoint {
  const windX = clamp(weather.wind.x, -1, 1);
  const windY = clamp(weather.wind.y, -1, 1);
  const magnitude = Math.hypot(windX, windY);
  if (magnitude <= WIND_CALM_THRESHOLD) return { x: 0, y: 0 };
  const cosine = Math.cos(finite(yaw));
  const sine = Math.sin(finite(yaw));
  return {
    x: (windX * cosine - windY * sine) / magnitude,
    y: (windX * sine + windY * cosine) / magnitude,
  };
}

export function windThreadBudget(width: number, height: number): number {
  return finite(width, 1) <= 760 || finite(height, 1) <= 520
    ? WIND_THREAD_MOBILE_BUDGET
    : WIND_THREAD_DESKTOP_BUDGET;
}

/** Deterministic, bounded, transient wind traces shared by Chart and Relief. */
export function buildWindThreadFrame(
  weather: WeatherView,
  options: WindThreadFrameOptions,
): readonly WindThread[] {
  const magnitude = authoritativeWindMagnitude(weather);
  if (magnitude <= WIND_CALM_THRESHOLD) return [];
  const width = Math.max(1, Math.floor(finite(options.width, 1)));
  const height = Math.max(1, Math.floor(finite(options.height, 1)));
  const deviceBudget = windThreadBudget(width, height);
  const budget = options.maximumThreads === undefined
    ? deviceBudget
    : Math.floor(clamp(options.maximumThreads, 0, deviceBudget));
  if (budget <= 0) return [];

  const storm = weather.kind === "squall" ? clamp(weather.intensity, 0, 1) : 0;
  const load = clamp(magnitude / Math.SQRT2 + storm * 0.22, 0, 1);
  const minimum = Math.min(4, budget);
  const count = Math.min(budget, Math.max(minimum, Math.round(minimum + load * (budget - minimum))));
  const direction = screenWindDirection(weather, options.yaw);
  const perpendicular = { x: -direction.y, y: direction.x };
  const phase = options.reducedMotion ? 0 : Math.max(0, finite(options.now));
  const margin = 52;
  const travelWidth = width + margin * 2;
  const travelHeight = height + margin * 2;
  const threads: WindThread[] = [];

  for (let index = 0; index < count; index += 1) {
    const length = 15 + load * 20 + hash01(index, 0x7a31) * 9;
    const speed = 0.012 + load * 0.026 + storm * 0.018;
    const travel = phase * speed;
    const start = {
      x: wrap(hash01(index, 0x441b) * travelWidth + direction.x * travel, travelWidth) - margin,
      y: wrap(hash01(index, 0x99a7) * travelHeight + direction.y * travel, travelHeight) - margin,
    };
    const curve = (hash01(index, 0x21d5) - 0.5) * (6 + load * 7);
    const end = {
      x: start.x + direction.x * length,
      y: start.y + direction.y * length,
    };
    threads.push({
      start,
      controlA: {
        x: start.x + direction.x * length * 0.32 + perpendicular.x * curve,
        y: start.y + direction.y * length * 0.32 + perpendicular.y * curve,
      },
      controlB: {
        x: start.x + direction.x * length * 0.72 - perpendicular.x * curve * 0.35,
        y: start.y + direction.y * length * 0.72 - perpendicular.y * curve * 0.35,
      },
      end,
      alpha: 18 + load * 28 + storm * 12,
      width: 0.65 + load * 0.35,
    });
  }
  return threads;
}
