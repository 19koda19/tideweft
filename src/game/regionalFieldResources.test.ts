import { describe, expect, it } from "vitest";

import {
  FIELD_RESOURCE_CATALOG_VERSION,
  createFieldResourceEcologyState,
  fieldResourceStockUnits,
  harvestFieldResource,
  type FieldResourceCatalog,
  type FieldResourceNode,
} from "../sim/fieldResources";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
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
  regionalWindowTileAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import {
  projectCompatibilityFieldResources,
  regionalFieldResourceAtViewTile,
  regionalFieldResourceById,
} from "./regionalFieldResources";
import { createRegionalWorldView } from "./regionalWorldView";

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
function floatingWorld(compatibility: WorldView, centerInput: RegionCoord): WorldView {
  const center = createRegionCoord(centerInput.x, centerInput.y);
  const template = compatibility.terrain.tiles[0];
  if (!template) throw new Error("compatibility world needs a terrain tile");
  const tiles: TerrainState["tiles"][number][] = [];
  const addresses: RegionTileAddress[] = [];
  for (let y = 0; y < REGIONAL_TRAVEL_ROWS; y += 1) {
    for (let x = 0; x < REGIONAL_TRAVEL_COLUMNS; x += 1) {
      const index = y * REGIONAL_TRAVEL_COLUMNS + x;
      tiles.push({ ...template, index, x, y });
      addresses.push(regionalWindowTileAddress(center, x, y));
    }
  }
  const window: RegionalTerrainWindow = {
    center,
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
  it("projects region 0 through its center and four cardinal halo seams only", () => {
    const compatibility = compatibilityWorld("resources touch every seam");
    const west = resourceNode("field:west", 0, 35);
    const east = resourceNode("field:east", WORLD_WIDTH - 1, 34);
    const north = resourceNode("field:north", 47, 0);
    const south = resourceNode("field:south", 48, WORLD_HEIGHT - 1);
    const interior = resourceNode("field:interior", 40, 30);
    const catalog = resourceCatalog([south, interior, west, north, east]);

    const centered = projectCompatibilityFieldResources(
      catalog,
      floatingWorld(compatibility, { x: 0, y: 0 }),
    );
    expect(centered.mappings.map(({ source }) => source.id)).toEqual([
      north.id,
      interior.id,
      east.id,
      west.id,
      south.id,
    ].sort((left, right) => {
      const leftNode = catalog.nodes.find(({ id }) => id === left)!;
      const rightNode = catalog.nodes.find(({ id }) => id === right)!;
      const leftIndex = (leftNode.y + 1) * REGIONAL_TRAVEL_COLUMNS + leftNode.x + 1;
      const rightIndex = (rightNode.y + 1) * REGIONAL_TRAVEL_COLUMNS + rightNode.x + 1;
      return leftIndex - rightIndex || left.localeCompare(right);
    }));

    const cases = [
      [
        { x: -1, y: 0 },
        west.id,
        (west.y + 1) * REGIONAL_TRAVEL_COLUMNS + REGIONAL_TRAVEL_COLUMNS - 1,
      ],
      [{ x: 1, y: 0 }, east.id, (east.y + 1) * REGIONAL_TRAVEL_COLUMNS],
      [
        { x: 0, y: -1 },
        north.id,
        (REGIONAL_TRAVEL_ROWS - 1) * REGIONAL_TRAVEL_COLUMNS + north.x + 1,
      ],
      [{ x: 0, y: 1 }, south.id, south.x + 1],
    ] as const;
    for (const [center, expectedId, expectedViewTileIndex] of cases) {
      const projection = projectCompatibilityFieldResources(
        catalog,
        floatingWorld(compatibility, center),
      );
      expect(projection.mappings.map(({ source }) => source.id)).toEqual([expectedId]);
      expect(projection.mappings[0]?.viewTileIndex).toBe(expectedViewTileIndex);
      expect(projection.catalog.nodes[0]).toMatchObject({
        tileIndex: expectedViewTileIndex,
        x: expectedViewTileIndex % REGIONAL_TRAVEL_COLUMNS,
        y: Math.floor(expectedViewTileIndex / REGIONAL_TRAVEL_COLUMNS),
      });
    }

    const eastView = floatingWorld(compatibility, { x: 1, y: 0 });
    const eastProjection = projectCompatibilityFieldResources(catalog, eastView);
    const activeRegionSameLocalIndex = (east.y + 1) * REGIONAL_TRAVEL_COLUMNS + east.x + 1;
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
      const projection = projectCompatibilityFieldResources(
        catalog,
        floatingWorld(compatibility, center),
      );
      const sameLocalViewIndex = (node.y + 1) * REGIONAL_TRAVEL_COLUMNS + node.x + 1;
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

    const floating = projectCompatibilityFieldResources(
      catalog,
      floatingWorld(compatibility, { x: 0, y: 0 }),
    );
    const expectedFloatingIndex = height * REGIONAL_TRAVEL_COLUMNS + width;
    expect(floating.mappings[0]).toEqual({ source: node, viewTileIndex: expectedFloatingIndex });
    expect(floating.catalog.nodes[0]).toMatchObject({
      id: node.id,
      tileIndex: expectedFloatingIndex,
      x: width,
      y: height,
    });

    const legacy = projectCompatibilityFieldResources(
      catalog,
      finiteLegacyWorld(compatibility, width, height),
    );
    expect(legacy.mappings[0]).toEqual({ source: node, viewTileIndex: node.tileIndex });
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

  it("fails closed on lost floating metadata, aliases, malformed addresses, and excess work", () => {
    const compatibility = compatibilityWorld("bad resource addresses stay dark");
    const view = floatingWorld(compatibility, { x: 4, y: -3 });
    const node = resourceNode("field:valid", 10, 10);
    const catalog = resourceCatalog([node]);

    expect(() => projectCompatibilityFieldResources(catalog, structuredClone(view)))
      .toThrow(/dimensions/);
    const malformedCoordinates = floatingWorld(compatibility, { x: 0, y: 0 });
    const mappedIndex = (node.y + 1) * REGIONAL_TRAVEL_COLUMNS + node.x + 1;
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
