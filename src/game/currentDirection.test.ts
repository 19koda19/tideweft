import { describe, expect, it } from "vitest";

import { surfaceCurrentDirection } from "./currentDirection";

describe("surface current direction", () => {
  it("matches the sweep preference for flood, ebb, and cross-current signs", () => {
    expect(surfaceCurrentDirection(1, 800_000)).toEqual({ x: -1, y: 1 });
    expect(surfaceCurrentDirection(1, -1)).toEqual({ x: -1, y: -1 });
    expect(surfaceCurrentDirection(-1, 0)).toEqual({ x: 1, y: 0 });
    expect(surfaceCurrentDirection(-1, 12)).toEqual({ x: 1, y: 1 });
  });

  it("fails closed to no cross-current for non-finite wind input", () => {
    expect(surfaceCurrentDirection(1, Number.NaN)).toEqual({ x: -1, y: 0 });
    expect(surfaceCurrentDirection(-1, Number.POSITIVE_INFINITY)).toEqual({ x: 1, y: 0 });
  });
});
