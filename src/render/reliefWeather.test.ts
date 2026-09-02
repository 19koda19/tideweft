import { describe, expect, it } from "vitest";

import {
  RELIEF_RAIN_DESKTOP_BUDGET,
  RELIEF_RAIN_MOBILE_BUDGET,
  buildReliefRainFrame,
  reliefRainBudget,
  reliefRainStrength,
} from "./reliefWeather";
import type { WeatherView } from "./types";

const weather = (changes: Partial<WeatherView> = {}): WeatherView => ({
  kind: "rain",
  intensity: 0.7,
  wind: { x: 0.4, y: -0.2 },
  ...changes,
});

const frame = {
  width: 1_280,
  height: 720,
  now: 12_345,
  reducedMotion: false,
} as const;

describe("Relief rain presentation", () => {
  it("has no precipitation path for dry weather or zero authoritative intensity", () => {
    for (const kind of ["clear", "mist", "aurora"] as const) {
      expect(buildReliefRainFrame(weather({ kind, intensity: 1 }), frame)).toEqual([]);
      expect(reliefRainStrength(weather({ kind, intensity: 1 }))).toBe(0);
    }
    for (const kind of ["drizzle", "rain", "squall"] as const) {
      expect(buildReliefRainFrame(weather({ kind, intensity: 0 }), frame)).toEqual([]);
      expect(buildReliefRainFrame(weather({ kind, intensity: 0.01 }), frame)).toEqual([]);
    }
  });

  it("maps authoritative kind and intensity monotonically into a bounded device budget", () => {
    expect(reliefRainBudget(390, 844)).toBe(RELIEF_RAIN_MOBILE_BUDGET);
    expect(reliefRainBudget(1_280, 720)).toBe(RELIEF_RAIN_DESKTOP_BUDGET);

    const light = buildReliefRainFrame(weather({ kind: "drizzle", intensity: 0.2 }), frame);
    const rain = buildReliefRainFrame(weather({ kind: "rain", intensity: 0.7 }), frame);
    const squall = buildReliefRainFrame(weather({ kind: "squall", intensity: 1 }), frame);
    expect(light.length).toBeGreaterThanOrEqual(14);
    expect(light.length).toBeLessThan(rain.length);
    expect(rain.length).toBeLessThan(squall.length);
    expect(squall).toHaveLength(RELIEF_RAIN_DESKTOP_BUDGET);

    const mobile = buildReliefRainFrame(weather({ kind: "squall", intensity: 1 }), {
      ...frame,
      width: 390,
      height: 844,
    });
    expect(mobile).toHaveLength(RELIEF_RAIN_MOBILE_BUDGET);
    expect(buildReliefRainFrame(weather({ kind: "squall", intensity: 1 }), {
      ...frame,
      maximumStreaks: 9,
    })).toHaveLength(9);
  });

  it("uses wind for streak direction and motion rather than decorative randomness", () => {
    const left = buildReliefRainFrame(weather({ wind: { x: -1, y: -1 } }), frame);
    const right = buildReliefRainFrame(weather({ wind: { x: 1, y: 1 } }), frame);
    expect(left.every((streak) => streak.dx < 0 && streak.dy > 0)).toBe(true);
    expect(right.every((streak) => streak.dx > 0 && streak.dy > 0)).toBe(true);
    expect(right[0]!.dy).toBeGreaterThan(left[0]!.dy);
    expect(right[0]!.x).not.toBe(left[0]!.x);
  });

  it("projects world wind through Relief yaw while keeping gravity downward", () => {
    const east = weather({ wind: { x: 1, y: 0 } });
    const facingNorth = buildReliefRainFrame(east, { ...frame, yaw: 0 });
    const quarterTurn = buildReliefRainFrame(east, { ...frame, yaw: Math.PI / 2 });
    const halfTurn = buildReliefRainFrame(east, { ...frame, yaw: Math.PI });

    expect(facingNorth[0]!.dx).toBeGreaterThan(0);
    expect(quarterTurn[0]!.dx).toBeCloseTo(0, 8);
    expect(halfTurn[0]!.dx).toBeLessThan(0);
    expect(quarterTurn[0]!.dy).toBeGreaterThan(facingNorth[0]!.dy);
    expect(quarterTurn.every((streak) => streak.dy > 0)).toBe(true);
  });

  it("is repeatable, time-bounded, and freezes only phase for reduced motion", () => {
    const first = buildReliefRainFrame(weather(), frame);
    expect(buildReliefRainFrame(weather(), frame)).toEqual(first);
    expect(buildReliefRainFrame(weather(), { ...frame, now: frame.now + 500 })).not.toEqual(first);

    const frozen = buildReliefRainFrame(weather(), { ...frame, reducedMotion: true });
    expect(buildReliefRainFrame(weather(), {
      ...frame,
      now: frame.now + 50_000,
      reducedMotion: true,
    })).toEqual(frozen);
    expect(frozen).toHaveLength(first.length);
  });
});
