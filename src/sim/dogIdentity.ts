import { keyedRandomInt, keyedRandomU32, type RootSeed } from "./rng";
import {
  createRegionCoord,
  isRegionCoord,
  type RegionCoord,
} from "./regions";
import { FIXED_POINT } from "./types";
import { stableStringify } from "./util";

export const DOG_GENERATION_VERSION = 1;

/**
 * This is an immutable origin namespace, not the dog's current relationship.
 * A regional dog that later becomes a companion keeps its regional identity.
 */
export type DogOriginNamespace = "regional" | "authored" | "woven";

export type DogHabitatClass =
  | "settlement-edge"
  | "coastal-lowland"
  | "temperate-route"
  | "upland"
  | "cold-region"
  | "remote-wildland";

export type DogAncestryType =
  | "village-dog"
  | "retriever-type"
  | "shepherd-type"
  | "terrier-type"
  | "mastiff-type"
  | "spitz-type"
  | "hound-type"
  | "small-companion-type"
  | "general-mixed-type";

export type DogAgeClass = "puppy" | "young" | "adult" | "senior";
export type DogSex = "female" | "male";
export type DogSize = "tiny" | "small" | "medium" | "large" | "very-large";
export type DogCoatLength = "short" | "medium" | "long" | "double";
export type DogCoatColor =
  | "black"
  | "brown"
  | "chocolate"
  | "tan"
  | "cream"
  | "gold"
  | "white"
  | "gray"
  | "red"
  | "blue-gray";
export type DogCoatPattern =
  | "solid"
  | "bicolor"
  | "tricolor"
  | "patched"
  | "speckled"
  | "masked"
  | "sable"
  | "brindle";
export type DogDistinguishingMark =
  | "none"
  | "white-chest"
  | "white-toes"
  | "white-tail-tip"
  | "face-blaze"
  | "dark-eye-patch"
  | "one-ear-notch"
  | "old-ear-scar"
  | "muzzle-scar"
  | "crooked-tail"
  | "speckled-nose"
  | "one-floppy-ear"
  | "graying-muzzle";
export type DogTemperament =
  | "calm"
  | "nervous"
  | "bold"
  | "cautious"
  | "curious"
  | "social"
  | "reserved"
  | "protective"
  | "playful"
  | "independent"
  | "observant"
  | "food-motivated"
  | "persistent";
export type DogHumanFamiliarityLevel = "feral" | "wary" | "habituated" | "socialized";
export type DogInjury = "bruise" | "cut" | "sprain" | "bite" | "cold-injury";

export interface DogIdentityGenerationInput {
  readonly seed: RootSeed;
  readonly originRegion: RegionCoord;
  readonly originNamespace: DogOriginNamespace;
  readonly habitatClass: DogHabitatClass;
  /** Stable semantic identity for the physical habitat, independent of load order. */
  readonly habitatKey: string;
  /** Stable semantic identity for the population occupying that habitat. */
  readonly populationKey: string;
  readonly populationOrdinal: number;
}

export interface DogAncestry {
  readonly kind: "single-type" | "mixed";
  readonly primary: DogAncestryType;
  readonly secondary: DogAncestryType | null;
}

export interface DogBody {
  readonly size: DogSize;
  readonly shoulderHeightCm: number;
  readonly massGrams: number;
}

export interface DogCoat {
  readonly primaryColor: DogCoatColor;
  readonly secondaryColor: DogCoatColor | null;
  readonly pattern: DogCoatPattern;
  readonly length: DogCoatLength;
  readonly distinguishingMark: DogDistinguishingMark;
}

/** Fixed-point tolerances describe relative adaptation, never immunity. */
export interface DogWeatherAdaptation {
  readonly coldTolerance: number;
  readonly heatTolerance: number;
  readonly rainTolerance: number;
  readonly waterConfidence: number;
}

export interface DogIdentity {
  readonly stableId: string;
  readonly generationVersion: number;
  readonly species: "domestic-dog";
  readonly originRegion: RegionCoord;
  readonly originNamespace: DogOriginNamespace;
  readonly habitatClass: DogHabitatClass;
  readonly habitatKey: string;
  readonly populationKey: string;
  readonly populationOrdinal: number;
  readonly ancestry: DogAncestry;
  readonly age: DogAgeClass;
  readonly sex: DogSex;
  readonly body: DogBody;
  readonly coat: DogCoat;
  readonly temperament: readonly [DogTemperament, DogTemperament];
  readonly weatherAdaptation: DogWeatherAdaptation;
}

/** All values are pressure from 0 (satisfied) to FIXED_POINT (urgent). */
export interface DogNeeds {
  hunger: number;
  thirst: number;
  rest: number;
  safety: number;
  company: number;
}

export interface DogCondition {
  health: number;
  wetness: number;
  coldStress: number;
  heatStress: number;
  exhaustion: number;
  injuries: DogInjury[];
}

/** Familiarity is not trust, affection, ownership, training, or companion bond. */
export interface DogHumanFamiliarity {
  level: DogHumanFamiliarityLevel;
  confidence: number;
}

export interface GeneratedDogState {
  readonly identity: DogIdentity;
  needs: DogNeeds;
  condition: DogCondition;
  humanFamiliarity: DogHumanFamiliarity;
}

interface WeightedValue<T> {
  readonly value: T;
  readonly weight: number;
}

interface DogMorphologyProfile {
  readonly type: DogAncestryType;
  readonly adultHeightCm: readonly [number, number];
  readonly adultMassGrams: readonly [number, number];
  readonly coatLengthWeights: Readonly<Record<DogCoatLength, number>>;
  readonly coldBias: number;
  readonly heatBias: number;
  readonly rainBias: number;
  readonly waterBias: number;
}

