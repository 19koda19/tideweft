import { hashCanonical } from "../sim/util";
import {
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

/** Versioned, bounded situated-expression state and event schema. */
export const SITUATED_EXPRESSION_VERSION = 1 as const;
/** Versioned separately so authored presentation choices remain replay-stable. */
export const SITUATED_EXPRESSION_CATALOG_VERSION = 1 as const;
export const SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT = 8 as const;
export const SITUATED_EXPRESSION_MAX_DURATION_STEPS = 120 as const;

export const SITUATED_EXPRESSION_MEANINGS = Object.freeze([
  "steady-after-stumble",
  "relief-after-near-fall",
  "protect-important-cargo",
  "alarm-at-cargo-loss",
  "relief-after-cargo-recovery",
  "porter-heavy-load",
  "guardian-dog-warning",
  "guardian-dog-defensive-growl",
  "guardian-dog-shelter-whine",
] as const);
export type SituatedExpressionMeaning = (typeof SITUATED_EXPRESSION_MEANINGS)[number];

export const SITUATED_EXPRESSION_FAMILIES = Object.freeze([
  "footing",
  "cargo",
  "work",
  "animal-signal",
] as const);
export type SituatedExpressionFamily = (typeof SITUATED_EXPRESSION_FAMILIES)[number];

export const SITUATED_EXPRESSION_TONES = Object.freeze([
  "restrained",
  "strained",
  "alarmed",
  "relieved",
] as const);
export type SituatedExpressionTone = (typeof SITUATED_EXPRESSION_TONES)[number];

export const SITUATED_EXPRESSION_VOLUMES = Object.freeze([
  "murmur",
  "spoken",
  "shout",
] as const);
export type SituatedExpressionVolume = (typeof SITUATED_EXPRESSION_VOLUMES)[number];

export const SITUATED_EXPRESSION_KNOWLEDGE_BASES = Object.freeze([
  "self-felt-stumble",
  "self-felt-near-fall",
  "self-observed-cargo-risk",
  "self-observed-cargo-loss",
  "self-recovered-cargo",
  "self-handled-heavy-cargo",
  "self-heard-anonymous-alarm",
  "self-perceived-threat",
  "self-weather-distress",
] as const);
export type SituatedExpressionKnowledgeBasis =
  (typeof SITUATED_EXPRESSION_KNOWLEDGE_BASES)[number];

/** Renderer/audio-neutral contour; no consumer needs to inspect English prose. */
export type SituatedExpressionVocalization =
  | "steady"
  | "strained"
  | "alarm"
  | "relief"
  | "dog-warning-bark"
  | "dog-defensive-growl"
  | "dog-shelter-whine";

/**
 * A semantic request to the kernel. The caller supplies only facts it is
 * authoritative for; the kernel selects a stable authored realization.
 */
export interface SituatedExpressionIntent {
  readonly version: typeof SITUATED_EXPRESSION_VERSION;
  readonly sourceActorId: string;
  readonly triggerEventId: string;
  readonly position: WorldPosition;
  readonly meaning: SituatedExpressionMeaning;
  readonly family: SituatedExpressionFamily;
  readonly tone: SituatedExpressionTone;
  readonly volume: SituatedExpressionVolume;
  readonly knowledgeBasis: SituatedExpressionKnowledgeBasis;
  /** Integer policy priority in the inclusive range 0..1,000,000. */
  readonly priority: number;
  /** Integer presentation salience in the inclusive range 0..1,000,000. */
  readonly salience: number;
  /** Unsigned 32-bit authored-variant seed; never durable event identity. */
  readonly variantSeed: number;
  readonly durationSteps: number;
}

/**
 * One accepted situated expression. English text is deliberately absent:
 * `realizationKey` is the only stored reference to an authored line.
 */
export interface SituatedExpressionEvent {
  readonly version: typeof SITUATED_EXPRESSION_VERSION;
  readonly catalogVersion: typeof SITUATED_EXPRESSION_CATALOG_VERSION;
  readonly eventId: string;
  readonly sourceActorId: string;
  readonly triggerEventId: string;
  readonly position: WorldPosition;
  readonly meaning: SituatedExpressionMeaning;
  readonly family: SituatedExpressionFamily;
  readonly tone: SituatedExpressionTone;
  readonly volume: SituatedExpressionVolume;
  readonly knowledgeBasis: SituatedExpressionKnowledgeBasis;
  readonly vocalization: SituatedExpressionVocalization;
  readonly priority: number;
  readonly salience: number;
  readonly variantSeed: number;
  readonly realizationKey: string;
  readonly durationSteps: number;
  readonly remainingSteps: number;
  readonly audioAcknowledged: boolean;
}

/** Bounded anti-repetition evidence, never a substitute for long-term memory. */
export interface SituatedExpressionMemory {
  readonly sourceActorId: string;
  readonly triggerEventId: string;
  readonly meaning: SituatedExpressionMeaning;
  readonly family: SituatedExpressionFamily;
  readonly priority: number;
  readonly meaningCooldownRemainingSteps: number;
  readonly familyCooldownRemainingSteps: number;
}

export interface SituatedExpressionState {
  readonly version: typeof SITUATED_EXPRESSION_VERSION;
  readonly completedSteps: number;
  readonly active: SituatedExpressionEvent | null;
  readonly recent: readonly SituatedExpressionMemory[];
}

export type SituatedExpressionSilenceReason =
  | "invalid-state"
  | "invalid-intent"
  | "duplicate-trigger"
  | "meaning-cooldown"
  | "family-cooldown"
  | "active-expression-has-priority";

export type SituatedExpressionReductionReason =
  | "accepted"
  | "interrupted"
  | SituatedExpressionSilenceReason;

export interface SituatedExpressionReduction {
  /** True only when `event` became the new active expression. */
  readonly accepted: boolean;
  readonly reason: SituatedExpressionReductionReason;
  readonly silenceReason: SituatedExpressionSilenceReason | null;
  /** Null only when the supplied state itself was malformed. */
  readonly state: SituatedExpressionState | null;
  readonly event: SituatedExpressionEvent | null;
}

export type SituatedExpressionAcknowledgementReason =
  | "acknowledged"
  | "already-acknowledged"
  | "no-active-expression"
  | "invalid-state";

export interface SituatedExpressionAcknowledgement {
  readonly reason: SituatedExpressionAcknowledgementReason;
  readonly state: SituatedExpressionState | null;
  /** Present exactly once for one active expression. */
  readonly event: SituatedExpressionEvent | null;
}

export interface SituatedExpressionProjection {
  readonly text: string;
  readonly realizationKey: string;
  /** Species-specific contour override; ordinary human lines follow tone. */
  readonly vocalization: SituatedExpressionVocalization;
}

interface SemanticLaw {
  readonly family: SituatedExpressionFamily;
  readonly knowledgeBasis: SituatedExpressionKnowledgeBasis;
  readonly tones: ReadonlySet<SituatedExpressionTone>;
  readonly volumes: ReadonlySet<SituatedExpressionVolume>;
  readonly vocalization?: SituatedExpressionVocalization;
  readonly meaningCooldownSteps: number;
  readonly familyCooldownSteps: number;
}

export interface SituatedExpressionCooldownSteps {
  readonly meaning: number;
  readonly family: number;
}

const SEMANTIC_LAWS: Readonly<Record<SituatedExpressionMeaning, SemanticLaw>> = Object.freeze({
  "steady-after-stumble": Object.freeze({
    family: "footing",
    knowledgeBasis: "self-felt-stumble",
    tones: new Set<SituatedExpressionTone>(["restrained", "strained"]),
    volumes: new Set<SituatedExpressionVolume>(["murmur", "spoken"]),
    meaningCooldownSteps: 12,
    familyCooldownSteps: 4,
  }),
  "relief-after-near-fall": Object.freeze({
    family: "footing",
    knowledgeBasis: "self-felt-near-fall",
    tones: new Set<SituatedExpressionTone>(["strained", "relieved"]),
    volumes: new Set<SituatedExpressionVolume>(["murmur", "spoken"]),
    meaningCooldownSteps: 16,
    familyCooldownSteps: 6,
  }),
  "protect-important-cargo": Object.freeze({
    family: "cargo",
    knowledgeBasis: "self-observed-cargo-risk",
    tones: new Set<SituatedExpressionTone>(["restrained", "strained", "alarmed"]),
    volumes: new Set<SituatedExpressionVolume>(["murmur", "spoken", "shout"]),
    meaningCooldownSteps: 12,
    familyCooldownSteps: 4,
  }),
  "alarm-at-cargo-loss": Object.freeze({
    family: "cargo",
    knowledgeBasis: "self-observed-cargo-loss",
    tones: new Set<SituatedExpressionTone>(["alarmed"]),
    volumes: new Set<SituatedExpressionVolume>(["spoken", "shout"]),
    meaningCooldownSteps: 20,
    familyCooldownSteps: 8,
  }),
  "relief-after-cargo-recovery": Object.freeze({
    family: "cargo",
    knowledgeBasis: "self-recovered-cargo",
    tones: new Set<SituatedExpressionTone>(["restrained", "relieved"]),
    volumes: new Set<SituatedExpressionVolume>(["murmur", "spoken"]),
    meaningCooldownSteps: 14,
    familyCooldownSteps: 5,
  }),
  "porter-heavy-load": Object.freeze({
    family: "work",
    knowledgeBasis: "self-handled-heavy-cargo",
    tones: new Set<SituatedExpressionTone>(["strained"]),
    volumes: new Set<SituatedExpressionVolume>(["murmur", "spoken"]),
    meaningCooldownSteps: 30,
    familyCooldownSteps: 10,
  }),
  "guardian-dog-warning": Object.freeze({
    family: "animal-signal",
    knowledgeBasis: "self-heard-anonymous-alarm",
    tones: new Set<SituatedExpressionTone>(["alarmed"]),
    volumes: new Set<SituatedExpressionVolume>(["shout"]),
    vocalization: "dog-warning-bark",
    meaningCooldownSteps: 24,
    familyCooldownSteps: 12,
  }),
  "guardian-dog-defensive-growl": Object.freeze({
    family: "animal-signal",
    knowledgeBasis: "self-perceived-threat",
    tones: new Set<SituatedExpressionTone>(["restrained"]),
    volumes: new Set<SituatedExpressionVolume>(["spoken"]),
    vocalization: "dog-defensive-growl",
    meaningCooldownSteps: 24,
    familyCooldownSteps: 12,
  }),
  "guardian-dog-shelter-whine": Object.freeze({
    family: "animal-signal",
    knowledgeBasis: "self-weather-distress",
    tones: new Set<SituatedExpressionTone>(["restrained"]),
    volumes: new Set<SituatedExpressionVolume>(["murmur"]),
    vocalization: "dog-shelter-whine",
    meaningCooldownSteps: 24,
    familyCooldownSteps: 12,
  }),
});

/** Returns the fixed cooldown origin used to authenticate bounded recent memory. */
export function situatedExpressionCooldownSteps(
  meaning: unknown,
): SituatedExpressionCooldownSteps | null {
  if (!isMeaning(meaning)) return null;
  const law = SEMANTIC_LAWS[meaning];
  return Object.freeze({
    meaning: law.meaningCooldownSteps,
    family: law.familyCooldownSteps,
  });
}

/** Derives the stable event identity shared by active events and recent memory. */
export function situatedExpressionEventIdForTrigger(
  sourceActorId: unknown,
  triggerEventId: unknown,
): string | null {
  if (!validId(sourceActorId) || !validId(triggerEventId)) return null;
  return eventIdFor(sourceActorId, triggerEventId);
}

interface PresentationRealization {
  readonly key: string;
  readonly text: string;
}

/* Authored English exists only at this presentation boundary. */
const PRESENTATION_REALIZATIONS: Readonly<
  Record<SituatedExpressionMeaning, readonly PresentationRealization[]>
> = Object.freeze({
  "steady-after-stumble": Object.freeze([
    Object.freeze({ key: "situated-expression.en.v1.steady-after-stumble.0", text: "Steady." }),
    Object.freeze({ key: "situated-expression.en.v1.steady-after-stumble.1", text: "Easy." }),
    Object.freeze({ key: "situated-expression.en.v1.steady-after-stumble.2", text: "Careful now." }),
  ]),
  "relief-after-near-fall": Object.freeze([
    Object.freeze({ key: "situated-expression.en.v1.relief-after-near-fall.0", text: "That was close." }),
    Object.freeze({ key: "situated-expression.en.v1.relief-after-near-fall.1", text: "Still here." }),
    Object.freeze({ key: "situated-expression.en.v1.relief-after-near-fall.2", text: "Nearly had me." }),
  ]),
  "protect-important-cargo": Object.freeze([
    Object.freeze({ key: "situated-expression.en.v1.protect-important-cargo.0", text: "Keep the load close." }),
    Object.freeze({ key: "situated-expression.en.v1.protect-important-cargo.1", text: "Hold fast." }),
    Object.freeze({ key: "situated-expression.en.v1.protect-important-cargo.2", text: "Mind the cargo." }),
  ]),
  "alarm-at-cargo-loss": Object.freeze([
    Object.freeze({ key: "situated-expression.en.v1.alarm-at-cargo-loss.0", text: "Cargo down!" }),
    Object.freeze({ key: "situated-expression.en.v1.alarm-at-cargo-loss.1", text: "The load's loose!" }),
    Object.freeze({ key: "situated-expression.en.v1.alarm-at-cargo-loss.2", text: "We've lost cargo!" }),
  ]),
  "relief-after-cargo-recovery": Object.freeze([
    Object.freeze({ key: "situated-expression.en.v1.relief-after-cargo-recovery.0", text: "Got it back." }),
    Object.freeze({ key: "situated-expression.en.v1.relief-after-cargo-recovery.1", text: "Cargo secured." }),
    Object.freeze({ key: "situated-expression.en.v1.relief-after-cargo-recovery.2", text: "That's recovered." }),
  ]),
  "porter-heavy-load": Object.freeze([
    Object.freeze({ key: "situated-expression.en.v1.porter-heavy-load.0", text: "Heavy one." }),
    Object.freeze({ key: "situated-expression.en.v1.porter-heavy-load.1", text: "Got it." }),
    Object.freeze({ key: "situated-expression.en.v1.porter-heavy-load.2", text: "Easy." }),
  ]),
  "guardian-dog-warning": Object.freeze([
    Object.freeze({
      key: "situated-expression.en.v1.guardian-dog-warning.0",
      text: "BARK!",
    }),
  ]),
  "guardian-dog-defensive-growl": Object.freeze([
    Object.freeze({
      key: "situated-expression.en.v1.guardian-dog-defensive-growl.0",
      text: "GRRRR.",
    }),
  ]),
  "guardian-dog-shelter-whine": Object.freeze([
    Object.freeze({
      key: "situated-expression.en.v1.guardian-dog-shelter-whine.0",
      text: "WHINE...",
    }),
  ]),
});

/** Creates an empty, immutable expression channel. */
export function createSituatedExpressionState(completedSteps = 0): SituatedExpressionState {
  if (!canonicalNonnegativeInteger(completedSteps)) {
    throw new RangeError("Situated expression completed steps must be a nonnegative safe integer");
  }
  return freezeState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps,
    active: null,
    recent: [],
  });
}

