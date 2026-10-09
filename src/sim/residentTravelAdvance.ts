import type { LivingActorInteractionWindow } from "../game/livingActorSimulation";
import { worldPositionDelta, WORLD_POSITION_UNITS_PER_TILE, type SpatialFrame } from "../game/worldPosition";
import {
  RESIDENT_ACTIVITY_MAX_PHASE,
  RESIDENT_REST_APPROACH_STEP_UNITS,
  type ResidentBodyPose,
  type ResidentPhysicalTravelTask,
} from "./residentActivity";
import { canonicalResidentActivityForWorld } from "./residentActivityWorld";
import {
  advanceResidentTravelWaypoint,
  residentTravelInteractionFrame,
  residentTravelLocation,
  residentTravelSegment,
  residentTravelSegmentOffset,
  residentTravelSegmentPose,
  residentTravelWindowInterval,
} from "./residentTravelRoute";
import type { ContractState, ResidentLocation, ResidentState, WorldState } from "./types";
import { routeIsActive } from "./network";

export interface PreparedResidentTravelAdvance {
  readonly sourceTick: number;
  readonly targetTick: number;
}

export interface ResidentTravelAdvanceAdmission {
  readonly frame: SpatialFrame | null;
  readonly remainingUnitsByActor: ReadonlyMap<string, number>;
}

interface Custody {
  readonly world: WorldState;
  readonly residents: WorldState["residents"];
  readonly sources: readonly ResidentState[];
  readonly activities: readonly ResidentState["activity"][];
  readonly admission: ResidentTravelAdvanceAdmission;
}

const PREPARED = new WeakMap<PreparedResidentTravelAdvance, Custody>();

/**
 * Narrow accountable route continuation, NOT generic offscreen actor movement.
 * Capture the actual local window and subtract already committed fine work at
 * the closing interval. Local+macro work cannot spend two movement budgets.
 */
export function prepareResidentTravelAdvance(
  world: WorldState,
  window: LivingActorInteractionWindow | null,
): PreparedResidentTravelAdvance | null {
  const frame = window === null ? null : residentTravelInteractionFrame(window);
  if (window !== null && frame === null) return null;
  const remainingUnitsByActor = new Map<string, number>();
  for (const resident of world.residents) {
    const activity = canonicalResidentActivityForWorld(world, resident);
    if (activity === null || activity.poses.length !== RESIDENT_ACTIVITY_MAX_PHASE + 1) return null;
    let used = 0;
    if (activity.travelTask?.mode === "physical") {
      for (let phase = 1; phase < activity.poses.length; phase += 1) {
        const delta = worldPositionDelta(activity.poses[phase - 1]!.position, activity.poses[phase]!.position);
        used += Math.ceil(Math.hypot(delta.x, delta.y));
      }
    }
    const limit = RESIDENT_REST_APPROACH_STEP_UNITS * RESIDENT_ACTIVITY_MAX_PHASE;
    if (used > limit) return null;
    remainingUnitsByActor.set(resident.identity.stableId, limit - used);
  }
  const prepared = Object.freeze({ sourceTick: world.meta.completedTick, targetTick: world.meta.completedTick + 1 });
  PREPARED.set(prepared, {
    world, residents: world.residents, sources: [...world.residents],
    activities: world.residents.map(({ activity }) => activity),
    admission: Object.freeze({ frame, remainingUnitsByActor }),
  });
  return prepared;
}

/** Consume before commands replace source slots, independently per GREET candidate. */
export function consumeResidentTravelAdvance(
  world: WorldState, prepared: PreparedResidentTravelAdvance,
): ResidentTravelAdvanceAdmission {
  const custody = PREPARED.get(prepared);
  PREPARED.delete(prepared);
  if (custody === undefined || custody.world !== world || custody.residents !== world.residents
    || custody.sources.length !== world.residents.length
    || custody.sources.some((resident, index) => resident !== world.residents[index])
    || custody.activities.some((activity, index) => activity !== world.residents[index]?.activity)
    || prepared.sourceTick !== world.meta.completedTick || prepared.targetTick !== world.meta.completedTick + 1) {
    throw new RangeError("Resident travel admission is stale, foreign or already consumed");
  }
  return custody.admission;
}

