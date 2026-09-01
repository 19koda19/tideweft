import type { TerrainKind } from "../sim/types";

/** The three field weaves a porter can bind to a difficult patch of ground. */
export const WAYKNOT_KINDS = ["reed-mat", "tide-anchor", "wind-knot"] as const;

export type WayknotKind = (typeof WAYKNOT_KINDS)[number];

export const WAYKNOT_LABELS: Readonly<Record<WayknotKind, string>> = Object.freeze({
  "reed-mat": "Reed mat",
  "tide-anchor": "Tide anchor",
  "wind-knot": "Wind knot",
});

export const WAYKNOT_DESCRIPTIONS: Readonly<Record<WayknotKind, string>> = Object.freeze({
  "reed-mat": "A local reed lattice that makes one mudflat or salt-marsh tile easier to cross.",
  "tide-anchor": "A sung anchor that steadies wet crossings and weakens the nearby current.",
  "wind-knot": "A bright cord-knot that catches crosswind before it can shake nearby exposed ground.",
});

export const WAYKNOT_PLACEMENT_HINTS: Readonly<Record<WayknotKind, string>> = Object.freeze({
  "reed-mat": "Place on a tidal flat or reed marsh.",
  "tide-anchor": "Place in a tidal channel or water at least waist deep.",
  "wind-knot": "Place on exposed wind scrub or a shell ridge.",
});

export const WAYKNOT_STATE_VERSION = 1;
export const DEFAULT_WAYKNOT_CAPACITY = 6;
export const MAX_WAYKNOT_CAPACITY = 6;
export const WAYKNOT_WET_DEPTH = 40_000;
export const TIDE_ANCHOR_PLACEMENT_DEPTH = 120_000;
export const WAYKNOT_PERMILLE = 1_000;

export const WAYKNOT_RADII: Readonly<Record<WayknotKind, number>> = Object.freeze({
  "reed-mat": 0,
  "tide-anchor": 2,
  "wind-knot": 3,
});

/**
 * A knot remains in the field kit after reclamation. `tileIndex: null` means
 * that the piece is carried and can be rebound without spending cargo or a
 * simulation resource. IDs never change during reclaim/redeploy.
 */
export interface Wayknot {
  readonly id: number;
  readonly kind: WayknotKind;
  readonly tileIndex: number | null;
}

/** A JSON-safe snapshot; it deliberately contains no clocks or random state. */
export interface WayknotState {
  readonly version: typeof WAYKNOT_STATE_VERSION;
  readonly capacity: number;
  readonly wayknots: readonly Wayknot[];
}

/**
 * The game layer derives `windExposed` from a shell ridge or the existing
 * meadow-to-wind-scrub presentation rule. `occupied` is for settlements,
 * projects, cargo props, or any other non-wayknot blocker owned by the caller.
 */
export interface WayknotTileContext {
  readonly tileIndex: number;
  readonly terrain: TerrainKind;
  readonly waterDepth: number;
  readonly windExposed: boolean;
  readonly occupied?: boolean;
}

export interface WayknotGrid {
  readonly width: number;
  readonly height: number;
}

export type WayknotPlacementReason =
  | "available"
  | "invalid-context"
  | "occupied"
  | "unsuitable-terrain"
  | "capacity-reached";

export type WayknotActionReason =
  | "placed"
  | "reclaimed"
  | "redeployed"
  | "invalid-context"
  | "occupied"
  | "unsuitable-terrain"
  | "capacity-reached"
  | "not-found"
  | "already-carried"
  | "already-there";

export interface WayknotActionResult {
  readonly ok: boolean;
  readonly reason: WayknotActionReason;
  readonly state: WayknotState;
  readonly wayknot: Wayknot | null;
}

export interface NormalizeWayknotOptions {
  /** An authoritative gameplay cap. If absent, a valid saved cap is retained. */
  readonly capacity?: number;
  /** Invalid/out-of-world placements are safely returned to the carried kit. */
  readonly tileCount?: number;
  /** Optionally revalidate saved placements against the current terrain. */
  readonly contextAt?: (tileIndex: number) => WayknotTileContext | undefined;
}

