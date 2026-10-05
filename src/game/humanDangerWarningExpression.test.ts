import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createActorObservation,
  type ActorBelief,
  type ActorObservation,
} from "../sim/actorPerception";
import {
  createWorld,
  createWorldView,
  stepWorld,
  type ResidentPerceptionFrame,
} from "../sim/public";
import type { ResidentState, WorldState } from "../sim/types";
import {
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  createSituatedExpressionState,
  reduceSituatedExpression,
} from "./situatedExpression";
import {
  humanDangerWarningExpressionCandidate,
  humanDangerWarningExpressionEventMatchesWorld,
  humanDangerWarningExpressionMemoryMatchesWorld,
  selectHumanDangerWarningExpression,
} from "./humanDangerWarningExpression";
import { resolveResidentWorldPlacement } from "./residentSpatial";

function firstResident(world: WorldState): ResidentState {
  const resident = world.residents[0];
  if (resident === undefined) throw new Error("warning fixture needs a resident");
  return resident;
}

function observation(
  resident: ResidentState,
  tick: number,
  perceivedClass: "animal-alarm" | "danger-sound" | "large-predator",
): ActorObservation {
  const visual = perceivedClass === "large-predator";
  const value = createActorObservation({
    id: `human-warning:${resident.id}:${tick}:${perceivedClass}`,
    observerId: resident.identity.stableId,
    observedAtTick: tick,
    channel: visual ? "vision" : "hearing",
    perceivedClass,
    subjectId: visual ? "core-wildlife:bear:warning-test" : null,
    area: {
      center: { region: { x: 0, y: 0 }, localX: 12_500, localY: 18_500 },
      radiusUnits: visual ? 0 : 2_500,
    },
    confidence: 920_000,
    salience: 960_000,
    identification: visual ? "identified" : "anonymous",
    interrupt: "strong",
  });
  if (value === null) throw new Error("warning fixture observation is invalid");
  return value;
}

