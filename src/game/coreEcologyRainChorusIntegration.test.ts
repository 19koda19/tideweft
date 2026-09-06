import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  type ActorObservation,
} from "../sim/actorPerception";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createWorld, createWorldView } from "../sim/public";
import { seedFromText, type RootSeed } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  regionLocalToGlobalTile,
  type RegionCoord,
} from "../sim/regions";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type WeatherKind,
  type WorldState,
  type WorldView,
} from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { projectCoreEcologyAggregateHeardCues } from "./coreEcologyAggregateAudio";
import { deriveCoreEcologySettlementShadowsStimulusFrame } from "./coreEcologyAggregatePerception";
import {
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES_EVALUATION_BUDGET,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  collectCoreEcologyVisualObservationBatches,
  type CoreEcologyObservationBatch,
  type CoreEcologyPerceptionFrameInput,
} from "./coreEcologyPerception";
import {
  projectCoreEcologyWildlife,
  selectedCoreEcologyActor,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import { stepCoreEcologySmallWorld } from "./coreEcologySmallWorld";
import { coreEcologySpeciesCanOwnActorAddress } from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  createCoreWildlifeActorState,
  replaceCoreWildlifeActorPhysiology,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeFoodOpportunity,
} from "./coreWildlifeActor";
import { createLivingActorAddress } from "./livingActor";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { evaluatePerception, type PerceptionCell } from "./perception";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const SEED_TEXT = "alpha seventeen rain chorus integration";
const SEED = seedFromText(SEED_TEXT);
const PERCEPTION_REGION = createRegionCoord(0, 0);
const OBSERVER_X = 38;
const OBSERVER_Y = 30;

