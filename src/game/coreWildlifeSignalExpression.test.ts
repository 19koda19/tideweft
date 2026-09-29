import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
} from "../sim/actorPerception";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  CORE_ECOLOGY_MAX_STEP_TICKS,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  fishCrowAlarmExpressionEventForTrigger,
  fishCrowAlarmExpressionEventMatchesWorld,
  fishCrowAlarmExpressionIntent,
  fishCrowAlarmExpressionMemoryMatchesWorld,
  type FishCrowAlarmExpressionInput,
} from "./coreWildlifeSignalExpression";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  canonicalizeCoreWildlifeActorState,
  commitCoreWildlifeAlarmEventLocus,
  repositionCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  advanceSituatedExpression,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
} from "./situatedExpression";
import {
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

const ORIGIN = createRegionCoord(-9, 14);
const SEED = seedFromText("living voice authenticated fish crow alarm");
const PREDATOR_ID = "HARRIER-living-voice-test";
const OBSERVATION_ID = "OBS-fish-crow-sees-harrier";

interface AlarmFixture {
  readonly input: FishCrowAlarmExpressionInput;
  readonly initialWorld: CoreEcologyAggregatePatchState;
  readonly rawEvent: FishCrowAlarmExpressionInput["event"];
}

function alarmFixture(
  species: Extract<CoreWildlifeSpecies, "fish-crow" | "gull"> = "fish-crow",
  predatorId = PREDATOR_ID,
  observationId = species === "fish-crow"
    ? OBSERVATION_ID
    : "OBS-gull-sees-harrier",
): AlarmFixture {
  const position = createWorldPosition(ORIGIN, 23_000, 31_000);
  const population: CoreEcologyPopulationInput = {
    species,
    populationKey: `living-voice:${species}`,
    members: [{
      populationOrdinal: 0,
      position,
      heading: 125_000,
      materialization: "materialized",
    }],
  };
  const initialWorld = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: `living-voice:${species}`,
    originRegion: ORIGIN,
    derivation: { kind: "bounded-input-v1" },
    populations: [population],
  });
  const source = sourceActor(initialWorld);
  const observation = createActorObservation({
    id: observationId,
    observerId: source.identity.stableId,
    observedAtTick: 1,
    channel: "vision",
    perceivedClass: "aerial-predator",
    subjectId: predatorId,
    area: {
      center: translateWorldPosition(position, 1_000, 0),
      radiusUnits: 0,
    },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 920_000,
    identification: "identified",
    interrupt: "strong",
  });
  if (observation === null) throw new Error("Fish-crow alarm observation was invalid");
  const stepped = stepCoreEcologyAggregatePatch(initialWorld, {
    tick: 1,
    actorSteps: [{
      actorId: source.identity.stableId,
      observations: [observation],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  if (stepped === null) throw new Error("Fish-crow alarm world step failed");
  const committedActor = sourceActor(stepped.patch);
  const rawEvent = stepped.events.find(({ actorId, kind }) => (
    actorId === committedActor.identity.stableId && kind === "alarm"
  ));
  if (rawEvent === undefined) throw new Error(`${species} alarm event was not committed`);

  // Runtime locomotion follows cognition in the same tick. The adapter takes
  // the final-address authority projection rather than the pre-movement raw
  // event, so save replay and source-bound sound agree on one physical origin.
  const movedActor = repositionCoreWildlifeActor(committedActor, {
    atTick: rawEvent.atTick,
    position: translateWorldPosition(committedActor.address.position, 350, -175),
    heading: committedActor.address.heading,
  });
  const actor = commitCoreWildlifeAlarmEventLocus(movedActor, rawEvent);
  const world = replaceCoreEcologyAggregatePatchActor(stepped.patch, actor);
  const event = Object.freeze({ ...rawEvent, position: actor.address.position });
  return Object.freeze({
    initialWorld,
    input: Object.freeze({ actor, event, world }),
    rawEvent,
  });
}

function sourceActor(world: CoreEcologyAggregatePatchState): CoreWildlifeActorState {
  const actor = world.populations[0]?.members[0]?.actor;
  if (actor === undefined) throw new Error("Alarm fixture lost its source actor");
  return actor;
}

describe("core-wildlife signal expression", () => {
  it("derives one deterministic semantic crow alarm from the exact committed roots", () => {
    const { input, initialWorld, rawEvent } = alarmFixture();
    const first = fishCrowAlarmExpressionIntent(input);
    const second = fishCrowAlarmExpressionIntent(structuredClone(input));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      position: input.actor.address.position,
      meaning: "fish-crow-alarm-call",
      family: "animal-signal",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-perceived-threat",
      priority: 760_000,
      salience: 920_000,
      durationSteps: 6,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(input.event.position).not.toEqual(sourceActor(initialWorld).address.position);
    expect(fishCrowAlarmExpressionIntent({ ...input, event: rawEvent })).toBeNull();

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), first);
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "fish-crow-alarm-call",
        vocalization: "fish-crow-alarm",
      },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "KRAA! KRAA!",
      realizationKey: "situated-expression.en.v1.fish-crow-alarm-call.0",
      vocalization: "fish-crow-alarm",
    });
  });

  it("keeps the perceived predator identity and causal observation out of expression output", () => {
    const { input } = alarmFixture();
    const intent = fishCrowAlarmExpressionIntent(input);
    if (intent === null) throw new Error("Fish-crow alarm intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (reduction.event === null) throw new Error("Fish-crow alarm was not accepted");

    for (const output of [intent, reduction.event, projectSituatedExpression(reduction.event)]) {
      expect(JSON.stringify(output)).not.toContain(PREDATOR_ID);
      expect(JSON.stringify(output)).not.toContain(OBSERVATION_ID);
      expect(JSON.stringify(output)).not.toContain("aerial-predator");
    }

    const alternate = fishCrowAlarmExpressionIntent(alarmFixture(
      "fish-crow",
      "OSPREY-living-voice-test",
      "OBS-fish-crow-sees-osprey",
    ).input);
    expect(alternate).toEqual(intent);
  });

  it("reauthenticates the exact event and its reachable bounded cooldown", () => {
    const { input } = alarmFixture();
    const intent = fishCrowAlarmExpressionIntent(input);
    if (intent === null) throw new Error("Fish-crow alarm intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (!reduction.accepted || reduction.event === null || reduction.state === null) {
      throw new Error("Fish-crow alarm expression was not accepted");
    }
    const advanced = advanceSituatedExpression(reduction.state, intent.durationSteps);
    const memory = advanced?.recent[0];
    if (memory === undefined) throw new Error("Fish-crow alarm cooldown was not retained");

    expect(fishCrowAlarmExpressionEventForTrigger(input, intent.triggerEventId))
      .toEqual(reduction.event);
    expect(fishCrowAlarmExpressionEventMatchesWorld(input, reduction.event)).toBe(true);
    expect(fishCrowAlarmExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(fishCrowAlarmExpressionEventMatchesWorld(input, {
      ...reduction.event,
      triggerEventId: "CROW-forged:e:1:alarm",
    })).toBe(false);
    expect(fishCrowAlarmExpressionMemoryMatchesWorld(input, {
      ...memory,
      priority: memory.priority + 1,
    })).toBe(false);
  });

  it("fails closed on forged identity, tick, cause, position, or event shape", () => {
    const { input } = alarmFixture();
    const forgedEvents = [
      { ...input.event, eventId: `${input.event.eventId}:forged` },
      { ...input.event, actorId: `${input.event.actorId}:other` },
      { ...input.event, atTick: input.event.atTick + 1 },
      { ...input.event, causeReferenceId: "OBS-forged-cause" },
      { ...input.event, observationId: "OBS-forged-cause" },
      {
        ...input.event,
        position: translateWorldPosition(input.event.position, 1, 0),
      },
      { ...input.event, kind: "observe" as const },
      { ...input.event, debug: true },
    ];
    for (const event of forgedEvents) {
      expect(fishCrowAlarmExpressionIntent({ ...input, event })).toBeNull();
    }
  });

  it("fails closed for a valid alarm from the wrong species or a mismatched actor root", () => {
    const crow = alarmFixture();
    const gull = alarmFixture("gull");

    expect(fishCrowAlarmExpressionIntent(gull.input)).toBeNull();
    expect(fishCrowAlarmExpressionIntent({
      ...crow.input,
      event: { ...crow.input.event, species: "gull" },
    })).toBeNull();
    expect(fishCrowAlarmExpressionIntent({
      ...crow.input,
      actor: gull.input.actor,
    })).toBeNull();
  });

  it("fails closed after the source world advances or loses the committed alarm memory", () => {
    const { input } = alarmFixture();
    const current = sourceActor(input.world);
    const later = stepCoreEcologyAggregatePatch(input.world, {
      tick: input.world.updatedAtTick + CORE_ECOLOGY_MAX_STEP_TICKS,
      actorSteps: [{
        actorId: current.identity.stableId,
        observations: [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      }],
    });
    if (later === null) throw new Error("Stale-world fixture failed to advance");
    expect(fishCrowAlarmExpressionIntent({ ...input, world: later.patch })).toBeNull();
    expect(fishCrowAlarmExpressionIntent({
      ...input,
      actor: sourceActor(later.patch),
      world: later.patch,
    })).toBeNull();

    const withoutMemory = canonicalizeCoreWildlifeActorState({
      ...input.actor,
      memories: [],
    });
    if (withoutMemory === null) throw new Error("Memory-forgery fixture became malformed");
    const memorylessWorld = replaceCoreEcologyAggregatePatchActor(input.world, withoutMemory);
    expect(fishCrowAlarmExpressionIntent({
      actor: withoutMemory,
      event: input.event,
      world: memorylessWorld,
    })).toBeNull();
  });
});
