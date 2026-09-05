import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorPerceptionState,
  queryActorAttention,
  type ActorBelief,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import type {
  ResidentNeeds,
  ResidentTemperament,
  ResidentTraits,
} from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  validateActorCargoState,
  type ActorCargoState,
} from "./actorCargo";

/** Pure human response policy for the first food-and-animal encounter slice. */
export const PORTER_RESPONSE_VERSION = 1 as const;
export const PORTER_RESPONSE_SWITCH_MARGIN = 80_000 as const;
export const PORTER_RESPONSE_URGENT_SCORE = 875_000 as const;
export const PORTER_RESPONSE_OFFER_COOLDOWN_TICKS = 12 as const;

/** Tie order is deliberate: secure the physical attractant before escalating. */
export const PORTER_RESPONSE_INTENTS = Object.freeze([
  "secure-food",
  "reroute",
  "leave",
  "offer-food",
  "wait-observe",
] as const);

export type PorterResponseIntent = (typeof PORTER_RESPONSE_INTENTS)[number];
export type PorterResponseAccessibility = Readonly<Record<PorterResponseIntent, boolean>>;

export interface PorterResponseWeather {
  readonly rainIntensity: number;
  readonly coldPressure: number;
  readonly windPressure: number;
}

export interface PorterResponseDisposition {
  readonly traits: Readonly<ResidentTraits>;
  readonly temperament: readonly ResidentTemperament[];
}

export interface PorterResponseState {
  readonly version: typeof PORTER_RESPONSE_VERSION;
  readonly actorId: string;
  readonly tick: number;
  readonly intent: PorterResponseIntent;
  readonly enteredAtTick: number;
  readonly nextThinkTick: number;
  readonly lastDecisionId: string | null;
  /** Bounded anti-repeat evidence; long-term interaction memory remains elsewhere. */
  readonly lastOfferedSubjectId: string | null;
  readonly lastOfferedAtTick: number | null;
}

export interface PorterResponseInput {
  readonly version: typeof PORTER_RESPONSE_VERSION;
  readonly tick: number;
  readonly perception: ActorPerceptionState;
  readonly cargo: ActorCargoState;
  readonly packContainerId: string;
  readonly weather: PorterResponseWeather;
  readonly needs: Readonly<ResidentNeeds>;
  readonly disposition: PorterResponseDisposition;
  readonly accessibility: PorterResponseAccessibility;
  readonly current: PorterResponseState;
}

/**
 * A retained communication the porter actually heard. It can influence their
 * decision, but it never authorizes an action by itself.
 */
export interface PorterResponseRequestSignal {
  readonly version: typeof PORTER_RESPONSE_VERSION;
  readonly requestId: string;
  readonly kind: "offer-provision" | "secure-provisions";
  readonly subjectId: string | null;
}

export type PorterResponseCause =
  | Readonly<{ kind: "pack"; referenceId: string }>
  | Readonly<{ kind: "perception"; referenceId: string }>
  | Readonly<{ kind: "communication"; referenceId: string }>
  | Readonly<{ kind: "weather"; referenceId: "weather:exposure" }>
  | Readonly<{ kind: "need"; referenceId: "need:food" | "need:rest" }>
  | Readonly<{ kind: "prior-intent"; referenceId: string }>;

export interface PorterResponseIntentScore {
  readonly intent: PorterResponseIntent;
  readonly score: number;
  readonly accessible: boolean;
}

export interface PorterResponseDecision {
  readonly version: typeof PORTER_RESPONSE_VERSION;
  /** Safe to use as an idempotent cargo/action transaction identity. */
  readonly decisionId: string;
  readonly actorId: string;
  readonly tick: number;
  readonly intent: PorterResponseIntent;
  readonly enteredAtTick: number;
  readonly nextThinkTick: number;
  readonly cause: PorterResponseCause;
  readonly focusBeliefKey: string | null;
  readonly subjectId: string | null;
  readonly packContainerId: string;
  /** Exact physical provision lot selected only for OFFER FOOD. */
  readonly foodLotId: string | null;
  readonly scores: readonly PorterResponseIntentScore[];
}

