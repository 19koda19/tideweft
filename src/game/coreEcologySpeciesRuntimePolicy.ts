import {
  CORE_WILDLIFE_SPECIES,
  getCoreWildlifeProfile,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import type { LivingSpeciesCatalog } from "./livingSpeciesCatalog";
import {
  isLivingSpeciesActorAddressable,
  livingSpeciesRegistryEntry,
  type LivingSpeciesGroupOrganization,
  type LivingSpeciesLocomotionClass,
  type LivingSpeciesRepresentation,
} from "./livingSpeciesRegistry";

export const CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_VERSION = 1 as const;
export const CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_OWNER_ID =
  "game:core-ecology-species-runtime-policy:v1" as const;

/**
 * Orthogonal runtime abilities. These are deliberately not species-pair
 * rules: shared resolvers ask what an observed subject and target can do.
 */
export const CORE_ECOLOGY_SPECIES_RUNTIME_CAPABILITIES = Object.freeze([
  "actor-address",
  "aggregate-response",
  "aerial-locomotion",
  "aerial-predator",
  "amphibious-locomotion",
  "aquatic-foraging",
  "aquatic-locomotion",
  "carcass-feeding",
  "carcass-guarding",
  "chorus",
  "diurnal-activity",
  "food-investigation",
  "ground-movement-evidence",
  "group-coordination",
  "mobbing",
  "movement-memory",
  "perch",
  "physical-body-resource",
  "population-activity-evidence",
  "predator-contact-damage",
  "quieting",
  "rain-activity",
  "same-species-food-guard",
  "school-coordination",
  "shared-alarm",
  "shore-water-activity",
  "small-prey-pursuit",
  "surface-opportunity",
  "tidal-activity",
  "wading",
  "water-depth-response",
] as const);

export type CoreEcologySpeciesRuntimeCapability =
  (typeof CORE_ECOLOGY_SPECIES_RUNTIME_CAPABILITIES)[number];
export type CoreEcologySpeciesIdentityForm = "individual" | "aggregate";
export type CoreEcologySpeciesPresentationModel =
  | "individual"
  | "visible-flock"
  | "aggregate-activity"
  | "aggregate-school";

export const CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION = 1 as const;

/**
 * One bounded harmful-contact verb. Reach uses exact world-position units;
 * damage uses the common fixed-point wildlife-health scale. This describes an
 * attacker ability, never a hard-coded attacker/target species pairing.
 */
export interface CoreEcologySpeciesPredatorContactPolicy {
  readonly cause: "predator-contact";
  readonly reachUnits: number;
  readonly damageUnits: number;
}

/**
 * Declarative mortality/aftermath participation. Zero/null/false means the
 * current runtime does not own that behavior for this species yet; ecological
 * plausibility alone must never silently activate it.
 */
export interface CoreEcologySpeciesMortalityRuntimePolicy {
  readonly version: typeof CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION;
  readonly predatorContact: CoreEcologySpeciesPredatorContactPolicy | null;
  /** Physical geometry/presentation scale; deliberately not edible yield. */
  readonly physicalBodySizeUnits: number;
  /** Finite whole resource units available to lawful carcass consumers. */
  readonly physicalBodyResourceUnits: number;
  readonly carcassFeeding: boolean;
  readonly carcassGuarding: boolean;
}

export interface CoreEcologyAggregateRuntimePolicy {
  /** A hard presentation/simulation bound; zero is never interpreted as unbounded. */
  readonly maximumAnchors: number;
  readonly responseCadenceTicks: number;
  readonly responseVerbs: readonly string[];
}

export interface CoreEcologySpeciesRuntimePolicy {
  readonly version: typeof CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_VERSION;
  readonly policyId: string;
  readonly speciesId: CoreWildlifeSpecies;
  readonly actorAddressable: boolean;
  readonly identityForm: CoreEcologySpeciesIdentityForm;
  readonly representation: LivingSpeciesRepresentation;
  readonly locomotionClass: LivingSpeciesLocomotionClass;
  readonly groupOrganization: LivingSpeciesGroupOrganization | null;
  readonly groupStableIdNamespace:
    | "HERD"
    | "FLOCK"
    | "CROW-FLOCK"
    | "SILVERSIDE-SCHOOL"
    | "CHICKEN-FLOCK"
    | null;
  readonly maximumMaterializedActors: number;
  readonly aggregate: CoreEcologyAggregateRuntimePolicy | null;
  readonly mortality: CoreEcologySpeciesMortalityRuntimePolicy;
  readonly capabilities: readonly CoreEcologySpeciesRuntimeCapability[];
  /** Directly observable activity; it is not omniscient actor knowledge. */
  readonly activitySignals: readonly string[];
  /** Physical or direct activity evidence only; private intent never appears here. */
  readonly evidenceKinds: readonly string[];
  readonly presentationModel: CoreEcologySpeciesPresentationModel;
}

interface AuthoredRuntimePolicyValues {
  readonly maximumAggregateAnchors: number;
  readonly aggregateResponseCadenceTicks: number;
  readonly aggregateResponseVerbs: readonly string[];
  readonly capabilities: readonly CoreEcologySpeciesRuntimeCapability[];
  readonly activitySignals: readonly string[];
  readonly evidenceKinds: readonly string[];
  readonly presentationModel: CoreEcologySpeciesPresentationModel;
}

const NO_MORTALITY_RUNTIME: CoreEcologySpeciesMortalityRuntimePolicy = deepFreeze({
  version: CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION,
  predatorContact: null,
  physicalBodySizeUnits: 0,
  physicalBodyResourceUnits: 0,
  carcassFeeding: false,
  carcassGuarding: false,
});

/**
 * Alpha-29's deliberately narrow mortality roster. Every species is present
 * so adding a biological role or food affinity cannot accidentally activate a
 * physical attack/body contract. The fish crow proves that carcass consumers
 * need not also own harmful contact or body creation.
 */
const MORTALITY_VALUES: Readonly<Record<
  CoreWildlifeSpecies,
  CoreEcologySpeciesMortalityRuntimePolicy
>> = deepFreeze({
  deer: NO_MORTALITY_RUNTIME,
  gull: NO_MORTALITY_RUNTIME,
  "black-bear": NO_MORTALITY_RUNTIME,
  "brown-rat": NO_MORTALITY_RUNTIME,
  "domestic-cat": NO_MORTALITY_RUNTIME,
  "marsh-rabbit": {
    version: CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION,
    predatorContact: null,
    physicalBodySizeUnits: 3,
    physicalBodyResourceUnits: 4,
    carcassFeeding: false,
    carcassGuarding: false,
  },
  "marsh-fox": {
    version: CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION,
    predatorContact: {
      cause: "predator-contact",
      reachUnits: 500,
      damageUnits: 550_000,
    },
    physicalBodySizeUnits: 0,
    physicalBodyResourceUnits: 0,
    carcassFeeding: true,
    carcassGuarding: true,
  },
  "fish-crow": {
    version: CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION,
    predatorContact: null,
    physicalBodySizeUnits: 0,
    physicalBodyResourceUnits: 0,
    carcassFeeding: true,
    carcassGuarding: false,
  },
  "northern-harrier": NO_MORTALITY_RUNTIME,
  "southern-leopard-frog": NO_MORTALITY_RUNTIME,
  "atlantic-silverside": NO_MORTALITY_RUNTIME,
  "atlantic-marsh-fiddler-crab": NO_MORTALITY_RUNTIME,
  "snowy-egret": NO_MORTALITY_RUNTIME,
  "american-black-duck": NO_MORTALITY_RUNTIME,
  "north-american-river-otter": NO_MORTALITY_RUNTIME,
  "domestic-chicken": NO_MORTALITY_RUNTIME,
  "domestic-goat": NO_MORTALITY_RUNTIME,
});

const RUNTIME_VALUES: Readonly<Record<CoreWildlifeSpecies, AuthoredRuntimePolicyValues>> =
  deepFreeze({
    deer: {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: ["actor-address", "group-coordination", "shared-alarm"],
      activitySignals: [],
      evidenceKinds: [],
      presentationModel: "individual",
    },
    gull: {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "diurnal-activity",
        "food-investigation",
        "group-coordination",
        "perch",
        "shared-alarm",
        "surface-opportunity",
        "tidal-activity",
      ],
      activitySignals: ["surface-opportunity-flight", "tidal-relocation-flight"],
      evidenceKinds: [],
      presentationModel: "visible-flock",
    },
    "black-bear": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: ["actor-address", "food-investigation", "small-prey-pursuit"],
      activitySignals: [],
      evidenceKinds: [],
      presentationModel: "individual",
    },
    "brown-rat": {
      maximumAggregateAnchors: 4,
      aggregateResponseCadenceTicks: 8,
      aggregateResponseVerbs: ["attract", "redistribute", "suppress"],
      capabilities: ["aggregate-response", "population-activity-evidence"],
      activitySignals: ["rat-rustle"],
      evidenceKinds: ["gnaw-mark", "shelter-sign", "tracks"],
      presentationModel: "aggregate-activity",
    },
    "domestic-cat": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "food-investigation",
        "ground-movement-evidence",
        "same-species-food-guard",
        "small-prey-pursuit",
      ],
      activitySignals: ["cat-call"],
      evidenceKinds: ["wet-tracks"],
      presentationModel: "individual",
    },
    "marsh-rabbit": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "ground-movement-evidence",
        "movement-memory",
        "physical-body-resource",
        "shared-alarm",
      ],
      activitySignals: ["rabbit-thump"],
      evidenceKinds: ["paired-tracks"],
      presentationModel: "individual",
    },
    "marsh-fox": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "carcass-feeding",
        "carcass-guarding",
        "food-investigation",
        "ground-movement-evidence",
        "movement-memory",
        "predator-contact-damage",
        "small-prey-pursuit",
      ],
      activitySignals: ["fox-yip"],
      evidenceKinds: ["canid-pawprints"],
      presentationModel: "individual",
    },
    "fish-crow": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "carcass-feeding",
        "diurnal-activity",
        "food-investigation",
        "group-coordination",
        "mobbing",
        "perch",
        "shared-alarm",
      ],
      activitySignals: ["crow-nasal-double-call", "shared-alarm"],
      evidenceKinds: [],
      presentationModel: "visible-flock",
    },
    "northern-harrier": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "aerial-predator",
        "diurnal-activity",
        "small-prey-pursuit",
      ],
      activitySignals: ["low-quartering-flight"],
      evidenceKinds: [],
      presentationModel: "individual",
    },
    "southern-leopard-frog": {
      maximumAggregateAnchors: 3,
      aggregateResponseCadenceTicks: 8,
      aggregateResponseVerbs: ["chorus", "quiet", "redistribute"],
      capabilities: [
        "aggregate-response",
        "chorus",
        "population-activity-evidence",
        "quieting",
        "rain-activity",
      ],
      activitySignals: ["frog-quieting", "rain-chorus", "rain-responsive"],
      evidenceKinds: ["frog-track"],
      presentationModel: "aggregate-activity",
    },
    "atlantic-silverside": {
      maximumAggregateAnchors: 3,
      aggregateResponseCadenceTicks: 4,
      aggregateResponseVerbs: ["redistribute", "school", "tighten"],
      capabilities: [
        "aggregate-response",
        "aquatic-locomotion",
        "population-activity-evidence",
        "school-coordination",
        "tidal-activity",
        "water-depth-response",
      ],
      activitySignals: ["schooling-glint", "school-tightening", "surface-dimple"],
      evidenceKinds: ["surface-dimple"],
      presentationModel: "aggregate-school",
    },
    "atlantic-marsh-fiddler-crab": {
      maximumAggregateAnchors: 4,
      aggregateResponseCadenceTicks: 8,
      aggregateResponseVerbs: ["emerge", "quiet", "retreat-to-burrow"],
      capabilities: [
        "aggregate-response",
        "amphibious-locomotion",
        "population-activity-evidence",
        "quieting",
        "tidal-activity",
        "water-depth-response",
      ],
      activitySignals: ["burrow-foraging", "burrow-retreat", "surface-quieting"],
      evidenceKinds: ["burrow-opening", "feeding-scrape"],
      presentationModel: "aggregate-activity",
    },
    "snowy-egret": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "amphibious-locomotion",
        "aquatic-foraging",
        "diurnal-activity",
        "movement-memory",
        "surface-opportunity",
        "tidal-activity",
        "wading",
        "water-depth-response",
      ],
      activitySignals: ["shallow-water-probing", "wading-forage"],
      evidenceKinds: [],
      presentationModel: "individual",
    },
    "american-black-duck": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "aerial-locomotion",
        "amphibious-locomotion",
        "aquatic-foraging",
        "aquatic-locomotion",
        "diurnal-activity",
        "food-investigation",
        "movement-memory",
        "shared-alarm",
        "surface-opportunity",
        "tidal-activity",
        "water-depth-response",
      ],
      activitySignals: ["dabbling-forage", "surface-swimming", "tidal-relocation-flight"],
      evidenceKinds: [],
      presentationModel: "individual",
    },
    "north-american-river-otter": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "amphibious-locomotion",
        "aquatic-foraging",
        "aquatic-locomotion",
        "diurnal-activity",
        "food-investigation",
        "movement-memory",
        "shore-water-activity",
        "small-prey-pursuit",
        "surface-opportunity",
        "tidal-activity",
        "water-depth-response",
      ],
      activitySignals: ["aquatic-foraging", "shore-water-relocation", "surface-diving"],
      evidenceKinds: [],
      presentationModel: "individual",
    },
    "domestic-chicken": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "food-investigation",
        "group-coordination",
        "shared-alarm",
      ],
      activitySignals: ["shared-alarm"],
      evidenceKinds: [],
      presentationModel: "visible-flock",
    },
    "domestic-goat": {
      maximumAggregateAnchors: 0,
      aggregateResponseCadenceTicks: 0,
      aggregateResponseVerbs: [],
      capabilities: [
        "actor-address",
        "group-coordination",
        "shared-alarm",
      ],
      activitySignals: ["shared-alarm"],
      evidenceKinds: [],
      presentationModel: "individual",
    },
  });

