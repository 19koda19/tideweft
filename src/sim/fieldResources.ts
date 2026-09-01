import {
  BIOME_IDS,
  deriveBiomeProfile,
  deriveMagicalWaterInfluence,
  type BiomeId,
} from "./biomes";
import { keyedRandomInt, type RootSeed } from "./rng";
import {
  FIXED_POINT,
  type TerrainState,
  type TerrainTile,
  type WeatherState,
} from "./types";

/**
 * Pure, save-ready field-resource ecology.
 *
 * The terrain catalog is fully derived from seed and coordinates. Only the
 * sparse depletion state needs to be persisted later. Time in this module is
 * always an explicitly supplied count of active simulation ticks: there are no
 * dates, timers, or offline catch-up semantics.
 */

export const FIELD_RESOURCE_CATALOG_VERSION = 1 as const;
export const FIELD_RESOURCE_STATE_VERSION = 1 as const;
export const FIELD_RESOURCE_LIVING_RESERVE_UNITS = 1;
export const FIELD_RESOURCE_WEATHER_MIN_PERMILLE = 600;
export const FIELD_RESOURCE_WEATHER_MAX_PERMILLE = 1_600;
export const DEFAULT_BOOTSTRAP_RADIUS = 14;

export const FIELD_MATERIAL_IDS = [
  "bladderkelp",
  "driftwood",
  "glimmer-spore",
  "shellstone",
  "sunfiber",
  "hookstone",
  "cordreed",
  "pitchmoss",
  "stormlichen",
] as const;

export type FieldMaterialId = (typeof FIELD_MATERIAL_IDS)[number];

export const FIELD_RESOURCE_RARITIES = ["common", "secondary", "rare"] as const;
export type FieldResourceRarity = (typeof FIELD_RESOURCE_RARITIES)[number];

export interface BiomeMaterialSet {
  readonly common: FieldMaterialId;
  readonly secondary: FieldMaterialId;
  readonly rare: FieldMaterialId;
}

/** Native material identity is stable even when live weather changes. */
export const FIELD_MATERIALS_BY_BIOME: Readonly<Record<BiomeId, BiomeMaterialSet>> = {
  "tide-channel": {
    common: "bladderkelp",
    secondary: "driftwood",
    rare: "glimmer-spore",
  },
  "brine-flat": {
    common: "shellstone",
    secondary: "sunfiber",
    rare: "hookstone",
  },
  "reed-marsh": {
    common: "cordreed",
    secondary: "pitchmoss",
    rare: "bladderkelp",
  },
  "rain-meadow": {
    common: "pitchmoss",
    secondary: "driftwood",
    rare: "stormlichen",
  },
  "sun-meadow": {
    common: "sunfiber",
    secondary: "driftwood",
    rare: "shellstone",
  },
  "wind-ridge": {
    common: "hookstone",
    secondary: "stormlichen",
    rare: "sunfiber",
  },
  glimmerfen: {
    common: "glimmer-spore",
    secondary: "pitchmoss",
    rare: "bladderkelp",
  },
};

/** Independent mutually-exclusive node chances, in millionths per tile. */
export const FIELD_RESOURCE_DENSITY_PER_MILLION: Readonly<
  Record<FieldResourceRarity, number>
> = {
  common: 150_000,
  secondary: 70_000,
  rare: 25_000,
};

export interface FieldResourceNode {
  /** Seed + coordinate + material identity; never allocated from a cursor. */
  readonly id: string;
  readonly tileIndex: number;
  readonly x: number;
  readonly y: number;
  readonly biome: BiomeId;
  readonly material: FieldMaterialId;
  readonly rarity: FieldResourceRarity;
  /** Whole collectible items. Ordinary harvest can never take the final one. */
  readonly capacityUnits: number;
  /** Exact pack cost for one item, in thousandths of one load unit. */
  readonly unitLoadMilli: number;
  /** Fixed-point item growth per active simulation tick. */
  readonly regenerationPerActiveTickFixed: number;
}

