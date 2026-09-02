import type { WorldPoint } from "./types";

export interface PointerParallaxState {
  current: WorldPoint;
  target: WorldPoint;
  lastAt: number | undefined;
}

export interface EasedScreenPoint extends WorldPoint {
  readonly updatedAt: number;
}

export function createPointerParallaxState(): PointerParallaxState {
  return {
    current: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    lastAt: undefined,
  };
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, finite(value, low)));
}

function easingAmount(deltaMs: number, halfLifeMs: number): number {
  if (deltaMs <= 0) return 0;
  return 1 - Math.pow(2, -deltaMs / Math.max(1, halfLifeMs));
}

/** Clamped -1..1 pointer coordinates with the viewport center at zero. */
export function normalizedPresentationPointer(
  local: WorldPoint,
  viewport: { readonly width: number; readonly height: number },
): WorldPoint {
  const width = Math.max(1, finite(viewport.width, 1));
  const height = Math.max(1, finite(viewport.height, 1));
  return {
    x: clamp((finite(local.x) / width) * 2 - 1, -1, 1),
    y: clamp((finite(local.y) / height) * 2 - 1, -1, 1),
  };
}

/** Scene displacement in CSS pixels; negative makes the camera lean toward the pointer. */
export function presentationParallaxTarget(
  normalized: WorldPoint,
  maximumPixels = 3.5,
): WorldPoint {
  const maximum = clamp(maximumPixels, 0, 8);
  return {
    x: -clamp(normalized.x, -1, 1) * maximum,
    y: -clamp(normalized.y, -1, 1) * maximum,
  };
}

export function setPointerParallaxTarget(
  state: PointerParallaxState,
  target: WorldPoint,
): void {
  state.target = {
    x: clamp(target.x, -8, 8),
    y: clamp(target.y, -8, 8),
  };
}

/** Frame-rate-independent exponential easing of a tiny render-only displacement. */
export function advancePointerParallax(
  state: PointerParallaxState,
  now: number,
  reducedMotion: boolean,
  halfLifeMs = 85,
): WorldPoint {
  const safeNow = Math.max(0, finite(now));
  if (reducedMotion) {
    state.current = { x: 0, y: 0 };
    state.target = { x: 0, y: 0 };
    state.lastAt = safeNow;
    return state.current;
  }
  const delta = state.lastAt === undefined ? 0 : Math.max(0, Math.min(250, safeNow - state.lastAt));
  const amount = easingAmount(delta, halfLifeMs);
  state.current = {
    x: state.current.x + (state.target.x - state.current.x) * amount,
    y: state.current.y + (state.target.y - state.current.y) * amount,
  };
  state.lastAt = safeNow;
  return state.current;
}

export function resetPointerParallax(
  state: PointerParallaxState,
  immediate: boolean,
): void {
  state.target = { x: 0, y: 0 };
  if (immediate) {
    state.current = { x: 0, y: 0 };
    state.lastAt = undefined;
  }
}

/** Eases one world label while limiting lag so text never detaches from its object. */
export function easeWorldLabelPoint(
  previous: EasedScreenPoint | undefined,
  target: WorldPoint,
  now: number,
  reducedMotion: boolean,
  halfLifeMs = 72,
  maximumLagPixels = 12,
): EasedScreenPoint {
  const safeTarget = { x: finite(target.x), y: finite(target.y) };
  const safeNow = Math.max(0, finite(now));
  if (!previous || reducedMotion) return { ...safeTarget, updatedAt: safeNow };
  const maximumLag = clamp(maximumLagPixels, 0, 32);
  const prior = {
    x: safeTarget.x + clamp(previous.x - safeTarget.x, -maximumLag, maximumLag),
    y: safeTarget.y + clamp(previous.y - safeTarget.y, -maximumLag, maximumLag),
  };
  const delta = Math.max(0, Math.min(250, safeNow - previous.updatedAt));
  const amount = easingAmount(delta, halfLifeMs);
  return {
    x: prior.x + (safeTarget.x - prior.x) * amount,
    y: prior.y + (safeTarget.y - prior.y) * amount,
    updatedAt: safeNow,
  };
}
