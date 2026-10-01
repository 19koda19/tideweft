import { FIXED_POINT } from "../sim/types";
import {
  situatedExpressionEventIdForTrigger,
} from "./situatedExpression";
import {
  LOCAL_PLAYER_LIVING_ACTOR_ID,
  livingSpeciesActorIdMatchesNamespace,
} from "./livingSpeciesRegistry";
import {
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";
import { SERIOUS_FALL_HAZARD } from "./fallRisk";
import { guardianDogShelterWhineTriggerEventId } from "./dogSignalExpression";
import {
  playerEffortExpressionPolicy,
  type PlayerEffortExpressionEvidence,
} from "./playerEffortExpression";

/** Bounded causal evidence retained for one player-perception interval. */
export const SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION = 1 as const;
export const SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS = 8 as const;
export const SITUATED_EXPRESSION_ADMISSION_MAX_PLAYER_STEP_PHASE = 9 as const;
export const SITUATED_EXPRESSION_ADMISSION_MAX_SEPARATED_ENTITY_IDS = 64 as const;

export const SITUATED_EXPRESSION_ADMISSION_KINDS = Object.freeze([
  "player-traversal",
  "player-fall-recovery",
  "player-exhaustion",
  "porter-heavy-departure",
  "guardian-dog-warning",
  "guardian-dog-defensive-growl",
  "guardian-dog-shelter-whine",
  "core-wildlife-fish-crow-alarm",
  "core-wildlife-alarm",
  "core-wildlife-weather-distress",
  "core-wildlife-pursuit-call",
  "human-danger-warning",
  "settlement-keeper-store-response",
  "resident-introduction",
  "resident-weather-hold",
  "legacy-v33-player",
] as const);
export type SituatedExpressionAdmissionKind =
  (typeof SITUATED_EXPRESSION_ADMISSION_KINDS)[number];

export const PLAYER_TRAVERSAL_EXPRESSION_CAUSAL_CLASSES = Object.freeze([
  "ordinary-stumble",
  "serious-stumble",
  "important-cargo-impact",
  "cargo-separation",
] as const);
export type PlayerTraversalExpressionCausalClass =
  (typeof PLAYER_TRAVERSAL_EXPRESSION_CAUSAL_CLASSES)[number];

export const PLAYER_TRAVERSAL_ADMISSION_INCIDENT_KINDS = Object.freeze([
  "stumble",
  "fall",
  "sweep",
] as const);
export type PlayerTraversalAdmissionIncidentKind =
  (typeof PLAYER_TRAVERSAL_ADMISSION_INCIDENT_KINDS)[number];

export const PLAYER_TRAVERSAL_ADMISSION_CARGO_OUTCOMES = Object.freeze([
  "unchanged",
  "impacted-carried",
  "separated",
] as const);
export type PlayerTraversalAdmissionCargoOutcome =
  (typeof PLAYER_TRAVERSAL_ADMISSION_CARGO_OUTCOMES)[number];

export const PLAYER_TRAVERSAL_ADMISSION_PAYLOAD_KINDS = Object.freeze([
  "promise",
  "gear",
  "crafting",
  "provision",
] as const);
export type PlayerTraversalAdmissionPayloadKind =
  (typeof PLAYER_TRAVERSAL_ADMISSION_PAYLOAD_KINDS)[number];

interface SituatedExpressionAdmissionRecordBase {
  readonly version: typeof SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION;
  readonly eventId: string;
  readonly sourceActorId: string;
  readonly triggerEventId: string;
  /** Exact index in the enclosing bounded ledger. */
  readonly sampleOrdinal: number;
  /** Fixed-player-step phase within the current 0..9 perception interval. */
  readonly admittedAtPlayerStepPhase: number;
  readonly kind: SituatedExpressionAdmissionKind;
}

export interface PlayerTraversalExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "player-traversal";
  readonly causalClass: PlayerTraversalExpressionCausalClass;
  readonly incidentKind: PlayerTraversalAdmissionIncidentKind;
  readonly hazardSeverity: number;
  readonly cargoOutcome: PlayerTraversalAdmissionCargoOutcome;
  readonly selectedPayloadKind: PlayerTraversalAdmissionPayloadKind | null;
  readonly cargoShock: number;
  readonly separatedEntityIds: readonly string[];
  readonly separationEventId: string | null;
}

export interface PlayerFallRecoveryExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "player-fall-recovery";
  readonly recoveryEventId: string;
  readonly recoveredEntityId: string;
}

export interface PlayerExhaustionExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase, PlayerEffortExpressionEvidence {
  readonly kind: "player-exhaustion";
}

export interface PorterHeavyDepartureExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "porter-heavy-departure";
  readonly receivedAtTick: number;
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  readonly hearingCertainty: number;
}

export interface GuardianDogWarningExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "guardian-dog-warning";
  readonly assignmentId: string;
  readonly activityTransactionId: string;
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

export interface GuardianDogDefensiveGrowlExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "guardian-dog-defensive-growl";
  readonly assignmentId: string;
  readonly activityTransactionId: string;
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
  /** Exact phase-zero hearing gate; later sleep transitions cannot rewrite receipt history. */
  readonly listenerWasSleepingAtAdmission: boolean;
}

export interface GuardianDogShelterWhineExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "guardian-dog-shelter-whine";
  readonly assignmentId: string;
  readonly activityTransactionId: string;
  readonly acceptedAtTick: number;
  /** Event-time positive fixed-point score of the shelter intent's weather condition. */
  readonly shelterIntentScore: number;
  /** Exact phase-zero hearing gate; later sleep transitions cannot rewrite receipt history. */
  readonly listenerWasSleepingAtAdmission: boolean;
}

export interface CoreWildlifeFishCrowAlarmExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "core-wildlife-fish-crow-alarm";
  /** Exact regional ecology owner of the committed physical actor. */
  readonly sourceOwnerKey: string;
  /** Direct aerial-predator observation retained by the crow, never exposed as dialogue. */
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