export interface FieldResourceCatalog {
  readonly version: typeof FIELD_RESOURCE_CATALOG_VERSION;
  readonly width: number;
  readonly height: number;
  /** Canonical tile-index order; contains at most one node per tile. */
  readonly nodes: readonly FieldResourceNode[];
}

export interface FieldResourceDepletion {
  readonly nodeId: string;
  /** Missing whole items relative to the node's derived capacity. */
  readonly missingUnits: number;
  /** Fixed-point growth not yet large enough to restore a whole item. */
  readonly regenerationProgressFixed: number;
}

export interface FieldResourceEcologyState {
  readonly version: typeof FIELD_RESOURCE_STATE_VERSION;
  /** Advances only while the simulation explicitly advances this ecology. */
  readonly activeTick: number;
  /** Canonical node-ID order. Full nodes are intentionally absent. */
  readonly depletion: readonly FieldResourceDepletion[];
}

export type FieldResourceWeather = Pick<
  WeatherState,
  "kind" | "intensity" | "windX" | "windY"
>;

export type FieldHarvestReason =
  | "harvested"
  | "node-not-found"
  | "invalid-request"
  | "living-reserve";

export interface FieldHarvestResult {
  readonly ok: boolean;
  readonly reason: FieldHarvestReason;
  readonly node: FieldResourceNode | null;
  readonly material: FieldMaterialId | null;
  readonly harvestedUnits: number;
  readonly loadMilli: number;
  readonly state: FieldResourceEcologyState;
}

export const BOOTSTRAP_FIBER_MATERIALS = ["cordreed", "sunfiber"] as const;
export const BOOTSTRAP_RIGID_MATERIALS = ["driftwood", "shellstone", "hookstone"] as const;

export type BootstrapFiberMaterial = (typeof BOOTSTRAP_FIBER_MATERIALS)[number];
export type BootstrapRigidMaterial = (typeof BOOTSTRAP_RIGID_MATERIALS)[number];

/**
 * These places are tame enough for a new porter to gather without already
 * owning water, storm, or climbing adaptations. This is deliberately a coarse
 * ecological check; runtime pathfinding can add dynamic hazards later.
 */
export const BOOTSTRAP_SAFE_BIOMES = [
  "brine-flat",
  "reed-marsh",
  "rain-meadow",
  "sun-meadow",
] as const satisfies readonly BiomeId[];

export type HarborBootstrapReason =
  | "ready"
  | "invalid-harbor"
  | "fiber-source-missing"
  | "rigid-source-missing"
  | "fiber-and-rigid-sources-missing";

export interface HarborBootstrapSource {
  readonly nodeId: string;
  readonly tileIndex: number;
  readonly distance: number;
  readonly material: FieldMaterialId;
}

export interface HarborBootstrapEvaluation {
  readonly harborTileIndex: number;
  readonly radius: number;
  readonly safe: boolean;
  readonly reason: HarborBootstrapReason;
  readonly fiber: HarborBootstrapSource | null;
  readonly rigid: HarborBootstrapSource | null;
}

interface RarityRule {
  readonly capacityMinimum: number;
  readonly capacityMaximum: number;
  readonly regenerationPerActiveTickFixed: number;
}

const FIELD_RESOURCE_DOMAIN = 0x4652_4553;
const NODE_PRESENCE_PURPOSE = 1;
const NODE_CAPACITY_PURPOSE = 2;
const MAX_FIELD_DIMENSION = 4_096;
const MAX_ACTIVE_TICK_ADVANCE = 1_000_000_000;

const RARITY_RULES: Readonly<Record<FieldResourceRarity, RarityRule>> = {
  common: {
    capacityMinimum: 5,
    capacityMaximum: 9,
    regenerationPerActiveTickFixed: 15_000,
  },
  secondary: {
    capacityMinimum: 4,
    capacityMaximum: 7,
    regenerationPerActiveTickFixed: 10_000,
  },
  rare: {
    capacityMinimum: 2,
    capacityMaximum: 4,
    regenerationPerActiveTickFixed: 4_000,
  },
};

