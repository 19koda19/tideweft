import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord, type RegionCoord } from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologySettlementShadowsStimulusFrame,
  type CoreEcologyAggregatePerceptionFrameInput,
  type CoreEcologyAggregateVisualSource,
} from "./coreEcologyAggregatePerception";
import { resolveCoreEcologyAggregateLivingResponse } from "./coreEcologyAggregatePolicy";
import {
  deriveCoreEcologyTidalTableHabitatAssemblage,
  type CoreEcologyTidalTableHabitatAssemblage,
} from "./coreEcologyHabitat";
import { stepCoreEcologySmallWorld } from "./coreEcologySmallWorld";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

const SEED_TEXT = "tidal-triad-1";
const ORIGIN = createRegionCoord(0, 0);

interface Fixture {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly egret: CoreEcologyAggregateVisualSource;
}

describe("tidal-table nonlethal aggregate pressure", () => {
  it("resolves one wader against aquatic and amphibious small prey through shared capabilities", () => {
    for (const targetSpecies of [
      "atlantic-silverside",
      "atlantic-marsh-fiddler-crab",
    ] as const) {
      expect(resolveCoreEcologyAggregateLivingResponse(targetSpecies, "snowy-egret"))
        .toMatchObject({
          sourceSpecies: "snowy-egret",
          sourceKind: "snowy-egret",
          response: "pressure",
          causeKind: "predator-pressure",
        });
    }

    // The capability relationship is narrow: the same wader does not become
    // a general-purpose pressure source for pre-Wave-C terrestrial aggregates.
    expect(resolveCoreEcologyAggregateLivingResponse("brown-rat", "snowy-egret"))
      .toBeNull();
    expect(resolveCoreEcologyAggregateLivingResponse(
      "southern-leopard-frog",
      "snowy-egret",
    )).toBeNull();
  });

  it("turns a lawfully visible egret into conserved avoidance for both tidal aggregates", () => {
    const current = fixture();
    const sourceBefore = structuredClone(current.egret);
    const frame = deriveCoreEcologySettlementShadowsStimulusFrame(input(current, [current.egret]));
    expect(frame).not.toBeNull();
    expect(deriveCoreEcologySettlementShadowsStimulusFrame(input(current, [current.egret])))
      .toEqual(frame);
    expect(current.egret).toEqual(sourceBefore);

    const tidalBefore = tidalPopulations(current.patch);
    const egretStimuli = frame?.stimuli.filter(({ sourceKind }) => sourceKind === "snowy-egret")
      ?? [];
    expect(egretStimuli.map(({ targetAggregateId }) => targetAggregateId).sort())
      .toEqual(tidalBefore.map(({ aggregateId }) => aggregateId).sort());
    expect(egretStimuli).toEqual(expect.arrayContaining([
      expect.objectContaining({ response: "pressure", channels: ["vision"] }),
      expect.objectContaining({ response: "pressure", channels: ["vision"] }),
    ]));

    const result = stepCoreEcologySmallWorld(current.patch, 0, frame);
    if (result === null) throw new Error("Lawful snowy-egret pressure was rejected");
    const egretEvents = result.events.filter(({ sourceKind }) => sourceKind === "snowy-egret");
    expect(egretEvents.map(({ targetSpecies }) => targetSpecies).sort()).toEqual([
      "atlantic-marsh-fiddler-crab",
      "atlantic-silverside",
    ]);
    expect(egretEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        version: 3,
        causeKind: "predator-pressure",
        mortality: "none",
        cargoInteraction: false,
        itemConsumption: "none",
        playerKnowledge: "none",
      }),
      expect.objectContaining({
        version: 3,
        causeKind: "predator-pressure",
        mortality: "none",
        cargoInteraction: false,
        itemConsumption: "none",
        playerKnowledge: "none",
      }),
    ]));

    for (const before of tidalBefore) {
      const after = result.patch.aggregatePopulations.find(({ aggregateId }) => (
        aggregateId === before.aggregateId
      ));
      expect(after?.populationSize).toBe(before.populationSize);
      expect(after?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
        .toBe(before.populationSize);
      expect(after?.anchors).not.toEqual(before.anchors);
      expect(after?.activitySignal.intensity)
        .toBeLessThanOrEqual(before.activitySignal.intensity);
    }
    expect(result.patch.populations).toEqual(current.patch.populations);
    expect(result.patch.groups).toEqual(current.patch.groups);
  });

  it("cannot pressure either aggregate when the egret is absent or outside lawful visual range", () => {
    const current = fixture();
    const absent = deriveCoreEcologySettlementShadowsStimulusFrame(input(current));
    expect(absent?.stimuli.some(({ sourceKind }) => sourceKind === "snowy-egret"))
      .toBe(false);

    const remoteEgret: CoreEcologyAggregateVisualSource = {
      ...current.egret,
      position: translateWorldPosition(
        current.egret.position,
        200 * WORLD_POSITION_UNITS_PER_TILE,
        0,
      ),
    };
    const unobserved = deriveCoreEcologySettlementShadowsStimulusFrame(
      input(current, [remoteEgret]),
    );
    expect(unobserved?.stimuli.some(({ sourceKind }) => sourceKind === "snowy-egret"))
      .toBe(false);

    for (const frame of [absent, unobserved]) {
      const result = stepCoreEcologySmallWorld(current.patch, 0, frame);
      if (result === null) throw new Error("Valid no-egret frame was rejected");
      expect(result.events.some(({ sourceKind }) => sourceKind === "snowy-egret"))
        .toBe(false);
      for (const before of tidalPopulations(current.patch)) {
        const after = result.patch.aggregatePopulations.find(({ aggregateId }) => (
          aggregateId === before.aggregateId
        ));
        expect(after?.populationSize).toBe(before.populationSize);
        expect(after?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
          .toBe(before.populationSize);
      }
      expect(result.events.every(({ cargoInteraction, itemConsumption, mortality }) => (
        cargoInteraction === false
        && itemConsumption === "none"
        && mortality === "none"
      ))).toBe(true);
    }
  });
});

