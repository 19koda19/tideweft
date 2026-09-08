import {
  canonicalizeActorObservations,
  type ActorObservation,
  type ObservedArea,
} from "../sim/actorPerception";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyGroup,
  type CoreEcologyGroupState,
  type CoreEcologyGroupTransitionEvent,
} from "./coreEcologyGroups";
import {
  canonicalizeCoreWildlifeActorState,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  isLivingActorSpecies,
  livingSpeciesActorIdMatchesNamespace,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";
import {
  canonicalizeSettlementEcologyState,
  type SettlementDomesticAnimalCustodyRecord,
  type SettlementEcologyState,
} from "./settlementEcology";
import {
  canonicalizeSettlementWorkingAnimalState,
  type SettlementWorkingAnimalState,
} from "./settlementWorkingAnimals";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

/**
 * Bounded settlement authority for one open domestic-animal separation.
 *
 * Actor bodies, group topology, movement, perception, and working-dog cognition
 * stay in their existing owners. This record retains only authenticated proof
 * references, caretaker knowledge, and the latest closed outcome.
 */
export const SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_VERSION = 1 as const;
export const SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION = 1 as const;
export const SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION = 1 as const;
export const SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_TRANSITION_VERSION = 1 as const;
export const SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_OWNER_ID =
  "game:settlement-domestic-animal-recovery:v1" as const;
export const SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_SERIALIZED_BYTES = 32 * 1_024;
export const SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_MEMBER_COUNT = 16 as const;
export const SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_TRANSITION_ORDINAL =
  Math.floor(Number.MAX_SAFE_INTEGER / 2);

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._\/@+-]{0,191}$/u;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._\/@+-]{0,383}$/u;
const CUSTODY_RELATIONSHIP_PATTERN = /^DOMESTIC-REL-[0-9a-f]{16}$/u;
const UTF8_ENCODER = new TextEncoder();

export type SettlementDomesticAnimalRecoveryPhase =
  | "unnoticed"
  | "noticed"
  | "searching"
  | "awaiting-confirmation";

export type SettlementDomesticAnimalRecoveryTransitionKind =
  | "open"
  | "notice"
  | "link-search"
  | "record-rejoin"
  | "record-resplit"
  | "confirm-home";

export interface SettlementDomesticAnimalRecoveryMemberBinding {
  readonly actorId: string;
  readonly populationOrdinal: number;
}

export interface SettlementDomesticAnimalRecoveryGroupEventProof {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION;
  readonly proofId: string;
  readonly eventId: string;
  readonly groupId: string;
  readonly atTick: number;
  readonly kind: "group-split" | "group-rejoined";
  readonly causeReferenceId: string;
  readonly memberOrdinals: readonly number[];
  readonly componentIds: readonly string[];
}

export interface SettlementDomesticAnimalRecoveryOpeningProof {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION;
  readonly proofId: string;
  readonly settlementId: number;
  readonly custodyRelationshipId: string;
  readonly homeId: string;
  readonly homeStructureId: string;
  readonly caretakerActorId: string;
  readonly species: Exclude<LivingActorSpecies, "human">;
  readonly memberActorIds: readonly string[];
  readonly memberBindings: readonly SettlementDomesticAnimalRecoveryMemberBinding[];
  readonly groupId: string;
  readonly separatedMemberActorId: string;
  readonly separatedMemberOrdinal: number;
  readonly homeArea: ObservedArea;
  readonly lastKnownArea: ObservedArea;
  readonly splitEvent: SettlementDomesticAnimalRecoveryGroupEventProof;
}

/** Current direct visual evidence; it is knowledge, not omniscient world truth. */
export interface SettlementDomesticAnimalRecoveryNoticeProof {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION;
  readonly proofId: string;
  readonly caretakerActorId: string;
  readonly source: "current-dual-sight" | "witnessed-split-home-census";
  readonly learnedAtTick: number;
  readonly separatedMemberActorId: string;
  readonly separatedObservationId: string;
  readonly separatedObservedAtTick: number;
  readonly separatedArea: ObservedArea;
  readonly homeObservations: readonly SettlementDomesticAnimalRecoveryConfirmationObservation[];
}

export interface SettlementDomesticAnimalRecoveryReopenProof {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION;
  readonly proofId: string;
  readonly priorReunionEvent: SettlementDomesticAnimalRecoveryGroupEventProof;
  readonly resplitEvent: SettlementDomesticAnimalRecoveryGroupEventProof;
  readonly priorSearchTaskId: string | null;
  readonly reopenedAtTick: number;
}

/** A lawful search task can be linked, but never constitutes a found/reunion proof. */
export interface SettlementDomesticAnimalRecoverySearchProof {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION;
  readonly proofId: string;
  readonly assignmentId: string;
  readonly taskId: string;
  readonly workerActorId: string;
  readonly handlerActorId: string;
  readonly sourceObservationId: string;
  readonly sourceArea: ObservedArea;
  readonly searchProbeId: string;
  readonly linkedAtTick: number;
}

export interface SettlementDomesticAnimalRecoveryConfirmationObservation {
  readonly memberActorId: string;
  readonly observationId: string;
  readonly observedAtTick: number;
  readonly area: ObservedArea;
}

/** Direct current handler observations of every custody member inside its home. */
export interface SettlementDomesticAnimalRecoveryConfirmationProof {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION;
  readonly proofId: string;
  readonly handlerActorId: string;
  readonly confirmedAtTick: number;
  readonly observations: readonly SettlementDomesticAnimalRecoveryConfirmationObservation[];
}

export interface SettlementDomesticAnimalRecoveryTransitionReference {
  readonly transactionId: string;
  readonly ordinal: number;
  readonly transition: SettlementDomesticAnimalRecoveryTransitionKind;
  readonly acceptedAtTick: number;
}

export interface SettlementDomesticAnimalRecoveryCase {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION;
  readonly caseId: string;
  readonly caseOrdinal: number;
  readonly settlementId: number;
  readonly custodyRelationshipId: string;
  readonly homeId: string;
  readonly homeStructureId: string;
  readonly caretakerActorId: string;
  readonly species: Exclude<LivingActorSpecies, "human">;
  readonly memberActorIds: readonly string[];
  readonly memberBindings: readonly SettlementDomesticAnimalRecoveryMemberBinding[];
  readonly groupId: string;
  readonly separatedMemberActorId: string;
  readonly separatedMemberOrdinal: number;
  readonly openedAtTick: number;
  readonly homeArea: ObservedArea;
  readonly lastKnownArea: ObservedArea;
  readonly splitEvent: SettlementDomesticAnimalRecoveryGroupEventProof;
  readonly activeSplitEvent: SettlementDomesticAnimalRecoveryGroupEventProof;
  readonly phase: SettlementDomesticAnimalRecoveryPhase;
  readonly notice: SettlementDomesticAnimalRecoveryNoticeProof | null;
  readonly linkedSearch: SettlementDomesticAnimalRecoverySearchProof | null;
  readonly reunionEvent: SettlementDomesticAnimalRecoveryGroupEventProof | null;
  readonly latestReopen: SettlementDomesticAnimalRecoveryReopenProof | null;
  readonly lastTransition: SettlementDomesticAnimalRecoveryTransitionReference;
}

/** Only the latest closed case is retained; this is not an unbounded journal. */
export interface SettlementDomesticAnimalRecoveryOutcome {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION;
  readonly caseId: string;
  readonly caseOrdinal: number;
  readonly settlementId: number;
  readonly custodyRelationshipId: string;
  readonly homeId: string;
  readonly homeStructureId: string;
  readonly caretakerActorId: string;
  readonly species: Exclude<LivingActorSpecies, "human">;
  readonly memberActorIds: readonly string[];
  readonly memberBindings: readonly SettlementDomesticAnimalRecoveryMemberBinding[];
  readonly groupId: string;
  readonly separatedMemberActorId: string;
  readonly separatedMemberOrdinal: number;
  readonly openedAtTick: number;
  readonly homeArea: ObservedArea;
  readonly lastKnownArea: ObservedArea;
  readonly splitEvent: SettlementDomesticAnimalRecoveryGroupEventProof;
  readonly activeSplitEvent: SettlementDomesticAnimalRecoveryGroupEventProof;
  readonly notice: SettlementDomesticAnimalRecoveryNoticeProof | null;
  readonly linkedSearch: SettlementDomesticAnimalRecoverySearchProof | null;
  readonly reunionEvent: SettlementDomesticAnimalRecoveryGroupEventProof;
  readonly latestReopen: SettlementDomesticAnimalRecoveryReopenProof | null;
  readonly reunionTransition: SettlementDomesticAnimalRecoveryTransitionReference;
  readonly confirmation: SettlementDomesticAnimalRecoveryConfirmationProof;
  readonly outcome: "recovered" | "self-returned";
  readonly closedAtTick: number;
  readonly lastTransition: SettlementDomesticAnimalRecoveryTransitionReference;
}

export type SettlementDomesticAnimalRecoveryTransitionProof =
  | SettlementDomesticAnimalRecoveryOpeningProof
  | SettlementDomesticAnimalRecoveryNoticeProof
  | SettlementDomesticAnimalRecoverySearchProof
  | SettlementDomesticAnimalRecoveryReopenProof
  | SettlementDomesticAnimalRecoveryGroupEventProof
  | SettlementDomesticAnimalRecoveryConfirmationProof;

export interface SettlementDomesticAnimalRecoveryTransition {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_TRANSITION_VERSION;
  readonly transactionId: string;
  readonly ordinal: number;
  readonly caseId: string;
  readonly caseOrdinal: number;
  readonly transition: SettlementDomesticAnimalRecoveryTransitionKind;
  readonly acceptedAtTick: number;
  readonly proof: SettlementDomesticAnimalRecoveryTransitionProof;
}

export interface SettlementDomesticAnimalRecoveryState {
  readonly version: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_VERSION;
  readonly ownerId: typeof SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_OWNER_ID;
  readonly revision: number;
  readonly settlementId: number;
  readonly lastCaseOrdinal: number;
  readonly lastResolvedTransitionOrdinal: number;
  readonly lastResolvedTransitionId: string | null;
  readonly currentCase: SettlementDomesticAnimalRecoveryCase | null;
  readonly latestClosedOutcome: SettlementDomesticAnimalRecoveryOutcome | null;
  readonly pendingTransition: SettlementDomesticAnimalRecoveryTransition | null;
}

export interface OpenSettlementDomesticAnimalRecoveryRequest {
  readonly kind: "open";
  readonly atTick: number;
  readonly settlement: SettlementEcologyState;
  readonly custodyRelationshipId: string;
  readonly group: CoreEcologyGroupState;
  readonly splitEvent: CoreEcologyGroupTransitionEvent;
  readonly separatedMember: CoreWildlifeActorState;
  /** Exact current actor states for every custody/group member. */
  readonly memberActors: readonly CoreWildlifeActorState[];
  readonly lastKnownArea: ObservedArea;
}

interface NoticeSettlementDomesticAnimalRecoveryRequestBase {
  readonly kind: "notice";
  readonly atTick: number;
  readonly settlement: SettlementEcologyState;
  readonly group: CoreEcologyGroupState;
}

export interface DirectNoticeSettlementDomesticAnimalRecoveryRequest
  extends NoticeSettlementDomesticAnimalRecoveryRequestBase {
  readonly evidenceKind: "current-dual-sight";
  readonly separatedObservation: ActorObservation;
  readonly homeMemberObservation: ActorObservation;
}

