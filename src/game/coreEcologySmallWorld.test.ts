import { describe, expect, it } from "vitest";

import { createRegionCoord, REGION_COORD_LIMIT, type RegionCoord } from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS,
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
  canonicalizeCoreEcologySettlementShadowsStimulusFrame,
  stepCoreEcologySettlementShadows,
  type CoreEcologySettlementShadowsChannel,
  type CoreEcologySettlementShadowsResponse,
  type CoreEcologySettlementShadowsSourceKind,
  type CoreEcologySettlementShadowsStimulus,
  type CoreEcologySettlementShadowsStimulusFrame,
} from "./coreEcologySmallWorld";

const SEED = seedFromText("settlement shadows interaction");
const ORIGIN = createRegionCoord(-17, 23);

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

function fixture(
  tick = 0,
  origin: RegionCoord = ORIGIN,
  seed: RootSeed = SEED,
): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion: origin,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "wave-b:settlement-shadows",
    originRegion: origin,
    tick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
  const rats = patch.aggregatePopulations.find(({ species }) => species === "brown-rat");
  if (rats === undefined || rats.anchors.length < 2) {
    throw new Error("Settlement-shadows fixture requires two rat anchors");
  }
  return patch;
}

function stimulus(
  patch: CoreEcologyAggregatePatchState,
  sourceKind: CoreEcologySettlementShadowsSourceKind,
  sourceReferenceId: string,
  channels: readonly CoreEcologySettlementShadowsChannel[],
  response: CoreEcologySettlementShadowsResponse,
  strength = 720_000,
  stimulusId = `stimulus:${sourceKind}`,
): CoreEcologySettlementShadowsStimulus {
  const rats = patch.aggregatePopulations.find(({ species }) => species === "brown-rat");
  const from = rats?.anchors.find(({ populationUnits }) => populationUnits > 0);
  const to = rats?.anchors.find(({ anchorOrdinal }) => (
    anchorOrdinal !== from?.anchorOrdinal
  ));
  if (rats === undefined || from === undefined || to === undefined) {
    throw new Error("Settlement-shadows stimulus requires a movable rat unit");
  }
  return {
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    stimulusId,
    sourceReferenceId,
    sourceKind,
    response,
    targetAggregateId: rats.aggregateId,
    channels,
    anchorInfluences: response === "pressure"
      ? [
          { anchorOrdinal: from.anchorOrdinal, intensity: strength },
          { anchorOrdinal: to.anchorOrdinal, intensity: 0 },
        ]
      : [
          { anchorOrdinal: from.anchorOrdinal, intensity: 0 },
          { anchorOrdinal: to.anchorOrdinal, intensity: strength },
        ],
  };
}

function frame(
  atTick: number,
  stimuli: readonly CoreEcologySettlementShadowsStimulus[],
): CoreEcologySettlementShadowsStimulusFrame {
  return {
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    atTick,
    stimuli,
  };
}

