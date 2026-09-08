import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorObservation,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  createCoreEcologyGroup,
  reconcileCoreEcologyGroupMaterialized,
  type CoreEcologyGroupState,
  type CoreEcologyGroupTransitionEvent,
} from "./coreEcologyGroups";
import { createCoreWildlifeActorState, type CoreWildlifeActorState } from "./coreWildlifeActor";
import {
  SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_SERIALIZED_BYTES,
  canonicalizeSettlementDomesticAnimalRecoveryState,
  createSettlementDomesticAnimalRecoveryState,
  deserializeSettlementDomesticAnimalRecoveryState,
  recoverPendingSettlementDomesticAnimalRecovery,
  resolveSettlementDomesticAnimalRecovery,
  serializeSettlementDomesticAnimalRecoveryState,
  stageSettlementDomesticAnimalRecovery,
  type SettlementDomesticAnimalRecoveryState,
} from "./settlementDomesticAnimalRecovery";
import {
  createSettlementEcologyState,
  establishSettlementDomesticAnimalCustody,
  type SettlementEcologyState,
} from "./settlementEcology";
import {
  createSettlementWorkingAnimalState,
  resolveSettlementWorkingAnimalActivity,
  resolveSettlementWorkingAnimalTaskLifecycle,
  stageSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalTaskLifecycle,
  type SettlementWorkingAnimalState,
} from "./settlementWorkingAnimals";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha 28 domestic animal recovery");
const ORIGIN = createRegionCoord(-73, 41);
const SETTLEMENT_ID = 28;
const CARETAKER_ID = "H-alpha28-caretaker";
const POPULATION_KEY = "domestic-goat:alpha28-recovery";

interface Fixture {
  readonly root: SettlementDomesticAnimalRecoveryState;
  readonly settlement: SettlementEcologyState;
  readonly splitGroup: CoreEcologyGroupState;
  readonly splitEvent: CoreEcologyGroupTransitionEvent;
  readonly separated: CoreWildlifeActorState;
  readonly homeMember: CoreWildlifeActorState;
  readonly outside: WorldPosition;
  readonly insideA: WorldPosition;
  readonly insideB: WorldPosition;
}

function fixture(): Fixture {
  const patch = aggregatePatch();
  const ecology = createSettlementEcologyState({
    rootSeed: SEED,
    settlementId: SETTLEMENT_ID,
    keeperActorId: CARETAKER_ID,
    position: createWorldPosition(ORIGIN, 34_000, 30_000),
    aggregatePatch: patch,
  });
  const home = translateWorldPosition(ecology.identity.position, 5_000, 0);
  const insideA = translateWorldPosition(home, -400, 0);
  const insideB = translateWorldPosition(home, 400, 0);
  const outside = translateWorldPosition(home, 12_000, 0);
  const group = createCoreEcologyGroup({
    seed: SEED,
    species: "domestic-goat",
    originRegion: ORIGIN,
    populationKey: POPULATION_KEY,
    groupOrdinal: 0,
    memberOrdinals: [0, 1],
    anchor: home,
    tick: 0,
  });
  const separated = goat(0, outside, 1);
  const homeMember = goat(1, insideB, 1);
  const settlement = establishSettlementDomesticAnimalCustody(ecology, {
    custodyOrdinal: 0,
    owner: { kind: "actor", id: CARETAKER_ID },
    caretakerActorId: CARETAKER_ID,
    species: "domestic-goat",
    memberActorIds: [separated.identity.stableId, homeMember.identity.stableId],
    memberGroupId: group.identity.stableId,
    homeStructure: { kind: "pen", position: home, radiusUnits: 3_000 },
  });
  if (settlement === null) throw new Error("Could not establish recovery custody fixture");
  const split = reconcileCoreEcologyGroupMaterialized(group, {
    atTick: 1,
    memberPositions: [
      { memberOrdinal: 0, position: outside },
      { memberOrdinal: 1, position: insideB },
    ],
    splitDistanceUnits: 6_000,
    rejoinDistanceUnits: 1_500,
    currentEscapeCause: {
      eventId: "escape:alpha28:goat:0",
      causeReferenceId: "open-gate:alpha28",
      memberOrdinal: 0,
    },
  });
  if (split === null || split.events[0]?.kind !== "group-split") {
    throw new Error("Could not split recovery group fixture");
  }
  return {
    root: createSettlementDomesticAnimalRecoveryState(SETTLEMENT_ID),
    settlement,
    splitGroup: split.group,
    splitEvent: split.events[0],
    separated,
    homeMember,
    outside,
    insideA,
    insideB,
  };
}

