import { describe, expect, it } from "vitest";

import { incidentSoundPattern, titleCrescendoPattern } from "./soundscape";

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
