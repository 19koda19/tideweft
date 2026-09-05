import { describe, expect, it } from "vitest";

import {
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  type ActorObservation,
} from "../sim/actorPerception";
import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, type WorldState, type WorldView } from "../sim/types";
import {
  CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS,
  CORE_ECOLOGY_CAT_RAIN_CUE_MIN_INTENSITY,
  collectCoreEcologyVisualObservationBatches,
  propagateCoreEcologyAlarmObservationBatches,
  type CoreEcologyPerceptionFrameInput,
} from "./coreEcologyPerception";
import {
  CORE_WILDLIFE_EVENT_VERSION,
  createCoreWildlifeActorState,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
} from "./coreWildlifeActor";
import { createLivingActorAddress, type LivingActorAddress } from "./livingActor";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { createWorldPosition } from "./worldPosition";

const REGION = createRegionCoord(0, 0);
const OBSERVER_X = 38;
const OBSERVER_Y = 30;

interface Fixture {
  readonly state: WorldState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
}

describe("core ecology cross-species perception bridge", () => {
  it("classifies a directly seen bear as a predator to deer and deer as prey only to bear", () => {
    const current = fixture("bear deer direct contact");
    const deer = wildlife(current, "deer", OBSERVER_X, OBSERVER_Y, 0, 0);
    const bear = wildlife(current, "black-bear", OBSERVER_X + 4, OBSERVER_Y, 500_000, 0);
    const first = collectCoreEcologyVisualObservationBatches(frame(current, [bear, deer]));
    const second = collectCoreEcologyVisualObservationBatches(frame(current, [deer, bear]));

    expect(first).toEqual(second);
    expect(first?.map(({ observerId }) => observerId))
      .toEqual([...first!.map(({ observerId }) => observerId)].sort());
    expect(observationsFor(first, deer.identity.stableId)).toEqual([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "large-predator",
        subjectId: bear.identity.stableId,
        identification: "identified",
      }),
    ]);
    expect(observationsFor(first, bear.identity.stableId)).toEqual([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "live-prey",
        subjectId: deer.identity.stableId,
        identification: "identified",
      }),
    ]);
    expect(JSON.stringify(first)).not.toContain("needs");
    expect(JSON.stringify(first)).not.toContain("cargo");
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("gives an in-frame porter only lawful visual facts about a bear", () => {
    const current = fixture("porter sees bear");
    const porter = actorAddress("H-core-ecology-porter", "human", OBSERVER_X, OBSERVER_Y, 0);
    const bear = wildlife(current, "black-bear", OBSERVER_X + 4, OBSERVER_Y, 500_000, 0);
    const batches = collectCoreEcologyVisualObservationBatches(frame(current, [bear], {
      porterAddress: porter,
    }));

    expect(observationsFor(batches, porter.actorId)).toEqual([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "large-predator",
        subjectId: bear.identity.stableId,
        area: { center: bear.address.position, radiusUnits: 0 },
      }),
    ]);
    expect(observationsFor(batches, bear.identity.stableId)).toEqual([
      expect.objectContaining({ perceivedClass: "human", subjectId: porter.actorId }),
    ]);
  });

  it("lets a free-ranging cat and dog recognize one another without turning either into prey", () => {
    const current = fixture("cat and dog direct contact");
    const cat = wildlife(current, "domestic-cat", OBSERVER_X, OBSERVER_Y, 0, 0);
    const dog = actorAddress(
      "D-core-ecology-cat-contact",
      "domestic-dog",
      OBSERVER_X + 4,
      OBSERVER_Y,
      500_000,
    );
    const batches = collectCoreEcologyVisualObservationBatches(frame(current, [cat], {
      dogAddress: dog,
    }));

    expect(observationsFor(batches, cat.identity.stableId)).toEqual([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "predator",
        subjectId: dog.actorId,
        identification: "identified",
      }),
    ]);
    expect(observationsFor(batches, dog.actorId)).toEqual([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "domestic-cat",
        subjectId: cat.identity.stableId,
        identification: "identified",
      }),
    ]);
    expect(observationsFor(batches, cat.identity.stableId)[0]?.perceivedClass)
      .not.toBe("live-prey");
  });

  it("classifies a directly seen cat as a lawful food competitor to another cat", () => {
    const current = fixture("cat same-species competitor");
    const observer = wildlife(current, "domestic-cat", OBSERVER_X, OBSERVER_Y, 0, 0);
    const neighbor = wildlife(
      current,
      "domestic-cat",
      OBSERVER_X + 3,
      OBSERVER_Y,
      500_000,
      1,
    );
    const batches = collectCoreEcologyVisualObservationBatches(frame(current, [neighbor, observer]));

    expect(observationsFor(batches, observer.identity.stableId)).toEqual([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "food-competitor",
        subjectId: neighbor.identity.stableId,
        identification: "identified",
      }),
    ]);
  });

  it("gives only a materialized cat a bounded local rain cue, not a remote weather identity", () => {
    const rainy = fixture("cat hears direct rain", undefined, {
      kind: "rain",
      intensity: 680_000,
    });
    const clear = fixture("cat clear control");
    const rainyCat = wildlife(rainy, "domestic-cat", OBSERVER_X, OBSERVER_Y, 0, 0);
    const clearCat = wildlife(clear, "domestic-cat", OBSERVER_X, OBSERVER_Y, 0, 0);
    const rainyDeer = wildlife(rainy, "deer", OBSERVER_X + 5, OBSERVER_Y, 0, 0);

    const rainyBatches = collectCoreEcologyVisualObservationBatches(frame(rainy, [
      rainyCat,
      rainyDeer,
    ]));
    const catRain = observationsFor(rainyBatches, rainyCat.identity.stableId)
      .find(({ perceivedClass }) => perceivedClass === "rain-exposure");
    expect(catRain).toMatchObject({
      channel: "hearing",
      subjectId: null,
      area: {
        center: rainyCat.address.position,
        radiusUnits: MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
      },
      confidence: 680_000,
      salience: 680_000,
      identification: "anonymous",
    });
    expect(observationsFor(rainyBatches, rainyDeer.identity.stableId)
      .some(({ perceivedClass }) => perceivedClass === "rain-exposure")).toBe(false);
    expect(observationsFor(
      collectCoreEcologyVisualObservationBatches(frame(clear, [clearCat])),
      clearCat.identity.stableId,
    )).toEqual([]);

    const drizzle = fixture("cat drizzle below cue floor", undefined, {
      kind: "rain",
      intensity: CORE_ECOLOGY_CAT_RAIN_CUE_MIN_INTENSITY - 1,
    });
    const drizzleCat = wildlife(drizzle, "domestic-cat", OBSERVER_X, OBSERVER_Y, 0, 0);
    expect(observationsFor(
      collectCoreEcologyVisualObservationBatches(frame(drizzle, [drizzleCat])),
      drizzleCat.identity.stableId,
    )).toEqual([]);
  });

  it("lets a distinct in-frame player and wildlife perceive each other without non-core cross-contact", () => {
    const current = fixture("player sees bear");
    const player = actorAddress("H-core-ecology-player", "human", OBSERVER_X, OBSERVER_Y, 0);
    const porter = actorAddress("H-core-ecology-porter", "human", OBSERVER_X, OBSERVER_Y, 0);
    const dog = actorAddress("D-core-ecology-dog", "domestic-dog", OBSERVER_X, OBSERVER_Y, 0);
    const bear = wildlife(current, "black-bear", OBSERVER_X + 4, OBSERVER_Y, 500_000, 0);
    const batches = collectCoreEcologyVisualObservationBatches(frame(current, [bear], {
      dogAddress: dog,
      playerAddress: player,
      porterAddress: porter,
    }));

    expect(observationsFor(batches, player.actorId)).toEqual([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "large-predator",
        subjectId: bear.identity.stableId,
        identification: "identified",
      }),
    ]);
    expect(observationsFor(batches, player.actorId).some(({ subjectId }) => (
      subjectId === porter.actorId || subjectId === dog.actorId
    ))).toBe(false);
    expect(observationsFor(batches, bear.identity.stableId).map(({ subjectId }) => subjectId))
      .toEqual([dog.actorId, player.actorId, porter.actorId].sort());
    expect(observationsFor(batches, bear.identity.stableId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ perceivedClass: "human", subjectId: player.actorId }),
    ]));
  });

  it("keeps a player's peripheral wildlife contact anonymous", () => {
    const current = fixture("player peripheral bear silhouette");
    const player = actorAddress(
      "H-core-ecology-player-peripheral",
      "human",
      OBSERVER_X + 3,
      OBSERVER_Y,
      500_000,
    );
    const bear = wildlife(current, "black-bear", OBSERVER_X + 4, OBSERVER_Y, 500_000, 0);
    const batches = collectCoreEcologyVisualObservationBatches(frame(current, [bear], {
      playerAddress: player,
    }));

    expect(observationsFor(batches, player.actorId)).toEqual([
      expect.objectContaining({
        channel: "vision",
        perceivedClass: "animal-silhouette",
        subjectId: null,
        identification: "classified",
      }),
    ]);
  });

  it("produces empty observer batches when terrain occludes the contact", () => {
    const current = fixture("ridge blocks bear", OBSERVER_X + 2);
    const deer = wildlife(current, "deer", OBSERVER_X, OBSERVER_Y, 0, 0);
    const bear = wildlife(current, "black-bear", OBSERVER_X + 4, OBSERVER_Y, 500_000, 0);
    const batches = collectCoreEcologyVisualObservationBatches(frame(current, [deer, bear]));

    expect(batches).toEqual([
      { observerId: bear.identity.stableId, observations: [] },
      { observerId: deer.identity.stableId, observations: [] },
    ].sort((left, right) => left.observerId.localeCompare(right.observerId)));
  });

  it("propagates only an explicit, in-range alarm and never leaks emitter identity", () => {
    const current = fixture("gull alarm reaches deer");
    const deer = wildlife(current, "deer", OBSERVER_X, OBSERVER_Y, 0, 0);
    const gull = wildlife(current, "gull", OBSERVER_X + 4, OBSERVER_Y, 500_000, 0);
    const distantDeer = wildlife(current, "deer", OBSERVER_X + 24, OBSERVER_Y, 500_000, 1);
    const porter = actorAddress("H-alarm-listener", "human", OBSERVER_X + 6, OBSERVER_Y, 500_000);
    const player = actorAddress("H-alarm-player", "human", OBSERVER_X + 7, OBSERVER_Y, 500_000);
    const input = frame(current, [gull, deer, distantDeer], {
      playerAddress: player,
      porterAddress: porter,
    });
    const event = alarmEvent(gull);

    expect(collectCoreEcologyVisualObservationBatches(input)?.flatMap(({ observations }) =>
      observations.filter(({ channel }) => channel === "hearing")
    )).toEqual([]);
    const batches = propagateCoreEcologyAlarmObservationBatches(event, input);
    const heard = observationsFor(batches, deer.identity.stableId)[0];
    expect(heard).toMatchObject({
      channel: "hearing",
      perceivedClass: "animal-alarm",
      subjectId: null,
      identification: "anonymous",
      interrupt: "strong",
      area: { center: gull.address.position },
    });
    expect(heard?.area.radiusUnits).toBeGreaterThanOrEqual(
      MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
    );
    expect(heard?.area.radiusUnits).toBeLessThanOrEqual(CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS);
    expect(observationsFor(batches, gull.identity.stableId)).toEqual([]);
    expect(observationsFor(batches, porter.actorId)).toHaveLength(1);
    expect(observationsFor(batches, player.actorId)).toEqual([
      expect.objectContaining({
        channel: "hearing",
        perceivedClass: "animal-alarm",
        subjectId: null,
        identification: "anonymous",
      }),
    ]);
    expect(observationsFor(batches, distantDeer.identity.stableId)).toEqual([]);
    const serialized = JSON.stringify(heard);
    expect(serialized).not.toContain(gull.identity.stableId);
    expect(serialized).not.toContain(gull.identity.species);
    expect(serialized).not.toContain(event.eventId);
    expect(serialized).not.toContain(event.causeReferenceId);
  });

  it("fails closed on stale/aliased frames and forged alarms", () => {
    const current = fixture("malformed perception fails closed");
    const deer = wildlife(current, "deer", OBSERVER_X, OBSERVER_Y, 0, 0);
    const gull = wildlife(current, "gull", OBSERVER_X + 4, OBSERVER_Y, 500_000, 0);
    const valid = frame(current, [deer, gull]);
    const wrongWindow = fixture("unrelated registered window").window;

    expect(collectCoreEcologyVisualObservationBatches({ ...valid, tick: 0 })).toBeNull();
    expect(collectCoreEcologyVisualObservationBatches({ ...valid, actors: [deer, deer] }))
      .toBeNull();
    expect(collectCoreEcologyVisualObservationBatches({ ...valid, window: wrongWindow }))
      .toBeNull();
    expect(collectCoreEcologyVisualObservationBatches({
      ...valid,
      dogAddress: actorAddress("H-not-a-dog", "human", OBSERVER_X, OBSERVER_Y, 0),
    })).toBeNull();
    const sharedHuman = actorAddress("H-aliased-human", "human", OBSERVER_X, OBSERVER_Y, 0);
    expect(collectCoreEcologyVisualObservationBatches({
      ...valid,
      playerAddress: sharedHuman,
      porterAddress: sharedHuman,
    })).toBeNull();
    expect(collectCoreEcologyVisualObservationBatches({
      ...valid,
      playerAddress: actorAddress(
        "D-not-a-player",
        "domestic-dog",
        OBSERVER_X,
        OBSERVER_Y,
        0,
      ),
    })).toBeNull();
    expect(propagateCoreEcologyAlarmObservationBatches({
      ...alarmEvent(gull),
      actorId: deer.identity.stableId,
    }, valid)).toBeNull();
    expect(propagateCoreEcologyAlarmObservationBatches({
      ...alarmEvent(gull),
      hiddenTarget: deer.identity.stableId,
    }, valid)).toBeNull();
  });
});

