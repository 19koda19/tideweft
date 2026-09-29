import { describe, expect, it } from "vitest";

import {
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  createDogActorState,
  replaceDogActorPerception,
  setDogActorIntent,
  type DogActorState,
} from "./dogActor";
import {
  guardianDogDefensiveGrowlExpressionEventForTrigger,
  guardianDogDefensiveGrowlExpressionEventMatchesWorld,
  guardianDogDefensiveGrowlExpressionIntent,
  guardianDogDefensiveGrowlExpressionMemoryMatchesWorld,
  guardianDogWarningExpressionEventForTrigger,
  guardianDogWarningExpressionEventMatchesWorld,
  guardianDogWarningExpressionIntent,
  guardianDogWarningExpressionMemoryMatchesWorld,
  type GuardianDogDefensiveGrowlExpressionInput,
  type GuardianDogWarningExpressionInput,
} from "./dogSignalExpression";
import {
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
} from "./situatedExpression";
import {
  createSettlementWorkingAnimalState,
  resolveSettlementWorkingAnimalActivity,
  resolveSettlementWorkingAnimalTaskLifecycle,
  stageSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalTaskLifecycle,
  type SettlementWorkingAnimalActivityAccessibility,
  type SettlementWorkingAnimalState,
  type SettlementWorkingAnimalWelfareState,
} from "./settlementWorkingAnimals";
import { createWorldPosition, type WorldPosition } from "./worldPosition";

const ZERO_WELFARE: SettlementWorkingAnimalWelfareState = Object.freeze({
  injuryPressure: 0,
  coldPressure: 0,
  heatPressure: 0,
  exhaustionPressure: 0,
  hungerPressure: 0,
  thirstPressure: 0,
});

const ALL_ACCESSIBLE: SettlementWorkingAnimalActivityAccessibility = Object.freeze({
  watch: true,
  investigate: true,
  return: true,
});

const AVAILABLE_FOR_WORK = Object.freeze({ kind: "available" as const });
const HANDLER_ID = "H-dog-warning-test-handler";

function position(localX = 24_000, localY = 24_000): WorldPosition {
  return createWorldPosition(createRegionCoord(0, 0), localX, localY);
}

function dogAtTickZero(): DogActorState {
  return createDogActorState({
    seed: seedFromText("guardian dog signal expression test"),
    originRegion: createRegionCoord(0, 0),
    originNamespace: "regional",
    habitatClass: "settlement-edge",
    habitatKey: "guardian-signal-test-worksite",
    populationKey: "guardian-signal-test-dogs",
    populationOrdinal: 0,
    position: position(23_000, 24_000),
    heading: 0,
    tick: 0,
  });
}

function alarmPerception(workerActorId: string): ActorPerceptionState {
  const observation = createActorObservation({
    id: "OBS-dog-warning-herd-alarm",
    observerId: workerActorId,
    observedAtTick: 1,
    channel: "hearing",
    perceivedClass: "herd-alarm",
    subjectId: null,
    area: { center: position(), radiusUnits: 500 },
    confidence: 900_000,
    salience: 850_000,
    identification: "anonymous",
    interrupt: "strong",
  });
  if (observation === null) throw new Error("Dog warning observation was invalid");
  const perception = stepActorPerception(createActorPerceptionState(workerActorId, 0), {
    tick: 1,
    observations: [observation],
  });
  if (perception === null) throw new Error("Dog warning perception did not advance");
  return perception;
}

function quietPerception(actorId: string): ActorPerceptionState {
  const perception = stepActorPerception(createActorPerceptionState(actorId, 0), {
    tick: 1,
    observations: [],
  });
  if (perception === null) throw new Error("Dog warning handler perception did not advance");
  return perception;
}

