import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "./coreEcologyHabitat";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  projectWildlifePopulationEvidenceAbout,
  projectWildlifePopulationEvidenceQuickInspect,
  projectWildlifeAbout,
  projectWildlifeQuickInspect,
  type WildlifeAboutObservation,
} from "./wildlifeAbout";
import type { WildlifePopulationEvidenceObservation } from "./wildlifePresentation";
import { createWorldPosition, type WorldPosition } from "./worldPosition";
import {
  hasCoherentLivingActorInspection,
  projectWildlifeLivingActorInspection,
  resolveActorAboutSurface,
} from "../ui/livingActorAbout";

function wildlife(species: CoreWildlifeSpecies): CoreWildlifeActorState {
  const region = createRegionCoord(3, -7);
  return createCoreWildlifeActorState({
    seed: [71, 83, 97, 109],
    species,
    originRegion: region,
    populationKey: `about-${species}`,
    populationOrdinal: 1,
    position: createWorldPosition(region, 31_000, 28_000),
    tick: 12,
  });
}

function observation(
  actor: CoreWildlifeActorState,
  distanceTiles = 4,
  visibleAggregateCount?: number,
): WildlifeAboutObservation {
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
      facingRadians: 0,
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
    ...(visibleAggregateCount === undefined ? {} : { visibleAggregateCount }),
  });
}

function ratEvidenceFixture() {
  const seed = seedFromText("about-rat-evidence");
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
    patchKey: "about-rat-evidence",
    originRegion,
    populations,
    derivation: { kind: "habitat-v2", habitat },
    tick: 12,
  });
  const population = patch.aggregatePopulations[0];
  const evidence = population?.evidence[0];
  if (population === undefined || evidence === undefined) {
    throw new Error("Rat ABOUT fixture requires a supported aggregate population");
  }
  return { evidence, patch, population };
}

