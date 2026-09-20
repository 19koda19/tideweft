export const RELIEF_GROUND_RING_FULL_SEGMENTS = 48;
export const RELIEF_PASSIVE_RING_SEGMENT_TIERS = [12, 24, 48] as const;

/**
 * Passive ground halos are only visual separation cues. Keep their polygonal
 * edge below a sub-pixel screen-space error while reserving the authored
 * 48-segment ring for large or interaction-critical marks.
 */
export const RELIEF_PASSIVE_RING_MAX_EDGE_ERROR_PX = 0.35;

export type ReliefPassiveRingSegmentCount =
  (typeof RELIEF_PASSIVE_RING_SEGMENT_TIERS)[number];

export interface ReliefRingProjectionInput {
  readonly worldRadius: number;
  /** Positive camera-space depth returned by projectReliefPoint. */
  readonly depth: number;
  readonly viewportHeight: number;
  readonly verticalFov: number;
}

/**
 * Conservative projected radius for a world-space ground ring. The horizontal
 * diameter of a ground circle always contains a camera-right direction, so
 * this perspective scale is an appropriate upper bound for tessellation.
 */
export function projectedReliefRingRadiusPixels(
  input: ReliefRingProjectionInput,
): number {
  if (
    !Number.isFinite(input.worldRadius)
    || input.worldRadius < 0
    || !Number.isFinite(input.depth)
    || input.depth <= 0
    || !Number.isFinite(input.viewportHeight)
    || input.viewportHeight <= 0
    || !Number.isFinite(input.verticalFov)
    || input.verticalFov <= 0
    || input.verticalFov >= Math.PI
  ) return Number.POSITIVE_INFINITY;

  const focalLength = input.viewportHeight / (2 * Math.tan(input.verticalFov / 2));
  const projectedRadius = input.worldRadius * focalLength / input.depth;
  return Number.isFinite(projectedRadius)
    ? Math.max(0, projectedRadius)
    : Number.POSITIVE_INFINITY;
}

/**
 * Selects the smallest tier whose regular-polygon sagitta remains sub-pixel.
 * Invalid projection data fails conservatively to the full authored ring.
 */
export function passiveReliefRingSegments(
  projectedRadiusPixels: number,
): ReliefPassiveRingSegmentCount {
  if (!Number.isFinite(projectedRadiusPixels) || projectedRadiusPixels < 0) {
    return RELIEF_GROUND_RING_FULL_SEGMENTS;
  }
  for (const segments of RELIEF_PASSIVE_RING_SEGMENT_TIERS) {
    const edgeError = projectedRadiusPixels * (1 - Math.cos(Math.PI / segments));
    if (edgeError <= RELIEF_PASSIVE_RING_MAX_EDGE_ERROR_PX) return segments;
  }
  return RELIEF_GROUND_RING_FULL_SEGMENTS;
}
