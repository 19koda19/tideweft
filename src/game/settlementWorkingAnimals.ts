import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorPerceptionState,
  queryActorAttention,
  type ActorPerceptionState,
  type AgedActorBelief,
  type ObservedArea,
} from "../sim/actorPerception";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  isLivingActorSpecies,
  isLivingSpeciesActorAddressable,
  livingSpeciesActorIdMatchesNamespace,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";
import {
  deriveLivingActorSearchProbe,
  type LivingActorSearchProbe,
} from "./livingActorLocomotion";

/**
 * Persisted relationship-and-work authority for settlement animals.
 *
 * This owner never owns an actor body, cognition, locomotion, livestock group,
 * item, or hidden world target. It records only stable work relationships and
 * activity accepted from already-lawful actor cognition. New species compose
 * through the same role policy rather than receiving a private AI brain.
 */
export const PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMALS_VERSION = 2 as const;
export const PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION = 2 as const;
export const SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMAL_TASK_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITION_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMAL_TASK_OUTCOME_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMAL_HANDLER_SEARCH_REPORT_VERSION = 1 as const;
export const PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID =
  "game:settlement-working-animals:v1" as const;
export const SETTLEMENT_WORKING_ANIMALS_OWNER_ID =
  "game:settlement-working-animals:v2" as const;
export const SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS = 8 as const;
export const SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES = 32 * 1_024;
// State retains only the current/pending transition. Keep the ordinal inside
// the paired revision budget without imposing a play-length-sized terminal.
export const SETTLEMENT_WORKING_ANIMAL_MAX_ACTIVITY_ORDINAL =
  Math.floor(Number.MAX_SAFE_INTEGER / 2);
export const SETTLEMENT_WORKING_ANIMAL_MAX_TASK_ORDINAL =
  Math.floor(Number.MAX_SAFE_INTEGER / 2);
export const SETTLEMENT_WORKING_ANIMAL_MAX_TASK_TRANSITION_ORDINAL =
  Math.floor(Number.MAX_SAFE_INTEGER / 2);
export const SETTLEMENT_WORKING_ANIMAL_MAX_DUTY_RADIUS_UNITS =
  64 * WORLD_POSITION_UNITS_PER_TILE;
/** A worksite is a narrow physical anchor, never the assignment's full duty area. */
export const SETTLEMENT_WORKING_ANIMAL_RETURN_RADIUS_UNITS =
  WORLD_POSITION_UNITS_PER_TILE;
export const SETTLEMENT_WORKING_ANIMAL_SURVIVAL_OVERRIDE_THRESHOLD = 700_000 as const;
export const SETTLEMENT_WORKING_ANIMAL_GUARDIAN_SIGNAL_THRESHOLD = 180_000 as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._\/-]{0,191}$/u;
const CUSTODY_RELATIONSHIP_PATTERN = /^DOMESTIC-REL-[0-9a-f]{16}$/u;
const HANDLER_SEARCH_REPORT_PATTERN = /^WORK-REPORT-[0-9a-f]{16}$/u;
const UTF8_ENCODER = new TextEncoder();

/** The role domain is versioned. Alpha 26 deliberately ships one role. */
export const SETTLEMENT_WORKING_ANIMAL_ROLES = Object.freeze([
  "guardian",
] as const);
export type SettlementWorkingAnimalRole =
  (typeof SETTLEMENT_WORKING_ANIMAL_ROLES)[number];

export const SETTLEMENT_WORKING_ANIMAL_ACTIVITIES = Object.freeze([
  "watch",
  "investigate",
  "return",
  "survival-override",
  "defer-to-actor",
] as const);
export type SettlementWorkingAnimalActivity =
  (typeof SETTLEMENT_WORKING_ANIMAL_ACTIVITIES)[number];

export const SETTLEMENT_WORKING_ANIMAL_TASK_PHASES = Object.freeze([
  "investigating",
  "returning",
  "awaiting-handler",
  "closed",
] as const);
export type SettlementWorkingAnimalTaskPhase =
  (typeof SETTLEMENT_WORKING_ANIMAL_TASK_PHASES)[number];
export type SettlementWorkingAnimalCurrentTaskPhase = Exclude<
  SettlementWorkingAnimalTaskPhase,
  "closed"
>;

export const SETTLEMENT_WORKING_ANIMAL_TASK_OUTCOMES = Object.freeze([
  "completed",
  "cancelled",
] as const);
export type SettlementWorkingAnimalTaskOutcomeKind =
  (typeof SETTLEMENT_WORKING_ANIMAL_TASK_OUTCOMES)[number];

export const SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITIONS = Object.freeze([
  "open",
  "suspend",
  "resume",
  "complete",
  "cancel",
  "arrive",
  "acknowledge",
] as const);
export type SettlementWorkingAnimalTaskTransitionKind =
  (typeof SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITIONS)[number];

export type SettlementWorkingAnimalActivityCause =
  | Readonly<{
      readonly kind: "assignment";
      readonly referenceId: string;
    }>
  | Readonly<{
      readonly kind: "perception";
      /** Opaque accepted observation ID; never a subject identity. */
      readonly referenceId: string;
    }>
  | Readonly<{
      readonly kind: "handler-report";
      /** Opaque report ID committing the handler's source, known tick, and known area. */
      readonly referenceId: string;
    }>
  | Readonly<{
      readonly kind: "welfare";
      readonly referenceId: SettlementWorkingAnimalWelfareReference;
    }>
  | Readonly<{
      readonly kind: "actor-disposition";
      /** Opaque actor-owned intent reference; never assignment or target truth. */
      readonly referenceId: string;
    }>;

export type SettlementWorkingAnimalWelfareReference =
  | "welfare:injury-pressure"
  | "welfare:cold-pressure"
  | "welfare:heat-pressure"
  | "welfare:exhaustion-pressure"
  | "welfare:thirst-pressure"
  | "welfare:hunger-pressure";

export type SettlementWorkingAnimalTaskSuspension =
  | Readonly<{
      readonly kind: "welfare";
      readonly referenceId: SettlementWorkingAnimalWelfareReference;
    }>
  | Readonly<{
      readonly kind: "actor-disposition";
      readonly referenceId: string;
    }>;

export type SettlementWorkingAnimalTaskTransitionCause =
  | Readonly<{
      readonly kind: "activity";
      readonly referenceId: string;
    }>
  | SettlementWorkingAnimalTaskSuspension
  | Readonly<{
      readonly kind: "assignment";
      readonly referenceId: string;
    }>
  | Readonly<{
      readonly kind: "probe";
      readonly referenceId: string;
    }>
  | Readonly<{
      readonly kind: "handler-recall";
      readonly referenceId: string;
      readonly workerObservationId: string;
      readonly handlerObservationId: string;
    }>
  | Readonly<{
      readonly kind: "worksite";
      readonly referenceId: string;
    }>
  | Readonly<{
      readonly kind: "handler-acknowledgement";
      readonly referenceId: string;
    }>;

export interface SettlementWorkingAnimalDutyArea {
  readonly center: WorldPosition;
  readonly radiusUnits: number;
}

/**
 * One accepted action. `perceivedArea` is copied only from lawful cognition;
 * it is deliberately an uncertain sensory area and has no target actor ID.
 */
export interface SettlementWorkingAnimalActivityTransaction {
  readonly version: typeof SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION;
  readonly transactionId: string;
  readonly ordinal: number;
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly activity: SettlementWorkingAnimalActivity;
  readonly acceptedAtTick: number;
  readonly cause: SettlementWorkingAnimalActivityCause;
  readonly perceivedArea: ObservedArea | null;
}

/**
 * One bounded task derived from an already-committed investigation. It retains
 * uncertain sensory space and a deterministic locomotion-owned probe, never a
 * hidden target identity. The animal remains governed by its own cognition and
 * welfare while this relationship record is open.
 */
export interface SettlementWorkingAnimalTask {
  readonly version: typeof SETTLEMENT_WORKING_ANIMAL_TASK_VERSION;
  readonly taskId: string;
  readonly taskOrdinal: number;
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly handlerActorId: string;
  readonly sourceActivityTransactionId: string;
  readonly sourceObservationId: string;
  readonly openedAtTick: number;
  readonly perceivedArea: ObservedArea;
  readonly searchProbe: LivingActorSearchProbe;
  readonly phase: SettlementWorkingAnimalCurrentTaskPhase;
  readonly outcome: SettlementWorkingAnimalTaskOutcomeKind | null;
  readonly outcomeAtTick: number | null;
  readonly outcomeTransition: SettlementWorkingAnimalTaskTransition | null;
  readonly suspension: SettlementWorkingAnimalTaskSuspension | null;
  readonly lastTransition: SettlementWorkingAnimalTaskTransition;
}

/** Only the latest closed result is retained; this is not an unbounded task journal. */
export interface SettlementWorkingAnimalTaskOutcome {
  readonly version: typeof SETTLEMENT_WORKING_ANIMAL_TASK_OUTCOME_VERSION;
  readonly taskId: string;
  readonly taskOrdinal: number;
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly handlerActorId: string;
  readonly sourceActivityTransactionId: string;
  readonly sourceObservationId: string;
  readonly perceivedArea: ObservedArea;
  readonly searchProbe: LivingActorSearchProbe;
  readonly phase: "closed";
  readonly outcome: SettlementWorkingAnimalTaskOutcomeKind;
  readonly outcomeAtTick: number;
  readonly outcomeTransition: SettlementWorkingAnimalTaskTransition;
  /** Authenticated proof that the actor physically re-entered its worksite. */
  readonly arrivalTransition: SettlementWorkingAnimalTaskTransition;
  readonly closedAtTick: number;
  readonly lastTransition: SettlementWorkingAnimalTaskTransition;
}

/** One exact-once lifecycle transition; all geometry is re-derived before staging. */
export interface SettlementWorkingAnimalTaskTransition {
  readonly version: typeof SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITION_VERSION;
  readonly transactionId: string;
  readonly ordinal: number;
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly handlerActorId: string;
  readonly taskId: string;
  readonly taskOrdinal: number;
  readonly transition: SettlementWorkingAnimalTaskTransitionKind;
  readonly acceptedAtTick: number;
  readonly cause: SettlementWorkingAnimalTaskTransitionCause;
  /** Populated only by `open`; all later transitions reuse the saved task. */
  readonly sourceActivityTransactionId: string | null;
  readonly sourceObservationId: string | null;
  readonly perceivedArea: ObservedArea | null;
  readonly searchProbe: LivingActorSearchProbe | null;
  /** Populated only by `open` or `suspend`. */
  readonly suspension: SettlementWorkingAnimalTaskSuspension | null;
}

export interface SettlementWorkingAnimalAssignment {
  readonly version: typeof SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION;
  readonly assignmentOrdinal: number;
  readonly assignmentId: string;
  readonly settlementId: number;
  readonly workerActorId: string;
  readonly workerSpecies: Exclude<LivingActorSpecies, "human">;
  readonly handlerActorId: string;
  readonly workerCustodyRelationshipId: string;
  readonly protectedCustodyRelationshipId: string;
  readonly protectedGroupId: string;
  readonly role: SettlementWorkingAnimalRole;
  readonly worksiteId: string;
  readonly dutyArea: SettlementWorkingAnimalDutyArea;
  readonly createdAtTick: number;
  readonly currentActivity: SettlementWorkingAnimalActivityTransaction;
  readonly lastResolvedActivityOrdinal: number;
  readonly pendingActivity: SettlementWorkingAnimalActivityTransaction | null;
  readonly lastTaskOrdinal: number;
  readonly lastResolvedTaskTransitionOrdinal: number;
  readonly currentTask: SettlementWorkingAnimalTask | null;
  readonly lastTaskOutcome: SettlementWorkingAnimalTaskOutcome | null;
  readonly pendingTaskTransition: SettlementWorkingAnimalTaskTransition | null;
}

export interface SettlementWorkingAnimalState {
  readonly version: typeof SETTLEMENT_WORKING_ANIMALS_VERSION;
  readonly ownerId: typeof SETTLEMENT_WORKING_ANIMALS_OWNER_ID;
  readonly revision: number;
  readonly settlementId: number;
  readonly assignments: readonly SettlementWorkingAnimalAssignment[];
}

export interface CreateSettlementWorkingAnimalAssignmentInput {
  readonly assignmentOrdinal: number;
  readonly workerActorId: string;
  readonly workerSpecies: Exclude<LivingActorSpecies, "human">;
  readonly handlerActorId: string;
  readonly workerCustodyRelationshipId: string;
  readonly protectedCustodyRelationshipId: string;
  readonly protectedGroupId: string;
  readonly role: SettlementWorkingAnimalRole;
  readonly worksiteId: string;
  readonly dutyArea: SettlementWorkingAnimalDutyArea;
  readonly createdAtTick: number;
}

export interface CreateSettlementWorkingAnimalStateInput {
  readonly settlementId: number;
  readonly assignments: readonly CreateSettlementWorkingAnimalAssignmentInput[];
}

/** Species-neutral normalized welfare view supplied by the actor owner. */
export interface SettlementWorkingAnimalWelfareState {
  readonly injuryPressure: number;
  readonly coldPressure: number;
  readonly heatPressure: number;
  readonly exhaustionPressure: number;
  readonly hungerPressure: number;
  readonly thirstPressure: number;
}

export interface SettlementWorkingAnimalActivityAccessibility {
  readonly watch: boolean;
  readonly investigate: boolean;
  readonly return: boolean;
}

/**
 * Species-neutral work readiness supplied by the actor's own cognition owner.
 * Work may observe this veto, but it cannot replace or reinterpret the actor's
 * autonomous intent.
 */
export type SettlementWorkingAnimalActorDisposition =
  | Readonly<{ readonly kind: "available" }>
  | Readonly<{
      readonly kind: "defer-to-actor";
      readonly referenceId: string;
    }>;

export interface SettlementWorkingAnimalActivityDecisionInput {
  readonly assignment: SettlementWorkingAnimalAssignment;
  readonly tick: number;
  /** The worker's shared cognition state, already advanced by perception. */
  readonly perception: ActorPerceptionState;
  readonly welfare: SettlementWorkingAnimalWelfareState;
  readonly accessibility: SettlementWorkingAnimalActivityAccessibility;
  readonly actorDisposition: SettlementWorkingAnimalActorDisposition;
  readonly workerInsideDutyArea: boolean;
}

export interface SettlementWorkingAnimalActivityEvaluationInput {
  readonly assignmentId: string;
  readonly tick: number;
  readonly perception: ActorPerceptionState;
  readonly welfare: SettlementWorkingAnimalWelfareState;
  readonly accessibility: SettlementWorkingAnimalActivityAccessibility;
  readonly actorDisposition: SettlementWorkingAnimalActorDisposition;
  readonly workerInsideDutyArea: boolean;
}

/** Ephemeral decision contains sensory area but no subject identity. */
export interface SettlementWorkingAnimalActivityDecision {
  readonly version: typeof SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION;
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly activity: SettlementWorkingAnimalActivity;
  readonly decidedAtTick: number;
  readonly cause: SettlementWorkingAnimalActivityCause;
  readonly perceivedArea: ObservedArea | null;
}

