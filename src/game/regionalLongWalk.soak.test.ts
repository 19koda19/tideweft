import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  globalTileToRegion,
  regionKey,
  regionLocalToGlobalTile,
  type GlobalTileCoord,
  type RegionCoord,
  type RegionTileAddress,
} from "../sim/regions";
import { FIXED_POINT, WORLD_WIDTH, type TerrainState } from "../sim/types";
import {
  REGIONAL_CARTOGRAPHY_MAX_SERIALIZED_BYTES,
  captureRegionalCartographyWindow,
  createRegionalCartography,
  projectRegionalCartographyWindow,
  restoreRegionalCartography,
  serializeRegionalCartography,
  type RegionalCartographyState,
} from "./regionalCartography";
import { rebaseRegionalWindowPath } from "./regionalPlayerTravel";
import {
  MOBILE_REGION_STREAMING_CONFIG,
  REGION_STREAMING_MAX_SAVE_BYTES,
  createRegionStreamingState,
  moveRegionStreamingCenter,
  regionStreamContentHash,
  restoreRegionStreamingState,
  serializeRegionStreamingState,
  type GeneratedStreamRegion,
  type RegionStreamGenerator,
  type RegionStreamingState,
} from "./regionStreaming";
import {
  REGIONAL_TRAVEL_CENTER_X,
  REGIONAL_TRAVEL_CENTER_Y,
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_SAFE_MAX_X,
  REGIONAL_TRAVEL_SAFE_MAX_Y,
  REGIONAL_TRAVEL_SAFE_MIN_X,
  REGIONAL_TRAVEL_SAFE_MIN_Y,
  REGIONAL_TRAVEL_SHIFT_TILES,
  regionTileIndexToWindowIndex,
  regionalWindowTileAddress,
  shiftedRegionalFrameOrigin,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  isWorldPosition,
  rebaseSpatialFramePoint,
  spatialFrameToWorldPosition,
  translateWorldPosition,
  worldPositionToGlobalFixed,
  worldPositionToSpatialFrame,
  type SpatialFrame,
  type SpatialFramePoint,
  type WorldPosition,
} from "./worldPosition";

interface SoakRegion {
  readonly key: string;
}

interface Direction {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
}

interface KnownMark {
  readonly discovered: number;
  readonly depthSounding: number;
}

const ROOT_SEED = seedFromText("a porter can walk home through every moving horizon");
const STEP_TILES = REGIONAL_TRAVEL_SHIFT_TILES * 3;
const TILE_UNITS = WORLD_POSITION_UNITS_PER_TILE;
const FRAME_WIDTH_UNITS = REGIONAL_TRAVEL_COLUMNS * TILE_UNITS;
const FRAME_HEIGHT_UNITS = REGIONAL_TRAVEL_ROWS * TILE_UNITS;
const FRAME_TILE_COUNT = REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS;
const FAST_TERRAIN: TerrainState = {
  width: REGIONAL_TRAVEL_COLUMNS,
  height: REGIONAL_TRAVEL_ROWS,
  tiles: Array.from({ length: FRAME_TILE_COUNT }, (_, index) => ({
    index,
    x: index % REGIONAL_TRAVEL_COLUMNS,
    y: Math.floor(index / REGIONAL_TRAVEL_COLUMNS),
    elevation: 0,
    moisture: 0,
    roughness: 0,
    terrain: "meadow" as const,
    baseTravelCost: FIXED_POINT,
    traceStrength: 0,
  })),
};

const FAST_GENERATOR: RegionStreamGenerator<SoakRegion> = (
  coord,
): GeneratedStreamRegion<SoakRegion> => {
  const key = regionKey(coord);
  const value = Object.freeze({ key });
  return Object.freeze({
    coord: Object.freeze({ x: coord.x, y: coord.y }),
    key,
    regionId: `soak:${key}`,
    contentHash: regionStreamContentHash(value),
    value,
  });
};

function addressKey(address: RegionTileAddress): string {
  return `${regionKey(address.region)}:${address.localX}:${address.localY}`;
}