describe("Rain Chorus / Shadow Overhead integration", () => {
  it("stays deterministic and bounded at signed world extremes without manufacturing frog actors", () => {
    const regions = [
      createRegionCoord(0, 0),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(Math.trunc(REGION_COORD_LIMIT / 2), -17),
    ];

    for (const [index, region] of regions.entries()) {
      const habitat = deriveFocusedHabitat(SEED, region, 12);
      expect(deriveFocusedHabitat(SEED, region, 12)).toEqual(habitat);
      expect(habitat.speciesEvaluations)
        .toBeLessThanOrEqual(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES_EVALUATION_BUDGET);
      expect(habitat.populations.reduce(
        (total, population) => total + population.allocations.length,
        0,
      )).toBeLessThanOrEqual(CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS);

      const patch = createCoreEcologyAggregatePatch({
        seed: SEED,
        patchKey: `rain-chorus:integration:${index}`,
        originRegion: region,
        derivation: { kind: "habitat-v4", habitat },
        populations: individualInputs(habitat),
      });
      const actors = patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor));
      expect(actors).toHaveLength(patch.populations.reduce(
        (total, population) => total + population.members.length,
        0,
      ));
      expect(actors.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
      expect(actors.every(({ identity }) => (
        coreEcologySpeciesCanOwnActorAddress(identity.species)
        && identity.species !== "southern-leopard-frog"
      ))).toBe(true);
      expect(patch.aggregatePopulations.every(({ species, aggregateId }) => (
        species === "brown-rat"
          ? aggregateId.startsWith("RAT-AREA-v1-")
          : species === "southern-leopard-frog"
            && aggregateId.startsWith("FROG-AREA-v1-")
      ))).toBe(true);

      const encoded = serializeCoreEcologyAggregatePatch(patch);
      expect(deserializeCoreEcologyAggregatePatch(encoded)).toEqual(patch);
      expect(stableStringify(deserializeCoreEcologyAggregatePatch(encoded))).toBe(encoded);
    }

    expect(() => createCoreWildlifeActorState({
      seed: SEED,
      species: "southern-leopard-frog",
      originRegion: PERCEPTION_REGION,
      populationKey: "forbidden-frog-actor",
      populationOrdinal: 0,
      position: worldPosition(OBSERVER_X, OBSERVER_Y),
    })).toThrow(/namespace does not match its species/u);
  });

  it("routes only a causally mobbing crow through shared perception to interrupt harrier pursuit", () => {
    const current = perceptionFixture();
    // Mobbing pressure is close behavioral evidence rather than a remote
    // species aura: keep the crow within the harrier's high-confidence detail
    // envelope while the rabbit remains a separate prey target.
    const crow = wildlife(current, "fish-crow", OBSERVER_X + 3, OBSERVER_Y, 0, 0);
    const rabbit = wildlife(current, "marsh-rabbit", OBSERVER_X + 1, OBSERVER_Y, 0, 0);
    const initialHarrier = wildlife(
      current,
      "northern-harrier",
      OBSERVER_X + 4,
      OBSERVER_Y,
      Math.trunc(FIXED_POINT / 2),
      0,
    );
    const harrier = replaceCoreWildlifeActorPhysiology(initialHarrier, {
      atTick: 0,
      needs: { ...initialHarrier.needs, hunger: ACTOR_PERCEPTION_SCALE },
      condition: initialHarrier.condition,
    });

    const firstSight = collectCoreEcologyVisualObservationBatches(
      perceptionFrame(current, [crow, harrier, rabbit], 1),
    );
    const crowSeesHarrier = observationOf(
      firstSight,
      crow.identity.stableId,
      harrier.identity.stableId,
    );
    const harrierSeesCrow = observationOf(
      firstSight,
      harrier.identity.stableId,
      crow.identity.stableId,
    );
    const harrierSeesRabbit = observationOf(
      firstSight,
      harrier.identity.stableId,
      rabbit.identity.stableId,
    );
    expect(crowSeesHarrier?.perceivedClass).toBe("aerial-predator");
    // Mere co-presence is neutral; the crow has not begun mobbing yet.
    expect(harrierSeesCrow?.perceivedClass).toBe("fish-crow");
    expect(harrierSeesRabbit?.perceivedClass).toBe("live-prey");
    if (crowSeesHarrier === undefined || harrierSeesRabbit === undefined) {
      throw new Error("Representative web requires direct crow/harrier/rabbit sight");
    }

    const alarmedCrow = stepActor(crow, 1, observationsFor(
      firstSight,
      crow.identity.stableId,
    )).actor;
    const pursuingHarrier = stepActor(
      harrier,
      1,
      observationsFor(firstSight, harrier.identity.stableId),
      [livePreyOpportunity(harrierSeesRabbit, rabbit.identity.stableId)],
    ).actor;
    expect(alarmedCrow.intent).toMatchObject({
      kind: "alarm",
      focusObservationId: crowSeesHarrier.id,
    });
    expect(pursuingHarrier.intent.kind).toBe("pursue");

    const secondSight = collectCoreEcologyVisualObservationBatches(
      perceptionFrame(current, [alarmedCrow, pursuingHarrier, rabbit], 2),
    );
    const mobbingCrow = observationOf(
      secondSight,
      pursuingHarrier.identity.stableId,
      alarmedCrow.identity.stableId,
    );
    expect(mobbingCrow).toMatchObject({
      channel: "vision",
      perceivedClass: "mobbing-pressure",
      subjectId: alarmedCrow.identity.stableId,
      identification: "identified",
    });

    const interrupted = stepActor(
      pursuingHarrier,
      2,
      observationsFor(secondSight, pursuingHarrier.identity.stableId),
    );
    expect(["flee", "retreat"]).toContain(interrupted.decision.intent);
    expect(interrupted.decision.focusObservationId).toBe(mobbingCrow?.id);
    expect(interrupted.resourceClaims).toEqual([]);
  });

  it("projects one unique interactive view per visible crow representative", () => {
    const window = representativeWindow();
    const positions = [42, 43, 44].map((tileX) => worldPosition(tileX, 25));
    const patch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "rain-chorus:visible-crow-flock",
      originRegion: PERCEPTION_REGION,
      derivation: { kind: "bounded-input-v1" },
      populations: [{
        species: "fish-crow",
        populationKey: "rain-chorus:visible-crow-flock",
        populationSize: positions.length,
        members: positions.map((position, populationOrdinal) => ({
          populationOrdinal,
          representedUnits: 1,
          position,
          materialization: "coarse" as const,
        })),
      }],
    });
    const materialized = setCoreEcologyMaterializationForWindow(patch, window, 0);
    if (materialized === null) throw new Error("Crow presentation fixture did not materialize");
    const crowIds = materialized.populations[0]?.members.map(
      ({ actor }) => actor.identity.stableId,
    ) ?? [];
    const selectedActorId = crowIds[1];
    if (selectedActorId === undefined) throw new Error("Crow presentation fixture is empty");

    const views = projectCoreEcologyWildlife({
      patch: materialized,
      window,
      perception: representativePerception(window),
      tileSize: 16,
      selectedTarget: { species: "fish-crow", actorId: selectedActorId },
    });
    if (views === null) throw new Error("Crow presentation fixture did not project");

    expect(views).toHaveLength(crowIds.length);
    expect(new Set(views.map(({ actorId }) => actorId))).toEqual(new Set(crowIds));
    // The same coarse visible-count context may accompany each representative;
    // it never replaces or multiplies the three stable interactive identities.
    expect(new Set(views.map(({ groupSize }) => groupSize))).toEqual(new Set([2]));
    expect(views.filter(({ selected }) => selected).map(({ actorId }) => actorId))
      .toEqual([selectedActorId]);
    for (const actorId of crowIds) {
      expect(selectedCoreEcologyActor(materialized, {
        species: "fish-crow",
        actorId,
      })?.identity.stableId).toBe(actorId);
    }
  });

  it("initializes weather honestly, then turns rain into one anonymous directional chorus", () => {
    const chorusTick = 24;
    const state = createWorld(SEED_TEXT, "standard");
    const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
      rootSeed: state.meta.rootSeed,
      originRegion: PERCEPTION_REGION,
    });
    const initialPatch = createCoreEcologyAggregatePatch({
      seed: state.meta.rootSeed,
      patchKey: "rain-chorus:heard-integration",
      originRegion: PERCEPTION_REGION,
      tick: chorusTick,
      derivation: { kind: "habitat-v4", habitat },
      populations: individualInputs(habitat),
    });
    const frogs = initialPatch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    const anchor = frogs?.anchors[0];
    if (frogs === undefined || anchor === undefined) {
      throw new Error("Rain-chorus integration fixture requires one frog area anchor");
    }
    const player = createLivingActorAddress({
      actorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      species: "human",
      position: translateWorldPosition(
        anchor.position,
        -WORLD_POSITION_UNITS_PER_TILE,
        0,
      ),
      persistence: "promoted",
    });
    const clearInitial = aggregateWeatherEnvironment(
      initialPatch,
      anchor.position,
      chorusTick,
      "clear",
      0,
    );
    // Habitat suitability is not current weather. Before the first simulation
    // step a dry world must not leak the habitat score as a live rain chorus.
    expect(projectCoreEcologyAggregateHeardCues({
      patch: initialPatch,
      player,
      tick: chorusTick,
      window: clearInitial.window,
      world: clearInitial.world,
    })).toEqual([]);

    // Use a non-relocation cadence for the weather comparison so only current
    // activity changes; identity, population, and anchor custody stay exact.
    const activityTick = chorusTick + 1;
    const activityPatch = createCoreEcologyAggregatePatch({
      seed: state.meta.rootSeed,
      patchKey: "rain-chorus:weather-comparison",
      originRegion: PERCEPTION_REGION,
      tick: activityTick,
      derivation: { kind: "habitat-v4", habitat },
      populations: individualInputs(habitat),
    });
    const activityFrogs = activityPatch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    if (activityFrogs === undefined) throw new Error("Frog activity owner is absent");
    const clear = aggregateWeatherEnvironment(
      activityPatch,
      anchor.position,
      activityTick,
      "clear",
      0,
    );
    const rainy = aggregateWeatherEnvironment(
      activityPatch,
      anchor.position,
      activityTick,
      "rain",
      820_000,
    );
    const clearStep = stepCoreEcologySmallWorld(activityPatch, activityTick, clear.frame);
    const rainStep = stepCoreEcologySmallWorld(activityPatch, activityTick, rainy.frame);
    if (clearStep === null || rainStep === null) {
      throw new Error("Weather did not enter the aggregate activity owner");
    }
    const clearFrogs = clearStep.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    const rainFrogs = rainStep.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    expect(rainFrogs?.activitySignal.intensity)
      .toBeGreaterThan(clearFrogs?.activitySignal.intensity ?? FIXED_POINT);
    for (const current of [clearFrogs, rainFrogs]) {
      expect(current?.aggregateId).toBe(activityFrogs.aggregateId);
      expect(current?.populationSize).toBe(activityFrogs.populationSize);
      expect(current?.anchors).toEqual(activityFrogs.anchors);
    }
    expect(rainStep.patch.populations.some(({ species }) => (
      species === "southern-leopard-frog"
    ))).toBe(false);

    const audibleRain = aggregateWeatherEnvironment(
      initialPatch,
      anchor.position,
      chorusTick,
      "rain",
      820_000,
    );
    const audibleStep = stepCoreEcologySmallWorld(
      initialPatch,
      chorusTick,
      audibleRain.frame,
    );
    if (audibleStep === null) throw new Error("Audible rain chorus step failed");
    const heard = projectCoreEcologyAggregateHeardCues({
      patch: audibleStep.patch,
      player,
      tick: chorusTick,
      window: audibleRain.window,
      world: audibleRain.world,
    });
    expect(heard).toHaveLength(1);
    expect(heard?.[0]).toMatchObject({
      cue: "frog-chorus",
      caption: "[chorus nearby — direction unclear]",
    });
    expect(heard?.[0]?.pan).toBeGreaterThan(0);
    expect(heard?.[0]?.caption).not.toMatch(/frog/iu);
    expect(JSON.stringify(heard)).not.toContain(frogs.aggregateId);
    expect(JSON.stringify(heard)).not.toContain("actorId");
  });
});

