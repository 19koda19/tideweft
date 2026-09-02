import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import type { SimEvent, WorldView } from "../sim/types";
import {
  PERCEPTION_VERSION,
  VISIBILITY_DIRECT,
  type PerceptionResult,
} from "./perception";
import { TILE_UNITS, createPlayer, playerTileIndex } from "./player";
import { createSessionState } from "./sessionTypes";
import { projectPerception } from "./projection";
import {
  TRAVERSAL_FEEDBACK_VERSION,
  type TraversalFeedbackState,
  type TraversalIncident,
} from "./traversalFeedback";
import { eventIsDirectlyObservableAtLocus, projectUIView } from "./uiProjection";

function perceptionWithDirectTiles(
  world: WorldView,
  playerIndex: number,
  directTileIndices: readonly number[],
  terrainOnlyDirectTileIndices: readonly number[] = [],
): PerceptionResult {
  const visibilityGrades = new Uint8Array(world.terrain.tiles.length);
  const terrainVisibilityStrengths = new Uint8Array(world.terrain.tiles.length);
  const detailVisibilityGrades = new Uint8Array(world.terrain.tiles.length);
  const direct = [...new Set([playerIndex, ...directTileIndices])];
  for (const index of direct) {
    visibilityGrades[index] = VISIBILITY_DIRECT;
    terrainVisibilityStrengths[index] = 255;
    detailVisibilityGrades[index] = VISIBILITY_DIRECT;
  }
  for (const index of terrainOnlyDirectTileIndices) {
    visibilityGrades[index] = VISIBILITY_DIRECT;
    terrainVisibilityStrengths[index] = 255;
  }
  const terrainDirect = [...new Set([...direct, ...terrainOnlyDirectTileIndices])];
  return {
    version: PERCEPTION_VERSION,
    valid: true,
    visibilityGrades,
    terrainVisibilityStrengths,
    detailVisibilityGrades,
    visibleTileIndices: terrainDirect,
    directTileIndices: terrainDirect,
    peripheralTileIndices: [],
    detailVisibleTileIndices: direct,
    detailDirectTileIndices: direct,
    detailPeripheralTileIndices: [],
    playerTileIndex: playerIndex,
    signature: projectPerception(world, {
      ...createPlayer(world),
      x: world.terrain.tiles[playerIndex]!.x * TILE_UNITS + TILE_UNITS / 2,
      y: world.terrain.tiles[playerIndex]!.y * TILE_UNITS + TILE_UNITS / 2,
    }).signature,
  };
}

function traversalFeedbackFor(incident: TraversalIncident): TraversalFeedbackState {
  return {
    version: TRAVERSAL_FEEDBACK_VERSION,
    completedSteps: 0,
    nextTraversalOrdinal: incident.traversalOrdinal + 1,
    incident,
    lastAudibleIncidentId: incident.id,
  };
}

