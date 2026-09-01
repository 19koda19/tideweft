import type { WayknotKind, WayknotView, WorldPoint } from "./types";

export interface WaychordView {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly fromKind: WayknotKind;
  readonly toKind: WayknotKind;
  readonly from: WorldPoint;
  readonly to: WorldPoint;
  readonly midpoint: WorldPoint;
  /** Unit vector perpendicular to the cord in map space. */
  readonly normal: WorldPoint;
  readonly length: number;
}

export interface WaychordBinding {
  readonly center: WorldPoint;
  readonly left: WorldPoint;
  readonly right: WorldPoint;
}

const EPSILON = 1e-7;

/**
 * Connects active, unlike Wayknots whose influence circles overlap. Sorting
 * by stable identity keeps the same physical cord after save/load or array
 * reorder, and each pair is emitted exactly once.
 */
export function buildWaychords(
  wayknots: readonly WayknotView[],
): readonly WaychordView[] {
  const active = wayknots
    .filter(isRenderableActiveWayknot)
    .slice()
    .sort(compareWayknots);
  const chords: WaychordView[] = [];

  for (let fromIndex = 0; fromIndex < active.length; fromIndex += 1) {
    const from = active[fromIndex];
    if (!from) continue;
    for (let toIndex = fromIndex + 1; toIndex < active.length; toIndex += 1) {
      const to = active[toIndex];
      if (!to || from.id === to.id || from.kind === to.kind) continue;
      const dx = to.position.x - from.position.x;
      const dy = to.position.y - from.position.y;
      const length = Math.hypot(dx, dy);
      if (length <= EPSILON) continue;
      const reach = positive(from.influenceRadius) + positive(to.influenceRadius);
      if (length > reach + EPSILON) continue;
      chords.push({
        id: `${encodeURIComponent(from.id)}~${encodeURIComponent(to.id)}`,
        fromId: from.id,
        toId: to.id,
        fromKind: from.kind,
        toKind: to.kind,
        from: { ...from.position },
        to: { ...to.position },
        midpoint: {
          x: (from.position.x + to.position.x) / 2,
          y: (from.position.y + to.position.y) / 2,
        },
        normal: { x: -dy / length, y: dx / length },
        length,
      });
    }
  }
  return chords;
}

/**
 * Cross-ties for the waychord's double strand. Their geometry means the
 * connection remains legible without depending on hue or animated dashes.
 */
export function buildWaychordBindings(
  chord: WaychordView,
  spacing: number,
  halfWidth: number,
  maximum = 24,
): readonly WaychordBinding[] {
  const safeSpacing = Math.max(EPSILON, finite(spacing, chord.length));
  const count = Math.max(1, Math.min(
    Math.max(1, Math.floor(finite(maximum, 24))),
    Math.floor(chord.length / safeSpacing),
  ));
  const width = Math.max(0, finite(halfWidth, 0));
  const bindings: WaychordBinding[] = [];
  for (let index = 1; index <= count; index += 1) {
    const amount = index / (count + 1);
    const center = interpolate(chord.from, chord.to, amount);
    bindings.push({
      center,
      left: {
        x: center.x + chord.normal.x * width,
        y: center.y + chord.normal.y * width,
      },
      right: {
        x: center.x - chord.normal.x * width,
        y: center.y - chord.normal.y * width,
      },
    });
  }
  return bindings;
}

function isRenderableActiveWayknot(wayknot: WayknotView): boolean {
  return wayknot.active
    && wayknot.id.length > 0
    && Number.isFinite(wayknot.position.x)
    && Number.isFinite(wayknot.position.y);
}

function compareWayknots(left: WayknotView, right: WayknotView): number {
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  if (left.kind === right.kind) return 0;
  return left.kind < right.kind ? -1 : 1;
}

function interpolate(from: WorldPoint, to: WorldPoint, amount: number): WorldPoint {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

function positive(value: number): number {
  return Math.max(0, finite(value, 0));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