export const CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES: readonly CoreEcologySpeciesRuntimePolicy[] =
  Object.freeze(CORE_WILDLIFE_SPECIES.map((speciesId) => {
    const registry = livingSpeciesRegistryEntry(speciesId);
    const values = RUNTIME_VALUES[speciesId];
    if (registry === null) throw new Error(`Missing living-species registry entry for ${speciesId}`);
    const actorAddressable = isLivingSpeciesActorAddressable(speciesId);
    const identityForm: CoreEcologySpeciesIdentityForm = actorAddressable
      ? "individual"
      : "aggregate";
    const aggregate = actorAddressable
      ? null
      : Object.freeze({
          maximumAnchors: values.maximumAggregateAnchors,
          responseCadenceTicks: values.aggregateResponseCadenceTicks,
          responseVerbs: Object.freeze([...values.aggregateResponseVerbs]),
        });
    return deepFreeze({
      version: CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_VERSION,
      policyId: `core-ecology-species:${speciesId}:v${CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_VERSION}`,
      speciesId,
      actorAddressable,
      identityForm,
      representation: registry.representation,
      locomotionClass: registry.locomotionClass,
      groupOrganization: registry.groupOrganization,
      groupStableIdNamespace: registry.groupStableIdNamespace,
      maximumMaterializedActors: actorAddressable
        ? getCoreWildlifeProfile(speciesId).maximumPatchPopulation
        : 0,
      aggregate,
      mortality: MORTALITY_VALUES[speciesId],
      capabilities: [...values.capabilities],
      activitySignals: [...values.activitySignals],
      evidenceKinds: [...values.evidenceKinds],
      presentationModel: values.presentationModel,
    });
  }));