export interface WitnessedSplitNoticeSettlementDomesticAnimalRecoveryRequest
  extends NoticeSettlementDomesticAnimalRecoveryRequestBase {
  readonly evidenceKind: "witnessed-split-home-census";
  /** Direct sight recorded at the currently active split event. */
  readonly witnessedSplitObservation: ActorObservation;
  /** Current direct census of every other custody member inside home. */
  readonly homeMemberObservations: readonly ActorObservation[];
}

export type NoticeSettlementDomesticAnimalRecoveryRequest =
  | DirectNoticeSettlementDomesticAnimalRecoveryRequest
  | WitnessedSplitNoticeSettlementDomesticAnimalRecoveryRequest;

export interface LinkSettlementDomesticAnimalRecoverySearchRequest {
  readonly kind: "link-search";
  readonly atTick: number;
  readonly settlement: SettlementEcologyState;
  readonly group: CoreEcologyGroupState;
  readonly workingAnimals: SettlementWorkingAnimalState;
  readonly assignmentId: string;
  readonly taskId: string;
}

export interface RecordSettlementDomesticAnimalRejoinRequest {
  readonly kind: "record-rejoin";
  readonly atTick: number;
  readonly settlement: SettlementEcologyState;
  readonly group: CoreEcologyGroupState;
  readonly rejoinEvent: CoreEcologyGroupTransitionEvent;
}

export interface RecordSettlementDomesticAnimalResplitRequest {
  readonly kind: "record-resplit";
  readonly atTick: number;
  readonly settlement: SettlementEcologyState;
  readonly group: CoreEcologyGroupState;
  readonly splitEvent: CoreEcologyGroupTransitionEvent;
}

export interface ConfirmSettlementDomesticAnimalHomeRequest {
  readonly kind: "confirm-home";
  readonly atTick: number;
  readonly settlement: SettlementEcologyState;
  readonly group: CoreEcologyGroupState;
  readonly memberObservations: readonly ActorObservation[];
}

export type SettlementDomesticAnimalRecoveryRequest =
  | OpenSettlementDomesticAnimalRecoveryRequest
  | NoticeSettlementDomesticAnimalRecoveryRequest
  | LinkSettlementDomesticAnimalRecoverySearchRequest
  | RecordSettlementDomesticAnimalRejoinRequest
  | RecordSettlementDomesticAnimalResplitRequest
  | ConfirmSettlementDomesticAnimalHomeRequest;

export interface SettlementDomesticAnimalRecoveryStageResult {
  readonly state: SettlementDomesticAnimalRecoveryState;
  readonly transaction: SettlementDomesticAnimalRecoveryTransition;
  readonly staged: true;
  readonly reusedPendingTransaction: boolean;
}

export interface SettlementDomesticAnimalRecoveryResolution {
  readonly state: SettlementDomesticAnimalRecoveryState;
  readonly transition: SettlementDomesticAnimalRecoveryTransition;
  readonly applied: boolean;
}

export interface SettlementDomesticAnimalRecoveryRecoveryResult {
  readonly state: SettlementDomesticAnimalRecoveryState;
  readonly transition: SettlementDomesticAnimalRecoveryTransition | null;
  readonly applied: boolean;
}

export function createSettlementDomesticAnimalRecoveryState(
  settlementId: number,
): SettlementDomesticAnimalRecoveryState {
  if (!positiveSafeInteger(settlementId)) {
    throw new RangeError("Domestic-animal recovery requires a positive settlement ID");
  }
  const state = canonicalizeSettlementDomesticAnimalRecoveryState({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_VERSION,
    ownerId: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_OWNER_ID,
    revision: 0,
    settlementId,
    lastCaseOrdinal: 0,
    lastResolvedTransitionOrdinal: 0,
    lastResolvedTransitionId: null,
    currentCase: null,
    latestClosedOutcome: null,
    pendingTransition: null,
  });
  if (state === null) throw new Error("Derived domestic-animal recovery root was invalid");
  return state;
}

/** Strict save boundary. Unknown keys, noncanonical order, and incoherent phases fail closed. */
export function canonicalizeSettlementDomesticAnimalRecoveryState(
  value: unknown,
): SettlementDomesticAnimalRecoveryState | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "currentCase",
      "lastCaseOrdinal",
      "lastResolvedTransitionId",
      "lastResolvedTransitionOrdinal",
      "latestClosedOutcome",
      "ownerId",
      "pendingTransition",
      "revision",
      "settlementId",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_VERSION
    || value.ownerId !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_OWNER_ID
    || !nonnegativeSafeInteger(value.revision)
    || !positiveSafeInteger(value.settlementId)
    || !nonnegativeSafeInteger(value.lastCaseOrdinal)
    || value.lastCaseOrdinal > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_TRANSITION_ORDINAL
    || !nonnegativeSafeInteger(value.lastResolvedTransitionOrdinal)
    || value.lastResolvedTransitionOrdinal
      > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_TRANSITION_ORDINAL
    || !nullableReference(value.lastResolvedTransitionId)
  ) return null;

  const currentCase = value.currentCase === null
    ? null
    : canonicalRecoveryCase(value.currentCase, value.settlementId);
  const latestClosedOutcome = value.latestClosedOutcome === null
    ? null
    : canonicalRecoveryOutcome(value.latestClosedOutcome, value.settlementId);
  const pendingTransition = value.pendingTransition === null
    ? null
    : canonicalRecoveryTransition(value.pendingTransition);
  if (
    (value.currentCase !== null && currentCase === null)
    || (value.latestClosedOutcome !== null && latestClosedOutcome === null)
    || (value.pendingTransition !== null && pendingTransition === null)
  ) return null;

  const expectedRevision = value.lastResolvedTransitionOrdinal * 2
    + (pendingTransition === null ? 0 : 1);
  if (!Number.isSafeInteger(expectedRevision) || value.revision !== expectedRevision) return null;
  if (
    (value.lastResolvedTransitionOrdinal === 0) !== (value.lastResolvedTransitionId === null)
    || (value.lastCaseOrdinal === 0) !== (currentCase === null && latestClosedOutcome === null)
  ) return null;

  const latestReference = currentCase?.lastTransition
    ?? latestClosedOutcome?.lastTransition
    ?? null;
  if (
    latestReference === null
      ? value.lastResolvedTransitionOrdinal !== 0
      : latestReference.ordinal !== value.lastResolvedTransitionOrdinal
        || latestReference.transactionId !== value.lastResolvedTransitionId
  ) return null;

  if (currentCase !== null) {
    if (
      currentCase.caseOrdinal !== value.lastCaseOrdinal
      || latestClosedOutcome !== null
        && (
          latestClosedOutcome.caseOrdinal >= currentCase.caseOrdinal
          || latestClosedOutcome.lastTransition.ordinal >= currentCase.lastTransition.ordinal
          || latestClosedOutcome.closedAtTick > currentCase.openedAtTick
        )
    ) return null;
  } else if (
    latestClosedOutcome !== null
    && latestClosedOutcome.caseOrdinal !== value.lastCaseOrdinal
  ) return null;

  if (
    pendingTransition !== null
    && (
      pendingTransition.ordinal !== value.lastResolvedTransitionOrdinal + 1
      || latestReference !== null
        && pendingTransition.acceptedAtTick < latestReference.acceptedAtTick
      || !pendingFitsState(
        currentCase,
        latestClosedOutcome,
        value.lastCaseOrdinal,
        pendingTransition,
      )
    )
  ) return null;

  const canonical: SettlementDomesticAnimalRecoveryState = deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_VERSION,
    ownerId: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_OWNER_ID,
    revision: value.revision,
    settlementId: value.settlementId,
    lastCaseOrdinal: value.lastCaseOrdinal,
    lastResolvedTransitionOrdinal: value.lastResolvedTransitionOrdinal,
    lastResolvedTransitionId: value.lastResolvedTransitionId,
    currentCase,
    latestClosedOutcome,
    pendingTransition,
  });
  return byteLength(canonical) <= SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_SERIALIZED_BYTES
    ? canonical
    : null;
}

export function serializeSettlementDomesticAnimalRecoveryState(value: unknown): string {
  const state = canonicalizeSettlementDomesticAnimalRecoveryState(value);
  if (state === null) throw new RangeError("Cannot serialize malformed domestic recovery state");
  const encoded = stableStringify(state);
  if (UTF8_ENCODER.encode(encoded).byteLength
    > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Domestic-animal recovery state exceeds its save budget");
  }
  return encoded;
}

