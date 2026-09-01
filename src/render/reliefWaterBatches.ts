import {
  quantizeWaterPresentation,
  visibleWaterPresentation,
  type WaterPresentation,
} from "./waterPresentation";
import type { TerrainGridView } from "./types";

export interface ReliefWaterCell {
  readonly column: number;
  readonly row: number;
}

export interface ReliefWaterMaterialBatch {
  readonly material: WaterPresentation;
  readonly cells: readonly ReliefWaterCell[];
}

export interface ReliefWaterBatchBounds {
  readonly firstColumn: number;
  readonly lastColumn: number;
  readonly firstRow: number;
  readonly lastRow: number;
}

/**
 * Relief water sits over a lit terrain mesh, so Chart's translucent alpha can
 * wash out into pale ground. Keep the shared RGB language unchanged while
 * giving each discovery-masked depth band a stronger, monotone alpha floor.
 */
export function reliefWaterOpacity(material: WaterPresentation): number {
  const floor = material.band === "deep"
    ? 255
    : material.band === "channel"
      ? 248
      : 236;
  return integerInRange(
    Math.max(material.opacity, Math.round(floor * unit(material.visibility))),
    0,
    255,
  );
}

/** Pure viewport batching for the translucent Relief water sheet. */
export function buildReliefWaterMaterialBatches(
  grid: TerrainGridView,
  tideLevel: number,
  bounds?: ReliefWaterBatchBounds,
): readonly ReliefWaterMaterialBatch[] {
  if (grid.columns <= 0 || grid.rows <= 0) return [];
  const firstColumn = integerInRange(bounds?.firstColumn ?? 0, 0, grid.columns - 1);
  const lastColumn = integerInRange(bounds?.lastColumn ?? grid.columns - 1, 0, grid.columns - 1);
  const firstRow = integerInRange(bounds?.firstRow ?? 0, 0, grid.rows - 1);
  const lastRow = integerInRange(bounds?.lastRow ?? grid.rows - 1, 0, grid.rows - 1);
  if (firstColumn > lastColumn || firstRow > lastRow) return [];

  const groups = new Map<string, { material: WaterPresentation; cells: ReliefWaterCell[] }>();
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const tile = grid.tiles[row * grid.columns + column];
      if (!tile) continue;
      const derivedDepth = unit(tideLevel) * 0.82 - unit(tile.elevation);
      const visible = visibleWaterPresentation(tile, { derivedDepth, tideLevel });
      if (!visible) continue;
      const material = quantizeWaterPresentation(visible);
      const key = [
        material.band,
        material.biome ?? "legacy",
        material.environment,
        material.visibility,
        material.depth,
        material.tideLevel,
        material.color,
        material.opacity,
      ].join(":");
      const group = groups.get(key) ?? { material, cells: [] };
      group.cells.push({ column, row });
      groups.set(key, group);
    }
  }

  return [...groups.values()].sort((left, right) =>
    left.material.band.localeCompare(right.material.band)
      || (left.material.biome ?? "legacy").localeCompare(right.material.biome ?? "legacy")
      || left.material.depth - right.material.depth
      || left.material.visibility - right.material.visibility
  );
}

function integerInRange(value: number, low: number, high: number): number {
  const finite = Number.isFinite(value) ? Math.trunc(value) : low;
  return Math.max(low, Math.min(high, finite));
}

function unit(value: number | undefined): number {
  const finite = Number.isFinite(value) ? value! : 0;
  return Math.max(0, Math.min(1, finite));
}