function singleSignalPerception(
  workerActorId: string,
  perceivedClass: string,
  observationId: string,
  tick = 1,
): ActorPerceptionState {
  const observation = createActorObservation({
    id: observationId,
    observerId: workerActorId,
    observedAtTick: tick,
    channel: "hearing",
    perceivedClass,
    subjectId: null,
    area: { center: position(), radiusUnits: 500 },
    confidence: 920_000,
    salience: 880_000,
    identification: "anonymous",
    interrupt: "strong",
  });
  if (observation === null) throw new Error("Dog growl observation was invalid");
  const perception = stepActorPerception(createActorPerceptionState(workerActorId, 0), {
    tick,
    observations: [observation],
  });
  if (perception === null) throw new Error("Dog growl perception did not advance");
  return perception;
}

function simultaneousTiedThreatPerception(
  workerActorId: string,
  reverseInput: boolean,
): ActorPerceptionState {
  const observations = ([
    ["OBS-dog-growl-tie-a", "large-predator"],
    ["OBS-dog-growl-tie-b", "bear"],
  ] as const).map(([id, perceivedClass]) => createActorObservation({
    id,
    observerId: workerActorId,
    observedAtTick: 1,
    channel: "hearing",
    perceivedClass,
    subjectId: null,
    area: { center: position(), radiusUnits: 500 },
    confidence: 900_000,
    salience: 900_000,
    identification: "anonymous",
    interrupt: "strong",
  }));
  if (observations.some((observation) => observation === null)) {
    throw new Error("Dog growl tied threat observation was invalid");
  }
  const ordered = reverseInput ? [...observations].reverse() : observations;
  const perception = stepActorPerception(createActorPerceptionState(workerActorId, 0), {
    tick: 1,
    observations: ordered,
  });
  if (perception === null) throw new Error("Dog growl tied threat perception did not advance");
  return perception;
}

function workState(workerActorId: string): SettlementWorkingAnimalState {
  return createSettlementWorkingAnimalState({
    settlementId: 11,
    assignments: [{
      assignmentOrdinal: 0,
      workerActorId,
      workerSpecies: "domestic-dog",
      handlerActorId: HANDLER_ID,
      workerCustodyRelationshipId: "DOMESTIC-REL-0000000000000011",
      protectedCustodyRelationshipId: "DOMESTIC-REL-0000000000000012",
      protectedGroupId: "GOAT-HERD-dog-warning-test",
      role: "guardian",
      worksiteId: "DOMESTIC-PEN-dog-warning-test",
      dutyArea: { center: position(), radiusUnits: 6_000 },
      createdAtTick: 0,
    }],
  });
}

function commitInvestigation(
  initial: SettlementWorkingAnimalState,
  workerPerception: ActorPerceptionState,
): SettlementWorkingAnimalState {
  const assignment = initial.assignments[0]!;
  const stagedActivity = stageSettlementWorkingAnimalActivity(initial, {
    assignmentId: assignment.assignmentId,
    tick: 1,
    perception: workerPerception,
    welfare: ZERO_WELFARE,
    accessibility: ALL_ACCESSIBLE,
    actorDisposition: AVAILABLE_FOR_WORK,
    workerInsideDutyArea: true,
  });
  if (stagedActivity?.transaction === null || stagedActivity === null) {
    throw new Error("Dog warning investigation activity was not staged");
  }
  const resolvedActivity = resolveSettlementWorkingAnimalActivity(
    stagedActivity.state,
    stagedActivity.transaction,
  );
  if (resolvedActivity === null) throw new Error("Dog warning activity was not committed");
  const stagedTask = stageSettlementWorkingAnimalTaskLifecycle(resolvedActivity.state, {
    assignmentId: assignment.assignmentId,
    tick: 1,
    workerPosition: position(23_000, 24_000),
    handlerPosition: position(),
    workerPerception,
    handlerPerception: quietPerception(HANDLER_ID),
    welfare: ZERO_WELFARE,
    actorDisposition: AVAILABLE_FOR_WORK,
    handlerDisposition: { kind: "continue" },
  });
  if (stagedTask?.transaction === null || stagedTask === null) {
    throw new Error("Dog warning investigation task was not staged");
  }
  const resolvedTask = resolveSettlementWorkingAnimalTaskLifecycle(
    stagedTask.state,
    stagedTask.transaction,
  );
  if (resolvedTask === null) throw new Error("Dog warning task was not committed");
  return resolvedTask.state;
}

