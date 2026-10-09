import {
  createWorldPosition,
  isWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "../game/worldPosition";
import { headingFromRadians } from "../game/livingActor";
import { ACTOR_ID_MAX_LENGTH } from "./actorPerception";
import { RESIDENT_STABLE_ID_PREFIX } from "./npcIdentity";
import type { ResidentState, ResourceKind } from "./types";
import { RESOURCE_KINDS } from "./types";

export const RESIDENT_ACTIVITY_VERSION = 1 as const;
export const RESIDENT_ACTIVITY_OWNER_ID = "sim:resident-activity:v1" as const;
/** The v1 rest/body protocol remains a deliberately supported cold format. */
export const RESIDENT_SERVICE_ACTIVITY_VERSION = 2 as const;
export const RESIDENT_SERVICE_ACTIVITY_OWNER_ID = "sim:resident-activity:v2" as const;
/** Frozen v1/v2 readers remain exact; v3 introduces enacted civic material use. */
export const RESIDENT_CIVIC_ACTIVITY_VERSION = 3 as const;
export const RESIDENT_CIVIC_ACTIVITY_OWNER_ID = "sim:resident-activity:v3" as const;
/** v4 introduces an evidence-bound approach to the separate physical store. */
export const RESIDENT_INSPECTION_ACTIVITY_VERSION = 4 as const;
export const RESIDENT_INSPECTION_ACTIVITY_OWNER_ID = "sim:resident-activity:v4" as const;
/** v5 introduces a rest hold caused by legitimately observed water. */
export const RESIDENT_ENVIRONMENT_ACTIVITY_VERSION = 5 as const;
export const RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID = "sim:resident-activity:v5" as const;
/** v6 binds physical origin approach to the existing accepted Promise. */
export const RESIDENT_PICKUP_ACTIVITY_VERSION = 6 as const;
export const RESIDENT_PICKUP_ACTIVITY_OWNER_ID = "sim:resident-activity:v6" as const;
/** Ten accepted 100ms steps form one existing civil-minute interval. */
export const RESIDENT_ACTIVITY_MAX_PHASE = 10 as const;
/** Ordinary human approach uses the current steady-walk distance, not sprint. */
export const RESIDENT_REST_APPROACH_STEP_UNITS = 105 as const;

export interface ResidentBodyPose {
  readonly position: WorldPosition;
  /** Shared fixed-point clockwise turn; independent of gaze. */
  readonly heading: number;
}

export type ResidentPhysicalWaitReason = "no-traversable-route" | "outside-local-corridor" | null;

export interface ResidentRestTask {
  readonly kind: "settlement-rest";
  readonly settlementId: number;
  readonly target: WorldPosition;
  readonly selectedAtTick: number;
  readonly cause: "clock-rest" | "urgent-rest" | "continued-admission";
  /** One already-admitted episode may continue at its original captured point. */
  readonly origin: "selected" | "continued-admitted-rest";
  /** Captured old geometric admission, not the changing current roster ordinal. */
  readonly legacySettlementOrdinal: number | null;
  readonly phase: "approaching" | "waiting" | "arrived";
  readonly lastProgressAtTick: number;
  readonly nextReassessmentAtTick: number;
  readonly waitReason: ResidentPhysicalWaitReason | "observed-water";
}

export interface ResidentRationTask {
  readonly kind: "settlement-ration";
  readonly settlementId: number;
  readonly target: WorldPosition;
  readonly selectedAtTick: number;
  readonly phase: "approaching" | "waiting" | "arrived" | "used";
  readonly lastProgressAtTick: number;
  readonly nextReassessmentAtTick: number;
  readonly waitReason: ResidentPhysicalWaitReason;
  /** One committed use, not reserved food or a replayable entitlement. */
  readonly usedAtTick: number | null;
  readonly foodUsed: boolean;
  readonly waterUsed: boolean;
}

export interface ResidentMaterialTask {
  readonly kind: "settlement-material";
  readonly settlementId: number;
  readonly projectId: number;
  readonly resource: ResourceKind;
  readonly target: WorldPosition;
  readonly selectedAtTick: number;
  readonly phase: "approaching" | "waiting" | "arrived" | "used";
  readonly lastProgressAtTick: number;
  readonly nextReassessmentAtTick: number;
  readonly waitReason: ResidentPhysicalWaitReason | "no-material";
  /** Exactly one committed unit at the hourly pulse; never portable stock. */
  readonly usedAtTick: number | null;
}

export interface ResidentInspectionTask {
  readonly kind: "settlement-inspection";
  readonly settlementId: number;
  readonly storeId: string;
  /** Retained keeper knowledge; the store owner authenticates this reference. */
  readonly sourceEvidenceId: string;
  readonly target: WorldPosition;
  readonly selectedAtTick: number;
  readonly phase: "approaching" | "waiting" | "arrived";
  readonly lastProgressAtTick: number;
  readonly nextReassessmentAtTick: number;
  readonly waitReason: ResidentPhysicalWaitReason;
}

export interface ResidentPickupTask {
  readonly kind: "contract-pickup";
  readonly contractId: number;
  readonly settlementId: number;
  readonly target: WorldPosition;
  readonly selectedAtTick: number;
  readonly phase: "approaching" | "waiting" | "arrived";
  readonly lastProgressAtTick: number;
  readonly nextReassessmentAtTick: number;
  readonly waitReason: ResidentPhysicalWaitReason | "no-stock" | "no-active-route";
}

/**
 * One optional resident-owned physical root, not a second actor population.
 * poses[0] is the interval anchor; poses[N] is the body after N accepted steps.
 * The last pose IS the current body: there is no duplicate saved position.
 * Phase10 is consumed in memory; ordinary runtime captures persist phases0–9.
 */
export interface ResidentActivity {
  readonly version: typeof RESIDENT_ACTIVITY_VERSION | typeof RESIDENT_SERVICE_ACTIVITY_VERSION | typeof RESIDENT_CIVIC_ACTIVITY_VERSION | typeof RESIDENT_INSPECTION_ACTIVITY_VERSION | typeof RESIDENT_ENVIRONMENT_ACTIVITY_VERSION | typeof RESIDENT_PICKUP_ACTIVITY_VERSION;
  readonly ownerId: typeof RESIDENT_ACTIVITY_OWNER_ID | typeof RESIDENT_SERVICE_ACTIVITY_OWNER_ID | typeof RESIDENT_CIVIC_ACTIVITY_OWNER_ID | typeof RESIDENT_INSPECTION_ACTIVITY_OWNER_ID | typeof RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID | typeof RESIDENT_PICKUP_ACTIVITY_OWNER_ID;
  readonly actorId: string;
  readonly tick: number;
  readonly poses: readonly ResidentBodyPose[];
  readonly restTask: ResidentRestTask | null;
  /** Absent only in the frozen v1 protocol; v2 requires an explicit null/task. */
  readonly rationTask?: ResidentRationTask | null;
  /** Absent in the frozen v1/v2 protocols; v3 requires explicit null/task. */
  readonly materialTask?: ResidentMaterialTask | null;
  /** Absent in frozen v1–v3; v4 requires explicit null/task, never a cached result. */
  readonly inspectionTask?: ResidentInspectionTask | null;
  /** Absent in frozen v1–v5; v6 requires explicit null/task, never cargo itself. */
  readonly pickupTask?: ResidentPickupTask | null;
}

/** Explicit recognized capabilities, never numeric acceptance of future versions. */
export function residentActivitySupportsRations(activity: Pick<ResidentActivity, "version"> | undefined | null): boolean {
  return activity?.version === RESIDENT_SERVICE_ACTIVITY_VERSION || residentActivitySupportsMaterials(activity);
}

/** Capability classification only; shape, custody and world validation stay binding. */
export function residentActivitySupportsMaterials(activity: Pick<ResidentActivity, "version"> | undefined | null): boolean {
  return activity?.version === RESIDENT_CIVIC_ACTIVITY_VERSION || residentActivitySupportsInspection(activity);
}

export function residentActivitySupportsInspection(activity: Pick<ResidentActivity, "version"> | undefined | null): boolean {
  return activity?.version === RESIDENT_INSPECTION_ACTIVITY_VERSION || residentActivitySupportsEnvironment(activity);
}

export function residentActivitySupportsEnvironment(activity: Pick<ResidentActivity, "version"> | undefined | null): boolean {
  return activity?.version === RESIDENT_ENVIRONMENT_ACTIVITY_VERSION || residentActivitySupportsPickup(activity);
}

export function residentActivitySupportsPickup(activity: Pick<ResidentActivity, "version"> | undefined | null): boolean {
  return activity?.version === RESIDENT_PICKUP_ACTIVITY_VERSION;
}

export interface ResidentActivityBinding {
  readonly actorId: string;
  readonly tick: number;
  /** Runtime capture supplies its independently accepted player-step phase. */
  readonly phase?: number;
}

const CANONICAL_ACTIVITIES = new WeakSet<object>();
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u;

/** Strict clone/load boundary; a malformed present record never means absent. */
export function canonicalizeResidentActivity(
  value: unknown,
  binding: ResidentActivityBinding,
): ResidentActivity | null {
  if (!validBinding(binding)) return null;
  if (value !== null && typeof value === "object" && CANONICAL_ACTIVITIES.has(value)) {
    const activity = value as ResidentActivity;
    return matchesBinding(activity, binding) ? activity : null;
  }
  if (!plainRecord(value)) return null;
  const versionField = Object.getOwnPropertyDescriptor(value, "version");
  if (versionField?.enumerable !== true || !Object.hasOwn(versionField, "value")) return null;
  const pickupCapable = value.version === RESIDENT_PICKUP_ACTIVITY_VERSION;
  const environmentCapable = value.version === RESIDENT_ENVIRONMENT_ACTIVITY_VERSION || pickupCapable;
  const inspectionCapable = value.version === RESIDENT_INSPECTION_ACTIVITY_VERSION || environmentCapable;
  const civicCapable = value.version === RESIDENT_CIVIC_ACTIVITY_VERSION || inspectionCapable;
  const serviceCapable = value.version === RESIDENT_SERVICE_ACTIVITY_VERSION || civicCapable;
  if (!exactKeys(value, [
    "actorId", "ownerId", "poses", "restTask", "tick", "version",
    ...(serviceCapable ? ["rationTask"] : []),
    ...(civicCapable ? ["materialTask"] : []),
    ...(inspectionCapable ? ["inspectionTask"] : []),
    ...(pickupCapable ? ["pickupTask"] : []),
  ]) || (pickupCapable ? value.ownerId !== RESIDENT_PICKUP_ACTIVITY_OWNER_ID
    : environmentCapable ? value.ownerId !== RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID
    : inspectionCapable ? value.ownerId !== RESIDENT_INSPECTION_ACTIVITY_OWNER_ID
    : civicCapable ? value.ownerId !== RESIDENT_CIVIC_ACTIVITY_OWNER_ID
    : serviceCapable ? value.ownerId !== RESIDENT_SERVICE_ACTIVITY_OWNER_ID
    : value.version !== RESIDENT_ACTIVITY_VERSION || value.ownerId !== RESIDENT_ACTIVITY_OWNER_ID)
    || !validActorId(value.actorId)
    || !nonnegativeInteger(value.tick)
    || value.actorId !== binding.actorId
    || value.tick !== binding.tick
    || !Array.isArray(value.poses)
    || Object.keys(value.poses).length !== value.poses.length
    || Object.getOwnPropertySymbols(value.poses).length !== 0
    || value.poses.length === 0
    || value.poses.length > RESIDENT_ACTIVITY_MAX_PHASE + 1
    || (binding.phase !== undefined && value.poses.length !== binding.phase + 1)
  ) return null;
  const poses: ResidentBodyPose[] = [];
  for (let phase = 0; phase < value.poses.length; phase += 1) {
    if (!Object.hasOwn(value.poses, phase)) return null;
    const pose = canonicalPose(value.poses[phase]);
    if (pose === null) return null;
    const prior = poses[phase - 1];
    if (prior !== undefined && !lawfulApproachDelta(prior, pose)) return null;
    poses.push(pose);
  }
  const restTask = canonicalRestTask(value.restTask, value.tick, environmentCapable);
  if (restTask === undefined) return null;
  const rationTask = serviceCapable ? canonicalRationTask(value.rationTask, value.tick) : null;
  const materialTask = civicCapable ? canonicalMaterialTask(value.materialTask, value.tick) : null;
  const inspectionTask = inspectionCapable ? canonicalInspectionTask(value.inspectionTask, value.tick) : null;
  const pickupTask = pickupCapable ? canonicalPickupTask(value.pickupTask, value.tick) : null;
  if (rationTask === undefined || materialTask === undefined || inspectionTask === undefined
    || pickupTask === undefined
    || [restTask, rationTask, materialTask, inspectionTask, pickupTask].filter((task) => task !== null).length > 1) return null;
  const body = poses[poses.length - 1]!;
  if (rationTask !== null && (rationTask.phase === "arrived" || rationTask.phase === "used")
    && !samePosition(body.position, rationTask.target)) return null;
  if (materialTask !== null && (materialTask.phase === "arrived" || materialTask.phase === "used")
    && !samePosition(body.position, materialTask.target)) return null;
  if (inspectionTask?.phase === "arrived" && !samePosition(body.position, inspectionTask.target)) return null;
  if (pickupTask?.phase === "arrived" && !samePosition(body.position, pickupTask.target)) return null;
  if (restTask !== null && (
    (restTask.phase === "arrived" && !samePosition(body.position, restTask.target))
    || (restTask.origin === "continued-admitted-rest" && poses.some((pose) => (
      !samePosition(pose.position, restTask.target)
    )))
  )) return null;
  const activity: ResidentActivity = Object.freeze({
    version: pickupCapable ? RESIDENT_PICKUP_ACTIVITY_VERSION : environmentCapable ? RESIDENT_ENVIRONMENT_ACTIVITY_VERSION : inspectionCapable ? RESIDENT_INSPECTION_ACTIVITY_VERSION : civicCapable ? RESIDENT_CIVIC_ACTIVITY_VERSION : serviceCapable ? RESIDENT_SERVICE_ACTIVITY_VERSION : RESIDENT_ACTIVITY_VERSION,
    ownerId: pickupCapable ? RESIDENT_PICKUP_ACTIVITY_OWNER_ID : environmentCapable ? RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID : inspectionCapable ? RESIDENT_INSPECTION_ACTIVITY_OWNER_ID : civicCapable ? RESIDENT_CIVIC_ACTIVITY_OWNER_ID : serviceCapable ? RESIDENT_SERVICE_ACTIVITY_OWNER_ID : RESIDENT_ACTIVITY_OWNER_ID,
    actorId: value.actorId,
    tick: value.tick,
    poses: Object.freeze(poses),
    restTask,
    ...(serviceCapable ? { rationTask } : {}),
    ...(civicCapable ? { materialTask } : {}),
    ...(inspectionCapable ? { inspectionTask } : {}),
    ...(pickupCapable ? { pickupTask } : {}),
  });
  CANONICAL_ACTIVITIES.add(activity);
  return activity;
}

/** The source/listener must request an actually retained event-time phase. */
export function residentActivityPoseAtPhase(
  value: unknown,
  binding: ResidentActivityBinding,
  phase: number,
): ResidentBodyPose | null {
  if (!nonnegativeInteger(phase) || phase > RESIDENT_ACTIVITY_MAX_PHASE) return null;
  return canonicalizeResidentActivity(value, binding)?.poses[phase] ?? null;
}

export function residentActivityCurrentPose(
  value: unknown,
  binding: ResidentActivityBinding,
): ResidentBodyPose | null {
  const activity = canonicalizeResidentActivity(value, binding);
  return activity?.poses[activity.poses.length - 1] ?? null;
}

/**
 * Local physical eligibility, shared by circadian admission and physiology.
 * The world owner separately authenticates settlement/target/support. An
 * intention or an arrived label without exact physical inclusion fails closed.
 */
export function residentActivityAtRestDestination(resident: unknown): boolean {
  if (!plainRecord(resident) || !plainRecord(resident.identity)
    || !plainRecord(resident.location) || resident.location.kind !== "settlement"
    || !positiveInteger(resident.location.settlementId)
    || resident.activeContractId !== null || !validActorId(resident.identity.stableId)
    || !plainRecord(resident.activity) || !nonnegativeInteger(resident.activity.tick)
  ) return false;
  const raw = resident.activity;
  if (!nonnegativeInteger(raw.tick)) return false;
  const activity = canonicalizeResidentActivity(raw, {
    actorId: resident.identity.stableId,
    tick: raw.tick,
  });
  const task = activity?.restTask;
  const body = activity?.poses[activity.poses.length - 1];
  if (activity === null || task === null || task === undefined || body === undefined
    || task.settlementId !== resident.location.settlementId
    || task.phase !== "arrived"
    || !samePosition(body.position, task.target)
  ) return false;
  // This finite compatibility continuation is not a portable refuge. Wake,
  // movement, a new task or commitment revokes it at the action owner.
  if (task.origin !== "continued-admitted-rest") return true;
  return plainRecord(resident.circadian) && resident.circadian.restDestinationArrived === true
    && plainRecord(resident.circadian.posture)
    && (resident.circadian.posture.state === "resting" || resident.circadian.posture.state === "asleep");
}

/** Immutable nested replacement; the caller must commit posture in that same transaction. */
export function replaceResidentActivity(
  resident: ResidentState,
  value: unknown,
): ResidentState {
  const raw = plainRecord(value) ? value : null;
  const activity = raw === null ? null : canonicalizeResidentActivity(raw, {
    actorId: resident.identity.stableId,
    tick: resident.perception.tick,
  });
  if (activity === null) throw new RangeError("Resident activity is malformed, foreign or mistimed");
  const task = activity.restTask ?? activity.rationTask ?? activity.materialTask ?? activity.inspectionTask ?? activity.pickupTask ?? null;
  if (task !== null && (
    resident.location.kind !== "settlement"
    || task.settlementId !== resident.location.settlementId
    || (task.kind === "contract-pickup" ? resident.activeContractId !== task.contractId : resident.activeContractId !== null)
  )) throw new RangeError("Resident task conflicts with membership or commitment");
  return { ...resident, activity };
}

function canonicalPose(value: unknown): ResidentBodyPose | null {
  if (!plainRecord(value) || !exactKeys(value, ["heading", "position"])
    || !isWorldPosition(value.position)
    || !nonnegativeInteger(value.heading) || value.heading >= 1_000_000
  ) return null;
  return Object.freeze({
    position: createWorldPosition(value.position.region, value.position.localX, value.position.localY),
    heading: value.heading,
  });
}

function lawfulApproachDelta(prior: ResidentBodyPose, current: ResidentBodyPose): boolean {
  try {
    const delta = worldPositionDelta(prior.position, current.position);
    if (Math.abs(delta.x) > RESIDENT_REST_APPROACH_STEP_UNITS
      || Math.abs(delta.y) > RESIDENT_REST_APPROACH_STEP_UNITS
      || delta.x * delta.x + delta.y * delta.y > RESIDENT_REST_APPROACH_STEP_UNITS ** 2
    ) return false;
    return delta.x === 0 && delta.y === 0
      ? current.heading === prior.heading
      : current.heading === headingFromRadians(Math.atan2(delta.y, delta.x));
  } catch {
    return false;
  }
}

function canonicalRestTask(value: unknown, tick: number, environmentCapable: boolean): ResidentRestTask | null | undefined {
  if (value === null) return null;
  if (!plainRecord(value) || !exactKeys(value, [
    "cause", "kind", "lastProgressAtTick", "legacySettlementOrdinal", "nextReassessmentAtTick", "origin",
    "phase", "selectedAtTick", "settlementId", "target", "waitReason",
  ]) || value.kind !== "settlement-rest"
    || !positiveInteger(value.settlementId)
    || !isWorldPosition(value.target)
    || !nonnegativeInteger(value.selectedAtTick) || value.selectedAtTick > tick
    || !nonnegativeInteger(value.lastProgressAtTick)
    || value.lastProgressAtTick < value.selectedAtTick || value.lastProgressAtTick > tick
    || !nonnegativeInteger(value.nextReassessmentAtTick)
    || value.nextReassessmentAtTick < value.selectedAtTick
    || !["clock-rest", "urgent-rest", "continued-admission"].includes(value.cause as string)
    || !["selected", "continued-admitted-rest"].includes(value.origin as string)
    || !["approaching", "waiting", "arrived"].includes(value.phase as string)
    || !(value.waitReason === null
      || value.waitReason === "no-traversable-route" || value.waitReason === "outside-local-corridor"
      || (environmentCapable && value.waitReason === "observed-water"))
    || (value.phase === "waiting") !== (value.waitReason !== null)
    || (value.origin === "continued-admitted-rest") !== (value.cause === "continued-admission")
    || (value.origin === "continued-admitted-rest"
      ? !nonnegativeInteger(value.legacySettlementOrdinal) || value.legacySettlementOrdinal >= 42
      : value.legacySettlementOrdinal !== null)
    || (value.origin === "continued-admitted-rest" && value.phase !== "arrived")
  ) return undefined;
  return Object.freeze({
    kind: "settlement-rest",
    settlementId: value.settlementId,
    target: createWorldPosition(value.target.region, value.target.localX, value.target.localY),
    selectedAtTick: value.selectedAtTick,
    cause: value.cause as ResidentRestTask["cause"],
    origin: value.origin as ResidentRestTask["origin"],
    legacySettlementOrdinal: value.legacySettlementOrdinal as number | null,
    phase: value.phase as ResidentRestTask["phase"],
    lastProgressAtTick: value.lastProgressAtTick,
    nextReassessmentAtTick: value.nextReassessmentAtTick,
    waitReason: value.waitReason as ResidentRestTask["waitReason"],
  });
}

function canonicalRationTask(value: unknown, tick: number): ResidentRationTask | null | undefined {
  if (value === null) return null;
  if (!plainRecord(value) || !exactKeys(value, [
    "foodUsed", "kind", "lastProgressAtTick", "nextReassessmentAtTick", "phase",
    "selectedAtTick", "settlementId", "target", "usedAtTick", "waitReason", "waterUsed",
  ]) || value.kind !== "settlement-ration" || !positiveInteger(value.settlementId)
    || !isWorldPosition(value.target)
    || !nonnegativeInteger(value.selectedAtTick) || value.selectedAtTick > tick
    || !nonnegativeInteger(value.lastProgressAtTick)
    || value.lastProgressAtTick < value.selectedAtTick || value.lastProgressAtTick > tick
    || !nonnegativeInteger(value.nextReassessmentAtTick)
    || value.nextReassessmentAtTick < value.selectedAtTick
    || !["approaching", "waiting", "arrived", "used"].includes(value.phase as string)
    || !(value.waitReason === null || value.waitReason === "no-traversable-route"
      || value.waitReason === "outside-local-corridor")
    || (value.phase === "waiting") !== (value.waitReason !== null)
    || typeof value.foodUsed !== "boolean" || typeof value.waterUsed !== "boolean"
    || (value.phase === "used"
      ? !nonnegativeInteger(value.usedAtTick) || value.usedAtTick % 60 !== 0
        || value.usedAtTick <= value.selectedAtTick || value.usedAtTick > tick
        || value.lastProgressAtTick !== value.usedAtTick || !(value.foodUsed || value.waterUsed)
      : value.usedAtTick !== null || value.foodUsed || value.waterUsed)
  ) return undefined;
  return Object.freeze({
    kind: "settlement-ration", settlementId: value.settlementId,
    target: createWorldPosition(value.target.region, value.target.localX, value.target.localY),
    selectedAtTick: value.selectedAtTick, phase: value.phase as ResidentRationTask["phase"],
    lastProgressAtTick: value.lastProgressAtTick, nextReassessmentAtTick: value.nextReassessmentAtTick,
    waitReason: value.waitReason as ResidentRationTask["waitReason"],
    usedAtTick: value.usedAtTick as number | null, foodUsed: value.foodUsed, waterUsed: value.waterUsed,
  });
}

function canonicalMaterialTask(value: unknown, tick: number): ResidentMaterialTask | null | undefined {
  if (value === null) return null;
  if (!plainRecord(value) || !exactKeys(value, [
    "kind", "lastProgressAtTick", "nextReassessmentAtTick", "phase", "projectId", "resource",
    "selectedAtTick", "settlementId", "target", "usedAtTick", "waitReason",
  ]) || value.kind !== "settlement-material" || !positiveInteger(value.settlementId)
    || !positiveInteger(value.projectId) || !RESOURCE_KINDS.includes(value.resource as ResourceKind)
    || !isWorldPosition(value.target)
    || !nonnegativeInteger(value.selectedAtTick) || value.selectedAtTick > tick
    || !nonnegativeInteger(value.lastProgressAtTick)
    || value.lastProgressAtTick < value.selectedAtTick || value.lastProgressAtTick > tick
    || !nonnegativeInteger(value.nextReassessmentAtTick) || value.nextReassessmentAtTick < value.selectedAtTick
    || !["approaching", "waiting", "arrived", "used"].includes(value.phase as string)
    || !(value.waitReason === null || value.waitReason === "no-traversable-route"
      || value.waitReason === "outside-local-corridor" || value.waitReason === "no-material")
    || (value.phase === "waiting") !== (value.waitReason !== null)
    || (value.phase === "used"
      ? !nonnegativeInteger(value.usedAtTick) || value.usedAtTick % 60 !== 0
        || value.usedAtTick <= value.selectedAtTick || value.usedAtTick > tick
        || value.lastProgressAtTick !== value.usedAtTick
      : value.usedAtTick !== null)
  ) return undefined;
  return Object.freeze({
    kind: "settlement-material", settlementId: value.settlementId, projectId: value.projectId,
    resource: value.resource as ResourceKind,
    target: createWorldPosition(value.target.region, value.target.localX, value.target.localY),
    selectedAtTick: value.selectedAtTick, phase: value.phase as ResidentMaterialTask["phase"],
    lastProgressAtTick: value.lastProgressAtTick, nextReassessmentAtTick: value.nextReassessmentAtTick,
    waitReason: value.waitReason as ResidentMaterialTask["waitReason"], usedAtTick: value.usedAtTick as number | null,
  });
}

function canonicalInspectionTask(value: unknown, tick: number): ResidentInspectionTask | null | undefined {
  if (value === null) return null;
  if (!plainRecord(value) || !exactKeys(value, [
    "kind", "lastProgressAtTick", "nextReassessmentAtTick", "phase", "selectedAtTick",
    "settlementId", "sourceEvidenceId", "storeId", "target", "waitReason",
  ]) || value.kind !== "settlement-inspection" || !positiveInteger(value.settlementId)
    || !validReferenceId(value.storeId) || !validReferenceId(value.sourceEvidenceId)
    || !isWorldPosition(value.target)
    || !nonnegativeInteger(value.selectedAtTick) || value.selectedAtTick > tick
    || !nonnegativeInteger(value.lastProgressAtTick)
    || value.lastProgressAtTick < value.selectedAtTick || value.lastProgressAtTick > tick
    || !nonnegativeInteger(value.nextReassessmentAtTick) || value.nextReassessmentAtTick < value.selectedAtTick
    || !["approaching", "waiting", "arrived"].includes(value.phase as string)
    || !(value.waitReason === null || value.waitReason === "no-traversable-route"
      || value.waitReason === "outside-local-corridor")
    || (value.phase === "waiting") !== (value.waitReason !== null)
  ) return undefined;
  return Object.freeze({
    kind: "settlement-inspection", settlementId: value.settlementId, storeId: value.storeId,
    sourceEvidenceId: value.sourceEvidenceId,
    target: createWorldPosition(value.target.region, value.target.localX, value.target.localY),
    selectedAtTick: value.selectedAtTick, phase: value.phase as ResidentInspectionTask["phase"],
    lastProgressAtTick: value.lastProgressAtTick, nextReassessmentAtTick: value.nextReassessmentAtTick,
    waitReason: value.waitReason as ResidentInspectionTask["waitReason"],
  });
}

function canonicalPickupTask(value: unknown, tick: number): ResidentPickupTask | null | undefined {
  if (value === null) return null;
  if (!plainRecord(value) || !exactKeys(value, [
    "contractId", "kind", "lastProgressAtTick", "nextReassessmentAtTick", "phase",
    "selectedAtTick", "settlementId", "target", "waitReason",
  ]) || value.kind !== "contract-pickup" || !positiveInteger(value.contractId)
    || !positiveInteger(value.settlementId) || !isWorldPosition(value.target)
    || !nonnegativeInteger(value.selectedAtTick) || value.selectedAtTick > tick
    || !nonnegativeInteger(value.lastProgressAtTick)
    || value.lastProgressAtTick < value.selectedAtTick || value.lastProgressAtTick > tick
    || !nonnegativeInteger(value.nextReassessmentAtTick) || value.nextReassessmentAtTick < value.selectedAtTick
    || !["approaching", "waiting", "arrived"].includes(value.phase as string)
    || !(value.waitReason === null || value.waitReason === "no-traversable-route"
      || value.waitReason === "outside-local-corridor" || value.waitReason === "no-stock"
      || value.waitReason === "no-active-route")
    || (value.phase === "waiting") !== (value.waitReason !== null)
  ) return undefined;
  return Object.freeze({
    kind: "contract-pickup", contractId: value.contractId, settlementId: value.settlementId,
    target: createWorldPosition(value.target.region, value.target.localX, value.target.localY),
    selectedAtTick: value.selectedAtTick, phase: value.phase as ResidentPickupTask["phase"],
    lastProgressAtTick: value.lastProgressAtTick, nextReassessmentAtTick: value.nextReassessmentAtTick,
    waitReason: value.waitReason as ResidentPickupTask["waitReason"],
  });
}

function validReferenceId(value: unknown): value is string {
  return typeof value === "string" && value.length <= ACTOR_ID_MAX_LENGTH && ID_PATTERN.test(value);
}

function matchesBinding(activity: ResidentActivity, binding: ResidentActivityBinding): boolean {
  return activity.actorId === binding.actorId && activity.tick === binding.tick
    && (binding.phase === undefined || activity.poses.length === binding.phase + 1);
}

function validBinding(binding: unknown): binding is ResidentActivityBinding {
  return plainRecord(binding)
    && (exactKeys(binding, ["actorId", "tick"])
      || exactKeys(binding, ["actorId", "phase", "tick"]))
    && validActorId(binding.actorId) && nonnegativeInteger(binding.tick)
    && (!Object.hasOwn(binding, "phase")
      || (nonnegativeInteger(binding.phase) && binding.phase <= RESIDENT_ACTIVITY_MAX_PHASE));
}

function validActorId(value: unknown): value is string {
  return typeof value === "string" && value.length <= ACTOR_ID_MAX_LENGTH
    && value.startsWith(RESIDENT_STABLE_ID_PREFIX) && ID_PATTERN.test(value);
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x && left.region.y === right.region.y
    && left.localX === right.localX && left.localY === right.localY;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveInteger(value: unknown): value is number {
  return nonnegativeInteger(value) && value > 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && expected.every((key) => (
    Object.hasOwn(value, key) && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value")
  ));
}
