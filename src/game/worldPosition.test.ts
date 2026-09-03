import { describe, expect, it } from "vitest";

import { REGION_COORD_LIMIT } from "../sim/regions";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  applySpatialFrameRebaseDelta,
  createSpatialFrame,
  createWorldPosition,
  globalFixedToWorldPosition,
  isWorldPosition,
  normalizeWorldPosition,
  rebaseSpatialFramePoint,
  spatialFrameRebaseDelta,
  spatialFrameToWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  worldPositionToGlobalFixed,
  worldPositionToSpatialFrame,
} from "./worldPosition";

describe("canonical fixed-point world position", () => {
  it("uses the existing one-thousand-unit sub-tile precision", () => {
    expect(WORLD_POSITION_UNITS_PER_TILE).toBe(1_000);
  });

  it("creates one canonical representation and rejects forged aliases", () => {
    const position = createWorldPosition({ x: -0, y: 0 }, -0, 17);
    expect(position).toEqual({ region: { x: 0, y: 0 }, localX: 0, localY: 17 });
    expect(Object.is(position.region.x, -0)).toBe(false);
    expect(Object.is(position.localX, -0)).toBe(false);
    expect(Object.isFrozen(position)).toBe(true);
    expect(Object.isFrozen(position.region)).toBe(true);
    expect(isWorldPosition(position)).toBe(true);
    expect(isWorldPosition({ ...position, localX: -0 })).toBe(false);
    expect(isWorldPosition({ ...position, debug: true })).toBe(false);
    expect(isWorldPosition({ ...position, region: { x: 0, y: 0, alias: 1 } })).toBe(false);
  });

  it("normalizes every cardinal edge and all four corner signs with floor semantics", () => {
    expect(normalizeWorldPosition({ x: 0, y: 0 }, REGION_WIDTH_UNITS, 41)).toEqual({
      region: { x: 1, y: 0 },
      localX: 0,
      localY: 41,
    });
    expect(normalizeWorldPosition({ x: 0, y: 0 }, -1, 41)).toEqual({
      region: { x: -1, y: 0 },
      localX: REGION_WIDTH_UNITS - 1,
      localY: 41,
    });
    expect(normalizeWorldPosition({ x: 0, y: 0 }, 41, REGION_HEIGHT_UNITS)).toEqual({
      region: { x: 0, y: 1 },
      localX: 41,
      localY: 0,
    });
    expect(normalizeWorldPosition({ x: 0, y: 0 }, 41, -1)).toEqual({
      region: { x: 0, y: -1 },
      localX: 41,
      localY: REGION_HEIGHT_UNITS - 1,
    });

    for (const [deltaX, deltaY, regionX, regionY, localX, localY] of [
      [-1, -1, -1, -1, REGION_WIDTH_UNITS - 1, REGION_HEIGHT_UNITS - 1],
      [REGION_WIDTH_UNITS, -1, 1, -1, 0, REGION_HEIGHT_UNITS - 1],
      [-1, REGION_HEIGHT_UNITS, -1, 1, REGION_WIDTH_UNITS - 1, 0],
      [REGION_WIDTH_UNITS, REGION_HEIGHT_UNITS, 1, 1, 0, 0],
    ] as const) {
      expect(normalizeWorldPosition({ x: 0, y: 0 }, deltaX, deltaY)).toEqual({
        region: { x: regionX, y: regionY },
        localX,
        localY,
      });
    }
  });

  it("roundtrips exact positive and negative global fixed-point coordinates", () => {
    for (const global of [
      { x: 0, y: 0 },
      { x: REGION_WIDTH_UNITS - 1, y: REGION_HEIGHT_UNITS - 1 },
      { x: REGION_WIDTH_UNITS, y: REGION_HEIGHT_UNITS },
      { x: -1, y: -1 },
      { x: -REGION_WIDTH_UNITS, y: -REGION_HEIGHT_UNITS },
      { x: -REGION_WIDTH_UNITS - 1, y: REGION_HEIGHT_UNITS + 1 },
    ] as const) {
      expect(worldPositionToGlobalFixed(globalFixedToWorldPosition(global.x, global.y)))
        .toEqual(global);
    }
    expect(globalFixedToWorldPosition(-1, -1)).toEqual({
      region: { x: -1, y: -1 },
      localX: REGION_WIDTH_UNITS - 1,
      localY: REGION_HEIGHT_UNITS - 1,
    });
  });

  it("remains exact at million-region and safe-number extremes", () => {
    const million = createWorldPosition(
      { x: 1_000_000, y: -1_000_000 },
      54_321,
      12_345,
    );
    expect(globalFixedToWorldPosition(
      worldPositionToGlobalFixed(million).x,
      worldPositionToGlobalFixed(million).y,
    )).toEqual(million);

    for (const global of [
      { x: Number.MAX_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER },
      { x: Number.MIN_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
    ] as const) {
      const segmented = globalFixedToWorldPosition(global.x, global.y);
      expect(isWorldPosition(segmented)).toBe(true);
      expect(worldPositionToGlobalFixed(segmented)).toEqual(global);
    }

    const fromMinimumSafe = normalizeWorldPosition(
      { x: 0, y: 0 },
      Number.MIN_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    );
    expect(worldPositionToGlobalFixed(fromMinimumSafe)).toEqual({
      x: Number.MIN_SAFE_INTEGER,
      y: Number.MIN_SAFE_INTEGER,
    });
  });

  it("keeps nearby frame math exact at the segmented coordinate limit", () => {
    const origin = createWorldPosition(
      { x: REGION_COORD_LIMIT - 1, y: -REGION_COORD_LIMIT },
      REGION_WIDTH_UNITS - 50,
      0,
    );
    const frame = createSpatialFrame(origin, 100, 100);
    const farCorner = spatialFrameToWorldPosition(frame, { x: 99, y: 99 });
    expect(farCorner).toEqual({
      region: { x: REGION_COORD_LIMIT, y: -REGION_COORD_LIMIT },
      localX: 49,
      localY: 99,
    });
    expect(worldPositionToSpatialFrame(frame, farCorner)).toEqual({ x: 99, y: 99 });
    expect(() => worldPositionToGlobalFixed(origin)).toThrow(/safe-integer envelope/u);

    const terminal = createWorldPosition(
      { x: REGION_COORD_LIMIT, y: REGION_COORD_LIMIT },
      REGION_WIDTH_UNITS - 1,
      REGION_HEIGHT_UNITS - 1,
    );
    expect(() => translateWorldPosition(terminal, 1, 0)).toThrow(/segmented world envelope/u);
    expect(() => createSpatialFrame(terminal, 2, 1)).toThrow(/segmented world envelope/u);
  });

  it("projects a bounded frame across negative region and corner boundaries", () => {
    const origin = createWorldPosition(
      { x: -2, y: 3 },
      REGION_WIDTH_UNITS - 500,
      REGION_HEIGHT_UNITS - 250,
    );
    const frame = createSpatialFrame(origin, 2_000, 2_000);
    const point = { x: 1_600, y: 1_700 } as const;
    const world = spatialFrameToWorldPosition(frame, point);
    expect(world).toEqual({
      region: { x: -1, y: 4 },
      localX: 1_100,
      localY: 1_450,
    });
    expect(worldPositionToSpatialFrame(frame, world)).toEqual(point);
    expect(worldPositionToSpatialFrame(frame, translateWorldPosition(origin, -1, 0))).toBeNull();
    expect(worldPositionToSpatialFrame(frame, translateWorldPosition(origin, 2_000, 0))).toBeNull();
  });

  it("derives and applies an exact reversible floating-origin rebase", () => {
    const priorOrigin = createWorldPosition(
      { x: 1_000_000, y: -1_000_000 },
      REGION_WIDTH_UNITS - 200,
      900,
    );
    const nextOrigin = translateWorldPosition(priorOrigin, 1_300, -700);
    const previous = createSpatialFrame(priorOrigin, 4_000, 4_000);
    const next = createSpatialFrame(nextOrigin, 4_000, 4_000);
    const oldPoint = { x: 2_500, y: 1_000 } as const;
    const delta = spatialFrameRebaseDelta(previous, next);
    expect(delta).toEqual({ x: -1_300, y: 700 });
    const newPoint = applySpatialFrameRebaseDelta(oldPoint, delta);
    expect(newPoint).toEqual({ x: 1_200, y: 1_700 });
    expect(rebaseSpatialFramePoint(previous, next, oldPoint)).toEqual(newPoint);
    expect(spatialFrameToWorldPosition(previous, oldPoint))
      .toEqual(spatialFrameToWorldPosition(next, newPoint));

    const inverse = spatialFrameRebaseDelta(next, previous);
    expect(inverse).toEqual({ x: 1_300, y: -700 });
    expect(applySpatialFrameRebaseDelta(newPoint, inverse)).toEqual(oldPoint);
  });

  it("fails closed on unsafe, fractional, out-of-bounds, and oversized deltas", () => {
    expect(() => createWorldPosition({ x: 0, y: 0 }, -1, 0)).toThrow(RangeError);
    expect(() => createWorldPosition({ x: 0, y: 0 }, REGION_WIDTH_UNITS, 0))
      .toThrow(RangeError);
    expect(() => normalizeWorldPosition({ x: 0, y: 0 }, 0.5, 0)).toThrow(RangeError);
    expect(() => globalFixedToWorldPosition(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(RangeError);
    expect(() => createSpatialFrame(createWorldPosition({ x: 0, y: 0 }, 0, 0), 0, 1))
      .toThrow(RangeError);

    const frame = createSpatialFrame(createWorldPosition({ x: 0, y: 0 }, 0, 0), 10, 10);
    expect(() => spatialFrameToWorldPosition(frame, { x: 10, y: 0 })).toThrow(RangeError);
    expect(() => spatialFrameToWorldPosition(frame, { x: 0.5, y: 0 })).toThrow(RangeError);

    const west = createWorldPosition(
      { x: -REGION_COORD_LIMIT, y: 0 },
      0,
      0,
    );
    const east = createWorldPosition(
      { x: REGION_COORD_LIMIT, y: 0 },
      REGION_WIDTH_UNITS - 1,
      0,
    );
    expect(() => worldPositionDelta(west, east)).toThrow(/safe-integer envelope/u);
    expect(worldPositionToSpatialFrame(frame, east)).toBeNull();
  });
});
