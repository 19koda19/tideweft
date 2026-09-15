import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_TICKS_PER_DAY } from "../sim/worldTime";
import {
  createDogActorState,
  replaceDogActorCircadian,
  replaceDogActorPerception,
  repositionDogActor,
  setDogActorIntent,
  type DogActorIntent,
  type DogActorState,
} from "./dogActor";
import {
  createLivingCircadianPolicy,
  type LivingCircadianPersistentState,
} from "./livingCircadian";
import {
  SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION,
  SETTLEMENT_DOMESTIC_HOME_STRUCTURE_VERSION,
  type SettlementDomesticAnimalCustodyRecord,
} from "./settlementEcology";
import {
  SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY,
  SETTLEMENT_WORKING_DOG_CIRCADIAN_REST_INTENT_REFERENCE_ID,
  projectSettlementWorkingDogCircadian,
  settlementWorkingDogCircadianRestDestinationId,
  type SettlementWorkingDogCircadianProjection,
} from "./settlementWorkingDogCircadian";
import {
  createSettlementWorkingAnimalAssignment,
  createSettlementWorkingAnimalState,
  resolveSettlementWorkingAnimalActivity,
  resolveSettlementWorkingAnimalTaskLifecycle,
  stageSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalTaskLifecycle,
  type SettlementWorkingAnimalAssignment,
} from "./settlementWorkingAnimals";
import { createWorldPosition } from "./worldPosition";

const NIGHT_TICK = 1_300;
const SLEEP_TICK = NIGHT_TICK + 21;
const SETTLEMENT_ID = 19;
const KEEPER_ID = "H-test-working-dog-keeper";
const KENNEL_DIGEST = "0123456789abcdef";
const PROTECTED_RELATIONSHIP_ID = "DOMESTIC-REL-fedcba9876543210";
const ORIGIN = createRegionCoord(-7, 11);
const KENNEL_POSITION = createWorldPosition(ORIGIN, 21_000, 17_000);
const DUTY_POSITION = createWorldPosition(ORIGIN, 25_000, 17_000);

function dogAt(atTick = NIGHT_TICK, ordinal = 0): DogActorState {
  const created = createDogActorState({
    seed: seedFromText(`working dog circadian fixture ${ordinal}`),
    originRegion: ORIGIN,
    originNamespace: "regional",
    habitatClass: "coastal-lowland",
    habitatKey: "settlement/working-dog",
    populationKey: "settlement/working-dogs",
    populationOrdinal: ordinal,
    position: DUTY_POSITION,
    heading: 0,
    tick: atTick,
  });
  return intentAt(created, "observe", {
    kind: "condition",
    referenceId: "condition:neutral-watch",
  });
}

function intentAt(
  dog: DogActorState,
  kind: DogActorIntent,
  cause: DogActorState["intent"]["cause"],
): DogActorState {
  return setDogActorIntent(dog, {
    kind,
    cause,
    enteredAtTick: dog.updatedAtTick,
    nextThinkTick: dog.updatedAtTick + 5,
  });
}

function custodyFor(
  dog: DogActorState,
  digest = KENNEL_DIGEST,
): SettlementDomesticAnimalCustodyRecord {
  return Object.freeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION,
    custodyOrdinal: 0,
    relationshipId: `DOMESTIC-REL-${digest}`,
    homeId: `DOMESTIC-HOME-${digest}`,
    settlementId: SETTLEMENT_ID,
    owner: Object.freeze({ kind: "settlement" as const, id: SETTLEMENT_ID }),
    caretakerActorId: KEEPER_ID,
    species: "domestic-dog" as const,
    memberActorIds: Object.freeze([dog.identity.stableId]),
    memberGroupId: null,
    homeStructure: Object.freeze({
      version: SETTLEMENT_DOMESTIC_HOME_STRUCTURE_VERSION,
      structureId: `DOMESTIC-KENNEL-${digest}`,
      kind: "kennel" as const,
      position: KENNEL_POSITION,
      radiusUnits: 1_000,
    }),
  });
}

