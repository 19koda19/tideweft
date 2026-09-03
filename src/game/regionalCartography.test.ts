import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { createTerrainRegionStreamingState, moveRegionStreamingCenter, createTerrainRegionGenerator } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import {
  captureRegionalCartographyWindow,
  createRegionalCartography,
  projectRegionalCartographyRegion,
  projectRegionalCartographyWindow,
  restoreRegionalCartography,
  serializeRegionalCartography,
} from "./regionalCartography";

describe("persistent regional cartography", () => {
  it("migrates the finite chart into compatibility region 0,0", () => {
    const count = WORLD_WIDTH * WORLD_HEIGHT;
    const discovered = Array.from({ length: count }, () => 0);
    const depths = Array.from({ length: count }, () => 0);
    discovered[0] = 700_000;
    depths[count - 1] = 920_000;
    const state = createRegionalCartography(seedFromText("legacy ink"), {
      discovered,
      depthSoundings: depths,
    });
    expect(projectRegionalCartographyRegion(state, { x: 0, y: 0 })).toEqual({
      discovered,
      depthSoundings: depths,
    });
    expect(projectRegionalCartographyRegion(state, { x: -1, y: 0 }).discovered.every((value) => value === 0)).toBe(true);
  });

  it("captures both sides of a signed seam and never forgets stronger knowledge", () => {
    const seed = seedFromText("ink crosses the western horizon");
    const stream = createTerrainRegionStreamingState({ rootSeed: seed, center: { x: 0, y: 0 } });
    const window = createRegionalTerrainWindow(seed, stream);
    const count = window.terrain.tiles.length;
    const discovered = Array.from({ length: count }, () => 0);
    const depths = Array.from({ length: count }, () => 0);
    const seamLocalY = 34;
    const westHalo = window.addresses.findIndex((address) =>
      address.region.x === -1
      && address.region.y === 0
      && address.localX === WORLD_WIDTH - 1
      && address.localY === seamLocalY);
    const originEdge = window.addresses.findIndex((address) =>
      address.region.x === 0
      && address.region.y === 0
      && address.localX === 0
      && address.localY === seamLocalY);
    if (westHalo < 0 || originEdge < 0) {
      throw new Error("Cartography fixture lost the signed storage seam");
    }
    discovered[westHalo] = 610_000;
    discovered[originEdge] = 820_000;
    depths[westHalo] = 340_000;
    let state = captureRegionalCartographyWindow(
      createRegionalCartography(seed), window, discovered, depths,
    );

    const weaker = [...discovered];
    weaker[westHalo] = 1;
    weaker[originEdge] = 2;
    state = captureRegionalCartographyWindow(state, window, weaker, depths.map(() => 0));
    expect(state.revision).toBe(1);
    expect(projectRegionalCartographyRegion(state, { x: -1, y: 0 }).discovered[seamLocalY * WORLD_WIDTH + WORLD_WIDTH - 1]).toBe(610_000);
    expect(projectRegionalCartographyRegion(state, { x: 0, y: 0 }).discovered[seamLocalY * WORLD_WIDTH]).toBe(820_000);
  });

  it("rehydrates revisited windows after bounded streaming evicts their terrain", () => {
    const seed = seedFromText("the chart remembers what memory unloads");
    const generator = createTerrainRegionGenerator(seed);
    let stream = createTerrainRegionStreamingState({ rootSeed: seed, center: { x: -2, y: 4 } });
    const firstWindow = createRegionalTerrainWindow(seed, stream);
    const learned = Array.from({ length: firstWindow.terrain.tiles.length }, () => 0);
    const sounded = Array.from({ length: learned.length }, () => 0);
    const markIndex = 20 * firstWindow.terrain.width + 25;
    learned[markIndex] = 777_000;
    sounded[markIndex] = 333_000;
    const state = captureRegionalCartographyWindow(
      createRegionalCartography(seed), firstWindow, learned, sounded,
    );

    stream = moveRegionStreamingCenter(stream, { x: 50, y: -50 }, generator).state;
    stream = moveRegionStreamingCenter(stream, { x: -2, y: 4 }, generator).state;
    const revisited = projectRegionalCartographyWindow(
      state,
      createRegionalTerrainWindow(seed, stream),
    );
    expect(revisited.discovered[markIndex]).toBe(777_000);
    expect(revisited.depthSoundings[markIndex]).toBe(333_000);
  });

  it("roundtrips canonically and rejects seed swaps, aliases, deletion, and tampering", () => {
    const seed = seedFromText("sealed chart folio");
    const stream = createTerrainRegionStreamingState({ rootSeed: seed });
    const window = createRegionalTerrainWindow(seed, stream);
    const discovered = Array.from({ length: window.terrain.tiles.length }, () => 0);
    const depths = Array.from({ length: discovered.length }, () => 0);
    discovered[100] = 500_000;
    const state = captureRegionalCartographyWindow(
      createRegionalCartography(seed), window, discovered, depths,
    );
    const text = serializeRegionalCartography(state);
    expect(restoreRegionalCartography(seed, text)).toEqual(state);
    expect(restoreRegionalCartography(seedFromText("another world"), text)).toBeNull();

    const alias = JSON.parse(text) as Record<string, unknown>;
    const regions = alias.regions as Array<Record<string, unknown>>;
    regions[0] = { ...regions[0], key: "r:00:0" };
    expect(restoreRegionalCartography(seed, JSON.stringify(alias))).toBeNull();

    const deleted = JSON.parse(text) as Record<string, unknown>;
    deleted.regions = [];
    expect(restoreRegionalCartography(seed, JSON.stringify(deleted))).toBeNull();

    const tampered = JSON.parse(text) as Record<string, unknown>;
    const tamperedRegions = tampered.regions as Array<Record<string, unknown>>;
    const marks = tamperedRegions[0]?.marks as Array<Record<string, unknown>>;
    if (marks[0]) marks[0].discovered = 900_000;
    expect(restoreRegionalCartography(seed, JSON.stringify(tampered))).toBeNull();
  });
});
