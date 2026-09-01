import { keyedRandomInt, keyedRandomU32, type RootSeed } from "./rng";
import { FIXED_POINT, type TerrainKind, type TerrainState, type TerrainTile } from "./types";

/**
 * Derived rock and ladder rules. Rock fields are regenerated from the world
 * seed and terrain, so neither rocks nor their formation IDs need a save-schema
 * migration. All public numeric signals are integers and all arrays are in a
 * canonical order.
 */

export const ROCK_FIELD_VERSION = 1 as const;
export const LADDER_KIT_VERSION = 1 as const;
export const DEFAULT_LADDER_COUNT = 2;
export const MAX_LADDER_COUNT = 4;
export const MIN_LADDER_SPAN = 2;
export const MAX_LADDER_SPAN = 4;
export const MIN_LADDER_PLACEMENT_CONDITION = 250_000;
export const MIN_LADDER_SUPPORT = 350_000;

export const ROCK_SEVERITIES = [
  "broken-ground",
  "scramble",
  "ledge",
  "wall",
] as const;

export type RockSeverity = (typeof ROCK_SEVERITIES)[number];
export type LadderOrientation = "east-west" | "north-south";

export type RockTerrainTile = Pick<
  TerrainTile,
  "index" | "x" | "y" | "elevation" | "roughness" | "terrain"
>;

export type RockTerrain = Pick<TerrainState, "width" | "height"> & {
  readonly tiles: readonly RockTerrainTile[];
};

export interface RockObstacle {
  /** Stable within a world: canonical tile index plus one. */
  readonly id: number;
  /** Stable connected-component ID: the component's lowest obstacle ID. */
  readonly formationId: number;
  readonly tileIndex: number;
  /** Fixed-point normalized obstacle height, 0..1. */
  readonly height: number;
  /** Greatest cardinal elevation delta around this tile, fixed-point 0..1. */
  readonly slope: number;
  readonly severity: RockSeverity;
  readonly walkingBlocked: boolean;
  readonly highRisk: boolean;
  /** Chance signal in thousandths before porter/cargo modifiers. */
  readonly fallRiskPermille: number;
  /** Movement-cost multiplier in thousandths. 1,000 is ordinary ground. */
  readonly travelCostPermille: number;
}

export interface RockFormation {
  readonly id: number;
  readonly obstacleIds: readonly number[];
  readonly tileIndices: readonly number[];
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly peakHeight: number;
}

export interface RockField {
  readonly version: typeof ROCK_FIELD_VERSION;
  readonly width: number;
  readonly height: number;
  readonly obstacles: readonly RockObstacle[];
  readonly formations: readonly RockFormation[];
}

export interface LadderDeployment {
  readonly fromTileIndex: number;
  readonly toTileIndex: number;
  readonly orientation: LadderOrientation;
  /** Cardinal edge count from one supported end to the other. */
  readonly span: number;
  /** Inclusive, ordered from `fromTileIndex` to `toTileIndex`. */
  readonly pathTileIndices: readonly number[];
  readonly obstacleIds: readonly number[];
  readonly formationId: number;
  /** Placement support before future wear, fixed-point 0..1. */
  readonly support: number;
}

export interface LadderKitItem {
  readonly id: number;
  readonly maxSpan: number;
  /** Persistent reusable-kit condition, fixed-point 0..1. */
  readonly condition: number;
  readonly deployment: LadderDeployment | null;
}

export interface LadderKitState {
  readonly version: typeof LADDER_KIT_VERSION;
  readonly ladders: readonly LadderKitItem[];
}

export interface LadderPlacementContext {
  readonly terrain: RockTerrain;
  readonly rocks: RockField;
  /** Settlements, loose cargo, actors, or other blockers supplied by the caller. */
  readonly occupiedTileIndices?: readonly number[];
}

export interface LadderPlacementRequest {
  readonly ladderId: number;
  readonly fromTileIndex: number;
  readonly toTileIndex: number;
}

export type LadderPlacementReason =
  | "available"
  | "ladder-not-found"
  | "already-deployed"
  | "condition-too-low"
  | "invalid-endpoint"
  | "not-cardinal"
  | "span-too-short"
  | "span-too-long"
  | "occupied"
  | "overlaps-ladder"
  | "unsupported-endpoint"
  | "no-rock-crossing"
  | "mixed-formation"
  | "support-too-low";

export interface LadderPlacementValidation {
  readonly ok: boolean;
  readonly reason: LadderPlacementReason;
  readonly ladderId: number;
  readonly deployment: LadderDeployment | null;
}

export type LadderActionReason = LadderPlacementReason
  | "deployed"
  | "reclaimed"
  | "damaged"
  | "not-deployed"
  | "not-at-endpoint"
  | "crossing-occupied"
  | "invalid-damage";

