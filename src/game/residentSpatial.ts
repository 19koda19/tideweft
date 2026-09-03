import { createRegionCoord, globalTileToRegion } from "../sim/regions";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type ResidentState,
  type WorldView,
} from "../sim/types";
import type { PlayerState } from "./player";
import type { RegionalTerrainWindow } from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  spatialFrameToWorldPosition,
  worldPositionToSpatialFrame,
  type WorldPosition,
} from "./worldPosition";

const COMPATIBILITY_REGION = createRegionCoord(0, 0);
const TILE_CENTER_UNITS = WORLD_POSITION_UNITS_PER_TILE / 2;

const SETTLEMENT_RESIDENT_OFFSETS = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [-1, 1], [-1, -1], [1, -1],
  [2, 0], [0, 2], [-2, 0], [0, -2],
] as const;

/** One compatibility human's authoritative physical point and occupied tile. */
export interface ResidentWorldPlacement {
  readonly position: WorldPosition;
  readonly occupiedTile: WorldPosition;
  readonly compatibilityTileIndex: number;
  readonly facing: number;
  readonly progress: number;
}

/** Fixed-point placement inside a bounded moving terrain window. */
export interface ResidentWindowPlacement {
  readonly tileIndex: number;
  readonly position: { readonly x: number; readonly y: number };
  readonly facing: number;
  readonly progress: number;
}

/**
 * Resolve one existing compatibility resident without consulting a render
 * projection. Existing humans currently belong only to storage region 0,0;
 * generated regional populations must enter through a later shared actor
 * address contract rather than cloning these people into distant regions.
 */
export function resolveResidentWorldPlacement(
  economy: WorldView,
  resident: ResidentState,
): ResidentWorldPlacement | null {
  if (!isCompatibilityEconomy(economy)) return null;
  return resident.location.kind === "route"
    ? resolveResidentRouteWorldPlacement(economy, resident)
    : resolveResidentSettlementWorldPlacement(economy, resident);
}

/** Resolve only a route location, failing closed on malformed or nonlocal paths. */
export function resolveResidentRouteWorldPlacement(
  economy: WorldView,
  resident: ResidentState,
): ResidentWorldPlacement | null {
  if (
    !isCompatibilityEconomy(economy)
    || !economy.residents.some((candidate) =>
      candidate.id === resident.id
      && candidate.identity.stableId === resident.identity.stableId
    )
    || resident.location.kind !== "route"
  ) return null;
  const location = resident.location;
  if (!Number.isSafeInteger(location.progress)) return null;
  const route = economy.routes.find((candidate) => candidate.id === location.routeId);
  if (!route || route.path.length === 0) return null;
  const progressFixed = Math.max(0, Math.min(FIXED_POINT, location.progress));
  if (route.path.length === 1) {
    const tileIndex = route.path[0];
    if (tileIndex === undefined) return null;
    const position = compatibilityTileCenter(economy, tileIndex);
    return position === null
      ? null
      : Object.freeze({
          position,
          occupiedTile: position,
          compatibilityTileIndex: tileIndex,
          facing: 0,
          progress: progressFixed / FIXED_POINT,
        });
  }

  const segmentCount = route.path.length - 1;
  const scaledProgress = progressFixed * segmentCount;
  if (!Number.isSafeInteger(scaledProgress)) return null;
  const fromOffset = Math.min(segmentCount, Math.floor(scaledProgress / FIXED_POINT));
  const toOffset = Math.min(segmentCount, fromOffset + 1);
  const fromIndex = route.path[fromOffset];
  const toIndex = route.path[toOffset];
  if (fromIndex === undefined || toIndex === undefined) return null;
  const fromTile = compatibilityTile(economy, fromIndex);
  const toTile = compatibilityTile(economy, toIndex);
  if (!fromTile || !toTile) return null;
  const tileDx = toTile.x - fromTile.x;
  const tileDy = toTile.y - fromTile.y;
  // Compatibility routes are tile-contiguous. A projected or corrupted route
  // must never be reinterpreted as an authoritative regional actor path.
  if (Math.abs(tileDx) > 1 || Math.abs(tileDy) > 1) return null;

  const segmentProgress = scaledProgress - fromOffset * FIXED_POINT;
  const localX = fromTile.x * WORLD_POSITION_UNITS_PER_TILE
    + TILE_CENTER_UNITS
    + Math.round(tileDx * WORLD_POSITION_UNITS_PER_TILE * segmentProgress / FIXED_POINT);
  const localY = fromTile.y * WORLD_POSITION_UNITS_PER_TILE
    + TILE_CENTER_UNITS
    + Math.round(tileDy * WORLD_POSITION_UNITS_PER_TILE * segmentProgress / FIXED_POINT);
  const position = createWorldPosition(COMPATIBILITY_REGION, localX, localY);
  const occupiedIndex = segmentProgress < FIXED_POINT / 2 ? fromIndex : toIndex;
  const occupiedTile = compatibilityTileCenter(economy, occupiedIndex);
  if (occupiedTile === null) return null;
  return Object.freeze({
    position,
    occupiedTile,
    compatibilityTileIndex: occupiedIndex,
    facing: tileDx === 0 && tileDy === 0 ? 0 : Math.atan2(tileDy, tileDx),
    progress: progressFixed / FIXED_POINT,
  });
}

