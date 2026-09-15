import {
  MAX_OUTDOOR_LOCAL_LIGHT_SOURCES,
  evaluateOutdoorIllumination,
  outdoorTerrainTransmission,
  outdoorWeatherTransmission,
  type OutdoorIlluminationSample,
  type OutdoorLocalLightSource,
} from "../sim/outdoorIllumination";
import type { RegionCoord } from "../sim/regions";
import {
  FIXED_POINT,
  type TerrainTileView,
  type WorldView,
} from "../sim/types";
import { compareText, hashCanonical } from "../sim/util";
import {
  WORLD_DAY_ILLUMINATION,
  WORLD_NIGHT_ILLUMINATION,
  projectWorldTime,
} from "../sim/worldTime";
import {
  MAX_PERCEPTION_GRID_CELLS,
  evaluateLineTransmission,
  type PerceptionCell,
} from "./perception";
import {
  regionalAddressAt,
  regionalCompatibilityWorldForWorld,
  isImmutableRegionalWorldView,
  regionalTileIndexInView,
} from "./regionalWorldView";

export const SETTLEMENT_LAMP_PEAK_INTENSITY = 780_000 as const;
export const SETTLEMENT_LAMP_RADIUS_TILES = 12 as const;
export const OUTDOOR_ILLUMINATION_FIELD_VERSION = 1 as const;
export const MAX_CACHED_OUTDOOR_ILLUMINATION_FIELDS = 4 as const;

const COMPATIBILITY_SETTLEMENT_REGION: RegionCoord = Object.freeze({ x: 0, y: 0 });
const TERRAIN_KINDS = new Set<string>([
  "deep-water",
  "tidal-flat",
  "marsh",
  "meadow",
  "ridge",
]);

interface PerceptionCellCacheEntry {
  readonly geometrySignature: string;
  readonly cells: readonly PerceptionCell[];
}

interface IndexedSettlementLampCandidate {
  readonly distanceSquared: number;
  readonly sourceTileIndex: number;
  readonly stableId: string;
  readonly position: OutdoorLocalLightSource["position"];
}

interface SettlementLampIndex {
  /** Canonical signature of every completed persisted beacon, including remote ones. */
  readonly signature: string;
  readonly intensity: number;
  /** Each target owns at most the nearest MAX_OUTDOOR_LOCAL_LIGHT_SOURCES entries. */
  readonly candidatesByTarget: readonly (
    readonly IndexedSettlementLampCandidate[] | undefined
  )[];
}

interface WorldLightGeometry {
  readonly signature: string;
  readonly cells: readonly PerceptionCell[];
}

interface WorldLightGeometryScan {
  readonly signature: string;
  readonly occupiedSettlementTiles: ReadonlySet<number>;
}

interface CompletedBeaconDescriptor {
  readonly originKey: string;
  readonly projectId: number;
  readonly status: "complete";
  readonly tileIndex: number;
}

interface GeometryHashState {
  high: number;
  low: number;
}

export interface OutdoorIlluminationField {
  readonly version: typeof OUTDOOR_ILLUMINATION_FIELD_VERSION;
  /** Hash of physical light inputs; deliberately excludes the raw clock tick. */
  readonly cacheKey: string;
  readonly columns: number;
  readonly rows: number;
  /** Row-major local-source contribution before it is combined with ambient light. */
  readonly localIllumination: readonly number[];
  /** Row-major authoritative fixed-point physical illumination. */
  readonly physicalIllumination: readonly number[];
}

const perceptionCellCache = new WeakMap<object, PerceptionCellCacheEntry>();
/**
 * Regional views are internally constructed immutable geometry snapshots.
 * Cache their validated geometry by view identity so dozens of perception and
 * presentation consumers in one world step do not each rescan 14,400 tiles.
 * Caller-owned/unmanaged views deliberately keep the full mutation-safe scan.
 */
const managedRegionalGeometryCache = new WeakMap<object, WorldLightGeometry>();
const managedSettlementLampIndexCache = new WeakMap<object, SettlementLampIndex>();
const illuminationFieldCache = new Map<string, OutdoorIlluminationField>();

