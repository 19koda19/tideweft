import type { ObservedArea } from "../sim/actorPerception";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  createLivingActorAddress,
  isLivingActorAddress,
  type LivingActorAddress,
} from "./livingActor";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  isWorldPosition,
  spatialFrameToWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
  type SpatialFrame,
  type SpatialFramePoint,
  type WorldPosition,
} from "./worldPosition";

export const LIVING_ACTOR_LOCOMOTION_VERSION = 1 as const;
export const LIVING_ACTOR_TRAVERSABILITY_VERSION = 1 as const;
export const LIVING_ACTOR_SEARCH_PROBE_VERSION = 1 as const;
export const MAX_LIVING_ACTOR_TRAVERSABILITY_CELLS = 16_384 as const;
export const MAX_LIVING_ACTOR_TRAVERSABILITY_AXIS_TILES = 256 as const;
export const MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS = 64_000 as const;

const MAX_OBSERVED_AREA_RADIUS_UNITS = 10_000_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const CARDINAL_COST_UNITS = WORLD_POSITION_UNITS_PER_TILE;
const DIAGONAL_COST_UNITS = 1_414;

/** Exact outputs of canonicalSurface are recursively immutable. */
const CANONICAL_TRAVERSABILITY_SURFACES = new WeakSet<object>();

/**
 * Access is already resolved for the addressed actor's current locomotion
 * capabilities. A flying actor may therefore receive `open` over raw deep
 * water, while a ground-bound actor receives `deep-water` for the same tile.
 */
export type LivingActorTraversalAccess = "open" | "blocked" | "deep-water";

export interface LivingActorTraversabilityCell {
  readonly access: LivingActorTraversalAccess;
  /** Positive relative movement cost for open cells; zero for closed cells. */
  readonly travelCost: number;
}

/**
 * One bounded, actor-specific view of current terrain. It contains data rather
 * than callbacks so replay cannot acquire hidden terrain midway through a
 * resolution.
 */
export interface LivingActorTraversabilitySurface {
  readonly version: typeof LIVING_ACTOR_TRAVERSABILITY_VERSION;
  readonly forActorId: string;
  readonly sampledAtTick: number;
  /** Tile-aligned segmented origin of the row-major surface. */
  readonly origin: WorldPosition;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly cells: readonly LivingActorTraversabilityCell[];
}

export interface LivingActorTraversabilitySurfaceInput {
  readonly forActorId: string;
  readonly sampledAtTick: number;
  readonly origin: WorldPosition;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly cells: readonly LivingActorTraversabilityCell[];
}

export interface LivingActorLocomotionInput {
  readonly requestId: string;
  readonly tick: number;
  readonly actor: LivingActorAddress;
  /** Cognition-owned uncertainty area; no physical subject position is accepted. */
  readonly targetArea: ObservedArea;
  /**
   * Optional cognition-owned local-search target. Its sealed sourceArea must be
   * byte-equivalent to targetArea; it can never contain a physical source
   * position or identity.
   */
  readonly searchProbe?: LivingActorSearchProbe;
  readonly maximumStepUnits: number;
  readonly surface: LivingActorTraversabilitySurface;
}

export interface LivingActorSearchProbeInput {
  readonly requestId: string;
  readonly beliefKey: string;
  readonly probeOrdinal: number;
  readonly sourceArea: ObservedArea;
}

/**
 * A deterministic point to investigate inside an uncertain perceived area.
 * sourceArea preserves what the actor actually knew; probeArea is merely a
 * search choice and is never evidence that the hidden source is there.
 */
export interface LivingActorSearchProbe {
  readonly version: typeof LIVING_ACTOR_SEARCH_PROBE_VERSION;
  readonly id: string;
  readonly requestId: string;
  readonly beliefKey: string;
  readonly probeOrdinal: number;
  readonly sourceArea: ObservedArea;
  readonly probeArea: ObservedArea;
}

export type LivingActorNoMoveReason =
  | "invalid-input"
  | "maximum-step-zero"
  | "already-within-observed-area"
  | "already-at-search-probe"
  | "actor-outside-surface"
  | "target-outside-surface"
  | "actor-on-blocked-tile"
  | "actor-in-deep-water"
  | "no-traversable-route";

