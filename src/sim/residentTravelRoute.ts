import { headingFromRadians } from "../game/livingActor";
import {
  createSpatialFrame,
  createWorldPosition,
  cardinalSegmentSpatialFrameSpan,
  translateWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
  WORLD_POSITION_UNITS_PER_TILE,
  type SpatialFrame,
  type WorldPosition,
} from "../game/worldPosition";
import { LIVING_ACTOR_INTERACTION_WINDOW_MAX_TILES, type LivingActorInteractionWindow } from "../game/livingActorSimulation";
import { globalTileToRegion } from "./regions";
import type { ResidentBodyPose, ResidentPhysicalTravelTask } from "./residentActivity";
import { FIXED_POINT, type ContractState, type ResidentLocation, type RouteState, type TerrainTile, type WorldState } from "./types";
import { RESIDENT_ACTIVITY_MAX_PHASE, RESIDENT_REST_APPROACH_STEP_UNITS } from "./residentActivity";

export interface ResidentTravelSegment {
  readonly route: RouteState;
  readonly start: WorldPosition;
  readonly end: WorldPosition;
  readonly directionX: -1 | 0 | 1;
  readonly directionY: -1 | 0 | 1;
  readonly reversed: boolean;
}

/** Read-only geography shared by authority and its completed world view. */
interface ResidentTravelGeography {
  readonly routes: readonly RouteState[];
  readonly terrain: Readonly<{
    width: number;
    tiles: readonly Pick<TerrainTile, "index" | "x" | "y">[];
  }>;
}

/** The physical interaction window, not a camera cone or loaded-region set. */
export function residentTravelInteractionFrame(window: LivingActorInteractionWindow): SpatialFrame | null {
  try {
    const { width, height } = window.terrain;
    if (![width, height].every((axis) => Number.isSafeInteger(axis) && axis > 0
      && axis <= LIVING_ACTOR_INTERACTION_WINDOW_MAX_TILES)) return null;
    const origin = globalTileToRegion(window.origin.x, window.origin.y);
    return createSpatialFrame(createWorldPosition(origin.region,
      origin.localX * WORLD_POSITION_UNITS_PER_TILE,
      origin.localY * WORLD_POSITION_UNITS_PER_TILE),
    width * WORLD_POSITION_UNITS_PER_TILE, height * WORLD_POSITION_UNITS_PER_TILE);
  } catch {
    return null;
  }
}

/** One existing itinerary edge; no copied path, nearest tile or ETA inference. */
export function residentTravelSegment(
  world: ResidentTravelGeography,
  contract: ContractState,
  task: Pick<ResidentPhysicalTravelTask, "contractId" | "legIndex" | "waypointIndex">,
): ResidentTravelSegment | null {
  if (task.contractId !== contract.id || !Number.isSafeInteger(task.legIndex) || task.legIndex < 0
    || task.legIndex >= contract.porterRouteIds.length
    || contract.porterSettlementIds.length !== contract.porterRouteIds.length + 1) return null;
  const route = world.routes.find(({ id }) => id === contract.porterRouteIds[task.legIndex]);
  const from = contract.porterSettlementIds[task.legIndex];
  const to = contract.porterSettlementIds[task.legIndex + 1];
  if (route === undefined || from === undefined || to === undefined || from === to
    || route.fromSettlementId !== Math.min(from, to) || route.toSettlementId !== Math.max(from, to)
    || !Number.isSafeInteger(task.waypointIndex) || task.waypointIndex < 1
    || task.waypointIndex >= route.path.length) return null;
  const reversed = route.fromSettlementId !== from;
  const pathIndex = (index: number) => reversed ? route.path.length - 1 - index : index;
  const start = tileCenter(world, route.path[pathIndex(task.waypointIndex - 1)]);
  const end = tileCenter(world, route.path[pathIndex(task.waypointIndex)]);
  if (start === null || end === null) return null;
  const delta = worldPositionDelta(start, end);
  // Canonical routes are cardinal and contiguous. Diagonal/detoured poses do
  // not acquire a cursor by rounding; cold full-world invariants check all legs.
  if (Math.abs(delta.x) + Math.abs(delta.y) !== WORLD_POSITION_UNITS_PER_TILE
    || (delta.x !== 0 && delta.y !== 0)) return null;
  return Object.freeze({ route, start, end, reversed,
    directionX: Math.sign(delta.x) as -1 | 0 | 1,
    directionY: Math.sign(delta.y) as -1 | 0 | 1 });
}

