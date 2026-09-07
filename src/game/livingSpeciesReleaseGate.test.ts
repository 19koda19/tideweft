import { describe, expect, it } from "vitest";

import {
  LIVING_SPECIES_CATALOG,
  LIVING_SPECIES_INTERACTION_TARGET_CLASSES,
  livingSpeciesModule,
} from "./livingSpeciesCatalog";
import type { LivingActorSpecies } from "./livingSpeciesRegistry";
import {
  ALPHA20_AMERICAN_BLACK_DUCK_BOUNDED_READINESS,
  ALPHA20_AMERICAN_BLACK_DUCK_EXCLUDED_CLAIMS,
  ALPHA20_AMERICAN_BLACK_DUCK_SPECIES,
  ALPHA21_RIVER_OTTER_BOUNDED_READINESS,
  ALPHA21_RIVER_OTTER_EXCLUDED_CLAIMS,
  ALPHA21_RIVER_OTTER_SPECIES,
  ALPHA22_TIDAL_CONVERGENCE_EXCLUDED_CLAIMS,
  ALPHA22_TIDAL_CONVERGENCE_SOURCE_CANDIDATE_READINESS,
  ALPHA22_TIDAL_CONVERGENCE_SPECIES,
  ALPHA24_DOMESTIC_CHICKEN_BOUNDED_READINESS,
  ALPHA24_DOMESTIC_CHICKEN_EXCLUDED_CLAIMS,
  ALPHA24_DOMESTIC_CHICKEN_SPECIES,
  ALPHA25_SHARED_DOMESTIC_LIVESTOCK_EXCLUDED_CLAIMS,
  ALPHA25_SHARED_DOMESTIC_LIVESTOCK_READINESS,
  ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES,
  ALPHA16_MARSH_EDGE_BOUNDED_CRITERIA,
  ALPHA16_MARSH_EDGE_BOUNDED_READINESS,
  ALPHA16_MARSH_EDGE_SPECIES,
  ALPHA17_RAIN_CHORUS_BOUNDED_CRITERIA,
  ALPHA17_RAIN_CHORUS_BOUNDED_READINESS,
  ALPHA17_RAIN_CHORUS_SPECIES,
  LIVING_SPECIES_RELEASE_CRITERIA,
  LIVING_SPECIES_RELEASE_GATES,
  WAVE_B_BOUNDED_EXCLUDED_CLAIMS,
  WAVE_B_BOUNDED_STARTING_HARBOR_READINESS,
  WAVE_B_BOUNDED_STARTING_HARBOR_SPECIES,
  WAVE_C_TIDAL_TABLE_BOUNDED_READINESS,
  WAVE_C_TIDAL_TABLE_EXCLUDED_CLAIMS,
  WAVE_C_TIDAL_TABLE_SPECIES,
  alpha16MarshEdgeBoundedReadiness,
  alpha17RainChorusBoundedReadiness,
  alpha20AmericanBlackDuckBoundedReadiness,
  alpha21RiverOtterBoundedReadiness,
  alpha22TidalConvergenceSourceCandidateReadiness,
  alpha24DomesticChickenBoundedReadiness,
  alpha25SharedDomesticLivestockReadiness,
  auditLivingSpeciesReleaseGate,
  canonicalizeLivingSpeciesReleaseGate,
  canonicalizeLivingSpeciesReleaseGateSet,
  createLivingSpeciesReleaseGateSet,
  livingSpeciesReadinessReport,
  waveBBoundedStartingHarborReadiness,
  waveCTidalTableBoundedReadiness,
  type LivingSpeciesReleaseGate,
} from "./livingSpeciesReleaseGate";

function gate(speciesId: LivingActorSpecies): LivingSpeciesReleaseGate {
  const result = LIVING_SPECIES_RELEASE_GATES.gates.find((candidate) => candidate.speciesId === speciesId);
  if (result === undefined) throw new Error(`Missing release gate for ${speciesId}`);
  return structuredClone(result);
}

