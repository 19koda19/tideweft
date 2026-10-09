import {
  canonicalizeResidentCircadianState,
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  replaceResidentCircadian,
  residentAtSettlementRestDestination,
  residentSettlementRestNetworkId,
  type LivingCircadianPersistentState,
} from "../sim/livingCircadian";
import {
  canonicalizeResidentActivity,
  replaceResidentActivity,
  RESIDENT_ACTIVITY_MAX_PHASE,
  RESIDENT_CIVIC_ACTIVITY_OWNER_ID,
  RESIDENT_CIVIC_ACTIVITY_VERSION,
  RESIDENT_INSPECTION_ACTIVITY_OWNER_ID,
  RESIDENT_INSPECTION_ACTIVITY_VERSION,
  RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID,
  RESIDENT_ENVIRONMENT_ACTIVITY_VERSION,
  RESIDENT_PICKUP_ACTIVITY_OWNER_ID,
  RESIDENT_PICKUP_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  residentActivitySupportsTravel,
  residentActivitySupportsTravelEnvironment,
  residentActivitySupportsEnvironment,
  residentActivitySupportsInspection,
  residentActivitySupportsMaterials,
  residentActivitySupportsRations,
  residentActivitySupportsPickup,
  RESIDENT_REST_APPROACH_STEP_UNITS,
  type ResidentBodyPose,
  type ResidentRestTask,
  type ResidentRationTask,
  type ResidentMaterialTask,
  type ResidentInspectionTask,
  type ResidentPickupTask,
  type ResidentPhysicalWaitReason,
  type ResidentPhysicalTravelTask,
} from "../sim/residentActivity";
import {
  canonicalResidentActivityForWorld,
  residentRestTargetHasDrySupport,
  residentSettlementRestTarget,
  residentSettlementRationTarget,
  residentSettlementMaterialProject,
  residentAcceptedPickupBinding,
  residentTravelContractBinding,
} from "../sim/residentActivityWorld";
import {
  advanceResidentTravelWaypoint, residentTravelBodyIsLocal, residentTravelInteractionFrame,
  residentTravelLocation, residentTravelSegment, residentTravelSegmentOffset,
  residentTravelSegmentPose, residentTravelWindowInterval,
} from "../sim/residentTravelRoute";
import { residentTravelIntervalWorkUsed, residentTravelStepUnits } from "../sim/residentTravelAdvance";
import { TERRAIN_DRAG_PERMILLE } from "./footing";
import type { LivingActorInteractionWindow } from "./livingActorSimulation";
import { residentRationPriorityEligible } from "../sim/residentRationUse";
import { residentMaterialPriorityEligible } from "../sim/residentMaterialUse";
import { routeIsActive } from "../sim/network";
import { projectLivingCircadianClockPreference, residentCircadianUrgentPreference } from "../sim/livingCircadian";
import { residentServicePriorityAvailable } from "../sim/residentRationUse";
import type { SettlementEcologyState } from "./settlementEcology";
import { settlementKeeperInspectionCauseForWorld } from "./settlementKeeperInspection";
import { waterDepthAt } from "../sim/terrain";
import { residentRestSurfaceKnowledge } from "../sim/residentSurfaceKnowledge";
import type { ResidentState, WorldState } from "../sim/types";
import { createLivingActorAddress, headingFromRadians } from "./livingActor";
import {
  createLivingActorTraversabilityCellsFromCodes,
  createLivingActorTraversabilitySurface,
  resolveLivingActorLocomotion,
  type LivingActorTraversabilitySurface,
} from "./livingActorLocomotion";
import {
  canonicalizeResidentCircadianDuty,
  planResidentCircadian,
  type ResidentCircadianDuty,
} from "./residentCircadian";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  createWorldPosition,
  WORLD_POSITION_UNITS_PER_TILE,
  type WorldPosition,
} from "./worldPosition";

/** Local dry-foot rest/service approach, not full-route planning or watercraft. */
const CORRIDOR_PADDING_TILES = 4;
const MAX_CORRIDOR_AXIS_TILES = 16;

export interface ResidentActivityDuty {
  readonly actorId: string;
  /** The caller must obtain this fact from its actual higher domain owner. */
  readonly duty: ResidentCircadianDuty;
}

export interface ResidentRestActivityStepResult {
  readonly phase: number;
  readonly movedActorIds: readonly string[];
  readonly arrivedActorIds: readonly string[];
  readonly waitingActorIds: readonly string[];
  /** Diagnostic bound, not persisted authority or a frame-time quota. */
  readonly maximumSurfaceCells: number;
}

/**
 * Capture old placements once, at an actual interval boundary. All replacement
 * roots are prepared before publishing any resident. Loading an old partial
 * interval does not authorize inventing its already-consumed physical poses.
 * This explicit adoption is not a deserializer/migration or runtime activation.
 */