interface DogCoatProfile {
  readonly primaryColor: DogCoatColor;
  readonly secondaryColor: DogCoatColor | null;
  readonly pattern: DogCoatPattern;
  readonly weight: number;
}

const DOG_IDENTITY_DOMAIN = 0x444f_4749;
const DOG_ADDRESS_DOMAIN = 0x444f_4741;
const SEMANTIC_KEY_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,47}$/u;
const STABLE_ID_PREFIX_PATTERN = /^D-([RAW])-v1-([0-9a-z]{7}(?:\.[0-9a-z]{7}){3})-([np][0-9a-z]+)\.([np][0-9a-z]+)-([SCTUKR])-(.*)$/u;

const ORIGIN_NAMESPACES: readonly DogOriginNamespace[] = ["regional", "authored", "woven"];
const HABITAT_CLASSES: readonly DogHabitatClass[] = [
  "settlement-edge",
  "coastal-lowland",
  "temperate-route",
  "upland",
  "cold-region",
  "remote-wildland",
];
const AGES: readonly WeightedValue<DogAgeClass>[] = [
  { value: "puppy", weight: 8 },
  { value: "young", weight: 19 },
  { value: "adult", weight: 57 },
  { value: "senior", weight: 16 },
];
const SEXES: readonly WeightedValue<DogSex>[] = [
  { value: "female", weight: 1 },
  { value: "male", weight: 1 },
];

/** Physical ancestry profiles contain morphology only, never personality. */
const MORPHOLOGY_PROFILES: readonly DogMorphologyProfile[] = [
  {
    type: "village-dog",
    adultHeightCm: [34, 57],
    adultMassGrams: [9_000, 28_000],
    coatLengthWeights: { short: 48, medium: 34, long: 8, double: 10 },
    coldBias: 0,
    heatBias: 70_000,
    rainBias: 10_000,
    waterBias: 20_000,
  },
  {
    type: "retriever-type",
    adultHeightCm: [49, 63],
    adultMassGrams: [20_000, 38_000],
    coatLengthWeights: { short: 12, medium: 45, long: 25, double: 18 },
    coldBias: 45_000,
    heatBias: -20_000,
    rainBias: 75_000,
    waterBias: 150_000,
  },
  {
    type: "shepherd-type",
    adultHeightCm: [46, 67],
    adultMassGrams: [17_000, 43_000],
    coatLengthWeights: { short: 18, medium: 37, long: 18, double: 27 },
    coldBias: 85_000,
    heatBias: -45_000,
    rainBias: 20_000,
    waterBias: 5_000,
  },
  {
    type: "terrier-type",
    adultHeightCm: [23, 46],
    adultMassGrams: [4_000, 17_000],
    coatLengthWeights: { short: 50, medium: 30, long: 14, double: 6 },
    coldBias: -35_000,
    heatBias: 65_000,
    rainBias: -10_000,
    waterBias: -25_000,
  },
  {
    type: "mastiff-type",
    adultHeightCm: [57, 78],
    adultMassGrams: [34_000, 76_000],
    coatLengthWeights: { short: 70, medium: 22, long: 6, double: 2 },
    coldBias: -30_000,
    heatBias: 10_000,
    rainBias: -25_000,
    waterBias: -65_000,
  },
  {
    type: "spitz-type",
    adultHeightCm: [27, 62],
    adultMassGrams: [6_000, 34_000],
    coatLengthWeights: { short: 2, medium: 14, long: 20, double: 64 },
    coldBias: 155_000,
    heatBias: -145_000,
    rainBias: 65_000,
    waterBias: 10_000,
  },
  {
    type: "hound-type",
    adultHeightCm: [37, 69],
    adultMassGrams: [10_000, 39_000],
    coatLengthWeights: { short: 64, medium: 25, long: 8, double: 3 },
    coldBias: -35_000,
    heatBias: 80_000,
    rainBias: -20_000,
    waterBias: 0,
  },
  {
    type: "small-companion-type",
    adultHeightCm: [18, 34],
    adultMassGrams: [2_000, 10_000],
    coatLengthWeights: { short: 38, medium: 25, long: 31, double: 6 },
    coldBias: -80_000,
    heatBias: 55_000,
    rainBias: -55_000,
    waterBias: -100_000,
  },
  {
    type: "general-mixed-type",
    adultHeightCm: [29, 64],
    adultMassGrams: [7_000, 37_000],
    coatLengthWeights: { short: 42, medium: 34, long: 13, double: 11 },
    coldBias: 0,
    heatBias: 20_000,
    rainBias: 0,
    waterBias: 0,
  },
];

const TYPE_WEIGHTS_BY_HABITAT: Readonly<
  Record<DogHabitatClass, readonly WeightedValue<DogAncestryType>[]>