/** Project a canonical resident into a moving frame without flattening it globally. */
export function residentPlacementInRegionalWindow(
  placement: ResidentWorldPlacement,
  window: Pick<RegionalTerrainWindow, "origin" | "terrain">,
): ResidentWindowPlacement | null {
  const frame = spatialFrameForRegionalWindow(window);
  if (frame === null) return null;
  const point = worldPositionToSpatialFrame(frame, placement.position);
  const occupied = worldPositionToSpatialFrame(frame, placement.occupiedTile);
  if (point === null || occupied === null) return null;
  const tileX = Math.floor(occupied.x / WORLD_POSITION_UNITS_PER_TILE);
  const tileY = Math.floor(occupied.y / WORLD_POSITION_UNITS_PER_TILE);
  if (
    tileX < 0
    || tileY < 0
    || tileX >= window.terrain.width
    || tileY >= window.terrain.height
  ) return null;
  return Object.freeze({
    tileIndex: tileY * window.terrain.width + tileX,
    position: Object.freeze({ x: point.x, y: point.y }),
    facing: placement.facing,
    progress: placement.progress,
  });
}

/** Project region-0 compatibility coordinates into a finite legacy terrain. */
export function residentPlacementInCompatibilityWorld(
  placement: ResidentWorldPlacement,
  width: number,
  height: number,
): ResidentWindowPlacement | null {
  if (!validCompatibilityDimensions(width, height)) return null;
  if (placement.position.region.x !== 0 || placement.position.region.y !== 0) return null;
  const occupiedX = Math.floor(placement.occupiedTile.localX / WORLD_POSITION_UNITS_PER_TILE);
  const occupiedY = Math.floor(placement.occupiedTile.localY / WORLD_POSITION_UNITS_PER_TILE);
  const pointX = placement.position.localX;
  const pointY = placement.position.localY;
  if (
    occupiedX < 0
    || occupiedY < 0
    || occupiedX >= width
    || occupiedY >= height
    || pointX < 0
    || pointY < 0
    || pointX >= width * WORLD_POSITION_UNITS_PER_TILE
    || pointY >= height * WORLD_POSITION_UNITS_PER_TILE
  ) return null;
  return Object.freeze({
    tileIndex: occupiedY * width + occupiedX,
    position: Object.freeze({ x: pointX, y: pointY }),
    facing: placement.facing,
    progress: placement.progress,
  });
}

/** Resolve the current player point through the same bounded regional frame. */
export function playerWorldPositionInRegionalWindow(
  window: Pick<RegionalTerrainWindow, "origin" | "terrain">,
  player: PlayerState,
): WorldPosition | null {
  const frame = spatialFrameForRegionalWindow(window);
  if (
    frame === null
    || player.worldWidth !== window.terrain.width
    || player.worldHeight !== window.terrain.height
    || !Number.isSafeInteger(player.x)
    || !Number.isSafeInteger(player.y)
    || player.x < 0
    || player.y < 0
    || player.x >= frame.width
    || player.y >= frame.height
  ) return null;
  return spatialFrameToWorldPosition(frame, { x: player.x, y: player.y });
}

