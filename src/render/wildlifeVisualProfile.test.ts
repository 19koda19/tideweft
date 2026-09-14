import { describe, expect, it } from "vitest";

import {
  CORE_WILDLIFE_SPECIES,
  getCoreWildlifeProfile,
} from "../sim/coreWildlifeIdentity";
import { isCoreEcologyAggregateSpecies } from "../game/coreEcologyAggregatePolicy";
import {
  WILDLIFE_VISUAL_PROFILES,
  isWildlifeVisualSpecies,
  wildlifeVisualPalette,
  wildlifeVisualProfile,
} from "./wildlifeVisualProfile";

export const ALPHA37_ESTUARY_BREADTH_PRESENTATION_INVARIANTS_OWNER_INTENT =
  "test:alpha37-estuary-breadth-presentation-invariants:v1" as const;

describe(`${ALPHA37_ESTUARY_BREADTH_PRESENTATION_INVARIANTS_OWNER_INTENT} profile-driven wildlife visual forms`, () => {
  it("covers every addressable body once while rejecting aggregate-only profiles", () => {
    // Flock actors such as gulls are addressable even though their identity
    // metadata describes an aggregate body. The ecology aggregate registry is
    // the authoritative boundary for evidence-only populations.
    const individuals = CORE_WILDLIFE_SPECIES.filter((species) => (
      !isCoreEcologyAggregateSpecies(species)
    ));
    const aggregates = CORE_WILDLIFE_SPECIES.filter(isCoreEcologyAggregateSpecies);

    expect(Object.keys(WILDLIFE_VISUAL_PROFILES).sort()).toEqual([...individuals].sort());
    for (const species of individuals) {
      expect(isWildlifeVisualSpecies(species)).toBe(true);
      if (!isWildlifeVisualSpecies(species)) throw new Error(`${species} needs a visual profile`);
      const visual = wildlifeVisualProfile(species);
      expect(visual.hitRadiusScale).toBeGreaterThan(0);
      expect(visual.ringRadiusScale).toBeGreaterThan(0);
      expect(visual.labelLift).toBeGreaterThan(0);
      expect(Object.isFrozen(visual.colors)).toBe(true);
    }
    for (const species of aggregates) expect(isWildlifeVisualSpecies(species)).toBe(false);
  });

  it.each([
    ["great-blue-heron", "long-necked-wader", "heron"],
    ["common-tern", "shorebird-flock", "tern"],
    ["osprey", "broad-winged-raptor", "osprey"],
  ] as const)("maps %s through a reusable geometry family and every authenticated morph", (
    species,
    form,
    geometryVariant,
  ) => {
    expect(isWildlifeVisualSpecies(species)).toBe(true);
    if (!isWildlifeVisualSpecies(species)) throw new Error(`${species} needs a visual profile`);
    expect(wildlifeVisualProfile(species)).toMatchObject({ form, geometryVariant });
    for (const morph of getCoreWildlifeProfile(species).morphs) {
      const colors = wildlifeVisualPalette(species, morph);
      expect(Object.isFrozen(colors)).toBe(true);
      expect(new Set([colors.primary, colors.secondary, colors.dark]).size)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it("preserves established and new silhouette-family reuse instead of taxonomy switches", () => {
    expect(wildlifeVisualProfile("gull").form)
      .toBe(wildlifeVisualProfile("common-tern").form);
    expect(wildlifeVisualProfile("snowy-egret").form)
      .toBe(wildlifeVisualProfile("great-blue-heron").form);
    expect(wildlifeVisualProfile("golden-eagle").form)
      .toBe(wildlifeVisualProfile("osprey").form);
  });
});
