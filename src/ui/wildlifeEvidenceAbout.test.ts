import { describe, expect, it, vi } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "../game/coreEcology";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "../game/coreEcologyHabitat";
import { evaluatePerception, type PerceptionCell } from "../game/perception";
import type { WildlifePopulationEvidenceAboutObservation } from "../game/wildlifeAbout";
import type { WorldPosition } from "../game/worldPosition";
import {
  handleActorAboutEscape,
  residentAboutActionPresentation,
  residentAboutSurfaceState,
  resolveTideweftAboutSurface,
} from "./createTideweftUI";
import type {
  LivingActorTargetSpeciesUIView,
  TideweftUIView,
  WildlifeEvidenceAboutProjection,
  WildlifeEvidenceTargetUIView,
} from "./types";
import {
  hasCoherentWildlifeEvidenceAboutProjection,
  projectWildlifeEvidenceAboutProjection,
  resolveWildlifeEvidenceAboutSurface,
  sameWildlifeEvidenceTarget,
} from "./wildlifeEvidenceAbout";

function ratEvidenceFixture() {
  const seed = seedFromText("ui-rat-evidence-about");
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
    patchKey: "ui-rat-evidence-about",
    originRegion,
    populations,
    derivation: { kind: "habitat-v2", habitat },
    tick: 12,
  });
  const population = patch.aggregatePopulations[0];
  const evidence = population?.evidence[0];
  if (population === undefined || evidence === undefined) {
    throw new Error("UI fixture requires one brown-rat aggregate evidence sign");
  }
  const target: WildlifeEvidenceTargetUIView = {
    species: "brown-rat",
    aggregateId: population.aggregateId,
    evidenceId: evidence.evidenceId,
  };
  return { evidence, patch, population, target };
}

