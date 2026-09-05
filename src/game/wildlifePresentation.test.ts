import { describe, expect, it } from "vitest";

import {
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  createActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "./coreEcologyHabitat";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  projectWildlifePopulationEvidencePresentations,
  projectWildlifePresentation,
  type WildlifeDirectObservation,
  type WildlifePopulationEvidenceObservation,
} from "./wildlifePresentation";
import { createWorldPosition, type WorldPosition } from "./worldPosition";

function wildlife(species: CoreWildlifeSpecies): CoreWildlifeActorState {
  const region = createRegionCoord(-4, 9);
  return createCoreWildlifeActorState({
    seed: [17, 29, 41, 53],
    species,
    originRegion: region,
    populationKey: `presentation-${species}`,
    populationOrdinal: 2,
    position: createWorldPosition(region, 24_000, 35_000),
    tick: 10,
  });
}

function directObservation(
  actor: CoreWildlifeActorState,
  distanceTiles = 4,
  options: Readonly<{ facingRadians?: number; visibleAggregateCount?: number }> = {},
): WildlifeDirectObservation {
  const actorGlobalX = actor.address.position.region.x * WORLD_WIDTH
    + Math.floor(actor.address.position.localX / 1_000);
  const actorGlobalY = actor.address.position.region.y * WORLD_HEIGHT
    + Math.floor(actor.address.position.localY / 1_000);
  const width = Math.max(100, distanceTiles + 2);
  const cells: PerceptionCell[] = Array.from(
    { length: width },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  return Object.freeze({
    window: {
      origin: { x: actorGlobalX - distanceTiles, y: actorGlobalY },
      terrain: { width, height: 1 },
    },
    perception: evaluatePerception({
      columns: width,
      rows: 1,
      cells,
      playerTileIndex: 0,
      facingRadians: options.facingRadians ?? 0,
      weatherVisibility: 1,
      rangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 128,
        forwardConeRadians: Math.PI / 2,
      },
      detailRangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 128,
        forwardConeRadians: Math.PI / 2,
      },
    }),
    ...(options.visibleAggregateCount === undefined
      ? {}
      : { visibleAggregateCount: options.visibleAggregateCount }),
  });
}

function ratEvidenceFixture() {
  const seed = seedFromText("presentation-rat-evidence");
  const originRegion = createRegionCoord(0, 0);
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
    patchKey: "presentation-rat-evidence",
    originRegion,
    populations,
    derivation: { kind: "habitat-v2", habitat },
    tick: 10,
  });
  const population = patch.aggregatePopulations[0];
  const evidence = population?.evidence[0];
  if (population === undefined || evidence === undefined) {
    throw new Error("Rat evidence fixture requires a supported aggregate population");
  }
  return { evidence, patch, population };
}

