import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import type { ResidentState } from "../sim/types";
import { TILE_UNITS, createPlayer } from "./player";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  projectGameView,
  projectPerception,
  projectResidentWorldPosition,
  type CoreWildlifeExpressionSource,
} from "./projection";
import { DEFAULT_PERCEPTION_RANGES, VISIBILITY_DIRECT } from "./perception";
import {
  appendDogActorMemory,
  createDogActorState,
  learnDogPlayerKnowledge,
  type DogActorState,
} from "./dogActor";
import { createDogActorRoster } from "./dogActorRoster";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView, regionalWindowForWorld } from "./regionalWorldView";
import {
  SITUATED_EXPRESSION_VERSION,
  advanceSituatedExpression,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
} from "./situatedExpression";
import {
  createHeardUnseenSituatedExpressionReception,
  createHeardVisibleSituatedExpressionReception,
  createSelfSituatedExpressionReception,
  type SituatedExpressionReception,
} from "./situatedExpressionReception";
import {
  createDirectContactWorldAcousticReception,
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
  worldPositionToGlobalFixed,
} from "./worldPosition";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import { MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY } from "./coreWildlifeSignalExpression";
import { situatedExpressionSoundInterrupt } from "./situatedExpressionAcoustics";
import {
  createPlayerAnimalCallKnowledge,
  rememberPlayerAnimalCall,
} from "./playerAnimalCallKnowledge";
import {
  situatedExpressionCaptionCopy,
  situatedExpressionCaptionVisibleText,
} from "../ui/situatedExpressionCaption";

const SIGNED_REGION = createRegionCoord(-7, -12);
const COMPATIBILITY_REGION = createRegionCoord(0, 0);

function projectionFixture(center = SIGNED_REGION) {
  const state = createWorld("signed situated expression projection", "standard");
  const compatibility = createWorldView(state);
  const stream = createTerrainRegionStreamingState({
    rootSeed: state.meta.rootSeed,
    center,
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
  return { compatibility, player, window, world };
}

function canonicalExpression(
  triggerEventId: string,
  position = createWorldPosition(SIGNED_REGION, 25_250, 44_500),
  sourceActorId: string = LOCAL_PLAYER_LIVING_ACTOR_ID,
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
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

function canonicalResidentWeatherHoldExpression(
  sourceActorId: string,
  position = createWorldPosition(SIGNED_REGION, 25_250, 44_500),
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId: `sim-event:resident-sheltered:42:${sourceActorId}`,
    position,
    meaning: "resident-weather-hold",
    family: "condition",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-weather-distress",
    priority: 300_000,
    salience: 520_000,
    variantSeed: 42,
    durationSteps: 12,
  };
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Weather-hold expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalPhysicalAcousticEvent(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId = "traversal:projection:physical",
  sourceId: string = LOCAL_PLAYER_LIVING_ACTOR_ID,
): WorldAcousticEvent {
  const event = createWorldAcousticEvent({
    triggerEventId,
    domain: "traversal",
    sourceId,
    sourceCategory: sourceId === LOCAL_PLAYER_LIVING_ACTOR_ID ? "human" : "object",
    sourcePosition: position,
    occurredAtTick: 42,
    action: "slide",
    sourceMaterial: sourceId === LOCAL_PLAYER_LIVING_ACTOR_ID ? "body" : "cargo",
    surfaceMaterial: "stone",
    semanticFamily: "scrape",
    intensity: 520_000,
    rangeUnits: 18_000,
    durationSteps: 6,
    priority: 540_000,
    salience: 680_000,
    repetitionKey: `physical-scrape:${sourceId}`,
    textualEligibility: "salience-gated",
    accessibilityRelevance: "informative",
    variantSeed: 0xa11,
  });
  if (event === null) throw new Error("Physical acoustic projection fixture was rejected");
  return event;
}

function canonicalDogWarning(
  dog: DogActorState,
  triggerEventId: string,
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    position: dog.address.position,
    meaning: "guardian-dog-warning",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-heard-anonymous-alarm",
    priority: 760_000,
    salience: 820_000,
    variantSeed: 0xd06,
    durationSteps: 8,
  };
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Dog warning expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalDogDefensiveGrowl(
  dog: DogActorState,
  triggerEventId: string,
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    position: dog.address.position,
    meaning: "guardian-dog-defensive-growl",
    family: "animal-signal",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-perceived-threat",
    priority: 780_000,
    salience: 780_000,
    variantSeed: 0xd06,
    durationSteps: 8,
  };
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Dog growl expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalDogShelterWhine(
  dog: DogActorState,
  triggerEventId: string,
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: dog.identity.stableId,
    triggerEventId,
    position: dog.address.position,
    meaning: "guardian-dog-shelter-whine",
    family: "animal-signal",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-weather-distress",
    priority: 700_000,
    salience: 680_000,
    variantSeed: 0xd06,
    durationSteps: 8,
  };
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Dog whine expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalFishCrowAlarm(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId = "CROW-living-voice-projection",
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "fish-crow-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 820_000,
    variantSeed: 0xc4a,
    durationSteps: 6,
  };
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Fish-crow expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalDeerAlarm(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId = "DEER-living-voice-projection",
): SituatedExpressionEvent {
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "deer-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 820_000,
    variantSeed: 0xd33,
    durationSteps: 6,
  });
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Deer expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalGullAlarm(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId = "GULL-living-voice-projection",
): SituatedExpressionEvent {
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "gull-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 820_000,
    variantSeed: 0x6a11,
    durationSteps: 6,
  });
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Gull expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalElkAlarm(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId = "ELK-living-voice-projection",
): SituatedExpressionEvent {
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "elk-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 820_000,
    variantSeed: 0xe1a,
    durationSteps: 6,
  });
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Elk expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalBoarAlarm(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId = "BOAR-living-voice-projection",
): SituatedExpressionEvent {
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "wild-boar-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 820_000,
    variantSeed: 0xb0a,
    durationSteps: 6,
  });
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Boar expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalMarshRabbitAlarm(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId = "RABBIT-living-voice-projection",
): SituatedExpressionEvent {
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "marsh-rabbit-alarm-thump",
    family: "animal-signal",
    tone: "alarmed",
    volume: "murmur",
    knowledgeBasis: "self-perceived-threat",
    priority: MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY,
    salience: 760_000,
    variantSeed: 0xab17,
    durationSteps: 6,
  });
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Marsh-rabbit expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalDomesticCatRainDistress(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId = "CAT-living-voice-projection",
): SituatedExpressionEvent {
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "domestic-cat-rain-distress-call",
    family: "animal-signal",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-weather-distress",
    priority: 300_000,
    salience: 520_000,
    variantSeed: 0xca7,
    durationSteps: 6,
  });
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Domestic-cat expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalMarshFoxPursuitYip(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId = "FOX-living-voice-projection",
): SituatedExpressionEvent {
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "marsh-fox-pursuit-yip",
    family: "animal-signal",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-perceived-prey",
    priority: 340_000,
    salience: 590_000,
    variantSeed: 0xf09,
    durationSteps: 6,
  });
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Marsh-fox expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function canonicalHumanDangerWarning(
  position: ReturnType<typeof createWorldPosition>,
  triggerEventId: string,
  sourceActorId: string,
): SituatedExpressionEvent {
  const intent: SituatedExpressionIntent = {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position,
    meaning: "human-danger-warning",
    family: "warning",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 900_000,
    salience: 820_000,
    variantSeed: 0xcafe,
    durationSteps: 6,
  };
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.state?.active === null || reduced.state === null) {
    throw new Error(`Human warning expression fixture was rejected: ${reduced.reason}`);
  }
  return reduced.state.active;
}

function wildlifePositionInWindow(
  window: ReturnType<typeof createRegionalTerrainWindow>,
  tileX = 18,
  tileY = 22,
): ReturnType<typeof createWorldPosition> {
  const address = window.addresses[tileY * window.terrain.width + tileX];
  if (address === undefined) throw new Error("Wildlife projection fixture left the window");
  return createWorldPosition(
    address.region,
    address.localX * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    address.localY * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
  );
}

function fishCrowSource(
  event: SituatedExpressionEvent,
): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "fish-crow",
    position: event.position,
  });
}

function deerSource(event: SituatedExpressionEvent): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "deer",
    position: event.position,
  });
}

function gullSource(event: SituatedExpressionEvent): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "gull",
    position: event.position,
  });
}

function elkSource(event: SituatedExpressionEvent): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "elk",
    position: event.position,
  });
}

function boarSource(event: SituatedExpressionEvent): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "wild-boar",
    position: event.position,
  });
}

function marshRabbitSource(event: SituatedExpressionEvent): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "marsh-rabbit",
    position: event.position,
  });
}

function domesticCatSource(event: SituatedExpressionEvent): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "domestic-cat",
    position: event.position,
  });
}

function marshFoxSource(event: SituatedExpressionEvent): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "marsh-fox",
    position: event.position,
  });
}

function dogInWindow(
  window: ReturnType<typeof createRegionalTerrainWindow>,
  tileX = 18,
  tileY = 22,
): DogActorState {
  const address = window.addresses[tileY * window.terrain.width + tileX];
  if (address === undefined) throw new Error("Dog projection fixture left the regional window");
  return createDogActorState({
    seed: [101, 202, 303, 404],
    originRegion: address.region,
    originNamespace: "regional",
    habitatClass: "settlement-edge",
    habitatKey: "living-voice-projection",
    populationKey: "living-voice-guardian-dogs",
    populationOrdinal: 0,
    position: createWorldPosition(
      address.region,
      address.localX * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
      address.localY * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    ),
  });
}

