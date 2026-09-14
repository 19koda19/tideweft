import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { tideAtTick } from "../sim/terrain";
import { FIXED_POINT, type TerrainTileView, type WorldView } from "../sim/types";
import {
  replaceCoreEcologyAggregatePatchActor,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  deriveCoreEcologySettlementShadowsStimulusFrame,
  type CoreEcologyAggregateVisualSource,
} from "./coreEcologyAggregatePerception";
import {
  CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
  CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
  CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID,
  deriveCoreEcologyBreadthHabitat,
  type CoreEcologyBreadthCohortId,
} from "./coreEcologyBreadthHabitat";
import {
  stepCoreEcologySettlementShadows,
  type CoreEcologySettlementShadowsStimulus,
} from "./coreEcologySmallWorld";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createCoreEcologyBreadthResidentPatch } from "./regionalBreadthCohort";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  translateWorldPosition,
  worldPositionToSpatialFrame,
  type WorldPosition,
} from "./worldPosition";

export const ALPHA37_ESTUARY_BREADTH_EMERGENCE_OWNER_INTENT =
  "test:alpha37-estuary-breadth-emergence:v1" as const;
export const ALPHA38_MARSH_CHANNEL_WEB_EMERGENCE_OWNER_INTENT =
  "test:alpha38-marsh-channel-web-emergence:v1" as const;
export const ALPHA39_SALTMARSH_SMALL_WORLDS_EMERGENCE_OWNER_INTENT =
  "test:alpha39-saltmarsh-small-worlds-emergence:v1" as const;

const SEED_TEXT = "alpha37 estuary breadth shared properties";
const REGION = createRegionCoord(-5_179, -89_646);
const MARSH_CHANNEL_REGION = createRegionCoord(173_753, 11_507);
const SALTMARSH_SMALL_WORLDS_REGION = createRegionCoord(-126_625, -214_398);
const HIGH_TIDE_TICK = 360;

interface Fixture {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly anchovy: CoreEcologyAggregatePatchState["aggregatePopulations"][number];
  readonly occupiedAnchor: CoreEcologyAggregatePatchState["aggregatePopulations"][number]["anchors"][number];
  readonly bird: CoreEcologyAggregateVisualSource;
}