function tileAddress(position: WorldPosition): RegionTileAddress {
  return Object.freeze({
    region: position.region,
    localX: Math.floor(position.localX / TILE_UNITS),
    localY: Math.floor(position.localY / TILE_UNITS),
  });
}

function frameOriginTile(frame: SpatialFrame): GlobalTileCoord {
  if (frame.origin.localX % TILE_UNITS !== 0 || frame.origin.localY % TILE_UNITS !== 0) {
    throw new Error("Soak frame origin lost tile alignment");
  }
  return regionLocalToGlobalTile(
    frame.origin.region,
    frame.origin.localX / TILE_UNITS,
    frame.origin.localY / TILE_UNITS,
  );
}

function spatialFrameAt(origin: GlobalTileCoord): SpatialFrame {
  const address = globalTileToRegion(origin.x, origin.y);
  return createSpatialFrame(
    createWorldPosition(
      address.region,
      address.localX * TILE_UNITS,
      address.localY * TILE_UNITS,
    ),
    FRAME_WIDTH_UNITS,
    FRAME_HEIGHT_UNITS,
  );
}

/** Only path indexes are materialized; the production mapper needs no terrain samples. */
function pathWindow(
  center: RegionCoord,
  origin: GlobalTileCoord,
  path: readonly number[] = [],
): RegionalTerrainWindow {
  const addresses = Array<RegionTileAddress>(FRAME_TILE_COUNT);
  for (const index of path) {
    const x = index % REGIONAL_TRAVEL_COLUMNS;
    const y = Math.floor(index / REGIONAL_TRAVEL_COLUMNS);
    addresses[index] = regionalWindowTileAddress(origin, x, y);
  }
  return {
    center,
    origin,
    terrain: FAST_TERRAIN,
    addresses,
  };
}

/** Full address materialization is reserved for periodic cartography audits. */
function fullWindow(center: RegionCoord, origin: GlobalTileCoord): RegionalTerrainWindow {
  const addresses: RegionTileAddress[] = [];
  for (let y = 0; y < REGIONAL_TRAVEL_ROWS; y += 1) {
    for (let x = 0; x < REGIONAL_TRAVEL_COLUMNS; x += 1) {
      addresses.push(regionalWindowTileAddress(origin, x, y));
    }
  }
  return {
    center,
    origin,
    terrain: FAST_TERRAIN,
    addresses,
  };
}

function playerFramePoint(frame: SpatialFrame, player: WorldPosition): SpatialFramePoint {
  const point = worldPositionToSpatialFrame(frame, player);
  if (!point) throw new Error("Soak player left the bounded spatial frame");
  return point;
}

function plannedPath(point: SpatialFramePoint, direction: Direction): readonly number[] {
  const playerX = Math.floor(point.x / TILE_UNITS);
  const playerY = Math.floor(point.y / TILE_UNITS);
  return Object.freeze(Array.from({ length: 7 }, (_, offset) => {
    const x = playerX + direction.x * offset;
    const y = playerY + direction.y * offset;
    if (
      x < 0
      || x >= REGIONAL_TRAVEL_COLUMNS
      || y < 0
      || y >= REGIONAL_TRAVEL_ROWS
    ) throw new Error("Soak route fixture left its prior frame");
    return y * REGIONAL_TRAVEL_COLUMNS + x;
  }));
}

function pathKeys(origin: GlobalTileCoord, path: readonly number[]): readonly string[] {
  return path.map((index) => addressKey(regionalWindowTileAddress(
    origin,
    index % REGIONAL_TRAVEL_COLUMNS,
    Math.floor(index / REGIONAL_TRAVEL_COLUMNS),
  )));
}

function serpentineOutbound(): readonly Direction[] {
  const result: Direction[] = [];
  for (let row = 0; row < 26; row += 1) {
    const horizontal = row % 2 === 0 ? 1 : -1;
    for (let column = 0; column < 80; column += 1) {
      result.push({ x: horizontal, y: 0 });
    }
    // Move to the next row through a corner, then undo only the lateral part.
    result.push({ x: horizontal, y: 1 });
    result.push({ x: horizontal === 1 ? -1 : 1, y: 0 });
  }
  return Object.freeze(result);
}