describe("Living Weft species release gate", () => {
  it("models all 30 criteria in one stable order for only registered species", () => {
    expect(LIVING_SPECIES_RELEASE_CRITERIA).toHaveLength(30);
    expect(new Set(LIVING_SPECIES_RELEASE_CRITERIA).size).toBe(30);
    expect(LIVING_SPECIES_RELEASE_GATES.gates.map(({ speciesId }) => speciesId))
      .toEqual(LIVING_SPECIES_CATALOG.modules.map(({ speciesId }) => speciesId));
    for (const releaseGate of LIVING_SPECIES_RELEASE_GATES.gates) {
      expect(releaseGate.criteria.map(({ criterion }) => criterion))
        .toEqual(LIVING_SPECIES_RELEASE_CRITERIA);
    }
  });

  it("keeps every current actor module blocked until all 30 release criteria close", () => {
    const human = livingSpeciesReadinessReport("human");
    const dog = livingSpeciesReadinessReport("domestic-dog");

    expect(human).toMatchObject({ evidenceAuthenticated: true, state: "blocked", publicReady: false });
    expect(dog).toMatchObject({ evidenceAuthenticated: true, state: "blocked", publicReady: false });
    expect(human?.counts.total).toBe(30);
    expect(dog?.counts.total).toBe(30);
    expect(human?.blockingCriteria).toContain("full-coarse-transition");
    expect(dog?.blockingCriteria).toContain("population-materialization");
    for (const species of ["deer", "gull", "black-bear"] as const) {
      const wildlife = livingSpeciesReadinessReport(species);
      expect(wildlife).toMatchObject({
        evidenceAuthenticated: true,
        state: "blocked",
        publicReady: false,
      });
      expect(wildlife?.counts.total).toBe(30);
      expect(wildlife?.blockingCriteria).toEqual(expect.arrayContaining([
        "sound",
        "perception-senses",
        "environmental-evidence",
        "seamless-region-crossing",
        "performance-budget",
        "fuzz-testing",
      ]));
    }
    for (const species of ["deer", "gull"] as const) {
      const wildlife = livingSpeciesReadinessReport(species);
      expect(wildlife?.blockingCriteria).not.toContain("habitat-placement");
      expect(wildlife?.blockingCriteria).not.toContain("same-species-interaction");
      expect(wildlife?.blockingCriteria).not.toContain("player-independent-scenario");
    }
    expect(livingSpeciesReadinessReport("black-bear")?.blockingCriteria)
      .toEqual(expect.arrayContaining([
        "same-species-interaction",
        "player-independent-scenario",
      ]));
    expect(livingSpeciesReadinessReport("brown-rat")).toMatchObject({
      evidenceAuthenticated: true,
      state: "blocked",
      publicReady: false,
      counts: {
        active: 25,
        foundation: 4,
        unimplemented: 1,
        notApplicable: 0,
        total: 30,
      },
      blockingCriteria: [
        "food-web",
        "perception-senses",
        "full-coarse-transition",
        "seamless-region-crossing",
        "exact-tested-deployment",
      ],
    });
    expect(livingSpeciesReadinessReport("domestic-cat")).toMatchObject({
      evidenceAuthenticated: true,
      state: "blocked",
      publicReady: false,
      counts: {
        active: 27,
        foundation: 2,
        unimplemented: 1,
        notApplicable: 0,
        total: 30,
      },
      blockingCriteria: [
        "food-web",
        "perception-senses",
        "exact-tested-deployment",
      ],
    });
    for (const species of ALPHA16_MARSH_EDGE_SPECIES) {
      expect(livingSpeciesReadinessReport(species)).toMatchObject({
        evidenceAuthenticated: true,
        state: "blocked",
        publicReady: false,
        counts: {
          active: 26,
          foundation: 2,
          unimplemented: 2,
          notApplicable: 0,
          total: 30,
        },
        blockingCriteria: [
          "food-web",
          "perception-senses",
          "same-species-interaction",
          "exact-tested-deployment",
        ],
      });
    }
    expect(livingSpeciesReadinessReport("wolf")).toBeNull();
  });

  it("authenticates only the bounded Alpha-16 rabbit/fox implementation claims", () => {
    for (const species of ALPHA16_MARSH_EDGE_SPECIES) {
      const releaseGate = gate(species);
      const state = (criterion: (typeof LIVING_SPECIES_RELEASE_CRITERIA)[number]) => (
        releaseGate.criteria.find((candidate) => candidate.criterion === criterion)
      );
      expect(releaseGate.criteria
        .filter(({ status }) => status === "active")
        .map(({ criterion }) => criterion)).toEqual([
          ...ALPHA16_MARSH_EDGE_BOUNDED_CRITERIA,
          "tutorial-truth",
          "patch-note-truth",
        ]);
      expect(state("species-profile")).toMatchObject({
        status: "active",
        evidenceOwnerIds: [
          "game:living-species-catalog:v1",
          "sim:core-wildlife-identity:v1",
        ],
      });
      expect(state("sound")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["audio:soundscape:v1", "game:runtime-core-ecology:v1"],
      });
      expect(state("habitat-placement")).toMatchObject({
        status: "active",
        evidenceOwnerIds: [
          "game:core-ecology-habitat:v3",
          "game:runtime-core-ecology:v1",
        ],
      });
      expect(state("food-web")).toMatchObject({
        status: "foundation",
        evidenceOwnerIds: [
          "game:core-ecology-trophic:v1",
          "game:core-wildlife-actor:v1",
          "game:living-species-catalog:v1",
          "sim:core-wildlife-identity:v1",
        ],
      });
      expect(state("perception-senses")).toMatchObject({
        status: "foundation",
        evidenceOwnerIds: [
          "game:core-ecology-perception:v1",
          "game:core-ecology-trophic:v1",
          "game:living-actor-senses:v1",
          "sim:actor-perception:v2",
        ],
      });
      expect(state("locomotion")).toMatchObject({
        status: "active",
        evidenceOwnerIds: [
          "game:core-wildlife-actor:v1",
          "game:core-wildlife-locomotion-profile:v1",
          "game:runtime-core-ecology:v1",
        ],
      });
      expect(state("save-load")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["game:core-ecology:v3", "game:runtime-save:v11"],
      });
      expect(state("performance-budget")).toMatchObject({
        status: "active",
        evidenceOwnerIds: [
          "game:core-ecology-habitat:v3",
          "game:core-ecology:v3",
          "game:runtime-core-ecology:v1",
          "test:core-ecology-marsh-edge-performance:v1",
        ],
      });
      expect(state("mobile-parity")).toMatchObject({
        status: "active",
        evidenceOwnerIds: [
          "game:wildlife-about:v1",
          "game:wildlife-presentation:v1",
          "test:core-ecology-marsh-edge-mobile:v1",
        ],
      });
      expect(state("tutorial-truth")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["ui:tutorial-guide:v26"],
      });
      expect(state("patch-note-truth")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["content:patch-notes-alpha16:v1"],
      });
      for (const criterion of [
        "same-species-interaction",
        "exact-tested-deployment",
      ] as const) {
        expect(state(criterion)).toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
      }
    }
  });

  it("separates a bounded implementation candidate from publication, deployment, and the full gate", () => {
    const readiness = alpha16MarshEdgeBoundedReadiness();
    expect(readiness).toEqual(ALPHA16_MARSH_EDGE_BOUNDED_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "alpha16-marsh-edge",
      speciesIds: ["marsh-rabbit", "marsh-fox"],
      evidenceAuthenticated: true,
      boundedCandidateReady: true,
      blockingBoundedCriteria: [],
      publicationRecordsReady: true,
      exactTestedDeploymentVerified: false,
      published: false,
      fullThirtyCriterionReady: false,
      fullGateBlockingCriteria: [
        "food-web",
        "perception-senses",
        "same-species-interaction",
        "exact-tested-deployment",
      ],
    });
    expect(readiness.boundedCriteria).toEqual(ALPHA16_MARSH_EDGE_BOUNDED_CRITERIA);
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.boundedCriteria)).toBe(true);
    expect(Object.isFrozen(readiness.fullGateBlockingCriteria)).toBe(true);
    for (const species of readiness.speciesIds) {
      expect(livingSpeciesReadinessReport(species)?.publicReady).toBe(false);
    }
  });

  it("authenticates the bounded Alpha-17 slice without inventing flight evidence or publication", () => {
    const readiness = alpha17RainChorusBoundedReadiness();
    expect(readiness).toEqual(ALPHA17_RAIN_CHORUS_BOUNDED_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "alpha17-rain-chorus",
      speciesIds: ["fish-crow", "northern-harrier", "southern-leopard-frog"],
      evidenceAuthenticated: true,
      boundedCandidateReady: true,
      blockingBoundedCriteria: [],
      publicationRecordsReady: true,
      exactTestedDeploymentVerified: false,
      published: false,
      fullThirtyCriterionReady: false,
      fullGateBlockingCriteria: [
        "sound",
        "food-web",
        "perception-senses",
        "same-species-interaction",
        "environmental-evidence",
        "exact-tested-deployment",
      ],
    });
    expect(readiness.boundedCriteria).toEqual(ALPHA17_RAIN_CHORUS_BOUNDED_CRITERIA);
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.boundedCriteria)).toBe(true);
    expect(Object.isFrozen(readiness.fullGateBlockingCriteria)).toBe(true);

    for (const species of ALPHA17_RAIN_CHORUS_SPECIES) {
      expect(livingSpeciesReadinessReport(species)).toMatchObject({
        evidenceAuthenticated: true,
        state: "blocked",
        publicReady: false,
      });
    }
    expect(gate("fish-crow").criteria.find(({ criterion }) => (
      criterion === "environmental-evidence"
    ))).toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
    expect(gate("northern-harrier").criteria.find(({ criterion }) => (
      criterion === "environmental-evidence"
    ))).toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
    expect(gate("northern-harrier").criteria.find(({ criterion }) => (
      criterion === "sound"
    ))).toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
    expect(gate("southern-leopard-frog").criteria.find(({ criterion }) => (
      criterion === "environmental-evidence"
    ))).toMatchObject({
      status: "active",
      evidenceOwnerIds: [
        "game:core-ecology-evidence-runtime:v1",
        "game:core-ecology:v4",
        "game:wildlife-presentation:v1",
      ],
    });
  });

  it("authenticates only the seven-role bounded starting-harbor Wave-B roster", () => {
    const readiness = waveBBoundedStartingHarborReadiness();

    expect(readiness).toEqual(WAVE_B_BOUNDED_STARTING_HARBOR_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "wave-b-small-world",
      scope: "bounded-starting-harbor",
      speciesIds: [
        "brown-rat",
        "domestic-cat",
        "marsh-rabbit",
        "marsh-fox",
        "fish-crow",
        "northern-harrier",
        "southern-leopard-frog",
      ],
      evidenceAuthenticated: true,
      roleCoverageReady: true,
      broadInteractionCoverageReady: true,
      boundedCandidateReady: true,
      blockingRoles: [],
      fullThirtyCriterionReady: false,
      excludedClaims: [
        "worldwide-ecology",
        "wildlife-promotion",
        "cross-region-migration",
        "full-thirty-criterion-readiness",
        "directive-completion",
      ],
    });
    expect(readiness.speciesIds).toEqual(WAVE_B_BOUNDED_STARTING_HARBOR_SPECIES);
    expect(readiness.excludedClaims).toEqual(WAVE_B_BOUNDED_EXCLUDED_CLAIMS);
    expect(readiness.roles.map((role) => ({
      role: role.role,
      speciesId: role.speciesId,
      representation: role.representation,
      continuity: role.continuity,
    }))).toEqual([
      {
        role: "rodent",
        speciesId: "brown-rat",
        representation: "aggregate",
        continuity: "aggregate-authoritative",
      },
      {
        role: "cat",
        speciesId: "domestic-cat",
        representation: "individual",
        continuity: "individual-full-coarse",
      },
      {
        role: "rabbit-hare",
        speciesId: "marsh-rabbit",
        representation: "individual",
        continuity: "individual-full-coarse",
      },
      {
        role: "small-opportunist",
        speciesId: "marsh-fox",
        representation: "individual",
        continuity: "individual-full-coarse",
      },
      {
        role: "corvid",
        speciesId: "fish-crow",
        representation: "group",
        continuity: "group-full-coarse",
      },
      {
        role: "raptor",
        speciesId: "northern-harrier",
        representation: "individual",
        continuity: "individual-full-coarse",
      },
      {
        role: "amphibian",
        speciesId: "southern-leopard-frog",
        representation: "aggregate",
        continuity: "aggregate-authoritative",
      },
    ]);

    for (const role of readiness.roles) {
      expect(role).toMatchObject({
        evidenceAuthenticated: true,
        representationAuthenticated: true,
        interactionContractAuthenticated: true,
        continuityAuthenticated: true,
        ready: true,
      });
      expect(role.evidenceOwnerIds).toEqual([...role.evidenceOwnerIds].sort());
      expect(new Set(role.evidenceOwnerIds).size).toBe(role.evidenceOwnerIds.length);
      expect(Object.isFrozen(role)).toBe(true);
      expect(Object.isFrozen(role.evidenceOwnerIds)).toBe(true);
      expect(livingSpeciesReadinessReport(role.speciesId)?.publicReady).toBe(false);
    }
    expect(readiness.roles.find(({ role }) => role === "corvid")?.evidenceOwnerIds)
      .toContain("game:core-ecology-groups:v1");
    expect(readiness.roles.find(({ role }) => role === "rodent")?.evidenceOwnerIds)
      .toContain("game:core-ecology:v3");
    expect(readiness.roles.find(({ role }) => role === "amphibian")?.evidenceOwnerIds)
      .toContain("game:core-ecology:v4");
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.roles)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.blockingRoles)).toBe(true);
    expect(Object.isFrozen(readiness.excludedClaims)).toBe(true);
  });

  it("authenticates the bounded Tide Table without claiming migration or publication", () => {
    const readiness = waveCTidalTableBoundedReadiness();

    expect(readiness).toEqual(WAVE_C_TIDAL_TABLE_BOUNDED_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "tidal-table",
      scope: "bounded-starting-harbor-tidal",
      speciesIds: [
        "atlantic-silverside",
        "atlantic-marsh-fiddler-crab",
        "snowy-egret",
      ],
      evidenceAuthenticated: true,
      roleCoverageReady: true,
      broadInteractionCoverageReady: true,
      tidalResponseReady: true,
      signedFrameAggregateContinuityReady: true,
      localWaderContinuityReady: true,
      performanceEvidenceReady: true,
      boundedCandidateReady: true,
      blockingRoles: [],
      publicationRecordsReady: false,
      exactTestedDeploymentVerified: false,
      published: false,
      fullThirtyCriterionReady: false,
    });
    expect(readiness.speciesIds).toEqual(WAVE_C_TIDAL_TABLE_SPECIES);
    expect(readiness.excludedClaims).toEqual(WAVE_C_TIDAL_TABLE_EXCLUDED_CLAIMS);
    expect(readiness.excludedClaims).toEqual([
      "worldwide-ecology",
      "wildlife-promotion",
      "ecological-cross-region-migration",
      "mortality",
      "capture",
      "consumption",
      "carcasses",
      "fishing",
      "harvest",
      "waterfowl",
      "otter-like-predator",
      "full-wave-c",
      "full-directive-04-1",
    ]);
    expect(readiness.roles.map(({ role, speciesId, representation, continuity }) => ({
      role,
      speciesId,
      representation,
      continuity,
    }))).toEqual([
      {
        role: "forage-fish-school",
        speciesId: "atlantic-silverside",
        representation: "school-aggregate",
        continuity: "signed-frame-aggregate-continuity",
      },
      {
        role: "intertidal-crab-area",
        speciesId: "atlantic-marsh-fiddler-crab",
        representation: "area-aggregate",
        continuity: "signed-frame-aggregate-continuity",
      },
      {
        role: "wader",
        speciesId: "snowy-egret",
        representation: "individual-wader",
        continuity: "bounded-local-individual-continuity",
      },
    ]);

    for (const role of readiness.roles) {
      expect(role).toMatchObject({
        evidenceAuthenticated: true,
        representationAuthenticated: true,
        interactionContractAuthenticated: true,
        tidalResponseAuthenticated: true,
        continuityAuthenticated: true,
        performanceEvidenceAuthenticated: true,
        ready: true,
      });
      expect(role.evidenceOwnerIds)
        .toContain("test:core-ecology-tidal-table-performance:v1");
      expect(role.evidenceOwnerIds).toEqual([...role.evidenceOwnerIds].sort());
      expect(new Set(role.evidenceOwnerIds).size).toBe(role.evidenceOwnerIds.length);
      expect(Object.isFrozen(role)).toBe(true);
      expect(Object.isFrozen(role.evidenceOwnerIds)).toBe(true);
      expect(livingSpeciesReadinessReport(role.speciesId)?.publicReady).toBe(false);
    }

    for (const speciesId of [
      "atlantic-silverside",
      "atlantic-marsh-fiddler-crab",
    ] as const) {
      const module = livingSpeciesModule(speciesId);
      const crossing = gate(speciesId).criteria.find(({ criterion }) => (
        criterion === "seamless-region-crossing"
      ));
      expect(module?.locomotion.crossRegion).toBe(false);
      expect(crossing).toMatchObject({
        status: "foundation",
        evidenceOwnerIds: expect.arrayContaining([
          "test:core-ecology-tidal-table-signed-frame-continuity:v1",
        ]),
      });
    }
    const egretModule = livingSpeciesModule("snowy-egret");
    const egretCrossing = gate("snowy-egret").criteria.find(({ criterion }) => (
      criterion === "seamless-region-crossing"
    ));
    expect(egretModule?.locomotion.crossRegion).toBe(false);
    expect(egretCrossing).toMatchObject({
      status: "unimplemented",
      evidenceOwnerIds: [],
    });

    for (const speciesId of WAVE_C_TIDAL_TABLE_SPECIES) {
      const releaseGate = gate(speciesId);
      for (const criterion of [
        "tutorial-truth",
        "patch-note-truth",
        "exact-tested-deployment",
      ] as const) {
        expect(releaseGate.criteria.find((state) => state.criterion === criterion))
          .toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
      }
    }
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.roles)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.blockingRoles)).toBe(true);
    expect(Object.isFrozen(readiness.excludedClaims)).toBe(true);
  });

  it("authenticates Alpha-20 as one bounded duck without life-history, migration, or flock claims", () => {
    const readiness = alpha20AmericanBlackDuckBoundedReadiness();
    const releaseGate = gate("american-black-duck");
    const state = (criterion: (typeof LIVING_SPECIES_RELEASE_CRITERIA)[number]) => (
      releaseGate.criteria.find((candidate) => candidate.criterion === criterion)
    );

    expect(readiness).toEqual(ALPHA20_AMERICAN_BLACK_DUCK_BOUNDED_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "alpha20-american-black-duck",
      scope: "one-bounded-waterfowl-individual",
      speciesIds: ["american-black-duck"],
      evidenceAuthenticated: true,
      speciesProfileReady: true,
      individualRepresentationReady: true,
      habitatPlacementReady: true,
      boundedActivityReady: true,
      multimodalLocomotionReady: true,
      lawfulPerceptionReady: true,
      individualPresentationReady: true,
      nonlethalInteractionsReady: true,
      boundedLocalContinuityReady: true,
      performanceEvidenceReady: true,
      excludedClaimIntegrityReady: true,
      boundedCandidateReady: true,
      blockingCapabilities: [],
      publicationRecordsReady: false,
      exactTestedDeploymentVerified: false,
      published: false,
      fullThirtyCriterionReady: false,
    });
    expect(readiness.speciesIds).toEqual(ALPHA20_AMERICAN_BLACK_DUCK_SPECIES);
    expect(readiness.excludedClaims).toEqual(ALPHA20_AMERICAN_BLACK_DUCK_EXCLUDED_CLAIMS);
    expect(readiness.excludedClaims).toEqual([
      "mortality",
      "carcasses",
      "nesting",
      "ecological-cross-region-migration",
      "full-flock",
      "capture",
      "consumption",
      "reproduction",
      "full-wave-c",
      "full-directive-04-1",
    ]);
    expect(readiness.evidenceOwnerIds).toEqual([...readiness.evidenceOwnerIds].sort());
    expect(readiness.evidenceOwnerIds).toEqual(expect.arrayContaining([
      "game:core-ecology-activity:v1",
      "game:core-ecology-habitat:v6",
      "game:core-ecology-perception:v1",
      "game:core-wildlife-locomotion-profile:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    ]));

    expect(state("food-web")).toMatchObject({ status: "foundation" });
    expect(state("perception-senses")).toMatchObject({
      status: "foundation",
      evidenceOwnerIds: expect.arrayContaining(["game:core-ecology-perception:v1"]),
    });
    expect(state("fuzz-testing")).toMatchObject({ status: "foundation" });
    for (const criterion of [
      "sound",
      "same-species-interaction",
      "environmental-evidence",
      "seamless-region-crossing",
      "tutorial-truth",
      "patch-note-truth",
      "exact-tested-deployment",
    ] as const) {
      expect(state(criterion)).toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
    }

    const module = livingSpeciesModule("american-black-duck");
    expect(module).toMatchObject({
      identity: { form: "individual", stableIdNamespace: "DUCK" },
      population: { maxMaterializedPerRegion: 1 },
      habitat: { migrationModel: "none" },
      locomotion: { crossRegion: false },
      lifeHistory: { reproduction: "unimplemented", mortality: "unimplemented" },
      health: { causalDeath: false },
      aftermath: { implementation: "unimplemented", carcassModel: "none" },
      social: {
        group: { status: "unimplemented", stableIdentity: false },
        territory: { model: "none", anchorKinds: [] },
      },
    });
    expect(module?.interactions.targets.flatMap(({ verbs }) => verbs).some((verb) => (
      verb === "attack" || verb === "capture" || verb === "consume" || verb === "kill"
    ))).toBe(false);
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.blockingCapabilities)).toBe(true);
    expect(Object.isFrozen(readiness.evidenceOwnerIds)).toBe(true);
    expect(Object.isFrozen(readiness.excludedClaims)).toBe(true);
  });

  it("authenticates Alpha-21 as one bounded otter without harmful or later-ecology claims", () => {
    const readiness = alpha21RiverOtterBoundedReadiness();
    const releaseGate = gate("north-american-river-otter");
    const state = (criterion: (typeof LIVING_SPECIES_RELEASE_CRITERIA)[number]) => (
      releaseGate.criteria.find((candidate) => candidate.criterion === criterion)
    );

    expect(readiness).toEqual(ALPHA21_RIVER_OTTER_BOUNDED_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "alpha21-north-american-river-otter",
      scope: "one-bounded-amphibious-individual",
      speciesIds: ["north-american-river-otter"],
      evidenceAuthenticated: true,
      speciesProfileReady: true,
      individualRepresentationReady: true,
      habitatPlacementReady: true,
      boundedActivityReady: true,
      amphibiousLocomotionReady: true,
      lawfulPerceptionReady: true,
      topKMaterializationReady: true,
      saveMigrationReady: true,
      individualPresentationReady: true,
      nonlethalInteractionsReady: true,
      boundedLocalContinuityReady: true,
      performanceEvidenceReady: true,
      representativeEmergenceReady: true,
      excludedClaimIntegrityReady: true,
      boundedCandidateReady: true,
      blockingCapabilities: [],
      publicationRecordsReady: false,
      exactTestedDeploymentVerified: false,
      published: false,
      fullThirtyCriterionReady: false,
    });
    expect(readiness.speciesIds).toEqual(ALPHA21_RIVER_OTTER_SPECIES);
    expect(readiness.excludedClaims).toEqual(ALPHA21_RIVER_OTTER_EXCLUDED_CLAIMS);
    expect(readiness.excludedClaims).toEqual([
      "mortality",
      "carcasses",
      "harmful-predation",
      "capture",
      "live-prey-consumption",
      "sound",
      "environmental-evidence",
      "reproduction",
      "same-species-interaction",
      "ecological-cross-region-migration",
      "weather-water-tide-condition-mutation",
      "full-trophic-turnover",
      "full-wave-c",
      "full-directive-04-1",
    ]);
    expect(readiness.evidenceOwnerIds).toEqual([...readiness.evidenceOwnerIds].sort());
    expect(readiness.evidenceOwnerIds).toEqual(expect.arrayContaining([
      "game:core-ecology-activity:v1",
      "game:core-ecology-habitat:v7",
      "game:core-ecology-perception:v1",
      "game:core-ecology:v6",
      "game:core-wildlife-locomotion-profile:v1",
      "game:runtime-save:v15",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "test:alpha21-chart-relief-presentation:v1",
      "test:alpha21-save-migration:v1",
      "test:alpha21-shore-water-response:v1",
      "test:core-ecology-spatial-top-k:v1",
    ]));

    expect(state("food-web")).toMatchObject({ status: "foundation" });
    expect(state("perception-senses")).toMatchObject({
      status: "foundation",
      evidenceOwnerIds: expect.arrayContaining(["game:core-ecology-perception:v1"]),
    });
    expect(state("population-materialization")).toMatchObject({
      status: "active",
      evidenceOwnerIds: expect.arrayContaining(["test:core-ecology-spatial-top-k:v1"]),
    });
    expect(state("save-load")).toMatchObject({
      status: "active",
      evidenceOwnerIds: expect.arrayContaining([
        "game:runtime-save:v15",
        "test:alpha21-save-migration:v1",
      ]),
    });
    expect(state("player-independent-scenario")).toMatchObject({
      status: "active",
      evidenceOwnerIds: expect.arrayContaining(["test:alpha21-shore-water-response:v1"]),
    });
    expect(state("fuzz-testing")).toMatchObject({ status: "foundation" });
    for (const criterion of [
      "sound",
      "same-species-interaction",
      "environmental-evidence",
      "seamless-region-crossing",
      "tutorial-truth",
      "patch-note-truth",
      "exact-tested-deployment",
    ] as const) {
      expect(state(criterion)).toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
    }

    const module = livingSpeciesModule("north-american-river-otter");
    expect(module).toMatchObject({
      profile: { implementation: "active", taxonomicClass: "mammal" },
      identity: { implementation: "active", form: "individual", stableIdNamespace: "OTTER" },
      population: {
        implementation: "active",
        materialization: "mixed",
        maxMaterializedPerRegion: 1,
        coarseSimulation: true,
      },
      habitat: {
        implementation: "active",
        ownerId: "game:core-ecology-habitat:v7",
        migrationModel: "none",
      },
      activity: { implementation: "active", ownerId: "game:core-ecology-activity:v1" },
      locomotion: {
        implementation: "active",
        ownerId: "game:core-wildlife-locomotion-profile:v1",
        crossRegion: false,
      },
      sound: { implementation: "unimplemented", repertoire: [] },
      evidence: { status: "unimplemented", produces: [] },
      lifeHistory: { reproduction: "unimplemented", mortality: "unimplemented" },
      health: { implementation: "unimplemented", causalDeath: false },
      aftermath: { implementation: "unimplemented", carcassModel: "none" },
      environment: {
        weather: { status: "unimplemented" },
        water: { status: "unimplemented" },
        tide: { status: "unimplemented" },
      },
      social: {
        group: { status: "unimplemented", stableIdentity: false },
        territory: { model: "none", anchorKinds: [] },
      },
    });
    expect(module?.interactions.targets.find(({ targetClass }) => (
      targetClass === "aquatic-animal"
    ))).toMatchObject({
      verbs: ["approach", "dive"],
      escalationConstraints: expect.arrayContaining([
        "aggregate-unit-conservation",
        "direct-perception-required",
        "no-health-or-mortality-outcome",
        "nonlethal-pressure-only",
      ]),
    });
    expect(module?.interactions.targets.find(({ targetClass }) => (
      targetClass === "smaller-prey"
    ))).toMatchObject({
      verbs: ["pursue"],
      escalationConstraints: expect.arrayContaining([
        "bounded-pursuit",
        "direct-perception-required",
      ]),
    });
    expect(module?.interactions.targets.flatMap(({ verbs }) => verbs).some((verb) => (
      verb === "attack" || verb === "capture" || verb === "consume" || verb === "kill"
    ))).toBe(false);
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.blockingCapabilities)).toBe(true);
    expect(Object.isFrozen(readiness.evidenceOwnerIds)).toBe(true);
    expect(Object.isFrozen(readiness.excludedClaims)).toBe(true);
  });

  it("authenticates Alpha-22 source convergence at shared abstraction boundaries only", () => {
    const readiness = alpha22TidalConvergenceSourceCandidateReadiness();

    expect(readiness).toEqual(ALPHA22_TIDAL_CONVERGENCE_SOURCE_CANDIDATE_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "alpha22-tidal-convergence",
      scope: "bounded-starting-harbor-wave-c-integration",
      evidenceAuthenticated: true,
      historicalSliceEvidenceReady: true,
      registryCoherenceReady: true,
      reusableActivityArchetypesReady: true,
      capabilityDrivenSurfaceObservationReady: true,
      representativeEmergenceReady: true,
      boundedAbstractionFuzzReady: true,
      performanceEvidenceReady: true,
      resourceConservationReady: true,
      excludedClaimIntegrityReady: true,
      sourceCandidateReady: true,
      blockingCapabilities: [],
      publicationRecordsReady: false,
      exactTestedDeploymentVerified: false,
      liveVerified: false,
      published: false,
      fullThirtyCriterionReady: false,
      fullWaveCReady: false,
      fullDirective041Ready: false,
    });
    expect(readiness.speciesIds).toEqual(ALPHA22_TIDAL_CONVERGENCE_SPECIES);
    expect(readiness.excludedClaims).toEqual(ALPHA22_TIDAL_CONVERGENCE_EXCLUDED_CLAIMS);
    expect(readiness.excludedClaims).toEqual(expect.arrayContaining([
      "general-scent-sound-evidence",
      "worldwide-ecology",
      "full-wave-c",
      "full-directive-04-1",
    ]));
    expect(readiness.evidenceOwnerIds).toEqual([...readiness.evidenceOwnerIds].sort());
    expect(new Set(readiness.evidenceOwnerIds).size).toBe(readiness.evidenceOwnerIds.length);
    expect(readiness.evidenceOwnerIds).toEqual(expect.arrayContaining([
      "game:core-ecology-activity-affordance:v1",
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "test:alpha22-tidal-convergence-abstraction-fuzz:v1",
      "test:alpha22-tidal-convergence-performance:v1",
      "test:alpha22-tidal-convergence-source-candidate:v1",
      "test:core-ecology-tidal-table-performance:v1",
      "test:core-ecology-waterfowl-performance:v1",
      "test:runtime-core-ecology-physical-provision-conservation:v1",
    ]));
    expect(ALPHA21_RIVER_OTTER_BOUNDED_READINESS.evidenceOwnerIds.every((ownerId) => (
      readiness.evidenceOwnerIds.includes(ownerId)
    ))).toBe(true);
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.blockingCapabilities)).toBe(true);
    expect(Object.isFrozen(readiness.evidenceOwnerIds)).toBe(true);
    expect(Object.isFrozen(readiness.excludedClaims)).toBe(true);
  });

  it("authenticates Alpha-24 as one bounded domestic flock over shared owners", () => {
    const readiness = alpha24DomesticChickenBoundedReadiness();
    const releaseGate = gate("domestic-chicken");
    const state = (criterion: (typeof LIVING_SPECIES_RELEASE_CRITERIA)[number]) => (
      releaseGate.criteria.find((candidate) => candidate.criterion === criterion)
    );

    expect(readiness).toEqual(ALPHA24_DOMESTIC_CHICKEN_BOUNDED_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "alpha24-domestic-chicken",
      scope: "one-bounded-settlement-flock",
      speciesIds: ["domestic-chicken"],
      evidenceAuthenticated: true,
      speciesProfileReady: true,
      individualFlockRepresentationReady: true,
      domesticCustodyReady: true,
      habitatPlacementReady: true,
      boundedActivityReady: true,
      terrestrialLocomotionReady: true,
      lawfulPerceptionReady: true,
      flockCoordinationReady: true,
      broadClassInteractionsReady: true,
      physicalFoodConservationReady: true,
      saveMigrationReady: true,
      knowledgeHonestPresentationReady: true,
      boundedLocalContinuityReady: true,
      sharedInvariantCoverageReady: true,
      performanceEvidenceReady: true,
      ownerCoherenceReady: true,
      excludedClaimIntegrityReady: true,
      boundedCandidateReady: true,
      blockingCapabilities: [],
      publicationRecordsReady: false,
      exactTestedDeploymentVerified: false,
      published: false,
      fullThirtyCriterionReady: false,
    });
    expect(readiness.speciesIds).toEqual(ALPHA24_DOMESTIC_CHICKEN_SPECIES);
    expect(readiness.excludedClaims).toEqual(ALPHA24_DOMESTIC_CHICKEN_EXCLUDED_CLAIMS);
    expect(readiness.excludedClaims).toEqual([
      "sound",
      "environmental-evidence",
      "harmful-attack",
      "injury",
      "mortality",
      "carcasses",
      "live-prey-capture",
      "live-prey-consumption",
      "eggs",
      "nesting",
      "reproduction",
      "herding-behavior",
      "guardian-behavior",
      "full-circadian-schedules",
      "autonomous-home-return",
      "ecological-cross-region-migration",
      "worldwide-livestock",
      "full-wave-d",
      "full-directive-04-1",
    ]);
    expect(readiness.evidenceOwnerIds).toEqual([...readiness.evidenceOwnerIds].sort());
    expect(new Set(readiness.evidenceOwnerIds).size).toBe(readiness.evidenceOwnerIds.length);
    expect(readiness.evidenceOwnerIds).toEqual(expect.arrayContaining([
      "game:core-ecology-groups:v1",
      "game:core-ecology-habitat:v8",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
      "game:runtime-save:v17",
      "game:settlement-ecology:v2",
      "test:alpha24-domestic-chicken-performance:v1",
      "test:alpha24-domestic-chicken-shared-invariants:v1",
    ]));

    expect(livingSpeciesReadinessReport("domestic-chicken")).toMatchObject({
      evidenceAuthenticated: true,
      state: "blocked",
      publicReady: false,
      counts: {
        active: 22,
        foundation: 2,
        unimplemented: 6,
        notApplicable: 0,
        total: 30,
      },
      blockingCriteria: [
        "sound",
        "food-web",
        "perception-senses",
        "environmental-evidence",
        "seamless-region-crossing",
        "tutorial-truth",
        "patch-note-truth",
        "exact-tested-deployment",
      ],
    });
    expect(state("habitat-placement")).toMatchObject({
      status: "active",
      evidenceOwnerIds: expect.arrayContaining([
        "game:core-ecology-habitat:v8",
        "game:settlement-ecology:v2",
      ]),
    });
    expect(state("food-web")).toMatchObject({
      status: "foundation",
      evidenceOwnerIds: expect.arrayContaining([
        "game:core-wildlife-actor:v1",
        "game:settlement-ecology:v2",
      ]),
    });
    expect(state("perception-senses")).toMatchObject({
      status: "foundation",
      evidenceOwnerIds: expect.arrayContaining([
        "game:core-ecology-perception:v1",
        "sim:actor-perception:v2",
      ]),
    });
    for (const criterion of [
      "sound",
      "environmental-evidence",
      "seamless-region-crossing",
      "tutorial-truth",
      "patch-note-truth",
      "exact-tested-deployment",
    ] as const) {
      expect(state(criterion)).toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
    }

    const module = livingSpeciesModule("domestic-chicken");
    expect(module).toMatchObject({
      profile: {
        implementation: "active",
        taxonomicClass: "bird",
        ecologicalClasses: [
          "alarm-source",
          "domestic-livestock",
          "forager",
          "omnivore",
          "prey",
          "small-prey",
        ],
      },
      identity: { form: "individual", stableIdNamespace: "CHICKEN" },
      population: {
        materialization: "mixed",
        maxMaterializedPerRegion: 3,
        coarseSimulation: true,
      },
      habitat: {
        ownerId: "game:core-ecology-habitat:v8",
        migrationModel: "none",
      },
      activity: {
        ownerId: "game:core-wildlife-actor:v1",
        circadian: { status: "unimplemented" },
      },
      social: {
        ownerId: "game:core-ecology-groups:v1",
        actorToActorRelationships: false,
        group: {
          status: "active",
          stableIdNamespace: "CHICKEN-FLOCK",
          stableIdentity: true,
        },
        territory: { model: "none" },
      },
      sound: { implementation: "unimplemented", repertoire: [] },
      evidence: { status: "unimplemented", produces: [] },
      lifeHistory: { reproduction: "unimplemented", mortality: "unimplemented" },
      health: {
        implementation: "foundation",
        injuryAxis: null,
        incapacitation: false,
        causalDeath: false,
        recovery: false,
      },
      aftermath: { implementation: "unimplemented", carcassModel: "none" },
      inventory: { implementation: "unimplemented", acceptsCustody: false },
      about: { learnedFields: [] },
    });
    expect(module?.habitat.placementInputs).toContain("domestic-animal-anchor");
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.blockingCapabilities)).toBe(true);
    expect(Object.isFrozen(readiness.evidenceOwnerIds)).toBe(true);
    expect(Object.isFrozen(readiness.excludedClaims)).toBe(true);
  });

  it("covers chicken interactions by shared broad class and capability invariants", () => {
    const module = livingSpeciesModule("domestic-chicken");
    expect(module).not.toBeNull();
    expect(module?.interactions.targets.map(({ targetClass }) => targetClass))
      .toEqual(LIVING_SPECIES_INTERACTION_TARGET_CLASSES);

    const availableTargets = module?.interactions.targets.filter(({ policy }) => (
      policy === "available"
    )) ?? [];
    expect(availableTargets.map(({ targetClass }) => targetClass)).toEqual([
      "dog",
      "food",
      "human",
      "predator",
      "same-species",
    ]);
    expect(module?.interactions.targets.every(({ policy }) => (
      policy === "available" || policy === "intentional-no-response"
    ))).toBe(true);
    expect(module?.interactions.targets.flatMap(({ verbs }) => verbs).some((verb) => (
      verb === "attack" || verb === "capture" || verb === "consume" || verb === "kill"
    ))).toBe(false);
    expect(module?.interactions.targets.find(({ targetClass }) => targetClass === "food"))
      .toMatchObject({
        policy: "available",
        verbs: ["forage"],
        escalationConstraints: expect.arrayContaining([
          "direct-confirmation",
          "physical-resource-conservation",
        ]),
      });
    expect(module?.interactions.targets.find(({ targetClass }) => (
      targetClass === "same-species"
    ))).toMatchObject({
      policy: "available",
      verbs: ["alarm", "coordinate"],
      escalationConstraints: expect.arrayContaining([
        "direct-perception-required",
        "shared-group-required",
      ]),
    });

    const behaviorOwners = [
      module?.activity.ownerId,
      module?.cognition.ownerId,
      module?.interactions.ownerId,
      module?.population.ownerId,
    ];
    expect(behaviorOwners).toEqual([
      "game:core-wildlife-actor:v1",
      "game:core-wildlife-actor:v1",
      "game:core-wildlife-actor:v1",
      "game:core-wildlife-actor:v1",
    ]);
    expect(module?.social.ownerId).toBe("game:core-ecology-groups:v1");
    expect(module?.interactions.ownerId).not.toMatch(/chicken/iu);
  });

  it("authenticates Alpha-25 as one shared domestic flock-and-herd source unit", () => {
    const readiness = alpha25SharedDomesticLivestockReadiness();

    expect(readiness).toEqual(ALPHA25_SHARED_DOMESTIC_LIVESTOCK_READINESS);
    expect(readiness).toMatchObject({
      version: 1,
      unitId: "alpha25-shared-domestic-livestock",
      scope: "bounded-settlement-flock-and-herd",
      speciesIds: ["domestic-chicken", "domestic-goat"],
      evidenceAuthenticated: true,
      historicalChickenBaselineReady: true,
      speciesProfilesReady: true,
      exactBoundedPopulationReady: true,
      pluralCustodyAndHomesReady: true,
      habitatSeparationReady: true,
      sharedActorAbstractionsReady: true,
      broadClassInteractionsReady: true,
      physicalResourceBoundaryReady: true,
      persistenceAndPresentationReady: true,
      sharedInvariantCoverageReady: true,
      performanceEvidenceReady: true,
      excludedClaimIntegrityReady: true,
      boundedCandidateReady: true,
      blockingCapabilities: [],
      publicationRecordsReady: false,
      exactTestedDeploymentVerified: false,
      liveVerified: false,
      published: false,
      fullThirtyCriterionReady: false,
      fullWaveDReady: false,
      fullDirective041Ready: false,
    });
    expect(readiness.speciesIds).toEqual(ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES);
    expect(readiness.excludedClaims)
      .toEqual(ALPHA25_SHARED_DOMESTIC_LIVESTOCK_EXCLUDED_CLAIMS);
    expect(readiness.excludedClaims).toEqual(expect.arrayContaining([
      "goat-store-food-use",
      "living-foliage-browsing",
      "mortality",
      "sound",
      "environmental-evidence",
      "worldwide-livestock",
    ]));
    expect(readiness.evidenceOwnerIds).toEqual([...readiness.evidenceOwnerIds].sort());
    expect(new Set(readiness.evidenceOwnerIds).size).toBe(readiness.evidenceOwnerIds.length);
    expect(readiness.evidenceOwnerIds).toEqual(expect.arrayContaining([
      "game:core-ecology-habitat:v9",
      "game:core-wildlife-resource-claim-arbitration:v1",
      "game:runtime-save:v18",
      "game:settlement-ecology:v3",
      "test:alpha25-shared-domestic-livestock-invariants:v1",
      "test:alpha25-shared-domestic-livestock-performance:v1",
      "test:alpha25-shared-domestic-livestock-source-candidate:v1",
    ]));
    expect(livingSpeciesReadinessReport("domestic-goat")).toMatchObject({
      evidenceAuthenticated: true,
      state: "blocked",
      publicReady: false,
      counts: {
        active: 22,
        foundation: 2,
        unimplemented: 6,
        notApplicable: 0,
        total: 30,
      },
      blockingCriteria: [
        "sound",
        "food-web",
        "perception-senses",
        "environmental-evidence",
        "seamless-region-crossing",
        "tutorial-truth",
        "patch-note-truth",
        "exact-tested-deployment",
      ],
    });
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.speciesIds)).toBe(true);
    expect(Object.isFrozen(readiness.blockingCapabilities)).toBe(true);
    expect(Object.isFrozen(readiness.evidenceOwnerIds)).toBe(true);
    expect(Object.isFrozen(readiness.excludedClaims)).toBe(true);
  });

  it("extends livestock through shared properties, not a species-pair matrix", () => {
    const modules = ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES.map((species) => {
      const module = livingSpeciesModule(species);
      if (module === null) throw new Error(`Missing domestic module ${species}`);
      return module;
    });

    expect(modules).toHaveLength(2);
    for (const module of modules) {
      expect(module.interactions.targets.map(({ targetClass }) => targetClass))
        .toEqual(LIVING_SPECIES_INTERACTION_TARGET_CLASSES);
      expect(module.interactions.targets).toHaveLength(
        LIVING_SPECIES_INTERACTION_TARGET_CLASSES.length,
      );
      expect(module.interactions.targets.flatMap(({ verbs }) => verbs).some((verb) => (
        verb === "attack" || verb === "capture" || verb === "consume" || verb === "kill"
      ))).toBe(false);
      expect(module.activity.ownerId).toBe("game:core-wildlife-actor:v1");
      expect(module.cognition.ownerId).toBe("game:core-wildlife-actor:v1");
      expect(module.interactions.ownerId).toBe("game:core-wildlife-actor:v1");
      expect(module.population.ownerId).toBe("game:core-wildlife-actor:v1");
      expect(module.social.ownerId).toBe("game:core-ecology-groups:v1");
      expect(module.locomotion.ownerId).toBe(
        "game:core-wildlife-locomotion-profile:v1",
      );
      expect(module.interactions.ownerId).not.toMatch(/chicken|goat/iu);
    }

    const goat = modules.find(({ speciesId }) => speciesId === "domestic-goat");
    expect(goat).toMatchObject({
      identity: { stableIdNamespace: "GOAT" },
      population: { maxMaterializedPerRegion: 2 },
      habitat: {
        ownerId: "game:core-ecology-habitat:v9",
        habitatClasses: ["livestock-pen", "settlement-edge"],
      },
      social: {
        group: {
          organizationKinds: ["herd"],
          stableIdNamespace: "HERD",
          stableIdentity: true,
        },
      },
      sound: { implementation: "unimplemented", repertoire: [] },
      evidence: { status: "unimplemented", produces: [] },
      lifeHistory: { mortality: "unimplemented", reproduction: "unimplemented" },
      aftermath: { implementation: "unimplemented", carcassModel: "none" },
    });
    expect(goat?.diet.resources).toEqual([{ resourceClass: "browse", role: "nutrition" }]);
  });

  it("keeps mortality, carcasses, living cover, and circadian schedules explicit future work", () => {
    for (const species of ALPHA16_MARSH_EDGE_SPECIES) {
      const module = livingSpeciesModule(species);
      expect(module).not.toBeNull();
      expect(module?.lifeHistory).toMatchObject({
        implementation: "foundation",
        dynamicAging: false,
        reproduction: "unimplemented",
        mortality: "unimplemented",
      });
      expect(module?.health).toMatchObject({
        implementation: "foundation",
        incapacitation: false,
        causalDeath: false,
        recovery: false,
      });
      expect(module?.aftermath).toMatchObject({
        implementation: "unimplemented",
        ownerId: null,
        carcassModel: "none",
        persistentIdentity: false,
      });
      expect(module?.environment.livingCover).toEqual({
        status: "unimplemented",
        ownerId: null,
        inputs: [],
        outputs: [],
      });
      expect(module?.activity.circadian).toEqual({
        status: "unimplemented",
        ownerId: null,
        rhythm: "unspecified",
        cadenceTicks: 0,
        phaseBias: 0,
      });
    }
  });

  it("authenticates landed Settlement Shadows capabilities without closing deferred systems", () => {
    for (const species of ["brown-rat", "domestic-cat"] as const) {
      const releaseGate = gate(species);
      const state = (criterion: (typeof LIVING_SPECIES_RELEASE_CRITERIA)[number]) => (
        releaseGate.criteria.find((candidate) => candidate.criterion === criterion)
      );

      expect(state("species-profile")).toMatchObject({
        status: "active",
        evidenceOwnerIds: species === "brown-rat"
          ? [
              "game:core-ecology:v3",
              "game:living-species-catalog:v1",
              "sim:core-wildlife-identity:v1",
            ]
          : ["game:living-species-catalog:v1", "sim:core-wildlife-identity:v1"],
      });
      expect(state("ecological-niche")?.status).toBe("active");
      expect(state("food-web")?.status).toBe("foundation");
      expect(state("perception-senses")).toMatchObject({
        status: "foundation",
        evidenceOwnerIds: species === "brown-rat"
          ? [
              "game:core-ecology-aggregate-perception:v1",
              "game:core-ecology-small-world:v2",
              "game:living-actor-senses:v1",
              "sim:actor-perception:v2",
            ]
          : [
              "game:core-ecology-perception:v1",
              "game:living-actor-senses:v1",
              "sim:actor-perception:v2",
            ],
      });
      expect(state("clone-diversity")).toMatchObject({
        status: "active",
        evidenceOwnerIds: species === "brown-rat"
          ? ["game:core-ecology:v3", "sim:core-wildlife-identity:v1"]
          : ["sim:core-wildlife-identity:v1"],
      });
      for (const criterion of [
        "appearance",
        "sound",
        "habitat-placement",
        "locomotion",
        "dog-interaction",
        "about-disclosure",
        "population-materialization",
        "save-load",
        "accessibility",
      ] as const) {
        expect(state(criterion)?.status).toBe("active");
      }
      expect(state("performance-budget")).toMatchObject({
        status: "active",
        evidenceOwnerIds: [
          "game:core-ecology-aggregate-perception:v1",
          "game:core-ecology-habitat:v2",
          "game:core-ecology:v3",
          "game:runtime-core-ecology:v1",
          "test:core-ecology-settlement-shadows-performance:v1",
        ],
      });
      expect(state("mobile-parity")).toMatchObject({
        status: "active",
        evidenceOwnerIds: [
          "game:wildlife-about:v1",
          "game:wildlife-presentation:v1",
          "test:core-ecology-settlement-shadows-mobile:v1",
        ],
      });
      expect(state("same-species-interaction")).toMatchObject(species === "brown-rat"
        ? {
            status: "active",
            evidenceOwnerIds: ["game:core-ecology-small-world:v2"],
          }
        : {
            status: "active",
            evidenceOwnerIds: [
              "game:core-ecology-perception:v1",
              "game:core-wildlife-actor:v1",
            ],
          });
      expect(state("tutorial-truth")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["ui:tutorial-guide:v25"],
      });
      expect(state("patch-note-truth")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["content:patch-notes-alpha15:v1"],
      });
      expect(state("exact-tested-deployment"))
        .toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
    }
    expect(gate("brown-rat").criteria.find(({ criterion }) => (
      criterion === "environmental-evidence"
    ))).toMatchObject({ status: "active" });
    expect(gate("brown-rat").criteria.find(({ criterion }) => (
      criterion === "seamless-region-crossing"
    ))).toMatchObject({ status: "foundation" });
    expect(gate("brown-rat").criteria.find(({ criterion }) => (
      criterion === "full-coarse-transition"
    ))).toMatchObject({ status: "foundation" });
    expect(gate("domestic-cat").criteria.find(({ criterion }) => (
      criterion === "environmental-evidence"
    ))).toMatchObject({
      status: "active",
      evidenceOwnerIds: [
        "game:core-ecology-evidence-runtime:v1",
        "game:core-wildlife-actor:v1",
        "game:wildlife-presentation:v1",
      ],
    });
    expect(gate("domestic-cat").criteria.find(({ criterion }) => (
      criterion === "seamless-region-crossing"
    ))).toMatchObject({ status: "active" });
    expect(gate("domestic-cat").criteria.find(({ criterion }) => (
      criterion === "full-coarse-transition"
    ))).toMatchObject({ status: "active" });
  });

  it("authenticates bounded Wave-A habitat and population evidence without future claims", () => {
    for (const species of ["deer", "gull", "black-bear"] as const) {
      const releaseGate = gate(species);
      const state = (criterion: (typeof LIVING_SPECIES_RELEASE_CRITERIA)[number]) => (
        releaseGate.criteria.find((candidate) => candidate.criterion === criterion)
      );

      expect(state("habitat-placement")).toMatchObject({
        status: "active",
        evidenceOwnerIds: [
          "game:core-ecology-habitat:v1",
          "game:runtime-core-ecology:v1",
        ],
      });
      expect(state("population-materialization")).toMatchObject({ status: "active" });
      expect(state("full-coarse-transition")).toMatchObject({ status: "active" });
      expect(state("save-load")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["game:core-ecology:v2", "game:runtime-save:v9"],
      });
      expect(state("mobile-parity")).toMatchObject({ status: "active" });
      expect(state("tutorial-truth")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["ui:tutorial-guide:v24"],
      });
      expect(state("patch-note-truth")).toMatchObject({
        status: "active",
        evidenceOwnerIds: ["content:patch-notes-alpha14:v1"],
      });
      expect(state("exact-tested-deployment")).toMatchObject({
        status: "unimplemented",
        evidenceOwnerIds: [],
      });
      expect(state("performance-budget")).toMatchObject({ status: "foundation" });
      expect(state("perception-senses")).toMatchObject({ status: "foundation" });
      expect(state("sound")).toEqual(expect.objectContaining({
        status: "unimplemented",
        evidenceOwnerIds: [],
      }));
      expect(state("environmental-evidence")).toEqual(expect.objectContaining({
        status: "unimplemented",
        evidenceOwnerIds: [],
      }));
    }

    for (const species of ["deer", "gull"] as const) {
      const releaseGate = gate(species);
      expect(releaseGate.criteria.find(({ criterion }) => criterion === "same-species-interaction"))
        .toMatchObject({
          status: "active",
          evidenceOwnerIds: ["game:core-ecology-groups:v1"],
        });
      expect(releaseGate.criteria.find(({ criterion }) => criterion === "player-independent-scenario"))
        .toMatchObject({
          status: "active",
          evidenceOwnerIds: ["game:core-ecology-groups:v1", "game:core-ecology:v2"],
        });
    }

    const bear = gate("black-bear");
    expect(bear.criteria.find(({ criterion }) => criterion === "same-species-interaction"))
      .toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
    expect(bear.criteria.find(({ criterion }) => criterion === "player-independent-scenario"))
      .toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
  });

  it("fails closed on incomplete, reordered, extra, or unregistered claims", () => {
    const dog = gate("domestic-dog");
    expect(canonicalizeLivingSpeciesReleaseGate({ ...dog, criteria: dog.criteria.slice(1) })).toBeNull();
    expect(canonicalizeLivingSpeciesReleaseGate({ ...dog, criteria: [...dog.criteria].reverse() })).toBeNull();
    expect(canonicalizeLivingSpeciesReleaseGate({ ...dog, ready: true })).toBeNull();
    expect(canonicalizeLivingSpeciesReleaseGate({
      ...dog,
      speciesId: "wolf",
      moduleId: "living-species:wolf:v1",
    })).toBeNull();
    expect(canonicalizeLivingSpeciesReleaseGate({
      ...dog,
      criteria: dog.criteria.map((criterion, index) => index === 0
        ? { ...criterion, privateNote: "trust me" }
        : criterion),
    })).toBeNull();
  });

  it("requires canonical evidence owners for active and foundation claims", () => {
    const human = gate("human");
    const profileIndex = human.criteria.findIndex(({ criterion }) => criterion === "species-profile");
    const noEvidence = human.criteria.map((criterion, index) => index === profileIndex
      ? { ...criterion, evidenceOwnerIds: [] }
      : criterion);
    expect(canonicalizeLivingSpeciesReleaseGate({ ...human, criteria: noEvidence })).toBeNull();

    const duplicatedEvidence = human.criteria.map((criterion, index) => index === profileIndex
      ? { ...criterion, evidenceOwnerIds: [criterion.evidenceOwnerIds[0], criterion.evidenceOwnerIds[0]] }
      : criterion);
    expect(canonicalizeLivingSpeciesReleaseGate({ ...human, criteria: duplicatedEvidence })).toBeNull();
  });

  it("prevents unimplemented criteria from smuggling implementation evidence", () => {
    const dog = gate("domestic-dog");
    const soundIndex = dog.criteria.findIndex(({ criterion }) => criterion === "sound");
    const criteria = dog.criteria.map((criterion, index) => index === soundIndex
      ? { ...criterion, evidenceOwnerIds: ["game:dog-sound:v1"] }
      : criterion);
    expect(canonicalizeLivingSpeciesReleaseGate({ ...dog, criteria })).toBeNull();
  });

  it("permits N/A only with a criterion-specific ecological proof", () => {
    const dog = gate("domestic-dog");
    const mobileIndex = dog.criteria.findIndex(({ criterion }) => criterion === "mobile-parity");
    const abusive = dog.criteria.map((criterion, index) => index === mobileIndex
      ? {
          ...criterion,
          status: "not-applicable",
          notApplicable: {
            reason: "no-dog-ecological-overlap",
            ecologyOwnerId: "sim:dog-ecology:v1",
          },
        }
      : criterion);
    expect(canonicalizeLivingSpeciesReleaseGate({ ...dog, criteria: abusive })).toBeNull();

    const soundIndex = dog.criteria.findIndex(({ criterion }) => criterion === "sound");
    const ecologicallyValidShape = dog.criteria.map((criterion, index) => index === soundIndex
      ? {
          ...criterion,
          status: "not-applicable",
          notApplicable: {
            reason: "biologically-silent",
            ecologyOwnerId: "sim:species-ecology:v1",
          },
        }
      : criterion);
    expect(canonicalizeLivingSpeciesReleaseGate({ ...dog, criteria: ecologicallyValidShape }))
      .not.toBeNull();
    expect(auditLivingSpeciesReleaseGate({ ...dog, criteria: ecologicallyValidShape }))
      .toMatchObject({ evidenceAuthenticated: false, state: "invalid-claim", publicReady: false });

    for (const required of ["locomotion", "full-coarse-transition", "seamless-region-crossing"] as const) {
      const index = dog.criteria.findIndex(({ criterion }) => criterion === required);
      const skipped = dog.criteria.map((criterion, criterionIndex) => criterionIndex === index
        ? {
            ...criterion,
            status: "not-applicable",
            notApplicable: {
              reason: "sessile-life-history",
              ecologyOwnerId: "sim:species-ecology:v1",
            },
          }
        : criterion);
      expect(canonicalizeLivingSpeciesReleaseGate({ ...dog, criteria: skipped })).toBeNull();
    }
  });

  it("does not trust a structurally valid all-active readiness claim", () => {
    const dog = gate("domestic-dog");
    const criteria = dog.criteria.map((criterion) => ({
      ...criterion,
      status: "active" as const,
      evidenceOwnerIds: criterion.evidenceOwnerIds.length > 0
        ? criterion.evidenceOwnerIds
        : ["game:living-species-catalog:v1"],
      notApplicable: null,
    }));
    const forged = { ...dog, criteria };

    expect(canonicalizeLivingSpeciesReleaseGate(forged)).not.toBeNull();
    expect(auditLivingSpeciesReleaseGate(forged)).toMatchObject({
      evidenceAuthenticated: false,
      state: "invalid-claim",
      publicReady: false,
    });
  });

  it("sorts gate sets and rejects duplicate species/module claims", () => {
    const human = gate("human");
    const dog = gate("domestic-dog");
    expect(createLivingSpeciesReleaseGateSet([human, dog])).toEqual(
      createLivingSpeciesReleaseGateSet([dog, human]),
    );
    expect(createLivingSpeciesReleaseGateSet([dog, dog])).toBeNull();
    expect(canonicalizeLivingSpeciesReleaseGateSet(LIVING_SPECIES_RELEASE_GATES))
      .toEqual(LIVING_SPECIES_RELEASE_GATES);
    expect(canonicalizeLivingSpeciesReleaseGateSet({
      ...LIVING_SPECIES_RELEASE_GATES,
      gates: [...LIVING_SPECIES_RELEASE_GATES.gates].reverse(),
    })).toBeNull();
  });

  it("keeps foundation evidence visibly distinct from active release proof", () => {
    const dog = gate("domestic-dog");
    expect(dog.criteria.find(({ criterion }) => criterion === "species-profile"))
      .toMatchObject({ status: "foundation" });
    expect(dog.criteria.find(({ criterion }) => criterion === "save-load"))
      .toMatchObject({ status: "foundation" });
    expect(dog.criteria.find(({ criterion }) => criterion === "exact-tested-deployment"))
      .toMatchObject({ status: "unimplemented", evidenceOwnerIds: [] });
  });
});
