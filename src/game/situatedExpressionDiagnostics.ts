import type { ActorBelief } from "../sim/actorPerception";
import type { ResidentState } from "../sim/types";
import { stableStringify } from "../sim/util";
import { HUMAN_PERCEPTION_MAX_RESIDENTS, HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES,
  type HumanSupplementalListeningReceipt } from "./humanPerception";
import { EXPRESSION_KNOWLEDGE_SOURCE_MEANINGS, expressionKnowledgeListenerIssues,
  type ExpressionKnowledgeSourceCheck, type ExpressionKnowledgeListenerAudit } from "./situatedExpressionKnowledgeAudit";
import { evaluateAudibleContact, type AudibleContact, type AudibleContactInput } from "./perception";
import { SERIOUS_FALL_HAZARD } from "./fallRisk";
import { animalCallRecognitionForVocalization } from "./playerAnimalCallKnowledge";
import {
  guardianDogShelterWhineExpressionIntent,
  type GuardianDogShelterWhineExpressionInput,
} from "./dogSignalExpression";
import {
  playerTraversalExpressionIntent,
  type PlayerTraversalExpressionInput,
} from "./playerTraversalExpression";
import {
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionProjection,
  type SituatedExpressionState,
} from "./situatedExpression";
import type { SituatedExpressionAdmissionRecord } from "./situatedExpressionAdmissionLedger";
import type { SituatedExpressionChannelBankReductionReason } from "./situatedExpressionChannelBank";
import { canonicalizeSituatedExpressionReception, type SituatedExpressionReception } from "./situatedExpressionReception";

/** Development evidence only: never a save root, command, or hearing authority. */
export const EXPRESSION_DIAGNOSTIC_CAPACITY = 64;

export type ExpressionDiagnosticReason = SituatedExpressionChannelBankReductionReason
  | "sound-budget"
  | "footing-recency"
  | "effort-recency"
  | "prepared-introduction-committed"
  | "porter-not-heard-or-visible";

/** Exact already-applied domain facts, not a configurable gameplay command. */
export type ExpressionDiagnosticProducerContext = Readonly<{
  readonly kind: "player-traversal";
  readonly input: PlayerTraversalExpressionInput;
}> | Readonly<{
  readonly kind: "guardian-dog-shelter-whine";
  readonly input: GuardianDogShelterWhineExpressionInput;
}>;

/** One already-evaluated player contact, not an authoritative hearing receipt. */
export interface ExpressionDiagnosticListeningContext {
  readonly input: AudibleContactInput;
  readonly contact: AudibleContact | null;
}

export interface ExpressionDiagnosticInput {
  readonly completedTick: number;
  readonly playerStepPhase: number;
  readonly intent: SituatedExpressionIntent;
  /** Source-local state before the decision, not the whole actor/world graph. */
  readonly priorState: SituatedExpressionState;
  readonly reason: ExpressionDiagnosticReason;
  readonly event: SituatedExpressionEvent | null;
  readonly admission: SituatedExpressionAdmissionRecord | null;
  /**
   * The retained player receipt. Null can mean refused admission; it proves
   * neither inaudibility nor absence of fallback audio or other listeners.
   */
  readonly playerReception: SituatedExpressionReception | null;
  /** Supplied only when the producer already owns this exact causal belief. */
  readonly sourceBelief: ActorBelief | null;
  readonly weather: string;
  /** Authenticated contextual wording, only when the producer supplies it. */
  readonly contextualText?: string | null;
  /** Only supported producers supply their existing event-time inputs. */
  readonly producerContext?: ExpressionDiagnosticProducerContext | null;
  /** Null/absent is uncaptured; a captured null contact is valid inaudibility. */
  readonly listeningContext?: ExpressionDiagnosticListeningContext | null;
  /** Small verdict from an existing event-time validator, not a world snapshot. */
  readonly knowledgeSource?: ExpressionKnowledgeSourceCheck | null;
}

export interface ExpressionDiagnosticRecord extends ExpressionDiagnosticInput {
  readonly sequence: number;
  /** Catalog realization; contextual speech may replace its neutral wording. */
  readonly realization: SituatedExpressionProjection | null;
  readonly contextualText: string | null;
  readonly producerContext: ExpressionDiagnosticProducerContext | null;
  readonly listeningContext: ExpressionDiagnosticListeningContext | null;
  readonly knowledgeSource: ExpressionKnowledgeSourceCheck | null;
  /** Null means this record has not captured a selected human listening frame. */
  readonly humanListeners: readonly ExpressionKnowledgeListenerAudit[] | null;
}