export interface SettlementWorkingAnimalActivityStageResult {
  readonly state: SettlementWorkingAnimalState;
  readonly decision: SettlementWorkingAnimalActivityDecision;
  readonly transaction: SettlementWorkingAnimalActivityTransaction | null;
  readonly staged: boolean;
  readonly reusedPendingTransaction: boolean;
}

export interface SettlementWorkingAnimalActivityResolution {
  readonly state: SettlementWorkingAnimalState;
  readonly activity: SettlementWorkingAnimalActivityTransaction;
  readonly applied: boolean;
}

/**
 * Knowledge-honest handler-to-worker information. The report commits only a
 * previously learned area; it carries no hidden target identity or live
 * position and is not a sensory/threat relabel.
 */
export interface SettlementWorkingAnimalHandlerSearchReport {
  readonly version: typeof SETTLEMENT_WORKING_ANIMAL_HANDLER_SEARCH_REPORT_VERSION;
  readonly reportId: string;
  readonly assignmentId: string;
  readonly handlerActorId: string;
  readonly knownAtTick: number;
  readonly sourceReferenceId: string;
  readonly knownArea: ObservedArea;
}

export interface CreateSettlementWorkingAnimalHandlerSearchReportInput {
  readonly assignmentId: string;
  readonly handlerActorId: string;
  readonly knownAtTick: number;
  readonly sourceReferenceId: string;
  readonly knownArea: ObservedArea;
}

export interface SettlementWorkingAnimalHandlerSearchEvaluationInput {
  readonly tick: number;
  readonly report: SettlementWorkingAnimalHandlerSearchReport;
  readonly welfare: SettlementWorkingAnimalWelfareState;
  readonly accessibility: SettlementWorkingAnimalActivityAccessibility;
  readonly actorDisposition: SettlementWorkingAnimalActorDisposition;
  readonly workerInsideDutyArea: boolean;
}

/** Explicit handler intent. It is inert unless current reciprocal sight proves contact. */
export type SettlementWorkingAnimalHandlerDisposition =
  | Readonly<{ readonly kind: "continue" }>
  | Readonly<{
      readonly kind: "recall";
      readonly referenceId: string;
    }>;

export interface SettlementWorkingAnimalTaskLifecycleEvaluationInput {
  readonly assignmentId: string;
  readonly tick: number;
  readonly workerPosition: WorldPosition;
  readonly handlerPosition: WorldPosition;
  readonly workerPerception: ActorPerceptionState;
  readonly handlerPerception: ActorPerceptionState;
  readonly welfare: SettlementWorkingAnimalWelfareState;
  readonly actorDisposition: SettlementWorkingAnimalActorDisposition;
  readonly handlerDisposition: SettlementWorkingAnimalHandlerDisposition;
}

export interface SettlementWorkingAnimalTaskLifecycleStageResult {
  readonly state: SettlementWorkingAnimalState;
  readonly transaction: SettlementWorkingAnimalTaskTransition | null;
  readonly staged: boolean;
  readonly reusedPendingTransaction: boolean;
}

export interface SettlementWorkingAnimalTaskLifecycleResolution {
  readonly state: SettlementWorkingAnimalState;
  readonly transition: SettlementWorkingAnimalTaskTransition | null;
  readonly applied: boolean;
}

const ROLES = new Set<string>(SETTLEMENT_WORKING_ANIMAL_ROLES);
const ACTIVITIES = new Set<string>(SETTLEMENT_WORKING_ANIMAL_ACTIVITIES);
const TASK_PHASES = new Set<string>(SETTLEMENT_WORKING_ANIMAL_TASK_PHASES);
const TASK_OUTCOMES = new Set<string>(SETTLEMENT_WORKING_ANIMAL_TASK_OUTCOMES);
const TASK_TRANSITIONS = new Set<string>(SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITIONS);
const WELFARE_REFERENCES = new Set<string>([
  "welfare:injury-pressure",
  "welfare:cold-pressure",
  "welfare:heat-pressure",
  "welfare:exhaustion-pressure",
  "welfare:thirst-pressure",
  "welfare:hunger-pressure",
]);

const GUARDIAN_ALARM_CLASSES = new Set<string>([
  "alarm-call",
  "animal-alarm",
  "herd-alarm",
]);

const GUARDIAN_THREAT_CLASSES = new Set<string>([
  "aerial-predator",
  "danger-sound",
  "hostile-human",
  "large-predator",
  "mobbing-pressure",
  "predator",
  "threat",
]);

const WELFARE_PRIORITY = Object.freeze([
  ["injuryPressure", "welfare:injury-pressure"],
  ["coldPressure", "welfare:cold-pressure"],
  ["heatPressure", "welfare:heat-pressure"],
  ["exhaustionPressure", "welfare:exhaustion-pressure"],
  ["thirstPressure", "welfare:thirst-pressure"],
  ["hungerPressure", "welfare:hunger-pressure"],
] as const);

export function createSettlementWorkingAnimalState(
  input: CreateSettlementWorkingAnimalStateInput,
): SettlementWorkingAnimalState {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["assignments", "settlementId"])
    || !positiveSafeInteger(input.settlementId)
    || !Array.isArray(input.assignments)
    || input.assignments.length > SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS
  ) throw new RangeError("Settlement working-animal creation input is malformed");

  const assignments = input.assignments.map((assignment) => (
    createSettlementWorkingAnimalAssignment(input.settlementId, assignment)
  )).sort(compareAssignments);
  const state = canonicalizeSettlementWorkingAnimalState({
    version: SETTLEMENT_WORKING_ANIMALS_VERSION,
    ownerId: SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
    revision: 0,
    settlementId: input.settlementId,
    assignments,
  });
  if (state === null) {
    throw new RangeError("Settlement working-animal assignments collide or are incoherent");
  }
  return state;
}

export function createSettlementWorkingAnimalAssignment(
  settlementId: number,
  input: CreateSettlementWorkingAnimalAssignmentInput,
): SettlementWorkingAnimalAssignment {
  const canonical = canonicalAssignmentCreationInput(settlementId, input);
  if (canonical === null) {
    throw new RangeError("Settlement working-animal assignment input is malformed");
  }
  const assignmentId = assignmentIdentity(canonical);
  const cause = deepFreeze({
    kind: "assignment" as const,
    referenceId: assignmentId,
  });
  const currentActivity = createActivityTransaction({
    assignmentId,
    workerActorId: canonical.workerActorId,
    ordinal: 0,
    activity: "watch",
    acceptedAtTick: canonical.createdAtTick,
    cause,
    perceivedArea: null,
  });
  const assignment = canonicalizeSettlementWorkingAnimalAssignment({
    version: SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
    assignmentOrdinal: canonical.assignmentOrdinal,
    assignmentId,
    settlementId: canonical.settlementId,
    workerActorId: canonical.workerActorId,
    workerSpecies: canonical.workerSpecies,
    handlerActorId: canonical.handlerActorId,
    workerCustodyRelationshipId: canonical.workerCustodyRelationshipId,
    protectedCustodyRelationshipId: canonical.protectedCustodyRelationshipId,
    protectedGroupId: canonical.protectedGroupId,
    role: canonical.role,
    worksiteId: canonical.worksiteId,
    dutyArea: canonical.dutyArea,
    createdAtTick: canonical.createdAtTick,
    currentActivity,
    lastResolvedActivityOrdinal: 0,
    pendingActivity: null,
    lastTaskOrdinal: 0,
    lastResolvedTaskTransitionOrdinal: 0,
    currentTask: null,
    lastTaskOutcome: null,
    pendingTaskTransition: null,
  });
  if (assignment === null) throw new Error("Derived working-animal assignment failed validation");
  return assignment;
}

/** Byte-identical authenticated worksite geometry for movement and arrival. */
export function settlementWorkingAnimalReturnArea(
  assignmentValue: unknown,
): ObservedArea | null {
  const assignment = canonicalizeSettlementWorkingAnimalAssignment(assignmentValue);
  return assignment === null ? null : returnAreaFromCanonicalAssignment(assignment);
}

export function createSettlementWorkingAnimalHandlerSearchReport(
  inputValue: CreateSettlementWorkingAnimalHandlerSearchReportInput,
): SettlementWorkingAnimalHandlerSearchReport | null {
  if (
    !plainRecord(inputValue)
    || !exactKeys(inputValue, [
      "assignmentId",
      "handlerActorId",
      "knownArea",
      "knownAtTick",
      "sourceReferenceId",
    ])
  ) return null;
  const knownArea = canonicalArea(inputValue.knownArea, 10_000_000);
  if (
    !validId(inputValue.assignmentId)
    || !livingSpeciesActorIdMatchesNamespace(inputValue.handlerActorId, "human")
    || !nonnegativeSafeInteger(inputValue.knownAtTick)
    || !validId(inputValue.sourceReferenceId)
    || knownArea === null
  ) return null;
  const fields = {
    assignmentId: inputValue.assignmentId,
    handlerActorId: inputValue.handlerActorId,
    knownAtTick: inputValue.knownAtTick,
    sourceReferenceId: inputValue.sourceReferenceId,
    knownArea,
  } as const;
  return canonicalHandlerSearchReport({
    version: SETTLEMENT_WORKING_ANIMAL_HANDLER_SEARCH_REPORT_VERSION,
    reportId: handlerSearchReportId(fields),
    ...fields,
  });
}

/**
 * Derive the single authoritative probe for a committed or staged
 * investigation. The activity must be an exact member of the assignment; a
 * caller cannot submit a merely well-shaped foreign or invented transaction.
 */
export function deriveSettlementWorkingAnimalTaskSearchProbe(
  assignmentValue: unknown,
  activityValue: unknown,
): LivingActorSearchProbe | null {
  const assignment = canonicalizeSettlementWorkingAnimalAssignment(assignmentValue);
  if (assignment === null) return null;
  const activity = canonicalActivityTransaction(activityValue, assignment);
  if (
    activity === null
    || activity.activity !== "investigate"
    || (activity.cause.kind !== "perception" && activity.cause.kind !== "handler-report")
    || activity.perceivedArea === null
    || !(
      stableStringify(activity) === stableStringify(assignment.currentActivity)
      || stableStringify(activity) === stableStringify(assignment.pendingActivity)
    )
  ) return null;
  return deriveLivingActorSearchProbe({
    requestId: activity.transactionId,
    beliefKey: opaqueTaskBeliefKey(activity),
    probeOrdinal: 0,
    sourceArea: activity.perceivedArea,
  });
}

/** Strict state boundary with deterministic assignment ordering. */
export function canonicalizeSettlementWorkingAnimalState(
  value: unknown,
): SettlementWorkingAnimalState | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["assignments", "ownerId", "revision", "settlementId", "version"])
    || value.version !== SETTLEMENT_WORKING_ANIMALS_VERSION
    || value.ownerId !== SETTLEMENT_WORKING_ANIMALS_OWNER_ID
    || !nonnegativeSafeInteger(value.revision)
    || !positiveSafeInteger(value.settlementId)
    || !Array.isArray(value.assignments)
    || value.assignments.length > SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS
  ) return null;

  const assignments: SettlementWorkingAnimalAssignment[] = [];
  const ordinals = new Set<number>();
  const assignmentIds = new Set<string>();
  const workerActorIds = new Set<string>();
  const workerCustodies = new Set<string>();
  const activityTransactionIds = new Set<string>();
  const taskIds = new Set<string>();
  const taskTransitionIds = new Set<string>();

  for (const raw of value.assignments) {
    const assignment = canonicalizeSettlementWorkingAnimalAssignment(raw);
    if (
      assignment === null
      || assignment.settlementId !== value.settlementId
      || ordinals.has(assignment.assignmentOrdinal)
      || assignmentIds.has(assignment.assignmentId)
      || workerActorIds.has(assignment.workerActorId)
      || workerCustodies.has(assignment.workerCustodyRelationshipId)
      || activityTransactionIds.has(assignment.currentActivity.transactionId)
      || (
        assignment.pendingActivity !== null
        && activityTransactionIds.has(assignment.pendingActivity.transactionId)
      )
      || (
        assignment.currentTask !== null
        && taskIds.has(assignment.currentTask.taskId)
      )
      || (
        assignment.lastTaskOutcome !== null
        && taskIds.has(assignment.lastTaskOutcome.taskId)
      )
      || (
        assignment.pendingTaskTransition !== null
        && taskTransitionIds.has(assignment.pendingTaskTransition.transactionId)
      )
    ) return null;
    ordinals.add(assignment.assignmentOrdinal);
    assignmentIds.add(assignment.assignmentId);
    workerActorIds.add(assignment.workerActorId);
    workerCustodies.add(assignment.workerCustodyRelationshipId);
    activityTransactionIds.add(assignment.currentActivity.transactionId);
    if (assignment.pendingActivity !== null) {
      activityTransactionIds.add(assignment.pendingActivity.transactionId);
    }
    if (assignment.currentTask !== null) taskIds.add(assignment.currentTask.taskId);
    if (assignment.lastTaskOutcome !== null) taskIds.add(assignment.lastTaskOutcome.taskId);
    if (assignment.pendingTaskTransition !== null) {
      taskTransitionIds.add(assignment.pendingTaskTransition.transactionId);
    }
    assignments.push(assignment);
  }
  assignments.sort(compareAssignments);

  let expectedRevision = 0;
  for (const assignment of assignments) {
    expectedRevision += assignment.lastResolvedActivityOrdinal * 2;
    if (assignment.pendingActivity !== null) expectedRevision += 1;
    expectedRevision += assignment.lastResolvedTaskTransitionOrdinal * 2;
    if (assignment.pendingTaskTransition !== null) expectedRevision += 1;
    if (!Number.isSafeInteger(expectedRevision)) return null;
  }
  if (value.revision !== expectedRevision) return null;

  const canonical = deepFreeze({
    version: SETTLEMENT_WORKING_ANIMALS_VERSION,
    ownerId: SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
    revision: value.revision,
    settlementId: value.settlementId,
    assignments,
  });
  // The canonical domain is closed over the persisted byte budget. A value
  // accepted here must never become unserializable merely because several
  // individually lawful bounded records compose in the same root.
  return UTF8_ENCODER.encode(stableStringify(canonical)).byteLength
    <= SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES
    ? canonical
    : null;
}

