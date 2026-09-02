import { describe, expect, it } from "vitest";

import {
  FIELD_RESOURCE_LIVING_RESERVE_UNITS,
  createFieldResourceEcologyState,
  generateFieldResourceCatalog,
  harvestFieldResource,
  type FieldResourceCatalog,
} from "../sim/fieldResources";
import { createWorld, createWorldView } from "../sim/public";
import { createPlayer, TILE_UNITS } from "./player";
import { projectGameView } from "./projection";

function setup() {
  const state = createWorld("the hand-gathered horizon", "standard");
  const world = createWorldView(state);
  const player = createPlayer(world);
  player.discovered.fill(0);
  player.depthSoundings.fill(0);
  const catalog = generateFieldResourceCatalog(state.meta.rootSeed, state.terrain);
  const settlementTiles = new Set(world.settlements.map((settlement) => settlement.tileIndex));
  const node = catalog.nodes.find((candidate) => !settlementTiles.has(candidate.tileIndex));
  if (!node) throw new Error("generated ecology should contain a non-harbor node");
  return {
    world,
    player,
    catalog,
    ecology: createFieldResourceEcologyState(world.completedTick),
    node,
  };
}

describe("field-resource projection", () => {
  it("requires paired ecology data and reveals no undiscovered catalog coordinates", () => {
    const { world, player, catalog, ecology } = setup();
    expect(projectGameView(world, player).fieldResources).toEqual([]);
    expect(projectGameView(world, player, { fieldResourceCatalog: catalog }).fieldResources)
      .toEqual([]);
    expect(projectGameView(world, player, {
      fieldResourceCatalog: catalog,
      fieldResourceEcology: ecology,
    }).fieldResources).toEqual([]);
  });

  it("shows a material only in exact sight and withholds rarity and stock until sounded", () => {
    const { world, player, catalog, ecology, node } = setup();
    player.discovered[node.tileIndex] = 1;
    const hiddenMemory = projectGameView(world, player, {
      fieldResourceCatalog: catalog,
      fieldResourceEcology: ecology,
    }).fieldResources;
    expect(hiddenMemory).toEqual([]);

    player.x = (node.tileIndex % world.terrain.width) * TILE_UNITS;
    player.y = Math.floor(node.tileIndex / world.terrain.width) * TILE_UNITS;
    const charted = projectGameView(world, player, {
      fieldResourceCatalog: catalog,
      fieldResourceEcology: ecology,
    }).fieldResources;

    expect(charted).toHaveLength(1);
    expect(charted[0]).toEqual({
      id: node.id,
      material: node.material,
      label: expect.any(String),
      position: {
        x: (node.tileIndex % world.terrain.width) * 24 + 12,
        y: Math.floor(node.tileIndex / world.terrain.width) * 24 + 12,
      },
      knowledge: "charted",
      currentVisibility: 1,
    });
    expect(charted[0]).not.toHaveProperty("rarity");
    expect(charted[0]).not.toHaveProperty("stockUnits");

    player.depthSoundings[node.tileIndex] = 1;
    const sounded = projectGameView(world, player, {
      fieldResourceCatalog: catalog,
      fieldResourceEcology: ecology,
    }).fieldResources;
    expect(sounded[0]).toMatchObject({
      knowledge: "sounded",
      currentVisibility: 1,
      rarity: node.rarity,
      stockUnits: node.capacityUnits - FIELD_RESOURCE_LIVING_RESERVE_UNITS,
    });
  });

  it("never projects the living reserve or a node on a harbor tile", () => {
    const { world, player, catalog, ecology, node } = setup();
    player.discovered[node.tileIndex] = 1_000_000;
    player.depthSoundings[node.tileIndex] = 1_000_000;
    const drained = harvestFieldResource(
      catalog,
      ecology,
      node.id,
      node.capacityUnits - FIELD_RESOURCE_LIVING_RESERVE_UNITS,
    );
    expect(drained.ok).toBe(true);
    expect(projectGameView(world, player, {
      fieldResourceCatalog: catalog,
      fieldResourceEcology: drained.state,
    }).fieldResources).toEqual([]);

    const harborIndex = world.settlements[0]?.tileIndex;
    if (harborIndex === undefined) throw new Error("world should contain a harbor");
    const harborTile = world.terrain.tiles[harborIndex];
    if (!harborTile) throw new Error("harbor tile should exist");
    const harborCatalog: FieldResourceCatalog = {
      ...catalog,
      nodes: [{
        ...node,
        id: `${node.id}:harbor-copy`,
        tileIndex: harborIndex,
        x: harborTile.x,
        y: harborTile.y,
      }],
    };
    player.discovered[harborIndex] = 1_000_000;
    expect(projectGameView(world, player, {
      fieldResourceCatalog: harborCatalog,
      fieldResourceEcology: createFieldResourceEcologyState(),
    }).fieldResources).toEqual([]);
  });

  it("sorts projected nodes deterministically even if a catalog arrives out of order", () => {
    const { world, player, catalog, ecology } = setup();
    player.discovered.fill(1_000_000);
    const forward = projectGameView(world, player, {
      fieldResourceCatalog: catalog,
      fieldResourceEcology: ecology,
    }).fieldResources;
    const reverse = projectGameView(world, player, {
      fieldResourceCatalog: { ...catalog, nodes: [...catalog.nodes].reverse() },
      fieldResourceEcology: ecology,
    }).fieldResources;
    expect(reverse).toEqual(forward);
  });
});
