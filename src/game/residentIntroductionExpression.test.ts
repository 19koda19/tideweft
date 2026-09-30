import { describe, expect, it } from "vitest";

import {
  createWorld,
  createWorldView,
  stepWorld,
  type SimEvent,
  type WorldView,
} from "../sim/public";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionMemory,
  type SituatedExpressionState,
} from "./situatedExpression";
import {
  RESIDENT_INTRODUCTION_EXPRESSION_DURATION_STEPS,
  RESIDENT_INTRODUCTION_EXPRESSION_PRIORITY,
  RESIDENT_INTRODUCTION_EXPRESSION_SALIENCE,
  projectResidentIntroductionExpression,
  residentIntroductionExpressionEventForTrigger,
  residentIntroductionExpressionEventMatchesWorld,
  residentIntroductionExpressionIntent,
  residentIntroductionExpressionMemoryMatchesWorld,
  residentIntroductionTriggerEventId,
  resumeResidentIntroductionPresentationEvent,
} from "./residentIntroductionExpression";

interface IntroductionFixture {
  readonly world: WorldView;
  readonly event: SimEvent;
  readonly residentId: number;
}

function fixture(): IntroductionFixture {
  const state = createWorld("a spoken introduction belongs to the world", "standard");
  const resident = state.residents[0];
  if (resident === undefined) throw new Error("fixture needs a resident");
  stepWorld(state, [{
    id: "observe-before-introduction",
    type: "observe-resident",
    residentId: resident.id,
  }]);
  const observedTick = resident.playerKnowledge.firstObservedTick;
  if (observedTick === null) throw new Error("fixture did not observe its resident");
  stepWorld(state, [{
    id: "commit-resident-introduction",
    type: "greet-resident",
    residentId: resident.id,
    observedTick,
  }]);
  const world = createWorldView(state);
  const event = [...world.events].reverse().find((candidate) => (
    candidate.type === "resident-introduced" && candidate.subjectId === resident.id
  ));
  if (event === undefined) throw new Error("fixture did not commit an introduction");
  return { world, event, residentId: resident.id };
}

function map(value: IntroductionFixture): SituatedExpressionIntent | null {
  return residentIntroductionExpressionIntent({
    world: value.world,
    event: value.event,
  });
}

function acceptedExpression(
  intent: SituatedExpressionIntent,
): Readonly<{ event: SituatedExpressionEvent; state: SituatedExpressionState }> {
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduction.accepted || reduction.event === null || reduction.state === null) {
    throw new Error(`fixture expression was not accepted: ${reduction.reason}`);
  }
  return { event: reduction.event, state: reduction.state };
}

