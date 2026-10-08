import {
  createWorldPosition,
  isWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "../game/worldPosition";
import { headingFromRadians } from "../game/livingActor";
import { ACTOR_ID_MAX_LENGTH } from "./actorPerception";
import { RESIDENT_STABLE_ID_PREFIX } from "./npcIdentity";
import type { ResidentState } from "./types";

export const RESIDENT_ACTIVITY_VERSION = 1 as const;
export const RESIDENT_ACTIVITY_OWNER_ID = "sim:resident-activity:v1" as const;
/** Ten accepted 100ms steps form one existing civil-minute interval. */
export const RESIDENT_ACTIVITY_MAX_PHASE = 10 as const;
/** Ordinary human approach uses the current steady-walk distance, not sprint. */
export const RESIDENT_REST_APPROACH_STEP_UNITS = 105 as const;

export interface ResidentBodyPose {
  readonly position: WorldPosition;
  /** Shared fixed-point clockwise turn; independent of gaze. */
  readonly heading: number;
}

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
  readonly waitReason: "no-traversable-route" | "outside-local-corridor" | null;
}

/**
 * One optional resident-owned physical root, not a second actor population.
 * poses[0] is the interval anchor; poses[N] is the body after N accepted steps.
 * The last pose IS the current body: there is no duplicate saved position.
 * Phase10 is consumed in memory; ordinary runtime captures persist phases0–9.
 */
export interface ResidentActivity {
  readonly version: typeof RESIDENT_ACTIVITY_VERSION;
  readonly ownerId: typeof RESIDENT_ACTIVITY_OWNER_ID;
  readonly actorId: string;
  readonly tick: number;
  readonly poses: readonly ResidentBodyPose[];
  readonly restTask: ResidentRestTask | null;
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
  if (!plainRecord(value) || !exactKeys(value, [
    "actorId", "ownerId", "poses", "restTask", "tick", "version",
  ]) || value.version !== RESIDENT_ACTIVITY_VERSION
    || value.ownerId !== RESIDENT_ACTIVITY_OWNER_ID
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
  const restTask = canonicalRestTask(value.restTask, value.tick);
  if (restTask === undefined) return null;
  const body = poses[poses.length - 1]!;
  if (restTask !== null && (
    (restTask.phase === "arrived" && !samePosition(body.position, restTask.target))
    || (restTask.origin === "continued-admitted-rest" && poses.some((pose) => (
      !samePosition(pose.position, restTask.target)
    )))
  )) return null;
  const activity: ResidentActivity = Object.freeze({
    version: RESIDENT_ACTIVITY_VERSION,
    ownerId: RESIDENT_ACTIVITY_OWNER_ID,
    actorId: value.actorId,
    tick: value.tick,
    poses: Object.freeze(poses),
    restTask,
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
  if (activity.restTask !== null && (
    resident.location.kind !== "settlement"
    || activity.restTask.settlementId !== resident.location.settlementId
    || resident.activeContractId !== null
  )) throw new RangeError("Resident rest task conflicts with membership or commitment");
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

function canonicalRestTask(value: unknown, tick: number): ResidentRestTask | null | undefined {
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
      || value.waitReason === "no-traversable-route" || value.waitReason === "outside-local-corridor")
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
