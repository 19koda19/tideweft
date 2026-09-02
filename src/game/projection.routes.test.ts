import { describe, expect, it } from "vitest";

import { PERCEPTION_VERSION, type PerceptionResult } from "./perception";
import { createPlayer } from "./player";
import { projectGameView } from "./projection";
import { createWorld, createWorldView, FIXED_POINT } from "../sim/public";
import { STRAND_AUTOMATION_THRESHOLD } from "../sim/types";

function perception(
  count: number,
  directIndices: readonly number[] = [],
  peripheralIndices: readonly number[] = [],
): PerceptionResult {
  const visibilityGrades = new Uint8Array(count);
  for (const index of peripheralIndices) visibilityGrades[index] = 1;
  for (const index of directIndices) visibilityGrades[index] = 2;
  return {
    version: PERCEPTION_VERSION,
    valid: true,
    visibilityGrades,
    visibleTileIndices: [...new Set([...peripheralIndices, ...directIndices])],
    directTileIndices: [...directIndices],
    peripheralTileIndices: peripheralIndices.filter((index) => !directIndices.includes(index)),
    playerTileIndex: 0,
    signature: `route-test:${directIndices.join(",")}`,
  };
}

describe("route perception projection", () => {
  it("keeps known geometry but withholds every live route value behind fog", () => {
    const world = createWorldView(createWorld("the road remembered without gossip", "standard"));
    const player = createPlayer(world);
    const route = world.routes.find((candidate) => candidate.path.length >= 2);
    if (!route) throw new Error("fixture needs a route");
    const from = world.settlements.find((settlement) => settlement.id === route.fromSettlementId);
    const to = world.settlements.find((settlement) => settlement.id === route.toSettlementId);
    if (!from || !to) throw new Error("route endpoints must exist");
    player.discovered[from.tileIndex] = FIXED_POINT;
    player.discovered[to.tileIndex] = FIXED_POINT;

    const projected = projectGameView(world, player, {
      perception: perception(world.terrain.tiles.length, [], route.path),
    }).routes.find((candidate) => candidate.id === String(route.id));

    expect(projected).toBeDefined();
    expect(projected?.points).toHaveLength(route.path.length);
    expect(projected).toMatchObject({
      kind: "remembered",
      strength: 0,
      condition: 0,
      reliability: 0,
      observedRuns: [],
    });
    expect(projected).not.toHaveProperty("traffic");
  });

  it("projects live styling only on contiguous directly observed route runs", () => {
    const world = createWorldView(createWorld("two clear footsteps and then the fog", "standard"));
    const player = createPlayer(world);
    const route = world.routes.find((candidate) => candidate.path.length >= 3);
    if (!route) throw new Error("fixture needs a three-point route");
    const from = world.settlements.find((settlement) => settlement.id === route.fromSettlementId);
    const to = world.settlements.find((settlement) => settlement.id === route.toSettlementId);
    if (!from || !to) throw new Error("route endpoints must exist");
    player.discovered[from.tileIndex] = FIXED_POINT;
    player.discovered[to.tileIndex] = FIXED_POINT;
    const direct = route.path.slice(0, 2);

    const projected = projectGameView(world, player, {
      perception: perception(world.terrain.tiles.length, direct),
    }).routes.find((candidate) => candidate.id === String(route.id));

    expect(projected?.kind).toBe("remembered");
    expect(projected?.observedRuns).toHaveLength(1);
    expect(projected?.observedRuns?.[0]).toMatchObject({
      kind: route.traceStrength >= STRAND_AUTOMATION_THRESHOLD ? "strand" : "footpath",
      strength: route.traceStrength / FIXED_POINT,
      condition: route.condition / FIXED_POINT,
      reliability: route.reliability / FIXED_POINT,
      traffic: Math.min(1, route.traffic / 20),
    });
    expect(projected?.observedRuns?.[0]?.points).toHaveLength(2);
  });
});
