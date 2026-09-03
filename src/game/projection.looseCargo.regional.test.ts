import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord, type RegionTileAddress } from "../sim/regions";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainState,
  type WorldView,
} from "../sim/types";
import { createCraftingInventory } from "./crafting";
import {
  LOOSE_CARGO_TILE_UNITS,
  createLooseCargoCarrier,
  createLooseCargoWorld,
  dropLooseCargo,
  type LooseCargoWorldState,
} from "./looseCargo";
import { TILE_UNITS, createPlayer, type PlayerState } from "./player";
import { projectGameView } from "./projection";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  regionalWindowTileAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";

const PORTER = { kind: "player", id: "local-porter" } as const;
const FRAME_ORIGIN = Object.freeze({ x: 84, y: 5 });

interface SeamFixture {
  readonly economy: WorldView;
  readonly spatial: WorldView;
  readonly player: PlayerState;
}

function seamFixture(seed: string): SeamFixture {
  const generated = createWorldView(createWorld(seed));
  const meadowTiles = generated.terrain.tiles.map((tile) => ({
    ...tile,
    terrain: "meadow" as const,
    waterDepth: 0,
    settlementId: null,
  }));
  const economy: WorldView = {
    ...generated,
    terrain: { ...generated.terrain, tiles: meadowTiles },
    settlements: [],
    routes: [],
    choirs: [],
  };
  const template = meadowTiles[0];
  if (!template) throw new Error("cargo seam fixture has no terrain template");
  const tiles: TerrainState["tiles"][number][] = [];
  const addresses: RegionTileAddress[] = [];
  for (let y = 0; y < REGIONAL_TRAVEL_ROWS; y += 1) {
    for (let x = 0; x < REGIONAL_TRAVEL_COLUMNS; x += 1) {
      const index = y * REGIONAL_TRAVEL_COLUMNS + x;
      tiles.push({ ...template, index, x, y });
      addresses.push(regionalWindowTileAddress(FRAME_ORIGIN, x, y));
    }
  }
  const window: RegionalTerrainWindow = {
    center: createRegionCoord(0, 0),
    origin: FRAME_ORIGIN,
    terrain: {
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
      tiles,
    },
    addresses,
  };
  const spatial = createRegionalWorldView(economy, window, {
    discovered: Array.from({ length: tiles.length }, () => FIXED_POINT),
    depthSoundings: Array.from({ length: tiles.length }, () => 0),
  });
  const player = createPlayer(generated);
  player.worldWidth = spatial.terrain.width;
  player.worldHeight = spatial.terrain.height;
  player.discovered = Array.from({ length: tiles.length }, () => FIXED_POINT);
  player.depthSoundings = Array.from({ length: tiles.length }, () => 0);
  // Global 95.5,10.5: one half-tile west of the east storage seam.
  player.x = (95.5 - FRAME_ORIGIN.x) * TILE_UNITS;
  player.y = (10.5 - FRAME_ORIGIN.y) * TILE_UNITS;
  player.previousX = player.x;
  player.previousY = player.y;
  player.facingMilliRadians = 0;
  return { economy: generated, spatial, player };
}

function droppedStack(
  regionX: number,
  localX: number,
  localY: number,
): LooseCargoWorldState {
  const dropped = dropLooseCargo(
    createLooseCargoWorld(
      WORLD_WIDTH,
      WORLD_HEIGHT,
      createRegionCoord(regionX, 0),
    ),
    createLooseCargoCarrier(
      PORTER,
      createCraftingInventory(100_000, { cordreed: 1 }),
    ),
    {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: localX * LOOSE_CARGO_TILE_UNITS,
      y: localY * LOOSE_CARGO_TILE_UNITS,
    },
  );
  if (!dropped.ok) throw new Error(`cargo seam fixture failed: ${dropped.reason}`);
  return dropped.world;
}

describe("loose cargo across the seamless spatial frame", () => {
  it("projects visible parcels from both sides even when the adjacent region origin is outside the frame", () => {
    const { spatial, player } = seamFixture("cargo crosses an invisible storage seam");
    const west = droppedStack(0, 95.25, 10.5);
    const east = droppedStack(1, 0.5, 10.5);

    const parcels = projectGameView(spatial, player, {
      looseCargoWorlds: [west, east],
    }).looseCargo ?? [];

    expect(parcels.map(({ id }) => id).sort()).toEqual([
      "lc:0:0:parcel:1",
      "lc:1:0:parcel:1",
    ]);
    expect(parcels.find(({ id }) => id === "lc:0:0:parcel:1")?.position)
      .toEqual({ x: (95.25 - FRAME_ORIGIN.x) * 24, y: (10.5 - FRAME_ORIGIN.y) * 24 });
    expect(parcels.find(({ id }) => id === "lc:1:0:parcel:1")?.position)
      .toEqual({ x: (96.5 - FRAME_ORIGIN.x) * 24, y: (10.5 - FRAME_ORIGIN.y) * 24 });
    expect(parcels.every(({ recovery }) => recovery === "reachable")).toBe(true);
  });

  it("offers recovery when the nearest physical Promise is in an inactive adjacent world", () => {
    const { economy, spatial, player } = seamFixture("nearby sealed cargo remains reachable");
    const contract = economy.contracts.find(({ status }) => status === "offered");
    if (!contract) throw new Error("cargo seam fixture has no Promise");
    const carrier = createLooseCargoCarrier(
      PORTER,
      createCraftingInventory(100_000),
      [{
        contractId: contract.id,
        resource: contract.resource,
        quantity: contract.quantity,
        property: contract.resource === "medicine"
          ? "fragile"
          : contract.resource === "food"
            ? "perishable"
            : contract.resource === "freshWater" || contract.resource === "parts"
              ? "heavy"
              : "ordinary",
        condition: 900_000,
      }],
    );
    const dropped = dropLooseCargo(
      createLooseCargoWorld(WORLD_WIDTH, WORLD_HEIGHT, createRegionCoord(1, 0)),
      carrier,
      {
        lotId: `promise:${contract.id}`,
        x: 0.5 * LOOSE_CARGO_TILE_UNITS,
        y: 10.5 * LOOSE_CARGO_TILE_UNITS,
      },
    );
    if (!dropped.ok) throw new Error(`Promise seam fixture failed: ${dropped.reason}`);
    player.activeContractId = contract.id;
    const session = createSessionState(economy.seedText);
    session.tutorial.dismissed = true;

    const view = projectUIView(spatial, player, session, {
      economyWorld: economy,
      looseCargoCarrier: dropped.carrier,
      looseCargoWorld: createLooseCargoWorld(WORLD_WIDTH, WORLD_HEIGHT),
      inactiveLooseCargoWorlds: [dropped.world],
    });

    expect(view.controls).toMatchObject({ canInteract: true, interactLabel: "Recover parcel" });
    expect(view.objective).toMatchObject({ id: `recover-${contract.id}` });
    expect(view.objective?.description).toContain("1.0 tiles east");

    const distantView = projectUIView(spatial, player, session, {
      economyWorld: economy,
      looseCargoCarrier: dropped.carrier,
      looseCargoWorld: createLooseCargoWorld(WORLD_WIDTH, WORLD_HEIGHT),
      inactiveLooseCargoWorlds: [],
      activePromiseCustody: {
        contractId: contract.id,
        carriedQuantity: 0,
        looseQuantity: contract.quantity,
      },
    });
    expect(distantView.objective).toMatchObject({ id: `recover-${contract.id}` });
    expect(distantView.objective?.description).toContain("outside the current visible landscape");
    expect(distantView.objective?.description).not.toContain("tiles east");
  });
});
