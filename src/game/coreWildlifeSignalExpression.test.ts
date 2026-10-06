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
  deserializeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { createCoreEcologyGroup, createCoreEcologyGroupSet } from "./coreEcologyGroups";
import {
  coreWildlifeAlarmMeaningForSpecies,
  coreWildlifeAlarmSpeciesForMeaning,
  coreWildlifeAlarmExpressionEventForTrigger,
  coreWildlifeAlarmExpressionEventMatchesWorld,
  coreWildlifeAlarmExpressionIntent,
  coreWildlifeAlarmExpressionMemoryMatchesWorld,
  MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY,
  deerAlarmExpressionEventForTrigger,
  deerAlarmExpressionEventMatchesWorld,
  deerAlarmExpressionIntent,
  deerAlarmExpressionMemoryMatchesWorld,
  fishCrowAlarmExpressionEventForTrigger,
  fishCrowAlarmExpressionEventMatchesWorld,
  fishCrowAlarmExpressionIntent,
  fishCrowAlarmExpressionMemoryMatchesWorld,
  marshRabbitAlarmExpressionEventForTrigger,
  marshRabbitAlarmExpressionEventMatchesWorld,
  marshRabbitAlarmExpressionIntent,
  marshRabbitAlarmExpressionMemoryMatchesWorld,
  retainedCoreWildlifeAlarmExpressionEventForTrigger,
  retainedCoreWildlifeAlarmExpressionEventMatchesWorld,
  retainedCoreWildlifeAlarmExpressionMemoryMatchesWorld,
  type CoreWildlifeAlarmExpressionInput,
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
  type SituatedExpressionEvent,
  type SituatedExpressionMemory,
} from "./situatedExpression";
import {
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

const ORIGIN = createRegionCoord(-9, 14);
const SEED = seedFromText("living voice authenticated fish crow alarm");
const PREDATOR_ID = "HARRIER-living-voice-test";
const OBSERVATION_ID = "OBS-fish-crow-sees-harrier";
const DEER_PREDATOR_ID = "BEAR-living-voice-test";
const DEER_OBSERVATION_ID = "OBS-deer-sees-bear";
const RABBIT_PREDATOR_ID = "FOX-living-voice-test";
const RABBIT_OBSERVATION_ID = "OBS-marsh-rabbit-sees-fox";

interface AlarmFixture {
  readonly input: CoreWildlifeAlarmExpressionInput;
  readonly initialWorld: CoreEcologyAggregatePatchState;
  readonly rawEvent: CoreWildlifeAlarmExpressionInput["event"];
}

function alarmFixture(
  species: Extract<
    CoreWildlifeSpecies,
    "fish-crow" | "deer" | "marsh-rabbit" | "gull" | "elk" | "wild-boar" | "domestic-chicken" | "american-black-duck" | "domestic-goat"
  > = "fish-crow",
  predatorId = PREDATOR_ID,
  observationId = species === "fish-crow"
    ? OBSERVATION_ID
    : species === "deer"
      ? DEER_OBSERVATION_ID
      : species === "marsh-rabbit"
        ? RABBIT_OBSERVATION_ID
        : species === "elk"
          ? "OBS-elk-sees-wolf"
          : species === "wild-boar"
            ? "OBS-boar-sees-wolf"
            : "OBS-gull-sees-harrier",
  perceivedThreatClass = species === "deer" || species === "elk" || species === "wild-boar"
    || species === "domestic-goat"
    ? "large-predator"
    : species === "marsh-rabbit"
      ? "predator"
      : "aerial-predator",
  perception: Readonly<{
    channel?: "vision" | "hearing";
    identification?: "anonymous" | "classified" | "identified";
    radiusUnits?: number;
    subjectId?: string | null;
  }> = {},
): AlarmFixture {
  const position = createWorldPosition(ORIGIN, 23_000, 31_000);
  const groupedAlarmSource = species === "elk" || species === "wild-boar"
    || species === "domestic-chicken" || species === "domestic-goat";
  const population: CoreEcologyPopulationInput = {
    species,
    populationKey: `living-voice:${species}`,
    members: (groupedAlarmSource ? [0, 1] : [0]).map((populationOrdinal) => ({
      populationOrdinal,
      position: translateWorldPosition(position, populationOrdinal * 500, 0),
      heading: 125_000,
      materialization: "materialized" as const,
    })),
  };
  const initialWorld = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: `living-voice:${species}`,
    originRegion: ORIGIN,
    derivation: { kind: "bounded-input-v1" },
    populations: [population],
    ...(groupedAlarmSource ? {
      groups: createCoreEcologyGroupSet([createCoreEcologyGroup({
        seed: SEED,
        species,
        originRegion: ORIGIN,
        populationKey: population.populationKey,
        groupOrdinal: 0,
        memberOrdinals: [0, 1],
        anchor: position,
        heading: 125_000,
      })]),
    } : {}),
  });
  const source = sourceActor(initialWorld);
  const observation = createActorObservation({
    id: observationId,
    observerId: source.identity.stableId,
    observedAtTick: 1,
    channel: perception.channel ?? "vision",
    perceivedClass: perceivedThreatClass,
    subjectId: perception.subjectId === undefined ? predatorId : perception.subjectId,
    area: {
      center: translateWorldPosition(position, 1_000, 0),
      radiusUnits: perception.radiusUnits ?? 0,
    },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 920_000,
    identification: perception.identification ?? "identified",
    interrupt: "strong",
  });
  if (observation === null) throw new Error(`${species} alarm observation was invalid`);
  const stepped = stepCoreEcologyAggregatePatch(initialWorld, {
    tick: 1,
    actorSteps: initialWorld.populations[0]!.members.map(({ actor }) => ({
      actorId: actor.identity.stableId,
      observations: actor.identity.stableId === source.identity.stableId
        ? [observation]
        : [],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    })),
  });
  if (stepped === null) throw new Error(`${species} alarm world step failed`);
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

