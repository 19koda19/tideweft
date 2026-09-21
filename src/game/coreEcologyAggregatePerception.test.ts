import { describe, expect, it, vi } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { FIXED_POINT, type TerrainTileView, type WeatherKind, type WorldView } from "../sim/types";
import { WORLD_DAY_START_TICK, WORLD_NIGHT_START_TICK } from "../sim/worldTime";
import {
  CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_CANDIDATES,
  CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES,
  CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_SOURCES,
  CORE_ECOLOGY_AGGREGATE_MIN_VISUAL_STIMULI_PER_POPULATION,
  coreEcologyAggregateVisualStimulusBudget,
  deriveCoreEcologySettlementShadowsStimulusFrame,
  selectCoreEcologyAggregateExposedFoodSources,
  selectCoreEcologyAggregateVisualSources,
  withPreparedCoreEcologyAggregatePerceptionWorld,
  type CoreEcologyAggregateExposedFoodSource,
  type CoreEcologyAggregatePerceptionFrameInput,
  type CoreEcologyAggregateVisualSource,
} from "./coreEcologyAggregatePerception";
import * as coreEcologyPerception from "./coreEcologyPerception";
import * as outdoorIllumination from "./outdoorIllumination";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { deriveCoreEcologyAlpineHabitat } from "./coreEcologyAlpineHabitat";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI,
  stepCoreEcologySettlementShadows,
  type CoreEcologySettlementShadowsStimulus,
} from "./coreEcologySmallWorld";
import {
  CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS,
  CORE_ECOLOGY_AGGREGATE_SPECIES,
} from "./coreEcologyAggregatePolicy";
import {
  LOCAL_PLAYER_LIVING_ACTOR_ID,
  livingSpeciesRegistryEntry,
} from "./livingSpeciesRegistry";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createCoreEcologyAlpineResidentPatch } from "./regionalAlpineResidents";
import {
  createRegionalWorldView,
  regionalCompatibilityWorldForWorld,
} from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  translateWorldPosition,
  worldPositionToSpatialFrame,
  type WorldPosition,
} from "./worldPosition";
import {
  createSettlementEcologyState,
  projectSettlementFoodStoreSource,
  proposeSettlementRatAttraction,
  stageSettlementFoodLoss,
} from "./settlementEcology";

const TEST_DAYLIGHT_TICK = WORLD_DAY_START_TICK + 300;

export const ALPHA33_ALPINE_EAGLE_PIKA_EMERGENCE_OWNER_INTENT =
  "test:alpha33-alpine-eagle-pika-emergence:v1" as const;

const ORIGIN = createRegionCoord(-17, 23);
const SEED_TEXT = "settlement shadows interaction";

interface Fixture {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
}

