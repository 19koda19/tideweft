import type { TerrainGridView, TerrainTileView, WorldPoint } from "./types";
import { currentTerrainVisibility } from "./perceptionPresentation";

export const MAX_SURFACE_CURRENT_CUES = 280;

export interface SurfaceCurrentCueBounds {
  readonly firstColumn: number;
  readonly lastColumn: number;
  readonly firstRow: number;
  readonly lastRow: number;
}

export interface SurfaceCurrentCueOptions {
  readonly bounds?: Partial<SurfaceCurrentCueBounds>;
  readonly focus?: WorldPoint;
  readonly tideLevel?: number;
  readonly timeMs?: number;
  readonly reducedMotion?: boolean;
  readonly maxCues?: number;
}

/** Fixed-size arrow geometry. Presence says only "charted water flows this way." */
export interface SurfaceCurrentCue {
  readonly id: string;
  readonly tileIndex: number;
  readonly column: number;
  readonly row: number;
  readonly center: WorldPoint;
  readonly direction: WorldPoint;
  readonly tail: WorldPoint;
  readonly tip: WorldPoint;
  readonly headLeft: WorldPoint;
  readonly headRight: WorldPoint;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));

const unit = (value: number | undefined, fallback = 0): number =>
  clamp(value ?? fallback, 0, 1);

const hash01 = (column: number, row: number): number => {
  let value = Math.imul((column | 0) ^ 0x51ed270b, 0x45d9f3b);
  value ^= Math.imul((row | 0) ^ 0x63757272, 0x27d4eb2d);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_295;
};

const squaredDistance = (left: WorldPoint, right: WorldPoint): number => {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
};

function normalizedDirection(direction: WorldPoint | undefined): WorldPoint | null {
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return null;
  const length = Math.hypot(direction.x, direction.y);
  if (length <= 0.000_001) return null;
  return { x: direction.x / length, y: direction.y / length };
}

function chartedWater(
  tile: TerrainTileView | undefined,
  tideLevel: number,
): boolean {
  if (!tile || unit(tile.discovered, 1) <= 0.08) return false;
  if (currentTerrainVisibility(tile) < 1) return false;
  const derivedDepth = clamp(unit(tideLevel) * 0.82 - unit(tile.elevation), 0, 1);
  // Depth is used only as the same wet/dry mask already drawn by each view.
  // Cue density, length, motion, and opacity never depend on its magnitude.
  return unit(tile.waterDepth, derivedDepth) > 0.015;
}

function cueForTile(
  grid: TerrainGridView,
  tileIndex: number,
  column: number,
  row: number,
  direction: WorldPoint,
  timeMs: number,
  reducedMotion: boolean,
): SurfaceCurrentCue {
  const tileSize = Math.max(0.1, Number.isFinite(grid.tileSize) ? grid.tileSize : 0.1);
  const originX = Number.isFinite(grid.origin.x) ? grid.origin.x : 0;
  const originY = Number.isFinite(grid.origin.y) ? grid.origin.y : 0;
  const tileCenter = {
    x: originX + (column + 0.5) * tileSize,
    y: originY + (row + 0.5) * tileSize,
  };
  const phase = reducedMotion
    ? 0.5
    : ((Math.max(0, Number.isFinite(timeMs) ? timeMs : 0) * 0.000_22 + hash01(column, row)) % 1);
  const drift = (phase - 0.5) * tileSize * 0.18;
  const center = {
    x: tileCenter.x + direction.x * drift,
    y: tileCenter.y + direction.y * drift,
  };
  const halfShaft = tileSize * 0.23;
  const headLength = tileSize * 0.14;
  const headWidth = tileSize * 0.105;
  const tail = {
    x: center.x - direction.x * halfShaft,
    y: center.y - direction.y * halfShaft,
  };
  const tip = {
    x: center.x + direction.x * halfShaft,
    y: center.y + direction.y * halfShaft,
  };
  const headBase = {
    x: tip.x - direction.x * headLength,
    y: tip.y - direction.y * headLength,
  };
  const perpendicular = { x: -direction.y, y: direction.x };
  return {
    id: `surface-current-${tileIndex}`,
    tileIndex,
    column,
    row,
    center,
    direction,
    tail,
    tip,
    headLeft: {
      x: headBase.x + perpendicular.x * headWidth,
      y: headBase.y + perpendicular.y * headWidth,
    },
    headRight: {
      x: headBase.x - perpendicular.x * headWidth,
      y: headBase.y - perpendicular.y * headWidth,
    },
  };
}