/**
 * Admits an exact version-1 state without repairing or rerolling it. Save and
 * transaction owners use this boundary so active presentation, audio
 * acknowledgement, and semantic cooldowns resume deterministically.
 */
export function canonicalizeSituatedExpressionState(
  value: unknown,
): SituatedExpressionState | null {
  return canonicalState(value);
}

/**
 * Advances only simulation steps. Rendering frequency and wall-clock time
 * cannot expire an expression or its semantic cooldowns.
 */
export function advanceSituatedExpression(
  value: unknown,
  steps = 1,
): SituatedExpressionState | null {
  const state = canonicalState(value);
  if (state === null || !canonicalNonnegativeInteger(steps)) return null;
  if (steps === 0) return state;

  const active = state.active === null || steps >= state.active.remainingSteps
    ? null
    : freezeEvent({
      ...state.active,
      remainingSteps: state.active.remainingSteps - steps,
    });
  const recent = state.recent.map((entry) => freezeMemory({
    ...entry,
    meaningCooldownRemainingSteps: subtractFloorZero(
      entry.meaningCooldownRemainingSteps,
      steps,
    ),
    familyCooldownRemainingSteps: subtractFloorZero(
      entry.familyCooldownRemainingSteps,
      steps,
    ),
  }));

  return freezeState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: saturatingAdd(state.completedSteps, steps),
    active,
    recent,
  });
}

