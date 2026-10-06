import type {
  SituatedExpressionEvent,
  SituatedExpressionMeaning,
  SituatedExpressionVocalization,
} from "./situatedExpression";

export const PLAYER_ANIMAL_CALL_KNOWLEDGE_VERSION = 1 as const;

/** Existing semantic pairs only: a body thump is not a learned vocal call. */
const ANIMAL_CALLS = [
  { meaning: "guardian-dog-warning", vocalization: "dog-warning-bark", animalLabel: "Dog" },
  { meaning: "guardian-dog-defensive-growl", vocalization: "dog-defensive-growl", animalLabel: "Dog" },
  { meaning: "guardian-dog-shelter-whine", vocalization: "dog-shelter-whine", animalLabel: "Dog" },
  { meaning: "domestic-cat-rain-distress-call", vocalization: "domestic-cat-rain-distress", animalLabel: "Cat" },
  { meaning: "fish-crow-alarm-call", vocalization: "fish-crow-alarm", animalLabel: "Fish crow" },
  { meaning: "deer-alarm-call", vocalization: "deer-alarm-snort", animalLabel: "Deer" },
  { meaning: "gull-alarm-call", vocalization: "gull-alarm-cry", animalLabel: "Gull" },
  { meaning: "elk-alarm-call", vocalization: "elk-alarm-bark", animalLabel: "Elk" },
  { meaning: "wild-boar-alarm-call", vocalization: "boar-grunt", animalLabel: "Wild boar" },
  { meaning: "domestic-chicken-alarm-call", vocalization: "chicken-alarm-squawk", animalLabel: "Chicken" },
  { meaning: "american-black-duck-alarm-call", vocalization: "duck-alarm-quack", animalLabel: "Duck" },
  { meaning: "domestic-goat-alarm-call", vocalization: "goat-alarm-bleat", animalLabel: "Goat" },
  { meaning: "marsh-fox-pursuit-yip", vocalization: "marsh-fox-pursuit-yip", animalLabel: "Fox" },
] as const satisfies readonly {
  readonly meaning: SituatedExpressionMeaning;
  readonly vocalization: SituatedExpressionVocalization;
  readonly animalLabel: string;
}[];

export type SupportedAnimalCallVocalization = (typeof ANIMAL_CALLS)[number]["vocalization"];
export type AnimalCallLabel = (typeof ANIMAL_CALLS)[number]["animalLabel"];

export interface AnimalCallRecognition {
  readonly vocalization: SupportedAnimalCallVocalization;
  readonly animalLabel: AnimalCallLabel;
}

export interface PlayerAnimalCallKnowledge {
  readonly version: typeof PLAYER_ANIMAL_CALL_KNOWLEDGE_VERSION;
  readonly calls: readonly {
    readonly vocalization: SupportedAnimalCallVocalization;
    readonly learnedAtTick: number;
  }[];
}

type AnimalCallEvent = Pick<SituatedExpressionEvent, "meaning" | "vocalization">;

const CALL_RECOGNITIONS: ReadonlyMap<SupportedAnimalCallVocalization, AnimalCallRecognition> = new Map(
  ANIMAL_CALLS.map(({ vocalization, animalLabel }) => [
    vocalization,
    Object.freeze({ vocalization, animalLabel }),
  ]),
);

export function createPlayerAnimalCallKnowledge(): PlayerAnimalCallKnowledge {
  return Object.freeze({
    version: PLAYER_ANIMAL_CALL_KNOWLEDGE_VERSION,
    calls: Object.freeze([]),
  });
}

/**
 * Validates a present record and returns a sorted, detached frozen value.
 * Missing optional save fields must be handled explicitly by their caller;
 * strict save readers also compare the raw record with this canonical form.
 */