export interface WayknotInfluence {
  readonly id: number;
  readonly kind: WayknotKind;
  readonly distance: number;
  readonly radius: number;
  readonly movementCostPermille: number;
  readonly staminaCostPermille: number;
  readonly stabilityLossPermille: number;
  readonly sweepRiskPermille: number;
  readonly pathCostPermille: number;
}

/**
 * Every modifier is a cost/loss/risk multiplier in thousandths. 1,000 is
 * neutral and smaller values are beneficial. Overlapping knots use the single
 * strongest value for each channel rather than stacking without bound.
 */
export interface WayknotEffects {
  readonly movementCostPermille: number;
  readonly staminaCostPermille: number;
  readonly stabilityLossPermille: number;
  readonly sweepRiskPermille: number;
  readonly pathCostPermille: number;
  readonly influences: readonly WayknotInfluence[];
}

const TERRAIN_KINDS: ReadonlySet<string> = new Set<TerrainKind>([
  "deep-water",
  "tidal-flat",
  "marsh",
  "meadow",
  "ridge",
]);

const KIND_ORDER = new Map<WayknotKind, number>(
  WAYKNOT_KINDS.map((kind, index) => [kind, index]),
);

const DEFAULT_WAYKNOT_LOADOUT: readonly Wayknot[] = Object.freeze([
  Object.freeze({ id: 1, kind: "reed-mat", tileIndex: null }),
  Object.freeze({ id: 2, kind: "reed-mat", tileIndex: null }),
  Object.freeze({ id: 3, kind: "tide-anchor", tileIndex: null }),
  Object.freeze({ id: 4, kind: "tide-anchor", tileIndex: null }),
  Object.freeze({ id: 5, kind: "wind-knot", tileIndex: null }),
  Object.freeze({ id: 6, kind: "wind-knot", tileIndex: null }),
]);

export function createWayknotState(capacity = DEFAULT_WAYKNOT_CAPACITY): WayknotState {
  return makeState(normalizeCapacity(capacity), DEFAULT_WAYKNOT_LOADOUT);
}

/**
 * Turns untrusted save data into one canonical field kit. A wholly missing
 * legacy field receives the six-piece starter kit. Once a save explicitly has
 * a `wayknots` array, invalid IDs are dropped and absent IDs are never filled;
 * fixed kinds are recovered from stable IDs, uncertain placements become
 * carried, and output order is deterministic.
 */
export function normalizeWayknotState(
  value: unknown,
  options: NormalizeWayknotOptions = {},
): WayknotState {
  const record = isRecord(value) ? value : {};
  const savedCapacity = normalizeCapacity(record.capacity, DEFAULT_WAYKNOT_CAPACITY);
  const capacity = options.capacity === undefined
    ? savedCapacity
    : normalizeCapacity(options.capacity, DEFAULT_WAYKNOT_CAPACITY);
  const tileCount = Number.isSafeInteger(options.tileCount) && (options.tileCount ?? -1) >= 0
    ? Math.trunc(options.tileCount ?? 0)
    : undefined;
  const hasExplicitWayknots = Object.prototype.hasOwnProperty.call(record, "wayknots");
  if (!hasExplicitWayknots) return createWayknotState(capacity);
  const rawWayknots = Array.isArray(record.wayknots) ? record.wayknots : [];
  const candidates = new Map<number, Wayknot[]>();

  for (const raw of rawWayknots) {
    if (!isRecord(raw)) continue;
    const id = raw.id;
    if (!Number.isSafeInteger(id) || (id as number) <= 0) continue;
    const kind = defaultKindForId(id as number);
    if (kind === null) continue;
    let tileIndex = normalizeTileIndex(raw.tileIndex, tileCount);
    if (tileIndex !== null && options.contextAt) {
      const context = options.contextAt(tileIndex);
      if (
        !context
        || context.tileIndex !== tileIndex
        || !isValidTileContext(context)
        || context.occupied
        || !supportsWayknot(kind, context)
      ) {
        tileIndex = null;
      }
    }
    const candidate = freezeWayknot({ id: id as number, kind, tileIndex });
    const grouped = candidates.get(candidate.id) ?? [];
    grouped.push(candidate);
    candidates.set(candidate.id, grouped);
  }

  const deduplicated: Wayknot[] = [];
  for (const id of [...candidates.keys()].sort((left, right) => left - right)) {
    const group = candidates.get(id) ?? [];
    group.sort(compareNormalizationCandidate);
    const winner = group[0];
    if (winner) deduplicated.push(winner);
  }

  // A malformed save may put several physical aids on one tile. Lowest stable
  // ID owns it; every later collision is retained but safely returned to hand.
  const occupiedTiles = new Set<number>();
  let deployed = 0;
  const normalized = deduplicated.map((wayknot) => {
    if (wayknot.tileIndex === null) return wayknot;
    if (occupiedTiles.has(wayknot.tileIndex) || deployed >= capacity) {
      return freezeWayknot({ ...wayknot, tileIndex: null });
    }
    occupiedTiles.add(wayknot.tileIndex);
    deployed += 1;
    return wayknot;
  });
  return makeState(capacity, normalized);
}