/**
 * Reduces one semantic intent into either one active expression or explicit
 * silence. The function has no global RNG, counter, clock, or mutable cache.
 */
export function reduceSituatedExpression(
  stateValue: unknown,
  intentValue: unknown,
): SituatedExpressionReduction {
  const state = canonicalState(stateValue);
  if (state === null) return silentReduction(null, "invalid-state");
  const intent = canonicalIntent(intentValue);
  if (intent === null) return silentReduction(state, "invalid-intent");

  if (state.recent.some((entry) => sameTrigger(entry, intent))) {
    return silentReduction(state, "duplicate-trigger");
  }
  if (state.recent.some((entry) => (
    entry.sourceActorId === intent.sourceActorId
      && entry.meaning === intent.meaning
      && entry.meaningCooldownRemainingSteps > 0
  ))) {
    return silentReduction(state, "meaning-cooldown");
  }
  const resolvesRecentCargoLoss = intentResolvesRecentCargoLoss(state, intent);
  if (state.recent.some((entry) => (
    entry.sourceActorId === intent.sourceActorId
      && entry.family === intent.family
      && entry.familyCooldownRemainingSteps > 0
      && intent.priority <= entry.priority
  )) && !resolvesRecentCargoLoss) {
    return silentReduction(state, "family-cooldown");
  }
  if (
    state.active !== null
    && !canInterrupt(state.active, intent)
    && !intentResolvesCargoLoss(state.active, intent)
  ) {
    return silentReduction(state, "active-expression-has-priority");
  }

  const event = eventFor(intent);
  const law = SEMANTIC_LAWS[intent.meaning];
  const memory = freezeMemory({
    sourceActorId: intent.sourceActorId,
    triggerEventId: intent.triggerEventId,
    meaning: intent.meaning,
    family: intent.family,
    priority: intent.priority,
    meaningCooldownRemainingSteps: law.meaningCooldownSteps,
    familyCooldownRemainingSteps: law.familyCooldownSteps,
  });
  const recent = Object.freeze([
    memory,
    ...state.recent,
  ].slice(0, SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT));
  const next = freezeState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: state.completedSteps,
    active: event,
    recent,
  });
  const reason = state.active === null ? "accepted" : "interrupted";
  return Object.freeze({
    accepted: true,
    reason,
    silenceReason: null,
    state: next,
    event,
  });
}

