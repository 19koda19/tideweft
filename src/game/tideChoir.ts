import {
  MIN_ROUTE_REINFORCEMENT_COVERAGE,
  calculateRouteTraceCoverage,
  type RouteState,
  type WorldView,
} from "../sim/public";

export const SURVEY_COVERAGE_THRESHOLD = MIN_ROUTE_REINFORCEMENT_COVERAGE;
export const MINIMUM_CHOIR_EDGE_COUNT = 3;
export const MAXIMUM_CHOIR_EDGE_COUNT = 7;

export type TideChoirRouteWorld = Pick<WorldView, "routes">;

export type HarborLegSurveyReason =
  | "surveyed"
  | "same-harbor"
  | "missing-route"
  | "insufficient-coverage";

export interface HarborLegSurvey {
  readonly fromHarborId: number;
  readonly toHarborId: number;
  readonly routeId: number | null;
  readonly coverage: number;
  readonly surveyed: boolean;
  readonly reason: HarborLegSurveyReason;
}

export interface TideChoirCycle {
  /** Canonical closed harbor order. The first harbor is repeated at the end. */
  readonly harborIds: readonly number[];
  /** Canonical identity order, independent of traversal direction or starting harbor. */
  readonly routeIds: readonly number[];
  readonly key: string;
}

export type TideChoirMemory = readonly string[] | ReadonlySet<string>;

export type HarborTrailUpdateReason =
  | "extended"
  | "restarted"
  | "choir-awakened"
  | "choir-remembered"
  | "leg-not-surveyed"
  | "nonexistent-edge"
  | "immediate-backtrack"
  | "repeated-interior-vertex";

export interface HarborTrailUpdate {
  readonly accepted: boolean;
  /** A normalized, open, simple trail ending at the player's current harbor. */
  readonly trail: readonly number[];
  /** Present only when this update closes a structurally valid, not-yet-remembered loop. */
  readonly choir: TideChoirCycle | null;
  readonly reason: HarborTrailUpdateReason;
}

/**
 * Judge one completed harbor-to-harbor journey against that pair's direct route.
 * The trace is never mutated, and an absent direct edge cannot be surveyed.
 */
export function assessHarborLeg(
  world: WorldView,
  fromHarborId: number,
  toHarborId: number,
  trace: readonly number[],
): HarborLegSurvey {
  if (fromHarborId === toHarborId) {
    return surveyResult(fromHarborId, toHarborId, null, 0, false, "same-harbor");
  }

  const route = directRoute(world, fromHarborId, toHarborId);
  if (route === undefined) {
    return surveyResult(fromHarborId, toHarborId, null, 0, false, "missing-route");
  }

  const coverage = calculateRouteTraceCoverage(world, route, trace);
  const surveyed = coverage >= SURVEY_COVERAGE_THRESHOLD;
  return surveyResult(
    fromHarborId,
    toHarborId,
    route.id,
    coverage,
    surveyed,
    surveyed ? "surveyed" : "insufficient-coverage",
  );
}

/**
 * Convert restored or externally supplied trail data into an immutable simple
 * suffix. Invalid values, duplicate visits, and overlong history cannot leak
 * into future cycle detection.
 */
export function normalizeHarborTrail(harborIds: readonly number[]): readonly number[] {
  let normalized: number[] = [];
  for (const harborId of harborIds) {
    if (!Number.isSafeInteger(harborId) || harborId < 0) continue;
    if (normalized.at(-1) === harborId) continue;
    if (normalized.includes(harborId)) {
      normalized = [harborId];
      continue;
    }
    normalized.push(harborId);
    if (normalized.length > MAXIMUM_CHOIR_EDGE_COUNT) {
      normalized = normalized.slice(-MAXIMUM_CHOIR_EDGE_COUNT);
    }
  }
  return Object.freeze(normalized);
}

/**
 * Detect a closed simple cycle and return its direction-independent identity.
 * Remembered keys are deliberately suppressed so an old loop cannot reward
 * itself twice after a save/load or reverse traversal.
 */
export function detectNewlyClosedChoir(
  world: TideChoirRouteWorld,
  closedHarborIds: readonly number[],
  rememberedChoirKeys: TideChoirMemory = [],
): TideChoirCycle | null {
  const cycle = describeClosedSimpleCycle(world, closedHarborIds);
  if (cycle === null || memoryHas(rememberedChoirKeys, cycle.key)) return null;
  return cycle;
}

/**
 * Add one genuinely surveyed leg to the player's personal phrase. Rejected
 * legs break the phrase at the arrival harbor, preventing an unsurveyed gap,
 * backtrack, or malformed edge from becoming part of a later choir.
 */
