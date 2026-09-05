import { describe, expect, it } from "vitest";

import { createDogActorState } from "../game/dogActor";
import { evaluatePerception, type PerceptionCell } from "../game/perception";
import { createWorldPosition } from "../game/worldPosition";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  hasCoherentLivingActorInspection,
  projectDogLivingActorInspection,
  resolveActorAboutSurface,
  sameLivingActorTarget,
  withLivingActorInteractions,
} from "./livingActorAbout";
import type {
  ResidentAboutUIView,
  SelectedLivingActorUIView,
  TideweftUIView,
} from "./types";

function dog() {
  const region = createRegionCoord(-4, 9);
  return createDogActorState({
    seed: [17, 29, 41, 53],
    originRegion: region,
    originNamespace: "regional",
    habitatClass: "settlement-edge",
    habitatKey: "about-ui-edge",
    populationKey: "about-ui-dogs",
    populationOrdinal: 2,
    position: createWorldPosition(region, 24_000, 35_000),
    tick: 10,
  });
}

function currentObservation(
  actor = dog(),
  distanceTiles = 4,
  facingRadians = 0,
) {
  const actorGlobalX = actor.address.position.region.x * WORLD_WIDTH
    + Math.floor(actor.address.position.localX / 1_000);
  const actorGlobalY = actor.address.position.region.y * WORLD_HEIGHT
    + Math.floor(actor.address.position.localY / 1_000);
  const width = Math.max(100, distanceTiles + 2);
  const cells: PerceptionCell[] = Array.from(
    { length: width },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  const window = {
    origin: { x: actorGlobalX - distanceTiles, y: actorGlobalY },
    terrain: { width, height: 1 },
  } as const;
  return Object.freeze({
    window,
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

function compatibilityResident(): ResidentAboutUIView {
  return {
    id: "7",
    heading: "UNKNOWN PORTER",
    identityLine: "Human · Adult",
    knowledgeLabel: "Unfamiliar",
    observed: [{ label: "Behavior", value: "Waiting nearby" }],
    known: [],
    actionLabel: "GREET",
    actionDisabled: false,
    actionHint: "Speak without pausing the world.",
  };
}

describe("living-actor ABOUT UI boundary", () => {
  it("pairs dog quick/full views with one species-tagged stable target", () => {
    const actor = dog();
    const selected = projectDogLivingActorInspection(actor, currentObservation(actor));

    expect(selected).toMatchObject({
      target: {
        species: "domestic-dog",
        actorId: actor.identity.stableId,
      },
      quick: {
        heading: "UNKNOWN DOG",
        summary: expect.stringContaining("·"),
      },
      about: {
        heading: "UNKNOWN DOG",
        knowledgeLabel: "Unfamiliar",
      },
    });
    expect(selected?.quick.target).toBe(selected?.target);
    expect(selected?.about.target).toBe(selected?.target);
    expect(selected?.about.observed).toContainEqual({ label: "Species", value: "Dog" });
    expect(hasCoherentLivingActorInspection(selected!)).toBe(true);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected?.about.observed)).toBe(true);

    const encoded = JSON.stringify(selected);
    expect(encoded).not.toMatch(/feed|help|promot|pause|trust|hunger|owner/iu);
    expect(selected?.about).not.toHaveProperty("actionLabel");
  });

  it("fails closed for a forged perception or a non-matching regional window", () => {
    const actor = dog();
    const observed = currentObservation(actor);
    expect(projectDogLivingActorInspection(actor, {
      ...observed,
      perception: { ...observed.perception, signature: "perception-v2:forged" },
    })).toBeNull();
    expect(projectDogLivingActorInspection(actor, {
      ...observed,
      window: {
        ...observed.window,
        origin: { ...observed.window.origin, x: observed.window.origin.x + 1_000 },
      },
    })).toBeNull();
    expect(projectDogLivingActorInspection(
      actor,
      currentObservation(actor, 4, Math.PI),
    )).toBeNull();
  });

  it("rejects a quick/full target mismatch instead of mixing actor facts", () => {
    const selected = projectDogLivingActorInspection(dog(), currentObservation());
    if (selected === null) throw new Error("fixture dog should be directly visible");
    const mismatch: SelectedLivingActorUIView = {
      ...selected,
      about: {
        ...selected.about,
        target: {
          species: "domestic-dog",
          actorId: "D-R-v1-some-other-dog",
        },
      },
    };
    expect(hasCoherentLivingActorInspection(mismatch)).toBe(false);
    expect(resolveActorAboutSurface({ selectedLivingActor: mismatch })).toBeUndefined();
    expect(sameLivingActorTarget(
      selected.target,
      { species: "human", actorId: "H-v1-compatible-human" },
    )).toBe(false);
  });

  it("resolves animal ABOUT without inventing actions and retains the human bridge", () => {
    const selected = projectDogLivingActorInspection(dog(), currentObservation());
    if (selected === null) throw new Error("fixture dog should be directly visible");
    const animal = resolveActorAboutSurface({
      selectedLivingActor: selected,
      selectedResident: compatibilityResident(),
    });
    expect(animal).toMatchObject({
      selectionKey: `domestic-dog:${selected.target.actorId}`,
      species: "domestic-dog",
      quickSummary: selected.quick.summary,
      closeCommand: {
        type: "living-actor",
        action: "close",
        target: selected.target,
      },
    });
    expect(animal).not.toHaveProperty("actionLabel");

    const human = resolveActorAboutSurface({ selectedResident: compatibilityResident() });
    expect(human).toMatchObject({
      species: "human",
      actionLabel: "GREET",
      interactions: [],
      closeCommand: { type: "resident", action: "close", residentId: "7" },
    });
  });

  it("attaches a bounded contextual choice set without treating proposals as outcomes", () => {
    const selected = projectDogLivingActorInspection(dog(), currentObservation());
    if (selected === null) throw new Error("fixture dog should be directly visible");
    const interactive = withLivingActorInteractions(selected, [
      { id: "help", label: "ASK TO HELP", hint: "The porter may refuse." },
      { id: "secure-food", label: "SECURE FOOD" },
      { id: "wait", label: "WAIT", disabled: true, hint: "Reach safe footing first." },
      { id: "reroute", label: "REROUTE" },
      { id: "leave", label: "LEAVE" },
    ]);

    expect(interactive?.interactions).toHaveLength(5);
    expect(resolveActorAboutSurface({ selectedLivingActor: interactive! })?.interactions)
      .toEqual(interactive?.interactions);
    expect(Object.isFrozen(interactive?.interactions)).toBe(true);
    expect(withLivingActorInteractions(selected, [
      { id: "help", label: "HELP" },
      { id: "help", label: "HELP AGAIN" },
    ])).toBeNull();
    expect(withLivingActorInteractions(selected, [
      { id: "attack", label: "INVENTED" },
    ])).toBeNull();
  });
});

// Compile-time guard: the additive fields remain optional for every existing
// runtime/test fixture until the authoritative dog sidecar is exposed.
const legacyViewCompatibility: Pick<TideweftUIView, "selectedLivingActor" | "selectedResident"> = {};
void legacyViewCompatibility;
