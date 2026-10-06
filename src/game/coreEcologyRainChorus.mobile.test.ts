import { describe, expect, it } from "vitest";

import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import type { TideweftView } from "../render/types";
import { commandForWorldTap, usesCoarseWorldPointer } from "../render/worldTap";
import {
  isDirectlyDetailPerceived,
  isWithinPlayerRecognitionRange,
  PLAYER_RECOGNITION_PRESENTATION_RANGE,
} from "../render/perceptionPresentation";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { projectCoreEcologyAggregateEvidence } from "./coreEcologyEvidenceRuntime";
import {
  deriveCoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  createCoreWildlifeActorState,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  DEFAULT_PERCEPTION_RANGES,
  evaluatePerception,
  type PerceptionCell,
} from "./perception";
import {
  projectWildlifePresentation,
  type WildlifeDirectObservation,
  type WildlifePopulationEvidenceObservation,
  type WildlifePresentation,
  type WildlifePopulationEvidencePresentation,
} from "./wildlifePresentation";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";
import {
  projectWildlifeLivingActorInspection,
  resolveActorAboutSurface,
} from "../ui/livingActorAbout";
import { resolveWildlifeEvidenceAboutSurface } from "../ui/wildlifeEvidenceAbout";

export const OWNER_INTENT = "test:core-ecology-rain-chorus-mobile:v1" as const;

const MOBILE_TILE_SIZE = 5;
const DESKTOP_TILE_SIZE = 12;
const REGION = createRegionCoord(3, -7);
const OBSERVATION_COLUMNS = 100;
const OBSERVATION_ROWS = 9;
const OBSERVER_ROW = 4;
const RECOGNIZABLE_TARGET_COLUMN = 14;
const BROAD_ONLY_TARGET_COLUMN = 30;

