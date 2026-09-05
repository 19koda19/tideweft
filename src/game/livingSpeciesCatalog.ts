import { ACTOR_PERCEPTION_SCALE, type ObservationChannel } from "../sim/actorPerception";
import { DOG_GENERATION_VERSION } from "../sim/dogIdentity";
import {
  CORE_WILDLIFE_FOOD_CLASSES,
  CORE_WILDLIFE_IDENTITY_VERSION,
  CORE_WILDLIFE_SPECIES,
  coreWildlifeIdPrefix,
  getCoreWildlifeProfile,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { MAX_RESIDENT_MEMORIES, NPC_GENERATION_VERSION } from "../sim/npcIdentity";
import {
  LIVING_ACTOR_SPECIES,
  type LivingActorPersistenceTier,
  type LivingActorSpecies,
} from "./livingActor";
import {
  LIVING_SPECIES_REGISTRY_VERSION,
  livingSpeciesRegistryEntry,
} from "./livingSpeciesRegistry";

/**
 * Versioned capability boundary for Living Weft species modules. This is not a
 * bestiary: a module is accepted only when every declared capability has an
 * authoritative owner and every absent capability is explicitly closed.
 */
export const LIVING_SPECIES_CATALOG_VERSION = 1 as const;
export const LIVING_SPECIES_MODULE_VERSION = 1 as const;
export const LIVING_SPECIES_CAPABILITY_SCALE = ACTOR_PERCEPTION_SCALE;
export const MAX_LIVING_SPECIES_MODULES = 256 as const;
export const MAX_MATERIALIZED_ACTORS_PER_REGION = 4_096 as const;
export const MAX_SPECIES_STATE_AXES = 64 as const;
export const MAX_SPECIES_CAPABILITY_ENTRIES = 64 as const;

export type LivingSpeciesImplementation = "unimplemented" | "foundation" | "active";
export type LivingSpeciesIdentityForm = "individual" | "aggregate" | "hybrid";
export type LivingSpeciesPositionModel =
  | "segmented-point"
  | "segmented-area"
  | "segmented-hybrid";
export type LivingSpeciesPopulationStrategy =
  | "persistent-individuals"
  | "deterministic-regional-individuals"
  | "aggregate-field"
  | "hybrid-population";
export type LivingSpeciesMaterializationStrategy =
  | "always"
  | "active-window"
  | "threshold"
  | "mixed";
export type LivingSpeciesMaterializationTrigger =
  | "active-window"
  | "causal-event"
  | "direct-observation"
  | "interaction"
  | "promotion"
  | "save-load"
  | "world-create";
export type LivingSpeciesAuthoritativeUnit =
  | "individual-records"
  | "group-records"
  | "population-patch"
  | "ecological-pressure"
  | "hybrid";
export type LivingSpeciesDematerializationModel =
  | "none"
  | "preserve-individual-records"
  | "reconcile-group-state"
  | "reconcile-population-state"
  | "reconcile-ecological-pressure"
  | "reconcile-hybrid-state";
export type LivingSpeciesStateRepresentation =
  | "fixed-point"
  | "safe-integer"
  | "boolean"
  | "enum"
  | "enum-set";
export type LivingSpeciesLocomotionMedium =
  | "air"
  | "deep-water"
  | "land"
  | "shallow-water"
  | "structure"
  | "subterranean";
export type LivingSpeciesDecisionModel = "individual" | "aggregate" | "hybrid";
export type LivingSpeciesDietMode =
  | "none"
  | "resource-consumer"
  | "omnivore"
  | "herbivore"
  | "carnivore"
  | "detritivore"
  | "filter-feeder";
export type LivingSpeciesCircadianStatus = "unimplemented" | "active";
export type LivingSpeciesCircadianRhythm =
  | "unspecified"
  | "adaptive"
  | "diurnal"
  | "nocturnal"
  | "crepuscular";
export type LivingSpeciesOffscreenModel = "none" | "individual" | "aggregate" | "hybrid";
export type LivingSpeciesGroupModel =
  | "solitary"
  | "pair"
  | "household"
  | "variable"
  | "group"
  | "colony";
export type LivingSpeciesGroupRepresentation =
  | "none"
  | "membership"
  | "group-actor"
  | "hybrid";
export type LivingSpeciesLeadershipModel = "none" | "emergent" | "persistent" | "rotating";
export type LivingSpeciesTerritoryModel = "none" | "individual" | "group";
export type LivingSpeciesCapabilityStatus = LivingSpeciesImplementation;
export type LivingSpeciesInventoryModel =
  | "none"
  | "physical-items"
  | "aggregate-resources"
  | "hybrid";
export type LivingSpeciesGenerationMigration =
  | "preserve-materialized-identity"
  | "regenerate-unmaterialized-only";
export type LivingSpeciesTaxonomicClass =
  | "amphibian"
  | "bird"
  | "fish"
  | "fungus"
  | "invertebrate"
  | "mammal"
  | "microbe"
  | "plant"
  | "reptile"
  | "other-life";
export type LivingSpeciesCompanionEligibility = "never" | "relationship-gated";
export type LivingSpeciesMorphologyModel = "individual" | "aggregate" | "hybrid";
export type LivingSpeciesLocomotionMode = "mobile" | "sessile";
export type LivingSpeciesMigrationModel = "none" | "individual" | "population" | "hybrid";
export type LivingSpeciesLifeHistoryModel = "individual" | "aggregate" | "hybrid";
export type LivingSpeciesReproductionModel =
  | "unimplemented"
  | "individual-birth"
  | "population-recruitment"
  | "hybrid-recruitment";
export type LivingSpeciesMortalityModel =
  | "unimplemented"
  | "individual-causal"
  | "population-turnover"
  | "hybrid";
export type LivingSpeciesCarcassModel = "none" | "physical" | "aggregate" | "hybrid";
export type LivingSpeciesCognitionModel =
  | "noncognitive"
  | "reactive"
  | "bounded-learning"
  | "social-learning"
  | "sapient"
  | "aggregate"
  | "hybrid";
/** Canonical rows used by generated pair/triad coverage audits. */
export const LIVING_SPECIES_INTERACTION_TARGET_CLASSES = [
  "aquatic-animal",
  "carcass",
  "dog",
  "fire",
  "flying-animal",
  "food",
  "human",
  "larger-prey",
  "livestock",
  "living-cover",
  "possibility-anomaly",
  "predator",
  "same-species",
  "scavenger",
  "shelter",
  "smaller-prey",
  "water",
  "weather",
] as const;
export type LivingSpeciesInteractionTargetClass =
  (typeof LIVING_SPECIES_INTERACTION_TARGET_CLASSES)[number];
export type LivingSpeciesInteractionPolicy = "available" | "intentional-no-response";

/** Authored identity and ecological classification, never runtime-generated species soup. */
export interface LivingSpeciesProfileContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly displayNameKey: string;
  readonly taxonomicClass: LivingSpeciesTaxonomicClass;
  readonly ecologicalClasses: readonly string[];
  readonly companionEligibility: LivingSpeciesCompanionEligibility;
}

/** Observable dimensions and overlays which a species-specific identity owner must derive. */
export interface LivingSpeciesMorphologyContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly model: LivingSpeciesMorphologyModel;
  readonly dimensions: readonly string[];
  readonly appearanceTraits: readonly string[];
  readonly dynamicOverlays: readonly string[];
}

/** Placement is ecological: profile weights consume these shared habitat inputs. */
export interface LivingSpeciesHabitatContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly habitatClasses: readonly string[];
  readonly placementInputs: readonly string[];
  readonly climateInputs: readonly string[];
  readonly migrationModel: LivingSpeciesMigrationModel;
}

/** Explicit trophic declarations let assemblage validation build a coherent food web. */
export interface LivingSpeciesFoodWebContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly roles: readonly string[];
  readonly consumes: readonly string[];
  readonly consumedBy: readonly string[];
  readonly competesWith: readonly string[];
  readonly ecologicalEffects: readonly string[];
}

/** Age identity can exist before dynamic aging, recruitment, or mortality is live. */
export interface LivingSpeciesLifeHistoryContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly model: LivingSpeciesLifeHistoryModel;
  readonly stages: readonly string[];
  readonly dynamicAging: boolean;
  readonly reproduction: LivingSpeciesReproductionModel;
  readonly mortality: LivingSpeciesMortalityModel;
}

/** Named axes do not by themselves claim incapacitation, death, or recovery behavior. */
export interface LivingSpeciesHealthContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly vitalityAxis: string | null;
  readonly injuryAxis: string | null;
  readonly incapacitation: boolean;
  readonly causalDeath: boolean;
  readonly recovery: boolean;
}

/** Sound is a simulation event contract as well as an audiovisual repertoire. */
export interface LivingSpeciesSoundContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly repertoire: readonly string[];
  readonly communicationSignals: readonly string[];
  readonly accessibilityCues: readonly string[];
}

/** Death/consumption aftermath remains physical or population-conserved, never a loot roll. */
export interface LivingSpeciesAftermathContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly decayOwnerId: string | null;
  readonly carcassModel: LivingSpeciesCarcassModel;
  readonly persistentIdentity: boolean;
  readonly resourceClasses: readonly string[];
  readonly evidenceOutputs: readonly string[];
}

/** One broad-class affordance, resolved by the shared Living Weft rather than a pair script. */
export interface LivingSpeciesInteractionTargetContract {
  readonly targetClass: LivingSpeciesInteractionTargetClass;
  readonly policy: LivingSpeciesInteractionPolicy;
  readonly perceptionChannels: readonly ObservationChannel[];
  readonly appraisals: readonly string[];
  readonly motivationAxes: readonly string[];
  readonly verbs: readonly string[];
  readonly escalationConstraints: readonly string[];
  readonly disengagementVerbs: readonly string[];
}

/** Broad interaction declarations force every profile to address the shared living world. */
export interface LivingSpeciesInteractionContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly targets: readonly LivingSpeciesInteractionTargetContract[];
  readonly nonWeaponPlayerResponses: readonly string[];
}

export interface LivingSpeciesIdentityContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly generationVersion: number;
  readonly form: LivingSpeciesIdentityForm;
  /** Exclusive persistent-ID prefix domain; collisions fail the whole catalog. */
  readonly stableIdNamespace: string;
  /** Empty except for validated hybrid composition. */
  readonly parentSpeciesIds: readonly string[];
}

export interface LivingSpeciesSpatialContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly positionModel: LivingSpeciesPositionModel;
  readonly signedRegions: boolean;
  readonly extremeRegions: boolean;
  readonly authoritativeHeading: boolean;
}

export interface LivingSpeciesPopulationContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly strategy: LivingSpeciesPopulationStrategy;
  readonly materialization: LivingSpeciesMaterializationStrategy;
  readonly maxMaterializedPerRegion: number;
  readonly coarseSimulation: boolean;
  /** The authoritative record conserved while representatives materialize and dematerialize. */
  readonly authoritativeUnit: LivingSpeciesAuthoritativeUnit;
  readonly dematerialization: LivingSpeciesDematerializationModel;
  readonly stateAxes: readonly LivingSpeciesStateAxisContract[];
  readonly carryingCapacityInputs: readonly string[];
  /** True only for the finite 42-resident bridge, never a biodiversity claim. */
  readonly compatibilityScope: boolean;
  readonly triggers: readonly LivingSpeciesMaterializationTrigger[];
}