export const FIELD_MATERIAL_UNIT_LOAD_MILLI: Readonly<Record<FieldMaterialId, number>> = {
  bladderkelp: 700,
  driftwood: 1_800,
  "glimmer-spore": 250,
  shellstone: 1_600,
  sunfiber: 500,
  hookstone: 1_300,
  cordreed: 600,
  pitchmoss: 800,
  stormlichen: 450,
};

/** Full-intensity target multipliers before bounded wind response. */
const MATERIAL_WEATHER_TARGETS: Readonly<
  Record<FieldMaterialId, Readonly<Record<WeatherState["kind"], number>>>
> = {
  bladderkelp: { clear: 700, mist: 1_100, rain: 1_400, storm: 1_300 },
  driftwood: { clear: 900, mist: 1_100, rain: 1_250, storm: 1_500 },
  "glimmer-spore": { clear: 700, mist: 1_450, rain: 1_300, storm: 1_200 },
  shellstone: { clear: 1_250, mist: 1_000, rain: 800, storm: 650 },
  sunfiber: { clear: 1_500, mist: 900, rain: 700, storm: 600 },
  hookstone: { clear: 1_150, mist: 1_050, rain: 1_000, storm: 1_250 },
  cordreed: { clear: 850, mist: 1_150, rain: 1_500, storm: 1_300 },
  pitchmoss: { clear: 700, mist: 1_400, rain: 1_500, storm: 1_100 },
  stormlichen: { clear: 750, mist: 1_000, rain: 1_200, storm: 1_550 },
};

const MATERIAL_WIND_RESPONSE: Readonly<Record<FieldMaterialId, number>> = {
  bladderkelp: 20,
  driftwood: 70,
  "glimmer-spore": 20,
  shellstone: 0,
  sunfiber: -100,
  hookstone: 40,
  cordreed: -30,
  pitchmoss: -20,
  stormlichen: 100,
};

const BIOME_ORDER = new Map<BiomeId, number>(
  BIOME_IDS.map((biome, index) => [biome, index]),
);
const FIBER_MATERIAL_SET = new Set<FieldMaterialId>(BOOTSTRAP_FIBER_MATERIALS);
const RIGID_MATERIAL_SET = new Set<FieldMaterialId>(BOOTSTRAP_RIGID_MATERIALS);
const SAFE_BIOME_SET = new Set<BiomeId>(BOOTSTRAP_SAFE_BIOMES);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clampFixed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function clampSignedFixed(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= -FIXED_POINT) return -FIXED_POINT;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function clampPermille(value: number): number {
  if (!Number.isFinite(value) || value <= FIELD_RESOURCE_WEATHER_MIN_PERMILLE) {
    return FIELD_RESOURCE_WEATHER_MIN_PERMILLE;
  }
  if (value >= FIELD_RESOURCE_WEATHER_MAX_PERMILLE) {
    return FIELD_RESOURCE_WEATHER_MAX_PERMILLE;
  }
  return Math.trunc(value);
}

function canonicalDimension(value: number): number {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_FIELD_DIMENSION
    ? value
    : 0;
}

function coordinateAddress(x: number, y: number): number {
  return y * MAX_FIELD_DIMENSION + x;
}

