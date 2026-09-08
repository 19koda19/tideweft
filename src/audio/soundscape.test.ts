import { describe, expect, it } from "vitest";

import {
  ALPHA30_FOUNDATION_ECOLOGY_VOICE_CUES,
  ambienceParameters,
  ecologyVoicePattern,
  incidentSoundPattern,
  smallWildlifePattern,
  spatialPanForBearing,
  titleCrescendoPattern,
  wildlifeAlarmPattern,
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

describe("wildlife alarm cue", () => {
  it("is a restrained immediate rise-and-fall distinct from a looping ambience", () => {
    const pattern = wildlifeAlarmPattern();
    expect(pattern).toEqual(wildlifeAlarmPattern());
    expect(pattern).toHaveLength(3);
    expect(pattern[0]?.delay).toBe(0);
    expect(pattern[1]?.frequency ?? 0).toBeGreaterThan(pattern[0]?.frequency ?? 0);
    expect(pattern[2]?.frequency ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(pattern[0]?.frequency ?? 0);
    expect(Math.max(...pattern.map(({ delay, duration }) => delay + duration)))
      .toBeLessThanOrEqual(0.25);
  });
});

describe("small-world wildlife cues", () => {
  it("keeps each small-world voice short, distinct, and deterministic", () => {
    const cues = ["rat-rustle", "cat-call", "rabbit-thump", "fox-yip"] as const;
    const patterns = cues.map((cue) => smallWildlifePattern(cue, 19));
    expect(new Set(patterns.map((pattern) => JSON.stringify(pattern))).size).toBe(cues.length);
    for (const [index, cue] of cues.entries()) {
      const pattern = patterns[index]!;
      expect(pattern).toEqual(smallWildlifePattern(cue, 19));
      expect(pattern.length).toBeGreaterThan(0);
      expect(Math.max(...pattern.map(({ delay, duration }) => delay + duration)))
        .toBeLessThanOrEqual(0.4);
    }
  });

  it("gives the authored corvid and amphibian events distinct bounded voices", () => {
    const cues = ["crow-nasal-double-call", "frog-chorus"] as const;
    const patterns = cues.map((cue) => ecologyVoicePattern(cue, 71));
    expect(new Set(patterns.map((pattern) => JSON.stringify(pattern))).size).toBe(cues.length);
    for (const [index, cue] of cues.entries()) {
      const pattern = patterns[index]!;
      expect(pattern).toEqual(ecologyVoicePattern(cue, 71));
      expect(pattern.length).toBeGreaterThan(0);
      expect(Math.max(...pattern.map(({ delay, duration }) => delay + duration)))
        .toBeLessThanOrEqual(0.4);
    }
  });

  it("uses malformed variation conservatively", () => {
    expect(smallWildlifePattern("rat-rustle", Number.NaN))
      .toEqual(smallWildlifePattern("rat-rustle", 0));
  });

  it("authors the complete Alpha 30 repertoire without a runtime playback claim", () => {
    expect(ALPHA30_FOUNDATION_ECOLOGY_VOICE_CUES).toEqual([
      "boar-grunt",
      "boar-squeal",
      "elk-alarm-bark",
      "elk-bugle",
      "wolf-growl",
      "wolf-howl",
    ]);
    const patterns = ALPHA30_FOUNDATION_ECOLOGY_VOICE_CUES.map((cue) => (
      ecologyVoicePattern(cue, 0x30e)
    ));
    expect(new Set(patterns.map((pattern) => JSON.stringify(pattern))).size)
      .toBe(ALPHA30_FOUNDATION_ECOLOGY_VOICE_CUES.length);
    for (const [index, cue] of ALPHA30_FOUNDATION_ECOLOGY_VOICE_CUES.entries()) {
      const pattern = patterns[index]!;
      expect(pattern).toEqual(ecologyVoicePattern(cue, 0x30e));
      expect(pattern.length).toBeGreaterThan(0);
      expect(pattern.every(({ delay, duration, frequency }) => (
        Number.isFinite(delay)
        && delay >= 0
        && Number.isFinite(duration)
        && duration > 0
        && Number.isFinite(frequency)
        && frequency >= 40
      ))).toBe(true);
      expect(Math.max(...pattern.map(({ delay, duration }) => delay + duration)))
        .toBeLessThanOrEqual(1.1);
      expect(ecologyVoicePattern(cue, Number.NaN)).toEqual(ecologyVoicePattern(cue, 0));
    }
  });
});

describe("spatial ecology cues", () => {
  it("maps east and west bearings into a bounded stereo field", () => {
    expect(spatialPanForBearing(0)).toBe(1);
    expect(spatialPanForBearing(Math.PI)).toBe(-1);
    expect(Math.abs(spatialPanForBearing(Math.PI / 2))).toBeLessThan(1e-12);
    expect(spatialPanForBearing(Number.NaN)).toBe(0);
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
