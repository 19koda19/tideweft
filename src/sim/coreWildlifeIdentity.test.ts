import { describe, expect, it, vi } from "vitest";

import {
  CORE_WILDLIFE_IDENTITY_VERSION,
  CORE_WILDLIFE_PROFILES,
  CORE_WILDLIFE_SPECIES,
  assertCoreWildlifeIdentity,
  assertCoreWildlifeProfiles,
  canonicalizeCoreWildlifeIdentity,
  generateCoreWildlifeIdentity,
  getCoreWildlifeProfile,
  stableCoreWildlifeId,
  type CoreWildlifeIdentityGenerationInput,
  type CoreWildlifeSpecies,
} from "./coreWildlifeIdentity";
import { REGION_COORD_LIMIT, createRegionCoord } from "./regions";
import { seedFromText } from "./rng";

function input(
  species: CoreWildlifeSpecies = "deer",
  populationOrdinal = 3,
): CoreWildlifeIdentityGenerationInput {
  return {
    seed: seedFromText("wave a wildlife remains itself"),
    species,
    originRegion: createRegionCoord(-719, 304),
    populationKey: `${species}:east-marsh`,
    populationOrdinal,
  };
}

describe("core Wave-A wildlife identity", () => {
  it("publishes three coherent data-driven ecological profiles", () => {
    expect(CORE_WILDLIFE_IDENTITY_VERSION).toBe(1);
    expect(CORE_WILDLIFE_SPECIES).toEqual(["deer", "gull", "black-bear"]);
    expect(CORE_WILDLIFE_PROFILES.map(({ species }) => species)).toEqual(CORE_WILDLIFE_SPECIES);
    expect(() => assertCoreWildlifeProfiles()).not.toThrow();
    expect(getCoreWildlifeProfile("deer").roles).toEqual([
      "alarm-source",
      "prey",
      "forager",
    ]);
    expect(getCoreWildlifeProfile("gull").roles).toContain("scavenger");
    expect(getCoreWildlifeProfile("black-bear").roles).toEqual([
      "forager",
      "scavenger",
      "predator",
      "omnivore",
    ]);
    expect(getCoreWildlifeProfile("black-bear").behavior.maximumPursuitTicks).toBeGreaterThan(0);
    expect(getCoreWildlifeProfile("deer").behavior.maximumPursuitTicks).toBe(0);
  });

  it("generates exact immutable identities without runtime randomness", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("wildlife identity used Math.random");
    });
    try {
      for (const species of CORE_WILDLIFE_SPECIES) {
        const first = generateCoreWildlifeIdentity(input(species));
        const second = generateCoreWildlifeIdentity({
          ...input(species),
          seed: [...input(species).seed] as [number, number, number, number],
          originRegion: { ...input(species).originRegion },
        });
        expect(second).toEqual(first);
        expect(first.stableId).toBe(stableCoreWildlifeId(input(species)));
        expect(first.stableId).toMatch(
          species === "deer" ? /^DEER-/u : species === "gull" ? /^GULL-/u : /^BEAR-/u,
        );
        expect(first.stableId.length).toBeLessThanOrEqual(192);
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.traits)).toBe(true);
        expect(() => assertCoreWildlifeIdentity(first)).not.toThrow();
      }
    } finally {
      random.mockRestore();
    }
  });

  it("addresses every stable origin component rather than allocation order", () => {
    const base = input("deer");
    const ids = [
      base,
      { ...base, seed: seedFromText("another world") },
      { ...base, species: "gull" as const },
      { ...base, originRegion: createRegionCoord(-718, 304) },
      { ...base, populationKey: "deer:west-marsh" },
      { ...base, populationOrdinal: 4 },
    ].map(stableCoreWildlifeId);
    expect(new Set(ids).size).toBe(ids.length);

    const left = stableCoreWildlifeId({ ...base, populationKey: "ab-c:d", populationOrdinal: 2 });
    const right = stableCoreWildlifeId({ ...base, populationKey: "ab", populationOrdinal: 2 });
    expect(left).not.toBe(right);
  });

  it("remains canonical at both signed coordinate extremes", () => {
    const regions = [
      createRegionCoord(-1, -1),
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ];
    const ids = regions.flatMap((originRegion, populationOrdinal) =>
      CORE_WILDLIFE_SPECIES.map((species) => {
        const generation = {
          ...input(species, populationOrdinal),
          originRegion,
        };
        const identity = generateCoreWildlifeIdentity(generation);
        expect(canonicalizeCoreWildlifeIdentity(structuredClone(identity))).toEqual(identity);
        return identity.stableId;
      })
    );
    expect(new Set(ids).size).toBe(ids.length);

    const maximum = {
      ...input("black-bear", Number.MAX_SAFE_INTEGER),
      seed: [0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff] as const,
      originRegion: createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      populationKey: `p${"x".repeat(63)}`,
    };
    expect(stableCoreWildlifeId(maximum).length).toBeLessThanOrEqual(192);
    expect(canonicalizeCoreWildlifeIdentity(generateCoreWildlifeIdentity(maximum))).not.toBeNull();
  });

  it("rejects aliases, mutations, extra fields, and noncanonical inputs", () => {
    const identity = generateCoreWildlifeIdentity(input());
    expect(canonicalizeCoreWildlifeIdentity({ ...identity, debug: true })).toBeNull();
    expect(canonicalizeCoreWildlifeIdentity({
      ...identity,
      traits: { ...identity.traits, boldness: identity.traits.boldness + 1 },
    })).toBeNull();
    expect(canonicalizeCoreWildlifeIdentity({ ...identity, species: "gull" })).toBeNull();
    expect(() => stableCoreWildlifeId({ ...input(), seed: [-0, 1, 2, 3] })).toThrow();
    expect(() => stableCoreWildlifeId({ ...input(), originRegion: { x: -0, y: 0 } })).toThrow();
    expect(() => stableCoreWildlifeId({ ...input(), populationKey: "Upper Marsh" })).toThrow();
    expect(() => stableCoreWildlifeId({ ...input(), populationOrdinal: -1 })).toThrow();
    expect(() => stableCoreWildlifeId({ ...input(), populationOrdinal: -0 })).toThrow();
  });

  it("retains bounded individual variation without changing species roles", () => {
    for (const species of CORE_WILDLIFE_SPECIES) {
      const identities = Array.from({ length: 160 }, (_, ordinal) =>
        generateCoreWildlifeIdentity(input(species, ordinal))
      );
      expect(new Set(identities.map(({ stableId }) => stableId)).size).toBe(identities.length);
      expect(new Set(identities.map(({ morph }) => morph)).size).toBeGreaterThanOrEqual(3);
      expect(new Set(identities.map(({ temperament }) => temperament.join("|"))).size)
        .toBeGreaterThanOrEqual(3);
    }
  });
});
