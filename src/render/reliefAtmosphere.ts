import type { WeatherView } from "./types";

export const RELIEF_ATMOSPHERE_BAND_COUNT = 18;

export interface ReliefAtmosphereBand {
  readonly top: number;
  readonly bottom: number;
  readonly alpha: number;
}

/**
 * A bounded screen-space horizon veil. Distance fog used to color each mesh
 * chunk from one center sample, making the renderer's 16-tile batching grid
 * faintly legible. These horizontal bands follow the projected horizon rather
 * than any storage or mesh partition and cover terrain, water, and actors
 * consistently.
 */
export function buildReliefAtmosphereBands(
  width: number,
  height: number,
  weather: WeatherView,
): readonly ReliefAtmosphereBand[] {
  const viewportWidth = positive(width);
  const viewportHeight = positive(height);
  if (viewportWidth <= 0 || viewportHeight <= 0) return [];
  const intensity = unit(weather.intensity);
  const reportedVisibility = weather.visibility === undefined
    ? 1
    : unit(weather.visibility);
  const weatherWeight = weather.kind === "mist"
    ? 0.72
    : weather.kind === "squall"
      ? 0.5
      : weather.kind === "rain"
        ? 0.34
        : weather.kind === "drizzle"
          ? 0.24
          : weather.kind === "aurora"
            ? 0.08
            : 0.12;
  const maximumAlpha = Math.round(Math.min(
    118,
    24 + 82 * Math.max(1 - reportedVisibility, intensity * weatherWeight),
  ));
  const veilHeight = viewportHeight * 0.7;
  const bandHeight = veilHeight / RELIEF_ATMOSPHERE_BAND_COUNT;
  return Object.freeze(Array.from(
    { length: RELIEF_ATMOSPHERE_BAND_COUNT },
    (_, index): ReliefAtmosphereBand => {
      const amount = (index + 0.5) / RELIEF_ATMOSPHERE_BAND_COUNT;
      const fade = 1 - smoothstep(amount);
      return Object.freeze({
        top: index * bandHeight,
        bottom: (index + 1) * bandHeight,
        alpha: Math.round(maximumAlpha * fade),
      });
    },
  ));
}

function smoothstep(value: number): number {
  const bounded = unit(value);
  return bounded * bounded * (3 - 2 * bounded);
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function unit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
