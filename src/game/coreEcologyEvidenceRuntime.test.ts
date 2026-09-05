import { describe, expect, it } from "vitest";

import {
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  createActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  serializeCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE } from "./coreWildlifeActor";
import {
  canonicalizeCoreEcologyAggregateEvidenceTarget,
  projectCoreEcologyAggregateEvidence,
  sameCoreEcologyAggregateEvidenceTarget,
  type CoreEcologyAggregateEvidenceTarget,
} from "./coreEcologyEvidenceRuntime";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "./coreEcologyHabitat";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import type { WorldPosition } from "./worldPosition";

function fixture() {
  const seed = seedFromText("runtime aggregate evidence projection");
  const originRegion = createRegionCoord(-7, 11);
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion,
  });
  const populations: readonly CoreEcologyPopulationInput[] = habitat.populations.flatMap(
    (population) => population.representation !== "individual-representatives"
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
        }],
  );
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "runtime/aggregate-evidence",
    originRegion,
    populations,
    derivation: { kind: "habitat-v2", habitat },
    tick: 17,
  });
  const population = patch.aggregatePopulations[0];
  const evidence = population?.evidence[0];
  if (population === undefined || evidence === undefined) {
    throw new Error("Runtime projection fixture requires one rat-population sign");
  }
  const target: CoreEcologyAggregateEvidenceTarget = {
    species: "brown-rat",
    aggregateId: population.aggregateId,
    evidenceId: evidence.evidenceId,
  };
  return { evidence, patch, population, target };
}