export function canonicalizeSettlementWorkingAnimalAssignment(
  value: unknown,
): SettlementWorkingAnimalAssignment | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "assignmentId",
      "assignmentOrdinal",
      "createdAtTick",
      "currentActivity",
      "dutyArea",
      "handlerActorId",
      "lastResolvedActivityOrdinal",
      "lastResolvedTaskTransitionOrdinal",
      "lastTaskOrdinal",
      "lastTaskOutcome",
      "pendingActivity",
      "pendingTaskTransition",
      "protectedCustodyRelationshipId",
      "protectedGroupId",
      "role",
      "settlementId",
      "workerActorId",
      "workerCustodyRelationshipId",
      "workerSpecies",
      "worksiteId",
      "currentTask",
      "version",
    ])
    || value.version !== SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION
    || !nonnegativeSafeInteger(value.assignmentOrdinal)
    || !positiveSafeInteger(value.settlementId)
    || !validId(value.assignmentId)
    || !isLivingActorSpecies(value.workerSpecies)
    || value.workerSpecies === "human"
    || !isLivingSpeciesActorAddressable(value.workerSpecies)
    || typeof value.workerActorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(value.workerActorId, value.workerSpecies)
    || typeof value.handlerActorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(value.handlerActorId, "human")
    || !validCustodyRelationshipId(value.workerCustodyRelationshipId)
    || !validCustodyRelationshipId(value.protectedCustodyRelationshipId)
    || value.workerCustodyRelationshipId === value.protectedCustodyRelationshipId
    || !validId(value.protectedGroupId)
    || !ROLES.has(value.role as string)
    || !validId(value.worksiteId)
    || !nonnegativeSafeInteger(value.createdAtTick)
    || !nonnegativeSafeInteger(value.lastResolvedActivityOrdinal)
    || value.lastResolvedActivityOrdinal > SETTLEMENT_WORKING_ANIMAL_MAX_ACTIVITY_ORDINAL
    || !nonnegativeSafeInteger(value.lastTaskOrdinal)
    || value.lastTaskOrdinal > SETTLEMENT_WORKING_ANIMAL_MAX_TASK_ORDINAL
    || !nonnegativeSafeInteger(value.lastResolvedTaskTransitionOrdinal)
    || value.lastResolvedTaskTransitionOrdinal
      > SETTLEMENT_WORKING_ANIMAL_MAX_TASK_TRANSITION_ORDINAL
  ) return null;
  const dutyArea = canonicalArea(value.dutyArea, SETTLEMENT_WORKING_ANIMAL_MAX_DUTY_RADIUS_UNITS);
  if (dutyArea === null || dutyArea.radiusUnits === 0) return null;

  const identityInput: CanonicalAssignmentCreationInput = {
    settlementId: value.settlementId,
    assignmentOrdinal: value.assignmentOrdinal,
    workerActorId: value.workerActorId,
    workerSpecies: value.workerSpecies as Exclude<LivingActorSpecies, "human">,
    handlerActorId: value.handlerActorId,
    workerCustodyRelationshipId: value.workerCustodyRelationshipId,
    protectedCustodyRelationshipId: value.protectedCustodyRelationshipId,
    protectedGroupId: value.protectedGroupId,
    role: value.role as SettlementWorkingAnimalRole,
    worksiteId: value.worksiteId,
    dutyArea,
    createdAtTick: value.createdAtTick,
  };
  const expectedAssignmentId = assignmentIdentity(identityInput);
  if (value.assignmentId !== expectedAssignmentId) return null;

  const assignmentIdentityView = {
    assignmentId: value.assignmentId,
    workerActorId: value.workerActorId,
    createdAtTick: value.createdAtTick,
  };
  const currentActivity = canonicalActivityTransaction(value.currentActivity, assignmentIdentityView);
  const pendingActivity = value.pendingActivity === null
    ? null
    : canonicalActivityTransaction(value.pendingActivity, assignmentIdentityView);
  const currentTask = value.currentTask === null
    ? null
    : canonicalWorkingAnimalTask(value.currentTask, {
        ...assignmentIdentityView,
        handlerActorId: value.handlerActorId,
        worksiteId: value.worksiteId,
      });
  const lastTaskOutcome = value.lastTaskOutcome === null
    ? null
    : canonicalWorkingAnimalTaskOutcome(value.lastTaskOutcome, {
        ...assignmentIdentityView,
        handlerActorId: value.handlerActorId,
        worksiteId: value.worksiteId,
      });
  const pendingTaskTransition = value.pendingTaskTransition === null
    ? null
    : canonicalWorkingAnimalTaskTransition(value.pendingTaskTransition, {
        ...assignmentIdentityView,
        handlerActorId: value.handlerActorId,
      });
  if (
    currentActivity === null
    || (value.pendingActivity !== null && pendingActivity === null)
    || (value.currentTask !== null && currentTask === null)
    || (value.lastTaskOutcome !== null && lastTaskOutcome === null)
    || (value.pendingTaskTransition !== null && pendingTaskTransition === null)
    || currentActivity.ordinal !== value.lastResolvedActivityOrdinal
    || currentActivity.acceptedAtTick < value.createdAtTick
    || currentActivity.ordinal > currentActivity.acceptedAtTick - value.createdAtTick
    || (
      currentActivity.ordinal === 0
      && (
        currentActivity.activity !== "watch"
        || currentActivity.acceptedAtTick !== value.createdAtTick
        || currentActivity.cause.kind !== "assignment"
        || currentActivity.cause.referenceId !== value.assignmentId
        || currentActivity.perceivedArea !== null
      )
    )
    || (
      pendingActivity !== null
      && (
        pendingActivity.ordinal !== currentActivity.ordinal + 1
        || pendingActivity.acceptedAtTick <= currentActivity.acceptedAtTick
        || pendingActivity.ordinal > pendingActivity.acceptedAtTick - value.createdAtTick
      )
    )
    || !taskStateIsCoherent({
      assignmentId: value.assignmentId,
      workerActorId: value.workerActorId,
      handlerActorId: value.handlerActorId,
      worksiteId: value.worksiteId,
      createdAtTick: value.createdAtTick,
      currentActivity,
      lastTaskOrdinal: value.lastTaskOrdinal,
      lastResolvedTaskTransitionOrdinal: value.lastResolvedTaskTransitionOrdinal,
      currentTask,
      lastTaskOutcome,
      pendingTaskTransition,
    })
  ) return null;

  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
    assignmentOrdinal: value.assignmentOrdinal,
    assignmentId: value.assignmentId,
    settlementId: value.settlementId,
    workerActorId: value.workerActorId,
    workerSpecies: value.workerSpecies as Exclude<LivingActorSpecies, "human">,
    handlerActorId: value.handlerActorId,
    workerCustodyRelationshipId: value.workerCustodyRelationshipId,
    protectedCustodyRelationshipId: value.protectedCustodyRelationshipId,
    protectedGroupId: value.protectedGroupId,
    role: value.role as SettlementWorkingAnimalRole,
    worksiteId: value.worksiteId,
    dutyArea,
    createdAtTick: value.createdAtTick,
    currentActivity,
    lastResolvedActivityOrdinal: value.lastResolvedActivityOrdinal,
    pendingActivity,
    lastTaskOrdinal: value.lastTaskOrdinal,
    lastResolvedTaskTransitionOrdinal: value.lastResolvedTaskTransitionOrdinal,
    currentTask,
    lastTaskOutcome,
    pendingTaskTransition,
  });
}

/**
 * One-way additive adoption from the sealed Alpha-26 relationship root. It
 * preserves every assignment/activity byte and appends an empty task lifecycle;
 * calling it on an already-current value is idempotent.
 */
export function adoptSettlementWorkingAnimalStateV1(
  value: unknown,
): SettlementWorkingAnimalState | null {
  const current = canonicalizeSettlementWorkingAnimalState(value);
  if (current !== null) return current;
  const prior = canonicalizePriorSettlementWorkingAnimalState(value);
  if (prior === null) return null;
  return canonicalizeSettlementWorkingAnimalState({
    version: SETTLEMENT_WORKING_ANIMALS_VERSION,
    ownerId: SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
    revision: prior.revision,
    settlementId: prior.settlementId,
    assignments: prior.assignments.map((assignment) => ({
      ...assignment,
      version: SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
      lastTaskOrdinal: 0,
      lastResolvedTaskTransitionOrdinal: 0,
      currentTask: null,
      lastTaskOutcome: null,
      pendingTaskTransition: null,
    })),
  });
}

export function serializeSettlementWorkingAnimalState(value: unknown): string {
  const state = canonicalizeSettlementWorkingAnimalState(value);
  if (state === null) throw new RangeError("Cannot serialize malformed working-animal state");
  const encoded = stableStringify(state);
  if (UTF8_ENCODER.encode(encoded).byteLength > SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Settlement working-animal state exceeds its save budget");
  }
  return encoded;
}

