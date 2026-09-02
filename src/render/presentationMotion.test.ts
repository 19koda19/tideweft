import { describe, expect, it } from "vitest";

import {
  advancePointerParallax,
  createPointerParallaxState,
  easeWorldLabelPoint,
  normalizedPresentationPointer,
  presentationParallaxTarget,
  resetPointerParallax,
  setPointerParallaxTarget,
} from "./presentationMotion";

describe("presentation-only pointer and label motion", () => {
  it("normalizes and clamps pointer input to a few CSS pixels", () => {
    expect(normalizedPresentationPointer({ x: 100, y: 50 }, { width: 200, height: 100 }))
      .toEqual({ x: 0, y: 0 });
    expect(normalizedPresentationPointer({ x: 900, y: -50 }, { width: 200, height: 100 }))
      .toEqual({ x: 1, y: -1 });
    expect(presentationParallaxTarget({ x: 1, y: -1 }, 99))
      .toEqual({ x: -8, y: 8 });
  });

  it("uses frame-rate-independent exponential easing", () => {
    const simulate = (step: number) => {
      const state = createPointerParallaxState();
      setPointerParallaxTarget(state, { x: 4, y: -3 });
      advancePointerParallax(state, 0, false);
      for (let now = step; now <= 1_000; now += step) {
        advancePointerParallax(state, Math.min(now, 1_000), false);
      }
      if (1_000 % step !== 0) advancePointerParallax(state, 1_000, false);
      return state.current;
    };
    const sixtyFps = simulate(10);
    const thirtyFps = simulate(25);
    expect(thirtyFps.x).toBeCloseTo(sixtyFps.x, 10);
    expect(thirtyFps.y).toBeCloseTo(sixtyFps.y, 10);
    expect(sixtyFps.x).toBeGreaterThan(3.99);
  });

  it("resets and removes motion under reduced-motion", () => {
    const state = createPointerParallaxState();
    setPointerParallaxTarget(state, { x: 4, y: 3 });
    advancePointerParallax(state, 0, false);
    advancePointerParallax(state, 100, false);
    expect(state.current.x).toBeGreaterThan(0);
    advancePointerParallax(state, 116, true);
    expect(state).toMatchObject({ current: { x: 0, y: 0 }, target: { x: 0, y: 0 } });
    setPointerParallaxTarget(state, { x: 3, y: 2 });
    resetPointerParallax(state, true);
    expect(state.lastAt).toBeUndefined();
  });

  it("eases label projection with bounded lag and snaps on first/reduced frames", () => {
    const first = easeWorldLabelPoint(undefined, { x: 10, y: 20 }, 0, false);
    const moved = easeWorldLabelPoint(first, { x: 100, y: 80 }, 16, false);
    expect(moved.x).toBeGreaterThan(88);
    expect(moved.x).toBeLessThan(100);
    expect(moved.y).toBeGreaterThan(68);
    expect(easeWorldLabelPoint(moved, { x: 130, y: 90 }, 32, true))
      .toMatchObject({ x: 130, y: 90 });
  });
});
