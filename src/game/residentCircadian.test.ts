import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
} from "../sim/actorPerception";
import {
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  livingCircadianProfile,
  replaceResidentCircadian,
  residentHomeRestDestinationId,
  residentSettlementRestNetworkId,
} from "../sim/livingCircadian";
import {
  WORLD_DAWN_START_TICK,
  WORLD_NIGHT_START_TICK,
  WORLD_TICKS_PER_DAY,
  createWorld,
} from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import {
  FIXED_POINT,
  type ResidentState,
  type WeatherState,
} from "../sim/types";
import { createWorldPosition } from "./worldPosition";
import {
  planResidentCircadian,
  projectResidentCircadian,
  type ResidentCircadianDuty,
  type ResidentCircadianProjection,
} from "./residentCircadian";

const PROFILE = livingCircadianProfile(RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.profileId);
const PHASE_VARIATION = PROFILE.phaseVariationTicks;
const PRE_NIGHT_TICK = WORLD_NIGHT_START_TICK - PHASE_VARIATION - 1;
const ALL_ASLEEP_TICK = WORLD_NIGHT_START_TICK
  + PHASE_VARIATION
  + PROFILE.settleTicks;
const FIRST_DAWN_WAKE_TICK = WORLD_TICKS_PER_DAY
  + WORLD_DAWN_START_TICK
  - PHASE_VARIATION;
const ALL_AWAKE_TICK = WORLD_TICKS_PER_DAY
  + WORLD_DAWN_START_TICK
  + PHASE_VARIATION;
const SAFE_DAY_TICK = WORLD_DAWN_START_TICK + PHASE_VARIATION + 1;
const SAFE_NIGHT_TICK = WORLD_NIGHT_START_TICK + PHASE_VARIATION + 1;

interface PopulationStep {
  readonly residents: ResidentState[];
  readonly projections: readonly ResidentCircadianProjection[];
}

function weatherAt(atTick: number, kind: WeatherState["kind"] = "clear"): WeatherState {
  return {
    kind,
    intensity: kind === "storm" ? 900_000 : 0,
    windX: 0,
    windY: 0,
    nextChangeTick: atTick + 180,
  };
}

function atTick(resident: ResidentState, tick: number): ResidentState {
  return {
    ...resident,
    perception: createActorPerceptionState(resident.identity.stableId, tick),
  };
}

function requireProjection(
  resident: ResidentState,
  duty: ResidentCircadianDuty | null = null,
  weather: WeatherState = weatherAt(resident.perception.tick),
): ResidentCircadianProjection {
  const projection = projectResidentCircadian({
    resident,
    duty,
    weather,
    atTick: resident.perception.tick,
  });
  if (projection === null) throw new Error("Resident circadian fixture failed");
  return projection;
}

function commitProjection(
  resident: ResidentState,
  projection: ResidentCircadianProjection,
): ResidentState {
  return replaceResidentCircadian(resident, {
    atTick: resident.perception.tick,
    circadian: projection.receipt,
  });
}

function projectPopulation(
  current: readonly ResidentState[],
  tick: number,
  reverse: boolean,
): PopulationStep {
  const synchronized = current.map((resident) => atTick(resident, tick));
  const iteration = reverse ? [...synchronized].reverse() : synchronized;
  const replacements = new Map<number, ResidentState>();
  const projections = new Map<number, ResidentCircadianProjection>();
  for (const resident of iteration) {
    const projection = requireProjection(resident);
    replacements.set(resident.id, commitProjection(resident, projection));
    projections.set(resident.id, projection);
  }
  return {
    residents: synchronized.map((resident) => replacements.get(resident.id)!),
    projections: synchronized.map((resident) => projections.get(resident.id)!),
  };
}

function runPopulationCycle(seed: string, reverse: boolean) {
  const initial = createWorld(seed, "standard").residents;
  const preserved = initial.map((resident) => ({
    id: resident.id,
    stableId: resident.identity.stableId,
    homeSettlementId: resident.homeSettlementId,
    relationships: structuredClone(resident.relationships),
  }));

  let step = projectPopulation(initial, PRE_NIGHT_TICK, reverse);
  for (let tick = PRE_NIGHT_TICK + 1; tick <= ALL_ASLEEP_TICK; tick += 1) {
    step = projectPopulation(step.residents, tick, reverse);
  }
  const asleep = step;

  for (let tick = FIRST_DAWN_WAKE_TICK; tick <= ALL_AWAKE_TICK; tick += 1) {
    step = projectPopulation(step.residents, tick, reverse);
  }
  return { preserved, asleep, awake: step };
}

