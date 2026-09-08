import { describe, expect, it } from "vitest";
import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS,
  SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES,
  SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
  SETTLEMENT_WORKING_ANIMALS_VERSION,
  SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
  SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
  SETTLEMENT_WORKING_ANIMAL_GUARDIAN_SIGNAL_THRESHOLD,
  PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
  PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION,
  PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
  adoptSettlementWorkingAnimalStateV1,
  canonicalizeSettlementWorkingAnimalAssignment,
  canonicalizeSettlementWorkingAnimalState,
  createSettlementWorkingAnimalHandlerSearchReport,
  createSettlementWorkingAnimalState,
  decideSettlementWorkingAnimalActivity,
  deriveSettlementWorkingAnimalTaskSearchProbe,
  deserializeSettlementWorkingAnimalState,
  recoverPendingSettlementWorkingAnimalActivity,
  recoverPendingSettlementWorkingAnimalTaskLifecycle,
  resolveSettlementWorkingAnimalActivity,
  resolveSettlementWorkingAnimalTaskLifecycle,
  serializeSettlementWorkingAnimalState,
  settlementWorkingAnimalReturnArea,
  stageSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalSearchFromHandlerReport,
  stageSettlementWorkingAnimalTaskLifecycle,
  type CreateSettlementWorkingAnimalAssignmentInput,
  type SettlementWorkingAnimalActivityAccessibility,
  type SettlementWorkingAnimalState,
  type SettlementWorkingAnimalWelfareState,
} from "./settlementWorkingAnimals";
import {
  REGION_WIDTH_UNITS,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

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

function position(
  regionX = 0,
  regionY = 0,
  localX = 24_000,
  localY = 24_000,
): WorldPosition {
  return createWorldPosition(createRegionCoord(regionX, regionY), localX, localY);
}

function relationship(ordinal: number): string {
  return `DOMESTIC-REL-${ordinal.toString(16).padStart(16, "0")}`;
}

function assignmentInput(
  ordinal = 0,
  center = position(),
): CreateSettlementWorkingAnimalAssignmentInput {
  return Object.freeze({
    assignmentOrdinal: ordinal,
    workerActorId: `D-test-guardian-${ordinal}`,
    workerSpecies: "domestic-dog",
    handlerActorId: "H-test-keeper",
    workerCustodyRelationshipId: relationship(ordinal + 1),
    protectedCustodyRelationshipId: relationship(0xa0),
    protectedGroupId: "GOAT-HERD-test-paddock",
    role: "guardian",
    worksiteId: "DOMESTIC-PEN-test-paddock",
    dutyArea: Object.freeze({ center, radiusUnits: 6_000 }),
    createdAtTick: 0,
  });
}

function stateAt(center = position()): SettlementWorkingAnimalState {
  return createSettlementWorkingAnimalState({
    settlementId: 1,
    assignments: [assignmentInput(0, center)],
  });
}

function perceptionWithObservation(
  actorId: string,
  input: Readonly<{
    readonly tick?: number;
    readonly id?: string;
    readonly channel?: "vision" | "hearing";
    readonly perceivedClass?: string;
    readonly subjectId?: string | null;
    readonly center?: WorldPosition;
    readonly radiusUnits?: number;
    readonly confidence?: number;
    readonly salience?: number;
    readonly identification?: "anonymous" | "identified";
  }> = {},
): ActorPerceptionState {
  const tick = input.tick ?? 1;
  const channel = input.channel ?? "hearing";
  const subjectId = input.subjectId ?? null;
  const identification = input.identification
    ?? (channel === "hearing" ? "anonymous" : subjectId === null ? "anonymous" : "identified");
  const observation = createActorObservation({
    id: input.id ?? "OBS-herd-alarm",
    observerId: actorId,
    observedAtTick: tick,
    channel,
    perceivedClass: input.perceivedClass ?? "herd-alarm",
    subjectId,
    area: {
      center: input.center ?? position(),
      radiusUnits: input.radiusUnits ?? (channel === "hearing" ? 500 : 0),
    },
    confidence: input.confidence ?? 900_000,
    salience: input.salience ?? 900_000,
    identification,
    interrupt: "strong",
  });
  if (observation === null) throw new Error("Test observation was malformed");
  const perception = stepActorPerception(createActorPerceptionState(actorId, tick - 1), {
    tick,
    observations: [observation],
  });
  if (perception === null) throw new Error("Test cognition did not advance");
  return perception;
}

function quietPerception(actorId: string, tick: number): ActorPerceptionState {
  if (tick === 0) return createActorPerceptionState(actorId, 0);
  const result = stepActorPerception(createActorPerceptionState(actorId, 0), {
    tick,
    observations: [],
  });
  if (result === null) throw new Error("Test cognition did not advance");
  return result;
}

function identifiedVision(
  observerId: string,
  subjectId: string,
  subjectPosition: WorldPosition,
  tick: number,
  id: string,
): ActorPerceptionState {
  return perceptionWithObservation(observerId, {
    tick,
    id,
    channel: "vision",
    perceivedClass: "known-actor",
    subjectId,
    center: subjectPosition,
    radiusUnits: 0,
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: ACTOR_PERCEPTION_SCALE,
    identification: "identified",
  });
}

function agePerception(
  perception: ActorPerceptionState,
  tick: number,
): ActorPerceptionState {
  const aged = stepActorPerception(perception, { tick, observations: [] });
  if (aged === null) throw new Error("Test cognition did not age");
  return aged;
}

function commitInvestigation(
  initial: SettlementWorkingAnimalState,
  tick = 1,
): Readonly<{
  readonly state: SettlementWorkingAnimalState;
  readonly perception: ActorPerceptionState;
}> {
  const assignment = initial.assignments[0]!;
  const perception = perceptionWithObservation(assignment.workerActorId, { tick });
  const staged = stageSettlementWorkingAnimalActivity(initial, {
    assignmentId: assignment.assignmentId,
    tick,
    perception,
    welfare: ZERO_WELFARE,
    accessibility: ALL_ACCESSIBLE,
    actorDisposition: AVAILABLE_FOR_WORK,
    workerInsideDutyArea: true,
  });
  if (staged?.transaction === null || staged === null) {
    throw new Error("Investigation was not staged");
  }
  const resolved = resolveSettlementWorkingAnimalActivity(staged.state, staged.transaction);
  if (resolved === null) throw new Error("Investigation was not committed");
  return Object.freeze({ state: resolved.state, perception });
}

function openTask(
  investigating: SettlementWorkingAnimalState,
  workerPerception: ActorPerceptionState,
  tick = 1,
  workerPosition = position(0, 0, 18_000, 18_000),
): SettlementWorkingAnimalState {
  const assignment = investigating.assignments[0]!;
  const staged = stageSettlementWorkingAnimalTaskLifecycle(investigating, {
    assignmentId: assignment.assignmentId,
    tick,
    workerPosition,
    handlerPosition: position(0, 0, 20_000, 20_000),
    workerPerception,
    handlerPerception: quietPerception(assignment.handlerActorId, tick),
    welfare: ZERO_WELFARE,
    actorDisposition: AVAILABLE_FOR_WORK,
    handlerDisposition: { kind: "continue" },
  });
  if (staged?.transaction === null || staged === null) throw new Error("Task was not staged");
  const resolved = resolveSettlementWorkingAnimalTaskLifecycle(staged.state, staged.transaction);
  if (resolved === null) throw new Error("Task was not committed");
  return resolved.state;
}

function priorV1State(value: SettlementWorkingAnimalState): unknown {
  return {
    ...value,
    version: PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION,
    ownerId: PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
    assignments: value.assignments.map((assignment) => {
      const {
        lastTaskOrdinal: _lastTaskOrdinal,
        lastResolvedTaskTransitionOrdinal: _lastResolvedTaskTransitionOrdinal,
        currentTask: _currentTask,
        lastTaskOutcome: _lastTaskOutcome,
        pendingTaskTransition: _pendingTaskTransition,
        ...prior
      } = assignment;
      return {
        ...prior,
        version: PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
      };
    }),
  };
}

describe("settlement working-animal authority", () => {
  it("opens a bounded investigation from a handler report without inventing a threat", () => {
    const initial = stateAt(position(0, 0, 1_000, 24_000));
    const assignment = initial.assignments[0]!;
    const knownArea = Object.freeze({
      center: position(-1, 0, REGION_WIDTH_UNITS - 1_000, 24_000),
      radiusUnits: 0,
    });
    const report = createSettlementWorkingAnimalHandlerSearchReport({
      assignmentId: assignment.assignmentId,
      handlerActorId: assignment.handlerActorId,
      knownAtTick: 1,
      sourceReferenceId: "RECOVERY-NOTICE-handler-saw-goat",
      knownArea,
    });
    expect(report).not.toBeNull();
    if (report === null) throw new Error("Handler report was not created");

    const staged = stageSettlementWorkingAnimalSearchFromHandlerReport(initial, {
      tick: 1,
      report,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });
    expect(staged?.transaction).toMatchObject({
      activity: "investigate",
      acceptedAtTick: 1,
      cause: { kind: "handler-report", referenceId: report.reportId },
      perceivedArea: knownArea,
    });
    expect(stageSettlementWorkingAnimalSearchFromHandlerReport(staged?.state, {
      tick: 1,
      report,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    })).toMatchObject({
      reusedPendingTransaction: true,
      transaction: staged?.transaction,
    });
    if (staged?.transaction === null || staged === null) {
      throw new Error("Handler report did not stage an activity");
    }
    const accepted = resolveSettlementWorkingAnimalActivity(staged.state, staged.transaction);
    expect(accepted?.activity.cause.kind).toBe("handler-report");
    if (accepted === null) throw new Error("Handler report activity did not resolve");

    const taskStage = stageSettlementWorkingAnimalTaskLifecycle(accepted.state, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      workerPosition: assignment.dutyArea.center,
      handlerPosition: assignment.dutyArea.center,
      workerPerception: quietPerception(assignment.workerActorId, 1),
      handlerPerception: quietPerception(assignment.handlerActorId, 1),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    if (taskStage?.transaction === null || taskStage === null) {
      throw new Error("Handler report did not stage a task");
    }
    const task = resolveSettlementWorkingAnimalTaskLifecycle(
      taskStage.state,
      taskStage.transaction,
    );
    expect(task?.state.assignments[0]?.currentTask).toMatchObject({
      phase: "investigating",
      sourceObservationId: report.reportId,
      perceivedArea: knownArea,
      searchProbe: { sourceArea: knownArea },
    });
    expect(task?.state.assignments[0]?.currentTask?.sourceObservationId)
      .not.toBe("OBS-herd-alarm");
  });

  it("derives stable immutable assignments and canonical bytes independent of input order", () => {
    const left = createSettlementWorkingAnimalState({
      settlementId: 7,
      assignments: [assignmentInput(1), assignmentInput(0)],
    });
    const right = createSettlementWorkingAnimalState({
      settlementId: 7,
      assignments: [assignmentInput(0), assignmentInput(1)],
    });

    expect(serializeSettlementWorkingAnimalState(left)).toBe(
      serializeSettlementWorkingAnimalState(right),
    );
    expect(left.assignments.map(({ assignmentOrdinal }) => assignmentOrdinal)).toEqual([0, 1]);
    expect(left.assignments[0]?.assignmentId).toMatch(/^WORK-ASSIGN-[0-9a-f]{16}$/u);
    expect(left.assignments[0]?.currentActivity).toMatchObject({
      version: SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
      ordinal: 0,
      activity: "watch",
      acceptedAtTick: 0,
      perceivedArea: null,
    });
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(left.assignments)).toBe(true);
    expect(Object.isFrozen(left.assignments[0]?.dutyArea)).toBe(true);

    const encoded = serializeSettlementWorkingAnimalState(left);
    expect(deserializeSettlementWorkingAnimalState(encoded)).toEqual(left);
    expect(deserializeSettlementWorkingAnimalState(`\n${encoded}`)).toBeNull();
  });

  it("adopts the sealed v1 relationship root without changing assignment or activity identity", () => {
    const initial = stateAt();
    const assignment = initial.assignments[0]!;
    const staged = stageSettlementWorkingAnimalActivity(initial, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      perception: perceptionWithObservation(assignment.workerActorId),
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });
    const prior = priorV1State(staged!.state);
    const adopted = adoptSettlementWorkingAnimalStateV1(prior);

    expect(adopted).toMatchObject({
      version: SETTLEMENT_WORKING_ANIMALS_VERSION,
      ownerId: SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
      revision: staged!.state.revision,
    });
    expect(adopted?.assignments[0]).toMatchObject({
      version: SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
      assignmentId: assignment.assignmentId,
      currentActivity: assignment.currentActivity,
      pendingActivity: staged!.transaction,
      lastTaskOrdinal: 0,
      lastResolvedTaskTransitionOrdinal: 0,
      currentTask: null,
      lastTaskOutcome: null,
      pendingTaskTransition: null,
    });
    expect(adoptSettlementWorkingAnimalStateV1(adopted)).toEqual(adopted);
    expect(adoptSettlementWorkingAnimalStateV1({
      ...(prior as Readonly<Record<string, unknown>>),
      revision: 99,
    })).toBeNull();
  });

  it("turns a lawful anonymous herd alarm in the protected duty area into investigation", () => {
    const state = stateAt();
    const assignment = state.assignments[0]!;
    const perception = perceptionWithObservation(assignment.workerActorId);
    const decision = decideSettlementWorkingAnimalActivity({
      assignment,
      tick: 1,
      perception,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });

    expect(decision).toEqual({
      version: SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
      assignmentId: assignment.assignmentId,
      workerActorId: assignment.workerActorId,
      activity: "investigate",
      decidedAtTick: 1,
      cause: { kind: "perception", referenceId: "OBS-herd-alarm" },
      perceivedArea: { center: position(), radiusUnits: 500 },
    });
    // The work owner receives an anonymous area, not a magical group member or threat identity.
    expect(JSON.stringify(decision)).not.toContain("subjectId");
    expect(JSON.stringify(decision)).not.toContain("targetActorId");

    const farAlarm = perceptionWithObservation(assignment.workerActorId, {
      center: position(2, 0),
    });
    expect(decideSettlementWorkingAnimalActivity({
      assignment,
      tick: 1,
      perception: farAlarm,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    })?.activity).toBe("watch");
  });

  it("copies only lawful large-predator evidence and never its identified actor into work state", () => {
    const state = stateAt();
    const assignment = state.assignments[0]!;
    const perception = perceptionWithObservation(assignment.workerActorId, {
      id: "OBS-large-predator-pressure",
      channel: "vision",
      perceivedClass: "large-predator",
      subjectId: "BEAR-secret-subject",
      identification: "identified",
      radiusUnits: 0,
    });
    const staged = stageSettlementWorkingAnimalActivity(state, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      perception,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });

    expect(staged?.transaction?.activity).toBe("investigate");
    expect(staged?.transaction?.cause).toEqual({
      kind: "perception",
      referenceId: "OBS-large-predator-pressure",
    });
    const encoded = serializeSettlementWorkingAnimalState(staged!.state);
    expect(encoded).not.toContain("BEAR-secret-subject");
    expect(encoded).not.toContain("subjectId");
    expect(encoded).not.toContain("targetActorId");
    expect(encoded).not.toContain("targetPosition");
  });

  it("uses one assignment-authenticated probe for preflight and persisted task opening", () => {
    const initial = stateAt();
    const assignment = initial.assignments[0]!;
    const perception = perceptionWithObservation(assignment.workerActorId);
    const stagedActivity = stageSettlementWorkingAnimalActivity(initial, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      perception,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });
    const stagedAssignment = stagedActivity!.state.assignments[0]!;
    const preflightProbe = deriveSettlementWorkingAnimalTaskSearchProbe(
      stagedAssignment,
      stagedActivity!.transaction,
    );
    expect(preflightProbe).not.toBeNull();
    // The same valid transaction is not authoritative in the pre-stage state.
    expect(deriveSettlementWorkingAnimalTaskSearchProbe(
      assignment,
      stagedActivity!.transaction,
    )).toBeNull();
    expect(deriveSettlementWorkingAnimalTaskSearchProbe(
      assignment,
      assignment.currentActivity,
    )).toBeNull();
    expect(deriveSettlementWorkingAnimalTaskSearchProbe(stagedAssignment, {
      ...stagedActivity!.transaction!,
      acceptedAtTick: 2,
    })).toBeNull();

    const committed = resolveSettlementWorkingAnimalActivity(
      stagedActivity!.state,
      stagedActivity!.transaction,
    )!.state;
    const opened = openTask(committed, perception);
    expect(opened.assignments[0]?.currentTask?.searchProbe).toEqual(preflightProbe);
  });

  it("opens one bounded task from committed evidence and retains its opaque probe after belief decay", () => {
    const initial = stateAt();
    const committed = commitInvestigation(initial);
    const assignment = committed.state.assignments[0]!;
    const staged = stageSettlementWorkingAnimalTaskLifecycle(committed.state, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      workerPosition: position(0, 0, 18_000, 18_000),
      handlerPosition: position(0, 0, 20_000, 20_000),
      workerPerception: committed.perception,
      handlerPerception: quietPerception(assignment.handlerActorId, 1),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    expect(staged).toMatchObject({ staged: true, reusedPendingTransaction: false });
    expect(staged?.transaction).toMatchObject({ transition: "open", taskOrdinal: 1 });
    const reloaded = deserializeSettlementWorkingAnimalState(
      serializeSettlementWorkingAnimalState(staged!.state),
    );
    const recovered = recoverPendingSettlementWorkingAnimalTaskLifecycle(
      reloaded,
      assignment.assignmentId,
    );
    expect(recovered).toMatchObject({ applied: true });
    const task = recovered?.state.assignments[0]?.currentTask;
    expect(task).toMatchObject({
      phase: "investigating",
      outcome: null,
      sourceObservationId: "OBS-herd-alarm",
      perceivedArea: { center: position(), radiusUnits: 500 },
      searchProbe: { probeOrdinal: 0, probeArea: { center: position(), radiusUnits: 0 } },
    });
    const encoded = serializeSettlementWorkingAnimalState(recovered!.state);
    expect(encoded).not.toContain("targetActorId");
    expect(encoded).not.toContain("subjectId");
    expect(task?.searchProbe.beliefKey).toMatch(/^contact:work:[0-9a-f]{16}$/u);

    const retained = decideSettlementWorkingAnimalActivity({
      assignment: recovered!.state.assignments[0]!,
      tick: 2,
      perception: quietPerception(assignment.workerActorId, 2),
      welfare: ZERO_WELFARE,
      accessibility: { watch: true, investigate: false, return: false },
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: false,
    });
    expect(retained).toMatchObject({
      activity: "investigate",
      cause: { kind: "perception", referenceId: "OBS-herd-alarm" },
      perceivedArea: task?.perceivedArea,
    });
  });

  it("suspends for actor and welfare authority without laundering either into completion", () => {
    const committed = commitInvestigation(stateAt());
    let state = openTask(committed.state, committed.perception);
    const assignmentId = state.assignments[0]!.assignmentId;
    const workerId = state.assignments[0]!.workerActorId;
    const handlerId = state.assignments[0]!.handlerActorId;
    const probe = state.assignments[0]!.currentTask!.searchProbe.probeArea.center;

    const steps = [
      {
        tick: 2,
        welfare: ZERO_WELFARE,
        actorDisposition: {
          kind: "defer-to-actor" as const,
          referenceId: "actor-intent:retreat",
        },
        transition: "suspend",
        suspension: { kind: "actor-disposition", referenceId: "actor-intent:retreat" },
      },
      {
        tick: 3,
        welfare: { ...ZERO_WELFARE, coldPressure: 800_000 },
        actorDisposition: AVAILABLE_FOR_WORK,
        transition: "suspend",
        suspension: { kind: "welfare", referenceId: "welfare:cold-pressure" },
      },
      {
        tick: 4,
        welfare: ZERO_WELFARE,
        actorDisposition: AVAILABLE_FOR_WORK,
        transition: "resume",
        suspension: null,
      },
      {
        tick: 5,
        welfare: ZERO_WELFARE,
        actorDisposition: AVAILABLE_FOR_WORK,
        transition: "complete",
        suspension: null,
      },
    ] as const;

    for (const step of steps) {
      const staged = stageSettlementWorkingAnimalTaskLifecycle(state, {
        assignmentId,
        tick: step.tick,
        workerPosition: probe,
        handlerPosition: position(0, 0, 20_000, 20_000),
        workerPerception: quietPerception(workerId, step.tick),
        handlerPerception: quietPerception(handlerId, step.tick),
        welfare: step.welfare,
        actorDisposition: step.actorDisposition,
        handlerDisposition: { kind: "continue" },
      });
      expect(staged?.transaction?.transition).toBe(step.transition);
      const resolved = resolveSettlementWorkingAnimalTaskLifecycle(
        staged!.state,
        staged!.transaction,
      );
      state = resolved!.state;
      expect(state.assignments[0]?.currentTask?.suspension).toEqual(step.suspension);
      if (step.transition !== "complete") {
        expect(state.assignments[0]?.currentTask?.outcome).toBeNull();
      }
    }
    expect(state.assignments[0]?.currentTask).toMatchObject({
      phase: "returning",
      outcome: "completed",
    });
  });

  it("requires reciprocal current sight to cancel, then physical return and handler sight to close", () => {
    const committed = commitInvestigation(stateAt());
    let state = openTask(committed.state, committed.perception);
    const assignment = state.assignments[0]!;
    const workerAway = position(0, 0, 31_000, 31_000);
    const handlerAway = position(0, 0, 30_000, 30_000);

    const oneWay = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 2,
      workerPosition: workerAway,
      handlerPosition: handlerAway,
      workerPerception: quietPerception(assignment.workerActorId, 2),
      handlerPerception: identifiedVision(
        assignment.handlerActorId,
        assignment.workerActorId,
        workerAway,
        2,
        "OBS-handler-sees-worker",
      ),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "recall", referenceId: "handler-intent:recall" },
    });
    expect(oneWay).toMatchObject({ staged: false, transaction: null });

    const staleWorkerSight = agePerception(identifiedVision(
      assignment.workerActorId,
      assignment.handlerActorId,
      handlerAway,
      2,
      "OBS-worker-old-sight",
    ), 3);
    const staleHandlerSight = agePerception(identifiedVision(
      assignment.handlerActorId,
      assignment.workerActorId,
      workerAway,
      2,
      "OBS-handler-old-sight",
    ), 3);
    expect(stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 3,
      workerPosition: workerAway,
      handlerPosition: handlerAway,
      workerPerception: staleWorkerSight,
      handlerPerception: staleHandlerSight,
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "recall", referenceId: "handler-intent:recall" },
    })).toMatchObject({ staged: false, transaction: null });

    const cancellation = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 3,
      workerPosition: workerAway,
      handlerPosition: handlerAway,
      workerPerception: identifiedVision(
        assignment.workerActorId,
        assignment.handlerActorId,
        handlerAway,
        3,
        "OBS-worker-sees-handler",
      ),
      handlerPerception: identifiedVision(
        assignment.handlerActorId,
        assignment.workerActorId,
        workerAway,
        3,
        "OBS-handler-sees-worker-3",
      ),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "recall", referenceId: "handler-intent:recall" },
    });
    expect(cancellation?.transaction).toMatchObject({
      transition: "cancel",
      cause: {
        kind: "handler-recall",
        workerObservationId: "OBS-worker-sees-handler",
        handlerObservationId: "OBS-handler-sees-worker-3",
      },
    });
    const cancelled = resolveSettlementWorkingAnimalTaskLifecycle(
      cancellation!.state,
      cancellation!.transaction,
    );
    state = cancelled!.state;
    expect(state.assignments[0]?.currentTask).toMatchObject({
      phase: "returning",
      outcome: "cancelled",
    });

    const returnArea = settlementWorkingAnimalReturnArea(state.assignments[0]);
    expect(returnArea).toEqual({ center: position(), radiusUnits: 1_000 });
    const justOutside = position(0, 0, position().localX + 1_001, position().localY);
    expect(stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 4,
      workerPosition: justOutside,
      handlerPosition: handlerAway,
      workerPerception: quietPerception(assignment.workerActorId, 4),
      handlerPerception: quietPerception(assignment.handlerActorId, 4),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    })).toMatchObject({ staged: false, transaction: null });

    const arrival = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 5,
      workerPosition: returnArea!.center,
      handlerPosition: handlerAway,
      workerPerception: quietPerception(assignment.workerActorId, 5),
      handlerPerception: quietPerception(assignment.handlerActorId, 5),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    expect(arrival?.transaction?.transition).toBe("arrive");
    state = resolveSettlementWorkingAnimalTaskLifecycle(
      arrival!.state,
      arrival!.transaction,
    )!.state;
    expect(state.assignments[0]?.currentTask?.phase).toBe("awaiting-handler");

    const arrivedTask = state.assignments[0]!.currentTask!;
    const { transactionId: _arrivalTransactionId, ...arrivalFields } =
      arrivedTask.lastTransition;
    const forgedArrivalFields = {
      ...arrivalFields,
      cause: { kind: "worksite" as const, referenceId: "DOMESTIC-PEN-forged" },
    };
    const forgedArrival = {
      ...forgedArrivalFields,
      transactionId: `WORK-TASK-TX-${hashCanonical(forgedArrivalFields)}`,
    };
    expect(canonicalizeSettlementWorkingAnimalState({
      ...state,
      assignments: [{
        ...state.assignments[0]!,
        currentTask: { ...arrivedTask, lastTransition: forgedArrival },
      }],
    })).toBeNull();

    expect(stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 6,
      workerPosition: returnArea!.center,
      handlerPosition: handlerAway,
      workerPerception: quietPerception(assignment.workerActorId, 6),
      handlerPerception: quietPerception(assignment.handlerActorId, 6),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    })).toMatchObject({ staged: false, transaction: null });

    const acknowledgement = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 7,
      workerPosition: returnArea!.center,
      handlerPosition: handlerAway,
      workerPerception: quietPerception(assignment.workerActorId, 7),
      handlerPerception: identifiedVision(
        assignment.handlerActorId,
        assignment.workerActorId,
        returnArea!.center,
        7,
        "OBS-handler-acknowledges-worker",
      ),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    expect(acknowledgement?.transaction?.transition).toBe("acknowledge");
    const closed = resolveSettlementWorkingAnimalTaskLifecycle(
      acknowledgement!.state,
      acknowledgement!.transaction,
    );
    expect(closed?.state.assignments[0]).toMatchObject({
      currentTask: null,
      lastTaskOutcome: { phase: "closed", outcome: "cancelled", closedAtTick: 7 },
    });
    const closedAssignment = closed!.state.assignments[0]!;
    expect(canonicalizeSettlementWorkingAnimalState({
      ...closed!.state,
      assignments: [{
        ...closedAssignment,
        lastTaskOutcome: {
          ...closedAssignment.lastTaskOutcome!,
          sourceObservationId: "OBS-forged-provenance",
        },
      }],
    })).toBeNull();
    const { transactionId: _closedArrivalId, ...closedArrivalFields } =
      closedAssignment.lastTaskOutcome!.arrivalTransition;
    const forgedClosedArrivalFields = {
      ...closedArrivalFields,
      cause: { kind: "worksite" as const, referenceId: "DOMESTIC-PEN-forged" },
    };
    expect(canonicalizeSettlementWorkingAnimalState({
      ...closed!.state,
      assignments: [{
        ...closedAssignment,
        lastTaskOutcome: {
          ...closedAssignment.lastTaskOutcome!,
          arrivalTransition: {
            ...forgedClosedArrivalFields,
            transactionId: `WORK-TASK-TX-${hashCanonical(forgedClosedArrivalFields)}`,
          },
        },
      }],
    })).toBeNull();
    expect(resolveSettlementWorkingAnimalTaskLifecycle(
      closed!.state,
      acknowledgement!.transaction,
    )).toMatchObject({ applied: false, state: closed?.state });
    expect(recoverPendingSettlementWorkingAnimalTaskLifecycle(
      closed!.state,
      assignment.assignmentId,
    )).toMatchObject({ applied: false, transition: null });
  });

  it("resumes physical return when welfare moves an unacknowledged worker away", () => {
    const committed = commitInvestigation(stateAt());
    let state = openTask(committed.state, committed.perception);
    let assignment = state.assignments[0]!;
    const completed = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 2,
      workerPosition: assignment.currentTask!.searchProbe.probeArea.center,
      handlerPosition: position(0, 0, 20_000, 20_000),
      workerPerception: quietPerception(assignment.workerActorId, 2),
      handlerPerception: quietPerception(assignment.handlerActorId, 2),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    state = resolveSettlementWorkingAnimalTaskLifecycle(
      completed!.state,
      completed!.transaction,
    )!.state;
    assignment = state.assignments[0]!;
    const returnArea = settlementWorkingAnimalReturnArea(assignment)!;
    const arrived = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 3,
      workerPosition: returnArea.center,
      handlerPosition: position(0, 0, 20_000, 20_000),
      workerPerception: quietPerception(assignment.workerActorId, 3),
      handlerPerception: quietPerception(assignment.handlerActorId, 3),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    state = resolveSettlementWorkingAnimalTaskLifecycle(
      arrived!.state,
      arrived!.transaction,
    )!.state;
    expect(state.assignments[0]?.currentTask?.phase).toBe("awaiting-handler");

    assignment = state.assignments[0]!;
    const shelter = stageSettlementWorkingAnimalActivity(state, {
      assignmentId: assignment.assignmentId,
      tick: 4,
      perception: quietPerception(assignment.workerActorId, 4),
      welfare: { ...ZERO_WELFARE, coldPressure: 700_000 },
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });
    expect(shelter?.decision.activity).toBe("survival-override");
    state = resolveSettlementWorkingAnimalActivity(
      shelter!.state,
      shelter!.transaction,
    )!.state;

    assignment = state.assignments[0]!;
    const recovered = stageSettlementWorkingAnimalActivity(state, {
      assignmentId: assignment.assignmentId,
      tick: 5,
      perception: quietPerception(assignment.workerActorId, 5),
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      // Runtime evaluates this against the narrow return area while the
      // outcome is awaiting acknowledgement.
      workerInsideDutyArea: false,
    });
    expect(recovered?.decision.activity).toBe("return");
    state = resolveSettlementWorkingAnimalActivity(
      recovered!.state,
      recovered!.transaction,
    )!.state;

    assignment = state.assignments[0]!;
    const acknowledged = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 6,
      workerPosition: returnArea.center,
      handlerPosition: position(0, 0, 20_000, 20_000),
      workerPerception: quietPerception(assignment.workerActorId, 6),
      handlerPerception: identifiedVision(
        assignment.handlerActorId,
        assignment.workerActorId,
        returnArea.center,
        6,
        "OBS-handler-after-welfare-return",
      ),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    expect(acknowledged?.transaction?.transition).toBe("acknowledge");
    const closed = resolveSettlementWorkingAnimalTaskLifecycle(
      acknowledged!.state,
      acknowledged!.transaction,
    );
    expect(closed?.state.assignments[0]).toMatchObject({
      currentTask: null,
      lastTaskOutcome: { outcome: "completed", closedAtTick: 6 },
    });
    const closedAssignment = closed!.state.assignments[0]!;
    const { transactionId: _outcomeId, ...outcomeFields } =
      closedAssignment.lastTaskOutcome!.outcomeTransition;
    const forgedOutcomeFields = {
      ...outcomeFields,
      cause: { kind: "probe" as const, referenceId: "living-probe:forged" },
    };
    expect(canonicalizeSettlementWorkingAnimalState({
      ...closed!.state,
      assignments: [{
        ...closedAssignment,
        lastTaskOutcome: {
          ...closedAssignment.lastTaskOutcome!,
          outcomeTransition: {
            ...forgedOutcomeFields,
            transactionId: `WORK-TASK-TX-${hashCanonical(forgedOutcomeFields)}`,
          },
        },
      }],
    })).toBeNull();
  });

  it("lets injury, cold, exhaustion, and other survival pressure override duty", () => {
    const state = stateAt();
    const assignment = state.assignments[0]!;
    const perception = perceptionWithObservation(assignment.workerActorId);
    const cases = [
      ["injuryPressure", "welfare:injury-pressure"],
      ["coldPressure", "welfare:cold-pressure"],
      ["exhaustionPressure", "welfare:exhaustion-pressure"],
      ["thirstPressure", "welfare:thirst-pressure"],
    ] as const;

    for (const [field, referenceId] of cases) {
      const decision = decideSettlementWorkingAnimalActivity({
        assignment,
        tick: 1,
        perception,
        welfare: { ...ZERO_WELFARE, [field]: 800_000 },
        accessibility: ALL_ACCESSIBLE,
        actorDisposition: AVAILABLE_FOR_WORK,
        workerInsideDutyArea: true,
      });
      expect(decision).toMatchObject({
        activity: "survival-override",
        cause: { kind: "welfare", referenceId },
        perceivedArea: null,
      });
    }

    // Deterministic tie order is safety-first and does not depend on object key order.
    expect(decideSettlementWorkingAnimalActivity({
      assignment,
      tick: 1,
      perception,
      welfare: {
        ...ZERO_WELFARE,
        coldPressure: 800_000,
        injuryPressure: 800_000,
      },
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    })?.cause).toEqual({ kind: "welfare", referenceId: "welfare:injury-pressure" });
  });

  it("defers an assignment to the actor's own self-preservation without importing target truth", () => {
    const state = stateAt();
    const assignment = state.assignments[0]!;
    const perception = perceptionWithObservation(assignment.workerActorId, {
      id: "OBS-large-predator",
      channel: "vision",
      perceivedClass: "large-predator",
      subjectId: "BEAR-not-work-authority",
      identification: "identified",
      radiusUnits: 0,
    });
    const decision = decideSettlementWorkingAnimalActivity({
      assignment,
      tick: 1,
      perception,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: {
        kind: "defer-to-actor",
        referenceId: "actor-intent:retreat",
      },
      workerInsideDutyArea: true,
    });

    expect(decision).toEqual({
      version: SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
      assignmentId: assignment.assignmentId,
      workerActorId: assignment.workerActorId,
      activity: "defer-to-actor",
      decidedAtTick: 1,
      cause: { kind: "actor-disposition", referenceId: "actor-intent:retreat" },
      perceivedArea: null,
    });
    expect(JSON.stringify(decision)).not.toContain("BEAR-not-work-authority");
  });

  it("stages, survives serialization, commits once, and treats exact replay as inert", () => {
    const initial = stateAt();
    const assignment = initial.assignments[0]!;
    const perception = perceptionWithObservation(assignment.workerActorId);
    const staged = stageSettlementWorkingAnimalActivity(initial, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      perception,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });
    expect(staged).toMatchObject({ staged: true, reusedPendingTransaction: false });
    expect(staged?.state.revision).toBe(1);
    expect(staged?.transaction?.ordinal).toBe(1);

    const reloaded = deserializeSettlementWorkingAnimalState(
      serializeSettlementWorkingAnimalState(staged!.state),
    )!;
    const recovered = recoverPendingSettlementWorkingAnimalActivity(
      reloaded,
      assignment.assignmentId,
    );
    expect(recovered).toMatchObject({ applied: true });
    expect(recovered?.state.revision).toBe(2);
    expect(recovered?.state.assignments[0]?.currentActivity.activity).toBe("investigate");
    expect(recovered?.state.assignments[0]?.pendingActivity).toBeNull();

    const replay = resolveSettlementWorkingAnimalActivity(
      recovered!.state,
      staged!.transaction,
    );
    expect(replay).toMatchObject({ applied: false });
    expect(replay?.state).toEqual(recovered?.state);

    const forged = { ...staged!.transaction!, acceptedAtTick: 2 };
    expect(resolveSettlementWorkingAnimalActivity(recovered!.state, forged)).toBeNull();
  });

  it("returns to its relationship worksite after investigation and watches on arrival", () => {
    const initial = stateAt();
    const assignment = initial.assignments[0]!;
    const first = stageSettlementWorkingAnimalActivity(initial, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      perception: perceptionWithObservation(assignment.workerActorId),
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });
    const investigating = resolveSettlementWorkingAnimalActivity(
      first!.state,
      first!.transaction,
    )!.state;
    const returning = decideSettlementWorkingAnimalActivity({
      assignment: investigating.assignments[0]!,
      tick: 2,
      perception: quietPerception(assignment.workerActorId, 2),
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: false,
    });
    expect(returning).toMatchObject({
      activity: "return",
      cause: { kind: "assignment", referenceId: assignment.assignmentId },
    });

    expect(decideSettlementWorkingAnimalActivity({
      assignment: investigating.assignments[0]!,
      tick: 2,
      perception: quietPerception(assignment.workerActorId, 2),
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    })?.activity).toBe("watch");
  });

  it("rejects malformed shapes, identity changes, and duplicate authorities atomically", () => {
    const state = stateAt();
    const assignment = state.assignments[0]!;
    expect(canonicalizeSettlementWorkingAnimalState({ ...state, hiddenThreatId: "FOX" })).toBeNull();
    expect(canonicalizeSettlementWorkingAnimalAssignment({
      ...assignment,
      workerActorId: "D-forged",
    })).toBeNull();
    expect(canonicalizeSettlementWorkingAnimalAssignment({
      ...assignment,
      currentActivity: { ...assignment.currentActivity, targetActorId: "FOX" },
    })).toBeNull();
    expect(canonicalizeSettlementWorkingAnimalState({ ...state, revision: 99 })).toBeNull();

    expect(() => createSettlementWorkingAnimalState({
      settlementId: 1,
      assignments: [assignmentInput(0), { ...assignmentInput(1), workerActorId: "D-test-guardian-0" }],
    })).toThrow(/collide|incoherent/u);
    expect(() => createSettlementWorkingAnimalState({
      settlementId: 1,
      assignments: [assignmentInput(0), { ...assignmentInput(1), assignmentOrdinal: 0 }],
    })).toThrow(/collide|incoherent/u);
    expect(() => createSettlementWorkingAnimalState({
      settlementId: 1,
      assignments: [{
        ...assignmentInput(0),
        protectedCustodyRelationshipId: relationship(1),
      }],
    })).toThrow(/malformed/u);

    const wrongPerception = quietPerception("D-other-worker", 1);
    expect(decideSettlementWorkingAnimalActivity({
      assignment,
      tick: 1,
      perception: wrongPerception,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    })).toBeNull();
  });

  it("keeps relationship geometry exact across signed boundaries and extreme regions", () => {
    const acrossBoundaryCenter = position(-1, 4, REGION_WIDTH_UNITS - 200, 18_000);
    const acrossBoundaryAlarm = position(0, 4, 200, 18_000);
    const boundaryState = stateAt(acrossBoundaryCenter);
    const boundaryAssignment = boundaryState.assignments[0]!;
    const boundaryDecision = decideSettlementWorkingAnimalActivity({
      assignment: boundaryAssignment,
      tick: 1,
      perception: perceptionWithObservation(boundaryAssignment.workerActorId, {
        center: acrossBoundaryAlarm,
        radiusUnits: 500,
      }),
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });
    expect(boundaryDecision?.activity).toBe("investigate");

    for (const coordinate of [
      -REGION_COORD_LIMIT,
      -1_000_000,
      -1,
      0,
      1,
      1_000_000,
      REGION_COORD_LIMIT,
    ]) {
      const center = position(coordinate, -coordinate, 12_000, 12_000);
      const current = stateAt(center);
      const currentAssignment = current.assignments[0]!;
      const decision = decideSettlementWorkingAnimalActivity({
        assignment: currentAssignment,
        tick: 1,
        perception: perceptionWithObservation(currentAssignment.workerActorId, { center }),
        welfare: ZERO_WELFARE,
        accessibility: ALL_ACCESSIBLE,
        actorDisposition: AVAILABLE_FOR_WORK,
        workerInsideDutyArea: true,
      });
      expect(decision?.activity).toBe("investigate");
      expect(deserializeSettlementWorkingAnimalState(
        serializeSettlementWorkingAnimalState(current),
      )).toEqual(current);
    }

    const extremeState = stateAt(position(-REGION_COORD_LIMIT, 0));
    const extremeAssignment = extremeState.assignments[0]!;
    expect(decideSettlementWorkingAnimalActivity({
      assignment: extremeAssignment,
      tick: 1,
      perception: perceptionWithObservation(extremeAssignment.workerActorId, {
        center: position(REGION_COORD_LIMIT, 0),
      }),
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    })?.activity).toBe("watch");
  });

  it("keeps the bounded collection and save envelope comfortably below its fixed ceiling", () => {
    const assignments = Array.from(
      { length: SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS },
      (_, ordinal) => assignmentInput(ordinal),
    );
    let lifecycleState = createSettlementWorkingAnimalState({
      settlementId: 1,
      assignments,
    });
    for (const original of lifecycleState.assignments) {
      const perception = perceptionWithObservation(original.workerActorId);
      const activity = stageSettlementWorkingAnimalActivity(lifecycleState, {
        assignmentId: original.assignmentId,
        tick: 1,
        perception,
        welfare: ZERO_WELFARE,
        accessibility: ALL_ACCESSIBLE,
        actorDisposition: AVAILABLE_FOR_WORK,
        workerInsideDutyArea: true,
      });
      lifecycleState = resolveSettlementWorkingAnimalActivity(
        activity!.state,
        activity!.transaction,
      )!.state;
      const opened = stageSettlementWorkingAnimalTaskLifecycle(lifecycleState, {
        assignmentId: original.assignmentId,
        tick: 1,
        workerPosition: position(0, 0, 18_000, 18_000),
        handlerPosition: position(0, 0, 20_000, 20_000),
        workerPerception: perception,
        handlerPerception: quietPerception(original.handlerActorId, 1),
        welfare: ZERO_WELFARE,
        actorDisposition: AVAILABLE_FOR_WORK,
        handlerDisposition: { kind: "continue" },
      });
      lifecycleState = resolveSettlementWorkingAnimalTaskLifecycle(
        opened!.state,
        opened!.transaction,
      )!.state;
    }
    for (const original of lifecycleState.assignments) {
      const task = lifecycleState.assignments.find(({ assignmentId }) => (
        assignmentId === original.assignmentId
      ))!.currentTask!;
      const completed = stageSettlementWorkingAnimalTaskLifecycle(lifecycleState, {
        assignmentId: original.assignmentId,
        tick: 2,
        workerPosition: task.searchProbe.probeArea.center,
        handlerPosition: position(0, 0, 20_000, 20_000),
        workerPerception: quietPerception(original.workerActorId, 2),
        handlerPerception: quietPerception(original.handlerActorId, 2),
        welfare: ZERO_WELFARE,
        actorDisposition: AVAILABLE_FOR_WORK,
        handlerDisposition: { kind: "continue" },
      });
      lifecycleState = resolveSettlementWorkingAnimalTaskLifecycle(
        completed!.state,
        completed!.transaction,
      )!.state;
      const arrived = stageSettlementWorkingAnimalTaskLifecycle(lifecycleState, {
        assignmentId: original.assignmentId,
        tick: 3,
        workerPosition: position(),
        handlerPosition: position(0, 0, 20_000, 20_000),
        workerPerception: quietPerception(original.workerActorId, 3),
        handlerPerception: quietPerception(original.handlerActorId, 3),
        welfare: ZERO_WELFARE,
        actorDisposition: AVAILABLE_FOR_WORK,
        handlerDisposition: { kind: "continue" },
      });
      lifecycleState = resolveSettlementWorkingAnimalTaskLifecycle(
        arrived!.state,
        arrived!.transaction,
      )!.state;
    }
    const lifecycleBytes = new TextEncoder().encode(
      serializeSettlementWorkingAnimalState(lifecycleState),
    ).byteLength;
    expect(lifecycleBytes).toBeLessThan(24_000);

    const startedAt = performance.now();
    let bytes = 0;
    for (let pass = 0; pass < 250; pass += 1) {
      const state = createSettlementWorkingAnimalState({ settlementId: 1, assignments });
      const encoded = serializeSettlementWorkingAnimalState(state);
      bytes = new TextEncoder().encode(encoded).byteLength;
      expect(deserializeSettlementWorkingAnimalState(encoded)).toEqual(state);
    }
    const elapsed = performance.now() - startedAt;

    expect(bytes).toBeLessThan(SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES);
    expect(elapsed).toBeLessThan(2_000);
  });

  it("keeps every canonical lifecycle root closed over the fixed byte budget", () => {
    const denseAssignments = Array.from(
      { length: SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS },
      (_, ordinal) => {
        let state = createSettlementWorkingAnimalState({
          settlementId: 1,
          assignments: [assignmentInput(ordinal)],
        });
        const first = commitInvestigation(state, 1);
        state = openTask(first.state, first.perception, 1);
        let assignment = state.assignments[0]!;
        const probe = assignment.currentTask!.searchProbe.probeArea.center;
        const completed = stageSettlementWorkingAnimalTaskLifecycle(state, {
          assignmentId: assignment.assignmentId,
          tick: 2,
          workerPosition: probe,
          handlerPosition: position(0, 0, 20_000, 20_000),
          workerPerception: quietPerception(assignment.workerActorId, 2),
          handlerPerception: quietPerception(assignment.handlerActorId, 2),
          welfare: ZERO_WELFARE,
          actorDisposition: AVAILABLE_FOR_WORK,
          handlerDisposition: { kind: "continue" },
        });
        state = resolveSettlementWorkingAnimalTaskLifecycle(
          completed!.state,
          completed!.transaction,
        )!.state;
        assignment = state.assignments[0]!;
        const returnArea = settlementWorkingAnimalReturnArea(assignment)!;
        const arrived = stageSettlementWorkingAnimalTaskLifecycle(state, {
          assignmentId: assignment.assignmentId,
          tick: 3,
          workerPosition: returnArea.center,
          handlerPosition: position(0, 0, 20_000, 20_000),
          workerPerception: quietPerception(assignment.workerActorId, 3),
          handlerPerception: quietPerception(assignment.handlerActorId, 3),
          welfare: ZERO_WELFARE,
          actorDisposition: AVAILABLE_FOR_WORK,
          handlerDisposition: { kind: "continue" },
        });
        state = resolveSettlementWorkingAnimalTaskLifecycle(
          arrived!.state,
          arrived!.transaction,
        )!.state;
        assignment = state.assignments[0]!;
        const acknowledged = stageSettlementWorkingAnimalTaskLifecycle(state, {
          assignmentId: assignment.assignmentId,
          tick: 4,
          workerPosition: returnArea.center,
          handlerPosition: position(0, 0, 20_000, 20_000),
          workerPerception: quietPerception(assignment.workerActorId, 4),
          handlerPerception: identifiedVision(
            assignment.handlerActorId,
            assignment.workerActorId,
            returnArea.center,
            4,
            `OBS-handler-dense-${ordinal}`,
          ),
          welfare: ZERO_WELFARE,
          actorDisposition: AVAILABLE_FOR_WORK,
          handlerDisposition: { kind: "continue" },
        });
        state = resolveSettlementWorkingAnimalTaskLifecycle(
          acknowledged!.state,
          acknowledged!.transaction,
        )!.state;

        const secondPerception = perceptionWithObservation(
          state.assignments[0]!.workerActorId,
          { tick: 5, id: `OBS-second-alarm-${ordinal}` },
        );
        const secondActivity = stageSettlementWorkingAnimalActivity(state, {
          assignmentId: state.assignments[0]!.assignmentId,
          tick: 5,
          perception: secondPerception,
          welfare: ZERO_WELFARE,
          accessibility: ALL_ACCESSIBLE,
          actorDisposition: AVAILABLE_FOR_WORK,
          workerInsideDutyArea: true,
        });
        state = resolveSettlementWorkingAnimalActivity(
          secondActivity!.state,
          secondActivity!.transaction,
        )!.state;
        return openTask(state, secondPerception, 5).assignments[0]!;
      },
    );

    let sawBudgetRejection = false;
    for (let count = 1; count <= denseAssignments.length; count += 1) {
      const assignments = denseAssignments.slice(0, count);
      const raw = {
        version: SETTLEMENT_WORKING_ANIMALS_VERSION,
        ownerId: SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
        revision: assignments.reduce((sum, assignment) => (
          sum
          + assignment.lastResolvedActivityOrdinal * 2
          + (assignment.pendingActivity === null ? 0 : 1)
          + assignment.lastResolvedTaskTransitionOrdinal * 2
          + (assignment.pendingTaskTransition === null ? 0 : 1)
        ), 0),
        settlementId: 1,
        assignments,
      };
      const bytes = new TextEncoder().encode(stableStringify(raw)).byteLength;
      const canonical = canonicalizeSettlementWorkingAnimalState(raw);
      if (bytes > SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES) {
        sawBudgetRejection = true;
        expect(canonical).toBeNull();
      } else {
        expect(canonical).not.toBeNull();
        expect(() => serializeSettlementWorkingAnimalState(canonical)).not.toThrow();
      }
    }
    expect(sawBudgetRejection).toBe(true);
  });

  it("carries maximum-length legal identities through one complete lifecycle", () => {
    const maximumId = (prefix: string): string => (
      `${prefix}${"x".repeat(192 - prefix.length)}`
    );
    let state = createSettlementWorkingAnimalState({
      settlementId: 1,
      assignments: [{
        ...assignmentInput(0),
        workerActorId: maximumId("D-"),
        handlerActorId: maximumId("H-"),
        protectedGroupId: maximumId("G-"),
        worksiteId: maximumId("W-"),
      }],
    });
    let assignment = state.assignments[0]!;
    const sourcePerception = perceptionWithObservation(assignment.workerActorId, {
      id: maximumId("O-"),
    });
    const investigating = stageSettlementWorkingAnimalActivity(state, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      perception: sourcePerception,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    });
    state = resolveSettlementWorkingAnimalActivity(
      investigating!.state,
      investigating!.transaction,
    )!.state;
    state = openTask(state, sourcePerception, 1);

    assignment = state.assignments[0]!;
    const completed = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 2,
      workerPosition: assignment.currentTask!.searchProbe.probeArea.center,
      handlerPosition: position(0, 0, 20_000, 20_000),
      workerPerception: quietPerception(assignment.workerActorId, 2),
      handlerPerception: quietPerception(assignment.handlerActorId, 2),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    state = resolveSettlementWorkingAnimalTaskLifecycle(
      completed!.state,
      completed!.transaction,
    )!.state;

    assignment = state.assignments[0]!;
    const returnArea = settlementWorkingAnimalReturnArea(assignment)!;
    const arrived = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 3,
      workerPosition: returnArea.center,
      handlerPosition: position(0, 0, 20_000, 20_000),
      workerPerception: quietPerception(assignment.workerActorId, 3),
      handlerPerception: quietPerception(assignment.handlerActorId, 3),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    state = resolveSettlementWorkingAnimalTaskLifecycle(
      arrived!.state,
      arrived!.transaction,
    )!.state;

    assignment = state.assignments[0]!;
    const acknowledged = stageSettlementWorkingAnimalTaskLifecycle(state, {
      assignmentId: assignment.assignmentId,
      tick: 4,
      workerPosition: returnArea.center,
      handlerPosition: position(0, 0, 20_000, 20_000),
      workerPerception: quietPerception(assignment.workerActorId, 4),
      handlerPerception: identifiedVision(
        assignment.handlerActorId,
        assignment.workerActorId,
        returnArea.center,
        4,
        maximumId("O-"),
      ),
      welfare: ZERO_WELFARE,
      actorDisposition: AVAILABLE_FOR_WORK,
      handlerDisposition: { kind: "continue" },
    });
    state = resolveSettlementWorkingAnimalTaskLifecycle(
      acknowledged!.state,
      acknowledged!.transaction,
    )!.state;

    expect(state.assignments[0]).toMatchObject({
      currentTask: null,
      lastTaskOutcome: {
        phase: "closed",
        outcome: "completed",
        closedAtTick: 4,
        lastTransition: { transition: "acknowledge" },
      },
    });
    const serialized = serializeSettlementWorkingAnimalState(state);
    expect(new TextEncoder().encode(serialized).byteLength)
      .toBeLessThanOrEqual(SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES);
    expect(deserializeSettlementWorkingAnimalState(serialized)).toEqual(state);
  });

  it("ignores weak or unrelated cognition instead of inventing work knowledge", () => {
    const state = stateAt();
    const assignment = state.assignments[0]!;
    const weak = perceptionWithObservation(assignment.workerActorId, {
      perceivedClass: "herd-alarm",
      confidence: SETTLEMENT_WORKING_ANIMAL_GUARDIAN_SIGNAL_THRESHOLD - 1,
      salience: ACTOR_PERCEPTION_SCALE,
    });
    expect(decideSettlementWorkingAnimalActivity({
      assignment,
      tick: 1,
      perception: weak,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    })?.activity).toBe("watch");

    const food = perceptionWithObservation(assignment.workerActorId, {
      id: "OBS-food",
      perceivedClass: "food-scent",
    });
    expect(decideSettlementWorkingAnimalActivity({
      assignment,
      tick: 1,
      perception: food,
      welfare: ZERO_WELFARE,
      accessibility: ALL_ACCESSIBLE,
      actorDisposition: AVAILABLE_FOR_WORK,
      workerInsideDutyArea: true,
    })?.activity).toBe("watch");
  });
});