type RetainedAlarmSemantics = "current" | "legacy-fish-crow";

function allCoarseAlarmInput(
  input: CoreWildlifeAlarmExpressionInput,
): CoreWildlifeAlarmExpressionInput {
  const world = setCoreEcologyAggregatePatchMaterializedActors(input.world, {
    atTick: input.world.updatedAtTick,
    actorIds: [],
  });
  return Object.freeze({ ...input, actor: sourceActor(world), world });
}

function alarmExpressionFor(
  input: CoreWildlifeAlarmExpressionInput,
  semantics: RetainedAlarmSemantics = "current",
) {
  const intent = semantics === "legacy-fish-crow"
    ? fishCrowAlarmExpressionIntent(input)
    : coreWildlifeAlarmExpressionIntent(input);
  if (intent === null) throw new Error("Alarm expression fixture did not authenticate");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || reduction.state === null || memory === undefined) {
    throw new Error("Alarm expression fixture was not accepted");
  }
  const cooledMemory = advanceSituatedExpression(reduction.state, intent.durationSteps)?.recent[0];
  if (cooledMemory === undefined) throw new Error("Alarm cooldown fixture was not retained");
  return { event: reduction.event, memory, cooledMemory };
}

function expectRetainedAlarmRejection(
  input: CoreWildlifeAlarmExpressionInput,
  event: SituatedExpressionEvent,
  memory: SituatedExpressionMemory,
  semantics: RetainedAlarmSemantics,
): void {
  expect(retainedCoreWildlifeAlarmExpressionEventForTrigger(input, event.triggerEventId, semantics))
    .toBeNull();
  expect(retainedCoreWildlifeAlarmExpressionEventMatchesWorld(input, event, semantics)).toBe(false);
  expect(retainedCoreWildlifeAlarmExpressionMemoryMatchesWorld(input, memory, semantics)).toBe(false);
}

