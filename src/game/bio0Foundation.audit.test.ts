import { describe, expect, it } from "vitest";

import { createActorPerceptionState } from "../sim/actorPerception";
import { createWorld, createWorldView } from "../sim/public";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  canonicalizeDogActorState,
  createDogActorState,
  learnDogPlayerKnowledge,
  promoteDogActor,
} from "./dogActor";
import { projectDogAbout } from "./dogAbout";
import { projectDogPresentation } from "./dogPresentation";
import { evaluatePerception, type PerceptionCell } from "./perception";
import {
  canonicalLivingActorAddresses,
  createLivingActorAddress,
  isLivingActorAddress,
  livingActorAddressForResident,
} from "./livingActor";
import {
  LIVING_SPECIES_RELEASE_GATES,
  auditLivingSpeciesReleaseGate,
  canonicalizeLivingSpeciesReleaseGate,
} from "./livingSpeciesReleaseGate";
import { createWorldPosition } from "./worldPosition";

function dog(ordinal = 7) {
  const region = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
  return createDogActorState({
    seed: seedFromText("BIO0 independent foundation audit"),
    originRegion: region,
    originNamespace: "regional",
    habitatClass: "cold-region",
    habitatKey: "audit:extreme-bank",
    populationKey: "audit:regional-dogs",
    populationOrdinal: ordinal,
    position: createWorldPosition(region, 2_500, 3_500),
    tick: 10,
  });
}

function directPresentationInput(actor: unknown) {
  const detailVisibilityGrades: (0 | 1 | 2)[] = Array.from({ length: 64 }, () => 2);
  return {
    actor,
    window: {
      origin: {
        x: -REGION_COORD_LIMIT * WORLD_WIDTH,
        y: REGION_COORD_LIMIT * WORLD_HEIGHT,
      },
      terrain: { width: 8, height: 8 },
    },
    tileSize: 24,
    detailVisibilityGrades,
  };
}

