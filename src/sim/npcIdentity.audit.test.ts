import { describe, expect, it } from "vitest";

import {
  assertWorldInvariants,
  createWorld,
  deserializeWorld,
  serializeWorld,
  stepWorld,
  type WorldState,
} from "./public";

function clonedWorld(seed: string): WorldState {
  return structuredClone(createWorld(seed, "standard"));
}

describe("independent resident identity and persistence audit", () => {
  it("rejects two residents that claim one persistent identity", () => {
    const world = clonedWorld("identity collision audit");
    const first = world.residents[0];
    const second = world.residents[1];
    if (!first || !second) throw new Error("fixture needs two residents");

    second.identity.stableId = first.identity.stableId;

    expect(() => assertWorldInvariants(world)).toThrow(/stable ID .* duplicated/u);
  });

  it("rejects malformed identity dictionaries instead of accepting impossible actors", () => {
    const mutations: readonly ((world: WorldState) => void)[] = [
      (world) => { world.residents[0]!.role = "bear" as never; },
      (world) => { world.residents[0]!.intention = "teleport" as never; },
      (world) => { world.residents[0]!.identity.age = "ancient" as never; },
      (world) => { world.residents[0]!.identity.build = "impossible" as never; },
      (world) => { world.residents[0]!.identity.appearance.hair = "ultraviolet" as never; },
      (world) => { world.residents[0]!.identity.appearance.mark = "omniscient" as never; },
      (world) => { world.residents[0]!.identity.appearance.palette = "void" as never; },
      (world) => { world.residents[0]!.identity.history[0]!.kind = "rewrote-save" as never; },
      (world) => { world.residents[0]!.identity.temperament[0] = "enemy" as never; },
      (world) => { world.residents[0]!.identity.skills[0]!.kind = "all-knowing" as never; },
      (world) => { world.residents[0]!.identity.visibleGear[0] = "rifle-from-nowhere" as never; },
      (world) => { world.residents[0]!.condition.emotion = "random" as never; },
    ];

    for (const mutate of mutations) {
      const world = clonedWorld("malformed actor audit");
      mutate(world);
      expect(() => assertWorldInvariants(world)).toThrow();
    }
  });

  it("preserves learned identity and bounded memories through the exact save envelope", () => {
    const world = createWorld("knowledge survives reload", "standard");
    const resident = world.residents[0];
    if (!resident) throw new Error("fixture needs a resident");

    stepWorld(world, [{
      id: "audit-observation",
      type: "observe-resident",
      residentId: resident.id,
    }]);
    stepWorld(world, [{
      id: "audit-greeting",
      type: "greet-resident",
      residentId: resident.id,
      observedTick: 1,
    }]);
    const before = structuredClone(resident);
    const restored = deserializeWorld(serializeWorld(world));
    const after = restored.residents.find(({ id }) => id === resident.id);

    expect(after).toMatchObject({
      id: before.id,
      name: before.name,
      role: before.role,
      identity: before.identity,
      playerKnowledge: before.playerKnowledge,
      memories: before.memories,
    });
    expect(after?.memories).toHaveLength(1);
    expect(() => assertWorldInvariants(restored)).not.toThrow();
  });

  it("keeps all compatibility identities unique after a save round trip", () => {
    const restored = deserializeWorld(serializeWorld(
      createWorld("forty two persistent people audit", "standard"),
    ));
    const ids = restored.residents.map(({ identity }) => identity.stableId);

    expect(ids).toHaveLength(42);
    expect(new Set(ids).size).toBe(42);
    expect(ids.every((id) => /^H-v1-/u.test(id))).toBe(true);
  });
});
