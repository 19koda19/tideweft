import { describe, expect, it } from "vitest";

import { createRegionCoord, REGION_COORD_LIMIT, type RegionCoord } from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  setCoreEcologyAggregateActivityIntensity,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyTidalWebHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyTidalWebHabitatAssemblage,
} from "./coreEcologyHabitat";
import { resolveCoreEcologyAggregateActivityIntensity } from "./coreEcologyAggregatePolicy";
import {
  CORE_ECOLOGY_SMALL_WORLD_VERSION,
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS,
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION,
  canonicalizeCoreEcologySettlementShadowsStimulusFrame,
  stepCoreEcologySettlementShadows,
  type CoreEcologySettlementShadowsChannel,
  type CoreEcologySettlementShadowsResponse,
  type CoreEcologySettlementShadowsSourceKind,
  type CoreEcologySettlementShadowsStimulus,
  type CoreEcologySettlementShadowsStimulusFrame,
} from "./coreEcologySmallWorld";
import { projectCoreEcologyTidalTable } from "./coreEcologyTidalTable";

const SEED = seedFromText("settlement shadows interaction");
const ORIGIN = createRegionCoord(-17, 23);

function individualInputs(
  habitat:
    | CoreEcologyHarborEdgeHabitatAssemblage
    | CoreEcologyRainChorusHabitatAssemblage
    | CoreEcologyTidalWebHabitatAssemblage,
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

function rainChorusFixture(
  tick = 0,
  origin: RegionCoord = ORIGIN,
  seed: RootSeed = seedFromText("rain chorus small-world interaction"),
): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: seed,
    originRegion: origin,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "wave-b3:rain-chorus",
    originRegion: origin,
    tick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v4", habitat },
  });
  const frogs = patch.aggregatePopulations.find(({ species }) => (
    species === "southern-leopard-frog"
  ));
  if (frogs === undefined || frogs.anchors.length < 2) {
    throw new Error("Rain-chorus fixture requires two frog anchors");
  }
  return patch;
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
  targetSpecies: "brown-rat" | "southern-leopard-frog" = "brown-rat",
): CoreEcologySettlementShadowsStimulus {
  const population = patch.aggregatePopulations.find(({ species }) => species === targetSpecies);
  const from = population?.anchors.find(({ populationUnits }) => populationUnits > 0);
  const to = population?.anchors.find(({ anchorOrdinal }) => (
    anchorOrdinal !== from?.anchorOrdinal
  ));
  if (population === undefined || from === undefined || to === undefined) {
    throw new Error(`Small-world stimulus requires a movable ${targetSpecies} unit`);
  }
  return {
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    stimulusId,
    sourceReferenceId,
    sourceKind,
    response,
    targetAggregateId: population.aggregateId,
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
      version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION,
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
    for (const noncanonicalAlias of ["domestic-cat", "domestic-dog"] as const) {
      expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame({
        version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
        atTick: 0,
        stimuli: [{
          ...valid,
          sourceKind: noncanonicalAlias,
          sourceReferenceId: `${noncanonicalAlias}:1`,
        }],
      })).toBeNull();
    }
    expect(stepCoreEcologySettlementShadows(initial, 0, frame(0, [{
      ...valid,
      anchorInfluences: [{ anchorOrdinal: 99, intensity: 500_000 }],
    }]))).toBeNull();
  });

  it("uses target-species policy so rain attracts frogs without changing rat rain pressure", () => {
    const initial = rainChorusFixture();
    const frogRain = stimulus(
      initial,
      "rain",
      "weather:rain-frog",
      ["hearing", "touch"],
      "attraction",
      780_000,
      "stimulus:frog-rain",
      "southern-leopard-frog",
    );
    const canonical = canonicalizeCoreEcologySettlementShadowsStimulusFrame(
      frame(0, [frogRain]),
    );
    expect(canonical).toEqual(frame(0, [frogRain]));
    const result = stepCoreEcologySettlementShadows(initial, 0, canonical);
    if (result === null) throw new Error("Valid frog rain attraction failed");
    expect(result.events).toEqual([expect.objectContaining({
      version: CORE_ECOLOGY_SMALL_WORLD_VERSION,
      sourceKind: "rain",
      response: "attraction",
      causeKind: "weather-pressure",
      targetSpecies: "southern-leopard-frog",
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    })]);
    const before = initial.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    const after = result.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    expect(after?.populationSize).toBe(before?.populationSize);
    expect(after?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
      .toBe(before?.populationSize);
    const frogHabitatIntensity = initial.derivation.kind === "habitat-v4"
      ? initial.derivation.habitat.populations.find(({ species }) => (
          species === "southern-leopard-frog"
        ))?.activitySignal.intensity ?? 0
      : 0;
    expect(after?.activitySignal.intensity).toBe(
      resolveCoreEcologyAggregateActivityIntensity(
        "southern-leopard-frog",
        frogHabitatIntensity,
        780_000,
      ),
    );

    const ratRain = stimulus(
      initial,
      "rain",
      "weather:rain-rat",
      ["touch"],
      "pressure",
    );
    expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame(frame(0, [ratRain])))
      .not.toBeNull();
    expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame(frame(0, [{
      ...ratRain,
      response: "attraction",
    }]))).toBeNull();
  });

  it("quiets and redistributes frogs only from submitted lawful crow or harrier perception", () => {
    for (const sourceKind of ["fish-crow", "northern-harrier"] as const) {
      const initial = rainChorusFixture();
      const before = initial.aggregatePopulations.find(({ species }) => (
        species === "southern-leopard-frog"
      ));
      const perceivedPressure = stimulus(
        initial,
        sourceKind,
        `${sourceKind}:perceived`,
        ["vision"],
        "pressure",
        850_000,
        `stimulus:frog:${sourceKind}`,
        "southern-leopard-frog",
      );
      const result = stepCoreEcologySettlementShadows(
        initial,
        0,
        frame(0, [perceivedPressure]),
      );
      if (result === null) throw new Error(`Valid frog ${sourceKind} pressure failed`);
      expect(result.events).toEqual([expect.objectContaining({
        sourceKind,
        response: "pressure",
        targetSpecies: "southern-leopard-frog",
        mortality: "none",
        cargoInteraction: false,
        itemConsumption: "none",
      })]);
      const after = result.patch.aggregatePopulations.find(({ species }) => (
        species === "southern-leopard-frog"
      ));
      expect(after?.populationSize).toBe(before?.populationSize);
      expect(before?.activitySignal.intensity).toBeGreaterThan(0);
      expect(after?.activitySignal.intensity).toBeLessThan(
        before?.activitySignal.intensity ?? FIXED_POINT,
      );
    }
  });

  it("changes a frog chorus from live rain and pressure without moving or regenerating frogs", () => {
    const initial = rainChorusFixture(1);
    const frogs = initial.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    if (frogs === undefined) throw new Error("Rain activity fixture requires frogs");
    const rain = stimulus(
      initial,
      "rain",
      "weather:steady-rain",
      ["hearing", "touch"],
      "attraction",
      900_000,
      "stimulus:steady-rain",
      "southern-leopard-frog",
    );
    const crow = stimulus(
      initial,
      "fish-crow",
      "CROW-visible",
      ["vision"],
      "pressure",
      700_000,
      "stimulus:visible-crow",
      "southern-leopard-frog",
    );
    const dryResult = stepCoreEcologySettlementShadows(initial, 1, frame(1, []));
    const rainResult = stepCoreEcologySettlementShadows(initial, 1, frame(1, [rain]));
    const pressuredResult = stepCoreEcologySettlementShadows(
      initial,
      1,
      frame(1, [rain, crow]),
    );
    if (dryResult === null || rainResult === null || pressuredResult === null) {
      throw new Error("Valid live frog activity projection failed");
    }
    const dryFrogs = dryResult.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    const rainFrogs = rainResult.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    const pressuredFrogs = pressuredResult.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    expect(dryResult.events).toEqual([]);
    expect(rainResult.events).toEqual([]);
    expect(pressuredResult.events).toEqual([]);
    expect(rainFrogs?.activitySignal.intensity).toBeGreaterThan(
      dryFrogs?.activitySignal.intensity ?? FIXED_POINT,
    );
    expect(pressuredFrogs?.activitySignal.intensity).toBeLessThan(
      rainFrogs?.activitySignal.intensity ?? 0,
    );
    for (const projected of [dryFrogs, rainFrogs, pressuredFrogs]) {
      expect(projected).toMatchObject({
        aggregateId: frogs.aggregateId,
        species: frogs.species,
        populationSize: frogs.populationSize,
        anchors: frogs.anchors,
        evidence: frogs.evidence,
        disturbances: frogs.disturbances,
        revision: frogs.revision,
      });
    }
  });

  it("rejects frog food, versions new aerial rat pressure as v3, and keeps rabbits neutral", () => {
    const initial = rainChorusFixture();
    const frogFood = stimulus(
      initial,
      "exposed-food",
      "cargo:frog-food",
      ["scent"],
      "attraction",
      800_000,
      "stimulus:frog-food",
      "southern-leopard-frog",
    );
    expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame(frame(0, [frogFood])))
      .toBeNull();

    for (const sourceKind of ["fish-crow", "northern-harrier"] as const) {
      const aerialPressure = stimulus(
        initial,
        sourceKind,
        `${sourceKind}:rat-capability`,
        ["vision"],
        "pressure",
      );
      expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame(frame(0, [aerialPressure])))
        .not.toBeNull();
      expect(stepCoreEcologySettlementShadows(initial, 0, frame(0, [aerialPressure]))?.events)
        .toEqual([expect.objectContaining({
          version: CORE_ECOLOGY_SMALL_WORLD_VERSION,
          sourceKind,
          causeKind: sourceKind === "northern-harrier"
            ? "predator-pressure"
            : "animal-disturbance",
          mortality: "none",
        })]);
    }

    const rabbitAtRats = stimulus(
      initial,
      "marsh-rabbit",
      "RABBIT-neutral",
      ["vision"],
      "pressure",
    );
    expect(canonicalizeCoreEcologySettlementShadowsStimulusFrame(frame(0, [rabbitAtRats])))
      .toBeNull();
  });

  it("inherits tidal routing and habitat activity baselines through the v7 habitat record", () => {
    const seed = seedFromText("otter habitat 0");
    const origin = createRegionCoord(0, 0);
    const habitat = deriveCoreEcologyTidalWebHabitatAssemblage({
      rootSeed: seed,
      originRegion: origin,
    });
    const initial = createCoreEcologyAggregatePatch({
      seed,
      patchKey: "tidal-web:inherited-small-world-capabilities",
      originRegion: origin,
      tick: 0,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v7", habitat },
    });

    const tidal = projectCoreEcologyTidalTable(initial, 0);
    const fish = initial.aggregatePopulations.find(({ species }) => (
      species === "atlantic-silverside"
    ));
    const otterId = initial.populations.find(({ species }) => (
      species === "north-american-river-otter"
    ))?.members[0]?.actor.identity.stableId;
    const usableFishAnchors = new Set(tidal?.anchorDepths.filter(({ aggregateId, activityUsable }) => (
      aggregateId === fish?.aggregateId && activityUsable
    )).map(({ anchorOrdinal }) => anchorOrdinal));
    const pressuredAnchor = fish?.anchors.find(({ anchorOrdinal, populationUnits }) => (
      populationUnits > 0 && !usableFishAnchors.has(anchorOrdinal)
    ));
    const lawfulDestination = fish?.anchors.find(({ anchorOrdinal }) => (
      anchorOrdinal !== pressuredAnchor?.anchorOrdinal && usableFishAnchors.has(anchorOrdinal)
    ));
    if (
      tidal === null
      || fish === undefined
      || otterId === undefined
      || pressuredAnchor === undefined
      || lawfulDestination === undefined
    ) {
      throw new Error("V7 inheritance fixture lacks tidal fish, otter pressure, or lawful water");
    }
    const visualPressure: CoreEcologySettlementShadowsStimulus = {
      version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
      stimulusId: "stimulus:v7-otter-fish-pressure",
      sourceReferenceId: otterId,
      sourceKind: "north-american-river-otter",
      response: "pressure",
      targetAggregateId: fish.aggregateId,
      channels: ["vision"],
      anchorInfluences: [
        { anchorOrdinal: pressuredAnchor.anchorOrdinal, intensity: 900_000 },
        { anchorOrdinal: lawfulDestination.anchorOrdinal, intensity: 0 },
      ],
    };
    const pressured = stepCoreEcologySettlementShadows(
      initial,
      0,
      frame(0, [visualPressure]),
    );
    const fishEvent = pressured?.events.find(({ stimulusId }) => (
      stimulusId === visualPressure.stimulusId
    ));
    const fishAfter = pressured?.patch.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === fish.aggregateId
    ));
    expect(fishEvent).toMatchObject({
      sourceKind: "north-american-river-otter",
      targetSpecies: "atlantic-silverside",
      response: "pressure",
      channels: ["vision"],
      causeKind: "predator-pressure",
      fromAnchorOrdinal: pressuredAnchor.anchorOrdinal,
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    });
    expect(usableFishAnchors.has(fishEvent?.toAnchorOrdinal ?? -1)).toBe(true);
    expect(fishAfter?.populationSize).toBe(fish.populationSize);
    expect(fishAfter?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
      .toBe(fish.populationSize);

    const frog = initial.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    const frogHabitatBaseline = habitat.populations.find(({ species }) => (
      species === "southern-leopard-frog"
    ))?.activitySignal.intensity;
    if (frog === undefined || frogHabitatBaseline === undefined) {
      throw new Error("V7 inheritance fixture lacks its authenticated frog baseline");
    }
    const stale = setCoreEcologyAggregateActivityIntensity(initial, {
      aggregateId: frog.aggregateId,
      atTick: 0,
      intensity: 0,
    });
    if (stale === null) throw new Error("Could not install stale frog activity control");
    const dry = stepCoreEcologySettlementShadows(stale, 0, frame(0, []));
    const dryFrog = dry?.patch.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === frog.aggregateId
    ));
    const expectedDryIntensity = resolveCoreEcologyAggregateActivityIntensity(
      "southern-leopard-frog",
      frogHabitatBaseline,
      0,
    );
    expect(expectedDryIntensity).toBeGreaterThan(0);
    expect(dryFrog?.activitySignal.intensity).toBe(expectedDryIntensity);
    expect(dryFrog?.activitySignal.intensity).not.toBe(
      resolveCoreEcologyAggregateActivityIntensity("southern-leopard-frog", 0, 0),
    );
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