export interface ExpressionDiagnosticQuery {
  readonly sourceActorId?: string;
  readonly triggerEventId?: string;
  readonly meaning?: SituatedExpressionIntent["meaning"];
  readonly reason?: ExpressionDiagnosticReason;
}

export interface ExpressionDiagnosticSnapshot {
  readonly enabled: boolean;
  readonly capacity: typeof EXPRESSION_DIAGNOSTIC_CAPACITY;
  readonly totalCount: number;
  readonly evictedCount: number;
  readonly records: readonly ExpressionDiagnosticRecord[];
  readonly repetition: ExpressionDiagnosticRepetitionState;
}

/** First-seen keys are retained; overflow is counted, never silently discarded. */
export interface ExpressionDiagnosticRepetitionCounts {
  readonly entries: readonly Readonly<{ key: string; count: number }>[];
  readonly untrackedCount: number;
}

/** Capture-period decision totals, not unique sound, audio or caption counts. */
export interface ExpressionDiagnosticRepetitionState {
  readonly acceptedFixedSteps: number;
  readonly acceptedSimulationMs: number;
  readonly admittedDecisions: number;
  /** Closed current vocal families only; body thumps and human contours are excluded. */
  readonly admittedAnimalVocalDecisions: number;
  readonly unadmittedDecisions: number;
  readonly unrealizedAdmittedDecisions: number;
  readonly saturated: boolean;
  readonly families: ExpressionDiagnosticRepetitionCounts;
  readonly actors: ExpressionDiagnosticRepetitionCounts;
  readonly lines: ExpressionDiagnosticRepetitionCounts;
  readonly reasons: ExpressionDiagnosticRepetitionCounts;
}

export interface ExpressionDiagnosticRepetitionReport extends Omit<ExpressionDiagnosticRepetitionState,
  "families" | "actors" | "lines" | "reasons"
> {
  readonly scope: "captured-expression-repetition";
  readonly enabled: boolean;
  readonly totalCount: number;
  readonly evictedCount: number;
  readonly retainedCount: number;
  readonly admittedAnimalVocalDecisionsPerAcceptedSimulationMinute: number | null;
  readonly families: ExpressionDiagnosticRepetitionRates;
  readonly actors: ExpressionDiagnosticRepetitionRates;
  readonly lines: ExpressionDiagnosticRepetitionRates;
  readonly reasons: ExpressionDiagnosticRepetitionRates;
  readonly notEvaluated: readonly string[];
}

export interface ExpressionDiagnosticRepetitionRates {
  readonly entries: readonly Readonly<{
    key: string;
    count: number;
    perAcceptedSimulationMinute: number | null;
  }>[];
  readonly untrackedCount: number;
}

export type ExpressionPreviewOverrides = Partial<Pick<SituatedExpressionIntent,
  "meaning" | "family" | "tone" | "volume" | "knowledgeBasis" | "priority"
  | "salience" | "durationSteps" | "variantSeed"
>>;

export interface ExpressionDiagnosticPreview {
  readonly scope: "kernel-only-preview";
  readonly actualRuntimeReason: ExpressionDiagnosticReason;
  readonly candidate: SituatedExpressionIntent;
  readonly accepted: boolean;
  readonly reason: ReturnType<typeof reduceSituatedExpression>["reason"];
  readonly realization: SituatedExpressionProjection | null;
  /** A preview cannot rerun the domain, physical recency, hearing, or admission. */
  readonly notEvaluated: readonly string[];
}

export interface ExpressionDiagnosticProducerReplay {
  readonly scope: "captured-producer-and-kernel-replay";
  readonly producerKind: ExpressionDiagnosticProducerContext["kind"];
  readonly actualRuntimeReason: ExpressionDiagnosticReason;
  readonly candidate: SituatedExpressionIntent;
  readonly accepted: boolean;
  readonly reason: ReturnType<typeof reduceSituatedExpression>["reason"];
  readonly realization: SituatedExpressionProjection | null;
  /** Mapping copied physical facts does not authenticate or rerun their cause. */
  readonly notEvaluated: readonly string[];
}

