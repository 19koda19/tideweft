import { describe, expect, it } from "vitest";

import { createActorObservation, type ActorObservation } from "../sim/actorPerception";
import { createWorld, createWorldView, deserializeWorld, serializeWorld, stepWorld, type ResidentPerceptionFrame } from "../sim/public";
import { replaceResidentActivity } from "../sim/residentActivity";
import type { ResidentState, WorldState } from "../sim/types";
import {
  humanDangerWarningExpressionCandidate,
  humanDangerWarningExpressionEventMatchesWorld,
  humanDangerWarningExpressionMemoryMatchesWorld,
  humanDangerWarningExpressionSourceAddress,
  selectHumanDangerWarningExpression,
  type HumanDangerWarningExpressionInput,
} from "./humanDangerWarningExpression";
import { headingFromRadians } from "./livingActor";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSituatedExpressionState, reduceSituatedExpression } from "./situatedExpression";
import { createWorldPosition } from "./worldPosition";

type Stimulus = "large-predator" | "animal-alarm" | "danger-sound";
interface Fixture {
  readonly state: WorldState;
  readonly actorId: string;
}

// Controlled observations enter through the native engine, which creates the
// fresh belief. These are domain contracts, not ordinary-runtime play proof.
function fixture(stimulus: Stimulus = "large-predator", body = true): Fixture {
  const state = createWorld(`human warning ${stimulus}`, "standard");
  const resident = state.residents[0]!;
  const actorId = resident.identity.stableId;
  resident.needs.rest = 900_000;
  state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000 };
  if (body) expect(adoptResidentActivities(state)).toBe(true);
  const tick = state.meta.completedTick + 1;
  const visual = stimulus === "large-predator";
  const observation = createActorObservation({
    id: `warning-body:${resident.id}:${tick}:${stimulus}`,
    observerId: actorId, observedAtTick: tick,
    channel: visual ? "vision" : "hearing", perceivedClass: stimulus,
    subjectId: visual ? "core-wildlife:bear:warning-test" : null,
    area: { center: createWorldPosition({ x: 0, y: 0 }, 12_500, 18_500),
      radiusUnits: visual ? 0 : 2_500 },
    confidence: 920_000, salience: 960_000,
    identification: visual ? "identified" : "anonymous", interrupt: "strong",
  });
  if (observation === null) throw new Error("warning fixture requires a valid observation");
  stepWorld(state, [], frame(state, tick, actorId, observation));
  return { state, actorId };
}

function frame(state: WorldState, tick: number, actorId: string, observation: ActorObservation | null): ResidentPerceptionFrame {
  return { tick, residents: state.residents.map((resident) => ({
    residentId: resident.id, actorId: resident.identity.stableId,
    observations: resident.identity.stableId === actorId && observation !== null ? [observation] : [],
  })) };
}

function input(current: Fixture): HumanDangerWarningExpressionInput {
  const world = createWorldView(current.state);
  const resident = world.residents.find(({ identity }) => identity.stableId === current.actorId);
  if (!resident) throw new Error("warning fixture lost its native human");
  return { world, resident };
}

function accepted(current: Fixture) {
  const candidate = humanDangerWarningExpressionCandidate(input(current));
  if (candidate === null) throw new Error("fixture requires a fresh native warning cause");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), candidate.intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) {
    throw new Error("warning fixture could not commit its expression");
  }
  return { candidate, event: reduction.event, memory };
}

