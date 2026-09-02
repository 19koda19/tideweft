import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { VISIBILITY_DIRECT } from "./perception";
import { averageObservedRouteStrength } from "./runtime";

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
});