describe("Rain Chorus mobile parity", () => {
  // These are the renderer-neutral data and coarse-pointer contracts consumed
  // by both mobile renderers. Browser layout/device smoke remains separate
  // release evidence and is not inferred from this host-side suite.
  it.each([
    ["fish-crow", "FISH CROW FLOCK", "Fish crow"],
    ["northern-harrier", "NORTHERN HARRIER", "Northern harrier"],
  ] as const)("keeps touch selection and ABOUT knowledge-honest for %s", (
    species,
    heading,
    speciesLabel,
  ) => {
    const actor = wildlife(species);
    const observation = directObservation(
      actor.address.position,
      species === "fish-crow" ? 3 : undefined,
    );
    const mobile = presentation(actor, observation, MOBILE_TILE_SIZE);
    const desktop = presentation(actor, observation, DESKTOP_TILE_SIZE);
    const inspection = projectWildlifeLivingActorInspection(actor, observation);
    if (inspection === null) throw new Error(`${species} mobile ABOUT projection failed`);
    const about = resolveActorAboutSurface({ selectedLivingActor: inspection });

    expect(usesCoarseWorldPointer("touch", false)).toBe(true);
    expect(mobile).toMatchObject({
      actorId: actor.identity.stableId,
      species,
      selected: false,
    });
    expect(desktop).toMatchObject({
      actorId: actor.identity.stableId,
      species,
    });
    expect(mobile.position.x / MOBILE_TILE_SIZE)
      .toBeCloseTo(desktop.position.x / DESKTOP_TILE_SIZE, 8);
    expect(mobile.position.y / MOBILE_TILE_SIZE)
      .toBeCloseTo(desktop.position.y / DESKTOP_TILE_SIZE, 8);
    expect(about).toMatchObject({
      species,
      heading,
      knowledgeLabel: "Recognized",
      known: [],
      closeCommand: {
        type: "living-actor",
        action: "close",
        target: { species, actorId: actor.identity.stableId },
      },
    });
    expect(about?.observed).toContainEqual({ label: "Species", value: speciesLabel });
    expect(JSON.stringify(about)).not.toMatch(/hunger|populationSize|focusObservationId/iu);

    const mobileView = mobileTapView([mobile], [], observation);
    expect(Math.hypot(
      mobile.position.x - mobileView.player.position.x,
      mobile.position.y - mobileView.player.position.y,
    ) / MOBILE_TILE_SIZE).toBeGreaterThan(PLAYER_RECOGNITION_PRESENTATION_RANGE.closeRangeTiles);
    expect(isWithinPlayerRecognitionRange(mobileView, mobile.position)).toBe(true);
    const coarseCommand = commandForWorldTap(
      mobileView,
      { entity: "living-actor", species, id: actor.identity.stableId },
      { x: mobile.position.x + 1, y: mobile.position.y + 1 },
      true,
    );
    expect(coarseCommand).toEqual({
      type: "select",
      entity: "living-actor",
      species,
      id: actor.identity.stableId,
      point: mobile.position,
    });

    const farObservation = directObservation(
      actor.address.position,
      undefined,
      BROAD_ONLY_TARGET_COLUMN,
    );
    const farBody = presentation(actor, farObservation, MOBILE_TILE_SIZE);
    const farView = mobileTapView([farBody], [], farObservation);
    expect(farView.wildlife).toContain(farBody);
    expect(isDirectlyDetailPerceived(farView.terrain, farBody.position, true)).toBe(true);
    expect(isWithinPlayerRecognitionRange(farView, farBody.position)).toBe(false);
    const farTap = { x: farBody.position.x + 1, y: farBody.position.y + 1 };
    expect(commandForWorldTap(
      farView,
      { entity: "living-actor", species, id: actor.identity.stableId },
      farTap,
      true,
    )).toEqual({ type: "move-target", point: farTap, additive: false });
  });

  it("keeps frog population evidence touch-selectable without inventing a frog actor", () => {
    const { patch, evidence, population } = frogFixture();
    const observation = evidenceObservation(evidence.position);
    const selectedTarget = {
      species: "southern-leopard-frog" as const,
      aggregateId: population.aggregateId,
      evidenceId: evidence.evidenceId,
    };
    const mobile = projectCoreEcologyAggregateEvidence({
      patch,
      window: observation.window,
      perception: observation.perception,
      tileSize: MOBILE_TILE_SIZE,
      selectedTarget,
    });
    const desktop = projectCoreEcologyAggregateEvidence({
      patch,
      window: observation.window,
      perception: observation.perception,
      tileSize: DESKTOP_TILE_SIZE,
      selectedTarget,
    });
    if (mobile === null || desktop === null || mobile.selectedAbout === null) {
      throw new Error("Frog mobile evidence projection failed");
    }
    const mobileSign = mobile.renderEvidence.find(({ evidenceId }) => (
      evidenceId === evidence.evidenceId
    ));
    const desktopSign = desktop.renderEvidence.find(({ evidenceId }) => (
      evidenceId === evidence.evidenceId
    ));
    if (mobileSign === undefined || desktopSign === undefined) {
      throw new Error("Selected frog evidence was not rendered at both viewport scales");
    }
    const about = resolveWildlifeEvidenceAboutSurface({
      selectedWildlifeEvidence: mobile.selectedAbout,
    });

    expect(mobileSign).toMatchObject({
      ...selectedTarget,
      representation: "population-evidence",
      form: "frog-tracks",
      selected: true,
    });
    expect(mobileSign.position.x / MOBILE_TILE_SIZE)
      .toBeCloseTo(desktopSign.position.x / DESKTOP_TILE_SIZE, 8);
    expect(mobileSign.position.y / MOBILE_TILE_SIZE)
      .toBeCloseTo(desktopSign.position.y / DESKTOP_TILE_SIZE, 8);
    expect(about).toMatchObject({
      species: "southern-leopard-frog",
      representation: "population-evidence",
      heading: "SOUTHERN LEOPARD FROG SIGNS",
      knowledgeLabel: "Recognized",
      known: [],
      closeCommand: {
        type: "aggregate-wildlife-evidence",
        action: "close",
        target: selectedTarget,
      },
    });
    expect(JSON.stringify({ mobileSign, about }))
      .not.toMatch(/actorId|populationSize|activitySignal|rainIntensity/iu);

    const mobileView = mobileTapView([], mobile.renderEvidence, observation);
    expect(isWithinPlayerRecognitionRange(mobileView, mobileSign.position)).toBe(true);
    expect(commandForWorldTap(
      mobileView,
      { entity: "aggregate-wildlife-evidence", ...selectedTarget },
      { x: mobileSign.position.x + 1, y: mobileSign.position.y + 1 },
      true,
    )).toEqual({
      type: "select",
      entity: "aggregate-wildlife-evidence",
      ...selectedTarget,
      point: mobileSign.position,
    });

    const farObservation = observationAt(evidence.position, BROAD_ONLY_TARGET_COLUMN);
    const farProjection = projectCoreEcologyAggregateEvidence({
      patch,
      window: farObservation.window,
      perception: farObservation.perception,
      tileSize: MOBILE_TILE_SIZE,
    });
    const farSign = farProjection?.renderEvidence.find(({ evidenceId }) => (
      evidenceId === evidence.evidenceId
    ));
    if (farProjection === null || farSign === undefined) {
      throw new Error("Broad-only frog evidence must remain physically projected");
    }
    const farView = mobileTapView([], farProjection.renderEvidence, farObservation);
    expect(farView.wildlife).toEqual([]);
    expect(isDirectlyDetailPerceived(farView.terrain, farSign.position, true)).toBe(true);
    expect(isWithinPlayerRecognitionRange(farView, farSign.position)).toBe(false);
    const farTap = { x: farSign.position.x + 1, y: farSign.position.y + 1 };
    expect(commandForWorldTap(
      farView,
      { entity: "aggregate-wildlife-evidence", ...selectedTarget },
      farTap,
      true,
    )).toEqual({ type: "move-target", point: farTap, additive: false });
  });
});