const POLICY_BY_SPECIES = new Map<CoreWildlifeSpecies, CoreEcologySpeciesRuntimePolicy>(
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.map((policy) => [policy.speciesId, policy]),
);
const CAPABILITY_SET = new Set<string>(CORE_ECOLOGY_SPECIES_RUNTIME_CAPABILITIES);

/** Unknown species never inherit an individual or aerial default. */
export function coreEcologySpeciesRuntimePolicy(
  speciesId: unknown,
): CoreEcologySpeciesRuntimePolicy | null {
  return typeof speciesId === "string"
    ? POLICY_BY_SPECIES.get(speciesId as CoreWildlifeSpecies) ?? null
    : null;
}

/** Unknown or not-yet-integrated species never inherit a harmful contact. */
export function coreEcologySpeciesPredatorContact(
  speciesId: unknown,
): CoreEcologySpeciesPredatorContactPolicy | null {
  return coreEcologySpeciesRuntimePolicy(speciesId)?.mortality.predatorContact ?? null;
}

/** Zero is the explicit fail-closed answer for species without a physical body witness. */
export function coreEcologySpeciesPhysicalBodyResourceUnits(
  speciesId: unknown,
): number {
  return coreEcologySpeciesRuntimePolicy(speciesId)?.mortality.physicalBodyResourceUnits ?? 0;
}

