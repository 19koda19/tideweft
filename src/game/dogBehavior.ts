import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorPerceptionState,
  queryActorAttention,
  type ActorBelief,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import {
  assertDogStateCoherence,
  type DogTemperament,
  type GeneratedDogState,
} from "../sim/dogIdentity";

export const DOG_BEHAVIOR_VERSION = 1 as const;
export const DOG_INTENT_SWITCH_MARGIN = 80_000 as const;
export const DOG_URGENT_OVERRIDE_SCORE = 850_000 as const;

/** Tie order is authoritative and safety-first when fixed-point scores are equal. */
export const DOG_BEHAVIOR_INTENTS = Object.freeze([
  "retreat",
  "seek-shelter",
  "avoid-human",
  "eat",
  "approach-food",
  "rest",
  "observe",
] as const);

export type DogBehaviorIntent = (typeof DOG_BEHAVIOR_INTENTS)[number];

export interface DogWeatherExposure {
  /** Current environmental pressure, not a forecast. Fixed-point 0..1. */
  readonly coldPressure: number;
  readonly heatPressure: number;
  readonly rainIntensity: number;
  readonly windPressure: number;
}

export type DogActionAccessibility = Readonly<Record<DogBehaviorIntent, boolean>>;

export interface DogFoodContact {
  /** Direct sight/touch confirmation; a scent belief alone is never contact. */
  readonly directlyConfirmed: boolean;
  /** The physical action layer confirms the food can actually be reached/eaten. */
  readonly accessible: boolean;
}

export interface DogCurrentIntent {
  readonly intent: DogBehaviorIntent;
  readonly enteredAtTick: number;
}

export type DogBehaviorCauseKind =
  | "need"
  | "perception"
  | "condition"
  | "contact"
  | "prior-intent";

/** Discriminated so persistence must handle every causal class explicitly. */
export type DogBehaviorCause = {
  readonly [Kind in DogBehaviorCauseKind]: {
    readonly kind: Kind;
    /** Lawful belief/need/condition reference; never a hidden source identifier. */
    readonly referenceId: string;
  };
}[DogBehaviorCauseKind];

export interface DogBehaviorInput {
  readonly tick: number;
  readonly dog: GeneratedDogState;
  readonly perception: ActorPerceptionState;
  readonly weather: DogWeatherExposure;
  readonly accessibility: DogActionAccessibility;
  readonly foodContact: DogFoodContact;
  readonly current: DogCurrentIntent;
}

export interface DogIntentScore {
  readonly intent: DogBehaviorIntent;
  /** Saturated integer fixed-point score. */
  readonly score: number;
  readonly accessible: boolean;
}

export interface DogBehaviorDecision {
  readonly version: typeof DOG_BEHAVIOR_VERSION;
  readonly tick: number;
  readonly intent: DogBehaviorIntent;
  readonly enteredAtTick: number;
  readonly nextThinkTick: number;
  readonly cause: DogBehaviorCause;
  /** An accepted cognition key only; never a live source ID or true coordinate. */
  readonly focusBeliefKey: string | null;
  readonly scores: readonly DogIntentScore[];
}

interface ScoredCandidate {
  readonly intent: DogBehaviorIntent;
  readonly score: number;
  readonly focusBeliefKey: string | null;
}

interface PerceivedSignals {
  readonly food: Readonly<{ belief: ActorBelief; strength: number }> | null;
  readonly human: Readonly<{ belief: ActorBelief; strength: number }> | null;
  readonly threat: Readonly<{ belief: ActorBelief; strength: number }> | null;
  readonly strongest: Readonly<{ belief: ActorBelief; strength: number }> | null;
  readonly novelty: number;
}

const FOOD_CLASSES = new Set([
  "food",
  "food-scent",
  "visible-food",
  "exposed-food",
  "provision-food",
]);
const HUMAN_CLASSES = new Set([
  "human",
  "unknown-human",
  "human-silhouette",
  "human-voice",
  "porter",
  "hostile-human",
]);
const THREAT_CLASSES = new Set([
  "threat",
  "danger-sound",
  "hostile-human",
  "aggressive-dog",
  "large-predator",
  "bear",
]);

