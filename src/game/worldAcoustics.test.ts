import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import type { TraversalIncident } from "./traversalFeedback";
import { createWorldPosition } from "./worldPosition";
import {
  acousticVariantIndex,
  animalContactAcousticEvent,
  carriedGearBreakAcousticEvent,
  cargoImpactAcousticEvent,
  createWorldAcousticEvent,
  traversalIncidentAcousticEvent,
  type TraversalAcousticEventInput,
  type WorldAcousticEventInput,
} from "./worldAcoustics";

const POSITION = createWorldPosition(createRegionCoord(-3, 8), 12_500, 7_250);

function incident(
  overrides: Partial<TraversalIncident> = {},
): TraversalIncident {
  return {
    id: "player:0:traversal:19",
    actorId: 0,
    traversalOrdinal: 19,
    kind: "stumble",
    primaryCause: "loose-rock",
    label: "legacy prose must not be authority",
    detail: "legacy detail",
    position: { x: 12_500, y: 7_250 },
    remainingSteps: 8,
    totalSteps: 10,
    variantSeed: 0x1234_5678,
    cue: "stumble",
    ...overrides,
  };
}

function traversalInput(
  overrides: Partial<TraversalAcousticEventInput> = {},
): TraversalAcousticEventInput {
  return {
    incident: incident(),
    sourceId: "living-actor:local-player",
    sourcePosition: POSITION,
    occurredAtTick: 411,
    ...overrides,
  };
}

