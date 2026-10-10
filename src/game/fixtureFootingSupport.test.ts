import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import { evaluateFooting, fixtureSupportMitigation, type FootingInput } from "./footing";
import {
  createWayknotState,
  normalizeWayknotState,
  placeWayknot,
  queryWayknotEffects,
  wayknotFootingSupport,
  type WayknotEffects,
  type WayknotKind,
  type WayknotState,
  type WayknotTileContext,
} from "./wayknots";

// Synthetic calculation/placement foundations, not acquisition, native human
// use, a complete world contact, or a benefit-qualified wear receipt.
const GRID = Object.freeze({ width: 10, height: 10 });
const CONTACT: FootingInput = {
  stability: 700_000,
  moving: true,
  speed: 450_000,
  surface: "water",
  elevationDelta: 0,
  roughness: 200_000,
  moisture: 760_000,
  waterDepth: 150_000,
  movement: { x: FIXED_POINT, y: 0 },
  current: { x: 0, y: 600_000 },
  wind: { x: 0, y: 0 },
  weatherIntensity: 0,
  turnPressure: 0,
  loadRatio: 0,
  cargoShift: 0,
  pace: "steady",
  brace: false,
  footwearGrip: 0,
  fixtureSupport: 0,
  reliableGround: false,
  unsupportedEdge: 0,
};

function tile(tileIndex: number, terrain: WayknotTileContext["terrain"] = "marsh", waterDepth = 0): WayknotTileContext {
  return { tileIndex, terrain, waterDepth, windExposed: terrain === "ridge" };
}

function place(state: WayknotState, kind: WayknotKind, context: WayknotTileContext): WayknotState {
  const result = placeWayknot(state, kind, context, 10);
  expect(result.ok).toBe(true);
  expect(result.reason).toBe("placed");
  expect(result.wayknot).toMatchObject({ condition: 920_000, readyTick: 13 });
  return result.state;
}

function expectSupport(effects: WayknotEffects, expected: number): void {
  const before = structuredClone(effects);
  const support = wayknotFootingSupport(effects);
  expect(support).toBe(expected);
  expect(evaluateFooting({ ...CONTACT, fixtureSupport: support }).mitigation.fixture)
    .toBe(Math.trunc(expected * 560_000 / FIXED_POINT));
  expect(effects).toEqual(before);
}

describe("inherited fixture-support arithmetic", () => {
  it("retains the old finite clamp, support truncation and 560000 multiplier", () => {
    for (const [input, expected] of [
      [0, 0], [-0, 0], [-1, 0], [1.99, 0], [178_571.9, 99_999],
      [500_000, 280_000], [500_001.9, 280_000], [FIXED_POINT, 560_000],
      [FIXED_POINT + 1, 560_000], [Number.MAX_VALUE, 560_000],
      [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0], [Number.NEGATIVE_INFINITY, 0],
    ] as const) {
      expect(fixtureSupportMitigation(input), String(input)).toBe(expected);
      expect(Object.is(fixtureSupportMitigation(input), -0)).toBe(false);
    }
  });

  it("keeps evaluateFooting's fixture channel and unchanged raw causes exact", () => {
    const bare = evaluateFooting(CONTACT);
    for (const support of [0, 178_571.9, 500_001.9, FIXED_POINT + 1, Number.NaN]) {
      const finite = !Number.isFinite(support) || support <= 0
        ? 0 : Math.min(FIXED_POINT, Math.trunc(support));
      const expected = Math.trunc(finite * 560_000 / FIXED_POINT);
      const result = evaluateFooting({ ...CONTACT, fixtureSupport: support });
      expect(result.mitigation).toEqual({ brace: 0, footwear: 0, fixture: expected, total: expected });
      expect(result.causes).toEqual(bare.causes);
      expect(result.hazardPressure).toBe(bare.hazardPressure);
      expect(result.stabilityTarget)
        .toBe(FIXED_POINT - Math.trunc(bare.hazardPressure * (FIXED_POINT - expected) / FIXED_POINT));
      expect(result.stabilityAfter).toBe(result.stabilityTarget);
    }
  });
});

