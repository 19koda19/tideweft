import {
  ACTOR_PERCEPTION_SCALE,
  ACTOR_PERCEPTION_VERSION,
  canonicalizeActorPerceptionState,
  createActorPerceptionState,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import {
  assertDogStateCoherence,
  generateDogState,
  type DogCondition,
  type DogHumanFamiliarity,
  type DogIdentity,
  type DogIdentityGenerationInput,
  type DogNeeds,
  type DogTemperament,
  type GeneratedDogState,
} from "../sim/dogIdentity";
import { stableStringify } from "../sim/util";
import {
  DOG_BEHAVIOR_INTENTS,
  DOG_BEHAVIOR_VERSION,
  type DogBehaviorDecision,
} from "./dogBehavior";
import {
  createLivingActorAddress,
  isLivingActorAddress,
  type LivingActorAddress,
} from "./livingActor";
import { isWorldPosition, type WorldPosition } from "./worldPosition";

/**
 * First authoritative dynamic record for a generated dog. It deliberately
 * remains a game-layer sidecar until the regional actor store owns its save
 * transaction; pristine generation and promoted deviations need different
 * persistence lifetimes.
 */
export const DOG_ACTOR_STATE_VERSION = 1 as const;
export const DOG_ACTOR_PLAYER_KNOWLEDGE_VERSION = 1 as const;
export const DOG_ACTOR_MEMORY_CAP = 16 as const;
export const DOG_ACTOR_PLAYER_KNOWLEDGE_CAP = 12 as const;
export const DOG_ACTOR_MAX_SERIALIZED_BYTES = 512 * 1_024;

const MAX_EVENT_ID_LENGTH = 192;
const MAX_INTENT_REFERENCE_LENGTH = 256;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._\/-]*$/u;
const UTF8_ENCODER = new TextEncoder();

export type DogActorPersistenceTier = "regional" | "promoted";

export type DogActorIntent =
  | "observe"
  | "approach-food"
  | "eat"
  | "avoid-human"
  | "seek-shelter"
  | "retreat"
  | "rest"
  ;

export type DogActorIntentCauseKind =
  | "need"
  | "perception"
  | "memory"
  | "condition"
  | "contact"
  | "world-event";

export interface DogActorIntentCause {
  readonly kind: DogActorIntentCauseKind;
  /** Stable need, belief, memory, or event reference; never hidden world truth. */
  readonly referenceId: string;
}

export interface DogActorIntentState {
  readonly kind: DogActorIntent;
  readonly cause: DogActorIntentCause;
  readonly enteredAtTick: number;
  readonly nextThinkTick: number;
}

export type DogActorMemoryKind =
  | "food"
  | "safety"
  | "human-interaction"
  | "relationship"
  | "custody"
  | "identity-learning"
  | "ledger-event";

/** Bounded, causal memory. This is separate from short-lived sensory belief. */
export interface DogActorMemory {
  readonly eventId: string;
  readonly kind: DogActorMemoryKind;
  readonly subjectId: string | null;
  readonly atTick: number;
  readonly salience: number;
  readonly location: WorldPosition;
}

export type DogPlayerKnowledgeFactKind =
  | "species"
  | "approximate-size"
  | "coat"
  | "distinguishing-mark"
  | "visible-condition"
  | "human-familiarity"
  | "temperament"
  | "significant-history"
  | "recognizable-individual";

export type DogPlayerKnowledgeSource =
  | "direct-observation"
  | "interaction"
  | "trusted-report";

/**
 * This records only which facts the player may lawfully inspect. Values remain
 * on the actor and must be projected through these gates; there is no name,
 * owner, trust, affection, or bond field to accidentally invent.
 */
export interface DogPlayerKnowledgeFact {
  readonly fact: DogPlayerKnowledgeFactKind;
  readonly source: DogPlayerKnowledgeSource;
  readonly evidenceId: string;
  readonly learnedAtTick: number;
  readonly confidence: number;
}

export interface DogPlayerKnowledgeState {
  readonly version: typeof DOG_ACTOR_PLAYER_KNOWLEDGE_VERSION;
  readonly facts: readonly DogPlayerKnowledgeFact[];
}

export type DogActorPromotionReasonKind =
  | "causal-event"
  | "relationship-change"
  | "custody-change"
  | "ledger-entry"
  | "identity-learning";

/** There is intentionally no click, selection, ABOUT, or proximity reason. */
export interface DogActorPromotionReason {
  readonly kind: DogActorPromotionReasonKind;
  readonly eventId: string;
  readonly atTick: number;
}

export interface DogActorPromotion {
  readonly reason: DogActorPromotionReason;
}

