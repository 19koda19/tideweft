import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  type TerrainTileView,
  type WorldView,
} from "../sim/public";
import {
  CRAFTING_CONDITION_MAX,
  CRAFTING_RECIPES,
  craft,
  createCraftingInventory,
  type CraftedGearItem,
  type CraftedGearKind,
  type CraftingInventory,
  type CraftingStackId,
} from "./crafting";
import {
  TILE_UNITS,
  createPlayer,
  stepPlayer,
  waterEffortPerStep,
  type PlayerState,
} from "./player";

const NO_INPUT = { moveX: 0, moveY: 0, brace: false } as const;
const MOVE_RIGHT = { moveX: 1, moveY: 0, brace: false } as const;
const TEST_X = 10;
const TEST_Y = 10;

function controlledWorld(
  editTiles?: (tiles: TerrainTileView[], width: number) => void,
  weather: Partial<WorldView["weather"]> = {},
): WorldView {
  const generated = createWorldView(createWorld("carried gear player integration", "calm"));
  const tiles = generated.terrain.tiles.map((tile) => ({
    ...tile,
    terrain: "meadow" as const,
    roughness: 0,
    waterDepth: 0,
  }));
  editTiles?.(tiles, generated.terrain.width);
  return {
    ...generated,
    // Keep civic-project and route support out of these movement fixtures.
    settlements: generated.settlements.map((settlement, index) => ({
      ...settlement,
      tileIndex: index,
    })),
    routes: [],
    weather: {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: generated.completedTick + 1_000,
      ...weather,
    },
    terrain: { ...generated.terrain, tiles },
  };
}

function placePlayer(player: PlayerState, offsetX = TILE_UNITS / 2): void {
  const tileIndex = TEST_Y * player.worldWidth + TEST_X;
  player.x = TEST_X * TILE_UNITS + offsetX;
  player.y = TEST_Y * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.currentTrace = [tileIndex];
  player.surveyTrace = [tileIndex];
}

function setTerrainPair(
  tiles: TerrainTileView[],
  width: number,
  terrain: "marsh" | "ridge",
  roughness = FIXED_POINT,
): void {
  for (const x of [TEST_X, TEST_X + 1]) {
    const index = TEST_Y * width + x;
    const tile = tiles[index];
    if (!tile) throw new Error("gear fixture tile is missing");
    tiles[index] = { ...tile, terrain, roughness, waterDepth: 0 };
  }
}

function craftedGearInventory(kind: CraftedGearKind, gearId: number): CraftingInventory {
  const recipe = CRAFTING_RECIPES.find((candidate) =>
    candidate.output.type === "gear" && candidate.output.kind === kind);
  if (!recipe) throw new Error(`missing gear recipe for ${kind}`);
  const stacks: Partial<Record<CraftingStackId, number>> = {};
  for (const input of recipe.inputs) {
    stacks[input.item] = (stacks[input.item] ?? 0) + input.quantity;
  }
  const result = craft(
    createCraftingInventory(16_000, stacks),
    { recipeId: recipe.id, gearId },
  );
  if (!result.ok) throw new Error(`fixture could not craft ${kind}: ${result.reason}`);
  return result.inventory;
}

function inventoryWithGear(gear: readonly CraftedGearItem[]): CraftingInventory {
  return createCraftingInventory(16_000, {}, gear);
}

function conditionOf(player: PlayerState, gearId: number): number {
  const gear = player.craftingInventory.gear.find((candidate) => candidate.id === gearId);
  if (!gear) throw new Error(`missing carried gear ${gearId}`);
  return gear.condition;
}

