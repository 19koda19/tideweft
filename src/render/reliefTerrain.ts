import type { TerrainGridView, TerrainTileView, WorldPoint } from "./types";
import { sampleTerrainMeshLandHeightAt } from "./terrainMesh";
import { currentTerrainVisibility } from "./perceptionPresentation";

export type DiscoverySignature = (grid: TerrainGridView) => string;

const MIN_RENDERED_WATER_DEPTH = 0.002;
const MIN_RENDERED_WATER_VISIBILITY = 0.08;

/** Missing legacy confidence is visible; malformed or missing tiles are not. */
export function reliefDiscoveryVisibility(tile: TerrainTileView | undefined): number {
  if (!tile) return 0;
  return tile.discovered === undefined ? 1 : unit(tile.discovered);
}

/**
 * Returns the terrain values Relief is allowed to reveal. An omitted
 * `discovered` value preserves the renderer contract's backwards-compatible
 * meaning of fully visible; an explicit zero always produces a flat unknown.
 */
export function maskReliefTileForDiscovery(tile: TerrainTileView): TerrainTileView {
  const visibility = reliefDiscoveryVisibility(tile);
  return {
    ...tile,
    elevation: unit(tile.elevation) * visibility,
    waterDepth: unit(tile.waterDepth) * visibility,
  };
}

/**
 * Samples the same discovery-masked tile surface used to build Relief's
 * visible mesh. This must be used for world-space affordances such as picking
 * and label anchors so hidden topography cannot be inferred indirectly.
 */
export function discoveredReliefSurfaceHeightAt(
  grid: TerrainGridView,
  point: WorldPoint,
  verticalScale: number,
  includeWater: boolean,
): number {
  if (grid.columns < 1 || grid.rows < 1 || grid.tileSize <= 0) return 0;
  const scale = Math.max(0, finite(verticalScale, 0));
  const landHeight = sampleTerrainMeshLandHeightAt(
    grid,
    point,
    scale,
    maskedElevation,
  );
  if (!includeWater) return landHeight;
  const column = clampInteger(
    Math.floor((point.x - grid.origin.x) / grid.tileSize),
    0,
    grid.columns - 1,
  );
  const row = clampInteger(
    Math.floor((point.y - grid.origin.y) / grid.tileSize),
    0,
    grid.rows - 1,
  );
  const tile = grid.tiles[row * grid.columns + column];
  if (!tile) return landHeight;
  const visibility = reliefDiscoveryVisibility(tile);
  const visibleDepth = unit(tile.waterDepth) * visibility;
  if (
    visibility <= MIN_RENDERED_WATER_VISIBILITY
    || visibleDepth <= MIN_RENDERED_WATER_DEPTH
  ) {
    return landHeight;
  }

  // Relief draws one flat local water sheet per wet tile. Its level is the
  // discovery-masked triangulated bed at that tile's center plus local masked
  // depth. Returning the upper of that sheet and land matches the actual
  // depth-tested surface at arbitrary points within the tile.
  const waterCenter = {
    x: grid.origin.x + (column + 0.5) * grid.tileSize,
    y: grid.origin.y + (row + 0.5) * grid.tileSize,
  };
  const waterHeight = sampleTerrainMeshLandHeightAt(
    grid,
    waterCenter,
    scale,
    maskedElevation,
  ) + visibleDepth * scale;
  return Math.max(landHeight, waterHeight);
}

/**
 * Samples real surface shape only where the terrain perception field currently
 * reaches. This is presentation-only sight: it does not promote the tile into
 * durable Chart memory, and a hidden uncharted tile still resolves to the
 * discovery-masked surface.
 */
export function perceivedReliefSurfaceHeightAt(
  grid: TerrainGridView,
  point: WorldPoint,
  verticalScale: number,
  includeWater: boolean,
): number {
  if (grid.columns < 1 || grid.rows < 1 || grid.tileSize <= 0) return 0;
  const column = clampInteger(
    Math.floor((point.x - grid.origin.x) / grid.tileSize),
    0,
    grid.columns - 1,
  );
  const row = clampInteger(
    Math.floor((point.y - grid.origin.y) / grid.tileSize),
    0,
    grid.rows - 1,
  );
  const tile = grid.tiles[row * grid.columns + column];
  if (!tile || currentTerrainVisibility(tile, true) <= 0) {
    return discoveredReliefSurfaceHeightAt(grid, point, verticalScale, includeWater);
  }

  const scale = Math.max(0, finite(verticalScale, 0));
  const landHeight = sampleTerrainMeshLandHeightAt(grid, point, scale);
  if (!includeWater) return landHeight;
  const visibleDepth = unit(tile.waterDepth);
  if (visibleDepth <= MIN_RENDERED_WATER_DEPTH) return landHeight;
  const waterCenter = {
    x: grid.origin.x + (column + 0.5) * grid.tileSize,
    y: grid.origin.y + (row + 0.5) * grid.tileSize,
  };
  const waterHeight = sampleTerrainMeshLandHeightAt(grid, waterCenter, scale)
    + visibleDepth * scale;
  return Math.max(landHeight, waterHeight);
}

/** Stable summary of per-tile discovery confidence for the terrain mesh key. */
export function reliefDiscoverySignature(grid: TerrainGridView): string {
  let hash = 2_166_136_261;
  let discovered = 0;
  for (const tile of grid.tiles) {
    const bucket = Math.round(reliefDiscoveryVisibility(tile) * 255);
    discovered += bucket > 0 ? 1 : 0;
    hash ^= bucket;
    hash = Math.imul(hash, 16_777_619);
  }
  return `${discovered}:${hash >>> 0}`;
}

/**
 * Memoizes discovery hashes by immutable tile-array identity. The runtime
 * keeps one projected view between simulation refreshes, so this turns a
 * 6,912-cell per-frame walk into one walk per fresh projection. A replacement
 * tile array is always re-hashed, even when its revision string is unchanged.
 */
export function createReliefDiscoverySignatureMemo(
  compute: DiscoverySignature = reliefDiscoverySignature,
): DiscoverySignature {
  const signatures = new WeakMap<readonly TerrainTileView[], string>();
  return (grid): string => {
    const remembered = signatures.get(grid.tiles);
    if (remembered !== undefined) return remembered;
    const signature = compute(grid);
    signatures.set(grid.tiles, signature);
    return signature;
  };
}

function unit(value: number | undefined, fallback = 0): number {
  return clamp(finite(value, fallback), 0, 1);
}

function maskedElevation(tile: TerrainTileView | undefined): number {
  return unit(tile?.elevation) * reliefDiscoveryVisibility(tile);
}

function clampInteger(value: number, low: number, high: number): number {
  return Math.floor(clamp(value, low, high));
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, finite(value, low)));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