function aggregatePatch(): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: SEED,
    originRegion: ORIGIN,
  });
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha28:domestic-recovery-store",
    originRegion: ORIGIN,
    tick: 0,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
}

function individualInputs(
  habitat: CoreEcologyHarborEdgeHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }]
  ));
}

function goat(ordinal: number, position: WorldPosition, tick: number): CoreWildlifeActorState {
  return createCoreWildlifeActorState({
    seed: SEED,
    species: "domestic-goat",
    originRegion: ORIGIN,
    populationKey: POPULATION_KEY,
    populationOrdinal: ordinal,
    position,
    tick,
  });
}

function observation(
  observerId: string,
  subjectId: string,
  center: WorldPosition,
  tick: number,
  id: string,
  perceivedClass = "known-domestic-animal",
): ActorObservation {
  const result = createActorObservation({
    id,
    observerId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass,
    subjectId,
    area: { center, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: ACTOR_PERCEPTION_SCALE,
    identification: "identified",
  });
  if (result === null) throw new Error("Could not create direct observation fixture");
  return result;
}

function commit(
  state: SettlementDomesticAnimalRecoveryState,
  request: Parameters<typeof stageSettlementDomesticAnimalRecovery>[1],
): SettlementDomesticAnimalRecoveryState {
  const staged = stageSettlementDomesticAnimalRecovery(state, request);
  if (staged === null) throw new Error(`Could not stage ${request.kind}`);
  const resolved = resolveSettlementDomesticAnimalRecovery(staged.state, staged.transaction);
  if (resolved === null || !resolved.applied) throw new Error(`Could not resolve ${request.kind}`);
  return resolved.state;
}

function opened(f: Fixture): SettlementDomesticAnimalRecoveryState {
  return commit(f.root, {
    kind: "open",
    atTick: 1,
    settlement: f.settlement,
    custodyRelationshipId: f.settlement.domesticCustodies[0]!.relationshipId,
    group: f.splitGroup,
    splitEvent: f.splitEvent,
    separatedMember: f.separated,
    memberActors: [f.separated, f.homeMember],
    lastKnownArea: { center: f.outside, radiusUnits: 0 },
  });
}

function noticed(f: Fixture): SettlementDomesticAnimalRecoveryState {
  return commit(opened(f), {
    kind: "notice",
    evidenceKind: "current-dual-sight",
    atTick: 2,
    settlement: f.settlement,
    group: f.splitGroup,
    separatedObservation: observation(
      CARETAKER_ID,
      f.separated.identity.stableId,
      f.outside,
      2,
      "OBS-alpha28-separated",
    ),
    homeMemberObservation: observation(
      CARETAKER_ID,
      f.homeMember.identity.stableId,
      f.insideB,
      2,
      "OBS-alpha28-home-member",
    ),
  });
}

function rejoined(f: Fixture): Readonly<{
  group: CoreEcologyGroupState;
  event: CoreEcologyGroupTransitionEvent;
}> {
  const result = reconcileCoreEcologyGroupMaterialized(f.splitGroup, {
    atTick: 3,
    memberPositions: [
      { memberOrdinal: 0, position: f.insideA },
      { memberOrdinal: 1, position: f.insideB },
    ],
    splitDistanceUnits: 6_000,
    rejoinDistanceUnits: 1_500,
  });
  if (result === null || result.events[0]?.kind !== "group-rejoined") {
    throw new Error("Could not rejoin recovery group fixture");
  }
  return { group: result.group, event: result.events[0] };
}

function perceptionWith(
  actorId: string,
  seen: ActorObservation,
): ActorPerceptionState {
  const state = stepActorPerception(createActorPerceptionState(actorId, seen.observedAtTick - 1), {
    tick: seen.observedAtTick,
    observations: [seen],
  });
  if (state === null) throw new Error("Could not create working-animal perception fixture");
  return state;
}

function activeSearch(f: Fixture): SettlementWorkingAnimalState {
  const custody = f.settlement.domesticCustodies[0]!;
  let state = createSettlementWorkingAnimalState({
    settlementId: SETTLEMENT_ID,
    assignments: [{
      assignmentOrdinal: 0,
      workerActorId: "D-alpha28-guardian",
      workerSpecies: "domestic-dog",
      handlerActorId: CARETAKER_ID,
      workerCustodyRelationshipId: "DOMESTIC-REL-00000000000000aa",
      protectedCustodyRelationshipId: custody.relationshipId,
      protectedGroupId: custody.memberGroupId!,
      role: "guardian",
      worksiteId: custody.homeStructure.structureId,
      dutyArea: { center: custody.homeStructure.position, radiusUnits: 20_000 },
      createdAtTick: 0,
    }],
  });
  const assignment = state.assignments[0]!;
  const seen = observation(
    assignment.workerActorId,
    f.separated.identity.stableId,
    f.outside,
    2,
    "OBS-alpha28-guardian-separated",
    "threat",
  );
  const perception = perceptionWith(assignment.workerActorId, seen);
  const activity = stageSettlementWorkingAnimalActivity(state, {
    assignmentId: assignment.assignmentId,
    tick: 2,
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
  if (activity === null || activity.transaction === null) {
    throw new Error(`Could not stage guardian investigation: ${JSON.stringify(activity)}`);
  }
  const activityResolution = resolveSettlementWorkingAnimalActivity(
    activity.state,
    activity.transaction,
  );
  if (activityResolution === null) throw new Error("Could not commit guardian investigation");
  state = activityResolution.state;
  const task = stageSettlementWorkingAnimalTaskLifecycle(state, {
    assignmentId: assignment.assignmentId,
    tick: 2,
    workerPosition: f.insideA,
    handlerPosition: f.insideB,
    workerPerception: perception,
    handlerPerception: createActorPerceptionState(CARETAKER_ID, 2),
    welfare: {
      injuryPressure: 0,
      coldPressure: 0,
      heatPressure: 0,
      exhaustionPressure: 0,
      hungerPressure: 0,
      thirstPressure: 0,
    },
    actorDisposition: { kind: "available" },
    handlerDisposition: { kind: "continue" },
  });
  if (task === null) throw new Error("Could not stage guardian search task");
  const taskResolution = resolveSettlementWorkingAnimalTaskLifecycle(task.state, task.transaction);
  if (taskResolution === null) throw new Error("Could not commit guardian search task");
  return taskResolution.state;
}

describe("settlement domestic-animal recovery authority", () => {
  it("keeps a physical split unknown until the caretaker directly sees both sides", () => {
    const f = fixture();
    const state = opened(f);

    expect(state.currentCase?.phase).toBe("unnoticed");
    expect(stageSettlementDomesticAnimalRecovery(state, {
      kind: "notice",
      evidenceKind: "current-dual-sight",
      atTick: 2,
      settlement: f.settlement,
      group: f.splitGroup,
      separatedObservation: observation(
        CARETAKER_ID,
        f.separated.identity.stableId,
        f.outside,
        1,
        "OBS-alpha28-stale-separated",
      ),
      homeMemberObservation: observation(
        CARETAKER_ID,
        f.homeMember.identity.stableId,
        f.insideB,
        2,
        "OBS-alpha28-current-home",
      ),
    })).toBeNull();
    expect(state.currentCase?.notice).toBeNull();

    const inPenActor = goat(0, f.insideA, 1);
    expect(stageSettlementDomesticAnimalRecovery(f.root, {
      kind: "open",
      atTick: 1,
      settlement: f.settlement,
      custodyRelationshipId: f.settlement.domesticCustodies[0]!.relationshipId,
      group: f.splitGroup,
      splitEvent: f.splitEvent,
      separatedMember: inPenActor,
      memberActors: [inPenActor, f.homeMember],
      lastKnownArea: { center: f.insideA, radiusUnits: 0 },
    })).toBeNull();
  });

  it("links only a lawful search source and never treats searching as a found animal", () => {
    const f = fixture();
    const state = noticed(f);
    const working = activeSearch(f);
    const assignment = working.assignments[0]!;
    const task = assignment.currentTask!;

    const linked = commit(state, {
      kind: "link-search",
      atTick: 2,
      settlement: f.settlement,
      group: f.splitGroup,
      workingAnimals: working,
      assignmentId: assignment.assignmentId,
      taskId: task.taskId,
    });
    expect(linked.currentCase).toMatchObject({
      phase: "searching",
      linkedSearch: {
        taskId: task.taskId,
        sourceArea: { center: f.outside, radiusUnits: 0 },
      },
    });
    expect(linked.latestClosedOutcome).toBeNull();

    const wrong = createSettlementWorkingAnimalState({
      settlementId: SETTLEMENT_ID,
      assignments: [{
        assignmentOrdinal: 0,
        workerActorId: "D-alpha28-wrong-guardian",
        workerSpecies: "domestic-dog",
        handlerActorId: CARETAKER_ID,
        workerCustodyRelationshipId: "DOMESTIC-REL-00000000000000ab",
        protectedCustodyRelationshipId: "DOMESTIC-REL-00000000000000ac",
        protectedGroupId: f.splitGroup.identity.stableId,
        role: "guardian",
        worksiteId: "DOMESTIC-PEN-wrong",
        dutyArea: { center: f.insideA, radiusUnits: 5_000 },
        createdAtTick: 0,
      }],
    });
    expect(stageSettlementDomesticAnimalRecovery(state, {
      kind: "link-search",
      atTick: 2,
      settlement: f.settlement,
      group: f.splitGroup,
      workingAnimals: wrong,
      assignmentId: wrong.assignments[0]!.assignmentId,
      taskId: "WORK-TASK-not-real",
    })).toBeNull();
  });

  it("requires an exact physical rejoin and current all-member home confirmation to close", () => {
    const f = fixture();
    const state = noticed(f);
    const premature = stageSettlementDomesticAnimalRecovery(state, {
      kind: "confirm-home",
      atTick: 3,
      settlement: f.settlement,
      group: f.splitGroup,
      memberObservations: [
        observation(CARETAKER_ID, f.separated.identity.stableId, f.insideA, 3, "OBS-premature-a"),
        observation(CARETAKER_ID, f.homeMember.identity.stableId, f.insideB, 3, "OBS-premature-b"),
      ],
    });
    expect(premature).toBeNull();

    const reunion = rejoined(f);
    const awaiting = commit(state, {
      kind: "record-rejoin",
      atTick: 3,
      settlement: f.settlement,
      group: reunion.group,
      rejoinEvent: reunion.event,
    });
    expect(awaiting.currentCase?.phase).toBe("awaiting-confirmation");
    expect(stageSettlementDomesticAnimalRecovery(awaiting, {
      kind: "confirm-home",
      atTick: 4,
      settlement: f.settlement,
      group: reunion.group,
      memberObservations: [
        observation(CARETAKER_ID, f.separated.identity.stableId, f.insideA, 4, "OBS-only-one"),
      ],
    })).toBeNull();

    const closed = commit(awaiting, {
      kind: "confirm-home",
      atTick: 4,
      settlement: f.settlement,
      group: reunion.group,
      memberObservations: [
        observation(CARETAKER_ID, f.homeMember.identity.stableId, f.insideB, 4, "OBS-home-b"),
        observation(CARETAKER_ID, f.separated.identity.stableId, f.insideA, 4, "OBS-home-a"),
      ],
    });
    expect(closed.currentCase).toBeNull();
    expect(closed.latestClosedOutcome).toMatchObject({ outcome: "recovered", closedAtTick: 4 });
  });

  it("stages, recovers, and replays exact-once while retaining bounded canonical bytes", () => {
    const f = fixture();
    const request = {
      kind: "open" as const,
      atTick: 1,
      settlement: f.settlement,
      custodyRelationshipId: f.settlement.domesticCustodies[0]!.relationshipId,
      group: f.splitGroup,
      splitEvent: f.splitEvent,
      separatedMember: f.separated,
      memberActors: [f.separated, f.homeMember],
      lastKnownArea: { center: f.outside, radiusUnits: 0 },
    };
    const staged = stageSettlementDomesticAnimalRecovery(f.root, request);
    if (staged === null) throw new Error("Could not stage exact-once fixture");
    expect(stageSettlementDomesticAnimalRecovery(staged.state, request)).toMatchObject({
      reusedPendingTransaction: true,
      transaction: staged.transaction,
    });

    const persisted = serializeSettlementDomesticAnimalRecoveryState(staged.state);
    const reloaded = deserializeSettlementDomesticAnimalRecoveryState(persisted);
    const recovered = recoverPendingSettlementDomesticAnimalRecovery(reloaded);
    expect(recovered?.applied).toBe(true);
    expect(recovered?.state.currentCase?.phase).toBe("unnoticed");
    const replay = resolveSettlementDomesticAnimalRecovery(recovered?.state, staged.transaction);
    expect(replay?.applied).toBe(false);
    expect(replay?.state).toEqual(recovered?.state);

    const bytes = new TextEncoder().encode(
      serializeSettlementDomesticAnimalRecoveryState(recovered?.state),
    ).byteLength;
    expect(bytes).toBeLessThanOrEqual(SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_SERIALIZED_BYTES);
    expect(canonicalizeSettlementDomesticAnimalRecoveryState({
      ...recovered?.state,
      unboundedHistory: Array.from({ length: 100 }, (_, index) => index),
    })).toBeNull();
  });

  it("closes an unnoticed physical self-return without inventing caretaker knowledge", () => {
    const f = fixture();
    const reunion = rejoined(f);
    const awaiting = commit(opened(f), {
      kind: "record-rejoin",
      atTick: 3,
      settlement: f.settlement,
      group: reunion.group,
      rejoinEvent: reunion.event,
    });
    expect(awaiting.currentCase).toMatchObject({
      phase: "awaiting-confirmation",
      notice: null,
      linkedSearch: null,
    });

    const closed = commit(awaiting, {
      kind: "confirm-home",
      atTick: 4,
      settlement: f.settlement,
      group: reunion.group,
      memberObservations: [
        observation(CARETAKER_ID, f.separated.identity.stableId, f.insideA, 4, "OBS-self-a"),
        observation(CARETAKER_ID, f.homeMember.identity.stableId, f.insideB, 4, "OBS-self-b"),
      ],
    });
    expect(closed.currentCase).toBeNull();
    expect(closed.latestClosedOutcome).toMatchObject({
      outcome: "self-returned",
      notice: null,
      linkedSearch: null,
    });
    expect(deserializeSettlementDomesticAnimalRecoveryState(
      serializeSettlementDomesticAnimalRecoveryState(closed),
    )).toEqual(closed);
  });

  it("accepts a prior witnessed split plus a later current home census", () => {
    const f = fixture();
    const state = commit(opened(f), {
      kind: "notice",
      evidenceKind: "witnessed-split-home-census",
      atTick: 3,
      settlement: f.settlement,
      group: f.splitGroup,
      witnessedSplitObservation: observation(
        CARETAKER_ID,
        f.separated.identity.stableId,
        f.outside,
        1,
        "OBS-witnessed-split",
      ),
      homeMemberObservations: [observation(
        CARETAKER_ID,
        f.homeMember.identity.stableId,
        f.insideB,
        3,
        "OBS-current-census",
      )],
    });
    expect(state.currentCase?.notice).toMatchObject({
      source: "witnessed-split-home-census",
      separatedObservedAtTick: 1,
      learnedAtTick: 3,
    });
    expect(state.currentCase?.lastKnownArea).toEqual({ center: f.outside, radiusUnits: 0 });
  });

  it("reopens an awaiting case only from a new exact split and binds actor ordinals and transitions", () => {
    const f = fixture();
    const reunion = rejoined(f);
    const awaiting = commit(noticed(f), {
      kind: "record-rejoin",
      atTick: 3,
      settlement: f.settlement,
      group: reunion.group,
      rejoinEvent: reunion.event,
    });
    const resplit = reconcileCoreEcologyGroupMaterialized(reunion.group, {
      atTick: 4,
      memberPositions: [
        { memberOrdinal: 0, position: f.outside },
        { memberOrdinal: 1, position: f.insideB },
      ],
      splitDistanceUnits: 6_000,
      rejoinDistanceUnits: 1_500,
      currentEscapeCause: {
        eventId: "escape:alpha28:goat:again",
        causeReferenceId: "open-gate:alpha28:again",
        memberOrdinal: 0,
      },
    });
    if (resplit === null || resplit.events[0]?.kind !== "group-split") {
      throw new Error("Could not create resplit fixture");
    }
    expect(stageSettlementDomesticAnimalRecovery(awaiting, {
      kind: "record-resplit",
      atTick: 4,
      settlement: f.settlement,
      group: resplit.group,
      splitEvent: f.splitEvent,
    })).toBeNull();
    const reopened = commit(awaiting, {
      kind: "record-resplit",
      atTick: 4,
      settlement: f.settlement,
      group: resplit.group,
      splitEvent: resplit.events[0],
    });
    expect(reopened.currentCase).toMatchObject({
      phase: "noticed",
      reunionEvent: null,
      latestReopen: {
        priorReunionEvent: { eventId: reunion.event.eventId, atTick: 3 },
        resplitEvent: { eventId: resplit.events[0].eventId, atTick: 4 },
      },
    });

    const crosswired = goat(0, f.insideA, 1);
    expect(stageSettlementDomesticAnimalRecovery(f.root, {
      kind: "open",
      atTick: 1,
      settlement: f.settlement,
      custodyRelationshipId: f.settlement.domesticCustodies[0]!.relationshipId,
      group: f.splitGroup,
      splitEvent: f.splitEvent,
      separatedMember: f.separated,
      memberActors: [crosswired, f.homeMember],
      lastKnownArea: { center: f.outside, radiusUnits: 0 },
    })).toBeNull();

    const untampered = opened(f);
    const currentCase = untampered.currentCase!;
    const tampered = {
      ...untampered,
      currentCase: {
        ...currentCase,
        lastTransition: {
          ...currentCase.lastTransition,
          transactionId: "RECOVERY-TX-0000000000000000",
        },
      },
      lastResolvedTransitionId: "RECOVERY-TX-0000000000000000",
    };
    expect(canonicalizeSettlementDomesticAnimalRecoveryState(tampered)).toBeNull();
  });
});
