import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createPlayer, playerTileIndex } from "./player";
import { VISIBILITY_DIRECT } from "./perception";
import { averageObservedRouteStrength, localWaterAmbience } from "./runtime";

describe("local route ambience", () => {
  it("ignores hidden remote route strength while responding to an observed strand", () => {
    const world = createWorldView(createWorld("only nearby strands can sing"));
    const visibleRoute = world.routes.find((route) => route.path.some((tileIndex) =>
      world.routes.some((other) => other.id !== route.id && !other.path.includes(tileIndex))
    ));
    if (!visibleRoute) throw new Error("fixture needs a route with a locally distinct tile");
    const visibleTile = visibleRoute.path.find((tileIndex) =>
      world.routes.some((other) => other.id !== visibleRoute.id && !other.path.includes(tileIndex))
    );
    if (visibleTile === undefined) throw new Error("fixture lost its distinct route tile");
    const grades = new Uint8Array(world.terrain.tiles.length);
    grades[visibleTile] = VISIBILITY_DIRECT;
    const observedIds = new Set(
      world.routes.filter((route) => route.path.includes(visibleTile)).map((route) => route.id),
    );
    const hidden = world.routes.find((route) => !observedIds.has(route.id));
    if (!hidden) throw new Error("fixture needs one hidden route");

    const baseline = averageObservedRouteStrength(world, grades);
    const hiddenChanged = {
      ...world,
      routes: world.routes.map((route) => route.id === hidden.id
        ? { ...route, traceStrength: 1_000_000 }
        : route),
    };
    expect(averageObservedRouteStrength(hiddenChanged, grades)).toBe(baseline);

    const visibleChanged = {
      ...world,
      routes: world.routes.map((route) => observedIds.has(route.id)
        ? { ...route, traceStrength: 1_000_000 }
        : route),
    };
    expect(averageObservedRouteStrength(visibleChanged, grades)).toBeGreaterThan(baseline);
  });

  it("fails closed for a malformed sensory field", () => {
    const world = createWorldView(createWorld("silent malformed route sight"));
    expect(averageObservedRouteStrength(world, new Uint8Array(1))).toBe(0);
  });

  it("makes rough water beside a dry bank brighter than having no local water", () => {
    const world = createWorldView(createWorld("bank side local water noise"));
    const player = createPlayer(world);
    const tileIndex = playerTileIndex(player);
    const playerColumn = tileIndex % world.terrain.width;
    const adjacentIndex = playerColumn < world.terrain.width - 1
      ? tileIndex + 1
      : tileIndex - 1;
    const adjacentDirection = adjacentIndex > tileIndex ? 1 : -1;
    const dry = {
      ...world,
      terrain: {
        ...world.terrain,
        tiles: world.terrain.tiles.map((tile) => ({ ...tile, waterDepth: 0 })),
      },
    };
    const rough = {
      ...dry,
      terrain: {
        ...dry.terrain,
        tiles: dry.terrain.tiles.map((tile, index) => index === adjacentIndex
          ? { ...tile, waterDepth: 900_000, roughness: 950_000 }
          : tile),
      },
    };
    const silent = localWaterAmbience(dry, player);
    expect(silent).toEqual({ strength: 0, turbulence: 0, voice: "silent", pan: 0 });
    const noisy = localWaterAmbience(rough, player);
    expect(noisy.voice).toBe("whissh");
    expect(noisy.strength).toBeGreaterThan(silent.strength);
    expect(noisy.turbulence).toBeGreaterThan(silent.turbulence);
    expect(Math.sign(noisy.pan)).toBe(adjacentDirection);
    expect(noisy.pan).toBeGreaterThanOrEqual(-1);
    expect(noisy.pan).toBeLessThanOrEqual(1);
  });
});
