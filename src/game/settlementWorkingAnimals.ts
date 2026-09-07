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

/**
 * Persisted relationship-and-work authority for settlement animals.
 *
 * This owner never owns an actor body, cognition, locomotion, livestock group,
 * item, or hidden world target. It records only stable work relationships and
 * activity accepted from already-lawful actor cognition. New species compose
 * through the same role policy rather than receiving a private AI brain.
 */
export const SETTLEMENT_WORKING_ANIMALS_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMAL_ACTIVITY_VERSION = 1 as const;
export const SETTLEMENT_WORKING_ANIMALS_OWNER_ID =
  "game:settlement-working-animals:v1" as const;
export const SETTLEMENT_WORKING_ANIMALS_MAX_ASSIGNMENTS = 8 as const;
export const SETTLEMENT_WORKING_ANIMALS_MAX_SERIALIZED_BYTES = 32 * 1_024;
// State retains only the current/pending transition. Keep the ordinal inside
// the paired revision budget without imposing a play-length-sized terminal.
export const SETTLEMENT_WORKING_ANIMAL_MAX_ACTIVITY_ORDINAL =
  Math.floor(Number.MAX_SAFE_INTEGER / 2);
export const SETTLEMENT_WORKING_ANIMAL_MAX_DUTY_RADIUS_UNITS =
  64 * WORLD_POSITION_UNITS_PER_TILE;
export const SETTLEMENT_WORKING_ANIMAL_SURVIVAL_OVERRIDE_THRESHOLD = 700_000 as const;
export const SETTLEMENT_WORKING_ANIMAL_GUARDIAN_SIGNAL_THRESHOLD = 180_000 as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._\/-]{0,191}$/u;
const CUSTODY_RELATIONSHIP_PATTERN = /^DOMESTIC-REL-[0-9a-f]{16}$/u;
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

const ROLES = new Set<string>(SETTLEMENT_WORKING_ANIMAL_ROLES);
const ACTIVITIES = new Set<string>(SETTLEMENT_WORKING_ANIMAL_ACTIVITIES);
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
  });
  if (assignment === null) throw new Error("Derived working-animal assignment failed validation");
  return assignment;
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
    ) return null;
    ordinals.add(assignment.assignmentOrdinal);
    assignmentIds.add(assignment.assignmentId);
    workerActorIds.add(assignment.workerActorId);
    workerCustodies.add(assignment.workerCustodyRelationshipId);
    activityTransactionIds.add(assignment.currentActivity.transactionId);
    if (assignment.pendingActivity !== null) {
      activityTransactionIds.add(assignment.pendingActivity.transactionId);
    }
    assignments.push(assignment);
  }
  assignments.sort(compareAssignments);

  let expectedRevision = 0;
  for (const assignment of assignments) {
    expectedRevision += assignment.lastResolvedActivityOrdinal * 2;
    if (assignment.pendingActivity !== null) expectedRevision += 1;
    if (!Number.isSafeInteger(expectedRevision)) return null;
  }
  if (value.revision !== expectedRevision) return null;

  return deepFreeze({
    version: SETTLEMENT_WORKING_ANIMALS_VERSION,
    ownerId: SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
    revision: value.revision,
    settlementId: value.settlementId,
    assignments,
  });
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
  if (
    currentActivity === null
    || (value.pendingActivity !== null && pendingActivity === null)
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
    identityVersion: SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
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

function activityCauseIsCoherent(
  activity: SettlementWorkingAnimalActivity,
  cause: SettlementWorkingAnimalActivityCause,
  area: ObservedArea | null,
  assignmentId: string,
): boolean {
  if (activity === "investigate") return cause.kind === "perception" && area !== null;
  if (activity === "survival-override") return cause.kind === "welfare" && area === null;
  if (activity === "defer-to-actor") {
    return cause.kind === "actor-disposition" && area === null;
  }
  return cause.kind === "assignment"
    && cause.referenceId === assignmentId
    && area === null;
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