function catEvidenceFixture() {
  const seed = seedFromText("presentation-cat-rain-evidence");
  const originRegion = createRegionCoord(0, 0);
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
            materialization: population.species === "domestic-cat"
              && allocation.allocationOrdinal === 0
              ? "materialized" as const
              : "coarse" as const,
          })),
        }],
  );
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "presentation-cat-rain-evidence",
    originRegion,
    populations,
    derivation: { kind: "habitat-v2", habitat },
    tick: 10,
  });
  const catPopulation = patch.populations.find(({ species }) => species === "domestic-cat");
  const cat = catPopulation?.members.find(({ materialization }) => (
    materialization === "materialized"
  ))?.actor;
  if (cat === undefined) throw new Error("Cat evidence fixture requires one actor");
  const rain = createActorObservation({
    id: "observation:cat-direct-rain",
    observerId: cat.identity.stableId,
    observedAtTick: 11,
    channel: "hearing",
    perceivedClass: "rain-exposure",
    subjectId: null,
    area: {
      center: cat.address.position,
      radiusUnits: MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
    },
    confidence: 680_000,
    salience: 680_000,
    identification: "anonymous",
  });
  if (rain === null) throw new Error("Cat evidence fixture rain observation is invalid");
  const stepped = stepCoreEcologyAggregatePatch(patch, {
    tick: 11,
    actorSteps: [{
      actorId: cat.identity.stableId,
      observations: [rain],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  if (stepped === null) throw new Error("Cat evidence fixture failed to step");
  const steppedCat = stepped.patch.populations
    .find(({ species }) => species === "domestic-cat")
    ?.members.find(({ actor }) => actor.identity.stableId === cat.identity.stableId)?.actor;
  const evidence = steppedCat?.memories.flatMap(({ environmentalEvidence }) => (
    environmentalEvidence === undefined ? [] : [environmentalEvidence]
  ))[0];
  if (steppedCat === undefined || evidence === undefined) {
    throw new Error("Cat rain response did not leave bounded evidence");
  }
  return { cat: steppedCat, evidence, patch: stepped.patch };
}

function evidenceObservation(
  position: WorldPosition,
  distanceTiles = 4,
  facingRadians = 0,
): WildlifePopulationEvidenceObservation {
  const evidenceGlobalX = position.region.x * WORLD_WIDTH
    + Math.floor(position.localX / 1_000);
  const evidenceGlobalY = position.region.y * WORLD_HEIGHT
    + Math.floor(position.localY / 1_000);
  const width = Math.max(100, distanceTiles + 2);
  const cells: PerceptionCell[] = Array.from(
    { length: width },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  return Object.freeze({
    window: {
      origin: { x: evidenceGlobalX - distanceTiles, y: evidenceGlobalY },
      terrain: { width, height: 1 },
    },
    perception: evaluatePerception({
      columns: width,
      rows: 1,
      cells,
      playerTileIndex: 0,
      facingRadians,
      weatherVisibility: 1,
      rangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 128,
        forwardConeRadians: Math.PI / 2,
      },
      detailRangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 128,
        forwardConeRadians: Math.PI / 2,
      },
    }),
  });
}

function pressuredPursuingBear(): CoreWildlifeActorState {
  const actor = wildlife("black-bear");
  const candidate = canonicalizeCoreWildlifeActorState({
    ...actor,
    condition: { health: 200_000, exhaustion: 800_000, stress: 900_000 },
    needs: { hunger: 990_000, safety: 880_000, rest: 770_000 },
    intent: {
      kind: "pursue",
      cause: { kind: "perception", referenceId: "observation:hidden-prey" },
      focusObservationId: "observation:hidden-prey",
      resourceReference: {
        resourceId: "actor:hidden-prey",
        observationId: "observation:hidden-prey",
        foodClass: "live-prey",
        sourceKind: "living-actor",
        observedAvailableUnits: 1,
      },
      enteredAtTick: 10,
      expiresAtTick: 20,
    },
  });
  if (candidate === null) throw new Error("wildlife fixture should remain canonical");
  return candidate;
}

describe("knowledge-honest wildlife presentation", () => {
  it.each([
    ["deer", "Deer"],
    ["gull", "Gulls"],
    ["black-bear", "Black bear"],
    ["domestic-cat", "Domestic cat"],
  ] as const)("projects a directly detailed %s without simulation internals", (species, label) => {
    const actor = wildlife(species);
    const presentation = projectWildlifePresentation({
      actor,
      observation: directObservation(actor),
      tileSize: 16,
      selected: true,
    });

    expect(presentation).toMatchObject({
      actorId: actor.identity.stableId,
      species,
      quickLabel: label,
      speciesIdentified: true,
      behavior: "watch",
      behaviorLabel: "Watching",
      selected: true,
    });
    expect(presentation?.appearanceLabel).toBeDefined();
    if (species === "gull") expect(presentation).not.toHaveProperty("lifeStageLabel");
    else expect(presentation?.lifeStageLabel).toBeDefined();
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation?.conditionLabels)).toBe(true);
  });

  it("projects canonical brown-rat physical evidence without inventing actors or counts", () => {
    const { evidence, patch, population } = ratEvidenceFixture();
    const presentations = projectWildlifePopulationEvidencePresentations({
      patch,
      observation: evidenceObservation(evidence.position),
      tileSize: 16,
      selectedEvidenceId: evidence.evidenceId,
    });

    expect(presentations).toHaveLength(1);
    expect(presentations?.[0]).toMatchObject({
      version: 1,
      aggregateId: population.aggregateId,
      evidenceId: evidence.evidenceId,
      species: "brown-rat",
      representation: "population-evidence",
      quickLabel: "Brown rat signs",
      identityLabel: "Brown rat population signs",
      speciesIdentified: true,
      selected: true,
    });
    expect(presentations?.[0]).not.toHaveProperty("actorId");
    expect(presentations?.[0]).not.toHaveProperty("groupSize");
    expect(presentations?.[0]).not.toHaveProperty("populationSize");
    expect(presentations?.[0]).not.toHaveProperty("activitySignal");
    expect(presentations?.[0]).not.toHaveProperty("causeKind");
    expect(presentations?.[0]).not.toHaveProperty("strength");
    expect(Object.isFrozen(presentations)).toBe(true);
    expect(Object.isFrozen(presentations?.[0])).toBe(true);
  });

  it("projects saved cat rain tracks only through signed direct detail", () => {
    const { cat, evidence, patch } = catEvidenceFixture();
    const presentations = projectWildlifePopulationEvidencePresentations({
      patch,
      observation: evidenceObservation(evidence.position),
      tileSize: 16,
      // Individual tracks deliberately remain non-targetable in this slice.
      selectedEvidenceId: evidence.evidenceId,
    });

    expect(presentations?.filter(({ species }) => species === "domestic-cat")).toEqual([
      expect.objectContaining({
        version: 1,
        aggregateId: cat.identity.stableId,
        evidenceId: evidence.evidenceId,
        species: "domestic-cat",
        representation: "individual-evidence",
        form: "small-tracks",
        quickLabel: "Domestic cat signs",
        evidenceLabel: "Wet cat pawprints",
        speciesIdentified: true,
        selected: false,
      }),
    ]);
    const catPresentation = presentations?.find(({ species }) => species === "domestic-cat");
    expect(catPresentation).not.toHaveProperty("causeReferenceId");
    expect(catPresentation).not.toHaveProperty("strength");
    expect(catPresentation).not.toHaveProperty("memories");
    expect(projectWildlifePopulationEvidencePresentations({
      patch,
      observation: evidenceObservation(evidence.position, 4, Math.PI),
      tileSize: 16,
    })).toEqual([]);
  });

  it("keeps distant rat signs uncertain and fails closed for forged perception/state", () => {
    const { evidence, patch } = ratEvidenceFixture();
    const distant = projectWildlifePopulationEvidencePresentations({
      patch,
      observation: evidenceObservation(evidence.position, 60),
      tileSize: 1,
    });
    expect(distant).toHaveLength(1);
    expect(distant?.[0]).toMatchObject({
      quickLabel: "Small-animal signs",
      identityLabel: "Unidentified small-animal signs",
      speciesIdentified: false,
    });

    const observed = evidenceObservation(evidence.position);
    expect(projectWildlifePopulationEvidencePresentations({
      patch,
      observation: {
        ...observed,
        perception: { ...observed.perception, signature: "perception-v2:forged" },
      },
      tileSize: 1,
    })).toBeNull();
    expect(projectWildlifePopulationEvidencePresentations({
      patch: {
        ...patch,
        aggregatePopulations: patch.aggregatePopulations.map((population, index) => index === 0
          ? { ...population, populationSize: population.populationSize + 1 }
          : population),
      },
      observation: observed,
      tileSize: 1,
    })).toBeNull();
    expect(projectWildlifePopulationEvidencePresentations({
      patch,
      observation: { ...observed, visibleAggregateCount: 12 } as WildlifePopulationEvidenceObservation,
      tileSize: 1,
    })).toBeNull();
  });

  it("withholds species and fine details when direct sight lacks clarity", () => {
    const deer = wildlife("deer");
    const gull = wildlife("gull");
    const bear = wildlife("black-bear");
    const deerView = projectWildlifePresentation({
      actor: deer,
      observation: directObservation(deer, 90),
      tileSize: 1,
    });
    const gullView = projectWildlifePresentation({
      actor: gull,
      observation: directObservation(gull, 90, { visibleAggregateCount: 7 }),
      tileSize: 1,
    });
    const bearView = projectWildlifePresentation({
      actor: bear,
      observation: directObservation(bear, 80),
      tileSize: 1,
    });

    expect(deerView).toMatchObject({ quickLabel: "Unknown animal", speciesIdentified: false });
    expect(gullView).toMatchObject({
      quickLabel: "Unknown birds",
      speciesIdentified: false,
      groupSize: 5,
    });
    expect(bearView).toMatchObject({ quickLabel: "Large animal", speciesIdentified: false });
    for (const view of [deerView, gullView, bearView]) {
      expect(view).not.toHaveProperty("appearanceLabel");
      expect(view).not.toHaveProperty("lifeStageLabel");
      expect(view?.conditionLabels).toEqual([]);
    }
  });

  it("buckets visible gull representatives and rejects hidden population substitutes", () => {
    const gull = wildlife("gull");
    const view = projectWildlifePresentation({
      actor: gull,
      observation: directObservation(gull, 4, { visibleAggregateCount: 19 }),
      tileSize: 1,
    });
    expect(view?.groupSize).toBe(20);
    expect(view?.groupSize).not.toBe(19);
    expect(projectWildlifePresentation({
      actor: gull,
      observation: directObservation(gull, 4, { visibleAggregateCount: 25 }),
      tileSize: 1,
    })).toBeNull();
    const cat = wildlife("domestic-cat");
    expect(projectWildlifePresentation({
      actor: cat,
      observation: directObservation(cat, 4, { visibleAggregateCount: 2 }),
      tileSize: 1,
    })).toBeNull();

    const deer = wildlife("deer");
    expect(projectWildlifePresentation({
      actor: deer,
      observation: directObservation(deer, 4, { visibleAggregateCount: 4 }),
      tileSize: 1,
    })).toBeNull();
    expect(projectWildlifePresentation({
      actor: gull,
      observation: directObservation(gull),
      tileSize: 1,
    })).not.toHaveProperty("groupSize");
  });

  it("uses observable wording without leaking needs, target, causes, or raw meters", () => {
    const bear = pressuredPursuingBear();
    const presentation = projectWildlifePresentation({
      actor: bear,
      observation: directObservation(bear),
      tileSize: 16,
    });
    expect(presentation).toMatchObject({
      behavior: "pursue",
      behaviorLabel: "Moving with focus",
      conditionLabels: ["MOVING POORLY", "EXHAUSTED", "DISTRESSED"],
    });
    const encoded = JSON.stringify(presentation);
    expect(encoded).not.toMatch(/hidden-prey|resourceReference|focusObservationId|referenceId/iu);
    expect(encoded).not.toMatch(/"needs"|"hunger"|"safety"|"health"|"stress"|"exhaustion"/u);
    expect(encoded).not.toMatch(/200000|800000|900000|990000|880000|770000/u);
  });

  it("requires a valid signed, matching, direct-detail perception frame", () => {
    const actor = wildlife("deer");
    const observed = directObservation(actor);
    expect(projectWildlifePresentation({
      actor,
      observation: {
        ...observed,
        perception: { ...observed.perception, signature: "perception-v2:forged" },
      },
      tileSize: 1,
    })).toBeNull();
    expect(projectWildlifePresentation({
      actor,
      observation: directObservation(actor, 4, { facingRadians: Math.PI }),
      tileSize: 1,
    })).toBeNull();
    expect(projectWildlifePresentation({
      actor,
      observation: { ...observed, hiddenPopulation: 12 } as WildlifeDirectObservation,
      tileSize: 1,
    })).toBeNull();
  });
});