describe(`${ALPHA37_ESTUARY_BREADTH_EMERGENCE_OWNER_INTENT} shared emergent response`, () => {
  it("lets a visible estuary bird pressure an anchovy school while a ridge blocks the same lawful source", () => {
    const clear = fixture(false);
    expect(clear.anchovy.anchors.length).toBeGreaterThan(1);
    const visibleFrame = deriveCoreEcologySettlementShadowsStimulusFrame({
      patch: clear.patch,
      world: clear.world,
      window: clear.window,
      tick: clear.patch.updatedAtTick,
      visualSources: [clear.bird],
      exposedFoodSources: [],
    });
    const visiblePressure = visibleFrame?.stimuli.find((stimulus) => (
      stimulus.sourceReferenceId === clear.bird.sourceReferenceId
      && stimulus.sourceKind === "common-tern"
      && stimulus.targetAggregateId === clear.anchovy.aggregateId
    ));
    expect(influenceAt(visiblePressure, clear.occupiedAnchor.anchorOrdinal)).toBeGreaterThan(0);

    const visibleResult = stepCoreEcologySettlementShadows(
      clear.patch,
      clear.patch.updatedAtTick,
      visibleFrame,
    );
    const event = visibleResult?.events.find((candidate) => (
      candidate.sourceReferenceId === clear.bird.sourceReferenceId
      && candidate.targetSpecies === "bay-anchovy"
    ));
    expect(event).toMatchObject({
      sourceKind: "common-tern",
      causeKind: "predator-pressure",
      response: "pressure",
      displacedUnits: 1,
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    });

    const anchovyAfter = visibleResult?.patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === clear.anchovy.aggregateId,
    );
    expect(anchovyAfter?.populationSize).toBe(clear.anchovy.populationSize);
    expect(totalAnchorUnits(anchovyAfter)).toBe(totalAnchorUnits(clear.anchovy));
    expect(anchovyAfter?.anchors.find(
      ({ anchorOrdinal }) => anchorOrdinal === event?.fromAnchorOrdinal,
    )?.populationUnits).toBe(
      clear.anchovy.anchors.find(
        ({ anchorOrdinal }) => anchorOrdinal === event?.fromAnchorOrdinal,
      )!.populationUnits - 1,
    );
    expect(anchovyAfter?.anchors.find(
      ({ anchorOrdinal }) => anchorOrdinal === event?.toAnchorOrdinal,
    )?.populationUnits).toBe(
      clear.anchovy.anchors.find(
        ({ anchorOrdinal }) => anchorOrdinal === event?.toAnchorOrdinal,
      )!.populationUnits + 1,
    );
    expect(visibleResult?.patch.nextMortalityOrdinal).toBe(0);
    expect(visibleResult?.patch.mortalityTransactions).toEqual([]);
    expect(visibleResult?.patch.carcasses).toEqual([]);
    expect(JSON.stringify(visibleResult)).not.toContain("capture");
    expect(visibleResult?.patch.populations.find(
      ({ species }) => species === "common-tern",
    )?.populationSize).toBe(
      clear.patch.populations.find(({ species }) => species === "common-tern")!.populationSize,
    );

    const blocked = fixture(true);
    const hiddenFrame = deriveCoreEcologySettlementShadowsStimulusFrame({
      patch: blocked.patch,
      world: blocked.world,
      window: blocked.window,
      tick: blocked.patch.updatedAtTick,
      visualSources: [blocked.bird],
      exposedFoodSources: [],
    });
    expect(hiddenFrame?.stimuli.some((stimulus) => (
      stimulus.sourceReferenceId === blocked.bird.sourceReferenceId
      && stimulus.targetAggregateId === blocked.anchovy.aggregateId
    ))).toBe(false);

    const hiddenResult = stepCoreEcologySettlementShadows(
      blocked.patch,
      blocked.patch.updatedAtTick,
      hiddenFrame,
    );
    expect(hiddenResult?.events.some((candidate) => (
      candidate.sourceReferenceId === blocked.bird.sourceReferenceId
      && candidate.targetSpecies === "bay-anchovy"
    ))).toBe(false);
    const hiddenAnchovy = hiddenResult?.patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === blocked.anchovy.aggregateId,
    );
    expect(hiddenAnchovy?.populationSize).toBe(blocked.anchovy.populationSize);
    expect(totalAnchorUnits(hiddenAnchovy)).toBe(totalAnchorUnits(blocked.anchovy));
    expect(hiddenResult?.patch.mortalityTransactions).toEqual([]);
    expect(hiddenResult?.patch.carcasses).toEqual([]);
  });
});