function assignmentFor(
  dog: DogActorState,
  custody: SettlementDomesticAnimalCustodyRecord,
): SettlementWorkingAnimalAssignment {
  return createSettlementWorkingAnimalAssignment(SETTLEMENT_ID, {
    assignmentOrdinal: 0,
    workerActorId: dog.identity.stableId,
    workerSpecies: "domestic-dog",
    handlerActorId: KEEPER_ID,
    workerCustodyRelationshipId: custody.relationshipId,
    protectedCustodyRelationshipId: PROTECTED_RELATIONSHIP_ID,
    protectedGroupId: "GOAT-HERD-test-working-dog",
    role: "guardian",
    worksiteId: "DOMESTIC-PEN-test-working-dog",
    dutyArea: { center: DUTY_POSITION, radiusUnits: 6_000 },
    createdAtTick: 0,
  });
}

function project(
  dog: DogActorState,
  custody = custodyFor(dog),
  assignment = assignmentFor(dog, custody),
  kennelArrived = false,
): SettlementWorkingDogCircadianProjection {
  const projection = projectSettlementWorkingDogCircadian({
    dog,
    custody,
    assignment,
    atTick: dog.updatedAtTick,
    kennelArrived,
  });
  if (projection === null) throw new Error("Working-dog circadian fixture failed");
  return projection;
}

function commitRoutine(
  dog: DogActorState,
  projection: SettlementWorkingDogCircadianProjection,
): DogActorState {
  return replaceDogActorCircadian(dog, {
    atTick: dog.updatedAtTick,
    circadian: projection.receipt,
  });
}

function advanceDog(dog: DogActorState, atTick: number): DogActorState {
  return repositionDogActor(dog, {
    position: dog.address.position,
    heading: dog.address.heading,
    atTick,
  });
}

function sleepingFixture(): Readonly<{
  dog: DogActorState;
  custody: SettlementDomesticAnimalCustodyRecord;
  assignment: SettlementWorkingAnimalAssignment;
}> {
  let dog = dogAt();
  const custody = custodyFor(dog);
  const assignment = assignmentFor(dog, custody);
  dog = commitRoutine(dog, project(dog, custody, assignment, false));
  dog = commitRoutine(dog, project(dog, custody, assignment, true));
  dog = advanceDog(dog, SLEEP_TICK);
  dog = commitRoutine(dog, project(dog, custody, assignment, true));
  return Object.freeze({ dog, custody, assignment });
}

