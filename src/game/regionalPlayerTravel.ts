import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  globalTileToRegion,
  regionKey,
  regionLocalToGlobalTile,
  type GlobalTileCoord,
  type RegionCoord,
  type RegionTileAddress,
} from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH, type TerrainState } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { TILE_UNITS, type PlayerState } from "./player";
import {
  captureRegionalCartographyWindow,
  createRegionalCartography,
  projectRegionalCartographyRegion,
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
  LEGACY_REGIONAL_TRAVEL_COLUMNS,
  LEGACY_REGIONAL_TRAVEL_HALO_TILES,
  LEGACY_REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  createRegionalTerrainWindow,
  rebindRegionalTerrainWindowCenter,
  regionLocalToWindowTile,
  regionTileIndexToWindowIndex,
  regionalFrameOriginAtAddress,
  shiftedRegionalFrameOrigin,
  type RegionalTerrainWindow,
} from "./regionalTravel";

export const REGIONAL_PLAYER_TRAVEL_VERSION = 2 as const;
export const REGIONAL_PLAYER_TRAVEL_MAX_SERIALIZED_BYTES = 12 * 1_024 * 1_024;

const LEGACY_REGIONAL_PLAYER_TRAVEL_VERSION = 1 as const;
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
  /** The player entered a different persistence/streaming region. */
  readonly crossed: boolean;
  /** The bounded presentation frame moved around the same canonical world. */
  readonly rebased: boolean;
  readonly from: RegionCoord;
  readonly to: RegionCoord;
  /** Added to old local coordinates to represent the same canonical point. */
  readonly frameDeltaTiles: GlobalTileCoord;
  readonly generatedKeys: readonly string[];
  readonly evictedKeys: readonly string[];
}

interface RegionalPlayerTravelSavePayloadV2 {
  readonly version: typeof REGIONAL_PLAYER_TRAVEL_VERSION;
  readonly stream: string;
  readonly cartography: string;
  readonly origin: GlobalTileCoord;
}

interface RegionalPlayerTravelSavePayloadV1 {
  readonly version: typeof LEGACY_REGIONAL_PLAYER_TRAVEL_VERSION;
  readonly stream: string;
  readonly cartography: string;
}

/** One-time finite-world migration into a player-centered seamless frame. */
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

  const position = compatibilityPointAddress(
    player.x,
    player.y,
    compatibilityWidth,
    compatibilityHeight,
  );
  const previous = compatibilityPointAddress(
    player.previousX,
    player.previousY,
    compatibilityWidth,
    compatibilityHeight,
  );
  const stream = createTerrainRegionStreamingState({
    rootSeed,
    center: COMPATIBILITY_REGION,
    config: MOBILE_REGION_STREAMING_CONFIG,
  });
  const window = createRegionalTerrainWindow(
    rootSeed,
    stream,
    regionalFrameOriginAtAddress(position.address),
  );
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
  const currentTraceAddresses = compatibilityTraceAddresses(
    player.currentTrace,
    compatibilityWidth,
    compatibilityHeight,
  );
  const surveyTraceAddresses = compatibilityTraceAddresses(
    player.surveyTrace,
    compatibilityWidth,
    compatibilityHeight,
  );
  const sweepAddresses = compatibilityTraceAddresses(
    player.sweepPath,
    compatibilityWidth,
    compatibilityHeight,
  );
  const nextPosition = pointInWindow(window, position);
  const nextPrevious = pointInWindow(window, previous);
  if (!nextPosition || !nextPrevious) {
    throw new RangeError("Compatibility player is absent from its centered spatial frame");
  }

  player.x = nextPosition.x;
  player.y = nextPosition.y;
  player.previousX = nextPrevious.x;
  player.previousY = nextPrevious.y;
  const currentIndex = Math.floor(nextPosition.y / TILE_UNITS) * REGIONAL_TRAVEL_COLUMNS
    + Math.floor(nextPosition.x / TILE_UNITS);
  player.currentTrace = mapAddressTraceSuffix(window, currentTraceAddresses, currentIndex);
  player.surveyTrace = mapAddressTraceSuffix(window, surveyTraceAddresses, currentIndex);
  player.sweepPath = mapCompleteAddressTrace(window, sweepAddresses);
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
  applyWindowKnowledge(player, projectRegionalCartographyWindow(cartography, window));
  player.worldWidth = REGIONAL_TRAVEL_COLUMNS;
  player.worldHeight = REGIONAL_TRAVEL_ROWS;
  return sealState({ stream, window, cartography });
}

