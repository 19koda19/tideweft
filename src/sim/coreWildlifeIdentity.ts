import { keyedRandomInt, keyedRandomU32, type RootSeed } from "./rng";
import { createRegionCoord, isRegionCoord, type RegionCoord } from "./regions";
import { FIXED_POINT } from "./types";
import { stableStringify } from "./util";

export const CORE_WILDLIFE_IDENTITY_VERSION = 1 as const;
export const CORE_WILDLIFE_POPULATION_KEY_MAX_LENGTH = 64 as const;

export const CORE_WILDLIFE_SPECIES = Object.freeze([
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
  "wild-boar",
  "elk",
  "gray-wolf",
  "cougar",
  "brown-bear",
] as const);

export type CoreWildlifeSpecies = (typeof CORE_WILDLIFE_SPECIES)[number];
export type CoreWildlifeRepresentation = "individual" | "aggregate";
export type CoreWildlifeTaxonomicClass =
  | "amphibian"
  | "bird"
  | "fish"
  | "invertebrate"
  | "mammal";
export type CoreWildlifeDietClass =
  | "herbivore"
  | "omnivore"
  | "carnivore"
  | "detritivore";
export type CoreWildlifeLocomotionClass =
  | "terrestrial"
  | "aerial"
  | "aquatic"
  | "amphibious";
export type CoreWildlifeGroupOrganization =
  | "herd"
  | "flock"
  | "school"
  | "sounder"
  | "pack";
export type CoreWildlifeEcologicalRole =
  | "alarm-source"
  | "prey"
  | "small-prey"
  | "forager"
  | "scavenger"
  | "predator"
  | "small-predator"
  | "omnivore"
  | "detritivore";
export type CoreWildlifeFoodClass =
  | "browse"
  | "shore-forage"
  | "carrion"
  | "exposed-food"
  | "live-prey";
export const CORE_WILDLIFE_FOOD_CLASSES: readonly CoreWildlifeFoodClass[] = Object.freeze([
  "browse",
  "shore-forage",
  "carrion",
  "exposed-food",
  "live-prey",
]);
export type CoreWildlifeTemperament =
  | "cautious"
  | "bold"
  | "watchful"
  | "patient"
  | "social"
  | "opportunistic"
  | "reserved";
export type CoreWildlifeSex = "female" | "male";
export type CoreWildlifeLifeStage = "juvenile" | "adult" | "older";

/** Sim-layer identity authority; game registries derive these namespaces. */
export const CORE_WILDLIFE_ID_PREFIX_BY_SPECIES: Readonly<
  Record<
    CoreWildlifeSpecies,
    | "DEER-"
    | "GULL-"
    | "BEAR-"
    | "RAT-"
    | "CAT-"
    | "RABBIT-"
    | "FOX-"
    | "CROW-"
    | "HARRIER-"
    | "FROG-"
    | "SILVERSIDE-"
    | "FIDDLER-"
    | "EGRET-"
    | "DUCK-"
    | "OTTER-"
    | "CHICKEN-"
    | "GOAT-"
    | "BOAR-"
    | "ELK-"
    | "WOLF-"
    | "COUGAR-"
    | "BROWNBEAR-"
  >
> = Object.freeze({
  deer: "DEER-",
  gull: "GULL-",
  "black-bear": "BEAR-",
  "brown-rat": "RAT-",
  "domestic-cat": "CAT-",
  "marsh-rabbit": "RABBIT-",
  "marsh-fox": "FOX-",
  "fish-crow": "CROW-",
  "northern-harrier": "HARRIER-",
  "southern-leopard-frog": "FROG-",
  "atlantic-silverside": "SILVERSIDE-",
  "atlantic-marsh-fiddler-crab": "FIDDLER-",
  "snowy-egret": "EGRET-",
  "american-black-duck": "DUCK-",
  "north-american-river-otter": "OTTER-",
  "domestic-chicken": "CHICKEN-",
  "domestic-goat": "GOAT-",
  "wild-boar": "BOAR-",
  elk: "ELK-",
  "gray-wolf": "WOLF-",
  cougar: "COUGAR-",
  "brown-bear": "BROWNBEAR-",
});

/**
 * Species-level facts shared by registries and catalog consumers. This is a
 * separate dictionary so expanding the roster cannot rewrite persisted v1
 * Wave-A identity profiles or their deterministic draws.
 */
export interface CoreWildlifeSpeciesMetadata {
  readonly species: CoreWildlifeSpecies;
  readonly actorRepresentation: CoreWildlifeRepresentation;
  readonly catalogIdentityForm: CoreWildlifeRepresentation;
  readonly taxonomicClass: CoreWildlifeTaxonomicClass;
  readonly dietClass: CoreWildlifeDietClass;
  readonly locomotionClass: CoreWildlifeLocomotionClass;
  readonly groupOrganization: CoreWildlifeGroupOrganization | null;
  readonly groupStableIdNamespace:
    | "HERD"
    | "FLOCK"
    | "CROW-FLOCK"
    | "SILVERSIDE-SCHOOL"
    | "CHICKEN-FLOCK"
    | "SOUNDER"
    | "PACK"
    | null;
}

export const CORE_WILDLIFE_SPECIES_METADATA_BY_SPECIES: Readonly<
  Record<CoreWildlifeSpecies, CoreWildlifeSpeciesMetadata>
