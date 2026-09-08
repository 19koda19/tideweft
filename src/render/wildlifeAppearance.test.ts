import { describe, expect, it } from "vitest";

import {
  ALPHA30_WILDLIFE_APPEARANCE_PALETTES,
  ALPHA30_WILDLIFE_APPEARANCE_SPECIES,
  DOMESTIC_GOAT_APPEARANCE_PALETTES,
  alpha30WildlifeAppearancePalette,
  domesticGoatAppearancePalette,
} from "./wildlifeAppearance";

describe("shared wildlife appearance projection", () => {
  it("resolves one authenticated goat morph to one immutable renderer-neutral palette", () => {
    const pied = domesticGoatAppearancePalette("pied-coated");

    expect(pied).toBe(DOMESTIC_GOAT_APPEARANCE_PALETTES["pied-coated"]);
    expect(pied).toEqual({
      primary: "#e2d6bc",
      secondary: "#55463b",
      dark: "#211c19",
      accent: "#b99d72",
    });
    expect(Object.isFrozen(pied)).toBe(true);
  });

  it("covers every authored Alpha 30 morph with one immutable shared palette", () => {
    const expectedMorphs = {
      "wild-boar": ["bristled-black", "dark-brown", "grizzled", "rufous-brown"],
      elk: ["dark-maned", "golden-brown", "pale-rumped", "winter-gray"],
      "gray-wolf": ["charcoal-gray", "grizzled-gray", "pale-gray", "tawny-gray"],
    } as const;

    for (const species of ALPHA30_WILDLIFE_APPEARANCE_SPECIES) {
      expect(Object.keys(ALPHA30_WILDLIFE_APPEARANCE_PALETTES[species]).sort()).toEqual(
        [...expectedMorphs[species]].sort(),
      );
      for (const morph of expectedMorphs[species]) {
        const resolved = alpha30WildlifeAppearancePalette(species, morph);
        expect(resolved).toBe(
          (ALPHA30_WILDLIFE_APPEARANCE_PALETTES[species] as Record<
            string,
            typeof resolved
          >)[morph],
        );
        expect(Object.isFrozen(resolved)).toBe(true);
      }
    }

    expect(alpha30WildlifeAppearancePalette("wild-boar", "unknown-morph")).toBe(
      ALPHA30_WILDLIFE_APPEARANCE_PALETTES["wild-boar"]["dark-brown"],
    );
    expect(alpha30WildlifeAppearancePalette("elk", "unknown-morph")).toBe(
      ALPHA30_WILDLIFE_APPEARANCE_PALETTES.elk["golden-brown"],
    );
    expect(alpha30WildlifeAppearancePalette("gray-wolf", "unknown-morph")).toBe(
      ALPHA30_WILDLIFE_APPEARANCE_PALETTES["gray-wolf"]["grizzled-gray"],
    );
  });
});