export interface LivingActorMovedResolution {
  readonly version: typeof LIVING_ACTOR_LOCOMOTION_VERSION;
  readonly kind: "moved";
  readonly requestId: string;
  readonly tick: number;
  readonly from: WorldPosition;
  /** Same stable identity and persistence, with only position/heading changed. */
  readonly actor: LivingActorAddress;
  /** Exact traversed polyline, including the starting and final positions. */
  readonly trajectory: readonly WorldPosition[];
  readonly targetArea: ObservedArea;
  readonly searchProbe?: LivingActorSearchProbe;
  /** Conservative integer length consumed along the traversed polyline. */
  readonly distanceUnits: number;
  readonly chosenNextTileIndex: number;
  readonly reachedObservedArea: boolean;
  readonly reachedSearchProbe?: boolean;
}

export interface LivingActorNoMoveResolution {
  readonly version: typeof LIVING_ACTOR_LOCOMOTION_VERSION;
  readonly kind: "no-move";
  readonly requestId: string | null;
  readonly tick: number | null;
  readonly actor: LivingActorAddress | null;
  readonly targetArea: ObservedArea | null;
  readonly searchProbe?: LivingActorSearchProbe;
  readonly reason: LivingActorNoMoveReason;
}

export type LivingActorLocomotionResolution =
  | LivingActorMovedResolution
  | LivingActorNoMoveResolution;

interface CanonicalLocomotionInput {
  readonly requestId: string;
  readonly tick: number;
  readonly actor: LivingActorAddress;
  readonly targetArea: ObservedArea;
  readonly searchProbe: LivingActorSearchProbe | null;
  readonly maximumStepUnits: number;
  readonly surface: LivingActorTraversabilitySurface;
}

interface SearchNode {
  readonly index: number;
  readonly g: number;
  readonly h: number;
  readonly f: number;
}

interface GoalSet {
  readonly mask: Uint8Array;
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
}

/** Build a strict immutable surface for a specific actor and authoritative tick. */
export function createLivingActorTraversabilitySurface(
  input: LivingActorTraversabilitySurfaceInput,
): LivingActorTraversabilitySurface {
  const surface = canonicalSurface({
    version: LIVING_ACTOR_TRAVERSABILITY_VERSION,
    ...input,
  });
  if (surface === null) {
    throw new TypeError("Living actor traversability surface is invalid");
  }
  return surface;
}

/**
 * Select a bounded search probe using saved cognition only. Probe zero is the
 * perceived area's center. Later ordinals cover deterministic interior points;
 * none can encode or consult hidden source truth.
 */
export function deriveLivingActorSearchProbe(
  value: unknown,
): LivingActorSearchProbe | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "beliefKey",
    "probeOrdinal",
    "requestId",
    "sourceArea",
  ])) return null;
  if (
    !validId(value.requestId)
    || !validBeliefKey(value.beliefKey)
    || !nonnegativeSafeInteger(value.probeOrdinal)
  ) return null;
  const sourceArea = canonicalArea(value.sourceArea);
  if (sourceArea === null) return null;
  const probeArea = deriveProbeArea(
    value.requestId,
    value.beliefKey,
    value.probeOrdinal,
    sourceArea,
  );
  if (probeArea === null) return null;
  return freezeSearchProbe({
    version: LIVING_ACTOR_SEARCH_PROBE_VERSION,
    id: searchProbeId(
      value.requestId,
      value.beliefKey,
      value.probeOrdinal,
      sourceArea,
      probeArea,
    ),
    requestId: value.requestId,
    beliefKey: value.beliefKey,
    probeOrdinal: value.probeOrdinal,
    sourceArea,
    probeArea,
  });
}

/**
 * Resolve one bounded physical step toward perceived space only. Malformed or
 * incomplete data returns a canonical no-move value and never partially moves.
 */
