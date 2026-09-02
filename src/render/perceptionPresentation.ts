import type { SettlementView, TerrainGridView, TerrainTileView, WorldPoint } from "./types";

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
