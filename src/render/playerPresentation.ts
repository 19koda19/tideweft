import type { PlayerBalanceView, WorldPoint } from "./types";

/**
 * One semantic presentation table shared by Chart and Relief. The `mark` and
 * `silhouette` fields are deliberately independent from color so balance
 * remains readable in monochrome, high contrast, and reduced-motion modes.
 */
export interface PlayerBalancePresentation {
  readonly state: PlayerBalanceView;
  readonly label: string;
  readonly fill: string;
  readonly outline: string;
  readonly mark: "keel" | "counterweight" | "skid" | "impact" | "eddy" | "rise";
  readonly silhouette: "upright" | "leaning" | "off-step" | "low" | "afloat" | "rising";
  readonly leanRadians: number;
  readonly heightScale: number;
  readonly haloScale: number;
}

const BALANCE_PRESENTATION: Readonly<Record<PlayerBalanceView, PlayerBalancePresentation>> = {
  balanced: {
    state: "balanced",
    label: "balanced",
    fill: "#61e6d2",
    outline: "#d9f8ea",
    mark: "keel",
    silhouette: "upright",
    leanRadians: 0,
    heightScale: 1,
    haloScale: 1,
  },
  swaying: {
    state: "swaying",
    label: "swaying",
    fill: "#ffc071",
    outline: "#fff1c7",
    mark: "counterweight",
    silhouette: "leaning",
    leanRadians: 0.13,
    heightScale: 0.92,
    haloScale: 1.14,
  },
  stumbling: {
    state: "stumbling",
    label: "stumbling",
    fill: "#ff9a78",
    outline: "#fff0dd",
    mark: "skid",
    silhouette: "off-step",
    leanRadians: 0.34,
    heightScale: 0.78,
    haloScale: 1.28,
  },
  fallen: {
    state: "fallen",
    label: "fallen",
    fill: "#ff796c",
    outline: "#fff2e8",
    mark: "impact",
    silhouette: "low",
    leanRadians: 1.18,
    heightScale: 0.48,
    haloScale: 1.42,
  },
  swept: {
    state: "swept",
    label: "swept",
    fill: "#55c7dc",
    outline: "#e5fbff",
    mark: "eddy",
    silhouette: "afloat",
    leanRadians: 0.62,
    heightScale: 0.58,
    haloScale: 1.55,
  },
  recovering: {
    state: "recovering",
    label: "recovering",
    fill: "#bea9ff",
    outline: "#f4eeff",
    mark: "rise",
    silhouette: "rising",
    leanRadians: 0.2,
    heightScale: 0.72,
    haloScale: 1.2,
  },
};

export function playerBalancePresentation(
  state: PlayerBalanceView | undefined,
): PlayerBalancePresentation {
  return BALANCE_PRESENTATION[state ?? "balanced"];
}

export interface IncidentViewport {
  readonly width: number;
  readonly height: number;
  /** Screen-space area reserved by the top HUD/safe inset. */
  readonly safeTop: number;
  /** Screen-space area reserved by touch actions/safe inset. */
  readonly safeBottom: number;
  readonly compact: boolean;
}

export interface IncidentCalloutPlacement extends WorldPoint {
  readonly width: number;
  readonly aboveCourier: boolean;
}

/**
 * Keeps a short incident label in the playable aperture. On compact screens it
 * prefers a slightly higher position above the courier; when that cannot fit,
 * it uses the nearest safe screen lane instead of disappearing under controls.
 */
export function placeIncidentCallout(
  courier: WorldPoint,
  desiredWidth: number,
  viewport: IncidentViewport,
): IncidentCalloutPlacement {
  const width = clamp(
    Number.isFinite(desiredWidth) ? desiredWidth : 0,
    72,
    Math.max(72, viewport.width - 24),
  );
  const half = width / 2;
  const x = clamp(courier.x, 12 + half, Math.max(12 + half, viewport.width - 12 - half));
  const top = clamp(viewport.safeTop, 0, Math.max(0, viewport.height - 24));
  const bottom = Math.max(top + 24, viewport.height - clamp(viewport.safeBottom, 0, viewport.height));
  const lift = viewport.compact ? 58 : 42;
  const preferredAbove = courier.y - lift;
  if (preferredAbove >= top + 12) {
    return { x, y: Math.min(preferredAbove, bottom - 12), width, aboveCourier: true };
  }
  return {
    x,
    y: clamp(courier.y + (viewport.compact ? 42 : 34), top + 12, bottom - 12),
    width,
    aboveCourier: false,
  };
}

function clamp(value: number, low: number, high: number): number {
  const safe = Number.isFinite(value) ? value : low;
  return Math.max(low, Math.min(high, safe));
}
