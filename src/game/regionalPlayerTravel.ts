import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  regionKey,
  type RegionCoord,
  type RegionTileAddress,
} from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH, type TerrainState } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { TILE_UNITS, type PlayerState } from "./player";
import {
  captureRegionalCartographyWindow,
  createRegionalCartography,
  projectRegionalCartographyWindow,
  restoreRegionalCartography,
  serializeRegionalCartography,
  type RegionalCartographyState,
} from "./regionalCartography";
import {
  MOBILE_REGION_STREAMING_CONFIG,
  createTerrainRegionGenerator,
  createTerrainRegionStreamingState,
  moveRegionStreamingCenter,
  restoreTerrainRegionStreamingState,
  serializeRegionStreamingState,
  type RegionStreamingState,
} from "./regionStreaming";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_HALO_TILES,
  REGIONAL_TRAVEL_ROWS,
  createRegionalTerrainWindow,
  regionTileIndexToWindowIndex,
  regionLocalToWindowTile,
  type RegionalTerrainWindow,
} from "./regionalTravel";

export const REGIONAL_PLAYER_TRAVEL_VERSION = 1 as const;
export const REGIONAL_PLAYER_TRAVEL_MAX_SERIALIZED_BYTES = 12 * 1_024 * 1_024;

const HASH_PATTERN = /^[0-9a-f]{16}$/;
const UTF8_ENCODER = new TextEncoder();
const COMPATIBILITY_REGION = createRegionCoord(0, 0);
const TRUSTED_TRAVEL_STATES = new WeakSet<object>();

export interface RegionalPlayerTravelState {
  readonly version: typeof REGIONAL_PLAYER_TRAVEL_VERSION;
  readonly stream: RegionStreamingState<TerrainState>;
  readonly window: RegionalTerrainWindow;
  readonly cartography: RegionalCartographyState;
}

export interface RegionalPlayerTransition {
  readonly state: RegionalPlayerTravelState;
  readonly crossed: boolean;
  readonly from: RegionCoord;
  readonly to: RegionCoord;
  readonly generatedKeys: readonly string[];
  readonly evictedKeys: readonly string[];
}

interface RegionalPlayerTravelSavePayload {
  readonly version: typeof REGIONAL_PLAYER_TRAVEL_VERSION;
  readonly stream: string;
  readonly cartography: string;
}

interface RegionalPlayerTravelSaveEnvelope extends RegionalPlayerTravelSavePayload {
  readonly integrity: string;
}

/** One-time v3 migration: the finite player becomes region 0,0's interior. */
export function migratePlayerToRegionalTravel(
  rootSeed: RootSeed,
  player: PlayerState,
): RegionalPlayerTravelState {
  const compatibilityWidth = player.worldWidth;
  const compatibilityHeight = player.worldHeight;
  if (
    !Number.isSafeInteger(compatibilityWidth)
    || !Number.isSafeInteger(compatibilityHeight)
    || compatibilityWidth <= 0
    || compatibilityWidth > WORLD_WIDTH
    || compatibilityHeight <= 0
    || compatibilityHeight > WORLD_HEIGHT
    || player.discovered.length !== compatibilityWidth * compatibilityHeight
    || player.depthSoundings.length !== compatibilityWidth * compatibilityHeight
  ) throw new RangeError("Legacy player dimensions do not fit compatibility region 0,0");
  const stream = createTerrainRegionStreamingState({
    rootSeed,
    center: COMPATIBILITY_REGION,
    config: MOBILE_REGION_STREAMING_CONFIG,
  });
  const window = createRegionalTerrainWindow(rootSeed, stream);
  const cartography = createRegionalCartography(rootSeed, {
    discovered: expandCompatibilityKnowledge(
      player.discovered,
      compatibilityWidth,
      compatibilityHeight,
    ),
    depthSoundings: expandCompatibilityKnowledge(
      player.depthSoundings,
      compatibilityWidth,
      compatibilityHeight,
    ),
  });
  const currentTrace = mapCompatibilityTrace(
    player.currentTrace,
    stream.center,
    compatibilityWidth,
    compatibilityHeight,
  );
  const surveyTrace = mapCompatibilityTrace(
    player.surveyTrace,
    stream.center,
    compatibilityWidth,
    compatibilityHeight,
  );
  const sweepPath = mapCompatibilityTrace(
    player.sweepPath,
    stream.center,
    compatibilityWidth,
    compatibilityHeight,
  );
  const knowledge = projectRegionalCartographyWindow(cartography, window);

  player.x += REGIONAL_TRAVEL_HALO_TILES * TILE_UNITS;
  player.y += REGIONAL_TRAVEL_HALO_TILES * TILE_UNITS;
  player.previousX += REGIONAL_TRAVEL_HALO_TILES * TILE_UNITS;
  player.previousY += REGIONAL_TRAVEL_HALO_TILES * TILE_UNITS;
  player.currentTrace = currentTrace;
  player.surveyTrace = surveyTrace;
  player.sweepPath = sweepPath;
  player.wayknots = {
    ...player.wayknots,
    wayknots: player.wayknots.wayknots.map((wayknot) => {
      if (
        wayknot.region?.x !== 0
        || wayknot.region?.y !== 0
        || wayknot.tileIndex === null
      ) return wayknot;
      const legacyX = wayknot.tileIndex % compatibilityWidth;
      const legacyY = Math.floor(wayknot.tileIndex / compatibilityWidth);
      if (legacyY >= compatibilityHeight) return { ...wayknot, region: null, tileIndex: null };
      return { ...wayknot, tileIndex: legacyY * WORLD_WIDTH + legacyX };
    }),
  };
  applyWindowKnowledge(player, knowledge);
  player.worldWidth = REGIONAL_TRAVEL_COLUMNS;
  player.worldHeight = REGIONAL_TRAVEL_ROWS;
  return sealState({ version: REGIONAL_PLAYER_TRAVEL_VERSION, stream, window, cartography });
}