export interface LivingSpeciesSenseChannelContract {
  readonly channel: ObservationChannel;
  /** Fixed-point relative capability; it is never an omniscient detection radius. */
  readonly relativeCapability: number;
  /** Physical modalities let one channel cover light, vibration, pressure, echolocation, and traces. */
  readonly modalities: readonly string[];
}

export interface LivingSpeciesSensesContract {
  /** `foundation` means profiles/evaluators exist but are not a live cognition feed. */
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly profileVersion: number;
  readonly channels: readonly LivingSpeciesSenseChannelContract[];
}

export interface LivingSpeciesStateAxisContract {
  readonly id: string;
  readonly representation: LivingSpeciesStateRepresentation;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

export interface LivingSpeciesPhysiologyContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly updateCadenceTicks: number;
  readonly needs: readonly LivingSpeciesStateAxisContract[];
  readonly conditions: readonly LivingSpeciesStateAxisContract[];
}

export interface LivingSpeciesLocomotionMediumContract {
  readonly medium: LivingSpeciesLocomotionMedium;
  readonly relativeCapability: number;
}

export interface LivingSpeciesLocomotionContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly mode: LivingSpeciesLocomotionMode;
  readonly decisionModel: LivingSpeciesDecisionModel;
  readonly crossRegion: boolean;
  readonly media: readonly LivingSpeciesLocomotionMediumContract[];
  /** Species verbs such as walk, hop, slither, climb, fly, glide, dive, and burrow. */
  readonly movementVerbs: readonly string[];
  /** Shared terrain affordances consumed by navigation; never species-specific pathing code. */
  readonly terrainAffordances: readonly string[];
}

export interface LivingSpeciesDietResourceContract {
  readonly resourceClass: string;
  readonly role: "nutrition" | "hydration";
}

export interface LivingSpeciesDietContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly mode: LivingSpeciesDietMode;
  readonly requiresPhysicalResource: boolean;
  readonly resources: readonly LivingSpeciesDietResourceContract[];
}

export interface LivingSpeciesCircadianContract {
  readonly status: LivingSpeciesCircadianStatus;
  readonly ownerId: string | null;
  readonly rhythm: LivingSpeciesCircadianRhythm;
  readonly cadenceTicks: number;
  /** Fixed-point phase bias, used only by an active schedule owner. */
  readonly phaseBias: number;
}

export interface LivingSpeciesActivityContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly decisionModel: LivingSpeciesDecisionModel;
  readonly decisionCadenceTicks: number;
  readonly offscreenModel: LivingSpeciesOffscreenModel;
  readonly circadian: LivingSpeciesCircadianContract;
}

export interface LivingSpeciesTerritoryContract {
  readonly model: LivingSpeciesTerritoryModel;
  readonly ownerId: string | null;
  /** Home range, den, nest, watering route, feeding area, shelter, or migration corridor. */
  readonly anchorKinds: readonly string[];
  readonly stateAxes: readonly LivingSpeciesStateAxisContract[];
  readonly dynamicInputs: readonly string[];
}

export interface LivingSpeciesGroupContract {
  readonly status: LivingSpeciesCapabilityStatus;
  readonly ownerId: string | null;
  readonly representation: LivingSpeciesGroupRepresentation;
  readonly organizationKinds: readonly string[];
  readonly stateAxes: readonly LivingSpeciesStateAxisContract[];
  readonly leadershipModel: LivingSpeciesLeadershipModel;
  readonly coordinationVerbs: readonly string[];
  readonly stableIdentity: boolean;
  readonly stableIdNamespace: string | null;
  readonly generationVersion: number;
  readonly membership: boolean;
  readonly informationPropagation: boolean;
  readonly splitMerge: boolean;
  readonly separationReunion: boolean;
  readonly sharedMemory: boolean;
}

export interface LivingSpeciesSocialContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly groupModel: LivingSpeciesGroupModel;
  readonly actorToActorRelationships: boolean;
  readonly relationshipAxes: readonly LivingSpeciesStateAxisContract[];
  readonly communicationChannels: readonly ObservationChannel[];
  readonly group: LivingSpeciesGroupContract;
  readonly territory: LivingSpeciesTerritoryContract;
}

export interface LivingSpeciesCognitionContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly attentionOwnerId: string | null;
  readonly model: LivingSpeciesCognitionModel;
  readonly maxMemories: number;
  readonly memoryKinds: readonly string[];
  readonly knowledgeSources: readonly string[];
  readonly inference: boolean;
}

export interface LivingSpeciesEvidenceContract {
  readonly status: LivingSpeciesCapabilityStatus;
  readonly ownerId: string | null;
  readonly decayOwnerId: string | null;
  readonly produces: readonly string[];
  readonly interprets: readonly string[];
}

export interface LivingSpeciesEnvironmentResponseContract {
  readonly status: LivingSpeciesCapabilityStatus;
  readonly ownerId: string | null;
  readonly inputs: readonly string[];
  /** Must reference condition-axis IDs declared by this same module. */
  readonly outputs: readonly string[];
}

export interface LivingSpeciesEnvironmentContract {
  readonly fire: LivingSpeciesEnvironmentResponseContract;
  readonly livingCover: LivingSpeciesEnvironmentResponseContract;
  readonly weather: LivingSpeciesEnvironmentResponseContract;
  readonly water: LivingSpeciesEnvironmentResponseContract;
  readonly possibility: LivingSpeciesEnvironmentResponseContract;
  readonly terrain: LivingSpeciesEnvironmentResponseContract;
  readonly tide: LivingSpeciesEnvironmentResponseContract;
}

export interface LivingSpeciesInventoryContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly model: LivingSpeciesInventoryModel;
  readonly acceptsCustody: boolean;
  readonly conservationRequired: boolean;
}

export interface LivingSpeciesAboutContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly directObservationRequired: boolean;
  readonly observableFields: readonly string[];
  readonly learnedFields: readonly string[];
}

export interface LivingSpeciesPersistenceContract {
  readonly implementation: LivingSpeciesImplementation;
  readonly ownerId: string | null;
  readonly defaultTier: LivingActorPersistenceTier;
  readonly allowedTiers: readonly LivingActorPersistenceTier[];
  readonly promotionTriggers: readonly string[];
  readonly generationMigration: LivingSpeciesGenerationMigration;
}

export interface LivingSpeciesModule {
  readonly version: typeof LIVING_SPECIES_MODULE_VERSION;
  readonly moduleId: string;
  readonly speciesId: string;
  readonly profile: LivingSpeciesProfileContract;
  readonly morphology: LivingSpeciesMorphologyContract;
  readonly habitat: LivingSpeciesHabitatContract;
  readonly identity: LivingSpeciesIdentityContract;
  readonly spatial: LivingSpeciesSpatialContract;
  readonly population: LivingSpeciesPopulationContract;
  readonly senses: LivingSpeciesSensesContract;
  readonly physiology: LivingSpeciesPhysiologyContract;
  readonly locomotion: LivingSpeciesLocomotionContract;
  readonly diet: LivingSpeciesDietContract;
  readonly foodWeb: LivingSpeciesFoodWebContract;
  readonly lifeHistory: LivingSpeciesLifeHistoryContract;
  readonly health: LivingSpeciesHealthContract;
  readonly activity: LivingSpeciesActivityContract;
  readonly social: LivingSpeciesSocialContract;
  readonly sound: LivingSpeciesSoundContract;
  readonly cognition: LivingSpeciesCognitionContract;
  readonly evidence: LivingSpeciesEvidenceContract;
  readonly aftermath: LivingSpeciesAftermathContract;
  readonly interactions: LivingSpeciesInteractionContract;
  readonly environment: LivingSpeciesEnvironmentContract;
  readonly inventory: LivingSpeciesInventoryContract;
  readonly about: LivingSpeciesAboutContract;
  readonly persistence: LivingSpeciesPersistenceContract;
}

export interface LivingSpeciesCatalog {
  readonly version: typeof LIVING_SPECIES_CATALOG_VERSION;
  /** Canonical ascending species-ID order. */
  readonly modules: readonly LivingSpeciesModule[];
}

const MODULE_KEYS = [
  "about",
  "activity",
  "aftermath",
  "cognition",
  "diet",
  "environment",
  "evidence",
  "foodWeb",
  "habitat",
  "health",
  "identity",
  "inventory",
  "interactions",
  "lifeHistory",
  "locomotion",
  "moduleId",
  "morphology",
  "persistence",
  "physiology",
  "population",
  "profile",
  "senses",
  "social",
  "sound",
  "spatial",
  "speciesId",
  "version",
] as const;
const OBSERVATION_CHANNELS: readonly ObservationChannel[] = [
  "evidence",
  "hearing",
  "scent",
  "social",
  "touch",
  "vision",
];
const OBSERVATION_CHANNEL_SET = new Set<string>(OBSERVATION_CHANNELS);
const POSITION_MODELS = new Set<string>(["segmented-point", "segmented-area", "segmented-hybrid"]);
const POPULATION_STRATEGIES = new Set<string>([
  "persistent-individuals",
  "deterministic-regional-individuals",
  "aggregate-field",
  "hybrid-population",
]);
const MATERIALIZATION_STRATEGIES = new Set<string>(["always", "active-window", "threshold", "mixed"]);
const MATERIALIZATION_TRIGGERS = new Set<string>([
  "active-window",
  "causal-event",
  "direct-observation",
  "interaction",
  "promotion",
  "save-load",
  "world-create",
]);
const AUTHORITATIVE_UNITS = new Set<string>([
  "ecological-pressure",
  "group-records",
  "hybrid",
  "individual-records",
  "population-patch",
]);
const DEMATERIALIZATION_MODELS = new Set<string>([
  "none",
  "preserve-individual-records",
  "reconcile-ecological-pressure",
  "reconcile-group-state",
  "reconcile-hybrid-state",
  "reconcile-population-state",
]);
const REPRESENTATIONS = new Set<string>(["fixed-point", "safe-integer", "boolean", "enum", "enum-set"]);
const LOCOMOTION_MEDIA = new Set<string>(["air", "deep-water", "land", "shallow-water", "structure", "subterranean"]);
const DIET_MODES = new Set<string>(["none", "resource-consumer", "omnivore", "herbivore", "carnivore", "detritivore", "filter-feeder"]);
const DECISION_MODELS = new Set<string>(["individual", "aggregate", "hybrid"]);
const OFFSCREEN_MODELS = new Set<string>(["none", "individual", "aggregate", "hybrid"]);
const CIRCADIAN_RHYTHMS = new Set<string>(["unspecified", "adaptive", "diurnal", "nocturnal", "crepuscular"]);
const GROUP_MODELS = new Set<string>(["solitary", "pair", "household", "variable", "group", "colony"]);
const GROUP_REPRESENTATIONS = new Set<string>(["none", "membership", "group-actor", "hybrid"]);
const LEADERSHIP_MODELS = new Set<string>(["none", "emergent", "persistent", "rotating"]);
const TERRITORY_MODELS = new Set<string>(["none", "individual", "group"]);
const INVENTORY_MODELS = new Set<string>(["none", "physical-items", "aggregate-resources", "hybrid"]);
const PERSISTENCE_TIERS = new Set<string>(["ephemeral", "regional", "promoted"]);
const GENERATION_MIGRATIONS = new Set<string>(["preserve-materialized-identity", "regenerate-unmaterialized-only"]);
const CAPABILITY_STATUSES = new Set<string>(["unimplemented", "foundation", "active"]);
const IMPLEMENTATIONS = CAPABILITY_STATUSES;
const TAXONOMIC_CLASSES = new Set<string>(["amphibian", "bird", "fish", "fungus", "invertebrate", "mammal", "microbe", "other-life", "plant", "reptile"]);
const COMPANION_ELIGIBILITY = new Set<string>(["never", "relationship-gated"]);
const MORPHOLOGY_MODELS = new Set<string>(["individual", "aggregate", "hybrid"]);
const LOCOMOTION_MODES = new Set<string>(["mobile", "sessile"]);
const MIGRATION_MODELS = new Set<string>(["none", "individual", "population", "hybrid"]);
const LIFE_HISTORY_MODELS = new Set<string>(["individual", "aggregate", "hybrid"]);
const REPRODUCTION_MODELS = new Set<string>(["unimplemented", "individual-birth", "population-recruitment", "hybrid-recruitment"]);
const MORTALITY_MODELS = new Set<string>(["unimplemented", "individual-causal", "population-turnover", "hybrid"]);
const CARCASS_MODELS = new Set<string>(["none", "physical", "aggregate", "hybrid"]);
const COGNITION_MODELS = new Set<string>([
  "aggregate",
  "bounded-learning",
  "hybrid",
  "noncognitive",
  "reactive",
  "sapient",
  "social-learning",
]);
const INTERACTION_TARGET_CLASSES = new Set<string>(LIVING_SPECIES_INTERACTION_TARGET_CLASSES);
const ID_PATTERN = /^[a-z][a-z0-9]*(?:(?:[._/-]|::?)[a-z0-9]+)*$/u;
const NAMESPACE_PATTERN = /^[A-Z][A-Z0-9-]{0,31}$/u;

