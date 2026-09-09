import { describe, expect, it } from "vitest";

import { ACTOR_PERCEPTION_SCALE, createActorObservation } from "../sim/actorPerception";
import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS,
  coreEcologyActivityDestinationSemantic,
  coreEcologyActivityTravelMedium,
  projectCoreEcologyActivity,
  stepCoreEcologyActivityMotion,
  validateCoreEcologyActivityProjectionAffordance,
  type CoreEcologyActivityProjection,
} from "./coreEcologyActivity";
import { coreEcologyActivityAffordanceProfile } from "./coreEcologyActivityAffordance";
import {
  isTrustedCoreEcologyAlpineRidgeActivityAuthority,
  projectCoreEcologyAlpineRidgeActivityAuthority,
} from "./coreEcologyAlpineRidgeActivity";
import { deriveCoreEcologyAlpineHabitat } from "./coreEcologyAlpineHabitat";
import {
  deriveCoreEcologyRidgeActivityAuthority,
  isTrustedCoreEcologyRidgeActivityAuthority,
  type CoreEcologyRidgeActivityAuthorityV1,
} from "./coreEcologyRidgeActivityAuthority";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
} from "./coreWildlifeActor";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";
import { createCoreEcologyAlpineResidentPatch } from "./regionalAlpineResidents";

export const ALPHA33_ALPINE_SHARED_ACTIVITY_OWNER_INTENT =
  "test:alpha33-alpine-shared-activity:v1" as const;

const SEED = seedFromText("alpine resident property");
const REGION = createRegionCoord(-1, 0);
const HOME = createWorldPosition(REGION, 10_500, 10_500);