> = {
  "settlement-edge": [
    { value: "village-dog", weight: 30 },
    { value: "general-mixed-type", weight: 22 },
    { value: "terrier-type", weight: 11 },
    { value: "small-companion-type", weight: 10 },
    { value: "retriever-type", weight: 9 },
    { value: "shepherd-type", weight: 8 },
    { value: "hound-type", weight: 5 },
    { value: "mastiff-type", weight: 3 },
    { value: "spitz-type", weight: 2 },
  ],
  "coastal-lowland": [
    { value: "village-dog", weight: 27 },
    { value: "general-mixed-type", weight: 23 },
    { value: "retriever-type", weight: 15 },
    { value: "hound-type", weight: 10 },
    { value: "terrier-type", weight: 9 },
    { value: "shepherd-type", weight: 6 },
    { value: "small-companion-type", weight: 5 },
    { value: "mastiff-type", weight: 3 },
    { value: "spitz-type", weight: 2 },
  ],
  "temperate-route": [
    { value: "general-mixed-type", weight: 25 },
    { value: "village-dog", weight: 20 },
    { value: "shepherd-type", weight: 14 },
    { value: "hound-type", weight: 12 },
    { value: "retriever-type", weight: 10 },
    { value: "terrier-type", weight: 8 },
    { value: "spitz-type", weight: 5 },
    { value: "mastiff-type", weight: 4 },
    { value: "small-companion-type", weight: 2 },
  ],
  upland: [
    { value: "shepherd-type", weight: 24 },
    { value: "general-mixed-type", weight: 21 },
    { value: "hound-type", weight: 15 },
    { value: "spitz-type", weight: 13 },
    { value: "village-dog", weight: 11 },
    { value: "mastiff-type", weight: 7 },
    { value: "retriever-type", weight: 5 },
    { value: "terrier-type", weight: 3 },
    { value: "small-companion-type", weight: 1 },
  ],
  "cold-region": [
    { value: "spitz-type", weight: 31 },
    { value: "shepherd-type", weight: 20 },
    { value: "general-mixed-type", weight: 17 },
    { value: "retriever-type", weight: 10 },
    { value: "village-dog", weight: 8 },
    { value: "mastiff-type", weight: 6 },
    { value: "hound-type", weight: 4 },
    { value: "terrier-type", weight: 3 },
    { value: "small-companion-type", weight: 1 },
  ],
  "remote-wildland": [
    { value: "general-mixed-type", weight: 24 },
    { value: "hound-type", weight: 19 },
    { value: "shepherd-type", weight: 17 },
    { value: "village-dog", weight: 14 },
    { value: "spitz-type", weight: 10 },
    { value: "mastiff-type", weight: 6 },
    { value: "retriever-type", weight: 5 },
    { value: "terrier-type", weight: 4 },
    { value: "small-companion-type", weight: 1 },
  ],
};

const COAT_PROFILES: readonly DogCoatProfile[] = [
  { primaryColor: "black", secondaryColor: null, pattern: "solid", weight: 10 },
  { primaryColor: "brown", secondaryColor: null, pattern: "solid", weight: 8 },
  { primaryColor: "cream", secondaryColor: null, pattern: "solid", weight: 6 },
  { primaryColor: "gold", secondaryColor: null, pattern: "solid", weight: 5 },
  { primaryColor: "gray", secondaryColor: null, pattern: "solid", weight: 4 },
  { primaryColor: "red", secondaryColor: null, pattern: "solid", weight: 4 },
  { primaryColor: "black", secondaryColor: "white", pattern: "bicolor", weight: 9 },
  { primaryColor: "brown", secondaryColor: "white", pattern: "bicolor", weight: 7 },
  { primaryColor: "tan", secondaryColor: "white", pattern: "bicolor", weight: 7 },
  { primaryColor: "black", secondaryColor: "tan", pattern: "bicolor", weight: 7 },
  { primaryColor: "black", secondaryColor: "tan", pattern: "tricolor", weight: 6 },
  { primaryColor: "brown", secondaryColor: "cream", pattern: "patched", weight: 6 },
  { primaryColor: "white", secondaryColor: "black", pattern: "patched", weight: 6 },
  { primaryColor: "white", secondaryColor: "brown", pattern: "speckled", weight: 5 },
  { primaryColor: "blue-gray", secondaryColor: "black", pattern: "speckled", weight: 3 },
  { primaryColor: "tan", secondaryColor: "black", pattern: "masked", weight: 8 },
  { primaryColor: "cream", secondaryColor: "black", pattern: "masked", weight: 4 },
  { primaryColor: "gold", secondaryColor: "black", pattern: "sable", weight: 6 },
  { primaryColor: "red", secondaryColor: "black", pattern: "sable", weight: 5 },
  { primaryColor: "brown", secondaryColor: "black", pattern: "brindle", weight: 5 },
];

const DISTINGUISHING_MARKS: readonly WeightedValue<DogDistinguishingMark>[] = [
  { value: "none", weight: 29 },
  { value: "white-chest", weight: 12 },
  { value: "white-toes", weight: 10 },
  { value: "white-tail-tip", weight: 6 },
  { value: "face-blaze", weight: 8 },
  { value: "dark-eye-patch", weight: 5 },
  { value: "one-ear-notch", weight: 4 },
  { value: "old-ear-scar", weight: 4 },
  { value: "muzzle-scar", weight: 3 },
  { value: "crooked-tail", weight: 4 },
  { value: "speckled-nose", weight: 6 },
  { value: "one-floppy-ear", weight: 7 },
  { value: "graying-muzzle", weight: 2 },
];

/** Curated pairs avoid self-cancelling random personality soup. */
const TEMPERAMENT_PAIRS: readonly WeightedValue<readonly [DogTemperament, DogTemperament]>[] = [
  { value: ["calm", "social"], weight: 8 },
  { value: ["calm", "observant"], weight: 8 },
  { value: ["calm", "protective"], weight: 5 },
  { value: ["bold", "curious"], weight: 7 },
  { value: ["bold", "protective"], weight: 5 },
  { value: ["bold", "playful"], weight: 5 },
  { value: ["cautious", "observant"], weight: 8 },
  { value: ["cautious", "food-motivated"], weight: 6 },
  { value: ["curious", "playful"], weight: 8 },
  { value: ["curious", "independent"], weight: 5 },
  { value: ["social", "playful"], weight: 8 },
  { value: ["social", "food-motivated"], weight: 7 },
  { value: ["protective", "observant"], weight: 6 },
  { value: ["reserved", "independent"], weight: 7 },
  { value: ["reserved", "observant"], weight: 5 },
  { value: ["nervous", "social"], weight: 5 },
  { value: ["nervous", "observant"], weight: 6 },
  { value: ["food-motivated", "persistent"], weight: 7 },
  { value: ["independent", "persistent"], weight: 5 },
];

const HUMAN_FAMILIARITY_BY_HABITAT: Readonly<
  Record<DogHabitatClass, readonly WeightedValue<DogHumanFamiliarityLevel>[]>