/** Exact distance along the current cardinal edge, inclusive at both ends. */
export function residentTravelSegmentOffset(segment: ResidentTravelSegment, body: WorldPosition): number | null {
  try {
    const delta = worldPositionDelta(segment.start, body);
    if ((segment.directionX === 0 && delta.x !== 0) || (segment.directionY === 0 && delta.y !== 0)) return null;
    const offset = delta.x * segment.directionX + delta.y * segment.directionY;
    return Number.isSafeInteger(offset) && offset >= 0 && offset <= WORLD_POSITION_UNITS_PER_TILE ? offset : null;
  } catch {
    return null;
  }
}

export function residentTravelSegmentPose(segment: ResidentTravelSegment, offset: number): ResidentBodyPose {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > WORLD_POSITION_UNITS_PER_TILE) {
    throw new RangeError("Resident route offset is outside its cardinal edge");
  }
  return Object.freeze({
    position: translateWorldPosition(segment.start, offset * segment.directionX, offset * segment.directionY),
    heading: headingFromRadians(Math.atan2(segment.directionY, segment.directionX)),
  });
}

/** Membership/progress is a projection FROM the real cursor and body. */
export function residentTravelLocation(
  segment: ResidentTravelSegment, task: ResidentPhysicalTravelTask, body: WorldPosition,
): ResidentLocation | null {
  const offset = residentTravelSegmentOffset(segment, body);
  if (offset === null) return null;
  const traveled = (task.waypointIndex - 1) * WORLD_POSITION_UNITS_PER_TILE + offset;
  const length = (segment.route.path.length - 1) * WORLD_POSITION_UNITS_PER_TILE;
  const progress = Math.trunc(traveled * FIXED_POINT / length);
  return { kind: "route", routeId: segment.route.id, progress: segment.reversed ? FIXED_POINT - progress : progress };
}

/**
 * Authenticate the retained fine interval against its ordered itinerary suffix.
 * Search backwards at most one accepted step per pose; never scan the full path
 * to snap a body onto a convenient repeated tile. Prefix lengths only establish
 * the absolute possible-work bound, not permission to relocate that body.
 */
export function residentTravelPosesAreAccountable(
  world: ResidentTravelGeography, contract: ContractState, task: ResidentPhysicalTravelTask,
  poses: readonly ResidentBodyPose[], atTick: number,
): boolean {
  if (poses.length === 0 || !Number.isSafeInteger(atTick) || atTick < 0
    || contract.departedTick === null || !Number.isSafeInteger(contract.departedTick)
    || contract.departedTick < 0 || contract.departedTick > atTick) return false;
  let cursor = task;
  let segment = residentTravelSegment(world, contract, cursor);
  let offset = segment === null ? null : residentTravelSegmentOffset(segment, poses.at(-1)!.position);
  if (segment === null || offset === null) return false;
  let distance = (cursor.waypointIndex - 1) * WORLD_POSITION_UNITS_PER_TILE + offset;
  for (let leg = 0; leg < cursor.legIndex; leg += 1) {
    const route = world.routes.find(({ id }) => id === contract.porterRouteIds[leg]);
    if (route === undefined || route.path.length < 2) return false;
    distance += (route.path.length - 1) * WORLD_POSITION_UNITS_PER_TILE;
  }
  if (!Number.isSafeInteger(distance)) return false;
  const intervalBudget = BigInt(atTick - contract.departedTick)
    * BigInt(RESIDENT_ACTIVITY_MAX_PHASE * RESIDENT_REST_APPROACH_STEP_UNITS);
  for (let phase = poses.length - 1; phase >= 0; phase -= 1) {
    if (BigInt(distance) > intervalBudget + BigInt(phase * RESIDENT_REST_APPROACH_STEP_UNITS)) return false;
    if (phase === 0) return true;
    const prior = poses[phase - 1]!.position;
    const delta = worldPositionDelta(prior, poses[phase]!.position);
    // A fine step follows one cardinal edge, stopping at a corner before the
    // next accepted step. A diagonal chord is not a route traversal receipt.
    if (delta.x !== 0 && delta.y !== 0) return false;
    let searched = 0;
    let matched = false;
    for (let edges = 0; edges < 2; edges += 1) {
      const previousOffset = residentTravelSegmentOffset(segment, prior);
      if (previousOffset !== null && previousOffset <= offset
        && searched + offset - previousOffset <= RESIDENT_REST_APPROACH_STEP_UNITS) {
        distance -= searched + offset - previousOffset;
        offset = previousOffset;
        matched = true;
        break;
      }
      // Fine authority stops at a vertex before entering the next edge. A
      // same-axis U-turn cannot hide extra arc distance behind a short chord.
      if (offset !== 0) break;
      searched += offset;
      if (searched > RESIDENT_REST_APPROACH_STEP_UNITS) break;
      if (cursor.waypointIndex > 1) cursor = { ...cursor, waypointIndex: cursor.waypointIndex - 1 };
      else {
        if (cursor.legIndex === 0) break;
        const previousRoute = world.routes.find(({ id }) => id === contract.porterRouteIds[cursor.legIndex - 1]);
        if (previousRoute === undefined || previousRoute.path.length < 2) return false;
        cursor = { ...cursor, legIndex: cursor.legIndex - 1, waypointIndex: previousRoute.path.length - 1 };
      }
      const previousSegment = residentTravelSegment(world, contract, cursor);
      if (previousSegment === null || !samePosition(previousSegment.end, segment.start)) return false;
      segment = previousSegment;
      offset = WORLD_POSITION_UNITS_PER_TILE;
    }
    if (!matched) return false;
  }
  return false;
}

