import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  regionLocalToGlobalTile,
} from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES,
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  deriveCoreEcologyMaterializedActorIds,
  setCoreEcologyMaterializationForWindow,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import { stepCoreEcologySettlementShadows } from "./coreEcologySmallWorld";
import {
  repositionCoreWildlifeActor,
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  createCoreWildlifeActorState,
  replaceCoreWildlifeActorPhysiology,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeFoodOpportunity,
} from "./coreWildlifeActor";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";

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

function windowAt(
  region = createRegionCoord(0, 0),
  offsetX = 0,
): CoreEcologyRuntimeWindow {
  const origin = regionLocalToGlobalTile(region, 0, 0);
  return Object.freeze({
    origin: Object.freeze({ x: origin.x + offsetX, y: origin.y }),
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
}

describe("Settlement Shadows release invariants", () => {
  it("covers the representative free-ranging cat outcome families without a pair matrix", () => {
    const makeCat = (key: string): CoreWildlifeActorState => {
      const state = createCoreWildlifeActorState({
        seed: seedFromText(`settlement-shadows-cat-outcomes:${key}`),
        species: "domestic-cat",
        originRegion: createRegionCoord(0, 0),
        populationKey: `settlement-shadows:${key}`,
        populationOrdinal: 0,
        position: createWorldPosition(createRegionCoord(0, 0), 24_500, 24_500),
        heading: 0,
      });
      return replaceCoreWildlifeActorPhysiology(state, {
        atTick: 0,
        needs: { hunger: 900_000, safety: 0, rest: 0 },
        condition: { health: ACTOR_PERCEPTION_SCALE, exhaustion: 0, stress: 0 },
      });
    };
    const observe = (
      state: CoreWildlifeActorState,
      id: string,
      perceivedClass: string,
      subjectId: string,
    ): ActorObservation => {
      const observation = createActorObservation({
        id,
        observerId: state.identity.stableId,
        observedAtTick: 1,
        channel: "vision",
        perceivedClass,
        subjectId,
        area: { center: state.address.position, radiusUnits: 0 },
        confidence: ACTOR_PERCEPTION_SCALE,
        salience: ACTOR_PERCEPTION_SCALE,
        identification: "identified",
      });
      if (observation === null) throw new Error(`Invalid observation ${id}`);
      return observation;
    };
    const step = (
      state: CoreWildlifeActorState,
      observations: readonly ActorObservation[] = [],
      foodOpportunities: readonly CoreWildlifeFoodOpportunity[] = [],
    ) => {
      const result = stepCoreWildlifeActor(state, {
        tick: 1,
        observations,
        foodOpportunities,
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      });
      if (result === null) throw new Error("Valid cat outcome fixture was rejected");
      return result;
    };

    expect(step(makeCat("neutral")).decision.intent).toBe("observe");

    const sameSpecies = makeCat("same-species");
    expect(step(sameSpecies, [observe(
      sameSpecies,
      "obs:cat:other-cat",
      "domestic-cat",
      "CAT-other",
    )]).decision).toMatchObject({
      intent: "observe",
      cause: { kind: "condition", referenceId: "condition:neutral-watch" },
    });

    const humanContact = makeCat("human");
    expect(step(humanContact, [observe(
      humanContact,
      "obs:cat:human",
      "human",
      "H-porter",
    )]).decision).toMatchObject({
      intent: "retreat",
      cause: { kind: "perception", referenceId: "obs:cat:human" },
    });

    const dogContact = makeCat("dog");
    expect(step(dogContact, [observe(
      dogContact,
      "obs:cat:dog",
      "predator",
      "DOG-nearby",
    )]).decision).toMatchObject({
      intent: "flee",
      cause: { kind: "perception", referenceId: "obs:cat:dog" },
    });

    const hungryCat = makeCat("food");
    const foodObservation = observe(
      hungryCat,
      "obs:cat:food",
      "exposed-food",
      "CARGO-food",
    );
    const food: CoreWildlifeFoodOpportunity = Object.freeze({
      resourceId: "CARGO-food",
      observationId: foodObservation.id,
      foodClass: "exposed-food",
      sourceKind: "physical-item",
      availableUnits: 1,
      nutrition: 700_000,
      effort: 20_000,
      risk: 10_000,
      competition: 0,
      directlyConfirmed: true,
      accessible: true,
    });
    const foraging = step(hungryCat, [foodObservation], [food]);
    expect(foraging.decision.intent).toBe("forage");
    expect(foraging.resourceClaims).toEqual([expect.objectContaining({
      actorId: hungryCat.identity.stableId,
      resourceId: food.resourceId,
      observedAvailableUnits: 1,
      requestedUnits: 1,
    })]);
  });

  it("preserves one free-ranging cat through full/coarse/full and a signed region seam", () => {
    const seed = seedFromText("settlement shadows cat seam continuity");
    const origin = createRegionCoord(-17, 9);
    const firstWindow = windowAt(origin);
    const initial = createCoreEcologyAggregatePatch({
      seed,
      patchKey: "settlement-shadows:cat-seam",
      originRegion: origin,
      populations: [{
        species: "domestic-cat",
        populationKey: "habitat-v2/domestic-cat",
        populationSize: 1,
        members: [{
          populationOrdinal: 0,
          representedUnits: 1,
          position: createWorldPosition(
            origin,
            REGION_WIDTH_UNITS - WORLD_POSITION_UNITS_PER_TILE / 2,
            60 * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
          ),
          materialization: "coarse",
        }],
      }],
      derivation: { kind: "bounded-input-v1" },
    });
    const catId = initial.populations[0]?.members[0]?.actor.identity.stableId;
    if (catId === undefined) throw new Error("Cat seam fixture did not create an actor");

    const full = setCoreEcologyMaterializationForWindow(initial, firstWindow, 1);
    if (full === null) throw new Error("Cat did not materialize in its first frame");
    expect(deriveCoreEcologyMaterializedActorIds(full, firstWindow)).toEqual([catId]);
    const beforeCrossing = full.populations[0]!.members[0]!.actor;
    expect(full.populations[0]!.members[0]!.materialization).toBe("materialized");

    const crossedActor = repositionCoreWildlifeActor(beforeCrossing, {
      atTick: 1,
      position: translateWorldPosition(
        beforeCrossing.address.position,
        WORLD_POSITION_UNITS_PER_TILE,
        0,
      ),
      heading: 0,
    });
    expect(crossedActor.address.position.region).toEqual(createRegionCoord(-16, 9));
    const crossed = replaceCoreEcologyAggregatePatchActor(full, crossedActor);
    const secondWindow = windowAt(origin, 16);
    const crossedFull = setCoreEcologyMaterializationForWindow(crossed, secondWindow, 2);
    if (crossedFull === null) throw new Error("Cat did not remain materialized across the seam");
    expect(deriveCoreEcologyMaterializedActorIds(crossedFull, secondWindow)).toEqual([catId]);

    const coarse = setCoreEcologyMaterializationForWindow(
      crossedFull,
      windowAt(origin, REGIONAL_TRAVEL_COLUMNS + 32),
      3,
    );
    if (coarse === null) throw new Error("Cat did not dematerialize outside the frame");
    expect(coarse.populations[0]!.members[0]!.materialization).toBe("coarse");
    expect(coarse.populations[0]!.members[0]!.actor).toEqual(crossedActor);

    const returned = setCoreEcologyMaterializationForWindow(coarse, secondWindow, 4);
    if (returned === null) throw new Error("Cat did not rematerialize on return");
    expect(returned.populations[0]!.members[0]).toMatchObject({
      materialization: "materialized",
      actor: crossedActor,
    });
    expect(serializeCoreEcologyAggregatePatch(
      deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(returned)),
    )).toBe(serializeCoreEcologyAggregatePatch(returned));
  });

  it("fuzzes deterministic rat aggregates, cat individuals, conservation, and hard budgets", () => {
    const coordinates = [
      createRegionCoord(-REGION_COORD_LIMIT, 0),
      createRegionCoord(-91_337, 72_001),
      createRegionCoord(-1, -1),
      createRegionCoord(0, 0),
      createRegionCoord(1, -1),
      createRegionCoord(88_001, -73_117),
      createRegionCoord(REGION_COORD_LIMIT, 0),
    ] as const;
    let casesWithRats = 0;
    let casesWithCats = 0;
    let playerIndependentEvents = 0;
    const ratPopulationSignatures = new Set<string>();
    const catIdentitySignatures = new Set<string>();

    // A compact generated matrix exercises every coordinate class twice while
    // keeping this property gate cheap enough for ordinary CI.
    for (let index = 0; index < 14; index += 1) {
      const seed = seedFromText(`settlement-shadows-fuzz-${index}`);
      const origin = coordinates[index % coordinates.length]!;
      const leftHabitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
        rootSeed: seed,
        originRegion: origin,
      });
      const rightHabitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
        rootSeed: seed,
        originRegion: origin,
      });
      expect(leftHabitat).toEqual(rightHabitat);

      const create = () => createCoreEcologyAggregatePatch({
        seed,
        patchKey: `settlement-shadows:fuzz-${index}`,
        originRegion: origin,
        populations: individualInputs(leftHabitat),
        derivation: { kind: "habitat-v2" as const, habitat: leftHabitat },
      });
      const left = create();
      const right = create();
      expect(left).toEqual(right);
      expect(canonicalizeCoreEcologyAggregatePatch(left)).toEqual(left);
      expect(deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(left)))
        .toEqual(left);

      const materializedCount = left.populations.flatMap(({ members }) => members)
        .filter(({ materialization }) => materialization === "materialized").length;
      expect(materializedCount).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
      expect(left.populations.some(({ species }) => species === "brown-rat")).toBe(false);
      expect(left.populations.flatMap(({ members }) => members)
        .some(({ actor }) => actor.identity.stableId.startsWith("RAT-"))).toBe(false);

      const rats = left.aggregatePopulations.find(({ species }) => species === "brown-rat");
      const cats = left.populations.find(({ species }) => species === "domestic-cat");
      if (rats !== undefined) {
        casesWithRats += 1;
        ratPopulationSignatures.add(JSON.stringify({
          anchors: rats.anchors.length,
          evidence: rats.evidence.map(({ kind }) => kind),
          populationSize: rats.populationSize,
        }));
        expect(rats.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
          .toBe(rats.populationSize);
        expect(rats.evidence.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE);
        expect(rats.disturbances.length)
          .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES);
      }
      if (cats !== undefined) {
        casesWithCats += 1;
        for (const { actor } of cats.members) {
          catIdentitySignatures.add(JSON.stringify({
            morph: actor.identity.morph,
            temperament: actor.identity.temperament,
            traits: actor.identity.traits,
          }));
        }
        expect(new Set(cats.members.map(({ actor }) => actor.identity.stableId)).size)
          .toBe(cats.members.length);
        expect(cats.members.every(({ actor }) => (
          actor.identity.stableId.startsWith("CAT-")
          && actor.identity.species === "domestic-cat"
        ))).toBe(true);
      }

      const pressureSource = cats?.members[0]?.actor;
      const populatedAnchor = rats?.anchors.find(({ populationUnits }) => populationUnits > 0);
      const refugeAnchor = rats?.anchors.find(({ anchorOrdinal }) => (
        anchorOrdinal !== populatedAnchor?.anchorOrdinal
      ));
      const stimuli = rats !== undefined
        && populatedAnchor !== undefined
        && refugeAnchor !== undefined
        ? [Object.freeze({
            version: 1 as const,
            stimulusId: `audit:stimulus:${index}`,
            sourceReferenceId: pressureSource?.identity.stableId
              ?? `weather:rain:${index}`,
            sourceKind: pressureSource === undefined ? "rain" as const : "cat" as const,
            response: "pressure" as const,
            targetAggregateId: rats.aggregateId,
            channels: pressureSource === undefined
              ? ["touch" as const]
              : ["vision" as const],
            anchorInfluences: [
              Object.freeze({
                anchorOrdinal: populatedAnchor.anchorOrdinal,
                intensity: ACTOR_PERCEPTION_SCALE,
              }),
              Object.freeze({
                anchorOrdinal: refugeAnchor.anchorOrdinal,
                intensity: 0,
              }),
            ],
          })]
        : [];
      const stimulusFrame = Object.freeze({
        version: 1 as const,
        atTick: 0,
        stimuli: Object.freeze(stimuli),
      });
      const steppedLeft = stepCoreEcologySettlementShadows(left, 0, stimulusFrame);
      const steppedRight = stepCoreEcologySettlementShadows(right, 0, stimulusFrame);
      expect(steppedLeft).toEqual(steppedRight);
      if (steppedLeft === null) {
        throw new Error(`Canonical fuzz patch ${index} at ${origin.x},${origin.y} failed its ecology step`);
      }
      playerIndependentEvents += steppedLeft.events.length;
      expect(steppedLeft.events.every((event) => (
        event.playerKnowledge === "none"
        && event.mortality === "none"
        && event.cargoInteraction === false
      ))).toBe(true);
      for (const afterRats of steppedLeft.patch.aggregatePopulations) {
        const beforeRats = left.aggregatePopulations.find(({ aggregateId }) => (
          aggregateId === afterRats.aggregateId
        ));
        expect(beforeRats).toBeDefined();
        expect(afterRats.populationSize).toBe(beforeRats?.populationSize);
        expect(afterRats.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
          .toBe(afterRats.populationSize);
      }
    }

    // This is an interaction fuzz, not a presence quota: the matrix must
    // actually cover both representations and at least one lawful encounter.
    expect(casesWithRats).toBeGreaterThan(0);
    expect(casesWithCats).toBeGreaterThan(0);
    expect(playerIndependentEvents).toBeGreaterThan(0);
    expect(ratPopulationSignatures.size).toBeGreaterThan(1);
    expect(catIdentitySignatures.size).toBeGreaterThan(1);
  });
});
