import { describe, expect, it } from "vitest";
import { createWorld, createWorldView } from "../sim/public";
import { TILE_UNITS, createPlayer } from "./player";
import { migratePlayerToRegionalTravel } from "./regionalPlayerTravel";
import {
  REGIONAL_TRAVEL_COLUMNS,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  advanceRegionalPromiseJourney,
  beginRegionalPromiseJourney,
  createRegionalPromiseJourney,
  migrateRegionalPromiseJourney,
  regionalPromiseDeliveryEvidence,
  restoreRegionalPromiseJourney,
} from "./regionalPromiseJourney";

describe("regional Promise journey evidence", () => {
  it("preserves an exact compatibility route and grants route evidence", () => {
    const world = createWorld("regional Promise evidence", "wild");
    const economy = createWorldView(world);
    const contract = economy.contracts.find(({ status }) => status === "offered");
    if (!contract) throw new Error("fixture has no Promise");
    const route = economy.routes.find(({ id }) => id === contract.routeId);
    if (!route) throw new Error("fixture has no route");
    const trace = route.fromSettlementId === contract.originSettlementId
      ? [...route.path]
      : [...route.path].reverse();
    const player = createPlayer(economy, contract.originSettlementId);
    player.activeContractId = contract.id;
    player.currentTrace = trace;
    const journey = migrateRegionalPromiseJourney(player, economy);
    expect(regionalPromiseDeliveryEvidence(journey, contract, economy)).toEqual({
      routeEvidence: "compatibility-trace",
      trace,
    });
  });

  it("permanently removes route credit after entering any nonzero signed region", () => {
    const world = createWorld("regional Promise detour", "wild");
    const economy = createWorldView(world);
    const contract = economy.contracts.find(({ status }) => status === "offered");
    if (!contract) throw new Error("fixture has no Promise");
    const player = createPlayer(economy, contract.originSettlementId);
    player.activeContractId = contract.id;
    const travel = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const spatial = createRegionalWorldView(
      economy,
      travel.window,
      { discovered: player.discovered, depthSoundings: player.depthSoundings },
    );
    const outsideIndex = travel.window.addresses.findIndex(({ region }) =>
      region.x !== 0 || region.y !== 0);
    expect(outsideIndex).toBeGreaterThanOrEqual(0);
    player.x = (outsideIndex % REGIONAL_TRAVEL_COLUMNS + 0.5) * TILE_UNITS;
    player.y = (Math.floor(outsideIndex / REGIONAL_TRAVEL_COLUMNS) + 0.5) * TILE_UNITS;
    const detoured = advanceRegionalPromiseJourney(
      beginRegionalPromiseJourney(contract, economy),
      player,
      economy,
      spatial,
    );
    expect(detoured.detoured).toBe(true);
    expect(detoured.compatibilityTrace).toEqual([]);
    expect(regionalPromiseDeliveryEvidence(detoured, contract, economy)).toEqual({
      routeEvidence: "regional-detour",
      trace: [],
    });
  });

  it("restores only an exact journey matching the active player position", () => {
    const world = createWorld("regional Promise restore", "wild");
    const economy = createWorldView(world);
    const contract = economy.contracts.find(({ status }) => status === "offered");
    if (!contract) throw new Error("fixture has no Promise");
    const player = createPlayer(economy, contract.originSettlementId);
    player.activeContractId = contract.id;
    const journey = beginRegionalPromiseJourney(contract, economy);
    const travel = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const spatial = createRegionalWorldView(
      economy,
      travel.window,
      { discovered: player.discovered, depthSoundings: player.depthSoundings },
    );
    const cloned = JSON.parse(JSON.stringify(journey));
    expect(restoreRegionalPromiseJourney(cloned, player, economy, spatial)).toEqual(journey);
    cloned.compatibilityTrace = [cloned.compatibilityTrace[0] + 1];
    expect(restoreRegionalPromiseJourney(cloned, player, economy, spatial)).toBeNull();
    expect(restoreRegionalPromiseJourney(
      { ...createRegionalPromiseJourney(), extra: true },
      { ...player, activeContractId: null },
      economy,
      spatial,
    )).toBeNull();
  });
});