/**
 * Builds the shared physical terrain/structure surface consumed by both F0
 * sight and outdoor-light rays. Mutable caller-owned arrays are revalidated and
 * fingerprinted before an identity-cache hit is accepted; world time and
 * presentation never enter this geometry.
 */
export function buildWorldPerceptionCells(
  world: WorldView,
): readonly PerceptionCell[] | null {
  return prepareWorldLightGeometry(world)?.cells ?? null;
}

/**
 * Returns the current fixed-point lamp output. Beacon lamps rise through dusk,
 * remain steady at night, and fall through dawn by inverting the same eased
 * open-sky curve that owns the day phase. They are fully off in daylight.
 */
export function settlementLampIntensityAtTick(tick: number): number | null {
  const time = projectWorldTime(tick);
  if (time === null) return null;
  const illuminationRange = WORLD_DAY_ILLUMINATION - WORLD_NIGHT_ILLUMINATION;
  const darkness = Math.max(
    0,
    Math.min(
      FIXED_POINT,
      Math.trunc(
        (WORLD_DAY_ILLUMINATION - time.illumination) * FIXED_POINT
        / illuminationRange,
      ),
    ),
  );
  return multiplyFixed(SETTLEMENT_LAMP_PEAK_INTENSITY, darkness);
}

/**
 * Derives at most one physical lamp from each completed persisted beacon whose
 * settlement is inside the current seamless spatial frame and whose light can
 * reach the requested target. No lamp sidecar or renderer state is created.
 */
export function deriveSettlementLampSources(
  world: WorldView,
  targetTileIndex: number,
  cells?: readonly PerceptionCell[],
): readonly OutdoorLocalLightSource[] | null {
  const geometry = prepareWorldLightGeometry(world, cells);
  if (geometry === null || !validTarget(world, targetTileIndex)) return null;
  const lamps = buildSettlementLampIndex(world);
  if (lamps === null) return null;
  return deriveSettlementLampSourcesFromIndex(
    world,
    targetTileIndex,
    geometry.cells,
    lamps,
  );
}

/** Samples one tile using authoritative time, weather, terrain, and real lamps. */
export function sampleOutdoorIlluminationAtTile(
  world: WorldView,
  targetTileIndex: number,
  cells?: readonly PerceptionCell[],
): OutdoorIlluminationSample | null {
  const geometry = prepareWorldLightGeometry(world, cells);
  if (geometry === null || !validTarget(world, targetTileIndex)) return null;
  const lamps = buildSettlementLampIndex(world);
  if (lamps === null) return null;
  return sampleOutdoorIlluminationAtTileFromIndex(
    world,
    targetTileIndex,
    geometry.cells,
    lamps,
  );
}

/**
 * Produces a stable key for every input that can alter the current full-view
 * physical light field. Two steady-night ticks intentionally share a key;
 * dusk/dawn illumination, weather, beacon completion, spatial movement, and
 * terrain/occlusion changes do not.
 */
export function outdoorIlluminationCacheKey(
  world: WorldView,
  cells?: readonly PerceptionCell[],
): string | null {
  const geometry = prepareWorldLightGeometry(world, cells);
  if (geometry === null) return null;
  const lamps = buildSettlementLampIndex(world);
  if (lamps === null) return null;
  return outdoorIlluminationCacheKeyFromInputs(world, geometry.signature, lamps);
}

/**
 * Builds and caches one bounded row-major physical-light field. The expensive
 * lamp rays are evaluated only when a physical input represented by the cache
 * key changes, rather than once per render frame or once per consumer.
 */