> = {
  "settlement-edge": [
    { value: "feral", weight: 5 },
    { value: "wary", weight: 16 },
    { value: "habituated", weight: 42 },
    { value: "socialized", weight: 37 },
  ],
  "coastal-lowland": [
    { value: "feral", weight: 12 },
    { value: "wary", weight: 31 },
    { value: "habituated", weight: 39 },
    { value: "socialized", weight: 18 },
  ],
  "temperate-route": [
    { value: "feral", weight: 11 },
    { value: "wary", weight: 34 },
    { value: "habituated", weight: 40 },
    { value: "socialized", weight: 15 },
  ],
  upland: [
    { value: "feral", weight: 18 },
    { value: "wary", weight: 43 },
    { value: "habituated", weight: 29 },
    { value: "socialized", weight: 10 },
  ],
  "cold-region": [
    { value: "feral", weight: 17 },
    { value: "wary", weight: 37 },
    { value: "habituated", weight: 33 },
    { value: "socialized", weight: 13 },
  ],
  "remote-wildland": [
    { value: "feral", weight: 43 },
    { value: "wary", weight: 40 },
    { value: "habituated", weight: 13 },
    { value: "socialized", weight: 4 },
  ],
};

const AGE_SCALE: Readonly<Record<DogAgeClass, readonly [number, number]>> = {
  puppy: [560_000, 820_000],
  young: [840_000, 970_000],
  adult: [970_000, 1_000_000],
  senior: [960_000, 1_000_000],
};

const COAT_BASE_ADAPTATION: Readonly<
  Record<DogCoatLength, readonly [number, number, number]>
> = {
  short: [315_000, 775_000, 360_000],
  medium: [500_000, 610_000, 500_000],
  long: [650_000, 450_000, 610_000],
  double: [800_000, 310_000, 720_000],
};

const FAMILIARITY_CONFIDENCE_RANGE: Readonly<
  Record<DogHumanFamiliarityLevel, readonly [number, number]>
> = {
  feral: [70_000, 280_000],
  wary: [180_000, 480_000],
  habituated: [420_000, 740_000],
  socialized: [650_000, 920_000],
};

export const DOG_IDENTITY_DICTIONARY_COUNTS: Readonly<{
  ancestryTypes: number;
  coatProfiles: number;
  distinguishingMarks: number;
  temperamentPairs: number;
  habitatClasses: number;
}> = Object.freeze({
  ancestryTypes: MORPHOLOGY_PROFILES.length,
  coatProfiles: COAT_PROFILES.length,
  distinguishingMarks: DISTINGUISHING_MARKS.length,
  temperamentPairs: TEMPERAMENT_PAIRS.length,
  habitatClasses: HABITAT_CLASSES.length,
});

function semanticTextToken(value: string, initial = 0x811c_9dc5): number {
  let hash = initial;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash;
}

function assertSemanticKey(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SEMANTIC_KEY_PATTERN.test(value) || value !== value.normalize("NFC")) {
    throw new RangeError(`${label} must be a canonical lowercase semantic key`);
  }
}

function assertGenerationInput(input: DogIdentityGenerationInput): void {
  if (
    !Array.isArray(input.seed)
    || input.seed.length !== 4
    || input.seed.some((word) =>
      !Number.isSafeInteger(word)
      || word < 0
      || word > 0xffff_ffff
      || Object.is(word, -0)
    )
    || !isRegionCoord(input.originRegion)
    || !ORIGIN_NAMESPACES.includes(input.originNamespace)
    || !HABITAT_CLASSES.includes(input.habitatClass)
    || !Number.isSafeInteger(input.populationOrdinal)
    || input.populationOrdinal < 0
    || Object.is(input.populationOrdinal, -0)
  ) {
    throw new RangeError("Dog identity inputs must use canonical stable values");
  }
  assertSemanticKey(input.habitatKey, "Dog habitat key");
  assertSemanticKey(input.populationKey, "Dog population key");
}

function addressToken(input: DogIdentityGenerationInput, purpose: number, ordinal = 0): number {
  const semanticAddress = JSON.stringify([
    input.originNamespace,
    input.habitatClass,
    input.habitatKey,
    input.populationKey,
  ]);
  return keyedRandomU32(
    input.seed,
    DOG_ADDRESS_DOMAIN,
    input.populationOrdinal,
    semanticTextToken(semanticAddress),
    purpose,
    ordinal,
  );
}

function drawInteger(
  input: DogIdentityGenerationInput,
  purpose: number,
  minimum: number,
  maximum: number,
  ordinal = 0,
): number {
  return keyedRandomInt(
    input.seed,
    DOG_IDENTITY_DOMAIN,
    input.originRegion.x,
    input.originRegion.y,
    purpose,
    minimum,
    maximum,
    addressToken(input, purpose, ordinal),
  );
}

function chooseWeighted<T>(
  values: readonly WeightedValue<T>[],
  input: DogIdentityGenerationInput,
  purpose: number,
  ordinal = 0,
): T {
  const totalWeight = values.reduce((total, entry) => total + entry.weight, 0);
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
    throw new Error("Dog generation dictionary has no positive weight");
  }
  const roll = drawInteger(input, purpose, 1, totalWeight, ordinal);
  let cursor = 0;
  for (const entry of values) {
    cursor += entry.weight;
    if (roll <= cursor) return entry.value;
  }
  throw new Error("Dog weighted selection exceeded its dictionary");
}

function morphologyProfile(type: DogAncestryType): DogMorphologyProfile {
  const profile = MORPHOLOGY_PROFILES.find((candidate) => candidate.type === type);
  if (profile === undefined) throw new Error(`Missing dog morphology profile ${type}`);
  return profile;
}