/**
 * Builds a sparse, bounded current overlay for both renderers.
 *
 * At most one wet tile is chosen from each world-aligned 2x2 block. Choosing
 * that tile never considers depth magnitude, so an unsounded channel cannot
 * disclose its bathymetry through arrow density or shape.
 */
export function buildSurfaceCurrentCues(
  grid: TerrainGridView,
  directionValue: WorldPoint | undefined,
  options: SurfaceCurrentCueOptions = {},
): readonly SurfaceCurrentCue[] {
  const direction = normalizedDirection(directionValue);
  const columns = Math.max(0, Math.floor(Number.isFinite(grid.columns) ? grid.columns : 0));
  const rows = Math.max(0, Math.floor(Number.isFinite(grid.rows) ? grid.rows : 0));
  if (!direction || columns === 0 || rows === 0) return [];

  const firstColumn = Math.floor(clamp(options.bounds?.firstColumn ?? 0, 0, columns - 1));
  const lastColumn = Math.ceil(clamp(options.bounds?.lastColumn ?? columns - 1, firstColumn, columns - 1));
  const firstRow = Math.floor(clamp(options.bounds?.firstRow ?? 0, 0, rows - 1));
  const lastRow = Math.ceil(clamp(options.bounds?.lastRow ?? rows - 1, firstRow, rows - 1));
  const tileSize = Math.max(0.1, Number.isFinite(grid.tileSize) ? grid.tileSize : 0.1);
  const focus = options.focus ?? {
    x: grid.origin.x + ((firstColumn + lastColumn + 1) / 2) * tileSize,
    y: grid.origin.y + ((firstRow + lastRow + 1) / 2) * tileSize,
  };
  const candidates: Array<{
    readonly tileIndex: number;
    readonly column: number;
    readonly row: number;
    readonly point: WorldPoint;
    readonly order: number;
  }> = [];

  const blockStartColumn = Math.floor(firstColumn / 2) * 2;
  const blockStartRow = Math.floor(firstRow / 2) * 2;
  for (let blockRow = blockStartRow; blockRow <= lastRow; blockRow += 2) {
    for (let blockColumn = blockStartColumn; blockColumn <= lastColumn; blockColumn += 2) {
      let chosen: (typeof candidates)[number] | null = null;
      for (let row = Math.max(firstRow, blockRow); row <= Math.min(lastRow, blockRow + 1); row += 1) {
        for (let column = Math.max(firstColumn, blockColumn); column <= Math.min(lastColumn, blockColumn + 1); column += 1) {
          const tileIndex = row * columns + column;
          if (!chartedWater(grid.tiles[tileIndex], options.tideLevel ?? 0)) continue;
          const candidate = {
            tileIndex,
            column,
            row,
            point: {
              x: grid.origin.x + (column + 0.5) * tileSize,
              y: grid.origin.y + (row + 0.5) * tileSize,
            },
            order: hash01(column, row),
          };
          if (!chosen || candidate.order < chosen.order) chosen = candidate;
        }
      }
      if (chosen) candidates.push(chosen);
    }
  }

  candidates.sort((left, right) =>
    squaredDistance(left.point, focus) - squaredDistance(right.point, focus)
      || left.tileIndex - right.tileIndex,
  );
  const requestedMaximum = Number.isFinite(options.maxCues)
    ? Math.max(0, Math.floor(options.maxCues ?? MAX_SURFACE_CURRENT_CUES))
    : MAX_SURFACE_CURRENT_CUES;
  const maximum = Math.min(MAX_SURFACE_CURRENT_CUES, requestedMaximum);
  return candidates.slice(0, maximum).map((candidate) => cueForTile(
    grid,
    candidate.tileIndex,
    candidate.column,
    candidate.row,
    direction,
    options.timeMs ?? 0,
    options.reducedMotion ?? false,
  ));
}