/** Restore v4 state without regenerating or accepting altered player knowledge. */
export function restorePlayerRegionalTravel(
  rootSeed: RootSeed,
  player: PlayerState,
  text: string,
): RegionalPlayerTravelState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_PLAYER_TRAVEL_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!plainRecord(parsed) || !exactKeys(parsed, [
      "cartography", "integrity", "stream", "version",
    ])) return null;
    if (
      parsed.version !== REGIONAL_PLAYER_TRAVEL_VERSION
      || typeof parsed.stream !== "string"
      || typeof parsed.cartography !== "string"
      || typeof parsed.integrity !== "string"
      || !HASH_PATTERN.test(parsed.integrity)
    ) return null;
    const payload: RegionalPlayerTravelSavePayload = {
      version: REGIONAL_PLAYER_TRAVEL_VERSION,
      stream: parsed.stream,
      cartography: parsed.cartography,
    };
    if (hashCanonical(payload) !== parsed.integrity) return null;
    const canonicalText = stableStringify({ ...payload, integrity: parsed.integrity });
    if (canonicalText !== text) return null;
    const stream = restoreTerrainRegionStreamingState(rootSeed, payload.stream);
    const cartography = restoreRegionalCartography(rootSeed, payload.cartography);
    if (!stream || !cartography) return null;
    const window = createRegionalTerrainWindow(rootSeed, stream);
    if (
      player.worldWidth !== REGIONAL_TRAVEL_COLUMNS
      || player.worldHeight !== REGIONAL_TRAVEL_ROWS
      || player.discovered.length !== window.terrain.tiles.length
      || player.depthSoundings.length !== window.terrain.tiles.length
    ) return null;
    const projected = projectRegionalCartographyWindow(cartography, window);
    if (
      stableStringify(projected.discovered) !== stableStringify(player.discovered)
      || stableStringify(projected.depthSoundings) !== stableStringify(player.depthSoundings)
      || !playerPointInsideWindow(player.x, player.y)
      || !playerPointInsideWindow(player.previousX, player.previousY)
      || !traceInsideWindow(player.currentTrace)
      || !traceInsideWindow(player.surveyTrace)
      || !traceInsideWindow(player.sweepPath)
    ) return null;
    return sealState({ version: REGIONAL_PLAYER_TRAVEL_VERSION, stream, window, cartography });
  } catch {
    return null;
  }
}

/**
 * Persist all latest chart marks before serializing the bounded stream. The
 * caller snapshots the player only after this returns so both copies agree.
 */
export function capturePlayerRegionalTravel(
  state: RegionalPlayerTravelState,
  player: PlayerState,
): RegionalPlayerTravelState {
  const current = requireState(state);
  assertRuntimePlayerWindow(player, current.window);
  const cartography = captureRegionalCartographyWindow(
    current.cartography,
    current.window,
    player.discovered,
    player.depthSoundings,
  );
  return cartography === current.cartography
    ? current
    : sealState({ ...current, cartography });
}

export function serializePlayerRegionalTravel(state: RegionalPlayerTravelState): string {
  const current = requireState(state);
  const payload: RegionalPlayerTravelSavePayload = {
    version: REGIONAL_PLAYER_TRAVEL_VERSION,
    stream: serializeRegionStreamingState(current.stream),
    cartography: serializeRegionalCartography(current.cartography),
  };
  const encoded = stableStringify({ ...payload, integrity: hashCanonical(payload) });
  if (UTF8_ENCODER.encode(encoded).byteLength > REGIONAL_PLAYER_TRAVEL_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional player travel exceeds its save budget");
  }
  return encoded;
}

