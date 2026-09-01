import { describe, expect, it } from "vitest";

import {
  deriveTideHarps,
  enumerateTideHarpCandidates,
  selectTideHarps,
  tideHarpContainsPoint,
  tideHarpContainsTileCenter,
} from "./tideHarps";

const GRID = Object.freeze({ width: 10, height: 10 });

type PlacementMap = Readonly<Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number | null>>>;

function kit(
  placements: PlacementMap,
  options: { readonly reverse?: boolean; readonly wrongKinds?: boolean } = {},
): unknown {
  const kinds = ["reed-mat", "reed-mat", "tide-anchor", "tide-anchor", "wind-knot", "wind-knot"] as const;
  const wayknots = kinds.map((kind, index) => {
    const id = (index + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    return {
      id,
      kind: options.wrongKinds ? kinds[(index + 2) % kinds.length] : kind,
      tileIndex: placements[id] ?? null,
    };
  });
  return {
    version: 1,
    capacity: 6,
    wayknots: options.reverse ? wayknots.reverse() : wayknots,
  };
}

function indexAt(x: number, y: number): number {
  return y * GRID.width + x;
}

function ids(harps: ReturnType<typeof deriveTideHarps>): string[] {
  return harps.map((harp) => harp.id);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

describe("Tide Harp candidate topology", () => {
  it("canonicalizes fixed IDs and kinds independently of input order without mutating state", () => {
    const placements = {
      1: indexAt(1, 1),
      3: indexAt(4, 1),
      5: indexAt(1, 4),
    } as const;
    const forward = deepFreeze(kit(placements, { wrongKinds: true }));
    const reversed = deepFreeze(kit(placements, { wrongKinds: true, reverse: true }));
    const before = JSON.stringify(forward);

    const forwardHarps = deriveTideHarps(forward, GRID);
    const reversedHarps = deriveTideHarps(reversed, GRID);

    expect(forwardHarps).toEqual(reversedHarps);
    expect(JSON.stringify(forward)).toBe(before);
    expect(forwardHarps).toHaveLength(1);
    expect(forwardHarps[0]).toMatchObject({
      id: "tide-harp:r1-a3-w5",
      name: "Glass-Ebb",
      label: "Glass-Ebb Tide Harp · R1 · A3 · W5",
      center: { x: 2.5, y: 2.5 },
      doubleArea: 9,
      area: 4.5,
      knots: [
        { id: 1, kind: "reed-mat", tileIndex: indexAt(1, 1) },
        { id: 3, kind: "tide-anchor", tileIndex: indexAt(4, 1) },
        { id: 5, kind: "wind-knot", tileIndex: indexAt(1, 4) },
      ],
    });
    expect(forwardHarps[0]?.edges.map((edge) => [
      edge.fromId,
      edge.toId,
      edge.manhattanDistance,
      edge.connectionThreshold,
    ])).toEqual([
      [1, 3, 3, 3],
      [1, 5, 3, 4],
      [3, 5, 6, 6],
    ]);
    expect(forwardHarps[0]?.perimeter).toBeCloseTo(6 + Math.sqrt(18), 12);
    expect(Object.isFrozen(forwardHarps)).toBe(true);
    expect(Object.isFrozen(forwardHarps[0])).toBe(true);
    expect(Object.isFrozen(forwardHarps[0]?.knots)).toBe(true);
    expect(Object.isFrozen(forwardHarps[0]?.edges)).toBe(true);
  });

  it("accepts every inclusive connection boundary and rejects one step beyond", () => {
    const windBoundaries = enumerateTideHarpCandidates(kit({
      1: indexAt(0, 0),
      3: indexAt(2, 0),
      5: indexAt(0, 4),
    }), GRID);
    expect(windBoundaries).toHaveLength(1);
    expect(windBoundaries[0]?.edges.map((edge) => edge.manhattanDistance)).toEqual([2, 4, 6]);

    const reedAnchorBoundary = enumerateTideHarpCandidates(kit({
      1: indexAt(0, 0),
      3: indexAt(3, 0),
      5: indexAt(0, 3),
    }), GRID);
    expect(reedAnchorBoundary).toHaveLength(1);
    expect(reedAnchorBoundary[0]?.edges.map((edge) => edge.manhattanDistance)).toEqual([3, 3, 6]);

    expect(enumerateTideHarpCandidates(kit({
      1: indexAt(0, 0),
      3: indexAt(2, 0),
      5: indexAt(0, 5),
    }), GRID)).toEqual([]);
    // Adjacent array indices on opposite row edges are ten tile steps apart.
    expect(enumerateTideHarpCandidates(kit({ 1: 9, 3: 10, 5: 19 }), GRID)).toEqual([]);
  });

  it("rejects pairwise-connected collinear and colliding triples", () => {
    expect(enumerateTideHarpCandidates(kit({
      1: indexAt(0, 0),
      3: indexAt(2, 0),
      5: indexAt(3, 0),
    }), GRID)).toEqual([]);
    expect(enumerateTideHarpCandidates(kit({
      1: indexAt(2, 2),
      3: indexAt(2, 2),
      5: indexAt(3, 3),
    }), GRID)).toEqual([]);
  });
});

describe("Tide Harp disjoint selection", () => {
  it("finds the exact maximum set instead of taking the first canonical bait", () => {
    const candidates = enumerateTideHarpCandidates(kit({
      1: indexAt(4, 4),
      2: indexAt(6, 6),
      3: indexAt(6, 4),
      4: indexAt(2, 4),
      5: indexAt(4, 7),
      6: indexAt(4, 0),
    }), GRID);
    expect(ids(candidates)).toContain("tide-harp:r1-a3-w5");

    const selected = selectTideHarps(candidates);
    expect(ids(selected)).toEqual([
      "tide-harp:r1-a4-w6",
      "tide-harp:r2-a3-w5",
    ]);
    expect(new Set(selected.flatMap((harp) => harp.knots.map((knot) => knot.id))).size).toBe(6);
  });

  it("prefers smaller total perimeter, then canonical stable IDs on an exact tie", () => {
    const candidates = enumerateTideHarpCandidates(kit({
      1: indexAt(0, 0),
      2: indexAt(0, 1),
      3: indexAt(2, 0),
      4: indexAt(2, 1),
      5: indexAt(1, 2),
      6: indexAt(1, 3),
    }), GRID);
    expect(candidates).toHaveLength(8);
    expect(ids(selectTideHarps([...candidates].reverse()))).toEqual([
      "tide-harp:r1-a3-w5",
      "tide-harp:r2-a4-w6",
    ]);

    const tiedIds = new Set([
      "tide-harp:r1-a4-w5",
      "tide-harp:r2-a3-w6",
      "tide-harp:r1-a4-w6",
      "tide-harp:r2-a3-w5",
    ]);
    const tied = candidates.filter((candidate) => tiedIds.has(candidate.id));
    const firstTotal = tied
      .filter((candidate) => candidate.id === "tide-harp:r1-a4-w5" || candidate.id === "tide-harp:r2-a3-w6")
      .reduce((total, candidate) => total + candidate.perimeter, 0);
    const secondTotal = tied
      .filter((candidate) => candidate.id === "tide-harp:r1-a4-w6" || candidate.id === "tide-harp:r2-a3-w5")
      .reduce((total, candidate) => total + candidate.perimeter, 0);
    expect(firstTotal).toBeCloseTo(secondTotal, 12);
    expect(ids(selectTideHarps([...tied].reverse()))).toEqual([
      "tide-harp:r1-a4-w5",
      "tide-harp:r2-a3-w6",
    ]);
  });
});

describe("Tide Harp containment", () => {
  it("includes interior, edge, and vertex tile centers while excluding outside tiles", () => {
    const harp = deriveTideHarps(kit({
      1: indexAt(1, 1),
      3: indexAt(4, 1),
      5: indexAt(1, 4),
    }), GRID)[0];
    if (!harp) throw new Error("fixture did not form a Tide Harp");

    expect(tideHarpContainsTileCenter(harp, indexAt(2, 2), GRID)).toBe(true);
    expect(tideHarpContainsTileCenter(harp, indexAt(3, 2), GRID)).toBe(true);
    expect(tideHarpContainsTileCenter(harp, indexAt(1, 1), GRID)).toBe(true);
    expect(tideHarpContainsTileCenter(harp, indexAt(4, 4), GRID)).toBe(false);
    expect(tideHarpContainsPoint(harp, { x: 2.5, y: 2.5 })).toBe(true);
    expect(tideHarpContainsPoint(harp, { x: 8.5, y: 8.5 })).toBe(false);
  });

  it("works for clockwise triangles and rejects forged geometry or invalid tiles", () => {
    const clockwise = deriveTideHarps(kit({
      1: indexAt(1, 1),
      3: indexAt(1, 4),
      5: indexAt(4, 1),
    }), GRID)[0];
    if (!clockwise) throw new Error("fixture did not form a clockwise Tide Harp");
    expect(tideHarpContainsTileCenter(clockwise, indexAt(2, 2), GRID)).toBe(true);
    expect(tideHarpContainsTileCenter(clockwise, -1, GRID)).toBe(false);
    expect(tideHarpContainsTileCenter(clockwise, 100, GRID)).toBe(false);
    expect(tideHarpContainsTileCenter({ ...clockwise, doubleArea: 1 }, indexAt(2, 2), GRID)).toBe(false);
    expect(tideHarpContainsPoint({}, { x: 2.5, y: 2.5 })).toBe(false);
  });
});

describe("Tide Harp malformed inputs", () => {
  it("fails closed for invalid grids, missing state, carried pieces, and hostile records", () => {
    expect(deriveTideHarps(null, null)).toEqual([]);
    expect(deriveTideHarps(kit({}), GRID)).toEqual([]);
    expect(deriveTideHarps(kit({ 1: 11, 3: 14, 5: 41 }), { width: 0, height: 10 })).toEqual([]);
    expect(deriveTideHarps(kit({ 1: 11, 3: 14, 5: 41 }), {
      width: Number.MAX_SAFE_INTEGER,
      height: 2,
    })).toEqual([]);
    expect(deriveTideHarps({
      capacity: 6,
      wayknots: [
        { id: 1, kind: "reed-mat", tileIndex: 11 },
        { id: 1, kind: "reed-mat", tileIndex: 12 },
        { id: 3, kind: "tide-anchor", tileIndex: 500 },
        { id: 99, kind: "wind-knot", tileIndex: 41 },
      ],
    }, GRID)).toEqual([]);

    const hostile = new Proxy({}, { get: () => { throw new Error("hostile getter"); } });
    expect(deriveTideHarps(hostile, GRID)).toEqual([]);
    expect(deriveTideHarps(kit({ 1: 11, 3: 14, 5: 41 }), hostile)).toEqual([]);
    expect(selectTideHarps(hostile)).toEqual([]);
    expect(tideHarpContainsPoint(hostile, hostile)).toBe(false);
    expect(tideHarpContainsTileCenter(hostile, 11, hostile)).toBe(false);
  });
});