export interface DogActorState {
  readonly version: typeof DOG_ACTOR_STATE_VERSION;
  readonly updatedAtTick: number;
  readonly address: LivingActorAddress & {
    readonly species: "domestic-dog";
    readonly persistence: DogActorPersistenceTier;
  };
  readonly identity: DogIdentity;
  readonly needs: Readonly<DogNeeds>;
  readonly condition: Readonly<Omit<DogCondition, "injuries">> & {
    readonly injuries: readonly DogCondition["injuries"][number][];
  };
  readonly humanFamiliarity: Readonly<DogHumanFamiliarity>;
  readonly perception: ActorPerceptionState;
  readonly memories: readonly DogActorMemory[];
  readonly intent: DogActorIntentState;
  readonly playerKnowledge: DogPlayerKnowledgeState;
  readonly promotion: DogActorPromotion | null;
}

export interface CreateDogActorInput extends DogIdentityGenerationInput {
  readonly position: WorldPosition;
  readonly heading?: number;
  readonly tick?: number;
}

export interface SetDogActorIntentInput {
  readonly kind: DogActorIntent;
  readonly cause: DogActorIntentCause;
  readonly enteredAtTick: number;
  readonly nextThinkTick: number;
}

export interface RepositionDogActorInput {
  readonly position: WorldPosition;
  readonly heading: number;
  readonly atTick: number;
}

export interface ReplaceDogActorPhysiologyInput {
  readonly needs: Readonly<DogNeeds>;
  readonly condition: Readonly<DogCondition>;
  readonly humanFamiliarity: Readonly<DogHumanFamiliarity>;
  readonly atTick: number;
}

export function createDogActorState(input: CreateDogActorInput): DogActorState {
  if (!plainRecord(input) || !isWorldPosition(input.position)) {
    throw new TypeError("Dog actor creation requires a canonical segmented position");
  }
  const tick = input.tick ?? 0;
  if (!nonnegativeSafeInteger(tick) || tick > Number.MAX_SAFE_INTEGER - 8) {
    throw new RangeError("Dog actor creation tick is outside the schedulable range");
  }
  const generated = generateDogState(input);
  const intent = initialIntent(generated, tick);
  const candidate = {
    version: DOG_ACTOR_STATE_VERSION,
    updatedAtTick: tick,
    address: createLivingActorAddress({
      actorId: generated.identity.stableId,
      species: "domestic-dog",
      position: input.position,
      ...(input.heading === undefined ? {} : { heading: input.heading }),
      persistence: "regional",
    }),
    identity: generated.identity,
    needs: generated.needs,
    condition: generated.condition,
    humanFamiliarity: generated.humanFamiliarity,
    perception: createActorPerceptionState(generated.identity.stableId, tick),
    memories: [],
    intent,
    playerKnowledge: {
      version: DOG_ACTOR_PLAYER_KNOWLEDGE_VERSION,
      facts: [],
    },
    promotion: null,
  };
  const state = canonicalizeDogActorState(candidate);
  if (state === null) throw new Error("Generated dog actor state failed its canonical boundary");
  return state;
}

/** Rejects aliases, extra fields, impossible cross-record IDs, and unbounded state. */
export function canonicalizeDogActorState(value: unknown): DogActorState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "address",
    "condition",
    "humanFamiliarity",
    "identity",
    "intent",
    "memories",
    "needs",
    "perception",
    "playerKnowledge",
    "promotion",
    "updatedAtTick",
    "version",
  ])) return null;
  if (value.version !== DOG_ACTOR_STATE_VERSION || !nonnegativeSafeInteger(value.updatedAtTick)) {
    return null;
  }

  const generated = canonicalGeneratedDogState({
    identity: value.identity,
    needs: value.needs,
    condition: value.condition,
    humanFamiliarity: value.humanFamiliarity,
  });
  if (generated === null) return null;

  if (!isLivingActorAddress(value.address)) return null;
  const rawAddress = value.address;
  if (
    rawAddress.actorId !== generated.identity.stableId
    || rawAddress.species !== "domestic-dog"
    || (rawAddress.persistence !== "regional" && rawAddress.persistence !== "promoted")
  ) return null;
  const address = createLivingActorAddress(rawAddress) as DogActorState["address"];

  if (!plainRecord(value.perception) || value.perception.version !== ACTOR_PERCEPTION_VERSION) {
    return null;
  }
  const perception = canonicalizeActorPerceptionState(value.perception);
  if (
    perception === null
    || perception.actorId !== generated.identity.stableId
    || perception.tick > value.updatedAtTick
  ) return null;

  const memories = canonicalMemories(value.memories, value.updatedAtTick);
  const intent = canonicalIntent(value.intent, value.updatedAtTick);
  const playerKnowledge = canonicalPlayerKnowledge(value.playerKnowledge, value.updatedAtTick);
  const promotion = value.promotion === null
    ? null
    : canonicalPromotion(value.promotion, value.updatedAtTick);
  if (memories === null || intent === null || playerKnowledge === null) return null;
  if (value.promotion !== null && promotion === null) return null;
  if (!playerKnowledge.facts.every((fact) => knowledgeEvidenceMatches(memories, fact))) {
    return null;
  }
  if (promotion !== null && !promotionEvidenceMatches(memories, playerKnowledge, promotion.reason)) {
    return null;
  }
  if (
    (address.persistence === "regional" && promotion !== null)
    || (address.persistence === "promoted" && promotion === null)
  ) return null;

  return freezeDogActorState({
    version: DOG_ACTOR_STATE_VERSION,
    updatedAtTick: value.updatedAtTick,
    address,
    identity: generated.identity,
    needs: generated.needs,
    condition: generated.condition,
    humanFamiliarity: generated.humanFamiliarity,
    perception,
    memories,
    intent,
    playerKnowledge,
    promotion,
  });
}

