import { describe, expect, it } from "vitest";

import { LIVING_SPECIES_CATALOG } from "./livingSpeciesCatalog";
import type { LivingActorSpecies } from "./livingSpeciesRegistry";
import {
  LIVING_SPECIES_RELEASE_CRITERIA,
  LIVING_SPECIES_RELEASE_GATES,
  auditLivingSpeciesReleaseGate,
  canonicalizeLivingSpeciesReleaseGate,
  canonicalizeLivingSpeciesReleaseGateSet,
  createLivingSpeciesReleaseGateSet,
  livingSpeciesReadinessReport,
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
    expect(livingSpeciesReadinessReport("wolf")).toBeNull();
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
