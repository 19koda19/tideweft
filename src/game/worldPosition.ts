import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  isRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";

/**
 * Authoritative sub-tile precision. Runtime integration should make the
 * existing player `TILE_UNITS` export an alias of this constant.
 */
export const WORLD_POSITION_UNITS_PER_TILE = 1_000 as const;
/** Fixed-point extents of one internal storage region. */
export const REGION_WIDTH_UNITS = WORLD_WIDTH * WORLD_POSITION_UNITS_PER_TILE;
export const REGION_HEIGHT_UNITS = WORLD_HEIGHT * WORLD_POSITION_UNITS_PER_TILE;

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const REGION_COORD_LIMIT_BIGINT = BigInt(REGION_COORD_LIMIT);

/**
 * One authoritative point in the continuous world.
 *
 * Region segmentation is storage representation only. Local coordinates are
 * fixed-point units normalized into the half-open extent of that region.
 */
export interface WorldPosition {
  readonly region: RegionCoord;
  readonly localX: number;
  readonly localY: number;
}

/** Exact single-number form where JavaScript's safe-integer envelope permits it. */
export interface GlobalFixedPoint {
  readonly x: number;
  readonly y: number;
}

/** A bounded fixed-point presentation/simulation window over world space. */
export interface SpatialFrame {
  readonly origin: WorldPosition;
  readonly width: number;
  readonly height: number;
}

/** Fixed-point coordinates relative to a SpatialFrame origin. */
export interface SpatialFramePoint {
  readonly x: number;
  readonly y: number;
}

/** Translation applied to old frame coordinates after choosing a new origin. */
export interface SpatialFrameRebaseDelta {
  readonly x: number;
  readonly y: number;
}

/** Creates an already-normalized canonical world point. */
export function createWorldPosition(
  region: RegionCoord,
  localX: number,
  localY: number,
): WorldPosition {
  const canonicalRegion = createRegionCoord(region.x, region.y);
  const x = canonicalInteger(localX, "World local x");
  const y = canonicalInteger(localY, "World local y");
  if (x < 0 || x >= REGION_WIDTH_UNITS) {
    throw new RangeError(`World local x must be between 0 and ${REGION_WIDTH_UNITS - 1}`);
  }
  if (y < 0 || y >= REGION_HEIGHT_UNITS) {
    throw new RangeError(`World local y must be between 0 and ${REGION_HEIGHT_UNITS - 1}`);
  }
  return Object.freeze({ region: canonicalRegion, localX: x, localY: y });
}

/** Checks canonical shape, signed region representation, and normalized local units. */
export function isWorldPosition(value: unknown): value is WorldPosition {
  if (!plainRecord(value) || !exactKeys(value, ["localX", "localY", "region"])) return false;
  const region = value.region;
  return plainRecord(region)
    && exactKeys(region, ["x", "y"])
    && isRegionCoord(region)
    && canonicalIntegerInRange(value.localX, 0, REGION_WIDTH_UNITS - 1)
    && canonicalIntegerInRange(value.localY, 0, REGION_HEIGHT_UNITS - 1);
}

/**
 * Normalizes signed local fixed-point arithmetic with mathematical-floor
 * behavior. For example, local x -1 becomes the prior region's final unit.
 */
export function normalizeWorldPosition(
  region: RegionCoord,
  localX: number,
  localY: number,
): WorldPosition {
  const canonicalRegion = createRegionCoord(region.x, region.y);
  const x = normalizeAxis(
    BigInt(canonicalInteger(localX, "World local x")),
    canonicalRegion.x,
    REGION_WIDTH_UNITS,
    "World x",
  );
  const y = normalizeAxis(
    BigInt(canonicalInteger(localY, "World local y")),
    canonicalRegion.y,
    REGION_HEIGHT_UNITS,
    "World y",
  );
  return createWorldPosition(createRegionCoord(x.region, y.region), x.local, y.local);
}

/** Translates a world point without ever constructing a distant floating-point coordinate. */
export function translateWorldPosition(
  position: WorldPosition,
  deltaX: number,
  deltaY: number,
): WorldPosition {
  const current = canonicalWorldPosition(position);
  const x = normalizeAxis(
    BigInt(current.localX) + BigInt(canonicalInteger(deltaX, "World delta x")),
    current.region.x,
    REGION_WIDTH_UNITS,
    "World x",
  );
  const y = normalizeAxis(
    BigInt(current.localY) + BigInt(canonicalInteger(deltaY, "World delta y")),
    current.region.y,
    REGION_HEIGHT_UNITS,
    "World y",
  );
  return createWorldPosition(createRegionCoord(x.region, y.region), x.local, y.local);
}