/** Hypothetical mapper inputs, not a new fall forecast or cargo transaction. */
export interface ExpressionProducerPreviewSelection {
  readonly kind: "player-traversal";
  readonly hazardSeverity?: number;
  readonly cargoShock?: number;
}

export interface ExpressionDiagnosticProducerPreview {
  readonly scope: "hypothetical-producer-and-kernel-preview";
  readonly producerKind: "player-traversal";
  readonly actualRuntimeReason: ExpressionDiagnosticReason;
  readonly hypotheticalInput: PlayerTraversalExpressionInput;
  readonly candidate: SituatedExpressionIntent;
  readonly accepted: boolean;
  readonly reason: ReturnType<typeof reduceSituatedExpression>["reason"];
  readonly realization: SituatedExpressionProjection | null;
  readonly notEvaluated: readonly string[];
}

export type ExpressionListeningPreviewOverrides = Partial<Pick<AudibleContactInput,
  "ambientNoise" | "wind"
>>;

export interface ExpressionDiagnosticListeningPreview {
  readonly scope: "captured-player-listening-preview";
  readonly actualRuntimeReason: ExpressionDiagnosticReason;
  readonly actualContact: AudibleContact | null;
  readonly actualPlayerReception: SituatedExpressionReception | null;
  readonly candidateInput: AudibleContactInput;
  readonly hypotheticalContact: AudibleContact | null;
  readonly notEvaluated: readonly string[];
}

export interface SituatedExpressionDiagnostics {
  readonly setEnabled: (enabled: boolean) => ExpressionDiagnosticSnapshot;
  readonly getSnapshot: (query?: ExpressionDiagnosticQuery) => ExpressionDiagnosticSnapshot;
  readonly reset: () => ExpressionDiagnosticSnapshot;
  readonly preview: (
    sequence: number,
    overrides?: ExpressionPreviewOverrides,
  ) => ExpressionDiagnosticPreview | null;
  /** Sequence is selected from the current buffer; reset may reuse numbers. */
  readonly replayProducer: (sequence: number) => ExpressionDiagnosticProducerReplay | null;
  readonly previewProducer: (
    sequence: number,
    selection: ExpressionProducerPreviewSelection,
  ) => ExpressionDiagnosticProducerPreview | null;
  readonly previewListening: (
    sequence: number,
    overrides?: ExpressionListeningPreviewOverrides,
  ) => ExpressionDiagnosticListeningPreview | null;
  readonly auditKnowledge: (query?: ExpressionDiagnosticQuery) => ExpressionDiagnosticKnowledgeAudit;
  readonly reportRepetition: () => ExpressionDiagnosticRepetitionReport;
}

export interface ExpressionDiagnosticKnowledgeAudit {
  readonly scope: "captured-factual-knowledge-audit";
  readonly enabled: boolean;
  readonly totalCount: number;
  readonly evictedCount: number;
  readonly records: readonly Readonly<{
    sequence: number;
    meaning: SituatedExpressionIntent["meaning"];
    sourceStatus: "validated" | "rejected" | "uncaptured";
    sourceCheck: ExpressionKnowledgeSourceCheck | null;
    playerReceiptStatus: "matching-retained-receipt" | "rejected" | "uncaptured";
    humanListeners: readonly ExpressionKnowledgeListenerAudit[] | null;
    issues: readonly string[];
  }>[];
  readonly notEvaluated: readonly string[];
}

export function createExpressionDiagnosticState(enabled = false): ExpressionDiagnosticSnapshot {
  if (typeof enabled !== "boolean") throw new TypeError("Expression diagnostics require a boolean");
  return Object.freeze({
    enabled,
    capacity: EXPRESSION_DIAGNOSTIC_CAPACITY,
    totalCount: 0,
    evictedCount: 0,
    records: Object.freeze([]),
    repetition: createRepetitionState(),
  });
}

export function setExpressionDiagnosticEnabled(
  state: ExpressionDiagnosticSnapshot,
  enabled: boolean,
): ExpressionDiagnosticSnapshot {
  if (typeof enabled !== "boolean") throw new TypeError("Expression diagnostics require a boolean");
  return state.enabled === enabled ? state : Object.freeze({ ...state, enabled });
}