function clampFixed(value: number, minimum = 80_000, maximum = 940_000): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function averageBias(primary: number, secondary: number | null): number {
  return secondary === null ? primary : Math.trunc((primary * 3 + secondary * 2) / 5);
}

function blendedRange(
  primary: readonly [number, number],
  secondary: readonly [number, number] | null,
): readonly [number, number] {
  if (secondary === null) return primary;
  return [
    Math.round((primary[0] * 3 + secondary[0] * 2) / 5),
    Math.round((primary[1] * 3 + secondary[1] * 2) / 5),
  ];
}

function sizeForHeight(heightCm: number): DogSize {
  if (heightCm < 25) return "tiny";
  if (heightCm < 36) return "small";
  if (heightCm < 52) return "medium";
  if (heightCm < 66) return "large";
  return "very-large";
}

function ancestryFor(input: DogIdentityGenerationInput): DogAncestry {
  const primary = chooseWeighted(TYPE_WEIGHTS_BY_HABITAT[input.habitatClass], input, 101);
  const mixedThreshold = input.habitatClass === "settlement-edge" ? 760_000 : 680_000;
  const isMixed = drawInteger(input, 102, 0, FIXED_POINT - 1) < mixedThreshold;
  if (!isMixed) return { kind: "single-type", primary, secondary: null };

  const secondaryPool = MORPHOLOGY_PROFILES
    .filter((profile) => profile.type !== primary)
    .map((profile) => ({ value: profile.type, weight: 1 }));
  return {
    kind: "mixed",
    primary,
    secondary: chooseWeighted(secondaryPool, input, 103),
  };
}

function bodyFor(
  input: DogIdentityGenerationInput,
  ancestry: DogAncestry,
  age: DogAgeClass,
): DogBody {
  const primary = morphologyProfile(ancestry.primary);
  const secondary = ancestry.secondary === null ? null : morphologyProfile(ancestry.secondary);
  const heightRange = blendedRange(primary.adultHeightCm, secondary?.adultHeightCm ?? null);
  const massRange = blendedRange(primary.adultMassGrams, secondary?.adultMassGrams ?? null);
  const adultHeight = drawInteger(input, 201, heightRange[0], heightRange[1]);
  const adultMass = drawInteger(input, 202, massRange[0], massRange[1]);
  const scaleRange = AGE_SCALE[age];
  const scale = drawInteger(input, 203, scaleRange[0], scaleRange[1]);
  const shoulderHeightCm = Math.max(14, Math.round((adultHeight * scale) / FIXED_POINT));
  const massScale = Math.trunc((scale * scale) / FIXED_POINT);
  const massGrams = Math.max(800, Math.round((adultMass * massScale) / FIXED_POINT));
  return {
    size: sizeForHeight(shoulderHeightCm),
    shoulderHeightCm,
    massGrams,
  };
}

function coatLengthFor(
  input: DogIdentityGenerationInput,
  ancestry: DogAncestry,
): DogCoatLength {
  const primary = morphologyProfile(ancestry.primary);
  const secondary = ancestry.secondary === null ? null : morphologyProfile(ancestry.secondary);
  const lengths: readonly DogCoatLength[] = ["short", "medium", "long", "double"];
  const weights = lengths.map((length) => ({
    value: length,
    weight: secondary === null
      ? primary.coatLengthWeights[length]
      : primary.coatLengthWeights[length] * 3 + secondary.coatLengthWeights[length] * 2,
  }));
  return chooseWeighted(weights, input, 301);
}

function coatFor(
  input: DogIdentityGenerationInput,
  ancestry: DogAncestry,
  age: DogAgeClass,
): DogCoat {
  const coatProfile = chooseWeighted(
    COAT_PROFILES.map((profile) => ({ value: profile, weight: profile.weight })),
    input,
    302,
  );
  const eligibleMarks = age === "senior"
    ? DISTINGUISHING_MARKS
    : DISTINGUISHING_MARKS.filter(({ value }) => value !== "graying-muzzle");
  return {
    primaryColor: coatProfile.primaryColor,
    secondaryColor: coatProfile.secondaryColor,
    pattern: coatProfile.pattern,
    length: coatLengthFor(input, ancestry),
    distinguishingMark: chooseWeighted(eligibleMarks, input, 303),
  };
}

function temperamentFor(
  input: DogIdentityGenerationInput,
): readonly [DogTemperament, DogTemperament] {
  // This draw deliberately has no ancestry/profile input: morphology never dictates personality.
  const pair = chooseWeighted(TEMPERAMENT_PAIRS, input, 401);
  return [pair[0], pair[1]];
}

function weatherAdaptationFor(
  input: DogIdentityGenerationInput,
  ancestry: DogAncestry,
  coatLength: DogCoatLength,
): DogWeatherAdaptation {
  const primary = morphologyProfile(ancestry.primary);
  const secondary = ancestry.secondary === null ? null : morphologyProfile(ancestry.secondary);
  const base = COAT_BASE_ADAPTATION[coatLength];
  const jitter = drawInteger(input, 501, -55_000, 55_000);
  return {
    coldTolerance: clampFixed(
      base[0] + averageBias(primary.coldBias, secondary?.coldBias ?? null) + jitter,
    ),
    heatTolerance: clampFixed(
      base[1] + averageBias(primary.heatBias, secondary?.heatBias ?? null) - jitter,
    ),
    rainTolerance: clampFixed(
      base[2] + averageBias(primary.rainBias, secondary?.rainBias ?? null)
        + drawInteger(input, 502, -45_000, 45_000),
    ),
    waterConfidence: clampFixed(
      430_000 + averageBias(primary.waterBias, secondary?.waterBias ?? null)
        + drawInteger(input, 503, -100_000, 100_000),
    ),
  };
}