export interface PorterResponseApplyResult {
  readonly ok: boolean;
  readonly reason: "applied" | "already-applied" | "invalid-state" | "invalid-decision";
  readonly state: PorterResponseState | null;
}

interface FoodPackFacts {
  readonly id: string;
  readonly closure: "open" | "secured";
  readonly firstFoodLotId: string | null;
  readonly quantity: number;
}

interface PerceivedAnimalSignal {
  readonly belief: ActorBelief;
  readonly strength: number;
}

interface ScoredCandidate {
  readonly intent: PorterResponseIntent;
  readonly score: number;
}

const ANIMAL_CONTACT_CLASSES: ReadonlySet<string> = new Set([
  "animal",
  "animal-silhouette",
  "dog",
  "domestic-dog",
  "unknown-animal",
  "unknown-dog",
]);

const TEMPERAMENTS: ReadonlySet<string> = new Set([
  "calm",
  "nervous",
  "bold",
  "cautious",
  "curious",
  "reserved",
  "patient",
  "practical",
  "protective",
  "social",
  "stubborn",
  "optimistic",
]);

const MINIMUM_HOLD_TICKS: Readonly<Record<PorterResponseIntent, number>> = {
  "secure-food": 2,
  reroute: 4,
  leave: 3,
  "offer-food": 3,
  "wait-observe": 3,
};

const THINK_DELAY_RANGE: Readonly<Record<PorterResponseIntent, readonly [number, number]>> = {
  "secure-food": [1, 2],
  reroute: [3, 5],
  leave: [2, 4],
  "offer-food": [2, 4],
  "wait-observe": [2, 5],
};

export function createPorterResponseState(actorId: string, tick = 0): PorterResponseState {
  if (!validHumanActorId(actorId) || !nonnegativeSafeInteger(tick)) {
    throw new RangeError("Porter response state requires a valid human actor and tick");
  }
  return freezeState({
    version: PORTER_RESPONSE_VERSION,
    actorId,
    tick,
    intent: "wait-observe",
    enteredAtTick: tick,
    nextThinkTick: tick,
    lastDecisionId: null,
    lastOfferedSubjectId: null,
    lastOfferedAtTick: null,
  });
}

/** Strict persisted-shape validation; aliases and partial recovery fail closed. */
export function canonicalizePorterResponseState(value: unknown): PorterResponseState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "actorId",
    "enteredAtTick",
    "intent",
    "lastDecisionId",
    "lastOfferedAtTick",
    "lastOfferedSubjectId",
    "nextThinkTick",
    "tick",
    "version",
  ])) return null;
  if (
    value.version !== PORTER_RESPONSE_VERSION
    || !validHumanActorId(value.actorId)
    || !nonnegativeSafeInteger(value.tick)
    || !isIntent(value.intent)
    || !nonnegativeSafeInteger(value.enteredAtTick)
    || value.enteredAtTick > value.tick
    || !nonnegativeSafeInteger(value.nextThinkTick)
    || value.nextThinkTick < value.tick
    || !(value.lastDecisionId === null || validId(value.lastDecisionId))
    || !(value.lastOfferedSubjectId === null || validId(value.lastOfferedSubjectId))
    || !(value.lastOfferedAtTick === null || nonnegativeSafeInteger(value.lastOfferedAtTick))
    || ((value.lastOfferedSubjectId === null) !== (value.lastOfferedAtTick === null))
    || (value.lastOfferedSubjectId !== null && value.lastOfferedSubjectId === value.actorId)
    || (value.lastOfferedAtTick !== null && value.lastOfferedAtTick > value.tick)
  ) return null;
  return freezeState({
    version: PORTER_RESPONSE_VERSION,
    actorId: value.actorId,
    tick: value.tick,
    intent: value.intent,
    enteredAtTick: value.enteredAtTick,
    nextThinkTick: value.nextThinkTick,
    lastDecisionId: value.lastDecisionId,
    lastOfferedSubjectId: value.lastOfferedSubjectId,
    lastOfferedAtTick: value.lastOfferedAtTick,
  });
}