export function resolveLivingActorLocomotion(
  value: unknown,
): LivingActorLocomotionResolution {
  const input = canonicalInput(value);
  if (input === null) return invalidResolution();

  if (input.maximumStepUnits === 0) {
    return noMove(input, "maximum-step-zero");
  }

  const movementTarget = input.searchProbe?.probeArea ?? input.targetArea;
  if (isInsideObservedArea(input.actor.position, movementTarget)) {
    return noMove(
      input,
      input.searchProbe === null
        ? "already-within-observed-area"
        : "already-at-search-probe",
    );
  }

  let frame: SpatialFrame;
  try {
    frame = createSpatialFrame(
      input.surface.origin,
      input.surface.widthTiles * WORLD_POSITION_UNITS_PER_TILE,
      input.surface.heightTiles * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return invalidResolution();
  }

  const actorPoint = worldPositionToSpatialFrame(frame, input.actor.position);
  if (actorPoint === null) return noMove(input, "actor-outside-surface");
  const targetPoint = worldPositionToSpatialFrame(frame, movementTarget.center);
  if (targetPoint === null) return noMove(input, "target-outside-surface");

  const startX = Math.floor(actorPoint.x / WORLD_POSITION_UNITS_PER_TILE);
  const startY = Math.floor(actorPoint.y / WORLD_POSITION_UNITS_PER_TILE);
  const startIndex = tileIndex(startX, startY, input.surface.widthTiles);
  const startCell = input.surface.cells[startIndex];
  if (startCell?.access === "blocked") return noMove(input, "actor-on-blocked-tile");
  if (startCell?.access === "deep-water") return noMove(input, "actor-in-deep-water");
  if (startCell === undefined) return invalidResolution();

  const goals = buildGoalSet(input.surface, targetPoint, movementTarget.radiusUnits);
  if (goals === null) return noMove(input, "no-traversable-route");
  const route = findRoute(input.surface, startIndex, goals);
  if (route === null) return noMove(input, "no-traversable-route");

  const goalIndex = route[route.length - 1];
  if (goalIndex === undefined) return noMove(input, "no-traversable-route");
  const goalPoint = closestPointInTileToTarget(
    goalIndex,
    input.surface.widthTiles,
    targetPoint,
  );
  const waypoints = route.slice(1).map((index) => tileCenter(
    index,
    input.surface.widthTiles,
  ));
  if (!samePoint(waypoints[waypoints.length - 1], goalPoint)) waypoints.push(goalPoint);

  const movement = moveAlongPolyline(actorPoint, waypoints, input.maximumStepUnits);
  if (movement.distanceUnits <= 0 || samePoint(actorPoint, movement.point)) {
    return noMove(input, "no-traversable-route");
  }

  let nextPosition: WorldPosition;
  let trajectory: readonly WorldPosition[];
  try {
    nextPosition = spatialFrameToWorldPosition(frame, movement.point);
    trajectory = Object.freeze(movement.points.map((point) =>
      spatialFrameToWorldPosition(frame, point)
    ));
  } catch {
    return noMove(input, "no-traversable-route");
  }
  const deltaX = movement.point.x - actorPoint.x;
  const deltaY = movement.point.y - actorPoint.y;
  const heading = headingFromDelta(deltaX, deltaY);
  const actor = createLivingActorAddress({
    actorId: input.actor.actorId,
    species: input.actor.species,
    position: nextPosition,
    heading,
    persistence: input.actor.persistence,
  });

  return Object.freeze({
    version: LIVING_ACTOR_LOCOMOTION_VERSION,
    kind: "moved",
    requestId: input.requestId,
    tick: input.tick,
    from: clonePosition(input.actor.position),
    actor,
    trajectory,
    targetArea: cloneArea(input.targetArea),
    ...(input.searchProbe === null ? {} : { searchProbe: input.searchProbe }),
    distanceUnits: movement.distanceUnits,
    chosenNextTileIndex: route[1] ?? startIndex,
    reachedObservedArea: isInsideObservedArea(nextPosition, input.targetArea),
    ...(input.searchProbe === null
      ? {}
      : { reachedSearchProbe: isInsideObservedArea(nextPosition, input.searchProbe.probeArea) }),
  });
}

function canonicalInput(value: unknown): CanonicalLocomotionInput | null {
  if (!plainRecord(value)) return null;
  const ordinaryKeys = [
    "actor",
    "maximumStepUnits",
    "requestId",
    "surface",
    "targetArea",
    "tick",
  ] as const;
  const withProbeKeys = [...ordinaryKeys, "searchProbe"] as const;
  if (!exactKeys(value, ordinaryKeys) && !exactKeys(value, withProbeKeys)) return null;
  if (
    !validId(value.requestId)
    || !nonnegativeSafeInteger(value.tick)
    || !isLivingActorAddress(value.actor)
    || !nonnegativeSafeInteger(value.maximumStepUnits)
    || value.maximumStepUnits > MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS
  ) return null;
  const targetArea = canonicalArea(value.targetArea);
  const surface = canonicalSurface(value.surface);
  const searchProbe = "searchProbe" in value
    ? canonicalSearchProbe(value.searchProbe)
    : null;
  if (
    targetArea === null
    || surface === null
    || ("searchProbe" in value && searchProbe === null)
    || (searchProbe !== null && (
      searchProbe.requestId !== value.requestId
      || stableStringify(searchProbe.sourceArea) !== stableStringify(targetArea)
    ))
    || surface.forActorId !== value.actor.actorId
    || surface.sampledAtTick !== value.tick
  ) return null;
  return Object.freeze({
    requestId: value.requestId,
    tick: value.tick,
    actor: createLivingActorAddress(value.actor),
    targetArea,
    searchProbe,
    maximumStepUnits: value.maximumStepUnits,
    surface,
  });
}

function canonicalSurface(value: unknown): LivingActorTraversabilitySurface | null {
  if (
    typeof value === "object"
    && value !== null
    && CANONICAL_TRAVERSABILITY_SURFACES.has(value)
  ) return value as LivingActorTraversabilitySurface;
  if (!plainRecord(value) || !exactKeys(value, [
    "cells",
    "forActorId",
    "heightTiles",
    "origin",
    "sampledAtTick",
    "version",
    "widthTiles",
  ])) return null;
  if (
    value.version !== LIVING_ACTOR_TRAVERSABILITY_VERSION
    || !validId(value.forActorId)
    || !nonnegativeSafeInteger(value.sampledAtTick)
    || !isWorldPosition(value.origin)
    || value.origin.localX % WORLD_POSITION_UNITS_PER_TILE !== 0
    || value.origin.localY % WORLD_POSITION_UNITS_PER_TILE !== 0
    || !positiveSafeInteger(value.widthTiles)
    || !positiveSafeInteger(value.heightTiles)
    || value.widthTiles > MAX_LIVING_ACTOR_TRAVERSABILITY_AXIS_TILES
    || value.heightTiles > MAX_LIVING_ACTOR_TRAVERSABILITY_AXIS_TILES
    || value.widthTiles * value.heightTiles > MAX_LIVING_ACTOR_TRAVERSABILITY_CELLS
    || !Array.isArray(value.cells)
    || value.cells.length !== value.widthTiles * value.heightTiles
  ) return null;

  const cells: LivingActorTraversabilityCell[] = [];
  for (const rawCell of value.cells as readonly unknown[]) {
    const cell = canonicalCell(rawCell);
    if (cell === null) return null;
    cells.push(cell);
  }
  try {
    createSpatialFrame(
      value.origin,
      value.widthTiles * WORLD_POSITION_UNITS_PER_TILE,
      value.heightTiles * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
  const surface = Object.freeze({
    version: LIVING_ACTOR_TRAVERSABILITY_VERSION,
    forActorId: value.forActorId,
    sampledAtTick: value.sampledAtTick,
    origin: clonePosition(value.origin),
    widthTiles: value.widthTiles,
    heightTiles: value.heightTiles,
    cells: Object.freeze(cells),
  });
  CANONICAL_TRAVERSABILITY_SURFACES.add(surface);
  return surface;
}

function canonicalCell(value: unknown): LivingActorTraversabilityCell | null {
  if (!plainRecord(value) || !exactKeys(value, ["access", "travelCost"])) return null;
  if (value.access !== "open" && value.access !== "blocked" && value.access !== "deep-water") {
    return null;
  }
  if (
    !nonnegativeSafeInteger(value.travelCost)
    || (value.access === "open" && value.travelCost === 0)
    || (value.access !== "open" && value.travelCost !== 0)
    || value.travelCost > 1_000_000
  ) return null;
  return Object.freeze({ access: value.access, travelCost: value.travelCost });
}

function canonicalArea(value: unknown): ObservedArea | null {
  if (!plainRecord(value) || !exactKeys(value, ["center", "radiusUnits"])) return null;
  if (
    !isWorldPosition(value.center)
    || !nonnegativeSafeInteger(value.radiusUnits)
    || value.radiusUnits > MAX_OBSERVED_AREA_RADIUS_UNITS
  ) return null;
  return cloneArea({ center: value.center, radiusUnits: value.radiusUnits });
}

function canonicalSearchProbe(value: unknown): LivingActorSearchProbe | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "beliefKey",
    "id",
    "probeArea",
    "probeOrdinal",
    "requestId",
    "sourceArea",
    "version",
  ])) return null;
  if (
    value.version !== LIVING_ACTOR_SEARCH_PROBE_VERSION
    || !validId(value.id)
    || !validId(value.requestId)
    || !validBeliefKey(value.beliefKey)
    || !nonnegativeSafeInteger(value.probeOrdinal)
  ) return null;
  const sourceArea = canonicalArea(value.sourceArea);
  const probeArea = canonicalArea(value.probeArea);
  if (sourceArea === null || probeArea === null || probeArea.radiusUnits !== 0) return null;
  const derived = deriveProbeArea(
    value.requestId,
    value.beliefKey,
    value.probeOrdinal,
    sourceArea,
  );
  if (
    derived === null
    || stableStringify(derived) !== stableStringify(probeArea)
    || value.id !== searchProbeId(
      value.requestId,
      value.beliefKey,
      value.probeOrdinal,
      sourceArea,
      probeArea,
    )
  ) return null;
  return freezeSearchProbe({
    version: LIVING_ACTOR_SEARCH_PROBE_VERSION,
    id: value.id,
    requestId: value.requestId,
    beliefKey: value.beliefKey,
    probeOrdinal: value.probeOrdinal,
    sourceArea,
    probeArea,
  });
}

