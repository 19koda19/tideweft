import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
} from "../sim/actorPerception";
import {
  replaceResidentCircadian,
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  residentHomeRestDestinationId,
  type LivingCircadianPersistentState,
} from "../sim/livingCircadian";
import { createRegionCoord, type RegionCoord } from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import { FIXED_POINT, type ResidentState, type WeatherState } from "../sim/types";
import { createInitialWorld } from "../sim/world";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import { createLivingCircadianPolicy } from "./livingCircadian";
import {
  createPorterResponseState,
  type PorterResponseIntent,
  type PorterResponseState,
} from "./porterResponse";
import {
  SETTLEMENT_KEEPER_CIRCADIAN_POLICY,
  SETTLEMENT_KEEPER_URGENT_EXHAUSTION,
  SETTLEMENT_KEEPER_URGENT_FOOD_NEED,
  SETTLEMENT_KEEPER_URGENT_REST_NEED,
  projectSettlementKeeperCircadian,
  type ProjectSettlementKeeperCircadianInput,
  type SettlementKeeperCircadianProjection,
} from "./settlementKeeperCircadian";
import {
  createSettlementEcologyState,
  type SettlementEcologyState,
} from "./settlementEcology";
import { createWorldPosition } from "./worldPosition";

const DAY_TICK = 700;
const NIGHT_TICK = 1_300;
const SLEEP_TICK = NIGHT_TICK + 21;
const ORIGIN = createRegionCoord(-23, 17);
const ECOLOGY_SEED = seedFromText("alpha 46 settlement keeper routine fixture");
const WORLD = createInitialWorld("alpha 46 settlement keeper", "standard");
const GENERATED_KEEPER = WORLD.residents[0];
if (GENERATED_KEEPER === undefined) throw new Error("Keeper fixture requires a resident");
const KEEPER = GENERATED_KEEPER;
const ECOLOGY_PATCH = fixturePatch();

function residentAt(atTick: number): ResidentState {
  return {
    ...structuredClone(KEEPER),
    perception: createActorPerceptionState(KEEPER.identity.stableId, atTick),
    location: { kind: "settlement", settlementId: KEEPER.homeSettlementId },
    activeContractId: null,
  };
}

function advanceResident(resident: ResidentState, atTick: number): ResidentState {
  return {
    ...resident,
    perception: createActorPerceptionState(resident.identity.stableId, atTick),
  };
}

function ecologyFor(
  resident: ResidentState,
  keeperActorId = resident.identity.stableId,
): SettlementEcologyState {
  return createSettlementEcologyState({
    rootSeed: ECOLOGY_SEED,
    settlementId: resident.homeSettlementId,
    keeperActorId,
    position: createWorldPosition(ORIGIN, 48_000, 36_000),
    aggregatePatch: ECOLOGY_PATCH,
  });
}

function weatherAt(atTick: number, kind: WeatherState["kind"] = "clear"): WeatherState {
  return {
    kind,
    intensity: kind === "storm" ? 300_000 : 0,
    windX: 0,
    windY: 0,
    nextChangeTick: atTick + 180,
  };
}

function porterAt(
  resident: ResidentState,
  atTick: number,
  intent: PorterResponseIntent = "wait-observe",
): PorterResponseState {
  return {
    ...createPorterResponseState(resident.identity.stableId, atTick),
    intent,
  };
}

function project(
  resident: ResidentState,
  input: Partial<Omit<ProjectSettlementKeeperCircadianInput, "resident">> = {},
): SettlementKeeperCircadianProjection {
  const atTick = input.atTick ?? resident.perception.tick;
  const projection = projectSettlementKeeperCircadian({
    resident,
    settlementEcology: input.settlementEcology ?? ecologyFor(resident),
    porterResponse: input.porterResponse ?? porterAt(resident, atTick),
    weather: input.weather ?? weatherAt(atTick),
    atTick,
  });
  if (projection === null) throw new Error("Settlement-keeper routine fixture failed");
  return projection;
}

function commitRoutine(
  resident: ResidentState,
  projection: SettlementKeeperCircadianProjection,
): ResidentState {
  return replaceResidentCircadian(resident, {
    atTick: resident.perception.tick,
    circadian: projection.receipt,
  });
}

function sleepingFixture(): ResidentState {
  let resident = residentAt(NIGHT_TICK);
  resident = commitRoutine(resident, project(resident));
  resident = advanceResident(resident, SLEEP_TICK);
  resident = commitRoutine(resident, project(resident));
  return resident;
}

