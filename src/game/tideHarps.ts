import {
  DEFAULT_WAYKNOT_CAPACITY,
  WAYKNOT_COMPATIBILITY_REGION,
  WAYKNOT_RADII,
  manhattanTileDistance,
  normalizeWayknotState,
  type WayknotGrid,
  type WayknotKind,
} from "./wayknots";
import { isRegionCoord, regionKey, type RegionCoord } from "../sim/regions";

export interface TideHarpPoint {
  readonly x: number;
  readonly y: number;
}

export interface TideHarpKnotRef<K extends WayknotKind = WayknotKind> {
  readonly id: number;
  readonly kind: K;
  readonly region: RegionCoord;
  readonly tileIndex: number;
  /** Tile-space center, so tile (0, 0) is represented by (0.5, 0.5). */
  readonly point: TideHarpPoint;
}

export type TideHarpKnotTuple = readonly [
  TideHarpKnotRef<"reed-mat">,
  TideHarpKnotRef<"tide-anchor">,
  TideHarpKnotRef<"wind-knot">,
];

export interface TideHarpEdge {
  readonly id: string;
  readonly fromId: number;
  readonly toId: number;
  readonly fromKind: WayknotKind;
  readonly toKind: WayknotKind;
  readonly fromTileIndex: number;
  readonly toTileIndex: number;
  readonly manhattanDistance: number;
  readonly connectionThreshold: number;
  readonly length: number;
}

export interface TideHarp {
  /** Canonical across input order, save/load, and renderer mode. */
  readonly id: string;
  readonly region: RegionCoord;
  readonly name: string;
  readonly label: string;
  /** Always Reed mat, Tide anchor, then Wind knot. */
  readonly knots: TideHarpKnotTuple;
  /** Always Reed↔Anchor, Reed↔Wind, then Anchor↔Wind. */
  readonly edges: readonly [TideHarpEdge, TideHarpEdge, TideHarpEdge];
  /** Triangle centroid in tile-space coordinates. */
  readonly center: TideHarpPoint;
  /** Exact integer cross-product magnitude in tile space. */
  readonly doubleArea: number;
  readonly area: number;
  readonly perimeter: number;
}

interface NormalizedGrid extends WayknotGrid {
  readonly tileCount: number;
}

const GEOMETRY_EPSILON = 1e-9;
const EMPTY_HARPS: readonly TideHarp[] = Object.freeze([]);
const TIDE_HARP_NAMES = Object.freeze([
  "Glass-Ebb",
  "Gullweather",
  "Moon-Reed",
  "Lantern Shoal",
  "Mothcurrent",
  "Brine Lullaby",
  "Quiet Rigging",
  "Estuary Chime",
] as const);

/**
 * Enumerates every connected, non-collinear Reed/Anchor/Wind triangle.
 * Saved IDs are authoritative: normalizeWayknotState restores each fixed kind
 * from its stable ID before any topology is considered.
 */
export function enumerateTideHarpCandidates(
  state: unknown,
  grid: unknown,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): readonly TideHarp[] {
  try {
    const normalizedGrid = normalizeGrid(grid);
    const canonicalRegion = normalizeRegion(region);
    if (!normalizedGrid || !canonicalRegion) return EMPTY_HARPS;
    const normalizedState = normalizeWayknotState(state, {
      capacity: DEFAULT_WAYKNOT_CAPACITY,
      tileCount: normalizedGrid.tileCount,
    });
    const refs = normalizedState.wayknots.flatMap((wayknot): TideHarpKnotRef[] => {
      if (
        wayknot.region === null
        || !sameRegion(wayknot.region, canonicalRegion)
        || wayknot.tileIndex === null
      ) return [];
      return [makeKnotRef(
        wayknot.id,
        wayknot.kind,
        canonicalRegion,
        wayknot.tileIndex,
        normalizedGrid,
      )];
    });
    const reeds = refs.filter(isReedRef);
    const anchors = refs.filter(isAnchorRef);
    const winds = refs.filter(isWindRef);
    const candidates: TideHarp[] = [];

    for (const reed of reeds) {
      for (const anchor of anchors) {
        for (const wind of winds) {
          const candidate = makeCandidate(reed, anchor, wind, normalizedGrid);
          if (candidate) candidates.push(candidate);
        }
      }
    }

    candidates.sort(compareHarpsCanonical);
    return Object.freeze(candidates);
  } catch {
    // Proxies and imported JSON can be more hostile than ordinary malformed
    // records. Topology is optional derived state, so failure stays closed.
    return EMPTY_HARPS;
  }
}

