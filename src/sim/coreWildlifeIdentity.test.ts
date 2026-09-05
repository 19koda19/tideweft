import { describe, expect, it, vi } from "vitest";

import {
  CORE_WILDLIFE_IDENTITY_VERSION,
  CORE_WILDLIFE_ID_PREFIX_BY_SPECIES,
  CORE_WILDLIFE_PROFILES,
  CORE_WILDLIFE_SPECIES,
  assertCoreWildlifeIdentity,
  assertCoreWildlifeProfiles,
  canonicalizeCoreWildlifeIdentity,
  generateCoreWildlifeIdentity,
  getCoreWildlifeProfile,
  getCoreWildlifeSpeciesMetadata,
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

describe("core wildlife identity", () => {
  it("publishes the Wave-A identities plus the first coherent Wave-B web", () => {
    expect(CORE_WILDLIFE_IDENTITY_VERSION).toBe(1);
    expect(CORE_WILDLIFE_SPECIES).toEqual([
      "deer",
      "gull",
      "black-bear",
      "brown-rat",
      "domestic-cat",
    ]);
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
    expect(getCoreWildlifeProfile("brown-rat").roles).toEqual([
      "prey",
      "small-prey",
      "forager",
      "scavenger",
      "omnivore",
    ]);
    expect(getCoreWildlifeProfile("domestic-cat").roles).toEqual([
      "forager",
      "predator",
      "small-predator",
    ]);
    expect(getCoreWildlifeProfile("domestic-cat").maximumPatchPopulation).toBe(4);
    expect(getCoreWildlifeSpeciesMetadata("brown-rat")).toMatchObject({
      actorRepresentation: "aggregate",
      catalogIdentityForm: "aggregate",
      dietClass: "omnivore",
      groupOrganization: null,
      locomotionClass: "terrestrial",
      taxonomicClass: "mammal",
    });
    expect(getCoreWildlifeSpeciesMetadata("domestic-cat")).toMatchObject({
      actorRepresentation: "individual",
      catalogIdentityForm: "individual",
      dietClass: "carnivore",
      groupOrganization: null,
      locomotionClass: "terrestrial",
      taxonomicClass: "mammal",
    });
  });

  it("preserves exact Wave-A v1 profile and stable-ID bytes", () => {
    const profileBytes = {
      deer: '{"version":1,"species":"deer","maximumPatchPopulation":16,"roles":["alarm-source","prey","forager"],"foodAffinities":{"browse":1000000,"shore-forage":150000,"carrion":0,"exposed-food":80000,"live-prey":0},"behavior":{"alarmThreshold":430000,"fleeThreshold":610000,"retreatThreshold":500000,"forageThreshold":360000,"guardThreshold":1000000,"maximumPursuitTicks":0},"morphs":["red-brown","gray-brown","pale-spotted","dark-backed"],"temperamentPairs":[["cautious","watchful"],["watchful","social"],["cautious","reserved"],["patient","watchful"]],"traitRanges":{"vigilance":[560000,940000],"boldness":[100000,480000],"sociability":[480000,900000]}}',
      gull: '{"version":1,"species":"gull","maximumPatchPopulation":24,"roles":["alarm-source","forager","scavenger"],"foodAffinities":{"browse":0,"shore-forage":900000,"carrion":760000,"exposed-food":1000000,"live-prey":120000},"behavior":{"alarmThreshold":390000,"fleeThreshold":690000,"retreatThreshold":560000,"forageThreshold":300000,"guardThreshold":820000,"maximumPursuitTicks":0},"morphs":["pale-gray","dark-winged","mottled-young","white-headed"],"temperamentPairs":[["bold","opportunistic"],["watchful","social"],["cautious","opportunistic"],["bold","watchful"]],"traitRanges":{"vigilance":[480000,900000],"boldness":[300000,850000],"sociability":[500000,930000]}}',
      "black-bear": '{"version":1,"species":"black-bear","maximumPatchPopulation":4,"roles":["forager","scavenger","predator","omnivore"],"foodAffinities":{"browse":560000,"shore-forage":520000,"carrion":870000,"exposed-food":940000,"live-prey":780000},"behavior":{"alarmThreshold":1000000,"fleeThreshold":840000,"retreatThreshold":620000,"forageThreshold":310000,"guardThreshold":540000,"maximumPursuitTicks":10},"morphs":["black","brown-black","cinnamon","pale-muzzle"],"temperamentPairs":[["reserved","patient"],["cautious","opportunistic"],["bold","opportunistic"],["watchful","reserved"]],"traitRanges":{"vigilance":[360000,780000],"boldness":[260000,760000],"sociability":[40000,260000]}}',
    } as const;
    const stableIds = {
      deer: "DEER-v1-0huwe9o.1ezclkl.0tl4wgd.1kiba8e-njz.p8g-f.deer:east-marsh-3",
      gull: "GULL-v1-0huwe9o.1ezclkl.0tl4wgd.1kiba8e-njz.p8g-f.gull:east-marsh-3",
      "black-bear": "BEAR-v1-0huwe9o.1ezclkl.0tl4wgd.1kiba8e-njz.p8g-l.black-bear:east-marsh-3",
    } as const;

    for (const species of ["deer", "gull", "black-bear"] as const) {
      expect(JSON.stringify(getCoreWildlifeProfile(species))).toBe(profileBytes[species]);
      expect(stableCoreWildlifeId(input(species))).toBe(stableIds[species]);
    }
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
        expect(first.stableId.startsWith(CORE_WILDLIFE_ID_PREFIX_BY_SPECIES[species])).toBe(true);
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
