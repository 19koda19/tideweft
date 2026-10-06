import type {
  SettlementView,
  TerrainGridView,
  TerrainTileView,
  TideweftView,
  WorldPoint,
} from "./types";

export interface PlayerPresentationRange {
  readonly closeRangeTiles: number;
  readonly forwardRangeTiles: number;
  readonly forwardConeRadians: number;
}

export const PLAYER_RECOGNITION_PRESENTATION_RANGE: Readonly<PlayerPresentationRange> = Object.freeze({
  closeRangeTiles: 8,
  forwardRangeTiles: 26,
  forwardConeRadians: 13 * Math.PI / 18,
});

export const PLAYER_PICKUP_PRESENTATION_RANGE: Readonly<PlayerPresentationRange> = Object.freeze({
  closeRangeTiles: 8,
  forwardRangeTiles: 10,
  forwardConeRadians: 5 * Math.PI / 9,
});

/**
 * Clear-air presentation clip only. Callers must first establish lawful current
 * direct sight; this geometry never supplies hearing, knowledge or action reach.
 */
export function isWithinPlayerPresentationRange(
  player: Readonly<{ readonly position: WorldPoint; readonly facing: number }>,
  point: WorldPoint,
  tileSize: number,
  profile: Readonly<PlayerPresentationRange>,
): boolean {
  if (
    !player?.position
    || !point
    || !Number.isFinite(player.position.x)
    || !Number.isFinite(player.position.y)
    || !Number.isFinite(player.facing)
    || !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
    || !Number.isFinite(tileSize)
    || tileSize <= 0
    || !Number.isFinite(profile.closeRangeTiles)
    || profile.closeRangeTiles < 0
    || !Number.isFinite(profile.forwardRangeTiles)
    || profile.forwardRangeTiles < profile.closeRangeTiles
    || !Number.isFinite(profile.forwardConeRadians)
    || profile.forwardConeRadians <= 0
    || profile.forwardConeRadians > 2 * Math.PI
  ) return false;

  const dx = (point.x - player.position.x) / tileSize;
  const dy = (point.y - player.position.y) / tileSize;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) return false;
  if (distance <= profile.closeRangeTiles) return true;
  if (distance > profile.forwardRangeTiles) return false;
  const bearing = Math.atan2(dy, dx) - player.facing;
  const angle = Math.abs(Math.atan2(Math.sin(bearing), Math.cos(bearing)));
  return angle <= profile.forwardConeRadians / 2;
}

type PlayerPresentationView = Pick<TideweftView, "terrain" | "player" | "perception">;

function isWithinDisclosedPlayerPresentationRange(
  view: PlayerPresentationView,
  point: WorldPoint,
  profile: Readonly<PlayerPresentationRange>,
): boolean {
  return Boolean(view.terrain && view.player && point)
    && (view.perception === undefined || (view.perception.valid === true
      && isDirectlyDetailPerceived(view.terrain, point, true)))
    && isWithinPlayerPresentationRange(view.player, point, view.terrain.tileSize, profile);
}

/** A visible body may remain outside this optional recognition/inspection tier. */
export function isWithinPlayerRecognitionRange(
  view: PlayerPresentationView,
  point: WorldPoint,
): boolean {
  return isWithinDisclosedPlayerPresentationRange(view, point, PLAYER_RECOGNITION_PRESENTATION_RANGE);
}

/** Visibility of pickup targets, not the physical distance at which pickup succeeds. */
export function isWithinPlayerPickupRange(
  view: PlayerPresentationView,
  point: WorldPoint,
): boolean {
  return isWithinDisclosedPlayerPresentationRange(view, point, PLAYER_PICKUP_PRESENTATION_RANGE);
}

/** Legacy views predate perception and remain fully visible for compatibility. */
export function currentTerrainVisibility(
  tile: TerrainTileView | undefined,
  requireDisclosure = false,
): number {
  if (!tile) return 0;
  const value = tile.currentVisibility;
  if (value === undefined) return requireDisclosure ? 0 : 1;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Exact-detail disclosure shares the player's spatial envelope, but still
 * respects illumination, solid cover and sleep. A production view supplies
 * this field. Requiring disclosure
 * fails closed for malformed or stale views instead of borrowing the broader
 * terrain mask.
 */
export function currentTerrainDetailVisibility(
  tile: TerrainTileView | undefined,
  requireDisclosure = false,
): number {
  if (!tile) return 0;
  const value = tile.currentDetailVisibility;
  if (value === undefined) {
    return requireDisclosure ? 0 : currentTerrainVisibility(tile, false);
  }
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function currentSettlementVisibility(
  settlement: SettlementView,
  requireDisclosure = false,
): number {
  const value = settlement.currentVisibility;
  if (value === undefined) return requireDisclosure ? 0 : 1;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Samples only the disclosed tile grade; out-of-grid and malformed points fail closed. */
export function perceptionVisibilityAt(
  grid: TerrainGridView,
  point: WorldPoint,
  requireDisclosure = false,
): number {
  if (
    !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
    || !Number.isFinite(grid.tileSize)
    || grid.tileSize <= 0
    || !Number.isSafeInteger(grid.columns)
    || !Number.isSafeInteger(grid.rows)
    || grid.columns <= 0
    || grid.rows <= 0
  ) return 0;
  const column = Math.floor((point.x - grid.origin.x) / grid.tileSize);
  const row = Math.floor((point.y - grid.origin.y) / grid.tileSize);
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return 0;
  return currentTerrainVisibility(grid.tiles[row * grid.columns + column], requireDisclosure);
}

/** Samples current exact detail; malformed points fail closed. */
export function detailPerceptionVisibilityAt(
  grid: TerrainGridView,
  point: WorldPoint,
  requireDisclosure = false,
): number {
  if (
    !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
    || !Number.isFinite(grid.tileSize)
    || grid.tileSize <= 0
    || !Number.isSafeInteger(grid.columns)
    || !Number.isSafeInteger(grid.rows)
    || grid.columns <= 0
    || grid.rows <= 0
  ) return 0;
  const column = Math.floor((point.x - grid.origin.x) / grid.tileSize);
  const row = Math.floor((point.y - grid.origin.y) / grid.tileSize);
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return 0;
  return currentTerrainDetailVisibility(grid.tiles[row * grid.columns + column], requireDisclosure);
}

export function isCurrentlyPerceived(
  grid: TerrainGridView,
  point: WorldPoint,
  requireDisclosure = false,
): boolean {
  return perceptionVisibilityAt(grid, point, requireDisclosure) > 0;
}

export function isDirectlyPerceived(
  grid: TerrainGridView,
  point: WorldPoint,
  requireDisclosure = false,
): boolean {
  return perceptionVisibilityAt(grid, point, requireDisclosure) >= 1;
}

export function isCurrentlyDetailPerceived(
  grid: TerrainGridView,
  point: WorldPoint,
  requireDisclosure = false,
): boolean {
  return detailPerceptionVisibilityAt(grid, point, requireDisclosure) > 0;
}

export function isDirectlyDetailPerceived(
  grid: TerrainGridView,
  point: WorldPoint,
  requireDisclosure = false,
): boolean {
  return detailPerceptionVisibilityAt(grid, point, requireDisclosure) >= 1;
}
