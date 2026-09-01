import type { PlayerBalanceView, PlayerIncidentView, WorldPoint } from "../render/types";
import { FIXED_POINT } from "../sim/types";
import type {
  FallMotion,
  FallRiskCauseCode,
  FallRiskEvaluation,
} from "./fallRisk";

export const TRAVERSAL_FEEDBACK_VERSION = 1 as const;
export const MAX_INCIDENT_STEPS = 60;

export type TraversalIncidentKind = PlayerIncidentView["kind"];
export type TraversalIncidentCue = "stumble" | "fall" | "impact" | "sweep" | "recover";

export interface TraversalIncident {
  /** Actor + accepted traversal ordinal is the durable identity. */
  readonly id: string;
  readonly actorId: number;
  readonly traversalOrdinal: number;
  readonly kind: TraversalIncidentKind;
  readonly primaryCause: FallRiskCauseCode;
  readonly label: string;
  readonly detail: string;
  /** Player-coordinate units; projected into either renderer later. */
  readonly position: WorldPoint;
  readonly remainingSteps: number;
  readonly totalSteps: number;
  /** A visual/audio variant seed only; never used as durable identity. */
  readonly variantSeed: number;
  readonly cue: TraversalIncidentCue;
}

export interface TraversalFeedbackState {
  readonly version: typeof TRAVERSAL_FEEDBACK_VERSION;
  readonly completedSteps: number;
  readonly nextTraversalOrdinal: number;
  readonly incident: TraversalIncident | null;
  /** The only incident whose cue has already crossed the audio boundary. */
  readonly lastAudibleIncidentId: string | null;
}

export interface TraversalIncidentAcceptance {
  readonly ok: boolean;
  readonly reason: "accepted" | "no-incident" | "invalid-evaluation" | "ordinal-mismatch";
  readonly state: TraversalFeedbackState;
  readonly incident: TraversalIncident | null;
}

const CAUSE_LABELS: Readonly<Record<FallRiskCauseCode, string>> = {
  "invalid-input": "unreadable footing",
  "unsupported-gap": "open edge",
  "elevation-drop": "sudden drop",
  "loose-rock": "loose rock",
  "steep-grade": "steep grade",
  "slippery-surface": "slick ground",
  "strong-current": "cross-current",
  "deep-water": "deep water",
  "bramble-vines": "grabbing bramble",
  "high-wind": "crosswind",
  "sharp-turn": "sharp turn",
  "low-stability": "lost balance",
  "heavy-load": "load shift",
  "travel-pace": "downhill speed",
};

const STUMBLE_VOICES = ["oop", "nnf", "hup", "skk"] as const;

export function createTraversalFeedbackState(): TraversalFeedbackState {
  return {
    version: TRAVERSAL_FEEDBACK_VERSION,
    completedSteps: 0,
    nextTraversalOrdinal: 0,
    incident: null,
    lastAudibleIncidentId: null,
  };
}

/**
 * Turns an accepted deterministic crossing result into one persistent sensory
 * incident. Held crossings still consume their ordinal but emit no fake cue.
 */
export function acceptFallFeedback(
  state: TraversalFeedbackState,
  evaluation: FallRiskEvaluation,
  actorId: number,
  position: WorldPoint,
): TraversalIncidentAcceptance {
  if (
    !validState(state)
    || !evaluation.valid
    || !evaluation.evaluated
    || !Number.isSafeInteger(actorId)
    || actorId < 0
    || !Number.isSafeInteger(position.x)
    || !Number.isSafeInteger(position.y)
  ) {
    return { ok: false, reason: "invalid-evaluation", state, incident: null };
  }
  if (evaluation.usedTraversalOrdinal !== state.nextTraversalOrdinal) {
    return { ok: false, reason: "ordinal-mismatch", state, incident: null };
  }
  const advanced: TraversalFeedbackState = {
    ...state,
    nextTraversalOrdinal: evaluation.nextTraversalOrdinal,
  };
  if (
    (!evaluation.fell && !evaluation.stumbled)
    || evaluation.feedbackEventId === null
    || evaluation.consequenceQuote === null
    || evaluation.forecast.primaryCause === null
  ) {
    return { ok: true, reason: "no-incident", state: advanced, incident: null };
  }

  const incident = incidentFor(
    actorId,
    evaluation.usedTraversalOrdinal,
    evaluation.feedbackEventId,
    evaluation.forecast.primaryCause,
    evaluation.forecast.causes.find(({ code }) => isEnvironmentalCause(code))?.code ?? null,
    evaluation.consequenceQuote.motion,
    evaluation.fell,
    position,
  );
  return {
    ok: true,
    reason: "accepted",
    state: { ...advanced, incident },
    incident,
  };
}

