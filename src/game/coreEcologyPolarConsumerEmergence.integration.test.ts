import { describe, expect, it } from "vitest";

import type { ActorObservation } from "../sim/actorPerception";
import { createWorld, createWorldView } from "../sim/public";
import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import {
  setCoreEcologyAggregatePatchMaterializedActors,
} from "./coreEcology";
import { deriveCoreEcologyAggregateStimulusFrame } from "./coreEcologyAggregatePerception";
import { deriveCoreEcologyPolarConsumerHabitat } from "./coreEcologyPolarConsumerHabitat";
import { deriveCoreEcologyPolarShoreHabitat } from "./coreEcologyPolarShoreHabitat";
import { collectCoreEcologyVisualObservationBatches } from "./coreEcologyPerception";
import {
  coreEcologySpeciesPhysicalBodyResourceUnits,
  coreEcologySpeciesPhysicalBodySizeUnits,
  coreEcologySpeciesPredatorContact,
} from "./coreEcologySpeciesRuntimePolicy";
import { stepCoreEcologySmallWorld } from "./coreEcologySmallWorld";
import { projectCoreEcologyTidalTable } from "./coreEcologyTidalTable";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeFoodOpportunity,
} from "./coreWildlifeActor";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createCoreEcologyPolarConsumerResidentPatch } from "./regionalPolarConsumerResidents";
import { createCoreEcologyPolarShoreResidentPatch } from "./regionalPolarShoreResidents";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
} from "./regionalTravel";
import { createRegionalWorldView, regionalTileIndexInView } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  translateWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const ALPHA36_POLAR_CONSUMER_EMERGENCE_OWNER_INTENT =
  "test:alpha36-polar-consumer-emergence:v1" as const;

// Full daylight, one 720-tick tide period after the historical tick-360
// fixture, preserves its tidal phase while exercising physical illumination.
const TICK = 1_080;