describe("settlement keeper circadian adapter", () => {
  it("adopts the authenticated keeper at a settlement refuge and presents neutral day watch", () => {
    const resident = residentAt(DAY_TICK);
    const projection = project(resident);

    expect(resident.circadian).toBeUndefined();
    expect(SETTLEMENT_KEEPER_CIRCADIAN_POLICY)
      .toBe(RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY);
    expect(projection).toMatchObject({
      keeperActorId: resident.identity.stableId,
      residentId: resident.id,
      homeSettlementId: resident.homeSettlementId,
      atTick: DAY_TICK,
      restDestinationArrived: true,
      restorative: false,
      presentationIntent: "watch",
      routine: {
        clockPreference: "active",
        effectivePreference: "active",
        posture: { state: "awake", enteredAtTick: DAY_TICK },
        action: "remain-active",
      },
    });
    expect(projection.receipt.restDestinationId).toBe(
      residentHomeRestDestinationId(
        resident.identity.stableId,
        resident.homeSettlementId,
      ),
    );
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.receipt)).toBe(true);

    const foreignSettlement = WORLD.settlements.find(({ id }) => (
      id !== resident.homeSettlementId
    ));
    if (foreignSettlement === undefined) throw new Error("fixture needs a foreign refuge");
    const visitingLegacy: ResidentState = {
      ...resident,
      location: { kind: "settlement", settlementId: foreignSettlement.id },
    };
    const routeLegacy: ResidentState = {
      ...resident,
      location: { kind: "route", routeId: 91, progress: 300_000 },
    };
    expect(projectSettlementKeeperCircadian({
      resident: visitingLegacy,
      settlementEcology: ecologyFor(resident),
      porterResponse: porterAt(resident, DAY_TICK),
      weather: weatherAt(DAY_TICK),
      atTick: DAY_TICK,
    })).toMatchObject({
      restDestinationArrived: true,
      restorative: false,
      presentationIntent: "watch",
    });
    expect(projectSettlementKeeperCircadian({
      resident: routeLegacy,
      settlementEcology: ecologyFor(resident),
      porterResponse: porterAt(resident, DAY_TICK),
      weather: weatherAt(DAY_TICK),
      atTick: DAY_TICK,
    })).toBeNull();
  });

  it("rests and sleeps only at a settlement refuge, then wakes without inventing movement when routed", () => {
    let resident = residentAt(NIGHT_TICK);
    const resting = project(resident);
    expect(resting).toMatchObject({
      restDestinationArrived: true,
      restorative: true,
      presentationIntent: "rest",
      routine: {
        clockPreference: "rest",
        posture: { state: "resting", enteredAtTick: NIGHT_TICK },
        action: "settle-at-rest-destination",
      },
    });

    resident = commitRoutine(resident, resting);
    resident = advanceResident(resident, SLEEP_TICK);
    const asleep = project(resident);
    expect(asleep).toMatchObject({
      restorative: true,
      presentationIntent: "asleep",
      routine: {
        posture: { state: "asleep", enteredAtTick: SLEEP_TICK },
        action: "sleep-at-rest-destination",
        transitionCause: "settled",
      },
    });

    resident = commitRoutine(resident, asleep);
    const routeTick = SLEEP_TICK + 1;
    resident = {
      ...advanceResident(resident, routeTick),
      location: { kind: "route", routeId: 92, progress: 400_000 },
      activeContractId: null,
    };
    const routed = project(resident);
    expect(routed).toMatchObject({
      restDestinationArrived: false,
      restorative: false,
      presentationIntent: "awake",
      routine: {
        effectivePreference: "active",
        posture: { state: "awake", enteredAtTick: routeTick },
        action: "remain-active",
        transitionCause: "rest-destination-lost",
      },
    });
    expect(routed).not.toHaveProperty("motion");
  });

  it("keeps contracts, porter responses, dangerous weather, and urgent active needs awake", () => {
    const receipt = project(residentAt(DAY_TICK)).receipt;
    const cases: Array<Readonly<{
      label: string;
      resident?: Partial<ResidentState>;
      porterIntent?: PorterResponseIntent;
      weatherKind?: WeatherState["kind"];
      cause: string;
    }>> = [
      {
        label: "accepted contract",
        resident: { activeContractId: 808 },
        cause: "contract:808",
      },
      {
        label: "secure-food response",
        porterIntent: "secure-food",
        cause: "porter-response:secure-food",
      },
      {
        label: "reroute response",
        porterIntent: "reroute",
        cause: "porter-response:reroute",
      },
      {
        label: "leave response",
        porterIntent: "leave",
        cause: "porter-response:leave",
      },
      {
        label: "offer-food response",
        porterIntent: "offer-food",
        cause: "porter-response:offer-food",
      },
      {
        label: "dangerous weather",
        weatherKind: "storm",
        cause: "weather:storm",
      },
      {
        label: "urgent food",
        resident: {
          needs: { ...KEEPER.needs, food: SETTLEMENT_KEEPER_URGENT_FOOD_NEED },
        },
        cause: "need:food",
      },
    ];

    for (const testCase of cases) {
      const atTick = NIGHT_TICK;
      const resident: ResidentState = {
        ...residentAt(atTick),
        ...testCase.resident,
        circadian: receipt,
      };
      const projected = project(resident, {
        porterResponse: porterAt(resident, atTick, testCase.porterIntent),
        weather: weatherAt(atTick, testCase.weatherKind),
      });
      expect(projected.routine.effectivePreference, testCase.label).toBe("active");
      expect(projected.routine.causeReferenceId, testCase.label).toBe(testCase.cause);
      expect(projected.routine.posture.state, testCase.label).toBe("awake");
      expect(projected.restorative, testCase.label).toBe(false);
      expect(projected.presentationIntent, testCase.label).toBe("awake");
    }
  });

  it("allows an urgent rest need or exhaustion to rest through the active window", () => {
    const cases = [
      {
        needs: { ...KEEPER.needs, rest: SETTLEMENT_KEEPER_URGENT_REST_NEED },
        exhaustion: 0,
        referenceId: "need:rest",
      },
      {
        needs: { ...KEEPER.needs, rest: 0 },
        exhaustion: SETTLEMENT_KEEPER_URGENT_EXHAUSTION,
        referenceId: "condition:exhaustion",
      },
    ];
    for (const testCase of cases) {
      const resident: ResidentState = {
        ...residentAt(DAY_TICK),
        needs: testCase.needs,
        condition: { ...KEEPER.condition, exhaustion: testCase.exhaustion },
      };
      const projected = project(resident);
      expect(projected).toMatchObject({
        restorative: true,
        presentationIntent: "rest",
        routine: {
          clockPreference: "active",
          effectivePreference: "rest",
          posture: { state: "resting" },
          transitionCause: "priority-override",
          causeReferenceId: testCase.referenceId,
        },
      });
    }
  });

  it("turns a sufficiently salient same-tick lawful strong belief into STARTLED", () => {
    const sleeping = sleepingFixture();
    const atTick = SLEEP_TICK + 1;
    const observation = createActorObservation({
      id: "OBS-settlement-keeper-night-alarm",
      observerId: sleeping.identity.stableId,
      observedAtTick: atTick,
      channel: "hearing",
      perceivedClass: "danger-sound",
      subjectId: null,
      area: {
        center: createWorldPosition(ORIGIN, 48_000, 36_000),
        radiusUnits: 500,
      },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "anonymous",
      interrupt: "strong",
    });
    if (observation === null) throw new Error("Keeper alarm observation failed");
    const perception = stepActorPerception(sleeping.perception, {
      tick: atTick,
      observations: [observation],
    });
    if (perception === null) throw new Error("Keeper alarm perception failed");
    const resident: ResidentState = { ...sleeping, perception };
    const startled = project(resident);

    expect(startled).toMatchObject({
      restorative: false,
      presentationIntent: "awake",
      routine: {
        posture: { state: "startled", enteredAtTick: atTick },
        action: "respond-to-disturbance",
        transitionCause: "disturbance",
        causeReferenceId: observation.id,
      },
    });
  });

  it("fails closed on crossed identities, stale cognition, malformed weather, or receipt drift", () => {
    const resident = residentAt(DAY_TICK);
    const ecology = ecologyFor(resident);
    const porterResponse = porterAt(resident, DAY_TICK);
    const weather = weatherAt(DAY_TICK);
    const otherActorId = `${resident.identity.stableId}-other`;
    const base = { resident, settlementEcology: ecology, porterResponse, weather, atTick: DAY_TICK };

    expect(projectSettlementKeeperCircadian({
      ...base,
      settlementEcology: ecologyFor(resident, otherActorId),
    })).toBeNull();
    expect(projectSettlementKeeperCircadian({
      ...base,
      porterResponse: createPorterResponseState(otherActorId, DAY_TICK),
    })).toBeNull();
    expect(projectSettlementKeeperCircadian({
      ...base,
      resident: { ...resident, perception: createActorPerceptionState(
        resident.identity.stableId,
        DAY_TICK - 1,
      ) },
    })).toBeNull();
    expect(projectSettlementKeeperCircadian({
      ...base,
      weather: { ...weather, forged: true } as unknown as WeatherState,
    })).toBeNull();

    const lawful = project(resident).receipt;
    const wrongDestination: LivingCircadianPersistentState = {
      ...lawful,
      restDestinationId: "resident-home:wrong-destination",
    };
    expect(projectSettlementKeeperCircadian({
      ...base,
      resident: { ...resident, circadian: wrongDestination },
    })).toBeNull();

    const otherPolicy = createLivingCircadianPolicy({
      profileId: "night-active",
      drivers: ["clock"],
    });
    if (otherPolicy === null) throw new Error("Alternate policy fixture failed");
    expect(projectSettlementKeeperCircadian({
      ...base,
      resident: { ...resident, circadian: { ...lawful, policy: otherPolicy } },
    })).toBeNull();
  });
});

function fixturePatch(
  tick = 0,
  origin: RegionCoord = ORIGIN,
  seed: RootSeed = ECOLOGY_SEED,
): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion: origin,
  });
  return createCoreEcologyAggregatePatch({
    seed,
    patchKey: "alpha46:settlement-keeper-test",
    originRegion: origin,
    tick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
}

function individualInputs(
  habitat: CoreEcologyHarborEdgeHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }]
  ));
}