function appendContractHistory(current: Fixture): Fixture {
  expect(prepareResidentRestActivities(current.state)).toBe(true);
  expect(advanceResidentRestActivities(current.state, 1)).not.toBeNull();
  const index = current.state.residents.findIndex(({ identity }) => identity.stableId === current.actorId);
  const resident = current.state.residents[index]!;
  const activity = resident.activity!;
  const anchor = activity.poses[0]!;
  expect(activity.restTask).toBeNull();
  expect(activity.poses[1]).toEqual(anchor);
  const dx = anchor.heading === headingFromRadians(0) ? 0 : 50;
  const dy = dx === 0 ? 50 : 0;
  // Deliberately synthetic canonical-history contrast: a valid retained pose
  // does not prove an autonomous action. Strong warning pressure forbids this
  // fixture's real rest motion, so no successful rest task is injected.
  current.state.residents[index] = replaceResidentActivity(resident, {
    ...activity,
    poses: [anchor, {
      position: createWorldPosition(anchor.position.region, anchor.position.localX + dx, anchor.position.localY + dy),
      heading: headingFromRadians(Math.atan2(dy, dx)),
    }],
    restTask: null,
  });
  return current;
}

function malformedBodyInput(current: Fixture, activity: unknown): HumanDangerWarningExpressionInput {
  const original = input(current);
  const residents = [...original.world.residents];
  const index = residents.findIndex(({ identity }) => identity.stableId === current.actorId);
  const resident = { ...residents[index]!, activity } as ResidentState;
  residents[index] = resident;
  return { world: { ...original.world, residents }, resident };
}

