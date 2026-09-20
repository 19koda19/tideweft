import { describe, expect, it } from "vitest";

import {
  RELIEF_GROUND_RING_FULL_SEGMENTS,
  RELIEF_PASSIVE_RING_MAX_EDGE_ERROR_PX,
  passiveReliefRingSegments,
  projectedReliefRingRadiusPixels,
} from "./reliefRingLod";

describe("Relief passive ground-ring LOD", () => {
  it("uses deterministic 12/24/48 tiers bounded by sub-pixel edge error", () => {
    const maximumRadiusFor = (segments: number) =>
      RELIEF_PASSIVE_RING_MAX_EDGE_ERROR_PX / (1 - Math.cos(Math.PI / segments));
    const twelveLimit = maximumRadiusFor(12);
    const twentyFourLimit = maximumRadiusFor(24);

    expect(passiveReliefRingSegments(0)).toBe(12);
    expect(passiveReliefRingSegments(twelveLimit)).toBe(12);
    expect(passiveReliefRingSegments(twelveLimit + 0.001)).toBe(24);
    expect(passiveReliefRingSegments(twentyFourLimit)).toBe(24);
    expect(passiveReliefRingSegments(twentyFourLimit + 0.001)).toBe(48);
  });

  it("derives projected size from camera depth, viewport, and field of view", () => {
    const base = projectedReliefRingRadiusPixels({
      worldRadius: 8,
      depth: 600,
      viewportHeight: 900,
      verticalFov: Math.PI / 3,
    });
    expect(base).toBeCloseTo(10.392304845, 8);
    expect(projectedReliefRingRadiusPixels({
      worldRadius: 8,
      depth: 1_200,
      viewportHeight: 900,
      verticalFov: Math.PI / 3,
    })).toBeCloseTo(base / 2, 10);
    expect(projectedReliefRingRadiusPixels({
      worldRadius: 8,
      depth: 600,
      viewportHeight: 450,
      verticalFov: Math.PI / 3,
    })).toBeCloseTo(base / 2, 10);
  });

  it("fails malformed projection data conservatively to full detail", () => {
    const malformed = [
      { worldRadius: -1, depth: 600, viewportHeight: 900, verticalFov: 1 },
      { worldRadius: 8, depth: 0, viewportHeight: 900, verticalFov: 1 },
      { worldRadius: 8, depth: 600, viewportHeight: 0, verticalFov: 1 },
      { worldRadius: 8, depth: 600, viewportHeight: 900, verticalFov: 0 },
      { worldRadius: Number.NaN, depth: 600, viewportHeight: 900, verticalFov: 1 },
    ] as const;
    for (const input of malformed) {
      expect(projectedReliefRingRadiusPixels(input)).toBe(Number.POSITIVE_INFINITY);
    }
    expect(passiveReliefRingSegments(Number.POSITIVE_INFINITY))
      .toBe(RELIEF_GROUND_RING_FULL_SEGMENTS);
    expect(passiveReliefRingSegments(Number.NaN))
      .toBe(RELIEF_GROUND_RING_FULL_SEGMENTS);
    expect(passiveReliefRingSegments(-1))
      .toBe(RELIEF_GROUND_RING_FULL_SEGMENTS);
  });
});
