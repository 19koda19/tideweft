import { describe, expect, it } from "vitest";

import type { TideHarpView } from "./types";
import {
  buildTideHarpRenderGeometry,
  createTideHarpGeometryMemo,
  tideHarpBellBaseHeight,
  tideHarpBellBob,
} from "./tideHarps";

function harp(active = false): TideHarpView {
  return {
    id: "tide-harp:r1-a3-w5",
    label: "Glass-Ebb Tide Harp · R1 · A3 · W5",
    knots: [
      { id: "1", kind: "reed-mat", point: { x: 12, y: 12 } },
      { id: "3", kind: "tide-anchor", point: { x: 36, y: 12 } },
      { id: "5", kind: "wind-knot", point: { x: 12, y: 36 } },
    ],
    edges: [
      {
        id: "tide-harp-edge:1-3",
        fromId: "1",
        toId: "3",
        from: { x: 12, y: 12 },
        to: { x: 36, y: 12 },
      },
      {
        id: "tide-harp-edge:1-5",
        fromId: "1",
        toId: "5",
        from: { x: 12, y: 12 },
        to: { x: 12, y: 36 },
      },
      {
        id: "tide-harp-edge:3-5",
        fromId: "3",
        toId: "5",
        from: { x: 36, y: 12 },
        to: { x: 12, y: 36 },
      },
    ],
    center: { x: 20, y: 20 },
    active,
  };
}

describe("Tide Harp renderer geometry", () => {
  it("builds three rooted strings per edge and three center suspension cords", () => {
    const geometry = buildTideHarpRenderGeometry(harp(true), 3);
    if (!geometry) throw new Error("valid Tide Harp geometry was rejected");

    expect(geometry.id).toBe("tide-harp:r1-a3-w5");
    expect(geometry.active).toBe(true);
    expect(geometry.strings).toHaveLength(9);
    expect(geometry.spokes).toHaveLength(3);
    expect(geometry.strings.map((string) => string.stringIndex)).toEqual([
      -1, 0, 1,
      -1, 0, 1,
      -1, 0, 1,
    ]);
    expect(geometry.strings.slice(0, 3).map((string) => string.control)).toEqual([
      { x: 24, y: 9 },
      { x: 24, y: 12 },
      { x: 24, y: 15 },
    ]);
    for (const string of geometry.strings.slice(0, 3)) {
      expect(string.from).toEqual({ x: 12, y: 12 });
      expect(string.to).toEqual({ x: 36, y: 12 });
    }
    expect(geometry.spokes.map((spoke) => [spoke.knotId, spoke.to])).toEqual([
      ["1", { x: 20, y: 20 }],
      ["3", { x: 20, y: 20 }],
      ["5", { x: 20, y: 20 }],
    ]);
    expect(geometry.spokes.map((spoke) => spoke.kind)).toEqual([
      "reed-mat",
      "tide-anchor",
      "wind-knot",
    ]);
  });

  it("memoizes geometry per immutable projection and spacing", () => {
    const memo = createTideHarpGeometryMemo();
    const projected = [harp()] as const;
    const first = memo(projected, 3);

    expect(memo(projected, 3)).toBe(first);
    expect(memo(projected, 4)).not.toBe(first);
    expect(memo([projected[0]], 3)).not.toBe(first);
    expect(memo([], 3)).toBe(memo([], 99));
  });

  it("fails closed when the memo receives a non-array collection", () => {
    const memo = createTideHarpGeometryMemo();
    const malformed: readonly unknown[] = [null, undefined, {}, "harps", 3];

    for (const candidate of malformed) {
      expect(() => memo(candidate, 3)).not.toThrow();
      expect(memo(candidate, 3)).toEqual([]);
    }
  });

  it("fails closed for null, missing, or wrong-length projected topology", () => {
    const valid = harp();
    const malformed: readonly unknown[] = [
      null,
      {},
      { ...valid, knots: undefined },
      { ...valid, knots: valid.knots.slice(0, 2) },
      { ...valid, edges: undefined },
      { ...valid, edges: valid.edges.slice(0, 2) },
      { ...valid, edges: [valid.edges[0], undefined, valid.edges[2]] },
    ];

    for (const candidate of malformed) {
      expect(() => buildTideHarpRenderGeometry(candidate, 3)).not.toThrow();
      expect(buildTideHarpRenderGeometry(candidate, 3)).toBeNull();
    }
  });

  it("rejects duplicate knot and edge identities", () => {
    const valid = harp();
    const duplicateKnot = {
      ...valid,
      knots: [valid.knots[0], valid.knots[1], { ...valid.knots[2], id: "3" }],
    };
    const duplicateEdge = {
      ...valid,
      edges: [valid.edges[0], { ...valid.edges[1], id: valid.edges[0].id }, valid.edges[2]],
    };

    expect(buildTideHarpRenderGeometry(duplicateKnot, 3)).toBeNull();
    expect(buildTideHarpRenderGeometry(duplicateEdge, 3)).toBeNull();
  });

  it("rejects edges that do not exactly connect the three validated knots", () => {
    const valid = harp();
    const unknownEndpoint = {
      ...valid,
      edges: [{ ...valid.edges[0], fromId: "unknown" }, valid.edges[1], valid.edges[2]],
    };
    const mismatchedEndpointPoint = {
      ...valid,
      edges: [
        { ...valid.edges[0], to: valid.knots[2].point },
        valid.edges[1],
        valid.edges[2],
      ],
    };
    const duplicatePair = {
      ...valid,
      edges: [
        valid.edges[0],
        valid.edges[1],
        {
          ...valid.edges[2],
          fromId: valid.edges[0].toId,
          toId: valid.edges[0].fromId,
          from: valid.edges[0].to,
          to: valid.edges[0].from,
        },
      ],
    };

    for (const candidate of [unknownEndpoint, mismatchedEndpointPoint, duplicatePair]) {
      expect(() => buildTideHarpRenderGeometry(candidate, 3)).not.toThrow();
      expect(buildTideHarpRenderGeometry(candidate, 3)).toBeNull();
    }
  });

  it("derives one stable non-bobbing bell base above the highest physical root", () => {
    const roots = [
      { kind: "reed-mat", surface: 12 },
      { kind: "tide-anchor", surface: 8 },
      { kind: "wind-knot", surface: 15 },
    ] as const;

    // Wind root: 15 + 1.08 * 20 = 36.6, then fixed suspension clearance.
    expect(tideHarpBellBaseHeight(10, roots, 20, false)).toBeCloseTo(47, 12);
    expect(tideHarpBellBaseHeight(10, roots, 20, true)).toBeCloseTo(50.2, 12);
    expect(tideHarpBellBaseHeight(10, roots, 20, true))
      .toBe(tideHarpBellBaseHeight(10, roots, 20, true));
  });

  it("freezes bell motion exactly under reduced motion", () => {
    expect(tideHarpBellBob(harp().id, 0, 24, true, true)).toBe(0);
    expect(tideHarpBellBob(harp().id, 83_000, 24, true, true)).toBe(0);
    expect(tideHarpBellBob(harp().id, 0, 24, true, false))
      .not.toBe(tideHarpBellBob(harp().id, 1_000, 24, true, false));
    expect(Math.abs(tideHarpBellBob(harp().id, 1_000, 24, true, false)))
      .toBeGreaterThan(Math.abs(tideHarpBellBob(harp().id, 1_000, 24, false, false)));
  });
});