function commitActorDeference(
  initial: SettlementWorkingAnimalState,
  workerPerception: ActorPerceptionState,
  referenceId = "actor-intent:retreat",
): SettlementWorkingAnimalState {
  const assignment = initial.assignments[0]!;
  const staged = stageSettlementWorkingAnimalActivity(initial, {
    assignmentId: assignment.assignmentId,
    tick: workerPerception.tick,
    perception: workerPerception,
    welfare: ZERO_WELFARE,
    accessibility: ALL_ACCESSIBLE,
    actorDisposition: { kind: "defer-to-actor", referenceId },
    workerInsideDutyArea: true,
  });
  if (staged?.transaction === null || staged === null) {
    throw new Error("Dog growl actor deference was not staged");
  }
  const resolved = resolveSettlementWorkingAnimalActivity(staged.state, staged.transaction);
  if (resolved === null) throw new Error("Dog growl actor deference was not committed");
  return resolved.state;
}

function fixture(): Readonly<{
  input: GuardianDogWarningExpressionInput;
  originalDog: DogActorState;
  initialWork: SettlementWorkingAnimalState;
}> {
  const originalDog = dogAtTickZero();
  const initialWork = workState(originalDog.identity.stableId);
  const perception = alarmPerception(originalDog.identity.stableId);
  const dog = replaceDogActorPerception(originalDog, perception);
  return Object.freeze({
    input: Object.freeze({
      dog,
      workingAnimals: commitInvestigation(initialWork, perception),
      completedTick: 1,
    }),
    originalDog,
    initialWork,
  });
}

function defensiveGrowlFixture(
  perceivedClass = "large-predator",
  workReferenceId = "actor-intent:retreat",
): Readonly<{
  input: GuardianDogDefensiveGrowlExpressionInput;
  beliefKey: string;
  originalDog: DogActorState;
  initialWork: SettlementWorkingAnimalState;
}> {
  const originalDog = dogAtTickZero();
  const initialWork = workState(originalDog.identity.stableId);
  const perception = singleSignalPerception(
    originalDog.identity.stableId,
    perceivedClass,
    `OBS-dog-growl-${perceivedClass}`,
  );
  const belief = perception.beliefs[0];
  if (belief === undefined) throw new Error("Dog growl threat belief was not retained");
  const dog = setDogActorIntent(
    replaceDogActorPerception(originalDog, perception),
    {
      kind: "retreat",
      cause: { kind: "perception", referenceId: belief.key },
      enteredAtTick: 1,
      nextThinkTick: 2,
    },
  );
  return Object.freeze({
    input: Object.freeze({
      dog,
      workingAnimals: commitActorDeference(initialWork, perception, workReferenceId),
      completedTick: 1,
    }),
    beliefKey: belief.key,
    originalDog,
    initialWork,
  });
}

