import type {
  SituatedExpressionEvent,
  SituatedExpressionIntent,
  SituatedExpressionMeaning,
} from "./situatedExpression";
import { coreEcologyAlarmSignalProfile } from "./coreEcology";
import { CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS } from "./coreEcologyPerception";
import { livingActorSenseProfile } from "./livingActorSenses";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

export interface SituatedExpressionAcoustics {
  readonly loudness: number;
  readonly rangeUnits: number;
}

export type SituatedExpressionSoundClass =
  | "human-vocalization"
  | "animal-alarm"
  | "animal-call";

const ANIMAL_ALARM_MEANINGS = new Set<SituatedExpressionMeaning>([
  "guardian-dog-warning",
  "guardian-dog-defensive-growl",
  "fish-crow-alarm-call",
]);

const ANIMAL_CALL_MEANINGS = new Set<SituatedExpressionMeaning>([
  "guardian-dog-shelter-whine",
]);

/** Shared F0 sound class; species voice is semantic, not inferred from tone. */
export function situatedExpressionSoundClass(
  value: Pick<SituatedExpressionEvent, "meaning"> | SituatedExpressionMeaning,
): SituatedExpressionSoundClass {
  const meaning = typeof value === "string" ? value : value.meaning;
  if (ANIMAL_ALARM_MEANINGS.has(meaning)) return "animal-alarm";
  if (ANIMAL_CALL_MEANINGS.has(meaning)) return "animal-call";
  return "human-vocalization";
}

/**
 * Simulation acoustics for situated expression. This small shared owner
 * lets persistence validation use the same fixed values as live admission.
 */
export function situatedExpressionAcoustics(
  value:
    | SituatedExpressionEvent["volume"]
    | SituatedExpressionIntent["volume"]
    | Pick<SituatedExpressionEvent, "meaning" | "volume">
    | Pick<SituatedExpressionIntent, "meaning" | "volume">,
): SituatedExpressionAcoustics {
  const volume = typeof value === "string" ? value : value.volume;
  if (typeof value !== "string" && value.meaning === "fish-crow-alarm-call") {
    // Core ecology already owns this physical signal. Supplemental samples
    // reach humans only, so bake the same human hearing sensitivity into the
    // range instead of letting generic Living Voice shout range create a
    // second, much larger acoustic world.
    return Object.freeze({
      loudness: coreEcologyAlarmSignalProfile("fish-crow").sourceLoudness,
      rangeUnits: Math.floor(
        CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS
          * livingActorSenseProfile("human").hearingSensitivity
          / 1_000_000,
      ),
    });
  }
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
