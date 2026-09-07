import { describe, expect, it } from "vitest";

import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import {
  CORE_WILDLIFE_ID_PREFIX_BY_SPECIES,
  CORE_WILDLIFE_SPECIES,
} from "../sim/coreWildlifeIdentity";
import { DOG_SPECIES, DOG_STABLE_ID_PREFIX } from "../sim/dogIdentity";
import { RESIDENT_SPECIES, RESIDENT_STABLE_ID_PREFIX } from "../sim/npcIdentity";
import { createRegionCoord } from "../sim/regions";
import { createLivingActorAddress, LIVING_ACTOR_SPECIES } from "./livingActor";
import { livingActorSenseProfile } from "./livingActorSenses";
import {
  LIVING_SPECIES_REGISTRY,
  LIVING_SPECIES_REGISTRY_VERSION,
  LOCAL_PLAYER_LIVING_ACTOR_ID,
  isLivingActorSpecies,
  isLivingSpeciesActorAddressable,
  livingSpeciesActorIdMatchesNamespace,
  livingSpeciesRegistryEntry,
} from "./livingSpeciesRegistry";
import { createWorldPosition } from "./worldPosition";

describe("lean runtime living-species registry", () => {
  it("owns the exact current roster and runtime capability values", () => {
    expect(LIVING_SPECIES_REGISTRY_VERSION).toBe(1);
    expect(LIVING_ACTOR_SPECIES).toEqual([
      "human",
      "domestic-dog",
      "deer",
      "gull",
      "black-bear",
      "brown-rat",
      "domestic-cat",
      "marsh-rabbit",
      "marsh-fox",
      "fish-crow",
      "northern-harrier",
      "southern-leopard-frog",
      "atlantic-silverside",
      "atlantic-marsh-fiddler-crab",
      "snowy-egret",
      "american-black-duck",
      "north-american-river-otter",
      "domestic-chicken",
      "domestic-goat",
    ]);
    expect(LIVING_SPECIES_REGISTRY).toEqual([
      {
        species: "human",
        actorIdPrefix: "H-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "person",
        senses: {
          visionAcuity: 850_000,
          hearingSensitivity: 650_000,
          scentSensitivity: 180_000,
          scentBaseRangeUnits: 6_000,
        },
      },
      {
        species: "domestic-dog",
        actorIdPrefix: "D-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "dog",
        senses: {
          visionAcuity: 680_000,
          hearingSensitivity: 950_000,
          scentSensitivity: ACTOR_PERCEPTION_SCALE,
          scentBaseRangeUnits: 36_000,
        },
      },
      {
        species: "deer",
        actorIdPrefix: "DEER-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: "herd",
        groupStableIdNamespace: "HERD",
        aboutNoun: "deer",
        senses: {
          visionAcuity: 820_000,
          hearingSensitivity: 930_000,
          scentSensitivity: 720_000,
          scentBaseRangeUnits: 28_000,
        },
      },
      {
        species: "gull",
        actorIdPrefix: "GULL-",
        actorAddressable: true,
        representation: "aggregate",
        locomotionClass: "aerial",
        groupOrganization: "flock",
        groupStableIdNamespace: "FLOCK",
        aboutNoun: "gull",
        senses: {
          visionAcuity: 980_000,
          hearingSensitivity: 740_000,
          scentSensitivity: 260_000,
          scentBaseRangeUnits: 12_000,
        },
      },
      {
        species: "black-bear",
        actorIdPrefix: "BEAR-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "black bear",
        senses: {
          visionAcuity: 720_000,
          hearingSensitivity: 880_000,
          scentSensitivity: ACTOR_PERCEPTION_SCALE,
          scentBaseRangeUnits: 48_000,
        },
      },
      {
        species: "brown-rat",
        actorIdPrefix: "RAT-",
        actorAddressable: false,
        representation: "aggregate",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "brown rat",
        senses: {
          visionAcuity: 480_000,
          hearingSensitivity: 860_000,
          scentSensitivity: 880_000,
          scentBaseRangeUnits: 24_000,
        },
      },
      {
        species: "domestic-cat",
        actorIdPrefix: "CAT-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "domestic cat",
        senses: {
          visionAcuity: 900_000,
          hearingSensitivity: 980_000,
          scentSensitivity: 720_000,
          scentBaseRangeUnits: 28_000,
        },
      },
      {
        species: "marsh-rabbit",
        actorIdPrefix: "RABBIT-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "marsh rabbit",
        senses: {
          visionAcuity: 860_000,
          hearingSensitivity: 970_000,
          scentSensitivity: 610_000,
          scentBaseRangeUnits: 18_000,
        },
      },
      {
        species: "marsh-fox",
        actorIdPrefix: "FOX-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "marsh fox",
        senses: {
          visionAcuity: 880_000,
          hearingSensitivity: 920_000,
          scentSensitivity: 940_000,
          scentBaseRangeUnits: 34_000,
        },
      },
      {
        species: "fish-crow",
        actorIdPrefix: "CROW-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "aerial",
        groupOrganization: "flock",
        groupStableIdNamespace: "CROW-FLOCK",
        aboutNoun: "fish crow",
        senses: {
          visionAcuity: 940_000,
          hearingSensitivity: 900_000,
          scentSensitivity: 300_000,
          scentBaseRangeUnits: 12_000,
        },
      },
      {
        species: "northern-harrier",
        actorIdPrefix: "HARRIER-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "aerial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "northern harrier",
        senses: {
          visionAcuity: ACTOR_PERCEPTION_SCALE,
          hearingSensitivity: 820_000,
          scentSensitivity: 120_000,
          scentBaseRangeUnits: 8_000,
        },
      },
      {
        species: "southern-leopard-frog",
        actorIdPrefix: "FROG-",
        actorAddressable: false,
        representation: "aggregate",
        locomotionClass: "terrestrial",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "southern leopard frog",
        senses: {
          visionAcuity: 580_000,
          hearingSensitivity: 700_000,
          scentSensitivity: 400_000,
          scentBaseRangeUnits: 8_000,
        },
      },
      {
        species: "atlantic-silverside",
        actorIdPrefix: "SILVERSIDE-",
        actorAddressable: false,
        representation: "aggregate",
        locomotionClass: "aquatic",
        groupOrganization: "school",
        groupStableIdNamespace: "SILVERSIDE-SCHOOL",
        aboutNoun: "atlantic silverside school",
        senses: {
          visionAcuity: 760_000,
          hearingSensitivity: 720_000,
          scentSensitivity: 620_000,
          scentBaseRangeUnits: 10_000,
        },
      },
      {
        species: "atlantic-marsh-fiddler-crab",
        actorIdPrefix: "FIDDLER-",
        actorAddressable: false,
        representation: "aggregate",
        locomotionClass: "amphibious",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "atlantic marsh fiddler crab activity",
        senses: {
          visionAcuity: 640_000,
          hearingSensitivity: 780_000,
          scentSensitivity: 680_000,
          scentBaseRangeUnits: 8_000,
        },
      },
      {
        species: "snowy-egret",
        actorIdPrefix: "EGRET-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "amphibious",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "snowy egret",
        senses: {
          visionAcuity: ACTOR_PERCEPTION_SCALE,
          hearingSensitivity: 720_000,
          scentSensitivity: 100_000,
          scentBaseRangeUnits: 6_000,
        },
      },
      {
        species: "american-black-duck",
        actorIdPrefix: "DUCK-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "amphibious",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "american black duck",
        senses: {
          visionAcuity: 920_000,
          hearingSensitivity: 820_000,
          scentSensitivity: 220_000,
          scentBaseRangeUnits: 8_000,
        },
      },
      {
        species: "north-american-river-otter",
        actorIdPrefix: "OTTER-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "amphibious",
        groupOrganization: null,
        groupStableIdNamespace: null,
        aboutNoun: "North American river otter",
        senses: {
          visionAcuity: 820_000,
          hearingSensitivity: 900_000,
          scentSensitivity: 840_000,
          scentBaseRangeUnits: 28_000,
        },
      },
      {
        species: "domestic-chicken",
        actorIdPrefix: "CHICKEN-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: "flock",
        groupStableIdNamespace: "CHICKEN-FLOCK",
        aboutNoun: "domestic chicken",
        senses: {
          visionAcuity: 820_000,
          hearingSensitivity: 800_000,
          scentSensitivity: 260_000,
          scentBaseRangeUnits: 8_000,
        },
      },
      {
        species: "domestic-goat",
        actorIdPrefix: "GOAT-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
        groupOrganization: "herd",
        groupStableIdNamespace: "HERD",
        aboutNoun: "domestic goat",
        senses: {
          visionAcuity: 780_000,
          hearingSensitivity: 900_000,
          scentSensitivity: 700_000,
          scentBaseRangeUnits: 20_000,
        },
      },
    ]);
    expect(isLivingSpeciesActorAddressable("american-black-duck")).toBe(true);
    expect(livingSpeciesActorIdMatchesNamespace(
      "DUCK-v1-waterfowl-fixture",
      "american-black-duck",
    )).toBe(true);
    expect(isLivingSpeciesActorAddressable("north-american-river-otter")).toBe(true);
    expect(livingSpeciesActorIdMatchesNamespace(
      "OTTER-v1-wave-c-fixture",
      "north-american-river-otter",
    )).toBe(true);
    expect(isLivingSpeciesActorAddressable("domestic-chicken")).toBe(true);
    expect(livingSpeciesActorIdMatchesNamespace(
      "CHICKEN-v1-wave-d-fixture",
      "domestic-chicken",
    )).toBe(true);
    expect(isLivingSpeciesActorAddressable("domestic-goat")).toBe(true);
    expect(livingSpeciesActorIdMatchesNamespace(
      "GOAT-v1-alpha25-fixture",
      "domestic-goat",
    )).toBe(true);
  });

  it("is deeply immutable and fails unknown species closed", () => {
    expect(Object.isFrozen(LIVING_SPECIES_REGISTRY)).toBe(true);
    expect(Object.isFrozen(LIVING_ACTOR_SPECIES)).toBe(true);
    for (const entry of LIVING_SPECIES_REGISTRY) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.senses)).toBe(true);
      expect(livingSpeciesRegistryEntry(entry.species)).toBe(entry);
      expect(isLivingActorSpecies(entry.species)).toBe(true);
    }
    expect(livingSpeciesRegistryEntry("otter")).toBeNull();
    expect(livingSpeciesRegistryEntry(null)).toBeNull();
    expect(isLivingActorSpecies("otter")).toBe(false);
  });

  it("derives identity namespaces from their sim-layer owners", () => {
    expect(livingSpeciesRegistryEntry(RESIDENT_SPECIES)?.actorIdPrefix)
      .toBe(RESIDENT_STABLE_ID_PREFIX);
    expect(livingSpeciesRegistryEntry(DOG_SPECIES)?.actorIdPrefix)
      .toBe(DOG_STABLE_ID_PREFIX);
    for (const species of CORE_WILDLIFE_SPECIES) {
      expect(livingSpeciesRegistryEntry(species)?.actorIdPrefix)
        .toBe(CORE_WILDLIFE_ID_PREFIX_BY_SPECIES[species]);
    }
    expect(livingSpeciesActorIdMatchesNamespace(LOCAL_PLAYER_LIVING_ACTOR_ID, "human"))
      .toBe(true);
    expect(livingSpeciesActorIdMatchesNamespace(LOCAL_PLAYER_LIVING_ACTOR_ID, "domestic-dog"))
      .toBe(false);
    expect(createLivingActorAddress({
      actorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      species: "human",
      position: createWorldPosition(createRegionCoord(0, 0), 0, 0),
      persistence: "promoted",
    }).actorId).toBe(LOCAL_PLAYER_LIVING_ACTOR_ID);
  });

  it("drives both stable ID namespaces and shared sensory profiles", () => {
    const position = createWorldPosition(createRegionCoord(0, 0), 1_000, 2_000);
    for (const [index, entry] of LIVING_SPECIES_REGISTRY.entries()) {
      const actorId = `${entry.actorIdPrefix}v1-registry-fixture`;
      const other = LIVING_SPECIES_REGISTRY[(index + 1) % LIVING_SPECIES_REGISTRY.length];
      if (other === undefined) throw new Error("registry fixture needs another species");

      expect(livingSpeciesActorIdMatchesNamespace(actorId, entry.species))
        .toBe(entry.actorAddressable);
      expect(livingSpeciesActorIdMatchesNamespace(actorId, other.species)).toBe(false);
      const addressInput = {
        actorId,
        species: entry.species,
        position,
        persistence: entry.species === "human" ? "promoted" : "regional",
      } as const;
      if (entry.actorAddressable) {
        expect(createLivingActorAddress(addressInput).species).toBe(entry.species);
      } else {
        expect(() => createLivingActorAddress(addressInput)).toThrow(
          "Living actor ID namespace does not match its species",
        );
      }
      expect(livingActorSenseProfile(entry.species)).toEqual({
        version: 1,
        species: entry.species,
        ...entry.senses,
      });
    }
    expect(livingSpeciesActorIdMatchesNamespace("RAT-v1-synthetic", "brown-rat")).toBe(false);
    expect(isLivingSpeciesActorAddressable("southern-leopard-frog")).toBe(false);
    expect(livingSpeciesActorIdMatchesNamespace(
      "FROG-v1-synthetic",
      "southern-leopard-frog",
    )).toBe(false);
    expect(() => createLivingActorAddress({
      actorId: "FROG-v1-synthetic",
      species: "southern-leopard-frog",
      position,
      persistence: "regional",
    })).toThrow("Living actor ID namespace does not match its species");
    expect(isLivingSpeciesActorAddressable("unknown-frog")).toBe(false);
    expect(livingSpeciesActorIdMatchesNamespace("OTTER-v1", "otter")).toBe(false);
  });
});