export function deserializeSettlementWorkingAnimalState(
  text: unknown,
): SettlementWorkingAnimalState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeSettlementWorkingAnimalState(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

/**
 * Shared work arbiter. Guardian is a role policy over generic cognition and
 * welfare; it does not inspect a species profile, hidden actor state, or a
 * bespoke animal-pair table.
 */
export function decideSettlementWorkingAnimalActivity(
  input: SettlementWorkingAnimalActivityDecisionInput,
): SettlementWorkingAnimalActivityDecision | null {
  const canonical = canonicalDecisionInput(input);
  if (canonical === null) return null;
  const {
    assignment,
    tick,
    perception,
    welfare,
    accessibility,
    actorDisposition,
    workerInsideDutyArea,
  } = canonical;

  if (actorDisposition.kind === "defer-to-actor") {
    return createDecision(assignment, tick, "defer-to-actor", {
      kind: "actor-disposition",
      referenceId: actorDisposition.referenceId,
    }, null);
  }

  const welfareCause = strongestWelfareCause(welfare);
  if (welfareCause !== null) {
    return createDecision(assignment, tick, "survival-override", {
      kind: "welfare",
      referenceId: welfareCause,
    }, null);
  }

  // An accepted task owns its lifecycle even after the originating belief
  // fades. Actor cognition and welfare above can suspend it, but a new signal
  // cannot replace it or reveal a new target.
  if (assignment.currentTask?.phase === "investigating") {
    const sourceKind = HANDLER_SEARCH_REPORT_PATTERN.test(
      assignment.currentTask.sourceObservationId,
    ) ? "handler-report" as const : "perception" as const;
    return createDecision(assignment, tick, "investigate", {
      kind: sourceKind,
      referenceId: assignment.currentTask.sourceObservationId,
    }, assignment.currentTask.perceivedArea);
  }
  if (assignment.currentTask?.phase === "returning") {
    return createDecision(assignment, tick, "return", {
      kind: "assignment",
      referenceId: assignment.assignmentId,
    }, null);
  }
  if (assignment.currentTask?.phase === "awaiting-handler") {
    // The task result already exists, but acknowledgement still requires the
    // animal to be physically back at its narrow work station. Welfare or
    // autonomous retreat may move it away while the keeper is absent; once
    // that higher-priority need clears, resume the ordinary return verb.
    const activity = !workerInsideDutyArea && accessibility.return
      ? "return"
      : "watch";
    return createDecision(assignment, tick, activity, {
      kind: "assignment",
      referenceId: assignment.assignmentId,
    }, null);
  }

  const signal = strongestRelevantWorkSignal(assignment, perception);
  if (signal !== null && accessibility.investigate) {
    return createDecision(assignment, tick, "investigate", {
      kind: "perception",
      referenceId: signal.sourceObservationId,
    }, signal.area);
  }

  if (!workerInsideDutyArea && accessibility.return) {
    return createDecision(assignment, tick, "return", {
      kind: "assignment",
      referenceId: assignment.assignmentId,
    }, null);
  }
  if (accessibility.watch) {
    return createDecision(assignment, tick, "watch", {
      kind: "assignment",
      referenceId: assignment.assignmentId,
    }, null);
  }
  if (accessibility.return) {
    return createDecision(assignment, tick, "return", {
      kind: "assignment",
      referenceId: assignment.assignmentId,
    }, null);
  }
  return null;
}

/**
 * Re-evaluates cognition inside the owner before staging. A caller cannot pass
 * an invented decision or hidden target directly into persisted state.
 */
export function stageSettlementWorkingAnimalActivity(
  stateValue: unknown,
  evaluationValue: unknown,
): SettlementWorkingAnimalActivityStageResult | null {
  const state = canonicalizeSettlementWorkingAnimalState(stateValue);
  const evaluation = canonicalEvaluationInput(evaluationValue);
  if (state === null || evaluation === null) return null;
  const assignment = state.assignments.find(({ assignmentId }) => (
    assignmentId === evaluation.assignmentId
  ));
  if (assignment === undefined) return null;
  const decision = decideSettlementWorkingAnimalActivity({
    assignment,
    tick: evaluation.tick,
    perception: evaluation.perception,
    welfare: evaluation.welfare,
    accessibility: evaluation.accessibility,
    actorDisposition: evaluation.actorDisposition,
    workerInsideDutyArea: evaluation.workerInsideDutyArea,
  });
  if (decision === null) return null;

  if (assignment.pendingActivity !== null) {
    return deepFreeze({
      state,
      decision: decisionFromTransaction(assignment.pendingActivity),
      transaction: assignment.pendingActivity,
      staged: false,
      reusedPendingTransaction: true,
    });
  }
  if (decision.decidedAtTick < assignment.currentActivity.acceptedAtTick) return null;
  if (sameAcceptedActivity(assignment.currentActivity, decision)) {
    return deepFreeze({
      state,
      decision,
      transaction: null,
      staged: false,
      reusedPendingTransaction: false,
    });
  }
  // One accepted transition per actor tick prevents same-tick transaction churn.
  if (decision.decidedAtTick === assignment.currentActivity.acceptedAtTick) return null;
  if (
    assignment.lastResolvedActivityOrdinal
      >= SETTLEMENT_WORKING_ANIMAL_MAX_ACTIVITY_ORDINAL
  ) return null;

  const transaction = createActivityTransaction({
    assignmentId: assignment.assignmentId,
    workerActorId: assignment.workerActorId,
    ordinal: assignment.lastResolvedActivityOrdinal + 1,
    activity: decision.activity,
    acceptedAtTick: decision.decidedAtTick,
    cause: decision.cause,
    perceivedArea: decision.perceivedArea,
  });
  const nextAssignment = deepFreeze({
    ...assignment,
    pendingActivity: transaction,
  });
  const nextState = rebuildState(state, nextAssignment, state.revision + 1);
  return nextState === null ? null : deepFreeze({
    state: nextState,
    decision,
    transaction,
    staged: true,
    reusedPendingTransaction: false,
  });
}

/**
 * Stages a bounded investigation from the handler's explicit report. This is
 * separate from sensory arbitration: the report never enters cognition as a
 * fabricated alarm or threat, and actor welfare/disposition retain priority.
 */
export function stageSettlementWorkingAnimalSearchFromHandlerReport(
  stateValue: unknown,
  evaluationValue: SettlementWorkingAnimalHandlerSearchEvaluationInput,
): SettlementWorkingAnimalActivityStageResult | null {
  const state = canonicalizeSettlementWorkingAnimalState(stateValue);
  const evaluation = canonicalHandlerSearchEvaluation(evaluationValue);
  if (state === null || evaluation === null) return null;
  const assignment = state.assignments.find(({ assignmentId }) => (
    assignmentId === evaluation.report.assignmentId
  ));
  if (
    assignment === undefined
    || assignment.role !== "guardian"
    || assignment.handlerActorId !== evaluation.report.handlerActorId
    || evaluation.tick < evaluation.report.knownAtTick
    || assignment.currentTask !== null
    || assignment.lastTaskOutcome?.sourceObservationId === evaluation.report.reportId
    || evaluation.actorDisposition.kind !== "available"
    || strongestWelfareCause(evaluation.welfare) !== null
    || !evaluation.accessibility.investigate
    || !evaluation.workerInsideDutyArea
    || !areasIntersect(assignment.dutyArea, evaluation.report.knownArea)
  ) return null;

  const decision = createDecision(assignment, evaluation.tick, "investigate", {
    kind: "handler-report",
    referenceId: evaluation.report.reportId,
  }, evaluation.report.knownArea);
  if (assignment.pendingActivity !== null) {
    if (
      decision.decidedAtTick <= assignment.currentActivity.acceptedAtTick
      || assignment.lastResolvedActivityOrdinal
        >= SETTLEMENT_WORKING_ANIMAL_MAX_ACTIVITY_ORDINAL
    ) return null;
    const pendingCandidate = createActivityTransaction({
      assignmentId: assignment.assignmentId,
      workerActorId: assignment.workerActorId,
      ordinal: assignment.lastResolvedActivityOrdinal + 1,
      activity: decision.activity,
      acceptedAtTick: decision.decidedAtTick,
      cause: decision.cause,
      perceivedArea: decision.perceivedArea,
    });
    return stableStringify(assignment.pendingActivity) === stableStringify(pendingCandidate)
      ? deepFreeze({
          state,
          decision: decisionFromTransaction(assignment.pendingActivity),
          transaction: assignment.pendingActivity,
          staged: false,
          reusedPendingTransaction: true,
        })
      : null;
  }
  if (sameAcceptedActivity(assignment.currentActivity, decision)) {
    return deepFreeze({
      state,
      decision,
      transaction: null,
      staged: false,
      reusedPendingTransaction: false,
    });
  }
  if (
    decision.decidedAtTick <= assignment.currentActivity.acceptedAtTick
    || assignment.lastResolvedActivityOrdinal
      >= SETTLEMENT_WORKING_ANIMAL_MAX_ACTIVITY_ORDINAL
  ) return null;

  const transaction = createActivityTransaction({
    assignmentId: assignment.assignmentId,
    workerActorId: assignment.workerActorId,
    ordinal: assignment.lastResolvedActivityOrdinal + 1,
    activity: decision.activity,
    acceptedAtTick: decision.decidedAtTick,
    cause: decision.cause,
    perceivedArea: decision.perceivedArea,
  });
  const nextAssignment = deepFreeze({ ...assignment, pendingActivity: transaction });
  const nextState = rebuildState(state, nextAssignment, state.revision + 1);
  return nextState === null ? null : deepFreeze({
    state: nextState,
    decision,
    transaction,
    staged: true,
    reusedPendingTransaction: false,
  });
}

/** Commit is exact-once; replaying the latest committed transaction is inert. */
export function resolveSettlementWorkingAnimalActivity(
  stateValue: unknown,
  transactionValue: unknown,
): SettlementWorkingAnimalActivityResolution | null {
  const state = canonicalizeSettlementWorkingAnimalState(stateValue);
  if (state === null || !plainRecord(transactionValue) || !validId(transactionValue.assignmentId)) {
    return null;
  }
  const assignment = state.assignments.find(({ assignmentId }) => (
    assignmentId === transactionValue.assignmentId
  ));
  if (assignment === undefined) return null;
  const transaction = canonicalActivityTransaction(transactionValue, assignment);
  if (transaction === null) return null;

  if (assignment.pendingActivity === null) {
    return stableStringify(transaction) === stableStringify(assignment.currentActivity)
      ? deepFreeze({ state, activity: assignment.currentActivity, applied: false })
      : null;
  }
  if (stableStringify(transaction) !== stableStringify(assignment.pendingActivity)) return null;

  const nextAssignment = deepFreeze({
    ...assignment,
    currentActivity: transaction,
    lastResolvedActivityOrdinal: transaction.ordinal,
    pendingActivity: null,
  });
  const nextState = rebuildState(state, nextAssignment, state.revision + 1);
  return nextState === null ? null : deepFreeze({
    state: nextState,
    activity: transaction,
    applied: true,
  });
}

/** Resume one saved in-flight acceptance without rerunning perception or RNG. */
export function recoverPendingSettlementWorkingAnimalActivity(
  stateValue: unknown,
  assignmentId: unknown,
): SettlementWorkingAnimalActivityResolution | null {
  const state = canonicalizeSettlementWorkingAnimalState(stateValue);
  if (state === null || !validId(assignmentId)) return null;
  const assignment = state.assignments.find((candidate) => (
    candidate.assignmentId === assignmentId
  ));
  if (assignment === undefined) return null;
  return assignment.pendingActivity === null
    ? deepFreeze({ state, activity: assignment.currentActivity, applied: false })
    : resolveSettlementWorkingAnimalActivity(state, assignment.pendingActivity);
}

/**
 * Stage one lifecycle change from current physical/cognitive evidence. Callers
 * provide actor-owned positions and cognition, never completion/cancellation
 * booleans. A saved pending transaction always wins over re-evaluation.
 */
export function stageSettlementWorkingAnimalTaskLifecycle(
  stateValue: unknown,
  evaluationValue: unknown,
): SettlementWorkingAnimalTaskLifecycleStageResult | null {
  const state = canonicalizeSettlementWorkingAnimalState(stateValue);
  const evaluation = canonicalTaskLifecycleEvaluation(evaluationValue);
  if (state === null || evaluation === null) return null;
  const assignment = state.assignments.find(({ assignmentId }) => (
    assignmentId === evaluation.assignmentId
  ));
  if (
    assignment === undefined
    || evaluation.workerPerception.actorId !== assignment.workerActorId
    || evaluation.handlerPerception.actorId !== assignment.handlerActorId
  ) return null;

  if (assignment.pendingTaskTransition !== null) {
    return deepFreeze({
      state,
      transaction: assignment.pendingTaskTransition,
      staged: false,
      reusedPendingTransaction: true,
    });
  }
  const transaction = deriveTaskLifecycleTransition(assignment, evaluation);
  if (transaction === null) {
    return deepFreeze({
      state,
      transaction: null,
      staged: false,
      reusedPendingTransaction: false,
    });
  }
  if (
    assignment.lastResolvedTaskTransitionOrdinal
      >= SETTLEMENT_WORKING_ANIMAL_MAX_TASK_TRANSITION_ORDINAL
  ) return null;
  const nextAssignment = deepFreeze({
    ...assignment,
    pendingTaskTransition: transaction,
  });
  const nextState = rebuildState(state, nextAssignment, state.revision + 1);
  return nextState === null ? null : deepFreeze({
    state: nextState,
    transaction,
    staged: true,
    reusedPendingTransaction: false,
  });
}

/** Commit is exact-once; replay of the latest applied task transition is inert. */
export function resolveSettlementWorkingAnimalTaskLifecycle(
  stateValue: unknown,
  transactionValue: unknown,
): SettlementWorkingAnimalTaskLifecycleResolution | null {
  const state = canonicalizeSettlementWorkingAnimalState(stateValue);
  if (state === null || !plainRecord(transactionValue) || !validId(transactionValue.assignmentId)) {
    return null;
  }
  const assignment = state.assignments.find(({ assignmentId }) => (
    assignmentId === transactionValue.assignmentId
  ));
  if (assignment === undefined) return null;
  const transaction = canonicalWorkingAnimalTaskTransition(transactionValue, assignment);
  if (transaction === null) return null;

  if (assignment.pendingTaskTransition === null) {
    const latestTransitionId = assignment.currentTask?.lastTransition.transactionId
      ?? assignment.lastTaskOutcome?.lastTransition.transactionId
      ?? null;
    return latestTransitionId === transaction.transactionId
      ? deepFreeze({ state, transition: transaction, applied: false })
      : null;
  }
  if (
    stableStringify(transaction)
      !== stableStringify(assignment.pendingTaskTransition)
  ) return null;

  const applied = applyTaskLifecycleTransition(assignment, transaction);
  if (applied === null) return null;
  const nextAssignment = deepFreeze({
    ...assignment,
    ...applied,
    lastResolvedTaskTransitionOrdinal: transaction.ordinal,
    pendingTaskTransition: null,
  });
  const nextState = rebuildState(state, nextAssignment, state.revision + 1);
  return nextState === null ? null : deepFreeze({
    state: nextState,
    transition: transaction,
    applied: true,
  });
}

/** Resume one saved task transition without rerunning sight, geometry, or RNG. */
export function recoverPendingSettlementWorkingAnimalTaskLifecycle(
  stateValue: unknown,
  assignmentId: unknown,
): SettlementWorkingAnimalTaskLifecycleResolution | null {
  const state = canonicalizeSettlementWorkingAnimalState(stateValue);
  if (state === null || !validId(assignmentId)) return null;
  const assignment = state.assignments.find((candidate) => (
    candidate.assignmentId === assignmentId
  ));
  if (assignment === undefined) return null;
  return assignment.pendingTaskTransition === null
    ? deepFreeze({ state, transition: null, applied: false })
    : resolveSettlementWorkingAnimalTaskLifecycle(state, assignment.pendingTaskTransition);
}

function deriveTaskLifecycleTransition(
  assignment: SettlementWorkingAnimalAssignment,
  evaluation: SettlementWorkingAnimalTaskLifecycleEvaluationInput,
): SettlementWorkingAnimalTaskTransition | null {
  if (
    evaluation.tick < assignment.createdAtTick
    || evaluation.tick < assignment.currentActivity.acceptedAtTick
  ) return null;
  const task = assignment.currentTask;
  const suspension = currentTaskSuspension(evaluation);

  if (task === null) {
    const activity = assignment.currentActivity;
    if (
      assignment.pendingActivity !== null
      || activity.activity !== "investigate"
      || (activity.cause.kind !== "perception" && activity.cause.kind !== "handler-report")
      || activity.perceivedArea === null
      || assignment.lastTaskOrdinal >= SETTLEMENT_WORKING_ANIMAL_MAX_TASK_ORDINAL
      || assignment.lastTaskOutcome?.sourceActivityTransactionId === activity.transactionId
    ) return null;
    let sourceReferenceId = activity.cause.referenceId;
    if (activity.cause.kind === "perception") {
      const sourceBelief = freshestMatchingSourceBelief(
        evaluation.workerPerception,
        activity.cause.referenceId,
        activity.perceivedArea,
      );
      if (sourceBelief === null) return null;
      sourceReferenceId = sourceBelief.sourceObservationId;
    }
    const taskOrdinal = assignment.lastTaskOrdinal + 1;
    const taskId = workingAnimalTaskId(
      assignment.assignmentId,
      taskOrdinal,
      activity.transactionId,
      activity.cause.referenceId,
    );
    const searchProbe = deriveSettlementWorkingAnimalTaskSearchProbe(
      assignment,
      activity,
    );
    if (searchProbe === null) return null;
    return createTaskTransition({
      assignment,
      taskId,
      taskOrdinal,
      transition: "open",
      acceptedAtTick: evaluation.tick,
      cause: {
        kind: "activity",
        referenceId: activity.transactionId,
      },
      sourceActivityTransactionId: activity.transactionId,
      sourceObservationId: sourceReferenceId,
      perceivedArea: activity.perceivedArea,
      searchProbe,
      suspension,
    });
  }

  // Each task transition is physically ordered. Actor/welfare precedence may
  // suspend or change suspension, but can never synthesize a terminal result.
  if (evaluation.tick <= task.lastTransition.acceptedAtTick) return null;
  if (task.phase !== "awaiting-handler") {
    if (suspension !== null) {
      if (stableStringify(suspension) === stableStringify(task.suspension)) return null;
      return createTaskTransition({
        assignment,
        taskId: task.taskId,
        taskOrdinal: task.taskOrdinal,
        transition: "suspend",
        acceptedAtTick: evaluation.tick,
        cause: suspension,
        sourceActivityTransactionId: null,
        sourceObservationId: null,
        perceivedArea: null,
        searchProbe: null,
        suspension,
      });
    }
    if (task.suspension !== null) {
      return createTaskTransition({
        assignment,
        taskId: task.taskId,
        taskOrdinal: task.taskOrdinal,
        transition: "resume",
        acceptedAtTick: evaluation.tick,
        cause: { kind: "assignment", referenceId: assignment.assignmentId },
        sourceActivityTransactionId: null,
        sourceObservationId: null,
        perceivedArea: null,
        searchProbe: null,
        suspension: null,
      });
    }
  }

  if (task.phase === "investigating") {
    if (positionsEqual(evaluation.workerPosition, task.searchProbe.probeArea.center)) {
      return createTaskTransition({
        assignment,
        taskId: task.taskId,
        taskOrdinal: task.taskOrdinal,
        transition: "complete",
        acceptedAtTick: evaluation.tick,
        cause: { kind: "probe", referenceId: task.searchProbe.id },
        sourceActivityTransactionId: null,
        sourceObservationId: null,
        perceivedArea: null,
        searchProbe: null,
        suspension: null,
      });
    }
    if (evaluation.handlerDisposition.kind === "recall") {
      const workerSight = freshIdentifiedVisualBelief(
        evaluation.workerPerception,
        assignment.handlerActorId,
        evaluation.handlerPosition,
        evaluation.tick,
      );
      const handlerSight = freshIdentifiedVisualBelief(
        evaluation.handlerPerception,
        assignment.workerActorId,
        evaluation.workerPosition,
        evaluation.tick,
      );
      if (workerSight !== null && handlerSight !== null) {
        return createTaskTransition({
          assignment,
          taskId: task.taskId,
          taskOrdinal: task.taskOrdinal,
          transition: "cancel",
          acceptedAtTick: evaluation.tick,
          cause: {
            kind: "handler-recall",
            referenceId: evaluation.handlerDisposition.referenceId,
            workerObservationId: workerSight.sourceObservationId,
            handlerObservationId: handlerSight.sourceObservationId,
          },
          sourceActivityTransactionId: null,
          sourceObservationId: null,
          perceivedArea: null,
          searchProbe: null,
          suspension: null,
        });
      }
    }
    return null;
  }

  const returnArea = returnAreaFromCanonicalAssignment(assignment);
  if (task.phase === "returning") {
    return positionInsideArea(evaluation.workerPosition, returnArea)
      ? createTaskTransition({
          assignment,
          taskId: task.taskId,
          taskOrdinal: task.taskOrdinal,
          transition: "arrive",
          acceptedAtTick: evaluation.tick,
          cause: { kind: "worksite", referenceId: assignment.worksiteId },
          sourceActivityTransactionId: null,
          sourceObservationId: null,
          perceivedArea: null,
          searchProbe: null,
          suspension: null,
        })
      : null;
  }

  if (!positionInsideArea(evaluation.workerPosition, returnArea)) return null;
  const handlerSight = freshIdentifiedVisualBelief(
    evaluation.handlerPerception,
    assignment.workerActorId,
    evaluation.workerPosition,
    evaluation.tick,
  );
  return handlerSight === null
    ? null
    : createTaskTransition({
        assignment,
        taskId: task.taskId,
        taskOrdinal: task.taskOrdinal,
        transition: "acknowledge",
        acceptedAtTick: evaluation.tick,
        cause: {
          kind: "handler-acknowledgement",
          referenceId: handlerSight.sourceObservationId,
        },
        sourceActivityTransactionId: null,
        sourceObservationId: null,
        perceivedArea: null,
        searchProbe: null,
        suspension: null,
      });
}

function currentTaskSuspension(
  evaluation: Pick<
    SettlementWorkingAnimalTaskLifecycleEvaluationInput,
    "actorDisposition" | "welfare"
  >,
): SettlementWorkingAnimalTaskSuspension | null {
  if (evaluation.actorDisposition.kind === "defer-to-actor") {
    return deepFreeze({
      kind: "actor-disposition" as const,
      referenceId: evaluation.actorDisposition.referenceId,
    });
  }
  const welfare = strongestWelfareCause(evaluation.welfare);
  return welfare === null
    ? null
    : deepFreeze({ kind: "welfare" as const, referenceId: welfare });
}

function freshestMatchingSourceBelief(
  perception: ActorPerceptionState,
  sourceObservationId: string,
  perceivedArea: ObservedArea,
): AgedActorBelief | null {
  const candidates = perception.beliefs.filter((belief) => (
    belief.sourceObservationId === sourceObservationId
    && stableStringify(belief.area) === stableStringify(perceivedArea)
  )).sort((left, right) => (
    right.lastObservedTick - left.lastObservedTick
    || compareText(left.key, right.key)
  ));
  const belief = candidates[0];
  return belief === undefined
    ? null
    : deepFreeze({ ...belief, ageTicks: perception.tick - belief.lastObservedTick });
}

function freshIdentifiedVisualBelief(
  perception: ActorPerceptionState,
  subjectId: string,
  subjectPosition: WorldPosition,
  tick: number,
): AgedActorBelief | null {
  const candidates = perception.beliefs.filter((belief) => (
    belief.channel === "vision"
    && belief.identification === "identified"
    && belief.subjectId === subjectId
    && belief.lastObservedTick === tick
    && belief.area.radiusUnits === 0
    && positionsEqual(belief.area.center, subjectPosition)
  )).sort((left, right) => compareText(left.sourceObservationId, right.sourceObservationId));
  const belief = candidates[0];
  return belief === undefined
    ? null
    : deepFreeze({ ...belief, ageTicks: 0 });
}

function opaqueTaskBeliefKey(
  activity: SettlementWorkingAnimalActivityTransaction,
): string {
  return opaqueTaskBeliefKeyFromSource(
    activity.transactionId,
    activity.cause.referenceId,
    activity.perceivedArea,
  );
}

function opaqueTaskBeliefKeyFromSource(
  sourceActivityTransactionId: string,
  sourceObservationId: string,
  perceivedArea: ObservedArea | null,
): string {
  return `contact:work:${hashCanonical({
    transactionId: sourceActivityTransactionId,
    observationId: sourceObservationId,
    area: perceivedArea,
  })}`;
}

interface CanonicalAssignmentCreationInput extends CreateSettlementWorkingAnimalAssignmentInput {
  readonly settlementId: number;
}

function canonicalAssignmentCreationInput(
  settlementId: unknown,
  value: unknown,
): CanonicalAssignmentCreationInput | null {
  if (
    !positiveSafeInteger(settlementId)
    || !plainRecord(value)
    || !exactKeys(value, [
      "assignmentOrdinal",
      "createdAtTick",
      "dutyArea",
      "handlerActorId",
      "protectedCustodyRelationshipId",
      "protectedGroupId",
      "role",
      "workerActorId",
      "workerCustodyRelationshipId",
      "workerSpecies",
      "worksiteId",
    ])
    || !nonnegativeSafeInteger(value.assignmentOrdinal)
    || !isLivingActorSpecies(value.workerSpecies)
    || value.workerSpecies === "human"
    || !isLivingSpeciesActorAddressable(value.workerSpecies)
    || typeof value.workerActorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(value.workerActorId, value.workerSpecies)
    || typeof value.handlerActorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(value.handlerActorId, "human")
    || !validCustodyRelationshipId(value.workerCustodyRelationshipId)
    || !validCustodyRelationshipId(value.protectedCustodyRelationshipId)
    || value.workerCustodyRelationshipId === value.protectedCustodyRelationshipId
    || !validId(value.protectedGroupId)
    || !ROLES.has(value.role as string)
    || !validId(value.worksiteId)
    || !nonnegativeSafeInteger(value.createdAtTick)
  ) return null;
  const dutyArea = canonicalArea(value.dutyArea, SETTLEMENT_WORKING_ANIMAL_MAX_DUTY_RADIUS_UNITS);
  if (dutyArea === null || dutyArea.radiusUnits === 0) return null;
  return deepFreeze({
    settlementId,
    assignmentOrdinal: value.assignmentOrdinal,
    workerActorId: value.workerActorId,
    workerSpecies: value.workerSpecies as Exclude<LivingActorSpecies, "human">,
    handlerActorId: value.handlerActorId,
    workerCustodyRelationshipId: value.workerCustodyRelationshipId,
    protectedCustodyRelationshipId: value.protectedCustodyRelationshipId,
    protectedGroupId: value.protectedGroupId,
    role: value.role as SettlementWorkingAnimalRole,
    worksiteId: value.worksiteId,
    dutyArea,
    createdAtTick: value.createdAtTick,
  });
}

function assignmentIdentity(input: CanonicalAssignmentCreationInput): string {
  return `WORK-ASSIGN-${hashCanonical({
    // The lifecycle is additive; established relationship identity must not churn.
    identityVersion: PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
    ...input,
  })}`;
}

function canonicalActivityTransaction(
  value: unknown,
  assignment: Readonly<{
    readonly assignmentId: string;
    readonly workerActorId: string;
    readonly createdAtTick: number;
  }>,
): SettlementWorkingAnimalActivityTransaction | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "acceptedAtTick",
      "activity",
      "assignmentId",
      "cause",
      "ordinal",
      "perceivedArea",
      "transactionId",
      "version",
      "workerActorId",
    ])
    || value.version !== SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION
    || value.assignmentId !== assignment.assignmentId
    || value.workerActorId !== assignment.workerActorId
    || !validId(value.transactionId)
    || !nonnegativeSafeInteger(value.ordinal)
    || value.ordinal > SETTLEMENT_WORKING_ANIMAL_MAX_ACTIVITY_ORDINAL
    || !ACTIVITIES.has(value.activity as string)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
    || value.acceptedAtTick < assignment.createdAtTick
  ) return null;
  const cause = canonicalCause(value.cause);
  const perceivedArea = value.perceivedArea === null
    ? null
    : canonicalArea(value.perceivedArea, 10_000_000);
  if (
    cause === null
    || (value.perceivedArea !== null && perceivedArea === null)
    || !activityCauseIsCoherent(
      value.activity as SettlementWorkingAnimalActivity,
      cause,
      perceivedArea,
      assignment.assignmentId,
    )
  ) return null;
  const expected = activityTransactionId({
    assignmentId: assignment.assignmentId,
    workerActorId: assignment.workerActorId,
    ordinal: value.ordinal,
    activity: value.activity as SettlementWorkingAnimalActivity,
    acceptedAtTick: value.acceptedAtTick,
    cause,
    perceivedArea,
  });
  if (value.transactionId !== expected) return null;
  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
    transactionId: value.transactionId,
    ordinal: value.ordinal,
    assignmentId: assignment.assignmentId,
    workerActorId: assignment.workerActorId,
    activity: value.activity as SettlementWorkingAnimalActivity,
    acceptedAtTick: value.acceptedAtTick,
    cause,
    perceivedArea,
  });
}

