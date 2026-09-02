import { describe, expect, it } from "vitest";

import {
  clipPolylineToBounds,
  directPolylineRuns,
  polylineBounds,
  worldBoundsOverlap,
} from "./routePresentation";

describe("route presentation geometry", () => {
  it("extracts only contiguous direct-observation runs", () => {
    const points = [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 2 }));
    expect(directPolylineRuns(points, [false, true, true, false, true, true, true]))
      .toEqual([
        [{ x: 1, y: 2 }, { x: 2, y: 2 }],
        [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }],
      ]);
    expect(directPolylineRuns(points, [true, false, false, false, false, false, false]))
      .toEqual([]);
  });

  it("clips crossings even when both source endpoints are outside", () => {
    expect(clipPolylineToBounds(
      [{ x: -10, y: 5 }, { x: 20, y: 5 }],
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    )).toEqual([[{ x: 0, y: 5 }, { x: 10, y: 5 }]]);
  });

  it("splits paths that leave and later re-enter the viewport", () => {
    expect(clipPolylineToBounds(
      [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
        { x: 14, y: 2 },
        { x: 14, y: 8 },
        { x: 8, y: 8 },
        { x: 2, y: 8 },
      ],
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    )).toEqual([
      [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 10, y: 2 }],
      [{ x: 10, y: 8 }, { x: 8, y: 8 }, { x: 2, y: 8 }],
    ]);
  });

  it("bounds and rejects wholly distant geometry", () => {
    const bounds = polylineBounds([{ x: -4, y: 3 }, { x: 8, y: 12 }]);
    expect(bounds).toEqual({ minX: -4, minY: 3, maxX: 8, maxY: 12 });
    expect(worldBoundsOverlap(bounds!, { minX: 20, minY: 20, maxX: 30, maxY: 30 })).toBe(false);
    expect(clipPolylineToBounds(
      [{ x: -4, y: 3 }, { x: 8, y: 12 }],
      { minX: 20, minY: 20, maxX: 30, maxY: 30 },
    )).toEqual([]);
  });
});
