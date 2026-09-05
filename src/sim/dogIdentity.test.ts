import { describe, expect, it, vi } from "vitest";

import {
  DOG_GENERATION_VERSION,
  DOG_IDENTITY_DICTIONARY_COUNTS,
  assertDogGenerationDictionaries,
  assertDogIdentityCoherence,
  assertDogStateCoherence,
  generateDogIdentity,
  generateDogState,
  stableDogId,
  stableDogIdForGeneration,
  type DogHabitatClass,
  type DogIdentityGenerationInput,
  type GeneratedDogState,
} from "./dogIdentity";
import { REGION_COORD_LIMIT, createRegionCoord } from "./regions";
import { seedFromText } from "./rng";
import { FIXED_POINT } from "./types";

const HABITATS: readonly DogHabitatClass[] = [
  "settlement-edge",
  "coastal-lowland",
  "temperate-route",
  "upland",
  "cold-region",
  "remote-wildland",
];

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Entry)[]
    ? Mutable<Entry>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

function generationInput(
  populationOrdinal = 17,
  habitatClass: DogHabitatClass = "coastal-lowland",
): DogIdentityGenerationInput {
  return {
    seed: seedFromText("dogs remain themselves across the unbroken world"),
    originRegion: createRegionCoord(-304, 719),
    originNamespace: "regional",
    habitatClass,
    habitatKey: "east-channel:mangrove-bank",
    populationKey: "dog-population:wet-season:4",
    populationOrdinal,
  };
}