/** The exact knot occupying a tile, if any. */
export function wayknotAtTile(state: WayknotState, tileIndex: number): Wayknot | null {
  if (!Number.isSafeInteger(tileIndex) || tileIndex < 0) return null;
  return state.wayknots.find((wayknot) => wayknot.tileIndex === tileIndex) ?? null;
}

export function deployedWayknotCount(state: WayknotState): number {
  return state.wayknots.reduce(
    (total, wayknot) => total + (wayknot.tileIndex === null ? 0 : 1),
    0,
  );
}

/**
 * Mirrors the existing presentation rule: dry/rough meadow becomes wind scrub,
 * while every ridge is considered exposed.
 */
export function isWindExposedTile(tile: {
  readonly terrain: TerrainKind;
  readonly moisture: number;
  readonly roughness: number;
}): boolean {
  return tile.terrain === "ridge"
    || (tile.terrain === "meadow" && (tile.moisture < 545_000 || tile.roughness > 610_000));
}

export function supportsWayknot(kind: WayknotKind, context: WayknotTileContext): boolean {
  switch (kind) {
    case "reed-mat":
      return context.terrain === "tidal-flat" || context.terrain === "marsh";
    case "tide-anchor":
      return context.terrain === "deep-water" || context.waterDepth >= TIDE_ANCHOR_PLACEMENT_DEPTH;
    case "wind-knot":
      return context.windExposed && (context.terrain === "meadow" || context.terrain === "ridge");
  }
}

/** Deterministic choice for the eventual single contextual fieldwork action. */
export function contextualWayknotKind(context: WayknotTileContext): WayknotKind | null {
  if (!isValidTileContext(context)) return null;
  if (supportsWayknot("tide-anchor", context)) return "tide-anchor";
  if (supportsWayknot("reed-mat", context)) return "reed-mat";
  if (supportsWayknot("wind-knot", context)) return "wind-knot";
  return null;
}

export function validateWayknotPlacement(
  state: WayknotState,
  kind: WayknotKind,
  context: WayknotTileContext,
  movingWayknotId?: number,
): WayknotPlacementReason {
  if (!isValidTileContext(context)) return "invalid-context";
  const fieldOccupant = wayknotAtTile(state, context.tileIndex);
  if (context.occupied || (fieldOccupant !== null && fieldOccupant.id !== movingWayknotId)) {
    return "occupied";
  }
  if (!supportsWayknot(kind, context)) return "unsuitable-terrain";
  const moving = movingWayknotId === undefined
    ? undefined
    : state.wayknots.find((wayknot) => wayknot.id === movingWayknotId);
  const addsDeployment = !moving || moving.tileIndex === null;
  if (addsDeployment && deployedWayknotCount(state) >= state.capacity) {
    return "capacity-reached";
  }
  const hasReusablePiece = state.wayknots.some(
    (wayknot) => wayknot.kind === kind && wayknot.tileIndex === null,
  );
  if (!moving && !hasReusablePiece) {
    return "capacity-reached";
  }
  return "available";
}

/**
 * Bind a knot at a tile. The lowest-ID carried knot of the requested kind is
 * used; knot kinds never transmute and no new aid is created. Nothing in the
 * simulation inventory or cargo ledger is touched.
 */