export function serializeDogActorState(value: unknown): string {
  const state = requireDogActorState(value);
  const encoded = stableStringify(state);
  if (UTF8_ENCODER.encode(encoded).byteLength > DOG_ACTOR_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Dog actor state exceeds its serialized save budget");
  }
  return encoded;
}

export function deserializeDogActorState(text: unknown): DogActorState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > DOG_ACTOR_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeDogActorState(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

/** Append by event identity. Exact replay is a no-op; collisions fail closed. */
export function appendDogActorMemory(
  value: unknown,
  memoryValue: unknown,
): DogActorState {
  const state = requireDogActorState(value);
  const memory = canonicalMemory(memoryValue, Number.MAX_SAFE_INTEGER);
  if (memory === null) throw new RangeError("Dog memory must be canonical");
  const existing = state.memories.find(({ eventId }) => eventId === memory.eventId);
  if (existing !== undefined) {
    if (stableStringify(existing) !== stableStringify(memory)) {
      throw new Error(`Dog memory identity collision ${memory.eventId}`);
    }
    return state;
  }
  if (memory.atTick < state.updatedAtTick) {
    throw new RangeError("New dog memory must not predate current actor state");
  }
  const memories = retainDogActorMemories(
    [...state.memories, memory],
    retainedEvidenceEventIds(state),
  );
  if (!memories.some(({ eventId }) => eventId === memory.eventId)) return state;
  return rebuildState(state, { updatedAtTick: memory.atTick, memories });
}

/**
 * Adds or strengthens one lawful knowledge gate. It never promotes an actor;
 * meaningful identity learning must independently carry an auditable promotion
 * reason rather than being inferred from opening ABOUT.
 */
export function learnDogPlayerKnowledge(
  value: unknown,
  factValue: unknown,
): DogActorState {
  const state = requireDogActorState(value);
  const fact = canonicalKnowledgeFact(factValue, Number.MAX_SAFE_INTEGER);
  if (fact === null) throw new RangeError("Dog player knowledge must be canonical");
  const existing = state.playerKnowledge.facts.find(({ fact: key }) => key === fact.fact);
  if (existing !== undefined && stableStringify(existing) === stableStringify(fact)) return state;
  if (fact.learnedAtTick < state.updatedAtTick) {
    throw new RangeError("New dog player knowledge must be causally ordered");
  }
  if (!knowledgeEvidenceMatches(state.memories, fact)) return state;
  const winner = existing === undefined || compareKnowledgeEvidence(fact, existing) < 0
    ? fact
    : existing;
  if (winner === existing) return state;
  const facts = state.playerKnowledge.facts
    .filter(({ fact: key }) => key !== fact.fact)
    .concat(fact)
    .sort(compareKnowledgeStorage)
    .slice(0, DOG_ACTOR_PLAYER_KNOWLEDGE_CAP);
  return rebuildState(state, {
    updatedAtTick: fact.learnedAtTick,
    playerKnowledge: {
      version: DOG_ACTOR_PLAYER_KNOWLEDGE_VERSION,
      facts,
    },
  });
}

/** Promote only for the first durable, meaningful reason. Replays are exact. */
export function promoteDogActor(
  value: unknown,
  reasonValue: unknown,
): DogActorState {
  const state = requireDogActorState(value);
  const reason = canonicalPromotionReason(reasonValue, Number.MAX_SAFE_INTEGER);
  if (reason === null) throw new RangeError("Dog promotion requires a canonical causal reason");
  if (state.promotion !== null) {
    if (stableStringify(state.promotion.reason) === stableStringify(reason)) return state;
    return state;
  }
  if (reason.atTick < state.updatedAtTick) {
    throw new RangeError("New dog promotion cannot predate current actor state");
  }
  if (!promotionEvidenceMatches(state.memories, state.playerKnowledge, reason)) return state;
  return rebuildState(state, {
    updatedAtTick: reason.atTick,
    address: createLivingActorAddress({
      ...state.address,
      persistence: "promoted",
    }) as DogActorState["address"],
    promotion: { reason },
  });
}

export function setDogActorIntent(
  value: unknown,
  intentValue: unknown,
): DogActorState {
  const state = requireDogActorState(value);
  const intent = canonicalIntent(intentValue, Number.MAX_SAFE_INTEGER);
  if (intent === null) throw new RangeError("Dog intent must be canonical");
  if (stableStringify(intent) === stableStringify(state.intent)) return state;
  if (intent.enteredAtTick < state.updatedAtTick) {
    throw new RangeError("New dog intent must be causally ordered");
  }
  return rebuildState(state, { updatedAtTick: intent.enteredAtTick, intent });
}

/**
 * Total behavior-to-persistence bridge. It accepts only a current kernel
 * decision, proves every cited percept already belongs to this dog, and uses
 * the kernel's deterministic schedule verbatim.
 */
export function applyDogBehaviorDecision(
  value: unknown,
  decisionValue: unknown,
): DogActorState {
  const state = requireDogActorState(value);
  const decision = canonicalBehaviorDecision(decisionValue);
  if (
    decision === null
    || decision.tick !== state.perception.tick
    || decision.tick < state.updatedAtTick
    || decision.enteredAtTick > decision.tick
  ) throw new RangeError("Dog behavior decision is stale or malformed");

  const acceptedBeliefKeys = new Set(state.perception.beliefs.map(({ key }) => key));
  if (
    (decision.focusBeliefKey !== null && !acceptedBeliefKeys.has(decision.focusBeliefKey))
    || (decision.cause.kind === "perception" && !acceptedBeliefKeys.has(decision.cause.referenceId))
    || (
      decision.focusBeliefKey !== null
      && (
        decision.cause.kind !== "perception"
        || decision.cause.referenceId !== decision.focusBeliefKey
      )
    )
  ) throw new RangeError("Dog behavior cited knowledge the actor did not perceive");

  const cause = persistedBehaviorCause(state, decision);
  if (
    decision.cause.kind === "prior-intent"
    && (
      decision.intent !== state.intent.kind
      || decision.enteredAtTick !== state.intent.enteredAtTick
      || decision.cause.referenceId !== `intent:${decision.intent}`
    )
  ) throw new RangeError("Dog behavior hysteresis does not match the prior lawful intent");

  const intent = canonicalIntent({
    kind: decision.intent,
    cause,
    enteredAtTick: decision.enteredAtTick,
    nextThinkTick: decision.nextThinkTick,
  }, decision.tick);
  if (intent === null || decision.nextThinkTick <= decision.tick) {
    throw new RangeError("Dog behavior decision has an invalid think schedule");
  }
  return rebuildState(state, { updatedAtTick: decision.tick, intent });
}

export function replaceDogActorPerception(
  value: unknown,
  perceptionValue: unknown,
): DogActorState {
  const state = requireDogActorState(value);
  const perception = canonicalizeActorPerceptionState(perceptionValue);
  if (perception !== null && stableStringify(perception) === stableStringify(state.perception)) {
    return state;
  }
  if (
    perception === null
    || perception.version !== ACTOR_PERCEPTION_VERSION
    || perception.actorId !== state.identity.stableId
    || perception.tick < state.perception.tick
    || perception.tick < state.updatedAtTick
  ) throw new RangeError("Dog perception must advance the same stable actor identity");
  return rebuildState(state, { updatedAtTick: perception.tick, perception });
}

export function repositionDogActor(
  value: unknown,
  moveValue: unknown,
): DogActorState {
  const state = requireDogActorState(value);
  if (
    !plainRecord(moveValue)
    || !exactKeys(moveValue, ["atTick", "heading", "position"])
    || !nonnegativeSafeInteger(moveValue.atTick)
    || moveValue.atTick < state.updatedAtTick
    || !isWorldPosition(moveValue.position)
  ) throw new RangeError("Dog movement requires a canonical ordered segmented position");
  const address = createLivingActorAddress({
    ...state.address,
    position: moveValue.position,
    heading: moveValue.heading as number,
  }) as DogActorState["address"];
  return rebuildState(state, { updatedAtTick: moveValue.atTick, address });
}

export function replaceDogActorPhysiology(
  value: unknown,
  updateValue: unknown,
): DogActorState {
  const state = requireDogActorState(value);
  if (
    !plainRecord(updateValue)
    || !exactKeys(updateValue, ["atTick", "condition", "humanFamiliarity", "needs"])
    || !nonnegativeSafeInteger(updateValue.atTick)
    || updateValue.atTick < state.updatedAtTick
  ) throw new RangeError("Dog physiology update is malformed or out of order");
  const generated = canonicalGeneratedDogState({
    identity: state.identity,
    needs: updateValue.needs,
    condition: updateValue.condition,
    humanFamiliarity: updateValue.humanFamiliarity,
  });
  if (generated === null) throw new RangeError("Dog physiology update is incoherent");
  return rebuildState(state, {
    updatedAtTick: updateValue.atTick,
    needs: generated.needs,
    condition: generated.condition,
    humanFamiliarity: generated.humanFamiliarity,
  });
}

function initialIntent(state: GeneratedDogState, tick: number): DogActorIntentState {
  const needs = Object.entries(state.needs) as [keyof DogNeeds, number][];
  needs.sort((left, right) => right[1] - left[1] || compareText(left[0], right[0]));
  const need = needs[0]?.[0] ?? "safety";
  return {
    // Desire alone is not target knowledge. The behavior kernel may choose a
    // concrete approach only after a lawful observation enters perception.
    kind: need === "rest" ? "rest" : "observe",
    cause: { kind: "need", referenceId: `need:${need}` },
    enteredAtTick: tick,
    nextThinkTick: tick + 1 + stableHash(state.identity.stableId) % 8,
  };
}

function canonicalGeneratedDogState(value: unknown): Readonly<GeneratedDogState> | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "condition",
    "humanFamiliarity",
    "identity",
    "needs",
  ])) return null;
  const identity = canonicalIdentity(value.identity);
  const needs = canonicalNeeds(value.needs);
  const condition = canonicalCondition(value.condition);
  const humanFamiliarity = canonicalFamiliarity(value.humanFamiliarity);
  if (identity === null || needs === null || condition === null || humanFamiliarity === null) {
    return null;
  }
  const state: GeneratedDogState = { identity, needs, condition, humanFamiliarity };
  try {
    assertDogStateCoherence(state);
  } catch {
    return null;
  }
  return deepFreeze(state);
}

