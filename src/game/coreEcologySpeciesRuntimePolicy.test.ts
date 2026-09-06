import { describe, expect, it } from "vitest";

import { getCoreWildlifeProfile } from "../sim/coreWildlifeIdentity";
import { LIVING_SPECIES_CATALOG } from "./livingSpeciesCatalog";
import {
  CORE_ECOLOGY_SPECIES_RUNTIME_CAPABILITIES,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_OWNER_ID,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_VERSION,
  assertCoreEcologySpeciesRuntimePolicies,
  coreEcologySpeciesCanOwnActorAddress,
  coreEcologySpeciesHasRuntimeCapability,
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
    ]);
    expect(validateCoreEcologySpeciesRuntimePolicies(LIVING_SPECIES_CATALOG)).toEqual([]);
    expect(() => assertCoreEcologySpeciesRuntimePolicies(LIVING_SPECIES_CATALOG)).not.toThrow();
    expect(Object.isFrozen(CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES)).toBe(true);
    for (const policy of CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES) {
      expect(Object.isFrozen(policy)).toBe(true);
      expect(Object.isFrozen(policy.capabilities)).toBe(true);
      expect(Object.isFrozen(policy.activitySignals)).toBe(true);
      expect(Object.isFrozen(policy.evidenceKinds)).toBe(true);
      expect(isCoreEcologySpeciesRuntimePolicy(policy)).toBe(true);
    }
  });

  it("separates addressable representatives from population-only aggregates", () => {
    expect(coreEcologySpeciesCanOwnActorAddress("fish-crow")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("northern-harrier")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("southern-leopard-frog")).toBe(false);
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