export function placeWayknot(
  state: WayknotState,
  kind: WayknotKind,
  context: WayknotTileContext,
): WayknotActionResult {
  const validation = validateWayknotPlacement(state, kind, context);
  if (validation !== "available") return failedAction(state, validation);

  const carried = [...state.wayknots]
    .filter((wayknot) => wayknot.kind === kind && wayknot.tileIndex === null)
    .sort((left, right) => left.id - right.id)[0];
  // Validation proves this exists. Keep the guard so malformed typed callers
  // still fail closed instead of fabricating an aid.
  if (!carried) return failedAction(state, "capacity-reached");
  const placed = freezeWayknot({ id: carried.id, kind: carried.kind, tileIndex: context.tileIndex });
  const next = state.wayknots.map((wayknot) => wayknot.id === carried.id ? placed : wayknot);
  const nextState = makeState(state.capacity, next);
  return successfulAction(nextState, "placed", placed);
}

/** Place the terrain-appropriate weave, or return a precise failure reason. */
export function placeContextualWayknot(
  state: WayknotState,
  context: WayknotTileContext,
): WayknotActionResult {
  if (!isValidTileContext(context)) return failedAction(state, "invalid-context");
  if (context.occupied || wayknotAtTile(state, context.tileIndex)) return failedAction(state, "occupied");
  const kind = contextualWayknotKind(context);
  return kind === null
    ? failedAction(state, "unsuitable-terrain")
    : placeWayknot(state, kind, context);
}

/** Return a placed aid to the kit without deleting or changing its stable ID. */
export function reclaimWayknot(state: WayknotState, id: number): WayknotActionResult {
  const existing = state.wayknots.find((wayknot) => wayknot.id === id);
  if (!existing) return failedAction(state, "not-found");
  if (existing.tileIndex === null) return failedAction(state, "already-carried", existing);
  const reclaimed = freezeWayknot({ ...existing, tileIndex: null });
  const nextState = makeState(
    state.capacity,
    state.wayknots.map((wayknot) => wayknot.id === id ? reclaimed : wayknot),
  );
  return successfulAction(nextState, "reclaimed", reclaimed);
}

export function reclaimWayknotAtTile(state: WayknotState, tileIndex: number): WayknotActionResult {
  const existing = wayknotAtTile(state, tileIndex);
  return existing ? reclaimWayknot(state, existing.id) : failedAction(state, "not-found");
}

/** Move one known piece atomically, preserving both its kind and stable ID. */
export function redeployWayknot(
  state: WayknotState,
  id: number,
  context: WayknotTileContext,
): WayknotActionResult {
  const existing = state.wayknots.find((wayknot) => wayknot.id === id);
  if (!existing) return failedAction(state, "not-found");
  if (existing.tileIndex === context.tileIndex) return failedAction(state, "already-there", existing);
  const validation = validateWayknotPlacement(state, existing.kind, context, existing.id);
  if (validation !== "available") return failedAction(state, validation, existing);
  const redeployed = freezeWayknot({ ...existing, tileIndex: context.tileIndex });
  const nextState = makeState(
    state.capacity,
    state.wayknots.map((wayknot) => wayknot.id === id ? redeployed : wayknot),
  );
  return successfulAction(nextState, "redeployed", redeployed);
}

/** The pure one-button rule intended for runtime integration. */
export function toggleContextualWayknot(
  state: WayknotState,
  context: WayknotTileContext,
): WayknotActionResult {
  const existing = wayknotAtTile(state, context.tileIndex);
  return existing ? reclaimWayknot(state, existing.id) : placeContextualWayknot(state, context);
}

/**
 * Query exact Manhattan-radius effects for one tile. This is independent of
 * frame rate, tick, traversal direction, and input ordering, so the same call
 * can be used by live movement and A* edge-cost evaluation.
 */