describe(`${ALPHA33_ALPINE_SHARED_ACTIVITY_OWNER_INTENT} shared authenticated eagle ridge-soar activity`, () => {
  it("projects and executes one deterministic daylight soar loop using air only", () => {
    const patch = eaglePatch(360);
    const eagle = patch.populations[0]?.members[0]?.actor;
    if (eagle === undefined) throw new Error("Golden-eagle fixture is empty");
    const authority = ridgeAuthority(patch, eagle.identity.stableId);
    const beforePatch = serializeCoreEcologyAggregatePatch(patch);
    const beforeAuthority = stableStringify(authority);

    const first = projectCoreEcologyActivity(patch, {
      actorId: eagle.identity.stableId,
      atTick: 360,
    }, authority);
    const repeated = projectCoreEcologyActivity(patch, {
      actorId: eagle.identity.stableId,
      atTick: 360 + CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS - 1,
    }, authority);
    expect(first).toMatchObject({
      species: "golden-eagle",
      state: "ridge-soaring",
      responsiveToImmediateIntent: false,
      sourceObservationId: null,
      preferredNeutralIntent: "observe",
      presentationSignal: "ridge-soaring-flight",
      motion: {
        kind: "target-area",
        verb: "soar-ridge-loop",
        travelMedium: "air",
      },
    });
    expect(repeated?.motion).toEqual(first?.motion);
    if (first === null) throw new Error("Golden eagle omitted ridge activity");
    expect(coreEcologyActivityDestinationSemantic(first.motion))
      .toBe("authenticated-ridge-soar-loop");
    expect(coreEcologyActivityTravelMedium(first.motion)).toBe("air");

    const profile = coreEcologyActivityAffordanceProfile("golden-eagle");
    if (profile === null) throw new Error("Golden eagle lacks activity affordance");
    expect(validateCoreEcologyActivityProjectionAffordance(profile, eagle, first)).toEqual([]);
    expect(validateCoreEcologyActivityProjectionAffordance(profile, eagle, {
      ...first,
      motion: first.motion.kind === "target-area"
        ? { ...first.motion, travelMedium: "surface-water" }
        : first.motion,
    } as CoreEcologyActivityProjection)).toEqual(expect.arrayContaining([
      "destination-rejects-travel-medium",
      "undeclared-travel-medium",
    ]));

    if (first.motion.kind !== "target-area") {
      throw new Error("Ridge soar fixture omitted target");
    }
    const beforeDistance = worldPositionDelta(
      eagle.address.position,
      first.motion.targetArea.center,
    );
    const stepped = stepCoreEcologyActivityMotion(patch, {
      actorId: eagle.identity.stableId,
      atTick: 360,
      maximumStepUnits: 700,
    }, authority);
    if (stepped === null) throw new Error("Authenticated ridge activity failed to step");
    const moved = stepped.patch.populations[0]?.members[0]?.actor;
    if (moved === undefined) throw new Error("Ridge activity lost its actor");
    const afterDistance = worldPositionDelta(
      moved.address.position,
      first.motion.targetArea.center,
    );
    expect(stepped.resolution).toBe("moved");
    expect(Math.hypot(afterDistance.x, afterDistance.y))
      .toBeLessThan(Math.hypot(beforeDistance.x, beforeDistance.y));
    expect(serializeCoreEcologyAggregatePatch(patch)).toBe(beforePatch);
    expect(stableStringify(authority)).toBe(beforeAuthority);
  });

  it("rests at its authenticated ridge perch and lets immediate intent outrank soaring", () => {
    let patch = eaglePatch(1_200);
    const eagle = patch.populations[0]?.members[0]?.actor;
    if (eagle === undefined) throw new Error("Golden-eagle fixture is empty");
    const authority = ridgeAuthority(patch, eagle.identity.stableId);
    const seeking = projectCoreEcologyActivity(patch, {
      actorId: eagle.identity.stableId,
      atTick: 1_200,
    }, authority);
    expect(seeking).toMatchObject({
      state: "seeking-ridge-perch",
      presentationSignal: "ridge-soaring-flight",
      motion: {
        kind: "target-area",
        verb: "seek-ridge-perch",
        travelMedium: "air",
      },
    });
    expect(seeking === null ? null : coreEcologyActivityDestinationSemantic(seeking.motion))
      .toBe("authenticated-ridge-perch");

    const perchedActor = repositionCoreWildlifeActor(eagle, {
      atTick: 1_200,
      position: authority.perchAnchor.position,
      heading: eagle.address.heading,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, perchedActor);
    expect(projectCoreEcologyActivity(patch, {
      actorId: eagle.identity.stableId,
      atTick: 1_200,
    }, authority)).toMatchObject({
      state: "perched",
      preferredNeutralIntent: "rest",
      presentationSignal: "perched",
      perch: { availability: "available-here" },
      motion: { kind: "hold-position" },
    });

    const daylightPatch = eaglePatch(360);
    const daylightEagle = daylightPatch.populations[0]?.members[0]?.actor;
    if (daylightEagle === undefined) throw new Error("Daylight eagle fixture is empty");
    const daylightAuthority = ridgeAuthority(daylightPatch, daylightEagle.identity.stableId);
    const threat = createActorObservation({
      id: "ridge-threat:361",
      observerId: daylightEagle.identity.stableId,
      observedAtTick: 361,
      channel: "vision",
      perceivedClass: "predator",
      subjectId: "THREAT-ridge-activity",
      area: { center: daylightEagle.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "identified",
      interrupt: "strong",
    });
    if (threat === null) throw new Error("Ridge threat fixture failed");
    const alarmed = stepCoreWildlifeActor(daylightEagle, {
      tick: 361,
      observations: [threat],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: "observe",
    });
    if (alarmed === null) throw new Error("Ridge threat cognition failed");
    const alarmPatch = replaceCoreEcologyAggregatePatchActor(daylightPatch, alarmed.actor);
    expect(["alarm", "flee", "retreat"]).toContain(alarmed.actor.intent.kind);
    expect(projectCoreEcologyActivity(alarmPatch, {
      actorId: daylightEagle.identity.stableId,
      atTick: 361,
    }, daylightAuthority)).toMatchObject({
      state: "responding",
      responsiveToImmediateIntent: true,
      sourceObservationId: null,
      presentationSignal: null,
      motion: { kind: "defer-to-intent" },
    });
  });

  it("rejects copied, cross-source, and cross-actor ridge authority receipts", () => {
    const patch = eaglePatch(360);
    const eagle = patch.populations[0]?.members[0]?.actor;
    if (eagle === undefined) throw new Error("Golden-eagle fixture is empty");
    const authority = ridgeAuthority(patch, eagle.identity.stableId);
    const copied = JSON.parse(
      stableStringify(authority),
    ) as CoreEcologyRidgeActivityAuthorityV1;
    expect(projectCoreEcologyActivity(patch, {
      actorId: eagle.identity.stableId,
      atTick: 360,
    }, copied)).toBeNull();

    const wrongSource = deriveAuthority("ridge-activity:other-source", eagle.identity.stableId);
    expect(isTrustedCoreEcologyRidgeActivityAuthority(wrongSource)).toBe(true);
    expect(isTrustedCoreEcologyAlpineRidgeActivityAuthority(wrongSource)).toBe(false);
    const wrongActor = deriveAuthority(patch.patchKey, `${eagle.identity.stableId}-other`);
    const foreignHome = createWorldPosition(createRegionCoord(-18, 42), 10_500, 10_500);
    const wrongRegion = deriveCoreEcologyRidgeActivityAuthority({
      sourceKey: patch.patchKey,
      actorId: eagle.identity.stableId,
      homeAnchor: foreignHome,
      candidates: [{
        sourceTileKey: "ridge-tile:foreign",
        position: foreignHome,
        terrain: "ridge",
        elevation: 900_000,
        roughness: 800_000,
      }],
    });
    if (wrongRegion === null) throw new Error("Foreign ridge authority fixture failed");
    expect(projectCoreEcologyActivity(patch, {
      actorId: eagle.identity.stableId,
      atTick: 360,
    }, wrongSource)).toBeNull();
    expect(projectCoreEcologyActivity(patch, {
      actorId: eagle.identity.stableId,
      atTick: 360,
    }, wrongActor)).toBeNull();
    expect(projectCoreEcologyActivity(patch, {
      actorId: eagle.identity.stableId,
      atTick: 360,
    }, wrongRegion)).toBeNull();
  });
});

function eaglePatch(tick: number): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region: REGION });
  const patch = createCoreEcologyAlpineResidentPatch({ seed: SEED, habitat, tick });
  const actorId = patch.populations.find(({ species }) => species === "golden-eagle")
    ?.members[0]?.actor.identity.stableId;
  if (actorId === undefined) throw new Error("Golden-eagle fixture is absent");
  return setCoreEcologyAggregatePatchMaterializedActors(patch, {
    atTick: tick,
    actorIds: [actorId],
  });
}