function reverseDirections(directions: readonly Direction[]): readonly Direction[] {
  return Object.freeze([...directions].reverse().map((direction): Direction => ({
    x: direction.x === 0 ? 0 : direction.x === 1 ? -1 : 1,
    y: direction.y === 0 ? 0 : direction.y === 1 ? -1 : 1,
  })));
}

function captureAndAuditKnowledge(
  cartography: RegionalCartographyState,
  stream: RegionStreamingState<SoakRegion>,
  frame: SpatialFrame,
  player: WorldPosition,
  ordinal: number,
  known: Map<string, KnownMark>,
): RegionalCartographyState {
  const origin = frameOriginTile(frame);
  const window = fullWindow(stream.center, origin);
  const point = playerFramePoint(frame, player);
  const playerIndex = Math.floor(point.y / TILE_UNITS) * REGIONAL_TRAVEL_COLUMNS
    + Math.floor(point.x / TILE_UNITS);
  const discovered = Array.from({ length: FRAME_TILE_COUNT }, () => 0);
  const depthSoundings = Array.from({ length: FRAME_TILE_COUNT }, () => 0);
  const learned = 500_000 + ordinal % 400_001;
  const sounded = 200_000 + ordinal % 300_001;
  discovered[playerIndex] = learned;
  depthSoundings[playerIndex] = sounded;
  const next = captureRegionalCartographyWindow(
    cartography,
    window,
    discovered,
    depthSoundings,
  );
  const playerAddress = window.addresses[playerIndex];
  if (!playerAddress) throw new Error("Soak knowledge lost the player address");
  const key = addressKey(playerAddress);
  const prior = known.get(key);
  known.set(key, {
    discovered: Math.max(prior?.discovered ?? 0, learned),
    depthSounding: Math.max(prior?.depthSounding ?? 0, sounded),
  });

  const addressKeys = window.addresses.map(addressKey);
  if (new Set(addressKeys).size !== FRAME_TILE_COUNT) {
    throw new Error("Sliding frame duplicated a canonical address");
  }
  const projection = projectRegionalCartographyWindow(next, window);
  for (let index = 0; index < FRAME_TILE_COUNT; index += 1) {
    const expected = known.get(addressKeys[index] ?? "");
    if (
      projection.discovered[index] !== (expected?.discovered ?? 0)
      || projection.depthSoundings[index] !== (expected?.depthSounding ?? 0)
    ) throw new Error("Cartography either revealed or forgot canonical knowledge");
  }
  return next;
}

function roundtripWorldPosition(position: WorldPosition): WorldPosition {
  const parsed: unknown = JSON.parse(JSON.stringify(position));
  if (!isWorldPosition(parsed)) throw new Error("Saved world position was not canonical");
  return createWorldPosition(parsed.region, parsed.localX, parsed.localY);
}