export function revokeResidentTravelAdvance(prepared: PreparedResidentTravelAdvance): void {
  PREPARED.delete(prepared);
}

export interface ResidentMacroTravelResult {
  readonly pose: ResidentBodyPose;
  readonly task: ResidentPhysicalTravelTask;
  readonly location: ResidentLocation;
  readonly advancedUnits: number;
}

/**
 * Spend remaining distance only on ordered route portions outside the actual
 * local window. No terrain sensing, pathfinding, encounter, sound or knowledge
 * is created here. Each entered route retains network eligibility; the caller
 * owns weather/awake authority.
 */
export function advanceResidentMacroTravel(
  world: WorldState, contract: ContractState, initialTask: ResidentPhysicalTravelTask,
  initialPose: ResidentBodyPose, frame: SpatialFrame | null, maximumUnits: number, tick: number,
): ResidentMacroTravelResult | null {
  if (!Number.isSafeInteger(maximumUnits) || maximumUnits < 0
    || maximumUnits > RESIDENT_REST_APPROACH_STEP_UNITS * RESIDENT_ACTIVITY_MAX_PHASE) return null;
  let pose = initialPose;
  let task = initialTask;
  let remaining = maximumUnits;
  let advancedUnits = 0;
  // Each edge is 1000 units, with at most one first-excluded unit at a handoff.
  // Cursor-only joins cost no distance but are strictly bounded by the budget.
  for (let visits = 0; visits < 2 * RESIDENT_ACTIVITY_MAX_PHASE + 2; visits += 1) {
    const segment = residentTravelSegment(world, contract, task);
    const offset = segment === null ? null : residentTravelSegmentOffset(segment, pose.position);
    if (segment === null || offset === null) return null;
    const location = residentTravelLocation(segment, task, pose.position);
    if (location === null) return null;
    // Network availability cannot overwrite a retained knowledge gate. Only
    // the local informed reassessment owner can clear this reason.
    if (task.phase === "waiting" && task.waitReason === "observed-water") {
      return Object.freeze({ pose, task, location, advancedUnits });
    }
    if (task.phase !== "arrived" && !routeIsActive(segment.route)) {
      task = { ...task, phase: "waiting", waitReason: "no-active-route", nextReassessmentAtTick: tick + 1 };
      return Object.freeze({ pose, task, location, advancedUnits });
    }
    if (task.phase === "arrived" || remaining === 0 || (task.phase === "waiting"
      && task.waitReason !== "outside-local-corridor")) return Object.freeze({ pose, task, location, advancedUnits });
    const span = frame === null ? null : residentTravelWindowInterval(frame, segment);
    let distance = WORLD_POSITION_UNITS_PER_TILE - offset;
    if (span !== null && offset <= span.last) {
      if (offset < span.first) distance = Math.min(distance, span.first - offset);
      else if (offset < span.last || span.last === WORLD_POSITION_UNITS_PER_TILE) return Object.freeze({ pose, task, location, advancedUnits });
      else distance = Math.min(distance, 1); // exact paid local→coarse transfer
    }
    distance = Math.min(distance, remaining);
    if (distance === 0) return null; // unnormalized cursor, never invent progress
    pose = residentTravelSegmentPose(segment, offset + distance);
    remaining -= distance;
    advancedUnits += distance;
    task = { ...task, phase: "approaching", waitReason: null, lastProgressAtTick: tick, nextReassessmentAtTick: tick };
    const next = advanceResidentTravelWaypoint(world, contract, task, pose.position, tick);
    if (next === null) return null;
    task = next;
    // Stop at the first included point even when both route endpoints are out.
    if (span !== null && offset < span.first && offset + distance === span.first) {
      const nextSegment = residentTravelSegment(world, contract, task);
      const nextLocation = nextSegment === null ? null : residentTravelLocation(nextSegment, task, pose.position);
      return nextLocation === null ? null : Object.freeze({ pose, task, location: nextLocation, advancedUnits });
    }
  }
  return null;
}
