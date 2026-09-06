import { describe, expect, it } from "vitest";

import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { seedFromText, type RootSeed } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord, type RegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
  type CoreEcologyPopulationMemberState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS,
  CORE_ECOLOGY_ACTIVITY_OWNER_ID,
  CORE_ECOLOGY_ACTIVITY_SPECIES,
  projectCoreEcologyActivity,
  projectCoreEcologyDayPhase,
  stepCoreEcologyActivityMotion,
  validateCoreEcologyActivityPolicies,
} from "./coreEcologyActivity";
import {
  deriveCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyTidalTableHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyTidalTableHabitatAssemblage,
} from "./coreEcologyHabitat";
import { projectCoreEcologyTidalTable } from "./coreEcologyTidalTable";
import { CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES } from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  repositionCoreWildlifeActor,
} from "./coreWildlifeActor";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

const SEED = seedFromText("rain chorus bounded diurnal activity owner");
const ORIGIN = createRegionCoord(0, 0);

describe("core ecology bounded activity", () => {
  it("uses the established 1,440-tick daylight boundary without claiming a full schedule", () => {
    expect(projectCoreEcologyDayPhase(359)).toEqual({ dayTick: 359, phase: "rest-window" });
    expect(projectCoreEcologyDayPhase(360)).toEqual({ dayTick: 360, phase: "daylight" });
    expect(projectCoreEcologyDayPhase(1_199)).toEqual({ dayTick: 1_199, phase: "daylight" });
    expect(projectCoreEcologyDayPhase(1_200)).toEqual({
      dayTick: 1_200,
      phase: "rest-window",
    });
    expect(projectCoreEcologyDayPhase(1_800)).toEqual({ dayTick: 360, phase: "daylight" });
    expect(projectCoreEcologyDayPhase(-1)).toBeNull();
    expect(projectCoreEcologyDayPhase(1.5)).toBeNull();
  });

  it("fails the policy gate if a declared diurnal species lacks this runtime owner", () => {
    expect(validateCoreEcologyActivityPolicies()).toEqual([]);
    expect(CORE_ECOLOGY_ACTIVITY_SPECIES).toEqual([
      "fish-crow",
      "northern-harrier",
      "snowy-egret",
    ]);
    expect(CORE_ECOLOGY_ACTIVITY_SPECIES).not.toContain("owl");

    const withoutHarrier = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.filter(
      ({ speciesId }) => speciesId !== "northern-harrier",
    );
    expect(validateCoreEcologyActivityPolicies(withoutHarrier))
      .toContain("northern-harrier:missing-policy");
  });

  it("projects deterministic low quartering by day and real rest by night", () => {
    const dayPatch = activityPatch(360);
    const harrier = memberFor(dayPatch, "northern-harrier");
    const before = serializeCoreEcologyAggregatePatch(dayPatch);
    const first = projectCoreEcologyActivity(dayPatch, {
      actorId: harrier.actor.identity.stableId,
      atTick: 360,
    });
    const repeated = projectCoreEcologyActivity(dayPatch, {
      actorId: harrier.actor.identity.stableId,
      atTick: 360,
    });
    const sameCadence = projectCoreEcologyActivity(dayPatch, {
      actorId: harrier.actor.identity.stableId,
      atTick: 360 + CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS - 1,
    });
    const nextCadence = projectCoreEcologyActivity(dayPatch, {
      actorId: harrier.actor.identity.stableId,
      atTick: 360 + CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS,
    });

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({
      ownerId: CORE_ECOLOGY_ACTIVITY_OWNER_ID,
      scheduleScope: "bounded-diurnal-window",
      state: "low-quartering",
      preferredNeutralIntent: "observe",
      presentationSignal: "low-quartering-flight",
      responsiveToImmediateIntent: false,
      motion: { kind: "target-area", verb: "quarter" },
      perch: { availability: "not-applicable", anchor: null },
    });
    expect(sameCadence?.motion).toEqual(first?.motion);
    expect(nextCadence?.motion).not.toEqual(first?.motion);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.motion)).toBe(true);
    expect(serializeCoreEcologyAggregatePatch(dayPatch)).toBe(before);

    const nightPatch = activityPatch(1_200);
    const nightHarrier = memberFor(nightPatch, "northern-harrier");
    expect(projectCoreEcologyActivity(nightPatch, {
      actorId: nightHarrier.actor.identity.stableId,
      atTick: 1_200,
    })).toMatchObject({
      dayPhase: "rest-window",
      state: "resting",
      preferredNeutralIntent: "rest",
      presentationSignal: "resting",
      motion: { kind: "hold-position" },
    });
  });

  it("does not let a completed rest posture trap a bird after daylight returns", () => {
    const beforeDawn = activityPatch(359);
    const actorSteps = beforeDawn.populations.flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized")
      .map(({ actor }) => ({
        actorId: actor.identity.stableId,
        observations: [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
        neutralActivityPreference: "rest" as const,
      }));
    const atDawn = stepCoreEcologyAggregatePatch(beforeDawn, { tick: 360, actorSteps });
    if (atDawn === null) throw new Error("Valid dawn activity step failed");

    for (const species of ["fish-crow", "northern-harrier"] as const) {
      const bird = memberFor(atDawn.patch, species);
      expect(bird.actor.intent.kind).toBe("rest");
      expect(projectCoreEcologyActivity(atDawn.patch, {
        actorId: bird.actor.identity.stableId,
        atTick: 360,
      })?.preferredNeutralIntent).toBe("observe");
    }

    const releaseSteps = atDawn.patch.populations.flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized")
      .map(({ actor }) => {
        const activity = projectCoreEcologyActivity(atDawn.patch, {
          actorId: actor.identity.stableId,
          atTick: 361,
        });
        return {
          actorId: actor.identity.stableId,
          observations: [],
          foodOpportunities: [],
          accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
          ...(activity?.preferredNeutralIntent === null || activity === null
            ? {}
            : { neutralActivityPreference: activity.preferredNeutralIntent }),
        };
      });
    const released = stepCoreEcologyAggregatePatch(atDawn.patch, {
      tick: 361,
      actorSteps: releaseSteps,
    });
    if (released === null) throw new Error("Valid post-dawn activity decision failed");
    for (const species of ["fish-crow", "northern-harrier"] as const) {
      expect(memberFor(released.patch, species).actor.intent.kind).toBe("observe");
    }
  });

  it("executes crow perch return and harrier rest-to-quartering through the runtime motion owner", () => {
    let crowPatch = activityPatch(1_200);
    const crow = memberFor(crowPatch, "fish-crow");
    const perch = crow.actor.address.position;
    const displacedCrow = repositionCoreWildlifeActor(crow.actor, {
      atTick: 1_200,
      position: translateWorldPosition(perch, 2 * WORLD_POSITION_UNITS_PER_TILE, 0),
      heading: crow.actor.address.heading,
    });
    crowPatch = replaceCoreEcologyAggregatePatchActor(crowPatch, displacedCrow);
    const crowMotion = stepCoreEcologyActivityMotion(crowPatch, {
      actorId: displacedCrow.identity.stableId,
      atTick: 1_200,
      maximumStepUnits: 1_500,
    });
    if (crowMotion === null) throw new Error("Authenticated crow perch motion failed");
    expect(crowMotion).toMatchObject({
      resolution: "moved",
      projection: { state: "seeking-perch", motion: { verb: "seek-perch" } },
    });
    const arrivedCrow = memberFor(crowMotion.patch, "fish-crow");
    const arrivedDelta = worldPositionDelta(arrivedCrow.actor.address.position, perch);
    expect(Math.hypot(arrivedDelta.x, arrivedDelta.y)).toBeLessThanOrEqual(500);
    expect(projectCoreEcologyActivity(crowMotion.patch, {
      actorId: arrivedCrow.actor.identity.stableId,
      atTick: 1_200,
    })).toMatchObject({
      state: "perched",
      preferredNeutralIntent: "rest",
      motion: { kind: "hold-position" },
    });
    const crowRest = stepCoreEcologyAggregatePatch(crowMotion.patch, {
      tick: 1_201,
      actorSteps: neutralActivitySteps(crowMotion.patch, 1_201),
    });
    if (crowRest === null) throw new Error("Arrived crow rest decision failed");
    expect(memberFor(crowRest.patch, "fish-crow").actor.intent.kind).toBe("rest");

    const beforeDawn = activityPatch(358);
    const resting = stepCoreEcologyAggregatePatch(beforeDawn, {
      tick: 359,
      actorSteps: beforeDawn.populations.flatMap(({ members }) => members)
        .filter(({ materialization }) => materialization === "materialized")
        .map(({ actor }) => ({
          actorId: actor.identity.stableId,
          observations: [],
          foodOpportunities: [],
          accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
          neutralActivityPreference: "rest" as const,
        })),
    });
    if (resting === null) throw new Error("Pre-dawn rest decision failed");
    expect(memberFor(resting.patch, "northern-harrier").actor.intent.kind).toBe("rest");
    const daylight = stepCoreEcologyAggregatePatch(resting.patch, {
      tick: 360,
      actorSteps: neutralActivitySteps(resting.patch, 360),
    });
    if (daylight === null) throw new Error("Dawn harrier decision failed");
    const watchingHarrier = memberFor(daylight.patch, "northern-harrier").actor;
    expect(watchingHarrier.intent.kind).toBe("observe");
    const quartering = projectCoreEcologyActivity(daylight.patch, {
      actorId: watchingHarrier.identity.stableId,
      atTick: 360,
    });
    if (quartering?.motion.kind !== "target-area") {
      throw new Error("Daylight harrier omitted its quartering target");
    }
    const beforeQuarter = worldPositionDelta(
      watchingHarrier.address.position,
      quartering.motion.targetArea.center,
    );
    const harrierMotion = stepCoreEcologyActivityMotion(daylight.patch, {
      actorId: watchingHarrier.identity.stableId,
      atTick: 360,
      maximumStepUnits: 1_000,
    });
    if (harrierMotion === null) throw new Error("Authenticated harrier quartering failed");
    expect(harrierMotion.resolution).toBe("moved");
    const movedHarrier = memberFor(harrierMotion.patch, "northern-harrier").actor;
    const afterQuarter = worldPositionDelta(
      movedHarrier.address.position,
      quartering.motion.targetArea.center,
    );
    expect(Math.hypot(afterQuarter.x, afterQuarter.y))
      .toBeLessThan(Math.hypot(beforeQuarter.x, beforeQuarter.y));
  });

  it("keeps activity projections and movement exact at both signed region limits", () => {
    for (const region of [
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    ]) {
      const patch = activityPatch(360, "materialized", region);
      const actors = patch.populations.flatMap(({ species, members }) => (
        species === "fish-crow" || species === "northern-harrier"
          ? members.map(({ actor }) => actor)
          : []
      ));
      expect(actors.length).toBeGreaterThan(0);
      for (const actor of actors) {
        const species = actor.identity.species;
        const first = projectCoreEcologyActivity(patch, {
          actorId: actor.identity.stableId,
          atTick: 360,
        });
        expect(first).toEqual(projectCoreEcologyActivity(patch, {
          actorId: actor.identity.stableId,
          atTick: 360,
        }));
        expect(first?.motion.kind).toBe(
          species === "northern-harrier" ? "target-area" : "defer-to-intent",
        );
        const stepped = stepCoreEcologyActivityMotion(patch, {
          actorId: actor.identity.stableId,
          atTick: 360,
          maximumStepUnits: 1_000,
        });
        expect(stepped).not.toBeNull();
      }
    }
  });

  it("fails an unrepresentable schedule target without mutating or reclassifying the actor", () => {
    let patch = activityPatch(360);
    const harrier = memberFor(patch, "northern-harrier").actor;
    const distant = repositionCoreWildlifeActor(harrier, {
      atTick: 360,
      position: createWorldPosition(
        createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
        0,
        0,
      ),
      heading: harrier.address.heading,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, distant);
    const before = serializeCoreEcologyAggregatePatch(patch);
    expect(projectCoreEcologyActivity(patch, {
      actorId: distant.identity.stableId,
      atTick: 360,
    })?.motion.kind).toBe("target-area");
    expect(stepCoreEcologyActivityMotion(patch, {
      actorId: distant.identity.stableId,
      atTick: 360,
      maximumStepUnits: 1_000,
    })).toBeNull();
    expect(serializeCoreEcologyAggregatePatch(patch)).toBe(before);
    expect(memberFor(patch, "northern-harrier").actor.intent.kind).toBe("observe");
  });

  it("authenticates a crow perch from habitat and seeks it before claiming perched", () => {
    const patch = activityPatch(1_200);
    const crow = memberFor(patch, "fish-crow");
    const perched = projectCoreEcologyActivity(patch, {
      actorId: crow.actor.identity.stableId,
      atTick: 1_200,
    });
    expect(perched).toMatchObject({
      state: "perched",
      preferredNeutralIntent: "rest",
      presentationSignal: "perched",
      perch: { availability: "available-here" },
      motion: { kind: "hold-position" },
    });

    const away = repositionCoreWildlifeActor(crow.actor, {
      atTick: 1_200,
      position: translateWorldPosition(
        crow.actor.address.position,
        WORLD_POSITION_UNITS_PER_TILE * 2,
        0,
      ),
      heading: crow.actor.address.heading,
    });
    const displaced = replaceCoreEcologyAggregatePatchActor(patch, away);
    const seeking = projectCoreEcologyActivity(displaced, {
      actorId: away.identity.stableId,
      atTick: 1_200,
    });
    expect(seeking).toMatchObject({
      state: "seeking-perch",
      preferredNeutralIntent: "observe",
      presentationSignal: null,
      perch: { availability: "available-at-anchor" },
      motion: { kind: "target-area", verb: "seek-perch" },
    });
    if (
      perched === null
      || perched.perch.anchor === null
      || seeking?.motion.kind !== "target-area"
    ) {
      throw new Error("Crow activity projection lost its authenticated perch anchor");
    }
    expect(seeking.motion.targetArea.center).toEqual(perched.perch.anchor);
  });

  it("holds without prey evidence and returns from wading ground to its dry refuge", () => {
    let highPatch = tidalActivityPatch(360);
    const highEgret = memberFor(highPatch, "snowy-egret").actor;
    const highTide = projectCoreEcologyTidalTable(highPatch, 360)?.snowyEgret;
    if (highTide?.wadingTarget === null || highTide?.wadingTarget === undefined) {
      throw new Error("Fixture lacks a high-tide egret wading target");
    }
    highPatch = replaceCoreEcologyAggregatePatchActor(highPatch, repositionCoreWildlifeActor(
      highEgret,
      {
        atTick: 360,
        position: highTide.refugeTarget.targetPosition,
        heading: highEgret.address.heading,
      },
    ));
    const seekingWater = projectCoreEcologyActivity(highPatch, {
      actorId: highEgret.identity.stableId,
      atTick: 360,
    });
    expect(seekingWater).toMatchObject({
      state: "waiting-on-tide",
      presentationSignal: null,
      sourceObservationId: null,
      motion: { kind: "hold-position" },
    });
    const moved = stepCoreEcologyActivityMotion(highPatch, {
      actorId: highEgret.identity.stableId,
      atTick: 360,
      maximumStepUnits: 1_000,
    });
    expect(moved?.resolution).toBe("held");

    const atWater = replaceCoreEcologyAggregatePatchActor(highPatch, repositionCoreWildlifeActor(
      highEgret,
      {
        atTick: 360,
        position: highTide.wadingTarget.targetPosition,
        heading: highEgret.address.heading,
      },
    ));
    expect(projectCoreEcologyActivity(atWater, {
      actorId: highEgret.identity.stableId,
      atTick: 360,
    })).toMatchObject({
      state: "wading-scan",
      presentationSignal: "wading-scan",
      sourceObservationId: null,
      motion: { kind: "hold-position" },
    });

    let restPatch = tidalActivityPatch(0);
    const restingEgret = memberFor(restPatch, "snowy-egret").actor;
    const restTide = projectCoreEcologyTidalTable(restPatch, 0)?.snowyEgret;
    if (restTide?.wadingTarget === null || restTide?.wadingTarget === undefined) {
      throw new Error("Fixture lacks a low-tide egret edge");
    }
    restPatch = replaceCoreEcologyAggregatePatchActor(restPatch, repositionCoreWildlifeActor(
      restingEgret,
      {
        atTick: 0,
        position: restTide.wadingTarget.targetPosition,
        heading: restingEgret.address.heading,
      },
    ));
    expect(projectCoreEcologyActivity(restPatch, {
      actorId: restingEgret.identity.stableId,
      atTick: 0,
    })).toMatchObject({
      state: "seeking-tidal-refuge",
      presentationSignal: "tidal-relocation-flight",
      motion: { kind: "target-area", verb: "seek-tidal-refuge" },
    });
    const atRefuge = replaceCoreEcologyAggregatePatchActor(restPatch, repositionCoreWildlifeActor(
      restingEgret,
      {
        atTick: 0,
        position: restTide.refugeTarget.targetPosition,
        heading: restingEgret.address.heading,
      },
    ));
    expect(projectCoreEcologyActivity(atRefuge, {
      actorId: restingEgret.identity.stableId,
      atTick: 0,
    })).toMatchObject({
      state: "resting",
      preferredNeutralIntent: "rest",
      presentationSignal: "resting",
      motion: { kind: "hold-position" },
    });
  });

  it("leaves coarse and non-policy actors untouched", () => {
    const coarse = activityPatch(360, "coarse");
    const crow = memberFor(coarse, "fish-crow");
    expect(projectCoreEcologyActivity(coarse, {
      actorId: crow.actor.identity.stableId,
      atTick: 360,
    })).toBeNull();

    const materialized = activityPatch(360);
    const other = materialized.populations.flatMap(({ members, species }) => (
      species === "fish-crow" || species === "northern-harrier" ? [] : members
    ))[0];
    if (other === undefined) throw new Error("Activity fixture requires one legacy species");
    expect(projectCoreEcologyActivity(materialized, {
      actorId: other.actor.identity.stableId,
      atTick: 360,
    })).toBeNull();
    expect(materialized.populations.some(({ species }) => (
      species === "southern-leopard-frog"
    ))).toBe(false);
  });
});