describe("structured world acoustics", () => {
  it("retains an explicit animal-call class for an actor-vocalization chorus", () => {
    const chorusInput = {
      triggerEventId: "ecology:aggregate:marsh-frog-chorus:411",
      domain: "actor-vocalization",
      sourceId: "aggregate:marsh-frog-chorus",
      sourceCategory: "animal",
      sourcePosition: POSITION,
      occurredAtTick: 411,
      action: "vocalize",
      sourceMaterial: "body",
      surfaceMaterial: "water",
      semanticFamily: "chorus",
      soundClass: "animal-call",
      interrupt: "none",
      intensity: 780_000,
      rangeUnits: 24_000,
      durationSteps: 24,
      priority: 360_000,
      salience: 440_000,
      repetitionKey: "aggregate-call:marsh-frog-chorus",
      textualEligibility: "salience-gated",
      accessibilityRelevance: "informative",
      variantSeed: 0x1357_2468,
    } as const;
    const chorus = createWorldAcousticEvent(chorusInput);
    const ordinaryContact = createWorldAcousticEvent({
      triggerEventId: "ecology:contact:rustle:411",
      domain: "animal-contact",
      sourceId: "A-v1-animal-contact",
      sourceCategory: "animal",
      sourcePosition: POSITION,
      occurredAtTick: 411,
      action: "brush",
      sourceMaterial: "body",
      surfaceMaterial: "foliage",
      semanticFamily: "rustle",
      intensity: 780_000,
      rangeUnits: 12_000,
      durationSteps: 8,
      priority: 320_000,
      salience: 360_000,
      repetitionKey: "animal-contact:rustle",
      textualEligibility: "salience-gated",
      accessibilityRelevance: "routine",
      variantSeed: 0x2468_1357,
    });

    expect(chorus).toMatchObject({
      domain: "actor-vocalization",
      semanticFamily: "chorus",
      soundClass: "animal-call",
      interrupt: "none",
    });
    expect(ordinaryContact).toMatchObject({
      semanticFamily: "rustle",
      soundClass: "physical-rustle",
      interrupt: "strong",
    });
    expect(createWorldAcousticEvent({
      ...chorusInput,
      domain: "animal-contact",
    })).toBeNull();
    expect(createWorldAcousticEvent({
      ...chorusInput,
      sourceCategory: "human",
    })).toBeNull();
    expect(createWorldAcousticEvent({
      ...chorusInput,
      semanticFamily: "rustle",
    })).toBeNull();
    expect(createWorldAcousticEvent({
      ...chorusInput,
      soundClass: "physical-rustle",
    })).toBeNull();
    const { soundClass: _omitted, ...chorusWithoutClass } = chorusInput;
    expect(createWorldAcousticEvent(chorusWithoutClass)).toBeNull();
  });

  it("maps a loose-rock slide to one stable scrape event without reading display prose", () => {
    const firstIncident = incident({ label: "THUD · entirely misleading prose" });
    const secondIncident = incident({ label: "splash splash splash" });
    const first = traversalIncidentAcousticEvent(traversalInput({ incident: firstIncident }));
    const second = traversalIncidentAcousticEvent(traversalInput({ incident: secondIncident }));

    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      triggerEventId: "player:0:traversal:19",
      domain: "traversal",
      sourceId: "living-actor:local-player",
      sourceCategory: "human",
      sourcePosition: POSITION,
      occurredAtTick: 411,
      action: "slide",
      sourceMaterial: "body",
      surfaceMaterial: "stone",
      semanticFamily: "scrape",
      force: "moderate",
      soundClass: "physical-scrape",
      interrupt: "none",
      textualEligibility: "salience-gated",
      accessibilityRelevance: "informative",
    });
    expect(first?.eventId).toMatch(/^acoustic:traversal:[0-9a-f]{16}$/u);
    expect(first?.rangeUnits).toBe(18_000);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("never accesses the legacy incident label while deriving semantics", () => {
    const source = incident() as TraversalIncident & { label: string };
    Object.defineProperty(source, "label", {
      enumerable: true,
      get: () => {
        throw new Error("legacy label was read");
      },
    });
    expect(() => traversalIncidentAcousticEvent(traversalInput({ incident: source })))
      .not.toThrow();
  });

  it("distinguishes a water slip's slosh from a forceful swept splash", () => {
    const slip = traversalIncidentAcousticEvent(traversalInput({
      incident: incident({ primaryCause: "deep-water" }),
    }));
    const sweep = traversalIncidentAcousticEvent(traversalInput({
      incident: incident({
        kind: "sweep",
        primaryCause: "strong-current",
        cue: "sweep",
      }),
    }));
    const fallIntoWater = traversalIncidentAcousticEvent(traversalInput({
      incident: incident({
        kind: "fall",
        primaryCause: "deep-water",
        cue: "impact",
      }),
    }));

    expect(slip).toMatchObject({
      action: "slip",
      surfaceMaterial: "water",
      semanticFamily: "slosh",
      force: "moderate",
      soundClass: "physical-slosh",
    });
    expect(sweep).toMatchObject({
      action: "sweep",
      surfaceMaterial: "water",
      semanticFamily: "splash",
      force: "heavy",
      soundClass: "physical-splash",
      interrupt: "strong",
      accessibilityRelevance: "urgent",
    });
    expect(fallIntoWater).toMatchObject({
      action: "slip",
      surfaceMaterial: "water",
      semanticFamily: "splash",
      force: "heavy",
    });
  });

  it("maps foliage contact to rustle and a hard landing to thud", () => {
    const foliage = traversalIncidentAcousticEvent(traversalInput({
      incident: incident({ primaryCause: "bramble-vines" }),
    }));
    const impact = traversalIncidentAcousticEvent(traversalInput({
      incident: incident({
        kind: "fall",
        primaryCause: "low-stability",
        cue: "impact",
      }),
    }));

    expect(foliage).toMatchObject({
      action: "brush",
      surfaceMaterial: "foliage",
      semanticFamily: "rustle",
      force: "light",
      accessibilityRelevance: "routine",
    });
    expect(impact).toMatchObject({
      action: "land",
      surfaceMaterial: "soil",
      semanticFamily: "thud",
      intensity: 900_000,
      force: "heavy",
      soundClass: "physical-thud",
      interrupt: "strong",
    });
  });

  it("keeps causal identity separate from deterministic presentation variation", () => {
    const base = traversalIncidentAcousticEvent(traversalInput());
    const differentVariant = traversalIncidentAcousticEvent(traversalInput({
      incident: incident({ variantSeed: 0x8765_4321 }),
    }));
    if (!base || !differentVariant) throw new Error("expected valid acoustic events");

    expect(differentVariant.eventId).toBe(base.eventId);
    expect(differentVariant.presentationVariantSeed).not.toBe(base.presentationVariantSeed);
    expect(acousticVariantIndex(base, 7)).toBe(acousticVariantIndex(base, 7));
    expect(acousticVariantIndex(base, 7)).toBeGreaterThanOrEqual(0);
    expect(acousticVariantIndex(base, 7)).toBeLessThan(7);
    expect(acousticVariantIndex(base, 0)).toBeNull();
    expect(acousticVariantIndex(
      { presentationVariantSeed: Number.NaN },
      3,
    )).toBeNull();
  });

  it("derives a physical cargo contact from committed shock and material context", () => {
    const base = {
      triggerEventId: "cargo-separation:region:-3,8:19",
      sourceId: "cargo-lot:promise:17",
      sourcePosition: POSITION,
      occurredAtTick: 411,
      cargoShock: 820_000,
      cargoKind: "gear" as const,
      surfaceMaterial: "stone" as const,
    };
    const first = cargoImpactAcousticEvent(base);
    const second = cargoImpactAcousticEvent(base);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      triggerEventId: base.triggerEventId,
      domain: "object-contact",
      sourceId: base.sourceId,
      sourceCategory: "object",
      action: "cargo-shift",
      sourceMaterial: "cargo",
      surfaceMaterial: "stone",
      semanticFamily: "clatter",
      force: "heavy",
      accessibilityRelevance: "urgent",
    });
    expect(cargoImpactAcousticEvent({
      ...base,
      cargoKind: "other",
      surfaceMaterial: "water",
    })).toMatchObject({ semanticFamily: "splash" });
    expect(cargoImpactAcousticEvent({ ...base, cargoShock: 0 })).toBeNull();
  });

  it("derives one tool/material crack only from an exact committed ridge-cleat break", () => {
    const receipt = {
      gearId: 61,
      kind: "ridge-cleats" as const,
      benefit: "ridge-grip" as const,
      conditionBefore: 8_000,
      conditionAfter: 0,
      conditionSpent: 8_000,
    };
    const first = carriedGearBreakAcousticEvent({
      receipt,
      sourcePosition: POSITION,
      occurredAtTick: 411,
    });
    const second = carriedGearBreakAcousticEvent({
      receipt,
      sourcePosition: POSITION,
      occurredAtTick: 411,
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      domain: "tool-material",
      sourceId: "gear:61",
      sourceCategory: "tool",
      action: "break",
      sourceMaterial: "mixed",
      surfaceMaterial: "stone",
      semanticFamily: "crack",
      soundClass: "physical-crack",
      force: "moderate",
      interrupt: "none",
      textualEligibility: "salience-gated",
      accessibilityRelevance: "informative",
    });
    expect(carriedGearBreakAcousticEvent({
      receipt: { ...receipt, conditionAfter: 1 },
      sourcePosition: POSITION,
      occurredAtTick: 411,
    })).toBeNull();
    expect(carriedGearBreakAcousticEvent({
      receipt: { ...receipt, kind: "marsh-wraps", benefit: "marsh-footing" },
      sourcePosition: POSITION,
      occurredAtTick: 411,
    })).toBeNull();
    expect(carriedGearBreakAcousticEvent({
      receipt: { ...receipt, conditionBefore: 12_001, conditionSpent: 12_001 },
      sourcePosition: POSITION,
      occurredAtTick: 411,
    })).toBeNull();
  });

  it("varies animal contact by body, movement, and physical surface", () => {
    const dogInBrush = animalContactAcousticEvent({
      triggerEventId: "dog-step:17",
      sourceId: "dog:working:2",
      sourcePosition: POSITION,
      occurredAtTick: 412,
      bodySize: "medium",
      movement: "ordinary",
      surfaceMaterial: "foliage",
    });
    const smallAnimalOnStone = animalContactAcousticEvent({
      triggerEventId: "small-animal-step:9",
      sourceId: "animal:mouse:9",
      sourcePosition: POSITION,
      occurredAtTick: 412,
      bodySize: "small",
      movement: "fast",
      surfaceMaterial: "stone",
    });
    const largeAnimalLanding = animalContactAcousticEvent({
      triggerEventId: "large-animal-step:3",
      sourceId: "animal:large:3",
      sourcePosition: POSITION,
      occurredAtTick: 412,
      bodySize: "large",
      movement: "ordinary",
      surfaceMaterial: "soil",
    });
    const dogOnStone = animalContactAcousticEvent({
      triggerEventId: "dog-step:18",
      sourceId: "dog:working:2",
      sourcePosition: POSITION,
      occurredAtTick: 413,
      bodySize: "medium",
      movement: "fast",
      surfaceMaterial: "stone",
    });

    expect(dogInBrush).toMatchObject({
      domain: "animal-contact",
      action: "brush",
      semanticFamily: "rustle",
      sourceCategory: "animal",
      textualEligibility: "salience-gated",
    });
    expect(smallAnimalOnStone).toMatchObject({ semanticFamily: "skitter" });
    expect(largeAnimalLanding).toMatchObject({ semanticFamily: "thud", force: "moderate" });
    expect(dogOnStone).toMatchObject({
      semanticFamily: "scrape",
      textualEligibility: "salience-gated",
    });
    expect(animalContactAcousticEvent({
      triggerEventId: "invalid-animal-step",
      sourceId: "animal:invalid",
      sourcePosition: POSITION,
      occurredAtTick: 412,
      bodySize: "tiny" as never,
      movement: "ordinary",
      surfaceMaterial: "soil",
    })).toBeNull();
  });

  it("accepts the shared future contracts for material work, violence, and vessels", () => {
    const contracts: readonly WorldAcousticEventInput[] = [
      {
        triggerEventId: "craft:saw-wood:17",
        domain: "tool-material",
        sourceId: "tool:saw:2",
        sourceCategory: "tool",
        sourcePosition: POSITION,
        occurredAtTick: 701,
        action: "tool-contact",
        sourceMaterial: "metal",
        surfaceMaterial: "wood",
        semanticFamily: "scrape",
        intensity: 520_000,
        rangeUnits: 16_000,
        durationSteps: 8,
        priority: 550_000,
        salience: 600_000,
        repetitionKey: "work:saw-wood:tool:saw:2",
        textualEligibility: "salience-gated",
        accessibilityRelevance: "informative",
        variantSeed: 17,
      },
      {
        triggerEventId: "violence:impact:4",
        domain: "violence",
        sourceId: "tool:staff:8",
        sourceCategory: "tool",
        sourcePosition: POSITION,
        occurredAtTick: 702,
        action: "collision",
        sourceMaterial: "wood",
        surfaceMaterial: "body",
        semanticFamily: "thud",
        intensity: 900_000,
        rangeUnits: 28_000,
        durationSteps: 4,
        priority: 880_000,
        salience: 920_000,
        repetitionKey: "violence:staff-body:tool:staff:8",
        textualEligibility: "salience-gated",
        accessibilityRelevance: "urgent",
        variantSeed: 4,
      },
      {
        triggerEventId: "long-crossing:hull-water:3",
        domain: "vehicle",
        sourceId: "vessel:skiff:3",
        sourceCategory: "vehicle",
        sourcePosition: POSITION,
        occurredAtTick: 703,
        action: "collision",
        sourceMaterial: "wood",
        surfaceMaterial: "water",
        semanticFamily: "splash",
        intensity: 640_000,
        rangeUnits: 22_000,
        durationSteps: 5,
        priority: 610_000,
        salience: 650_000,
        repetitionKey: "vessel:hull-water:vessel:skiff:3",
        textualEligibility: "salience-gated",
        accessibilityRelevance: "informative",
        variantSeed: 3,
      },
    ];

    const events = contracts.map(createWorldAcousticEvent);
    expect(events.every((event) => event !== null)).toBe(true);
    expect(events.map((event) => event?.domain)).toEqual([
      "tool-material",
      "violence",
      "vehicle",
    ]);
    expect(events.map((event) => event?.semanticFamily)).toEqual([
      "scrape",
      "thud",
      "splash",
    ]);
    expect(events.map((event) => event?.eventId)).toEqual([
      expect.stringMatching(/^acoustic:tool-material:[0-9a-f]{16}$/u),
      expect.stringMatching(/^acoustic:violence:[0-9a-f]{16}$/u),
      expect.stringMatching(/^acoustic:vehicle:[0-9a-f]{16}$/u),
    ]);
  });

  it("fails closed on malformed traversal authority and malformed generic events", () => {
    expect(traversalIncidentAcousticEvent(traversalInput({
      incident: incident({ remainingSteps: 11, totalSteps: 10 }),
    }))).toBeNull();
    expect(traversalIncidentAcousticEvent(traversalInput({
      incident: incident({ primaryCause: "not-a-cause" as never }),
    }))).toBeNull();

    const generic: WorldAcousticEventInput = {
      triggerEventId: "object-drop:7",
      domain: "object-contact",
      sourceId: "cargo:7",
      sourceCategory: "object",
      sourcePosition: POSITION,
      occurredAtTick: 500,
      action: "collision",
      sourceMaterial: "cargo",
      surfaceMaterial: "wood",
      semanticFamily: "thud",
      intensity: 720_000,
      rangeUnits: 20_000,
      durationSteps: 3,
      priority: 600_000,
      salience: 700_000,
      repetitionKey: "cargo-thud:7",
      textualEligibility: "salience-gated",
      accessibilityRelevance: "informative",
      variantSeed: 7,
    };
    expect(createWorldAcousticEvent(generic)).toMatchObject({
      domain: "object-contact",
      sourceCategory: "object",
      semanticFamily: "thud",
    });
    expect(createWorldAcousticEvent({ ...generic, rangeUnits: 0 })).toBeNull();
    expect(createWorldAcousticEvent({
      ...generic,
      sourcePosition: { ...POSITION, localX: -1 },
    })).toBeNull();
  });
});
