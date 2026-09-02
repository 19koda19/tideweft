import {
  biomeEnvironmentalEmphasis,
  visibleBiomePresentation,
} from "./biomePresentation";
import type { BiomeId, TerrainTileView } from "./types";

export type WaterDepthBand = "shallows" | "channel" | "deep";

/**
 * One water language shared by Chart and Relief. These are the established
 * Chart colors rather than a second, brighter WebGL-only palette.
 */
export const WATER_PRESENTATION_PALETTE = {
  deep: "#08252e",
  channel: "#0d3b44",
  shallows: "#1b5960",
  surface: "#87d8df",
} as const;

export interface WaterPresentation {
  /** Discovery-masked depth. This must never expose a hidden sounding. */
  readonly depth: number;
  /** True only when current detail perception or a durable sounding reveals depth. */
  readonly depthDisclosed: boolean;
  readonly band: WaterDepthBand;
  readonly visibility: number;
  readonly biome?: BiomeId;
  readonly environment: number;
  readonly tideLevel: number;
  readonly baseColor: string;
  readonly biomeColor?: string;
  readonly accentColor: string;
  readonly biomeBlend: number;
  readonly tideLift: number;
  /** Fully composed water color consumed unchanged by both renderers. */
  readonly color: string;
  readonly opacity: number;
  readonly accentOpacity: number;
}

export interface WaterPresentationOptions {
  /** Used only if a projected tile does not carry an explicit live depth. */
  readonly derivedDepth?: number;
  /** Public tide level, used for a restrained global surface tint. */
  readonly tideLevel?: number;
  /**
   * Momentary terrain sight. This can reveal a water surface while it is in
   * view, but it never changes the tile's durable chart confidence.
   */
  readonly transientVisibility?: number;
  /** Optional outer sensory fade applied after durable/transient eligibility. */
  readonly visibilityCap?: number;
}

/**
 * Builds only information that the chart is allowed to reveal. An uncharted
 * tile produces no material at all; partial discovery progressively reveals
 * depth instead of leaking the raw bathymetry through a color band.
 */
export function visibleWaterPresentation(
  tile: TerrainTileView | undefined,
  options: WaterPresentationOptions = {},
): WaterPresentation | undefined {
  if (!tile) return undefined;
  const chartedVisibility = tile.discovered === undefined ? 1 : unit(tile.discovered);
  const eligibleVisibility = Math.max(chartedVisibility, unit(options.transientVisibility));
  const visibility = options.visibilityCap === undefined
    ? eligibleVisibility
    : Math.min(eligibleVisibility, unit(options.visibilityCap));
  if (visibility <= 0) return undefined;

  const depthDisclosed = isWaterDepthDisclosed(tile);
  const actualDepth = visibleWaterDepth(tile, options.derivedDepth);
  const depth = actualDepth * Math.pow(visibility, 0.72);
  if (depth <= 0.015) return undefined;

  const biome = visibleBiomePresentation(tile);
  return composeWaterPresentation({
    depth,
    depthDisclosed,
    visibility,
    environment: biome ? biomeEnvironmentalEmphasis(tile) : 0.5,
    tideLevel: unit(options.tideLevel),
    ...(biome ? {
      biome: biome.id,
      biomeColor: biome.chartColor,
      accentColor: biome.accentColor,
    } : {
      accentColor: WATER_PRESENTATION_PALETTE.surface,
    }),
  });
}

/**
 * Relief batches quantize live signals to keep WebGL draw calls bounded. The
 * resulting material retains the exact same palette/composition as Chart.
 */
