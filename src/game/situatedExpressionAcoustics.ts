import type {
  SituatedExpressionEvent,
  SituatedExpressionIntent,
  SituatedExpressionMeaning,
  SituatedExpressionMemory,
} from "./situatedExpression";
import {
  projectSituatedExpression,
  situatedExpressionEventIdForTrigger,
} from "./situatedExpression";
import { coreEcologyAlarmSignalProfile } from "./coreEcology";
import { CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS } from "./coreEcologyPerception";
import { coreWildlifeAlarmSpeciesForMeaning } from "./coreWildlifeSignalExpression";
import { livingActorSenseProfile } from "./livingActorSenses";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";
import type { AcousticInterrupt } from "./worldAcoustics";

export interface SituatedExpressionAcoustics {
  readonly loudness: number;
  readonly rangeUnits: number;
}

export interface SituatedExpressionAudioPresentation {
  readonly sound:
    | Readonly<{
      readonly kind: "vocalization";
      readonly vocalization: SituatedExpressionPlaybackVocalization;
    }>
    | Readonly<{
      readonly kind: "legacy-cue";
      readonly cue: "rabbit-thump" | "cat-call" | "fox-yip";
    }>;
  readonly volume: number;
  readonly variantSeed: number;
  readonly pan: number;
}

export type SituatedExpressionPlaybackVocalization = Exclude<
  SituatedExpressionEvent["vocalization"],
  | "domestic-cat-rain-distress"
  | "marsh-rabbit-alarm-thump"
  | "marsh-fox-pursuit-yip"
>;

/**
 * Projects authenticated expression semantics into one committed audio cue.
 * Admission may retain text and hearing state, but it does not own whether a
 * lawfully heard physical sound exists; rejected optional admission therefore
 * uses this same projection rather than a parallel generic fallback.
 */
export function situatedExpressionAudioPresentation(
  expression: Pick<
    SituatedExpressionEvent,
    "meaning" | "vocalization" | "volume" | "variantSeed"
  >,
  reception: Readonly<{ readonly certainty: number; readonly pan: number }>,
): SituatedExpressionAudioPresentation | null {
  if (
    !Number.isInteger(reception.certainty)
    || reception.certainty < 0
    || reception.certainty > 1_000_000
    || !Number.isFinite(reception.pan)
    || reception.pan < -1
    || reception.pan > 1
    || !Number.isSafeInteger(expression.variantSeed)
  ) return null;
  const baseIntensity = expression.volume === "shout"
    ? 0.92
    : expression.volume === "spoken"
      ? 0.68
      : 0.42;
  const sound = situatedExpressionPlaybackSound(expression);
  if (sound === null) return null;
  return Object.freeze({
    sound,
    volume: baseIntensity * (0.35 + reception.certainty / 1_000_000 * 0.65),
    variantSeed: expression.variantSeed,
    pan: reception.pan,
  });
}

function situatedExpressionPlaybackSound(
  expression: Pick<SituatedExpressionEvent, "meaning" | "vocalization">,
): SituatedExpressionAudioPresentation["sound"] | null {
  if (expression.meaning === "marsh-rabbit-alarm-thump") {
    return Object.freeze({ kind: "legacy-cue", cue: "rabbit-thump" });
  }
  if (expression.meaning === "domestic-cat-rain-distress-call") {
    return Object.freeze({ kind: "legacy-cue", cue: "cat-call" });
  }
  if (expression.meaning === "marsh-fox-pursuit-yip") {
    return Object.freeze({ kind: "legacy-cue", cue: "fox-yip" });
  }
  return isLiveSituatedVocalization(expression.vocalization)
    ? Object.freeze({
        kind: "vocalization",
        vocalization: expression.vocalization,
      })
    : null;
}

function isLiveSituatedVocalization(
  value: SituatedExpressionEvent["vocalization"],
): value is SituatedExpressionPlaybackVocalization {
  switch (value) {
    case "steady":
    case "strained":
    case "alarm":
    case "relief":
    case "dog-warning-bark":
    case "dog-defensive-growl":
    case "dog-shelter-whine":
    case "fish-crow-alarm":
    case "deer-alarm-snort":
    case "gull-alarm-cry":
    case "elk-alarm-bark":
    case "boar-grunt":
    case "chicken-alarm-squawk":
    case "duck-alarm-quack":
    case "goat-alarm-bleat":
      return true;
    case "domestic-cat-rain-distress":
    case "marsh-rabbit-alarm-thump":
    case "marsh-fox-pursuit-yip":
      return false;
  }
}

export type SituatedExpressionSoundClass =
  | "human-vocalization"
  | "danger-sound"
  | "animal-alarm"
  | "animal-call"
  | "physical-thud";

export const SITUATED_EXPRESSION_SEMANTIC_FACT_VERSION = 1 as const;
/**
 * Ordinary audible speech is not automatically understood. This threshold is
 * applied after shared distance/weather masking and before a semantic report
 * may enter listener cognition.
 */
export const SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE = 450_000 as const;

export type SituatedExpressionSemanticFactClass = "store-secured-report";

/**
 * One bounded, source-authenticated meaning candidate carried beside an
 * acoustic sample. It is deliberately transient: actor cognition persists the
 * lawful receipt, while save/load re-derives an unconsumed candidate from the
 * authenticated expression channel.
 */