/** Zero is the fail-closed physical-size answer for species without a body witness. */
export function coreEcologySpeciesPhysicalBodySizeUnits(
  speciesId: unknown,
): number {
  return coreEcologySpeciesRuntimePolicy(speciesId)?.mortality.physicalBodySizeUnits ?? 0;
}

export function coreEcologySpeciesCanFeedFromCarcass(speciesId: unknown): boolean {
  const policy = coreEcologySpeciesRuntimePolicy(speciesId);
  return policy?.mortality.carcassFeeding === true
    && policy.capabilities.includes("carcass-feeding");
}

export function coreEcologySpeciesCanGuardCarcass(speciesId: unknown): boolean {
  const policy = coreEcologySpeciesRuntimePolicy(speciesId);
  return policy?.mortality.carcassGuarding === true
    && policy.capabilities.includes("carcass-guarding");
}

export function isCoreEcologySpeciesRuntimeCapability(
  value: unknown,
): value is CoreEcologySpeciesRuntimeCapability {
  return typeof value === "string" && CAPABILITY_SET.has(value);
}

export function coreEcologySpeciesHasRuntimeCapability(
  speciesId: unknown,
  capability: unknown,
): capability is CoreEcologySpeciesRuntimeCapability {
  const policy = coreEcologySpeciesRuntimePolicy(speciesId);
  return policy !== null
    && isCoreEcologySpeciesRuntimeCapability(capability)
    && policy.capabilities.includes(capability);
}