export function quantizeWaterPresentation(
  presentation: WaterPresentation,
  steps = 16,
): WaterPresentation {
  const safeSteps = Math.max(1, Math.min(16, Math.round(steps)));
  const quantize = (value: number): number =>
    Math.round(unit(value) * safeSteps) / safeSteps;
  return composeWaterPresentation({
    depth: Math.max(1 / safeSteps, quantize(presentation.depth)),
    depthDisclosed: presentation.depthDisclosed,
    visibility: quantize(presentation.visibility),
    environment: quantize(presentation.environment),
    tideLevel: quantize(presentation.tideLevel),
    ...(presentation.biome ? { biome: presentation.biome } : {}),
    ...(presentation.biomeColor ? { biomeColor: presentation.biomeColor } : {}),
    accentColor: presentation.accentColor,
  });
}

interface WaterSignals {
  readonly depth: number;
  readonly depthDisclosed: boolean;
  readonly visibility: number;
  readonly environment: number;
  readonly tideLevel: number;
  readonly biome?: BiomeId;
  readonly biomeColor?: string;
  readonly accentColor: string;
}

function composeWaterPresentation(signals: WaterSignals): WaterPresentation {
  const depth = unit(signals.depth);
  const visibility = unit(signals.visibility);
  const environment = unit(signals.environment);
  const tideLevel = unit(signals.tideLevel);
  const band = waterDepthBand(depth);
  const baseColor = WATER_PRESENTATION_PALETTE[band];
  const biomeBlend = signals.biomeColor ? 0.06 + environment * 0.08 : 0;
  const tideLift = 0.02 + tideLevel * 0.07;
  const biomeConditioned = signals.biomeColor
    ? mixHexColors(baseColor, signals.biomeColor, biomeBlend)
    : baseColor;
  const color = mixHexColors(biomeConditioned, signals.accentColor, tideLift);
  return {
    depth,
    depthDisclosed: signals.depthDisclosed,
    band,
    visibility,
    ...(signals.biome ? { biome: signals.biome } : {}),
    environment,
    tideLevel,
    baseColor,
    ...(signals.biomeColor ? { biomeColor: signals.biomeColor } : {}),
    accentColor: signals.accentColor,
    biomeBlend,
    tideLift,
    color,
    opacity: Math.round((50 + depth * 150) * visibility),
    accentOpacity: Math.round((28 + depth * 45) * visibility),
  };
}

/**
 * Returns the only water depth a renderer may consume. Broad terrain sight can
 * reveal that a surface is wet, but exact bathymetry remains neutral until the
 * shorter detail field reaches it or the player has deliberately sounded it.
 * Missing detail metadata preserves the fully-visible legacy view contract.
 */
export function visibleWaterDepth(
  tile: TerrainTileView | undefined,
  derivedDepth = 0,
): number {
  if (!tile) return 0;
  const actualDepth = unit(tile.waterDepth, derivedDepth);
  if (actualDepth <= 0 || isWaterDepthDisclosed(tile)) return actualDepth;
  return 0.5;
}

export function isWaterDepthDisclosed(tile: TerrainTileView | undefined): boolean {
  if (!tile) return false;
  if (unit(tile.depthKnown) > 0) return true;
  if (tile.currentDetailVisibility === undefined) return true;
  return Number.isFinite(tile.currentDetailVisibility)
    && tile.currentDetailVisibility >= 1;
}

function waterDepthBand(depth: number): WaterDepthBand {
  if (depth >= 0.7) return "deep";
  if (depth >= 0.35) return "channel";
  return "shallows";
}

function mixHexColors(left: string, right: string, amount: number): string {
  const leftRgb = parseHex(left);
  const rightRgb = parseHex(right);
  const blend = unit(amount);
  const channel = (index: number): string => Math.round(
    (leftRgb[index] ?? 0) + ((rightRgb[index] ?? 0) - (leftRgb[index] ?? 0)) * blend,
  ).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(color: string): readonly number[] {
  const value = /^#[0-9a-f]{6}$/iu.test(color) ? color.slice(1) : "000000";
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function unit(value: number | undefined, fallback = 0): number {
  const finite = Number.isFinite(value) ? value! : fallback;
  return Math.max(0, Math.min(1, finite));
}
