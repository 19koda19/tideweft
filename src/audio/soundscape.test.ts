import { describe, expect, it } from "vitest";

import {
  ambienceParameters,
  incidentSoundPattern,
  titleCrescendoPattern,
} from "./soundscape";

describe("title crescendo", () => {
  it("is a deterministic short low-to-glass chord", () => {
    const pattern = titleCrescendoPattern();
    expect(pattern).toEqual(titleCrescendoPattern());
    expect(pattern).toHaveLength(5);
    expect(pattern[0]?.frequency).toBeLessThan(pattern.at(-1)?.frequency ?? 0);
    expect(Math.max(...pattern.map(({ delay, duration }) => delay + duration)))
      .toBeLessThanOrEqual(1.3);
  });
});

describe("traversal incident sound patterns", () => {
  it("is byte-identical for the same persisted variant seed", () => {
    expect(incidentSoundPattern("stumble", 0xf00d))
      .toEqual(incidentSoundPattern("stumble", 0xf00d));
  });

  it("keeps each incident legible as its own short Atari-like contour", () => {
    const kinds = ["stumble", "fall", "impact", "sweep", "recover"] as const;
    const signatures = kinds.map((kind) => JSON.stringify(incidentSoundPattern(kind, 17)));
    expect(new Set(signatures).size).toBe(kinds.length);
    for (const kind of kinds) {
      const pattern = incidentSoundPattern(kind, 17);
      expect(pattern.length).toBeGreaterThan(0);
      expect(pattern.length).toBeLessThanOrEqual(3);
      expect(Math.max(...pattern.map(({ delay, duration }) => delay + duration)))
        .toBeLessThanOrEqual(0.4);
    }
  });

  it("uses malformed variant data conservatively", () => {
    expect(incidentSoundPattern("fall", Number.NaN))
      .toEqual(incidentSoundPattern("fall", 0));
  });
});

describe("local noise ambience", () => {
  it("turns calm ohm into low quiet noise and rough whissh into brighter spatial noise", () => {
    const calm = ambienceParameters(0.2, 0, 0, {
      strength: 0.18,
      turbulence: 0.12,
      pan: -0.35,
      voice: "ohm",
    });
    const rough = ambienceParameters(0.8, 0.7, 0, {
      strength: 0.9,
      turbulence: 0.95,
      pan: 0.8,
      voice: "whissh",
    });
    expect(rough.frequency).toBeGreaterThan(calm.frequency);
    expect(rough.resonance).toBeGreaterThan(calm.resonance);
    expect(rough.levelScale).toBeGreaterThan(calm.levelScale);
    expect(calm.pan).toBe(-0.35);
    expect(rough.pan).toBe(0.8);
  });

  it("clamps malformed spatial input without making remote noise loud", () => {
    expect(ambienceParameters(0, 0, 0, {
      strength: Number.NaN,
      turbulence: Number.POSITIVE_INFINITY,
      pan: 9,
      voice: "silent",
    })).toEqual({ frequency: 170, resonance: 0.22, levelScale: 0.012, pan: 1 });
  });
});
