import type { SituatedExpressionEvent, SituatedExpressionIntent } from "./situatedExpression";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

export interface SituatedExpressionAcoustics {
  readonly loudness: number;
  readonly rangeUnits: number;
}

/**
 * Simulation acoustics for situated human expression. This small shared owner
 * lets persistence validation use the same fixed values as live admission.
 */
export function situatedExpressionAcoustics(
  volume: SituatedExpressionEvent["volume"] | SituatedExpressionIntent["volume"],
): SituatedExpressionAcoustics {
  const loudness = volume === "shout"
    ? 950_000
    : volume === "spoken"
      ? 620_000
      : 360_000;
  const rangeTiles = volume === "shout" ? 36 : volume === "spoken" ? 18 : 8;
  return Object.freeze({
    loudness,
    rangeUnits: rangeTiles * WORLD_POSITION_UNITS_PER_TILE,
  });
}
