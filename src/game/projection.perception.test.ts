import { describe, expect, it } from "vitest";

import {
  FIELD_RESOURCE_LIVING_RESERVE_UNITS,
  createFieldResourceEcologyState,
  createWorld,
  createWorldView,
  FIXED_POINT,
  generateFieldResourceCatalog,
} from "../sim/public";
import { createCraftingInventory } from "./crafting";
import {
  LOOSE_CARGO_TILE_UNITS,
  createLooseCargoCarrier,
  createLooseCargoWorld,
  dropLooseCargo,
} from "./looseCargo";
import { TILE_UNITS, createPlayer, playerTileIndex } from "./player";
import {
  VISIBILITY_DIRECT,
} from "./perception";
import {
  isCurrentPerceptionSnapshot,
  projectGameView,
  projectPerception,
} from "./projection";

const LOCAL_PORTER = { kind: "player", id: "local-porter" } as const;

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

  it("repairs a mutated cached detail mask before it can disclose a hidden actor", () => {
    const state = createWorld("the cached horizon cannot be rewritten", "standard");
    const initialWorld = createWorldView(state);
    const player = createPlayer(initialWorld);
    player.facingMilliRadians = 0;
    const initialPerception = projectPerception(initialWorld, player);
    const targetIndex = initialPerception.terrainVisibilityStrengths.findIndex((strength, index) =>
      strength > 0 && initialPerception.detailVisibilityGrades[index] === 0
    );
    if (targetIndex < 0) throw new Error("fixture needs a broad-visible detail-hidden tile");

    const route = state.routes[0];
    const resident = state.residents[0];
    if (!route || !resident) throw new Error("fixture needs a route porter");
    route.path = [targetIndex];
    resident.location = { kind: "route", routeId: route.id, progress: 0 };
    resident.intention = "carry";

    const world = createWorldView(state);
    const cached = projectPerception(world, player);
    expect(cached.terrainVisibilityStrengths[targetIndex]).toBeGreaterThan(0);
    expect(cached.detailVisibilityGrades[targetIndex]).toBe(0);
    expect(Object.isFrozen(cached)).toBe(true);
    for (const indices of [
      cached.visibleTileIndices,
      cached.directTileIndices,
      cached.peripheralTileIndices,
      cached.detailVisibleTileIndices,
      cached.detailDirectTileIndices,
      cached.detailPeripheralTileIndices,
    ]) {
      expect(Object.isFrozen(indices)).toBe(true);
    }

    const authoritativeSignature = cached.signature;
    cached.detailVisibilityGrades[targetIndex] = VISIBILITY_DIRECT;
    expect(cached.detailVisibilityGrades[targetIndex]).toBe(VISIBILITY_DIRECT);
    const repaired = projectPerception(world, player);

    expect(repaired).not.toBe(cached);
    expect(repaired.signature).toBe(authoritativeSignature);
    expect(repaired.detailVisibilityGrades[targetIndex]).toBe(0);
    expect(projectPerception(world, player)).toBe(repaired);

    const projected = projectGameView(world, player, { perception: cached });
    expect(projected.terrain.tiles[targetIndex]?.currentVisibility).toBeGreaterThan(0);
    expect(projected.terrain.tiles[targetIndex]?.currentDetailVisibility).toBe(0);
    expect(projected.porters.some(({ id }) => id === String(resident.id))).toBe(false);
    expect(projected.perception?.signature).toBe(repaired.signature);
  });

  it("projects broad terrain ahead without disclosing distant entities or live metadata", () => {
    const state = createWorld("a long view with private details", "standard");
    const initialWorld = createWorldView(state);
    const player = createPlayer(initialWorld);
    player.discovered.fill(FIXED_POINT);
    const playerIndex = playerTileIndex(player);
    const playerTile = initialWorld.terrain.tiles[playerIndex];
    if (!playerTile) throw new Error("fixture lost the player tile");
    const settlementTiles = new Set(initialWorld.settlements.map(({ tileIndex }) => tileIndex));
    const catalog = generateFieldResourceCatalog(state.meta.rootSeed, state.terrain);
    let targetNode: (typeof catalog.nodes)[number] | undefined;
    let authoritativePerception = projectPerception(initialWorld, player);
    for (const node of catalog.nodes) {
      const tile = initialWorld.terrain.tiles[node.tileIndex];
      if (
        !tile
        || settlementTiles.has(node.tileIndex)
        || node.capacityUnits <= FIELD_RESOURCE_LIVING_RESERVE_UNITS
      ) continue;
      const deltaX = tile.x - playerTile.x;
      const deltaY = tile.y - playerTile.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance <= 11 || distance > 26) continue;
      player.facingMilliRadians = Math.round(Math.atan2(deltaY, deltaX) * 1_000);
      const candidatePerception = projectPerception(initialWorld, player);
      if (
        (candidatePerception.terrainVisibilityStrengths[node.tileIndex] ?? 0) > 0
        && candidatePerception.detailVisibilityGrades[node.tileIndex] === 0
      ) {
        targetNode = node;
        authoritativePerception = candidatePerception;
        break;
      }
    }

    if (!targetNode) throw new Error("fixture needs a broad-only field-resource tile");
    const targetTile = initialWorld.terrain.tiles[targetNode.tileIndex];
    if (!targetTile) throw new Error("fixture lost the target tile");
    const route = state.routes[0];
    const resident = state.residents[0];
    if (!route || !resident) throw new Error("fixture needs a route porter");
    route.path = [targetNode.tileIndex];
    resident.location = { kind: "route", routeId: route.id, progress: 0 };
    resident.intention = "carry";

    const world = createWorldView(state);
    const count = world.terrain.tiles.length;
    authoritativePerception = projectPerception(world, player);
    expect(authoritativePerception.terrainVisibilityStrengths[targetNode.tileIndex]).toBeGreaterThan(0);
    expect(authoritativePerception.detailVisibilityGrades[targetNode.tileIndex]).toBe(0);
    const dropped = dropLooseCargo(
      createLooseCargoWorld(world.terrain.width, world.terrain.height),
      createLooseCargoCarrier(
        LOCAL_PORTER,
        createCraftingInventory(100_000, { cordreed: 1 }),
      ),
      {
        lotId: "crafting-stack:cordreed",
        quantity: 1,
        x: targetTile.x * LOOSE_CARGO_TILE_UNITS + LOOSE_CARGO_TILE_UNITS / 2,
        y: targetTile.y * LOOSE_CARGO_TILE_UNITS + LOOSE_CARGO_TILE_UNITS / 2,
      },
    );
    if (!dropped.ok || !dropped.entity) throw new Error(`failed cargo fixture: ${dropped.reason}`);

    const ecology = createFieldResourceEcologyState(world.completedTick);
    const nearbyPlayer = createPlayer(world);
    nearbyPlayer.x = targetTile.x * TILE_UNITS + TILE_UNITS / 2;
    nearbyPlayer.y = targetTile.y * TILE_UNITS + TILE_UNITS / 2;
    nearbyPlayer.discovered.fill(FIXED_POINT);
    const nearbyPerception = projectPerception(world, nearbyPlayer);
    expect(nearbyPerception.detailVisibilityGrades[targetNode.tileIndex]).toBe(VISIBILITY_DIRECT);
    const directlyPerceived = projectGameView(world, player, {
      perception: authoritativePerception,
      fieldResourceCatalog: catalog,
      fieldResourceEcology: ecology,
      looseCargoWorld: dropped.world,
    });
    const porterId = String(resident.id);
    const directlyPerceivedNearby = projectGameView(world, nearbyPlayer, {
      perception: nearbyPerception,
      fieldResourceCatalog: catalog,
      fieldResourceEcology: ecology,
      looseCargoWorld: dropped.world,
    });
    expect(directlyPerceivedNearby.fieldResources.some(({ id }) => id === targetNode.id)).toBe(true);
    expect(directlyPerceivedNearby.porters.some(({ id }) => id === porterId)).toBe(true);
    expect(directlyPerceivedNearby.looseCargo?.some(({ id }) => id === dropped.entity?.id)).toBe(true);

    expect(directlyPerceived.terrain.tiles[targetNode.tileIndex]?.currentVisibility).toBeCloseTo(
      (authoritativePerception.terrainVisibilityStrengths[targetNode.tileIndex] ?? 0) / 255,
    );
    expect(directlyPerceived.terrain.tiles[targetNode.tileIndex]?.currentDetailVisibility).toBe(0);
    expect(directlyPerceived.fieldResources.some(({ id }) => id === targetNode.id)).toBe(false);
    expect(directlyPerceived.porters.some(({ id }) => id === porterId)).toBe(false);
    expect(directlyPerceived.looseCargo?.some(({ id }) => id === dropped.entity?.id)).toBe(false);
    expect(directlyPerceived.events?.every((event) => {
      if (!event.position) return true;
      const column = Math.floor(event.position.x / directlyPerceived.terrain.tileSize);
      const row = Math.floor(event.position.y / directlyPerceived.terrain.tileSize);
      return directlyPerceived.terrain.tiles[row * directlyPerceived.terrain.columns + column]
        ?.currentDetailVisibility === 1;
    })).toBe(true);
    expect(directlyPerceived.perception).toMatchObject({
      visibleTileCount: authoritativePerception.visibleTileIndices.length,
      detailVisibleTileCount: authoritativePerception.detailVisibleTileIndices.length,
      detailDirectTileCount: authoritativePerception.detailDirectTileIndices.length,
    });
    expect(count).toBe(authoritativePerception.visibilityGrades.length);
  });

  it("projects eased terrain strength without widening the authoritative detail mask", () => {
    const world = createWorldView(createWorld("soft sight stays honest", "standard"));
    const player = createPlayer(world);
    player.facingMilliRadians = 0;
    const perception = projectPerception(world, player);
    const easedIndex = perception.terrainVisibilityStrengths.findIndex((strength, index) =>
      strength > 0
      && strength < 255
      && perception.detailVisibilityGrades[index] === 0
    );
    if (easedIndex < 0) throw new Error("fixture needs a genuine eased terrain tile");
    const projected = projectGameView(world, player, { perception });
    expect(projected.terrain.tiles[easedIndex]?.currentVisibility).toBeCloseTo(
      (perception.terrainVisibilityStrengths[easedIndex] ?? 0) / 255,
    );
    expect(projected.terrain.tiles[easedIndex]?.currentDetailVisibility).toBe(0);
  });

  it("rejects forged visibility bytes even when the supplied signature still matches", () => {
    const world = createWorldView(createWorld("a copied seal is not authority", "standard"));
    const player = createPlayer(world);
    const current = projectPerception(world, player);
    const forgedIndex = current.terrainVisibilityStrengths.findIndex((strength, index) =>
      index !== current.playerTileIndex && strength > 1
    );
    if (forgedIndex < 0) throw new Error("fixture needs a visible non-player tile");
    const forgedStrengths = current.terrainVisibilityStrengths.slice();
    forgedStrengths[forgedIndex] = (forgedStrengths[forgedIndex] ?? 2) - 1;
    const forged = { ...current, terrainVisibilityStrengths: forgedStrengths };

    expect(forged.signature).toBe(current.signature);
    expect(isCurrentPerceptionSnapshot(
      forged,
      current,
      world.terrain.width,
      world.terrain.height,
    )).toBe(false);
    const projected = projectGameView(world, player, { perception: forged });
    expect(projected.terrain.tiles[forgedIndex]?.currentVisibility).toBe(
      (current.terrainVisibilityStrengths[forgedIndex] ?? 0) / 255,
    );
    expect(projected.terrain.tiles[forgedIndex]?.currentVisibility).not.toBe(
      (forgedStrengths[forgedIndex] ?? 0) / 255,
    );
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