> = deepFreeze({
  deer: {
    species: "deer",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "herbivore",
    locomotionClass: "terrestrial",
    groupOrganization: "herd",
    groupStableIdNamespace: "HERD",
  },
  gull: {
    species: "gull",
    actorRepresentation: "aggregate",
    catalogIdentityForm: "individual",
    taxonomicClass: "bird",
    dietClass: "omnivore",
    locomotionClass: "aerial",
    groupOrganization: "flock",
    groupStableIdNamespace: "FLOCK",
  },
  "black-bear": {
    species: "black-bear",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "omnivore",
    locomotionClass: "terrestrial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "brown-rat": {
    species: "brown-rat",
    actorRepresentation: "aggregate",
    catalogIdentityForm: "aggregate",
    taxonomicClass: "mammal",
    dietClass: "omnivore",
    locomotionClass: "terrestrial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "domestic-cat": {
    species: "domestic-cat",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "carnivore",
    locomotionClass: "terrestrial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "marsh-rabbit": {
    species: "marsh-rabbit",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "herbivore",
    locomotionClass: "terrestrial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "marsh-fox": {
    species: "marsh-fox",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "omnivore",
    locomotionClass: "terrestrial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "fish-crow": {
    species: "fish-crow",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "bird",
    dietClass: "omnivore",
    locomotionClass: "aerial",
    groupOrganization: "flock",
    groupStableIdNamespace: "CROW-FLOCK",
  },
  "northern-harrier": {
    species: "northern-harrier",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "bird",
    dietClass: "carnivore",
    locomotionClass: "aerial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "southern-leopard-frog": {
    species: "southern-leopard-frog",
    actorRepresentation: "aggregate",
    catalogIdentityForm: "aggregate",
    taxonomicClass: "amphibian",
    dietClass: "carnivore",
    locomotionClass: "terrestrial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "atlantic-silverside": {
    species: "atlantic-silverside",
    actorRepresentation: "aggregate",
    catalogIdentityForm: "aggregate",
    taxonomicClass: "fish",
    dietClass: "carnivore",
    locomotionClass: "aquatic",
    groupOrganization: "school",
    groupStableIdNamespace: "SILVERSIDE-SCHOOL",
  },
  "atlantic-marsh-fiddler-crab": {
    species: "atlantic-marsh-fiddler-crab",
    actorRepresentation: "aggregate",
    catalogIdentityForm: "aggregate",
    taxonomicClass: "invertebrate",
    dietClass: "detritivore",
    locomotionClass: "amphibious",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "snowy-egret": {
    species: "snowy-egret",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "bird",
    dietClass: "carnivore",
    locomotionClass: "amphibious",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "american-black-duck": {
    species: "american-black-duck",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "bird",
    dietClass: "omnivore",
    locomotionClass: "amphibious",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "north-american-river-otter": {
    species: "north-american-river-otter",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "carnivore",
    locomotionClass: "amphibious",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "domestic-chicken": {
    species: "domestic-chicken",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "bird",
    dietClass: "omnivore",
    locomotionClass: "terrestrial",
    groupOrganization: "flock",
    groupStableIdNamespace: "CHICKEN-FLOCK",
  },
  "domestic-goat": {
    species: "domestic-goat",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "herbivore",
    locomotionClass: "terrestrial",
    groupOrganization: "herd",
    groupStableIdNamespace: "HERD",
  },
  "wild-boar": {
    species: "wild-boar",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "omnivore",
    locomotionClass: "terrestrial",
    groupOrganization: "sounder",
    groupStableIdNamespace: "SOUNDER",
  },
  elk: {
    species: "elk",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "herbivore",
    locomotionClass: "terrestrial",
    groupOrganization: "herd",
    groupStableIdNamespace: "HERD",
  },
  "gray-wolf": {
    species: "gray-wolf",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "carnivore",
    locomotionClass: "terrestrial",
    groupOrganization: "pack",
    groupStableIdNamespace: "PACK",
  },
  cougar: {
    species: "cougar",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "carnivore",
    locomotionClass: "terrestrial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
  "brown-bear": {
    species: "brown-bear",
    actorRepresentation: "individual",
    catalogIdentityForm: "individual",
    taxonomicClass: "mammal",
    dietClass: "omnivore",
    locomotionClass: "terrestrial",
    groupOrganization: null,
    groupStableIdNamespace: null,
  },
});

export interface CoreWildlifeFoodAffinities {
  readonly browse: number;
  readonly "shore-forage": number;
  readonly carrion: number;
  readonly "exposed-food": number;
  readonly "live-prey": number;
}

export interface CoreWildlifeBehaviorProfile {
  /** Pressure at which an alarm-capable animal emits a bounded local signal. */
  readonly alarmThreshold: number;
  readonly fleeThreshold: number;
  readonly retreatThreshold: number;
  readonly forageThreshold: number;
  readonly guardThreshold: number;
  /** Zero means this species never initiates a pursuit. */
  readonly maximumPursuitTicks: number;
}

export interface CoreWildlifeProfile {
  readonly version: typeof CORE_WILDLIFE_IDENTITY_VERSION;
  readonly species: CoreWildlifeSpecies;
  readonly maximumPatchPopulation: number;
  readonly roles: readonly CoreWildlifeEcologicalRole[];
  readonly foodAffinities: CoreWildlifeFoodAffinities;
  readonly behavior: CoreWildlifeBehaviorProfile;
  readonly morphs: readonly string[];
  readonly temperamentPairs: readonly (readonly [
    CoreWildlifeTemperament,
    CoreWildlifeTemperament,
  ])[];
  readonly traitRanges: Readonly<{
    vigilance: readonly [number, number];
    boldness: readonly [number, number];
    sociability: readonly [number, number];
  }>;
}

export interface CoreWildlifeIdentityGenerationInput {
  readonly seed: RootSeed;
  readonly species: CoreWildlifeSpecies;
  readonly originRegion: RegionCoord;
  /** Stable semantic identity for one bounded habitat population. */
  readonly populationKey: string;
  readonly populationOrdinal: number;
}

export interface CoreWildlifeIdentity {
  readonly generationVersion: typeof CORE_WILDLIFE_IDENTITY_VERSION;
  readonly stableId: string;
  readonly species: CoreWildlifeSpecies;
  readonly originRegion: RegionCoord;
  readonly populationKey: string;
  readonly populationOrdinal: number;
  readonly sex: CoreWildlifeSex;
  readonly lifeStage: CoreWildlifeLifeStage;
  readonly morph: string;
  readonly temperament: readonly [CoreWildlifeTemperament, CoreWildlifeTemperament];
  /** Persistent individual differences, fixed-point 0..1. */
  readonly traits: Readonly<{
    vigilance: number;
    boldness: number;
    sociability: number;
  }>;
}

const IDENTITY_DOMAIN = 0x5749_4c44;
const ADDRESS_DOMAIN = 0x5741_4444;
const UINT32_MAX = 0xffff_ffff;
const POPULATION_KEY_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,63}$/u;
const CANONICAL_BASE36_PATTERN = /^(?:0|[1-9a-z][0-9a-z]*)$/u;
const STABLE_ID_PATTERN = /^([A-Z]+-)v1-([0-9a-z]{7}(?:\.[0-9a-z]{7}){3})-([np][0-9a-z]+)\.([np][0-9a-z]+)-([0-9a-z]+)\.(.*)-([0-9a-z]+)$/u;

const LIFE_STAGES: readonly CoreWildlifeLifeStage[] = [
  "juvenile",
  "adult",
  "adult",
  "adult",
  "older",
];
const SEXES: readonly CoreWildlifeSex[] = ["female", "male"];

const PROFILES: Readonly<Record<CoreWildlifeSpecies, CoreWildlifeProfile>> = deepFreeze({
  deer: {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "deer",
    maximumPatchPopulation: 16,
    roles: ["alarm-source", "prey", "forager"],
    foodAffinities: {
      browse: 1_000_000,
      "shore-forage": 150_000,
      carrion: 0,
      "exposed-food": 80_000,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 430_000,
      fleeThreshold: 610_000,
      retreatThreshold: 500_000,
      forageThreshold: 360_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["red-brown", "gray-brown", "pale-spotted", "dark-backed"],
    temperamentPairs: [
      ["cautious", "watchful"],
      ["watchful", "social"],
      ["cautious", "reserved"],
      ["patient", "watchful"],
    ],
    traitRanges: {
      vigilance: [560_000, 940_000],
      boldness: [100_000, 480_000],
      sociability: [480_000, 900_000],
    },
  },
  gull: {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "gull",
    maximumPatchPopulation: 24,
    roles: ["alarm-source", "forager", "scavenger"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 900_000,
      carrion: 760_000,
      "exposed-food": 1_000_000,
      "live-prey": 120_000,
    },
    behavior: {
      alarmThreshold: 390_000,
      fleeThreshold: 690_000,
      retreatThreshold: 560_000,
      forageThreshold: 300_000,
      guardThreshold: 820_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["pale-gray", "dark-winged", "mottled-young", "white-headed"],
    temperamentPairs: [
      ["bold", "opportunistic"],
      ["watchful", "social"],
      ["cautious", "opportunistic"],
      ["bold", "watchful"],
    ],
    traitRanges: {
      vigilance: [480_000, 900_000],
      boldness: [300_000, 850_000],
      sociability: [500_000, 930_000],
    },
  },
  "black-bear": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "black-bear",
    maximumPatchPopulation: 4,
    roles: ["forager", "scavenger", "predator", "omnivore"],
    foodAffinities: {
      browse: 560_000,
      "shore-forage": 520_000,
      carrion: 870_000,
      "exposed-food": 940_000,
      "live-prey": 780_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 840_000,
      retreatThreshold: 620_000,
      forageThreshold: 310_000,
      guardThreshold: 540_000,
      maximumPursuitTicks: 10,
    },
    morphs: ["black", "brown-black", "cinnamon", "pale-muzzle"],
    temperamentPairs: [
      ["reserved", "patient"],
      ["cautious", "opportunistic"],
      ["bold", "opportunistic"],
      ["watchful", "reserved"],
    ],
    traitRanges: {
      vigilance: [360_000, 780_000],
      boldness: [260_000, 760_000],
      sociability: [40_000, 260_000],
    },
  },
  "brown-rat": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "brown-rat",
    maximumPatchPopulation: 48,
    roles: ["prey", "small-prey", "forager", "scavenger", "omnivore"],
    foodAffinities: {
      browse: 260_000,
      "shore-forage": 340_000,
      carrion: 420_000,
      "exposed-food": 1_000_000,
      "live-prey": 80_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 500_000,
      retreatThreshold: 420_000,
      forageThreshold: 260_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["brown-agouti", "dark-brown", "gray-brown", "pale-bellied"],
    temperamentPairs: [
      ["cautious", "opportunistic"],
      ["watchful", "social"],
      ["cautious", "reserved"],
      ["bold", "opportunistic"],
    ],
    traitRanges: {
      vigilance: [600_000, 960_000],
      boldness: [120_000, 620_000],
      sociability: [420_000, 880_000],
    },
  },
  "domestic-cat": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "domestic-cat",
    maximumPatchPopulation: 4,
    roles: ["forager", "predator", "small-predator"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 220_000,
      carrion: 440_000,
      "exposed-food": 580_000,
      "live-prey": 1_000_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 720_000,
      retreatThreshold: 520_000,
      forageThreshold: 300_000,
      guardThreshold: 660_000,
      maximumPursuitTicks: 8,
    },
    morphs: ["black", "brown-tabby", "gray-tabby", "tortoiseshell"],
    temperamentPairs: [
      ["reserved", "patient"],
      ["cautious", "watchful"],
      ["bold", "opportunistic"],
      ["watchful", "reserved"],
    ],
    traitRanges: {
      vigilance: [480_000, 900_000],
      boldness: [240_000, 820_000],
      sociability: [80_000, 500_000],
    },
  },
  "marsh-rabbit": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "marsh-rabbit",
    maximumPatchPopulation: 24,
    roles: ["alarm-source", "prey", "small-prey", "forager"],
    foodAffinities: {
      browse: 1_000_000,
      "shore-forage": 420_000,
      carrion: 0,
      "exposed-food": 120_000,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 350_000,
      fleeThreshold: 520_000,
      retreatThreshold: 440_000,
      forageThreshold: 320_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["marsh-brown", "gray-brown", "rufous-backed", "pale-bellied"],
    temperamentPairs: [
      ["cautious", "watchful"],
      ["watchful", "social"],
      ["cautious", "reserved"],
      ["patient", "watchful"],
    ],
    traitRanges: {
      vigilance: [680_000, 980_000],
      boldness: [60_000, 360_000],
      sociability: [240_000, 720_000],
    },
  },
  "marsh-fox": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "marsh-fox",
    maximumPatchPopulation: 3,
    roles: ["forager", "scavenger", "predator", "small-predator", "omnivore"],
    foodAffinities: {
      browse: 140_000,
      "shore-forage": 500_000,
      carrion: 650_000,
      "exposed-food": 720_000,
      "live-prey": 1_000_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 760_000,
      retreatThreshold: 560_000,
      forageThreshold: 280_000,
      guardThreshold: 620_000,
      maximumPursuitTicks: 7,
    },
    morphs: ["red", "silver-red", "dark-legged", "pale-muzzled"],
    temperamentPairs: [
      ["cautious", "opportunistic"],
      ["bold", "opportunistic"],
      ["watchful", "patient"],
      ["reserved", "watchful"],
    ],
    traitRanges: {
      vigilance: [520_000, 920_000],
      boldness: [260_000, 800_000],
      sociability: [80_000, 420_000],
    },
  },
  "fish-crow": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "fish-crow",
    maximumPatchPopulation: 3,
    roles: ["alarm-source", "forager", "scavenger", "omnivore"],
    foodAffinities: {
      browse: 40_000,
      "shore-forage": 780_000,
      carrion: 620_000,
      "exposed-food": 940_000,
      "live-prey": 180_000,
    },
    behavior: {
      alarmThreshold: 360_000,
      fleeThreshold: 760_000,
      retreatThreshold: 580_000,
      forageThreshold: 280_000,
      guardThreshold: 560_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["blue-iridescent", "brownish-young", "glossy-black", "worn-feathers"],
    temperamentPairs: [
      ["bold", "social"],
      ["watchful", "opportunistic"],
      ["cautious", "social"],
      ["bold", "watchful"],
    ],
    traitRanges: {
      vigilance: [620_000, 960_000],
      boldness: [300_000, 860_000],
      sociability: [660_000, 980_000],
    },
  },
  "northern-harrier": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "northern-harrier",
    maximumPatchPopulation: 1,
    roles: ["forager", "predator", "small-predator"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 260_000,
      carrion: 100_000,
      "exposed-food": 40_000,
      "live-prey": 1_000_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 820_000,
      retreatThreshold: 620_000,
      forageThreshold: 250_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 8,
    },
    morphs: ["cinnamon-streaked", "dark-mottled", "pale-gray", "warm-brown"],
    temperamentPairs: [
      ["patient", "watchful"],
      ["cautious", "patient"],
      ["bold", "watchful"],
      ["reserved", "patient"],
    ],
    traitRanges: {
      vigilance: [700_000, 980_000],
      boldness: [180_000, 700_000],
      sociability: [20_000, 220_000],
    },
  },
  "southern-leopard-frog": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "southern-leopard-frog",
    maximumPatchPopulation: 72,
    roles: ["prey", "small-prey", "forager"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 620_000,
      carrion: 0,
      "exposed-food": 0,
      "live-prey": 860_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 480_000,
      retreatThreshold: 400_000,
      forageThreshold: 300_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["bronze-backed", "brown-spotted", "green-spotted", "pale-lipped"],
    temperamentPairs: [
      ["cautious", "watchful"],
      ["reserved", "watchful"],
      ["patient", "cautious"],
      ["watchful", "social"],
    ],
    traitRanges: {
      vigilance: [620_000, 980_000],
      boldness: [40_000, 360_000],
      sociability: [300_000, 860_000],
    },
  },
  "atlantic-silverside": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "atlantic-silverside",
    maximumPatchPopulation: 48,
    roles: ["prey", "small-prey", "forager"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 1_000_000,
      carrion: 0,
      "exposed-food": 0,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 460_000,
      retreatThreshold: 380_000,
      forageThreshold: 260_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["bright-sided", "olive-backed", "pale-sided", "silver-green"],
    temperamentPairs: [
      ["cautious", "social"],
      ["watchful", "social"],
      ["cautious", "watchful"],
      ["social", "opportunistic"],
    ],
    traitRanges: {
      vigilance: [620_000, 960_000],
      boldness: [80_000, 420_000],
      sociability: [820_000, 1_000_000],
    },
  },
  "atlantic-marsh-fiddler-crab": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "atlantic-marsh-fiddler-crab",
    maximumPatchPopulation: 80,
    roles: ["prey", "small-prey", "forager", "detritivore"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 1_000_000,
      carrion: 0,
      "exposed-food": 0,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 420_000,
      retreatThreshold: 340_000,
      forageThreshold: 220_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["dark-carapace", "mottled-brown", "olive-brown", "pale-clawed"],
    temperamentPairs: [
      ["cautious", "watchful"],
      ["patient", "social"],
      ["reserved", "watchful"],
      ["cautious", "social"],
    ],
    traitRanges: {
      vigilance: [660_000, 980_000],
      boldness: [40_000, 360_000],
      sociability: [380_000, 860_000],
    },
  },
  "snowy-egret": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "snowy-egret",
    maximumPatchPopulation: 1,
    roles: ["forager"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 1_000_000,
      carrion: 0,
      "exposed-food": 0,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 780_000,
      retreatThreshold: 560_000,
      forageThreshold: 240_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["breeding-plumes", "clean-white", "gray-lored", "worn-plumes"],
    temperamentPairs: [
      ["patient", "watchful"],
      ["cautious", "patient"],
      ["bold", "watchful"],
      ["reserved", "patient"],
    ],
    traitRanges: {
      vigilance: [680_000, 980_000],
      boldness: [160_000, 660_000],
      sociability: [120_000, 540_000],
    },
  },
  "american-black-duck": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "american-black-duck",
    maximumPatchPopulation: 1,
    roles: ["alarm-source", "prey", "small-prey", "forager", "omnivore"],
    foodAffinities: {
      browse: 780_000,
      "shore-forage": 1_000_000,
      carrion: 0,
      "exposed-food": 140_000,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 360_000,
      fleeThreshold: 650_000,
      retreatThreshold: 520_000,
      forageThreshold: 260_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["deep-chocolate", "mottled-brown", "pale-faced", "warm-brown"],
    temperamentPairs: [
      ["cautious", "watchful"],
      ["patient", "watchful"],
      ["social", "opportunistic"],
      ["watchful", "social"],
    ],
    traitRanges: {
      vigilance: [620_000, 960_000],
      boldness: [100_000, 520_000],
      sociability: [240_000, 700_000],
    },
  },
  "north-american-river-otter": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "north-american-river-otter",
    maximumPatchPopulation: 1,
    roles: ["forager", "scavenger", "predator", "small-predator"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 900_000,
      carrion: 380_000,
      "exposed-food": 420_000,
      "live-prey": 1_000_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 800_000,
      retreatThreshold: 600_000,
      forageThreshold: 240_000,
      guardThreshold: 620_000,
      maximumPursuitTicks: 9,
    },
    morphs: ["dark-chocolate", "rich-brown", "silver-muzzled", "warm-brown"],
    temperamentPairs: [
      ["cautious", "opportunistic"],
      ["bold", "opportunistic"],
      ["watchful", "patient"],
      ["reserved", "watchful"],
    ],
    traitRanges: {
      vigilance: [520_000, 900_000],
      boldness: [240_000, 820_000],
      sociability: [180_000, 700_000],
    },
  },
  "domestic-chicken": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "domestic-chicken",
    maximumPatchPopulation: 3,
    roles: ["alarm-source", "prey", "small-prey", "forager", "omnivore"],
    foodAffinities: {
      browse: 680_000,
      "shore-forage": 420_000,
      carrion: 0,
      "exposed-food": 1_000_000,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 320_000,
      fleeThreshold: 520_000,
      retreatThreshold: 440_000,
      forageThreshold: 240_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["black-feathered", "buff-feathered", "red-brown", "white-speckled"],
    temperamentPairs: [
      ["cautious", "social"],
      ["watchful", "social"],
      ["bold", "opportunistic"],
      ["patient", "watchful"],
    ],
    traitRanges: {
      vigilance: [580_000, 960_000],
      boldness: [120_000, 700_000],
      sociability: [680_000, 980_000],
    },
  },
  "domestic-goat": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "domestic-goat",
    maximumPatchPopulation: 2,
    roles: ["alarm-source", "prey", "forager"],
    foodAffinities: {
      browse: 1_000_000,
      "shore-forage": 0,
      carrion: 0,
      "exposed-food": 0,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 400_000,
      fleeThreshold: 600_000,
      retreatThreshold: 480_000,
      forageThreshold: 260_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["black-coated", "brown-coated", "cream-coated", "pied-coated"],
    temperamentPairs: [
      ["cautious", "social"],
      ["watchful", "social"],
      ["bold", "patient"],
      ["reserved", "watchful"],
    ],
    traitRanges: {
      vigilance: [520_000, 920_000],
      boldness: [160_000, 720_000],
      sociability: [700_000, 980_000],
    },
  },
  "wild-boar": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "wild-boar",
    maximumPatchPopulation: 7,
    roles: ["alarm-source", "prey", "forager", "scavenger", "omnivore"],
    foodAffinities: {
      browse: 900_000,
      "shore-forage": 360_000,
      carrion: 720_000,
      "exposed-food": 680_000,
      "live-prey": 120_000,
    },
    behavior: {
      alarmThreshold: 460_000,
      fleeThreshold: 720_000,
      retreatThreshold: 560_000,
      forageThreshold: 280_000,
      guardThreshold: 600_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["bristled-black", "dark-brown", "grizzled", "rufous-brown"],
    temperamentPairs: [
      ["watchful", "social"],
      ["bold", "opportunistic"],
      ["cautious", "reserved"],
      ["patient", "watchful"],
    ],
    traitRanges: {
      vigilance: [480_000, 900_000],
      boldness: [220_000, 820_000],
      sociability: [380_000, 880_000],
    },
  },
  elk: {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "elk",
    maximumPatchPopulation: 12,
    roles: ["alarm-source", "prey", "forager"],
    foodAffinities: {
      browse: 1_000_000,
      "shore-forage": 120_000,
      carrion: 0,
      "exposed-food": 40_000,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 400_000,
      fleeThreshold: 620_000,
      retreatThreshold: 500_000,
      forageThreshold: 320_000,
      guardThreshold: 1_000_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["dark-maned", "golden-brown", "pale-rumped", "winter-gray"],
    temperamentPairs: [
      ["cautious", "watchful"],
      ["watchful", "social"],
      ["patient", "social"],
      ["reserved", "watchful"],
    ],
    traitRanges: {
      vigilance: [580_000, 960_000],
      boldness: [100_000, 520_000],
      sociability: [560_000, 940_000],
    },
  },
  "gray-wolf": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "gray-wolf",
    maximumPatchPopulation: 6,
    roles: ["forager", "scavenger", "predator"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 100_000,
      carrion: 820_000,
      "exposed-food": 420_000,
      "live-prey": 1_000_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 820_000,
      retreatThreshold: 620_000,
      forageThreshold: 260_000,
      guardThreshold: 540_000,
      maximumPursuitTicks: 12,
    },
    morphs: ["charcoal-gray", "grizzled-gray", "pale-gray", "tawny-gray"],
    temperamentPairs: [
      ["patient", "social"],
      ["watchful", "social"],
      ["cautious", "patient"],
      ["bold", "watchful"],
    ],
    traitRanges: {
      vigilance: [580_000, 940_000],
      boldness: [200_000, 760_000],
      sociability: [620_000, 960_000],
    },
  },
  cougar: {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "cougar",
    maximumPatchPopulation: 2,
    roles: ["forager", "scavenger", "predator"],
    foodAffinities: {
      browse: 0,
      "shore-forage": 80_000,
      carrion: 720_000,
      "exposed-food": 260_000,
      "live-prey": 1_000_000,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 880_000,
      retreatThreshold: 660_000,
      forageThreshold: 260_000,
      guardThreshold: 520_000,
      maximumPursuitTicks: 10,
    },
    morphs: ["gray-tawny", "pale-tawny", "reddish-tawny", "warm-tawny"],
    temperamentPairs: [
      ["cautious", "patient"],
      ["watchful", "reserved"],
      ["bold", "patient"],
      ["opportunistic", "watchful"],
    ],
    traitRanges: {
      vigilance: [620_000, 980_000],
      boldness: [180_000, 780_000],
      sociability: [40_000, 260_000],
    },
  },
  "brown-bear": {
    version: CORE_WILDLIFE_IDENTITY_VERSION,
    species: "brown-bear",
    maximumPatchPopulation: 2,
    roles: ["forager", "scavenger", "predator", "omnivore"],
    foodAffinities: {
      browse: 640_000,
      "shore-forage": 420_000,
      carrion: 920_000,
      "exposed-food": 980_000,
      "live-prey": 0,
    },
    behavior: {
      alarmThreshold: 1_000_000,
      fleeThreshold: 900_000,
      retreatThreshold: 680_000,
      forageThreshold: 300_000,
      guardThreshold: 500_000,
      maximumPursuitTicks: 0,
    },
    morphs: ["dark-brown", "golden-brown", "grizzled-brown", "reddish-brown"],
    temperamentPairs: [
      ["reserved", "patient"],
      ["cautious", "watchful"],
      ["bold", "opportunistic"],
      ["patient", "opportunistic"],
    ],
    traitRanges: {
      vigilance: [460_000, 900_000],
      boldness: [220_000, 860_000],
      sociability: [30_000, 240_000],
    },
  },
});

export const CORE_WILDLIFE_PROFILES: readonly CoreWildlifeProfile[] = Object.freeze(
  CORE_WILDLIFE_SPECIES.map((species) => PROFILES[species]),
);

export function getCoreWildlifeProfile(species: CoreWildlifeSpecies): CoreWildlifeProfile {
  const profile = PROFILES[species];
  if (profile === undefined) throw new TypeError(`Unsupported core wildlife species ${String(species)}`);
  return profile;
}

export function getCoreWildlifeSpeciesMetadata(
  species: CoreWildlifeSpecies,
): CoreWildlifeSpeciesMetadata {
  const metadata = CORE_WILDLIFE_SPECIES_METADATA_BY_SPECIES[species];
  if (metadata === undefined) {
    throw new TypeError(`Unsupported core wildlife species ${String(species)}`);
  }
  return metadata;
}

export function coreWildlifeIdPrefix(
  species: CoreWildlifeSpecies,
): (typeof CORE_WILDLIFE_ID_PREFIX_BY_SPECIES)[CoreWildlifeSpecies] {
  const prefix = CORE_WILDLIFE_ID_PREFIX_BY_SPECIES[species];
  if (prefix === undefined) throw new TypeError(`Unsupported core wildlife species ${String(species)}`);
  return prefix;
}

/** Stable semantic identity; runtime allocation and materialization order are absent. */
export function stableCoreWildlifeId(input: CoreWildlifeIdentityGenerationInput): string {
  assertGenerationInput(input);
  const seed = input.seed.map((word) => word.toString(36).padStart(7, "0")).join(".");
  const region = `${encodeSigned(input.originRegion.x)}.${encodeSigned(input.originRegion.y)}`;
  return `${coreWildlifeIdPrefix(input.species)}v1-${seed}-${region}-${input.populationKey.length.toString(36)}.${input.populationKey}-${input.populationOrdinal.toString(36)}`;
}

export function generateCoreWildlifeIdentity(
  input: CoreWildlifeIdentityGenerationInput,
): CoreWildlifeIdentity {
  assertGenerationInput(input);
  const profile = getCoreWildlifeProfile(input.species);
  const temperament = profile.temperamentPairs[
    draw(input, 0x10, 0, profile.temperamentPairs.length - 1)
  ];
  const morph = profile.morphs[draw(input, 0x11, 0, profile.morphs.length - 1)];
  if (temperament === undefined || morph === undefined) {
    throw new Error("Core wildlife profile dictionaries cannot be empty");
  }
  return deepFreeze({
    generationVersion: CORE_WILDLIFE_IDENTITY_VERSION,
    stableId: stableCoreWildlifeId(input),
    species: input.species,
    originRegion: createRegionCoord(input.originRegion.x, input.originRegion.y),
    populationKey: input.populationKey,
    populationOrdinal: input.populationOrdinal,
    sex: SEXES[draw(input, 0x12, 0, SEXES.length - 1)] ?? "female",
    lifeStage: LIFE_STAGES[draw(input, 0x13, 0, LIFE_STAGES.length - 1)] ?? "adult",
    morph,
    temperament: [temperament[0], temperament[1]],
    traits: {
      vigilance: draw(input, 0x14, ...profile.traitRanges.vigilance),
      boldness: draw(input, 0x15, ...profile.traitRanges.boldness),
      sociability: draw(input, 0x16, ...profile.traitRanges.sociability),
    },
  });
}

/** Strict persisted-shape check regenerated from the lossless identity address. */
export function canonicalizeCoreWildlifeIdentity(value: unknown): CoreWildlifeIdentity | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "generationVersion",
    "lifeStage",
    "morph",
    "originRegion",
    "populationKey",
    "populationOrdinal",
    "sex",
    "species",
    "stableId",
    "temperament",
    "traits",
  ])) return null;
  if (
    value.generationVersion !== CORE_WILDLIFE_IDENTITY_VERSION
    || typeof value.stableId !== "string"
  ) return null;
  const input = generationInputFromStableId(value.stableId);
  if (input === null) return null;
  const generated = generateCoreWildlifeIdentity(input);
  return stableStringify(generated) === stableStringify(value) ? generated : null;
}