function deriveProbeArea(
  requestId: string,
  beliefKey: string,
  probeOrdinal: number,
  sourceArea: ObservedArea,
): ObservedArea | null {
  let center = sourceArea.center;
  if (probeOrdinal > 0 && sourceArea.radiusUnits > 0) {
    const digest = hashCanonical({ requestId, beliefKey, probeOrdinal, sourceArea });
    const direction = Number.parseInt(digest.slice(0, 2), 16) % SEARCH_PROBE_DIRECTIONS.length;
    const vector = SEARCH_PROBE_DIRECTIONS[direction];
    if (vector === undefined) return null;
    const radius = Math.floor(sourceArea.radiusUnits * 3 / 4);
    const diagonalComponent = Math.floor(radius * 707_106 / 1_000_000);
    const magnitude = vector.x !== 0 && vector.y !== 0 ? diagonalComponent : radius;
    try {
      center = translateProbeCenter(
        sourceArea.center,
        vector.x * magnitude,
        vector.y * magnitude,
      );
    } catch {
      // At the numeric world's absolute representational edge, falling back to
      // the known center is safer than inventing an out-of-range search point.
      center = sourceArea.center;
    }
  }
  const probe = cloneArea({ center, radiusUnits: 0 });
  return isInsideObservedArea(probe.center, sourceArea) ? probe : null;
}

