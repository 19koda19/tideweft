import { afterEach, describe, expect, it, vi } from "vitest";

import { createTideweftUIPerformanceProbe } from "./createTideweftUI";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Tideweft UI performance telemetry", () => {
  it("is opt-in, immutable, resettable, and behaviorally transparent", () => {
    let now = 10;
    const performanceNow = vi.fn(() => {
      now += 0.5;
      return now;
    });
    vi.stubGlobal("performance", { now: performanceNow });

    let domNodeCount = 41;
    let renderedRevision = "";
    const authoritativeView = {
      revision: "world:7",
      player: { stamina: 0.72, stability: 0.48 },
    } as const;
    const authoritativeBefore = JSON.stringify(authoritativeView);
    const probe = createTideweftUIPerformanceProbe({
      countDomNodes: () => domNodeCount,
    });

    const unmeasuredResult = probe.measureUpdate((revision: string) => {
      renderedRevision = revision;
      return "painted" as const;
    }, authoritativeView.revision);
    const disabled = probe.getSnapshot();
    expect(unmeasuredResult).toBe("painted");
    expect(renderedRevision).toBe(authoritativeView.revision);
    expect(performanceNow).not.toHaveBeenCalled();
    expect(disabled).toEqual({
      update: {
        enabled: false,
        capacity: 2_048,
        count: 0,
        totalCount: 0,
        meanMs: 0,
        p99Ms: 0,
        maxMs: 0,
      },
      domNodeCount: 41,
    });
    expect(Object.isFrozen(probe)).toBe(true);
    expect(Object.isFrozen(disabled)).toBe(true);
    expect(Object.isFrozen(disabled.update)).toBe(true);

    const enabled = probe.setEnabled(true);
    expect(enabled.update.enabled).toBe(true);
    expect(probe.measureUpdate((value: string) => value, "same-result")).toBe("same-result");
    const measured = probe.getSnapshot();
    expect(measured.update).toMatchObject({
      enabled: true,
      count: 1,
      totalCount: 1,
      meanMs: 0.5,
      p99Ms: 0.5,
      maxMs: 0.5,
    });
    expect(performanceNow).toHaveBeenCalledTimes(2);

    domNodeCount = 47;
    const reset = probe.reset();
    expect(reset.update).toMatchObject({ enabled: true, count: 0, totalCount: 0 });
    expect(reset.domNodeCount).toBe(47);
    expect(Object.isFrozen(reset)).toBe(true);

    const expectedError = new Error("UI work failed");
    expect(() => probe.measureUpdate(() => {
      throw expectedError;
    }, undefined)).toThrow(expectedError);
    expect(probe.getSnapshot().update).toMatchObject({ count: 1, totalCount: 1 });

    const disabledAgain = probe.setEnabled(false);
    const clockCallsBeforeDisabledUpdate = performanceNow.mock.calls.length;
    expect(probe.measureUpdate((view) => view.revision, authoritativeView)).toBe("world:7");
    expect(performanceNow).toHaveBeenCalledTimes(clockCallsBeforeDisabledUpdate);
    expect(probe.getSnapshot().update.count).toBe(disabledAgain.update.count);
    expect(probe.getSnapshot().update.totalCount).toBe(disabledAgain.update.totalCount);

    expect(JSON.stringify(authoritativeView)).toBe(authoritativeBefore);
    expect(authoritativeBefore).not.toMatch(/telemetry|performance|domNodeCount/iu);
  });
});