export interface LadderActionResult {
  readonly ok: boolean;
  readonly reason: LadderActionReason;
  readonly state: LadderKitState;
  readonly ladder: LadderKitItem | null;
}

export interface LadderReclaimRequest {
  readonly ladderId: number;
  /** A deployed ladder can only be folded from either supported endpoint. */
  readonly actorTileIndex: number;
  /** Callers set this while an actor or loose cargo is on the ladder. */
  readonly crossingOccupied?: boolean;
}

export interface RockCrossingEffect {
  readonly valid: boolean;
  readonly fromTileIndex: number;
  readonly toTileIndex: number;
  readonly obstacleIds: readonly number[];
  readonly baseWalkingBlocked: boolean;
  readonly baseHighRisk: boolean;
  readonly baseFallRiskPermille: number;
  readonly baseTravelCostPermille: number;
  readonly ladderId: number | null;
  readonly ladderSupport: number;
  readonly passable: boolean;
  readonly highRisk: boolean;
  readonly fallRiskPermille: number;
  readonly travelCostPermille: number;
}

interface CanonicalTerrainTile {
  readonly tileIndex: number;
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly roughness: number;
  readonly terrain: TerrainKind;
}

interface RockCandidate extends Omit<RockObstacle, "formationId"> {
  readonly x: number;
  readonly y: number;
}

const MAX_DERIVED_GRID_TILES = 262_144;
const OUTCROP_CELL_SIZE = 7;
const OUTCROP_CELL_CHANCE = 360_000;
const OUTCROP_DOMAIN = 0x524f_434b;
const OUTCROP_ACTIVE_PURPOSE = 1;
const OUTCROP_X_PURPOSE = 2;
const OUTCROP_Y_PURPOSE = 3;
const OUTCROP_RADIUS_PURPOSE = 4;
const OUTCROP_DETAIL_PURPOSE = 5;
const RISK_LIMIT = 950;
const COST_LIMIT = 6_000;

const TERRAIN_KINDS: ReadonlySet<string> = new Set<TerrainKind>([
  "deep-water",
  "tidal-flat",
  "marsh",
  "meadow",
  "ridge",
]);

const SEVERITY_BASE_RISK: Readonly<Record<RockSeverity, number>> = {
  "broken-ground": 80,
  scramble: 210,
  ledge: 430,
  wall: 700,
};

const SEVERITY_BASE_COST: Readonly<Record<RockSeverity, number>> = {
  "broken-ground": 1_350,
  scramble: 1_900,
  ledge: 2_850,
  wall: 5_200,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampFixed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function clampPermille(value: number, maximum = 1_000): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= maximum) return maximum;
  return Math.trunc(value);
}

function multiplyFixed(left: number, right: number): number {
  return Math.trunc((clampFixed(left) * clampFixed(right)) / FIXED_POINT);
}

function normalizeGridDimension(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 512) return 0;
  return value;
}

function normalizeSeed(seed: RootSeed): RootSeed {
  const value: unknown = seed;
  if (!Array.isArray(value)) return [0, 0, 0, 0];
  const word = (index: number): number => {
    const candidate: unknown = value[index];
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.trunc(candidate) >>> 0
      : 0;
  };
  return [word(0), word(1), word(2), word(3)];
}

function normalizeTerrainKind(value: unknown): TerrainKind | null {
  return typeof value === "string" && TERRAIN_KINDS.has(value)
    ? value as TerrainKind
    : null;
}

function compareCanonicalTile(left: CanonicalTerrainTile, right: CanonicalTerrainTile): number {
  return left.elevation - right.elevation
    || left.roughness - right.roughness
    || (left.terrain < right.terrain ? -1 : left.terrain > right.terrain ? 1 : 0);
}

function canonicalTerrain(terrain: RockTerrain): {
  readonly width: number;
  readonly height: number;
  readonly tiles: ReadonlyMap<number, CanonicalTerrainTile>;
} {
  const candidate: unknown = terrain;
  if (!isRecord(candidate)) {
    return { width: 0, height: 0, tiles: new Map() };
  }
  const record = candidate;
  const width = normalizeGridDimension(record.width as number);
  const height = normalizeGridDimension(record.height as number);
  if (width === 0 || height === 0 || width * height > MAX_DERIVED_GRID_TILES) {
    return { width: 0, height: 0, tiles: new Map() };
  }
  const rawTiles = Array.isArray(record.tiles) ? record.tiles : [];
  const byIndex = new Map<number, CanonicalTerrainTile>();
  for (const rawTile of rawTiles.slice(0, MAX_DERIVED_GRID_TILES)) {
    if (!isRecord(rawTile)) continue;
    const raw = rawTile;
    if (!Number.isSafeInteger(raw.x) || !Number.isSafeInteger(raw.y)) continue;
    const x = raw.x as number;
    const y = raw.y as number;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const kind = normalizeTerrainKind(raw.terrain);
    if (kind === null) continue;
    const tile: CanonicalTerrainTile = {
      tileIndex: y * width + x,
      x,
      y,
      elevation: clampFixed(raw.elevation as number),
      roughness: clampFixed(raw.roughness as number),
      terrain: kind,
    };
    const previous = byIndex.get(tile.tileIndex);
    if (previous === undefined || compareCanonicalTile(tile, previous) < 0) {
      byIndex.set(tile.tileIndex, tile);
    }
  }
  return { width, height, tiles: byIndex };
}