/**
 * Chooses a maximum knot-disjoint candidate set. Equal-size sets prefer the
 * smaller total Euclidean perimeter, then the lexicographically smaller fixed
 * ID tuples. Exhaustive search is deliberately simple: the fixed kit permits
 * at most eight three-kind candidates.
 */
export function selectTideHarps(candidates: unknown): readonly TideHarp[] {
  try {
    if (!Array.isArray(candidates)) return EMPTY_HARPS;
    return selectCanonicalTideHarps(candidates.filter(isTideHarp));
  } catch {
    return EMPTY_HARPS;
  }
}

function selectCanonicalTideHarps(candidates: readonly TideHarp[]): readonly TideHarp[] {
  const canonical = [...candidates].sort(compareHarpsCanonical);
  if (canonical.length === 0) return EMPTY_HARPS;

  let best: TideHarp[] = [];
  let bestPerimeter = Number.POSITIVE_INFINITY;
  const selected: TideHarp[] = [];
  const usedKnotIds = new Set<number>();

  const visit = (index: number, totalPerimeter: number): void => {
    if (selected.length + canonical.length - index < best.length) return;
    if (index >= canonical.length) {
      if (
        selected.length > best.length
        || (
          selected.length === best.length
          && (
            totalPerimeter < bestPerimeter - GEOMETRY_EPSILON
            || (
              Math.abs(totalPerimeter - bestPerimeter) <= GEOMETRY_EPSILON
              && compareHarpSetsCanonical(selected, best) < 0
            )
          )
        )
      ) {
        best = [...selected];
        bestPerimeter = totalPerimeter;
      }
      return;
    }

    const candidate = canonical[index];
    if (!candidate) return;
    visit(index + 1, totalPerimeter);
    if (candidate.knots.some((knot) => usedKnotIds.has(knot.id))) return;
    for (const knot of candidate.knots) usedKnotIds.add(knot.id);
    selected.push(candidate);
    visit(index + 1, totalPerimeter + candidate.perimeter);
    selected.pop();
    for (const knot of candidate.knots) usedKnotIds.delete(knot.id);
  };

  visit(0, 0);
  best.sort(compareHarpsCanonical);
  return Object.freeze(best);
}

/** Enumerates and resolves the authoritative selected Tide Harps in one call. */
export function deriveTideHarps(
  state: unknown,
  grid: unknown,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): readonly TideHarp[] {
  return selectTideHarps(enumerateTideHarpCandidates(state, grid, region));
}

/** Inclusive point-in-triangle query in tile-space coordinates. */
export function tideHarpContainsPoint(harp: unknown, point: unknown): boolean {
  try {
    if (!isTideHarp(harp) || !isPoint(point)) return false;
    return triangleContainsPoint(
      harp.knots[0].point,
      harp.knots[1].point,
      harp.knots[2].point,
      point,
      GEOMETRY_EPSILON,
    );
  } catch {
    return false;
  }
}

/** Inclusive query for one validated grid tile's center. */
export function tideHarpContainsTileCenter(
  harp: unknown,
  tileIndex: unknown,
  grid: unknown,
): boolean {
  try {
    const normalizedGrid = normalizeGrid(grid);
    if (
      !normalizedGrid
      || !isTideHarp(harp)
      || !Number.isSafeInteger(tileIndex)
      || (tileIndex as number) < 0
      || (tileIndex as number) >= normalizedGrid.tileCount
      || harp.knots.some((knot) => knot.tileIndex >= normalizedGrid.tileCount)
    ) {
      return false;
    }
    const reed = tileCenter(harp.knots[0].tileIndex, normalizedGrid);
    const anchor = tileCenter(harp.knots[1].tileIndex, normalizedGrid);
    const wind = tileCenter(harp.knots[2].tileIndex, normalizedGrid);
    const doubleArea = Math.abs(cross(reed, anchor, wind));
    if (doubleArea !== harp.doubleArea) return false;
    return triangleContainsPoint(
      reed,
      anchor,
      wind,
      tileCenter(tileIndex as number, normalizedGrid),
      0,
    );
  } catch {
    return false;
  }
}

