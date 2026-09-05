import { describe, expect, it } from "vitest";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  appendDogActorMemory,
  deserializeDogActorState,
  learnDogPlayerKnowledge,
  replaceDogActorPhysiology,
  serializeDogActorState,
  setDogActorIntent,
  type DogActorState,
} from "./dogActor";
import { createDogActorState } from "./dogActor";
import {
  DOG_ABOUT_MAX_DISTANCE_UNITS,
  projectDogAbout,
  projectDogQuickInspect,
} from "./dogAbout";
import { evaluatePerception, type PerceptionCell } from "./perception";
import { createWorldPosition } from "./worldPosition";

function dog() {
  return createDogActorState({
    seed: [17, 29, 41, 53],
    originRegion: createRegionCoord(-4, 9),
    originNamespace: "regional",
    habitatClass: "settlement-edge",
    habitatKey: "grayhaven-edge",
    populationKey: "dogs-west",
    populationOrdinal: 2,
    position: createWorldPosition(createRegionCoord(-4, 9), 24_000, 35_000),
    tick: 10,
  });
}

function observed(
  actor: DogActorState,
  distanceTiles = 22,
  observerFacingRadians = 0,
) {
  const actorGlobalX = actor.address.position.region.x * WORLD_WIDTH
    + Math.floor(actor.address.position.localX / 1_000);
  const actorGlobalY = actor.address.position.region.y * WORLD_HEIGHT
    + Math.floor(actor.address.position.localY / 1_000);
  const width = Math.max(96, distanceTiles + 2);
  const cells: PerceptionCell[] = Array.from(
    { length: width },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  const window = {
    origin: { x: actorGlobalX - distanceTiles, y: actorGlobalY },
    terrain: { width, height: 1 },
  } as const;
  return Object.freeze({
    window,
    perception: evaluatePerception({
      columns: width,
      rows: 1,
      cells,
      playerTileIndex: 0,
      facingRadians: observerFacingRadians,
      weatherVisibility: 1,
      rangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 128,
        forwardConeRadians: Math.PI / 2,
      },
      detailRangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 128,
        forwardConeRadians: Math.PI / 2,
      },
    }),
  });
}

function identityEvidence(actor: DogActorState, eventId: string, atTick: number) {
  return appendDogActorMemory(actor, {
    eventId,
    kind: "identity-learning",
    subjectId: null,
    atTick,
    salience: 700_000,
    location: actor.address.position,
  });
}

function rememberedPorterMeal(actor: DogActorState, eventId: string, atTick: number) {
  let remembered = appendDogActorMemory(actor, {
    eventId,
    kind: "human-interaction",
    subjectId: "H-v1-porter/meal",
    atTick,
    salience: 900_000,
    location: actor.address.position,
  });
  remembered = appendDogActorMemory(remembered, {
    eventId: `${eventId}:food`,
    kind: "food",
    subjectId: null,
    atTick,
    salience: 900_000,
    location: actor.address.position,
  });
  for (const fact of [
    {
      fact: "recognizable-individual" as const,
      evidenceId: eventId,
      confidence: 1_000_000,
    },
    {
      fact: "human-familiarity" as const,
      evidenceId: `${eventId}:food`,
      confidence: 900_000,
    },
    {
      fact: "significant-history" as const,
      evidenceId: eventId,
      confidence: 900_000,
    },
  ]) {
    remembered = learnDogPlayerKnowledge(remembered, {
      ...fact,
      source: "interaction",
      learnedAtTick: atTick,
    });
  }
  return remembered;
}