const SEARCH_PROBE_DIRECTIONS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 1, y: 1 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: -1, y: 1 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: -1, y: -1 }),
  Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: 1, y: -1 }),
]);

function translateProbeCenter(
  center: WorldPosition,
  deltaX: number,
  deltaY: number,
): WorldPosition {
  // Kept behind one small adapter so probe derivation can never flatten an
  // extreme segmented coordinate into an imprecise global Number.
  return translateWorldPosition(center, deltaX, deltaY);
}

function searchProbeId(
  requestId: string,
  beliefKey: string,
  probeOrdinal: number,
  sourceArea: ObservedArea,
  probeArea: ObservedArea,
): string {
  return `living-probe:${hashCanonical({
    requestId,
    beliefKey,
    probeOrdinal,
    sourceArea,
    probeArea,
  })}`;
}

function freezeSearchProbe(probe: LivingActorSearchProbe): LivingActorSearchProbe {
  return Object.freeze({
    ...probe,
    sourceArea: cloneArea(probe.sourceArea),
    probeArea: cloneArea(probe.probeArea),
  });
}

function buildGoalSet(
  surface: LivingActorTraversabilitySurface,
  target: SpatialFramePoint,
  radiusUnits: number,
): GoalSet | null {
  const minimumX = clamp(
    Math.floor((target.x - radiusUnits) / WORLD_POSITION_UNITS_PER_TILE),
    0,
    surface.widthTiles - 1,
  );
  const maximumX = clamp(
    Math.floor((target.x + radiusUnits) / WORLD_POSITION_UNITS_PER_TILE),
    0,
    surface.widthTiles - 1,
  );
  const minimumY = clamp(
    Math.floor((target.y - radiusUnits) / WORLD_POSITION_UNITS_PER_TILE),
    0,
    surface.heightTiles - 1,
  );
  const maximumY = clamp(
    Math.floor((target.y + radiusUnits) / WORLD_POSITION_UNITS_PER_TILE),
    0,
    surface.heightTiles - 1,
  );
  const mask = new Uint8Array(surface.cells.length);
  let count = 0;
  let actualMinimumX = surface.widthTiles;
  let actualMaximumX = -1;
  let actualMinimumY = surface.heightTiles;
  let actualMaximumY = -1;
  const radiusSquared = BigInt(radiusUnits) * BigInt(radiusUnits);
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const index = tileIndex(x, y, surface.widthTiles);
      if (!isOpen(surface.cells[index])) continue;
      const closest = closestPointInTile(x, y, target);
      const deltaX = BigInt(closest.x - target.x);
      const deltaY = BigInt(closest.y - target.y);
      if (deltaX * deltaX + deltaY * deltaY > radiusSquared) continue;
      mask[index] = 1;
      count += 1;
      actualMinimumX = Math.min(actualMinimumX, x);
      actualMaximumX = Math.max(actualMaximumX, x);
      actualMinimumY = Math.min(actualMinimumY, y);
      actualMaximumY = Math.max(actualMaximumY, y);
    }
  }
  if (count === 0) return null;
  return Object.freeze({
    mask,
    minimumX: actualMinimumX,
    maximumX: actualMaximumX,
    minimumY: actualMinimumY,
    maximumY: actualMaximumY,
  });
}

