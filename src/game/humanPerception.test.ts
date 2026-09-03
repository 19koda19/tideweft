import { describe, expect, it } from "vitest";

import {
  createActorObservation,
  createActorPerceptionState,
  queryActorSearch,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, type ResidentState, type WorldState, type WorldView } from "../sim/types";
import {
  HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES,
  LOCAL_PLAYER_SUBJECT_ID,
  collectExistingHumanObservations,
  createPlayerSenseSample,
  type HumanObservationBatch,
  type PlayerSenseSample,
} from "./humanPerception";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { createWorldPosition } from "./worldPosition";

const OBSERVER_X = 24;
const OBSERVER_Y = 24;
const OBSERVER_INDEX = OBSERVER_Y * 96 + OBSERVER_X;

interface Fixture {
  readonly state: WorldState;
  readonly economy: WorldView;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly resident: ResidentState;
}

describe("existing-human sensory bridge", () => {
  it("uses exact terrain geometry and cover to block a human sight ray", () => {
    const clear = fixture("human sight clear", { facing: "east" });
    const blocked = fixture("human sight blocked", { facing: "east", ridgeAtX: OBSERVER_X + 2 });
    const sample = visualSample("ridge-target", OBSERVER_X + 4, OBSERVER_Y);

    expect(observationsFor(clear, [sample], 1).some(({ channel }) => channel === "vision"))
      .toBe(true);
    expect(observationsFor(blocked, [sample], 1).some(({ channel }) => channel === "vision"))
      .toBe(false);
  });

  it("separates peripheral classification, moving silhouettes, and lit identity", () => {
    const current = fixture("light and movement disclose differently", { facing: "east" });
    const peripheral = observationsFor(current, [
      visualSample("peripheral", OBSERVER_X - 1, OBSERVER_Y),
    ], 1).find(({ channel }) => channel === "vision");
    const darkMovement = observationsFor(current, [
      visualSample("dark-movement", OBSERVER_X + 6, OBSERVER_Y, {
        lightVisibility: 0,
        movementSalience: FIXED_POINT,
      }),
    ], 1).find(({ channel }) => channel === "vision");
    const darkStill = observationsFor(current, [
      visualSample("dark-still", OBSERVER_X + 6, OBSERVER_Y, {
        lightVisibility: 0,
        movementSalience: 0,
      }),
    ], 1).find(({ channel }) => channel === "vision");
    const litStill = observationsFor(current, [
      visualSample("lit-still", OBSERVER_X + 6, OBSERVER_Y, {
        lightVisibility: FIXED_POINT,
        movementSalience: 0,
      }),
    ], 1).find(({ channel }) => channel === "vision");

    expect(peripheral).toMatchObject({ identification: "classified", subjectId: null });
    expect(darkMovement).toMatchObject({ identification: "classified", subjectId: null });
    expect(darkStill).toBeUndefined();
    expect(litStill).toMatchObject({
      identification: "identified",
      subjectId: LOCAL_PLAYER_SUBJECT_ID,
    });
  });

  it("lets rain and nearby turbulent water mask a sound that carries in calm air", () => {
    const calm = fixture("a step carries over dry ground", { facing: "west" });
    const masked = fixture("rain and river swallow a step", {
      facing: "west",
      turbulentWater: true,
      storm: true,
    });
    const step = soundSample("footstep", OBSERVER_X + 6, OBSERVER_Y, {
      soundLoudness: 800_000,
      soundRangeUnits: 20_000,
    });

    expect(observationsFor(calm, [step], 1).some(({ channel }) => channel === "hearing"))
      .toBe(true);
    expect(observationsFor(masked, [step], 1).some(({ channel }) => channel === "hearing"))
      .toBe(false);
  });

  it("keeps heard movement anonymous and represents only a derived uncertainty area", () => {
    const current = fixture("heard but not magically known", { facing: "west" });
    const sample = soundSample("branch-snap", OBSERVER_X + 4, OBSERVER_Y);
    const heard = observationsFor(current, [sample], 1)
      .find(({ channel }) => channel === "hearing");

    expect(heard).toMatchObject({
      channel: "hearing",
      perceivedClass: "movement-sound",
      identification: "anonymous",
      subjectId: null,
    });
    expect(heard?.area.radiusUnits).toBeGreaterThanOrEqual(250);
    expect(heard?.area.center).not.toEqual(sample.position);
  });

  it("is independent of resident and stimulus array order", () => {
    const forward = fixture("sensory order has no authority", { facing: "east" });
    const reverse = fixture("sensory order has no authority", {
      facing: "east",
      reverseResidents: true,
    });
    const samples = [
      visualSample("visible", OBSERVER_X + 4, OBSERVER_Y),
      soundSample("audible", OBSERVER_X + 3, OBSERVER_Y, { sampleOrdinal: 1 }),
    ];
    const first = collectExistingHumanObservations({
      world: forward.world,
      window: forward.window,
      targetTick: 1,
      playerSamples: samples,
    });
    const second = collectExistingHumanObservations({
      world: reverse.world,
      window: reverse.window,
      targetTick: 1,
      playerSamples: [...samples].reverse(),
    });

    expect(second).toEqual(first);
    expect(first.map(({ observerId }) => observerId))
      .toEqual([...first.map(({ observerId }) => observerId)].sort());
  });

  it("uses the latest lawful identified sample as the saved visual point", () => {
    const current = fixture("latest identified point wins", { facing: "east" });
    const early = visualSample("early", OBSERVER_X + 2, OBSERVER_Y, { sampleOrdinal: 0 });
    const late = visualSample("late", OBSERVER_X + 4, OBSERVER_Y, { sampleOrdinal: 1 });
    const forward = observationsFor(current, [early, late], 1)
      .filter(({ channel, subjectId }) => channel === "vision" && subjectId === LOCAL_PLAYER_SUBJECT_ID);
    const reverse = observationsFor(current, [late, early], 1)
      .filter(({ channel, subjectId }) => channel === "vision" && subjectId === LOCAL_PLAYER_SUBJECT_ID);

    expect(forward).toHaveLength(1);
    expect(forward[0]?.area).toEqual({ center: late.position, radiusUnits: 0 });
    expect(reverse).toEqual(forward);
  });

  it("preserves canonical observations across negative moving-frame origins", () => {
    const base = fixture("the sensory frame may rebase", { facing: "east" });
    expect(base.window.origin.x).toBeLessThan(0);
    expect(base.window.origin.y).toBeLessThan(0);
    const shiftedWindow = createRegionalTerrainWindow(
      base.state.meta.rootSeed,
      createTerrainRegionStreamingState({ rootSeed: base.state.meta.rootSeed }),
      { x: base.window.origin.x + 16, y: base.window.origin.y - 16 },
    );
    const shiftedWorld = createRegionalWorldView(
      base.economy,
      shiftedWindow,
      projectRegionalCartographyWindow(
        createRegionalCartography(base.state.meta.rootSeed),
        shiftedWindow,
      ),
    );
    const sample = visualSample("same-world-point", OBSERVER_X + 4, OBSERVER_Y);
    const first = batchFor(collectExistingHumanObservations({
      world: base.world,
      window: base.window,
      targetTick: 1,
      playerSamples: [sample],
    }), base.resident.id)?.observations;
    const second = batchFor(collectExistingHumanObservations({
      world: shiftedWorld,
      window: shiftedWindow,
      targetTick: 1,
      playerSamples: [sample],
    }), base.resident.id)?.observations;

    expect(second).toEqual(first);
    expect(first?.[0]?.area.center).toEqual(sample.position);
  });

  it("faces a saved search probe instead of using the hidden live player point", () => {
    const searching = fixture("a lawful last known place guides search", { facing: "west" });
    const target = worldPoint(OBSERVER_X + 4, OBSERVER_Y);
    searching.resident.perception = searchingState(searching.resident, target);
    expect(queryActorSearch(searching.resident.perception)?.nextProbe).toEqual(target);
    const searchedWorld = rebuildWorld(searching);
    const sample = visualSample("reacquired", OBSERVER_X + 4, OBSERVER_Y);

    const reacquired = observationsFor(searchedWorld, [sample], 3)
      .find(({ channel }) => channel === "vision");

    expect(reacquired).toMatchObject({
      subjectId: LOCAL_PLAYER_SUBJECT_ID,
      identification: "identified",
    });

    const notSearching = fixture("without knowledge the target stays behind", { facing: "west" });
    notSearching.resident.perception = createActorPerceptionState(
      notSearching.resident.identity.stableId,
      2,
    );
    const ordinaryWorld = rebuildWorld(notSearching);
    expect(observationsFor(ordinaryWorld, [sample], 3)
      .some(({ channel }) => channel === "vision")).toBe(false);
  });

  it("keeps attending to a stationary identified player when route-facing points away", () => {
    const current = fixture("saved attention sustains lawful contact", { facing: "west" });
    const target = worldPoint(OBSERVER_X + 4, OBSERVER_Y);
    const priorObservation = createActorObservation({
      id: "prior-attended-player",
      observerId: current.resident.identity.stableId,
      observedAtTick: 1,
      channel: "vision",
      perceivedClass: "human",
      subjectId: LOCAL_PLAYER_SUBJECT_ID,
      area: { center: target, radiusUnits: 0 },
      confidence: 900_000,
      salience: 900_000,
      identification: "identified",
    });
    if (!priorObservation) throw new Error("prior attention must be valid");
    const priorState = stepActorPerception(
      createActorPerceptionState(current.resident.identity.stableId),
      { tick: 1, observations: [priorObservation] },
    );
    if (!priorState) throw new Error("prior attention state must be valid");
    current.resident.perception = priorState;
    const rebuilt = rebuildWorld(current);
    const stationary = visualSample("stationary-player", OBSERVER_X + 4, OBSERVER_Y, {
      movementSalience: 0,
      lightVisibility: FIXED_POINT,
    });

    const contact = observationsFor(rebuilt, [stationary], 2)
      .find(({ channel }) => channel === "vision");

    expect(contact).toMatchObject({
      identification: "identified",
      subjectId: LOCAL_PLAYER_SUBJECT_ID,
    });
  });

  it("fails closed for malformed, duplicate, over-cap, and wrong-window samples", () => {
    const current = fixture("malformed sensation teaches nothing", { facing: "east" });
    const valid = visualSample("valid", OBSERVER_X + 2, OBSERVER_Y);
    const malformed = {
      ...valid,
      movementSalience: 0.5,
    } as PlayerSenseSample;

    expect(createPlayerSenseSample({
      id: "invalid fixed point",
      sampleOrdinal: 0,
      position: valid.position,
      movementSalience: 0,
      lightVisibility: FIXED_POINT,
      soundLoudness: 0,
      soundRangeUnits: 0,
      soundClass: "movement-sound",
      soundInterrupt: "none",
    })).toBeNull();
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: 1,
      playerSamples: [valid, malformed],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: 1,
      playerSamples: [valid, valid],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: 1,
      playerSamples: [valid, { ...valid, id: "same-ordinal" }],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: 1,
      playerSamples: Array.from(
        { length: HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES + 1 },
        (_, index) => visualSample(`sample-${index}`, OBSERVER_X + 2, OBSERVER_Y, {
          sampleOrdinal: index % HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES,
        }),
      ),
    })).toEqual([]);
    const unrelated = fixture("another registered window", { facing: "east" });
    expect(collectExistingHumanObservations({
      world: current.world,
      window: unrelated.window,
      targetTick: 1,
      playerSamples: [valid],
    })).toEqual([]);
  });

  it("ignores an extreme out-of-frame point without flattening or inventing contact", () => {
    const current = fixture("a distant point is simply absent", { facing: "east" });
    const sample = createSample({
      id: "extreme",
      sampleOrdinal: 0,
      position: createWorldPosition(createRegionCoord(-1_000_000, 1_000_000), 500, 500),
      movementSalience: FIXED_POINT,
      lightVisibility: FIXED_POINT,
      soundLoudness: FIXED_POINT,
      soundRangeUnits: 20_000,
    });

    expect(observationsFor(current, [sample], 1)).toEqual([]);
  });
});

