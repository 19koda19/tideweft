import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { TILE_UNITS, createPlayer, stepPlayer } from "./player";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  capturePlayerRegionalTravel,
  migratePlayerToRegionalTravel,
  recenterRegionalPlayer,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
} from "./regionalPlayerTravel";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";

function fixture(seed = "a horizon with memory") {
  const world = createWorld(seed, "wild");
  const view = createWorldView(world);
  const player = createPlayer(view, view.settlements[0]?.id);
  return { world, player };
}

describe("regional player floating-origin travel", () => {
  it("migrates region 0,0 without moving the physical local position", () => {
    const { world, player } = fixture();
    const before = { x: player.x, y: player.y, tile: Math.floor(player.y / TILE_UNITS) * WORLD_WIDTH + Math.floor(player.x / TILE_UNITS) };
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    expect(state.stream.center).toEqual({ x: 0, y: 0 });
    expect(player.worldWidth).toBe(REGIONAL_TRAVEL_COLUMNS);
    expect(player.worldHeight).toBe(REGIONAL_TRAVEL_ROWS);
    expect(player.x).toBe(before.x + TILE_UNITS);
    expect(player.y).toBe(before.y + TILE_UNITS);
    expect(state.window.addresses[Math.floor(player.y / TILE_UNITS) * player.worldWidth + Math.floor(player.x / TILE_UNITS)]).toEqual({
      region: { x: 0, y: 0 },
      localX: before.tile % WORLD_WIDTH,
      localY: Math.floor(before.tile / WORLD_WIDTH),
    });
  });

  it("crosses east and west, preserving sub-tile position and bounded loaded memory", () => {
    const { world, player } = fixture("walk over both signed seams");
    let state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    player.x = (REGIONAL_TRAVEL_COLUMNS - 1) * TILE_UNITS + 443;
    player.y = 21 * TILE_UNITS + 678;
    player.previousX = player.x - 100;
    player.previousY = player.y;
    let crossed = recenterRegionalPlayer(world.meta.rootSeed, state, player);
    state = crossed.state;
    expect(crossed).toMatchObject({ crossed: true, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } });
    expect(player.x).toBe(TILE_UNITS + 443);
    expect(player.y).toBe(21 * TILE_UNITS + 678);
    expect(state.stream.loaded).toHaveLength(5);

    player.x = 543;
    player.previousX = 643;
    crossed = recenterRegionalPlayer(world.meta.rootSeed, state, player);
    expect(crossed.to).toEqual({ x: 0, y: 0 });
    expect(player.x).toBe(WORLD_WIDTH * TILE_UNITS + 543);
    expect(crossed.state.stream.loaded).toHaveLength(5);
  });

  it("crosses a diagonal corner into negative coordinates and rebases a live sweep path", () => {
    const { world, player } = fixture("the current takes a diagonal corner");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    player.x = 500;
    player.y = 500;
    player.previousX = 620;
    player.previousY = 620;
    player.sweepPath = [0, REGIONAL_TRAVEL_COLUMNS + 1];
    const crossed = recenterRegionalPlayer(world.meta.rootSeed, state, player);
    expect(crossed.to).toEqual({ x: -1, y: -1 });
    expect(player.x).toBe((WORLD_WIDTH + 1) * TILE_UNITS - 500);
    expect(player.y).toBe((WORLD_HEIGHT + 1) * TILE_UNITS - 500);
    expect(player.sweepPath).toHaveLength(2);
    expect(player.sweepPath.every((index) => index >= 0 && index < player.worldWidth * player.worldHeight)).toBe(true);
  });

  it("preserves a corner-crossing ADRIFT player when their stale guide escapes another halo", () => {
    const { world, player } = fixture("adrift against the northwest seam");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const eastHaloGuide = Math.floor(REGIONAL_TRAVEL_ROWS / 2) * REGIONAL_TRAVEL_COLUMNS
      + REGIONAL_TRAVEL_COLUMNS - 1;
    expect(state.window.addresses[eastHaloGuide]?.region).toEqual({ x: 1, y: 0 });

    // The derived guide still aims through the east halo, but a real paddle
    // stroke has carried the authoritative position through the perpendicular
    // northwest corner into signed region -1,-1.
    player.mode = "swept";
    player.sweepPath = [eastHaloGuide];
    player.sweepTicksRemaining = 77;
    player.sweepTotalTicks = 88;
    player.x = 500;
    player.y = 500;
    player.previousX = 611;
    player.previousY = 733;

    let crossed: ReturnType<typeof recenterRegionalPlayer> | undefined;
    expect(() => {
      crossed = recenterRegionalPlayer(world.meta.rootSeed, state, player);
    }).not.toThrow();
    expect(crossed).toBeDefined();
    if (!crossed) throw new Error("Expected the corner ADRIFT transition to complete");

    expect(crossed).toMatchObject({
      crossed: true,
      from: { x: 0, y: 0 },
      to: { x: -1, y: -1 },
    });
    expect(player).toMatchObject({
      x: (WORLD_WIDTH + 1) * TILE_UNITS - 500,
      y: (WORLD_HEIGHT + 1) * TILE_UNITS - 500,
      previousX: (WORLD_WIDTH + 1) * TILE_UNITS - 389,
      previousY: (WORLD_HEIGHT + 1) * TILE_UNITS - 267,
      mode: "swept",
      sweepPath: [],
      // One remaining beat gives stepSweptPlayer a deterministic opportunity
      // to derive a fresh reachable-bank guide from the exact recentered tile.
      sweepTicksRemaining: 1,
      sweepTotalTicks: 88,
    });
    expect(player.x % TILE_UNITS).toBe(500);
    expect(player.y % TILE_UNITS).toBe(500);
    expect(player.previousX % TILE_UNITS).toBe(611);
    expect(player.previousY % TILE_UNITS).toBe(733);
  });

  it("persists and restores the exact window, chart, signed center, and transition ordinal", () => {
    const { world, player } = fixture("signed folio roundtrip");
    let state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    player.x = (REGIONAL_TRAVEL_COLUMNS - 1) * TILE_UNITS + 500;
    state = recenterRegionalPlayer(world.meta.rootSeed, state, player).state;
    const index = 9 * player.worldWidth + 12;
    player.discovered[index] = 888_000;
    player.depthSoundings[index] = 444_000;
    state = capturePlayerRegionalTravel(state, player);
    const text = serializePlayerRegionalTravel(state);
    const snapshot = structuredClone(player);
    const restored = restorePlayerRegionalTravel(world.meta.rootSeed, snapshot, text);
    expect(restored?.stream.center).toEqual({ x: 1, y: 0 });
    expect(restored?.stream.transitionOrdinal).toBe(1);
    expect(restored?.cartography).toEqual(state.cartography);

    snapshot.discovered[index] = 0;
    expect(restorePlayerRegionalTravel(world.meta.rootSeed, snapshot, text)).toBeNull();
  });

  it("does not cross while the player remains in the active region interior", () => {
    const { world, player } = fixture("no phantom border event");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const result = recenterRegionalPlayer(world.meta.rootSeed, state, player);
    expect(result.crossed).toBe(false);
    expect(result.state).toBe(state);
    expect(result.generatedKeys).toEqual([]);
    expect(result.evictedKeys).toEqual([]);
  });

  it("carries an exhausted sweep to the halo when no bank exists in the current region", () => {
    const { world, player } = fixture("a river wider than one horizon");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const compatibility = createWorldView(world);
    const view = createRegionalWorldView(compatibility, state.window, {
      discovered: player.discovered,
      depthSoundings: player.depthSoundings,
    });
    for (const tile of view.terrain.tiles) {
      const mutable = tile as { terrain: "deep-water"; waterDepth: number; elevation: number };
      mutable.terrain = "deep-water";
      mutable.waterDepth = 260_000;
      mutable.elevation = 0;
    }
    player.x = 48 * TILE_UNITS + TILE_UNITS / 2;
    player.y = 36 * TILE_UNITS + TILE_UNITS / 2;
    player.previousX = player.x;
    player.previousY = player.y;
    player.currentTrace = [36 * player.worldWidth + 48];
    player.surveyTrace = [...player.currentTrace];
    player.stamina = 0;
    player.stability = 0;
    const result = stepPlayer(player, view, { moveX: 0, moveY: 0, brace: false });
    expect(result.becameSwept).toBe(true);
    expect(player.sweepPath.length).toBeGreaterThan(0);
    const destination = view.terrain.tiles[player.sweepPath.at(-1)!];
    expect(destination?.x === 0
      || destination?.y === 0
      || destination?.x === view.terrain.width - 1
      || destination?.y === view.terrain.height - 1).toBe(true);
  });
});