export function buildOutdoorIlluminationField(
  world: WorldView,
  cells?: readonly PerceptionCell[],
): OutdoorIlluminationField | null {
  const geometry = prepareWorldLightGeometry(world, cells);
  if (geometry === null) return null;
  const lamps = buildSettlementLampIndex(world);
  if (lamps === null) return null;
  const cacheKey = outdoorIlluminationCacheKeyFromInputs(
    world,
    geometry.signature,
    lamps,
  );
  if (cacheKey === null) return null;
  const cached = illuminationFieldCache.get(cacheKey);
  if (cached) {
    // Refresh insertion order so the tiny cache behaves as deterministic LRU.
    illuminationFieldCache.delete(cacheKey);
    illuminationFieldCache.set(cacheKey, cached);
    return cached;
  }

  const localIllumination: number[] = [];
  const physicalIllumination: number[] = [];
  const time = projectWorldTime(world.completedTick);
  if (time === null || !validIlluminationWeather(world)) return null;
  const weatherTransmission = outdoorWeatherTransmission(
    world.weather.kind,
    world.weather.intensity,
  );
  const radiusSquared = SETTLEMENT_LAMP_RADIUS_TILES ** 2;
  for (let index = 0; index < world.terrain.tiles.length; index += 1) {
    const tile = world.terrain.tiles[index];
    if (tile === undefined) return null;
    const ambient = multiplyFixed(
      multiplyFixed(time.illumination, weatherTransmission),
      outdoorTerrainTransmission(tile.terrain, tile.roughness),
    );
    let local = 0;
    for (const candidate of lamps.candidatesByTarget[index] ?? []) {
      const lineTransmission = evaluateLineTransmission({
        columns: world.terrain.width,
        rows: world.terrain.height,
        cells: geometry.cells,
        fromTileIndex: candidate.sourceTileIndex,
        toTileIndex: index,
      });
      if (lineTransmission === null) return null;
      const lineTransmissionFixed = Math.round(lineTransmission * FIXED_POINT);
      if (!fixedUnit(lineTransmissionFixed)) return null;
      const attenuation = Math.trunc(
        ((radiusSquared - candidate.distanceSquared) * FIXED_POINT) / radiusSquared,
      );
      local = Math.min(
        FIXED_POINT,
        local + multiplyFixed(
          multiplyFixed(
            multiplyFixed(lamps.intensity, attenuation),
            lineTransmissionFixed,
          ),
          weatherTransmission,
        ),
      );
    }
    localIllumination.push(local);
    physicalIllumination.push(Math.min(FIXED_POINT, ambient + local));
  }
  const field = Object.freeze({
    version: OUTDOOR_ILLUMINATION_FIELD_VERSION,
    cacheKey,
    columns: world.terrain.width,
    rows: world.terrain.height,
    localIllumination: Object.freeze(localIllumination),
    physicalIllumination: Object.freeze(physicalIllumination),
  });
  illuminationFieldCache.set(cacheKey, field);
  while (illuminationFieldCache.size > MAX_CACHED_OUTDOOR_ILLUMINATION_FIELDS) {
    const oldestKey = illuminationFieldCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    illuminationFieldCache.delete(oldestKey);
  }
  return field;
}

function perceptionObstruction(tile: TerrainTileView, occupied: boolean): number {
  if (occupied) return 0.72;
  if (tile.terrain === "ridge") return 0.76;
  if (tile.terrain === "marsh") return 0.34;
  if (tile.terrain === "meadow" && tile.roughness >= 880_000) return 0.5;
  return 0;
}