export function acknowledgeIncidentCue(
  state: TraversalFeedbackState,
): { readonly state: TraversalFeedbackState; readonly incident: TraversalIncident | null } {
  const incident = state.incident;
  if (!incident || state.lastAudibleIncidentId === incident.id) {
    return { state, incident: null };
  }
  return {
    state: { ...state, lastAudibleIncidentId: incident.id },
    incident,
  };
}

export function advanceTraversalFeedback(
  state: TraversalFeedbackState,
): TraversalFeedbackState {
  if (!validState(state)) return state;
  const incident = state.incident;
  return {
    ...state,
    completedSteps: state.completedSteps === Number.MAX_SAFE_INTEGER
      ? Number.MAX_SAFE_INTEGER
      : state.completedSteps + 1,
    incident: !incident || incident.remainingSteps <= 1
      ? null
      : { ...incident, remainingSteps: incident.remainingSteps - 1 },
  };
}

export function projectTraversalIncident(
  incident: TraversalIncident | null,
): PlayerIncidentView | undefined {
  if (!incident) return undefined;
  return {
    id: incident.id,
    kind: incident.kind,
    label: incident.label,
    detail: incident.detail,
    progress: 1 - incident.remainingSteps / Math.max(1, incident.totalSteps),
    variantSeed: incident.variantSeed,
  };
}

/** Priority is explicit and shared by both renderers. */
export function projectPlayerBalance(
  state: TraversalFeedbackState,
  input: {
    readonly swept: boolean;
    readonly stability: number;
    readonly stabilityTrend: "recovering" | "steady" | "falling";
  },
): PlayerBalanceView {
  if (input.swept) return "swept";
  const incident = state.incident;
  if (incident?.kind === "fall") {
    return incident.remainingSteps * 2 > incident.totalSteps ? "fallen" : "recovering";
  }
  if (incident?.kind === "stumble") {
    return incident.remainingSteps * 2 > incident.totalSteps ? "stumbling" : "recovering";
  }
  const stability = clampUnit(input.stability);
  if (input.stabilityTrend === "falling" || stability < 420_000) return "swaying";
  if (input.stabilityTrend === "recovering" && stability < FIXED_POINT) return "recovering";
  return "balanced";
}

/** The early phase of a mishap is physical recovery, not merely animation. */
export function traversalControlLocked(state: TraversalFeedbackState): boolean {
  const incident = state.incident;
  if (!incident) return false;
  if (incident.kind === "fall") return incident.remainingSteps * 2 > incident.totalSteps;
  if (incident.kind === "stumble") return incident.remainingSteps * 5 > incident.totalSteps * 3;
  return incident.kind === "sweep";
}

/**
 * Accepts old saves only when the sidecar is wholly absent. Present malformed
 * state is rejected; it must never silently reset an ordinal and reroll a fall.
 * Loaded incidents are marked heard conservatively so reload cannot replay a
 * cue even if a write was interrupted around the audio boundary.
 */
export function canonicalizeTraversalFeedback(
  value: unknown,
  options: { readonly allowMissingLegacy?: boolean } = {},
): TraversalFeedbackState {
  if (value === undefined) {
    if (options.allowMissingLegacy === true) return createTraversalFeedbackState();
    throw new Error("Save is missing traversal feedback state");
  }
  if (!validState(value)) throw new Error("Save contains invalid traversal feedback state");
  return value.incident && value.lastAudibleIncidentId !== value.incident.id
    ? { ...value, lastAudibleIncidentId: value.incident.id }
    : value;
}