export function queryWayknotEffects(
  state: WayknotState,
  context: WayknotTileContext,
  grid: WayknotGrid,
): WayknotEffects {
  if (!isValidTileContext(context) || !isValidGrid(grid) || context.tileIndex >= grid.width * grid.height) {
    return neutralEffects();
  }
  const influences: WayknotInfluence[] = [];
  for (const wayknot of state.wayknots) {
    if (wayknot.tileIndex === null || wayknot.tileIndex >= grid.width * grid.height) continue;
    const distance = manhattanTileDistance(wayknot.tileIndex, context.tileIndex, grid);
    const radius = WAYKNOT_RADII[wayknot.kind];
    if (distance > radius || !effectApplies(wayknot.kind, context)) continue;
    influences.push(influenceFor(wayknot, distance));
  }
  influences.sort((left, right) => left.distance - right.distance || left.id - right.id);

  const result: WayknotEffects = {
    movementCostPermille: strongest(influences, "movementCostPermille"),
    staminaCostPermille: strongest(influences, "staminaCostPermille"),
    stabilityLossPermille: strongest(influences, "stabilityLossPermille"),
    sweepRiskPermille: strongest(influences, "sweepRiskPermille"),
    pathCostPermille: strongest(influences, "pathCostPermille"),
    influences: Object.freeze(influences),
  };
  return Object.freeze(result);
}

export function manhattanTileDistance(from: number, to: number, grid: WayknotGrid): number {
  if (!isValidGrid(grid) || !isGridIndex(from, grid) || !isGridIndex(to, grid)) {
    return Number.POSITIVE_INFINITY;
  }
  const fromX = from % grid.width;
  const fromY = Math.floor(from / grid.width);
  const toX = to % grid.width;
  const toY = Math.floor(to / grid.width);
  return Math.abs(fromX - toX) + Math.abs(fromY - toY);
}

export function applyWayknotPermille(value: number, multiplier: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const safeMultiplier = Number.isFinite(multiplier)
    ? Math.max(0, Math.trunc(multiplier))
    : WAYKNOT_PERMILLE;
  return Math.floor((Math.trunc(value) * safeMultiplier) / WAYKNOT_PERMILLE);
}

export function modifyMovementCost(value: number, effects: WayknotEffects): number {
  return applyWayknotPermille(value, effects.movementCostPermille);
}

export function modifyStaminaCost(value: number, effects: WayknotEffects): number {
  return applyWayknotPermille(value, effects.staminaCostPermille);
}

export function modifyStabilityLoss(value: number, effects: WayknotEffects): number {
  return applyWayknotPermille(value, effects.stabilityLossPermille);
}

export function modifySweepRisk(value: number, effects: WayknotEffects): number {
  return applyWayknotPermille(value, effects.sweepRiskPermille);
}

export function modifyPathCost(value: number, effects: WayknotEffects): number {
  return applyWayknotPermille(value, effects.pathCostPermille);
}

function effectApplies(kind: WayknotKind, context: WayknotTileContext): boolean {
  switch (kind) {
    case "reed-mat":
      return context.terrain === "tidal-flat" || context.terrain === "marsh";
    case "tide-anchor":
      return context.terrain === "deep-water" || context.waterDepth >= WAYKNOT_WET_DEPTH;
    case "wind-knot":
      return context.windExposed && (context.terrain === "meadow" || context.terrain === "ridge");
  }
}

function influenceFor(wayknot: Wayknot, distance: number): WayknotInfluence {
  const radius = WAYKNOT_RADII[wayknot.kind];
  switch (wayknot.kind) {
    case "reed-mat":
      return Object.freeze({
        id: wayknot.id,
        kind: wayknot.kind,
        distance,
        radius,
        movementCostPermille: 560,
        staminaCostPermille: 760,
        stabilityLossPermille: WAYKNOT_PERMILLE,
        sweepRiskPermille: WAYKNOT_PERMILLE,
        pathCostPermille: 560,
      });
    case "tide-anchor": {
      const stamina = [600, 750, 900][distance] ?? WAYKNOT_PERMILLE;
      const sweep = [400, 650, 850][distance] ?? WAYKNOT_PERMILLE;
      const path = [720, 850, 950][distance] ?? WAYKNOT_PERMILLE;
      return Object.freeze({
        id: wayknot.id,
        kind: wayknot.kind,
        distance,
        radius,
        movementCostPermille: WAYKNOT_PERMILLE,
        staminaCostPermille: stamina,
        stabilityLossPermille: WAYKNOT_PERMILLE,
        sweepRiskPermille: sweep,
        pathCostPermille: path,
      });
    }
    case "wind-knot": {
      const stability = [500, 650, 800, 900][distance] ?? WAYKNOT_PERMILLE;
      const path = [800, 875, 940, 980][distance] ?? WAYKNOT_PERMILLE;
      return Object.freeze({
        id: wayknot.id,
        kind: wayknot.kind,
        distance,
        radius,
        movementCostPermille: WAYKNOT_PERMILLE,
        staminaCostPermille: WAYKNOT_PERMILLE,
        stabilityLossPermille: stability,
        sweepRiskPermille: WAYKNOT_PERMILLE,
        pathCostPermille: path,
      });
    }
  }
}

