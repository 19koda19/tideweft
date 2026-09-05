import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorObservations,
  type ActorObservation,
} from "../sim/actorPerception";
import { type CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { type WorldState, type WorldView } from "../sim/types";
import {
  collectCoreEcologyVisualObservationBatches,
  propagateCoreEcologyAlarmObservationBatches,
  type CoreEcologyObservationBatch,
  type CoreEcologyPerceptionFrameInput,
} from "./coreEcologyPerception";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  createCoreWildlifeActorState,
  replaceCoreWildlifeActorPhysiology,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeActorStepResult,
  type CoreWildlifeFoodOpportunity,
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
import { WORLD_POSITION_UNITS_PER_TILE, createWorldPosition } from "./worldPosition";

const REGION = createRegionCoord(0, 0);
const RABBIT_X = 38;
const FOX_X = 42;
const ROW = 30;

interface Fixture {
  readonly state: WorldState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
}

describe("marsh-edge representative emergence", () => {
  it("lets direct perception drive rabbit escape and fox pursuit until a seen dog interrupts", () => {
    const current = fixture("rabbit fox dog representative triad");
    const rabbit = wildlife(current, "marsh-rabbit", RABBIT_X, ROW, 0, 0);
    const fox = hungry(wildlife(current, "marsh-fox", FOX_X, ROW, 500_000, 0));

    const firstFrame = frame(current, [rabbit, fox], 1);
    const firstVisual = requiredBatches(
      collectCoreEcologyVisualObservationBatches(firstFrame),
    );
    const rabbitThreat = requiredObservation(firstVisual, rabbit, "predator", fox.identity.stableId);
    const foxPrey = requiredObservation(firstVisual, fox, "live-prey", rabbit.identity.stableId);
    const preyOpportunity = livePreyOpportunity(foxPrey, rabbit);

    const alarmed = requiredStep(rabbit, 1, observationsFor(firstVisual, rabbit), []);
    const pursuing = requiredStep(fox, 1, observationsFor(firstVisual, fox), [preyOpportunity]);

    expect(rabbitThreat.identification).toBe("identified");
    expect(foxPrey.identification).toBe("identified");
    expect(alarmed.decision.intent).toBe("alarm");
    expect(pursuing.decision).toMatchObject({
      intent: "pursue",
      focusObservationId: foxPrey.id,
    });
    expect(alarmed.resourceClaims).toEqual([]);
    expect(pursuing.resourceClaims).toEqual([]);

    const pairFrame = frame(current, [alarmed.actor, pursuing.actor], 2);
    const pairVisual = requiredBatches(
      collectCoreEcologyVisualObservationBatches(pairFrame),
    );
    const pairAlarm = requiredBatches(
      propagateCoreEcologyAlarmObservationBatches(alarmed.event, pairFrame),
    );
    const secondRabbitPrey = requiredObservation(
      pairVisual,
      pursuing.actor,
      "live-prey",
      alarmed.actor.identity.stableId,
    );
    const pairFoxObservations = combineObservations(
      observationsFor(pairVisual, pursuing.actor),
      observationsFor(pairAlarm, pursuing.actor),
    );
    expect(pairFoxObservations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: "hearing",
        perceivedClass: "animal-alarm",
        subjectId: null,
      }),
    ]));

    const continued = requiredStep(
      pursuing.actor,
      2,
      pairFoxObservations,
      [livePreyOpportunity(secondRabbitPrey, alarmed.actor)],
    );
    const fleeingRabbit = requiredStep(
      alarmed.actor,
      2,
      observationsFor(pairVisual, alarmed.actor),
      [],
    );
    expect(continued.decision.intent).toBe("pursue");
    expect(fleeingRabbit.decision.intent).toBe("flee");

    const dog = createLivingActorAddress({
      actorId: "D-marsh-edge-triad",
      species: "domestic-dog",
      position: worldPosition(FOX_X - 2, ROW),
      heading: 0,
      persistence: "regional",
    });
    const triadFrame = frame(current, [alarmed.actor, pursuing.actor], 2, dog);
    const triadVisual = requiredBatches(
      collectCoreEcologyVisualObservationBatches(triadFrame),
    );
    const triadAlarm = requiredBatches(
      propagateCoreEcologyAlarmObservationBatches(alarmed.event, triadFrame),
    );
    const seenDog = requiredObservation(
      triadVisual,
      pursuing.actor,
      "predator",
      dog.actorId,
    );
    const triadRabbitPrey = requiredObservation(
      triadVisual,
      pursuing.actor,
      "live-prey",
      alarmed.actor.identity.stableId,
    );
    const interrupted = requiredStep(
      pursuing.actor,
      2,
      combineObservations(
        observationsFor(triadVisual, pursuing.actor),
        observationsFor(triadAlarm, pursuing.actor),
      ),
      [livePreyOpportunity(triadRabbitPrey, alarmed.actor)],
    );

    expect(["flee", "retreat"]).toContain(interrupted.decision.intent);
    expect(interrupted.decision.focusObservationId).toBe(seenDog.id);
    expect(interrupted.resourceClaims).toEqual([]);
    expect(alarmed.actor.condition.health).toBe(rabbit.condition.health);
    expect(fleeingRabbit.actor.condition.health).toBe(rabbit.condition.health);
    expect(pursuing.actor.condition.health).toBe(fox.condition.health);
    expect(interrupted.actor.condition.health).toBe(fox.condition.health);
  });

  it("keeps the deliberate size-aware cat and deer correction in the shared perception path", () => {
    const current = fixture("cat deer size aware regression");
    const cat = wildlife(current, "domestic-cat", RABBIT_X, ROW, 0, 0);
    const deer = wildlife(current, "deer", FOX_X, ROW, 500_000, 0);
    const batches = requiredBatches(
      collectCoreEcologyVisualObservationBatches(frame(current, [cat, deer], 1)),
    );

    expect(requiredObservation(batches, cat, "deer", deer.identity.stableId))
      .toMatchObject({ channel: "vision", identification: "identified" });
    expect(requiredObservation(batches, deer, "domestic-cat", cat.identity.stableId))
      .toMatchObject({ channel: "vision", identification: "identified" });
    expect(observationsFor(batches, cat).some(({ perceivedClass }) => (
      perceivedClass === "live-prey"
    ))).toBe(false);
    expect(observationsFor(batches, deer).some(({ perceivedClass }) => (
      perceivedClass === "predator" || perceivedClass === "large-predator"
    ))).toBe(false);
  });
});