function evidenceObservation(
  position: WorldPosition,
  distanceTiles = 4,
  facingRadians = 0,
): WildlifePopulationEvidenceAboutObservation {
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

describe("aggregate wildlife evidence ABOUT UI boundary", () => {
  it("projects one recognized sign without creating a living actor or action", () => {
    const { evidence, patch, target } = ratEvidenceFixture();
    const selected = projectWildlifeEvidenceAboutProjection(
      patch,
      target,
      evidenceObservation(evidence.position),
    );

    expect(selected).toMatchObject({
      target,
      quick: {
        heading: "BROWN RAT SIGNS",
        target,
      },
      about: {
        heading: "BROWN RAT SIGNS",
        identityLine: "Brown rat population signs",
        knowledgeLabel: "Recognized",
        target,
        observed: expect.arrayContaining([
          { label: "Species", value: "Brown rat" },
          { label: "Scale", value: "Population-level signs" },
        ]),
        known: [],
      },
    });
    expect(selected?.quick.target).toBe(selected?.target);
    expect(selected?.about.target).toBe(selected?.target);
    expect(hasCoherentWildlifeEvidenceAboutProjection(selected!)).toBe(true);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected?.about.observed)).toBe(true);

    const surface = resolveWildlifeEvidenceAboutSurface({
      selectedWildlifeEvidence: selected!,
    });
    expect(surface).toMatchObject({
      species: "brown-rat",
      representation: "population-evidence",
      closeCommand: {
        type: "aggregate-wildlife-evidence",
        action: "close",
        target,
      },
    });
    expect(residentAboutSurfaceState(surface)).toEqual({
      hidden: false,
      modal: false,
      pausesGameplay: false,
    });
    expect(residentAboutActionPresentation(surface!)).toEqual({
      hidden: true,
      disabled: true,
      label: "",
      hint: "",
    });

    const encoded = JSON.stringify({ selected, surface });
    expect(surface).not.toHaveProperty("interactions");
    expect(encoded).not.toMatch(/actorId|RAT-v|interaction|populationSize|populationPressure/iu);
    expect(encoded).not.toMatch(/activitySignal|causeReferenceId|strength|createdAtTick/iu);
  });

  it("retains OBSERVED/KNOWN honesty when the sign cannot yet identify a species", () => {
    const { evidence, patch, target } = ratEvidenceFixture();
    const selected = projectWildlifeEvidenceAboutProjection(
      patch,
      target,
      evidenceObservation(evidence.position, 60),
    );

    expect(selected?.about).toMatchObject({
      heading: "SMALL-ANIMAL SIGNS",
      identityLine: "Unidentified small-animal signs",
      knowledgeLabel: "Unfamiliar",
      known: [],
    });
    expect(selected?.about.observed.map(({ label }) => label)).not.toContain("Species");
    expect(selected?.about.observed).toContainEqual({
      label: "Scale",
      value: "Population-level signs",
    });
  });

  it("fails closed for lost detail sight or either mismatched stable ID", () => {
    const { evidence, patch, target } = ratEvidenceFixture();
    expect(projectWildlifeEvidenceAboutProjection(
      patch,
      target,
      evidenceObservation(evidence.position, 4, Math.PI),
    )).toBeNull();
    expect(projectWildlifeEvidenceAboutProjection(
      patch,
      { ...target, aggregateId: "rat-aggregate:stale" },
      evidenceObservation(evidence.position),
    )).toBeNull();
    expect(projectWildlifeEvidenceAboutProjection(
      patch,
      { ...target, evidenceId: "rat-evidence:stale" },
      evidenceObservation(evidence.position),
    )).toBeNull();
    expect(projectWildlifeEvidenceAboutProjection(
      patch,
      { ...target, actorId: "RAT-v1-fabricated" },
      evidenceObservation(evidence.position),
    )).toBeNull();
  });

  it("rejects mixed or action-bearing UI records instead of falling through", () => {
    const { evidence, patch, target } = ratEvidenceFixture();
    const selected = projectWildlifeEvidenceAboutProjection(
      patch,
      target,
      evidenceObservation(evidence.position),
    );
    if (selected === null) throw new Error("fixture evidence should be directly visible");
    const mixed = {
      ...selected,
      about: {
        ...selected.about,
        target: { ...target, evidenceId: "rat-evidence:other" },
      },
    } as WildlifeEvidenceAboutProjection;
    expect(hasCoherentWildlifeEvidenceAboutProjection(mixed)).toBe(false);
    expect(resolveWildlifeEvidenceAboutSurface({ selectedWildlifeEvidence: mixed }))
      .toBeUndefined();

    const actionBearing = {
      ...selected,
      interactions: [{ id: "wait", label: "WAIT" }],
    } as unknown as WildlifeEvidenceAboutProjection;
    expect(hasCoherentWildlifeEvidenceAboutProjection(actionBearing)).toBe(false);
    expect(sameWildlifeEvidenceTarget(target, {
      ...target,
      aggregateId: "rat-aggregate:other",
    })).toBe(false);
  });

  it("gives a present evidence selection precedence without falling through on forgery", () => {
    const { evidence, patch, target } = ratEvidenceFixture();
    const selected = projectWildlifeEvidenceAboutProjection(
      patch,
      target,
      evidenceObservation(evidence.position),
    );
    if (selected === null) throw new Error("fixture evidence should be directly visible");
    const staleActor = {
      target: { species: "domestic-dog" as const, actorId: "D-R-v1-stale-ui-dog" },
      quick: {
        target: { species: "domestic-dog" as const, actorId: "D-R-v1-stale-ui-dog" },
        heading: "UNKNOWN DOG",
        summary: "Watching",
        distanceUnits: 1_000,
      },
      about: {
        target: { species: "domestic-dog" as const, actorId: "D-R-v1-stale-ui-dog" },
        heading: "UNKNOWN DOG",
        identityLine: "Unidentified dog",
        knowledgeLabel: "Unfamiliar" as const,
        observed: [],
        known: [],
      },
    };

    expect(resolveTideweftAboutSurface({
      selectedWildlifeEvidence: selected,
      selectedLivingActor: staleActor,
    })).toMatchObject({
      representation: "population-evidence",
      closeCommand: { target },
    });
    expect(resolveTideweftAboutSurface({
      selectedWildlifeEvidence: {
        ...selected,
        interactions: [{ id: "wait", label: "WAIT" }],
      } as unknown as WildlifeEvidenceAboutProjection,
      selectedLivingActor: staleActor,
    })).toBeUndefined();
  });

  it("closes by aggregate/evidence target on Escape and dispatches nothing else", () => {
    const { target } = ratEvidenceFixture();
    const dispatch = vi.fn();
    const event = {
      key: "Escape",
      defaultPrevented: false,
      preventDefault: vi.fn(),
    };
    expect(handleActorAboutEscape(event, {
      type: "aggregate-wildlife-evidence",
      action: "close",
      target,
    }, dispatch)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "aggregate-wildlife-evidence",
      action: "close",
      target,
    });
  });
});

// Additive optionality preserves existing runtime/test fixtures during wiring.
const legacyViewCompatibility: Pick<
  TideweftUIView,
  "selectedLivingActor" | "selectedResident" | "selectedWildlifeEvidence"
> = {};
void legacyViewCompatibility;

type BrownRatIsNotAUILivingActor = "brown-rat" extends LivingActorTargetSpeciesUIView
  ? false
  : true;
const brownRatIsNotAUILivingActor: BrownRatIsNotAUILivingActor = true;
void brownRatIsNotAUILivingActor;