function canonicalIdentity(value: unknown): DogIdentity | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "age",
    "ancestry",
    "body",
    "coat",
    "generationVersion",
    "habitatClass",
    "habitatKey",
    "originNamespace",
    "originRegion",
    "populationKey",
    "populationOrdinal",
    "sex",
    "species",
    "stableId",
    "temperament",
    "weatherAdaptation",
  ])) return null;
  if (
    !plainRecord(value.originRegion)
    || !exactKeys(value.originRegion, ["x", "y"])
    || !plainRecord(value.ancestry)
    || !exactKeys(value.ancestry, ["kind", "primary", "secondary"])
    || !plainRecord(value.body)
    || !exactKeys(value.body, ["massGrams", "shoulderHeightCm", "size"])
    || !plainRecord(value.coat)
    || !exactKeys(value.coat, [
      "distinguishingMark",
      "length",
      "pattern",
      "primaryColor",
      "secondaryColor",
    ])
    || !Array.isArray(value.temperament)
    || value.temperament.length !== 2
    || !plainRecord(value.weatherAdaptation)
    || !exactKeys(value.weatherAdaptation, [
      "coldTolerance",
      "heatTolerance",
      "rainTolerance",
      "waterConfidence",
    ])
  ) return null;
  const identity = deepFreeze(structuredClone(value) as unknown as DogIdentity);
  try {
    assertDogStateCoherence({
      identity,
      needs: { hunger: 0, thirst: 0, rest: 0, safety: 0, company: 0 },
      condition: {
        health: ACTOR_PERCEPTION_SCALE,
        wetness: 0,
        coldStress: 0,
        heatStress: 0,
        exhaustion: 0,
        injuries: [],
      },
      humanFamiliarity: { level: "wary", confidence: 180_000 },
    });
  } catch {
    return null;
  }
  return identity;
}

