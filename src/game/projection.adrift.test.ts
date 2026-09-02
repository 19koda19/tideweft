import { describe, expect, it } from "vitest";

import { createWorld, createWorldView, FIXED_POINT } from "../sim/public";
import { ADRIFT_MIN_STROKE_STAMINA, ADRIFT_STAND_DEPTH } from "./adrift";
import { surfaceCurrentDirection } from "./currentDirection";
import { TILE_UNITS, createPlayer, type PlayerState } from "./player";
import { projectAdriftView, projectGameView } from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";

function fixture() {
  const world = createWorldView(createWorld("adrift projection sees physical water", "standard"));
  const player = createPlayer(world);
  const session = createSessionState(world.seedText);
  session.titleVisible = false;
  session.paused = false;
  return { world, player, session };
}

function placeOnTile(
  player: PlayerState,
  tile: { readonly x: number; readonly y: number },
): void {
  player.x = tile.x * TILE_UNITS + TILE_UNITS / 2;
  player.y = tile.y * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
}

describe("ADRIFT render and UI projections", () => {
  it("keeps the optional view absent outside swept mode", () => {
    const { world, player, session } = fixture();
    expect(projectAdriftView(world, player)).toBeUndefined();
    expect(projectGameView(world, player).player.adrift).toBeUndefined();
    expect(projectUIView(world, player, session).field.adrift).toBeUndefined();
  });

  it("projects physical flow, depth, and breath-catching without inventing shore distance", () => {
    const { world, player, session } = fixture();
    const deep = world.terrain.tiles.find((tile) => tile.waterDepth > ADRIFT_STAND_DEPTH);
    if (!deep) throw new Error("fixture needs current water");
    placeOnTile(player, deep);
    player.mode = "swept";
    player.pace = "rest";
    player.stamina = 420_000;
    player.velocityX = 38;
    player.velocityY = 0;

    const render = projectGameView(world, player).player;
    const ui = projectUIView(world, player, session).field;
    expect(render.adrift).toMatchObject({
      paddling: false,
      catchingBreath: true,
      canStand: false,
      currentDirection: surfaceCurrentDirection(world.tide.direction, world.weather.windY),
    });
    expect(render.adrift?.waterDepth).toBeCloseTo(deep.waterDepth / FIXED_POINT);
    expect(Object.hasOwn(render.adrift ?? {}, "shoreDistance")).toBe(false);
    expect(ui.adrift).toMatchObject({
      label: "CATCHING BREATH",
      instruction: "FLOAT · LET STAMINA RETURN",
    });
    expect(ui.hint).not.toMatch(/%|ashore|ETA/iu);
  });

  it("uses optional live movement intent to distinguish a stroke on desktop or touch", () => {
    const { world, player, session } = fixture();
    const deep = world.terrain.tiles.find((tile) => tile.waterDepth > ADRIFT_STAND_DEPTH);
    if (!deep) throw new Error("fixture needs current water");
    placeOnTile(player, deep);
    player.mode = "swept";
    player.pace = "rest";
    player.stamina = 600_000;

    const adriftControl = { moveX: 1, moveY: -1 } as const;
    expect(projectGameView(world, player, { adriftControl }).player.adrift)
      .toMatchObject({ paddling: true, catchingBreath: false });
    const ui = projectUIView(world, player, session, { adriftControl });
    expect(ui.field.adrift).toMatchObject({
      paddling: true,
      label: "PADDLING",
      instruction: "PADDLE TOWARD SHALLOW WATER",
    });
    expect(ui.controls?.interactLabel).toBe("ADRIFT · paddle / float");
    expect(ui.controls?.interactHint).toContain("MOVE / TAP");
  });

  it("fails an exhausted or malformed requested stroke into a truthful float", () => {
    const { world, player } = fixture();
    const deep = world.terrain.tiles.find((tile) => tile.waterDepth > ADRIFT_STAND_DEPTH);
    if (!deep) throw new Error("fixture needs current water");
    placeOnTile(player, deep);
    player.mode = "swept";
    player.stamina = ADRIFT_MIN_STROKE_STAMINA - 1;

    expect(projectAdriftView(world, player, { moveX: 1, moveY: 0 }))
      .toMatchObject({ paddling: false, catchingBreath: true });
    expect(projectAdriftView(world, player, {
      moveX: Number.NaN,
      moveY: Number.POSITIVE_INFINITY,
    })).toMatchObject({ paddling: false, catchingBreath: true });
  });

  it("announces shallow standing readiness without ending ADRIFT in projection", () => {
    const { world, player, session } = fixture();
    const shallow = world.terrain.tiles.find((tile) => tile.waterDepth <= ADRIFT_STAND_DEPTH);
    if (!shallow) throw new Error("fixture needs shallow water");
    placeOnTile(player, shallow);
    player.mode = "swept";
    player.stamina = 240_000;
    player.sweepTicksRemaining = 0;
    player.sweepTotalTicks = 1;

    const render = projectGameView(world, player).player;
    const ui = projectUIView(world, player, session).field;
    expect(render.mode).toBe("swept");
    expect(render.adrift?.canStand).toBe(true);
    expect(render.sweptProgress).toBeLessThan(1);
    expect(ui.adrift).toMatchObject({
      canStand: true,
      label: "SHALLOW · READY TO RISE",
    });
    expect(`${ui.adrift?.label} ${ui.adrift?.instruction} ${ui.hint}`)
      .not.toMatch(/ashore|arrived|100%/iu);
  });
});
