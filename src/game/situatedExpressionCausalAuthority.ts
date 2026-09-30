import { hashCanonical } from "../sim/util";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { situatedExpressionEventIdForTrigger } from "./situatedExpression";
import {
  SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS,
  SITUATED_EXPRESSION_ADMISSION_MAX_PLAYER_STEP_PHASE,
  canonicalizeSituatedExpressionAdmissionRecord,
  type PlayerFallRecoveryExpressionAdmissionRecord,
  type PlayerExhaustionExpressionAdmissionRecord,
  type PlayerTraversalExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

/** Independent player-causal evidence retained for one world-tick interval. */
export const SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION = 1 as const;
export const SITUATED_EXPRESSION_CAUSAL_AUTHORITY_MAX_RECORDS =
  SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS;

export type PlayerSituatedExpressionAdmissionRecord =
  | PlayerTraversalExpressionAdmissionRecord
  | PlayerFallRecoveryExpressionAdmissionRecord
  | PlayerExhaustionExpressionAdmissionRecord;

export interface SituatedExpressionCausalAuthorityRecord {
  readonly version: typeof SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION;
  readonly eventId: string;
  readonly sourceActorId: typeof LOCAL_PLAYER_LIVING_ACTOR_ID;
  readonly triggerEventId: string;
  /** Exact index in the complete admission/sound ledger (porter entries may occupy gaps). */
  readonly sampleOrdinal: number;
  /** World tick whose uncommitted player-step interval produced this fact. */
  readonly committedWorldTick: number;
  /** Exact fixed-player-step phase at admission. */
  readonly admittedAtPlayerStepPhase: number;
  /** Exact player location when the causal fact was committed. */
  readonly playerPosition: WorldPosition;
  /** Canonical hash of kind and kind-specific causal admission fields only. */
  readonly causalDigest: string;
}

export interface SituatedExpressionCausalAuthorityLedger {
  readonly version: typeof SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION;
  readonly records: readonly SituatedExpressionCausalAuthorityRecord[];
}

/** Creates the sole canonical empty current-interval authority ledger. */
export function createSituatedExpressionCausalAuthorityLedger(): SituatedExpressionCausalAuthorityLedger {
  return freezeLedger([]);
}

/**
 * Digests only canonical player-causal fields. Base admission metadata is
 * independently represented by the authority record and is not folded into
 * this digest.
 */
export function situatedExpressionAdmissionCausalDigest(
  admissionValue: unknown,
): string | null {
  const admission = canonicalPlayerAdmission(admissionValue);
  if (admission === null) return null;
  if (admission.kind === "player-traversal") {
    return hashCanonical({
      version: SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION,
      kind: admission.kind,
      causalClass: admission.causalClass,
      incidentKind: admission.incidentKind,
      hazardSeverity: admission.hazardSeverity,
      cargoOutcome: admission.cargoOutcome,
      selectedPayloadKind: admission.selectedPayloadKind,
      cargoShock: admission.cargoShock,
      separatedEntityIds: admission.separatedEntityIds,
      separationEventId: admission.separationEventId,
    });
  }
  if (admission.kind === "player-exhaustion") {
    return hashCanonical({
      version: SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION,
      kind: admission.kind,
      committedWorldTick: admission.committedWorldTick,
      acceptedDistanceUnits: admission.acceptedDistanceUnits,
      resolution: admission.resolution,
    });
  }
  return hashCanonical({
    version: SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION,
    kind: admission.kind,
    recoveryEventId: admission.recoveryEventId,
    recoveredEntityId: admission.recoveredEntityId,
  });
}

/** Creates one independently persisted authority fact for a player admission. */
export function createSituatedExpressionCausalAuthorityRecord(
  admissionValue: unknown,
  committedWorldTick: number,
  playerPosition: WorldPosition,
): SituatedExpressionCausalAuthorityRecord | null {
  const admission = canonicalPlayerAdmission(admissionValue);
  if (admission === null) return null;
  const causalDigest = situatedExpressionAdmissionCausalDigest(admission);
  if (causalDigest === null) return null;
  if (
    admission.kind === "player-exhaustion"
    && admission.committedWorldTick !== committedWorldTick
  ) {
    return null;
  }
  return canonicalizeSituatedExpressionCausalAuthorityRecord({
    version: SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION,
    eventId: admission.eventId,
    sourceActorId: admission.sourceActorId,
    triggerEventId: admission.triggerEventId,
    sampleOrdinal: admission.sampleOrdinal,
    committedWorldTick,
    admittedAtPlayerStepPhase: admission.admittedAtPlayerStepPhase,
    playerPosition,
    causalDigest,
  });
}

/** Reauthenticates one exact, player-only causal authority record. */
export function canonicalizeSituatedExpressionCausalAuthorityRecord(
  value: unknown,
): SituatedExpressionCausalAuthorityRecord | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "admittedAtPlayerStepPhase",
      "causalDigest",
      "committedWorldTick",
      "eventId",
      "playerPosition",
      "sampleOrdinal",
      "sourceActorId",
      "triggerEventId",
      "version",
    ])
    || value.version !== SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION
    || value.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || !validId(value.eventId)
    || !validId(value.triggerEventId)
    || value.eventId !== situatedExpressionEventIdForTrigger(
      value.sourceActorId,
      value.triggerEventId,
    )
    || !boundedInteger(
      value.sampleOrdinal,
      0,
      SITUATED_EXPRESSION_CAUSAL_AUTHORITY_MAX_RECORDS - 1,
    )
    || !nonnegativeSafeInteger(value.committedWorldTick)
    || !boundedInteger(
      value.admittedAtPlayerStepPhase,
      0,
      SITUATED_EXPRESSION_ADMISSION_MAX_PLAYER_STEP_PHASE,
    )
    || !isWorldPosition(value.playerPosition)
    || !canonicalDigest(value.causalDigest)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION,
    eventId: value.eventId,
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    committedWorldTick: value.committedWorldTick,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    playerPosition: createWorldPosition(
      value.playerPosition.region,
      value.playerPosition.localX,
      value.playerPosition.localY,
    ),
    causalDigest: value.causalDigest,
  });
}

