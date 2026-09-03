import { describe, expect, it } from "vitest";

import {
  FIELD_RESOURCE_CATALOG_VERSION,
  canonicalizeFieldResourceState,
  createFieldResourceEcologyState,
  fieldResourceStockUnits,
  harvestFieldResource,
  type FieldResourceCatalog,
  type FieldResourceNode,
} from "../sim/fieldResources";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  type GlobalTileCoord,
  type RegionCoord,
  type RegionTileAddress,
} from "../sim/regions";
import { createWorld, createWorldView } from "../sim/public";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainState,
  type WorldView,
} from "../sim/types";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  defaultRegionalFrameOrigin,
  regionalWindowTileAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import {
  projectCompatibilityFieldResources,
  regionalFieldResourceAtViewTile,
  regionalFieldResourceById,
} from "./regionalFieldResources";
import {
  createRegionalWorldView,
  regionalTileIndexInView,
} from "./regionalWorldView";

function resourceNode(
  id: string,
  x: number,
  y: number,
  width = WORLD_WIDTH,
): FieldResourceNode {
  return {
    id,
    tileIndex: y * width + x,
    x,
    y,
    biome: "sun-meadow",
    material: "sunfiber",
    rarity: "common",
    capacityUnits: 6,
    unitLoadMilli: 500,
    regenerationPerActiveTickFixed: 15_000,
  };
}

function resourceCatalog(
  nodes: readonly FieldResourceNode[],
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT,
): FieldResourceCatalog {
  return {
    version: FIELD_RESOURCE_CATALOG_VERSION,
    width,
    height,
    nodes,
  };
}

function compatibilityWorld(seed = "the compatibility garden"): WorldView {
  return createWorldView(createWorld(seed, "wild"));
}

/** Fast exact-address fixture; production creates the same WeakMap-backed view. */
function floatingWorld(
  compatibility: WorldView,
  centerInput: RegionCoord,
  originInput?: GlobalTileCoord,
): WorldView {
  const center = createRegionCoord(centerInput.x, centerInput.y);
  const origin = originInput ?? defaultRegionalFrameOrigin(center);
  const template = compatibility.terrain.tiles[0];
  if (!template) throw new Error("compatibility world needs a terrain tile");
  const tiles: TerrainState["tiles"][number][] = [];
  const addresses: RegionTileAddress[] = [];
  for (let y = 0; y < REGIONAL_TRAVEL_ROWS; y += 1) {
    for (let x = 0; x < REGIONAL_TRAVEL_COLUMNS; x += 1) {
      const index = y * REGIONAL_TRAVEL_COLUMNS + x;
      tiles.push({ ...template, index, x, y });
      addresses.push(regionalWindowTileAddress(origin, x, y));
    }
  }
  const window: RegionalTerrainWindow = {
    center,
    origin,
    terrain: {
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
      tiles,
    },
    addresses,
  };
  const count = tiles.length;
  return createRegionalWorldView(compatibility, window, {
    discovered: Array.from({ length: count }, () => 0),
    depthSoundings: Array.from({ length: count }, () => 0),
  });
}

function requiredRegionTileInView(
  world: WorldView,
  region: RegionCoord,
  localX: number,
  localY: number,
): number {
  const index = regionalTileIndexInView(
    world,
    createRegionCoord(region.x, region.y),
    localY * WORLD_WIDTH + localX,
  );
  if (index === null) throw new Error("fixture source tile is outside its spatial frame");
  return index;
}

function finiteLegacyWorld(compatibility: WorldView, width: number, height: number): WorldView {
  const tiles = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const source = compatibility.terrain.tiles[y * compatibility.terrain.width + x];
    if (!source) throw new Error("legacy fixture lost its compatibility tile");
    return { ...source, index, x, y };
  });
  return {
    ...compatibility,
    terrain: { width, height, tiles },
    settlements: [],
    routes: [],
    choirs: [],
  };
}