describe(`${ALPHA36_POLAR_CONSUMER_EMERGENCE_OWNER_INTENT} shared nonlethal food-web seam`, () => {
  it("lets direct sight drive seal pressure and bear pursuit while occlusion removes both", () => {
    const fixture = emergenceFixture();
    const visualSource = {
      sourceReferenceId: fixture.seal.identity.stableId,
      sourceSpecies: fixture.seal.identity.species,
      position: fixture.seal.address.position,
      movementSalience: FIXED_POINT,
    } as const;
    const pressureInput = {
      patch: fixture.capelinPatch,
      world: fixture.world,
      window: fixture.window,
      tick: TICK,
      visualSources: [visualSource],
      exposedFoodSources: [],
    } as const;

    const stimulus = deriveCoreEcologyAggregateStimulusFrame(pressureInput);
    expect(stimulus?.stimuli).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceReferenceId: fixture.seal.identity.stableId,
        sourceKind: "harbor-seal",
        targetAggregateId: fixture.capelin.aggregateId,
        response: "pressure",
        channels: ["vision"],
      }),
    ]));
    const pressure = stepCoreEcologySmallWorld(fixture.capelinPatch, TICK, stimulus);
    expect(pressure?.events).toEqual([
      expect.objectContaining({
        sourceReferenceId: fixture.seal.identity.stableId,
        targetSpecies: "atlantic-capelin",
        mortality: "none",
        cargoInteraction: false,
        itemConsumption: "none",
      }),
    ]);
    const capelinAfter = pressure?.patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === fixture.capelin.aggregateId,
    );
    expect(capelinAfter?.populationSize).toBe(fixture.capelin.populationSize);
    expect(capelinAfter?.anchors.reduce(
      (sum, anchor) => sum + anchor.populationUnits,
      0,
    )).toBe(fixture.capelin.populationSize);
    expect(pressure?.patch.mortalityTransactions).toEqual([]);
    expect(pressure?.patch.carcasses).toEqual([]);

    const observations = collectCoreEcologyVisualObservationBatches({
      actors: [fixture.bear, fixture.seal],
      world: fixture.world,
      window: fixture.window,
      tick: TICK + 1,
    });
    const bearSight = observationsFor(observations, fixture.bear).find(
      ({ subjectId }) => subjectId === fixture.seal.identity.stableId,
    );
    const sealSight = observationsFor(observations, fixture.seal).find(
      ({ subjectId }) => subjectId === fixture.bear.identity.stableId,
    );
    expect(bearSight).toMatchObject({
      channel: "vision",
      perceivedClass: "live-prey",
      identification: "identified",
    });
    expect(sealSight).toMatchObject({
      channel: "vision",
      perceivedClass: "large-predator",
      identification: "identified",
    });
    if (bearSight === undefined || sealSight === undefined) {
      throw new Error("Open polar-consumer corridor lost direct perception");
    }

    const hungryBear = replaceCoreWildlifeActorPhysiology(fixture.bear, {
      atTick: fixture.bear.updatedAtTick,
      needs: { ...fixture.bear.needs, hunger: FIXED_POINT },
      condition: fixture.bear.condition,
    });
    const pursuit = stepCoreWildlifeActor(hungryBear, {
      tick: TICK + 1,
      observations: [bearSight],
      foodOpportunities: [livePreyOpportunity(bearSight, fixture.seal)],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    const flight = stepCoreWildlifeActor(fixture.seal, {
      tick: TICK + 1,
      observations: [sealSight],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    expect(pursuit?.decision.intent).toBe("pursue");
    expect(flight?.decision.intent).toBe("flee");
    expect(pursuit?.resourceClaims).toEqual([]);
    expect(flight?.resourceClaims).toEqual([]);
    expect(pursuit?.actor.condition.health).toBe(fixture.bear.condition.health);
    expect(flight?.actor.condition.health).toBe(fixture.seal.condition.health);
    expect(coreEcologySpeciesPredatorContact("polar-bear")).toBeNull();
    expect(coreEcologySpeciesPhysicalBodySizeUnits("polar-bear")).toBe(0);
    expect(coreEcologySpeciesPhysicalBodyResourceUnits("polar-bear")).toBe(0);
    expect(coreEcologySpeciesPhysicalBodySizeUnits("harbor-seal")).toBe(0);
    expect(coreEcologySpeciesPhysicalBodyResourceUnits("harbor-seal")).toBe(0);
    expect(JSON.stringify({ pressure, pursuit, flight })).not.toMatch(
      /capture|consume|death|mortality-transaction|reproduction/u,
    );

    occludePosition(fixture.world, fixture.seal.address.position);
    const hiddenBear = repositionCoreWildlifeActor(fixture.bear, {
      atTick: TICK,
      position: translateWorldPosition(
        fixture.seal.address.position,
        -4 * WORLD_POSITION_UNITS_PER_TILE,
        0,
      ),
      heading: 0,
    });
    const hiddenStimulus = deriveCoreEcologyAggregateStimulusFrame(pressureInput);
    expect(hiddenStimulus?.stimuli.some(
      ({ sourceReferenceId }) => sourceReferenceId === fixture.seal.identity.stableId,
    )).toBe(false);
    expect(stepCoreEcologySmallWorld(
      fixture.capelinPatch,
      TICK,
      hiddenStimulus,
    )?.events.some(
      ({ sourceReferenceId }) => sourceReferenceId === fixture.seal.identity.stableId,
    )).toBe(false);

    const hiddenObservations = collectCoreEcologyVisualObservationBatches({
      actors: [hiddenBear, fixture.seal],
      world: fixture.world,
      window: fixture.window,
      tick: TICK + 1,
    });
    expect(observationsFor(hiddenObservations, hiddenBear).some(
      ({ subjectId }) => subjectId === fixture.seal.identity.stableId,
    )).toBe(false);
    expect(observationsFor(hiddenObservations, fixture.seal).some(
      ({ subjectId }) => subjectId === hiddenBear.identity.stableId,
    )).toBe(false);
    const hiddenHungryBear = replaceCoreWildlifeActorPhysiology(hiddenBear, {
      atTick: hiddenBear.updatedAtTick,
      needs: { ...hiddenBear.needs, hunger: FIXED_POINT },
      condition: hiddenBear.condition,
    });
    expect(stepCoreWildlifeActor(hiddenHungryBear, {
      tick: TICK + 1,
      observations: observationsFor(hiddenObservations, hiddenBear),
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    })?.decision.intent).not.toBe("pursue");
    expect(stepCoreWildlifeActor(fixture.seal, {
      tick: TICK + 1,
      observations: observationsFor(hiddenObservations, fixture.seal),
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    })?.decision.intent).not.toBe("flee");
  });
});