export function assertCoreWildlifeIdentity(value: unknown): asserts value is CoreWildlifeIdentity {
  if (canonicalizeCoreWildlifeIdentity(value) === null) {
    throw new TypeError("Core wildlife identity is malformed or incoherent");
  }
}

export function assertCoreWildlifeProfiles(): void {
  for (const species of CORE_WILDLIFE_SPECIES) {
    const profile = PROFILES[species];
    const metadata = CORE_WILDLIFE_SPECIES_METADATA_BY_SPECIES[species];
    if (
      profile.version !== CORE_WILDLIFE_IDENTITY_VERSION
      || profile.species !== species
      || metadata.species !== species
      || ((metadata.groupOrganization === null) !== (metadata.groupStableIdNamespace === null))
      || profile.roles.length === 0
      || new Set(profile.roles).size !== profile.roles.length
      || profile.morphs.length < 3
      || profile.temperamentPairs.length < 3
      || !positiveSafeInteger(profile.maximumPatchPopulation)
      || !Object.values(profile.foodAffinities).every(scaledUnit)
      || !Object.values(profile.behavior).every((entry) => nonnegativeSafeInteger(entry))
      || !Object.values(profile.traitRanges).every(([minimum, maximum]) =>
        scaledUnit(minimum) && scaledUnit(maximum) && minimum <= maximum
      )
    ) throw new Error(`Core wildlife profile ${species} is incoherent`);
    if (profile.behavior.maximumPursuitTicks > 64) {
      throw new Error(`Core wildlife profile ${species} has an unbounded pursuit`);
    }
  }
  if (new Set(Object.values(CORE_WILDLIFE_ID_PREFIX_BY_SPECIES)).size !== CORE_WILDLIFE_SPECIES.length) {
    throw new Error("Core wildlife identity prefixes must remain exclusive");
  }
}