/**
 * Converts to exact global fixed-point numbers when both axes fit inside the
 * JavaScript safe-integer envelope. Farther segmented positions remain valid,
 * but deliberately cannot be flattened into an imprecise Number.
 */
export function worldPositionToGlobalFixed(position: WorldPosition): GlobalFixedPoint {
  const current = canonicalWorldPosition(position);
  const x = BigInt(current.region.x) * BigInt(REGION_WIDTH_UNITS) + BigInt(current.localX);
  const y = BigInt(current.region.y) * BigInt(REGION_HEIGHT_UNITS) + BigInt(current.localY);
  return Object.freeze({
    x: safeBigIntNumber(x, "Global fixed x"),
    y: safeBigIntNumber(y, "Global fixed y"),
  });
}

/** Converts an exact safe-integer global fixed-point coordinate into segmented form. */
export function globalFixedToWorldPosition(x: number, y: number): WorldPosition {
  const globalX = canonicalInteger(x, "Global fixed x");
  const globalY = canonicalInteger(y, "Global fixed y");
  const normalizedX = normalizeAxis(BigInt(globalX), 0, REGION_WIDTH_UNITS, "Global fixed x");
  const normalizedY = normalizeAxis(BigInt(globalY), 0, REGION_HEIGHT_UNITS, "Global fixed y");
  return createWorldPosition(
    createRegionCoord(normalizedX.region, normalizedY.region),
    normalizedX.local,
    normalizedY.local,
  );
}

/** Exact `to - from` displacement, provided the result remains a safe integer. */
export function worldPositionDelta(
  from: WorldPosition,
  to: WorldPosition,
): SpatialFrameRebaseDelta {
  const start = canonicalWorldPosition(from);
  const end = canonicalWorldPosition(to);
  const delta = worldPositionDeltaBigInt(start, end);
  return Object.freeze({
    x: safeBigIntNumber(delta.x, "World position delta x"),
    y: safeBigIntNumber(delta.y, "World position delta y"),
  });
}

/**
 * Creates a half-open bounded frame and proves its farthest included point is
 * representable by the segmented coordinate envelope.
 */
export function createSpatialFrame(
  origin: WorldPosition,
  width: number,
  height: number,
): SpatialFrame {
  const canonicalOrigin = canonicalWorldPosition(origin);
  const canonicalWidth = positiveInteger(width, "Spatial frame width");
  const canonicalHeight = positiveInteger(height, "Spatial frame height");
  translateWorldPosition(canonicalOrigin, canonicalWidth - 1, canonicalHeight - 1);
  return Object.freeze({
    origin: canonicalOrigin,
    width: canonicalWidth,
    height: canonicalHeight,
  });
}

/** Projects a world point into a frame, returning null when it is outside. */
export function worldPositionToSpatialFrame(
  frame: SpatialFrame,
  position: WorldPosition,
): SpatialFramePoint | null {
  const currentFrame = canonicalSpatialFrame(frame);
  const current = canonicalWorldPosition(position);
  const delta = worldPositionDeltaBigInt(currentFrame.origin, current);
  if (
    delta.x < 0n
    || delta.y < 0n
    || delta.x >= BigInt(currentFrame.width)
    || delta.y >= BigInt(currentFrame.height)
  ) return null;
  return Object.freeze({ x: Number(delta.x), y: Number(delta.y) });
}

/** Lifts one in-bounds frame point back into authoritative segmented world space. */
export function spatialFrameToWorldPosition(
  frame: SpatialFrame,
  point: SpatialFramePoint,
): WorldPosition {
  const currentFrame = canonicalSpatialFrame(frame);
  const currentPoint = canonicalBoundedFramePoint(currentFrame, point);
  return translateWorldPosition(currentFrame.origin, currentPoint.x, currentPoint.y);
}

/**
 * Delta for keeping the same physical point fixed when coordinates change
 * from `previous` to `next`: `nextPoint = previousPoint + delta`.
 */
export function spatialFrameRebaseDelta(
  previous: SpatialFrame,
  next: SpatialFrame,
): SpatialFrameRebaseDelta {
  const priorFrame = canonicalSpatialFrame(previous);
  const nextFrame = canonicalSpatialFrame(next);
  return worldPositionDelta(nextFrame.origin, priorFrame.origin);
}

