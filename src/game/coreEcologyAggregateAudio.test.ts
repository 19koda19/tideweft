import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, type WeatherKind } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregateActivityIntensity,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_CHORUS_MIN_ACTIVITY,
  coreEcologyAggregateSoundSample,
  coreEcologyAggregateChorusSoundSample,
  deriveCoreEcologyAggregateContactEvents,
  deriveCoreEcologyAggregateChorusEvents,
  projectCoreEcologyAggregateHeardCues,
} from "./coreEcologyAggregateAudio";
import {
  deriveCoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
} from "./coreEcologyHabitat";
import { createLivingActorAddress, isLivingActorAddress } from "./livingActor";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
} from "./regionalTravel";
import { createRegionalWorldView, regionalWindowForWorld } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  translateWorldPosition,
} from "./worldPosition";

const ORIGIN = createRegionCoord(-17, 23);

describe("aggregate ecology heard cues", () => {
  it("derives one anonymous physical rustle from a committed rat redistribution", () => {
    const current = ratFixture(0, 1);
    const first = deriveCoreEcologyAggregateContactEvents({
      patch: current.patch,
      tick: current.tick,
    });
    const replay = deriveCoreEcologyAggregateContactEvents({
      patch: current.patch,
      tick: current.tick,
    });

    expect(first).toEqual(replay);
    expect(first).toHaveLength(1);
    expect(first?.[0]).toMatchObject({
      domain: "animal-contact",
      sourceCategory: "animal",
      sourcePosition: current.evidence.position,
      occurredAtTick: current.tick,
      action: "brush",
      sourceMaterial: "body",
      surfaceMaterial: "mixed",
      semanticFamily: "rustle",
      soundClass: "physical-rustle",
      interrupt: "none",
      textualEligibility: "salience-gated",
      accessibilityRelevance: "informative",
    });
    expect(first?.[0]?.sourceId).toMatch(/^ecology-aggregate-source:/u);
    expect(first?.[0]?.sourceId).not.toContain(current.population.aggregateId);
    expect(first?.[0]).not.toHaveProperty("actorId");
    expect(JSON.stringify(first)).not.toContain(current.population.aggregateId);
    expect(JSON.stringify(first)).not.toContain(current.evidence.evidenceId);
    expect(JSON.stringify(first)).not.toContain(current.disturbance.causeReferenceId);

    const sample = first?.[0] === undefined
      ? null
      : coreEcologyAggregateSoundSample(first[0]);
    expect(sample).toMatchObject({
      acousticEventId: first?.[0]?.eventId,
      position: current.evidence.position,
      soundClass: "physical-rustle",
      soundInterrupt: "none",
      sourceId: first?.[0]?.sourceId,
    });
    expect(sample).not.toHaveProperty("sourceActorId");
  });

  it("fails a forged or incomplete rat disturbance/evidence pair closed", () => {
    const current = ratFixture(0, 1);
    const forged = structuredClone(current.patch);
    const population = forged.aggregatePopulations.find(({ species }) => (
      species === "brown-rat"
    ));
    const evidence = population?.evidence.find(({ evidenceOrdinal }) => (
      evidenceOrdinal === current.evidence.evidenceOrdinal
    ));
    if (evidence === undefined) throw new Error("Rat forgery fixture lost its evidence");
    (evidence as { strength: number }).strength += 1;

    expect(deriveCoreEcologyAggregateContactEvents({
      patch: forged,
      tick: current.tick,
    })).toBeNull();
    expect(deriveCoreEcologyAggregateContactEvents({
      patch: current.beforePatch,
      tick: current.tick,
    })).toEqual([]);
    expect(deriveCoreEcologyAggregateContactEvents({
      patch: current.patch,
      tick: current.tick + 1,
    })).toBeNull();
  });

  it("keeps aggregate rat repetition stable while distinct movements keep distinct identity", () => {
    const current = ratFixture(0, 1);
    const first = deriveCoreEcologyAggregateContactEvents({
      patch: current.patch,
      tick: current.tick,
    });
    const population = current.patch.aggregatePopulations.find(({ species }) => (
      species === "brown-rat"
    ));
    const from = population?.anchors.find(({ anchorOrdinal }) => (
      anchorOrdinal === current.disturbance.toAnchorOrdinal
    ));
    const to = population?.anchors.find(({ anchorOrdinal }) => (
      anchorOrdinal === current.disturbance.fromAnchorOrdinal
    ));
    if (population === undefined || from === undefined || to === undefined) {
      throw new Error("Rat replay fixture lost its anchors");
    }
    const movedAgain = displaceCoreEcologyAggregatePopulation(current.patch, {
      aggregateId: population.aggregateId,
      atTick: 1,
      causeKind: "human-disturbance",
      causeReferenceId: "test:aggregate-rat-contact-second",
      fromAnchorOrdinal: from.anchorOrdinal,
      toAnchorOrdinal: to.anchorOrdinal,
      populationUnits: 1,
      pressure: 720_000,
    });
    if (movedAgain === null) throw new Error("Rat replay fixture could not move twice");
    const later = deriveCoreEcologyAggregateContactEvents({
      patch: movedAgain.patch,
      tick: 1,
    });

    expect(first).toHaveLength(1);
    expect(later).toHaveLength(1);
    expect(later?.[0]?.sourceId).toBe(first?.[0]?.sourceId);
    expect(later?.[0]?.repetitionKey).toBe(first?.[0]?.repetitionKey);
    expect(later?.[0]?.eventId).not.toBe(first?.[0]?.eventId);
    expect(later?.[0]?.triggerEventId).not.toBe(first?.[0]?.triggerEventId);
  });

  it("hears rat contact by range and masking rather than visible evidence", () => {
    const nearby = ratFixture(0, 1);
    const heard = projectCoreEcologyAggregateHeardCues(aggregateAudioInput(nearby));
    const rustle = heard?.find(({ event }) => event.semanticFamily === "rustle");

    expect(rustle).toMatchObject({
      event: {
        domain: "animal-contact",
        semanticFamily: "rustle",
      },
      observation: {
        observerId: nearby.player.actorId,
        channel: "hearing",
        perceivedClass: "physical-rustle",
        subjectId: null,
        identification: "anonymous",
        interrupt: "none",
      },
    });
    expect(rustle?.observation).not.toHaveProperty("sourceId");
    expect(rustle?.observation).not.toHaveProperty("sourcePosition");
    expect(JSON.stringify(rustle)).not.toContain(nearby.population.aggregateId);
    expect(projectCoreEcologyAggregateHeardCues(aggregateAudioInput(ratFixture(0, 20)))
      ?.some(({ event }) => event.semanticFamily === "rustle")).toBe(false);
  });

  it("derives one exact ecology-owned group event at the deterministic representative anchor", () => {
    const current = fixture("rain", 900_000, 0, 1);
    const frogs = current.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    if (frogs === undefined) throw new Error("Expected aggregate frog population");
    const representative = [...frogs.anchors]
      .filter(({ populationUnits }) => populationUnits > 0)
      .sort((left, right) => (
        right.populationUnits - left.populationUnits
        || left.anchorOrdinal - right.anchorOrdinal
      ))[0];
    if (representative === undefined) throw new Error("Expected occupied frog anchor");
    const equallyLargest = frogs.anchors.filter(({ populationUnits }) => (
      populationUnits === representative.populationUnits
    ));

    const first = deriveCoreEcologyAggregateChorusEvents({
      patch: current.patch,
      tick: current.tick,
    });
    const replay = deriveCoreEcologyAggregateChorusEvents({
      patch: current.patch,
      tick: current.tick,
    });

    expect(first).toEqual(replay);
    expect(first).toHaveLength(1);
    expect(frogs.anchors.length).toBeGreaterThan(1);
    expect(equallyLargest.length).toBeGreaterThan(1);
    expect(representative.anchorOrdinal).toBe(Math.min(
      ...equallyLargest.map(({ anchorOrdinal }) => anchorOrdinal),
    ));
    expect(first?.[0]).toMatchObject({
      domain: "actor-vocalization",
      sourceCategory: "animal",
      sourcePosition: representative.position,
      occurredAtTick: 0,
      action: "vocalize",
      sourceMaterial: "body",
      surfaceMaterial: "water",
      semanticFamily: "chorus",
      intensity: frogs.activitySignal.intensity,
      soundClass: "animal-call",
      interrupt: "none",
      textualEligibility: "salience-gated",
      accessibilityRelevance: "informative",
    });
    expect(first?.[0]?.sourceId).toMatch(/^ecology-aggregate-source:/u);
    expect(first?.[0]?.sourceId).not.toContain(frogs.aggregateId);
    expect(first?.[0]).not.toHaveProperty("actorId");
    expect(JSON.stringify(first)).not.toContain(frogs.aggregateId);

    const sample = first?.[0] === undefined
      ? null
      : coreEcologyAggregateChorusSoundSample(first[0]);
    expect(sample).toMatchObject({
      acousticEventId: first?.[0]?.eventId,
      position: representative.position,
      soundLoudness: frogs.activitySignal.intensity,
      soundClass: "animal-call",
      soundInterrupt: "none",
      sourceId: first?.[0]?.sourceId,
    });
    expect(sample).not.toHaveProperty("sourceActorId");
  });

  it("keeps representative selection independent of aggregate ordering", () => {
    const current = fixture("rain", 900_000, 0, 1);
    const reversed = canonicalizeCoreEcologyAggregatePatch({
      ...current.patch,
      aggregatePopulations: [...current.patch.aggregatePopulations].reverse(),
    });
    if (reversed === null) throw new Error("Expected reordered patch to canonicalize");

    expect(deriveCoreEcologyAggregateChorusEvents({
      patch: reversed,
      tick: current.tick,
    })).toEqual(deriveCoreEcologyAggregateChorusEvents({
      patch: current.patch,
      tick: current.tick,
    }));
  });

  it("keeps aggregate source identity stable when its representative anchor moves", () => {
    const current = fixture("rain", 900_000, 0, 1);
    const frogs = current.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    if (frogs === undefined || frogs.anchors.length < 2) {
      throw new Error("Expected two aggregate frog anchors for source-movement proof");
    }
    const baseline = deriveCoreEcologyAggregateChorusEvents({
      patch: current.patch,
      tick: current.tick,
    });
    const moved = displaceCoreEcologyAggregatePopulation(current.patch, {
      aggregateId: frogs.aggregateId,
      atTick: current.tick,
      causeKind: "animal-disturbance",
      causeReferenceId: "test:chorus-representative-shift",
      fromAnchorOrdinal: frogs.anchors[0]!.anchorOrdinal,
      toAnchorOrdinal: frogs.anchors[1]!.anchorOrdinal,
      populationUnits: 1,
      pressure: 1,
    });
    if (moved === null) throw new Error("Expected authenticated aggregate displacement");
    const after = deriveCoreEcologyAggregateChorusEvents({
      patch: moved.patch,
      tick: current.tick,
    });

    expect(after).toHaveLength(1);
    expect(after?.[0]?.sourcePosition).not.toEqual(baseline?.[0]?.sourcePosition);
    expect(after?.[0]?.sourceId).toBe(baseline?.[0]?.sourceId);
    expect(after?.[0]?.repetitionKey).toBe(baseline?.[0]?.repetitionKey);
    expect(after?.[0]?.eventId).not.toBe(baseline?.[0]?.eventId);
  });

  it("emits only on cadence for an active threshold-qualified signal", () => {
    const current = fixture("rain", 900_000, 0, 1);
    const frogs = current.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    if (frogs === undefined) throw new Error("Expected aggregate frog population");
    const quiet = setCoreEcologyAggregateActivityIntensity(current.patch, {
      aggregateId: frogs.aggregateId,
      atTick: current.tick,
      intensity: CORE_ECOLOGY_CHORUS_MIN_ACTIVITY - 1,
    });
    if (quiet === null) throw new Error("Expected quiet aggregate patch");

    expect(deriveCoreEcologyAggregateChorusEvents({
      patch: quiet,
      tick: current.tick,
    })).toEqual([]);
    const offCadence = fixture("rain", 900_000, 1, 1);
    expect(deriveCoreEcologyAggregateChorusEvents({
      patch: offCadence.patch,
      tick: offCadence.tick,
    })).toEqual([]);
  });

  it("groups repetition by aggregate while each cadence tick remains an exact event", () => {
    const first = deriveCoreEcologyAggregateChorusEvents({
      patch: fixture("rain", 900_000, 0, 1).patch,
      tick: 0,
    });
    const later = deriveCoreEcologyAggregateChorusEvents({
      patch: fixture("rain", 900_000, 24, 1).patch,
      tick: 24,
    });

    expect(first).toHaveLength(1);
    expect(later).toHaveLength(1);
    expect(later?.[0]?.sourceId).toBe(first?.[0]?.sourceId);
    expect(later?.[0]?.repetitionKey).toBe(first?.[0]?.repetitionKey);
    expect(later?.[0]?.eventId).not.toBe(first?.[0]?.eventId);
    expect(later?.[0]?.triggerEventId).not.toBe(first?.[0]?.triggerEventId);
    expect(later?.[0]?.occurredAtTick).toBe(24);
  });

  it("projects one anonymous deterministic stereo chorus only through shared hearing", () => {
    const current = fixture("rain", 900_000, 0, 1);
    const before = serializeCoreEcologyAggregatePatch(current.patch);
    const first = projectCoreEcologyAggregateHeardCues(current);
    const replay = projectCoreEcologyAggregateHeardCues(current);

    expect(first).toEqual(replay);
    expect(first).toHaveLength(1);
    expect(first?.[0]).not.toHaveProperty("cue");
    expect(first?.[0]).not.toHaveProperty("caption");
    expect(first?.[0]?.pan).toBeGreaterThan(0);
    expect(first?.[0]?.contact.certainty).toBeGreaterThan(0);
    expect(first?.[0]?.observation).toMatchObject({
      observerId: current.player.actorId,
      channel: "hearing",
      perceivedClass: "animal-call",
      subjectId: null,
      identification: "anonymous",
      interrupt: "none",
    });
    expect(first?.[0]?.observation).not.toHaveProperty("sourceId");
    expect(first?.[0]?.observation).not.toHaveProperty("sourcePosition");
    expect(JSON.stringify(first)).not.toContain("FROG-AREA");
    expect(JSON.stringify(first)).not.toContain("aggregateId");
    expect(serializeCoreEcologyAggregatePatch(current.patch)).toBe(before);
  });

  it("keeps stereo rooted in the same anonymous heard-bearing contact", () => {
    const westward = projectCoreEcologyAggregateHeardCues(
      fixture("rain", 900_000, 0, -1),
    );

    expect(westward?.[0]?.pan).toBeLessThan(0);
    expect(westward?.[0]).not.toHaveProperty("caption");
  });

  it("keeps a co-located chorus centered without inventing a separate caption", () => {
    const coLocated = projectCoreEcologyAggregateHeardCues(
      fixture("clear", 0, 0, 0),
    );
    expect(coLocated?.[0]).toMatchObject({
      pan: 0,
    });
    expect(coLocated?.[0]).not.toHaveProperty("caption");
  });

  it("lets rain mask a distant chorus and keeps emission cadence bounded", () => {
    const clear = fixture("clear", 0, 0, 10);
    const rain = fixture("rain", 900_000, 0, 10);
    expect(projectCoreEcologyAggregateHeardCues(clear)).toHaveLength(1);
    expect(projectCoreEcologyAggregateHeardCues(rain)).toEqual([]);

    const offCadence = fixture(
      "clear",
      0,
      1,
      1,
    );
    expect(canonicalizeCoreEcologyAggregatePatch(offCadence.patch)).not.toBeNull();
    expect(isLivingActorAddress(offCadence.player)).toBe(true);
    expect(offCadence.patch.updatedAtTick).toBe(1);
    expect(offCadence.world.completedTick).toBe(1);
    expect(regionalWindowForWorld(offCadence.world)).toBe(offCadence.window);
    expect(projectCoreEcologyAggregateHeardCues(offCadence)).toEqual([]);
  });

  it("fails malformed inputs closed without manufacturing an aggregate actor", () => {
    const current = fixture("rain", FIXED_POINT, 0, 1);
    expect(projectCoreEcologyAggregateHeardCues({ ...current, tick: 1 })).toBeNull();
    expect(projectCoreEcologyAggregateHeardCues({
      ...current,
      player: { ...current.player, species: "southern-leopard-frog" },
    })).toBeNull();
    expect(current.patch.populations.flatMap(({ members }) => members)
      .some(({ actor }) => actor.identity.species === "southern-leopard-frog"))
      .toBe(false);
  });
});

