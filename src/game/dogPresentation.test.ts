import { describe, expect, it } from "vitest";
import {
  createActorObservation,
  stepActorPerception,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  appendDogActorMemory,
  createDogActorState,
  learnDogPlayerKnowledge,
  replaceDogActorPerception,
  replaceDogActorPhysiology,
} from "./dogActor";
import type { VisibilityGrade } from "./perception";
import { projectDogPresentation } from "./dogPresentation";
import {
  createSettlementWorkingAnimalState,
  resolveSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalActivity,
} from "./settlementWorkingAnimals";
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

function investigatingWork(actor: ReturnType<typeof dog>) {
  const initial = createSettlementWorkingAnimalState({
    settlementId: 1,
    assignments: [{
      assignmentOrdinal: 0,
      workerActorId: actor.identity.stableId,
      workerSpecies: "domestic-dog",
      handlerActorId: "H-test-presentation-keeper",
      workerCustodyRelationshipId: "DOMESTIC-REL-0000000000000001",
      protectedCustodyRelationshipId: "DOMESTIC-REL-0000000000000002",
      protectedGroupId: "GOAT-HERD-presentation",
      role: "guardian",
      worksiteId: "DOMESTIC-PEN-presentation",
      dutyArea: { center: actor.address.position, radiusUnits: 6_000 },
      createdAtTick: actor.updatedAtTick,
    }],
  });
  const observation = createActorObservation({
    id: "OBS-presentation-alarm",
    observerId: actor.identity.stableId,
    observedAtTick: 5,
    channel: "hearing",
    perceivedClass: "animal-alarm",
    subjectId: null,
    area: { center: actor.address.position, radiusUnits: 500 },
    confidence: 900_000,
    salience: 900_000,
    identification: "anonymous",
    interrupt: "strong",
  });
  if (observation === null) throw new Error("Presentation work observation was malformed");
  const perception = stepActorPerception(actor.perception, {
    tick: 5,
    observations: [observation],
  });
  if (perception === null) throw new Error("Presentation work perception was malformed");
  const staged = stageSettlementWorkingAnimalActivity(initial, {
    assignmentId: initial.assignments[0]!.assignmentId,
    tick: 5,
    perception,
    welfare: {
      injuryPressure: 0,
      coldPressure: 0,
      heatPressure: 0,
      exhaustionPressure: 0,
      hungerPressure: 0,
      thirstPressure: 0,
    },
    accessibility: { watch: true, investigate: true, return: true },
    actorDisposition: { kind: "available" },
    workerInsideDutyArea: true,
  });
  if (staged?.transaction === null || staged?.transaction === undefined) {
    throw new Error("Presentation work activity was not staged");
  }
  const resolved = resolveSettlementWorkingAnimalActivity(staged.state, staged.transaction);
  if (resolved === null) throw new Error("Presentation work activity was not resolved");
  return {
    actor: replaceDogActorPerception(actor, perception),
    state: resolved.state,
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

  it("composes authenticated assigned movement without rewriting autonomous intent", () => {
    const original = dog();
    const work = investigatingWork(original);
    const view = projectDogPresentation({
      ...input(work.actor),
      activity: { state: work.state, atTick: 5 },
    });

    expect(work.actor.intent.kind).toBe(original.intent.kind);
    expect(view?.behavior).toBe("work-investigate");
    expect(projectDogPresentation({
      ...input(work.actor),
      activity: { state: work.state, atTick: 4 },
    })).toBeNull();
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
