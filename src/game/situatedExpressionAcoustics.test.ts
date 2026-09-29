import { describe, expect, it } from "vitest";

import {
  situatedExpressionAcoustics,
  situatedExpressionSoundClass,
} from "./situatedExpressionAcoustics";

describe("situated expression acoustics", () => {
  it("keeps both guardian dog calls in the shared animal hearing class", () => {
    expect(situatedExpressionSoundClass("guardian-dog-warning")).toBe("animal-alarm");
    expect(situatedExpressionSoundClass("guardian-dog-defensive-growl"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("porter-heavy-load")).toBe("human-vocalization");
  });

  it("makes the spoken defensive growl quieter and shorter-ranged than a warning shout", () => {
    const growl = situatedExpressionAcoustics("spoken");
    const bark = situatedExpressionAcoustics("shout");
    expect(growl.loudness).toBeLessThan(bark.loudness);
    expect(growl.rangeUnits).toBeLessThan(bark.rangeUnits);
  });
});
