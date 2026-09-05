import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import {
  CORE_WILDLIFE_SPECIES,
  coreWildlifeIdPrefix,
  getCoreWildlifeSpeciesMetadata,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { DOG_SPECIES, DOG_STABLE_ID_PREFIX } from "../sim/dogIdentity";
import { RESIDENT_SPECIES, RESIDENT_STABLE_ID_PREFIX } from "../sim/npcIdentity";

/**
 * Lean runtime registry for species crossing shared identity and sensory
 * boundaries. True aggregates remain registered but fail actor addressing
 * closed through `actorAddressable`.
 */
export const LIVING_SPECIES_REGISTRY_VERSION = 1 as const;
/** Shared semantic identity for the local courier across human-facing senses. */
export const LOCAL_PLAYER_LIVING_ACTOR_ID = "player:local" as const;

export type LivingSpeciesRepresentation = "individual" | "aggregate";
export type LivingSpeciesLocomotionClass = "terrestrial" | "aerial";

export interface LivingSpeciesSensoryValues {
  /** Relative capability only; line-of-sight still governs actual vision. */
  readonly visionAcuity: number;
  /** Relative capability only; sound propagation still governs hearing. */
  readonly hearingSensitivity: number;
  /** Relative source strength perceived through smell. */
  readonly scentSensitivity: number;
  /** Hard local ceiling before source/weather modifiers. */
  readonly scentBaseRangeUnits: number;
}

interface LivingSpeciesRegistryInput<Species extends string = string> {
  readonly species: Species;
  readonly actorIdPrefix: string;
  /** False for true area/population aggregates that must never mint actor IDs. */
  readonly actorAddressable: boolean;
  readonly representation: LivingSpeciesRepresentation;
  readonly locomotionClass: LivingSpeciesLocomotionClass;
  /** Lowercase noun; presentation decides capitalization and knowledge qualifiers. */
  readonly aboutNoun: string;
  readonly senses: LivingSpeciesSensoryValues;
}

function defineSpecies<const Entry extends LivingSpeciesRegistryInput>(
  entry: Entry,
): Readonly<Entry> {
  return Object.freeze({
    ...entry,
    senses: Object.freeze({ ...entry.senses }),
  });
}

const CORE_WILDLIFE_REGISTRY_VALUES: Readonly<Record<
  CoreWildlifeSpecies,
  Readonly<{
    aboutNoun: string;
    senses: LivingSpeciesSensoryValues;
  }>
>> = Object.freeze({
  deer: {
    aboutNoun: "deer",
    senses: {
      visionAcuity: 820_000,
      hearingSensitivity: 930_000,
      scentSensitivity: 720_000,
      scentBaseRangeUnits: 28_000,
    },
  },
  gull: {
    aboutNoun: "gull",
    senses: {
      visionAcuity: 980_000,
      hearingSensitivity: 740_000,
      scentSensitivity: 260_000,
      scentBaseRangeUnits: 12_000,
    },
  },
  "black-bear": {
    aboutNoun: "black bear",
    senses: {
      visionAcuity: 720_000,
      hearingSensitivity: 880_000,
      scentSensitivity: ACTOR_PERCEPTION_SCALE,
      scentBaseRangeUnits: 48_000,
    },
  },
  "brown-rat": {
    aboutNoun: "brown rat",
    senses: {
      visionAcuity: 480_000,
      hearingSensitivity: 860_000,
      scentSensitivity: 880_000,
      scentBaseRangeUnits: 24_000,
    },
  },
  "domestic-cat": {
    aboutNoun: "domestic cat",
    senses: {
      visionAcuity: 900_000,
      hearingSensitivity: 980_000,
      scentSensitivity: 720_000,
      scentBaseRangeUnits: 28_000,
    },
  },
});

export const LIVING_SPECIES_REGISTRY = Object.freeze([
  defineSpecies({
    species: RESIDENT_SPECIES,
    actorIdPrefix: RESIDENT_STABLE_ID_PREFIX,
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
  }),
  defineSpecies({
    species: DOG_SPECIES,
    actorIdPrefix: DOG_STABLE_ID_PREFIX,
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
  }),
  ...CORE_WILDLIFE_SPECIES.map((species) => {
    const metadata = getCoreWildlifeSpeciesMetadata(species);
    const values = CORE_WILDLIFE_REGISTRY_VALUES[species];
    return defineSpecies({
      species,
      actorIdPrefix: coreWildlifeIdPrefix(species),
      actorAddressable: metadata.catalogIdentityForm !== "aggregate",
      representation: metadata.actorRepresentation,
      locomotionClass: metadata.locomotionClass,
      aboutNoun: values.aboutNoun,
      senses: values.senses,
    });
  }),
] as const);

export type LivingActorSpecies = (typeof LIVING_SPECIES_REGISTRY)[number]["species"];
export type LivingSpeciesRegistryEntry = (typeof LIVING_SPECIES_REGISTRY)[number];

/** Derived compatibility export; the registry remains the single roster owner. */
export const LIVING_ACTOR_SPECIES: readonly LivingActorSpecies[] = Object.freeze(
  LIVING_SPECIES_REGISTRY.map(({ species }) => species),
);

const ENTRY_BY_SPECIES = new Map<string, LivingSpeciesRegistryEntry>();
for (const entry of LIVING_SPECIES_REGISTRY) ENTRY_BY_SPECIES.set(entry.species, entry);

export function livingSpeciesRegistryEntry(
  species: unknown,
): LivingSpeciesRegistryEntry | null {
  return typeof species === "string" ? ENTRY_BY_SPECIES.get(species) ?? null : null;
}

export function isLivingActorSpecies(value: unknown): value is LivingActorSpecies {
  return livingSpeciesRegistryEntry(value) !== null;
}

export function livingSpeciesActorIdMatchesNamespace(
  actorId: unknown,
  species: unknown,
): boolean {
  const entry = livingSpeciesRegistryEntry(species);
  return typeof actorId === "string"
    && entry !== null
    && entry.actorAddressable
    && (
      actorId.startsWith(entry.actorIdPrefix)
      || (species === RESIDENT_SPECIES && actorId === LOCAL_PLAYER_LIVING_ACTOR_ID)
    );
}
