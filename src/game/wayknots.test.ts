import { describe, expect, it } from "vitest";
import { REGION_COORD_LIMIT } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";

import {
  DEFAULT_WAYKNOT_CAPACITY,
  MAX_WAYKNOT_CAPACITY,
  WAYKNOT_CONDITION_MAX,
  WAYKNOT_DESCRIPTIONS,
  WAYKNOT_FULL_STRENGTH,
  WAYKNOT_LABELS,
  WAYKNOT_PERMILLE,
  WAYKNOT_PLACEMENT_CONDITION_COST,
  WAYKNOT_PLACEMENT_HINTS,
  WAYKNOT_RECLAIM_CONDITION_COST,
  WAYKNOT_SERVICE_REMAINDER_SCALE,
  WAYKNOT_SETTING_STRENGTH,
  WAYKNOT_SETTING_TICKS,
  WAYKNOT_STATE_VERSION,
  applyWayknotServiceWear,
  applyWayknotPermille,
  contextualWayknotKind,
  createWayknotState,
  deployedWayknotCount,
  isWindExposedTile,
  manhattanTileDistance,
  modifyMovementCost,
  modifyPathCost,
  modifyStabilityLoss,
  modifyStaminaCost,
  modifySweepRisk,
  normalizeWayknotState,
  placeContextualWayknot,
  placeWayknot,
  queryWayknotEffects,
  reclaimWayknot,
  reclaimWayknotAtTile,
  redeployWayknot,
  supportsWayknot,
  tideHarpEffectStrength,
  toggleContextualWayknot,
  validateWayknotPlacement,
  wayknotAtTile,
  wayknotEffectStrength,
  type Wayknot,
  type WayknotState,
  type WayknotTileContext,
} from "./wayknots";
import { deriveTideHarps } from "./tideHarps";

const GRID = Object.freeze({ width: 10, height: 10 });

function tile(
  tileIndex: number,
  options: Partial<Omit<WayknotTileContext, "tileIndex">> = {},
): WayknotTileContext {
  return {
    tileIndex,
    terrain: "meadow",
    waterDepth: 0,
    windExposed: false,
    ...options,
  };
}

function placedState(
  wayknots: readonly (
    Pick<Wayknot, "id" | "kind" | "tileIndex">
    & Partial<Pick<Wayknot, "condition" | "readyTick" | "serviceWearRemainder">>
  )[],
  capacity = DEFAULT_WAYKNOT_CAPACITY,
): WayknotState {
  return normalizeWayknotState({ capacity, wayknots }, { capacity, tileCount: 100 });
}

function fullKnot(
  id: number,
  kind: Wayknot["kind"],
  tileIndex: number | null,
  overrides: Partial<Pick<Wayknot, "condition" | "readyTick" | "serviceWearRemainder">> = {},
): Wayknot {
  return {
    id,
    kind,
    region: tileIndex === null ? null : { x: 0, y: 0 },
    tileIndex,
    condition: WAYKNOT_CONDITION_MAX,
    readyTick: 0,
    serviceWearRemainder: 0,
    ...overrides,
  };
}