function incidentFor(
  actorId: number,
  traversalOrdinal: number,
  variantSeed: number,
  cause: FallRiskCauseCode,
  environmentalCause: FallRiskCauseCode | null,
  motion: FallMotion,
  fell: boolean,
  position: WorldPoint,
): TraversalIncident {
  const safePosition = { x: position.x, y: position.y };
  const voice = fell
    ? motion === "swept" ? "WHHSH!" : motion === "impact" ? "THUD" : "WHK"
    : STUMBLE_VOICES[variantSeed % STUMBLE_VOICES.length] ?? "oop";
  const kind: TraversalIncidentKind = fell ? (motion === "swept" ? "sweep" : "fall") : "stumble";
  const totalSteps = fell ? 24 : 10;
  const namedCause = environmentalCause && environmentalCause !== cause
    ? `${CAUSE_LABELS[environmentalCause]} / ${CAUSE_LABELS[cause]}`
    : CAUSE_LABELS[cause];
  return {
    id: `player:${actorId}:traversal:${traversalOrdinal}`,
    actorId,
    traversalOrdinal,
    kind,
    primaryCause: cause,
    label: `${voice} · ${namedCause}`,
    detail: fell ? "Cargo can separate; regain your feet before moving." : "Brace or choose a sounder line.",
    position: safePosition,
    remainingSteps: totalSteps,
    totalSteps,
    variantSeed: variantSeed >>> 0,
    cue: fell ? (motion === "swept" ? "sweep" : motion === "impact" ? "impact" : "fall") : "stumble",
  };
}

function isEnvironmentalCause(cause: FallRiskCauseCode): boolean {
  return cause !== "invalid-input"
    && cause !== "low-stability"
    && cause !== "heavy-load"
    && cause !== "travel-pace"
    && cause !== "sharp-turn";
}

function validState(value: unknown): value is TraversalFeedbackState {
  if (!isRecord(value) || value.version !== TRAVERSAL_FEEDBACK_VERSION) return false;
  if (!safeNonnegative(value.completedSteps) || !safeNonnegative(value.nextTraversalOrdinal)) return false;
  if (value.lastAudibleIncidentId !== null && !validText(value.lastAudibleIncidentId, 180)) return false;
  if (value.incident === null) return true;
  const incident = value.incident;
  if (!isRecord(incident)) return false;
  if (!validText(incident.id, 180) || !safeNonnegative(incident.actorId)) return false;
  if (!safeNonnegative(incident.traversalOrdinal) || incident.traversalOrdinal >= value.nextTraversalOrdinal) return false;
  if (!["stumble", "fall", "sweep", "cargo-impact", "recovery"].includes(String(incident.kind))) return false;
  if (!isFallRiskCauseCode(incident.primaryCause)) return false;
  if (!validText(incident.label, 120) || !validText(incident.detail, 200)) return false;
  if (!isRecord(incident.position) || !Number.isSafeInteger(incident.position.x) || !Number.isSafeInteger(incident.position.y)) return false;
  if (!safePositive(incident.remainingSteps) || !safePositive(incident.totalSteps)) return false;
  if (incident.remainingSteps > incident.totalSteps || incident.totalSteps > MAX_INCIDENT_STEPS) return false;
  if (!safeNonnegative(incident.variantSeed) || incident.variantSeed > 0xffff_ffff) return false;
  if (!["stumble", "fall", "impact", "sweep", "recover"].includes(String(incident.cue))) return false;
  const expectedPrefix = `player:${incident.actorId}:traversal:${incident.traversalOrdinal}`;
  return incident.id === expectedPrefix;
}

function isFallRiskCauseCode(value: unknown): value is FallRiskCauseCode {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(CAUSE_LABELS, value);
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function safeNonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safePositive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
