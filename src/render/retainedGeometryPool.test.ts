import { describe, expect, it, vi } from "vitest";

import { createRetainedGeometryPool } from "./retainedGeometryPool";

describe("retained geometry pool", () => {
  it("creates once per batch identity and releases on an owner transition", () => {
    const release = vi.fn();
    const create = vi.fn(() => ({ id: "geometry-a" }));
    const pool = createRetainedGeometryPool<object, object, { id: string }>(release);
    const ownerA = {};
    const ownerB = {};
    const batch = {};

    pool.begin(ownerA);
    const first = pool.geometryFor(batch, create);
    expect(pool.geometryFor(batch, create)).toBe(first);
    expect(create).toHaveBeenCalledOnce();

    pool.begin(ownerB);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(first);
    expect(pool.geometryFor(batch, create)).not.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("releases explicitly but discards lost-context handles without GPU calls", () => {
    const release = vi.fn();
    const pool = createRetainedGeometryPool<object, object, { id: string }>(release);
    const batch = {};

    pool.begin({});
    const lost = pool.geometryFor(batch, () => ({ id: "lost" }));
    pool.discard();
    expect(release).not.toHaveBeenCalled();

    expect(() => pool.geometryFor(batch, () => lost)).toThrow(
      "Retained geometry requires an active presentation owner.",
    );

    pool.begin({});
    const live = pool.geometryFor(batch, () => ({ id: "live" }));
    pool.release();
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(live);
  });

  it("releases each distinct retained batch exactly once", () => {
    const release = vi.fn();
    const pool = createRetainedGeometryPool<object, object, { id: string }>(release);
    const owner = {};
    const firstBatch = {};
    const secondBatch = {};
    const first = { id: "first" };
    const second = { id: "second" };

    pool.begin(owner);
    pool.geometryFor(firstBatch, () => first);
    pool.geometryFor(secondBatch, () => second);
    pool.begin(null);

    expect(release.mock.calls).toEqual([[first], [second]]);
    pool.begin(null);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest retained batch at its hard resource bound", () => {
    const release = vi.fn();
    const pool = createRetainedGeometryPool<object, object, { id: string }>(
      release,
      { maximumGeometries: 2 },
    );
    const firstBatch = {};
    const secondBatch = {};
    const thirdBatch = {};
    const first = { id: "first" };

    pool.begin({});
    pool.geometryFor(firstBatch, () => first);
    pool.geometryFor(secondBatch, () => ({ id: "second" }));
    pool.geometryFor(thirdBatch, () => ({ id: "third" }));
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(first);

    pool.geometryFor(firstBatch, () => ({ id: "first-rebuilt" }));
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid resource bound", () => {
    expect(() => createRetainedGeometryPool(vi.fn(), { maximumGeometries: 0 }))
      .toThrow("Retained geometry maximum must be a positive safe integer.");
  });
});
