import type { FallCargoOutcome } from "./fallCargo";
import {
  SERIOUS_FALL_HAZARD,
  type FallRiskEvaluation,
} from "./fallRisk";
import type { LooseCargoPayload } from "./looseCargo";
import {
  SITUATED_EXPRESSION_VERSION,
  type SituatedExpressionIntent,
} from "./situatedExpression";
import type { TraversalIncident } from "./traversalFeedback";
import { isWorldPosition, type WorldPosition } from "./worldPosition";

/** Only facts committed by the physical-cargo transaction cross this adapter. */
export interface PlayerTraversalCargoExpressionContext {
  readonly outcome: FallCargoOutcome;
  readonly selectedPayload: LooseCargoPayload | null;
  readonly separatedEntityIds: readonly string[];
  readonly cargoShock: number;
}

export interface PlayerTraversalExpressionInput {
  readonly sourceActorId: string;
  readonly position: WorldPosition;
  readonly incident: TraversalIncident;
  readonly evaluation: FallRiskEvaluation;
  readonly cargo: PlayerTraversalCargoExpressionContext;
}

export interface PlayerFallCargoRecoveryExpressionInput {
  readonly sourceActorId: string;
  /** The committed pickup event, not the parcel ID or a presentation counter. */
  readonly recoveryEventId: string;
  readonly position: WorldPosition;
  readonly variantSeed: number;
  /** Runtime must prove this from retained physical-cargo history. */
  readonly recoveredFrom: "fall-separation";
}

/**
 * Converts committed traversal/cargo facts into semantic expression intent.
 * It never chooses prose and deliberately says nothing for unsupported falls.
 */
export function playerTraversalExpressionIntent(
  input: PlayerTraversalExpressionInput,
): SituatedExpressionIntent | null {
  if (!validTraversalInput(input)) return null;
  const { cargo, evaluation, incident } = input;

  if (cargo.outcome === "separated" && cargo.separatedEntityIds.length > 0) {
    return intent(input, {
      meaning: "alarm-at-cargo-loss",
      family: "cargo",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-observed-cargo-loss",
      priority: 950_000,
      salience: 980_000,
      durationSteps: 14,
    });
  }

  if (
    cargo.outcome === "impacted-carried"
    && importantCargo(cargo.selectedPayload)
    && (evaluation.fell || cargo.cargoShock >= 260_000)
  ) {
    return intent(input, {
      meaning: "protect-important-cargo",
      family: "cargo",
      tone: evaluation.fell ? "alarmed" : "strained",
      volume: evaluation.fell ? "shout" : "spoken",
      knowledgeBasis: "self-observed-cargo-risk",
      priority: 620_000,
      salience: 760_000,
      durationSteps: 12,
    });
  }

  // A completed fall is not mislabeled as a near-fall. Its physical impact
  // remains audible through the existing incident channel.
  if (!evaluation.stumbled || incident.kind !== "stumble") return null;

  if (
    evaluation.forecast.seriousHazard
    || evaluation.forecast.hazardSeverity >= SERIOUS_FALL_HAZARD
  ) {
    return intent(input, {
      meaning: "relief-after-near-fall",
      family: "footing",
      tone: "relieved",
      volume: "spoken",
      knowledgeBasis: "self-felt-near-fall",
      priority: 420_000,
      salience: 650_000,
      durationSteps: 10,
    });
  }

  return intent(input, {
    meaning: "steady-after-stumble",
    family: "footing",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-felt-stumble",
    priority: 180_000,
    salience: 260_000,
    durationSteps: 7,
  });
}

/** One successful recovery expression, admitted only after causal proof. */
export function playerFallCargoRecoveryExpressionIntent(
  input: PlayerFallCargoRecoveryExpressionInput,
): SituatedExpressionIntent | null {
  if (
    !validId(input.sourceActorId)
    || !validId(input.recoveryEventId)
    || !isWorldPosition(input.position)
    || input.recoveredFrom !== "fall-separation"
    || !Number.isSafeInteger(input.variantSeed)
    || input.variantSeed < 0
    || input.variantSeed > 0xffff_ffff
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: input.sourceActorId,
    triggerEventId: input.recoveryEventId,
    position: input.position,
    meaning: "relief-after-cargo-recovery",
    family: "cargo",
    tone: "relieved",
    volume: "spoken",
    knowledgeBasis: "self-recovered-cargo",
    priority: 520_000,
    salience: 720_000,
    variantSeed: input.variantSeed,
    durationSteps: 9,
  });
}

function intent(
  input: PlayerTraversalExpressionInput,
  semantic: Omit<
    SituatedExpressionIntent,
    "version" | "sourceActorId" | "triggerEventId" | "position" | "variantSeed"
  >,
): SituatedExpressionIntent {
  return Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: input.sourceActorId,
    triggerEventId: input.incident.id,
    position: input.position,
    variantSeed: input.incident.variantSeed >>> 0,
    ...semantic,
  });
}

function importantCargo(payload: LooseCargoPayload | null): boolean {
  return payload?.kind === "promise" || payload?.kind === "gear";
}

function validTraversalInput(input: PlayerTraversalExpressionInput): boolean {
  const evaluation = input.evaluation;
  const incident = input.incident;
  const cargo = input.cargo;
  return validId(input.sourceActorId)
    && isWorldPosition(input.position)
    && validId(incident.id)
    && Number.isSafeInteger(incident.variantSeed)
    && incident.variantSeed >= 0
    && evaluation.valid
    && evaluation.evaluated
    && (evaluation.fell || evaluation.stumbled)
    && evaluation.usedTraversalOrdinal === incident.traversalOrdinal
    && evaluation.consequenceQuote !== null
    && cargo.outcome !== "rejected"
    && Number.isSafeInteger(cargo.cargoShock)
    && cargo.cargoShock >= 0
    && cargo.cargoShock <= 1_000_000
    && cargo.separatedEntityIds.every(validId)
    && new Set(cargo.separatedEntityIds).size === cargo.separatedEntityIds.length;
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}