export function deserializeSettlementDomesticAnimalRecoveryState(
  text: unknown,
): SettlementDomesticAnimalRecoveryState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength
      > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeSettlementDomesticAnimalRecoveryState(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

export function stageSettlementDomesticAnimalRecovery(
  stateValue: unknown,
  request: SettlementDomesticAnimalRecoveryRequest,
): SettlementDomesticAnimalRecoveryStageResult | null {
  const state = canonicalizeSettlementDomesticAnimalRecoveryState(stateValue);
  if (state === null || !plainRecord(request)) return null;
  const transaction = deriveTransition(state, request);
  if (transaction === null) return null;
  if (state.pendingTransition !== null) {
    return stableStringify(state.pendingTransition) === stableStringify(transaction)
      ? deepFreeze({
          state,
          transaction: state.pendingTransition,
          staged: true as const,
          reusedPendingTransaction: true,
        })
      : null;
  }
  const nextState = canonicalizeSettlementDomesticAnimalRecoveryState({
    ...state,
    revision: state.revision + 1,
    pendingTransition: transaction,
  });
  return nextState === null ? null : deepFreeze({
    state: nextState,
    transaction,
    staged: true as const,
    reusedPendingTransaction: false,
  });
}

/** Commit is exact-once; replay of the latest resolved transaction is inert. */
export function resolveSettlementDomesticAnimalRecovery(
  stateValue: unknown,
  transactionValue: unknown,
): SettlementDomesticAnimalRecoveryResolution | null {
  const state = canonicalizeSettlementDomesticAnimalRecoveryState(stateValue);
  const transaction = canonicalRecoveryTransition(transactionValue);
  if (state === null || transaction === null) return null;
  if (state.pendingTransition === null) {
    return state.lastResolvedTransitionId === transaction.transactionId
      && state.lastResolvedTransitionOrdinal === transaction.ordinal
      ? deepFreeze({ state, transition: transaction, applied: false })
      : null;
  }
  if (stableStringify(state.pendingTransition) !== stableStringify(transaction)) return null;
  const applied = applyTransition(state, transaction);
  if (applied === null) return null;
  const nextState = canonicalizeSettlementDomesticAnimalRecoveryState({
    ...state,
    ...applied,
    revision: state.revision + 1,
    lastResolvedTransitionOrdinal: transaction.ordinal,
    lastResolvedTransitionId: transaction.transactionId,
    pendingTransition: null,
  });
  return nextState === null ? null : deepFreeze({
    state: nextState,
    transition: transaction,
    applied: true,
  });
}

/** Resume a saved transition without repeating perception, topology, or task checks. */
export function recoverPendingSettlementDomesticAnimalRecovery(
  stateValue: unknown,
): SettlementDomesticAnimalRecoveryRecoveryResult | null {
  const state = canonicalizeSettlementDomesticAnimalRecoveryState(stateValue);
  if (state === null) return null;
  if (state.pendingTransition === null) {
    return deepFreeze({ state, transition: null, applied: false });
  }
  return resolveSettlementDomesticAnimalRecovery(state, state.pendingTransition);
}

function deriveTransition(
  state: SettlementDomesticAnimalRecoveryState,
  request: SettlementDomesticAnimalRecoveryRequest,
): SettlementDomesticAnimalRecoveryTransition | null {
  if (
    !nonnegativeSafeInteger(request.atTick)
    || state.lastResolvedTransitionOrdinal
      >= SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_TRANSITION_ORDINAL
  ) return null;

  if (request.kind === "open") return deriveOpenTransition(state, request);
  const current = state.currentCase;
  if (current === null) return null;
  const authorities = recoveryAuthorities(current, request.settlement, request.group);
  if (authorities === null || request.atTick < current.lastTransition.acceptedAtTick) return null;

  switch (request.kind) {
    case "notice":
      return deriveNoticeTransition(state, current, authorities, request);
    case "link-search":
      return deriveSearchTransition(state, current, request);
    case "record-rejoin":
      return deriveRejoinTransition(state, current, authorities.group, request);
    case "record-resplit":
      return deriveResplitTransition(state, current, authorities.group, request);
    case "confirm-home":
      return deriveConfirmationTransition(state, current, authorities, request);
  }
  return null;
}

function deriveOpenTransition(
  state: SettlementDomesticAnimalRecoveryState,
  request: OpenSettlementDomesticAnimalRecoveryRequest,
): SettlementDomesticAnimalRecoveryTransition | null {
  if (
    state.currentCase !== null
    || state.lastCaseOrdinal >= SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_TRANSITION_ORDINAL
    || !validCustodyRelationshipId(request.custodyRelationshipId)
  ) return null;
  const settlement = canonicalizeSettlementEcologyState(request.settlement);
  const group = canonicalizeCoreEcologyGroup(request.group);
  const member = canonicalizeCoreWildlifeActorState(request.separatedMember);
  const lastKnownArea = canonicalArea(request.lastKnownArea, 0);
  if (
    settlement === null
    || group === null
    || member === null
    || lastKnownArea === null
    || request.atTick !== request.splitEvent.atTick
    || member.updatedAtTick !== request.atTick
    || !samePosition(lastKnownArea.center, member.address.position)
  ) return null;
  const custody = settlement.domesticCustodies.find(({ relationshipId }) => (
    relationshipId === request.custodyRelationshipId
  ));
  const splitEvent = exactCurrentGroupEvent(group, request.splitEvent, "group-split");
  const memberActors = canonicalMemberActors(
    request.memberActors,
    custody,
    group,
    request.atTick,
  );
  if (
    custody === undefined
    || splitEvent === null
    || memberActors === null
    || settlement.identity.settlementId !== state.settlementId
    || !custodyMatchesGroup(custody, group)
    || !custody.memberActorIds.includes(member.identity.stableId)
    || member.identity.species !== custody.species
    || member.identity.species !== group.identity.species
    || member.identity.populationKey !== group.identity.populationKey
    || member.identity.populationOrdinal < 0
    || !group.memberOrdinals.includes(member.identity.populationOrdinal)
    || stableStringify(memberActors.actors.find(({ identity }) => (
      identity.stableId === member.identity.stableId
    ))) !== stableStringify(member)
    || member.identity.originRegion.x !== group.identity.originRegion.x
    || member.identity.originRegion.y !== group.identity.originRegion.y
    || pointInsideArea(lastKnownArea.center, {
      center: custody.homeStructure.position,
      radiusUnits: custody.homeStructure.radiusUnits,
    })
    || state.latestClosedOutcome?.splitEvent.eventId === splitEvent.eventId
  ) return null;

  const openingFields = {
    settlementId: state.settlementId,
    custodyRelationshipId: custody.relationshipId,
    homeId: custody.homeId,
    homeStructureId: custody.homeStructure.structureId,
    caretakerActorId: custody.caretakerActorId,
    species: custody.species as Exclude<LivingActorSpecies, "human">,
    memberActorIds: custody.memberActorIds,
    memberBindings: memberActors.bindings,
    groupId: group.identity.stableId,
    separatedMemberActorId: member.identity.stableId,
    separatedMemberOrdinal: member.identity.populationOrdinal,
    homeArea: cloneArea({
      center: custody.homeStructure.position,
      radiusUnits: custody.homeStructure.radiusUnits,
    }),
    lastKnownArea,
    splitEvent,
  } as const;
  const proof = canonicalOpeningProof({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: openingProofId(openingFields),
    ...openingFields,
  });
  if (proof === null) return null;
  const caseOrdinal = state.lastCaseOrdinal + 1;
  const caseId = recoveryCaseId(proof, caseOrdinal);
  return createTransition(state, {
    caseId,
    caseOrdinal,
    transition: "open",
    acceptedAtTick: request.atTick,
    proof,
  });
}

function deriveNoticeTransition(
  state: SettlementDomesticAnimalRecoveryState,
  current: SettlementDomesticAnimalRecoveryCase,
  authorities: RecoveryAuthorities,
  request: NoticeSettlementDomesticAnimalRecoveryRequest,
): SettlementDomesticAnimalRecoveryTransition | null {
  if (current.phase !== "unnoticed" || authorities.group.phase === "cohesive") return null;
  let separated: ActorObservation | null = null;
  let source: SettlementDomesticAnimalRecoveryNoticeProof["source"];
  const homeObservations: SettlementDomesticAnimalRecoveryConfirmationObservation[] = [];
  if (request.evidenceKind === "current-dual-sight") {
    source = "current-dual-sight";
    separated = exactDirectVision(
      request.separatedObservation,
      current.caretakerActorId,
      current.separatedMemberActorId,
      request.atTick,
    );
    const home = exactDirectVision(
      request.homeMemberObservation,
      current.caretakerActorId,
      request.homeMemberObservation.subjectId,
      request.atTick,
    );
    if (
      home === null
      || home.subjectId === null
      || home.subjectId === current.separatedMemberActorId
      || !current.memberActorIds.includes(home.subjectId)
      || !pointInsideArea(home.area.center, current.homeArea)
    ) return null;
    homeObservations.push(observationReference(home));
  } else {
    source = "witnessed-split-home-census";
    separated = exactDirectVision(
      request.witnessedSplitObservation,
      current.caretakerActorId,
      current.separatedMemberActorId,
      current.activeSplitEvent.atTick,
    );
    if (
      !Array.isArray(request.homeMemberObservations)
      || request.homeMemberObservations.length !== current.memberActorIds.length - 1
    ) return null;
    const seen = new Set<string>();
    for (const raw of request.homeMemberObservations) {
      const home = exactDirectVision(
        raw,
        current.caretakerActorId,
        raw.subjectId,
        request.atTick,
      );
      if (
        home === null
        || home.subjectId === null
        || home.subjectId === current.separatedMemberActorId
        || !current.memberActorIds.includes(home.subjectId)
        || seen.has(home.subjectId)
        || !pointInsideArea(home.area.center, current.homeArea)
      ) return null;
      seen.add(home.subjectId);
      homeObservations.push(observationReference(home));
    }
    if (!current.memberActorIds.every((id) => (
      id === current.separatedMemberActorId || seen.has(id)
    ))) return null;
  }
  if (
    separated === null
    || pointInsideArea(separated.area.center, current.homeArea)
    || homeObservations.some(({ observationId }) => observationId === separated!.id)
  ) return null;
  homeObservations.sort((left, right) => compareText(left.memberActorId, right.memberActorId));
  const fields = {
    caretakerActorId: current.caretakerActorId,
    source,
    learnedAtTick: request.atTick,
    separatedMemberActorId: current.separatedMemberActorId,
    separatedObservationId: separated.id,
    separatedObservedAtTick: separated.observedAtTick,
    separatedArea: cloneArea(separated.area),
    homeObservations: Object.freeze(homeObservations),
  } as const;
  const proof = canonicalNoticeProof({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: noticeProofId(fields),
    ...fields,
  }, current);
  return proof === null ? null : createTransition(state, {
    caseId: current.caseId,
    caseOrdinal: current.caseOrdinal,
    transition: "notice",
    acceptedAtTick: request.atTick,
    proof,
  });
}

function deriveSearchTransition(
  state: SettlementDomesticAnimalRecoveryState,
  current: SettlementDomesticAnimalRecoveryCase,
  request: LinkSettlementDomesticAnimalRecoverySearchRequest,
): SettlementDomesticAnimalRecoveryTransition | null {
  if (
    current.phase !== "noticed"
    || !validId(request.assignmentId)
    || !validId(request.taskId)
  ) return null;
  const working = canonicalizeSettlementWorkingAnimalState(request.workingAnimals);
  if (working === null || working.settlementId !== state.settlementId) return null;
  const assignment = working.assignments.find(({ assignmentId }) => (
    assignmentId === request.assignmentId
  ));
  if (assignment === undefined || assignment.currentTask === null) return null;
  const task = assignment.currentTask;
  if (
    assignment.handlerActorId !== current.caretakerActorId
    || assignment.protectedCustodyRelationshipId !== current.custodyRelationshipId
    || assignment.protectedGroupId !== current.groupId
    || task.taskId !== request.taskId
    || task.phase !== "investigating"
    || task.handlerActorId !== current.caretakerActorId
    || stableStringify(task.perceivedArea) !== stableStringify(current.lastKnownArea)
    || stableStringify(task.searchProbe.sourceArea) !== stableStringify(current.lastKnownArea)
  ) return null;
  const fields = {
    assignmentId: assignment.assignmentId,
    taskId: task.taskId,
    workerActorId: task.workerActorId,
    handlerActorId: task.handlerActorId,
    sourceObservationId: task.sourceObservationId,
    sourceArea: cloneArea(task.perceivedArea),
    searchProbeId: task.searchProbe.id,
    linkedAtTick: request.atTick,
  } as const;
  const proof = canonicalSearchProof({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: searchProofId(fields),
    ...fields,
  }, current);
  return proof === null ? null : createTransition(state, {
    caseId: current.caseId,
    caseOrdinal: current.caseOrdinal,
    transition: "link-search",
    acceptedAtTick: request.atTick,
    proof,
  });
}

function deriveRejoinTransition(
  state: SettlementDomesticAnimalRecoveryState,
  current: SettlementDomesticAnimalRecoveryCase,
  group: CoreEcologyGroupState,
  request: RecordSettlementDomesticAnimalRejoinRequest,
): SettlementDomesticAnimalRecoveryTransition | null {
  if (
    current.phase !== "unnoticed"
    && current.phase !== "noticed"
    && current.phase !== "searching"
  ) return null;
  const proof = exactCurrentGroupEvent(group, request.rejoinEvent, "group-rejoined");
  if (
    proof === null
    || request.atTick !== proof.atTick
    || group.phase !== "cohesive"
    || stableStringify(proof.memberOrdinals)
      !== stableStringify(current.activeSplitEvent.memberOrdinals)
  ) return null;
  return createTransition(state, {
    caseId: current.caseId,
    caseOrdinal: current.caseOrdinal,
    transition: "record-rejoin",
    acceptedAtTick: request.atTick,
    proof,
  });
}

function deriveResplitTransition(
  state: SettlementDomesticAnimalRecoveryState,
  current: SettlementDomesticAnimalRecoveryCase,
  group: CoreEcologyGroupState,
  request: RecordSettlementDomesticAnimalResplitRequest,
): SettlementDomesticAnimalRecoveryTransition | null {
  if (current.phase !== "awaiting-confirmation" || current.reunionEvent === null) return null;
  const resplitEvent = exactCurrentGroupEvent(group, request.splitEvent, "group-split");
  if (
    resplitEvent === null
    || request.atTick !== resplitEvent.atTick
    || resplitEvent.atTick <= current.reunionEvent.atTick
    || resplitEvent.eventId === current.activeSplitEvent.eventId
    || stableStringify(resplitEvent.memberOrdinals)
      !== stableStringify(current.memberBindings.map(({ populationOrdinal }) => (
        populationOrdinal
      )).sort((left, right) => left - right))
  ) return null;
  const fields = {
    priorReunionEvent: current.reunionEvent,
    resplitEvent,
    priorSearchTaskId: current.linkedSearch?.taskId ?? null,
    reopenedAtTick: request.atTick,
  } as const;
  const proof = canonicalReopenProof({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: reopenProofId(fields),
    ...fields,
  }, current);
  return proof === null ? null : createTransition(state, {
    caseId: current.caseId,
    caseOrdinal: current.caseOrdinal,
    transition: "record-resplit",
    acceptedAtTick: request.atTick,
    proof,
  });
}

function deriveConfirmationTransition(
  state: SettlementDomesticAnimalRecoveryState,
  current: SettlementDomesticAnimalRecoveryCase,
  authorities: RecoveryAuthorities,
  request: ConfirmSettlementDomesticAnimalHomeRequest,
): SettlementDomesticAnimalRecoveryTransition | null {
  if (
    current.phase !== "awaiting-confirmation"
    || authorities.group.phase !== "cohesive"
    || !Array.isArray(request.memberObservations)
    || request.memberObservations.length !== current.memberActorIds.length
  ) return null;
  const observations: SettlementDomesticAnimalRecoveryConfirmationObservation[] = [];
  const subjects = new Set<string>();
  for (const raw of request.memberObservations) {
    const subject = raw.subjectId;
    const observation = exactDirectVision(
      raw,
      current.caretakerActorId,
      subject,
      request.atTick,
    );
    if (
      observation === null
      || subject === null
      || subjects.has(subject)
      || !current.memberActorIds.includes(subject)
      || !pointInsideArea(observation.area.center, current.homeArea)
    ) return null;
    subjects.add(subject);
    observations.push(deepFreeze({
      memberActorId: subject,
      observationId: observation.id,
      observedAtTick: observation.observedAtTick,
      area: cloneArea(observation.area),
    }));
  }
  if (!current.memberActorIds.every((member) => subjects.has(member))) return null;
  observations.sort((left, right) => compareText(left.memberActorId, right.memberActorId));
  const fields = {
    handlerActorId: current.caretakerActorId,
    confirmedAtTick: request.atTick,
    observations: Object.freeze(observations),
  } as const;
  const proof = canonicalConfirmationProof({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: confirmationProofId(fields),
    ...fields,
  }, current);
  return proof === null ? null : createTransition(state, {
    caseId: current.caseId,
    caseOrdinal: current.caseOrdinal,
    transition: "confirm-home",
    acceptedAtTick: request.atTick,
    proof,
  });
}

function createTransition(
  state: SettlementDomesticAnimalRecoveryState,
  input: Omit<SettlementDomesticAnimalRecoveryTransition, "ordinal" | "transactionId" | "version">,
): SettlementDomesticAnimalRecoveryTransition | null {
  const fields = {
    ordinal: state.lastResolvedTransitionOrdinal + 1,
    ...input,
  } as const;
  return canonicalRecoveryTransition({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_TRANSITION_VERSION,
    transactionId: recoveryTransactionId(fields),
    ...fields,
  });
}

function applyTransition(
  state: SettlementDomesticAnimalRecoveryState,
  transaction: SettlementDomesticAnimalRecoveryTransition,
): Partial<SettlementDomesticAnimalRecoveryState> | null {
  const reference: SettlementDomesticAnimalRecoveryTransitionReference = deepFreeze({
    transactionId: transaction.transactionId,
    ordinal: transaction.ordinal,
    transition: transaction.transition,
    acceptedAtTick: transaction.acceptedAtTick,
  });
  if (transaction.transition === "open") {
    const proof = canonicalOpeningProof(transaction.proof);
    if (proof === null || state.currentCase !== null) return null;
    const currentCase = canonicalRecoveryCase({
      version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION,
      caseId: transaction.caseId,
      caseOrdinal: transaction.caseOrdinal,
      settlementId: proof.settlementId,
      custodyRelationshipId: proof.custodyRelationshipId,
      homeId: proof.homeId,
      homeStructureId: proof.homeStructureId,
      caretakerActorId: proof.caretakerActorId,
      species: proof.species,
      memberActorIds: proof.memberActorIds,
      memberBindings: proof.memberBindings,
      groupId: proof.groupId,
      separatedMemberActorId: proof.separatedMemberActorId,
      separatedMemberOrdinal: proof.separatedMemberOrdinal,
      openedAtTick: proof.splitEvent.atTick,
      homeArea: proof.homeArea,
      lastKnownArea: proof.lastKnownArea,
      splitEvent: proof.splitEvent,
      activeSplitEvent: proof.splitEvent,
      phase: "unnoticed",
      notice: null,
      linkedSearch: null,
      reunionEvent: null,
      latestReopen: null,
      lastTransition: reference,
    }, state.settlementId);
    return currentCase === null ? null : {
      lastCaseOrdinal: transaction.caseOrdinal,
      currentCase,
    };
  }

  const current = state.currentCase;
  if (
    current === null
    || current.caseId !== transaction.caseId
    || current.caseOrdinal !== transaction.caseOrdinal
  ) return null;
  if (transaction.transition === "notice") {
    const notice = canonicalNoticeProof(transaction.proof, current);
    if (notice === null || current.phase !== "unnoticed") return null;
    return {
      currentCase: canonicalRecoveryCase({
        ...current,
        phase: "noticed",
        notice,
        lastKnownArea: notice.separatedArea,
        lastTransition: reference,
      }, state.settlementId),
    };
  }
  if (transaction.transition === "link-search") {
    const linkedSearch = canonicalSearchProof(transaction.proof, current);
    if (linkedSearch === null || current.phase !== "noticed") return null;
    return {
      currentCase: canonicalRecoveryCase({
        ...current,
        phase: "searching",
        linkedSearch,
        lastTransition: reference,
      }, state.settlementId),
    };
  }
  if (transaction.transition === "record-rejoin") {
    const reunionEvent = canonicalGroupEventProof(transaction.proof, "group-rejoined");
    if (
      reunionEvent === null
      || current.phase !== "unnoticed"
        && current.phase !== "noticed"
        && current.phase !== "searching"
    ) return null;
    return {
      currentCase: canonicalRecoveryCase({
        ...current,
        phase: "awaiting-confirmation",
        reunionEvent,
        lastTransition: reference,
      }, state.settlementId),
    };
  }
  if (transaction.transition === "record-resplit") {
    const latestReopen = canonicalReopenProof(transaction.proof, current);
    if (latestReopen === null || current.phase !== "awaiting-confirmation") return null;
    return {
      currentCase: canonicalRecoveryCase({
        ...current,
        phase: current.notice === null ? "unnoticed" : "noticed",
        activeSplitEvent: latestReopen.resplitEvent,
        linkedSearch: null,
        reunionEvent: null,
        latestReopen,
        lastTransition: reference,
      }, state.settlementId),
    };
  }
  const confirmation = canonicalConfirmationProof(transaction.proof, current);
  if (
    confirmation === null
    || current.phase !== "awaiting-confirmation"
    || current.reunionEvent === null
  ) return null;
  const latestClosedOutcome = canonicalRecoveryOutcome({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION,
    caseId: current.caseId,
    caseOrdinal: current.caseOrdinal,
    settlementId: current.settlementId,
    custodyRelationshipId: current.custodyRelationshipId,
    homeId: current.homeId,
    homeStructureId: current.homeStructureId,
    caretakerActorId: current.caretakerActorId,
    species: current.species,
    memberActorIds: current.memberActorIds,
    memberBindings: current.memberBindings,
    groupId: current.groupId,
    separatedMemberActorId: current.separatedMemberActorId,
    separatedMemberOrdinal: current.separatedMemberOrdinal,
    openedAtTick: current.openedAtTick,
    homeArea: current.homeArea,
    lastKnownArea: current.lastKnownArea,
    splitEvent: current.splitEvent,
    activeSplitEvent: current.activeSplitEvent,
    notice: current.notice,
    linkedSearch: current.linkedSearch,
    reunionEvent: current.reunionEvent,
    latestReopen: current.latestReopen,
    reunionTransition: current.lastTransition,
    confirmation,
    outcome: current.notice === null ? "self-returned" : "recovered",
    closedAtTick: transaction.acceptedAtTick,
    lastTransition: reference,
  }, state.settlementId);
  return latestClosedOutcome === null ? null : {
    currentCase: null,
    latestClosedOutcome,
  };
}

interface RecoveryAuthorities {
  readonly settlement: SettlementEcologyState;
  readonly group: CoreEcologyGroupState;
  readonly custody: SettlementDomesticAnimalCustodyRecord;
}

function recoveryAuthorities(
  current: SettlementDomesticAnimalRecoveryCase,
  settlementValue: unknown,
  groupValue: unknown,
): RecoveryAuthorities | null {
  const settlement = canonicalizeSettlementEcologyState(settlementValue);
  const group = canonicalizeCoreEcologyGroup(groupValue);
  if (
    settlement === null
    || group === null
    || settlement.identity.settlementId !== current.settlementId
  ) return null;
  const custody = settlement.domesticCustodies.find(({ relationshipId }) => (
    relationshipId === current.custodyRelationshipId
  ));
  if (
    custody === undefined
    || !custodyMatchesGroup(custody, group)
    || custody.homeId !== current.homeId
    || custody.homeStructure.structureId !== current.homeStructureId
    || custody.caretakerActorId !== current.caretakerActorId
    || stableStringify(custody.memberActorIds) !== stableStringify(current.memberActorIds)
    || stableStringify(current.memberBindings.map(({ populationOrdinal }) => (
      populationOrdinal
    )).sort((left, right) => left - right)) !== stableStringify(group.memberOrdinals)
    || stableStringify({
      center: custody.homeStructure.position,
      radiusUnits: custody.homeStructure.radiusUnits,
    }) !== stableStringify(current.homeArea)
  ) return null;
  return deepFreeze({ settlement, group, custody });
}

function custodyMatchesGroup(
  custody: SettlementDomesticAnimalCustodyRecord,
  group: CoreEcologyGroupState,
): boolean {
  return custody.settlementId > 0
    && custody.species !== "human"
    && custody.memberGroupId === group.identity.stableId
    && custody.species === group.identity.species
    && custody.memberActorIds.length === group.memberOrdinals.length
    && custody.memberActorIds.length >= 2
    && custody.memberActorIds.length <= SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_MEMBER_COUNT;
}

function exactCurrentGroupEvent(
  group: CoreEcologyGroupState,
  eventValue: unknown,
  kind: "group-split" | "group-rejoined",
): SettlementDomesticAnimalRecoveryGroupEventProof | null {
  const event = canonicalRawGroupEvent(eventValue, kind);
  if (
    event === null
    || event.groupId !== group.identity.stableId
    || event.atTick !== group.updatedAtTick
    || stableStringify(event.memberOrdinals) !== stableStringify(group.memberOrdinals)
    || stableStringify(event.componentIds)
      !== stableStringify(group.components.map(({ componentId }) => componentId).sort(compareText))
    || (kind === "group-split" && group.phase === "cohesive")
    || (kind === "group-rejoined" && group.phase !== "cohesive")
  ) return null;
  const lineage = [...group.lineage].reverse().find((candidate) => (
    candidate.kind === (kind === "group-split" ? "split" : "rejoin")
  ));
  if (
    lineage === undefined
    || lineage.atTick !== event.atTick
    || lineage.causeReferenceId !== event.causeReferenceId
    || stableStringify(lineage.childComponentIds) !== stableStringify(event.componentIds)
  ) return null;
  const fields = {
    eventId: event.eventId,
    groupId: event.groupId,
    atTick: event.atTick,
    kind,
    causeReferenceId: event.causeReferenceId,
    memberOrdinals: event.memberOrdinals,
    componentIds: event.componentIds,
  } as const;
  return canonicalGroupEventProof({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: groupEventProofId(fields),
    ...fields,
  }, kind);
}

function canonicalRawGroupEvent(
  value: unknown,
  kind: "group-split" | "group-rejoined",
): CoreEcologyGroupTransitionEvent | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "atTick",
      "causeReferenceId",
      "componentIds",
      "eventId",
      "groupId",
      "kind",
      "memberOrdinals",
      "nonlethal",
    ])
    || value.kind !== kind
    || value.nonlethal !== true
    || !validReference(value.eventId)
    || !validId(value.groupId)
    || !validReference(value.causeReferenceId)
    || !nonnegativeSafeInteger(value.atTick)
  ) return null;
  const members = canonicalOrdinalArray(value.memberOrdinals, 2, 48);
  const components = canonicalIdArray(value.componentIds, kind === "group-split" ? 2 : 1);
  const suffix = `:group-event:${kind}:${value.atTick.toString(36)}`;
  if (
    members === null
    || components === null
    || components.length !== (kind === "group-split" ? 2 : 1)
    || !value.eventId.endsWith(suffix)
    || value.eventId.length <= suffix.length
  ) return null;
  return deepFreeze({
    eventId: value.eventId,
    groupId: value.groupId,
    atTick: value.atTick,
    kind,
    causeReferenceId: value.causeReferenceId,
    memberOrdinals: members,
    componentIds: components,
    nonlethal: true as const,
  });
}

