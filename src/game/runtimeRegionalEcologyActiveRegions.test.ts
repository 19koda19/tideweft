import { describe, expect, it } from "vitest";
import { createRegionCoord, type RegionCoord } from "../sim/regions";
import {
  orderRuntimeRegionalEcologyActiveRegions,
  reuseAuthenticatedRuntimeRegionalEcologyState,
  sameOrderedRuntimeRegionalEcologyActiveRegions,
} from "./runtimeRegionalEcologyActiveRegions";

describe("runtime regional-ecology active-region reuse", () => {
  it("normalizes row-major spatial owners into canonical persistent-key order", () => {
    const rowMajor = [
      createRegionCoord(9, 2),
      createRegionCoord(10, 2),
      createRegionCoord(9, 3),
      createRegionCoord(10, 3),
    ];

    const ordered = orderRuntimeRegionalEcologyActiveRegions(rowMajor);

    expect(ordered).toEqual([
      createRegionCoord(10, 2),
      createRegionCoord(10, 3),
      createRegionCoord(9, 2),
      createRegionCoord(9, 3),
    ]);
    expect(ordered).not.toBe(rowMajor);
    expect(Object.isFrozen(ordered)).toBe(true);
    expect(rowMajor).toEqual([
      createRegionCoord(9, 2),
      createRegionCoord(10, 2),
      createRegionCoord(9, 3),
      createRegionCoord(10, 3),
    ]);
  });

  it("rejects a noncanonical signed coordinate before it can be ordered", () => {
    expect(() => orderRuntimeRegionalEcologyActiveRegions(
      [{ x: -0, y: 0 }] as readonly RegionCoord[],
    )).toThrow(/canonical safe integer/u);
  });

  it("accepts an exact ordered signed-region sequence without requiring object identity", () => {
    const current = [createRegionCoord(-8, 13), createRegionCoord(5, 21)];
    const requested = [createRegionCoord(-8, 13), createRegionCoord(5, 21)];

    expect(sameOrderedRuntimeRegionalEcologyActiveRegions(current, requested)).toBe(true);
  });

  it("rejects a set-equal sequence in a different order", () => {
    const first = createRegionCoord(-8, 13);
    const second = createRegionCoord(5, 21);

    expect(sameOrderedRuntimeRegionalEcologyActiveRegions(
      [first, second],
      [second, first],
    )).toBe(false);
  });

  it("rejects changed, truncated, and extended neighborhoods", () => {
    const first = createRegionCoord(-8, 13);
    const second = createRegionCoord(5, 21);

    expect(sameOrderedRuntimeRegionalEcologyActiveRegions(
      [first, second],
      [first, createRegionCoord(6, 21)],
    )).toBe(false);
    expect(sameOrderedRuntimeRegionalEcologyActiveRegions([first, second], [first])).toBe(false);
    expect(sameOrderedRuntimeRegionalEcologyActiveRegions(
      [first],
      [first, second],
    )).toBe(false);
  });

  it("does not alias positive and negative zero in untrusted lookalikes", () => {
    const positive = [{ x: 0, y: 4 }] as readonly RegionCoord[];
    const negative = [{ x: -0, y: 4 }] as readonly RegionCoord[];

    expect(sameOrderedRuntimeRegionalEcologyActiveRegions(positive, negative)).toBe(false);
  });

  it("returns the exact authenticated state identity only for an exact owner sequence", () => {
    const state = Object.freeze({ authority: "authenticated" });
    const first = createRegionCoord(-8, 13);
    const second = createRegionCoord(5, 21);

    expect(reuseAuthenticatedRuntimeRegionalEcologyState(
      state,
      [first, second],
      [createRegionCoord(-8, 13), createRegionCoord(5, 21)],
    )).toBe(state);
    expect(reuseAuthenticatedRuntimeRegionalEcologyState(
      state,
      [first, second],
      [second, first],
    )).toBeNull();
    expect(reuseAuthenticatedRuntimeRegionalEcologyState(
      state,
      [first, second],
      [first, createRegionCoord(6, 21)],
    )).toBeNull();
  });

  it("identifies exactly five unchanged owner neighborhoods on the canonical travel trace", () => {
    const ownerNeighborhoodAt = (originY: number): readonly RegionCoord[] => {
      const regions: RegionCoord[] = [];
      const firstY = Math.floor(originY / 72);
      const lastY = Math.floor((originY + 119) / 72);
      for (let y = firstY; y <= lastY; y += 1) {
        for (let x = 0; x <= 1; x += 1) regions.push(createRegionCoord(x, y));
      }
      return orderRuntimeRegionalEcologyActiveRegions(regions);
    };
    const epochs = [-33, -49, -65, -81, -97, -113, -129, -145, -161, -177]
      .map(ownerNeighborhoodAt);
    const reusable = epochs.slice(1).map((next, index) => (
      sameOrderedRuntimeRegionalEcologyActiveRegions(epochs[index]!, next)
    ));

    expect(epochs.map(({ length }) => length)).toEqual([6, 4, 4, 6, 6, 6, 4, 6, 6, 6]);
    expect(reusable).toEqual([false, true, false, true, true, false, false, true, true]);
    expect(reusable.filter(Boolean)).toHaveLength(5);
  });
});
