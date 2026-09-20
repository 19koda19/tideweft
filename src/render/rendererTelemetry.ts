export const RENDERER_TELEMETRY_MAX_DRAW_COUNT = 1_000_000;
/** More than sixty seconds at the renderers' requested 60 Hz cadence. */
export const RENDERER_TELEMETRY_SAMPLE_CAPACITY = 4_096;

const DEFAULT_SMOOTHING_HALF_LIFE_MS = 500;
const MIN_SMOOTHING_HALF_LIFE_MS = 1;
const MAX_SMOOTHING_HALF_LIFE_MS = 60_000;
const MIN_FRAME_TIME_MS = 1;
const MAX_FRAME_TIME_MS = 250;
const MAX_REPORTED_FPS = 1_000;

export interface RendererWorkCounts {
  readonly terrainTiles?: number;
  /** Immediate Relief perception material submissions after visible-chunk coalescing. */
  readonly perceptionMaterialSubmissions?: number;
  /** Visible chunk-local segments consumed by those perception submissions. */
  readonly perceptionMaterialSegments?: number;
  /** Projected entity records considered by render passes, before pass-local culling. */
  readonly projectedEntityCandidates?: number;
  readonly labels?: number;
  readonly particles?: number;
}

export interface RendererTelemetrySnapshot extends RendererWorkCounts {
  /** Legacy exponentially smoothed cadence fields retained for the player HUD. */
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly frameCount: number;
  readonly active: boolean;
  /** Maximum retained raw/cpu samples when detailed probes are enabled. */
  readonly detailedSampleCapacity?: number;
  // Optional at the public boundary so legacy telemetry fixtures/providers stay
  // source-compatible; createRendererTelemetry always publishes every field.
  /** Exact raw start-to-start intervals in the current bounded active window. */
  readonly rawFrameIntervalSampleCount?: number;
  readonly rawFrameIntervalMeanMs?: number;
  readonly rawFrameIntervalP99Ms?: number;
  readonly rawFrameIntervalWorstMs?: number;
  /** Synchronous CPU time spent composing completed draw callbacks. */
  readonly drawCpuSampleCount?: number;
  readonly drawCpuMeanMs?: number;
  readonly drawCpuP99Ms?: number;
  readonly drawCpuWorstMs?: number;
}

