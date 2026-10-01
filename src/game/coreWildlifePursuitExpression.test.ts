import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
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
  type CoreWildlifePursuitExpressionInput,
} from "./coreWildlifePursuitExpression";
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
