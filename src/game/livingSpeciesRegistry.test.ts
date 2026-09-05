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
  it("owns the exact Wave A roster and runtime capability values", () => {
    expect(LIVING_SPECIES_REGISTRY_VERSION).toBe(1);
    expect(LIVING_ACTOR_SPECIES).toEqual([
      "human",
      "domestic-dog",
      "deer",
      "gull",
      "black-bear",
    ]);
    expect(LIVING_SPECIES_REGISTRY).toEqual([
      {
        species: "human",
        actorIdPrefix: "H-",
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

      expect(livingSpeciesActorIdMatchesNamespace(actorId, entry.species)).toBe(true);
      expect(livingSpeciesActorIdMatchesNamespace(actorId, other.species)).toBe(false);
      expect(createLivingActorAddress({
        actorId,
        species: entry.species,
        position,
        persistence: entry.species === "human" ? "promoted" : "regional",
      }).species).toBe(entry.species);
      expect(livingActorSenseProfile(entry.species)).toEqual({
        version: 1,
        species: entry.species,
        ...entry.senses,
      });
    }
    expect(livingSpeciesActorIdMatchesNamespace("OTTER-v1", "otter")).toBe(false);
  });
});
