import { beforeAll, describe, expect, it } from "vitest";

import { FIXED_POINT, createWorld, createWorldView, type WorldView } from "../sim/public";
import { WORLD_WIDTH } from "../sim/types";
import type { RegionCoord } from "../sim/regions";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import {
  createRegionalWorldView,
  regionalTileIndexInView,
} from "./regionalWorldView";
import {
  regionalTideHarpsAt,
  regionalWayknotContextAt,
  regionalWayknotEffectsAt,
  visibleRegionalTideHarps,
} from "./regionalWayknots";
import { TILE_UNITS, createPlayer, tunedTideHarps, wayknotEffectsAt } from "./player";
import { projectGameView } from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import {
  WAYKNOT_LABELS,
  contextualWayknotKind,
  createWayknotState,
  type WayknotKind,
  type WayknotState,
} from "./wayknots";

const SEED = "regional wayknots do not forget where they were tied";

function regionalView(center: RegionCoord): WorldView {
  const compatibility = createWorldView(createWorld(SEED, "wild"));
  const stream = createTerrainRegionStreamingState({
    rootSeed: compatibility.rootSeed!,
    center,
  });
  const window = createRegionalTerrainWindow(compatibility.rootSeed!, stream);
  return createRegionalWorldView(
    compatibility,
    window,
    projectRegionalCartographyWindow(
      createRegionalCartography(compatibility.rootSeed!),
      window,
    ),
  );
}

function deploy(
  deployments: readonly {
    readonly id: number;
    readonly region: RegionCoord;
    readonly tileIndex: number;
  }[],
): WayknotState {
  const state = createWayknotState();
  return {
    ...state,
    wayknots: state.wayknots.map((wayknot) => {
      const placement = deployments.find(({ id }) => id === wayknot.id);
      return placement
        ? {
            ...wayknot,
            region: { ...placement.region },
            tileIndex: placement.tileIndex,
            condition: FIXED_POINT,
            readyTick: 0,
          }
        : wayknot;
    }),
  };
}

function idsForKind(kind: WayknotKind): readonly [number, number] {
  switch (kind) {
    case "reed-mat": return [1, 2];
    case "tide-anchor": return [3, 4];
    case "wind-knot": return [5, 6];
  }
}

function eligibleTile(world: WorldView, region: RegionCoord) {
  for (let viewTileIndex = 0; viewTileIndex < world.terrain.tiles.length; viewTileIndex += 1) {
    const resolved = regionalWayknotContextAt(world, viewTileIndex);
    if (
      resolved
      && resolved.region.x === region.x
      && resolved.region.y === region.y
      && !resolved.context.occupied
      && contextualWayknotKind(resolved.context) !== null
    ) return resolved;
  }
  throw new Error(`No eligible Wayknot ground in region ${region.x},${region.y}`);
}

function placePlayerAt(player: ReturnType<typeof createPlayer>, world: WorldView, tileIndex: number): void {
  const tile = world.terrain.tiles[tileIndex];
  if (!tile) throw new Error("Regional player fixture lost its tile");
  player.x = tile.x * TILE_UNITS + TILE_UNITS / 2;
  player.y = tile.y * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
}

function createRegionalPlayer(world: WorldView): ReturnType<typeof createPlayer> {
  const compatibility = createWorldView(createWorld(SEED, "wild"));
  const player = createPlayer(compatibility);
  player.worldWidth = world.terrain.width;
  player.worldHeight = world.terrain.height;
  player.discovered = Array.from({ length: world.terrain.tiles.length }, () => 0);
  player.depthSoundings = Array.from({ length: world.terrain.tiles.length }, () => 0);
  player.currentTrace = [];
  player.surveyTrace = [];
  player.sweepPath = [];
  return player;
}