describe("guardian dog warning expression", () => {
  it("derives one deterministic warning call from a fresh lawful investigation", () => {
    const { input } = fixture();
    const assignment = input.workingAnimals.assignments[0]!;
    const first = guardianDogWarningExpressionIntent(input);
    const second = guardianDogWarningExpressionIntent(structuredClone(input));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      sourceActorId: input.dog.identity.stableId,
      triggerEventId: assignment.currentActivity.transactionId,
      position: input.dog.address.position,
      meaning: "guardian-dog-warning",
      family: "animal-signal",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-heard-anonymous-alarm",
      priority: 760_000,
      salience: 850_000,
      durationSteps: 6,
    });
    expect(Number.isSafeInteger(first?.variantSeed)).toBe(true);
  });

  it("reauthenticates the exact event and bounded cooldown against current world roots", () => {
    const { input } = fixture();
    const intent = guardianDogWarningExpressionIntent(input);
    if (intent === null) throw new Error("Dog warning intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (!reduction.accepted || reduction.event === null || reduction.state === null) {
      throw new Error("Dog warning expression was not accepted");
    }
    const memory = reduction.state.recent[0];
    if (memory === undefined) throw new Error("Dog warning cooldown memory was not retained");

    expect(guardianDogWarningExpressionEventForTrigger(input, intent.triggerEventId))
      .toEqual(reduction.event);
    expect(guardianDogWarningExpressionEventMatchesWorld(input, reduction.event)).toBe(true);
    expect(guardianDogWarningExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(guardianDogWarningExpressionEventMatchesWorld(input, {
      ...reduction.event,
      triggerEventId: "WORK-ACT-unrelated",
    })).toBe(false);
    expect(guardianDogWarningExpressionMemoryMatchesWorld(input, {
      ...memory,
      triggerEventId: "WORK-ACT-unrelated",
    })).toBe(false);
  });

  it("refuses stale dog state, a mismatched tick, or work without the committed task", () => {
    const { input, originalDog, initialWork } = fixture();
    expect(guardianDogWarningExpressionIntent({
      ...input,
      dog: originalDog,
    })).toBeNull();
    expect(guardianDogWarningExpressionIntent({
      ...input,
      completedTick: 2,
    })).toBeNull();
    expect(guardianDogWarningExpressionIntent({
      ...input,
      workingAnimals: initialWork,
    })).toBeNull();
  });
});

