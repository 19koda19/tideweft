import { describe, expect, it } from "vitest";

import {
  LIVING_CIRCADIAN_OWNER_ID,
  LIVING_CIRCADIAN_PROFILE_IDS,
  LIVING_CIRCADIAN_PROFILES,
  canonicalizeLivingCircadianPersistentState,
  createLivingCircadianPolicy,
  firstLivingCircadianActiveTick,
  livingCircadianPersistentStateFromProjection,
  livingCircadianPhaseOffsetTicks,
  projectLivingCircadian,
  type LivingCircadianPolicy,
  type LivingCircadianPosture,
  type ProjectLivingCircadianInput,
} from "./livingCircadian";

function policy(
  profileId: LivingCircadianPolicy["profileId"],
  drivers: LivingCircadianPolicy["drivers"] = ["clock"],
  wakeSensitivity?: number,
): LivingCircadianPolicy {
  const created = createLivingCircadianPolicy({
    profileId,
    drivers,
    ...(wakeSensitivity === undefined ? {} : { wakeSensitivity }),
  });
  if (created === null) throw new Error("Circadian policy fixture failed");
  return created;
}

function project(overrides: Partial<ProjectLivingCircadianInput> = {}) {
  const input: ProjectLivingCircadianInput = {
    subjectId: "ACTOR-circadian-fixture",
    atTick: 1_350,
    mode: "full",
    policy: policy("day-active"),
    current: { state: "awake", enteredAtTick: 1_300 },
    restDestination: { destinationId: "habitat:rest-anchor", arrived: false },
    driverSignals: [],
    disturbance: null,
    priorityOverride: null,
    ...overrides,
  };
  return projectLivingCircadian(input);
}

