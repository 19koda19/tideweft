import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  createDirectContactWorldAcousticReception,
  createHeardUnseenWorldAcousticReception,
  createHeardVisibleWorldAcousticReception,
  createSelfWorldAcousticReception,
  projectWorldAcousticText,
  realizeWorldAcousticText,
  type WorldAcousticPresentationReception,
} from "./worldAcousticPresentation";
import {
  createWorldAcousticEvent,
  type WorldAcousticEvent,
  type WorldAcousticEventInput,
} from "./worldAcoustics";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";

function fixture() {
  const state = createWorld("world acoustic presentation", "standard");
  const compatibility = createWorldView(state);
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({
      rootSeed: state.meta.rootSeed,
      center: createRegionCoord(0, 0),
    }),
  );
  const knowledge = projectRegionalCartographyWindow(
    createRegionalCartography(state.meta.rootSeed),
    window,
  );
  const world = createRegionalWorldView(compatibility, window, knowledge);
  const address = window.addresses[22 * window.terrain.width + 18];
  if (address === undefined) throw new Error("acoustic fixture left the regional window");
  const position = createWorldPosition(
    address.region,
    address.localX * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    address.localY * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
  );
  return { world, position };
}

function event(
  overrides: Partial<WorldAcousticEventInput> = {},
): WorldAcousticEvent {
  const { position } = fixture();
  const created = createWorldAcousticEvent({
    triggerEventId: "traversal:projection:1",
    domain: "traversal",
    sourceId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    sourceCategory: "human",
    sourcePosition: position,
    occurredAtTick: 19,
    action: "slide",
    sourceMaterial: "body",
    surfaceMaterial: "stone",
    semanticFamily: "scrape",
    intensity: 520_000,
    rangeUnits: 18_000,
    durationSteps: 6,
    priority: 540_000,
    salience: 680_000,
    repetitionKey: "player:stone:scrape",
    textualEligibility: "salience-gated",
    accessibilityRelevance: "informative",
    variantSeed: 0x1234,
    ...overrides,
  });
  if (created === null) throw new Error("acoustic event fixture was rejected");
  return created;
}