export function adoptResidentActivities(world: WorldState, phase = 0): boolean {
  if (phase !== 0) return false;
  const tick = world.meta.completedTick;
  const replacements: ResidentState[] = [];
  try {
    for (const resident of world.residents) {
      if (Object.hasOwn(resident, "activity")) {
        const activity = canonicalResidentActivityForWorld(world, resident);
        const circadian = canonicalizeResidentCircadianState(resident.circadian, {
          residentStableId: resident.identity.stableId,
          homeSettlementId: resident.homeSettlementId,
          atTick: tick,
          arrivedAtSettlementRest: residentAtSettlementRestDestination(resident),
        });
        if (activity === null || activity.poses.length !== 1 || circadian === null) return false;
        // A cold decoder returns plain data. Adoption commits the same exact
        // content through its immutable owners rather than retaining raw roots.
        replacements.push(replaceResidentCircadian(
          replaceResidentActivity(resident, activity), { atTick: tick, circadian },
        ));
        continue;
      }
      if (resident.perception.tick !== tick) return false;
      const placement = resolveResidentWorldPlacement(world, resident);
      const restDestinationId = residentSettlementRestNetworkId(
        resident.identity.stableId, resident.homeSettlementId,
      );
      if (placement === null || restDestinationId === null) return false;
      const saved = Object.hasOwn(resident, "circadian")
        ? canonicalizeResidentCircadianState(resident.circadian, {
          residentStableId: resident.identity.stableId,
          homeSettlementId: resident.homeSettlementId,
          atTick: tick,
          arrivedAtSettlementRest: residentAtSettlementRestDestination(resident),
        }, true)
        : null;
      if (Object.hasOwn(resident, "circadian") && saved === null) return false;
      const continued = saved?.restDestinationArrived === true
        && (saved.posture.state === "resting" || saved.posture.state === "asleep");
      let task: ResidentRestTask | null = null;
      if (continued) {
        if (resident.location.kind !== "settlement" || resident.activeContractId !== null) return false;
        const settlementId = resident.location.settlementId;
        const ordinal = world.residents.filter((candidate) => (
          candidate.location.kind === "settlement"
          && candidate.location.settlementId === settlementId
        )).sort((left, right) => (
          (left.identity.stableId < right.identity.stableId ? -1
            : left.identity.stableId > right.identity.stableId ? 1 : 0)
          || left.id - right.id
        ))
          .findIndex(({ id }) => id === resident.id);
        const target = residentSettlementRestTarget(world, resident, ordinal);
        if (target === null || !samePosition(target, placement.position)) return false;
        task = {
          kind: "settlement-rest", settlementId, target,
          selectedAtTick: tick, lastProgressAtTick: tick,
          nextReassessmentAtTick: tick + 1,
          cause: "continued-admission", origin: "continued-admitted-rest",
          legacySettlementOrdinal: ordinal, phase: "arrived", waitReason: null,
        };
      }
      const body = replaceResidentActivity(resident, {
        version: RESIDENT_CIVIC_ACTIVITY_VERSION, ownerId: RESIDENT_CIVIC_ACTIVITY_OWNER_ID,
        actorId: resident.identity.stableId, tick,
        poses: [{ position: placement.position, heading: headingFromRadians(placement.facing) }],
        restTask: task,
        rationTask: null,
        materialTask: null,
      });
      // Awake membership is not physical arrival. Only the previously admitted
      // episode survives; no new clock projection can manufacture continuation.
      const receipt: LivingCircadianPersistentState = saved === null ? {
        version: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.version,
        ownerId: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.ownerId,
        policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
        restDestinationId, restDestinationArrived: false,
        posture: { state: "awake", enteredAtTick: tick },
      } : { ...saved, restDestinationArrived: continued };
      const replacement = replaceResidentCircadian(body, { atTick: tick, circadian: receipt });
      if (canonicalResidentActivityForWorld(world, replacement) === null) return false;
      replacements.push(replacement);
    }
  } catch {
    return false;
  }
  world.residents = replacements;
  return true;
}

/**
 * Once per civil-minute interval, select/reassess through the existing routine
 * policy. Fine motion never polls intentions or runs a second night scheduler.
 * Duty facts are higher-owner inputs, not inferred occupations or fake work.
 */