/**
 * Deterministic policy over accepted cognition and validated physical cargo.
 * It never reads a dog's hidden needs, intent, temperament, or true distance.
 */
export function decidePorterResponse(value: unknown): PorterResponseDecision | null {
  const input = canonicalInput(value);
  if (input === null) return null;
  return decideCanonicalPorterResponse(input, null);
}

/**
 * Evaluates a player's request as one causal input alongside perception,
 * needs, temperament, weather, and physical custody. A request can make the
 * matching response more likely, but inaccessible or unsafe actions remain
 * impossible and the porter may still choose something else.
 */
export function decidePorterResponseForRequest(
  value: unknown,
  requestValue: unknown,
): PorterResponseDecision | null {
  const input = canonicalInput(value);
  const request = canonicalRequestSignal(requestValue);
  if (input === null || request === null) return null;
  return decideCanonicalPorterResponse(input, request);
}

function decideCanonicalPorterResponse(
  input: PorterResponseInput,
  request: PorterResponseRequestSignal | null,
): PorterResponseDecision | null {
  const pack = physicalFoodPack(input.cargo, input.packContainerId, input.current.actorId);
  if (pack === null) return null;
  const animal = strongestAnimalSignal(queryActorAttention(input.perception));
  const identifiedSubjectId = animal?.belief.subjectId ?? null;
  const recentlyOffered = identifiedSubjectId !== null
    && input.current.lastOfferedSubjectId === identifiedSubjectId
    && input.current.lastOfferedAtTick !== null
    && input.tick - input.current.lastOfferedAtTick < PORTER_RESPONSE_OFFER_COOLDOWN_TICKS;
  const rawScores = scoreIntents(input, pack, animal, recentlyOffered, request);
  const scores = PORTER_RESPONSE_INTENTS.map((intent): PorterResponseIntentScore => Object.freeze({
    intent,
    score: rawScores[intent],
    accessible: input.accessibility[intent]
      && physicallyAvailable(intent, pack, animal, recentlyOffered),
  }));
  const candidates = scores
    .filter(({ accessible }) => accessible)
    .map(({ intent, score }): ScoredCandidate => Object.freeze({ intent, score }));
  if (candidates.length === 0) return null;

  const best = bestCandidate(candidates);
  const current = candidates.find(({ intent }) => intent === input.current.intent) ?? null;
  const heldTicks = input.tick - input.current.enteredAtTick;
  const urgent = (best.intent === "reroute" || best.intent === "leave")
    && best.score >= PORTER_RESPONSE_URGENT_SCORE;
  const thinkDue = input.tick >= input.current.nextThinkTick;
  let selected = best;
  if (current !== null && best.intent !== current.intent && !urgent) {
    if (
      !thinkDue
      || heldTicks < MINIMUM_HOLD_TICKS[current.intent]
      || best.score < current.score + PORTER_RESPONSE_SWITCH_MARGIN
    ) selected = current;
  }

  const focusBeliefKey = actionUsesAnimal(selected.intent) ? animal?.belief.key ?? null : null;
  const subjectId = actionUsesAnimal(selected.intent) ? identifiedSubjectId : null;
  const foodLotId = selected.intent === "offer-food" ? pack.firstFoodLotId : null;
  const enteredAtTick = selected.intent === input.current.intent
    ? input.current.enteredAtTick
    : input.tick;
  const nextThinkTick = nextThink(input.current.actorId, selected.intent, input.tick);
  const cause = causeFor(selected.intent, pack, animal, input, request);
  const decisionCore = {
    actorId: input.current.actorId,
    tick: input.tick,
    intent: selected.intent,
    enteredAtTick,
    nextThinkTick,
    cause,
    focusBeliefKey,
    subjectId,
    packContainerId: pack.id,
    foodLotId,
    scores,
  };
  return freezeDecision({
    version: PORTER_RESPONSE_VERSION,
    decisionId: `porter-response:${hashCanonical(decisionCore)}`,
    ...decisionCore,
  });
}