/** Restore either the current frame-bearing payload or the shipped Alpha 8 payload. */
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
    if (!plainRecord(parsed) || !Number.isSafeInteger(parsed.version)) return null;
    if (parsed.version === REGIONAL_PLAYER_TRAVEL_VERSION) {
      return restoreCurrentPlayerRegionalTravel(rootSeed, player, parsed, text);
    }
    if (parsed.version === LEGACY_REGIONAL_PLAYER_TRAVEL_VERSION) {
      return restoreLegacyPlayerRegionalTravel(rootSeed, player, parsed, text);
    }
    return null;
  } catch {
    return null;
  }
}

function restoreCurrentPlayerRegionalTravel(
  rootSeed: RootSeed,
  player: PlayerState,
  parsed: Readonly<Record<string, unknown>>,
  text: string,
): RegionalPlayerTravelState | null {
  if (!exactKeys(parsed, ["cartography", "integrity", "origin", "stream", "version"])) {
    return null;
  }
  if (
    typeof parsed.stream !== "string"
    || typeof parsed.cartography !== "string"
    || typeof parsed.integrity !== "string"
    || !HASH_PATTERN.test(parsed.integrity)
    || !plainRecord(parsed.origin)
    || !exactKeys(parsed.origin, ["x", "y"])
    || !Number.isSafeInteger(parsed.origin.x)
    || !Number.isSafeInteger(parsed.origin.y)
    || Object.is(parsed.origin.x, -0)
    || Object.is(parsed.origin.y, -0)
  ) return null;
  const payload: RegionalPlayerTravelSavePayloadV2 = {
    version: REGIONAL_PLAYER_TRAVEL_VERSION,
    stream: parsed.stream,
    cartography: parsed.cartography,
    origin: { x: parsed.origin.x as number, y: parsed.origin.y as number },
  };
  if (hashCanonical(payload) !== parsed.integrity) return null;
  if (stableStringify({ ...payload, integrity: parsed.integrity }) !== text) return null;
  const stream = restoreTerrainRegionStreamingState(rootSeed, payload.stream);
  const cartography = restoreRegionalCartography(rootSeed, payload.cartography);
  if (!stream || !cartography) return null;
  const window = createRegionalTerrainWindow(rootSeed, stream, payload.origin);
  if (!validateCurrentPlayerAgainstWindow(player, cartography, window)) return null;
  return sealState({ stream, window, cartography });
}

function restoreLegacyPlayerRegionalTravel(
  rootSeed: RootSeed,
  player: PlayerState,
  parsed: Readonly<Record<string, unknown>>,
  text: string,
): RegionalPlayerTravelState | null {
  if (!exactKeys(parsed, ["cartography", "integrity", "stream", "version"])) return null;
  if (
    typeof parsed.stream !== "string"
    || typeof parsed.cartography !== "string"
    || typeof parsed.integrity !== "string"
    || !HASH_PATTERN.test(parsed.integrity)
  ) return null;
  const payload: RegionalPlayerTravelSavePayloadV1 = {
    version: LEGACY_REGIONAL_PLAYER_TRAVEL_VERSION,
    stream: parsed.stream,
    cartography: parsed.cartography,
  };
  if (hashCanonical(payload) !== parsed.integrity) return null;
  if (stableStringify({ ...payload, integrity: parsed.integrity }) !== text) return null;
  const stream = restoreTerrainRegionStreamingState(rootSeed, payload.stream);
  const cartography = restoreRegionalCartography(rootSeed, payload.cartography);
  if (!stream || !cartography) return null;
  const window = migrateLegacyWindowPlayer(rootSeed, player, stream, cartography);
  return window === null ? null : sealState({ stream, window, cartography });
}

