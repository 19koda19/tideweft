import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createWorld,
  createWorldView,
  type ContractState,
  type TerrainTileView,
  type WorldView,
} from "../sim/public";
import {
  TILE_UNITS,
  cargoWeight,
  createPlayer,
  cyclePace,
  loadContractCargo,
  playerTileIndex,
  pulseScan,
  settlementAtPlayer,
  stepPlayer,
  unloadContractCargo,
  type PlayerState,
} from "./player";

const NO_INPUT = { moveX: 0, moveY: 0, brace: false } as const;
const MOVE_RIGHT = { moveX: 1, moveY: 0, brace: false } as const;

function controlledWorld(
  editTiles?: (tiles: TerrainTileView[]) => void,
): WorldView {
  const generated = createWorldView(createWorld("player mechanics fixture", "calm"));
  const tiles = generated.terrain.tiles.map((tile) => ({
    ...tile,
    terrain: "meadow" as const,
    roughness: 0,
    waterDepth: 0,
  }));
  editTiles?.(tiles);
  return {
    ...generated,
    weather: {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: generated.completedTick + 1_000,
    },
    terrain: { ...generated.terrain, tiles },
  };
}

function placePlayer(player: PlayerState, tileX: number, tileY: number, offsetX = 500): void {
  player.x = tileX * TILE_UNITS + offsetX;
  player.y = tileY * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.currentTrace = [tileY * WORLD_WIDTH + tileX];
}

function offeredContract(world: WorldView, changes: Partial<ContractState> = {}): ContractState {
  const source = world.contracts.find((contract) => contract.status === "offered");
  if (!source) throw new Error("fixture did not generate an offered contract");
  return { ...source, ...changes, status: changes.status ?? "offered" };
}

describe("player movement", () => {
  it("moves at deterministic fixed-point speed and records each entered tile", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    placePlayer(player, 10, 10);

    for (let step = 0; step < 5; step += 1) {
      const result = stepPlayer(player, world, MOVE_RIGHT);
      expect(result.moved).toBe(true);
      expect(result.enteredTile).toBeNull();
    }
    const crossing = stepPlayer(player, world, MOVE_RIGHT);

    expect(player.velocityX).toBe(97);
    expect(player.velocityY).toBe(0);
    expect(player.facingMilliRadians).toBe(0);
    expect(crossing.enteredTile).toBe(10 * WORLD_WIDTH + 11);
    expect(playerTileIndex(player)).toBe(10 * WORLD_WIDTH + 11);
    expect(player.currentTrace).toEqual([10 * WORLD_WIDTH + 10, 10 * WORLD_WIDTH + 11]);
    expect(player.discovered[10 * WORLD_WIDTH + 11]).toBeGreaterThan(0);
  });

  it("normalizes diagonal input and refuses an impassable low-water channel", () => {
    const blockedIndex = 10 * WORLD_WIDTH + 11;
    const world = controlledWorld((tiles) => {
      const blocked = tiles[blockedIndex];
      if (!blocked) throw new Error("fixture tile missing");
      tiles[blockedIndex] = {
        ...blocked,
        terrain: "deep-water",
        waterDepth: 100_000,
      };
    });
    const player = createPlayer(world);
    placePlayer(player, 10, 10);

    stepPlayer(player, world, { moveX: 1, moveY: 1, brace: false });
    expect(player.velocityX).toBe(68);
    expect(player.velocityY).toBe(68);

    placePlayer(player, 10, 10, 950);
    const startingX = player.x;
    const result = stepPlayer(player, world, MOVE_RIGHT);
    expect(result.moved).toBe(false);
    expect(result.enteredTile).toBeNull();
    expect(player.x).toBe(startingX);
    expect(player.velocityX).toBe(0);
  });

  it("clamps travel at every world edge", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    placePlayer(player, 0, 0, TILE_UNITS / 2);
    player.y = TILE_UNITS / 2;

    stepPlayer(player, world, { moveX: -1, moveY: -1, brace: false });
    expect(player.x).toBe(TILE_UNITS / 2);
    expect(player.y).toBe(TILE_UNITS / 2);

    placePlayer(player, WORLD_WIDTH - 1, WORLD_HEIGHT - 1, TILE_UNITS / 2);
    player.y = WORLD_HEIGHT * TILE_UNITS - TILE_UNITS / 2;
    stepPlayer(player, world, { moveX: 1, moveY: 1, brace: false });
    expect(player.x).toBe(WORLD_WIDTH * TILE_UNITS - TILE_UNITS / 2);
    expect(player.y).toBe(WORLD_HEIGHT * TILE_UNITS - TILE_UNITS / 2);
  });
});

