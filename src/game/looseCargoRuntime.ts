import { deriveBiomeProfile, deriveMagicalWaterInfluence } from "../sim/biomes";
import { seedFromText } from "../sim/rng";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import { surfaceCurrentDirection } from "./currentDirection";
import { regionalAddressAt, regionalTileIndexInView } from "./regionalWorldView";
import {
  LOOSE_CARGO_TILE_UNITS,
  looseCargoCarrierLoadMilli,
  projectLooseCargoCarrier,
  stepLooseCargo,
  type LooseCargoCarrierState,
  type LooseCargoPosition,
  type LooseCargoStepResult,
  type LooseCargoStepSample,
  type LooseCargoWorldState,
} from "./looseCargo";
import type { PlayerCargo } from "./player";

export const PLAYER_TO_LOOSE_CARGO_SCALE = 1_000 as const;

export interface LooseCargoLandscapeSignals {
  /** Exact rock/collision pressure at the parcel tile, fixed point 0..1. */
  readonly rockImpactAtTile?: (tileIndex: number) => number;
  /** Living cover is supplied only by a real ecology caller, never inferred. */
  readonly mangroveSnagAtTile?: (tileIndex: number) => number;
  readonly brambleSnagAtTile?: (tileIndex: number) => number;
}

export interface CarrierPlayerProjection {
  readonly craftingInventory: ReturnType<typeof projectLooseCargoCarrier>["craftingInventory"];
  readonly cargo: readonly PlayerCargo[];
  readonly combinedLoadMilli: number;
  readonly transportCondition: number | null;
  readonly contamination: number;
  readonly decay: number;
}

/**
 * Compatibility projection for the current one-Promise player model. Exact
 * carrier lots remain authoritative; differing recovered fragments are
 * grouped only for legacy display/delivery with quantity-weighted floor values.
 */
export function projectLooseCargoCarrierToPlayer(
  carrier: LooseCargoCarrierState,
): CarrierPlayerProjection {
  const projected = projectLooseCargoCarrier(carrier);
  const contractIds = [...new Set(projected.promises.map(({ contractId }) => contractId))]
    .sort((left, right) => left - right);
  if (contractIds.length > 1) {
    throw new RangeError("The current player model cannot carry more than one Promise contract");
  }
  const contractId = contractIds[0];
  if (contractId === undefined) {
    return {
      craftingInventory: projected.craftingInventory,
      cargo: [],
      combinedLoadMilli: looseCargoCarrierLoadMilli(carrier),
      transportCondition: null,
      contamination: 0,
      decay: 0,
    };
  }
  const promises = projected.promises
    .filter((promise) => promise.contractId === contractId)
    .sort((left, right) => left.condition - right.condition
      || (left.contamination ?? 0) - (right.contamination ?? 0)
      || (left.decay ?? 0) - (right.decay ?? 0));
  const first = promises[0];
  if (!first) throw new RangeError("Promise projection lost its contract definition");
  let quantity = 0;
  let conditionTotal = 0;
  let contaminationTotal = 0;
  let decayTotal = 0;
  for (const promise of promises) {
    quantity += promise.quantity;
    conditionTotal += promise.condition * promise.quantity;
    contaminationTotal += (promise.contamination ?? 0) * promise.quantity;
    decayTotal += (promise.decay ?? 0) * promise.quantity;
  }
  if (!Number.isSafeInteger(quantity)
    || quantity <= 0
    || !Number.isSafeInteger(conditionTotal)
    || !Number.isSafeInteger(contaminationTotal)
    || !Number.isSafeInteger(decayTotal)) {
    throw new RangeError("Promise lot aggregation exceeds safe integer bounds");
  }
  const condition = Math.floor(conditionTotal / quantity);
  const contamination = Math.floor(contaminationTotal / quantity);
  const decay = Math.floor(decayTotal / quantity);
  return {
    craftingInventory: projected.craftingInventory,
    cargo: [{
      contractId,
      resource: first.resource,
      quantity,
      condition,
      property: first.property,
    }],
    combinedLoadMilli: looseCargoCarrierLoadMilli(carrier),
    transportCondition: condition,
    contamination,
    decay,
  };
}

/** Convert the current player-space coordinates into fixed-point tile space. */
export function looseCargoPositionAtPlayer(
  x: number,
  y: number,
  region: LooseCargoPosition["region"] = { x: 0, y: 0 },
): LooseCargoPosition {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError("Player cargo position must use safe integer coordinates");
  }
  const cargoX = x * PLAYER_TO_LOOSE_CARGO_SCALE;
  const cargoY = y * PLAYER_TO_LOOSE_CARGO_SCALE;
  if (!Number.isSafeInteger(cargoX) || !Number.isSafeInteger(cargoY)) {
    throw new RangeError("Player cargo position exceeds safe fixed-point range");
  }
  return { region: { ...region }, x: cargoX, y: cargoY };
}