/** Advance cursor only at the exact committed waypoint, retaining final body. */
export function advanceResidentTravelWaypoint(
  world: WorldState, contract: ContractState, task: ResidentPhysicalTravelTask,
  body: WorldPosition, tick: number,
): ResidentPhysicalTravelTask | null {
  const segment = residentTravelSegment(world, contract, task);
  const offset = segment === null ? null : residentTravelSegmentOffset(segment, body);
  if (segment === null || offset === null) return null;
  if (offset < WORLD_POSITION_UNITS_PER_TILE) return task.phase === "arrived" ? null : task;
  const changed = { ...task, phase: "approaching" as const, waitReason: null,
    lastProgressAtTick: tick, nextReassessmentAtTick: tick };
  if (task.waypointIndex + 1 < segment.route.path.length) return { ...changed, waypointIndex: task.waypointIndex + 1 };
  if (task.legIndex + 1 < contract.porterRouteIds.length) {
    const next = { ...changed, legIndex: task.legIndex + 1, waypointIndex: 1 };
    const nextSegment = residentTravelSegment(world, contract, next);
    return nextSegment !== null && samePosition(nextSegment.start, body) ? next : null;
  }
  return { ...changed, phase: "arrived", nextReassessmentAtTick: tick + 1 };
}

export interface ResidentTravelWindowInterval {
  /** Distance in segment direction to the first included integer point. */
  readonly first: number;
  /** Last included point; the next unit is outside, not a free teleport. */
  readonly last: number;
}

/**
 * Integer clipping of one <=1000-unit cardinal edge against a HALF-OPEN frame.
 * Renderer clipping uses different floating/draw conventions and is not used.
 * A far segmented frame cannot intersect this bounded edge; no unsafe global
 * fixed-point flattening or epsilon is needed.
 */
export function residentTravelWindowInterval(
  frame: SpatialFrame, segment: ResidentTravelSegment,
): ResidentTravelWindowInterval | null {
  const span = cardinalSegmentSpatialFrameSpan(frame, segment.start, segment.end);
  return span === null ? null : Object.freeze({
    first: span.firstIncludedDistanceUnits, last: span.lastIncludedDistanceUnits,
  });
}

/** Explicit membership helper; a loaded persistence region alone proves none. */
export function residentTravelBodyIsLocal(frame: SpatialFrame, body: WorldPosition): boolean {
  return worldPositionToSpatialFrame(frame, body) !== null;
}

function tileCenter(world: Pick<ResidentTravelGeography, "terrain">, index: number | undefined): WorldPosition | null {
  if (index === undefined || !Number.isSafeInteger(index) || index < 0) return null;
  const tile = world.terrain.tiles[index];
  if (tile === undefined || tile.index !== index || tile.x !== index % world.terrain.width
    || tile.y !== Math.floor(index / world.terrain.width)) return null;
  try {
    const address = globalTileToRegion(tile.x, tile.y);
    return createWorldPosition(address.region,
      address.localX * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
      address.localY * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2);
  } catch {
    return null;
  }
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x && left.region.y === right.region.y
    && left.localX === right.localX && left.localY === right.localY;
}
