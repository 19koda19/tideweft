import { describe, expect, it } from "vitest";

import {
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  canonicalizeCoreWildlifeActorState,
  repositionCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
  type CoreWildlifeMemory,
} from "./coreWildlifeActor";
import {
  DOMESTIC_CAT_RAIN_DISTRESS_EXPRESSION_PRIORITY,
  coreWildlifeWeatherDistressExpressionEventForTrigger,
  coreWildlifeWeatherDistressExpressionEventMatchesWorld,
  coreWildlifeWeatherDistressExpressionIntent,
  coreWildlifeWeatherDistressExpressionMemoryMatchesWorld,
  type CoreWildlifeWeatherDistressExpressionInput,
} from "./coreWildlifeWeatherDistressExpression";
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

const ORIGIN = createRegionCoord(-4, 9);
const SEED = seedFromText("domestic cat rain distress Living Voice fixture");

interface WeatherDistressFixture {
  readonly input: CoreWildlifeWeatherDistressExpressionInput;
  readonly initialWorld: CoreEcologyAggregatePatchState;
  readonly rawActor: CoreWildlifeActorState;
}

function weatherDistressFixture(
  observationId = "OBS-cat-current-rain",
): WeatherDistressFixture {
  const position = createWorldPosition(ORIGIN, 23_000, 31_000);
  const population: CoreEcologyPopulationInput = {
    species: "domestic-cat",
    populationKey: "living-voice:domestic-cat",
    members: [{
      populationOrdinal: 0,
      position,
      heading: 125_000,
      materialization: "materialized",
    }],
  };
  const initialWorld = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "living-voice:domestic-cat",
    originRegion: ORIGIN,
    derivation: { kind: "bounded-input-v1" },
    populations: [population],
  });
  const source = sourceActor(initialWorld);
  const observation = rainObservation(source, 1, observationId);
  const stepped = stepCoreEcologyAggregatePatch(initialWorld, {
    tick: 1,
    actorSteps: [{
      actorId: source.identity.stableId,
      observations: [observation],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  if (stepped === null) throw new Error("Cat rain-distress fixture did not step");
  const rawActor = sourceActor(stepped.patch);
  const event = stepped.events.find(({ actorId, kind }) => (
    actorId === rawActor.identity.stableId && kind === "retreat"
  ));
  if (event === undefined) throw new Error("Cat rain-distress retreat was not committed");

  // The retained wet-track locus owns the call even if same-tick locomotion
  // has already moved the cat's body before Living Voice consumes the event.
  const actor = repositionCoreWildlifeActor(rawActor, {
    atTick: event.atTick,
    position: translateWorldPosition(rawActor.address.position, 350, -175),
    heading: rawActor.address.heading,
  });
  const world = replaceCoreEcologyAggregatePatchActor(stepped.patch, actor);
  return Object.freeze({
    input: Object.freeze({ actor, event, world }),
    initialWorld,
    rawActor,
  });
}

function nonRainRetreatFixture(): CoreWildlifeWeatherDistressExpressionInput {
  const position = createWorldPosition(ORIGIN, 17_000, 29_000);
  const world = createCoreEcologyAggregatePatch({
    seed: seedFromText("domestic cat non-rain retreat fixture"),
    patchKey: "living-voice:domestic-cat-threat",
    originRegion: ORIGIN,
    derivation: { kind: "bounded-input-v1" },
    populations: [{
      species: "domestic-cat",
      populationKey: "living-voice:domestic-cat-threat",
      members: [{ populationOrdinal: 0, position, materialization: "materialized" }],
    }],
  });
  const actor = sourceActor(world);
  const observation = createActorObservation({
    id: "OBS-cat-sees-human",
    observerId: actor.identity.stableId,
    observedAtTick: 1,
    channel: "vision",
    perceivedClass: "human",
    subjectId: "HUMAN-cat-threat-fixture",
    area: { center: actor.address.position, radiusUnits: 0 },
    confidence: 800_000,
    salience: 800_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Cat non-rain observation was invalid");
  const stepped = stepCoreEcologyAggregatePatch(world, {
    tick: 1,
    actorSteps: [{
      actorId: actor.identity.stableId,
      observations: [observation],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  if (stepped === null) throw new Error("Cat non-rain fixture did not step");
  const committed = sourceActor(stepped.patch);
  const event = stepped.events.find(({ kind }) => kind === "retreat");
  if (event === undefined) throw new Error("Cat non-rain retreat was not committed");
  return Object.freeze({ actor: committed, event, world: stepped.patch });
}

function nonCatFixture(): CoreWildlifeWeatherDistressExpressionInput {
  const position = createWorldPosition(ORIGIN, 11_000, 13_000);
  const world = createCoreEcologyAggregatePatch({
    seed: seedFromText("deer rain control fixture"),
    patchKey: "living-voice:deer-rain-control",
    originRegion: ORIGIN,
    derivation: { kind: "bounded-input-v1" },
    populations: [{
      species: "deer",
      populationKey: "living-voice:deer-rain-control",
      members: [{ populationOrdinal: 0, position, materialization: "materialized" }],
    }],
  });
  const actor = sourceActor(world);
  const observation = rainObservation(actor, 1, "OBS-deer-rain-control");
  const stepped = stepCoreEcologyAggregatePatch(world, {
    tick: 1,
    actorSteps: [{
      actorId: actor.identity.stableId,
      observations: [observation],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  if (stepped === null) throw new Error("Deer rain control did not step");
  const committed = sourceActor(stepped.patch);
  const event = stepped.events[0];
  if (event === undefined) throw new Error("Deer rain control omitted event");
  return Object.freeze({ actor: committed, event, world: stepped.patch });
}

function rainObservation(
  actor: CoreWildlifeActorState,
  tick: number,
  id: string,
): ActorObservation {
  const observation = createActorObservation({
    id,
    observerId: actor.identity.stableId,
    observedAtTick: tick,
    channel: "hearing",
    perceivedClass: "rain-exposure",
    subjectId: null,
    area: {
      center: actor.address.position,
      radiusUnits: MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
    },
    confidence: 680_000,
    salience: 680_000,
    identification: "anonymous",
  });
  if (observation === null) throw new Error("Cat rain observation was invalid");
  return observation;
}

function sourceActor(world: CoreEcologyAggregatePatchState): CoreWildlifeActorState {
  const actor = world.populations[0]?.members[0]?.actor;
  if (actor === undefined) throw new Error("Weather-distress fixture lost its source actor");
  return actor;
}

function replaceMemories(
  input: CoreWildlifeWeatherDistressExpressionInput,
  memories: readonly CoreWildlifeMemory[],
): CoreWildlifeWeatherDistressExpressionInput {
  const actor = canonicalizeCoreWildlifeActorState({ ...input.actor, memories });
  if (actor === null) throw new Error("Forged-memory fixture was not canonical");
  return Object.freeze({
    actor,
    event: input.event,
    world: replaceCoreEcologyAggregatePatchActor(input.world, actor),
  });
}

function eventAtNextRainTick(
  input: CoreWildlifeWeatherDistressExpressionInput,
): CoreWildlifeWeatherDistressExpressionInput {
  const tick = input.world.updatedAtTick + 1;
  const observation = rainObservation(input.actor, tick, "OBS-cat-continuing-rain");
  const stepped = stepCoreEcologyAggregatePatch(input.world, {
    tick,
    actorSteps: [{
      actorId: input.actor.identity.stableId,
      observations: [observation],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  if (stepped === null) throw new Error("Continued-rain fixture did not step");
  const actor = sourceActor(stepped.patch);
  const event = stepped.events.find(({ actorId }) => actorId === actor.identity.stableId);
  if (event === undefined) throw new Error("Continued-rain fixture omitted event");
  return Object.freeze({ actor, event, world: stepped.patch });
}

describe("core-wildlife weather-distress expression", () => {
  it("derives one deterministic restrained cat call from exact committed rain roots", () => {
    const { input, rawActor } = weatherDistressFixture();
    const first = coreWildlifeWeatherDistressExpressionIntent(input);
    const second = coreWildlifeWeatherDistressExpressionIntent(structuredClone(input));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      position: input.event.position,
      meaning: "domestic-cat-rain-distress-call",
      family: "animal-signal",
      tone: "restrained",
      volume: "murmur",
      knowledgeBasis: "self-weather-distress",
      priority: DOMESTIC_CAT_RAIN_DISTRESS_EXPRESSION_PRIORITY,
      salience: 680_000,
      durationSteps: 6,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(input.actor.address.position).not.toEqual(input.event.position);
    expect(rawActor.address.position).toEqual(input.event.position);

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), first);
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "domestic-cat-rain-distress-call",
        vocalization: "domestic-cat-rain-distress",
      },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "MRROW.",
      realizationKey: "situated-expression.en.v1.domestic-cat-rain-distress-call.0",
      vocalization: "domestic-cat-rain-distress",
    });
  });

  it("reauthenticates the exact event and its reachable bounded cooldown", () => {
    const { input } = weatherDistressFixture();
    const intent = coreWildlifeWeatherDistressExpressionIntent(input);
    if (intent === null) throw new Error("Cat rain-distress intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (!reduction.accepted || reduction.event === null || reduction.state === null) {
      throw new Error("Cat rain-distress expression was not accepted");
    }
    const advanced = advanceSituatedExpression(reduction.state, intent.durationSteps);
    const memory = advanced?.recent[0];
    if (memory === undefined) throw new Error("Cat rain-distress cooldown was not retained");

    expect(coreWildlifeWeatherDistressExpressionEventForTrigger(
      input,
      intent.triggerEventId,
    )).toEqual(reduction.event);
    expect(coreWildlifeWeatherDistressExpressionEventMatchesWorld(input, reduction.event))
      .toBe(true);
    expect(coreWildlifeWeatherDistressExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(coreWildlifeWeatherDistressExpressionEventMatchesWorld(input, {
      ...reduction.event,
      salience: reduction.event.salience - 1,
    })).toBe(false);
    expect(coreWildlifeWeatherDistressExpressionMemoryMatchesWorld(input, {
      ...memory,
      priority: memory.priority + 1,
    })).toBe(false);
    expect(coreWildlifeWeatherDistressExpressionEventForTrigger(
      input,
      `${intent.triggerEventId}:forged`,
    )).toBeNull();
  });

  it("keeps private weather cognition and trace identity out of expression output", () => {
    const { input } = weatherDistressFixture();
    const intent = coreWildlifeWeatherDistressExpressionIntent(input);
    if (intent === null) throw new Error("Cat rain-distress intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (reduction.event === null) throw new Error("Cat rain-distress expression was not accepted");

    for (const output of [intent, reduction.event, projectSituatedExpression(reduction.event)]) {
      expect(JSON.stringify(output)).not.toContain("OBS-cat-current-rain");
      expect(JSON.stringify(output)).not.toContain("weather:rain");
      expect(JSON.stringify(output)).not.toContain("wet-tracks");
      expect(JSON.stringify(output)).not.toContain("rain-exposure");
    }
    expect(coreWildlifeWeatherDistressExpressionIntent(
      weatherDistressFixture("OBS-cat-alternate-current-rain").input,
    )).toEqual(intent);
  });

  it("silences non-cat, non-rain, and continuing rain transitions", () => {
    const { input } = weatherDistressFixture();
    const continued = eventAtNextRainTick(input);
    expect(continued.event.kind).toBe("retreat");
    expect(continued.actor.memories.some(({ eventId }) => (
      eventId === continued.event.eventId
    ))).toBe(false);

    expect(coreWildlifeWeatherDistressExpressionIntent(nonCatFixture())).toBeNull();
    expect(coreWildlifeWeatherDistressExpressionIntent(nonRainRetreatFixture())).toBeNull();
    expect(coreWildlifeWeatherDistressExpressionIntent(continued)).toBeNull();
  });

  it("fails closed on forged event identity, tick, cause, locus, or shape", () => {
    const { input } = weatherDistressFixture();
    const forgedEvents: readonly CoreWildlifeCausalEvent[] = [
      { ...input.event, eventId: `${input.event.eventId}:forged` },
      { ...input.event, actorId: `${input.event.actorId}:other` },
      { ...input.event, atTick: input.event.atTick + 1 },
      { ...input.event, causeReferenceId: "OBS-forged-cause" },
      { ...input.event, observationId: "OBS-forged-cause" },
      { ...input.event, position: translateWorldPosition(input.event.position, 1, 0) },
      { ...input.event, species: "deer" },
      { ...input.event, kind: "observe" },
    ];
    for (const event of forgedEvents) {
      expect(coreWildlifeWeatherDistressExpressionIntent({ ...input, event })).toBeNull();
    }
    expect(coreWildlifeWeatherDistressExpressionIntent({
      ...input,
      event: { ...input.event, debug: true } as CoreWildlifeCausalEvent,
    })).toBeNull();
  });

  it("fails closed without the unique weather memory and exact wet-track locus", () => {
    const { input } = weatherDistressFixture();
    const causal = input.actor.memories.find(({ eventId }) => eventId === input.event.eventId);
    if (causal?.environmentalEvidence === undefined) {
      throw new Error("Cat rain-distress fixture omitted wet tracks");
    }
    expect(coreWildlifeWeatherDistressExpressionIntent(replaceMemories(
      input,
      input.actor.memories.filter(({ eventId }) => eventId !== input.event.eventId),
    ))).toBeNull();

    const displacedTrace = {
      ...causal,
      environmentalEvidence: {
        ...causal.environmentalEvidence,
        position: translateWorldPosition(causal.environmentalEvidence.position, 1, 0),
      },
    };
    expect(coreWildlifeWeatherDistressExpressionIntent(replaceMemories(
      input,
      input.actor.memories.map((memory) => (
        memory.eventId === causal.eventId ? displacedTrace : memory
      )),
    ))).toBeNull();

    const duplicateEventId = `${input.actor.identity.stableId}:weather:${input.event.atTick}`;
    const competingMemory: CoreWildlifeMemory = {
      ...causal,
      eventId: duplicateEventId,
      environmentalEvidence: {
        ...causal.environmentalEvidence,
        evidenceId: `${duplicateEventId}:wet-tracks`,
      },
    };
    expect(coreWildlifeWeatherDistressExpressionIntent(replaceMemories(
      input,
      [...input.actor.memories, competingMemory],
    ))).toBeNull();
  });

  it("requires the exact materialized actor and ecology root", () => {
    const first = weatherDistressFixture();
    const second = weatherDistressFixture("OBS-cat-other-root-rain");
    expect(coreWildlifeWeatherDistressExpressionIntent({
      ...first.input,
      actor: second.input.actor,
    })).toBeNull();
    expect(coreWildlifeWeatherDistressExpressionIntent({
      ...first.input,
      world: first.initialWorld,
    })).toBeNull();

    const coarseWorld = canonicalizeCoreEcologyAggregatePatch({
      ...first.input.world,
      populations: first.input.world.populations.map((population) => ({
        ...population,
        members: population.members.map((member) => ({
          ...member,
          materialization: "coarse",
        })),
      })),
    });
    if (coarseWorld === null) throw new Error("Coarse ownership fixture was not canonical");
    expect(coreWildlifeWeatherDistressExpressionIntent({
      ...first.input,
      world: coarseWorld,
    })).toBeNull();
  });
});