/** Claims the active event for audio exactly once without consuming its text projection. */
export function acknowledgeSituatedExpression(
  value: unknown,
): SituatedExpressionAcknowledgement {
  const state = canonicalState(value);
  if (state === null) {
    return Object.freeze({ reason: "invalid-state", state: null, event: null });
  }
  if (state.active === null) {
    return Object.freeze({ reason: "no-active-expression", state, event: null });
  }
  if (state.active.audioAcknowledged) {
    return Object.freeze({ reason: "already-acknowledged", state, event: null });
  }

  const event = freezeEvent({ ...state.active, audioAcknowledged: true });
  const next = freezeState({ ...state, active: event });
  return Object.freeze({ reason: "acknowledged", state: next, event });
}

/** Resolves a validated realization key at the presentation boundary only. */
export function projectSituatedExpression(value: unknown): SituatedExpressionProjection | null {
  const event = canonicalEvent(value);
  if (event === null) return null;
  const realization = PRESENTATION_REALIZATIONS[event.meaning]
    .find(({ key }) => key === event.realizationKey);
  if (realization === undefined) return null;
  return Object.freeze({
    text: realization.text,
    realizationKey: realization.key,
    vocalization: event.vocalization,
  });
}

function eventFor(intent: SituatedExpressionIntent): SituatedExpressionEvent {
  const realization = selectRealization(intent);
  return freezeEvent({
    version: SITUATED_EXPRESSION_VERSION,
    catalogVersion: SITUATED_EXPRESSION_CATALOG_VERSION,
    eventId: eventIdFor(intent.sourceActorId, intent.triggerEventId),
    sourceActorId: intent.sourceActorId,
    triggerEventId: intent.triggerEventId,
    position: intent.position,
    meaning: intent.meaning,
    family: intent.family,
    tone: intent.tone,
    volume: intent.volume,
    knowledgeBasis: intent.knowledgeBasis,
    vocalization: vocalizationFor(intent),
    priority: intent.priority,
    salience: intent.salience,
    variantSeed: intent.variantSeed,
    realizationKey: realization.key,
    durationSteps: intent.durationSteps,
    remainingSteps: intent.durationSteps,
    audioAcknowledged: false,
  });
}