/** Persist all latest chart marks before serializing the bounded stream. */
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
  const payload: RegionalPlayerTravelSavePayloadV2 = {
    version: REGIONAL_PLAYER_TRAVEL_VERSION,
    stream: serializeRegionStreamingState(current.stream),
    cartography: serializeRegionalCartography(current.cartography),
    origin: { x: current.window.origin.x, y: current.window.origin.y },
  };
  const encoded = stableStringify({ ...payload, integrity: hashCanonical(payload) });
  if (UTF8_ENCODER.encode(encoded).byteLength > REGIONAL_PLAYER_TRAVEL_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional player travel exceeds its save budget");
  }
  return encoded;
}

/** Advance storage residency and/or the bounded presentation frame invisibly. */
export function recenterRegionalPlayer(
  rootSeed: RootSeed,
  state: RegionalPlayerTravelState,
  player: PlayerState,
): RegionalPlayerTransition {
  const trusted = requireState(state);
  assertRuntimePlayerWindow(player, trusted.window);
  const playerIndex = playerTileIndexInWindow(player);
  const destination = requiredAddress(trusted.window, playerIndex);
  const from = trusted.stream.center;
  const crossed = regionKey(destination.region) !== regionKey(from);
  const nextOrigin = shiftedRegionalFrameOrigin(
    trusted.window,
    Math.floor(player.x / TILE_UNITS),
    Math.floor(player.y / TILE_UNITS),
  );
  const rebased = nextOrigin.x !== trusted.window.origin.x
    || nextOrigin.y !== trusted.window.origin.y;
  const frameDeltaTiles = Object.freeze({
    x: trusted.window.origin.x - nextOrigin.x,
    y: trusted.window.origin.y - nextOrigin.y,
  });
  if (!crossed && !rebased) {
    return deepFreeze({
      state: trusted,
      crossed: false,
      rebased: false,
      from,
      to: from,
      frameDeltaTiles,
      generatedKeys: [],
      evictedKeys: [],
    });
  }

  // Dense window knowledge is folded into sparse canonical cartography only
  // when the frame/storage owner actually changes (and explicitly on save),
  // not on every 100 ms player step.
  const current = capturePlayerRegionalTravel(trusted, player);

  const priorPosition = pointAddress(current.window, player.x, player.y);
  const priorPrevious = pointAddress(current.window, player.previousX, player.previousY);
  const currentTraceAddresses = player.currentTrace.map((index) => requiredAddress(current.window, index));
  const surveyTraceAddresses = player.surveyTrace.map((index) => requiredAddress(current.window, index));
  const sweepAddresses = player.sweepPath.map((index) => requiredAddress(current.window, index));
  const streamTransition = crossed
    ? moveRegionStreamingCenter(
        current.stream,
        destination.region,
        createTerrainRegionGenerator(rootSeed),
      )
    : {
        state: current.stream,
        generatedKeys: [] as readonly string[],
        evictedKeys: [] as readonly string[],
      };
  const window = rebased
    ? createRegionalTerrainWindow(rootSeed, streamTransition.state, nextOrigin)
    : rebindRegionalTerrainWindowCenter(current.window, streamTransition.state.center);
  const position = pointInWindow(window, priorPosition);
  if (!position) throw new RangeError("Player position is absent from the shifted spatial frame");
  const previous = pointInWindow(window, priorPrevious) ?? position;

  player.x = position.x;
  player.y = position.y;
  player.previousX = previous.x;
  player.previousY = previous.y;
  player.worldWidth = REGIONAL_TRAVEL_COLUMNS;
  player.worldHeight = REGIONAL_TRAVEL_ROWS;
  applyWindowKnowledge(player, projectRegionalCartographyWindow(current.cartography, window));
  const currentIndex = playerTileIndexInWindow(player);
  player.currentTrace = mapAddressTraceSuffix(window, currentTraceAddresses, currentIndex);
  player.surveyTrace = mapAddressTraceSuffix(window, surveyTraceAddresses, currentIndex);
  player.sweepPath = mapCompleteAddressTrace(window, sweepAddresses);
  validateOrRestartSweep(player, window, currentIndex);

  return deepFreeze({
    state: sealState({
      stream: streamTransition.state,
      window,
      cartography: current.cartography,
    }),
    crossed,
    rebased,
    from,
    to: streamTransition.state.center,
    frameDeltaTiles,
    generatedKeys: streamTransition.generatedKeys,
    evictedKeys: streamTransition.evictedKeys,
  });
}