/** Convert one parcel position into the player/render coordinate scale. */
export function playerPositionAtLooseCargo(
  position: Pick<LooseCargoPosition, "x" | "y">,
): { readonly x: number; readonly y: number } {
  if (!Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y)) {
    throw new RangeError("Loose cargo position must use safe integer coordinates");
  }
  return {
    x: Math.trunc(position.x / PLAYER_TO_LOOSE_CARGO_SCALE),
    y: Math.trunc(position.y / PLAYER_TO_LOOSE_CARGO_SCALE),
  };
}

/** Convert a floating-window player point to its exact region-local cargo point. */
export function looseCargoPositionAtRegionalPlayer(
  world: WorldView,
  x: number,
  y: number,
): LooseCargoPosition {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError("Regional player cargo position must use safe integer coordinates");
  }
  const tileX = Math.floor(x / 1_000);
  const tileY = Math.floor(y / 1_000);
  const viewIndex = tileY * world.terrain.width + tileX;
  const address = regionalAddressAt(world, viewIndex);
  if (!address) throw new RangeError("Regional player cargo position is outside the active view");
  return looseCargoPositionAtPlayer(
    address.localX * 1_000 + (x - tileX * 1_000),
    address.localY * 1_000 + (y - tileY * 1_000),
    address.region,
  );
}

/** Project a region-local parcel back into the current floating player view. */
export function playerPositionAtRegionalLooseCargo(
  world: WorldView,
  position: LooseCargoPosition,
): { readonly x: number; readonly y: number } | null {
  const local = playerPositionAtLooseCargo(position);
  const localX = Math.floor(local.x / 1_000);
  const localY = Math.floor(local.y / 1_000);
  if (localX < 0 || localX >= WORLD_WIDTH || localY < 0) return null;
  const viewIndex = regionalTileIndexInView(
    world,
    position.region,
    localY * WORLD_WIDTH + localX,
  );
  const tile = viewIndex === null ? undefined : world.terrain.tiles[viewIndex];
  if (!tile) return null;
  return {
    x: tile.x * 1_000 + (local.x - localX * 1_000),
    y: tile.y * 1_000 + (local.y - localY * 1_000),
  };
}

/**
 * Build exactly one authoritative environment sample for every loaded parcel.
 * The returned order is the world's canonical stable-ID order; simulation does
 * not depend on caller array order, but keeping it canonical makes recordings
 * and integration tests directly comparable.
 */
export function sampleLooseCargoEnvironment(
  world: WorldView,
  cargo: LooseCargoWorldState,
  landscape: LooseCargoLandscapeSignals = {},
): readonly LooseCargoStepSample[] {
  if (
    cargo.width !== WORLD_WIDTH
    || cargo.height !== WORLD_HEIGHT
    || regionalTileIndexInView(world, cargo.region, 0) === null
    || regionalTileIndexInView(world, cargo.region, cargo.width * cargo.height - 1) === null
  ) {
    throw new RangeError("Regional cargo dimensions or active terrain do not match the world view");
  }
  const rootSeed = validRootSeed(world.rootSeed) ? world.rootSeed : seedFromText(world.seedText);
  const currentDirection = surfaceCurrentDirection(world.tide.direction, world.weather.windY);

  return cargo.entities.map((entity): LooseCargoStepSample => {
    const tileIndex = tileIndexAt(entity.x, entity.y, cargo.width, cargo.height);
    const viewTileIndex = cargoTileIndexInView(world, cargo, tileIndex);
    const tile = viewTileIndex === null ? undefined : world.terrain.tiles[viewTileIndex];
    if (!tile) throw new RangeError(`Loose cargo ${entity.id} is outside the active terrain`);
    const biome = deriveBiomeProfile({
      seed: rootSeed,
      tile,
      gridHeight: cargo.height,
      weather: world.weather,
      magicalWaterInfluence: deriveMagicalWaterInfluence(rootSeed, tile),
    });
    const waterDepth = unit(tile.waterDepth);
    const currentStrength = waterDepth <= 35_000
      ? 0
      : unit((waterDepth - 35_000) * 2 + Math.trunc(world.weather.intensity / 3));
    const downhill = downhillVector(world, cargo, tileIndex);
    const rain = world.weather.kind === "rain" || world.weather.kind === "storm"
      ? unit(world.weather.intensity)
      : 0;
    const heat = unit(biome.interaction.heatLoad);
    const cold = world.weather.kind === "mist" || world.weather.kind === "storm"
      ? unit(Math.max(0, 420_000 - biome.climate.heat) + Math.trunc(world.weather.intensity / 4))
      : unit(Math.max(0, 180_000 - biome.climate.heat));
    const magicalWaterFlux = multiplyUnit(waterDepth, biome.climate.magicalWater);
    const rockImpact = landscapeSignal(landscape.rockImpactAtTile, tileIndex, "rock impact");
    const mangroveSnag = landscapeSignal(landscape.mangroveSnagAtTile, tileIndex, "mangrove snag");
    const brambleSnag = landscapeSignal(landscape.brambleSnagAtTile, tileIndex, "bramble snag");
    const terrainImpact = tile.terrain === "ridge"
      ? Math.trunc(tile.roughness / 2)
      : Math.trunc(tile.roughness / 8);
    const parcelAlreadyMoving = entity.velocityX !== 0
      || entity.velocityY !== 0
      || entity.motion === "drifting"
      || entity.motion === "tumbling";
    const forcedToMove = currentStrength > 0 || downhill.x !== 0 || downhill.y !== 0;
    // Rough ground is not a damage-over-time aura. It can strike a moving or
    // newly forced parcel, but a dry parcel that has settled on level ground
    // retains its exact condition indefinitely.
    const activeImpact = parcelAlreadyMoving || forcedToMove
      ? Math.max(terrainImpact, rockImpact)
      : 0;

    return {
      entityId: entity.id,
      environment: {
        rain,
        heat,
        cold,
        immersion: waterDepth,
        currentX: multiplySignedUnit(currentDirection.x, currentStrength),
        currentY: multiplySignedUnit(currentDirection.y, currentStrength),
        magicalWaterFlux,
        impact: 0,
      },
      waterDepth,
      downhillX: downhill.x,
      downhillY: downhill.y,
      tumbleImpact: activeImpact,
      mangroveSnag,
      brambleSnag,
    };
  });
}