export function prepareResidentRestActivities(
  world: WorldState,
  duties: readonly ResidentActivityDuty[] = [],
  inspectionSettlement: SettlementEcologyState | null = null,
): boolean {
  const tick = world.meta.completedTick;
  const dutyByActor = new Map<string, ResidentCircadianDuty>();
  if (!Array.isArray(duties) || duties.length > world.residents.length) return false;
  const replacements: ResidentState[] = [];
  try {
    const inspectionCause = inspectionSettlement === null ? null
      : settlementKeeperInspectionCauseForWorld(world, inspectionSettlement);
    if (inspectionCause === undefined) return false;
    for (const record of duties) {
      if (record === null || typeof record !== "object"
        || Reflect.ownKeys(record).length !== 2
        || !Object.hasOwn(record, "actorId") || !Object.hasOwn(record, "duty")) return false;
      const { actorId } = record;
      const duty = canonicalizeResidentCircadianDuty(record.duty);
      if (duty === null || duty === undefined || dutyByActor.has(actorId)
        || !world.residents.some(({ identity }) => identity.stableId === actorId)) return false;
      dutyByActor.set(actorId, duty);
    }
    for (const resident of world.residents) {
      const priorActivity = canonicalResidentActivityForWorld(world, resident);
      if (priorActivity === null || priorActivity.poses.length !== 1) return false;
      // Explicit phase-zero evolution preserves v1 cold partial intervals. It
      // never invents prior poses or turns an old rest arrival into meal use.
      const activity = canonicalizeResidentActivity({
        ...priorActivity,
        version: inspectionSettlement !== null || residentActivitySupportsTravelEnvironment(priorActivity)
          ? RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION : residentActivitySupportsTravel(priorActivity)
          ? RESIDENT_TRAVEL_ACTIVITY_VERSION : residentActivitySupportsPickup(priorActivity)
          ? RESIDENT_PICKUP_ACTIVITY_VERSION : residentActivitySupportsEnvironment(priorActivity)
          ? RESIDENT_ENVIRONMENT_ACTIVITY_VERSION : residentActivitySupportsInspection(priorActivity)
          ? RESIDENT_INSPECTION_ACTIVITY_VERSION : RESIDENT_CIVIC_ACTIVITY_VERSION,
        ownerId: inspectionSettlement !== null || residentActivitySupportsTravelEnvironment(priorActivity)
          ? RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID : residentActivitySupportsTravel(priorActivity)
          ? RESIDENT_TRAVEL_ACTIVITY_OWNER_ID : residentActivitySupportsPickup(priorActivity)
          ? RESIDENT_PICKUP_ACTIVITY_OWNER_ID : residentActivitySupportsEnvironment(priorActivity)
          ? RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID : residentActivitySupportsInspection(priorActivity)
          ? RESIDENT_INSPECTION_ACTIVITY_OWNER_ID : RESIDENT_CIVIC_ACTIVITY_OWNER_ID,
        rationTask: priorActivity.rationTask ?? null,
        materialTask: priorActivity.materialTask ?? null,
        ...(inspectionSettlement !== null || residentActivitySupportsInspection(priorActivity)
          ? { inspectionTask: priorActivity.inspectionTask ?? null } : {}),
        ...(inspectionSettlement !== null || residentActivitySupportsPickup(priorActivity)
          ? { pickupTask: priorActivity.pickupTask ?? null } : {}),
        ...(inspectionSettlement !== null || residentActivitySupportsTravel(priorActivity)
          ? { travelTask: residentActivitySupportsTravel(priorActivity) ? priorActivity.travelTask
            : resident.location.kind === "route" ? {
              kind: "contract-travel", mode: "legacy-coarse", contractId: resident.activeContractId, adoptedAtTick: tick,
            } : null } : {}),
      }, { actorId: resident.identity.stableId, tick });
      if (activity === null || activity.poses.length !== 1) return false;
      const duty = dutyByActor.get(resident.identity.stableId) ?? null;
      const plan = planResidentCircadian({ resident, duty, weather: world.weather, atTick: tick });
      if (plan?.kind !== "projected") return false;
      const routine = plan.projection.routine;
      const wantsRest = routine.effectivePreference === "rest"
        && routine.posture.state !== "startled";
      const wantsRation = !wantsRest && routine.effectivePreference === "active"
        && routine.posture.state === "awake"
        && residentRationPriorityEligible(resident, world.weather, duty !== null, tick);
      let task = activity.restTask;
      let rationTask = activity.rationTask ?? null;
      // One civil-minute of observable committed use, with no repeat benefit.
      // A real higher priority still revokes it immediately; this is not work.
      const showingUsedRation = rationTask?.phase === "used" && rationTask.usedAtTick === tick
        && routine.effectivePreference === "active" && routine.posture.state === "awake"
        && (plan.projection.priorityOverride === null || wantsRation);
      if (!showingUsedRation && (!wantsRation || rationTask?.phase === "used")) rationTask = null;
      if (wantsRation && rationTask === null) {
        const target = residentSettlementRationTarget(world, resident);
        if (target === null || resident.location.kind !== "settlement") return false;
        rationTask = {
          kind: "settlement-ration", settlementId: resident.location.settlementId, target,
          selectedAtTick: tick, lastProgressAtTick: tick, nextReassessmentAtTick: tick,
          phase: "approaching", waitReason: null, usedAtTick: null, foodUsed: false, waterUsed: false,
        };
      } else if (rationTask?.phase === "waiting" && rationTask.nextReassessmentAtTick <= tick) {
        rationTask = { ...rationTask, phase: "approaching", waitReason: null };
      }
      if (!wantsRest) task = null;
      else if (task === null) {
        const target = residentSettlementRestTarget(world, resident);
        if (target === null || resident.location.kind !== "settlement") return false;
        task = {
          kind: "settlement-rest", settlementId: resident.location.settlementId, target,
          selectedAtTick: tick, lastProgressAtTick: tick,
          nextReassessmentAtTick: tick,
          cause: plan.projection.priorityOverride?.kind === "urgent-need" ? "urgent-rest" : "clock-rest",
          origin: "selected", legacySettlementOrdinal: null,
          phase: "approaching", waitReason: null,
        };
      }
      if (task !== null && task.origin === "selected" && task.phase !== "arrived") {
        const knowledge = residentActivitySupportsEnvironment(activity)
          ? residentRestSurfaceKnowledge(resident.perception, task.target, tick) : "unknown";
        if (knowledge === null) return false;
        if (knowledge === "wet") task = waitForRest(task, tick, "observed-water");
        else if (task.phase === "waiting" && task.nextReassessmentAtTick <= tick) {
          if (task.waitReason === "observed-water"
            && (knowledge !== "dry" || !residentRestTargetHasDrySupport(world, task.target))) {
            task = { ...task, nextReassessmentAtTick: tick + 1 };
          } else task = { ...task, phase: "approaching", waitReason: null };
        }
      }
      let inspectionTask = activity.inspectionTask ?? null;
      const service = residentServicePriorityAvailable(resident, world.weather, duty !== null, tick);
      const wantsInspection = inspectionCause?.actorId === resident.identity.stableId
        && task === null && rationTask === null && service !== null
        && routine.effectivePreference === "active" && routine.posture.state === "awake"
        && residentCircadianUrgentPreference({ needs: resident.needs, exhaustion: resident.condition.exhaustion }) === null
        && projectLivingCircadianClockPreference(resident.identity.stableId, tick, service.policy) === "active";
      if (!wantsInspection) inspectionTask = null;
      else {
        const retained = inspectionTask === null || inspectionSettlement === null ? null
          : settlementKeeperInspectionCauseForWorld(world, inspectionSettlement, inspectionTask.sourceEvidenceId);
        if (retained === undefined) return false;
        if (inspectionTask === null || retained === null) {
          inspectionTask = {
            kind: "settlement-inspection", settlementId: inspectionCause.settlementId,
            storeId: inspectionCause.storeId, sourceEvidenceId: inspectionCause.sourceEvidenceId,
            target: inspectionCause.target, selectedAtTick: tick, lastProgressAtTick: tick,
            nextReassessmentAtTick: tick, phase: "approaching", waitReason: null,
          };
        } else if (inspectionTask.phase === "waiting" && inspectionTask.nextReassessmentAtTick <= tick) {
          inspectionTask = { ...inspectionTask, phase: "approaching", waitReason: null };
        }
      }
      let materialTask = activity.materialTask ?? null;
      const material = residentSettlementMaterialProject(world, resident);
      const wantsMaterial = task === null && rationTask === null && inspectionTask === null
        && routine.effectivePreference === "active" && routine.posture.state === "awake"
        && residentMaterialPriorityEligible(resident, world.weather, duty !== null, tick);
      const showingUsedMaterial = materialTask?.phase === "used" && materialTask.usedAtTick === tick
        && task === null && rationTask === null && inspectionTask === null && routine.effectivePreference === "active"
        && routine.posture.state === "awake" && plan.projection.priorityOverride === null;
      if (!showingUsedMaterial && (!wantsMaterial || material === null
        || material.project.status === "complete" || materialTask?.phase === "used")) materialTask = null;
      if (wantsMaterial && !showingUsedMaterial && material?.project.status === "building") {
        if (materialTask === null) {
          const target = residentSettlementRationTarget(world, resident);
          if (target === null || resident.location.kind !== "settlement") return false;
          materialTask = {
            kind: "settlement-material", settlementId: material.id,
            projectId: material.project.id, resource: material.project.resource, target,
            selectedAtTick: tick, lastProgressAtTick: tick, nextReassessmentAtTick: tick,
            phase: "approaching", waitReason: null, usedAtTick: null,
          };
        }
        if (material.inventory[materialTask.resource] < 1) {
          materialTask = { ...materialTask, phase: "waiting", waitReason: "no-material", nextReassessmentAtTick: tick + 1 };
        } else if (materialTask.phase === "waiting" && materialTask.nextReassessmentAtTick <= tick) {
          materialTask = { ...materialTask, phase: "approaching", waitReason: null };
        }
      }
      let pickupTask = activity.pickupTask ?? null;
      const pickup = residentActivitySupportsPickup(activity) ? residentAcceptedPickupBinding(world, resident) : null;
      const wantsPickup = pickup !== null && routine.effectivePreference === "active" && routine.posture.state === "awake";
      if (!wantsPickup) pickupTask = null;
      else if (pickupTask === null) {
        pickupTask = {
          kind: "contract-pickup", contractId: pickup.contract.id,
          settlementId: pickup.contract.originSettlementId, target: pickup.target,
          selectedAtTick: tick, lastProgressAtTick: tick, nextReassessmentAtTick: tick,
          phase: "approaching", waitReason: null,
        };
      } else if (pickupTask.phase === "waiting" && pickupTask.nextReassessmentAtTick <= tick) {
        pickupTask = { ...pickupTask, phase: "approaching", waitReason: null };
      }
      let travelTask = activity.travelTask ?? null;
      if (travelTask?.mode === "physical" && travelTask.phase !== "arrived") {
        const contract = residentTravelContractBinding(world, resident);
        const segment = contract === null ? null : residentTravelSegment(world, contract, travelTask);
        if (segment === null) return false;
        const disturbed = resident.perception.beliefs.some((belief) => belief.lastObservedTick === tick
          && belief.strongInterrupt && belief.salience >= routine.wakeSensitivity);
        const knowledge = residentActivitySupportsTravelEnvironment(activity)
          ? residentRestSurfaceKnowledge(resident.perception, segment.end, tick) : "unknown";
        if (knowledge === null) return false;
        const informedHold = travelTask.waitReason === "observed-water";
        if (knowledge === "wet" || (informedHold && (knowledge !== "dry"
          || !residentRestTargetHasDrySupport(world, segment.end)))) {
          travelTask = waitForTravel(travelTask, tick, "observed-water");
        } else if (!routeIsActive(segment.route) || resident.condition.sheltering || routine.posture.state !== "awake" || disturbed) {
          // A temporary blocker must not erase the still-unresolved knowledge
          // gate. Retain it until a later eligible fresh-dry reassessment.
          if (informedHold) travelTask = waitForTravel(travelTask, tick, "observed-water");
          else {
            travelTask = { ...travelTask, phase: "waiting", waitReason: resident.condition.sheltering ? "weather-hold"
              : !routeIsActive(segment.route) ? "no-active-route" : "disturbed",
              nextReassessmentAtTick: tick + 1 };
          }
        } else if (travelTask.phase === "waiting" && travelTask.nextReassessmentAtTick <= tick) {
          travelTask = { ...travelTask, phase: "approaching", waitReason: null };
        }
      }
      let candidate = replaceResidentActivity(resident, { ...activity, restTask: task, rationTask, materialTask,
        ...(residentActivitySupportsInspection(activity) ? { inspectionTask } : {}),
        ...(residentActivitySupportsPickup(activity) ? { pickupTask } : {}),
        ...(residentActivitySupportsTravel(activity) ? { travelTask } : {}),
      });
      // Clearing a continued episode changes arrival and wake together. Do not
      // commit the old projection's arrived=true bit beside an awake body.
      candidate = alignCircadianArrival(candidate, tick);
      const next = planResidentCircadian({ resident: candidate, duty, weather: world.weather, atTick: tick });
      if (next?.kind !== "projected") return false;
      candidate = replaceResidentCircadian(candidate, { atTick: tick, circadian: next.projection.receipt });
      if (canonicalResidentActivityForWorld(world, candidate) === null) return false;
      replacements.push(candidate);
    }
  } catch {
    return false;
  }
  world.residents = replacements;
  return true;
}