/** Applying the same decision twice is a closed, mutation-free success. */
export function applyPorterResponseDecision(
  stateValue: unknown,
  decisionValue: unknown,
): PorterResponseApplyResult {
  const state = canonicalizePorterResponseState(stateValue);
  if (state === null) return { ok: false, reason: "invalid-state", state: null };
  const decision = canonicalizePorterResponseDecision(decisionValue);
  if (
    decision === null
    || decision.actorId !== state.actorId
    || decision.tick < state.tick
    || (decision.tick === state.tick
      && state.lastDecisionId !== null
      && state.lastDecisionId !== decision.decisionId)
  ) return { ok: false, reason: "invalid-decision", state };
  if (state.lastDecisionId === decision.decisionId) {
    if (
      decision.intent === "offer-food"
      && (decision.subjectId === null
        || state.lastOfferedSubjectId !== decision.subjectId
        || state.lastOfferedAtTick !== decision.tick)
    ) return { ok: false, reason: "invalid-decision", state };
    return { ok: true, reason: "already-applied", state };
  }
  const offeredSubjectId = decision.intent === "offer-food"
    ? decision.subjectId
    : state.lastOfferedSubjectId;
  const offeredAtTick = decision.intent === "offer-food"
    ? decision.tick
    : state.lastOfferedAtTick;
  return {
    ok: true,
    reason: "applied",
    state: freezeState({
      version: PORTER_RESPONSE_VERSION,
      actorId: state.actorId,
      tick: decision.tick,
      intent: decision.intent,
      enteredAtTick: decision.enteredAtTick,
      nextThinkTick: decision.nextThinkTick,
      lastDecisionId: decision.decisionId,
      lastOfferedSubjectId: offeredSubjectId,
      lastOfferedAtTick: offeredAtTick,
    }),
  };
}

export function canonicalizePorterResponseDecision(value: unknown): PorterResponseDecision | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "actorId",
    "cause",
    "decisionId",
    "enteredAtTick",
    "focusBeliefKey",
    "foodLotId",
    "intent",
    "nextThinkTick",
    "packContainerId",
    "scores",
    "subjectId",
    "tick",
    "version",
  ])) return null;
  if (
    value.version !== PORTER_RESPONSE_VERSION
    || !validId(value.decisionId)
    || !validHumanActorId(value.actorId)
    || !nonnegativeSafeInteger(value.tick)
    || !isIntent(value.intent)
    || !nonnegativeSafeInteger(value.enteredAtTick)
    || value.enteredAtTick > value.tick
    || !nonnegativeSafeInteger(value.nextThinkTick)
    || value.nextThinkTick <= value.tick
    || !validCause(value.cause)
    || !(value.focusBeliefKey === null || validId(value.focusBeliefKey))
    || !(value.subjectId === null || validId(value.subjectId))
    || !validId(value.packContainerId)
    || !(value.foodLotId === null || validId(value.foodLotId))
    || !Array.isArray(value.scores)
    || value.scores.length !== PORTER_RESPONSE_INTENTS.length
  ) return null;
  const scores: PorterResponseIntentScore[] = [];
  for (let index = 0; index < PORTER_RESPONSE_INTENTS.length; index += 1) {
    const score = canonicalScore(value.scores[index], PORTER_RESPONSE_INTENTS[index]);
    if (score === null) return null;
    scores.push(score);
  }
  if (
    (value.intent === "offer-food") !== (value.foodLotId !== null)
    || (value.intent === "offer-food" && value.subjectId === null)
    || (!actionUsesAnimal(value.intent) && (value.focusBeliefKey !== null || value.subjectId !== null))
  ) return null;
  const decisionCore = {
    actorId: value.actorId,
    tick: value.tick,
    intent: value.intent,
    enteredAtTick: value.enteredAtTick,
    nextThinkTick: value.nextThinkTick,
    cause: value.cause,
    focusBeliefKey: value.focusBeliefKey,
    subjectId: value.subjectId,
    packContainerId: value.packContainerId,
    foodLotId: value.foodLotId,
    scores,
  };
  if (value.decisionId !== `porter-response:${hashCanonical(decisionCore)}`) return null;
  return freezeDecision({
    version: PORTER_RESPONSE_VERSION,
    decisionId: value.decisionId,
    ...decisionCore,
  });
}

