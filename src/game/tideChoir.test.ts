import { describe, expect, it } from "vitest";

import {
  createWorld,
  createWorldView,
  type RouteState,
  type WorldView,
} from "../sim/public";
import {
  SURVEY_COVERAGE_THRESHOLD,
  appendSurveyedHarborLeg,
  assessHarborLeg,
  detectNewlyClosedChoir,
  normalizeHarborTrail,
  type HarborLegSurvey,
} from "./tideChoir";

function fixture(): WorldView {
  return createWorldView(createWorld("tide choir game helpers", "calm"));
}

function routeBetween(world: WorldView, leftHarborId: number, rightHarborId: number): RouteState {
  const route = world.routes.find(
    (candidate) =>
      (candidate.fromSettlementId === leftHarborId && candidate.toSettlementId === rightHarborId)
      || (candidate.fromSettlementId === rightHarborId && candidate.toSettlementId === leftHarborId),
  );
  if (route === undefined) throw new Error(`fixture missing route ${leftHarborId}-${rightHarborId}`);
  return route;
}

function harborIds(world: WorldView, count: number): number[] {
  const ids = world.settlements.slice(0, count).map((settlement) => settlement.id);
  if (ids.length !== count) throw new Error("fixture missing harbors");
  return ids;
}

function surveyedLeg(world: WorldView, fromHarborId: number, toHarborId: number): HarborLegSurvey {
  const route = routeBetween(world, fromHarborId, toHarborId);
  const trace = route.fromSettlementId === fromHarborId ? route.path : [...route.path].reverse();
  const leg = assessHarborLeg(world, fromHarborId, toHarborId, trace);
  if (!leg.surveyed) throw new Error(`fixture leg ${fromHarborId}-${toHarborId} was not surveyed`);
  return leg;
}

describe("harbor leg surveying", () => {
  it("accepts a trace that stays in the route's one-tile corridor", () => {
    const world = fixture();
    const route = world.routes[0];
    if (route === undefined) throw new Error("fixture missing route");
    const width = world.terrain.width;
    const nearCorridorTrace = route.path.map((tileIndex) => {
      const tile = world.terrain.tiles[tileIndex];
      if (tile === undefined) throw new Error("route left the terrain");
      const adjacentX = tile.x + 1 < width ? tile.x + 1 : tile.x - 1;
      return tile.y * width + adjacentX;
    });

    const result = assessHarborLeg(
      world,
      route.fromSettlementId,
      route.toSettlementId,
      nearCorridorTrace,
    );

    expect(result.surveyed).toBe(true);
    expect(result.coverage).toBeGreaterThanOrEqual(SURVEY_COVERAGE_THRESHOLD);
    expect(result.routeId).toBe(route.id);
    expect(result.reason).toBe("surveyed");
  });

  it("does not survey a direct route from a distant trace", () => {
    const world = fixture();
    const route = world.routes[0];
    if (route === undefined) throw new Error("fixture missing route");
    const routeTiles = route.path.map((tileIndex) => world.terrain.tiles[tileIndex]);
    const distantTile = world.terrain.tiles.find((candidate) =>
      routeTiles.every((routeTile) =>
        routeTile === undefined
        || Math.max(Math.abs(candidate.x - routeTile.x), Math.abs(candidate.y - routeTile.y)) > 3,
      ),
    );
    if (distantTile === undefined) throw new Error("fixture has no distant tile");

    const result = assessHarborLeg(
      world,
      route.fromSettlementId,
      route.toSettlementId,
      [distantTile.index],
    );

    expect(result.surveyed).toBe(false);
    expect(result.coverage).toBeLessThan(SURVEY_COVERAGE_THRESHOLD);
    expect(result.reason).toBe("insufficient-coverage");
  });
});

