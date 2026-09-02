import type { WorldBounds, WorldPoint } from "./types";

const EPSILON = 1e-7;

/** Stable bounds used to reject an entire remembered path before clipping it. */
export function polylineBounds(points: readonly WorldPoint[]): WorldBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!finitePoint(point)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return Number.isFinite(minX)
    ? { minX, minY, maxX, maxY }
    : null;
}

export function worldBoundsOverlap(left: WorldBounds, right: WorldBounds): boolean {
  return validBounds(left)
    && validBounds(right)
    && left.maxX >= right.minX
    && left.minX <= right.maxX
    && left.maxY >= right.minY
    && left.minY <= right.maxY;
}

/**
 * Returns only the contiguous runs whose points are directly observed.
 * A lone direct point is intentionally not promoted into a line extending
 * through fog; it becomes drawable once an adjacent route point is seen.
 */
export function directPolylineRuns(
  points: readonly WorldPoint[],
  directlyObserved: readonly boolean[],
): readonly (readonly WorldPoint[])[] {
  if (points.length < 2 || points.length !== directlyObserved.length) return [];
  const runs: WorldPoint[][] = [];
  let current: WorldPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point && finitePoint(point) && directlyObserved[index] === true) {
      current.push(point);
      continue;
    }
    if (current.length >= 2) runs.push(current);
    current = [];
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

/**
 * Clips a polyline into drawable runs inside an axis-aligned world viewport.
 * Liang-Barsky segment clipping preserves crossings whose endpoints are both
 * off-screen and avoids submitting the rest of a long known route to p5.
 */
export function clipPolylineToBounds(
  points: readonly WorldPoint[],
  bounds: WorldBounds,
): readonly (readonly WorldPoint[])[] {
  if (points.length < 2 || !validBounds(bounds)) return [];
  const sourceBounds = polylineBounds(points);
  if (!sourceBounds || !worldBoundsOverlap(sourceBounds, bounds)) return [];

  const runs: WorldPoint[][] = [];
  let current: WorldPoint[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end || !finitePoint(start) || !finitePoint(end)) {
      pushRun(runs, current);
      current = [];
      continue;
    }
    const clipped = clipSegment(start, end, bounds);
    if (!clipped) {
      pushRun(runs, current);
      current = [];
      continue;
    }
    const [clippedStart, clippedEnd] = clipped;
    if (samePoint(clippedStart, clippedEnd)) continue;
    const previous = current[current.length - 1];
    if (!previous || !samePoint(previous, clippedStart)) {
      pushRun(runs, current);
      current = [clippedStart];
    }
    if (!samePoint(current[current.length - 1]!, clippedEnd)) current.push(clippedEnd);
  }
  pushRun(runs, current);
  return runs;
}

function clipSegment(
  start: WorldPoint,
  end: WorldPoint,
  bounds: WorldBounds,
): readonly [WorldPoint, WorldPoint] | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const p = [-dx, dx, -dy, dy] as const;
  const q = [
    start.x - bounds.minX,
    bounds.maxX - start.x,
    start.y - bounds.minY,
    bounds.maxY - start.y,
  ] as const;
  let enter = 0;
  let leave = 1;
  for (let index = 0; index < 4; index += 1) {
    const denominator = p[index]!;
    const numerator = q[index]!;
    if (Math.abs(denominator) <= EPSILON) {
      if (numerator < 0) return null;
      continue;
    }
    const amount = numerator / denominator;
    if (denominator < 0) enter = Math.max(enter, amount);
    else leave = Math.min(leave, amount);
    if (enter > leave) return null;
  }
  return [
    { x: start.x + dx * enter, y: start.y + dy * enter },
    { x: start.x + dx * leave, y: start.y + dy * leave },
  ];
}

function pushRun(runs: WorldPoint[][], run: WorldPoint[]): void {
  if (run.length >= 2) runs.push(run);
}

function samePoint(left: WorldPoint, right: WorldPoint): boolean {
  return Math.abs(left.x - right.x) <= EPSILON
    && Math.abs(left.y - right.y) <= EPSILON;
}

function finitePoint(point: WorldPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function validBounds(bounds: WorldBounds): boolean {
  return Number.isFinite(bounds.minX)
    && Number.isFinite(bounds.minY)
    && Number.isFinite(bounds.maxX)
    && Number.isFinite(bounds.maxY)
    && bounds.minX <= bounds.maxX
    && bounds.minY <= bounds.maxY;
}
