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
  FIXED_POINT,
  replaceResidentCircadian,
  residentHomeRestDestinationId,
  serializeWorld,
  stepWorld,
} from "../sim/public";
import { queryResidentAttentionState } from "../sim/residentAttention";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
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
  observableResidentBodyMoving,
} from "./projection";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import {
  translateWorldPosition,
  WORLD_POSITION_UNITS_PER_TILE,
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
  it("shows only a directly observed visitor's present rest posture", () => {
    const state = createWorld("visitor sleep is observable, not omniscient", "standard");
    const initial = createWorldView(state);
    const player = createPlayer(initial);
    const settlementId = initial.settlements.find(({ tileIndex }) => (
      tileIndex === playerTileIndex(player)
    ))?.id;
    const residentIndex = state.residents.findIndex((resident) => (
      resident.homeSettlementId !== settlementId
      && resident.activeContractId === null
    ));
    const resident = state.residents[residentIndex];
    if (resident === undefined || settlementId === undefined) {
      throw new Error("fixture needs a visiting human resident");
    }
    resident.location = { kind: "settlement", settlementId };
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
      emotion: "Appears uncertain",
      behavior: "Listening toward a nearby sound",
    },
    {
      cognition: "suspicious" as const,
      quickLabel: "Unknown porter · investigating",
      state: "listening",
      emotionMark: ":S",
      emotion: "Appears uncertain",
      behavior: "Investigating something nearby",
    },
    {
      cognition: "identified" as const,
      quickLabel: "Unknown porter · glancing nearby",
      state: "watching",
      emotionMark: ":|",
      emotion: "Appears calm",
      behavior: "Glancing nearby",
    },
    {
      cognition: "alert" as const,
      quickLabel: "Unknown porter · alert",
      state: "alert",
      emotionMark: ":|",
      emotion: "Appears alert",
      behavior: "Alert and scanning nearby",
    },
    {
      cognition: "searching" as const,
      quickLabel: "Unknown porter",
      state: "waiting",
      emotionMark: ":)",
      emotion: "Appears calm",
      behavior: "Traveling nearby",
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
    });
    expect(porter).not.toHaveProperty("speech");
    expect(rendered.acousticText).toEqual([]);
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

  it("preserves the saved neutral search without turning a traveling body toward it", () => {
    const fixture = presentationFixture("searching", 3);
    const search = queryActorSearch(fixture.resident.perception);
    const placement = resolveResidentWorldPlacement(fixture.world, fixture.resident);
    const projected = projectResidentWorldPosition(fixture.world, fixture.resident, TILE_UNITS);
    if (!search || !placement || !projected) throw new Error("fixture needs an active search");

    expect(search.nextProbe).not.toEqual(search.lastKnownArea.center);
    expect(projected.facing).toBe(placement.facing);
  });

  it("preserves a genuinely moving settlement body's heading during a lawful sideways neutral glance", () => {
    const state = createWorld("resident activity executable rest approach", "standard");
    state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: state.meta.completedTick + 1_000 };
    for (const resident of state.residents) {
      resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
      resident.condition.exhaustion = 100_000;
    }
    // Keep actual native contracts while isolating this short rest proof from
    // unrelated recruitment. No body, heading, task or result is assigned.
    for (const contract of state.contracts) {
      contract.playerExclusiveUntilTick = state.meta.completedTick + 1_000;
      contract.dueTick = state.meta.completedTick + 2_000;
    }
    const native = state.residents.find((resident) => {
      if (resident.location.kind !== "settlement" || resident.activeContractId !== null) return false;
      const source = resolveResidentWorldPlacement(state, resident)?.position;
      const target = residentSettlementRestTarget(state, resident);
      if (source === undefined || target === null
        || !residentRestTargetHasDrySupport(state, source)
        || !residentRestTargetHasDrySupport(state, target)) return false;
      const delta = worldPositionDelta(source, target);
      return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
    });
    if (native === undefined) throw new Error("fixture needs a native one-tile dry rest approach");
    const source = resolveResidentWorldPlacement(state, native)!.position;
    const target = residentSettlementRestTarget(state, native)!;
    const delta = worldPositionDelta(source, target);
    const observedPoint = translateWorldPosition(source, -delta.y * 4, delta.x * 4);
    const observationTick = state.meta.completedTick + 1;
    stepWorld(state, [], perceptionFrame(
      state, native, identifiedObservation(native, observedPoint, observationTick), observationTick,
    ));
    const selected = state.residents.find(({ id }) => id === native.id)!;
    expect(selected.perception.suspicion).toBe("identified");
    expect(queryResidentAttentionState(selected.perception)).toBe("glance");
    // Pressure is set only after the legacy world interval: a newly selected
    // rest approach must not be confused with an already admitted old rest.
    selected.needs.rest = 900_000;
    selected.condition.exhaustion = 300_000;
    expect(adoptResidentActivities(state)).toBe(true);
    expect(prepareResidentRestActivities(state)).toBe(true);
    expect(advanceResidentRestActivities(state, 1)?.movedActorIds).toContain(native.identity.stableId);
    const moving = state.residents.find(({ id }) => id === native.id)!;
    const pose = moving.activity!.poses.at(-1)!;
    expect(moving.location.kind).toBe("settlement");
    expect(moving.activity?.restTask).toMatchObject({ cause: "urgent-rest", phase: "approaching", target });
    expect(pose.position).not.toEqual(source);
    expect(queryResidentAttentionState(moving.perception)).toBe("glance");
    expect(moving.perception.beliefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ subjectId: "player:local", identification: "identified", firstObservedTick: observationTick }),
    ]));

    const world = createWorldView(state);
    const projectedResident = world.residents.find(({ id }) => id === native.id)!;
    const beforeProjection = serializeWorld(state);
    const projected = projectResidentWorldPosition(world, projectedResident, TILE_UNITS);
    if (projected === null) throw new Error("moving native resident must have a projected body");
    expect(serializeWorld(state)).toBe(beforeProjection);
    expect(projectedResident.perception).toEqual(moving.perception);
    const bodyFacing = pose.heading / FIXED_POINT * Math.PI * 2;
    const focusDelta = worldPositionDelta(pose.position, observedPoint);
    expect(Math.abs(Math.atan2(focusDelta.y, focusDelta.x) - bodyFacing)).toBeGreaterThan(0.5);
    expect(projected.facing).toBe(bodyFacing);
  });

  it("shows a real local rest approach as movement without disclosing its purpose", () => {
    const { state, player, residentId } = restMovementFixture();
    expect(advanceResidentRestActivities(state, 1)?.movedActorIds).toContain(
      state.residents.find(({ id }) => id === residentId)!.identity.stableId,
    );
    const world = createWorldView(state);
    const resident = world.residents.find(({ id }) => id === residentId)!;
    const perception = projectPerception(world, player);
    const rendered = projectGameView(world, player, { selectedResidentId: residentId, perception });
    const porter = rendered.porters.find(({ id }) => id === String(residentId));
    const about = projectUIView(world, player, createSessionState(world.seedText), {
      selectedResidentId: residentId, perception,
    }).selectedResident;

    expect(queryResidentAttentionState(resident.perception)).toBe("unaware");
    expect(porter).toMatchObject({ state: "traveling", quickLabel: "Unknown resident · moving" });
    expect(about?.observed).toContainEqual({ label: "Behavior", value: "Moving nearby" });
    expect(rendered.acousticText).toEqual([]);
    const copy = JSON.stringify({ quickLabel: porter?.quickLabel, observed: about?.observed });
    expect(copy).not.toMatch(/urgent-rest|settlement-rest|approaching|restTask|localX|localY/u);
  });

  it("does not call an unstarted local approach movement merely because a task exists", () => {
    const { state, player, residentId } = restMovementFixture();
    const world = createWorldView(state);
    const resident = world.residents.find(({ id }) => id === residentId)!;
    expect(resident.activity?.restTask?.phase).toBe("approaching");
    expect(resident.activity?.poses).toHaveLength(1);
    expect(observableResidentBodyMoving(resident)).toBe(false);
    const perception = projectPerception(world, player);
    expect(projectGameView(world, player, { perception }).porters.find(({ id }) => id === String(residentId)))
      .toMatchObject({ state: "waiting", quickLabel: "Unknown resident" });
    expect(projectUIView(world, player, createSessionState(world.seedText), {
      selectedResidentId: residentId, perception,
    }).selectedResident?.observed).toContainEqual({ label: "Behavior", value: "Waiting nearby" });
  });

  it("validates cold body history and ignores private intentions and earlier movement", () => {
    const { state, residentId } = restMovementFixture();
    expect(advanceResidentRestActivities(state, 1)).not.toBeNull();
    const moving = state.residents.find(({ id }) => id === residentId)!;
    const before = serializeWorld(state);
    expect(observableResidentBodyMoving(moving)).toBe(true);
    const cold = structuredClone(moving);
    expect(observableResidentBodyMoving(cold)).toBe(true);
    // These are predicate/validation fixtures, not claimed gameplay outcomes.
    // Neither task presence nor carry intention supplies displacement proof.
    expect(observableResidentBodyMoving({ ...cold, activity: { ...cold.activity!, restTask: null }, intention: "rest" }))
      .toBe(true);
    const stopped = { ...cold, activity: { ...cold.activity!, poses: [
      ...cold.activity!.poses, cold.activity!.poses.at(-1)!,
    ] } };
    expect(observableResidentBodyMoving(stopped)).toBe(false);
    const absent = structuredClone(cold);
    delete absent.activity;
    absent.intention = "carry";
    expect(observableResidentBodyMoving(absent)).toBe(false);
    expect(observableResidentBodyMoving({ ...cold, activity: { ...cold.activity!, tick: cold.perception.tick - 1 } }))
      .toBe(false);
    expect(observableResidentBodyMoving({ ...cold, activity: { ...cold.activity!, actorId: state.residents.find(({ id }) => id !== residentId)!.identity.stableId } }))
      .toBe(false);
    const sparse = structuredClone(cold);
    delete (sparse.activity!.poses as Array<unknown>)[0];
    expect(observableResidentBodyMoving(sparse)).toBe(false);
    expect(serializeWorld(state)).toBe(before);
  });

  it("withholds actual local movement when the source is outside current sight", () => {
    const { state, player, residentId } = restMovementFixture();
    expect(advanceResidentRestActivities(state, 1)).not.toBeNull();
    const world = createWorldView(state);
    const resident = world.residents.find(({ id }) => id === residentId)!;
    expect(observableResidentBodyMoving(resident)).toBe(true);
    player.x = (world.terrain.width - 0.5) * TILE_UNITS;
    player.y = (world.terrain.height - 0.5) * TILE_UNITS;
    const perception = projectPerception(world, player);
    const placement = projectResidentWorldPosition(world, resident, TILE_UNITS);
    expect(placement).not.toBeNull();
    expect(perception.detailVisibilityGrades[placement!.tileIndex]).toBe(0);
    expect(projectGameView(world, player, { perception }).porters.some(({ id }) => id === String(residentId)))
      .toBe(false);
    expect(projectUIView(world, player, createSessionState(world.seedText), {
      selectedResidentId: residentId, perception,
    }).selectedResident).toBeUndefined();
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

/** Real native source and existing rest adapter; only initial pressure is authored. */
function restMovementFixture() {
  const state = createWorld("resident activity executable rest approach", "standard");
  state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: state.meta.completedTick + 1_000 };
  for (const resident of state.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of state.contracts) {
    contract.playerExclusiveUntilTick = state.meta.completedTick + 1_000;
    contract.dueTick = state.meta.completedTick + 2_000;
  }
  const native = state.residents.find((resident) => {
    if (resident.location.kind !== "settlement" || resident.activeContractId !== null) return false;
    const source = resolveResidentWorldPlacement(state, resident)?.position;
    const target = residentSettlementRestTarget(state, resident);
    if (source === undefined || target === null
      || !residentRestTargetHasDrySupport(state, source)
      || !residentRestTargetHasDrySupport(state, target)) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
  });
  if (native === undefined) throw new Error("fixture needs a native one-tile dry rest approach");
  const source = resolveResidentWorldPlacement(state, native)!.position;
  native.needs.rest = 900_000;
  native.condition.exhaustion = 300_000;
  expect(adoptResidentActivities(state)).toBe(true);
  expect(prepareResidentRestActivities(state)).toBe(true);
  const world = createWorldView(state);
  const player = createPlayer(world);
  // This projection fixture views the actual source at close range. Native
  // runtime tests separately use the unchanged player spawn and real controls.
  player.x = source.localX;
  player.y = source.localY;
  return { state, player, residentId: native.id };
}

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