function awakeBoundResident(seed: string): Readonly<{
  resident: ResidentState;
  world: ReturnType<typeof createWorld>;
}> {
  const world = createWorld(seed, "standard");
  const source = world.residents[0];
  if (source === undefined) throw new Error("Resident fixture has no human");
  const resident = atTick(source, SAFE_DAY_TICK);
  return {
    world,
    resident: commitProjection(resident, requireProjection(resident)),
  };
}

describe("shared resident circadian adapter", () => {
  it("deterministically carries all 42 current humans through staggered home sleep and dawn", () => {
    const forward = runPopulationCycle("all current humans share one day", false);
    const reverse = runPopulationCycle("all current humans share one day", true);

    expect(forward.preserved).toHaveLength(42);
    expect(forward.asleep.residents).toHaveLength(42);
    expect(forward.asleep.residents.every(({ circadian }) => (
      circadian?.posture.state === "asleep"
      && circadian.restDestinationArrived
    ))).toBe(true);
    expect(forward.asleep.projections.every(({ restorative }) => restorative)).toBe(true);
    expect(new Set(forward.asleep.residents.map(({ circadian }) => (
      circadian?.posture.enteredAtTick
    ))).size).toBeGreaterThan(1);

    expect(forward.awake.residents.every(({ circadian }) => (
      circadian?.posture.state === "awake"
      && circadian.restDestinationArrived
    ))).toBe(true);
    expect(forward.awake.projections.every(({ restorative }) => !restorative)).toBe(true);
    expect(new Set(forward.awake.residents.map(({ circadian }) => (
      circadian?.posture.enteredAtTick
    ))).size).toBeGreaterThan(1);

    const retained = forward.awake.residents.map((resident) => ({
      id: resident.id,
      stableId: resident.identity.stableId,
      homeSettlementId: resident.homeSettlementId,
      relationships: resident.relationships,
    }));
    expect(retained).toEqual(forward.preserved);
    expect(forward.awake.residents.map(({ circadian }) => circadian))
      .toEqual(reverse.awake.residents.map(({ circadian }) => circadian));
    expect(forward.awake.residents.map((resident) => residentHomeRestDestinationId(
      resident.identity.stableId,
      resident.homeSettlementId,
    ))).toEqual(forward.awake.residents.map(({ circadian }) => (
      circadian?.restDestinationId
    )));
  });

  it("orders route, Promise, external duty, storm, and urgent needs without role schedules", () => {
    const { resident: bound, world } = awakeBoundResident("resident priority order");
    const route = world.routes[0];
    if (route === undefined) throw new Error("Resident priority fixture has no route");
    const night = atTick(bound, SAFE_NIGHT_TICK);
    const duty = Object.freeze({
      kind: "active-duty" as const,
      referenceId: "keeper:current-duty",
    });
    const urgentRest = {
      ...night,
      needs: { ...night.needs, rest: FIXED_POINT },
    };
    const watchObservation = createActorObservation({
      id: "OBS-resident-current-watch",
      observerId: bound.identity.stableId,
      observedAtTick: SAFE_NIGHT_TICK,
      channel: "vision",
      perceivedClass: "human",
      subjectId: "player:local",
      area: {
        center: createWorldPosition(createRegionCoord(0, 0), 12_000, 18_000),
        radiusUnits: 0,
      },
      confidence: 900_000,
      salience: 700_000,
      identification: "identified",
    });
    if (watchObservation === null) throw new Error("Resident watch observation failed");
    const watchPerception = stepActorPerception(
      createActorPerceptionState(bound.identity.stableId, SAFE_NIGHT_TICK - 1),
      { tick: SAFE_NIGHT_TICK, observations: [watchObservation] },
    );
    if (watchPerception === null) throw new Error("Resident watch cognition failed");
    const cases: Array<Readonly<{
      label: string;
      resident: ResidentState;
      duty: ResidentCircadianDuty | null;
      weather: WeatherState;
      expectedKind: "active-commitment" | "dangerous-weather" | "urgent-need";
      expectedReferenceId: string;
      expectedPreference: "active" | "rest";
      expectedPosture: "awake" | "resting";
    }>> = [
      {
        label: "route before every other pressure",
        resident: {
          ...urgentRest,
          location: { kind: "route", routeId: route.id, progress: 400_000 },
          activeContractId: 901,
        },
        duty,
        weather: weatherAt(SAFE_NIGHT_TICK, "storm"),
        expectedKind: "active-commitment",
        expectedReferenceId: `route:${route.id}`,
        expectedPreference: "active",
        expectedPosture: "awake",
      },
      {
        label: "Promise before external duty",
        resident: { ...urgentRest, activeContractId: 902 },
        duty,
        weather: weatherAt(SAFE_NIGHT_TICK, "storm"),
        expectedKind: "active-commitment",
        expectedReferenceId: "contract:902",
        expectedPreference: "active",
        expectedPosture: "awake",
      },
      {
        label: "external duty before weather",
        resident: urgentRest,
        duty,
        weather: weatherAt(SAFE_NIGHT_TICK, "storm"),
        expectedKind: "active-commitment",
        expectedReferenceId: duty.referenceId,
        expectedPreference: "active",
        expectedPosture: "awake",
      },
      {
        label: "storm before an urgent rest need",
        resident: urgentRest,
        duty: null,
        weather: weatherAt(SAFE_NIGHT_TICK, "storm"),
        expectedKind: "dangerous-weather",
        expectedReferenceId: "weather:storm",
        expectedPreference: "active",
        expectedPosture: "awake",
      },
      {
        label: "current identified watch before an urgent rest need",
        resident: { ...urgentRest, perception: watchPerception },
        duty: null,
        weather: weatherAt(SAFE_NIGHT_TICK),
        expectedKind: "active-commitment",
        expectedReferenceId: "perception:identified",
        expectedPreference: "active",
        expectedPosture: "awake",
      },
      {
        label: "urgent rest",
        resident: urgentRest,
        duty: null,
        weather: weatherAt(SAFE_NIGHT_TICK),
        expectedKind: "urgent-need",
        expectedReferenceId: "need:rest",
        expectedPreference: "rest",
        expectedPosture: "resting",
      },
      {
        label: "urgent food",
        resident: {
          ...night,
          needs: { ...night.needs, food: FIXED_POINT },
        },
        duty: null,
        weather: weatherAt(SAFE_NIGHT_TICK),
        expectedKind: "urgent-need",
        expectedReferenceId: "need:food",
        expectedPreference: "active",
        expectedPosture: "awake",
      },
    ];

    for (const testCase of cases) {
      const projection = requireProjection(
        testCase.resident,
        testCase.duty,
        testCase.weather,
      );
      expect(projection.priorityOverride, testCase.label).toMatchObject({
        kind: testCase.expectedKind,
        referenceId: testCase.expectedReferenceId,
        preference: testCase.expectedPreference,
      });
      expect(projection.routine.effectivePreference, testCase.label)
        .toBe(testCase.expectedPreference);
      expect(projection.routine.posture.state, testCase.label)
        .toBe(testCase.expectedPosture);
    }
  });

  it("lets a current lawful strong disturbance outrank every active pressure", () => {
    const { resident: bound, world } = awakeBoundResident("resident current disturbance");
    const route = world.routes[0];
    if (route === undefined) throw new Error("Resident disturbance fixture has no route");
    const observation = createActorObservation({
      id: "OBS-resident-current-alarm",
      observerId: bound.identity.stableId,
      observedAtTick: SAFE_NIGHT_TICK,
      channel: "hearing",
      perceivedClass: "danger-sound",
      subjectId: null,
      area: {
        center: createWorldPosition(createRegionCoord(0, 0), 12_000, 18_000),
        radiusUnits: 1_000,
      },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "anonymous",
      interrupt: "strong",
    });
    if (observation === null) throw new Error("Resident disturbance observation failed");
    const perception = stepActorPerception(
      createActorPerceptionState(bound.identity.stableId, SAFE_NIGHT_TICK - 1),
      { tick: SAFE_NIGHT_TICK, observations: [observation] },
    );
    if (perception === null) throw new Error("Resident disturbance cognition failed");
    const resident: ResidentState = {
      ...bound,
      perception,
      needs: { ...bound.needs, rest: FIXED_POINT },
      location: { kind: "route", routeId: route.id, progress: 500_000 },
      activeContractId: 903,
    };
    const projection = requireProjection(
      resident,
      { kind: "active-duty", referenceId: "keeper:alarm-duty" },
      weatherAt(SAFE_NIGHT_TICK, "storm"),
    );

    expect(projection.priorityOverride).toMatchObject({
      kind: "active-commitment",
      referenceId: `route:${route.id}`,
    });
    expect(projection.routine).toMatchObject({
      posture: { state: "startled", enteredAtTick: SAFE_NIGHT_TICK },
      action: "respond-to-disturbance",
      transitionCause: "disturbance",
      causeReferenceId: observation.id,
    });
    expect(projection.restorative).toBe(false);
  });

  it("adopts legacy state at a contract-free settlement refuge and never invents movement", () => {
    const world = createWorld("resident lawful settlement adoption", "standard");
    const source = world.residents[0];
    const foreign = source === undefined
      ? undefined
      : world.settlements.find(({ id }) => id !== source.homeSettlementId);
    const route = world.routes[0];
    if (source === undefined || foreign === undefined || route === undefined) {
      throw new Error("Resident adoption fixture is incomplete");
    }
    const home = atTick(source, SAFE_NIGHT_TICK);
    const away: ResidentState = {
      ...home,
      location: { kind: "settlement", settlementId: foreign.id },
    };
    const routed: ResidentState = {
      ...home,
      location: { kind: "route", routeId: route.id, progress: 250_000 },
    };
    const contracted: ResidentState = { ...home, activeContractId: 904 };

    const awayProjection = requireProjection(away);
    expect(awayProjection).toMatchObject({
      restDestinationArrived: true,
      restorative: true,
      routine: { posture: { state: "resting" } },
    });
    expect(awayProjection.receipt.restDestinationId).toBe(
      residentSettlementRestNetworkId(
        away.identity.stableId,
        away.homeSettlementId,
      ),
    );
    expect(awayProjection).not.toHaveProperty("motion");
    expect(away.location).toEqual({ kind: "settlement", settlementId: foreign.id });

    for (const resident of [routed, contracted]) {
      const input = {
        resident,
        duty: null,
        weather: weatherAt(SAFE_NIGHT_TICK),
        atTick: SAFE_NIGHT_TICK,
      } as const;
      expect(projectResidentCircadian(input)).toBeNull();
      expect(planResidentCircadian(input)).toMatchObject({
        kind: "unbound-deferred",
        residentActorId: resident.identity.stableId,
        atTick: SAFE_NIGHT_TICK,
        reason: "settlement-arrival-unproven",
      });
    }

    const homeProjection = requireProjection(home);
    expect(homeProjection.routine.posture.state).toBe("resting");
    const committedAway = commitProjection(away, awayProjection);
    const routeTick = SAFE_NIGHT_TICK + 1;
    const departed: ResidentState = {
      ...atTick(committedAway, routeTick),
      location: { kind: "route", routeId: route.id, progress: 250_000 },
    };
    const projectedRoute = requireProjection(departed);

    expect(projectedRoute).toMatchObject({
      restDestinationArrived: false,
      restorative: false,
      routine: {
        posture: { state: "awake", enteredAtTick: routeTick },
        transitionCause: "rest-destination-lost",
      },
    });
    expect(projectedRoute).not.toHaveProperty("motion");
    expect(departed.location).toEqual({
      kind: "route",
      routeId: route.id,
      progress: 250_000,
    });

    const laterTick = SAFE_NIGHT_TICK + WORLD_TICKS_PER_DAY * 2;
    const projectedDaysLater = requireProjection(atTick(committedAway, laterTick));
    expect(projectedDaysLater).toMatchObject({
      restDestinationArrived: true,
      restorative: true,
      routine: { posture: { state: "asleep" } },
    });
    expect(projectedDaysLater).not.toHaveProperty("motion");
    expect(committedAway.location).toEqual({ kind: "settlement", settlementId: foreign.id });
  });

  it("fails closed on stale cognition/weather and malformed duties, weather, or receipts", () => {
    const { resident: bound } = awakeBoundResident("resident fail closed");
    const resident = atTick(bound, SAFE_DAY_TICK);
    const base = {
      resident,
      duty: null,
      weather: weatherAt(SAFE_DAY_TICK),
      atTick: SAFE_DAY_TICK,
    } as const;

    expect(projectResidentCircadian({
      ...base,
      resident: atTick(bound, SAFE_DAY_TICK - 1),
    })).toBeNull();
    expect(planResidentCircadian({
      ...base,
      resident: atTick(bound, SAFE_DAY_TICK - 1),
    })).toBeNull();
    expect(projectResidentCircadian({
      ...base,
      weather: { ...base.weather, nextChangeTick: SAFE_DAY_TICK },
    })).toBeNull();
    expect(projectResidentCircadian({
      ...base,
      weather: { ...base.weather, forged: true } as unknown as WeatherState,
    })).toBeNull();
    expect(projectResidentCircadian({
      ...base,
      duty: { kind: "active-duty", referenceId: " padded-duty " },
    })).toBeNull();
    expect(projectResidentCircadian({
      ...base,
      resident: {
        ...resident,
        circadian: {
          ...resident.circadian!,
          restDestinationId: "resident-home:forged",
        },
      },
    })).toBeNull();
    expect(projectResidentCircadian({
      ...base,
      resident: {
        ...resident,
        circadian: {
          ...resident.circadian!,
          posture: {
            state: "awake",
            enteredAtTick: SAFE_DAY_TICK + 1,
          },
        },
      },
    })).toBeNull();
  });
});
