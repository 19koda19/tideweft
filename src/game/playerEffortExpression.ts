import { hashCanonical } from "../sim/util";
import { PLAYER_MAX_FIXED_STEP_DISPLACEMENT_UNITS } from "./player";
import {
  SITUATED_EXPRESSION_VERSION,
  type SituatedExpressionFamily,
  type SituatedExpressionIntent,
  type SituatedExpressionKnowledgeBasis,
  type SituatedExpressionMeaning,
  type SituatedExpressionTone,
  type SituatedExpressionVolume,
} from "./situatedExpression";
import { isWorldPosition, type WorldPosition } from "./worldPosition";

/** Exact committed movement facts that can justify one dry-exhaustion utterance. */
export interface PlayerEffortExpressionEvidence {
  readonly committedWorldTick: number;
  /** Post-step phase retained by the bounded player-perception interval. */
  readonly admittedAtPlayerStepPhase: number;
  readonly acceptedDistanceUnits: number;
  /** This is the existing abstract emergency posture, not a physical camp claim. */
  readonly resolution: "dry-exhaustion-camp";
}

export interface PlayerEffortExpressionInput extends PlayerEffortExpressionEvidence {
  readonly sourceActorId: string;
  readonly position: WorldPosition;
}

export interface PlayerEffortExpressionPolicy {
  readonly triggerEventId: string;
  readonly meaning: SituatedExpressionMeaning;
  readonly family: SituatedExpressionFamily;
  readonly tone: SituatedExpressionTone;
  readonly volume: SituatedExpressionVolume;
  readonly knowledgeBasis: SituatedExpressionKnowledgeBasis;
  readonly priority: number;
  readonly salience: number;
  readonly variantSeed: number;
  readonly durationSteps: number;
}

/**
 * Re-derives the one semantic policy owned by a committed dry exhaustion
 * transition. Callers cannot choose prose, priority, or a durable event ID.
 */
export function playerEffortExpressionPolicy(
  sourceActorId: unknown,
  evidence: PlayerEffortExpressionEvidence,
): PlayerEffortExpressionPolicy | null {
  if (!validId(sourceActorId) || !validEvidence(evidence)) return null;
  const causalHash = hashCanonical({
    version: 1,
    sourceActorId,
    ...evidence,
  });
  return Object.freeze({
    triggerEventId: `player-dry-exhaustion:${causalHash}`,
    meaning: "need-rest-after-exertion",
    family: "condition",
    tone: "strained",
    volume: "murmur",
    knowledgeBasis: "self-felt-exhaustion",
    priority: 260_000,
    salience: 440_000,
    variantSeed: Number.parseInt(causalHash.slice(0, 8), 16) >>> 0,
    durationSteps: 8,
  });
}

/** Maps an already committed dry-exhaustion transition into Living Voice. */
export function playerEffortExpressionIntent(
  input: PlayerEffortExpressionInput,
): SituatedExpressionIntent | null {
  if (
    !plainRecord(input)
    || !exactKeys(input, [
      "acceptedDistanceUnits",
      "admittedAtPlayerStepPhase",
      "committedWorldTick",
      "position",
      "resolution",
      "sourceActorId",
    ])
    || !isWorldPosition(input.position)
  ) return null;
  const policy = playerEffortExpressionPolicy(input.sourceActorId, evidenceFrom(input));
  if (policy === null) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: input.sourceActorId,
    triggerEventId: policy.triggerEventId,
    position: input.position,
    meaning: policy.meaning,
    family: policy.family,
    tone: policy.tone,
    volume: policy.volume,
    knowledgeBasis: policy.knowledgeBasis,
    priority: policy.priority,
    salience: policy.salience,
    variantSeed: policy.variantSeed,
    durationSteps: policy.durationSteps,
  });
}

function evidenceFrom(input: PlayerEffortExpressionInput): PlayerEffortExpressionEvidence {
  return {
    committedWorldTick: input.committedWorldTick,
    admittedAtPlayerStepPhase: input.admittedAtPlayerStepPhase,
    acceptedDistanceUnits: input.acceptedDistanceUnits,
    resolution: input.resolution,
  };
}

function validEvidence(value: PlayerEffortExpressionEvidence): boolean {
  return plainRecord(value)
    && exactKeys(value, [
      "acceptedDistanceUnits",
      "admittedAtPlayerStepPhase",
      "committedWorldTick",
      "resolution",
    ])
    && nonnegativeSafeInteger(value.committedWorldTick)
    && boundedInteger(value.admittedAtPlayerStepPhase, 1, 9)
    && boundedInteger(
      value.acceptedDistanceUnits,
      1,
      PLAYER_MAX_FIXED_STEP_DISPLACEMENT_UNITS,
    )
    && value.resolution === "dry-exhaustion-camp";
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return nonnegativeSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
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