function fixture(
  seed: string,
  options: {
    readonly facing: "east" | "west";
    readonly ridgeAtX?: number;
    readonly turbulentWater?: boolean;
    readonly storm?: boolean;
    readonly reverseResidents?: boolean;
  },
): Fixture {
  const state = createWorld(seed, "standard");
  const resident = state.residents[0];
  const route = state.routes[0];
  if (!resident || !route) throw new Error("fixture needs a resident and route");
  const direction = options.facing === "east" ? 1 : -1;
  route.path = [OBSERVER_INDEX, OBSERVER_INDEX + direction];
  resident.location = { kind: "route", routeId: route.id, progress: 0 };
  state.weather = {
    ...state.weather,
    kind: options.storm ? "storm" : "clear",
    intensity: options.storm ? FIXED_POINT : 0,
    windX: 0,
    windY: 0,
  };
  state.tide = { ...state.tide, level: options.turbulentWater ? FIXED_POINT : 0 };
  for (let y = OBSERVER_Y - 3; y <= OBSERVER_Y + 3; y += 1) {
    for (let x = OBSERVER_X - 2; x <= OBSERVER_X + 8; x += 1) {
      const tile = state.terrain.tiles[y * state.terrain.width + x];
      if (!tile) throw new Error("fixture corridor left terrain");
      tile.terrain = "meadow";
      tile.elevation = 0;
      tile.roughness = 0;
    }
  }
  if (options.ridgeAtX !== undefined) {
    const ridge = state.terrain.tiles[OBSERVER_Y * state.terrain.width + options.ridgeAtX];
    if (!ridge) throw new Error("fixture ridge left terrain");
    ridge.terrain = "ridge";
    ridge.elevation = FIXED_POINT;
  }
  if (options.turbulentWater) {
    for (let y = OBSERVER_Y - 2; y <= OBSERVER_Y + 2; y += 1) {
      for (let x = OBSERVER_X - 2; x <= OBSERVER_X + 2; x += 1) {
        if (x === OBSERVER_X && y === OBSERVER_Y) continue;
        const tile = state.terrain.tiles[y * state.terrain.width + x];
        if (!tile) throw new Error("fixture water left terrain");
        tile.terrain = "deep-water";
        tile.elevation = 0;
        tile.roughness = FIXED_POINT;
      }
    }
  }
  if (options.reverseResidents) state.residents.reverse();
  return buildFixture(state, resident);
}