function fixture(
  seedText: string,
  ridgeAtX?: number,
  weather: Readonly<{ kind: "rain" | "storm"; intensity: number }> | null = null,
): Fixture {
  const state = createWorld(seedText, "standard");
  state.weather = {
    ...state.weather,
    kind: weather?.kind ?? "clear",
    intensity: weather?.intensity ?? 0,
    windX: 0,
    windY: 0,
  };
  for (const settlement of state.settlements) settlement.tileIndex = 0;
  for (let x = OBSERVER_X - 1; x <= OBSERVER_X + 24; x += 1) {
    const tile = state.terrain.tiles[OBSERVER_Y * state.terrain.width + x];
    if (tile === undefined) throw new Error("Perception fixture corridor left terrain");
    tile.terrain = "meadow";
    tile.elevation = 0;
    tile.roughness = 0;
  }
  if (ridgeAtX !== undefined) {
    const ridge = state.terrain.tiles[OBSERVER_Y * state.terrain.width + ridgeAtX];
    if (ridge === undefined) throw new Error("Perception fixture ridge left terrain");
    ridge.terrain = "ridge";
    ridge.elevation = FIXED_POINT;
  }
  const economy = createWorldView(state);
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
    regionalFrameOriginAtAddress({
      region: REGION,
      localX: OBSERVER_X,
      localY: OBSERVER_Y,
    }),
  );
  const world = createRegionalWorldView(
    economy,
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  return { state, world, window };
}