function namespaceCode(namespace: DogOriginNamespace): "R" | "A" | "W" {
  switch (namespace) {
    case "regional": return "R";
    case "authored": return "A";
    case "woven": return "W";
  }
}

function habitatCode(habitat: DogHabitatClass): "S" | "C" | "T" | "U" | "K" | "R" {
  switch (habitat) {
    case "settlement-edge": return "S";
    case "coastal-lowland": return "C";
    case "temperate-route": return "T";
    case "upland": return "U";
    case "cold-region": return "K";
    case "remote-wildland": return "R";
  }
}

function seedIdentity(seed: RootSeed): string {
  return seed.map((word) => word.toString(36).padStart(7, "0")).join(".");
}

function signedCoordinate(value: number): string {
  return value < 0 ? `n${Math.abs(value).toString(36)}` : `p${value.toString(36)}`;
}

/** Length-prefixing keeps semantic keys injective even though their alphabet contains separators. */
function encodedSemanticKey(value: string): string {
  return `${value.length.toString(36)}:${value}`;
}

function stableDogIdV1(input: DogIdentityGenerationInput): string {
  assertGenerationInput(input);
  return [
    `D-${namespaceCode(input.originNamespace)}-v1`,
    seedIdentity(input.seed),
    `${signedCoordinate(input.originRegion.x)}.${signedCoordinate(input.originRegion.y)}`,
    habitatCode(input.habitatClass),
    `${encodedSemanticKey(input.habitatKey)}${encodedSemanticKey(input.populationKey)}`,
    input.populationOrdinal.toString(36),
  ].join("-");
}

/** Routes historical identities through the exact algorithm that created them. */
export function stableDogIdForGeneration(
  input: DogIdentityGenerationInput,
  generationVersion: number,
): string {
  switch (generationVersion) {
    case 1:
      return stableDogIdV1(input);
    default:
      throw new RangeError(`Unsupported dog generation version ${String(generationVersion)}`);
  }
}

export function stableDogId(input: DogIdentityGenerationInput): string {
  return stableDogIdForGeneration(input, DOG_GENERATION_VERSION);
}

function namespaceFromCode(value: string): DogOriginNamespace | null {
  switch (value) {
    case "R": return "regional";
    case "A": return "authored";
    case "W": return "woven";
    default: return null;
  }
}

function habitatFromCode(value: string): DogHabitatClass | null {
  switch (value) {
    case "S": return "settlement-edge";
    case "C": return "coastal-lowland";
    case "T": return "temperate-route";
    case "U": return "upland";
    case "K": return "cold-region";
    case "R": return "remote-wildland";
    default: return null;
  }
}

function parseCanonicalBase36(value: string, paddedLength: number | null = null): number | null {
  if (!/^[0-9a-z]+$/u.test(value)) return null;
  const parsed = Number.parseInt(value, 36);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  const canonical = paddedLength === null
    ? parsed.toString(36)
    : parsed.toString(36).padStart(paddedLength, "0");
  return canonical === value ? parsed : null;
}

function parseSignedCoordinate(value: string): number | null {
  const sign = value[0];
  const magnitude = parseCanonicalBase36(value.slice(1));
  if (magnitude === null || (sign !== "p" && sign !== "n")) return null;
  if (sign === "n" && magnitude === 0) return null;
  const result = sign === "n" ? -magnitude : magnitude;
  return Number.isSafeInteger(result) && !Object.is(result, -0) ? result : null;
}

function parseSemanticKeyAt(
  value: string,
  offset: number,
): Readonly<{ key: string; nextOffset: number }> | null {
  const colon = value.indexOf(":", offset);
  if (colon < 0) return null;
  const length = parseCanonicalBase36(value.slice(offset, colon));
  if (length === null || length <= 0 || length > 48) return null;
  const start = colon + 1;
  const end = start + length;
  if (end > value.length) return null;
  const key = value.slice(start, end);
  if (!SEMANTIC_KEY_PATTERN.test(key) || key !== key.normalize("NFC")) return null;
  return Object.freeze({ key, nextOffset: end });
}

function dogGenerationInputFromStableId(stableId: string): DogIdentityGenerationInput | null {
  const match = STABLE_ID_PREFIX_PATTERN.exec(stableId);
  if (match === null) return null;
  const namespace = namespaceFromCode(match[1] ?? "");
  const seedParts = (match[2] ?? "").split(".");
  const regionX = parseSignedCoordinate(match[3] ?? "");
  const regionY = parseSignedCoordinate(match[4] ?? "");
  const habitatClass = habitatFromCode(match[5] ?? "");
  const tail = match[6] ?? "";
  if (
    namespace === null
    || seedParts.length !== 4
    || regionX === null
    || regionY === null
    || habitatClass === null
  ) return null;
  const seedValues = seedParts.map((part) => parseCanonicalBase36(part, 7));
  if (seedValues.some((part) => part === null || part > 0xffff_ffff)) return null;
  const habitat = parseSemanticKeyAt(tail, 0);
  if (habitat === null) return null;
  const population = parseSemanticKeyAt(tail, habitat.nextOffset);
  if (population === null || tail[population.nextOffset] !== "-") return null;
  const populationOrdinal = parseCanonicalBase36(tail.slice(population.nextOffset + 1));
  if (populationOrdinal === null) return null;

  try {
    const input: DogIdentityGenerationInput = {
      seed: seedValues as [number, number, number, number],
      originRegion: createRegionCoord(regionX, regionY),
      originNamespace: namespace,
      habitatClass,
      habitatKey: habitat.key,
      populationKey: population.key,
      populationOrdinal,
    };
    assertGenerationInput(input);
    return stableDogIdV1(input) === stableId ? input : null;
  } catch {
    return null;
  }
}