function prepareWorldLightGeometry(
  world: WorldView,
  suppliedCells?: readonly PerceptionCell[],
): WorldLightGeometry | null {
  const managedRegionalView = isImmutableRegionalWorldView(world);
  const managedCached = managedRegionalView
    ? managedRegionalGeometryCache.get(world)
    : undefined;
  if (
    managedCached !== undefined
    && (suppliedCells === undefined || suppliedCells === managedCached.cells)
  ) return managedCached;

  const scan = scanWorldLightGeometry(world);
  if (scan === null) return null;

  let cells: readonly PerceptionCell[];
  if (suppliedCells !== undefined) {
    if (
      !Array.isArray(suppliedCells)
      || suppliedCells.length !== world.terrain.tiles.length
    ) return null;
    for (let index = 0; index < suppliedCells.length; index += 1) {
      const tile = world.terrain.tiles[index];
      const cell = suppliedCells[index];
      if (
        tile === undefined
        || !validPerceptionCell(cell)
        || cell.elevation !== tile.elevation / FIXED_POINT
        || cell.obstruction !== perceptionObstruction(
          tile,
          scan.occupiedSettlementTiles.has(index),
        )
      ) return null;
    }
    cells = suppliedCells;
  } else {
    const cached = perceptionCellCache.get(world.terrain.tiles);
    if (cached?.geometrySignature === scan.signature) {
      cells = cached.cells;
    } else {
      const derived = world.terrain.tiles.map((tile, index) => Object.freeze({
        elevation: tile.elevation / FIXED_POINT,
        obstruction: perceptionObstruction(
          tile,
          scan.occupiedSettlementTiles.has(index),
        ),
      }));
      cells = Object.freeze(derived);
      perceptionCellCache.set(world.terrain.tiles, Object.freeze({
        geometrySignature: scan.signature,
        cells,
      }));
    }
  }

  const geometry = Object.freeze({
    signature: scan.signature,
    cells,
  });
  // Never retain externally supplied arrays. The internal no-argument path
  // creates and freezes its own cells from the immutable regional snapshot.
  if (managedRegionalView && suppliedCells === undefined) {
    managedRegionalGeometryCache.set(world, geometry);
  }
  return geometry;
}

/**
 * Revalidates every mutable source value and creates a canonical two-lane
 * geometry fingerprint. Identity alone is never evidence that a view stayed
 * unchanged, and the prior collision-prone 32-bit digest is not trusted.
 */
function scanWorldLightGeometry(world: WorldView): WorldLightGeometryScan | null {
  if (!validWorldGrid(world)) return null;
  const settlementTiles = canonicalSettlementTiles(world);
  if (settlementTiles === null) return null;
  const occupiedSettlementTiles = new Set(settlementTiles);
  const hash: GeometryHashState = {
    high: 0x811c_9dc5,
    low: 0x9e37_79b9,
  };
  appendGeometryHashInteger(hash, 0x4745_4f31);
  appendGeometryHashInteger(hash, world.terrain.width);
  appendGeometryHashInteger(hash, world.terrain.height);
  appendGeometryHashInteger(hash, settlementTiles.length);
  for (const tileIndex of settlementTiles) appendGeometryHashInteger(hash, tileIndex);
  appendGeometryHashInteger(hash, world.terrain.tiles.length);
  for (let index = 0; index < world.terrain.tiles.length; index += 1) {
    const tile = world.terrain.tiles[index];
    if (!validTerrainTile(tile, index, world.terrain.width)) return null;
    appendGeometryHashInteger(hash, index);
    appendGeometryHashInteger(hash, terrainKindOrdinal(tile.terrain));
    appendGeometryHashInteger(hash, tile.elevation);
    appendGeometryHashInteger(hash, tile.roughness);
    appendGeometryHashInteger(
      hash,
      Math.round(perceptionObstruction(tile, occupiedSettlementTiles.has(index)) * FIXED_POINT),
    );
  }
  return Object.freeze({
    signature: geometryHashSignature(hash),
    occupiedSettlementTiles,
  });
}

/**
 * Builds one source index for the complete field. Source influence is expanded
 * over its fixed radius once, and each target retains only its nearest bounded
 * candidates before any line-of-sight ray is evaluated.
 */