function canonicalInput(value: unknown): PorterResponseInput | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "accessibility",
    "cargo",
    "current",
    "disposition",
    "needs",
    "packContainerId",
    "perception",
    "tick",
    "version",
    "weather",
  ])) return null;
  const perception = canonicalizeActorPerceptionState(value.perception);
  const cargoValidation = validateActorCargoState(value.cargo);
  const current = canonicalizePorterResponseState(value.current);
  const weather = canonicalWeather(value.weather);
  const needs = canonicalNeeds(value.needs);
  const disposition = canonicalDisposition(value.disposition);
  const accessibility = canonicalAccessibility(value.accessibility);
  if (
    value.version !== PORTER_RESPONSE_VERSION
    || !nonnegativeSafeInteger(value.tick)
    || perception === null
    || perception.tick !== value.tick
    || current === null
    || current.actorId !== perception.actorId
    || current.tick > value.tick
    || !cargoValidation.valid
    || cargoValidation.state === null
    || !validId(value.packContainerId)
    || weather === null
    || needs === null
    || disposition === null
    || accessibility === null
    || !accessibility["wait-observe"]
  ) return null;
  return {
    version: PORTER_RESPONSE_VERSION,
    tick: value.tick,
    perception,
    cargo: cargoValidation.state,
    packContainerId: value.packContainerId,
    weather,
    needs,
    disposition,
    accessibility,
    current,
  };
}

function physicalFoodPack(
  cargo: ActorCargoState,
  packContainerId: string,
  actorId: string,
): FoodPackFacts | null {
  const pack = cargo.containers.find(({ id }) => id === packContainerId);
  if (pack === undefined || pack.custodianActorId !== actorId) return null;
  const foodLots = pack.carrier.lots.filter((lot) => (
    lot.payload.kind === "provision" && lot.payload.quantity > 0
  )).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  let quantity = 0;
  for (const lot of foodLots) {
    if (lot.payload.kind !== "provision") continue;
    quantity = Math.min(Number.MAX_SAFE_INTEGER, quantity + lot.payload.quantity);
  }
  return Object.freeze({
    id: pack.id,
    closure: pack.closure,
    firstFoodLotId: foodLots[0]?.id ?? null,
    quantity,
  });
}

function strongestAnimalSignal(beliefs: readonly ActorBelief[]): PerceivedAnimalSignal | null {
  let best: PerceivedAnimalSignal | null = null;
  for (const belief of beliefs) {
    if (!ANIMAL_CONTACT_CLASSES.has(belief.perceivedClass)) continue;
    const strength = clamp(Math.trunc((belief.confidence * 3 + belief.salience * 2) / 5));
    if (
      best === null
      || strength > best.strength
      || (strength === best.strength && belief.key < best.belief.key)
    ) best = Object.freeze({ belief, strength });
  }
  return best;
}

