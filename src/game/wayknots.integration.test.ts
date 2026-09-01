import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  type TerrainTileView,
  type WorldView,
} from "../sim/public";
import {
  TILE_UNITS,
  createPlayer,
  playerTileIndex,
  stepPlayer,
  waterEffortPerStep,
  wayknotContextAt,
  wayknotEffectsAt,
  type PlayerState,
} from "./player";
import { projectGameView } from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import {
  contextualWayknotKind,
  manhattanTileDistance,
  placeContextualWayknot,
  toggleContextualWayknot,
  type WayknotKind,
  type WayknotTileContext,
} from "./wayknots";

const FIXTURE_SEED = "phase nine wayknots integration";
const MOVE_RIGHT = { moveX: 1, moveY: 0, brace: false } as const;
const NO_INPUT = { moveX: 0, moveY: 0, brace: false } as const;

function generatedWorld(): WorldView {
  return createWorldView(createWorld(FIXTURE_SEED, "wild"));
}

function eligibleContext(
  world: WorldView,
  kind: WayknotKind,
  tilePredicate: (tile: TerrainTileView) => boolean = () => true,
): WayknotTileContext {
  for (const tile of world.terrain.tiles) {
    if (tile.x <= 0 || tile.x + 1 >= world.terrain.width || !tilePredicate(tile)) continue;
    const context = wayknotContextAt(world, tile.index);
    if (context && !context.occupied && contextualWayknotKind(context) === kind) return context;
  }
  throw new Error(`Generated fixture has no eligible ${kind} tile`);
}

function longSweepAnchorContext(world: WorldView): WayknotTileContext {
  for (const tile of world.terrain.tiles) {
    if (tile.terrain !== "deep-water" || tile.waterDepth < 120_000) continue;
    const context = wayknotContextAt(world, tile.index);
    if (!context || context.occupied) continue;
    const probe = createPlayer(world);
    placePlayerAt(probe, world, tile.index);
    probe.pace = "swift";
    probe.stamina = 13_000;
    const started = stepPlayer(probe, world, MOVE_RIGHT);
    if (!started.becameSwept) continue;
    if (probe.sweepPath.some((index) =>
      manhattanTileDistance(tile.index, index, world.terrain) > 2
    )) {
      return context;
    }
  }
  throw new Error("Generated fixture has no Tide-anchor crossing with a changing sweep field");
}

function placePlayerAt(player: PlayerState, world: WorldView, tileIndex: number): void {
  const tile = world.terrain.tiles[tileIndex];
  if (!tile) throw new Error(`Generated fixture is missing tile ${tileIndex}`);
  player.x = tile.x * TILE_UNITS + TILE_UNITS / 2;
  player.y = tile.y * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.currentTrace = [tileIndex];
  player.surveyTrace = [tileIndex];
}

function bindContextually(player: PlayerState, context: WayknotTileContext): void {
  const result = placeContextualWayknot(player.wayknots, context);
  if (!result.ok) throw new Error(`Could not bind fixture Wayknot: ${result.reason}`);
  player.wayknots = result.state;
}

function ticksUntilAshore(player: PlayerState, world: WorldView): number {
  let ticks = 0;
  while (player.mode === "swept") {
    stepPlayer(player, world, NO_INPUT);
    ticks += 1;
    if (ticks > world.terrain.tiles.length * 8) {
      throw new Error("Sweep fixture did not reach a safe bank");
    }
  }
  return ticks;
}

function activeSession() {
  const session = createSessionState(FIXTURE_SEED);
  session.paused = false;
  session.titleVisible = false;
  return session;
}

function wetSoftWaychordContexts(world: WorldView): {
  reed: WayknotTileContext;
  anchor: WayknotTileContext;
} {
  const contexts = world.terrain.tiles.flatMap((tile) => {
    const context = wayknotContextAt(world, tile.index);
    return context && !context.occupied ? [context] : [];
  });
  const anchors = contexts.filter((context) => contextualWayknotKind(context) === "tide-anchor");
  for (const reed of contexts) {
    if (contextualWayknotKind(reed) !== "reed-mat" || reed.waterDepth < 40_000) continue;
    const anchor = anchors.find((candidate) =>
      candidate.tileIndex !== reed.tileIndex
      && manhattanTileDistance(candidate.tileIndex, reed.tileIndex, world.terrain) <= 2,
    );
    if (anchor) return { reed, anchor };
  }
  throw new Error("Generated fixture has no wet soft-ground Tide anchor/Reed mat overlap");
}

