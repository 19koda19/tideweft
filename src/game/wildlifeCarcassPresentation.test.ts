import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  applyCoreEcologyWildlifeMortality,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  replaceCoreEcologyAggregatePatchCarcass,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  coreEcologySpeciesPredatorContact,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  repositionCoreWildlifeActorWithMovementEvidence,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  claimCoreWildlifeCarcass,
  consumeCoreWildlifeCarcass,
} from "./coreWildlifeCarcass";
import {
  resolveCoreWildlifePredatorContact,
  type CoreWildlifeMortalityResult,
} from "./coreWildlifeMortality";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  projectCoreEcologyWildlifeCarcasses,
} from "./wildlifeCarcassPresentation";
import {
  projectWildlifePopulationEvidencePresentations,
  type WildlifePopulationEvidenceObservation,
} from "./wildlifePresentation";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha29 knowledge honest remains");
const ORIGIN = createRegionCoord(-2, 3);
const CONTACT_X = 48_000;
const CONTACT_Y = 34_000;

function initialPatch(): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyMarshEdgeHabitatAssemblage({
    rootSeed: SEED,
    originRegion: ORIGIN,
    focus: {
      position: createWorldPosition(
        ORIGIN,
        Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
          + WORLD_POSITION_UNITS_PER_TILE / 2,
        Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
          + WORLD_POSITION_UNITS_PER_TILE / 2,
      ),
      radiusTiles: 32,
    },
  });
  const populations: readonly CoreEcologyPopulationInput[] = habitat.populations.flatMap(
    (population) => population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation, index) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: (
              index === 0
              && (population.species === "marsh-fox" || population.species === "marsh-rabbit")
            ) ? "materialized" as const : "coarse" as const,
          })),
        }],
  );
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha29:carcass-presentation",
    originRegion: ORIGIN,
    tick: 0,
    populations,
    derivation: { kind: "habitat-v3", habitat },
  });
}

function actor(
  patch: CoreEcologyAggregatePatchState,
  species: "marsh-fox" | "marsh-rabbit",
): CoreWildlifeActorState {
  const result = patch.populations.find((population) => population.species === species)
    ?.members[0]?.actor;
  if (result === undefined) throw new Error(`Missing ${species} fixture actor`);
  return result;
}