/** Re-address one derived local path while retaining each canonical tile. */
export function rebaseRegionalWindowPath(
  prior: RegionalTerrainWindow,
  next: RegionalTerrainWindow,
  path: readonly number[],
): number[] {
  const mapped: number[] = [];
  for (const index of path) {
    const address = requiredAddress(prior, index);
    const nextIndex = regionTileIndexToWindowIndex(
      next,
      address.region,
      address.localY * WORLD_WIDTH + address.localX,
    );
    if (nextIndex === null) return [];
    mapped.push(nextIndex);
  }
  return mapped;
}

function validateCurrentPlayerAgainstWindow(
  player: PlayerState,
  cartography: RegionalCartographyState,
  window: RegionalTerrainWindow,
): boolean {
  if (
    player.worldWidth !== REGIONAL_TRAVEL_COLUMNS
    || player.worldHeight !== REGIONAL_TRAVEL_ROWS
    || player.discovered.length !== window.terrain.tiles.length
    || player.depthSoundings.length !== window.terrain.tiles.length
    || !playerPointInsideWindow(player.x, player.y)
    || !playerPointInsideWindow(player.previousX, player.previousY)
    || !traceInsideWindow(player.currentTrace)
    || !traceInsideWindow(player.surveyTrace)
    || !traceInsideWindow(player.sweepPath)
  ) return false;
  const projected = projectRegionalCartographyWindow(cartography, window);
  return stableStringify(projected.discovered) === stableStringify(player.discovered)
    && stableStringify(projected.depthSoundings) === stableStringify(player.depthSoundings);
}

/** Validate the exact shipped 98×74 geometry before translating it. */
function migrateLegacyWindowPlayer(
  rootSeed: RootSeed,
  player: PlayerState,
  stream: RegionStreamingState<TerrainState>,
  cartography: RegionalCartographyState,
): RegionalTerrainWindow | null {
  try {
    if (
      player.worldWidth !== LEGACY_REGIONAL_TRAVEL_COLUMNS
      || player.worldHeight !== LEGACY_REGIONAL_TRAVEL_ROWS
      || player.discovered.length !== LEGACY_REGIONAL_TRAVEL_COLUMNS * LEGACY_REGIONAL_TRAVEL_ROWS
      || player.depthSoundings.length !== LEGACY_REGIONAL_TRAVEL_COLUMNS * LEGACY_REGIONAL_TRAVEL_ROWS
      || !legacyPlayerPointInsideWindow(player.x, player.y)
      || !legacyPlayerPointInsideWindow(player.previousX, player.previousY)
      || !legacyTraceInsideWindow(player.currentTrace)
      || !legacyTraceInsideWindow(player.surveyTrace)
      || !legacyTraceInsideWindow(player.sweepPath)
    ) return null;

    const knowledgeByRegion = new Map<string, ReturnType<typeof projectRegionalCartographyRegion>>();
    const knowledgeAt = (address: RegionTileAddress, kind: "discovered" | "depthSoundings"): number => {
      const key = regionKey(address.region);
      let regional = knowledgeByRegion.get(key);
      if (!regional) {
        regional = projectRegionalCartographyRegion(cartography, address.region);
        knowledgeByRegion.set(key, regional);
      }
      const values = kind === "discovered" ? regional.discovered : regional.depthSoundings;
      return values[address.localY * WORLD_WIDTH + address.localX] ?? 0;
    };
    const count = LEGACY_REGIONAL_TRAVEL_COLUMNS * LEGACY_REGIONAL_TRAVEL_ROWS;
    for (let index = 0; index < count; index += 1) {
      const address = legacyWindowAddress(stream.center, index);
      if (
        player.discovered[index] !== knowledgeAt(address, "discovered")
        || player.depthSoundings[index] !== knowledgeAt(address, "depthSoundings")
      ) return null;
    }

    const position = legacyPointAddress(stream.center, player.x, player.y);
    const previous = legacyPointAddress(stream.center, player.previousX, player.previousY);
    const currentAddresses = player.currentTrace.map((index) => legacyWindowAddress(stream.center, index));
    const surveyAddresses = player.surveyTrace.map((index) => legacyWindowAddress(stream.center, index));
    const sweepAddresses = player.sweepPath.map((index) => legacyWindowAddress(stream.center, index));
    const window = createRegionalTerrainWindow(
      rootSeed,
      stream,
      regionalFrameOriginAtAddress(position.address),
    );
    const nextPosition = pointInWindow(window, position);
    const nextPrevious = pointInWindow(window, previous);
    if (!nextPosition || !nextPrevious) return null;

    player.x = nextPosition.x;
    player.y = nextPosition.y;
    player.previousX = nextPrevious.x;
    player.previousY = nextPrevious.y;
    player.worldWidth = REGIONAL_TRAVEL_COLUMNS;
    player.worldHeight = REGIONAL_TRAVEL_ROWS;
    applyWindowKnowledge(player, projectRegionalCartographyWindow(cartography, window));
    const currentIndex = playerTileIndexInWindow(player);
    player.currentTrace = mapAddressTraceSuffix(window, currentAddresses, currentIndex);
    player.surveyTrace = mapAddressTraceSuffix(window, surveyAddresses, currentIndex);
    player.sweepPath = mapCompleteAddressTrace(window, sweepAddresses);
    validateOrRestartSweep(player, window, currentIndex);
    return window;
  } catch {
    return null;
  }
}

