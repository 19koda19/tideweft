import { describe, expect, it } from "vitest";

import {
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorObservation,
} from "./actorPerception";
import {
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  projectLivingCircadianClockPreference,
  replaceResidentCircadian,
  residentHomeRestDestinationId,
} from "./livingCircadian";
import {
  FIXED_POINT,
  WORLD_DAWN_START_TICK,
  WORLD_NIGHT_START_TICK,
  WORLD_TICKS_PER_DAY,
  assertWorldInvariants,
  createWorld,
  runTicks,
  stepWorld,
  type ResidentPerceptionFrame,
  type ResidentState,
  type WorldState,
} from "./public";

const BASE_EXHAUSTION = 300_000;
const BASE_REST_PRESSURE = 500_000;
const NIGHT_NEEDS_TICK = WORLD_NIGHT_START_TICK + 60;

function residentById(world: WorldState, residentId: number): ResidentState {
  const resident = world.residents.find(({ id }) => id === residentId);
  if (resident === undefined) throw new Error(`fixture lost resident ${residentId}`);
  return resident;
}

function replaceResident(world: WorldState, replacement: ResidentState): ResidentState {
  const index = world.residents.findIndex(({ id }) => id === replacement.id);
  if (index < 0) throw new Error(`fixture cannot replace resident ${replacement.id}`);
  world.residents[index] = replacement;
  return replacement;
}

function preparePhysiology(resident: ResidentState): void {
  resident.condition.exhaustion = BASE_EXHAUSTION;
  resident.condition.wetness = 100_000;
  resident.condition.coldStress = 100_000;
  resident.needs.food = 100_000;
  resident.needs.rest = BASE_REST_PRESSURE;
  resident.needs.belonging = 100_000;
}

function bindCircadian(
  world: WorldState,
  residentId: number,
  posture: "awake" | "resting" | "asleep",
): ResidentState {
  const resident = residentById(world, residentId);
  const restDestinationId = residentHomeRestDestinationId(
    resident.identity.stableId,
    resident.homeSettlementId,
  );
  if (restDestinationId === null) throw new Error("fixture could not derive resident home ID");
  return replaceResident(world, replaceResidentCircadian(resident, {
    atTick: world.meta.completedTick,
    circadian: {
      version: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.version,
      ownerId: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.ownerId,
      policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
      restDestinationId,
      restDestinationArrived: true,
      posture: { state: posture, enteredAtTick: world.meta.completedTick },
    },
  }));
}

function worldBeforeNeedsTick(seed: string, targetTick: number): WorldState {
  const world = createWorld(seed, "standard");
  for (const contract of world.contracts) {
    if (contract.status === "offered") {
      contract.playerExclusiveUntilTick = targetTick + 100;
      contract.dueTick = targetTick + 200;
    }
  }
  runTicks(world, targetTick - 1 - world.meta.completedTick);
  world.weather = {
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: targetTick + 1_000,
  };
  for (const contract of world.contracts) {
    if (contract.status === "offered") {
      contract.playerExclusiveUntilTick = targetTick + 100;
      contract.dueTick = targetTick + 200;
    } else if (contract.status === "in-transit" && contract.arrivalTick !== null) {
      contract.arrivalTick = Math.max(
        contract.arrivalTick,
        targetTick + 100,
      );
    }
  }
  return world;
}

function currentAudibleObservation(
  resident: ResidentState,
  tick: number,
  suffix: string,
  strong: boolean,
): ActorObservation {
  const observation = createActorObservation({
    id: `circadian:${resident.id}:${tick}:${suffix}`,
    observerId: resident.identity.stableId,
    observedAtTick: tick,
    channel: "hearing",
    perceivedClass: "movement-sound",
    subjectId: null,
    area: {
      center: { region: { x: 0, y: 0 }, localX: 12_500, localY: 18_500 },
      radiusUnits: 2_000,
    },
    confidence: 900_000,
    salience: 840_000,
    identification: "anonymous",
    interrupt: strong ? "strong" : "none",
  });
  if (observation === null) throw new Error("fixture observation is invalid");
  return observation;
}