describe("Wayknots game wiring", () => {
  it("starts the player with six carried fixed pieces and projects contextual bindings", () => {
    const world = generatedWorld();
    const player = createPlayer(world);

    expect(player.wayknots.capacity).toBe(6);
    expect(player.wayknots.wayknots).toEqual([
      { id: 1, kind: "reed-mat", region: null, tileIndex: null, condition: FIXED_POINT, readyTick: 0, serviceWearRemainder: 0 },
      { id: 2, kind: "reed-mat", region: null, tileIndex: null, condition: FIXED_POINT, readyTick: 0, serviceWearRemainder: 0 },
      { id: 3, kind: "tide-anchor", region: null, tileIndex: null, condition: FIXED_POINT, readyTick: 0, serviceWearRemainder: 0 },
      { id: 4, kind: "tide-anchor", region: null, tileIndex: null, condition: FIXED_POINT, readyTick: 0, serviceWearRemainder: 0 },
      { id: 5, kind: "wind-knot", region: null, tileIndex: null, condition: FIXED_POINT, readyTick: 0, serviceWearRemainder: 0 },
      { id: 6, kind: "wind-knot", region: null, tileIndex: null, condition: FIXED_POINT, readyTick: 0, serviceWearRemainder: 0 },
    ]);

    const placements = [
      eligibleContext(world, "reed-mat", (tile) => tile.terrain === "marsh"),
      eligibleContext(world, "tide-anchor", (tile) => tile.terrain === "deep-water"),
      eligibleContext(world, "wind-knot", (tile) =>
        tile.terrain === "ridge" || tile.terrain === "meadow"),
    ] as const;
    for (const context of placements) bindContextually(player, context);

    const view = projectGameView(world, player);
    expect(view.wayknots).toHaveLength(3);
    for (const context of placements) {
      const kind = contextualWayknotKind(context);
      const tile = world.terrain.tiles[context.tileIndex];
      const projected = view.wayknots.find((wayknot) => wayknot.kind === kind);
      if (!tile || !kind) throw new Error("Generated placement fixture became invalid");
      expect(projected).toMatchObject({
        kind,
        position: {
          x: tile.x * view.terrain.tileSize + view.terrain.tileSize / 2,
          y: tile.y * view.terrain.tileSize + view.terrain.tileSize / 2,
        },
      });
    }
  });

  it("projects an explicit F binding action, active label, and reclaim action", () => {
    const world = generatedWorld();
    const marsh = eligibleContext(world, "reed-mat", (tile) => tile.terrain === "marsh");
    const player = createPlayer(world);
    const session = activeSession();
    placePlayerAt(player, world, marsh.tileIndex);

    const before = projectUIView(world, player, session);
    if (!before.controls) throw new Error("UI projection omitted Wayknot controls");
    expect(before.controls).toMatchObject({
      canWayknot: true,
      wayknotLabel: "Lay Reed mat",
    });
    expect(before.controls.wayknotHint).toContain("Press F");
    expect(before.field.activeWayknotLabels).toEqual([]);

    const placed = toggleContextualWayknot(player.wayknots, marsh);
    expect(placed.reason).toBe("placed");
    player.wayknots = placed.state;
    const bound = projectUIView(world, player, session);
    if (!bound.controls) throw new Error("UI projection omitted bound Wayknot controls");
    expect(bound.controls).toMatchObject({
      canWayknot: true,
      wayknotLabel: "Reclaim Reed mat",
    });
    expect(bound.controls.wayknotHint).toContain("Press F");
    expect(bound.field.activeWayknotLabels).toEqual(["Reed mat"]);

    const reclaimed = toggleContextualWayknot(player.wayknots, marsh);
    expect(reclaimed.reason).toBe("reclaimed");
    player.wayknots = reclaimed.state;
    expect(projectUIView(world, player, session).controls?.wayknotLabel).toBe("Lay Reed mat");
    expect(player.wayknots.wayknots).toHaveLength(6);
  });

  it("keeps contextual F depth-neutral on unsounded flooded ground", () => {
    const world = generatedWorld();
    const marsh = eligibleContext(world, "reed-mat", (tile) => tile.terrain === "marsh");
    const tile = world.terrain.tiles[marsh.tileIndex];
    if (!tile) throw new Error("Generated marsh fixture disappeared");
    const player = createPlayer(world);
    const session = activeSession();
    placePlayerAt(player, world, marsh.tileIndex);

    tile.waterDepth = 80_000;
    player.depthSoundings[marsh.tileIndex] = 0;
    const unsoundedShallows = projectUIView(world, player, session);
    expect(unsoundedShallows.controls).toMatchObject({
      canWayknot: false,
      wayknotLabel: "Sound water first",
    });
    expect(unsoundedShallows.controls?.wayknotHint).toContain("Sound this flooded ground with Space");
    expect(unsoundedShallows.field.hint).toMatch(/^Sound this water first \(Space\)/u);

    tile.waterDepth = 180_000;
    const unsoundedWaistWater = projectUIView(world, player, session);
    expect(unsoundedWaistWater.controls).toMatchObject({
      canWayknot: false,
      wayknotLabel: "Sound water first",
    });
    expect(unsoundedWaistWater.controls?.wayknotHint).toBe(
      unsoundedShallows.controls?.wayknotHint,
    );

    player.depthSoundings[marsh.tileIndex] = FIXED_POINT;
    const sounded = projectUIView(world, player, session);
    expect(sounded.controls).toMatchObject({
      canWayknot: true,
      wayknotLabel: "Set Tide anchor",
    });

    const obviousChannel = eligibleContext(world, "tide-anchor", (candidate) =>
      candidate.terrain === "deep-water");
    const channelPlayer = createPlayer(world);
    placePlayerAt(channelPlayer, world, obviousChannel.tileIndex);
    channelPlayer.depthSoundings[obviousChannel.tileIndex] = 0;
    expect(projectUIView(world, channelPlayer, session).controls).toMatchObject({
      canWayknot: true,
      wayknotLabel: "Set Tide anchor",
    });
  });

  it("prioritizes unsounded-water guidance over active-field copy without hiding reclaim", () => {
    const world = generatedWorld();
    const marsh = eligibleContext(world, "reed-mat", (tile) => tile.terrain === "marsh");
    const tile = world.terrain.tiles[marsh.tileIndex];
    if (!tile) throw new Error("Generated marsh fixture disappeared");
    tile.waterDepth = 180_000;
    const player = createPlayer(world);
    const session = activeSession();
    placePlayerAt(player, world, marsh.tileIndex);
    player.depthSoundings[marsh.tileIndex] = FIXED_POINT;
    const anchorContext = wayknotContextAt(world, marsh.tileIndex);
    if (!anchorContext) throw new Error("Flooded marsh context disappeared");
    bindContextually(player, anchorContext);

    player.depthSoundings[marsh.tileIndex] = 0;
    const view = projectUIView(world, player, session);
    expect(view.field.activeWayknotLabels).toEqual(["Tide anchor"]);
    expect(view.field.hint).toMatch(/^Sound this water first \(Space\)/u);
    expect(view.field.hint).not.toContain("nearby Tide anchor");
    expect(view.controls).toMatchObject({
      canWayknot: true,
      wayknotLabel: "Reclaim Tide anchor",
    });
  });

  it("makes a bound Reed mat faster and less tiring on generated soft ground", () => {
    const world = generatedWorld();
    const marsh = eligibleContext(world, "reed-mat", (tile) => tile.terrain === "marsh");
    const baseline = createPlayer(world);
    const aided = createPlayer(world);
    placePlayerAt(baseline, world, marsh.tileIndex);
    placePlayerAt(aided, world, marsh.tileIndex);
    bindContextually(aided, marsh);

    const baselineStamina = baseline.stamina;
    const aidedStamina = aided.stamina;
    stepPlayer(baseline, world, MOVE_RIGHT);
    stepPlayer(aided, world, MOVE_RIGHT);

    expect(aided.velocityX).toBeGreaterThan(baseline.velocityX);
    expect(aidedStamina - aided.stamina).toBeLessThan(baselineStamina - baseline.stamina);
    expect(playerTileIndex(aided)).toBe(marsh.tileIndex);
  });

  it("makes a Tide anchor lower water effort and shorten a generated deep-water sweep", () => {
    const world = generatedWorld();
    const water = longSweepAnchorContext(world);
    const tile = world.terrain.tiles[water.tileIndex];
    if (!tile) throw new Error("Generated deep-water fixture disappeared");
    const baseline = createPlayer(world);
    const anchored = createPlayer(world);
    placePlayerAt(baseline, world, water.tileIndex);
    placePlayerAt(anchored, world, water.tileIndex);
    bindContextually(anchored, water);

    const plainEffort = waterEffortPerStep(baseline, tile.waterDepth);
    const anchorEffects = wayknotEffectsAt(anchored, world, water.tileIndex);
    const anchoredEffort = waterEffortPerStep(
      anchored,
      tile.waterDepth,
      anchorEffects.staminaCostPermille,
    );
    expect(anchoredEffort).toBeLessThan(plainEffort);
    expect(anchorEffects.sweepRiskPermille).toBeLessThan(1_000);

    baseline.pace = "swift";
    anchored.pace = "swift";
    baseline.stamina = 13_000;
    anchored.stamina = 13_000;
    const plainSweep = stepPlayer(baseline, world, MOVE_RIGHT);
    const anchoredSweep = stepPlayer(anchored, world, MOVE_RIGHT);

    expect(plainSweep.becameSwept).toBe(true);
    expect(anchoredSweep.becameSwept).toBe(true);
    expect(anchored.sweepPath).toEqual(baseline.sweepPath);
    expect(anchored.sweepPath.some((index) =>
      manhattanTileDistance(water.tileIndex, index, world.terrain) > 2
    )).toBe(true);

    const plainEstimate = baseline.sweepTotalTicks;
    const anchoredEstimate = anchored.sweepTotalTicks;
    const plainActual = ticksUntilAshore(baseline, world);
    const anchoredActual = ticksUntilAshore(anchored, world);

    expect(plainActual).toBe(plainEstimate);
    expect(anchoredActual).toBe(anchoredEstimate);
    expect(anchoredActual).toBeLessThan(plainActual);
  });

  it("makes a Wind knot reduce gust-driven stability loss on generated exposed ground", () => {
    const generated = generatedWorld();
    // Eligibility means the ground can host a Wind knot; it does not promise
    // that the generated front is currently strong or transverse enough to
    // exceed firm-ground tolerance. Keep the generated terrain and inject one
    // deterministic cross-gust so this fixture measures the claimed effect.
    const world: WorldView = {
      ...generated,
      weather: {
        ...generated.weather,
        kind: "storm",
        intensity: 400_000,
        windX: 300_000,
        windY: -200_000,
      },
    };
    const exposed = eligibleContext(world, "wind-knot");
    const baseline = createPlayer(world);
    const sheltered = createPlayer(world);
    placePlayerAt(baseline, world, exposed.tileIndex);
    placePlayerAt(sheltered, world, exposed.tileIndex);
    bindContextually(sheltered, exposed);
    baseline.stability = 800_000;
    sheltered.stability = 800_000;

    expect(world.weather.intensity).toBeGreaterThan(0);
    expect(Math.abs(world.weather.windX) + Math.abs(world.weather.windY)).toBeGreaterThan(0);
    stepPlayer(baseline, world, MOVE_RIGHT);
    stepPlayer(sheltered, world, MOVE_RIGHT);

    expect(sheltered.stability).toBeGreaterThan(baseline.stability);
    expect(800_000 - sheltered.stability).toBeLessThan(800_000 - baseline.stability);
  });

  it("surfaces an unlike Waychord and gives its deterministic Loom recharge bonus", () => {
    const world = generatedWorld();
    const { reed, anchor } = wetSoftWaychordContexts(world);
    const baseline = createPlayer(world);
    const chord = createPlayer(world);
    placePlayerAt(baseline, world, reed.tileIndex);
    placePlayerAt(chord, world, reed.tileIndex);
    chord.depthSoundings[reed.tileIndex] = FIXED_POINT;
    bindContextually(chord, reed);
    bindContextually(chord, anchor);

    const ui = projectUIView(world, chord, activeSession());
    expect(ui.field.activeWayknotLabels).toEqual(["Reed mat", "Tide anchor"]);
    expect(ui.field.hint).toContain("WAYCHORD");
    expect(ui.field.hint).toContain("Reed mat + Tide anchor");
    expect(ui.field.hint).toContain("recharges the Loom faster");
    expect(projectGameView(world, chord).wayknots.filter((wayknot) => wayknot.active))
      .toHaveLength(2);

    baseline.scanCharge = 100_000;
    chord.scanCharge = 100_000;
    stepPlayer(baseline, world, NO_INPUT);
    stepPlayer(chord, world, NO_INPUT);

    expect(baseline.scanCharge).toBe(100_900);
    expect(chord.scanCharge).toBe(101_500);
    expect(chord.scanCharge - baseline.scanCharge).toBe(600);
    expect(chord.scanCharge).toBeLessThan(FIXED_POINT);
  });
});
