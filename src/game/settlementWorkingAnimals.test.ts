import { describe, expect, it } from "vitest";
import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import {
  SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS,
  SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES,
  SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
  SETTLEMENT_WORKING_ANIMAL_GUARDIAN_SIGNAL_THRESHOLD,
  canonicalizeSettlementWorkingAnimalAssignment,
  canonicalizeSettlementWorkingAnimalState,
  createSettlementWorkingAnimalState,
  decideSettlementWorkingAnimalActivity,
  deserializeSettlementWorkingAnimalState,
  recoverPendingSettlementWorkingAnimalActivity,
  resolveSettlementWorkingAnimalActivity,
  serializeSettlementWorkingAnimalState,
  stageSettlementWorkingAnimalActivity,
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

describe("settlement working-animal authority", () => {
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