function adjacentIndices(
  tile: Pick<CanonicalTerrainTile, "tileIndex" | "x" | "y">,
  width: number,
  height: number,
): number[] {
  const indices: number[] = [];
  if (tile.y > 0) indices.push(tile.tileIndex - width);
  if (tile.x > 0) indices.push(tile.tileIndex - 1);
  if (tile.x + 1 < width) indices.push(tile.tileIndex + 1);
  if (tile.y + 1 < height) indices.push(tile.tileIndex + width);
  return indices;
}

function slopeAt(
  tile: CanonicalTerrainTile,
  width: number,
  height: number,
  tiles: ReadonlyMap<number, CanonicalTerrainTile>,
): number {
  let slope = 0;
  for (const adjacentIndex of adjacentIndices(tile, width, height)) {
    const adjacent = tiles.get(adjacentIndex);
    if (adjacent !== undefined) {
      slope = Math.max(slope, Math.abs(tile.elevation - adjacent.elevation));
    }
  }
  return clampFixed(slope);
}

function cellEntity(cellX: number, cellY: number): number {
  return cellY * 2_048 + cellX;
}

function outcropInfluence(seed: RootSeed, x: number, y: number): number {
  const homeCellX = Math.floor(x / OUTCROP_CELL_SIZE);
  const homeCellY = Math.floor(y / OUTCROP_CELL_SIZE);
  let strongest = 0;
  for (let cellY = Math.max(0, homeCellY - 1); cellY <= homeCellY + 1; cellY += 1) {
    for (let cellX = Math.max(0, homeCellX - 1); cellX <= homeCellX + 1; cellX += 1) {
      const entity = cellEntity(cellX, cellY);
      const active = keyedRandomInt(
        seed,
        OUTCROP_DOMAIN,
        0,
        entity,
        OUTCROP_ACTIVE_PURPOSE,
        0,
        FIXED_POINT - 1,
      ) < OUTCROP_CELL_CHANCE;
      if (!active) continue;
      const anchorX = cellX * OUTCROP_CELL_SIZE + keyedRandomInt(
        seed,
        OUTCROP_DOMAIN,
        0,
        entity,
        OUTCROP_X_PURPOSE,
        1,
        OUTCROP_CELL_SIZE - 2,
      );
      const anchorY = cellY * OUTCROP_CELL_SIZE + keyedRandomInt(
        seed,
        OUTCROP_DOMAIN,
        0,
        entity,
        OUTCROP_Y_PURPOSE,
        1,
        OUTCROP_CELL_SIZE - 2,
      );
      const radius = keyedRandomInt(
        seed,
        OUTCROP_DOMAIN,
        0,
        entity,
        OUTCROP_RADIUS_PURPOSE,
        2,
        4,
      );
      const deltaX = x - anchorX;
      const deltaY = y - anchorY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      const radiusSquared = radius * radius;
      if (distanceSquared > radiusSquared) continue;
      strongest = Math.max(
        strongest,
        FIXED_POINT - Math.trunc((distanceSquared * FIXED_POINT) / (radiusSquared + 1)),
      );
    }
  }
  return clampFixed(strongest);
}

function geologyThreshold(terrain: TerrainKind): number {
  switch (terrain) {
    case "ridge": return 600_000;
    case "meadow": return 675_000;
    case "marsh": return 735_000;
    case "tidal-flat": return 785_000;
    case "deep-water": return FIXED_POINT + 1;
  }
}

function terrainHeightBonus(terrain: TerrainKind): number {
  switch (terrain) {
    case "ridge": return 110_000;
    case "meadow": return 55_000;
    case "marsh": return 35_000;
    case "tidal-flat": return 20_000;
    case "deep-water": return 0;
  }
}

function severityAt(height: number): RockSeverity {
  if (height < 560_000) return "broken-ground";
  if (height < 660_000) return "scramble";
  if (height < 760_000) return "ledge";
  return "wall";
}