const fixed = (id: string): LivingSpeciesStateAxisContract => ({
  id,
  representation: "fixed-point",
  minimum: 0,
  maximum: LIVING_SPECIES_CAPABILITY_SCALE,
});
const booleanAxis = (id: string): LivingSpeciesStateAxisContract => ({
  id,
  representation: "boolean",
  minimum: null,
  maximum: null,
});
const enumAxis = (id: string): LivingSpeciesStateAxisContract => ({
  id,
  representation: "enum",
  minimum: null,
  maximum: null,
});
const enumSetAxis = (id: string): LivingSpeciesStateAxisContract => ({
  id,
  representation: "enum-set",
  minimum: null,
  maximum: null,
});
const safeIntegerAxis = (
  id: string,
  maximum = Number.MAX_SAFE_INTEGER,
): LivingSpeciesStateAxisContract => ({
  id,
  representation: "safe-integer",
  minimum: 0,
  maximum,
});
const absentResponse = (): LivingSpeciesEnvironmentResponseContract => ({
  status: "unimplemented",
  ownerId: null,
  inputs: [],
  outputs: [],
});
const noTerritory = (): LivingSpeciesTerritoryContract => ({
  model: "none",
  ownerId: null,
  anchorKinds: [],
  stateAxes: [],
  dynamicInputs: [],
});
const noGroupSystem = (): LivingSpeciesGroupContract => ({
  status: "unimplemented",
  ownerId: null,
  representation: "none",
  organizationKinds: [],
  stateAxes: [],
  leadershipModel: "none",
  coordinationVerbs: [],
  stableIdentity: false,
  stableIdNamespace: null,
  generationVersion: 0,
  membership: false,
  informationPropagation: false,
  splitMerge: false,
  separationReunion: false,
  sharedMemory: false,
});
const noCircadianSchedule = (): LivingSpeciesCircadianContract => ({
  status: "unimplemented",
  ownerId: null,
  rhythm: "unspecified",
  cadenceTicks: 0,
  phaseBias: 0,
});
const noSound = (): LivingSpeciesSoundContract => ({
  implementation: "unimplemented",
  ownerId: null,
  repertoire: [],
  communicationSignals: [],
  accessibilityCues: [],
});
const noAftermath = (): LivingSpeciesAftermathContract => ({
  implementation: "unimplemented",
  ownerId: null,
  decayOwnerId: null,
  carcassModel: "none",
  persistentIdentity: false,
  resourceClasses: [],
  evidenceOutputs: [],
});
const noHealth = (): LivingSpeciesHealthContract => ({
  implementation: "unimplemented",
  ownerId: null,
  vitalityAxis: null,
  injuryAxis: null,
  incapacitation: false,
  causalDeath: false,
  recovery: false,
});

function coreWildlifeTaxonomicClass(
  species: CoreWildlifeSpecies,
): LivingSpeciesTaxonomicClass {
  return species === "gull" ? "bird" : "mammal";
}

function coreWildlifeDietMode(species: CoreWildlifeSpecies): LivingSpeciesDietMode {
  return species === "deer" ? "herbivore" : "omnivore";
}

function coreWildlifeInteractionTargets(
  species: CoreWildlifeSpecies,
): readonly LivingSpeciesInteractionTargetContract[] {
  const profile = getCoreWildlifeProfile(species);
  const targets: LivingSpeciesInteractionTargetContract[] = [
    {
      targetClass: "food",
      policy: "available",
      perceptionChannels: ["vision"],
      appraisals: ["food-value"],
      motivationAxes: ["hunger"],
      verbs: profile.roles.includes("scavenger")
        ? ["forage", "scavenge"]
        : ["forage"],
      escalationConstraints: ["direct-confirmation", "physical-resource-conservation"],
      disengagementVerbs: ["disengage"],
    },
    {
      targetClass: "human",
      policy: "available",
      perceptionChannels: ["vision"],
      appraisals: ["threat"],
      motivationAxes: ["safety"],
      verbs: ["observe", "retreat"],
      escalationConstraints: ["direct-perception-required", "no-omniscient-targeting"],
      disengagementVerbs: ["retreat"],
    },
    {
      targetClass: "predator",
      policy: "available",
      perceptionChannels: ["hearing", "vision"],
      appraisals: ["threat"],
      motivationAxes: ["safety"],
      verbs: profile.roles.includes("alarm-source")
        ? ["alarm", "flee", "retreat"]
        : ["flee", "retreat"],
      escalationConstraints: ["direct-perception-required", "no-omniscient-targeting"],
      disengagementVerbs: ["retreat"],
    },
  ];

  if (profile.roles.includes("predator")) {
    targets.push({
      targetClass: "smaller-prey",
      policy: "available",
      perceptionChannels: ["vision"],
      appraisals: ["food-value"],
      motivationAxes: ["hunger"],
      verbs: ["pursue"],
      escalationConstraints: ["bounded-pursuit", "direct-perception-required"],
      disengagementVerbs: ["disengage", "retreat"],
    });
  }

  return targets;
}

function sensesFromRegistry(
  species: LivingActorSpecies,
  scentModalities: readonly string[] = ["airborne-scent"],
): LivingSpeciesSensesContract {
  const registryEntry = livingSpeciesRegistryEntry(species);
  if (registryEntry === null) {
    throw new Error(`Missing Living Weft registry entry for ${species}.`);
  }
  return {
    implementation: "foundation",
    ownerId: "game:living-actor-senses:v1",
    profileVersion: LIVING_SPECIES_REGISTRY_VERSION,
    channels: [
      {
        channel: "hearing",
        relativeCapability: registryEntry.senses.hearingSensitivity,
        modalities: ["airborne-sound"],
      },
      {
        channel: "scent",
        relativeCapability: registryEntry.senses.scentSensitivity,
        modalities: [...scentModalities],
      },
      {
        channel: "vision",
        relativeCapability: registryEntry.senses.visionAcuity,
        modalities: ["visible-light"],
      },
    ],
  };
}

/**
 * Alpha 12 wildlife are persistent individual actors. Gull flock wording is a
 * directly-visible presentation summary only; it never replaces or merges the
 * authoritative individual records represented here.
 */
function coreWildlifeModule(species: CoreWildlifeSpecies): LivingSpeciesModule {
  const profile = getCoreWildlifeProfile(species);

  const foodResources = CORE_WILDLIFE_FOOD_CLASSES.filter(
    (resourceClass) => profile.foodAffinities[resourceClass] > 0,
  )
    .sort(compareText)
    .map((resourceClass) => ({ resourceClass, role: "nutrition" as const }));
  const ecologicalEffects = profile.roles.includes("alarm-source")
    ? ["alarm-information", "bounded-food-pressure"]
    : ["bounded-food-pressure"];
  const dynamicOverlays =
    species === "gull"
      ? ["visible-condition", "visible-flock-summary"]
      : ["visible-condition"];
  const movementMedium: LivingSpeciesLocomotionMedium = species === "gull" ? "air" : "land";
  const movementVerb = species === "gull" ? "fly" : "walk";
  const terrainAffordance = species === "gull" ? "open-air" : "land";

  return {
    version: LIVING_SPECIES_MODULE_VERSION,
    moduleId: `living-species:${species}:v1`,
    speciesId: species,
    profile: {
      implementation: "active",
      ownerId: "sim:core-wildlife-identity:v1",
      displayNameKey: `species.${species}`,
      taxonomicClass: coreWildlifeTaxonomicClass(species),
      ecologicalClasses: [...profile.roles].sort(compareText),
      companionEligibility: "never",
    },
    morphology: {
      implementation: "active",
      ownerId: "sim:core-wildlife-identity:v1",
      model: "individual",
      dimensions: ["life-stage-size"],
      appearanceTraits: ["life-stage", "morph", "sex", "temperament"],
      dynamicOverlays,
    },
    habitat: {
      implementation: "foundation",
      ownerId: "game:runtime-core-ecology:v1",
      habitatClasses: ["bounded-crossing"],
      placementInputs: ["origin-region", "population-key", "population-ordinal"],
      climateInputs: [],
      migrationModel: "none",
    },
    identity: {
      implementation: "active",
      ownerId: "sim:core-wildlife-identity:v1",
      generationVersion: CORE_WILDLIFE_IDENTITY_VERSION,
      form: "individual",
      stableIdNamespace: coreWildlifeIdPrefix(species).slice(0, -1),
      parentSpeciesIds: [],
    },
    spatial: {
      implementation: "active",
      ownerId: "game:living-actor-address:v1",
      positionModel: "segmented-point",
      signedRegions: true,
      extremeRegions: true,
      authoritativeHeading: true,
    },
    population: {
      implementation: "active",
      ownerId: "game:core-ecology:v1",
      strategy: "deterministic-regional-individuals",
      materialization: "active-window",
      maxMaterializedPerRegion: profile.maximumPatchPopulation,
      coarseSimulation: false,
      authoritativeUnit: "individual-records",
      dematerialization: "preserve-individual-records",
      stateAxes: [],
      carryingCapacityInputs: [],
      compatibilityScope: false,
      triggers: ["active-window", "save-load", "world-create"],
    },
    senses: sensesFromRegistry(species),
    physiology: {
      implementation: "active",
      ownerId: "game:core-wildlife-actor:v1",
      updateCadenceTicks: 1,
      needs: [fixed("hunger"), fixed("rest"), fixed("safety")],
      conditions: [fixed("exhaustion"), fixed("health"), fixed("stress")],
    },
    locomotion: {
      implementation: "active",
      ownerId: "game:runtime-core-ecology:v1",
      mode: "mobile",
      decisionModel: "individual",
      crossRegion: false,
      media: [{ medium: movementMedium, relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE }],
      movementVerbs: [movementVerb],
      terrainAffordances: [terrainAffordance],
    },
    diet: {
      implementation: "foundation",
      ownerId: "game:core-wildlife-actor:v1",
      mode: coreWildlifeDietMode(species),
      requiresPhysicalResource: true,
      resources: foodResources,
    },
    foodWeb: {
      implementation: "foundation",
      ownerId: "sim:core-wildlife-identity:v1",
      roles: [...profile.roles].sort(compareText),
      consumes: foodResources.map((resource) => resource.resourceClass),
      consumedBy: species === "deer" ? ["large-predator"] : [],
      competesWith: [],
      ecologicalEffects,
    },
    lifeHistory: {
      implementation: "foundation",
      ownerId: "sim:core-wildlife-identity:v1",
      model: "individual",
      stages: ["adult", "juvenile", "older"],
      dynamicAging: false,
      reproduction: "unimplemented",
      mortality: "unimplemented",
    },
    health: {
      implementation: "foundation",
      ownerId: "game:core-wildlife-actor:v1",
      vitalityAxis: "health",
      injuryAxis: null,
      incapacitation: false,
      causalDeath: false,
      recovery: false,
    },
    activity: {
      implementation: "active",
      ownerId: "game:core-wildlife-actor:v1",
      decisionModel: "individual",
      decisionCadenceTicks: 1,
      offscreenModel: "none",
      circadian: noCircadianSchedule(),
    },
    social: {
      implementation: "foundation",
      ownerId: "game:core-ecology-perception:v1",
      groupModel: species === "black-bear" ? "solitary" : "variable",
      actorToActorRelationships: false,
      relationshipAxes: [],
      communicationChannels: profile.roles.includes("alarm-source") ? ["hearing"] : [],
      group: noGroupSystem(),
      territory: noTerritory(),
    },
    sound: noSound(),
    cognition: {
      implementation: "active",
      ownerId: "game:core-wildlife-actor:v1",
      attentionOwnerId: "sim:actor-perception:v2",
      model: "bounded-learning",
      maxMemories: 16,
      memoryKinds: ["alarm", "disengagement", "food", "guard", "pursuit", "threat"],
      knowledgeSources: ["direct-observation"],
      inference: false,
    },
    evidence: {
      status: "unimplemented",
      ownerId: null,
      decayOwnerId: null,
      produces: [],
      interprets: [],
    },
    aftermath: noAftermath(),
    interactions: {
      implementation: "foundation",
      ownerId: "game:core-wildlife-actor:v1",
      targets: coreWildlifeInteractionTargets(species),
      nonWeaponPlayerResponses: ["inspect", "leave", "reroute", "wait"],
    },
    environment: {
      fire: absentResponse(),
      livingCover: absentResponse(),
      weather: absentResponse(),
      water: absentResponse(),
      possibility: absentResponse(),
      terrain: absentResponse(),
      tide: absentResponse(),
    },
    inventory: {
      implementation: "unimplemented",
      ownerId: null,
      model: "none",
      acceptsCustody: false,
      conservationRequired: false,
    },
    about: {
      implementation: "active",
      ownerId: "game:wildlife-about:v1",
      directObservationRequired: true,
      observableFields: [
        "approximate-size",
        "behavior",
        "condition",
        "life-stage",
        "morph",
        "species",
      ],
      learnedFields: [],
    },
    persistence: {
      implementation: "active",
      ownerId: "game:core-ecology:v1",
      defaultTier: "regional",
      allowedTiers: ["regional"],
      promotionTriggers: [],
      generationMigration: "preserve-materialized-identity",
    },
  };
}