function canonicalNeeds(value: unknown): DogNeeds | null {
  if (!plainRecord(value) || !exactKeys(value, ["company", "hunger", "rest", "safety", "thirst"])) {
    return null;
  }
  const needs = structuredClone(value) as unknown as DogNeeds;
  return Object.values(needs).every(scaledUnit) ? deepFreeze(needs) : null;
}

function canonicalCondition(value: unknown): DogCondition | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "coldStress",
    "exhaustion",
    "health",
    "heatStress",
    "injuries",
    "wetness",
  ]) || !Array.isArray(value.injuries)) return null;
  return deepFreeze(structuredClone(value) as unknown as DogCondition);
}

function canonicalFamiliarity(value: unknown): DogHumanFamiliarity | null {
  if (!plainRecord(value) || !exactKeys(value, ["confidence", "level"])) return null;
  return deepFreeze(structuredClone(value) as unknown as DogHumanFamiliarity);
}

function canonicalMemories(value: unknown, stateTick: number): readonly DogActorMemory[] | null {
  if (!Array.isArray(value) || value.length > DOG_ACTOR_MEMORY_CAP) return null;
  const memories: DogActorMemory[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    const memory = canonicalMemory(raw, stateTick);
    if (memory === null || ids.has(memory.eventId)) return null;
    ids.add(memory.eventId);
    memories.push(memory);
  }
  memories.sort(compareMemoryPriority);
  return deepFreeze(memories);
}

