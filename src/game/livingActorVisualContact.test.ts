import { describe, expect, it } from "vitest";

import {
  createActorPerceptionState,
  queryActorAttention,
  stepActorPerception,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { createLivingActorAddress, type LivingActorAddress } from "./livingActor";
import {
  LIVING_ACTOR_VISUAL_CONTACT_VERSION,
  collectLivingActorVisualContactObservations,
  type LivingActorVisualContactEvidence,
  type LivingActorVisualContactFrame,
} from "./livingActorVisualContact";
import { createWorldPosition } from "./worldPosition";

const HUMAN_ID = "H-contact-observer";
const DOG_ID = "D-contact-subject";

function actor(
  actorId: string,
  species: "human" | "domestic-dog",
  x: number,
): LivingActorAddress {
  return createLivingActorAddress({
    actorId,
    species,
    position: createWorldPosition(createRegionCoord(-12, 31), x, 24_000),
    persistence: species === "human" ? "promoted" : "regional",
  });
}

function contact(
  subject: LivingActorAddress,
  overrides: Partial<LivingActorVisualContactEvidence> = {},
): LivingActorVisualContactEvidence {
  return {
    version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
    evidenceId: `evidence:${subject.actorId}`,
    perceivedClass: subject.species,
    subject,
    lineOfSight: "clear",
    confidence: 880_000,
    salience: 760_000,
    identityEligible: true,
    ...overrides,
  };
}

function frame(
  observer: LivingActorAddress,
  contacts: readonly LivingActorVisualContactEvidence[],
  tick = 9,
): LivingActorVisualContactFrame {
  return {
    version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
    observer,
    tick,
    contacts,
  };
}

describe("species-neutral living-actor visual contact adapter", () => {
  it("lets a human acquire an identified domestic-dog belief only from explicit clear evidence", () => {
    const human = actor(HUMAN_ID, "human", 20_000);
    const dog = actor(DOG_ID, "domestic-dog", 23_000);
    const observations = collectLivingActorVisualContactObservations(frame(human, [contact(dog)]));
    expect(observations).toHaveLength(1);
    expect(observations?.[0]).toMatchObject({
      observerId: HUMAN_ID,
      channel: "vision",
      perceivedClass: "domestic-dog",
      subjectId: DOG_ID,
      identification: "identified",
      area: { center: dog.position, radiusUnits: 0 },
    });

    const perception = stepActorPerception(createActorPerceptionState(HUMAN_ID), {
      tick: 9,
      observations: observations ?? [],
    });
    expect(perception).not.toBeNull();
    expect(queryActorAttention(perception)[0]).toMatchObject({
      perceivedClass: "domestic-dog",
      subjectId: DOG_ID,
      identification: "identified",
    });
  });

  it("keeps partial sightings classified and blocked contacts out of cognition", () => {
    const human = actor(HUMAN_ID, "human", 20_000);
    const dog = actor(DOG_ID, "domestic-dog", 23_000);
    const partial = collectLivingActorVisualContactObservations(frame(human, [contact(dog, {
      evidenceId: "partial-dog",
      perceivedClass: "animal-silhouette",
      lineOfSight: "partial",
      confidence: 330_000,
      salience: 410_000,
      identityEligible: false,
    })]));
    expect(partial?.[0]).toMatchObject({
      perceivedClass: "animal-silhouette",
      subjectId: null,
      identification: "classified",
    });

    expect(collectLivingActorVisualContactObservations(frame(human, [contact(dog, {
      evidenceId: "blocked-dog",
      lineOfSight: "blocked",
      confidence: 0,
      salience: 0,
      identityEligible: false,
    })]))).toEqual([]);
  });

  it("uses the same adapter when a dog observes a human", () => {
    const human = actor(HUMAN_ID, "human", 20_000);
    const dog = actor(DOG_ID, "domestic-dog", 23_000);
    expect(collectLivingActorVisualContactObservations(frame(dog, [contact(human)]))?.[0])
      .toMatchObject({ observerId: DOG_ID, subjectId: HUMAN_ID, perceivedClass: "human" });
  });

  it("is canonically ordered and deterministic independent of supplied contact order", () => {
    const human = actor(HUMAN_ID, "human", 20_000);
    const firstDog = actor("D-first-contact", "domestic-dog", 22_000);
    const secondDog = actor("D-second-contact", "domestic-dog", 24_000);
    const first = collectLivingActorVisualContactObservations(frame(human, [
      contact(secondDog),
      contact(firstDog),
    ]));
    const second = collectLivingActorVisualContactObservations(frame(human, [
      contact(firstDog),
      contact(secondDog),
    ]));
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("rejects aliases, duplicate subjects, and identity claims without clear LOS", () => {
    const human = actor(HUMAN_ID, "human", 20_000);
    const dog = actor(DOG_ID, "domestic-dog", 23_000);
    expect(collectLivingActorVisualContactObservations({
      ...frame(human, [contact(dog)]),
      debugVisible: true,
    })).toBeNull();
    expect(collectLivingActorVisualContactObservations(frame(human, [
      contact(dog),
      contact(dog, { evidenceId: "same-dog-again" }),
    ]))).toBeNull();
    expect(collectLivingActorVisualContactObservations(frame(human, [contact(dog, {
      lineOfSight: "partial",
      identityEligible: true,
    })]))).toBeNull();
    expect(collectLivingActorVisualContactObservations(frame(human, [contact(dog, {
      lineOfSight: "blocked",
      confidence: 500_000,
      salience: 0,
      identityEligible: false,
    })]))).toBeNull();
  });
});