function wildlife(species: Extract<CoreWildlifeSpecies, "fish-crow" | "northern-harrier">) {
  return createCoreWildlifeActorState({
    seed: seedFromText(`rain-chorus-mobile:${species}`),
    species,
    originRegion: REGION,
    populationKey: `rain-chorus-mobile:${species}`,
    populationOrdinal: 0,
    position: createWorldPosition(REGION, 31_000, 28_000),
    tick: 12,
  });
}

function presentation(
  actor: CoreWildlifeActorState,
  observation: WildlifeDirectObservation,
  tileSize: number,
): WildlifePresentation {
  const projected = projectWildlifePresentation({
    actor,
    observation,
    tileSize,
  });
  if (projected === null) throw new Error(`${actor.identity.species} projection failed`);
  return projected;
}

function directObservation(
  position: WorldPosition,
  visibleAggregateCount?: number,
  targetColumn = RECOGNIZABLE_TARGET_COLUMN,
): WildlifeDirectObservation {
  const observation = observationAt(position, targetColumn);
  return Object.freeze({
    ...observation,
    ...(visibleAggregateCount === undefined ? {} : { visibleAggregateCount }),
  });
}

function evidenceObservation(position: WorldPosition): WildlifePopulationEvidenceObservation {
  return observationAt(position);
}

function observationAt(position: WorldPosition, targetColumn = RECOGNIZABLE_TARGET_COLUMN) {
  const globalTileX = position.region.x * WORLD_WIDTH
    + Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE);
  const globalTileY = position.region.y * WORLD_HEIGHT
    + Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE);
  const width = OBSERVATION_COLUMNS;
  const height = OBSERVATION_ROWS;
  const cells: readonly PerceptionCell[] = Array.from(
    { length: width * height },
    () => Object.freeze({ elevation: 0, obstruction: 0 }),
  );
  return Object.freeze({
    window: Object.freeze({
      origin: Object.freeze({ x: globalTileX - targetColumn, y: globalTileY - OBSERVER_ROW }),
      terrain: Object.freeze({ width, height }),
    }),
    perception: evaluatePerception({
      columns: width,
      rows: height,
      cells,
      playerTileIndex: OBSERVER_ROW * width,
      facingRadians: 0,
      weatherVisibility: 1,
      // Match current player body sight, then let the shared presentation
      // helper enforce the smaller optional recognition/inspection tier.
      rangeOverrides: DEFAULT_PERCEPTION_RANGES,
      detailRangeOverrides: DEFAULT_PERCEPTION_RANGES,
      closeDetailIsDirect: true,
    }),
  });
}

function frogFixture() {
  const seed = seedFromText("alpha seventeen rain chorus shadow overhead");
  const originRegion = createRegionCoord(0, 0);
  const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: seed,
    originRegion,
    focus: {
      position: createWorldPosition(
        originRegion,
        Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      ),
      radiusTiles: 32,
    },
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "mobile:rain-chorus",
    originRegion,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v4", habitat },
    tick: 12,
  });
  const population = patch.aggregatePopulations.find(
    ({ species }) => species === "southern-leopard-frog",
  );
  const evidence = population?.evidence[0];
  if (population === undefined || evidence === undefined) {
    throw new Error("Mobile parity fixture requires frog population evidence");
  }
  return Object.freeze({ patch, population, evidence });
}

function individualInputs(
  habitat: CoreEcologyRainChorusHabitatAssemblage,
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

function mobileTapView(
  wildlife: readonly WildlifePresentation[],
  aggregateWildlifeEvidence: readonly WildlifePopulationEvidencePresentation[],
  observation: WildlifePopulationEvidenceObservation,
): TideweftView {
  const columns = observation.window.terrain.width;
  const rows = observation.window.terrain.height;
  const { perception } = observation;
  return {
    terrain: {
      columns,
      rows,
      tileSize: MOBILE_TILE_SIZE,
      origin: { x: 0, y: 0 },
      tiles: Array.from({ length: columns * rows }, (_, index) => ({
        currentVisibility: (perception.visibilityGrades[index] ?? 0) / 2,
        currentDetailVisibility: (perception.detailVisibilityGrades[index] ?? 0) / 2,
      })),
    },
    player: {
      position: {
        x: (perception.playerTileIndex % columns + 0.5) * MOBILE_TILE_SIZE,
        y: (Math.floor(perception.playerTileIndex / columns) + 0.5) * MOBILE_TILE_SIZE,
      },
      facing: 0,
    },
    perception: { valid: perception.valid },
    dogs: [],
    wildlife,
    aggregateWildlifeEvidence,
  } as unknown as TideweftView;
}
