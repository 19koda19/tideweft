import { describe, expect, it } from "vitest";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  appendDogActorMemory,
  createDogActorState,
  learnDogPlayerKnowledge,
  replaceDogActorPhysiology,
} from "./dogActor";
import type { VisibilityGrade } from "./perception";
import { projectDogPresentation } from "./dogPresentation";
import { createWorldPosition } from "./worldPosition";

function dog() {
  const region = createRegionCoord(-2_147_000_000, 2_147_000_000);
  return createDogActorState({
    seed: [101, 202, 303, 404],
    originRegion: region,
    originNamespace: "regional",
    habitatClass: "settlement-edge",
    habitatKey: "presentation-edge",
    populationKey: "presentation-dogs",
    populationOrdinal: 7,
    position: createWorldPosition(region, 2_500, 3_500),
    heading: 250_000,
    tick: 4,
  });
}

function input(actor: unknown = dog()) {
  return {
    actor,
    window: {
      origin: {
        x: -2_147_000_000 * WORLD_WIDTH,
        y: 2_147_000_000 * WORLD_HEIGHT,
      },
      terrain: { width: 8, height: 8 },
    },
    tileSize: 24,
    detailVisibilityGrades: Array.from({ length: 64 }, () => 2 as VisibilityGrade),
  };
}

describe("dog presentation", () => {
  it("projects exact segmented placement at an extreme signed region", () => {
    const actor = dog();
    const view = projectDogPresentation(input(actor));
    expect(view).toMatchObject({
      actorId: actor.identity.stableId,
      quickLabel: "Unknown dog",
      position: { x: 60, y: 84 },
      facing: Math.PI / 2,
      behavior: actor.intent.kind,
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view?.coat)).toBe(true);
  });

  it("accepts the authoritative packed detail-perception buffer", () => {
    const packed = new Uint8Array(64);
    packed.fill(2);
    expect(projectDogPresentation({
      ...input(),
      detailVisibilityGrades: packed,
    })?.actorId).toBe(dog().identity.stableId);
  });

  it("labels the same learned individual as familiar without inventing a name", () => {
    const actor = dog();
    const evidenceId = "event:recognized-dog";
    const remembered = appendDogActorMemory(actor, {
      eventId: evidenceId,
      kind: "identity-learning",
      subjectId: null,
      atTick: 5,
      salience: 700_000,
      location: actor.address.position,
    });
    const recognized = learnDogPlayerKnowledge(remembered, {
      fact: "recognizable-individual",
      source: "direct-observation",
      evidenceId,
      learnedAtTick: 5,
      confidence: 900_000,
    });
    const view = projectDogPresentation(input(recognized));
    expect(view?.quickLabel).toBe("Familiar dog");
    expect(JSON.stringify(view)).not.toContain("event:recognized-dog");
    expect(view).not.toHaveProperty("name");
    expect(view).not.toHaveProperty("owner");
  });

  it("requires direct detail perception and never leaks a peripheral actor", () => {
    const actor = dog();
    const hidden = input(actor);
    const tileIndex = 3 * 8 + 2;
    hidden.detailVisibilityGrades[tileIndex] = 1;
    expect(projectDogPresentation(hidden)).toBeNull();
    hidden.detailVisibilityGrades[tileIndex] = 0;
    expect(projectDogPresentation(hidden)).toBeNull();
  });

  it("exposes qualitative physical condition without needs or hidden relationship state", () => {
    const actor = dog();
    const weathered = replaceDogActorPhysiology(actor, {
      atTick: 5,
      needs: actor.needs,
      humanFamiliarity: actor.humanFamiliarity,
      condition: {
        ...actor.condition,
        wetness: 700_000,
        coldStress: 300_000,
        exhaustion: 400_000,
      },
    });
    const encoded = JSON.stringify(projectDogPresentation(input(weathered)));
    expect(encoded).toContain("SOAKED");
    expect(encoded).toContain("COLD");
    expect(encoded).toContain("TIRED");
    expect(encoded).not.toContain("hunger");
    expect(encoded).not.toContain("familiarity");
    expect(encoded).not.toContain("temperament");
    expect(encoded).not.toContain("memory");
  });

  it("fails malformed windows, grades, aliases, and invalid actors closed", () => {
    expect(projectDogPresentation({ ...input(), secret: true } as never)).toBeNull();
    expect(projectDogPresentation({ ...input(), tileSize: 0 })).toBeNull();
    expect(projectDogPresentation({ ...input(), detailVisibilityGrades: [2] })).toBeNull();
    expect(projectDogPresentation({ ...input(), actor: {} })).toBeNull();
    expect(projectDogPresentation({
      ...input(),
      window: { origin: { x: -0, y: 0 }, terrain: { width: 8, height: 8 } },
    })).toBeNull();
  });
});
