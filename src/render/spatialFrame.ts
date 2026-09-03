import type { TerrainGridView, WorldPoint } from "./types";

/**
 * Absolute description of one bounded renderer coordinate frame.
 *
 * `worldTileOrigin` identifies the canonical tile represented by the grid's
 * local origin. Keeping this absolute value lets a renderer recover the exact
 * accumulated rebase even when it did not observe intermediate frames.
 */
export interface TerrainSpatialFrame {
  readonly worldTileOrigin: WorldPoint;
  readonly localOrigin: WorldPoint;
  readonly tileSize: number;
}

export function captureTerrainSpatialFrame(
  terrain: TerrainGridView,
): TerrainSpatialFrame | null {
  const worldTileOrigin = terrain.worldTileOrigin;
  if (
    !worldTileOrigin
    || !Number.isSafeInteger(worldTileOrigin.x)
    || !Number.isSafeInteger(worldTileOrigin.y)
    || !Number.isFinite(terrain.origin.x)
    || !Number.isFinite(terrain.origin.y)
    || !Number.isFinite(terrain.tileSize)
    || terrain.tileSize <= 0
  ) return null;
  return {
    worldTileOrigin: { ...worldTileOrigin },
    localOrigin: { ...terrain.origin },
    tileSize: terrain.tileSize,
  };
}

export function terrainSpatialFramesEqual(
  left: TerrainSpatialFrame | null,
  right: TerrainSpatialFrame | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.worldTileOrigin.x === right.worldTileOrigin.x
    && left.worldTileOrigin.y === right.worldTileOrigin.y
    && left.localOrigin.x === right.localOrigin.x
    && left.localOrigin.y === right.localOrigin.y
    && left.tileSize === right.tileSize;
}

/**
 * Return the translation from coordinates in `prior` to the same canonical
 * points in `next`. A tile-size change is not a translation and fails closed.
 */
export function terrainSpatialFrameDelta(
  prior: TerrainSpatialFrame | null,
  next: TerrainSpatialFrame | null,
): WorldPoint | null {
  if (!prior || !next || prior.tileSize !== next.tileSize) return null;
  const x = next.localOrigin.x - prior.localOrigin.x
    + (prior.worldTileOrigin.x - next.worldTileOrigin.x) * next.tileSize;
  const y = next.localOrigin.y - prior.localOrigin.y
    + (prior.worldTileOrigin.y - next.worldTileOrigin.y) * next.tileSize;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