describe("resident introduction situated-expression producer", () => {
  it("derives deterministic restrained speech from the exact committed event and current facts", () => {
    const value = fixture();
    const resident = value.world.residents.find(({ id }) => id === value.residentId);
    if (resident === undefined) throw new Error("fixture lost its resident");
    const placement = resolveResidentWorldPlacement(value.world, resident);
    if (placement === null) throw new Error("fixture resident needs a physical position");
    const first = residentIntroductionExpressionIntent({
      world: value.world,
      event: structuredClone(value.event),
    });
    const second = residentIntroductionExpressionIntent({
      world: structuredClone(value.world),
      event: structuredClone(value.event),
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      sourceActorId: resident.identity.stableId,
      triggerEventId: `sim-event:resident-introduced:${value.event.sequence}:${resident.id}`,
      position: placement.position,
      meaning: "resident-introduction",
      family: "social",
      tone: "restrained",
      volume: "spoken",
      knowledgeBasis: "self-committed-introduction",
      priority: RESIDENT_INTRODUCTION_EXPRESSION_PRIORITY,
      salience: RESIDENT_INTRODUCTION_EXPRESSION_SALIENCE,
      durationSteps: RESIDENT_INTRODUCTION_EXPRESSION_DURATION_STEPS,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(residentIntroductionTriggerEventId(value.event)).toBe(
      `sim-event:resident-introduced:${value.event.sequence}:${resident.id}`,
    );
  });

  it("keeps identity prose out of the durable event and resolves it only from reauthenticated context", () => {
    const value = fixture();
    const resident = value.world.residents.find(({ id }) => id === value.residentId);
    if (resident === undefined) throw new Error("fixture lost its resident");
    const home = value.world.settlements.find(({ id }) => id === resident.homeSettlementId);
    if (home === undefined) throw new Error("fixture lost its resident home");
    const intent = map(value);
    if (intent === null) throw new Error("fixture omitted its introduction intent");
    const accepted = acceptedExpression(intent);

    expect(accepted.event).not.toHaveProperty("text");
    expect(accepted.event).not.toHaveProperty("name");
    expect(accepted.event).not.toHaveProperty("role");
    expect(accepted.event).not.toHaveProperty("homeSettlementId");
    const durableJson = JSON.stringify(accepted.event);
    expect(durableJson).not.toContain(resident.name);
    expect(durableJson).not.toContain(home.name);
    expect(durableJson).not.toContain(`"${resident.role}"`);
    expect(projectSituatedExpression(accepted.event)?.text).toBe(
      "Let me introduce myself.",
    );
    expect(projectResidentIntroductionExpression(value.world, accepted.event)).toEqual({
      text: `${resident.name}. ${titleCaseWord(resident.role)}, out of ${home.name}.`,
    });
    expect(Object.isFrozen(
      projectResidentIntroductionExpression(value.world, accepted.event),
    )).toBe(true);

    // The shared event exposes only a source identity and semantic speech. Its
    // personalized identity facts exist exclusively at the player projection
    // boundary, so an anonymous hearing observation cannot acquire them.
    expect(Object.keys(accepted.event)).not.toEqual(expect.arrayContaining([
      "facts",
      "homeName",
      "occupation",
      "residentName",
    ]));
  });

  it("reauthenticates evolved event and cooldown state from the same introduction", () => {
    const value = fixture();
    const intent = map(value);
    if (intent === null) throw new Error("fixture omitted its introduction intent");
    const accepted = acceptedExpression(intent);

    expect(residentIntroductionExpressionEventForTrigger(
      value.world,
      intent.triggerEventId,
    )).toEqual(accepted.event);
    expect(residentIntroductionExpressionEventMatchesWorld(
      value.world,
      accepted.event,
    )).toBe(true);

    const acknowledged = acknowledgeSituatedExpression(accepted.state);
    if (acknowledged.state === null) throw new Error("fixture event was not acknowledged");
    const advanced = advanceSituatedExpression(acknowledged.state, 3);
    if (advanced === null || advanced.active === null || advanced.recent[0] === undefined) {
      throw new Error("fixture introduction expired before authentication");
    }
    expect(residentIntroductionExpressionEventMatchesWorld(
      value.world,
      advanced.active,
    )).toBe(true);
    expect(residentIntroductionExpressionMemoryMatchesWorld(
      value.world,
      advanced.recent[0],
    )).toBe(true);
  });

  it("rebuilds only the acknowledged unexpired presentation remainder", () => {
    const value = fixture();
    const intent = map(value);
    if (intent === null) throw new Error("fixture omitted its introduction intent");
    const accepted = acceptedExpression(intent);
    const advanced = advanceSituatedExpression(accepted.state, 7);
    const memory = advanced?.recent[0];
    if (memory === undefined) throw new Error("fixture lost introduction memory");

    expect(resumeResidentIntroductionPresentationEvent(value.world, memory)).toMatchObject({
      eventId: accepted.event.eventId,
      remainingSteps: RESIDENT_INTRODUCTION_EXPRESSION_DURATION_STEPS - 7,
      audioAcknowledged: true,
    });

    const expired = advanceSituatedExpression(accepted.state, 60)?.recent[0];
    if (expired === undefined) throw new Error("fixture lost expired cooldown memory");
    expect(resumeResidentIntroductionPresentationEvent(value.world, expired)).toBeNull();
  });

  it("keeps the retained sound at its event-time locus when the resident later moves", () => {
    const value = fixture();
    const intent = map(value);
    if (intent === null) throw new Error("fixture omitted its introduction intent");
    const accepted = acceptedExpression(intent);
    const moved = structuredClone(value.world) as MutableWorld;
    const resident = moved.residents.find(({ id }) => id === value.residentId);
    const otherSettlement = moved.settlements.find(({ id }) => (
      id !== resident?.homeSettlementId
    ));
    if (resident === undefined || otherSettlement === undefined) {
      throw new Error("moving introduction fixture needs another settlement");
    }
    resident.location = { kind: "settlement", settlementId: otherSettlement.id };

    expect(residentIntroductionExpressionEventMatchesWorld(
      moved,
      accepted.event,
    )).toBe(true);
    expect(residentIntroductionExpressionEventForTrigger(
      moved,
      accepted.event.triggerEventId,
    )?.position).toEqual(accepted.event.position);
    expect(projectResidentIntroductionExpression(moved, accepted.event)).not.toBeNull();
  });

  it("fails closed for unretained, inconsistent, or forged introduction authority", () => {
    const value = fixture();
    const intent = map(value);
    if (intent === null) throw new Error("fixture omitted its introduction intent");
    const accepted = acceptedExpression(intent);
    const memory = accepted.state.recent[0];
    if (memory === undefined) throw new Error("fixture omitted cooldown memory");

    const unretained = structuredClone(value.event);
    unretained.sequence += 100_000;
    expect(residentIntroductionExpressionIntent({
      world: value.world,
      event: unretained,
    })).toBeNull();

    const brokenFacts = structuredClone(value.world) as MutableWorld;
    const factsResident = brokenFacts.residents.find(({ id }) => id === value.residentId);
    if (factsResident === undefined) throw new Error("fixture clone lost its resident");
    factsResident.playerKnowledge.facts = ["name", "home"];
    expect(residentIntroductionExpressionIntent({
      world: brokenFacts,
      event: eventBySequence(brokenFacts, value.event.sequence),
    })).toBeNull();

    const brokenTick = structuredClone(value.world) as MutableWorld;
    const tickResident = brokenTick.residents.find(({ id }) => id === value.residentId);
    if (tickResident === undefined) throw new Error("fixture clone lost its resident");
    tickResident.playerKnowledge.introducedTick = value.event.tick + 1;
    expect(residentIntroductionExpressionIntent({
      world: brokenTick,
      event: eventBySequence(brokenTick, value.event.sequence),
    })).toBeNull();

    const brokenMemory = structuredClone(value.world) as MutableWorld;
    const memoryResident = brokenMemory.residents.find(({ id }) => id === value.residentId);
    if (memoryResident === undefined) throw new Error("fixture clone lost its resident");
    memoryResident.memories = [];
    expect(residentIntroductionExpressionIntent({
      world: brokenMemory,
      event: eventBySequence(brokenMemory, value.event.sequence),
    })).toBeNull();

    const wrongHome = structuredClone(value.world) as MutableWorld;
    const homeEvent = eventBySequence(wrongHome, value.event.sequence);
    homeEvent.data.homeSettlementId = value.event.data.homeSettlementId as number + 1;
    expect(residentIntroductionExpressionIntent({
      world: wrongHome,
      event: homeEvent,
    })).toBeNull();

    const malformedData = structuredClone(value.world) as MutableWorld;
    const malformedEvent = eventBySequence(malformedData, value.event.sequence);
    malformedEvent.data.prose = "identity must not live here";
    expect(residentIntroductionExpressionIntent({
      world: malformedData,
      event: malformedEvent,
    })).toBeNull();

    const forgedLocus = structuredClone(value.world) as MutableWorld;
    const forgedLocusEvent = eventBySequence(forgedLocus, value.event.sequence);
    forgedLocusEvent.data.eventSettlementOrdinal = -1;
    expect(residentIntroductionExpressionIntent({
      world: forgedLocus,
      event: forgedLocusEvent,
    })).toBeNull();

    const forgedEvent: SituatedExpressionEvent = {
      ...accepted.event,
      priority: accepted.event.priority + 1,
    };
    expect(residentIntroductionExpressionEventMatchesWorld(
      value.world,
      forgedEvent,
    )).toBe(false);
    expect(projectResidentIntroductionExpression(value.world, forgedEvent)).toBeNull();
    const forgedMemory: SituatedExpressionMemory = {
      ...memory,
      priority: memory.priority + 1,
    };
    expect(residentIntroductionExpressionMemoryMatchesWorld(
      value.world,
      forgedMemory,
    )).toBe(false);
    expect(residentIntroductionExpressionEventForTrigger(
      value.world,
      `${intent.triggerEventId}:forged`,
    )).toBeNull();
  });
});

type MutableWorld = Omit<WorldView, "events" | "residents"> & {
  events: SimEvent[];
  residents: Array<WorldView["residents"][number] & {
    playerKnowledge: WorldView["residents"][number]["playerKnowledge"];
    memories: WorldView["residents"][number]["memories"];
  }>;
};

function eventBySequence(world: MutableWorld, sequence: number): SimEvent {
  const event = world.events.find((candidate) => candidate.sequence === sequence);
  if (event === undefined) throw new Error("fixture clone lost its introduction event");
  return event;
}

function titleCaseWord(value: string): string {
  return value.length === 0
    ? value
    : `${value[0]?.toLocaleUpperCase() ?? ""}${value.slice(1)}`;
}
