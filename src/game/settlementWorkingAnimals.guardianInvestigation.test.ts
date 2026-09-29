import { describe, expect, it } from "vitest";

import {
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import {
  createSettlementWorkingAnimalHandlerSearchReport,
  createSettlementWorkingAnimalState,
  resolveSettlementWorkingAnimalActivity,
  resolveSettlementWorkingAnimalTaskLifecycle,
  settlementGuardianAlarmInvestigation,
  stageSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalSearchFromHandlerReport,
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
const WORKER_ID = "D-guardian-signal-test";
const HANDLER_ID = "H-guardian-signal-test";

function position(localX = 24_000, localY = 24_000): WorldPosition {
  return createWorldPosition(createRegionCoord(0, 0), localX, localY);
}

function initialState(): SettlementWorkingAnimalState {
  return createSettlementWorkingAnimalState({
    settlementId: 7,
    assignments: [{
      assignmentOrdinal: 0,
      workerActorId: WORKER_ID,
      workerSpecies: "domestic-dog",
      handlerActorId: HANDLER_ID,
      workerCustodyRelationshipId: "DOMESTIC-REL-0000000000000001",
      protectedCustodyRelationshipId: "DOMESTIC-REL-0000000000000002",
      protectedGroupId: "GOAT-HERD-guardian-signal-test",
      role: "guardian",
      worksiteId: "DOMESTIC-PEN-guardian-signal-test",
      dutyArea: { center: position(), radiusUnits: 6_000 },
      createdAtTick: 0,
    }],
  });
}

function perception(input: Readonly<{
  tick?: number;
  id?: string;
  channel?: "vision" | "hearing";
  perceivedClass?: string;
  subjectId?: string | null;
  identification?: "anonymous" | "identified";
  radiusUnits?: number;
}> = {}): ActorPerceptionState {
  const tick = input.tick ?? 1;
  const observation = createActorObservation({
    id: input.id ?? "OBS-guardian-alarm",
    observerId: WORKER_ID,
    observedAtTick: tick,
    channel: input.channel ?? "hearing",
    perceivedClass: input.perceivedClass ?? "herd-alarm",
    subjectId: input.subjectId ?? null,
    area: { center: position(), radiusUnits: input.radiusUnits ?? 500 },
    confidence: 900_000,
    salience: 900_000,
    identification: input.identification ?? "anonymous",
    interrupt: "strong",
  });
  if (observation === null) throw new Error("Guardian test observation was invalid");
  const advanced = stepActorPerception(createActorPerceptionState(WORKER_ID, tick - 1), {
    tick,
    observations: [observation],
  });
  if (advanced === null) throw new Error("Guardian test perception did not advance");
  return advanced;
}

function quietPerception(actorId: string, tick: number): ActorPerceptionState {
  const advanced = stepActorPerception(createActorPerceptionState(actorId, tick - 1), {
    tick,
    observations: [],
  });
  if (advanced === null) throw new Error("Guardian test quiet perception did not advance");
  return advanced;
}

function committedInvestigation(
  workerPerception: ActorPerceptionState,
): SettlementWorkingAnimalState {
  const initial = initialState();
  const assignment = initial.assignments[0]!;
  const stagedActivity = stageSettlementWorkingAnimalActivity(initial, {
    assignmentId: assignment.assignmentId,
    tick: workerPerception.tick,
    perception: workerPerception,
    welfare: ZERO_WELFARE,
    accessibility: ALL_ACCESSIBLE,
    actorDisposition: AVAILABLE_FOR_WORK,
    workerInsideDutyArea: true,
  });
  if (stagedActivity?.transaction === null || stagedActivity === null) {
    throw new Error("Guardian investigation activity was not staged");
  }
  const resolvedActivity = resolveSettlementWorkingAnimalActivity(
    stagedActivity.state,
    stagedActivity.transaction,
  );
  if (resolvedActivity === null) throw new Error("Guardian investigation was not committed");

  const stagedTask = stageSettlementWorkingAnimalTaskLifecycle(resolvedActivity.state, {
    assignmentId: assignment.assignmentId,
    tick: workerPerception.tick,
    workerPosition: position(23_000, 24_000),
    handlerPosition: position(24_000, 24_000),
    workerPerception,
    handlerPerception: quietPerception(HANDLER_ID, workerPerception.tick),
    welfare: ZERO_WELFARE,
    actorDisposition: AVAILABLE_FOR_WORK,
    handlerDisposition: { kind: "continue" },
  });
  if (stagedTask?.transaction === null || stagedTask === null) {
    throw new Error("Guardian investigation task was not staged");
  }
  const resolvedTask = resolveSettlementWorkingAnimalTaskLifecycle(
    stagedTask.state,
    stagedTask.transaction,
  );
  if (resolvedTask === null) throw new Error("Guardian investigation task was not committed");
  return resolvedTask.state;
}

function handlerReportInvestigation(): SettlementWorkingAnimalState {
  const initial = initialState();
  const assignment = initial.assignments[0]!;
  const report = createSettlementWorkingAnimalHandlerSearchReport({
    assignmentId: assignment.assignmentId,
    handlerActorId: assignment.handlerActorId,
    knownAtTick: 1,
    sourceReferenceId: "RECOVERY-NOTICE-handler-report",
    knownArea: { center: position(), radiusUnits: 500 },
  });
  if (report === null) throw new Error("Guardian handler report was not created");
  const stagedActivity = stageSettlementWorkingAnimalSearchFromHandlerReport(initial, {
    tick: 1,
    report,
    welfare: ZERO_WELFARE,
    accessibility: ALL_ACCESSIBLE,
    actorDisposition: AVAILABLE_FOR_WORK,
    workerInsideDutyArea: true,
  });
  if (stagedActivity?.transaction === null || stagedActivity === null) {
    throw new Error("Handler-report investigation activity was not staged");
  }
  const resolvedActivity = resolveSettlementWorkingAnimalActivity(
    stagedActivity.state,
    stagedActivity.transaction,
  );
  if (resolvedActivity === null) throw new Error("Handler-report investigation was not committed");
  const stagedTask = stageSettlementWorkingAnimalTaskLifecycle(resolvedActivity.state, {
    assignmentId: assignment.assignmentId,
    tick: 1,
    workerPosition: position(),
    handlerPosition: position(),
    workerPerception: quietPerception(WORKER_ID, 1),
    handlerPerception: quietPerception(HANDLER_ID, 1),
    welfare: ZERO_WELFARE,
    actorDisposition: AVAILABLE_FOR_WORK,
    handlerDisposition: { kind: "continue" },
  });
  if (stagedTask?.transaction === null || stagedTask === null) {
    throw new Error("Handler-report investigation task was not staged");
  }
  const resolvedTask = resolveSettlementWorkingAnimalTaskLifecycle(
    stagedTask.state,
    stagedTask.transaction,
  );
  if (resolvedTask === null) throw new Error("Handler-report investigation task was not committed");
  return resolvedTask.state;
}

function query(
  state: unknown,
  workerPerception: unknown,
  workerActorId = WORKER_ID,
  activityTransactionId = (state as SettlementWorkingAnimalState).assignments[0]!
    .currentActivity.transactionId,
  acceptedAtTick = 1,
) {
  return settlementGuardianAlarmInvestigation(
    state,
    workerPerception,
    workerActorId,
    activityTransactionId,
    acceptedAtTick,
  );
}

describe("settlement guardian alarm investigation query", () => {
  it("authenticates one fresh anonymous heard alarm and its committed investigation task", () => {
    const workerPerception = perception();
    const state = committedInvestigation(workerPerception);
    const result = query(state, workerPerception);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      assignment: { workerActorId: WORKER_ID, role: "guardian" },
      activity: {
        activity: "investigate",
        acceptedAtTick: 1,
        cause: { kind: "perception", referenceId: "OBS-guardian-alarm" },
      },
      task: {
        phase: "investigating",
        openedAtTick: 1,
        sourceObservationId: "OBS-guardian-alarm",
      },
      belief: {
        sourceObservationId: "OBS-guardian-alarm",
        channel: "hearing",
        perceivedClass: "herd-alarm",
        subjectId: null,
        identification: "anonymous",
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects an investigation that originated in a handler report", () => {
    const state = handlerReportInvestigation();
    expect(query(state, quietPerception(WORKER_ID, 1))).toBeNull();
  });

  it("rejects identified or visual alarm evidence and a non-alarm threat cause", () => {
    const lawfulPerception = perception();
    const lawfulState = committedInvestigation(lawfulPerception);
    const identifiedAlarm = perception({
      channel: "vision",
      subjectId: "FOX-identified-alarm-source",
      identification: "identified",
      radiusUnits: 0,
    });
    const visualAlarm = perception({ channel: "vision" });
    expect(query(lawfulState, identifiedAlarm)).toBeNull();
    expect(query(lawfulState, visualAlarm)).toBeNull();

    const threatPerception = perception({
      id: "OBS-danger-sound",
      perceivedClass: "danger-sound",
    });
    const threatState = committedInvestigation(threatPerception);
    expect(query(threatState, threatPerception)).toBeNull();
  });

  it("rejects stale perception and mismatched task, assignment, transaction, or tick", () => {
    const freshPerception = perception();
    const state = committedInvestigation(freshPerception);
    const assignment = state.assignments[0]!;
    const stalePerception = stepActorPerception(freshPerception, {
      tick: 2,
      observations: [],
    });
    if (stalePerception === null) throw new Error("Guardian test perception did not age");

    expect(query(state, stalePerception)).toBeNull();
    expect(query(state, freshPerception, "D-different-guardian")).toBeNull();
    expect(query(state, freshPerception, WORKER_ID, "WORK-ACT-different")).toBeNull();
    expect(query(
      state,
      freshPerception,
      WORKER_ID,
      assignment.currentActivity.transactionId,
      2,
    )).toBeNull();

    const mismatchedTaskState = {
      ...state,
      assignments: [{
        ...assignment,
        currentTask: {
          ...assignment.currentTask!,
          sourceActivityTransactionId: "WORK-ACT-different",
        },
      }],
    };
    expect(query(mismatchedTaskState, freshPerception)).toBeNull();
  });
});
