import { describe, expect, it } from "vitest";

import { reliefSoundingStyle } from "./reliefSounding";

describe("Relief 3D sounding marks", () => {
  it("encodes deeper water with taller, more strongly ruled marks", () => {
    const shoal = reliefSoundingStyle(0.12);
    const middle = reliefSoundingStyle(0.46);
    const deep = reliefSoundingStyle(0.86);

    expect([shoal.band, middle.band, deep.band]).toEqual(["shoal", "mid", "deep"]);
    expect(shoal.depthRank).toBeLessThan(middle.depthRank);
    expect(middle.depthRank).toBeLessThan(deep.depthRank);
    expect(shoal.needleScale).toBeLessThan(middle.needleScale);
    expect(middle.needleScale).toBeLessThan(deep.needleScale);
    expect(shoal.rungCount).toBeLessThanOrEqual(middle.rungCount);
    expect(middle.rungCount).toBeLessThanOrEqual(deep.rungCount);
  });

  it("clamps invalid and out-of-range renderer input safely", () => {
    expect(reliefSoundingStyle(Number.NaN)).toEqual(reliefSoundingStyle(0));
    expect(reliefSoundingStyle(-4)).toEqual(reliefSoundingStyle(0));
    expect(reliefSoundingStyle(4)).toEqual(reliefSoundingStyle(1));
    expect(reliefSoundingStyle(1)).toMatchObject({ depthRank: 9, rungCount: 4 });
  });
});