function exactDirectVision(
  value: unknown,
  observerId: string,
  subjectId: unknown,
  tick: number,
): ActorObservation | null {
  if (typeof subjectId !== "string") return null;
  const observations = canonicalizeActorObservations([value]);
  const observation = observations.length === 1 ? observations[0]! : null;
  return observation !== null
    && observation.observerId === observerId
    && observation.subjectId === subjectId
    && observation.observedAtTick === tick
    && observation.channel === "vision"
    && observation.identification === "identified"
    && observation.area.radiusUnits === 0
    && observation.confidence > 0
    && observation.salience > 0
    ? observation
    : null;
}

function canonicalRecoveryTransition(
  value: unknown,
): SettlementDomesticAnimalRecoveryTransition | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "acceptedAtTick",
      "caseId",
      "caseOrdinal",
      "ordinal",
      "proof",
      "transactionId",
      "transition",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_TRANSITION_VERSION
    || !validId(value.transactionId)
    || !validId(value.caseId)
    || !positiveSafeInteger(value.ordinal)
    || value.ordinal > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_TRANSITION_ORDINAL
    || !positiveSafeInteger(value.caseOrdinal)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
    || !isTransitionKind(value.transition)
  ) return null;
  const proof = canonicalTransitionProof(value.proof, value.transition);
  if (proof === null) return null;
  const fields = {
    ordinal: value.ordinal,
    caseId: value.caseId,
    caseOrdinal: value.caseOrdinal,
    transition: value.transition,
    acceptedAtTick: value.acceptedAtTick,
    proof,
  } as const;
  if (value.transactionId !== recoveryTransactionId(fields)) return null;
  if (transitionProofTick(proof, value.transition) !== value.acceptedAtTick) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_TRANSITION_VERSION,
    transactionId: value.transactionId,
    ...fields,
  });
}