export type CoreWildlifeAlarmExpressionSpecies =
  | "fish-crow"
  | "deer"
  | "marsh-rabbit";

/**
 * Current species-aware alarm admission. The legacy fish-crow-only record
 * remains readable for supported development saves, while new alarms share
 * one bounded contract instead of growing a record kind per species.
 */
export interface CoreWildlifeAlarmExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "core-wildlife-alarm";
  readonly sourceSpecies: CoreWildlifeAlarmExpressionSpecies;
  /** Exact regional ecology owner of the committed physical actor. */
  readonly sourceOwnerKey: string;
  /** Exact causal observation retained by the animal, never exposed as prose. */
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

/** Exact causal authority for one domestic cat's committed rain-distress call. */
export interface CoreWildlifeWeatherDistressExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "core-wildlife-weather-distress";
  /** Exact regional ecology owner of the committed physical cat. */
  readonly sourceOwnerKey: string;
  /** Exact accepted rain-distress observation retained by the cat. */
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

/** Exact causal authority for one marsh fox's committed live-prey pursuit yip. */
export interface CoreWildlifePursuitCallExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "core-wildlife-pursuit-call";
  /** Exact regional ecology owner of the committed physical fox. */
  readonly sourceOwnerKey: string;
  /** Exact direct live-prey observation that caused the pursuit. */
  readonly sourceObservationId: string;
  /** Exact living target retained by both the observation and resource reference. */
  readonly targetActorId: string;
  readonly acceptedAtTick: number;
}

export interface HumanDangerWarningExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "human-danger-warning";
  /** Exact fresh belief observation that caused the warning. */
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

export interface SettlementKeeperStoreResponseExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "settlement-keeper-store-response";
  readonly storeId: string;
  readonly closureTransactionId: string;
  readonly sourceEvidenceId: string;
  readonly respondedAtTick: number;
  /** Recorded event-time listener pose, never present-time player authority. */
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  /** Null means the committed reply was masked from the player. */
  readonly hearingCertainty: number | null;
}

export interface ResidentIntroductionExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "resident-introduction";
  /** Exact accepted GREET command recorded by the simulation event. */
  readonly commandId: string;
  readonly introducedAtTick: number;
  readonly homeSettlementId: number;
  /** Recorded event-time listener pose, never present-time player authority. */
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  /** A committed acquaintance always has a heard-and-visible player receipt. */
  readonly hearingCertainty: number;
}

export type ResidentWeatherHoldReceptionKind =
  | "heard-visible"
  | "heard-unseen"
  | null;

export interface ResidentWeatherHoldExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "resident-weather-hold";
  /** Exact in-transit Promise whose carrier entered weather shelter. */
  readonly contractId: number;
  readonly shelteredAtTick: number;
  /** Event-time route locus; later travel cannot rewrite where this happened. */
  readonly eventRouteId: number;
  readonly eventRouteProgress: number;
  /** Recorded event-time listener pose, never present-time player authority. */
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  /** Sleep suppresses only the player's receipt, not the world expression. */
  readonly listenerWasSleepingAtAdmission: boolean;
  /** Null means the committed expression was not heard by the player. */
  readonly receptionKind: ResidentWeatherHoldReceptionKind;
  readonly hearingCertainty: number | null;
}

export interface LegacyV33PlayerExpressionAdmissionRecord
  extends SituatedExpressionAdmissionRecordBase {
  readonly kind: "legacy-v33-player";
}

export type SituatedExpressionAdmissionRecord =
  | PlayerTraversalExpressionAdmissionRecord
  | PlayerFallRecoveryExpressionAdmissionRecord
  | PlayerExhaustionExpressionAdmissionRecord
  | PorterHeavyDepartureExpressionAdmissionRecord
  | GuardianDogWarningExpressionAdmissionRecord
  | GuardianDogDefensiveGrowlExpressionAdmissionRecord
  | GuardianDogShelterWhineExpressionAdmissionRecord
  | CoreWildlifeFishCrowAlarmExpressionAdmissionRecord
  | CoreWildlifeAlarmExpressionAdmissionRecord
  | CoreWildlifeWeatherDistressExpressionAdmissionRecord
  | CoreWildlifePursuitCallExpressionAdmissionRecord
  | HumanDangerWarningExpressionAdmissionRecord
  | SettlementKeeperStoreResponseExpressionAdmissionRecord
  | ResidentIntroductionExpressionAdmissionRecord
  | ResidentWeatherHoldExpressionAdmissionRecord
  | LegacyV33PlayerExpressionAdmissionRecord;

interface SituatedExpressionAdmissionInputBase {
  readonly sourceActorId: string;
  readonly triggerEventId: string;
  readonly sampleOrdinal: number;
  readonly admittedAtPlayerStepPhase: number;
}

export interface PlayerTraversalExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly causalClass: PlayerTraversalExpressionCausalClass;
  readonly incidentKind: PlayerTraversalAdmissionIncidentKind;
  readonly hazardSeverity: number;
  readonly cargoOutcome: PlayerTraversalAdmissionCargoOutcome;
  readonly selectedPayloadKind: PlayerTraversalAdmissionPayloadKind | null;
  readonly cargoShock: number;
  readonly separatedEntityIds: readonly string[];
  readonly separationEventId: string | null;
}

export interface PlayerFallRecoveryExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly recoveryEventId: string;
  readonly recoveredEntityId: string;
}

export interface PlayerExhaustionExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase, PlayerEffortExpressionEvidence {}

export interface PorterHeavyDepartureExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly receivedAtTick: number;
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  readonly hearingCertainty: number;
}

export interface GuardianDogWarningExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly assignmentId: string;
  readonly activityTransactionId: string;
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

export interface GuardianDogDefensiveGrowlExpressionAdmissionInput
  extends GuardianDogWarningExpressionAdmissionInput {
  readonly listenerWasSleepingAtAdmission: boolean;
}

export interface GuardianDogShelterWhineExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly assignmentId: string;
  readonly activityTransactionId: string;
  readonly acceptedAtTick: number;
  readonly shelterIntentScore: number;
  readonly listenerWasSleepingAtAdmission: boolean;
}

export interface CoreWildlifeFishCrowAlarmExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly sourceOwnerKey: string;
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

export interface CoreWildlifeAlarmExpressionAdmissionInput
  extends CoreWildlifeFishCrowAlarmExpressionAdmissionInput {
  readonly sourceSpecies: CoreWildlifeAlarmExpressionSpecies;
}

export interface CoreWildlifeWeatherDistressExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly sourceOwnerKey: string;
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

export interface CoreWildlifePursuitCallExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly sourceOwnerKey: string;
  readonly sourceObservationId: string;
  readonly targetActorId: string;
  readonly acceptedAtTick: number;
}

export interface HumanDangerWarningExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly sourceObservationId: string;
  readonly acceptedAtTick: number;
}

export interface SettlementKeeperStoreResponseExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly storeId: string;
  readonly closureTransactionId: string;
  readonly sourceEvidenceId: string;
  readonly respondedAtTick: number;
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  readonly hearingCertainty: number | null;
}

export interface ResidentIntroductionExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly commandId: string;
  readonly introducedAtTick: number;
  readonly homeSettlementId: number;
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  readonly hearingCertainty: number;
}

export interface ResidentWeatherHoldExpressionAdmissionInput
  extends SituatedExpressionAdmissionInputBase {
  readonly contractId: number;
  readonly shelteredAtTick: number;
  readonly eventRouteId: number;
  readonly eventRouteProgress: number;
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  readonly listenerWasSleepingAtAdmission: boolean;
  readonly receptionKind: ResidentWeatherHoldReceptionKind;
  readonly hearingCertainty: number | null;
}

export type LegacyV33PlayerExpressionAdmissionInput = SituatedExpressionAdmissionInputBase;

export interface SituatedExpressionAdmissionLedger {
  readonly version: typeof SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION;
  readonly records: readonly SituatedExpressionAdmissionRecord[];
}

/** Creates the sole canonical empty ledger. */
export function createSituatedExpressionAdmissionLedger(): SituatedExpressionAdmissionLedger {
  return freezeLedger([]);
}

/** Creates one traversal admission from committed causal facts. */
export function createPlayerTraversalExpressionAdmissionRecord(
  input: PlayerTraversalExpressionAdmissionInput,
): PlayerTraversalExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "cargoOutcome",
    "cargoShock",
    "causalClass",
    "hazardSeverity",
    "incidentKind",
    "sampleOrdinal",
    "selectedPayloadKind",
    "separatedEntityIds",
    "separationEventId",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "player-traversal",
    causalClass: value.causalClass,
    incidentKind: value.incidentKind,
    hazardSeverity: value.hazardSeverity,
    cargoOutcome: value.cargoOutcome,
    selectedPayloadKind: value.selectedPayloadKind,
    cargoShock: value.cargoShock,
    separatedEntityIds: value.separatedEntityIds,
    separationEventId: value.separationEventId,
  }) as PlayerTraversalExpressionAdmissionRecord | null;
}

/** Creates one recovery admission tied to the committed recovery event. */
export function createPlayerFallRecoveryExpressionAdmissionRecord(
  input: PlayerFallRecoveryExpressionAdmissionInput,
): PlayerFallRecoveryExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "recoveredEntityId",
    "recoveryEventId",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "player-fall-recovery",
    recoveryEventId: value.recoveryEventId,
    recoveredEntityId: value.recoveredEntityId,
  }) as PlayerFallRecoveryExpressionAdmissionRecord | null;
}

/** Creates one effort admission from an exact committed dry exhaustion step. */
export function createPlayerExhaustionExpressionAdmissionRecord(
  input: PlayerExhaustionExpressionAdmissionInput,
): PlayerExhaustionExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedDistanceUnits",
    "admittedAtPlayerStepPhase",
    "committedWorldTick",
    "resolution",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "player-exhaustion",
    committedWorldTick: value.committedWorldTick,
    acceptedDistanceUnits: value.acceptedDistanceUnits,
    resolution: value.resolution,
  }) as PlayerExhaustionExpressionAdmissionRecord | null;
}

/** Creates one porter departure admission with the exact player receipt context. */
export function createPorterHeavyDepartureExpressionAdmissionRecord(
  input: PorterHeavyDepartureExpressionAdmissionInput,
): PorterHeavyDepartureExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "hearingCertainty",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "receivedAtTick",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "porter-heavy-departure",
    receivedAtTick: value.receivedAtTick,
    listenerPosition: value.listenerPosition,
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    hearingCertainty: value.hearingCertainty,
  }) as PorterHeavyDepartureExpressionAdmissionRecord | null;
}

/** Creates one world-authoritative guardian warning admission. */
export function createGuardianDogWarningExpressionAdmissionRecord(
  input: GuardianDogWarningExpressionAdmissionInput,
): GuardianDogWarningExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedAtTick",
    "activityTransactionId",
    "admittedAtPlayerStepPhase",
    "assignmentId",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "guardian-dog-warning",
    assignmentId: value.assignmentId,
    activityTransactionId: value.activityTransactionId,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  }) as GuardianDogWarningExpressionAdmissionRecord | null;
}

/** Creates one world-authoritative, threat-backed defensive growl admission. */
export function createGuardianDogDefensiveGrowlExpressionAdmissionRecord(
  input: GuardianDogDefensiveGrowlExpressionAdmissionInput,
): GuardianDogDefensiveGrowlExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedAtTick",
    "activityTransactionId",
    "admittedAtPlayerStepPhase",
    "assignmentId",
    "listenerWasSleepingAtAdmission",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "guardian-dog-defensive-growl",
    assignmentId: value.assignmentId,
    activityTransactionId: value.activityTransactionId,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
    listenerWasSleepingAtAdmission: value.listenerWasSleepingAtAdmission,
  }) as GuardianDogDefensiveGrowlExpressionAdmissionRecord | null;
}