function generationInputFromStableId(stableId: string): CoreWildlifeIdentityGenerationInput | null {
  const match = STABLE_ID_PATTERN.exec(stableId);
  if (match === null) return null;
  const [, prefix, seedText, xText, yText, keyLengthText, populationKey, ordinalText] = match;
  if (
    prefix === undefined
    || seedText === undefined
    || xText === undefined
    || yText === undefined
    || keyLengthText === undefined
    || populationKey === undefined
    || ordinalText === undefined
  ) return null;
  const species = speciesFromPrefix(prefix);
  const seedParts = seedText.split(".");
  if (species === null || seedParts.length !== 4) return null;
  const seedWords = seedParts.map((part) => parseBase36(part, true));
  if (seedWords.some((word) => word === null || word > UINT32_MAX)) return null;
  const x = parseSigned(xText);
  const y = parseSigned(yText);
  const keyLength = parseBase36(keyLengthText, false);
  const populationOrdinal = parseBase36(ordinalText, false);
  if (
    x === null
    || y === null
    || keyLength === null
    || populationOrdinal === null
    || keyLength !== populationKey.length
  ) return null;
  try {
    const input: CoreWildlifeIdentityGenerationInput = {
      seed: seedWords as [number, number, number, number],
      species,
      originRegion: createRegionCoord(x, y),
      populationKey,
      populationOrdinal,
    };
    assertGenerationInput(input);
    return stableCoreWildlifeId(input) === stableId ? input : null;
  } catch {
    return null;
  }
}