describe(`${ALPHA38_MARSH_CHANNEL_WEB_EMERGENCE_OWNER_INTENT} shared emergent response`, () => {
  it("lets a visible cormorant redistribute one menhaden unit while occlusion removes pressure", () => {
    const options = {
      cohortId: CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
      region: MARSH_CHANNEL_REGION,
      targetSpecies: "atlantic-menhaden" as const,
      sourceSpecies: "double-crested-cormorant" as const,
    };
    const clear = fixture(false, options);
    expect(clear.anchovy.anchors.length).toBeGreaterThan(1);
    const visibleFrame = deriveCoreEcologySettlementShadowsStimulusFrame({
      patch: clear.patch,
      world: clear.world,
      window: clear.window,
      tick: clear.patch.updatedAtTick,
      visualSources: [clear.bird],
      exposedFoodSources: [],
    });
    const visiblePressure = visibleFrame?.stimuli.find((stimulus) => (
      stimulus.sourceReferenceId === clear.bird.sourceReferenceId
      && stimulus.sourceKind === "double-crested-cormorant"
      && stimulus.targetAggregateId === clear.anchovy.aggregateId
    ));
    expect(influenceAt(visiblePressure, clear.occupiedAnchor.anchorOrdinal)).toBeGreaterThan(0);

    const visibleResult = stepCoreEcologySettlementShadows(
      clear.patch,
      clear.patch.updatedAtTick,
      visibleFrame,
    );
    const event = visibleResult?.events.find((candidate) => (
      candidate.sourceReferenceId === clear.bird.sourceReferenceId
      && candidate.targetSpecies === "atlantic-menhaden"
    ));
    expect(event).toMatchObject({
      sourceKind: "double-crested-cormorant",
      causeKind: "predator-pressure",
      response: "pressure",
      displacedUnits: 1,
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    });
    const after = visibleResult?.patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === clear.anchovy.aggregateId,
    );
    expect(after?.populationSize).toBe(clear.anchovy.populationSize);
    expect(totalAnchorUnits(after)).toBe(totalAnchorUnits(clear.anchovy));
    expect(after?.anchors.find(
      ({ anchorOrdinal }) => anchorOrdinal === event?.fromAnchorOrdinal,
    )?.populationUnits).toBe(
      clear.anchovy.anchors.find(
        ({ anchorOrdinal }) => anchorOrdinal === event?.fromAnchorOrdinal,
      )!.populationUnits - 1,
    );
    expect(after?.anchors.find(
      ({ anchorOrdinal }) => anchorOrdinal === event?.toAnchorOrdinal,
    )?.populationUnits).toBe(
      clear.anchovy.anchors.find(
        ({ anchorOrdinal }) => anchorOrdinal === event?.toAnchorOrdinal,
      )!.populationUnits + 1,
    );
    expect(visibleResult?.patch.nextMortalityOrdinal).toBe(0);
    expect(visibleResult?.patch.mortalityTransactions).toEqual([]);
    expect(visibleResult?.patch.carcasses).toEqual([]);
    expect(visibleResult?.events.some((candidate) => (
      candidate.sourceReferenceId === clear.bird.sourceReferenceId
      && candidate.targetSpecies === "grass-shrimp"
    ))).toBe(false);

    const blocked = fixture(true, options);
    const hiddenFrame = deriveCoreEcologySettlementShadowsStimulusFrame({
      patch: blocked.patch,
      world: blocked.world,
      window: blocked.window,
      tick: blocked.patch.updatedAtTick,
      visualSources: [blocked.bird],
      exposedFoodSources: [],
    });
    expect(hiddenFrame?.stimuli.some((stimulus) => (
      stimulus.sourceReferenceId === blocked.bird.sourceReferenceId
      && stimulus.targetAggregateId === blocked.anchovy.aggregateId
    ))).toBe(false);
    const hiddenResult = stepCoreEcologySettlementShadows(
      blocked.patch,
      blocked.patch.updatedAtTick,
      hiddenFrame,
    );
    const hidden = hiddenResult?.patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === blocked.anchovy.aggregateId,
    );
    expect(hidden?.populationSize).toBe(blocked.anchovy.populationSize);
    expect(totalAnchorUnits(hidden)).toBe(totalAnchorUnits(blocked.anchovy));
    expect(hiddenResult?.events.some((candidate) => (
      candidate.sourceReferenceId === blocked.bird.sourceReferenceId
    ))).toBe(false);
  });
});