/** Creates one world-authoritative, shelter-seeking whine admission. */
export function createGuardianDogShelterWhineExpressionAdmissionRecord(
  input: GuardianDogShelterWhineExpressionAdmissionInput,
): GuardianDogShelterWhineExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedAtTick",
    "activityTransactionId",
    "admittedAtPlayerStepPhase",
    "assignmentId",
    "listenerWasSleepingAtAdmission",
    "sampleOrdinal",
    "shelterIntentScore",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "guardian-dog-shelter-whine",
    assignmentId: value.assignmentId,
    activityTransactionId: value.activityTransactionId,
    acceptedAtTick: value.acceptedAtTick,
    shelterIntentScore: value.shelterIntentScore,
    listenerWasSleepingAtAdmission: value.listenerWasSleepingAtAdmission,
  }) as GuardianDogShelterWhineExpressionAdmissionRecord | null;
}

/** Creates one regional-ecology-owned, direct-threat fish-crow alarm admission. */
export function createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord(
  input: CoreWildlifeFishCrowAlarmExpressionAdmissionInput,
): CoreWildlifeFishCrowAlarmExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "sourceOwnerKey",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "core-wildlife-fish-crow-alarm",
    sourceOwnerKey: value.sourceOwnerKey,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  }) as CoreWildlifeFishCrowAlarmExpressionAdmissionRecord | null;
}

/** Creates one species-aware regional-ecology alarm admission. */
export function createCoreWildlifeAlarmExpressionAdmissionRecord(
  input: CoreWildlifeAlarmExpressionAdmissionInput,
): CoreWildlifeAlarmExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "sourceOwnerKey",
    "sourceSpecies",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "core-wildlife-alarm",
    sourceSpecies: value.sourceSpecies,
    sourceOwnerKey: value.sourceOwnerKey,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  }) as CoreWildlifeAlarmExpressionAdmissionRecord | null;
}

/** Creates one regional-ecology-owned domestic-cat rain-distress admission. */
export function createCoreWildlifeWeatherDistressExpressionAdmissionRecord(
  input: CoreWildlifeWeatherDistressExpressionAdmissionInput,
): CoreWildlifeWeatherDistressExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "sourceOwnerKey",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "core-wildlife-weather-distress",
    sourceOwnerKey: value.sourceOwnerKey,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  }) as CoreWildlifeWeatherDistressExpressionAdmissionRecord | null;
}

/** Creates one regional-ecology-owned marsh-fox live-prey pursuit admission. */
export function createCoreWildlifePursuitCallExpressionAdmissionRecord(
  input: CoreWildlifePursuitCallExpressionAdmissionInput,
): CoreWildlifePursuitCallExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "sourceOwnerKey",
    "targetActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "core-wildlife-pursuit-call",
    sourceOwnerKey: value.sourceOwnerKey,
    sourceObservationId: value.sourceObservationId,
    targetActorId: value.targetActorId as string,
    acceptedAtTick: value.acceptedAtTick,
  }) as CoreWildlifePursuitCallExpressionAdmissionRecord | null;
}

/** Creates one source-honest human warning admission from fresh perception. */
export function createHumanDangerWarningExpressionAdmissionRecord(
  input: HumanDangerWarningExpressionAdmissionInput,
): HumanDangerWarningExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "human-danger-warning",
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  }) as HumanDangerWarningExpressionAdmissionRecord | null;
}

/** Creates one exact store-closure reply with its event-time player receipt. */
export function createSettlementKeeperStoreResponseExpressionAdmissionRecord(
  input: SettlementKeeperStoreResponseExpressionAdmissionInput,
): SettlementKeeperStoreResponseExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "closureTransactionId",
    "hearingCertainty",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "respondedAtTick",
    "sampleOrdinal",
    "sourceActorId",
    "sourceEvidenceId",
    "storeId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "settlement-keeper-store-response",
    storeId: value.storeId,
    closureTransactionId: value.closureTransactionId,
    sourceEvidenceId: value.sourceEvidenceId,
    respondedAtTick: value.respondedAtTick,
    listenerPosition: value.listenerPosition,
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    hearingCertainty: value.hearingCertainty,
  }) as SettlementKeeperStoreResponseExpressionAdmissionRecord | null;
}

/** Creates one exact resident introduction with its event-time player receipt. */
export function createResidentIntroductionExpressionAdmissionRecord(
  input: ResidentIntroductionExpressionAdmissionInput,
): ResidentIntroductionExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "commandId",
    "hearingCertainty",
    "homeSettlementId",
    "introducedAtTick",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "resident-introduction",
    commandId: value.commandId,
    introducedAtTick: value.introducedAtTick,
    homeSettlementId: value.homeSettlementId,
    listenerPosition: value.listenerPosition,
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    hearingCertainty: value.hearingCertainty,
  }) as ResidentIntroductionExpressionAdmissionRecord | null;
}

/** Creates one exact resident weather hold with its event-time player receipt. */
export function createResidentWeatherHoldExpressionAdmissionRecord(
  input: ResidentWeatherHoldExpressionAdmissionInput,
): ResidentWeatherHoldExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "contractId",
    "eventRouteId",
    "eventRouteProgress",
    "hearingCertainty",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "listenerWasSleepingAtAdmission",
    "receptionKind",
    "sampleOrdinal",
    "shelteredAtTick",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "resident-weather-hold",
    contractId: value.contractId,
    shelteredAtTick: value.shelteredAtTick,
    eventRouteId: value.eventRouteId,
    eventRouteProgress: value.eventRouteProgress,
    listenerPosition: value.listenerPosition,
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    listenerWasSleepingAtAdmission: value.listenerWasSleepingAtAdmission,
    receptionKind: value.receptionKind,
    hearingCertainty: value.hearingCertainty,
  }) as ResidentWeatherHoldExpressionAdmissionRecord | null;
}