function buildSettlementLampIndex(world: WorldView): SettlementLampIndex | null {
  const managedRegionalView = isImmutableRegionalWorldView(world);
  const managedCached = managedRegionalView
    ? managedSettlementLampIndexCache.get(world)
    : undefined;
  if (managedCached !== undefined) return managedCached;
  const economy = regionalCompatibilityWorldForWorld(world) ?? world;
  if (!Array.isArray(economy.settlements)) return null;
  const intensity = settlementLampIntensityAtTick(world.completedTick);
  if (intensity === null) return null;
  const beacons: CompletedBeaconDescriptor[] = [];
  for (const settlement of economy.settlements) {
    if (!plainRecord(settlement)) return null;
    const project = settlement.project;
    if (!plainRecord(project)) return null;
    if (project.kind !== "beacon" || project.status !== "complete") {
      continue;
    }
    const projectId = project.id;
    const tileIndex = settlement.tileIndex;
    if (
      typeof settlement.originKey !== "string"
      || settlement.originKey.length === 0
      || settlement.originKey.length > 512
      || typeof projectId !== "number"
      || !Number.isSafeInteger(projectId)
      || projectId < 0
      || typeof tileIndex !== "number"
      || !Number.isSafeInteger(tileIndex)
      || tileIndex < 0
    ) return null;
    beacons.push({
      originKey: settlement.originKey,
      projectId,
      status: "complete",
      tileIndex,
    });
  }
  beacons.sort((left, right) =>
    compareText(left.originKey, right.originKey)
    || left.projectId - right.projectId
    || left.tileIndex - right.tileIndex);
  for (let index = 1; index < beacons.length; index += 1) {
    const previous = beacons[index - 1];
    const current = beacons[index];
    if (previous === undefined || current === undefined) return null;
    if (
      previous?.originKey === current?.originKey
      && previous.projectId === current.projectId
    ) return null;
  }
  const frozenBeacons = Object.freeze(beacons.map((beacon) => Object.freeze(beacon)));
  const candidatesByTarget: Array<IndexedSettlementLampCandidate[] | undefined> =
    Array.from({ length: world.terrain.tiles.length });
  if (intensity > 0) {
    const radiusSquared = SETTLEMENT_LAMP_RADIUS_TILES ** 2;
    for (const beacon of frozenBeacons) {
      const sourceTileIndex = regionalTileIndexInView(
        world,
        COMPATIBILITY_SETTLEMENT_REGION,
        beacon.tileIndex,
      );
      if (sourceTileIndex === null) continue;
      const position = regionalAddressAt(world, sourceTileIndex);
      if (position === null) return null;
      const stableId = `sl1:${hashCanonical({
        originKey: beacon.originKey,
        projectId: beacon.projectId,
        projectStatus: beacon.status,
      })}`;
      const sourceX = sourceTileIndex % world.terrain.width;
      const sourceY = Math.floor(sourceTileIndex / world.terrain.width);
      for (
        let targetY = Math.max(0, sourceY - SETTLEMENT_LAMP_RADIUS_TILES);
        targetY <= Math.min(world.terrain.height - 1, sourceY + SETTLEMENT_LAMP_RADIUS_TILES);
        targetY += 1
      ) {
        const deltaY = targetY - sourceY;
        for (
          let targetX = Math.max(0, sourceX - SETTLEMENT_LAMP_RADIUS_TILES);
          targetX <= Math.min(world.terrain.width - 1, sourceX + SETTLEMENT_LAMP_RADIUS_TILES);
          targetX += 1
        ) {
          const deltaX = targetX - sourceX;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;
          if (distanceSquared >= radiusSquared) continue;
          const targetTileIndex = targetY * world.terrain.width + targetX;
          const candidate = Object.freeze({
            distanceSquared,
            sourceTileIndex,
            stableId,
            position,
          });
          const candidates = candidatesByTarget[targetTileIndex] ?? [];
          insertBoundedLampCandidate(candidates, candidate);
          candidatesByTarget[targetTileIndex] = candidates;
        }
      }
    }
  }

  const index = Object.freeze({
    signature: hashCanonical(frozenBeacons),
    intensity,
    candidatesByTarget: Object.freeze(Array.from(
      { length: candidatesByTarget.length },
      (_, index) => {
        const candidates = candidatesByTarget[index];
        return candidates === undefined ? undefined : Object.freeze(candidates);
      },
    )),
  });
  if (managedRegionalView) managedSettlementLampIndexCache.set(world, index);
  return index;
}

function insertBoundedLampCandidate(
  candidates: IndexedSettlementLampCandidate[],
  candidate: IndexedSettlementLampCandidate,
): void {
  candidates.push(candidate);
  candidates.sort(compareLampCandidates);
  if (candidates.length > MAX_OUTDOOR_LOCAL_LIGHT_SOURCES) candidates.pop();
}