export interface SituatedExpressionSemanticFact {
  readonly version: typeof SITUATED_EXPRESSION_SEMANTIC_FACT_VERSION;
  readonly expressionEventId: string;
  readonly sourceActorId: string;
  readonly perceivedClass: SituatedExpressionSemanticFactClass;
  readonly minimumHearingConfidence: number;
}

/** Maps only currently supported factual speech onto listener-safe meaning. */
export function situatedExpressionSemanticFactForEvent(
  event: SituatedExpressionEvent,
): SituatedExpressionSemanticFact | null {
  if (projectSituatedExpression(event) === null) return null;
  const expectedEventId = situatedExpressionEventIdForTrigger(
    event.sourceActorId,
    event.triggerEventId,
  );
  if (expectedEventId === null || event.eventId !== expectedEventId) return null;
  return semanticFactFor(
    event.sourceActorId,
    event.eventId,
    event.meaning,
  );
}

/** Re-derives an unconsumed factual-speech candidate from canonical memory. */
export function situatedExpressionSemanticFactForMemory(
  memory: SituatedExpressionMemory,
): SituatedExpressionSemanticFact | null {
  const eventId = situatedExpressionEventIdForTrigger(
    memory.sourceActorId,
    memory.triggerEventId,
  );
  if (eventId === null) return null;
  return semanticFactFor(memory.sourceActorId, eventId, memory.meaning);
}

/** Strictly validates transient fact shape; domain authority remains caller-owned. */
export function canonicalizeSituatedExpressionSemanticFact(
  value: unknown,
): SituatedExpressionSemanticFact | null {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
    || Object.getOwnPropertySymbols(value).length !== 0
  ) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [
    "expressionEventId",
    "minimumHearingConfidence",
    "perceivedClass",
    "sourceActorId",
    "version",
  ];
  if (
    keys.length !== expected.length
    || !keys.every((key, index) => key === expected[index])
    || record.version !== SITUATED_EXPRESSION_SEMANTIC_FACT_VERSION
    || record.perceivedClass !== "store-secured-report"
    || record.minimumHearingConfidence
      !== SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE
    || typeof record.expressionEventId !== "string"
    || typeof record.sourceActorId !== "string"
  ) return null;
  const expressionEventId = record.expressionEventId;
  const sourceActorId = record.sourceActorId;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,179}$/.test(expressionEventId)
    || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/.test(sourceActorId)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_SEMANTIC_FACT_VERSION,
    expressionEventId,
    sourceActorId,
    perceivedClass: "store-secured-report",
    minimumHearingConfidence: SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
  });
}

function semanticFactFor(
  sourceActorId: string,
  expressionEventId: string,
  meaning: SituatedExpressionMeaning,
): SituatedExpressionSemanticFact | null {
  if (meaning !== "keeper-secure-store-response") return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_SEMANTIC_FACT_VERSION,
    expressionEventId,
    sourceActorId,
    perceivedClass: "store-secured-report",
    minimumHearingConfidence: SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
  });
}

const ANIMAL_ALARM_MEANINGS = new Set<SituatedExpressionMeaning>([
  "guardian-dog-warning",
  "guardian-dog-defensive-growl",
  "fish-crow-alarm-call",
  "deer-alarm-call",
  "gull-alarm-call",
  "elk-alarm-call",
  "wild-boar-alarm-call",
]);

const ANIMAL_CALL_MEANINGS = new Set<SituatedExpressionMeaning>([
  "domestic-chicken-alarm-call",
  "american-black-duck-alarm-call",
  "domestic-goat-alarm-call",
  "guardian-dog-shelter-whine",
  "domestic-cat-rain-distress-call",
  "marsh-fox-pursuit-yip",
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
 * priority. Alarmed tone alone is not sufficient: small-prey calls and local
 * foot-thumps do not become wake-up or screen-reader interruptions.
 */
export function situatedExpressionSoundInterrupt(
  value: Pick<SituatedExpressionEvent, "meaning" | "tone" | "volume">
    | Pick<SituatedExpressionIntent, "meaning" | "tone" | "volume">,
): AcousticInterrupt {
  const alarmSpecies = coreWildlifeAlarmSpeciesForMeaning(value.meaning);
  if (alarmSpecies !== null) {
    return coreEcologyAlarmSignalProfile(alarmSpecies).interrupt;
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
    && coreWildlifeAlarmSpeciesForMeaning(value.meaning) !== null
  ) {
    // Core ecology already owns this physical signal. Supplemental samples
    // reach humans only, so bake the same human hearing sensitivity into the
    // range instead of letting generic Living Voice shout range create a
    // second, much larger acoustic world.
    return Object.freeze({
      loudness: coreEcologyAlarmSignalProfile(
        coreWildlifeAlarmSpeciesForMeaning(value.meaning)!,
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

/**
 * Presentation-only word clarity after an exact lawful hearing receipt. A
 * faint voice remains audible; this does not change its audio or cognition.
 */
export function situatedExpressionWordsAreIntelligible(
  volume: SituatedExpressionEvent["volume"],
  certainty: number,
): boolean {
  if (
    (volume !== "murmur" && volume !== "spoken" && volume !== "shout")
    || !Number.isSafeInteger(certainty)
    || certainty < 1
    || certainty > 1_000_000
  ) return false;

  return certainty >= Math.ceil(situatedExpressionAcoustics(volume).loudness * 55 / 100);
}
