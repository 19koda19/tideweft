import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { TILE_UNITS, createPlayer } from "./player";
import { projectGameView } from "./projection";
import { normalizeWayknotState } from "./wayknots";

const SEED = "projected tide harp";

function tileIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

function placePlayerAt(
  player: ReturnType<typeof createPlayer>,
  x: number,
  y: number,
): void {
  player.x = x * TILE_UNITS + TILE_UNITS / 2;
  player.y = y * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
}

describe("Tide Harp projection", () => {
  it("projects selected topology in world units and activates inclusive player geometry", () => {
    const world = createWorldView(createWorld(SEED, "standard"));
    const player = createPlayer(world);
    const reedIndex = tileIndex(10, 10, world.terrain.width);
    const anchorIndex = tileIndex(11, 10, world.terrain.width);
    const windIndex = tileIndex(10, 11, world.terrain.width);
    player.wayknots = normalizeWayknotState({
      capacity: 6,
      wayknots: [
        { id: 1, kind: "reed-mat", tileIndex: reedIndex },
        { id: 2, kind: "reed-mat", tileIndex: null },
        { id: 3, kind: "tide-anchor", tileIndex: anchorIndex },
        { id: 4, kind: "tide-anchor", tileIndex: null },
        { id: 5, kind: "wind-knot", tileIndex: windIndex },
        { id: 6, kind: "wind-knot", tileIndex: null },
      ],
    }, { tileCount: world.terrain.tiles.length });
    placePlayerAt(player, 10, 10);

    const view = projectGameView(world, player);
    expect(view.tideHarps).toHaveLength(1);
    const projected = view.tideHarps[0];
    expect(projected).toMatchObject({
      id: "tide-harp:r1-a3-w5",
      label: "Glass-Ebb Tide Harp · R1 · A3 · W5",
      active: true,
      center: { x: 260, y: 260 },
      knots: [
        { id: "1", kind: "reed-mat", point: { x: 252, y: 252 } },
        { id: "3", kind: "tide-anchor", point: { x: 276, y: 252 } },
        { id: "5", kind: "wind-knot", point: { x: 252, y: 276 } },
      ],
    });
    expect(projected?.edges).toEqual([
      {
        id: "tide-harp-edge:1-3",
        fromId: "1",
        toId: "3",
        from: { x: 252, y: 252 },
        to: { x: 276, y: 252 },
      },
      {
        id: "tide-harp-edge:1-5",
        fromId: "1",
        toId: "5",
        from: { x: 252, y: 252 },
        to: { x: 252, y: 276 },
      },
      {
        id: "tide-harp-edge:3-5",
        fromId: "3",
        toId: "5",
        from: { x: 276, y: 252 },
        to: { x: 252, y: 276 },
      },
    ]);

    placePlayerAt(player, 14, 14);
    const outside = projectGameView(world, player).tideHarps;
    expect(outside).toHaveLength(1);
    expect(outside[0]).toMatchObject({
      id: "tide-harp:r1-a3-w5",
      active: false,
    });
  });

  it("marks only the same canonical Harp that supplies gameplay inside overlapping triangles", () => {
    const world = createWorldView(createWorld(`${SEED} overlap`, "standard"));
    const player = createPlayer(world);
    const placements = [
      { id: 1, kind: "reed-mat", x: 7, y: 5 },
      { id: 2, kind: "reed-mat", x: 4, y: 6 },
      { id: 3, kind: "tide-anchor", x: 3, y: 5 },
      { id: 4, kind: "tide-anchor", x: 4, y: 5 },
      { id: 5, kind: "wind-knot", x: 5, y: 3 },
      { id: 6, kind: "wind-knot", x: 4, y: 2 },
    ] as const;
    player.wayknots = normalizeWayknotState({
      capacity: 6,
      wayknots: placements.map(({ id, kind, x, y }) => ({
        id,
        kind,
        tileIndex: tileIndex(x, y, world.terrain.width),
      })),
    }, { tileCount: world.terrain.tiles.length });
    placePlayerAt(player, 4, 5);

    const projected = projectGameView(world, player).tideHarps;
    expect(projected.map((harp) => harp.id)).toEqual([
      "tide-harp:r1-a4-w5",
      "tide-harp:r2-a3-w6",
    ]);
    expect(projected.filter((harp) => harp.active).map((harp) => harp.id)).toEqual([
      "tide-harp:r1-a4-w5",
    ]);
  });
});