describe(`${ALPHA39_SALTMARSH_SMALL_WORLDS_EMERGENCE_OWNER_INTENT} shared emergent response`, () => {
  it("lets a visible margin forager pressure a periwinkle area while terrain occlusion removes that pressure", () => {
    const options = {
      cohortId: CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID,
      region: SALTMARSH_SMALL_WORLDS_REGION,
      targetSpecies: "marsh-periwinkle" as const,
      sourceSpecies: "diamondback-terrapin" as const,
    };
    const clear = fixture(false, options);
    expect(clear.anchovy.anchors.length).toBeGreaterThan(1);
    const visibleFrame = deriveCoreEcologySettlementShadowsStimulusFrame({
      patch: clear.patch,
      world: clear.world,
      window: clear.window,
      tick: clear.patch.updatedAtTick,
      visualSources: [clear.bird],
      exposedFoodSources: [],
    });
    const visiblePressure = visibleFrame?.stimuli.find((stimulus) => (
      stimulus.sourceReferenceId === clear.bird.sourceReferenceId
      && stimulus.sourceKind === "diamondback-terrapin"
      && stimulus.targetAggregateId === clear.anchovy.aggregateId
    ));
    expect(influenceAt(visiblePressure, clear.occupiedAnchor.anchorOrdinal)).toBeGreaterThan(0);

    const visibleResult = stepCoreEcologySettlementShadows(
      clear.patch,
      clear.patch.updatedAtTick,
      visibleFrame,
    );
    const event = visibleResult?.events.find((candidate) => (
      candidate.sourceReferenceId === clear.bird.sourceReferenceId
      && candidate.targetSpecies === "marsh-periwinkle"
    ));
    expect(event).toMatchObject({
      sourceKind: "diamondback-terrapin",
      causeKind: "predator-pressure",
      response: "pressure",
      displacedUnits: 1,
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    });
    const after = visibleResult?.patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === clear.anchovy.aggregateId,
    );
    expect(after?.populationSize).toBe(clear.anchovy.populationSize);
    expect(totalAnchorUnits(after)).toBe(totalAnchorUnits(clear.anchovy));
    expect(after?.anchors.find(
      ({ anchorOrdinal }) => anchorOrdinal === event?.fromAnchorOrdinal,
    )?.populationUnits).toBe(
      clear.anchovy.anchors.find(
        ({ anchorOrdinal }) => anchorOrdinal === event?.fromAnchorOrdinal,
      )!.populationUnits - 1,
    );
    expect(after?.anchors.find(
      ({ anchorOrdinal }) => anchorOrdinal === event?.toAnchorOrdinal,
    )?.populationUnits).toBe(
      clear.anchovy.anchors.find(
        ({ anchorOrdinal }) => anchorOrdinal === event?.toAnchorOrdinal,
      )!.populationUnits + 1,
    );
    expect(visibleResult?.patch.nextMortalityOrdinal).toBe(0);
    expect(visibleResult?.patch.mortalityTransactions).toEqual([]);
    expect(visibleResult?.patch.carcasses).toEqual([]);
    expect(JSON.stringify(visibleResult)).not.toContain("capture");

    const blocked = fixture(true, options);
    const hiddenFrame = deriveCoreEcologySettlementShadowsStimulusFrame({
      patch: blocked.patch,
      world: blocked.world,
      window: blocked.window,
      tick: blocked.patch.updatedAtTick,
      visualSources: [blocked.bird],
      exposedFoodSources: [],
    });
    expect(hiddenFrame?.stimuli.some((stimulus) => (
      stimulus.sourceReferenceId === blocked.bird.sourceReferenceId
      && stimulus.targetAggregateId === blocked.anchovy.aggregateId
    ))).toBe(false);
    const hiddenResult = stepCoreEcologySettlementShadows(
      blocked.patch,
      blocked.patch.updatedAtTick,
      hiddenFrame,
    );
    const hidden = hiddenResult?.patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === blocked.anchovy.aggregateId,
    );
    expect(hidden?.populationSize).toBe(blocked.anchovy.populationSize);
    expect(totalAnchorUnits(hidden)).toBe(totalAnchorUnits(blocked.anchovy));
    expect(hiddenResult?.events.some((candidate) => (
      candidate.sourceReferenceId === blocked.bird.sourceReferenceId
      && candidate.targetSpecies === "marsh-periwinkle"
    ))).toBe(false);
    expect(hiddenResult?.patch.mortalityTransactions).toEqual([]);
    expect(hiddenResult?.patch.carcasses).toEqual([]);
  });
});