function emergenceFixture() {
  const seedText = "polar consumer origin";
  const seed = seedFromText(seedText);
  const region = createRegionCoord(0, 0);
  const consumerHabitat = deriveCoreEcologyPolarConsumerHabitat({ seed, region });
  if (consumerHabitat.totalPopulationUnits !== 2) {
    throw new Error("Polar-consumer emergence fixture lacks both consumers");
  }
  const consumerPatch = createCoreEcologyPolarConsumerResidentPatch({
    seed,
    habitat: consumerHabitat,
    tick: TICK,
  });
  const sourceActors = consumerPatch.populations.flatMap(({ members }) => (
    members.map(({ actor }) => actor)
  ));
  const sourceSeal = sourceActors.find(({ identity }) => identity.species === "harbor-seal");
  const sourceBear = sourceActors.find(({ identity }) => identity.species === "polar-bear");
  if (sourceSeal === undefined || sourceBear === undefined) {
    throw new Error("Polar-consumer resident owner lacks one consumer");
  }
  const materialized = setCoreEcologyAggregatePatchMaterializedActors(consumerPatch, {
    atTick: TICK,
    actorIds: [sourceSeal.identity.stableId, sourceBear.identity.stableId],
  });

  const polarHabitat = deriveCoreEcologyPolarShoreHabitat({
    seed,
    region,
  });
  const capelinPatch = createCoreEcologyPolarShoreResidentPatch({
    seed,
    habitat: polarHabitat,
    tick: TICK,
  });
  const capelin = capelinPatch.aggregatePopulations.find(
    ({ species }) => species === "atlantic-capelin",
  );
  const tidal = projectCoreEcologyTidalTable(capelinPatch, TICK + 1);
  const cue = tidal?.anchorDepths.find((depth) => (
    depth.activityUsable
    && depth.aggregateId === capelin?.aggregateId
    && (capelin.anchors[depth.anchorOrdinal]?.populationUnits ?? 0) > 0
    && (tidal.aggregateActivities.find(
      ({ aggregateId }) => aggregateId === depth.aggregateId,
    )?.intensity ?? 0) > 0
  ));
  if (capelin === undefined || cue === undefined) {
    throw new Error("Polar-consumer emergence fixture lacks active capelin");
  }

  const materializedSeal = materialized.populations.find(
    ({ species }) => species === "harbor-seal",
  )?.members[0]?.actor;
  const materializedBear = materialized.populations.find(
    ({ species }) => species === "polar-bear",
  )?.members[0]?.actor;
  if (materializedSeal === undefined || materializedBear === undefined) {
    throw new Error("Polar-consumer fixture failed to materialize both actors");
  }
  const seal = repositionCoreWildlifeActor(materializedSeal, {
    atTick: TICK,
    position: translateWorldPosition(
      cue.position,
      -4 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    ),
    heading: 500_000,
  });
  const bear = repositionCoreWildlifeActor(materializedBear, {
    atTick: TICK,
    position: translateWorldPosition(
      seal.address.position,
      -WORLD_POSITION_UNITS_PER_TILE,
      0,
    ),
    heading: 0,
  });

  const state = createWorld(seedText, "standard");
  state.meta.completedTick = TICK;
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  for (const settlement of state.settlements) settlement.tileIndex = 0;
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
    regionalFrameOriginAtAddress({
      region,
      localX: Math.trunc(cue.position.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.trunc(cue.position.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  for (const tile of world.terrain.tiles) {
    tile.terrain = "meadow";
    tile.elevation = 0;
    tile.roughness = 0;
  }
  return Object.freeze({ bear, capelin, capelinPatch, seal, window, world });
}

function observationsFor(
  batches: ReturnType<typeof collectCoreEcologyVisualObservationBatches>,
  actor: CoreWildlifeActorState,
): readonly ActorObservation[] {
  return batches?.find(({ observerId }) => observerId === actor.identity.stableId)
    ?.observations ?? [];
}

function livePreyOpportunity(
  observation: ActorObservation,
  prey: CoreWildlifeActorState,
): CoreWildlifeFoodOpportunity {
  return Object.freeze({
    resourceId: prey.identity.stableId,
    observationId: observation.id,
    foodClass: "live-prey",
    sourceKind: "living-actor",
    availableUnits: 1,
    nutrition: 900_000,
    effort: 80_000,
    risk: 120_000,
    competition: 0,
    directlyConfirmed: true,
    accessible: true,
  });
}

function occludePosition(world: WorldView, position: WorldPosition): void {
  for (const [offsetX, offsetY] of [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ] as const) {
    const blockerPosition = translateWorldPosition(
      position,
      offsetX * WORLD_POSITION_UNITS_PER_TILE,
      offsetY * WORLD_POSITION_UNITS_PER_TILE,
    );
    const storageIndex = Math.floor(blockerPosition.localY / WORLD_POSITION_UNITS_PER_TILE)
      * WORLD_WIDTH
      + Math.floor(blockerPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
    const blockerIndex = regionalTileIndexInView(
      world,
      blockerPosition.region,
      storageIndex,
    );
    const blocker = blockerIndex === null ? undefined : world.terrain.tiles[blockerIndex];
    if (blocker === undefined) {
      throw new Error("Polar-consumer occluder left the active frame");
    }
    blocker.terrain = "ridge";
    blocker.elevation = FIXED_POINT;
  }
}
