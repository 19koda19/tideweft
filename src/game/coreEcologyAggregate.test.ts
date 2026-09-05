import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
} from "./coreWildlifeActor";
import {
  CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
  CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  canonicalizeCoreEcologyAggregatePatch,
  coreEcologyAggregatePatchActor,
  createCoreEcologyAggregatePatch,
  createCoreEcologyPatch,
  deserializeCoreEcologyAggregatePatch,
  deserializeOrMigrateCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  serializeCoreEcologyPatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import {
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION,
  canonicalizeCoreEcologyHarborEdgeHabitatAssemblage,
  deriveCoreEcologyHabitatAssemblage,
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import { createWorldPosition } from "./worldPosition";

const SEED = seedFromText("harbor edge rats and free ranging cats");
const ORIGIN = createRegionCoord(0, 0);

function harborHabitat() {
  return deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: SEED,
    originRegion: ORIGIN,
  });
}

function individualInputs(): readonly CoreEcologyPopulationInput[] {
  return harborHabitat().populations.flatMap((population) => {
    if (population.representation !== "individual-representatives"
      || population.populationUnits === 0) return [];
    return [{
      species: population.species,
      populationKey: population.populationKey,
      populationSize: population.populationUnits,
      members: population.allocations.map((allocation) => ({
        populationOrdinal: allocation.allocationOrdinal,
        representedUnits: allocation.representedUnits,
        position: allocation.position,
        materialization: "coarse" as const,
      })),
    }];
  });
}

function aggregatePatch() {
  const habitat = harborHabitat();
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "harbor-edge:wave-b",
    originRegion: ORIGIN,
    populations: individualInputs(),
    derivation: { kind: "habitat-v2", habitat },
  });
}