function canonicalTransitionProof(
  value: unknown,
  transition: SettlementDomesticAnimalRecoveryTransitionKind,
): SettlementDomesticAnimalRecoveryTransitionProof | null {
  switch (transition) {
    case "open": return canonicalOpeningProof(value);
    case "notice": return canonicalNoticeProof(value);
    case "link-search": return canonicalSearchProof(value);
    case "record-rejoin": return canonicalGroupEventProof(value, "group-rejoined");
    case "record-resplit": return canonicalReopenProof(value);
    case "confirm-home": return canonicalConfirmationProof(value);
  }
}

function canonicalOpeningProof(
  value: unknown,
): SettlementDomesticAnimalRecoveryOpeningProof | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "caretakerActorId",
      "custodyRelationshipId",
      "groupId",
      "homeArea",
      "homeId",
      "homeStructureId",
      "lastKnownArea",
      "memberActorIds",
      "memberBindings",
      "proofId",
      "separatedMemberActorId",
      "separatedMemberOrdinal",
      "settlementId",
      "species",
      "splitEvent",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION
    || !validId(value.proofId)
    || !positiveSafeInteger(value.settlementId)
    || !validCustodyRelationshipId(value.custodyRelationshipId)
    || !validId(value.homeId)
    || !validId(value.homeStructureId)
    || !livingSpeciesActorIdMatchesNamespace(value.caretakerActorId, "human")
    || !isLivingActorSpecies(value.species)
    || value.species === "human"
    || !validId(value.groupId)
    || !nonnegativeSafeInteger(value.separatedMemberOrdinal)
  ) return null;
  const species = value.species as Exclude<LivingActorSpecies, "human">;
  const members = canonicalActorIds(value.memberActorIds, species);
  const memberBindings = canonicalMemberBindings(value.memberBindings, members, undefined);
  const homeArea = canonicalArea(value.homeArea, Number.MAX_SAFE_INTEGER);
  const lastKnownArea = canonicalArea(value.lastKnownArea, 0);
  const splitEvent = canonicalGroupEventProof(value.splitEvent, "group-split");
  if (
    members === null
    || memberBindings === null
    || members.length < 2
    || members.length > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_MEMBER_COUNT
    || typeof value.separatedMemberActorId !== "string"
    || !members.includes(value.separatedMemberActorId)
    || homeArea === null
    || homeArea.radiusUnits === 0
    || lastKnownArea === null
    || splitEvent === null
    || splitEvent.groupId !== value.groupId
    || !splitEvent.memberOrdinals.includes(value.separatedMemberOrdinal)
    || splitEvent.memberOrdinals.length !== members.length
    || stableStringify(memberBindings.map(({ populationOrdinal }) => populationOrdinal)
      .sort((left, right) => left - right)) !== stableStringify(splitEvent.memberOrdinals)
    || memberBindings.find(({ actorId }) => actorId === value.separatedMemberActorId)
      ?.populationOrdinal !== value.separatedMemberOrdinal
  ) return null;
  const fields = {
    settlementId: value.settlementId,
    custodyRelationshipId: value.custodyRelationshipId,
    homeId: value.homeId,
    homeStructureId: value.homeStructureId,
    caretakerActorId: value.caretakerActorId as string,
    species,
    memberActorIds: members,
    memberBindings,
    groupId: value.groupId,
    separatedMemberActorId: value.separatedMemberActorId,
    separatedMemberOrdinal: value.separatedMemberOrdinal,
    homeArea,
    lastKnownArea,
    splitEvent,
  } as const;
  return value.proofId !== openingProofId(fields) ? null : deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: value.proofId,
    ...fields,
  });
}

function canonicalNoticeProof(
  value: unknown,
  current?: SettlementDomesticAnimalRecoveryCase,
): SettlementDomesticAnimalRecoveryNoticeProof | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "caretakerActorId",
      "homeObservations",
      "learnedAtTick",
      "proofId",
      "separatedArea",
      "separatedMemberActorId",
      "separatedObservationId",
      "separatedObservedAtTick",
      "source",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION
    || !validId(value.proofId)
    || !livingSpeciesActorIdMatchesNamespace(value.caretakerActorId, "human")
    || (value.source !== "current-dual-sight"
      && value.source !== "witnessed-split-home-census")
    || !nonnegativeSafeInteger(value.learnedAtTick)
    || !validId(value.separatedMemberActorId)
    || !validId(value.separatedObservationId)
    || !nonnegativeSafeInteger(value.separatedObservedAtTick)
    || value.separatedObservedAtTick > value.learnedAtTick
    || !Array.isArray(value.homeObservations)
    || value.homeObservations.length === 0
    || value.homeObservations.length >= SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_MEMBER_COUNT
  ) return null;
  const separatedArea = canonicalArea(value.separatedArea, 0);
  const homeObservations = canonicalObservationReferences(value.homeObservations);
  if (separatedArea === null || homeObservations === null) return null;
  const fields = {
    caretakerActorId: value.caretakerActorId as string,
    source: value.source,
    learnedAtTick: value.learnedAtTick,
    separatedMemberActorId: value.separatedMemberActorId,
    separatedObservationId: value.separatedObservationId,
    separatedObservedAtTick: value.separatedObservedAtTick,
    separatedArea,
    homeObservations,
  } as const;
  if (
    value.proofId !== noticeProofId(fields)
    || homeObservations.some(({ memberActorId, observationId, observedAtTick }) => (
      memberActorId === fields.separatedMemberActorId
      || observationId === fields.separatedObservationId
      || observedAtTick !== fields.learnedAtTick
    ))
    || current !== undefined
      && (
        fields.caretakerActorId !== current.caretakerActorId
        || fields.separatedMemberActorId !== current.separatedMemberActorId
        || pointInsideArea(fields.separatedArea.center, current.homeArea)
        || fields.learnedAtTick < current.openedAtTick
        || (fields.source === "current-dual-sight"
          ? fields.separatedObservedAtTick !== fields.learnedAtTick
            || homeObservations.length !== 1
          : fields.separatedObservedAtTick !== current.activeSplitEvent.atTick
            || homeObservations.length !== current.memberActorIds.length - 1
            || !current.memberActorIds.every((actorId) => (
              actorId === current.separatedMemberActorId
              || homeObservations.some(({ memberActorId }) => memberActorId === actorId)
            )))
        || homeObservations.some(({ memberActorId, area }) => (
          !current.memberActorIds.includes(memberActorId)
          || !pointInsideArea(area.center, current.homeArea)
        ))
      )
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: value.proofId,
    ...fields,
  });
}

function canonicalSearchProof(
  value: unknown,
  current?: SettlementDomesticAnimalRecoveryCase,
): SettlementDomesticAnimalRecoverySearchProof | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "assignmentId",
      "handlerActorId",
      "linkedAtTick",
      "proofId",
      "searchProbeId",
      "sourceArea",
      "sourceObservationId",
      "taskId",
      "version",
      "workerActorId",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION
    || !validId(value.proofId)
    || !validId(value.assignmentId)
    || !validId(value.taskId)
    || !validId(value.workerActorId)
    || !livingSpeciesActorIdMatchesNamespace(value.handlerActorId, "human")
    || !validId(value.sourceObservationId)
    || !validId(value.searchProbeId)
    || !nonnegativeSafeInteger(value.linkedAtTick)
  ) return null;
  const sourceArea = canonicalArea(value.sourceArea, 10_000_000);
  if (sourceArea === null) return null;
  const fields = {
    assignmentId: value.assignmentId,
    taskId: value.taskId,
    workerActorId: value.workerActorId,
    handlerActorId: value.handlerActorId as string,
    sourceObservationId: value.sourceObservationId,
    sourceArea,
    searchProbeId: value.searchProbeId,
    linkedAtTick: value.linkedAtTick,
  } as const;
  if (
    value.proofId !== searchProofId(fields)
    || current !== undefined
      && (
        fields.handlerActorId !== current.caretakerActorId
        || stableStringify(fields.sourceArea) !== stableStringify(current.lastKnownArea)
      )
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: value.proofId,
    ...fields,
  });
}

