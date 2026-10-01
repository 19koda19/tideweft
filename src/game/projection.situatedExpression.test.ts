import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { TILE_UNITS, createPlayer } from "./player";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  projectGameView,
  projectResidentWorldPosition,
  type CoreWildlifeExpressionSource,
} from "./projection";
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
import { createRegionalWorldView } from "./regionalWorldView";
import {
  SITUATED_EXPRESSION_VERSION,
  advanceSituatedExpression,
  createSituatedExpressionState,
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
} from "./worldPosition";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import { MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY } from "./coreWildlifeSignalExpression";

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

function marshRabbitSource(event: SituatedExpressionEvent): CoreWildlifeExpressionSource {
  return Object.freeze({
    actorId: event.sourceActorId,
    species: "marsh-rabbit",
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

  it("adapts directly visible resident speech into the shared acoustic layer", () => {
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
    const residentId = Number(visiblePorter.id);
    const speech = "Mind the wet stone.";

    const view = projectGameView(world, player, {
      residentSpeech: new Map([[residentId, speech]]),
    });

    expect(view.porters.find(({ id }) => id === visiblePorter.id)?.speech).toBe(speech);
    expect(view.acousticText).toContainEqual(expect.objectContaining({
      acousticKind: "speech",
      sourceKind: "human",
      text: speech,
      position: visiblePorter.position,
    }));
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
    expect(visiblePorter?.speech).not.toBe("Holding here until this eases.");
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

  it("anchors a heard-visible guardian bark to its authenticated dog without inventing a name", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const dog = dogInWindow(window);
    const dogActorRoster = createDogActorRoster([dog]);
    const expression = canonicalDogWarning(dog, "dog-signal:visible-warning");
    const reception = heardVisibleReception(expression);

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
    })]);
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
    const reception = heardVisibleReception(expression);

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
    const reception = heardVisibleReception(expression);

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

  it("anchors a visible marsh-rabbit thump only to its authenticated body", () => {
    const { compatibility, player, window, world } = projectionFixture(COMPATIBILITY_REGION);
    const session = createSessionState(world.seedText);
    const expression = canonicalMarshRabbitAlarm(
      wildlifePositionInWindow(window),
      "marsh-rabbit-signal:visible-alarm",
    );
    const reception = heardVisibleReception(expression);
    const source = marshRabbitSource(expression);

    expect(projectGameView(world, player, {
      situatedExpression: expression,
      situatedExpressionReception: reception,
      coreWildlifeExpressionSources: [source],
    }).expressions).toEqual([expect.objectContaining({
      acousticKind: "embodied-signal",
      sourceActorId: expression.sourceActorId,
      sourceKind: "animal",
      speakerLabel: "Marsh rabbit",
      text: "thump",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      tone: "restrained",
    })]);
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