function candidateAt(
  seed: RootSeed,
  tile: CanonicalTerrainTile,
  width: number,
  height: number,
  tiles: ReadonlyMap<number, CanonicalTerrainTile>,
): RockCandidate | null {
  if (tile.terrain === "deep-water") return null;
  const influence = outcropInfluence(seed, tile.x, tile.y);
  if (influence === 0) return null;
  const slope = slopeAt(tile, width, height, tiles);
  const detail = keyedRandomU32(
    seed,
    OUTCROP_DOMAIN,
    0,
    tile.tileIndex,
    OUTCROP_DETAIL_PURPOSE,
  ) % (FIXED_POINT + 1);
  const geology = Math.trunc(
    tile.roughness * 0.42
      + tile.elevation * 0.22
      + slope * 1.35
      + influence * 0.38
      + detail * 0.08,
  );
  if (geology < geologyThreshold(tile.terrain)) return null;

  const obstacleHeight = clampFixed(
    70_000
      + tile.roughness * 0.42
      + slope * 1.7
      + influence * 0.28
      + detail * 0.1
      + terrainHeightBonus(tile.terrain),
  );
  const severity = severityAt(obstacleHeight);
  const fallRiskPermille = clampPermille(
    SEVERITY_BASE_RISK[severity]
      + Math.trunc(slope / 1_800)
      + Math.trunc(tile.roughness / 8_000),
    RISK_LIMIT,
  );
  const travelCostPermille = clampPermille(
    SEVERITY_BASE_COST[severity] + Math.trunc(slope / 1_000),
    COST_LIMIT,
  );
  return {
    id: tile.tileIndex + 1,
    tileIndex: tile.tileIndex,
    x: tile.x,
    y: tile.y,
    height: obstacleHeight,
    slope,
    severity,
    walkingBlocked: severity === "wall",
    highRisk: fallRiskPermille >= 350,
    fallRiskPermille,
    travelCostPermille,
  };
}

function buildFormation(
  component: readonly RockCandidate[],
): { readonly formation: RockFormation; readonly obstacles: readonly RockObstacle[] } {
  const ordered = [...component].sort((left, right) => left.tileIndex - right.tileIndex);
  const first = ordered[0];
  if (first === undefined) throw new Error("Cannot build an empty rock formation");
  const formationId = first.id;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  let peakHeight = first.height;
  for (const obstacle of ordered.slice(1)) {
    minX = Math.min(minX, obstacle.x);
    minY = Math.min(minY, obstacle.y);
    maxX = Math.max(maxX, obstacle.x);
    maxY = Math.max(maxY, obstacle.y);
    peakHeight = Math.max(peakHeight, obstacle.height);
  }
  return {
    formation: {
      id: formationId,
      obstacleIds: ordered.map((obstacle) => obstacle.id),
      tileIndices: ordered.map((obstacle) => obstacle.tileIndex),
      minX,
      minY,
      maxX,
      maxY,
      peakHeight,
    },
    obstacles: ordered.map(({ x: _x, y: _y, ...obstacle }) => ({
      ...obstacle,
      formationId,
    })),
  };
}

/**
 * Derives sparse connected outcrops from coarse seeded geology and the current
 * terrain's elevation, roughness, and cardinal slope. Isolated one-tile noise
 * is discarded, leaving formations with at least two cardinally joined rocks.
 */
export function generateRockField(seedInput: RootSeed, terrainInput: RockTerrain): RockField {
  const seed = normalizeSeed(seedInput);
  const terrain = canonicalTerrain(terrainInput);
  if (terrain.width === 0 || terrain.height === 0) {
    return {
      version: ROCK_FIELD_VERSION,
      width: 0,
      height: 0,
      obstacles: [],
      formations: [],
    };
  }
  const candidateMap = new Map<number, RockCandidate>();
  const orderedTiles = [...terrain.tiles.values()].sort(
    (left, right) => left.tileIndex - right.tileIndex,
  );
  for (const tile of orderedTiles) {
    const candidate = candidateAt(
      seed,
      tile,
      terrain.width,
      terrain.height,
      terrain.tiles,
    );
    if (candidate !== null) candidateMap.set(candidate.tileIndex, candidate);
  }

  // Remove isolated speckle before connected-component IDs are assigned.
  for (const [tileIndex, candidate] of [...candidateMap]) {
    const joined = adjacentIndices(candidate, terrain.width, terrain.height)
      .some((adjacentIndex) => candidateMap.has(adjacentIndex));
    if (!joined) candidateMap.delete(tileIndex);
  }

  const visited = new Set<number>();
  const formations: RockFormation[] = [];
  const obstacles: RockObstacle[] = [];
  for (const startIndex of [...candidateMap.keys()].sort((left, right) => left - right)) {
    if (visited.has(startIndex)) continue;
    const component: RockCandidate[] = [];
    const frontier = [startIndex];
    visited.add(startIndex);
    for (let cursor = 0; cursor < frontier.length; cursor += 1) {
      const tileIndex = frontier[cursor];
      if (tileIndex === undefined) continue;
      const candidate = candidateMap.get(tileIndex);
      if (candidate === undefined) continue;
      component.push(candidate);
      const neighbors = adjacentIndices(candidate, terrain.width, terrain.height)
        .filter((neighbor) => candidateMap.has(neighbor))
        .sort((left, right) => left - right);
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        frontier.push(neighbor);
      }
    }
    const built = buildFormation(component);
    formations.push(built.formation);
    obstacles.push(...built.obstacles);
  }
  formations.sort((left, right) => left.id - right.id);
  obstacles.sort((left, right) => left.tileIndex - right.tileIndex);
  return {
    version: ROCK_FIELD_VERSION,
    width: terrain.width,
    height: terrain.height,
    obstacles,
    formations,
  };
}

function normalizeLadderCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LADDER_COUNT;
  return Math.max(0, Math.min(MAX_LADDER_COUNT, Math.trunc(value)));
}

function maxSpanForId(id: number): number {
  return id % 2 === 0 ? MAX_LADDER_SPAN : MAX_LADDER_SPAN - 1;
}

export function createLadderKitState(count = DEFAULT_LADDER_COUNT): LadderKitState {
  return {
    version: LADDER_KIT_VERSION,
    ladders: Array.from({ length: normalizeLadderCount(count) }, (_, index) => {
      const id = index + 1;
      return {
        id,
        maxSpan: maxSpanForId(id),
        condition: FIXED_POINT,
        deployment: null,
      };
    }),
  };
}

function safeLadders(state: LadderKitState): readonly LadderKitItem[] {
  const candidate: unknown = state;
  if (!isRecord(candidate)) return [];
  const ladders = candidate.ladders;
  if (!Array.isArray(ladders)) return [];
  const normalized: LadderKitItem[] = [];
  for (const raw of ladders.slice(0, MAX_LADDER_COUNT)) {
    if (!isRecord(raw) || !Number.isSafeInteger(raw.id)) continue;
    const id = raw.id as number;
    if (id <= 0 || id > MAX_LADDER_COUNT || normalized.some((ladder) => ladder.id === id)) continue;
    normalized.push({
      id,
      maxSpan: maxSpanForId(id),
      condition: clampFixed(raw.condition as number),
      deployment: isRecord(raw.deployment) ? raw.deployment as unknown as LadderDeployment : null,
    });
  }
  return normalized.sort((left, right) => left.id - right.id);
}

function rockByTile(field: RockField): Map<number, RockObstacle> {
  const result = new Map<number, RockObstacle>();
  const obstacles: unknown = (field as { readonly obstacles?: unknown } | null)?.obstacles;
  if (!Array.isArray(obstacles)) return result;
  for (const raw of obstacles) {
    if (!isRecord(raw)) continue;
    const obstacle = raw as unknown as RockObstacle;
    if (!Number.isSafeInteger(obstacle.tileIndex) || obstacle.tileIndex < 0) continue;
    const previous = result.get(obstacle.tileIndex);
    if (previous === undefined || obstacle.id < previous.id) result.set(obstacle.tileIndex, obstacle);
  }
  return result;
}

function coordinateAt(index: number, width: number, height: number): { x: number; y: number } | null {
  if (!Number.isSafeInteger(index) || index < 0 || index >= width * height) return null;
  return { x: index % width, y: Math.floor(index / width) };
}

function lineBetween(
  fromTileIndex: number,
  toTileIndex: number,
  width: number,
  height: number,
): { orientation: LadderOrientation; span: number; path: number[] } | "invalid" | "diagonal" {
  const from = coordinateAt(fromTileIndex, width, height);
  const to = coordinateAt(toTileIndex, width, height);
  if (from === null || to === null || fromTileIndex === toTileIndex) return "invalid";
  if (from.x !== to.x && from.y !== to.y) return "diagonal";
  const orientation: LadderOrientation = from.y === to.y ? "east-west" : "north-south";
  const delta = orientation === "east-west"
    ? Math.sign(to.x - from.x)
    : Math.sign(to.y - from.y) * width;
  const span = orientation === "east-west"
    ? Math.abs(to.x - from.x)
    : Math.abs(to.y - from.y);
  return {
    orientation,
    span,
    path: Array.from({ length: span + 1 }, (_, offset) => fromTileIndex + offset * delta),
  };
}