describe("aggregate ecology shared-perception adapter", () => {
  it(`${ALPHA33_ALPINE_EAGLE_PIKA_EMERGENCE_OWNER_INTENT} lets a visible eagle pressure pika through shared LOS while an occluding ridge prevents it`, () => {
    const clear = alpineFixture();
    const pika = clear.patch.aggregatePopulations.find(({ species }) => (
      species === "american-pika"
    ));
    const eagle = clear.patch.populations.find(({ species }) => species === "golden-eagle")
      ?.members[0]?.actor;
    const occupied = pika?.anchors.find(({ populationUnits }) => populationUnits > 0);
    if (pika === undefined || eagle === undefined || occupied === undefined) {
      throw new Error("Alpine perception fixture requires pika and one eagle");
    }
    const sourcePosition = translateWorldPosition(
      occupied.position,
      2 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const source: CoreEcologyAggregateVisualSource = {
      sourceReferenceId: eagle.identity.stableId,
      sourceSpecies: "golden-eagle",
      position: sourcePosition,
      movementSalience: FIXED_POINT,
    };
    for (const offset of [0, 1, 2]) {
      setTile(clear, translateWorldPosition(
        occupied.position,
        offset * WORLD_POSITION_UNITS_PER_TILE,
        0,
      ), { terrain: "meadow", elevation: 0, roughness: 0 });
    }
    const visible = deriveCoreEcologySettlementShadowsStimulusFrame(input(clear, [source]));
    const pressure = visible?.stimuli.find(({ sourceKind, targetAggregateId }) => (
      sourceKind === "golden-eagle" && targetAggregateId === pika.aggregateId
    ));
    expect(influenceAt(pressure, occupied.anchorOrdinal)).toBeGreaterThan(0);

    const resolved = stepCoreEcologySettlementShadows(
      clear.patch,
      clear.patch.updatedAtTick,
      visible,
    );
    const pikaAfter = resolved?.patch.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === pika.aggregateId
    ));
    expect(resolved?.events.find(({ sourceKind, targetSpecies }) => (
      sourceKind === "golden-eagle" && targetSpecies === "american-pika"
    ))).toMatchObject({
      causeKind: "predator-pressure",
      mortality: "none",
      targetSpecies: "american-pika",
    });
    expect(pikaAfter?.populationSize).toBe(pika.populationSize);
    expect(pikaAfter?.activitySignal.intensity).toBeLessThan(pika.activitySignal.intensity);

    const blocked = alpineFixture();
    for (const offset of [0, 2]) {
      setTile(blocked, translateWorldPosition(
        occupied.position,
        offset * WORLD_POSITION_UNITS_PER_TILE,
        0,
      ), { terrain: "meadow", elevation: 0, roughness: 0 });
    }
    setTile(blocked, translateWorldPosition(
      occupied.position,
      WORLD_POSITION_UNITS_PER_TILE,
      0,
    ), { terrain: "ridge", elevation: FIXED_POINT, roughness: 0 });
    const hidden = deriveCoreEcologySettlementShadowsStimulusFrame(input(blocked, [source]));
    const hiddenPressure = hidden?.stimuli.find(({ sourceKind, targetAggregateId }) => (
      sourceKind === "golden-eagle" && targetAggregateId === pika.aggregateId
    ));
    expect(influenceAt(hiddenPressure, occupied.anchorOrdinal)).toBe(0);
  });

  it("shares a deterministic visual budget as the lawful roster grows", () => {
    expect(CORE_ECOLOGY_AGGREGATE_MIN_VISUAL_STIMULI_PER_POPULATION).toBeGreaterThan(0);
    for (let count = 1; count <= CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS; count += 1) {
      const budget = coreEcologyAggregateVisualStimulusBudget(count);
      expect(budget).toBeGreaterThanOrEqual(
        CORE_ECOLOGY_AGGREGATE_MIN_VISUAL_STIMULI_PER_POPULATION,
      );
      expect(count * (budget + 2))
        .toBeLessThanOrEqual(CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI);
    }
    // The candidate roster may grow beyond the fixed hot-frame ceiling. The
    // deterministic selector is deliberately bounded instead of scaling one
    // loaded frame with every lawful source kind in the catalog.
    expect(CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES).toBe(32);
    expect(CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES)
      .toBeLessThanOrEqual(CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS.length);
    expect(coreEcologyAggregateVisualStimulusBudget(CORE_ECOLOGY_AGGREGATE_SPECIES.length))
      .toBeLessThanOrEqual(CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS.length);
  });

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
      sourceSpecies: "domestic-cat",
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

  it("prepares shared immutable world inputs once while preserving scalar bytes and source order", () => {
    const current = fixture("rain", 650_000, true);
    const anchor = ratPopulation(current.patch).anchors[0]!;
    const cat: CoreEcologyAggregateVisualSource = {
      sourceReferenceId: "CAT-prepared-batch",
      sourceSpecies: "domestic-cat",
      position: anchor.position,
      movementSalience: FIXED_POINT,
    };
    const dog: CoreEcologyAggregateVisualSource = {
      sourceReferenceId: "D-prepared-batch",
      sourceSpecies: "domestic-dog",
      position: anchor.position,
      movementSalience: FIXED_POINT,
    };
    const food: CoreEcologyAggregateExposedFoodSource = {
      sourceReferenceId: "food:prepared-batch",
      position: anchor.position,
      sourceStrength: FIXED_POINT,
      packagingLeakage: FIXED_POINT,
    };
    const forwardInput = input(current, [cat, dog], [food]);
    const reverseInput = input(current, [dog, cat], [food]);
    const scalar = deriveCoreEcologySettlementShadowsStimulusFrame(forwardInput);
    expect(deriveCoreEcologySettlementShadowsStimulusFrame(reverseInput)).toEqual(scalar);
    if (scalar === null) throw new Error("Prepared-batch fixture failed its scalar path");

    const perceptionCells = vi.spyOn(coreEcologyPerception, "coreEcologyPerceptionCells");
    const illumination = vi.spyOn(outdoorIllumination, "buildOutdoorIlluminationField");
    const escaped: {
      derive?: typeof deriveCoreEcologySettlementShadowsStimulusFrame;
    } = {};
    try {
      const prepared = withPreparedCoreEcologyAggregatePerceptionWorld({
        world: current.world,
        window: current.window,
        tick: current.patch.updatedAtTick,
      }, (derive) => {
        escaped.derive = derive;
        return [
          derive(forwardInput),
          derive(reverseInput),
          derive({ ...forwardInput, patch: structuredClone(current.patch) }),
        ] as const;
      });

      expect(prepared).not.toBeNull();
      expect(prepared?.every((frame) => JSON.stringify(frame) === JSON.stringify(scalar)))
        .toBe(true);
      expect(perceptionCells).toHaveBeenCalledTimes(1);
      expect(illumination).toHaveBeenCalledTimes(1);
    } finally {
      perceptionCells.mockRestore();
      illumination.mockRestore();
    }
    expect(escaped.derive).toBeDefined();
    expect(escaped.derive?.(forwardInput)).toBeNull();
  });

  it("preserves scalar bytes with an active physical beacon at night", () => {
    const current = nightBeaconFixture();
    const cells = coreEcologyPerception.coreEcologyPerceptionCells(current.world);
    const illumination = cells === null
      ? null
      : outdoorIllumination.buildOutdoorIlluminationField(current.world, cells);
    expect(Math.max(...(illumination?.localIllumination ?? []))).toBeGreaterThan(0);
    const anchor = ratPopulation(current.patch).anchors[0]!;
    const source: CoreEcologyAggregateVisualSource = {
      sourceReferenceId: "CAT-night-beacon-parity",
      sourceSpecies: "domestic-cat",
      position: anchor.position,
      movementSalience: FIXED_POINT,
    };
    const frameInput = input(current, [source]);
    const scalar = deriveCoreEcologySettlementShadowsStimulusFrame(frameInput);
    if (scalar === null) throw new Error("Night-beacon fixture failed its scalar path");
    const prepared = withPreparedCoreEcologyAggregatePerceptionWorld({
      world: current.world,
      window: current.window,
      tick: current.patch.updatedAtTick,
    }, (derive) => derive(frameInput));

    expect(JSON.stringify(prepared)).toBe(JSON.stringify(scalar));
  });

  it("rejects mutable, cloned, substituted, mismatched, and malformed prepared batches", () => {
    const current = fixture("clear", 0, true);
    const normalInput = input(current);
    const scalar = deriveCoreEcologySettlementShadowsStimulusFrame(normalInput);
    expect(scalar).not.toBeNull();
    const run = vi.fn(() => true as const);

    expect(withPreparedCoreEcologyAggregatePerceptionWorld({
      world: structuredClone(current.world),
      window: current.window,
      tick: current.patch.updatedAtTick,
    }, run)).toBeNull();
    expect(withPreparedCoreEcologyAggregatePerceptionWorld({
      world: current.world,
      window: freezeRecursively(structuredClone(current.window)),
      tick: current.patch.updatedAtTick,
    }, run)).toBeNull();
    expect(withPreparedCoreEcologyAggregatePerceptionWorld({
      world: current.world,
      window: current.window,
      tick: current.patch.updatedAtTick + 1,
    }, run)).toBeNull();
    expect(withPreparedCoreEcologyAggregatePerceptionWorld({
      world: current.world,
      window: current.window,
      tick: current.patch.updatedAtTick,
      extra: true,
    }, run)).toBeNull();
    expect(withPreparedCoreEcologyAggregatePerceptionWorld(new Proxy({}, {
      ownKeys: () => {
        throw new Error("malformed batch keys");
      },
    }), run)).toBeNull();
    expect(run).not.toHaveBeenCalled();

    const mutableWorld = fixture();
    expect(withPreparedCoreEcologyAggregatePerceptionWorld({
      world: mutableWorld.world,
      window: mutableWorld.window,
      tick: mutableWorld.patch.updatedAtTick,
    }, run)).toBeNull();
    expect(deriveCoreEcologySettlementShadowsStimulusFrame(input(mutableWorld))).not.toBeNull();

    const mutableWindow = fixture("clear", 0, true, true);
    expect(withPreparedCoreEcologyAggregatePerceptionWorld({
      world: mutableWindow.world,
      window: mutableWindow.window,
      tick: mutableWindow.patch.updatedAtTick,
    }, run)).toBeNull();
    expect(deriveCoreEcologySettlementShadowsStimulusFrame(input(mutableWindow))).not.toBeNull();

    const accessorWindow = fixture("clear", 0, true, false, true);
    expect(Object.getOwnPropertyDescriptor(accessorWindow.window, "addresses")?.get)
      .toBeTypeOf("function");
    expect(withPreparedCoreEcologyAggregatePerceptionWorld({
      world: accessorWindow.world,
      window: accessorWindow.window,
      tick: accessorWindow.patch.updatedAtTick,
    }, run)).toBeNull();
    expect(deriveCoreEcologySettlementShadowsStimulusFrame(input(accessorWindow))).not.toBeNull();

    const substitute = fixture("clear", 0, true);
    const inside = withPreparedCoreEcologyAggregatePerceptionWorld({
      world: current.world,
      window: current.window,
      tick: current.patch.updatedAtTick,
    }, (derive) => ({
      baseline: derive(normalInput),
      clonedWorld: derive({ ...normalInput, world: structuredClone(current.world) }),
      hostile: derive(new Proxy(normalInput, {
        ownKeys: () => {
          throw new Error("malformed derive keys");
        },
      })),
      malformed: derive({ ...normalInput, extra: true }),
      substitutedWindow: derive({ ...normalInput, window: substitute.window }),
      wrongTick: derive({ ...normalInput, tick: current.patch.updatedAtTick + 1 }),
    }));
    expect(inside).toEqual({
      baseline: scalar,
      clonedWorld: null,
      hostile: null,
      malformed: null,
      substitutedWindow: null,
      wrongTick: null,
    });
  });

  it("rejects nested weather or settlement-light mutation during a prepared batch", () => {
    const current = fixture("clear", 0, true);
    const normalInput = input(current);
    const scalar = deriveCoreEcologySettlementShadowsStimulusFrame(normalInput);
    if (scalar === null) throw new Error("Mutable-light fixture failed its scalar path");
    const compatibility = regionalCompatibilityWorldForWorld(current.world);
    const settlement = compatibility?.settlements[0];
    if (settlement === undefined) throw new Error("Mutable-light fixture has no settlement");
    const originalWeather = { ...current.world.weather };
    const originalProject = {
      kind: settlement.project.kind,
      status: settlement.project.status,
    };
    const originalWeatherPrototype = Object.getPrototypeOf(current.world.weather);
    const weatherSymbol = Symbol("prepared-weather-mutation");
    const projectSymbol = Symbol("prepared-project-mutation");

    const result = withPreparedCoreEcologyAggregatePerceptionWorld({
      world: current.world,
      window: current.window,
      tick: current.patch.updatedAtTick,
    }, (derive) => {
      const baseline = derive(normalInput);
      Object.assign(current.world.weather, {
        kind: "rain",
        intensity: 500_000,
        windX: 100_000,
        windY: -50_000,
        nextChangeTick: current.world.weather.nextChangeTick + 1,
      });
      const changedWeather = derive(normalInput);
      Object.assign(current.world.weather, originalWeather);
      Object.defineProperty(current.world.weather, weatherSymbol, {
        configurable: true,
        value: true,
      });
      const changedWeatherSymbol = derive(normalInput);
      delete (current.world.weather as Record<PropertyKey, unknown>)[weatherSymbol];
      Object.setPrototypeOf(current.world.weather, { hostile: true });
      const changedWeatherPrototype = derive(normalInput);
      Object.setPrototypeOf(current.world.weather, originalWeatherPrototype);
      Object.assign(settlement.project, { kind: "beacon", status: "complete" });
      const changedSettlementLight = derive(normalInput);
      Object.assign(settlement.project, originalProject);
      Object.assign(settlement, { preparedShapeMutation: true });
      const changedSettlementShape = derive(normalInput);
      delete (settlement as unknown as Record<string, unknown>).preparedShapeMutation;
      Object.defineProperty(settlement.project, projectSymbol, {
        configurable: true,
        value: true,
      });
      const changedProjectShape = derive(normalInput);
      delete (settlement.project as Record<PropertyKey, unknown>)[projectSymbol];
      const restored = derive(normalInput);
      return {
        baseline,
        changedProjectShape,
        changedSettlementLight,
        changedSettlementShape,
        changedWeather,
        changedWeatherPrototype,
        changedWeatherSymbol,
        restored,
      };
    });

    expect(result).toEqual({
      baseline: scalar,
      changedProjectShape: null,
      changedSettlementLight: null,
      changedSettlementShape: null,
      changedWeather: null,
      changedWeatherPrototype: null,
      changedWeatherSymbol: null,
      restored: scalar,
    });
  });

  it("discards post-run prepared staging before one fresh scalar fallback", () => {
    const current = fixture("clear", 0, true);
    const normalInput = input(current);
    const scalar = deriveCoreEcologySettlementShadowsStimulusFrame(normalInput);
    if (scalar === null) throw new Error("Staged-fallback fixture failed its scalar path");
    const mutation = Symbol("post-run-weather-mutation");
    let stagedCount = 0;
    let prepared: readonly (typeof scalar | null)[] | null = null;
    try {
      prepared = withPreparedCoreEcologyAggregatePerceptionWorld({
        world: current.world,
        window: current.window,
        tick: current.patch.updatedAtTick,
      }, (derive) => {
        const staged = [derive(normalInput), derive(normalInput)] as const;
        stagedCount = staged.length;
        Object.defineProperty(current.world.weather, mutation, {
          configurable: true,
          value: true,
        });
        return staged;
      });
      expect(prepared).toBeNull();
    } finally {
      delete (current.world.weather as Record<PropertyKey, unknown>)[mutation];
    }
    const adopted = prepared ?? [deriveCoreEcologySettlementShadowsStimulusFrame(normalInput)];
    expect(stagedCount).toBe(2);
    expect(adopted).toHaveLength(1);
    expect(JSON.stringify(adopted[0])).toBe(JSON.stringify(scalar));
  });

  it("revokes a prepared derive closure even when its synchronous owner throws", () => {
    const current = fixture("clear", 0, true);
    const normalInput = input(current);
    const escaped: {
      derive?: typeof deriveCoreEcologySettlementShadowsStimulusFrame;
    } = {};
    expect(() => withPreparedCoreEcologyAggregatePerceptionWorld({
      world: current.world,
      window: current.window,
      tick: current.patch.updatedAtTick,
    }, (derive) => {
      escaped.derive = derive;
      expect(derive(normalInput)).not.toBeNull();
      throw new Error("stop prepared batch");
    })).toThrow("stop prepared batch");
    expect(escaped.derive).toBeDefined();
    expect(escaped.derive?.(normalInput)).toBeNull();
  });

  it("binds every visual source ID to its canonical species namespace", () => {
    const current = fixture();
    const anchor = ratPopulation(current.patch).anchors[0]!;
    expect(deriveCoreEcologySettlementShadowsStimulusFrame(input(current, [{
      sourceReferenceId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      sourceSpecies: "human",
      position: anchor.position,
      movementSalience: FIXED_POINT,
    }]))).not.toBeNull();
    expect(deriveCoreEcologySettlementShadowsStimulusFrame(input(current, [{
      sourceReferenceId: "RABBIT-wrongly-labeled-as-fox",
      sourceSpecies: "marsh-fox",
      position: anchor.position,
      movementSalience: FIXED_POINT,
    }]))).toBeNull();
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

  it("composes an open store and visible cat pressure through one bounded rat resolver", () => {
    const current = fixture();
    const ratsBefore = ratPopulation(current.patch);
    const catAnchor = ratsBefore.anchors.find(({ populationUnits }) => populationUnits > 0);
    const storeAnchor = ratsBefore.anchors.find(({ anchorOrdinal }) => (
      anchorOrdinal !== catAnchor?.anchorOrdinal
    ));
    if (catAnchor === undefined || storeAnchor === undefined) {
      throw new Error("Store/cat composition fixture requires two rat anchors");
    }
    const store = createSettlementEcologyState({
      rootSeed: seedFromText(SEED_TEXT),
      settlementId: 23,
      keeperActorId: "H-v1-alpha23-composition-keeper",
      position: storeAnchor.position,
      aggregatePatch: current.patch,
    });
    const projectedStore = projectSettlementFoodStoreSource(store);
    if (projectedStore === null) throw new Error("Open store did not project physical food");
    const cat: CoreEcologyAggregateVisualSource = {
      sourceReferenceId: "CAT-v1-alpha23-composition",
      sourceSpecies: "domestic-cat",
      position: catAnchor.position,
      movementSalience: FIXED_POINT,
    };

    const frame = deriveCoreEcologySettlementShadowsStimulusFrame(
      input(current, [cat], [projectedStore.source]),
    );
    const ratStimuli = frame?.stimuli.filter(({ targetAggregateId }) => (
      targetAggregateId === ratsBefore.aggregateId
    ));
    expect(ratStimuli).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKind: "cat",
        sourceReferenceId: cat.sourceReferenceId,
        response: "pressure",
        channels: ["vision"],
      }),
      expect.objectContaining({
        sourceKind: "exposed-food",
        sourceReferenceId: store.identity.foodLotId,
        response: "attraction",
        channels: ["scent"],
      }),
    ]));
    const attraction = proposeSettlementRatAttraction(store, current.patch, frame);
    expect(attraction).not.toBeNull();

    const first = stepCoreEcologySettlementShadows(
      current.patch,
      current.patch.updatedAtTick,
      frame,
    );
    const replay = stepCoreEcologySettlementShadows(
      current.patch,
      current.patch.updatedAtTick,
      frame,
    );
    expect(replay).toEqual(first);
    if (first === null || attraction === null) {
      throw new Error("Shared rat resolver rejected the composed frame");
    }
    const ratEvents = first.events.filter(({ aggregateId }) => aggregateId === ratsBefore.aggregateId);
    expect(ratEvents).toHaveLength(1);
    expect(ratEvents[0]).toMatchObject({
      sourceKind: "cat",
      sourceReferenceId: cat.sourceReferenceId,
      displacedUnits: 1,
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    });
    const ratsAfter = ratPopulation(first.patch);
    expect(ratsAfter.populationSize).toBe(ratsBefore.populationSize);
    expect(ratsAfter.anchors.reduce((sum, { populationUnits }) => sum + populationUnits, 0))
      .toBe(ratsBefore.populationSize);

    // Cat pressure won the shared deterministic arbitration. Its event cannot
    // authenticate a store-food loss, so the sole physical lot stays exact.
    expect(stageSettlementFoodLoss(store, attraction, first.patch, ratEvents[0])).toBeNull();
    expect(projectSettlementFoodStoreSource(store)).toEqual(projectedStore);
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
    const visualSources = (["domestic-cat", "domestic-dog", "human", "gull"] as const).flatMap(
      (sourceSpecies) => {
        const prefix = livingSpeciesRegistryEntry(sourceSpecies)?.actorIdPrefix;
        if (prefix === undefined) throw new Error(`Missing ${sourceSpecies} registry prefix`);
        return ["b", "a"].map((suffix) => ({
          sourceReferenceId: `${prefix}aggregate-${suffix}`,
          sourceSpecies,
          position: anchor.position,
          movementSalience: FIXED_POINT,
        }));
      },
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
    expect(forward?.stimuli.map(({ sourceReferenceId }) => sourceReferenceId))
      .toContain("CAT-aggregate-a");
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

  it("selects dense visual candidates by exact spatial relevance independent of input order", () => {
    const current = fixture();
    const anchor = ratPopulation(current.patch).anchors[0]!;
    const sources = Array.from({ length: 48 }, (_, index) => ({
      sourceReferenceId: `DEER-dense-${index.toString(36).padStart(2, "0")}`,
      sourceSpecies: "deer" as const,
      position: translateWorldPosition(
        anchor.position,
        (index + 1) * WORLD_POSITION_UNITS_PER_TILE,
        0,
      ),
      movementSalience: index === 0 ? 0 : FIXED_POINT,
    } satisfies CoreEcologyAggregateVisualSource));
    const sameDistanceMoving = {
      ...sources[0]!,
      sourceReferenceId: "DEER-dense-moving",
      movementSalience: FIXED_POINT,
    } satisfies CoreEcologyAggregateVisualSource;
    const candidates = [...sources, sameDistanceMoving];
    const selected = selectCoreEcologyAggregateVisualSources(current.patch, candidates);
    const reversed = selectCoreEcologyAggregateVisualSources(
      current.patch,
      [...candidates].reverse(),
    );

    expect(reversed).toEqual(selected);
    expect(selected).toHaveLength(CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES);
    expect(selected?.[0]?.sourceReferenceId).toBe("DEER-dense-moving");
    expect(selected?.some(({ sourceReferenceId }) => sourceReferenceId === "DEER-dense-1b"))
      .toBe(false);
    expect(selectCoreEcologyAggregateVisualSources(
      current.patch,
      Array.from(
        { length: CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_CANDIDATES + 1 },
        (_, index) => ({
          ...sources[index % sources.length]!,
          sourceReferenceId: `DEER-overflow-${index.toString(36)}`,
        }),
      ),
    )).toBeNull();
  });

  it("keeps frog rain activity separate from rat food and nocturnal pressure", () => {
    const current = rainChorusFixture();
    const frogs = current.patch.aggregatePopulations.find(
      ({ species }) => species === "southern-leopard-frog",
    );
    const rats = ratPopulation(current.patch);
    const frogAnchor = frogs?.anchors[0];
    if (frogs === undefined || frogAnchor === undefined) {
      throw new Error("Rain-chorus fixture requires a frog population area");
    }
    const food: CoreEcologyAggregateExposedFoodSource = {
      sourceReferenceId: "food:beside-frogs",
      position: frogAnchor.position,
      sourceStrength: FIXED_POINT,
      packagingLeakage: FIXED_POINT,
    };
    const harrier: CoreEcologyAggregateVisualSource = {
      sourceReferenceId: "HARRIER-v1-frog-quieting",
      sourceSpecies: "northern-harrier",
      position: frogAnchor.position,
      movementSalience: FIXED_POINT,
    };
    const frame = deriveCoreEcologySettlementShadowsStimulusFrame(
      input(current, [harrier], [food]),
    );

    expect(frame).not.toBeNull();
    expect(frame?.stimuli.some(({ sourceKind, targetAggregateId }) => (
      sourceKind === "exposed-food" && targetAggregateId === frogs.aggregateId
    ))).toBe(false);
    expect(frame?.stimuli.find(({ sourceKind, targetAggregateId }) => (
      sourceKind === "rain" && targetAggregateId === frogs.aggregateId
    ))).toMatchObject({ response: "attraction" });
    expect(frame?.stimuli.find(({ sourceKind, targetAggregateId }) => (
      sourceKind === "rain" && targetAggregateId === rats.aggregateId
    ))).toMatchObject({ response: "pressure" });
    expect(frame?.stimuli.find(({ sourceKind, targetAggregateId }) => (
      sourceKind === "northern-harrier" && targetAggregateId === frogs.aggregateId
    ))).toMatchObject({ response: "pressure", channels: ["vision"] });
    expect(frame?.stimuli.some(({ sourceKind, targetAggregateId }) => (
      sourceKind === "northern-harrier" && targetAggregateId === rats.aggregateId
    ))).toBe(false);
    expect(frogs.activitySignal).toMatchObject({
      kind: "rain-chorus",
      activePeriod: "rain-responsive",
    });
    expect(rats.activitySignal).toMatchObject({
      kind: "rustle-scratch",
      activePeriod: "nocturnal",
    });
  });

  it("lets fox pressure cross the shared role bridge while nearby rabbit presence stays neutral", () => {
    const current = rainChorusFixture();
    Object.assign(current.world.weather, { kind: "clear", intensity: 0 });
    const rats = ratPopulation(current.patch);
    const frogs = current.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    const occupiedRat = rats.anchors.find(({ populationUnits }) => populationUnits > 0);
    const occupiedFrog = frogs?.anchors.find(({ populationUnits }) => populationUnits > 0);
    if (frogs === undefined || frogs.anchors.length < 2 || occupiedRat === undefined || occupiedFrog === undefined) {
      throw new Error("Role-bridge fixture requires movable rat and frog aggregates");
    }
    const foxes: readonly CoreEcologyAggregateVisualSource[] = [
      {
        sourceReferenceId: "FOX-role-pressure-rat",
        sourceSpecies: "marsh-fox",
        position: occupiedRat.position,
        movementSalience: FIXED_POINT,
      },
      {
        sourceReferenceId: "FOX-role-pressure-frog",
        sourceSpecies: "marsh-fox",
        position: occupiedFrog.position,
        movementSalience: FIXED_POINT,
      },
    ];
    const rabbits: readonly CoreEcologyAggregateVisualSource[] = [
      {
        sourceReferenceId: "RABBIT-neutral-rat",
        sourceSpecies: "marsh-rabbit",
        position: occupiedRat.position,
        movementSalience: FIXED_POINT,
      },
      {
        sourceReferenceId: "RABBIT-neutral-frog",
        sourceSpecies: "marsh-rabbit",
        position: occupiedFrog.position,
        movementSalience: FIXED_POINT,
      },
    ];
    const baseline = deriveCoreEcologySettlementShadowsStimulusFrame(input(current));
    const rabbitFrame = deriveCoreEcologySettlementShadowsStimulusFrame(
      input(current, rabbits),
    );
    const foxFrame = deriveCoreEcologySettlementShadowsStimulusFrame(input(current, foxes));

    expect(rabbitFrame).toEqual(baseline);
    expect(foxFrame?.stimuli.filter(({ sourceKind }) => sourceKind === "marsh-fox"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          targetAggregateId: rats.aggregateId,
          response: "pressure",
          channels: ["vision"],
        }),
        expect.objectContaining({
          targetAggregateId: frogs.aggregateId,
          response: "pressure",
          channels: ["vision"],
        }),
      ]));
    expect(JSON.stringify(foxFrame)).not.toContain("marsh-rabbit");

    const result = stepCoreEcologySettlementShadows(
      current.patch,
      current.patch.updatedAtTick,
      foxFrame,
    );
    if (result === null) throw new Error("Canonical fox aggregate pressure was rejected");
    expect(result.events.filter(({ sourceKind }) => sourceKind === "marsh-fox"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          version: 3,
          targetSpecies: "brown-rat",
          mortality: "none",
        }),
        expect.objectContaining({
          version: 3,
          targetSpecies: "southern-leopard-frog",
          causeKind: "predator-pressure",
          mortality: "none",
        }),
      ]));
    const afterFrogs = result.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    expect(afterFrogs?.activitySignal.intensity).toBeLessThan(
      frogs.activitySignal.intensity,
    );
    for (const before of [rats, frogs]) {
      const after = result.patch.aggregatePopulations.find(({ aggregateId }) => (
        aggregateId === before.aggregateId
      ));
      expect(after?.populationSize).toBe(before.populationSize);
      expect(after?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
        .toBe(before.populationSize);
    }
  });
});