export function coreEcologySpeciesCanOwnActorAddress(speciesId: unknown): boolean {
  return coreEcologySpeciesRuntimePolicy(speciesId)?.actorAddressable === true;
}

/** Strict guard for trusted policy-shaped data; extra or altered fields fail closed. */
export function isCoreEcologySpeciesRuntimePolicy(
  value: unknown,
): value is CoreEcologySpeciesRuntimePolicy {
  if (!plainRecord(value) || typeof value.speciesId !== "string") return false;
  const canonical = coreEcologySpeciesRuntimePolicy(value.speciesId);
  return canonical !== null && sameData(canonical, value);
}

/**
 * Cross-check this policy registry against the authoritative Living Weft
 * catalog. Returns stable diagnostics so build gates can fail without a
 * caller being able to assert readiness.
 */
export function validateCoreEcologySpeciesRuntimePolicies(
  catalog: Pick<LivingSpeciesCatalog, "modules">,
): readonly string[] {
  const errors: string[] = [];
  const modules = new Map(catalog.modules.map((module) => [module.speciesId, module]));
  if (CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.length !== CORE_WILDLIFE_SPECIES.length) {
    errors.push("policy-roster-mismatch");
  }
  for (const policy of CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES) {
    const module = modules.get(policy.speciesId);
    const registry = livingSpeciesRegistryEntry(policy.speciesId);
    if (module === undefined) {
      errors.push(`${policy.speciesId}:missing-catalog-module`);
      continue;
    }
    if (registry === null) {
      errors.push(`${policy.speciesId}:missing-registry-entry`);
      continue;
    }
    if (
      policy.actorAddressable !== registry.actorAddressable
      || policy.identityForm !== module.identity.form
      || policy.representation !== registry.representation
    ) errors.push(`${policy.speciesId}:identity-policy-mismatch`);
    if (
      policy.locomotionClass !== registry.locomotionClass
      || !locomotionContractMatchesClass(policy.locomotionClass, module.locomotion.media)
    ) errors.push(`${policy.speciesId}:locomotion-policy-mismatch`);
    if (
      policy.groupOrganization !== registry.groupOrganization
      || policy.groupStableIdNamespace !== registry.groupStableIdNamespace
      || (policy.groupOrganization === null) !== (module.social.group.status === "unimplemented")
      || (policy.groupStableIdNamespace ?? null) !== (module.social.group.stableIdNamespace ?? null)
    ) errors.push(`${policy.speciesId}:group-policy-mismatch`);
    if (policy.maximumMaterializedActors !== module.population.maxMaterializedPerRegion) {
      errors.push(`${policy.speciesId}:materialization-policy-mismatch`);
    }
    if (!sameStrings(policy.evidenceKinds, module.evidence.produces)) {
      errors.push(`${policy.speciesId}:evidence-policy-mismatch`);
    }
    if (policy.actorAddressable) {
      if (policy.aggregate !== null || !policy.capabilities.includes("actor-address")) {
        errors.push(`${policy.speciesId}:addressability-policy-mismatch`);
      }
    } else if (
      policy.aggregate === null
      || policy.aggregate.maximumAnchors < 1
      || !policy.capabilities.includes("aggregate-response")
      || module.spatial.positionModel !== "segmented-area"
    ) errors.push(`${policy.speciesId}:aggregate-policy-mismatch`);
    if (
      policy.capabilities.includes("mobbing")
      && policy.capabilities.includes("aerial-predator")
    ) errors.push(`${policy.speciesId}:mobbing-predator-capability-collision`);
    if (!mortalityPolicyMatchesCapabilities(policy)) {
      errors.push(`${policy.speciesId}:mortality-policy-mismatch`);
    }
  }
  return Object.freeze(errors.sort(compareText));
}

