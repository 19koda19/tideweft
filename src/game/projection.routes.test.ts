import { describe, expect, it } from "vitest";

import { VISIBILITY_DIRECT } from "./perception";
import { TILE_UNITS, createPlayer, type PlayerState } from "./player";
import { projectGameView, projectPerception } from "./projection";
import { createWorld, createWorldView, FIXED_POINT, type WorldView } from "../sim/public";
import { STRAND_AUTOMATION_THRESHOLD } from "../sim/types";

function placePlayerAtTile(
  world: WorldView,
  player: PlayerState,
  tileIndex: number,
): void {
  const tile = world.terrain.tiles[tileIndex];
  if (!tile) throw new Error("fixture lost its observer tile");
  player.x = tile.x * TILE_UNITS + TILE_UNITS / 2;
  player.y = tile.y * TILE_UNITS + TILE_UNITS / 2;
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
    const routeTiles = route.path.flatMap((index) => {
      const tile = world.terrain.tiles[index];
      return tile ? [tile] : [];
    });
    const observerTile = world.terrain.tiles.find((tile) =>
      routeTiles.every((routeTile) => Math.hypot(tile.x - routeTile.x, tile.y - routeTile.y) > 12)
    );
    if (!observerTile) throw new Error("fixture needs a viewpoint beyond route-detail range");
    placePlayerAtTile(world, player, observerTile.index);
    const authoritativePerception = projectPerception(world, player);
    expect(route.path.every((index) =>
      authoritativePerception.detailVisibilityGrades[index] !== VISIBILITY_DIRECT
    )).toBe(true);

    const projected = projectGameView(world, player, {
      perception: authoritativePerception,
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
    const pairStart = route.path.findIndex((tileIndex, index) =>
      index > 0
      && index + 1 < route.path.length
      && route.path[index + 1] !== tileIndex
    );
    if (pairStart < 0) throw new Error("fixture needs adjacent distinct route points");
    const startIndex = route.path[pairStart];
    const nextIndex = route.path[pairStart + 1];
    if (startIndex === undefined || nextIndex === undefined) {
      throw new Error("fixture lost its route pair");
    }
    const startTile = world.terrain.tiles[startIndex];
    const nextTile = world.terrain.tiles[nextIndex];
    if (!startTile || !nextTile) throw new Error("fixture lost route terrain");
    placePlayerAtTile(world, player, startIndex);
    player.facingMilliRadians = Math.round(
      Math.atan2(nextTile.y - startTile.y, nextTile.x - startTile.x) * 1_000,
    );
    const authoritativePerception = projectPerception(world, player);
    expect(authoritativePerception.detailVisibilityGrades[startIndex]).toBe(VISIBILITY_DIRECT);
    expect(authoritativePerception.detailVisibilityGrades[nextIndex]).toBe(VISIBILITY_DIRECT);

    const projected = projectGameView(world, player, {
      perception: authoritativePerception,
    }).routes.find((candidate) => candidate.id === String(route.id));

    expect(projected?.kind).toBe("remembered");
    const startPoint = projected?.points[pairStart];
    const nextPoint = projected?.points[pairStart + 1];
    const observedRun = projected?.observedRuns?.find(({ points }) =>
      points.some((point, index) =>
        point.x === startPoint?.x
        && point.y === startPoint?.y
        && points[index + 1]?.x === nextPoint?.x
        && points[index + 1]?.y === nextPoint?.y
      )
    );
    expect(observedRun).toMatchObject({
      kind: route.traceStrength >= STRAND_AUTOMATION_THRESHOLD ? "strand" : "footpath",
      strength: route.traceStrength / FIXED_POINT,
      condition: route.condition / FIXED_POINT,
      reliability: route.reliability / FIXED_POINT,
      traffic: Math.min(1, route.traffic / 20),
    });
    expect(observedRun?.points.length).toBeGreaterThanOrEqual(2);
  });
});