function endpointSupport(tile: CanonicalTerrainTile): number {
  const base = (() => {
    switch (tile.terrain) {
      case "deep-water": return 0;
      case "tidal-flat": return 300_000;
      case "marsh": return 680_000;
      case "meadow": return FIXED_POINT;
      case "ridge": return 880_000;
    }
  })();
  return clampFixed(base - Math.trunc(tile.roughness / 3));
}

function deploymentPathOverlaps(
  state: LadderKitState,
  ladderId: number,
  path: readonly number[],
): boolean {
  const pathSet = new Set(path);
  return safeLadders(state).some((ladder) =>
    ladder.id !== ladderId
      && ladder.deployment !== null
      && Array.isArray(ladder.deployment.pathTileIndices)
      && ladder.deployment.pathTileIndices.some((tileIndex) => pathSet.has(tileIndex)),
  );
}

function invalidPlacement(
  ladderId: number,
  reason: Exclude<LadderPlacementReason, "available">,
): LadderPlacementValidation {
  return { ok: false, reason, ladderId, deployment: null };
}

/** Validates a cardinal ladder whose supported endpoints surround one coherent outcrop. */
export function validateLadderPlacement(
  context: LadderPlacementContext,
  state: LadderKitState,
  request: LadderPlacementRequest,
): LadderPlacementValidation {
  const rawRequest: unknown = request;
  if (!isRecord(rawRequest) || !Number.isSafeInteger(rawRequest.ladderId)) {
    return invalidPlacement(0, "ladder-not-found");
  }
  const ladderId = rawRequest.ladderId as number;
  const fromTileIndex = rawRequest.fromTileIndex as number;
  const toTileIndex = rawRequest.toTileIndex as number;
  const ladder = safeLadders(state).find((candidate) => candidate.id === ladderId);
  if (ladder === undefined) return invalidPlacement(ladderId, "ladder-not-found");
  if (ladder.deployment !== null) return invalidPlacement(ladderId, "already-deployed");
  const condition = clampFixed(ladder.condition);
  if (condition < MIN_LADDER_PLACEMENT_CONDITION) {
    return invalidPlacement(ladderId, "condition-too-low");
  }
  const rawContext: unknown = context;
  if (!isRecord(rawContext)) return invalidPlacement(ladderId, "invalid-endpoint");
  const terrain = canonicalTerrain(rawContext.terrain as RockTerrain);
  const rocks = rawContext.rocks as RockField | undefined;
  if (
    terrain.width === 0
    || terrain.height === 0
    || !isRecord(rocks)
    || rocks.width !== terrain.width
    || rocks.height !== terrain.height
  ) {
    return invalidPlacement(ladderId, "invalid-endpoint");
  }
  const line = lineBetween(
    fromTileIndex,
    toTileIndex,
    terrain.width,
    terrain.height,
  );
  if (line === "invalid") return invalidPlacement(ladderId, "invalid-endpoint");
  if (line === "diagonal") return invalidPlacement(ladderId, "not-cardinal");
  if (line.span < MIN_LADDER_SPAN) return invalidPlacement(ladderId, "span-too-short");
  if (line.span > ladder.maxSpan) return invalidPlacement(ladderId, "span-too-long");
  const occupied = new Set(
    Array.isArray(rawContext.occupiedTileIndices)
      ? rawContext.occupiedTileIndices.filter((index) => Number.isSafeInteger(index))
      : [],
  );
  if (line.path.some((tileIndex) => occupied.has(tileIndex))) {
    return invalidPlacement(ladderId, "occupied");
  }
  if (deploymentPathOverlaps(state, ladderId, line.path)) {
    return invalidPlacement(ladderId, "overlaps-ladder");
  }
  const fromTile = terrain.tiles.get(fromTileIndex);
  const toTile = terrain.tiles.get(toTileIndex);
  if (fromTile === undefined || toTile === undefined) {
    return invalidPlacement(ladderId, "invalid-endpoint");
  }
  const rocksByTile = rockByTile(rocks);
  if (rocksByTile.has(fromTileIndex) || rocksByTile.has(toTileIndex)) {
    return invalidPlacement(ladderId, "unsupported-endpoint");
  }
  const fromSupport = endpointSupport(fromTile);
  const toSupport = endpointSupport(toTile);
  if (fromSupport === 0 || toSupport === 0) {
    return invalidPlacement(ladderId, "unsupported-endpoint");
  }
  const interior = line.path.slice(1, -1);
  const crossed = interior.map((tileIndex) => rocksByTile.get(tileIndex));
  if (crossed.length === 0 || crossed.some((rock) => rock === undefined)) {
    return invalidPlacement(ladderId, "no-rock-crossing");
  }
  const obstacles = crossed.filter((rock): rock is RockObstacle => rock !== undefined);
  const formationId = obstacles[0]?.formationId;
  if (
    formationId === undefined
    || !Number.isSafeInteger(formationId)
    || obstacles.some((obstacle) => obstacle.formationId !== formationId)
  ) {
    return invalidPlacement(ladderId, "mixed-formation");
  }
  const spanPenalty = Math.max(0, line.span - MIN_LADDER_SPAN) * 40_000;
  const support = clampFixed(
    multiplyFixed(Math.min(fromSupport, toSupport), condition) - spanPenalty,
  );
  if (support < MIN_LADDER_SUPPORT) {
    return invalidPlacement(ladderId, "support-too-low");
  }
  return {
    ok: true,
    reason: "available",
    ladderId: ladder.id,
    deployment: {
      fromTileIndex,
      toTileIndex,
      orientation: line.orientation,
      span: line.span,
      pathTileIndices: line.path,
      obstacleIds: obstacles.map((obstacle) => obstacle.id),
      formationId,
      support,
    },
  };
}