/**
 * Copy only explicitly supplied finite evidence. Diagnostic failure is a no-op,
 * never an exception in the authoritative transaction. The caller stages the
 * returned root until its existing transaction succeeds.
 */
export function appendExpressionDiagnostic(
  state: ExpressionDiagnosticSnapshot,
  input: ExpressionDiagnosticInput,
): ExpressionDiagnosticSnapshot {
  if (!state.enabled) return state;
  try {
    if (state.totalCount >= Number.MAX_SAFE_INTEGER) return state;
    const copy = structuredClone(input);
    const record: ExpressionDiagnosticRecord = freezeCopy({
      ...copy,
      sequence: state.totalCount + 1,
      realization: copy.event === null ? null : projectSituatedExpression(copy.event),
      contextualText: copy.contextualText ?? null,
      producerContext: copy.producerContext ?? null,
      listeningContext: copy.listeningContext ?? null,
      knowledgeSource: copy.knowledgeSource ?? null,
      humanListeners: null,
    });
    const records = Object.freeze([...state.records, record].slice(-EXPRESSION_DIAGNOSTIC_CAPACITY));
    const totalCount = state.totalCount + 1;
    return Object.freeze({
      enabled: state.enabled,
      capacity: EXPRESSION_DIAGNOSTIC_CAPACITY,
      totalCount,
      evictedCount: totalCount - records.length,
      records,
      repetition: countRepetitionDecision(state.repetition, record),
    });
  } catch {
    return state;
  }
}

/** Only the runtime's successful fixed-step boundary supplies this exposure. */
export function advanceExpressionDiagnosticExposure(
  state: ExpressionDiagnosticSnapshot,
  fixedStepMs: number,
): ExpressionDiagnosticSnapshot {
  if (!state.enabled || !Number.isSafeInteger(fixedStepMs) || fixedStepMs <= 0) return state;
  const prior = state.repetition;
  if (prior.saturated) return state;
  if (prior.acceptedFixedSteps >= Number.MAX_SAFE_INTEGER
    || prior.acceptedSimulationMs > Number.MAX_SAFE_INTEGER - fixedStepMs) {
    return Object.freeze({ ...state, repetition: Object.freeze({ ...prior, saturated: true }) });
  }
  return Object.freeze({
    ...state,
    repetition: Object.freeze({
      ...prior,
      acceptedFixedSteps: prior.acceptedFixedSteps + 1,
      acceptedSimulationMs: prior.acceptedSimulationMs + fixedStepMs,
    }),
  });
}

/** Capture-period totals survive record eviction; these are NOT unique event rates. */
export function reportExpressionDiagnosticRepetition(
  state: ExpressionDiagnosticSnapshot,
): ExpressionDiagnosticRepetitionReport {
  const repetition = state.repetition;
  const saturated = repetition.saturated || state.totalCount >= Number.MAX_SAFE_INTEGER;
  const rate = (count: number): number | null => saturated || repetition.acceptedSimulationMs === 0
    ? null : count / (repetition.acceptedSimulationMs / 60_000);
  const rates = (counts: ExpressionDiagnosticRepetitionCounts): ExpressionDiagnosticRepetitionRates => ({
    entries: counts.entries.map(({ key, count }) => ({
      key, count,
      perAcceptedSimulationMinute: rate(count),
    })).sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    untrackedCount: counts.untrackedCount,
  });
  return freezeCopy(structuredClone({
    ...repetition,
    scope: "captured-expression-repetition",
    enabled: state.enabled,
    totalCount: state.totalCount,
    evictedCount: state.evictedCount,
    retainedCount: state.records.length,
    admittedAnimalVocalDecisionsPerAcceptedSimulationMinute: rate(repetition.admittedAnimalVocalDecisions),
    saturated,
    families: rates(repetition.families),
    actors: rates(repetition.actors),
    lines: rates(repetition.lines),
    reasons: rates(repetition.reasons),
    notEvaluated: [
      "uncaptured-producers-and-physical-sounds", "unique-world-events",
      "committed-audio-and-caption-counts", "wall-time-and-civil-time-rates",
      "settlement-density", "profanity-classification", "failed-diagnostic-copies",
      "annoyance-and-hours-soak",
    ],
  }));
}

