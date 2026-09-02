import { describe, expect, it } from "vitest";

import { createWorld, createWorldView, stepWorld } from "../sim/public";
import { VISIBILITY_DIRECT } from "./perception";
import {
  TILE_UNITS,
  createPlayer,
  playerTileIndex,
} from "./player";
import {
  projectGameView,
  projectPerception,
  projectResidentWorldPosition,
} from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";

describe("independent NPC ABOUT disclosure audit", () => {
  it("projects settlement residents as physical, directly inspectable people", () => {
    const state = createWorld("people live at the harbor too", "standard");
    const resident = state.residents[0];
    const settlement = state.settlements.find(({ id }) => id === resident?.homeSettlementId);
    if (!resident || !settlement) throw new Error("fixture needs a resident home");
    const initial = createWorldView(state);
    const tile = initial.terrain.tiles[settlement.tileIndex];
    if (!tile) throw new Error("fixture needs a settlement tile");
    const player = createPlayer(initial);
    player.x = tile.x * TILE_UNITS + TILE_UNITS / 2;
    player.y = tile.y * TILE_UNITS + TILE_UNITS / 2;
    const perception = projectPerception(initial, player);
    const rendered = projectGameView(initial, player, {
      selectedResidentId: resident.id,
      perception,
    });
    const projected = rendered.porters.find(({ id }) => id === String(resident.id));
    const about = projectUIView(initial, player, createSessionState(initial.seedText), {
      selectedResidentId: resident.id,
      perception,
    }).selectedResident;

    expect(projected).toMatchObject({
      quickLabel: "Unknown resident",
      emotionMark: ":)",
    });
    expect(about).toMatchObject({
      heading: "UNKNOWN RESIDENT",
      knowledgeLabel: "Unfamiliar",
      actionLabel: "GREET",
    });
  });

  it("gives a visiting porter a distinct stable crowd position at the destination", () => {
    const state = createWorld("visitors stand among people instead of inside them", "standard");
    const destination = state.settlements[1];
    const visitor = state.residents.find(({ homeSettlementId }) =>
      destination !== undefined && homeSettlementId !== destination.id
    );
    const local = state.residents.find(({ homeSettlementId }) => homeSettlementId === destination?.id);
    if (!destination || !visitor || !local) throw new Error("fixture needs a destination crowd");
    visitor.location = { kind: "settlement", settlementId: destination.id };
    const world = createWorldView(state);

    const visitorPosition = projectResidentWorldPosition(world, visitor, TILE_UNITS);
    const localPosition = projectResidentWorldPosition(world, local, TILE_UNITS);

    expect(visitorPosition).not.toBeNull();
    expect(localPosition).not.toBeNull();
    expect(visitorPosition?.position).not.toEqual(localPosition?.position);
    expect(projectResidentWorldPosition(world, visitor, TILE_UNITS)).toEqual(visitorPosition);
  });

  it("expands a crowded harbor to distinct stable positions without modulo overlap", () => {
    const state = createWorld("every visitor still occupies one place", "standard");
    const destination = state.settlements[0];
    if (!destination) throw new Error("fixture needs a destination");
    for (const resident of state.residents) {
      resident.location = { kind: "settlement", settlementId: destination.id };
    }
    const world = createWorldView(state);
    const byStableId = new Map(world.residents.map((resident) => [
      resident.identity.stableId,
      projectResidentWorldPosition(world, resident, TILE_UNITS)?.position,
    ]));
    const positions = [...byStableId.values()];

    expect(positions).toHaveLength(42);
    expect(positions.every(Boolean)).toBe(true);
    expect(new Set(positions.map((position) => `${position?.x},${position?.y}`)).size).toBe(42);

    const reordered = { ...world, residents: [...world.residents].reverse() };
    for (const resident of reordered.residents) {
      expect(projectResidentWorldPosition(reordered, resident, TILE_UNITS)?.position)
        .toEqual(byStableId.get(resident.identity.stableId));
    }
  });

  it("shows only observable facts until an unknown porter introduces themself", () => {
    const state = createWorld("unknown means unknown", "standard");
    const initial = createWorldView(state);
    const player = createPlayer(initial);
    const route = state.routes[0];
    const resident = state.residents[0];
    if (!route || !resident) throw new Error("fixture needs a route and resident");
    route.path = [playerTileIndex(player)];
    resident.location = { kind: "route", routeId: route.id, progress: 0 };
    resident.intention = "carry";

    const world = createWorldView(state);
    const perception = projectPerception(world, player);
    const rendered = projectGameView(world, player, {
      selectedResidentId: resident.id,
      perception,
    });
    const porter = rendered.porters.find(({ id }) => id === String(resident.id));
    const session = createSessionState(world.seedText);
    const about = projectUIView(world, player, session, {
      selectedResidentId: resident.id,
      perception,
    }).selectedResident;

    expect(perception.detailVisibilityGrades[playerTileIndex(player)]).toBe(VISIBILITY_DIRECT);
    expect(porter).toMatchObject({ quickLabel: "Unknown porter" });
    expect(porter).not.toHaveProperty("name");
    expect(about).toMatchObject({
      heading: "UNKNOWN PORTER",
      knowledgeLabel: "Unfamiliar",
      known: [],
      actionLabel: "GREET",
      actionDisabled: false,
    });
    expect(about?.observed.map(({ label }) => label)).toEqual(expect.arrayContaining([
      "Height",
      "Build",
      "Current state",
      "Emotion",
      "Behavior",
      "Visible gear",
    ]));
    expect(about?.observed.some(({ value }) => value === resident.name)).toBe(false);
    expect(about?.observed.some(({ value }) => value.toLocaleLowerCase() === resident.role)).toBe(false);
  });

  it("describes only presented movement instead of exposing the resident's hidden need goal", () => {
    const state = createWorld("an internal need is not body language", "standard");
    const initial = createWorldView(state);
    const player = createPlayer(initial);
    const resident = state.residents[0];
    const settlement = state.settlements.find(({ id }) => id === resident?.homeSettlementId);
    if (!resident || !settlement) throw new Error("fixture needs a resident home");
    const tile = initial.terrain.tiles[settlement.tileIndex];
    if (!tile) throw new Error("fixture needs a settlement tile");
    player.x = tile.x * TILE_UNITS + TILE_UNITS / 2;
    player.y = tile.y * TILE_UNITS + TILE_UNITS / 2;
    resident.intention = "eat";

    const world = createWorldView(state);
    const about = projectUIView(world, player, createSessionState(world.seedText), {
      selectedResidentId: resident.id,
      perception: projectPerception(world, player),
    }).selectedResident;
    const behavior = about?.observed.find(({ label }) => label === "Behavior")?.value;

    expect(behavior).toBe("Waiting nearby");
    expect(JSON.stringify(about)).not.toContain("Eat");
  });

  it("rejects a mutated detail mask and withholds actor, speech, and ABOUT together", () => {
    const state = createWorld("forged sight cannot identify a porter", "standard");
    const initial = createWorldView(state);
    const player = createPlayer(initial);
    player.facingMilliRadians = 0;
    const baseline = projectPerception(initial, player);
    const targetIndex = baseline.terrainVisibilityStrengths.findIndex((strength, index) =>
      strength > 0 && baseline.detailVisibilityGrades[index] === 0
    );
    if (targetIndex < 0) throw new Error("fixture needs broad-only terrain");
    const route = state.routes[0];
    const resident = state.residents[0];
    if (!route || !resident) throw new Error("fixture needs a route and resident");
    route.path = [targetIndex];
    resident.location = { kind: "route", routeId: route.id, progress: 0 };

    const world = createWorldView(state);
    const authoritative = projectPerception(world, player);
    const forged = {
      ...authoritative,
      detailVisibilityGrades: new Uint8Array(authoritative.detailVisibilityGrades),
      detailVisibleTileIndices: Object.freeze([
        ...authoritative.detailVisibleTileIndices,
        targetIndex,
      ]),
      detailDirectTileIndices: Object.freeze([
        ...authoritative.detailDirectTileIndices,
        targetIndex,
      ]),
    };
    forged.detailVisibilityGrades[targetIndex] = VISIBILITY_DIRECT;

    const rendered = projectGameView(world, player, {
      selectedResidentId: resident.id,
      residentSpeech: new Map([[resident.id, `${resident.name}: private remote speech`]]),
      perception: forged,
    });
    const about = projectUIView(world, player, createSessionState(world.seedText), {
      selectedResidentId: resident.id,
      perception: forged,
    }).selectedResident;

    expect(authoritative.terrainVisibilityStrengths[targetIndex]).toBeGreaterThan(0);
    expect(authoritative.detailVisibilityGrades[targetIndex]).toBe(0);
    expect(rendered.porters.some(({ id }) => id === String(resident.id))).toBe(false);
    expect(JSON.stringify(rendered)).not.toContain("private remote speech");
    expect(about).toBeUndefined();
  });

  it("disables conversation while ADRIFT and removes GREET after a real introduction", () => {
    const state = createWorld("conversation waits for footing", "standard");
    const initial = createWorldView(state);
    const player = createPlayer(initial);
    const route = state.routes[0];
    const resident = state.residents[0];
    if (!route || !resident) throw new Error("fixture needs a route and resident");
    route.path = [playerTileIndex(player)];
    resident.location = { kind: "route", routeId: route.id, progress: 0 };
    player.mode = "swept";
    const adriftWorld = createWorldView(state);
    const adriftAbout = projectUIView(
      adriftWorld,
      player,
      createSessionState(adriftWorld.seedText),
      {
        selectedResidentId: resident.id,
        perception: projectPerception(adriftWorld, player),
      },
    ).selectedResident;
    expect(adriftAbout).toMatchObject({
      actionLabel: "GREET",
      actionDisabled: true,
      actionHint: "Reach footing before speaking.",
    });

    stepWorld(state, [{ id: "seen", type: "observe-resident", residentId: resident.id }]);
    stepWorld(state, [{
      id: "introduced",
      type: "greet-resident",
      residentId: resident.id,
      observedTick: 1,
    }]);
    player.mode = "foot";
    const acquaintedWorld = createWorldView(state);
    const acquainted = projectUIView(
      acquaintedWorld,
      player,
      createSessionState(acquaintedWorld.seedText),
      {
        selectedResidentId: resident.id,
        perception: projectPerception(acquaintedWorld, player),
      },
    ).selectedResident;
    expect(acquainted?.knowledgeLabel).toBe("Acquainted");
    expect(acquainted).not.toHaveProperty("actionLabel");
  });

  it("does not leak an unknown requester's name through a Promise card", () => {
    const state = createWorld("a signed need is not omniscient", "standard");
    const world = createWorldView(state);
    const requester = world.residents.find(({ id }) =>
      world.contracts.some((contract) => contract.requesterResidentId === id)
    );
    if (!requester) throw new Error("fixture needs a requester");
    const player = createPlayer(world);
    const view = projectUIView(world, player, createSessionState(world.seedText), {
      perception: projectPerception(world, player),
    });
    const requesterCards = view.contracts.filter((contract) =>
      world.contracts.find(({ id }) => String(id) === contract.id)?.requesterResidentId === requester.id
    );
    expect(requesterCards.length).toBeGreaterThan(0);
    expect(requesterCards.every(({ requester: copy }) => copy === "Requested by a local resident"))
      .toBe(true);
    expect(JSON.stringify(requesterCards)).not.toContain(requester.name);
  });
});
