import { describe, expect, it } from "vitest";

import {
  situatedExpressionAcoustics,
  situatedExpressionSoundClass,
} from "./situatedExpressionAcoustics";

describe("situated expression acoustics", () => {
  it("classifies alarm-bearing dog calls separately from a neutral shelter whine", () => {
    expect(situatedExpressionSoundClass("guardian-dog-warning")).toBe("animal-alarm");
    expect(situatedExpressionSoundClass("guardian-dog-defensive-growl"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("guardian-dog-shelter-whine"))
      .toBe("animal-call");
    expect(situatedExpressionSoundClass("fish-crow-alarm-call"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("porter-heavy-load")).toBe("human-vocalization");
  });

  it("keeps a fish-crow call on the existing core-alarm human acoustic envelope", () => {
    expect(situatedExpressionAcoustics({
      meaning: "fish-crow-alarm-call",
      volume: "shout",
    })).toEqual({
      loudness: 1_000_000,
      rangeUnits: 9_100,
    });
    expect(situatedExpressionAcoustics({
      meaning: "fish-crow-alarm-call",
      volume: "shout",
    }).rangeUnits).toBeLessThan(situatedExpressionAcoustics("shout").rangeUnits);
  });

  it("makes the spoken defensive growl quieter and shorter-ranged than a warning shout", () => {
    const growl = situatedExpressionAcoustics("spoken");
    const bark = situatedExpressionAcoustics("shout");
    expect(growl.loudness).toBeLessThan(bark.loudness);
    expect(growl.rangeUnits).toBeLessThan(bark.rangeUnits);
  });

  it("keeps a murmured shelter whine quieter and shorter-ranged than a growl", () => {
    const whine = situatedExpressionAcoustics("murmur");
    const growl = situatedExpressionAcoustics("spoken");
    expect(whine.loudness).toBeLessThan(growl.loudness);
    expect(whine.rangeUnits).toBeLessThan(growl.rangeUnits);
  });
});