function seedLabel(seed: RootSeed): string {
  return seed
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

export function fieldResourceNodeId(
  seed: RootSeed,
  x: number,
  y: number,
  material: FieldMaterialId,
): string {
  if (!Number.isSafeInteger(x) || x < 0 || !Number.isSafeInteger(y) || y < 0) {
    throw new RangeError("Field-resource coordinates must be non-negative safe integers");
  }
  return `field-v1:${seedLabel(seed)}:${x},${y}:${material}`;
}

function chooseRarity(roll: number): FieldResourceRarity | null {
  const commonEnd = FIELD_RESOURCE_DENSITY_PER_MILLION.common;
  const secondaryEnd = commonEnd + FIELD_RESOURCE_DENSITY_PER_MILLION.secondary;
  const rareEnd = secondaryEnd + FIELD_RESOURCE_DENSITY_PER_MILLION.rare;
  if (roll < commonEnd) return "common";
  if (roll < secondaryEnd) return "secondary";
  if (roll < rareEnd) return "rare";
  return null;
}

function validTerrainTile(
  tile: TerrainTile,
  width: number,
  height: number,
): boolean {
  if (
    !Number.isSafeInteger(tile.x)
    || !Number.isSafeInteger(tile.y)
    || tile.x < 0
    || tile.y < 0
    || tile.x >= width
    || tile.y >= height
  ) {
    return false;
  }
  return tile.index === tile.y * width + tile.x;
}

function compareTerrainTiles(left: TerrainTile, right: TerrainTile): number {
  return left.index - right.index
    || left.x - right.x
    || left.y - right.y
    || compareText(left.terrain, right.terrain)
    || left.elevation - right.elevation
    || left.moisture - right.moisture
    || left.roughness - right.roughness;
}

/** Derives the optional native node at one valid coordinate. */
export function deriveFieldResourceNode(
  seed: RootSeed,
  tile: TerrainTile,
  gridHeight: number,
): FieldResourceNode | null {
  if (
    !Number.isSafeInteger(tile.index)
    || tile.index < 0
    || !Number.isSafeInteger(tile.x)
    || tile.x < 0
    || tile.x >= MAX_FIELD_DIMENSION
    || !Number.isSafeInteger(tile.y)
    || tile.y < 0
    || tile.y >= MAX_FIELD_DIMENSION
  ) {
    return null;
  }

  const address = coordinateAddress(tile.x, tile.y);
  const roll = keyedRandomInt(
    seed,
    FIELD_RESOURCE_DOMAIN,
    0,
    address,
    NODE_PRESENCE_PURPOSE,
    0,
    999_999,
  );
  const rarity = chooseRarity(roll);
  if (rarity === null) return null;

  const magicalWaterInfluence = deriveMagicalWaterInfluence(seed, tile);
  const biome = deriveBiomeProfile({
    seed,
    tile,
    gridHeight,
    magicalWaterInfluence,
  }).id;
  const material = FIELD_MATERIALS_BY_BIOME[biome][rarity];
  const rule = RARITY_RULES[rarity];
  const capacityUnits = keyedRandomInt(
    seed,
    FIELD_RESOURCE_DOMAIN,
    0,
    address,
    NODE_CAPACITY_PURPOSE,
    rule.capacityMinimum,
    rule.capacityMaximum,
  );

  return {
    id: fieldResourceNodeId(seed, tile.x, tile.y, material),
    tileIndex: tile.index,
    x: tile.x,
    y: tile.y,
    biome,
    material,
    rarity,
    capacityUnits,
    unitLoadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI[material],
    regenerationPerActiveTickFixed: rule.regenerationPerActiveTickFixed,
  };
}

/**
 * Produces the discovery-independent natural-resource catalog. Tile order and
 * unrelated random calls cannot perturb it.
 */
export function generateFieldResourceCatalog(
  seed: RootSeed,
  terrain: Pick<TerrainState, "width" | "height" | "tiles">,
): FieldResourceCatalog {
  const width = canonicalDimension(terrain.width);
  const height = canonicalDimension(terrain.height);
  if (width === 0 || height === 0) {
    return { version: FIELD_RESOURCE_CATALOG_VERSION, width, height, nodes: [] };
  }

  const sortedTiles = [...terrain.tiles]
    .filter((tile) => validTerrainTile(tile, width, height))
    .sort(compareTerrainTiles);
  const seenTiles = new Set<number>();
  const nodes: FieldResourceNode[] = [];
  for (const tile of sortedTiles) {
    if (seenTiles.has(tile.index)) continue;
    seenTiles.add(tile.index);
    const node = deriveFieldResourceNode(seed, tile, height);
    if (node !== null) nodes.push(node);
  }
  nodes.sort((left, right) => left.tileIndex - right.tileIndex || compareText(left.id, right.id));

  return { version: FIELD_RESOURCE_CATALOG_VERSION, width, height, nodes };
}

export function createFieldResourceEcologyState(activeTick = 0): FieldResourceEcologyState {
  return {
    version: FIELD_RESOURCE_STATE_VERSION,
    activeTick: Number.isSafeInteger(activeTick) && activeTick >= 0 ? activeTick : 0,
    depletion: [],
  };
}

function catalogNodeMap(catalog: FieldResourceCatalog): Map<string, FieldResourceNode> {
  return new Map(catalog.nodes.map((node) => [node.id, node]));
}

/**
 * Normalizes loaded sparse state without inventing resources. Duplicate corrupt
 * entries resolve conservatively and independently of their input ordering.
 */
export function canonicalizeFieldResourceState(
  catalog: FieldResourceCatalog,
  state: FieldResourceEcologyState,
): FieldResourceEcologyState {
  const nodeById = catalogNodeMap(catalog);
  const canonicalById = new Map<string, FieldResourceDepletion>();
  for (const candidate of state.depletion) {
    const node = nodeById.get(candidate.nodeId);
    if (node === undefined || !Number.isSafeInteger(candidate.missingUnits)) continue;
    const maximumMissing = node.capacityUnits - FIELD_RESOURCE_LIVING_RESERVE_UNITS;
    const missingUnits = Math.max(0, Math.min(maximumMissing, candidate.missingUnits));
    if (missingUnits === 0) continue;
    const regenerationProgressFixed = Number.isFinite(candidate.regenerationProgressFixed)
      ? Math.max(0, Math.min(FIXED_POINT - 1, Math.trunc(candidate.regenerationProgressFixed)))
      : 0;
    const current = canonicalById.get(node.id);
    if (
      current === undefined
      || missingUnits > current.missingUnits
      || (
        missingUnits === current.missingUnits
        && regenerationProgressFixed < current.regenerationProgressFixed
      )
    ) {
      canonicalById.set(node.id, {
        nodeId: node.id,
        missingUnits,
        regenerationProgressFixed,
      });
    }
  }

  return {
    version: FIELD_RESOURCE_STATE_VERSION,
    activeTick: Number.isSafeInteger(state.activeTick) && state.activeTick >= 0
      ? state.activeTick
      : 0,
    depletion: [...canonicalById.values()].sort((left, right) =>
      compareText(left.nodeId, right.nodeId)
    ),
  };
}

function nodeDepletion(
  state: FieldResourceEcologyState,
  nodeId: string,
): FieldResourceDepletion | undefined {
  return state.depletion.find((entry) => entry.nodeId === nodeId);
}

export function fieldResourceStockUnits(
  catalog: FieldResourceCatalog,
  state: FieldResourceEcologyState,
  nodeId: string,
): number | null {
  const node = catalog.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) return null;
  const canonical = canonicalizeFieldResourceState(catalog, state);
  const missingUnits = nodeDepletion(canonical, nodeId)?.missingUnits ?? 0;
  return node.capacityUnits - missingUnits;
}