function fixture(
  occluded: boolean,
  options: Readonly<{
    cohortId: CoreEcologyBreadthCohortId;
    region: ReturnType<typeof createRegionCoord>;
    targetSpecies: "bay-anchovy" | "atlantic-menhaden" | "marsh-periwinkle";
    sourceSpecies:
      | "common-tern"
      | "double-crested-cormorant"
      | "diamondback-terrapin";
  }> = {
    cohortId: CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
    region: REGION,
    targetSpecies: "bay-anchovy",
    sourceSpecies: "common-tern",
  },
): Fixture {
  const state = createWorld(SEED_TEXT, "standard");
  state.meta.completedTick = HIGH_TIDE_TICK;
  state.tide = tideAtTick(HIGH_TIDE_TICK);
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  const habitat = deriveCoreEcologyBreadthHabitat({
    seed: state.meta.rootSeed,
    region: options.region,
    cohortId: options.cohortId,
  });
  let patch = createCoreEcologyBreadthResidentPatch({
    seed: state.meta.rootSeed,
    habitat,
    tick: HIGH_TIDE_TICK,
  });
  const anchovy = patch.aggregatePopulations.find(
    ({ species }) => species === options.targetSpecies,
  );
  const occupiedAnchor = anchovy?.anchors.find(({ populationUnits }) => populationUnits > 0);
  const tern = patch.populations.find(
    ({ species }) => species === options.sourceSpecies,
  )?.members[0]?.actor;
  if (anchovy === undefined || occupiedAnchor === undefined || tern === undefined) {
    throw new Error(
      `Breadth emergence fixture requires ${options.targetSpecies} and ${options.sourceSpecies}`,
    );
  }

  const sourcePosition = translateWorldPosition(
    occupiedAnchor.position,
    2 * WORLD_POSITION_UNITS_PER_TILE,
    0,
  );
  const movedTern = repositionCoreWildlifeActor(tern, {
    atTick: patch.updatedAtTick,
    position: sourcePosition,
    heading: 500_000,
  });
  patch = replaceCoreEcologyAggregatePatchActor(patch, movedTern);

  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({
      rootSeed: state.meta.rootSeed,
      center: occupiedAnchor.position.region,
    }),
    regionalFrameOriginAtAddress({
      region: occupiedAnchor.position.region,
      localX: Math.floor(occupiedAnchor.position.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.floor(occupiedAnchor.position.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  setTile(world, window, occupiedAnchor.position, {
    terrain: options.targetSpecies === "marsh-periwinkle" ? "tidal-flat" : "deep-water",
    elevation: 0,
    roughness: 0,
  });
  setTile(world, window, translateWorldPosition(
    occupiedAnchor.position,
    WORLD_POSITION_UNITS_PER_TILE,
    0,
  ), {
    terrain: occluded ? "ridge" : "tidal-flat",
    elevation: occluded ? FIXED_POINT : 0,
    roughness: 0,
  });
  setTile(world, window, sourcePosition, {
    terrain: "meadow",
    elevation: 0,
    roughness: 0,
  });

  return {
    patch,
    world,
    window,
    anchovy: patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === anchovy.aggregateId,
    )!,
    occupiedAnchor,
    bird: {
      sourceReferenceId: movedTern.identity.stableId,
      sourceSpecies: options.sourceSpecies,
      position: movedTern.address.position,
      movementSalience: FIXED_POINT,
    },
  };
}

function setTile(
  world: WorldView,
  window: RegionalTerrainWindow,
  position: WorldPosition,
  values: Pick<TerrainTileView, "terrain" | "elevation" | "roughness">,
): void {
  const frameOrigin = window.addresses[0];
  if (frameOrigin === undefined) throw new Error("Regional fixture has no origin address");
  const frame = createSpatialFrame(
    createWorldPosition(
      frameOrigin.region,
      frameOrigin.localX * WORLD_POSITION_UNITS_PER_TILE,
      frameOrigin.localY * WORLD_POSITION_UNITS_PER_TILE,
    ),
    world.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
    world.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
  );
  const point = worldPositionToSpatialFrame(frame, position);
  if (point === null) throw new Error("Emergence fixture position left the regional frame");
  const index = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE) * world.terrain.width
    + Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const tile = world.terrain.tiles[index];
  if (tile === undefined) throw new Error("Emergence fixture position has no terrain tile");
  Object.assign(tile, values);
}

function influenceAt(
  stimulus: CoreEcologySettlementShadowsStimulus | undefined,
  anchorOrdinal: number,
): number {
  return stimulus?.anchorInfluences.find(
    (entry) => entry.anchorOrdinal === anchorOrdinal,
  )?.intensity ?? 0;
}

function totalAnchorUnits(
  population: CoreEcologyAggregatePatchState["aggregatePopulations"][number] | undefined,
): number {
  return population?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0) ?? 0;
}