describe("universal living circadian kernel", () => {
  it("owns exactly four shared profiles and projects their clock rhythms", () => {
    expect(LIVING_CIRCADIAN_PROFILES.map(({ id }) => id)).toEqual(LIVING_CIRCADIAN_PROFILE_IDS);
    expect(new Set(LIVING_CIRCADIAN_PROFILES.map(({ rhythm }) => rhythm))).toEqual(new Set([
      "diurnal",
      "nocturnal",
      "crepuscular",
      "adaptive",
    ]));
    expect(Object.isFrozen(LIVING_CIRCADIAN_PROFILES)).toBe(true);

    expect(project({
      atTick: 720,
      current: { state: "awake", enteredAtTick: 700 },
      policy: policy("day-active"),
    })?.clockPreference).toBe("active");
    expect(project({ atTick: 0, current: { state: "awake", enteredAtTick: 0 }, policy: policy("night-active") })?.clockPreference).toBe("active");
    expect(project({ atTick: 390, current: { state: "awake", enteredAtTick: 380 }, policy: policy("twilight-active") })?.clockPreference).toBe("active");
    expect(project({
      atTick: 720,
      current: { state: "awake", enteredAtTick: 700 },
      policy: policy("twilight-active"),
    })?.clockPreference).toBe("rest");

    const adaptiveOffset = livingCircadianPhaseOffsetTicks(
      "ACTOR-adaptive",
      "adaptive-active",
    )!;
    const rest = project({
      subjectId: "ACTOR-adaptive",
      atTick: adaptiveOffset,
      current: { state: "awake", enteredAtTick: 0 },
      policy: policy("adaptive-active"),
    });
    const activeTick = (adaptiveOffset + 600) % 1_440;
    const active = project({
      subjectId: "ACTOR-adaptive",
      atTick: activeTick,
      current: { state: "awake", enteredAtTick: 0 },
      policy: policy("adaptive-active"),
    });
    expect(rest?.clockPreference).toBe("rest");
    expect(active?.clockPreference).toBe("active");
  });

  it("derives stable identity variation and staggered cadence without save state", () => {
    const first = project({
      subjectId: "ACTOR-stable",
      atTick: 720,
      current: { state: "awake", enteredAtTick: 700 },
    });
    const repeated = project({
      subjectId: "ACTOR-stable",
      atTick: 720,
      current: { state: "awake", enteredAtTick: 700 },
    });
    const nextDay = project({ subjectId: "ACTOR-stable", atTick: 2_160 });
    expect(first).toEqual(repeated);
    expect(nextDay?.phaseOffsetTicks).toBe(first?.phaseOffsetTicks);
    expect(nextDay?.clockPreference).toBe(first?.clockPreference);

    const offsets = new Set(Array.from({ length: 32 }, (_, index) => (
      livingCircadianPhaseOffsetTicks(`ACTOR-${index}`, "day-active")
    )));
    const evaluationTicks = new Set(Array.from({ length: 32 }, (_, index) => (
      project({
        subjectId: `ACTOR-${index}`,
        atTick: 720,
        current: { state: "awake", enteredAtTick: 700 },
      })?.nextEvaluationTick
    )));
    expect(offsets.size).toBeGreaterThan(1);
    expect(evaluationTicks.size).toBeGreaterThan(1);
    expect(Math.min(...[...offsets] as number[])).toBeGreaterThanOrEqual(-30);
    expect(Math.max(...[...offsets] as number[])).toBeLessThanOrEqual(30);
  });

  it("requires physical arrival and settling before sleep, then wakes only to lawful disturbance", () => {
    const seeking = project();
    expect(seeking).toMatchObject({
      posture: { state: "awake", enteredAtTick: 1_300 },
      action: "travel-to-rest-destination",
      transitionCause: "clock",
    });

    const arrived = project({
      atTick: 1_360,
      current: seeking!.posture,
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
    });
    expect(arrived).toMatchObject({
      posture: { state: "resting", enteredAtTick: 1_360 },
      action: "settle-at-rest-destination",
    });

    const asleep = project({
      atTick: 1_381,
      current: arrived!.posture,
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
    });
    expect(asleep).toMatchObject({
      posture: { state: "asleep", enteredAtTick: 1_381 },
      action: "sleep-at-rest-destination",
      transitionCause: "settled",
      causeReferenceId: "habitat:rest-anchor",
    });

    const weak = project({
      atTick: 1_382,
      current: asleep!.posture,
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
      disturbance: {
        source: "lawful-perception",
        referenceId: "observation:quiet-branch",
        observedAtTick: 1_382,
        intensity: 449_999,
      },
    });
    expect(weak?.posture.state).toBe("asleep");

    const startled = project({
      atTick: 1_383,
      current: weak!.posture,
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
      disturbance: {
        source: "lawful-perception",
        referenceId: "observation:predator-alarm",
        observedAtTick: 1_383,
        intensity: 450_000,
      },
    });
    expect(startled).toMatchObject({
      posture: { state: "startled", enteredAtTick: 1_383 },
      action: "respond-to-disturbance",
      transitionCause: "disturbance",
      causeReferenceId: "observation:predator-alarm",
    });
    expect(project({
      atTick: 1_387,
      current: startled!.posture,
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
    })).toMatchObject({
      posture: { state: "awake", enteredAtTick: 1_387 },
      transitionCause: "startle-recovered",
    });

    expect(project({
      atTick: 1_383,
      current: weak!.posture,
      disturbance: {
        source: "lawful-perception",
        referenceId: "observation:stale",
        observedAtTick: 1_382,
        intensity: 1_000_000,
      },
    })).toBeNull();

    expect(project({
      atTick: 1_390,
      current: { state: "asleep", enteredAtTick: 1_381 },
      restDestination: { destinationId: "habitat:rest-anchor", arrived: false },
    })).toMatchObject({
      posture: { state: "awake", enteredAtTick: 1_390 },
      transitionCause: "rest-destination-lost",
      causeReferenceId: "habitat:rest-anchor",
    });
  });

  it("composes tide/weather/opportunity with clock and lets urgent needs or commitments override", () => {
    const nocturnal = policy("night-active", ["opportunity", "clock", "weather", "tide"]);
    const tidal = project({
      atTick: 720,
      policy: nocturnal,
      current: { state: "resting", enteredAtTick: 700 },
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
      driverSignals: [{
        driver: "tide",
        source: "authoritative-environment",
        referenceId: "tide:ebb-window",
        sampledAtTick: 720,
      }],
    });
    expect(tidal).toMatchObject({
      clockPreference: "rest",
      effectivePreference: "active",
      activatingDriver: "tide",
      posture: { state: "awake", enteredAtTick: 720 },
      transitionCause: "driver",
    });

    const exhausted: LivingCircadianPosture = { state: "awake", enteredAtTick: 700 };
    expect(project({
      atTick: 720,
      current: exhausted,
      restDestination: { destinationId: "shelter:known", arrived: false },
      priorityOverride: {
        kind: "urgent-need",
        referenceId: "need:exhaustion",
        preference: "rest",
      },
    })).toMatchObject({
      effectivePreference: "rest",
      posture: { state: "awake" },
      action: "travel-to-rest-destination",
      transitionCause: "priority-override",
    });

    expect(project({
      atTick: 1_350,
      current: { state: "asleep", enteredAtTick: 1_300 },
      restDestination: { destinationId: "home:porter", arrived: true },
      priorityOverride: {
        kind: "active-commitment",
        referenceId: "promise:urgent-delivery",
        preference: "active",
      },
    })).toMatchObject({
      effectivePreference: "active",
      posture: { state: "awake", enteredAtTick: 1_350 },
      action: "remain-active",
    });
  });

  it("fails closed when coarse simulation is offered new sensory truth and never invents STARTLED", () => {
    const sleeping: LivingCircadianPosture = { state: "asleep", enteredAtTick: 1_300 };
    expect(project({
      mode: "coarse",
      current: sleeping,
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
    })).toMatchObject({
      ownerId: LIVING_CIRCADIAN_OWNER_ID,
      posture: { state: "asleep", enteredAtTick: 1_300 },
      action: "sleep-at-rest-destination",
    });

    expect(project({
      mode: "coarse",
      current: sleeping,
      disturbance: {
        source: "authoritative-local-hazard",
        referenceId: "hazard:hidden",
        observedAtTick: 1_350,
        intensity: 1_000_000,
      },
    })).toBeNull();
    expect(project({
      mode: "coarse",
      policy: policy("day-active", ["clock", "opportunity"]),
      driverSignals: [{
        driver: "opportunity",
        source: "lawful-observation",
        referenceId: "observation:unloaded-food",
        sampledAtTick: 1_350,
      }],
    })).toBeNull();
  });

  it("canonicalizes durable posture without accepting policy reordering or forged clock signals", () => {
    const projected = project({
      atTick: 1_350,
      current: { state: "resting", enteredAtTick: 1_320 },
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
    });
    if (projected === null) throw new Error("Durable posture fixture failed");
    const durable = livingCircadianPersistentStateFromProjection(projected);
    expect(canonicalizeLivingCircadianPersistentState(
      JSON.parse(JSON.stringify(durable)),
    )).toEqual(durable);
    expect(canonicalizeLivingCircadianPersistentState({
      ...durable,
      policy: {
        ...policy("day-active", ["clock", "weather"]),
        drivers: ["weather", "clock"],
      },
    })).toBeNull();
    expect(canonicalizeLivingCircadianPersistentState({
      ...durable,
      restDestinationArrived: false,
    })).toBeNull();

    expect(projectLivingCircadian({
      subjectId: "ACTOR-clock-forgery",
      atTick: 720,
      mode: "full",
      policy: policy("day-active"),
      current: { state: "awake", enteredAtTick: 700 },
      restDestination: { destinationId: "habitat:rest-anchor", arrived: true },
      driverSignals: [{
        driver: "clock",
        source: "authoritative-environment",
        referenceId: "forged:clock-driver",
        sampledAtTick: 720,
      }] as unknown as ProjectLivingCircadianInput["driverSignals"],
      disturbance: null,
      priorityOverride: null,
    })).toBeNull();
  });

  it("finds the first stable-ID active boundary without scanning beyond one day", () => {
    const subjectId = "ACTOR-coarse-boundary";
    const circadianPolicy = policy("day-active");
    const boundary = firstLivingCircadianActiveTick(
      subjectId,
      1_200,
      2_200,
      circadianPolicy,
    );
    expect(boundary).not.toBeNull();
    expect(boundary).toBeGreaterThan(1_200);
    expect(boundary).toBeLessThanOrEqual(1_830);
    expect(firstLivingCircadianActiveTick(
      subjectId,
      1_200,
      1_200,
      circadianPolicy,
    )).toBeNull();
  });
});