function replaceLadder(
  state: LadderKitState,
  replacement: LadderKitItem,
): LadderKitState {
  const ladders = safeLadders(state)
    .map((ladder) => ladder.id === replacement.id ? replacement : ladder)
    .sort((left, right) => left.id - right.id);
  return { version: LADDER_KIT_VERSION, ladders };
}

export function deployLadder(
  context: LadderPlacementContext,
  state: LadderKitState,
  request: LadderPlacementRequest,
): LadderActionResult {
  const validation = validateLadderPlacement(context, state, request);
  const requestId = isRecord(request) && Number.isSafeInteger(request.ladderId)
    ? request.ladderId
    : 0;
  if (!validation.ok || validation.deployment === null) {
    return {
      ok: false,
      reason: validation.reason,
      state,
      ladder: safeLadders(state).find((ladder) => ladder.id === requestId) ?? null,
    };
  }
  const previous = safeLadders(state).find((ladder) => ladder.id === requestId);
  if (previous === undefined) {
    return { ok: false, reason: "ladder-not-found", state, ladder: null };
  }
  const ladder: LadderKitItem = { ...previous, deployment: validation.deployment };
  const nextState = replaceLadder(state, ladder);
  return { ok: true, reason: "deployed", state: nextState, ladder };
}

export function reclaimLadder(
  state: LadderKitState,
  request: LadderReclaimRequest,
): LadderActionResult {
  const rawRequest: unknown = request;
  const ladderId = isRecord(rawRequest) && Number.isSafeInteger(rawRequest.ladderId)
    ? rawRequest.ladderId as number
    : 0;
  const actorTileIndex = isRecord(rawRequest) ? rawRequest.actorTileIndex : undefined;
  const ladder = safeLadders(state).find((candidate) => candidate.id === ladderId);
  if (ladder === undefined) return { ok: false, reason: "ladder-not-found", state, ladder: null };
  if (ladder.deployment === null) return { ok: false, reason: "not-deployed", state, ladder };
  if (isRecord(rawRequest) && rawRequest.crossingOccupied === true) {
    return { ok: false, reason: "crossing-occupied", state, ladder };
  }
  if (
    actorTileIndex !== ladder.deployment.fromTileIndex
    && actorTileIndex !== ladder.deployment.toTileIndex
  ) {
    return { ok: false, reason: "not-at-endpoint", state, ladder };
  }
  const reclaimed: LadderKitItem = { ...ladder, deployment: null };
  const nextState = replaceLadder(state, reclaimed);
  return { ok: true, reason: "reclaimed", state: nextState, ladder: reclaimed };
}

/** Applies persistent wear without consuming or deleting the reusable ladder. */
export function damageLadder(
  state: LadderKitState,
  ladderId: number,
  damage: number,
): LadderActionResult {
  const ladder = safeLadders(state).find((candidate) => candidate.id === ladderId);
  if (ladder === undefined) return { ok: false, reason: "ladder-not-found", state, ladder: null };
  if (!Number.isSafeInteger(damage) || damage < 0) {
    return { ok: false, reason: "invalid-damage", state, ladder };
  }
  const damaged: LadderKitItem = {
    ...ladder,
    condition: clampFixed(ladder.condition - damage),
  };
  const nextState = replaceLadder(state, damaged);
  return { ok: true, reason: "damaged", state: nextState, ladder: damaged };
}