const MINIMUM_HOLD_TICKS: Readonly<Record<DogBehaviorIntent, number>> = {
  retreat: 4,
  "seek-shelter": 5,
  "avoid-human": 4,
  eat: 2,
  "approach-food": 5,
  rest: 5,
  observe: 2,
};

const THINK_DELAY_RANGE: Readonly<Record<DogBehaviorIntent, readonly [number, number]>> = {
  retreat: [1, 2],
  "seek-shelter": [2, 3],
  "avoid-human": [2, 4],
  eat: [1, 2],
  "approach-food": [2, 4],
  rest: [4, 7],
  observe: [3, 6],
};

const FAMILIARITY_AVOIDANCE: Readonly<
  Record<GeneratedDogState["humanFamiliarity"]["level"], number>
> = {
  feral: 260_000,
  wary: 175_000,
  habituated: 50_000,
  socialized: 0,
};

/**
 * Pure deterministic policy over lawful cognition. It never reads belief
 * positions, subject IDs, world objects, or source truth. Null means the
 * boundary was malformed and no partial decision should be applied.
 */
export function decideDogBehavior(input: DogBehaviorInput): DogBehaviorDecision | null {
  const canonical = canonicalInput(input);
  if (canonical === null) return null;

  const attention = queryActorAttention(canonical.perception);
  const signals = perceivedSignals(attention);
  const rawScores = scoreIntents(canonical, signals);
  const scored = DOG_BEHAVIOR_INTENTS.map((intent): DogIntentScore => Object.freeze({
    intent,
    score: rawScores[intent].score,
    accessible: canonical.accessibility[intent] && intentIsPhysicallyValid(intent, canonical),
  }));
  const candidates = scored
    .filter(({ accessible }) => accessible)
    .map(({ intent, score }): ScoredCandidate => ({
      intent,
      score,
      focusBeliefKey: focusFor(intent, signals),
    }));
  if (candidates.length === 0) return null;

  const best = bestCandidate(candidates);
  const current = candidates.find(({ intent }) => intent === canonical.current.intent) ?? null;
  const heldTicks = canonical.tick - canonical.current.enteredAtTick;
  const directEat = best.intent === "eat" && canonical.current.intent === "approach-food";
  const urgentSafetyOverride = (
    best.intent === "retreat" || best.intent === "seek-shelter"
  ) && best.score >= DOG_URGENT_OVERRIDE_SCORE;

  let selected = best;
  if (current !== null && best.intent !== current.intent && !directEat && !urgentSafetyOverride) {
    if (heldTicks < MINIMUM_HOLD_TICKS[current.intent]) {
      selected = current;
    } else if (best.score < current.score + DOG_INTENT_SWITCH_MARGIN) {
      selected = current;
    }
  }

  return Object.freeze({
    version: DOG_BEHAVIOR_VERSION,
    tick: canonical.tick,
    intent: selected.intent,
    enteredAtTick: selected.intent === canonical.current.intent
      ? canonical.current.enteredAtTick
      : canonical.tick,
    nextThinkTick: nextThinkTick(canonical, selected.intent),
    cause: causeFor(selected, signals),
    focusBeliefKey: selected.focusBeliefKey,
    scores: Object.freeze(scored),
  });
}

function canonicalInput(input: DogBehaviorInput): DogBehaviorInput | null {
  const raw: unknown = input;
  if (!plainRecord(raw) || !exactKeys(raw, [
    "accessibility",
    "current",
    "dog",
    "foodContact",
    "perception",
    "tick",
    "weather",
  ])) return null;
  if (!nonnegativeSafeInteger(raw.tick) || raw.tick > Number.MAX_SAFE_INTEGER - 8) return null;
  try {
    assertDogStateCoherence(raw.dog as GeneratedDogState);
  } catch {
    return null;
  }
  const perception = canonicalizeActorPerceptionState(raw.perception);
  if (
    perception === null
    || perception.actorId !== (raw.dog as GeneratedDogState).identity.stableId
    || perception.tick !== raw.tick
  ) return null;
  const weather = canonicalWeather(raw.weather);
  const accessibility = canonicalAccessibility(raw.accessibility);
  const foodContact = canonicalFoodContact(raw.foodContact);
  const current = canonicalCurrent(raw.current, raw.tick);
  if (weather === null || accessibility === null || foodContact === null || current === null) return null;
  // Observe is the fail-safe neutral action; callers must always provide it.
  if (!accessibility.observe) return null;
  return {
    tick: raw.tick,
    dog: raw.dog as GeneratedDogState,
    perception,
    weather,
    accessibility,
    foodContact,
    current,
  };
}