describe("observed event projection", () => {
  it("rejects a forged remote-detail snapshot before opening a live inspector", () => {
    const world = createWorldView(createWorld("a remembered harbor is not live telemetry"));
    const player = createPlayer(world);
    const playerIndex = playerTileIndex(player);
    const playerTile = world.terrain.tiles[playerIndex];
    if (!playerTile) throw new Error("fixture needs a player tile");
    const remote = world.settlements
      .filter((settlement) => settlement.tileIndex !== playerIndex)
      .sort((left, right) => {
        const leftTile = world.terrain.tiles[left.tileIndex]!;
        const rightTile = world.terrain.tiles[right.tileIndex]!;
        return Math.hypot(rightTile.x - playerTile.x, rightTile.y - playerTile.y)
          - Math.hypot(leftTile.x - playerTile.x, leftTile.y - playerTile.y);
      })[0];
    if (!remote) throw new Error("fixture needs a remote settlement");
    player.discovered[remote.tileIndex] = 1_000_000;
    const session = createSessionState(world.seedText);
    session.selectedSettlementId = remote.id;
    const forged = {
      ...perceptionWithDirectTiles(world, playerIndex, [remote.tileIndex]),
      signature: "forged-stale-sight",
    };

    expect(projectUIView(world, player, session, { perception: forged }).selectedSettlement)
      .toBeUndefined();
  });

  it("moves the full player-caused traversal explanation into one event-feed entry", () => {
    const world = createWorldView(createWorld("observed traversal event feed"));
    const player = createPlayer(world);
    const session = createSessionState(world.seedText);
    session.tutorial.dismissed = true;
    const incident: TraversalIncident = {
      id: "player:0:traversal:0",
      actorId: 0,
      traversalOrdinal: 0,
      kind: "sweep",
      primaryCause: "strong-current",
      label: "WHHSH! · cross-current / lost balance",
      detail: "Cargo can separate; regain your feet before moving.",
      position: { x: player.x, y: player.y },
      remainingSteps: 24,
      totalSteps: 24,
      variantSeed: 17,
      cue: "sweep",
    };
    session.announcement = {
      id: 41,
      message: `${incident.label} — ${incident.detail}`,
      assertive: true,
    };
    const perception = perceptionWithDirectTiles(
      world,
      playerTileIndex(player),
      [],
    );

    const view = projectUIView(world, player, session, {
      perception,
      traversalFeedback: traversalFeedbackFor(incident),
    });
    const entry = view.chronicle.find(({ id }) => id === "system-41");

    expect(entry).toMatchObject({
      title: "Cross Current / Lost Balance",
      detail: "Cargo can separate; regain your feet before moving.",
      kind: "weather",
    });
    expect(view.chronicle.filter(({ id }) => id.includes("player:0:traversal:0")))
      .toHaveLength(0);
  });

  it("includes directly seen and player-caused events but excludes a remote null-subject event", () => {
    const base = createWorldView(createWorld("observed world event filtering"));
    const [directSettlement, remoteSettlement] = base.settlements;
    if (!directSettlement || !remoteSettlement) throw new Error("fixture needs two settlements");
    const player = createPlayer(base);
    player.x = base.terrain.tiles[directSettlement.tileIndex]!.x * TILE_UNITS + TILE_UNITS / 2;
    player.y = base.terrain.tiles[directSettlement.tileIndex]!.y * TILE_UNITS + TILE_UNITS / 2;
    const session = createSessionState(base.seedText);
    session.tutorial.dismissed = true;
    const additions: readonly SimEvent[] = [
      {
        tick: 12,
        sequence: 991,
        type: "route-reinforced",
        subjectId: null,
        data: {
          settlementId: directSettlement.id,
          parts: 1,
          traceStrength: 40_000,
          playerObserved: true,
        },
      },
      {
        tick: 13,
        sequence: 992,
        type: "route-reinforced",
        subjectId: null,
        data: { settlementId: remoteSettlement.id, parts: 1, traceStrength: 40_000 },
      },
      {
        tick: 14,
        sequence: 993,
        type: "command-rejected",
        subjectId: null,
        data: { commandId: "player-observed-event-test", reason: "the parcel stayed put" },
      },
      {
        tick: 14,
        sequence: 994,
        type: "contract-accepted",
        subjectId: null,
        data: {
          originSettlementId: remoteSettlement.id,
          destinationSettlementId: directSettlement.id,
          carrier: "porter",
        },
      },
      {
        tick: 14,
        sequence: 995,
        type: "contract-accepted",
        subjectId: null,
        data: {
          originSettlementId: directSettlement.id,
          destinationSettlementId: remoteSettlement.id,
          carrier: "porter",
          playerObserved: true,
        },
      },
    ];
    const world: WorldView = {
      ...base,
      completedTick: 15,
      events: [...base.events, ...additions],
    };
    const perception = perceptionWithDirectTiles(
      world,
      playerTileIndex(player),
      [directSettlement.tileIndex],
      [remoteSettlement.tileIndex],
    );

    expect(eventIsDirectlyObservableAtLocus(additions[0]!, base, world, perception)).toBe(true);
    expect(eventIsDirectlyObservableAtLocus(additions[1]!, base, world, perception)).toBe(false);

    const observedIds = projectUIView(world, player, session, { perception })
      .chronicle.map(({ id }) => id);
    expect(observedIds).toContain("991");
    expect(observedIds).toContain("993");
    expect(observedIds).toContain("995");
    expect(observedIds).not.toContain("992");
    expect(observedIds).not.toContain("994");

    // Callers without the new snapshot retain the historical complete ledger.
    const legacyIds = projectUIView(world, player, session).chronicle.map(({ id }) => id);
    expect(legacyIds).toContain("991");
    expect(legacyIds).toContain("992");
    expect(legacyIds).toContain("993");
  });

  it("evaluates porter history at the event locus rather than the porter's later position", () => {
    const state = createWorld("history stays where it happened");
    const initial = createWorldView(state);
    const player = createPlayer(initial);
    const directIndex = playerTileIndex(player);
    const directTile = initial.terrain.tiles[directIndex];
    const remoteIndex = initial.terrain.tiles.findIndex((tile) =>
      directTile !== undefined && Math.hypot(tile.x - directTile.x, tile.y - directTile.y) > 20
    );
    const route = state.routes[0];
    const resident = state.residents[0];
    if (!route || !resident || remoteIndex < 0) throw new Error("fixture needs a remote route point");
    route.path = [directIndex, remoteIndex];
    resident.location = { kind: "route", routeId: route.id, progress: 0 };
    const world = createWorldView(state);
    const perception = perceptionWithDirectTiles(world, directIndex, [directIndex]);

    const happenedRemotely: SimEvent = {
      tick: 4,
      sequence: 1_001,
      type: "resident-sheltered",
      subjectId: resident.id,
      data: { eventRouteId: route.id, eventRouteProgress: 1_000_000 },
    };
    const happenedHere: SimEvent = {
      ...happenedRemotely,
      sequence: 1_002,
      data: { eventRouteId: route.id, eventRouteProgress: 0 },
    };

    expect(eventIsDirectlyObservableAtLocus(happenedRemotely, world, world, perception))
      .toBe(false);
    resident.location = { kind: "route", routeId: route.id, progress: 1_000_000 };
    const movedWorld = createWorldView(state);
    expect(eventIsDirectlyObservableAtLocus(happenedHere, movedWorld, movedWorld, perception))
      .toBe(true);
  });
});
