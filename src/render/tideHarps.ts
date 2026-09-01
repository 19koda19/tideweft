import type {
  TideHarpEdgeView,
  TideHarpView,
  WayknotKind,
  WorldPoint,
} from "./types";

export interface TideHarpStringGeometry {
  readonly id: string;
  readonly edgeId: string;
  readonly stringIndex: -1 | 0 | 1;
  readonly from: WorldPoint;
  readonly control: WorldPoint;
  readonly to: WorldPoint;
}

export interface TideHarpSpokeGeometry {
  readonly id: string;
  readonly knotId: string;
  readonly kind: WayknotKind;
  readonly from: WorldPoint;
  readonly to: WorldPoint;
}

export interface TideHarpRenderGeometry {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
  readonly center: WorldPoint;
  /** Three bowed strings for each of the triangle's three persistent edges. */
  readonly strings: readonly TideHarpStringGeometry[];
  /** Three Relief suspension cords, one from every fixed-kind knot. */
  readonly spokes: readonly TideHarpSpokeGeometry[];
}

export interface TideHarpRootSurface {
  readonly kind: WayknotKind;
  readonly surface: number;
}

export type TideHarpGeometryMemo = (
  harps: unknown,
  stringSpacing: number,
) => readonly TideHarpRenderGeometry[];

const EPSILON = 1e-7;
const EMPTY_GEOMETRY: readonly TideHarpRenderGeometry[] = Object.freeze([]);

/**
 * Builds color-independent renderer geometry. Outer strings bow to opposite
 * sides while every string still terminates at the physical knot centers.
 */
export function buildTideHarpRenderGeometry(
  harp: unknown,
  stringSpacing: number,
): TideHarpRenderGeometry | null {
  if (!isTideHarpView(harp)) return null;
  const spacing = Math.max(0, finite(stringSpacing, 0));
  const strings: TideHarpStringGeometry[] = [];

  for (const edge of harp.edges) {
    const edgeStrings = buildEdgeStrings(edge, spacing);
    if (!edgeStrings) return null;
    strings.push(...edgeStrings);
  }

  const spokes: TideHarpSpokeGeometry[] = [];
  for (const knot of harp.knots) {
    if (!isFinitePoint(knot.point) || knot.id.length === 0) return null;
    spokes.push(Object.freeze({
      id: `${harp.id}:cord:${encodeURIComponent(knot.id)}`,
      knotId: knot.id,
      kind: knot.kind,
      from: knot.point,
      to: harp.center,
    }));
  }

  return Object.freeze({
    id: harp.id,
    label: harp.label,
    active: harp.active,
    center: harp.center,
    strings: Object.freeze(strings),
    spokes: Object.freeze(spokes),
  });
}

/**
 * Stable Relief suspension height before optional bell bobbing. The highest
 * physical knot root governs the clearance so no cord or instrument can sink
 * into a neighboring triangle peak.
 */
export function tideHarpBellBaseHeight(
  centerSurface: number,
  rootSurfaces: readonly TideHarpRootSurface[],
  tileSize: number,
  active: boolean,
): number {
  const size = Math.max(0, finite(tileSize, 0));
  let highestRoot = Math.max(0, finite(centerSurface, 0));
  for (const root of rootSurfaces) {
    if (!isWayknotKind(root?.kind)) continue;
    highestRoot = Math.max(
      highestRoot,
      Math.max(0, finite(root.surface, 0)) + tideHarpRootLift(root.kind, size),
    );
  }
  return highestRoot + size * (active ? 0.68 : 0.52);
}

export function tideHarpRootLift(kind: WayknotKind, tileSize: number): number {
  const size = Math.max(0, finite(tileSize, 0));
  switch (kind) {
    case "reed-mat": return size * 0.09;
    case "tide-anchor": return size * 0.2;
    case "wind-knot": return size * 1.08;
  }
}

/** Caches bounded geometry by immutable projection-array identity. */
export function createTideHarpGeometryMemo(): TideHarpGeometryMemo {
  const cache = new WeakMap<
    readonly TideHarpView[],
    { readonly spacing: number; readonly geometry: readonly TideHarpRenderGeometry[] }
  >();
  return (harps, stringSpacing) => {
    if (!Array.isArray(harps)) return EMPTY_GEOMETRY;
    if (harps.length === 0) return EMPTY_GEOMETRY;
    const spacing = Math.max(0, finite(stringSpacing, 0));
    const remembered = cache.get(harps);
    if (remembered && remembered.spacing === spacing) return remembered.geometry;
    const geometry = Object.freeze(harps.flatMap((harp) => {
      const built = buildTideHarpRenderGeometry(harp, spacing);
      return built ? [built] : [];
    }));
    cache.set(harps, { spacing, geometry });
    return geometry;
  };
}