/** Atomic ordinary harvest: either the full request is gathered or nothing is. */
export function harvestFieldResource(
  catalog: FieldResourceCatalog,
  stateInput: FieldResourceEcologyState,
  nodeId: string,
  requestedUnits: number,
): FieldHarvestResult {
  const state = canonicalizeFieldResourceState(catalog, stateInput);
  const node = catalog.nodes.find((candidate) => candidate.id === nodeId) ?? null;
  if (node === null) {
    return {
      ok: false,
      reason: "node-not-found",
      node: null,
      material: null,
      harvestedUnits: 0,
      loadMilli: 0,
      state,
    };
  }
  if (!Number.isSafeInteger(requestedUnits) || requestedUnits <= 0) {
    return {
      ok: false,
      reason: "invalid-request",
      node,
      material: node.material,
      harvestedUnits: 0,
      loadMilli: 0,
      state,
    };
  }

  const current = nodeDepletion(state, node.id);
  const missingUnits = current?.missingUnits ?? 0;
  const stockUnits = node.capacityUnits - missingUnits;
  const harvestableUnits = stockUnits - FIELD_RESOURCE_LIVING_RESERVE_UNITS;
  if (requestedUnits > harvestableUnits) {
    return {
      ok: false,
      reason: "living-reserve",
      node,
      material: node.material,
      harvestedUnits: 0,
      loadMilli: 0,
      state,
    };
  }

  const nextEntry: FieldResourceDepletion = {
    nodeId: node.id,
    missingUnits: missingUnits + requestedUnits,
    regenerationProgressFixed: current?.regenerationProgressFixed ?? 0,
  };
  const nextDepletion = state.depletion
    .filter((entry) => entry.nodeId !== node.id)
    .concat(nextEntry)
    .sort((left, right) => compareText(left.nodeId, right.nodeId));

  return {
    ok: true,
    reason: "harvested",
    node,
    material: node.material,
    harvestedUnits: requestedUnits,
    loadMilli: requestedUnits * node.unitLoadMilli,
    state: { ...state, depletion: nextDepletion },
  };
}

