import { describe, expect, it } from "vitest";

import {
  ALPINE_WILDLIFE_APPEARANCE_PALETTES,
  ALPINE_WILDLIFE_APPEARANCE_SPECIES,
  ALPHA30_WILDLIFE_APPEARANCE_PALETTES,
  ALPHA30_WILDLIFE_APPEARANCE_SPECIES,
  ALPHA31_PREDATOR_APPEARANCE_PALETTES,
  DOMESTIC_GOAT_APPEARANCE_PALETTES,
  REGIONAL_UPLAND_WILDLIFE_APPEARANCE_SPECIES,
  alpha30WildlifeAppearancePalette,
  alpineWildlifeAppearancePalette,
  domesticGoatAppearancePalette,
  regionalUplandWildlifeAppearancePalette,
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

  it("appends the distinct predator duo to the frozen upland palette prefix", () => {
    expect(REGIONAL_UPLAND_WILDLIFE_APPEARANCE_SPECIES.slice(
      0,
      ALPHA30_WILDLIFE_APPEARANCE_SPECIES.length,
    )).toEqual(ALPHA30_WILDLIFE_APPEARANCE_SPECIES);
    expect(REGIONAL_UPLAND_WILDLIFE_APPEARANCE_SPECIES.slice(-2)).toEqual([
      "cougar",
      "brown-bear",
    ]);

    expect(regionalUplandWildlifeAppearancePalette("cougar", "warm-tawny"))
      .toBe(ALPHA31_PREDATOR_APPEARANCE_PALETTES.cougar["warm-tawny"]);
    expect(regionalUplandWildlifeAppearancePalette("brown-bear", "grizzled-brown"))
      .toBe(ALPHA31_PREDATOR_APPEARANCE_PALETTES["brown-bear"]["grizzled-brown"]);
    expect(regionalUplandWildlifeAppearancePalette("cougar", "unknown-morph"))
      .toBe(ALPHA31_PREDATOR_APPEARANCE_PALETTES.cougar["warm-tawny"]);
    expect(regionalUplandWildlifeAppearancePalette("brown-bear", "unknown-morph"))
      .toBe(ALPHA31_PREDATOR_APPEARANCE_PALETTES["brown-bear"]["dark-brown"]);
  });

  it("covers every addressable alpine morph without creating a pika body palette", () => {
    const expectedMorphs = {
      "mountain-goat": ["bright-white", "cream-white", "gray-white", "winter-white"],
      "golden-eagle": ["dark-gold", "golden-naped", "mottled-brown", "pale-gold"],
    } as const;

    expect(ALPINE_WILDLIFE_APPEARANCE_SPECIES).toEqual([
      "mountain-goat",
      "golden-eagle",
    ]);
    expect(ALPINE_WILDLIFE_APPEARANCE_SPECIES).not.toContain("american-pika");
    for (const species of ALPINE_WILDLIFE_APPEARANCE_SPECIES) {
      expect(Object.keys(ALPINE_WILDLIFE_APPEARANCE_PALETTES[species]).sort())
        .toEqual([...expectedMorphs[species]].sort());
      for (const morph of expectedMorphs[species]) {
        const resolved = alpineWildlifeAppearancePalette(species, morph);
        expect(resolved).toBe(
          (ALPINE_WILDLIFE_APPEARANCE_PALETTES[species] as Record<
            string,
            typeof resolved
          >)[morph],
        );
        expect(Object.isFrozen(resolved)).toBe(true);
      }
    }
    expect(alpineWildlifeAppearancePalette("mountain-goat", "unknown-morph"))
      .toBe(ALPINE_WILDLIFE_APPEARANCE_PALETTES["mountain-goat"]["cream-white"]);
    expect(alpineWildlifeAppearancePalette("golden-eagle", "unknown-morph"))
      .toBe(ALPINE_WILDLIFE_APPEARANCE_PALETTES["golden-eagle"]["golden-naped"]);
  });
});