describe("lawfully placed Wayknot support foundations", () => {
  it("keeps reed support local, soft-ground-only and exactly setting-scaled", () => {
    const carried = createWayknotState();
    const state = place(carried, "reed-mat", tile(44));
    const before = structuredClone(state);
    expectSupport(queryWayknotEffects(carried, tile(44), GRID, 13), 0);
    expectSupport(queryWayknotEffects(state, tile(44), GRID, 10), 290_000);
    expectSupport(queryWayknotEffects(state, tile(44), GRID, 12), 290_000);
    expectSupport(queryWayknotEffects(state, tile(44), GRID, 13), 580_000);
    expectSupport(queryWayknotEffects(state, tile(45), GRID, 13), 0);
    expectSupport(queryWayknotEffects(state, tile(44, "meadow"), GRID, 13), 0);
    expect(state).toEqual(before);
  });

  it("uses actual anchor sweep-risk falloff, never its neutral stability-loss channel", () => {
    const state = place(createWayknotState(), "tide-anchor", tile(44, "deep-water", 320_000));
    const local = queryWayknotEffects(state, tile(44, "deep-water", 320_000), GRID, 13);
    expect(local.stabilityLossPermille).toBe(1_000);
    expect(local.sweepRiskPermille).toBe(400);
    expectSupport(local, 600_000);
    expectSupport(queryWayknotEffects(state, tile(44, "deep-water", 320_000), GRID, 10), 300_000);
    for (const [index, mature, setting] of [[45, 350_000, 175_000], [46, 150_000, 75_000], [47, 0, 0]] as const) {
      expectSupport(queryWayknotEffects(state, tile(index, "marsh", 40_000), GRID, 13), mature);
      expectSupport(queryWayknotEffects(state, tile(index, "marsh", 40_000), GRID, 10), setting);
    }
    expectSupport(queryWayknotEffects(state, tile(45, "marsh", 39_999), GRID, 13), 0);
  });

  it("retains signed region identity, clone parity and inert broken/carried pieces", () => {
    const region = { x: -1, y: 2 };
    const context = tile(44, "deep-water", 320_000);
    const placed = placeWayknot(createWayknotState(), "tide-anchor", context, 10, region);
    expect(placed.ok).toBe(true);
    expectSupport(queryWayknotEffects(placed.state, context, GRID, 13), 0);
    expectSupport(queryWayknotEffects(placed.state, context, GRID, 13, region), 600_000);
    expectSupport(queryWayknotEffects(structuredClone(placed.state), context, GRID, 13, region), 600_000);
    // Explicit broken-condition contrast; this does not claim enacted wear.
    const broken = normalizeWayknotState({
      ...placed.state,
      wayknots: placed.state.wayknots.map((wayknot) => wayknot.id === placed.wayknot!.id
        ? { ...wayknot, condition: 0 } : wayknot),
    }, { tileCount: GRID.width * GRID.height });
    expectSupport(queryWayknotEffects(broken, context, GRID, 13, region), 0);
    expectSupport(queryWayknotEffects(createWayknotState(), context, GRID, 13, region), 0);
  });

  it("takes the strongest applicable support without stacking anchors or a local reed", () => {
    let state = place(createWayknotState(), "tide-anchor", tile(44, "deep-water", 320_000));
    state = place(state, "tide-anchor", tile(46, "deep-water", 320_000));
    const wetMiddle = tile(45, "marsh", 40_000);
    const anchors = queryWayknotEffects(state, wetMiddle, GRID, 13);
    expect(anchors.influences.map(({ id }) => id)).toEqual([3, 4]);
    expectSupport(anchors, 350_000);
    state = place(state, "reed-mat", wetMiddle);
    expectSupport(queryWayknotEffects(state, wetMiddle, GRID, 10), 290_000);
    expectSupport(queryWayknotEffects(state, wetMiddle, GRID, 13), 580_000);
    expectSupport(queryWayknotEffects(state, tile(44, "deep-water", 320_000), GRID, 13), 600_000);
  });

  it("does not invent fixture footing support from a wind-knot channel", () => {
    const context = tile(44, "ridge");
    const state = place(createWayknotState(), "wind-knot", context);
    const effects = queryWayknotEffects(state, context, GRID, 13);
    expect(effects.stabilityLossPermille).toBe(500);
    expectSupport(effects, 0);
  });
});
