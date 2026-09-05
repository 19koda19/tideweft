import { describe, expect, it } from "vitest";

import { createLivingActorAddress, type LivingActorAddress } from "../game/livingActor";
import { evaluatePerception, type PerceptionCell } from "../game/perception";
import { createWorldPosition } from "../game/worldPosition";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { withLivingActorInteractions } from "./livingActorAbout";
import { projectLivingActorInteractionChoices } from "./livingActorInteractionProjection";
import type { SelectedLivingActorUIView } from "./types";

const DOG_ID = "D-v1-dog/interaction-projection";
const PORTER_ID = "H-v1-porter/interaction-projection";

function fixture(options: Readonly<{
  facingRadians?: number;
  dogLocalX?: number;
  porterLocalX?: number;
}> = {}) {
  const region = createRegionCoord(-8, 13);
  const width = 32;
  const height = 3;
  const cells: PerceptionCell[] = Array.from(
    { length: width * height },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  const dog = actor(
    DOG_ID,
    "domestic-dog",
    options.dogLocalX ?? 4_500,
    region,
  );
  const porter = actor(
    PORTER_ID,
    "human",
    options.porterLocalX ?? 5_500,
    region,
  );
  const observation = {
    window: {
      origin: { x: region.x * WORLD_WIDTH, y: region.y * WORLD_HEIGHT },
      terrain: { width, height },
    },
    perception: evaluatePerception({
      columns: width,
      rows: height,
      cells,
      playerTileIndex: width + 2,
      facingRadians: options.facingRadians ?? 0,
      weatherVisibility: 1,
      rangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 30,
        forwardConeRadians: Math.PI / 2,
      },
      detailRangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 30,
        forwardConeRadians: Math.PI / 2,
      },
    }),
  } as const;
  return {
    dog,
    porter,
    observation,
    input: {
      target: { species: "domestic-dog", actorId: DOG_ID },
      requestRecipientActorId: PORTER_ID,
      actors: [dog, porter],
      observation,
    },
  } as const;
}

function actor(
  actorId: string,
  species: LivingActorAddress["species"],
  localX: number,
  region: ReturnType<typeof createRegionCoord>,
): LivingActorAddress {
  return createLivingActorAddress({
    actorId,
    species,
    position: createWorldPosition(region, localX, 1_500),
    persistence: species === "human" ? "promoted" : "regional",
  });
}

function selection(): SelectedLivingActorUIView {
  const target = { species: "domestic-dog", actorId: DOG_ID } as const;
  return {
    target,
    quick: {
      target,
      heading: "UNKNOWN DOG",
      summary: "Medium dog · Alert",
      distanceUnits: 4_000,
    },
    about: {
      target,
      heading: "UNKNOWN DOG",
      identityLine: "Dog",
      knowledgeLabel: "Unfamiliar",
      observed: [{ label: "Species", value: "Dog" }],
      known: [],
    },
  };
}

describe("living actor interaction projection", () => {
  it("offers five honest proposals when both addressed actors are directly observable", () => {
    const { input } = fixture();
    const choices = projectLivingActorInteractionChoices(input);

    expect(choices?.map(({ id }) => id)).toEqual([
      "help",
      "secure-food",
      "wait",
      "reroute",
      "leave",
    ]);
    expect(choices).toEqual([
      {
        id: "help",
        label: "ASK FOR HELP",
        hint: "A request only; the other actor decides whether to respond.",
      },
      {
        id: "secure-food",
        label: "SUGGEST SECURING BELONGINGS",
        hint: "The other actor decides whether anything needs securing.",
      },
      {
        id: "wait",
        label: "WAIT AND WATCH",
        hint: "Stay nearby and see what happens.",
      },
      {
        id: "reroute",
        label: "ROUTE AROUND THIS SPOT",
        hint: "Uses only the actor's current observed position.",
      },
      { id: "leave", label: "LEAVE" },
    ]);
    expect(Object.isFrozen(choices)).toBe(true);
    expect(choices?.every(Object.isFrozen)).toBe(true);

    const visibleCopy = JSON.stringify(choices?.map(({ label, hint }) => ({ label, hint })));
    expect(visibleCopy).not.toMatch(/pack|cargo|provision|dried|fish|quantity|lot|will help|agreed/iu);
  });

  it("never reveals a supplied recipient that is outside current direct detail perception", () => {
    const current = fixture({ facingRadians: Math.PI });
    const hidden = projectLivingActorInteractionChoices(current.input);
    expect(hidden).toBeNull();

    const recipientBehind = fixture({ porterLocalX: 500 });
    const choices = projectLivingActorInteractionChoices(recipientBehind.input);
    expect(choices?.map(({ id }) => id)).toEqual(["wait", "reroute", "leave"]);
    expect(JSON.stringify(choices)).not.toMatch(/help|secur/iu);
  });

  it("disables world proposals beyond the authoritative action range without disabling leave", () => {
    const { input } = fixture({ dogLocalX: 20_500, porterLocalX: 21_500 });
    const choices = projectLivingActorInteractionChoices(input);

    expect(choices).not.toBeNull();
    expect(choices?.slice(0, -1).every(({ disabled, hint }) =>
      disabled === true && hint === "Move closer while keeping them in clear view."
    )).toBe(true);
    expect(choices?.at(-1)).toEqual({ id: "leave", label: "LEAVE" });
  });

  it("fails closed for forged perception, mismatched identity, and extra authority claims", () => {
    const { input } = fixture();
    expect(projectLivingActorInteractionChoices({
      ...input,
      observation: {
        ...input.observation,
        perception: {
          ...input.observation.perception,
          signature: "perception-v2:forged",
        },
      },
    })).toBeNull();
    expect(projectLivingActorInteractionChoices({
      ...input,
      target: { species: "human", actorId: DOG_ID },
    })).toBeNull();
    expect(projectLivingActorInteractionChoices({
      ...input,
      cargo: { hidden: "food" },
    })).toBeNull();
    expect(projectLivingActorInteractionChoices({
      ...input,
      visible: true,
    })).toBeNull();
  });

  it("composes with the existing desktop/mobile ABOUT contract without gaining authority", () => {
    const { input } = fixture();
    const choices = projectLivingActorInteractionChoices(input);
    const decorated = withLivingActorInteractions(selection(), choices);

    expect(decorated?.interactions).toEqual(choices);
    expect(decorated?.interactions).not.toBe(choices);
    expect(decorated?.target.actorId).toBe(DOG_ID);
    expect(decorated?.about.observed).toEqual([{ label: "Species", value: "Dog" }]);
  });
});
