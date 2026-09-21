import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  type WorldView,
} from "../sim/public";
import { TILE_UNITS, createPlayer, type PlayerState } from "./player";
import { projectGameView } from "./projection";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";

interface ProjectionFixture {
  readonly world: WorldView;
  readonly mutableWorld: WorldView;
  readonly player: PlayerState;
}

function createFixture(seed = "the chart remembers only what was seen"): ProjectionFixture {
  const state = createWorld(seed, "standard");
  const compatibility = createWorldView(state);
  const stream = createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed });
  const cartography = createRegionalCartography(state.meta.rootSeed);
  const window = createRegionalTerrainWindow(state.meta.rootSeed, stream);
  const knowledge = projectRegionalCartographyWindow(cartography, window);
  const world = createRegionalWorldView(
    compatibility,
    window,
    knowledge,
    { immutable: true },
  );
  const mutableWorld = createRegionalWorldView(compatibility, window, knowledge);
  const player = createPlayer(compatibility, compatibility.settlements[0]?.id);
  player.worldWidth = world.terrain.width;
  player.worldHeight = world.terrain.height;
  player.x = Math.floor(world.terrain.width / 2) * TILE_UNITS
    + Math.floor(TILE_UNITS / 2);
  player.y = Math.floor(world.terrain.height / 2) * TILE_UNITS
    + Math.floor(TILE_UNITS / 2);
  player.previousX = player.x;
  player.previousY = player.y;
  player.discovered = [...knowledge.discovered];
  player.depthSoundings = [...knowledge.depthSoundings];
  const playerIndex = Math.floor(player.y / TILE_UNITS) * player.worldWidth
    + Math.floor(player.x / TILE_UNITS);
  player.currentTrace = [playerIndex];
  player.surveyTrace = [playerIndex];
  player.sweepPath = [];
  return { world, mutableWorld, player };
}

describe("terrain projection receipt", () => {
  it("reuses only the readonly terrain array while rebuilding the outer view", () => {
    const { world, mutableWorld, player } = createFixture();

    const first = projectGameView(world, player);
    const second = projectGameView(world, player);
    const uncached = projectGameView(mutableWorld, player);

    expect(second).not.toBe(first);
    expect(second.terrain).not.toBe(first.terrain);
    expect(second.terrain.tiles).toBe(first.terrain.tiles);
    expect(second.terrain.tiles).toEqual(uncached.terrain.tiles);
    expect(Object.isFrozen(second.terrain.tiles)).toBe(true);
    expect(Object.isFrozen(second.terrain.tiles[0])).toBe(true);
    expect(Object.isFrozen(second.terrain.tiles[0]?.climate)).toBe(true);
    expect(second.porters).not.toBe(first.porters);
  });

  it("invalidates exact in-place discovery and sounding changes", () => {
    const { world, player } = createFixture("the mutable chart cannot poison a receipt");
    const tileIndex = Math.floor(world.terrain.tiles.length / 2) + 1;
    const first = projectGameView(world, player);
    player.discovered[tileIndex] = player.discovered[tileIndex] === 0
      ? FIXED_POINT
      : 0;
    const discovered = projectGameView(world, player);

    expect(discovered.terrain.tiles).not.toBe(first.terrain.tiles);
    expect(discovered.terrain.tiles[tileIndex]?.discovered)
      .toBe(player.discovered[tileIndex]! / FIXED_POINT);
    expect(projectGameView(world, player).terrain.tiles).toBe(discovered.terrain.tiles);

    player.depthSoundings[tileIndex] = player.depthSoundings[tileIndex] === 0
      ? FIXED_POINT
      : 0;
    const sounded = projectGameView(world, player);
    expect(sounded.terrain.tiles).not.toBe(discovered.terrain.tiles);
    expect(sounded.terrain.tiles[tileIndex]?.depthKnown)
      .toBe(player.depthSoundings[tileIndex]! / FIXED_POINT);
  });

  it("invalidates movement perception and never reuses sleeping detail", () => {
    const { world, player } = createFixture("the horizon changes when the courier turns");
    const first = projectGameView(world, player);
    player.facingMilliRadians += 1_571;
    const turned = projectGameView(world, player);
    const sleeping = projectGameView(world, player, { suppressDetailPerception: true });

    expect(turned.terrain.tiles).not.toBe(first.terrain.tiles);
    expect(sleeping.terrain.tiles).not.toBe(turned.terrain.tiles);
    expect(sleeping.terrain.tiles.every((tile) => tile.currentDetailVisibility === 0))
      .toBe(true);
  });

  it("invalidates in-place weather and illumination inputs", () => {
    const { world, player } = createFixture("weather cannot hide behind a terrain receipt");
    const first = projectGameView(world, player);
    const firstClimate = first.terrain.tiles.find((tile) => tile.climate)?.climate;
    if (!firstClimate) throw new Error("fixture did not project a terrain climate");

    const mutableWeather = world.weather as {
      kind: WorldView["weather"]["kind"];
      intensity: number;
      windX: number;
      windY: number;
    };
    mutableWeather.kind = "storm";
    mutableWeather.intensity = FIXED_POINT;
    mutableWeather.windX = FIXED_POINT;
    mutableWeather.windY = -FIXED_POINT;
    const storm = projectGameView(world, player);
    const stormClimate = storm.terrain.tiles.find((tile) => tile.climate)?.climate;

    expect(storm.terrain.tiles).not.toBe(first.terrain.tiles);
    expect(storm.terrain.currentLocalIlluminationRevision)
      .not.toBe(first.terrain.currentLocalIlluminationRevision);
    expect(stormClimate).not.toEqual(firstClimate);
  });

  it("never exposes a mutable shared climate through a caller-owned projection", () => {
    const { world, mutableWorld, player } = createFixture(
      "a caller cannot poison another view's climate",
    );
    const mutable = projectGameView(mutableWorld, player);
    const exposed = mutable.terrain.tiles.find((tile) => tile.climate)?.climate;
    if (!exposed) throw new Error("fixture did not project a terrain climate");
    const originalRainfall = exposed.rainfall;

    expect(Object.isFrozen(exposed)).toBe(true);
    expect(Reflect.set(exposed, "rainfall", 99)).toBe(false);

    const runtime = projectGameView(world, player);
    const runtimeClimate = runtime.terrain.tiles.find((tile) => tile.climate)?.climate;
    expect(runtimeClimate?.rainfall).toBe(originalRainfall);
  });

  it("bypasses caller-owned regional views and malformed mutable knowledge", () => {
    const { world, mutableWorld, player } = createFixture(
      "a copied window owns no private receipt",
    );
    const twinFirst = projectGameView(mutableWorld, player);
    const twinSecond = projectGameView(mutableWorld, player);
    expect(twinSecond.terrain.tiles).not.toBe(twinFirst.terrain.tiles);

    const valid = projectGameView(world, player);
    player.discovered = player.discovered.slice(0, -1);
    const malformedFirst = projectGameView(world, player);
    const malformedSecond = projectGameView(world, player);
    expect(malformedFirst.terrain.tiles).not.toBe(valid.terrain.tiles);
    expect(malformedSecond.terrain.tiles).not.toBe(malformedFirst.terrain.tiles);
    expect(malformedSecond.terrain.tiles.at(-1)?.discovered).toBe(0);
  });
});