function canonicalReopenProof(
  value: unknown,
  current?: SettlementDomesticAnimalRecoveryCase,
): SettlementDomesticAnimalRecoveryReopenProof | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "priorReunionEvent",
      "priorSearchTaskId",
      "proofId",
      "reopenedAtTick",
      "resplitEvent",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION
    || !validId(value.proofId)
    || !nullableReference(value.priorSearchTaskId)
    || !nonnegativeSafeInteger(value.reopenedAtTick)
  ) return null;
  const priorReunionEvent = canonicalGroupEventProof(
    value.priorReunionEvent,
    "group-rejoined",
  );
  const resplitEvent = canonicalGroupEventProof(value.resplitEvent, "group-split");
  if (
    priorReunionEvent === null
    || resplitEvent === null
    || priorReunionEvent.groupId !== resplitEvent.groupId
    || stableStringify(priorReunionEvent.memberOrdinals)
      !== stableStringify(resplitEvent.memberOrdinals)
    || resplitEvent.atTick <= priorReunionEvent.atTick
    || value.reopenedAtTick !== resplitEvent.atTick
  ) return null;
  const fields = {
    priorReunionEvent,
    resplitEvent,
    priorSearchTaskId: value.priorSearchTaskId,
    reopenedAtTick: value.reopenedAtTick,
  } as const;
  if (
    value.proofId !== reopenProofId(fields)
    || current !== undefined
      && (
        current.phase !== "awaiting-confirmation"
        || current.reunionEvent === null
        || stableStringify(priorReunionEvent) !== stableStringify(current.reunionEvent)
        || fields.priorSearchTaskId !== (current.linkedSearch?.taskId ?? null)
        || resplitEvent.groupId !== current.groupId
        || stableStringify(resplitEvent.memberOrdinals)
          !== stableStringify(current.memberBindings.map(({ populationOrdinal }) => (
            populationOrdinal
          )).sort((left, right) => left - right))
      )
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: value.proofId,
    ...fields,
  });
}

function canonicalGroupEventProof(
  value: unknown,
  expectedKind?: "group-split" | "group-rejoined",
): SettlementDomesticAnimalRecoveryGroupEventProof | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "atTick",
      "causeReferenceId",
      "componentIds",
      "eventId",
      "groupId",
      "kind",
      "memberOrdinals",
      "proofId",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION
    || !validId(value.proofId)
    || !validReference(value.eventId)
    || !validId(value.groupId)
    || !nonnegativeSafeInteger(value.atTick)
    || (value.kind !== "group-split" && value.kind !== "group-rejoined")
    || expectedKind !== undefined && value.kind !== expectedKind
    || !validReference(value.causeReferenceId)
  ) return null;
  const kind = value.kind as "group-split" | "group-rejoined";
  const members = canonicalOrdinalArray(value.memberOrdinals, 2, 48);
  const components = canonicalIdArray(value.componentIds, kind === "group-split" ? 2 : 1);
  const fields = {
    eventId: value.eventId,
    groupId: value.groupId,
    atTick: value.atTick,
    kind,
    causeReferenceId: value.causeReferenceId,
    memberOrdinals: members,
    componentIds: components,
  };
  if (
    members === null
    || components === null
    || components.length !== (kind === "group-split" ? 2 : 1)
    || value.proofId !== groupEventProofId(fields as GroupEventProofFields)
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: value.proofId,
    ...fields,
    memberOrdinals: members,
    componentIds: components,
  });
}

function canonicalConfirmationProof(
  value: unknown,
  current?: SettlementDomesticAnimalRecoveryCase,
): SettlementDomesticAnimalRecoveryConfirmationProof | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "confirmedAtTick",
      "handlerActorId",
      "observations",
      "proofId",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION
    || !validId(value.proofId)
    || !livingSpeciesActorIdMatchesNamespace(value.handlerActorId, "human")
    || !nonnegativeSafeInteger(value.confirmedAtTick)
    || !Array.isArray(value.observations)
    || value.observations.length < 2
    || value.observations.length > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_MEMBER_COUNT
  ) return null;
  const observations: SettlementDomesticAnimalRecoveryConfirmationObservation[] = [];
  const members = new Set<string>();
  const observationIds = new Set<string>();
  for (const raw of value.observations) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["area", "memberActorId", "observationId", "observedAtTick"])
      || !validId(raw.memberActorId)
      || !validId(raw.observationId)
      || !nonnegativeSafeInteger(raw.observedAtTick)
      || members.has(raw.memberActorId)
      || observationIds.has(raw.observationId)
    ) return null;
    const area = canonicalArea(raw.area, 0);
    if (area === null) return null;
    members.add(raw.memberActorId);
    observationIds.add(raw.observationId);
    observations.push(deepFreeze({
      memberActorId: raw.memberActorId,
      observationId: raw.observationId,
      observedAtTick: raw.observedAtTick,
      area,
    }));
  }
  observations.sort((left, right) => compareText(left.memberActorId, right.memberActorId));
  if (stableStringify(observations) !== stableStringify(value.observations)) return null;
  const fields = {
    handlerActorId: value.handlerActorId as string,
    confirmedAtTick: value.confirmedAtTick,
    observations: Object.freeze(observations),
  } as const;
  if (
    value.proofId !== confirmationProofId(fields)
    || current !== undefined
      && (
        fields.handlerActorId !== current.caretakerActorId
        || stableStringify(observations.map(({ memberActorId }) => memberActorId))
          !== stableStringify(current.memberActorIds)
        || observations.some(({ observedAtTick }) => observedAtTick !== fields.confirmedAtTick)
        || observations.some(({ area }) => !pointInsideArea(area.center, current.homeArea))
      )
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: value.proofId,
    ...fields,
  });
}

function canonicalRecoveryCase(
  value: unknown,
  settlementId: number,
): SettlementDomesticAnimalRecoveryCase | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "activeSplitEvent",
      "caretakerActorId",
      "caseId",
      "caseOrdinal",
      "custodyRelationshipId",
      "groupId",
      "homeArea",
      "homeId",
      "homeStructureId",
      "lastKnownArea",
      "lastTransition",
      "latestReopen",
      "linkedSearch",
      "memberActorIds",
      "memberBindings",
      "notice",
      "openedAtTick",
      "phase",
      "reunionEvent",
      "separatedMemberActorId",
      "separatedMemberOrdinal",
      "settlementId",
      "species",
      "splitEvent",
      "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION
    || value.settlementId !== settlementId
    || !validId(value.caseId)
    || !positiveSafeInteger(value.caseOrdinal)
    || !isRecoveryPhase(value.phase)
  ) return null;
  const opening = canonicalOpeningProof({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
    proofId: openingProofId({
      settlementId: value.settlementId,
      custodyRelationshipId: value.custodyRelationshipId,
      homeId: value.homeId,
      homeStructureId: value.homeStructureId,
      caretakerActorId: value.caretakerActorId,
      species: value.species,
      memberActorIds: value.memberActorIds,
      memberBindings: value.memberBindings,
      groupId: value.groupId,
      separatedMemberActorId: value.separatedMemberActorId,
      separatedMemberOrdinal: value.separatedMemberOrdinal,
      homeArea: value.homeArea,
      lastKnownArea: value.lastKnownArea,
      splitEvent: value.splitEvent,
    } as OpeningProofFields),
    settlementId: value.settlementId,
    custodyRelationshipId: value.custodyRelationshipId,
    homeId: value.homeId,
    homeStructureId: value.homeStructureId,
    caretakerActorId: value.caretakerActorId,
    species: value.species,
    memberActorIds: value.memberActorIds,
    memberBindings: value.memberBindings,
    groupId: value.groupId,
    separatedMemberActorId: value.separatedMemberActorId,
    separatedMemberOrdinal: value.separatedMemberOrdinal,
    homeArea: value.homeArea,
    lastKnownArea: value.lastKnownArea,
    splitEvent: value.splitEvent,
  });
  if (opening === null || !nonnegativeSafeInteger(value.openedAtTick)) return null;
  const notice = value.notice === null ? null : canonicalNoticeProof(value.notice);
  const linkedSearch = value.linkedSearch === null ? null : canonicalSearchProof(value.linkedSearch);
  const reunionEvent = value.reunionEvent === null
    ? null
    : canonicalGroupEventProof(value.reunionEvent, "group-rejoined");
  const activeSplitEvent = canonicalGroupEventProof(value.activeSplitEvent, "group-split");
  const latestReopen = value.latestReopen === null
    ? null
    : canonicalReopenProof(value.latestReopen);
  const lastTransition = canonicalTransitionReference(value.lastTransition);
  const lastKnownArea = canonicalArea(value.lastKnownArea, 0);
  if (
    notice !== null && canonicalNoticeProof(notice, value as unknown as SettlementDomesticAnimalRecoveryCase) === null
    || linkedSearch !== null
      && canonicalSearchProof(linkedSearch, value as unknown as SettlementDomesticAnimalRecoveryCase) === null
    || reunionEvent !== null
      && (
        reunionEvent.groupId !== opening.groupId
        || stableStringify(reunionEvent.memberOrdinals)
          !== stableStringify(opening.splitEvent.memberOrdinals)
      )
    || activeSplitEvent === null
    || activeSplitEvent.groupId !== opening.groupId
    || stableStringify(activeSplitEvent.memberOrdinals)
      !== stableStringify(opening.splitEvent.memberOrdinals)
    || latestReopen !== null
      && (
        stableStringify(latestReopen.resplitEvent) !== stableStringify(activeSplitEvent)
        || latestReopen.priorReunionEvent.atTick > latestReopen.resplitEvent.atTick
      )
    || lastTransition === null
    || lastKnownArea === null
    || value.openedAtTick !== opening.splitEvent.atTick
    || value.caseId !== recoveryCaseId(opening, value.caseOrdinal)
    || (notice === null
      ? stableStringify(lastKnownArea) !== stableStringify(opening.lastKnownArea)
      : stableStringify(lastKnownArea) !== stableStringify(notice.separatedArea))
    || !casePhaseCoherent(
      value.phase,
      notice,
      linkedSearch,
      reunionEvent,
      latestReopen,
      lastTransition,
    )
  ) return null;
  const canonical: SettlementDomesticAnimalRecoveryCase = deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION,
    caseId: value.caseId,
    caseOrdinal: value.caseOrdinal,
    settlementId,
    custodyRelationshipId: opening.custodyRelationshipId,
    homeId: opening.homeId,
    homeStructureId: opening.homeStructureId,
    caretakerActorId: opening.caretakerActorId,
    species: opening.species,
    memberActorIds: opening.memberActorIds,
    memberBindings: opening.memberBindings,
    groupId: opening.groupId,
    separatedMemberActorId: opening.separatedMemberActorId,
    separatedMemberOrdinal: opening.separatedMemberOrdinal,
    openedAtTick: value.openedAtTick,
    homeArea: opening.homeArea,
    lastKnownArea,
    splitEvent: opening.splitEvent,
    activeSplitEvent,
    phase: value.phase,
    notice,
    linkedSearch,
    reunionEvent,
    latestReopen,
    lastTransition,
  });
  return recoveryCaseChronologyIsValid(canonical)
    && recoveryCaseLastTransitionIsBound(canonical)
    ? canonical
    : null;
}

