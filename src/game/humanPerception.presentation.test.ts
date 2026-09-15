import { describe, expect, it } from "vitest";

import {
  createActorObservation,
  queryActorSearch,
  type ActorObservation,
} from "../sim/actorPerception";
import {
  LIVING_CIRCADIAN_OWNER_ID,
  LIVING_CIRCADIAN_VERSION,
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  createWorld,
  createWorldView,
  replaceResidentCircadian,
  residentHomeRestDestinationId,
  stepWorld,
} from "../sim/public";
import type { ResidentState, WorldState, WorldView } from "../sim/types";
import {
  TILE_UNITS,
  createPlayer,
  playerTileIndex,
  type PlayerState,
} from "./player";
import {
  projectGameView,
  projectPerception,
  projectResidentWorldPosition,
} from "./projection";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import {
  translateWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

type PresentedCognition = "noticed" | "suspicious" | "identified" | "alert" | "searching";

interface PresentationFixture {
  readonly state: WorldState;
  readonly world: WorldView;
  readonly player: PlayerState;
  readonly resident: ResidentState;
  readonly observedPoint: WorldPosition;
}

describe("existing-human perception presentation", () => {
  it("shows only a directly observed keeper's present rest posture", () => {
    const state = createWorld("keeper sleep is observable, not omniscient", "standard");
    const initial = createWorldView(state);
    const player = createPlayer(initial);
    const settlementId = initial.settlements.find(({ tileIndex }) => (
      tileIndex === playerTileIndex(player)
    ))?.id;
    const residentIndex = state.residents.findIndex((resident) => (
      resident.location.kind === "settlement"
      && resident.location.settlementId === settlementId
      && resident.homeSettlementId === settlementId
    ));
    const resident = state.residents[residentIndex];
    if (resident === undefined) throw new Error("fixture needs a local human resident");
    const restDestinationId = residentHomeRestDestinationId(
      resident.identity.stableId,
      resident.homeSettlementId,
    );
    if (restDestinationId === null) throw new Error("fixture needs a valid home destination");
    state.residents[residentIndex] = replaceResidentCircadian(resident, {
      atTick: state.meta.completedTick,
      circadian: {
        version: LIVING_CIRCADIAN_VERSION,
        ownerId: LIVING_CIRCADIAN_OWNER_ID,
        policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
        restDestinationId,
        restDestinationArrived: true,
        posture: { state: "asleep", enteredAtTick: state.meta.completedTick },
      },
    });

    const world = createWorldView(state);
    const projectedResident = world.residents[residentIndex]!;
    const perception = projectPerception(world, player);
    const porter = projectGameView(world, player, {
      selectedResidentId: projectedResident.id,
      perception,
    }).porters.find(({ id }) => id === String(projectedResident.id));
    const about = projectUIView(world, player, createSessionState(world.seedText), {
      selectedResidentId: projectedResident.id,
      perception,
    }).selectedResident;

    expect(porter).toMatchObject({
      quickLabel: expect.stringContaining(" · asleep"),
      state: "resting",
      conditionLabels: expect.arrayContaining(["Asleep"]),
    });
    expect(porter).not.toHaveProperty("speech");
    expect(about?.observed).toContainEqual({
      label: "Emotion",
      value: "Hard to read while asleep",
    });
    expect(about?.observed).toContainEqual({ label: "Behavior", value: "Asleep here" });
    expect(about?.observed.find(({ label }) => label === "Current state")?.value)
      .toContain("Asleep");
    expect(about?.known.some(({ label }) => label === "Home")).toBe(false);
    expect(JSON.stringify({ porter, about })).not.toContain(restDestinationId);
  });

  it.each([
    {
      cognition: "noticed" as const,
      quickLabel: "Unknown porter · listening",
      state: "listening",
      emotionMark: ":S",
      speech: "Thought I heard something.",
      emotion: "Appears uncertain",
      behavior: "Listening toward a nearby sound",
    },
    {
      cognition: "suspicious" as const,
      quickLabel: "Unknown porter · investigating",
      state: "listening",
      emotionMark: ":S",
      speech: "Who's there?",
      emotion: "Appears uncertain",
      behavior: "Investigating something nearby",
    },
    {
      cognition: "identified" as const,
      quickLabel: "Unknown porter · watching you",
      state: "watching",
      emotionMark: ":|",
      speech: "I see you.",
      emotion: "Appears calm",
      behavior: "Watching you",
    },
    {
      cognition: "alert" as const,
      quickLabel: "Unknown porter · alert",
      state: "alert",
      emotionMark: ":|",
      speech: "What was that?",
      emotion: "Appears alert",
      behavior: "Alert and scanning nearby",
    },
    {
      cognition: "searching" as const,
      quickLabel: "Unknown porter · searching nearby",
      state: "searching",
      emotionMark: ":S",
      speech: "I saw someone here.",
      emotion: "Appears wary",
      behavior: "Searching the nearby area",
    },
  ])("maps $cognition into observable quick and ABOUT copy", (expected) => {
    const fixture = presentationFixture(expected.cognition);
    const perception = projectPerception(fixture.world, fixture.player);
    const rendered = projectGameView(fixture.world, fixture.player, {
      selectedResidentId: fixture.resident.id,
      perception,
    });
    const porter = rendered.porters.find(({ id }) => id === String(fixture.resident.id));
    const about = projectUIView(
      fixture.world,
      fixture.player,
      createSessionState(fixture.world.seedText),
      {
        selectedResidentId: fixture.resident.id,
        perception,
      },
    ).selectedResident;

    expect(porter).toMatchObject({
      quickLabel: expected.quickLabel,
      state: expected.state,
      emotionMark: expected.emotionMark,
      speech: expected.speech,
    });
    expect(about?.observed.find(({ label }) => label === "Emotion")?.value)
      .toBe(expected.emotion);
    expect(about?.observed.find(({ label }) => label === "Behavior")?.value)
      .toBe(expected.behavior);

    // Presentation may summarize visible posture, but it never serializes the
    // cognition record, exact fixed-point strengths, or a hidden target point.
    for (const hiddenKey of [
      "attentionKeys",
      "beliefs",
      "confidence",
      "salience",
      "search",
      "suspicionPressure",
    ]) {
      expect(porter).not.toHaveProperty(hiddenKey);
      expect(about).not.toHaveProperty(hiddenKey);
    }
    const disclosedCopy = JSON.stringify({
      quickLabel: porter?.quickLabel,
      speech: porter?.speech,
      observed: about?.observed,
      known: about?.known,
    });
    expect(disclosedCopy).not.toContain(fixture.resident.identity.stableId);
    expect(disclosedCopy).not.toContain(`"localX":${fixture.observedPoint.localX}`);
    expect(disclosedCopy).not.toContain(`"localY":${fixture.observedPoint.localY}`);
    expect(disclosedCopy).not.toMatch(/650000|700000|1000000/u);

    if (
      expected.cognition === "noticed"
      || expected.cognition === "suspicious"
      || expected.cognition === "alert"
    ) {
      expect(disclosedCopy).not.toContain("watching you");
      expect(disclosedCopy).not.toContain("I see you");
    }
  });

  it("turns a searching human toward the deterministic saved probe", () => {
    const fixture = presentationFixture("searching", 3);
    const search = queryActorSearch(fixture.resident.perception);
    const placement = resolveResidentWorldPlacement(fixture.world, fixture.resident);
    const projected = projectResidentWorldPosition(fixture.world, fixture.resident, TILE_UNITS);
    if (!search || !placement || !projected) throw new Error("fixture needs an active search");
    const expectedDelta = worldPositionDelta(placement.position, search.nextProbe);
    const expectedFacing = Math.atan2(expectedDelta.y, expectedDelta.x);

    expect(search.nextProbe).not.toEqual(search.lastKnownArea.center);
    expect(projected.facing).toBeCloseTo(expectedFacing, 8);
  });

  it("withholds cognition, learned identity, speech, and ABOUT outside exact detail sight", () => {
    const state = createWorld("hidden attention is not player knowledge", "standard");
    const initial = createWorldView(state);
    const player = createPlayer(initial);
    const perception = projectPerception(initial, player);
    const targetIndex = perception.detailVisibilityGrades.findIndex((grade, index) =>
      grade === 0 && player.discovered[index] === 0
    );
    const route = state.routes[0];
    const resident = state.residents[0];
    if (targetIndex < 0 || !route || !resident) {
      throw new Error("fixture needs an unexplored tile, route, and resident");
    }
    route.path = [targetIndex];
    resident.location = { kind: "route", routeId: route.id, progress: 0 };
    resident.intention = "rest";
    resident.activeContractId = null;
    resident.playerKnowledge = {
      level: "acquainted",
      firstObservedTick: 0,
      introducedTick: 0,
      facts: ["name", "occupation", "home"],
    };
    const configured = createWorldView(state);
    const placement = resolveResidentWorldPlacement(configured, resident);
    if (!placement) throw new Error("fixture needs a physical hidden resident");
    const observation = identifiedObservation(resident, placement.position, 1);
    stepWorld(state, [], perceptionFrame(state, resident, observation, 1));

    const world = createWorldView(state);
    const currentPerception = projectPerception(world, player);
    const rendered = projectGameView(world, player, {
      selectedResidentId: resident.id,
      residentSpeech: new Map([[resident.id, "Private remote speech"]]),
      perception: currentPerception,
    });
    const ui = projectUIView(world, player, createSessionState(world.seedText), {
      selectedResidentId: resident.id,
      perception: currentPerception,
    });

    expect(player.discovered[targetIndex]).toBe(0);
    expect(currentPerception.detailVisibilityGrades[targetIndex]).toBe(0);
    expect(rendered.porters.some(({ id }) => id === String(resident.id))).toBe(false);
    expect(ui.selectedResident).toBeUndefined();
    expect(JSON.stringify(rendered.porters)).not.toContain("Private remote speech");
    expect(JSON.stringify(rendered.porters)).not.toContain(resident.name);
  });
});

function presentationFixture(
  cognition: PresentedCognition,
  finalTickOffset = cognition === "searching" ? 2 : 1,
): PresentationFixture {
  const state = createWorld(
    `presentation ${cognition} ${finalTickOffset}`,
    "standard",
  );
  const initialTick = state.meta.completedTick;
  const observationTick = initialTick + 1;
  const finalTick = initialTick + finalTickOffset;
  const initial = createWorldView(state);
  const player = createPlayer(initial);
  const resident = state.residents[0];
  const route = state.routes[0];
  if (!resident || !route) throw new Error("fixture needs a resident and route");
  route.path = [playerTileIndex(player)];
  resident.location = { kind: "route", routeId: route.id, progress: 0 };
  resident.intention = "rest";
  resident.activeContractId = null;

  const configured = createWorldView(state);
  const placement = resolveResidentWorldPlacement(configured, resident);
  if (!placement) throw new Error("fixture needs a resident placement");
  const observedPoint = translateWorldPosition(placement.position, 4_000, 0);
  const observation = cognition === "identified" || cognition === "searching"
    ? identifiedObservation(resident, observedPoint, observationTick)
    : heardObservation(resident, observedPoint, cognition, observationTick);
  stepWorld(
    state,
    [],
    perceptionFrame(state, resident, observation, observationTick),
  );
  for (let tick = observationTick + 1; tick <= finalTick; tick += 1) stepWorld(state);

  const world = createWorldView(state);
  const projectedResident = world.residents.find(({ id }) => id === resident.id);
  if (!projectedResident) throw new Error("fixture lost its resident");
  expect(projectedResident.perception.suspicion).toBe(cognition);
  return { state, world, player, resident: projectedResident, observedPoint };
}

function identifiedObservation(
  resident: ResidentState,
  point: WorldPosition,
  tick: number,
): ActorObservation {
  const observation = createActorObservation({
    id: `presentation-sight-${resident.id}-${tick}`,
    observerId: resident.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "human",
    subjectId: "player:local",
    area: { center: point, radiusUnits: 0 },
    confidence: 900_000,
    salience: 850_000,
    identification: "identified",
  });
  if (!observation) throw new Error("fixture visual observation must be valid");
  return observation;
}

function heardObservation(
  resident: ResidentState,
  point: WorldPosition,
  cognition: "noticed" | "suspicious" | "alert",
  tick: number,
): ActorObservation {
  const strength = cognition === "noticed" ? 300_000 : 700_000;
  const observation = createActorObservation({
    id: `presentation-sound-${resident.id}-${tick}`,
    observerId: resident.identity.stableId,
    observedAtTick: tick,
    channel: "hearing",
    perceivedClass: "movement-sound",
    area: { center: point, radiusUnits: 2_000 },
    confidence: strength,
    salience: strength,
    identification: "anonymous",
    interrupt: cognition === "alert" ? "strong" : "none",
  });
  if (!observation) throw new Error("fixture sound observation must be valid");
  return observation;
}

function perceptionFrame(
  world: WorldState,
  resident: ResidentState,
  observation: ActorObservation,
  tick: number,
) {
  return {
    tick,
    residents: world.residents.map((candidate) => ({
      residentId: candidate.id,
      actorId: candidate.identity.stableId,
      observations: candidate.id === resident.id ? [observation] : [],
    })),
  };
}
