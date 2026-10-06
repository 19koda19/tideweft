import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  stepActorPerception,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  canonicalizeCoreWildlifeActorState,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
  type CoreWildlifeMemory,
} from "./coreWildlifeActor";
import {
  MARSH_FOX_PURSUIT_YIP_EXPRESSION_PRIORITY,
  coreWildlifePursuitExpressionEventForTrigger,
  coreWildlifePursuitExpressionEventMatchesWorld,
  coreWildlifePursuitExpressionIntent,
  coreWildlifePursuitExpressionMemoryMatchesWorld,
  retainedCoreWildlifePursuitExpressionEventForTrigger,
  retainedCoreWildlifePursuitExpressionEventMatchesWorld,
  retainedCoreWildlifePursuitExpressionMemoryMatchesWorld,
  type CoreWildlifePursuitExpressionInput,
} from "./coreWildlifePursuitExpression";
import {
  advanceSituatedExpression,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionMemory,
} from "./situatedExpression";
import {
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

const ORIGIN = createRegionCoord(-12, 6);
const SEED = seedFromText("marsh fox pursuit Living Voice fixture");
const OBSERVATION_ID = "OBS-marsh-fox-sees-live-prey";

interface PursuitFixture {
  readonly input: CoreWildlifePursuitExpressionInput;
  readonly initialWorld: CoreEcologyAggregatePatchState;
  readonly rawEvent: CoreWildlifeCausalEvent;
}

function pursuitFixture(
  observationId = OBSERVATION_ID,
): PursuitFixture {
  const foxPosition = createWorldPosition(ORIGIN, 23_000, 31_000);
  const rabbitPosition = translateWorldPosition(foxPosition, 1_000, 0);
  let initialWorld = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "living-voice:marsh-fox-pursuit",
    originRegion: ORIGIN,
    derivation: { kind: "bounded-input-v1" },
    populations: [{
      species: "marsh-fox",
      populationKey: "living-voice:marsh-fox",
      members: [{
        populationOrdinal: 0,
        position: foxPosition,
        heading: 125_000,
        materialization: "materialized",
      }],
    }, {
      species: "marsh-rabbit",
      populationKey: "living-voice:marsh-rabbit-prey",
      members: [{
        populationOrdinal: 0,
        position: rabbitPosition,
        heading: 625_000,
        materialization: "materialized",
      }],
    }],
  });
  const initialFox = actorFor(initialWorld, "marsh-fox");
  const rabbit = actorFor(initialWorld, "marsh-rabbit");
  const fox = replaceCoreWildlifeActorPhysiology(initialFox, {
    atTick: initialWorld.updatedAtTick,
    needs: { ...initialFox.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: initialFox.condition,
  });
  initialWorld = replaceCoreEcologyAggregatePatchActor(initialWorld, fox);
  const observation = createActorObservation({
    id: observationId,
    observerId: fox.identity.stableId,
    observedAtTick: 1,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: rabbit.identity.stableId,
    area: { center: rabbit.address.position, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 900_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Pursuit observation was invalid");
  const stepped = stepCoreEcologyAggregatePatch(initialWorld, {
    tick: 1,
    actorSteps: [{
      actorId: fox.identity.stableId,
      observations: [observation],
      foodOpportunities: [{
        resourceId: rabbit.identity.stableId,
        observationId: observation.id,
        foodClass: "live-prey",
        sourceKind: "living-actor",
        availableUnits: 1,
        nutrition: 900_000,
        effort: 10_000,
        risk: 0,
        competition: 0,
        directlyConfirmed: true,
        accessible: true,
      }],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }, {
      actorId: rabbit.identity.stableId,
      observations: [],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  if (stepped === null) throw new Error("Pursuit fixture world did not step");
  const committedFox = actorFor(stepped.patch, "marsh-fox");
  const rawEvent = stepped.events.find(({ actorId, kind }) => (
    actorId === committedFox.identity.stableId && kind === "pursue"
  ));
  if (rawEvent === undefined) throw new Error("Pursuit event was not committed");

  // Runtime locomotion commits after cognition. Living Voice binds the yip to
  // the fox's post-commit body address, never the stale pre-move event point.
  const actor = repositionCoreWildlifeActor(committedFox, {
    atTick: rawEvent.atTick,
    position: translateWorldPosition(committedFox.address.position, 350, -175),
    heading: committedFox.address.heading,
  });
  const world = replaceCoreEcologyAggregatePatchActor(stepped.patch, actor);
  const event = Object.freeze({ ...rawEvent, position: actor.address.position });
  return Object.freeze({
    input: Object.freeze({ actor, event, world }),
    initialWorld,
    rawEvent,
  });
}

function actorFor(
  world: CoreEcologyAggregatePatchState,
  species: "marsh-fox" | "marsh-rabbit",
): CoreWildlifeActorState {
  const actor = world.populations.find((population) => population.species === species)
    ?.members[0]?.actor;
  if (actor === undefined) throw new Error(`Fixture lost ${species}`);
  return actor;
}

function replaceMemories(
  input: CoreWildlifePursuitExpressionInput,
  memories: readonly CoreWildlifeMemory[],
): CoreWildlifePursuitExpressionInput {
  const actor = canonicalizeCoreWildlifeActorState({ ...input.actor, memories });
  if (actor === null) throw new Error("Forged pursuit-memory fixture was not canonical");
  return Object.freeze({
    actor,
    event: input.event,
    world: replaceCoreEcologyAggregatePatchActor(input.world, actor),
  });
}

function allCoarseInput(
  input: CoreWildlifePursuitExpressionInput,
): CoreWildlifePursuitExpressionInput {
  const world = setCoreEcologyAggregatePatchMaterializedActors(input.world, {
    atTick: input.world.updatedAtTick,
    actorIds: [],
  });
  return Object.freeze({ ...input, actor: actorFor(world, "marsh-fox"), world });
}

function expressionFor(input: CoreWildlifePursuitExpressionInput) {
  const intent = coreWildlifePursuitExpressionIntent(input);
  if (intent === null) throw new Error("Pursuit-yip intent was not derived");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) {
    throw new Error("Pursuit-yip expression was not accepted");
  }
  return { intent, event: reduction.event, memory, state: reduction.state };
}

function replaceOwnedActor(
  input: CoreWildlifePursuitExpressionInput,
  actorValue: unknown,
): CoreWildlifePursuitExpressionInput {
  const actor = canonicalizeCoreWildlifeActorState(actorValue);
  if (actor === null) throw new Error("Retained-pursuit actor fixture was not canonical");
  return Object.freeze({
    actor,
    event: input.event,
    world: replaceCoreEcologyAggregatePatchActor(input.world, actor),
  });
}

function expectRetainedRejection(
  input: CoreWildlifePursuitExpressionInput,
  event: SituatedExpressionEvent,
  memory: SituatedExpressionMemory,
): void {
  expect(retainedCoreWildlifePursuitExpressionEventForTrigger(input, event.triggerEventId))
    .toBeNull();
  expect(retainedCoreWildlifePursuitExpressionEventMatchesWorld(input, event)).toBe(false);
  expect(retainedCoreWildlifePursuitExpressionMemoryMatchesWorld(input, memory)).toBe(false);
}

describe("core-wildlife pursuit expression", () => {
  it("derives one restrained yip from an exact newly entered marsh-fox pursuit", () => {
    const { input, rawEvent } = pursuitFixture();
    const first = coreWildlifePursuitExpressionIntent(input);
    const second = coreWildlifePursuitExpressionIntent(structuredClone(input));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      position: input.actor.address.position,
      meaning: "marsh-fox-pursuit-yip",
      family: "animal-signal",
      tone: "restrained",
      volume: "spoken",
      knowledgeBasis: "self-perceived-prey",
      priority: MARSH_FOX_PURSUIT_YIP_EXPRESSION_PRIORITY,
      salience: 900_000,
      durationSteps: 6,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(input.event.position).not.toEqual(rawEvent.position);
    expect(coreWildlifePursuitExpressionIntent({ ...input, event: rawEvent })).toBeNull();

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), first);
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "marsh-fox-pursuit-yip",
        vocalization: "marsh-fox-pursuit-yip",
      },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "YIP.",
      realizationKey: "situated-expression.en.v1.marsh-fox-pursuit-yip.0",
      vocalization: "marsh-fox-pursuit-yip",
    });
  });

  it("reauthenticates the exact event and its reachable bounded cooldown", () => {
    const { input } = pursuitFixture();
    const intent = coreWildlifePursuitExpressionIntent(input);
    if (intent === null) throw new Error("Pursuit-yip intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (!reduction.accepted || reduction.event === null || reduction.state === null) {
      throw new Error("Pursuit-yip expression was not accepted");
    }
    const advanced = advanceSituatedExpression(reduction.state, intent.durationSteps);
    const memory = advanced?.recent[0];
    if (memory === undefined) throw new Error("Pursuit-yip cooldown was not retained");

    expect(coreWildlifePursuitExpressionEventForTrigger(input, intent.triggerEventId))
      .toEqual(reduction.event);
    expect(coreWildlifePursuitExpressionEventMatchesWorld(input, reduction.event)).toBe(true);
    expect(coreWildlifePursuitExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(coreWildlifePursuitExpressionEventMatchesWorld(input, {
      ...reduction.event,
      salience: reduction.event.salience - 1,
    })).toBe(false);
    expect(coreWildlifePursuitExpressionMemoryMatchesWorld(input, {
      ...memory,
      priority: memory.priority + 1,
    })).toBe(false);
    expect(coreWildlifePursuitExpressionEventForTrigger(
      input,
      `${intent.triggerEventId}:forged`,
    )).toBeNull();
  });

  it("retains the exact same-tick committed yip and cooldown without authorizing a fresh coarse call", () => {
    const { input } = pursuitFixture();
    const expression = expressionFor(input);
    const coarse = allCoarseInput(input);
    const before = structuredClone(coarse);
    const advanced = advanceSituatedExpression(expression.state, expression.intent.durationSteps);
    const cooledMemory = advanced?.recent[0];
    if (cooledMemory === undefined) throw new Error("Pursuit-yip cooldown was not retained");

    expect(coarse.world.updatedAtTick).toBe(input.event.atTick);
    expect(coarse.world.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);
    expect(coarse.actor).toEqual(input.actor);
    expect(actorFor(coarse.world, "marsh-rabbit")).toEqual(actorFor(input.world, "marsh-rabbit"));

    for (const retainedInput of [input, coarse, structuredClone(coarse)]) {
      expect(retainedCoreWildlifePursuitExpressionEventForTrigger(
        retainedInput,
        expression.event.triggerEventId,
      )).toEqual(expression.event);
      expect(retainedCoreWildlifePursuitExpressionEventMatchesWorld(
        retainedInput,
        expression.event,
      )).toBe(true);
      expect(retainedCoreWildlifePursuitExpressionMemoryMatchesWorld(
        retainedInput,
        expression.memory,
      )).toBe(true);
      expect(retainedCoreWildlifePursuitExpressionMemoryMatchesWorld(
        retainedInput,
        cooledMemory,
      )).toBe(true);
    }
    expect(coreWildlifePursuitExpressionIntent(coarse)).toBeNull();
    expect(coreWildlifePursuitExpressionEventForTrigger(coarse, expression.event.triggerEventId))
      .toBeNull();
    expect(coreWildlifePursuitExpressionEventMatchesWorld(coarse, expression.event)).toBe(false);
    expect(coreWildlifePursuitExpressionMemoryMatchesWorld(coarse, expression.memory)).toBe(false);
    expect(coreWildlifePursuitExpressionMemoryMatchesWorld(coarse, cooledMemory)).toBe(false);
    expect(coarse).toEqual(before);
  });

  it("does not turn a legal next-tick coarse step into a fresh or retained pursuit", () => {
    const { input } = pursuitFixture();
    const expression = expressionFor(input);
    const coarse = allCoarseInput(input);
    const stepped = stepCoreEcologyAggregatePatch(coarse.world, {
      tick: input.event.atTick + 1,
      actorSteps: [],
    });
    if (stepped === null) throw new Error("All-coarse pursuit fixture did not step");
    const nextInput = {
      actor: actorFor(stepped.patch, "marsh-fox"),
      event: input.event,
      world: stepped.patch,
    };

    expect(stepped.events).toEqual([]);
    expect(stepped.patch.updatedAtTick).toBe(input.event.atTick + 1);
    expect(nextInput.actor.updatedAtTick).toBe(input.event.atTick + 1);
    expect(nextInput.actor.intent.enteredAtTick).toBe(input.event.atTick);
    expect(nextInput.actor.memories.some(({ eventId }) => eventId === input.event.eventId)).toBe(true);
    expect(coreWildlifePursuitExpressionIntent(nextInput)).toBeNull();
    expect(coreWildlifePursuitExpressionEventForTrigger(nextInput, expression.event.triggerEventId))
      .toBeNull();
    expect(coreWildlifePursuitExpressionEventMatchesWorld(nextInput, expression.event)).toBe(false);
    expect(coreWildlifePursuitExpressionMemoryMatchesWorld(nextInput, expression.memory)).toBe(false);
    expectRetainedRejection(nextInput, expression.event, expression.memory);
  });

  it("keeps retained authentication fail-closed on malformed ownership and forged causal tuples", () => {
    const fixture = pursuitFixture();
    const expression = expressionFor(fixture.input);
    const coarse = allCoarseInput(fixture.input);
    const other = pursuitFixture("OBS-retained-pursuit-other-cause");
    const resource = coarse.event.resourceReference;
    if (resource === null) throw new Error("Pursuit event omitted resource");
    const forgedEvents: readonly unknown[] = [
      { ...coarse.event, eventId: `${coarse.event.eventId}:forged` },
      { ...coarse.event, actorId: `${coarse.event.actorId}:other` },
      { ...coarse.event, atTick: coarse.event.atTick + 1 },
      { ...coarse.event, causeReferenceId: "OBS-forged-retained-cause" },
      { ...coarse.event, observationId: "OBS-forged-retained-cause" },
      { ...coarse.event, position: translateWorldPosition(coarse.event.position, 1, 0) },
      { ...coarse.event, species: "marsh-rabbit" },
      { ...coarse.event, kind: "observe" },
      { ...coarse.event, resourceReference: { ...resource, resourceId: `${resource.resourceId}:other` } },
      { ...coarse.event, resourceReference: { ...resource, observedAvailableUnits: 2 } },
      { ...coarse.event, debug: true },
      fixture.rawEvent,
      null,
    ];
    const invalidInputs: readonly unknown[] = [
      null,
      { ...coarse, debug: true },
      { ...coarse, actor: null },
      { ...coarse, world: null },
      { ...coarse, world: fixture.initialWorld },
      { ...coarse, actor: other.input.actor },
      ...forgedEvents.map((event) => ({ ...coarse, event })),
    ];
    for (const invalidInput of invalidInputs) {
      expectRetainedRejection(
        invalidInput as CoreWildlifePursuitExpressionInput,
        expression.event,
        expression.memory,
      );
    }
    expect(retainedCoreWildlifePursuitExpressionEventForTrigger(
      coarse,
      `${expression.event.triggerEventId}:forged`,
    )).toBeNull();
  });

  it("still requires current identified living prey and the exact committed pursuit memory when coarse", () => {
    const fixture = pursuitFixture();
    const expression = expressionFor(fixture.input);
    const coarse = allCoarseInput(fixture.input);
    const resource = coarse.actor.intent.resourceReference;
    if (resource === null) throw new Error("Pursuit fixture omitted target");
    const missingPreyWorld = canonicalizeCoreEcologyAggregatePatch({
      ...coarse.world,
      populations: coarse.world.populations.filter(({ species }) => species !== "marsh-rabbit"),
    });
    if (missingPreyWorld === null) throw new Error("Missing-prey fixture was not canonical");
    expectRetainedRejection({ ...coarse, world: missingPreyWorld }, expression.event, expression.memory);
    expectRetainedRejection({
      ...coarse,
      world: {
        ...coarse.world,
        populations: coarse.world.populations.map((population) => ({
          ...population,
          members: population.members.map((member) => (
            member.actor.identity.stableId === resource.resourceId
              ? { ...member, actor: { ...member.actor, condition: { ...member.actor.condition, health: 0 } } }
              : member
          )),
        })),
      },
    }, expression.event, expression.memory);

    const beliefInputs = [
      replaceOwnedActor(coarse, {
        ...coarse.actor,
        perception: { ...coarse.actor.perception, beliefs: [], attentionKeys: [] },
      }),
      replaceOwnedActor(coarse, {
        ...coarse.actor,
        perception: {
          ...coarse.actor.perception,
          beliefs: coarse.actor.perception.beliefs.map((belief) => ({
            ...belief,
            firstObservedTick: 0,
            lastObservedTick: 0,
          })),
        },
      }),
      replaceOwnedActor(coarse, {
        ...coarse.actor,
        perception: {
          ...coarse.actor.perception,
          beliefs: coarse.actor.perception.beliefs.map((belief) => ({
            ...belief,
            perceivedClass: "wildlife",
          })),
        },
      }),
    ];
    for (const subjectId of [null, coarse.actor.identity.stableId]) {
      const observation = createActorObservation({
        id: resource.observationId,
        observerId: coarse.actor.identity.stableId,
        observedAtTick: coarse.event.atTick,
        channel: "vision",
        perceivedClass: "live-prey",
        subjectId,
        area: { center: actorFor(coarse.world, "marsh-rabbit").address.position, radiusUnits: 0 },
        confidence: ACTOR_PERCEPTION_SCALE,
        salience: 900_000,
        identification: subjectId === null ? "classified" : "identified",
      });
      if (observation === null) throw new Error("Retained-pursuit belief fixture was invalid");
      const perception = stepActorPerception(actorFor(fixture.initialWorld, "marsh-fox").perception, {
        tick: coarse.event.atTick,
        observations: [observation],
      });
      if (perception === null) throw new Error("Retained-pursuit belief fixture did not step");
      beliefInputs.push(replaceOwnedActor(coarse, { ...coarse.actor, perception }));
    }
    for (const beliefInput of beliefInputs) {
      expectRetainedRejection(beliefInput, expression.event, expression.memory);
    }

    const committed = coarse.actor.memories.find(({ eventId }) => eventId === coarse.event.eventId);
    if (committed === undefined) throw new Error("Pursuit fixture omitted committed memory");
    const otherMemories = coarse.actor.memories.filter(({ eventId }) => eventId !== committed.eventId);
    const forgedMemories: readonly CoreWildlifeMemory[] = [
      { ...committed, kind: "food" },
      { ...committed, referenceId: `${committed.referenceId}:other` },
      { ...committed, observationId: "OBS-forged-retained-memory" },
      { ...committed, atTick: committed.atTick - 1 },
      { ...committed, eventId: `${committed.eventId}:other` },
    ];
    for (const memories of [otherMemories, ...forgedMemories.map((memory) => [...otherMemories, memory])]) {
      expectRetainedRejection(replaceMemories(coarse, memories), expression.event, expression.memory);
    }
  });

  it("authenticates every retained immutable expression field and reachable cooldown pair", () => {
    const { input } = pursuitFixture();
    const expression = expressionFor(input);
    const coarse = allCoarseInput(input);
    const event = expression.event;
    const memory = expression.memory;
    const forgedEvents: readonly unknown[] = [
      { ...event, version: 0 },
      { ...event, catalogVersion: 0 },
      { ...event, eventId: `${event.eventId}:forged` },
      { ...event, sourceActorId: `${event.sourceActorId}:other` },
      { ...event, triggerEventId: `${event.triggerEventId}:other` },
      { ...event, position: translateWorldPosition(event.position, 1, 0) },
      { ...event, meaning: "marsh-rabbit-alarm-thump" },
      { ...event, family: "warning" },
      { ...event, tone: "alarmed" },
      { ...event, volume: "murmur" },
      { ...event, knowledgeBasis: "self-perceived-threat" },
      { ...event, vocalization: "marsh-rabbit-alarm-thump" },
      { ...event, priority: event.priority + 1 },
      { ...event, salience: event.salience - 1 },
      { ...event, variantSeed: (event.variantSeed ^ 1) >>> 0 },
      { ...event, realizationKey: `${event.realizationKey}:forged` },
      { ...event, durationSteps: event.durationSteps + 1 },
      { ...event, remainingSteps: event.durationSteps + 1 },
      { ...event, audioAcknowledged: "yes" },
      { ...event, debug: true },
      null,
    ];
    for (const forgedEvent of forgedEvents) {
      expect(retainedCoreWildlifePursuitExpressionEventMatchesWorld(
        coarse,
        forgedEvent as SituatedExpressionEvent,
      )).toBe(false);
    }
    expect(retainedCoreWildlifePursuitExpressionEventMatchesWorld(coarse, {
      ...event,
      remainingSteps: event.remainingSteps - 1,
      audioAcknowledged: true,
    })).toBe(true);

    const forgedCooldowns: readonly unknown[] = [
      { ...memory, sourceActorId: `${memory.sourceActorId}:other` },
      { ...memory, triggerEventId: `${memory.triggerEventId}:other` },
      { ...memory, meaning: "marsh-rabbit-alarm-thump" },
      { ...memory, family: "warning" },
      { ...memory, priority: memory.priority + 1 },
      { ...memory, meaningCooldownRemainingSteps: memory.meaningCooldownRemainingSteps + 1 },
      { ...memory, familyCooldownRemainingSteps: memory.familyCooldownRemainingSteps + 1 },
      { ...memory, meaningCooldownRemainingSteps: memory.meaningCooldownRemainingSteps - 1 },
      { ...memory, familyCooldownRemainingSteps: memory.familyCooldownRemainingSteps - 1 },
      { ...memory, meaningCooldownRemainingSteps: 0, familyCooldownRemainingSteps: 1 },
      { ...memory, meaningCooldownRemainingSteps: 0, familyCooldownRemainingSteps: 0 },
      { ...memory, meaningCooldownRemainingSteps: -1 },
      { ...memory, debug: true },
      null,
    ];
    for (const forgedCooldown of forgedCooldowns) {
      expect(retainedCoreWildlifePursuitExpressionMemoryMatchesWorld(
        coarse,
        forgedCooldown as SituatedExpressionMemory,
      )).toBe(false);
    }
  });

  it("keeps prey identity and the causal observation out of expression output", () => {
    const first = pursuitFixture();
    const intent = coreWildlifePursuitExpressionIntent(first.input);
    if (intent === null) throw new Error("Pursuit-yip intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (reduction.event === null) throw new Error("Pursuit yip was not accepted");
    const targetId = first.input.actor.intent.resourceReference?.resourceId;
    if (targetId === undefined) throw new Error("Pursuit fixture omitted target");

    for (const output of [intent, reduction.event, projectSituatedExpression(reduction.event)]) {
      expect(JSON.stringify(output)).not.toContain(targetId);
      expect(JSON.stringify(output)).not.toContain(OBSERVATION_ID);
      expect(JSON.stringify(output)).not.toContain("live-prey");
    }
    expect(coreWildlifePursuitExpressionIntent(
      pursuitFixture("OBS-marsh-fox-sees-other-live-prey").input,
    )).toEqual(intent);
  });

  it("fails closed on forged event identity, tick, cause, target, locus, or shape", () => {
    const { input } = pursuitFixture();
    if (input.event.resourceReference === null) throw new Error("Pursuit event omitted resource");
    const forgedEvents: readonly CoreWildlifeCausalEvent[] = [
      { ...input.event, eventId: `${input.event.eventId}:forged` },
      { ...input.event, actorId: `${input.event.actorId}:other` },
      { ...input.event, atTick: input.event.atTick + 1 },
      { ...input.event, causeReferenceId: "OBS-forged-cause" },
      { ...input.event, observationId: "OBS-forged-cause" },
      { ...input.event, position: translateWorldPosition(input.event.position, 1, 0) },
      { ...input.event, species: "marsh-rabbit" },
      { ...input.event, kind: "observe" },
      {
        ...input.event,
        resourceReference: {
          ...input.event.resourceReference,
          resourceId: `${input.event.resourceReference.resourceId}:forged`,
        },
      },
    ];
    for (const event of forgedEvents) {
      expect(coreWildlifePursuitExpressionIntent({ ...input, event })).toBeNull();
    }
    expect(coreWildlifePursuitExpressionIntent({
      ...input,
      event: { ...input.event, debug: true } as CoreWildlifeCausalEvent,
    })).toBeNull();
  });

  it("requires exact patch ownership, an identified current visual target, and pursuit memory", () => {
    const first = pursuitFixture();
    const second = pursuitFixture("OBS-marsh-fox-other-root-prey");
    expect(coreWildlifePursuitExpressionIntent({
      ...first.input,
      actor: second.input.actor,
    })).toBeNull();
    expect(coreWildlifePursuitExpressionIntent({
      ...first.input,
      world: first.initialWorld,
    })).toBeNull();

    const withoutMemory = replaceMemories(
      first.input,
      first.input.actor.memories.filter(({ eventId }) => eventId !== first.input.event.eventId),
    );
    expect(coreWildlifePursuitExpressionIntent(withoutMemory)).toBeNull();

    const classifiedActor = {
      ...first.input.actor,
      perception: {
        ...first.input.actor.perception,
        beliefs: first.input.actor.perception.beliefs.map((belief) => ({
          ...belief,
          identification: "classified",
          subjectId: null,
        })),
      },
    } as CoreWildlifeActorState;
    expect(coreWildlifePursuitExpressionIntent({
      actor: classifiedActor,
      event: first.input.event,
      world: first.input.world,
    })).toBeNull();

    const targetId = first.input.actor.intent.resourceReference?.resourceId;
    if (targetId === undefined) throw new Error("Pursuit fixture omitted target");
    const coarseTargetWorld = canonicalizeCoreEcologyAggregatePatch({
      ...first.input.world,
      populations: first.input.world.populations.map((population) => ({
        ...population,
        members: population.members.map((member) => (
          member.actor.identity.stableId === targetId
            ? { ...member, materialization: "coarse" }
            : member
        )),
      })),
    });
    if (coarseTargetWorld === null) throw new Error("Coarse-target fixture was not canonical");
    expect(coreWildlifePursuitExpressionIntent({
      ...first.input,
      world: coarseTargetWorld,
    })).toBeNull();
  });

  it("silences continued pursuit rather than yipping every cognition step", () => {
    const { input } = pursuitFixture();
    const resource = input.actor.intent.resourceReference;
    if (resource === null) throw new Error("Pursuit fixture omitted resource");
    const target = input.world.populations.flatMap(({ members }) => members)
      .find(({ actor }) => actor.identity.stableId === resource.resourceId)?.actor;
    if (target === undefined) throw new Error("Pursuit fixture omitted target actor");
    const observation = createActorObservation({
      id: resource.observationId,
      observerId: input.actor.identity.stableId,
      observedAtTick: 2,
      channel: "vision",
      perceivedClass: "live-prey",
      subjectId: target.identity.stableId,
      area: { center: target.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: 900_000,
      identification: "identified",
    });
    if (observation === null) throw new Error("Continued-pursuit observation was invalid");
    const stepped = stepCoreEcologyAggregatePatch(input.world, {
      tick: 2,
      actorSteps: [{
        actorId: input.actor.identity.stableId,
        observations: [observation],
        foodOpportunities: [{
          resourceId: target.identity.stableId,
          observationId: observation.id,
          foodClass: "live-prey",
          sourceKind: "living-actor",
          availableUnits: 1,
          nutrition: 900_000,
          effort: 10_000,
          risk: 0,
          competition: 0,
          directlyConfirmed: true,
          accessible: true,
        }],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      }, {
        actorId: target.identity.stableId,
        observations: [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      }],
    });
    if (stepped === null) throw new Error("Continued pursuit did not step");
    const actor = actorFor(stepped.patch, "marsh-fox");
    const rawEvent = stepped.events.find(({ actorId }) => actorId === actor.identity.stableId);
    if (rawEvent === undefined) throw new Error("Continued pursuit omitted event");
    expect(rawEvent.kind).toBe("pursue");
    expect(actor.intent.enteredAtTick).toBe(1);
    expect(coreWildlifePursuitExpressionIntent({
      actor,
      event: { ...rawEvent, position: actor.address.position },
      world: stepped.patch,
    })).toBeNull();
  });
});
