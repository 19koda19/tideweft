import { describe, expect, it } from "vitest";

import { FIXED_POINT, createWorld, createWorldView } from "../sim/public";
import { TILE_UNITS, createPlayer, stepPlayer } from "./player";

describe("civic projects change journey rules", () => {
  it("makes a completed cache restore stamina on dependable footing", () => {
    const world = createWorld("cache shelter");
    const cache = world.settlements.find((settlement) => settlement.project.kind === "cache");
    if (!cache) throw new Error("missing cache");
    cache.project.status = "complete";
    cache.project.progress = cache.project.target;
    const view = createWorldView(world);
    const player = createPlayer(view, cache.id);
    player.stamina = 0;
    player.stability = 100_000;

    const result = stepPlayer(player, view, { moveX: 0, moveY: 0, brace: false });
    expect(result.rescued).toBe(false);
    expect(player.stamina).toBe(13_200);
    expect(player.stability).toBeGreaterThan(990_000);
    expect(player.stability).toBeLessThanOrEqual(FIXED_POINT);
    expect(result.footing?.stabilityAfter).toBe(result.footing?.stabilityTarget);
  });

  it("turns exhaustion on a clinic-covered active route into named mutual-aid rescue", () => {
    const world = createWorld("clinic rescue");
    const clinic = world.settlements.find((settlement) => settlement.project.kind === "clinic");
    if (!clinic) throw new Error("missing clinic");
    clinic.project.status = "complete";
    clinic.project.progress = clinic.project.target;
    const route = world.routes.find(
      (candidate) =>
        (candidate.fromSettlementId === clinic.id || candidate.toSettlementId === clinic.id)
        && candidate.traceStrength >= 32_000,
    );
    if (!route) throw new Error("missing active clinic route");
    const routeTileIndex = route.path[Math.floor(route.path.length / 2)];
    const routeTile = routeTileIndex === undefined ? undefined : world.terrain.tiles[routeTileIndex];
    if (!routeTile) throw new Error("missing route tile");
    routeTile.terrain = "meadow";
    routeTile.roughness = 0;
    routeTile.elevation = 600_000;
    const view = createWorldView(world);
    const player = createPlayer(view, clinic.id);
    player.x = routeTile.x * TILE_UNITS + TILE_UNITS / 2;
    player.y = routeTile.y * TILE_UNITS + TILE_UNITS / 2;
    player.previousX = player.x;
    player.previousY = player.y;
    player.currentTrace = [routeTile.index];
    player.stamina = 16_000;
    player.stability = 250_000;
    player.pace = "swift";

    const result = stepPlayer(player, view, { moveX: 1, moveY: 0, brace: false });
    expect(result.exhausted).toBe(true);
    expect(result.rescued).toBe(true);
    expect(player.mode).toBe("rescued");
    expect(player.stamina).toBe(160_000);
    expect(player.stability).toBeGreaterThanOrEqual(420_000);
    expect(player.rescues).toBe(1);
    expect(player.stamina).toBeLessThan(FIXED_POINT);
  });
});