function speciesFromPrefix(value: string): CoreWildlifeSpecies | null {
  for (const species of CORE_WILDLIFE_SPECIES) {
    if (coreWildlifeIdPrefix(species) === value) return species;
  }
  return null;
}

function assertGenerationInput(input: CoreWildlifeIdentityGenerationInput): void {
  if (
    !plainRecord(input)
    || !Array.isArray(input.seed)
    || input.seed.length !== 4
    || input.seed.some((word) =>
      !Number.isSafeInteger(word)
      || word < 0
      || word > UINT32_MAX
      || Object.is(word, -0)
    )
    || !CORE_WILDLIFE_SPECIES.includes(input.species)
    || !isRegionCoord(input.originRegion)
    || typeof input.populationKey !== "string"
    || !POPULATION_KEY_PATTERN.test(input.populationKey)
    || input.populationKey !== input.populationKey.normalize("NFC")
    || !nonnegativeSafeInteger(input.populationOrdinal)
  ) throw new RangeError("Core wildlife identity inputs must use canonical stable values");
}

function addressToken(input: CoreWildlifeIdentityGenerationInput, purpose: number): number {
  return keyedRandomU32(
    input.seed,
    ADDRESS_DOMAIN,
    input.populationOrdinal,
    semanticTextToken(`${input.species}:${input.populationKey}`),
    purpose,
    semanticTextToken(`${input.originRegion.x}:${input.originRegion.y}`),
  );
}

