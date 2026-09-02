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
import {
  TRAVERSAL_FEEDBACK_VERSION,
  type TraversalFeedbackState,
  type TraversalIncident,
} from "./traversalFeedback";
import { projectUIView } from "./uiProjection";

function perceptionWithDirectTiles(
  world: WorldView,
  playerIndex: number,
  directTileIndices: readonly number[],
): PerceptionResult {
  const visibilityGrades = new Uint8Array(world.terrain.tiles.length);
  const direct = [...new Set([playerIndex, ...directTileIndices])];
  for (const index of direct) visibilityGrades[index] = VISIBILITY_DIRECT;
  return {
    version: PERCEPTION_VERSION,
    valid: true,
    visibilityGrades,
    visibleTileIndices: direct,
    directTileIndices: direct,
    peripheralTileIndices: [],
    playerTileIndex: playerIndex,
    signature: `observed-events:${direct.join(",")}`,
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
        data: { settlementId: directSettlement.id, parts: 1, traceStrength: 40_000 },
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
    );

    const observedIds = projectUIView(world, player, session, { perception })
      .chronicle.map(({ id }) => id);
    expect(observedIds).toContain("991");
    expect(observedIds).toContain("993");
    expect(observedIds).not.toContain("992");

    // Callers without the new snapshot retain the historical complete ledger.
    const legacyIds = projectUIView(world, player, session).chronicle.map(({ id }) => id);
    expect(legacyIds).toContain("991");
    expect(legacyIds).toContain("992");
    expect(legacyIds).toContain("993");
  });
});