/**
 * Exactly one accepted 100ms body step, including a stationary pose for every
 * adopted human. The caller owns timing, publication, hearing and rollback.
 * This does not itself enable runtime movement or authorize an old save format.
 */
export function advanceResidentRestActivities(
  world: WorldState,
  phase: number,
  window?: LivingActorInteractionWindow,
): ResidentRestActivityStepResult | null {
  if (!Number.isSafeInteger(phase) || phase < 1 || phase > RESIDENT_ACTIVITY_MAX_PHASE) return null;
  const tick = world.meta.completedTick;
  const replacements: ResidentState[] = [];
  const movedActorIds: string[] = [];
  const arrivedActorIds: string[] = [];
  const waitingActorIds: string[] = [];
  let maximumSurfaceCells = 0;
  try {
    const travelFrame = window === undefined ? null : residentTravelInteractionFrame(window);
    if (window !== undefined && travelFrame === null) return null;
    for (const resident of world.residents) {
      const activity = canonicalResidentActivityForWorld(world, resident);
      if (activity === null || activity.poses.length !== phase
        || canonicalizeResidentCircadianState(resident.circadian, {
          residentStableId: resident.identity.stableId,
          homeSettlementId: resident.homeSettlementId,
          atTick: tick,
          arrivedAtSettlementRest: residentAtSettlementRestDestination(resident),
        }) === null) return null;
      let pose: ResidentBodyPose = activity.poses[activity.poses.length - 1]!;
      let travelTask = activity.travelTask ?? null;
      let travelLocation = resident.location;
      if (travelTask?.mode === "physical" && travelTask.phase === "approaching" && travelFrame !== null
        && residentTravelBodyIsLocal(travelFrame, pose.position)) {
        const contract = residentTravelContractBinding(world, resident);
        const segment = contract === null ? null : residentTravelSegment(world, contract, travelTask);
        const offset = segment === null ? null : residentTravelSegmentOffset(segment, pose.position);
        const span = segment === null ? null : residentTravelWindowInterval(travelFrame, segment);
        if (contract === null || segment === null || offset === null || span === null) return null;
        const allowance = residentTravelStepUnits(activity, contract);
        const used = residentTravelIntervalWorkUsed(activity.poses);
        if (allowance === null || used === null) return null;
        const maximumStepUnits = Math.min(allowance,
          Math.max(0, allowance * RESIDENT_ACTIVITY_MAX_PHASE - used));
        const targetOffset = Math.min(WORLD_POSITION_UNITS_PER_TILE, span.last);
        if (!routeIsActive(segment.route)) {
          travelTask = waitForTravel(travelTask, tick, "no-active-route");
        } else if (targetOffset > offset && maximumStepUnits > 0) {
          const target = residentTravelSegmentPose(segment, targetOffset).position;
          const surface = travelApproachSurface(world, resident, pose.position, target);
          if (surface === null) travelTask = waitForTravel(travelTask, tick, "no-traversable-route");
          else {
            maximumSurfaceCells = Math.max(maximumSurfaceCells, surface.cells.length);
            // Physical contact, not path-cost preference or actor knowledge.
            // Preserve frozen v7 work; current travel inherits the player's
            // bare ground profile, never its gait, pack, gear or water mode.
            const sourceX = Math.floor(pose.position.localX / WORLD_POSITION_UNITS_PER_TILE);
            const sourceY = Math.floor(pose.position.localY / WORLD_POSITION_UNITS_PER_TILE);
            const sourceTile = world.terrain.tiles[sourceY * world.terrain.width + sourceX];
            if (sourceTile === undefined || sourceTile.x !== sourceX || sourceTile.y !== sourceY) return null;
            const contactStepUnits = residentActivitySupportsTravelEnvironment(activity)
              ? Math.floor(allowance * TERRAIN_DRAG_PERMILLE[sourceTile.terrain] / 1_000)
              : allowance;
            const resolution = resolveLivingActorLocomotion({
              requestId: `contract-travel:${resident.identity.stableId}:${contract.id}`,
              tick, actor: createLivingActorAddress({ actorId: resident.identity.stableId, species: "human", persistence: "promoted",
                position: pose.position, heading: pose.heading }),
              targetArea: { center: target, radiusUnits: 0 },
              maximumStepUnits: Math.min(maximumStepUnits, contactStepUnits), surface,
            });
            if (resolution.kind === "moved") {
              const nextOffset = residentTravelSegmentOffset(segment, resolution.actor.position);
              if (nextOffset === null || nextOffset <= offset || nextOffset > targetOffset) return null;
              pose = { position: resolution.actor.position, heading: resolution.actor.heading };
              travelTask = { ...travelTask, lastProgressAtTick: tick };
              const next = advanceResidentTravelWaypoint(world, contract, travelTask, pose.position, tick);
              if (next === null) return null;
              travelTask = next;
              const nextSegment = residentTravelSegment(world, contract, travelTask);
              const location = nextSegment === null ? null : residentTravelLocation(nextSegment, travelTask, pose.position);
              if (location === null) return null;
              travelLocation = location;
              movedActorIds.push(resident.identity.stableId);
              if (travelTask.phase === "arrived") arrivedActorIds.push(resident.identity.stableId);
            } else {
              if (resolution.reason === "invalid-input") return null;
              travelTask = waitForTravel(travelTask, tick, "no-traversable-route");
            }
          }
        }
      }
      if (travelTask?.mode === "physical" && travelTask.phase === "waiting") waitingActorIds.push(resident.identity.stableId);
      let task: ResidentRestTask | ResidentRationTask | ResidentMaterialTask | ResidentInspectionTask | ResidentPickupTask | null = activity.restTask ?? activity.rationTask ?? activity.materialTask ?? activity.inspectionTask ?? activity.pickupTask ?? null;
      if (task?.phase === "approaching") {
        if (!residentRestTargetHasDrySupport(world, task.target)) {
          task = waitForRest(task, tick, "no-traversable-route");
        } else if (samePosition(pose.position, task.target)) {
          task = arriveAtRest(task, tick);
        } else {
          const surface = restApproachSurface(world, resident, pose.position, task.target);
          if (surface === null) task = waitForRest(task, tick, "outside-local-corridor");
          else {
            maximumSurfaceCells = Math.max(maximumSurfaceCells, surface.cells.length);
            const resolution = resolveLivingActorLocomotion({
              requestId: `${task.kind}:${resident.identity.stableId}:${task.selectedAtTick}`,
              tick,
              actor: createLivingActorAddress({
                actorId: resident.identity.stableId, species: "human", persistence: "promoted",
                position: pose.position, heading: pose.heading,
              }),
              targetArea: { center: task.target, radiusUnits: 0 },
              // Shared locomotion charges each integer segment's ceil length;
              // the exact existing steady-walk bound needs no local rounding.
              maximumStepUnits: RESIDENT_REST_APPROACH_STEP_UNITS,
              surface,
            });
            if (resolution.kind === "moved") {
              pose = { position: resolution.actor.position, heading: resolution.actor.heading };
              task = { ...task, lastProgressAtTick: tick };
              movedActorIds.push(resident.identity.stableId);
              if (samePosition(pose.position, task.target)) task = arriveAtRest(task, tick);
            } else {
              if (resolution.reason === "invalid-input") return null;
              // No-move/already-within is never an independent arrival proof.
              task = waitForRest(task, tick, "no-traversable-route");
            }
          }
        }
        if (task.phase === "arrived") arrivedActorIds.push(resident.identity.stableId);
      }
      if (task?.phase === "waiting") waitingActorIds.push(resident.identity.stableId);
      let candidate = replaceResidentActivity({ ...resident, location: travelLocation }, {
        ...activity, poses: [...activity.poses, pose],
        restTask: task?.kind === "settlement-rest" ? task : null,
        ...(residentActivitySupportsRations(activity)
          ? { rationTask: task?.kind === "settlement-ration" ? task : null } : {}),
        ...(residentActivitySupportsMaterials(activity)
          ? { materialTask: task?.kind === "settlement-material" ? task : null } : {}),
        ...(residentActivitySupportsInspection(activity)
          ? { inspectionTask: task?.kind === "settlement-inspection" ? task : null } : {}),
        ...(residentActivitySupportsPickup(activity)
          ? { pickupTask: task?.kind === "contract-pickup" ? task : null } : {}),
        ...(residentActivitySupportsTravel(activity) ? { travelTask } : {}),
      });
      if (task?.kind === "settlement-rest" && task.phase === "arrived" && activity.restTask?.phase !== "arrived") {
        candidate = alignCircadianArrival(candidate, tick);
        const plan = planResidentCircadian({ resident: candidate, duty: null, weather: world.weather, atTick: tick });
        if (plan?.kind !== "projected") return null;
        candidate = replaceResidentCircadian(candidate, { atTick: tick, circadian: plan.projection.receipt });
      }
      if (canonicalizeResidentActivity(candidate.activity, {
        actorId: candidate.identity.stableId, tick, phase,
      }) === null || canonicalResidentActivityForWorld(world, candidate) === null) return null;
      replacements.push(candidate);
    }
  } catch {
    return null;
  }
  world.residents = replacements;
  return Object.freeze({
    phase, movedActorIds: Object.freeze(movedActorIds),
    arrivedActorIds: Object.freeze(arrivedActorIds), waitingActorIds: Object.freeze(waitingActorIds),
    maximumSurfaceCells,
  });
}