function evidenceObservation(
  position: WorldPosition,
  distanceTiles = 4,
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
      facingRadians: 0,
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

function pursuingBear(): CoreWildlifeActorState {
  const actor = wildlife("black-bear");
  const result = canonicalizeCoreWildlifeActorState({
    ...actor,
    needs: { hunger: 999_000, safety: 888_000, rest: 777_000 },
    intent: {
      kind: "pursue",
      cause: { kind: "perception", referenceId: "observation:private-deer" },
      focusObservationId: "observation:private-deer",
      resourceReference: {
        resourceId: "actor:private-deer",
        observationId: "observation:private-deer",
        foodClass: "live-prey",
        sourceKind: "living-actor",
        observedAvailableUnits: 1,
      },
      enteredAtTick: 12,
      expiresAtTick: 22,
    },
  });
  if (result === null) throw new Error("wildlife ABOUT fixture should be canonical");
  return result;
}

describe("knowledge-honest wildlife ABOUT", () => {
  it.each([
    ["deer", "DEER", "Deer"],
    ["gull", "GULL FLOCK", "Gull"],
    ["black-bear", "BLACK BEAR", "Black bear"],
    ["domestic-cat", "DOMESTIC CAT", "Domestic cat"],
  ] as const)("identifies a clear %s without claiming an individual identity", (species, heading, label) => {
    const actor = wildlife(species);
    const visible = observation(actor, 4, species === "gull" ? 7 : undefined);
    const quick = projectWildlifeQuickInspect(actor, visible);
    const about = projectWildlifeAbout(actor, visible);

    expect(quick).toMatchObject({ actorId: actor.identity.stableId, species, heading });
    expect(about).toMatchObject({
      actorId: actor.identity.stableId,
      species,
      heading,
      knowledge: "Recognized",
      known: [],
    });
    expect(about?.observed).toContainEqual({ label: "Species", value: label });
    expect(about?.identity).not.toContain(actor.identity.stableId);
    expect(about?.knowledge).not.toBe("Known individual");
  });

  it("describes directly visible brown-rat evidence as population-level signs", () => {
    const { evidence, patch, population } = ratEvidenceFixture();
    const visible = evidenceObservation(evidence.position);
    const quick = projectWildlifePopulationEvidenceQuickInspect(
      patch,
      evidence.evidenceId,
      visible,
    );
    const about = projectWildlifePopulationEvidenceAbout(
      patch,
      evidence.evidenceId,
      visible,
    );

    expect(quick).toMatchObject({
      aggregateId: population.aggregateId,
      evidenceId: evidence.evidenceId,
      species: "brown-rat",
      heading: "BROWN RAT SIGNS",
    });
    expect(about).toMatchObject({
      aggregateId: population.aggregateId,
      evidenceId: evidence.evidenceId,
      species: "brown-rat",
      heading: "BROWN RAT SIGNS",
      identity: "Brown rat population signs",
      knowledge: "Recognized",
      observed: expect.arrayContaining([
        { label: "Species", value: "Brown rat" },
        { label: "Scale", value: "Population-level signs" },
      ]),
      known: [],
    });
    const encoded = JSON.stringify({ about, quick });
    expect(encoded).not.toMatch(/actorId|groupSize|populationSize|populationPressure|activitySignal/iu);
    expect(encoded).not.toMatch(/causeKind|causeReferenceId|strength|createdAtTick/iu);
  });

  it("withholds rat classification when the visible evidence lacks clarity", () => {
    const { evidence, patch } = ratEvidenceFixture();
    const about = projectWildlifePopulationEvidenceAbout(
      patch,
      evidence.evidenceId,
      evidenceObservation(evidence.position, 60),
    );
    expect(about).toMatchObject({
      heading: "SMALL-ANIMAL SIGNS",
      identity: "Unidentified small-animal signs",
      knowledge: "Unfamiliar",
      known: [],
    });
    expect(about?.observed.map(({ label }) => label)).not.toContain("Species");

    const visible = evidenceObservation(evidence.position);
    expect(projectWildlifePopulationEvidenceAbout(
      patch,
      evidence.evidenceId,
      { ...visible, visibleAggregateCount: 12 },
    )).toBeNull();
    expect(projectWildlifePopulationEvidenceAbout(
      patch,
      "missing-evidence",
      visible,
    )).toBeNull();
  });

  it("keeps species, appearance, condition, and life stage hidden below clarity", () => {
    const actor = wildlife("black-bear");
    const about = projectWildlifeAbout(actor, observation(actor, 80));
    expect(about).toMatchObject({
      heading: "LARGE ANIMAL",
      identity: "Unidentified animal",
      knowledge: "Unfamiliar",
      observed: [{ label: "Behavior", value: "Still" }],
      known: [],
    });
    expect(about?.observed.map(({ label }) => label)).not.toContain("Species");
    expect(about?.observed.map(({ label }) => label)).not.toContain("Appearance");
    expect(about?.observed.map(({ label }) => label)).not.toContain("Condition");
    expect(about?.observed.map(({ label }) => label)).not.toContain("Life stage");
  });

  it("routes a gull aggregate through one stable species-tagged UI target", () => {
    const actor = wildlife("gull");
    const selected = projectWildlifeLivingActorInspection(actor, observation(actor, 4, 7));
    expect(selected).toMatchObject({
      target: { species: "gull", actorId: actor.identity.stableId },
      quick: { heading: "GULL FLOCK", summary: expect.stringContaining("About 5 visible") },
      about: {
        heading: "GULL FLOCK",
        knowledgeLabel: "Recognized",
        observed: expect.arrayContaining([{ label: "Visible group", value: "About 5" }]),
        known: [],
      },
    });
    expect(selected?.quick.target).toBe(selected?.target);
    expect(selected?.about.target).toBe(selected?.target);
    expect(hasCoherentLivingActorInspection(selected!)).toBe(true);
    expect(resolveActorAboutSurface({ selectedLivingActor: selected! })).toMatchObject({
      selectionKey: `gull:${actor.identity.stableId}`,
      species: "gull",
      interactions: [],
    });
  });

  it("describes visible pursuit posture without leaking its cause, prey, or needs", () => {
    const actor = pursuingBear();
    const selected = projectWildlifeLivingActorInspection(actor, observation(actor));
    expect(selected?.about.observed).toContainEqual({
      label: "Behavior",
      value: "Moving with focus",
    });
    const encoded = JSON.stringify(selected);
    expect(encoded).not.toMatch(/private-deer|resourceReference|focusObservationId|referenceId/iu);
    expect(encoded).not.toMatch(/"needs"|"hunger"|"safety"|"rest"|999000|888000|777000/u);
    expect(selected).not.toHaveProperty("interactions");
  });

  it("fails closed for forged perception and unavailable aggregate truth", () => {
    const gull = wildlife("gull");
    const visible = observation(gull, 4, 7);
    expect(projectWildlifeAbout(gull, {
      ...visible,
      perception: { ...visible.perception, signature: "perception-v2:forged" },
    })).toBeNull();
    expect(projectWildlifeQuickInspect(gull, {
      ...visible,
      visibleAggregateCount: 99,
    })).toBeNull();
  });
});