export interface RendererTelemetryTracker {
  readonly recordFrame: (
    nowMs: number,
    counts?: RendererWorkCounts,
    drawCpuDurationMs?: number,
  ) => RendererTelemetrySnapshot;
  readonly setActive: (active: boolean) => RendererTelemetrySnapshot;
  /** Enables bounded raw/cpu/count probes; legacy HUD cadence remains active. */
  readonly setDetailedEnabled: (enabled: boolean) => RendererTelemetrySnapshot;
  readonly isDetailedEnabled: () => boolean;
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

function boundedCounts(counts: RendererWorkCounts | undefined): RendererWorkCounts {
  if (!counts || typeof counts !== "object") return {};
  const terrainTiles = boundedCount(counts.terrainTiles);
  const perceptionMaterialSubmissions = boundedCount(counts.perceptionMaterialSubmissions);
  const perceptionMaterialSegments = boundedCount(counts.perceptionMaterialSegments);
  const projectedEntityCandidates = boundedCount(counts.projectedEntityCandidates);
  const labels = boundedCount(counts.labels);
  const particles = boundedCount(counts.particles);
  return {
    ...(terrainTiles === undefined ? {} : { terrainTiles }),
    ...(perceptionMaterialSubmissions === undefined
      ? {}
      : { perceptionMaterialSubmissions }),
    ...(perceptionMaterialSegments === undefined ? {} : { perceptionMaterialSegments }),
    ...(projectedEntityCandidates === undefined ? {} : { projectedEntityCandidates }),
    ...(labels === undefined ? {} : { labels }),
    ...(particles === undefined ? {} : { particles }),
  };
}

interface BoundedTimingWindow {
  readonly samples: number[];
  readonly sorted: number[];
  nextIndex: number;
  sum: number;
}

interface TimingStatistics {
  readonly sampleCount: number;
  readonly meanMs: number;
  readonly p99Ms: number;
  readonly worstMs: number;
}

const EMPTY_TIMING_STATISTICS: TimingStatistics = Object.freeze({
  sampleCount: 0,
  meanMs: 0,
  p99Ms: 0,
  worstMs: 0,
});

function createTimingWindow(): BoundedTimingWindow {
  return { samples: [], sorted: [], nextIndex: 0, sum: 0 };
}

function resetTimingWindow(window: BoundedTimingWindow): void {
  window.samples.length = 0;
  window.sorted.length = 0;
  window.nextIndex = 0;
  window.sum = 0;
}

function lowerBound(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if ((sorted[middle] ?? Number.POSITIVE_INFINITY) < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function recordTimingSample(window: BoundedTimingWindow, value: number | undefined): void {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < 0
    || value > Number.MAX_SAFE_INTEGER
  ) return;

  if (window.samples.length === RENDERER_TELEMETRY_SAMPLE_CAPACITY) {
    const evicted = window.samples[window.nextIndex];
    if (evicted !== undefined) {
      window.sum -= evicted;
      const removalIndex = lowerBound(window.sorted, evicted);
      if (window.sorted[removalIndex] === evicted) window.sorted.splice(removalIndex, 1);
    }
    window.samples[window.nextIndex] = value;
    window.nextIndex = (window.nextIndex + 1) % RENDERER_TELEMETRY_SAMPLE_CAPACITY;
  } else {
    window.samples.push(value);
  }
  window.sum += value;
  window.sorted.splice(lowerBound(window.sorted, value), 0, value);
}

function timingStatistics(window: BoundedTimingWindow): TimingStatistics {
  const sampleCount = window.samples.length;
  if (sampleCount === 0) return EMPTY_TIMING_STATISTICS;
  const p99Index = Math.max(0, Math.ceil(sampleCount * 0.99) - 1);
  return {
    sampleCount,
    meanMs: window.sum / sampleCount,
    p99Ms: window.sorted[p99Index] ?? 0,
    worstMs: window.sorted[sampleCount - 1] ?? 0,
  };
}

function immutableSnapshot(
  active: boolean,
  frameCount: number,
  frameTimeMs: number,
  rawFrameIntervals: BoundedTimingWindow,
  drawCpuDurations: BoundedTimingWindow,
  counts: RendererWorkCounts = {},
): RendererTelemetrySnapshot {
  const safeFrameTime = Number.isFinite(frameTimeMs)
    ? clamp(frameTimeMs, 0, MAX_FRAME_TIME_MS)
    : 0;
  const fps = safeFrameTime === 0
    ? 0
    : clamp(1_000 / safeFrameTime, 0, MAX_REPORTED_FPS);
  const rawInterval = timingStatistics(rawFrameIntervals);
  const drawCpu = timingStatistics(drawCpuDurations);
  return Object.freeze({
    fps,
    frameTimeMs: safeFrameTime,
    frameCount: clamp(Math.floor(frameCount), 0, Number.MAX_SAFE_INTEGER),
    active,
    detailedSampleCapacity: RENDERER_TELEMETRY_SAMPLE_CAPACITY,
    rawFrameIntervalSampleCount: rawInterval.sampleCount,
    rawFrameIntervalMeanMs: rawInterval.meanMs,
    rawFrameIntervalP99Ms: rawInterval.p99Ms,
    rawFrameIntervalWorstMs: rawInterval.worstMs,
    drawCpuSampleCount: drawCpu.sampleCount,
    drawCpuMeanMs: drawCpu.meanMs,
    drawCpuP99Ms: drawCpu.p99Ms,
    drawCpuWorstMs: drawCpu.worstMs,
    ...counts,
  });
}

/**
 * Tracks observed renderer frames only. Callers must pass the monotonic timestamp
 * belonging to the actual render callback, never a simulation tick timestamp.
 */
export function createRendererTelemetry(
  smoothingHalfLifeMs = DEFAULT_SMOOTHING_HALF_LIFE_MS,
  detailedInitiallyEnabled = true,
): RendererTelemetryTracker {
  const halfLifeMs = smoothingHalfLife(smoothingHalfLifeMs);
  if (typeof detailedInitiallyEnabled !== "boolean") {
    throw new TypeError("Detailed renderer telemetry enabled state must be boolean");
  }
  let active = true;
  let detailedEnabled = detailedInitiallyEnabled;
  let frameCount = 0;
  let lastFrameAt: number | undefined;
  let smoothedFrameTimeMs: number | undefined;
  const rawFrameIntervals = createTimingWindow();
  const drawCpuDurations = createTimingWindow();
  let snapshot = immutableSnapshot(
    active,
    frameCount,
    0,
    rawFrameIntervals,
    drawCpuDurations,
  );

  const getSnapshot = (): RendererTelemetrySnapshot => snapshot;

  const recordFrame = (
    nowMs: number,
    counts?: RendererWorkCounts,
    drawCpuDurationMs?: number,
  ): RendererTelemetrySnapshot => {
    if (!active || !Number.isFinite(nowMs) || nowMs < 0) return snapshot;
    if (lastFrameAt !== undefined && nowMs <= lastFrameAt) return snapshot;

    const nextCounts = detailedEnabled ? boundedCounts(counts) : {};
    frameCount = Math.min(Number.MAX_SAFE_INTEGER, frameCount + 1);
    if (lastFrameAt === undefined) {
      lastFrameAt = nowMs;
      if (detailedEnabled) recordTimingSample(drawCpuDurations, drawCpuDurationMs);
      snapshot = immutableSnapshot(
        active,
        frameCount,
        0,
        rawFrameIntervals,
        drawCpuDurations,
        nextCounts,
      );
      return snapshot;
    }

    const rawElapsedMs = nowMs - lastFrameAt;
    if (detailedEnabled) {
      recordTimingSample(rawFrameIntervals, rawElapsedMs);
      recordTimingSample(drawCpuDurations, drawCpuDurationMs);
    }
    const elapsedMs = clamp(rawElapsedMs, MIN_FRAME_TIME_MS, MAX_FRAME_TIME_MS);
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
    snapshot = immutableSnapshot(
      active,
      frameCount,
      smoothedFrameTimeMs,
      rawFrameIntervals,
      drawCpuDurations,
      nextCounts,
    );
    return snapshot;
  };

  const setActive = (nextActive: boolean): RendererTelemetrySnapshot => {
    if (nextActive === active) return snapshot;
    active = nextActive;
    lastFrameAt = undefined;
    smoothedFrameTimeMs = undefined;
    resetTimingWindow(rawFrameIntervals);
    resetTimingWindow(drawCpuDurations);
    snapshot = immutableSnapshot(
      active,
      frameCount,
      0,
      rawFrameIntervals,
      drawCpuDurations,
    );
    return snapshot;
  };

  const setDetailedEnabled = (nextEnabled: boolean): RendererTelemetrySnapshot => {
    if (typeof nextEnabled !== "boolean") {
      throw new TypeError("Detailed renderer telemetry enabled state must be boolean");
    }
    if (nextEnabled === detailedEnabled) return snapshot;
    detailedEnabled = nextEnabled;
    lastFrameAt = undefined;
    smoothedFrameTimeMs = undefined;
    resetTimingWindow(rawFrameIntervals);
    resetTimingWindow(drawCpuDurations);
    snapshot = immutableSnapshot(
      active,
      frameCount,
      0,
      rawFrameIntervals,
      drawCpuDurations,
    );
    return snapshot;
  };

  return Object.freeze({
    recordFrame,
    setActive,
    setDetailedEnabled,
    isDetailedEnabled: () => detailedEnabled,
    getSnapshot,
  });
}