function waitForTravel(task: ResidentPhysicalTravelTask, tick: number, waitReason: ResidentPhysicalTravelTask["waitReason"]): ResidentPhysicalTravelTask {
  return { ...task, phase: "waiting", waitReason, nextReassessmentAtTick: tick + 1 };
}

/** Two cardinal route cells only; detours cannot silently change the cursor. */
function travelApproachSurface(world: WorldState, resident: ResidentState, from: WorldPosition, to: WorldPosition): LivingActorTraversabilitySurface | null {
  if (from.region.x !== 0 || from.region.y !== 0 || to.region.x !== 0 || to.region.y !== 0) return null;
  const minX = Math.floor(Math.min(from.localX, to.localX) / WORLD_POSITION_UNITS_PER_TILE);
  const minY = Math.floor(Math.min(from.localY, to.localY) / WORLD_POSITION_UNITS_PER_TILE);
  const maxX = Math.floor(Math.max(from.localX, to.localX) / WORLD_POSITION_UNITS_PER_TILE);
  const maxY = Math.floor(Math.max(from.localY, to.localY) / WORLD_POSITION_UNITS_PER_TILE);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (width * height > 2 || minX < 0 || minY < 0 || maxX >= world.terrain.width || maxY >= world.terrain.height) return null;
  const codes: number[] = [];
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const tile = world.terrain.tiles[y * world.terrain.width + x];
    if (tile === undefined || tile.x !== x || tile.y !== y) return null;
    codes.push(tile.terrain === "deep-water" || waterDepthAt(tile, world.tide) > 0 ? -1 : Math.max(1, Math.min(1_000_000, tile.baseTravelCost)));
  }
  return createLivingActorTraversabilitySurface({ forActorId: resident.identity.stableId, sampledAtTick: world.meta.completedTick,
    origin: createWorldPosition({ x: 0, y: 0 }, minX * WORLD_POSITION_UNITS_PER_TILE, minY * WORLD_POSITION_UNITS_PER_TILE),
    widthTiles: width, heightTiles: height, cells: createLivingActorTraversabilityCellsFromCodes(codes) });
}

