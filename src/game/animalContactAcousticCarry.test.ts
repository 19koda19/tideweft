import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { hashCanonical } from "../sim/util";
import {
  ANIMAL_CONTACT_ACOUSTIC_CARRY_MAX_RECORDS,
  animalContactAcousticBodySizeForDogSize,
  animalContactMovementForDistance,
  appendAnimalContactAcousticCarryRecord,
  animalContactAcousticTriggerEventId,
  canonicalizeAnimalContactAcousticCarry,
  canonicalizeAnimalContactAcousticCarryRecord,
  createAnimalContactAcousticCarry,
  createAnimalContactAcousticCarryRecord,
  physicalSoundSampleForAnimalContact,
  physicalSoundSamplesForAnimalContactCarry,
  type AnimalContactAcousticCarryRecord,
  type AnimalContactAcousticBodySize,
} from "./animalContactAcousticCarry";
import { MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS } from "./livingActorLocomotion";
import {
  animalContactAcousticEvent,
  type AcousticMaterialClass,
} from "./worldAcoustics";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

const REGION = createRegionCoord(4, -3);
const EVENT_TICK = 812;

interface RecordFixtureOptions {
  readonly sourceId?: string;
  readonly before?: WorldPosition;
  readonly after?: WorldPosition;
  readonly tick?: number;
  readonly surface?: AcousticMaterialClass;
  readonly bodySize?: AnimalContactAcousticBodySize;
}

function contactRecord(
  options: RecordFixtureOptions = {},
): AnimalContactAcousticCarryRecord {
  const sourceId = options.sourceId ?? "A-v1-dog-contact";
  const before = options.before ?? createWorldPosition(REGION, 20_000, 18_000);
  const after = options.after ?? createWorldPosition(REGION, 21_250, 18_000);
  const tick = options.tick ?? EVENT_TICK;
  const surface = options.surface ?? "foliage";
  const bodySize = options.bodySize ?? "medium";
  const triggerEventId = animalContactAcousticTriggerEventId({
    sourceId,
    beforePosition: before,
    afterPosition: after,
    occurredAtTick: tick,
  });
  if (triggerEventId === null) throw new Error("Expected animal-contact trigger fixture");
  const event = animalContactAcousticEvent({
    triggerEventId,
    sourceId,
    sourcePosition: after,
    occurredAtTick: tick,
    bodySize,
    movement: animalContactMovementForDistance(Math.hypot(
      worldPositionDelta(before, after).x,
      worldPositionDelta(before, after).y,
    )) ?? "ordinary",
    surfaceMaterial: surface,
  });
  if (event === null) throw new Error("Expected animal-contact acoustic fixture");
  const record = createAnimalContactAcousticCarryRecord({
    beforePosition: before,
    event,
  });
  if (record === null) throw new Error("Expected animal-contact carry fixture");
  return record;
}