function canonicalWeather(value: unknown): DogWeatherExposure | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "coldPressure",
    "heatPressure",
    "rainIntensity",
    "windPressure",
  ])) return null;
  if (
    !scaledUnit(value.coldPressure)
    || !scaledUnit(value.heatPressure)
    || !scaledUnit(value.rainIntensity)
    || !scaledUnit(value.windPressure)
  ) return null;
  return Object.freeze({
    coldPressure: value.coldPressure,
    heatPressure: value.heatPressure,
    rainIntensity: value.rainIntensity,
    windPressure: value.windPressure,
  });
}

function canonicalAccessibility(value: unknown): DogActionAccessibility | null {
  if (!plainRecord(value) || !exactKeys(value, DOG_BEHAVIOR_INTENTS)) return null;
  for (const intent of DOG_BEHAVIOR_INTENTS) {
    if (typeof value[intent] !== "boolean") return null;
  }
  return Object.freeze(Object.fromEntries(
    DOG_BEHAVIOR_INTENTS.map((intent) => [intent, value[intent]]),
  )) as DogActionAccessibility;
}

function canonicalFoodContact(value: unknown): DogFoodContact | null {
  if (!plainRecord(value) || !exactKeys(value, ["accessible", "directlyConfirmed"])) return null;
  if (typeof value.accessible !== "boolean" || typeof value.directlyConfirmed !== "boolean") return null;
  return Object.freeze({
    directlyConfirmed: value.directlyConfirmed,
    accessible: value.accessible,
  });
}

function canonicalCurrent(value: unknown, tick: number): DogCurrentIntent | null {
  if (!plainRecord(value) || !exactKeys(value, ["enteredAtTick", "intent"])) return null;
  if (
    !isIntent(value.intent)
    || !nonnegativeSafeInteger(value.enteredAtTick)
    || value.enteredAtTick > tick
  ) return null;
  return Object.freeze({ intent: value.intent, enteredAtTick: value.enteredAtTick });
}

function perceivedSignals(attention: readonly ActorBelief[]): PerceivedSignals {
  let food: PerceivedSignals["food"] = null;
  let human: PerceivedSignals["human"] = null;
  let threat: PerceivedSignals["threat"] = null;
  let strongest: PerceivedSignals["strongest"] = null;
  let novelty = 0;
  for (const belief of attention) {
    const strength = beliefStrength(belief);
    novelty = Math.max(novelty, strength);
    strongest = strongerSignal(strongest, belief, strength);
    if (FOOD_CLASSES.has(belief.perceivedClass)) food = strongerSignal(food, belief, strength);
    if (HUMAN_CLASSES.has(belief.perceivedClass)) human = strongerSignal(human, belief, strength);
    if (THREAT_CLASSES.has(belief.perceivedClass)) threat = strongerSignal(threat, belief, strength);
  }
  return Object.freeze({ food, human, threat, strongest, novelty });
}

function strongerSignal(
  current: Readonly<{ belief: ActorBelief; strength: number }> | null,
  belief: ActorBelief,
  strength: number,
): Readonly<{ belief: ActorBelief; strength: number }> {
  if (
    current === null
    || strength > current.strength
    || (strength === current.strength && belief.key < current.belief.key)
  ) return Object.freeze({ belief, strength });
  return current;
}

function beliefStrength(belief: ActorBelief): number {
  return clampScore(Math.trunc((belief.confidence * 3 + belief.salience * 2) / 5));
}