/** Creates bounded compatibility evidence for one uniquely migrated v33 player line. */
export function createLegacyV33PlayerExpressionAdmissionRecord(
  input: LegacyV33PlayerExpressionAdmissionInput,
): LegacyV33PlayerExpressionAdmissionRecord | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
  ])) return null;
  const eventId = eventIdFor(value);
  return eventId === null ? null : canonicalizeSituatedExpressionAdmissionRecord({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId,
    sourceActorId: value.sourceActorId,
    triggerEventId: value.triggerEventId,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "legacy-v33-player",
  }) as LegacyV33PlayerExpressionAdmissionRecord | null;
}

/**
 * Reauthenticates one exact record. Unknown keys, noncanonical numbers, forged
 * event identity, contradictory cargo evidence, and unbounded arrays fail closed.
 */
export function canonicalizeSituatedExpressionAdmissionRecord(
  value: unknown,
): SituatedExpressionAdmissionRecord | null {
  if (!plainRecord(value) || !validBase(value)) return null;
  switch (value.kind) {
    case "player-traversal": return canonicalTraversalRecord(value);
    case "player-fall-recovery": return canonicalRecoveryRecord(value);
    case "player-exhaustion": return canonicalExhaustionRecord(value);
    case "porter-heavy-departure": return canonicalPorterRecord(value);
    case "guardian-dog-warning": return canonicalGuardianDogRecord(value);
    case "guardian-dog-defensive-growl": return canonicalGuardianDogGrowlRecord(value);
    case "guardian-dog-shelter-whine": return canonicalGuardianDogShelterWhineRecord(value);
    case "core-wildlife-fish-crow-alarm": return canonicalFishCrowAlarmRecord(value);
    case "core-wildlife-alarm": return canonicalCoreWildlifeAlarmRecord(value);
    case "core-wildlife-weather-distress": return canonicalCoreWildlifeWeatherDistressRecord(value);
    case "core-wildlife-pursuit-call": return canonicalCoreWildlifePursuitCallRecord(value);
    case "human-danger-warning": return canonicalHumanDangerWarningRecord(value);
    case "settlement-keeper-store-response": return canonicalSettlementKeeperStoreResponseRecord(value);
    case "resident-introduction": return canonicalResidentIntroductionRecord(value);
    case "resident-weather-hold": return canonicalResidentWeatherHoldRecord(value);
    case "legacy-v33-player": return canonicalLegacyRecord(value);
    default: return null;
  }
}

/**
 * Reauthenticates exact ledger order. Sample ordinals are positional rather
 * than sortable metadata, and one source cannot repeat the same trigger.
 */
export function canonicalizeSituatedExpressionAdmissionLedger(
  value: unknown,
): SituatedExpressionAdmissionLedger | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["records", "version"])
    || value.version !== SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION
    || !Array.isArray(value.records)
    || value.records.length > SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS
  ) return null;
  const records: SituatedExpressionAdmissionRecord[] = [];
  const eventIds = new Set<string>();
  const sourceTriggers = new Set<string>();
  for (let index = 0; index < value.records.length; index += 1) {
    if (!(index in value.records)) return null;
    const record = canonicalizeSituatedExpressionAdmissionRecord(value.records[index]);
    if (record === null || record.sampleOrdinal !== index || eventIds.has(record.eventId)) {
      return null;
    }
    const sourceTrigger = `${record.sourceActorId.length}:${record.sourceActorId}${record.triggerEventId}`;
    if (sourceTriggers.has(sourceTrigger)) return null;
    eventIds.add(record.eventId);
    sourceTriggers.add(sourceTrigger);
    records.push(record);
  }
  return freezeLedger(records);
}

/** Appends an already constructed exact record at its positional ordinal. */
export function appendSituatedExpressionAdmissionRecord(
  ledgerValue: unknown,
  recordValue: unknown,
): SituatedExpressionAdmissionLedger | null {
  const ledger = canonicalizeSituatedExpressionAdmissionLedger(ledgerValue);
  const record = canonicalizeSituatedExpressionAdmissionRecord(recordValue);
  if (
    ledger === null
    || record === null
    || ledger.records.length >= SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS
    || record.sampleOrdinal !== ledger.records.length
  ) return null;
  return canonicalizeSituatedExpressionAdmissionLedger({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    records: [...ledger.records, record],
  });
}

function canonicalTraversalRecord(
  value: Readonly<Record<string, unknown>>,
): PlayerTraversalExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "cargoOutcome",
    "cargoShock",
    "causalClass",
    "eventId",
    "hazardSeverity",
    "incidentKind",
    "kind",
    "sampleOrdinal",
    "selectedPayloadKind",
    "separatedEntityIds",
    "separationEventId",
    "sourceActorId",
    "triggerEventId",
    "version",
  ]) || value.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || !isCausalClass(value.causalClass)
    || !isIncidentKind(value.incidentKind)
    || !boundedUnit(value.hazardSeverity)
    || !isCargoOutcome(value.cargoOutcome)
    || !(value.selectedPayloadKind === null || isPayloadKind(value.selectedPayloadKind))
    || !boundedUnit(value.cargoShock)
    || !Array.isArray(value.separatedEntityIds)
    || value.separatedEntityIds.length > SITUATED_EXPRESSION_ADMISSION_MAX_SEPARATED_ENTITY_IDS
  ) return null;
  const separatedEntityIds: string[] = [];
  const uniqueIds = new Set<string>();
  for (let index = 0; index < value.separatedEntityIds.length; index += 1) {
    if (!(index in value.separatedEntityIds)) return null;
    const id = value.separatedEntityIds[index];
    if (!validId(id) || uniqueIds.has(id)) return null;
    uniqueIds.add(id);
    separatedEntityIds.push(id);
  }
  separatedEntityIds.sort(compareText);
  const separated = value.cargoOutcome === "separated";
  const ordinaryStumble = value.causalClass === "ordinary-stumble";
  const seriousStumble = value.causalClass === "serious-stumble";
  const importantCargoImpact = value.causalClass === "important-cargo-impact";
  if (
    separated !== (separatedEntityIds.length > 0)
    || (separated
      ? !validId(value.separationEventId)
      : value.separationEventId !== null)
    || (value.cargoOutcome === "unchanged") !== (value.selectedPayloadKind === null)
    || (value.causalClass === "cargo-separation") !== separated
    || (separated && value.incidentKind === "stumble")
    || (importantCargoImpact
      && (value.cargoOutcome !== "impacted-carried"
        || (value.selectedPayloadKind !== "promise" && value.selectedPayloadKind !== "gear")
        || (value.incidentKind === "stumble" && value.cargoShock < 260_000)))
    || ((ordinaryStumble || seriousStumble)
      && value.incidentKind !== "stumble")
    || (ordinaryStumble && value.hazardSeverity >= SERIOUS_FALL_HAZARD)
    || (seriousStumble && value.hazardSeverity < SERIOUS_FALL_HAZARD)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "player-traversal",
    causalClass: value.causalClass,
    incidentKind: value.incidentKind,
    hazardSeverity: value.hazardSeverity as number,
    cargoOutcome: value.cargoOutcome,
    selectedPayloadKind: value.selectedPayloadKind,
    cargoShock: value.cargoShock as number,
    separatedEntityIds: Object.freeze(separatedEntityIds),
    separationEventId: value.separationEventId as string | null,
  });
}