function canonicalMemory(value: unknown, maximumTick: number): DogActorMemory | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "atTick",
    "eventId",
    "kind",
    "location",
    "salience",
    "subjectId",
  ])) return null;
  if (
    !validEventId(value.eventId)
    || !isMemoryKind(value.kind)
    || (value.subjectId !== null && !validActorId(value.subjectId))
    || !nonnegativeSafeInteger(value.atTick)
    || value.atTick > maximumTick
    || !scaledUnit(value.salience)
    || !isWorldPosition(value.location)
  ) return null;
  return deepFreeze({
    eventId: value.eventId,
    kind: value.kind,
    subjectId: value.subjectId,
    atTick: value.atTick,
    salience: value.salience,
    location: value.location,
  });
}

function canonicalIntent(value: unknown, maximumEnteredTick: number): DogActorIntentState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "cause",
    "enteredAtTick",
    "kind",
    "nextThinkTick",
  ])) return null;
  if (
    !isIntent(value.kind)
    || !nonnegativeSafeInteger(value.enteredAtTick)
    || value.enteredAtTick > maximumEnteredTick
    || !nonnegativeSafeInteger(value.nextThinkTick)
    || value.nextThinkTick <= value.enteredAtTick
  ) return null;
  const cause = canonicalIntentCause(value.cause);
  return cause === null ? null : deepFreeze({
    kind: value.kind,
    cause,
    enteredAtTick: value.enteredAtTick,
    nextThinkTick: value.nextThinkTick,
  });
}

function canonicalIntentCause(value: unknown): DogActorIntentCause | null {
  if (!plainRecord(value) || !exactKeys(value, ["kind", "referenceId"])) return null;
  if (
    !isIntentCauseKind(value.kind)
    || typeof value.referenceId !== "string"
    || value.referenceId.length === 0
    || value.referenceId.length > MAX_INTENT_REFERENCE_LENGTH
    || value.referenceId !== value.referenceId.trim()
    || /[\u0000-\u001f\u007f]/u.test(value.referenceId)
  ) return null;
  if (value.kind === "need" && !/^need:(company|hunger|rest|safety|thirst)$/u.test(value.referenceId)) {
    return null;
  }
  if (value.kind === "memory" && !value.referenceId.startsWith("memory:")) return null;
  if (value.kind === "condition" && !value.referenceId.startsWith("condition:")) return null;
  if (value.kind === "contact" && !value.referenceId.startsWith("contact:")) return null;
  if (value.kind === "world-event" && !value.referenceId.startsWith("event:")) return null;
  return Object.freeze({ kind: value.kind, referenceId: value.referenceId });
}

function canonicalPlayerKnowledge(
  value: unknown,
  stateTick: number,
): DogPlayerKnowledgeState | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["facts", "version"])
    || value.version !== DOG_ACTOR_PLAYER_KNOWLEDGE_VERSION
    || !Array.isArray(value.facts)
    || value.facts.length > DOG_ACTOR_PLAYER_KNOWLEDGE_CAP
  ) return null;
  const facts: DogPlayerKnowledgeFact[] = [];
  const keys = new Set<string>();
  for (const raw of value.facts) {
    const fact = canonicalKnowledgeFact(raw, stateTick);
    if (fact === null || keys.has(fact.fact)) return null;
    keys.add(fact.fact);
    facts.push(fact);
  }
  facts.sort(compareKnowledgeStorage);
  return deepFreeze({ version: DOG_ACTOR_PLAYER_KNOWLEDGE_VERSION, facts });
}

function canonicalKnowledgeFact(
  value: unknown,
  maximumTick: number,
): DogPlayerKnowledgeFact | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "confidence",
    "evidenceId",
    "fact",
    "learnedAtTick",
    "source",
  ])) return null;
  if (
    !isKnowledgeFact(value.fact)
    || !isKnowledgeSource(value.source)
    || !validEventId(value.evidenceId)
    || !nonnegativeSafeInteger(value.learnedAtTick)
    || value.learnedAtTick > maximumTick
    || !scaledUnit(value.confidence)
  ) return null;
  return Object.freeze({
    fact: value.fact,
    source: value.source,
    evidenceId: value.evidenceId,
    learnedAtTick: value.learnedAtTick,
    confidence: value.confidence,
  });
}

function canonicalPromotion(value: unknown, stateTick: number): DogActorPromotion | null {
  if (!plainRecord(value) || !exactKeys(value, ["reason"])) return null;
  const reason = canonicalPromotionReason(value.reason, stateTick);
  return reason === null ? null : deepFreeze({ reason });
}

