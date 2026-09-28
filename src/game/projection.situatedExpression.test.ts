import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { TILE_UNITS, createPlayer } from "./player";
import { projectGameView } from "./projection";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  SITUATED_EXPRESSION_VERSION,
  advanceSituatedExpression,
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
} from "./situatedExpression";
import { createWorldPosition } from "./worldPosition";

const SIGNED_REGION = createRegionCoord(-7, -12);

function projectionFixture() {
  const state = createWorld("signed situated expression projection", "standard");
  const compatibility = createWorldView(state);
  const stream = createTerrainRegionStreamingState({
    rootSeed: state.meta.rootSeed,
    center: SIGNED_REGION,
  });
  const window = createRegionalTerrainWindow(state.meta.rootSeed, stream);
  const knowledge = projectRegionalCartographyWindow(
    createRegionalCartography(state.meta.rootSeed),
    window,
  );
  const world = createRegionalWorldView(compatibility, window, knowledge);
  const player = createPlayer(compatibility, compatibility.settlements[0]?.id);
  player.worldWidth = world.terrain.width;
  player.worldHeight = world.terrain.height;
  player.x = 60 * TILE_UNITS + TILE_UNITS / 2;
  player.y = 60 * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
  player.discovered = [...knowledge.discovered];
  player.depthSoundings = [...knowledge.depthSoundings];
  const playerIndex = 60 * player.worldWidth + 60;
  player.currentTrace = [playerIndex];
  player.surveyTrace = [playerIndex];
  player.sweepPath = [];
  return { player, window, world };
}

function canonicalExpression(
  triggerEventId: string,
  position = createWorldPosition(SIGNED_REGION, 25_250, 44_500),
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "player:signed-projection",
    triggerEventId,
    position,
    meaning: "protect-important-cargo",
    family: "cargo",
    tone: "strained",
    volume: "spoken",
    knowledgeBasis: "self-observed-cargo-risk",
    priority: 420_000,
    salience: 540_000,
    variantSeed: 81,
    durationSteps: 8,
  };
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.state === null) {
    throw new Error(`Expression fixture was rejected: ${reduced.reason}`);
  }
  const advanced = advanceSituatedExpression(reduced.state, 3);
  if (advanced === null || advanced.active === null) {
    throw new Error("Expression fixture expired before projection");
  }
  return advanced.active;
}

describe("situated expression game projection", () => {
  it("maps one canonical expression from signed negative regional coordinates", () => {
    const { player, window, world } = projectionFixture();
    const expression = canonicalExpression("projection:signed-window");

    expect(window.origin).toEqual({ x: -684, y: -888 });
    expect(projectGameView(world, player, { situatedExpression: expression }).expressions)
      .toEqual([{
        id: "situated-expression:event:v1:f58416b90699183a",
        sourceActorId: "player:signed-projection",
        sourceKind: "player",
        speakerLabel: "You",
        text: "Keep the load close.",
        position: { x: 894, y: 1_644 },
        progress: 0.375,
        priority: 420_000,
        tone: "strained",
        variantSeed: 81,
      }]);
  });

  it("fails closed when the canonical expression is outside the spatial window", () => {
    const { player, world } = projectionFixture();
    const expression = canonicalExpression(
      "projection:outside-window",
      createWorldPosition(createRegionCoord(-9, -12), 25_250, 44_500),
    );

    expect(projectGameView(world, player, { situatedExpression: expression }).expressions)
      .toEqual([]);
  });
});
