import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  LEGACY_WORLD_HEIGHT,
  LEGACY_WORLD_WIDTH,
  STRAND_AUTOMATION_THRESHOLD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createWorld,
  createWorldView,
  type ContractState,
  type TerrainTileView,
  type WorldView,
} from "../sim/public";
import {
  BASE_CARGO_CAPACITY,
  TILE_UNITS,
  cargoWeight,
  createPlayer,
  discoverAround,
  hasFieldTool,
  loadContractCargo,
  playerTileIndex,
  pulseScan,
  restoreSweptPlayer,
  settlementAtPlayer,
  stepPlayer,
  unloadContractCargo,
  unlockFieldToolAtSettlement,
  waterEffortPerStep,
  type PlayerState,
} from "./player";
import { createCraftingInventory } from "./crafting";
import { seedFromText } from "../sim/rng";
import type { LadderKitState, RockField, RockObstacle } from "../sim/rockTraversal";
import { createTraversalFeedbackState } from "./traversalFeedback";

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
  player.currentTrace = [tileY * player.worldWidth + tileX];
  player.surveyTrace = [tileY * player.worldWidth + tileX];
}

function rockObstacle(
  tileIndex: number,
  overrides: Partial<RockObstacle> = {},
): RockObstacle {
  return {
    id: tileIndex + 1,
    formationId: tileIndex + 1,
    tileIndex,
    height: 620_000,
    slope: 580_000,
    severity: "scramble",
    walkingBlocked: false,
    highRisk: true,
    fallRiskPermille: 600,
    travelCostPermille: 1_600,
    ...overrides,
  };
}

function rockField(world: WorldView, obstacle: RockObstacle): RockField {
  return {
    version: 1,
    width: world.terrain.width,
    height: world.terrain.height,
    obstacles: [obstacle],
    formations: [{
      id: obstacle.formationId,
      obstacleIds: [obstacle.id],
      tileIndices: [obstacle.tileIndex],
      minX: obstacle.tileIndex % world.terrain.width,
      minY: Math.floor(obstacle.tileIndex / world.terrain.width),
      maxX: obstacle.tileIndex % world.terrain.width,
      maxY: Math.floor(obstacle.tileIndex / world.terrain.width),
      peakHeight: obstacle.height,
    }],
  };
}

function drySteadyEndurance(
  world: WorldView,
  driftwoodUnits: number,
): { readonly steps: number; readonly firstStepDrain: number } {
  const player = createPlayer(world);
  placePlayer(player, 48, 36);
  player.craftingInventory = createCraftingInventory(
    BASE_CARGO_CAPACITY * 1_000,
    { driftwood: driftwoodUnits },
  );
  let firstStepDrain = 0;
  for (let step = 0; step < 3_000; step += 1) {
    const staminaBefore = player.stamina;
    // Reverse well before either boundary, so every fixed step remains an
    // actual ordinary-ground movement step rather than accidental recovery.
    const direction = Math.floor(step / 250) % 2 === 0 ? 1 : -1;
    const result = stepPlayer(player, world, {
      moveX: direction,
      moveY: 0,
      brace: false,
    });
    if (step === 0) firstStepDrain = staminaBefore - player.stamina;
    if (!result.moved) throw new Error("dry endurance fixture stopped moving before exhaustion");
    if (result.exhausted) return { steps: step + 1, firstStepDrain };
  }
  throw new Error("dry endurance fixture did not exhaust within its measurement window");
}