function selectRealization(intent: Pick<
  SituatedExpressionIntent,
  "meaning" | "sourceActorId" | "triggerEventId" | "variantSeed"
>): PresentationRealization {
  const pool = PRESENTATION_REALIZATIONS[intent.meaning];
  const hash = hashCanonical({
    catalogVersion: SITUATED_EXPRESSION_CATALOG_VERSION,
    sourceActorId: intent.sourceActorId,
    triggerEventId: intent.triggerEventId,
    variantSeed: intent.variantSeed,
  });
  const lane = Number.parseInt(hash.slice(-8), 16) >>> 0;
  const realization = pool[lane % pool.length];
  if (realization === undefined) throw new Error("Situated expression catalog is empty");
  return realization;
}

function eventIdFor(sourceActorId: string, triggerEventId: string): string {
  return `situated-expression:event:v${SITUATED_EXPRESSION_VERSION}:${hashCanonical({
    sourceActorId,
    triggerEventId,
    version: SITUATED_EXPRESSION_VERSION,
  })}`;
}

function canInterrupt(
  active: SituatedExpressionEvent,
  candidate: SituatedExpressionIntent,
): boolean {
  return candidate.priority > active.priority
    || (candidate.priority === active.priority && candidate.salience > active.salience);
}

function vocalizationFor(
  value: Pick<SituatedExpressionIntent, "meaning" | "tone">,
): SituatedExpressionVocalization {
  const override = SEMANTIC_LAWS[value.meaning].vocalization;
  if (override !== undefined) return override;
  switch (value.tone) {
    case "restrained": return "steady";
    case "strained": return "strained";
    case "alarmed": return "alarm";
    case "relieved": return "relief";
  }
}