describe("seamless regional long-walk soak", () => {
  it("returns exactly after thousands of serpentine frame and storage crossings", () => {
    const started = performance.now();
    const initialPlayer = createWorldPosition(
      { x: -20, y: -10 },
      48 * TILE_UNITS + 443,
      36 * TILE_UNITS + 321,
    );
    let player = initialPlayer;
    const initialFrameOrigin = translateWorldPosition(
      player,
      -(REGIONAL_TRAVEL_CENTER_X * TILE_UNITS + 443),
      -(REGIONAL_TRAVEL_CENTER_Y * TILE_UNITS + 321),
    );
    let frame = createSpatialFrame(initialFrameOrigin, FRAME_WIDTH_UNITS, FRAME_HEIGHT_UNITS);
    let stream = createRegionStreamingState({
      rootSeed: ROOT_SEED,
      generator: FAST_GENERATOR,
      center: player.region,
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    let cartography = createRegionalCartography(ROOT_SEED);
    const known = new Map<string, KnownMark>();
    cartography = captureAndAuditKnowledge(cartography, stream, frame, player, 0, known);

    const outbound = serpentineOutbound();
    const journey = [...outbound, ...reverseDirections(outbound)];
    let frameRebases = 0;
    let storageCrossings = 0;
    let diagonalRebases = 0;
    let maximumLoaded = stream.loaded.length;
    let duplicateLoadedIdentity = false;
    let pathReset = false;
    let lastPath: readonly number[] = [];
    let lastPathKeys: readonly string[] = [];
    let largestStreamSave = 0;
    let largestCartographySave = 0;
    let minimumRegionX = player.region.x;
    let maximumRegionX = player.region.x;
    let minimumRegionY = player.region.y;
    let maximumRegionY = player.region.y;

    for (let ordinal = 0; ordinal < journey.length; ordinal += 1) {
      const direction = journey[ordinal];
      if (!direction) throw new Error("Soak journey lost a direction");
      player = translateWorldPosition(
        player,
        direction.x * STEP_TILES * TILE_UNITS,
        direction.y * STEP_TILES * TILE_UNITS,
      );
      const priorPoint = playerFramePoint(frame, player);
      const priorOrigin = frameOriginTile(frame);
      const priorPath = plannedPath(priorPoint, direction);
      const priorWindow = pathWindow(stream.center, priorOrigin, priorPath);
      const nextOrigin = shiftedRegionalFrameOrigin(
        priorWindow,
        Math.floor(priorPoint.x / TILE_UNITS),
        Math.floor(priorPoint.y / TILE_UNITS),
      );
      const nextFrame = spatialFrameAt(nextOrigin);
      const rebasedPoint = rebaseSpatialFramePoint(frame, nextFrame, priorPoint);
      if (!rebasedPoint) throw new Error("Exact player point vanished during frame rebase");
      const destination = tileAddress(player).region;
      if (regionKey(destination) !== regionKey(stream.center)) {
        stream = moveRegionStreamingCenter(stream, destination, FAST_GENERATOR).state;
        storageCrossings += 1;
      }
      const nextWindow = pathWindow(stream.center, nextOrigin);
      const mappedPath = rebaseRegionalWindowPath(priorWindow, nextWindow, priorPath);
      const canonicalPath = pathKeys(priorOrigin, priorPath);
      if (
        mappedPath.length !== priorPath.length
        || pathKeys(nextOrigin, mappedPath).some((key, index) => key !== canonicalPath[index])
      ) pathReset = true;
      lastPath = mappedPath;
      lastPathKeys = canonicalPath;
      frame = nextFrame;
      frameRebases += 1;
      if (direction.x !== 0 && direction.y !== 0) diagonalRebases += 1;

      const exactPoint = playerFramePoint(frame, player);
      if (
        exactPoint.x !== rebasedPoint.x
        || exactPoint.y !== rebasedPoint.y
        || exactPoint.x < REGIONAL_TRAVEL_SAFE_MIN_X * TILE_UNITS
        || exactPoint.x >= (REGIONAL_TRAVEL_SAFE_MAX_X + 1) * TILE_UNITS
        || exactPoint.y < REGIONAL_TRAVEL_SAFE_MIN_Y * TILE_UNITS
        || exactPoint.y >= (REGIONAL_TRAVEL_SAFE_MAX_Y + 1) * TILE_UNITS
        || spatialFrameToWorldPosition(frame, exactPoint).region.x !== player.region.x
        || spatialFrameToWorldPosition(frame, exactPoint).region.y !== player.region.y
        || spatialFrameToWorldPosition(frame, exactPoint).localX !== player.localX
        || spatialFrameToWorldPosition(frame, exactPoint).localY !== player.localY
      ) throw new Error("Player world address drifted during the long walk");

      maximumLoaded = Math.max(maximumLoaded, stream.loaded.length);
      minimumRegionX = Math.min(minimumRegionX, player.region.x);
      maximumRegionX = Math.max(maximumRegionX, player.region.x);
      minimumRegionY = Math.min(minimumRegionY, player.region.y);
      maximumRegionY = Math.max(maximumRegionY, player.region.y);
      if (
        new Set(stream.loaded.map(({ key }) => key)).size !== stream.loaded.length
        || new Set(stream.loaded.map(({ regionId }) => regionId)).size !== stream.loaded.length
      ) duplicateLoadedIdentity = true;

      if ((ordinal + 1) % 256 === 0 || ordinal === outbound.length - 1) {
        cartography = captureAndAuditKnowledge(
          cartography,
          stream,
          frame,
          player,
          ordinal + 1,
          known,
        );
        largestStreamSave = Math.max(
          largestStreamSave,
          serializeRegionStreamingState(stream).length,
        );
        largestCartographySave = Math.max(
          largestCartographySave,
          serializeRegionalCartography(cartography).length,
        );
      }

      if (ordinal === outbound.length - 1) {
        const streamText = serializeRegionStreamingState(stream);
        const cartographyText = serializeRegionalCartography(cartography);
        const restoredStream = restoreRegionStreamingState(
          ROOT_SEED,
          streamText,
          FAST_GENERATOR,
        );
        const restoredCartography = restoreRegionalCartography(ROOT_SEED, cartographyText);
        if (!restoredStream || !restoredCartography) {
          throw new Error("Long-walk save failed to restore");
        }
        stream = restoredStream;
        cartography = restoredCartography;
        player = roundtripWorldPosition(player);
        frame = createSpatialFrame(
          roundtripWorldPosition(frame.origin),
          frame.width,
          frame.height,
        );
        if (
          serializeRegionStreamingState(stream) !== streamText
          || serializeRegionalCartography(cartography) !== cartographyText
        ) throw new Error("Long-walk save changed during canonical reload");
        const restoredWindow = pathWindow(stream.center, frameOriginTile(frame));
        const restoredPath = lastPathKeys.map((key, index) => {
          const priorIndex = lastPath[index];
          if (priorIndex === undefined) throw new Error("Saved path lost an index");
          const address = globalTileToRegion(
            frameOriginTile(frame).x + priorIndex % REGIONAL_TRAVEL_COLUMNS,
            frameOriginTile(frame).y + Math.floor(priorIndex / REGIONAL_TRAVEL_COLUMNS),
          );
          if (addressKey(address) !== key) throw new Error("Saved path address changed");
          const mapped = regionTileIndexToWindowIndex(
            restoredWindow,
            address.region,
            address.localY * WORLD_WIDTH + address.localX,
          );
          if (mapped === null) throw new Error("Saved path did not reproject after reload");
          return mapped;
        });
        if (pathKeys(frameOriginTile(frame), restoredPath).some(
          (key, index) => key !== lastPathKeys[index],
        )) pathReset = true;
      }
    }

    cartography = captureAndAuditKnowledge(
      cartography,
      stream,
      frame,
      player,
      journey.length,
      known,
    );
    const finalStreamSave = serializeRegionStreamingState(stream);
    const finalCartographySave = serializeRegionalCartography(cartography);
    largestStreamSave = Math.max(largestStreamSave, finalStreamSave.length);
    largestCartographySave = Math.max(largestCartographySave, finalCartographySave.length);
    const elapsedMs = performance.now() - started;

    expect(frameRebases).toBe(journey.length);
    expect(frameRebases).toBeGreaterThan(4_000);
    expect(storageCrossings).toBeGreaterThan(2_000);
    expect(diagonalRebases).toBeGreaterThan(50);
    expect(minimumRegionX).toBeLessThan(0);
    expect(maximumRegionX).toBeGreaterThan(0);
    expect(minimumRegionY).toBeLessThan(0);
    expect(maximumRegionY).toBeGreaterThan(0);
    expect(player).toEqual(initialPlayer);
    expect(frame.origin).toEqual(initialFrameOrigin);
    expect(stream.center).toEqual(initialPlayer.region);
    expect(stream.transitionOrdinal).toBe(storageCrossings);
    expect(maximumLoaded).toBeLessThanOrEqual(MOBILE_REGION_STREAMING_CONFIG.maxLoadedRegions);
    expect(duplicateLoadedIdentity).toBe(false);
    expect(pathReset).toBe(false);
    expect(stream.manifest.regions).toEqual([]);
    expect(largestStreamSave).toBeLessThan(REGION_STREAMING_MAX_SAVE_BYTES);
    expect(largestStreamSave).toBeLessThan(1_024);
    expect(largestCartographySave).toBeLessThan(REGIONAL_CARTOGRAPHY_MAX_SERIALIZED_BYTES);
    expect(largestCartographySave).toBeLessThan(64 * 1_024);
    expect(elapsedMs).toBeLessThan(15_000);
  }, 20_000);

  it("keeps a thousand diagonal storage oscillations exact near the segmented limits", () => {
    const started = performance.now();
    const initialPlayer = createWorldPosition(
      { x: REGION_COORD_LIMIT - 100, y: -REGION_COORD_LIMIT + 100 },
      80 * TILE_UNITS + 777,
      60 * TILE_UNITS + 333,
    );
    let player = initialPlayer;
    const initialOrigin = translateWorldPosition(
      player,
      -(REGIONAL_TRAVEL_CENTER_X * TILE_UNITS + 777),
      -(REGIONAL_TRAVEL_CENTER_Y * TILE_UNITS + 333),
    );
    let frame = createSpatialFrame(initialOrigin, FRAME_WIDTH_UNITS, FRAME_HEIGHT_UNITS);
    let stream = createRegionStreamingState({
      rootSeed: ROOT_SEED,
      generator: FAST_GENERATOR,
      center: player.region,
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    let crossings = 0;

    for (let ordinal = 0; ordinal < 1_024; ordinal += 1) {
      const direction: Direction = ordinal % 2 === 0 ? { x: 1, y: 1 } : { x: -1, y: -1 };
      player = translateWorldPosition(
        player,
        direction.x * STEP_TILES * TILE_UNITS,
        direction.y * STEP_TILES * TILE_UNITS,
      );
      const priorPoint = playerFramePoint(frame, player);
      const priorOrigin = frameOriginTile(frame);
      const priorPath = plannedPath(priorPoint, direction);
      const priorWindow = pathWindow(stream.center, priorOrigin, priorPath);
      const nextOrigin = shiftedRegionalFrameOrigin(
        priorWindow,
        Math.floor(priorPoint.x / TILE_UNITS),
        Math.floor(priorPoint.y / TILE_UNITS),
      );
      const nextFrame = spatialFrameAt(nextOrigin);
      const nextPoint = rebaseSpatialFramePoint(frame, nextFrame, priorPoint);
      if (!nextPoint) throw new Error("Extreme player vanished during diagonal rebase");
      const destination = tileAddress(player).region;
      if (regionKey(destination) !== regionKey(stream.center)) {
        stream = moveRegionStreamingCenter(stream, destination, FAST_GENERATOR).state;
        crossings += 1;
      }
      const mappedPath = rebaseRegionalWindowPath(
        priorWindow,
        pathWindow(stream.center, nextOrigin),
        priorPath,
      );
      if (
        mappedPath.length !== priorPath.length
        || pathKeys(nextOrigin, mappedPath).some(
          (key, index) => key !== pathKeys(priorOrigin, priorPath)[index],
        )
        || spatialFrameToWorldPosition(nextFrame, nextPoint).region.x !== player.region.x
        || spatialFrameToWorldPosition(nextFrame, nextPoint).region.y !== player.region.y
        || spatialFrameToWorldPosition(nextFrame, nextPoint).localX !== player.localX
        || spatialFrameToWorldPosition(nextFrame, nextPoint).localY !== player.localY
      ) throw new Error("Extreme segmented address or route drifted");
      frame = nextFrame;
    }

    const window = fullWindow(stream.center, frameOriginTile(frame));
    expect(new Set(window.addresses.map(addressKey)).size).toBe(FRAME_TILE_COUNT);
    expect(crossings).toBe(1_024);
    expect(stream.transitionOrdinal).toBe(crossings);
    expect(stream.loaded.length).toBeLessThanOrEqual(MOBILE_REGION_STREAMING_CONFIG.maxLoadedRegions);
    expect(stream.manifest.regions).toEqual([]);
    expect(player).toEqual(initialPlayer);
    expect(frame.origin).toEqual(initialOrigin);
    expect(() => worldPositionToGlobalFixed(player)).toThrow(/safe-integer envelope/u);
    expect(performance.now() - started).toBeLessThan(5_000);
  }, 10_000);
});
