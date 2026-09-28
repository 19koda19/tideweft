import { describe, expect, it, vi } from "vitest";

import { createRegionalEcologyV6SiblingEncodingCollector } from "./regionalEcologyStateV6SiblingEncodingCollector";

describe("regional ecology V6 sibling encoding collector", () => {
  it("admits the exact combined ceiling and transfers source-ordered text once", () => {
    const first = Object.freeze({ sourceKey: "a" });
    const second = Object.freeze({ sourceKey: "b" });
    const collector = createRegionalEcologyV6SiblingEncodingCollector<object>(
      19,
      [3, 4],
    );

    expect(collector.totalCodeUnits).toBe(10);
    expect(collector.collect(first, ["{}"])).toBe(true);
    expect(collector.totalCodeUnits).toBe(12);
    expect(collector.collect(second, ['{"x":1}'])).toBe(true);
    expect(collector.totalCodeUnits).toBe(19);

    const result = collector.finish(Object.freeze([second, first]));
    expect(result).toEqual({
      values: [second, first],
      segments: ["[", '{"x":1}', ",", "{}", "]"],
      combinedCodeUnits: 19,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.segments)).toBe(true);
    expect(collector.accepting).toBe(false);
    expect(collector.totalCodeUnits).toBe(0);
    expect(collector.retainedSnapshotCount).toBe(0);
    expect(collector.finish(Object.freeze([second, first]))).toBeNull();
  });

  it("revokes prior retention before joining the first over-budget encoding", () => {
    const first = Object.freeze({ sourceKey: "a" });
    const second = Object.freeze({ sourceKey: "b" });
    const collector = createRegionalEcologyV6SiblingEncodingCollector<object>(
      18,
      [3, 4],
    );
    expect(collector.collect(first, ["{}"])).toBe(true);
    const overBudgetSegments = ['{"x":1}'];
    const join = vi.spyOn(overBudgetSegments, "join");

    expect(collector.collect(second, overBudgetSegments)).toBe(false);
    expect(join).not.toHaveBeenCalled();
    expect(collector.accepting).toBe(false);
    expect(collector.totalCodeUnits).toBe(0);
    expect(collector.retainedSnapshotCount).toBe(0);
    expect(collector.collect(second, ["{}"])).toBe(false);
    expect(collector.finish(Object.freeze([first, second]))).toBeNull();
  });

  it("rejects an over-budget source preflight and an identity-substituted finish", () => {
    const emptyOverhead = createRegionalEcologyV6SiblingEncodingCollector<object>(
      1,
      [],
    );
    expect(emptyOverhead.accepting).toBe(false);
    expect(emptyOverhead.finish(Object.freeze([]))).toBeNull();

    const preflight = createRegionalEcologyV6SiblingEncodingCollector<object>(
      7,
      [6],
    );
    expect(preflight.accepting).toBe(false);
    expect(preflight.retainedSnapshotCount).toBe(0);

    const exact = Object.freeze({ sourceKey: "exact" });
    const clone = Object.freeze({ sourceKey: "exact" });
    const substituted = createRegionalEcologyV6SiblingEncodingCollector<object>(
      32,
      [1],
    );
    expect(substituted.collect(exact, ["{}"])).toBe(true);
    expect(substituted.finish(Object.freeze([clone]))).toBeNull();
    expect(substituted.accepting).toBe(false);
    expect(substituted.totalCodeUnits).toBe(0);
    expect(substituted.retainedSnapshotCount).toBe(0);
  });
});