function strongest(
  influences: readonly WayknotInfluence[],
  key: keyof Pick<
    WayknotInfluence,
    | "movementCostPermille"
    | "staminaCostPermille"
    | "stabilityLossPermille"
    | "sweepRiskPermille"
    | "pathCostPermille"
  >,
): number {
  return influences.reduce(
    (best, influence) => Math.min(best, influence[key]),
    WAYKNOT_PERMILLE,
  );
}

function neutralEffects(): WayknotEffects {
  return Object.freeze({
    movementCostPermille: WAYKNOT_PERMILLE,
    staminaCostPermille: WAYKNOT_PERMILLE,
    stabilityLossPermille: WAYKNOT_PERMILLE,
    sweepRiskPermille: WAYKNOT_PERMILLE,
    pathCostPermille: WAYKNOT_PERMILLE,
    influences: Object.freeze([]),
  });
}

function normalizeTileIndex(value: unknown, tileCount?: number): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
  const tileIndex = value as number;
  return tileCount !== undefined && tileIndex >= tileCount ? null : tileIndex;
}

function normalizeCapacity(value: unknown, fallback = DEFAULT_WAYKNOT_CAPACITY): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.max(0, Math.min(MAX_WAYKNOT_CAPACITY, Math.trunc(value as number)));
}

function compareNormalizationCandidate(left: Wayknot, right: Wayknot): number {
  const leftCarried = left.tileIndex === null ? 0 : 1;
  const rightCarried = right.tileIndex === null ? 0 : 1;
  return leftCarried - rightCarried
    || (KIND_ORDER.get(left.kind) ?? 0) - (KIND_ORDER.get(right.kind) ?? 0)
    || (left.tileIndex ?? -1) - (right.tileIndex ?? -1);
}

function isValidTileContext(context: WayknotTileContext): boolean {
  return Number.isSafeInteger(context.tileIndex)
    && context.tileIndex >= 0
    && TERRAIN_KINDS.has(context.terrain)
    && Number.isFinite(context.waterDepth)
    && context.waterDepth >= 0
    && typeof context.windExposed === "boolean"
    && (context.occupied === undefined || typeof context.occupied === "boolean");
}

function isValidGrid(grid: WayknotGrid): boolean {
  return Number.isSafeInteger(grid.width)
    && Number.isSafeInteger(grid.height)
    && grid.width > 0
    && grid.height > 0
    && grid.width * grid.height <= Number.MAX_SAFE_INTEGER;
}

function isGridIndex(index: number, grid: WayknotGrid): boolean {
  return Number.isSafeInteger(index) && index >= 0 && index < grid.width * grid.height;
}

function defaultKindForId(id: number): WayknotKind | null {
  if (id === 1 || id === 2) return "reed-mat";
  if (id === 3 || id === 4) return "tide-anchor";
  if (id === 5 || id === 6) return "wind-knot";
  return null;
}

function freezeWayknot(wayknot: Wayknot): Wayknot {
  return Object.freeze({ ...wayknot });
}

function makeState(capacity: number, wayknots: readonly Wayknot[]): WayknotState {
  const ordered = [...wayknots]
    .sort((left, right) => left.id - right.id)
    .map(freezeWayknot);
  return Object.freeze({
    version: WAYKNOT_STATE_VERSION,
    capacity,
    wayknots: Object.freeze(ordered),
  });
}

function successfulAction(
  state: WayknotState,
  reason: Extract<WayknotActionReason, "placed" | "reclaimed" | "redeployed">,
  wayknot: Wayknot,
): WayknotActionResult {
  return Object.freeze({ ok: true, reason, state, wayknot });
}

function failedAction(
  state: WayknotState,
  reason: Exclude<WayknotActionReason, "placed" | "reclaimed" | "redeployed">,
  wayknot: Wayknot | null = null,
): WayknotActionResult {
  return Object.freeze({ ok: false, reason, state, wayknot });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
