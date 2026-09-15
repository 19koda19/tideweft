import { describe, expect, it } from "vitest";

import {
  WORLD_DAWN_START_TICK,
  WORLD_DAY_ILLUMINATION,
  WORLD_DAY_START_TICK,
  WORLD_DUSK_START_TICK,
  WORLD_NIGHT_ILLUMINATION,
  WORLD_NIGHT_START_TICK,
  WORLD_NEW_GAME_START_TICK,
  WORLD_TICKS_PER_DAY,
  projectWorldTime,
} from "./worldTime";

describe("authoritative world time", () => {
  it("starts fresh worlds at full morning while preserving the midnight epoch", () => {
    expect(WORLD_NEW_GAME_START_TICK).toBe(WORLD_DAY_START_TICK);
    expect(projectWorldTime(WORLD_NEW_GAME_START_TICK)).toMatchObject({
      dayNumber: 1,
      dayTick: WORLD_DAY_START_TICK,
      hour: 7,
      minute: 0,
      phase: "day",
    });
    expect(projectWorldTime(0)).toMatchObject({
      dayNumber: 1,
      dayTick: 0,
      hour: 0,
      minute: 0,
      phase: "night",
    });
  });

  it("projects the versioned epoch and exact dawn/day/dusk/night boundaries", () => {
    expect(projectWorldTime(0)).toMatchObject({
      version: 1,
      epoch: "day-1-midnight",
      dayIndex: 0,
      dayNumber: 1,
      dayTick: 0,
      hour: 0,
      minute: 0,
      phase: "night",
    });
    expect(projectWorldTime(WORLD_DAWN_START_TICK - 1)?.phase).toBe("night");
    expect(projectWorldTime(WORLD_DAWN_START_TICK)?.phase).toBe("dawn");
    expect(projectWorldTime(WORLD_DAY_START_TICK)?.phase).toBe("day");
    expect(projectWorldTime(WORLD_DUSK_START_TICK)?.phase).toBe("dusk");
    expect(projectWorldTime(WORLD_NIGHT_START_TICK)?.phase).toBe("night");
    expect(projectWorldTime(WORLD_TICKS_PER_DAY)).toMatchObject({
      dayIndex: 1,
      dayNumber: 2,
      dayTick: 0,
      phase: "night",
    });
  });

  it("preserves the released daylight activity window while exposing transition phases", () => {
    expect(projectWorldTime(WORLD_DAWN_START_TICK)?.establishedDaylight).toBe(true);
    expect(projectWorldTime(WORLD_DAY_START_TICK)?.establishedDaylight).toBe(true);
    expect(projectWorldTime(WORLD_DUSK_START_TICK)?.establishedDaylight).toBe(true);
    expect(projectWorldTime(WORLD_NIGHT_START_TICK)?.establishedDaylight).toBe(false);
  });

  it("eases authoritative illumination without a dawn or dusk discontinuity", () => {
    const night = projectWorldTime(WORLD_DAWN_START_TICK - 1)!;
    const dawn = projectWorldTime(WORLD_DAWN_START_TICK)!;
    const lateDawn = projectWorldTime(WORLD_DAY_START_TICK - 1)!;
    const day = projectWorldTime(WORLD_DAY_START_TICK)!;
    const dusk = projectWorldTime(WORLD_DUSK_START_TICK)!;
    const lateDusk = projectWorldTime(WORLD_NIGHT_START_TICK - 1)!;
    const nextNight = projectWorldTime(WORLD_NIGHT_START_TICK)!;

    expect(night.illumination).toBe(WORLD_NIGHT_ILLUMINATION);
    expect(dawn.illumination).toBe(WORLD_NIGHT_ILLUMINATION);
    expect(lateDawn.illumination).toBeGreaterThan(dawn.illumination);
    expect(lateDawn.illumination).toBeLessThanOrEqual(WORLD_DAY_ILLUMINATION);
    expect(day.illumination).toBe(WORLD_DAY_ILLUMINATION);
    expect(day.illumination - lateDawn.illumination).toBeLessThan(1_000);
    expect(dusk.illumination).toBe(WORLD_DAY_ILLUMINATION);
    expect(lateDusk.illumination).toBeLessThan(dusk.illumination);
    expect(lateDusk.illumination).toBeGreaterThanOrEqual(WORLD_NIGHT_ILLUMINATION);
    expect(nextNight.illumination).toBe(WORLD_NIGHT_ILLUMINATION);
    expect(lateDusk.illumination - nextNight.illumination).toBeLessThan(1_000);
  });

  it("accepts the largest safe persisted tick and fails malformed time closed", () => {
    const far = projectWorldTime(Number.MAX_SAFE_INTEGER);
    expect(far?.tick).toBe(Number.MAX_SAFE_INTEGER);
    expect(far?.dayTick).toBe(Number.MAX_SAFE_INTEGER % WORLD_TICKS_PER_DAY);
    expect(projectWorldTime(-1)).toBeNull();
    expect(projectWorldTime(1.5)).toBeNull();
    expect(projectWorldTime(Number.POSITIVE_INFINITY)).toBeNull();
    expect(projectWorldTime("360")).toBeNull();
  });
});