function canonicalRecoveryRecord(
  value: Readonly<Record<string, unknown>>,
): PlayerFallRecoveryExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "eventId",
    "kind",
    "recoveredEntityId",
    "recoveryEventId",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
    "version",
  ]) || value.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || !validId(value.recoveryEventId)
    || value.recoveryEventId !== value.triggerEventId
    || !validId(value.recoveredEntityId)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "player-fall-recovery",
    recoveryEventId: value.recoveryEventId,
    recoveredEntityId: value.recoveredEntityId,
  });
}

function canonicalExhaustionRecord(
  value: Readonly<Record<string, unknown>>,
): PlayerExhaustionExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "acceptedDistanceUnits",
    "admittedAtPlayerStepPhase",
    "committedWorldTick",
    "eventId",
    "kind",
    "resolution",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
    "version",
  ]) || value.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID) return null;
  const evidence = {
    committedWorldTick: value.committedWorldTick,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    acceptedDistanceUnits: value.acceptedDistanceUnits,
    resolution: value.resolution,
  } as PlayerEffortExpressionEvidence;
  const policy = playerEffortExpressionPolicy(value.sourceActorId, evidence);
  if (policy === null || value.triggerEventId !== policy.triggerEventId) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    triggerEventId: policy.triggerEventId,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: evidence.admittedAtPlayerStepPhase,
    kind: "player-exhaustion",
    committedWorldTick: evidence.committedWorldTick,
    acceptedDistanceUnits: evidence.acceptedDistanceUnits,
    resolution: "dry-exhaustion-camp",
  });
}

function canonicalPorterRecord(
  value: Readonly<Record<string, unknown>>,
): PorterHeavyDepartureExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "eventId",
    "hearingCertainty",
    "kind",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "receivedAtTick",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
    "version",
  ]) || !nonnegativeSafeInteger(value.receivedAtTick)
    || value.admittedAtPlayerStepPhase !== 0
    || !canonicalSafeInteger(value.listenerFacingMilliRadians)
    || !positiveBoundedUnit(value.hearingCertainty)
    || !isWorldPosition(value.listenerPosition)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "porter-heavy-departure",
    receivedAtTick: value.receivedAtTick,
    listenerPosition: createWorldPosition(
      value.listenerPosition.region,
      value.listenerPosition.localX,
      value.listenerPosition.localY,
    ),
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    hearingCertainty: value.hearingCertainty,
  });
}

function canonicalGuardianDogRecord(
  value: Readonly<Record<string, unknown>>,
): GuardianDogWarningExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "acceptedAtTick",
    "activityTransactionId",
    "admittedAtPlayerStepPhase",
    "assignmentId",
    "eventId",
    "kind",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "triggerEventId",
    "version",
  ])
    || value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.admittedAtPlayerStepPhase !== 0
    || !validId(value.assignmentId)
    || !validId(value.activityTransactionId)
    || value.activityTransactionId !== value.triggerEventId
    || !validId(value.sourceObservationId)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "guardian-dog-warning",
    assignmentId: value.assignmentId,
    activityTransactionId: value.activityTransactionId,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  });
}

function canonicalGuardianDogGrowlRecord(
  value: Readonly<Record<string, unknown>>,
): GuardianDogDefensiveGrowlExpressionAdmissionRecord | null {
  if (typeof value.listenerWasSleepingAtAdmission !== "boolean") return null;
  const {
    listenerWasSleepingAtAdmission,
    ...warningFields
  } = value;
  const warningShape = canonicalGuardianDogRecord({
    ...warningFields,
    kind: "guardian-dog-warning",
  });
  if (warningShape === null || value.kind !== "guardian-dog-defensive-growl") return null;
  return Object.freeze({
    ...warningShape,
    kind: "guardian-dog-defensive-growl",
    listenerWasSleepingAtAdmission,
  });
}

function canonicalGuardianDogShelterWhineRecord(
  value: Readonly<Record<string, unknown>>,
): GuardianDogShelterWhineExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "acceptedAtTick",
    "activityTransactionId",
    "admittedAtPlayerStepPhase",
    "assignmentId",
    "eventId",
    "kind",
    "listenerWasSleepingAtAdmission",
    "sampleOrdinal",
    "shelterIntentScore",
    "sourceActorId",
    "triggerEventId",
    "version",
  ])
    || value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.admittedAtPlayerStepPhase !== 0
    || value.kind !== "guardian-dog-shelter-whine"
    || !validId(value.assignmentId)
    || !validId(value.activityTransactionId)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
    || !positiveBoundedUnit(value.shelterIntentScore)
    || typeof value.listenerWasSleepingAtAdmission !== "boolean"
  ) return null;
  const expectedTriggerEventId = guardianDogShelterWhineTriggerEventId(
    value.activityTransactionId as string,
    value.shelterIntentScore as number,
  );
  if (expectedTriggerEventId === null || value.triggerEventId !== expectedTriggerEventId) {
    return null;
  }
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "guardian-dog-shelter-whine",
    assignmentId: value.assignmentId,
    activityTransactionId: value.activityTransactionId,
    acceptedAtTick: value.acceptedAtTick,
    shelterIntentScore: value.shelterIntentScore,
    listenerWasSleepingAtAdmission: value.listenerWasSleepingAtAdmission,
  });
}

