import { describe, expect, it } from "vitest";

import {
  AUTOPILOT_AXIS_DEADZONE,
  AUTOPILOT_MAX_LOOKAHEAD_TILES,
  smoothAutopilotPath,
  steerAutopilotToPoint,
  traceAutopilotGridSegment,
  type AutopilotPathGrid,
} from "./autopilotPath";

function uniformGrid(width: number, height: number): AutopilotPathGrid {
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ({
      baseTravelCost: 100,
      elevation: 400_000,
    })),
  };
}

function xThenYPath(
  width: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number[] {
  const path = [fromY * width + fromX];
  let x = fromX;
  let y = fromY;
  while (x !== toX) {
    x += Math.sign(toX - x);
    path.push(y * width + x);
  }
  while (y !== toY) {
    y += Math.sign(toY - y);
    path.push(y * width + x);
  }
  return path;
}

function traceSmoothed(width: number, height: number, path: readonly number[]): number[] {
  const trace: number[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const segment = traceAutopilotGridSegment(
      width,
      height,
      path[index - 1] as number,
      path[index] as number,
    );
    trace.push(...(index === 1 ? segment : segment.slice(1)));
  }
  return trace;
}

describe("deterministic autopilot string pulling", () => {
  it("turns a long uniform 1:1 cardinal staircase into coherent diagonal lookahead", () => {
    const grid = uniformGrid(40, 40);
    const path = xThenYPath(40, 4, 4, 16, 16);
    const smoothed = smoothAutopilotPath(grid, path);

    expect(smoothed).toEqual([path[0], path.at(-1)]);
    const direct = traceSmoothed(grid.width, grid.height, smoothed);
    expect(direct).toHaveLength(path.length);
    expect(direct[0]).toBe(path[0]);
    expect(direct.at(-1)).toBe(path.at(-1));
  });

  it("smooths shallow and steep safe routes without changing cardinal endpoints", () => {
    const grid = uniformGrid(40, 40);
    const shallow = xThenYPath(40, 3, 3, 18, 8);
    const steep = xThenYPath(40, 3, 3, 8, 18);
    const cardinal = xThenYPath(40, 3, 3, 18, 3);

    expect(smoothAutopilotPath(grid, shallow)).toEqual([shallow[0], shallow.at(-1)]);
    expect(smoothAutopilotPath(grid, steep)).toEqual([steep[0], steep.at(-1)]);
    expect(smoothAutopilotPath(grid, cardinal)).toEqual([cardinal[0], cardinal.at(-1)]);
    expect(traceAutopilotGridSegment(8, 8, 9, 20)).toEqual([9, 10, 18, 19, 20]);
  });

  it("never cuts a blocked corner even when the geometric endpoint is diagonal", () => {
    const grid = uniformGrid(3, 3);
    const safeAroundCorner = [0, 3, 4];
    const smoothed = smoothAutopilotPath(grid, safeAroundCorner, {
      edgePassable: (from, to) => !(from === 0 && to === 1),
    });

    expect(traceAutopilotGridSegment(3, 3, 0, 4)).toEqual([0, 1, 4]);
    expect(smoothed).toEqual(safeAroundCorner);
  });

  it("neither introduces nor skips named hazardous tiles and edges", () => {
    const grid = uniformGrid(12, 12);
    const path = xThenYPath(12, 1, 1, 7, 7);
    const originalHazard = 1 * 12 + 4;
    const directOnlyHazard = 3 * 12 + 3;
    const hazardousTiles = new Set([originalHazard, directOnlyHazard]);
    const hazardousEdges = new Set([`${originalHazard - 1}>${originalHazard}`]);
    const smoothed = smoothAutopilotPath(grid, path, {
      hazardousTile: (tileIndex) => hazardousTiles.has(tileIndex),
      hazardousEdge: (from, to) => hazardousEdges.has(`${from}>${to}`),
    });
    const trace = traceSmoothed(grid.width, grid.height, smoothed);

    expect(trace).toContain(originalHazard);
    expect(trace).not.toContain(directOnlyHazard);
  });

  it("rejects a geometrically short line when its exact terrain cost is higher", () => {
    const grid = uniformGrid(8, 8);
    const path = xThenYPath(8, 1, 1, 5, 5);
    const expensiveDirectTile = 3 * 8 + 3;
    const tiles = [...grid.tiles];
    tiles[expensiveDirectTile] = { baseTravelCost: 20_000, elevation: 400_000 };
    const smoothed = smoothAutopilotPath({ ...grid, tiles }, path);
    const trace = traceSmoothed(grid.width, grid.height, smoothed);

    expect(trace).not.toContain(expensiveDirectTile);
  });

  it("is deterministic, bounded in lookahead, and retains a region-window edge goal", () => {
    const grid = uniformGrid(98, 74);
    const path = xThenYPath(98, 1, 1, 96, 72);
    const first = smoothAutopilotPath(grid, path);
    const second = smoothAutopilotPath(grid, [...path].map((value) => value));

    expect(second).toEqual(first);
    expect(first[0]).toBe(path[0]);
    expect(first.at(-1)).toBe(72 * 98 + 96);
    expect(first.length).toBeGreaterThan(2);
    for (let index = 1; index < first.length; index += 1) {
      const priorRoutePosition = path.indexOf(first[index - 1] as number);
      const routePosition = path.indexOf(first[index] as number);
      expect(routePosition - priorRoutePosition)
        .toBeLessThanOrEqual(AUTOPILOT_MAX_LOOKAHEAD_TILES);
    }
  });

  it("fails closed to the original route for malformed or nonadjacent input", () => {
    const grid = uniformGrid(4, 4);
    expect(smoothAutopilotPath(grid, [0, 5, 10])).toEqual([0, 5, 10]);
    expect(smoothAutopilotPath(grid, [0, -1, 2])).toEqual([0, -1, 2]);
    expect(smoothAutopilotPath({ ...grid, tiles: [...grid.tiles, { baseTravelCost: 1, elevation: 1 }] }, [14, 15, 16]))
      .toEqual([14, 15, 16]);
    expect(traceAutopilotGridSegment(0, 4, 0, 2)).toEqual([]);
    expect(traceAutopilotGridSegment(4, 4, -1, 2)).toEqual([]);
    expect(traceAutopilotGridSegment(Number.MAX_SAFE_INTEGER, 2, 0, 1)).toEqual([]);
  });
});

describe("fixed-step autopilot steering", () => {
  function simulate(targetX: number, targetY: number) {
    let x = 0;
    let y = 0;
    const controls: Array<ReturnType<typeof steerAutopilotToPoint>> = [];
    for (let step = 0; step < 100; step += 1) {
      const control = steerAutopilotToPoint(targetX - x, targetY - y);
      controls.push(control);
      if (control.arrived) break;
      x += control.moveX * 193;
      y += control.moveY * 193;
    }
    return { x, y, controls };
  }

  it("keeps every moving beat diagonal on a 1:1 heading and never reverses", () => {
    const result = simulate(5_000, 5_000);
    const moving = result.controls.filter((control) => !control.arrived);
    expect(moving.every(({ moveX, moveY }) => moveX === 1 && moveY === 1)).toBe(true);
    expect(result.controls.at(-1)?.arrived).toBe(true);
  });

  it("lets shallow and steep headings settle one axis without sign wobble", () => {
    const shallow = simulate(5_000, 1_500).controls.filter(({ arrived }) => !arrived);
    const steep = simulate(1_500, 5_000).controls.filter(({ arrived }) => !arrived);
    expect(shallow.every(({ moveX, moveY }) => moveX === 1 && moveY >= 0)).toBe(true);
    expect(steep.every(({ moveX, moveY }) => moveY === 1 && moveX >= 0)).toBe(true);
    expect(shallow.some(({ moveY }) => moveY === 0)).toBe(true);
    expect(steep.some(({ moveX }) => moveX === 0)).toBe(true);
  });

  it("leaves cardinal steering cardinal and stops without overshoot reversal", () => {
    const result = simulate(1_000, 0);
    const moving = result.controls.filter(({ arrived }) => !arrived);
    expect(moving.every(({ moveX, moveY }) => moveX === 1 && moveY === 0)).toBe(true);
    expect(result.controls.some(({ moveX }) => moveX === -1)).toBe(false);
    expect(Math.abs(1_000 - result.x)).toBeLessThanOrEqual(AUTOPILOT_AXIS_DEADZONE);
    expect(result.controls.at(-1)?.arrived).toBe(true);
  });

  it("treats malformed deltas conservatively", () => {
    expect(steerAutopilotToPoint(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      moveX: 0,
      moveY: 0,
      arrived: true,
    });
  });
});