function buildFixture(state: WorldState, resident: ResidentState): Fixture {
  const economy = createWorldView(state);
  const stream = createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed });
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    stream,
    regionalFrameOriginAtAddress({
      region: createRegionCoord(0, 0),
      localX: OBSERVER_X,
      localY: OBSERVER_Y,
    }),
  );
  const world = createRegionalWorldView(
    economy,
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  return { state, economy, world, window, resident };
}

function rebuildWorld(current: Fixture): Fixture {
  return buildFixture(current.state, current.resident);
}

function observationsFor(
  current: Fixture,
  samples: readonly PlayerSenseSample[],
  targetTick: number,
) {
  return batchFor(collectExistingHumanObservations({
    world: current.world,
    window: current.window,
    targetTick,
    playerSamples: samples,
  }), current.resident.id)?.observations ?? [];
}

function batchFor(
  batches: readonly HumanObservationBatch[],
  residentId: number,
): HumanObservationBatch | undefined {
  return batches.find((batch) => batch.residentId === residentId);
}

function visualSample(
  id: string,
  tileX: number,
  tileY: number,
  overrides: Partial<Pick<PlayerSenseSample,
    "lightVisibility" | "movementSalience" | "sampleOrdinal">> = {},
): PlayerSenseSample {
  return createSample({
    id,
    sampleOrdinal: overrides.sampleOrdinal ?? 0,
    position: worldPoint(tileX, tileY),
    movementSalience: overrides.movementSalience ?? FIXED_POINT,
    lightVisibility: overrides.lightVisibility ?? FIXED_POINT,
    soundLoudness: 0,
    soundRangeUnits: 0,
  });
}

