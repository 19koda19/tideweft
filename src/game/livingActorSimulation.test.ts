import { describe, expect, it } from "vitest";

import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { createLivingActorAddress } from "./livingActor";
import {
  LIVING_ACTOR_INTERACTION_WINDOW_MAX_TILES,
  LIVING_ACTOR_SIMULATION_POLICY_VERSION,
  resolveLivingActorSimulationPolicy,
} from "./livingActorSimulation";
import { createWorldPosition } from "./worldPosition";

function actor(
  actorId: string,
  species: "human" | "domestic-dog",
  globalTileX: number,
  globalTileY: number,
) {
  const region = createRegionCoord(
    Math.floor(globalTileX / 96),
    Math.floor(globalTileY / 72),
  );
  const localTileX = globalTileX - region.x * 96;
  const localTileY = globalTileY - region.y * 72;
  return createLivingActorAddress({
    actorId,
    species,
    position: createWorldPosition(region, localTileX * 1_000, localTileY * 1_000),
    persistence: species === "human" ? "promoted" : "regional",
  });
}

const WINDOW = Object.freeze({
  origin: Object.freeze({ x: -20, y: -20 }),
  terrain: Object.freeze({ width: 40, height: 40 }),
});

describe("species-neutral living actor active/coarse policy", () => {
  it("permits full perception, movement, and contact only when every participant is loaded", () => {
    const dog = actor("D-v1-active-dog", "domestic-dog", -3, 7);
    const porter = actor("H-v1-active-porter", "human", 9, -4);
    const policy = resolveLivingActorSimulationPolicy({
      participants: [porter, dog],
      loadedWindow: WINDOW,
    });

    expect(policy).toEqual({
      version: LIVING_ACTOR_SIMULATION_POLICY_VERSION,
      mode: "full",
      reason: "all-participants-loaded",
      participantIds: [dog.actorId, porter.actorId],
      loadedParticipantIds: [dog.actorId, porter.actorId],
      unloadedParticipantIds: [],
      allowNewObservations: true,
      allowPhysicalInteractions: true,
      allowPhysiologyAdvance: true,
      allowPhysicalMovement: true,
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy?.participantIds)).toBe(true);
  });

  it("fails the whole causal web to coarse when one relevant actor is outside the window", () => {
    const dog = actor("D-v1-coarse-dog", "domestic-dog", 0, 0);
    const porter = actor("H-v1-coarse-porter", "human", 80, 0);
    const policy = resolveLivingActorSimulationPolicy({
      participants: [dog, porter],
      loadedWindow: WINDOW,
    });

    expect(policy).toMatchObject({
      mode: "coarse",
      reason: "participant-unloaded",
      loadedParticipantIds: [dog.actorId],
      unloadedParticipantIds: [porter.actorId],
      allowNewObservations: false,
      allowPhysicalInteractions: false,
      allowPhysiologyAdvance: true,
      allowPhysicalMovement: false,
    });
  });

  it("treats an unloaded window as coarse without changing participant identities", () => {
    const dog = actor("D-v1-no-window", "domestic-dog", 0, 0);
    const policy = resolveLivingActorSimulationPolicy({
      participants: [dog],
      loadedWindow: null,
    });

    expect(policy).toMatchObject({
      mode: "coarse",
      reason: "window-unloaded",
      participantIds: [dog.actorId],
      loadedParticipantIds: [],
      unloadedParticipantIds: [dog.actorId],
    });
  });

  it("is deterministic across ordering and supports negative segmented coordinates", () => {
    const dog = actor("D-v1-order-dog", "domestic-dog", -2, -2);
    const porter = actor("H-v1-order-porter", "human", 2, 2);
    const first = resolveLivingActorSimulationPolicy({
      participants: [porter, dog],
      loadedWindow: WINDOW,
    });
    const second = resolveLivingActorSimulationPolicy({
      participants: [dog, porter],
      loadedWindow: WINDOW,
    });

    expect(second).toEqual(first);
  });

  it("keeps extreme coordinates segmented and coarse instead of flattening them", () => {
    const extremeDog = createLivingActorAddress({
      actorId: "D-v1-extreme",
      species: "domestic-dog",
      position: createWorldPosition(createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT), 0, 0),
      persistence: "promoted",
    });
    const policy = resolveLivingActorSimulationPolicy({
      participants: [extremeDog],
      loadedWindow: WINDOW,
    });

    expect(policy).toMatchObject({
      mode: "coarse",
      unloadedParticipantIds: [extremeDog.actorId],
    });
  });

  it("rejects malformed, empty, duplicate, or aliased participant sets", () => {
    const dog = actor("D-v1-invalid-dog", "domestic-dog", 0, 0);
    expect(resolveLivingActorSimulationPolicy({ participants: [], loadedWindow: WINDOW })).toBeNull();
    expect(resolveLivingActorSimulationPolicy({
      participants: [dog, dog],
      loadedWindow: WINDOW,
    })).toBeNull();
    expect(resolveLivingActorSimulationPolicy({
      participants: [dog],
      loadedWindow: {
        ...WINDOW,
        terrain: { width: 0, height: 40 },
      },
    })).toBeNull();
    expect(resolveLivingActorSimulationPolicy({
      participants: [dog],
      loadedWindow: {
        ...WINDOW,
        terrain: { width: LIVING_ACTOR_INTERACTION_WINDOW_MAX_TILES + 1, height: 40 },
      },
    })).toBeNull();
    expect(resolveLivingActorSimulationPolicy({
      participants: [dog],
      loadedWindow: WINDOW,
      extra: true,
    } as never)).toBeNull();
  });
});
