import { describe, expect, it } from "vitest";

import {
  LIVING_SPECIES_INTERACTION_TARGET_CLASSES,
  livingSpeciesModule,
} from "./livingSpeciesCatalog";
import {
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES,
  alpha25SharedDomesticLivestockReadiness,
} from "./livingSpeciesReleaseGate";

/** Executable owner named by the Alpha-25 readiness evidence graph. */
export const OWNER_INTENT =
  "test:alpha25-shared-domestic-livestock-invariants:v1" as const;

describe("Alpha-25 shared domestic-livestock invariants", () => {
  it("binds flock and herd declarations to the same fail-closed actor abstractions", () => {
    const readiness = alpha25SharedDomesticLivestockReadiness();
    expect(readiness.evidenceOwnerIds).toContain(OWNER_INTENT);

    for (const species of ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES) {
      const module = livingSpeciesModule(species);
      const policy = coreEcologySpeciesRuntimePolicy(species);
      if (module === null || policy === null) {
        throw new Error(`Missing shared domestic-livestock contract for ${species}`);
      }

      expect(module.activity.ownerId).toBe("game:core-wildlife-actor:v1");
      expect(module.cognition.ownerId).toBe("game:core-wildlife-actor:v1");
      expect(module.interactions.ownerId).toBe("game:core-wildlife-actor:v1");
      expect(module.social.ownerId).toBe("game:core-ecology-groups:v1");
      expect(module.locomotion.ownerId)
        .toBe("game:core-wildlife-locomotion-profile:v1");
      expect(module.interactions.targets.map(({ targetClass }) => targetClass))
        .toEqual(LIVING_SPECIES_INTERACTION_TARGET_CLASSES);
      expect(module.interactions.targets.flatMap(({ verbs }) => verbs))
        .not.toEqual(expect.arrayContaining(["attack", "capture", "consume", "kill"]));
      expect(coreEcologySpeciesHasRuntimeCapability(species, "actor-address")).toBe(true);
      expect(coreEcologySpeciesHasRuntimeCapability(species, "group-coordination")).toBe(true);
      expect(coreEcologySpeciesHasRuntimeCapability(species, "shared-alarm")).toBe(true);
    }

    const goat = livingSpeciesModule("domestic-goat");
    expect(coreEcologySpeciesHasRuntimeCapability("domestic-goat", "food-investigation"))
      .toBe(false);
    expect(goat?.diet.resources).toEqual([{ resourceClass: "browse", role: "nutrition" }]);
    expect(goat?.diet.resources.some(({ resourceClass }) => (
      resourceClass === "exposed-food"
    ))).toBe(false);
  });
});
