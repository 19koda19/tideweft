import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  type WorldView,
} from "../sim/public";
import {
  TILE_UNITS,
  TIDE_HARP_SCAN_RECHARGE,
  activeTideHarpAtPlayer,
  createPlayer,
  pulseScan,
  stepPlayer,
  tideHarpScanRechargeAtPlayer,
  tunedTideHarps,
  wayknotContextAt,
  wayknotEffectsAt,
  type PlayerState,
} from "./player";
import { tideHarpPulseAnnouncement } from "./runtime";
import { createSessionState } from "./sessionTypes";
import { tideHarpContainsTileCenter, type TideHarp } from "./tideHarps";
import { placeContextualWayknot } from "./wayknots";
import { projectUIView } from "./uiProjection";

const FIXTURE_SEED = "phase ten glass ebb";
const HARP_TILE_INDICES = [2_942, 3_230, 2_751] as const;
const NO_INPUT = { moveX: 0, moveY: 0, brace: false } as const;

interface GeneratedHarpFixture {
  readonly world: WorldView;
  readonly player: PlayerState;
  readonly harp: TideHarp;
  readonly inventoryBeforeFormation: unknown;
}

function generatedHarpFixture(): GeneratedHarpFixture {
  const world = createWorldView(createWorld(FIXTURE_SEED, "calm"));
  const player = createPlayer(world);
  const inventoryBeforeFormation = settlementInventory(world);
  for (const tileIndex of HARP_TILE_INDICES) {
    const context = wayknotContextAt(world, tileIndex);
    if (!context) throw new Error(`Generated Tide Harp fixture lost tile ${tileIndex}`);
    const placement = placeContextualWayknot(player.wayknots, context);
    if (!placement.ok) {
      throw new Error(`Generated Tide Harp fixture could not place tile ${tileIndex}: ${placement.reason}`);
    }
    player.wayknots = placement.state;
  }
  const harps = tunedTideHarps(player, world);
  const harp = harps[0];
  if (!harp) throw new Error("Generated Tide Harp fixture did not tune a formation");
  return { world, player, harp, inventoryBeforeFormation };
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

function settlementInventory(world: WorldView): unknown {
  return world.settlements.map((settlement) => structuredClone(settlement.inventory));
}

function distanceSquared(world: WorldView, leftIndex: number, rightIndex: number): number {
  const left = world.terrain.tiles[leftIndex];
  const right = world.terrain.tiles[rightIndex];
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function remoteEchoTile(world: WorldView, harp: TideHarp, playerTileIndex: number): number {
  for (const knot of [...harp.knots].reverse()) {
    const tile = world.terrain.tiles.find((candidate) =>
      distanceSquared(world, candidate.index, knot.tileIndex) <= 6 ** 2
      && distanceSquared(world, candidate.index, playerTileIndex) > 8 ** 2
    );
    if (tile) return tile.index;
  }
  throw new Error("Generated Tide Harp fixture has no remote echo tile");
}

function activeSession() {
  const session = createSessionState(FIXTURE_SEED);
  session.paused = false;
  session.titleVisible = false;
  return session;
}

describe("Tide Harp gameplay wiring", () => {
  it("forms from generated terrain and projects tuned, active, and sound-first field states", () => {
    const { world, player, harp, inventoryBeforeFormation } = generatedHarpFixture();
    expect(harp.id).toBe("tide-harp:r1-a3-w5");
    expect(harp.knots.map((knot) => [knot.kind, knot.tileIndex])).toEqual([
      ["reed-mat", HARP_TILE_INDICES[0]],
      ["tide-anchor", HARP_TILE_INDICES[1]],
      ["wind-knot", HARP_TILE_INDICES[2]],
    ]);
    expect(settlementInventory(world)).toEqual(inventoryBeforeFormation);
    expect(player.cargo).toEqual([]);
    expect(Object.hasOwn(player, "tideHarps")).toBe(false);

    placePlayerAt(player, world, HARP_TILE_INDICES[0]);
    const active = projectUIView(world, player, activeSession());
    expect(active.field.tideHarps).toEqual({
      tunedCount: 1,
      activeId: harp.id,
      activeLabel: harp.label,
      benefitLabel: "+900 Loom/tick · Space sounds radius 6 from all 3 knots",
    });
    expect(active.field.hint).toContain(harp.label);
    expect(active.field.hint).toContain("+900 Loom charge each tick");
    expect(active.field.hint).toContain("radius-6 sounding from all three knot origins");

    placePlayerAt(player, world, HARP_TILE_INDICES[1]);
    player.depthSoundings[HARP_TILE_INDICES[1]] = 0;
    const unsoundedActive = projectUIView(world, player, activeSession());
    expect(unsoundedActive.field.tideHarps.activeId).toBe(harp.id);
    expect(unsoundedActive.field.depthKnown).toBe(false);
    expect(unsoundedActive.field.hint).toMatch(/^Sound this water first \(Space\)/u);
    expect(unsoundedActive.field.hint).not.toContain("radius-6");

    placePlayerAt(player, world, 0);
    const inactive = projectUIView(world, player, activeSession());
    expect(tideHarpContainsTileCenter(harp, 0, world.terrain)).toBe(false);
    expect(inactive.field.tideHarps).toEqual({
      tunedCount: 1,
      activeId: null,
      activeLabel: null,
      benefitLabel: "+900 Loom/tick · Space sounds radius 6 from all 3 knots",
    });
  });

  it("adds one bounded Harp recharge alongside the existing recharge rules", () => {
    const { world, player, harp } = generatedHarpFixture();
    placePlayerAt(player, world, HARP_TILE_INDICES[0]);
    const activeKinds = new Set(
      wayknotEffectsAt(player, world, HARP_TILE_INDICES[0])
        .influences.map((influence) => influence.kind),
    );
    expect(activeTideHarpAtPlayer(player, world)?.id).toBe(harp.id);
    expect(tideHarpScanRechargeAtPlayer(player, world, [harp, harp])).toBe(
      TIDE_HARP_SCAN_RECHARGE,
    );

    player.scanCharge = 100_000;
    stepPlayer(player, world, NO_INPUT);
    const waychordRecharge = activeKinds.size >= 2 ? 600 : 0;
    expect(player.scanCharge).toBe(
      100_000 + 900 + waychordRecharge + TIDE_HARP_SCAN_RECHARGE,
    );

    player.scanCharge = FIXED_POINT - 100;
    stepPlayer(player, world, NO_INPUT);
    expect(player.scanCharge).toBe(FIXED_POINT);
  });

  it("echoes an active pulse from all three knots but gives no remote footprint when inactive", () => {
    const { world, player, harp } = generatedHarpFixture();
    const activeTileIndex = HARP_TILE_INDICES[0];
    const echoTileIndex = remoteEchoTile(world, harp, activeTileIndex);
    expect(distanceSquared(world, echoTileIndex, activeTileIndex)).toBeGreaterThan(8 ** 2);
    expect(harp.knots.some(
      (knot) => distanceSquared(world, echoTileIndex, knot.tileIndex) <= 6 ** 2,
    )).toBe(true);

    placePlayerAt(player, world, activeTileIndex);
    player.cargo = [{
      contractId: 99,
      resource: "medicine",
      quantity: 2,
      condition: 876_000,
      property: "fragile",
    }];
    player.activeContractId = 99;
    player.discovered.fill(0);
    player.depthSoundings.fill(0);
    player.scanCharge = FIXED_POINT;
    const cargoBefore = structuredClone(player.cargo);
    const inventoryBefore = settlementInventory(world);

    expect(pulseScan(player, world)).toBe(true);
    for (const knot of harp.knots) {
      expect(player.discovered[knot.tileIndex]).toBe(FIXED_POINT);
      expect(player.depthSoundings[knot.tileIndex]).toBe(FIXED_POINT);
    }
    expect(player.discovered[echoTileIndex]).toBeGreaterThan(0);
    expect(player.depthSoundings[echoTileIndex]).toBeGreaterThan(0);
    expect(player.cargo).toEqual(cargoBefore);
    expect(settlementInventory(world)).toEqual(inventoryBefore);

    const inactive = createPlayer(world);
    inactive.wayknots = player.wayknots;
    placePlayerAt(inactive, world, 0);
    inactive.discovered.fill(0);
    inactive.depthSoundings.fill(0);
    inactive.scanCharge = FIXED_POINT;
    expect(activeTideHarpAtPlayer(inactive, world)).toBeUndefined();
    expect(pulseScan(inactive, world)).toBe(true);
    expect(inactive.discovered[echoTileIndex]).toBe(0);
    expect(inactive.depthSoundings[echoTileIndex]).toBe(0);
  });

  it("names the active Harp and all three sounding origins in the success announcement", () => {
    const { harp } = generatedHarpFixture();
    const message = tideHarpPulseAnnouncement(harp);
    expect(message).toContain(harp.label);
    expect(message).toContain("your position");
    expect(message).toContain("three knot origins");
    expect(message).toContain("Reed mat #1");
    expect(message).toContain("Tide anchor #3");
    expect(message).toContain("Wind knot #5");
  });
});