/** Optional bell sway; reduced motion is an exact, clock-independent zero. */
export function tideHarpBellBob(
  harpId: string,
  now: number,
  tileSize: number,
  active: boolean,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  const safeNow = finite(now, 0);
  const size = Math.max(0, finite(tileSize, 0));
  const amplitude = size * (active ? 0.075 : 0.028);
  const phase = stableStringHash(harpId) / 4_294_967_295 * Math.PI * 2;
  return Math.sin(safeNow * 0.0024 + phase) * amplitude;
}

function buildEdgeStrings(
  edge: TideHarpEdgeView,
  spacing: number,
): readonly [TideHarpStringGeometry, TideHarpStringGeometry, TideHarpStringGeometry] | null {
  if (!isFinitePoint(edge.from) || !isFinitePoint(edge.to) || edge.id.length === 0) return null;
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= EPSILON) return null;
  const normal = { x: -dy / length, y: dx / length };
  const midpoint = {
    x: (edge.from.x + edge.to.x) / 2,
    y: (edge.from.y + edge.to.y) / 2,
  };
  const makeString = (stringIndex: -1 | 0 | 1): TideHarpStringGeometry => Object.freeze({
    id: `${edge.id}:string:${stringIndex + 2}`,
    edgeId: edge.id,
    stringIndex,
    from: edge.from,
    control: Object.freeze({
      x: midpoint.x + normal.x * spacing * stringIndex,
      y: midpoint.y + normal.y * spacing * stringIndex,
    }),
    to: edge.to,
  });
  return Object.freeze([makeString(-1), makeString(0), makeString(1)]);
}

function isTideHarpView(value: unknown): value is TideHarpView {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string"
    || value.id.length === 0
    || typeof value.label !== "string"
    || value.label.length === 0
    || typeof value.active !== "boolean"
    || !isFinitePoint(value.center)
    || !Array.isArray(value.knots)
    || value.knots.length !== 3
    || !Array.isArray(value.edges)
    || value.edges.length !== 3
  ) {
    return false;
  }
  const kinds = ["reed-mat", "tide-anchor", "wind-knot"] as const;
  const knotIndexById = new Map<string, number>();
  const knotPointById = new Map<string, WorldPoint>();
  for (let index = 0; index < kinds.length; index += 1) {
    const knot = value.knots[index];
    if (
      !isRecord(knot)
      || typeof knot.id !== "string"
      || knot.id.length === 0
      || knot.kind !== kinds[index]
      || !isFinitePoint(knot.point)
    ) {
      return false;
    }
    if (knotIndexById.has(knot.id)) return false;
    knotIndexById.set(knot.id, index);
    knotPointById.set(knot.id, knot.point);
  }

  const edgeIds = new Set<string>();
  const edgePairs = new Set<string>();
  for (const edge of value.edges) {
    if (
      !isRecord(edge)
      || typeof edge.id !== "string"
      || edge.id.length === 0
      || typeof edge.fromId !== "string"
      || edge.fromId.length === 0
      || typeof edge.toId !== "string"
      || edge.toId.length === 0
      || !isFinitePoint(edge.from)
      || !isFinitePoint(edge.to)
    ) {
      return false;
    }

    const fromIndex = knotIndexById.get(edge.fromId);
    const toIndex = knotIndexById.get(edge.toId);
    const fromPoint = knotPointById.get(edge.fromId);
    const toPoint = knotPointById.get(edge.toId);
    if (
      fromIndex === undefined
      || toIndex === undefined
      || fromIndex === toIndex
      || fromPoint === undefined
      || toPoint === undefined
      || !samePoint(edge.from, fromPoint)
      || !samePoint(edge.to, toPoint)
      || edgeIds.has(edge.id)
    ) {
      return false;
    }

    const pairId = fromIndex < toIndex
      ? `${fromIndex}:${toIndex}`
      : `${toIndex}:${fromIndex}`;
    if (edgePairs.has(pairId)) return false;
    edgeIds.add(edge.id);
    edgePairs.add(pairId);
  }
  return edgeIds.size === 3 && edgePairs.size === 3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFinitePoint(point: unknown): point is WorldPoint {
  return isRecord(point)
    && typeof point.x === "number"
    && Number.isFinite(point.x)
    && typeof point.y === "number"
    && Number.isFinite(point.y);
}

function samePoint(left: WorldPoint, right: WorldPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function isWayknotKind(value: unknown): value is WayknotKind {
  return value === "reed-mat" || value === "tide-anchor" || value === "wind-knot";
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function stableStringHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
