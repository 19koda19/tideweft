import type { LivingActorInteractionWindow } from "../game/livingActorSimulation";
import { worldPositionDelta, WORLD_POSITION_UNITS_PER_TILE, type SpatialFrame } from "../game/worldPosition";
import {
  RESIDENT_ACTIVITY_MAX_PHASE,
  RESIDENT_REST_APPROACH_STEP_UNITS,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  residentActivitySupportsTravelEnvironment,
  type ResidentActivity,
  type ResidentBodyPose,
  type ResidentPhysicalTravelTask,
} from "./residentActivity";
import { canonicalResidentActivityForWorld, residentTravelContractBinding } from "./residentActivityWorld";
import { promiseCargoPropertyForResource, promiseCargoUnitLoadMilli } from "./cargoEnvironment";
import {
  advanceResidentTravelWaypoint,
  residentTravelInteractionFrame,
  residentTravelLocation,
  residentTravelSegment,
  residentTravelSegmentOffset,
  residentTravelSegmentPose,
  residentTravelWindowInterval,
} from "./residentTravelRoute";
import { RESOURCE_KINDS, type ContractState, type ResidentLocation, type ResidentState, type WorldState } from "./types";
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
  readonly contracts: WorldState["contracts"];
  readonly cargoInputs: readonly CapturedCargoInput[];
  readonly admission: ResidentTravelAdvanceAdmission;
}

interface CapturedCargoInput {
  readonly source: ContractState;
  readonly index: number;
  readonly id: number;
  readonly resource: ContractState["resource"];
  readonly quantity: number;
  readonly cargoQuantity: number;
  readonly status: ContractState["status"];
  readonly carrierKind: ContractState["carrierKind"];
  readonly assignedResidentId: ContractState["assignedResidentId"];
}

const PREPARED = new WeakMap<PreparedResidentTravelAdvance, Custody>();

// The existing player burden curve reduces steady speed by at most312/1000.
// Reuse that bounded ceiling, not the player's pack capacity or equipment.
const MAX_CARRIED_STEP_PENALTY = Math.floor(RESIDENT_REST_APPROACH_STEP_UNITS * 312 / 1_000);

/**
 * Future current travel work: one distance unit per rounded-up cargo load unit,
 * bounded by the existing steady-walk burden ceiling. This is no capacity claim.
 * Frozen v7 intervals keep their old allowance until genuine v8 adoption.
 */
export function residentTravelStepUnits(
  activity: Pick<ResidentActivity, "version">,
  contract: Pick<ContractState, "resource" | "cargoQuantity">,
): number | null {
  if (activity.version === RESIDENT_TRAVEL_ACTIVITY_VERSION) return RESIDENT_REST_APPROACH_STEP_UNITS;
  if (!residentActivitySupportsTravelEnvironment(activity)) return null;
  if (!Number.isSafeInteger(contract.cargoQuantity) || contract.cargoQuantity <= 0
    || !RESOURCE_KINDS.includes(contract.resource)) return null;
  // Aggregate transit has a larger quantity domain than loose parcels. Exact
  // multiplication must precede saturation; never clamp conserved quantity.
  const load = BigInt(contract.cargoQuantity)
    * BigInt(promiseCargoUnitLoadMilli(promiseCargoPropertyForResource(contract.resource)));
  const loadUnits = (load + 999n) / 1_000n;
  const penalty = Number(loadUnits < BigInt(MAX_CARRIED_STEP_PENALTY)
    ? loadUnits : BigInt(MAX_CARRIED_STEP_PENALTY));
  return RESIDENT_REST_APPROACH_STEP_UNITS - penalty;
}

/** Already accepted work retains the unchanged supported-history ceiling. */
export function residentTravelIntervalWorkUsed(poses: readonly ResidentBodyPose[]): number | null {
  if (poses.length < 1 || poses.length > RESIDENT_ACTIVITY_MAX_PHASE + 1) return null;
  let used = 0;
  try {
    for (let phase = 1; phase < poses.length; phase += 1) {
      const delta = worldPositionDelta(poses[phase - 1]!.position, poses[phase]!.position);
      used += Math.ceil(Math.hypot(delta.x, delta.y));
    }
  } catch {
    return null;
  }
  return Number.isSafeInteger(used) && used <= RESIDENT_REST_APPROACH_STEP_UNITS * RESIDENT_ACTIVITY_MAX_PHASE
    ? used : null;
}

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
  const cargoInputs: CapturedCargoInput[] = [];
  for (const resident of world.residents) {
    const activity = canonicalResidentActivityForWorld(world, resident);
    if (activity === null || activity.poses.length !== RESIDENT_ACTIVITY_MAX_PHASE + 1) return null;
    let used = 0;
    let stepUnits: number = RESIDENT_REST_APPROACH_STEP_UNITS;
    if (activity.travelTask?.mode === "physical") {
      const acceptedWork = residentTravelIntervalWorkUsed(activity.poses);
      if (acceptedWork === null) return null;
      used = acceptedWork;
      if (residentActivitySupportsTravelEnvironment(activity)) {
        const contract = residentTravelContractBinding(world, resident);
        const allowance = contract === null ? null : residentTravelStepUnits(activity, contract);
        if (contract === null || allowance === null) return null;
        stepUnits = allowance;
        cargoInputs.push(Object.freeze({ source: contract, index: world.contracts.indexOf(contract),
          id: contract.id, resource: contract.resource, quantity: contract.quantity,
          cargoQuantity: contract.cargoQuantity, status: contract.status,
          carrierKind: contract.carrierKind, assignedResidentId: contract.assignedResidentId }));
      }
    }
    // Old current prefixes can exceed today's smaller quota. Keep their paid
    // history and grant no extra work; they are not malformed or resettable.
    remainingUnitsByActor.set(resident.identity.stableId, Math.max(0, stepUnits * RESIDENT_ACTIVITY_MAX_PHASE - used));
  }
  const prepared = Object.freeze({ sourceTick: world.meta.completedTick, targetTick: world.meta.completedTick + 1 });
  PREPARED.set(prepared, {
    world, residents: world.residents, sources: [...world.residents],
    activities: world.residents.map(({ activity }) => activity),
    contracts: world.contracts, cargoInputs: Object.freeze(cargoInputs),
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
    || (custody.cargoInputs.length > 0 && (custody.contracts !== world.contracts
      || custody.cargoInputs.some((input) => world.contracts[input.index] !== input.source
        || input.source.id !== input.id || input.source.resource !== input.resource
        || input.source.quantity !== input.quantity || input.source.cargoQuantity !== input.cargoQuantity
        || input.source.status !== input.status || input.source.carrierKind !== input.carrierKind
        || input.source.assignedResidentId !== input.assignedResidentId)))
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
