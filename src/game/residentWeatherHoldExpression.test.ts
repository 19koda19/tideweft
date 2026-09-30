import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  stepWorld,
  type SimEvent,
  type WorldView,
} from "../sim/public";
import { resolveResidentWorldPlacementAtEventLocation } from "./residentSpatial";
import {
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionMemory,
  type SituatedExpressionState,
} from "./situatedExpression";
import {
  RESIDENT_WEATHER_HOLD_EXPRESSION_DURATION_STEPS,
  RESIDENT_WEATHER_HOLD_EXPRESSION_PRIORITY,
  RESIDENT_WEATHER_HOLD_EXPRESSION_SALIENCE,
  residentWeatherHoldExpressionEventForTrigger,
  residentWeatherHoldExpressionEventMatchesWorld,
  residentWeatherHoldExpressionIntent,
  residentWeatherHoldExpressionMemoryMatchesWorld,
  residentWeatherHoldTriggerEventId,
} from "./residentWeatherHoldExpression";

interface WeatherHoldFixture {
  readonly world: WorldView;
  readonly event: SimEvent;
  readonly contractId: number;
  readonly residentId: number;
}

function weatherHoldFixture(): WeatherHoldFixture {
  const state = createWorld("a resident names the weather hold", "standard");
  const contract = state.contracts.find(({ status }) => status === "offered");
  if (contract === undefined) throw new Error("fixture needs an offered Promise");
  const resident = state.residents.find(({ activeContractId, location }) => (
    activeContractId === null
    && location.kind === "settlement"
    && location.settlementId === contract.originSettlementId
  ));
  if (resident === undefined) throw new Error("fixture needs an origin resident");
  state.weather = {
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  stepWorld(state, [{
    id: "resident-weather-hold-accept",
    type: "accept-contract",
    carrier: "resident",
    contractId: contract.id,
    residentId: resident.id,
  }]);
  stepWorld(state);
  if (contract.status !== "in-transit" || resident.location.kind !== "route") {
    throw new Error("fixture resident did not depart");
  }
  state.weather = {
    kind: "storm",
    intensity: 950_000,
    windX: 500_000,
    windY: -500_000,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  stepWorld(state);
  const event = [...state.events].reverse().find((candidate) => (
    candidate.type === "resident-sheltered" && candidate.subjectId === resident.id
  ));
  if (event === undefined || !resident.condition.sheltering) {
    throw new Error("fixture resident did not enter weather shelter");
  }
  return {
    world: createWorldView(state),
    event,
    contractId: contract.id,
    residentId: resident.id,
  };
}

function cloned(value: WeatherHoldFixture): WeatherHoldFixture {
  const world = structuredClone(value.world);
  const event = world.events.find(({ sequence }) => sequence === value.event.sequence);
  if (event === undefined) throw new Error("clone lost its shelter event");
  return { ...value, world, event };
}

function map(value: WeatherHoldFixture): SituatedExpressionIntent | null {
  return residentWeatherHoldExpressionIntent({ world: value.world, event: value.event });
}

function acceptedExpression(
  intent: SituatedExpressionIntent,
): Readonly<{ event: SituatedExpressionEvent; state: SituatedExpressionState }> {
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduction.accepted || reduction.event === null || reduction.state === null) {
    throw new Error(`fixture expression was not accepted: ${reduction.reason}`);
  }
  return { event: reduction.event, state: reduction.state };
}

describe("resident weather-hold situated-expression producer", () => {
  it("derives deterministic restrained speech at the exact committed route locus", () => {
    const value = weatherHoldFixture();
    const resident = value.world.residents.find(({ id }) => id === value.residentId);
    if (resident === undefined) throw new Error("fixture lost its resident");
    const routeId = value.event.data.eventRouteId;
    const progress = value.event.data.eventRouteProgress;
    if (typeof routeId !== "number" || typeof progress !== "number") {
      throw new Error("fixture event omitted its route locus");
    }
    const placement = resolveResidentWorldPlacementAtEventLocation(
      value.world,
      resident,
      { kind: "route", routeId, progress },
      null,
    );
    if (placement === null) throw new Error("fixture route locus is not physical");

    const first = map(value);
    const second = residentWeatherHoldExpressionIntent({
      world: structuredClone(value.world),
      event: structuredClone(value.event),
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      sourceActorId: resident.identity.stableId,
      triggerEventId:
        `sim-event:resident-sheltered:${value.event.sequence}:${resident.id}`,
      position: placement.position,
      meaning: "resident-weather-hold",
      family: "condition",
      tone: "restrained",
      volume: "spoken",
      knowledgeBasis: "self-weather-distress",
      priority: RESIDENT_WEATHER_HOLD_EXPRESSION_PRIORITY,
      salience: RESIDENT_WEATHER_HOLD_EXPRESSION_SALIENCE,
      durationSteps: RESIDENT_WEATHER_HOLD_EXPRESSION_DURATION_STEPS,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(residentWeatherHoldTriggerEventId(value.event)).toBe(
      `sim-event:resident-sheltered:${value.event.sequence}:${resident.id}`,
    );
    if (first === null) throw new Error("fixture omitted its weather-hold intent");
    expect(projectSituatedExpression(acceptedExpression(first).event)?.text).toBe(
      "We'll hold here.",
    );
  });

  it("reauthenticates evolved active and cooldown state from the same event", () => {
    const value = weatherHoldFixture();
    const intent = map(value);
    if (intent === null) throw new Error("fixture omitted its weather-hold intent");
    const accepted = acceptedExpression(intent);

    expect(residentWeatherHoldExpressionEventForTrigger(
      value.world,
      intent.triggerEventId,
    )).toEqual(accepted.event);
    expect(residentWeatherHoldExpressionEventMatchesWorld(
      value.world,
      accepted.event,
    )).toBe(true);

    value.event.data.playerObserved = true;
    expect(residentWeatherHoldExpressionEventForTrigger(
      value.world,
      intent.triggerEventId,
    )).toEqual(accepted.event);
    expect(residentWeatherHoldExpressionEventMatchesWorld(
      value.world,
      accepted.event,
    )).toBe(true);

    const acknowledged = acknowledgeSituatedExpression(accepted.state);
    const advanced = acknowledged.state === null
      ? null
      : advanceSituatedExpression(acknowledged.state, 3);
    const memory = advanced?.recent[0];
    if (advanced?.active === null || advanced === null || memory === undefined) {
      throw new Error("fixture weather-hold expression expired unexpectedly");
    }
    expect(residentWeatherHoldExpressionEventMatchesWorld(
      value.world,
      advanced.active,
    )).toBe(true);
    expect(residentWeatherHoldExpressionMemoryMatchesWorld(
      value.world,
      memory,
    )).toBe(true);
  });

  it("keeps retained speech at event-time position after the resident resumes movement", () => {
    const value = cloned(weatherHoldFixture());
    const intent = map(value);
    if (intent === null) throw new Error("fixture omitted its weather-hold intent");
    const accepted = acceptedExpression(intent);
    const resident = value.world.residents.find(({ id }) => id === value.residentId);
    if (resident === undefined || resident.location.kind !== "route") {
      throw new Error("fixture lost its route resident");
    }
    resident.condition.sheltering = false;
    resident.location.progress = Math.min(FIXED_POINT, resident.location.progress + 25_000);

    expect(residentWeatherHoldExpressionEventMatchesWorld(
      value.world,
      accepted.event,
    )).toBe(true);
    expect(residentWeatherHoldExpressionEventForTrigger(
      value.world,
      intent.triggerEventId,
    )?.position).toEqual(accepted.event.position);
  });

  it("does not let continuing shelter state manufacture speech without an event", () => {
    const value = cloned(weatherHoldFixture());
    const retained = [...value.world.events] as SimEvent[];
    const eventIndex = retained.findIndex(({ sequence }) => sequence === value.event.sequence);
    retained.splice(eventIndex, 1);
    (value.world as { events: readonly SimEvent[] }).events = retained;

    expect(map(value)).toBeNull();
    expect(value.world.residents.find(({ id }) => id === value.residentId)?.condition.sheltering)
      .toBe(true);
  });

  it("fails closed when contract, identity, memory, or event-locus authority disagrees", () => {
    const base = weatherHoldFixture();
    const acceptedIntent = map(base);
    if (acceptedIntent === null) throw new Error("fixture omitted its weather-hold intent");
    const accepted = acceptedExpression(acceptedIntent);
    const memory = accepted.state.recent[0];
    if (memory === undefined) throw new Error("fixture omitted cooldown memory");

    const noMemory = cloned(base);
    const noMemoryResident = noMemory.world.residents.find(({ id }) => id === noMemory.residentId);
    if (noMemoryResident === undefined) throw new Error("clone lost its resident");
    noMemoryResident.memories = [];
    expect(map(noMemory)).toBeNull();

    const completed = cloned(base);
    const completedContract = completed.world.contracts.find(({ id }) => id === completed.contractId);
    if (completedContract === undefined) throw new Error("clone lost its contract");
    completedContract.status = "fulfilled";
    expect(map(completed)).toBeNull();

    const forgedRoute = cloned(base);
    forgedRoute.event.data.eventRouteProgress = FIXED_POINT + 1;
    expect(map(forgedRoute)).toBeNull();

    const forgedWeather = cloned(base);
    forgedWeather.event.data.weather = "clear";
    expect(map(forgedWeather)).toBeNull();

    const extraData = cloned(base);
    extraData.event.data.prose = "we wait because the test says so";
    expect(map(extraData)).toBeNull();

    const wrongIdentity = cloned(base);
    const identityResident = wrongIdentity.world.residents.find(
      ({ id }) => id === wrongIdentity.residentId,
    );
    if (identityResident === undefined) throw new Error("clone lost its resident");
    identityResident.identity.stableId = "dog:forged-weather-hold";
    expect(map(wrongIdentity)).toBeNull();

    const forgedExpression: SituatedExpressionEvent = {
      ...accepted.event,
      priority: accepted.event.priority + 1,
    };
    expect(residentWeatherHoldExpressionEventMatchesWorld(
      base.world,
      forgedExpression,
    )).toBe(false);
    const forgedMemory: SituatedExpressionMemory = {
      ...memory,
      priority: memory.priority + 1,
    };
    expect(residentWeatherHoldExpressionMemoryMatchesWorld(
      base.world,
      forgedMemory,
    )).toBe(false);
    expect(residentWeatherHoldExpressionEventForTrigger(
      base.world,
      `${acceptedIntent.triggerEventId}:forged`,
    )).toBeNull();
  });
});
