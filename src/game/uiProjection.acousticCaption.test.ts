import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { TILE_UNITS, createPlayer } from "./player";
import { createSessionState } from "./sessionTypes";
import {
  SITUATED_EXPRESSION_VERSION,
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
} from "./situatedExpression";
import { createSelfSituatedExpressionReception } from "./situatedExpressionReception";
import { projectUIView } from "./uiProjection";
import {
  createHeardUnseenWorldAcousticReception,
  createSelfWorldAcousticReception,
} from "./worldAcousticPresentation";
import {
  createWorldAcousticEvent,
  type WorldAcousticEvent,
} from "./worldAcoustics";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

function fixture() {
  const state = createWorld("acoustic caption arbitration", "standard");
  const compatibility = createWorldView(state);
  const stream = createTerrainRegionStreamingState({
    rootSeed: state.meta.rootSeed,
    center: createRegionCoord(0, 0),
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
  const tileIndex = 60 * world.terrain.width + 60;
  player.currentTrace = [tileIndex];
  player.surveyTrace = [tileIndex];
  player.sweepPath = [];
  const address = window.addresses[tileIndex];
  if (address === undefined) throw new Error("acoustic fixture left the regional window");
  const sourcePosition = createWorldPosition(
    address.region,
    address.localX * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    address.localY * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
  );
  return {
    compatibility,
    player,
    session: createSessionState(world.seedText),
    sourcePosition,
    world,
  };
}

function acousticEvent(
  sourcePosition: WorldPosition,
  priority: number,
  salience: number,
  triggerEventId = `physical:${priority}:${salience}`,
): WorldAcousticEvent {
  const event = createWorldAcousticEvent({
    triggerEventId,
    domain: "traversal",
    sourceId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    sourceCategory: "human",
    sourcePosition,
    occurredAtTick: 0,
    action: "slide",
    sourceMaterial: "body",
    surfaceMaterial: "stone",
    semanticFamily: "scrape",
    intensity: 720_000,
    rangeUnits: 18_000,
    durationSteps: 8,
    priority,
    salience,
    repetitionKey: "player:slide:stone",
    textualEligibility: "salience-gated",
    accessibilityRelevance: "informative",
    variantSeed: 0x51de,
  });
  if (event === null) throw new Error("acoustic event fixture was rejected");
  return event;
}

function expression(
  sourcePosition: WorldPosition,
  priority: number,
  salience: number,
  warning = false,
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = warning
    ? {
        version: SITUATED_EXPRESSION_VERSION,
        sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
        triggerEventId: `warning:${priority}:${salience}`,
        position: sourcePosition,
        meaning: "human-danger-warning",
        family: "warning",
        tone: "alarmed",
        volume: "shout",
        knowledgeBasis: "self-perceived-threat",
        priority,
        salience,
        variantSeed: 0xa11,
        durationSteps: 6,
      }
    : {
        version: SITUATED_EXPRESSION_VERSION,
        sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
        triggerEventId: `mutter:${priority}:${salience}`,
        position: sourcePosition,
        meaning: "protect-important-cargo",
        family: "cargo",
        tone: "restrained",
        volume: "murmur",
        knowledgeBasis: "self-observed-cargo-risk",
        priority,
        salience,
        variantSeed: 0xfeed,
        durationSteps: 6,
      };
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.event === null) {
    throw new Error(`expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.event;
}

describe("UI acoustic-caption arbitration", () => {
  it("projects one visible physical semantic without exposing source identity or position", () => {
    const context = fixture();
    const event = acousticEvent(context.sourcePosition, 520_000, 740_000);
    const reception = createSelfWorldAcousticReception(event);
    if (reception === null) throw new Error("self acoustic reception was rejected");

    const first = projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      worldAcousticEvent: event,
      worldAcousticRemainingSteps: 5,
      worldAcousticReception: reception,
    });
    const second = projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      worldAcousticEvent: event,
      worldAcousticRemainingSteps: 4,
      worldAcousticReception: reception,
    });

    expect(first.expressionCaption).toMatchObject({
      id: event.eventId,
      speakerLabel: "Sound",
      presentationKind: "physical",
      physicalSoundKind: "scrape",
      tone: "restrained",
      assertive: false,
    });
    expect(["scrape", "scritch"]).toContain(first.expressionCaption?.text);
    expect(first.expressionCaption).not.toHaveProperty("sourceId");
    expect(first.expressionCaption).not.toHaveProperty("position");
    expect(JSON.stringify(first.expressionCaption)).not.toContain(
      LOCAL_PLAYER_LIVING_ACTOR_ID,
    );
    expect(String(first.revision)).toContain(event.eventId);
    expect(first.revision).not.toBe(second.revision);
  });

  it("presents heard-unseen physical sound only through its coarse directional receipt", () => {
    const context = fixture();
    const event = acousticEvent(context.sourcePosition, 520_000, 740_000);

    expect(projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      worldAcousticEvent: event,
      worldAcousticRemainingSteps: 5,
      worldAcousticReception: createHeardUnseenWorldAcousticReception(event, {
        bearing: { centerRadians: 0.05, uncertaintyRadians: 0.1 },
        distanceBand: { minimum: 2_000, maximum: 8_000 },
        certainty: 0.72,
      }),
    }).expressionCaption).toMatchObject({
      id: event.eventId,
      speakerLabel: "Sound",
      presentationKind: "physical",
      physicalSoundKind: "scrape",
      directionLabel: "east",
    });
  });

  it("keeps a critical warning over a more salient but lower-priority scrape", () => {
    const context = fixture();
    const warning = expression(context.sourcePosition, 900_000, 700_000, true);
    const warningReception = createSelfSituatedExpressionReception(warning, 0);
    const scrape = acousticEvent(context.sourcePosition, 899_999, 1_000_000);
    const scrapeReception = createSelfWorldAcousticReception(scrape);
    if (warningReception === null || scrapeReception === null) {
      throw new Error("caption arbitration reception was rejected");
    }

    expect(projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      situatedExpression: warning,
      situatedExpressionReception: warningReception,
      worldAcousticEvent: scrape,
      worldAcousticRemainingSteps: 5,
      worldAcousticReception: scrapeReception,
    }).expressionCaption).toMatchObject({
      id: warning.eventId,
      presentationKind: "speech",
      speakerLabel: "You",
      tone: "alarmed",
    });
  });

  it("lets a more salient scrape replace routine muttering at equal priority", () => {
    const context = fixture();
    const mutter = expression(context.sourcePosition, 520_000, 300_000);
    const mutterReception = createSelfSituatedExpressionReception(mutter, 0);
    const scrape = acousticEvent(context.sourcePosition, 520_000, 800_000);
    const scrapeReception = createSelfWorldAcousticReception(scrape);
    if (mutterReception === null || scrapeReception === null) {
      throw new Error("caption arbitration reception was rejected");
    }

    expect(projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      situatedExpression: mutter,
      situatedExpressionReception: mutterReception,
      worldAcousticEvent: scrape,
      worldAcousticRemainingSteps: 5,
      worldAcousticReception: scrapeReception,
    }).expressionCaption).toMatchObject({
      id: scrape.eventId,
      presentationKind: "physical",
      physicalSoundKind: "scrape",
    });
  });

  it("breaks equal priority and salience by stable event ID", () => {
    const context = fixture();
    const mutter = expression(context.sourcePosition, 700_000, 700_000);
    const mutterReception = createSelfSituatedExpressionReception(mutter, 0);
    const scrape = acousticEvent(context.sourcePosition, 700_000, 700_000);
    const scrapeReception = createSelfWorldAcousticReception(scrape);
    if (mutterReception === null || scrapeReception === null) {
      throw new Error("caption arbitration reception was rejected");
    }

    const caption = projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      situatedExpression: mutter,
      situatedExpressionReception: mutterReception,
      worldAcousticEvent: scrape,
      worldAcousticRemainingSteps: 5,
      worldAcousticReception: scrapeReception,
    }).expressionCaption;

    expect(caption?.id).toBe([mutter.eventId, scrape.eventId].sort()[0]);
  });
});
