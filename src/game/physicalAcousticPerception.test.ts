import { describe, expect, it } from "vitest";

import { MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS } from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT } from "../sim/types";
import {
  PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS,
  createPhysicalSoundSample,
  evaluatePhysicalAcousticListener,
} from "./physicalAcousticPerception";
import { createWorldPosition } from "./worldPosition";

type PhysicalSoundSample = NonNullable<ReturnType<typeof createPhysicalSoundSample>>;
type PhysicalSoundSampleInput = Parameters<typeof createPhysicalSoundSample>[0];
type PhysicalAcousticListenerInput = Parameters<typeof evaluatePhysicalAcousticListener>[0];

const REGION = createRegionCoord(3, -2);
const OBSERVER_ID = "A-v1-dog-listener";
const SOURCE_ID = "A-v1-dog-source";
const OBSERVED_AT_TICK = 812;
const OBSERVER_POSITION = createWorldPosition(REGION, 24_000, 18_000);
const SOURCE_POSITION = createWorldPosition(REGION, 30_000, 18_000);

const SAMPLE_INPUT = Object.freeze({
  acousticEventId: "acoustic:animal-contact:test:dog-rustle",
  id: "dog-rustle",
  position: SOURCE_POSITION,
  soundClass: "physical-rustle",
  soundInterrupt: "none",
  soundLoudness: FIXED_POINT,
  soundRangeUnits: 12_000,
  sourceId: SOURCE_ID,
} as const satisfies PhysicalSoundSampleInput);

function physicalSample(
  overrides: Partial<PhysicalSoundSampleInput> = {},
): PhysicalSoundSample {
  const sample = createPhysicalSoundSample({ ...SAMPLE_INPUT, ...overrides });
  if (sample === null) throw new Error("Expected a valid physical sound fixture");
  return sample;
}

function listenerInput(
  overrides: Partial<PhysicalAcousticListenerInput> = {},
): PhysicalAcousticListenerInput {
  return {
    observationId: "physical-hearing:test:812",
    observerId: OBSERVER_ID,
    observerPosition: OBSERVER_POSITION,
    observedAtTick: OBSERVED_AT_TICK,
    sample: physicalSample(),
    effectiveRangeUnits: 12_000,
    ambientNoise: 0,
    wind: { x: 0, y: 0 },
    ...overrides,
  };
}