describe("harbor-edge aggregate ecology", () => {
  it("adds rat area habitat and individual cats without changing Wave-A analyses", () => {
    const waveA = deriveCoreEcologyHabitatAssemblage({ rootSeed: SEED, originRegion: ORIGIN });
    const harbor = harborHabitat();
    expect(harbor.generationVersion).toBe(CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION);
    expect(harbor.populations.map(({ species }) => species)).toEqual([
      "deer",
      "gull",
      "black-bear",
      "brown-rat",
      "domestic-cat",
    ]);
    expect(canonicalizeCoreEcologyHarborEdgeHabitatAssemblage(harbor)).toEqual(harbor);
    for (let index = 0; index < waveA.populations.length; index += 1) {
      const harborPopulation = harbor.populations[index];
      if (harborPopulation === undefined) throw new Error("Missing frozen Wave-A analysis");
      const { activitySignal: _activity, representation: _representation, ...base } = harborPopulation;
      expect(base).toEqual(waveA.populations[index]);
    }

    const rat = harbor.populations.find(({ species }) => species === "brown-rat");
    const cat = harbor.populations.find(({ species }) => species === "domestic-cat");
    expect(rat).toMatchObject({ representation: "aggregate-area" });
    expect(cat).toMatchObject({ representation: "individual-representatives" });
    expect(rat?.populationUnits).toBeGreaterThan(0);
    expect(rat?.allocations.length).toBeGreaterThanOrEqual(2);
    expect(cat?.populationUnits).toBeGreaterThan(0);
    const ratTiles = new Set(rat?.allocations.map(({ tileIndex }) => tileIndex));
    expect(cat?.allocations.some(({ tileIndex }) => ratTiles.has(tileIndex))).toBe(true);
  });

  it("persists a bounded rat population without manufacturing rat actors", () => {
    const state = aggregatePatch();
    expect(state.version).toBe(CORE_ECOLOGY_AGGREGATE_PATCH_VERSION);
    expect(state.populations.some(({ species }) => species === "brown-rat")).toBe(false);
    expect(state.populations.some(({ species }) => species === "domestic-cat")).toBe(true);
    expect(state.aggregatePopulations).toHaveLength(1);
    const rats = state.aggregatePopulations[0];
    expect(rats?.aggregateId).toMatch(/^RAT-AREA-v1-/u);
    expect(rats?.representation).toBe("aggregate-area");
    expect(rats?.anchors.reduce((total, anchor) => total + anchor.populationUnits, 0))
      .toBe(rats?.populationSize);
    expect(rats?.evidence).toHaveLength(rats?.anchors.length ?? 0);
    expect(rats?.evidence.every((evidence) => (
      evidence.itemConsumption === "none"
      && evidence.disclosure === "direct-observation-required"
    ))).toBe(true);

    const encoded = serializeCoreEcologyAggregatePatch(state);
    expect(deserializeCoreEcologyAggregatePatch(encoded)).toEqual(state);
    expect(canonicalizeCoreEcologyAggregatePatch({ ...state, debug: true })).toBeNull();
    expect(() => createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "harbor-edge:fake-rat-actors",
      originRegion: ORIGIN,
      populations: [{
        species: "brown-rat",
        populationKey: "fake-rats",
        members: [{
          populationOrdinal: 0,
          position: createWorldPosition(ORIGIN, 10_000, 10_000),
          materialization: "coarse",
        }],
      }],
      derivation: { kind: "bounded-input-v1" },
    })).toThrow(/individual population input/u);
  });

  it("records nonlethal displacement and bounded persistent physical evidence", () => {
    let state = aggregatePatch();
    const initial = state.aggregatePopulations[0];
    if (initial === undefined || initial.anchors.length < 2) {
      throw new Error("Aggregate fixture requires two rat anchors");
    }
    const initialPopulation = initial.populationSize;
    const initialEvidence = initial.evidence;
    for (let index = 0; index < 30; index += 1) {
      const rats = state.aggregatePopulations[0];
      if (rats === undefined) throw new Error("Rat aggregate disappeared");
      const from = rats.anchors.find(({ populationUnits }) => populationUnits > 0);
      const to = rats.anchors.find(({ anchorOrdinal }) => anchorOrdinal !== from?.anchorOrdinal);
      if (from === undefined || to === undefined) throw new Error("No valid bounded transfer");
      const result = displaceCoreEcologyAggregatePopulation(state, {
        aggregateId: rats.aggregateId,
        atTick: index + 1,
        causeKind: index % 2 === 0 ? "predator-pressure" : "weather-pressure",
        causeReferenceId: index % 2 === 0 ? "CAT-free-ranging-0" : "weather:harbor-squall",
        fromAnchorOrdinal: from.anchorOrdinal,
        toAnchorOrdinal: to.anchorOrdinal,
        populationUnits: 1,
        pressure: 500_000,
      });
      if (result === null) throw new Error("Valid aggregate displacement was rejected");
      expect(result.disturbance).toMatchObject({
        nonlethal: true,
        cargoInteraction: false,
        itemConsumption: "none",
      });
      expect(result.evidence.disclosure).toBe("direct-observation-required");
      state = result.patch;
    }
    const rats = state.aggregatePopulations[0];
    expect(rats?.populationSize).toBe(initialPopulation);
    expect(rats?.anchors.reduce((total, anchor) => total + anchor.populationUnits, 0))
      .toBe(initialPopulation);
    expect(rats?.disturbances).toHaveLength(CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES);
    expect(rats?.evidence).toHaveLength(CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE);
    expect(rats?.nextDisturbanceOrdinal).toBe(30);
    expect(rats?.evidence.some(({ evidenceId }) =>
      initialEvidence.some((entry) => entry.evidenceId === evidenceId))).toBe(false);
    expect(deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(state)))
      .toEqual(state);

    const evidenceIndex = state.aggregatePopulations[0]?.evidence.length === undefined
      ? -1
      : state.aggregatePopulations[0]!.evidence.length - 1;
    const tampered = {
      ...state,
      aggregatePopulations: state.aggregatePopulations.map((population) => ({
        ...population,
        evidence: population.evidence.map((evidence, index) => index === evidenceIndex
          ? { ...evidence, itemConsumption: "food" }
          : evidence),
      })),
    };
    expect(canonicalizeCoreEcologyAggregatePatch(tampered)).toBeNull();
  });

  it("migrates exact v2 state to v3 with no invented aggregate history", () => {
    const waveA = createCoreEcologyPatch({
      seed: SEED,
      patchKey: "wave-a:migration",
      originRegion: ORIGIN,
      populations: [{
        species: "deer",
        populationKey: "deer:wave-a",
        members: [{
          populationOrdinal: 0,
          position: createWorldPosition(ORIGIN, 10_000, 20_000),
          materialization: "coarse",
        }],
      }],
    });
    const migrated = deserializeOrMigrateCoreEcologyAggregatePatch(
      serializeCoreEcologyPatch(waveA),
    );
    expect(migrated).toMatchObject({
      version: CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
      derivation: { kind: "bounded-input-v1" },
      aggregatePopulations: [],
    });
    expect(migrated?.populations).toEqual(waveA.populations);
  });

  it("operates individual actors in v3 while preserving aggregate facts and evidence", () => {
    const initial = aggregatePatch();
    const cat = initial.populations.find(({ species }) => species === "domestic-cat")
      ?.members[0]?.actor;
    const initialRats = initial.aggregatePopulations[0];
    if (cat === undefined || initialRats === undefined) {
      throw new Error("Actor wrapper fixture requires a cat and rats");
    }
    expect(coreEcologyAggregatePatchActor(initial, cat.identity.stableId)).toEqual(cat);
    expect(coreEcologyAggregatePatchActor(initial, initialRats.aggregateId)).toBeNull();

    const revisedCat = replaceCoreWildlifeActorPhysiology(cat, {
      atTick: 2,
      needs: cat.needs,
      condition: cat.condition,
    });
    const replaced = replaceCoreEcologyAggregatePatchActor(initial, revisedCat);
    expect(coreEcologyAggregatePatchActor(replaced, cat.identity.stableId)?.updatedAtTick).toBe(2);
    expect(replaced.aggregatePopulations[0]).toMatchObject({
      revision: initialRats.revision,
      updatedAtTick: 2,
      nextEvidenceOrdinal: initialRats.nextEvidenceOrdinal,
      nextDisturbanceOrdinal: initialRats.nextDisturbanceOrdinal,
    });
    expect(replaced.aggregatePopulations[0]?.anchors).toEqual(initialRats.anchors);
    expect(replaced.aggregatePopulations[0]?.evidence).toEqual(initialRats.evidence);
    expect(replaced.aggregatePopulations[0]?.disturbances).toEqual(initialRats.disturbances);

    const materialized = setCoreEcologyAggregatePatchMaterializedActors(replaced, {
      atTick: 3,
      actorIds: [cat.identity.stableId],
    });
    expect(materialized.populations.find(({ species }) => species === "domestic-cat")
      ?.members[0]?.materialization).toBe("materialized");
    const stepped = stepCoreEcologyAggregatePatch(materialized, {
      tick: 4,
      actorSteps: [{
        actorId: cat.identity.stableId,
        observations: [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      }],
    });
    if (stepped === null) throw new Error("Valid v3 actor step failed");
    const steppedRats = stepped.patch.aggregatePopulations[0];
    expect(stepped.patch.updatedAtTick).toBe(4);
    expect(steppedRats?.updatedAtTick).toBe(4);
    expect(steppedRats?.activitySignal.updatedAtTick).toBe(4);
    expect(steppedRats?.revision).toBe(initialRats.revision);
    expect(steppedRats?.anchors).toEqual(initialRats.anchors);
    expect(steppedRats?.evidence).toEqual(initialRats.evidence);
    expect(steppedRats?.disturbances).toEqual(initialRats.disturbances);
    expect(stepped.events.every(({ species }) => species !== "brown-rat")).toBe(true);
    expect(stepped.resourceClaims.every(({ actorId }) => actorId !== initialRats.aggregateId))
      .toBe(true);
  });

  it("advances v3 social-group cadence without creating aggregate evidence", () => {
    const habitat = harborHabitat();
    const populations = individualInputs();
    const deer = populations.find(({ species }) => species === "deer");
    if (deer === undefined || deer.members.length < 2) {
      throw new Error("Group cadence fixture requires two deer representatives");
    }
    const group = createCoreEcologyGroup({
      seed: SEED,
      species: "deer",
      originRegion: ORIGIN,
      populationKey: deer.populationKey,
      groupOrdinal: 0,
      memberOrdinals: deer.members.map(({ populationOrdinal }) => populationOrdinal),
      anchor: deer.members[0]!.position,
    });
    const state = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "harbor-edge:group-cadence",
      originRegion: ORIGIN,
      populations,
      derivation: { kind: "habitat-v2", habitat },
      groups: createCoreEcologyGroupSet([group]),
    });
    const evidence = state.aggregatePopulations[0]?.evidence;
    const result = stepCoreEcologyAggregatePatch(state, { tick: 8, actorSteps: [] });
    expect(result?.patch.groups.groups[0]).toMatchObject({
      updatedAtTick: 8,
      nextCoarseTick: 16,
    });
    expect(result?.patch.aggregatePopulations[0]?.evidence).toEqual(evidence);
    expect(result?.patch.aggregatePopulations[0]?.disturbances).toEqual([]);
  });
});