function activityPatch(
  tick: number,
  materialization: "coarse" | "materialized" = "materialized",
  region: RegionCoord = ORIGIN,
): CoreEcologyAggregatePatchState {
  const habitat = deriveHabitat(SEED, region);
  const patch = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: `activity:${tick}:${materialization}:${region.x}:${region.y}`,
    originRegion: region,
    tick,
    populations: individualInputs(habitat, materialization),
    derivation: { kind: "habitat-v4", habitat },
  });
  if (region.x === ORIGIN.x && region.y === ORIGIN.y) {
    memberFor(patch, "fish-crow");
    memberFor(patch, "northern-harrier");
  }
  return patch;
}

function tidalActivityPatch(tick: number): CoreEcologyAggregatePatchState {
  const seed = seedFromText("tidal-triad-1");
  const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
    rootSeed: seed,
    originRegion: ORIGIN,
    focus: {
      position: createWorldPosition(
        ORIGIN,
        Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      ),
      radiusTiles: 32,
    },
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: `tidal-activity:${tick}`,
    originRegion: ORIGIN,
    tick,
    populations: tidalIndividualInputs(habitat),
    derivation: { kind: "habitat-v5", habitat },
  });
  memberFor(patch, "snowy-egret");
  return patch;
}

function neutralActivitySteps(
  patch: CoreEcologyAggregatePatchState,
  tick: number,
) {
  return patch.populations.flatMap(({ members }) => members)
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => {
      const activity = projectCoreEcologyActivity(patch, {
        actorId: actor.identity.stableId,
        atTick: tick,
      });
      return {
        actorId: actor.identity.stableId,
        observations: [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
        ...(activity?.preferredNeutralIntent === null || activity === null
          ? {}
          : { neutralActivityPreference: activity.preferredNeutralIntent }),
      };
    });
}

function deriveHabitat(
  seed: RootSeed,
  region: RegionCoord,
): CoreEcologyRainChorusHabitatAssemblage {
  return deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: seed,
    originRegion: region,
    focus: {
      position: createWorldPosition(
        region,
        Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      ),
      radiusTiles: 32,
    },
  });
}

function individualInputs(
  habitat: CoreEcologyRainChorusHabitatAssemblage,
  materialization: "coarse" | "materialized",
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
            materialization,
          })),
        }]
  ));
}

function tidalIndividualInputs(
  habitat: CoreEcologyTidalTableHabitatAssemblage,
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
            materialization: "materialized" as const,
          })),
        }]
  ));
}

function memberFor(
  patch: CoreEcologyAggregatePatchState,
  species: CoreWildlifeSpecies,
): CoreEcologyPopulationMemberState {
  const member = patch.populations.find((population) => population.species === species)?.members[0];
  if (member === undefined) throw new Error(`Activity fixture requires ${species}`);
  return member;
}
