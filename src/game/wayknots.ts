import type { TerrainKind } from "../sim/types";
import {
  isRegionCoord,
  regionKey,
  type RegionCoord,
} from "../sim/regions";
import {
  CRAFTING_CONDITION_MAX,
  WAYKNOT_MIN_PLACEMENT_CONDITION,
  quoteWayknotServiceWear,
} from "./crafting";

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

export const WAYKNOT_STATE_VERSION = 3 as const;
export const WAYKNOT_COMPATIBILITY_REGION: RegionCoord = Object.freeze({ x: 0, y: 0 });
export const DEFAULT_WAYKNOT_CAPACITY = 6;
export const MAX_WAYKNOT_CAPACITY = 6;
export const WAYKNOT_WET_DEPTH = 40_000;
export const TIDE_ANCHOR_PLACEMENT_DEPTH = 120_000;
export const WAYKNOT_PERMILLE = 1_000;
export const WAYKNOT_CONDITION_MAX = CRAFTING_CONDITION_MAX;
export { WAYKNOT_MIN_PLACEMENT_CONDITION } from "./crafting";
export const WAYKNOT_SETTING_TICKS = 3;
export const WAYKNOT_SETTING_STRENGTH = 500_000;
export const WAYKNOT_FULL_STRENGTH = CRAFTING_CONDITION_MAX;
/** Denominator for exact fractional benefit-wear accumulation. */
export const WAYKNOT_SERVICE_REMAINDER_SCALE = CRAFTING_CONDITION_MAX;

/** Derived from the crafting kernel so placement/reclaim cannot drift apart. */
export const WAYKNOT_PLACEMENT_CONDITION_COST = quoteWayknotServiceWear(
  "reed-mat",
  CRAFTING_CONDITION_MAX,
  "placement",
).conditionSpent;
export const WAYKNOT_RECLAIM_CONDITION_COST = quoteWayknotServiceWear(
  "reed-mat",
  CRAFTING_CONDITION_MAX,
  "reclaim",
).conditionSpent;

export const WAYKNOT_RADII: Readonly<Record<WayknotKind, number>> = Object.freeze({
  "reed-mat": 0,
  "tide-anchor": 2,
  "wind-knot": 3,
});

/**
 * A knot remains in the field kit after reclamation. A carried piece has both
 * `region` and `tileIndex` null; a deployed piece has both halves of its
 * canonical address. Rebinding spends persistent condition rather than
 * creating/deleting a piece; IDs never change during reclaim/redeploy.
 */
export interface Wayknot {
  readonly id: number;
  readonly kind: WayknotKind;
  readonly region: RegionCoord | null;
  readonly tileIndex: number | null;
  /** Persistent fixed-point durability. Zero is broken, but never deletes the aid. */
  readonly condition: number;
  /** A deployed knot has half strength until this active world tick. */
  readonly readyTick: number;
  /** Numerator remainder retained by exact fractional benefit-wear accounting. */
  readonly serviceWearRemainder: number;
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
  | "condition-too-low"
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
  /** More specific placement blocker when the legacy action reason is coarser. */
  readonly placementReason?: WayknotPlacementReason;
  readonly state: WayknotState;
  readonly wayknot: Wayknot | null;
}

export interface NormalizeWayknotOptions {
  /** An authoritative gameplay cap. If absent, a valid saved cap is retained. */
  readonly capacity?: number;
  /** Invalid/out-of-world placements are safely returned to the carried kit. */
  readonly tileCount?: number;
  /** Tick at which a legacy deployed knot is loaded; legacy knots are ready immediately. */
  readonly loadTick?: number;
  /** Region whose terrain may be revalidated by a legacy one-region callback. */
  readonly contextRegion?: RegionCoord;
  /** Optionally revalidate saved placements against the current terrain. */
  readonly contextAt?: (tileIndex: number, region: RegionCoord) => WayknotTileContext | undefined;
}