const CURRENT_MODULE_INPUTS: readonly LivingSpeciesModule[] = [
  {
    version: LIVING_SPECIES_MODULE_VERSION,
    moduleId: "living-species:human:v1",
    speciesId: "human",
    profile: {
      implementation: "active",
      ownerId: "sim:npc-identity:v1",
      displayNameKey: "species.human",
      taxonomicClass: "mammal",
      ecologicalClasses: ["sapient-omnivore", "settlement-builder"],
      companionEligibility: "never",
    },
    morphology: {
      implementation: "active",
      ownerId: "sim:npc-identity:v1",
      model: "individual",
      dimensions: ["body-build", "height"],
      appearanceTraits: ["age-class", "distinguishing-mark", "name"],
      dynamicOverlays: ["clothing-condition", "wetness"],
    },
    habitat: {
      implementation: "foundation",
      ownerId: "sim:world-residents:v1",
      habitatClasses: ["settlement"],
      placementInputs: ["settlement-id"],
      climateInputs: ["weather"],
      migrationModel: "none",
    },
    identity: {
      implementation: "active",
      ownerId: "sim:npc-identity:v1",
      generationVersion: NPC_GENERATION_VERSION,
      form: "individual",
      stableIdNamespace: "H",
      parentSpeciesIds: [],
    },
    spatial: {
      implementation: "active",
      ownerId: "game:living-actor-address:v1",
      positionModel: "segmented-point",
      signedRegions: true,
      extremeRegions: true,
      authoritativeHeading: true,
    },
    population: {
      implementation: "active",
      ownerId: "sim:world-residents:v1",
      strategy: "persistent-individuals",
      materialization: "always",
      maxMaterializedPerRegion: 42,
      coarseSimulation: false,
      authoritativeUnit: "individual-records",
      dematerialization: "none",
      stateAxes: [],
      carryingCapacityInputs: [],
      compatibilityScope: true,
      triggers: ["save-load", "world-create"],
    },
    senses: sensesFromRegistry("human"),
    physiology: {
      implementation: "active",
      ownerId: "sim:resident-state:v1",
      updateCadenceTicks: 1,
      needs: [fixed("belonging"), fixed("food"), fixed("rest")],
      conditions: [
        fixed("cold-stress"),
        enumAxis("emotion"),
        fixed("exhaustion"),
        safeIntegerAxis("route-delay"),
        booleanAxis("sheltering"),
        fixed("wetness"),
      ],
    },
    locomotion: {
      implementation: "active",
      ownerId: "sim:resident-route-movement:v1",
      mode: "mobile",
      decisionModel: "individual",
      crossRegion: false,
      media: [{ medium: "land", relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE }],
      movementVerbs: ["walk"],
      terrainAffordances: ["route"],
    },
    diet: {
      implementation: "active",
      ownerId: "sim:resident-engine:v1",
      mode: "resource-consumer",
      requiresPhysicalResource: false,
      resources: [
        { resourceClass: "food", role: "nutrition" },
        { resourceClass: "fresh-water", role: "hydration" },
      ],
    },
    foodWeb: {
      implementation: "foundation",
      ownerId: "sim:resident-engine:v1",
      roles: ["omnivore"],
      consumes: ["food"],
      consumedBy: [],
      competesWith: [],
      ecologicalEffects: ["resource-consumption"],
    },
    lifeHistory: {
      implementation: "foundation",
      ownerId: "sim:npc-identity:v1",
      model: "individual",
      stages: ["adult", "older-adult", "young-adult"],
      dynamicAging: false,
      reproduction: "unimplemented",
      mortality: "unimplemented",
    },
    health: noHealth(),
    activity: {
      implementation: "active",
      ownerId: "sim:resident-engine:v1",
      decisionModel: "individual",
      decisionCadenceTicks: 1,
      offscreenModel: "individual",
      circadian: noCircadianSchedule(),
    },
    social: {
      implementation: "active",
      ownerId: "sim:resident-relationships:v1",
      groupModel: "variable",
      actorToActorRelationships: true,
      relationshipAxes: [fixed("trust")],
      communicationChannels: [],
      group: noGroupSystem(),
      territory: noTerritory(),
    },
    sound: noSound(),
    cognition: {
      implementation: "active",
      ownerId: "sim:resident-memory-knowledge:v1",
      attentionOwnerId: "sim:actor-perception:v2",
      model: "sapient",
      maxMemories: MAX_RESIDENT_MEMORIES,
      memoryKinds: ["met-player", "weather-shelter"],
      knowledgeSources: ["direct-observation", "interaction"],
      inference: false,
    },
    evidence: {
      status: "unimplemented",
      ownerId: null,
      decayOwnerId: null,
      produces: [],
      interprets: [],
    },
    aftermath: noAftermath(),
    interactions: {
      implementation: "foundation",
      ownerId: "sim:resident-engine:v1",
      targets: [
        {
          targetClass: "human",
          policy: "available",
          perceptionChannels: ["vision"],
          appraisals: ["relationship"],
          motivationAxes: ["social"],
          verbs: ["observe", "talk"],
          escalationConstraints: ["knowledge-gated"],
          disengagementVerbs: ["withdraw"],
        },
        {
          targetClass: "same-species",
          policy: "available",
          perceptionChannels: ["vision"],
          appraisals: ["relationship"],
          motivationAxes: ["social"],
          verbs: ["observe", "talk"],
          escalationConstraints: ["knowledge-gated"],
          disengagementVerbs: ["withdraw"],
        },
      ],
      nonWeaponPlayerResponses: ["inspect", "talk"],
    },
    environment: {
      fire: absentResponse(),
      livingCover: absentResponse(),
      weather: {
        status: "active",
        ownerId: "sim:resident-weather-response:v1",
        inputs: ["cold", "rain", "shelter"],
        outputs: ["cold-stress", "wetness"],
      },
      water: absentResponse(),
      possibility: absentResponse(),
      terrain: absentResponse(),
      tide: absentResponse(),
    },
    inventory: {
      implementation: "unimplemented",
      ownerId: null,
      model: "none",
      acceptsCustody: false,
      conservationRequired: false,
    },
    about: {
      implementation: "active",
      ownerId: "game:resident-about:v1",
      directObservationRequired: true,
      observableFields: [
        "age-class",
        "approximate-height",
        "behavior",
        "body-build",
        "condition",
        "distinguishing-mark",
        "emotional-cues",
        "species",
        "visible-gear",
      ],
      learnedFields: ["display-name", "home", "occupation"],
    },
    persistence: {
      implementation: "active",
      ownerId: "sim:world-state:v4",
      defaultTier: "promoted",
      allowedTiers: ["promoted"],
      promotionTriggers: [],
      generationMigration: "preserve-materialized-identity",
    },
  },
  {
    version: LIVING_SPECIES_MODULE_VERSION,
    moduleId: "living-species:domestic-dog:v1",
    speciesId: "domestic-dog",
    profile: {
      implementation: "foundation",
      ownerId: "sim:dog-identity:v1",
      displayNameKey: "species.domestic-dog",
      taxonomicClass: "mammal",
      ecologicalClasses: ["domestic-canid", "opportunistic-consumer"],
      companionEligibility: "relationship-gated",
    },
    morphology: {
      implementation: "foundation",
      ownerId: "sim:dog-identity:v1",
      model: "individual",
      dimensions: ["mass", "shoulder-height", "size"],
      appearanceTraits: ["age-class", "ancestry", "coat", "distinguishing-mark", "sex"],
      dynamicOverlays: ["wetness"],
    },
    habitat: {
      implementation: "foundation",
      ownerId: "sim:dog-identity:v1",
      habitatClasses: [
        "coastal-lowland",
        "cold-region",
        "remote-wildland",
        "settlement-edge",
        "temperate-route",
        "upland",
      ],
      placementInputs: ["habitat-class", "habitat-key", "origin-region", "population-key"],
      climateInputs: ["habitat-class"],
      migrationModel: "none",
    },
    identity: {
      implementation: "foundation",
      ownerId: "sim:dog-identity:v1",
      generationVersion: DOG_GENERATION_VERSION,
      form: "individual",
      stableIdNamespace: "D",
      parentSpeciesIds: [],
    },
    spatial: {
      implementation: "foundation",
      ownerId: "game:living-actor-address:v1",
      positionModel: "segmented-point",
      signedRegions: true,
      extremeRegions: true,
      authoritativeHeading: true,
    },
    population: {
      implementation: "unimplemented",
      ownerId: null,
      strategy: "deterministic-regional-individuals",
      materialization: "active-window",
      maxMaterializedPerRegion: 64,
      coarseSimulation: false,
      authoritativeUnit: "individual-records",
      dematerialization: "preserve-individual-records",
      stateAxes: [],
      carryingCapacityInputs: [],
      compatibilityScope: false,
      triggers: ["active-window", "causal-event", "promotion"],
    },
    senses: sensesFromRegistry("domestic-dog", ["airborne-scent", "ground-trace"]),
    physiology: {
      implementation: "foundation",
      ownerId: "game:dog-actor:v1",
      updateCadenceTicks: 1,
      needs: [
        fixed("company"),
        fixed("hunger"),
        fixed("rest"),
        fixed("safety"),
        fixed("thirst"),
      ],
      conditions: [
        fixed("cold-stress"),
        fixed("exhaustion"),
        fixed("health"),
        fixed("heat-stress"),
        enumSetAxis("injuries"),
        fixed("wetness"),
      ],
    },
    locomotion: {
      implementation: "foundation",
      ownerId: "game:dog-behavior:v1",
      mode: "mobile",
      decisionModel: "individual",
      crossRegion: false,
      media: [{ medium: "land", relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE }],
      movementVerbs: ["walk"],
      terrainAffordances: ["land"],
    },
    diet: {
      implementation: "foundation",
      ownerId: "game:dog-behavior:v1",
      mode: "resource-consumer",
      requiresPhysicalResource: true,
      resources: [
        { resourceClass: "food", role: "nutrition" },
        { resourceClass: "fresh-water", role: "hydration" },
      ],
    },
    foodWeb: {
      implementation: "foundation",
      ownerId: "game:dog-behavior:v1",
      roles: ["opportunistic-consumer", "scavenger"],
      consumes: ["food"],
      consumedBy: [],
      competesWith: [],
      ecologicalEffects: ["food-removal"],
    },
    lifeHistory: {
      implementation: "foundation",
      ownerId: "sim:dog-identity:v1",
      model: "individual",
      stages: ["adult", "puppy", "senior", "young"],
      dynamicAging: false,
      reproduction: "unimplemented",
      mortality: "unimplemented",
    },
    health: {
      implementation: "foundation",
      ownerId: "game:dog-actor:v1",
      vitalityAxis: "health",
      injuryAxis: "injuries",
      incapacitation: false,
      causalDeath: false,
      recovery: false,
    },
    activity: {
      implementation: "foundation",
      ownerId: "game:dog-behavior:v1",
      decisionModel: "individual",
      decisionCadenceTicks: 4,
      offscreenModel: "none",
      circadian: noCircadianSchedule(),
    },
    social: {
      implementation: "foundation",
      ownerId: "game:dog-actor:v1",
      groupModel: "variable",
      actorToActorRelationships: true,
      relationshipAxes: [enumAxis("human-familiarity"), fixed("human-familiarity-confidence")],
      communicationChannels: [],
      group: noGroupSystem(),
      territory: noTerritory(),
    },
    sound: noSound(),
    cognition: {
      implementation: "foundation",
      ownerId: "game:dog-actor:v1",
      attentionOwnerId: "sim:actor-perception:v2",
      model: "social-learning",
      maxMemories: 16,
      memoryKinds: [
        "custody",
        "food",
        "human-interaction",
        "identity-learning",
        "ledger-event",
        "relationship",
        "safety",
      ],
      knowledgeSources: ["direct-observation", "interaction", "trusted-report"],
      inference: false,
    },
    evidence: {
      status: "unimplemented",
      ownerId: null,
      decayOwnerId: null,
      produces: [],
      interprets: [],
    },
    aftermath: noAftermath(),
    interactions: {
      implementation: "foundation",
      ownerId: "game:dog-behavior:v1",
      targets: [
        {
          targetClass: "human",
          policy: "available",
          perceptionChannels: ["scent", "vision"],
          appraisals: ["familiarity", "threat"],
          motivationAxes: ["company", "safety"],
          verbs: ["approach", "avoid"],
          escalationConstraints: ["relationship-gated"],
          disengagementVerbs: ["retreat"],
        },
        {
          targetClass: "predator",
          policy: "available",
          perceptionChannels: ["hearing", "scent", "vision"],
          appraisals: ["threat"],
          motivationAxes: ["safety"],
          verbs: ["avoid", "flee"],
          escalationConstraints: ["no-omniscient-targeting"],
          disengagementVerbs: ["retreat"],
        },
      ],
      nonWeaponPlayerResponses: [],
    },
    environment: {
      fire: absentResponse(),
      livingCover: absentResponse(),
      weather: {
        status: "foundation",
        ownerId: "game:dog-exposure:v1",
        inputs: ["ambient-cold", "ambient-heat", "rain", "shelter", "wind"],
        outputs: ["cold-stress", "exhaustion", "heat-stress", "wetness"],
      },
      water: {
        status: "foundation",
        ownerId: "game:dog-exposure:v1",
        inputs: ["immersion"],
        outputs: ["cold-stress", "wetness"],
      },
      possibility: absentResponse(),
      terrain: absentResponse(),
      tide: absentResponse(),
    },
    inventory: {
      implementation: "unimplemented",
      ownerId: null,
      model: "none",
      acceptsCustody: false,
      conservationRequired: false,
    },
    about: {
      implementation: "foundation",
      ownerId: "game:dog-about:v1",
      directObservationRequired: true,
      observableFields: [
        "approximate-size",
        "coat",
        "distinguishing-mark",
        "species",
        "visible-condition",
      ],
      learnedFields: [
        "human-familiarity",
        "recognizable-individual",
        "significant-history",
        "temperament",
      ],
    },
    persistence: {
      implementation: "foundation",
      ownerId: "game:dog-actor:v1",
      defaultTier: "regional",
      allowedTiers: ["promoted", "regional"],
      promotionTriggers: [
        "causal-event",
        "custody-change",
        "identity-learning",
        "ledger-entry",
        "relationship-change",
      ],
      generationMigration: "preserve-materialized-identity",
    },
  },
  ...CORE_WILDLIFE_SPECIES.map(coreWildlifeModule),
] as const;

