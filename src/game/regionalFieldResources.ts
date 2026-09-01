import {
  FIELD_MATERIAL_IDS,
  FIELD_MATERIAL_UNIT_LOAD_MILLI,
  FIELD_MATERIALS_BY_BIOME,
  FIELD_RESOURCE_CATALOG_VERSION,
  FIELD_RESOURCE_LIVING_RESERVE_UNITS,
  FIELD_RESOURCE_RARITIES,
  type FieldResourceCatalog,
  type FieldResourceNode,
  type FieldResourceRarity,
} from "../sim/fieldResources";
import { BIOME_IDS } from "../sim/biomes";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import {
  regionalTileIndexInView,
  regionalWindowForWorld,
} from "./regionalWorldView";

const COMPATIBILITY_REGION = createRegionCoord(0, 0);
const MAX_FIELD_RESOURCE_ID_LENGTH = 512;
const BIOME_ID_SET: ReadonlySet<string> = new Set(BIOME_IDS);
const MATERIAL_ID_SET: ReadonlySet<string> = new Set(FIELD_MATERIAL_IDS);
const RARITY_SET: ReadonlySet<string> = new Set(FIELD_RESOURCE_RARITIES);
const RARITY_CONTRACT: Readonly<Record<FieldResourceRarity, Readonly<{
  minimumCapacity: number;
  maximumCapacity: number;
  regenerationPerActiveTickFixed: number;
}>>> = Object.freeze({
  common: Object.freeze({
    minimumCapacity: 5,
    maximumCapacity: 9,
    regenerationPerActiveTickFixed: 15_000,
  }),
  secondary: Object.freeze({
    minimumCapacity: 4,
    maximumCapacity: 7,
    regenerationPerActiveTickFixed: 10_000,
  }),
  rare: Object.freeze({
    minimumCapacity: 2,
    maximumCapacity: 4,
    regenerationPerActiveTickFixed: 4_000,
  }),
});
const CATALOG_KEYS = ["height", "nodes", "version", "width"] as const;
const NODE_KEYS = [
  "biome",
  "capacityUnits",
  "id",
  "material",
  "rarity",
  "regenerationPerActiveTickFixed",
  "tileIndex",
  "unitLoadMilli",
  "x",
  "y",
] as const;

export interface RegionalFieldResourceMapping {
  /** Frozen snapshot. Resolve authoritative mutations against the source ID. */
  readonly source: FieldResourceNode;
  /** Ephemeral index in the current floating 98 x 74 traversal view. */
  readonly viewTileIndex: number;
}

export interface RegionalFieldResourceProjection {
  /** Read-only render/UI catalog. Never use this catalog to mutate ecology. */
  readonly catalog: FieldResourceCatalog;
  readonly mappings: readonly RegionalFieldResourceMapping[];
}

/**
 * Project the finite alpha resource ecology into the floating traversal view.
 *
 * Resources still belong to compatibility region 0,0. A matching local tile in
 * any other signed region cannot reveal, gather, or duplicate one. The returned
 * node copies are presentation addresses only; authoritative harvest continues
 * to use the original catalog and stable node ID.
 */
export function projectCompatibilityFieldResources(
  source: FieldResourceCatalog,
  world: WorldView,
): RegionalFieldResourceProjection {
  assertCatalogEnvelope(source);
  const window = regionalWindowForWorld(world);
  if (window === null) {
    // Metadata-less views are accepted only as the finite compatibility grid.
    // In particular, a cloned 98 x 74 floating view must not silently become
    // region 0,0 after its WeakMap address metadata has been lost.
    if (world.terrain.width !== source.width || world.terrain.height !== source.height) {
      throw new RangeError("Finite field resource view does not match its catalog dimensions");
    }
  } else if (
    world.terrain.width !== window.terrain.width
    || world.terrain.height !== window.terrain.height
    || world.terrain.tiles.length !== window.terrain.tiles.length
  ) {
    throw new RangeError("Floating field resource view lost its regional dimensions");
  }
  if (
    !Number.isSafeInteger(world.terrain.width)
    || !Number.isSafeInteger(world.terrain.height)
    || world.terrain.width <= 0
    || world.terrain.height <= 0
    || world.terrain.tiles.length !== world.terrain.width * world.terrain.height
  ) {
    throw new RangeError("Field resource view is not a complete terrain grid");
  }

  const mappings: RegionalFieldResourceMapping[] = [];
  const projectedNodes: FieldResourceNode[] = [];
  const seenIds = new Set<string>();
  const seenSourceTiles = new Set<number>();
  const seenViewTiles = new Set<number>();

  for (const node of source.nodes) {
    assertCatalogNode(node, source.width, source.height);
    if (seenIds.has(node.id)) throw new RangeError("Field resource catalog contains a duplicate stable ID");
    seenIds.add(node.id);
    if (seenSourceTiles.has(node.tileIndex)) {
      throw new RangeError("Field resource catalog contains two nodes on one source tile");
    }
    seenSourceTiles.add(node.tileIndex);
    // Legacy catalogs use their own linear stride, but x/y are the stable
    // compatibility-region coordinates. Floating views always address the
    // full 96 x 72 region, whereas finite legacy views retain their own stride.
    const compatibilityTileIndex = window === null
      ? node.tileIndex
      : node.y * WORLD_WIDTH + node.x;
    const viewTileIndex = regionalTileIndexInView(
      world,
      COMPATIBILITY_REGION,
      compatibilityTileIndex,
    );
    if (viewTileIndex === null) continue;
    if (seenViewTiles.has(viewTileIndex)) {
      throw new RangeError("Field resource catalog aliases two nodes onto one regional tile");
    }
    const tile = world.terrain.tiles[viewTileIndex];
    if (
      !tile
      || tile.index !== viewTileIndex
      || !Number.isSafeInteger(tile.x)
      || Object.is(tile.x, -0)
      || tile.x !== viewTileIndex % world.terrain.width
      || !Number.isSafeInteger(tile.y)
      || Object.is(tile.y, -0)
      || tile.y !== Math.floor(viewTileIndex / world.terrain.width)
    ) {
      throw new RangeError("Regional field resource projection lost its terrain tile");
    }
    seenViewTiles.add(viewTileIndex);
    const sourceSnapshot = copyNode(node, node.tileIndex, node.x, node.y);
    mappings.push(Object.freeze({ source: sourceSnapshot, viewTileIndex }));
    projectedNodes.push(copyNode(
      node,
      viewTileIndex,
      tile.x,
      tile.y,
    ));
  }

  const ordered = mappings
    .map((mapping, index) => ({ mapping, node: projectedNodes[index]! }))
    .sort((left, right) => left.mapping.viewTileIndex - right.mapping.viewTileIndex
      || compareText(left.mapping.source.id, right.mapping.source.id));
  return Object.freeze({
    catalog: Object.freeze({
      version: source.version,
      width: world.terrain.width,
      height: world.terrain.height,
      nodes: Object.freeze(ordered.map(({ node }) => node)),
    }),
    mappings: Object.freeze(ordered.map(({ mapping }) => mapping)),
  });
}