function currentVisualObservation(
  resident: ResidentState,
  tick: number,
  suffix: string,
): ActorObservation {
  const observation = createActorObservation({
    id: `circadian:${resident.id}:${tick}:${suffix}`,
    observerId: resident.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "human",
    subjectId: "player:local",
    area: {
      center: { region: { x: 0, y: 0 }, localX: 12_500, localY: 18_500 },
      radiusUnits: 0,
    },
    confidence: 900_000,
    salience: 840_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("fixture visual observation is invalid");
  return observation;
}

function completePerceptionFrame(
  world: WorldState,
  tick: number,
  observationsByResident: ReadonlyMap<number, readonly ActorObservation[]>,
): ResidentPerceptionFrame {
  return {
    tick,
    residents: world.residents.map((resident) => ({
      residentId: resident.id,
      actorId: resident.identity.stableId,
      observations: observationsByResident.get(resident.id) ?? [],
    })),
  };
}

describe("resident circadian physiology", () => {
  it("recovers a bound human only while resting at home and preserves legacy recovery", () => {
    const world = worldBeforeNeedsTick(
      "resident rest belongs to a body at home",
      NIGHT_NEEDS_TICK,
    );
    const available = world.residents.filter(({ activeContractId }) => activeContractId === null);
    const [
      legacy,
      awake,
      resting,
      asleep,
      away,
      routed,
      noticing,
      interrupted,
      urgentActive,
      urgentRest,
    ] = available;
    if (
      !legacy || !awake || !resting || !asleep || !away || !routed
      || !noticing || !interrupted || !urgentActive || !urgentRest
    ) {
      throw new Error("fixture needs ten residents without active contracts");
    }

    for (const resident of [
      legacy,
      awake,
      resting,
      asleep,
      away,
      routed,
      noticing,
      interrupted,
      urgentActive,
      urgentRest,
    ]) {
      resident.location = { kind: "settlement", settlementId: resident.homeSettlementId };
      preparePhysiology(resident);
    }
    bindCircadian(world, awake.id, "awake");
    bindCircadian(world, resting.id, "resting");
    bindCircadian(world, asleep.id, "asleep");
    const boundAway = bindCircadian(world, away.id, "resting");
    const foreign = world.settlements.find(({ id }) => id !== boundAway.homeSettlementId);
    if (foreign === undefined) throw new Error("fixture needs a foreign settlement");
    replaceResident(world, {
      ...boundAway,
      location: { kind: "settlement", settlementId: foreign.id },
    });
    const boundRouted = bindCircadian(world, routed.id, "asleep");
    const route = world.routes[0];
    if (route === undefined) throw new Error("fixture needs a route");
    replaceResident(world, {
      ...boundRouted,
      location: { kind: "route", routeId: route.id, progress: FIXED_POINT / 2 },
    });
    bindCircadian(world, noticing.id, "asleep");
    bindCircadian(world, interrupted.id, "asleep");
    bindCircadian(world, urgentActive.id, "asleep");
    residentById(world, urgentActive.id).needs.food = FIXED_POINT;
    bindCircadian(world, urgentRest.id, "asleep");
    residentById(world, urgentRest.id).needs.rest = 800_000;
    const perceptionFrame = completePerceptionFrame(
      world,
      NIGHT_NEEDS_TICK,
      new Map([
        [asleep.id, [currentVisualObservation(
          asleep,
          NIGHT_NEEDS_TICK,
          "sleeping-vision",
        )]],
        [noticing.id, [currentAudibleObservation(
          noticing,
          NIGHT_NEEDS_TICK,
          "noticed",
          false,
        )]],
        [interrupted.id, [currentAudibleObservation(
          interrupted,
          NIGHT_NEEDS_TICK,
          "interrupted",
          true,
        )]],
      ]),
    );

    stepWorld(world, [], perceptionFrame);

    expect(world.meta.completedTick).toBe(NIGHT_NEEDS_TICK);
    expect(residentById(world, legacy.id).condition.exhaustion)
      .toBe(BASE_EXHAUSTION - 2_500);
    expect(residentById(world, legacy.id).needs.rest)
      .toBe(BASE_REST_PRESSURE - 52_000);
    for (const residentId of [resting.id, asleep.id, noticing.id]) {
      expect(residentById(world, residentId).condition.exhaustion)
        .toBe(BASE_EXHAUSTION - 2_500);
      expect(residentById(world, residentId).needs.rest)
        .toBe(BASE_REST_PRESSURE - 52_000);
    }
    expect(residentById(world, urgentRest.id).condition.exhaustion)
      .toBe(BASE_EXHAUSTION - 2_500);
    expect(residentById(world, urgentRest.id).needs.rest).toBe(800_000 - 52_000);
    for (const residentId of [
      awake.id,
      away.id,
      interrupted.id,
      urgentActive.id,
    ]) {
      expect(residentById(world, residentId).condition.exhaustion).toBe(BASE_EXHAUSTION);
      expect(residentById(world, residentId).needs.rest)
        .toBe(BASE_REST_PRESSURE + 24_000);
    }
    expect(residentById(world, routed.id).condition.exhaustion)
      .toBeGreaterThan(BASE_EXHAUSTION);
    expect(residentById(world, routed.id).needs.rest)
      .toBe(BASE_REST_PRESSURE + 24_000);
    // A weak noticed signal may remain in conscious attention without becoming
    // a hidden wake override. Only a current strong interrupt or an explicit
    // higher-level response can end the sleeping/resting routine.
    expect(residentById(world, noticing.id).perception.suspicion).not.toBe("unaware");
    expect(residentById(world, interrupted.id).perception.beliefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lastObservedTick: NIGHT_NEEDS_TICK,
          strongInterrupt: true,
        }),
      ]),
    );
    expect(residentById(world, asleep.id).perception.beliefs.some((belief) => (
      belief.channel === "vision"
      && belief.lastObservedTick === NIGHT_NEEDS_TICK
    ))).toBe(false);

    // Drying and cold relief remain environmental settlement effects, not
    // circadian rewards, so an awake bound resident still receives both.
    expect(residentById(world, awake.id).condition).toMatchObject({
      wetness: 72_000,
      coldStress: 80_000,
    });
    expect(residentById(world, away.id).circadian).toMatchObject({
      restDestinationArrived: false,
      posture: { state: "awake", enteredAtTick: NIGHT_NEEDS_TICK },
    });
    expect(residentById(world, routed.id).circadian).toMatchObject({
      restDestinationArrived: false,
      posture: { state: "awake", enteredAtTick: NIGHT_NEEDS_TICK },
    });
    assertWorldInvariants(world);
  });

  it("denies passive bound recovery during an authoritative storm", () => {
    const world = worldBeforeNeedsTick(
      "a storm is not sleep",
      NIGHT_NEEDS_TICK,
    );
    const [legacy, bound] = world.residents.filter(({ activeContractId }) => (
      activeContractId === null
    ));
    if (!legacy || !bound) throw new Error("fixture needs two residents without work");
    for (const resident of [legacy, bound]) {
      resident.location = { kind: "settlement", settlementId: resident.homeSettlementId };
      preparePhysiology(resident);
    }
    bindCircadian(world, bound.id, "asleep");
    world.weather = {
      kind: "storm",
      intensity: 950_000,
      windX: 0,
      windY: 0,
      nextChangeTick: NIGHT_NEEDS_TICK + 100,
    };

    stepWorld(world);

    expect(residentById(world, legacy.id).condition.exhaustion)
      .toBe(BASE_EXHAUSTION - 2_500);
    expect(residentById(world, legacy.id).needs.rest)
      .toBe(BASE_REST_PRESSURE - 52_000);
    expect(residentById(world, bound.id).condition.exhaustion).toBe(BASE_EXHAUSTION);
    expect(residentById(world, bound.id).needs.rest)
      .toBe(BASE_REST_PRESSURE + 24_000);
    assertWorldInvariants(world);
  });

  it("denies a stale sleep-recovery tick while the resident owns an active watch", () => {
    const world = worldBeforeNeedsTick(
      "an identified resident is still on watch",
      NIGHT_NEEDS_TICK,
    );
    const resident = world.residents.find(({ activeContractId }) => activeContractId === null);
    if (resident === undefined) throw new Error("watch fixture needs an available resident");
    resident.location = { kind: "settlement", settlementId: resident.homeSettlementId };
    preparePhysiology(resident);
    const observedAtTick = NIGHT_NEEDS_TICK - 1;
    const observation = currentVisualObservation(resident, observedAtTick, "active-watch");
    const perception = stepActorPerception(
      createActorPerceptionState(resident.identity.stableId, observedAtTick - 1),
      { tick: observedAtTick, observations: [observation] },
    );
    if (perception === null || perception.suspicion !== "identified") {
      throw new Error("watch fixture did not establish current identified attention");
    }
    resident.perception = perception;
    bindCircadian(world, resident.id, "asleep");

    stepWorld(world, [], completePerceptionFrame(world, NIGHT_NEEDS_TICK, new Map()));

    const watched = residentById(world, resident.id);
    expect(["identified", "searching"]).toContain(watched.perception.suspicion);
    expect(watched.condition.exhaustion).toBe(BASE_EXHAUSTION);
    expect(watched.needs.rest).toBe(BASE_REST_PRESSURE + 24_000);
    assertWorldInvariants(world);
  });

  it("does not leak prior-tick sleep recovery across the dawn needs boundary", () => {
    const dawnTick = WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK;
    const world = worldBeforeNeedsTick("dawn wakes before physiology", dawnTick);
    const resident = world.residents.find((candidate) => (
      candidate.activeContractId === null
      && projectLivingCircadianClockPreference(
        candidate.identity.stableId,
        dawnTick,
        RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
      ) === "active"
    ));
    if (resident === undefined) {
      throw new Error("fixture needs an available resident whose dawn offset is active");
    }
    resident.location = { kind: "settlement", settlementId: resident.homeSettlementId };
    preparePhysiology(resident);
    bindCircadian(world, resident.id, "asleep");

    expect(dawnTick % 60).toBe(0);
    expect(projectLivingCircadianClockPreference(
      resident.identity.stableId,
      dawnTick,
      RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
    )).toBe("active");

    stepWorld(world);

    const completed = residentById(world, resident.id);
    expect(completed.condition.exhaustion).toBe(BASE_EXHAUSTION);
    expect(completed.needs.rest).toBe(BASE_REST_PRESSURE + 24_000);
    // Headless sim validates the current clock for physiology but does not own
    // the runtime schedule projection or rewrite its still-prior receipt.
    expect(completed.circadian?.posture).toEqual({
      state: "asleep",
      enteredAtTick: dawnTick - 1,
    });
    assertWorldInvariants(world);
  });

  it("wakes and clears home arrival when a resting resident accepts route work", () => {
    const world = createWorld("a promise wakes the sleeping porter", "standard");
    const contract = world.contracts.find(({ status }) => status === "offered");
    const resident = contract === undefined
      ? undefined
      : world.residents.find((candidate) => (
          candidate.homeSettlementId === contract.originSettlementId
          && candidate.location.kind === "settlement"
          && candidate.location.settlementId === contract.originSettlementId
          && candidate.activeContractId === null
        ));
    if (contract === undefined || resident === undefined) {
      throw new Error("fixture needs an offered contract and local porter");
    }
    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: world.meta.completedTick + 1_000,
    };
    preparePhysiology(resident);
    bindCircadian(world, resident.id, "asleep");
    const acceptedAtTick = world.meta.completedTick + 1;

    stepWorld(world, [{
      id: "circadian-porter-accepts",
      type: "accept-contract",
      carrier: "resident",
      contractId: contract.id,
      residentId: resident.id,
    }], completePerceptionFrame(
      world,
      acceptedAtTick,
      new Map([[resident.id, [currentVisualObservation(
        resident,
        acceptedAtTick,
        "same-tick-work-is-awake",
      )]]]),
    ));

    const accepted = residentById(world, resident.id);
    expect(accepted.activeContractId).toBe(contract.id);
    expect(accepted.location).toEqual({
      kind: "settlement",
      settlementId: contract.originSettlementId,
    });
    expect(accepted.condition.exhaustion).toBe(BASE_EXHAUSTION);
    expect(accepted.circadian).toMatchObject({
      restDestinationArrived: false,
      posture: { state: "awake", enteredAtTick: acceptedAtTick },
    });
    expect(accepted.perception.beliefs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: "vision",
        lastObservedTick: acceptedAtTick,
        subjectId: "player:local",
      }),
    ]));

    stepWorld(world);

    const departed = residentById(world, resident.id);
    expect(contract.status).toBe("in-transit");
    expect(departed.location.kind).toBe("route");
    expect(departed.circadian).toMatchObject({
      restDestinationArrived: false,
      posture: { state: "awake", enteredAtTick: acceptedAtTick },
    });

    // Route shelter is a physical weather hold, not authenticated human rest.
    // Neither the unsafe-weather nor clearing-weather hold may passively heal a
    // bound courier's exhaustion while the body remains away from home.
    if (contract.arrivalTick === null) {
      throw new Error("fixture contract did not acquire an arrival tick");
    }
    contract.arrivalTick = world.meta.completedTick + 100;
    departed.condition.sheltering = true;
    departed.condition.exhaustion = BASE_EXHAUSTION;
    world.weather = {
      kind: "storm",
      intensity: 950_000,
      windX: 0,
      windY: 0,
      nextChangeTick: world.meta.completedTick + 100,
    };

    stepWorld(world);

    const stormHeld = residentById(world, resident.id);
    expect(stormHeld.condition.sheltering).toBe(true);
    expect(stormHeld.condition.exhaustion).toBe(BASE_EXHAUSTION);

    stormHeld.condition.coldStress = 400_000;
    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: world.meta.completedTick + 100,
    };

    stepWorld(world);

    const clearingHeld = residentById(world, resident.id);
    expect(clearingHeld.condition.sheltering).toBe(true);
    expect(clearingHeld.condition.exhaustion).toBe(BASE_EXHAUSTION);
    expect(clearingHeld.circadian).toMatchObject({
      restDestinationArrived: false,
      posture: { state: "awake", enteredAtTick: acceptedAtTick },
    });
    assertWorldInvariants(world);
  });
});
