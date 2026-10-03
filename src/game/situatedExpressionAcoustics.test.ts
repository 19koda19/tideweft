import { describe, expect, it } from "vitest";

import {
  SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
  canonicalizeSituatedExpressionSemanticFact,
  situatedExpressionAudioPresentation,
  situatedExpressionAcoustics,
  situatedExpressionSemanticFactForMemory,
  situatedExpressionSoundClass,
  situatedExpressionSoundInterrupt,
} from "./situatedExpressionAcoustics";

describe("situated expression acoustics", () => {
  it("preserves a chicken alarm's soft ecology envelope without decoding alarm intent for humans", () => {
    const expression = {
      meaning: "domestic-chicken-alarm-call" as const,
      vocalization: "chicken-alarm-squawk" as const,
      volume: "murmur" as const, tone: "alarmed" as const, variantSeed: 157,
    };
    expect(situatedExpressionAcoustics(expression)).toEqual({
      loudness: 420_000, rangeUnits: 9_100,
    });
    expect(situatedExpressionSoundClass(expression)).toBe("animal-call");
    expect(situatedExpressionSoundInterrupt(expression)).toBe("none");
    expect(situatedExpressionAudioPresentation(expression, { certainty: 500_000, pan: 0.25 }))
      .toMatchObject({
        sound: { kind: "vocalization", vocalization: "chicken-alarm-squawk" },
        variantSeed: 157, pan: 0.25,
      });
    expect(situatedExpressionAudioPresentation(expression, { certainty: 500_000, pan: 0.25 })?.volume)
      .toBeCloseTo(0.2835, 12);
  });

  it("preserves a duck alarm as a quiet animal call without inventing human alarm knowledge", () => {
    const expression = {
      meaning: "american-black-duck-alarm-call" as const,
      vocalization: "duck-alarm-quack" as const,
      volume: "murmur" as const, tone: "alarmed" as const, variantSeed: 163,
    };
    expect(situatedExpressionAcoustics(expression)).toEqual({
      loudness: 420_000, rangeUnits: 9_100,
    });
    expect(situatedExpressionSoundClass(expression)).toBe("animal-call");
    expect(situatedExpressionSoundInterrupt(expression)).toBe("none");
    // A forged presentation volume cannot escalate the ecology-owned signal.
    expect(situatedExpressionAcoustics({ ...expression, volume: "shout" }))
      .toEqual({ loudness: 420_000, rangeUnits: 9_100 });
    expect(situatedExpressionSoundInterrupt({ ...expression, volume: "shout" }))
      .toBe("none");
    const audio = situatedExpressionAudioPresentation(expression, {
      certainty: 500_000, pan: -0.25,
    });
    expect(audio).toMatchObject({
      sound: { kind: "vocalization", vocalization: "duck-alarm-quack" },
      variantSeed: 163, pan: -0.25,
    });
    expect(audio?.volume).toBeCloseTo(0.2835, 12);
    expect(situatedExpressionAudioPresentation(expression, {
      certainty: 1_000_001, pan: -0.25,
    })).toBeNull();
    expect(situatedExpressionSemanticFactForMemory({
      sourceActorId: "DUCK-current-acoustics", triggerEventId: "duck-alarm:1",
      meaning: expression.meaning, family: "animal-signal", priority: 160_000,
      meaningCooldownRemainingSteps: 24, familyCooldownRemainingSteps: 12,
    })).toBeNull();
  });

  it("classifies alarm-bearing dog calls separately from a neutral shelter whine", () => {
    expect(situatedExpressionSoundClass("guardian-dog-warning")).toBe("animal-alarm");
    expect(situatedExpressionSoundClass("guardian-dog-defensive-growl"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("guardian-dog-shelter-whine"))
      .toBe("animal-call");
    expect(situatedExpressionSoundClass("domestic-cat-rain-distress-call"))
      .toBe("animal-call");
    expect(situatedExpressionSoundClass("fish-crow-alarm-call"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("deer-alarm-call"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("gull-alarm-call"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("elk-alarm-call"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("wild-boar-alarm-call"))
      .toBe("animal-alarm");
    expect(situatedExpressionSoundClass("marsh-rabbit-alarm-thump"))
      .toBe("physical-thud");
    expect(situatedExpressionSoundClass("marsh-fox-pursuit-yip"))
      .toBe("animal-call");
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

  it("keeps a gull cry on its core-ecology alarm envelope", () => {
    expect(situatedExpressionAcoustics({
      meaning: "gull-alarm-call",
      volume: "shout",
    })).toEqual({
      loudness: 1_000_000,
      rangeUnits: 9_100,
    });
    expect(situatedExpressionSoundInterrupt({
      meaning: "gull-alarm-call",
      tone: "alarmed",
      volume: "shout",
    })).toBe("strong");
  });

  it("projects species-aware gull audio when optional retained expression is unavailable", () => {
    const audio = situatedExpressionAudioPresentation({
      meaning: "gull-alarm-call",
      vocalization: "gull-alarm-cry",
      volume: "shout",
      variantSeed: 0x51a7,
    }, {
      certainty: 500_000,
      pan: -0.25,
    });
    expect(audio).toMatchObject({
      sound: {
        kind: "vocalization",
        vocalization: "gull-alarm-cry",
      },
      variantSeed: 0x51a7,
      pan: -0.25,
    });
    expect(audio?.volume).toBeCloseTo(0.621, 12);
    expect(situatedExpressionAudioPresentation({
      meaning: "gull-alarm-call",
      vocalization: "gull-alarm-cry",
      volume: "shout",
      variantSeed: 0x51a7,
    }, {
      certainty: 1_000_001,
      pan: -0.25,
    })).toBeNull();
  });

  it("preserves the elk alarm envelope and audio independently of optional text admission", () => {
    const expression = {
      meaning: "elk-alarm-call" as const,
      vocalization: "elk-alarm-bark" as const,
      tone: "alarmed" as const,
      volume: "shout" as const,
      variantSeed: 0xe1a,
    };
    expect(situatedExpressionAcoustics(expression)).toEqual({
      loudness: 1_000_000,
      rangeUnits: 9_100,
    });
    expect(situatedExpressionSoundInterrupt(expression)).toBe("strong");
    const audio = situatedExpressionAudioPresentation(expression, {
      certainty: 500_000,
      pan: 0.25,
    });
    expect(audio).toMatchObject({
      sound: { kind: "vocalization", vocalization: "elk-alarm-bark" },
      variantSeed: 0xe1a,
      pan: 0.25,
    });
    expect(audio?.volume).toBeCloseTo(0.621, 12);
  });

  it("preserves the boar alarm envelope and audio independently of optional text admission", () => {
    const expression = {
      meaning: "wild-boar-alarm-call" as const,
      vocalization: "boar-grunt" as const,
      tone: "alarmed" as const,
      volume: "shout" as const,
      variantSeed: 0xb0a,
    };
    expect(situatedExpressionAcoustics(expression)).toEqual({
      loudness: 1_000_000,
      rangeUnits: 9_100,
    });
    expect(situatedExpressionSoundInterrupt(expression)).toBe("strong");
    const audio = situatedExpressionAudioPresentation(expression, {
      certainty: 500_000,
      pan: 0.25,
    });
    expect(audio).toMatchObject({
      sound: { kind: "vocalization", vocalization: "boar-grunt" },
      variantSeed: 0xb0a,
      pan: 0.25,
    });
    expect(audio?.volume).toBeCloseTo(0.621, 12);
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
    expect(situatedExpressionSoundInterrupt({
      meaning: "domestic-cat-rain-distress-call",
      tone: "restrained",
      volume: "murmur",
    })).toBe("none");
    expect(situatedExpressionSoundInterrupt({
      meaning: "marsh-fox-pursuit-yip",
      tone: "restrained",
      volume: "spoken",
    })).toBe("none");
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

  it("keeps the restrained cat rain call on the bounded murmur envelope", () => {
    expect(situatedExpressionAcoustics({
      meaning: "domestic-cat-rain-distress-call",
      volume: "murmur",
    })).toEqual({
      loudness: 360_000,
      rangeUnits: 8_000,
    });
  });

  it("keeps the restrained fox pursuit yip on the bounded spoken envelope", () => {
    expect(situatedExpressionAcoustics({
      meaning: "marsh-fox-pursuit-yip",
      volume: "spoken",
    })).toEqual({
      loudness: 620_000,
      rangeUnits: 18_000,
    });
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
