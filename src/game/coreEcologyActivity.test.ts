import { describe, expect, it } from "vitest";

import { ACTOR_PERCEPTION_SCALE, createActorObservation } from "../sim/actorPerception";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { seedFromText, type RootSeed } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord, type RegionCoord } from "../sim/regions";
import { tideAtTick } from "../sim/terrain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
  type CoreEcologyPopulationMemberState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS,
  CORE_ECOLOGY_ACTIVITY_OWNER_ID,
  CORE_ECOLOGY_ACTIVITY_SPECIES,
  coreEcologyActivityDestinationSemantic,
  coreEcologyActivityTravelMedium,
  projectCoreEcologyActivity,
  projectCoreEcologyDayPhase,
  stepCoreEcologyActivityMotion,
  validateCoreEcologyActivityProjectionAffordance,
  validateCoreEcologyActivityPolicies,
  type CoreEcologyActivityProjection,
} from "./coreEcologyActivity";
import { projectCoreEcologyBreadthActivityAuthority } from "./coreEcologyActivityAuthority";
import { coreEcologyActivityAffordanceProfile } from "./coreEcologyActivityAffordance";
import {
  CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
  deriveCoreEcologyBreadthHabitat,
} from "./coreEcologyBreadthHabitat";
import {
  CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyTidalWebHabitatAssemblage,
  deriveCoreEcologyTidalTableHabitatAssemblage,
  deriveCoreEcologyWaterfowlHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyTidalWebHabitatAssemblage,
  type CoreEcologyTidalTableHabitatAssemblage,
  type CoreEcologyWaterfowlHabitatAssemblage,
} from "./coreEcologyHabitat";
import { projectCoreEcologyTidalTable } from "./coreEcologyTidalTable";
import { CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES } from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
} from "./coreWildlifeActor";
import { createLivingActorTraversabilitySurface } from "./livingActorLocomotion";
import { createCoreEcologyBreadthResidentPatch } from "./regionalBreadthCohort";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

