import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { MAX_TIDE_LEVEL } from "../sim/terrain";
import { FIXED_POINT } from "../sim/types";
import { hashCanonical } from "../sim/util";
import { WORLD_DAY_START_TICK, WORLD_NIGHT_START_TICK } from "../sim/worldTime";
import {
  animalContactAcousticTriggerEventId,
  createAnimalContactAcousticCarryRecord,
  physicalSoundSampleForAnimalContact,
} from "./animalContactAcousticCarry";
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
import { animalContactAcousticEvent } from "./worldAcoustics";
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

  describe("caller-authenticated body contact surface support", () => {
    it("lets a dry ridge remove the same supported contact without grounding an unspecified source", () => {
      const clear = surfaceContactFixture(4, false);
      const blocked = surfaceContactFixture(4, true);
      expect(blocked.sample).toEqual(clear.sample);
      const before = JSON.stringify([clear.input, blocked.input]);
      const heard = collectDogPhysicalAcousticObservationBatches({
        ...clear.input, surfaceSoundSampleIds: [clear.sample.id],
      })?.[0]?.observations;

      expect(heard).toEqual([expect.objectContaining({
        channel: "hearing", perceivedClass: clear.sample.soundClass,
        identification: "anonymous", subjectId: null, interrupt: "none",
      })]);
      expect(heard?.[0]?.area.radiusUnits).toBeGreaterThan(0);
      expect(heard?.[0]?.area.center).not.toEqual(clear.sample.position);
      expect(heard?.[0]).not.toHaveProperty("sourceId");
      expect(heard?.[0]).not.toHaveProperty("acousticEventId");
      expect(collectDogPhysicalAcousticObservationBatches({
        ...blocked.input, surfaceSoundSampleIds: [blocked.sample.id],
      })?.[0]?.observations).toEqual([]);
      expect(collectDogPhysicalAcousticObservationBatches(blocked.input))
        .toEqual(collectDogPhysicalAcousticObservationBatches(clear.input));
      expect(collectDogPhysicalAcousticObservationBatches({
        ...blocked.input, surfaceSoundSampleIds: [],
      })).toEqual(collectDogPhysicalAcousticObservationBatches(blocked.input));
      expect(JSON.stringify([clear.input, blocked.input])).toBe(before);
    });

    it("lowers anonymous certainty when a closer supported contact still reaches the dog", () => {
      const clear = surfaceContactFixture(2, false);
      const blocked = surfaceContactFixture(2, true);
      const hearing = (current: ReturnType<typeof surfaceContactFixture>) => (
        collectDogPhysicalAcousticObservationBatches({
          ...current.input, surfaceSoundSampleIds: [current.sample.id],
        })?.[0]?.observations[0]
      );
      const clearHearing = hearing(clear);
      const blockedHearing = hearing(blocked);

      expect(clearHearing).toMatchObject({ channel: "hearing", subjectId: null });
      expect(blockedHearing).toMatchObject({ channel: "hearing", subjectId: null });
      expect(blockedHearing!.id).toBe(clearHearing!.id);
      expect(blockedHearing!.confidence).toBeGreaterThan(0);
      expect(blockedHearing!.confidence).toBeLessThan(clearHearing!.confidence);
    });

    it("does not infer surface support from a dog-shaped source ID or a physical sound class", () => {
      const clear = surfaceContactFixture(4, false);
      const blocked = surfaceContactFixture(4, true);
      const sample = createPhysicalSoundSample({
        ...clear.sample, id: "surface-dog-footstep", sourceId: "domestic-dog:surface-contact",
      });
      if (sample === null) throw new Error("Source label fixture was malformed");
      const inputFor = (current: ReturnType<typeof surfaceContactFixture>) => ({
        ...current.input, physicalSoundSamples: [sample],
      });

      expect(collectDogPhysicalAcousticObservationBatches(inputFor(clear))?.[0]?.observations)
        .toHaveLength(1);
      expect(collectDogPhysicalAcousticObservationBatches(inputFor(blocked)))
        .toEqual(collectDogPhysicalAcousticObservationBatches(inputFor(clear)));
    });

    it("fails closed for malformed available path geometry instead of claiming clear hearing", () => {
      const current = surfaceContactFixture(4, false);
      // This crossed cell lies beyond the listener's 5x5 masking neighborhood,
      // so rejection exercises path geometry rather than ambient-water input.
      const crossed = current.input.world.terrain.tiles[30 * current.input.world.terrain.width + 33];
      if (crossed === undefined) throw new Error("Surface path fixture lost a crossed cell");
      crossed.elevation = Number.NaN;

      expect(collectDogPhysicalAcousticObservationBatches(current.input)?.[0]?.observations)
        .toHaveLength(1);
      expect(collectDogPhysicalAcousticObservationBatches({
        ...current.input, surfaceSoundSampleIds: [current.sample.id],
      })).toBeNull();
    });

    it("rejects malformed, duplicate, foreign and over-cap support IDs even with an empty sound bank", () => {
      const current = surfaceContactFixture(4, false);
      type Input = Parameters<typeof collectDogPhysicalAcousticObservationBatches>[0];
      const invalid: readonly unknown[] = [
        undefined, null, {}, current.sample.id,
        [current.sample.id, current.sample.id], ["foreign-sound"],
        [current.sample.id, "foreign-sound"], [1], ["invalid sound id"],
        ["x".repeat(49)], new Array(1),
        Array.from({ length: PHYSICAL_ACOUSTIC_MAX_SAMPLES + 1 }, (_, index) => `extra-${index}`),
      ];
      for (const surfaceSoundSampleIds of invalid) {
        expect(collectDogPhysicalAcousticObservationBatches({
          ...current.input, surfaceSoundSampleIds,
        } as unknown as Input)).toBeNull();
        expect(collectDogPhysicalAcousticObservationBatches({
          dogs: [], physicalSoundSamples: [], world: null, window: null,
          targetTick: 1, surfaceSoundSampleIds,
        } as unknown as Input)).toBeNull();
      }
      expect(collectDogPhysicalAcousticObservationBatches({
        dogs: [null as never], physicalSoundSamples: [], world: null as never,
        window: null as never, targetTick: 1, surfaceSoundSampleIds: [],
      })).toEqual([]);
    });
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

/** Structured contact and registered-frame fixtures, not emitted runtime gameplay. */
function surfaceContactFixture(sourceOffset: 2 | 4, ridge: boolean) {
  const region = createRegionCoord(0, 0);
  const state = createWorld("dog contact surface propagation fixture", "standard");
  state.weather = { ...state.weather, kind: "clear", intensity: 0, windX: 0, windY: 0 };
  state.tide = { ...state.tide, level: 0 };
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
    { x: 0, y: 0 },
  );
  const world = createRegionalWorldView(
    createWorldView(state), window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  for (const tile of world.terrain.tiles) {
    tile.terrain = "meadow";
    tile.elevation = MAX_TIDE_LEVEL + 1;
    tile.roughness = 0;
    tile.waterDepth = 0;
  }
  if (ridge) {
    const crest = world.terrain.tiles[30 * world.terrain.width + 31];
    if (crest === undefined) throw new Error("Surface contact fixture lost its dry crest");
    crest.terrain = "ridge";
    crest.elevation = FIXED_POINT;
  }
  const listener = createDogActorState({
    seed: seedFromText("dog contact surface propagation listener"),
    originRegion: region, originNamespace: "regional", habitatClass: "coastal-lowland",
    habitatKey: "dog-surface-test/listener", populationKey: "dog-surface-test/population",
    populationOrdinal: 0, position: createWorldPosition(region, 30_500, 30_500), tick: 0,
  });
  const sourcePosition = createWorldPosition(region, 30_500 + sourceOffset * 1_000, 30_500);
  const beforePosition = createWorldPosition(region, sourcePosition.localX - 400, 30_500);
  const triggerEventId = animalContactAcousticTriggerEventId({
    sourceId: "A-v1-contact-source", beforePosition, afterPosition: sourcePosition, occurredAtTick: 0,
  });
  const event = triggerEventId === null ? null : animalContactAcousticEvent({
    triggerEventId, sourceId: "A-v1-contact-source", sourcePosition, occurredAtTick: 0,
    bodySize: "medium", movement: "slow", surfaceMaterial: "soil",
  });
  const record = event === null ? null : createAnimalContactAcousticCarryRecord({ beforePosition, event });
  const sample = record === null ? null : physicalSoundSampleForAnimalContact(record);
  if (sample === null) throw new Error("Surface contact fixture lost its structured causal sample");
  return { sample, input: { dogs: [listener], physicalSoundSamples: [sample], world, window, targetTick: 1 } };
}