function alignCircadianArrival(resident: ResidentState, tick: number): ResidentState {
  const receipt = resident.circadian!;
  const arrived = residentAtSettlementRestDestination(resident);
  return replaceResidentCircadian(resident, {
    atTick: tick,
    circadian: {
      ...receipt, restDestinationArrived: arrived,
      posture: !arrived && (receipt.posture.state === "asleep" || receipt.posture.state === "resting")
        ? { state: "awake", enteredAtTick: tick } : receipt.posture,
    },
  });
}

function arriveAtRest<T extends ResidentRestTask | ResidentRationTask | ResidentMaterialTask | ResidentInspectionTask | ResidentPickupTask>(task: T, tick: number): T {
  return { ...task, phase: "arrived", waitReason: null, lastProgressAtTick: tick, nextReassessmentAtTick: tick + 1 };
}

function waitForRest(task: ResidentRestTask, tick: number, reason: ResidentRestTask["waitReason"]): ResidentRestTask;
function waitForRest<T extends ResidentRestTask | ResidentRationTask | ResidentMaterialTask | ResidentInspectionTask | ResidentPickupTask>(task: T, tick: number, reason: ResidentPhysicalWaitReason): T;
function waitForRest<T extends ResidentRestTask | ResidentRationTask | ResidentMaterialTask | ResidentInspectionTask | ResidentPickupTask>(task: T, tick: number, reason: ResidentRestTask["waitReason"]): T {
  return { ...task, phase: "waiting", waitReason: reason, nextReassessmentAtTick: tick + 1 };
}