export function regionalFieldResourceById(
  projection: RegionalFieldResourceProjection,
  nodeId: string,
): RegionalFieldResourceMapping | undefined {
  return projection.mappings.find(({ source }) => source.id === nodeId);
}

export function regionalFieldResourceAtViewTile(
  projection: RegionalFieldResourceProjection,
  viewTileIndex: number,
): RegionalFieldResourceMapping | undefined {
  return projection.mappings.find((mapping) => mapping.viewTileIndex === viewTileIndex);
}

function assertCatalogEnvelope(source: FieldResourceCatalog): void {
  if (
    typeof source !== "object"
    || source === null
    || !hasExactKeys(source, CATALOG_KEYS)
    || source.version !== FIELD_RESOURCE_CATALOG_VERSION
    || !Number.isSafeInteger(source.width)
    || Object.is(source.width, -0)
    || source.width <= 0
    || source.width > WORLD_WIDTH
    || !Number.isSafeInteger(source.height)
    || Object.is(source.height, -0)
    || source.height <= 0
    || source.height > WORLD_HEIGHT
    || !Array.isArray(source.nodes)
    || source.nodes.length > source.width * source.height
  ) {
    throw new RangeError("Field resource catalog is outside the compatibility-region bounds");
  }
}

function assertCatalogNode(
  node: FieldResourceNode,
  width: number,
  height: number,
): void {
  if (
    typeof node !== "object"
    || node === null
    || !hasExactKeys(node, NODE_KEYS)
    || typeof node.id !== "string"
    || node.id.length === 0
    || node.id.length > MAX_FIELD_RESOURCE_ID_LENGTH
    || !Number.isSafeInteger(node.x)
    || Object.is(node.x, -0)
    || node.x < 0
    || node.x >= width
    || !Number.isSafeInteger(node.y)
    || Object.is(node.y, -0)
    || node.y < 0
    || node.y >= height
    || !Number.isSafeInteger(node.tileIndex)
    || Object.is(node.tileIndex, -0)
    || node.tileIndex !== node.y * width + node.x
    || !BIOME_ID_SET.has(node.biome)
    || !MATERIAL_ID_SET.has(node.material)
    || !RARITY_SET.has(node.rarity)
  ) {
    throw new RangeError("Field resource catalog contains a noncanonical node");
  }
  const rarity = RARITY_CONTRACT[node.rarity];
  if (
    !Number.isSafeInteger(node.capacityUnits)
    || Object.is(node.capacityUnits, -0)
    || node.capacityUnits <= FIELD_RESOURCE_LIVING_RESERVE_UNITS
    || node.capacityUnits < rarity.minimumCapacity
    || node.capacityUnits > rarity.maximumCapacity
    || !Number.isSafeInteger(node.unitLoadMilli)
    || Object.is(node.unitLoadMilli, -0)
    || node.unitLoadMilli !== FIELD_MATERIAL_UNIT_LOAD_MILLI[node.material]
    || !Number.isSafeInteger(node.regenerationPerActiveTickFixed)
    || Object.is(node.regenerationPerActiveTickFixed, -0)
    || node.regenerationPerActiveTickFixed < 0
    || node.regenerationPerActiveTickFixed > FIXED_POINT
    || node.regenerationPerActiveTickFixed !== rarity.regenerationPerActiveTickFixed
    || FIELD_MATERIALS_BY_BIOME[node.biome][node.rarity] !== node.material
  ) throw new RangeError("Field resource catalog contains a noncanonical node");
}

function copyNode(
  node: FieldResourceNode,
  tileIndex: number,
  x: number,
  y: number,
): FieldResourceNode {
  return Object.freeze({
    id: node.id,
    tileIndex,
    x,
    y,
    biome: node.biome,
    material: node.material,
    rarity: node.rarity,
    capacityUnits: node.capacityUnits,
    unitLoadMilli: node.unitLoadMilli,
    regenerationPerActiveTickFixed: node.regenerationPerActiveTickFixed,
  });
}

function hasExactKeys(
  value: object,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
