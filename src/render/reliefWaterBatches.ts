import {
  quantizeWaterPresentation,
  visibleWaterPresentation,
  type WaterPresentation,
} from "./waterPresentation";
import type { TerrainGridView } from "./types";
import { currentTerrainVisibility } from "./perceptionPresentation";

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
 * Relief's water sheet is a presentation material, not a lit copy of the
 * biome underneath it. These deliberately blue, discrete bands keep water
 * legible from an oblique camera without pretending that color is an exact
 * sounding. Unsounded water is already normalized to the channel band by the
 * shared discovery contract before it reaches this palette.
 */
export const RELIEF_WATER_PALETTE = {
  deep: "#0b3768",
  channel: "#175d8d",
  shallows: "#2f88b5",
  horizon: "#061729",
  tideGlint: "#78bce3",
} as const;

/**
 * Relief water sits over a warm lit terrain mesh. Any translucency lets that
 * yellow/green under-material change the apparent water hue as camera angle
 * and zoom alter how much bed is visible. Current sensory falloff therefore
 * lives in the authored RGB (toward a blue-black horizon), while submitted
 * water remains opaque and cannot inherit the biome below it.
 */
export function reliefWaterOpacity(material: WaterPresentation): number {
  return material.visibility > 0 ? 255 : 0;
}

/**
 * Returns the complete unlit Relief albedo. Biome colors, biome accents,
 * directional lights and fog never enter this function; tide contributes only
 * a restrained blue glint. The three bands are qualitative hints. The HUD and
 * a deliberate sounding remain authoritative for actual depth.
 */
export function reliefWaterSurfaceColor(material: WaterPresentation): string {
  const depthBlue = RELIEF_WATER_PALETTE[material.band];
  const tideBlue = mixHex(
    depthBlue,
    RELIEF_WATER_PALETTE.tideGlint,
    0.015 + unit(material.tideLevel) * 0.035,
  );
  return mixHex(
    RELIEF_WATER_PALETTE.horizon,
    tideBlue,
    Math.pow(unit(material.visibility), 0.72),
  );
}

/** Pure viewport batching for the opaque, discovery-masked Relief water sheet. */
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
      if (currentTerrainVisibility(tile) <= 0) continue;
      const derivedDepth = unit(tideLevel) * 0.82 - unit(tile.elevation);
      const visible = visibleWaterPresentation(tile, {
        derivedDepth,
        tideLevel,
        // Missing values are legacy views, where discovery already defaults
        // to visible. Only an explicit present-tense grade can reveal an
        // otherwise uncharted water surface.
        transientVisibility: tile.currentVisibility ?? 0,
        visibilityCap: currentTerrainVisibility(tile),
      });
      if (!visible) continue;
      const material = quantizeWaterPresentation(visible);
      if (material.visibility <= 0) continue;
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

function mixHex(left: string, right: string, amount: number): string {
  const first = parseHex(left);
  const second = parseHex(right);
  const blend = unit(amount);
  const channel = (index: number): string => Math.round(
    (first[index] ?? 0) + ((second[index] ?? 0) - (first[index] ?? 0)) * blend,
  ).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(value: string): readonly number[] {
  const hex = /^#[0-9a-f]{6}$/iu.test(value) ? value.slice(1) : "000000";
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}