function findRoute(
  surface: LivingActorTraversabilitySurface,
  startIndex: number,
  goals: GoalSet,
): readonly number[] | null {
  const gScore = new Float64Array(surface.cells.length);
  gScore.fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(surface.cells.length);
  cameFrom.fill(-1);
  const closed = new Uint8Array(surface.cells.length);
  const minimumCost = surface.cells.reduce(
    (minimum, cell) => cell.access === "open" ? Math.min(minimum, cell.travelCost) : minimum,
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(minimumCost)) return null;

  const heap: SearchNode[] = [];
  const startHeuristic = routeHeuristic(startIndex, surface.widthTiles, goals, minimumCost);
  gScore[startIndex] = 0;
  heapPush(heap, {
    index: startIndex,
    g: 0,
    h: startHeuristic,
    f: startHeuristic,
  });

  while (heap.length > 0) {
    const current = heapPop(heap);
    if (current === undefined) break;
    if (closed[current.index] === 1 || current.g !== gScore[current.index]) continue;
    if (goals.mask[current.index] === 1) {
      return reconstructRoute(cameFrom, startIndex, current.index);
    }
    closed[current.index] = 1;
    const x = current.index % surface.widthTiles;
    const y = Math.floor(current.index / surface.widthTiles);
    for (const [offsetX, offsetY] of NEIGHBOR_OFFSETS) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (
        nextX < 0
        || nextY < 0
        || nextX >= surface.widthTiles
        || nextY >= surface.heightTiles
      ) continue;
      const nextIndex = tileIndex(nextX, nextY, surface.widthTiles);
      const nextCell = surface.cells[nextIndex];
      if (!isOpen(nextCell) || closed[nextIndex] === 1) continue;
      if (offsetX !== 0 && offsetY !== 0) {
        const horizontal = surface.cells[tileIndex(nextX, y, surface.widthTiles)];
        const vertical = surface.cells[tileIndex(x, nextY, surface.widthTiles)];
        if (!isOpen(horizontal) || !isOpen(vertical)) continue;
      }
      const baseCost = offsetX === 0 || offsetY === 0
        ? CARDINAL_COST_UNITS
        : DIAGONAL_COST_UNITS;
      const tentativeG = current.g + baseCost * nextCell.travelCost;
      if (!Number.isSafeInteger(tentativeG) || tentativeG >= gScore[nextIndex]!) continue;
      cameFrom[nextIndex] = current.index;
      gScore[nextIndex] = tentativeG;
      const h = routeHeuristic(nextIndex, surface.widthTiles, goals, minimumCost);
      heapPush(heap, { index: nextIndex, g: tentativeG, h, f: tentativeG + h });
    }
  }
  return null;
}