function restApproachSurface(
  world: WorldState,
  resident: ResidentState,
  position: WorldPosition,
  target: WorldPosition,
): LivingActorTraversabilitySurface | null {
  if (position.region.x !== 0 || position.region.y !== 0
    || target.region.x !== 0 || target.region.y !== 0) return null;
  const ax = Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE);
  const ay = Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE);
  const tx = Math.floor(target.localX / WORLD_POSITION_UNITS_PER_TILE);
  const ty = Math.floor(target.localY / WORLD_POSITION_UNITS_PER_TILE);
  if (Math.min(ax, tx, ay, ty) < 0 || Math.max(ax, tx) >= world.terrain.width
    || Math.max(ay, ty) >= world.terrain.height) return null;
  const minX = Math.max(0, Math.min(ax, tx) - CORRIDOR_PADDING_TILES);
  const minY = Math.max(0, Math.min(ay, ty) - CORRIDOR_PADDING_TILES);
  const maxX = Math.min(world.terrain.width - 1, Math.max(ax, tx) + CORRIDOR_PADDING_TILES);
  const maxY = Math.min(world.terrain.height - 1, Math.max(ay, ty) + CORRIDOR_PADDING_TILES);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (width > MAX_CORRIDOR_AXIS_TILES || height > MAX_CORRIDOR_AXIS_TILES) return null;
  const codes: number[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const tile = world.terrain.tiles[y * world.terrain.width + x];
      if (tile === undefined || tile.x !== x || tile.y !== y) return null;
      const depth = waterDepthAt(tile, world.tide);
      // First rest approach is dry-foot only. This grants no dog swimming,
      // automatic player skiff, cliff equipment or new human injury behavior.
      codes.push(tile.terrain === "deep-water" || depth > 0
        ? -1 : Math.max(1, Math.min(1_000_000, tile.baseTravelCost)));
    }
  }
  return createLivingActorTraversabilitySurface({
    forActorId: resident.identity.stableId, sampledAtTick: world.meta.completedTick,
    origin: createWorldPosition({ x: 0, y: 0 }, minX * WORLD_POSITION_UNITS_PER_TILE, minY * WORLD_POSITION_UNITS_PER_TILE),
    widthTiles: width, heightTiles: height,
    cells: createLivingActorTraversabilityCellsFromCodes(codes),
  });
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x && left.region.y === right.region.y
    && left.localX === right.localX && left.localY === right.localY;
}