function createRepetitionState(): ExpressionDiagnosticRepetitionState {
  const empty = (): ExpressionDiagnosticRepetitionCounts => Object.freeze({
    entries: Object.freeze([]), untrackedCount: 0,
  });
  return Object.freeze({
    acceptedFixedSteps: 0, acceptedSimulationMs: 0, admittedDecisions: 0, admittedAnimalVocalDecisions: 0,
    unadmittedDecisions: 0, unrealizedAdmittedDecisions: 0, saturated: false,
    families: empty(), actors: empty(), lines: empty(), reasons: empty(),
  });
}

/** No hashing, actor classification, wording parsing, world scan or unbounded key set. */
function incrementRepetitionCounts(
  prior: ExpressionDiagnosticRepetitionCounts,
  key: string,
): ExpressionDiagnosticRepetitionCounts {
  const index = prior.entries.findIndex((entry) => entry.key === key);
  if (index < 0 && prior.entries.length >= EXPRESSION_DIAGNOSTIC_CAPACITY) {
    return Object.freeze({ ...prior, untrackedCount: prior.untrackedCount + 1 });
  }
  const entries = index < 0
    ? [...prior.entries, Object.freeze({ key, count: 1 })]
    : prior.entries.map((entry, at) => at === index ? Object.freeze({ key, count: entry.count + 1 }) : entry);
  return Object.freeze({ entries: Object.freeze(entries), untrackedCount: prior.untrackedCount });
}

function countRepetitionDecision(
  prior: ExpressionDiagnosticRepetitionState,
  record: ExpressionDiagnosticRecord,
): ExpressionDiagnosticRepetitionState {
  const admitted = record.event !== null && record.admission !== null;
  // Reuse the existing closed semantic vocabulary, not wording, IDs or the
  // wider animal-signal family (which also includes a rabbit body thump).
  // This lookup neither grants player knowledge nor authenticates the record.
  const animalVocal = admitted && animalCallRecognitionForVocalization(record.event!.vocalization) !== null;
  const text = record.contextualText ?? record.realization?.text ?? null;
  return Object.freeze({
    ...prior,
    admittedDecisions: prior.admittedDecisions + (admitted ? 1 : 0),
    admittedAnimalVocalDecisions: prior.admittedAnimalVocalDecisions + (animalVocal ? 1 : 0),
    unadmittedDecisions: prior.unadmittedDecisions + (admitted ? 0 : 1),
    unrealizedAdmittedDecisions: prior.unrealizedAdmittedDecisions + (admitted && text === null ? 1 : 0),
    families: admitted ? incrementRepetitionCounts(prior.families, record.intent.family) : prior.families,
    actors: admitted ? incrementRepetitionCounts(prior.actors, record.intent.sourceActorId) : prior.actors,
    lines: admitted && text !== null ? incrementRepetitionCounts(prior.lines, text) : prior.lines,
    reasons: incrementRepetitionCounts(prior.reasons, record.reason),
  });
}

export function selectExpressionDiagnostics(
  state: ExpressionDiagnosticSnapshot,
  query: ExpressionDiagnosticQuery = {},
): ExpressionDiagnosticSnapshot {
  return Object.freeze({
    ...state,
    records: Object.freeze(state.records.filter(({ intent, reason }) => (
      (query.sourceActorId === undefined || intent.sourceActorId === query.sourceActorId)
      && (query.triggerEventId === undefined || intent.triggerEventId === query.triggerEventId)
      && (query.meaning === undefined || intent.meaning === query.meaning)
      && (query.reason === undefined || reason === query.reason)
    ))),
  });
}

/** Amend only retained factual decisions, through the same transaction-staged root. */
export function captureExpressionDiagnosticHumanAudience(
  state: ExpressionDiagnosticSnapshot,
  receipts: readonly HumanSupplementalListeningReceipt[],
): ExpressionDiagnosticSnapshot {
  if (!state.enabled || receipts.length > HUMAN_PERCEPTION_MAX_RESIDENTS
    * HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES) return state;
  try {
    const records = state.records.map((record) => {
      if (record.event === null || !EXPRESSION_KNOWLEDGE_SOURCE_MEANINGS.includes(record.intent.meaning)) return record;
      const matches = receipts.filter((receipt) => receipt.expressionEventId === record.event!.eventId);
      if (matches.length === 0 || matches.length > HUMAN_PERCEPTION_MAX_RESIDENTS) return record;
      return freezeCopy({ ...record, humanListeners: structuredClone(matches.map((receipt) => ({
        receipt, retainedBelief: null,
      }))) });
    });
    return Object.freeze({ ...state, records: Object.freeze(records) });
  } catch { return state; }
}

