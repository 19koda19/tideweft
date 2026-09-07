import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  setCoreEcologyAggregateActivityIntensity,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  repositionCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyTidalTableHabitatAssemblage,
} from "./coreEcologyHabitat";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  projectWildlifePopulationEvidenceAbout,
  projectWildlifePopulationEvidenceQuickInspect,
  projectWildlifeAbout,
  projectWildlifeQuickInspect,
  type WildlifeAboutObservation,
} from "./wildlifeAbout";
import {
  projectWildlifePresentation,
  type WildlifePopulationEvidenceObservation,
} from "./wildlifePresentation";
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

function frogEvidenceFixture() {
  const seed = seedFromText("alpha seventeen rain chorus shadow overhead");
  const originRegion = createRegionCoord(0, 0);
  const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: seed,
    originRegion,
    focus: {
      position: createWorldPosition(
        originRegion,
        Math.trunc(WORLD_WIDTH / 2) * 1_000 + 500,
        Math.trunc(WORLD_HEIGHT / 2) * 1_000 + 500,
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
    patchKey: "about-frog-evidence",
    originRegion,
    populations,
    derivation: { kind: "habitat-v4", habitat },
    tick: 12,
  });
  const population = patch.aggregatePopulations.find(
    ({ species }) => species === "southern-leopard-frog",
  );
  const evidence = population?.evidence[0];
  if (population === undefined || evidence === undefined) {
    throw new Error("Frog ABOUT fixture requires one population sign");
  }
  return { evidence, patch, population };
}

function tidalEvidenceFixture(tick = 12) {
  const seed = seedFromText("tidal-triad-1");
  const originRegion = createRegionCoord(0, 0);
  const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
    rootSeed: seed,
    originRegion,
    focus: {
      position: createWorldPosition(
        originRegion,
        Math.trunc(WORLD_WIDTH / 2) * 1_000 + 500,
        Math.trunc(WORLD_HEIGHT / 2) * 1_000 + 500,
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
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: population.species === "snowy-egret"
              ? "materialized" as const
              : "coarse" as const,
          })),
        }],
  );
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "about-tidal-evidence",
    originRegion,
    populations,
    derivation: { kind: "habitat-v5", habitat },
    tick,
  });
  const silverside = patch.aggregatePopulations.find(
    ({ species }) => species === "atlantic-silverside",
  );
  const crab = patch.aggregatePopulations.find(
    ({ species }) => species === "atlantic-marsh-fiddler-crab",
  );
  const egret = patch.populations.find(({ species }) => species === "snowy-egret")
    ?.members[0]?.actor;
  if (silverside === undefined || crab === undefined || egret === undefined) {
    throw new Error("Tidal ABOUT fixture requires both aggregates and one egret");
  }
  return { crab, egret, patch, silverside };
}