describe("regional compatibility field resources", () => {
  it("projects region 0 through centered and neighboring sliding frames", () => {
    const compatibility = compatibilityWorld("resources touch every seam");
    const west = resourceNode("field:west", 0, 35);
    const east = resourceNode("field:east", WORLD_WIDTH - 1, 34);
    const north = resourceNode("field:north", 47, 0);
    const south = resourceNode("field:south", 48, WORLD_HEIGHT - 1);
    const interior = resourceNode("field:interior", 40, 30);
    const catalog = resourceCatalog([south, interior, west, north, east]);

    const centeredView = floatingWorld(compatibility, { x: 0, y: 0 });
    const centered = projectCompatibilityFieldResources(catalog, centeredView);
    expect(centered.mappings.map(({ source }) => source.id)).toEqual([
      north.id,
      interior.id,
      east.id,
      west.id,
      south.id,
    ].sort((left, right) => {
      const leftNode = catalog.nodes.find(({ id }) => id === left)!;
      const rightNode = catalog.nodes.find(({ id }) => id === right)!;
      const leftIndex = requiredRegionTileInView(
        centeredView,
        createRegionCoord(0, 0),
        leftNode.x,
        leftNode.y,
      );
      const rightIndex = requiredRegionTileInView(
        centeredView,
        createRegionCoord(0, 0),
        rightNode.x,
        rightNode.y,
      );
      return leftIndex - rightIndex || left.localeCompare(right);
    }));

    const cases = [
      [{ x: -1, y: 0 }, west],
      [{ x: 1, y: 0 }, east],
      [{ x: 0, y: -1 }, north],
      [{ x: 0, y: 1 }, south],
    ] as const;
    for (const [center, expectedNode] of cases) {
      const view = floatingWorld(compatibility, center);
      const projection = projectCompatibilityFieldResources(catalog, view);
      const expectedViewTileIndex = requiredRegionTileInView(
        view,
        createRegionCoord(0, 0),
        expectedNode.x,
        expectedNode.y,
      );
      expect(projection.mappings.map(({ source }) => source.id)).toEqual([expectedNode.id]);
      expect(projection.mappings[0]?.viewTileIndex).toBe(expectedViewTileIndex);
      expect(projection.catalog.nodes[0]).toMatchObject({
        tileIndex: expectedViewTileIndex,
        x: expectedViewTileIndex % REGIONAL_TRAVEL_COLUMNS,
        y: Math.floor(expectedViewTileIndex / REGIONAL_TRAVEL_COLUMNS),
      });
    }

    const eastView = floatingWorld(compatibility, { x: 1, y: 0 });
    const eastProjection = projectCompatibilityFieldResources(catalog, eastView);
    const activeRegionSameLocalIndex = requiredRegionTileInView(
      eastView,
      createRegionCoord(1, 0),
      east.x,
      east.y,
    );
    expect(eastProjection.mappings[0]?.viewTileIndex).not.toBe(activeRegionSameLocalIndex);
    expect(regionalFieldResourceAtViewTile(eastProjection, activeRegionSameLocalIndex))
      .toBeUndefined();

    expect(projectCompatibilityFieldResources(
      catalog,
      floatingWorld(compatibility, { x: 2, y: 0 }),
    ).mappings).toEqual([]);
    expect(projectCompatibilityFieldResources(
      catalog,
      floatingWorld(compatibility, { x: 1, y: 1 }),
    ).mappings).toEqual([]);
  });

  it("never aliases an equal local tile in another signed or distant region", () => {
    const compatibility = compatibilityWorld("equal coordinates are not equal places");
    const node = resourceNode("field:one-place", 17, 19);
    const catalog = resourceCatalog([node]);
    const centers = [
      { x: -9, y: 4 },
      { x: 8, y: -13 },
      { x: REGION_COORD_LIMIT - 1, y: -(REGION_COORD_LIMIT - 1) },
      { x: -(REGION_COORD_LIMIT - 1), y: REGION_COORD_LIMIT - 1 },
    ];

    for (const center of centers) {
      const view = floatingWorld(compatibility, center);
      const projection = projectCompatibilityFieldResources(
        catalog,
        view,
      );
      const sameLocalViewIndex = requiredRegionTileInView(view, center, node.x, node.y);
      expect(projection.catalog.nodes).toEqual([]);
      expect(regionalFieldResourceById(projection, node.id)).toBeUndefined();
      expect(regionalFieldResourceAtViewTile(projection, sameLocalViewIndex)).toBeUndefined();
    }
  });

  it("maps legacy catalog coordinates into a floating view and a finite legacy view", () => {
    const compatibility = compatibilityWorld("the older narrower garden");
    const width = 64;
    const height = 48;
    const node = resourceNode("field:legacy-edge", width - 1, height - 1, width);
    const catalog = resourceCatalog([node], width, height);

    const floatingView = floatingWorld(compatibility, { x: 0, y: 0 });
    const floating = projectCompatibilityFieldResources(catalog, floatingView);
    const expectedFloatingIndex = requiredRegionTileInView(
      floatingView,
      createRegionCoord(0, 0),
      node.x,
      node.y,
    );
    expect(floating.mappings[0]).toEqual({
      source: node,
      address: { region: { x: 0, y: 0 }, localX: node.x, localY: node.y },
      viewTileIndex: expectedFloatingIndex,
    });
    expect(floating.catalog.nodes[0]).toMatchObject({
      id: node.id,
      tileIndex: expectedFloatingIndex,
      x: expectedFloatingIndex % REGIONAL_TRAVEL_COLUMNS,
      y: Math.floor(expectedFloatingIndex / REGIONAL_TRAVEL_COLUMNS),
    });

    const legacy = projectCompatibilityFieldResources(
      catalog,
      finiteLegacyWorld(compatibility, width, height),
    );
    expect(legacy.mappings[0]).toEqual({
      source: node,
      address: { region: { x: 0, y: 0 }, localX: node.x, localY: node.y },
      viewTileIndex: node.tileIndex,
    });
    expect(legacy.catalog.nodes[0]).toMatchObject({
      id: node.id,
      tileIndex: node.tileIndex,
      x: node.x,
      y: node.y,
    });
  });

  it("is deterministic for reversed inputs and returns frozen presentation copies", () => {
    const compatibility = compatibilityWorld("resource order does not write history");
    const nodes = [
      resourceNode("field:c", 30, 8),
      resourceNode("field:a", 3, 20),
      resourceNode("field:b", 50, 12),
    ];
    const source = resourceCatalog(nodes);
    const snapshot = structuredClone(source);
    const view = floatingWorld(compatibility, { x: 0, y: 0 });
    const forward = projectCompatibilityFieldResources(source, view);
    const reversed = projectCompatibilityFieldResources(
      resourceCatalog([...nodes].reverse()),
      view,
    );

    expect(reversed).toEqual(forward);
    expect(source).toEqual(snapshot);
    expect(source.nodes).toEqual(nodes);
    expect(forward.catalog.nodes.map(({ id }) => id)).toEqual(["field:c", "field:b", "field:a"]);
    for (const projected of forward.catalog.nodes) {
      const authoritative = nodes.find(({ id }) => id === projected.id);
      expect(projected).not.toBe(authoritative);
      expect(Object.isFrozen(projected)).toBe(true);
    }
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.catalog)).toBe(true);
    expect(Object.isFrozen(forward.catalog.nodes)).toBe(true);
    expect(Object.isFrozen(forward.mappings)).toBe(true);
    expect(forward.mappings.every(({ source: snapshotNode }) =>
      nodes.some((authoritative) => authoritative.id === snapshotNode.id
        && authoritative !== snapshotNode
        && Object.isFrozen(snapshotNode))
    )).toBe(true);
  });

  it("preserves authoritative identity and depletion across absence and re-entry", () => {
    const compatibility = compatibilityWorld("the harvested patch remembers");
    const node = resourceNode("field:persistent", 23, 24);
    const catalog = resourceCatalog([node]);
    const first = projectCompatibilityFieldResources(
      catalog,
      floatingWorld(compatibility, { x: 0, y: 0 }),
    );
    const harvested = harvestFieldResource(
      catalog,
      createFieldResourceEcologyState(),
      node.id,
      2,
    );
    expect(harvested.ok).toBe(true);
    expect(fieldResourceStockUnits(first.catalog, harvested.state, node.id)).toBe(4);

    const absent = projectCompatibilityFieldResources(
      catalog,
      floatingWorld(compatibility, { x: -40, y: 70 }),
    );
    expect(absent.catalog.nodes).toEqual([]);
    expect(fieldResourceStockUnits(catalog, harvested.state, node.id)).toBe(4);

    const returned = projectCompatibilityFieldResources(
      catalog,
      floatingWorld(compatibility, { x: 0, y: 0 }),
    );
    expect(returned.catalog.nodes.map(({ id }) => id)).toEqual([node.id]);
    expect(returned.mappings[0]?.source).toEqual(node);
    expect(returned.mappings[0]?.source).not.toBe(node);
    expect(Object.isFrozen(returned.mappings[0]?.source)).toBe(true);
    expect(returned.mappings[0]?.viewTileIndex).toBe(first.mappings[0]?.viewTileIndex);
    expect(fieldResourceStockUnits(returned.catalog, harvested.state, node.id)).toBe(4);
  });

  it("preserves one owned node through rebase, storage handoff, diagonal negative travel, save, and backtrack", () => {
    const compatibility = compatibilityWorld("one rooted patch under a sliding horizon");
    const node = resourceNode("field:continuous-root", 40, 30);
    const catalog = resourceCatalog([node]);
    const initialOrigin = defaultRegionalFrameOrigin(createRegionCoord(0, 0));
    const shiftedOrigin = { x: initialOrigin.x + 16, y: initialOrigin.y };
    const initialView = floatingWorld(compatibility, { x: 0, y: 0 }, initialOrigin);
    const shiftedView = floatingWorld(compatibility, { x: 0, y: 0 }, shiftedOrigin);
    const crossedView = floatingWorld(compatibility, { x: 1, y: 0 }, shiftedOrigin);
    const diagonalView = floatingWorld(
      compatibility,
      { x: -1, y: -1 },
      { x: -60, y: -60 },
    );
    const backtrackedView = floatingWorld(compatibility, { x: 0, y: 0 }, initialOrigin);
    const projections = [
      projectCompatibilityFieldResources(catalog, initialView),
      projectCompatibilityFieldResources(catalog, shiftedView),
      projectCompatibilityFieldResources(catalog, crossedView),
      projectCompatibilityFieldResources(catalog, diagonalView),
      projectCompatibilityFieldResources(catalog, backtrackedView),
    ];
    const harvested = harvestFieldResource(
      catalog,
      createFieldResourceEcologyState(19),
      node.id,
      2,
    );
    const restoredEcology = canonicalizeFieldResourceState(
      catalog,
      JSON.parse(JSON.stringify(harvested.state)),
    );

    expect(harvested.ok).toBe(true);
    expect(projections[1]?.mappings[0]?.viewTileIndex)
      .toBe((projections[0]?.mappings[0]?.viewTileIndex ?? 0) - 16);
    expect(projections[2]?.mappings[0]?.viewTileIndex)
      .toBe(projections[1]?.mappings[0]?.viewTileIndex);
    expect(projections[4]?.mappings[0]?.viewTileIndex)
      .toBe(projections[0]?.mappings[0]?.viewTileIndex);
    for (const projection of projections) {
      expect(projection.mappings).toHaveLength(1);
      expect(projection.catalog.nodes).toHaveLength(1);
      expect(projection.mappings[0]).toMatchObject({
        source: { id: node.id, tileIndex: node.tileIndex, x: node.x, y: node.y },
        address: {
          region: { x: 0, y: 0 },
          localX: node.x,
          localY: node.y,
        },
      });
      expect(new Set(projection.mappings.map(({ source }) => source.id)).size).toBe(1);
      expect(fieldResourceStockUnits(projection.catalog, restoredEcology, node.id)).toBe(4);
      expect(Object.isFrozen(projection.mappings[0]?.address)).toBe(true);
      expect(Object.isFrozen(projection.mappings[0]?.address.region)).toBe(true);
    }

    const absent = projectCompatibilityFieldResources(
      catalog,
      floatingWorld(compatibility, { x: 2, y: -2 }),
    );
    expect(absent.mappings).toEqual([]);
    expect(absent.catalog.nodes).toEqual([]);
    expect(fieldResourceStockUnits(catalog, restoredEcology, node.id)).toBe(4);
  });

  it("fails closed on lost floating metadata, aliases, malformed addresses, and excess work", () => {
    const compatibility = compatibilityWorld("bad resource addresses stay dark");
    const view = floatingWorld(compatibility, { x: 4, y: -3 });
    const node = resourceNode("field:valid", 10, 10);
    const catalog = resourceCatalog([node]);

    expect(() => projectCompatibilityFieldResources(catalog, structuredClone(view)))
      .toThrow(/dimensions/);
    const malformedCoordinates = floatingWorld(compatibility, { x: 0, y: 0 });
    const mappedIndex = requiredRegionTileInView(
      malformedCoordinates,
      createRegionCoord(0, 0),
      node.x,
      node.y,
    );
    const mappedTile = malformedCoordinates.terrain.tiles[mappedIndex];
    if (!mappedTile) throw new Error("malformed-coordinate fixture lost its mapped tile");
    (mappedTile as { x: number }).x += 1;
    expect(() => projectCompatibilityFieldResources(catalog, malformedCoordinates))
      .toThrow(/lost its terrain tile/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      node,
      resourceNode(node.id, 11, 10),
    ]), view)).toThrow(/duplicate stable ID/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      node,
      { ...node, id: "field:same-tile" },
    ]), view)).toThrow(/two nodes on one source tile/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      { ...node, tileIndex: node.tileIndex + 1 },
    ]), view)).toThrow(/noncanonical node/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      { ...node, x: -0 },
    ]), view)).toThrow(/noncanonical node/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      { ...node, capacityUnits: Number.NaN },
    ]), view)).toThrow(/noncanonical node/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      { ...node, material: "driftwood" },
    ]), view)).toThrow(/noncanonical node/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      { ...node, unitLoadMilli: 1 },
    ]), view)).toThrow(/noncanonical node/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      { ...node, regenerationPerActiveTickFixed: 1 },
    ]), view)).toThrow(/noncanonical node/);
    expect(() => projectCompatibilityFieldResources(resourceCatalog([
      { ...node, extra: "invented" } as FieldResourceNode,
    ]), view)).toThrow(/noncanonical node/);
    expect(() => projectCompatibilityFieldResources(
      resourceCatalog([node], WORLD_WIDTH + 1, WORLD_HEIGHT),
      view,
    )).toThrow(/compatibility-region bounds/);

    const excessive = resourceCatalog(
      Array.from({ length: WORLD_WIDTH * WORLD_HEIGHT + 1 }, () => node),
    );
    expect(() => projectCompatibilityFieldResources(excessive, view))
      .toThrow(/compatibility-region bounds/);
  });

  it("handles the complete bounded 96 x 72 opportunity grid without dropping identities", () => {
    const compatibility = compatibilityWorld("every bounded coordinate has an identity");
    const nodes = Array.from({ length: WORLD_WIDTH * WORLD_HEIGHT }, (_, tileIndex) => {
      const x = tileIndex % WORLD_WIDTH;
      const y = Math.floor(tileIndex / WORLD_WIDTH);
      return resourceNode(`field:max:${tileIndex}`, x, y);
    });
    const projection = projectCompatibilityFieldResources(
      resourceCatalog(nodes),
      floatingWorld(compatibility, { x: 0, y: 0 }),
    );

    expect(projection.catalog.nodes).toHaveLength(WORLD_WIDTH * WORLD_HEIGHT);
    expect(new Set(projection.catalog.nodes.map(({ id }) => id)).size)
      .toBe(WORLD_WIDTH * WORLD_HEIGHT);
    expect(projection.mappings[0]?.source.id).toBe("field:max:0");
    expect(projection.mappings.at(-1)?.source.id)
      .toBe(`field:max:${WORLD_WIDTH * WORLD_HEIGHT - 1}`);
  });

  it("does not expose a mutable authoritative node through either output catalog", () => {
    const compatibility = compatibilityWorld("the catalog stays behind glass");
    const node = resourceNode("field:immutable-address", 12, 14);
    const source = resourceCatalog([node]);
    const before = structuredClone(source);
    const projection = projectCompatibilityFieldResources(
      source,
      floatingWorld(compatibility, { x: 0, y: 0 }),
    );
    const mappedSource = projection.mappings[0]?.source;
    const projectedNode = projection.catalog.nodes[0];
    if (!mappedSource || !projectedNode) throw new Error("resource fixture should be visible");

    expect(() => {
      (mappedSource as { id: string }).id = "field:mutated";
    }).toThrow(TypeError);
    expect(() => {
      (projectedNode as { capacityUnits: number }).capacityUnits = 999;
    }).toThrow(TypeError);
    expect(source).toEqual(before);
    expect(node.id).toBe("field:immutable-address");
    expect(node.capacityUnits).toBe(6);
    expect(Object.keys(mappedSource).sort()).toEqual([
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
    ]);
  });
});
