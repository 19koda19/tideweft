import { FIXED_POINT } from "../sim/types";

/**
 * Public fixed-point surface-current vector shared by simulation and
 * presentation.
 *
 * Tide owns the full-strength east/west pull. The live wind supplies a bounded
 * proportional cross-current, so one unit of wind remains one transverse unit
 * instead of every nonzero breeze snapping the current to a diagonal. No
 * terrain elevation or water depth participates.
 */
export interface SurfaceCurrentDirection {
  readonly x: number;
  readonly y: number;
}

export function surfaceCurrentDirection(
  tideDirection: -1 | 1,
  windY: number,
): SurfaceCurrentDirection {
  const crossCurrent = Number.isFinite(windY)
    ? Math.trunc(Math.max(-FIXED_POINT, Math.min(FIXED_POINT, windY)))
    : 0;
  return {
    x: tideDirection > 0 ? -FIXED_POINT : FIXED_POINT,
    // Avoid exposing negative zero when a fractional negative input truncates.
    y: crossCurrent === 0 ? 0 : crossCurrent,
  };
}