describe("effort, stability, and discovery", () => {
  it("spends more effort at swift pace, enters camp on exhaustion, and recovers while resting", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    placePlayer(player, 10, 10);
    player.pace = "swift";
    player.stamina = 16_000;

    const exhausted = stepPlayer(player, world, MOVE_RIGHT);
    expect(exhausted.exhausted).toBe(true);
    expect(player.stamina).toBe(0);
    expect(player.mode).toBe("camp");
    expect(player.pace).toBe("rest");

    const recovering = stepPlayer(player, world, NO_INPUT);
    expect(recovering.exhausted).toBe(false);
    expect(player.stamina).toBe(7_200);
    expect(player.stability).toBe(FIXED_POINT);
  });

  it("lets active bracing trade speed for stability and fragile-cargo protection", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    placePlayer(player, 10, 10);
    const contract = offeredContract(world, { id: 91_001, resource: "medicine", quantity: 4 });
    expect(loadContractCargo(player, contract)).toBe(true);
    player.pace = "swift";
    player.stability = 50_000;

    const roughStep = stepPlayer(player, world, MOVE_RIGHT);
    expect(roughStep.damagedCargo).toBe(true);
    expect(player.cargo[0]?.condition).toBeLessThan(FIXED_POINT);
    const wornCondition = player.cargo[0]?.condition ?? 0;
    const unbracedSpeed = Math.abs(player.velocityX);

    const bracedStep = stepPlayer(player, world, { moveX: 1, moveY: 0, brace: true });
    expect(bracedStep.moved).toBe(true);
    expect(Math.abs(player.velocityX)).toBeLessThan(unbracedSpeed);
    expect(player.stability).toBeGreaterThan(44_400);
    expect(player.cargo[0]?.condition).toBe(wornCondition);
    expect(bracedStep.damagedCargo).toBe(false);
  });

  it("makes fragile loads shock-sensitive while heavy loads resist the same handling", () => {
    const world = controlledWorld();
    const fragilePlayer = createPlayer(world);
    const heavyPlayer = createPlayer(world);
    placePlayer(fragilePlayer, 10, 10);
    placePlayer(heavyPlayer, 10, 10);
    expect(loadContractCargo(fragilePlayer, offeredContract(world, {
      id: 91_005,
      resource: "medicine",
      quantity: 4,
    }))).toBe(true);
    expect(loadContractCargo(heavyPlayer, offeredContract(world, {
      id: 91_006,
      resource: "parts",
      quantity: 4,
    }))).toBe(true);
    fragilePlayer.stability = 400_000;
    heavyPlayer.stability = 400_000;

    expect(stepPlayer(fragilePlayer, world, MOVE_RIGHT).damagedCargo).toBe(true);
    expect(stepPlayer(heavyPlayer, world, MOVE_RIGHT).damagedCargo).toBe(false);
  });

  it("gives perishable food gentle travel decay that a completed cache halts", () => {
    const world = controlledWorld();
    const food = offeredContract(world, { id: 91_007, resource: "food", quantity: 4 });
    const traveler = createPlayer(world);
    placePlayer(traveler, 10, 10);
    expect(loadContractCargo(traveler, food)).toBe(true);
    expect(stepPlayer(traveler, world, MOVE_RIGHT).damagedCargo).toBe(true);
    expect(traveler.cargo[0]?.condition).toBe(FIXED_POINT - 96);

    const cacheWorld: WorldView = {
      ...world,
      settlements: world.settlements.map((settlement, index) => index === 0
        ? { ...settlement, project: { ...settlement.project, kind: "cache", status: "complete" } }
        : settlement),
    };
    const sheltered = createPlayer(cacheWorld);
    expect(loadContractCargo(sheltered, { ...food, id: 91_008 })).toBe(true);
    expect(stepPlayer(sheltered, cacheWorld, NO_INPUT).damagedCargo).toBe(false);
    expect(sheltered.cargo[0]?.condition).toBe(FIXED_POINT);
  });

  it("cycles pace within bounds and makes scans charge-gated and persistent", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    placePlayer(player, 30, 24);
    player.discovered.fill(0);

    cyclePace(player, -1);
    cyclePace(player, -1);
    expect(player.pace).toBe("rest");
    cyclePace(player, 1);
    expect(player.pace).toBe("steady");
    cyclePace(player, 1);
    cyclePace(player, 1);
    expect(player.pace).toBe("swift");

    expect(pulseScan(player, world)).toBe(true);
    expect(player.scanCharge).toBe(720_000);
    expect(player.scanPulse).toBe(FIXED_POINT);
    expect(player.discovered[24 * WORLD_WIDTH + 38]).toBeGreaterThan(0);

    player.scanCharge = 279_999;
    expect(pulseScan(player, world)).toBe(false);
    expect(player.scanCharge).toBe(279_999);
  });
});

describe("cargo lifecycle and settlement detection", () => {
  it("maps cargo properties, enforces capacity and exclusivity, then unloads atomically", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    const fragile = offeredContract(world, { id: 91_002, resource: "medicine", quantity: 5 });
    const overweight = offeredContract(world, { id: 91_003, resource: "parts", quantity: 9 });

    expect(loadContractCargo(player, fragile)).toBe(true);
    expect(player.activeContractId).toBe(fragile.id);
    expect(player.cargo).toHaveLength(1);
    expect(player.cargo[0]).toMatchObject({ property: "fragile", condition: FIXED_POINT });
    expect(cargoWeight(player)).toBe(7);
    expect(loadContractCargo(player, overweight)).toBe(false);

    expect(unloadContractCargo(player, -1)).toBeUndefined();
    expect(player.completedJourneys).toBe(0);
    const unloaded = unloadContractCargo(player, fragile.id);
    expect(unloaded?.contractId).toBe(fragile.id);
    expect(player.cargo).toEqual([]);
    expect(player.activeContractId).toBeNull();
    expect(player.completedJourneys).toBe(1);

    expect(loadContractCargo(player, overweight)).toBe(false);
    expect(player.cargo).toEqual([]);
  });

  it("rejects non-offered cargo and reports settlement occupancy exactly", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    const accepted = offeredContract(world, { id: 91_004, status: "accepted" });

    expect(loadContractCargo(player, accepted)).toBe(false);
    expect(settlementAtPlayer(player, world)).toBe(world.settlements[0]?.id ?? null);
    placePlayer(player, 0, 0);
    expect(settlementAtPlayer(player, world)).toBeNull();
  });
});