describe("Settlement Shadows aggregate stimulus ecology", () => {
  it("uses bounded density spacing as the rat aggregate's same-species interaction", () => {
    let concentrated = fixture();
    const initialRats = concentrated.aggregatePopulations.find(({ species }) => (
      species === "brown-rat"
    ));
    if (initialRats === undefined || initialRats.populationSize < 2) {
      throw new Error("Same-species fixture requires a multi-unit rat population");
    }
    const target = initialRats.anchors[0];
    const donor = initialRats.anchors.find(({ anchorOrdinal, populationUnits }) => (
      anchorOrdinal !== target?.anchorOrdinal && populationUnits > 0
    ));
    if (target === undefined || donor === undefined) {
      throw new Error("Same-species fixture requires two occupied or transferable anchors");
    }
    const concentratedResult = displaceCoreEcologyAggregatePopulation(concentrated, {
      aggregateId: initialRats.aggregateId,
      atTick: 0,
      causeKind: "animal-disturbance",
      causeReferenceId: initialRats.aggregateId,
      fromAnchorOrdinal: donor.anchorOrdinal,
      toAnchorOrdinal: target.anchorOrdinal,
      populationUnits: donor.populationUnits,
      pressure: FIXED_POINT,
    });
    if (concentratedResult === null) throw new Error("Could not prepare crowded aggregate");
    concentrated = concentratedResult.patch;
    const before = concentrated.aggregatePopulations[0]!;
    const result = stepCoreEcologySettlementShadows(concentrated, 0, frame(0, []));
    if (result === null) throw new Error("Valid same-species aggregate step failed");

    expect(result.events).toEqual([expect.objectContaining({
      sourceKind: "same-species",
      sourceReferenceId: before.aggregateId,
      response: "pressure",
      causeKind: "animal-disturbance",
      channels: ["touch"],
      displacedUnits: 1,
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    })]);
    const after = result.patch.aggregatePopulations[0]!;
    expect(after.populationSize).toBe(before.populationSize);
    expect(after.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
      .toBe(before.populationSize);
    expect(Math.max(...after.anchors.map(({ populationUnits }) => populationUnits))
      - Math.min(...after.anchors.map(({ populationUnits }) => populationUnits)))
      .toBeLessThan(
        Math.max(...before.anchors.map(({ populationUnits }) => populationUnits))
          - Math.min(...before.anchors.map(({ populationUnits }) => populationUnits)),
      );
  });

  it("moves one rat unit from an authorized cat-pressure gradient without scanning actors", () => {
    const initial = fixture();
    const cat = initial.populations
      .find(({ species }) => species === "domestic-cat")
      ?.members[0]?.actor.identity.stableId ?? "CAT-authorized-fixture";
    const catStimulus = stimulus(
      initial,
      "cat",
      cat,
      ["scent", "hearing"],
      "pressure",
    );
    const result = stepCoreEcologySettlementShadows(initial, 0, frame(0, [catStimulus]));
    if (result === null) throw new Error("Valid settlement-shadows step failed");
    expect(result.events).toHaveLength(1);
    const event = result.events[0];
    expect(event).toMatchObject({
      kind: "aggregate-redistributed",
      atTick: 0,
      sourceReferenceId: cat,
      sourceKind: "cat",
      response: "pressure",
      causeKind: "predator-pressure",
      targetSpecies: "brown-rat",
      displacedUnits: 1,
      playerKnowledge: "none",
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    });
    expect(event?.channels).toEqual(["hearing", "scent"]);
    expect(result.patch.populations.some(({ species }) => species === "brown-rat")).toBe(false);
    expect(result.patch.populations.flatMap(({ members }) => members)
      .some(({ actor }) => actor.identity.stableId.startsWith("RAT-"))).toBe(false);

    const before = initial.aggregatePopulations[0];
    const after = result.patch.aggregatePopulations[0];
    expect(after?.populationSize).toBe(before?.populationSize);
    expect(after?.anchors.reduce((total, anchor) => total + anchor.populationUnits, 0))
      .toBe(before?.populationSize);
    expect(after?.disturbances.at(-1)).toMatchObject({
      causeKind: "predator-pressure",
      nonlethal: true,
      cargoInteraction: false,
      itemConsumption: "none",
    });
    expect(after?.evidence.at(-1)).toMatchObject({
      causeKind: "predator-pressure",
      disclosure: "direct-observation-required",
      itemConsumption: "none",
    });
  });

  it("uses one shared response contract for animal, human, weather, and food sources", () => {
    const cases: readonly Readonly<{
      sourceKind: CoreEcologySettlementShadowsSourceKind;
      sourceReferenceId: string;
      channels: readonly CoreEcologySettlementShadowsChannel[];
      response: CoreEcologySettlementShadowsResponse;
      causeKind: string;
    }>[] = [
      { sourceKind: "same-species", sourceReferenceId: "rat-area:1", channels: ["touch"], response: "pressure", causeKind: "animal-disturbance" },
      { sourceKind: "cat", sourceReferenceId: "CAT-1", channels: ["vision"], response: "pressure", causeKind: "predator-pressure" },
      { sourceKind: "dog", sourceReferenceId: "DOG-1", channels: ["scent"], response: "pressure", causeKind: "predator-pressure" },
      { sourceKind: "human", sourceReferenceId: "HUMAN-1", channels: ["hearing"], response: "pressure", causeKind: "human-disturbance" },
      { sourceKind: "gull", sourceReferenceId: "GULL-1", channels: ["vision"], response: "pressure", causeKind: "animal-disturbance" },
      { sourceKind: "rain", sourceReferenceId: "weather:rain-1", channels: ["touch"], response: "pressure", causeKind: "weather-pressure" },
      { sourceKind: "exposed-food", sourceReferenceId: "cargo:food-1", channels: ["scent"], response: "attraction", causeKind: "food-attraction" },
    ];

    for (const entry of cases) {
      const initial = fixture();
      const result = stepCoreEcologySettlementShadows(initial, 0, frame(0, [stimulus(
        initial,
        entry.sourceKind,
        entry.sourceReferenceId,
        entry.channels,
        entry.response,
      )]));
      if (result === null) throw new Error(`Valid ${entry.sourceKind} stimulus failed`);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        sourceKind: entry.sourceKind,
        sourceReferenceId: entry.sourceReferenceId,
        response: entry.response,
        causeKind: entry.causeKind,
        itemConsumption: "none",
      });
      const before = initial.aggregatePopulations[0];
      const after = result.patch.aggregatePopulations[0];
      expect(after?.populationSize).toBe(before?.populationSize);
      expect(after?.anchors.reduce((total, anchor) => total + anchor.populationUnits, 0))
        .toBe(before?.populationSize);
    }
  });

  it("accepts only coherent source/channel combinations and fails unknown anchors closed", () => {
    const initial = fixture();
    const valid = stimulus(initial, "rain", "weather:rain", ["touch"], "pressure");
    expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame(frame(0, [valid])))
      .toEqual(frame(0, [valid]));
    expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame(frame(0, [{
      ...valid,
      channels: ["scent"],
    }]))).toBeNull();
    expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame(frame(0, [{
      ...valid,
      response: "attraction",
    }]))).toBeNull();
    expect(stepCoreEcologySettlementShadows(initial, 0, frame(0, [{
      ...valid,
      anchorInfluences: [{ anchorOrdinal: 99, intensity: 500_000 }],
    }]))).toBeNull();
  });

  it("selects the strongest lawful gradient once, independent of input order", () => {
    const initial = fixture(CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS);
    const weakCat = stimulus(
      initial,
      "cat",
      "CAT-weak",
      ["vision"],
      "pressure",
      220_000,
      "stimulus:weak-cat",
    );
    const strongFood = stimulus(
      initial,
      "exposed-food",
      "cargo:food-strong",
      ["scent"],
      "attraction",
      820_000,
      "stimulus:strong-food",
    );
    const left = stepCoreEcologySettlementShadows(
      initial,
      CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS,
      frame(CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS, [weakCat, strongFood]),
    );
    const right = stepCoreEcologySettlementShadows(
      initial,
      CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS,
      frame(CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS, [strongFood, weakCat]),
    );
    expect(left).toEqual(right);
    expect(left?.events).toHaveLength(1);
    expect(left?.events[0]).toMatchObject({
      stimulusId: "stimulus:strong-food",
      sourceKind: "exposed-food",
      response: "attraction",
    });
    expect(serializeCoreEcologyAggregatePatch(left?.patch)).toBe(
      serializeCoreEcologyAggregatePatch(right?.patch),
    );
  });

  it("is cadence-bounded, rejects stale frames, and remains coordinate-agnostic", () => {
    const offCadence = fixture(1);
    const offCadenceStimulus = stimulus(
      offCadence,
      "human",
      "HUMAN-nearby",
      ["hearing"],
      "pressure",
    );
    expect(stepCoreEcologySettlementShadows(
      offCadence,
      1,
      frame(1, [offCadenceStimulus]),
    )).toEqual({ patch: offCadence, events: [] });
    expect(stepCoreEcologySettlementShadows(offCadence, 0, frame(0, []))).toBeNull();
    expect(stepCoreEcologySettlementShadows(offCadence, 1, frame(0, []))).toBeNull();
    expect(stepCoreEcologySettlementShadows(offCadence, 2, frame(2, []))).toBeNull();
    expect(stepCoreEcologySettlementShadows(offCadence, 1)).toEqual({
      patch: offCadence,
      events: [],
    });

    const extreme = fixture(
      0,
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      seedFromText("settlement shadows extreme coordinates"),
    );
    const extremeStimulus = stimulus(
      extreme,
      "dog",
      "DOG-extreme",
      ["scent"],
      "pressure",
    );
    const extremeResult = stepCoreEcologySettlementShadows(
      extreme,
      0,
      frame(0, [extremeStimulus]),
    );
    expect(extremeResult?.events).toHaveLength(1);
    expect(extremeResult?.patch.originRegion).toEqual({
      x: -REGION_COORD_LIMIT,
      y: REGION_COORD_LIMIT,
    });
  });
});