function recognizableDog(dog: DogActorState): DogActorState {
  const evidenceId = "event:living-voice-recognized-dog";
  const remembered = appendDogActorMemory(dog, {
    eventId: evidenceId,
    kind: "identity-learning",
    subjectId: null,
    atTick: 1,
    salience: 800_000,
    location: dog.address.position,
  });
  return learnDogPlayerKnowledge(remembered, {
    fact: "recognizable-individual",
    source: "direct-observation",
    evidenceId,
    learnedAtTick: 1,
    confidence: 900_000,
  });
}

function selfReception(event: SituatedExpressionEvent): SituatedExpressionReception {
  const reception = createSelfSituatedExpressionReception(event, 42);
  if (reception === null) throw new Error("Self expression receipt was rejected");
  return reception;
}

function heardVisibleReception(event: SituatedExpressionEvent): SituatedExpressionReception {
  const reception = createHeardVisibleSituatedExpressionReception(
    event,
    42,
    800_000,
    true,
  );
  if (reception === null) throw new Error("Heard-visible expression receipt was rejected");
  return reception;
}

/** Source-authentication fixtures need real current sight, not just an old receipt. */
function observeFixtureAnchor(
  world: ReturnType<typeof createRegionalWorldView>,
  player: ReturnType<typeof createPlayer>,
  position: ReturnType<typeof createWorldPosition>,
): void {
  const window = regionalWindowForWorld(world);
  if (window === null) throw new Error("Source sight fixture has no regional window");
  const point = worldPositionToGlobalFixed(position);
  player.x = Math.round((point.x / WORLD_POSITION_UNITS_PER_TILE - window.origin.x) * TILE_UNITS);
  player.y = Math.round((point.y / WORLD_POSITION_UNITS_PER_TILE - window.origin.y) * TILE_UNITS);
  player.previousX = player.x;
  player.previousY = player.y;
  const tileIndex = Math.floor(player.y / TILE_UNITS) * world.terrain.width
    + Math.floor(player.x / TILE_UNITS);
  expect(projectPerception(world, player).detailVisibilityGrades[tileIndex]).toBe(VISIBILITY_DIRECT);
}