function fixture(
  weatherKind: WeatherKind = "clear",
  weatherIntensity = 0,
  immutableWorld = false,
  mutableWindow = false,
  accessorWindow = false,
): Fixture {
  const state = createWorld(SEED_TEXT, "standard");
  state.meta.completedTick = TEST_DAYLIGHT_TICK;
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
    tick: state.meta.completedTick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
  const anchor = ratPopulation(patch).anchors[0]!;
  const generatedWindow = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center: ORIGIN }),
    regionalFrameOriginAtAddress({
      region: anchor.position.region,
      localX: Math.floor(anchor.position.localX / WORLD_POSITION_UNITS_PER_TILE),
      localY: Math.floor(anchor.position.localY / WORLD_POSITION_UNITS_PER_TILE),
    }),
  );
  const window: RegionalTerrainWindow = accessorWindow
    ? Object.freeze({
        center: generatedWindow.center,
        origin: generatedWindow.origin,
        terrain: generatedWindow.terrain,
        get addresses() {
          return generatedWindow.addresses;
        },
      })
    : mutableWindow
      ? { ...generatedWindow }
      : generatedWindow;
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
    immutableWorld ? { immutable: true } : {},
  );
  return { patch, world, window };
}

function nightBeaconFixture(): Fixture {
  const origin = createRegionCoord(0, 0);
  const state = createWorld("prepared aggregate night beacon", "standard");
  state.meta.completedTick = WORLD_NIGHT_START_TICK + 60;
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: state.meta.rootSeed,
    originRegion: origin,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed: state.meta.rootSeed,
    patchKey: "prepared-aggregate:night-beacon",
    originRegion: origin,
    tick: state.meta.completedTick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
  const anchor = ratPopulation(patch).anchors[0]!;
  const settlement = state.settlements[0];
  if (settlement === undefined) throw new Error("Night-beacon fixture has no settlement");
  const anchorX = Math.floor(anchor.position.localX / WORLD_POSITION_UNITS_PER_TILE);
  const anchorY = Math.floor(anchor.position.localY / WORLD_POSITION_UNITS_PER_TILE);
  settlement.tileIndex = anchorY * state.terrain.width + anchorX;
  settlement.project = {
    ...settlement.project,
    kind: "beacon",
    status: "complete",
    progress: settlement.project.target,
  };
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center: origin }),
    regionalFrameOriginAtAddress({
      region: anchor.position.region,
      localX: anchorX,
      localY: anchorY,
    }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
    { immutable: true },
  );
  return { patch, world, window };
}