export function stepLooseCargoInCompatibilityWorld(
  world: WorldView,
  cargo: LooseCargoWorldState,
  landscape: LooseCargoLandscapeSignals = {},
): LooseCargoStepResult {
  try {
    return stepLooseCargo(cargo, sampleLooseCargoEnvironment(world, cargo, landscape));
  } catch {
    return { ok: false, reason: "invalid-sample", state: cargo, events: [] };
  }
}

/** Same authoritative kernel; the historical name remains as a compatible alias. */
export const stepLooseCargoInRegionalWorld = stepLooseCargoInCompatibilityWorld;

function downhillVector(
  world: WorldView,
  cargo: LooseCargoWorldState,
  tileIndex: number,
): { readonly x: number; readonly y: number } {
  const originViewIndex = cargoTileIndexInView(world, cargo, tileIndex);
  const origin = originViewIndex === null ? undefined : world.terrain.tiles[originViewIndex];
  if (!origin) return { x: 0, y: 0 };
  const localX = tileIndex % cargo.width;
  const localY = Math.floor(tileIndex / cargo.width);
  const candidates = [
    { x: 0, y: -1, index: tileIndex - cargo.width },
    { x: 1, y: 0, index: tileIndex + 1 },
    { x: 0, y: 1, index: tileIndex + cargo.width },
    { x: -1, y: 0, index: tileIndex - 1 },
  ].filter(({ x, y, index }) => localX + x >= 0 && localX + x < cargo.width
    && localY + y >= 0 && localY + y < cargo.height
    && index >= 0 && index < cargo.width * cargo.height);
  let selected: (typeof candidates)[number] | undefined;
  let drop = 0;
  for (const candidate of candidates) {
    const candidateViewIndex = cargoTileIndexInView(world, cargo, candidate.index);
    const tile = candidateViewIndex === null ? undefined : world.terrain.tiles[candidateViewIndex];
    if (!tile) continue;
    const candidateDrop = origin.elevation - tile.elevation;
    if (candidateDrop > drop) {
      selected = candidate;
      drop = candidateDrop;
    }
  }
  const pressure = unit(drop * 3);
  return selected ? { x: selected.x * pressure, y: selected.y * pressure } : { x: 0, y: 0 };
}

function cargoTileIndexInView(
  world: WorldView,
  cargo: LooseCargoWorldState,
  tileIndex: number,
): number | null {
  if (!Number.isSafeInteger(tileIndex) || tileIndex < 0 || tileIndex >= cargo.width * cargo.height) {
    return null;
  }
  if (cargo.width !== WORLD_WIDTH) return null;
  return regionalTileIndexInView(world, cargo.region, tileIndex);
}

function tileIndexAt(x: number, y: number, width: number, height: number): number {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0) return -1;
  const tileX = Math.floor(x / LOOSE_CARGO_TILE_UNITS);
  const tileY = Math.floor(y / LOOSE_CARGO_TILE_UNITS);
  if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) return -1;
  return tileY * width + tileX;
}

function multiplyUnit(left: number, right: number): number {
  return Math.trunc((unit(left) * unit(right)) / FIXED_POINT);
}

function multiplySignedUnit(direction: number, strength: number): number {
  const boundedDirection = Math.max(-FIXED_POINT, Math.min(FIXED_POINT, Math.trunc(direction)));
  return Math.trunc((boundedDirection * unit(strength)) / FIXED_POINT);
}

function unit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function landscapeSignal(
  sample: ((tileIndex: number) => number) | undefined,
  tileIndex: number,
  label: string,
): number {
  if (!sample) return 0;
  const value = sample(tileIndex);
  if (!Number.isSafeInteger(value) || value < 0 || value > FIXED_POINT) {
    throw new RangeError(`Loose-cargo ${label} must be an integer from 0 to ${FIXED_POINT}`);
  }
  return value;
}

function validRootSeed(value: WorldView["rootSeed"]): value is readonly [number, number, number, number] {
  return Array.isArray(value)
    && value.length === 4
    && value.every((word) => Number.isSafeInteger(word) && word >= 0 && word <= 0xffff_ffff);
}