/** Recenter immediately after the courier enters a halo tile. */
export function recenterRegionalPlayer(
  rootSeed: RootSeed,
  state: RegionalPlayerTravelState,
  player: PlayerState,
): RegionalPlayerTransition {
  const current = capturePlayerRegionalTravel(state, player);
  const playerIndex = playerTileIndexInWindow(player);
  const destination = current.window.addresses[playerIndex];
  if (!destination) throw new RangeError("Regional player lost its current tile address");
  const from = current.stream.center;
  if (regionKey(destination.region) === regionKey(from)) {
    return deepFreeze({
      state: current,
      crossed: false,
      from,
      to: from,
      generatedKeys: [],
      evictedKeys: [],
    });
  }

  const priorPosition = pointAddress(current.window, player.x, player.y);
  const priorPrevious = pointAddress(current.window, player.previousX, player.previousY);
  const sweepAddresses = player.sweepPath.map((index) => requiredAddress(current.window, index));
  const transition = moveRegionStreamingCenter(
    current.stream,
    destination.region,
    createTerrainRegionGenerator(rootSeed),
  );
  const window = createRegionalTerrainWindow(rootSeed, transition.state);
  const cartography = current.cartography;

  const position = pointInWindow(window, priorPosition);
  if (!position) throw new RangeError("Crossed player position is absent from the recentered window");
  const previous = pointInWindow(window, priorPrevious) ?? position;
  // ADRIFT steering can cross a different halo from the route that was a
  // useful downstream guide one fixed step earlier. That guide is derived,
  // not an authoritative position: if any remaining address falls outside
  // the recentered cross, discard it and let the next water step replan from
  // the porter's exact new position. Throwing here would turn a legitimate
  // perpendicular paddle stroke into a broken save/runtime transition.
  const mappedSweepPath: number[] = [];
  let sweepGuideFitsWindow = true;
  for (const address of sweepAddresses) {
    const mapped = regionTileIndexToWindowIndex(
      window.center,
      address.region,
      address.localY * WORLD_WIDTH + address.localX,
    );
    if (mapped === null) {
      sweepGuideFitsWindow = false;
      break;
    }
    mappedSweepPath.push(mapped);
  }
  if (!sweepGuideFitsWindow) mappedSweepPath.length = 0;
  const knowledge = projectRegionalCartographyWindow(cartography, window);
  player.x = position.x;
  player.y = position.y;
  player.previousX = previous.x;
  player.previousY = previous.y;
  player.worldWidth = REGIONAL_TRAVEL_COLUMNS;
  player.worldHeight = REGIONAL_TRAVEL_ROWS;
  applyWindowKnowledge(player, knowledge);
  const currentIndex = playerTileIndexInWindow(player);
  player.currentTrace = [currentIndex];
  player.surveyTrace = [currentIndex];
  player.sweepPath = mappedSweepPath;
  if (player.mode === "swept") {
    let priorSweepIndex = currentIndex;
    for (const sweepIndex of player.sweepPath) {
      const priorSweepTile = window.terrain.tiles[priorSweepIndex];
      const sweepTile = window.terrain.tiles[sweepIndex];
      if (
        !priorSweepTile
        || !sweepTile
        || Math.abs(priorSweepTile.x - sweepTile.x) + Math.abs(priorSweepTile.y - sweepTile.y) !== 1
      ) {
        player.sweepPath = [];
        break;
      }
      priorSweepIndex = sweepIndex;
    }
  }
  if (player.mode === "swept" && player.sweepPath.length === 0) {
    player.sweepTicksRemaining = 1;
    player.sweepTotalTicks = Math.max(2, player.sweepTotalTicks);
  }

  return deepFreeze({
    state: sealState({
      version: REGIONAL_PLAYER_TRAVEL_VERSION,
      stream: transition.state,
      window,
      cartography,
    }),
    crossed: true,
    from,
    to: transition.state.center,
    generatedKeys: transition.generatedKeys,
    evictedKeys: transition.evictedKeys,
  });
}

