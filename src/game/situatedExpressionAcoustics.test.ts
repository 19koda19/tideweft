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
    expect(situatedExpressionSoundClass("porter-heavy-load")).toBe("human-vocalization");
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
