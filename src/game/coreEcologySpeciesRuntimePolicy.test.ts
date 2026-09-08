import { describe, expect, it } from "vitest";

import { getCoreWildlifeProfile } from "../sim/coreWildlifeIdentity";
import { LIVING_SPECIES_CATALOG } from "./livingSpeciesCatalog";
import {
  CORE_ECOLOGY_SPECIES_RUNTIME_CAPABILITIES,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
  CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_OWNER_ID,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_VERSION,
  assertCoreEcologySpeciesRuntimePolicies,
  coreEcologySpeciesCanFeedFromCarcass,
  coreEcologySpeciesCanGuardCarcass,
  coreEcologySpeciesCanOwnActorAddress,
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesPhysicalBodyResourceUnits,
  coreEcologySpeciesPhysicalBodySizeUnits,
  coreEcologySpeciesPredatorContact,
  coreEcologySpeciesRuntimePolicy,
  isCoreEcologySpeciesRuntimeCapability,
  isCoreEcologySpeciesRuntimePolicy,
  validateCoreEcologySpeciesRuntimePolicies,
} from "./coreEcologySpeciesRuntimePolicy";

describe("core ecology species runtime policy", () => {
  it("is a complete immutable registry cross-validated against the catalog", () => {
    expect(CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_VERSION).toBe(1);
    expect(CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_OWNER_ID)
      .toBe("game:core-ecology-species-runtime-policy:v1");
    expect(CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION).toBe(1);
    expect(CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.map(({ speciesId }) => speciesId)).toEqual([
      "deer",
      "gull",
      "black-bear",
      "brown-rat",
      "domestic-cat",
      "marsh-rabbit",
      "marsh-fox",
      "fish-crow",
      "northern-harrier",
      "southern-leopard-frog",
      "atlantic-silverside",
      "atlantic-marsh-fiddler-crab",
      "snowy-egret",
      "american-black-duck",
      "north-american-river-otter",
      "domestic-chicken",
      "domestic-goat",
    ]);
    expect(validateCoreEcologySpeciesRuntimePolicies(LIVING_SPECIES_CATALOG)).toEqual([]);
    expect(() => assertCoreEcologySpeciesRuntimePolicies(LIVING_SPECIES_CATALOG)).not.toThrow();
    expect(Object.isFrozen(CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES)).toBe(true);
    for (const policy of CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES) {
      expect(Object.isFrozen(policy)).toBe(true);
      expect(Object.isFrozen(policy.capabilities)).toBe(true);
      expect(Object.isFrozen(policy.mortality)).toBe(true);
      if (policy.mortality.predatorContact !== null) {
        expect(Object.isFrozen(policy.mortality.predatorContact)).toBe(true);
      }
      expect(Object.isFrozen(policy.activitySignals)).toBe(true);
      expect(Object.isFrozen(policy.evidenceKinds)).toBe(true);
      expect(isCoreEcologySpeciesRuntimePolicy(policy)).toBe(true);
    }
  });

  it("declares one shared fox/rabbit mortality slice and one orthogonal scavenger", () => {
    expect(coreEcologySpeciesRuntimePolicy("marsh-fox")).toMatchObject({
      mortality: {
        version: 1,
        predatorContact: {
          cause: "predator-contact",
          reachUnits: 500,
          damageUnits: 550_000,
        },
        physicalBodySizeUnits: 0,
        physicalBodyResourceUnits: 0,
        carcassFeeding: true,
        carcassGuarding: true,
      },
      capabilities: expect.arrayContaining([
        "carcass-feeding",
        "carcass-guarding",
        "predator-contact-damage",
      ]),
    });
    expect(coreEcologySpeciesPredatorContact("marsh-fox")).toEqual({
      cause: "predator-contact",
      reachUnits: 500,
      damageUnits: 550_000,
    });
    expect(coreEcologySpeciesCanFeedFromCarcass("marsh-fox")).toBe(true);
    expect(coreEcologySpeciesCanGuardCarcass("marsh-fox")).toBe(true);

    expect(coreEcologySpeciesRuntimePolicy("marsh-rabbit")).toMatchObject({
      mortality: {
        version: 1,
        predatorContact: null,
        physicalBodySizeUnits: 3,
        physicalBodyResourceUnits: 4,
        carcassFeeding: false,
        carcassGuarding: false,
      },
      capabilities: expect.arrayContaining(["physical-body-resource"]),
    });
    expect(coreEcologySpeciesPhysicalBodySizeUnits("marsh-rabbit")).toBe(3);
    expect(coreEcologySpeciesPhysicalBodyResourceUnits("marsh-rabbit")).toBe(4);
    expect(coreEcologySpeciesPredatorContact("marsh-rabbit")).toBeNull();

    expect(coreEcologySpeciesRuntimePolicy("fish-crow")).toMatchObject({
      mortality: {
        predatorContact: null,
        physicalBodySizeUnits: 0,
        physicalBodyResourceUnits: 0,
        carcassFeeding: true,
        carcassGuarding: false,
      },
      capabilities: expect.arrayContaining(["carcass-feeding"]),
    });
    expect(coreEcologySpeciesCanFeedFromCarcass("fish-crow")).toBe(true);
    expect(coreEcologySpeciesCanGuardCarcass("fish-crow")).toBe(false);

    const inactive = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.filter(({ speciesId }) => (
      speciesId !== "marsh-fox"
      && speciesId !== "marsh-rabbit"
      && speciesId !== "fish-crow"
    ));
    for (const policy of inactive) {
      expect(policy.mortality).toEqual({
        version: 1,
        predatorContact: null,
        physicalBodySizeUnits: 0,
        physicalBodyResourceUnits: 0,
        carcassFeeding: false,
        carcassGuarding: false,
      });
      expect(policy.capabilities).not.toContain("predator-contact-damage");
      expect(policy.capabilities).not.toContain("physical-body-resource");
      expect(policy.capabilities).not.toContain("carcass-feeding");
      expect(policy.capabilities).not.toContain("carcass-guarding");
    }
    expect(coreEcologySpeciesPredatorContact("unknown-animal")).toBeNull();
    expect(coreEcologySpeciesPhysicalBodySizeUnits("unknown-animal")).toBe(0);
    expect(coreEcologySpeciesPhysicalBodyResourceUnits("unknown-animal")).toBe(0);
    expect(coreEcologySpeciesCanFeedFromCarcass("unknown-animal")).toBe(false);
    expect(coreEcologySpeciesCanGuardCarcass("unknown-animal")).toBe(false);
  });

  it("separates addressable representatives from population-only aggregates", () => {
    expect(coreEcologySpeciesCanOwnActorAddress("fish-crow")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("northern-harrier")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("southern-leopard-frog")).toBe(false);
    expect(coreEcologySpeciesCanOwnActorAddress("atlantic-silverside")).toBe(false);
    expect(coreEcologySpeciesCanOwnActorAddress("atlantic-marsh-fiddler-crab")).toBe(false);
    expect(coreEcologySpeciesCanOwnActorAddress("snowy-egret")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("american-black-duck")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("domestic-chicken")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("invented-frog")).toBe(false);
    expect(coreEcologySpeciesRuntimePolicy("southern-leopard-frog")).toMatchObject({
      actorAddressable: false,
      identityForm: "aggregate",
      representation: "aggregate",
      maximumMaterializedActors: 0,
      aggregate: {
        maximumAnchors: 3,
        responseCadenceTicks: 8,
        responseVerbs: ["chorus", "quiet", "redistribute"],
      },
      presentationModel: "aggregate-activity",
    });
  });

  it("plugs the domestic flock into shared actor, food, alarm, and group capabilities", () => {
    expect(coreEcologySpeciesRuntimePolicy("domestic-chicken")).toMatchObject({
      actorAddressable: true,
      identityForm: "individual",
      representation: "individual",
      locomotionClass: "terrestrial",
      groupOrganization: "flock",
      groupStableIdNamespace: "CHICKEN-FLOCK",
      maximumMaterializedActors: 3,
      aggregate: null,
      capabilities: [
        "actor-address",
        "food-investigation",
        "group-coordination",
        "shared-alarm",
      ],
      activitySignals: ["shared-alarm"],
      evidenceKinds: [],
      presentationModel: "visible-flock",
    });
    expect(coreEcologySpeciesHasRuntimeCapability("domestic-chicken", "diurnal-activity"))
      .toBe(false);
    expect(coreEcologySpeciesHasRuntimeCapability("domestic-chicken", "small-prey-pursuit"))
      .toBe(false);
  });

  it("expresses livestock through shared actor and herd capabilities", () => {
    expect(coreEcologySpeciesRuntimePolicy("domestic-goat")).toMatchObject({
      actorAddressable: true,
      identityForm: "individual",
      representation: "individual",
      locomotionClass: "terrestrial",
      groupOrganization: "herd",
      groupStableIdNamespace: "HERD",
      maximumMaterializedActors: 2,
      aggregate: null,
      capabilities: ["actor-address", "group-coordination", "shared-alarm"],
      activitySignals: ["shared-alarm"],
      evidenceKinds: [],
      presentationModel: "individual",
    });
    expect(coreEcologySpeciesHasRuntimeCapability("domestic-goat", "food-investigation"))
      .toBe(false);
    expect(coreEcologySpeciesHasRuntimeCapability("domestic-goat", "small-prey-pursuit"))
      .toBe(false);
  });

  it("admits a diurnal aerial gull to tidal surface opportunities without aquatic powers", () => {
    expect(coreEcologySpeciesRuntimePolicy("gull")).toMatchObject({
      locomotionClass: "aerial",
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "diurnal-activity",
        "food-investigation",
        "group-coordination",
        "perch",
        "shared-alarm",
        "surface-opportunity",
        "tidal-activity",
      ],
      activitySignals: ["surface-opportunity-flight", "tidal-relocation-flight"],
    });
    for (const capability of [
      "amphibious-locomotion",
      "aquatic-foraging",
      "aquatic-locomotion",
      "small-prey-pursuit",
      "wading",
    ] as const) {
      expect(coreEcologySpeciesHasRuntimeCapability("gull", capability)).toBe(false);
    }
  });

  it("declares the bounded Wave-C aquatic capability seams", () => {
    expect(coreEcologySpeciesRuntimePolicy("atlantic-silverside")).toMatchObject({
      actorAddressable: false,
      identityForm: "aggregate",
      representation: "aggregate",
      locomotionClass: "aquatic",
      groupOrganization: "school",
      groupStableIdNamespace: "SILVERSIDE-SCHOOL",
      maximumMaterializedActors: 0,
      aggregate: {
        maximumAnchors: 3,
        responseCadenceTicks: 4,
        responseVerbs: ["redistribute", "school", "tighten"],
      },
      capabilities: expect.arrayContaining([
        "aggregate-response",
        "aquatic-locomotion",
        "school-coordination",
        "tidal-activity",
        "water-depth-response",
      ]),
      presentationModel: "aggregate-school",
    });
    expect(coreEcologySpeciesRuntimePolicy("atlantic-marsh-fiddler-crab")).toMatchObject({
      actorAddressable: false,
      identityForm: "aggregate",
      representation: "aggregate",
      locomotionClass: "amphibious",
      groupOrganization: null,
      maximumMaterializedActors: 0,
      aggregate: {
        maximumAnchors: 4,
        responseCadenceTicks: 8,
        responseVerbs: ["emerge", "quiet", "retreat-to-burrow"],
      },
      capabilities: expect.arrayContaining([
        "aggregate-response",
        "amphibious-locomotion",
        "tidal-activity",
        "water-depth-response",
      ]),
      presentationModel: "aggregate-activity",
    });
    expect(coreEcologySpeciesRuntimePolicy("snowy-egret")).toMatchObject({
      actorAddressable: true,
      identityForm: "individual",
      representation: "individual",
      locomotionClass: "amphibious",
      groupOrganization: null,
      maximumMaterializedActors: 1,
      aggregate: null,
      capabilities: expect.arrayContaining([
        "actor-address",
        "aerial-locomotion",
        "amphibious-locomotion",
        "aquatic-foraging",
        "surface-opportunity",
        "tidal-activity",
        "wading",
        "water-depth-response",
      ]),
      presentationModel: "individual",
    });
    expect(coreEcologySpeciesHasRuntimeCapability("snowy-egret", "small-prey-pursuit"))
      .toBe(false);
    expect(coreEcologySpeciesRuntimePolicy("american-black-duck")).toMatchObject({
      actorAddressable: true,
      identityForm: "individual",
      representation: "individual",
      locomotionClass: "amphibious",
      groupOrganization: null,
      groupStableIdNamespace: null,
      maximumMaterializedActors: 1,
      aggregate: null,
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "amphibious-locomotion",
        "aquatic-foraging",
        "aquatic-locomotion",
        "diurnal-activity",
        "food-investigation",
        "movement-memory",
        "shared-alarm",
        "surface-opportunity",
        "tidal-activity",
        "water-depth-response",
      ],
      activitySignals: ["dabbling-forage", "surface-swimming", "tidal-relocation-flight"],
      evidenceKinds: [],
      presentationModel: "individual",
    });
    expect(coreEcologySpeciesHasRuntimeCapability("american-black-duck", "group-coordination"))
      .toBe(false);
    expect(coreEcologySpeciesHasRuntimeCapability("american-black-duck", "wading"))
      .toBe(false);
    expect(coreEcologySpeciesRuntimePolicy("north-american-river-otter")).toMatchObject({
      actorAddressable: true,
      identityForm: "individual",
      representation: "individual",
      locomotionClass: "amphibious",
      groupOrganization: null,
      groupStableIdNamespace: null,
      maximumMaterializedActors: 1,
      aggregate: null,
      capabilities: [
        "actor-address",
        "amphibious-locomotion",
        "aquatic-foraging",
        "aquatic-locomotion",
        "diurnal-activity",
        "food-investigation",
        "movement-memory",
        "shore-water-activity",
        "small-prey-pursuit",
        "surface-opportunity",
        "tidal-activity",
        "water-depth-response",
      ],
      activitySignals: ["aquatic-foraging", "shore-water-relocation", "surface-diving"],
      evidenceKinds: [],
      presentationModel: "individual",
    });
    expect(coreEcologySpeciesHasRuntimeCapability(
      "north-american-river-otter",
      "ground-movement-evidence",
    )).toBe(false);
  });

  it("keeps mobbing and aerial predation orthogonal to prey identity", () => {
    const crow = coreEcologySpeciesRuntimePolicy("fish-crow");
    const harrier = coreEcologySpeciesRuntimePolicy("northern-harrier");
    expect(crow).toMatchObject({
      locomotionClass: "aerial",
      groupOrganization: "flock",
      groupStableIdNamespace: "CROW-FLOCK",
      maximumMaterializedActors: 3,
      presentationModel: "visible-flock",
    });
    expect(coreEcologySpeciesHasRuntimeCapability("fish-crow", "mobbing")).toBe(true);
    expect(coreEcologySpeciesHasRuntimeCapability("fish-crow", "aerial-predator")).toBe(false);
    expect(getCoreWildlifeProfile("fish-crow").roles).not.toContain("prey");

    expect(harrier).toMatchObject({
      locomotionClass: "aerial",
      groupOrganization: null,
      maximumMaterializedActors: 1,
    });
    expect(coreEcologySpeciesHasRuntimeCapability("northern-harrier", "aerial-predator"))
      .toBe(true);
    expect(coreEcologySpeciesHasRuntimeCapability("northern-harrier", "small-prey-pursuit"))
      .toBe(true);
  });

  it("declares direct activity and evidence without manufacturing flight tracks", () => {
    expect(coreEcologySpeciesRuntimePolicy("fish-crow")).toMatchObject({
      activitySignals: ["crow-nasal-double-call", "shared-alarm"],
      evidenceKinds: [],
    });
    expect(coreEcologySpeciesRuntimePolicy("northern-harrier")).toMatchObject({
      activitySignals: ["low-quartering-flight"],
      evidenceKinds: [],
    });
    expect(coreEcologySpeciesRuntimePolicy("southern-leopard-frog")).toMatchObject({
      activitySignals: ["frog-quieting", "rain-chorus", "rain-responsive"],
      evidenceKinds: ["frog-track"],
    });
  });

  it("fails unknown capabilities, unknown species, and altered policy shapes closed", () => {
    for (const capability of CORE_ECOLOGY_SPECIES_RUNTIME_CAPABILITIES) {
      expect(isCoreEcologySpeciesRuntimeCapability(capability)).toBe(true);
    }
    expect(isCoreEcologySpeciesRuntimeCapability("crow-eats-harrier")).toBe(false);
    expect(coreEcologySpeciesRuntimePolicy("owl")).toBeNull();
    expect(coreEcologySpeciesRuntimePolicy(null)).toBeNull();
    expect(coreEcologySpeciesHasRuntimeCapability("owl", "mobbing")).toBe(false);
    const crow = coreEcologySpeciesRuntimePolicy("fish-crow");
    if (crow === null) throw new Error("fish crow policy fixture missing");
    expect(isCoreEcologySpeciesRuntimePolicy({ ...crow, actorAddressable: false })).toBe(false);
    expect(isCoreEcologySpeciesRuntimePolicy({ ...crow, debug: true })).toBe(false);
    expect(isCoreEcologySpeciesRuntimePolicy({
      ...crow,
      mortality: { ...crow.mortality, carcassGuarding: true },
    })).toBe(false);
  });

  it("keeps physical-body mortality off grouped species until group retirement is owned", () => {
    const bodyCapable = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.filter(
      ({ mortality }) => mortality.physicalBodyResourceUnits > 0,
    );
    expect(bodyCapable).not.toHaveLength(0);
    expect(bodyCapable.every(({ groupOrganization }) => groupOrganization === null)).toBe(true);
    expect(validateCoreEcologySpeciesRuntimePolicies(LIVING_SPECIES_CATALOG)).toEqual([]);
  });

  it("reports catalog drift instead of accepting caller-owned capability claims", () => {
    const altered = structuredClone(LIVING_SPECIES_CATALOG);
    const frog = altered.modules.find(({ speciesId }) => speciesId === "southern-leopard-frog");
    if (frog === undefined) throw new Error("frog catalog fixture missing");
    (frog.population as { maxMaterializedPerRegion: number }).maxMaterializedPerRegion = 1;
    expect(validateCoreEcologySpeciesRuntimePolicies(altered))
      .toContain("southern-leopard-frog:materialization-policy-mismatch");
    expect(() => assertCoreEcologySpeciesRuntimePolicies(altered))
      .toThrow("Core ecology species runtime policy is incoherent");
  });
});