describe("animal-contact acoustic causal carry", () => {
  it("retains exact event-time evidence and projects one generic physical sound", () => {
    const before = createWorldPosition(REGION, 20_000, 18_000);
    const after = createWorldPosition(REGION, 21_250, 18_000);
    const record = contactRecord({ before, after, surface: "water" });
    const sample = physicalSoundSampleForAnimalContact(record);

    expect(record).toMatchObject({
      version: 1,
      beforePosition: before,
      event: {
        domain: "animal-contact",
        sourceId: "A-v1-dog-contact",
        sourceCategory: "animal",
        sourcePosition: after,
        occurredAtTick: EVENT_TICK,
        sourceMaterial: "body",
        surfaceMaterial: "water",
        semanticFamily: "splash",
      },
    });
    expect(record.beforePosition).not.toBe(before);
    expect(record.event.sourcePosition).not.toBe(after);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.beforePosition)).toBe(true);
    expect(Object.isFrozen(record.beforePosition.region)).toBe(true);
    expect(Object.isFrozen(record.event)).toBe(true);
    expect(sample).toEqual({
      acousticEventId: record.event.eventId,
      id: expect.stringMatching(/^pac-[0-9a-f]{16}$/u),
      position: record.event.sourcePosition,
      soundClass: record.event.soundClass,
      soundInterrupt: record.event.interrupt,
      soundLoudness: record.event.intensity,
      soundRangeUnits: record.event.rangeUnits,
      sourceActorId: record.event.sourceId,
    });
    expect(Object.isFrozen(sample)).toBe(true);
    expect(Object.isFrozen(sample?.position)).toBe(true);
  });

  it("derives slow, ordinary, and fast movement at the exact shared boundaries", () => {
    const before = createWorldPosition(REGION, 10_000, 10_000);
    const slow = contactRecord({
      sourceId: "A-v1-dog-slow",
      before,
      after: createWorldPosition(
        REGION,
        10_000 + WORLD_POSITION_UNITS_PER_TILE / 2,
        10_000,
      ),
      surface: "stone",
    });
    const ordinary = contactRecord({
      sourceId: "A-v1-dog-ordinary",
      before,
      after: createWorldPosition(
        REGION,
        10_001 + WORLD_POSITION_UNITS_PER_TILE / 2,
        10_000,
      ),
      surface: "stone",
    });
    const fast = contactRecord({
      sourceId: "A-v1-dog-fast",
      before,
      after: createWorldPosition(REGION, 11_001, 10_000),
      surface: "stone",
    });

    expect(animalContactMovementForDistance(WORLD_POSITION_UNITS_PER_TILE / 2)).toBe("slow");
    expect(animalContactMovementForDistance(
      WORLD_POSITION_UNITS_PER_TILE / 2 + 1,
    )).toBe("ordinary");
    expect(animalContactMovementForDistance(WORLD_POSITION_UNITS_PER_TILE)).toBe("ordinary");
    expect(animalContactMovementForDistance(WORLD_POSITION_UNITS_PER_TILE + 1)).toBe("fast");
    expect(slow.event.intensity).toBeLessThan(ordinary.event.intensity);
    expect(fast.event.intensity).toBe(560_000);
    expect(canonicalizeAnimalContactAcousticCarryRecord(slow)).toEqual(slow);
    expect(canonicalizeAnimalContactAcousticCarryRecord(ordinary)).toEqual(ordinary);
    expect(canonicalizeAnimalContactAcousticCarryRecord(fast)).toEqual(fast);

    const acrossRegion = contactRecord({
      sourceId: "A-v1-dog-region-edge",
      before: createWorldPosition(REGION, REGION_WIDTH_UNITS - 500, 10_000),
      after: createWorldPosition(createRegionCoord(REGION.x + 1, REGION.y), 500, 10_000),
      surface: "stone",
    });
    expect(acrossRegion.event.intensity).toBe(450_000);
    expect(canonicalizeAnimalContactAcousticCarryRecord(acrossRegion)).toEqual(acrossRegion);
  });

  it("retains distinct small, medium, and large body acoustics", () => {
    const small = contactRecord({ sourceId: "A-v1-small-dog", bodySize: "small" });
    const medium = contactRecord({ sourceId: "A-v1-medium-dog", bodySize: "medium" });
    const large = contactRecord({ sourceId: "A-v1-large-dog", bodySize: "large" });

    expect(small.event.intensity).toBeLessThan(medium.event.intensity);
    expect(medium.event.intensity).toBeLessThan(large.event.intensity);
    expect(small.event.rangeUnits).toBeLessThan(medium.event.rangeUnits);
    expect(medium.event.rangeUnits).toBeLessThan(large.event.rangeUnits);
    expect(canonicalizeAnimalContactAcousticCarryRecord(small)).toEqual(small);
    expect(canonicalizeAnimalContactAcousticCarryRecord(medium)).toEqual(medium);
    expect(canonicalizeAnimalContactAcousticCarryRecord(large)).toEqual(large);
    expect(animalContactAcousticBodySizeForDogSize("tiny")).toBe("small");
    expect(animalContactAcousticBodySizeForDogSize("small")).toBe("small");
    expect(animalContactAcousticBodySizeForDogSize("medium")).toBe("medium");
    expect(animalContactAcousticBodySizeForDogSize("large")).toBe("large");
    expect(animalContactAcousticBodySizeForDogSize("very-large")).toBe("large");
  });

  it("rejects forged triggers, movement evidence, surfaces, semantics, and fields", () => {
    const record = contactRecord();
    const shiftedBefore = createWorldPosition(REGION, 20_001, 18_000);
    expect(canonicalizeAnimalContactAcousticCarryRecord({
      ...record,
      beforePosition: shiftedBefore,
    })).toBeNull();
    expect(canonicalizeAnimalContactAcousticCarryRecord({
      ...record,
      event: { ...record.event, triggerEventId: "animal-contact:forged" },
    })).toBeNull();
    expect(canonicalizeAnimalContactAcousticCarryRecord({
      ...record,
      event: { ...record.event, surfaceMaterial: "water" },
    })).toBeNull();
    expect(canonicalizeAnimalContactAcousticCarryRecord({
      ...record,
      event: { ...record.event, intensity: record.event.intensity + 1 },
    })).toBeNull();
    expect(canonicalizeAnimalContactAcousticCarryRecord({
      ...record,
      event: { ...record.event, presentationVariantSeed: -0 },
    })).toBeNull();

    const largeEvent = animalContactAcousticEvent({
      triggerEventId: record.event.triggerEventId,
      sourceId: record.event.sourceId,
      sourcePosition: record.event.sourcePosition,
      occurredAtTick: record.event.occurredAtTick,
      bodySize: "large",
      movement: "fast",
      surfaceMaterial: record.event.surfaceMaterial,
    });
    expect(largeEvent).not.toBeNull();
    expect(canonicalizeAnimalContactAcousticCarryRecord({
      ...record,
      event: largeEvent,
    })).not.toBeNull();

    const metalEvent = animalContactAcousticEvent({
      triggerEventId: record.event.triggerEventId,
      sourceId: record.event.sourceId,
      sourcePosition: record.event.sourcePosition,
      occurredAtTick: record.event.occurredAtTick,
      bodySize: "medium",
      movement: "fast",
      surfaceMaterial: "metal",
    });
    expect(metalEvent).not.toBeNull();
    expect(canonicalizeAnimalContactAcousticCarryRecord({
      ...record,
      event: metalEvent,
    })).toBeNull();

    expect(canonicalizeAnimalContactAcousticCarryRecord({
      ...record,
      unexpected: true,
    })).toBeNull();
    for (const key of Object.keys(record)) {
      const missing = { ...record } as Record<string, unknown>;
      delete missing[key];
      expect(canonicalizeAnimalContactAcousticCarryRecord(missing)).toBeNull();
    }
  });

  it("rejects stationary, malformed, and unsafe-distance trigger evidence", () => {
    const position = createWorldPosition(REGION, 4_000, 5_000);
    expect(animalContactAcousticTriggerEventId({
      sourceId: "A-v1-stationary-dog",
      beforePosition: position,
      afterPosition: position,
      occurredAtTick: EVENT_TICK,
    })).toBeNull();
    expect(animalContactAcousticTriggerEventId({
      sourceId: "A-v1-negative-zero-tick",
      beforePosition: position,
      afterPosition: createWorldPosition(REGION, 4_001, 5_000),
      occurredAtTick: -0,
    })).toBeNull();
    expect(animalContactAcousticTriggerEventId({
      sourceId: "",
      beforePosition: position,
      afterPosition: createWorldPosition(REGION, 4_001, 5_000),
      occurredAtTick: EVENT_TICK,
    })).toBeNull();
    expect(animalContactAcousticTriggerEventId({
      sourceId: "dog with spaces",
      beforePosition: position,
      afterPosition: createWorldPosition(REGION, 4_001, 5_000),
      occurredAtTick: EVENT_TICK,
    })).toBeNull();

    const boundedBefore = createWorldPosition(REGION, 10_000, 5_000);
    const boundedAfter = createWorldPosition(
      REGION,
      10_000 + MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS,
      5_000,
    );
    expect(animalContactAcousticTriggerEventId({
      sourceId: "A-v1-bounded-dog",
      beforePosition: boundedBefore,
      afterPosition: boundedAfter,
      occurredAtTick: EVENT_TICK,
    })).not.toBeNull();

    const unsafeAfter = createWorldPosition(
      REGION,
      10_001 + MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS,
      5_000,
    );
    expect(animalContactAcousticTriggerEventId({
      sourceId: "A-v1-unsafe-dog",
      beforePosition: boundedBefore,
      afterPosition: unsafeAfter,
      occurredAtTick: EVENT_TICK,
    })).toBeNull();
    const unsafeTrigger = `animal-contact:${EVENT_TICK}:${hashCanonical({
      actorId: "A-v1-unsafe-dog",
      from: boundedBefore,
      to: unsafeAfter,
    })}`;
    const unsafeEvent = animalContactAcousticEvent({
      triggerEventId: unsafeTrigger,
      sourceId: "A-v1-unsafe-dog",
      sourcePosition: unsafeAfter,
      occurredAtTick: EVENT_TICK,
      bodySize: "medium",
      movement: "fast",
      surfaceMaterial: "soil",
    });
    expect(unsafeEvent).not.toBeNull();
    expect(createAnimalContactAcousticCarryRecord({
      beforePosition: boundedBefore,
      event: unsafeEvent!,
    })).toBeNull();
  });

  it("appends in deterministic tick/source/event order and deeply freezes the carry", () => {
    const alpha = contactRecord({ sourceId: "A-v1-dog-alpha" });
    const beta = contactRecord({ sourceId: "A-v1-dog-beta" });
    const empty = createAnimalContactAcousticCarry();
    const first = appendAnimalContactAcousticCarryRecord(empty, alpha);
    const complete = appendAnimalContactAcousticCarryRecord(first, beta);

    expect(empty).toEqual({ version: 1, records: [] });
    expect(complete?.records.map(({ event }) => event.sourceId)).toEqual([
      "A-v1-dog-alpha",
      "A-v1-dog-beta",
    ]);
    expect(Object.isFrozen(empty)).toBe(true);
    expect(Object.isFrozen(empty.records)).toBe(true);
    expect(Object.isFrozen(complete)).toBe(true);
    expect(Object.isFrozen(complete?.records)).toBe(true);
    expect(appendAnimalContactAcousticCarryRecord(first, alpha)).toBeNull();
    expect(appendAnimalContactAcousticCarryRecord(first, contactRecord({
      sourceId: alpha.event.sourceId,
      before: createWorldPosition(REGION, 19_900, 18_000),
      surface: "water",
    }))).toBeNull();
    expect(appendAnimalContactAcousticCarryRecord(first, contactRecord({
      sourceId: "A-v1-dog-aardvark",
    }))).toBeNull();
    expect(appendAnimalContactAcousticCarryRecord(first, contactRecord({
      sourceId: "A-v1-dog-gamma",
      tick: EVENT_TICK + 1,
    }))).toBeNull();
  });

  it("rejects duplicate, reordered, sparse, mixed-tick, and over-capacity carries", () => {
    const records = Array.from(
      { length: ANIMAL_CONTACT_ACOUSTIC_CARRY_MAX_RECORDS },
      (_, index) => contactRecord({ sourceId: `A-v1-dog-${index.toString().padStart(2, "0")}` }),
    );
    const valid = canonicalizeAnimalContactAcousticCarry({ version: 1, records });
    expect(valid?.records).toHaveLength(ANIMAL_CONTACT_ACOUSTIC_CARRY_MAX_RECORDS);
    expect(canonicalizeAnimalContactAcousticCarry({
      version: 1,
      records: [records[1], records[0]],
    })).toBeNull();
    expect(canonicalizeAnimalContactAcousticCarry({
      version: 1,
      records: [records[0], records[0]],
    })).toBeNull();
    expect(canonicalizeAnimalContactAcousticCarry({
      version: 1,
      records: [records[0], contactRecord({
        sourceId: records[0]!.event.sourceId,
        before: createWorldPosition(REGION, 19_900, 18_000),
        surface: "water",
      })],
    })).toBeNull();
    expect(canonicalizeAnimalContactAcousticCarry({
      version: 1,
      records: [records[0], contactRecord({
        sourceId: "A-v1-dog-later",
        tick: EVENT_TICK + 1,
      })],
    })).toBeNull();
    const sparse = new Array(1) as unknown[];
    expect(canonicalizeAnimalContactAcousticCarry({
      version: 1,
      records: sparse,
    })).toBeNull();
    expect(canonicalizeAnimalContactAcousticCarry({
      version: 1,
      records: [...records, contactRecord({ sourceId: "A-v1-dog-over-cap" })],
    })).toBeNull();
    expect(appendAnimalContactAcousticCarryRecord(
      valid,
      contactRecord({ sourceId: "A-v1-dog-over-cap" }),
    )).toBeNull();
  });

  it("projects a stable, ordered, immutable physical-sound batch", () => {
    const alpha = contactRecord({ sourceId: "A-v1-dog-alpha", surface: "water" });
    const beta = contactRecord({ sourceId: "A-v1-dog-beta", surface: "foliage" });
    const carry = canonicalizeAnimalContactAcousticCarry({
      version: 1,
      records: [alpha, beta],
    });
    const first = physicalSoundSamplesForAnimalContactCarry(carry);
    const replay = physicalSoundSamplesForAnimalContactCarry(carry);

    expect(first).toEqual(replay);
    expect(first?.map(({ sourceActorId }) => sourceActorId)).toEqual([
      "A-v1-dog-alpha",
      "A-v1-dog-beta",
    ]);
    expect(first?.map(({ acousticEventId }) => acousticEventId)).toEqual([
      alpha.event.eventId,
      beta.event.eventId,
    ]);
    expect(new Set(first?.map(({ id }) => id)).size).toBe(2);
    expect(Object.isFrozen(first)).toBe(true);
    expect(physicalSoundSamplesForAnimalContactCarry({
      version: 1,
      records: [beta, alpha],
    })).toBeNull();
  });
});