describe("regional Wayknot production callers", () => {
  let east: WorldView;
  let negative: WorldView;

  beforeAll(() => {
    east = regionalView({ x: 1, y: 0 });
    negative = regionalView({ x: -4, y: -3 });
  });

  it("applies effects only from the exact signed region even when local indexes collide", () => {
    for (const [world, region, remote] of [
      [east, { x: 1, y: 0 }, { x: 2, y: 0 }],
      [negative, { x: -4, y: -3 }, { x: 4, y: 3 }],
    ] as const) {
      const resolved = eligibleTile(world, region);
      const kind = contextualWayknotKind(resolved.context)!;
      const [localId, remoteId] = idsForKind(kind);
      const state = deploy([
        { id: localId, region, tileIndex: resolved.localTileIndex },
        { id: remoteId, region: remote, tileIndex: resolved.localTileIndex },
      ]);
      const before = JSON.stringify(state);
      const effects = regionalWayknotEffectsAt(
        state,
        world,
        resolved.viewTileIndex,
        world.completedTick,
      );
      expect(effects.influences.map(({ id }) => id)).toEqual([localId]);

      const player = createRegionalPlayer(world);
      player.wayknots = state;
      placePlayerAt(player, world, resolved.viewTileIndex);
      expect(wayknotEffectsAt(player, world, resolved.viewTileIndex).influences.map(({ id }) => id))
        .toEqual([localId]);
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it("maps local markers into Chart space, excludes distant aliases, and keeps UI actions local", () => {
    const region = { x: 1, y: 0 } as const;
    const resolved = eligibleTile(east, region);
    const kind = contextualWayknotKind(resolved.context)!;
    const [localId, remoteId] = idsForKind(kind);
    const local = deploy([{ id: localId, region, tileIndex: resolved.localTileIndex }]);
    const remote = deploy([{
      id: remoteId,
      region: { x: 99, y: -99 },
      tileIndex: resolved.localTileIndex,
    }]);
    const player = createRegionalPlayer(east);
    placePlayerAt(player, east, resolved.viewTileIndex);
    const combined = {
      ...local,
      wayknots: local.wayknots.map((wayknot) => {
        const distant = remote.wayknots.find(({ id }) => id === wayknot.id);
        return distant?.region ? distant : wayknot;
      }),
    };
    player.wayknots = combined;
    const before = JSON.stringify(combined);
    const projected = projectGameView(east, player);
    const tile = east.terrain.tiles[resolved.viewTileIndex]!;
    expect(projected.wayknots).toEqual([expect.objectContaining({
      id: String(localId),
      kind,
      position: {
        x: tile.x * projected.terrain.tileSize + projected.terrain.tileSize / 2,
        y: tile.y * projected.terrain.tileSize + projected.terrain.tileSize / 2,
      },
      active: true,
    })]);

    const session = createSessionState(SEED);
    session.paused = false;
    session.titleVisible = false;
    expect(projectUIView(east, player, session).controls).toMatchObject({
      canWayknot: true,
      wayknotLabel: `Reclaim ${WAYKNOT_LABELS[kind]}`,
    });
    expect(JSON.stringify(combined)).toBe(before);

    player.wayknots = remote;
    const remoteControl = projectUIView(east, player, session).controls;
    expect(remoteControl?.wayknotLabel).not.toMatch(/^Reclaim /u);
    expect(remoteControl?.canWayknot).toBe(true);
  });

  it("derives, activates, and projects Harps within one region but never across a seam", () => {
    const region = { x: -4, y: -3 } as const;
    const reed = 10 * WORLD_WIDTH + 10;
    const anchor = 10 * WORLD_WIDTH + 11;
    const wind = 11 * WORLD_WIDTH + 10;
    const sameRegion = deploy([
      { id: 1, region, tileIndex: reed },
      { id: 3, region, tileIndex: anchor },
      { id: 5, region, tileIndex: wind },
    ]);
    const player = createRegionalPlayer(negative);
    const playerIndex = regionalTileIndexInView(negative, region, reed);
    if (playerIndex === null) throw new Error("Negative-region Harp fixture left the view");
    placePlayerAt(player, negative, playerIndex);
    player.wayknots = sameRegion;
    const before = JSON.stringify(sameRegion);

    expect(regionalTideHarpsAt(sameRegion, negative, playerIndex)).toHaveLength(1);
    expect(tunedTideHarps(player, negative)).toHaveLength(1);
    const projected = projectGameView(negative, player);
    expect(projected.spatialEpoch).toBe("r:-4:-3");
    expect(projected.tideHarps).toHaveLength(1);
    expect(projected.tideHarps[0]).toMatchObject({
      id: "tide-harp:r:-4:-3:r1-a3-w5",
      active: true,
    });

    const split = deploy([
      { id: 1, region, tileIndex: reed },
      { id: 3, region, tileIndex: anchor },
      { id: 5, region: { x: -3, y: -3 }, tileIndex: wind },
    ]);
    player.wayknots = split;
    expect(regionalTideHarpsAt(split, negative, playerIndex)).toEqual([]);
    expect(visibleRegionalTideHarps(split, negative)).toEqual([]);
    expect(projectGameView(negative, player).tideHarps).toEqual([]);
    expect(JSON.stringify(sameRegion)).toBe(before);
  });
});
