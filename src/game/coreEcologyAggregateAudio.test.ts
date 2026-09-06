import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, type WeatherKind } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregateActivityIntensity,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { projectCoreEcologyAggregateHeardCues } from "./coreEcologyAggregateAudio";
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
  it("projects one anonymous deterministic stereo chorus only through shared hearing", () => {
    const current = fixture("rain", 900_000, 0, 1);
    const before = serializeCoreEcologyAggregatePatch(current.patch);
    const first = projectCoreEcologyAggregateHeardCues(current);
    const replay = projectCoreEcologyAggregateHeardCues(current);

    expect(first).toEqual(replay);
    expect(first).toHaveLength(1);
    expect(first?.[0]).toMatchObject({
      cue: "frog-chorus",
      caption: "[frog chorus nearby]",
    });
    expect(first?.[0]?.pan).toBeGreaterThan(0);
    expect(first?.[0]?.contact.certainty).toBeGreaterThan(0);
    expect(JSON.stringify(first)).not.toContain("FROG-AREA");
    expect(JSON.stringify(first)).not.toContain("aggregateId");
    expect(serializeCoreEcologyAggregatePatch(current.patch)).toBe(before);
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
  const anchor = frogs?.anchors[0];
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
