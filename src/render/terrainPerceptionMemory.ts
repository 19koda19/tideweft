import { currentTerrainVisibility } from "./perceptionPresentation";
import type { TerrainGridView } from "./types";

/** The active regional projection is fixed at 98 by 74 cells. */
export const MAX_TERRAIN_PERCEPTION_MEMORY_TILES = 98 * 74;
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
  identity: string;
  sampledAtMs: number;
  tick: number;
  /** Hash of the same eight bands Relief batches by. */
  signature: string;
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
  ]);
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
  const expected = Number.isSafeInteger(input.terrain.columns)
    && Number.isSafeInteger(input.terrain.rows)
    && input.terrain.columns > 0
    && input.terrain.rows > 0
    ? input.terrain.columns * input.terrain.rows
    : 0;
  const count = Math.max(0, Math.min(
    MAX_TERRAIN_PERCEPTION_MEMORY_TILES,
    expected,
    input.terrain.tiles.length,
  ));
  const identity = terrainPerceptionMemoryIdentity(input);
  const now = Number.isFinite(input.timeMs) ? Math.max(0, input.timeMs) : 0;
  const tick = Number.isFinite(input.tick) ? input.tick : 0;
  const rebase = !previous
    || previous.identity !== identity
    || previous.values.length !== count
    || tick < previous.tick
    || now < previous.sampledAtMs;
  const state: TerrainPerceptionMemoryState = rebase
    ? {
        values: new Float32Array(count),
        identity,
        sampledAtMs: now,
        tick,
        signature: "",
      }
    : previous;
  const elapsed = rebase ? TERRAIN_PERCEPTION_MEMORY_FADE_MS : now - state.sampledAtMs;
  let hash = 2_166_136_261;
  for (let index = 0; index < count; index += 1) {
    const live = currentTerrainVisibility(
      input.terrain.tiles[index],
      input.perceptionEnabled,
    );
    const next = rebase
      ? live
      : terrainPerceptionMemoryValue(state.values[index] ?? 0, live, elapsed, input.reducedMotion);
    state.values[index] = next;
    const band = Math.round(next * TERRAIN_PERCEPTION_MEMORY_BANDS);
    hash ^= band + index * 17;
    hash = Math.imul(hash, 16_777_619);
  }
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
