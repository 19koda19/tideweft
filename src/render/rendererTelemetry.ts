export const RENDERER_TELEMETRY_MAX_DRAW_COUNT = 1_000_000;

const DEFAULT_SMOOTHING_HALF_LIFE_MS = 500;
const MIN_SMOOTHING_HALF_LIFE_MS = 1;
const MAX_SMOOTHING_HALF_LIFE_MS = 60_000;
const MIN_FRAME_TIME_MS = 1;
const MAX_FRAME_TIME_MS = 250;
const MAX_REPORTED_FPS = 1_000;

export interface RendererDrawCounts {
  readonly terrainTiles?: number;
  readonly entities?: number;
  readonly labels?: number;
  readonly particles?: number;
}

export interface RendererTelemetrySnapshot extends RendererDrawCounts {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly frameCount: number;
  readonly active: boolean;
}

export interface RendererTelemetryTracker {
  readonly recordFrame: (
    nowMs: number,
    counts?: RendererDrawCounts,
  ) => RendererTelemetrySnapshot;
  readonly setActive: (active: boolean) => RendererTelemetrySnapshot;
  readonly getSnapshot: () => RendererTelemetrySnapshot;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothingHalfLife(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SMOOTHING_HALF_LIFE_MS;
  return clamp(value, MIN_SMOOTHING_HALF_LIFE_MS, MAX_SMOOTHING_HALF_LIFE_MS);
}

function boundedCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return clamp(Math.floor(value), 0, RENDERER_TELEMETRY_MAX_DRAW_COUNT);
}

function boundedCounts(counts: RendererDrawCounts | undefined): RendererDrawCounts {
  if (!counts || typeof counts !== "object") return {};
  const terrainTiles = boundedCount(counts.terrainTiles);
  const entities = boundedCount(counts.entities);
  const labels = boundedCount(counts.labels);
  const particles = boundedCount(counts.particles);
  return {
    ...(terrainTiles === undefined ? {} : { terrainTiles }),
    ...(entities === undefined ? {} : { entities }),
    ...(labels === undefined ? {} : { labels }),
    ...(particles === undefined ? {} : { particles }),
  };
}

function immutableSnapshot(
  active: boolean,
  frameCount: number,
  frameTimeMs: number,
  counts: RendererDrawCounts = {},
): RendererTelemetrySnapshot {
  const safeFrameTime = Number.isFinite(frameTimeMs)
    ? clamp(frameTimeMs, 0, MAX_FRAME_TIME_MS)
    : 0;
  const fps = safeFrameTime === 0
    ? 0
    : clamp(1_000 / safeFrameTime, 0, MAX_REPORTED_FPS);
  return Object.freeze({
    fps,
    frameTimeMs: safeFrameTime,
    frameCount: clamp(Math.floor(frameCount), 0, Number.MAX_SAFE_INTEGER),
    active,
    ...counts,
  });
}

/**
 * Tracks observed renderer frames only. Callers must pass the monotonic timestamp
 * belonging to the actual render callback, never a simulation tick timestamp.
 */
export function createRendererTelemetry(
  smoothingHalfLifeMs = DEFAULT_SMOOTHING_HALF_LIFE_MS,
): RendererTelemetryTracker {
  const halfLifeMs = smoothingHalfLife(smoothingHalfLifeMs);
  let active = true;
  let frameCount = 0;
  let lastFrameAt: number | undefined;
  let smoothedFrameTimeMs: number | undefined;
  let snapshot = immutableSnapshot(active, frameCount, 0);

  const getSnapshot = (): RendererTelemetrySnapshot => snapshot;

  const recordFrame = (
    nowMs: number,
    counts?: RendererDrawCounts,
  ): RendererTelemetrySnapshot => {
    if (!active || !Number.isFinite(nowMs) || nowMs < 0) return snapshot;
    if (lastFrameAt !== undefined && nowMs <= lastFrameAt) return snapshot;

    const nextCounts = boundedCounts(counts);
    frameCount = Math.min(Number.MAX_SAFE_INTEGER, frameCount + 1);
    if (lastFrameAt === undefined) {
      lastFrameAt = nowMs;
      snapshot = immutableSnapshot(active, frameCount, 0, nextCounts);
      return snapshot;
    }

    const elapsedMs = clamp(nowMs - lastFrameAt, MIN_FRAME_TIME_MS, MAX_FRAME_TIME_MS);
    lastFrameAt = nowMs;
    if (smoothedFrameTimeMs === undefined) {
      smoothedFrameTimeMs = elapsedMs;
    } else {
      const smoothingAmount = 1 - Math.pow(2, -elapsedMs / halfLifeMs);
      smoothedFrameTimeMs += (elapsedMs - smoothedFrameTimeMs) * smoothingAmount;
      smoothedFrameTimeMs = clamp(
        smoothedFrameTimeMs,
        MIN_FRAME_TIME_MS,
        MAX_FRAME_TIME_MS,
      );
    }
    snapshot = immutableSnapshot(active, frameCount, smoothedFrameTimeMs, nextCounts);
    return snapshot;
  };

  const setActive = (nextActive: boolean): RendererTelemetrySnapshot => {
    if (nextActive === active) return snapshot;
    active = nextActive;
    lastFrameAt = undefined;
    smoothedFrameTimeMs = undefined;
    snapshot = immutableSnapshot(active, frameCount, 0);
    return snapshot;
  };

  return Object.freeze({ recordFrame, setActive, getSnapshot });
}
