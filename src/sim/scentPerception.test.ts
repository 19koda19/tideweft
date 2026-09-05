import { describe, expect, it } from "vitest";

import { createWorldPosition, worldPositionDelta } from "../game/worldPosition";
import {
  ACTOR_ATTENTION_CAP,
  ACTOR_BELIEF_CAP,
  ACTOR_PERCEPTION_SCALE,
  MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS,
  PRIOR_ACTOR_PERCEPTION_VERSION,
  canonicalizeActorObservations,
  canonicalizeActorPerceptionState,
  createActorObservation,
  createActorPerceptionState,
  queryActorAttention,
  queryActorSalientMemory,
  serializeActorPerceptionState,
  stepActorPerception,
  type ActorObservation,
  type ActorPerceptionState,
} from "./actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord } from "./regions";
import {
  MAX_SCENT_BASE_RANGE_UNITS,
  createActorScentObservation,
  type ActorScentObservationInput,
} from "./scentPerception";

const OBSERVER_ID = "dog:observer-01";

function position(
  regionX = 0,
  regionY = 0,
  localX = 10_000,
  localY = 10_000,
) {
  return createWorldPosition(createRegionCoord(regionX, regionY), localX, localY);
}

function scentInput(
  overrides: Partial<ActorScentObservationInput> = {},
): ActorScentObservationInput {
  return {
    id: "scent-contact-a",
    observerId: OBSERVER_ID,
    observedAtTick: 1,
    perceivedClass: "food-scent",
    observerPosition: position(),
    sourcePosition: position(0, 0, 14_000, 10_000),
    baseRangeUnits: 10_000,
    sourceStrength: ACTOR_PERCEPTION_SCALE,
    packagingLeakage: 800_000,
    wind: { x: 0, y: 0 },
    rainIntensity: 0,
    interrupt: "none",
    ...overrides,
  };
}

function scent(overrides: Partial<ActorScentObservationInput> = {}): ActorObservation {
  const observation = createActorScentObservation(scentInput(overrides));
  if (observation === null) throw new Error("Test scent contact was not detectable");
  return observation;
}

function advance(
  state: ActorPerceptionState,
  tick: number,
  observations: readonly ActorObservation[] = [],
): ActorPerceptionState {
  const next = stepActorPerception(state, { tick, observations });
  if (next === null) throw new Error("Valid perception step failed");
  return next;
}