function compareLampCandidates(
  left: IndexedSettlementLampCandidate,
  right: IndexedSettlementLampCandidate,
): number {
  return left.distanceSquared - right.distanceSquared
    || compareText(left.stableId, right.stableId);
}

function deriveSettlementLampSourcesFromIndex(
  world: WorldView,
  targetTileIndex: number,
  cells: readonly PerceptionCell[],
  lamps: SettlementLampIndex,
): readonly OutdoorLocalLightSource[] | null {
  if (lamps.intensity === 0) return Object.freeze([]);
  const candidates = lamps.candidatesByTarget[targetTileIndex] ?? [];
  if (candidates.length > MAX_OUTDOOR_LOCAL_LIGHT_SOURCES) return null;
  const sources: OutdoorLocalLightSource[] = [];
  for (const candidate of candidates) {
    const lineTransmission = evaluateLineTransmission({
      columns: world.terrain.width,
      rows: world.terrain.height,
      cells,
      fromTileIndex: candidate.sourceTileIndex,
      toTileIndex: targetTileIndex,
    });
    if (lineTransmission === null) return null;
    const lineTransmissionFixed = Math.round(lineTransmission * FIXED_POINT);
    if (!fixedUnit(lineTransmissionFixed)) return null;
    sources.push(Object.freeze({
      stableId: candidate.stableId,
      kind: "settlement-lamp",
      position: candidate.position,
      intensity: lamps.intensity,
      radiusTiles: SETTLEMENT_LAMP_RADIUS_TILES,
      lineTransmission: lineTransmissionFixed,
    }));
  }
  return Object.freeze(sources);
}

function sampleOutdoorIlluminationAtTileFromIndex(
  world: WorldView,
  targetTileIndex: number,
  cells: readonly PerceptionCell[],
  lamps: SettlementLampIndex,
): OutdoorIlluminationSample | null {
  if (!validTarget(world, targetTileIndex)) return null;
  const target = regionalAddressAt(world, targetTileIndex);
  const tile = world.terrain.tiles[targetTileIndex];
  const localLights = deriveSettlementLampSourcesFromIndex(
    world,
    targetTileIndex,
    cells,
    lamps,
  );
  if (target === null || tile === undefined || localLights === null) return null;
  return evaluateOutdoorIllumination({
    tick: world.completedTick,
    weather: world.weather,
    target,
    terrain: { kind: tile.terrain, roughness: tile.roughness },
    // No distinct physical canopy/interior owner is live yet. Terrain already
    // contributes its bounded sky-view term; later cover plugs in here without
    // changing clock, lamp identity, or perception geometry.
    coverTransmission: FIXED_POINT,
    localLights,
  });
}

function outdoorIlluminationCacheKeyFromInputs(
  world: WorldView,
  geometrySignature: string,
  lamps: SettlementLampIndex,
): string | null {
  if (!validWorldGrid(world) || !validIlluminationWeather(world)) return null;
  const time = projectWorldTime(world.completedTick);
  const firstAddress = regionalAddressAt(world, 0);
  const lastAddress = regionalAddressAt(world, world.terrain.tiles.length - 1);
  if (time === null || firstAddress === null || lastAddress === null) return null;
  return `outdoor-light-v${OUTDOOR_ILLUMINATION_FIELD_VERSION}:${hashCanonical({
    beaconSignature: lamps.signature,
    columns: world.terrain.width,
    firstAddress,
    lastAddress,
    lampIntensity: lamps.intensity,
    openSkyIllumination: time.illumination,
    rows: world.terrain.height,
    terrainSignature: geometrySignature,
    weatherIntensity: world.weather.intensity,
    weatherKind: world.weather.kind,
  })}`;
}

function validPerceptionCell(value: unknown): value is PerceptionCell {
  return plainRecord(value)
    && typeof value.elevation === "number"
    && Number.isFinite(value.elevation)
    && value.elevation >= 0
    && value.elevation <= 1
    && typeof value.obstruction === "number"
    && Number.isFinite(value.obstruction)
    && value.obstruction >= 0
    && value.obstruction <= 1;
}