/** Hearing and understood meaning are not the same as a retained cognition fact. */
export function finalizeExpressionDiagnosticHumanAudience(
  state: ExpressionDiagnosticSnapshot,
  completedTick: number,
  residents: readonly ResidentState[],
): ExpressionDiagnosticSnapshot {
  if (!state.enabled) return state;
  try {
    const byId = new Map(residents.map((resident) => [resident.id, resident]));
    const records = state.records.map((record) => {
      if (record.humanListeners === null) return record;
      const humanListeners = record.humanListeners.map((listener) => {
        const { receipt } = listener;
        if (listener.retainedBelief !== null || receipt.observedAtTick !== completedTick) return listener;
        const resident = byId.get(receipt.residentId);
        const retainedBelief = receipt.observation !== null && resident !== undefined
          && resident.identity.stableId === receipt.observerId
          && resident.perception.actorId === receipt.observerId
          && resident.perception.tick === completedTick
          && resident.perception.beliefs.some((belief) => (
            belief.sourceObservationId === receipt.observation!.id
            && belief.lastObservedTick === completedTick
            && belief.perceivedClass === receipt.observation!.perceivedClass
            && belief.channel === "hearing" && belief.subjectId === null
            && belief.identification === "anonymous"
          ));
        return Object.freeze({ receipt, retainedBelief });
      });
      return Object.freeze({ ...record, humanListeners: Object.freeze(humanListeners) });
    });
    return Object.freeze({ ...state, records: Object.freeze(records) });
  } catch { return state; }
}

/** Inspect captured actual evidence; never parse prose, infer missing listeners or grant knowledge. */
export function auditExpressionDiagnosticKnowledge(
  state: ExpressionDiagnosticSnapshot,
  query: ExpressionDiagnosticQuery = {},
): ExpressionDiagnosticKnowledgeAudit {
  const records = selectExpressionDiagnostics(state, query).records.map((record) => {
    const { event, knowledgeSource: source, playerReception: receipt } = record;
    const sourceMatches = event !== null && source !== null
      && source.eventId === event.eventId && source.sourceActorId === event.sourceActorId
      && source.triggerEventId === event.triggerEventId;
    const sourceStatus = source === null ? "uncaptured" as const
      : sourceMatches && source.validated ? "validated" as const : "rejected" as const;
    const playerReceiptStatus = receipt === null ? "uncaptured" as const
      : event !== null && canonicalizeSituatedExpressionReception(receipt) !== null
        && receipt.eventId === event.eventId && receipt.sourceActorId === event.sourceActorId
        ? "matching-retained-receipt" as const : "rejected" as const;
    const issues: string[] = [];
    if (sourceStatus === "rejected") issues.push("source-validation-rejected");
    if (playerReceiptStatus === "rejected") issues.push("player-receipt-mismatch");
    for (const listener of record.humanListeners ?? []) {
      if (event === null) issues.push("listener-without-event");
      else issues.push(...expressionKnowledgeListenerIssues(event, listener.receipt)
        .map((issue) => `${listener.receipt.observerId}:${issue}`));
    }
    return { sequence: record.sequence, meaning: record.intent.meaning, sourceStatus,
      sourceCheck: source, playerReceiptStatus, humanListeners: record.humanListeners, issues };
  });
  return freezeCopy(structuredClone({
    scope: "captured-factual-knowledge-audit", enabled: state.enabled,
    totalCount: state.totalCount, evictedCount: state.evictedCount, records,
    notEvaluated: ["uncaptured-source-provenance", "listeners-outside-selected-human-frame",
      "player-comprehension", "unsupported-npc-semantic-transfer", "portable-source-attestation"],
  }));
}

