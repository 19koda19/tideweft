import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { globalTileToRegion } from "../sim/regions";
import { waterDepthAt } from "../sim/terrain";
import { createResidentView } from "../sim/view";
import { WORLD_WIDTH } from "../sim/types";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow, regionLocalToWindowTile } from "./regionalTravel";
import {
  createRegionalWorldView,
  isImmutableRegionalWorldView,
  rebindRegionalWorldViewWindow,
  regionalAddressAt,
  regionalCompatibilityWorldForWorld,
  regionalStorageRegionsInView,
  regionalTileIndexInView,
  regionalWindowForWorld,
  regionalWorldCenter,
  regionalWorldViewPhysicalPublication,
  replaceRegionalWorldViewResidents,
} from "./regionalWorldView";

function residentPublicationFixture() {
  const state = createWorld("people move through the same physical frame", "wild");
  const compatibility = createWorldView(state);
  const stream = createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed });
  const window = createRegionalTerrainWindow(state.meta.rootSeed, stream);
  const chart = projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window);
  const view = createRegionalWorldView(compatibility, window, chart, { immutable: true });
  return { compatibility, window, chart, view };
}

describe("regional live world projection", () => {
  it("preserves live compatibility terrain and remaps harbors and routes in the sliding frame", () => {
    const world = createWorld("compatibility stays alive", "wild");
    world.terrain.tiles[0]!.traceStrength = 654_321;
    const compatibility = createWorldView(world);
    const stream = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const chart = projectRegionalCartographyWindow(
      createRegionalCartography(world.meta.rootSeed, {
        discovered: Array.from({ length: world.terrain.tiles.length }, () => 1_000_000),
        depthSoundings: Array.from({ length: world.terrain.tiles.length }, () => 0),
      }),
      window,
    );
    const view = createRegionalWorldView(compatibility, window, chart);

    const originZero = regionalTileIndexInView(view, { x: 0, y: 0 }, 0);
    const originPoint = regionLocalToWindowTile(window, { x: 0, y: 0 }, 0, 0);
    expect(originZero).toBe(originPoint!.y * window.terrain.width + originPoint!.x);
    expect(view.terrain.tiles[originZero!]?.traceStrength).toBe(654_321);
    expect(view.settlements).toHaveLength(compatibility.settlements.length);
    expect(view.settlements[0]?.tileIndex).toBe(
      regionalTileIndexInView(view, { x: 0, y: 0 }, compatibility.settlements[0]!.tileIndex),
    );
    expect(view.routes).toHaveLength(compatibility.routes.length);
    expect(regionalWorldCenter(view)).toEqual({ x: 0, y: 0 });
  });

  it("uses the live tide on generated terrain and exposes exact signed tile addresses", () => {
    const world = createWorld("the eastern weather keeps moving", "wild");
    const compatibility = createWorldView(world);
    const stream = createTerrainRegionStreamingState({
      rootSeed: world.meta.rootSeed,
      center: { x: -8, y: 13 },
    });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const cartography = projectRegionalCartographyWindow(
      createRegionalCartography(world.meta.rootSeed),
      window,
    );
    const view = createRegionalWorldView(compatibility, window, cartography);
    const index = 20 * view.terrain.width + 30;
    const address = regionalAddressAt(view, index);
    expect(address).toEqual(globalTileToRegion(window.origin.x + 30, window.origin.y + 20));
    expect(view.terrain.tiles[index]?.waterDepth).toBe(
      waterDepthAt(window.terrain.tiles[index]!, compatibility.tide),
    );
    expect(view.settlements).toEqual([]);
    expect(view.routes).toEqual([]);
    expect(view.choirs).toEqual([]);
    const regionKeysFromTiles = [...new Set(window.addresses.map(({ region }) =>
      `${region.x}:${region.y}`))].sort();
    const regionKeysFromExtent = regionalStorageRegionsInView(view)
      .map(({ x, y }) => `${x}:${y}`)
      .sort();
    expect(regionKeysFromExtent).toEqual(regionKeysFromTiles);
    expect(regionKeysFromExtent.length).toBeLessThanOrEqual(9);
  });

  it("addresses the sliding frame and keeps legacy views compatible with region zero", () => {
    const world = createWorld("two coordinate dialects", "wild");
    const compatibility = createWorldView(world);
    expect(regionalAddressAt(compatibility, WORLD_WIDTH)).toEqual({
      region: { x: 0, y: 0 }, localX: 0, localY: 1,
    });
    expect(regionalTileIndexInView(compatibility, { x: 0, y: 0 }, WORLD_WIDTH)).toBe(WORLD_WIDTH);
    expect(regionalTileIndexInView(compatibility, { x: 1, y: 0 }, 0)).toBeNull();
    expect(regionalStorageRegionsInView(compatibility)).toEqual([{ x: 0, y: 0 }]);

    const stream = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const view = createRegionalWorldView(
      compatibility,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window),
    );
    expect(regionalAddressAt(view, 0)).toEqual(
      globalTileToRegion(window.origin.x, window.origin.y),
    );
  });

  it("retargets unchanged view metadata without rebuilding projected terrain", () => {
    const world = createWorld("ownership moves beneath one unbroken view", "wild");
    const compatibility = createWorldView(world);
    const stream = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const view = createRegionalWorldView(
      compatibility,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window),
    );
    const rebound = Object.freeze({ ...window, center: { x: 1, y: 0 } });
    const terrain = view.terrain;

    rebindRegionalWorldViewWindow(view, rebound);

    expect(view.terrain).toBe(terrain);
    expect(regionalWorldCenter(view)).toEqual({ x: 1, y: 0 });
    expect(regionalWindowForWorld(view)).toBe(rebound);
  });

  it("publishes detached immutable residents while retaining every non-resident field and binding", () => {
    const { compatibility, window, view } = residentPublicationFixture();
    const residents = structuredClone(compatibility.residents);
    residents[0]!.needs.rest = 750_000;
    residents[0]!.condition.exhaustion = 720_000;
    const replacement = replaceRegionalWorldViewResidents(view, residents);
    const replacedCompatibility = regionalCompatibilityWorldForWorld(replacement)!;

    expect(replacement).not.toBe(view);
    expect(Object.isFrozen(replacement)).toBe(true);
    expect(isImmutableRegionalWorldView(replacement)).toBe(true);
    expect(regionalWindowForWorld(replacement)).toBe(window);
    expect(regionalWorldViewPhysicalPublication(replacement)).toBe(view);
    expect(replacedCompatibility).not.toBe(compatibility);
    expect(Object.isFrozen(replacedCompatibility)).toBe(true);
    expect(replacedCompatibility.residents).toBe(replacement.residents);
    expect(replacement.residents).toEqual(residents);
    expect(replacement.residents).not.toBe(residents);
    expect(replacement.residents[0]).not.toBe(residents[0]);
    expect(replacement.residents[0]?.identity).not.toBe(residents[0]?.identity);
    expect(replacement.residents[0]?.perception).not.toBe(residents[0]?.perception);
    expect(Object.isFrozen(replacement.residents)).toBe(true);
    expect(Object.isFrozen(replacement.residents[0]?.needs)).toBe(true);
    expect(Object.isFrozen(replacement.residents[0]?.identity.appearance)).toBe(true);
    expect(Object.isFrozen(replacement.residents[0]?.perception.beliefs)).toBe(true);
    for (const key of Object.keys(view) as Array<keyof typeof view>) {
      if (key !== "residents") expect(replacement[key]).toBe(view[key]);
    }
    for (const key of Object.keys(compatibility) as Array<keyof typeof compatibility>) {
      if (key !== "residents") expect(replacedCompatibility[key]).toBe(compatibility[key]);
    }
    for (const index of [0, Math.floor(view.terrain.tiles.length / 2), view.terrain.tiles.length - 1]) {
      expect(regionalAddressAt(replacement, index)).toBe(regionalAddressAt(view, index));
    }
    expect(regionalStorageRegionsInView(replacement)).toEqual(regionalStorageRegionsInView(view));
    expect(view.residents[0]?.needs.rest).not.toBe(750_000);
    residents[0]!.needs.rest = 1;
    residents[0]!.identity.appearance.hair = residents[0]!.identity.appearance.hair === "black" ? "gray" : "black";
    expect(replacement.residents[0]?.needs.rest).toBe(750_000);
    expect(replacement.residents[0]?.identity.appearance.hair)
      .toBe(compatibility.residents[0]?.identity.appearance.hair);
  });

  it("preserves roster order and original physical publication across successive resident siblings", () => {
    const { view } = residentPublicationFixture();
    const residents = [...structuredClone(view.residents)].reverse();
    const first = replaceRegionalWorldViewResidents(view, residents);
    const nextResidents = structuredClone(first.residents);
    nextResidents[0]!.needs.rest = 860_000;
    const second = replaceRegionalWorldViewResidents(first, nextResidents);

    expect(first.residents.map(({ id }) => id)).toEqual(view.residents.map(({ id }) => id));
    expect(second.residents[0]?.needs.rest).toBe(860_000);
    expect(first.residents[0]?.needs.rest).not.toBe(860_000);
    expect(regionalWorldViewPhysicalPublication(first)).toBe(view);
    expect(regionalWorldViewPhysicalPublication(second)).toBe(view);
    expect(second.terrain).toBe(view.terrain);
    const rebound = Object.freeze({ ...regionalWindowForWorld(second)!, center: { x: 1, y: 0 } });
    rebindRegionalWorldViewWindow(second, rebound);
    expect(regionalWorldCenter(second)).toEqual({ x: 1, y: 0 });
    expect(regionalWorldViewPhysicalPublication(second)).toBe(view);
    expect(regionalAddressAt(second, 0)).toBe(regionalAddressAt(view, 0));
  });

  it("rejects missing, duplicate, swapped and forged resident identities without changing the original", () => {
    const { view } = residentPublicationFixture();
    const before = structuredClone(view.residents);
    const missing = structuredClone(view.residents).slice(1);
    const duplicate = [...structuredClone(view.residents)];
    duplicate[1] = duplicate[0]!;
    const swappedIdentity = structuredClone(view.residents);
    swappedIdentity[0]!.identity.stableId = swappedIdentity[1]!.identity.stableId;
    const changedId = structuredClone(view.residents);
    changedId[0]!.id = Number.MAX_SAFE_INTEGER;
    const changedHome = structuredClone(view.residents);
    changedHome[0]!.homeSettlementId += 1;
    const changedSpecies = structuredClone(view.residents);
    Object.assign(changedSpecies[0]!.identity, { species: "dog" });

    for (const residents of [missing, duplicate, swappedIdentity, changedId, changedHome, changedSpecies]) {
      expect(() => replaceRegionalWorldViewResidents(view, residents)).toThrow(/roster identity|existing roster/);
    }
    expect(view.residents).toEqual(before);
    expect(regionalWorldViewPhysicalPublication(view)).toBe(view);
  });

  it("shares the full-view resident snapshot rules without freezing authoritative roots", () => {
    const { compatibility, view } = residentPublicationFixture();
    const residents = structuredClone(compatibility.residents);
    const expected = residents.map((resident) => createResidentView(resident, compatibility.completedTick));
    const publication = replaceRegionalWorldViewResidents(view, residents);
    expect(publication.residents).toEqual(expected);
    expect(publication.residents.map(Object.keys)).toEqual(expected.map(Object.keys));
    expect(publication.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    for (const [index, source] of residents.entries()) {
      expect(Object.isFrozen(source)).toBe(false);
      expect(Object.isFrozen(source.needs)).toBe(false);
      expect(publication.residents[index]?.perception).not.toBe(source.perception);
      expect(publication.residents[index]?.relationships).not.toBe(source.relationships);
    }
  });

  it("rejects malformed perception and present optional roots through the same full-view validators", () => {
    const { view } = residentPublicationFixture();
    const before = structuredClone(view.residents);
    for (const field of ["perception", "circadian", "activity"] as const) {
      const residents = structuredClone(view.residents);
      Object.assign(residents.at(-1)!, { [field]: null });
      expect(() => replaceRegionalWorldViewResidents(view, residents)).toThrow(/malformed/);
      expect(view.residents).toEqual(before);
    }
  });

  it("does not confer publication trust on mutable views, caller copies or ordinary full publications", () => {
    const { compatibility, window, chart, view } = residentPublicationFixture();
    const mutable = createRegionalWorldView(compatibility, window, chart);
    const copied = Object.freeze({ ...view });
    for (const unregistered of [compatibility, mutable, copied]) {
      expect(() => replaceRegionalWorldViewResidents(unregistered, view.residents))
        .toThrow(/registered immutable regional view/);
      expect(regionalWorldViewPhysicalPublication(unregistered)).toBe(unregistered);
      expect(isImmutableRegionalWorldView(unregistered)).toBe(false);
    }
    const nextWorld = createRegionalWorldView(
      { ...compatibility, completedTick: compatibility.completedTick + 1 }, window, chart, { immutable: true },
    );
    expect(regionalWorldViewPhysicalPublication(nextWorld)).toBe(nextWorld);
    expect(regionalWorldViewPhysicalPublication(nextWorld)).not.toBe(view);
  });
});