function wildlife(
  current: Fixture,
  species: "deer" | "gull" | "black-bear" | "domestic-cat",
  tileX: number,
  tileY: number,
  heading: number,
  populationOrdinal: number,
): CoreWildlifeActorState {
  return createCoreWildlifeActorState({
    seed: current.state.meta.rootSeed,
    species,
    originRegion: REGION,
    populationKey: `perception:${species}`,
    populationOrdinal,
    position: worldPosition(tileX, tileY),
    heading,
  });
}

function actorAddress(
  actorId: string,
  species: "human" | "domestic-dog",
  tileX: number,
  tileY: number,
  heading: number,
): LivingActorAddress {
  return createLivingActorAddress({
    actorId,
    species,
    position: worldPosition(tileX, tileY),
    heading,
    persistence: species === "human" ? "promoted" : "regional",
  });
}

function worldPosition(tileX: number, tileY: number) {
  return createWorldPosition(REGION, tileX * 1_000 + 500, tileY * 1_000 + 500);
}

function frame(
  current: Fixture,
  actors: readonly CoreWildlifeActorState[],
  optional: Readonly<{
    readonly dogAddress?: LivingActorAddress | null;
    readonly playerAddress?: LivingActorAddress | null;
    readonly porterAddress?: LivingActorAddress | null;
  }> = {},
): CoreEcologyPerceptionFrameInput {
  return {
    actors,
    world: current.world,
    window: current.window,
    tick: 1,
    ...optional,
  };
}

function alarmEvent(actor: CoreWildlifeActorState): CoreWildlifeCausalEvent {
  return Object.freeze({
    version: CORE_WILDLIFE_EVENT_VERSION,
    eventId: `${actor.identity.stableId}:event:alarm`,
    atTick: 0,
    actorId: actor.identity.stableId,
    species: actor.identity.species,
    kind: "alarm",
    causeReferenceId: "observation:predator-silhouette",
    observationId: null,
    resourceReference: null,
    position: actor.address.position,
  });
}

function observationsFor(
  batches: readonly {
    readonly observerId: string;
    readonly observations: readonly ActorObservation[];
  }[]
    | null
    | undefined,
  observerId: string,
) {
  return batches?.find((batch) => batch.observerId === observerId)?.observations ?? [];
}
