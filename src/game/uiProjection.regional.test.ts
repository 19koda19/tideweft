import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import {
  createRegionCoord,
  type RegionCoord,
  type RegionTileAddress,
} from "../sim/regions";
import type { ContractState, TerrainState, WorldView } from "../sim/types";
import { TILE_UNITS, createPlayer, loadContractCargo, type PlayerState } from "./player";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  regionalWindowTileAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { createSessionState, type GameSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";

interface RegionalObjectiveFixture {
  readonly economy: WorldView;
  readonly spatial: WorldView;
  readonly player: PlayerState;
  readonly session: GameSessionState;
  readonly contract: ContractState;
}

function objectiveFixture(
  seed: string,
  center: RegionCoord,
): RegionalObjectiveFixture {
  const simulation = createWorld(seed);
  const economy = createWorldView(simulation);
  const contract = economy.contracts.find(({ status }) => status === "offered");
  if (!contract) throw new Error("regional Promise fixture has no offer");
  const player = createPlayer(economy);
  const template = economy.terrain.tiles[0];
  if (!template) throw new Error("regional Promise fixture has no terrain template");
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
  const spatial = createRegionalWorldView(economy, window, {
    discovered: Array.from({ length: window.terrain.tiles.length }, () => 0),
    depthSoundings: Array.from({ length: window.terrain.tiles.length }, () => 0),
  });
  player.worldWidth = spatial.terrain.width;
  player.worldHeight = spatial.terrain.height;
  player.discovered = Array.from({ length: window.terrain.tiles.length }, () => 0);
  player.depthSoundings = Array.from({ length: window.terrain.tiles.length }, () => 0);
  const session = createSessionState(economy.seedText);
  session.tutorial.dismissed = true;
  return { economy, spatial, player, session, contract };
}

function settlementTile(
  world: WorldView,
  settlementId: number,
): WorldView["terrain"]["tiles"][number] {
  const settlement = world.settlements.find(({ id }) => id === settlementId);
  const tile = settlement ? world.terrain.tiles[settlement.tileIndex] : undefined;
  if (!tile) throw new Error(`settlement ${settlementId} has no terrain tile`);
  return tile;
}

/** Put the porter on the same local tile in the fixture's nonzero center region. */
function placeAtMatchingLocalTile(player: PlayerState, tile: { readonly x: number; readonly y: number }): void {
  player.x = (tile.x + 1.5) * TILE_UNITS;
  player.y = (tile.y + 1.5) * TILE_UNITS;
  player.previousX = player.x;
  player.previousY = player.y;
}

function visibleDistance(label: string | undefined): number {
  const match = /([\d,.]+) tiles/u.exec(label ?? "");
  if (!match?.[1]) throw new Error(`objective has no visible tile distance: ${label ?? "missing"}`);
  return Number(match[1].replaceAll(",", ""));
}

describe("regional Promise objective guidance", () => {
  it("keeps economy names and a nonzero west bearing for remote pickup, delivery, and report loops", () => {
    const fixture = objectiveFixture(
      "the westward Promise remains named",
      createRegionCoord(1, 0),
    );
    const { economy, spatial, player, session, contract } = fixture;
    const origin = economy.settlements.find(({ id }) => id === contract.originSettlementId);
    const destination = economy.settlements.find(({ id }) => id === contract.destinationSettlementId);
    if (!origin || !destination) throw new Error("regional Promise fixture lost a harbor");

    placeAtMatchingLocalTile(player, settlementTile(economy, origin.id));
    session.trackedContractId = contract.id;
    const pickup = projectUIView(spatial, player, session, { economyWorld: economy }).objective;
    expect(pickup?.title).toContain(origin.name);
    expect(pickup?.progressLabel).toContain(destination.name);
    expect(pickup?.progressLabel).toContain("west");
    expect(visibleDistance(pickup?.progressLabel)).toBe(96);

    expect(loadContractCargo(player, contract)).toBe(true);
    placeAtMatchingLocalTile(player, settlementTile(economy, destination.id));
    const delivery = projectUIView(spatial, player, session, { economyWorld: economy }).objective;
    expect(delivery?.title).toContain(destination.name);
    expect(delivery?.why).toContain(origin.name);
    expect(delivery?.progressLabel).toContain("west");
    expect(visibleDistance(delivery?.progressLabel)).toBe(96);

    player.activeContractId = null;
    player.cargo = [];
    session.trackedContractId = null;
    player.report = {
      sourceSettlementId: origin.id,
      targetSettlementId: destination.id,
      resource: origin.specialization,
      reportedQuantity: origin.inventory[origin.specialization],
      observedTick: economy.completedTick,
      confidence: 1_000_000,
    };
    const report = projectUIView(spatial, player, session, { economyWorld: economy }).objective;
    expect(report?.title).toContain(destination.name);
    expect(report?.description).toContain(origin.name);
    expect(report?.progressLabel).toContain("west");
    expect(visibleDistance(report?.progressLabel)).toBe(96);
  });

  it("uses signed global region coordinates when the local tile index is identical", () => {
    const fixture = objectiveFixture(
      "signed horizons do not alias",
      createRegionCoord(-2, 3),
    );
    const { economy, spatial, player, session, contract } = fixture;
    const originTile = settlementTile(economy, contract.originSettlementId);
    placeAtMatchingLocalTile(player, originTile);
    session.trackedContractId = contract.id;

    const beforeEconomy = structuredClone(economy);
    const first = projectUIView(spatial, player, session, { economyWorld: economy }).objective;
    const second = projectUIView(spatial, player, session, { economyWorld: economy }).objective;
    const regionalHud = projectUIView(spatial, player, session, { economyWorld: economy });
    const distance = visibleDistance(first?.progressLabel);

    expect(distance).toBeGreaterThan(0);
    expect(Number.isFinite(distance)).toBe(true);
    expect(first?.progressLabel).toContain("north-east");
    expect(second).toEqual(first);
    expect(regionalHud.player.locationLabel).toBe("Between harbors · R -2,+3");
    expect(regionalHud.revision).toContain("-2,3");
    expect(economy).toEqual(beforeEconomy);
  });

  it("keeps guidance finite and directional at a very distant supported center", () => {
    const fixture = objectiveFixture(
      "far country Promise arithmetic",
      createRegionCoord(1_000_000, -1_000_000),
    );
    const { economy, spatial, player, session, contract } = fixture;
    placeAtMatchingLocalTile(player, settlementTile(economy, contract.originSettlementId));
    session.trackedContractId = contract.id;

    const objective = projectUIView(spatial, player, session, { economyWorld: economy }).objective;
    const distance = visibleDistance(objective?.progressLabel);
    expect(distance).toBeGreaterThan(0);
    expect(Number.isFinite(distance)).toBe(true);
    expect(objective?.progressLabel).toContain("south-west");
    expect(objective?.progressLabel).not.toContain("Infinity");
    expect(objective?.progressLabel).not.toContain("NaN");
  });

  it("fails a stale out-of-window player point closed without inventing zero distance", () => {
    const fixture = objectiveFixture(
      "stale pointer cannot counterfeit arrival",
      createRegionCoord(-1, 0),
    );
    const { economy, spatial, player, session, contract } = fixture;
    const origin = economy.settlements.find(({ id }) => id === contract.originSettlementId);
    if (!origin) throw new Error("regional Promise fixture lost its origin");
    session.trackedContractId = contract.id;
    player.x = -1;

    const objective = projectUIView(spatial, player, session, { economyWorld: economy }).objective;
    expect(objective?.title).toContain(origin.name);
    expect(objective?.progressLabel).toContain("Route position unavailable");
    expect(objective?.progressLabel).not.toContain("0.0 tiles");
    expect(objective?.progressLabel).not.toContain("Infinity");
    expect(objective?.progressLabel).not.toContain("NaN");
  });
});
