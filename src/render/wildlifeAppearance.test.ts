import { describe, expect, it } from "vitest";

import { getCoreWildlifeProfile } from "../sim/coreWildlifeIdentity";
import {
  ALPINE_WILDLIFE_APPEARANCE_PALETTES,
  ALPINE_WILDLIFE_APPEARANCE_SPECIES,
  ALPHA30_WILDLIFE_APPEARANCE_PALETTES,
  ALPHA30_WILDLIFE_APPEARANCE_SPECIES,
  ALPHA31_PREDATOR_APPEARANCE_PALETTES,
  COLD_SHORE_WILDLIFE_APPEARANCE_PALETTES,
  COLD_SHORE_WILDLIFE_APPEARANCE_SPECIES,
  DOMESTIC_GOAT_APPEARANCE_PALETTES,
  ESTUARY_SURFACE_WILDLIFE_APPEARANCE_PALETTES,
  ESTUARY_SURFACE_WILDLIFE_APPEARANCE_SPECIES,
  MARSH_CHANNEL_WILDLIFE_APPEARANCE_PALETTES,
  MARSH_CHANNEL_WILDLIFE_APPEARANCE_SPECIES,
  POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES,
  POLAR_MARINE_WILDLIFE_APPEARANCE_SPECIES,
  REGIONAL_UPLAND_WILDLIFE_APPEARANCE_SPECIES,
  SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_PALETTES,
  SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_SPECIES,
  alpha30WildlifeAppearancePalette,
  alpineWildlifeAppearancePalette,
  coldShoreWildlifeAppearancePalette,
  domesticGoatAppearancePalette,
  estuarySurfaceWildlifeAppearancePalette,
  marshChannelWildlifeAppearancePalette,
  polarMarineWildlifeAppearancePalette,
  regionalUplandWildlifeAppearancePalette,
  saltmarshSmallWorldsWildlifeAppearancePalette,
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

  it("maps every Arctic-fox coat through the shared immutable cold-shore palette", () => {
    const profile = getCoreWildlifeProfile("arctic-fox");
    const palettes = COLD_SHORE_WILDLIFE_APPEARANCE_PALETTES["arctic-fox"] as Readonly<
      Record<string, unknown>
    >;

    expect(COLD_SHORE_WILDLIFE_APPEARANCE_SPECIES).toEqual(["arctic-fox"]);
    expect(COLD_SHORE_WILDLIFE_APPEARANCE_SPECIES).not.toContain("atlantic-capelin");
    expect(Object.keys(COLD_SHORE_WILDLIFE_APPEARANCE_PALETTES["arctic-fox"]).sort())
      .toEqual([...profile.morphs].sort());
    for (const morph of profile.morphs) {
      const resolved = coldShoreWildlifeAppearancePalette("arctic-fox", morph);
      expect(resolved).toBe(palettes[morph]);
      expect(Object.isFrozen(resolved)).toBe(true);
    }
    expect(coldShoreWildlifeAppearancePalette("arctic-fox", "unknown-morph"))
      .toBe(COLD_SHORE_WILDLIFE_APPEARANCE_PALETTES["arctic-fox"].white);
  });

  it("covers addressable polar-shore morphs with species-safe, high-contrast palettes", () => {
    const expectedMorphs = {
      "harbor-seal": ["dark-slate", "mottled-gray", "pale-silver", "warm-brown"],
      "polar-bear": ["cream-ivory", "pale-ivory", "weathered-white", "yellowed-ivory"],
    } as const;

    expect(POLAR_MARINE_WILDLIFE_APPEARANCE_SPECIES).toEqual([
      "harbor-seal",
      "polar-bear",
    ]);
    for (const species of POLAR_MARINE_WILDLIFE_APPEARANCE_SPECIES) {
      expect(Object.keys(POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES[species]).sort())
        .toEqual([...expectedMorphs[species]].sort());
      for (const morph of expectedMorphs[species]) {
        const resolved = polarMarineWildlifeAppearancePalette(species, morph);
        expect(resolved).toBe(
          (POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES[species] as Record<
            string,
            typeof resolved
          >)[morph],
        );
        expect(Object.isFrozen(resolved)).toBe(true);
      }
    }
    expect(polarMarineWildlifeAppearancePalette("harbor-seal", "unknown-morph"))
      .toBe(POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES["harbor-seal"]["mottled-gray"]);
    expect(polarMarineWildlifeAppearancePalette("polar-bear", "unknown-morph"))
      .toBe(POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES["polar-bear"]["cream-ivory"]);
    expect(POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES["polar-bear"]["cream-ivory"])
      .toMatchObject({ primary: "#e5dfc9", dark: "#202a2d" });
  });

  it("covers the addressable estuary-surface cluster without inventing aggregate bodies", () => {
    expect(ESTUARY_SURFACE_WILDLIFE_APPEARANCE_SPECIES).toEqual([
      "great-blue-heron",
      "common-tern",
      "osprey",
    ]);
    expect(ESTUARY_SURFACE_WILDLIFE_APPEARANCE_SPECIES).not.toContain("bay-anchovy");
    expect(ESTUARY_SURFACE_WILDLIFE_APPEARANCE_SPECIES).not.toContain("atlantic-ghost-crab");

    for (const species of ESTUARY_SURFACE_WILDLIFE_APPEARANCE_SPECIES) {
      const profile = getCoreWildlifeProfile(species);
      const palettes = ESTUARY_SURFACE_WILDLIFE_APPEARANCE_PALETTES[species] as Readonly<
        Record<string, unknown>
      >;
      expect(Object.keys(palettes).sort()).toEqual([...profile.morphs].sort());
      for (const morph of profile.morphs) {
        const resolved = estuarySurfaceWildlifeAppearancePalette(species, morph);
        expect(resolved).toBe(palettes[morph]);
        expect(Object.isFrozen(resolved)).toBe(true);
      }
      expect(estuarySurfaceWildlifeAppearancePalette(species, "unknown-morph"))
        .toBeDefined();
    }
  });

  it("covers the marsh-channel bird bodies while leaving aquatic populations as evidence", () => {
    expect(MARSH_CHANNEL_WILDLIFE_APPEARANCE_SPECIES).toEqual([
      "greater-yellowlegs",
      "belted-kingfisher",
      "double-crested-cormorant",
    ]);
    for (const aggregate of [
      "atlantic-menhaden",
      "mummichog",
      "grass-shrimp",
      "blue-crab",
    ]) {
      expect(MARSH_CHANNEL_WILDLIFE_APPEARANCE_SPECIES).not.toContain(aggregate);
    }

    for (const species of MARSH_CHANNEL_WILDLIFE_APPEARANCE_SPECIES) {
      const profile = getCoreWildlifeProfile(species);
      const palettes = MARSH_CHANNEL_WILDLIFE_APPEARANCE_PALETTES[species] as Readonly<
        Record<string, unknown>
      >;
      expect(Object.keys(palettes).sort()).toEqual([...profile.morphs].sort());
      for (const morph of profile.morphs) {
        const resolved = marshChannelWildlifeAppearancePalette(species, morph);
        expect(resolved).toBe(palettes[morph]);
        expect(Object.isFrozen(resolved)).toBe(true);
        expect(new Set(Object.values(resolved)).size).toBe(4);
      }
      expect(marshChannelWildlifeAppearancePalette(species, "unknown-morph"))
        .toBeDefined();
    }
  });

  it("covers the final addressable saltmarsh forms without inventing aggregate bodies", () => {
    expect(SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_SPECIES).toEqual([
      "seaside-sparrow",
      "diamondback-terrapin",
    ]);
    expect(SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_SPECIES)
      .not.toContain("eastern-saltmarsh-mosquito");
    expect(SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_SPECIES)
      .not.toContain("marsh-periwinkle");

    for (const species of SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_SPECIES) {
      const profile = getCoreWildlifeProfile(species);
      const palettes = SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_PALETTES[species] as Readonly<
        Record<string, unknown>
      >;
      expect(Object.keys(palettes).sort()).toEqual([...profile.morphs].sort());
      for (const morph of profile.morphs) {
        const resolved = saltmarshSmallWorldsWildlifeAppearancePalette(species, morph);
        expect(resolved).toBe(palettes[morph]);
        expect(Object.isFrozen(resolved)).toBe(true);
        expect(new Set(Object.values(resolved)).size).toBe(4);
      }
      expect(saltmarshSmallWorldsWildlifeAppearancePalette(species, "unknown-morph"))
        .toBeDefined();
    }
  });
});
