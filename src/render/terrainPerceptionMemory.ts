import { currentTerrainVisibility } from "./perceptionPresentation";
import type { TerrainGridView, WorldPoint } from "./types";

/** The bounded sliding spatial frame is fixed at no more than 120 by 120 cells. */
export const MAX_TERRAIN_PERCEPTION_MEMORY_TILES = 120 * 120;
/** A full-strength terrain impression reaches its durable-map baseline within this time. */
export const TERRAIN_PERCEPTION_MEMORY_FADE_MS = 900;
/** Relief shares these bounded lightness bands instead of creating per-tile materials. */
export const TERRAIN_PERCEPTION_MEMORY_BANDS = 8;

export interface TerrainPerceptionMemoryInput {
  readonly terrain: TerrainGridView;
  readonly spatialEpoch?: number | string;
  readonly worldName?: string;
  readonly tick: number;
  readonly timeMs: number;
  readonly perceptionEnabled: boolean;
  readonly reducedMotion: boolean;
}

/**
 * One renderer-local, disposable presentation buffer. It contains no terrain
 * facts, detail grades, entities, names, interactions, or save state.
 */
export interface TerrainPerceptionMemoryState {
  readonly values: Float32Array;
  /** Absolute cell-addressing metadata; contains no hidden terrain facts. */
  frame: TerrainPerceptionMemoryFrame;
  identity: string;
  sampledAtMs: number;
  tick: number;
  /** Hash of the same eight bands Relief batches by. */
  signature: string;
}

export interface TerrainPerceptionMemoryFrame {
  readonly columns: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly worldName: string;
  readonly worldTileOrigin: WorldPoint | null;
}

export interface TerrainPerceptionMemoryStore {
  readonly sample: (input: TerrainPerceptionMemoryInput) => TerrainPerceptionMemoryState;
  readonly current: () => TerrainPerceptionMemoryState | undefined;
  readonly reset: () => void;
}

