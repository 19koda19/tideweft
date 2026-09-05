import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, type TerrainTileView, type WeatherKind, type WorldView } from "../sim/types";
import {
  CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_SOURCES,
  deriveCoreEcologySettlementShadowsStimulusFrame,
  selectCoreEcologyAggregateExposedFoodSources,
  type CoreEcologyAggregateExposedFoodSource,
  type CoreEcologyAggregatePerceptionFrameInput,
  type CoreEcologyAggregateVisualSource,
} from "./coreEcologyAggregatePerception";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI,
  type CoreEcologySettlementShadowsStimulus,
} from "./coreEcologySmallWorld";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
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

const ORIGIN = createRegionCoord(-17, 23);
const SEED_TEXT = "settlement shadows interaction";

interface Fixture {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
}

describe("aggregate ecology shared-perception adapter", () => {
  it("is deterministic and applies the shared LOS occlusion surface to visual pressure", () => {
    const clear = fixture();
    const rats = ratPopulation(clear.patch);
    const anchor = rats.anchors[0]!;
    const sourcePosition = translateWorldPosition(
      anchor.position,
      2 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const source: CoreEcologyAggregateVisualSource = {
      sourceReferenceId: "CAT-v1-shared-los",
      sourceKind: "cat",
      position: sourcePosition,
      movementSalience: FIXED_POINT,
    };
    const first = deriveCoreEcologySettlementShadowsStimulusFrame(input(clear, [source]));
    const replay = deriveCoreEcologySettlementShadowsStimulusFrame(input(clear, [source]));
    expect(replay).toEqual(first);
    expect(visualInfluence(first, rats.aggregateId, anchor.anchorOrdinal)).toBeGreaterThan(0);

    const blocked = fixture();
    setTile(blocked, translateWorldPosition(
      anchor.position,
      WORLD_POSITION_UNITS_PER_TILE,
      0,
    ), { terrain: "ridge", elevation: FIXED_POINT, roughness: 0 });
    const hidden = deriveCoreEcologySettlementShadowsStimulusFrame(input(blocked, [source]));
    expect(visualInfluence(hidden, rats.aggregateId, anchor.anchorOrdinal)).toBe(0);
  });

  it("uses the shared wind/rain-aware scent evaluator without consuming or mutating food", () => {
    const dry = fixture("clear", 0);
    const rats = ratPopulation(dry.patch);
    const source = foodAtUsefulScentDistance(rats.anchors.map(({ position }) => position));
    const original = structuredClone(source);
    const dryFrame = deriveCoreEcologySettlementShadowsStimulusFrame(
      input(dry, [], [source]),
    );

    const wet = fixture("rain", FIXED_POINT);
    const wetFrame = deriveCoreEcologySettlementShadowsStimulusFrame(
      input(wet, [], [source]),
    );
    const dryStrength = peakInfluence(dryFrame, "exposed-food");
    const wetStrength = peakInfluence(wetFrame, "exposed-food");

    expect(dryStrength).toBeGreaterThan(0);
    expect(wetStrength).toBeLessThan(dryStrength);
    expect(source).toEqual(original);
    expect(dryFrame?.stimuli.find(({ sourceKind }) => sourceKind === "exposed-food"))
      .toMatchObject({ channels: ["scent"], response: "attraction" });
    expect(JSON.stringify(dryFrame)).not.toContain("food-scent");
  });

  it("turns actual rain plus mapped terrain exposure into a lawful touch/evidence gradient", () => {
    const current = fixture("rain", 900_000);
    const rats = ratPopulation(current.patch);
    const sheltered = rats.anchors[0]!;
    const exposed = rats.anchors[1]!;
    setTile(current, sheltered.position, {
      terrain: "marsh",
      elevation: 0,
      roughness: FIXED_POINT,
    });
    setTile(current, exposed.position, {
      terrain: "ridge",
      elevation: FIXED_POINT,
      roughness: 0,
    });

    const frame = deriveCoreEcologySettlementShadowsStimulusFrame(input(current));
    const rain = frame?.stimuli.find(({ sourceKind }) => sourceKind === "rain");
    expect(rain).toMatchObject({
      response: "pressure",
      channels: ["touch", "evidence"],
      targetAggregateId: rats.aggregateId,
    });
    expect(influenceAt(rain, exposed.anchorOrdinal))
      .toBeGreaterThan(influenceAt(rain, sheltered.anchorOrdinal));
  });

  it("is source-order independent and emits at most one strongest source of each kind", () => {
    const current = fixture();
    const anchor = ratPopulation(current.patch).anchors[0]!;
    const visualSources = (["cat", "dog", "human", "gull"] as const).flatMap(
      (sourceKind) => ["b", "a"].map((suffix) => ({
        sourceReferenceId: `${sourceKind}:${suffix}`,
        sourceKind,
        position: anchor.position,
        movementSalience: FIXED_POINT,
      })),
    );
    const exposedFoodSources = Array.from(
      { length: CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_SOURCES },
      (_, index): CoreEcologyAggregateExposedFoodSource => ({
        sourceReferenceId: `food:${index.toString(36).padStart(2, "0")}`,
        position: anchor.position,
        sourceStrength: FIXED_POINT,
        packagingLeakage: FIXED_POINT,
      }),
    );
    const forward = deriveCoreEcologySettlementShadowsStimulusFrame(
      input(current, visualSources, exposedFoodSources),
    );
    const reverse = deriveCoreEcologySettlementShadowsStimulusFrame(input(
      current,
      [...visualSources].reverse(),
      [...exposedFoodSources].reverse(),
    ));

    expect(reverse).toEqual(forward);
    expect(forward?.stimuli.length).toBeLessThanOrEqual(
      CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI,
    );
    expect(new Set(forward?.stimuli.map(({ targetAggregateId, sourceKind }) => (
      `${targetAggregateId}/${sourceKind}`
    ))).size).toBe(forward?.stimuli.length);
    expect(forward?.stimuli.map(({ sourceReferenceId }) => sourceReferenceId)).toContain("cat:a");
    expect(forward?.stimuli.map(({ sourceReferenceId }) => sourceReferenceId)).toContain("food:00");
    expect(deriveCoreEcologySettlementShadowsStimulusFrame(input(
      current,
      visualSources,
      [...exposedFoodSources, { ...exposedFoodSources[0]!, sourceReferenceId: "food:overflow" }],
    ))).toBeNull();
  });

  it("bounds dense physical food by exact nearest-anchor distance before sensory work", () => {
    const current = fixture();
    const anchor = ratPopulation(current.patch).anchors[0]!;
    const near: CoreEcologyAggregateExposedFoodSource = {
      sourceReferenceId: "food:zz-nearest",
      position: anchor.position,
      sourceStrength: FIXED_POINT,
      packagingLeakage: FIXED_POINT,
    };
    const distant = Array.from({ length: 130 }, (_, index) => ({
      sourceReferenceId: `food:dense-${index.toString(36).padStart(3, "0")}`,
      position: translateWorldPosition(
        anchor.position,
        (30_000 + index * 100),
        0,
      ),
      sourceStrength: FIXED_POINT,
      packagingLeakage: FIXED_POINT,
    } satisfies CoreEcologyAggregateExposedFoodSource));
    const sources = [...distant, near];
    const bounded = selectCoreEcologyAggregateExposedFoodSources(current.patch, sources);
    const reversed = selectCoreEcologyAggregateExposedFoodSources(
      current.patch,
      [...sources].reverse(),
    );

    expect(reversed).toEqual(bounded);
    expect(bounded).toHaveLength(CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_SOURCES);
    expect(bounded?.[0]?.sourceReferenceId).toBe(near.sourceReferenceId);
    expect(bounded?.some(({ sourceReferenceId }) => sourceReferenceId === "food:dense-03l"))
      .toBe(false);
    const frame = deriveCoreEcologySettlementShadowsStimulusFrame({
      ...input(current),
      exposedFoodSources: bounded,
    });
    expect(frame).not.toBeNull();
    expect(frame?.stimuli.find(({ sourceKind }) => sourceKind === "exposed-food")
      ?.sourceReferenceId).toBe(near.sourceReferenceId);
  });
});

function fixture(
  weatherKind: WeatherKind = "clear",
  weatherIntensity = 0,
): Fixture {
  const state = createWorld(SEED_TEXT, "standard");
  state.weather = {
    ...state.weather,
    kind: weatherKind,
    intensity: weatherIntensity,
    windX: 0,
    windY: 0,
  };
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: state.meta.rootSeed,
    originRegion: ORIGIN,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed: state.meta.rootSeed,
    patchKey: "wave-b:aggregate-perception",
    originRegion: ORIGIN,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
  const anchor = ratPopulation(patch).anchors[0]!;
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
  return { patch, world, window };
}

function individualInputs(
  habitat: CoreEcologyHarborEdgeHabitatAssemblage,
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

function input(
  current: Fixture,
  visualSources: readonly CoreEcologyAggregateVisualSource[] = [],
  exposedFoodSources: readonly CoreEcologyAggregateExposedFoodSource[] = [],
): CoreEcologyAggregatePerceptionFrameInput {
  return {
    patch: current.patch,
    world: current.world,
    window: current.window,
    tick: current.patch.updatedAtTick,
    visualSources,
    exposedFoodSources,
  };
}

function ratPopulation(patch: CoreEcologyAggregatePatchState) {
  const rats = patch.aggregatePopulations.find(({ species }) => species === "brown-rat");
  if (rats === undefined || rats.anchors.length < 2) {
    throw new Error("Aggregate perception fixture requires two rat anchors");
  }
  return rats;
}

function setTile(
  current: Fixture,
  position: WorldPosition,
  values: Pick<TerrainTileView, "terrain" | "elevation" | "roughness">,
): void {
  const frameOrigin = current.window.addresses[0];
  if (frameOrigin === undefined) throw new Error("Regional fixture has no origin address");
  const frame = createSpatialFrame(
    createWorldPosition(
      frameOrigin.region,
      frameOrigin.localX * WORLD_POSITION_UNITS_PER_TILE,
      frameOrigin.localY * WORLD_POSITION_UNITS_PER_TILE,
    ),
    current.world.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
    current.world.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
  );
  const point = worldPositionToSpatialFrame(frame, position);
  if (point === null) throw new Error("Test position left regional frame");
  const index = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE) * current.world.terrain.width
    + Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const tile = current.world.terrain.tiles[index];
  if (tile === undefined) throw new Error("Test position has no terrain tile");
  Object.assign(tile, values);
}

function visualInfluence(
  frame: ReturnType<typeof deriveCoreEcologySettlementShadowsStimulusFrame>,
  aggregateId: string,
  anchorOrdinal: number,
): number {
  return frame?.stimuli.find(({ sourceKind, targetAggregateId }) => (
    sourceKind === "cat" && targetAggregateId === aggregateId
  ))?.anchorInfluences.find((entry) => entry.anchorOrdinal === anchorOrdinal)?.intensity ?? 0;
}

function peakInfluence(
  frame: ReturnType<typeof deriveCoreEcologySettlementShadowsStimulusFrame>,
  sourceKind: "exposed-food",
): number {
  return Math.max(0, ...(frame?.stimuli.find((stimulus) => (
    stimulus.sourceKind === sourceKind
  ))?.anchorInfluences.map(({ intensity }) => intensity) ?? []));
}

function influenceAt(
  stimulus: CoreEcologySettlementShadowsStimulus | undefined,
  anchorOrdinal: number,
): number {
  return stimulus?.anchorInfluences.find((entry) => (
    entry.anchorOrdinal === anchorOrdinal
  ))?.intensity ?? 0;
}

function foodAtUsefulScentDistance(
  anchors: readonly WorldPosition[],
): CoreEcologyAggregateExposedFoodSource {
  const first = anchors[0];
  if (first === undefined) throw new Error("No rat anchor for food scent fixture");
  for (const distanceTiles of [12, 10, 8]) {
    for (const direction of [1, -1]) {
      let position: WorldPosition;
      try {
        position = translateWorldPosition(
          first,
          direction * distanceTiles * WORLD_POSITION_UNITS_PER_TILE,
          0,
        );
      } catch {
        continue;
      }
      return {
        sourceReferenceId: "food:physical-provision",
        position,
        sourceStrength: FIXED_POINT,
        packagingLeakage: FIXED_POINT,
      };
    }
  }
  throw new Error("Could not place food scent fixture");
}