function edgeIsOnDeployment(
  deployment: LadderDeployment,
  fromTileIndex: number,
  toTileIndex: number,
): boolean {
  if (!isRecord(deployment) || !Array.isArray(deployment.pathTileIndices)) return false;
  for (let index = 1; index < deployment.pathTileIndices.length; index += 1) {
    const left = deployment.pathTileIndices[index - 1];
    const right = deployment.pathTileIndices[index];
    if (
      (left === fromTileIndex && right === toTileIndex)
      || (left === toTileIndex && right === fromTileIndex)
    ) return true;
  }
  return false;
}

/**
 * Resolves one cardinal movement edge. A ladder only helps edges on its own
 * stored path; approaching the same rock from the side receives no benefit.
 */
export function queryRockCrossing(
  field: RockField,
  state: LadderKitState,
  fromTileIndex: number,
  toTileIndex: number,
): RockCrossingEffect {
  const rawField: unknown = field;
  const width = normalizeGridDimension(isRecord(rawField) ? rawField.width as number : 0);
  const height = normalizeGridDimension(isRecord(rawField) ? rawField.height as number : 0);
  const line = width === 0 || height === 0
    ? "invalid"
    : lineBetween(fromTileIndex, toTileIndex, width, height);
  const valid = typeof line === "object" && line.span === 1;
  if (!valid) {
    return {
      valid: false,
      fromTileIndex,
      toTileIndex,
      obstacleIds: [],
      baseWalkingBlocked: false,
      baseHighRisk: false,
      baseFallRiskPermille: 0,
      baseTravelCostPermille: 1_000,
      ladderId: null,
      ladderSupport: 0,
      passable: false,
      highRisk: false,
      fallRiskPermille: 0,
      travelCostPermille: 1_000,
    };
  }
  const rocks = rockByTile(field);
  const obstacles = [rocks.get(fromTileIndex), rocks.get(toTileIndex)]
    .filter((rock): rock is RockObstacle => rock !== undefined)
    .filter((rock, index, all) => all.findIndex((other) => other.id === rock.id) === index)
    .sort((left, right) => left.id - right.id);
  const baseWalkingBlocked = obstacles.some((obstacle) => obstacle.walkingBlocked);
  const baseFallRiskPermille = obstacles.reduce(
    (maximum, obstacle) => Math.max(maximum, clampPermille(obstacle.fallRiskPermille, RISK_LIMIT)),
    0,
  );
  const baseTravelCostPermille = obstacles.reduce(
    (maximum, obstacle) => Math.max(maximum, clampPermille(obstacle.travelCostPermille, COST_LIMIT)),
    1_000,
  );
  const baseHighRisk = obstacles.some((obstacle) => obstacle.highRisk) || baseFallRiskPermille >= 350;
  const obstacleIds = obstacles.map((obstacle) => obstacle.id);
  const ladder = safeLadders(state)
    .filter((candidate) => candidate.deployment !== null)
    .sort((left, right) => left.id - right.id)
    .find((candidate) => {
      const deployment = candidate.deployment;
      if (deployment === null || !edgeIsOnDeployment(deployment, fromTileIndex, toTileIndex)) {
        return false;
      }
      return Array.isArray(deployment.obstacleIds)
        && obstacleIds.some((id) => deployment.obstacleIds.includes(id));
    });
  const ladderSupport = ladder?.deployment === null || ladder === undefined
    ? 0
    : Math.min(clampFixed(ladder.condition), clampFixed(ladder.deployment.support));
  const ladderUsable = ladderSupport >= MIN_LADDER_SUPPORT;
  const riskMitigationPermille = ladderUsable
    ? Math.trunc((ladderSupport * 800) / FIXED_POINT)
    : 0;
  const costMitigationPermille = ladderUsable
    ? Math.trunc((ladderSupport * 680) / FIXED_POINT)
    : 0;
  const fallRiskPermille = Math.trunc(
    (baseFallRiskPermille * (1_000 - riskMitigationPermille)) / 1_000,
  );
  const travelCostPermille = 1_000 + Math.trunc(
    ((baseTravelCostPermille - 1_000) * (1_000 - costMitigationPermille)) / 1_000,
  );
  return {
    valid: true,
    fromTileIndex,
    toTileIndex,
    obstacleIds,
    baseWalkingBlocked,
    baseHighRisk,
    baseFallRiskPermille,
    baseTravelCostPermille,
    ladderId: ladderUsable && obstacles.length > 0 ? ladder?.id ?? null : null,
    ladderSupport,
    passable: obstacles.length === 0 || !baseWalkingBlocked || ladderUsable,
    highRisk: fallRiskPermille >= 350,
    fallRiskPermille,
    travelCostPermille,
  };
}

export function rockObstacleAt(field: RockField, tileIndex: number): RockObstacle | null {
  if (!Number.isSafeInteger(tileIndex) || tileIndex < 0) return null;
  return rockByTile(field).get(tileIndex) ?? null;
}
