import type {
  SituatedExpressionEvent,
  SituatedExpressionIntent,
  SituatedExpressionMeaning,
} from "./situatedExpression";
import { coreEcologyAlarmSignalProfile } from "./coreEcology";
import { CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS } from "./coreEcologyPerception";
import { livingActorSenseProfile } from "./livingActorSenses";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";
import type { AcousticInterrupt } from "./worldAcoustics";

export interface SituatedExpressionAcoustics {
  readonly loudness: number;
  readonly rangeUnits: number;
}

export type SituatedExpressionSoundClass =
  | "human-vocalization"
  | "danger-sound"
  | "animal-alarm"
  | "animal-call"
  | "physical-thud";

const ANIMAL_ALARM_MEANINGS = new Set<SituatedExpressionMeaning>([
  "guardian-dog-warning",
  "guardian-dog-defensive-growl",
  "fish-crow-alarm-call",
  "deer-alarm-call",
]);

const ANIMAL_CALL_MEANINGS = new Set<SituatedExpressionMeaning>([
  "guardian-dog-shelter-whine",
]);

/** Shared F0 sound class; species voice is semantic, not inferred from tone. */
export function situatedExpressionSoundClass(
  value: Pick<SituatedExpressionEvent, "meaning"> | SituatedExpressionMeaning,
): SituatedExpressionSoundClass {
  const meaning = typeof value === "string" ? value : value.meaning;
  if (meaning === "human-danger-warning") return "danger-sound";
  // The rabbit's alarm is meaningful to ecology, but a human receives the
  // body/ground sound itself rather than magically decoding its intent.
  if (meaning === "marsh-rabbit-alarm-thump") return "physical-thud";
  if (ANIMAL_ALARM_MEANINGS.has(meaning)) return "animal-alarm";
  if (ANIMAL_CALL_MEANINGS.has(meaning)) return "animal-call";
  return "human-vocalization";
}

/**
 * One semantic urgency owner for simulation interruption and accessible-caption
 * priority. Alarmed tone alone is not sufficient: a rabbit's local foot-thump
 * communicates danger without becoming a wake-up or screen-reader interruption.
 */
export function situatedExpressionSoundInterrupt(
  value: Pick<SituatedExpressionEvent, "meaning" | "tone" | "volume">
    | Pick<SituatedExpressionIntent, "meaning" | "tone" | "volume">,
): AcousticInterrupt {
  if (value.meaning === "marsh-rabbit-alarm-thump") {
    return coreEcologyAlarmSignalProfile("marsh-rabbit").interrupt;
  }
  return value.tone === "alarmed" || value.volume === "shout" ? "strong" : "none";
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
  if (
    typeof value !== "string"
    && (
      value.meaning === "fish-crow-alarm-call"
      || value.meaning === "deer-alarm-call"
      || value.meaning === "marsh-rabbit-alarm-thump"
    )
  ) {
    // Core ecology already owns this physical signal. Supplemental samples
    // reach humans only, so bake the same human hearing sensitivity into the
    // range instead of letting generic Living Voice shout range create a
    // second, much larger acoustic world.
    return Object.freeze({
      loudness: coreEcologyAlarmSignalProfile(
        value.meaning === "fish-crow-alarm-call"
          ? "fish-crow"
          : value.meaning === "deer-alarm-call"
            ? "deer"
            : "marsh-rabbit",
      ).sourceLoudness,
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