function scoreIntents(
  input: PorterResponseInput,
  pack: FoodPackFacts,
  animal: PerceivedAnimalSignal | null,
  recentlyOffered: boolean,
  request: PorterResponseRequestSignal | null,
): Readonly<Record<PorterResponseIntent, number>> {
  const animalStrength = animal?.strength ?? 0;
  const identified = animal?.belief.subjectId !== null && animal?.belief.subjectId !== undefined;
  const traits = input.disposition.traits;
  const temperament = new Set(input.disposition.temperament);
  const weatherDanger = clamp(
    weighted(input.weather.rainIntensity, 360_000)
    + weighted(input.weather.coldPressure, 420_000)
    + weighted(input.weather.windPressure, 220_000),
  );
  const cautious = traitBonus(temperament, [
    ["cautious", 90_000],
    ["nervous", 120_000],
    ["practical", 75_000],
  ]);
  const social = traitBonus(temperament, [
    ["social", 95_000],
    ["protective", 85_000],
    ["optimistic", 30_000],
  ]);
  const patient = traitBonus(temperament, [
    ["patient", 70_000],
    ["calm", 45_000],
    ["curious", 40_000],
  ]);
  const foodAvailable = pack.quantity > 0;
  const openFood = foodAvailable && pack.closure === "open";
  const offerRequested = request?.kind === "offer-provision"
    && request.subjectId !== null
    && request.subjectId === animal?.belief.subjectId;
  const secureRequested = request?.kind === "secure-provisions";

  return Object.freeze({
    "secure-food": openFood ? clamp(
      230_000
      + weighted(animalStrength, 360_000)
      + weighted(weatherDanger, 260_000)
      + weighted(input.needs.food, 80_000)
      + cautious
      + (secureRequested ? 420_000 : 0),
    ) : 0,
    "offer-food": foodAvailable && identified && !recentlyOffered ? clamp(
      150_000
      + weighted(animalStrength, 250_000)
      + weighted(traits.empathy, 450_000)
      + social
      - weighted(input.needs.food, 450_000)
      - weighted(weatherDanger, 150_000)
      - (temperament.has("reserved") ? 70_000 : 0)
      + (offerRequested ? 420_000 : 0),
    ) : 0,
    reroute: animal === null ? 0 : clamp(
      90_000
      + weighted(animalStrength, 180_000)
      + weighted(weatherDanger, 500_000)
      + cautious
      - weighted(traits.resolve, 120_000),
    ),
    leave: animal === null ? 0 : clamp(
      60_000
      + weighted(input.perception.suspicionPressure, 350_000)
      + weighted(animalStrength, 200_000)
      + weighted(weatherDanger, 350_000)
      + weighted(input.needs.rest, 100_000)
      + (temperament.has("nervous") ? 100_000 : 0)
      + (temperament.has("reserved") ? 55_000 : 0)
      - weighted(traits.resolve, 200_000),
    ),
    "wait-observe": clamp(
      220_000
      + weighted(traits.curiosity, 350_000)
      + patient
      + (animal !== null && !identified ? 160_000 : 0)
      - weighted(weatherDanger, 200_000)
      - weighted(input.perception.suspicionPressure, 100_000),
    ),
  });
}

function physicallyAvailable(
  intent: PorterResponseIntent,
  pack: FoodPackFacts,
  animal: PerceivedAnimalSignal | null,
  recentlyOffered: boolean,
): boolean {
  switch (intent) {
    case "secure-food":
      return pack.closure === "open" && pack.quantity > 0;
    case "offer-food":
      return pack.quantity > 0
        && pack.firstFoodLotId !== null
        && animal?.belief.subjectId !== null
        && animal?.belief.subjectId !== undefined
        && !recentlyOffered;
    case "reroute":
    case "leave":
      return animal !== null;
    case "wait-observe":
      return true;
  }
}