function fixture(): Fixture {
  const state = createWorld(SEED_TEXT, "standard");
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
    rootSeed: state.meta.rootSeed,
    originRegion: ORIGIN,
    focus: { position: focusAt(ORIGIN), radiusTiles: 32 },
  });
  const patch = createCoreEcologyAggregatePatch({
    seed: state.meta.rootSeed,
    patchKey: "tidal-table:nonlethal-pressure",
    originRegion: ORIGIN,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v5", habitat },
  });
  const egretMember = patch.populations.find(({ species }) => species === "snowy-egret")
    ?.members[0];
  if (egretMember === undefined) throw new Error("Tidal pressure fixture requires one egret");
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center: ORIGIN }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  return {
    patch,
    world,
    window,
    egret: {
      sourceReferenceId: egretMember.actor.identity.stableId,
      sourceSpecies: "snowy-egret",
      position: egretMember.actor.address.position,
      movementSalience: FIXED_POINT,
    },
  };
}

function focusAt(region: RegionCoord) {
  return createWorldPosition(
    region,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function individualInputs(
  habitat: CoreEcologyTidalTableHabitatAssemblage,
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
): CoreEcologyAggregatePerceptionFrameInput {
  return {
    patch: current.patch,
    world: current.world,
    window: current.window,
    tick: current.patch.updatedAtTick,
    visualSources,
    exposedFoodSources: [],
  };
}

function tidalPopulations(patch: CoreEcologyAggregatePatchState) {
  const populations = patch.aggregatePopulations.filter(({ species }) => (
    species === "atlantic-silverside"
    || species === "atlantic-marsh-fiddler-crab"
  ));
  if (populations.length !== 2 || populations.some(({ anchors }) => anchors.length < 2)) {
    throw new Error("Tidal pressure fixture requires two movable tidal aggregates");
  }
  return populations;
}