describe("core-wildlife signal expression", () => {
  it.each([
    ["marsh-rabbit", "current"],
    ["deer", "current"],
    ["fish-crow", "current"],
    ["fish-crow", "legacy-fish-crow"],
  ] as const)("retains %s's exact committed event and cooldown under %s without fresh coarse admission", (species, semantics) => {
    const { input } = alarmFixture(species);
    const { event, memory, cooledMemory } = alarmExpressionFor(input, semantics);
    const coarse = allCoarseAlarmInput(input);
    const before = structuredClone(coarse);
    const restoredWorld = deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(coarse.world));
    if (restoredWorld === null) throw new Error("Coarse alarm fixture failed roundtrip");
    const restored = { ...coarse, actor: sourceActor(restoredWorld), world: restoredWorld };

    expect(coarse.actor).toEqual(input.actor);
    expect(coarse.world.updatedAtTick).toBe(input.event.atTick);
    expect(coarse.world.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);
    for (const retainedInput of [input, coarse, restored]) {
      expect(retainedCoreWildlifeAlarmExpressionEventForTrigger(retainedInput, event.triggerEventId, semantics))
        .toEqual(event);
      expect(retainedCoreWildlifeAlarmExpressionEventMatchesWorld(retainedInput, event, semantics)).toBe(true);
      expect(retainedCoreWildlifeAlarmExpressionMemoryMatchesWorld(retainedInput, memory, semantics)).toBe(true);
      expect(retainedCoreWildlifeAlarmExpressionMemoryMatchesWorld(retainedInput, cooledMemory, semantics)).toBe(true);
    }
    expect(event.position).toEqual(input.event.position);
    expect(coreWildlifeAlarmExpressionIntent(coarse)).toBeNull();
    expect(coreWildlifeAlarmExpressionEventForTrigger(coarse, event.triggerEventId)).toBeNull();
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(coarse, event)).toBe(false);
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(coarse, cooledMemory)).toBe(false);
    expect(fishCrowAlarmExpressionIntent(coarse)).toBeNull();
    expect(fishCrowAlarmExpressionEventForTrigger(coarse, event.triggerEventId)).toBeNull();
    expect(fishCrowAlarmExpressionEventMatchesWorld(coarse, event)).toBe(false);
    expect(fishCrowAlarmExpressionMemoryMatchesWorld(coarse, cooledMemory)).toBe(false);

    const stepped = stepCoreEcologyAggregatePatch(coarse.world, {
      tick: input.event.atTick + 1,
      actorSteps: [],
    });
    if (stepped === null) throw new Error("All-coarse alarm fixture did not step");
    const later = { ...coarse, actor: sourceActor(stepped.patch), world: stepped.patch };
    expect(stepped.events).toEqual([]);
    expect(later.actor.updatedAtTick).toBe(input.event.atTick + 1);
    expect(coreWildlifeAlarmExpressionIntent(later)).toBeNull();
    expectRetainedAlarmRejection(later, event, cooledMemory, semantics);
    expect(coarse).toEqual(before);
  });

  it("retains a rabbit's committed thump locus rather than its later same-tick body address", () => {
    const { input } = alarmFixture("marsh-rabbit", RABBIT_PREDATOR_ID, RABBIT_OBSERVATION_ID);
    const { event, cooledMemory } = alarmExpressionFor(input);
    const actor = repositionCoreWildlifeActor(input.actor, {
      atTick: input.event.atTick,
      position: translateWorldPosition(input.actor.address.position, 500, 0),
      heading: input.actor.address.heading,
    });
    const coarse = allCoarseAlarmInput({
      ...input,
      actor,
      world: replaceCoreEcologyAggregatePatchActor(input.world, actor),
    });
    expect(coarse.actor.address.position).not.toEqual(event.position);
    expect(retainedCoreWildlifeAlarmExpressionEventForTrigger(coarse, event.triggerEventId, "current"))
      .toEqual(event);
    expect(retainedCoreWildlifeAlarmExpressionEventMatchesWorld(coarse, event, "current")).toBe(true);
    expect(retainedCoreWildlifeAlarmExpressionMemoryMatchesWorld(coarse, cooledMemory, "current")).toBe(true);
    expectRetainedAlarmRejection({
      ...coarse,
      event: { ...coarse.event, position: coarse.actor.address.position },
    }, event, cooledMemory, "current");
  });

  it("keeps retained alarm ownership, cause, policy and committed memory fail-closed", () => {
    const fixture = alarmFixture();
    const { event, cooledMemory } = alarmExpressionFor(fixture.input);
    const coarse = allCoarseAlarmInput(fixture.input);
    const committed = coarse.actor.memories.find(({ eventId }) => eventId === coarse.event.eventId);
    if (committed === undefined) throw new Error("Alarm fixture lost committed memory");
    const { eventPosition: _eventPosition, ...withoutLocus } = committed;
    const invalidInputs: readonly unknown[] = [
      null,
      { ...coarse, debug: true },
      { ...coarse, actor: null },
      { ...coarse, world: fixture.initialWorld },
      { ...coarse, actor: alarmFixture("gull").input.actor },
      { ...coarse, event: fixture.rawEvent },
      ...[
        { ...coarse.event, eventId: `${coarse.event.eventId}:forged` },
        { ...coarse.event, atTick: coarse.event.atTick + 1 },
        { ...coarse.event, causeReferenceId: "OBS-forged-retained-alarm" },
        { ...coarse.event, observationId: "OBS-forged-retained-alarm" },
        { ...coarse.event, position: translateWorldPosition(coarse.event.position, 1, 0) },
        { ...coarse.event, species: "gull" },
        { ...coarse.event, debug: true },
      ].map((forgedEvent) => ({ ...coarse, event: forgedEvent })),
    ];
    const actorValues: readonly unknown[] = [
      { ...coarse.actor, memories: [] },
      ...[
        withoutLocus,
        { ...withoutLocus, kind: "threat" },
        { ...committed, referenceId: `${committed.referenceId}:other` },
        { ...committed, observationId: "OBS-forged-retained-alarm-memory" },
        { ...committed, atTick: 0 },
        { ...committed, eventPosition: translateWorldPosition(coarse.event.position, 1, 0) },
      ].map((memory) => ({ ...coarse.actor, memories: [memory] })),
      { ...coarse.actor, intent: { ...coarse.actor.intent, enteredAtTick: 0 } },
      ...[
        { perceivedClass: "wildlife" },
        { confidence: 0, salience: 0 },
        { firstObservedTick: 0, lastObservedTick: 0 },
      ].map((change) => ({
        ...coarse.actor,
        perception: {
          ...coarse.actor.perception,
          beliefs: coarse.actor.perception.beliefs.map((belief) => ({ ...belief, ...change })),
        },
      })),
    ];
    for (const actorValue of actorValues) {
      const actor = canonicalizeCoreWildlifeActorState(actorValue);
      if (actor === null) throw new Error("Retained-alarm negative fixture was not canonical");
      for (const semantics of ["current", "legacy-fish-crow"] as const) {
        expectRetainedAlarmRejection({
          ...coarse,
          actor,
          world: replaceCoreEcologyAggregatePatchActor(coarse.world, actor),
        }, event, cooledMemory, semantics);
      }
    }
    for (const invalidInput of invalidInputs) {
      for (const semantics of ["current", "legacy-fish-crow"] as const) {
        expectRetainedAlarmRejection(invalidInput as CoreWildlifeAlarmExpressionInput, event, cooledMemory, semantics);
      }
    }
    for (const semantics of ["current", "legacy-fish-crow"] as const) {
      expect(retainedCoreWildlifeAlarmExpressionEventForTrigger(coarse, `${event.triggerEventId}:other`, semantics))
        .toBeNull();
      for (const forgedEvent of [
        { ...event, salience: event.salience - 1 },
        { ...event, priority: event.priority + 1 },
        { ...event, position: translateWorldPosition(event.position, 1, 0) },
      ]) expect(retainedCoreWildlifeAlarmExpressionEventMatchesWorld(coarse, forgedEvent, semantics)).toBe(false);
      for (const forgedMemory of [
        { ...cooledMemory, priority: cooledMemory.priority + 1 },
        { ...cooledMemory, sourceActorId: `${cooledMemory.sourceActorId}:other` },
        { ...cooledMemory, meaningCooldownRemainingSteps: cooledMemory.meaningCooldownRemainingSteps - 1 },
        { ...cooledMemory, meaningCooldownRemainingSteps: 0, familyCooldownRemainingSteps: 0 },
      ]) expect(retainedCoreWildlifeAlarmExpressionMemoryMatchesWorld(coarse, forgedMemory, semantics)).toBe(false);
    }
  });

  it("requires explicit retained semantics and preserves the legacy identified aerial-predator fence", () => {
    const broaderAlarms = [
      alarmFixture("fish-crow", PREDATOR_ID, "OBS-classified-aerial-threat", "aerial-predator", {
        identification: "classified", subjectId: null,
      }),
      alarmFixture("fish-crow", "ANONYMOUS-danger", "OBS-heard-crow-danger", "danger-sound", {
        channel: "hearing", identification: "anonymous", radiusUnits: 3_000, subjectId: null,
      }),
      alarmFixture("fish-crow", "BEAR-crow-threat", "OBS-crow-sees-bear", "large-predator"),
      alarmFixture("marsh-rabbit", RABBIT_PREDATOR_ID, RABBIT_OBSERVATION_ID),
    ];
    for (const { input } of broaderAlarms) {
      const { event, cooledMemory } = alarmExpressionFor(input);
      const coarse = allCoarseAlarmInput(input);
      expect(retainedCoreWildlifeAlarmExpressionEventForTrigger(coarse, event.triggerEventId, "current"))
        .toEqual(event);
      expect(retainedCoreWildlifeAlarmExpressionEventMatchesWorld(coarse, event, "current")).toBe(true);
      expect(retainedCoreWildlifeAlarmExpressionMemoryMatchesWorld(coarse, cooledMemory, "current")).toBe(true);
      expectRetainedAlarmRejection(coarse, event, cooledMemory, "legacy-fish-crow");
      for (const semantics of [undefined, null, "legacy", true]) {
        expectRetainedAlarmRejection(coarse, event, cooledMemory, semantics as RetainedAlarmSemantics);
      }
    }
  });

  it("authenticates one conserved goat-herd alarm without disclosing its threat", () => {
    // This is an ecology/Voice contract fixture, not a generated runtime encounter.
    const { input, initialWorld, rawEvent } = alarmFixture(
      "domestic-goat", "BEAR-goat-threat", "OBS-goat-threat", "large-predator",
    );
    expect(initialWorld.groups.groups).toMatchObject([{
      identity: { species: "domestic-goat", organization: "herd" },
      memberOrdinals: [0, 1],
    }]);
    const restoredWorld = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(input.world),
    );
    if (restoredWorld === null) throw new Error("Goat fixture failed roundtrip");
    const restored = { ...input, actor: sourceActor(restoredWorld), world: restoredWorld };
    const intent = coreWildlifeAlarmExpressionIntent(restored);
    expect(intent).toEqual(coreWildlifeAlarmExpressionIntent(input));
    expect(intent).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      meaning: "domestic-goat-alarm-call", family: "animal-signal",
      tone: "alarmed", volume: "shout", knowledgeBasis: "self-perceived-threat",
      priority: 760_000, durationSteps: 6,
    });
    expect(coreWildlifeAlarmMeaningForSpecies("domestic-goat")).toBe("domestic-goat-alarm-call");
    expect(coreWildlifeAlarmSpeciesForMeaning("domestic-goat-alarm-call")).toBe("domestic-goat");
    if (intent === null) throw new Error("Goat intent failed authentication");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (reduction.event === null || reduction.state === null) throw new Error("Goat alarm rejected");
    expect(projectSituatedExpression(reduction.event)).toMatchObject({
      text: "MAAA!", vocalization: "goat-alarm-bleat",
    });
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(restored, reduction.event)).toBe(true);
    expect(coreWildlifeAlarmExpressionEventForTrigger(restored, input.event.eventId)).toEqual(reduction.event);
    const memory = advanceSituatedExpression(reduction.state, 6)?.recent[0];
    if (memory === undefined) throw new Error("Goat memory missing");
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(restored, memory)).toBe(true);
    expect(JSON.stringify(reduction.event)).not.toMatch(/BEAR-goat-threat|OBS-goat-threat|large-predator/u);
    const herdMate = restoredWorld.populations[0]?.members[1]?.actor;
    if (herdMate === undefined) throw new Error("Goat fixture lost herd mate");
    expect(coreWildlifeAlarmExpressionIntent({ ...restored, actor: herdMate })).toBeNull();
    expect(coreWildlifeAlarmExpressionIntent({ ...restored, event: rawEvent })).toBeNull();
    for (const event of [
      { ...input.event, species: "wild-boar" as const },
      { ...input.event, causeReferenceId: "OBS-forged-goat" },
      { ...input.event, position: translateWorldPosition(input.event.position, 1, 0) },
    ]) expect(coreWildlifeAlarmExpressionIntent({ ...restored, event })).toBeNull();
    for (const event of [
      { ...reduction.event, volume: "murmur" as const, priority: 160_000 },
      { ...reduction.event, meaning: "wild-boar-alarm-call" as const, vocalization: "boar-grunt" as const },
    ]) expect(coreWildlifeAlarmExpressionEventMatchesWorld(restored, event)).toBe(false);
    expect(fishCrowAlarmExpressionIntent(restored)).toBeNull();
    const quiet = stepCoreEcologyAggregatePatch(initialWorld, {
      tick: 1,
      actorSteps: initialWorld.populations[0]!.members.map(({ actor }) => ({
        actorId: actor.identity.stableId, observations: [], foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      })),
    });
    if (quiet === null) throw new Error("Goat counterfactual source step failed");
    expect(quiet.events.filter(({ kind }) => kind === "alarm")).toEqual([]);
    expect(coreWildlifeAlarmExpressionIntent({
      ...input, actor: sourceActor(quiet.patch), world: quiet.patch,
    })).toBeNull();
  });

  it("adapts one finite duck alarm without escalating its quiet acoustic policy", () => {
    const { input, initialWorld, rawEvent } = alarmFixture(
      "american-black-duck", "DOG-duck-threat", "OBS-duck-threat", "predator",
    );
    expect(initialWorld.populations[0]?.members).toHaveLength(1);
    expect(initialWorld.groups.groups).toEqual([]);
    const restoredWorld = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(input.world),
    );
    if (restoredWorld === null) throw new Error("Duck fixture failed roundtrip");
    const restored = { ...input, actor: sourceActor(restoredWorld), world: restoredWorld };
    const intent = coreWildlifeAlarmExpressionIntent(restored);
    expect(intent).toEqual(coreWildlifeAlarmExpressionIntent(input));
    expect(intent).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      meaning: "american-black-duck-alarm-call",
      family: "animal-signal", tone: "alarmed", volume: "murmur",
      knowledgeBasis: "self-perceived-threat", priority: 160_000, durationSteps: 6,
    });
    if (intent === null) throw new Error("Duck intent failed authentication");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (reduction.event === null || reduction.state === null) throw new Error("Duck alarm rejected");
    expect(projectSituatedExpression(reduction.event)).toMatchObject({
      text: "QUACK.", vocalization: "duck-alarm-quack",
    });
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(restored, reduction.event)).toBe(true);
    const memory = advanceSituatedExpression(reduction.state, 6)?.recent[0];
    if (memory === undefined) throw new Error("Duck memory missing");
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(restored, memory)).toBe(true);
    expect(coreWildlifeAlarmExpressionIntent({ ...restored, event: rawEvent })).toBeNull();
    expect(JSON.stringify(reduction.event)).not.toMatch(/DOG-duck-threat|OBS-duck-threat|predator/u);
    for (const event of [
      { ...input.event, species: "gull" as const },
      { ...input.event, causeReferenceId: "OBS-forged-duck" },
      { ...input.event, position: translateWorldPosition(input.event.position, 1, 0) },
    ]) expect(coreWildlifeAlarmExpressionIntent({ ...restored, event })).toBeNull();
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(restored, {
      ...reduction.event, volume: "shout", priority: 760_000,
    })).toBe(false);
    const quiet = stepCoreEcologyAggregatePatch(initialWorld, {
      tick: 1,
      actorSteps: initialWorld.populations[0]!.members.map(({ actor }) => ({
        actorId: actor.identity.stableId, observations: [], foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      })),
    });
    if (quiet === null) throw new Error("Duck counterfactual source step failed");
    expect(quiet.events.filter(({ kind }) => kind === "alarm")).toEqual([]);
    expect(coreWildlifeAlarmExpressionIntent({
      ...input, actor: sourceActor(quiet.patch), world: quiet.patch,
    })).toBeNull();
  });

  it("keeps a committed chicken flock alarm soft and source-bound after restoration", () => {
    const { input, initialWorld, rawEvent } = alarmFixture(
      "domestic-chicken", "DOG-chicken-threat", "OBS-chicken-threat", "predator",
    );
    expect(initialWorld.groups.groups).toMatchObject([{
      identity: { species: "domestic-chicken", organization: "flock" },
      memberOrdinals: [0, 1],
    }]);
    const restoredWorld = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(input.world),
    );
    if (restoredWorld === null) throw new Error("Chicken fixture failed roundtrip");
    const restored = { ...input, actor: sourceActor(restoredWorld), world: restoredWorld };
    const intent = coreWildlifeAlarmExpressionIntent(restored);
    expect(intent).toEqual(coreWildlifeAlarmExpressionIntent(input));
    expect(intent).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      meaning: "domestic-chicken-alarm-call",
      family: "animal-signal", tone: "alarmed", volume: "murmur",
      knowledgeBasis: "self-perceived-threat", priority: 160_000, durationSteps: 6,
    });
    if (intent === null) throw new Error("Chicken intent failed authentication");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (reduction.event === null || reduction.state === null) throw new Error("Chicken alarm rejected");
    expect(projectSituatedExpression(reduction.event)).toMatchObject({
      text: "SQUAWK.", vocalization: "chicken-alarm-squawk",
    });
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(restored, reduction.event)).toBe(true);
    const memory = advanceSituatedExpression(reduction.state, 6)?.recent[0];
    if (memory === undefined) throw new Error("Chicken memory missing");
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(restored, memory)).toBe(true);
    expect(coreWildlifeAlarmExpressionIntent({ ...input, event: rawEvent })).toBeNull();
    expect(JSON.stringify(reduction.event)).not.toMatch(/DOG-chicken-threat|OBS-chicken-threat|predator/u);
    const flockmate = restoredWorld.populations[0]?.members[1]?.actor;
    if (flockmate === undefined) throw new Error("Chicken fixture lost flockmate");
    expect(coreWildlifeAlarmExpressionIntent({ ...restored, actor: flockmate })).toBeNull();
    for (const event of [
      { ...input.event, species: "gull" as const },
      { ...input.event, causeReferenceId: "OBS-forged-chicken" },
      { ...input.event, position: translateWorldPosition(input.event.position, 1, 0) },
    ]) expect(coreWildlifeAlarmExpressionIntent({ ...restored, event })).toBeNull();
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(restored, {
      ...reduction.event, volume: "shout", priority: 760_000,
    })).toBe(false);
  });

  it("cannot mint a chicken voice when the bounded source step has no threat observation", () => {
    const { input, initialWorld } = alarmFixture(
      "domestic-chicken", "DOG-chicken-threat", "OBS-chicken-threat", "predator",
    );
    const quiet = stepCoreEcologyAggregatePatch(initialWorld, {
      tick: 1,
      actorSteps: initialWorld.populations[0]!.members.map(({ actor }) => ({
        actorId: actor.identity.stableId, observations: [], foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      })),
    });
    if (quiet === null) throw new Error("Counterfactual source step failed");
    expect(quiet.events.filter(({ kind }) => kind === "alarm")).toEqual([]);
    expect(coreWildlifeAlarmExpressionIntent({
      ...input, actor: sourceActor(quiet.patch), world: quiet.patch,
    })).toBeNull();
  });

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

  it("derives a source-bound canonical deer alarm as one restrained semantic snort", () => {
    const { input, initialWorld, rawEvent } = alarmFixture(
      "deer",
      DEER_PREDATOR_ID,
      DEER_OBSERVATION_ID,
    );
    const first = deerAlarmExpressionIntent(input);
    const second = coreWildlifeAlarmExpressionIntent(structuredClone(input));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      position: input.actor.address.position,
      meaning: "deer-alarm-call",
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
    expect(deerAlarmExpressionIntent({ ...input, event: rawEvent })).toBeNull();
    expect(fishCrowAlarmExpressionIntent(input)).toBeNull();

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), first);
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "deer-alarm-call",
        vocalization: "deer-alarm-snort",
      },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "SNORT!",
      realizationKey: "situated-expression.en.v1.deer-alarm-call.0",
      vocalization: "deer-alarm-snort",
    });
  });

  it("derives a soft marsh-rabbit alarm as one authenticated foot-thump", () => {
    const { input, initialWorld, rawEvent } = alarmFixture(
      "marsh-rabbit",
      RABBIT_PREDATOR_ID,
      RABBIT_OBSERVATION_ID,
    );
    const first = marshRabbitAlarmExpressionIntent(input);
    const second = coreWildlifeAlarmExpressionIntent(structuredClone(input));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      position: input.actor.address.position,
      meaning: "marsh-rabbit-alarm-thump",
      family: "animal-signal",
      tone: "alarmed",
      volume: "murmur",
      knowledgeBasis: "self-perceived-threat",
      priority: MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY,
      salience: 920_000,
      durationSteps: 6,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(input.event.position).not.toEqual(sourceActor(initialWorld).address.position);
    expect(marshRabbitAlarmExpressionIntent({ ...input, event: rawEvent })).toBeNull();
    expect(fishCrowAlarmExpressionIntent(input)).toBeNull();
    expect(deerAlarmExpressionIntent(input)).toBeNull();

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), first);
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "marsh-rabbit-alarm-thump",
        vocalization: "marsh-rabbit-alarm-thump",
      },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "thump",
      realizationKey: "situated-expression.en.v1.marsh-rabbit-alarm-thump.0",
      vocalization: "marsh-rabbit-alarm-thump",
    });
  });

  it("derives one authenticated gull alarm without translating its threat", () => {
    const { input, rawEvent } = alarmFixture("gull");
    const first = coreWildlifeAlarmExpressionIntent(input);
    const second = coreWildlifeAlarmExpressionIntent(structuredClone(input));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      position: input.actor.address.position,
      meaning: "gull-alarm-call",
      family: "animal-signal",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-perceived-threat",
      priority: 760_000,
      salience: 920_000,
      durationSteps: 6,
    });
    expect(coreWildlifeAlarmExpressionIntent({ ...input, event: rawEvent })).toBeNull();

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), first);
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "gull-alarm-call",
        vocalization: "gull-alarm-cry",
      },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "KEE-AH!",
      realizationKey: "situated-expression.en.v1.gull-alarm-call.0",
      vocalization: "gull-alarm-cry",
    });
    expect(JSON.stringify(reduction.event)).not.toContain("aerial-predator");
    expect(JSON.stringify(reduction.event)).not.toContain("OBS-gull-sees-harrier");
  });

  it("derives one elk alarm from its committed herd member without exposing the threat", () => {
    const { input, initialWorld, rawEvent } = alarmFixture(
      "elk",
      "WOLF-living-voice-test",
    );
    const intent = coreWildlifeAlarmExpressionIntent(input);

    expect(initialWorld.groups.groups).toMatchObject([{
      identity: { species: "elk", organization: "herd" },
      memberOrdinals: [0, 1],
    }]);
    expect(input.world.populations[0]?.members).toHaveLength(2);
    expect(intent).toEqual(coreWildlifeAlarmExpressionIntent(structuredClone(input)));
    expect(intent).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      position: input.event.position,
      meaning: "elk-alarm-call",
      family: "animal-signal",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-perceived-threat",
      priority: 760_000,
      salience: 920_000,
      durationSteps: 6,
    });
    expect(coreWildlifeAlarmExpressionIntent({ ...input, event: rawEvent })).toBeNull();
    expect(fishCrowAlarmExpressionIntent(input)).toBeNull();
    expect(coreWildlifeAlarmMeaningForSpecies("elk")).toBe("elk-alarm-call");
    expect(coreWildlifeAlarmSpeciesForMeaning("elk-alarm-call")).toBe("elk");

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    expect(reduction).toMatchObject({
      accepted: true,
      event: { meaning: "elk-alarm-call", vocalization: "elk-alarm-bark" },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "BARK!",
      realizationKey: "situated-expression.en.v1.elk-alarm-call.0",
      vocalization: "elk-alarm-bark",
    });
    expect(JSON.stringify(reduction.event)).not.toMatch(/WOLF-living-voice|OBS-elk|large-predator/u);
  });

  it("reauthenticates restored elk alarm authority and rejects forged herd-member roots", () => {
    const { input } = alarmFixture("elk", "WOLF-living-voice-test");
    const restoredWorld = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(input.world),
    );
    if (restoredWorld === null) throw new Error("Elk fixture world did not roundtrip");
    const restored = { ...input, actor: sourceActor(restoredWorld), world: restoredWorld };
    const intent = coreWildlifeAlarmExpressionIntent(restored);
    if (intent === null) throw new Error("Restored elk alarm intent was rejected");
    const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (reduced.event === null || reduced.state === null) {
      throw new Error("Elk alarm expression was not accepted");
    }
    const memory = advanceSituatedExpression(reduced.state, intent.durationSteps)?.recent[0];
    if (memory === undefined) throw new Error("Elk alarm cooldown was not retained");
    expect(coreWildlifeAlarmExpressionEventForTrigger(restored, intent.triggerEventId))
      .toEqual(reduced.event);
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(restored, reduced.event)).toBe(true);
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(restored, memory)).toBe(true);

    const herdMate = restoredWorld.populations[0]?.members[1]?.actor;
    if (herdMate === undefined) throw new Error("Elk fixture omitted its second herd member");
    expect(coreWildlifeAlarmExpressionIntent({ ...restored, actor: herdMate })).toBeNull();
    for (const event of [
      { ...input.event, species: "deer" as const },
      { ...input.event, causeReferenceId: "OBS-elk-forged-threat" },
      { ...input.event, position: translateWorldPosition(input.event.position, 1, 0) },
    ]) {
      expect(coreWildlifeAlarmExpressionIntent({ ...restored, event })).toBeNull();
    }
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(restored, {
      ...memory,
      triggerEventId: herdMate.identity.stableId + ":e:1:alarm",
    })).toBe(false);
  });

  it("derives one boar alarm from its committed sounder member without exposing the threat", () => {
    const { input, initialWorld, rawEvent } = alarmFixture(
      "wild-boar",
      "WOLF-living-voice-test",
    );
    const intent = coreWildlifeAlarmExpressionIntent(input);

    expect(initialWorld.groups.groups).toMatchObject([{
      identity: { species: "wild-boar", organization: "sounder" },
      memberOrdinals: [0, 1],
    }]);
    expect(input.world.populations[0]?.members).toHaveLength(2);
    expect(intent).toEqual(coreWildlifeAlarmExpressionIntent(structuredClone(input)));
    expect(intent).toMatchObject({
      sourceActorId: input.actor.identity.stableId,
      triggerEventId: input.event.eventId,
      position: input.event.position,
      meaning: "wild-boar-alarm-call",
      family: "animal-signal",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-perceived-threat",
      priority: 760_000,
      salience: 920_000,
      durationSteps: 6,
    });
    expect(coreWildlifeAlarmExpressionIntent({ ...input, event: rawEvent })).toBeNull();
    expect(fishCrowAlarmExpressionIntent(input)).toBeNull();
    expect(coreWildlifeAlarmMeaningForSpecies("wild-boar")).toBe("wild-boar-alarm-call");
    expect(coreWildlifeAlarmSpeciesForMeaning("wild-boar-alarm-call")).toBe("wild-boar");

    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    expect(reduction).toMatchObject({
      accepted: true,
      event: { meaning: "wild-boar-alarm-call", vocalization: "boar-grunt" },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "GRUNT!",
      realizationKey: "situated-expression.en.v1.wild-boar-alarm-call.0",
      vocalization: "boar-grunt",
    });
    expect(JSON.stringify(reduction.event)).not.toMatch(/WOLF-living-voice|OBS-boar|large-predator/u);
  });

  it("reauthenticates restored boar alarm authority and rejects forged sounder-member roots", () => {
    const { input } = alarmFixture("wild-boar", "WOLF-living-voice-test");
    const restoredWorld = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(input.world),
    );
    if (restoredWorld === null) throw new Error("Boar fixture world did not roundtrip");
    const restored = { ...input, actor: sourceActor(restoredWorld), world: restoredWorld };
    const intent = coreWildlifeAlarmExpressionIntent(restored);
    if (intent === null) throw new Error("Restored boar alarm intent was rejected");
    const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (reduced.event === null || reduced.state === null) {
      throw new Error("Boar alarm expression was not accepted");
    }
    const memory = advanceSituatedExpression(reduced.state, intent.durationSteps)?.recent[0];
    if (memory === undefined) throw new Error("Boar alarm cooldown was not retained");
    expect(coreWildlifeAlarmExpressionEventForTrigger(restored, intent.triggerEventId))
      .toEqual(reduced.event);
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(restored, reduced.event)).toBe(true);
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(restored, memory)).toBe(true);

    const sounderMate = restoredWorld.populations[0]?.members[1]?.actor;
    if (sounderMate === undefined) throw new Error("Boar fixture omitted its second sounder member");
    expect(coreWildlifeAlarmExpressionIntent({ ...restored, actor: sounderMate })).toBeNull();
    for (const event of [
      { ...input.event, species: "elk" as const },
      { ...input.event, causeReferenceId: "OBS-boar-forged-threat" },
      { ...input.event, position: translateWorldPosition(input.event.position, 1, 0) },
    ]) {
      expect(coreWildlifeAlarmExpressionIntent({ ...restored, event })).toBeNull();
    }
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(restored, {
      ...memory,
      triggerEventId: sounderMate.identity.stableId + ":e:1:alarm",
    })).toBe(false);
  });

  it("does not let expression repetition policy erase a distinct committed rabbit thump", () => {
    const { input } = alarmFixture(
      "marsh-rabbit",
      RABBIT_PREDATOR_ID,
      RABBIT_OBSERVATION_ID,
    );
    const actor = canonicalizeCoreWildlifeActorState({
      ...input.actor,
      memories: [...input.actor.memories, {
        eventId: `${input.actor.identity.stableId}:e:0:alarm`,
        kind: "alarm",
        referenceId: RABBIT_PREDATOR_ID,
        observationId: null,
        atTick: 0,
      }],
    });
    if (actor === null) throw new Error("Rabbit repeat fixture was not canonical");
    const world = replaceCoreEcologyAggregatePatchActor(input.world, actor);

    expect(marshRabbitAlarmExpressionIntent({
      actor,
      event: input.event,
      world,
    })).toMatchObject({
      triggerEventId: input.event.eventId,
      meaning: "marsh-rabbit-alarm-thump",
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

  it("reauthenticates deer alarm expression authority through shared and species APIs", () => {
    const { input } = alarmFixture("deer", DEER_PREDATOR_ID, DEER_OBSERVATION_ID);
    const intent = deerAlarmExpressionIntent(input);
    if (intent === null) throw new Error("Deer alarm intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (!reduction.accepted || reduction.event === null || reduction.state === null) {
      throw new Error("Deer alarm expression was not accepted");
    }
    const advanced = advanceSituatedExpression(reduction.state, intent.durationSteps);
    const memory = advanced?.recent[0];
    if (memory === undefined) throw new Error("Deer alarm cooldown was not retained");

    expect(deerAlarmExpressionEventForTrigger(input, intent.triggerEventId))
      .toEqual(reduction.event);
    expect(coreWildlifeAlarmExpressionEventForTrigger(input, intent.triggerEventId))
      .toEqual(reduction.event);
    expect(deerAlarmExpressionEventMatchesWorld(input, reduction.event)).toBe(true);
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(input, reduction.event)).toBe(true);
    expect(deerAlarmExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(fishCrowAlarmExpressionEventMatchesWorld(input, reduction.event)).toBe(false);
    expect(fishCrowAlarmExpressionMemoryMatchesWorld(input, memory)).toBe(false);
  });

  it("reauthenticates marsh-rabbit alarm authority without broadening legacy crow fences", () => {
    const { input } = alarmFixture(
      "marsh-rabbit",
      RABBIT_PREDATOR_ID,
      RABBIT_OBSERVATION_ID,
    );
    const intent = marshRabbitAlarmExpressionIntent(input);
    if (intent === null) throw new Error("Marsh-rabbit alarm intent was not derived");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    if (!reduction.accepted || reduction.event === null || reduction.state === null) {
      throw new Error("Marsh-rabbit alarm expression was not accepted");
    }
    const advanced = advanceSituatedExpression(reduction.state, intent.durationSteps);
    const memory = advanced?.recent[0];
    if (memory === undefined) throw new Error("Marsh-rabbit alarm cooldown was not retained");

    expect(marshRabbitAlarmExpressionEventForTrigger(input, intent.triggerEventId))
      .toEqual(reduction.event);
    expect(coreWildlifeAlarmExpressionEventForTrigger(input, intent.triggerEventId))
      .toEqual(reduction.event);
    expect(marshRabbitAlarmExpressionEventMatchesWorld(input, reduction.event)).toBe(true);
    expect(coreWildlifeAlarmExpressionEventMatchesWorld(input, reduction.event)).toBe(true);
    expect(marshRabbitAlarmExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(coreWildlifeAlarmExpressionMemoryMatchesWorld(input, memory)).toBe(true);
    expect(fishCrowAlarmExpressionEventMatchesWorld(input, reduction.event)).toBe(false);
    expect(fishCrowAlarmExpressionMemoryMatchesWorld(input, memory)).toBe(false);
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
    const deer = alarmFixture("deer", DEER_PREDATOR_ID, DEER_OBSERVATION_ID);
    const rabbit = alarmFixture(
      "marsh-rabbit",
      RABBIT_PREDATOR_ID,
      RABBIT_OBSERVATION_ID,
    );
    const gull = alarmFixture("gull");

    expect(fishCrowAlarmExpressionIntent(gull.input)).toBeNull();
    expect(coreWildlifeAlarmExpressionIntent(gull.input)).toMatchObject({
      meaning: "gull-alarm-call",
    });
    expect(deerAlarmExpressionIntent(crow.input)).toBeNull();
    expect(marshRabbitAlarmExpressionIntent(crow.input)).toBeNull();
    expect(deerAlarmExpressionIntent(rabbit.input)).toBeNull();
    expect(fishCrowAlarmExpressionIntent(deer.input)).toBeNull();
    expect(fishCrowAlarmExpressionIntent({
      ...crow.input,
      event: { ...crow.input.event, species: "gull" },
    })).toBeNull();
    expect(fishCrowAlarmExpressionIntent({
      ...crow.input,
      actor: gull.input.actor,
    })).toBeNull();
  });

  it("uses the shared core alarm policy instead of a species-local threat allowlist", () => {
    const aerialThreat = alarmFixture(
      "deer",
      "EAGLE-living-voice-test",
      "OBS-deer-sees-eagle",
      "aerial-predator",
    );
    expect(deerAlarmExpressionIntent(aerialThreat.input)).toMatchObject({
      meaning: "deer-alarm-call",
      knowledgeBasis: "self-perceived-threat",
    });
    expect(coreWildlifeAlarmExpressionIntent(aerialThreat.input))
      .toEqual(deerAlarmExpressionIntent(aerialThreat.input));

    const heardDanger = alarmFixture(
      "deer",
      "ANONYMOUS-danger-sound",
      "OBS-deer-hears-danger",
      "danger-sound",
      {
        channel: "hearing",
        identification: "anonymous",
        radiusUnits: 3_000,
        subjectId: null,
      },
    );
    expect(deerAlarmExpressionIntent(heardDanger.input)).toMatchObject({
      meaning: "deer-alarm-call",
      knowledgeBasis: "self-perceived-threat",
    });

    const heardCrowDanger = alarmFixture(
      "fish-crow",
      "ANONYMOUS-crow-danger-sound",
      "OBS-crow-hears-danger",
      "danger-sound",
      {
        channel: "hearing",
        identification: "anonymous",
        radiusUnits: 3_000,
        subjectId: null,
      },
    );
    const currentCrowIntent = coreWildlifeAlarmExpressionIntent(heardCrowDanger.input);
    expect(currentCrowIntent).toMatchObject({
      meaning: "fish-crow-alarm-call",
      knowledgeBasis: "self-perceived-threat",
    });
    if (currentCrowIntent === null) throw new Error("Current crow policy rejected lawful alarm");
    expect(fishCrowAlarmExpressionIntent(heardCrowDanger.input)).toBeNull();
    expect(fishCrowAlarmExpressionEventForTrigger(
      heardCrowDanger.input,
      currentCrowIntent.triggerEventId,
    )).toBeNull();
    expect(coreWildlifeAlarmExpressionEventForTrigger(
      heardCrowDanger.input,
      currentCrowIntent.triggerEventId,
    )).not.toBeNull();
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