const unit = (value: number | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : 0;

/** Pure scalar transition shared by both renderers. Sight appears immediately and fades monotonically. */
export function terrainPerceptionMemoryValue(
  previous: number,
  live: number,
  elapsedMs: number,
  reducedMotion: boolean,
): number {
  const target = unit(live);
  if (reducedMotion) return target;
  const prior = unit(previous);
  if (target >= prior) return target;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const faded = prior - elapsed / TERRAIN_PERCEPTION_MEMORY_FADE_MS;
  return faded <= target + 0.000_001 ? target : faded;
}

/** Opaque identity for coordinate interpretation, world replacement, and active grid geometry. */
export function terrainPerceptionMemoryIdentity(
  input: Pick<
    TerrainPerceptionMemoryInput,
    "terrain" | "spatialEpoch" | "worldName"
  >,
): string {
  const { terrain } = input;
  const numberIdentity = (
    value: number,
  ): readonly ["number" | "negative-zero" | "invalid", number | string] => {
    if (Object.is(value, -0)) return ["negative-zero", "-0"];
    return Number.isFinite(value) ? ["number", value] : ["invalid", String(value)];
  };
  const epoch = input.spatialEpoch === undefined
    ? ["legacy"] as const
    : typeof input.spatialEpoch === "number"
      ? ["number", numberIdentity(input.spatialEpoch)] as const
      : ["string", input.spatialEpoch] as const;
  const absoluteOrigin = terrain.worldTileOrigin === undefined
    ? ["absent"] as const
    : [
        "point",
        numberIdentity(terrain.worldTileOrigin.x),
        numberIdentity(terrain.worldTileOrigin.y),
      ] as const;
  // JSON's typed tuple encoding keeps arbitrary opaque epoch/world strings
  // collision-safe; delimiters are data, never structure.
  return JSON.stringify([
    epoch,
    input.worldName ?? "",
    terrain.columns,
    terrain.rows,
    numberIdentity(terrain.tileSize),
    numberIdentity(terrain.origin.x),
    numberIdentity(terrain.origin.y),
    absoluteOrigin,
  ]);
}

function terrainPerceptionMemoryFrame(
  input: TerrainPerceptionMemoryInput,
): TerrainPerceptionMemoryFrame {
  const candidate = input.terrain.worldTileOrigin;
  const worldTileOrigin = candidate
    && Number.isSafeInteger(candidate.x)
    && Number.isSafeInteger(candidate.y)
    ? { x: candidate.x, y: candidate.y }
    : null;
  return {
    columns: input.terrain.columns,
    rows: input.terrain.rows,
    tileSize: input.terrain.tileSize,
    worldName: input.worldName ?? "",
    worldTileOrigin,
  };
}

function absoluteFramesCompatible(
  previous: TerrainPerceptionMemoryFrame,
  next: TerrainPerceptionMemoryFrame,
): boolean {
  return previous.worldTileOrigin !== null
    && next.worldTileOrigin !== null
    && previous.worldName === next.worldName
    && Number.isFinite(previous.tileSize)
    && previous.tileSize > 0
    && previous.tileSize === next.tileSize;
}

function sameAbsoluteFrame(
  previous: TerrainPerceptionMemoryFrame,
  next: TerrainPerceptionMemoryFrame,
): boolean {
  return absoluteFramesCompatible(previous, next)
    && previous.columns === next.columns
    && previous.rows === next.rows
    && previous.worldTileOrigin!.x === next.worldTileOrigin!.x
    && previous.worldTileOrigin!.y === next.worldTileOrigin!.y;
}

function translatedMemoryValue(
  previous: TerrainPerceptionMemoryState,
  nextFrame: TerrainPerceptionMemoryFrame,
  column: number,
  row: number,
): number {
  const previousOrigin = previous.frame.worldTileOrigin;
  const nextOrigin = nextFrame.worldTileOrigin;
  if (!previousOrigin || !nextOrigin) return 0;
  const shiftX = nextOrigin.x - previousOrigin.x;
  const shiftY = nextOrigin.y - previousOrigin.y;
  // A difference outside the safe integer envelope necessarily lies far
  // beyond two bounded frames, so there can be no overlapping cell to retain.
  if (!Number.isSafeInteger(shiftX) || !Number.isSafeInteger(shiftY)) return 0;
  const previousColumn = column + shiftX;
  const previousRow = row + shiftY;
  if (
    previousColumn < 0
    || previousColumn >= previous.frame.columns
    || previousRow < 0
    || previousRow >= previous.frame.rows
  ) return 0;
  const previousIndex = previousRow * previous.frame.columns + previousColumn;
  return previousIndex >= 0 && previousIndex < previous.values.length
    ? previous.values[previousIndex] ?? 0
    : 0;
}

/**
 * Advances one fixed buffer in O(active tile count). The buffer is replaced
 * only when the active coordinate identity/shape changes. A composite retains
 * it across Chart/Relief swaps and discards it on destruction.
 */
export function sampleTerrainPerceptionMemory(
  previous: TerrainPerceptionMemoryState | undefined,
  input: TerrainPerceptionMemoryInput,
): TerrainPerceptionMemoryState {
  const product = input.terrain.columns * input.terrain.rows;
  const expected = Number.isSafeInteger(input.terrain.columns)
    && Number.isSafeInteger(input.terrain.rows)
    && input.terrain.columns > 0
    && input.terrain.rows > 0
    && Number.isSafeInteger(product)
    ? product
    : 0;
  const count = Math.max(0, Math.min(
    MAX_TERRAIN_PERCEPTION_MEMORY_TILES,
    expected,
    input.terrain.tiles.length,
  ));
  const identity = terrainPerceptionMemoryIdentity(input);
  const frame = terrainPerceptionMemoryFrame(input);
  const now = Number.isFinite(input.timeMs) ? Math.max(0, input.timeMs) : 0;
  const tick = Number.isFinite(input.tick) ? input.tick : 0;
  const clocksCompatible = previous !== undefined
    && tick >= previous.tick
    && now >= previous.sampledAtMs;
  const absoluteCompatible = previous !== undefined
    && clocksCompatible
    && absoluteFramesCompatible(previous.frame, frame);
  const sameFrame = previous !== undefined
    && absoluteCompatible
    && sameAbsoluteFrame(previous.frame, frame)
    && previous.values.length === count;
  const legacyCompatible = previous !== undefined
    && clocksCompatible
    && previous.frame.worldTileOrigin === null
    && frame.worldTileOrigin === null
    && previous.identity === identity
    && previous.values.length === count;
  const retainSameArray = sameFrame || legacyCompatible;
  const translateOverlap = previous !== undefined
    && absoluteCompatible
    && !sameFrame;
  const elapsed = clocksCompatible && previous
    ? now - previous.sampledAtMs
    : 0;
  const values = retainSameArray && previous
    ? previous.values
    : new Float32Array(count);
  const state: TerrainPerceptionMemoryState = retainSameArray && previous
    ? previous
    : {
        values,
        frame,
        identity,
        sampledAtMs: now,
        tick,
        signature: "",
      };
  let hash = 2_166_136_261;
  for (let index = 0; index < count; index += 1) {
    const live = currentTerrainVisibility(
      input.terrain.tiles[index],
      input.perceptionEnabled,
    );
    const column = index % input.terrain.columns;
    const row = Math.floor(index / input.terrain.columns);
    const prior = retainSameArray
      ? values[index] ?? 0
      : translateOverlap && previous
        ? translatedMemoryValue(previous, frame, column, row)
        : 0;
    const next = terrainPerceptionMemoryValue(prior, live, elapsed, input.reducedMotion);
    state.values[index] = next;
    const band = Math.round(next * TERRAIN_PERCEPTION_MEMORY_BANDS);
    hash ^= band + index * 17;
    hash = Math.imul(hash, 16_777_619);
  }
  state.frame = frame;
  state.identity = identity;
  state.sampledAtMs = now;
  state.tick = tick;
  state.signature = `${count}:${hash >>> 0}`;
  return state;
}

/** Missing/out-of-capacity cells never inherit stale sight. */
export function rememberedTerrainVisibilityAt(
  state: TerrainPerceptionMemoryState | undefined,
  index: number,
): number {
  if (!state || !Number.isSafeInteger(index) || index < 0 || index >= state.values.length) return 0;
  return unit(state.values[index]);
}

/** A composite renderer shares this one bounded impression across Chart and Relief. */
export function createTerrainPerceptionMemoryStore(): TerrainPerceptionMemoryStore {
  let state: TerrainPerceptionMemoryState | undefined;
  return {
    sample: (input) => {
      state = sampleTerrainPerceptionMemory(state, input);
      return state;
    },
    current: () => state,
    reset: () => {
      state = undefined;
    },
  };
}