function canonicalFishCrowAlarmRecord(
  value: Readonly<Record<string, unknown>>,
): CoreWildlifeFishCrowAlarmExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "eventId",
    "kind",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "sourceOwnerKey",
    "triggerEventId",
    "version",
  ])
    || value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.admittedAtPlayerStepPhase !== 0
    || value.kind !== "core-wildlife-fish-crow-alarm"
    || !validId(value.sourceOwnerKey)
    || !validId(value.sourceObservationId)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "core-wildlife-fish-crow-alarm",
    sourceOwnerKey: value.sourceOwnerKey,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  });
}

function canonicalCoreWildlifeAlarmRecord(
  value: Readonly<Record<string, unknown>>,
): CoreWildlifeAlarmExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "eventId",
    "kind",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "sourceOwnerKey",
    "sourceSpecies",
    "triggerEventId",
    "version",
  ])
    || value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.admittedAtPlayerStepPhase !== 0
    || value.kind !== "core-wildlife-alarm"
    || (value.sourceSpecies !== "fish-crow"
      && value.sourceSpecies !== "deer"
      && value.sourceSpecies !== "marsh-rabbit")
    || !validId(value.sourceOwnerKey)
    || !validId(value.sourceObservationId)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "core-wildlife-alarm",
    sourceSpecies: value.sourceSpecies,
    sourceOwnerKey: value.sourceOwnerKey,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  });
}

function canonicalCoreWildlifeWeatherDistressRecord(
  value: Readonly<Record<string, unknown>>,
): CoreWildlifeWeatherDistressExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "eventId",
    "kind",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "sourceOwnerKey",
    "triggerEventId",
    "version",
  ])
    || value.kind !== "core-wildlife-weather-distress"
    || !livingSpeciesActorIdMatchesNamespace(value.sourceActorId, "domestic-cat")
    || value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.admittedAtPlayerStepPhase !== 0
    || !validId(value.sourceOwnerKey)
    || !validId(value.sourceObservationId)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: 0,
    kind: "core-wildlife-weather-distress",
    sourceOwnerKey: value.sourceOwnerKey,
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  });
}

function canonicalCoreWildlifePursuitCallRecord(
  value: Readonly<Record<string, unknown>>,
): CoreWildlifePursuitCallExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "eventId",
    "kind",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "sourceOwnerKey",
    "targetActorId",
    "triggerEventId",
    "version",
  ])
    || value.kind !== "core-wildlife-pursuit-call"
    || !livingSpeciesActorIdMatchesNamespace(value.sourceActorId, "marsh-fox")
    || !livingSpeciesActorIdMatchesNamespace(value.targetActorId, "marsh-rabbit")
    || value.sourceActorId === value.targetActorId
    || value.admittedAtPlayerStepPhase !== 0
    || !validId(value.sourceOwnerKey)
    || !validId(value.sourceObservationId)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: 0,
    kind: "core-wildlife-pursuit-call",
    sourceOwnerKey: value.sourceOwnerKey,
    sourceObservationId: value.sourceObservationId,
    targetActorId: value.targetActorId as string,
    acceptedAtTick: value.acceptedAtTick,
  });
}

function canonicalHumanDangerWarningRecord(
  value: Readonly<Record<string, unknown>>,
): HumanDangerWarningExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "acceptedAtTick",
    "admittedAtPlayerStepPhase",
    "eventId",
    "kind",
    "sampleOrdinal",
    "sourceActorId",
    "sourceObservationId",
    "triggerEventId",
    "version",
  ])
    || value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.admittedAtPlayerStepPhase !== 0
    || value.kind !== "human-danger-warning"
    || !validId(value.sourceObservationId)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "human-danger-warning",
    sourceObservationId: value.sourceObservationId,
    acceptedAtTick: value.acceptedAtTick,
  });
}

function canonicalSettlementKeeperStoreResponseRecord(
  value: Readonly<Record<string, unknown>>,
): SettlementKeeperStoreResponseExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "closureTransactionId",
    "eventId",
    "hearingCertainty",
    "kind",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "respondedAtTick",
    "sampleOrdinal",
    "sourceActorId",
    "sourceEvidenceId",
    "storeId",
    "triggerEventId",
    "version",
  ])
    || value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.kind !== "settlement-keeper-store-response"
    || !validId(value.storeId)
    || !validId(value.closureTransactionId)
    || value.triggerEventId !== value.closureTransactionId
    || !validId(value.sourceEvidenceId)
    || !nonnegativeSafeInteger(value.respondedAtTick)
    || !isWorldPosition(value.listenerPosition)
    || !canonicalSafeInteger(value.listenerFacingMilliRadians)
    || !(value.hearingCertainty === null || positiveBoundedUnit(value.hearingCertainty))
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "settlement-keeper-store-response",
    storeId: value.storeId,
    closureTransactionId: value.closureTransactionId,
    sourceEvidenceId: value.sourceEvidenceId,
    respondedAtTick: value.respondedAtTick,
    listenerPosition: createWorldPosition(
      value.listenerPosition.region,
      value.listenerPosition.localX,
      value.listenerPosition.localY,
    ),
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    hearingCertainty: value.hearingCertainty,
  });
}