function warningWorld(
  perceivedClass: "animal-alarm" | "danger-sound" | "large-predator",
  observedResidentCount = 1,
): Readonly<{ world: ReturnType<typeof createWorldView>; resident: ResidentState }> {
  const state = createWorld(`human warning ${perceivedClass}`, "standard");
  const resident = firstResident(state);
  const observedResidentIds = new Set(state.residents.slice(0, observedResidentCount).map(({ id }) => id));
  const tick = state.meta.completedTick + 1;
  const frame: ResidentPerceptionFrame = {
    tick,
    residents: state.residents.map((candidate) => ({
      residentId: candidate.id,
      actorId: candidate.identity.stableId,
      observations: observedResidentIds.has(candidate.id)
        ? [observation(candidate, tick, perceivedClass)]
        : [],
    })),
  };
  stepWorld(state, [], frame);
  const world = createWorldView(state);
  const advanced = world.residents.find(({ id }) => id === resident.id);
  if (advanced === undefined) throw new Error("warning fixture lost its resident");
  return { world, resident: advanced };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("human danger warning expression", () => {
  it("derives one deterministic warning from a fresh direct predator sighting", () => {
    const fixture = warningWorld("large-predator");
    const placement = resolveResidentWorldPlacement(fixture.world, fixture.resident);
    if (placement === null) throw new Error("warning resident has no world address");

    const first = humanDangerWarningExpressionCandidate(fixture);
    const second = humanDangerWarningExpressionCandidate(structuredClone(fixture));

    expect(first).toEqual(second);
    expect(first?.intent).toMatchObject({
      sourceActorId: fixture.resident.identity.stableId,
      position: placement.position,
      meaning: "human-danger-warning",
      family: "warning",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-perceived-threat",
      priority: 900_000,
    });
    expect(first?.sourceObservationId).not.toBe(first?.intent.triggerEventId);
    expect(first?.intent.triggerEventId).toMatch(/^human-warning:[0-9a-f]{16}$/u);
    expect(selectHumanDangerWarningExpression(fixture.world)).toEqual(first);
  });

  it("warns from an anonymous animal alarm without claiming the hidden cause", () => {
    const fixture = warningWorld("animal-alarm");
    expect(humanDangerWarningExpressionCandidate(fixture)?.intent).toMatchObject({
      knowledgeBasis: "self-heard-anonymous-alarm",
      meaning: "human-danger-warning",
    });
  });

  it("does not recursively turn another human warning sound into a warning", () => {
    const fixture = warningWorld("danger-sound");
    expect(humanDangerWarningExpressionCandidate(fixture)).toBeNull();
    expect(selectHumanDangerWarningExpression(fixture.world)).toBeNull();
  });

  it.each(["animal-alarm", "large-predator"] as const)(
    "inspects one detached immutable %s cause without changing candidate bytes or keys",
    (perceivedClass) => {
      vi.stubEnv("DEV", true);
      const fixture = warningWorld(perceivedClass);
      const worldBefore = JSON.stringify(fixture.world);
      const expected = humanDangerWarningExpressionCandidate(fixture);
      if (expected === null) throw new Error("warning inspection fixture has no candidate");
      const originalBelief = fixture.resident.perception.beliefs.find(({ sourceObservationId }) => (
        sourceObservationId === expected.sourceObservationId
      ));
      if (originalBelief === undefined) throw new Error("warning inspection fixture has no source belief");
      const sink = vi.fn<(belief: ActorBelief) => void>();

      const candidate = selectHumanDangerWarningExpression(fixture.world, sink);

      expect(JSON.stringify(candidate)).toBe(JSON.stringify(expected));
      expect(Object.keys(candidate!)).toEqual(["intent", "sourceObservationId"]);
      expect(sink).toHaveBeenCalledTimes(1);
      const belief = sink.mock.calls[0]![0];
      expect(belief).toEqual(originalBelief);
      expect(belief).not.toBe(originalBelief);
      expect(belief.area).not.toBe(originalBelief.area);
      for (const value of [belief, belief.area, belief.area.center, belief.area.center.region]) {
        expect(Object.isFrozen(value)).toBe(true);
      }
      expect(belief.sourceObservationId).toBe(candidate!.sourceObservationId);
      expect(belief.lastObservedTick).toBe(fixture.world.completedTick);
      expect(belief.identification).toBe(perceivedClass === "animal-alarm" ? "anonymous" : "identified");
      expect(belief.subjectId === null).toBe(perceivedClass === "animal-alarm");
      expect(JSON.stringify(fixture.world)).toBe(worldBefore);
    },
  );

  it("reports only the winning cause among multiple eligible residents regardless of iteration order", () => {
    vi.stubEnv("DEV", true);
    const fixture = warningWorld("animal-alarm", 3);
    const eligible = fixture.world.residents.map((resident) => (
      humanDangerWarningExpressionCandidate({ world: fixture.world, resident })
    )).filter((candidate) => candidate !== null);
    expect(eligible.length).toBeGreaterThanOrEqual(2);
    expect(new Set(eligible.map(({ intent }) => intent.priority)).size).toBe(1);
    expect(new Set(eligible.map(({ intent }) => intent.salience)).size).toBe(1);
    const expected = [...eligible].sort((left, right) => (
      left.intent.sourceActorId.localeCompare(right.intent.sourceActorId)
    ))[0]!;
    const worldBefore = JSON.stringify(fixture.world);
    const forwardSink = vi.fn<(belief: ActorBelief) => void>();
    const reverseSink = vi.fn<(belief: ActorBelief) => void>();
    const reversed = { ...fixture.world, residents: [...fixture.world.residents].reverse() };

    const forward = selectHumanDangerWarningExpression(fixture.world, forwardSink);
    const reverse = selectHumanDangerWarningExpression(reversed, reverseSink);

    expect(JSON.stringify(forward)).toBe(JSON.stringify(expected));
    expect(JSON.stringify(reverse)).toBe(JSON.stringify(expected));
    expect(forwardSink).toHaveBeenCalledTimes(1);
    expect(reverseSink).toHaveBeenCalledTimes(1);
    expect(forwardSink.mock.calls[0]![0].sourceObservationId).toBe(expected.sourceObservationId);
    expect(reverseSink.mock.calls[0]![0]).toEqual(forwardSink.mock.calls[0]![0]);
    expect(JSON.stringify(fixture.world)).toBe(worldBefore);
  });

  it("does not inspect absent, stale or recursively heard human-warning causes", () => {
    vi.stubEnv("DEV", true);
    const fixture = warningWorld("animal-alarm");
    const absent = { ...fixture.world, residents: [] };
    const stale = structuredClone(fixture.world);
    stale.completedTick += 1;
    const recursive = warningWorld("danger-sound").world;

    for (const world of [absent, stale, recursive]) {
      const sink = vi.fn<(belief: ActorBelief) => void>();
      expect(selectHumanDangerWarningExpression(world, sink)).toBeNull();
      expect(sink).not.toHaveBeenCalled();
    }
  });

  it("does not let a throwing inspection sink veto or alter the selected warning", () => {
    vi.stubEnv("DEV", true);
    const fixture = warningWorld("animal-alarm");
    const worldBefore = JSON.stringify(fixture.world);
    const expected = selectHumanDangerWarningExpression(fixture.world);
    expect(expected).not.toBeNull();
    const sink = vi.fn((_belief: ActorBelief) => { throw new Error("diagnostic sink failed"); });

    expect(selectHumanDangerWarningExpression(fixture.world, sink)).toEqual(expected);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.results[0]?.type).toBe("throw");
    expect(JSON.stringify(fixture.world)).toBe(worldBefore);
  });

  it("isolates attempted mutation of the selected canonical belief from warning and world authority", () => {
    vi.stubEnv("DEV", true);
    const fixture = warningWorld("animal-alarm");
    const worldBefore = JSON.stringify(fixture.world);
    const expected = selectHumanDangerWarningExpression(fixture.world);
    expect(expected).not.toBeNull();
    const writes: boolean[] = [];
    const sink = vi.fn((belief: ActorBelief) => {
      writes.push(Reflect.set(belief, "salience", 0));
      writes.push(Reflect.set(belief.area.center, "localX", 0));
      writes.push(Reflect.set(belief.area.center.region, "x", 99));
      // Deliberately throw after recording the nonthrowing mutation attempts.
      // Assertions are outside the swallowed diagnostic callback.
      Object.assign(belief, { sourceObservationId: "forged-warning-observation" });
    });

    expect(selectHumanDangerWarningExpression(fixture.world, sink)).toEqual(expected);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([false, false, false]);
    expect(sink.mock.results[0]?.type).toBe("throw");
    expect(sink.mock.calls[0]![0].sourceObservationId).toBe(expected!.sourceObservationId);
    expect(JSON.stringify(fixture.world)).toBe(worldBefore);
  });

  it("does not expose selected beliefs to the sink when DEV is false", () => {
    vi.stubEnv("DEV", false);
    const fixture = warningWorld("large-predator");
    const expected = humanDangerWarningExpressionCandidate(fixture);
    expect(expected).not.toBeNull();
    const sink = vi.fn((_belief: ActorBelief) => { throw new Error("production must not inspect"); });

    expect(selectHumanDangerWarningExpression(fixture.world, sink)).toEqual(expected);
    expect(sink).not.toHaveBeenCalled();
  });

  it("does not deep-serialize eligible residents to inspect the selected belief", () => {
    vi.stubEnv("DEV", true);
    const fixture = warningWorld("animal-alarm", 3);
    const world = structuredClone(fixture.world);
    let serializationOnlyReads = 0;
    for (const resident of world.residents) {
      Object.defineProperty(resident, "serializationOnlyProbe", {
        configurable: true,
        enumerable: true,
        get: () => {
          serializationOnlyReads += 1;
          return "unused";
        },
      });
    }
    const sink = vi.fn<(belief: ActorBelief) => void>();

    expect(selectHumanDangerWarningExpression(world, sink)).not.toBeNull();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(serializationOnlyReads).toBe(0);
  });

  it("scans world-owned residents without deep-serializing each resident", () => {
    const fixture = warningWorld("danger-sound");
    const world = structuredClone(fixture.world);
    let serializationOnlyReads = 0;
    for (const resident of world.residents) {
      Object.defineProperty(resident, "serializationOnlyProbe", {
        configurable: true,
        enumerable: true,
        get: () => {
          serializationOnlyReads += 1;
          return "unused";
        },
      });
    }

    expect(selectHumanDangerWarningExpression(world)).toBeNull();
    expect(serializationOnlyReads).toBe(0);
  });

  it("keeps detached candidate inputs behind exact world ownership validation", () => {
    const fixture = warningWorld("large-predator");
    const forged = {
      ...structuredClone(fixture.resident),
      detachedMutation: true,
    } as unknown as ResidentState;

    expect(humanDangerWarningExpressionCandidate({
      world: fixture.world,
      resident: forged,
    })).toBeNull();
  });

  it("reauthenticates active and cooldown state from the exact fresh belief", () => {
    const fixture = warningWorld("large-predator");
    const candidate = humanDangerWarningExpressionCandidate(fixture);
    if (candidate === null) throw new Error("warning fixture omitted its intent");
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      candidate.intent,
    );
    if (!reduction.accepted || reduction.event === null || reduction.state === null) {
      throw new Error(`warning fixture was rejected: ${reduction.reason}`);
    }
    expect(humanDangerWarningExpressionEventMatchesWorld(
      fixture,
      reduction.event,
    )).toBe(true);

    const acknowledged = acknowledgeSituatedExpression(reduction.state);
    if (acknowledged.state === null) throw new Error("warning acknowledgement failed");
    const expired = advanceSituatedExpression(acknowledged.state, candidate.intent.durationSteps);
    const memory = expired?.recent[0];
    if (memory === undefined) throw new Error("warning cooldown memory is missing");
    expect(humanDangerWarningExpressionMemoryMatchesWorld(fixture, memory)).toBe(true);

    const stale = structuredClone(fixture);
    stale.world.completedTick += 1;
    expect(humanDangerWarningExpressionEventMatchesWorld(stale, reduction.event)).toBe(false);
    expect(humanDangerWarningExpressionMemoryMatchesWorld(stale, memory)).toBe(false);
  });
});
