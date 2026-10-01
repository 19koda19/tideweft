import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import { hashCanonical } from "../sim/util";
import { WORLD_DAY_START_TICK, WORLD_NIGHT_START_TICK } from "../sim/worldTime";
import { createDogActorState } from "./dogActor";
import {
  DOG_PHYSICAL_ACOUSTIC_MAX_LISTENERS,
  collectDogPhysicalAcousticObservationBatches,
} from "./dogPhysicalAcousticPerception";
import {
  PHYSICAL_ACOUSTIC_MAX_SAMPLES,
  ambientNoiseAt,
  createPhysicalSoundSample,
} from "./physicalAcousticPerception";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { createWorldPosition } from "./worldPosition";

describe("dog physical-acoustic perception bridge", () => {
  it("does no listener or terrain work when the bounded carry is empty", () => {
    expect(collectDogPhysicalAcousticObservationBatches({
      dogs: [],
      physicalSoundSamples: [],
      world: null as never,
      window: null as never,
      targetTick: 0,
    })).toEqual([]);
  });

  it("uses registered dog sensitivity and listener-local rather than source-local masking", () => {
    const region = createRegionCoord(0, 0);
    const listenerPosition = createWorldPosition(region, 30_500, 30_500);
    const state = createWorld("dog physical acoustic boundaries", "standard");
    state.weather = {
      ...state.weather,
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
    };
    state.tide = { ...state.tide, level: 0 };
    const economy = createWorldView(state);
    const stream = createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed });
    const window = createRegionalTerrainWindow(
      state.meta.rootSeed,
      stream,
      { x: 0, y: 0 },
    );
    const world = createRegionalWorldView(
      economy,
      window,
      projectRegionalCartographyWindow(
        createRegionalCartography(state.meta.rootSeed),
        window,
      ),
    );
    for (const tile of world.terrain.tiles) {
      tile.terrain = "meadow";
      tile.elevation = 0;
      tile.roughness = 0;
      tile.waterDepth = 0;
    }

    const dog = createDogActorState({
      seed: seedFromText("dog physical acoustic listener"),
      originRegion: region,
      originNamespace: "regional",
      habitatClass: "coastal-lowland",
      habitatKey: "dog-acoustic-test/listener",
      populationKey: "dog-acoustic-test/population",
      populationOrdinal: 0,
      position: listenerPosition,
      heading: 0,
      tick: 0,
    });
    const atSensitivityBoundary = createPhysicalSoundSample({
      acousticEventId: "acoustic:dog-contact:sensitivity-boundary",
      id: "dog-boundary-a",
      position: createWorldPosition(region, 40_000, 30_500),
      soundClass: "physical-rustle",
      soundInterrupt: "none",
      soundLoudness: FIXED_POINT,
      soundRangeUnits: 10_000,
      sourceId: "A-v1-dog-acoustic-source",
    });
    const outsideSensitivityBoundary = createPhysicalSoundSample({
      acousticEventId: "acoustic:dog-contact:outside-sensitivity-boundary",
      id: "dog-boundary-b",
      position: createWorldPosition(region, 40_001, 30_500),
      soundClass: "physical-thud",
      soundInterrupt: "none",
      soundLoudness: FIXED_POINT,
      soundRangeUnits: 10_000,
      sourceId: "A-v1-dog-acoustic-source-2",
    });
    if (atSensitivityBoundary === null || outsideSensitivityBoundary === null) {
      throw new Error("Dog physical-acoustic samples were malformed");
    }

    const validInput = {
      dogs: [dog],
      physicalSoundSamples: [atSensitivityBoundary],
      world,
      window,
      targetTick: 1,
    } as const;
    expect(collectDogPhysicalAcousticObservationBatches({
      ...validInput,
      dogs: Array.from(
        { length: DOG_PHYSICAL_ACOUSTIC_MAX_LISTENERS + 1 },
        () => dog,
      ),
    })).toBeNull();
    expect(collectDogPhysicalAcousticObservationBatches({
      ...validInput,
      physicalSoundSamples: Array.from(
        { length: PHYSICAL_ACOUSTIC_MAX_SAMPLES + 1 },
        () => atSensitivityBoundary,
      ),
    })).toBeNull();
    expect(collectDogPhysicalAcousticObservationBatches({
      ...validInput,
      dogs: [null as never],
    })).toBeNull();
    expect(collectDogPhysicalAcousticObservationBatches({
      ...validInput,
      physicalSoundSamples: [null as never],
    })).toBeNull();
    const chorus = createPhysicalSoundSample({
      acousticEventId: "acoustic:actor-vocalization:aggregate-chorus",
      id: "aggregate-chorus",
      position: createWorldPosition(region, 35_000, 30_500),
      soundClass: "animal-call",
      soundInterrupt: "none",
      soundLoudness: FIXED_POINT,
      soundRangeUnits: 10_000,
      sourceId: "ecology-aggregate-source:opaque",
    });
    if (chorus === null) throw new Error("Dog aggregate-chorus sample was malformed");
    expect(collectDogPhysicalAcousticObservationBatches({
      ...validInput,
      physicalSoundSamples: [chorus],
    })?.[0]?.observations).toContainEqual(expect.objectContaining({
      channel: "hearing",
      perceivedClass: "animal-call",
      identification: "anonymous",
      subjectId: null,
      interrupt: "none",
    }));

    const sourceTileIndex = 30 * world.terrain.width + 40;
    const listenerTileIndex = 30 * world.terrain.width + 30;
    const sourceTile = world.terrain.tiles[sourceTileIndex];
    const listenerTile = world.terrain.tiles[listenerTileIndex];
    if (sourceTile === undefined || listenerTile === undefined) {
      throw new Error("Dog physical-acoustic fixture left its regional window");
    }
    sourceTile.terrain = "deep-water";
    sourceTile.waterDepth = FIXED_POINT;
    sourceTile.roughness = FIXED_POINT;

    expect(ambientNoiseAt(world, listenerTileIndex)).toBe(0);
    expect(ambientNoiseAt(world, sourceTileIndex)).toBe(0.541394);
    const targetTick = 1;
    const sourceNoisy = collectDogPhysicalAcousticObservationBatches({
      dogs: [dog],
      physicalSoundSamples: [outsideSensitivityBoundary, atSensitivityBoundary],
      world,
      window,
      targetTick,
    });
    const projectedSourceNoisy = sourceNoisy?.map(({ observerId, observations }) => ({
      observerId,
      ids: observations.map(({ id }) => id),
      classes: observations.map(({ perceivedClass }) => perceivedClass),
    }));
    expect(projectedSourceNoisy).toEqual([{
      observerId: dog.identity.stableId,
      ids: [`physical-hearing:${hashCanonical({
        acousticEventId: atSensitivityBoundary.acousticEventId,
        observerId: dog.identity.stableId,
        targetTick,
      })}`],
      classes: ["physical-rustle"],
    }]);

    sourceTile.terrain = "meadow";
    sourceTile.waterDepth = 0;
    sourceTile.roughness = 0;
    listenerTile.terrain = "deep-water";
    listenerTile.waterDepth = FIXED_POINT;
    listenerTile.roughness = FIXED_POINT;

    expect(ambientNoiseAt(world, sourceTileIndex)).toBe(0);
    expect(ambientNoiseAt(world, listenerTileIndex)).toBe(0.541394);
    expect(collectDogPhysicalAcousticObservationBatches({
      dogs: [dog],
      physicalSoundSamples: [outsideSensitivityBoundary, atSensitivityBoundary],
      world,
      window,
      targetTick,
    })?.[0]?.observations).toEqual([]);
  });

  it("does not invent a quiet-night hearing bonus without a physical soundscape source", () => {
    const state = createWorld("dog acoustic day phase is not ambient masking", "standard");
    state.weather = {
      ...state.weather,
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
    };
    state.tide = { ...state.tide, level: 0 };
    const economy = createWorldView(state);
    const window = createRegionalTerrainWindow(
      state.meta.rootSeed,
      createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
      { x: 0, y: 0 },
    );
    const world = createRegionalWorldView(
      economy,
      window,
      projectRegionalCartographyWindow(
        createRegionalCartography(state.meta.rootSeed),
        window,
      ),
    );
    for (const tile of world.terrain.tiles) {
      tile.terrain = "meadow";
      tile.elevation = 0;
      tile.roughness = 0;
      tile.waterDepth = 0;
    }
    const listenerTileIndex = 30 * world.terrain.width + 30;

    expect(ambientNoiseAt({ ...world, completedTick: WORLD_DAY_START_TICK }, listenerTileIndex))
      .toBe(0);
    expect(ambientNoiseAt({ ...world, completedTick: WORLD_NIGHT_START_TICK }, listenerTileIndex))
      .toBe(0);
  });
});