describe("human warning retained body source contracts", () => {
  it("keeps a genuinely warned resident stationary instead of inventing urgent-rest motion", () => {
    const current = fixture();
    const before = input(current).resident.activity!.poses[0]!;
    expect(current.state.residents.every((resident) => Object.hasOwn(resident, "activity"))).toBe(true);
    expect(prepareResidentRestActivities(current.state)).toBe(true);
    const prepared = input(current).resident;
    expect(prepared.needs.rest).toBeGreaterThanOrEqual(900_000);
    expect(prepared.activity?.restTask).toBeNull();
    const step = advanceResidentRestActivities(current.state, 1);
    expect(step).not.toBeNull();
    expect(step?.movedActorIds).not.toContain(current.actorId);
    expect(input(current).resident.activity?.poses).toEqual([before, before]);
    expect(humanDangerWarningExpressionSourceAddress(input(current))?.position).toEqual(before.position);
  });

  it("authenticates phase-zero event, memory and heading despite a later contract-fixture pose", () => {
    const current = fixture();
    const original = accepted(current);
    const source = humanDangerWarningExpressionSourceAddress(input(current));
    expect(source).not.toBeNull();
    appendContractHistory(current);
    const updated = input(current);
    const latest = resolveResidentWorldPlacement(updated.world, updated.resident);
    expect(latest?.position).not.toEqual(source?.position);
    expect(headingFromRadians(latest!.facing)).not.toBe(source?.heading);
    expect(humanDangerWarningExpressionSourceAddress(updated)).toEqual(source);
    expect(humanDangerWarningExpressionCandidate(updated)).toEqual(original.candidate);
    expect(selectHumanDangerWarningExpression(updated.world)).toEqual(original.candidate);
    expect(humanDangerWarningExpressionEventMatchesWorld(updated, original.event)).toBe(true);
    expect(humanDangerWarningExpressionMemoryMatchesWorld(updated, original.memory)).toBe(true);
    const relocated = { ...original.event, position: latest!.position };
    expect(humanDangerWarningExpressionEventMatchesWorld(updated, relocated)).toBe(false);
  });

  it("preserves exact lower-world cold bytes and detached retained source authority", () => {
    const current = appendContractHistory(fixture("animal-alarm"));
    const before = input(current);
    const source = humanDangerWarningExpressionSourceAddress(before);
    const expression = accepted(current);
    const bytes = serializeWorld(current.state);
    const loaded = { state: deserializeWorld(bytes), actorId: current.actorId };
    expect(serializeWorld(loaded.state)).toBe(bytes);
    expect(loaded.state.residents.find(({ identity }) => identity.stableId === current.actorId)?.activity)
      .not.toBe(current.state.residents.find(({ identity }) => identity.stableId === current.actorId)?.activity);
    const cold = input(loaded);
    expect(cold.resident.activity).not.toBe(before.resident.activity);
    expect(cold.resident.activity?.poses).not.toBe(before.resident.activity?.poses);
    expect(humanDangerWarningExpressionSourceAddress(cold)).toEqual(source);
    expect(humanDangerWarningExpressionCandidate(cold)).toEqual(expression.candidate);
    expect(humanDangerWarningExpressionEventMatchesWorld(cold, expression.event)).toBe(true);
    expect(humanDangerWarningExpressionMemoryMatchesWorld(cold, expression.memory)).toBe(true);
    const index = loaded.state.residents.findIndex(({ identity }) => identity.stableId === current.actorId);
    loaded.state.residents[index] = { ...loaded.state.residents[index]!, activity: undefined } as unknown as ResidentState;
    expect(serializeWorld(current.state)).toBe(bytes);
    expect(() => input(loaded)).toThrow("Cannot project malformed resident activity state");
  });

  it("fails closed on explicitly present missing, stale, malformed or foreign body history", () => {
    const current = appendContractHistory(fixture());
    const original = accepted(current);
    const activity = input(current).resident.activity!;
    const foreign = current.state.residents.find(({ identity }) => identity.stableId !== current.actorId)!;
    for (const malformed of [null, undefined, { ...activity, tick: activity.tick + 1 },
      { ...activity, actorId: foreign.identity.stableId }, { ...activity, poses: [] },
      { ...activity, poses: [undefined, activity.poses[1]] }]) {
      const invalid = malformedBodyInput(current, malformed);
      expect(humanDangerWarningExpressionSourceAddress(invalid)).toBeNull();
      expect(humanDangerWarningExpressionCandidate(invalid)).toBeNull();
      expect(humanDangerWarningExpressionEventMatchesWorld(invalid, original.event)).toBe(false);
      expect(humanDangerWarningExpressionMemoryMatchesWorld(invalid, original.memory)).toBe(false);
    }
  });

  it("keeps independent fresh-belief and event cause gates despite valid body history", () => {
    const current = appendContractHistory(fixture("animal-alarm"));
    const original = accepted(current);
    expect(original.candidate.intent.knowledgeBasis).toBe("self-heard-anonymous-alarm");
    expect(humanDangerWarningExpressionEventMatchesWorld(input(current), {
      ...original.event, knowledgeBasis: "self-perceived-threat",
    })).toBe(false);
    const tick = current.state.meta.completedTick + 1;
    stepWorld(current.state, [], frame(current.state, tick, current.actorId, null));
    expect(input(current).resident.activity).toBeDefined();
    expect(humanDangerWarningExpressionSourceAddress(input(current))).toBeNull();
    expect(humanDangerWarningExpressionEventMatchesWorld(input(current), original.event)).toBe(false);
    expect(humanDangerWarningExpressionMemoryMatchesWorld(input(current), original.memory)).toBe(false);
  });

  it("preserves absent legacy placement and rejects recursive human-warning stimuli", () => {
    for (const stimulus of ["large-predator", "animal-alarm"] as const) {
      const legacy = input(fixture(stimulus, false));
      expect(Object.hasOwn(legacy.resident, "activity")).toBe(false);
      const placement = resolveResidentWorldPlacement(legacy.world, legacy.resident)!;
      const address = humanDangerWarningExpressionSourceAddress(legacy);
      expect(address?.position).toEqual(placement.position);
      expect(address?.heading).toBe(headingFromRadians(placement.facing));
      expect(humanDangerWarningExpressionCandidate(legacy)?.intent.position).toEqual(placement.position);
    }
    const recursive = input(fixture("danger-sound"));
    expect(recursive.resident.activity).toBeDefined();
    expect(humanDangerWarningExpressionSourceAddress(recursive)).toBeNull();
    expect(humanDangerWarningExpressionCandidate(recursive)).toBeNull();
    expect(selectHumanDangerWarningExpression(recursive.world)).toBeNull();
  });
});