describe("Tide Choir cycle detection", () => {
  it("gives a triangle the same canonical route set and key in both directions", () => {
    const world = fixture();
    const [a, b, c] = harborIds(world, 3);
    if (a === undefined || b === undefined || c === undefined) throw new Error("fixture missing triangle");

    const clockwise = detectNewlyClosedChoir(world, [a, b, c, a]);
    const counterclockwise = detectNewlyClosedChoir(world, [a, c, b, a]);

    expect(clockwise).not.toBeNull();
    expect(counterclockwise).not.toBeNull();
    expect(counterclockwise?.key).toBe(clockwise?.key);
    expect(counterclockwise?.routeIds).toEqual(clockwise?.routeIds);
    expect(clockwise?.routeIds).toEqual([...(clockwise?.routeIds ?? [])].sort((left, right) => left - right));
    expect(counterclockwise?.harborIds).toEqual(clockwise?.harborIds);
  });

  it("rejects an immediate backtrack instead of calling two traversals a choir", () => {
    const world = fixture();
    const [a, b] = harborIds(world, 2);
    if (a === undefined || b === undefined) throw new Error("fixture missing pair");

    const first = appendSurveyedHarborLeg(world, [a], surveyedLeg(world, a, b));
    const backtrack = appendSurveyedHarborLeg(world, first.trail, surveyedLeg(world, b, a));

    expect(detectNewlyClosedChoir(world, [a, b, a])).toBeNull();
    expect(backtrack.accepted).toBe(false);
    expect(backtrack.reason).toBe("immediate-backtrack");
    expect(backtrack.choir).toBeNull();
    expect(backtrack.trail).toEqual([a]);
  });

  it("suppresses a remembered loop even when it is traversed in reverse", () => {
    const world = fixture();
    const [a, b, c] = harborIds(world, 3);
    if (a === undefined || b === undefined || c === undefined) throw new Error("fixture missing triangle");
    const first = detectNewlyClosedChoir(world, [a, b, c, a]);
    if (first === null) throw new Error("fixture triangle did not close");

    expect(detectNewlyClosedChoir(world, [a, c, b, a], [first.key])).toBeNull();

    let trail: readonly number[] = [a];
    trail = appendSurveyedHarborLeg(world, trail, surveyedLeg(world, a, c), [first.key]).trail;
    trail = appendSurveyedHarborLeg(world, trail, surveyedLeg(world, c, b), [first.key]).trail;
    const repeated = appendSurveyedHarborLeg(world, trail, surveyedLeg(world, b, a), [first.key]);
    expect(repeated.reason).toBe("choir-remembered");
    expect(repeated.choir).toBeNull();
    expect(repeated.trail).toEqual([a]);
  });

  it("rejects a repeated interior harbor and normalizes the phrase at arrival", () => {
    const world = fixture();
    const [a, b, c, d] = harborIds(world, 4);
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      throw new Error("fixture missing four harbors");
    }
    const result = appendSurveyedHarborLeg(
      world,
      [a, b, c, d],
      surveyedLeg(world, d, b),
    );

    expect(detectNewlyClosedChoir(world, [a, b, c, b, a])).toBeNull();
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("repeated-interior-vertex");
    expect(result.trail).toEqual([b]);
    expect(normalizeHarborTrail([a, b, c, b, d])).toEqual([b, d]);
  });

  it("rejects a cycle whose closing edge does not exist", () => {
    const world = fixture();
    const [a, b, c] = harborIds(world, 3);
    if (a === undefined || b === undefined || c === undefined) throw new Error("fixture missing triangle");
    const missing = routeBetween(world, c, a);
    const brokenWorld = {
      routes: world.routes.filter((route) => route.id !== missing.id),
    };

    expect(detectNewlyClosedChoir(brokenWorld, [a, b, c, a])).toBeNull();

    const staleLeg = surveyedLeg(world, c, a);
    const result = appendSurveyedHarborLeg(brokenWorld, [a, b, c], staleLeg);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("nonexistent-edge");
    expect(result.choir).toBeNull();
  });
});
