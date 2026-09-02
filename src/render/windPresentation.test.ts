import { describe, expect, it } from "vitest";

import {
  WIND_THREAD_DESKTOP_BUDGET,
  WIND_THREAD_MOBILE_BUDGET,
  buildWindThreadFrame,
  screenWindDirection,
} from "./windPresentation";
import type { WeatherView } from "./types";

const weather = (x: number, y: number, changes: Partial<WeatherView> = {}): WeatherView => ({
  kind: "clear",
  intensity: 0,
  wind: { x, y },
  ...changes,
});
const frame = { width: 1_280, height: 720, now: 12_000, reducedMotion: false } as const;

describe("shared wind-thread presentation", () => {
  it("is absent when calm but visible in clear windy weather", () => {
    expect(buildWindThreadFrame(weather(0, 0), frame)).toEqual([]);
    expect(buildWindThreadFrame(weather(0.01, 0.01), frame)).toEqual([]);
    expect(buildWindThreadFrame(weather(0.5, 0), frame).length).toBeGreaterThan(4);
  });

  it("maps magnitude/storm to density under desktop and mobile caps", () => {
    const breeze = buildWindThreadFrame(weather(0.2, 0), frame);
    const gale = buildWindThreadFrame(weather(1, 1, { kind: "squall", intensity: 1 }), frame);
    expect(gale.length).toBeGreaterThan(breeze.length);
    expect(gale).toHaveLength(WIND_THREAD_DESKTOP_BUDGET);
    expect(buildWindThreadFrame(weather(1, 1, { kind: "squall", intensity: 1 }), {
      ...frame,
      width: 390,
      height: 844,
    })).toHaveLength(WIND_THREAD_MOBILE_BUDGET);
  });

  it("rotates Relief direction with yaw while preserving world wind truth", () => {
    expect(screenWindDirection(weather(1, 0), 0)).toEqual({ x: 1, y: 0 });
    const quarterTurn = screenWindDirection(weather(1, 0), Math.PI / 2);
    expect(quarterTurn.x).toBeCloseTo(0, 12);
    expect(quarterTurn.y).toBeCloseTo(1, 12);
    const threads = buildWindThreadFrame(weather(1, 0), { ...frame, yaw: Math.PI / 2 });
    expect(threads.every((thread) => thread.end.y > thread.start.y)).toBe(true);
  });

  it("is deterministic and freezes only travel under reduced motion", () => {
    expect(buildWindThreadFrame(weather(0.6, -0.2), frame))
      .toEqual(buildWindThreadFrame(weather(0.6, -0.2), frame));
    const frozen = buildWindThreadFrame(weather(0.6, -0.2), { ...frame, reducedMotion: true });
    expect(buildWindThreadFrame(weather(0.6, -0.2), {
      ...frame,
      now: frame.now + 90_000,
      reducedMotion: true,
    })).toEqual(frozen);
  });
});