function dogObservation(actor: ReturnType<typeof dog>, distanceTiles: number) {
  const actorGlobalX = actor.address.position.region.x * WORLD_WIDTH
    + Math.floor(actor.address.position.localX / 1_000);
  const actorGlobalY = actor.address.position.region.y * WORLD_HEIGHT
    + Math.floor(actor.address.position.localY / 1_000);
  const width = Math.max(128, distanceTiles + 2);
  const cells: PerceptionCell[] = Array.from(
    { length: width },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  return {
    window: {
      origin: { x: actorGlobalX, y: actorGlobalY },
      terrain: { width, height: 1 },
    },
    perception: evaluatePerception({
      columns: width,
      rows: 1,
      cells,
      playerTileIndex: distanceTiles,
      facingRadians: Math.PI,
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
  };
}

describe("independent BIO0 foundation adversarial audit", () => {
  it("preserves deterministic identity at signed extremes and rejects duplicate active IDs", () => {
    const first = dog();
    const replay = dog();
    const neighbor = dog(8);

    expect(replay.identity).toEqual(first.identity);
    expect(neighbor.identity.stableId).not.toBe(first.identity.stableId);
    expect(first.identity.stableId.length).toBeLessThanOrEqual(192);
    expect(() => canonicalLivingActorAddresses([first.address, replay.address]))
      .toThrow(/Duplicate living actor identity/u);
  });

  it("rejects malformed nested state and coordinated cross-record ID forgeries", () => {
    const actor = dog();
    expect(canonicalizeDogActorState({
      ...actor,
      condition: { ...actor.condition, hiddenBleeding: 99 },
    })).toBeNull();

    const forgedId = `${actor.identity.stableId}x`;
    expect(canonicalizeDogActorState({
      ...actor,
      identity: { ...actor.identity, stableId: forgedId },
      address: { ...actor.address, actorId: forgedId },
      perception: createActorPerceptionState(forgedId, actor.perception.tick),
    })).toBeNull();
  });

  it("requires direct detail visibility before renderer projection", () => {
    const actor = dog();
    const input = directPresentationInput(actor);
    const tileIndex = 3 * 8 + 2;
    input.detailVisibilityGrades[tileIndex] = 1;
    expect(projectDogPresentation(input)).toBeNull();
    input.detailVisibilityGrades[tileIndex] = 0;
    expect(projectDogPresentation(input)).toBeNull();
  });

  it("rejects a forged all-active release claim as unauthenticated", () => {
    const dogGate = LIVING_SPECIES_RELEASE_GATES.gates
      .find(({ speciesId }) => speciesId === "domestic-dog");
    if (dogGate === undefined) throw new Error("Audit fixture needs the dog release gate");
    const forged = {
      ...dogGate,
      criteria: dogGate.criteria.map((criterion) => ({
        ...criterion,
        status: "active" as const,
        evidenceOwnerIds: criterion.evidenceOwnerIds.length > 0
          ? criterion.evidenceOwnerIds
          : ["test:forged-evidence:v1"],
        notApplicable: null,
      })),
    };

    expect(canonicalizeLivingSpeciesReleaseGate(forged)).not.toBeNull();
    expect(auditLivingSpeciesReleaseGate(forged)).toMatchObject({
      evidenceAuthenticated: false,
      state: "invalid-claim",
      publicReady: false,
    });
  });

  it("rejects a dog identity relabeled as a human at the shared address boundary", () => {
    const actor = dog();
    expect(() => createLivingActorAddress({
      ...actor.address,
      species: "human",
    })).toThrow(/namespace/u);
    expect(isLivingActorAddress({ ...actor.address, species: "human" })).toBe(false);
  });

  it("adapts only the canonical resident settlement record rather than an ID-matching location forgery", () => {
    const state = createWorld("BIO0 resident alias audit", "standard");
    const view = createWorldView(state);
    const resident = view.residents[0];
    if (resident === undefined) throw new Error("Audit fixture needs a resident");
    const otherSettlement = view.settlements.find(({ id }) => id !== resident.homeSettlementId);
    if (otherSettlement === undefined) throw new Error("Audit fixture needs a second settlement");
    const forged = structuredClone(resident);
    forged.location = { kind: "settlement", settlementId: otherSettlement.id };

    expect(livingActorAddressForResident(view, forged)).toBeNull();
  });

  it("rejects an ID-matching forged route location at the resident adapter boundary", () => {
    const state = createWorld("BIO0 resident route forgery audit", "standard");
    const view = createWorldView(state);
    const resident = view.residents.find(({ location }) => location.kind === "settlement");
    const route = view.routes.find(({ path }) => path.length > 0);
    if (resident === undefined || route === undefined) {
      throw new Error("Audit fixture needs a settled resident and traversable route");
    }
    const forged = structuredClone(resident);
    forged.location = { kind: "route", routeId: route.id, progress: 0 };

    expect(livingActorAddressForResident(view, forged)).toBeNull();
  });

  it("binds ABOUT visibility to authoritative actor perception instead of a caller bit", () => {
    const actor = dog();
    expect(actor.perception.beliefs).toEqual([]);
    expect(projectDogAbout(actor, {
      visible: true,
      distanceUnits: 1,
      visualClarity: 1_000_000,
    })).toBeNull();
  });

  it("does not disclose exact age through the identity line at negligible clarity", () => {
    const actor = dog();
    const about = projectDogAbout(actor, dogObservation(actor, 70));
    expect(about).not.toBeNull();
    expect(about?.observed.some(({ label }) => label === "Age")).toBe(false);
    expect(about?.identity.toLowerCase()).not.toContain(actor.identity.age.replace("-", " "));
  });

  it("requires matching accepted perception before recording direct-observation knowledge", () => {
    const actor = dog();
    expect(actor.perception.beliefs).toEqual([]);
    const learned = learnDogPlayerKnowledge(actor, {
      fact: "temperament",
      source: "direct-observation",
      evidenceId: "about-clicked",
      learnedAtTick: 10,
      confidence: 1_000_000,
    });
    expect(learned.playerKnowledge.facts).toEqual([]);
    expect(canonicalizeDogActorState({
      ...actor,
      playerKnowledge: {
        version: actor.playerKnowledge.version,
        facts: [{
          fact: "temperament",
          source: "direct-observation",
          evidenceId: "about-clicked",
          learnedAtTick: 10,
          confidence: 1_000_000,
        }],
      },
    })).toBeNull();
  });

  it("does not let a click-like event masquerade as promotion evidence", () => {
    const actor = dog();
    const promoted = promoteDogActor(actor, {
      kind: "identity-learning",
      eventId: "about-clicked",
      atTick: 10,
    });
    expect(promoted.address.persistence).toBe("regional");
    expect(promoted.promotion).toBeNull();
    expect(canonicalizeDogActorState({
      ...actor,
      address: { ...actor.address, persistence: "promoted" },
      promotion: {
        reason: { kind: "identity-learning", eventId: "about-clicked", atTick: 10 },
      },
    })).toBeNull();
  });
});
