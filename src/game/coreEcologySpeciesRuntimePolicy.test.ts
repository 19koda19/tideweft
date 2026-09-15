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
  coreEcologySpeciesCanUseAmphibiousRoute,
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
      "wild-boar",
      "elk",
      "gray-wolf",
      "cougar",
      "brown-bear",
      "mountain-goat",
      "american-pika",
      "golden-eagle",
      "atlantic-capelin",
      "arctic-fox",
      "harbor-seal",
      "polar-bear",
      "bay-anchovy",
      "atlantic-ghost-crab",
      "great-blue-heron",
      "common-tern",
      "osprey",
      "atlantic-menhaden",
      "mummichog",
      "grass-shrimp",
      "blue-crab",
      "greater-yellowlegs",
      "belted-kingfisher",
      "double-crested-cormorant",
      "eastern-saltmarsh-mosquito",
      "marsh-periwinkle",
      "seaside-sparrow",
      "diamondback-terrapin",
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

  it("declares shared contact/body capabilities and orthogonal carcass consumers", () => {
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
      capabilities: expect.arrayContaining([
        "circadian-activity",
        "physical-body-resource",
      ]),
    });
    expect(coreEcologySpeciesPhysicalBodySizeUnits("marsh-rabbit")).toBe(3);
    expect(coreEcologySpeciesPhysicalBodyResourceUnits("marsh-rabbit")).toBe(4);
    expect(coreEcologySpeciesPredatorContact("marsh-rabbit")).toBeNull();
    expect(coreEcologySpeciesHasRuntimeCapability("marsh-rabbit", "circadian-activity"))
      .toBe(true);
    expect(coreEcologySpeciesHasRuntimeCapability("marsh-rabbit", "diurnal-activity"))
      .toBe(false);

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

    expect(coreEcologySpeciesRuntimePolicy("gray-wolf")).toMatchObject({
      mortality: {
        predatorContact: {
          cause: "predator-contact",
          reachUnits: 650,
          damageUnits: 700_000,
        },
        physicalBodySizeUnits: 0,
        physicalBodyResourceUnits: 0,
        carcassFeeding: true,
        carcassGuarding: true,
      },
      capabilities: expect.arrayContaining([
        "live-prey-pursuit",
        "predator-contact-damage",
        "carcass-feeding",
        "carcass-guarding",
      ]),
    });
    expect(coreEcologySpeciesRuntimePolicy("wild-boar")).toMatchObject({
      mortality: {
        predatorContact: null,
        physicalBodySizeUnits: 0,
        physicalBodyResourceUnits: 0,
        carcassFeeding: true,
        carcassGuarding: false,
      },
      capabilities: expect.arrayContaining(["food-investigation", "carcass-feeding"]),
    });
    expect(coreEcologySpeciesCanFeedFromCarcass("wild-boar")).toBe(true);
    expect(coreEcologySpeciesCanGuardCarcass("wild-boar")).toBe(false);

    const predatorBreadth = [
      [
        "cougar",
        { cause: "predator-contact", reachUnits: 600, damageUnits: 800_000 },
        true,
      ],
      ["brown-bear", null, false],
    ] as const;
    for (const [species, contact, pursuesLivePrey] of predatorBreadth) {
      expect(coreEcologySpeciesRuntimePolicy(species)).toMatchObject({
        actorAddressable: true,
        groupOrganization: null,
        maximumMaterializedActors: 2,
        mortality: {
          predatorContact: contact,
          physicalBodySizeUnits: 0,
          physicalBodyResourceUnits: 0,
          carcassFeeding: true,
          carcassGuarding: true,
        },
      });
      expect(coreEcologySpeciesCanFeedFromCarcass(species)).toBe(true);
      expect(coreEcologySpeciesCanGuardCarcass(species)).toBe(true);
      expect(coreEcologySpeciesHasRuntimeCapability(species, "live-prey-pursuit"))
        .toBe(pursuesLivePrey);
      expect(coreEcologySpeciesHasRuntimeCapability(species, "physical-body-resource"))
        .toBe(false);
    }

    const inactive = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.filter(({ speciesId }) => (
      speciesId !== "marsh-fox"
      && speciesId !== "marsh-rabbit"
      && speciesId !== "fish-crow"
      && speciesId !== "wild-boar"
      && speciesId !== "gray-wolf"
      && speciesId !== "cougar"
      && speciesId !== "brown-bear"
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
    expect(coreEcologySpeciesCanOwnActorAddress("mountain-goat")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("american-pika")).toBe(false);
    expect(coreEcologySpeciesCanOwnActorAddress("golden-eagle")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("atlantic-capelin")).toBe(false);
    expect(coreEcologySpeciesCanOwnActorAddress("arctic-fox")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("harbor-seal")).toBe(true);
    expect(coreEcologySpeciesCanOwnActorAddress("polar-bear")).toBe(true);
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
    expect(coreEcologySpeciesRuntimePolicy("american-pika")).toMatchObject({
      actorAddressable: false,
      identityForm: "aggregate",
      representation: "aggregate",
      maximumMaterializedActors: 0,
      aggregate: {
        maximumAnchors: 4,
        responseCadenceTicks: 8,
        responseVerbs: ["quiet", "redistribute", "suppress"],
      },
      capabilities: ["aggregate-response", "population-activity-evidence", "quieting"],
      activitySignals: ["talus-foraging", "talus-quieting"],
      evidenceKinds: ["haypile", "talus-sign"],
      presentationModel: "aggregate-activity",
    });
    expect(coreEcologySpeciesRuntimePolicy("mountain-goat")).toMatchObject({
      actorAddressable: true,
      groupOrganization: "herd",
      groupStableIdNamespace: "HERD",
      maximumMaterializedActors: 5,
      capabilities: ["actor-address", "ground-movement-evidence", "group-coordination"],
      activitySignals: [],
    });
    expect(coreEcologySpeciesRuntimePolicy("golden-eagle")).toMatchObject({
      actorAddressable: true,
      groupOrganization: null,
      maximumMaterializedActors: 1,
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "aerial-predator",
        "circadian-activity",
        "movement-memory",
        "perch",
      ],
    });
    expect(coreEcologySpeciesRuntimePolicy("atlantic-capelin")).toMatchObject({
      actorAddressable: false,
      identityForm: "aggregate",
      representation: "aggregate",
      locomotionClass: "aquatic",
      groupOrganization: "school",
      groupStableIdNamespace: "CAPELIN-SCHOOL",
      maximumMaterializedActors: 0,
      aggregate: {
        maximumAnchors: 4,
        responseCadenceTicks: 4,
        responseVerbs: ["redistribute", "school", "tighten"],
      },
      capabilities: [
        "aggregate-response",
        "aquatic-locomotion",
        "population-activity-evidence",
        "school-coordination",
        "tidal-activity",
        "water-depth-response",
      ],
      activitySignals: ["schooling-glint", "school-tightening", "surface-dimple"],
      evidenceKinds: ["surface-dimple"],
      presentationModel: "aggregate-school",
    });
    expect(coreEcologySpeciesRuntimePolicy("arctic-fox")).toMatchObject({
      actorAddressable: true,
      identityForm: "individual",
      representation: "individual",
      locomotionClass: "terrestrial",
      groupOrganization: null,
      groupStableIdNamespace: null,
      maximumMaterializedActors: 1,
      aggregate: null,
      capabilities: [
        "actor-address",
        "food-investigation",
        "ground-movement-evidence",
        "movement-memory",
        "shoreline-foraging",
      ],
      activitySignals: [],
      evidenceKinds: ["canid-pawprints"],
      presentationModel: "individual",
    });
    for (const species of [
      "mountain-goat",
      "american-pika",
      "golden-eagle",
      "atlantic-capelin",
      "arctic-fox",
    ] as const) {
      expect(coreEcologySpeciesPredatorContact(species)).toBeNull();
      expect(coreEcologySpeciesPhysicalBodyResourceUnits(species)).toBe(0);
      expect(coreEcologySpeciesHasRuntimeCapability(species, "live-prey-pursuit")).toBe(false);
    }
    for (const capability of [
      "carcass-feeding",
      "carcass-guarding",
      "group-coordination",
      "predator-contact-damage",
      "physical-body-resource",
      "school-coordination",
    ] as const) {
      expect(coreEcologySpeciesHasRuntimeCapability("arctic-fox", capability)).toBe(false);
    }
  });

  it("admits the Alpha-36 cold-shore consumers through shared nonlethal policy seams", () => {
    const expected = {
      "harbor-seal": {
        maximumMaterializedActors: 3,
        capabilities: [
          "actor-address",
          "amphibious-locomotion",
          "amphibious-route",
          "aquatic-foraging",
          "aquatic-locomotion",
          "circadian-activity",
          "movement-memory",
          "shore-water-activity",
          "surface-opportunity",
          "tidal-activity",
          "water-depth-response",
        ],
        activitySignals: [
          "aquatic-foraging",
          "shore-water-relocation",
          "surface-diving",
          "surface-swimming",
        ],
      },
      "polar-bear": {
        maximumMaterializedActors: 1,
        capabilities: [
          "actor-address",
          "amphibious-locomotion",
          "amphibious-route",
          "aquatic-locomotion",
          "food-investigation",
          "live-prey-pursuit",
          "movement-memory",
          "water-depth-response",
        ],
        activitySignals: [],
      },
    } as const;
    for (const [species, values] of Object.entries(expected) as [
      keyof typeof expected,
      (typeof expected)[keyof typeof expected],
    ][]) {
      expect(coreEcologySpeciesRuntimePolicy(species)).toMatchObject({
        actorAddressable: true,
        identityForm: "individual",
        representation: "individual",
        locomotionClass: "amphibious",
        groupOrganization: null,
        groupStableIdNamespace: null,
        maximumMaterializedActors: values.maximumMaterializedActors,
        aggregate: null,
        mortality: {
          predatorContact: null,
          physicalBodySizeUnits: 0,
          physicalBodyResourceUnits: 0,
          carcassFeeding: false,
          carcassGuarding: false,
        },
        capabilities: values.capabilities,
        activitySignals: values.activitySignals,
        evidenceKinds: [],
        presentationModel: "individual",
      });
      for (const capability of [
        "carcass-feeding",
        "carcass-guarding",
        "physical-body-resource",
        "predator-contact-damage",
      ] as const) {
        expect(coreEcologySpeciesHasRuntimeCapability(species, capability)).toBe(false);
      }
    }
    expect(coreEcologySpeciesHasRuntimeCapability("harbor-seal", "live-prey-pursuit"))
      .toBe(false);
    expect(coreEcologySpeciesHasRuntimeCapability("polar-bear", "aquatic-foraging"))
      .toBe(false);
  });

  it("admits the Wave-G estuary cluster through composable fail-closed roles", () => {
    const expected = {
      "bay-anchovy": {
        actorAddressable: false,
        identityForm: "aggregate",
        locomotionClass: "aquatic",
        groupOrganization: "school",
        groupStableIdNamespace: "BAYANCHOVY-SCHOOL",
        maximumMaterializedActors: 0,
        capabilities: [
          "aggregate-response",
          "aquatic-locomotion",
          "population-activity-evidence",
          "school-coordination",
          "tidal-activity",
          "water-depth-response",
        ],
        evidenceKinds: ["surface-dimple"],
      },
      "atlantic-ghost-crab": {
        actorAddressable: false,
        identityForm: "aggregate",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        maximumMaterializedActors: 0,
        capabilities: [
          "aggregate-response",
          "population-activity-evidence",
          "quieting",
          "tidal-activity",
        ],
        evidenceKinds: ["burrow-opening", "feeding-scrape"],
      },
      "great-blue-heron": {
        actorAddressable: true,
        identityForm: "individual",
        locomotionClass: "amphibious",
        groupOrganization: null,
        groupStableIdNamespace: null,
        maximumMaterializedActors: 2,
        capabilities: [
          "actor-address",
          "aerial-locomotion",
          "amphibious-locomotion",
          "aquatic-foraging",
          "circadian-activity",
          "movement-memory",
          "surface-opportunity",
          "tidal-activity",
          "wading",
          "water-depth-response",
        ],
        evidenceKinds: [],
      },
      "common-tern": {
        actorAddressable: true,
        identityForm: "individual",
        locomotionClass: "aerial",
        groupOrganization: "flock",
        groupStableIdNamespace: "FLOCK",
        maximumMaterializedActors: 8,
        capabilities: [
          "actor-address",
          "aerial-locomotion",
          "aquatic-foraging",
          "circadian-activity",
          "group-coordination",
          "movement-memory",
          "perch",
          "surface-opportunity",
          "tidal-activity",
        ],
        evidenceKinds: [],
      },
      osprey: {
        actorAddressable: true,
        identityForm: "individual",
        locomotionClass: "aerial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        maximumMaterializedActors: 1,
        capabilities: [
          "actor-address",
          "aerial-locomotion",
          "aerial-predator",
          "aquatic-foraging",
          "circadian-activity",
          "movement-memory",
          "perch",
          "surface-opportunity",
          "tidal-activity",
        ],
        evidenceKinds: [],
      },
    } as const;

    for (const [species, contract] of Object.entries(expected) as [
      keyof typeof expected,
      (typeof expected)[keyof typeof expected],
    ][]) {
      expect(coreEcologySpeciesRuntimePolicy(species)).toMatchObject({
        ...contract,
        mortality: {
          predatorContact: null,
          physicalBodySizeUnits: 0,
          physicalBodyResourceUnits: 0,
          carcassFeeding: false,
          carcassGuarding: false,
        },
      });
      expect(coreEcologySpeciesPredatorContact(species)).toBeNull();
      expect(coreEcologySpeciesPhysicalBodySizeUnits(species)).toBe(0);
      expect(coreEcologySpeciesPhysicalBodyResourceUnits(species)).toBe(0);
      expect(coreEcologySpeciesCanFeedFromCarcass(species)).toBe(false);
      expect(coreEcologySpeciesCanGuardCarcass(species)).toBe(false);
    }
  });

  it("admits the marsh-channel web through shared aggregate and consumer policies", () => {
    const aggregates = {
      "atlantic-menhaden": ["school", "MENHADEN-SCHOOL", 4, ["redistribute", "school", "tighten"], "aggregate-school"],
      mummichog: ["school", "MUMMICHOG-SCHOOL", 4, ["redistribute", "school", "tighten"], "aggregate-school"],
      "grass-shrimp": [null, null, 6, ["quiet", "redistribute"], "aggregate-activity"],
      "blue-crab": [null, null, 8, ["quiet", "redistribute", "retreat-to-burrow"], "aggregate-activity"],
    } as const;
    for (const [species, contract] of Object.entries(aggregates) as [
      keyof typeof aggregates,
      (typeof aggregates)[keyof typeof aggregates],
    ][]) {
      const [groupOrganization, groupStableIdNamespace, cadence, responseVerbs, presentation] =
        contract;
      expect(coreEcologySpeciesRuntimePolicy(species)).toMatchObject({
        actorAddressable: false,
        identityForm: "aggregate",
        representation: "aggregate",
        locomotionClass: "aquatic",
        groupOrganization,
        groupStableIdNamespace,
        maximumMaterializedActors: 0,
        aggregate: {
          maximumAnchors: 4,
          responseCadenceTicks: cadence,
          responseVerbs,
        },
        capabilities: expect.arrayContaining([
          "aggregate-response",
          "aquatic-locomotion",
          "population-activity-evidence",
          "tidal-activity",
          "water-depth-response",
        ]),
        presentationModel: presentation,
      });
      expect(coreEcologySpeciesCanOwnActorAddress(species)).toBe(false);
    }

    const addressable = {
      "greater-yellowlegs": ["amphibious", "flock", "FLOCK", 4, ["wading"]],
      "belted-kingfisher": ["aerial", null, null, 1, ["perch"]],
      "double-crested-cormorant": [
        "amphibious",
        "flock",
        "FLOCK",
        3,
        ["aquatic-locomotion", "group-coordination"],
      ],
    } as const;
    for (const [species, contract] of Object.entries(addressable) as [
      keyof typeof addressable,
      (typeof addressable)[keyof typeof addressable],
    ][]) {
      const [
        locomotionClass,
        groupOrganization,
        groupStableIdNamespace,
        maximumMaterializedActors,
        distinctiveCapabilities,
      ] = contract;
      expect(coreEcologySpeciesRuntimePolicy(species)).toMatchObject({
        actorAddressable: true,
        identityForm: "individual",
        representation: "individual",
        locomotionClass,
        groupOrganization,
        groupStableIdNamespace,
        maximumMaterializedActors,
        aggregate: null,
        capabilities: expect.arrayContaining([
          "actor-address",
          "aerial-locomotion",
          "aquatic-foraging",
          "circadian-activity",
          "movement-memory",
          "surface-opportunity",
          "tidal-activity",
          "water-depth-response",
          ...distinctiveCapabilities,
        ]),
      });
      expect(coreEcologySpeciesCanOwnActorAddress(species)).toBe(true);
    }
  });

  it("admits the final saltmarsh cohort through the shared policy registry", () => {
    const contracts = {
      "eastern-saltmarsh-mosquito": {
        addressable: false,
        locomotionClass: "aerial",
        group: null,
        maximumActors: 0,
        maximumAnchors: 2,
        capabilities: ["aggregate-response", "aerial-locomotion", "quieting"],
        evidenceKinds: ["swarm-haze"],
      },
      "marsh-periwinkle": {
        addressable: false,
        locomotionClass: "amphibious",
        group: null,
        maximumActors: 0,
        maximumAnchors: 2,
        capabilities: ["aggregate-response", "amphibious-locomotion", "tidal-activity"],
        evidenceKinds: ["grazing-trace", "shell-cluster"],
      },
      "seaside-sparrow": {
        addressable: true,
        locomotionClass: "aerial",
        group: "flock",
        maximumActors: 4,
        maximumAnchors: null,
        capabilities: ["aerial-locomotion", "food-investigation", "perch"],
        evidenceKinds: [],
      },
      "diamondback-terrapin": {
        addressable: true,
        locomotionClass: "amphibious",
        group: null,
        maximumActors: 1,
        maximumAnchors: null,
        capabilities: ["amphibious-route", "aquatic-locomotion", "shore-water-activity"],
        evidenceKinds: [],
      },
    } as const;

    for (const [species, expected] of Object.entries(contracts) as [
      keyof typeof contracts,
      (typeof contracts)[keyof typeof contracts],
    ][]) {
      const policy = coreEcologySpeciesRuntimePolicy(species);
      expect(policy).toMatchObject({
        actorAddressable: expected.addressable,
        identityForm: expected.addressable ? "individual" : "aggregate",
        representation: expected.addressable ? "individual" : "aggregate",
        locomotionClass: expected.locomotionClass,
        groupOrganization: expected.group,
        maximumMaterializedActors: expected.maximumActors,
        evidenceKinds: expected.evidenceKinds,
        capabilities: expect.arrayContaining([...expected.capabilities]),
        mortality: {
          predatorContact: null,
          physicalBodySizeUnits: 0,
          physicalBodyResourceUnits: 0,
          carcassFeeding: false,
          carcassGuarding: false,
        },
      });
      expect(policy?.aggregate?.maximumAnchors ?? null).toBe(expected.maximumAnchors);
      expect(coreEcologySpeciesCanOwnActorAddress(species)).toBe(expected.addressable);
    }
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
    expect(coreEcologySpeciesHasRuntimeCapability("domestic-chicken", "live-prey-pursuit"))
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
    expect(coreEcologySpeciesHasRuntimeCapability("domestic-goat", "live-prey-pursuit"))
      .toBe(false);
  });

  it("admits a circadian aerial gull to tidal surface opportunities without aquatic powers", () => {
    expect(coreEcologySpeciesRuntimePolicy("gull")).toMatchObject({
      locomotionClass: "aerial",
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "circadian-activity",
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
      "live-prey-pursuit",
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
    expect(coreEcologySpeciesHasRuntimeCapability("snowy-egret", "live-prey-pursuit"))
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
        "circadian-activity",
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
        "amphibious-route",
        "aquatic-foraging",
        "aquatic-locomotion",
        "circadian-activity",
        "food-investigation",
        "movement-memory",
        "shore-water-activity",
        "live-prey-pursuit",
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

  it("separates generic amphibious routing from shore-water activity authority", () => {
    const routeOwners = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES
      .filter(({ capabilities }) => capabilities.includes("amphibious-route"))
      .map(({ speciesId }) => speciesId);
    const shoreWaterActivityOwners = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES
      .filter(({ capabilities }) => capabilities.includes("shore-water-activity"))
      .map(({ speciesId }) => speciesId);

    expect(routeOwners).toEqual([
      "north-american-river-otter",
      "harbor-seal",
      "polar-bear",
      "diamondback-terrapin",
    ]);
    expect(shoreWaterActivityOwners).toEqual([
      "north-american-river-otter",
      "harbor-seal",
      "diamondback-terrapin",
    ]);
    for (const policy of CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES) {
      if (policy.capabilities.includes("shore-water-activity")) {
        expect(policy.capabilities).toContain("amphibious-route");
      }
      if (policy.capabilities.includes("amphibious-route")) {
        expect(policy.actorAddressable).toBe(true);
        expect(policy.locomotionClass).toBe("amphibious");
        expect(policy.capabilities).toContain("amphibious-locomotion");
        expect(policy.capabilities).toContain("aquatic-locomotion");
        expect(coreEcologySpeciesCanUseAmphibiousRoute(policy.speciesId)).toBe(true);
      }
    }
    expect(coreEcologySpeciesCanUseAmphibiousRoute("american-black-duck")).toBe(false);
    expect(coreEcologySpeciesCanUseAmphibiousRoute("snowy-egret")).toBe(false);
    expect(coreEcologySpeciesCanUseAmphibiousRoute("unknown-species")).toBe(false);
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
    expect(coreEcologySpeciesHasRuntimeCapability("northern-harrier", "live-prey-pursuit"))
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
