import type { TerrainGridView, TerrainTileView, WorldPoint } from "./types";
import { sampleTerrainMeshLandHeightAt } from "./terrainMesh";
import { currentTerrainVisibility } from "./perceptionPresentation";
import { visibleWaterDepth } from "./waterPresentation";

export type DiscoverySignature = (grid: TerrainGridView) => string;

export interface ReliefTerrainGeometrySignatures {
  /** Complete physical height/depth field used by present-tense sight. */
  readonly physical: string;
  /** Discovery-safe height/depth field used by durable Chart memory. */
  readonly discovered: string;
}

export type TerrainGeometrySignatures = (
  grid: TerrainGridView,
) => ReliefTerrainGeometrySignatures;

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
    waterDepth: visibleWaterDepth(tile) * visibility,
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
  const visibleDepth = visibleWaterDepth(tile) * visibility;
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
  const visibleDepth = visibleWaterDepth(tile);
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

/**
 * Hashes only values that can change Relief mesh geometry. Projection revisions
 * also include clock and weather presentation, so using `revision` as a mesh
 * key needlessly rebuilt both 120 x 120 height fields when their shape had not
 * changed. The discovery-safe signature deliberately follows the exact masked
 * elevation/depth semantics used by `maskReliefTileForDiscovery`.
 */
export function reliefTerrainGeometrySignatures(
  grid: TerrainGridView,
): ReliefTerrainGeometrySignatures {
  let physical = 2_166_136_261;
  let discovered = 2_166_136_261 ^ 0x6d2b_79f5;
  for (let index = 0; index < grid.tiles.length; index += 1) {
    const tile = grid.tiles[index];
    const kind = terrainKindCode(tile?.kind);
    const elevation = unit(tile?.elevation);
    const waterDepth = unit(tile?.waterDepth);
    const visibility = reliefDiscoveryVisibility(tile);
    const visibleDepth = visibleWaterDepth(tile) * visibility;

    physical = hashGeometryWord(physical, index);
    physical = hashGeometryWord(physical, kind);
    physical = hashGeometryUnit(physical, elevation);
    physical = hashGeometryUnit(physical, waterDepth);

    discovered = hashGeometryWord(discovered, index);
    discovered = hashGeometryWord(discovered, kind);
    discovered = hashGeometryUnit(discovered, elevation * visibility);
    discovered = hashGeometryUnit(discovered, visibleDepth);
  }
  return Object.freeze({
    physical: `${grid.tiles.length}:${physical >>> 0}`,
    discovered: `${grid.tiles.length}:${discovered >>> 0}`,
  });
}

/** One geometry scan per immutable projected tile array, shared by both keys. */
export function createReliefTerrainGeometrySignaturesMemo(
  compute: TerrainGeometrySignatures = reliefTerrainGeometrySignatures,
): TerrainGeometrySignatures {
  const signatures = new WeakMap<readonly TerrainTileView[], ReliefTerrainGeometrySignatures>();
  return (grid): ReliefTerrainGeometrySignatures => {
    const remembered = signatures.get(grid.tiles);
    if (remembered) return remembered;
    const signature = compute(grid);
    signatures.set(grid.tiles, signature);
    return signature;
  };
}

function hashGeometryWord(hash: number, word: number): number {
  hash ^= word | 0;
  return Math.imul(hash, 16_777_619);
}

function hashGeometryUnit(hash: number, value: number): number {
  return hashGeometryWord(hash, Math.round(unit(value) * 0xffff_ffff));
}

function terrainKindCode(kind: TerrainTileView["kind"] | undefined): number {
  switch (kind) {
    case "deep-water": return 1;
    case "channel": return 2;
    case "shallows": return 3;
    case "mudflat": return 4;
    case "sandbar": return 5;
    case "salt-marsh": return 6;
    case "meadow": return 7;
    case "scrub": return 8;
    case "ridge": return 9;
    case "built": return 10;
    default: return 0;
  }
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