function fixture(seedText: string): Fixture {
  const state = createWorld(seedText, "standard");
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  for (const settlement of state.settlements) settlement.tileIndex = 0;
  for (let x = RABBIT_X - 1; x <= FOX_X + 1; x += 1) {
    const tile = state.terrain.tiles[ROW * state.terrain.width + x];
    if (tile === undefined) throw new Error("Marsh-edge fixture corridor left terrain");
    tile.terrain = "meadow";
    tile.elevation = 0;
    tile.roughness = 0;
  }
  const economy = createWorldView(state);
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
    regionalFrameOriginAtAddress({ region: REGION, localX: RABBIT_X, localY: ROW }),
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
  species: CoreWildlifeSpecies,
  tileX: number,
  tileY: number,
  heading: number,
  populationOrdinal: number,
): CoreWildlifeActorState {
  return createCoreWildlifeActorState({
    seed: current.state.meta.rootSeed,
    species,
    originRegion: REGION,
    populationKey: `emergence:${species}`,
    populationOrdinal,
    position: worldPosition(tileX, tileY),
    heading,
  });
}

function hungry(actor: CoreWildlifeActorState): CoreWildlifeActorState {
  return replaceCoreWildlifeActorPhysiology(actor, {
    atTick: actor.updatedAtTick,
    needs: { ...actor.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: actor.condition,
  });
}

function frame(
  current: Fixture,
  actors: readonly CoreWildlifeActorState[],
  tick: number,
  dogAddress: LivingActorAddress | null = null,
): CoreEcologyPerceptionFrameInput {
  return {
    actors,
    dogAddress,
    world: current.world,
    window: current.window,
    tick,
  };
}

function worldPosition(tileX: number, tileY: number) {
  return createWorldPosition(
    REGION,
    tileX * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    tileY * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function requiredBatches(
  batches: readonly CoreEcologyObservationBatch[] | null,
): readonly CoreEcologyObservationBatch[] {
  if (batches === null) throw new Error("Valid marsh-edge perception frame was rejected");
  return batches;
}

function observationsFor(
  batches: readonly CoreEcologyObservationBatch[],
  actor: CoreWildlifeActorState,
): readonly ActorObservation[] {
  const batch = batches.find(({ observerId }) => observerId === actor.identity.stableId);
  if (batch === undefined) throw new Error(`Missing observation batch for ${actor.identity.species}`);
  return batch.observations;
}

function requiredObservation(
  batches: readonly CoreEcologyObservationBatch[],
  actor: CoreWildlifeActorState,
  perceivedClass: string,
  subjectId: string,
): ActorObservation {
  const observation = observationsFor(batches, actor).find((candidate) => (
    candidate.perceivedClass === perceivedClass && candidate.subjectId === subjectId
  ));
  if (observation === undefined) {
    throw new Error(`${actor.identity.species} lacked ${perceivedClass} contact with ${subjectId}`);
  }
  return observation;
}

function combineObservations(
  ...groups: readonly (readonly ActorObservation[])[]
): readonly ActorObservation[] {
  const flattened = groups.flat();
  const canonical = canonicalizeActorObservations(flattened);
  if (canonical.length !== flattened.length) {
    throw new Error("Representative perception observations did not compose canonically");
  }
  return canonical;
}

function livePreyOpportunity(
  observation: ActorObservation,
  rabbit: CoreWildlifeActorState,
): CoreWildlifeFoodOpportunity {
  return Object.freeze({
    resourceId: rabbit.identity.stableId,
    observationId: observation.id,
    foodClass: "live-prey",
    sourceKind: "living-actor",
    availableUnits: 1,
    nutrition: 800_000,
    effort: 160_000,
    risk: 120_000,
    competition: 0,
    directlyConfirmed: true,
    accessible: true,
  });
}

function requiredStep(
  actor: CoreWildlifeActorState,
  tick: number,
  observations: readonly ActorObservation[],
  foodOpportunities: readonly CoreWildlifeFoodOpportunity[],
): CoreWildlifeActorStepResult {
  const result = stepCoreWildlifeActor(actor, {
    tick,
    observations,
    foodOpportunities,
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (result === null) throw new Error(`Valid ${actor.identity.species} step was rejected`);
  return result;
}
