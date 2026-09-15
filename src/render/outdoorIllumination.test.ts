import { describe, expect, it } from "vitest";

import {
  WORLD_DAWN_START_TICK,
  WORLD_DAY_START_TICK,
  WORLD_DUSK_START_TICK,
  WORLD_NIGHT_START_TICK,
  projectWorldTime,
} from "../sim/worldTime";
import { FIXED_POINT } from "../sim/types";
import {
  outdoorIlluminationPresentation,
  outdoorLocalLightEmission,
  outdoorTerrainColor,
  outdoorWaterColor,
} from "./outdoorIllumination";
import { RELIEF_WATER_PALETTE } from "./reliefWaterBatches";
import type { WorldTimeView } from "./types";
import { WATER_PRESENTATION_PALETTE } from "./waterPresentation";

function time(atTick: number): WorldTimeView {
  const projected = projectWorldTime(atTick);
  if (!projected) throw new Error(`invalid world-time fixture ${atTick}`);
  return {
    version: projected.version,
    dayNumber: projected.dayNumber,
    dayTick: projected.dayTick,
    phase: projected.phase,
    phaseProgress: projected.phaseProgress / FIXED_POINT,
    cycleProgress: projected.cycleProgress / FIXED_POINT,
    solarProgress: projected.solarProgress === null
      ? null
      : projected.solarProgress / FIXED_POINT,
    illumination: projected.illumination / FIXED_POINT,
  };
}

function rgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function colorDelta(left: string, right: string): number {
  const first = rgb(left);
  const second = rgb(right);
  return Math.max(...first.map((channel, index) =>
    Math.abs(channel - (second[index] ?? 0))
  ));
}

function brightness(hex: string): number {
  return rgb(hex).reduce((total, channel) => total + channel, 0);
}

describe("shared outdoor illumination presentation", () => {
  it("derives distinct deterministic sky and Relief light from the one world clock", () => {
    const night = outdoorIlluminationPresentation(time(0));
    const day = outdoorIlluminationPresentation(time(720));

    expect(outdoorIlluminationPresentation(time(0))).toEqual(night);
    expect(night.phase).toBe("night");
    expect(day.phase).toBe("day");
    expect(night.daylight).toBe(0);
    expect(day.daylight).toBe(1);
    expect(night.chartBackground).not.toBe(day.chartBackground);
    expect(night.reliefSky).not.toBe(day.reliefSky);
    expect(night.ambient.red).toBeLessThan(day.ambient.red);
    expect(night.key.blue).toBeLessThan(day.key.blue);
    expect(night.keyDirection).not.toEqual(day.keyDirection);
  });

  it("retains the established daytime appearance for legacy renderer fixtures", () => {
    const legacy = outdoorIlluminationPresentation(undefined);
    const day = outdoorIlluminationPresentation(time(720));
    expect(legacy).toEqual(day);
    expect(outdoorTerrainColor("#526f45", legacy)).toBe("#526f45");
  });

  it("moves continuously across all four phase boundaries", () => {
    const boundaries = [
      WORLD_DAWN_START_TICK,
      WORLD_DAY_START_TICK,
      WORLD_DUSK_START_TICK,
      WORLD_NIGHT_START_TICK,
    ] as const;
    for (const boundary of boundaries) {
      const before = outdoorIlluminationPresentation(time(boundary - 1));
      const after = outdoorIlluminationPresentation(time(boundary));
      expect(colorDelta(before.chartBackground, after.chartBackground), `${boundary} Chart`)
        .toBeLessThanOrEqual(2);
      expect(colorDelta(before.reliefSky, after.reliefSky), `${boundary} Relief`)
        .toBeLessThanOrEqual(3);
      expect(Math.abs(before.ambient.red - after.ambient.red), `${boundary} ambient`)
        .toBeLessThanOrEqual(2);
      expect(Math.abs(before.keyDirection.x - after.keyDirection.x), `${boundary} direction`)
        .toBeLessThan(0.01);
    }
  });

  it("keeps known terrain identities separated instead of covering them with a dark pane", () => {
    const night = outdoorIlluminationPresentation(time(0));
    const day = outdoorIlluminationPresentation(time(720));
    const bases = ["#74543b", "#ad824b", "#435d38", "#526f45", "#716c60"];
    const nightColors = bases.map((base) => outdoorTerrainColor(base, night));
    const dayColors = bases.map((base) => outdoorTerrainColor(base, day));

    expect(new Set(nightColors).size).toBe(bases.length);
    expect(nightColors.every((color) => brightness(color) >= 70)).toBe(true);
    expect(nightColors.every((color, index) =>
      brightness(color) < brightness(dayColors[index]!)
    )).toBe(true);
  });

  it("keeps every Chart and Relief depth band blue at dawn, day, dusk, and night", () => {
    const moments = [
      time(0),
      time(WORLD_DAWN_START_TICK + 30),
      time(720),
      time(WORLD_DUSK_START_TICK + 30),
    ];
    const bases = [
      WATER_PRESENTATION_PALETTE.shallows,
      WATER_PRESENTATION_PALETTE.channel,
      WATER_PRESENTATION_PALETTE.deep,
      RELIEF_WATER_PALETTE.shallows,
      RELIEF_WATER_PALETTE.channel,
      RELIEF_WATER_PALETTE.deep,
    ];

    for (const moment of moments) {
      const light = outdoorIlluminationPresentation(moment);
      for (const base of bases) {
        const color = outdoorWaterColor(base, light);
        const [red, green, blue] = rgb(color);
        expect(blue, `${moment.phase} ${base} -> ${color}`).toBeGreaterThan(green);
        expect(green, `${moment.phase} ${base} -> ${color}`).toBeGreaterThan(red);
      }
    }
  });

  it("shows a bounded local-light lift without recoloring water as land", () => {
    const night = outdoorIlluminationPresentation(time(0));
    const unlitGround = outdoorTerrainColor("#526f45", night, 0);
    const litGround = outdoorTerrainColor("#526f45", night, 0.78);
    const litWater = outdoorWaterColor(WATER_PRESENTATION_PALETTE.channel, night, 0.78);
    const [waterRed, waterGreen, waterBlue] = rgb(litWater);
    const emission = outdoorLocalLightEmission(0.78);

    expect(litGround).not.toBe(unlitGround);
    expect(brightness(litGround)).toBeGreaterThan(brightness(unlitGround));
    expect(waterBlue).toBeGreaterThan(waterGreen);
    expect(waterGreen).toBeGreaterThan(waterRed);
    expect(emission.red).toBeGreaterThan(emission.green);
    expect(emission.green).toBeGreaterThan(emission.blue);
    expect(outdoorLocalLightEmission(0)).toEqual({ red: 0, green: 0, blue: 0 });
  });
});
