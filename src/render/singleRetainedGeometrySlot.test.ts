import { describe, expect, it, vi } from "vitest";

import { createSingleRetainedGeometrySlot } from "./singleRetainedGeometrySlot";

function compileTimeGeometryBoundary(): void {
  // @ts-expect-error Geometry ownership requires a non-null object identity.
  createSingleRetainedGeometrySlot<null>(() => undefined);
}
void compileTimeGeometryBoundary;

describe("single retained geometry slot", () => {
  it("promotes only an unchanged exact owner after the quiet period", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 150,
    });

    expect(slot.select("a", 10)).toEqual({ kind: "immediate" });
    expect(slot.select("a", 159)).toEqual({ kind: "immediate" });
    const promotion = slot.select("a", 160);
    expect(promotion).toMatchObject({ kind: "promote", permit: { ownerKey: "a" } });
    if (promotion.kind !== "promote") throw new Error("Expected promotion permit");
    expect(slot.admit(promotion.permit, { id: "geometry-a" }, 18, 936)).toBe(true);
    expect(slot.select("a", 161)).toEqual({
      kind: "retained",
      geometry: { id: "geometry-a" },
    });
    expect(slot.metrics()).toMatchObject({
      ownerTransitions: 1,
      promotions: 1,
      builds: 1,
      releases: 0,
      discards: 0,
      live: 1,
      peakLive: 1,
      vertices: 18,
      bytes: 936,
    });
  });

  it("releases the sole resource exactly once before selecting a changed owner", () => {
    const release = vi.fn();
    const geometry = { id: "geometry-a" };
    const slot = createSingleRetainedGeometrySlot<typeof geometry>(release, { quietPeriodMs: 0 });

    expect(slot.select("a", 1)).toEqual({ kind: "immediate" });
    const promotion = slot.select("a", 1);
    expect(promotion).toMatchObject({ kind: "promote", permit: { ownerKey: "a" } });
    if (promotion.kind !== "promote") throw new Error("Expected promotion permit");
    expect(slot.admit(promotion.permit, geometry, 3, 156)).toBe(true);
    expect(slot.select("b", 2)).toEqual({ kind: "immediate" });
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(geometry);
    expect(slot.metrics()).toMatchObject({
      ownerTransitions: 2,
      releases: 1,
      live: 0,
      vertices: 0,
      bytes: 0,
    });
  });

  it("keeps rejected owners immediate and independently rejects stale and malformed builds", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 0,
    });

    slot.select("a", 0);
    const promotionA = slot.select("a", 0);
    expect(promotionA).toMatchObject({ kind: "promote" });
    if (promotionA.kind !== "promote") throw new Error("Expected A promotion permit");
    slot.reject(promotionA.permit);
    expect(slot.select("a", 1)).toEqual({ kind: "immediate" });

    slot.select("b", 2);
    const promotionB = slot.select("b", 2);
    if (promotionB.kind !== "promote") throw new Error("Expected B promotion permit");
    const stale = { id: "stale" };
    expect(slot.admit(promotionA.permit, stale, 3, 12)).toBe(false);
    const malformed = { id: "malformed" };
    expect(slot.admit(promotionB.permit, malformed, -1, 12)).toBe(false);
    expect(release.mock.calls).toEqual([[stale], [malformed]]);
    expect(slot.metrics()).toMatchObject({ builds: 2, releases: 2, live: 0 });
    expect(slot.select("b", 3)).toEqual({ kind: "immediate" });
  });

  it("distinguishes context-loss discard from ordinary release", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 0,
    });

    slot.select("a", 0);
    const promotionA = slot.select("a", 0);
    if (promotionA.kind !== "promote") throw new Error("Expected A promotion permit");
    slot.admit(promotionA.permit, { id: "a" }, 6, 312);
    slot.discard();
    expect(release).not.toHaveBeenCalled();
    expect(slot.metrics()).toMatchObject({ discards: 1, live: 0, peakLive: 1 });

    slot.select("b", 1);
    const promotionB = slot.select("b", 1);
    if (promotionB.kind !== "promote") throw new Error("Expected B promotion permit");
    slot.admit(promotionB.permit, { id: "b" }, 6, 312);
    slot.release();
    expect(release).toHaveBeenCalledOnce();
    expect(slot.metrics()).toMatchObject({ discards: 1, releases: 1, live: 0 });
  });

  it("releases a failed resident once and rejects that exact owner until it changes", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 0,
    });
    slot.select("a", 0);
    const promotionA = slot.select("a", 0);
    if (promotionA.kind !== "promote") throw new Error("Expected A promotion permit");
    const geometryA = { id: "a" };
    expect(slot.admit(promotionA.permit, geometryA, 3, 12)).toBe(true);

    slot.rejectResident();
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(geometryA);
    expect(slot.select("a", 1)).toEqual({ kind: "immediate" });
    expect(slot.select("a", 1000)).toEqual({ kind: "immediate" });

    expect(slot.select("b", 1001)).toEqual({ kind: "immediate" });
    const promotionB = slot.select("b", 1001);
    expect(promotionB).toMatchObject({ kind: "promote", permit: { ownerKey: "b" } });
    expect(slot.metrics()).toMatchObject({ releases: 1, live: 0 });
  });

  it("rejects invalid configuration and never advances on an invalid clock", () => {
    expect(() => createSingleRetainedGeometrySlot(vi.fn(), { quietPeriodMs: -1 }))
      .toThrow(RangeError);
    const slot = createSingleRetainedGeometrySlot(vi.fn(), { quietPeriodMs: 0 });
    expect(slot.select("a", Number.NaN)).toEqual({ kind: "immediate" });
    expect(slot.metrics().ownerTransitions).toBe(0);
  });

  it("releases a changed owner even when the new clock is invalid and re-arms quiet time", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 10,
    });
    slot.select("a", 0);
    const promotionA = slot.select("a", 10);
    if (promotionA.kind !== "promote") throw new Error("Expected A promotion permit");
    const geometryA = { id: "a" };
    slot.admit(promotionA.permit, geometryA, 3, 12);

    expect(slot.select("b", Number.NaN)).toEqual({ kind: "immediate" });
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(geometryA);
    expect(slot.select("a", 20)).toEqual({ kind: "immediate" });
    expect(slot.select("a", 29)).toEqual({ kind: "immediate" });
    expect(slot.select("a", 30)).toMatchObject({ kind: "promote" });
  });

  it("revokes a pending permit when time becomes invalid or rewinds", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 10,
    });
    slot.select("a", 10);
    const invalidatedByNaN = slot.select("a", 20);
    if (invalidatedByNaN.kind !== "promote") throw new Error("Expected first permit");
    expect(slot.select("a", Number.NaN)).toEqual({ kind: "immediate" });
    expect(slot.admit(invalidatedByNaN.permit, { id: "nan" }, 3, 12)).toBe(false);

    const next = slot.select("b", 30);
    expect(next).toEqual({ kind: "immediate" });
    const invalidatedByRewind = slot.select("b", 40);
    if (invalidatedByRewind.kind !== "promote") throw new Error("Expected rewind permit");
    expect(slot.select("b", 35)).toEqual({ kind: "immediate" });
    expect(slot.admit(invalidatedByRewind.permit, { id: "rewind" }, 3, 12)).toBe(false);
    expect(slot.select("b", 44)).toEqual({ kind: "immediate" });
    expect(slot.select("b", 45)).toMatchObject({ kind: "promote" });
    expect(release.mock.calls.map(([geometry]) => geometry)).toEqual([
      { id: "nan" },
      { id: "rewind" },
    ]);
  });

  it("uses one-shot permit identity to defeat A-B-A stale admit and reject", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 0,
    });
    slot.select("a", 0);
    const oldA = slot.select("a", 0);
    if (oldA.kind !== "promote") throw new Error("Expected old A permit");
    slot.select("b", 1);
    slot.select("a", 2);
    const newA = slot.select("a", 2);
    if (newA.kind !== "promote") throw new Error("Expected new A permit");

    slot.reject(oldA.permit);
    expect(slot.admit(oldA.permit, { id: "stale-a" }, 3, 12)).toBe(false);
    const current = { id: "current-a" };
    expect(slot.admit(newA.permit, current, 3, 12)).toBe(true);
    expect(slot.select("a", 3)).toEqual({ kind: "retained", geometry: current });
  });

  it("detaches before a throwing release and never double-frees a live object", () => {
    const released: Array<{ readonly id: string }> = [];
    const release = vi.fn((geometry: { readonly id: string }) => {
      released.push(geometry);
      if (geometry.id === "throws") throw new Error("release failure");
    });
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 0,
    });
    slot.select("a", 0);
    const promotion = slot.select("a", 0);
    if (promotion.kind !== "promote") throw new Error("Expected promotion permit");
    const live = { id: "throws" };
    slot.admit(promotion.permit, live, 3, 12);

    expect(() => slot.select("b", 1)).toThrow("release failure");
    expect(slot.metrics()).toMatchObject({ live: 0, releases: 1 });
    expect(() => slot.release()).not.toThrow();
    expect(released).toEqual([live]);
  });

  it("does not free the retained handle when the same permit or object is submitted twice", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 0,
    });
    slot.select("a", 0);
    const promotion = slot.select("a", 0);
    if (promotion.kind !== "promote") throw new Error("Expected promotion permit");
    const live = { id: "live" };
    expect(slot.admit(promotion.permit, live, 3, 12)).toBe(true);
    expect(slot.admit(promotion.permit, live, 3, 12)).toBe(false);
    expect(release).not.toHaveBeenCalled();
    expect(slot.select("a", 1)).toEqual({ kind: "retained", geometry: live });

    const duplicate = { id: "duplicate" };
    expect(slot.admit(promotion.permit, duplicate, 3, 12)).toBe(false);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(duplicate);
    slot.release();
    expect(release).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenLastCalledWith(live);
    const metrics = slot.metrics();
    expect(metrics.builds).toBe(metrics.releases + metrics.discards + metrics.live);
    expect(metrics.peakLive).toBeLessThanOrEqual(1);
  });

  it("discards a delayed old-context candidate without calling graphics cleanup", () => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 0,
    });
    slot.select("a", 0);
    const promotion = slot.select("a", 0);
    if (promotion.kind !== "promote") throw new Error("Expected promotion permit");
    slot.discard();

    const staleContextGeometry = { id: "old-context" };
    expect(slot.admit(promotion.permit, staleContextGeometry, 3, 12)).toBe(false);
    expect(release).not.toHaveBeenCalled();
    expect(slot.metrics()).toMatchObject({ builds: 1, releases: 0, discards: 1, live: 0 });
  });

  it("precommits cleanup before a release callback re-enters the slot", () => {
    let slot: ReturnType<
      typeof createSingleRetainedGeometrySlot<{ readonly id: string }>
    >;
    const release = vi.fn(() => slot.release());
    slot = createSingleRetainedGeometrySlot(release, { quietPeriodMs: 0 });
    slot.select("a", 0);
    const promotion = slot.select("a", 0);
    if (promotion.kind !== "promote") throw new Error("Expected promotion permit");
    slot.admit(promotion.permit, { id: "a" }, 3, 12);

    expect(() => slot.release()).not.toThrow();
    expect(release).toHaveBeenCalledOnce();
    expect(slot.metrics()).toMatchObject({ live: 0, releases: 1 });
  });

  it.each([
    ["negative vertices", -1, 12],
    ["fractional vertices", 1.5, 12],
    ["unsafe vertices", Number.MAX_SAFE_INTEGER + 1, 12],
    ["negative bytes", 3, -1],
    ["fractional bytes", 3, 1.5],
    ["unsafe bytes", 3, Number.MAX_SAFE_INTEGER + 1],
  ])("rejects %s and disposes the candidate exactly once", (_label, vertices, bytes) => {
    const release = vi.fn();
    const slot = createSingleRetainedGeometrySlot<{ readonly id: string }>(release, {
      quietPeriodMs: 0,
    });
    slot.select("a", 0);
    const promotion = slot.select("a", 0);
    if (promotion.kind !== "promote") throw new Error("Expected promotion permit");
    const candidate = { id: "invalid-counts" };

    expect(slot.admit(promotion.permit, candidate, vertices, bytes)).toBe(false);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(candidate);
    expect(slot.select("a", 1)).toEqual({ kind: "immediate" });
    expect(slot.metrics()).toMatchObject({ builds: 1, releases: 1, live: 0 });
  });
});