function canonicalRecoveryOutcome(
  value: unknown,
  settlementId: number,
): SettlementDomesticAnimalRecoveryOutcome | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "activeSplitEvent", "caretakerActorId", "caseId", "caseOrdinal", "closedAtTick", "confirmation",
      "custodyRelationshipId", "groupId", "homeArea", "homeId", "homeStructureId",
      "lastKnownArea", "lastTransition", "latestReopen", "linkedSearch", "memberActorIds",
      "memberBindings", "notice",
      "openedAtTick", "outcome", "reunionEvent", "reunionTransition", "separatedMemberActorId",
      "separatedMemberOrdinal", "settlementId", "species", "splitEvent", "version",
    ])
    || value.version !== SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION
    || value.settlementId !== settlementId
    || (value.outcome !== "recovered" && value.outcome !== "self-returned")
    || !nonnegativeSafeInteger(value.closedAtTick)
  ) return null;
  const caseView = canonicalRecoveryCase({
    version: value.version,
    caseId: value.caseId,
    caseOrdinal: value.caseOrdinal,
    settlementId: value.settlementId,
    custodyRelationshipId: value.custodyRelationshipId,
    homeId: value.homeId,
    homeStructureId: value.homeStructureId,
    caretakerActorId: value.caretakerActorId,
    species: value.species,
    memberActorIds: value.memberActorIds,
    memberBindings: value.memberBindings,
    groupId: value.groupId,
    separatedMemberActorId: value.separatedMemberActorId,
    separatedMemberOrdinal: value.separatedMemberOrdinal,
    openedAtTick: value.openedAtTick,
    homeArea: value.homeArea,
    lastKnownArea: value.lastKnownArea,
    splitEvent: value.splitEvent,
    activeSplitEvent: value.activeSplitEvent,
    phase: "awaiting-confirmation",
    notice: value.notice,
    linkedSearch: value.linkedSearch,
    reunionEvent: value.reunionEvent,
    latestReopen: value.latestReopen,
    lastTransition: value.reunionTransition,
  }, settlementId);
  const confirmation = caseView === null
    ? null
    : canonicalConfirmationProof(value.confirmation, caseView);
  const lastTransition = canonicalTransitionReference(value.lastTransition);
  const reunionTransition = canonicalTransitionReference(value.reunionTransition);
  if (
    caseView === null
    || caseView.reunionEvent === null
    || confirmation === null
    || lastTransition === null
    || reunionTransition === null
    || reunionTransition.transition !== "record-rejoin"
    || reunionTransition.transactionId !== caseView.lastTransition.transactionId
    || reunionTransition.ordinal !== caseView.lastTransition.ordinal
    || reunionTransition.acceptedAtTick !== caseView.reunionEvent.atTick
    || !transitionReferenceMatches(
      reunionTransition,
      caseView.caseId,
      caseView.caseOrdinal,
      "record-rejoin",
      caseView.reunionEvent,
      caseView.reunionEvent.atTick,
    )
    || lastTransition.transition !== "confirm-home"
    || lastTransition.ordinal !== reunionTransition.ordinal + 1
    || !transitionReferenceMatches(
      lastTransition,
      caseView.caseId,
      caseView.caseOrdinal,
      "confirm-home",
      confirmation,
      confirmation.confirmedAtTick,
    )
    || (caseView.notice === null) !== (value.outcome === "self-returned")
    || value.closedAtTick !== confirmation.confirmedAtTick
    || value.closedAtTick !== lastTransition.acceptedAtTick
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_CASE_VERSION,
    caseId: caseView.caseId,
    caseOrdinal: caseView.caseOrdinal,
    settlementId,
    custodyRelationshipId: caseView.custodyRelationshipId,
    homeId: caseView.homeId,
    homeStructureId: caseView.homeStructureId,
    caretakerActorId: caseView.caretakerActorId,
    species: caseView.species,
    memberActorIds: caseView.memberActorIds,
    memberBindings: caseView.memberBindings,
    groupId: caseView.groupId,
    separatedMemberActorId: caseView.separatedMemberActorId,
    separatedMemberOrdinal: caseView.separatedMemberOrdinal,
    openedAtTick: caseView.openedAtTick,
    homeArea: caseView.homeArea,
    lastKnownArea: caseView.lastKnownArea,
    splitEvent: caseView.splitEvent,
    activeSplitEvent: caseView.activeSplitEvent,
    notice: caseView.notice,
    linkedSearch: caseView.linkedSearch,
    reunionEvent: caseView.reunionEvent,
    latestReopen: caseView.latestReopen,
    reunionTransition,
    confirmation,
    outcome: value.outcome,
    closedAtTick: value.closedAtTick,
    lastTransition,
  });
}

function pendingFitsState(
  current: SettlementDomesticAnimalRecoveryCase | null,
  latest: SettlementDomesticAnimalRecoveryOutcome | null,
  lastCaseOrdinal: number,
  pending: SettlementDomesticAnimalRecoveryTransition,
): boolean {
  if (pending.transition === "open") {
    const proof = canonicalOpeningProof(pending.proof);
    return current === null
      && pending.caseOrdinal === lastCaseOrdinal + 1
      && proof !== null
      && pending.caseId === recoveryCaseId(proof, pending.caseOrdinal)
      && latest?.splitEvent.eventId !== proof.splitEvent.eventId;
  }
  if (
    current === null
    || pending.caseId !== current.caseId
    || pending.caseOrdinal !== current.caseOrdinal
    || pending.acceptedAtTick < current.lastTransition.acceptedAtTick
  ) return false;
  switch (pending.transition) {
    case "notice": return current.phase === "unnoticed"
      && canonicalNoticeProof(pending.proof, current) !== null;
    case "link-search": return current.phase === "noticed"
      && canonicalSearchProof(pending.proof, current) !== null;
    case "record-rejoin": return (
      current.phase === "unnoticed"
      || current.phase === "noticed"
      || current.phase === "searching"
    )
      && canonicalGroupEventProof(pending.proof, "group-rejoined") !== null;
    case "record-resplit": return current.phase === "awaiting-confirmation"
      && canonicalReopenProof(pending.proof, current) !== null;
    case "confirm-home": return current.phase === "awaiting-confirmation"
      && canonicalConfirmationProof(pending.proof, current) !== null;
  }
}

function casePhaseCoherent(
  phase: SettlementDomesticAnimalRecoveryPhase,
  notice: SettlementDomesticAnimalRecoveryNoticeProof | null,
  linkedSearch: SettlementDomesticAnimalRecoverySearchProof | null,
  reunion: SettlementDomesticAnimalRecoveryGroupEventProof | null,
  latestReopen: SettlementDomesticAnimalRecoveryReopenProof | null,
  last: SettlementDomesticAnimalRecoveryTransitionReference,
): boolean {
  switch (phase) {
    case "unnoticed": return notice === null && linkedSearch === null && reunion === null
      && (last.transition === "open"
        || last.transition === "record-resplit" && latestReopen !== null);
    case "noticed": return notice !== null && linkedSearch === null && reunion === null
      && (last.transition === "notice"
        || last.transition === "record-resplit" && latestReopen !== null);
    case "searching": return notice !== null && linkedSearch !== null && reunion === null
      && last.transition === "link-search";
    case "awaiting-confirmation": return reunion !== null
      && last.transition === "record-rejoin";
  }
}

function recoveryCaseChronologyIsValid(
  current: SettlementDomesticAnimalRecoveryCase,
): boolean {
  if (
    current.openedAtTick !== current.splitEvent.atTick
    || current.activeSplitEvent.atTick < current.splitEvent.atTick
  ) return false;
  if (
    current.latestReopen === null
      ? stableStringify(current.activeSplitEvent) !== stableStringify(current.splitEvent)
      : stableStringify(current.latestReopen.resplitEvent)
          !== stableStringify(current.activeSplitEvent)
        || current.latestReopen.priorReunionEvent.atTick
          >= current.latestReopen.resplitEvent.atTick
  ) return false;
  if (
    current.notice !== null
    && (
      current.notice.learnedAtTick < current.openedAtTick
      || current.notice.separatedObservedAtTick < current.openedAtTick
      || current.notice.separatedObservedAtTick > current.notice.learnedAtTick
    )
  ) return false;
  if (
    current.linkedSearch !== null
    && (
      current.notice === null
      || current.linkedSearch.linkedAtTick < current.notice.learnedAtTick
      || current.latestReopen !== null
        && current.linkedSearch.linkedAtTick < current.latestReopen.reopenedAtTick
    )
  ) return false;
  const priorTick = current.linkedSearch?.linkedAtTick
    ?? current.notice?.learnedAtTick
    ?? current.activeSplitEvent.atTick;
  return current.reunionEvent === null
    || current.reunionEvent.atTick >= current.activeSplitEvent.atTick
      && current.reunionEvent.atTick >= priorTick;
}

function recoveryCaseLastTransitionIsBound(
  current: SettlementDomesticAnimalRecoveryCase,
): boolean {
  const last = current.lastTransition;
  switch (last.transition) {
    case "open": {
      if (current.notice !== null || current.latestReopen !== null) return false;
      const fields: OpeningProofFields = {
        settlementId: current.settlementId,
        custodyRelationshipId: current.custodyRelationshipId,
        homeId: current.homeId,
        homeStructureId: current.homeStructureId,
        caretakerActorId: current.caretakerActorId,
        species: current.species,
        memberActorIds: current.memberActorIds,
        memberBindings: current.memberBindings,
        groupId: current.groupId,
        separatedMemberActorId: current.separatedMemberActorId,
        separatedMemberOrdinal: current.separatedMemberOrdinal,
        homeArea: current.homeArea,
        lastKnownArea: current.lastKnownArea,
        splitEvent: current.splitEvent,
      };
      const proof = canonicalOpeningProof({
        version: SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_PROOF_VERSION,
        proofId: openingProofId(fields),
        ...fields,
      });
      return proof !== null && transitionReferenceMatches(
        last,
        current.caseId,
        current.caseOrdinal,
        "open",
        proof,
        current.openedAtTick,
      );
    }
    case "notice":
      return current.notice !== null && transitionReferenceMatches(
        last,
        current.caseId,
        current.caseOrdinal,
        "notice",
        current.notice,
        current.notice.learnedAtTick,
      );
    case "link-search":
      return current.linkedSearch !== null && transitionReferenceMatches(
        last,
        current.caseId,
        current.caseOrdinal,
        "link-search",
        current.linkedSearch,
        current.linkedSearch.linkedAtTick,
      );
    case "record-rejoin":
      return current.reunionEvent !== null && transitionReferenceMatches(
        last,
        current.caseId,
        current.caseOrdinal,
        "record-rejoin",
        current.reunionEvent,
        current.reunionEvent.atTick,
      );
    case "record-resplit":
      return current.latestReopen !== null && transitionReferenceMatches(
        last,
        current.caseId,
        current.caseOrdinal,
        "record-resplit",
        current.latestReopen,
        current.latestReopen.reopenedAtTick,
      );
    case "confirm-home":
      return false;
  }
}

function transitionReferenceMatches(
  reference: SettlementDomesticAnimalRecoveryTransitionReference,
  caseId: string,
  caseOrdinal: number,
  transition: SettlementDomesticAnimalRecoveryTransitionKind,
  proof: SettlementDomesticAnimalRecoveryTransitionProof,
  acceptedAtTick: number,
): boolean {
  const fields = {
    ordinal: reference.ordinal,
    caseId,
    caseOrdinal,
    transition,
    acceptedAtTick,
    proof,
  } as const;
  return reference.transition === transition
    && reference.acceptedAtTick === acceptedAtTick
    && reference.transactionId === recoveryTransactionId(fields);
}

function transitionProofTick(
  proof: SettlementDomesticAnimalRecoveryTransitionProof,
  transition: SettlementDomesticAnimalRecoveryTransitionKind,
): number {
  switch (transition) {
    case "open":
      return (proof as SettlementDomesticAnimalRecoveryOpeningProof).splitEvent.atTick;
    case "notice":
      return (proof as SettlementDomesticAnimalRecoveryNoticeProof).learnedAtTick;
    case "link-search":
      return (proof as SettlementDomesticAnimalRecoverySearchProof).linkedAtTick;
    case "record-rejoin":
      return (proof as SettlementDomesticAnimalRecoveryGroupEventProof).atTick;
    case "record-resplit":
      return (proof as SettlementDomesticAnimalRecoveryReopenProof).reopenedAtTick;
    case "confirm-home":
      return (proof as SettlementDomesticAnimalRecoveryConfirmationProof).confirmedAtTick;
  }
}

