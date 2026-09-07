import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import { createDogActorState, repositionDogActor } from "./dogActor";
import {
  DOG_ACTOR_ROSTER_MAX_ACTORS,
  canonicalizeDogActorRoster,
  createDogActorRoster,
  deserializeDogActorRoster,
  dogActorRosterActor,
  replaceDogActorInRoster,
  serializeDogActorRoster,
} from "./dogActorRoster";
import { createWorldPosition } from "./worldPosition";

const SEED: RootSeed = [0x1234_5678, 0x90ab_cdef, 0x1357_9bdf, 0x2468_ace0];

describe("bounded dog actor roster", () => {
  it("orders plural dogs deterministically and replaces only the addressed body", () => {
    const first = dog(2, -8, 9);
    const second = dog(1, -8, 9);
    const state = createDogActorRoster([first, second]);
    expect(state.actors.map(({ identity }) => identity.stableId)).toEqual(
      [first, second].map(({ identity }) => identity.stableId).sort(),
    );
    const moved = repositionDogActor(first, {
      atTick: 1,
      heading: 250_000,
      position: createWorldPosition(createRegionCoord(-8, 9), 18_500, 12_500),
    });
    const replaced = replaceDogActorInRoster(state, moved);

    expect(replaced).not.toBeNull();
    expect(dogActorRosterActor(replaced, moved.identity.stableId)).toEqual(moved);
    expect(dogActorRosterActor(replaced, second.identity.stableId)).toEqual(second);
    expect(deserializeDogActorRoster(serializeDogActorRoster(replaced))).toEqual(replaced);
  });

  it("rejects duplicate, unordered, malformed, and unbounded actor authority", () => {
    const first = dog(1, 0, 0);
    const second = dog(2, 0, 0);
    expect(canonicalizeDogActorRoster({ version: 1, actors: [first, first] })).toBeNull();
    const ordered = [first, second].sort((left, right) => (
      left.identity.stableId < right.identity.stableId ? -1 : 1
    ));
    expect(canonicalizeDogActorRoster({ version: 1, actors: [...ordered].reverse() }))
      .toBeNull();
    expect(canonicalizeDogActorRoster({ version: 1, actors: ordered, hiddenOwner: true }))
      .toBeNull();
    expect(() => createDogActorRoster(Array.from(
      { length: DOG_ACTOR_ROSTER_MAX_ACTORS + 1 },
      (_, index) => dog(index, 1, -1),
    ))).toThrow();
  });

  it("preserves stable identity at signed extreme regions without player coupling", () => {
    const region = createRegionCoord(-1_000_000, 1_000_000);
    const actor = dog(7, region.x, region.y);
    const state = createDogActorRoster([actor]);
    const restored = deserializeDogActorRoster(serializeDogActorRoster(state));

    expect(restored?.actors[0]?.identity.stableId).toBe(actor.identity.stableId);
    expect(restored?.actors[0]?.address.position.region).toEqual(region);
    expect(Object.hasOwn(restored ?? {}, "owner")).toBe(false);
    expect(Object.hasOwn(restored?.actors[0] ?? {}, "workAssignment")).toBe(false);
    expect(Object.isFrozen(restored?.actors)).toBe(true);
  });
});

function dog(ordinal: number, regionX: number, regionY: number) {
  const region = createRegionCoord(regionX, regionY);
  return createDogActorState({
    seed: SEED,
    originRegion: region,
    originNamespace: "regional",
    habitatClass: "settlement-edge",
    habitatKey: "alpha26-guardian-kennel",
    populationKey: "alpha26-working-dogs",
    populationOrdinal: ordinal,
    position: createWorldPosition(region, 16_500 + ordinal * 250, 12_500),
  });
}