function mortalityPolicyMatchesCapabilities(
  policy: CoreEcologySpeciesRuntimePolicy,
): boolean {
  const mortality = policy.mortality;
  const profile = getCoreWildlifeProfile(policy.speciesId);
  const contactCapability = policy.capabilities.includes("predator-contact-damage");
  const bodyCapability = policy.capabilities.includes("physical-body-resource");
  const feedingCapability = policy.capabilities.includes("carcass-feeding");
  const guardingCapability = policy.capabilities.includes("carcass-guarding");
  const contact = mortality.predatorContact;
  const ownsPhysicalBody = mortality.physicalBodySizeUnits > 0
    && mortality.physicalBodyResourceUnits > 0;
  if (
    mortality.version !== CORE_ECOLOGY_SPECIES_MORTALITY_POLICY_VERSION
    || contactCapability !== (contact !== null)
    || bodyCapability !== ownsPhysicalBody
    || feedingCapability !== mortality.carcassFeeding
    || guardingCapability !== mortality.carcassGuarding
    || !nonnegativeSafeInteger(mortality.physicalBodySizeUnits)
    || mortality.physicalBodySizeUnits > 1_000_000
    || !nonnegativeSafeInteger(mortality.physicalBodyResourceUnits)
    || mortality.physicalBodyResourceUnits > 1_000_000
    || (mortality.physicalBodySizeUnits === 0)
      !== (mortality.physicalBodyResourceUnits === 0)
    || ((contact !== null || mortality.physicalBodyResourceUnits > 0) && !policy.actorAddressable)
    // The current retirement owner can split anonymous units from one exact
    // representative, but it cannot yet rewrite a stable group membership
    // transaction. Refuse that capability combination at the catalog gate so
    // a later goat/chicken/etc. row cannot turn a lawful contact into a failed
    // whole ecology step.
    || (mortality.physicalBodyResourceUnits > 0 && policy.groupOrganization !== null)
  ) return false;
  if (contact !== null && (
    contact.cause !== "predator-contact"
    || !positiveSafeInteger(contact.reachUnits)
    || contact.reachUnits > 1_000
    || !positiveSafeInteger(contact.damageUnits)
    || contact.damageUnits > 1_000_000
    || !policy.capabilities.includes("small-prey-pursuit")
    || !profile.roles.includes("predator")
  )) return false;
  if (mortality.carcassFeeding && (
    !policy.actorAddressable
    || !policy.capabilities.includes("food-investigation")
    || !profile.roles.includes("scavenger")
    || profile.foodAffinities.carrion === 0
  )) return false;
  return !mortality.carcassGuarding || (
    mortality.carcassFeeding
    && profile.behavior.guardThreshold < 1_000_000
  );
}

function locomotionContractMatchesClass(
  locomotionClass: LivingSpeciesLocomotionClass,
  media: LivingSpeciesCatalog["modules"][number]["locomotion"]["media"],
): boolean {
  const supported = new Set(media.map(({ medium }) => medium));
  const hasWater = supported.has("deep-water") || supported.has("shallow-water");
  if (locomotionClass === "aerial") return supported.has("air");
  if (locomotionClass === "aquatic") {
    return hasWater && !supported.has("air") && !supported.has("land");
  }
  if (locomotionClass === "amphibious") {
    return hasWater && (supported.has("air") || supported.has("land"));
  }
  return supported.has("land") && !supported.has("air");
}

export function assertCoreEcologySpeciesRuntimePolicies(
  catalog: Pick<LivingSpeciesCatalog, "modules">,
): void {
  const errors = validateCoreEcologySpeciesRuntimePolicies(catalog);
  if (errors.length > 0) {
    throw new Error(`Core ecology species runtime policy is incoherent: ${errors.join(", ")}`);
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) {
    return Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameData(entry, right[index]));
  }
  if (plainRecord(left)) {
    if (!plainRecord(right)) return false;
    const leftKeys = Object.keys(left).sort(compareText);
    const rightKeys = Object.keys(right).sort(compareText);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => (
        key === rightKeys[index] && sameData(left[key], right[key])
      ));
  }
  return false;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