function canonicalPromotionReason(
  value: unknown,
  maximumTick: number,
): DogActorPromotionReason | null {
  if (!plainRecord(value) || !exactKeys(value, ["atTick", "eventId", "kind"])) return null;
  if (
    !isPromotionReason(value.kind)
    || !validEventId(value.eventId)
    || !nonnegativeSafeInteger(value.atTick)
    || value.atTick > maximumTick
  ) return null;
  return Object.freeze({ kind: value.kind, eventId: value.eventId, atTick: value.atTick });
}

function canonicalBehaviorDecision(value: unknown): DogBehaviorDecision | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "cause",
    "enteredAtTick",
    "focusBeliefKey",
    "intent",
    "nextThinkTick",
    "scores",
    "tick",
    "version",
  ])) return null;
  if (
    value.version !== DOG_BEHAVIOR_VERSION
    || !nonnegativeSafeInteger(value.tick)
    || !isIntent(value.intent)
    || !nonnegativeSafeInteger(value.enteredAtTick)
    || value.enteredAtTick > value.tick
    || !nonnegativeSafeInteger(value.nextThinkTick)
    || value.nextThinkTick <= value.tick
    || (value.focusBeliefKey !== null && !validIntentReference(value.focusBeliefKey))
    || !Array.isArray(value.scores)
    || value.scores.length !== DOG_BEHAVIOR_INTENTS.length
  ) return null;
  const cause = canonicalBehaviorCause(value.cause);
  if (cause === null) return null;
  const scoreIntents = new Set<string>();
  for (const score of value.scores) {
    if (
      !plainRecord(score)
      || !exactKeys(score, ["accessible", "intent", "score"])
      || !isIntent(score.intent)
      || scoreIntents.has(score.intent)
      || !scaledUnit(score.score)
      || typeof score.accessible !== "boolean"
    ) return null;
    scoreIntents.add(score.intent);
  }
  if (DOG_BEHAVIOR_INTENTS.some((intent) => !scoreIntents.has(intent))) return null;
  return deepFreeze(structuredClone(value) as unknown as DogBehaviorDecision);
}

function canonicalBehaviorCause(value: unknown): DogBehaviorDecision["cause"] | null {
  if (!plainRecord(value) || !exactKeys(value, ["kind", "referenceId"])) return null;
  if (!validIntentReference(value.referenceId)) return null;
  switch (value.kind) {
    case "need":
      return /^need:(company|hunger|rest|safety|thirst)$/u.test(value.referenceId)
        ? Object.freeze({ kind: value.kind, referenceId: value.referenceId })
        : null;
    case "perception":
      return Object.freeze({ kind: value.kind, referenceId: value.referenceId });
    case "condition":
      return value.referenceId.startsWith("condition:")
        ? Object.freeze({ kind: value.kind, referenceId: value.referenceId })
        : null;
    case "contact":
      return value.referenceId.startsWith("contact:")
        ? Object.freeze({ kind: value.kind, referenceId: value.referenceId })
        : null;
    case "prior-intent":
      return value.referenceId.startsWith("intent:")
        ? Object.freeze({ kind: value.kind, referenceId: value.referenceId })
        : null;
    default:
      return null;
  }
}

function persistedBehaviorCause(
  state: DogActorState,
  decision: DogBehaviorDecision,
): DogActorIntentCause {
  switch (decision.cause.kind) {
    case "prior-intent":
      return state.intent.cause;
    case "need":
    case "perception":
    case "condition":
    case "contact":
      return Object.freeze({
        kind: decision.cause.kind,
        referenceId: decision.cause.referenceId,
      });
  }
}

function rebuildState(
  state: DogActorState,
  changes: Partial<DogActorState>,
): DogActorState {
  const next = canonicalizeDogActorState({ ...state, ...changes });
  if (next === null) throw new Error("Dog actor mutation violated canonical state");
  return next;
}

function requireDogActorState(value: unknown): DogActorState {
  const state = canonicalizeDogActorState(value);
  if (state === null) throw new TypeError("Dog actor state is invalid");
  return state;
}

function compareMemoryPriority(left: DogActorMemory, right: DogActorMemory): number {
  if (left.salience !== right.salience) return right.salience - left.salience;
  if (left.atTick !== right.atTick) return right.atTick - left.atTick;
  return compareText(left.eventId, right.eventId);
}

function compareKnowledgeStorage(
  left: DogPlayerKnowledgeFact,
  right: DogPlayerKnowledgeFact,
): number {
  return compareText(left.fact, right.fact);
}

function compareKnowledgeEvidence(
  left: DogPlayerKnowledgeFact,
  right: DogPlayerKnowledgeFact,
): number {
  if (left.confidence !== right.confidence) return right.confidence - left.confidence;
  if (left.learnedAtTick !== right.learnedAtTick) return right.learnedAtTick - left.learnedAtTick;
  return compareText(left.evidenceId, right.evidenceId);
}