function createActivityTransaction(input: Readonly<{
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly ordinal: number;
  readonly activity: SettlementWorkingAnimalActivity;
  readonly acceptedAtTick: number;
  readonly cause: SettlementWorkingAnimalActivityCause;
  readonly perceivedArea: ObservedArea | null;
}>): SettlementWorkingAnimalActivityTransaction {
  const transaction = canonicalActivityTransaction({
    version: SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
    transactionId: activityTransactionId(input),
    ...input,
  }, {
    assignmentId: input.assignmentId,
    workerActorId: input.workerActorId,
    // This internal lower bound is completed by assignment validation.
    createdAtTick: 0,
  });
  if (transaction === null) throw new Error("Derived working-animal activity failed validation");
  return transaction;
}

function createTaskTransition(input: Readonly<{
  readonly assignment: SettlementWorkingAnimalAssignment;
  readonly taskId: string;
  readonly taskOrdinal: number;
  readonly transition: SettlementWorkingAnimalTaskTransitionKind;
  readonly acceptedAtTick: number;
  readonly cause: SettlementWorkingAnimalTaskTransitionCause;
  readonly sourceActivityTransactionId: string | null;
  readonly sourceObservationId: string | null;
  readonly perceivedArea: ObservedArea | null;
  readonly searchProbe: LivingActorSearchProbe | null;
  readonly suspension: SettlementWorkingAnimalTaskSuspension | null;
}>): SettlementWorkingAnimalTaskTransition {
  const fields = {
    ordinal: input.assignment.lastResolvedTaskTransitionOrdinal + 1,
    assignmentId: input.assignment.assignmentId,
    workerActorId: input.assignment.workerActorId,
    handlerActorId: input.assignment.handlerActorId,
    taskId: input.taskId,
    taskOrdinal: input.taskOrdinal,
    transition: input.transition,
    acceptedAtTick: input.acceptedAtTick,
    cause: input.cause,
    sourceActivityTransactionId: input.sourceActivityTransactionId,
    sourceObservationId: input.sourceObservationId,
    perceivedArea: input.perceivedArea,
    searchProbe: input.searchProbe,
    suspension: input.suspension,
  } as const;
  const transition = canonicalWorkingAnimalTaskTransition({
    version: SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITION_VERSION,
    transactionId: taskTransitionId(fields),
    ...fields,
  }, input.assignment);
  if (transition === null) throw new Error("Derived task transition failed validation");
  return transition;
}

function canonicalWorkingAnimalTaskTransition(
  value: unknown,
  assignment: Readonly<{
    readonly assignmentId: string;
    readonly workerActorId: string;
    readonly handlerActorId: string;
    readonly createdAtTick: number;
  }>,
): SettlementWorkingAnimalTaskTransition | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "acceptedAtTick",
      "assignmentId",
      "cause",
      "handlerActorId",
      "ordinal",
      "perceivedArea",
      "searchProbe",
      "sourceActivityTransactionId",
      "sourceObservationId",
      "suspension",
      "taskId",
      "taskOrdinal",
      "transactionId",
      "transition",
      "version",
      "workerActorId",
    ])
    || value.version !== SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITION_VERSION
    || value.assignmentId !== assignment.assignmentId
    || value.workerActorId !== assignment.workerActorId
    || value.handlerActorId !== assignment.handlerActorId
    || !validId(value.transactionId)
    || !validId(value.taskId)
    || !positiveSafeInteger(value.ordinal)
    || value.ordinal > SETTLEMENT_WORKING_ANIMAL_MAX_TASK_TRANSITION_ORDINAL
    || !positiveSafeInteger(value.taskOrdinal)
    || value.taskOrdinal > SETTLEMENT_WORKING_ANIMAL_MAX_TASK_ORDINAL
    || !TASK_TRANSITIONS.has(value.transition as string)
    || !nonnegativeSafeInteger(value.acceptedAtTick)
    || value.acceptedAtTick < assignment.createdAtTick
  ) return null;
  const cause = canonicalTaskTransitionCause(value.cause);
  const perceivedArea = value.perceivedArea === null
    ? null
    : canonicalArea(value.perceivedArea, 10_000_000);
  const searchProbe = value.searchProbe === null
    ? null
    : canonicalTaskSearchProbe(value.searchProbe);
  const suspension = value.suspension === null
    ? null
    : canonicalTaskSuspension(value.suspension);
  if (
    cause === null
    || (value.perceivedArea !== null && perceivedArea === null)
    || (value.searchProbe !== null && searchProbe === null)
    || (value.suspension !== null && suspension === null)
    || !(value.sourceActivityTransactionId === null || validId(value.sourceActivityTransactionId))
    || !(value.sourceObservationId === null || validId(value.sourceObservationId))
  ) return null;
  const canonicalFields = {
    ordinal: value.ordinal,
    assignmentId: assignment.assignmentId,
    workerActorId: assignment.workerActorId,
    handlerActorId: assignment.handlerActorId,
    taskId: value.taskId,
    taskOrdinal: value.taskOrdinal,
    transition: value.transition as SettlementWorkingAnimalTaskTransitionKind,
    acceptedAtTick: value.acceptedAtTick,
    cause,
    sourceActivityTransactionId: value.sourceActivityTransactionId as string | null,
    sourceObservationId: value.sourceObservationId as string | null,
    perceivedArea,
    searchProbe,
    suspension,
  };
  if (!taskTransitionPayloadIsCoherent(canonicalFields)) return null;
  const expectedId = taskTransitionId(canonicalFields);
  if (value.transactionId !== expectedId) return null;
  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITION_VERSION,
    transactionId: value.transactionId,
    ...canonicalFields,
  });
}

function taskTransitionId(input: Readonly<{
  readonly ordinal: number;
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly handlerActorId: string;
  readonly taskId: string;
  readonly taskOrdinal: number;
  readonly transition: SettlementWorkingAnimalTaskTransitionKind;
  readonly acceptedAtTick: number;
  readonly cause: SettlementWorkingAnimalTaskTransitionCause;
  readonly sourceActivityTransactionId: string | null;
  readonly sourceObservationId: string | null;
  readonly perceivedArea: ObservedArea | null;
  readonly searchProbe: LivingActorSearchProbe | null;
  readonly suspension: SettlementWorkingAnimalTaskSuspension | null;
}>): string {
  return `WORK-TASK-TX-${hashCanonical({
    version: SETTLEMENT_WORKING_ANIMAL_TASK_TRANSITION_VERSION,
    ...input,
  })}`;
}

function taskTransitionPayloadIsCoherent(input: Readonly<{
  readonly assignmentId: string;
  readonly taskId: string;
  readonly taskOrdinal: number;
  readonly transition: SettlementWorkingAnimalTaskTransitionKind;
  readonly cause: SettlementWorkingAnimalTaskTransitionCause;
  readonly sourceActivityTransactionId: string | null;
  readonly sourceObservationId: string | null;
  readonly perceivedArea: ObservedArea | null;
  readonly searchProbe: LivingActorSearchProbe | null;
  readonly suspension: SettlementWorkingAnimalTaskSuspension | null;
}>): boolean {
  const {
    transition,
    cause,
    sourceActivityTransactionId,
    sourceObservationId,
    perceivedArea,
    searchProbe,
    suspension,
  } = input;
  if (transition === "open") {
    return cause.kind === "activity"
      && sourceActivityTransactionId !== null
      && cause.referenceId === sourceActivityTransactionId
      && sourceObservationId !== null
      && perceivedArea !== null
      && searchProbe !== null
      && searchProbe.requestId === sourceActivityTransactionId
      && searchProbe.probeOrdinal === 0
      && searchProbe.beliefKey === opaqueTaskBeliefKeyFromSource(
        sourceActivityTransactionId,
        sourceObservationId,
        perceivedArea,
      )
      && stableStringify(searchProbe.sourceArea) === stableStringify(perceivedArea)
      && input.taskId === workingAnimalTaskId(
        input.assignmentId,
        input.taskOrdinal,
        sourceActivityTransactionId,
        sourceObservationId,
      );
  }
  if (
    sourceActivityTransactionId !== null
    || sourceObservationId !== null
    || perceivedArea !== null
    || searchProbe !== null
  ) return false;
  if (transition === "suspend") {
    return suspension !== null
      && (cause.kind === "welfare" || cause.kind === "actor-disposition")
      && stableStringify(cause) === stableStringify(suspension);
  }
  if (suspension !== null) return false;
  if (transition === "resume") {
    return cause.kind === "assignment" && cause.referenceId === input.assignmentId;
  }
  if (transition === "complete") return cause.kind === "probe";
  if (transition === "cancel") return cause.kind === "handler-recall";
  if (transition === "arrive") return cause.kind === "worksite";
  return transition === "acknowledge" && cause.kind === "handler-acknowledgement";
}

