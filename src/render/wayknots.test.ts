import { describe, expect, it } from "vitest";

import { buildWaychordBindings, buildWaychords } from "./wayknots";
import type { WayknotKind, WayknotView } from "./types";

const knot = (
  id: string,
  kind: WayknotKind,
  x: number,
  y: number,
  influenceRadius = 10,
  active = true,
): WayknotView => ({ id, label: id, kind, position: { x, y }, influenceRadius, active });

describe("Waychord topology", () => {
  it("connects overlapping active unlike kinds once in stable identity order", () => {
    const reed = knot("reed", "reed-mat", 0, 0, 8);
    const anchor = knot("anchor", "tide-anchor", 12, 0, 5);
    const wind = knot("wind", "wind-knot", 40, 0, 10);

    const forward = buildWaychords([reed, wind, anchor]);
    const reversed = buildWaychords([anchor, wind, reed]);

    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({
      fromId: "anchor",
      toId: "reed",
      fromKind: "tide-anchor",
      toKind: "reed-mat",
      length: 12,
      midpoint: { x: 6, y: 0 },
    });
  });

  it("does not chord inactive, same-kind, or separated knots", () => {
    expect(buildWaychords([
      knot("reed-a", "reed-mat", 0, 0),
      knot("reed-b", "reed-mat", 3, 0),
      knot("anchor-off", "tide-anchor", 3, 0, 10, false),
      knot("wind-zero", "wind-knot", 30, 0, 0),
      knot("anchor-far", "tide-anchor", 50, 0, 10),
    ])).toEqual([]);
  });

  it("treats touching influence boundaries as an overlap", () => {
    expect(buildWaychords([
      knot("a", "reed-mat", 0, 0, 4),
      knot("b", "wind-knot", 7, 0, 3),
    ])).toHaveLength(1);
  });

  it("allows a zero-radius point field to overlap a larger unlike field", () => {
    expect(buildWaychords([
      knot("reed", "reed-mat", 2, 0, 0),
      knot("anchor", "tide-anchor", 0, 0, 3),
    ])).toHaveLength(1);
  });
});

describe("Waychord bindings", () => {
  it("lays bounded cross-ties across both rails without clock-derived state", () => {
    const chord = buildWaychords([
      knot("a", "reed-mat", 0, 0, 20),
      knot("b", "tide-anchor", 12, 0, 20),
    ])[0];
    if (!chord) throw new Error("fixture did not produce a waychord");

    const bindings = buildWaychordBindings(chord, 4, 1.5, 2);
    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toEqual({
      center: { x: 4, y: 0 },
      left: { x: 4, y: 1.5 },
      right: { x: 4, y: -1.5 },
    });
    expect(bindings[1]?.center).toEqual({ x: 8, y: 0 });
  });
});
