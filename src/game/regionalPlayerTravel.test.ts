import { describe, expect, it } from "vitest";

import {
  globalTileToRegion,
  regionKey,
  regionLocalToGlobalTile,
  type RegionTileAddress,
} from "../sim/regions";
import { createWorld, createWorldView } from "../sim/public";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  TILE_UNITS,
  createPlayer,
  stepPlayer,
  type PlayerState,
} from "./player";
import { projectRegionalCartographyRegion } from "./regionalCartography";
import {
  capturePlayerRegionalTravel,
  migratePlayerToRegionalTravel,
  recenterRegionalPlayer,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
  type RegionalPlayerTravelState,
} from "./regionalPlayerTravel";
import {
  LEGACY_REGIONAL_TRAVEL_COLUMNS,
  LEGACY_REGIONAL_TRAVEL_HALO_TILES,
  LEGACY_REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_CENTER_X,
  REGIONAL_TRAVEL_CENTER_Y,
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_SAFE_MAX_X,
  REGIONAL_TRAVEL_SAFE_MAX_Y,
  REGIONAL_TRAVEL_SAFE_MIN_X,
  REGIONAL_TRAVEL_SAFE_MIN_Y,
  REGIONAL_TRAVEL_SIGHT_TILES,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";

interface CanonicalPlayerPoint {
  readonly region: { readonly x: number; readonly y: number };
  readonly localX: number;
  readonly localY: number;
}

interface WindowTile {
  readonly x: number;
  readonly y: number;
  readonly index: number;
  readonly address: RegionTileAddress;
}

interface RegionalTravelSaveEnvelope {
  readonly version: number;
  readonly stream: string;
  readonly cartography: string;
  readonly origin: { readonly x: number; readonly y: number };
  readonly integrity: string;
}

function fixture(seed = "a horizon with memory") {
  const world = createWorld(seed, "wild");
  const view = createWorldView(world);
  const player = createPlayer(view, view.settlements[0]?.id);
  return { world, player };
}

function canonicalPlayerPoint(
  state: RegionalPlayerTravelState,
  player: PlayerState,
  previous = false,
): CanonicalPlayerPoint {
  const x = previous ? player.previousX : player.x;
  const y = previous ? player.previousY : player.y;
  const tileX = Math.floor(x / TILE_UNITS);
  const tileY = Math.floor(y / TILE_UNITS);
  const address = state.window.addresses[tileY * REGIONAL_TRAVEL_COLUMNS + tileX];
  if (!address) throw new Error("Player point is outside the regional frame");
  return {
    region: { x: address.region.x, y: address.region.y },
    localX: address.localX * TILE_UNITS + x - tileX * TILE_UNITS,
    localY: address.localY * TILE_UNITS + y - tileY * TILE_UNITS,
  };
}

function windowTileAt(
  state: RegionalPlayerTravelState,
  x: number,
  y: number,
): WindowTile {
  const index = y * REGIONAL_TRAVEL_COLUMNS + x;
  const address = state.window.addresses[index];
  if (!address) throw new Error(`Missing regional address at ${x},${y}`);
  return { x, y, index, address };
}

function findWindowTile(
  state: RegionalPlayerTravelState,
  predicate: (tile: WindowTile) => boolean,
): WindowTile {
  const candidates: WindowTile[] = [];
  for (let y = 1; y < REGIONAL_TRAVEL_ROWS - 1; y += 1) {
    for (let x = 1; x < REGIONAL_TRAVEL_COLUMNS - 1; x += 1) {
      const tile = windowTileAt(state, x, y);
      if (predicate(tile)) candidates.push(tile);
    }
  }
  candidates.sort((left, right) => {
    const leftDistance = Math.abs(left.x - REGIONAL_TRAVEL_CENTER_X)
      + Math.abs(left.y - REGIONAL_TRAVEL_CENTER_Y);
    const rightDistance = Math.abs(right.x - REGIONAL_TRAVEL_CENTER_X)
      + Math.abs(right.y - REGIONAL_TRAVEL_CENTER_Y);
    return leftDistance - rightDistance || left.index - right.index;
  });
  const found = candidates[0];
  if (!found) throw new Error("No matching tile exists in the regional frame");
  return found;
}

function nearestFrameOnlyRebaseTile(state: RegionalPlayerTravelState): WindowTile {
  const centerKey = regionKey(state.stream.center);
  const candidates = [
    windowTileAt(state, REGIONAL_TRAVEL_SAFE_MAX_X + 1, REGIONAL_TRAVEL_CENTER_Y),
    windowTileAt(state, REGIONAL_TRAVEL_SAFE_MIN_X - 1, REGIONAL_TRAVEL_CENTER_Y),
    windowTileAt(state, REGIONAL_TRAVEL_CENTER_X, REGIONAL_TRAVEL_SAFE_MAX_Y + 1),
    windowTileAt(state, REGIONAL_TRAVEL_CENTER_X, REGIONAL_TRAVEL_SAFE_MIN_Y - 1),
  ];
  const found = candidates.find((tile) => regionKey(tile.address.region) === centerKey);
  if (!found) throw new Error("Centered storage region has no frame-only rebase tile");
  return found;
}

function placePlayerAtTile(
  player: PlayerState,
  tile: WindowTile,
  offsetX = 443,
  offsetY = 321,
  previousOffsetX = 611,
  previousOffsetY = 733,
): void {
  player.x = tile.x * TILE_UNITS + offsetX;
  player.y = tile.y * TILE_UNITS + offsetY;
  player.previousX = tile.x * TILE_UNITS + previousOffsetX;
  player.previousY = tile.y * TILE_UNITS + previousOffsetY;
  player.currentTrace = [tile.index];
  player.surveyTrace = [tile.index];
  player.sweepPath = [];
}

function pathAddresses(
  state: RegionalPlayerTravelState,
  path: readonly number[],
): readonly RegionTileAddress[] {
  return path.map((index) => {
    const address = state.window.addresses[index];
    if (!address) throw new Error(`Missing regional path address ${index}`);
    return {
      region: { x: address.region.x, y: address.region.y },
      localX: address.localX,
      localY: address.localY,
    };
  });
}

function legacyWindowAddress(
  center: { readonly x: number; readonly y: number },
  index: number,
): RegionTileAddress {
  const x = index % LEGACY_REGIONAL_TRAVEL_COLUMNS;
  const y = Math.floor(index / LEGACY_REGIONAL_TRAVEL_COLUMNS);
  const origin = regionLocalToGlobalTile(center, 0, 0);
  return globalTileToRegion(
    origin.x + x - LEGACY_REGIONAL_TRAVEL_HALO_TILES,
    origin.y + y - LEGACY_REGIONAL_TRAVEL_HALO_TILES,
  );
}

function legacyWindowPlayer(
  state: RegionalPlayerTravelState,
  player: PlayerState,
): PlayerState {
  const projected = new Map<string, ReturnType<typeof projectRegionalCartographyRegion>>();
  const projectionFor = (address: RegionTileAddress) => {
    const key = regionKey(address.region);
    const prior = projected.get(key);
    if (prior) return prior;
    const next = projectRegionalCartographyRegion(state.cartography, address.region);
    projected.set(key, next);
    return next;
  };
  const count = LEGACY_REGIONAL_TRAVEL_COLUMNS * LEGACY_REGIONAL_TRAVEL_ROWS;
  const discovered: number[] = [];
  const depthSoundings: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const address = legacyWindowAddress(state.stream.center, index);
    const projection = projectionFor(address);
    const regionalIndex = address.localY * WORLD_WIDTH + address.localX;
    discovered.push(projection.discovered[regionalIndex] ?? 0);
    depthSoundings.push(projection.depthSoundings[regionalIndex] ?? 0);
  }

  const pointToLegacy = (point: CanonicalPlayerPoint) => {
    const global = regionLocalToGlobalTile(
      point.region,
      Math.floor(point.localX / TILE_UNITS),
      Math.floor(point.localY / TILE_UNITS),
    );
    const storageOrigin = regionLocalToGlobalTile(state.stream.center, 0, 0);
    const tileX = global.x - storageOrigin.x + LEGACY_REGIONAL_TRAVEL_HALO_TILES;
    const tileY = global.y - storageOrigin.y + LEGACY_REGIONAL_TRAVEL_HALO_TILES;
    return {
      x: tileX * TILE_UNITS + point.localX % TILE_UNITS,
      y: tileY * TILE_UNITS + point.localY % TILE_UNITS,
      index: tileY * LEGACY_REGIONAL_TRAVEL_COLUMNS + tileX,
    };
  };
  const current = pointToLegacy(canonicalPlayerPoint(state, player));
  const previous = pointToLegacy(canonicalPlayerPoint(state, player, true));
  const result = structuredClone(player);
  result.worldWidth = LEGACY_REGIONAL_TRAVEL_COLUMNS;
  result.worldHeight = LEGACY_REGIONAL_TRAVEL_ROWS;
  result.x = current.x;
  result.y = current.y;
  result.previousX = previous.x;
  result.previousY = previous.y;
  result.discovered = discovered;
  result.depthSoundings = depthSoundings;
  result.currentTrace = [current.index];
  result.surveyTrace = [current.index];
  result.sweepPath = [];
  return result;
}