function mapCompatibilityTrace(
  trace: readonly number[],
  center: RegionCoord,
  compatibilityWidth: number,
  compatibilityHeight: number,
): number[] {
  return trace.map((index) => {
    if (
      !Number.isSafeInteger(index)
      || index < 0
      || index >= compatibilityWidth * compatibilityHeight
    ) throw new RangeError("Compatibility player trace contains an invalid tile");
    const localX = index % compatibilityWidth;
    const localY = Math.floor(index / compatibilityWidth);
    const mapped = regionTileIndexToWindowIndex(
      center,
      COMPATIBILITY_REGION,
      localY * WORLD_WIDTH + localX,
    );
    if (mapped === null) throw new RangeError("Compatibility player trace contains an invalid tile");
    return mapped;
  });
}

function expandCompatibilityKnowledge(
  values: readonly number[],
  width: number,
  height: number,
): number[] {
  const expanded = Array.from({ length: WORLD_WIDTH * WORLD_HEIGHT }, () => 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      expanded[y * WORLD_WIDTH + x] = values[y * width + x] ?? 0;
    }
  }
  return expanded;
}

function applyWindowKnowledge(
  player: PlayerState,
  knowledge: { readonly discovered: readonly number[]; readonly depthSoundings: readonly number[] },
): void {
  player.discovered = [...knowledge.discovered];
  player.depthSoundings = [...knowledge.depthSoundings];
}

interface AddressedPoint {
  readonly address: RegionTileAddress;
  readonly offsetX: number;
  readonly offsetY: number;
}

function pointAddress(window: RegionalTerrainWindow, x: number, y: number): AddressedPoint {
  if (!playerPointInsideWindow(x, y)) throw new RangeError("Player point is outside the regional window");
  const tileX = Math.floor(x / TILE_UNITS);
  const tileY = Math.floor(y / TILE_UNITS);
  const index = tileY * REGIONAL_TRAVEL_COLUMNS + tileX;
  return {
    address: requiredAddress(window, index),
    offsetX: x - tileX * TILE_UNITS,
    offsetY: y - tileY * TILE_UNITS,
  };
}

function pointInWindow(
  window: RegionalTerrainWindow,
  point: AddressedPoint,
): { readonly x: number; readonly y: number } | null {
  const local = regionLocalToWindowTile(
    window.center,
    point.address.region,
    point.address.localX,
    point.address.localY,
  );
  return local === null ? null : {
    x: local.x * TILE_UNITS + point.offsetX,
    y: local.y * TILE_UNITS + point.offsetY,
  };
}

function requiredAddress(window: RegionalTerrainWindow, index: number): RegionTileAddress {
  if (!Number.isSafeInteger(index) || index < 0 || index >= window.addresses.length) {
    throw new RangeError("Regional player path contains an invalid window tile");
  }
  const address = window.addresses[index];
  if (!address) throw new RangeError("Regional player path lost a stable address");
  return address;
}

function playerTileIndexInWindow(player: PlayerState): number {
  if (!playerPointInsideWindow(player.x, player.y)) {
    throw new RangeError("Regional player point is outside the floating window");
  }
  return Math.floor(player.y / TILE_UNITS) * REGIONAL_TRAVEL_COLUMNS
    + Math.floor(player.x / TILE_UNITS);
}

function playerPointInsideWindow(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= TILE_UNITS / 2
    && x <= REGIONAL_TRAVEL_COLUMNS * TILE_UNITS - TILE_UNITS / 2
    && y >= TILE_UNITS / 2
    && y <= REGIONAL_TRAVEL_ROWS * TILE_UNITS - TILE_UNITS / 2;
}

function traceInsideWindow(trace: readonly number[]): boolean {
  return Array.isArray(trace) && trace.every((index) => Number.isSafeInteger(index)
    && index >= 0 && index < REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS);
}

function assertRuntimePlayerWindow(player: PlayerState, window: RegionalTerrainWindow): void {
  if (
    player.worldWidth !== REGIONAL_TRAVEL_COLUMNS
    || player.worldHeight !== REGIONAL_TRAVEL_ROWS
    || player.discovered.length !== window.terrain.tiles.length
    || player.depthSoundings.length !== window.terrain.tiles.length
    || !playerPointInsideWindow(player.x, player.y)
  ) throw new RangeError("Player does not match the active regional window");
}

function sealState(
  value: Omit<RegionalPlayerTravelState, "version"> & { readonly version?: 1 },
): RegionalPlayerTravelState {
  const state = Object.freeze({
    version: REGIONAL_PLAYER_TRAVEL_VERSION,
    stream: value.stream,
    window: value.window,
    cartography: value.cartography,
  });
  TRUSTED_TRAVEL_STATES.add(state);
  return state;
}

function requireState(value: RegionalPlayerTravelState): RegionalPlayerTravelState {
  if (value !== null && typeof value === "object" && TRUSTED_TRAVEL_STATES.has(value)) return value;
  throw new RangeError("Regional player travel was not created by the canonical kernel");
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
