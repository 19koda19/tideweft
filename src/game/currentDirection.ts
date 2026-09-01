/**
 * Public surface-current bias shared by simulation and presentation.
 *
 * This is deliberately a direction, not a strength estimate: tide determines
 * the estuary's east/west pull and the sign of the live wind supplies its
 * cross-current. No terrain elevation or water depth participates.
 */
export interface SurfaceCurrentDirection {
  readonly x: -1 | 1;
  readonly y: -1 | 0 | 1;
}

export function surfaceCurrentDirection(
  tideDirection: -1 | 1,
  windY: number,
): SurfaceCurrentDirection {
  const crossCurrent: -1 | 0 | 1 = !Number.isFinite(windY) || windY === 0
    ? 0
    : windY > 0
      ? 1
      : -1;
  return {
    x: tideDirection > 0 ? -1 : 1,
    y: crossCurrent,
  };
}
