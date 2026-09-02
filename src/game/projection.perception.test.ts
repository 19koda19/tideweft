import { describe, expect, it } from "vitest";

import {
  createFieldResourceEcologyState,
  createWorld,
  createWorldView,
  FIXED_POINT,
  generateFieldResourceCatalog,
} from "../sim/public";
import { TILE_UNITS, createPlayer, playerTileIndex } from "./player";
import {
  PERCEPTION_VERSION,
  VISIBILITY_DIRECT,
  type PerceptionResult,
} from "./perception";
import { projectGameView, projectPerception } from "./projection";

describe("shared projection perception cache", () => {
  it("reuses a stationary snapshot and invalidates on the sensory keys", () => {
    const world = createWorldView(createWorld("still eyes over black water", "standard"));
    const player = createPlayer(world);

    const first = projectPerception(world, player);
    expect(projectPerception(world, player)).toBe(first);

    player.facingMilliRadians += 125;
    const turned = projectPerception(world, player);
    expect(turned).not.toBe(first);
    expect(projectPerception(world, player)).toBe(turned);

    const changedWeather = {
      ...world,
      // Preserve the static terrain array to exercise the sensory result cache
      // rather than rebuilding its obstruction cells.
      weather: {
        ...world.weather,
        intensity: Math.min(1_000_000, world.weather.intensity + 100_000),
      },
    };
    const obscured = projectPerception(changedWeather, player);
    expect(obscured).not.toBe(turned);
    expect(projectPerception(changedWeather, player)).toBe(obscured);
  });

  it("projects broad terrain ahead without disclosing distant entities or live metadata", () => {
    const state = createWorld("a long view with private details", "standard");
    const world = createWorldView(state);
    const player = createPlayer(world);
    player.discovered.fill(FIXED_POINT);
    const count = world.terrain.tiles.length;
    const playerIndex = playerTileIndex(player);
    const visibilityGrades = new Uint8Array(count);
    visibilityGrades.fill(VISIBILITY_DIRECT);
    const terrainVisibilityStrengths = new Uint8Array(count);
    terrainVisibilityStrengths.fill(255);
    const detailVisibilityGrades = new Uint8Array(count);
    detailVisibilityGrades[playerIndex] = VISIBILITY_DIRECT;
    const perception: PerceptionResult = {
      version: PERCEPTION_VERSION,
      valid: true,
      visibilityGrades,
      terrainVisibilityStrengths,
      visibleTileIndices: Array.from({ length: count }, (_, index) => index),
      directTileIndices: Array.from({ length: count }, (_, index) => index),
      peripheralTileIndices: [],
      detailVisibilityGrades,
      detailVisibleTileIndices: [playerIndex],
      detailDirectTileIndices: [playerIndex],
      detailPeripheralTileIndices: [],
      playerTileIndex: playerIndex,
      signature: projectPerception(world, player).signature,
    };
    const catalog = generateFieldResourceCatalog(state.meta.rootSeed, state.terrain);
    const projected = projectGameView(world, player, {
      perception,
      fieldResourceCatalog: catalog,
      fieldResourceEcology: createFieldResourceEcologyState(world.completedTick),
    });
    const distantSettlement = world.settlements.find(
      (settlement) => settlement.tileIndex !== playerIndex,
    );
    if (!distantSettlement) throw new Error("fixture needs a distant settlement");

    expect(projected.terrain.tiles[distantSettlement.tileIndex]).toMatchObject({
      currentVisibility: 1,
      currentDetailVisibility: 0,
    });
    expect(projected.settlements.find(({ id }) => id === String(distantSettlement.id)))
      .toMatchObject({ currentVisibility: 0 });
    expect(projected.fieldResources.filter(({ currentVisibility }) => currentVisibility === 1))
      .toEqual([]);
    expect(projected.fieldResources.every((node) => !Object.hasOwn(node, "stockUnits")))
      .toBe(true);
    expect(projected.porters).toEqual([]);
    expect(projected.events?.every((event) => {
      if (!event.position) return true;
      const column = Math.floor(event.position.x / projected.terrain.tileSize);
      const row = Math.floor(event.position.y / projected.terrain.tileSize);
      return projected.terrain.tiles[row * projected.terrain.columns + column]
        ?.currentDetailVisibility === 1;
    })).toBe(true);
    expect(projected.perception).toMatchObject({
      visibleTileCount: count,
      detailVisibleTileCount: 1,
      detailDirectTileCount: 1,
    });
  });

  it("projects eased terrain strength without widening the authoritative detail mask", () => {
    const world = createWorldView(createWorld("soft sight stays honest", "standard"));
    const player = createPlayer(world);
    const count = world.terrain.tiles.length;
    const playerIndex = playerTileIndex(player);
    const nearbyIndex = playerIndex + 1;
    const visibilityGrades = new Uint8Array(count);
    const terrainVisibilityStrengths = new Uint8Array(count);
    const detailVisibilityGrades = new Uint8Array(count);
    visibilityGrades[playerIndex] = VISIBILITY_DIRECT;
    visibilityGrades[nearbyIndex] = VISIBILITY_DIRECT;
    terrainVisibilityStrengths[playerIndex] = 255;
    terrainVisibilityStrengths[nearbyIndex] = 77;
    detailVisibilityGrades[playerIndex] = VISIBILITY_DIRECT;
    const perception: PerceptionResult = {
      version: PERCEPTION_VERSION,
      valid: true,
      visibilityGrades,
      terrainVisibilityStrengths,
      visibleTileIndices: [playerIndex, nearbyIndex],
      directTileIndices: [playerIndex, nearbyIndex],
      peripheralTileIndices: [],
      detailVisibilityGrades,
      detailVisibleTileIndices: [playerIndex],
      detailDirectTileIndices: [playerIndex],
      detailPeripheralTileIndices: [],
      playerTileIndex: playerIndex,
      signature: projectPerception(world, player).signature,
    };
    const projected = projectGameView(world, player, { perception });
    expect(projected.terrain.tiles[nearbyIndex]?.currentVisibility).toBeCloseTo(77 / 255);
    expect(projected.terrain.tiles[nearbyIndex]?.currentDetailVisibility).toBe(0);
  });

  it("rejects a same-sized perception snapshot after the player has moved", () => {
    const world = createWorldView(createWorld("old eyes cannot see for new feet", "standard"));
    const player = createPlayer(world);
    const stale = projectPerception(world, player);
    const staleIndex = stale.playerTileIndex;
    const destination = world.terrain.tiles.find((tile) =>
      Math.hypot(
        tile.x - (staleIndex % world.terrain.width),
        tile.y - Math.floor(staleIndex / world.terrain.width),
      ) > 12
    );
    if (!destination) throw new Error("fixture needs a distant tile");
    player.x = destination.x * TILE_UNITS + TILE_UNITS / 2;
    player.y = destination.y * TILE_UNITS + TILE_UNITS / 2;
    const current = projectPerception(world, player);
    const projected = projectGameView(world, player, { perception: stale });

    expect(projected.perception?.signature).toBe(current.signature);
    expect(projected.perception?.signature).not.toBe(stale.signature);
    expect(projected.terrain.tiles[current.playerTileIndex]?.currentDetailVisibility).toBe(1);
    expect(projected.terrain.tiles[staleIndex]?.currentDetailVisibility).not.toBe(1);
  });
});
