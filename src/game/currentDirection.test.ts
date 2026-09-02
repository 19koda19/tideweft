import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import { surfaceCurrentDirection } from "./currentDirection";

describe("surface current direction", () => {
  it("keeps the tide authoritative while preserving ordered cross-current magnitude", () => {
    const tiny = surfaceCurrentDirection(1, 1);
    const moderate = surfaceCurrentDirection(1, 240_000);
    const maximum = surfaceCurrentDirection(1, FIXED_POINT);

    expect(tiny).toEqual({ x: -FIXED_POINT, y: 1 });
    expect(moderate).toEqual({ x: -FIXED_POINT, y: 240_000 });
    expect(maximum).toEqual({ x: -FIXED_POINT, y: FIXED_POINT });
    expect(Math.abs(tiny.y)).toBeLessThan(Math.abs(moderate.y));
    expect(Math.abs(moderate.y)).toBeLessThan(Math.abs(maximum.y));
    expect(surfaceCurrentDirection(-1, 240_000)).toEqual({
      x: FIXED_POINT,
      y: 240_000,
    });
  });

  it("mirrors the transverse component exactly when wind reverses", () => {
    const positive = surfaceCurrentDirection(1, 345_678);
    const negative = surfaceCurrentDirection(1, -345_678);

    expect(negative.x).toBe(positive.x);
    expect(negative.y).toBe(-positive.y);
    expect(surfaceCurrentDirection(-1, 0)).toEqual({ x: FIXED_POINT, y: 0 });
  });

  it("truncates fractional input and clamps hostile magnitudes to fixed point", () => {
    expect(surfaceCurrentDirection(1, 12.9)).toEqual({ x: -FIXED_POINT, y: 12 });
    expect(surfaceCurrentDirection(1, -0.5)).toEqual({ x: -FIXED_POINT, y: 0 });
    expect(surfaceCurrentDirection(-1, FIXED_POINT + 1)).toEqual({
      x: FIXED_POINT,
      y: FIXED_POINT,
    });
    expect(surfaceCurrentDirection(-1, -FIXED_POINT - 1)).toEqual({
      x: FIXED_POINT,
      y: -FIXED_POINT,
    });
  });

  it("fails closed to no cross-current for non-finite wind input", () => {
    expect(surfaceCurrentDirection(1, Number.NaN)).toEqual({ x: -FIXED_POINT, y: 0 });
    expect(surfaceCurrentDirection(-1, Number.POSITIVE_INFINITY)).toEqual({
      x: FIXED_POINT,
      y: 0,
    });
  });
});