function canonicalWorkingAnimalTask(
  value: unknown,
  assignment: Readonly<{
    readonly assignmentId: string;
    readonly workerActorId: string;
    readonly handlerActorId: string;
    readonly worksiteId: string;
    readonly createdAtTick: number;
  }>,
): SettlementWorkingAnimalTask | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "assignmentId",
      "handlerActorId",
      "lastTransition",
      "openedAtTick",
      "outcome",
      "outcomeAtTick",
      "outcomeTransition",
      "perceivedArea",
      "phase",
      "searchProbe",
      "sourceActivityTransactionId",
      "sourceObservationId",
      "suspension",
      "taskId",
      "taskOrdinal",
      "version",
      "workerActorId",
    ])
    || value.version !== SETTLEMENT_WORKING_ANIMAL_TASK_VERSION
    || value.assignmentId !== assignment.assignmentId
    || value.workerActorId !== assignment.workerActorId
    || value.handlerActorId !== assignment.handlerActorId
    || !validId(value.taskId)
    || !positiveSafeInteger(value.taskOrdinal)
    || value.taskOrdinal > SETTLEMENT_WORKING_ANIMAL_MAX_TASK_ORDINAL
    || !validId(value.sourceActivityTransactionId)
    || !validId(value.sourceObservationId)
    || !nonnegativeSafeInteger(value.openedAtTick)
    || value.openedAtTick < assignment.createdAtTick
    || !TASK_PHASES.has(value.phase as string)
    || value.phase === "closed"
    || !(value.outcome === null || TASK_OUTCOMES.has(value.outcome as string))
    || !(value.outcomeAtTick === null || nonnegativeSafeInteger(value.outcomeAtTick))
  ) return null;
  const perceivedArea = canonicalArea(value.perceivedArea, 10_000_000);
  const searchProbe = canonicalTaskSearchProbe(value.searchProbe);
  const suspension = value.suspension === null
    ? null
    : canonicalTaskSuspension(value.suspension);
  const outcomeTransition = value.outcomeTransition === null
    ? null
    : canonicalWorkingAnimalTaskTransition(value.outcomeTransition, assignment);
  const lastTransition = canonicalWorkingAnimalTaskTransition(
    value.lastTransition,
    assignment,
  );
  if (
    perceivedArea === null
    || searchProbe === null
    || (value.suspension !== null && suspension === null)
    || (value.outcomeTransition !== null && outcomeTransition === null)
    || lastTransition === null
    || value.taskId !== workingAnimalTaskId(
      assignment.assignmentId,
      value.taskOrdinal,
      value.sourceActivityTransactionId,
      value.sourceObservationId,
    )
    || searchProbe.requestId !== value.sourceActivityTransactionId
    || searchProbe.probeOrdinal !== 0
    || searchProbe.beliefKey !== opaqueTaskBeliefKeyFromSource(
      value.sourceActivityTransactionId,
      value.sourceObservationId,
      perceivedArea,
    )
    || stableStringify(searchProbe.sourceArea) !== stableStringify(perceivedArea)
    || lastTransition.taskId !== value.taskId
    || lastTransition.taskOrdinal !== value.taskOrdinal
    || lastTransition.acceptedAtTick < value.openedAtTick
    || (lastTransition.transition === "open" && (
      lastTransition.acceptedAtTick !== value.openedAtTick
      || lastTransition.sourceActivityTransactionId !== value.sourceActivityTransactionId
      || lastTransition.sourceObservationId !== value.sourceObservationId
      || stableStringify(lastTransition.perceivedArea) !== stableStringify(perceivedArea)
      || stableStringify(lastTransition.searchProbe) !== stableStringify(searchProbe)
      || stableStringify(lastTransition.suspension) !== stableStringify(suspension)
    ))
    || (outcomeTransition !== null && (
      outcomeTransition.taskId !== value.taskId
      || outcomeTransition.taskOrdinal !== value.taskOrdinal
      || outcomeTransition.ordinal > lastTransition.ordinal
      || outcomeTransition.acceptedAtTick > lastTransition.acceptedAtTick
      || (outcomeTransition.transition === "complete"
        && (outcomeTransition.cause.kind !== "probe"
          || outcomeTransition.cause.referenceId !== searchProbe.id))
    ))
    || !currentTaskPhaseMatchesTransition(
      value.phase as SettlementWorkingAnimalCurrentTaskPhase,
      value.outcome as SettlementWorkingAnimalTaskOutcomeKind | null,
      value.outcomeAtTick as number | null,
      outcomeTransition,
      suspension,
      lastTransition,
      assignment.worksiteId,
    )
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMAL_TASK_VERSION,
    taskId: value.taskId,
    taskOrdinal: value.taskOrdinal,
    assignmentId: assignment.assignmentId,
    workerActorId: assignment.workerActorId,
    handlerActorId: assignment.handlerActorId,
    sourceActivityTransactionId: value.sourceActivityTransactionId,
    sourceObservationId: value.sourceObservationId,
    openedAtTick: value.openedAtTick,
    perceivedArea,
    searchProbe,
    phase: value.phase as SettlementWorkingAnimalCurrentTaskPhase,
    outcome: value.outcome as SettlementWorkingAnimalTaskOutcomeKind | null,
    outcomeAtTick: value.outcomeAtTick as number | null,
    outcomeTransition,
    suspension,
    lastTransition,
  });
}

function canonicalWorkingAnimalTaskOutcome(
  value: unknown,
  assignment: Readonly<{
    readonly assignmentId: string;
    readonly workerActorId: string;
    readonly handlerActorId: string;
    readonly worksiteId: string;
    readonly createdAtTick: number;
  }>,
): SettlementWorkingAnimalTaskOutcome | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "arrivalTransition",
      "assignmentId",
      "closedAtTick",
      "handlerActorId",
      "lastTransition",
      "outcome",
      "outcomeAtTick",
      "outcomeTransition",
      "perceivedArea",
      "phase",
      "searchProbe",
      "sourceActivityTransactionId",
      "sourceObservationId",
      "taskId",
      "taskOrdinal",
      "version",
      "workerActorId",
    ])
    || value.version !== SETTLEMENT_WORKING_ANIMAL_TASK_OUTCOME_VERSION
    || value.assignmentId !== assignment.assignmentId
    || value.workerActorId !== assignment.workerActorId
    || value.handlerActorId !== assignment.handlerActorId
    || !validId(value.taskId)
    || !positiveSafeInteger(value.taskOrdinal)
    || value.taskOrdinal > SETTLEMENT_WORKING_ANIMAL_MAX_TASK_ORDINAL
    || !validId(value.sourceActivityTransactionId)
    || !validId(value.sourceObservationId)
    || value.phase !== "closed"
    || !TASK_OUTCOMES.has(value.outcome as string)
    || !nonnegativeSafeInteger(value.outcomeAtTick)
    || !nonnegativeSafeInteger(value.closedAtTick)
    || value.closedAtTick < value.outcomeAtTick
  ) return null;
  const lastTransition = canonicalWorkingAnimalTaskTransition(
    value.lastTransition,
    assignment,
  );
  const outcomeTransition = canonicalWorkingAnimalTaskTransition(
    value.outcomeTransition,
    assignment,
  );
  const perceivedArea = canonicalArea(value.perceivedArea, 10_000_000);
  const searchProbe = canonicalTaskSearchProbe(value.searchProbe);
  const arrivalTransition = canonicalWorkingAnimalTaskTransition(
    value.arrivalTransition,
    assignment,
  );
  if (
    lastTransition === null
    || outcomeTransition === null
    || perceivedArea === null
    || searchProbe === null
    || arrivalTransition === null
    || lastTransition.transition !== "acknowledge"
    || lastTransition.taskId !== value.taskId
    || lastTransition.taskOrdinal !== value.taskOrdinal
    || lastTransition.acceptedAtTick !== value.closedAtTick
    || outcomeTransition.taskId !== value.taskId
    || outcomeTransition.taskOrdinal !== value.taskOrdinal
    || outcomeTransition.acceptedAtTick !== value.outcomeAtTick
    || searchProbe.requestId !== value.sourceActivityTransactionId
    || searchProbe.probeOrdinal !== 0
    || searchProbe.beliefKey !== opaqueTaskBeliefKeyFromSource(
      value.sourceActivityTransactionId,
      value.sourceObservationId,
      perceivedArea,
    )
    || stableStringify(searchProbe.sourceArea) !== stableStringify(perceivedArea)
    || arrivalTransition.transition !== "arrive"
    || arrivalTransition.taskId !== value.taskId
    || arrivalTransition.taskOrdinal !== value.taskOrdinal
    || arrivalTransition.cause.kind !== "worksite"
    || arrivalTransition.cause.referenceId !== assignment.worksiteId
    || outcomeTransition.ordinal >= arrivalTransition.ordinal
    || arrivalTransition.ordinal >= lastTransition.ordinal
    || outcomeTransition.acceptedAtTick >= arrivalTransition.acceptedAtTick
    || arrivalTransition.acceptedAtTick >= lastTransition.acceptedAtTick
    || (value.outcome === "completed"
      ? outcomeTransition.transition !== "complete"
        || outcomeTransition.cause.kind !== "probe"
        || outcomeTransition.cause.referenceId !== searchProbe.id
      : outcomeTransition.transition !== "cancel")
    || value.taskId !== workingAnimalTaskId(
      assignment.assignmentId,
      value.taskOrdinal,
      value.sourceActivityTransactionId,
      value.sourceObservationId,
    )
  ) return null;
  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMAL_TASK_OUTCOME_VERSION,
    taskId: value.taskId,
    taskOrdinal: value.taskOrdinal,
    assignmentId: assignment.assignmentId,
    workerActorId: assignment.workerActorId,
    handlerActorId: assignment.handlerActorId,
    sourceActivityTransactionId: value.sourceActivityTransactionId,
    sourceObservationId: value.sourceObservationId,
    perceivedArea,
    searchProbe,
    phase: "closed",
    outcome: value.outcome as SettlementWorkingAnimalTaskOutcomeKind,
    outcomeAtTick: value.outcomeAtTick,
    outcomeTransition,
    arrivalTransition,
    closedAtTick: value.closedAtTick,
    lastTransition,
  });
}

function canonicalTaskSearchProbe(value: unknown): LivingActorSearchProbe | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "beliefKey",
    "id",
    "probeArea",
    "probeOrdinal",
    "requestId",
    "sourceArea",
    "version",
  ])) return null;
  const derived = deriveLivingActorSearchProbe({
    requestId: value.requestId,
    beliefKey: value.beliefKey,
    probeOrdinal: value.probeOrdinal,
    sourceArea: value.sourceArea,
  });
  return derived !== null && stableStringify(derived) === stableStringify(value)
    ? derived
    : null;
}

function currentTaskPhaseMatchesTransition(
  phase: SettlementWorkingAnimalCurrentTaskPhase,
  outcome: SettlementWorkingAnimalTaskOutcomeKind | null,
  outcomeAtTick: number | null,
  outcomeTransition: SettlementWorkingAnimalTaskTransition | null,
  suspension: SettlementWorkingAnimalTaskSuspension | null,
  transition: SettlementWorkingAnimalTaskTransition,
  worksiteId: string,
): boolean {
  if (phase === "investigating") {
    return outcome === null
      && outcomeAtTick === null
      && outcomeTransition === null
      && (transition.transition === "open"
        || transition.transition === "suspend"
        || transition.transition === "resume")
      && (transition.transition === "suspend"
        ? stableStringify(suspension) === stableStringify(transition.suspension)
        : transition.transition === "resume" ? suspension === null : true);
  }
  if (
    outcome === null
    || outcomeAtTick === null
    || outcomeTransition === null
    || outcomeAtTick > transition.acceptedAtTick
    || outcomeTransition.acceptedAtTick !== outcomeAtTick
    || (outcome === "completed"
      ? outcomeTransition.transition !== "complete"
      : outcomeTransition.transition !== "cancel")
  ) {
    return false;
  }
  if (phase === "returning") {
    if (transition.transition === "complete" || transition.transition === "cancel") {
      return suspension === null
        && stableStringify(transition) === stableStringify(outcomeTransition);
    }
    if (transition.transition === "suspend") {
      return outcomeTransition.ordinal < transition.ordinal
        && outcomeTransition.acceptedAtTick < transition.acceptedAtTick
        && stableStringify(suspension) === stableStringify(transition.suspension);
    }
    return transition.transition === "resume"
      && outcomeTransition.ordinal < transition.ordinal
      && outcomeTransition.acceptedAtTick < transition.acceptedAtTick
      && suspension === null;
  }
  return suspension === null
    && transition.transition === "arrive"
    && transition.cause.kind === "worksite"
    && transition.cause.referenceId === worksiteId
    && outcomeTransition.ordinal < transition.ordinal
    && outcomeTransition.acceptedAtTick < transition.acceptedAtTick;
}

function workingAnimalTaskId(
  assignmentId: string,
  taskOrdinal: number,
  sourceActivityTransactionId: string,
  sourceObservationId: string,
): string {
  return `WORK-TASK-${hashCanonical({
    version: SETTLEMENT_WORKING_ANIMAL_TASK_VERSION,
    assignmentId,
    taskOrdinal,
    sourceActivityTransactionId,
    sourceObservationId,
  })}`;
}

type HandlerSearchReportFields = Omit<
  SettlementWorkingAnimalHandlerSearchReport,
  "reportId" | "version"
>;

function handlerSearchReportId(fields: HandlerSearchReportFields): string {
  return `WORK-REPORT-${hashCanonical({
    version: SETTLEMENT_WORKING_ANIMAL_HANDLER_SEARCH_REPORT_VERSION,
    ...fields,
  })}`;
}

function canonicalHandlerSearchReport(
  value: unknown,
): SettlementWorkingAnimalHandlerSearchReport | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "assignmentId",
      "handlerActorId",
      "knownArea",
      "knownAtTick",
      "reportId",
      "sourceReferenceId",
      "version",
    ])
    || value.version !== SETTLEMENT_WORKING_ANIMAL_HANDLER_SEARCH_REPORT_VERSION
    || typeof value.reportId !== "string"
    || !HANDLER_SEARCH_REPORT_PATTERN.test(value.reportId)
    || !validId(value.assignmentId)
    || !livingSpeciesActorIdMatchesNamespace(value.handlerActorId, "human")
    || !nonnegativeSafeInteger(value.knownAtTick)
    || !validId(value.sourceReferenceId)
  ) return null;
  const knownArea = canonicalArea(value.knownArea, 10_000_000);
  if (knownArea === null) return null;
  const fields = {
    assignmentId: value.assignmentId as string,
    handlerActorId: value.handlerActorId as string,
    knownAtTick: value.knownAtTick as number,
    sourceReferenceId: value.sourceReferenceId as string,
    knownArea,
  } as const;
  if (value.reportId !== handlerSearchReportId(fields)) return null;
  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMAL_HANDLER_SEARCH_REPORT_VERSION,
    reportId: value.reportId as string,
    ...fields,
  });
}