function legacySizedWorld(): WorldView {
  const generated = controlledWorld();
  const template = generated.terrain.tiles[0];
  if (!template) throw new Error("missing terrain template");
  const tiles = Array.from({ length: LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT }, (_, index) => ({
    ...template,
    index,
    x: index % LEGACY_WORLD_WIDTH,
    y: Math.floor(index / LEGACY_WORLD_WIDTH),
    terrain: "meadow" as const,
    roughness: 0,
    waterDepth: 0,
  }));
  const settlements = generated.settlements.map((settlement, index) => ({
    ...settlement,
    tileIndex: (4 + index * 5) * LEGACY_WORLD_WIDTH + 4 + index * 7,
  }));
  const settlementById = new Map(settlements.map((settlement) => [settlement.id, settlement]));
  const routes = generated.routes.map((route) => {
    const from = settlementById.get(route.fromSettlementId);
    const to = settlementById.get(route.toSettlementId);
    return { ...route, path: from && to ? [from.tileIndex, to.tileIndex] : [] };
  });
  return {
    ...generated,
    terrain: { width: LEGACY_WORLD_WIDTH, height: LEGACY_WORLD_HEIGHT, tiles },
    settlements,
    routes,
  };
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

  it("normalizes diagonal input and permits travel into a low-water channel", () => {
    const waterIndex = 10 * WORLD_WIDTH + 11;
    const world = controlledWorld((tiles) => {
      const water = tiles[waterIndex];
      if (!water) throw new Error("fixture tile missing");
      tiles[waterIndex] = {
        ...water,
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
    expect(result.moved).toBe(true);
    expect(result.enteredTile).toBe(waterIndex);
    expect(player.x).toBeGreaterThan(startingX);
    expect(player.velocityX).toBeGreaterThan(0);

    const staminaBeforeWading = player.stamina;
    stepPlayer(player, world, MOVE_RIGHT);
    expect(player.mode).toBe("wading");
    expect(player.stamina).toBeLessThan(staminaBeforeWading);
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

  it("uses runtime terrain dimensions for legacy-sized worlds and every player index", () => {
    const world = legacySizedWorld();
    const player = createPlayer(world);
    expect(player.worldWidth).toBe(LEGACY_WORLD_WIDTH);
    expect(player.worldHeight).toBe(LEGACY_WORLD_HEIGHT);
    expect(player.discovered).toHaveLength(LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT);
    expect(player.depthSoundings).toHaveLength(LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT);

    placePlayer(player, LEGACY_WORLD_WIDTH - 1, LEGACY_WORLD_HEIGHT - 1);
    player.x = LEGACY_WORLD_WIDTH * TILE_UNITS - TILE_UNITS / 2;
    player.y = LEGACY_WORLD_HEIGHT * TILE_UNITS - TILE_UNITS / 2;
    stepPlayer(player, world, { moveX: 1, moveY: 1, brace: false });
    discoverAround(player, world, 8);
    pulseScan(player, world);

    expect(player.x).toBe(LEGACY_WORLD_WIDTH * TILE_UNITS - TILE_UNITS / 2);
    expect(player.y).toBe(LEGACY_WORLD_HEIGHT * TILE_UNITS - TILE_UNITS / 2);
    expect(playerTileIndex(player)).toBe(LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT - 1);
    expect(player.discovered).toHaveLength(LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT);
    expect(player.depthSoundings).toHaveLength(LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT);
    expect(player.currentTrace.every((index) => index >= 0 && index < world.terrain.tiles.length)).toBe(true);
    expect(player.surveyTrace.every((index) => index >= 0 && index < world.terrain.tiles.length)).toBe(true);
  });

  it("derives steady travel, rest, and swift motion only from a carrying slope", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const downhillIndex = startIndex + 1;
    const world = controlledWorld((tiles) => {
      const start = tiles[startIndex];
      const downhill = tiles[downhillIndex];
      if (!start || !downhill) throw new Error("pace fixture tile missing");
      tiles[startIndex] = { ...start, elevation: 700_000 };
      tiles[downhillIndex] = { ...downhill, elevation: 300_000 };
    });
    const ordinaryWorld = controlledWorld();
    const ordinary = createPlayer(ordinaryWorld);
    placePlayer(ordinary, 10, 10);
    ordinary.pace = "swift";
    stepPlayer(ordinary, ordinaryWorld, MOVE_RIGHT);
    expect(ordinary.pace).toBe("steady");
    stepPlayer(ordinary, ordinaryWorld, NO_INPUT);
    expect(ordinary.pace).toBe("rest");

    const downhill = createPlayer(world);
    placePlayer(downhill, 10, 10);
    stepPlayer(downhill, world, MOVE_RIGHT);
    expect(downhill.pace).toBe("swift");
  });

  it("evaluates an exact-corner diagonal X before Y and binds a second-edge fall to n+1", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const xEdgeIndex = startIndex + 1;
    const finalIndex = xEdgeIndex + WORLD_WIDTH;
    const beyondIndex = startIndex + 2;
    const base = controlledWorld((tiles) => {
      const final = tiles[finalIndex];
      if (!final) throw new Error("diagonal water fixture missing");
      tiles[finalIndex] = {
        ...final,
        terrain: "deep-water",
        waterDepth: 520_000,
        roughness: 0,
      };
    });
    const world: WorldView = {
      ...base,
      settlements: base.settlements.map((settlement, index) => ({
        ...settlement,
        tileIndex: index,
      })),
      routes: [],
    };
    const obstacle = rockObstacle(xEdgeIndex, {
      fallRiskPermille: 300,
      travelCostPermille: 1_300,
    });
    const ladders: LadderKitState = {
      version: 1,
      ladders: [{
        id: 1,
        maxSpan: 3,
        condition: FIXED_POINT,
        deployment: {
          fromTileIndex: startIndex,
          toTileIndex: beyondIndex,
          orientation: "east-west",
          span: 2,
          pathTileIndices: [startIndex, xEdgeIndex, beyondIndex],
          obstacleIds: [obstacle.id],
          formationId: obstacle.formationId,
          support: 930_000,
        },
      }],
    };
    const player = createPlayer(world);
    placePlayer(player, 10, 10, 950);
    player.y = 10 * TILE_UNITS + 950;
    player.previousY = player.y;
    player.stability = 0;
    const result = stepPlayer(
      player,
      world,
      { moveX: 1, moveY: 1, brace: false },
      {
        seed: seedFromText("diagonal ordinal fixture"),
        actorId: 0,
        feedback: createTraversalFeedbackState(),
        rocks: rockField(world, obstacle),
        ladders,
      },
    );

    expect(result.fallEvaluations.map((evaluation) => evaluation.usedTraversalOrdinal))
      .toEqual([0, 1]);
    expect(result.fallEvaluations.map((evaluation) => evaluation.outcome))
      .toEqual(["held", "fell"]);
    expect(result.footingEvaluations).toHaveLength(2);
    expect(result.footingEvaluations[0]?.mitigation.fixture).toBeGreaterThan(0);
    expect(result.footingEvaluations[1]?.mitigation.fixture).toBe(0);
    expect(result.fallEvaluation?.usedTraversalOrdinal).toBe(1);
    expect(result.traversalIncident?.traversalOrdinal).toBe(1);
    expect(result.traversalFeedback?.nextTraversalOrdinal).toBe(2);
    expect(playerTileIndex(player)).toBe(finalIndex);
  });

  it("stops a diagonal after an X-edge fall without entering or assigning Y", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const xEdgeIndex = startIndex + 1;
    const finalIndex = xEdgeIndex + WORLD_WIDTH;
    const world = controlledWorld((tiles) => {
      const xEdge = tiles[xEdgeIndex];
      const final = tiles[finalIndex];
      if (!xEdge || !final) throw new Error("diagonal stop fixture missing");
      tiles[xEdgeIndex] = { ...xEdge, terrain: "ridge", roughness: FIXED_POINT };
      tiles[finalIndex] = { ...final, terrain: "deep-water", waterDepth: 520_000 };
    });
    const player = createPlayer(world);
    placePlayer(player, 10, 10, 950);
    player.y = 10 * TILE_UNITS + 950;
    player.previousY = player.y;
    player.stability = 0;
    const result = stepPlayer(
      player,
      world,
      { moveX: 1, moveY: 1, brace: false },
      {
        seed: seedFromText("diagonal first edge fall"),
        actorId: 0,
        feedback: createTraversalFeedbackState(),
      },
    );

    expect(result.fallEvaluations).toHaveLength(1);
    expect(result.fallEvaluations[0]).toMatchObject({
      outcome: "fell",
      usedTraversalOrdinal: 0,
    });
    expect(result.traversalIncident?.traversalOrdinal).toBe(0);
    expect(result.traversalFeedback?.nextTraversalOrdinal).toBe(1);
    expect(playerTileIndex(player)).toBe(xEdgeIndex);
    expect(playerTileIndex(player)).not.toBe(finalIndex);
  });

  it("uses the same deterministic hazardous-entry result after a pre-entry reload", () => {
    const ridgeIndex = 10 * WORLD_WIDTH + 11;
    const world = controlledWorld((tiles) => {
      const ridge = tiles[ridgeIndex];
      if (!ridge) throw new Error("replay fixture missing");
      tiles[ridgeIndex] = { ...ridge, terrain: "ridge", roughness: FIXED_POINT };
    });
    const before = createPlayer(world);
    placePlayer(before, 10, 10, 950);
    before.stability = 260_000;
    const feedback = createTraversalFeedbackState();
    const run = (player: PlayerState) => stepPlayer(player, world, MOVE_RIGHT, {
      seed: seedFromText("reload cannot reroll"),
      actorId: 0,
      feedback,
    });
    const first = run(structuredClone(before));
    const reloaded = run(structuredClone(before));

    expect(reloaded.fallEvaluation).toEqual(first.fallEvaluation);
    expect(reloaded.traversalIncident).toEqual(first.traversalIncident);
    expect(reloaded.traversalFeedback).toEqual(first.traversalFeedback);
  });

  it("blocks a hazardous edge when the traversal ordinal is exhausted", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const ridgeIndex = startIndex + 1;
    const world = controlledWorld((tiles) => {
      const ridge = tiles[ridgeIndex];
      if (!ridge) throw new Error("ordinal fixture missing");
      tiles[ridgeIndex] = { ...ridge, terrain: "ridge", roughness: FIXED_POINT };
    });
    const player = createPlayer(world);
    placePlayer(player, 10, 10, 950);
    const beforeX = player.x;
    const beforeStability = player.stability;
    const result = stepPlayer(player, world, MOVE_RIGHT, {
      seed: seedFromText("ordinal exhaustion fixture"),
      actorId: 0,
      feedback: {
        ...createTraversalFeedbackState(),
        nextTraversalOrdinal: Number.MAX_SAFE_INTEGER,
      },
    });

    expect(result.moved).toBe(false);
    expect(player.x).toBe(beforeX);
    expect(player.stability).toBe(beforeStability);
    expect(result.fallEvaluation).toMatchObject({
      valid: false,
      outcome: "ordinal-exhausted",
      ordinalExhausted: true,
    });
    expect(result.fallEvaluations).toEqual([]);
    expect(result.traversalFeedback?.nextTraversalOrdinal).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("locks movement during physical fall recovery and keeps its incident identity", () => {
    const ridgeIndex = 10 * WORLD_WIDTH + 11;
    const world = controlledWorld((tiles) => {
      const ridge = tiles[ridgeIndex];
      if (!ridge) throw new Error("recovery fixture missing");
      tiles[ridgeIndex] = { ...ridge, terrain: "ridge", roughness: FIXED_POINT };
    });
    const player = createPlayer(world);
    placePlayer(player, 10, 10, 950);
    player.stability = 0;
    const first = stepPlayer(player, world, MOVE_RIGHT, {
      seed: seedFromText("recovery lock fixture"),
      actorId: 0,
      feedback: createTraversalFeedbackState(),
    });
    if (!first.traversalFeedback || !first.traversalIncident) {
      throw new Error("fixture did not produce a fall incident");
    }
    const lockedX = player.x;
    const lockedY = player.y;
    const locked = stepPlayer(player, world, { moveX: -1, moveY: 0, brace: false }, {
      seed: seedFromText("recovery lock fixture"),
      actorId: 0,
      feedback: first.traversalFeedback,
    });

    expect(locked.moved).toBe(false);
    expect([player.x, player.y]).toEqual([lockedX, lockedY]);
    expect(player.pace).toBe("rest");
    expect(locked.traversalFeedback?.incident?.id).toBe(first.traversalIncident.id);
    expect(locked.traversalFeedback?.incident?.remainingSteps)
      .toBe(first.traversalIncident.remainingSteps - 1);
  });
});

describe("effort, stability, and discovery", () => {
  it("gives an empty porter two-plus minutes of dry steady endurance and curves burden near capacity", () => {
    const world = controlledWorld();
    const empty = drySteadyEndurance(world, 0);
    const halfPack = drySteadyEndurance(world, 5); // 9,000 / 18,000 milli-load
    const fullPack = drySteadyEndurance(world, 10); // 18,000 / 18,000 milli-load

    // Runtime advances this movement kernel ten times per second. Ordinary
    // empty travel therefore lasts at least two continuous minutes.
    expect(empty.steps / 10).toBeGreaterThanOrEqual(120);
    // Equal 9,000-load increments hurt progressively more: the second half of
    // the pack adds more than twice the first half's per-step burden.
    expect(fullPack.firstStepDrain - halfPack.firstStepDrain)
      .toBeGreaterThan((halfPack.firstStepDrain - empty.firstStepDrain) * 2);
    expect(empty.steps).toBeGreaterThan(halfPack.steps * 1.5);
    expect(halfPack.steps).toBeGreaterThan(fullPack.steps * 2);
    expect(fullPack.steps / 10).toBeLessThan(60);
  });

  it("derives steady intent, enters camp on exhaustion, and recovers at rest", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    placePlayer(player, 10, 10);
    player.pace = "swift"; // stale/player-written pace is not authoritative.
    player.stamina = 12_500;

    const exhausted = stepPlayer(player, world, MOVE_RIGHT);
    expect(exhausted.exhausted).toBe(true);
    expect(player.stamina).toBe(0);
    expect(player.mode).toBe("camp");
    expect(player.pace).toBe("rest");
    expect(exhausted.becameSwept).toBe(false);
    expect(exhausted.swept).toBe(false);
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

  it("names live footing causes and makes brace mitigate rather than erase a strong current", () => {
    const roughIndex = 10 * WORLD_WIDTH + 10;
    const world = controlledWorld((tiles) => {
      const rough = tiles[roughIndex];
      if (!rough) throw new Error("fixture tile missing");
      tiles[roughIndex] = {
        ...rough,
        terrain: "deep-water",
        roughness: 900_000,
        waterDepth: 520_000,
      };
    });
    const player = createPlayer(world);
    placePlayer(player, 10, 10);
    player.pace = "swift";
    player.stability = 600_000;

    const beforeUnbraced = player.stability;
    stepPlayer(player, world, MOVE_RIGHT);
    const unbracedLoss = beforeUnbraced - player.stability;
    expect(player.stabilityTrend).toBe("falling");
    expect(player.stabilityHint).toContain("Footing falling:");
    expect(player.stabilityHint).toContain("deep water");
    expect(player.stabilityHint).toContain("cross-current");
    expect(player.stabilityHint).toContain("BRACE or find support");

    const beforeBraced = player.stability;
    stepPlayer(player, world, { moveX: 1, moveY: 0, brace: true });
    const bracedLoss = beforeBraced - player.stability;
    expect(player.stabilityTrend).toBe("falling");
    expect(bracedLoss).toBeGreaterThan(0);
    expect(bracedLoss).toBeLessThan(unbracedLoss);
    expect(player.stabilityHint).toContain("deep water");
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

  it("makes scans charge-gated and persistent while pace remains simulation-derived", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    placePlayer(player, 30, 24);
    player.discovered.fill(0);

    expect(player.pace).toBe("steady");

    expect(pulseScan(player, world)).toBe(true);
    expect(player.scanCharge).toBe(720_000);
    expect(player.scanPulse).toBe(FIXED_POINT);
    expect(player.discovered[24 * WORLD_WIDTH + 38]).toBeGreaterThan(0);

    player.scanCharge = 279_999;
    expect(pulseScan(player, world)).toBe(false);
    expect(player.scanCharge).toBe(279_999);

    player.mode = "swept";
    player.pace = "rest";
    player.scanCharge = FIXED_POINT;
    expect(player.pace).toBe("rest");
    expect(pulseScan(player, world)).toBe(false);
    expect(player.scanCharge).toBe(FIXED_POINT);
  });

  it("keeps depth unknown through ordinary discovery, then records bathymetry with a scan", () => {
    const world = controlledWorld((tiles) => {
      const sounded = tiles[24 * WORLD_WIDTH + 34];
      if (!sounded) throw new Error("fixture tile missing");
      tiles[24 * WORLD_WIDTH + 34] = { ...sounded, terrain: "deep-water", waterDepth: 520_000 };
    });
    const player = createPlayer(world);
    placePlayer(player, 30, 24);
    player.discovered.fill(0);
    player.depthSoundings.fill(0);
    const soundingIndex = 24 * WORLD_WIDTH + 34;

    discoverAround(player, world, 8);
    expect(player.discovered[soundingIndex]).toBeGreaterThan(0);
    expect(player.depthSoundings[soundingIndex]).toBe(0);

    expect(pulseScan(player, world)).toBe(true);
    expect(player.depthSoundings[soundingIndex]).toBeGreaterThan(0);
    expect(player.depthSoundings[soundingIndex]).toBeLessThanOrEqual(FIXED_POINT);
  });

  it("makes water effort monotone by depth while a tide sail reduces deep-water cost", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    const depths = [0, 40_000, 100_000, 180_000, 300_000, 520_000, FIXED_POINT];
    const plainCosts = depths.map((depth) => waterEffortPerStep(player, depth));
    for (let index = 1; index < plainCosts.length; index += 1) {
      expect(plainCosts[index]).toBeGreaterThanOrEqual(plainCosts[index - 1] ?? 0);
    }
    expect(plainCosts[0]).toBe(0);
    expect(plainCosts.at(-1)).toBeGreaterThan(plainCosts[2] ?? 0);

    player.tools.push("tide-sail");
    expect(waterEffortPerStep(player, 180_000)).toBe(plainCosts[3]);
    expect(waterEffortPerStep(player, 300_000)).toBeLessThan(plainCosts[4] ?? 0);
    expect(waterEffortPerStep(player, 520_000)).toBeLessThan(plainCosts[5] ?? 0);
  });

  it("makes marsh stilts measurably faster and less tiring on marsh ground", () => {
    const marshIndex = 10 * WORLD_WIDTH + 10;
    const world = controlledWorld((tiles) => {
      const marsh = tiles[marshIndex];
      if (!marsh) throw new Error("fixture tile missing");
      tiles[marshIndex] = { ...marsh, terrain: "marsh", waterDepth: 0 };
    });
    const barefoot = createPlayer(world);
    const equipped = createPlayer(world);
    placePlayer(barefoot, 10, 10);
    placePlayer(equipped, 10, 10);
    equipped.tools.push("marsh-stilts");

    const barefootStamina = barefoot.stamina;
    const equippedStamina = equipped.stamina;
    stepPlayer(barefoot, world, MOVE_RIGHT);
    stepPlayer(equipped, world, MOVE_RIGHT);

    expect(equipped.velocityX).toBeGreaterThan(barefoot.velocityX);
    expect(equippedStamina - equipped.stamina).toBeLessThan(barefootStamina - barefoot.stamina);
  });

  it("turns deep-water exhaustion into deterministic drift and a cargo-preserving safe-bank recovery", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const world = controlledWorld((tiles) => {
      const water = tiles[startIndex];
      if (!water) throw new Error("fixture tile missing");
      tiles[startIndex] = { ...water, terrain: "deep-water", waterDepth: 520_000 };
    });
    const makeSweptPlayer = () => {
      const player = createPlayer(world);
      placePlayer(player, 10, 10);
      player.pace = "swift";
      player.stamina = 16_000;
      player.surveyTrace = [startIndex - 2, startIndex - 1, startIndex];
      player.harborTrail = world.settlements.slice(0, 3).map((settlement) => settlement.id);
      player.lastHarborId = player.harborTrail.at(-1) ?? null;
      expect(loadContractCargo(player, offeredContract(world, {
        id: 92_001,
        resource: "parts",
        quantity: 4,
      }))).toBe(true);
      return player;
    };
    const player = makeSweptPlayer();
    const comparison = makeSweptPlayer();

    const swept = stepPlayer(player, world, MOVE_RIGHT);
    stepPlayer(comparison, world, MOVE_RIGHT);
    expect(swept.exhausted).toBe(true);
    expect(swept.becameSwept).toBe(true);
    expect(swept.swept).toBe(true);
    expect(swept.sweepCause).toBe("stamina");
    expect(player.mode).toBe("swept");
    expect(player.cargo[0]).toMatchObject({ quantity: 4, condition: FIXED_POINT - 35_000 });
    expect(player.surveyTrace).toEqual([startIndex]);
    expect(player.harborTrail).toEqual([]);
    expect(player.lastHarborId).toBeNull();
    expect(player.sweepPath.length).toBeGreaterThan(0);
    expect(player.sweepPath).toEqual(comparison.sweepPath);
    expect([1, WORLD_WIDTH]).toContain(Math.abs((player.sweepPath[0] ?? startIndex) - startIndex));
    const initialSweepPath = [...player.sweepPath];
    const weatheredCondition = player.cargo[0]?.condition;

    let washedAshore = false;
    for (let tick = 0; tick < 100 && player.mode === "swept"; tick += 1) {
      const result = stepPlayer(player, world, NO_INPUT);
      washedAshore ||= result.washedAshore;
      if (player.mode === "swept") expect(player.sweepTicksRemaining).toBeGreaterThan(0);
    }
    expect(initialSweepPath).not.toHaveLength(0);
    expect(washedAshore).toBe(true);
    expect(player.mode).toBe("camp");
    expect(player.stamina).toBeGreaterThan(0);
    expect(player.pace).toBe("rest");
    expect(world.terrain.tiles[playerTileIndex(player)]?.waterDepth).toBeLessThanOrEqual(55_000);
    expect(player.cargo).toHaveLength(1);
    expect(player.cargo[0]?.quantity).toBe(4);
    expect(player.cargo[0]?.condition).toBe(weatheredCondition);
    expect(player.surveyTrace).toEqual([playerTileIndex(player)]);
    expect(player.harborTrail).toEqual([]);

    // Touch routing has no pace selector. The first intended step after a
    // sweep must therefore move at steady pace and spend the restored stamina,
    // including when the player immediately turns back into the same channel.
    const bankTile = world.terrain.tiles[playerTileIndex(player)];
    const channelTile = world.terrain.tiles[startIndex];
    if (!bankTile || !channelTile) throw new Error("sweep fixture lost its bank or channel");
    const returnControl = {
      moveX: Math.sign(channelTile.x - bankTile.x) as -1 | 0 | 1,
      moveY: Math.sign(channelTile.y - bankTile.y) as -1 | 0 | 1,
      brace: false,
    };
    const shoreStamina = player.stamina;
    const firstReturnStep = stepPlayer(player, world, returnControl);
    expect(firstReturnStep.moved).toBe(true);
    expect(player.stamina).toBeLessThan(shoreStamina);

    for (let tick = 0; tick < 12 && playerTileIndex(player) !== startIndex; tick += 1) {
      stepPlayer(player, world, returnControl);
    }
    expect(playerTileIndex(player)).toBe(startIndex);
    expect(player.stamina).toBeLessThan(shoreStamina);
  });

  it("turns zero stability in deep water into the same deterministic sweep while stamina remains", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const world = controlledWorld((tiles) => {
      const water = tiles[startIndex];
      if (!water) throw new Error("fixture tile missing");
      tiles[startIndex] = {
        ...water,
        terrain: "deep-water",
        roughness: FIXED_POINT,
        waterDepth: 520_000,
      };
    });
    const makeUnstablePlayer = () => {
      const player = createPlayer(world);
      placePlayer(player, 10, 10);
      player.pace = "swift";
      player.stamina = FIXED_POINT;
      player.stability = 1;
      expect(loadContractCargo(player, offeredContract(world, {
        id: 92_002,
        resource: "parts",
        quantity: 4,
      }))).toBe(true);
      return player;
    };
    const player = makeUnstablePlayer();
    const comparison = makeUnstablePlayer();

    const swept = stepPlayer(player, world, MOVE_RIGHT);
    const comparisonSweep = stepPlayer(comparison, world, MOVE_RIGHT);

    expect(swept.exhausted).toBe(false);
    expect(player.stamina).toBeGreaterThan(0);
    expect(player.stability).toBe(0);
    expect(swept).toMatchObject({
      becameSwept: true,
      swept: true,
      sweepCause: "stability",
    });
    expect(player.mode).toBe("swept");
    expect(player.sweepPath).toEqual(comparison.sweepPath);
    expect(comparisonSweep.sweepCause).toBe("stability");
    expect(player.cargo[0]?.quantity).toBe(4);

    const conditionAfterLoss = player.cargo[0]?.condition;
    const drift = stepPlayer(player, world, NO_INPUT);
    expect(drift.swept).toBe(true);
    expect(drift.sweepCause).toBeNull();
    expect(player.cargo[0]).toMatchObject({
      quantity: 4,
      condition: conditionAfterLoss,
    });
  });

  it("cannot cancel an already-zero deep-water stability failure with same-step stillness recovery", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const world = controlledWorld((tiles) => {
      const water = tiles[startIndex];
      if (!water) throw new Error("fixture tile missing");
      tiles[startIndex] = { ...water, terrain: "deep-water", waterDepth: 520_000 };
    });
    const player = createPlayer(world);
    placePlayer(player, 10, 10);
    player.stamina = FIXED_POINT;
    player.stability = 0;

    const swept = stepPlayer(player, world, NO_INPUT);

    expect(swept.exhausted).toBe(false);
    expect(swept.becameSwept).toBe(true);
    expect(swept.sweepCause).toBe("stability");
    expect(player.mode).toBe("swept");
    expect(player.stability).toBe(0);
  });

  it("lets zero stability recover on dry ground while shallow current remains escapable", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    for (const waterDepth of [0, 119_999]) {
      const world = controlledWorld((tiles) => {
        const tile = tiles[startIndex];
        if (!tile) throw new Error("fixture tile missing");
        tiles[startIndex] = {
          ...tile,
          terrain: waterDepth === 0 ? "meadow" : "tidal-flat",
          waterDepth,
        };
      });
      const player = createPlayer(world);
      placePlayer(player, 10, 10);
      player.stamina = FIXED_POINT;
      player.stability = 0;

      const recovering = stepPlayer(player, world, NO_INPUT);

      expect(recovering.exhausted).toBe(false);
      expect(recovering.becameSwept).toBe(false);
      expect(recovering.swept).toBe(false);
      expect(recovering.sweepCause).toBeNull();
      expect(player.mode).not.toBe("swept");
      if (waterDepth === 0) {
        expect(player.stability).toBeGreaterThan(0);
        expect(player.stabilityTrend).toBe("recovering");
      } else {
        expect(player.stability).toBe(0);
        expect(stepPlayer(player, world, MOVE_RIGHT).moved).toBe(true);
      }
    }
  });

  it("rebuilds a saved sweep as an adjacent route with an honest fresh estimate", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const world = controlledWorld((tiles) => {
      const water = tiles[startIndex];
      if (!water) throw new Error("fixture tile missing");
      tiles[startIndex] = { ...water, terrain: "deep-water", waterDepth: 520_000 };
    });
    const player = createPlayer(world);
    placePlayer(player, 10, 10, 790);
    player.mode = "swept";
    player.pace = "swift";
    player.sweepPath = [WORLD_WIDTH * 40 + 60];
    player.sweepTicksRemaining = 0;
    player.sweepTotalTicks = 0;

    expect(restoreSweptPlayer(player, world)).toBe(true);
    expect(player.pace).toBe("rest");
    expect(player.sweepPath).not.toEqual([WORLD_WIDTH * 40 + 60]);
    expect([1, WORLD_WIDTH]).toContain(Math.abs((player.sweepPath[0] ?? startIndex) - startIndex));
    expect(player.sweepTicksRemaining).toBe(player.sweepTotalTicks);
    expect(player.sweepTicksRemaining).toBeGreaterThan(0);
  });

  it("replots instead of declaring an unsafe bank when the tide floods the target", () => {
    const startIndex = 10 * WORLD_WIDTH + 10;
    const world = controlledWorld((tiles) => {
      const water = tiles[startIndex];
      if (!water) throw new Error("fixture tile missing");
      tiles[startIndex] = { ...water, terrain: "deep-water", waterDepth: 520_000 };
    });
    const player = createPlayer(world);
    placePlayer(player, 10, 10);
    player.pace = "swift";
    player.stamina = 16_000;

    expect(stepPlayer(player, world, MOVE_RIGHT).becameSwept).toBe(true);
    const floodedBankIndex = player.sweepPath.at(-1);
    if (floodedBankIndex === undefined) throw new Error("fixture did not find a first bank");
    const floodedBank = world.terrain.tiles[floodedBankIndex];
    if (!floodedBank) throw new Error("fixture bank is missing");
    floodedBank.terrain = "deep-water";
    floodedBank.waterDepth = 520_000;

    let visitedFloodedBankWhileSwept = false;
    for (let tick = 0; tick < 120 && player.mode === "swept"; tick += 1) {
      const result = stepPlayer(player, world, NO_INPUT);
      if (playerTileIndex(player) === floodedBankIndex) {
        visitedFloodedBankWhileSwept ||= result.swept;
        expect(result.washedAshore).toBe(false);
      }
    }

    expect(visitedFloodedBankWhileSwept).toBe(true);
    expect(player.mode).toBe("camp");
    expect(playerTileIndex(player)).not.toBe(floodedBankIndex);
    expect(world.terrain.tiles[playerTileIndex(player)]?.waterDepth).toBeLessThanOrEqual(55_000);
  });

  it("lets a completed clinic on an active strand rescue exhaustion before a sweep begins", () => {
    const base = controlledWorld();
    const route = base.routes[0];
    if (!route) throw new Error("missing route");
    const routeTileIndex = route.path[0];
    if (routeTileIndex === undefined) throw new Error("missing route path");
    const routeTile = base.terrain.tiles[routeTileIndex];
    if (!routeTile) throw new Error("missing route tile");
    const world: WorldView = {
      ...base,
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => tile.index === routeTileIndex
          ? { ...tile, terrain: "deep-water", waterDepth: 520_000 }
          : tile),
      },
      routes: base.routes.map((candidate) => candidate.id === route.id
        ? { ...candidate, traceStrength: STRAND_AUTOMATION_THRESHOLD }
        : candidate),
      settlements: base.settlements.map((settlement) => settlement.id === route.fromSettlementId
        ? { ...settlement, project: { ...settlement.project, kind: "clinic", status: "complete" } }
        : settlement),
    };
    const player = createPlayer(world, route.fromSettlementId);
    placePlayer(player, routeTile.x, routeTile.y);
    player.pace = "swift";
    player.stamina = 16_000;

    const result = stepPlayer(player, world, MOVE_RIGHT);
    expect(result.exhausted).toBe(true);
    expect(result.rescued).toBe(true);
    expect(result.becameSwept).toBe(false);
    expect(result.sweepSupport).toBe("clinic");
    expect(player.mode).toBe("rescued");
    expect(player.sweepPath).toEqual([]);
    expect(player.stamina).toBe(160_000);
    expect(player.rescues).toBe(1);
  });

  it("unlocks civic field tools by completed project exactly once", () => {
    const base = controlledWorld();
    const projectKinds = ["crossing", "ferry", "beacon", "clinic", "cache"] as const;
    const settlements = base.settlements.map((settlement, index) => ({
      ...settlement,
      project: {
        ...settlement.project,
        kind: projectKinds[index] ?? settlement.project.kind,
        status: index < projectKinds.length ? "complete" as const : settlement.project.status,
      },
    }));
    const world: WorldView = { ...base, settlements };
    const player = createPlayer(world, settlements[0]?.id);
    const ids = settlements.slice(0, projectKinds.length).map((settlement) => settlement.id);

    expect(player.tools).toEqual(["sounding-line"]);
    expect(unlockFieldToolAtSettlement(player, world, ids[0] ?? -1)).toBe("marsh-stilts");
    expect(unlockFieldToolAtSettlement(player, world, ids[1] ?? -1)).toBe("tide-sail");
    expect(unlockFieldToolAtSettlement(player, world, ids[2] ?? -1)).toBe("storm-kite");
    expect(unlockFieldToolAtSettlement(player, world, ids[3] ?? -1)).toBeNull();
    expect(unlockFieldToolAtSettlement(player, world, ids[4] ?? -1)).toBeNull();
    expect(unlockFieldToolAtSettlement(player, world, ids[0] ?? -1)).toBeNull();
    expect(hasFieldTool(player, "marsh-stilts")).toBe(true);
    expect(hasFieldTool(player, "tide-sail")).toBe(true);
    expect(hasFieldTool(player, "storm-kite")).toBe(true);
    expect(new Set(player.tools).size).toBe(player.tools.length);
  });
});

describe("cargo lifecycle and settlement detection", () => {
  it("maps cargo properties, enforces capacity and exclusivity, then unloads atomically", () => {
    const world = controlledWorld();
    const player = createPlayer(world);
    const fragile = offeredContract(world, { id: 91_002, resource: "medicine", quantity: 5 });
    const overweight = offeredContract(world, { id: 91_003, resource: "parts", quantity: 10 });

    expect(player.cargoCapacity).toBe(BASE_CARGO_CAPACITY);
    expect(player.craftingInventory.capacityMilliLoad).toBe(18_000);

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