/**
 * Reauthenticates exact current-interval order. All records belong to one
 * committed world tick; sound ordinals and phases may have gaps for non-player
 * admissions but cannot run backward.
 */
export function canonicalizeSituatedExpressionCausalAuthorityLedger(
  value: unknown,
): SituatedExpressionCausalAuthorityLedger | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["records", "version"])
    || value.version !== SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION
    || !Array.isArray(value.records)
    || value.records.length > SITUATED_EXPRESSION_CAUSAL_AUTHORITY_MAX_RECORDS
  ) return null;
  const records: SituatedExpressionCausalAuthorityRecord[] = [];
  const eventIds = new Set<string>();
  const triggerIds = new Set<string>();
  let committedWorldTick: number | null = null;
  let priorPhase = -1;
  for (let index = 0; index < value.records.length; index += 1) {
    if (!(index in value.records)) return null;
    const record = canonicalizeSituatedExpressionCausalAuthorityRecord(value.records[index]);
    if (
      record === null
      || (records[index - 1]?.sampleOrdinal ?? -1) >= record.sampleOrdinal
      || eventIds.has(record.eventId)
      || triggerIds.has(record.triggerEventId)
      || (committedWorldTick !== null && record.committedWorldTick !== committedWorldTick)
      || record.admittedAtPlayerStepPhase < priorPhase
    ) return null;
    committedWorldTick ??= record.committedWorldTick;
    priorPhase = record.admittedAtPlayerStepPhase;
    eventIds.add(record.eventId);
    triggerIds.add(record.triggerEventId);
    records.push(record);
  }
  return freezeLedger(records);
}

/** Appends one exact authority record in complete-admission ordinal order. */
export function appendSituatedExpressionCausalAuthorityRecord(
  ledgerValue: unknown,
  recordValue: unknown,
): SituatedExpressionCausalAuthorityLedger | null {
  const ledger = canonicalizeSituatedExpressionCausalAuthorityLedger(ledgerValue);
  const record = canonicalizeSituatedExpressionCausalAuthorityRecord(recordValue);
  if (
    ledger === null
    || record === null
    || ledger.records.length >= SITUATED_EXPRESSION_CAUSAL_AUTHORITY_MAX_RECORDS
    || (ledger.records.at(-1)?.sampleOrdinal ?? -1) >= record.sampleOrdinal
  ) return null;
  return canonicalizeSituatedExpressionCausalAuthorityLedger({
    version: SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION,
    records: [...ledger.records, record],
  });
}

/** Proves one non-legacy player admission corresponds to one authority fact. */
export function situatedExpressionAdmissionMatchesCausalAuthority(
  admissionValue: unknown,
  authorityValue: unknown,
): boolean {
  const admission = canonicalPlayerAdmission(admissionValue);
  const authority = canonicalizeSituatedExpressionCausalAuthorityRecord(authorityValue);
  if (admission === null || authority === null) return false;
  const digest = situatedExpressionAdmissionCausalDigest(admission);
  return digest !== null
    && authority.eventId === admission.eventId
    && authority.sourceActorId === admission.sourceActorId
    && authority.triggerEventId === admission.triggerEventId
    && authority.sampleOrdinal === admission.sampleOrdinal
    && authority.admittedAtPlayerStepPhase === admission.admittedAtPlayerStepPhase
    && (admission.kind !== "player-exhaustion"
      || authority.committedWorldTick === admission.committedWorldTick)
    && authority.causalDigest === digest;
}

function canonicalPlayerAdmission(value: unknown): PlayerSituatedExpressionAdmissionRecord | null {
  const admission = canonicalizeSituatedExpressionAdmissionRecord(value);
  return admission?.kind === "player-traversal"
      || admission?.kind === "player-fall-recovery"
      || admission?.kind === "player-exhaustion"
    ? admission
    : null;
}

function freezeLedger(
  records: readonly SituatedExpressionCausalAuthorityRecord[],
): SituatedExpressionCausalAuthorityLedger {
  return Object.freeze({
    version: SITUATED_EXPRESSION_CAUSAL_AUTHORITY_VERSION,
    records: Object.freeze([...records]),
  });
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function canonicalDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
}

function canonicalSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return canonicalSafeInteger(value) && value >= 0;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return canonicalSafeInteger(value) && value >= minimum && value <= maximum;
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