describe("wayknot field kit", () => {
  it("starts as a six-slot deterministic, save-safe field kit", () => {
    const state = createWayknotState();

    expect(state).toEqual({
      version: WAYKNOT_STATE_VERSION,
      capacity: 6,
      wayknots: [
        fullKnot(1, "reed-mat", null),
        fullKnot(2, "reed-mat", null),
        fullKnot(3, "tide-anchor", null),
        fullKnot(4, "tide-anchor", null),
        fullKnot(5, "wind-knot", null),
        fullKnot(6, "wind-knot", null),
      ],
    });
    expect(state.capacity).toBe(DEFAULT_WAYKNOT_CAPACITY);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.wayknots)).toBe(true);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("ships stable labels, descriptions, and placement hints for all three aids", () => {
    expect(WAYKNOT_LABELS).toEqual({
      "reed-mat": "Reed mat",
      "tide-anchor": "Tide anchor",
      "wind-knot": "Wind knot",
    });
    expect(WAYKNOT_DESCRIPTIONS["reed-mat"]).toContain("mudflat");
    expect(WAYKNOT_DESCRIPTIONS["tide-anchor"]).toContain("current");
    expect(WAYKNOT_DESCRIPTIONS["wind-knot"]).toContain("crosswind");
    expect(WAYKNOT_PLACEMENT_HINTS["reed-mat"]).toContain("tidal flat");
    expect(WAYKNOT_PLACEMENT_HINTS["tide-anchor"]).toContain("waist deep");
    expect(WAYKNOT_PLACEMENT_HINTS["wind-knot"]).toContain("wind scrub");
  });

  it("chooses the terrain-specific weave with wet ground taking clear precedence", () => {
    const dryFlat = tile(1, { terrain: "tidal-flat" });
    const floodedMarsh = tile(2, { terrain: "marsh", waterDepth: 160_000 });
    const channel = tile(3, { terrain: "deep-water", waterDepth: 20_000 });
    const scrub = tile(4, { terrain: "meadow", windExposed: true });
    const ridge = tile(5, { terrain: "ridge", windExposed: true });

    expect(contextualWayknotKind(dryFlat)).toBe("reed-mat");
    expect(contextualWayknotKind(floodedMarsh)).toBe("tide-anchor");
    expect(contextualWayknotKind(channel)).toBe("tide-anchor");
    expect(contextualWayknotKind(scrub)).toBe("wind-knot");
    expect(contextualWayknotKind(ridge)).toBe("wind-knot");
    expect(contextualWayknotKind(tile(6))).toBeNull();

    expect(supportsWayknot("reed-mat", dryFlat)).toBe(true);
    expect(supportsWayknot("tide-anchor", dryFlat)).toBe(false);
    expect(supportsWayknot("wind-knot", tile(7, { terrain: "ridge", windExposed: false }))).toBe(false);
  });

  it("uses the game's exact meadow-to-wind-scrub thresholds", () => {
    expect(isWindExposedTile({ terrain: "ridge", moisture: 1_000_000, roughness: 0 })).toBe(true);
    expect(isWindExposedTile({ terrain: "meadow", moisture: 544_999, roughness: 0 })).toBe(true);
    expect(isWindExposedTile({ terrain: "meadow", moisture: 545_000, roughness: 610_001 })).toBe(true);
    expect(isWindExposedTile({ terrain: "meadow", moisture: 545_000, roughness: 610_000 })).toBe(false);
    expect(isWindExposedTile({ terrain: "marsh", moisture: 0, roughness: 1_000_000 })).toBe(false);
  });

  it("validates terrain, external occupancy, wayknot occupancy, and malformed contexts", () => {
    const start = createWayknotState();
    const marsh = tile(11, { terrain: "marsh" });
    const first = placeWayknot(start, "reed-mat", marsh);

    expect(first.ok).toBe(true);
    expect(first.reason).toBe("placed");
    expect(first.wayknot).toEqual(fullKnot(1, "reed-mat", 11, {
      condition: WAYKNOT_CONDITION_MAX - WAYKNOT_PLACEMENT_CONDITION_COST,
      readyTick: WAYKNOT_SETTING_TICKS,
    }));
    expect(start.wayknots.every((wayknot) => wayknot.tileIndex === null)).toBe(true);
    expect(wayknotAtTile(first.state, 11)?.id).toBe(1);
    expect(validateWayknotPlacement(first.state, "wind-knot", marsh)).toBe("occupied");
    expect(validateWayknotPlacement(first.state, "reed-mat", tile(12))).toBe("unsuitable-terrain");
    expect(validateWayknotPlacement(first.state, "reed-mat", tile(12, {
      terrain: "marsh",
      occupied: true,
    }))).toBe("occupied");
    expect(validateWayknotPlacement(first.state, "reed-mat", {
      ...marsh,
      tileIndex: Number.NaN,
    })).toBe("invalid-context");
  });

  it("assigns stable ascending IDs and enforces a configured cap", () => {
    let state = createWayknotState(2);
    const first = placeContextualWayknot(state, tile(31, { terrain: "marsh" }));
    expect(first.ok).toBe(true);
    state = first.state;
    const second = placeContextualWayknot(state, tile(42, {
      terrain: "deep-water",
      waterDepth: 300_000,
    }));
    expect(second.ok).toBe(true);
    state = second.state;

    expect(state.wayknots.map((wayknot) => wayknot.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(second.wayknot?.id).toBe(3);
    expect(deployedWayknotCount(state)).toBe(2);
    const full = placeContextualWayknot(state, tile(53, { terrain: "ridge", windExposed: true }));
    expect(full.ok).toBe(false);
    expect(full.reason).toBe("capacity-reached");
    expect(full.state).toBe(state);
  });

  it("reclaims and redeploys the same physical aid without changing its ID or kit count", () => {
    const placed = placeWayknot(
      createWayknotState(),
      "tide-anchor",
      tile(44, { terrain: "deep-water", waterDepth: 420_000 }),
    );
    if (!placed.ok || !placed.wayknot) throw new Error("placement fixture failed");
    const reclaimed = reclaimWayknot(placed.state, placed.wayknot.id);

    expect(reclaimed.ok).toBe(true);
    expect(reclaimed.reason).toBe("reclaimed");
    expect(reclaimed.wayknot).toEqual(fullKnot(3, "tide-anchor", null, {
      condition: WAYKNOT_CONDITION_MAX
        - WAYKNOT_PLACEMENT_CONDITION_COST
        - WAYKNOT_RECLAIM_CONDITION_COST,
    }));
    expect(reclaimed.state.wayknots).toHaveLength(6);
    expect(deployedWayknotCount(reclaimed.state)).toBe(0);

    const wrongGround = redeployWayknot(reclaimed.state, 3, tile(45, { terrain: "marsh" }));
    expect(wrongGround.ok).toBe(false);
    expect(wrongGround.reason).toBe("unsuitable-terrain");
    const redeployed = redeployWayknot(
      reclaimed.state,
      3,
      tile(46, { terrain: "deep-water", waterDepth: 260_000 }),
    );
    expect(redeployed.ok).toBe(true);
    expect(redeployed.reason).toBe("redeployed");
    expect(redeployed.wayknot).toEqual(fullKnot(3, "tide-anchor", 46, {
      condition: WAYKNOT_CONDITION_MAX
        - WAYKNOT_PLACEMENT_CONDITION_COST * 2
        - WAYKNOT_RECLAIM_CONDITION_COST,
      readyTick: WAYKNOT_SETTING_TICKS,
    }));
    expect(redeployed.state.wayknots).toHaveLength(6);
  });

  it("keeps kinds fixed and exhausts a contextual aid after both copies are deployed", () => {
    const first = placeContextualWayknot(
      createWayknotState(),
      tile(11, { terrain: "tidal-flat" }),
    );
    const second = placeContextualWayknot(
      first.state,
      tile(12, { terrain: "marsh" }),
    );
    const exhausted = placeContextualWayknot(
      second.state,
      tile(13, { terrain: "marsh" }),
    );

    expect(first.wayknot).toEqual(fullKnot(1, "reed-mat", 11, {
      condition: WAYKNOT_CONDITION_MAX - WAYKNOT_PLACEMENT_CONDITION_COST,
      readyTick: WAYKNOT_SETTING_TICKS,
    }));
    expect(second.wayknot).toEqual(fullKnot(2, "reed-mat", 12, {
      condition: WAYKNOT_CONDITION_MAX - WAYKNOT_PLACEMENT_CONDITION_COST,
      readyTick: WAYKNOT_SETTING_TICKS,
    }));
    expect(exhausted.ok).toBe(false);
    expect(exhausted.reason).toBe("capacity-reached");
    expect(exhausted.state.wayknots.filter((wayknot) => wayknot.kind === "wind-knot"))
      .toEqual([
        fullKnot(5, "wind-knot", null),
        fullKnot(6, "wind-knot", null),
      ]);

    const reclaimed = reclaimWayknot(second.state, 1);
    const replacement = placeContextualWayknot(
      reclaimed.state,
      tile(13, { terrain: "marsh" }),
    );
    expect(replacement.wayknot).toEqual(fullKnot(1, "reed-mat", 13, {
      condition: WAYKNOT_CONDITION_MAX
        - WAYKNOT_PLACEMENT_CONDITION_COST * 2
        - WAYKNOT_RECLAIM_CONDITION_COST,
      readyTick: WAYKNOT_SETTING_TICKS,
    }));
    expect(replacement.state.wayknots).toHaveLength(6);
  });

  it("offers a pure one-button place/reclaim toggle", () => {
    const context = tile(21, { terrain: "marsh" });
    const placed = toggleContextualWayknot(createWayknotState(), context);
    expect(placed.reason).toBe("placed");
    expect(wayknotAtTile(placed.state, context.tileIndex)).not.toBeNull();

    const reclaimed = toggleContextualWayknot(placed.state, context);
    expect(reclaimed.reason).toBe("reclaimed");
    expect(wayknotAtTile(reclaimed.state, context.tileIndex)).toBeNull();
    expect(reclaimed.state.wayknots).toHaveLength(6);
  });

  it("initializes a missing legacy field while repairing an explicit malformed field without filling holes", () => {
    const empty = normalizeWayknotState(null);
    expect(empty).toEqual(createWayknotState());

    const normalized = normalizeWayknotState({
      version: 999,
      capacity: 999,
      wayknots: [
        null,
        "knot",
        { id: -1, kind: "reed-mat", tileIndex: 1 },
        { id: 1, kind: "not-a-knot", tileIndex: 1 },
        { id: 2, kind: "wind-knot", tileIndex: Number.NaN },
        { id: 3, kind: "reed-mat", tileIndex: 200 },
      ],
    }, { tileCount: 100, loadTick: 77 });

    expect(normalized.capacity).toBe(MAX_WAYKNOT_CAPACITY);
    expect(normalized.wayknots).toEqual([
      fullKnot(1, "reed-mat", 1, { readyTick: 77 }),
      fullKnot(2, "reed-mat", null),
      fullKnot(3, "tide-anchor", null),
    ]);
    expect(normalized.wayknots).toHaveLength(3);
  });

  it("repairs terrain-invalid and colliding placements while preserving their aid records", () => {
    const normalized = normalizeWayknotState({
      capacity: 6,
      wayknots: [
        { id: 5, kind: "wind-knot", tileIndex: 14 },
        { id: 1, kind: "reed-mat", tileIndex: 11 },
        { id: 3, kind: "tide-anchor", tileIndex: 11 },
        { id: 4, kind: "tide-anchor", tileIndex: 22 },
      ],
    }, {
      tileCount: 100,
      loadTick: 55,
      contextAt: (index) => {
        if (index === 11) return tile(index, { terrain: "marsh" });
        if (index === 22) return tile(index, { terrain: "deep-water", waterDepth: 300_000 });
        if (index === 14) return tile(index);
        return undefined;
      },
    });

    expect(normalized.wayknots).toEqual([
      fullKnot(1, "reed-mat", 11, { readyTick: 55 }),
      fullKnot(3, "tide-anchor", null),
      fullKnot(4, "tide-anchor", 22, { readyTick: 55 }),
      fullKnot(5, "wind-knot", null),
    ]);
  });

  it("canonicalizes duplicate IDs and input order deterministically", () => {
    const records = [
      { id: 6, kind: "wind-knot", tileIndex: 18 },
      { id: 2, kind: "tide-anchor", tileIndex: 22 },
      { id: 6, kind: "reed-mat", tileIndex: 11 },
      {
        id: 6,
        kind: "wind-knot",
        tileIndex: 11,
        condition: 700_000,
        readyTick: 5,
        serviceWearRemainder: 123,
      },
      { id: 5, kind: "wind-knot", tileIndex: null },
    ];
    const forward = normalizeWayknotState({ capacity: 3, wayknots: records }, { tileCount: 100 });
    const reverse = normalizeWayknotState(
      { capacity: 3, wayknots: [...records].reverse() },
      { tileCount: 100 },
    );

    expect(forward).toEqual(reverse);
    expect(forward.wayknots).toEqual([
      fullKnot(2, "reed-mat", 22),
      fullKnot(5, "wind-knot", null),
      fullKnot(6, "wind-knot", 11, {
        condition: 700_000,
        readyTick: 5,
        serviceWearRemainder: 123,
      }),
    ]);
  });

  it("normalizes v2 durability fields to exact safe bounds without repairing hostile wear", () => {
    const normalized = normalizeWayknotState({
      version: 2,
      capacity: 6,
      wayknots: [
        {
          id: 1,
          kind: "reed-mat",
          tileIndex: 11,
          condition: -50,
          readyTick: Number.NaN,
          serviceWearRemainder: Number.MAX_SAFE_INTEGER,
        },
        {
          id: 3,
          kind: "tide-anchor",
          tileIndex: 14,
          condition: Number.POSITIVE_INFINITY,
          readyTick: 91,
          serviceWearRemainder: -2,
        },
        {
          id: 5,
          kind: "wind-knot",
          tileIndex: null,
          condition: WAYKNOT_CONDITION_MAX + 20,
          readyTick: 999,
          serviceWearRemainder: 42,
        },
      ],
    }, { tileCount: 100, loadTick: 88 });

    expect(normalized.wayknots).toEqual([
      fullKnot(1, "reed-mat", 11, {
        condition: 0,
        readyTick: 88,
        serviceWearRemainder: WAYKNOT_SERVICE_REMAINDER_SCALE - 1,
      }),
      fullKnot(3, "tide-anchor", 14, { condition: 0, readyTick: 91 }),
      fullKnot(5, "wind-knot", null, { serviceWearRemainder: 42 }),
    ]);
    expect(normalized.version).toBe(3);
  });

  it("charges every placement/reclaim cycle and keeps broken aids reclaimable", () => {
    const tooWorn = placedState([
      fullKnot(1, "reed-mat", null, { condition: 149_999 }),
    ]);
    const marsh = tile(11, { terrain: "marsh" });
    expect(validateWayknotPlacement(tooWorn, "reed-mat", marsh)).toBe("condition-too-low");
    expect(placeWayknot(tooWorn, "reed-mat", marsh, 10)).toMatchObject({
      ok: false,
      reason: "capacity-reached",
      placementReason: "condition-too-low",
    });

    const exactMinimum = placedState([
      fullKnot(1, "reed-mat", null, { condition: 150_000 }),
    ]);
    const placed = placeWayknot(exactMinimum, "reed-mat", marsh, 10);
    expect(placed.wayknot).toEqual(fullKnot(1, "reed-mat", 11, {
      condition: 70_000,
      readyTick: 13,
    }));

    const directlyMoved = redeployWayknot(
      placedState([fullKnot(1, "reed-mat", 11, { condition: 500_000 })]),
      1,
      tile(12, { terrain: "marsh" }),
      20,
    );
    expect(directlyMoved.wayknot).toEqual(fullKnot(1, "reed-mat", 12, {
      condition: 380_000,
      readyTick: 23,
    }));

    const broken = placedState([fullKnot(1, "reed-mat", 11, { condition: 0 })]);
    const reclaimed = reclaimWayknot(broken, 1);
    expect(reclaimed).toMatchObject({ ok: true, reason: "reclaimed" });
    expect(reclaimed.wayknot).toEqual(fullKnot(1, "reed-mat", null, { condition: 0 }));
  });
});

describe("region-addressed wayknot persistence", () => {
  it("migrates v2 deployments to region 0,0 without changing finite identity or wear", () => {
    const migrated = normalizeWayknotState({
      version: 2,
      capacity: 6,
      wayknots: [
        {
          id: 1,
          kind: "wind-knot",
          tileIndex: 11,
          condition: 713_245,
          readyTick: 87,
          serviceWearRemainder: 456_789,
        },
        {
          id: 3,
          kind: "reed-mat",
          tileIndex: null,
          condition: 654_321,
          readyTick: 999,
          serviceWearRemainder: 123,
        },
      ],
    }, { tileCount: 100 });

    expect(migrated.version).toBe(3);
    expect(migrated.wayknots).toEqual([
      fullKnot(1, "reed-mat", 11, {
        condition: 713_245,
        readyTick: 87,
        serviceWearRemainder: 456_789,
      }),
      fullKnot(3, "tide-anchor", null, {
        condition: 654_321,
        serviceWearRemainder: 123,
      }),
    ]);
  });

  it("keeps a distant signed deployment local to its region through query and exact reclaim", () => {
    const remote = { x: -1_000_000, y: REGION_COORD_LIMIT } as const;
    const context = tile(44, { terrain: "deep-water", waterDepth: 420_000 });
    const placed = placeWayknot(createWayknotState(), "tide-anchor", context, 20, remote);
    expect(placed.wayknot).toMatchObject({
      id: 3,
      region: remote,
      tileIndex: 44,
      readyTick: 23,
    });
    expect(wayknotAtTile(placed.state, 44)).toBeNull();
    expect(wayknotAtTile(placed.state, 44, remote)?.id).toBe(3);
    expect(queryWayknotEffects(placed.state, context, GRID, 23).influences).toEqual([]);
    expect(queryWayknotEffects(placed.state, context, GRID, 23, remote).influences)
      .toEqual([expect.objectContaining({ id: 3 })]);

    expect(reclaimWayknot(placed.state, 3)).toMatchObject({ ok: false, reason: "not-found" });
    expect(reclaimWayknotAtTile(placed.state, 45, remote)).toMatchObject({
      ok: false,
      reason: "not-found",
    });
    const reclaimed = reclaimWayknotAtTile(placed.state, 44, remote);
    expect(reclaimed).toMatchObject({
      ok: true,
      reason: "reclaimed",
      wayknot: { id: 3, region: null, tileIndex: null },
    });
    expect(reclaimed.state.wayknots).toHaveLength(6);
  });

  it("allows the same local tile in two regions while blocking one-region collisions and teleporting", () => {
    const west = { x: -8, y: 3 } as const;
    const east = { x: 8, y: -3 } as const;
    const marsh = tile(11, { terrain: "marsh" });
    const first = placeWayknot(createWayknotState(), "reed-mat", marsh, 0, west);
    const second = placeWayknot(first.state, "reed-mat", marsh, 0, east);
    expect(second.ok).toBe(true);
    expect(wayknotAtTile(second.state, 11, west)?.id).toBe(1);
    expect(wayknotAtTile(second.state, 11, east)?.id).toBe(2);
    expect(deployedWayknotCount(second.state)).toBe(2);

    const occupied = placeWayknot(
      second.state,
      "tide-anchor",
      tile(11, { terrain: "deep-water", waterDepth: 400_000 }),
      0,
      west,
    );
    expect(occupied).toMatchObject({ ok: false, reason: "occupied" });
    expect(redeployWayknot(second.state, 1, marsh, 0, east)).toMatchObject({
      ok: false,
      reason: "not-found",
      state: second.state,
    });
    expect(placeWayknot(second.state, "reed-mat", tile(12, { terrain: "marsh" })))
      .toMatchObject({ ok: false, reason: "capacity-reached" });
  });

  it("round-trips remote v3 placements without local terrain callbacks reclaiming them", () => {
    const remote = { x: -77, y: 91 } as const;
    const source = normalizeWayknotState({
      version: 3,
      capacity: 6,
      wayknots: [{
        id: 5,
        kind: "wind-knot",
        region: remote,
        tileIndex: 55,
        condition: 765_432,
        readyTick: 321,
        serviceWearRemainder: 98_765,
      }],
    }, {
      tileCount: 100,
      contextRegion: { x: 0, y: 0 },
      contextAt: () => undefined,
    });
    const restored = normalizeWayknotState(JSON.parse(JSON.stringify(source)), {
      tileCount: 100,
      contextRegion: { x: 0, y: 0 },
      contextAt: () => undefined,
    });
    expect(restored).toEqual(source);
    expect(restored.wayknots[0]).toEqual({
      id: 5,
      kind: "wind-knot",
      region: remote,
      tileIndex: 55,
      condition: 765_432,
      readyTick: 321,
      serviceWearRemainder: 98_765,
    });
  });

  it("preserves a strict deployment in the active storage region when its tile is off-frame", () => {
    const activeRegion = { x: -12, y: 8 } as const;
    const source = {
      version: 3,
      capacity: 6,
      wayknots: [{
        id: 3,
        kind: "tide-anchor",
        region: activeRegion,
        tileIndex: (WORLD_HEIGHT - 1) * WORLD_WIDTH + WORLD_WIDTH - 1,
        condition: 543_210,
        readyTick: 987,
        serviceWearRemainder: 12_345,
      }],
    };

    const restored = normalizeWayknotState(JSON.parse(JSON.stringify(source)), {
      tileCount: 96 * 72,
      contextRegion: activeRegion,
      // Undefined means the bounded sliding frame cannot currently inspect
      // the tile. It is not evidence that the physical deployment vanished.
      contextAt: () => undefined,
    });

    expect(restored.wayknots).toEqual([{
      id: 3,
      kind: "tide-anchor",
      region: activeRegion,
      tileIndex: 71 * 96 + 95,
      condition: 543_210,
      readyTick: 987,
      serviceWearRemainder: 12_345,
    }]);
  });

  it("drops malformed or colliding v3 evidence instead of minting carried gear", () => {
    const remote = { x: -4, y: 6 } as const;
    const normalized = normalizeWayknotState({
      version: 3,
      capacity: 6,
      wayknots: [
        { id: 1, kind: "reed-mat", region: remote, tileIndex: null },
        { id: 2, kind: "reed-mat", region: null, tileIndex: 12 },
        { id: 3, kind: "tide-anchor", region: { ...remote, alias: true }, tileIndex: 13 },
        { id: 4, kind: "tide-anchor", region: remote, tileIndex: 14 },
        { id: 5, kind: "wind-knot", region: remote, tileIndex: 14 },
        { id: 6, kind: "wind-knot", region: null, tileIndex: null },
      ],
    }, { tileCount: 100 });

    expect(normalized.wayknots).toEqual([
      fullKnot(4, "tide-anchor", 14),
      fullKnot(6, "wind-knot", null),
    ].map((wayknot) => wayknot.id === 4 ? { ...wayknot, region: remote } : wayknot));
    expect(normalized.wayknots.some((wayknot) => [1, 2, 3, 5].includes(wayknot.id)))
      .toBe(false);
    expect(normalizeWayknotState({
      version: 3,
      capacity: 6,
      wayknots: [{ id: 2, kind: "reed-mat", tileIndex: null }],
    }).wayknots).toEqual([]);
  });

  it("prefers deployed evidence over a duplicate carried ID and rejects noncanonical regions", () => {
    const remote = { x: 9, y: -12 } as const;
    const normalized = normalizeWayknotState({
      version: 3,
      capacity: 6,
      wayknots: [
        { id: 1, kind: "reed-mat", region: null, tileIndex: null, condition: 900_000 },
        { id: 1, kind: "reed-mat", region: remote, tileIndex: 11, condition: 700_000 },
      ],
    }, { tileCount: 100 });
    expect(normalized.wayknots).toEqual([
      { ...fullKnot(1, "reed-mat", 11, { condition: 700_000 }), region: remote },
    ]);

    const malformedRegions = [
      { x: -0, y: 0 },
      { x: 0, y: 0, alias: true },
      { x: Number.MAX_SAFE_INTEGER, y: 0 },
    ];
    for (const region of malformedRegions) {
      expect(placeWayknot(
        createWayknotState(),
        "reed-mat",
        tile(11, { terrain: "marsh" }),
        0,
        region,
      )).toMatchObject({ ok: false, reason: "invalid-context" });
    }
  });
});

describe("wayknot traversal effects", () => {
  it("supplies exact half strength for three setting ticks, then the original full benefit", () => {
    const state = placedState([
      fullKnot(1, "reed-mat", 11, { condition: 920_000, readyTick: 103 }),
    ]);
    const context = tile(11, { terrain: "marsh" });
    const setting = queryWayknotEffects(state, context, GRID, 100);
    const lastSettingTick = queryWayknotEffects(state, context, GRID, 102);
    const ready = queryWayknotEffects(state, context, GRID, 103);

    expect(setting).toMatchObject({
      movementCostPermille: 780,
      staminaCostPermille: 880,
      pathCostPermille: 780,
      influences: [{ effectStrength: WAYKNOT_SETTING_STRENGTH }],
    });
    expect(lastSettingTick).toEqual(setting);
    expect(ready).toMatchObject({
      movementCostPermille: 560,
      staminaCostPermille: 760,
      pathCostPermille: 560,
      influences: [{ effectStrength: WAYKNOT_FULL_STRENGTH }],
    });
    expect(wayknotEffectStrength(state.wayknots[0]!, 102)).toBe(WAYKNOT_SETTING_STRENGTH);
    expect(wayknotEffectStrength(state.wayknots[0]!, 103)).toBe(WAYKNOT_FULL_STRENGTH);
    // Legacy callers that have not integrated a world tick retain full-strength behavior.
    expect(queryWayknotEffects(state, context, GRID)).toEqual(ready);
  });

  it("keeps a broken placement visible and reclaimable while making its influence inert", () => {
    const state = placedState([
      fullKnot(3, "tide-anchor", 44, { condition: 0, readyTick: 900 }),
    ]);
    const effects = queryWayknotEffects(
      state,
      tile(44, { terrain: "deep-water", waterDepth: 300_000 }),
      GRID,
      100,
    );

    expect(wayknotAtTile(state, 44)).toEqual(fullKnot(3, "tide-anchor", 44, {
      condition: 0,
      readyTick: 900,
    }));
    expect(deployedWayknotCount(state)).toBe(1);
    expect(effects.influences).toEqual([]);
    expect(effects).toMatchObject({
      staminaCostPermille: WAYKNOT_PERMILLE,
      sweepRiskPermille: WAYKNOT_PERMILLE,
      pathCostPermille: WAYKNOT_PERMILLE,
    });
  });

  it("gives a reed mat an exact local-only drag and path benefit", () => {
    const state = placedState([{ id: 1, kind: "reed-mat", tileIndex: 11 }]);
    const local = queryWayknotEffects(state, tile(11, { terrain: "marsh" }), GRID);
    const neighbor = queryWayknotEffects(state, tile(12, { terrain: "marsh" }), GRID);
    const wrongSurface = queryWayknotEffects(state, tile(11), GRID);

    expect(local).toMatchObject({
      movementCostPermille: 560,
      staminaCostPermille: 760,
      stabilityLossPermille: WAYKNOT_PERMILLE,
      sweepRiskPermille: WAYKNOT_PERMILLE,
      pathCostPermille: 560,
    });
    expect(local.influences).toEqual([expect.objectContaining({
      id: 1,
      kind: "reed-mat",
      distance: 0,
      radius: 0,
    })]);
    expect(neighbor.influences).toEqual([]);
    expect(wrongSurface.influences).toEqual([]);
  });

  it("uses exact Manhattan falloff for tide-anchor stamina, current, and path risk", () => {
    const state = placedState([{ id: 3, kind: "tide-anchor", tileIndex: 44 }]);
    const query = (index: number) => queryWayknotEffects(
      state,
      tile(index, { terrain: "deep-water", waterDepth: 320_000 }),
      GRID,
    );

    expect(query(44)).toMatchObject({ staminaCostPermille: 600, sweepRiskPermille: 400, pathCostPermille: 720 });
    expect(query(45)).toMatchObject({ staminaCostPermille: 750, sweepRiskPermille: 650, pathCostPermille: 850 });
    expect(query(46)).toMatchObject({ staminaCostPermille: 900, sweepRiskPermille: 850, pathCostPermille: 950 });
    expect(query(47).influences).toEqual([]);
    expect(queryWayknotEffects(state, tile(45), GRID).influences).toEqual([]);
  });

  it("does not mistake adjacent array indices for adjacent tiles across a row edge", () => {
    const state = placedState([{ id: 3, kind: "tide-anchor", tileIndex: 9 }]);
    expect(manhattanTileDistance(9, 10, GRID)).toBe(10);
    const effects = queryWayknotEffects(
      state,
      tile(10, { terrain: "deep-water", waterDepth: 400_000 }),
      GRID,
    );
    expect(effects.influences).toEqual([]);
  });

  it("protects only exposed scrub/ridge within a wind knot's exact radius", () => {
    const state = placedState([{ id: 5, kind: "wind-knot", tileIndex: 55 }]);
    const exposed = (index: number) => queryWayknotEffects(
      state,
      tile(index, { terrain: "ridge", windExposed: true }),
      GRID,
    );

    expect(exposed(55)).toMatchObject({ stabilityLossPermille: 500, pathCostPermille: 800 });
    expect(exposed(56)).toMatchObject({ stabilityLossPermille: 650, pathCostPermille: 875 });
    expect(exposed(57)).toMatchObject({ stabilityLossPermille: 800, pathCostPermille: 940 });
    expect(exposed(58)).toMatchObject({ stabilityLossPermille: 900, pathCostPermille: 980 });
    expect(exposed(59).influences).toEqual([]);
    expect(queryWayknotEffects(state, tile(56, { terrain: "ridge", windExposed: false }), GRID).influences).toEqual([]);
  });

  it("uses the strongest overlapping aid per channel and reports sources in stable distance/ID order", () => {
    const state = placedState([
      { id: 3, kind: "tide-anchor", tileIndex: 44 },
      { id: 4, kind: "tide-anchor", tileIndex: 45 },
    ]);
    const effects = queryWayknotEffects(
      state,
      tile(44, { terrain: "deep-water", waterDepth: 360_000 }),
      GRID,
    );

    expect(effects.staminaCostPermille).toBe(600);
    expect(effects.sweepRiskPermille).toBe(400);
    expect(effects.influences.map(({ id, distance }) => [id, distance])).toEqual([
      [3, 0],
      [4, 1],
    ]);
  });

  it("applies integer modifiers suitable for movement, stamina, stability, sweep, and A* costs", () => {
    const effects = queryWayknotEffects(
      placedState([{ id: 3, kind: "tide-anchor", tileIndex: 44 }]),
      tile(44, { terrain: "deep-water", waterDepth: 300_000 }),
      GRID,
    );

    expect(applyWayknotPermille(101, 750)).toBe(75);
    expect(modifyMovementCost(1_000, effects)).toBe(1_000);
    expect(modifyStaminaCost(1_000, effects)).toBe(600);
    expect(modifyStabilityLoss(1_000, effects)).toBe(1_000);
    expect(modifySweepRisk(1_000, effects)).toBe(400);
    expect(modifyPathCost(1_000, effects)).toBe(720);
    expect(applyWayknotPermille(Number.NaN, 500)).toBe(0);
  });

  it("accumulates deterministic fractional wear only when an active knot supplies benefit", () => {
    const setting = placedState([
      fullKnot(3, "tide-anchor", 44, { condition: 500_000, readyTick: 100 }),
    ]);
    const half = applyWayknotServiceWear(setting, 3, 99);
    expect(half).toMatchObject({
      ok: true,
      reason: "serviced",
      appliedBenefit: 500_000,
      conditionSpent: 8_000,
      wayknot: {
        condition: 492_000,
        serviceWearRemainder: 0,
      },
    });

    const first = applyWayknotServiceWear(setting, 3, 100, 333_333);
    expect(first).toMatchObject({
      appliedBenefit: 333_333,
      conditionSpent: 5_333,
      wayknot: {
        condition: 494_667,
        serviceWearRemainder: 328_000,
      },
    });
    const second = applyWayknotServiceWear(first.state, 3, 100, 333_333);
    expect(second).toMatchObject({
      conditionSpent: 5_333,
      wayknot: {
        condition: 489_334,
        serviceWearRemainder: 656_000,
      },
    });
    expect(applyWayknotServiceWear(setting, 3, 100, 0)).toMatchObject({
      ok: false,
      reason: "no-benefit",
      state: setting,
      conditionSpent: 0,
    });

    const broken = placedState([fullKnot(3, "tide-anchor", 44, { condition: 0 })]);
    expect(applyWayknotServiceWear(broken, 3, 100)).toMatchObject({
      ok: false,
      reason: "inactive",
      state: broken,
      conditionSpent: 0,
    });
  });

  it("keeps Tide Harp geometry while weakest-member strength gates its effectiveness", () => {
    const setting = placedState([
      fullKnot(1, "reed-mat", 11, { condition: 500_000, readyTick: 103 }),
      fullKnot(3, "tide-anchor", 14, { condition: 500_000, readyTick: 103 }),
      fullKnot(5, "wind-knot", 41, { condition: 500_000, readyTick: 103 }),
    ]);
    const settingHarps = deriveTideHarps(setting, GRID);
    expect(settingHarps).toHaveLength(1);
    expect(tideHarpEffectStrength(setting, settingHarps[0]?.knots ?? [], 100))
      .toBe(WAYKNOT_SETTING_STRENGTH);
    expect(tideHarpEffectStrength(setting, settingHarps[0]?.knots ?? [], 103))
      .toBe(WAYKNOT_FULL_STRENGTH);

    const broken = normalizeWayknotState({
      ...setting,
      wayknots: setting.wayknots.map((wayknot) => wayknot.id === 3
        ? { ...wayknot, condition: 0 }
        : wayknot),
    }, { tileCount: 100 });
    const brokenHarps = deriveTideHarps(broken, GRID);
    expect(brokenHarps).toHaveLength(1);
    expect(brokenHarps[0]?.id).toBe(settingHarps[0]?.id);
    expect(tideHarpEffectStrength(broken, brokenHarps[0]?.knots ?? [], 103)).toBe(0);
  });

  it("uses only the explicit tick: identical state, tile, and tick always give identical output", () => {
    const roundTripped = normalizeWayknotState(JSON.parse(JSON.stringify(placedState([
      { id: 5, kind: "wind-knot", tileIndex: 55 },
    ]))), { tileCount: 100 });
    const context = tile(56, { terrain: "meadow", windExposed: true });

    expect(queryWayknotEffects(roundTripped, context, GRID, 400)).toEqual(
      queryWayknotEffects(roundTripped, context, GRID, 400),
    );
  });
});
