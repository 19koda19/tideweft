import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { createWorldAcousticEvent, type WorldAcousticEvent } from "./worldAcoustics";
import { createWorldPosition } from "./worldPosition";
import { createHeardVisibleWorldAcousticReception } from "./worldAcousticPresentation";
import {
  MAX_ACTIVE_WORLD_ACOUSTIC_PRESENTATIONS,
  WORLD_ACOUSTIC_REPETITION_COOLDOWN_STEPS,
  admitWorldAcousticPresentation,
  advanceWorldAcousticPresentations,
  selectWorldAcousticCaptionPresentation,
} from "./worldAcousticPresentationQueue";

const position = createWorldPosition(createRegionCoord(0, 0), 10_000, 10_000);

function event(
  ordinal: number,
  overrides: Partial<Parameters<typeof createWorldAcousticEvent>[0]> = {},
): WorldAcousticEvent {
  const value = createWorldAcousticEvent({
    triggerEventId: `contact:${ordinal}`,
    domain: "object-contact",
    sourceId: `object:${ordinal}`,
    sourceCategory: "object",
    sourcePosition: position,
    occurredAtTick: ordinal,
    action: "collision",
    sourceMaterial: "cargo",
    surfaceMaterial: "wood",
    semanticFamily: "thud",
    intensity: 600_000,
    rangeUnits: 12_000,
    durationSteps: 4,
    priority: 500_000 + ordinal,
    salience: 600_000,
    repetitionKey: `contact:${ordinal}`,
    textualEligibility: "salience-gated",
    accessibilityRelevance: "informative",
    variantSeed: ordinal,
    ...overrides,
  });
  if (value === null) throw new Error("invalid acoustic event fixture");
  return value;
}

describe("world acoustic presentation queue", () => {
  it("suppresses repeated text through a bounded cooldown while retaining independent sounds", () => {
    const first = event(1, { sourceId: "object:shared", repetitionKey: "shared-thud" });
    const independent = event(2);
    const repeated = event(3, { sourceId: "object:shared", repetitionKey: "shared-thud" });
    let queue = admitWorldAcousticPresentation(
      [],
      first,
      createHeardVisibleWorldAcousticReception(first),
    );
    queue = admitWorldAcousticPresentation(
      queue,
      independent,
      createHeardVisibleWorldAcousticReception(independent),
    );
    queue = admitWorldAcousticPresentation(
      queue,
      repeated,
      createHeardVisibleWorldAcousticReception(repeated),
    );

    expect(queue).toHaveLength(2);
    expect(queue.map(({ event: retained }) => retained.eventId)).not.toContain(repeated.eventId);
    expect(queue.map(({ event: retained }) => retained.eventId)).toContain(first.eventId);
    expect(queue.map(({ event: retained }) => retained.eventId)).toContain(independent.eventId);

    for (let step = 0; step < WORLD_ACOUSTIC_REPETITION_COOLDOWN_STEPS; step += 1) {
      queue = advanceWorldAcousticPresentations(queue);
    }
    queue = admitWorldAcousticPresentation(
      queue,
      repeated,
      createHeardVisibleWorldAcousticReception(repeated),
    );
    expect(queue.map(({ event: retained }) => retained.eventId)).toContain(repeated.eventId);
  });

  it("hard-bounds retained work by priority and expires without replay", () => {
    let queue = Object.freeze([]) as ReturnType<typeof admitWorldAcousticPresentation>;
    for (const candidate of Array.from(
      { length: MAX_ACTIVE_WORLD_ACOUSTIC_PRESENTATIONS + 3 },
      (_, index) => event(index + 1),
    )) {
      queue = admitWorldAcousticPresentation(
        queue,
        candidate,
        createHeardVisibleWorldAcousticReception(candidate),
      );
    }
    expect(queue).toHaveLength(MAX_ACTIVE_WORLD_ACOUSTIC_PRESENTATIONS);
    expect(queue[0]?.event.priority).toBeGreaterThan(queue.at(-1)?.event.priority ?? 0);

    for (let step = 0; step < WORLD_ACOUSTIC_REPETITION_COOLDOWN_STEPS; step += 1) {
      queue = advanceWorldAcousticPresentations(queue);
    }
    expect(queue).toEqual([]);
  });

  it("selects the highest-ranked text-eligible cue rather than blindly using queue head", () => {
    const audioOnly = event(10, {
      priority: 900_000,
      textualEligibility: "audio-only",
    });
    const visible = event(11, { priority: 500_000 });
    let queue = admitWorldAcousticPresentation(
      [],
      audioOnly,
      createHeardVisibleWorldAcousticReception(audioOnly),
    );
    queue = admitWorldAcousticPresentation(
      queue,
      visible,
      createHeardVisibleWorldAcousticReception(visible),
    );

    expect(queue[0]?.event.eventId).toBe(audioOnly.eventId);
    expect(selectWorldAcousticCaptionPresentation(queue)?.event.eventId)
      .toBe(visible.eventId);
  });
});
