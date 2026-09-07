import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorObservations,
  stepActorPerception,
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
  type CoreEcologyPerceptionParticipant,
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
import { createDogActorState, replaceDogActorPerception } from "./dogActor";
import { evaluateDogBehavior } from "./dogBehavior";
import { type LivingActorAddress } from "./livingActor";
import {
  createLivingActorTraversabilitySurface,
  deriveLivingActorSearchProbe,
  resolveLivingActorLocomotion,
} from "./livingActorLocomotion";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  createSettlementWorkingAnimalState,
  decideSettlementWorkingAnimalActivity,
} from "./settlementWorkingAnimals";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

const REGION = createRegionCoord(0, 0);
const GUARDIAN_START_X = 40;
const GUARDIAN_START_Y = 33;
const RABBIT_X = 38;
const FOX_X = 42;
const ROW = 30;

interface Fixture {
  readonly state: WorldState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
}

describe("marsh-edge representative emergence", () => {
  it("lets a rabbit alarm recruit guardian investigation while the same dog deters fox pursuit", () => {
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

    let guardianDog = createDogActorState({
      seed: current.state.meta.rootSeed,
      originRegion: REGION,
      originNamespace: "regional",
      habitatClass: "settlement-edge",
      habitatKey: "marsh-edge-guardian",
      populationKey: "working-dogs:marsh-edge",
      // This representative individual begins available for duty. Other dogs
      // may lawfully finish resting or self-preservation before accepting the
      // same alarm; the shared cognition/work arbiter covers that boundary.
      populationOrdinal: 1,
      position: worldPosition(GUARDIAN_START_X, GUARDIAN_START_Y),
      heading: 0,
    });
    const dog = guardianDog.address;
    const participants = [participant(dog)];
    const beforeMoveFrame = frame(current, [alarmed.actor, pursuing.actor], 2, participants);
    const beforeMoveVisual = requiredBatches(
      collectCoreEcologyVisualObservationBatches(beforeMoveFrame),
    );
    const beforeMoveAlarm = requiredBatches(
      propagateCoreEcologyAlarmObservationBatches(alarmed.event, beforeMoveFrame),
    );
    const beforeMoveFoxObservations = combineObservations(
      observationsFor(beforeMoveVisual, pursuing.actor),
      observationsFor(beforeMoveAlarm, pursuing.actor),
    );
    const beforeMoveRabbitPrey = requiredObservation(
      beforeMoveVisual,
      pursuing.actor,
      "live-prey",
      alarmed.actor.identity.stableId,
    );
    expect(beforeMoveFoxObservations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: "hearing",
        perceivedClass: "animal-alarm",
        subjectId: null,
      }),
    ]));
    expect(beforeMoveFoxObservations.some(({ subjectId }) => subjectId === dog.actorId))
      .toBe(false);
    const beforeMoveFoxDistance = worldPositionDelta(
      dog.position,
      pursuing.actor.address.position,
    );
    expect(Math.hypot(beforeMoveFoxDistance.x, beforeMoveFoxDistance.y))
      .toBeCloseTo(Math.sqrt(13) * WORLD_POSITION_UNITS_PER_TILE);

    const continued = requiredStep(
      pursuing.actor,
      2,
      beforeMoveFoxObservations,
      [livePreyOpportunity(beforeMoveRabbitPrey, alarmed.actor)],
    );
    const fleeingRabbit = requiredStep(
      alarmed.actor,
      2,
      observationsFor(beforeMoveVisual, alarmed.actor),
      [],
    );
    expect(continued.decision.intent).toBe("pursue");
    expect(fleeingRabbit.decision.intent).toBe("flee");

    const guardianAlarm = observationsForObserver(beforeMoveAlarm, dog.actorId).find((observation) => (
      observation.channel === "hearing"
        && observation.perceivedClass === "animal-alarm"
        && observation.subjectId === null
    ));
    if (guardianAlarm === undefined) throw new Error("Guardian did not hear the rabbit alarm");
    const guardianPerception = stepActorPerception(
      guardianDog.perception,
      { tick: 2, observations: [guardianAlarm] },
    );
    if (guardianPerception === null) throw new Error("Guardian rejected lawful shared perception");
    guardianDog = replaceDogActorPerception(guardianDog, guardianPerception);
    const guardianBehavior = evaluateDogBehavior({
      tick: 2,
      dog: {
        identity: guardianDog.identity,
        needs: { ...guardianDog.needs },
        condition: {
          ...guardianDog.condition,
          injuries: [...guardianDog.condition.injuries],
        },
        humanFamiliarity: { ...guardianDog.humanFamiliarity },
      },
      perception: guardianDog.perception,
      weather: {
        coldPressure: 0,
        heatPressure: 0,
        rainIntensity: 0,
        windPressure: 0,
      },
      accessibility: {
        retreat: true,
        "seek-shelter": true,
        "avoid-human": true,
        eat: false,
        "approach-food": false,
        rest: true,
        observe: true,
      },
      foodContact: { directlyConfirmed: false, accessible: false },
      current: {
        intent: guardianDog.intent.kind,
        enteredAtTick: guardianDog.intent.enteredAtTick,
      },
    });
    if (guardianBehavior === null) throw new Error("Guardian cognition rejected lawful alarm");
    const guardianBelief = guardianPerception.beliefs.find(({ sourceObservationId }) => (
      sourceObservationId === guardianAlarm.id
    ));
    if (guardianBelief === undefined) throw new Error("Guardian did not retain alarm belief");
    const guardianAssignment = createSettlementWorkingAnimalState({
      settlementId: 1,
      assignments: [{
        assignmentOrdinal: 0,
        workerActorId: dog.actorId,
        workerSpecies: "domestic-dog",
        handlerActorId: "H-marsh-edge-keeper",
        workerCustodyRelationshipId: "DOMESTIC-REL-0000000000000001",
        protectedCustodyRelationshipId: "DOMESTIC-REL-0000000000000002",
        protectedGroupId: "GOAT-HERD-marsh-edge",
        role: "guardian",
        worksiteId: "DOMESTIC-PEN-marsh-edge",
        dutyArea: { center: worldPosition(RABBIT_X, ROW), radiusUnits: 6_000 },
        createdAtTick: 0,
      }],
    }).assignments[0];
    if (guardianAssignment === undefined) throw new Error("Guardian assignment was not created");
    const guardianDecision = decideSettlementWorkingAnimalActivity({
      assignment: guardianAssignment,
      tick: 2,
      perception: guardianPerception,
      welfare: {
        injuryPressure: 0,
        coldPressure: 0,
        heatPressure: 0,
        exhaustionPressure: 0,
        hungerPressure: 0,
        thirstPressure: 0,
      },
      accessibility: { watch: true, investigate: true, return: true },
      actorDisposition: guardianBehavior.assignmentReadiness,
      workerInsideDutyArea: true,
    });
    if (guardianDecision === null) throw new Error("Guardian work decision was rejected");
    expect(guardianDecision).toMatchObject({
      activity: "investigate",
      cause: { kind: "perception", referenceId: guardianAlarm.id },
      perceivedArea: guardianAlarm.area,
    });
    expect(guardianBehavior.assignmentReadiness).toEqual({ kind: "available" });
    expect(guardianBehavior.decision.cause).toEqual({
      kind: "perception",
      referenceId: guardianBelief.key,
    });
    if (guardianDecision.activity !== "investigate" || guardianDecision.perceivedArea === null) {
      throw new Error("Guardian did not accept the anonymous alarm investigation");
    }
    const requestId = "WORK-marsh-edge-alarm-investigation";
    const searchProbe = deriveLivingActorSearchProbe({
      requestId,
      beliefKey: guardianBelief.key,
      probeOrdinal: 0,
      sourceArea: guardianDecision.perceivedArea,
    });
    if (searchProbe === null) throw new Error("Guardian search probe was not derivable");
    const guardianSurface = createLivingActorTraversabilitySurface({
      forActorId: dog.actorId,
      sampledAtTick: 2,
      origin: createWorldPosition(
        REGION,
        (RABBIT_X - 1) * WORLD_POSITION_UNITS_PER_TILE,
        (ROW - 1) * WORLD_POSITION_UNITS_PER_TILE,
      ),
      widthTiles: FOX_X - RABBIT_X + 3,
      heightTiles: GUARDIAN_START_Y - ROW + 2,
      cells: Array.from(
        {
          length: (FOX_X - RABBIT_X + 3) * (GUARDIAN_START_Y - ROW + 2),
        },
        () => ({ access: "open" as const, travelCost: WORLD_POSITION_UNITS_PER_TILE }),
      ),
    });
    const guardianMovement = resolveLivingActorLocomotion({
      requestId,
      tick: 2,
      actor: dog,
      targetArea: guardianDecision.perceivedArea,
      searchProbe,
      maximumStepUnits: 5 * WORLD_POSITION_UNITS_PER_TILE,
      surface: guardianSurface,
    });
    expect(guardianMovement).toMatchObject({
      kind: "moved",
      targetArea: guardianDecision.perceivedArea,
      searchProbe,
    });
    if (guardianMovement.kind !== "moved") {
      throw new Error(`Guardian did not move toward alarm: ${guardianMovement.reason}`);
    }
    const beforeMoveAlarmDistance = worldPositionDelta(
      dog.position,
      guardianDecision.perceivedArea.center,
    );
    const afterMoveAlarmDistance = worldPositionDelta(
      guardianMovement.actor.position,
      guardianDecision.perceivedArea.center,
    );
    expect(Math.hypot(afterMoveAlarmDistance.x, afterMoveAlarmDistance.y)).toBeLessThan(
      Math.hypot(beforeMoveAlarmDistance.x, beforeMoveAlarmDistance.y),
    );

    const afterMoveFrame = frame(
      current,
      [fleeingRabbit.actor, continued.actor],
      3,
      [participant(guardianMovement.actor)],
    );
    const afterMoveVisual = requiredBatches(
      collectCoreEcologyVisualObservationBatches(afterMoveFrame),
    );
    const seenDog = requiredObservation(
      afterMoveVisual,
      continued.actor,
      "predator",
      guardianMovement.actor.actorId,
    );
    const afterMoveRabbitPrey = requiredObservation(
      afterMoveVisual,
      continued.actor,
      "live-prey",
      fleeingRabbit.actor.identity.stableId,
    );
    const interrupted = requiredStep(
      continued.actor,
      3,
      observationsFor(afterMoveVisual, continued.actor),
      [livePreyOpportunity(afterMoveRabbitPrey, fleeingRabbit.actor)],
    );

    expect(["flee", "retreat"]).toContain(interrupted.decision.intent);
    expect(interrupted.decision.focusObservationId).toBe(seenDog.id);
    expect(interrupted.resourceClaims).toEqual([]);
    expect(guardianAlarm).toMatchObject({
      identification: "anonymous",
      interrupt: "none",
    });
    expect(JSON.stringify(guardianDecision)).not.toContain(rabbit.identity.stableId);
    expect(JSON.stringify(guardianDecision)).not.toContain(fox.identity.stableId);
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
  for (let y = ROW - 1; y <= GUARDIAN_START_Y + 1; y += 1) {
    for (let x = RABBIT_X - 1; x <= FOX_X + 1; x += 1) {
      const tile = state.terrain.tiles[y * state.terrain.width + x];
      if (tile === undefined) throw new Error("Marsh-edge fixture corridor left terrain");
      tile.terrain = "meadow";
      tile.elevation = 0;
      tile.roughness = 0;
    }
  }
  const alarmTile = state.terrain.tiles[ROW * state.terrain.width + RABBIT_X];
  if (alarmTile === undefined) throw new Error("Marsh-edge alarm tile left terrain");
  // The exposed lip keeps an actor standing at the alarm origin directly
  // legible; the guardian still begins outside the pursuing fox's sight cone.
  alarmTile.terrain = "ridge";
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
  participants: readonly CoreEcologyPerceptionParticipant[] = [],
): CoreEcologyPerceptionFrameInput {
  return {
    actors,
    participants,
    world: current.world,
    window: current.window,
    tick,
  };
}

function participant(address: LivingActorAddress): CoreEcologyPerceptionParticipant {
  return Object.freeze({ address, contactScope: "all-participants" });
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
  return observationsForObserver(batches, actor.identity.stableId, actor.identity.species);
}

function observationsForObserver(
  batches: readonly CoreEcologyObservationBatch[],
  observerId: string,
  observerLabel = observerId,
): readonly ActorObservation[] {
  const batch = batches.find(({ observerId: candidateId }) => candidateId === observerId);
  if (batch === undefined) throw new Error(`Missing observation batch for ${observerLabel}`);
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
