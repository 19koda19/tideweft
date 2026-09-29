import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { TILE_UNITS, createPlayer } from "./player";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { projectGameView, projectResidentWorldPosition } from "./projection";
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
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";

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
        id: "situated-expression:event:v1:2011fc98f7767b00",
        sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
        sourceKind: "player",
        speakerLabel: "You",
        text: "Hold fast.",
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
      directionLabel: "east",
    });
    expect(ui.expressionCaption).not.toHaveProperty("position");
    expect(JSON.stringify(ui.expressionCaption)).not.toContain(dog.identity.stableId);
    expect(JSON.stringify(ui.expressionCaption)).not.toContain(
      String(dog.address.position.localX),
    );
  });
});