describe("deterministic dog identity foundation", () => {
  it("keeps version-one dictionaries broad, bounded, and coherent", () => {
    expect(DOG_GENERATION_VERSION).toBe(1);
    expect(DOG_IDENTITY_DICTIONARY_COUNTS).toEqual({
      ancestryTypes: 9,
      coatProfiles: 20,
      distinguishingMarks: 13,
      temperamentPairs: 19,
      habitatClasses: 6,
    });
    expect(() => assertDogGenerationDictionaries()).not.toThrow();
  });

  it("regenerates one semantic dog exactly without using runtime randomness", () => {
    const input = generationInput();
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("authoritative dog generation called Math.random");
    });
    try {
      const first = generateDogState(input);
      const second = generateDogState({
        ...input,
        originRegion: { ...input.originRegion },
        seed: [...input.seed] as [number, number, number, number],
      });
      expect(second).toEqual(first);
      expect(first.identity.stableId).toBe(stableDogId(input));
      expect(first.identity.stableId).toMatch(/^D-R-v1-/u);
      expect(first.identity.stableId.length).toBeLessThanOrEqual(192);
      expect(() => assertDogStateCoherence(first)).not.toThrow();
    } finally {
      random.mockRestore();
    }
  });

  it("addresses identity by every semantic origin component", () => {
    const base = generationInput();
    const identities = [
      base,
      { ...base, seed: seedFromText("a different world") },
      { ...base, originRegion: createRegionCoord(-303, 719) },
      { ...base, originNamespace: "authored" as const },
      { ...base, originNamespace: "woven" as const },
      { ...base, habitatClass: "upland" as const },
      { ...base, habitatKey: "east-channel:stone-bank" },
      { ...base, populationKey: "dog-population:dry-season:4" },
      { ...base, populationOrdinal: base.populationOrdinal + 1 },
    ].map((input) => stableDogId(input));

    expect(new Set(identities).size).toBe(identities.length);
    expect(identities[3]).toMatch(/^D-A-v1-/u);
    expect(identities[4]).toMatch(/^D-W-v1-/u);
  });

  it("keeps delimiter-like semantic keys unambiguous", () => {
    const base = generationInput();
    const left = stableDogId({ ...base, habitatKey: "ab", populationKey: "c:d" });
    const right = stableDogId({ ...base, habitatKey: "ab:c", populationKey: "d" });
    expect(left).not.toBe(right);
  });

  it("works deterministically at negative and extreme infinite-region coordinates", () => {
    const coordinates = [
      createRegionCoord(-1, -1),
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ];
    const ids = coordinates.map((originRegion, populationOrdinal) => {
      const input = { ...generationInput(populationOrdinal), originRegion };
      const first = generateDogState(input);
      expect(generateDogState({ ...input })).toEqual(first);
      expect(() => assertDogStateCoherence(first)).not.toThrow();
      expect(first.identity.stableId.length).toBeLessThanOrEqual(192);
      return first.identity.stableId;
    });
    expect(new Set(ids).size).toBe(ids.length);

    const maximumAddress: DogIdentityGenerationInput = {
      ...generationInput(),
      seed: [0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff],
      originRegion: createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      habitatKey: `h${"x".repeat(47)}`,
      populationKey: `p${"y".repeat(47)}`,
      populationOrdinal: Number.MAX_SAFE_INTEGER,
    };
    const maximumId = stableDogId(maximumAddress);
    expect(maximumId.length).toBeLessThanOrEqual(192);
    expect(stableDogId({ ...maximumAddress })).toBe(maximumId);
  });

  it("rejects noncanonical seeds, coordinates, keys, ordinals, and versions", () => {
    const input = generationInput();
    const invalidInputs: DogIdentityGenerationInput[] = [
      { ...input, seed: [-0, 2, 3, 4] },
      { ...input, seed: [0x1_0000_0000, 2, 3, 4] },
      { ...input, originRegion: { x: -0, y: 1 } },
      { ...input, originRegion: { x: REGION_COORD_LIMIT + 1, y: 0 } },
      { ...input, habitatKey: "Upper Bank" },
      { ...input, habitatKey: `h${"x".repeat(48)}` },
      { ...input, populationKey: "dog population" },
      { ...input, populationOrdinal: -1 },
      { ...input, populationOrdinal: -0 },
    ];
    for (const invalid of invalidInputs) {
      expect(() => stableDogId(invalid)).toThrow();
      expect(() => generateDogState(invalid)).toThrow();
    }
    expect(() => stableDogIdForGeneration(input, 0)).toThrow(/Unsupported dog generation version/u);
    expect(() => stableDogIdForGeneration(input, 2)).toThrow(/Unsupported dog generation version/u);
  });

  it("generates diverse coherent individuals with globally unique semantic IDs", () => {
    const states: GeneratedDogState[] = [];
    for (const habitatClass of HABITATS) {
      for (let ordinal = 0; ordinal < 480; ordinal += 1) {
        const state = generateDogState(generationInput(ordinal, habitatClass));
        expect(() => assertDogStateCoherence(state)).not.toThrow();
        states.push(state);
      }
    }

    expect(new Set(states.map(({ identity }) => identity.stableId)).size).toBe(states.length);
    expect(new Set(states.map(({ identity }) => identity.ancestry.primary)).size).toBe(9);
    expect(new Set(states.map(({ identity }) => identity.coat.pattern)).size).toBe(8);
    expect(new Set(states.map(({ identity }) => identity.age)).size).toBe(4);
    expect(new Set(states.map(({ identity }) => identity.body.size)).size).toBe(5);
    expect(new Set(states.map(({ humanFamiliarity }) => humanFamiliarity.level)).size).toBe(4);
    expect(states.filter(({ identity }) => identity.ancestry.kind === "mixed").length)
      .toBeGreaterThan(states.length * 0.6);
  });

  it("does not hardcode temperament from ancestry type", () => {
    const temperamentByPrimary = new Map<string, Set<string>>();
    const ancestryByTemperament = new Map<string, Set<string>>();
    for (let ordinal = 0; ordinal < 6_000; ordinal += 1) {
      const identity = generateDogIdentity(generationInput(ordinal, "settlement-edge"));
      const temperament = identity.temperament.join("|");
      const ancestry = identity.ancestry.primary;
      const temperamentSet = temperamentByPrimary.get(ancestry) ?? new Set<string>();
      temperamentSet.add(temperament);
      temperamentByPrimary.set(ancestry, temperamentSet);
      const ancestrySet = ancestryByTemperament.get(temperament) ?? new Set<string>();
      ancestrySet.add(ancestry);
      ancestryByTemperament.set(temperament, ancestrySet);
    }

    expect(temperamentByPrimary.size).toBe(9);
    for (const temperaments of temperamentByPrimary.values()) {
      expect(temperaments.size).toBeGreaterThanOrEqual(5);
    }
    expect([...ancestryByTemperament.values()].some((types) => types.size === 9)).toBe(true);
  });

  it("uses habitat and physical coat traits for meaningful adaptation without personality stereotypes", () => {
    const coldDogs = Array.from({ length: 1_500 }, (_, ordinal) =>
      generateDogState(generationInput(ordinal, "cold-region"))
    );
    const coastalDogs = Array.from({ length: 1_500 }, (_, ordinal) =>
      generateDogState(generationInput(ordinal, "coastal-lowland"))
    );
    const settlementDogs = Array.from({ length: 1_500 }, (_, ordinal) =>
      generateDogState(generationInput(ordinal, "settlement-edge"))
    );
    const remoteDogs = Array.from({ length: 1_500 }, (_, ordinal) =>
      generateDogState(generationInput(ordinal, "remote-wildland"))
    );
    const averageColdTolerance = (dogs: readonly GeneratedDogState[]): number =>
      dogs.reduce((sum, dog) => sum + dog.identity.weatherAdaptation.coldTolerance, 0) / dogs.length;
    const humanComfortCount = (dogs: readonly GeneratedDogState[]): number =>
      dogs.filter(({ humanFamiliarity }) =>
        humanFamiliarity.level === "habituated" || humanFamiliarity.level === "socialized"
      ).length;

    expect(averageColdTolerance(coldDogs)).toBeGreaterThan(averageColdTolerance(coastalDogs));
    expect(humanComfortCount(settlementDogs)).toBeGreaterThan(humanComfortCount(remoteDogs) * 2);
  });

  it("starts with bounded needs and a healthy dry physical condition", () => {
    const state = generateDogState(generationInput());
    expect(state.condition).toMatchObject({
      health: FIXED_POINT,
      wetness: 0,
      coldStress: 0,
      heatStress: 0,
      injuries: [],
    });
    expect(state.condition.exhaustion).toBeGreaterThan(0);
    expect(state.condition.exhaustion).toBeLessThan(FIXED_POINT);
    for (const pressure of Object.values(state.needs)) {
      expect(pressure).toBeGreaterThanOrEqual(0);
      expect(pressure).toBeLessThanOrEqual(FIXED_POINT);
    }
  });

  it("contains dog information only and does not invent knowledge, ownership, or human fields", () => {
    const state = generateDogState(generationInput());
    expect(state.identity.species).toBe("domestic-dog");
    for (const forbidden of [
      "name",
      "occupation",
      "religion",
      "language",
      "role",
      "owner",
      "bond",
      "trust",
    ]) {
      expect(state.identity).not.toHaveProperty(forbidden);
      expect(state).not.toHaveProperty(forbidden);
    }
  });

  it("fails closed when identity or dynamic-state coherence is corrupted", () => {
    const base = generateDogState(generationInput());
    let alternate = generateDogState(generationInput(1));
    for (let ordinal = 2; (
      alternate.identity.coat.pattern === base.identity.coat.pattern
      && alternate.identity.coat.primaryColor === base.identity.coat.primaryColor
    ) || alternate.identity.temperament.join("|") === base.identity.temperament.join("|"); ordinal += 1) {
      alternate = generateDogState(generationInput(ordinal));
    }
    const mutations: readonly ((state: Mutable<GeneratedDogState>) => void)[] = [
      (state) => { state.identity.species = "human" as never; },
      (state) => { state.identity.stableId = state.identity.stableId.replace("D-R-", "D-W-"); },
      (state) => { state.identity.stableId = `${state.identity.stableId}x`; },
      (state) => { state.identity.habitatKey = "another-valid-bank"; },
      (state) => {
        state.identity.ancestry.kind = state.identity.ancestry.secondary === null
          ? "mixed"
          : "single-type";
      },
      (state) => {
        state.identity.body.size = state.identity.body.size === "tiny" ? "large" : "tiny";
      },
      (state) => { state.identity.coat.distinguishingMark = "graying-muzzle"; state.identity.age = "adult"; },
      (state) => { state.identity.temperament = ["bold", "cautious"]; },
      (state) => {
        state.identity.coat = structuredClone(alternate.identity.coat) as Mutable<typeof state.identity.coat>;
      },
      (state) => {
        state.identity.temperament = [...alternate.identity.temperament];
      },
      (state) => { state.identity.weatherAdaptation.coldTolerance = -1; },
      (state) => { state.needs.hunger = FIXED_POINT + 1; },
      (state) => { state.condition.injuries = ["cut", "cut"]; },
      (state) => { state.humanFamiliarity.level = "feral"; state.humanFamiliarity.confidence = 900_000; },
    ];

    for (const mutate of mutations) {
      const state = structuredClone(base) as unknown as Mutable<GeneratedDogState>;
      mutate(state);
      expect(() => assertDogStateCoherence(state as unknown as GeneratedDogState)).toThrow();
    }
    const identity = structuredClone(base.identity) as unknown as Mutable<typeof base.identity>;
    identity.body.shoulderHeightCm = 81;
    expect(() => assertDogIdentityCoherence(identity as unknown as typeof base.identity)).toThrow();
  });
});