describe("shared deterministic scent perception", () => {
  it("admits only classified, identity-free, spatially uncertain scent observations", () => {
    const valid = createActorObservation({
      id: "classified-food-plume",
      observerId: OBSERVER_ID,
      observedAtTick: 1,
      channel: "scent",
      perceivedClass: "food-scent",
      subjectId: null,
      area: {
        center: position(),
        radiusUnits: MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS,
      },
      confidence: 600_000,
      salience: 500_000,
      identification: "classified",
    });

    expect(valid).not.toBeNull();
    expect(createActorObservation({
      ...valid!,
      subjectId: "item:provision-01",
      identification: "identified",
    })).toBeNull();
    expect(createActorObservation({
      ...valid!,
      identification: "anonymous",
    })).toBeNull();
    expect(createActorObservation({
      ...valid!,
      area: { ...valid!.area, radiusUnits: MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS - 1 },
    })).toBeNull();
  });

  it("converts world truth into a classified believed area without source identity or point", () => {
    const input = scentInput();
    const observation = createActorScentObservation(input);

    expect(observation).toMatchObject({
      channel: "scent",
      perceivedClass: "food-scent",
      subjectId: null,
      identification: "classified",
    });
    expect(observation?.area.center).not.toEqual(input.sourcePosition);
    expect(observation?.area.radiusUnits).toBeGreaterThanOrEqual(
      MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS,
    );
    const sourceFromBeliefCenter = worldPositionDelta(
      observation!.area.center,
      input.sourcePosition,
    );
    expect(Math.hypot(sourceFromBeliefCenter.x, sourceFromBeliefCenter.y))
      .toBeLessThanOrEqual(observation!.area.radiusUnits);
    expect("sourcePosition" in observation!).toBe(false);
    expect("sourceStrength" in observation!).toBe(false);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation?.area)).toBe(true);
  });

  it("normalizes source, packaging, rain, wind, and distance into fixed-point contact", () => {
    const near = scent({ sourcePosition: position(0, 0, 12_000, 10_000) });
    const far = scent({ sourcePosition: position(0, 0, 14_000, 10_000) });
    expect(near.confidence).toBeGreaterThan(far.confidence);

    const downwind = scent({ wind: { x: -ACTOR_PERCEPTION_SCALE, y: 0 } });
    const upwind = scent({ wind: { x: ACTOR_PERCEPTION_SCALE, y: 0 } });
    expect(downwind.confidence).toBeGreaterThan(upwind.confidence);

    expect(createActorScentObservation(scentInput({ rainIntensity: ACTOR_PERCEPTION_SCALE })))
      .toBeNull();
    expect(createActorScentObservation(scentInput({ packagingLeakage: 399_000 })))
      .toBeNull();
    expect(createActorScentObservation(scentInput({ packagingLeakage: 400_000 })))
      .not.toBeNull();

    for (const value of [
      near.confidence,
      near.salience,
      downwind.confidence,
      downwind.salience,
      upwind.confidence,
      upwind.salience,
      upwind.area.radiusUnits,
    ]) {
      expect(Number.isSafeInteger(value)).toBe(true);
    }
  });

  it("is deterministic, canonically ordered, bounded, and non-durable", () => {
    const observations = Array.from({ length: 40 }, (_, index) => scent({
      id: `scent-${String(index).padStart(2, "0")}`,
      perceivedClass: index % 2 === 0 ? "food-scent" : "blood-scent",
      packagingLeakage: 850_000 + index * 1_000,
    }));
    const canonical = canonicalizeActorObservations([...observations].reverse());
    const forward = advance(createActorPerceptionState(OBSERVER_ID), 1, observations);
    const reverse = advance(
      createActorPerceptionState(OBSERVER_ID),
      1,
      [...observations].reverse(),
    );

    expect(canonical.map(({ id }) => id)).toEqual(
      observations.map(({ id }) => id).sort(),
    );
    expect(serializeActorPerceptionState(forward)).toBe(serializeActorPerceptionState(reverse));
    expect(forward.beliefs).toHaveLength(ACTOR_BELIEF_CAP);
    expect(queryActorAttention(forward)).toHaveLength(ACTOR_ATTENTION_CAP);
    expect(queryActorSalientMemory(forward)).toEqual([]);

    const later = advance(forward, 2);
    expect(later.search).toBeNull();
    expect(queryActorSalientMemory(later)).toEqual([]);
  });

  it("round-trips a scent belief but rejects attempts to forge identified scent state", () => {
    const state = advance(createActorPerceptionState(OBSERVER_ID), 1, [scent()]);
    expect(canonicalizeActorPerceptionState(structuredClone(state))).toEqual(state);

    const forged = structuredClone(state) as unknown as {
      beliefs: Array<Record<string, unknown>>;
    };
    const belief = forged.beliefs[0];
    if (belief === undefined) throw new Error("fixture lacks scent belief");
    belief.subjectId = "item:provision-01";
    belief.identification = "identified";
    belief.key = "subject:item:provision-01";
    expect(canonicalizeActorPerceptionState(forged)).toBeNull();

    const forgedPriorVersion = {
      ...structuredClone(state),
      version: PRIOR_ACTOR_PERCEPTION_VERSION,
    };
    expect(canonicalizeActorPerceptionState(forgedPriorVersion)).toBeNull();
  });

  it("works across a signed region seam without flattening distant world coordinates", () => {
    const observerPosition = position(REGION_COORD_LIMIT - 1, -37, 95_000, 10_000);
    const sourcePosition = position(REGION_COORD_LIMIT, -37, 1_000, 10_000);
    const observation = scent({ observerPosition, sourcePosition });

    expect(observation.area.center).toEqual(
      position(REGION_COORD_LIMIT, -37, 0, 10_000),
    );
    expect(observation.area.radiusUnits).toBeGreaterThanOrEqual(1_000);
    expect(serializeActorPerceptionState(advance(
      createActorPerceptionState(OBSERVER_ID),
      1,
      [observation],
    ))).toContain(`\"x\":${REGION_COORD_LIMIT}`);
  });

  it("rejects malformed and out-of-range environmental input without partial recovery", () => {
    const valid = scentInput();
    const invalid: unknown[] = [
      { ...valid, sourceStrength: 0.5 },
      { ...valid, sourceStrength: ACTOR_PERCEPTION_SCALE + 1 },
      { ...valid, packagingLeakage: -1 },
      { ...valid, rainIntensity: Number.NaN },
      { ...valid, baseRangeUnits: 0 },
      { ...valid, baseRangeUnits: MAX_SCENT_BASE_RANGE_UNITS + 1 },
      { ...valid, wind: { x: ACTOR_PERCEPTION_SCALE + 1, y: 0 } },
      { ...valid, wind: { x: 0, y: -0 } },
      { ...valid, sourcePosition: { ...valid.sourcePosition, localX: 96_000 } },
      { ...valid, sourcePersistentId: "item:must-not-enter-contact" },
      { ...valid, interrupt: "forever" },
    ];

    for (const input of invalid) {
      expect(createActorScentObservation(input as ActorScentObservationInput)).toBeNull();
    }
    expect(createActorScentObservation({ ...valid, sourceStrength: 0 })).toBeNull();
    expect(createActorScentObservation({ ...valid, packagingLeakage: 0 })).toBeNull();
    expect(createActorScentObservation({
      ...valid,
      sourcePosition: position(10, 10, 10_000, 10_000),
    })).toBeNull();
  });
});