describe("situated expression game projection", () => {
  it("maps one canonical expression from signed negative regional coordinates", () => {
    const { player, window, world } = projectionFixture();
    const expression = canonicalExpression("projection:signed-window");

    expect(window.origin).toEqual({ x: -684, y: -888 });
    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: selfReception(expression),
    }).expressions)
      .toEqual([{
        acousticKind: "speech",
        id: "situated-expression:event:v1:2011fc98f7767b00",
        sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
        sourceKind: "player",
        speakerLabel: "You",
        text: "Hold fast.",
        position: { x: 894, y: 1_644 },
        progress: 0.375,
        priority: 420_000,
        salience: 540_000,
        tone: "strained",
        variantSeed: 81,
      }]);
  });

  it("combines lawful physical sound with situated expression without replacing expressions", () => {
    const { player, world } = projectionFixture();
    const expression = canonicalExpression("projection:combined-acoustic-text");
    const worldAcousticEvent = canonicalPhysicalAcousticEvent(expression.position);
    const worldAcousticReception = createSelfWorldAcousticReception(worldAcousticEvent);
    if (worldAcousticReception === null) throw new Error("Self acoustic receipt was rejected");

    const view = projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: selfReception(expression),
      worldAcousticEvent,
      worldAcousticEventRemainingSteps: 4,
      worldAcousticReception,
    });

    expect(view.expressions).toHaveLength(1);
    expect(view.expressions?.[0]).toMatchObject({
      acousticKind: "speech",
      id: expression.eventId,
    });
    expect(view.expressions?.[0]).not.toHaveProperty("criticalCall");
    expect(view.acousticText).toHaveLength(2);
    expect(view.acousticText?.[0]).toBe(view.expressions?.[0]);
    expect(view.acousticText?.[1]).toMatchObject({
      acousticKind: "physical",
      id: worldAcousticEvent.eventId,
      sourceId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      sourceKind: "player",
      semanticFamily: "scrape",
      position: { x: 894, y: 1_644 },
    });
  });

  it("projects every bounded active expression and physical sound into one acoustic list", () => {
    const { player, world } = projectionFixture();
    const firstExpression = canonicalExpression("projection:many:first");
    const secondExpression = canonicalExpression("projection:many:second");
    const firstPhysical = canonicalPhysicalAcousticEvent(
      firstExpression.position,
      "projection:many:physical:first",
    );
    const secondPhysical = canonicalPhysicalAcousticEvent(
      secondExpression.position,
      "projection:many:physical:second",
    );
    const firstPhysicalReception = createSelfWorldAcousticReception(firstPhysical);
    const secondPhysicalReception = createSelfWorldAcousticReception(secondPhysical);
    if (firstPhysicalReception === null || secondPhysicalReception === null) {
      throw new Error("Self acoustic receipts were rejected");
    }

    const view = projectGameView(world, player, {
      situatedExpressions: [
        { event: firstExpression, reception: selfReception(firstExpression) },
        { event: secondExpression, reception: selfReception(secondExpression) },
      ],
      worldAcousticPresentations: [
        { event: firstPhysical, reception: firstPhysicalReception, remainingSteps: 4 },
        { event: secondPhysical, reception: secondPhysicalReception, remainingSteps: 3 },
      ],
    });

    expect(view.expressions?.map(({ id }) => id)).toEqual([
      firstExpression.eventId,
      secondExpression.eventId,
    ]);
    expect(view.acousticText?.map(({ id }) => id)).toEqual([
      firstExpression.eventId,
      secondExpression.eventId,
      firstPhysical.eventId,
      secondPhysical.eventId,
    ]);
  });

  it("does not manufacture speech from a selected resident's continuing state", () => {
    const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
    const resident = compatibility.residents.find((candidate) => (
      projectResidentWorldPosition(world, candidate, 1) !== null
    ));
    if (resident === undefined) throw new Error("fixture needs an in-window porter");
    const placement = projectResidentWorldPosition(world, resident, 1);
    if (placement === null) throw new Error("fixture porter lost its projected position");
    player.x = Math.floor(placement.position.x * TILE_UNITS);
    player.y = Math.floor(placement.position.y * TILE_UNITS);
    player.previousX = player.x;
    player.previousY = player.y;
    const baseline = projectGameView(world, player);
    const visiblePorter = baseline.porters.find(({ id }) => Number(id) === resident.id);
    if (visiblePorter === undefined) throw new Error("fixture needs a directly visible porter");
    expect(visiblePorter.actorId).toBe(resident.identity.stableId);
    const view = projectGameView(world, player, {
      selectedResidentId: resident.id,
    });

    expect(view.porters.find(({ id }) => id === visiblePorter.id))
      .not.toHaveProperty("speech");
    expect(view.acousticText).toEqual([]);
  });

  it("keeps former condition fallbacks silent and exposes only lawful observable state", () => {
    const cases: readonly {
      readonly label: string;
      readonly apply: (resident: ResidentState) => void;
      readonly expectedCondition?: string;
      readonly expectedBehavior?: string;
    }[] = [
      {
        label: "wet",
        apply: (resident) => { resident.condition.wetness = 700_000; },
        expectedCondition: "Soaked",
      },
      {
        label: "cold",
        apply: (resident) => { resident.condition.coldStress = 720_000; },
        expectedCondition: "Cold",
      },
      {
        label: "exhausted",
        apply: (resident) => { resident.condition.exhaustion = 720_000; },
        expectedCondition: "Tired",
      },
      {
        label: "hungry",
        apply: (resident) => { resident.needs.food = 900_000; },
      },
      {
        label: "under contract",
        apply: (resident) => { resident.activeContractId = 1; },
        expectedBehavior: "Carrying a Promise",
      },
    ];

    for (const scenario of cases) {
      const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
      const resident = compatibility.residents.find((candidate) => (
        projectResidentWorldPosition(world, candidate, 1) !== null
      ));
      if (resident === undefined) throw new Error(`fixture needs a porter for ${scenario.label}`);
      const placement = projectResidentWorldPosition(world, resident, 1);
      if (placement === null) throw new Error(`fixture porter lost position for ${scenario.label}`);
      scenario.apply(resident);
      player.x = Math.floor(placement.position.x * TILE_UNITS);
      player.y = Math.floor(placement.position.y * TILE_UNITS);
      player.previousX = player.x;
      player.previousY = player.y;

      const view = projectGameView(world, player, { selectedResidentId: resident.id });
      const porter = view.porters.find(({ actorId }) => actorId === resident.identity.stableId);
      const about = projectUIView(world, player, createSessionState(world.seedText), {
        economyWorld: compatibility,
        selectedResidentId: resident.id,
      }).selectedResident;

      expect(porter, scenario.label).toBeDefined();
      expect(porter, scenario.label).not.toHaveProperty("speech");
      expect(view.acousticText, scenario.label).toEqual([]);
      if (scenario.expectedCondition !== undefined) {
        expect(porter?.conditionLabels, scenario.label).toContain(scenario.expectedCondition);
        expect(about?.observed.find(({ label }) => label === "Current state")?.value, scenario.label)
          .toContain(scenario.expectedCondition);
      }
      if (scenario.expectedBehavior !== undefined) {
        expect(about?.observed.find(({ label }) => label === "Behavior")?.value, scenario.label)
          .toBe(scenario.expectedBehavior);
      }
      if (scenario.label === "hungry") {
        expect(JSON.stringify({ porter, about })).not.toMatch(/hungr|need\s+food/iu);
      }
    }
  });

  it("does not manufacture weather-hold speech from continuing shelter state", () => {
    const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
    const resident = compatibility.residents.find((candidate) => (
      projectResidentWorldPosition(world, candidate, 1) !== null
    ));
    if (resident === undefined) throw new Error("fixture needs an in-window porter");
    const placement = projectResidentWorldPosition(world, resident, 1);
    if (placement === null) throw new Error("fixture porter lost its projected position");
    resident.condition.sheltering = true;
    player.x = Math.floor(placement.position.x * TILE_UNITS);
    player.y = Math.floor(placement.position.y * TILE_UNITS);
    player.previousX = player.x;
    player.previousY = player.y;

    const view = projectGameView(world, player, {
      selectedResidentId: resident.id,
    });
    const visiblePorter = view.porters.find(({ id }) => Number(id) === resident.id);
    expect(visiblePorter?.conditionLabels).toContain("Holding for weather");
    expect(visiblePorter).not.toHaveProperty("speech");
    expect(view.acousticText?.some(({ text }) => (
      text === "Holding here until this eases."
    ))).toBe(false);
  });

  it("keeps admitted weather-hold text at its event locus after the resident moves away", () => {
    const { compatibility, player, world } = projectionFixture(SIGNED_REGION);
    const resident = compatibility.residents[0];
    if (resident === undefined) throw new Error("fixture needs a resident source");
    expect(projectResidentWorldPosition(world, resident, 1)).toBeNull();
    const expression = canonicalResidentWeatherHoldExpression(
      resident.identity.stableId,
    );
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);
    const session = createSessionState(world.seedText);

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
    }).expressions).toContainEqual(expect.objectContaining({
      id: expression.eventId,
      sourceActorId: resident.identity.stableId,
      text: "We'll hold here.",
      position: { x: 894, y: 1_644 },
    }));
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
    }).expressionCaption).toMatchObject({
      id: expression.eventId,
      text: "We'll hold here.",
    });
  });

  it("withholds exact physical sound anchors for unheard, unseen, or mismatched receipts", () => {
    const { player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const position = wildlifePositionInWindow(window);
    const hiddenSourceId = "object:hidden-private-cargo";
    const worldAcousticEvent = canonicalPhysicalAcousticEvent(
      position,
      "cargo:hidden-impact",
      hiddenSourceId,
    );
    const otherEvent = canonicalPhysicalAcousticEvent(
      position,
      "cargo:other-impact",
      "object:other-cargo",
    );
    const heardUnseen = createHeardUnseenWorldAcousticReception(worldAcousticEvent, {
      bearing: { centerRadians: 0.5, uncertaintyRadians: 0.2 },
      distanceBand: { minimum: 2_000, maximum: 8_000 },
      certainty: 0.72,
    });
    const mismatched = createHeardVisibleWorldAcousticReception(otherEvent);

    for (const worldAcousticReception of [undefined, heardUnseen, mismatched]) {
      const view = projectGameView(world, player, {
        worldAcousticEvent,
        worldAcousticEventRemainingSteps: 4,
        ...(worldAcousticReception === undefined ? {} : { worldAcousticReception }),
      });
      expect(view.expressions).toEqual([]);
      expect(view.acousticText).toEqual([]);
      expect(JSON.stringify(view.acousticText)).not.toContain(hiddenSourceId);
      expect(JSON.stringify(view.acousticText)).not.toContain(String(position.localX));
      expect(JSON.stringify(view.acousticText)).not.toContain(String(position.localY));
    }
  });

  it("fails closed when the canonical expression is outside the spatial window", () => {
    const { player, world } = projectionFixture();
    const expression = canonicalExpression(
      "projection:outside-window",
      createWorldPosition(createRegionCoord(-9, -12), 25_250, 44_500),
    );

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: selfReception(expression),
    }).expressions)
      .toEqual([]);
  });

  it("projects neither overhead text nor a caption without the exact reception receipt", () => {
    const { compatibility, player, world } = projectionFixture();
    const session = createSessionState(world.seedText);
    const expression = canonicalExpression("projection:receipt-required");
    const otherExpression = canonicalExpression("projection:other-receipt");
    const mismatchedReceipt = selfReception(otherExpression);

    for (const situatedExpressionReception of [undefined, mismatchedReceipt]) {
      expect(projectGameView(world, player, {
        situatedExpression: expression,
        ...(situatedExpressionReception === undefined
          ? {}
          : { situatedExpressionReception }),
      }).expressions).toEqual([]);
      expect(projectUIView(world, player, session, {
        economyWorld: compatibility,
        situatedExpression: expression,
        ...(situatedExpressionReception === undefined
          ? {}
          : { situatedExpressionReception }),
      }).expressionCaption).toBeUndefined();
    }
  });

  it("projects neither overhead text nor a caption for impossible swapped reception modes", () => {
    const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const playerExpression = canonicalExpression(
      "projection:player-heard-visible",
      createWorldPosition(COMPATIBILITY_REGION, 25_250, 44_500),
    );
    const resident = compatibility.residents.find((candidate) =>
      projectResidentWorldPosition(world, candidate, 1) !== null
    );
    if (!resident) throw new Error("fixture needs a resident in the active window");
    const placement = resolveResidentWorldPlacement(compatibility, resident);
    if (!placement) throw new Error("fixture resident has no authoritative placement");
    const residentExpression = canonicalExpression(
      "projection:resident-self",
      placement.position,
      resident.identity.stableId,
    );

    for (const [expression, situatedExpressionReception] of [
      [playerExpression, heardVisibleReception(playerExpression)],
      [residentExpression, selfReception(residentExpression)],
    ] as const) {
      expect(projectGameView(world, player, {
        situatedExpression: expression,
        situatedExpressionReception,
      }).expressions).toEqual([]);
      expect(projectUIView(world, player, session, {
        economyWorld: compatibility,
        situatedExpression: expression,
        situatedExpressionReception,
      }).expressionCaption).toBeUndefined();
    }
  });

  it("authenticates current residents and reveals only a legitimately known name", () => {
    const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
    const resident = compatibility.residents.find((candidate) =>
      projectResidentWorldPosition(world, candidate, 1) !== null
    );
    if (!resident) throw new Error("fixture needs a resident in the active window");
    const placement = resolveResidentWorldPlacement(compatibility, resident);
    if (!placement) throw new Error("fixture resident has no authoritative placement");
    const expression = canonicalExpression(
      "projection:resident-source",
      placement.position,
      resident.identity.stableId,
    );
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
    }).expressions?.[0])
      .toMatchObject({
        sourceActorId: resident.identity.stableId,
        sourceKind: "human",
        speakerLabel: "Unknown porter",
      });

    resident.playerKnowledge.facts.push("name");
    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
    }).expressions?.[0])
      .toMatchObject({
        sourceKind: "human",
        speakerLabel: resident.name,
      });
  });

  it("keeps Chart/Relief and caption labels aligned and rejects unauthenticated sources", () => {
    const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
    const resident = compatibility.residents.find((candidate) =>
      projectResidentWorldPosition(world, candidate, 1) !== null
    );
    if (!resident) throw new Error("fixture needs a resident in the active window");
    const placement = resolveResidentWorldPlacement(compatibility, resident);
    if (!placement) throw new Error("fixture resident has no authoritative placement");
    const session = createSessionState(world.seedText);
    const expression = canonicalExpression(
      "projection:resident-caption",
      placement.position,
      resident.identity.stableId,
    );
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);

    const game = projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
    });
    const ui = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
    });
    expect(game.expressions?.[0]?.speakerLabel).toBe("Unknown porter");
    expect(ui.expressionCaption?.speakerLabel).toBe("Unknown porter");

    const fabricated = canonicalExpression(
      "projection:fabricated-source",
      placement.position,
      "human:not-a-current-resident",
    );
    expect(projectGameView(world, player, {
      situatedExpression: fabricated,
      situatedExpressionReception: heardVisibleReception(fabricated),
    }).expressions)
      .toEqual([]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: fabricated,
      situatedExpressionReception: heardVisibleReception(fabricated),
    }).expressionCaption).toBeUndefined();
  });

  it("keeps a heard-unseen human warning generic, directional, and free of an exact world anchor", () => {
    const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const resident = compatibility.residents.find((candidate) =>
      projectResidentWorldPosition(world, candidate, 1) !== null
    );
    if (!resident) throw new Error("fixture needs a resident in the active window");
    const placement = resolveResidentWorldPlacement(compatibility, resident);
    if (!placement) throw new Error("fixture resident has no authoritative placement");
    resident.playerKnowledge.facts.push("name");
    const expression = canonicalHumanDangerWarning(
      placement.position,
      "human-warning:hidden-danger",
      resident.identity.stableId,
    );
    const reception = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: 0, uncertaintyRadians: Math.PI / 60 },
      distanceBand: { minimum: 3_000, maximum: 11_000 },
      certainty: 0.74,
    });
    if (reception === null) throw new Error("Hidden human warning reception was rejected");

    const game = projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
    });
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
    }).expressionCaption;

    expect(game.expressions).toEqual([]);
    expect(caption).toMatchObject({
      speakerLabel: "Someone",
      presentationKind: "speech",
      directionLabel: "east",
      tone: "alarmed",
      assertive: true,
    });
    expect(["Watch out!", "Heads up!"]).toContain(caption?.text);
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toContain(resident.identity.stableId);
    expect(JSON.stringify(caption)).not.toContain(resident.name);
    expect(JSON.stringify(caption)).not.toContain(String(placement.position.localX));
  });

  it("keeps faint visible human speech anchored without presenting unintelligible words", () => {
    const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
    const resident = compatibility.residents.find((candidate) =>
      projectResidentWorldPosition(world, candidate, 1) !== null
    );
    if (!resident) throw new Error("fixture needs a resident in the active window");
    const placement = resolveResidentWorldPlacement(compatibility, resident);
    if (!placement) throw new Error("fixture resident has no authoritative placement");
    resident.playerKnowledge.facts.push("name");
    const expression = canonicalResidentWeatherHoldExpression(
      resident.identity.stableId, placement.position,
    );
    observeFixtureAnchor(world, player, expression.position);
    const originalExpression = structuredClone(expression);
    const faintReception = createHeardVisibleSituatedExpressionReception(expression, 42, 200_000, true);
    if (faintReception === null) throw new Error("Faint visible hearing receipt was rejected");
    const clear = projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: heardVisibleReception(expression),
    }).expressions?.[0];
    const faint = projectGameView(world, player, {
      situatedExpression: expression, situatedExpressionReception: faintReception,
    }).expressions?.[0];
    const caption = projectUIView(world, player, createSessionState(world.seedText), {
      economyWorld: compatibility,
      situatedExpression: expression, situatedExpressionReception: faintReception,
    }).expressionCaption;

    expect(clear).toMatchObject({ acousticKind: "speech", text: "We'll hold here." });
    expect(faint).toMatchObject({
      id: expression.eventId, sourceActorId: resident.identity.stableId,
      sourceKind: "human", acousticKind: "indistinct-voice", text: "indistinct voice",
      position: clear?.position,
    });
    expect(caption).toMatchObject({
      id: expression.eventId, speakerLabel: "Voice",
      presentationKind: "indistinct-voice", text: "indistinct voice",
    });
    expect(JSON.stringify({ faint, caption })).not.toContain("We'll hold here.");
    expect(JSON.stringify(caption)).not.toContain(resident.name);
    expect(expression).toEqual(originalExpression);
  });

  it("keeps faint unseen human speech coarse and refuses absent, unheard, or mismatched receipts", () => {
    const { compatibility, player, world } = projectionFixture(COMPATIBILITY_REGION);
    const resident = compatibility.residents.find((candidate) =>
      projectResidentWorldPosition(world, candidate, 1) !== null
    );
    if (!resident) throw new Error("fixture needs a resident in the active window");
    const placement = resolveResidentWorldPlacement(compatibility, resident);
    if (!placement) throw new Error("fixture resident has no authoritative placement");
    resident.playerKnowledge.facts.push("name");
    const expression = canonicalResidentWeatherHoldExpression(
      resident.identity.stableId, placement.position,
    );
    const originalExpression = structuredClone(expression);
    const contact = {
      bearing: { centerRadians: 0, uncertaintyRadians: Math.PI / 6 },
      distanceBand: { minimum: 4_000, maximum: 11_000 }, certainty: 0.2,
    };
    const faintReception = createHeardUnseenSituatedExpressionReception(expression, 42, contact);
    if (faintReception === null) throw new Error("Faint unseen hearing receipt was rejected");
    const session = createSessionState(world.seedText);
    expect(projectGameView(world, player, {
      situatedExpression: expression, situatedExpressionReception: faintReception,
    }).expressions).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression, situatedExpressionReception: faintReception,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "Voice", presentationKind: "indistinct-voice",
      text: "indistinct voice", directionLabel: "direction unclear",
    });
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toContain("We'll hold here.");
    expect(JSON.stringify(caption)).not.toContain(resident.name);
    expect(JSON.stringify(caption)).not.toContain(resident.identity.stableId);

    const otherExpression = canonicalHumanDangerWarning(
      placement.position, "projection:faint-unseen-mismatched", resident.identity.stableId,
    );
    const mismatch = createHeardUnseenSituatedExpressionReception(otherExpression, 42, contact);
    const unheard = { ...faintReception, certainty: 0 } as SituatedExpressionReception;
    for (const reception of [undefined, null, mismatch, unheard]) {
      const options = {
        situatedExpression: expression,
        ...(reception === undefined ? {} : { situatedExpressionReception: reception }),
      };
      expect(projectGameView(world, player, {
        ...options,
      }).expressions).toEqual([]);
      expect(projectUIView(world, player, session, {
        economyWorld: compatibility,
        ...options,
      }).expressionCaption).toBeUndefined();
    }
    expect(expression).toEqual(originalExpression);
  });

  it("does not replace a faint animal call or the player's own words with indistinct human speech", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = dogInWindow(window);
    const dogActorRoster = createDogActorRoster([dog]);
    const animalExpression = canonicalDogWarning(dog, "projection:faint-dog-remains-call");
    observeFixtureAnchor(world, player, animalExpression.position);
    const animalOriginal = structuredClone(animalExpression);
    const animalReception = createHeardVisibleSituatedExpressionReception(
      animalExpression, 42, 120_000, true,
    );
    if (animalReception === null) throw new Error("Faint animal hearing receipt was rejected");
    expect(projectGameView(world, player, {
      situatedExpression: animalExpression, situatedExpressionReception: animalReception, dogActorRoster,
    }).expressions?.[0]).toMatchObject({ acousticKind: "animal-call", text: "BARK!" });
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: animalExpression, situatedExpressionReception: animalReception, dogActorRoster,
    }).expressionCaption).toMatchObject({ presentationKind: "animal-call", text: "BARK!" });

    const selfExpression = canonicalExpression(
      "projection:self-words-remain-clear", createWorldPosition(COMPATIBILITY_REGION, 25_250, 44_500),
    );
    const selfOriginal = structuredClone(selfExpression);
    const selfWords = projectSituatedExpression(selfExpression)?.text;
    expect(selfWords).toBeDefined();
    expect(projectGameView(world, player, {
      situatedExpression: selfExpression, situatedExpressionReception: selfReception(selfExpression),
    }).expressions?.[0]).toMatchObject({ acousticKind: "speech", text: selfWords });
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: selfExpression, situatedExpressionReception: selfReception(selfExpression),
    }).expressionCaption).toMatchObject({ presentationKind: "speech", text: selfWords });
    expect(animalExpression).toEqual(animalOriginal);
    expect(selfExpression).toEqual(selfOriginal);
  });

  it("anchors a heard-visible guardian bark to its authenticated dog without inventing a name", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = dogInWindow(window);
    const dogActorRoster = createDogActorRoster([dog]);
    const expression = canonicalDogWarning(dog, "dog-signal:visible-warning");
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);
    expect(situatedExpressionSoundInterrupt(expression)).toBe("strong");

    const game = projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    });
    const ui = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    });

    expect(game.expressions).toEqual([expect.objectContaining({
      sourceActorId: dog.identity.stableId,
      sourceKind: "animal",
      speakerLabel: "Unknown dog",
      text: "BARK!",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      tone: "alarmed",
      criticalCall: true,
    })]);
    expect(game.acousticText?.[0]).toBe(game.expressions?.[0]);
    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: null,
      dogActorRoster,
    }).acousticText).toEqual([]);
    expect(ui.expressionCaption).toMatchObject({
      speakerLabel: "Unknown dog",
      text: "BARK!",
      presentationKind: "animal-call",
      animalCallKind: "bark",
    });
    expect(ui.expressionCaption).not.toHaveProperty("name");
  });

  it("uses learned recognition for a visible dog label and rejects a mismatched body position", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = recognizableDog(dogInWindow(window));
    const dogActorRoster = createDogActorRoster([dog]);
    const expression = canonicalDogWarning(dog, "dog-signal:familiar-warning");
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    }).expressions?.[0]?.speakerLabel).toBe("Familiar dog");
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    }).expressionCaption?.speakerLabel).toBe("Familiar dog");

    const mismatched = {
      ...expression,
      position: createWorldPosition(
        dog.address.position.region,
        dog.address.position.localX + 1,
        dog.address.position.localY,
      ),
    } as SituatedExpressionEvent;
    expect(projectGameView(world, player, {
      situatedExpression: mismatched,
      situatedExpressionReception: heardVisibleReception(mismatched),
      dogActorRoster,
    }).expressions).toEqual([]);
  });

  it("stops exact animal-call anchoring when current sight is lost without erasing the heard event", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    player.facingMilliRadians = 0;
    const seenPerception = projectPerception(world, player);
    const sourceIndex = seenPerception.detailDirectTileIndices.find((index) => {
      const tileX = index % world.terrain.width;
      const tileY = Math.floor(index / world.terrain.width);
      const distance = Math.hypot(tileX - 60, tileY - 60);
      return tileX > 60
        && distance > DEFAULT_PERCEPTION_RANGES.closePeripheralRange
        && distance < 18;
    });
    if (sourceIndex === undefined) throw new Error("Current sight fixture has no source beyond the close circle");
    const dog = dogInWindow(
      window, sourceIndex % world.terrain.width, Math.floor(sourceIndex / world.terrain.width),
    );
    const dogActorRoster = createDogActorRoster([dog]);
    // The existing projection contract consumes a canonical committed event
    // and its event-time receipt. This fixture does not create a new producer.
    const expression = canonicalDogWarning(dog, "dog-signal:current-sight-loss");
    const reception = heardVisibleReception(expression);
    const options = {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    };
    const original = structuredClone({ expression, reception, dogActorRoster });
    expect(seenPerception.detailVisibilityGrades[sourceIndex]).toBe(VISIBILITY_DIRECT);
    const seen = projectGameView(world, player, options);
    expect(seen.expressions?.map(({ id }) => id)).toEqual([expression.eventId]);
    const heardCaption = projectUIView(world, player, session, {
      economyWorld: compatibility, ...options,
    }).expressionCaption;
    expect(heardCaption).toMatchObject({ animalCallKind: "bark", text: "BARK!" });

    // Only the current player heading changes: no event, receipt, body, terrain,
    // clock, sound or authoritative knowledge is rewritten to hide the source.
    player.facingMilliRadians = Math.round(Math.PI * 1_000);
    const unseenPerception = projectPerception(world, player);
    expect(unseenPerception.detailVisibilityGrades[sourceIndex]).not.toBe(VISIBILITY_DIRECT);
    const noLongerSeen = projectGameView(world, player, options);
    expect(noLongerSeen.terrain.tiles[sourceIndex]?.currentDetailVisibility).not.toBe(1);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility, ...options,
    }).expressionCaption).toEqual(heardCaption);
    expect({ expression, reception, dogActorRoster }).toEqual(original);
    expect(noLongerSeen.expressions).toEqual([]);
    expect(noLongerSeen.acousticText).toEqual([]);
    // A once-valid supplied snapshot cannot restore an exact hidden anchor.
    expect(projectGameView(world, player, {
      ...options, perception: seenPerception,
    }).acousticText).toEqual([]);
  });

  it("gates a heard-visible physical cue by current sight while preserving tactile and self localization", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    player.facingMilliRadians = 0;
    const seenPerception = projectPerception(world, player);
    const sourceIndex = seenPerception.detailDirectTileIndices.find((index) => {
      const x = index % world.terrain.width;
      const y = Math.floor(index / world.terrain.width);
      const distance = Math.hypot(x - 60, y - 60);
      return x > 60 && distance > DEFAULT_PERCEPTION_RANGES.closePeripheralRange && distance < 18;
    });
    if (sourceIndex === undefined) throw new Error("Physical sight fixture has no source beyond the close circle");
    const position = wildlifePositionInWindow(
      window, sourceIndex % world.terrain.width, Math.floor(sourceIndex / world.terrain.width),
    );
    const event = canonicalPhysicalAcousticEvent(position, "physical:current-sight-loss", "object:crate");
    const reception = createHeardVisibleWorldAcousticReception(event);
    const options = {
      worldAcousticEvent: event, worldAcousticEventRemainingSteps: 4, worldAcousticReception: reception,
    };
    const seenText = projectGameView(world, player, options).acousticText;
    expect(seenText?.map(({ id }) => id)).toEqual([event.eventId]);
    const captionOptions = { ...options, economyWorld: compatibility, worldAcousticRemainingSteps: 4 };
    const heardCaption = projectUIView(world, player, session, captionOptions).expressionCaption;
    expect(heardCaption).toMatchObject({ presentationKind: "physical", text: seenText?.[0]?.text });
    const original = structuredClone({ event, reception });
    player.facingMilliRadians = Math.round(Math.PI * 1_000);
    expect(projectPerception(world, player).detailVisibilityGrades[sourceIndex]).not.toBe(VISIBILITY_DIRECT);
    expect(projectGameView(world, player, options).acousticText).toEqual([]);
    expect(projectGameView(world, player, { ...options, perception: seenPerception }).acousticText).toEqual([]);
    expect(projectUIView(world, player, session, captionOptions).expressionCaption).toEqual(heardCaption);
    expect({ event, reception }).toEqual(original);

    const feltPosition = wildlifePositionInWindow(window, 60, 60);
    const felt = canonicalPhysicalAcousticEvent(feltPosition, "physical:felt-contact", "object:handled-crate");
    const self = canonicalPhysicalAcousticEvent(feltPosition, "physical:self-contact");
    const selfReceipt = createSelfWorldAcousticReception(self);
    if (selfReceipt === null) throw new Error("Self contact fixture lost its receipt");
    const detailSuppressed = projectGameView(world, player, {
      suppressDetailPerception: true,
      worldAcousticPresentations: [
        { event: felt, reception: createDirectContactWorldAcousticReception(felt), remainingSteps: 4 },
        { event: self, reception: selfReceipt, remainingSteps: 4 },
      ],
    });
    expect(detailSuppressed.terrain.tiles[60 * world.terrain.width + 60]?.currentDetailVisibility).not.toBe(1);
    expect(detailSuppressed.acousticText?.map(({ id }) => id)).toEqual([felt.eventId, self.eventId]);
  });

  it("keeps a legitimately seen animal call in the full cone beyond the medium-copy range", () => {
    const { player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    player.facingMilliRadians = 0;
    const perception = projectPerception(world, player);
    const sourceIndex = perception.detailDirectTileIndices.find((index) => {
      const distance = Math.hypot(index % world.terrain.width - 60, Math.floor(index / world.terrain.width) - 60);
      return distance > 26 && distance < 36;
    });
    if (sourceIndex === undefined) throw new Error("Full-cone fixture has no actual direct source beyond medium range");
    const dog = dogInWindow(
      window, sourceIndex % world.terrain.width, Math.floor(sourceIndex / world.terrain.width),
    );
    const expression = canonicalDogWarning(dog, "dog-signal:full-cone-label");
    const projected = projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: heardVisibleReception(expression),
      dogActorRoster: createDogActorRoster([dog]),
    });
    expect(projected.terrain.tiles[sourceIndex]?.currentDetailVisibility).toBe(1);
    expect(projected.expressions?.map(({ id }) => id)).toEqual([expression.eventId]);
  });

  it("keeps an unseen heard bark directional but never exact-position anchored", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = dogInWindow(window);
    const expression = canonicalDogWarning(dog, "dog-signal:hidden-warning");
    const reception = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: 0, uncertaintyRadians: Math.PI / 60 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.72,
    });
    if (reception === null) throw new Error("Hidden dog reception fixture was rejected");

    const game = projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster: createDogActorRoster([dog]),
    });
    const ui = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster: createDogActorRoster([dog]),
    });

    expect(game.expressions).toEqual([]);
    expect(game.acousticText).toEqual([]);
    expect(ui.expressionCaption).toMatchObject({
      speakerLabel: "A dog",
      text: "BARK!",
      presentationKind: "animal-call",
      animalCallKind: "bark",
      directionLabel: "east",
    });
    expect(ui.expressionCaption).not.toHaveProperty("position");
    expect(JSON.stringify(ui.expressionCaption)).not.toContain(dog.identity.stableId);
    expect(JSON.stringify(ui.expressionCaption)).not.toContain(
      String(dog.address.position.localX),
    );
  });

  it("anchors a heard-visible defensive growl only to its authenticated dog", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = dogInWindow(window);
    const dogActorRoster = createDogActorRoster([dog]);
    const expression = canonicalDogDefensiveGrowl(dog, "dog-signal:visible-growl");
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);
    expect(situatedExpressionSoundInterrupt(expression)).toBe("none");

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    }).expressions).toEqual([expect.objectContaining({
      sourceActorId: dog.identity.stableId,
      sourceKind: "animal",
      speakerLabel: "Unknown dog",
      text: "GRRRR.",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      tone: "restrained",
      criticalCall: false,
    })]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Unknown dog",
      text: "GRRRR.",
      presentationKind: "animal-call",
      animalCallKind: "growl",
      assertive: false,
    });
  });

  it("keeps an unseen defensive growl directional without revealing dog or threat position", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = dogInWindow(window);
    const expression = canonicalDogDefensiveGrowl(dog, "dog-signal:hidden-growl");
    const reception = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI, uncertaintyRadians: Math.PI / 60 },
      distanceBand: { minimum: 3_000, maximum: 9_000 },
      certainty: 0.66,
    });
    if (reception === null) throw new Error("Hidden growl reception fixture was rejected");

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster: createDogActorRoster([dog]),
    }).expressions).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster: createDogActorRoster([dog]),
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "A dog",
      text: "GRRRR.",
      presentationKind: "animal-call",
      animalCallKind: "growl",
      directionLabel: "west",
      assertive: false,
    });
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toContain(dog.identity.stableId);
    expect(JSON.stringify(caption)).not.toContain(String(dog.address.position.localX));
    expect(JSON.stringify(caption)).not.toContain("threat");
  });

  it("anchors a heard-visible shelter whine only to its authenticated dog", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = recognizableDog(dogInWindow(window));
    const dogActorRoster = createDogActorRoster([dog]);
    const expression = canonicalDogShelterWhine(dog, "dog-signal:visible-whine");
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);
    expect(situatedExpressionSoundInterrupt(expression)).toBe("none");

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    }).expressions).toEqual([expect.objectContaining({
      sourceActorId: dog.identity.stableId,
      sourceKind: "animal",
      speakerLabel: "Familiar dog",
      text: "WHINE...",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      tone: "restrained",
      criticalCall: false,
    })]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Familiar dog",
      text: "WHINE...",
      presentationKind: "animal-call",
      animalCallKind: "whine",
      assertive: false,
    });
  });

  it("keeps an unseen shelter whine directional without revealing its weather cause or exact position", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = dogInWindow(window);
    const expression = canonicalDogShelterWhine(dog, "dog-signal:hidden-whine");
    const reception = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI / 2, uncertaintyRadians: Math.PI / 60 },
      distanceBand: { minimum: 2_000, maximum: 7_000 },
      certainty: 0.61,
    });
    if (reception === null) throw new Error("Hidden whine reception fixture was rejected");

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster: createDogActorRoster([dog]),
    }).expressions).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      dogActorRoster: createDogActorRoster([dog]),
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "A dog",
      text: "WHINE...",
      presentationKind: "animal-call",
      animalCallKind: "whine",
      directionLabel: "south",
      assertive: false,
    });
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toContain(dog.identity.stableId);
    expect(JSON.stringify(caption)).not.toContain(String(dog.address.position.localX));
    expect(JSON.stringify(caption)).not.toContain("weather");
    expect(JSON.stringify(caption)).not.toContain("shelter");
    expect(JSON.stringify(caption)).not.toContain("storm");
  });

  it("anchors a visible fish-crow call to the exact bounded wildlife source", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalFishCrowAlarm(
      wildlifePositionInWindow(window),
      "fish-crow-signal:visible-alarm",
    );
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);
    const coreWildlifeExpressionSources = [fishCrowSource(expression)];

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      coreWildlifeExpressionSources,
    }).expressions).toEqual([expect.objectContaining({
      acousticKind: "animal-call",
      sourceActorId: expression.sourceActorId,
      sourceKind: "animal",
      speakerLabel: "Fish crow",
      text: "KRAA! KRAA!",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      tone: "alarmed",
    })]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      coreWildlifeExpressionSources,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Fish crow",
      text: "KRAA! KRAA!",
      presentationKind: "animal-call",
      animalCallKind: "fish-crow-call",
      assertive: true,
    });
  });

  it("rejects a visible fish-crow anchor with the wrong species, position, or identity count", () => {
    const { player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const expression = canonicalFishCrowAlarm(
      wildlifePositionInWindow(window),
      "fish-crow-signal:forged-visible-source",
    );
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);
    const source = fishCrowSource(expression);
    const forgedSources: readonly (readonly CoreWildlifeExpressionSource[])[] = [
      [],
      [{ ...source, species: "gull" }],
      [{
        ...source,
        position: createWorldPosition(
          source.position.region,
          source.position.localX + 1,
          source.position.localY,
        ),
      }],
      [source, { ...source }],
    ];

    for (const coreWildlifeExpressionSources of forgedSources) {
      expect(projectGameView(world, player, {
        situatedExpression: expression,
        situatedExpressionReception: reception,
        coreWildlifeExpressionSources,
      }).expressions).toEqual([]);
    }
  });

  it("keeps a heard-unseen fish-crow call directional without identity or exact position", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalFishCrowAlarm(
      wildlifePositionInWindow(window),
      "fish-crow-signal:hidden-alarm",
    );
    const reception = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI * 1.75, uncertaintyRadians: Math.PI / 60 },
      distanceBand: { minimum: 5_000, maximum: 14_000 },
      certainty: 0.69,
    });
    if (reception === null) throw new Error("Hidden fish-crow reception fixture was rejected");

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      coreWildlifeExpressionSources: [fishCrowSource(expression)],
    }).expressions).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "A bird",
      text: "CALL! CALL!",
      presentationKind: "animal-call",
      animalCallKind: "bird-call",
      directionLabel: "north-east",
      assertive: true,
    });
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toContain(expression.sourceActorId);
    expect(JSON.stringify(caption)).not.toContain(String(expression.position.localX));
    expect(JSON.stringify(caption)).not.toContain("fish-crow");
    expect(JSON.stringify(caption)).not.toContain("KRAA");
  });

  it("anchors a visible deer snort and anonymizes the same heard-unseen call", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalDeerAlarm(
      wildlifePositionInWindow(window),
      "deer-signal:alarm",
    );
    observeFixtureAnchor(world, player, expression.position);
    const visible = heardVisibleReception(expression);
    const sources = [deerSource(expression)];
    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: sources,
    }).expressions).toEqual([expect.objectContaining({
      speakerLabel: "Deer",
      text: "SNORT!",
    })]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: sources,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Deer",
      text: "SNORT!",
      presentationKind: "animal-call",
      animalCallKind: "deer-call",
    });

    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI / 2, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.7,
    });
    if (unseen === null) throw new Error("Hidden deer reception fixture was rejected");
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "An animal",
      text: "SNORT!",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      directionLabel: "south",
    });
    expect(JSON.stringify(caption)).not.toContain(expression.sourceActorId);
    expect(JSON.stringify(caption)).not.toContain("DEER-living-voice");
  });

  it("anchors only an authenticated chicken and anonymizes its soft hidden call", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
      version: 1, sourceActorId: "CHICKEN-projection-test", triggerEventId: "chicken-signal:alarm",
      position: wildlifePositionInWindow(window), meaning: "domestic-chicken-alarm-call",
      family: "animal-signal", tone: "alarmed", volume: "murmur",
      knowledgeBasis: "self-perceived-threat", priority: 160_000, salience: 820_000,
      variantSeed: 156, durationSteps: 6,
    });
    const expression = reduction.event;
    if (expression === null) throw new Error("Chicken projection fixture rejected");
    observeFixtureAnchor(world, player, expression.position);
    expect(expression.tone).toBe("alarmed");
    expect(situatedExpressionSoundInterrupt(expression)).toBe("none");
    const source: CoreWildlifeExpressionSource = {
      actorId: expression.sourceActorId, species: "domestic-chicken", position: expression.position,
    };
    const options = {
      situatedExpression: expression,
      situatedExpressionReception: heardVisibleReception(expression),
      coreWildlifeExpressionSources: [source],
    };
    expect(projectGameView(world, player, options).expressions).toEqual([expect.objectContaining({
      sourceActorId: expression.sourceActorId, speakerLabel: "Domestic chicken", text: "SQUAWK.",
      acousticKind: "animal-call", criticalCall: false,
    })]);
    expect(projectUIView(world, player, session, { economyWorld: compatibility, ...options })
      .expressionCaption).toMatchObject({
        speakerLabel: "Domestic chicken", text: "SQUAWK.", animalCallKind: "chicken-call",
        presentationKind: "animal-call", assertive: false,
      });
    expect(projectGameView(world, player, {
      ...options, coreWildlifeExpressionSources: [{ ...source, species: "gull" }],
    }).expressions).toEqual([]);
    expect(projectGameView(world, player, {
      ...options, situatedExpressionReception: null,
    }).expressions).toEqual([]);
    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 2_000, maximum: 5_000 }, certainty: 0.7,
    });
    if (unseen === null) throw new Error("Chicken unseen fixture rejected");
    expect(projectGameView(world, player, {
      ...options, situatedExpressionReception: unseen,
    }).expressions).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility, situatedExpression: expression, situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "A bird", text: "CALL.", animalCallKind: "bird-call",
      presentationKind: "animal-call", directionLabel: "west", assertive: false,
    });
    expect(JSON.stringify(caption)).not.toMatch(/CHICKEN-projection|chicken|SQUAWK|predator|custody/iu);
  });

  it("anchors only an authenticated goat and keeps unseen bleats anonymous", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
      version: 1, sourceActorId: "GOAT-projection-test", triggerEventId: "goat-signal:alarm",
      position: wildlifePositionInWindow(window), meaning: "domestic-goat-alarm-call",
      family: "animal-signal", tone: "alarmed", volume: "shout",
      knowledgeBasis: "self-perceived-threat", priority: 760_000, salience: 820_000,
      variantSeed: 158, durationSteps: 6,
    });
    const expression = reduction.event;
    if (expression === null) throw new Error("Goat projection fixture rejected");
    observeFixtureAnchor(world, player, expression.position);
    const source: CoreWildlifeExpressionSource = {
      actorId: expression.sourceActorId, species: "domestic-goat", position: expression.position,
    };
    const options = {
      situatedExpression: expression,
      situatedExpressionReception: heardVisibleReception(expression),
      coreWildlifeExpressionSources: [source],
    };
    const visible = projectGameView(world, player, options);
    expect(visible.expressions).toEqual([expect.objectContaining({
      id: expression.eventId, sourceActorId: expression.sourceActorId, sourceKind: "animal",
      speakerLabel: "Domestic goat", text: "MAAA!", acousticKind: "animal-call", priority: 760_000,
    })]);
    expect(visible.acousticText?.[0]).toBe(visible.expressions?.[0]);
    expect(projectUIView(world, player, session, { economyWorld: compatibility, ...options })
      .expressionCaption).toMatchObject({
        speakerLabel: "Domestic goat", text: "MAAA!", animalCallKind: "goat-call",
        presentationKind: "animal-call", assertive: true,
      });
    const invalidSources: readonly (readonly CoreWildlifeExpressionSource[])[] = [
      [], [{ ...source, species: "domestic-chicken" }], [{ ...source, actorId: "GOAT-other" }],
      [{ ...source, position: wildlifePositionInWindow(window, 19, 22) }], [source, source],
    ];
    for (const coreWildlifeExpressionSources of invalidSources) {
      const forgedOptions = { ...options, coreWildlifeExpressionSources };
      expect(projectGameView(world, player, forgedOptions).expressions).toEqual([]);
      expect(projectUIView(world, player, session, {
        economyWorld: compatibility, ...forgedOptions,
      }).expressionCaption).toBeUndefined();
    }
    const unheard = { ...options, situatedExpressionReception: null };
    expect(projectGameView(world, player, unheard).expressions).toEqual([]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility, ...unheard,
    }).expressionCaption).toBeUndefined();
    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 2_000, maximum: 5_000 }, certainty: 0.7,
    });
    if (unseen === null) throw new Error("Goat unseen fixture rejected");
    const unseenView = projectGameView(world, player, {
      ...options, situatedExpressionReception: unseen,
    });
    expect(unseenView.expressions).toEqual([]);
    expect(unseenView.acousticText).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility, situatedExpression: expression, situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "An animal", text: "CALL!", animalCallKind: "animal-call",
      presentationKind: "animal-call", directionLabel: "west", assertive: true,
    });
    expect(JSON.stringify(caption)).not.toMatch(/GOAT|MAAA|predator|threat|custody|herd/iu);
  });

  it("anchors only an authenticated duck and keeps its soft unseen call bird-anonymous", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
      version: 1, sourceActorId: "DUCK-projection-test", triggerEventId: "duck-signal:alarm",
      position: wildlifePositionInWindow(window), meaning: "american-black-duck-alarm-call",
      family: "animal-signal", tone: "alarmed", volume: "murmur",
      knowledgeBasis: "self-perceived-threat", priority: 160_000, salience: 820_000,
      variantSeed: 157, durationSteps: 6,
    });
    const expression = reduction.event;
    if (expression === null) throw new Error("Duck projection fixture rejected");
    observeFixtureAnchor(world, player, expression.position);
    expect(expression.tone).toBe("alarmed");
    expect(situatedExpressionSoundInterrupt(expression)).toBe("none");
    const source: CoreWildlifeExpressionSource = {
      actorId: expression.sourceActorId, species: "american-black-duck", position: expression.position,
    };
    const options = {
      situatedExpression: expression,
      situatedExpressionReception: heardVisibleReception(expression),
      coreWildlifeExpressionSources: [source],
    };
    const visible = projectGameView(world, player, options);
    expect(visible.expressions).toEqual([expect.objectContaining({
      id: expression.eventId, sourceActorId: expression.sourceActorId, sourceKind: "animal",
      speakerLabel: "American black duck", text: "QUACK.", acousticKind: "animal-call",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 }, priority: 160_000,
      criticalCall: false,
    })]);
    expect(visible.acousticText?.[0]).toBe(visible.expressions?.[0]);
    expect(projectUIView(world, player, session, { economyWorld: compatibility, ...options })
      .expressionCaption).toMatchObject({
        speakerLabel: "American black duck", text: "QUACK.", animalCallKind: "duck-call",
        presentationKind: "animal-call", assertive: false,
      });
    const invalidSources: readonly (readonly CoreWildlifeExpressionSource[])[] = [
      [],
      [{ ...source, species: "domestic-chicken" }],
      [{ ...source, actorId: "DUCK-other-body" }],
      [{ ...source, position: wildlifePositionInWindow(window, 19, 22) }],
      [source, source],
    ];
    for (const coreWildlifeExpressionSources of invalidSources) {
      const forgedOptions = { ...options, coreWildlifeExpressionSources };
      expect(projectGameView(world, player, forgedOptions).expressions).toEqual([]);
      expect(projectUIView(world, player, session, {
        economyWorld: compatibility, ...forgedOptions,
      }).expressionCaption).toBeUndefined();
    }
    const unheardOptions = { ...options, situatedExpressionReception: null };
    expect(projectGameView(world, player, unheardOptions).expressions).toEqual([]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility, ...unheardOptions,
    }).expressionCaption).toBeUndefined();

    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 2_000, maximum: 5_000 }, certainty: 0.7,
    });
    if (unseen === null) throw new Error("Duck unseen fixture rejected");
    const unseenView = projectGameView(world, player, {
      ...options, situatedExpressionReception: unseen,
    });
    expect(unseenView.expressions).toEqual([]);
    expect(unseenView.acousticText).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility, situatedExpression: expression, situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "A bird", text: "CALL.", animalCallKind: "bird-call",
      presentationKind: "animal-call", directionLabel: "west", assertive: false,
    });
    expect(caption).not.toHaveProperty("position");
    expect(caption).not.toHaveProperty("sourceActorId");
    expect(caption).not.toHaveProperty("meaning");
    expect(caption).not.toHaveProperty("triggerEventId");
    expect(JSON.stringify(caption)).not.toMatch(/DUCK-projection|duck|QUACK|predator|threat|custody/iu);
  });

  it("anchors a visible gull cry and anonymizes the heard-unseen bird call", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalGullAlarm(
      wildlifePositionInWindow(window),
      "gull-signal:alarm",
    );
    observeFixtureAnchor(world, player, expression.position);
    const visible = heardVisibleReception(expression);
    const sources = [gullSource(expression)];
    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: sources,
    }).expressions).toEqual([expect.objectContaining({
      sourceActorId: expression.sourceActorId,
      speakerLabel: "Gull",
      text: "KEE-AH!",
    })]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: sources,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Gull",
      text: "KEE-AH!",
      presentationKind: "animal-call",
      animalCallKind: "gull-call",
    });

    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.7,
    });
    if (unseen === null) throw new Error("Hidden gull reception fixture was rejected");
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "A bird",
      text: "CALL! CALL!",
      presentationKind: "animal-call",
      animalCallKind: "bird-call",
      directionLabel: "west",
    });
    expect(JSON.stringify(caption)).not.toMatch(/gull|KEE-AH/iu);
  });

  it("anchors a perceived elk bark and keeps an unseen alarm directional and species-anonymous", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalElkAlarm(
      wildlifePositionInWindow(window),
      "elk-signal:alarm",
    );
    observeFixtureAnchor(world, player, expression.position);
    const visible = heardVisibleReception(expression);
    const source = elkSource(expression);
    const visibleOptions = {
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: [source],
    };
    const visibleView = projectGameView(world, player, visibleOptions);
    expect(visibleView.expressions).toEqual([expect.objectContaining({
      id: expression.eventId,
      acousticKind: "animal-call",
      sourceActorId: expression.sourceActorId,
      sourceKind: "animal",
      speakerLabel: "Elk",
      text: "BARK!",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      tone: "alarmed",
    })]);
    expect(visibleView.acousticText?.[0]).toBe(visibleView.expressions?.[0]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      ...visibleOptions,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Elk",
      text: "BARK!",
      presentationKind: "animal-call",
      animalCallKind: "elk-call",
      assertive: true,
    });
    expect(projectGameView(world, player, {
      ...visibleOptions,
      coreWildlifeExpressionSources: [{ ...source, species: "deer" }],
    }).expressions).toEqual([]);

    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI / 2, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.7,
    });
    if (unseen === null) throw new Error("Hidden elk reception fixture was rejected");
    expect(projectGameView(world, player, {
      ...visibleOptions,
      situatedExpressionReception: unseen,
    }).expressions).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "An animal",
      text: "CALL!",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      directionLabel: "south",
      assertive: true,
    });
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toMatch(/elk|BARK|wolf/iu);
    expect(JSON.stringify(caption)).not.toContain(expression.sourceActorId);
    expect(JSON.stringify(caption)).not.toContain(String(expression.position.localX));
    expect(projectGameView(world, player, {
      situatedExpression: expression,
      coreWildlifeExpressionSources: [source],
    }).expressions).toEqual([]);
  });

  it("anchors a perceived boar grunt and keeps unseen hearing directional and species-anonymous", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalBoarAlarm(
      wildlifePositionInWindow(window),
      "boar-signal:alarm",
    );
    observeFixtureAnchor(world, player, expression.position);
    const visible = heardVisibleReception(expression);
    const source = boarSource(expression);
    const visibleOptions = {
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: [source],
    };
    const visibleView = projectGameView(world, player, visibleOptions);
    expect(visibleView.expressions).toEqual([expect.objectContaining({
      id: expression.eventId,
      acousticKind: "animal-call",
      sourceActorId: expression.sourceActorId,
      sourceKind: "animal",
      speakerLabel: "Wild boar",
      text: "GRUNT!",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      tone: "alarmed",
    })]);
    expect(visibleView.acousticText?.[0]).toBe(visibleView.expressions?.[0]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      ...visibleOptions,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Wild boar",
      text: "GRUNT!",
      presentationKind: "animal-call",
      animalCallKind: "boar-call",
      assertive: true,
    });
    expect(projectGameView(world, player, {
      ...visibleOptions,
      coreWildlifeExpressionSources: [{ ...source, species: "elk" }],
    }).expressions).toEqual([]);

    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI / 2, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.7,
    });
    if (unseen === null) throw new Error("Hidden boar reception fixture was rejected");
    expect(projectGameView(world, player, {
      ...visibleOptions,
      situatedExpressionReception: unseen,
    }).expressions).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "An animal",
      text: "CALL!",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      directionLabel: "south",
      assertive: true,
    });
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toMatch(/boar|GRUNT|wolf/iu);
    expect(JSON.stringify(caption)).not.toContain(expression.sourceActorId);
    expect(JSON.stringify(caption)).not.toContain(String(expression.position.localX));
    expect(projectGameView(world, player, {
      situatedExpression: expression,
      coreWildlifeExpressionSources: [source],
    }).expressions).toEqual([]);
  });

  it("anchors a visible cat weather call while hiding its unseen identity and cause", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalDomesticCatRainDistress(
      wildlifePositionInWindow(window),
      "CAT-living-voice-projection:e:16:retreat",
    );
    observeFixtureAnchor(world, player, expression.position);
    const visible = heardVisibleReception(expression);
    const sources = [domesticCatSource(expression)];
    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: sources,
    }).expressions).toEqual([expect.objectContaining({
      acousticKind: "animal-call",
      sourceActorId: expression.sourceActorId,
      sourceKind: "animal",
      speakerLabel: "Domestic cat",
      text: "MRROW.",
    })]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: sources,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Domestic cat",
      text: "MRROW.",
      presentationKind: "animal-call",
      animalCallKind: "cat-call",
    });

    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.7,
    });
    if (unseen === null) throw new Error("Hidden cat reception fixture was rejected");
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "An animal",
      text: "CALL.",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      directionLabel: "west",
    });
    const serializedCaption = JSON.stringify(caption);
    expect(serializedCaption).not.toContain(expression.sourceActorId);
    expect(serializedCaption).not.toMatch(/cat|MRROW|weather|retreat/iu);
  });

  it("anchors a visible marsh-fox pursuit yip while hiding its unseen identity and cause", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalMarshFoxPursuitYip(
      wildlifePositionInWindow(window),
      "marsh-fox-signal:pursuit-start:prey-hidden",
    );
    observeFixtureAnchor(world, player, expression.position);
    const visible = heardVisibleReception(expression);
    const sources = [marshFoxSource(expression)];

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: sources,
    }).expressions).toEqual([expect.objectContaining({
      acousticKind: "animal-call",
      sourceActorId: expression.sourceActorId,
      sourceKind: "animal",
      speakerLabel: "Marsh fox",
      text: "YIP.",
    })]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: visible,
      coreWildlifeExpressionSources: sources,
    }).expressionCaption).toMatchObject({
      speakerLabel: "Marsh fox",
      text: "YIP.",
      presentationKind: "animal-call",
      animalCallKind: "marsh-fox-call",
    });

    const source = sources[0];
    if (source === undefined) throw new Error("Marsh-fox source fixture was not created");
    const forgedSources: readonly (readonly CoreWildlifeExpressionSource[])[] = [
      [],
      [{ ...source, species: "deer" }],
      [{
        ...source,
        position: createWorldPosition(
          source.position.region,
          source.position.localX + 1,
          source.position.localY,
        ),
      }],
      [source, { ...source }],
    ];
    for (const coreWildlifeExpressionSources of forgedSources) {
      expect(projectGameView(world, player, {
        situatedExpression: expression,
        situatedExpressionReception: visible,
        coreWildlifeExpressionSources,
      }).expressions).toEqual([]);
      expect(projectUIView(world, player, session, {
        economyWorld: compatibility,
        situatedExpression: expression,
        situatedExpressionReception: visible,
        coreWildlifeExpressionSources,
      }).expressionCaption).toBeUndefined();
    }

    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI / 4, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.7,
    });
    if (unseen === null) throw new Error("Hidden marsh-fox reception fixture was rejected");
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "An animal",
      text: "CALL.",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      directionLabel: "south-east",
    });
    const serializedCaption = JSON.stringify(caption);
    expect(serializedCaption).not.toContain(expression.sourceActorId);
    expect(serializedCaption).not.toMatch(/fox|YIP|prey|pursuit/iu);
  });

  it("never teaches a vocal family merely by projecting an authenticated visible caller", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalMarshFoxPursuitYip(
      wildlifePositionInWindow(window),
      "marsh-fox-signal:projection-is-not-learning",
    );
    observeFixtureAnchor(world, player, expression.position);
    player.animalCallKnowledge = createPlayerAnimalCallKnowledge();
    const priorPlayer = structuredClone(player);
    const options = {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: heardVisibleReception(expression),
      coreWildlifeExpressionSources: [marshFoxSource(expression)],
    };
    for (let render = 0; render < 3; render += 1) {
      const view = projectUIView(world, player, session, options);
      expect(view.expressionCaption).toMatchObject({
        speakerLabel: "Marsh fox",
        presentationKind: "animal-call",
        animalCallKind: "marsh-fox-call",
      });
      expect(view.expressionCaption).not.toHaveProperty("recognizedAnimalCall");
      expect(projectGameView(world, player, options).expressions).toHaveLength(1);
    }
    expect(player).toEqual(priorPlayer);
    expect(player.animalCallKnowledge.calls).toEqual([]);
  });

  it("uses previously learned fox sound knowledge without disclosing an unseen caller or cause", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalMarshFoxPursuitYip(
      wildlifePositionInWindow(window),
      "marsh-fox-signal:previously-witnessed-family:prey-hidden",
    );
    const unseen = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI / 4, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.7,
    });
    if (unseen === null) throw new Error("Learned fox hearing fixture was rejected");
    const options = {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: unseen,
    };
    const unlearned = projectUIView(world, player, session, options);
    expect(unlearned.expressionCaption).not.toHaveProperty("recognizedAnimalCall");
    if (unlearned.expressionCaption === undefined) throw new Error("Unlearned fox caption was not projected");
    expect(situatedExpressionCaptionCopy(unlearned.expressionCaption))
      .toBe("[An animal calls somewhere south-east.]");

    // A prior witnessed transaction supplies this bounded knowledge; neither
    // UI nor field projection is allowed to manufacture that transaction.
    const knowledge = rememberPlayerAnimalCall(createPlayerAnimalCallKnowledge(), expression, 42);
    if (knowledge === null) throw new Error("Previously learned fox fixture was rejected");
    player.animalCallKnowledge = knowledge;
    const priorPlayer = structuredClone(player);
    const learned = projectUIView(world, player, session, options);
    const caption = learned.expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "An animal",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      recognizedAnimalCall: "Fox",
      directionLabel: "south-east",
    });
    if (caption === undefined) throw new Error("Learned fox caption was not projected");
    expect(situatedExpressionCaptionVisibleText(caption)).toBe("fox call · south-east");
    expect(situatedExpressionCaptionCopy(caption)).toBe("fox call · south-east");
    expect(learned.revision).not.toBe(unlearned.revision);
    expect(JSON.stringify(learned)).not.toContain(expression.sourceActorId);
    expect(JSON.stringify(learned)).not.toMatch(/pursuit|prey-hidden/iu);
    for (const field of ["sourceActorId", "position", "distanceBand", "bearing", "meaning", "vocalization"]) {
      expect(caption).not.toHaveProperty(field);
    }
    expect(projectGameView(world, player, options).expressions).toEqual([]);
    expect(player).toEqual(priorPlayer);
  });

  it("does not let learned cat calls identify an unseen fox or bypass missing reception", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const position = wildlifePositionInWindow(window);
    const fox = canonicalMarshFoxPursuitYip(position, "marsh-fox-signal:different-learned-family");
    const cat = canonicalDomesticCatRainDistress(position, "CAT-call:previous-witness");
    const knowledge = rememberPlayerAnimalCall(createPlayerAnimalCallKnowledge(), cat, 42);
    if (knowledge === null) throw new Error("Previously learned cat fixture was rejected");
    player.animalCallKnowledge = knowledge;
    const priorPlayer = structuredClone(player);
    const unseen = createHeardUnseenSituatedExpressionReception(fox, 42, {
      bearing: { centerRadians: Math.PI, uncertaintyRadians: Math.PI / 30 },
      distanceBand: { minimum: 4_000, maximum: 12_000 },
      certainty: 0.7,
    });
    if (unseen === null) throw new Error("Different-family fox hearing fixture was rejected");
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: fox,
      situatedExpressionReception: unseen,
    }).expressionCaption;
    expect(caption).toMatchObject({ animalCallKind: "animal-call", directionLabel: "west" });
    expect(caption).not.toHaveProperty("recognizedAnimalCall");
    for (const event of [cat, fox]) {
      expect(projectUIView(world, player, session, {
        economyWorld: compatibility,
        situatedExpression: event,
      }).expressionCaption).toBeUndefined();
    }
    expect(player).toEqual(priorPlayer);
  });

  it("anchors a visible marsh-rabbit thump only to its authenticated body", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalMarshRabbitAlarm(
      wildlifePositionInWindow(window),
      "marsh-rabbit-signal:visible-alarm",
    );
    observeFixtureAnchor(world, player, expression.position);
    const reception = heardVisibleReception(expression);
    const source = marshRabbitSource(expression);

    const game = projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      coreWildlifeExpressionSources: [source],
    });
    expect(game.expressions).toEqual([expect.objectContaining({
      acousticKind: "embodied-signal",
      sourceActorId: expression.sourceActorId,
      sourceKind: "animal",
      speakerLabel: "Marsh rabbit",
      text: "thump",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      tone: "restrained",
    })]);
    expect(game.expressions?.[0]).not.toHaveProperty("criticalCall");
    expect(game.acousticText?.[0]).toBe(game.expressions?.[0]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
      coreWildlifeExpressionSources: [source],
    }).expressionCaption).toMatchObject({
      speakerLabel: "Marsh rabbit",
      text: "thump",
      presentationKind: "embodied-signal",
      tone: "restrained",
      assertive: false,
    });

    const forgedSources: readonly (readonly CoreWildlifeExpressionSource[])[] = [
      [],
      [{ ...source, species: "deer" }],
      [{
        ...source,
        position: createWorldPosition(
          source.position.region,
          source.position.localX + 1,
          source.position.localY,
        ),
      }],
      [source, { ...source }],
    ];
    for (const coreWildlifeExpressionSources of forgedSources) {
      expect(projectGameView(world, player, {
        situatedExpression: expression,
        situatedExpressionReception: reception,
        coreWildlifeExpressionSources,
      }).expressions).toEqual([]);
      expect(projectUIView(world, player, session, {
        economyWorld: compatibility,
        situatedExpression: expression,
        situatedExpressionReception: reception,
        coreWildlifeExpressionSources,
      }).expressionCaption).toBeUndefined();
    }
  });

  it("keeps a heard-unseen marsh-rabbit thump directional but species-anonymous", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalMarshRabbitAlarm(
      wildlifePositionInWindow(window),
      "marsh-rabbit-signal:hidden-alarm",
    );
    const reception = createHeardUnseenSituatedExpressionReception(expression, 42, {
      bearing: { centerRadians: Math.PI * 0.75, uncertaintyRadians: Math.PI / 50 },
      distanceBand: { minimum: 2_000, maximum: 8_000 },
      certainty: 0.72,
    });
    if (reception === null) throw new Error("Hidden marsh-rabbit reception fixture was rejected");

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      coreWildlifeExpressionSources: [marshRabbitSource(expression)],
    }).expressions).toEqual([]);
    const caption = projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
      situatedExpressionReception: reception,
    }).expressionCaption;
    expect(caption).toMatchObject({
      speakerLabel: "An animal",
      text: "thump",
      presentationKind: "embodied-signal",
      directionLabel: "south-west",
      assertive: false,
    });
    expect(caption).not.toHaveProperty("position");
    expect(JSON.stringify(caption)).not.toContain(expression.sourceActorId);
    expect(JSON.stringify(caption)).not.toContain(String(expression.position.localX));
    expect(JSON.stringify(caption)).not.toContain(String(expression.position.localY));
    expect(JSON.stringify(caption)).not.toContain("marsh-rabbit");
    expect(JSON.stringify(caption)).not.toContain("threat");

    expect(projectGameView(world, player, {
      situatedExpression: expression,
    }).expressions).toEqual([]);
    expect(projectUIView(world, player, session, {
      economyWorld: compatibility,
      situatedExpression: expression,
    }).expressionCaption).toBeUndefined();
  });
});