function canonicalResidentIntroductionRecord(
  value: Readonly<Record<string, unknown>>,
): ResidentIntroductionExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "commandId",
    "eventId",
    "hearingCertainty",
    "homeSettlementId",
    "introducedAtTick",
    "kind",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
    "version",
  ])
    || value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.kind !== "resident-introduction"
    || value.admittedAtPlayerStepPhase !== 0
    || !validId(value.commandId)
    || !nonnegativeSafeInteger(value.introducedAtTick)
    || !nonnegativeSafeInteger(value.homeSettlementId)
    || !isWorldPosition(value.listenerPosition)
    || !canonicalSafeInteger(value.listenerFacingMilliRadians)
    || !positiveBoundedUnit(value.hearingCertainty)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: 0,
    kind: "resident-introduction",
    commandId: value.commandId,
    introducedAtTick: value.introducedAtTick,
    homeSettlementId: value.homeSettlementId,
    listenerPosition: createWorldPosition(
      value.listenerPosition.region,
      value.listenerPosition.localX,
      value.listenerPosition.localY,
    ),
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    hearingCertainty: value.hearingCertainty,
  });
}

function canonicalResidentWeatherHoldRecord(
  value: Readonly<Record<string, unknown>>,
): ResidentWeatherHoldExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "contractId",
    "eventId",
    "eventRouteId",
    "eventRouteProgress",
    "hearingCertainty",
    "kind",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "listenerWasSleepingAtAdmission",
    "receptionKind",
    "sampleOrdinal",
    "shelteredAtTick",
    "sourceActorId",
    "triggerEventId",
    "version",
  ])) return null;
  const receptionPairValid = value.listenerWasSleepingAtAdmission === true
    ? value.receptionKind === null && value.hearingCertainty === null
    : value.receptionKind === null
      ? value.hearingCertainty === null
      : (value.receptionKind === "heard-visible" || value.receptionKind === "heard-unseen")
        && positiveBoundedUnit(value.hearingCertainty);
  if (
    value.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
    || value.kind !== "resident-weather-hold"
    || value.admittedAtPlayerStepPhase !== 0
    || !positiveSafeInteger(value.contractId)
    || !nonnegativeSafeInteger(value.shelteredAtTick)
    || !positiveSafeInteger(value.eventRouteId)
    || !boundedInteger(value.eventRouteProgress, 0, FIXED_POINT)
    || !isWorldPosition(value.listenerPosition)
    || !canonicalSafeInteger(value.listenerFacingMilliRadians)
    || typeof value.listenerWasSleepingAtAdmission !== "boolean"
    || !receptionPairValid
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: 0,
    kind: "resident-weather-hold",
    contractId: value.contractId,
    shelteredAtTick: value.shelteredAtTick,
    eventRouteId: value.eventRouteId,
    eventRouteProgress: value.eventRouteProgress,
    listenerPosition: createWorldPosition(
      value.listenerPosition.region,
      value.listenerPosition.localX,
      value.listenerPosition.localY,
    ),
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    listenerWasSleepingAtAdmission: value.listenerWasSleepingAtAdmission,
    receptionKind: value.receptionKind as ResidentWeatherHoldReceptionKind,
    hearingCertainty: value.hearingCertainty as number | null,
  });
}

function canonicalLegacyRecord(
  value: Readonly<Record<string, unknown>>,
): LegacyV33PlayerExpressionAdmissionRecord | null {
  if (!exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "eventId",
    "kind",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
    "version",
  ]) || value.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId as string,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal as number,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase as number,
    kind: "legacy-v33-player",
  });
}

function validBase(value: Readonly<Record<string, unknown>>): boolean {
  const expectedEventId = situatedExpressionEventIdForTrigger(
    value.sourceActorId,
    value.triggerEventId,
  );
  return value.version === SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION
    && expectedEventId !== null
    && value.eventId === expectedEventId
    && boundedInteger(value.sampleOrdinal, 0, SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS - 1)
    && boundedInteger(
      value.admittedAtPlayerStepPhase,
      0,
      SITUATED_EXPRESSION_ADMISSION_MAX_PLAYER_STEP_PHASE,
    );
}

function eventIdFor(value: Readonly<Record<string, unknown>>): string | null {
  return situatedExpressionEventIdForTrigger(value.sourceActorId, value.triggerEventId);
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isCausalClass(value: unknown): value is PlayerTraversalExpressionCausalClass {
  return typeof value === "string"
    && PLAYER_TRAVERSAL_EXPRESSION_CAUSAL_CLASSES.includes(
      value as PlayerTraversalExpressionCausalClass,
    );
}

function isIncidentKind(value: unknown): value is PlayerTraversalAdmissionIncidentKind {
  return typeof value === "string"
    && PLAYER_TRAVERSAL_ADMISSION_INCIDENT_KINDS.includes(
      value as PlayerTraversalAdmissionIncidentKind,
    );
}

function isCargoOutcome(value: unknown): value is PlayerTraversalAdmissionCargoOutcome {
  return typeof value === "string"
    && PLAYER_TRAVERSAL_ADMISSION_CARGO_OUTCOMES.includes(
      value as PlayerTraversalAdmissionCargoOutcome,
    );
}

function isPayloadKind(value: unknown): value is PlayerTraversalAdmissionPayloadKind {
  return typeof value === "string"
    && PLAYER_TRAVERSAL_ADMISSION_PAYLOAD_KINDS.includes(
      value as PlayerTraversalAdmissionPayloadKind,
    );
}

function canonicalSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return canonicalSafeInteger(value) && value >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return canonicalSafeInteger(value) && value >= minimum && value <= maximum;
}

function boundedUnit(value: unknown): value is number {
  return boundedInteger(value, 0, 1_000_000);
}

function positiveBoundedUnit(value: unknown): value is number {
  return boundedInteger(value, 1, 1_000_000);
}

function freezeLedger(
  records: readonly SituatedExpressionAdmissionRecord[],
): SituatedExpressionAdmissionLedger {
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    records: Object.freeze([...records]),
  });
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