function canonicalTransitionReference(
  value: unknown,
): SettlementDomesticAnimalRecoveryTransitionReference | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["acceptedAtTick", "ordinal", "transactionId", "transition"])
    || !validId(value.transactionId)
    || !positiveSafeInteger(value.ordinal)
    || value.ordinal > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_TRANSITION_ORDINAL
    || !isTransitionKind(value.transition)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
  ) return null;
  return deepFreeze({
    transactionId: value.transactionId,
    ordinal: value.ordinal,
    transition: value.transition,
    acceptedAtTick: value.acceptedAtTick,
  });
}

type OpeningProofFields = Omit<
  SettlementDomesticAnimalRecoveryOpeningProof,
  "proofId" | "version"
>;
type NoticeProofFields = Omit<
  SettlementDomesticAnimalRecoveryNoticeProof,
  "proofId" | "version"
>;
type SearchProofFields = Omit<
  SettlementDomesticAnimalRecoverySearchProof,
  "proofId" | "version"
>;
type ReopenProofFields = Omit<
  SettlementDomesticAnimalRecoveryReopenProof,
  "proofId" | "version"
>;
type GroupEventProofFields = Omit<
  SettlementDomesticAnimalRecoveryGroupEventProof,
  "proofId" | "version"
>;
type ConfirmationProofFields = Omit<
  SettlementDomesticAnimalRecoveryConfirmationProof,
  "proofId" | "version"
>;

function openingProofId(fields: OpeningProofFields): string {
  return `RECOVERY-OPEN-${hashCanonical(fields)}`;
}
function noticeProofId(fields: NoticeProofFields): string {
  return `RECOVERY-NOTICE-${hashCanonical(fields)}`;
}
function searchProofId(fields: SearchProofFields): string {
  return `RECOVERY-SEARCH-${hashCanonical(fields)}`;
}
function reopenProofId(fields: ReopenProofFields): string {
  return `RECOVERY-REOPEN-${hashCanonical(fields)}`;
}
function groupEventProofId(fields: GroupEventProofFields): string {
  return `RECOVERY-GROUP-${hashCanonical(fields)}`;
}
function confirmationProofId(fields: ConfirmationProofFields): string {
  return `RECOVERY-HOME-${hashCanonical(fields)}`;
}
function recoveryCaseId(
  proof: SettlementDomesticAnimalRecoveryOpeningProof,
  caseOrdinal: number,
): string {
  return `DOMESTIC-RECOVERY-${hashCanonical({
    settlementId: proof.settlementId,
    custodyRelationshipId: proof.custodyRelationshipId,
    splitEventId: proof.splitEvent.eventId,
    separatedMemberActorId: proof.separatedMemberActorId,
    caseOrdinal,
  })}`;
}
function recoveryTransactionId(
  fields: Omit<SettlementDomesticAnimalRecoveryTransition, "transactionId" | "version">,
): string {
  return `RECOVERY-TX-${hashCanonical(fields)}`;
}

function canonicalArea(value: unknown, maximumRadiusUnits: number): ObservedArea | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["center", "radiusUnits"])
    || !isWorldPosition(value.center)
    || !nonnegativeSafeInteger(value.radiusUnits)
    || value.radiusUnits > maximumRadiusUnits
  ) return null;
  return deepFreeze({
    center: createWorldPosition(value.center.region, value.center.localX, value.center.localY),
    radiusUnits: value.radiusUnits,
  });
}

function cloneArea(area: ObservedArea): ObservedArea {
  return deepFreeze({
    center: createWorldPosition(area.center.region, area.center.localX, area.center.localY),
    radiusUnits: area.radiusUnits,
  });
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

/** Exact across signed segmented coordinates; never flatten distant space into a Number. */
function pointInsideArea(point: WorldPosition, area: ObservedArea): boolean {
  const dx = (BigInt(point.region.x) - BigInt(area.center.region.x))
      * BigInt(REGION_WIDTH_UNITS)
    + BigInt(point.localX) - BigInt(area.center.localX);
  const dy = (BigInt(point.region.y) - BigInt(area.center.region.y))
      * BigInt(REGION_HEIGHT_UNITS)
    + BigInt(point.localY) - BigInt(area.center.localY);
  const radius = BigInt(area.radiusUnits);
  return dx * dx + dy * dy <= radius * radius;
}

function canonicalOrdinalArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): readonly number[] | null {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > maximumLength) {
    return null;
  }
  const result: number[] = [];
  let previous = -1;
  for (const ordinal of value) {
    if (!nonnegativeSafeInteger(ordinal) || ordinal <= previous) return null;
    result.push(ordinal);
    previous = ordinal;
  }
  return Object.freeze(result);
}

function canonicalIdArray(value: unknown, maximumLength: number): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumLength) return null;
  const result: string[] = [];
  let previous: string | null = null;
  for (const id of value) {
    if (!validId(id) || previous !== null && compareText(previous, id) >= 0) return null;
    result.push(id);
    previous = id;
  }
  return Object.freeze(result);
}

function canonicalActorIds(
  value: unknown,
  species: Exclude<LivingActorSpecies, "human">,
): readonly string[] | null {
  const ids = canonicalIdArray(value, SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_MEMBER_COUNT);
  return ids !== null && ids.every((id) => livingSpeciesActorIdMatchesNamespace(id, species))
    ? ids
    : null;
}

function canonicalMemberActors(
  value: unknown,
  custody: SettlementDomesticAnimalCustodyRecord | undefined,
  group: CoreEcologyGroupState,
  atTick: number,
): Readonly<{
  actors: readonly CoreWildlifeActorState[];
  bindings: readonly SettlementDomesticAnimalRecoveryMemberBinding[];
}> | null {
  if (
    custody === undefined
    || !Array.isArray(value)
    || value.length !== custody.memberActorIds.length
  ) return null;
  const actors: CoreWildlifeActorState[] = [];
  const actorIds = new Set<string>();
  const ordinals = new Set<number>();
  for (const raw of value) {
    const actor = canonicalizeCoreWildlifeActorState(raw);
    if (
      actor === null
      || actor.updatedAtTick !== atTick
      || actor.identity.species !== custody.species
      || actor.identity.species !== group.identity.species
      || actor.identity.populationKey !== group.identity.populationKey
      || actor.identity.originRegion.x !== group.identity.originRegion.x
      || actor.identity.originRegion.y !== group.identity.originRegion.y
      || !custody.memberActorIds.includes(actor.identity.stableId)
      || !group.memberOrdinals.includes(actor.identity.populationOrdinal)
      || actorIds.has(actor.identity.stableId)
      || ordinals.has(actor.identity.populationOrdinal)
    ) return null;
    actorIds.add(actor.identity.stableId);
    ordinals.add(actor.identity.populationOrdinal);
    actors.push(actor);
  }
  if (
    !custody.memberActorIds.every((actorId) => actorIds.has(actorId))
    || !group.memberOrdinals.every((ordinal) => ordinals.has(ordinal))
  ) return null;
  actors.sort((left, right) => compareText(left.identity.stableId, right.identity.stableId));
  const bindings = Object.freeze(actors.map(({ identity }) => deepFreeze({
    actorId: identity.stableId,
    populationOrdinal: identity.populationOrdinal,
  })));
  return deepFreeze({ actors: Object.freeze(actors), bindings });
}

function canonicalMemberBindings(
  value: unknown,
  expectedActorIds: readonly string[] | null,
  expectedOrdinals: readonly number[] | undefined,
): readonly SettlementDomesticAnimalRecoveryMemberBinding[] | null {
  if (
    expectedActorIds === null
    || !Array.isArray(value)
    || value.length !== expectedActorIds.length
    || value.length < 2
    || value.length > SETTLEMENT_DOMESTIC_ANIMAL_RECOVERY_MAX_MEMBER_COUNT
  ) return null;
  const bindings: SettlementDomesticAnimalRecoveryMemberBinding[] = [];
  const actorIds = new Set<string>();
  const ordinals = new Set<number>();
  for (const raw of value) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["actorId", "populationOrdinal"])
      || !validId(raw.actorId)
      || !nonnegativeSafeInteger(raw.populationOrdinal)
      || actorIds.has(raw.actorId)
      || ordinals.has(raw.populationOrdinal)
    ) return null;
    actorIds.add(raw.actorId);
    ordinals.add(raw.populationOrdinal);
    bindings.push(deepFreeze({
      actorId: raw.actorId,
      populationOrdinal: raw.populationOrdinal,
    }));
  }
  bindings.sort((left, right) => compareText(left.actorId, right.actorId));
  if (
    stableStringify(bindings) !== stableStringify(value)
    || stableStringify(bindings.map(({ actorId }) => actorId))
      !== stableStringify(expectedActorIds)
    || expectedOrdinals !== undefined
      && stableStringify([...ordinals].sort((left, right) => left - right))
        !== stableStringify(expectedOrdinals)
  ) return null;
  return Object.freeze(bindings);
}

function observationReference(
  observation: ActorObservation,
): SettlementDomesticAnimalRecoveryConfirmationObservation {
  return deepFreeze({
    memberActorId: observation.subjectId!,
    observationId: observation.id,
    observedAtTick: observation.observedAtTick,
    area: cloneArea(observation.area),
  });
}

function canonicalObservationReferences(
  value: readonly unknown[],
): readonly SettlementDomesticAnimalRecoveryConfirmationObservation[] | null {
  const observations: SettlementDomesticAnimalRecoveryConfirmationObservation[] = [];
  const actors = new Set<string>();
  const evidence = new Set<string>();
  for (const raw of value) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["area", "memberActorId", "observationId", "observedAtTick"])
      || !validId(raw.memberActorId)
      || !validId(raw.observationId)
      || !nonnegativeSafeInteger(raw.observedAtTick)
      || actors.has(raw.memberActorId)
      || evidence.has(raw.observationId)
    ) return null;
    const area = canonicalArea(raw.area, 0);
    if (area === null) return null;
    actors.add(raw.memberActorId);
    evidence.add(raw.observationId);
    observations.push(deepFreeze({
      memberActorId: raw.memberActorId,
      observationId: raw.observationId,
      observedAtTick: raw.observedAtTick,
      area,
    }));
  }
  observations.sort((left, right) => compareText(left.memberActorId, right.memberActorId));
  return stableStringify(observations) === stableStringify(value)
    ? Object.freeze(observations)
    : null;
}

function isRecoveryPhase(value: unknown): value is SettlementDomesticAnimalRecoveryPhase {
  return value === "unnoticed"
    || value === "noticed"
    || value === "searching"
    || value === "awaiting-confirmation";
}

function isTransitionKind(
  value: unknown,
): value is SettlementDomesticAnimalRecoveryTransitionKind {
  return value === "open"
    || value === "notice"
    || value === "link-search"
    || value === "record-rejoin"
    || value === "record-resplit"
    || value === "confirm-home";
}

function validCustodyRelationshipId(value: unknown): value is string {
  return typeof value === "string" && CUSTODY_RELATIONSHIP_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

function nullableReference(value: unknown): value is string | null {
  return value === null || validId(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= 0;
}

function byteLength(value: unknown): number {
  return UTF8_ENCODER.encode(stableStringify(value)).byteLength;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  let actual: readonly PropertyKey[];
  try {
    actual = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (!actual.every((key): key is string => typeof key === "string")) return false;
  const sortedActual = [...actual].sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return sortedActual.length === sortedExpected.length
    && sortedActual.every((key, index) => key === sortedExpected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
