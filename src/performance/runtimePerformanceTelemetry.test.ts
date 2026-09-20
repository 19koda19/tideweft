import { describe, expect, it } from "vitest";

import {
  RUNTIME_PERFORMANCE_MAX_CAPACITY,
  createRuntimePerformanceTelemetry,
} from "./runtimePerformanceTelemetry";

describe("runtime performance telemetry", () => {
  it("reports deterministic nearest-rank p99, mean, and maximum duration", () => {
    const telemetry = createRuntimePerformanceTelemetry({ capacity: 128, enabled: true });
    let clockMs = 0;

    for (let durationMs = 1; durationMs <= 100; durationMs += 1) {
      expect(telemetry.recordSpan(clockMs, clockMs + durationMs)).toBe(true);
      clockMs += durationMs;
    }

    const snapshot = telemetry.getSnapshot();
    expect(snapshot).toEqual({
      enabled: true,
      capacity: 128,
      count: 100,
      totalCount: 100,
      meanMs: 50.5,
      p99Ms: 99,
      maxMs: 100,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(telemetry.getSnapshot()).toBe(snapshot);
  });

  it("retains only the newest samples within its fixed rolling capacity", () => {
    const telemetry = createRuntimePerformanceTelemetry({ capacity: 3, enabled: true });
    let clockMs = 0;

    for (const durationMs of [1, 2, 100, 4]) {
      expect(telemetry.recordSpan(clockMs, clockMs + durationMs)).toBe(true);
      clockMs += durationMs;
    }

    const firstRollingSnapshot = telemetry.getSnapshot();
    expect(firstRollingSnapshot).toMatchObject({
      enabled: true,
      capacity: 3,
      count: 3,
      totalCount: 4,
      p99Ms: 100,
      maxMs: 100,
    });
    expect(firstRollingSnapshot.meanMs).toBeCloseTo(106 / 3, 12);

    expect(telemetry.recordSpan(clockMs, clockMs + 6)).toBe(true);
    const secondRollingSnapshot = telemetry.getSnapshot();
    expect(secondRollingSnapshot).toMatchObject({
      enabled: true,
      capacity: 3,
      count: 3,
      totalCount: 5,
      p99Ms: 100,
      maxMs: 100,
    });
    expect(secondRollingSnapshot.meanMs).toBeCloseTo(110 / 3, 12);
  });

  it("rejects malformed and non-monotonic spans without mutating retained data", () => {
    const telemetry = createRuntimePerformanceTelemetry({ capacity: 4, enabled: true });

    expect(telemetry.recordSpan(Number.NaN, 1)).toBe(false);
    expect(telemetry.recordSpan(0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(telemetry.recordSpan(-1, 0)).toBe(false);
    expect(telemetry.recordSpan(2, 1)).toBe(false);
    expect(telemetry.getSnapshot()).toMatchObject({ count: 0, totalCount: 0 });

    expect(telemetry.recordSpan(10, 20)).toBe(true);
    const acceptedSnapshot = telemetry.getSnapshot();
    expect(telemetry.recordSpan(19, 21)).toBe(false);
    expect(telemetry.recordSpan(0, 5)).toBe(false);
    expect(telemetry.getSnapshot()).toBe(acceptedSnapshot);

    expect(telemetry.recordSpan(20, 20)).toBe(true);
    expect(telemetry.getSnapshot()).toMatchObject({
      count: 2,
      totalCount: 2,
      meanMs: 5,
      p99Ms: 10,
      maxMs: 10,
    });
  });

  it("validates lifecycle configuration without coercion", () => {
    expect(() => createRuntimePerformanceTelemetry({ capacity: 0 })).toThrow(RangeError);
    expect(() => createRuntimePerformanceTelemetry({ capacity: -1 })).toThrow(RangeError);
    expect(() => createRuntimePerformanceTelemetry({ capacity: 1.5 })).toThrow(RangeError);
    expect(() => createRuntimePerformanceTelemetry({ capacity: Number.NaN })).toThrow(RangeError);
    expect(() => createRuntimePerformanceTelemetry({
      capacity: RUNTIME_PERFORMANCE_MAX_CAPACITY + 1,
    })).toThrow(RangeError);
    expect(() => createRuntimePerformanceTelemetry({
      enabled: 1 as unknown as boolean,
    })).toThrow(TypeError);

    const telemetry = createRuntimePerformanceTelemetry({ capacity: 1, enabled: true });
    expect(() => telemetry.setEnabled("yes" as unknown as boolean)).toThrow(TypeError);
  });

  it("leaves retained state untouched while disabled and resets independently of enable state", () => {
    const telemetry = createRuntimePerformanceTelemetry({ capacity: 4 });
    const disabledSnapshot = telemetry.getSnapshot();

    expect(disabledSnapshot).toEqual({
      enabled: false,
      capacity: 4,
      count: 0,
      totalCount: 0,
      meanMs: 0,
      p99Ms: 0,
      maxMs: 0,
    });
    expect(telemetry.recordSpan(0, 10)).toBe(false);
    expect(telemetry.getSnapshot()).toBe(disabledSnapshot);

    expect(telemetry.setEnabled(true)).toMatchObject({
      enabled: true,
      count: 0,
      totalCount: 0,
    });
    expect(telemetry.recordSpan(0, 10)).toBe(true);
    const firstSample = telemetry.getSnapshot();
    expect(firstSample).toMatchObject({ count: 1, totalCount: 1, meanMs: 10 });

    expect(telemetry.setEnabled(false)).toMatchObject({
      enabled: false,
      count: 1,
      totalCount: 1,
    });
    expect(telemetry.recordSpan(10, 1_000)).toBe(false);
    expect(telemetry.setEnabled(true)).toMatchObject({
      enabled: true,
      count: 1,
      totalCount: 1,
    });
    expect(telemetry.recordSpan(10, 14)).toBe(true);
    expect(telemetry.getSnapshot()).toMatchObject({
      enabled: true,
      count: 2,
      totalCount: 2,
      meanMs: 7,
      p99Ms: 10,
      maxMs: 10,
    });
    expect(firstSample).toMatchObject({ count: 1, totalCount: 1, meanMs: 10 });

    const resetSnapshot = telemetry.reset();
    expect(resetSnapshot).toEqual({
      enabled: true,
      capacity: 4,
      count: 0,
      totalCount: 0,
      meanMs: 0,
      p99Ms: 0,
      maxMs: 0,
    });
    expect(telemetry.recordSpan(0, 2)).toBe(true);
    expect(telemetry.getSnapshot()).toMatchObject({ count: 1, totalCount: 1, meanMs: 2 });
  });
});