describe("settlement working-dog circadian adapter", () => {
  it("keeps a legacy neutral dog awake while physically traveling to its kennel at night", () => {
    const dog = dogAt();
    const custody = custodyFor(dog);
    const projection = project(dog, custody, assignmentFor(dog, custody), false);

    expect(dog.circadian).toBeUndefined();
    expect(SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY).toMatchObject({
      profileId: "day-active",
      drivers: ["clock"],
    });
    expect(projection).toMatchObject({
      kennelStructureId: custody.homeStructure.structureId,
      kennelArrived: false,
      preferredNeutralIntent: "rest",
      restorative: false,
      actorDisposition: { kind: "defer-to-actor", referenceId: "actor-intent:rest" },
      motion: { kind: "travel-to-kennel", targetArea: {
        center: custody.homeStructure.position,
        radiusUnits: custody.homeStructure.radiusUnits,
      } },
      routine: {
        clockPreference: "rest",
        effectivePreference: "rest",
        posture: { state: "awake", enteredAtTick: NIGHT_TICK },
        action: "travel-to-rest-destination",
      },
    });
  });

  it("settles only after arrival, sleeps after the shared interval, and wakes at dawn", () => {
    let dog = dogAt();
    const custody = custodyFor(dog);
    const assignment = assignmentFor(dog, custody);
    dog = commitRoutine(dog, project(dog, custody, assignment, false));

    const arrived = project(dog, custody, assignment, true);
    expect(arrived).toMatchObject({
      restorative: true,
      motion: { kind: "hold-at-kennel" },
      routine: {
        posture: { state: "resting", enteredAtTick: NIGHT_TICK },
        action: "settle-at-rest-destination",
      },
      receipt: { restDestinationArrived: true },
    });

    dog = commitRoutine(dog, arrived);
    dog = advanceDog(dog, SLEEP_TICK);
    const asleep = project(dog, custody, assignment, true);
    expect(asleep).toMatchObject({
      restorative: true,
      routine: {
        posture: { state: "asleep", enteredAtTick: SLEEP_TICK },
        action: "sleep-at-rest-destination",
        transitionCause: "settled",
      },
    });

    const displaced = project(dog, custody, assignment, false);
    expect(displaced).toMatchObject({
      restorative: false,
      motion: { kind: "travel-to-kennel" },
      routine: {
        posture: { state: "awake", enteredAtTick: SLEEP_TICK },
        transitionCause: "rest-destination-lost",
      },
    });

    dog = commitRoutine(dog, asleep);
    dog = intentAt(dog, "rest", {
      kind: "world-event",
      referenceId: SETTLEMENT_WORKING_DOG_CIRCADIAN_REST_INTENT_REFERENCE_ID,
    });
    dog = advanceDog(dog, WORLD_TICKS_PER_DAY + 500);
    const dawn = project(dog, custody, assignment, true);
    expect(dawn).toMatchObject({
      preferredNeutralIntent: "observe",
      restorative: false,
      actorDisposition: { kind: "available" },
      motion: { kind: "defer-to-actor-or-work" },
      routine: {
        clockPreference: "active",
        posture: { state: "awake", enteredAtTick: WORLD_TICKS_PER_DAY + 500 },
        action: "remain-active",
        transitionCause: "clock",
      },
    });
  });

  it("turns a sufficiently salient current lawful strong interrupt into STARTLED", () => {
    const sleeping = sleepingFixture();
    const atTick = SLEEP_TICK + 1;
    const observation = createActorObservation({
      id: "OBS-working-dog-night-disturbance",
      observerId: sleeping.dog.identity.stableId,
      observedAtTick: atTick,
      channel: "hearing",
      perceivedClass: "danger-sound",
      subjectId: null,
      area: { center: KENNEL_POSITION, radiusUnits: 500 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "anonymous",
      interrupt: "strong",
    });
    if (observation === null) throw new Error("Disturbance observation failed");
    const perception = stepActorPerception(sleeping.dog.perception, {
      tick: atTick,
      observations: [observation],
    });
    if (perception === null) throw new Error("Disturbance perception failed");
    const dog = replaceDogActorPerception(sleeping.dog, perception);
    const startled = project(dog, sleeping.custody, sleeping.assignment, true);

    expect(startled).toMatchObject({
      restorative: false,
      preferredNeutralIntent: null,
      actorDisposition: { kind: "defer-to-actor", referenceId: "actor-intent:observe" },
      motion: { kind: "respond-to-disturbance" },
      routine: {
        posture: { state: "startled", enteredAtTick: atTick },
        action: "respond-to-disturbance",
        transitionCause: "disturbance",
        causeReferenceId: observation.id,
      },
    });
  });

  it("keeps current investigate and return work active through the clock rest window", () => {
    const dog = dogAt();
    const custody = custodyFor(dog);
    const investigating = investigatingAssignment(dog, custody);
    const returning = returningAssignment(dog, custody);

    for (const assignment of [investigating, returning]) {
      const projection = project(dog, custody, assignment, false);
      expect(projection).toMatchObject({
        restorative: false,
        actorDisposition: { kind: "available" },
        motion: { kind: "defer-to-actor-or-work" },
        routine: {
          clockPreference: "rest",
          effectivePreference: "active",
          posture: { state: "awake" },
          action: "remain-active",
          transitionCause: "priority-override",
        },
      });
    }
    expect(investigating.currentTask?.phase).toBe("investigating");
    expect(returning.currentActivity.activity).toBe("return");
  });

  it("preserves dog-owned rest/shelter and active safety, avoidance, and food authority", () => {
    const cases = [
      ["rest", { kind: "need", referenceId: "need:rest" }, "rest"],
      ["seek-shelter", { kind: "condition", referenceId: "condition:weather-exposure" }, "rest"],
      ["retreat", { kind: "perception", referenceId: "belief:threat" }, "active"],
      ["avoid-human", { kind: "perception", referenceId: "belief:human" }, "active"],
      ["approach-food", { kind: "perception", referenceId: "belief:food" }, "active"],
      ["eat", { kind: "contact", referenceId: "contact:food" }, "active"],
    ] as const;

    for (const [intent, cause, preference] of cases) {
      const dog = intentAt(dogAt(), intent, cause);
      const projection = project(dog);
      expect(projection.routine.effectivePreference).toBe(preference);
      expect(projection.actorDisposition).toEqual({
        kind: "defer-to-actor",
        referenceId: `actor-intent:${intent}`,
      });
      expect(projection.routine.posture.state).toBe("awake");
    }
  });

  it("derives a frozen stable destination from both dog and actual kennel identities", () => {
    const dog = dogAt();
    const otherDog = dogAt(NIGHT_TICK, 1);
    const custody = custodyFor(dog);
    const repeated = project(dog, custody, assignmentFor(dog, custody));
    const destination = settlementWorkingDogCircadianRestDestinationId(
      dog.identity.stableId,
      custody.homeStructure.structureId,
    );

    expect(repeated.restDestinationId).toBe(destination);
    expect(project(dog, custody, assignmentFor(dog, custody)).restDestinationId)
      .toBe(destination);
    expect(settlementWorkingDogCircadianRestDestinationId(
      otherDog.identity.stableId,
      custody.homeStructure.structureId,
    )).not.toBe(destination);
    expect(settlementWorkingDogCircadianRestDestinationId(
      dog.identity.stableId,
      "DOMESTIC-KENNEL-fedcba9876543210",
    )).not.toBe(destination);
    expect(Object.isFrozen(repeated)).toBe(true);
    expect(Object.isFrozen(repeated.kennelArea)).toBe(true);
  });

  it("fails closed when a saved receipt names another policy or destination", () => {
    const legacy = dogAt();
    const custody = custodyFor(legacy);
    const assignment = assignmentFor(legacy, custody);
    const lawful = project(legacy, custody, assignment, false).receipt;
    const wrongDestination = withReceipt(legacy, {
      ...lawful,
      restDestinationId: "kennel:another-authenticated-destination",
    });
    expect(projectSettlementWorkingDogCircadian({
      dog: wrongDestination,
      custody,
      assignment,
      atTick: NIGHT_TICK,
      kennelArrived: false,
    })).toBeNull();

    const otherPolicy = createLivingCircadianPolicy({
      profileId: "night-active",
      drivers: ["clock"],
    });
    if (otherPolicy === null) throw new Error("Mismatched policy fixture failed");
    const wrongPolicy = withReceipt(legacy, { ...lawful, policy: otherPolicy });
    expect(projectSettlementWorkingDogCircadian({
      dog: wrongPolicy,
      custody,
      assignment,
      atTick: NIGHT_TICK,
      kennelArrived: false,
    })).toBeNull();
  });
});

function withReceipt(
  dog: DogActorState,
  receipt: LivingCircadianPersistentState,
): DogActorState {
  return replaceDogActorCircadian(dog, {
    atTick: dog.updatedAtTick,
    circadian: receipt,
  });
}

const ZERO_WELFARE = Object.freeze({
  injuryPressure: 0,
  coldPressure: 0,
  heatPressure: 0,
  exhaustionPressure: 0,
  hungerPressure: 0,
  thirstPressure: 0,
});

function currentPerception(actorId: string, atTick: number): ActorPerceptionState {
  return createActorPerceptionState(actorId, atTick);
}

function investigatingAssignment(
  dog: DogActorState,
  custody: SettlementDomesticAnimalCustodyRecord,
): SettlementWorkingAnimalAssignment {
  let state = createSettlementWorkingAnimalState({
    settlementId: SETTLEMENT_ID,
    assignments: [{
      assignmentOrdinal: 0,
      workerActorId: dog.identity.stableId,
      workerSpecies: "domestic-dog",
      handlerActorId: KEEPER_ID,
      workerCustodyRelationshipId: custody.relationshipId,
      protectedCustodyRelationshipId: PROTECTED_RELATIONSHIP_ID,
      protectedGroupId: "GOAT-HERD-test-working-dog",
      role: "guardian",
      worksiteId: "DOMESTIC-PEN-test-working-dog",
      dutyArea: { center: DUTY_POSITION, radiusUnits: 6_000 },
      createdAtTick: 0,
    }],
  });
  const assignment = state.assignments[0]!;
  const observation = createActorObservation({
    id: "OBS-working-dog-task-alarm",
    observerId: dog.identity.stableId,
    observedAtTick: 1,
    channel: "hearing",
    perceivedClass: "herd-alarm",
    subjectId: null,
    area: { center: DUTY_POSITION, radiusUnits: 500 },
    confidence: 900_000,
    salience: 900_000,
    identification: "anonymous",
    interrupt: "strong",
  });
  if (observation === null) throw new Error("Task observation failed");
  const perception = stepActorPerception(createActorPerceptionState(dog.identity.stableId, 0), {
    tick: 1,
    observations: [observation],
  });
  if (perception === null) throw new Error("Task perception failed");
  const stagedActivity = stageSettlementWorkingAnimalActivity(state, {
    assignmentId: assignment.assignmentId,
    tick: 1,
    perception,
    welfare: ZERO_WELFARE,
    accessibility: { watch: true, investigate: true, return: true },
    actorDisposition: { kind: "available" },
    workerInsideDutyArea: true,
  });
  if (stagedActivity?.transaction === null || stagedActivity === null) {
    throw new Error("Investigation activity failed");
  }
  const activity = resolveSettlementWorkingAnimalActivity(
    stagedActivity.state,
    stagedActivity.transaction,
  );
  if (activity === null) throw new Error("Investigation activity resolution failed");
  state = activity.state;
  const stagedTask = stageSettlementWorkingAnimalTaskLifecycle(state, {
    assignmentId: assignment.assignmentId,
    tick: 1,
    workerPosition: DUTY_POSITION,
    handlerPosition: DUTY_POSITION,
    workerPerception: perception,
    handlerPerception: currentPerception(KEEPER_ID, 1),
    welfare: ZERO_WELFARE,
    actorDisposition: { kind: "available" },
    handlerDisposition: { kind: "continue" },
  });
  if (stagedTask?.transaction === null || stagedTask === null) {
    throw new Error("Investigation task failed");
  }
  const task = resolveSettlementWorkingAnimalTaskLifecycle(
    stagedTask.state,
    stagedTask.transaction,
  );
  if (task === null) throw new Error("Investigation task resolution failed");
  return task.state.assignments[0]!;
}

function returningAssignment(
  dog: DogActorState,
  custody: SettlementDomesticAnimalCustodyRecord,
): SettlementWorkingAnimalAssignment {
  const state = createSettlementWorkingAnimalState({
    settlementId: SETTLEMENT_ID,
    assignments: [{
      assignmentOrdinal: 0,
      workerActorId: dog.identity.stableId,
      workerSpecies: "domestic-dog",
      handlerActorId: KEEPER_ID,
      workerCustodyRelationshipId: custody.relationshipId,
      protectedCustodyRelationshipId: PROTECTED_RELATIONSHIP_ID,
      protectedGroupId: "GOAT-HERD-test-working-dog",
      role: "guardian",
      worksiteId: "DOMESTIC-PEN-test-working-dog",
      dutyArea: { center: DUTY_POSITION, radiusUnits: 6_000 },
      createdAtTick: 0,
    }],
  });
  const assignment = state.assignments[0]!;
  const staged = stageSettlementWorkingAnimalActivity(state, {
    assignmentId: assignment.assignmentId,
    tick: 1,
    perception: currentPerception(dog.identity.stableId, 1),
    welfare: ZERO_WELFARE,
    accessibility: { watch: false, investigate: false, return: true },
    actorDisposition: { kind: "available" },
    workerInsideDutyArea: false,
  });
  if (staged?.transaction === null || staged === null) {
    throw new Error("Return activity failed");
  }
  const resolved = resolveSettlementWorkingAnimalActivity(staged.state, staged.transaction);
  if (resolved === null) throw new Error("Return activity resolution failed");
  return resolved.state.assignments[0]!;
}