const NEIGHBOR_OFFSETS = Object.freeze([
  Object.freeze([1, 0] as const),
  Object.freeze([0, 1] as const),
  Object.freeze([-1, 0] as const),
  Object.freeze([0, -1] as const),
  Object.freeze([1, 1] as const),
  Object.freeze([-1, 1] as const),
  Object.freeze([-1, -1] as const),
  Object.freeze([1, -1] as const),
]);

function routeHeuristic(
  index: number,
  width: number,
  goals: GoalSet,
  minimumCost: number,
): number {
  const x = index % width;
  const y = Math.floor(index / width);
  const deltaX = x < goals.minimumX
    ? goals.minimumX - x
    : x > goals.maximumX ? x - goals.maximumX : 0;
  const deltaY = y < goals.minimumY
    ? goals.minimumY - y
    : y > goals.maximumY ? y - goals.maximumY : 0;
  const diagonal = Math.min(deltaX, deltaY);
  const cardinal = Math.max(deltaX, deltaY) - diagonal;
  return (diagonal * DIAGONAL_COST_UNITS + cardinal * CARDINAL_COST_UNITS) * minimumCost;
}

function reconstructRoute(
  cameFrom: Int32Array,
  startIndex: number,
  goalIndex: number,
): readonly number[] | null {
  const reverse: number[] = [goalIndex];
  let current = goalIndex;
  while (current !== startIndex) {
    current = cameFrom[current] ?? -1;
    if (current < 0 || reverse.length > cameFrom.length) return null;
    reverse.push(current);
  }
  reverse.reverse();
  return Object.freeze(reverse);
}

function moveAlongPolyline(
  origin: SpatialFramePoint,
  waypoints: readonly SpatialFramePoint[],
  maximumStepUnits: number,
): Readonly<{
  point: SpatialFramePoint;
  points: readonly SpatialFramePoint[];
  distanceUnits: number;
}> {
  let point = { x: origin.x, y: origin.y };
  const points: SpatialFramePoint[] = [Object.freeze({ ...point })];
  let remaining = maximumStepUnits;
  let consumed = 0;
  for (const waypoint of waypoints) {
    const deltaX = waypoint.x - point.x;
    const deltaY = waypoint.y - point.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length === 0) continue;
    const chargedLength = Math.ceil(length);
    if (chargedLength <= remaining) {
      point = { x: waypoint.x, y: waypoint.y };
      points.push(Object.freeze({ ...point }));
      remaining -= chargedLength;
      consumed += chargedLength;
      if (remaining === 0) break;
      continue;
    }
    let stepX = Math.trunc(deltaX * remaining / length);
    let stepY = Math.trunc(deltaY * remaining / length);
    if (stepX === 0 && stepY === 0 && remaining > 0) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) stepX = Math.sign(deltaX);
      else stepY = Math.sign(deltaY);
    }
    let actual = Math.ceil(Math.hypot(stepX, stepY));
    while (actual > remaining && (stepX !== 0 || stepY !== 0)) {
      if (Math.abs(stepX) >= Math.abs(stepY) && stepX !== 0) stepX -= Math.sign(stepX);
      else if (stepY !== 0) stepY -= Math.sign(stepY);
      actual = Math.ceil(Math.hypot(stepX, stepY));
    }
    point = { x: point.x + stepX, y: point.y + stepY };
    if (stepX !== 0 || stepY !== 0) points.push(Object.freeze({ ...point }));
    consumed += actual;
    break;
  }
  return Object.freeze({
    point: Object.freeze(point),
    points: Object.freeze(points),
    distanceUnits: consumed,
  });
}

function heapPush(heap: SearchNode[], value: SearchNode): void {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const parentValue = heap[parent];
    if (parentValue === undefined || compareNode(parentValue, value) <= 0) break;
    heap[index] = parentValue;
    index = parent;
  }
  heap[index] = value;
}