/** A committed recovery resolves the alarm; it is not repetitive cargo chatter. */
function intentResolvesRecentCargoLoss(
  state: SituatedExpressionState,
  candidate: SituatedExpressionIntent,
): boolean {
  return state.recent.some((entry) => intentResolvesCargoLoss(entry, candidate));
}

function intentResolvesCargoLoss(
  prior: Pick<SituatedExpressionMemory, "sourceActorId" | "meaning" | "family">,
  candidate: SituatedExpressionIntent,
): boolean {
  return candidate.meaning === "relief-after-cargo-recovery"
    && candidate.family === "cargo"
    && prior.sourceActorId === candidate.sourceActorId
    && prior.meaning === "alarm-at-cargo-loss"
    && prior.family === "cargo";
}

function sameTrigger(
  entry: SituatedExpressionMemory,
  intent: SituatedExpressionIntent,
): boolean {
  return entry.sourceActorId === intent.sourceActorId
    && entry.triggerEventId === intent.triggerEventId;
}

function silentReduction(
  state: SituatedExpressionState | null,
  reason: SituatedExpressionSilenceReason,
): SituatedExpressionReduction {
  return Object.freeze({
    accepted: false,
    reason,
    silenceReason: reason,
    state,
    event: null,
  });
}

function canonicalState(value: unknown): SituatedExpressionState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "active",
    "completedSteps",
    "recent",
    "version",
  ])) return null;
  if (
    value.version !== SITUATED_EXPRESSION_VERSION
    || !canonicalNonnegativeInteger(value.completedSteps)
    || !Array.isArray(value.recent)
    || value.recent.length > SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT
  ) return null;

  const active = value.active === null ? null : canonicalEvent(value.active);
  if (value.active !== null && active === null) return null;
  const recent: SituatedExpressionMemory[] = [];
  const triggerKeys = new Set<string>();
  for (let index = 0; index < value.recent.length; index += 1) {
    if (!(index in value.recent)) return null;
    const memory = canonicalMemory(value.recent[index]);
    if (memory === null) return null;
    const triggerKey = `${memory.sourceActorId}\u0000${memory.triggerEventId}`;
    if (triggerKeys.has(triggerKey)) return null;
    triggerKeys.add(triggerKey);
    recent.push(memory);
  }
  if (active !== null && !recent.some((entry) => (
    entry.sourceActorId === active.sourceActorId
      && entry.triggerEventId === active.triggerEventId
      && entry.meaning === active.meaning
      && entry.family === active.family
      && entry.priority === active.priority
  ))) return null;

  return freezeState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: value.completedSteps,
    active,
    recent,
  });
}

