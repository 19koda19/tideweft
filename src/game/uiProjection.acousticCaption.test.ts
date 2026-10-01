import { describe, expect, it } from "vitest";

import { createWorld, createWorldView, stepWorld } from "../sim/public";
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
import {
  createHeardUnseenSituatedExpressionReception,
  createSelfSituatedExpressionReception,
} from "./situatedExpressionReception";
import { residentIntroductionExpressionIntent } from "./residentIntroductionExpression";
import { projectUIView } from "./uiProjection";
import {
  createHeardUnseenWorldAcousticReception,
  createHeardVisibleWorldAcousticReception,
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
    knowledge,
    player,
    session: createSessionState(world.seedText),
    sourcePosition,
    state,
    window,
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

function chorusAcousticEvent(
  sourcePosition: WorldPosition,
  priority: number,
  salience: number,
  triggerEventId = `chorus:${priority}:${salience}`,
): WorldAcousticEvent {
  const event = createWorldAcousticEvent({
    triggerEventId,
    domain: "actor-vocalization",
    sourceId: "aggregate:private-frog-identity",
    sourceCategory: "animal",
    sourcePosition,
    occurredAtTick: 0,
    action: "vocalize",
    sourceMaterial: "body",
    surfaceMaterial: "mixed",
    semanticFamily: "chorus",
    soundClass: "animal-call",
    interrupt: "none",
    intensity: 520_000,
    rangeUnits: 20_000,
    durationSteps: 8,
    priority,
    salience,
    repetitionKey: "aggregate-chorus:anonymous",
    textualEligibility: "salience-gated",
    accessibilityRelevance: "informative",
    variantSeed: 0xc407,
  });
  if (event === null) throw new Error("chorus acoustic event fixture was rejected");
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

  it("presents a heard-unseen aggregate chorus as one anonymous directional animal call", () => {
    const context = fixture();
    const event = chorusAcousticEvent(context.sourcePosition, 520_000, 740_000);
    const caption = projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      worldAcousticEvent: event,
      worldAcousticRemainingSteps: 5,
      worldAcousticReception: createHeardUnseenWorldAcousticReception(event, {
        bearing: { centerRadians: 0.05, uncertaintyRadians: 0.1 },
        distanceBand: { minimum: 2_000, maximum: 8_000 },
        certainty: 0.72,
      }),
    }).expressionCaption;

    expect(caption).toEqual({
      id: event.eventId,
      speakerLabel: "Sound",
      text: "chorus",
      tone: "restrained",
      presentationKind: "animal-call",
      animalCallKind: "chorus",
      directionLabel: "east",
      assertive: false,
    });
    expect(caption).not.toHaveProperty("physicalSoundKind");
    expect(caption).not.toHaveProperty("sourceId");
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toMatch(/frog|aggregate:private/iu);

    expect(projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      worldAcousticEvent: event,
      worldAcousticRemainingSteps: 5,
      worldAcousticReception: createHeardVisibleWorldAcousticReception(event),
    }).expressionCaption).toBeUndefined();
  });

  it("never projects personalized introduction facts through heard-unseen reception", () => {
    const context = fixture();
    const resident = context.state.residents[0];
    if (resident === undefined) throw new Error("introduction caption fixture needs a resident");
    stepWorld(context.state, [{
      id: "observe-introduction-caption-source",
      type: "observe-resident",
      residentId: resident.id,
    }]);
    const observedTick = resident.playerKnowledge.firstObservedTick;
    if (observedTick === null) throw new Error("introduction caption source was not observed");
    stepWorld(context.state, [{
      id: "greet-introduction-caption-source",
      type: "greet-resident",
      residentId: resident.id,
      observedTick,
    }]);
    const trigger = context.state.events.find((event) => (
      event.type === "resident-introduced" && event.subjectId === resident.id
    ));
    const economy = createWorldView(context.state);
    const intent = trigger === undefined
      ? null
      : residentIntroductionExpressionIntent({ world: economy, event: trigger });
    const reduced = intent === null
      ? null
      : reduceSituatedExpression(createSituatedExpressionState(), intent);
    const event = reduced?.event ?? null;
    if (event === null) throw new Error("introduction caption expression was rejected");
    const reception = createHeardUnseenSituatedExpressionReception(
      event,
      context.state.meta.completedTick,
      {
        bearing: { centerRadians: 0.2, uncertaintyRadians: 0.4 },
        distanceBand: { minimum: 2_000, maximum: 12_000 },
        certainty: 0.62,
      },
    );
    if (reception === null) throw new Error("heard-unseen introduction receipt was rejected");
    const world = createRegionalWorldView(economy, context.window, context.knowledge);
    const view = projectUIView(world, context.player, context.session, {
      economyWorld: economy,
      situatedExpression: event,
      situatedExpressionReception: reception,
    });

    expect(view.expressionCaption).toBeUndefined();
    const projectedCaption = JSON.stringify(view.expressionCaption ?? null);
    expect(projectedCaption).not.toContain(resident.name);
    expect(projectedCaption).not.toContain(resident.role);
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

  it("keeps a critical warning over a more salient but lower-priority chorus", () => {
    const context = fixture();
    const warning = expression(context.sourcePosition, 900_000, 700_000, true);
    const warningReception = createSelfSituatedExpressionReception(warning, 0);
    const chorus = chorusAcousticEvent(context.sourcePosition, 899_999, 1_000_000);
    const chorusReception = createHeardUnseenWorldAcousticReception(chorus, {
      bearing: { centerRadians: 0.05, uncertaintyRadians: 0.1 },
      distanceBand: { minimum: 2_000, maximum: 8_000 },
      certainty: 0.72,
    });
    if (warningReception === null || chorusReception === null) {
      throw new Error("caption arbitration reception was rejected");
    }

    expect(projectUIView(context.world, context.player, context.session, {
      economyWorld: context.compatibility,
      situatedExpression: warning,
      situatedExpressionReception: warningReception,
      worldAcousticEvent: chorus,
      worldAcousticRemainingSteps: 5,
      worldAcousticReception: chorusReception,
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
