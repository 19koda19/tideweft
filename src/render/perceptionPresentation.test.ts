import { describe, expect, it } from "vitest";

import type { TerrainGridView, TerrainTileView, TideweftView } from "./types";
import {
  currentSettlementVisibility,
  currentTerrainDetailVisibility,
  currentTerrainVisibility,
  detailPerceptionVisibilityAt,
  isDirectlyDetailPerceived,
  isDirectlyPerceived,
  isCurrentlyPerceived,
  isWithinPlayerPickupRange,
  isWithinPlayerPresentationRange,
  isWithinPlayerRecognitionRange,
  PLAYER_PICKUP_PRESENTATION_RANGE,
  PLAYER_RECOGNITION_PRESENTATION_RANGE,
  perceptionVisibilityAt,
} from "./perceptionPresentation";

const tile = (
  currentVisibility?: 0 | 0.5 | 1,
  currentDetailVisibility?: 0 | 0.5 | 1,
): TerrainTileView => ({
  kind: "meadow",
  elevation: 0.2,
  ...(currentVisibility === undefined ? {} : { currentVisibility }),
  ...(currentDetailVisibility === undefined ? {} : { currentDetailVisibility }),
});

const grid = (tiles: readonly TerrainTileView[]): TerrainGridView => ({
  columns: 2,
  rows: 2,
  tileSize: 10,
  origin: { x: -10, y: 20 },
  tiles,
  revision: 1,
});

const playerView = (detail: 0 | 0.5 | 1 | null = 1): Pick<
  TideweftView, "terrain" | "player" | "perception"
> => ({
  terrain: {
    columns: 80,
    rows: 80,
    tileSize: 10,
    origin: { x: -400, y: -400 },
    revision: 1,
    tiles: Array.from({ length: 6_400 }, () => tile(1, detail ?? undefined)),
  },
  player: {
    position: { x: 0, y: 0 },
    facing: 0,
    velocity: { x: 0, y: 0 },
    stamina: 1,
    stability: 1,
    scanCharge: 0,
    cargoLoad: 0,
    cargoCapacity: 1,
    cargo: [],
    pace: "steady",
    mode: "foot",
  },
  perception: {
    version: 1,
    signature: "presentation-range-fixture",
    valid: true,
    visibleTileCount: 6_400,
    directTileCount: 6_400,
    peripheralTileCount: 0,
  },
});