function generateDogIdentityV1Unchecked(input: DogIdentityGenerationInput): DogIdentity {
  const ancestry = ancestryFor(input);
  const age = chooseWeighted(AGES, input, 601);
  const body = bodyFor(input, ancestry, age);
  const coat = coatFor(input, ancestry, age);
  const identity: DogIdentity = {
    stableId: stableDogId(input),
    generationVersion: DOG_GENERATION_VERSION,
    species: "domestic-dog",
    originRegion: { x: input.originRegion.x, y: input.originRegion.y },
    originNamespace: input.originNamespace,
    habitatClass: input.habitatClass,
    habitatKey: input.habitatKey,
    populationKey: input.populationKey,
    populationOrdinal: input.populationOrdinal,
    ancestry,
    age,
    sex: chooseWeighted(SEXES, input, 602),
    body,
    coat,
    temperament: temperamentFor(input),
    weatherAdaptation: weatherAdaptationFor(input, ancestry, coat.length),
  };
  return identity;
}

export function generateDogIdentity(input: DogIdentityGenerationInput): DogIdentity {
  assertGenerationInput(input);
  assertDogGenerationDictionaries();
  const identity = generateDogIdentityV1Unchecked(input);
  assertDogIdentityCoherence(identity);
  return identity;
}

export function generateDogNeeds(input: DogIdentityGenerationInput): DogNeeds {
  assertGenerationInput(input);
  return {
    hunger: drawInteger(input, 701, 100_000, 430_000),
    thirst: drawInteger(input, 702, 70_000, 320_000),
    rest: drawInteger(input, 703, 40_000, 300_000),
    safety: drawInteger(input, 704, 20_000, 240_000),
    company: drawInteger(input, 705, 70_000, 390_000),
  };
}

export function createDogCondition(input: DogIdentityGenerationInput): DogCondition {
  assertGenerationInput(input);
  return {
    health: FIXED_POINT,
    wetness: 0,
    coldStress: 0,
    heatStress: 0,
    exhaustion: drawInteger(input, 801, 20_000, 170_000),
    injuries: [],
  };
}

export function generateDogHumanFamiliarity(
  input: DogIdentityGenerationInput,
): DogHumanFamiliarity {
  assertGenerationInput(input);
  const level = chooseWeighted(HUMAN_FAMILIARITY_BY_HABITAT[input.habitatClass], input, 901);
  const confidenceRange = FAMILIARITY_CONFIDENCE_RANGE[level];
  return {
    level,
    confidence: drawInteger(input, 902, confidenceRange[0], confidenceRange[1]),
  };
}

export function generateDogState(input: DogIdentityGenerationInput): GeneratedDogState {
  const state: GeneratedDogState = {
    identity: generateDogIdentity(input),
    needs: generateDogNeeds(input),
    condition: createDogCondition(input),
    humanFamiliarity: generateDogHumanFamiliarity(input),
  };
  assertDogStateCoherence(state);
  if (state.identity.stableId !== stableDogId(input)) {
    throw new Error("Generated dog state does not match its semantic origin");
  }
  return state;
}