/** A pure, explicitly hypothetical lab; it cannot submit any event to gameplay. */
export function previewExpressionDiagnostic(
  state: ExpressionDiagnosticSnapshot,
  sequence: number,
  overrides: ExpressionPreviewOverrides = {},
): ExpressionDiagnosticPreview | null {
  const record = state.records.find((candidate) => candidate.sequence === sequence);
  if (record === undefined) return null;
  // An untyped caller cannot override actor, physical position, event identity,
  // or version. Unsupported fields are rejected rather than silently ignored.
  const allowed = new Set([
    "meaning", "family", "tone", "volume", "knowledgeBasis", "priority",
    "salience", "durationSteps", "variantSeed",
  ]);
  try {
    if (overrides === null || typeof overrides !== "object") return null;
    const prototype = Object.getPrototypeOf(overrides);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(overrides).some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(overrides, key);
      return typeof key !== "string" || !allowed.has(key)
        || descriptor?.enumerable !== true || !("value" in descriptor);
    })) return null;
    const candidate = structuredClone({ ...record.intent, ...overrides });
    const reduction = reduceSituatedExpression(record.priorState, candidate);
    return freezeCopy({
      scope: "kernel-only-preview",
      actualRuntimeReason: record.reason,
      candidate,
      accepted: reduction.accepted,
      reason: reduction.reason,
      realization: reduction.event === null ? null : projectSituatedExpression(reduction.event),
      notEvaluated: [
        "domain-cause", "physical-recency", "sample/channel-capacity", "listener-hearing",
        "causal-admission", "presentation", "personality", "relationships", "full-emotional-state",
        "contextual-realization",
      ],
    });
  } catch {
    return null;
  }
}

/** Replays one supported mapper from detached historical inputs, never the world. */
export function replayExpressionDiagnosticProducer(
  state: ExpressionDiagnosticSnapshot,
  sequence: number,
): ExpressionDiagnosticProducerReplay | null {
  const record = state.records.find((candidate) => candidate.sequence === sequence);
  const context = record?.producerContext;
  if (record === undefined || context === null || context === undefined
    || (context.kind !== "player-traversal" && context.kind !== "guardian-dog-shelter-whine")) return null;
  try {
    const candidate = context.kind === "player-traversal"
      ? playerTraversalExpressionIntent(structuredClone(context.input))
      : guardianDogShelterWhineExpressionIntent(structuredClone(context.input));
    if (candidate === null || stableStringify(candidate) !== stableStringify(record.intent)) return null;
    const reduction = reduceSituatedExpression(record.priorState, candidate);
    return freezeCopy({
      scope: "captured-producer-and-kernel-replay",
      producerKind: context.kind,
      actualRuntimeReason: record.reason,
      candidate,
      accepted: reduction.accepted,
      reason: reduction.reason,
      realization: reduction.event === null ? null : projectSituatedExpression(reduction.event),
      notEvaluated: [
        "physical-transaction", "physical-recency", "sample/channel-capacity", "listener-hearing",
        "causal-admission", "presentation", "personality", "relationships", "full-emotional-state",
        "contextual-realization",
      ],
    });
  } catch {
    return null;
  }
}

