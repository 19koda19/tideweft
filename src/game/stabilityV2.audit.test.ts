import { describe, expect, it } from "vitest";

import { createWorldView } from "../sim/view";
import { FIXED_POINT, type WorldView } from "../sim/types";
import { createInitialWorld } from "../sim/world";
import {
  FOOTING_VERSION,
  evaluateFooting,
  type FootingInput,
  type FootingVector,
} from "./footing";
import {
  TILE_UNITS,
  createPlayer,
  stepPlayer,
  type PlayerState,
} from "./player";
import { deriveWaterFlowProfile } from "./waterFlow";

const BASE: FootingInput = {
  stability: FIXED_POINT,
  moving: true,
  speed: 500_000,
  surface: "firm",
  elevationDelta: 0,
  roughness: 0,
  moisture: 0,
  waterDepth: 0,
  movement: { x: FIXED_POINT, y: 0 },
  current: { x: 0, y: 0 },
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

function footing(overrides: Partial<FootingInput> = {}) {
  return evaluateFooting({
    ...BASE,
    ...overrides,
    movement: overrides.movement ?? BASE.movement,
    current: overrides.current ?? BASE.current,
    wind: overrides.wind ?? BASE.wind,
  });
}

function vectorAtStrength(strength: number): FootingVector {
  return { x: 0, y: strength };
}

function localRiverWorld(roughness: number, waterDepth = 520_000): {
  readonly world: WorldView;
  readonly player: PlayerState;
} {
  const base = createWorldView(createInitialWorld("stability v2 river audit", "standard"));
  const player = createPlayer(base);
  const occupied = new Set(base.settlements.map(({ tileIndex }) => tileIndex));
  const tileIndex = base.terrain.tiles.findIndex((tile) =>
    !occupied.has(tile.index)
      && tile.x > 1
      && tile.y > 1
      && tile.x < base.terrain.width - 2
      && tile.y < base.terrain.height - 2
  );
  const tile = base.terrain.tiles[tileIndex];
  if (!tile) throw new Error("river audit could not find a non-harbor tile");
  const world: WorldView = {
    ...base,
    terrain: {
      ...base.terrain,
      tiles: base.terrain.tiles.map((candidate) => candidate.index === tile.index
        ? {
            ...candidate,
            terrain: "deep-water",
            waterDepth,
            roughness,
            moisture: FIXED_POINT,
          }
        : candidate),
    },
  };
  player.x = tile.x * TILE_UNITS + TILE_UNITS / 2;
  player.y = tile.y * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.stamina = FIXED_POINT;
  player.stability = FIXED_POINT;
  return { world, player };
}

describe("Stability v2 adversarial invariants", () => {
  it("snaps to one physical target and makes an identical repeat idempotent", () => {
    const hazard: Partial<FootingInput> = {
      surface: "water",
      speed: 780_000,
      waterDepth: 620_000,
      roughness: 720_000,
      current: { x: 0, y: 680_000 },
      wind: { x: -350_000, y: 180_000 },
      weatherIntensity: 700_000,
      turnPressure: 320_000,
      loadRatio: 760_000,
      cargoShift: 110_000,
    };
    const first = footing(hazard);
    const repeat = footing({ ...hazard, stability: first.stabilityAfter });

    expect(first.version).toBe(2);
    expect(FOOTING_VERSION).toBe(2);
    expect(first.stabilityAfter).toBe(first.stabilityTarget);
    expect(repeat.stabilityTarget).toBe(first.stabilityTarget);
    expect(repeat.stabilityAfter).toBe(first.stabilityAfter);
    expect(repeat.delta).toBe(0);
    expect(repeat.trend).toBe("steady");
  });

  it("recovers promptly to a high dry-bank target despite maximum crosswind", () => {
    const bank = footing({
      stability: 0,
      moving: false,
      speed: 0,
      surface: "soft",
      movement: { x: 0, y: 0 },
      wind: { x: FIXED_POINT, y: FIXED_POINT },
      weatherIntensity: FIXED_POINT,
      brace: true,
    });
    const brokenRiver = footing({
      stability: 0,
      speed: FIXED_POINT,
      surface: "water",
      waterDepth: 720_000,
      roughness: FIXED_POINT,
      current: { x: 0, y: 820_000 },
      wind: { x: FIXED_POINT, y: FIXED_POINT },
      weatherIntensity: FIXED_POINT,
    });

    expect(bank.primaryCause).toBe("crosswind");
    expect(bank.stabilityAfter).toBe(bank.stabilityTarget);
    expect(bank.stabilityTarget).toBeGreaterThanOrEqual(650_000);
    expect(bank.stabilityTarget - brokenRiver.stabilityTarget).toBeGreaterThan(300_000);
    expect(bank.delta).toBe(bank.stabilityTarget);
  });

  it("uses normalized actual speed instead of treating all movement as one pace", () => {
    const slow = footing({ speed: 80_000 });
    const fast = footing({ speed: FIXED_POINT });
    const speedContribution = (result: ReturnType<typeof footing>) =>
      result.causes.find(({ code }) => code === "swift-motion")?.contribution ?? 0;

    expect(speedContribution(slow)).toBeGreaterThan(0);
    expect(speedContribution(fast)).toBeGreaterThan(speedContribution(slow));
    expect(slow.stabilityTarget).toBeGreaterThan(fast.stabilityTarget);
  });

  it("makes BRACE meaningful without allowing toggle spam to ratchet stability", () => {
    const hazard: Partial<FootingInput> = {
      speed: 760_000,
      surface: "rock",
      elevationDelta: -620_000,
      roughness: 870_000,
      turnPressure: 510_000,
      loadRatio: 830_000,
    };
    const unbraced = footing(hazard);
    const braced = footing({ ...hazard, stability: unbraced.stabilityAfter, brace: true });
    const released = footing({ ...hazard, stability: braced.stabilityAfter, brace: false });
    const bracedAgain = footing({ ...hazard, stability: released.stabilityAfter, brace: true });
    const heldRepeat = footing({ ...hazard, stability: bracedAgain.stabilityAfter, brace: true });

    expect(braced.stabilityTarget).toBeGreaterThan(unbraced.stabilityTarget);
    expect(braced.stabilityTarget).toBeLessThan(FIXED_POINT);
    expect(released.stabilityAfter).toBe(unbraced.stabilityTarget);
    expect(bracedAgain.stabilityAfter).toBe(braced.stabilityTarget);
    expect(heldRepeat.stabilityAfter).toBe(braced.stabilityTarget);
    expect(heldRepeat.delta).toBe(0);
  });

  it("derives a deterministic rougher local river and feeds it into footing", () => {
    const input = {
      waterDepth: 620_000,
      tideLevel: 540_000,
      weatherIntensity: 470_000,
    } as const;
    const calm = deriveWaterFlowProfile({ ...input, bedRoughness: 0 });
    const rough = deriveWaterFlowProfile({ ...input, bedRoughness: FIXED_POINT });
    const calmFooting = footing({
      surface: "water",
      waterDepth: input.waterDepth,
      roughness: 0,
      current: vectorAtStrength(calm.strength),
    });
    const roughFooting = footing({
      surface: "water",
      waterDepth: input.waterDepth,
      roughness: FIXED_POINT,
      current: vectorAtStrength(rough.strength),
    });

    expect(deriveWaterFlowProfile({ ...input, bedRoughness: FIXED_POINT })).toEqual(rough);
    expect(rough.strength).toBeGreaterThan(calm.strength);
    expect(rough.turbulence).toBeGreaterThan(calm.turbulence);
    expect(roughFooting.stabilityTarget).toBeLessThan(calmFooting.stabilityTarget);
  });

  it("does not force ADRIFT merely because stability was zero at step entry", () => {
    const { world, player } = localRiverWorld(0, 120_000);
    player.stability = 0;

    const result = stepPlayer(player, world, { moveX: 0, moveY: 0, brace: false });

    expect(result.footing?.stabilityBefore).toBe(0);
    expect(result.footing?.stabilityAfter).toBe(result.footing?.stabilityTarget);
    expect(player.stability).toBeGreaterThan(280_000);
    expect(result.becameSwept).toBe(false);
    expect(player.mode).not.toBe("swept");
  });

  it("keeps calm and rough live river contacts distinct in player integration", () => {
    const calm = localRiverWorld(0);
    const rough = localRiverWorld(FIXED_POINT);
    const control = { moveX: 1, moveY: 0, brace: false } as const;

    const calmResult = stepPlayer(calm.player, calm.world, control);
    const roughResult = stepPlayer(rough.player, rough.world, control);

    expect(calmResult.footing?.version).toBe(2);
    expect(roughResult.footing?.version).toBe(2);
    expect(roughResult.footing?.stabilityTarget)
      .toBeLessThan(calmResult.footing?.stabilityTarget ?? 0);
    expect(roughResult.footing?.hazardPressure)
      .toBeGreaterThan(calmResult.footing?.hazardPressure ?? FIXED_POINT);
  });
});