function causeFor(
  intent: PorterResponseIntent,
  pack: FoodPackFacts,
  animal: PerceivedAnimalSignal | null,
  input: PorterResponseInput,
  request: PorterResponseRequestSignal | null,
): PorterResponseCause {
  if (
    request !== null
    && ((intent === "offer-food"
      && request.kind === "offer-provision"
      && request.subjectId === animal?.belief.subjectId)
      || (intent === "secure-food" && request.kind === "secure-provisions"))
  ) return Object.freeze({ kind: "communication", referenceId: request.requestId });
  switch (intent) {
    case "secure-food":
      return Object.freeze({ kind: "pack", referenceId: pack.id });
    case "offer-food":
      return animal === null
        ? Object.freeze({ kind: "prior-intent", referenceId: "intent:offer-food" })
        : Object.freeze({ kind: "perception", referenceId: animal.belief.key });
    case "reroute":
      return Math.max(
        input.weather.rainIntensity,
        input.weather.coldPressure,
        input.weather.windPressure,
      ) >= 500_000
        ? Object.freeze({ kind: "weather", referenceId: "weather:exposure" })
        : animal === null
          ? Object.freeze({ kind: "prior-intent", referenceId: "intent:reroute" })
          : Object.freeze({ kind: "perception", referenceId: animal.belief.key });
    case "leave":
      return input.needs.rest >= 750_000
        ? Object.freeze({ kind: "need", referenceId: "need:rest" })
        : animal === null
          ? Object.freeze({ kind: "prior-intent", referenceId: "intent:leave" })
          : Object.freeze({ kind: "perception", referenceId: animal.belief.key });
    case "wait-observe":
      return animal === null
        ? Object.freeze({ kind: "prior-intent", referenceId: "intent:wait-observe" })
        : Object.freeze({ kind: "perception", referenceId: animal.belief.key });
  }
}

function bestCandidate(candidates: readonly ScoredCandidate[]): ScoredCandidate {
  const first = candidates[0];
  if (first === undefined) throw new Error("Porter response requires an accessible candidate");
  let best = first;
  for (let index = 1; index < candidates.length; index += 1) {
    const next = candidates[index];
    if (next !== undefined && next.score > best.score) best = next;
  }
  return best;
}

function nextThink(actorId: string, intent: PorterResponseIntent, tick: number): number {
  const range = THINK_DELAY_RANGE[intent];
  const hash = hashCanonical({ actorId, intent, tick });
  const entropy = Number.parseInt(hash.slice(0, 8), 16) >>> 0;
  const delay = range[0] + entropy % (range[1] - range[0] + 1);
  return tick + delay;
}

function actionUsesAnimal(intent: PorterResponseIntent): boolean {
  return intent === "offer-food" || intent === "reroute" || intent === "leave" || intent === "wait-observe";
}

function canonicalRequestSignal(value: unknown): PorterResponseRequestSignal | null {
  if (!plainRecord(value) || !exactKeys(value, ["kind", "requestId", "subjectId", "version"])) {
    return null;
  }
  if (
    value.version !== PORTER_RESPONSE_VERSION
    || !validId(value.requestId)
    || (value.kind !== "offer-provision" && value.kind !== "secure-provisions")
    || !(value.subjectId === null || validId(value.subjectId))
    || (value.kind === "offer-provision" && value.subjectId === null)
    || (value.kind === "secure-provisions" && value.subjectId !== null)
  ) return null;
  return Object.freeze({
    version: PORTER_RESPONSE_VERSION,
    requestId: value.requestId,
    kind: value.kind,
    subjectId: value.subjectId,
  });
}

function canonicalWeather(value: unknown): PorterResponseWeather | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "coldPressure",
    "rainIntensity",
    "windPressure",
  ])) return null;
  if (!scaledUnit(value.coldPressure) || !scaledUnit(value.rainIntensity) || !scaledUnit(value.windPressure)) {
    return null;
  }
  return Object.freeze({
    rainIntensity: value.rainIntensity,
    coldPressure: value.coldPressure,
    windPressure: value.windPressure,
  });
}

function canonicalNeeds(value: unknown): Readonly<ResidentNeeds> | null {
  if (!plainRecord(value) || !exactKeys(value, ["belonging", "food", "rest"])) return null;
  if (!scaledUnit(value.belonging) || !scaledUnit(value.food) || !scaledUnit(value.rest)) return null;
  return Object.freeze({ belonging: value.belonging, food: value.food, rest: value.rest });
}