function soundSample(
  id: string,
  tileX: number,
  tileY: number,
  overrides: Partial<Pick<PlayerSenseSample,
    "sampleOrdinal" | "soundLoudness" | "soundRangeUnits">> = {},
): PlayerSenseSample {
  return createSample({
    id,
    sampleOrdinal: overrides.sampleOrdinal ?? 0,
    position: worldPoint(tileX, tileY),
    movementSalience: 0,
    lightVisibility: 0,
    soundLoudness: overrides.soundLoudness ?? FIXED_POINT,
    soundRangeUnits: overrides.soundRangeUnits ?? 12_000,
  });
}

function createSample(input: {
  readonly id: string;
  readonly sampleOrdinal: number;
  readonly position: ReturnType<typeof worldPoint>;
  readonly movementSalience: number;
  readonly lightVisibility: number;
  readonly soundLoudness: number;
  readonly soundRangeUnits: number;
}): PlayerSenseSample {
  const sample = createPlayerSenseSample({
    ...input,
    soundClass: "movement-sound",
    soundInterrupt: "none",
  });
  if (!sample) throw new Error("test sample must be valid");
  return sample;
}

function worldPoint(tileX: number, tileY: number) {
  return createWorldPosition(
    createRegionCoord(0, 0),
    tileX * 1_000 + 500,
    tileY * 1_000 + 500,
  );
}

function searchingState(resident: ResidentState, lastKnown: ReturnType<typeof worldPoint>) {
  const observed = createActorObservation({
    id: "prior-player-sighting",
    observerId: resident.identity.stableId,
    observedAtTick: 1,
    channel: "vision",
    perceivedClass: "human",
    subjectId: LOCAL_PLAYER_SUBJECT_ID,
    area: { center: lastKnown, radiusUnits: 0 },
    confidence: 900_000,
    salience: 800_000,
    identification: "identified",
  });
  if (!observed) throw new Error("prior sighting must be valid");
  const identified = stepActorPerception(
    createActorPerceptionState(resident.identity.stableId),
    { tick: 1, observations: [observed] },
  );
  const searching = stepActorPerception(identified, { tick: 2, observations: [] });
  if (!searching) throw new Error("search state must be valid");
  return searching as ActorPerceptionState;
}