function deriveFocusedHabitat(
  seed: RootSeed,
  region: RegionCoord,
  radiusTiles: number,
): CoreEcologyRainChorusHabitatAssemblage {
  return deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: seed,
    originRegion: region,
    focus: {
      position: createWorldPosition(
        region,
        Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      ),
      radiusTiles,
    },
  });
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

function aggregateWeatherEnvironment(
  patch: ReturnType<typeof createCoreEcologyAggregatePatch>,
  anchor: WorldPosition,
  tick: number,
  weatherKind: WeatherKind,
  weatherIntensity: number,
) {
  const state = createWorld(SEED_TEXT, "standard");
  state.meta.completedTick = tick;
  state.weather = {
    ...state.weather,
    kind: weatherKind,
    intensity: weatherIntensity,
    windX: 0,
    windY: 0,
  };
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({
      rootSeed: state.meta.rootSeed,
      center: anchor.region,
    }),
    regionalFrameOriginAtAddress({
      region: anchor.region,
      localX: Math.floor(anchor.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.floor(anchor.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  const frame = deriveCoreEcologySettlementShadowsStimulusFrame({
    patch,
    world,
    window,
    tick,
    visualSources: [],
    exposedFoodSources: [],
  });
  if (frame === null) throw new Error("Aggregate weather fixture could not perceive weather");
  return { frame, window, world };
}

interface PerceptionFixture {
  readonly state: WorldState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
}

function perceptionFixture(): PerceptionFixture {
  const state = createWorld(SEED_TEXT, "standard");
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  for (const settlement of state.settlements) settlement.tileIndex = 0;
  for (let x = OBSERVER_X - 1; x <= OBSERVER_X + 6; x += 1) {
    const tile = state.terrain.tiles[OBSERVER_Y * state.terrain.width + x];
    if (tile === undefined) throw new Error("Perception corridor left terrain");
    tile.terrain = "meadow";
    tile.elevation = 0;
    tile.roughness = 0;
  }
  const economy = createWorldView(state);
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
    regionalFrameOriginAtAddress({
      region: PERCEPTION_REGION,
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
  current: PerceptionFixture,
  species: Extract<CoreWildlifeSpecies, "fish-crow" | "northern-harrier" | "marsh-rabbit">,
  tileX: number,
  tileY: number,
  heading: number,
  populationOrdinal: number,
): CoreWildlifeActorState {
  return createCoreWildlifeActorState({
    seed: current.state.meta.rootSeed,
    species,
    originRegion: PERCEPTION_REGION,
    populationKey: `rain-chorus-integration:${species}`,
    populationOrdinal,
    position: worldPosition(tileX, tileY),
    heading,
  });
}

function perceptionFrame(
  current: PerceptionFixture,
  actors: readonly CoreWildlifeActorState[],
  tick: number,
): CoreEcologyPerceptionFrameInput {
  return {
    actors,
    world: current.world,
    window: current.window,
    tick,
  };
}

function observationsFor(
  batches: readonly CoreEcologyObservationBatch[] | null,
  observerId: string,
): readonly ActorObservation[] {
  return batches?.find(({ observerId: candidate }) => candidate === observerId)?.observations ?? [];
}

function observationOf(
  batches: readonly CoreEcologyObservationBatch[] | null,
  observerId: string,
  subjectId: string,
): ActorObservation | undefined {
  return observationsFor(batches, observerId).find(({ subjectId: candidate }) => (
    candidate === subjectId
  ));
}

function livePreyOpportunity(
  observation: ActorObservation,
  resourceId: string,
): CoreWildlifeFoodOpportunity {
  return Object.freeze({
    resourceId,
    observationId: observation.id,
    foodClass: "live-prey",
    sourceKind: "living-actor",
    availableUnits: 1,
    nutrition: 900_000,
    effort: 120_000,
    risk: 100_000,
    competition: 0,
    directlyConfirmed: true,
    accessible: true,
  });
}

function stepActor(
  actor: CoreWildlifeActorState,
  tick: number,
  observations: readonly ActorObservation[],
  foodOpportunities: readonly CoreWildlifeFoodOpportunity[] = [],
) {
  const result = stepCoreWildlifeActor(actor, {
    tick,
    observations,
    foodOpportunities,
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (result === null) throw new Error("Representative ecology actor step failed");
  return result;
}

function worldPosition(tileX: number, tileY: number) {
  return createWorldPosition(
    PERCEPTION_REGION,
    tileX * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    tileY * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function representativeWindow(): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: regionLocalToGlobalTile(PERCEPTION_REGION, 0, 0),
    terrain: {
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    },
  });
}

function representativePerception(window: CoreEcologyRuntimeWindow) {
  const cells: PerceptionCell[] = Array.from(
    { length: window.terrain.width * window.terrain.height },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  return evaluatePerception({
    columns: window.terrain.width,
    rows: window.terrain.height,
    cells,
    playerTileIndex: 25 * window.terrain.width + 40,
    facingRadians: 0,
    weatherVisibility: 1,
  });
}