function heapPop(heap: SearchNode[]): SearchNode | undefined {
  const first = heap[0];
  const tail = heap.pop();
  if (first === undefined || tail === undefined || heap.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    let child = left;
    if (
      right < heap.length
      && heap[right] !== undefined
      && heap[left] !== undefined
      && compareNode(heap[right]!, heap[left]!) < 0
    ) child = right;
    const childValue = heap[child];
    if (childValue === undefined || compareNode(tail, childValue) <= 0) break;
    heap[index] = childValue;
    index = child;
  }
  heap[index] = tail;
  return first;
}

function compareNode(left: SearchNode, right: SearchNode): number {
  return left.f - right.f
    || left.h - right.h
    || left.g - right.g
    || left.index - right.index;
}

function noMove(
  input: CanonicalLocomotionInput,
  reason: Exclude<LivingActorNoMoveReason, "invalid-input">,
): LivingActorNoMoveResolution {
  return Object.freeze({
    version: LIVING_ACTOR_LOCOMOTION_VERSION,
    kind: "no-move",
    requestId: input.requestId,
    tick: input.tick,
    actor: input.actor,
    targetArea: input.targetArea,
    ...(input.searchProbe === null ? {} : { searchProbe: input.searchProbe }),
    reason,
  });
}

function invalidResolution(): LivingActorNoMoveResolution {
  return Object.freeze({
    version: LIVING_ACTOR_LOCOMOTION_VERSION,
    kind: "no-move",
    requestId: null,
    tick: null,
    actor: null,
    targetArea: null,
    reason: "invalid-input",
  });
}

function isInsideObservedArea(position: WorldPosition, area: ObservedArea): boolean {
  try {
    const delta = worldPositionDelta(position, area.center);
    const x = BigInt(delta.x);
    const y = BigInt(delta.y);
    const radius = BigInt(area.radiusUnits);
    return x * x + y * y <= radius * radius;
  } catch {
    return false;
  }
}

function closestPointInTileToTarget(
  index: number,
  width: number,
  target: SpatialFramePoint,
): SpatialFramePoint {
  return closestPointInTile(index % width, Math.floor(index / width), target);
}

function closestPointInTile(
  tileX: number,
  tileY: number,
  target: SpatialFramePoint,
): SpatialFramePoint {
  const minimumX = tileX * WORLD_POSITION_UNITS_PER_TILE;
  const minimumY = tileY * WORLD_POSITION_UNITS_PER_TILE;
  return Object.freeze({
    x: clamp(target.x, minimumX, minimumX + WORLD_POSITION_UNITS_PER_TILE - 1),
    y: clamp(target.y, minimumY, minimumY + WORLD_POSITION_UNITS_PER_TILE - 1),
  });
}

function tileCenter(index: number, width: number): SpatialFramePoint {
  const x = index % width;
  const y = Math.floor(index / width);
  return Object.freeze({
    x: x * WORLD_POSITION_UNITS_PER_TILE + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
    y: y * WORLD_POSITION_UNITS_PER_TILE + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
  });
}

function tileIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

function headingFromDelta(deltaX: number, deltaY: number): number {
  const radians = Math.atan2(deltaY, deltaX);
  const turns = radians / (Math.PI * 2);
  const normalized = turns - Math.floor(turns);
  const heading = Math.round(normalized * 1_000_000) % 1_000_000;
  return Object.is(heading, -0) ? 0 : heading;
}

function isOpen(
  cell: LivingActorTraversabilityCell | undefined,
): cell is LivingActorTraversabilityCell & { readonly access: "open" } {
  return cell?.access === "open";
}

function samePoint(
  left: SpatialFramePoint | undefined,
  right: SpatialFramePoint,
): boolean {
  return left !== undefined && left.x === right.x && left.y === right.y;
}

function cloneArea(area: ObservedArea): ObservedArea {
  return Object.freeze({ center: clonePosition(area.center), radiusUnits: area.radiusUnits });
}

function clonePosition(position: WorldPosition): WorldPosition {
  return Object.freeze({
    region: Object.freeze({ x: position.region.x, y: position.region.y }),
    localX: position.localX,
    localY: position.localY,
  });
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validBeliefKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 280
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && !Object.is(value, -0);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}