function approximateWindMagnitude(windX: number, windY: number): number {
  const horizontal = Math.abs(clampSignedFixed(windX));
  const vertical = Math.abs(clampSignedFixed(windY));
  const larger = Math.max(horizontal, vertical);
  const smaller = Math.min(horizontal, vertical);
  return Math.min(FIXED_POINT, larger + Math.trunc(smaller / 2));
}

/** Exact bounded 0.6x..1.6x weather response for one material. */
export function fieldResourceWeatherMultiplierPermille(
  material: FieldMaterialId,
  weather: FieldResourceWeather,
): number {
  const intensity = clampFixed(weather.intensity);
  const target = MATERIAL_WEATHER_TARGETS[material][weather.kind];
  const intensityResponse = Math.trunc(((target - 1_000) * intensity) / FIXED_POINT);
  const wind = approximateWindMagnitude(weather.windX, weather.windY);
  const windResponse = Math.trunc(
    (MATERIAL_WIND_RESPONSE[material] * wind * intensity) / (FIXED_POINT * FIXED_POINT),
  );
  return clampPermille(1_000 + intensityResponse + windResponse);
}

/**
 * Applies only explicitly elapsed active ticks. Callers should segment advances
 * at weather changes; equal-weather advances are exactly partition invariant.
 */