/** Applies a validated exact frame-origin delta; the result may lie outside a frame. */
export function applySpatialFrameRebaseDelta(
  point: SpatialFramePoint,
  delta: SpatialFrameRebaseDelta,
): SpatialFramePoint {
  const x = BigInt(canonicalInteger(point.x, "Spatial point x"))
    + BigInt(canonicalInteger(delta.x, "Spatial rebase delta x"));
  const y = BigInt(canonicalInteger(point.y, "Spatial point y"))
    + BigInt(canonicalInteger(delta.y, "Spatial rebase delta y"));
  return Object.freeze({
    x: safeBigIntNumber(x, "Rebased spatial point x"),
    y: safeBigIntNumber(y, "Rebased spatial point y"),
  });
}

/** Rebases an in-bounds point, returning null if the same world point left the new frame. */
export function rebaseSpatialFramePoint(
  previous: SpatialFrame,
  next: SpatialFrame,
  point: SpatialFramePoint,
): SpatialFramePoint | null {
  const priorFrame = canonicalSpatialFrame(previous);
  const nextFrame = canonicalSpatialFrame(next);
  const priorPoint = canonicalBoundedFramePoint(priorFrame, point);
  const rebased = applySpatialFrameRebaseDelta(
    priorPoint,
    spatialFrameRebaseDelta(priorFrame, nextFrame),
  );
  return pointInsideFrame(nextFrame, rebased) ? rebased : null;
}

function normalizeAxis(
  local: bigint,
  region: number,
  span: number,
  label: string,
): { readonly region: number; readonly local: number } {
  const divisor = BigInt(span);
  let quotient = local / divisor;
  let remainder = local % divisor;
  // BigInt division truncates toward zero; canonical world coordinates require
  // mathematical floor so every remainder is in [0, span).
  if (remainder < 0n) {
    quotient -= 1n;
    remainder += divisor;
  }
  const nextRegion = BigInt(region) + quotient;
  if (nextRegion < -REGION_COORD_LIMIT_BIGINT || nextRegion > REGION_COORD_LIMIT_BIGINT) {
    throw new RangeError(`${label} exceeded the supported segmented world envelope`);
  }
  return Object.freeze({ region: Number(nextRegion), local: Number(remainder) });
}

function worldPositionDeltaBigInt(
  from: WorldPosition,
  to: WorldPosition,
): { readonly x: bigint; readonly y: bigint } {
  return {
    x: (BigInt(to.region.x) - BigInt(from.region.x)) * BigInt(REGION_WIDTH_UNITS)
      + BigInt(to.localX) - BigInt(from.localX),
    y: (BigInt(to.region.y) - BigInt(from.region.y)) * BigInt(REGION_HEIGHT_UNITS)
      + BigInt(to.localY) - BigInt(from.localY),
  };
}

function canonicalWorldPosition(position: WorldPosition): WorldPosition {
  if (!isWorldPosition(position)) throw new RangeError("World position is not canonical");
  return createWorldPosition(position.region, position.localX, position.localY);
}

function canonicalSpatialFrame(frame: SpatialFrame): SpatialFrame {
  if (!plainRecord(frame) || !exactKeys(frame, ["height", "origin", "width"])) {
    throw new RangeError("Spatial frame is not canonical");
  }
  return createSpatialFrame(frame.origin, frame.width, frame.height);
}

function canonicalBoundedFramePoint(
  frame: SpatialFrame,
  point: SpatialFramePoint,
): SpatialFramePoint {
  if (!plainRecord(point) || !exactKeys(point, ["x", "y"])) {
    throw new RangeError("Spatial frame point is not canonical");
  }
  const x = canonicalInteger(point.x, "Spatial point x");
  const y = canonicalInteger(point.y, "Spatial point y");
  if (!pointInsideFrame(frame, { x, y })) {
    throw new RangeError("Spatial frame point is outside the bounded frame");
  }
  return Object.freeze({ x, y });
}

function pointInsideFrame(frame: SpatialFrame, point: SpatialFramePoint): boolean {
  return point.x >= 0
    && point.x < frame.width
    && point.y >= 0
    && point.y < frame.height;
}

function positiveInteger(value: number, label: string): number {
  const canonical = canonicalInteger(value, label);
  if (canonical <= 0) throw new RangeError(`${label} must be positive`);
  return canonical;
}

function canonicalInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function canonicalIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= minimum
    && value <= maximum;
}

function safeBigIntNumber(value: bigint, label: string): number {
  if (value < MIN_SAFE_BIGINT || value > MAX_SAFE_BIGINT) {
    throw new RangeError(`${label} exceeds the exact JavaScript safe-integer envelope`);
  }
  return Number(value);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