describe("crafted carried gear in player movement", () => {
  it("uses a crafted float sash for lower water effort without defeating a zero-meter sweep", () => {
    const world = controlledWorld((tiles, width) => {
      const water = tiles[TEST_Y * width + TEST_X];
      if (!water) throw new Error("water fixture tile is missing");
      tiles[TEST_Y * width + TEST_X] = {
        ...water,
        terrain: "deep-water",
        roughness: 0,
        waterDepth: 520_000,
      };
    });
    const startIndex = TEST_Y * world.terrain.width + TEST_X;
    const barefoot = createPlayer(world);
    const equipped = createPlayer(world);
    placePlayer(barefoot);
    placePlayer(equipped);
    equipped.craftingInventory = craftedGearInventory("float-sash", 41);

    expect(waterEffortPerStep(barefoot, 520_000)).toBe(3_000);
    expect(waterEffortPerStep(equipped, 520_000)).toBe(2_400);

    equipped.stamina = 0;
    const xBefore = equipped.x;
    const conditionBefore = conditionOf(equipped, 41);
    const result = stepPlayer(equipped, world, NO_INPUT);

    expect(result).toMatchObject({
      moved: false,
      enteredTile: null,
      exhausted: true,
      becameSwept: true,
      sweepCause: "stamina",
    });
    expect(equipped.x).toBe(xBefore);
    expect(equipped.mode).toBe("swept");
    expect(equipped.currentTrace).toEqual([startIndex]);
    expect(conditionOf(equipped, 41)).toBe(conditionBefore);
  });

  it("makes crafted marsh wraps improve movement and footing, wearing 8k only on entry", () => {
    const world = controlledWorld((tiles, width) => {
      setTerrainPair(tiles, width, "marsh");
    });
    const barefoot = createPlayer(world);
    const equipped = createPlayer(world);
    placePlayer(barefoot);
    placePlayer(equipped);
    equipped.craftingInventory = craftedGearInventory("marsh-wraps", 51);

    stepPlayer(barefoot, world, MOVE_RIGHT);
    stepPlayer(equipped, world, MOVE_RIGHT);

    expect(equipped.velocityX).toBeGreaterThan(barefoot.velocityX);
    expect(equipped.stability).toBeGreaterThan(barefoot.stability);
    expect(conditionOf(equipped, 51)).toBe(CRAFTING_CONDITION_MAX);

    placePlayer(equipped, 950);
    const entry = stepPlayer(equipped, world, MOVE_RIGHT);
    expect(entry.enteredTile).toBe(TEST_Y * world.terrain.width + TEST_X + 1);
    expect(conditionOf(equipped, 51)).toBe(CRAFTING_CONDITION_MAX - 8_000);

    const conditionAfterEntry = conditionOf(equipped, 51);
    expect(stepPlayer(equipped, world, MOVE_RIGHT).enteredTile).toBeNull();
    expect(conditionOf(equipped, 51)).toBe(conditionAfterEntry);
  });

  it("makes crafted ridge cleats improve ridge traversal and wear 12k only on entry", () => {
    const world = controlledWorld((tiles, width) => {
      setTerrainPair(tiles, width, "ridge");
    });
    const barefoot = createPlayer(world);
    const equipped = createPlayer(world);
    placePlayer(barefoot);
    placePlayer(equipped);
    equipped.craftingInventory = craftedGearInventory("ridge-cleats", 61);

    stepPlayer(barefoot, world, MOVE_RIGHT);
    stepPlayer(equipped, world, MOVE_RIGHT);

    expect(equipped.velocityX).toBeGreaterThan(barefoot.velocityX);
    expect(equipped.stability).toBeGreaterThan(barefoot.stability);
    expect(conditionOf(equipped, 61)).toBe(CRAFTING_CONDITION_MAX);

    placePlayer(equipped, 950);
    const entry = stepPlayer(equipped, world, MOVE_RIGHT);
    expect(entry.enteredTile).toBe(TEST_Y * world.terrain.width + TEST_X + 1);
    expect(conditionOf(equipped, 61)).toBe(CRAFTING_CONDITION_MAX - 12_000);

    const conditionAfterEntry = conditionOf(equipped, 61);
    expect(stepPlayer(equipped, world, MOVE_RIGHT).enteredTile).toBeNull();
    expect(conditionOf(equipped, 61)).toBe(conditionAfterEntry);
  });

  it("lets a crafted weather cape soften gust stress and wear 6k only on exposed entry", () => {
    const world = controlledWorld(undefined, {
      kind: "storm",
      intensity: 400_000,
      windX: 300_000,
      windY: -200_000,
    });
    const bare = createPlayer(world);
    const sheltered = createPlayer(world);
    placePlayer(bare);
    placePlayer(sheltered);
    sheltered.craftingInventory = craftedGearInventory("weather-cape", 71);

    stepPlayer(bare, world, MOVE_RIGHT);
    stepPlayer(sheltered, world, MOVE_RIGHT);

    expect(sheltered.stability).toBeGreaterThan(bare.stability);
    expect(conditionOf(sheltered, 71)).toBe(CRAFTING_CONDITION_MAX);

    placePlayer(sheltered, 950);
    const entry = stepPlayer(sheltered, world, MOVE_RIGHT);
    expect(entry.enteredTile).toBe(TEST_Y * world.terrain.width + TEST_X + 1);
    expect(conditionOf(sheltered, 71)).toBe(CRAFTING_CONDITION_MAX - 6_000);

    const conditionAfterEntry = conditionOf(sheltered, 71);
    expect(stepPlayer(sheltered, world, MOVE_RIGHT).enteredTile).toBeNull();
    expect(conditionOf(sheltered, 71)).toBe(conditionAfterEntry);
  });

  it("ignores broken gear and charges only the lowest-ID sound duplicate", () => {
    const world = controlledWorld((tiles, width) => {
      setTerrainPair(tiles, width, "marsh");
    });
    const broken = createPlayer(world);
    const sound = createPlayer(world);
    placePlayer(broken);
    placePlayer(sound);
    broken.craftingInventory = inventoryWithGear([
      { id: 81, kind: "marsh-wraps", condition: 0 },
    ]);
    sound.craftingInventory = inventoryWithGear([
      { id: 81, kind: "marsh-wraps", condition: CRAFTING_CONDITION_MAX },
    ]);

    stepPlayer(broken, world, MOVE_RIGHT);
    stepPlayer(sound, world, MOVE_RIGHT);

    expect(sound.velocityX).toBeGreaterThan(broken.velocityX);
    expect(sound.stability).toBeGreaterThan(broken.stability);
    expect(conditionOf(broken, 81)).toBe(0);

    const duplicates = createPlayer(world);
    placePlayer(duplicates, 950);
    duplicates.craftingInventory = inventoryWithGear([
      { id: 93, kind: "marsh-wraps", condition: CRAFTING_CONDITION_MAX },
      { id: 12, kind: "marsh-wraps", condition: 0 },
      { id: 27, kind: "marsh-wraps", condition: CRAFTING_CONDITION_MAX },
    ]);

    expect(stepPlayer(duplicates, world, MOVE_RIGHT).enteredTile).not.toBeNull();
    expect(conditionOf(duplicates, 12)).toBe(0);
    expect(conditionOf(duplicates, 27)).toBe(CRAFTING_CONDITION_MAX - 8_000);
    expect(conditionOf(duplicates, 93)).toBe(CRAFTING_CONDITION_MAX);
  });
});