function observationAt(
  position: WorldPosition,
  facingRadians = 0,
): Readonly<{
  window: CoreEcologyRuntimeWindow;
  perception: ReturnType<typeof evaluatePerception>;
}> {
  const evidenceGlobalX = position.region.x * WORLD_WIDTH
    + Math.floor(position.localX / 1_000);
  const evidenceGlobalY = position.region.y * WORLD_HEIGHT
    + Math.floor(position.localY / 1_000);
  const evidenceWindowX = 64;
  const playerWindowX = 60;
  const playerWindowY = 60;
  const window: CoreEcologyRuntimeWindow = Object.freeze({
    origin: {
      x: evidenceGlobalX - evidenceWindowX,
      y: evidenceGlobalY - playerWindowY,
    },
    terrain: {
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    },
  });
  const cells: PerceptionCell[] = Array.from(
    { length: REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  const perception = evaluatePerception({
    columns: REGIONAL_TRAVEL_COLUMNS,
    rows: REGIONAL_TRAVEL_ROWS,
    cells,
    playerTileIndex: playerWindowY * REGIONAL_TRAVEL_COLUMNS + playerWindowX,
    facingRadians,
    weatherVisibility: 1,
    rangeOverrides: {
      closePeripheralRange: 2,
      directSightRange: 52,
      forwardConeRadians: Math.PI / 2,
    },
    detailRangeOverrides: {
      closePeripheralRange: 2,
      directSightRange: 10,
      forwardConeRadians: Math.PI / 2,
    },
  });
  return Object.freeze({ window, perception });
}

function catRainEvidenceFixture() {
  const base = fixture().patch;
  const cat = base.populations.find(({ species }) => species === "domestic-cat")
    ?.members[0]?.actor;
  if (cat === undefined) throw new Error("Runtime evidence fixture requires one cat");
  const materialized = setCoreEcologyAggregatePatchMaterializedActors(base, {
    actorIds: [cat.identity.stableId],
    atTick: base.updatedAtTick,
  });
  const current = materialized.populations.find(({ species }) => species === "domestic-cat")
    ?.members.find(({ actor }) => actor.identity.stableId === cat.identity.stableId)?.actor;
  if (current === undefined) throw new Error("Runtime evidence fixture lost its cat");
  const tick = materialized.updatedAtTick + 1;
  const rain = createActorObservation({
    id: "observation:runtime-cat-rain",
    observerId: current.identity.stableId,
    observedAtTick: tick,
    channel: "hearing",
    perceivedClass: "rain-exposure",
    subjectId: null,
    area: {
      center: current.address.position,
      radiusUnits: MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
    },
    confidence: 680_000,
    salience: 680_000,
    identification: "anonymous",
  });
  if (rain === null) throw new Error("Runtime cat rain observation is invalid");
  const stepped = stepCoreEcologyAggregatePatch(materialized, {
    tick,
    actorSteps: [{
      actorId: current.identity.stableId,
      observations: [rain],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  const steppedCat = stepped?.patch.populations
    .find(({ species }) => species === "domestic-cat")
    ?.members.find(({ actor }) => actor.identity.stableId === current.identity.stableId)?.actor;
  const evidence = steppedCat?.memories.flatMap(({ environmentalEvidence }) => (
    environmentalEvidence === undefined ? [] : [environmentalEvidence]
  ))[0];
  if (stepped === null || steppedCat === undefined || evidence === undefined) {
    throw new Error("Runtime cat rain evidence was not created");
  }
  return { actorId: steppedCat.identity.stableId, evidence, patch: stepped.patch };
}

describe("core ecology aggregate-evidence runtime adapter", () => {
  it("binds one directly perceived rat sign to render and close-only ABOUT without an actor", () => {
    const { evidence, patch, population, target } = fixture();
    const observed = observationAt(evidence.position);
    const projection = projectCoreEcologyAggregateEvidence({
      patch,
      ...observed,
      tileSize: 16,
      selectedTarget: target,
    });

    expect(projection).not.toBeNull();
    const selected = projection?.renderEvidence.filter(({ selected }) => selected);
    expect(selected).toHaveLength(1);
    expect(selected?.[0]).toMatchObject({
      species: "brown-rat",
      representation: "population-evidence",
      aggregateId: population.aggregateId,
      evidenceId: evidence.evidenceId,
    });
    expect(projection?.selectedAbout).toMatchObject({
      target,
      about: {
        target,
        heading: "BROWN RAT SIGNS",
        identityLine: "Brown rat population signs",
        knowledgeLabel: "Recognized",
        known: [],
      },
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection?.renderEvidence)).toBe(true);

    const encoded = JSON.stringify(projection);
    expect(encoded).not.toMatch(/actorId|RAT-v|groupSize|populationSize|populationPressure/iu);
    expect(encoded).not.toMatch(/activitySignal|causeKind|causeReferenceId|strength|createdAtTick/iu);
    expect(encoded).not.toMatch(/interaction|currentIntent|hidden/iu);
  });

  it("drops stale or no-longer-visible selection without remembering the sign", () => {
    const { evidence, patch, target } = fixture();
    const visible = observationAt(evidence.position);
    const stale = projectCoreEcologyAggregateEvidence({
      patch,
      ...visible,
      tileSize: 16,
      selectedTarget: { ...target, aggregateId: "rat-aggregate:stale" },
    });
    expect(stale?.selectedAbout).toBeNull();
    expect(stale?.renderEvidence.every(({ selected }) => !selected)).toBe(true);

    const lookingAway = projectCoreEcologyAggregateEvidence({
      patch,
      ...observationAt(evidence.position, Math.PI),
      tileSize: 16,
      selectedTarget: target,
    });
    expect(lookingAway).toEqual({ renderEvidence: [], selectedAbout: null });
  });

  it("carries non-targetable cat rain tracks through the same direct-evidence projection", () => {
    const { actorId, evidence, patch } = catRainEvidenceFixture();
    expect(deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(patch)))
      .toEqual(patch);
    const visible = projectCoreEcologyAggregateEvidence({
      patch,
      ...observationAt(evidence.position),
      tileSize: 16,
    });
    expect(visible?.renderEvidence.filter(({ species }) => species === "domestic-cat"))
      .toEqual([expect.objectContaining({
        aggregateId: actorId,
        evidenceId: evidence.evidenceId,
        species: "domestic-cat",
        representation: "individual-evidence",
        selected: false,
      })]);
    expect(visible?.selectedAbout).toBeNull();

    const lookingAway = projectCoreEcologyAggregateEvidence({
      patch,
      ...observationAt(evidence.position, Math.PI),
      tileSize: 16,
    });
    expect(lookingAway?.renderEvidence.some(({ species }) => species === "domestic-cat"))
      .toBe(false);
  });

  it("fails malformed targets, forged perception, and actor-shaped rat aliases closed", () => {
    const { evidence, patch, target } = fixture();
    const observed = observationAt(evidence.position);
    expect(projectCoreEcologyAggregateEvidence({
      patch,
      ...observed,
      tileSize: 16,
      selectedTarget: { ...target, actorId: "RAT-v1-fabricated" } as never,
    })).toBeNull();
    expect(projectCoreEcologyAggregateEvidence({
      patch,
      window: observed.window,
      perception: { ...observed.perception, signature: "perception-v2:forged" },
      tileSize: 16,
      selectedTarget: target,
    })).toBeNull();
    expect(projectCoreEcologyAggregateEvidence({
      patch,
      ...observed,
      tileSize: 16,
      selectedTarget: {
        ...target,
        evidenceId: "rat evidence with spaces",
      },
    })).toBeNull();
  });

  it("canonicalizes exact targets and compares the full aggregate/evidence pair", () => {
    const { target } = fixture();
    expect(canonicalizeCoreEcologyAggregateEvidenceTarget(target)).toEqual(target);
    expect(sameCoreEcologyAggregateEvidenceTarget(target, { ...target })).toBe(true);
    expect(sameCoreEcologyAggregateEvidenceTarget(target, {
      ...target,
      aggregateId: "rat-aggregate:other",
    })).toBe(false);
    expect(sameCoreEcologyAggregateEvidenceTarget(target, {
      ...target,
      evidenceId: "rat-evidence:other",
    })).toBe(false);
    expect(canonicalizeCoreEcologyAggregateEvidenceTarget({
      ...target,
      species: "domestic-cat",
    })).toBeNull();
  });
});