/** Strictly validate and clone one module. Extra keys and unordered sets fail. */
export function canonicalizeLivingSpeciesModule(value: unknown): LivingSpeciesModule | null {
  if (!plainRecord(value) || !exactKeys(value, MODULE_KEYS)) return null;
  if (
    value.version !== LIVING_SPECIES_MODULE_VERSION
    || !canonicalId(value.speciesId, 64)
    || value.moduleId !== `living-species:${value.speciesId}:v${LIVING_SPECIES_MODULE_VERSION}`
  ) return null;
  if (!validProfile(value.profile)) return null;
  if (!validIdentity(value.identity) || !validSpatial(value.spatial)) return null;
  if (!validMorphology(value.morphology, value.identity.form)) return null;
  if (!validHabitat(value.habitat, value.identity.form)) return null;
  if (!validPopulation(value.population, value.identity.form)) return null;
  if (!validSenses(value.senses)) return null;
  if (!validPhysiology(value.physiology)) return null;
  if (!validLocomotion(value.locomotion, value.identity.form)) return null;
  if (!validDiet(value.diet)) return null;
  if (!validFoodWeb(value.foodWeb)) return null;
  if (!validLifeHistory(value.lifeHistory, value.identity.form)) return null;
  if (!validActivity(value.activity, value.identity.form)) return null;
  if (!validSocial(value.social, value.senses.channels)) return null;
  if (!validSound(value.sound, value.social)) return null;
  if (!validCognition(value.cognition)) return null;
  if (!validEvidence(value.evidence)) return null;
  const conditionIds = new Set(value.physiology.conditions.map(({ id }) => id));
  if (!validHealth(value.health, conditionIds)) return null;
  if (!validAftermath(value.aftermath, value.identity.form)) return null;
  if (!validInteractions(value.interactions, value.senses.channels)) return null;
  if (!validEnvironment(value.environment, conditionIds)) return null;
  if (!validInventory(value.inventory)) return null;
  if (!validAbout(value.about)) return null;
  if (!validPersistence(value.persistence)) return null;
  if (!crossContractCoherence(value as unknown as LivingSpeciesModule)) return null;
  return deepFreeze(clonePlain(value as unknown as LivingSpeciesModule));
}

/**
 * Build a catalog independent of registration order. Duplicate species,
 * modules, or persistent-ID namespaces invalidate the entire transaction.
 */
export function createLivingSpeciesCatalog(values: readonly unknown[]): LivingSpeciesCatalog | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_LIVING_SPECIES_MODULES) {
    return null;
  }
  const modules: LivingSpeciesModule[] = [];
  for (const value of values) {
    const module = canonicalizeLivingSpeciesModule(value);
    if (module === null) return null;
    modules.push(module);
  }
  modules.sort(compareModule);
  const speciesIds = new Set<string>();
  const moduleIds = new Set<string>();
  const namespaces = new Set<string>();
  for (const module of modules) {
    if (
      speciesIds.has(module.speciesId)
      || moduleIds.has(module.moduleId)
      || namespaces.has(module.identity.stableIdNamespace)
    ) return null;
    speciesIds.add(module.speciesId);
    moduleIds.add(module.moduleId);
    namespaces.add(module.identity.stableIdNamespace);
    if (module.social.group.stableIdNamespace !== null) {
      if (namespaces.has(module.social.group.stableIdNamespace)) return null;
      namespaces.add(module.social.group.stableIdNamespace);
    }
  }
  for (const module of modules) {
    if (module.identity.parentSpeciesIds.some((parent) => !speciesIds.has(parent))) return null;
  }
  return deepFreeze({ version: LIVING_SPECIES_CATALOG_VERSION, modules });
}

/** Persisted catalog shapes must already use canonical module ordering. */
export function canonicalizeLivingSpeciesCatalog(value: unknown): LivingSpeciesCatalog | null {
  if (!plainRecord(value) || !exactKeys(value, ["modules", "version"])) return null;
  if (value.version !== LIVING_SPECIES_CATALOG_VERSION || !Array.isArray(value.modules)) return null;
  const catalog = createLivingSpeciesCatalog(value.modules);
  if (catalog === null || !sameData(catalog, value)) return null;
  return catalog;
}

for (const module of CURRENT_MODULE_INPUTS) {
  if (canonicalizeLivingSpeciesModule(module) === null) {
    throw new Error(`Built-in Living Weft species module is invalid: ${module.speciesId}`);
  }
}
const currentCatalog = createLivingSpeciesCatalog(CURRENT_MODULE_INPUTS);
if (currentCatalog === null) throw new Error("Built-in Living Weft species catalog is invalid");
const currentSpecies = currentCatalog.modules.map(({ speciesId }) => speciesId);
const expectedSpecies = [...LIVING_ACTOR_SPECIES].sort(compareText);
if (!sameStringArray(currentSpecies, expectedSpecies)) {
  throw new Error("Living Weft catalog does not exactly cover the implemented actor roster");
}