function makeCandidate(
  reed: TideHarpKnotRef<"reed-mat">,
  anchor: TideHarpKnotRef<"tide-anchor">,
  wind: TideHarpKnotRef<"wind-knot">,
  grid: NormalizedGrid,
): TideHarp | null {
  if (
    !sameRegion(reed.region, anchor.region)
    || !sameRegion(reed.region, wind.region)
  ) return null;
  const reedAnchor = makeEdge(reed, anchor, grid);
  const reedWind = makeEdge(reed, wind, grid);
  const anchorWind = makeEdge(anchor, wind, grid);
  if (!reedAnchor || !reedWind || !anchorWind) return null;
  const signedDoubleArea = cross(reed.point, anchor.point, wind.point);
  if (!Number.isSafeInteger(signedDoubleArea) || signedDoubleArea === 0) return null;
  const doubleArea = Math.abs(signedDoubleArea);
  const knots = Object.freeze([reed, anchor, wind]) as TideHarpKnotTuple;
  const edges = Object.freeze([reedAnchor, reedWind, anchorWind]) as TideHarp["edges"];
  const id = tideHarpId(reed.region, reed.id, anchor.id, wind.id);
  const name = tideHarpName(reed.id, anchor.id, wind.id);
  return Object.freeze({
    id,
    region: Object.freeze({ ...reed.region }),
    name,
    label: `${name} Tide Harp · R${reed.id} · A${anchor.id} · W${wind.id}`,
    knots,
    edges,
    center: Object.freeze({
      x: (reed.point.x + anchor.point.x + wind.point.x) / 3,
      y: (reed.point.y + anchor.point.y + wind.point.y) / 3,
    }),
    doubleArea,
    area: doubleArea / 2,
    perimeter: reedAnchor.length + reedWind.length + anchorWind.length,
  });
}

function makeEdge(
  from: TideHarpKnotRef,
  to: TideHarpKnotRef,
  grid: NormalizedGrid,
): TideHarpEdge | null {
  const distance = manhattanTileDistance(from.tileIndex, to.tileIndex, grid);
  const threshold = WAYKNOT_RADII[from.kind] + WAYKNOT_RADII[to.kind] + 1;
  if (!Number.isFinite(distance) || distance > threshold) return null;
  return Object.freeze({
    id: `tide-harp-edge:${from.id}-${to.id}`,
    fromId: from.id,
    toId: to.id,
    fromKind: from.kind,
    toKind: to.kind,
    fromTileIndex: from.tileIndex,
    toTileIndex: to.tileIndex,
    manhattanDistance: distance,
    connectionThreshold: threshold,
    length: Math.hypot(from.point.x - to.point.x, from.point.y - to.point.y),
  });
}

function makeKnotRef<K extends WayknotKind>(
  id: number,
  kind: K,
  region: RegionCoord,
  tileIndex: number,
  grid: NormalizedGrid,
): TideHarpKnotRef<K> {
  return Object.freeze({
    id,
    kind,
    region: Object.freeze({ ...region }),
    tileIndex,
    point: Object.freeze(tileCenter(tileIndex, grid)),
  });
}

function tileCenter(tileIndex: number, grid: WayknotGrid): TideHarpPoint {
  return {
    x: tileIndex % grid.width + 0.5,
    y: Math.floor(tileIndex / grid.width) + 0.5,
  };
}

function normalizeGrid(value: unknown): NormalizedGrid | null {
  if (!isRecord(value)) return null;
  const width = value.width;
  const height = value.height;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || (width as number) <= 0
    || (height as number) <= 0
  ) {
    return null;
  }
  const tileCount = (width as number) * (height as number);
  if (!Number.isSafeInteger(tileCount) || tileCount <= 0) return null;
  return Object.freeze({ width: width as number, height: height as number, tileCount });
}

function compareHarpsCanonical(left: TideHarp, right: TideHarp): number {
  const regionComparison = compareRegions(left.region, right.region);
  if (regionComparison !== 0) return regionComparison;
  for (let index = 0; index < 3; index += 1) {
    const leftId = left.knots[index]?.id ?? 0;
    const rightId = right.knots[index]?.id ?? 0;
    if (leftId !== rightId) return leftId - rightId;
  }
  return left.perimeter - right.perimeter || left.id.localeCompare(right.id);
}

function compareHarpSetsCanonical(left: readonly TideHarp[], right: readonly TideHarp[]): number {
  if (right.length === 0 && left.length > 0) return -1;
  const orderedLeft = [...left].sort(compareHarpsCanonical);
  const orderedRight = [...right].sort(compareHarpsCanonical);
  for (let index = 0; index < Math.min(orderedLeft.length, orderedRight.length); index += 1) {
    const comparison = compareHarpsCanonical(orderedLeft[index]!, orderedRight[index]!);
    if (comparison !== 0) return comparison;
  }
  return orderedLeft.length - orderedRight.length;
}

