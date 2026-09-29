import type {
  SituatedExpressionEvent,
  SituatedExpressionIntent,
  SituatedExpressionMeaning,
} from "./situatedExpression";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

export interface SituatedExpressionAcoustics {
  readonly loudness: number;
  readonly rangeUnits: number;
}

export type SituatedExpressionSoundClass = "human-vocalization" | "animal-alarm";

const ANIMAL_SIGNAL_MEANINGS = new Set<SituatedExpressionMeaning>([
  "guardian-dog-warning",
  "guardian-dog-defensive-growl",
]);

/** Shared F0 sound class; species voice is semantic, not inferred from tone. */
export function situatedExpressionSoundClass(
  value: Pick<SituatedExpressionEvent, "meaning"> | SituatedExpressionMeaning,
): SituatedExpressionSoundClass {
  const meaning = typeof value === "string" ? value : value.meaning;
  return ANIMAL_SIGNAL_MEANINGS.has(meaning) ? "animal-alarm" : "human-vocalization";
}

/**
 * Simulation acoustics for situated expression. This small shared owner
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