/** Only implemented identity owners are present; this is deliberately not a planned roster. */
export const LIVING_SPECIES_CATALOG: LivingSpeciesCatalog = currentCatalog;

export function livingSpeciesModule(speciesId: string): LivingSpeciesModule | null {
  if (!canonicalId(speciesId, 64)) return null;
  return LIVING_SPECIES_CATALOG.modules.find((module) => module.speciesId === speciesId) ?? null;
}

function validProfile(value: unknown): value is LivingSpeciesProfileContract {
  return plainRecord(value)
    && exactKeys(value, [
      "companionEligibility",
      "displayNameKey",
      "ecologicalClasses",
      "implementation",
      "ownerId",
      "taxonomicClass",
    ])
    && implementedOwner(value.implementation, value.ownerId)
    && value.implementation !== "unimplemented"
    && canonicalId(value.displayNameKey, 96)
    && TAXONOMIC_CLASSES.has(value.taxonomicClass as string)
    && COMPANION_ELIGIBILITY.has(value.companionEligibility as string)
    && canonicalStringSet(value.ecologicalClasses, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    && value.ecologicalClasses.length > 0;
}

function validMorphology(
  value: unknown,
  form: LivingSpeciesIdentityForm,
): value is LivingSpeciesMorphologyContract {
  return plainRecord(value)
    && exactKeys(value, [
      "appearanceTraits",
      "dimensions",
      "dynamicOverlays",
      "implementation",
      "model",
      "ownerId",
    ])
    && implementedOwner(value.implementation, value.ownerId)
    && value.implementation !== "unimplemented"
    && MORPHOLOGY_MODELS.has(value.model as string)
    && value.model === form
    && canonicalCapabilityList(value.dimensions, false)
    && canonicalCapabilityList(value.appearanceTraits, false)
    && canonicalCapabilityList(value.dynamicOverlays, true);
}

function validHabitat(
  value: unknown,
  form: LivingSpeciesIdentityForm,
): value is LivingSpeciesHabitatContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "climateInputs",
    "habitatClasses",
    "implementation",
    "migrationModel",
    "ownerId",
    "placementInputs",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !canonicalCapabilityList(value.habitatClasses, false)
    || !canonicalCapabilityList(value.placementInputs, false)
    || !canonicalCapabilityList(value.climateInputs, true)
    || !MIGRATION_MODELS.has(value.migrationModel as string)
  ) return false;
  if (form === "individual") return value.migrationModel === "none" || value.migrationModel === "individual";
  if (form === "aggregate") return value.migrationModel === "none" || value.migrationModel === "population";
  return value.migrationModel === "none" || value.migrationModel === "hybrid";
}

function validFoodWeb(value: unknown): value is LivingSpeciesFoodWebContract {
  return plainRecord(value)
    && exactKeys(value, [
      "competesWith",
      "consumedBy",
      "consumes",
      "ecologicalEffects",
      "implementation",
      "ownerId",
      "roles",
    ])
    && implementedOwner(value.implementation, value.ownerId)
    && value.implementation !== "unimplemented"
    && canonicalCapabilityList(value.roles, false)
    && canonicalCapabilityList(value.consumes, true)
    && canonicalCapabilityList(value.consumedBy, true)
    && canonicalCapabilityList(value.competesWith, true)
    && canonicalCapabilityList(value.ecologicalEffects, true);
}

function validLifeHistory(
  value: unknown,
  form: LivingSpeciesIdentityForm,
): value is LivingSpeciesLifeHistoryContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "dynamicAging",
    "implementation",
    "model",
    "mortality",
    "ownerId",
    "reproduction",
    "stages",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !LIFE_HISTORY_MODELS.has(value.model as string)
    || value.model !== form
    || !canonicalCapabilityList(value.stages, false)
    || typeof value.dynamicAging !== "boolean"
    || !REPRODUCTION_MODELS.has(value.reproduction as string)
    || !MORTALITY_MODELS.has(value.mortality as string)
  ) return false;
  if (form === "individual") {
    return (value.reproduction === "unimplemented" || value.reproduction === "individual-birth")
      && (value.mortality === "unimplemented" || value.mortality === "individual-causal");
  }
  if (form === "aggregate") {
    return (value.reproduction === "unimplemented" || value.reproduction === "population-recruitment")
      && (value.mortality === "unimplemented" || value.mortality === "population-turnover");
  }
  return (value.reproduction === "unimplemented" || value.reproduction === "hybrid-recruitment")
    && (value.mortality === "unimplemented" || value.mortality === "hybrid");
}

function validHealth(
  value: unknown,
  conditionIds: ReadonlySet<string>,
): value is LivingSpeciesHealthContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "causalDeath",
    "implementation",
    "incapacitation",
    "injuryAxis",
    "ownerId",
    "recovery",
    "vitalityAxis",
  ])) return false;
  if (
    !IMPLEMENTATIONS.has(value.implementation as string)
    || typeof value.incapacitation !== "boolean"
    || typeof value.causalDeath !== "boolean"
    || typeof value.recovery !== "boolean"
  ) return false;
  if (value.implementation === "unimplemented") {
    return value.ownerId === null
      && value.vitalityAxis === null
      && value.injuryAxis === null
      && !value.incapacitation
      && !value.causalDeath
      && !value.recovery;
  }
  const vitality = value.vitalityAxis === null
    || (canonicalId(value.vitalityAxis, 64) && conditionIds.has(value.vitalityAxis));
  const injury = value.injuryAxis === null
    || (canonicalId(value.injuryAxis, 64) && conditionIds.has(value.injuryAxis));
  return ownerId(value.ownerId)
    && vitality
    && injury
    && (value.vitalityAxis !== null || value.injuryAxis !== null);
}

function validSound(
  value: unknown,
  social: LivingSpeciesSocialContract,
): value is LivingSpeciesSoundContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "accessibilityCues",
    "communicationSignals",
    "implementation",
    "ownerId",
    "repertoire",
  ])) return false;
  if (
    !IMPLEMENTATIONS.has(value.implementation as string)
    || !canonicalCapabilityList(value.repertoire, true)
    || !canonicalCapabilityList(value.communicationSignals, true)
    || !canonicalCapabilityList(value.accessibilityCues, true)
  ) return false;
  if (value.implementation === "unimplemented") {
    return value.ownerId === null
      && value.repertoire.length === 0
      && value.communicationSignals.length === 0
      && value.accessibilityCues.length === 0;
  }
  const repertoire = new Set(value.repertoire);
  return ownerId(value.ownerId)
    && value.repertoire.length > 0
    && value.communicationSignals.every((signal) => repertoire.has(signal))
    && (value.communicationSignals.length === 0 || social.communicationChannels.includes("hearing"));
}

function validAftermath(
  value: unknown,
  form: LivingSpeciesIdentityForm,
): value is LivingSpeciesAftermathContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "carcassModel",
    "decayOwnerId",
    "evidenceOutputs",
    "implementation",
    "ownerId",
    "persistentIdentity",
    "resourceClasses",
  ])) return false;
  if (
    !IMPLEMENTATIONS.has(value.implementation as string)
    || !CARCASS_MODELS.has(value.carcassModel as string)
    || typeof value.persistentIdentity !== "boolean"
    || !canonicalCapabilityList(value.resourceClasses, true)
    || !canonicalCapabilityList(value.evidenceOutputs, true)
  ) return false;
  if (value.implementation === "unimplemented") {
    return value.ownerId === null
      && value.decayOwnerId === null
      && value.carcassModel === "none"
      && !value.persistentIdentity
      && value.resourceClasses.length === 0
      && value.evidenceOutputs.length === 0;
  }
  const expected: LivingSpeciesCarcassModel = form === "individual"
    ? "physical"
    : form === "aggregate"
      ? "aggregate"
      : "hybrid";
  return ownerId(value.ownerId)
    && ownerId(value.decayOwnerId)
    && value.carcassModel === expected
    && value.resourceClasses.length > 0
    && value.evidenceOutputs.length > 0
    && (form !== "individual" || value.persistentIdentity);
}

function validInteractions(
  value: unknown,
  senses: readonly LivingSpeciesSenseChannelContract[],
): value is LivingSpeciesInteractionContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "implementation",
    "nonWeaponPlayerResponses",
    "ownerId",
    "targets",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !Array.isArray(value.targets)
    || value.targets.length > INTERACTION_TARGET_CLASSES.size
    || !canonicalCapabilityList(value.nonWeaponPlayerResponses, true)
  ) return false;
  const sensed = new Set(senses.map(({ channel }) => channel));
  let prior = "";
  for (const target of value.targets) {
    if (
      !plainRecord(target)
      || !exactKeys(target, [
        "appraisals",
        "disengagementVerbs",
        "escalationConstraints",
        "motivationAxes",
        "perceptionChannels",
        "policy",
        "targetClass",
        "verbs",
      ])
      || !INTERACTION_TARGET_CLASSES.has(target.targetClass as string)
      || (target.policy !== "available" && target.policy !== "intentional-no-response")
      || !canonicalStringSet(
        target.perceptionChannels,
        OBSERVATION_CHANNELS.length,
        (entry) => OBSERVATION_CHANNEL_SET.has(entry),
      )
      || target.perceptionChannels.some((channel) => !sensed.has(channel as ObservationChannel))
      || !canonicalCapabilityList(target.appraisals, true)
      || !canonicalCapabilityList(target.motivationAxes, true)
      || !canonicalCapabilityList(target.verbs, true)
      || !canonicalCapabilityList(target.escalationConstraints, true)
      || !canonicalCapabilityList(target.disengagementVerbs, true)
      || (prior !== "" && prior >= (target.targetClass as string))
    ) return false;
    prior = target.targetClass as string;
    if (target.policy === "available") {
      if (
        target.perceptionChannels.length === 0
        || target.appraisals.length === 0
        || target.motivationAxes.length === 0
        || target.verbs.length === 0
      ) {
        return false;
      }
    } else if (
      target.appraisals.length !== 0
      || target.motivationAxes.length !== 0
      || target.verbs.length !== 0
      || target.escalationConstraints.length !== 0
      || target.disengagementVerbs.length !== 0
    ) return false;
  }
  if (value.implementation === "active" && value.targets.length !== INTERACTION_TARGET_CLASSES.size) return false;
  return value.targets.length + value.nonWeaponPlayerResponses.length > 0;
}

function validIdentity(value: unknown): value is LivingSpeciesIdentityContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "form",
    "generationVersion",
    "implementation",
    "ownerId",
    "parentSpeciesIds",
    "stableIdNamespace",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !positiveSafeInteger(value.generationVersion)
    || (value.form !== "individual" && value.form !== "aggregate" && value.form !== "hybrid")
    || typeof value.stableIdNamespace !== "string"
    || !NAMESPACE_PATTERN.test(value.stableIdNamespace)
    || !canonicalStringSet(value.parentSpeciesIds, 8, (entry) => canonicalId(entry, 64))
  ) return false;
  return value.form === "hybrid"
    ? value.parentSpeciesIds.length >= 2
    : value.parentSpeciesIds.length === 0;
}

function validSpatial(value: unknown): value is LivingSpeciesSpatialContract {
  return plainRecord(value)
    && exactKeys(value, ["authoritativeHeading", "extremeRegions", "implementation", "ownerId", "positionModel", "signedRegions"])
    && implementedOwner(value.implementation, value.ownerId)
    && value.implementation !== "unimplemented"
    && POSITION_MODELS.has(value.positionModel as string)
    && typeof value.signedRegions === "boolean"
    && typeof value.extremeRegions === "boolean"
    && typeof value.authoritativeHeading === "boolean";
}