describe("perception presentation boundary", () => {
  it("keeps legacy fixtures visible and honors exact hidden/peripheral/direct grades", () => {
    expect(currentTerrainVisibility(tile())).toBe(1);
    expect(currentTerrainVisibility(tile(), true)).toBe(0);
    expect(currentTerrainVisibility(tile(0))).toBe(0);
    expect(currentTerrainVisibility(tile(0.5))).toBe(0.5);
    expect(currentTerrainVisibility(tile(1))).toBe(1);
    expect(currentTerrainVisibility(undefined)).toBe(0);
    expect(currentSettlementVisibility({
      id: "known",
      name: "Known",
      position: { x: 0, y: 0 },
      population: 1,
      status: "steady",
      connection: 0,
      stress: 0,
      currentVisibility: 0,
    })).toBe(0);
  });

  it("keeps broad terrain form independent from the shorter exact-detail field", () => {
    const view = grid([
      tile(1, 0),
      tile(1, 0.5),
      tile(1, 1),
      tile(0.5, 0),
    ]);
    const terrainOnly = { x: -5, y: 25 };
    const directDetail = { x: -5, y: 35 };

    expect(perceptionVisibilityAt(view, terrainOnly, true)).toBe(1);
    expect(detailPerceptionVisibilityAt(view, terrainOnly, true)).toBe(0);
    expect(isDirectlyPerceived(view, terrainOnly, true)).toBe(true);
    expect(isDirectlyDetailPerceived(view, terrainOnly, true)).toBe(false);
    expect(isDirectlyDetailPerceived(view, directDetail, true)).toBe(true);

    expect(currentTerrainDetailVisibility(tile(1), true)).toBe(0);
    expect(detailPerceptionVisibilityAt(view, { x: Number.NaN, y: 25 }, true)).toBe(0);
  });

  it("samples signed-origin tiles and fails out-of-grid or malformed points closed", () => {
    const view = grid([tile(0), tile(0.5), tile(1), tile(0)]);
    expect(perceptionVisibilityAt(view, { x: -5, y: 25 })).toBe(0);
    expect(perceptionVisibilityAt(view, { x: 5, y: 25 })).toBe(0.5);
    expect(perceptionVisibilityAt(view, { x: -5, y: 35 })).toBe(1);
    expect(isCurrentlyPerceived(view, { x: -5, y: 35 })).toBe(true);
    expect(isDirectlyPerceived(view, { x: 5, y: 25 })).toBe(false);
    expect(isDirectlyPerceived(view, { x: -5, y: 35 })).toBe(true);
    expect(isCurrentlyPerceived(view, { x: 10, y: 40 })).toBe(false);
    expect(perceptionVisibilityAt(view, { x: Number.NaN, y: 25 })).toBe(0);
  });

  it("keeps rear-circle visibility but clips recognition and pickup at distinct forward distances", () => {
    const view = playerView();
    expect(isWithinPlayerRecognitionRange(view, { x: -80, y: 0 })).toBe(true);
    expect(isWithinPlayerPickupRange(view, { x: -80, y: 0 })).toBe(true);
    expect(isWithinPlayerRecognitionRange(view, { x: -80.01, y: 0 })).toBe(false);
    expect(isWithinPlayerPickupRange(view, { x: -80.01, y: 0 })).toBe(false);
    expect(isWithinPlayerRecognitionRange(view, { x: 260, y: 0 })).toBe(true);
    expect(isWithinPlayerRecognitionRange(view, { x: 260.01, y: 0 })).toBe(false);
    expect(isWithinPlayerPickupRange(view, { x: 100, y: 0 })).toBe(true);
    expect(isWithinPlayerPickupRange(view, { x: 100.01, y: 0 })).toBe(false);
    // These narrower clips do not remove the existing lawful full body field.
    expect(isDirectlyDetailPerceived(view.terrain, { x: 300, y: 0 }, true)).toBe(true);
    expect(isWithinPlayerRecognitionRange(view, { x: 300, y: 0 })).toBe(false);
  });

  it("uses the facing-centered 130-degree recognition and 100-degree pickup cones", () => {
    const view = playerView();
    const atAngle = (degrees: number, radius: number) => ({
      x: Math.cos(degrees * Math.PI / 180) * radius,
      y: Math.sin(degrees * Math.PI / 180) * radius,
    });
    expect(isWithinPlayerRecognitionRange(view, atAngle(65, 200))).toBe(true);
    expect(isWithinPlayerRecognitionRange(view, atAngle(-65, 200))).toBe(true);
    expect(isWithinPlayerRecognitionRange(view, atAngle(65.01, 200))).toBe(false);
    expect(isWithinPlayerPickupRange(view, atAngle(50, 90))).toBe(true);
    expect(isWithinPlayerPickupRange(view, atAngle(-50, 90))).toBe(true);
    expect(isWithinPlayerPickupRange(view, atAngle(50.01, 90))).toBe(false);

    const reversed = { ...view, player: { ...view.player, facing: Math.PI } };
    expect(isWithinPlayerRecognitionRange(reversed, { x: -250, y: 0 })).toBe(true);
    expect(isWithinPlayerPickupRange(reversed, { x: -90, y: 0 })).toBe(true);
    expect(isWithinPlayerRecognitionRange(reversed, { x: 250, y: 0 })).toBe(false);
  });

  it("never promotes missing, partial or occluded full detail into a presentation target", () => {
    for (const detail of [0, 0.5, null] as const) {
      const view = playerView(detail);
      // A ridge, opaque cover, low light or sleep can withhold the full receipt;
      // this presentation owner consumes that decision instead of casting rays.
      expect(isWithinPlayerRecognitionRange(view, { x: 10, y: 0 })).toBe(false);
      expect(isWithinPlayerPickupRange(view, { x: 10, y: 0 })).toBe(false);
    }
    const view = playerView();
    const invalid = { ...view, perception: { ...view.perception!, valid: false } };
    expect(isWithinPlayerRecognitionRange(invalid, { x: 10, y: 0 })).toBe(false);
    expect(isWithinPlayerPickupRange(invalid, { x: 10, y: 0 })).toBe(false);
  });

  it("retains legacy disclosure fallback only with finite current geometry", () => {
    const { perception: omitted, ...legacy } = playerView(null);
    void omitted;
    expect(isWithinPlayerRecognitionRange(legacy, { x: 200, y: 0 })).toBe(true);
    expect(isWithinPlayerPickupRange(legacy, { x: 90, y: 0 })).toBe(true);
    expect(isWithinPlayerPickupRange(legacy, { x: 200, y: 0 })).toBe(false);
    const missingPlayer = { ...legacy, player: undefined } as unknown as typeof legacy;
    expect(isWithinPlayerPickupRange(missingPlayer, { x: 10, y: 0 })).toBe(false);
    expect(isWithinPlayerRecognitionRange({
      ...legacy,
      player: { ...legacy.player, facing: Number.NaN },
    }, { x: 10, y: 0 })).toBe(false);
    expect(isWithinPlayerPickupRange(legacy, { x: Number.NaN, y: 0 })).toBe(false);
    expect(isWithinPlayerPickupRange(legacy, { x: 900, y: 0 })).toBe(false);
  });

  it("keeps the pure clip invariant under signed-origin rebase and tile scale", () => {
    const original = { position: { x: -173, y: 92 }, facing: 2 * Math.PI };
    const point = { x: 77, y: 92 };
    expect(isWithinPlayerPresentationRange(original, point, 10, PLAYER_RECOGNITION_PRESENTATION_RANGE)).toBe(true);
    expect(isWithinPlayerPresentationRange(original, point, 10, PLAYER_PICKUP_PRESENTATION_RANGE)).toBe(false);
    const rebased = { position: { x: original.position.x + 2_400, y: original.position.y - 1_600 }, facing: original.facing };
    const rebasedPoint = { x: point.x + 2_400, y: point.y - 1_600 };
    expect(isWithinPlayerPresentationRange(rebased, rebasedPoint, 10, PLAYER_RECOGNITION_PRESENTATION_RANGE)).toBe(true);
    expect(isWithinPlayerPresentationRange(original, point, 0, PLAYER_RECOGNITION_PRESENTATION_RANGE)).toBe(false);
    expect(isWithinPlayerPresentationRange(original, point, Number.NaN, PLAYER_RECOGNITION_PRESENTATION_RANGE)).toBe(false);
    expect(isWithinPlayerPresentationRange({ position: { x: 0, y: 0 }, facing: 0 },
      { x: 26_000, y: 0 }, 1_000, PLAYER_RECOGNITION_PRESENTATION_RANGE)).toBe(true);
  });
});