function canonicalDisposition(value: unknown): PorterResponseDisposition | null {
  if (!plainRecord(value) || !exactKeys(value, ["temperament", "traits"])) return null;
  if (!plainRecord(value.traits) || !exactKeys(value.traits, ["curiosity", "empathy", "resolve"])) {
    return null;
  }
  if (
    !scaledUnit(value.traits.curiosity)
    || !scaledUnit(value.traits.empathy)
    || !scaledUnit(value.traits.resolve)
    || !Array.isArray(value.temperament)
    || value.temperament.length > TEMPERAMENTS.size
  ) return null;
  const temperament: ResidentTemperament[] = [];
  const seen = new Set<string>();
  for (const trait of value.temperament as readonly unknown[]) {
    if (typeof trait !== "string" || !TEMPERAMENTS.has(trait) || seen.has(trait)) return null;
    seen.add(trait);
    temperament.push(trait as ResidentTemperament);
  }
  temperament.sort();
  return Object.freeze({
    traits: Object.freeze({
      resolve: value.traits.resolve,
      empathy: value.traits.empathy,
      curiosity: value.traits.curiosity,
    }),
    temperament: Object.freeze(temperament),
  });
}

function canonicalAccessibility(value: unknown): PorterResponseAccessibility | null {
  if (!plainRecord(value) || !exactKeys(value, PORTER_RESPONSE_INTENTS)) return null;
  for (const intent of PORTER_RESPONSE_INTENTS) {
    if (typeof value[intent] !== "boolean") return null;
  }
  return Object.freeze(Object.fromEntries(
    PORTER_RESPONSE_INTENTS.map((intent) => [intent, value[intent]]),
  )) as PorterResponseAccessibility;
}

function canonicalScore(value: unknown, expectedIntent: PorterResponseIntent | undefined): PorterResponseIntentScore | null {
  if (!plainRecord(value) || !exactKeys(value, ["accessible", "intent", "score"])) return null;
  if (
    expectedIntent === undefined
    || value.intent !== expectedIntent
    || !scaledUnit(value.score)
    || typeof value.accessible !== "boolean"
  ) return null;
  return Object.freeze({ intent: expectedIntent, score: value.score, accessible: value.accessible });
}

function validCause(value: unknown): value is PorterResponseCause {
  if (!plainRecord(value) || !exactKeys(value, ["kind", "referenceId"]) || !validId(value.referenceId)) {
    return false;
  }
  switch (value.kind) {
    case "pack":
    case "perception":
    case "communication":
    case "prior-intent":
      return true;
    case "weather":
      return value.referenceId === "weather:exposure";
    case "need":
      return value.referenceId === "need:food" || value.referenceId === "need:rest";
    default:
      return false;
  }
}

function traitBonus(
  traits: ReadonlySet<ResidentTemperament>,
  entries: readonly (readonly [ResidentTemperament, number])[],
): number {
  let total = 0;
  for (const [trait, bonus] of entries) {
    if (traits.has(trait)) total += bonus;
  }
  return total;
}

function weighted(value: number, weight: number): number {
  return Math.trunc(value * weight / ACTOR_PERCEPTION_SCALE);
}

function clamp(value: number): number {
  if (value <= 0) return 0;
  if (value >= ACTOR_PERCEPTION_SCALE) return ACTOR_PERCEPTION_SCALE;
  return Math.trunc(value);
}

function freezeState(value: PorterResponseState): PorterResponseState {
  return Object.freeze({ ...value });
}

function freezeDecision(value: PorterResponseDecision): PorterResponseDecision {
  return Object.freeze({
    ...value,
    cause: Object.freeze({ ...value.cause }),
    scores: Object.freeze(value.scores.map((score) => Object.freeze({ ...score }))),
  });
}

function isIntent(value: unknown): value is PorterResponseIntent {
  return typeof value === "string"
    && (PORTER_RESPONSE_INTENTS as readonly string[]).includes(value);
}

function validHumanActorId(value: unknown): value is string {
  return validId(value) && value.startsWith("H-");
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u.test(value);
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}
