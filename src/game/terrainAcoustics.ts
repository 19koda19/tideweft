import { FIXED_POINT, type WorldView } from "../sim/types";
import type { AudibleContactInput } from "./perception";
import { livingSpeciesRegistryEntry } from "./livingSpeciesRegistry";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import { regionalAddressAt } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  isWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
  type SpatialFramePoint,
  type WorldPosition,
} from "./worldPosition";

/** Support is supplied by the physical cause, never guessed from a sound word. */
export type AcousticTerrainSupport = "surface" | "unmodeled";

export interface TerrainAcousticContext {
  readonly world: WorldView;
  readonly listenerPosition: WorldPosition;
  readonly sourcePosition: WorldPosition;
  readonly listenerSupport: AcousticTerrainSupport;
  readonly sourceSupport: AcousticTerrainSupport;
}

export interface TerrainAcousticTransmission {
  /** Normalized transmission, not a change to the committed source intensity. */
  readonly transmission: number;
  readonly scope: "surface-path" | "unmodeled-support" | "outside-frame";
  readonly visitedCells: number;
}

// Authored relief categories in normalized terrain units, NOT physical metres
// or optical opacity. A crest lowers transmission, but never becomes a binary
// sight gate; a sufficiently strong nearby sound may still cross it.
const SURFACE_CLEARANCE = 64_000;
const CREST_PRESSURE_SPAN = 256_000;
const MAX_CREST_MASK = 0.5;
const UNMODELED_SUPPORT: TerrainAcousticTransmission = Object.freeze({
  transmission: 1, scope: "unmodeled-support", visitedCells: 0,
});
const OUTSIDE_FRAME: TerrainAcousticTransmission = Object.freeze({
  transmission: 1, scope: "outside-frame", visitedCells: 0,
});

/** A 2D pose supports a surface voice only for a known terrestrial body. */
export function acousticTerrainSupportForSpecies(species: unknown): AcousticTerrainSupport {
  return livingSpeciesRegistryEntry(species)?.locomotionClass === "terrestrial"
    ? "surface" : "unmodeled";
}

/**
 * Walks only the bounded local surface path. Unknown airborne/submerged
 * support and missing off-frame geography retain the existing coarse hearing
 * law explicitly; neither claims that a terrain path was inspected and clear.
 * Malformed available geometry fails closed instead of becoming clear terrain.
 */