export function appendSurveyedHarborLeg(
  world: TideChoirRouteWorld,
  harborTrail: readonly number[],
  leg: HarborLegSurvey,
  rememberedChoirKeys: TideChoirMemory = [],
): HarborTrailUpdate {
  const trail = normalizeHarborTrail(harborTrail);
  const arrivalTrail = frozenTrail([leg.toHarborId]);
  const route = directRoute(world, leg.fromHarborId, leg.toHarborId);
  if (route === undefined || leg.routeId === null || route.id !== leg.routeId) {
    return update(false, arrivalTrail, null, "nonexistent-edge");
  }
  if (!leg.surveyed || leg.coverage < SURVEY_COVERAGE_THRESHOLD) {
    return update(false, arrivalTrail, null, "leg-not-surveyed");
  }

  const currentHarborId = trail.at(-1);
  if (currentHarborId === undefined || currentHarborId !== leg.fromHarborId) {
    return update(
      true,
      normalizeHarborTrail([leg.fromHarborId, leg.toHarborId]),
      null,
      currentHarborId === undefined ? "extended" : "restarted",
    );
  }

  const priorHarborId = trail.at(-2);
  if (priorHarborId !== undefined && priorHarborId === leg.toHarborId) {
    return update(false, arrivalTrail, null, "immediate-backtrack");
  }

  const previousVisit = trail.indexOf(leg.toHarborId);
  if (previousVisit > 0) {
    return update(false, arrivalTrail, null, "repeated-interior-vertex");
  }

  if (previousVisit === 0) {
    const closedHarborIds = [...trail, leg.toHarborId];
    const cycle = describeClosedSimpleCycle(world, closedHarborIds);
    if (cycle === null) {
      return update(false, arrivalTrail, null, "repeated-interior-vertex");
    }
    if (memoryHas(rememberedChoirKeys, cycle.key)) {
      return update(true, arrivalTrail, null, "choir-remembered");
    }
    return update(true, arrivalTrail, cycle, "choir-awakened");
  }

  return update(
    true,
    normalizeHarborTrail([...trail, leg.toHarborId]),
    null,
    "extended",
  );
}

function describeClosedSimpleCycle(
  world: TideChoirRouteWorld,
  closedHarborIds: readonly number[],
): TideChoirCycle | null {
  const edgeCount = closedHarborIds.length - 1;
  if (edgeCount < MINIMUM_CHOIR_EDGE_COUNT || edgeCount > MAXIMUM_CHOIR_EDGE_COUNT) return null;

  const firstHarborId = closedHarborIds[0];
  const finalHarborId = closedHarborIds.at(-1);
  if (firstHarborId === undefined || firstHarborId !== finalHarborId) return null;

  const openHarborIds = closedHarborIds.slice(0, -1);
  if (openHarborIds.some((harborId) => !Number.isSafeInteger(harborId) || harborId < 0)) return null;
  if (new Set(openHarborIds).size !== openHarborIds.length) return null;

  const routeIds: number[] = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const fromHarborId = closedHarborIds[index];
    const toHarborId = closedHarborIds[index + 1];
    if (fromHarborId === undefined || toHarborId === undefined || fromHarborId === toHarborId) return null;
    const route = directRoute(world, fromHarborId, toHarborId);
    if (route === undefined) return null;
    routeIds.push(route.id);
  }

  const canonicalRouteIds = Object.freeze([...routeIds].sort((left, right) => left - right));
  const canonicalHarborIds = canonicalClosedHarborOrder(openHarborIds);
  return Object.freeze({
    harborIds: canonicalHarborIds,
    routeIds: canonicalRouteIds,
    key: `tide-choir:${canonicalRouteIds.join("-")}`,
  });
}

function directRoute(
  world: TideChoirRouteWorld,
  leftHarborId: number,
  rightHarborId: number,
): RouteState | undefined {
  let match: RouteState | undefined;
  for (const route of world.routes) {
    const connects =
      (route.fromSettlementId === leftHarborId && route.toSettlementId === rightHarborId)
      || (route.fromSettlementId === rightHarborId && route.toSettlementId === leftHarborId);
    if (connects && (match === undefined || route.id < match.id)) match = route;
  }
  return match;
}

function canonicalClosedHarborOrder(openHarborIds: readonly number[]): readonly number[] {
  const candidates: number[][] = [];
  const forward = [...openHarborIds];
  const backward = [...openHarborIds].reverse();
  for (const order of [forward, backward]) {
    for (let offset = 0; offset < order.length; offset += 1) {
      candidates.push([...order.slice(offset), ...order.slice(0, offset)]);
    }
  }
  candidates.sort(compareNumberLists);
  const canonical = candidates[0];
  if (canonical === undefined || canonical[0] === undefined) return Object.freeze([]);
  return Object.freeze([...canonical, canonical[0]]);
}

function compareNumberLists(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function memoryHas(memory: TideChoirMemory, key: string): boolean {
  return "has" in memory ? memory.has(key) : memory.includes(key);
}

function surveyResult(
  fromHarborId: number,
  toHarborId: number,
  routeId: number | null,
  coverage: number,
  surveyed: boolean,
  reason: HarborLegSurveyReason,
): HarborLegSurvey {
  return Object.freeze({ fromHarborId, toHarborId, routeId, coverage, surveyed, reason });
}

function frozenTrail(harborIds: readonly number[]): readonly number[] {
  return Object.freeze([...harborIds]);
}

function update(
  accepted: boolean,
  trail: readonly number[],
  choir: TideChoirCycle | null,
  reason: HarborTrailUpdateReason,
): HarborTrailUpdate {
  return Object.freeze({ accepted, trail, choir, reason });
}