function legacyV1Envelope(state: RegionalPlayerTravelState): string {
  const current = JSON.parse(serializePlayerRegionalTravel(state)) as RegionalTravelSaveEnvelope;
  const payload = {
    version: 1,
    stream: current.stream,
    cartography: current.cartography,
  };
  return stableStringify({ ...payload, integrity: hashCanonical(payload) });
}

describe("regional player floating-origin travel", () => {
  it("migrates finite region 0,0 into a centered frame without moving either canonical point", () => {
    const { world, player } = fixture();
    const before = {
      region: { x: 0, y: 0 },
      localX: player.x,
      localY: player.y,
    };
    const prior = {
      region: { x: 0, y: 0 },
      localX: player.previousX,
      localY: player.previousY,
    };
    const originalTileX = Math.floor(player.x / TILE_UNITS);
    const originalTileY = Math.floor(player.y / TILE_UNITS);

    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);

    expect(state.stream.center).toEqual({ x: 0, y: 0 });
    expect(state.window.origin).toEqual({
      x: originalTileX - REGIONAL_TRAVEL_CENTER_X,
      y: originalTileY - REGIONAL_TRAVEL_CENTER_Y,
    });
    expect(player).toMatchObject({
      worldWidth: REGIONAL_TRAVEL_COLUMNS,
      worldHeight: REGIONAL_TRAVEL_ROWS,
    });
    expect(Math.floor(player.x / TILE_UNITS)).toBe(REGIONAL_TRAVEL_CENTER_X);
    expect(Math.floor(player.y / TILE_UNITS)).toBe(REGIONAL_TRAVEL_CENTER_Y);
    expect(canonicalPlayerPoint(state, player)).toEqual(before);
    expect(canonicalPlayerPoint(state, player, true)).toEqual(prior);
  });

  it("crosses storage regions in both directions without moving canonical or sub-tile position", () => {
    const { world, player } = fixture("walk over both signed storage seams");
    let state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const startingCenter = state.stream.center;
    const outbound = findWindowTile(
      state,
      (tile) => regionKey(tile.address.region) !== regionKey(startingCenter),
    );
    placePlayerAtTile(player, outbound);
    const outboundPoint = canonicalPlayerPoint(state, player);
    const outboundPrevious = canonicalPlayerPoint(state, player, true);
    const outboundLocal = {
      x: player.x,
      y: player.y,
      previousX: player.previousX,
      previousY: player.previousY,
    };

    const crossed = recenterRegionalPlayer(world.meta.rootSeed, state, player);
    state = crossed.state;

    expect(crossed).toMatchObject({
      crossed: true,
      from: startingCenter,
      to: outbound.address.region,
    });
    expect(player.x).toBe(outboundLocal.x + crossed.frameDeltaTiles.x * TILE_UNITS);
    expect(player.y).toBe(outboundLocal.y + crossed.frameDeltaTiles.y * TILE_UNITS);
    expect(player.previousX).toBe(outboundLocal.previousX + crossed.frameDeltaTiles.x * TILE_UNITS);
    expect(player.previousY).toBe(outboundLocal.previousY + crossed.frameDeltaTiles.y * TILE_UNITS);
    expect(canonicalPlayerPoint(state, player)).toEqual(outboundPoint);
    expect(canonicalPlayerPoint(state, player, true)).toEqual(outboundPrevious);
    expect(state.stream.loaded).toHaveLength(5);

    const inbound = findWindowTile(
      state,
      (tile) => regionKey(tile.address.region) === regionKey(startingCenter),
    );
    placePlayerAtTile(player, inbound, 719, 281, 647, 809);
    const inboundPoint = canonicalPlayerPoint(state, player);
    const inboundPrevious = canonicalPlayerPoint(state, player, true);
    const returned = recenterRegionalPlayer(world.meta.rootSeed, state, player);

    expect(returned).toMatchObject({
      crossed: true,
      from: outbound.address.region,
      to: startingCenter,
    });
    expect(canonicalPlayerPoint(returned.state, player)).toEqual(inboundPoint);
    expect(canonicalPlayerPoint(returned.state, player, true)).toEqual(inboundPrevious);
    expect(player.x % TILE_UNITS).toBe(719);
    expect(player.y % TILE_UNITS).toBe(281);
    expect(returned.state.stream.loaded).toHaveLength(5);
  });

  it("rebases only the spatial frame in fixed quanta and preserves canonical/sub-tile position", () => {
    const { world, player } = fixture("the frame slides without moving the world");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const target = nearestFrameOnlyRebaseTile(state);
    placePlayerAtTile(player, target);
    const before = canonicalPlayerPoint(state, player);
    const previous = canonicalPlayerPoint(state, player, true);
    const local = {
      x: player.x,
      y: player.y,
      previousX: player.previousX,
      previousY: player.previousY,
    };
    const priorOrigin = state.window.origin;

    const shifted = recenterRegionalPlayer(world.meta.rootSeed, state, player);

    expect(shifted.crossed).toBe(false);
    expect(shifted.rebased).toBe(true);
    expect(shifted.state.stream.center).toEqual(state.stream.center);
    expect(shifted.generatedKeys).toEqual([]);
    expect(shifted.evictedKeys).toEqual([]);
    expect(shifted.state.window.origin).toEqual({
      x: priorOrigin.x - shifted.frameDeltaTiles.x,
      y: priorOrigin.y - shifted.frameDeltaTiles.y,
    });
    expect(player).toMatchObject({
      x: local.x + shifted.frameDeltaTiles.x * TILE_UNITS,
      y: local.y + shifted.frameDeltaTiles.y * TILE_UNITS,
      previousX: local.previousX + shifted.frameDeltaTiles.x * TILE_UNITS,
      previousY: local.previousY + shifted.frameDeltaTiles.y * TILE_UNITS,
    });
    expect(canonicalPlayerPoint(shifted.state, player)).toEqual(before);
    expect(canonicalPlayerPoint(shifted.state, player, true)).toEqual(previous);
    expect(player.x % TILE_UNITS).toBe(443);
    expect(player.y % TILE_UNITS).toBe(321);
    expect(Math.floor(player.x / TILE_UNITS)).toBeGreaterThanOrEqual(REGIONAL_TRAVEL_SAFE_MIN_X);
    expect(Math.floor(player.x / TILE_UNITS)).toBeLessThanOrEqual(REGIONAL_TRAVEL_SAFE_MAX_X);
    expect(Math.floor(player.y / TILE_UNITS)).toBeGreaterThanOrEqual(REGIONAL_TRAVEL_SAFE_MIN_Y);
    expect(Math.floor(player.y / TILE_UNITS)).toBeLessThanOrEqual(REGIONAL_TRAVEL_SAFE_MAX_Y);
  });

  it("crosses the northwest corner with mathematical-floor negative addressing", () => {
    const { world, player } = fixture("negative diagonal exactness");
    player.x = 500;
    player.y = 500;
    player.previousX = 611;
    player.previousY = 733;
    player.currentTrace = [0];
    player.surveyTrace = [0];
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const northwest = windowTileAt(
      state,
      REGIONAL_TRAVEL_CENTER_X - 1,
      REGIONAL_TRAVEL_CENTER_Y - 1,
    );
    expect(northwest.address).toEqual({
      region: { x: -1, y: -1 },
      localX: WORLD_WIDTH - 1,
      localY: WORLD_HEIGHT - 1,
    });
    placePlayerAtTile(player, northwest, 500, 500, 611, 733);
    const before = canonicalPlayerPoint(state, player);
    const previous = canonicalPlayerPoint(state, player, true);

    const crossed = recenterRegionalPlayer(world.meta.rootSeed, state, player);

    expect(crossed).toMatchObject({
      crossed: true,
      rebased: false,
      from: { x: 0, y: 0 },
      to: { x: -1, y: -1 },
      frameDeltaTiles: { x: 0, y: 0 },
    });
    expect(canonicalPlayerPoint(crossed.state, player)).toEqual(before);
    expect(canonicalPlayerPoint(crossed.state, player, true)).toEqual(previous);
    expect(before).toEqual({
      region: { x: -1, y: -1 },
      localX: (WORLD_WIDTH - 1) * TILE_UNITS + 500,
      localY: (WORLD_HEIGHT - 1) * TILE_UNITS + 500,
    });
    expect(player.x % TILE_UNITS).toBe(500);
    expect(player.y % TILE_UNITS).toBe(500);
  });

  it("preserves a valid ADRIFT path through a frame-only rebase", () => {
    const { world, player } = fixture("adrift guide survives the sliding frame");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const target = nearestFrameOnlyRebaseTile(state);
    placePlayerAtTile(player, target);
    const dx = target.x > REGIONAL_TRAVEL_SAFE_MAX_X
      ? 1
      : target.x < REGIONAL_TRAVEL_SAFE_MIN_X ? -1 : 0;
    const dy = target.y > REGIONAL_TRAVEL_SAFE_MAX_Y
      ? 1
      : target.y < REGIONAL_TRAVEL_SAFE_MIN_Y ? -1 : 0;
    const first = windowTileAt(state, target.x + dx, target.y + dy);
    const second = windowTileAt(state, target.x + dx * 2, target.y + dy * 2);
    player.mode = "swept";
    player.sweepPath = [first.index, second.index];
    player.sweepTicksRemaining = 77;
    player.sweepTotalTicks = 88;
    const pathBefore = pathAddresses(state, player.sweepPath);
    const positionBefore = canonicalPlayerPoint(state, player);

    const shifted = recenterRegionalPlayer(world.meta.rootSeed, state, player);

    expect(shifted).toMatchObject({ crossed: false, rebased: true });
    expect(pathAddresses(shifted.state, player.sweepPath)).toEqual(pathBefore);
    expect(player.sweepPath).toHaveLength(2);
    expect(player.sweepTicksRemaining).toBe(77);
    expect(player.sweepTotalTicks).toBe(88);
    expect(canonicalPlayerPoint(shifted.state, player)).toEqual(positionBefore);
  });

  it("clears an ADRIFT guide that leaves the frame and schedules deterministic replanning", () => {
    const { world, player } = fixture("adrift stale guide leaves the sliding frame");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const target = nearestFrameOnlyRebaseTile(state);
    placePlayerAtTile(player, target);
    const guideX = target.x > REGIONAL_TRAVEL_SAFE_MAX_X
      ? 0
      : target.x < REGIONAL_TRAVEL_SAFE_MIN_X ? REGIONAL_TRAVEL_COLUMNS - 1 : target.x;
    const guideY = target.y > REGIONAL_TRAVEL_SAFE_MAX_Y
      ? 0
      : target.y < REGIONAL_TRAVEL_SAFE_MIN_Y ? REGIONAL_TRAVEL_ROWS - 1 : target.y;
    const staleGuide = windowTileAt(state, guideX, guideY);
    player.mode = "swept";
    player.sweepPath = [staleGuide.index];
    player.sweepTicksRemaining = 77;
    player.sweepTotalTicks = 88;
    const positionBefore = canonicalPlayerPoint(state, player);

    const shifted = recenterRegionalPlayer(world.meta.rootSeed, state, player);

    expect(shifted).toMatchObject({ crossed: false, rebased: true });
    expect(player).toMatchObject({
      mode: "swept",
      sweepPath: [],
      sweepTicksRemaining: 1,
      sweepTotalTicks: 88,
    });
    expect(canonicalPlayerPoint(shifted.state, player)).toEqual(positionBefore);
  });

  it("round-trips the exact version-2 frame origin, stream, chart, and canonical position", () => {
    const { world, player } = fixture("version two exact spatial frame folio");
    let state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const target = nearestFrameOnlyRebaseTile(state);
    placePlayerAtTile(player, target);
    state = recenterRegionalPlayer(world.meta.rootSeed, state, player).state;
    const currentIndex = Math.floor(player.y / TILE_UNITS) * player.worldWidth
      + Math.floor(player.x / TILE_UNITS);
    player.discovered[currentIndex] = 888_000;
    player.depthSoundings[currentIndex] = 444_000;
    state = capturePlayerRegionalTravel(state, player);
    const point = canonicalPlayerPoint(state, player);
    const text = serializePlayerRegionalTravel(state);
    const envelope = JSON.parse(text) as RegionalTravelSaveEnvelope;
    const snapshot = structuredClone(player);

    const restored = restorePlayerRegionalTravel(world.meta.rootSeed, snapshot, text);

    expect(envelope.version).toBe(2);
    expect(envelope.origin).toEqual(state.window.origin);
    expect(restored).not.toBeNull();
    if (!restored) throw new Error("Expected exact version-2 restore");
    expect(restored.window.origin).toEqual(state.window.origin);
    expect(restored.stream).toEqual(state.stream);
    expect(restored.cartography).toEqual(state.cartography);
    expect(canonicalPlayerPoint(restored, snapshot)).toEqual(point);
    expect(serializePlayerRegionalTravel(restored)).toBe(text);
  });

  it("rejects both stale-integrity and correctly resealed origin tampering", () => {
    const { world, player } = fixture("a frame origin cannot lie about chart truth");
    let state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const currentIndex = Math.floor(player.y / TILE_UNITS) * player.worldWidth
      + Math.floor(player.x / TILE_UNITS);
    player.discovered[currentIndex] = 888_000;
    player.depthSoundings[currentIndex] = 444_000;
    state = capturePlayerRegionalTravel(state, player);
    const text = serializePlayerRegionalTravel(state);
    const envelope = JSON.parse(text) as RegionalTravelSaveEnvelope;
    const changedOrigin = { x: envelope.origin.x + 1, y: envelope.origin.y };
    const staleIntegrity = stableStringify({ ...envelope, origin: changedOrigin });
    const changedPayload = {
      version: envelope.version,
      stream: envelope.stream,
      cartography: envelope.cartography,
      origin: changedOrigin,
    };
    const resealed = stableStringify({
      ...changedPayload,
      integrity: hashCanonical(changedPayload),
    });

    expect(restorePlayerRegionalTravel(
      world.meta.rootSeed,
      structuredClone(player),
      staleIntegrity,
    )).toBeNull();
    expect(restorePlayerRegionalTravel(
      world.meta.rootSeed,
      structuredClone(player),
      resealed,
    )).toBeNull();
  });

  it("does not transition while the player remains inside the full-sight safe band", () => {
    const { world, player } = fixture("no phantom frame transition");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const position = canonicalPlayerPoint(state, player);

    const result = recenterRegionalPlayer(world.meta.rootSeed, state, player);

    expect(Math.floor(player.x / TILE_UNITS)).toBeGreaterThanOrEqual(REGIONAL_TRAVEL_SAFE_MIN_X);
    expect(Math.floor(player.x / TILE_UNITS)).toBeLessThanOrEqual(REGIONAL_TRAVEL_SAFE_MAX_X);
    expect(Math.floor(player.y / TILE_UNITS)).toBeGreaterThanOrEqual(REGIONAL_TRAVEL_SAFE_MIN_Y);
    expect(Math.floor(player.y / TILE_UNITS)).toBeLessThanOrEqual(REGIONAL_TRAVEL_SAFE_MAX_Y);
    expect(result).toMatchObject({
      crossed: false,
      rebased: false,
      frameDeltaTiles: { x: 0, y: 0 },
      generatedKeys: [],
      evictedKeys: [],
    });
    expect(result.state).toBe(state);
    expect(canonicalPlayerPoint(result.state, player)).toEqual(position);
  });

  it("keeps the complete sight radius inside every edge of the safe band", () => {
    expect(REGIONAL_TRAVEL_SAFE_MIN_X).toBe(REGIONAL_TRAVEL_SIGHT_TILES);
    expect(REGIONAL_TRAVEL_SAFE_MIN_Y).toBe(REGIONAL_TRAVEL_SIGHT_TILES);
    expect(REGIONAL_TRAVEL_COLUMNS - 1 - REGIONAL_TRAVEL_SAFE_MAX_X)
      .toBe(REGIONAL_TRAVEL_SIGHT_TILES);
    expect(REGIONAL_TRAVEL_ROWS - 1 - REGIONAL_TRAVEL_SAFE_MAX_Y)
      .toBe(REGIONAL_TRAVEL_SIGHT_TILES);
    expect(REGIONAL_TRAVEL_SAFE_MIN_X).toBeLessThanOrEqual(REGIONAL_TRAVEL_SAFE_MAX_X);
    expect(REGIONAL_TRAVEL_SAFE_MIN_Y).toBeLessThanOrEqual(REGIONAL_TRAVEL_SAFE_MAX_Y);
    expect(REGIONAL_TRAVEL_CENTER_X).toBeGreaterThanOrEqual(REGIONAL_TRAVEL_SAFE_MIN_X);
    expect(REGIONAL_TRAVEL_CENTER_X).toBeLessThanOrEqual(REGIONAL_TRAVEL_SAFE_MAX_X);
    expect(REGIONAL_TRAVEL_CENTER_Y).toBeGreaterThanOrEqual(REGIONAL_TRAVEL_SAFE_MIN_Y);
    expect(REGIONAL_TRAVEL_CENTER_Y).toBeLessThanOrEqual(REGIONAL_TRAVEL_SAFE_MAX_Y);
  });

  it("migrates an exact legacy v1 98x74 save into version 2 without moving the player", () => {
    const { world, player } = fixture("alpha eight legacy frame migration");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const legacyText = legacyV1Envelope(state);
    const legacyPlayer = legacyWindowPlayer(state, player);
    const expected = canonicalPlayerPoint(state, player);
    const expectedPrevious = canonicalPlayerPoint(state, player, true);
    const invalidLegacyPlayer = structuredClone(legacyPlayer);
    invalidLegacyPlayer.discovered[0] = (invalidLegacyPlayer.discovered[0] ?? 0) + 1;

    const restored = restorePlayerRegionalTravel(world.meta.rootSeed, legacyPlayer, legacyText);

    expect(restored).not.toBeNull();
    if (!restored) throw new Error("Expected exact legacy regional save migration");
    expect(legacyPlayer).toMatchObject({
      worldWidth: REGIONAL_TRAVEL_COLUMNS,
      worldHeight: REGIONAL_TRAVEL_ROWS,
    });
    expect(Math.floor(legacyPlayer.x / TILE_UNITS)).toBe(REGIONAL_TRAVEL_CENTER_X);
    expect(Math.floor(legacyPlayer.y / TILE_UNITS)).toBe(REGIONAL_TRAVEL_CENTER_Y);
    expect(canonicalPlayerPoint(restored, legacyPlayer)).toEqual(expected);
    expect(canonicalPlayerPoint(restored, legacyPlayer, true)).toEqual(expectedPrevious);
    expect((JSON.parse(serializePlayerRegionalTravel(restored)) as RegionalTravelSaveEnvelope).version)
      .toBe(2);
    expect(restorePlayerRegionalTravel(
      world.meta.rootSeed,
      invalidLegacyPlayer,
      legacyText,
    )).toBeNull();
  });

  it("carries an exhausted sweep to the frame edge when no bank exists in sight", () => {
    const { world, player } = fixture("a river wider than one horizon");
    const state = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    const compatibility = createWorldView(world);
    const view = createRegionalWorldView(compatibility, state.window, {
      discovered: player.discovered,
      depthSoundings: player.depthSoundings,
    });
    for (const tile of view.terrain.tiles) {
      const mutable = tile as { terrain: "deep-water"; waterDepth: number; elevation: number };
      mutable.terrain = "deep-water";
      mutable.waterDepth = 260_000;
      mutable.elevation = 0;
    }
    player.x = REGIONAL_TRAVEL_CENTER_X * TILE_UNITS + TILE_UNITS / 2;
    player.y = REGIONAL_TRAVEL_CENTER_Y * TILE_UNITS + TILE_UNITS / 2;
    player.previousX = player.x;
    player.previousY = player.y;
    player.currentTrace = [REGIONAL_TRAVEL_CENTER_Y * player.worldWidth + REGIONAL_TRAVEL_CENTER_X];
    player.surveyTrace = [...player.currentTrace];
    player.stamina = 0;
    player.stability = 0;

    const result = stepPlayer(player, view, { moveX: 0, moveY: 0, brace: false });

    expect(result.becameSwept).toBe(true);
    expect(player.sweepPath.length).toBeGreaterThan(0);
    const destination = view.terrain.tiles[player.sweepPath.at(-1)!];
    expect(destination?.x === 0
      || destination?.y === 0
      || destination?.x === view.terrain.width - 1
      || destination?.y === view.terrain.height - 1).toBe(true);
  });
});
