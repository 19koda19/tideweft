import { describe, expect, it } from "vitest";

import {
  SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
  canonicalizeSituatedExpressionSemanticFact,
  situatedExpressionAcoustics,
  situatedExpressionSemanticFactForMemory,
  situatedExpressionSoundClass,
  situatedExpressionSoundInterrupt,
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
    expect(situatedExpressionSoundClass("deer-alarm-call"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("marsh-rabbit-alarm-thump"))
      .toBe("physical-thud");
    expect(situatedExpressionSoundClass("porter-heavy-load")).toBe("human-vocalization");
  });

  it("keeps the deer snort on core ecology's strong-alarm envelope", () => {
    expect(situatedExpressionAcoustics({
      meaning: "deer-alarm-call",
      volume: "shout",
    })).toEqual({
      loudness: 1_000_000,
      rangeUnits: 9_100,
    });
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

  it("keeps the marsh-rabbit thump on core ecology's soft small-prey envelope", () => {
    const thump = situatedExpressionAcoustics({
      meaning: "marsh-rabbit-alarm-thump",
      volume: "murmur",
    });
    expect(thump).toEqual({
      loudness: 420_000,
      rangeUnits: 9_100,
    });
    expect(thump.loudness).toBeLessThan(situatedExpressionAcoustics({
      meaning: "deer-alarm-call",
      volume: "shout",
    }).loudness);
  });

  it("keeps semantic alarm tone separate from the rabbit thump's soft interruption policy", () => {
    expect(situatedExpressionSoundInterrupt({
      meaning: "marsh-rabbit-alarm-thump",
      tone: "alarmed",
      volume: "murmur",
    })).toBe("none");
    expect(situatedExpressionSoundInterrupt({
      meaning: "deer-alarm-call",
      tone: "alarmed",
      volume: "shout",
    })).toBe("strong");
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

  it("derives one listener-safe fact only from the secured-store meaning", () => {
    const storeFact = situatedExpressionSemanticFactForMemory({
      sourceActorId: "HUMAN-KEEPER-1",
      triggerEventId: "settlement-store-closure:1",
      meaning: "keeper-secure-store-response",
      family: "work",
      priority: 600_000,
      meaningCooldownRemainingSteps: 30,
      familyCooldownRemainingSteps: 10,
    });
    expect(storeFact).toEqual({
      version: 1,
      expressionEventId: expect.stringMatching(/^situated-expression:event:v1:/),
      sourceActorId: "HUMAN-KEEPER-1",
      perceivedClass: "store-secured-report",
      minimumHearingConfidence: SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
    });
    expect(situatedExpressionSemanticFactForMemory({
      sourceActorId: "HUMAN-PORTER-1",
      triggerEventId: "contract-departed:1",
      meaning: "porter-heavy-load",
      family: "work",
      priority: 500_000,
      meaningCooldownRemainingSteps: 20,
      familyCooldownRemainingSteps: 8,
    })).toBeNull();
    if (storeFact === null) throw new Error("store fact fixture was not created");
    expect(canonicalizeSituatedExpressionSemanticFact({
      ...storeFact,
      perceivedClass: "hidden-store-details",
    })).toBeNull();
    expect(canonicalizeSituatedExpressionSemanticFact(Object.assign(
      Object.create({ inheritedAuthority: true }) as Record<string, unknown>,
      storeFact,
    ))).toBeNull();
  });
});
