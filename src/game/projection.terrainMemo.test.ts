import { describe, expect, it, vi } from "vitest";

import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  type WorldView,
} from "../sim/public";
import { TILE_UNITS, createPlayer, type PlayerState } from "./player";
import * as perceptionOwner from "./perception";
import { projectGameView, projectPerception } from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import {
  createRegionalWorldView,
  regionalCompatibilityWorldForWorld,
  regionalWindowForWorld,
  regionalWorldViewPhysicalPublication,
  replaceRegionalWorldViewResidents,
} from "./regionalWorldView";
import { adoptResidentActivities } from "./residentActivityExecution";

interface ProjectionFixture {
  readonly world: WorldView;
  readonly mutableWorld: WorldView;
  readonly player: PlayerState;
}

function createFixture(seed = "the chart remembers only what was seen", currentBodies = false): ProjectionFixture {
  const state = createWorld(seed, "standard");
  if (currentBodies && !adoptResidentActivities(state)) throw new Error("Native body adoption failed");
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

function uncachedProjection(world: WorldView, player: PlayerState) {
  // Mutable regional views still need their real signed-window metadata; a
  // spread copy is not a valid 120x120 legacy compatibility world.
  const mutable = createRegionalWorldView(regionalCompatibilityWorldForWorld(world)!,
    regionalWindowForWorld(world)!, { discovered: player.discovered, depthSoundings: player.depthSoundings });
  return projectGameView(mutable, player);
}

describe("terrain projection receipt", () => {
  it.each([false, true])("characterizes current-reference selection and distinct-clone validation with sleeping=%s", (sleeping) => {
    const { world, player } = createFixture("a current selection is not a new admission", true);
    const session = createSessionState(world.seedText);
    const current = projectPerception(world, player);
    const clone = structuredClone(current);
    const options = { suppressDetailPerception: sleeping };
    const render = (perception: typeof current) => projectGameView(world, player, { ...options, perception });
    const ui = (perception: typeof current) => projectUIView(world, player, session, { ...options, perception });
    // Warm each existing cache before counting the candidate selection, not
    // unrelated first-use terrain/light preparation or global validations.
    const renderExpected = render(clone);
    const uiExpected = ui(clone);
    const signature = vi.spyOn(perceptionOwner, "hasValidPerceptionSignature");
    try {
      for (const [project, expected] of [[render, renderExpected], [ui, uiExpected]] as const) {
        signature.mockClear();
        expect(project(current)).toEqual(expected);
        const currentChecks = signature.mock.calls.length;
        signature.mockClear();
        expect(project(clone)).toEqual(expected);
        const cloneChecks = signature.mock.calls.length;
        signature.mockClear();
        expect(project(current)).toEqual(expected);
        expect(signature.mock.calls.length).toBe(currentChecks);
        expect(currentChecks).toBeGreaterThan(0);
        // The current owner still validates its cache. Only distinct candidate
        // admission pays one additional signature check at each selector.
        expect(cloneChecks).toBe(currentChecks + 1);
      }
      expect(projectGameView(world, player, options)).toEqual(renderExpected);
    } finally { signature.mockRestore(); }
  });

  it("preserves forged, stale, mutated-cache and cold supplied-perception fallback", () => {
    const { world, player } = createFixture("selection cannot authenticate a stale mask", true);
    const session = createSessionState(world.seedText);
    const current = projectPerception(world, player);
    const forged = structuredClone(current);
    forged.detailVisibilityGrades.fill(2);
    expect(projectGameView(world, player, { perception: forged })).toEqual(projectGameView(world, player));
    expect(projectUIView(world, player, session, { perception: forged }))
      .toEqual(projectUIView(world, player, session, { perception: current }));
    player.facingMilliRadians += 1_571;
    const turned = projectPerception(world, player);
    expect(turned).not.toBe(current);
    expect(projectGameView(world, player, { perception: current })).toEqual(projectGameView(world, player));
    expect(projectUIView(world, player, session, { perception: current }))
      .toEqual(projectUIView(world, player, session, { perception: turned }));
    // Typed masks remain caller-mutable. The real current owner must detect
    // poisoned cache bytes before identity can select its repaired result.
    turned.detailVisibilityGrades.fill(2);
    const repaired = projectPerception(world, player);
    expect(repaired).not.toBe(turned);
    expect(projectGameView(world, player, { perception: turned })).toEqual(projectGameView(world, player));
    const cold = structuredClone(repaired);
    expect(projectGameView(world, player, { perception: cold }))
      .toEqual(projectGameView(world, player, { perception: repaired }));
    expect(projectUIView(world, player, session, { perception: cold }))
      .toEqual(projectUIView(world, player, session, { perception: repaired }));
  });

  it("reuses only unchanged terrain across resident-only physical-publication siblings", () => {
    const { world, player } = createFixture("resident publication does not redraw the same terrain", true);
    const first = projectGameView(world, player);
    const visible = first.porters.find(porter => porter.quickLabel !== undefined);
    if (visible === undefined) throw new Error("Fixture needs one directly visible resident");
    expect(visible.conditionLabels).not.toContain("Soaked");
    const residents = structuredClone(world.residents);
    residents[0]!.needs.rest = 800_000;
    // A projection contrast, not an invented gameplay wetting event.
    residents.find(resident => String(resident.id) === visible.id)!.condition.wetness = FIXED_POINT;
    const sibling = replaceRegionalWorldViewResidents(world, residents);
    const secondSibling = replaceRegionalWorldViewResidents(sibling, sibling.residents);
    const before = structuredClone(secondSibling);

    for (const publication of [sibling, secondSibling]) {
      expect(regionalWorldViewPhysicalPublication(publication)).toBe(world);
      expect(publication.residents[0]?.activity).toEqual(world.residents[0]?.activity);
      expect(publication.residents[0]?.needs.rest).toBe(800_000);
      const current = projectGameView(publication, player);
      const uncached = uncachedProjection(publication, player);
      expect(current).not.toBe(first);
      expect(current.porters).not.toBe(first.porters);
      expect(current.porters.find(porter => porter.id === visible.id)?.conditionLabels).toContain("Soaked");
      expect(current.terrain.tiles).toBe(first.terrain.tiles);
      expect(current).toEqual(uncached);
      expect(uncached.terrain.tiles).not.toBe(current.terrain.tiles);
    }
    expect(secondSibling).toEqual(before);
  });

  it("retains exact knowledge and perception invalidation across resident siblings", () => {
    const { world, player } = createFixture("resident publication cannot preserve stale knowledge", true);
    const sibling = replaceRegionalWorldViewResidents(world, world.residents);
    let previous = projectGameView(world, player);
    const tileIndex = Math.floor(world.terrain.tiles.length / 2) + 1;
    const changes = [
      () => { player.discovered[tileIndex] = player.discovered[tileIndex] === 0 ? FIXED_POINT : 0; },
      () => { player.depthSoundings[tileIndex] = player.depthSoundings[tileIndex] === 0 ? FIXED_POINT : 0; },
      () => { player.facingMilliRadians += 1_571; },
    ];
    for (const change of changes) {
      change();
      const current = projectGameView(sibling, player);
      expect(current.terrain.tiles).not.toBe(previous.terrain.tiles);
      expect(current).toEqual(uncachedProjection(sibling, player));
      previous = current;
    }
    const sleeping = projectGameView(sibling, player, { suppressDetailPerception: true });
    expect(sleeping.terrain.tiles).not.toBe(previous.terrain.tiles);
    expect(sleeping.terrain.tiles.every(tile => tile.currentDetailVisibility === 0)).toBe(true);
  });

  it("does not extend resident-only reuse into a new physical publication or caller copy", () => {
    const { world, player } = createFixture("changed weather owns a new physical publication", true);
    const sibling = replaceRegionalWorldViewResidents(world, world.residents);
    const first = projectGameView(sibling, player);
    const window = regionalWindowForWorld(sibling)!;
    const compatibility = regionalCompatibilityWorldForWorld(sibling)!;
    const changed = createRegionalWorldView({
      ...compatibility,
      weather: { ...compatibility.weather, kind: "storm", intensity: FIXED_POINT },
    }, window, { discovered: player.discovered, depthSoundings: player.depthSoundings }, { immutable: true });
    expect(regionalWorldViewPhysicalPublication(changed)).toBe(changed);
    const storm = projectGameView(changed, player);
    expect(storm.terrain.tiles).not.toBe(first.terrain.tiles);
    expect(storm).toEqual(uncachedProjection(changed, player));
    const copied = { ...sibling };
    expect(regionalWorldViewPhysicalPublication(copied)).toBe(copied);
    expect(() => projectGameView(copied, player)).toThrow(/Local tile/);
    const mutable = createRegionalWorldView(compatibility, window,
      { discovered: player.discovered, depthSoundings: player.depthSoundings });
    const uncachedFirst = projectGameView(mutable, player);
    expect(uncachedFirst.terrain.tiles).not.toBe(first.terrain.tiles);
    expect(projectGameView(mutable, player).terrain.tiles).not.toBe(uncachedFirst.terrain.tiles);
  });

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