function canonicalIntent(value: unknown): SituatedExpressionIntent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "durationSteps",
    "family",
    "knowledgeBasis",
    "meaning",
    "position",
    "priority",
    "salience",
    "sourceActorId",
    "tone",
    "triggerEventId",
    "variantSeed",
    "version",
    "volume",
  ])) return null;
  if (
    value.version !== SITUATED_EXPRESSION_VERSION
    || !validId(value.sourceActorId)
    || !validId(value.triggerEventId)
    || !isWorldPosition(value.position)
    || !isMeaning(value.meaning)
    || !isFamily(value.family)
    || !isTone(value.tone)
    || !isVolume(value.volume)
    || !isKnowledgeBasis(value.knowledgeBasis)
    || !canonicalBoundedUnit(value.priority)
    || !canonicalBoundedUnit(value.salience)
    || !canonicalUint32(value.variantSeed)
    || !canonicalPositiveInteger(value.durationSteps)
    || value.durationSteps > SITUATED_EXPRESSION_MAX_DURATION_STEPS
  ) return null;
  const law = SEMANTIC_LAWS[value.meaning];
  if (
    value.family !== law.family
    || value.knowledgeBasis !== law.knowledgeBasis
    || !law.tones.has(value.tone)
    || !law.volumes.has(value.volume)
  ) return null;

  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    position: clonePosition(value.position),
    meaning: value.meaning,
    family: value.family,
    tone: value.tone,
    volume: value.volume,
    knowledgeBasis: value.knowledgeBasis,
    priority: value.priority,
    salience: value.salience,
    variantSeed: value.variantSeed,
    durationSteps: value.durationSteps,
  });
}

function canonicalEvent(value: unknown): SituatedExpressionEvent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "audioAcknowledged",
    "catalogVersion",
    "durationSteps",
    "eventId",
    "family",
    "knowledgeBasis",
    "meaning",
    "position",
    "priority",
    "realizationKey",
    "remainingSteps",
    "salience",
    "sourceActorId",
    "tone",
    "triggerEventId",
    "variantSeed",
    "version",
    "vocalization",
    "volume",
  ])) return null;
  if (
    value.version !== SITUATED_EXPRESSION_VERSION
    || value.catalogVersion !== SITUATED_EXPRESSION_CATALOG_VERSION
    || !validId(value.eventId)
    || !validId(value.sourceActorId)
    || !validId(value.triggerEventId)
    || !isWorldPosition(value.position)
    || !isMeaning(value.meaning)
    || !isFamily(value.family)
    || !isTone(value.tone)
    || !isVolume(value.volume)
    || !isKnowledgeBasis(value.knowledgeBasis)
    || !isVocalization(value.vocalization)
    || !canonicalBoundedUnit(value.priority)
    || !canonicalBoundedUnit(value.salience)
    || !canonicalUint32(value.variantSeed)
    || !validId(value.realizationKey)
    || !canonicalPositiveInteger(value.durationSteps)
    || value.durationSteps > SITUATED_EXPRESSION_MAX_DURATION_STEPS
    || !canonicalPositiveInteger(value.remainingSteps)
    || value.remainingSteps > value.durationSteps
    || typeof value.audioAcknowledged !== "boolean"
  ) return null;

  const law = SEMANTIC_LAWS[value.meaning];
  const expectedRealization = selectRealization({
    meaning: value.meaning,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    variantSeed: value.variantSeed,
  });
  if (
    value.family !== law.family
    || value.knowledgeBasis !== law.knowledgeBasis
    || !law.tones.has(value.tone)
    || !law.volumes.has(value.volume)
    || value.vocalization !== vocalizationFor({
      meaning: value.meaning,
      tone: value.tone,
    })
    || value.eventId !== eventIdFor(value.sourceActorId, value.triggerEventId)
    || value.realizationKey !== expectedRealization.key
  ) return null;

  return freezeEvent({
    version: SITUATED_EXPRESSION_VERSION,
    catalogVersion: SITUATED_EXPRESSION_CATALOG_VERSION,
    eventId: value.eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    position: clonePosition(value.position),
    meaning: value.meaning,
    family: value.family,
    tone: value.tone,
    volume: value.volume,
    knowledgeBasis: value.knowledgeBasis,
    vocalization: value.vocalization,
    priority: value.priority,
    salience: value.salience,
    variantSeed: value.variantSeed,
    realizationKey: value.realizationKey,
    durationSteps: value.durationSteps,
    remainingSteps: value.remainingSteps,
    audioAcknowledged: value.audioAcknowledged,
  });
}

