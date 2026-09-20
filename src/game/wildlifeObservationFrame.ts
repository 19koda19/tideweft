import { globalTileToRegion } from "../sim/regions";
import {
  hasValidPerceptionSignature,
  type PerceptionResult,
} from "./perception";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const WILDLIFE_OBSERVATION_FRAME_VERSION = 1 as const;

export interface WildlifeObservationWindow {
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly terrain: Readonly<{ width: number; height: number }>;
}

export interface WildlifeObservationFrame {
  readonly version: typeof WILDLIFE_OBSERVATION_FRAME_VERSION;
  readonly window: WildlifeObservationWindow;
  readonly playerTileIndex: number;
  readonly playerPoint: Readonly<{ x: number; y: number }>;
  readonly frameOrigin: WorldPosition;
  readonly detailVisibilityGradeAt: (tileIndex: number) => number | undefined;
  readonly terrainVisibilityStrengthAt: (tileIndex: number) => number | undefined;
}

export interface WildlifeObservationFrameInput {
  readonly window: WildlifeObservationWindow;
  readonly perception: PerceptionResult;
}

const AUTHENTIC_FRAMES = new WeakSet<object>();

/**
 * Authenticates one signed player-perception snapshot, then closes its mutable
 * typed-array bytes inside scalar-only readers. Ecology presentation can reuse
 * this frame synchronously across sources without repeatedly hashing the same
 * three masks, while later mutation of the caller-owned result cannot alter the
 * frame or turn it into a second source of disclosure truth.
 */
export function createWildlifeObservationFrame(
  value: unknown,
): WildlifeObservationFrame | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["perception", "window"])
    || !validWindow(value.window)
    || !plainRecord(value.perception)
  ) return null;
  const perception = value.perception as unknown as PerceptionResult;
  if (
    !(perception.visibilityGrades instanceof Uint8Array)
    || !(perception.terrainVisibilityStrengths instanceof Uint8Array)
    || !(perception.detailVisibilityGrades instanceof Uint8Array)
  ) return null;

  const window = canonicalWindow(value.window);
  const cells = window.terrain.width * window.terrain.height;
  // Copy before authentication so a frame never retains externally mutable
  // mask storage. The stored signature must authenticate these exact copies.
  const visibilityGrades = perception.visibilityGrades.slice();
  const terrainVisibilityStrengths = perception.terrainVisibilityStrengths.slice();
  const detailVisibilityGrades = perception.detailVisibilityGrades.slice();
  const snapshot: PerceptionResult = {
    ...perception,
    visibilityGrades,
    terrainVisibilityStrengths,
    detailVisibilityGrades,
  };
  if (
    snapshot.valid !== true
    || !hasValidPerceptionSignature(snapshot, window.terrain.width, window.terrain.height)
    || !nonnegativeSafeInteger(snapshot.playerTileIndex)
    || snapshot.playerTileIndex >= cells
  ) return null;

  try {
    const origin = globalTileToRegion(window.origin.x, window.origin.y);
    const playerPoint = Object.freeze({
      x: (snapshot.playerTileIndex % window.terrain.width)
        * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
      y: Math.floor(snapshot.playerTileIndex / window.terrain.width)
        * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    });
    const frameOrigin = createWorldPosition(
      origin.region,
      origin.localX * WORLD_POSITION_UNITS_PER_TILE,
      origin.localY * WORLD_POSITION_UNITS_PER_TILE,
    );
    let frame: WildlifeObservationFrame;
    frame = Object.freeze({
      version: WILDLIFE_OBSERVATION_FRAME_VERSION,
      window,
      playerTileIndex: snapshot.playerTileIndex,
      playerPoint,
      frameOrigin,
      detailVisibilityGradeAt: (tileIndex: number): number | undefined => (
        AUTHENTIC_FRAMES.has(frame) && validTileIndex(tileIndex, cells)
          ? detailVisibilityGrades[tileIndex]
          : undefined
      ),
      terrainVisibilityStrengthAt: (tileIndex: number): number | undefined => (
        AUTHENTIC_FRAMES.has(frame) && validTileIndex(tileIndex, cells)
          ? terrainVisibilityStrengths[tileIndex]
          : undefined
      ),
    });
    AUTHENTIC_FRAMES.add(frame);
    return frame;
  } catch {
    return null;
  }
}

export function isWildlifeObservationFrame(
  value: unknown,
): value is WildlifeObservationFrame {
  return typeof value === "object"
    && value !== null
    && AUTHENTIC_FRAMES.has(value);
}

/** End one synchronous presentation batch; an escaped frame then fails closed. */
export function releaseWildlifeObservationFrame(value: unknown): void {
  if (typeof value === "object" && value !== null) AUTHENTIC_FRAMES.delete(value);
}

function canonicalWindow(value: WildlifeObservationWindow): WildlifeObservationWindow {
  return Object.freeze({
    origin: Object.freeze({ x: value.origin.x, y: value.origin.y }),
    terrain: Object.freeze({ width: value.terrain.width, height: value.terrain.height }),
  });
}

function validWindow(value: unknown): value is WildlifeObservationWindow {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["origin", "terrain"])
    || !plainRecord(value.origin)
    || !exactKeys(value.origin, ["x", "y"])
    || !safeInteger(value.origin.x)
    || !safeInteger(value.origin.y)
    || !plainRecord(value.terrain)
    || !exactKeys(value.terrain, ["height", "width"])
    || !positiveSafeInteger(value.terrain.width)
    || !positiveSafeInteger(value.terrain.height)
  ) return false;
  const cells = value.terrain.width * value.terrain.height;
  return Number.isSafeInteger(cells) && cells > 0 && cells <= 1_048_576;
}

function validTileIndex(value: unknown, cells: number): value is number {
  return nonnegativeSafeInteger(value) && value < cells;
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) > 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length
    && keys.every((key, index) => key === canonical[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}