function validPopulation(value: unknown, form: LivingSpeciesIdentityForm): value is LivingSpeciesPopulationContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "authoritativeUnit",
    "carryingCapacityInputs",
    "coarseSimulation",
    "compatibilityScope",
    "dematerialization",
    "implementation",
    "materialization",
    "maxMaterializedPerRegion",
    "ownerId",
    "stateAxes",
    "strategy",
    "triggers",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || !POPULATION_STRATEGIES.has(value.strategy as string)
    || !MATERIALIZATION_STRATEGIES.has(value.materialization as string)
    || !AUTHORITATIVE_UNITS.has(value.authoritativeUnit as string)
    || !DEMATERIALIZATION_MODELS.has(value.dematerialization as string)
    || !positiveSafeInteger(value.maxMaterializedPerRegion)
    || value.maxMaterializedPerRegion > MAX_MATERIALIZED_ACTORS_PER_REGION
    || typeof value.coarseSimulation !== "boolean"
    || typeof value.compatibilityScope !== "boolean"
    || !validStateAxes(value.stateAxes, true)
    || !canonicalCapabilityList(value.carryingCapacityInputs, true)
    || !canonicalStringSet(value.triggers, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => MATERIALIZATION_TRIGGERS.has(entry))
    || value.triggers.length === 0
  ) return false;
  if (value.compatibilityScope && (
    value.implementation !== "active"
    || value.strategy !== "persistent-individuals"
    || value.materialization !== "always"
  )) return false;
  if (form === "individual") {
    if (
      value.authoritativeUnit !== "individual-records"
      || (value.strategy !== "persistent-individuals" && value.strategy !== "deterministic-regional-individuals")
      || (value.materialization !== "always" && value.materialization !== "active-window")
    ) return false;
    return value.materialization === "always"
      ? value.dematerialization === "none"
      : value.dematerialization === "preserve-individual-records";
  }
  if (form === "aggregate") {
    const reconciliationMatches =
      (value.authoritativeUnit === "group-records" && value.dematerialization === "reconcile-group-state")
      || (value.authoritativeUnit === "population-patch" && value.dematerialization === "reconcile-population-state")
      || (value.authoritativeUnit === "ecological-pressure" && value.dematerialization === "reconcile-ecological-pressure");
    return reconciliationMatches
      && value.strategy === "aggregate-field"
      && value.materialization === "threshold"
      && value.coarseSimulation
      && value.stateAxes.length > 0
      && value.carryingCapacityInputs.length > 0;
  }
  return value.authoritativeUnit === "hybrid"
    && value.dematerialization === "reconcile-hybrid-state"
    && value.strategy === "hybrid-population"
    && value.materialization === "mixed"
    && value.coarseSimulation
    && value.stateAxes.length > 0
    && value.carryingCapacityInputs.length > 0;
}

function validSenses(value: unknown): value is LivingSpeciesSensesContract {
  if (!plainRecord(value) || !exactKeys(value, ["channels", "implementation", "ownerId", "profileVersion"])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !positiveSafeInteger(value.profileVersion)
    || !Array.isArray(value.channels)
  ) return false;
  if (value.channels.length === 0 || value.channels.length > OBSERVATION_CHANNELS.length) return false;
  let prior = "";
  for (const channel of value.channels) {
    if (
      !plainRecord(channel)
      || !exactKeys(channel, ["channel", "modalities", "relativeCapability"])
      || !OBSERVATION_CHANNEL_SET.has(channel.channel as string)
      || !fixedPoint(channel.relativeCapability)
      || channel.relativeCapability === 0
      || !canonicalCapabilityList(channel.modalities, false)
      || (prior !== "" && prior >= (channel.channel as string))
    ) return false;
    prior = channel.channel as string;
  }
  return true;
}

function validPhysiology(value: unknown): value is LivingSpeciesPhysiologyContract {
  if (!plainRecord(value) || !exactKeys(value, ["conditions", "implementation", "needs", "ownerId", "updateCadenceTicks"])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !positiveSafeInteger(value.updateCadenceTicks)
  ) return false;
  if (!validStateAxes(value.needs, false) || !validStateAxes(value.conditions, false)) return false;
  const allIds = [...value.needs, ...value.conditions].map(({ id }) => id);
  return new Set(allIds).size === allIds.length;
}

function validStateAxes(value: unknown, allowEmpty: boolean): value is readonly LivingSpeciesStateAxisContract[] {
  if (!Array.isArray(value) || value.length > MAX_SPECIES_STATE_AXES || (!allowEmpty && value.length === 0)) return false;
  let prior = "";
  for (const axis of value) {
    if (
      !plainRecord(axis)
      || !exactKeys(axis, ["id", "maximum", "minimum", "representation"])
      || !canonicalId(axis.id, 64)
      || !REPRESENTATIONS.has(axis.representation as string)
      || (prior !== "" && prior >= axis.id)
    ) return false;
    prior = axis.id as string;
    if (axis.representation === "fixed-point") {
      if (axis.minimum !== 0 || axis.maximum !== LIVING_SPECIES_CAPABILITY_SCALE) return false;
    } else if (axis.representation === "safe-integer") {
      if (!nonnegativeSafeInteger(axis.minimum) || !nonnegativeSafeInteger(axis.maximum) || axis.minimum > axis.maximum) return false;
    } else if (axis.minimum !== null || axis.maximum !== null) return false;
  }
  return true;
}

function validLocomotion(value: unknown, form: LivingSpeciesIdentityForm): value is LivingSpeciesLocomotionContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "crossRegion",
    "decisionModel",
    "implementation",
    "media",
    "mode",
    "movementVerbs",
    "ownerId",
    "terrainAffordances",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !LOCOMOTION_MODES.has(value.mode as string)
    || !DECISION_MODELS.has(value.decisionModel as string)
    || typeof value.crossRegion !== "boolean"
    || !Array.isArray(value.media)
    || value.media.length > LOCOMOTION_MEDIA.size
    || !canonicalCapabilityList(value.movementVerbs, true)
    || !canonicalCapabilityList(value.terrainAffordances, false)
  ) return false;
  let prior = "";
  for (const medium of value.media) {
    if (
      !plainRecord(medium)
      || !exactKeys(medium, ["medium", "relativeCapability"])
      || !LOCOMOTION_MEDIA.has(medium.medium as string)
      || !fixedPoint(medium.relativeCapability)
      || medium.relativeCapability === 0
      || (prior !== "" && prior >= (medium.medium as string))
    ) return false;
    prior = medium.medium as string;
  }
  if (value.decisionModel !== form) return false;
  return value.mode === "sessile"
    ? !value.crossRegion && value.media.length === 0 && value.movementVerbs.length === 0
    : value.media.length > 0 && value.movementVerbs.length > 0;
}

function validDiet(value: unknown): value is LivingSpeciesDietContract {
  if (!plainRecord(value) || !exactKeys(value, ["implementation", "mode", "ownerId", "requiresPhysicalResource", "resources"])) return false;
  if (
    !IMPLEMENTATIONS.has(value.implementation as string)
    || !DIET_MODES.has(value.mode as string)
    || typeof value.requiresPhysicalResource !== "boolean"
    || !Array.isArray(value.resources)
  ) {
    return false;
  }
  let prior = "";
  for (const resource of value.resources) {
    if (
      !plainRecord(resource)
      || !exactKeys(resource, ["resourceClass", "role"])
      || !canonicalId(resource.resourceClass, 64)
      || (resource.role !== "nutrition" && resource.role !== "hydration")
      || (prior !== "" && prior >= resource.resourceClass)
    ) return false;
    prior = resource.resourceClass as string;
  }
  if (value.mode === "none") {
    return value.implementation === "unimplemented"
      && value.ownerId === null
      && !value.requiresPhysicalResource
      && value.resources.length === 0;
  }
  return value.implementation !== "unimplemented"
    && ownerId(value.ownerId)
    && value.resources.length > 0
    && value.resources.length <= MAX_SPECIES_CAPABILITY_ENTRIES;
}

function validActivity(value: unknown, form: LivingSpeciesIdentityForm): value is LivingSpeciesActivityContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "circadian",
    "decisionCadenceTicks",
    "decisionModel",
    "implementation",
    "offscreenModel",
    "ownerId",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !DECISION_MODELS.has(value.decisionModel as string)
    || value.decisionModel !== form
    || !positiveSafeInteger(value.decisionCadenceTicks)
    || !OFFSCREEN_MODELS.has(value.offscreenModel as string)
    || !validCircadian(value.circadian)
  ) return false;
  if (form === "aggregate") return value.offscreenModel === "aggregate";
  if (form === "hybrid") return value.offscreenModel === "hybrid";
  return value.offscreenModel === "none" || value.offscreenModel === "individual";
}

function validCircadian(value: unknown): value is LivingSpeciesCircadianContract {
  if (!plainRecord(value) || !exactKeys(value, ["cadenceTicks", "ownerId", "phaseBias", "rhythm", "status"])) return false;
  if (
    (value.status !== "unimplemented" && value.status !== "active")
    || !CIRCADIAN_RHYTHMS.has(value.rhythm as string)
    || !fixedPoint(value.phaseBias)
  ) return false;
  if (value.status === "unimplemented") {
    return value.ownerId === null && value.rhythm === "unspecified" && value.cadenceTicks === 0 && value.phaseBias === 0;
  }
  return ownerId(value.ownerId) && value.rhythm !== "unspecified" && positiveSafeInteger(value.cadenceTicks);
}

function validSocial(value: unknown, senses: readonly LivingSpeciesSenseChannelContract[]): value is LivingSpeciesSocialContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "actorToActorRelationships",
    "communicationChannels",
    "group",
    "groupModel",
    "implementation",
    "ownerId",
    "relationshipAxes",
    "territory",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !GROUP_MODELS.has(value.groupModel as string)
    || typeof value.actorToActorRelationships !== "boolean"
    || !validStateAxes(value.relationshipAxes, true)
    || !canonicalStringSet(value.communicationChannels, OBSERVATION_CHANNELS.length, (entry) => OBSERVATION_CHANNEL_SET.has(entry))
    || !validGroup(value.group, value.communicationChannels as ObservationChannel[])
    || !validTerritory(value.territory)
  ) return false;
  const sensed = new Set(senses.map(({ channel }) => channel));
  if (value.communicationChannels.some((channel) => !sensed.has(channel as ObservationChannel))) return false;
  return value.actorToActorRelationships || value.relationshipAxes.length === 0;
}