export function deriveTerrainAcousticTransmission(
  context: TerrainAcousticContext,
): TerrainAcousticTransmission | null {
  if (!context || !isWorldPosition(context.listenerPosition)
    || !isWorldPosition(context.sourcePosition)
    || !validSupport(context.listenerSupport) || !validSupport(context.sourceSupport)) return null;
  if (context.listenerSupport === "unmodeled" || context.sourceSupport === "unmodeled") {
    return UNMODELED_SUPPORT;
  }
  const world = context.world;
  const width = world?.terrain?.width;
  const height = world?.terrain?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width <= 0 || height <= 0
    || width > REGIONAL_TRAVEL_COLUMNS || height > REGIONAL_TRAVEL_ROWS
    || !Array.isArray(world.terrain.tiles)
    || world.terrain.tiles.length !== width * height) return null;
  const origin = regionalAddressAt(world, 0);
  if (origin === null) return null;
  let listener: SpatialFramePoint | null;
  let source: SpatialFramePoint | null;
  try {
    const frame = createSpatialFrame(createWorldPosition(
      origin.region, origin.localX * WORLD_POSITION_UNITS_PER_TILE,
      origin.localY * WORLD_POSITION_UNITS_PER_TILE,
    ), width * WORLD_POSITION_UNITS_PER_TILE, height * WORLD_POSITION_UNITS_PER_TILE);
    listener = worldPositionToSpatialFrame(frame, context.listenerPosition);
    source = worldPositionToSpatialFrame(frame, context.sourcePosition);
  } catch {
    return null;
  }
  if (listener === null || source === null) return OUTSIDE_FRAME;

  // Canonical direction makes reverse traversal and corner decisions identical.
  const reverse = listener.x > source.x || (listener.x === source.x && listener.y > source.y);
  const a = reverse ? source : listener;
  const b = reverse ? listener : source;
  const ax = Math.floor(a.x / WORLD_POSITION_UNITS_PER_TILE);
  const ay = Math.floor(a.y / WORLD_POSITION_UNITS_PER_TILE);
  const bx = Math.floor(b.x / WORLD_POSITION_UNITS_PER_TILE);
  const by = Math.floor(b.y / WORLD_POSITION_UNITS_PER_TILE);
  const surfaceAt = (x: number, y: number): number | null => {
    const index = y * width + x;
    const tile = world.terrain.tiles[index];
    return tile !== undefined && tile.index === index && tile.x === x && tile.y === y
      && fixedUnit(tile.elevation) && fixedUnit(tile.waterDepth)
      ? tile.elevation + tile.waterDepth : null;
  };
  const startSurface = surfaceAt(ax, ay);
  const endSurface = surfaceAt(bx, by);
  if (startSurface === null || endSurface === null) return null;
  if (ax === bx && ay === by) return Object.freeze({
    transmission: 1, scope: "surface-path", visitedCells: 0,
  });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const stepY = Math.sign(dy);
  let visitedCells = 0;
  let maximumExcess = 0;
  let malformed = false;
  // Supercover has at most three visits per crossed row/column, including
  // corner flanks. No full-field allocation, world scan, or retained cache.
  const maximumVisits = 3 * (width + height) + 4;
  const visit = (x: number, y: number, enteredAt: number, exitedAt = enteredAt): void => {
    if (x < 0 || y < 0 || x >= width || y >= height
      || (x === ax && y === ay) || (x === bx && y === by)) return;
    visitedCells += 1;
    if (visitedCells > maximumVisits) { malformed = true; return; }
    const surface = surfaceAt(x, y);
    if (surface === null) { malformed = true; return; }
    // Cell support is constant over the crossed segment. Its largest excess
    // occurs at the lower endpoint of the linear baseline, not its midpoint.
    const baseline = Math.min(
      startSurface + (endSurface - startSurface) * enteredAt,
      startSurface + (endSurface - startSurface) * exitedAt,
    );
    maximumExcess = Math.max(maximumExcess, surface - baseline);
  };
  let x = ax;
  let y = ay;
  let entered = 0;
  for (let crossings = 0; crossings <= width + height; crossings += 1) {
    const xDistance = dx === 0 ? Infinity
      : (x + 1) * WORLD_POSITION_UNITS_PER_TILE - a.x;
    const yDistance = dy === 0 ? Infinity
      : (stepY > 0 ? (y + 1) * WORLD_POSITION_UNITS_PER_TILE - a.y
        : a.y - y * WORLD_POSITION_UNITS_PER_TILE);
    const tx = dx === 0 ? Infinity : xDistance / dx;
    const ty = dy === 0 ? Infinity : yDistance / Math.abs(dy);
    const exited = Math.min(1, tx, ty);
    visit(x, y, entered, exited);
    // A ray lying on a cell edge touches both neighboring surface columns.
    if (dy === 0 && a.y % WORLD_POSITION_UNITS_PER_TILE === 0) visit(x, y - 1, entered, exited);
    if (dx === 0 && a.x % WORLD_POSITION_UNITS_PER_TILE === 0) visit(x - 1, y, entered, exited);
    if (malformed) return null;
    if (exited === 1) break;
    // Exact integer cross-products settle vertex ties without float epsilon.
    const crossX = xDistance * Math.abs(dy);
    const crossY = yDistance * dx;
    if (dx !== 0 && dy !== 0 && crossX === crossY) {
      visit(x + 1, y, exited);
      visit(x, y + stepY, exited);
      x += 1;
      y += stepY;
    } else if (tx < ty) {
      x += 1;
    } else {
      y += stepY;
    }
    if (malformed || x < 0 || y < 0 || x >= width || y >= height) return null;
    entered = exited;
  }
  const pressure = Math.max(0, Math.min(1,
    (maximumExcess - SURFACE_CLEARANCE) / CREST_PRESSURE_SPAN,
  ));
  return Object.freeze({
    transmission: 1 - MAX_CREST_MASK * pressure,
    scope: "surface-path", visitedCells,
  });
}

/** Shared pre-evaluation adapter; callers retain the exact evaluated tuple. */
export function prepareTerrainAudibleContactInput(
  input: AudibleContactInput,
  context: TerrainAcousticContext,
): AudibleContactInput | null {
  let delta: ReturnType<typeof worldPositionDelta>;
  try { delta = worldPositionDelta(context.listenerPosition, context.sourcePosition); }
  catch { return null; }
  if (input.source.x - input.listener.x !== delta.x
    || input.source.y - input.listener.y !== delta.y) return null;
  const path = deriveTerrainAcousticTransmission(context);
  if (path === null) return null;
  return path.transmission === 1 ? input : {
    ...input, sourceLoudness: input.sourceLoudness * path.transmission,
  };
}

function validSupport(value: unknown): value is AcousticTerrainSupport {
  return value === "surface" || value === "unmodeled";
}

function fixedUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 0 && value <= FIXED_POINT && !Object.is(value, -0);
}