function fixture(
  weatherKind: WeatherKind,
  weatherIntensity: number,
  tick: number,
  playerDistanceTiles: number,
) {
  const state = createWorld("settlement shadows interaction", "standard");
  state.meta.completedTick = tick;
  state.weather = {
    ...state.weather,
    kind: weatherKind,
    intensity: weatherIntensity,
    windX: 0,
    windY: 0,
  };
  const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: state.meta.rootSeed,
    originRegion: ORIGIN,
  });
  let patch = createCoreEcologyAggregatePatch({
    seed: state.meta.rootSeed,
    patchKey: "wave-b3:aggregate-audio",
    originRegion: ORIGIN,
    tick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v4", habitat },
  });
  const frogs = patch.aggregatePopulations.find(({ species }) => (
    species === "southern-leopard-frog"
  ));
  const anchor = frogs === undefined
    ? undefined
    : [...frogs.anchors]
        .filter(({ populationUnits }) => populationUnits > 0)
        .sort((left, right) => (
          right.populationUnits - left.populationUnits
          || left.anchorOrdinal - right.anchorOrdinal
        ))[0];
  if (frogs === undefined || anchor === undefined) {
    throw new Error("Aggregate audio fixture requires a frog anchor");
  }
  const active = setCoreEcologyAggregateActivityIntensity(patch, {
    aggregateId: frogs.aggregateId,
    atTick: tick,
    intensity: 900_000,
  });
  if (active === null) throw new Error("Could not activate frog chorus fixture");
  patch = active;
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center: ORIGIN }),
    regionalFrameOriginAtAddress({
      region: anchor.position.region,
      localX: Math.floor(anchor.position.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.floor(anchor.position.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  const player = createLivingActorAddress({
    actorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    species: "human",
    position: translateWorldPosition(
      anchor.position,
      -playerDistanceTiles * WORLD_POSITION_UNITS_PER_TILE,
      0,
    ),
    persistence: "promoted",
  });
  return { patch, player, tick, window, world };
}

function ratFixture(tick: number, playerDistanceTiles: number) {
  const current = fixture("clear", 0, tick, 1);
  const population = current.patch.aggregatePopulations.find(({ species }) => (
    species === "brown-rat"
  ));
  const from = population?.anchors.find(({ populationUnits }) => populationUnits > 0);
  const to = population?.anchors.find(({ anchorOrdinal }) => (
    anchorOrdinal !== from?.anchorOrdinal
  ));
  if (population === undefined || from === undefined || to === undefined) {
    throw new Error("Aggregate audio fixture requires a movable rat unit");
  }
  const moved = displaceCoreEcologyAggregatePopulation(current.patch, {
    aggregateId: population.aggregateId,
    atTick: tick,
    causeKind: "human-disturbance",
    causeReferenceId: "test:aggregate-rat-contact",
    fromAnchorOrdinal: from.anchorOrdinal,
    toAnchorOrdinal: to.anchorOrdinal,
    populationUnits: 1,
    pressure: 720_000,
  });
  if (moved === null) throw new Error("Aggregate audio fixture could not move its rat unit");
  const state = createWorld("settlement shadows interaction", "standard");
  state.meta.completedTick = tick;
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center: ORIGIN }),
    regionalFrameOriginAtAddress({
      region: moved.evidence.position.region,
      localX: Math.floor(moved.evidence.position.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.floor(moved.evidence.position.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  const player = createLivingActorAddress({
    actorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    species: "human",
    position: translateWorldPosition(
      moved.evidence.position,
      -playerDistanceTiles * WORLD_POSITION_UNITS_PER_TILE,
      0,
    ),
    persistence: "promoted",
  });
  return {
    ...current,
    beforePatch: current.patch,
    patch: moved.patch,
    player,
    window,
    world,
    population,
    evidence: moved.evidence,
    disturbance: moved.disturbance,
  };
}

function aggregateAudioInput(input: Readonly<{
  patch: ReturnType<typeof createCoreEcologyAggregatePatch>;
  player: ReturnType<typeof createLivingActorAddress>;
  tick: number;
  window: ReturnType<typeof createRegionalTerrainWindow>;
  world: ReturnType<typeof createRegionalWorldView>;
}>) {
  return {
    patch: input.patch,
    player: input.player,
    tick: input.tick,
    window: input.window,
    world: input.world,
  };
}

function individualInputs(
  habitat: CoreEcologyRainChorusHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }]
  ));
}