function validateOrRestartSweep(
  player: PlayerState,
  window: RegionalTerrainWindow,
  currentIndex: number,
): void {
  if (player.mode === "swept") {
    let priorSweepIndex = currentIndex;
    for (const sweepIndex of player.sweepPath) {
      const priorSweepTile = window.terrain.tiles[priorSweepIndex];
      const sweepTile = window.terrain.tiles[sweepIndex];
      if (
        !priorSweepTile
        || !sweepTile
        || Math.abs(priorSweepTile.x - sweepTile.x)
          + Math.abs(priorSweepTile.y - sweepTile.y) !== 1
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
}

function mapAddressTraceSuffix(
  window: RegionalTerrainWindow,
  addresses: readonly RegionTileAddress[],
  currentIndex: number,
): number[] {
  const mapped = addresses.map((address) => regionTileIndexToWindowIndex(
    window,
    address.region,
    address.localY * WORLD_WIDTH + address.localX,
  ));
  let lastMissing = -1;
  mapped.forEach((value, index) => {
    if (value === null) lastMissing = index;
  });
  const suffix = mapped.slice(lastMissing + 1).filter((value): value is number => value !== null);
  if (suffix.at(-1) !== currentIndex) suffix.push(currentIndex);
  return suffix.length > 0 ? suffix : [currentIndex];
}

function mapCompleteAddressTrace(
  window: RegionalTerrainWindow,
  addresses: readonly RegionTileAddress[],
): number[] {
  const mapped: number[] = [];
  for (const address of addresses) {
    const index = regionTileIndexToWindowIndex(
      window,
      address.region,
      address.localY * WORLD_WIDTH + address.localX,
    );
    if (index === null) return [];
    mapped.push(index);
  }
  return mapped;
}

function legacyWindowAddress(center: RegionCoord, index: number): RegionTileAddress {
  if (
    !Number.isSafeInteger(index)
    || index < 0
    || index >= LEGACY_REGIONAL_TRAVEL_COLUMNS * LEGACY_REGIONAL_TRAVEL_ROWS
  ) throw new RangeError("Legacy regional path contains an invalid tile");
  const windowX = index % LEGACY_REGIONAL_TRAVEL_COLUMNS;
  const windowY = Math.floor(index / LEGACY_REGIONAL_TRAVEL_COLUMNS);
  const origin = regionLocalToGlobalTile(center, 0, 0);
  return globalTileToRegion(
    origin.x + windowX - LEGACY_REGIONAL_TRAVEL_HALO_TILES,
    origin.y + windowY - LEGACY_REGIONAL_TRAVEL_HALO_TILES,
  );
}

function legacyPointAddress(center: RegionCoord, x: number, y: number): AddressedPoint {
  if (!legacyPlayerPointInsideWindow(x, y)) {
    throw new RangeError("Legacy regional player point is outside its window");
  }
  const tileX = Math.floor(x / TILE_UNITS);
  const tileY = Math.floor(y / TILE_UNITS);
  return {
    address: legacyWindowAddress(center, tileY * LEGACY_REGIONAL_TRAVEL_COLUMNS + tileX),
    offsetX: x - tileX * TILE_UNITS,
    offsetY: y - tileY * TILE_UNITS,
  };
}

function compatibilityPointAddress(
  x: number,
  y: number,
  width: number,
  height: number,
): AddressedPoint {
  if (!pointInsideDimensions(x, y, width, height)) {
    throw new RangeError("Compatibility player point is outside its world");
  }
  const tileX = Math.floor(x / TILE_UNITS);
  const tileY = Math.floor(y / TILE_UNITS);
  return {
    address: { region: COMPATIBILITY_REGION, localX: tileX, localY: tileY },
    offsetX: x - tileX * TILE_UNITS,
    offsetY: y - tileY * TILE_UNITS,
  };
}

function legacyPlayerPointInsideWindow(x: number, y: number): boolean {
  return pointInsideDimensions(
    x,
    y,
    LEGACY_REGIONAL_TRAVEL_COLUMNS,
    LEGACY_REGIONAL_TRAVEL_ROWS,
  );
}

function legacyTraceInsideWindow(trace: readonly number[]): boolean {
  return Array.isArray(trace) && trace.every((index) => Number.isSafeInteger(index)
    && index >= 0
    && index < LEGACY_REGIONAL_TRAVEL_COLUMNS * LEGACY_REGIONAL_TRAVEL_ROWS);
}

function compatibilityTraceAddresses(
  trace: readonly number[],
  compatibilityWidth: number,
  compatibilityHeight: number,
): RegionTileAddress[] {
  return trace.map((index) => {
    if (
      !Number.isSafeInteger(index)
      || index < 0
      || index >= compatibilityWidth * compatibilityHeight
    ) throw new RangeError("Compatibility player trace contains an invalid tile");
    const localX = index % compatibilityWidth;
    const localY = Math.floor(index / compatibilityWidth);
    return {
      region: COMPATIBILITY_REGION,
      localX,
      localY,
    };
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
  if (!playerPointInsideWindow(x, y)) {
    throw new RangeError("Player point is outside the regional frame");
  }
  const tileX = Math.floor(x / TILE_UNITS);
  const tileY = Math.floor(y / TILE_UNITS);
  return {
    address: requiredAddress(window, tileY * window.terrain.width + tileX),
    offsetX: x - tileX * TILE_UNITS,
    offsetY: y - tileY * TILE_UNITS,
  };
}

function pointInWindow(
  window: RegionalTerrainWindow,
  point: AddressedPoint,
): { readonly x: number; readonly y: number } | null {
  const local = regionLocalToWindowTile(
    window,
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
    throw new RangeError("Regional player path contains an invalid frame tile");
  }
  const address = window.addresses[index];
  if (!address) throw new RangeError("Regional player path lost a stable address");
  return address;
}

function playerTileIndexInWindow(player: PlayerState): number {
  if (!playerPointInsideWindow(player.x, player.y)) {
    throw new RangeError("Regional player point is outside the floating frame");
  }
  return Math.floor(player.y / TILE_UNITS) * REGIONAL_TRAVEL_COLUMNS
    + Math.floor(player.x / TILE_UNITS);
}

function playerPointInsideWindow(x: number, y: number): boolean {
  return pointInsideDimensions(x, y, REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS);
}

function pointInsideDimensions(x: number, y: number, width: number, height: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= TILE_UNITS / 2
    && x <= width * TILE_UNITS - TILE_UNITS / 2
    && y >= TILE_UNITS / 2
    && y <= height * TILE_UNITS - TILE_UNITS / 2;
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
  ) throw new RangeError("Player does not match the active regional frame");
}

function sealState(value: Omit<RegionalPlayerTravelState, "version">): RegionalPlayerTravelState {
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
