import type { ActorBelief } from "../sim/actorPerception";
import { stableStringify } from "../sim/util";
import { evaluateAudibleContact, type AudibleContact, type AudibleContactInput } from "./perception";
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
import type { SituatedExpressionReception } from "./situatedExpressionReception";

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
}

export interface ExpressionDiagnosticRecord extends ExpressionDiagnosticInput {
  readonly sequence: number;
  /** Catalog realization; contextual speech may replace its neutral wording. */
  readonly realization: SituatedExpressionProjection | null;
  readonly contextualText: string | null;
  readonly producerContext: ExpressionDiagnosticProducerContext | null;
  readonly listeningContext: ExpressionDiagnosticListeningContext | null;
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
  readonly previewListening: (
    sequence: number,
    overrides?: ExpressionListeningPreviewOverrides,
  ) => ExpressionDiagnosticListeningPreview | null;
}

export function createExpressionDiagnosticState(enabled = false): ExpressionDiagnosticSnapshot {
  if (typeof enabled !== "boolean") throw new TypeError("Expression diagnostics require a boolean");
  return Object.freeze({
    enabled,
    capacity: EXPRESSION_DIAGNOSTIC_CAPACITY,
    totalCount: 0,
    evictedCount: 0,
    records: Object.freeze([]),
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
    });
    const records = Object.freeze([...state.records, record].slice(-EXPRESSION_DIAGNOSTIC_CAPACITY));
    const totalCount = state.totalCount + 1;
    return Object.freeze({
      enabled: state.enabled,
      capacity: EXPRESSION_DIAGNOSTIC_CAPACITY,
      totalCount,
      evictedCount: totalCount - records.length,
      records,
    });
  } catch {
    return state;
  }
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