function canonicalHandlerSearchEvaluation(
  value: unknown,
): SettlementWorkingAnimalHandlerSearchEvaluationInput | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "accessibility",
      "actorDisposition",
      "report",
      "tick",
      "welfare",
      "workerInsideDutyArea",
    ])
    || !nonnegativeSafeInteger(value.tick)
    || typeof value.workerInsideDutyArea !== "boolean"
  ) return null;
  const report = canonicalHandlerSearchReport(value.report);
  const welfare = canonicalWelfare(value.welfare);
  const accessibility = canonicalAccessibility(value.accessibility);
  const actorDisposition = canonicalActorDisposition(value.actorDisposition);
  return report === null
    || welfare === null
    || accessibility === null
    || actorDisposition === null
    ? null
    : deepFreeze({
        tick: value.tick as number,
        report,
        welfare,
        accessibility,
        actorDisposition,
        workerInsideDutyArea: value.workerInsideDutyArea,
      });
}

function activityTransactionId(input: Readonly<{
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly ordinal: number;
  readonly activity: SettlementWorkingAnimalActivity;
  readonly acceptedAtTick: number;
  readonly cause: SettlementWorkingAnimalActivityCause;
  readonly perceivedArea: ObservedArea | null;
}>): string {
  return `WORK-ACT-${hashCanonical({
    version: SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
    ...input,
  })}`;
}

function canonicalDecisionInput(
  value: unknown,
): SettlementWorkingAnimalActivityDecisionInput | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "accessibility",
      "actorDisposition",
      "assignment",
      "perception",
      "tick",
      "welfare",
      "workerInsideDutyArea",
    ])
    || !nonnegativeSafeInteger(value.tick)
    || typeof value.workerInsideDutyArea !== "boolean"
  ) return null;
  const assignment = canonicalizeSettlementWorkingAnimalAssignment(value.assignment);
  const perception = canonicalizeActorPerceptionState(value.perception);
  const welfare = canonicalWelfare(value.welfare);
  const accessibility = canonicalAccessibility(value.accessibility);
  const actorDisposition = canonicalActorDisposition(value.actorDisposition);
  if (
    assignment === null
    || perception === null
    || perception.actorId !== assignment.workerActorId
    || perception.tick !== value.tick
    || value.tick < assignment.currentActivity.acceptedAtTick
    || welfare === null
    || accessibility === null
    || actorDisposition === null
  ) return null;
  return deepFreeze({
    assignment,
    tick: value.tick,
    perception,
    welfare,
    accessibility,
    actorDisposition,
    workerInsideDutyArea: value.workerInsideDutyArea,
  });
}

function canonicalEvaluationInput(
  value: unknown,
): SettlementWorkingAnimalActivityEvaluationInput | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "accessibility",
      "actorDisposition",
      "assignmentId",
      "perception",
      "tick",
      "welfare",
      "workerInsideDutyArea",
    ])
    || !validId(value.assignmentId)
    || !nonnegativeSafeInteger(value.tick)
    || typeof value.workerInsideDutyArea !== "boolean"
  ) return null;
  const perception = canonicalizeActorPerceptionState(value.perception);
  const welfare = canonicalWelfare(value.welfare);
  const accessibility = canonicalAccessibility(value.accessibility);
  const actorDisposition = canonicalActorDisposition(value.actorDisposition);
  if (
    perception === null
    || welfare === null
    || accessibility === null
    || actorDisposition === null
  ) return null;
  return deepFreeze({
    assignmentId: value.assignmentId,
    tick: value.tick,
    perception,
    welfare,
    accessibility,
    actorDisposition,
    workerInsideDutyArea: value.workerInsideDutyArea,
  });
}

function canonicalTaskLifecycleEvaluation(
  value: unknown,
): SettlementWorkingAnimalTaskLifecycleEvaluationInput | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "actorDisposition",
      "assignmentId",
      "handlerDisposition",
      "handlerPerception",
      "handlerPosition",
      "tick",
      "welfare",
      "workerPerception",
      "workerPosition",
    ])
    || !validId(value.assignmentId)
    || !nonnegativeSafeInteger(value.tick)
    || !isWorldPosition(value.workerPosition)
    || !isWorldPosition(value.handlerPosition)
  ) return null;
  const workerPerception = canonicalizeActorPerceptionState(value.workerPerception);
  const handlerPerception = canonicalizeActorPerceptionState(value.handlerPerception);
  const welfare = canonicalWelfare(value.welfare);
  const actorDisposition = canonicalActorDisposition(value.actorDisposition);
  const handlerDisposition = canonicalHandlerDisposition(value.handlerDisposition);
  if (
    workerPerception === null
    || handlerPerception === null
    || workerPerception.tick !== value.tick
    || handlerPerception.tick !== value.tick
    || welfare === null
    || actorDisposition === null
    || handlerDisposition === null
  ) return null;
  return deepFreeze({
    assignmentId: value.assignmentId,
    tick: value.tick,
    workerPosition: clonePosition(value.workerPosition),
    handlerPosition: clonePosition(value.handlerPosition),
    workerPerception,
    handlerPerception,
    welfare,
    actorDisposition,
    handlerDisposition,
  });
}

function canonicalActorDisposition(
  value: unknown,
): SettlementWorkingAnimalActorDisposition | null {
  if (!plainRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "available") {
    return exactKeys(value, ["kind"])
      ? deepFreeze({ kind: "available" as const })
      : null;
  }
  if (
    value.kind !== "defer-to-actor"
    || !exactKeys(value, ["kind", "referenceId"])
    || typeof value.referenceId !== "string"
    || !/^actor-intent:[a-z][a-z0-9-]{0,63}$/u.test(value.referenceId)
  ) return null;
  return deepFreeze({
    kind: "defer-to-actor" as const,
    referenceId: value.referenceId,
  });
}

function canonicalHandlerDisposition(
  value: unknown,
): SettlementWorkingAnimalHandlerDisposition | null {
  if (!plainRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "continue") {
    return exactKeys(value, ["kind"])
      ? deepFreeze({ kind: "continue" as const })
      : null;
  }
  if (
    value.kind !== "recall"
    || !exactKeys(value, ["kind", "referenceId"])
    || typeof value.referenceId !== "string"
    || !/^handler-intent:[a-z][a-z0-9-]{0,63}$/u.test(value.referenceId)
  ) return null;
  return deepFreeze({
    kind: "recall" as const,
    referenceId: value.referenceId,
  });
}

function canonicalWelfare(value: unknown): SettlementWorkingAnimalWelfareState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "coldPressure",
    "exhaustionPressure",
    "heatPressure",
    "hungerPressure",
    "injuryPressure",
    "thirstPressure",
  ])) return null;
  if (![
    value.injuryPressure,
    value.coldPressure,
    value.heatPressure,
    value.exhaustionPressure,
    value.hungerPressure,
    value.thirstPressure,
  ].every(scaledUnit)) return null;
  return deepFreeze({
    injuryPressure: value.injuryPressure as number,
    coldPressure: value.coldPressure as number,
    heatPressure: value.heatPressure as number,
    exhaustionPressure: value.exhaustionPressure as number,
    hungerPressure: value.hungerPressure as number,
    thirstPressure: value.thirstPressure as number,
  });
}

function canonicalAccessibility(
  value: unknown,
): SettlementWorkingAnimalActivityAccessibility | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["investigate", "return", "watch"])
    || typeof value.watch !== "boolean"
    || typeof value.investigate !== "boolean"
    || typeof value.return !== "boolean"
    || (!value.watch && !value.investigate && !value.return)
  ) return null;
  return deepFreeze({
    watch: value.watch,
    investigate: value.investigate,
    return: value.return,
  });
}

function strongestWelfareCause(
  welfare: SettlementWorkingAnimalWelfareState,
): SettlementWorkingAnimalWelfareReference | null {
  let selected: SettlementWorkingAnimalWelfareReference | null = null;
  let pressure = SETTLEMENT_WORKING_ANIMAL_SURVIVAL_OVERRIDE_THRESHOLD - 1;
  for (const [key, reference] of WELFARE_PRIORITY) {
    const candidate = welfare[key];
    if (candidate > pressure) {
      pressure = candidate;
      selected = reference;
    }
  }
  return selected;
}

function strongestRelevantWorkSignal(
  assignment: SettlementWorkingAnimalAssignment,
  perception: ActorPerceptionState,
): AgedActorBelief | null {
  if (assignment.role !== "guardian") return null;
  const candidates = queryActorAttention(perception).filter((belief) => {
    const signalStrength = Math.min(belief.confidence, belief.salience);
    if (signalStrength < SETTLEMENT_WORKING_ANIMAL_GUARDIAN_SIGNAL_THRESHOLD) return false;
    if (!areasIntersect(assignment.dutyArea, belief.area)) return false;
    if (GUARDIAN_ALARM_CLASSES.has(belief.perceivedClass)) {
      return belief.channel === "hearing"
        && belief.subjectId === null
        && belief.identification === "anonymous";
    }
    return GUARDIAN_THREAT_CLASSES.has(belief.perceivedClass);
  });
  candidates.sort((left, right) => (
    Math.min(right.confidence, right.salience) - Math.min(left.confidence, left.salience)
    || right.lastObservedTick - left.lastObservedTick
    || compareText(left.sourceObservationId, right.sourceObservationId)
  ));
  return candidates[0] ?? null;
}

function createDecision(
  assignment: SettlementWorkingAnimalAssignment,
  tick: number,
  activity: SettlementWorkingAnimalActivity,
  cause: SettlementWorkingAnimalActivityCause,
  perceivedArea: ObservedArea | null,
): SettlementWorkingAnimalActivityDecision {
  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
    assignmentId: assignment.assignmentId,
    workerActorId: assignment.workerActorId,
    activity,
    decidedAtTick: tick,
    cause,
    perceivedArea: perceivedArea === null
      ? null
      : cloneArea(perceivedArea),
  });
}

function decisionFromTransaction(
  transaction: SettlementWorkingAnimalActivityTransaction,
): SettlementWorkingAnimalActivityDecision {
  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION,
    assignmentId: transaction.assignmentId,
    workerActorId: transaction.workerActorId,
    activity: transaction.activity,
    decidedAtTick: transaction.acceptedAtTick,
    cause: transaction.cause,
    perceivedArea: transaction.perceivedArea,
  });
}

function sameAcceptedActivity(
  current: SettlementWorkingAnimalActivityTransaction,
  decision: SettlementWorkingAnimalActivityDecision,
): boolean {
  return current.activity === decision.activity
    && stableStringify(current.cause) === stableStringify(decision.cause)
    && stableStringify(current.perceivedArea) === stableStringify(decision.perceivedArea);
}

function canonicalCause(value: unknown): SettlementWorkingAnimalActivityCause | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["kind", "referenceId"])
    || !validId(value.referenceId)
  ) return null;
  if (value.kind === "handler-report") {
    return HANDLER_SEARCH_REPORT_PATTERN.test(value.referenceId)
      ? deepFreeze({ kind: value.kind, referenceId: value.referenceId })
      : null;
  }
  if (value.kind === "assignment" || value.kind === "perception") {
    return deepFreeze({ kind: value.kind, referenceId: value.referenceId });
  }
  if (
    value.kind === "actor-disposition"
    && /^actor-intent:[a-z][a-z0-9-]{0,63}$/u.test(value.referenceId)
  ) {
    return deepFreeze({ kind: value.kind, referenceId: value.referenceId });
  }
  return value.kind === "welfare" && WELFARE_REFERENCES.has(value.referenceId)
    ? deepFreeze({
        kind: "welfare",
        referenceId: value.referenceId as SettlementWorkingAnimalWelfareReference,
      })
    : null;
}

function canonicalTaskSuspension(
  value: unknown,
): SettlementWorkingAnimalTaskSuspension | null {
  const cause = canonicalTaskTransitionCause(value);
  return cause?.kind === "welfare" || cause?.kind === "actor-disposition"
    ? cause
    : null;
}

function canonicalTaskTransitionCause(
  value: unknown,
): SettlementWorkingAnimalTaskTransitionCause | null {
  if (!plainRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "handler-recall") {
    if (
      !exactKeys(value, [
        "handlerObservationId",
        "kind",
        "referenceId",
        "workerObservationId",
      ])
      || typeof value.referenceId !== "string"
      || !/^handler-intent:[a-z][a-z0-9-]{0,63}$/u.test(value.referenceId)
      || !validId(value.workerObservationId)
      || !validId(value.handlerObservationId)
    ) return null;
    return deepFreeze({
      kind: "handler-recall" as const,
      referenceId: value.referenceId,
      workerObservationId: value.workerObservationId,
      handlerObservationId: value.handlerObservationId,
    });
  }
  if (
    !exactKeys(value, ["kind", "referenceId"])
    || !validId(value.referenceId)
  ) return null;
  if (
    value.kind === "activity"
    || value.kind === "assignment"
    || value.kind === "probe"
    || value.kind === "worksite"
    || value.kind === "handler-acknowledgement"
  ) return deepFreeze({ kind: value.kind, referenceId: value.referenceId });
  if (
    value.kind === "actor-disposition"
    && /^actor-intent:[a-z][a-z0-9-]{0,63}$/u.test(value.referenceId)
  ) return deepFreeze({ kind: value.kind, referenceId: value.referenceId });
  return value.kind === "welfare" && WELFARE_REFERENCES.has(value.referenceId)
    ? deepFreeze({
        kind: "welfare" as const,
        referenceId: value.referenceId as SettlementWorkingAnimalWelfareReference,
      })
    : null;
}

function activityCauseIsCoherent(
  activity: SettlementWorkingAnimalActivity,
  cause: SettlementWorkingAnimalActivityCause,
  area: ObservedArea | null,
  assignmentId: string,
): boolean {
  if (activity === "investigate") {
    return (cause.kind === "perception" || cause.kind === "handler-report") && area !== null;
  }
  if (activity === "survival-override") return cause.kind === "welfare" && area === null;
  if (activity === "defer-to-actor") {
    return cause.kind === "actor-disposition" && area === null;
  }
  return cause.kind === "assignment"
    && cause.referenceId === assignmentId
    && area === null;
}

interface TaskLifecycleAssignmentPatch {
  readonly lastTaskOrdinal: number;
  readonly currentTask: SettlementWorkingAnimalTask | null;
  readonly lastTaskOutcome: SettlementWorkingAnimalTaskOutcome | null;
}

