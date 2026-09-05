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
    ]);
    expect(LIVING_SPECIES_REGISTRY).toEqual([
      {
        species: "human",
        actorIdPrefix: "H-",
        actorAddressable: true,
        representation: "individual",
        locomotionClass: "terrestrial",
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
        aboutNoun: "marsh fox",
        senses: {
          visionAcuity: 880_000,
          hearingSensitivity: 920_000,
          scentSensitivity: 940_000,
          scentBaseRangeUnits: 34_000,
        },
      },
    ]);
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
    expect(livingSpeciesActorIdMatchesNamespace("OTTER-v1", "otter")).toBe(false);
  });
});