describe("dog ABOUT projection", () => {
  it("returns no remote or unobserved ABOUT surface", () => {
    const actor = dog();
    expect(projectDogAbout(actor, observed(actor, 22, Math.PI))).toBeNull();
    expect(projectDogAbout(actor, observed(actor, 97))).toBeNull();
    expect(DOG_ABOUT_MAX_DISTANCE_UNITS).toBe(96_000);
  });

  it("shows only current observable qualities without hidden numeric state", () => {
    const actor = replaceDogActorPhysiology(dog(), {
      atTick: 11,
      needs: dog().needs,
      humanFamiliarity: dog().humanFamiliarity,
      condition: {
        ...dog().condition,
        wetness: 700_000,
        coldStress: 350_000,
      },
    });
    const about = projectDogAbout(actor, observed(actor));
    expect(about?.heading).toBe("UNKNOWN DOG");
    expect(about?.observed).toEqual(expect.arrayContaining([
      { label: "Species", value: "Dog" },
      { label: "Condition", value: expect.stringContaining("Soaked") },
    ]));
    const encoded = JSON.stringify(about);
    expect(encoded).not.toContain("700000");
    expect(encoded).not.toContain("350000");
    expect(encoded).not.toContain("confidence");
    expect(encoded).not.toContain("stableId");
    expect(encoded).not.toContain("hunger");
    expect(encoded).not.toContain("owner");
    expect(encoded).not.toContain("trust");
  });

  it("does not reveal a distinguishing mark through poor visual contact", () => {
    const actor = dog();
    const poor = projectDogAbout(actor, observed(actor, 70));
    expect(poor?.observed.some(({ label }) => label === "Mark")).toBe(false);
    expect(poor?.observed.some(({ label }) => label === "Coat")).toBe(false);
  });

  it("adds learned temperament and familiarity only behind recorded facts", () => {
    let actor = dog();
    expect(projectDogAbout(actor, observed(actor))?.known).toEqual([]);
    actor = identityEvidence(actor, "event:calm-approach", 11);
    actor = learnDogPlayerKnowledge(actor, {
      fact: "temperament",
      source: "interaction",
      evidenceId: "event:calm-approach",
      learnedAtTick: 11,
      confidence: 780_000,
    });
    actor = identityEvidence(actor, "event:kept-distance", 12);
    actor = learnDogPlayerKnowledge(actor, {
      fact: "human-familiarity",
      source: "interaction",
      evidenceId: "event:kept-distance",
      learnedAtTick: 12,
      confidence: 760_000,
    });
    const about = projectDogAbout(actor, observed(actor));
    expect(about?.known.map(({ label }) => label)).toEqual([
      "Around people",
      "Temperament",
    ]);
  });

  it("projects behavior from the committed intent without naming a hidden target", () => {
    const actor = setDogActorIntent(dog(), {
      kind: "approach-food",
      cause: { kind: "perception", referenceId: "class:scent:provision-food" },
      enteredAtTick: 11,
      nextThinkTick: 14,
    });
    const about = projectDogAbout(actor, observed(actor));
    expect(about?.observed).toContainEqual({
      label: "Behavior",
      value: "Following a food scent",
    });
    expect(JSON.stringify(about)).not.toContain("class:scent");
  });

  it("keeps quick inspection compact and immutable", () => {
    const actor = dog();
    const quick = projectDogQuickInspect(actor, observed(actor));
    expect(quick).toMatchObject({ heading: "UNKNOWN DOG" });
    expect(quick?.distanceUnits).toBeGreaterThan(20_000);
    expect(quick?.distanceUnits).toBeLessThan(22_000);
    expect(Object.isFrozen(quick)).toBe(true);
    expect(Object.isFrozen(projectDogAbout(actor, observed(actor))?.observed)).toBe(true);
  });

  it("shows one causally readable meal memory after reload without inventing a name", () => {
    const eventId = "bio0:event:11";
    const remembered = rememberedPorterMeal(dog(), eventId, 11);
    const restored = deserializeDogActorState(serializeDogActorState(remembered));
    expect(restored?.identity.stableId).toBe(remembered.identity.stableId);
    const about = projectDogAbout(restored, observed(remembered));
    const quick = projectDogQuickInspect(restored, observed(remembered));
    expect(about).toMatchObject({
      actorId: remembered.identity.stableId,
      heading: "FAMILIAR DOG",
      knowledge: "Known individual",
    });
    expect(quick?.heading).toBe("FAMILIAR DOG");
    expect(about?.known).toContainEqual({
      label: "Known history",
      value: "Accepted food from a porter",
    });
    expect(JSON.stringify(about)).not.toContain("H-v1-porter/meal");
    expect(remembered.memories).toHaveLength(2);

    const replay = rememberedPorterMeal(remembered, eventId, 11);
    expect(replay).toEqual(remembered);
    expect(projectDogAbout(replay, observed(replay))?.known).toEqual(about?.known);
  });

  it("does not expose meal history or familiarity from sight alone", () => {
    const actor = dog();
    const about = projectDogAbout(actor, observed(actor));
    expect(about?.heading).toBe("UNKNOWN DOG");
    expect(about?.known).toEqual([]);
  });

  it("fails closed on aliases, fractions, negative zero, and extra fields", () => {
    const actor = dog();
    const sight = observed(actor);
    expect(projectDogAbout(actor, { ...sight, exactHealth: 1 })).toBeNull();
    expect(projectDogAbout(actor, {
      ...sight,
      window: { ...sight.window, origin: { ...sight.window.origin, x: -0 } },
    })).toBeNull();
    expect(projectDogAbout(actor, {
      ...sight,
      perception: { ...sight.perception, signature: "perception-v2:forged" },
    })).toBeNull();
  });
});