function draw(
  input: CoreWildlifeIdentityGenerationInput,
  purpose: number,
  minimum: number,
  maximum: number,
): number {
  return keyedRandomInt(
    input.seed,
    IDENTITY_DOMAIN,
    input.originRegion.x,
    input.originRegion.y,
    purpose,
    minimum,
    maximum,
    addressToken(input, purpose),
  );
}

function semanticTextToken(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash;
}

function encodeSigned(value: number): string {
  return value < 0 ? `n${(-value).toString(36)}` : `p${value.toString(36)}`;
}

function parseSigned(value: string): number | null {
  if (!/^[np](?:0|[1-9a-z][0-9a-z]*)$/u.test(value)) return null;
  const magnitude = parseBase36(value.slice(1), false);
  if (magnitude === null || (value[0] === "n" && magnitude === 0)) return null;
  const result = value[0] === "n" ? -magnitude : magnitude;
  return Number.isSafeInteger(result) && !Object.is(result, -0) ? result : null;
}

function parseBase36(value: string, padded: boolean): number | null {
  if (
    (padded ? !/^[0-9a-z]{7}$/u.test(value) : !CANONICAL_BASE36_PATTERN.test(value))
  ) return null;
  const parsed = Number.parseInt(value, 36);
  return Number.isSafeInteger(parsed) && parsed >= 0 && !Object.is(parsed, -0) ? parsed : null;
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

assertCoreWildlifeProfiles();
