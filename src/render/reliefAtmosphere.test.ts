import { describe, expect, it } from "vitest";

import {
  RELIEF_ATMOSPHERE_BAND_COUNT,
  buildReliefAtmosphereBands,
} from "./reliefAtmosphere";

describe("Relief partition-invisible atmosphere", () => {
  it("uses one bounded screen-space gradient independent of terrain chunk geometry", () => {
    const bands = buildReliefAtmosphereBands(1_440, 900, {
      kind: "clear",
      intensity: 0,
      wind: { x: 0, y: 0 },
    });
    expect(bands).toHaveLength(RELIEF_ATMOSPHERE_BAND_COUNT);
    expect(bands[0]?.top).toBe(0);
    expect(bands.at(-1)?.bottom).toBeCloseTo(630, 8);
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index]?.top).toBeCloseTo(bands[index - 1]?.bottom ?? -1, 8);
      expect(bands[index]?.alpha).toBeLessThanOrEqual(bands[index - 1]?.alpha ?? 0);
    }
    expect(bands.every((band) => band.alpha >= 0 && band.alpha <= 118)).toBe(true);
  });

  it("thickens for low-visibility weather without changing its bounded draw count", () => {
    const clear = buildReliefAtmosphereBands(320, 240, {
      kind: "clear",
      intensity: 0,
      wind: { x: 0, y: 0 },
    });
    const mist = buildReliefAtmosphereBands(320, 240, mistWeather());
    expect(mist).toHaveLength(clear.length);
    expect(mist[0]?.alpha).toBeGreaterThan(clear[0]?.alpha ?? 0);
    expect(buildReliefAtmosphereBands(0, 240, mistWeather())).toEqual([]);
    expect(buildReliefAtmosphereBands(320, Number.NaN, mistWeather())).toEqual([]);
  });
});

function mistWeather() {
  return {
    kind: "mist" as const,
    intensity: 1,
    visibility: 0.12,
    wind: { x: 0.3, y: -0.2 },
  };
}