function canonicalMemory(value: unknown): SituatedExpressionMemory | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "family",
    "familyCooldownRemainingSteps",
    "meaning",
    "meaningCooldownRemainingSteps",
    "priority",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  if (
    !validId(value.sourceActorId)
    || !validId(value.triggerEventId)
    || !isMeaning(value.meaning)
    || !isFamily(value.family)
    || !canonicalBoundedUnit(value.priority)
    || !canonicalNonnegativeInteger(value.meaningCooldownRemainingSteps)
    || !canonicalNonnegativeInteger(value.familyCooldownRemainingSteps)
  ) return null;
  const law = SEMANTIC_LAWS[value.meaning];
  if (
    value.family !== law.family
    || value.meaningCooldownRemainingSteps > law.meaningCooldownSteps
    || value.familyCooldownRemainingSteps > law.familyCooldownSteps
  ) return null;
  return freezeMemory({
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    meaning: value.meaning,
    family: value.family,
    priority: value.priority,
    meaningCooldownRemainingSteps: value.meaningCooldownRemainingSteps,
    familyCooldownRemainingSteps: value.familyCooldownRemainingSteps,
  });
}

function freezeState(value: SituatedExpressionState): SituatedExpressionState {
  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: value.completedSteps,
    active: value.active,
    recent: Object.freeze([...value.recent]),
  });
}

function freezeEvent(value: SituatedExpressionEvent): SituatedExpressionEvent {
  return Object.freeze({ ...value, position: clonePosition(value.position) });
}

function freezeMemory(value: SituatedExpressionMemory): SituatedExpressionMemory {
  return Object.freeze({ ...value });
}

function clonePosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(position.region, position.localX, position.localY);
}

function subtractFloorZero(value: number, decrement: number): number {
  return decrement >= value ? 0 : value - decrement;
}

function saturatingAdd(left: number, right: number): number {
  return right > Number.MAX_SAFE_INTEGER - left ? Number.MAX_SAFE_INTEGER : left + right;
}

function isMeaning(value: unknown): value is SituatedExpressionMeaning {
  return typeof value === "string"
    && SITUATED_EXPRESSION_MEANINGS.includes(value as SituatedExpressionMeaning);
}

function isFamily(value: unknown): value is SituatedExpressionFamily {
  return typeof value === "string"
    && SITUATED_EXPRESSION_FAMILIES.includes(value as SituatedExpressionFamily);
}

function isTone(value: unknown): value is SituatedExpressionTone {
  return typeof value === "string"
    && SITUATED_EXPRESSION_TONES.includes(value as SituatedExpressionTone);
}

function isVolume(value: unknown): value is SituatedExpressionVolume {
  return typeof value === "string"
    && SITUATED_EXPRESSION_VOLUMES.includes(value as SituatedExpressionVolume);
}

function isKnowledgeBasis(value: unknown): value is SituatedExpressionKnowledgeBasis {
  return typeof value === "string"
    && SITUATED_EXPRESSION_KNOWLEDGE_BASES.includes(value as SituatedExpressionKnowledgeBasis);
}

function isVocalization(value: unknown): value is SituatedExpressionVocalization {
  return value === "steady"
    || value === "strained"
    || value === "alarm"
    || value === "relief"
    || value === "dog-warning-bark"
    || value === "dog-defensive-growl"
    || value === "dog-shelter-whine";
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function canonicalNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= 0;
}

function canonicalPositiveInteger(value: unknown): value is number {
  return canonicalNonnegativeInteger(value) && value > 0;
}

function canonicalBoundedUnit(value: unknown): value is number {
  return canonicalNonnegativeInteger(value) && value <= 1_000_000;
}

function canonicalUint32(value: unknown): value is number {
  return canonicalNonnegativeInteger(value) && value <= 0xffff_ffff;
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