function resolveResidentSettlementWorldPlacement(
  economy: WorldView,
  resident: ResidentState,
): ResidentWorldPlacement | null {
  if (resident.location.kind !== "settlement") return null;
  const location = resident.location;
  const settlement = economy.settlements.find(
    ({ id }) => id === location.settlementId,
  );
  if (!settlement) return null;
  const center = compatibilityTile(economy, settlement.tileIndex);
  if (!center) return null;
  const presentResidents = economy.residents
    .filter((candidate) =>
      candidate.location.kind === "settlement"
      && candidate.location.settlementId === settlement.id
    )
    .sort(compareResidentIdentity);
  const ordinal = presentResidents.findIndex((candidate) =>
    candidate.id === resident.id
    && candidate.identity.stableId === resident.identity.stableId
  );
  if (ordinal < 0) return null;
  const chosenIndex = settlementResidentTileIndex(economy, center.x, center.y, ordinal)
    ?? settlement.tileIndex;
  const chosen = compatibilityTile(economy, chosenIndex);
  const position = compatibilityTileCenter(economy, chosenIndex);
  if (!chosen || position === null) return null;
  return Object.freeze({
    position,
    occupiedTile: position,
    compatibilityTileIndex: chosenIndex,
    facing: chosen.x === center.x && chosen.y === center.y
      ? 0
      : Math.atan2(center.y - chosen.y, center.x - chosen.x),
    progress: 0,
  });
}

function settlementResidentTileIndex(
  economy: WorldView,
  centerX: number,
  centerY: number,
  ordinal: number,
): number | null {
  const viable: number[] = [];
  const seen = new Set<string>();
  const consider = (dx: number, dy: number): number | null => {
    const key = `${dx},${dy}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const x = centerX + dx;
    const y = centerY + dy;
    if (x < 0 || y < 0 || x >= economy.terrain.width || y >= economy.terrain.height) return null;
    const tileIndex = y * economy.terrain.width + x;
    const tile = compatibilityTile(economy, tileIndex);
    if (!tile || tile.terrain === "deep-water") return null;
    viable.push(tileIndex);
    return viable.length > ordinal ? viable[ordinal] ?? null : null;
  };

  for (const [dx, dy] of SETTLEMENT_RESIDENT_OFFSETS) {
    const result = consider(dx, dy);
    if (result !== null) return result;
  }
  const maximumRadius = Math.max(economy.terrain.width, economy.terrain.height);
  for (let radius = 1; radius <= maximumRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const result = consider(dx, -radius);
      if (result !== null) return result;
    }
    for (let dy = -radius + 1; dy <= radius; dy += 1) {
      const result = consider(radius, dy);
      if (result !== null) return result;
    }
    for (let dx = radius - 1; dx >= -radius; dx -= 1) {
      const result = consider(dx, radius);
      if (result !== null) return result;
    }
    for (let dy = radius - 1; dy >= -radius + 1; dy -= 1) {
      const result = consider(-radius, dy);
      if (result !== null) return result;
    }
  }
  return null;
}

function compatibilityTile(economy: WorldView, tileIndex: number) {
  if (
    !Number.isSafeInteger(tileIndex)
    || tileIndex < 0
    || tileIndex >= economy.terrain.width * economy.terrain.height
  ) return null;
  const tile = economy.terrain.tiles[tileIndex];
  const x = tileIndex % economy.terrain.width;
  const y = Math.floor(tileIndex / economy.terrain.width);
  return tile && tile.index === tileIndex && tile.x === x && tile.y === y ? tile : null;
}

function compatibilityTileCenter(economy: WorldView, tileIndex: number): WorldPosition | null {
  const tile = compatibilityTile(economy, tileIndex);
  return tile
    ? createWorldPosition(
        COMPATIBILITY_REGION,
        tile.x * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_UNITS,
        tile.y * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_UNITS,
      )
    : null;
}

function spatialFrameForRegionalWindow(
  window: Pick<RegionalTerrainWindow, "origin" | "terrain">,
) {
  if (
    !Number.isSafeInteger(window.origin.x)
    || !Number.isSafeInteger(window.origin.y)
    || !Number.isSafeInteger(window.terrain.width)
    || !Number.isSafeInteger(window.terrain.height)
    || window.terrain.width <= 0
    || window.terrain.height <= 0
  ) return null;
  try {
    const address = globalTileToRegion(window.origin.x, window.origin.y);
    return createSpatialFrame(
      createWorldPosition(
        address.region,
        address.localX * WORLD_POSITION_UNITS_PER_TILE,
        address.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      window.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      window.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
}

function isCompatibilityEconomy(economy: WorldView): boolean {
  return validCompatibilityDimensions(economy.terrain.width, economy.terrain.height)
    && economy.terrain.tiles.length === economy.terrain.width * economy.terrain.height;
}

function validCompatibilityDimensions(width: number, height: number): boolean {
  return Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    && width <= WORLD_WIDTH
    && height <= WORLD_HEIGHT;
}

function compareResidentIdentity(left: ResidentState, right: ResidentState): number {
  if (left.identity.stableId < right.identity.stableId) return -1;
  if (left.identity.stableId > right.identity.stableId) return 1;
  return left.id - right.id;
}