function scoreIntents(
  input: DogBehaviorInput,
  signals: PerceivedSignals,
): Readonly<Record<DogBehaviorIntent, ScoredCandidate>> {
  const dog = input.dog;
  const traits = new Set<DogTemperament>(dog.identity.temperament);
  const healthDeficit = ACTOR_PERCEPTION_SCALE - dog.condition.health;
  const injuryPressure = clampScore(healthDeficit + dog.condition.injuries.length * 90_000);
  const fatigue = Math.max(dog.needs.rest, dog.condition.exhaustion);
  const activeColdPressure = Math.max(input.weather.coldPressure, dog.condition.coldStress);
  const activeHeatPressure = Math.max(input.weather.heatPressure, dog.condition.heatStress);
  const coldMismatch = weighted(
    activeColdPressure,
    ACTOR_PERCEPTION_SCALE - dog.identity.weatherAdaptation.coldTolerance,
  );
  const heatMismatch = weighted(
    activeHeatPressure,
    ACTOR_PERCEPTION_SCALE - dog.identity.weatherAdaptation.heatTolerance,
  );
  const rainMismatch = weighted(
    input.weather.rainIntensity,
    ACTOR_PERCEPTION_SCALE - dog.identity.weatherAdaptation.rainTolerance,
  );
  const wetCold = weighted(
    Math.max(dog.condition.wetness, input.weather.rainIntensity),
    activeColdPressure,
  );
  const weatherDanger = clampScore(
    weighted(activeColdPressure, 400_000)
    + weighted(activeHeatPressure, 170_000)
    + weighted(wetCold, 300_000)
    + weighted(input.weather.windPressure, 100_000)
    + weighted(coldMismatch, 190_000)
    + weighted(heatMismatch, 130_000)
    + weighted(rainMismatch, 90_000),
  );
  const threatStrength = signals.threat?.strength ?? 0;
  const humanStrength = signals.human?.strength ?? 0;
  const foodStrength = signals.food?.strength ?? 0;
  const foodTrait = traitBonus(traits, [
    ["food-motivated", 130_000],
    ["persistent", 45_000],
  ]);
  const cautionTrait = traitBonus(traits, [
    ["nervous", 100_000],
    ["cautious", 70_000],
    ["observant", 25_000],
  ]);
  const curiosityTrait = traitBonus(traits, [
    ["curious", 100_000],
    ["observant", 80_000],
    ["playful", 35_000],
  ]);
  const directFood = input.foodContact.directlyConfirmed && input.foodContact.accessible;

  const scores: Record<DogBehaviorIntent, ScoredCandidate> = {
    retreat: candidate(
      "retreat",
      threatStrength <= 0 ? 0 : clampScore(
        220_000
        + weighted(threatStrength, 650_000)
        + weighted(dog.needs.safety, 190_000)
        + weighted(injuryPressure, 160_000)
        + cautionTrait,
      ),
      signals.threat?.belief.key ?? null,
    ),
    "seek-shelter": candidate(
      "seek-shelter",
      weatherDanger < 150_000 ? 0 : clampScore(
        120_000
        + weighted(weatherDanger, 760_000)
        + weighted(fatigue, 130_000)
        + weighted(injuryPressure, 110_000),
      ),
      null,
    ),
    "avoid-human": candidate(
      "avoid-human",
      humanStrength <= 0 ? 0 : clampScore(
        100_000
        + weighted(humanStrength, 450_000)
        + weighted(dog.needs.safety, 190_000)
        + FAMILIARITY_AVOIDANCE[dog.humanFamiliarity.level]
        + cautionTrait
        - (traits.has("social") ? 100_000 : 0),
      ),
      signals.human?.belief.key ?? null,
    ),
    eat: candidate(
      "eat",
      !directFood ? 0 : clampScore(
        310_000
        + weighted(dog.needs.hunger, 650_000)
        + foodTrait
        - weighted(threatStrength, 320_000)
        - weighted(weatherDanger, 190_000),
      ),
      null,
    ),
    "approach-food": candidate(
      "approach-food",
      foodStrength <= 0 ? 0 : clampScore(
        120_000
        + weighted(dog.needs.hunger, 540_000)
        + weighted(foodStrength, 300_000)
        + foodTrait
        - weighted(weatherDanger, 470_000)
        - weighted(threatStrength, 360_000)
        - weighted(dog.needs.safety, 100_000),
      ),
      signals.food?.belief.key ?? null,
    ),
    rest: candidate(
      "rest",
      clampScore(
        weighted(fatigue, 710_000)
        + weighted(injuryPressure, 170_000)
        + (traits.has("calm") ? 45_000 : 0)
        - weighted(weatherDanger, 330_000)
        - weighted(threatStrength, 430_000),
      ),
      null,
    ),
    observe: candidate(
      "observe",
      clampScore(
        180_000
        + weighted(signals.novelty, 230_000)
        + curiosityTrait
        - weighted(threatStrength, 100_000)
        - weighted(weatherDanger, 90_000),
      ),
      null,
    ),
  };
  return Object.freeze(scores);
}