describe("guardian dog defensive growl expression", () => {
  it("derives one deterministic low growl from the exact fresh retreat transaction", () => {
    const { input } = defensiveGrowlFixture();
    const assignment = input.workingAnimals.assignments[0]!;
    const first = guardianDogDefensiveGrowlExpressionIntent(input);
    const second = guardianDogDefensiveGrowlExpressionIntent(structuredClone(input));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      sourceActorId: input.dog.identity.stableId,
      triggerEventId: assignment.currentActivity.transactionId,
      position: input.dog.address.position,
      meaning: "guardian-dog-defensive-growl",
      family: "animal-signal",
      tone: "restrained",
      volume: "spoken",
      knowledgeBasis: "self-perceived-threat",
      priority: 780_000,
      salience: 880_000,
      durationSteps: 8,
    });
    expect(Number.isSafeInteger(first?.variantSeed)).toBe(true);

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), first);
    expect(reduction.accepted).toBe(true);
    expect(reduction.event).toMatchObject({
      vocalization: "dog-defensive-growl",
      realizationKey: "situated-expression.en.v1.guardian-dog-defensive-growl.0",
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "GRRRR.",
      realizationKey: "situated-expression.en.v1.guardian-dog-defensive-growl.0",
      vocalization: "dog-defensive-growl",
    });
  });

  it("reauthenticates only the exact event and reachable cooldown memory", () => {
    const { input } = defensiveGrowlFixture();
    const intent = guardianDogDefensiveGrowlExpressionIntent(input);
    if (intent === null) throw new Error("Dog growl intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    const memory = reduction.state?.recent[0];
    if (!reduction.accepted || reduction.event === null || memory === undefined) {
      throw new Error("Dog growl expression was not accepted");
    }

    expect(guardianDogDefensiveGrowlExpressionEventForTrigger(
      input,
      intent.triggerEventId,
    )).toEqual(reduction.event);
    expect(guardianDogDefensiveGrowlExpressionEventMatchesWorld(
      input,
      reduction.event,
    )).toBe(true);
    expect(guardianDogDefensiveGrowlExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(guardianDogDefensiveGrowlExpressionEventMatchesWorld(input, {
      ...reduction.event,
      triggerEventId: "WORK-ACT-unrelated",
    })).toBe(false);
    expect(guardianDogDefensiveGrowlExpressionMemoryMatchesWorld(input, {
      ...memory,
      triggerEventId: "WORK-ACT-unrelated",
    })).toBe(false);
  });

  it("selects the canonical threat on a simultaneous tie and rejects the other belief", () => {
    const originalDog = dogAtTickZero();
    const perception = simultaneousTiedThreatPerception(
      originalDog.identity.stableId,
      true,
    );
    expect(perception).toEqual(simultaneousTiedThreatPerception(
      originalDog.identity.stableId,
      false,
    ));
    const selected = perception.beliefs.find(({ sourceObservationId }) => (
      sourceObservationId === "OBS-dog-growl-tie-a"
    ));
    const nonselected = perception.beliefs.find(({ sourceObservationId }) => (
      sourceObservationId === "OBS-dog-growl-tie-b"
    ));
    if (selected === undefined || nonselected === undefined) {
      throw new Error("Dog growl tie fixture lost a threat belief");
    }
    expect(selected.key < nonselected.key).toBe(true);

    const dog = setDogActorIntent(
      replaceDogActorPerception(originalDog, perception),
      {
        kind: "retreat",
        cause: { kind: "perception", referenceId: selected.key },
        enteredAtTick: 1,
        nextThinkTick: 2,
      },
    );
    const input: GuardianDogDefensiveGrowlExpressionInput = {
      dog,
      workingAnimals: commitActorDeference(
        workState(originalDog.identity.stableId),
        perception,
      ),
      completedTick: 1,
    };
    const intent = guardianDogDefensiveGrowlExpressionIntent(input);
    expect(intent).not.toBeNull();

    const forgedDog = setDogActorIntent(dog, {
      kind: "retreat",
      cause: { kind: "perception", referenceId: nonselected.key },
      enteredAtTick: 1,
      nextThinkTick: 2,
    });
    expect(guardianDogDefensiveGrowlExpressionIntent({
      ...input,
      dog: forgedDog,
    })).toBeNull();
  });

  it("rejects stale retreat state, a mismatched belief, and a non-threat belief", () => {
    const { input } = defensiveGrowlFixture();
    expect(guardianDogDefensiveGrowlExpressionIntent({
      ...input,
      completedTick: 2,
    })).toBeNull();

    const mismatchedDog = setDogActorIntent(input.dog, {
      kind: "retreat",
      cause: { kind: "perception", referenceId: "contact:hearing:forged" },
      enteredAtTick: 1,
      nextThinkTick: 2,
    });
    expect(guardianDogDefensiveGrowlExpressionIntent({
      ...input,
      dog: mismatchedDog,
    })).toBeNull();

    const originalDog = dogAtTickZero();
    const freshPerception = singleSignalPerception(
      originalDog.identity.stableId,
      "large-predator",
      "OBS-dog-growl-stale-threat",
    );
    const stalePerception = stepActorPerception(freshPerception, {
      tick: 2,
      observations: [],
    });
    const staleBelief = stalePerception?.beliefs[0];
    if (stalePerception === null || staleBelief === undefined) {
      throw new Error("Dog growl stale belief fixture did not advance");
    }
    const staleDog = setDogActorIntent(
      replaceDogActorPerception(originalDog, stalePerception),
      {
        kind: "retreat",
        cause: { kind: "perception", referenceId: staleBelief.key },
        enteredAtTick: 2,
        nextThinkTick: 3,
      },
    );
    expect(guardianDogDefensiveGrowlExpressionIntent({
      dog: staleDog,
      workingAnimals: commitActorDeference(
        workState(originalDog.identity.stableId),
        stalePerception,
      ),
      completedTick: 2,
    })).toBeNull();

    expect(guardianDogDefensiveGrowlExpressionIntent(
      defensiveGrowlFixture("food").input,
    )).toBeNull();
  });

  it("rejects work that did not freshly commit the exact retreat deference", () => {
    const { input, initialWork } = defensiveGrowlFixture();
    expect(guardianDogDefensiveGrowlExpressionIntent({
      ...input,
      workingAnimals: initialWork,
    })).toBeNull();
    expect(guardianDogDefensiveGrowlExpressionIntent(
      defensiveGrowlFixture("large-predator", "actor-intent:avoid-human").input,
    )).toBeNull();
  });
});
