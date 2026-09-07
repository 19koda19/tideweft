import { describe, expect, it } from "vitest";

import {
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID,
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES,
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES,
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION,
  CORE_ECOLOGY_ACTIVITY_ARCHETYPES,
  CORE_ECOLOGY_ACTIVITY_ARCHETYPE_IDS,
  coreEcologyActivityAffordanceProfile,
  coreEcologyActivityArchetype,
  isCoreEcologyActivityAffordanceProfile,
  validateCoreEcologyActivityAffordances,
} from "./coreEcologyActivityAffordance";
import { CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES } from "./coreEcologySpeciesRuntimePolicy";

describe("core ecology activity affordance registry", () => {
  it("composes a stable ordered profile registry from reusable archetypes", () => {
    expect(CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION).toBe(1);
    expect(CORE_ECOLOGY_ACTIVITY_ARCHETYPE_IDS).toEqual([
      "perch-watch",
      "low-quartering",
      "tidal-wader",
      "dabbling-waterfowl",
      "shore-water-forager",
      "aerial-surface-opportunist",
    ]);
    expect(CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES).toEqual([
      "fish-crow",
      "northern-harrier",
      "snowy-egret",
      "american-black-duck",
      "north-american-river-otter",
      "gull",
    ]);
    expect(new Set(
      CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.map(({ archetypeId }) => archetypeId),
    )).toEqual(new Set(CORE_ECOLOGY_ACTIVITY_ARCHETYPE_IDS));

    for (const profile of CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES) {
      const activityArchetype = coreEcologyActivityArchetype(profile.archetypeId);
      expect(activityArchetype).not.toBeNull();
      expect(coreEcologyActivityAffordanceProfile(profile.speciesId)).toBe(profile);
      expect(profile).toMatchObject({
        version: CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION,
        ownerId: CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID,
        scheduleScope: "bounded-diurnal-window",
      });
      expect(profile.requiredCapabilities).toBe(activityArchetype?.requiredCapabilities);
      expect(profile.allowedTravelMedia).toBe(activityArchetype?.allowedTravelMedia);
      expect(profile.destinations).toBe(activityArchetype?.destinations);
      expect(profile.observationAffordance).toBe(activityArchetype?.observationAffordance);
      expect(profile.presentationSignals).toBe(activityArchetype?.presentationSignals);
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.destinations)).toBe(true);
    }
  });

  it("proves capability, movement, destination, and knowledge honesty as registry properties", () => {
    expect(validateCoreEcologyActivityAffordances()).toEqual([]);

    for (const activityArchetype of CORE_ECOLOGY_ACTIVITY_ARCHETYPES) {
      expect(new Set(activityArchetype.requiredCapabilities).size)
        .toBe(activityArchetype.requiredCapabilities.length);
      expect(new Set(activityArchetype.allowedTravelMedia).size)
        .toBe(activityArchetype.allowedTravelMedia.length);
      expect(new Set(activityArchetype.destinations.map(({ semantic }) => semantic)).size)
        .toBe(activityArchetype.destinations.length);
      expect(activityArchetype.requiredCapabilities).toContain("actor-address");
      expect(activityArchetype.requiredCapabilities).toContain("diurnal-activity");
      for (const destination of activityArchetype.destinations) {
        expect(destination.allowedTravelMedia.length).toBeGreaterThan(0);
        expect(destination.allowedTravelMedia.every((medium) => (
          activityArchetype.allowedTravelMedia.includes(medium)
        ))).toBe(true);
      }
      if (activityArchetype.observationAffordance.kind === "current-anonymous-area") {
        expect(activityArchetype.observationAffordance).toEqual({
          kind: "current-anonymous-area",
          channel: "vision",
          perceivedClass: "aquatic-activity",
          subjectIdentity: "anonymous",
          freshness: "same-tick",
          requiresLineOfSight: true,
        });
        expect(activityArchetype.requiredCapabilities).toContain("surface-opportunity");
      }
    }

    for (const profile of CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES) {
      const policy = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.find(
        ({ speciesId }) => speciesId === profile.speciesId,
      );
      expect(policy).toBeDefined();
      expect(policy?.actorAddressable).toBe(true);
      expect(policy?.locomotionClass).toBe(profile.locomotionClass);
      expect(profile.requiredCapabilities.every((capability) => (
        policy?.capabilities.includes(capability) === true
      ))).toBe(true);
    }
  });

  it("fails unknown lookup and altered profile data closed", () => {
    expect(coreEcologyActivityAffordanceProfile("owl")).toBeNull();
    expect(coreEcologyActivityAffordanceProfile(null)).toBeNull();
    expect(coreEcologyActivityArchetype("generic-animal-ai")).toBeNull();
    const gull = coreEcologyActivityAffordanceProfile("gull");
    if (gull === null) throw new Error("gull affordance fixture missing");
    expect(isCoreEcologyActivityAffordanceProfile(structuredClone(gull))).toBe(true);
    expect(isCoreEcologyActivityAffordanceProfile({
      ...gull,
      allowedTravelMedia: ["amphibious"],
    })).toBe(false);
    expect(isCoreEcologyActivityAffordanceProfile({ ...gull, hiddenTarget: "fish" }))
      .toBe(false);

    const inherited = Object.assign(
      Object.create({ hiddenTarget: "fish" }) as Record<string, unknown>,
      structuredClone(gull),
    );
    expect(isCoreEcologyActivityAffordanceProfile(inherited)).toBe(false);

    const nonEnumerable = structuredClone(gull);
    Object.defineProperty(nonEnumerable, "hiddenTarget", {
      value: "fish",
      enumerable: false,
    });
    expect(isCoreEcologyActivityAffordanceProfile(nonEnumerable)).toBe(false);
    expect(validateCoreEcologyActivityAffordances(
      CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.map((profile) => (
        profile.speciesId === "gull" ? nonEnumerable : profile
      )),
    )).toContain("activity-profile[5]:invalid-profile");

    const augmentedArray = structuredClone(gull);
    Object.defineProperty(augmentedArray.presentationSignals, "hiddenTarget", {
      value: "fish",
      enumerable: false,
    });
    expect(isCoreEcologyActivityAffordanceProfile(augmentedArray)).toBe(false);
  });

  it("reports stable duplicate, missing, and incompatible profile diagnostics", () => {
    const profiles = CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES;
    const missing = profiles.filter(({ speciesId }) => speciesId !== "snowy-egret");
    expect(validateCoreEcologyActivityAffordances(missing))
      .toContain("snowy-egret:missing-activity-profile");

    expect(validateCoreEcologyActivityAffordances([...profiles, profiles[0]]))
      .toContain("fish-crow:duplicate-activity-profile");

    const incompatible = profiles.map((profile) => (
      profile.speciesId === "gull"
        ? { ...profile, locomotionClass: "terrestrial" as const }
        : profile
    ));
    expect(validateCoreEcologyActivityAffordances(incompatible)).toEqual(expect.arrayContaining([
      "gull:archetype-data-mismatch",
      "gull:locomotion-class-policy-mismatch",
    ]));

    const withoutGullPolicy = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.filter(
      ({ speciesId }) => speciesId !== "gull",
    );
    expect(validateCoreEcologyActivityAffordances(profiles, withoutGullPolicy))
      .toContain("gull:missing-runtime-policy");

    const first = validateCoreEcologyActivityAffordances(incompatible);
    const repeated = validateCoreEcologyActivityAffordances(incompatible);
    expect(repeated).toEqual(first);
    expect([...first]).toEqual([...first].sort());
  });
});