function stageContact(
  initial: CoreEcologyAggregatePatchState,
  tick: number,
  leaveMovementEvidence: boolean,
): Readonly<{
  patch: CoreEcologyAggregatePatchState;
  result: CoreWildlifeMortalityResult;
  evidencePosition: WorldPosition;
}> {
  const initialFox = actor(initial, "marsh-fox");
  const initialRabbit = actor(initial, "marsh-rabbit");
  const foxPosition = createWorldPosition(ORIGIN, CONTACT_X, CONTACT_Y);
  const rabbitPosition = createWorldPosition(ORIGIN, CONTACT_X + 400, CONTACT_Y);
  const fedFox = replaceCoreWildlifeActorPhysiology(initialFox, {
    atTick: initialFox.updatedAtTick,
    needs: { ...initialFox.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: initialFox.condition,
  });
  const positionedFox = repositionCoreWildlifeActor(fedFox, {
    atTick: initialFox.updatedAtTick,
    position: foxPosition,
    heading: 0,
  });
  const positionedRabbit = leaveMovementEvidence
    ? repositionCoreWildlifeActorWithMovementEvidence(initialRabbit, {
        atTick: tick,
        position: rabbitPosition,
        heading: 500_000,
        strength: 800_000,
      })
    : repositionCoreWildlifeActor(initialRabbit, {
        atTick: tick,
        position: rabbitPosition,
        heading: 500_000,
      });
  const observation = createActorObservation({
    id: `obs:alpha29-presentation:${tick}`,
    observerId: positionedFox.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: positionedRabbit.identity.stableId,
    area: { center: rabbitPosition, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 900_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Contact observation was rejected");
  const pursuit = stepCoreWildlifeActor(positionedFox, {
    tick,
    observations: [observation],
    foodOpportunities: [{
      resourceId: positionedRabbit.identity.stableId,
      observationId: observation.id,
      foodClass: "live-prey",
      sourceKind: "living-actor",
      availableUnits: 1,
      nutrition: 900_000,
      effort: 10_000,
      risk: 0,
      competition: 0,
      directlyConfirmed: true,
      accessible: true,
    }],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (pursuit?.decision.intent !== "pursue") {
    throw new Error("Representative fox did not pursue the observed rabbit");
  }
  let patch = replaceCoreEcologyAggregatePatchActor(initial, positionedRabbit);
  patch = replaceCoreEcologyAggregatePatchActor(patch, pursuit.actor);
  const policy = coreEcologySpeciesPredatorContact("marsh-fox");
  if (policy === null) throw new Error("Marsh fox contact policy is missing");
  const result = resolveCoreWildlifePredatorContact({
    attacker: pursuit.actor,
    target: positionedRabbit,
    atTick: tick,
    contactRadiusUnits: policy.reachUnits,
    damageUnits: policy.damageUnits,
    cause: policy.cause,
  });
  if (result === null) throw new Error("Representative contact was rejected");
  return Object.freeze({ patch, result, evidencePosition: rabbitPosition });
}

function committedDeath(): Readonly<{
  patch: CoreEcologyAggregatePatchState;
  evidencePosition: WorldPosition;
}> {
  const first = stageContact(initialPatch(), 1, true);
  const injury = applyCoreEcologyWildlifeMortality(first.patch, {
    result: first.result,
    temperature: 500_000,
  });
  if (injury === null) throw new Error("Representative injury was rejected");
  const second = stageContact(injury.patch, 2, false);
  const death = applyCoreEcologyWildlifeMortality(second.patch, {
    result: second.result,
    temperature: 500_000,
  });
  if (death?.carcass === null || death?.transaction === null || death === null) {
    throw new Error("Representative death was not committed");
  }
  return Object.freeze({ patch: death.patch, evidencePosition: first.evidencePosition });
}

function directObservation(
  position: WorldPosition,
  facingRadians = 0,
): WildlifePopulationEvidenceObservation {
  const globalX = position.region.x * WORLD_WIDTH
    + Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE);
  const globalY = position.region.y * WORLD_HEIGHT
    + Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE);
  const width = 100;
  const cells: PerceptionCell[] = Array.from(
    { length: width },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  return Object.freeze({
    window: {
      origin: { x: globalX - 4, y: globalY },
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

function project(
  patch: CoreEcologyAggregatePatchState,
  position: WorldPosition,
  facingRadians = 0,
) {
  const observation = directObservation(position, facingRadians);
  return projectCoreEcologyWildlifeCarcasses({
    patch,
    window: observation.window,
    perception: observation.perception,
    tileSize: 16,
  });
}

describe("knowledge-honest wildlife carcass presentation", () => {
  it("projects one directly observed body without mortality or resource internals", () => {
    const { patch } = committedDeath();
    const carcass = patch.carcasses[0];
    if (carcass === undefined) throw new Error("Missing representative carcass");
    const views = project(patch, carcass.deathPosition);
    expect(views).toHaveLength(1);
    expect(views?.[0]).toMatchObject({
      version: 1,
      carcassId: carcass.carcassId,
      form: "body",
      quickLabel: "Marsh rabbit body",
      speciesIdentified: true,
    });
    expect(Object.keys(views?.[0] ?? {}).sort()).toEqual([
      "carcassId",
      "distanceUnits",
      "form",
      "orientation",
      "position",
      "quickLabel",
      "sizeScale",
      "speciesIdentified",
      "version",
    ]);
    expect(Object.isFrozen(views)).toBe(true);
    expect(Object.isFrozen(views?.[0])).toBe(true);
  });

  it("withholds the same body outside signed direct-detail sight", () => {
    const { patch } = committedDeath();
    const carcass = patch.carcasses[0];
    if (carcass === undefined) throw new Error("Missing representative carcass");
    expect(project(patch, carcass.deathPosition, Math.PI)).toEqual([]);
  });

  it("retains and distinguishes a depleted body instead of deleting it", () => {
    const { patch } = committedDeath();
    const carcass = patch.carcasses[0];
    const fox = actor(patch, "marsh-fox");
    if (carcass === undefined) throw new Error("Missing representative carcass");
    const claimed = claimCoreWildlifeCarcass(carcass, {
      actorId: fox.identity.stableId,
      provenanceId: "claim:alpha29:presentation",
      atTick: patch.updatedAtTick,
    });
    const depleted = claimed === null ? null : consumeCoreWildlifeCarcass(claimed, {
      actorId: fox.identity.stableId,
      units: claimed.remainingResourceUnits,
      atTick: patch.updatedAtTick,
    });
    const depletedPatch = depleted === null
      ? null
      : replaceCoreEcologyAggregatePatchCarcass(patch, depleted);
    if (depletedPatch === null) throw new Error("Could not persist depleted remains");
    expect(depletedPatch.carcasses).toHaveLength(1);
    expect(project(depletedPatch, carcass.deathPosition)?.[0]).toMatchObject({
      carcassId: carcass.carcassId,
      form: "depleted-remains",
      quickLabel: "Marsh rabbit remains",
    });
  });

  it("keeps a retired animal's still-valid movement evidence visible", () => {
    const { patch, evidencePosition } = committedDeath();
    const observation = directObservation(evidencePosition);
    const evidence = projectWildlifePopulationEvidencePresentations({
      patch,
      observation,
      tileSize: 16,
    });
    expect(evidence?.filter(({ species }) => species === "marsh-rabbit")).toHaveLength(1);
    expect(evidence?.find(({ species }) => species === "marsh-rabbit")).toMatchObject({
      representation: "individual-evidence",
      form: "paired-tracks",
    });
  });

  it("fails closed for malformed authority rather than rendering a guessed body", () => {
    const { patch } = committedDeath();
    const carcass = patch.carcasses[0];
    if (carcass === undefined) throw new Error("Missing representative carcass");
    const observation = directObservation(carcass.deathPosition);
    expect(projectCoreEcologyWildlifeCarcasses({
      patch: { ...patch, debug: true },
      window: observation.window,
      perception: observation.perception,
      tileSize: 16,
    })).toBeNull();
  });
});