function activityFixture(
  species: "fish-crow" | "northern-harrier",
  tick: number,
) {
  const seed = seedFromText("rain chorus bounded diurnal activity owner");
  const originRegion = createRegionCoord(0, 0);
  const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: seed,
    originRegion,
    focus: {
      position: createWorldPosition(
        originRegion,
        Math.trunc(WORLD_WIDTH / 2) * 1_000 + 500,
        Math.trunc(WORLD_HEIGHT / 2) * 1_000 + 500,
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
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "materialized" as const,
          })),
        }],
  );
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: `about-activity:${species}:${tick}`,
    originRegion,
    populations,
    derivation: { kind: "habitat-v4", habitat },
    tick,
  });
  const actor = patch.populations.find((population) => population.species === species)
    ?.members[0]?.actor;
  if (actor === undefined) throw new Error(`Activity ABOUT fixture requires ${species}`);
  return { actor, patch };
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
    ["marsh-rabbit", "MARSH RABBIT", "Marsh rabbit"],
    ["marsh-fox", "MARSH FOX", "Marsh fox"],
    ["fish-crow", "FISH CROW FLOCK", "Fish crow"],
    ["northern-harrier", "NORTHERN HARRIER", "Northern harrier"],
    ["snowy-egret", "SNOWY EGRET", "Snowy egret"],
    ["american-black-duck", "AMERICAN BLACK DUCK", "American black duck"],
    ["domestic-chicken", "DOMESTIC CHICKEN", "Domestic chicken"],
    ["domestic-goat", "DOMESTIC GOAT", "Domestic goat"],
    [
      "north-american-river-otter",
      "NORTH AMERICAN RIVER OTTER",
      "North American river otter",
    ],
  ] as const)("identifies a clear %s without claiming an individual identity", (species, heading, label) => {
    const actor = wildlife(species);
    const visible = observation(
      actor,
      4,
      species === "gull" ? 7 : species === "fish-crow" ? 3 : undefined,
    );
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

  it.each([
    ["marsh-rabbit", "SMALL ANIMAL", "Unidentified small animal", 60],
    ["marsh-fox", "UNKNOWN CANID", "Unidentified canid", 60],
    ["domestic-chicken", "UNKNOWN BIRD", "Unidentified bird", 80],
    ["domestic-goat", "UNKNOWN LIVESTOCK", "Unidentified livestock", 80],
    [
      "north-american-river-otter",
      "UNKNOWN AQUATIC MAMMAL",
      "Unidentified aquatic mammal",
      90,
    ],
  ] as const)("withholds a distant %s classification and private ecology", (
    species,
    heading,
    identity,
    distanceTiles,
  ) => {
    const actor = wildlife(species);
    const about = projectWildlifeAbout(actor, observation(actor, distanceTiles));
    expect(about).toMatchObject({ heading, identity, knowledge: "Unfamiliar", known: [] });
    expect(about?.observed.map(({ label }) => label)).not.toContain("Species");
    expect(about?.observed.map(({ label }) => label)).not.toContain("Form");
    expect(about?.observed.map(({ label }) => label)).not.toContain("Appearance");
    expect(about?.observed.map(({ label }) => label)).not.toContain("Life stage");
    expect(JSON.stringify(about)).not.toMatch(/patch|population|target|hunger|prey|temperament/iu);
  });

  it.each([
    ["marsh-rabbit", "Compact, long-eared"],
    ["marsh-fox", "Lean, low-tailed canid"],
    ["snowy-egret", "Slender, long-legged wader"],
    ["american-black-duck", "Broad-bodied dabbling duck"],
    ["domestic-chicken", "Compact ground bird with comb and upright tail"],
    ["domestic-goat", "Stocky, cloven-hoofed goat with swept horns"],
    ["north-american-river-otter", "Long-bodied, low-slung swimmer"],
  ] as const)("shows only directly observable close-range %s facts", (species, form) => {
    const actor = wildlife(species);
    const selected = projectWildlifeLivingActorInspection(actor, observation(actor));
    expect(selected?.about.observed).toEqual(expect.arrayContaining([
      {
        label: "Species",
        value: species === "marsh-rabbit"
          ? "Marsh rabbit"
          : species === "marsh-fox"
            ? "Marsh fox"
            : species === "snowy-egret"
              ? "Snowy egret"
              : species === "american-black-duck"
                ? "American black duck"
                : species === "domestic-chicken"
                  ? "Domestic chicken"
                  : species === "domestic-goat"
                    ? "Domestic goat"
                  : "North American river otter",
      },
      { label: "Behavior", value: "Watching" },
      { label: "Form", value: form },
      { label: "Appearance", value: expect.any(String) },
      { label: "Life stage", value: expect.any(String) },
    ]));
    expect(selected?.about.identityLine).not.toContain(actor.identity.stableId);
    expect(selected?.about.known).toEqual([]);
    expect(hasCoherentLivingActorInspection(selected!)).toBe(true);
  });

  it("shows a domestic chicken as one observed bird without inventing ownership or needs", () => {
    const chicken = wildlife("domestic-chicken");
    const visible = observation(chicken);
    const quick = projectWildlifeQuickInspect(chicken, visible);
    const about = projectWildlifeAbout(chicken, visible);

    expect(quick).toMatchObject({
      species: "domestic-chicken",
      heading: "DOMESTIC CHICKEN",
      summary: "Watching",
    });
    expect(about).toMatchObject({
      species: "domestic-chicken",
      heading: "DOMESTIC CHICKEN",
      identity: "Domestic chicken",
      knowledge: "Recognized",
      known: [],
    });
    expect(about?.observed).toEqual(expect.arrayContaining([
      { label: "Species", value: "Domestic chicken" },
      { label: "Behavior", value: "Watching" },
      { label: "Form", value: "Compact ground bird with comb and upright tail" },
      { label: "Appearance", value: expect.any(String) },
      { label: "Life stage", value: expect.any(String) },
    ]));
    const observedLabels = about?.observed.map(({ label }) => label) ?? [];
    for (const hiddenLabel of ["Owner", "Sex", "Hunger", "Target"]) {
      expect(observedLabels).not.toContain(hiddenLabel);
    }
    expect(JSON.stringify({ quick, about }))
      .not.toMatch(/owner|flock|food target|hunger|settlement|mortality|carcass/iu);
    const groupedAbout = projectWildlifeAbout(chicken, observation(chicken, 4, 2));
    expect(groupedAbout?.identity).toBe("Domestic chicken");
    expect(groupedAbout?.observed).toContainEqual({ label: "Visible group", value: "About 2" });
  });

  it.each([
    ["fish-crow", 1_200, "perch", "Perched"],
    ["northern-harrier", 360, "quarter", "Quartering low"],
  ] as const)(
    "keeps selected %s quick/full ABOUT behavior in parity with its activity presentation",
    (species, atTick, behavior, behaviorLabel) => {
      const { actor, patch } = activityFixture(species, atTick);
      const visible = observation(actor, 4, species === "fish-crow" ? 1 : undefined);
      const activity = { patch, atTick };
      const presentation = projectWildlifePresentation({
        actor,
        observation: visible,
        tileSize: 16,
        activity,
      });
      const selected = projectWildlifeLivingActorInspection(actor, visible, activity);

      expect(presentation).toMatchObject({ behavior, behaviorLabel });
      expect(selected?.quick.summary).toContain(behaviorLabel);
      expect(selected?.about.observed).toContainEqual({
        label: "Behavior",
        value: behaviorLabel,
      });
      expect(hasCoherentLivingActorInspection(selected!)).toBe(true);
    },
  );

  it("rejects stale activity custody at the quick/full ABOUT boundary", () => {
    const { actor, patch } = activityFixture("fish-crow", 1_200);
    const moved = repositionCoreWildlifeActor(actor, {
      atTick: 1_200,
      heading: actor.address.heading,
      position: createWorldPosition(
        actor.address.position.region,
        actor.address.position.localX + 1,
        actor.address.position.localY,
      ),
    });
    const visible = observation(moved, 4, 1);
    const staleActivity = { patch, atTick: 1_200 };

    expect(projectWildlifeQuickInspect(moved, visible, staleActivity)).toBeNull();
    expect(projectWildlifeAbout(moved, visible, staleActivity)).toBeNull();
    expect(projectWildlifeLivingActorInspection(moved, visible, staleActivity)).toBeNull();
  });

  it("keeps the snowy egret's tidal relocation in quick/full ABOUT parity", () => {
    const { egret, patch } = tidalEvidenceFixture(720);
    const visible = observation(egret);
    const activity = { patch, atTick: patch.updatedAtTick };
    const quick = projectWildlifeQuickInspect(egret, visible, activity);
    const about = projectWildlifeAbout(egret, visible, activity);

    expect(quick).toMatchObject({ species: "snowy-egret", summary: "Flying" });
    expect(about?.observed).toContainEqual({ label: "Behavior", value: "Flying" });
    expect(about?.known).toEqual([]);
  });

  it("describes one observed American black duck without a flock or hidden ecology", () => {
    const duck = wildlife("american-black-duck");
    const visible = observation(duck);
    const quick = projectWildlifeQuickInspect(duck, visible);
    const about = projectWildlifeAbout(duck, visible);

    expect(quick).toMatchObject({
      actorId: duck.identity.stableId,
      species: "american-black-duck",
      heading: "AMERICAN BLACK DUCK",
      summary: "Watching",
    });
    expect(about).toMatchObject({
      actorId: duck.identity.stableId,
      species: "american-black-duck",
      heading: "AMERICAN BLACK DUCK",
      identity: "American black duck",
      knowledge: "Recognized",
      known: [],
    });
    expect(about?.observed).toEqual(expect.arrayContaining([
      { label: "Species", value: "American black duck" },
      { label: "Behavior", value: "Watching" },
      { label: "Form", value: "Broad-bodied dabbling duck" },
    ]));
    expect(about?.observed.map(({ label }) => label)).not.toContain("Visible group");
    expect(JSON.stringify({ about, quick }))
      .not.toMatch(/flock|nest|migration|mortality|carcass|populationSize|target/iu);
    expect(projectWildlifeAbout(duck, observation(duck, 4, 2))).toBeNull();

    const distant = projectWildlifeAbout(duck, observation(duck, 90));
    expect(distant).toMatchObject({
      heading: "UNKNOWN DUCK",
      identity: "Unidentified duck",
      knowledge: "Unfamiliar",
      observed: [{ label: "Behavior", value: "Still" }],
      known: [],
    });
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

  it("describes frog evidence as area-level signs without inventing a frog dossier", () => {
    const { evidence, patch, population } = frogEvidenceFixture();
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
      species: "southern-leopard-frog",
      heading: "SOUTHERN LEOPARD FROG SIGNS",
      summary: "Leopard frog mud impressions",
    });
    expect(about).toMatchObject({
      species: "southern-leopard-frog",
      heading: "SOUTHERN LEOPARD FROG SIGNS",
      identity: "Southern leopard frog population signs",
      knowledge: "Recognized",
      observed: expect.arrayContaining([
        { label: "Species", value: "Southern leopard frog" },
        { label: "Scale", value: "Population-level signs" },
      ]),
      known: [],
    });
    expect(JSON.stringify({ about, quick }))
      .not.toMatch(/actorId|populationSize|activitySignal|rainIntensity|hidden/iu);
  });

  it.each([
    ["atlantic-silverside", "ATLANTIC SILVERSIDE SCHOOL SIGNS", "Atlantic silverside"],
    [
      "atlantic-marsh-fiddler-crab",
      "ATLANTIC MARSH FIDDLER CRAB SIGNS",
      "Atlantic marsh fiddler crab",
    ],
  ] as const)("describes directly observed %s cues without an actor or census", (
    species,
    heading,
    speciesLabel,
  ) => {
    const fixture = tidalEvidenceFixture();
    const population = species === "atlantic-silverside" ? fixture.silverside : fixture.crab;
    const evidence = population.evidence[0];
    expect(evidence).toBeDefined();
    const visible = evidenceObservation(evidence!.position);
    const quick = projectWildlifePopulationEvidenceQuickInspect(
      fixture.patch,
      evidence!.evidenceId,
      visible,
    );
    const about = projectWildlifePopulationEvidenceAbout(
      fixture.patch,
      evidence!.evidenceId,
      visible,
    );

    expect(quick).toMatchObject({ species, heading });
    expect(about).toMatchObject({
      species,
      heading,
      knowledge: "Recognized",
      observed: expect.arrayContaining([
        { label: "Species", value: speciesLabel },
        { label: "Scale", value: "Population-level signs" },
      ]),
      known: [],
    });
    const encoded = JSON.stringify({ about, quick });
    expect(encoded).not.toMatch(/actorId|populationSize|representedUnits|activitySignal|intensity/iu);
    expect(encoded).not.toMatch(/dead|death|mortality|carcass/iu);

    const uncertain = projectWildlifePopulationEvidenceAbout(
      fixture.patch,
      evidence!.evidenceId,
      evidenceObservation(evidence!.position, 60),
    );
    expect(uncertain).toMatchObject({
      heading: species === "atlantic-silverside"
        ? "WATER-SURFACE ACTIVITY"
        : "MUDFLAT ACTIVITY",
      identity: species === "atlantic-silverside"
        ? "Unidentified water-surface activity"
        : "Unidentified mudflat activity",
      knowledge: "Unfamiliar",
      known: [],
    });
    expect(uncertain?.observed.map(({ label }) => label)).not.toContain("Species");

    const quiet = setCoreEcologyAggregateActivityIntensity(fixture.patch, {
      aggregateId: population.aggregateId,
      atTick: fixture.patch.updatedAtTick,
      intensity: 0,
    });
    expect(projectWildlifePopulationEvidenceAbout(
      quiet,
      evidence!.evidenceId,
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