describe("world acoustic text projection", () => {
  it("projects a self-received salient scrape with deterministic restrained vocabulary", () => {
    const { world } = fixture();
    const acousticEvent = event();
    const reception = createSelfWorldAcousticReception(acousticEvent);
    if (reception === null) throw new Error("self acoustic receipt was rejected");
    const input = {
      world,
      event: acousticEvent,
      reception,
      remainingSteps: 4,
      tileSize: 24,
    } as const;

    const first = projectWorldAcousticText(input);
    const second = projectWorldAcousticText(input);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      acousticKind: "physical",
      id: acousticEvent.eventId,
      sourceId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      sourceKind: "player",
      position: { x: (18 + 0.5) * 24, y: (22 + 0.5) * 24 },
      progress: 1 - 4 / 6,
      priority: 540_000,
      salience: 680_000,
      tone: "restrained",
      semanticFamily: "scrape",
    });
    expect(["scrape", "scritch"]).toContain(first?.text);
  });

  it("requires an event-bound lawful receipt and never exact-anchors unseen hearing", () => {
    const { world, position } = fixture();
    const acousticEvent = event();
    const other = event({
      triggerEventId: "traversal:projection:other",
      sourceId: "object:hidden-crate",
      sourceCategory: "object",
      sourcePosition: position,
    });
    const visible = createHeardVisibleWorldAcousticReception(acousticEvent);
    const unseen = createHeardUnseenWorldAcousticReception(acousticEvent, {
      bearing: { centerRadians: 0.5, uncertaintyRadians: 0.2 },
      distanceBand: { minimum: 2_000, maximum: 8_000 },
      certainty: 0.72,
    });
    const mismatched = createHeardVisibleWorldAcousticReception(other);
    const directContact = createDirectContactWorldAcousticReception(other);
    const base = {
      world,
      event: acousticEvent,
      remainingSteps: 4,
      tileSize: 24,
    } as const;

    expect(projectWorldAcousticText({ ...base, reception: visible })).not.toBeNull();
    for (const reception of [null, unseen, mismatched]) {
      expect(projectWorldAcousticText({ ...base, reception })).toBeNull();
    }
    const forged = {
      ...visible,
      directVisualReceipt: false,
    } as unknown as WorldAcousticPresentationReception;
    expect(projectWorldAcousticText({ ...base, reception: forged })).toBeNull();
    expect(createSelfWorldAcousticReception(other)).toBeNull();
    expect(projectWorldAcousticText({
      ...base,
      event: other,
      reception: directContact,
    })).not.toBeNull();
  });

  it("salience-gates routine contact and respects audio-only eligibility", () => {
    const { world } = fixture();
    const routine = event({
      triggerEventId: "foliage:routine",
      action: "brush",
      surfaceMaterial: "foliage",
      semanticFamily: "rustle",
      intensity: 320_000,
      priority: 360_000,
      salience: 450_000,
      accessibilityRelevance: "routine",
    });
    const informative = event({
      triggerEventId: "foliage:informative",
      action: "brush",
      surfaceMaterial: "foliage",
      semanticFamily: "rustle",
      intensity: 320_000,
      priority: 500_000,
      salience: 600_000,
      accessibilityRelevance: "routine",
    });
    const audioOnly = event({
      triggerEventId: "traversal:audio-only",
      textualEligibility: "audio-only",
    });
    const project = (acousticEvent: WorldAcousticEvent) => projectWorldAcousticText({
      world,
      event: acousticEvent,
      reception: createHeardVisibleWorldAcousticReception(acousticEvent),
      remainingSteps: 3,
      tileSize: 24,
    });

    expect(project(routine)).toBeNull();
    expect(project(informative)).toMatchObject({ text: "rustle" });
    expect(project(audioOnly)).toBeNull();
  });

  it("realizes an animal chorus as one restrained anonymous semantic", () => {
    const chorus = event({
      triggerEventId: "ecology:aggregate:chorus:heard",
      domain: "actor-vocalization",
      sourceId: "aggregate:private-frog-identity",
      sourceCategory: "animal",
      action: "vocalize",
      sourceMaterial: "body",
      surfaceMaterial: "mixed",
      semanticFamily: "chorus",
      soundClass: "animal-call",
      interrupt: "none",
      intensity: 460_000,
      priority: 480_000,
      salience: 650_000,
      repetitionKey: "aggregate-chorus:anonymous",
      accessibilityRelevance: "informative",
    });

    expect(realizeWorldAcousticText(chorus, 3)).toEqual({
      text: "chorus",
      tone: "restrained",
      priority: 480_000,
      salience: 650_000,
      semanticFamily: "chorus",
    });
    expect(projectWorldAcousticText({
      world: fixture().world,
      event: chorus,
      reception: createHeardVisibleWorldAcousticReception(chorus),
      remainingSteps: 3,
      tileSize: 24,
    })).toBeNull();
  });

  it("fails closed outside the loaded window and on malformed lifetime or scale", () => {
    const { world } = fixture();
    const outside = event({
      sourcePosition: createWorldPosition(createRegionCoord(8, 8), 1_000, 1_000),
    });
    const reception = createHeardVisibleWorldAcousticReception(outside);
    const base = { world, event: outside, reception, remainingSteps: 3, tileSize: 24 };
    expect(projectWorldAcousticText(base)).toBeNull();

    const inside = event();
    const insideReception = createHeardVisibleWorldAcousticReception(inside);
    for (const [remainingSteps, tileSize] of [
      [0, 24],
      [7, 24],
      [3, 0],
      [3, Number.NaN],
    ] as const) {
      expect(projectWorldAcousticText({
        world,
        event: inside,
        reception: insideReception,
        remainingSteps,
        tileSize,
      })).toBeNull();
    }
  });
});
