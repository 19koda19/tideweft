import { describe, expect, it, vi } from "vitest";

import { createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { hashCanonical } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { projectCoreEcologyAggregateEvidence } from "./coreEcologyEvidenceRuntime";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import { createCoreEcologyMortalityTransaction } from "./coreEcologyMortality";
import {
  projectCoreEcologyWildlife,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import {
  replaceCoreWildlifeActorPhysiology,
} from "./coreWildlifeActor";
import { createCoreWildlifeCarcass } from "./coreWildlifeCarcass";
import {
  CORE_WILDLIFE_MORTALITY_VERSION,
  type CoreWildlifeMortalityEvent,
} from "./coreWildlifeMortality";
import {
  VISIBILITY_DIRECT,
  evaluatePerception,
  type PerceptionCell,
  type PerceptionResult,
} from "./perception";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import { projectRuntimeCoreEcologyPresentationBatch } from "./runtimeCoreEcologyPresentationBatch";
import { projectCoreEcologyWildlifeCarcasses } from "./wildlifeCarcassPresentation";
import * as observationFrames from "./wildlifeObservationFrame";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

const SEED = seedFromText("runtime core ecology presentation batch");
const ORIGIN = createRegionCoord(-7, 11);
const TILE_SIZE = 16;

function representativePatch(): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: SEED,
    originRegion: ORIGIN,
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
            materialization: population.species === "domestic-cat" && index === 0
              ? "materialized" as const
              : "coarse" as const,
          })),
        }],
  );
  const initial = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "runtime/presentation-batch",
    originRegion: ORIGIN,
    tick: 17,
    populations,
    derivation: { kind: "habitat-v2", habitat },
  });
  const victimPopulation = initial.populations.find(({ species }) => species === "deer");
  const victim = victimPopulation?.members[0];
  const attacker = initial.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (victimPopulation === undefined || victim === undefined || attacker === undefined) {
    throw new Error("Presentation-batch fixture requires one deer and one bear");
  }

  const terminalVictim = replaceCoreWildlifeActorPhysiology(victim.actor, {
    atTick: initial.updatedAtTick,
    needs: victim.actor.needs,
    condition: { ...victim.actor.condition, health: 0 },
  });
  const deltaX = attacker.actor.address.position.localX
    - terminalVictim.address.position.localX;
  const deltaY = attacker.actor.address.position.localY
    - terminalVictim.address.position.localY;
  const eventBody = Object.freeze({
    version: CORE_WILDLIFE_MORTALITY_VERSION,
    atTick: initial.updatedAtTick,
    cause: "predator-contact" as const,
    causeReferenceId: "obs:presentation-batch:death",
    observationId: "obs:presentation-batch:death",
    attackerId: attacker.actor.identity.stableId,
    victimId: terminalVictim.identity.stableId,
    attackerPosition: attacker.actor.address.position,
    victimPosition: terminalVictim.address.position,
    contactRadiusUnits: WORLD_POSITION_UNITS_PER_TILE,
    contactDistanceSquaredUnits: deltaX * deltaX + deltaY * deltaY,
    damageUnits: victim.actor.condition.health,
    healthBefore: victim.actor.condition.health,
    healthAfter: 0,
    outcome: "death" as const,
  });
  const event: CoreWildlifeMortalityEvent = Object.freeze({
    ...eventBody,
    eventId: `wildlife-harm:${hashCanonical(eventBody)}`,
  });
  const carcass = createCoreWildlifeCarcass({
    mortalityEvent: event,
    sourceSpecies: terminalVictim.identity.species,
    bodySizeUnits: 1,
    resourceUnits: 1,
    temperature: 500_000,
  });
  if (carcass === null) throw new Error("Presentation-batch carcass was rejected");
  const transaction = createCoreEcologyMortalityTransaction({
    mortalityOrdinal: 0,
    event,
    retiredActor: terminalVictim,
    representedUnitsBefore: victim.representedUnits,
    carcassId: carcass.carcassId,
  });
  const committed = canonicalizeCoreEcologyAggregatePatch({
    ...initial,
    populations: initial.populations.map((population) => (
      population !== victimPopulation
        ? population
        : {
            ...population,
            populationSize: population.populationSize - 1,
            reserveUnits: population.reserveUnits + victim.representedUnits - 1,
            members: population.members.filter(({ populationOrdinal }) => (
              populationOrdinal !== victim.populationOrdinal
            )),
          }
    )),
    nextMortalityOrdinal: 1,
    mortalityTransactions: [transaction],
    carcasses: [carcass],
  });
  if (committed === null) throw new Error("Presentation-batch death did not commit");
  return committed;
}