const SEED = seedFromText("rain chorus bounded diurnal activity owner");
const BREADTH_ACTIVITY_SEED = seedFromText("alpha37 estuary breadth shared properties");
const DIVING_WATERBIRD_REGION = createRegionCoord(173_753, 11_507);
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
    const alpha32ActivitySpecies = [
      "fish-crow",
      "northern-harrier",
      "snowy-egret",
      "american-black-duck",
      "north-american-river-otter",
      "gull",
    ] as const;
    expect(CORE_ECOLOGY_ACTIVITY_SPECIES.slice(0, alpha32ActivitySpecies.length))
      .toEqual(alpha32ActivitySpecies);
    expect(CORE_ECOLOGY_ACTIVITY_SPECIES.slice(alpha32ActivitySpecies.length))
      .toEqual([
        "golden-eagle",
        "harbor-seal",
        "great-blue-heron",
        "common-tern",
        "osprey",
        "greater-yellowlegs",
        "belted-kingfisher",
        "double-crested-cormorant",
        "seaside-sparrow",
        "diamondback-terrapin",
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

  it("lets an aerial surface opportunist follow only a current anonymous sighting", () => {
    let patch = activityPatch(360);
    const gull = memberFor(patch, "gull").actor;
    expect(projectCoreEcologyActivity(patch, {
      actorId: gull.identity.stableId,
      atTick: 360,
    })).toMatchObject({
      state: "active-watch",
      sourceObservationId: null,
      preferredNeutralIntent: "observe",
      presentationSignal: null,
      motion: { kind: "defer-to-intent" },
    });

    const observedArea = translateWorldPosition(
      gull.address.position,
      4 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const observation = createActorObservation({
      id: "gull-surface-opportunity:361",
      observerId: gull.identity.stableId,
      observedAtTick: 361,
      channel: "vision",
      perceivedClass: "aquatic-activity",
      subjectId: null,
      area: { center: observedArea, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "classified",
      interrupt: "none",
    });
    if (observation === null) throw new Error("Gull surface observation fixture failed");
    const observed = stepCoreWildlifeActor(gull, {
      tick: 361,
      observations: [observation],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: "observe",
    });
    if (observed === null) throw new Error("Gull cognition rejected lawful surface activity");
    patch = replaceCoreEcologyAggregatePatchActor(patch, observed.actor);

    const surfaceProjection = projectCoreEcologyActivity(patch, {
      actorId: gull.identity.stableId,
      atTick: 361,
    });
    expect(surfaceProjection).toMatchObject({
      state: "seeking-surface-opportunity",
      sourceObservationId: observation.id,
      presentationSignal: "surface-opportunity-flight",
      motion: {
        kind: "target-area",
        verb: "seek-surface-opportunity",
      },
    });
    const activityProfile = coreEcologyActivityAffordanceProfile("gull");
    if (surfaceProjection === null || activityProfile === null) {
      throw new Error("Gull activity affordance fixture failed");
    }
    expect(validateCoreEcologyActivityProjectionAffordance(
      activityProfile,
      observed.actor,
      surfaceProjection,
    )).toEqual([]);
    expect(validateCoreEcologyActivityProjectionAffordance(
      activityProfile,
      observed.actor,
      {
        ...surfaceProjection,
        presentationSignal: "perched",
      } as CoreEcologyActivityProjection,
    )).toContain("undeclared-presentation-signal");
    expect(validateCoreEcologyActivityProjectionAffordance(
      activityProfile,
      observed.actor,
      {
        ...surfaceProjection,
        motion: {
          ...surfaceProjection.motion,
          travelMedium: "surface-water",
        },
      } as CoreEcologyActivityProjection,
    )).toEqual(expect.arrayContaining([
      "destination-rejects-travel-medium",
      "undeclared-travel-medium",
    ]));
    expect(validateCoreEcologyActivityProjectionAffordance(
      activityProfile,
      observed.actor,
      { ...surfaceProjection, sourceObservationId: "unknown-observation" },
    )).toEqual(expect.arrayContaining([
      "invalid-or-stale-observation-source",
      "observed-destination-without-current-source",
    ]));
    expect(validateCoreEcologyActivityProjectionAffordance(
      activityProfile,
      observed.actor,
      {
        ...surfaceProjection,
        motion: {
          kind: "target-area",
          verb: "seek-perch",
          targetArea: surfaceProjection.motion.kind === "target-area"
            ? surfaceProjection.motion.targetArea
            : observation.area,
        },
      },
    )).toContain("undeclared-destination-semantic");
    expect(stepCoreEcologyActivityMotion(patch, {
      actorId: gull.identity.stableId,
      atTick: 361,
      maximumStepUnits: 700,
    })).toMatchObject({ resolution: "moved" });

    expect(projectCoreEcologyActivity(patch, {
      actorId: gull.identity.stableId,
      atTick: 362,
    })).toMatchObject({
      state: "active-watch",
      sourceObservationId: null,
      presentationSignal: null,
      motion: { kind: "defer-to-intent" },
    });

    const restPatch = activityPatch(1_200);
    const restingGull = memberFor(restPatch, "gull").actor;
    expect(projectCoreEcologyActivity(restPatch, {
      actorId: restingGull.identity.stableId,
      atTick: 1_200,
    })).toMatchObject({
      state: "resting",
      preferredNeutralIntent: "rest",
      presentationSignal: "resting",
      motion: { kind: "hold-position" },
    });

    const displacedRestingGull = repositionCoreWildlifeActor(restingGull, {
      atTick: 1_200,
      position: translateWorldPosition(
        restingGull.address.position,
        4 * WORLD_POSITION_UNITS_PER_TILE,
        0,
      ),
      heading: restingGull.address.heading,
    });
    const displacedRestPatch = replaceCoreEcologyAggregatePatchActor(
      restPatch,
      displacedRestingGull,
    );
    expect(projectCoreEcologyActivity(displacedRestPatch, {
      actorId: restingGull.identity.stableId,
      atTick: 1_200,
    })).toMatchObject({
      state: "seeking-habitat-anchor",
      preferredNeutralIntent: "observe",
      presentationSignal: "tidal-relocation-flight",
      motion: {
        kind: "target-area",
        verb: "seek-habitat-anchor",
      },
    });
    expect(stepCoreEcologyActivityMotion(displacedRestPatch, {
      actorId: restingGull.identity.stableId,
      atTick: 1_200,
      maximumStepUnits: 700,
    })).toMatchObject({ resolution: "moved" });
  });

  it("reuses one bounded diving-waterbird activity without inventing prey or water custody", () => {
    const daylight = divingWaterbirdActivityFixture(360);
    expect(projectCoreEcologyActivity(daylight.patch, {
      actorId: daylight.actor.identity.stableId,
      atTick: 360,
    }, daylight.authority)).toMatchObject({
      state: "active-watch",
      sourceObservationId: null,
      preferredNeutralIntent: "observe",
      presentationSignal: null,
      motion: { kind: "defer-to-intent" },
    });

    const observedArea = translateWorldPosition(
      daylight.actor.address.position,
      4 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const opportunity = createActorObservation({
      id: "diving-waterbird-surface-opportunity:361",
      observerId: daylight.actor.identity.stableId,
      observedAtTick: 361,
      channel: "vision",
      perceivedClass: "aquatic-activity",
      subjectId: null,
      area: { center: observedArea, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "classified",
      interrupt: "none",
    });
    if (opportunity === null) {
      throw new Error("Diving-waterbird surface observation fixture failed");
    }
    const observed = stepCoreWildlifeActor(daylight.actor, {
      tick: 361,
      observations: [opportunity],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: "observe",
    });
    if (observed === null) throw new Error("Diving-waterbird cognition failed");
    const observedPatch = replaceCoreEcologyAggregatePatchActor(
      daylight.patch,
      observed.actor,
    );
    const seeking = projectCoreEcologyActivity(observedPatch, {
      actorId: observed.actor.identity.stableId,
      atTick: 361,
    }, daylight.authority);
    expect(seeking).toMatchObject({
      state: "seeking-surface-opportunity",
      sourceObservationId: opportunity.id,
      presentationSignal: "surface-opportunity-flight",
      motion: {
        kind: "target-area",
        verb: "seek-surface-opportunity",
      },
    });
    expect(seeking === null ? null : coreEcologyActivityTravelMedium(seeking.motion))
      .toBe("air");

    const atOpportunity = repositionCoreWildlifeActor(observed.actor, {
      atTick: 361,
      position: observedArea,
      heading: observed.actor.address.heading,
    });
    const atOpportunityPatch = replaceCoreEcologyAggregatePatchActor(
      observedPatch,
      atOpportunity,
    );
    expect(projectCoreEcologyActivity(atOpportunityPatch, {
      actorId: atOpportunity.identity.stableId,
      atTick: 361,
    }, daylight.authority)).toMatchObject({
      state: "surface-diving",
      sourceObservationId: opportunity.id,
      presentationSignal: "surface-diving",
      motion: { kind: "hold-position" },
    });

    const threat = createActorObservation({
      id: "diving-waterbird-threat:361",
      observerId: daylight.actor.identity.stableId,
      observedAtTick: 361,
      channel: "vision",
      perceivedClass: "predator",
      subjectId: "FOX-diving-waterbird-threat",
      area: { center: daylight.actor.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "identified",
      interrupt: "strong",
    });
    if (threat === null) throw new Error("Diving-waterbird threat fixture failed");
    const alarmed = stepCoreWildlifeActor(daylight.actor, {
      tick: 361,
      observations: [threat],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: "observe",
    });
    if (alarmed === null) throw new Error("Diving-waterbird threat cognition failed");
    const alarmPatch = replaceCoreEcologyAggregatePatchActor(daylight.patch, alarmed.actor);
    expect(projectCoreEcologyActivity(alarmPatch, {
      actorId: alarmed.actor.identity.stableId,
      atTick: 361,
    }, daylight.authority)).toMatchObject({
      state: "responding",
      responsiveToImmediateIntent: true,
      motion: { kind: "defer-to-intent" },
    });

    const rest = divingWaterbirdActivityFixture(1_200);
    expect(projectCoreEcologyActivity(rest.patch, {
      actorId: rest.actor.identity.stableId,
      atTick: 1_200,
    }, rest.authority)).toMatchObject({
      state: "resting",
      preferredNeutralIntent: "rest",
      presentationSignal: "resting",
      motion: { kind: "hold-position" },
    });
    const displacedActor = repositionCoreWildlifeActor(rest.actor, {
      atTick: 1_200,
      position: translateWorldPosition(
        rest.actor.address.position,
        4 * WORLD_POSITION_UNITS_PER_TILE,
        0,
      ),
      heading: rest.actor.address.heading,
    });
    const displacedPatch = replaceCoreEcologyAggregatePatchActor(
      rest.patch,
      displacedActor,
    );
    const returning = projectCoreEcologyActivity(displacedPatch, {
      actorId: displacedActor.identity.stableId,
      atTick: 1_200,
    }, rest.authority);
    expect(returning).toMatchObject({
      state: "seeking-habitat-anchor",
      preferredNeutralIntent: "observe",
      presentationSignal: "tidal-relocation-flight",
      motion: {
        kind: "target-area",
        verb: "seek-habitat-anchor",
      },
    });
    expect(returning === null ? null : coreEcologyActivityTravelMedium(returning.motion))
      .toBe("air");
  });

  it("maps every executable target verb onto one reusable destination contract", () => {
    const targetArea = Object.freeze({
      center: createWorldPosition(ORIGIN, 0, 0),
      radiusUnits: 0,
    });
    const legacy = [
      ["quarter", "deterministic-local-quartering-area"],
      ["seek-habitat-anchor", "authenticated-habitat-anchor"],
      ["seek-perch", "authenticated-habitat-perch"],
      ["seek-surface-opportunity", "observed-surface-opportunity"],
      ["seek-tidal-refuge", "authenticated-tidal-refuge"],
      ["seek-wading-ground", "authenticated-depth-safe-wading-ground"],
    ] as const;
    for (const [verb, semantic] of legacy) {
      expect(coreEcologyActivityDestinationSemantic({
        kind: "target-area",
        verb,
        targetArea,
      })).toBe(semantic);
    }
    const explicit = [
      ["seek-dabbling-water", "authenticated-depth-safe-dabbling-water", "surface-water"],
      ["seek-otter-foraging-water", "authenticated-foraging-water", "amphibious"],
      ["seek-otter-haulout", "authenticated-dry-haulout", "amphibious"],
      ["seek-shore-foraging-water", "authenticated-foraging-water", "amphibious"],
      ["seek-dry-haulout", "authenticated-dry-haulout", "amphibious"],
      ["seek-waterfowl-refuge", "authenticated-tidal-refuge", "air"],
    ] as const;
    for (const [verb, semantic, travelMedium] of explicit) {
      expect(coreEcologyActivityDestinationSemantic({
        kind: "target-area",
        verb,
        targetArea,
        travelMedium,
      })).toBe(semantic);
    }
    expect(coreEcologyActivityDestinationSemantic({ kind: "hold-position" })).toBeNull();
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
      const patch = activityPatch(720, "materialized", region);
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
          atTick: 720,
        });
        expect(first).toEqual(projectCoreEcologyActivity(patch, {
          actorId: actor.identity.stableId,
          atTick: 720,
        }));
        expect(first?.motion.kind).toBe(
          species === "northern-harrier" ? "target-area" : "defer-to-intent",
        );
        const stepped = stepCoreEcologyActivityMotion(patch, {
          actorId: actor.identity.stableId,
          atTick: 720,
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
      routine: {
        profileId: "day-active",
        posture: { state: "resting" },
        action: "settle-at-rest-destination",
      },
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
      routine: {
        profileId: "day-active",
        posture: { state: "awake" },
        action: "travel-to-rest-destination",
      },
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

    const daylight = activityPatch(720);
    const watching = memberFor(daylight, "fish-crow").actor;
    expect(projectCoreEcologyActivity(daylight, {
      actorId: watching.identity.stableId,
      atTick: 720,
    })).toMatchObject({
      state: "active-watch",
      routine: {
        clockPreference: "active",
        posture: { state: "awake" },
        action: "remain-active",
      },
    });
  });

  it("derives sleep and lawful startle from the persisted perch-watch intent bout", () => {
    let patch = activityPatch(1_200);
    const initialRest = stepCoreEcologyAggregatePatch(patch, {
      tick: 1_201,
      actorSteps: neutralActivitySteps(patch, 1_201),
    });
    if (initialRest === null) throw new Error("Perch-watch rest decision failed");
    patch = commitFishCrowActivity(initialRest.patch, 1_201);
    expect(memberFor(patch, "fish-crow").actor.intent).toMatchObject({
      kind: "rest",
      enteredAtTick: 1_201,
    });

    for (let tick = 1_202; tick <= 1_222; tick += 1) {
      const next = stepCoreEcologyAggregatePatch(patch, {
        tick,
        actorSteps: neutralActivitySteps(patch, tick),
      });
      if (next === null) throw new Error(`Perch-watch rest bout failed at ${tick}`);
      patch = commitFishCrowActivity(next.patch, tick);
    }
    const sleepingActor = memberFor(patch, "fish-crow").actor;
    const asleep = projectCoreEcologyActivity(patch, {
      actorId: sleepingActor.identity.stableId,
      atTick: 1_222,
    });
    expect(asleep).toMatchObject({
      state: "perched",
      preferredNeutralIntent: "rest",
      routine: {
        posture: { state: "asleep", enteredAtTick: 1_222 },
        action: "sleep-at-rest-destination",
      },
      motion: { kind: "hold-position" },
    });

    const restored = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(patch),
    );
    if (restored === null) throw new Error("Perch-watch save round trip failed");
    expect(projectCoreEcologyActivity(restored, {
      actorId: sleepingActor.identity.stableId,
      atTick: 1_222,
    })).toEqual(asleep);

    const wakeSensitivity = asleep?.routine?.wakeSensitivity;
    if (wakeSensitivity === undefined) throw new Error("Sleep wake threshold is absent");
    const weakThreat = createActorObservation({
      id: "perch-watch-weak-threat:1223",
      observerId: sleepingActor.identity.stableId,
      observedAtTick: 1_223,
      channel: "vision",
      perceivedClass: "predator",
      subjectId: "FOX-perch-watch-weak-threat",
      area: { center: sleepingActor.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: wakeSensitivity - 1,
      identification: "identified",
      interrupt: "strong",
    });
    if (weakThreat === null) throw new Error("Weak perch-watch threat fixture failed");
    const stepWithThreat = (observation: NonNullable<typeof weakThreat>) => (
      neutralActivitySteps(patch, 1_223).map((actorStep) => (
        actorStep.actorId === sleepingActor.identity.stableId
          ? {
              ...actorStep,
              observations: [observation],
              minimumPerceptionWakeSalience: wakeSensitivity,
            }
          : actorStep
      ))
    );
    const sleptThrough = stepCoreEcologyAggregatePatch(patch, {
      tick: 1_223,
      actorSteps: stepWithThreat(weakThreat),
    });
    if (sleptThrough === null) throw new Error("Aggregate wake gate rejected weak evidence");
    expect(memberFor(sleptThrough.patch, "fish-crow").actor.intent.kind).toBe("rest");

    const threat = createActorObservation({
      id: "perch-watch-threat:1223",
      observerId: sleepingActor.identity.stableId,
      observedAtTick: 1_223,
      channel: "vision",
      perceivedClass: "predator",
      subjectId: "FOX-perch-watch-threat",
      area: { center: sleepingActor.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "identified",
      interrupt: "strong",
    });
    if (threat === null) throw new Error("Perch-watch threat fixture failed");
    const physicallyBlocked = stepCoreEcologyAggregatePatch(patch, {
      tick: 1_223,
      actorSteps: stepWithThreat(threat).map((actorStep) => (
        actorStep.actorId === sleepingActor.identity.stableId
          ? {
              ...actorStep,
              accessibility: {
                ...CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
                alarm: false,
                disengage: false,
                flee: false,
                forage: false,
                guard: false,
                pursue: false,
                regroup: false,
                retreat: false,
                scavenge: false,
              },
            }
          : actorStep
      )),
    });
    if (physicallyBlocked === null) throw new Error("Blocked wake fixture failed");
    const blockedCrow = memberFor(physicallyBlocked.patch, "fish-crow").actor;
    expect(blockedCrow.intent.kind).toBe("rest");
    expect(projectCoreEcologyActivity(physicallyBlocked.patch, {
      actorId: blockedCrow.identity.stableId,
      atTick: 1_223,
    })).toMatchObject({
      state: "responding",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: "observe",
      routine: {
        posture: { state: "startled", enteredAtTick: 1_223 },
        action: "respond-to-disturbance",
        transitionCause: "disturbance",
        causeReferenceId: threat.id,
      },
    });

    const alarmedStep = stepCoreEcologyAggregatePatch(patch, {
      tick: 1_223,
      actorSteps: stepWithThreat(threat),
    });
    if (alarmedStep === null) throw new Error("Perch-watch threat response failed");
    const alarmed = memberFor(alarmedStep.patch, "fish-crow").actor;
    expect(["alarm", "flee", "retreat"]).toContain(alarmed.intent.kind);
    const alarmPatch = alarmedStep.patch;
    const startled = projectCoreEcologyActivity(alarmPatch, {
      actorId: alarmed.identity.stableId,
      atTick: 1_223,
    });
    expect(startled).toMatchObject({
      state: "responding",
      responsiveToImmediateIntent: true,
      preferredNeutralIntent: null,
      routine: {
        effectivePreference: "active",
        posture: { state: "startled", enteredAtTick: 1_223 },
        action: "respond-to-disturbance",
        transitionCause: "disturbance",
        causeReferenceId: threat.id,
      },
      motion: { kind: "defer-to-intent" },
    });
    const committedStartle = stepCoreEcologyActivityMotion(alarmPatch, {
      actorId: alarmed.identity.stableId,
      atTick: 1_223,
      maximumStepUnits: 1,
    });
    if (committedStartle === null) throw new Error("Startled posture did not commit");
    const reloadedStartle = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(committedStartle.patch),
    );
    if (reloadedStartle === null) throw new Error("Startled posture did not reload");
    expect(projectCoreEcologyActivity(reloadedStartle, {
      actorId: alarmed.identity.stableId,
      atTick: 1_224,
    })).toMatchObject({
      routine: {
        posture: { state: "startled", enteredAtTick: 1_223 },
        action: "respond-to-disturbance",
      },
    });
    const reloadedActor = memberFor(reloadedStartle, "fish-crow").actor;
    const quietHold = stepCoreWildlifeActor(reloadedActor, {
      tick: 1_224,
      observations: [],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      minimumPerceptionWakeSalience: wakeSensitivity,
      neutralActivityPreference: "observe",
    });
    if (quietHold === null) throw new Error("Startled hold cognition was rejected");
    const quietHoldPatch = replaceCoreEcologyAggregatePatchActor(
      reloadedStartle,
      quietHold.actor,
    );
    expect(projectCoreEcologyActivity(quietHoldPatch, {
      actorId: alarmed.identity.stableId,
      atTick: 1_224,
    })).toMatchObject({
      state: "responding",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: "observe",
      routine: {
        posture: { state: "startled", enteredAtTick: 1_223 },
        action: "respond-to-disturbance",
      },
      motion: { kind: "defer-to-intent" },
    });
  });

  it("lets an urgent rest need override a perch-watch active clock", () => {
    let patch = activityPatch(720);
    const watching = memberFor(patch, "fish-crow").actor;
    const tired = replaceCoreWildlifeActorPhysiology(watching, {
      atTick: 720,
      needs: { ...watching.needs, rest: 500_000 },
      condition: watching.condition,
    });
    const resting = stepCoreWildlifeActor(tired, {
      tick: 721,
      observations: [],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: "observe",
    });
    if (resting === null) throw new Error("Urgent perch-watch rest was rejected");
    expect(resting.actor.intent).toMatchObject({
      kind: "rest",
      cause: { kind: "need", referenceId: "need:rest" },
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, resting.actor);
    expect(projectCoreEcologyActivity(patch, {
      actorId: resting.actor.identity.stableId,
      atTick: 721,
    })).toMatchObject({
      preferredNeutralIntent: "rest",
      routine: {
        clockPreference: "active",
        effectivePreference: "rest",
        posture: { state: "resting" },
        action: "settle-at-rest-destination",
      },
    });

    const threat = createActorObservation({
      id: "urgent-rest-threat:722",
      observerId: resting.actor.identity.stableId,
      observedAtTick: 722,
      channel: "vision",
      perceivedClass: "predator",
      subjectId: "PREDATOR-urgent-rest",
      area: { center: resting.actor.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "identified",
      interrupt: "strong",
    });
    if (threat === null) throw new Error("Urgent-rest threat fixture failed");
    const responding = stepCoreWildlifeActor(resting.actor, {
      tick: 722,
      observations: [threat],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: "rest",
    });
    if (responding === null) throw new Error("Urgent-rest response failed");
    expect(projectCoreEcologyActivity(
      replaceCoreEcologyAggregatePatchActor(patch, responding.actor),
      { actorId: responding.actor.identity.stableId, atTick: 722 },
    )).toMatchObject({
      state: "responding",
      routine: {
        effectivePreference: "active",
        posture: { state: "startled" },
        transitionCause: "disturbance",
      },
    });
  });

  it("does not count need-driven travel time as settling at the crow perch", () => {
    let patch = activityPatch(720);
    const generated = memberFor(patch, "fish-crow").actor;
    const perch = generated.address.position;
    const away = repositionCoreWildlifeActor(generated, {
      atTick: 720,
      position: translateWorldPosition(
        perch,
        WORLD_POSITION_UNITS_PER_TILE * 2,
        0,
      ),
      heading: generated.address.heading,
    });
    const tired = replaceCoreWildlifeActorPhysiology(away, {
      atTick: 720,
      needs: { ...away.needs, rest: 500_000 },
      condition: away.condition,
    });
    const seeking = projectCoreEcologyActivity(
      replaceCoreEcologyAggregatePatchActor(patch, tired),
      { actorId: tired.identity.stableId, atTick: 720 },
    );
    expect(seeking).toMatchObject({
      preferredNeutralIntent: "observe",
      routine: {
        effectivePreference: "rest",
        action: "travel-to-rest-destination",
        posture: { state: "awake" },
      },
      motion: { kind: "target-area", verb: "seek-perch" },
    });
    const travelling = stepCoreWildlifeActor(tired, {
      tick: 721,
      observations: [],
      foodOpportunities: [],
      accessibility: Object.freeze({
        ...CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
        rest: false,
      }),
      neutralActivityPreference: "observe",
    });
    if (travelling === null) throw new Error("Need-driven travel fixture failed");
    expect(travelling.actor.intent).toMatchObject({
      kind: "observe",
    });
    expect(travelling.actor.needs.rest).toBeGreaterThan(tired.needs.rest);

    patch = replaceCoreEcologyAggregatePatchActor(patch, travelling.actor);
    const moved = stepCoreEcologyActivityMotion(patch, {
      actorId: travelling.actor.identity.stableId,
      atTick: 721,
      maximumStepUnits: WORLD_POSITION_UNITS_PER_TILE * 3,
    });
    if (moved === null) throw new Error("Need-driven perch travel failed");
    expect(moved.resolution).toBe("moved");
    patch = moved.patch;
    const arrived = memberFor(patch, "fish-crow").actor;
    const atPerch = projectCoreEcologyActivity(patch, {
      actorId: arrived.identity.stableId,
      atTick: 722,
    });
    expect(atPerch).toMatchObject({
      state: "perched",
      preferredNeutralIntent: "rest",
      routine: {
        effectivePreference: "rest",
        posture: { state: "resting", enteredAtTick: 722 },
        action: "settle-at-rest-destination",
      },
    });
    const resting = stepCoreWildlifeActor(arrived, {
      tick: 722,
      observations: [],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: atPerch?.preferredNeutralIntent ?? "observe",
    });
    if (resting === null) throw new Error("Arrived rest fixture failed");
    expect(resting.actor.intent).toMatchObject({
      kind: "rest",
      enteredAtTick: 722,
    });
    expect(resting.actor.needs.rest).toBeLessThan(arrived.needs.rest);
    expect(projectCoreEcologyActivity(
      replaceCoreEcologyAggregatePatchActor(patch, resting.actor),
      {
        actorId: resting.actor.identity.stableId,
        atTick: 722,
      },
    )).toMatchObject({
      routine: { posture: { state: "resting", enteredAtTick: 722 } },
    });
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

  it("floats, scans, and dabbles only at live authenticated duck water", () => {
    let patch = waterfowlActivityPatch(360);
    const duck = memberFor(patch, "american-black-duck").actor;
    if (
      patch.derivation.kind !== "habitat-v6"
      && patch.derivation.kind !== "legacy-fixed-v1-with-habitat-v6"
    ) throw new Error("Waterfowl fixture lost habitat-v6 custody");
    const tide = tideAtTick(360);
    const target = patch.derivation.habitat.tidalAnchors.find((anchor) => (
      anchor.species === "american-black-duck"
      && anchor.purpose === "dabbling"
      && tide.level - anchor.elevation
        >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
    ));
    if (target === undefined) throw new Error("Waterfowl fixture lacks live dabbling water");
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(duck, {
      atTick: 360,
      position: target.position,
      heading: duck.address.heading,
    }));
    expect(projectCoreEcologyActivity(patch, {
      actorId: duck.identity.stableId,
      atTick: 360,
    })).toMatchObject({
      state: "floating",
      sourceObservationId: null,
      presentationSignal: "surface-swimming",
      motion: { kind: "hold-position" },
    });
    expect(projectCoreEcologyActivity(patch, {
      actorId: duck.identity.stableId,
      atTick: 364,
    })).toMatchObject({
      state: "water-scan",
      sourceObservationId: null,
      presentationSignal: "surface-swimming",
      motion: { kind: "hold-position" },
    });

    const observation = createActorObservation({
      id: "duck-aquatic:361",
      observerId: duck.identity.stableId,
      observedAtTick: 361,
      channel: "vision",
      perceivedClass: "aquatic-activity",
      subjectId: null,
      area: { center: target.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "classified",
      interrupt: "none",
    });
    if (observation === null) throw new Error("Duck aquatic observation fixture failed");
    const observed = stepCoreWildlifeActor(
      memberFor(patch, "american-black-duck").actor,
      {
        tick: 361,
        observations: [observation],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
        neutralActivityPreference: "observe",
      },
    );
    if (observed === null) throw new Error("Duck cognition rejected lawful aquatic activity");
    const observedPatch = replaceCoreEcologyAggregatePatchActor(patch, observed.actor);
    expect(projectCoreEcologyActivity(observedPatch, {
      actorId: duck.identity.stableId,
      atTick: 361,
    })).toMatchObject({
      state: "dabbling",
      sourceObservationId: observation.id,
      presentationSignal: "dabbling-forage",
      motion: { kind: "hold-position" },
    });
  });

  it("uses bounded surface routing, aerial refuge travel, and intent-owned flushes", () => {
    let patch = waterfowlActivityPatch(360);
    let duck = memberFor(patch, "american-black-duck").actor;
    if (
      patch.derivation.kind !== "habitat-v6"
      && patch.derivation.kind !== "legacy-fixed-v1-with-habitat-v6"
    ) throw new Error("Waterfowl fixture lost habitat-v6 custody");
    const tide = tideAtTick(360);
    const target = patch.derivation.habitat.tidalAnchors.find((anchor) => (
      anchor.species === "american-black-duck"
      && anchor.purpose === "dabbling"
      && tide.level - anchor.elevation
        >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
    ));
    if (target === undefined) throw new Error("Waterfowl fixture lacks live dabbling water");
    const offsetX = target.position.localX < WORLD_WIDTH * WORLD_POSITION_UNITS_PER_TILE / 2
      ? 2 * WORLD_POSITION_UNITS_PER_TILE
      : -2 * WORLD_POSITION_UNITS_PER_TILE;
    duck = repositionCoreWildlifeActor(duck, {
      atTick: 360,
      position: translateWorldPosition(target.position, offsetX, 0),
      heading: duck.address.heading,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, duck);
    const activity = projectCoreEcologyActivity(patch, {
      actorId: duck.identity.stableId,
      atTick: 360,
    });
    expect(activity).toMatchObject({
      state: "seeking-dabbling-water",
      motion: {
        kind: "target-area",
        verb: "seek-dabbling-water",
        travelMedium: "surface-water",
      },
    });
    expect(activity === null ? null : coreEcologyActivityTravelMedium(activity.motion))
      .toBe("surface-water");
    expect(stepCoreEcologyActivityMotion(patch, {
      actorId: duck.identity.stableId,
      atTick: 360,
      maximumStepUnits: 720,
    })).toBeNull();

    const surface = createLivingActorTraversabilitySurface({
      forActorId: duck.identity.stableId,
      sampledAtTick: 360,
      origin: createWorldPosition(ORIGIN, 0, 0),
      widthTiles: WORLD_WIDTH,
      heightTiles: WORLD_HEIGHT,
      cells: Array.from(
        { length: WORLD_WIDTH * WORLD_HEIGHT },
        () => ({ access: "open" as const, travelCost: 300_000 }),
      ),
    });
    const moved = stepCoreEcologyActivityMotion(patch, {
      actorId: duck.identity.stableId,
      atTick: 360,
      maximumStepUnits: 720,
      surface,
    });
    expect(moved?.resolution).toBe("moved");
    if (activity?.motion.kind !== "target-area" || moved === null) {
      throw new Error("Duck surface activity failed to produce a target move");
    }
    const before = worldPositionDelta(
      duck.address.position,
      activity.motion.targetArea.center,
    );
    const afterDuck = memberFor(moved.patch, "american-black-duck").actor;
    const after = worldPositionDelta(
      afterDuck.address.position,
      activity.motion.targetArea.center,
    );
    expect(Math.hypot(after.x, after.y)).toBeLessThan(Math.hypot(before.x, before.y));

    const blockedSurface = createLivingActorTraversabilitySurface({
      forActorId: duck.identity.stableId,
      sampledAtTick: 360,
      origin: createWorldPosition(ORIGIN, 0, 0),
      widthTiles: WORLD_WIDTH,
      heightTiles: WORLD_HEIGHT,
      cells: Array.from(
        { length: WORLD_WIDTH * WORLD_HEIGHT },
        () => ({ access: "blocked" as const, travelCost: 0 }),
      ),
    });
    expect(stepCoreEcologyActivityMotion(patch, {
      actorId: duck.identity.stableId,
      atTick: 360,
      maximumStepUnits: 720,
      surface: blockedSurface,
    })?.resolution).toBe("blocked");

    let restPatch = waterfowlActivityPatch(0);
    const restingDuck = memberFor(restPatch, "american-black-duck").actor;
    expect(projectCoreEcologyActivity(restPatch, {
      actorId: restingDuck.identity.stableId,
      atTick: 0,
    })).toMatchObject({
      state: "seeking-tidal-refuge",
      motion: {
        kind: "target-area",
        verb: "seek-waterfowl-refuge",
        travelMedium: "air",
      },
    });
    const refuge = restPatch.derivation.kind === "habitat-v6"
      || restPatch.derivation.kind === "legacy-fixed-v1-with-habitat-v6"
      ? restPatch.derivation.habitat.tidalAnchors.find((anchor) => (
          anchor.species === "american-black-duck" && anchor.purpose === "refuge"
        ))
      : undefined;
    if (refuge === undefined) throw new Error("Waterfowl fixture lacks dry refuge");
    restPatch = replaceCoreEcologyAggregatePatchActor(
      restPatch,
      repositionCoreWildlifeActor(restingDuck, {
        atTick: 0,
        position: refuge.position,
        heading: restingDuck.address.heading,
      }),
    );
    expect(projectCoreEcologyActivity(restPatch, {
      actorId: restingDuck.identity.stableId,
      atTick: 0,
    })).toMatchObject({
      state: "resting",
      preferredNeutralIntent: "rest",
      motion: { kind: "hold-position" },
    });

    const threat = createActorObservation({
      id: "duck-threat:361",
      observerId: duck.identity.stableId,
      observedAtTick: 361,
      channel: "vision",
      perceivedClass: "predator",
      subjectId: "FOX-duck-threat",
      area: { center: duck.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "identified",
      interrupt: "strong",
    });
    if (threat === null) throw new Error("Duck threat fixture failed");
    const alarmed = stepCoreWildlifeActor(duck, {
      tick: 361,
      observations: [threat],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: "observe",
    });
    if (alarmed === null) throw new Error("Duck threat cognition failed");
    const alarmPatch = replaceCoreEcologyAggregatePatchActor(patch, alarmed.actor);
    const responsive = projectCoreEcologyActivity(alarmPatch, {
      actorId: duck.identity.stableId,
      atTick: 361,
    });
    expect(["alarm", "flee", "retreat"]).toContain(alarmed.actor.intent.kind);
    expect(responsive).toMatchObject({
      state: "responding",
      responsiveToImmediateIntent: true,
      motion: { kind: "defer-to-intent" },
    });
    expect(responsive === null ? null : coreEcologyActivityTravelMedium(responsive.motion))
      .toBeNull();
  });

  it("moves one otter across the shared shore-water seam and forages only from current sight", () => {
    let patch = tidalWebActivityPatch(360);
    const otter = memberFor(patch, "north-american-river-otter").actor;
    if (
      patch.derivation.kind !== "habitat-v7"
      && patch.derivation.kind !== "legacy-fixed-v1-with-habitat-v7"
    ) throw new Error("Otter fixture lost habitat-v7 custody");
    const anchors = patch.derivation.habitat.tidalAnchors.filter(({ species }) => (
      species === "north-american-river-otter"
    ));
    const foraging = anchors.find(({ purpose }) => purpose === "foraging");
    const haulout = anchors.find(({ purpose }) => purpose === "haulout");
    if (foraging === undefined || haulout === undefined) {
      throw new Error("Otter fixture lacks its authenticated shore-water pair");
    }

    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(otter, {
      atTick: 360,
      position: haulout.position,
      heading: otter.address.heading,
    }));
    const outbound = projectCoreEcologyActivity(patch, {
      actorId: otter.identity.stableId,
      atTick: 360,
    });
    expect(outbound).toMatchObject({
      state: "seeking-foraging-water",
      sourceObservationId: null,
      presentationSignal: "shore-water-relocation",
      motion: {
        kind: "target-area",
        verb: "seek-otter-foraging-water",
        travelMedium: "amphibious",
      },
    });
    expect(stepCoreEcologyActivityMotion(patch, {
      actorId: otter.identity.stableId,
      atTick: 360,
      maximumStepUnits: 780,
    })).toBeNull();
    const openSurface = createLivingActorTraversabilitySurface({
      forActorId: otter.identity.stableId,
      sampledAtTick: 360,
      origin: createWorldPosition(ORIGIN, 0, 0),
      widthTiles: WORLD_WIDTH,
      heightTiles: WORLD_HEIGHT,
      cells: Array.from(
        { length: WORLD_WIDTH * WORLD_HEIGHT },
        () => ({ access: "open" as const, travelCost: 300_000 }),
      ),
    });
    expect(stepCoreEcologyActivityMotion(patch, {
      actorId: otter.identity.stableId,
      atTick: 360,
      maximumStepUnits: 780,
      surface: openSurface,
    })?.resolution).toBe("moved");

    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(
      memberFor(patch, "north-american-river-otter").actor,
      {
        atTick: 360,
        position: foraging.position,
        heading: otter.address.heading,
      },
    ));
    expect(projectCoreEcologyActivity(patch, {
      actorId: otter.identity.stableId,
      atTick: 360,
    })).toMatchObject({
      state: "water-scan",
      sourceObservationId: null,
      presentationSignal: "surface-swimming",
    });
    const observation = createActorObservation({
      id: "otter-aquatic:361",
      observerId: otter.identity.stableId,
      observedAtTick: 361,
      channel: "vision",
      perceivedClass: "aquatic-activity",
      subjectId: null,
      area: { center: foraging.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "classified",
      interrupt: "none",
    });
    if (observation === null) throw new Error("Otter aquatic observation fixture failed");
    const observed = stepCoreWildlifeActor(
      memberFor(patch, "north-american-river-otter").actor,
      {
        tick: 361,
        observations: [observation],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
        neutralActivityPreference: "observe",
      },
    );
    if (observed === null) throw new Error("Otter cognition rejected lawful aquatic activity");
    patch = replaceCoreEcologyAggregatePatchActor(patch, observed.actor);
    expect(projectCoreEcologyActivity(patch, {
      actorId: otter.identity.stableId,
      atTick: 361,
    })).toMatchObject({
      state: "aquatic-foraging",
      sourceObservationId: observation.id,
      presentationSignal: "aquatic-foraging",
    });

    let restPatch = tidalWebActivityPatch(0);
    const restingOtter = memberFor(restPatch, "north-american-river-otter").actor;
    restPatch = replaceCoreEcologyAggregatePatchActor(restPatch, repositionCoreWildlifeActor(
      restingOtter,
      { atTick: 0, position: foraging.position, heading: restingOtter.address.heading },
    ));
    expect(projectCoreEcologyActivity(restPatch, {
      actorId: restingOtter.identity.stableId,
      atTick: 0,
    })).toMatchObject({
      state: "hauling-out",
      presentationSignal: "shore-water-relocation",
      motion: { verb: "seek-otter-haulout", travelMedium: "amphibious" },
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

function waterfowlActivityPatch(tick: number): CoreEcologyAggregatePatchState {
  const seed = seedFromText("waterfowl habitat 1");
  const habitat = deriveCoreEcologyWaterfowlHabitatAssemblage({
    rootSeed: seed,
    originRegion: ORIGIN,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: `waterfowl-activity:${tick}`,
    originRegion: ORIGIN,
    tick,
    populations: waterfowlIndividualInputs(habitat),
    derivation: { kind: "habitat-v6", habitat },
  });
  memberFor(patch, "american-black-duck");
  return patch;
}

function tidalWebActivityPatch(tick: number): CoreEcologyAggregatePatchState {
  const seed = seedFromText("otter habitat 0");
  const habitat = deriveCoreEcologyTidalWebHabitatAssemblage({
    rootSeed: seed,
    originRegion: ORIGIN,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: `tidal-web-activity:${tick}`,
    originRegion: ORIGIN,
    tick,
    populations: tidalWebIndividualInputs(habitat),
    derivation: { kind: "habitat-v7", habitat },
  });
  memberFor(patch, "north-american-river-otter");
  return patch;
}

function divingWaterbirdActivityFixture(tick: number) {
  const habitat = deriveCoreEcologyBreadthHabitat({
    seed: BREADTH_ACTIVITY_SEED,
    region: DIVING_WATERBIRD_REGION,
    cohortId: CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
  });
  const coarse = createCoreEcologyBreadthResidentPatch({
    seed: BREADTH_ACTIVITY_SEED,
    habitat,
    tick,
  });
  const actorId = coarse.populations.find(
    ({ species }) => species === "double-crested-cormorant",
  )?.members[0]?.actor.identity.stableId;
  if (actorId === undefined) {
    throw new Error("Diving-waterbird activity fixture is absent");
  }
  const patch = setCoreEcologyAggregatePatchMaterializedActors(coarse, {
    atTick: tick,
    actorIds: [actorId],
  });
  const authority = projectCoreEcologyBreadthActivityAuthority({
    rootSeed: BREADTH_ACTIVITY_SEED,
    patch,
    actorId,
  });
  if (authority === null) {
    throw new Error("Diving-waterbird activity authority is absent");
  }
  const generatedActor = memberFor(patch, "double-crested-cormorant").actor;
  const restedActor = replaceCoreWildlifeActorPhysiology(generatedActor, {
    atTick: tick,
    needs: { ...generatedActor.needs, rest: 0 },
    condition: generatedActor.condition,
  });
  const actor = repositionCoreWildlifeActor(restedActor, {
    atTick: tick,
    position: authority.homeAnchor,
    heading: restedActor.address.heading,
  });
  return Object.freeze({
    patch: replaceCoreEcologyAggregatePatchActor(patch, actor),
    actor,
    authority,
  });
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

function commitFishCrowActivity(
  patch: CoreEcologyAggregatePatchState,
  atTick: number,
): CoreEcologyAggregatePatchState {
  const actor = memberFor(patch, "fish-crow").actor;
  const motion = stepCoreEcologyActivityMotion(patch, {
    actorId: actor.identity.stableId,
    atTick,
    maximumStepUnits: 1,
  });
  if (motion === null) throw new Error(`Fish-crow routine commit failed at ${atTick}`);
  return motion.patch;
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

function waterfowlIndividualInputs(
  habitat: CoreEcologyWaterfowlHabitatAssemblage,
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
            materialization: population.species === "american-black-duck"
              ? "materialized" as const
              : "coarse" as const,
          })),
        }]
  ));
}

function tidalWebIndividualInputs(
  habitat: CoreEcologyTidalWebHabitatAssemblage,
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
            materialization: population.species === "north-american-river-otter"
              ? "materialized" as const
              : "coarse" as const,
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