function assertUniqueValues<T>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Dog ${label} dictionary contains duplicate entries`);
  }
}

function assertWeightedDictionary<T>(values: readonly WeightedValue<T>[], label: string): void {
  if (values.length === 0) throw new Error(`Dog ${label} dictionary is empty`);
  assertUniqueValues(values.map(({ value }) => value), label);
  if (values.some(({ weight }) => !Number.isSafeInteger(weight) || weight <= 0)) {
    throw new Error(`Dog ${label} dictionary contains an invalid weight`);
  }
}

/** Development/test guard for authoritative generation-v1 dictionaries. */
export function assertDogGenerationDictionaries(): void {
  assertUniqueValues(MORPHOLOGY_PROFILES.map(({ type }) => type), "morphology");
  if (MORPHOLOGY_PROFILES.length < 8) throw new Error("Dog morphology dictionary is too narrow");
  for (const profile of MORPHOLOGY_PROFILES) {
    if (
      profile.adultHeightCm[0] <= 0
      || profile.adultHeightCm[1] < profile.adultHeightCm[0]
      || profile.adultMassGrams[0] <= 0
      || profile.adultMassGrams[1] < profile.adultMassGrams[0]
      || Object.values(profile.coatLengthWeights).some((weight) => weight <= 0)
    ) throw new Error(`Dog morphology profile ${profile.type} is incoherent`);
  }
  for (const habitat of HABITAT_CLASSES) {
    const weights = TYPE_WEIGHTS_BY_HABITAT[habitat];
    assertWeightedDictionary(weights, `${habitat} ancestry weights`);
    if (weights.length !== MORPHOLOGY_PROFILES.length) {
      throw new Error(`Dog habitat ${habitat} omits a supported ancestry type`);
    }
  }
  if (COAT_PROFILES.length < 16) throw new Error("Dog coat dictionary is too narrow");
  for (const coat of COAT_PROFILES) {
    if (
      !Number.isSafeInteger(coat.weight)
      || coat.weight <= 0
      || (coat.pattern === "solid") !== (coat.secondaryColor === null)
      || coat.primaryColor === coat.secondaryColor
    ) throw new Error("Dog coat dictionary contains an incoherent profile");
  }
  assertWeightedDictionary(DISTINGUISHING_MARKS, "distinguishing marks");
  assertWeightedDictionary(AGES, "ages");
  assertWeightedDictionary(SEXES, "sexes");
  assertWeightedDictionary(
    TEMPERAMENT_PAIRS.map(({ value, weight }) => ({ value: value.join("|"), weight })),
    "temperament pairs",
  );
  for (const { value } of TEMPERAMENT_PAIRS) {
    if (value[0] === value[1]) throw new Error("Dog temperament pair repeats one trait");
  }
  for (const habitat of HABITAT_CLASSES) {
    assertWeightedDictionary(HUMAN_FAMILIARITY_BY_HABITAT[habitat], `${habitat} familiarity`);
  }
}

function assertFixedPoint(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
    || value > FIXED_POINT
  ) {
    throw new RangeError(`${label} must be a fixed-point value`);
  }
}

export function assertDogIdentityCoherence(identity: DogIdentity): void {
  assertDogGenerationDictionaries();
  if (
    identity.species !== "domestic-dog"
    || identity.generationVersion !== 1
    || !isRegionCoord(identity.originRegion)
    || !ORIGIN_NAMESPACES.includes(identity.originNamespace)
    || !HABITAT_CLASSES.includes(identity.habitatClass)
    || !Number.isSafeInteger(identity.populationOrdinal)
    || identity.populationOrdinal < 0
    || Object.is(identity.populationOrdinal, -0)
  ) throw new RangeError("Dog identity origin or version is invalid");
  assertSemanticKey(identity.habitatKey, "Dog habitat key");
  assertSemanticKey(identity.populationKey, "Dog population key");
  const expectedPrefix = `D-${namespaceCode(identity.originNamespace)}-v${identity.generationVersion}-`;
  if (!identity.stableId.startsWith(expectedPrefix)) {
    throw new Error("Dog stable ID is outside its immutable origin namespace");
  }

  const knownTypes = new Set(MORPHOLOGY_PROFILES.map(({ type }) => type));
  if (
    !knownTypes.has(identity.ancestry.primary)
    || (identity.ancestry.secondary !== null && !knownTypes.has(identity.ancestry.secondary))
    || (identity.ancestry.kind === "single-type" && identity.ancestry.secondary !== null)
    || (identity.ancestry.kind === "mixed" && identity.ancestry.secondary === null)
    || identity.ancestry.primary === identity.ancestry.secondary
  ) throw new Error("Dog ancestry is incoherent");

  if (!AGES.some(({ value }) => value === identity.age) || !SEXES.some(({ value }) => value === identity.sex)) {
    throw new Error("Dog age or sex is invalid");
  }
  if (
    !Number.isSafeInteger(identity.body.shoulderHeightCm)
    || identity.body.shoulderHeightCm < 14
    || identity.body.shoulderHeightCm > 80
    || !Number.isSafeInteger(identity.body.massGrams)
    || identity.body.massGrams < 800
    || identity.body.massGrams > 80_000
    || identity.body.size !== sizeForHeight(identity.body.shoulderHeightCm)
  ) throw new Error("Dog body dimensions are incoherent");

  const coatProfileExists = COAT_PROFILES.some((profile) =>
    profile.primaryColor === identity.coat.primaryColor
    && profile.secondaryColor === identity.coat.secondaryColor
    && profile.pattern === identity.coat.pattern
  );
  if (
    !coatProfileExists
    || !(["short", "medium", "long", "double"] as const).includes(identity.coat.length)
    || !DISTINGUISHING_MARKS.some(({ value }) => value === identity.coat.distinguishingMark)
    || (identity.coat.distinguishingMark === "graying-muzzle" && identity.age !== "senior")
  ) throw new Error("Dog coat or distinguishing mark is incoherent");

  const pairKey = identity.temperament.join("|");
  if (!TEMPERAMENT_PAIRS.some(({ value }) => value.join("|") === pairKey)) {
    throw new Error("Dog temperament combination is not a coherent authored pair");
  }
  for (const [key, value] of Object.entries(identity.weatherAdaptation)) {
    assertFixedPoint(value, `Dog weather adaptation ${key}`);
  }

  const generationInput = dogGenerationInputFromStableId(identity.stableId);
  if (
    generationInput === null
    || generationInput.originRegion.x !== identity.originRegion.x
    || generationInput.originRegion.y !== identity.originRegion.y
    || generationInput.originNamespace !== identity.originNamespace
    || generationInput.habitatClass !== identity.habitatClass
    || generationInput.habitatKey !== identity.habitatKey
    || generationInput.populationKey !== identity.populationKey
    || generationInput.populationOrdinal !== identity.populationOrdinal
  ) throw new Error("Dog stable ID does not prove its stored semantic origin");

  const expected = generateDogIdentityV1Unchecked(generationInput);
  if (stableStringify(expected) !== stableStringify(identity)) {
    throw new Error("Dog identity differs from its deterministic generation record");
  }
}

export function assertDogStateCoherence(state: GeneratedDogState): void {
  assertDogIdentityCoherence(state.identity);
  for (const [key, value] of Object.entries(state.needs)) {
    assertFixedPoint(value, `Dog need ${key}`);
  }
  assertFixedPoint(state.condition.health, "Dog health");
  assertFixedPoint(state.condition.wetness, "Dog wetness");
  assertFixedPoint(state.condition.coldStress, "Dog cold stress");
  assertFixedPoint(state.condition.heatStress, "Dog heat stress");
  assertFixedPoint(state.condition.exhaustion, "Dog exhaustion");
  const allowedInjuries: readonly DogInjury[] = ["bruise", "cut", "sprain", "bite", "cold-injury"];
  if (
    !Array.isArray(state.condition.injuries)
    || new Set(state.condition.injuries).size !== state.condition.injuries.length
    || state.condition.injuries.some((injury) => !allowedInjuries.includes(injury))
  ) throw new Error("Dog injuries are invalid or duplicated");
  if (
    !(state.humanFamiliarity.level in FAMILIARITY_CONFIDENCE_RANGE)
    || !Number.isSafeInteger(state.humanFamiliarity.confidence)
  ) throw new Error("Dog human familiarity is invalid");
  const range = FAMILIARITY_CONFIDENCE_RANGE[state.humanFamiliarity.level];
  if (
    state.humanFamiliarity.confidence < range[0]
    || state.humanFamiliarity.confidence > range[1]
  ) throw new Error("Dog familiarity confidence contradicts its category");
}