function validGroup(
  value: unknown,
  communicationChannels: readonly ObservationChannel[],
): value is LivingSpeciesGroupContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "coordinationVerbs",
    "generationVersion",
    "informationPropagation",
    "leadershipModel",
    "membership",
    "organizationKinds",
    "ownerId",
    "representation",
    "separationReunion",
    "sharedMemory",
    "splitMerge",
    "stableIdNamespace",
    "stableIdentity",
    "stateAxes",
    "status",
  ])) return false;
  if (
    !CAPABILITY_STATUSES.has(value.status as string)
    || !GROUP_REPRESENTATIONS.has(value.representation as string)
    || !LEADERSHIP_MODELS.has(value.leadershipModel as string)
    || !canonicalCapabilityList(value.organizationKinds, true)
    || !canonicalCapabilityList(value.coordinationVerbs, true)
    || !validStateAxes(value.stateAxes, true)
    || typeof value.stableIdentity !== "boolean"
    || (value.stableIdNamespace !== null && (
      typeof value.stableIdNamespace !== "string" || !NAMESPACE_PATTERN.test(value.stableIdNamespace)
    ))
    || !nonnegativeSafeInteger(value.generationVersion)
    || typeof value.membership !== "boolean"
    || typeof value.informationPropagation !== "boolean"
    || typeof value.splitMerge !== "boolean"
    || typeof value.separationReunion !== "boolean"
    || typeof value.sharedMemory !== "boolean"
  ) return false;
  if (value.status === "unimplemented") {
    return value.ownerId === null
      && value.representation === "none"
      && value.organizationKinds.length === 0
      && value.stateAxes.length === 0
      && value.leadershipModel === "none"
      && value.coordinationVerbs.length === 0
      && !value.stableIdentity
      && value.stableIdNamespace === null
      && value.generationVersion === 0
      && !value.membership
      && !value.informationPropagation
      && !value.splitMerge
      && !value.separationReunion
      && !value.sharedMemory;
  }
  if (!ownerId(value.ownerId) || value.organizationKinds.length === 0) return false;
  if (value.representation === "none") {
    return !value.stableIdentity
      && value.stableIdNamespace === null
      && value.generationVersion === 0
      && !value.membership
      && !value.informationPropagation
      && !value.splitMerge
      && value.leadershipModel === "none"
      && value.coordinationVerbs.length === 0
      && !value.separationReunion
      && !value.sharedMemory
      && value.stateAxes.length === 0;
  }
  if (
    !value.stableIdentity
    || value.stableIdNamespace === null
    || value.generationVersion === 0
    || !value.membership
    || value.stateAxes.length === 0
    || value.coordinationVerbs.length === 0
  ) return false;
  if (value.informationPropagation && communicationChannels.length === 0) return false;
  return !value.splitMerge || value.representation === "group-actor" || value.representation === "hybrid";
}

function validTerritory(value: unknown): value is LivingSpeciesTerritoryContract {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["anchorKinds", "dynamicInputs", "model", "ownerId", "stateAxes"])
    || !TERRITORY_MODELS.has(value.model as string)
    || !canonicalCapabilityList(value.anchorKinds, true)
    || !validStateAxes(value.stateAxes, true)
    || !canonicalCapabilityList(value.dynamicInputs, true)
  ) return false;
  if (value.model === "none") {
    return value.ownerId === null
      && value.anchorKinds.length === 0
      && value.stateAxes.length === 0
      && value.dynamicInputs.length === 0;
  }
  return ownerId(value.ownerId)
    && value.anchorKinds.length > 0
    && value.stateAxes.length > 0
    && value.dynamicInputs.length > 0;
}

function validCognition(value: unknown): value is LivingSpeciesCognitionContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "attentionOwnerId",
    "implementation",
    "inference",
    "knowledgeSources",
    "maxMemories",
    "memoryKinds",
    "model",
    "ownerId",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !COGNITION_MODELS.has(value.model as string)
    || !nonnegativeSafeInteger(value.maxMemories)
    || value.maxMemories > 4_096
    || !canonicalStringSet(value.memoryKinds, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    || !canonicalStringSet(value.knowledgeSources, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    || typeof value.inference !== "boolean"
    || (value.maxMemories > 0 && value.memoryKinds.length === 0)
  ) return false;
  if (value.model === "noncognitive") {
    return value.attentionOwnerId === null
      && value.maxMemories === 0
      && value.memoryKinds.length === 0
      && value.knowledgeSources.length === 0
      && !value.inference;
  }
  return ownerId(value.attentionOwnerId);
}

function validEvidence(value: unknown): value is LivingSpeciesEvidenceContract {
  if (!plainRecord(value) || !exactKeys(value, ["decayOwnerId", "interprets", "ownerId", "produces", "status"])) return false;
  if (
    !CAPABILITY_STATUSES.has(value.status as string)
    || !canonicalStringSet(value.produces, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    || !canonicalStringSet(value.interprets, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
  ) return false;
  if (value.status === "unimplemented") {
    return value.ownerId === null && value.decayOwnerId === null && value.produces.length === 0 && value.interprets.length === 0;
  }
  return ownerId(value.ownerId)
    && ownerId(value.decayOwnerId)
    && (value.produces.length > 0 || value.interprets.length > 0);
}

function validEnvironment(value: unknown, conditionIds: ReadonlySet<string>): value is LivingSpeciesEnvironmentContract {
  return plainRecord(value)
    && exactKeys(value, ["fire", "livingCover", "possibility", "terrain", "tide", "water", "weather"])
    && validResponse(value.fire, conditionIds)
    && validResponse(value.livingCover, conditionIds)
    && validResponse(value.weather, conditionIds)
    && validResponse(value.water, conditionIds)
    && validResponse(value.possibility, conditionIds)
    && validResponse(value.terrain, conditionIds)
    && validResponse(value.tide, conditionIds);
}

function validResponse(value: unknown, conditionIds: ReadonlySet<string>): value is LivingSpeciesEnvironmentResponseContract {
  if (!plainRecord(value) || !exactKeys(value, ["inputs", "outputs", "ownerId", "status"])) return false;
  if (
    !CAPABILITY_STATUSES.has(value.status as string)
    || !canonicalStringSet(value.inputs, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    || !canonicalStringSet(value.outputs, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    || value.outputs.some((axis) => !conditionIds.has(axis))
  ) return false;
  if (value.status === "unimplemented") {
    return value.ownerId === null && value.inputs.length === 0 && value.outputs.length === 0;
  }
  return ownerId(value.ownerId) && value.inputs.length > 0 && value.outputs.length > 0;
}

function validInventory(value: unknown): value is LivingSpeciesInventoryContract {
  if (!plainRecord(value) || !exactKeys(value, ["acceptsCustody", "conservationRequired", "implementation", "model", "ownerId"])) return false;
  if (
    !IMPLEMENTATIONS.has(value.implementation as string)
    || !INVENTORY_MODELS.has(value.model as string)
    || typeof value.acceptsCustody !== "boolean"
    || typeof value.conservationRequired !== "boolean"
  ) return false;
  if (value.model === "none") {
    return value.implementation === "unimplemented"
      && value.ownerId === null
      && !value.acceptsCustody
      && !value.conservationRequired;
  }
  return value.implementation !== "unimplemented"
    && ownerId(value.ownerId)
    && value.acceptsCustody
    && value.conservationRequired;
}

function validAbout(value: unknown): value is LivingSpeciesAboutContract {
  if (!plainRecord(value) || !exactKeys(value, ["directObservationRequired", "implementation", "learnedFields", "observableFields", "ownerId"])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || typeof value.directObservationRequired !== "boolean"
    || !canonicalStringSet(value.observableFields, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    || !canonicalStringSet(value.learnedFields, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    || value.observableFields.length === 0
  ) return false;
  const observed = new Set(value.observableFields);
  return value.learnedFields.every((field) => !observed.has(field));
}

function validPersistence(value: unknown): value is LivingSpeciesPersistenceContract {
  if (!plainRecord(value) || !exactKeys(value, [
    "allowedTiers",
    "defaultTier",
    "generationMigration",
    "implementation",
    "ownerId",
    "promotionTriggers",
  ])) return false;
  if (
    !implementedOwner(value.implementation, value.ownerId)
    || value.implementation === "unimplemented"
    || !PERSISTENCE_TIERS.has(value.defaultTier as string)
    || !canonicalStringSet(value.allowedTiers, PERSISTENCE_TIERS.size, (entry) => PERSISTENCE_TIERS.has(entry))
    || !canonicalStringSet(value.promotionTriggers, MAX_SPECIES_CAPABILITY_ENTRIES, (entry) => canonicalId(entry, 64))
    || !GENERATION_MIGRATIONS.has(value.generationMigration as string)
    || !value.allowedTiers.includes(value.defaultTier as string)
  ) return false;
  if (value.defaultTier === "promoted") return value.promotionTriggers.length === 0;
  return value.allowedTiers.includes("promoted") ? value.promotionTriggers.length > 0 : value.promotionTriggers.length === 0;
}

function crossContractCoherence(module: LivingSpeciesModule): boolean {
  const form = module.identity.form;
  const expectedPosition: LivingSpeciesPositionModel = form === "individual"
    ? "segmented-point"
    : form === "aggregate"
      ? "segmented-area"
      : "segmented-hybrid";
  if (module.spatial.positionModel !== expectedPosition) return false;
  if (!module.spatial.signedRegions || !module.spatial.extremeRegions) return false;
  if (module.population.strategy === "persistent-individuals" && module.persistence.defaultTier !== "promoted") return false;
  if (module.activity.offscreenModel === "none" && module.population.coarseSimulation) return false;
  if (module.population.coarseSimulation && module.activity.offscreenModel === "none") return false;
  if (module.identity.parentSpeciesIds.includes(module.speciesId)) return false;
  if (module.profile.companionEligibility === "relationship-gated" && (
    module.identity.form === "aggregate" || !module.social.actorToActorRelationships
  )) return false;
  if (module.population.authoritativeUnit === "group-records" && (
    module.social.group.status === "unimplemented"
    || (module.social.group.representation !== "group-actor" && module.social.group.representation !== "hybrid")
  )) return false;
  if (module.social.group.sharedMemory && module.cognition.maxMemories === 0) return false;
  if (module.foodWeb.consumes.length > 0 && module.diet.mode === "none") return false;
  if (module.lifeHistory.dynamicAging && module.lifeHistory.implementation !== "active") return false;
  if (module.health.causalDeath && !module.health.incapacitation) return false;
  if (module.aftermath.implementation !== "unimplemented" && !module.health.causalDeath) return false;
  return true;
}

function canonicalCapabilityList(value: unknown, allowEmpty: boolean): value is readonly string[] {
  return canonicalStringSet(
    value,
    MAX_SPECIES_CAPABILITY_ENTRIES,
    (entry) => canonicalId(entry, 64),
  ) && (allowEmpty || value.length > 0);
}

function canonicalStringSet(
  value: unknown,
  maximum: number,
  predicate: (entry: string) => boolean,
): value is readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  let prior = "";
  for (const entry of value) {
    if (typeof entry !== "string" || !predicate(entry) || (prior !== "" && prior >= entry)) return false;
    prior = entry;
  }
  return true;
}

function canonicalId(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && value === value.trim()
    && ID_PATTERN.test(value);
}

function ownerId(value: unknown): value is string {
  return canonicalId(value, 96) && value.includes(":v");
}

function implementedOwner(implementation: unknown, owner: unknown): boolean {
  if (!IMPLEMENTATIONS.has(implementation as string)) return false;
  return implementation === "unimplemented" ? owner === null : ownerId(owner);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function fixedPoint(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= LIVING_SPECIES_CAPABILITY_SCALE;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const canonicalExpected = [...expected].sort(compareText);
  return actual.length === canonicalExpected.length
    && actual.every((key, index) => key === canonicalExpected[index]);
}

function compareModule(left: LivingSpeciesModule, right: LivingSpeciesModule): number {
  return compareText(left.speciesId, right.speciesId) || compareText(left.moduleId, right.moduleId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
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
    return sameStringArray(leftKeys, rightKeys)
      && leftKeys.every((key) => sameData(left[key], right[key]));
  }
  return false;
}

function clonePlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clonePlain(entry)) as T;
  if (plainRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)])) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