function applyTaskLifecycleTransition(
  assignment: SettlementWorkingAnimalAssignment,
  transition: SettlementWorkingAnimalTaskTransition,
): TaskLifecycleAssignmentPatch | null {
  const task = assignment.currentTask;
  if (transition.transition === "open") {
    if (
      task !== null
      || transition.sourceActivityTransactionId === null
      || transition.sourceObservationId === null
      || transition.perceivedArea === null
      || transition.searchProbe === null
    ) return null;
    return deepFreeze({
      lastTaskOrdinal: transition.taskOrdinal,
      currentTask: deepFreeze({
        version: SETTLEMENT_WORKING_ANIMAL_TASK_VERSION,
        taskId: transition.taskId,
        taskOrdinal: transition.taskOrdinal,
        assignmentId: assignment.assignmentId,
        workerActorId: assignment.workerActorId,
        handlerActorId: assignment.handlerActorId,
        sourceActivityTransactionId: transition.sourceActivityTransactionId,
        sourceObservationId: transition.sourceObservationId,
        openedAtTick: transition.acceptedAtTick,
        perceivedArea: transition.perceivedArea,
        searchProbe: transition.searchProbe,
        phase: "investigating" as const,
        outcome: null,
        outcomeAtTick: null,
        outcomeTransition: null,
        suspension: transition.suspension,
        lastTransition: transition,
      }),
      lastTaskOutcome: assignment.lastTaskOutcome,
    });
  }
  if (task === null) return null;
  if (transition.transition === "suspend") {
    return taskPatch(assignment, {
      ...task,
      suspension: transition.suspension,
      lastTransition: transition,
    });
  }
  if (transition.transition === "resume") {
    return taskPatch(assignment, {
      ...task,
      suspension: null,
      lastTransition: transition,
    });
  }
  if (transition.transition === "complete" || transition.transition === "cancel") {
    const outcome = transition.transition === "complete" ? "completed" : "cancelled";
    return taskPatch(assignment, {
      ...task,
      phase: "returning",
      outcome,
      outcomeAtTick: transition.acceptedAtTick,
      outcomeTransition: transition,
      suspension: null,
      lastTransition: transition,
    });
  }
  if (transition.transition === "arrive") {
    return taskPatch(assignment, {
      ...task,
      phase: "awaiting-handler",
      suspension: null,
      lastTransition: transition,
    });
  }
  if (task.outcome === null || task.outcomeAtTick === null || task.outcomeTransition === null) {
    return null;
  }
  return deepFreeze({
    lastTaskOrdinal: assignment.lastTaskOrdinal,
    currentTask: null,
    lastTaskOutcome: deepFreeze({
      version: SETTLEMENT_WORKING_ANIMAL_TASK_OUTCOME_VERSION,
      taskId: task.taskId,
      taskOrdinal: task.taskOrdinal,
      assignmentId: assignment.assignmentId,
      workerActorId: assignment.workerActorId,
      handlerActorId: assignment.handlerActorId,
      sourceActivityTransactionId: task.sourceActivityTransactionId,
      sourceObservationId: task.sourceObservationId,
      perceivedArea: task.perceivedArea,
      searchProbe: task.searchProbe,
      phase: "closed" as const,
      outcome: task.outcome,
      outcomeAtTick: task.outcomeAtTick,
      outcomeTransition: task.outcomeTransition,
      arrivalTransition: task.lastTransition,
      closedAtTick: transition.acceptedAtTick,
      lastTransition: transition,
    }),
  });
}

function taskPatch(
  assignment: SettlementWorkingAnimalAssignment,
  task: SettlementWorkingAnimalTask,
): TaskLifecycleAssignmentPatch {
  return deepFreeze({
    lastTaskOrdinal: assignment.lastTaskOrdinal,
    currentTask: deepFreeze(task),
    lastTaskOutcome: assignment.lastTaskOutcome,
  });
}

function taskStateIsCoherent(input: Readonly<{
  readonly assignmentId: string;
  readonly workerActorId: string;
  readonly handlerActorId: string;
  readonly worksiteId: string;
  readonly createdAtTick: number;
  readonly currentActivity: SettlementWorkingAnimalActivityTransaction;
  readonly lastTaskOrdinal: number;
  readonly lastResolvedTaskTransitionOrdinal: number;
  readonly currentTask: SettlementWorkingAnimalTask | null;
  readonly lastTaskOutcome: SettlementWorkingAnimalTaskOutcome | null;
  readonly pendingTaskTransition: SettlementWorkingAnimalTaskTransition | null;
}>): boolean {
  const {
    currentActivity,
    currentTask,
    lastTaskOutcome,
    pendingTaskTransition,
    lastTaskOrdinal,
    lastResolvedTaskTransitionOrdinal,
  } = input;
  if (lastTaskOrdinal === 0) {
    if (currentTask !== null || lastTaskOutcome !== null) return false;
  } else if (currentTask === null) {
    if (lastTaskOutcome?.taskOrdinal !== lastTaskOrdinal) return false;
  } else {
    if (currentTask.taskOrdinal !== lastTaskOrdinal) return false;
    if (
      (lastTaskOrdinal === 1 && lastTaskOutcome !== null)
      || (lastTaskOrdinal > 1 && lastTaskOutcome?.taskOrdinal !== lastTaskOrdinal - 1)
    ) return false;
    if (
      lastTaskOutcome !== null
      && (
        lastTaskOutcome.lastTransition.ordinal >= currentTask.lastTransition.ordinal
        || lastTaskOutcome.closedAtTick >= currentTask.openedAtTick
      )
    ) return false;
  }

  const latestResolvedTransition = currentTask?.lastTransition
    ?? lastTaskOutcome?.lastTransition
    ?? null;
  if (
    (latestResolvedTransition === null && lastResolvedTaskTransitionOrdinal !== 0)
    || (
      latestResolvedTransition !== null
      && latestResolvedTransition.ordinal !== lastResolvedTaskTransitionOrdinal
    )
  ) return false;
  if (pendingTaskTransition === null) return true;
  if (
    pendingTaskTransition.ordinal !== lastResolvedTaskTransitionOrdinal + 1
    || pendingTaskTransition.acceptedAtTick <= (latestResolvedTransition?.acceptedAtTick ?? -1)
  ) return false;

  if (pendingTaskTransition.transition === "open") {
    return currentTask === null
      && currentActivity.activity === "investigate"
      && (
        currentActivity.cause.kind === "perception"
        || currentActivity.cause.kind === "handler-report"
      )
      && currentActivity.perceivedArea !== null
      && pendingTaskTransition.taskOrdinal === lastTaskOrdinal + 1
      && pendingTaskTransition.sourceActivityTransactionId === currentActivity.transactionId
      && pendingTaskTransition.sourceObservationId === currentActivity.cause.referenceId
      && stableStringify(pendingTaskTransition.perceivedArea)
        === stableStringify(currentActivity.perceivedArea)
      && lastTaskOutcome?.sourceActivityTransactionId !== currentActivity.transactionId;
  }
  if (
    currentTask === null
    || pendingTaskTransition.taskId !== currentTask.taskId
    || pendingTaskTransition.taskOrdinal !== currentTask.taskOrdinal
  ) return false;
  if (pendingTaskTransition.transition === "suspend") {
    return currentTask.phase !== "awaiting-handler"
      && pendingTaskTransition.suspension !== null
      && stableStringify(pendingTaskTransition.suspension)
        !== stableStringify(currentTask.suspension);
  }
  if (pendingTaskTransition.transition === "resume") {
    return currentTask.phase !== "awaiting-handler" && currentTask.suspension !== null;
  }
  if (currentTask.suspension !== null) return false;
  if (pendingTaskTransition.transition === "complete") {
    return currentTask.phase === "investigating"
      && pendingTaskTransition.cause.kind === "probe"
      && pendingTaskTransition.cause.referenceId === currentTask.searchProbe.id;
  }
  if (pendingTaskTransition.transition === "cancel") {
    return currentTask.phase === "investigating";
  }
  if (pendingTaskTransition.transition === "arrive") {
    return currentTask.phase === "returning"
      && pendingTaskTransition.cause.kind === "worksite"
      && pendingTaskTransition.cause.referenceId === input.worksiteId;
  }
  return currentTask.phase === "awaiting-handler";
}

function returnAreaFromCanonicalAssignment(
  assignment: Pick<SettlementWorkingAnimalAssignment, "dutyArea">,
): ObservedArea {
  return deepFreeze({
    center: clonePosition(assignment.dutyArea.center),
    radiusUnits: SETTLEMENT_WORKING_ANIMAL_RETURN_RADIUS_UNITS,
  });
}

function positionInsideArea(position: WorldPosition, area: ObservedArea): boolean {
  const dx = (BigInt(position.region.x) - BigInt(area.center.region.x))
      * BigInt(REGION_WIDTH_UNITS)
    + BigInt(position.localX) - BigInt(area.center.localX);
  const dy = (BigInt(position.region.y) - BigInt(area.center.region.y))
      * BigInt(REGION_HEIGHT_UNITS)
    + BigInt(position.localY) - BigInt(area.center.localY);
  const radius = BigInt(area.radiusUnits);
  return dx * dx + dy * dy <= radius * radius;
}

function positionsEqual(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

type PriorSettlementWorkingAnimalAssignment = Omit<
  SettlementWorkingAnimalAssignment,
  | "version"
  | "lastTaskOrdinal"
  | "lastResolvedTaskTransitionOrdinal"
  | "currentTask"
  | "lastTaskOutcome"
  | "pendingTaskTransition"
> & Readonly<{ readonly version: typeof PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION }>;

interface PriorSettlementWorkingAnimalState {
  readonly version: typeof PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION;
  readonly ownerId: typeof PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID;
  readonly revision: number;
  readonly settlementId: number;
  readonly assignments: readonly PriorSettlementWorkingAnimalAssignment[];
}

function canonicalizePriorSettlementWorkingAnimalState(
  value: unknown,
): PriorSettlementWorkingAnimalState | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["assignments", "ownerId", "revision", "settlementId", "version"])
    || value.version !== PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION
    || value.ownerId !== PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID
    || !nonnegativeSafeInteger(value.revision)
    || !positiveSafeInteger(value.settlementId)
    || !Array.isArray(value.assignments)
    || value.assignments.length > SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS
  ) return null;
  const assignments: PriorSettlementWorkingAnimalAssignment[] = [];
  const assignmentIds = new Set<string>();
  const assignmentOrdinals = new Set<number>();
  const workerIds = new Set<string>();
  const workerCustodies = new Set<string>();
  const transactionIds = new Set<string>();
  let expectedRevision = 0;
  for (const raw of value.assignments) {
    const assignment = canonicalizePriorSettlementWorkingAnimalAssignment(raw);
    if (
      assignment === null
      || assignment.settlementId !== value.settlementId
      || assignmentIds.has(assignment.assignmentId)
      || assignmentOrdinals.has(assignment.assignmentOrdinal)
      || workerIds.has(assignment.workerActorId)
      || workerCustodies.has(assignment.workerCustodyRelationshipId)
      || transactionIds.has(assignment.currentActivity.transactionId)
      || (assignment.pendingActivity !== null
        && transactionIds.has(assignment.pendingActivity.transactionId))
    ) return null;
    assignmentIds.add(assignment.assignmentId);
    assignmentOrdinals.add(assignment.assignmentOrdinal);
    workerIds.add(assignment.workerActorId);
    workerCustodies.add(assignment.workerCustodyRelationshipId);
    transactionIds.add(assignment.currentActivity.transactionId);
    if (assignment.pendingActivity !== null) {
      transactionIds.add(assignment.pendingActivity.transactionId);
    }
    expectedRevision += assignment.lastResolvedActivityOrdinal * 2;
    if (assignment.pendingActivity !== null) expectedRevision += 1;
    if (!Number.isSafeInteger(expectedRevision)) return null;
    assignments.push(assignment);
  }
  assignments.sort(compareAssignments);
  if (expectedRevision !== value.revision) return null;
  return deepFreeze({
    version: PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION,
    ownerId: PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
    revision: value.revision,
    settlementId: value.settlementId,
    assignments,
  });
}

function canonicalizePriorSettlementWorkingAnimalAssignment(
  value: unknown,
): PriorSettlementWorkingAnimalAssignment | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "assignmentId",
      "assignmentOrdinal",
      "createdAtTick",
      "currentActivity",
      "dutyArea",
      "handlerActorId",
      "lastResolvedActivityOrdinal",
      "pendingActivity",
      "protectedCustodyRelationshipId",
      "protectedGroupId",
      "role",
      "settlementId",
      "workerActorId",
      "workerCustodyRelationshipId",
      "workerSpecies",
      "worksiteId",
      "version",
    ])
    || value.version !== PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION
  ) return null;
  const adopted = canonicalizeSettlementWorkingAnimalAssignment({
    ...value,
    version: SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
    lastTaskOrdinal: 0,
    lastResolvedTaskTransitionOrdinal: 0,
    currentTask: null,
    lastTaskOutcome: null,
    pendingTaskTransition: null,
  });
  if (adopted === null) return null;
  const {
    lastTaskOrdinal: _lastTaskOrdinal,
    lastResolvedTaskTransitionOrdinal: _lastResolvedTaskTransitionOrdinal,
    currentTask: _currentTask,
    lastTaskOutcome: _lastTaskOutcome,
    pendingTaskTransition: _pendingTaskTransition,
    ...prior
  } = adopted;
  return deepFreeze({
    ...prior,
    version: PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
  });
}

function rebuildState(
  state: SettlementWorkingAnimalState,
  changed: SettlementWorkingAnimalAssignment,
  revision: number,
): SettlementWorkingAnimalState | null {
  return canonicalizeSettlementWorkingAnimalState({
    ...state,
    revision,
    assignments: state.assignments.map((assignment) => (
      assignment.assignmentId === changed.assignmentId ? changed : assignment
    )),
  });
}

function compareAssignments(
  left: Pick<SettlementWorkingAnimalAssignment, "assignmentOrdinal" | "assignmentId">,
  right: Pick<SettlementWorkingAnimalAssignment, "assignmentOrdinal" | "assignmentId">,
): number {
  return left.assignmentOrdinal - right.assignmentOrdinal
    || compareText(left.assignmentId, right.assignmentId);
}

function canonicalArea(value: unknown, maximumRadius: number): ObservedArea | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["center", "radiusUnits"])
    || !isWorldPosition(value.center)
    || !nonnegativeSafeInteger(value.radiusUnits)
    || value.radiusUnits > maximumRadius
  ) return null;
  return deepFreeze({
    center: createWorldPosition(value.center.region, value.center.localX, value.center.localY),
    radiusUnits: value.radiusUnits,
  });
}

function cloneArea(area: ObservedArea): ObservedArea {
  const canonical = canonicalArea(area, 10_000_000);
  if (canonical === null) throw new Error("Accepted sensory area became malformed");
  return canonical;
}

function clonePosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(position.region, position.localX, position.localY);
}

/** Exact across the full signed segmented envelope; no distant Number flattening. */
function areasIntersect(left: SettlementWorkingAnimalDutyArea, right: ObservedArea): boolean {
  const dx = (BigInt(right.center.region.x) - BigInt(left.center.region.x))
      * BigInt(REGION_WIDTH_UNITS)
    + BigInt(right.center.localX) - BigInt(left.center.localX);
  const dy = (BigInt(right.center.region.y) - BigInt(left.center.region.y))
      * BigInt(REGION_HEIGHT_UNITS)
    + BigInt(right.center.localY) - BigInt(left.center.localY);
  const reach = BigInt(left.radiusUnits + right.radiusUnits);
  return dx * dx + dy * dy <= reach * reach;
}

function validCustodyRelationshipId(value: unknown): value is string {
  return typeof value === "string" && CUSTODY_RELATIONSHIP_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && (value as number) > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= 0;
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= ACTOR_PERCEPTION_SCALE;
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