function candidate(
  intent: DogBehaviorIntent,
  score: number,
  focusBeliefKey: string | null,
): ScoredCandidate {
  return Object.freeze({ intent, score: clampScore(score), focusBeliefKey });
}

function focusFor(intent: DogBehaviorIntent, signals: PerceivedSignals): string | null {
  switch (intent) {
    case "approach-food": return signals.food?.belief.key ?? null;
    case "avoid-human": return signals.human?.belief.key ?? null;
    case "retreat": return signals.threat?.belief.key ?? null;
    case "eat":
    case "observe":
    case "seek-shelter":
    case "rest":
      return null;
  }
}

function causeFor(selected: ScoredCandidate, signals: PerceivedSignals): DogBehaviorCause {
  switch (selected.intent) {
    case "approach-food":
    case "avoid-human":
    case "retreat":
      return selected.focusBeliefKey === null
        ? Object.freeze({ kind: "prior-intent", referenceId: `intent:${selected.intent}` })
        : Object.freeze({ kind: "perception", referenceId: selected.focusBeliefKey });
    case "eat":
      return Object.freeze({ kind: "contact", referenceId: "contact:food" });
    case "seek-shelter":
      return Object.freeze({ kind: "condition", referenceId: "condition:weather-exposure" });
    case "rest":
      return Object.freeze({ kind: "need", referenceId: "need:rest" });
    case "observe":
      return signals.strongest === null
        ? Object.freeze({ kind: "condition", referenceId: "condition:neutral-watch" })
        : Object.freeze({ kind: "perception", referenceId: signals.strongest.belief.key });
  }
}

function nextThinkTick(input: DogBehaviorInput, intent: DogBehaviorIntent): number {
  const range = THINK_DELAY_RANGE[intent];
  const span = range[1] - range[0] + 1;
  const offset = range[0] + stableHash(
    `${input.dog.identity.stableId}|${intent}|${input.tick}`,
  ) % span;
  return input.tick + offset;
}

function intentIsPhysicallyValid(intent: DogBehaviorIntent, input: DogBehaviorInput): boolean {
  return intent !== "eat" || (
    input.foodContact.directlyConfirmed && input.foodContact.accessible
  );
}

function bestCandidate(candidates: readonly ScoredCandidate[]): ScoredCandidate {
  let best = candidates[0];
  if (best === undefined) throw new Error("Dog behavior requires an accessible candidate");
  for (let index = 1; index < candidates.length; index += 1) {
    const next = candidates[index];
    if (next === undefined) continue;
    if (next.score > best.score) best = next;
    // Equal scores keep the authoritative DOG_BEHAVIOR_INTENTS order.
  }
  return best;
}

function traitBonus(
  traits: ReadonlySet<DogTemperament>,
  bonuses: readonly (readonly [DogTemperament, number])[],
): number {
  let total = 0;
  for (const [trait, bonus] of bonuses) {
    if (traits.has(trait)) total += bonus;
  }
  return total;
}

function weighted(value: number, weight: number): number {
  return Math.trunc((value * weight) / ACTOR_PERCEPTION_SCALE);
}

function clampScore(value: number): number {
  if (value <= 0) return 0;
  if (value >= ACTOR_PERCEPTION_SCALE) return ACTOR_PERCEPTION_SCALE;
  return Math.trunc(value);
}

function stableHash(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash;
}

function isIntent(value: unknown): value is DogBehaviorIntent {
  return typeof value === "string" && (DOG_BEHAVIOR_INTENTS as readonly string[]).includes(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= ACTOR_PERCEPTION_SCALE;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length && keys.every((key, index) => key === canonical[index]);
}