describe("shared physical-acoustic listener evaluation", () => {
  it("reuses an already authenticated sample across bounded listener fan-out", () => {
    const sample = physicalSample();

    expect(createPhysicalSoundSample(sample)).toBe(sample);
  });

  it("creates an anonymous heard fact with an uncertain non-exact area", () => {
    const result = evaluatePhysicalAcousticListener(listenerInput());

    expect(result).toMatchObject({
      kind: "heard",
      contact: {
        bearing: {
          centerRadians: expect.any(Number),
          uncertaintyRadians: expect.any(Number),
        },
        distanceBand: {
          minimum: expect.any(Number),
          maximum: expect.any(Number),
        },
        certainty: expect.any(Number),
      },
      observation: {
        id: "physical-hearing:test:812",
        observerId: OBSERVER_ID,
        observedAtTick: OBSERVED_AT_TICK,
        channel: "hearing",
        perceivedClass: "physical-rustle",
        subjectId: null,
        identification: "anonymous",
        interrupt: "none",
      },
    });
    if (result === null || result.kind !== "heard") {
      throw new Error("Expected the physical contact to be heard");
    }

    expect(Object.keys(result.contact)).toEqual(["bearing", "distanceBand", "certainty"]);
    expect(result.contact.bearing.uncertaintyRadians).toBeGreaterThan(0);
    expect(result.contact.distanceBand.minimum).toBeLessThan(6_000);
    expect(result.contact.distanceBand.maximum).toBeGreaterThan(6_000);
    expect(result.contact).not.toHaveProperty("source");
    expect(result.contact).not.toHaveProperty("identity");
    expect(result.contact).not.toHaveProperty("exactDistance");
    expect(result.observation.area.radiusUnits).toBeGreaterThanOrEqual(
      MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
    );
    expect(result.observation.area.center).not.toEqual(SOURCE_POSITION);
    expect(result.observation).not.toHaveProperty("sourceActorId");
    expect(result.observation).not.toHaveProperty("acousticEventId");
  });

  it("treats the authenticated source actor as valid but not heard", () => {
    expect(evaluatePhysicalAcousticListener(listenerInput({
      observerId: SOURCE_ID,
      observerPosition: SOURCE_POSITION,
    }))).toEqual({ kind: "not-heard" });
  });

  it("applies listener range, environmental masking, and directional wind", () => {
    expect(evaluatePhysicalAcousticListener(listenerInput({
      effectiveRangeUnits: 6_000,
    }))?.kind).toBe("heard");
    expect(evaluatePhysicalAcousticListener(listenerInput({
      effectiveRangeUnits: 5_999,
    }))).toEqual({ kind: "not-heard" });
    expect(evaluatePhysicalAcousticListener(listenerInput({
      ambientNoise: 1,
    }))).toEqual({ kind: "not-heard" });
    expect(evaluatePhysicalAcousticListener(listenerInput({
      effectiveRangeUnits: 0,
    }))).toEqual({ kind: "not-heard" });

    const distantSource = createWorldPosition(REGION, 33_000, 18_000);
    const distant = listenerInput({
      sample: physicalSample({
        position: distantSource,
        soundRangeUnits: 8_000,
      }),
      effectiveRangeUnits: 8_000,
    });
    expect(evaluatePhysicalAcousticListener(distant)).toEqual({ kind: "not-heard" });
    expect(evaluatePhysicalAcousticListener({
      ...distant,
      wind: { x: -1, y: 0 },
    })?.kind).toBe("heard");
    expect(evaluatePhysicalAcousticListener({
      ...distant,
      wind: { x: 1, y: 0 },
    })).toEqual({ kind: "not-heard" });
  });

  it("returns exactly the same contact and observation for identical input", () => {
    const input = listenerInput({
      ambientNoise: 0.2,
      wind: { x: 0, y: -0.6 },
    });
    const first = evaluatePhysicalAcousticListener(input);

    expect(first?.kind).toBe("heard");
    for (let iteration = 0; iteration < 20; iteration += 1) {
      expect(evaluatePhysicalAcousticListener(input)).toEqual(first);
    }
  });

  it("accepts a structured animal-call without exposing its source identity", () => {
    const result = evaluatePhysicalAcousticListener(listenerInput({
      sample: physicalSample({ soundClass: "animal-call" }),
    }));

    expect(result).toMatchObject({
      kind: "heard",
      observation: {
        perceivedClass: "animal-call",
        subjectId: null,
        identification: "anonymous",
      },
    });
    if (result?.kind !== "heard") throw new Error("Expected the animal call to be heard");
    expect(result.observation).not.toHaveProperty("sourceId");
    expect(result.observation).not.toHaveProperty("acousticEventId");
  });

  it("fails malformed samples and listener inputs closed", () => {
    expect(createPhysicalSoundSample({
      ...SAMPLE_INPUT,
      soundRangeUnits: PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS,
    })).not.toBeNull();

    const { acousticEventId: _missingEventId, ...missingEventId } = SAMPLE_INPUT;
    const malformedSamples: readonly unknown[] = [
      missingEventId,
      { ...SAMPLE_INPUT, soundClass: "animal-contact" },
      { ...SAMPLE_INPUT, soundLoudness: Number.NaN },
      { ...SAMPLE_INPUT, soundRangeUnits: PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS + 1 },
      { ...SAMPLE_INPUT, sourceId: "invalid source id" },
      { ...SAMPLE_INPUT, unexpected: true },
    ];
    for (const malformed of malformedSamples) {
      expect(createPhysicalSoundSample(
        malformed as PhysicalSoundSampleInput,
      )).toBeNull();
    }

    const valid = listenerInput();
    const malformedInputs: readonly unknown[] = [
      null,
      { ...valid, observationId: "invalid observation id" },
      { ...valid, observerId: "invalid observer id" },
      { ...valid, observerPosition: { ...OBSERVER_POSITION, localX: -1 } },
      { ...valid, observedAtTick: -1 },
      { ...valid, sample: { ...valid.sample, soundLoudness: Number.NaN } },
      { ...valid, effectiveRangeUnits: -1 },
      { ...valid, effectiveRangeUnits: PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS + 1 },
      { ...valid, ambientNoise: -0.01 },
      { ...valid, ambientNoise: 1.01 },
      { ...valid, wind: { x: Number.NaN, y: 0 } },
      { ...valid, wind: { x: 1.01, y: 0 } },
      { ...valid, unexpected: true },
    ];
    for (const malformed of malformedInputs) {
      expect(evaluatePhysicalAcousticListener(
        malformed as PhysicalAcousticListenerInput,
      )).toBeNull();
    }
  });
});