function tideHarpName(reedId: number, anchorId: number, windId: number): string {
  const fixedKitIndex = (reedId - 1) * 4 + (anchorId - 3) * 2 + (windId - 5);
  return TIDE_HARP_NAMES[fixedKitIndex] ?? "Waywater";
}

function tideHarpId(region: RegionCoord, reedId: number, anchorId: number, windId: number): string {
  const members = `r${reedId}-a${anchorId}-w${windId}`;
  return sameRegion(region, WAYKNOT_COMPATIBILITY_REGION)
    ? `tide-harp:${members}`
    : `tide-harp:${regionKey(region)}:${members}`;
}

function isTideHarp(value: unknown): value is TideHarp {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || !normalizeRegion(value.region)
    || typeof value.name !== "string"
    || typeof value.label !== "string"
  ) return false;
  if (!Array.isArray(value.knots) || value.knots.length !== 3) return false;
  if (!isKnotRef(value.knots[0], "reed-mat")) return false;
  if (!isKnotRef(value.knots[1], "tide-anchor")) return false;
  if (!isKnotRef(value.knots[2], "wind-knot")) return false;
  const region = normalizeRegion(value.region);
  if (!region || value.knots.some((knot) => !sameRegion(knot.region, region))) return false;
  const ids = new Set(value.knots.map((knot) => knot.id));
  if (ids.size !== 3 || !Array.isArray(value.edges) || value.edges.length !== 3) return false;
  return isPoint(value.center)
    && Number.isSafeInteger(value.doubleArea)
    && (value.doubleArea as number) > 0
    && Number.isFinite(value.area)
    && (value.area as number) > 0
    && Number.isFinite(value.perimeter)
    && (value.perimeter as number) > 0;
}

function isKnotRef<K extends WayknotKind>(value: unknown, kind: K): value is TideHarpKnotRef<K> {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.id)
    && (value.id as number) > 0
    && value.kind === kind
    && normalizeRegion(value.region) !== null
    && Number.isSafeInteger(value.tileIndex)
    && (value.tileIndex as number) >= 0
    && isPoint(value.point);
}

function isReedRef(ref: TideHarpKnotRef): ref is TideHarpKnotRef<"reed-mat"> {
  return ref.kind === "reed-mat";
}

function isAnchorRef(ref: TideHarpKnotRef): ref is TideHarpKnotRef<"tide-anchor"> {
  return ref.kind === "tide-anchor";
}

function isWindRef(ref: TideHarpKnotRef): ref is TideHarpKnotRef<"wind-knot"> {
  return ref.kind === "wind-knot";
}

function cross(from: TideHarpPoint, to: TideHarpPoint, point: TideHarpPoint): number {
  return (to.x - from.x) * (point.y - from.y)
    - (to.y - from.y) * (point.x - from.x);
}

function triangleContainsPoint(
  firstVertex: TideHarpPoint,
  secondVertex: TideHarpPoint,
  thirdVertex: TideHarpPoint,
  point: TideHarpPoint,
  epsilon: number,
): boolean {
  const orientation = cross(firstVertex, secondVertex, thirdVertex);
  if (!Number.isFinite(orientation) || Math.abs(orientation) <= epsilon) return false;
  const first = cross(firstVertex, secondVertex, point);
  const second = cross(secondVertex, thirdVertex, point);
  const third = cross(thirdVertex, firstVertex, point);
  const hasNegative = first < -epsilon || second < -epsilon || third < -epsilon;
  const hasPositive = first > epsilon || second > epsilon || third > epsilon;
  return !(hasNegative && hasPositive);
}

function isPoint(value: unknown): value is TideHarpPoint {
  if (!isRecord(value)) return false;
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRegion(value: unknown): RegionCoord | null {
  if (
    !isRecord(value)
    || Object.keys(value).sort().join(",") !== "x,y"
    || !isRegionCoord(value)
  ) return null;
  return Object.freeze({ x: value.x as number, y: value.y as number });
}

function sameRegion(left: RegionCoord, right: RegionCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

function compareRegions(left: RegionCoord, right: RegionCoord): number {
  if (left.x !== right.x) return left.x < right.x ? -1 : 1;
  if (left.y !== right.y) return left.y < right.y ? -1 : 1;
  return 0;
}