function alpineFixture(): Fixture {
  const state = createWorld("alpine resident property", "standard");
  state.meta.completedTick = TEST_DAYLIGHT_TICK;
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  const region = createRegionCoord(-1, 0);
  const habitat = deriveCoreEcologyAlpineHabitat({
    seed: state.meta.rootSeed,
    region,
  });
  const patch = createCoreEcologyAlpineResidentPatch({
    seed: state.meta.rootSeed,
    habitat,
    tick: state.meta.completedTick,
  });
  const anchor = patch.aggregatePopulations.find(({ species }) => (
    species === "american-pika"
  ))?.anchors.find(({ populationUnits }) => populationUnits > 0);
  if (anchor === undefined) throw new Error("Alpine perception fixture has no occupied pika talus");
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center: region }),
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

function rainChorusFixture(): Fixture {
  const state = createWorld(SEED_TEXT, "standard");
  state.meta.completedTick = TEST_DAYLIGHT_TICK;
  state.weather = {
    ...state.weather,
    kind: "rain",
    intensity: 900_000,
    windX: 0,
    windY: 0,
  };
  const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: state.meta.rootSeed,
    originRegion: ORIGIN,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed: state.meta.rootSeed,
    patchKey: "wave-b:rain-chorus-perception",
    originRegion: ORIGIN,
    tick: state.meta.completedTick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v4", habitat },
  });
  if (patch.aggregatePopulations.flatMap(({ anchors }) => anchors).length === 0) {
    throw new Error("Rain-chorus fixture has no aggregate anchor");
  }
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center: ORIGIN }),
  );
  const world = createRegionalWorldView(
    createWorldView(state),
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  return { patch, world, window };
}

function individualInputs(
  habitat: CoreEcologyHarborEdgeHabitatAssemblage | CoreEcologyRainChorusHabitatAssemblage,
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

function freezeRecursively<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freezeRecursively(nested);
    }
    Object.freeze(value);
  }
  return value;
}
