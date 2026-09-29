import { describe, expect, it } from "vitest";

import {
  createActorObservation,
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
): Readonly<{ world: ReturnType<typeof createWorldView>; resident: ResidentState }> {
  const state = createWorld(`human warning ${perceivedClass}`, "standard");
  const resident = firstResident(state);
  const tick = state.meta.completedTick + 1;
  const frame: ResidentPerceptionFrame = {
    tick,
    residents: state.residents.map((candidate) => ({
      residentId: candidate.id,
      actorId: candidate.identity.stableId,
      observations: candidate.id === resident.id
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
