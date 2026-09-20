export const RUNTIME_PERFORMANCE_DEFAULT_CAPACITY = 2_048;
export const RUNTIME_PERFORMANCE_MAX_CAPACITY = 65_536;

export interface RuntimePerformanceTelemetryOptions {
  readonly capacity?: number;
  readonly enabled?: boolean;
}

export interface RuntimePerformanceSnapshot {
  readonly enabled: boolean;
  readonly capacity: number;
  /** Samples currently retained in the bounded statistics window. */
  readonly count: number;
  /** All valid samples accepted since the last reset, including evicted samples. */
  readonly totalCount: number;
  readonly meanMs: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export interface RuntimePerformanceTelemetry {
  /**
   * Records a duration between two readings from the same monotonic clock.
   * Invalid, overlapping, out-of-order, or disabled spans are ignored.
   */
  readonly recordSpan: (startedAtMs: number, finishedAtMs: number) => boolean;
  readonly getSnapshot: () => RuntimePerformanceSnapshot;
  readonly setEnabled: (enabled: boolean) => RuntimePerformanceSnapshot;
  readonly reset: () => RuntimePerformanceSnapshot;
}

export function createRuntimePerformanceTelemetry(
  options: RuntimePerformanceTelemetryOptions = {},
): RuntimePerformanceTelemetry {
  const capacity = validateCapacity(
    options.capacity ?? RUNTIME_PERFORMANCE_DEFAULT_CAPACITY,
  );
  let enabled = validateEnabled(options.enabled ?? false);
  const durationsMs = new Float64Array(capacity);
  let count = 0;
  let totalCount = 0;
  let nextIndex = 0;
  let lastFinishedAtMs: number | null = null;
  let cachedSnapshot: RuntimePerformanceSnapshot | null = null;

  const getSnapshot = (): RuntimePerformanceSnapshot => {
    if (cachedSnapshot !== null) return cachedSnapshot;

    let meanMs = 0;
    let maxMs = 0;
    const orderedDurations = new Array<number>(count);

    for (let index = 0; index < count; index += 1) {
      const durationMs = durationsMs[index];
      if (durationMs === undefined) {
        throw new Error("Performance telemetry retained an invalid sample index");
      }
      orderedDurations[index] = durationMs;
      meanMs += (durationMs - meanMs) / (index + 1);
      maxMs = Math.max(maxMs, durationMs);
    }

    orderedDurations.sort((left, right) => left - right);
    const p99Index = Math.max(0, Math.ceil(count * 0.99) - 1);
    const p99Ms = count === 0 ? 0 : (orderedDurations[p99Index] ?? 0);

    cachedSnapshot = Object.freeze({
      enabled,
      capacity,
      count,
      totalCount,
      meanMs,
      p99Ms,
      maxMs,
    });
    return cachedSnapshot;
  };

  const telemetry: RuntimePerformanceTelemetry = {
    recordSpan(startedAtMs, finishedAtMs) {
      if (!enabled) return false;
      if (!isValidTimestamp(startedAtMs) || !isValidTimestamp(finishedAtMs)) {
        return false;
      }
      if (finishedAtMs < startedAtMs) return false;
      if (lastFinishedAtMs !== null && startedAtMs < lastFinishedAtMs) return false;

      const durationMs = finishedAtMs - startedAtMs;
      if (!Number.isFinite(durationMs)) return false;

      durationsMs[nextIndex] = Object.is(durationMs, -0) ? 0 : durationMs;
      nextIndex = (nextIndex + 1) % capacity;
      count = Math.min(count + 1, capacity);
      totalCount = Math.min(totalCount + 1, Number.MAX_SAFE_INTEGER);
      lastFinishedAtMs = finishedAtMs;
      cachedSnapshot = null;
      return true;
    },

    getSnapshot,

    setEnabled(nextEnabled) {
      const validatedEnabled = validateEnabled(nextEnabled);
      if (validatedEnabled !== enabled) {
        enabled = validatedEnabled;
        cachedSnapshot = null;
      }
      return getSnapshot();
    },

    reset() {
      count = 0;
      totalCount = 0;
      nextIndex = 0;
      lastFinishedAtMs = null;
      cachedSnapshot = null;
      return getSnapshot();
    },
  };

  return Object.freeze(telemetry);
}

function validateCapacity(capacity: number): number {
  if (
    !Number.isSafeInteger(capacity)
    || capacity <= 0
    || capacity > RUNTIME_PERFORMANCE_MAX_CAPACITY
  ) {
    throw new RangeError(
      `Performance telemetry capacity must be a positive safe integer no greater than ${RUNTIME_PERFORMANCE_MAX_CAPACITY}`,
    );
  }
  return capacity;
}

function validateEnabled(enabled: boolean): boolean {
  if (typeof enabled !== "boolean") {
    throw new TypeError("Performance telemetry enabled state must be boolean");
  }
  return enabled;
}

function isValidTimestamp(timestampMs: number): boolean {
  return Number.isFinite(timestampMs) && timestampMs >= 0;
}