/** Selects bounded hypothetical context for one captured current mapper only. */
export function previewExpressionDiagnosticProducer(
  state: ExpressionDiagnosticSnapshot,
  sequence: number,
  selection: ExpressionProducerPreviewSelection,
): ExpressionDiagnosticProducerPreview | null {
  try {
    if (!plainDataFields(selection, ["kind", "hazardSeverity", "cargoShock"])
      || selection.kind !== "player-traversal") return null;
    for (const key of ["hazardSeverity", "cargoShock"] as const) {
      if (Object.hasOwn(selection, key) && (!Number.isSafeInteger(selection[key])
        || selection[key]! < 0 || selection[key]! > 1_000_000)) return null;
    }
    const record = state.records.find((candidate) => candidate.sequence === sequence);
    const context = record?.producerContext;
    if (record === undefined || context?.kind !== "player-traversal") return null;
    // Changing copied context must not rescue an invalid or inconsistent cause.
    // Keep the exact replay independent of this counterfactual selection.
    if (replayExpressionDiagnosticProducer(state, sequence) === null) return null;
    const input = structuredClone(context.input);
    const hypotheticalInput: PlayerTraversalExpressionInput = {
      ...input,
      evaluation: {
        ...input.evaluation,
        forecast: {
          ...input.evaluation.forecast,
          ...(Object.hasOwn(selection, "hazardSeverity") ? {
            hazardSeverity: selection.hazardSeverity!,
            seriousHazard: selection.hazardSeverity! >= SERIOUS_FALL_HAZARD,
          } : {}),
        },
      },
      cargo: {
        ...input.cargo,
        ...(Object.hasOwn(selection, "cargoShock") ? { cargoShock: selection.cargoShock! } : {}),
      },
    };
    const candidate = playerTraversalExpressionIntent(hypotheticalInput);
    if (candidate === null) return null;
    const reduction = reduceSituatedExpression(record.priorState, candidate);
    return freezeCopy({
      scope: "hypothetical-producer-and-kernel-preview",
      producerKind: "player-traversal",
      actualRuntimeReason: record.reason,
      hypotheticalInput,
      candidate,
      accepted: reduction.accepted,
      reason: reduction.reason,
      realization: reduction.event === null ? null : projectSituatedExpression(reduction.event),
      notEvaluated: [
        "physical-forecast-and-transaction", "physical-recency", "sample/channel-capacity",
        "listener-hearing", "causal-admission", "audio/presentation", "personality",
        "relationships", "full-emotional-state", "contextual-realization",
      ],
    });
  } catch {
    return null;
  }
}

/** Pure contact calculation; cannot change weather or commit a listener receipt. */
export function previewExpressionDiagnosticListening(
  state: ExpressionDiagnosticSnapshot,
  sequence: number,
  overrides: ExpressionListeningPreviewOverrides = {},
): ExpressionDiagnosticListeningPreview | null {
  const record = state.records.find((candidate) => candidate.sequence === sequence);
  const context = record?.listeningContext;
  if (record === undefined || context === null || context === undefined) return null;
  try {
    if (!plainDataFields(overrides, ["ambientNoise", "wind"])) return null;
    if (Object.hasOwn(overrides, "ambientNoise") && !unitNumber(overrides.ambientNoise)) return null;
    if (Object.hasOwn(overrides, "wind")) {
      if (!plainDataFields(overrides.wind, ["x", "y"])
        || !Object.hasOwn(overrides.wind!, "x") || !Object.hasOwn(overrides.wind!, "y")
        || !Number.isFinite(overrides.wind!.x) || Math.abs(overrides.wind!.x) > 1
        || !Number.isFinite(overrides.wind!.y) || Math.abs(overrides.wind!.y) > 1) return null;
    }
    const input = structuredClone(context.input);
    // Validate finite captured metadata, not a second acoustic algorithm.
    if (![input.listener?.x, input.listener?.y, input.source?.x, input.source?.y,
      input.wind?.x, input.wind?.y, input.baseRange].every(Number.isFinite)
      || input.baseRange < 0 || !unitNumber(input.ambientNoise)
      || !unitNumber(input.sourceLoudness)) return null;
    if (!Number.isFinite(Math.hypot(input.source.x - input.listener.x,
      input.source.y - input.listener.y))
      || !Number.isFinite(Math.hypot(input.wind.x, input.wind.y))) return null;
    const actualContact = evaluateAudibleContact(input);
    if (stableStringify(actualContact) !== stableStringify(context.contact)) return null;
    const candidateInput = { ...input, ...structuredClone(overrides) };
    return freezeCopy({
      scope: "captured-player-listening-preview",
      actualRuntimeReason: record.reason,
      actualContact: structuredClone(context.contact),
      actualPlayerReception: structuredClone(record.playerReception),
      candidateInput,
      hypotheticalContact: evaluateAudibleContact(candidateInput),
      notEvaluated: [
        "physical-environment-change", "terrain/structure/foliage-transmission",
        "sleep-policy", "visibility/identification", "comprehension", "npc-reception",
        "causal-admission", "audio/presentation",
      ],
    });
  } catch {
    return null;
  }
}

function unitNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Reject getters and inherited/hidden keys before reading any override values. */
function plainDataFields(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === "string" && allowed.includes(key)
      && descriptor?.enumerable === true && "value" in descriptor;
  });
}

function freezeCopy<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) freezeCopy(nested);
    Object.freeze(value);
  }
  return value;
}