function terrainKindOrdinal(kind: TerrainTileView["terrain"]): number {
  switch (kind) {
    case "deep-water": return 1;
    case "tidal-flat": return 2;
    case "marsh": return 3;
    case "meadow": return 4;
    case "ridge": return 5;
  }
}

function appendGeometryHashInteger(hash: GeometryHashState, value: number): void {
  const canonical = value >>> 0;
  for (let shift = 0; shift < 32; shift += 8) {
    const byte = (canonical >>> shift) & 0xff;
    hash.high = Math.imul(hash.high ^ byte, 0x0100_0193) >>> 0;
    hash.low = Math.imul(hash.low ^ byte, 0x85eb_ca6b) >>> 0;
    hash.low ^= hash.high >>> 13;
  }
}

function geometryHashSignature(hash: GeometryHashState): string {
  return `${hash.high.toString(16).padStart(8, "0")}${(hash.low >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function validWorldGrid(world: WorldView): boolean {
  return typeof world === "object"
    && world !== null
    && typeof world.terrain === "object"
    && world.terrain !== null
    && Number.isSafeInteger(world.terrain.width)
    && world.terrain.width > 0
    && Number.isSafeInteger(world.terrain.height)
    && world.terrain.height > 0
    && Number.isSafeInteger(world.terrain.width * world.terrain.height)
    && world.terrain.width * world.terrain.height <= MAX_PERCEPTION_GRID_CELLS
    && Array.isArray(world.terrain.tiles)
    && world.terrain.tiles.length === world.terrain.width * world.terrain.height
    && Array.isArray(world.settlements);
}

function canonicalSettlementTiles(world: WorldView): readonly number[] | null {
  const result: number[] = [];
  for (const settlement of world.settlements) {
    if (
      !plainRecord(settlement)
      || !Number.isSafeInteger(settlement.tileIndex)
      || settlement.tileIndex < 0
      || settlement.tileIndex >= world.terrain.tiles.length
    ) return null;
    result.push(settlement.tileIndex);
  }
  return result.sort((left, right) => left - right);
}

function validTerrainTile(
  tile: TerrainTileView | undefined,
  expectedIndex: number,
  width: number,
): tile is TerrainTileView {
  return typeof tile === "object"
    && tile !== null
    && tile.index === expectedIndex
    && tile.x === expectedIndex % width
    && tile.y === Math.floor(expectedIndex / width)
    && TERRAIN_KINDS.has(tile.terrain)
    && fixedUnit(tile.elevation)
    && fixedUnit(tile.roughness)
    && fixedUnit(tile.waterDepth);
}

function validTarget(world: WorldView, targetTileIndex: number): boolean {
  return validWorldGrid(world)
    && validIlluminationWeather(world)
    && Number.isSafeInteger(world.completedTick)
    && world.completedTick >= 0
    && Number.isSafeInteger(targetTileIndex)
    && targetTileIndex >= 0
    && targetTileIndex < world.terrain.tiles.length
    && validTerrainTile(
      world.terrain.tiles[targetTileIndex],
      targetTileIndex,
      world.terrain.width,
    );
}

function validIlluminationWeather(world: WorldView): boolean {
  return plainRecord(world.weather)
    && (world.weather.kind === "clear"
      || world.weather.kind === "mist"
      || world.weather.kind === "rain"
      || world.weather.kind === "storm")
    && fixedUnit(world.weather.intensity);
}

function fixedUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= FIXED_POINT;
}

function multiplyFixed(left: number, right: number): number {
  // Every caller supplies fixed-point units in 0..1e6, so the largest product
  // is 1e12: well inside JavaScript's exact-integer envelope. Keeping this hot
  // full-field path numeric avoids tens of thousands of needless BigInt
  // allocations while preserving bit-identical integer truncation.
  return Math.trunc((left * right) / FIXED_POINT);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