export interface WayknotInfluence {
  readonly id: number;
  readonly kind: WayknotKind;
  readonly distance: number;
  readonly radius: number;
  /** Fixed-point 0, half-setting, or full strength at the queried tick. */
  readonly effectStrength: number;
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

export type WayknotServiceReason =
  | "serviced"
  | "not-found"
  | "not-deployed"
  | "inactive"
  | "invalid-benefit"
  | "no-benefit";

export interface WayknotServiceResult {
  readonly ok: boolean;
  readonly reason: WayknotServiceReason;
  readonly state: WayknotState;
  readonly wayknot: Wayknot | null;
  /** Requested fixed-point assistance after setting/broken strength is applied. */
  readonly appliedBenefit: number;
  readonly conditionSpent: number;
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

interface NormalizationCandidate {
  readonly wayknot: Wayknot;
  readonly strictAddress: boolean;
}

interface NormalizedWayknotAddress {
  readonly region: RegionCoord | null;
  readonly tileIndex: number | null;
}

const DEFAULT_WAYKNOT_LOADOUT: readonly Wayknot[] = Object.freeze([
  Object.freeze({
    id: 1, kind: "reed-mat", region: null, tileIndex: null,
    condition: WAYKNOT_CONDITION_MAX, readyTick: 0, serviceWearRemainder: 0,
  }),
  Object.freeze({
    id: 2, kind: "reed-mat", region: null, tileIndex: null,
    condition: WAYKNOT_CONDITION_MAX, readyTick: 0, serviceWearRemainder: 0,
  }),
  Object.freeze({
    id: 3, kind: "tide-anchor", region: null, tileIndex: null,
    condition: WAYKNOT_CONDITION_MAX, readyTick: 0, serviceWearRemainder: 0,
  }),
  Object.freeze({
    id: 4, kind: "tide-anchor", region: null, tileIndex: null,
    condition: WAYKNOT_CONDITION_MAX, readyTick: 0, serviceWearRemainder: 0,
  }),
  Object.freeze({
    id: 5, kind: "wind-knot", region: null, tileIndex: null,
    condition: WAYKNOT_CONDITION_MAX, readyTick: 0, serviceWearRemainder: 0,
  }),
  Object.freeze({
    id: 6, kind: "wind-knot", region: null, tileIndex: null,
    condition: WAYKNOT_CONDITION_MAX, readyTick: 0, serviceWearRemainder: 0,
  }),
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
  const loadTick = normalizeTick(options.loadTick, 0);
  const strictAddress = record.version === WAYKNOT_STATE_VERSION;
  const contextRegion = options.contextRegion === undefined
    ? WAYKNOT_COMPATIBILITY_REGION
    : canonicalRegion(options.contextRegion);
  const hasExplicitWayknots = Object.prototype.hasOwnProperty.call(record, "wayknots");
  if (!hasExplicitWayknots) return createWayknotState(capacity);
  const rawWayknots = Array.isArray(record.wayknots) ? record.wayknots : [];
  const candidates = new Map<number, NormalizationCandidate[]>();

  for (const raw of rawWayknots) {
    if (!isRecord(raw)) continue;
    const id = raw.id;
    if (!Number.isSafeInteger(id) || (id as number) <= 0) continue;
    const kind = defaultKindForId(id as number);
    if (kind === null) continue;
    const address = normalizeSavedAddress(raw, strictAddress, tileCount);
    if (address === undefined) continue;
    let { region, tileIndex } = address;
    if (
      region !== null
      && tileIndex !== null
      && options.contextAt
      && contextRegion !== null
      && sameRegion(region, contextRegion)
    ) {
      const context = options.contextAt(tileIndex, region);
      if (context === undefined) {
        // A sliding presentation frame does not necessarily contain every
        // tile in its current storage region. Absence is not evidence that a
        // strict deployed address became invalid, so preserve it for a later
        // revisit. Legacy records retain their established carried salvage.
        if (!strictAddress) {
          region = null;
          tileIndex = null;
        }
      } else if (
        context.tileIndex !== tileIndex
        || !isValidTileContext(context)
        || context.occupied
        || !supportsWayknot(kind, context)
      ) {
        // A malformed v3 deployment is discarded, never teleported into the
        // pack. Legacy region-zero saves retain their established salvage.
        if (strictAddress) continue;
        region = null;
        tileIndex = null;
      }
    }
    const condition = normalizeCondition(raw.condition);
    const readyTick = tileIndex === null
      ? 0
      : normalizeTick(raw.readyTick, loadTick);
    const serviceWearRemainder = normalizeServiceWearRemainder(raw.serviceWearRemainder);
    const candidate = freezeWayknot({
      id: id as number,
      kind,
      region,
      tileIndex,
      condition,
      readyTick,
      serviceWearRemainder,
    });
    const grouped = candidates.get(candidate.id) ?? [];
    grouped.push({ wayknot: candidate, strictAddress });
    candidates.set(candidate.id, grouped);
  }

  const deduplicated: NormalizationCandidate[] = [];
  for (const id of [...candidates.keys()].sort((left, right) => left - right)) {
    const group = candidates.get(id) ?? [];
    group.sort((left, right) => compareNormalizationCandidate(left.wayknot, right.wayknot));
    const winner = group[0];
    if (winner) deduplicated.push(winner);
  }

  // A malformed save may put several physical aids at one region/tile. Lowest
  // stable ID owns it. Legacy collisions retain the old carried salvage;
  // strict v3 collisions are dropped so corruption cannot create free gear.
  const occupiedAddresses = new Set<string>();
  let deployed = 0;
  const normalized: Wayknot[] = [];
  for (const candidate of deduplicated) {
    const wayknot = candidate.wayknot;
    if (wayknot.region === null || wayknot.tileIndex === null) {
      normalized.push(wayknot);
      continue;
    }
    const key = wayknotAddressKey(wayknot.region, wayknot.tileIndex);
    if (occupiedAddresses.has(key) || deployed >= capacity) {
      if (!candidate.strictAddress) normalized.push(carriedWayknot(wayknot));
      continue;
    }
    occupiedAddresses.add(key);
    deployed += 1;
    normalized.push(wayknot);
  }
  return makeState(capacity, normalized);
}

/** The exact knot occupying a tile, if any. */
export function wayknotAtTile(
  state: WayknotState,
  tileIndex: number,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): Wayknot | null {
  const canonical = canonicalRegion(region);
  if (!canonical || !Number.isSafeInteger(tileIndex) || tileIndex < 0) return null;
  return state.wayknots.find((wayknot) =>
    wayknot.tileIndex === tileIndex
    && wayknot.region !== null
    && sameRegion(wayknot.region, canonical)) ?? null;
}

export function deployedWayknotCount(state: WayknotState): number {
  return state.wayknots.reduce(
    (total, wayknot) => total + (wayknot.region === null || wayknot.tileIndex === null ? 0 : 1),
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
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotPlacementReason {
  const canonical = canonicalRegion(region);
  if (!canonical || !isValidTileContext(context)) return "invalid-context";
  const fieldOccupant = wayknotAtTile(state, context.tileIndex, canonical);
  if (context.occupied || (fieldOccupant !== null && fieldOccupant.id !== movingWayknotId)) {
    return "occupied";
  }
  if (!supportsWayknot(kind, context)) return "unsuitable-terrain";
  const moving = movingWayknotId === undefined
    ? undefined
    : state.wayknots.find((wayknot) => wayknot.id === movingWayknotId);
  if (
    moving
    && moving.region !== null
    && !sameRegion(moving.region, canonical)
  ) return "capacity-reached";
  const addsDeployment = !moving || moving.region === null || moving.tileIndex === null;
  if (addsDeployment && deployedWayknotCount(state) >= state.capacity) {
    return "capacity-reached";
  }
  if (moving) {
    const placementCondition = moving.region === null || moving.tileIndex === null
      ? moving.condition
      : quoteWayknotServiceWear(moving.kind, moving.condition, "reclaim").conditionAfter;
    return placementCondition < WAYKNOT_MIN_PLACEMENT_CONDITION
      ? "condition-too-low"
      : "available";
  }
  const carried = state.wayknots.filter(
    (wayknot) => wayknot.kind === kind && wayknot.region === null && wayknot.tileIndex === null,
  );
  if (carried.length === 0) return "capacity-reached";
  if (!carried.some((wayknot) => wayknot.condition >= WAYKNOT_MIN_PLACEMENT_CONDITION)) {
    return "condition-too-low";
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
  currentTick = 0,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotActionResult {
  const canonical = canonicalRegion(region);
  if (!canonical) return failedAction(state, "invalid-context");
  const validation = validateWayknotPlacement(state, kind, context, undefined, canonical);
  if (validation !== "available") return failedPlacementAction(state, validation);

  const carried = [...state.wayknots]
    .filter((wayknot) =>
      wayknot.kind === kind
      && wayknot.region === null
      && wayknot.tileIndex === null
      && wayknot.condition >= WAYKNOT_MIN_PLACEMENT_CONDITION)
    .sort((left, right) => left.id - right.id)[0];
  // Validation proves this exists. Keep the guard so malformed typed callers
  // still fail closed instead of fabricating an aid.
  if (!carried) return failedAction(state, "capacity-reached");
  const placement = quoteWayknotServiceWear(carried.kind, carried.condition, "placement");
  if (!placement.allowed) return failedPlacementAction(state, "condition-too-low", carried);
  const placed = freezeWayknot({
    ...carried,
    region: canonical,
    tileIndex: context.tileIndex,
    condition: placement.conditionAfter,
    readyTick: settingReadyTick(currentTick),
  });
  const next = state.wayknots.map((wayknot) => wayknot.id === carried.id ? placed : wayknot);
  const nextState = makeState(state.capacity, next);
  return successfulAction(nextState, "placed", placed);
}

/** Place the terrain-appropriate weave, or return a precise failure reason. */
export function placeContextualWayknot(
  state: WayknotState,
  context: WayknotTileContext,
  currentTick = 0,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotActionResult {
  const canonical = canonicalRegion(region);
  if (!canonical || !isValidTileContext(context)) return failedAction(state, "invalid-context");
  if (context.occupied || wayknotAtTile(state, context.tileIndex, canonical)) {
    return failedAction(state, "occupied");
  }
  const kind = contextualWayknotKind(context);
  return kind === null
    ? failedAction(state, "unsuitable-terrain")
    : placeWayknot(state, kind, context, currentTick, canonical);
}

/** Return a placed aid to the kit without deleting or changing its stable ID. */
export function reclaimWayknot(
  state: WayknotState,
  id: number,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotActionResult {
  const canonical = canonicalRegion(region);
  if (!canonical) return failedAction(state, "not-found");
  const existing = state.wayknots.find((wayknot) => wayknot.id === id);
  if (!existing) return failedAction(state, "not-found");
  if (existing.region === null || existing.tileIndex === null) {
    return failedAction(state, "already-carried", existing);
  }
  if (!sameRegion(existing.region, canonical)) return failedAction(state, "not-found");
  const reclaim = quoteWayknotServiceWear(existing.kind, existing.condition, "reclaim");
  const reclaimed = carriedWayknot({
    ...existing,
    condition: reclaim.conditionAfter,
  });
  const nextState = makeState(
    state.capacity,
    state.wayknots.map((wayknot) => wayknot.id === id ? reclaimed : wayknot),
  );
  return successfulAction(nextState, "reclaimed", reclaimed);
}

export function reclaimWayknotAtTile(
  state: WayknotState,
  tileIndex: number,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotActionResult {
  const existing = wayknotAtTile(state, tileIndex, region);
  return existing ? reclaimWayknot(state, existing.id, region) : failedAction(state, "not-found");
}

/** Move one known piece atomically, preserving both its kind and stable ID. */
export function redeployWayknot(
  state: WayknotState,
  id: number,
  context: WayknotTileContext,
  currentTick = 0,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotActionResult {
  const canonical = canonicalRegion(region);
  if (!canonical) return failedAction(state, "invalid-context");
  const existing = state.wayknots.find((wayknot) => wayknot.id === id);
  if (!existing) return failedAction(state, "not-found");
  if (existing.region !== null && !sameRegion(existing.region, canonical)) {
    return failedAction(state, "not-found");
  }
  if (
    existing.region !== null
    && sameRegion(existing.region, canonical)
    && existing.tileIndex === context.tileIndex
  ) return failedAction(state, "already-there", existing);
  const validation = validateWayknotPlacement(state, existing.kind, context, existing.id, canonical);
  if (validation !== "available") return failedPlacementAction(state, validation, existing);
  const afterReclaim = existing.region === null || existing.tileIndex === null
    ? existing.condition
    : quoteWayknotServiceWear(existing.kind, existing.condition, "reclaim").conditionAfter;
  const placement = quoteWayknotServiceWear(existing.kind, afterReclaim, "placement");
  if (!placement.allowed) return failedPlacementAction(state, "condition-too-low", existing);
  const redeployed = freezeWayknot({
    ...existing,
    region: canonical,
    tileIndex: context.tileIndex,
    condition: placement.conditionAfter,
    readyTick: settingReadyTick(currentTick),
  });
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
  currentTick = 0,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotActionResult {
  const existing = wayknotAtTile(state, context.tileIndex, region);
  return existing
    ? reclaimWayknot(state, existing.id, region)
    : placeContextualWayknot(state, context, currentTick, region);
}

/**
 * Query exact Manhattan-radius effects for one tile and explicit world tick.
 * This is independent of frame rate, traversal direction, and input ordering,
 * so the same call can be used by live movement and A* edge-cost evaluation.
 */
export function queryWayknotEffects(
  state: WayknotState,
  context: WayknotTileContext,
  grid: WayknotGrid,
  currentTick = Number.MAX_SAFE_INTEGER,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotEffects {
  const canonical = canonicalRegion(region);
  if (
    !canonical
    || !isValidTileContext(context)
    || !isValidGrid(grid)
    || context.tileIndex >= grid.width * grid.height
  ) {
    return neutralEffects();
  }
  const influences: WayknotInfluence[] = [];
  for (const wayknot of state.wayknots) {
    if (
      wayknot.region === null
      || !sameRegion(wayknot.region, canonical)
      || wayknot.tileIndex === null
      || wayknot.tileIndex >= grid.width * grid.height
    ) continue;
    const effectStrength = wayknotEffectStrength(wayknot, currentTick);
    if (effectStrength === 0) continue;
    const distance = manhattanTileDistance(wayknot.tileIndex, context.tileIndex, grid);
    const radius = WAYKNOT_RADII[wayknot.kind];
    if (distance > radius || !effectApplies(wayknot.kind, context)) continue;
    influences.push(influenceFor(wayknot, distance, effectStrength));
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

/**
 * Carried and broken pieces are inactive. A newly placed piece supplies half
 * benefit while its fibers/anchor/knot settle, then full benefit on readyTick.
 */
export function wayknotEffectStrength(
  wayknot: Wayknot,
  currentTick = Number.MAX_SAFE_INTEGER,
): number {
  if (
    wayknot.region === null
    || wayknot.tileIndex === null
    || normalizeCondition(wayknot.condition) === 0
    || !isValidTick(currentTick)
  ) return 0;
  const readyTick = normalizeTick(wayknot.readyTick, Number.MAX_SAFE_INTEGER);
  return currentTick < readyTick ? WAYKNOT_SETTING_STRENGTH : WAYKNOT_FULL_STRENGTH;
}

/**
 * Geometry consumers can keep drawing a Tide Harp from deployed members while
 * multiplying its gameplay benefit by this weakest-member strength. A broken
 * or missing member makes the Harp inactive without deleting its triangle.
 */
export function tideHarpEffectStrength(
  state: WayknotState,
  members: readonly (number | { readonly id: number; readonly region?: RegionCoord })[],
  currentTick = Number.MAX_SAFE_INTEGER,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): number {
  const canonical = canonicalRegion(region);
  if (!canonical || members.length !== 3 || !isValidTick(currentTick)) return 0;
  const memberIds = members.map((member) => typeof member === "number" ? member : member.id);
  if (
    memberIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
    || new Set(memberIds).size !== memberIds.length
  ) return 0;
  let strength = WAYKNOT_FULL_STRENGTH;
  for (let index = 0; index < memberIds.length; index += 1) {
    const id = memberIds[index];
    if (id === undefined) return 0;
    const member = members[index];
    if (member === undefined) return 0;
    const memberRegion = typeof member === "number" || member.region === undefined
      ? canonical
      : canonicalRegion(member.region);
    if (!memberRegion || !sameRegion(memberRegion, canonical)) return 0;
    const wayknot = state.wayknots.find((candidate) => candidate.id === id);
    if (!wayknot || wayknot.region === null || !sameRegion(wayknot.region, canonical)) return 0;
    strength = Math.min(strength, wayknotEffectStrength(wayknot, currentTick));
  }
  return strength;
}

/**
 * Charge exact durability only after a caller confirms the knot actually
 * helped. `requestedBenefit` is fixed-point; setting strength caps it to 50%.
 * Fractional condition wear survives save/load in serviceWearRemainder.
 */
export function applyWayknotServiceWear(
  state: WayknotState,
  id: number,
  currentTick: number,
  requestedBenefit = WAYKNOT_FULL_STRENGTH,
  region: RegionCoord = WAYKNOT_COMPATIBILITY_REGION,
): WayknotServiceResult {
  const canonical = canonicalRegion(region);
  if (!canonical) return failedService(state, "not-found");
  const existing = state.wayknots.find((wayknot) => wayknot.id === id);
  if (!existing) return failedService(state, "not-found");
  if (existing.region === null || existing.tileIndex === null) {
    return failedService(state, "not-deployed", existing);
  }
  if (!sameRegion(existing.region, canonical)) return failedService(state, "not-found");
  if (
    !isValidTick(currentTick)
    || !Number.isSafeInteger(requestedBenefit)
    || requestedBenefit < 0
    || requestedBenefit > WAYKNOT_FULL_STRENGTH
  ) return failedService(state, "invalid-benefit", existing);
  if (requestedBenefit === 0) return failedService(state, "no-benefit", existing);
  const strength = wayknotEffectStrength(existing, currentTick);
  if (strength === 0) return failedService(state, "inactive", existing);
  const appliedBenefit = Math.trunc(
    (requestedBenefit * strength) / WAYKNOT_FULL_STRENGTH,
  );
  if (appliedBenefit === 0) return failedService(state, "no-benefit", existing);

  const fullServiceWear = quoteWayknotServiceWear(
    existing.kind,
    WAYKNOT_CONDITION_MAX,
    "assisted-use",
  ).conditionSpent;
  const numerator = existing.serviceWearRemainder + fullServiceWear * appliedBenefit;
  const requestedCondition = Math.floor(numerator / WAYKNOT_SERVICE_REMAINDER_SCALE);
  const conditionSpent = Math.min(existing.condition, requestedCondition);
  const serviced = freezeWayknot({
    ...existing,
    condition: existing.condition - conditionSpent,
    serviceWearRemainder: numerator % WAYKNOT_SERVICE_REMAINDER_SCALE,
  });
  const nextState = makeState(
    state.capacity,
    state.wayknots.map((wayknot) => wayknot.id === id ? serviced : wayknot),
  );
  return Object.freeze({
    ok: true,
    reason: "serviced",
    state: nextState,
    wayknot: serviced,
    appliedBenefit,
    conditionSpent,
  });
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

function influenceFor(
  wayknot: Wayknot,
  distance: number,
  effectStrength: number,
): WayknotInfluence {
  const radius = WAYKNOT_RADII[wayknot.kind];
  switch (wayknot.kind) {
    case "reed-mat":
      return Object.freeze({
        id: wayknot.id,
        kind: wayknot.kind,
        distance,
        radius,
        effectStrength,
        movementCostPermille: scaleBenefitPermille(560, effectStrength),
        staminaCostPermille: scaleBenefitPermille(760, effectStrength),
        stabilityLossPermille: WAYKNOT_PERMILLE,
        sweepRiskPermille: WAYKNOT_PERMILLE,
        pathCostPermille: scaleBenefitPermille(560, effectStrength),
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
        effectStrength,
        movementCostPermille: WAYKNOT_PERMILLE,
        staminaCostPermille: scaleBenefitPermille(stamina, effectStrength),
        stabilityLossPermille: WAYKNOT_PERMILLE,
        sweepRiskPermille: scaleBenefitPermille(sweep, effectStrength),
        pathCostPermille: scaleBenefitPermille(path, effectStrength),
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
        effectStrength,
        movementCostPermille: WAYKNOT_PERMILLE,
        staminaCostPermille: WAYKNOT_PERMILLE,
        stabilityLossPermille: scaleBenefitPermille(stability, effectStrength),
        sweepRiskPermille: WAYKNOT_PERMILLE,
        pathCostPermille: scaleBenefitPermille(path, effectStrength),
      });
    }
  }
}

function scaleBenefitPermille(fullStrength: number, effectStrength: number): number {
  const benefit = Math.max(0, WAYKNOT_PERMILLE - fullStrength);
  return WAYKNOT_PERMILLE - Math.trunc(
    (benefit * normalizeCondition(effectStrength)) / WAYKNOT_FULL_STRENGTH,
  );
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

function normalizeSavedAddress(
  value: Readonly<Record<string, unknown>>,
  strictAddress: boolean,
  tileCount?: number,
): NormalizedWayknotAddress | undefined {
  if (!strictAddress) {
    const tileIndex = normalizeTileIndex(value.tileIndex, tileCount);
    return tileIndex === null
      ? { region: null, tileIndex: null }
      : { region: WAYKNOT_COMPATIBILITY_REGION, tileIndex };
  }

  const rawRegion = value.region;
  const rawTileIndex = value.tileIndex;
  if (rawRegion === null && rawTileIndex === null) {
    return { region: null, tileIndex: null };
  }
  // Half-addresses, aliases, and out-of-grid deployments are invalid physical
  // evidence. Dropping the corrupt record is safer than minting carried gear.
  if (rawRegion === null || rawTileIndex === null) return undefined;
  const region = canonicalRegion(rawRegion);
  if (
    !region
    || !Number.isSafeInteger(rawTileIndex)
    || (rawTileIndex as number) < 0
    || (tileCount !== undefined && (rawTileIndex as number) >= tileCount)
  ) return undefined;
  return { region, tileIndex: rawTileIndex as number };
}

function normalizeCapacity(value: unknown, fallback = DEFAULT_WAYKNOT_CAPACITY): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.max(0, Math.min(MAX_WAYKNOT_CAPACITY, Math.trunc(value as number)));
}

function normalizeCondition(value: unknown): number {
  if (value === undefined) return WAYKNOT_CONDITION_MAX;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(WAYKNOT_CONDITION_MAX, Math.trunc(value as number)));
}

function normalizeServiceWearRemainder(value: unknown): number {
  if (!Number.isSafeInteger(value)) return 0;
  return Math.max(
    0,
    Math.min(WAYKNOT_SERVICE_REMAINDER_SCALE - 1, Math.trunc(value as number)),
  );
}

function isValidTick(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function normalizeTick(value: unknown, fallback: number): number {
  return isValidTick(value) ? value : fallback;
}

function settingReadyTick(currentTick: number): number {
  const tick = normalizeTick(currentTick, 0);
  return Math.min(Number.MAX_SAFE_INTEGER, tick + WAYKNOT_SETTING_TICKS);
}

function compareNormalizationCandidate(left: Wayknot, right: Wayknot): number {
  // Conflicting duplicate records prefer physical deployment evidence over a
  // carried copy, preventing normalization from teleporting an aid into hand.
  const leftCarried = left.region === null || left.tileIndex === null ? 1 : 0;
  const rightCarried = right.region === null || right.tileIndex === null ? 1 : 0;
  return leftCarried - rightCarried
    || (KIND_ORDER.get(left.kind) ?? 0) - (KIND_ORDER.get(right.kind) ?? 0)
    || compareRegions(left.region, right.region)
    || (left.tileIndex ?? -1) - (right.tileIndex ?? -1)
    // Duplicate save records resolve conservatively, never repairing wear.
    || left.condition - right.condition
    || right.readyTick - left.readyTick
    || right.serviceWearRemainder - left.serviceWearRemainder;
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
  return Object.freeze({
    ...wayknot,
    region: wayknot.region === null
      ? null
      : Object.freeze({ x: wayknot.region.x, y: wayknot.region.y }),
  });
}

function carriedWayknot(wayknot: Wayknot): Wayknot {
  return freezeWayknot({ ...wayknot, region: null, tileIndex: null, readyTick: 0 });
}

function canonicalRegion(value: unknown): RegionCoord | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "x,y" || !isRegionCoord(value)) {
    return null;
  }
  return Object.freeze({ x: value.x as number, y: value.y as number });
}

function sameRegion(left: RegionCoord, right: RegionCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

function compareRegions(left: RegionCoord | null, right: RegionCoord | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  if (left.x !== right.x) return left.x < right.x ? -1 : 1;
  if (left.y !== right.y) return left.y < right.y ? -1 : 1;
  return 0;
}

function wayknotAddressKey(region: RegionCoord, tileIndex: number): string {
  return `${regionKey(region)}:t:${tileIndex}`;
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

function failedPlacementAction(
  state: WayknotState,
  placementReason: Exclude<WayknotPlacementReason, "available">,
  wayknot: Wayknot | null = null,
): WayknotActionResult {
  if (placementReason === "condition-too-low") {
    // Keep the v1 action union source-compatible; new callers should read the
    // precise placementReason while old UI treats an unusable carried piece as
    // unavailable capacity until the repair transaction is integrated.
    return Object.freeze({
      ok: false,
      reason: "capacity-reached",
      placementReason,
      state,
      wayknot,
    });
  }
  return failedAction(state, placementReason, wayknot);
}

function failedService(
  state: WayknotState,
  reason: Exclude<WayknotServiceReason, "serviced">,
  wayknot: Wayknot | null = null,
): WayknotServiceResult {
  return Object.freeze({
    ok: false,
    reason,
    state,
    wayknot,
    appliedBenefit: 0,
    conditionSpent: 0,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