export function canonicalizePlayerAnimalCallKnowledge(
  value: unknown,
  completedTick?: number,
): PlayerAnimalCallKnowledge | null {
  if (
    (completedTick !== undefined && !isTick(completedTick))
    || !exactDataRecord(value, ["version", "calls"])
    || value.version !== PLAYER_ANIMAL_CALL_KNOWLEDGE_VERSION
    || !Array.isArray(value.calls)
    || value.calls.length > ANIMAL_CALLS.length
    || !denseDataArray(value.calls)
  ) return null;

  const seen = new Set<SupportedAnimalCallVocalization>();
  const calls: PlayerAnimalCallKnowledge["calls"][number][] = [];
  for (const entry of value.calls) {
    if (
      !exactDataRecord(entry, ["vocalization", "learnedAtTick"])
      || !isSupportedVocalization(entry.vocalization)
      || seen.has(entry.vocalization)
      || !isTick(entry.learnedAtTick)
      || (completedTick !== undefined && entry.learnedAtTick > completedTick)
    ) return null;
    seen.add(entry.vocalization);
    calls.push(Object.freeze({
      vocalization: entry.vocalization,
      learnedAtTick: entry.learnedAtTick,
    }));
  }
  calls.sort((left, right) => left.vocalization < right.vocalization ? -1
    : left.vocalization > right.vocalization ? 1 : 0);
  return Object.freeze({
    version: PLAYER_ANIMAL_CALL_KNOWLEDGE_VERSION,
    calls: Object.freeze(calls),
  });
}

/**
 * The transaction owner must first prove this fresh call was both seen and
 * heard. This reducer neither hears events nor authenticates their cause.
 */
export function rememberPlayerAnimalCall(
  knowledge: PlayerAnimalCallKnowledge | undefined,
  event: AnimalCallEvent,
  completedTick: number,
): PlayerAnimalCallKnowledge | null {
  const current = knowledge === undefined ? createPlayerAnimalCallKnowledge()
    : canonicalizePlayerAnimalCallKnowledge(knowledge, completedTick);
  const recognition = recognitionForEvent(event);
  if (current === null || recognition === null || !isTick(completedTick)) return null;
  if (current.calls.some(({ vocalization }) => vocalization === recognition.vocalization)) {
    return current;
  }
  return canonicalizePlayerAnimalCallKnowledge({
    version: PLAYER_ANIMAL_CALL_KNOWLEDGE_VERSION,
    calls: [...current.calls, { vocalization: recognition.vocalization, learnedAtTick: completedTick }],
  }, completedTick);
}

/** Recognition supplies species only, never an individual, position or motive. */
export function getPlayerAnimalCallRecognition(
  knowledge: PlayerAnimalCallKnowledge | undefined,
  event: AnimalCallEvent,
): AnimalCallRecognition | null {
  if (knowledge === undefined) return null;
  const current = canonicalizePlayerAnimalCallKnowledge(knowledge);
  const recognition = recognitionForEvent(event);
  return current !== null && recognition !== null
    && current.calls.some(({ vocalization }) => vocalization === recognition.vocalization)
    ? recognition : null;
}

/** Closed presentation vocabulary; this lookup alone is not player knowledge. */
export function animalCallRecognitionForVocalization(
  vocalization: SituatedExpressionVocalization,
): AnimalCallRecognition | null {
  return isSupportedVocalization(vocalization) ? CALL_RECOGNITIONS.get(vocalization) ?? null : null;
}

function recognitionForEvent(event: AnimalCallEvent): AnimalCallRecognition | null {
  if (event === null || typeof event !== "object") return null;
  const pair = ANIMAL_CALLS.find(({ meaning, vocalization }) => (
    meaning === event.meaning && vocalization === event.vocalization
  ));
  return pair === undefined ? null : animalCallRecognitionForVocalization(pair.vocalization);
}

function isSupportedVocalization(value: unknown): value is SupportedAnimalCallVocalization {
  return typeof value === "string" && CALL_RECOGNITIONS.has(value as SupportedAnimalCallVocalization);
}

function isTick(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exactDataRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) => {
    if (typeof key !== "string" || !keys.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function denseDataArray(value: readonly unknown[]): boolean {
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return false;
  }
  return true;
}