function knowledgeEvidenceMatches(
  memories: readonly DogActorMemory[],
  fact: DogPlayerKnowledgeFact,
): boolean {
  const evidence = memories.find(({ eventId }) => eventId === fact.evidenceId);
  if (evidence === undefined || evidence.atTick > fact.learnedAtTick) return false;
  switch (fact.source) {
    case "direct-observation":
      return evidence.kind === "identity-learning"
        && isDirectlyObservableKnowledgeFact(fact.fact);
    case "interaction":
      return evidence.kind === "human-interaction"
        || evidence.kind === "relationship"
        || evidence.kind === "identity-learning"
        // Accepting a physically committed offered meal is direct interaction
        // evidence of human familiarity, not a fact inferred from scent/ABOUT.
        || (fact.fact === "human-familiarity" && evidence.kind === "food");
    case "trusted-report":
      return evidence.kind === "ledger-event";
  }
}

function isDirectlyObservableKnowledgeFact(fact: DogPlayerKnowledgeFactKind): boolean {
  return fact === "species"
    || fact === "approximate-size"
    || fact === "coat"
    || fact === "distinguishing-mark"
    || fact === "visible-condition"
    || fact === "recognizable-individual";
}

function promotionEvidenceMatches(
  memories: readonly DogActorMemory[],
  playerKnowledge: DogPlayerKnowledgeState,
  reason: DogActorPromotionReason,
): boolean {
  const evidence = memories.find(({ eventId }) => eventId === reason.eventId);
  if (evidence === undefined || evidence.atTick > reason.atTick) return false;
  switch (reason.kind) {
    case "causal-event":
      return evidence.kind !== "identity-learning";
    case "relationship-change":
      return evidence.kind === "relationship";
    case "custody-change":
      return evidence.kind === "custody";
    case "ledger-entry":
      return evidence.kind === "ledger-event";
    case "identity-learning":
      return evidence.kind === "identity-learning"
        && playerKnowledge.facts.some((fact) =>
          fact.fact === "recognizable-individual"
          && fact.evidenceId === reason.eventId
          && fact.learnedAtTick <= reason.atTick
        );
  }
}

function retainedEvidenceEventIds(state: DogActorState): ReadonlySet<string> {
  const eventIds = new Set(state.playerKnowledge.facts.map(({ evidenceId }) => evidenceId));
  if (state.promotion !== null) eventIds.add(state.promotion.reason.eventId);
  return eventIds;
}

function retainDogActorMemories(
  values: readonly DogActorMemory[],
  retainedEventIds: ReadonlySet<string>,
): readonly DogActorMemory[] {
  const prioritized = [...values].sort(compareMemoryPriority);
  const retained = prioritized.filter(({ eventId }) => retainedEventIds.has(eventId));
  const remaining = prioritized.filter(({ eventId }) => !retainedEventIds.has(eventId));
  return [...retained, ...remaining]
    .slice(0, DOG_ACTOR_MEMORY_CAP)
    .sort(compareMemoryPriority);
}

function isIntent(value: unknown): value is DogActorIntent {
  return value === "observe"
    || value === "approach-food"
    || value === "eat"
    || value === "avoid-human"
    || value === "seek-shelter"
    || value === "retreat"
    || value === "rest"
    ;
}

function isIntentCauseKind(value: unknown): value is DogActorIntentCauseKind {
  return value === "need"
    || value === "perception"
    || value === "memory"
    || value === "condition"
    || value === "contact"
    || value === "world-event";
}

function isMemoryKind(value: unknown): value is DogActorMemoryKind {
  return value === "food"
    || value === "safety"
    || value === "human-interaction"
    || value === "relationship"
    || value === "custody"
    || value === "identity-learning"
    || value === "ledger-event";
}

function isKnowledgeFact(value: unknown): value is DogPlayerKnowledgeFactKind {
  return value === "species"
    || value === "approximate-size"
    || value === "coat"
    || value === "distinguishing-mark"
    || value === "visible-condition"
    || value === "human-familiarity"
    || value === "temperament"
    || value === "significant-history"
    || value === "recognizable-individual";
}

function isKnowledgeSource(value: unknown): value is DogPlayerKnowledgeSource {
  return value === "direct-observation"
    || value === "interaction"
    || value === "trusted-report";
}

function isPromotionReason(value: unknown): value is DogActorPromotionReasonKind {
  return value === "causal-event"
    || value === "relationship-change"
    || value === "custody-change"
    || value === "ledger-entry"
    || value === "identity-learning";
}

function validEventId(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= MAX_EVENT_ID_LENGTH
    && ID_PATTERN.test(value);
}

function validActorId(value: unknown): value is string {
  return validEventId(value);
}

function validIntentReference(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_INTENT_REFERENCE_LENGTH
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= ACTOR_PERCEPTION_SCALE;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableHash(text: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function freezeDogActorState(state: DogActorState): DogActorState {
  return deepFreeze(state);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