export function advanceFieldResourceEcology(
  catalog: FieldResourceCatalog,
  stateInput: FieldResourceEcologyState,
  activeTicks: number,
  weather: FieldResourceWeather,
): FieldResourceEcologyState {
  if (
    !Number.isSafeInteger(activeTicks)
    || activeTicks < 0
    || activeTicks > MAX_ACTIVE_TICK_ADVANCE
  ) {
    throw new RangeError("Active ecology ticks must be a bounded non-negative safe integer");
  }

  const state = canonicalizeFieldResourceState(catalog, stateInput);
  if (!Number.isSafeInteger(state.activeTick + activeTicks)) {
    throw new RangeError("Active ecology tick would exceed the safe integer range");
  }
  if (activeTicks === 0 || state.depletion.length === 0) {
    return { ...state, activeTick: state.activeTick + activeTicks };
  }

  const nodeById = catalogNodeMap(catalog);
  const depletion: FieldResourceDepletion[] = [];
  for (const entry of state.depletion) {
    const node = nodeById.get(entry.nodeId);
    if (node === undefined) continue;
    const multiplier = fieldResourceWeatherMultiplierPermille(node.material, weather);
    const growthPerTickFixed = Math.trunc(
      (node.regenerationPerActiveTickFixed * multiplier) / 1_000,
    );
    const totalGrowthFixed = entry.regenerationProgressFixed
      + growthPerTickFixed * activeTicks;
    if (!Number.isSafeInteger(totalGrowthFixed)) {
      throw new RangeError("Field-resource regeneration exceeded the safe integer range");
    }
    const restoredUnits = Math.min(
      entry.missingUnits,
      Math.floor(totalGrowthFixed / FIXED_POINT),
    );
    const missingUnits = entry.missingUnits - restoredUnits;
    if (missingUnits > 0) {
      depletion.push({
        nodeId: entry.nodeId,
        missingUnits,
        regenerationProgressFixed: totalGrowthFixed - restoredUnits * FIXED_POINT,
      });
    }
  }

  return {
    version: FIELD_RESOURCE_STATE_VERSION,
    activeTick: state.activeTick + activeTicks,
    depletion,
  };
}

function canonicalBootstrapRadius(radius: number): number {
  return Number.isSafeInteger(radius) && radius >= 0
    ? Math.min(radius, MAX_FIELD_DIMENSION)
    : DEFAULT_BOOTSTRAP_RADIUS;
}

function nearestBootstrapSource(
  catalog: FieldResourceCatalog,
  harborX: number,
  harborY: number,
  radius: number,
  materialSet: ReadonlySet<FieldMaterialId>,
): HarborBootstrapSource | null {
  const candidates = catalog.nodes
    .filter((node) => SAFE_BIOME_SET.has(node.biome) && materialSet.has(node.material))
    .map((node) => ({
      node,
      distance: Math.abs(node.x - harborX) + Math.abs(node.y - harborY),
    }))
    .filter((candidate) => candidate.distance <= radius)
    .sort((left, right) =>
      left.distance - right.distance
      || left.node.tileIndex - right.node.tileIndex
      || compareText(left.node.id, right.node.id)
    );
  const nearest = candidates[0];
  return nearest === undefined
    ? null
    : {
        nodeId: nearest.node.id,
        tileIndex: nearest.node.tileIndex,
        distance: nearest.distance,
        material: nearest.node.material,
      };
}

/** Checks whether a proposed harbor has renewable starter fiber and rigid stock. */
export function evaluateHarborBootstrap(
  catalog: FieldResourceCatalog,
  harborTileIndex: number,
  radiusInput = DEFAULT_BOOTSTRAP_RADIUS,
): HarborBootstrapEvaluation {
  const radius = canonicalBootstrapRadius(radiusInput);
  if (
    !Number.isSafeInteger(harborTileIndex)
    || harborTileIndex < 0
    || harborTileIndex >= catalog.width * catalog.height
    || catalog.width <= 0
    || catalog.height <= 0
  ) {
    return {
      harborTileIndex,
      radius,
      safe: false,
      reason: "invalid-harbor",
      fiber: null,
      rigid: null,
    };
  }

  const harborX = harborTileIndex % catalog.width;
  const harborY = Math.floor(harborTileIndex / catalog.width);
  const fiber = nearestBootstrapSource(
    catalog,
    harborX,
    harborY,
    radius,
    FIBER_MATERIAL_SET,
  );
  const rigid = nearestBootstrapSource(
    catalog,
    harborX,
    harborY,
    radius,
    RIGID_MATERIAL_SET,
  );
  const reason: HarborBootstrapReason = fiber !== null && rigid !== null
    ? "ready"
    : fiber === null && rigid === null
      ? "fiber-and-rigid-sources-missing"
      : fiber === null
        ? "fiber-source-missing"
        : "rigid-source-missing";

  return {
    harborTileIndex,
    radius,
    safe: reason === "ready",
    reason,
    fiber,
    rigid,
  };
}