function ridgeAuthority(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): CoreEcologyRidgeActivityAuthorityV1 {
  const authority = projectCoreEcologyAlpineRidgeActivityAuthority({
    rootSeed: SEED,
    patch,
    actorId,
  });
  if (authority === null) throw new Error("Canonical ridge authority fixture failed");
  return authority;
}

function deriveAuthority(
  sourceKey: string,
  actorId: string,
): CoreEcologyRidgeActivityAuthorityV1 {
  const authority = deriveCoreEcologyRidgeActivityAuthority({
    sourceKey,
    actorId,
    homeAnchor: HOME,
    candidates: [
      ridgeCandidate("ridge-tile:a", 3, 1, 800_000, 700_000),
      ridgeCandidate("ridge-tile:b", 5, 2, 900_000, 300_000),
      ridgeCandidate("ridge-tile:c", 7, 3, 900_000, 800_000),
      ridgeCandidate("ridge-tile:d", 9, 4, 700_000, 950_000),
    ],
  });
  if (authority === null) throw new Error("Ridge authority fixture failed");
  return authority;
}

function ridgeCandidate(
  sourceTileKey: string,
  deltaTilesX: number,
  deltaTilesY: number,
  elevation: number,
  roughness: number,
) {
  return {
    sourceTileKey,
    position: translateWorldPosition(
      HOME,
      deltaTilesX * WORLD_POSITION_UNITS_PER_TILE,
      deltaTilesY * WORLD_POSITION_UNITS_PER_TILE,
    ),
    terrain: "ridge" as const,
    elevation,
    roughness,
  };
}