function observation(): Readonly<{
  window: CoreEcologyRuntimeWindow;
  perception: PerceptionResult;
}> {
  const regionOrigin = regionLocalToGlobalTile(ORIGIN, 0, 0);
  const window = Object.freeze({
    origin: Object.freeze({ x: regionOrigin.x + 20, y: regionOrigin.y + 10 }),
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
  const cells: PerceptionCell[] = Array.from(
    { length: REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  const perception = evaluatePerception({
    columns: window.terrain.width,
    rows: window.terrain.height,
    cells,
    playerTileIndex: 60 * REGIONAL_TRAVEL_COLUMNS + 56,
    facingRadians: 0,
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

function input() {
  const patch = representativePatch();
  const { window, perception } = observation();
  const weather = Object.freeze({
    kind: "clear" as const,
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: patch.updatedAtTick + 50,
  });
  return Object.freeze({
    patch,
    window,
    perception,
    weather,
    batch: {
      sources: [{
        sourceKey: patch.patchKey,
        patch,
        activityAuthorities: [],
      }],
      window,
      perception,
      tileSize: TILE_SIZE,
      weather,
      selectedWildlifeTarget: null,
      selectedEvidenceTarget: null,
    },
  });
}

describe("runtime core-ecology presentation batch", () => {
  it("matches the selection-free public projectors and closes its frozen frame", () => {
    const fixture = input();
    const legacyWildlife = projectCoreEcologyWildlife({
      patch: fixture.patch,
      window: fixture.window,
      perception: fixture.perception,
      tileSize: TILE_SIZE,
      weather: fixture.weather,
      selectedTarget: null,
    });
    const legacyCarcasses = projectCoreEcologyWildlifeCarcasses({
      patch: fixture.patch,
      window: fixture.window,
      perception: fixture.perception,
      tileSize: TILE_SIZE,
    });
    const legacyEvidence = projectCoreEcologyAggregateEvidence({
      patch: fixture.patch,
      window: fixture.window,
      perception: fixture.perception,
      tileSize: TILE_SIZE,
    });
    if (
      legacyWildlife === null
      || legacyCarcasses === null
      || legacyEvidence === null
    ) throw new Error("Representative public projection failed");

    const createFrame = vi.spyOn(observationFrames, "createWildlifeObservationFrame");
    const projected = projectRuntimeCoreEcologyPresentationBatch(fixture.batch);
    const frame = createFrame.mock.results[0]?.value;
    createFrame.mockRestore();

    expect(legacyWildlife).toHaveLength(1);
    expect(legacyCarcasses).toHaveLength(1);
    expect(legacyEvidence.renderEvidence).toHaveLength(3);
    expect(projected).toEqual({
      wildlife: legacyWildlife,
      carcasses: legacyCarcasses,
      aggregateEvidence: legacyEvidence.renderEvidence,
      selectedEvidenceAbout: null,
    });
    expect(Object.keys(projected ?? {}).sort()).toEqual([
      "aggregateEvidence",
      "carcasses",
      "selectedEvidenceAbout",
      "wildlife",
    ]);
    expect(Object.isFrozen(projected)).toBe(true);
    for (const values of [
      projected?.wildlife,
      projected?.carcasses,
      projected?.aggregateEvidence,
    ]) {
      expect(Object.isFrozen(values)).toBe(true);
      expect(values?.every((value) => Object.isFrozen(value))).toBe(true);
    }
    expect(frame).not.toBeNull();
    expect(observationFrames.isWildlifeObservationFrame(frame)).toBe(false);
    expect(Object.values(projected ?? {}).some((value) => (
      observationFrames.isWildlifeObservationFrame(value)
    ))).toBe(false);
  });

  it("rejects one forged mutable detail mask without returning partial output", () => {
    const fixture = input();
    const detailVisibilityGrades = fixture.perception.detailVisibilityGrades.slice();
    const hiddenIndex = detailVisibilityGrades.findIndex((grade) => grade !== VISIBILITY_DIRECT);
    if (hiddenIndex < 0) throw new Error("Perception fixture requires one non-direct tile");
    detailVisibilityGrades[hiddenIndex] = VISIBILITY_DIRECT;
    const forged: PerceptionResult = {
      ...fixture.perception,
      detailVisibilityGrades,
    };

    expect(projectRuntimeCoreEcologyPresentationBatch({
      ...fixture.batch,
      perception: forged,
    })).toBeNull();
  });

  it("rejects an alias key rather than duplicating one authoritative patch", () => {
    const fixture = input();
    const source = fixture.batch.sources[0];
    if (source === undefined) throw new Error("Presentation batch requires one source");

    expect(projectRuntimeCoreEcologyPresentationBatch({
      ...fixture.batch,
      sources: [
        source,
        { ...source, sourceKey: `${source.sourceKey}/alias` },
      ],
    })).toBeNull();
  });

  it("matches the public ABOUT projection and selects only the exact evidence identity", () => {
    const fixture = input();
    const population = fixture.patch.aggregatePopulations[0];
    const evidence = population?.evidence[1];
    if (population === undefined || evidence === undefined) {
      throw new Error("Presentation-batch fixture requires two aggregate signs");
    }
    const selectedTarget = Object.freeze({
      species: population.species,
      aggregateId: population.aggregateId,
      evidenceId: evidence.evidenceId,
    });
    const legacy = projectCoreEcologyAggregateEvidence({
      patch: fixture.patch,
      window: fixture.window,
      perception: fixture.perception,
      tileSize: TILE_SIZE,
      selectedTarget,
    });
    const projected = projectRuntimeCoreEcologyPresentationBatch({
      ...fixture.batch,
      selectedEvidenceTarget: selectedTarget,
    });
    if (legacy === null || legacy.selectedAbout === null || projected === null) {
      throw new Error("Visible selected evidence did not project an ABOUT surface");
    }

    expect(projected.aggregateEvidence).toEqual(legacy.renderEvidence);
    expect(projected.selectedEvidenceAbout).toEqual(legacy.selectedAbout);
    expect(projected.selectedEvidenceAbout?.target).toEqual(selectedTarget);
    expect(projected.aggregateEvidence.filter(({ selected }) => selected)).toEqual([
      expect.objectContaining({
        species: selectedTarget.species,
        aggregateId: selectedTarget.aggregateId,
        evidenceId: selectedTarget.evidenceId,
        selected: true,
      }),
    ]);
    expect(projected.aggregateEvidence
      .filter(({ evidenceId }) => evidenceId !== selectedTarget.evidenceId)
      .every(({ selected }) => selected === false)).toBe(true);
  });
});
