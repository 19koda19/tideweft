import {
  LIVING_SPECIES_CATALOG,
  LIVING_SPECIES_CATALOG_VERSION,
  LIVING_SPECIES_INTERACTION_TARGET_CLASSES,
  livingSpeciesModule,
} from "./livingSpeciesCatalog";
import {
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID,
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES,
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES,
  CORE_ECOLOGY_ACTIVITY_ARCHETYPES,
  validateCoreEcologyActivityAffordances,
} from "./coreEcologyActivityAffordance";
import { CORE_ECOLOGY_ACTIVITY_OWNER_ID } from "./coreEcologyActivity";
import {
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_OWNER_ID,
  coreEcologySpeciesRuntimePolicy,
  validateCoreEcologySpeciesRuntimePolicies,
  type CoreEcologySpeciesRuntimeCapability,
} from "./coreEcologySpeciesRuntimePolicy";
import type { LivingActorSpecies } from "./livingSpeciesRegistry";

export const LIVING_SPECIES_RELEASE_GATE_VERSION = 1 as const;
export const LIVING_SPECIES_READINESS_REPORT_VERSION = 1 as const;
export const MAX_RELEASE_EVIDENCE_OWNERS = 8 as const;
export const ALPHA16_MARSH_EDGE_BOUNDED_READINESS_VERSION = 1 as const;
export const ALPHA17_RAIN_CHORUS_BOUNDED_READINESS_VERSION = 1 as const;
export const WAVE_B_BOUNDED_STARTING_HARBOR_READINESS_VERSION = 1 as const;
export const WAVE_C_TIDAL_TABLE_BOUNDED_READINESS_VERSION = 1 as const;
export const ALPHA20_AMERICAN_BLACK_DUCK_BOUNDED_READINESS_VERSION = 1 as const;
export const ALPHA21_RIVER_OTTER_BOUNDED_READINESS_VERSION = 1 as const;
export const ALPHA22_TIDAL_CONVERGENCE_SOURCE_CANDIDATE_VERSION = 1 as const;
export const ALPHA24_DOMESTIC_CHICKEN_BOUNDED_READINESS_VERSION = 1 as const;
export const ALPHA25_SHARED_DOMESTIC_LIVESTOCK_READINESS_VERSION = 1 as const;

/** Complete species release gate. Order is stable and auditable. */
export const LIVING_SPECIES_RELEASE_CRITERIA = [
  "species-profile",
  "ecological-niche",
  "appearance",
  "sound",
  "habitat-placement",
  "food-web",
  "perception-senses",
  "locomotion",
  "human-interaction",
  "dog-interaction",
  "same-species-interaction",
  "other-species-interaction",
  "neutral-behavior",
  "disengagement",
  "environmental-evidence",
  "about-disclosure",
  "knowledge-honesty",
  "population-materialization",
  "full-coarse-transition",
  "save-load",
  "seamless-region-crossing",
  "performance-budget",
  "accessibility",
  "mobile-parity",
  "player-independent-scenario",
  "fuzz-testing",
  "clone-diversity",
  "tutorial-truth",
  "patch-note-truth",
  "exact-tested-deployment",
] as const;

export type LivingSpeciesReleaseCriterion = (typeof LIVING_SPECIES_RELEASE_CRITERIA)[number];
export type LivingSpeciesReleaseStatus =
  | "active"
  | "foundation"
  | "unimplemented"
  | "not-applicable";
export type LivingSpeciesNotApplicableReason =
  | "biologically-silent"
  | "no-human-ecological-overlap"
  | "no-dog-ecological-overlap";

export interface LivingSpeciesNotApplicableEvidence {
  readonly reason: LivingSpeciesNotApplicableReason;
  /** Authoritative ecology record proving that this is absence, not missing work. */
  readonly ecologyOwnerId: string;
}

export interface LivingSpeciesReleaseCriterionState {
  readonly criterion: LivingSpeciesReleaseCriterion;
  readonly status: LivingSpeciesReleaseStatus;
  /** Required and canonical for active/foundation; empty otherwise. */
  readonly evidenceOwnerIds: readonly string[];
  readonly notApplicable: LivingSpeciesNotApplicableEvidence | null;
}

export interface LivingSpeciesReleaseGate {
  readonly version: typeof LIVING_SPECIES_RELEASE_GATE_VERSION;
  readonly catalogVersion: typeof LIVING_SPECIES_CATALOG_VERSION;
  readonly speciesId: string;
  readonly moduleId: string;
  readonly criteria: readonly LivingSpeciesReleaseCriterionState[];
}

export interface LivingSpeciesReleaseGateSet {
  readonly version: typeof LIVING_SPECIES_RELEASE_GATE_VERSION;
  readonly gates: readonly LivingSpeciesReleaseGate[];
}

export type LivingSpeciesReadinessState = "invalid-claim" | "blocked" | "public-ready";

export interface LivingSpeciesReadinessCounts {
  readonly active: number;
  readonly foundation: number;
  readonly unimplemented: number;
  readonly notApplicable: number;
  readonly total: number;
}

export interface LivingSpeciesReadinessReport {
  readonly version: typeof LIVING_SPECIES_READINESS_REPORT_VERSION;
  readonly speciesId: string;
  readonly moduleId: string;
  /** Exact match against build-owned evidence, not a caller assertion. */
  readonly evidenceAuthenticated: boolean;
  readonly state: LivingSpeciesReadinessState;
  readonly publicReady: boolean;
  readonly counts: LivingSpeciesReadinessCounts;
  readonly blockingCriteria: readonly LivingSpeciesReleaseCriterion[];
}

export const ALPHA16_MARSH_EDGE_SPECIES = [
  "marsh-rabbit",
  "marsh-fox",
] as const satisfies readonly LivingActorSpecies[];

export type Alpha16MarshEdgeSpecies = (typeof ALPHA16_MARSH_EDGE_SPECIES)[number];

export const ALPHA17_RAIN_CHORUS_SPECIES = [
  "fish-crow",
  "northern-harrier",
  "southern-leopard-frog",
] as const satisfies readonly LivingActorSpecies[];

export type Alpha17RainChorusSpecies = (typeof ALPHA17_RAIN_CHORUS_SPECIES)[number];

export const WAVE_C_TIDAL_TABLE_SPECIES = [
  "atlantic-silverside",
  "atlantic-marsh-fiddler-crab",
  "snowy-egret",
] as const satisfies readonly LivingActorSpecies[];

export type WaveCTidalTableSpecies = (typeof WAVE_C_TIDAL_TABLE_SPECIES)[number];

export type WaveCTidalTableRole =
  | "forage-fish-school"
  | "intertidal-crab-area"
  | "wader";
export type WaveCTidalTableRepresentation =
  | "school-aggregate"
  | "area-aggregate"
  | "individual-wader";
export type WaveCTidalTableContinuity =
  | "signed-frame-aggregate-continuity"
  | "bounded-local-individual-continuity";
export type WaveCTidalTableExcludedClaim =
  | "worldwide-ecology"
  | "wildlife-promotion"
  | "ecological-cross-region-migration"
  | "mortality"
  | "capture"
  | "consumption"
  | "carcasses"
  | "fishing"
  | "harvest"
  | "waterfowl"
  | "otter-like-predator"
  | "full-wave-c"
  | "full-directive-04-1";

export interface WaveCTidalTableRoleReadiness {
  readonly role: WaveCTidalTableRole;
  readonly speciesId: WaveCTidalTableSpecies;
  readonly representation: WaveCTidalTableRepresentation;
  /**
   * Aggregates prove conserved signed-frame state, not ecological migration.
   * The egret proves only bounded local individual continuity.
   */
  readonly continuity: WaveCTidalTableContinuity;
  readonly evidenceAuthenticated: boolean;
  readonly representationAuthenticated: boolean;
  readonly interactionContractAuthenticated: boolean;
  readonly tidalResponseAuthenticated: boolean;
  readonly continuityAuthenticated: boolean;
  readonly performanceEvidenceAuthenticated: boolean;
  readonly ready: boolean;
  readonly evidenceOwnerIds: readonly string[];
}

export interface WaveCTidalTableBoundedReadinessReport {
  readonly version: typeof WAVE_C_TIDAL_TABLE_BOUNDED_READINESS_VERSION;
  readonly unitId: "tidal-table";
  readonly scope: "bounded-starting-harbor-tidal";
  readonly speciesIds: readonly WaveCTidalTableSpecies[];
  readonly roles: readonly WaveCTidalTableRoleReadiness[];
  readonly evidenceAuthenticated: boolean;
  readonly roleCoverageReady: boolean;
  readonly broadInteractionCoverageReady: boolean;
  readonly tidalResponseReady: boolean;
  readonly signedFrameAggregateContinuityReady: boolean;
  readonly localWaderContinuityReady: boolean;
  readonly performanceEvidenceReady: boolean;
  readonly boundedCandidateReady: boolean;
  readonly blockingRoles: readonly WaveCTidalTableRole[];
  readonly publicationRecordsReady: boolean;
  readonly exactTestedDeploymentVerified: boolean;
  readonly published: boolean;
  readonly fullThirtyCriterionReady: boolean;
  /** Claims that this deliberately bounded report can never authorize. */
  readonly excludedClaims: readonly WaveCTidalTableExcludedClaim[];
}

interface WaveCTidalTableRoleDefinition {
  readonly role: WaveCTidalTableRole;
  readonly speciesId: WaveCTidalTableSpecies;
  readonly representation: WaveCTidalTableRepresentation;
  readonly continuity: WaveCTidalTableContinuity;
}

const WAVE_C_TIDAL_TABLE_ROLE_DEFINITIONS: readonly WaveCTidalTableRoleDefinition[] = [
  {
    role: "forage-fish-school",
    speciesId: "atlantic-silverside",
    representation: "school-aggregate",
    continuity: "signed-frame-aggregate-continuity",
  },
  {
    role: "intertidal-crab-area",
    speciesId: "atlantic-marsh-fiddler-crab",
    representation: "area-aggregate",
    continuity: "signed-frame-aggregate-continuity",
  },
  {
    role: "wader",
    speciesId: "snowy-egret",
    representation: "individual-wader",
    continuity: "bounded-local-individual-continuity",
  },
] as const;

export const WAVE_C_TIDAL_TABLE_EXCLUDED_CLAIMS = [
  "worldwide-ecology",
  "wildlife-promotion",
  "ecological-cross-region-migration",
  "mortality",
  "capture",
  "consumption",
  "carcasses",
  "fishing",
  "harvest",
  "waterfowl",
  "otter-like-predator",
  "full-wave-c",
  "full-directive-04-1",
] as const satisfies readonly WaveCTidalTableExcludedClaim[];

export const ALPHA20_AMERICAN_BLACK_DUCK_SPECIES = [
  "american-black-duck",
] as const satisfies readonly LivingActorSpecies[];

export type Alpha20AmericanBlackDuckSpecies =
  (typeof ALPHA20_AMERICAN_BLACK_DUCK_SPECIES)[number];

export type Alpha20AmericanBlackDuckBoundedCapability =
  | "species-profile"
  | "individual-representation"
  | "habitat-placement"
  | "bounded-activity"
  | "multimodal-locomotion"
  | "lawful-perception"
  | "individual-presentation"
  | "nonlethal-interactions"
  | "bounded-local-continuity"
  | "performance-budget"
  | "excluded-claim-integrity";

export type Alpha20AmericanBlackDuckExcludedClaim =
  | "mortality"
  | "carcasses"
  | "nesting"
  | "ecological-cross-region-migration"
  | "full-flock"
  | "capture"
  | "consumption"
  | "reproduction"
  | "full-wave-c"
  | "full-directive-04-1";

export const ALPHA20_AMERICAN_BLACK_DUCK_EXCLUDED_CLAIMS = [
  "mortality",
  "carcasses",
  "nesting",
  "ecological-cross-region-migration",
  "full-flock",
  "capture",
  "consumption",
  "reproduction",
  "full-wave-c",
  "full-directive-04-1",
] as const satisfies readonly Alpha20AmericanBlackDuckExcludedClaim[];

export interface Alpha20AmericanBlackDuckBoundedReadinessReport {
  readonly version: typeof ALPHA20_AMERICAN_BLACK_DUCK_BOUNDED_READINESS_VERSION;
  readonly unitId: "alpha20-american-black-duck";
  readonly scope: "one-bounded-waterfowl-individual";
  readonly speciesIds: readonly Alpha20AmericanBlackDuckSpecies[];
  readonly evidenceAuthenticated: boolean;
  readonly speciesProfileReady: boolean;
  readonly individualRepresentationReady: boolean;
  readonly habitatPlacementReady: boolean;
  readonly boundedActivityReady: boolean;
  readonly multimodalLocomotionReady: boolean;
  readonly lawfulPerceptionReady: boolean;
  readonly individualPresentationReady: boolean;
  readonly nonlethalInteractionsReady: boolean;
  readonly boundedLocalContinuityReady: boolean;
  readonly performanceEvidenceReady: boolean;
  readonly excludedClaimIntegrityReady: boolean;
  readonly boundedCandidateReady: boolean;
  readonly blockingCapabilities: readonly Alpha20AmericanBlackDuckBoundedCapability[];
  readonly evidenceOwnerIds: readonly string[];
  readonly publicationRecordsReady: boolean;
  readonly exactTestedDeploymentVerified: boolean;
  readonly published: boolean;
  readonly fullThirtyCriterionReady: boolean;
  /** Claims this one-individual technical witness can never authorize. */
  readonly excludedClaims: readonly Alpha20AmericanBlackDuckExcludedClaim[];
}

export const ALPHA21_RIVER_OTTER_SPECIES = [
  "north-american-river-otter",
] as const satisfies readonly LivingActorSpecies[];

export type Alpha21RiverOtterSpecies = (typeof ALPHA21_RIVER_OTTER_SPECIES)[number];

export type Alpha21RiverOtterBoundedCapability =
  | "species-profile"
  | "individual-representation"
  | "habitat-placement"
  | "bounded-activity"
  | "amphibious-locomotion"
  | "lawful-perception"
  | "top-k-materialization"
  | "save-migration"
  | "individual-presentation"
  | "nonlethal-interactions"
  | "bounded-local-continuity"
  | "performance-budget"
  | "representative-emergence"
  | "excluded-claim-integrity";

export type Alpha21RiverOtterExcludedClaim =
  | "mortality"
  | "carcasses"
  | "harmful-predation"
  | "capture"
  | "live-prey-consumption"
  | "sound"
  | "environmental-evidence"
  | "reproduction"
  | "same-species-interaction"
  | "ecological-cross-region-migration"
  | "weather-water-tide-condition-mutation"
  | "full-trophic-turnover"
  | "full-wave-c"
  | "full-directive-04-1";

export const ALPHA21_RIVER_OTTER_EXCLUDED_CLAIMS = [
  "mortality",
  "carcasses",
  "harmful-predation",
  "capture",
  "live-prey-consumption",
  "sound",
  "environmental-evidence",
  "reproduction",
  "same-species-interaction",
  "ecological-cross-region-migration",
  "weather-water-tide-condition-mutation",
  "full-trophic-turnover",
  "full-wave-c",
  "full-directive-04-1",
] as const satisfies readonly Alpha21RiverOtterExcludedClaim[];

export interface Alpha21RiverOtterBoundedReadinessReport {
  readonly version: typeof ALPHA21_RIVER_OTTER_BOUNDED_READINESS_VERSION;
  readonly unitId: "alpha21-north-american-river-otter";
  readonly scope: "one-bounded-amphibious-individual";
  readonly speciesIds: readonly Alpha21RiverOtterSpecies[];
  readonly evidenceAuthenticated: boolean;
  readonly speciesProfileReady: boolean;
  readonly individualRepresentationReady: boolean;
  readonly habitatPlacementReady: boolean;
  readonly boundedActivityReady: boolean;
  readonly amphibiousLocomotionReady: boolean;
  readonly lawfulPerceptionReady: boolean;
  readonly topKMaterializationReady: boolean;
  readonly saveMigrationReady: boolean;
  readonly individualPresentationReady: boolean;
  readonly nonlethalInteractionsReady: boolean;
  readonly boundedLocalContinuityReady: boolean;
  readonly performanceEvidenceReady: boolean;
  readonly representativeEmergenceReady: boolean;
  readonly excludedClaimIntegrityReady: boolean;
  readonly boundedCandidateReady: boolean;
  readonly blockingCapabilities: readonly Alpha21RiverOtterBoundedCapability[];
  readonly evidenceOwnerIds: readonly string[];
  readonly publicationRecordsReady: boolean;
  readonly exactTestedDeploymentVerified: boolean;
  readonly published: boolean;
  readonly fullThirtyCriterionReady: boolean;
  /** Claims this bounded shore-water witness can never authorize. */
  readonly excludedClaims: readonly Alpha21RiverOtterExcludedClaim[];
}

export const ALPHA22_TIDAL_CONVERGENCE_SPECIES = [
  "atlantic-silverside",
  "atlantic-marsh-fiddler-crab",
  "snowy-egret",
  "american-black-duck",
  "north-american-river-otter",
  "gull",
] as const satisfies readonly LivingActorSpecies[];

export type Alpha22TidalConvergenceSpecies =
  (typeof ALPHA22_TIDAL_CONVERGENCE_SPECIES)[number];

export type Alpha22TidalConvergenceSourceCapability =
  | "historical-slice-evidence"
  | "registry-coherence"
  | "reusable-activity-archetypes"
  | "capability-driven-surface-observation"
  | "representative-emergence"
  | "bounded-abstraction-fuzz"
  | "performance-budget"
  | "resource-conservation"
  | "excluded-claim-integrity";

export type Alpha22TidalConvergenceExcludedClaim =
  | "mortality"
  | "carcasses"
  | "harmful-attack"
  | "live-prey-capture"
  | "live-prey-consumption"
  | "fishing"
  | "nesting"
  | "reproduction"
  | "ecological-cross-region-migration"
  | "full-circadian-life"
  | "general-scent-sound-evidence"
  | "worldwide-ecology"
  | "wave-d-settlement-animals"
  | "full-wave-c"
  | "full-directive-04-1";

export const ALPHA22_TIDAL_CONVERGENCE_EXCLUDED_CLAIMS = [
  "mortality",
  "carcasses",
  "harmful-attack",
  "live-prey-capture",
  "live-prey-consumption",
  "fishing",
  "nesting",
  "reproduction",
  "ecological-cross-region-migration",
  "full-circadian-life",
  "general-scent-sound-evidence",
  "worldwide-ecology",
  "wave-d-settlement-animals",
  "full-wave-c",
  "full-directive-04-1",
] as const satisfies readonly Alpha22TidalConvergenceExcludedClaim[];

export interface Alpha22TidalConvergenceSourceCandidateReadinessReport {
  readonly version: typeof ALPHA22_TIDAL_CONVERGENCE_SOURCE_CANDIDATE_VERSION;
  readonly unitId: "alpha22-tidal-convergence";
  readonly scope: "bounded-starting-harbor-wave-c-integration";
  readonly speciesIds: readonly Alpha22TidalConvergenceSpecies[];
  readonly evidenceAuthenticated: boolean;
  readonly historicalSliceEvidenceReady: boolean;
  readonly registryCoherenceReady: boolean;
  readonly reusableActivityArchetypesReady: boolean;
  readonly capabilityDrivenSurfaceObservationReady: boolean;
  readonly representativeEmergenceReady: boolean;
  readonly boundedAbstractionFuzzReady: boolean;
  readonly performanceEvidenceReady: boolean;
  readonly resourceConservationReady: boolean;
  readonly excludedClaimIntegrityReady: boolean;
  readonly sourceCandidateReady: boolean;
  readonly blockingCapabilities: readonly Alpha22TidalConvergenceSourceCapability[];
  readonly evidenceOwnerIds: readonly string[];
  /** Source readiness cannot authenticate copy, deployment, or a live build. */
  readonly publicationRecordsReady: false;
  readonly exactTestedDeploymentVerified: false;
  readonly liveVerified: false;
  readonly published: false;
  readonly fullThirtyCriterionReady: false;
  readonly fullWaveCReady: false;
  readonly fullDirective041Ready: false;
  readonly excludedClaims: readonly Alpha22TidalConvergenceExcludedClaim[];
}

export const ALPHA24_DOMESTIC_CHICKEN_SPECIES = [
  "domestic-chicken",
] as const satisfies readonly LivingActorSpecies[];

export type Alpha24DomesticChickenSpecies =
  (typeof ALPHA24_DOMESTIC_CHICKEN_SPECIES)[number];

export type Alpha24DomesticChickenBoundedCapability =
  | "species-profile"
  | "individual-flock-representation"
  | "domestic-custody"
  | "habitat-placement"
  | "bounded-activity"
  | "terrestrial-locomotion"
  | "lawful-perception"
  | "flock-coordination"
  | "broad-class-interactions"
  | "physical-food-conservation"
  | "save-migration"
  | "knowledge-honest-presentation"
  | "bounded-local-continuity"
  | "shared-invariant-coverage"
  | "performance-budget"
  | "owner-coherence"
  | "excluded-claim-integrity";

export type Alpha24DomesticChickenExcludedClaim =
  | "sound"
  | "environmental-evidence"
  | "harmful-attack"
  | "injury"
  | "mortality"
  | "carcasses"
  | "live-prey-capture"
  | "live-prey-consumption"
  | "eggs"
  | "nesting"
  | "reproduction"
  | "herding-behavior"
  | "guardian-behavior"
  | "full-circadian-schedules"
  | "autonomous-home-return"
  | "ecological-cross-region-migration"
  | "worldwide-livestock"
  | "full-wave-d"
  | "full-directive-04-1";

export const ALPHA24_DOMESTIC_CHICKEN_EXCLUDED_CLAIMS = [
  "sound",
  "environmental-evidence",
  "harmful-attack",
  "injury",
  "mortality",
  "carcasses",
  "live-prey-capture",
  "live-prey-consumption",
  "eggs",
  "nesting",
  "reproduction",
  "herding-behavior",
  "guardian-behavior",
  "full-circadian-schedules",
  "autonomous-home-return",
  "ecological-cross-region-migration",
  "worldwide-livestock",
  "full-wave-d",
  "full-directive-04-1",
] as const satisfies readonly Alpha24DomesticChickenExcludedClaim[];

export interface Alpha24DomesticChickenBoundedReadinessReport {
  readonly version: typeof ALPHA24_DOMESTIC_CHICKEN_BOUNDED_READINESS_VERSION;
  readonly unitId: "alpha24-domestic-chicken";
  readonly scope: "one-bounded-settlement-flock";
  readonly speciesIds: readonly Alpha24DomesticChickenSpecies[];
  readonly evidenceAuthenticated: boolean;
  readonly speciesProfileReady: boolean;
  readonly individualFlockRepresentationReady: boolean;
  readonly domesticCustodyReady: boolean;
  readonly habitatPlacementReady: boolean;
  readonly boundedActivityReady: boolean;
  readonly terrestrialLocomotionReady: boolean;
  readonly lawfulPerceptionReady: boolean;
  readonly flockCoordinationReady: boolean;
  readonly broadClassInteractionsReady: boolean;
  readonly physicalFoodConservationReady: boolean;
  readonly saveMigrationReady: boolean;
  readonly knowledgeHonestPresentationReady: boolean;
  readonly boundedLocalContinuityReady: boolean;
  readonly sharedInvariantCoverageReady: boolean;
  readonly performanceEvidenceReady: boolean;
  readonly ownerCoherenceReady: boolean;
  readonly excludedClaimIntegrityReady: boolean;
  readonly boundedCandidateReady: boolean;
  readonly blockingCapabilities: readonly Alpha24DomesticChickenBoundedCapability[];
  readonly evidenceOwnerIds: readonly string[];
  readonly publicationRecordsReady: boolean;
  readonly exactTestedDeploymentVerified: boolean;
  readonly published: boolean;
  readonly fullThirtyCriterionReady: boolean;
  /** Claims this bounded domestic flock can never authorize. */
  readonly excludedClaims: readonly Alpha24DomesticChickenExcludedClaim[];
}

export const ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES = [
  "domestic-chicken",
  "domestic-goat",
] as const satisfies readonly LivingActorSpecies[];

export type Alpha25SharedDomesticLivestockSpecies =
  (typeof ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES)[number];

export type Alpha25SharedDomesticLivestockCapability =
  | "historical-chicken-baseline"
  | "species-profiles"
  | "exact-bounded-population"
  | "plural-custody-and-homes"
  | "habitat-separation"
  | "shared-actor-abstractions"
  | "broad-class-interactions"
  | "physical-resource-boundary"
  | "persistence-and-presentation"
  | "shared-invariant-coverage"
  | "performance-budget"
  | "excluded-claim-integrity";

export type Alpha25SharedDomesticLivestockExcludedClaim =
  | "sound"
  | "environmental-evidence"
  | "harmful-attack"
  | "injury"
  | "mortality"
  | "carcasses"
  | "live-prey-capture"
  | "live-prey-consumption"
  | "goat-store-food-use"
  | "living-foliage-browsing"
  | "eggs"
  | "milk"
  | "wool"
  | "shearing"
  | "nesting"
  | "reproduction"
  | "herding-behavior"
  | "guardian-behavior"
  | "full-circadian-schedules"
  | "autonomous-home-return"
  | "ecological-cross-region-migration"
  | "worldwide-livestock"
  | "full-wave-d"
  | "full-directive-04-1";

export const ALPHA25_SHARED_DOMESTIC_LIVESTOCK_EXCLUDED_CLAIMS = [
  "sound",
  "environmental-evidence",
  "harmful-attack",
  "injury",
  "mortality",
  "carcasses",
  "live-prey-capture",
  "live-prey-consumption",
  "goat-store-food-use",
  "living-foliage-browsing",
  "eggs",
  "milk",
  "wool",
  "shearing",
  "nesting",
  "reproduction",
  "herding-behavior",
  "guardian-behavior",
  "full-circadian-schedules",
  "autonomous-home-return",
  "ecological-cross-region-migration",
  "worldwide-livestock",
  "full-wave-d",
  "full-directive-04-1",
] as const satisfies readonly Alpha25SharedDomesticLivestockExcludedClaim[];

export interface Alpha25SharedDomesticLivestockReadinessReport {
  readonly version: typeof ALPHA25_SHARED_DOMESTIC_LIVESTOCK_READINESS_VERSION;
  readonly unitId: "alpha25-shared-domestic-livestock";
  readonly scope: "bounded-settlement-flock-and-herd";
  readonly speciesIds: readonly Alpha25SharedDomesticLivestockSpecies[];
  readonly evidenceAuthenticated: boolean;
  readonly historicalChickenBaselineReady: boolean;
  readonly speciesProfilesReady: boolean;
  readonly exactBoundedPopulationReady: boolean;
  readonly pluralCustodyAndHomesReady: boolean;
  readonly habitatSeparationReady: boolean;
  readonly sharedActorAbstractionsReady: boolean;
  readonly broadClassInteractionsReady: boolean;
  readonly physicalResourceBoundaryReady: boolean;
  readonly persistenceAndPresentationReady: boolean;
  readonly sharedInvariantCoverageReady: boolean;
  readonly performanceEvidenceReady: boolean;
  readonly excludedClaimIntegrityReady: boolean;
  readonly boundedCandidateReady: boolean;
  readonly blockingCapabilities: readonly Alpha25SharedDomesticLivestockCapability[];
  readonly evidenceOwnerIds: readonly string[];
  /** Source readiness cannot authenticate public copy or a deployed artifact. */
  readonly publicationRecordsReady: false;
  readonly exactTestedDeploymentVerified: false;
  readonly liveVerified: false;
  readonly published: false;
  readonly fullThirtyCriterionReady: false;
  readonly fullWaveDReady: false;
  readonly fullDirective041Ready: false;
  readonly excludedClaims: readonly Alpha25SharedDomesticLivestockExcludedClaim[];
}

/** The seven deliberately bounded small-world roles shipped across Wave B. */
export const WAVE_B_BOUNDED_STARTING_HARBOR_SPECIES = [
  "brown-rat",
  "domestic-cat",
  "marsh-rabbit",
  "marsh-fox",
  "fish-crow",
  "northern-harrier",
  "southern-leopard-frog",
] as const satisfies readonly LivingActorSpecies[];

export type WaveBBoundedStartingHarborSpecies =
  (typeof WAVE_B_BOUNDED_STARTING_HARBOR_SPECIES)[number];
export type WaveBBoundedRole =
  | "rodent"
  | "cat"
  | "rabbit-hare"
  | "small-opportunist"
  | "corvid"
  | "raptor"
  | "amphibian";
export type WaveBBoundedRepresentation = "individual" | "group" | "aggregate";
export type WaveBBoundedContinuity =
  | "individual-full-coarse"
  | "group-full-coarse"
  | "aggregate-authoritative";
export type WaveBBoundedExcludedClaim =
  | "worldwide-ecology"
  | "wildlife-promotion"
  | "cross-region-migration"
  | "full-thirty-criterion-readiness"
  | "directive-completion";

export interface WaveBBoundedRoleReadiness {
  readonly role: WaveBBoundedRole;
  readonly speciesId: WaveBBoundedStartingHarborSpecies;
  readonly representation: WaveBBoundedRepresentation;
  readonly continuity: WaveBBoundedContinuity;
  /** The species gate is an exact match for this build's evidence. */
  readonly evidenceAuthenticated: boolean;
  /** Catalog representation agrees with the role's declared authority model. */
  readonly representationAuthenticated: boolean;
  /** Every broad target is explicitly supported or intentionally neutral. */
  readonly interactionContractAuthenticated: boolean;
  /** Required materialization, save, and signed-seam evidence is present. */
  readonly continuityAuthenticated: boolean;
  readonly ready: boolean;
  readonly evidenceOwnerIds: readonly string[];
}

export interface WaveBBoundedStartingHarborReadinessReport {
  readonly version: typeof WAVE_B_BOUNDED_STARTING_HARBOR_READINESS_VERSION;
  readonly unitId: "wave-b-small-world";
  readonly scope: "bounded-starting-harbor";
  readonly speciesIds: readonly WaveBBoundedStartingHarborSpecies[];
  readonly roles: readonly WaveBBoundedRoleReadiness[];
  readonly evidenceAuthenticated: boolean;
  readonly roleCoverageReady: boolean;
  readonly broadInteractionCoverageReady: boolean;
  readonly boundedCandidateReady: boolean;
  readonly blockingRoles: readonly WaveBBoundedRole[];
  /** Full per-species release readiness remains independently fail-closed. */
  readonly fullThirtyCriterionReady: boolean;
  /** These claims are deliberately outside this bounded report's authority. */
  readonly excludedClaims: readonly WaveBBoundedExcludedClaim[];
}

interface WaveBBoundedRoleDefinition {
  readonly role: WaveBBoundedRole;
  readonly speciesId: WaveBBoundedStartingHarborSpecies;
  readonly representation: WaveBBoundedRepresentation;
  readonly continuity: WaveBBoundedContinuity;
}

const WAVE_B_BOUNDED_ROLE_DEFINITIONS: readonly WaveBBoundedRoleDefinition[] = [
  {
    role: "rodent",
    speciesId: "brown-rat",
    representation: "aggregate",
    continuity: "aggregate-authoritative",
  },
  {
    role: "cat",
    speciesId: "domestic-cat",
    representation: "individual",
    continuity: "individual-full-coarse",
  },
  {
    role: "rabbit-hare",
    speciesId: "marsh-rabbit",
    representation: "individual",
    continuity: "individual-full-coarse",
  },
  {
    role: "small-opportunist",
    speciesId: "marsh-fox",
    representation: "individual",
    continuity: "individual-full-coarse",
  },
  {
    role: "corvid",
    speciesId: "fish-crow",
    representation: "group",
    continuity: "group-full-coarse",
  },
  {
    role: "raptor",
    speciesId: "northern-harrier",
    representation: "individual",
    continuity: "individual-full-coarse",
  },
  {
    role: "amphibian",
    speciesId: "southern-leopard-frog",
    representation: "aggregate",
    continuity: "aggregate-authoritative",
  },
] as const;

export const WAVE_B_BOUNDED_EXCLUDED_CLAIMS = [
  "worldwide-ecology",
  "wildlife-promotion",
  "cross-region-migration",
  "full-thirty-criterion-readiness",
  "directive-completion",
] as const satisfies readonly WaveBBoundedExcludedClaim[];

/**
 * Technical claims owned by the bounded Alpha-16 rabbit/fox implementation.
 * Deferred universal systems and release records remain visible in the full
 * 30-criterion gate and cannot be laundered through this smaller result.
 */
export const ALPHA16_MARSH_EDGE_BOUNDED_CRITERIA = [
  "species-profile",
  "ecological-niche",
  "appearance",
  "sound",
  "habitat-placement",
  "locomotion",
  "human-interaction",
  "dog-interaction",
  "other-species-interaction",
  "neutral-behavior",
  "disengagement",
  "environmental-evidence",
  "about-disclosure",
  "knowledge-honesty",
  "population-materialization",
  "full-coarse-transition",
  "save-load",
  "seamless-region-crossing",
  "performance-budget",
  "accessibility",
  "mobile-parity",
  "player-independent-scenario",
  "fuzz-testing",
  "clone-diversity",
] as const satisfies readonly LivingSpeciesReleaseCriterion[];

export interface Alpha16MarshEdgeBoundedReadinessReport {
  readonly version: typeof ALPHA16_MARSH_EDGE_BOUNDED_READINESS_VERSION;
  readonly unitId: "alpha16-marsh-edge";
  readonly speciesIds: readonly Alpha16MarshEdgeSpecies[];
  readonly boundedCriteria: readonly LivingSpeciesReleaseCriterion[];
  /** Exact match against the build-owned rabbit/fox evidence rows. */
  readonly evidenceAuthenticated: boolean;
  /**
   * The bounded implementation candidate is internally ready. This is not a
   * claim that public copy is written, a deployment exists, or the broader
   * biodiversity roster is complete.
   */
  readonly boundedCandidateReady: boolean;
  readonly blockingBoundedCriteria: readonly LivingSpeciesReleaseCriterion[];
  /** Tutorial and patch-note evidence for this publication unit. */
  readonly publicationRecordsReady: boolean;
  /** May become true only after the exact tested build is verified live. */
  readonly exactTestedDeploymentVerified: boolean;
  readonly published: boolean;
  /** Both species have all 30 criteria active/N-A; not the whole biodiversity program. */
  readonly fullThirtyCriterionReady: boolean;
  readonly fullGateBlockingCriteria: readonly LivingSpeciesReleaseCriterion[];
}

/**
 * Technical boundary for Rain Chorus / Shadow Overhead. Deferred mortality,
 * carcasses, exhaustive species-pair matrices, and live-build attestation are
 * intentionally outside this result.
 */
export const ALPHA17_RAIN_CHORUS_BOUNDED_CRITERIA = [
  "species-profile",
  "ecological-niche",
  "appearance",
  "sound",
  "habitat-placement",
  "locomotion",
  "human-interaction",
  "dog-interaction",
  "other-species-interaction",
  "neutral-behavior",
  "disengagement",
  "about-disclosure",
  "knowledge-honesty",
  "population-materialization",
  "full-coarse-transition",
  "save-load",
  "seamless-region-crossing",
  "performance-budget",
  "accessibility",
  "mobile-parity",
  "player-independent-scenario",
  "fuzz-testing",
  "clone-diversity",
] as const satisfies readonly LivingSpeciesReleaseCriterion[];

export interface Alpha17RainChorusBoundedReadinessReport {
  readonly version: typeof ALPHA17_RAIN_CHORUS_BOUNDED_READINESS_VERSION;
  readonly unitId: "alpha17-rain-chorus";
  readonly speciesIds: readonly Alpha17RainChorusSpecies[];
  readonly boundedCriteria: readonly LivingSpeciesReleaseCriterion[];
  readonly evidenceAuthenticated: boolean;
  readonly boundedCandidateReady: boolean;
  readonly blockingBoundedCriteria: readonly LivingSpeciesReleaseCriterion[];
  readonly publicationRecordsReady: boolean;
  readonly exactTestedDeploymentVerified: boolean;
  readonly published: boolean;
  readonly fullThirtyCriterionReady: boolean;
  readonly fullGateBlockingCriteria: readonly LivingSpeciesReleaseCriterion[];
}

const STATUS = new Set<string>(["active", "foundation", "unimplemented", "not-applicable"]);
const ID_PATTERN = /^[a-z][a-z0-9]*(?:(?:[._/-]|::?)[a-z0-9]+)*$/u;
const NOT_APPLICABLE_REASONS: Readonly<
  Partial<Record<LivingSpeciesReleaseCriterion, readonly LivingSpeciesNotApplicableReason[]>>
> = Object.freeze({
  sound: Object.freeze(["biologically-silent"] as const),
  "human-interaction": Object.freeze(["no-human-ecological-overlap"] as const),
  "dog-interaction": Object.freeze(["no-dog-ecological-overlap"] as const),
});

type ClaimTuple = readonly [
  LivingSpeciesReleaseCriterion,
  LivingSpeciesReleaseStatus,
  readonly string[],
];

const U = "unimplemented" as const;
const F = "foundation" as const;
const A = "active" as const;

function waveACoreWildlifeEvidence(
  species: "deer" | "gull" | "black-bear",
): readonly ClaimTuple[] {
  const socialGroup = species !== "black-bear";
  const transitionEvidence = socialGroup
    ? [
        "game:core-ecology-groups:v1",
        "game:core-ecology:v2",
        "game:runtime-core-ecology:v1",
      ]
    : ["game:core-ecology:v2", "game:runtime-core-ecology:v1"];
  return [
    ["species-profile", A, ["game:living-species-catalog:v1", "sim:core-wildlife-identity:v1"]],
    ["ecological-niche", F, ["game:core-ecology-habitat:v1", "game:core-wildlife-actor:v1", "sim:core-wildlife-identity:v1"]],
    ["appearance", A, ["game:wildlife-presentation:v1", "sim:core-wildlife-identity:v1"]],
    ["sound", U, []],
    ["habitat-placement", A, ["game:core-ecology-habitat:v1", "game:runtime-core-ecology:v1"]],
    ["food-web", F, ["game:core-wildlife-actor:v1", "sim:core-wildlife-identity:v1"]],
    ["perception-senses", F, ["game:core-ecology-perception:v1", "game:living-actor-senses:v1", "sim:actor-perception:v2"]],
    ["locomotion", F, ["game:core-wildlife-actor:v1", "game:runtime-core-ecology:v1"]],
    ["human-interaction", A, ["game:core-ecology-perception:v1", "game:core-wildlife-actor:v1"]],
    ["dog-interaction", A, ["game:core-ecology-perception:v1", "game:core-wildlife-actor:v1"]],
    ["same-species-interaction", socialGroup ? A : U, socialGroup ? ["game:core-ecology-groups:v1"] : []],
    ["other-species-interaction", A, ["game:core-ecology-perception:v1", "game:core-wildlife-actor:v1"]],
    ["neutral-behavior", A, ["game:core-wildlife-actor:v1"]],
    ["disengagement", A, ["game:core-wildlife-actor:v1"]],
    ["environmental-evidence", U, []],
    ["about-disclosure", A, ["game:wildlife-about:v1"]],
    ["knowledge-honesty", A, ["game:core-ecology-perception:v1", "game:wildlife-about:v1", "sim:actor-perception:v2"]],
    ["population-materialization", A, ["game:core-ecology-habitat:v1", "game:core-ecology:v2", "game:runtime-core-ecology:v1"]],
    ["full-coarse-transition", A, transitionEvidence],
    ["save-load", A, ["game:core-ecology:v2", "game:runtime-save:v9"]],
    ["seamless-region-crossing", F, ["game:living-actor-address:v1", "game:world-position:v1"]],
    ["performance-budget", F, ["game:core-ecology-habitat:v1", "game:core-ecology:v2", "game:runtime-core-ecology:v1"]],
    ["accessibility", A, ["game:wildlife-about:v1", "game:wildlife-presentation:v1"]],
    ["mobile-parity", A, ["game:wildlife-about:v1", "game:wildlife-presentation:v1"]],
    ["player-independent-scenario", socialGroup ? A : U, socialGroup
      ? ["game:core-ecology-groups:v1", "game:core-ecology:v2"]
      : []],
    ["fuzz-testing", U, []],
    ["clone-diversity", A, ["sim:core-wildlife-identity:v1"]],
    ["tutorial-truth", A, ["ui:tutorial-guide:v24"]],
    ["patch-note-truth", A, ["content:patch-notes-alpha14:v1"]],
    // Exact deployment evidence is external and can exist only after this
    // immutable Alpha-14 candidate is live; Alpha-13 cannot attest this slice.
    ["exact-tested-deployment", U, []],
  ];
}

/**
 * Truthful evidence for the bounded Settlement Shadows slice. Health,
 * mortality, carcasses, full food-web turnover, broad multisensory behavior,
 * and release publication remain deliberately open; shared invariants and a
 * representative generated audit stand in for a quadratic pair matrix.
 */
function settlementShadowsEvidence(
  species: "brown-rat" | "domestic-cat",
): readonly ClaimTuple[] {
  const rat = species === "brown-rat";
  const owners = (...values: string[]): readonly string[] => values.sort(compareText);
  return [
    ["species-profile", A, owners(
      ...(rat ? ["game:core-ecology:v3"] : []),
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["ecological-niche", A, owners(
      "game:core-ecology-aggregate-perception:v1",
      "game:core-ecology-habitat:v2",
      "game:core-ecology-small-world:v2",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["appearance", A, owners(
      ...(rat ? ["game:core-ecology-evidence-runtime:v1"] : []),
      "game:wildlife-presentation:v1",
      ...(!rat ? ["sim:core-wildlife-identity:v1"] : []),
    )],
    ["sound", A, owners("audio:soundscape:v1", "game:runtime-core-ecology:v1")],
    ["habitat-placement", A, owners(
      "game:core-ecology-habitat:v2",
      "game:runtime-core-ecology:v1",
    )],
    ["food-web", F, ["game:living-species-catalog:v1", "sim:core-wildlife-identity:v1"]],
    ["perception-senses", F, owners(
      ...(rat
        ? ["game:core-ecology-aggregate-perception:v1", "game:core-ecology-small-world:v2"]
        : ["game:core-ecology-perception:v1"]),
      "game:living-actor-senses:v1",
      "sim:actor-perception:v2",
    )],
    ["locomotion", A, owners(
      rat ? "game:core-ecology-small-world:v2" : "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["human-interaction", A, owners(
      ...(rat
        ? ["game:core-ecology-aggregate-perception:v1", "game:core-ecology-small-world:v2"]
        : ["game:core-ecology-perception:v1"]),
      ...(!rat ? ["game:core-wildlife-actor:v1"] : []),
      "game:runtime-core-ecology:v1",
    )],
    ["dog-interaction", A, owners(
      ...(rat
        ? ["game:core-ecology-aggregate-perception:v1", "game:core-ecology-small-world:v2"]
        : ["game:core-ecology-perception:v1"]),
      ...(!rat ? ["game:core-wildlife-actor:v1"] : []),
      "game:runtime-core-ecology:v1",
    )],
    // Rat density spacing and directly observed cat food competition are one
    // representative same-species outcome per representation, not a claim of
    // exhaustive social simulation.
    ["same-species-interaction", A, rat
      ? owners("game:core-ecology-small-world:v2")
      : owners(
          "game:core-ecology-perception:v1",
          "game:core-wildlife-actor:v1",
        )],
    ["other-species-interaction", A, owners(
      ...(rat
        ? ["game:core-ecology-aggregate-perception:v1", "game:core-ecology-small-world:v2"]
        : [
            "game:core-ecology-aggregate-perception:v1",
            "game:core-ecology-perception:v1",
            "game:core-ecology-small-world:v2",
            "game:core-wildlife-actor:v1",
          ]),
      "game:runtime-core-ecology:v1",
    )],
    ["neutral-behavior", A, owners(
      rat ? "game:core-ecology-small-world:v2" : "game:core-wildlife-actor:v1",
    )],
    ["disengagement", A, owners(
      ...(rat
        ? ["game:core-ecology-aggregate-perception:v1", "game:core-ecology-small-world:v2"]
        : ["game:core-wildlife-actor:v1"]),
      "game:runtime-core-ecology:v1",
    )],
    ["environmental-evidence", A, rat
      ? owners(
          "game:core-ecology-evidence-runtime:v1",
          "game:core-ecology:v3",
          "game:wildlife-about:v1",
          "game:wildlife-presentation:v1",
        )
      : owners(
          "game:core-ecology-evidence-runtime:v1",
          "game:core-wildlife-actor:v1",
          "game:wildlife-presentation:v1",
        )],
    ["about-disclosure", A, owners(
      ...(rat ? ["game:core-ecology-evidence-runtime:v1"] : []),
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["knowledge-honesty", A, owners(
      ...(rat
        ? ["game:core-ecology-aggregate-perception:v1", "game:core-ecology-evidence-runtime:v1"]
        : ["game:core-ecology-perception:v1"]),
      "game:wildlife-about:v1",
      "sim:actor-perception:v2",
    )],
    ["population-materialization", A, owners(
      "game:core-ecology-habitat:v2",
      "game:core-ecology:v3",
      "game:runtime-core-ecology:v1",
    )],
    // The rat population stays authoritative at aggregate resolution; direct
    // signs are a view projection rather than a fabricated full actor mode.
    ["full-coarse-transition", rat ? F : A, owners(
      "game:core-ecology:v3",
      ...(rat ? ["game:core-ecology-evidence-runtime:v1"] : []),
      "game:runtime-core-ecology:v1",
    )],
    ["save-load", A, owners("game:core-ecology:v3", "game:runtime-save:v10")],
    ["seamless-region-crossing", rat ? F : A, owners(
      ...(rat ? ["game:core-ecology:v3"] : ["game:runtime-core-ecology:v1"]),
      "game:world-position:v1",
    )],
    ["performance-budget", A, owners(
      "game:core-ecology-aggregate-perception:v1",
      "game:core-ecology-habitat:v2",
      "game:core-ecology:v3",
      "game:runtime-core-ecology:v1",
      "test:core-ecology-settlement-shadows-performance:v1",
    )],
    ["accessibility", A, owners(
      "game:runtime-core-ecology:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["mobile-parity", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "test:core-ecology-settlement-shadows-mobile:v1",
    )],
    ["player-independent-scenario", A, owners(
      "game:core-ecology-aggregate-perception:v1",
      "game:core-ecology-small-world:v2",
      "game:core-ecology:v3",
    )],
    ["fuzz-testing", A, owners(
      "game:core-ecology-aggregate-perception:v1",
      "game:core-ecology-habitat:v2",
      "game:core-ecology-small-world:v2",
      "game:core-ecology:v3",
      "sim:core-wildlife-identity:v1",
    )],
    ["clone-diversity", A, owners(
      ...(rat ? ["game:core-ecology:v3"] : []),
      "sim:core-wildlife-identity:v1",
    )],
    ["tutorial-truth", A, ["ui:tutorial-guide:v25"]],
    ["patch-note-truth", A, ["content:patch-notes-alpha15:v1"]],
    ["exact-tested-deployment", U, []],
  ];
}

/**
 * Build-owned evidence for the bounded Alpha-16 marsh-edge publication unit.
 * A generic role resolver and one representative rabbit/fox/dog scenario
 * stand in for a quadratic interaction matrix. Food-web turnover and the
 * broader multisensory model remain foundations; same-species social behavior
 * and exact deployment remain openly unimplemented.
 * Mortality, carcasses, living-cover response, and circadian schedules stay
 * explicit omissions in the species catalog and are audited in focused tests.
 */
function marshEdgeEvidence(
  _species: Alpha16MarshEdgeSpecies,
): readonly ClaimTuple[] {
  const owners = (...values: string[]): readonly string[] => values.sort(compareText);
  return [
    ["species-profile", A, owners(
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["ecological-niche", A, owners(
      "game:core-ecology-habitat:v3",
      "game:core-ecology-trophic:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["appearance", A, owners(
      "game:wildlife-presentation:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["sound", A, owners(
      "audio:soundscape:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["habitat-placement", A, owners(
      "game:core-ecology-habitat:v3",
      "game:runtime-core-ecology:v1",
    )],
    ["food-web", F, owners(
      "game:core-ecology-trophic:v1",
      "game:core-wildlife-actor:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["perception-senses", F, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-trophic:v1",
      "game:living-actor-senses:v1",
      "sim:actor-perception:v2",
    )],
    ["locomotion", A, owners(
      "game:core-wildlife-actor:v1",
      "game:core-wildlife-locomotion-profile:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["human-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["dog-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-trophic:v1",
      "game:core-wildlife-actor:v1",
    )],
    ["same-species-interaction", U, []],
    ["other-species-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-trophic:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["neutral-behavior", A, ["game:core-wildlife-actor:v1"]],
    ["disengagement", A, ["game:core-wildlife-actor:v1"]],
    ["environmental-evidence", A, owners(
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
      "game:wildlife-presentation:v1",
    )],
    ["about-disclosure", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["knowledge-honesty", A, owners(
      "game:core-ecology-perception:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "sim:actor-perception:v2",
    )],
    ["population-materialization", A, owners(
      "game:core-ecology-habitat:v3",
      "game:core-ecology:v3",
      "game:runtime-core-ecology:v1",
    )],
    ["full-coarse-transition", A, owners(
      "game:core-ecology:v3",
      "game:runtime-core-ecology:v1",
    )],
    ["save-load", A, owners(
      "game:core-ecology:v3",
      "game:runtime-save:v11",
    )],
    ["seamless-region-crossing", A, owners(
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
      "game:world-position:v1",
    )],
    ["performance-budget", A, owners(
      "game:core-ecology-habitat:v3",
      "game:core-ecology:v3",
      "game:runtime-core-ecology:v1",
      "test:core-ecology-marsh-edge-performance:v1",
    )],
    ["accessibility", A, owners(
      "audio:soundscape:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["mobile-parity", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "test:core-ecology-marsh-edge-mobile:v1",
    )],
    ["player-independent-scenario", A, owners(
      "game:core-ecology-trophic:v1",
      "game:core-wildlife-actor:v1",
    )],
    ["fuzz-testing", A, owners(
      "game:core-ecology-habitat:v3",
      "game:core-ecology:v3",
      "sim:core-wildlife-identity:v1",
      "test:core-ecology-marsh-edge-fuzz:v1",
    )],
    ["clone-diversity", A, ["sim:core-wildlife-identity:v1"]],
    ["tutorial-truth", A, ["ui:tutorial-guide:v26"]],
    ["patch-note-truth", A, ["content:patch-notes-alpha16:v1"]],
    ["exact-tested-deployment", U, []],
  ];
}

/**
 * Build-owned evidence for Rain Chorus / Shadow Overhead. Shared policy and
 * representative interaction owners replace a quadratic species-pair table.
 * Mortality, carcasses, and fabricated in-flight tracks remain absent.
 */
function rainChorusEvidence(
  species: Alpha17RainChorusSpecies,
): readonly ClaimTuple[] {
  const crow = species === "fish-crow";
  const harrier = species === "northern-harrier";
  const frog = species === "southern-leopard-frog";
  const behaviorOwner = frog
    ? "game:core-ecology-small-world:v3"
    : "game:core-wildlife-actor:v1";
  const owners = (...values: string[]): readonly string[] => values.sort(compareText);
  return [
    ["species-profile", A, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["ecological-niche", A, owners(
      "game:core-ecology-habitat:v4",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["appearance", A, owners(
      ...(frog ? ["game:core-ecology:v4"] : ["sim:core-wildlife-identity:v1"]),
      "game:wildlife-presentation:v1",
    )],
    ["sound", harrier ? U : A, harrier
      ? []
      : owners("audio:soundscape:v1", "game:runtime-core-ecology:v1")],
    ["habitat-placement", A, owners(
      "game:core-ecology-habitat:v4",
      "game:runtime-core-ecology:v1",
    )],
    ["food-web", F, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["perception-senses", F, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:living-actor-senses:v1",
      "sim:actor-perception:v2",
    )],
    ["locomotion", A, owners(
      behaviorOwner,
      ...(frog ? [] : [
        "game:core-ecology-activity:v1",
        "game:core-wildlife-locomotion-profile:v1",
      ]),
      "game:core-ecology-species-runtime-policy:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["human-interaction", A, owners(
      behaviorOwner,
      "game:core-ecology-perception:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["dog-interaction", A, owners(
      behaviorOwner,
      "game:core-ecology-perception:v1",
      "game:core-ecology-trophic:v1",
    )],
    ["same-species-interaction", harrier ? U : A, harrier ? [] : owners(
      crow ? "game:core-ecology-groups:v1" : "game:core-ecology-small-world:v3",
    )],
    ["other-species-interaction", A, owners(
      behaviorOwner,
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["neutral-behavior", A, owners(
      behaviorOwner,
      ...(frog ? [] : ["game:core-ecology-activity:v1"]),
    )],
    ["disengagement", A, [behaviorOwner]],
    ["environmental-evidence", frog ? A : U, frog ? owners(
      "game:core-ecology-evidence-runtime:v1",
      "game:core-ecology:v4",
      "game:wildlife-presentation:v1",
    ) : []],
    ["about-disclosure", A, owners(
      ...(frog ? ["game:core-ecology-evidence-runtime:v1"] : []),
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["knowledge-honesty", A, owners(
      "game:core-ecology-perception:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "sim:actor-perception:v2",
    )],
    ["population-materialization", A, owners(
      "game:core-ecology-habitat:v4",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
    )],
    ["full-coarse-transition", A, owners(
      ...(crow ? ["game:core-ecology-groups:v1"] : []),
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
    )],
    ["save-load", A, owners("game:core-ecology:v4", "game:runtime-save:v12")],
    ["seamless-region-crossing", A, owners(
      ...(frog ? ["game:core-ecology:v4"] : ["game:living-actor-address:v1"]),
      "game:runtime-core-ecology:v1",
      "game:world-position:v1",
    )],
    ["performance-budget", A, owners(
      "game:core-ecology-habitat:v4",
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
      "test:core-ecology-rain-chorus-performance:v1",
    )],
    ["accessibility", A, owners(
      ...(!harrier ? ["audio:soundscape:v1"] : []),
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["mobile-parity", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "test:core-ecology-rain-chorus-mobile:v1",
    )],
    ["player-independent-scenario", A, owners(
      behaviorOwner,
      ...(frog ? [] : ["game:core-ecology-activity:v1"]),
      ...(crow ? ["game:core-ecology-groups:v1"] : []),
      ...(frog ? [] : ["game:core-ecology-small-world:v3"]),
      "game:core-ecology-trophic:v1",
    )],
    ["fuzz-testing", A, owners(
      "game:core-ecology-habitat:v4",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology:v4",
      "sim:core-wildlife-identity:v1",
      "test:core-ecology-rain-chorus-fuzz:v1",
    )],
    ["clone-diversity", A, owners(
      ...(frog ? ["game:core-ecology:v4"] : []),
      "sim:core-wildlife-identity:v1",
    )],
    ["tutorial-truth", A, ["ui:tutorial-guide:v27"]],
    ["patch-note-truth", A, ["content:patch-notes-alpha17:v1"]],
    ["exact-tested-deployment", U, []],
  ];
}

/**
 * Build-owned evidence for the first bounded Wave-C unit. This records only
 * the conserved school/area, one wader, tide response, and nonlethal pressure
 * that exist now; mortality, harvest, fishing, and full Wave C remain absent.
 */
function tidalTableEvidence(
  species: WaveCTidalTableSpecies,
): readonly ClaimTuple[] {
  const aggregate = species !== "snowy-egret";
  const owners = (...values: string[]): readonly string[] => values.sort(compareText);
  const behaviorOwner = aggregate
    ? "game:core-ecology-small-world:v3"
    : "game:core-ecology-activity:v1";
  return [
    ["species-profile", A, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["ecological-niche", A, owners(
      "game:core-ecology-habitat:v5",
      "game:core-ecology-tidal-table:v1",
      "game:core-ecology-trophic:v1",
      "game:living-species-catalog:v1",
    )],
    ["appearance", A, owners(
      ...(aggregate ? ["game:core-ecology:v4"] : ["sim:core-wildlife-identity:v1"]),
      "game:wildlife-presentation:v1",
    )],
    ["sound", U, []],
    ["habitat-placement", A, owners(
      "game:core-ecology-habitat:v5",
      "game:core-ecology-tidal-table:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["food-web", F, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
    )],
    ["perception-senses", F, owners(
      ...(aggregate
        ? ["game:core-ecology-aggregate-perception:v1"]
        : ["game:core-ecology-perception:v1", "game:living-actor-senses:v1"]),
      "sim:actor-perception:v2",
    )],
    ["locomotion", A, owners(
      behaviorOwner,
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-tidal-table:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["human-interaction", F, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["dog-interaction", F, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
    )],
    ["same-species-interaction", aggregate ? A : U, aggregate
      ? ["game:core-ecology-small-world:v3"]
      : []],
    ["other-species-interaction", A, owners(
      "game:core-ecology-small-world:v3",
      "game:core-ecology-trophic:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["neutral-behavior", A, [behaviorOwner]],
    ["disengagement", aggregate ? F : A, [behaviorOwner]],
    ["environmental-evidence", aggregate ? A : U, aggregate
      ? owners(
          "game:core-ecology-evidence-runtime:v1",
          "game:core-ecology:v4",
          "game:wildlife-presentation:v1",
        )
      : []],
    ["about-disclosure", A, owners(
      "game:core-ecology-evidence-runtime:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["knowledge-honesty", A, owners(
      "game:core-ecology-perception:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "sim:actor-perception:v2",
    )],
    ["population-materialization", A, owners(
      "game:core-ecology-habitat:v5",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
    )],
    ["full-coarse-transition", A, owners(
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
    )],
    ["save-load", A, owners("game:core-ecology:v4", "game:runtime-save:v13")],
    // Neither Tide Table aggregate migrates between regions. Their foundation
    // evidence proves only conserved aggregate identity at signed frames. The
    // bounded egret is likewise local (`crossRegion: false`) and therefore
    // cannot claim this full release criterion at all.
    ["seamless-region-crossing", aggregate ? F : U, aggregate
      ? owners(
          "game:core-ecology:v4",
          "game:runtime-core-ecology:v1",
          "game:world-position:v1",
          "test:core-ecology-tidal-table-signed-frame-continuity:v1",
        )
      : []],
    ["performance-budget", A, owners(
      "game:core-ecology-habitat:v5",
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
      "test:core-ecology-tidal-table-performance:v1",
    )],
    ["accessibility", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["mobile-parity", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["player-independent-scenario", A, owners(
      behaviorOwner,
      "game:core-ecology-tidal-table:v1",
      "game:core-ecology-trophic:v1",
    )],
    ["fuzz-testing", F, owners(
      "game:core-ecology-habitat:v5",
      "game:core-ecology:v4",
    )],
    ["clone-diversity", A, owners(
      ...(aggregate ? ["game:core-ecology:v4"] : []),
      "sim:core-wildlife-identity:v1",
    )],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ];
}

/**
 * Build-owned evidence for Alpha-20's single American black duck. The active
 * rows describe the addressable actor, lawful perception, bounded tidal
 * activity, multimodal movement, and presentation that exist in this build.
 * Food-web turnover and broad fuzz coverage remain foundations; sound,
 * nesting, flock simulation, migration, mortality, and carcasses stay open.
 */
function americanBlackDuckEvidence(): readonly ClaimTuple[] {
  const owners = (...values: string[]): readonly string[] => values.sort(compareText);
  return [
    ["species-profile", A, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["ecological-niche", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-ecology-habitat:v6",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:living-species-catalog:v1",
    )],
    ["appearance", A, owners(
      "game:wildlife-presentation:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["sound", U, []],
    ["habitat-placement", A, owners(
      "game:core-ecology-habitat:v6",
      "game:core-ecology:v5",
      "game:runtime-core-ecology:v1",
    )],
    ["food-web", F, owners(
      "game:core-ecology-trophic:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["perception-senses", F, owners(
      "game:core-ecology-perception:v1",
      "game:living-actor-senses:v1",
      "sim:actor-perception:v2",
      "sim:core-wildlife-identity:v1",
    )],
    ["locomotion", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-wildlife-actor:v1",
      "game:core-wildlife-locomotion-profile:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["human-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["dog-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["same-species-interaction", U, []],
    ["other-species-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["neutral-behavior", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-wildlife-actor:v1",
    )],
    ["disengagement", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-wildlife-actor:v1",
    )],
    ["environmental-evidence", U, []],
    ["about-disclosure", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["knowledge-honesty", A, owners(
      "game:core-ecology-perception:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "sim:actor-perception:v2",
    )],
    ["population-materialization", A, owners(
      "game:core-ecology-habitat:v6",
      "game:core-ecology:v5",
      "game:runtime-core-ecology:v1",
    )],
    ["full-coarse-transition", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-ecology:v5",
      "game:runtime-core-ecology:v1",
    )],
    ["save-load", A, owners(
      "game:core-ecology:v5",
      "game:runtime-save:v14",
    )],
    // The actor is locally persistent and intentionally cannot make a
    // cross-region ecological migration claim in this bounded release.
    ["seamless-region-crossing", U, []],
    ["performance-budget", A, owners(
      "game:core-ecology-habitat:v6",
      "game:core-ecology:v5",
      "game:runtime-core-ecology:v1",
      "test:core-ecology-waterfowl-performance:v1",
    )],
    ["accessibility", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["mobile-parity", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "test:american-black-duck-presentation:v1",
    )],
    ["player-independent-scenario", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-ecology-habitat:v6",
      "game:core-ecology-perception:v1",
      "game:core-ecology-trophic:v1",
    )],
    ["fuzz-testing", F, owners(
      "game:core-ecology-habitat:v6",
      "game:core-ecology:v5",
    )],
    ["clone-diversity", A, ["sim:core-wildlife-identity:v1"]],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ];
}

/**
 * Build-owned evidence for Alpha-21's single North American river otter. The
 * active rows cover only its bounded shore-water habitat, shared amphibious
 * activity/locomotion, spatial top-K materialization, presentation, and save
 * adoption. Sensory declarations and food-web semantics remain foundations;
 * sound, physical evidence, mortality, capture, live-prey consumption,
 * reproduction, and ecological migration remain explicit absences.
 */
function riverOtterEvidence(): readonly ClaimTuple[] {
  const owners = (...values: string[]): readonly string[] => values.sort(compareText);
  return [
    ["species-profile", A, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["ecological-niche", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-ecology-habitat:v7",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:living-species-catalog:v1",
    )],
    ["appearance", A, owners(
      "game:wildlife-presentation:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["sound", U, []],
    ["habitat-placement", A, owners(
      "game:core-ecology-habitat:v7",
      "game:core-ecology:v6",
      "game:runtime-core-ecology:v1",
    )],
    ["food-web", F, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["perception-senses", F, owners(
      "game:core-ecology-perception:v1",
      "game:living-actor-senses:v1",
      "sim:actor-perception:v2",
      "sim:core-wildlife-identity:v1",
    )],
    ["locomotion", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-wildlife-actor:v1",
      "game:core-wildlife-locomotion-profile:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["human-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["dog-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["same-species-interaction", U, []],
    ["other-species-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["neutral-behavior", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-wildlife-actor:v1",
    )],
    ["disengagement", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-wildlife-actor:v1",
    )],
    ["environmental-evidence", U, []],
    ["about-disclosure", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["knowledge-honesty", A, owners(
      "game:core-ecology-perception:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "sim:actor-perception:v2",
    )],
    ["population-materialization", A, owners(
      "game:core-ecology-habitat:v7",
      "game:core-ecology:v6",
      "game:runtime-core-ecology:v1",
      "test:core-ecology-spatial-top-k:v1",
    )],
    ["full-coarse-transition", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-ecology:v6",
      "game:runtime-core-ecology:v1",
    )],
    ["save-load", A, owners(
      "game:core-ecology:v6",
      "game:runtime-save:v15",
      "test:alpha21-save-migration:v1",
    )],
    ["seamless-region-crossing", U, []],
    ["performance-budget", A, owners(
      "game:core-ecology-habitat:v7",
      "game:core-ecology:v6",
      "game:runtime-core-ecology:v1",
      "test:core-ecology-spatial-top-k:v1",
    )],
    ["accessibility", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["mobile-parity", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "test:alpha21-chart-relief-presentation:v1",
    )],
    ["player-independent-scenario", A, owners(
      "game:core-ecology-activity:v1",
      "game:core-ecology-habitat:v7",
      "game:core-ecology-perception:v1",
      "game:core-ecology-trophic:v1",
      "test:alpha21-shore-water-response:v1",
    )],
    ["fuzz-testing", F, owners(
      "game:core-ecology-habitat:v7",
      "game:core-ecology:v6",
    )],
    ["clone-diversity", A, ["sim:core-wildlife-identity:v1"]],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ];
}

interface DomesticLivestockEvidenceConfiguration {
  readonly habitatOwnerId: string;
  readonly settlementOwnerId: string;
  readonly saveOwnerId: string;
  readonly sharedInvariantOwner: string;
  readonly performanceOwner: string;
  readonly physicalStoreFood: boolean;
  readonly resourceBoundaryOwnerIds?: readonly string[];
}

/**
 * Shared release evidence for bounded domestic individuals. Species compose
 * the same actor, group, perception, locomotion, persistence, and presentation
 * owners; configuration records only the versioned habitat/custody boundary
 * and whether this slice can lawfully claim food from the physical store.
 */
function domesticLivestockEvidence(
  configuration: DomesticLivestockEvidenceConfiguration,
): readonly ClaimTuple[] {
  const owners = (...values: string[]): readonly string[] => values.sort(compareText);
  const {
    habitatOwnerId,
    settlementOwnerId,
    saveOwnerId,
    sharedInvariantOwner,
    performanceOwner,
    physicalStoreFood,
    resourceBoundaryOwnerIds = [],
  } = configuration;
  return [
    ["species-profile", A, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:living-species-catalog:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["ecological-niche", A, owners(
      habitatOwnerId,
      "game:core-ecology-species-runtime-policy:v1",
      "game:living-species-catalog:v1",
      settlementOwnerId,
      "sim:core-wildlife-identity:v1",
    )],
    ["appearance", A, owners(
      "game:wildlife-presentation:v1",
      "sim:core-wildlife-identity:v1",
    )],
    ["sound", U, []],
    ["habitat-placement", A, owners(
      habitatOwnerId,
      "game:runtime-core-ecology:v1",
      settlementOwnerId,
      sharedInvariantOwner,
    )],
    ["food-web", F, owners(
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-wildlife-actor:v1",
      "game:living-species-catalog:v1",
      ...(physicalStoreFood ? [settlementOwnerId] : []),
      ...resourceBoundaryOwnerIds,
      "sim:core-wildlife-identity:v1",
      sharedInvariantOwner,
    )],
    ["perception-senses", F, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:living-actor-senses:v1",
      "game:runtime-core-ecology:v1",
      "sim:actor-perception:v2",
    )],
    ["locomotion", A, owners(
      "game:core-wildlife-actor:v1",
      "game:core-wildlife-locomotion-profile:v1",
      "game:runtime-core-ecology:v1",
      sharedInvariantOwner,
    )],
    ["human-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["dog-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["same-species-interaction", A, owners(
      "game:core-ecology-groups:v1",
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["other-species-interaction", A, owners(
      "game:core-ecology-perception:v1",
      "game:core-ecology-species-runtime-policy:v1",
      "game:core-ecology-trophic:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
      sharedInvariantOwner,
    )],
    ["neutral-behavior", A, owners(
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
    )],
    ["disengagement", A, ["game:core-wildlife-actor:v1"]],
    ["environmental-evidence", U, []],
    ["about-disclosure", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["knowledge-honesty", A, owners(
      "game:core-ecology-perception:v1",
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      "sim:actor-perception:v2",
    )],
    ["population-materialization", A, owners(
      habitatOwnerId,
      "game:core-ecology-groups:v1",
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
      settlementOwnerId,
      sharedInvariantOwner,
    )],
    ["full-coarse-transition", A, owners(
      "game:core-ecology-groups:v1",
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
      sharedInvariantOwner,
    )],
    ["save-load", A, owners(
      "game:core-ecology:v4",
      saveOwnerId,
      settlementOwnerId,
      sharedInvariantOwner,
    )],
    ["seamless-region-crossing", U, []],
    ["performance-budget", A, owners(
      habitatOwnerId,
      "game:core-ecology:v4",
      "game:runtime-core-ecology:v1",
      performanceOwner,
    )],
    ["accessibility", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
    )],
    ["mobile-parity", A, owners(
      "game:wildlife-about:v1",
      "game:wildlife-presentation:v1",
      sharedInvariantOwner,
    )],
    ["player-independent-scenario", A, owners(
      habitatOwnerId,
      "game:core-ecology-groups:v1",
      "game:core-ecology-perception:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
      settlementOwnerId,
      sharedInvariantOwner,
    )],
    ["fuzz-testing", A, owners(
      habitatOwnerId,
      "game:core-ecology-groups:v1",
      "game:core-ecology-species-runtime-policy:v1",
      settlementOwnerId,
      "sim:core-wildlife-identity:v1",
      sharedInvariantOwner,
    )],
    ["clone-diversity", A, ["sim:core-wildlife-identity:v1"]],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ];
}

function domesticChickenEvidence(): readonly ClaimTuple[] {
  return domesticLivestockEvidence({
    habitatOwnerId: "game:core-ecology-habitat:v8",
    settlementOwnerId: "game:settlement-ecology:v2",
    saveOwnerId: "game:runtime-save:v17",
    sharedInvariantOwner: "test:alpha24-domestic-chicken-shared-invariants:v1",
    performanceOwner: "test:alpha24-domestic-chicken-performance:v1",
    physicalStoreFood: true,
  });
}

function domesticGoatEvidence(): readonly ClaimTuple[] {
  return domesticLivestockEvidence({
    habitatOwnerId: "game:core-ecology-habitat:v9",
    settlementOwnerId: "game:settlement-ecology:v3",
    saveOwnerId: "game:runtime-save:v18",
    sharedInvariantOwner: "test:alpha25-shared-domestic-livestock-invariants:v1",
    performanceOwner: "test:alpha25-shared-domestic-livestock-performance:v1",
    // This slice establishes goat identity, herd, home, and behavior only.
    // Browse remains a foliage integration seam and store provisions stay out.
    physicalStoreFood: false,
    resourceBoundaryOwnerIds: [
      "game:core-wildlife-resource-claim-arbitration:v1",
    ],
  });
}

/**
 * Source evidence for the three-species regional upland cluster. This keeps
 * profile, direct presentation, production-harbor regional placement and
 * materialization, exact save adoption, and measured performance active while
 * broad ecology and sound playback remain explicit foundations. Habitat-v10
 * evidence does not claim construction from an arbitrary caller-chosen harbor.
 */
function regionalUplandEvidence(
  species: "wild-boar" | "elk" | "gray-wolf",
): readonly ClaimTuple[] {
  const owners = (...values: string[]): readonly string[] => values.sort(compareText);
  const wildlifeOwners = owners(
    "game:core-ecology-species-runtime-policy:v1",
    "game:core-wildlife-actor:v1",
  );
  const presentationOwners = owners(
    "game:wildlife-about:v1",
    "game:wildlife-presentation:v1",
    "sim:actor-perception:v2",
  );
  return [
    ["species-profile", A, owners("game:living-species-catalog:v1", "sim:core-wildlife-identity:v1")],
    ["ecological-niche", F, owners("game:core-ecology-habitat:v10", "game:core-ecology-trophic:v1", ...wildlifeOwners)],
    ["appearance", A, owners("game:wildlife-presentation:v1", "sim:core-wildlife-identity:v1")],
    ["sound", F, ["audio:soundscape:v1"]],
    ["habitat-placement", A, owners(
      "game:core-ecology-habitat:v10",
      "game:runtime-core-ecology:v1",
      "test:alpha30-regional-upland-habitat:v1",
    )],
    ["food-web", F, owners("game:core-ecology-trophic:v1", "game:living-species-catalog:v1", ...wildlifeOwners)],
    ["perception-senses", F, owners("game:living-actor-senses:v1", "game:runtime-core-ecology:v1", "sim:actor-perception:v2")],
    ["locomotion", A, owners("game:core-wildlife-locomotion-profile:v1", "game:runtime-core-ecology:v1")],
    ["human-interaction", A, wildlifeOwners],
    ["dog-interaction", U, []],
    ["same-species-interaction", A, owners("game:core-ecology-groups:v1", ...wildlifeOwners)],
    ["other-species-interaction", A, owners("game:core-ecology-trophic:v1", ...wildlifeOwners)],
    ["neutral-behavior", A, ["game:core-wildlife-actor:v1"]],
    ["disengagement", A, ["game:core-wildlife-actor:v1"]],
    ["environmental-evidence", species === "gray-wolf" ? F : U, species === "gray-wolf"
      ? owners("game:core-wildlife-actor:v1", "game:wildlife-presentation:v1")
      : []],
    ["about-disclosure", A, presentationOwners],
    ["knowledge-honesty", A, presentationOwners],
    ["population-materialization", A, owners(
      "game:core-ecology-groups:v1",
      "game:core-ecology-habitat:v10",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
      "test:alpha30-regional-upland-materialization:v1",
    )],
    ["full-coarse-transition", A, owners(
      "game:core-ecology-groups:v1",
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
      "test:alpha30-regional-upland-materialization:v1",
    )],
    ["save-load", A, owners(
      "game:core-wildlife-actor:v1",
      "game:runtime-core-ecology:v1",
      "test:alpha30-body-bearing-save-adoption:v1",
    )],
    ["seamless-region-crossing", U, []],
    ["performance-budget", A, owners(
      "game:core-ecology-habitat:v10",
      "game:runtime-core-ecology:v1",
      "test:alpha30-regional-upland-performance:v1",
    )],
    ["accessibility", A, presentationOwners],
    ["mobile-parity", A, owners(...presentationOwners, "test:alpha30-upland-presentation-invariants:v1")],
    ["player-independent-scenario", F, wildlifeOwners],
    ["fuzz-testing", F, owners("game:core-ecology-species-runtime-policy:v1", "sim:core-wildlife-identity:v1")],
    ["clone-diversity", A, ["sim:core-wildlife-identity:v1"]],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ];
}

/**
 * Current build-owned evidence. This intentionally contains no future roster
 * and never upgrades a criterion merely because the design intends it.
 */
const CURRENT_EVIDENCE: Readonly<Record<LivingActorSpecies, readonly ClaimTuple[]>> = {
  human: [
    ["species-profile", A, ["game:living-species-catalog:v1", "sim:npc-identity:v1"]],
    ["ecological-niche", F, ["sim:npc-identity:v1", "sim:resident-engine:v1"]],
    ["appearance", A, ["game:resident-projection:v1", "sim:npc-identity:v1"]],
    ["sound", U, []],
    ["habitat-placement", F, ["game:resident-spatial:v1", "sim:world-residents:v1"]],
    ["food-web", F, ["sim:resident-engine:v1"]],
    ["perception-senses", F, ["game:living-actor-senses:v1", "sim:actor-perception:v2"]],
    ["locomotion", A, ["game:resident-spatial:v1", "sim:resident-engine:v1"]],
    ["human-interaction", A, ["game:resident-about:v1", "sim:resident-engine:v1"]],
    ["dog-interaction", U, []],
    ["same-species-interaction", A, ["sim:resident-relationships:v1"]],
    ["other-species-interaction", U, []],
    ["neutral-behavior", A, ["sim:resident-engine:v1"]],
    ["disengagement", F, ["sim:resident-engine:v1"]],
    ["environmental-evidence", U, []],
    ["about-disclosure", A, ["game:resident-about:v1"]],
    ["knowledge-honesty", A, ["sim:actor-perception:v2", "sim:resident-memory-knowledge:v1"]],
    ["population-materialization", F, ["sim:world-residents:v1"]],
    ["full-coarse-transition", U, []],
    ["save-load", A, ["sim:persistence:v4", "sim:world-state:v4"]],
    ["seamless-region-crossing", U, []],
    ["performance-budget", U, []],
    ["accessibility", U, []],
    ["mobile-parity", U, []],
    ["player-independent-scenario", F, ["sim:resident-engine:v1"]],
    ["fuzz-testing", U, []],
    ["clone-diversity", F, ["sim:npc-identity:v1"]],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ],
  "domestic-dog": [
    ["species-profile", F, ["game:living-species-catalog:v1", "sim:dog-identity:v1"]],
    ["ecological-niche", F, ["game:dog-behavior:v1", "sim:dog-identity:v1"]],
    ["appearance", F, ["sim:dog-identity:v1"]],
    ["sound", U, []],
    ["habitat-placement", F, ["sim:dog-identity:v1"]],
    ["food-web", F, ["game:dog-behavior:v1"]],
    ["perception-senses", F, ["game:living-actor-senses:v1", "sim:actor-perception:v2"]],
    ["locomotion", F, ["game:dog-behavior:v1"]],
    ["human-interaction", F, ["game:dog-actor:v1", "game:dog-behavior:v1"]],
    ["dog-interaction", U, []],
    ["same-species-interaction", U, []],
    ["other-species-interaction", U, []],
    ["neutral-behavior", F, ["game:dog-behavior:v1"]],
    ["disengagement", F, ["game:dog-behavior:v1"]],
    ["environmental-evidence", U, []],
    ["about-disclosure", F, ["game:dog-about:v1"]],
    ["knowledge-honesty", F, ["game:dog-actor:v1", "sim:actor-perception:v2"]],
    ["population-materialization", U, []],
    ["full-coarse-transition", U, []],
    ["save-load", F, ["game:dog-actor:v1"]],
    ["seamless-region-crossing", U, []],
    ["performance-budget", U, []],
    ["accessibility", U, []],
    ["mobile-parity", U, []],
    ["player-independent-scenario", F, ["game:dog-behavior:v1"]],
    ["fuzz-testing", U, []],
    ["clone-diversity", F, ["sim:dog-identity:v1"]],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ],
  deer: waveACoreWildlifeEvidence("deer"),
  gull: waveACoreWildlifeEvidence("gull"),
  "black-bear": waveACoreWildlifeEvidence("black-bear"),
  "brown-rat": settlementShadowsEvidence("brown-rat"),
  "domestic-cat": settlementShadowsEvidence("domestic-cat"),
  "marsh-rabbit": marshEdgeEvidence("marsh-rabbit"),
  "marsh-fox": marshEdgeEvidence("marsh-fox"),
  "fish-crow": rainChorusEvidence("fish-crow"),
  "northern-harrier": rainChorusEvidence("northern-harrier"),
  "southern-leopard-frog": rainChorusEvidence("southern-leopard-frog"),
  "atlantic-silverside": tidalTableEvidence("atlantic-silverside"),
  "atlantic-marsh-fiddler-crab": tidalTableEvidence("atlantic-marsh-fiddler-crab"),
  "snowy-egret": tidalTableEvidence("snowy-egret"),
  "american-black-duck": americanBlackDuckEvidence(),
  "north-american-river-otter": riverOtterEvidence(),
  "domestic-chicken": domesticChickenEvidence(),
  "domestic-goat": domesticGoatEvidence(),
  "wild-boar": regionalUplandEvidence("wild-boar"),
  elk: regionalUplandEvidence("elk"),
  "gray-wolf": regionalUplandEvidence("gray-wolf"),
};

if (LIVING_SPECIES_RELEASE_CRITERIA.length !== 30) {
  throw new Error("Living species release gate must retain all 30 criteria");
}

function gateFromEvidence(
  speciesId: LivingActorSpecies,
  claims: readonly ClaimTuple[],
): LivingSpeciesReleaseGate {
  const module = livingSpeciesModule(speciesId);
  if (module === null) throw new Error(`Release evidence references missing species ${speciesId}`);
  const input = {
    version: LIVING_SPECIES_RELEASE_GATE_VERSION,
    catalogVersion: LIVING_SPECIES_CATALOG_VERSION,
    speciesId,
    moduleId: module.moduleId,
    criteria: claims.map(([criterion, status, evidenceOwnerIds]) => ({
      criterion,
      status,
      evidenceOwnerIds,
      notApplicable: null,
    })),
  };
  const canonical = canonicalizeLivingSpeciesReleaseGate(input);
  if (canonical === null) throw new Error(`Built-in release evidence for ${speciesId} is invalid`);
  return canonical;
}

const trustedGates = (Object.keys(CURRENT_EVIDENCE) as (keyof typeof CURRENT_EVIDENCE)[])
  .map((speciesId) => gateFromEvidence(speciesId, CURRENT_EVIDENCE[speciesId]));
const currentGateSet = createLivingSpeciesReleaseGateSet(trustedGates);
if (currentGateSet === null) throw new Error("Built-in living species release gate set is invalid");
if (
  currentGateSet.gates.length !== LIVING_SPECIES_CATALOG.modules.length
  || currentGateSet.gates.some((gate, index) => gate.speciesId !== LIVING_SPECIES_CATALOG.modules[index]?.speciesId)
) throw new Error("Release evidence does not exactly cover the registered living species catalog");

export const LIVING_SPECIES_RELEASE_GATES: LivingSpeciesReleaseGateSet = currentGateSet;

/** Exact persisted-shape validation; it does not authenticate an evidence claim. */
export function canonicalizeLivingSpeciesReleaseGate(value: unknown): LivingSpeciesReleaseGate | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "catalogVersion",
    "criteria",
    "moduleId",
    "speciesId",
    "version",
  ])) return null;
  if (
    value.version !== LIVING_SPECIES_RELEASE_GATE_VERSION
    || value.catalogVersion !== LIVING_SPECIES_CATALOG_VERSION
    || !canonicalId(value.speciesId, 64)
    || !canonicalId(value.moduleId, 96)
    || !Array.isArray(value.criteria)
    || value.criteria.length !== LIVING_SPECIES_RELEASE_CRITERIA.length
  ) return null;
  const module = livingSpeciesModule(value.speciesId);
  if (module === null || module.moduleId !== value.moduleId) return null;
  const criteria: LivingSpeciesReleaseCriterionState[] = [];
  for (let index = 0; index < LIVING_SPECIES_RELEASE_CRITERIA.length; index += 1) {
    const criterion = canonicalCriterionState(value.criteria[index], LIVING_SPECIES_RELEASE_CRITERIA[index]!);
    if (criterion === null) return null;
    criteria.push(criterion);
  }
  return deepFreeze({
    version: LIVING_SPECIES_RELEASE_GATE_VERSION,
    catalogVersion: LIVING_SPECIES_CATALOG_VERSION,
    speciesId: value.speciesId,
    moduleId: value.moduleId,
    criteria,
  });
}

export function createLivingSpeciesReleaseGateSet(
  values: readonly unknown[],
): LivingSpeciesReleaseGateSet | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > LIVING_SPECIES_CATALOG.modules.length) return null;
  const gates: LivingSpeciesReleaseGate[] = [];
  for (const value of values) {
    const gate = canonicalizeLivingSpeciesReleaseGate(value);
    if (gate === null) return null;
    gates.push(gate);
  }
  gates.sort((left, right) => compareText(left.speciesId, right.speciesId));
  for (let index = 1; index < gates.length; index += 1) {
    if (
      gates[index - 1]?.speciesId === gates[index]?.speciesId
      || gates[index - 1]?.moduleId === gates[index]?.moduleId
    ) return null;
  }
  return deepFreeze({ version: LIVING_SPECIES_RELEASE_GATE_VERSION, gates });
}

export function canonicalizeLivingSpeciesReleaseGateSet(value: unknown): LivingSpeciesReleaseGateSet | null {
  if (!plainRecord(value) || !exactKeys(value, ["gates", "version"])) return null;
  if (value.version !== LIVING_SPECIES_RELEASE_GATE_VERSION || !Array.isArray(value.gates)) return null;
  const canonical = createLivingSpeciesReleaseGateSet(value.gates);
  return canonical !== null && sameData(canonical, value) ? canonical : null;
}

/**
 * Authenticate evidence against this exact build, then derive readiness.
 * Callers cannot assert or serialize `publicReady` themselves.
 */
export function auditLivingSpeciesReleaseGate(value: unknown): LivingSpeciesReadinessReport | null {
  const gate = canonicalizeLivingSpeciesReleaseGate(value);
  if (gate === null) return null;
  const trusted = LIVING_SPECIES_RELEASE_GATES.gates.find(({ speciesId }) => speciesId === gate.speciesId);
  const evidenceAuthenticated = trusted !== undefined && sameData(gate, trusted);
  const counts: LivingSpeciesReadinessCounts = deepFreeze({
    active: gate.criteria.filter(({ status }) => status === "active").length,
    foundation: gate.criteria.filter(({ status }) => status === "foundation").length,
    unimplemented: gate.criteria.filter(({ status }) => status === "unimplemented").length,
    notApplicable: gate.criteria.filter(({ status }) => status === "not-applicable").length,
    total: gate.criteria.length,
  });
  const blockingCriteria = evidenceAuthenticated
    ? gate.criteria
      .filter(({ status }) => status !== "active" && status !== "not-applicable")
      .map(({ criterion }) => criterion)
    : [...LIVING_SPECIES_RELEASE_CRITERIA];
  const publicReady = evidenceAuthenticated && blockingCriteria.length === 0;
  return deepFreeze({
    version: LIVING_SPECIES_READINESS_REPORT_VERSION,
    speciesId: gate.speciesId,
    moduleId: gate.moduleId,
    evidenceAuthenticated,
    state: evidenceAuthenticated ? (publicReady ? "public-ready" : "blocked") : "invalid-claim",
    publicReady,
    counts,
    blockingCriteria,
  });
}

export function livingSpeciesReadinessReport(speciesId: string): LivingSpeciesReadinessReport | null {
  const gate = LIVING_SPECIES_RELEASE_GATES.gates.find((candidate) => candidate.speciesId === speciesId);
  return gate === undefined ? null : auditLivingSpeciesReleaseGate(gate);
}

/**
 * Derive the bounded Alpha-16 candidate state exclusively from authenticated
 * built-in evidence. A true bounded candidate never implies a live build or
 * completion of the full 30-criterion species gate.
 */
export function alpha16MarshEdgeBoundedReadiness(): Alpha16MarshEdgeBoundedReadinessReport {
  const reports = ALPHA16_MARSH_EDGE_SPECIES.map((speciesId) => ({
    speciesId,
    gate: LIVING_SPECIES_RELEASE_GATES.gates.find((candidate) => (
      candidate.speciesId === speciesId
    )),
    report: livingSpeciesReadinessReport(speciesId),
  }));
  const evidenceAuthenticated = reports.every(({ gate, report }) => (
    gate !== undefined && report?.evidenceAuthenticated === true
  ));
  const blockingBoundedCriteria = ALPHA16_MARSH_EDGE_BOUNDED_CRITERIA.filter((criterion) => (
    reports.some(({ gate }) => gate?.criteria.find((state) => state.criterion === criterion)?.status !== "active")
  ));
  const publicationRecordsReady = evidenceAuthenticated && [
    "tutorial-truth",
    "patch-note-truth",
  ].every((criterion) => reports.every(({ gate }) => (
    gate?.criteria.find((state) => state.criterion === criterion)?.status === "active"
  )));
  const exactTestedDeploymentVerified = evidenceAuthenticated && reports.every(({ gate }) => (
    gate?.criteria.find(({ criterion }) => criterion === "exact-tested-deployment")?.status === "active"
  ));
  const fullGateBlockingCriteria = LIVING_SPECIES_RELEASE_CRITERIA.filter((criterion) => (
    reports.some(({ report }) => report?.blockingCriteria.includes(criterion) ?? true)
  ));
  const boundedCandidateReady = evidenceAuthenticated && blockingBoundedCriteria.length === 0;
  const fullThirtyCriterionReady = evidenceAuthenticated
    && reports.every(({ report }) => report?.publicReady === true);
  return deepFreeze({
    version: ALPHA16_MARSH_EDGE_BOUNDED_READINESS_VERSION,
    unitId: "alpha16-marsh-edge",
    speciesIds: [...ALPHA16_MARSH_EDGE_SPECIES],
    boundedCriteria: [...ALPHA16_MARSH_EDGE_BOUNDED_CRITERIA],
    evidenceAuthenticated,
    boundedCandidateReady,
    blockingBoundedCriteria,
    publicationRecordsReady,
    exactTestedDeploymentVerified,
    published: boundedCandidateReady
      && publicationRecordsReady
      && exactTestedDeploymentVerified,
    fullThirtyCriterionReady,
    fullGateBlockingCriteria,
  });
}

export const ALPHA16_MARSH_EDGE_BOUNDED_READINESS =
  alpha16MarshEdgeBoundedReadiness();

/**
 * Derive the bounded Alpha-17 candidate only from authenticated build-owned
 * evidence. Publication still additionally requires records and the exact
 * deployed build, while deferred full-gate work remains visible.
 */
export function alpha17RainChorusBoundedReadiness(): Alpha17RainChorusBoundedReadinessReport {
  const reports = ALPHA17_RAIN_CHORUS_SPECIES.map((speciesId) => ({
    speciesId,
    gate: LIVING_SPECIES_RELEASE_GATES.gates.find((candidate) => (
      candidate.speciesId === speciesId
    )),
    report: livingSpeciesReadinessReport(speciesId),
  }));
  const evidenceAuthenticated = reports.every(({ gate, report }) => (
    gate !== undefined && report?.evidenceAuthenticated === true
  ));
  const blockingBoundedCriteria = ALPHA17_RAIN_CHORUS_BOUNDED_CRITERIA.filter((criterion) => (
    reports.some(({ speciesId, gate }) => (
      // Rain Chorus owns the crow's authored call and the frogs' chorus. The
      // harrier has no authored vocal event in this bounded slice, so a silent
      // runtime remains an explicit full-gate seam rather than a fabricated cry.
      !(speciesId === "northern-harrier" && criterion === "sound")
      &&
      gate?.criteria.find((state) => state.criterion === criterion)?.status !== "active"
    ))
  ));
  const publicationRecordsReady = evidenceAuthenticated && [
    "tutorial-truth",
    "patch-note-truth",
  ].every((criterion) => reports.every(({ gate }) => (
    gate?.criteria.find((state) => state.criterion === criterion)?.status === "active"
  )));
  const exactTestedDeploymentVerified = evidenceAuthenticated && reports.every(({ gate }) => (
    gate?.criteria.find(({ criterion }) => criterion === "exact-tested-deployment")?.status === "active"
  ));
  const fullGateBlockingCriteria = LIVING_SPECIES_RELEASE_CRITERIA.filter((criterion) => (
    reports.some(({ report }) => report?.blockingCriteria.includes(criterion) ?? true)
  ));
  const boundedCandidateReady = evidenceAuthenticated && blockingBoundedCriteria.length === 0;
  const fullThirtyCriterionReady = evidenceAuthenticated
    && reports.every(({ report }) => report?.publicReady === true);
  return deepFreeze({
    version: ALPHA17_RAIN_CHORUS_BOUNDED_READINESS_VERSION,
    unitId: "alpha17-rain-chorus",
    speciesIds: [...ALPHA17_RAIN_CHORUS_SPECIES],
    boundedCriteria: [...ALPHA17_RAIN_CHORUS_BOUNDED_CRITERIA],
    evidenceAuthenticated,
    boundedCandidateReady,
    blockingBoundedCriteria,
    publicationRecordsReady,
    exactTestedDeploymentVerified,
    published: boundedCandidateReady
      && publicationRecordsReady
      && exactTestedDeploymentVerified,
    fullThirtyCriterionReady,
    fullGateBlockingCriteria,
  });
}

export const ALPHA17_RAIN_CHORUS_BOUNDED_READINESS =
  alpha17RainChorusBoundedReadiness();

/**
 * Authenticated closure witness for Wave B's seven-role starting-harbor
 * ecology only. Aggregate populations remain aggregates; a social flock owns
 * group continuity; other mobile roles retain individual full/coarse records.
 * This report cannot attest an ecology atlas, migration, promotion, the full
 * 30-criterion gate, or completion of the broader biodiversity directive.
 */
export function waveBBoundedStartingHarborReadiness(): WaveBBoundedStartingHarborReadinessReport {
  const roles = WAVE_B_BOUNDED_ROLE_DEFINITIONS.map((definition): WaveBBoundedRoleReadiness => {
    const gate = LIVING_SPECIES_RELEASE_GATES.gates.find(({ speciesId }) => (
      speciesId === definition.speciesId
    ));
    const report = gate === undefined ? null : auditLivingSpeciesReleaseGate(gate);
    const module = livingSpeciesModule(definition.speciesId);
    const evidenceAuthenticated = gate !== undefined
      && report?.evidenceAuthenticated === true;
    const criterion = (name: LivingSpeciesReleaseCriterion) => (
      gate?.criteria.find((state) => state.criterion === name)
    );
    const active = (name: LivingSpeciesReleaseCriterion): boolean => (
      criterion(name)?.status === "active"
    );
    const activeOrFoundation = (name: LivingSpeciesReleaseCriterion): boolean => {
      const status = criterion(name)?.status;
      return status === "active" || status === "foundation";
    };

    const individualRepresentation = module !== null
      && module.identity.form === "individual"
      && module.population.authoritativeUnit === "hybrid"
      && module.population.materialization === "mixed"
      && module.population.coarseSimulation;
    const representationAuthenticated = definition.representation === "aggregate"
      ? module !== null
        && module.identity.form === "aggregate"
        && module.population.authoritativeUnit === "population-patch"
        && module.population.materialization === "threshold"
        && module.population.coarseSimulation
      : definition.representation === "group"
        ? individualRepresentation
          && module?.social.groupModel === "group"
          && module.social.group.status === "active"
          && module.social.group.representation === "hybrid"
          && module.social.group.stableIdentity
          && module.social.group.membership
        : individualRepresentation;
    const interactionContractAuthenticated = module !== null
      && module.interactions.targets.length === LIVING_SPECIES_INTERACTION_TARGET_CLASSES.length
      && module.interactions.targets.every((target, index) => (
        target.targetClass === LIVING_SPECIES_INTERACTION_TARGET_CLASSES[index]
        && (
          target.policy === "available"
          || target.policy === "intentional-no-response"
        )
      ));

    const commonContinuity = active("population-materialization") && active("save-load");
    const continuityAuthenticated = definition.representation === "aggregate"
      ? commonContinuity
        && activeOrFoundation("full-coarse-transition")
        && activeOrFoundation("seamless-region-crossing")
      : commonContinuity
        && active("full-coarse-transition")
        && active("seamless-region-crossing")
        && (definition.representation !== "group" || active("same-species-interaction"));

    const evidenceCriteria: readonly LivingSpeciesReleaseCriterion[] = definition.representation === "group"
      ? [
          "population-materialization",
          "full-coarse-transition",
          "save-load",
          "seamless-region-crossing",
          "same-species-interaction",
        ]
      : [
          "population-materialization",
          "full-coarse-transition",
          "save-load",
          "seamless-region-crossing",
        ];
    const evidenceOwnerIds = [
      module?.identity.ownerId,
      module?.population.ownerId,
      ...(definition.representation === "group" ? [module?.social.group.ownerId] : []),
      ...evidenceCriteria.flatMap((name) => criterion(name)?.evidenceOwnerIds ?? []),
    ].filter((ownerId): ownerId is string => ownerId !== null && ownerId !== undefined);

    return deepFreeze({
      role: definition.role,
      speciesId: definition.speciesId,
      representation: definition.representation,
      continuity: definition.continuity,
      evidenceAuthenticated,
      representationAuthenticated,
      interactionContractAuthenticated,
      continuityAuthenticated,
      ready: evidenceAuthenticated
        && representationAuthenticated
        && interactionContractAuthenticated
        && continuityAuthenticated,
      evidenceOwnerIds: [...new Set(evidenceOwnerIds)].sort(compareText),
    });
  });
  const roleCoverageReady = roles.length === WAVE_B_BOUNDED_ROLE_DEFINITIONS.length
    && roles.every((role, index) => (
      role.role === WAVE_B_BOUNDED_ROLE_DEFINITIONS[index]?.role
      && role.speciesId === WAVE_B_BOUNDED_STARTING_HARBOR_SPECIES[index]
    ));
  const evidenceAuthenticated = roles.every((role) => role.evidenceAuthenticated);
  const broadInteractionCoverageReady = roles.every((role) => (
    role.interactionContractAuthenticated
  ));
  const blockingRoles = roles.filter((role) => !role.ready).map(({ role }) => role);
  const fullThirtyCriterionReady = roles.every(({ speciesId }) => (
    livingSpeciesReadinessReport(speciesId)?.publicReady === true
  ));
  return deepFreeze({
    version: WAVE_B_BOUNDED_STARTING_HARBOR_READINESS_VERSION,
    unitId: "wave-b-small-world",
    scope: "bounded-starting-harbor",
    speciesIds: [...WAVE_B_BOUNDED_STARTING_HARBOR_SPECIES],
    roles,
    evidenceAuthenticated,
    roleCoverageReady,
    broadInteractionCoverageReady,
    boundedCandidateReady: evidenceAuthenticated
      && roleCoverageReady
      && broadInteractionCoverageReady
      && blockingRoles.length === 0,
    blockingRoles,
    fullThirtyCriterionReady,
    excludedClaims: [...WAVE_B_BOUNDED_EXCLUDED_CLAIMS],
  });
}

export const WAVE_B_BOUNDED_STARTING_HARBOR_READINESS =
  waveBBoundedStartingHarborReadiness();

/**
 * Authenticated technical witness for the first bounded Wave-C release unit.
 * Its aggregate continuity claim is deliberately narrower than the full
 * `seamless-region-crossing` criterion: the saved school/area remains exact at
 * signed spatial frames, but no population migrates across a region seam. The
 * snowy egret remains one local individual and likewise makes no migration
 * claim. Publication and deployment are reported separately and fail closed.
 */
export function waveCTidalTableBoundedReadiness(): WaveCTidalTableBoundedReadinessReport {
  const roles = WAVE_C_TIDAL_TABLE_ROLE_DEFINITIONS.map(
    (definition): WaveCTidalTableRoleReadiness => {
      const gate = LIVING_SPECIES_RELEASE_GATES.gates.find(({ speciesId }) => (
        speciesId === definition.speciesId
      ));
      const report = gate === undefined ? null : auditLivingSpeciesReleaseGate(gate);
      const module = livingSpeciesModule(definition.speciesId);
      const criterion = (name: LivingSpeciesReleaseCriterion) => (
        gate?.criteria.find((state) => state.criterion === name)
      );
      const active = (name: LivingSpeciesReleaseCriterion): boolean => (
        criterion(name)?.status === "active"
      );
      const evidenceAuthenticated = gate !== undefined
        && report?.evidenceAuthenticated === true;

      const representationAuthenticated = definition.representation === "school-aggregate"
        ? module !== null
          && module.identity.form === "aggregate"
          && module.population.authoritativeUnit === "group-records"
          && module.population.materialization === "threshold"
          && module.population.coarseSimulation
          && module.social.group.status === "foundation"
          && module.social.group.representation === "group-actor"
          && module.social.group.stableIdentity
        : definition.representation === "area-aggregate"
          ? module !== null
            && module.identity.form === "aggregate"
            && module.population.authoritativeUnit === "population-patch"
            && module.population.materialization === "threshold"
            && module.population.coarseSimulation
          : module !== null
            && module.identity.form === "individual"
            && module.population.authoritativeUnit === "hybrid"
            && module.population.materialization === "mixed"
            && module.population.coarseSimulation;
      const interactionContractAuthenticated = module !== null
        && module.interactions.targets.length === LIVING_SPECIES_INTERACTION_TARGET_CLASSES.length
        && module.interactions.targets.every((target, index) => (
          target.targetClass === LIVING_SPECIES_INTERACTION_TARGET_CLASSES[index]
          && (target.policy === "available" || target.policy === "intentional-no-response")
        ));
      const tidalResponseAuthenticated = module !== null
        && module.environment.tide.status === "foundation"
        && module.environment.tide.ownerId === "game:core-ecology-species-runtime-policy:v1"
        && module.environment.tide.inputs.length > 0
        && module.environment.tide.outputs.length > 0
        && [
          "ecological-niche",
          "habitat-placement",
          "locomotion",
          "player-independent-scenario",
        ].every((name) => {
          const state = criterion(name as LivingSpeciesReleaseCriterion);
          return state?.status === "active"
            && state.evidenceOwnerIds.includes("game:core-ecology-tidal-table:v1");
        });
      const signedFrameFoundation = criterion("seamless-region-crossing");
      const commonContinuity = module !== null
        && module.locomotion.crossRegion === false
        && module.spatial.signedRegions
        && module.spatial.extremeRegions
        && active("population-materialization")
        && active("full-coarse-transition")
        && active("save-load");
      const continuityAuthenticated = definition.continuity
        === "signed-frame-aggregate-continuity"
        ? commonContinuity
          && signedFrameFoundation?.status === "foundation"
          && signedFrameFoundation.evidenceOwnerIds.includes(
            "test:core-ecology-tidal-table-signed-frame-continuity:v1",
          )
        : commonContinuity
          && signedFrameFoundation?.status === "unimplemented"
          && signedFrameFoundation.evidenceOwnerIds.length === 0;
      const performanceState = criterion("performance-budget");
      const performanceEvidenceAuthenticated = performanceState?.status === "active"
        && performanceState.evidenceOwnerIds.includes(
          "test:core-ecology-tidal-table-performance:v1",
        );
      const evidenceOwnerIds = [
        module?.identity.ownerId,
        module?.population.ownerId,
        module?.environment.tide.ownerId,
        ...[
          "ecological-niche",
          "habitat-placement",
          "locomotion",
          "other-species-interaction",
          "population-materialization",
          "full-coarse-transition",
          "save-load",
          "seamless-region-crossing",
          "performance-budget",
          "player-independent-scenario",
        ].flatMap((name) => (
          criterion(name as LivingSpeciesReleaseCriterion)?.evidenceOwnerIds ?? []
        )),
      ].filter((ownerId): ownerId is string => ownerId !== null && ownerId !== undefined);

      return deepFreeze({
        role: definition.role,
        speciesId: definition.speciesId,
        representation: definition.representation,
        continuity: definition.continuity,
        evidenceAuthenticated,
        representationAuthenticated,
        interactionContractAuthenticated,
        tidalResponseAuthenticated,
        continuityAuthenticated,
        performanceEvidenceAuthenticated,
        ready: evidenceAuthenticated
          && representationAuthenticated
          && interactionContractAuthenticated
          && tidalResponseAuthenticated
          && continuityAuthenticated
          && performanceEvidenceAuthenticated,
        evidenceOwnerIds: [...new Set(evidenceOwnerIds)].sort(compareText),
      });
    },
  );
  const roleCoverageReady = roles.length === WAVE_C_TIDAL_TABLE_ROLE_DEFINITIONS.length
    && roles.every((role, index) => (
      role.role === WAVE_C_TIDAL_TABLE_ROLE_DEFINITIONS[index]?.role
      && role.speciesId === WAVE_C_TIDAL_TABLE_SPECIES[index]
    ));
  const evidenceAuthenticated = roles.every((role) => role.evidenceAuthenticated);
  const broadInteractionCoverageReady = roles.every(
    (role) => role.interactionContractAuthenticated,
  );
  const tidalResponseReady = roles.every((role) => role.tidalResponseAuthenticated);
  const signedFrameAggregateRoles = roles.filter(({ continuity }) => (
    continuity === "signed-frame-aggregate-continuity"
  ));
  const signedFrameAggregateContinuityReady = signedFrameAggregateRoles.length === 2
    && signedFrameAggregateRoles.every((role) => role.continuityAuthenticated);
  const localWaderRoles = roles.filter(({ continuity }) => (
    continuity === "bounded-local-individual-continuity"
  ));
  const localWaderContinuityReady = localWaderRoles.length === 1
    && localWaderRoles.every((role) => role.continuityAuthenticated);
  const performanceEvidenceReady = roles.every(
    (role) => role.performanceEvidenceAuthenticated,
  );
  const blockingRoles = roles.filter((role) => !role.ready).map(({ role }) => role);
  const publicationRecordsReady = evidenceAuthenticated && [
    "tutorial-truth",
    "patch-note-truth",
  ].every((name) => roles.every(({ speciesId }) => (
    LIVING_SPECIES_RELEASE_GATES.gates
      .find((gate) => gate.speciesId === speciesId)
      ?.criteria.find(({ criterion }) => criterion === name)?.status === "active"
  )));
  const exactTestedDeploymentVerified = evidenceAuthenticated && roles.every(({ speciesId }) => (
    LIVING_SPECIES_RELEASE_GATES.gates
      .find((gate) => gate.speciesId === speciesId)
      ?.criteria.find(({ criterion }) => criterion === "exact-tested-deployment")
      ?.status === "active"
  ));
  const fullThirtyCriterionReady = roles.every(({ speciesId }) => (
    livingSpeciesReadinessReport(speciesId)?.publicReady === true
  ));
  const boundedCandidateReady = evidenceAuthenticated
    && roleCoverageReady
    && broadInteractionCoverageReady
    && tidalResponseReady
    && signedFrameAggregateContinuityReady
    && localWaderContinuityReady
    && performanceEvidenceReady
    && blockingRoles.length === 0;

  return deepFreeze({
    version: WAVE_C_TIDAL_TABLE_BOUNDED_READINESS_VERSION,
    unitId: "tidal-table",
    scope: "bounded-starting-harbor-tidal",
    speciesIds: [...WAVE_C_TIDAL_TABLE_SPECIES],
    roles,
    evidenceAuthenticated,
    roleCoverageReady,
    broadInteractionCoverageReady,
    tidalResponseReady,
    signedFrameAggregateContinuityReady,
    localWaderContinuityReady,
    performanceEvidenceReady,
    boundedCandidateReady,
    blockingRoles,
    publicationRecordsReady,
    exactTestedDeploymentVerified,
    published: boundedCandidateReady
      && publicationRecordsReady
      && exactTestedDeploymentVerified,
    fullThirtyCriterionReady,
    excludedClaims: [...WAVE_C_TIDAL_TABLE_EXCLUDED_CLAIMS],
  });
}

export const WAVE_C_TIDAL_TABLE_BOUNDED_READINESS =
  waveCTidalTableBoundedReadiness();

/**
 * Authenticated Alpha-20 witness for one bounded American black duck actor.
 * It proves only the active local data/runtime/presentation paths listed here;
 * excluded life-history, flock, and migration systems are checked as absences.
 */
export function alpha20AmericanBlackDuckBoundedReadiness():
Alpha20AmericanBlackDuckBoundedReadinessReport {
  const speciesId = ALPHA20_AMERICAN_BLACK_DUCK_SPECIES[0];
  const gate = LIVING_SPECIES_RELEASE_GATES.gates.find((candidate) => (
    candidate.speciesId === speciesId
  ));
  const report = gate === undefined ? null : auditLivingSpeciesReleaseGate(gate);
  const module = livingSpeciesModule(speciesId);
  const runtimePolicy = coreEcologySpeciesRuntimePolicy(speciesId);
  const ownsRuntimeCapability = (
    capability: CoreEcologySpeciesRuntimeCapability,
  ): boolean => runtimePolicy?.capabilities.includes(capability) === true;
  const criterion = (name: LivingSpeciesReleaseCriterion) => (
    gate?.criteria.find((state) => state.criterion === name)
  );
  const active = (name: LivingSpeciesReleaseCriterion): boolean => (
    criterion(name)?.status === "active"
  );
  const evidenceAuthenticated = gate !== undefined
    && report?.evidenceAuthenticated === true;

  const speciesProfileReady = module !== null
    && runtimePolicy !== null
    && active("species-profile")
    && active("ecological-niche")
    && module.profile.implementation === "active"
    && module.profile.taxonomicClass === "bird"
    && module.profile.ecologicalClasses.includes("waterfowl")
    && runtimePolicy.speciesId === speciesId;
  const individualRepresentationReady = module !== null
    && runtimePolicy !== null
    && module.identity.implementation === "active"
    && module.identity.form === "individual"
    && module.identity.stableIdNamespace === "DUCK"
    && module.population.implementation === "active"
    && module.population.authoritativeUnit === "hybrid"
    && module.population.materialization === "mixed"
    && module.population.maxMaterializedPerRegion === 1
    && module.population.coarseSimulation
    && runtimePolicy.actorAddressable
    && runtimePolicy.identityForm === "individual"
    && runtimePolicy.maximumMaterializedActors === 1
    && runtimePolicy.presentationModel === "individual"
    && module.social.group.status === "unimplemented"
    && !module.social.group.stableIdentity
    && runtimePolicy.groupStableIdNamespace === null;
  const habitatPlacementReady = module !== null
    && active("habitat-placement")
    && module.habitat.implementation === "active"
    && module.habitat.ownerId === "game:core-ecology-habitat:v6"
    && module.habitat.migrationModel === "none";
  const boundedActivityReady = module !== null
    && runtimePolicy !== null
    && active("neutral-behavior")
    && active("player-independent-scenario")
    && module.activity.implementation === "active"
    && module.activity.ownerId === "game:core-ecology-activity:v1"
    && module.activity.circadian.status === "active"
    && [
      "dabbling-forage",
      "surface-swimming",
      "tidal-relocation-flight",
    ].every((signal) => runtimePolicy.activitySignals.includes(signal))
    && ([
      "aquatic-foraging",
      "aquatic-locomotion",
      "tidal-activity",
      "water-depth-response",
    ] as const).every(ownsRuntimeCapability);
  const multimodalLocomotionReady = module !== null
    && runtimePolicy !== null
    && active("locomotion")
    && module.locomotion.implementation === "active"
    && module.locomotion.ownerId === "game:core-wildlife-locomotion-profile:v1"
    && module.locomotion.crossRegion === false
    && ["air", "deep-water", "shallow-water"].every((medium) => (
      module.locomotion.media.some((entry) => entry.medium === medium)
    ))
    && !module.locomotion.media.some((entry) => entry.medium === "land")
    && ["dabble", "fly", "relocate", "swim"].every((verb) => (
      module.locomotion.movementVerbs.includes(verb)
    ))
    && !module.locomotion.movementVerbs.includes("walk")
    && ([
      "aerial-locomotion",
      "aquatic-locomotion",
      "water-depth-response",
    ] as const).every(ownsRuntimeCapability);
  const lawfulPerceptionReady = module !== null
    && runtimePolicy !== null
    && criterion("perception-senses")?.status === "foundation"
    && criterion("perception-senses")?.evidenceOwnerIds.includes(
      "game:core-ecology-perception:v1",
    ) === true
    && module.senses.implementation === "foundation"
    && module.senses.ownerId === "game:living-actor-senses:v1"
    && (["food-investigation", "movement-memory", "shared-alarm"] as const)
      .every(ownsRuntimeCapability);
  const individualPresentationReady = runtimePolicy !== null
    && runtimePolicy.presentationModel === "individual"
    && [
      "appearance",
      "about-disclosure",
      "knowledge-honesty",
      "accessibility",
      "mobile-parity",
    ].every((name) => active(name as LivingSpeciesReleaseCriterion));
  const forbiddenInteractionVerbs = new Set(["attack", "capture", "consume", "kill"]);
  const nonlethalInteractionsReady = module !== null
    && active("human-interaction")
    && active("dog-interaction")
    && active("other-species-interaction")
    && module.interactions.targets.length === LIVING_SPECIES_INTERACTION_TARGET_CLASSES.length
    && module.interactions.targets.every((target, index) => (
      target.targetClass === LIVING_SPECIES_INTERACTION_TARGET_CLASSES[index]
      && (target.policy === "available" || target.policy === "intentional-no-response")
      && target.verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ))
    && module.interactions.targets.find(({ targetClass }) => (
      targetClass === "aquatic-animal"
    ))?.escalationConstraints.includes("nonlethal-pressure-only") === true;
  const boundedLocalContinuityReady = module !== null
    && active("population-materialization")
    && active("full-coarse-transition")
    && active("save-load")
    && criterion("seamless-region-crossing")?.status === "unimplemented"
    && module.population.maxMaterializedPerRegion === 1
    && module.population.coarseSimulation
    && module.spatial.signedRegions
    && module.spatial.extremeRegions
    && module.locomotion.crossRegion === false;
  const performanceEvidenceReady = active("performance-budget")
    && criterion("performance-budget")?.evidenceOwnerIds.includes(
      "test:core-ecology-waterfowl-performance:v1",
    ) === true;
  const excludedClaimIntegrityReady = module !== null
    && runtimePolicy !== null
    && module.lifeHistory.mortality === "unimplemented"
    && module.lifeHistory.reproduction === "unimplemented"
    && module.health.causalDeath === false
    && module.aftermath.implementation === "unimplemented"
    && module.aftermath.carcassModel === "none"
    && module.social.territory.model === "none"
    && module.social.territory.anchorKinds.length === 0
    && module.social.group.status === "unimplemented"
    && runtimePolicy.maximumMaterializedActors === 1
    && !runtimePolicy.capabilities.includes("group-coordination")
    && module.habitat.migrationModel === "none"
    && module.locomotion.crossRegion === false;

  const capabilities: readonly (
    readonly [Alpha20AmericanBlackDuckBoundedCapability, boolean]
  )[] = [
    ["species-profile", speciesProfileReady],
    ["individual-representation", individualRepresentationReady],
    ["habitat-placement", habitatPlacementReady],
    ["bounded-activity", boundedActivityReady],
    ["multimodal-locomotion", multimodalLocomotionReady],
    ["lawful-perception", lawfulPerceptionReady],
    ["individual-presentation", individualPresentationReady],
    ["nonlethal-interactions", nonlethalInteractionsReady],
    ["bounded-local-continuity", boundedLocalContinuityReady],
    ["performance-budget", performanceEvidenceReady],
    ["excluded-claim-integrity", excludedClaimIntegrityReady],
  ];
  const blockingCapabilities = capabilities
    .filter(([, ready]) => !ready)
    .map(([capability]) => capability);
  const evidenceOwnerIds = gate === undefined
    ? []
    : [...new Set(gate.criteria.flatMap(({ evidenceOwnerIds: owners }) => owners))]
      .sort(compareText);
  const publicationRecordsReady = evidenceAuthenticated
    && active("tutorial-truth")
    && active("patch-note-truth");
  const exactTestedDeploymentVerified = evidenceAuthenticated
    && active("exact-tested-deployment");
  const boundedCandidateReady = evidenceAuthenticated
    && blockingCapabilities.length === 0;

  return deepFreeze({
    version: ALPHA20_AMERICAN_BLACK_DUCK_BOUNDED_READINESS_VERSION,
    unitId: "alpha20-american-black-duck",
    scope: "one-bounded-waterfowl-individual",
    speciesIds: [...ALPHA20_AMERICAN_BLACK_DUCK_SPECIES],
    evidenceAuthenticated,
    speciesProfileReady,
    individualRepresentationReady,
    habitatPlacementReady,
    boundedActivityReady,
    multimodalLocomotionReady,
    lawfulPerceptionReady,
    individualPresentationReady,
    nonlethalInteractionsReady,
    boundedLocalContinuityReady,
    performanceEvidenceReady,
    excludedClaimIntegrityReady,
    boundedCandidateReady,
    blockingCapabilities,
    evidenceOwnerIds,
    publicationRecordsReady,
    exactTestedDeploymentVerified,
    published: boundedCandidateReady
      && publicationRecordsReady
      && exactTestedDeploymentVerified,
    fullThirtyCriterionReady: report?.publicReady === true,
    excludedClaims: [...ALPHA20_AMERICAN_BLACK_DUCK_EXCLUDED_CLAIMS],
  });
}

export const ALPHA20_AMERICAN_BLACK_DUCK_BOUNDED_READINESS =
  alpha20AmericanBlackDuckBoundedReadiness();

/**
 * Authenticated Alpha-21 witness for one bounded North American river otter.
 * This closes the live local shore-water slice and explicitly refuses to
 * imply harmful predation, evidence, life history, or ecological migration.
 */
export function alpha21RiverOtterBoundedReadiness():
Alpha21RiverOtterBoundedReadinessReport {
  const speciesId = ALPHA21_RIVER_OTTER_SPECIES[0];
  const gate = LIVING_SPECIES_RELEASE_GATES.gates.find((candidate) => (
    candidate.speciesId === speciesId
  ));
  const report = gate === undefined ? null : auditLivingSpeciesReleaseGate(gate);
  const module = livingSpeciesModule(speciesId);
  const runtimePolicy = coreEcologySpeciesRuntimePolicy(speciesId);
  const ownsRuntimeCapability = (
    capability: CoreEcologySpeciesRuntimeCapability,
  ): boolean => runtimePolicy?.capabilities.includes(capability) === true;
  const criterion = (name: LivingSpeciesReleaseCriterion) => (
    gate?.criteria.find((state) => state.criterion === name)
  );
  const active = (name: LivingSpeciesReleaseCriterion): boolean => (
    criterion(name)?.status === "active"
  );
  const hasOwner = (name: LivingSpeciesReleaseCriterion, ownerId: string): boolean => (
    criterion(name)?.evidenceOwnerIds.includes(ownerId) === true
  );
  const evidenceAuthenticated = gate !== undefined
    && report?.evidenceAuthenticated === true;

  const speciesProfileReady = module !== null
    && runtimePolicy !== null
    && active("species-profile")
    && active("ecological-niche")
    && module.profile.implementation === "active"
    && module.profile.taxonomicClass === "mammal"
    && [
      "aquatic-forager",
      "aquatic-predator",
      "forager",
      "predator",
      "scavenger",
      "small-predator",
    ].every((ecologicalClass) => module.profile.ecologicalClasses.includes(ecologicalClass))
    && runtimePolicy.speciesId === speciesId;
  const individualRepresentationReady = module !== null
    && runtimePolicy !== null
    && module.identity.implementation === "active"
    && module.identity.form === "individual"
    && module.identity.stableIdNamespace === "OTTER"
    && module.population.implementation === "active"
    && module.population.authoritativeUnit === "hybrid"
    && module.population.materialization === "mixed"
    && module.population.maxMaterializedPerRegion === 1
    && module.population.coarseSimulation
    && runtimePolicy.actorAddressable
    && runtimePolicy.identityForm === "individual"
    && runtimePolicy.maximumMaterializedActors === 1
    && runtimePolicy.presentationModel === "individual"
    && module.social.group.status === "unimplemented"
    && !module.social.group.stableIdentity
    && runtimePolicy.groupStableIdNamespace === null;
  const habitatPlacementReady = module !== null
    && active("habitat-placement")
    && module.habitat.implementation === "active"
    && module.habitat.ownerId === "game:core-ecology-habitat:v7"
    && module.habitat.migrationModel === "none";
  const boundedActivityReady = module !== null
    && runtimePolicy !== null
    && active("neutral-behavior")
    && active("player-independent-scenario")
    && module.activity.implementation === "active"
    && module.activity.ownerId === "game:core-ecology-activity:v1"
    && module.activity.circadian.status === "active"
    && [
      "aquatic-foraging",
      "shore-water-relocation",
      "surface-diving",
    ].every((signal) => runtimePolicy.activitySignals.includes(signal))
    && ([
      "aquatic-foraging",
      "shore-water-activity",
      "tidal-activity",
      "water-depth-response",
    ] as const).every(ownsRuntimeCapability);
  const amphibiousLocomotionReady = module !== null
    && runtimePolicy !== null
    && active("locomotion")
    && module.locomotion.implementation === "active"
    && module.locomotion.ownerId === "game:core-wildlife-locomotion-profile:v1"
    && module.locomotion.crossRegion === false
    && ["deep-water", "land", "shallow-water"].every((medium) => (
      module.locomotion.media.some((entry) => entry.medium === medium)
    ))
    && ["bound", "dive", "swim", "trot"].every((verb) => (
      module.locomotion.movementVerbs.includes(verb)
    ))
    && ([
      "amphibious-locomotion",
      "aquatic-locomotion",
      "water-depth-response",
    ] as const).every(ownsRuntimeCapability)
    && !runtimePolicy.capabilities.includes("aerial-locomotion");
  const lawfulPerceptionReady = module !== null
    && runtimePolicy !== null
    && criterion("perception-senses")?.status === "foundation"
    && hasOwner("perception-senses", "game:core-ecology-perception:v1")
    && module.senses.implementation === "foundation"
    && module.senses.ownerId === "game:living-actor-senses:v1"
    && ([
      "food-investigation",
      "movement-memory",
      "live-prey-pursuit",
    ] as const).every(ownsRuntimeCapability);
  const topKMaterializationReady = module !== null
    && active("population-materialization")
    && hasOwner("population-materialization", "test:core-ecology-spatial-top-k:v1")
    && module.population.implementation === "active"
    && module.population.maxMaterializedPerRegion === 1
    && module.population.coarseSimulation;
  const saveMigrationReady = module !== null
    && active("save-load")
    && hasOwner("save-load", "game:runtime-save:v15")
    && hasOwner("save-load", "test:alpha21-save-migration:v1")
    && module.persistence.implementation === "active"
    && module.persistence.generationMigration === "preserve-materialized-identity";
  const individualPresentationReady = module !== null
    && runtimePolicy !== null
    && runtimePolicy.presentationModel === "individual"
    && module.about.implementation === "active"
    && module.about.ownerId === "game:wildlife-about:v1"
    && [
      "appearance",
      "about-disclosure",
      "knowledge-honesty",
      "accessibility",
      "mobile-parity",
    ].every((name) => active(name as LivingSpeciesReleaseCriterion))
    && hasOwner("mobile-parity", "test:alpha21-chart-relief-presentation:v1");
  const forbiddenInteractionVerbs = new Set(["attack", "capture", "consume", "kill"]);
  const aquaticTarget = module?.interactions.targets.find(({ targetClass }) => (
    targetClass === "aquatic-animal"
  ));
  const smallerPreyTarget = module?.interactions.targets.find(({ targetClass }) => (
    targetClass === "smaller-prey"
  ));
  const nonlethalInteractionsReady = module !== null
    && active("human-interaction")
    && active("dog-interaction")
    && active("other-species-interaction")
    && module.interactions.targets.length === LIVING_SPECIES_INTERACTION_TARGET_CLASSES.length
    && module.interactions.targets.every((target, index) => (
      target.targetClass === LIVING_SPECIES_INTERACTION_TARGET_CLASSES[index]
      && (target.policy === "available" || target.policy === "intentional-no-response")
      && target.verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ))
    && aquaticTarget?.verbs.includes("dive") === true
    && aquaticTarget.escalationConstraints.includes("nonlethal-pressure-only")
    && smallerPreyTarget?.verbs.length === 1
    && smallerPreyTarget.verbs[0] === "pursue"
    && smallerPreyTarget.escalationConstraints.includes("bounded-pursuit")
    && smallerPreyTarget.escalationConstraints.includes("direct-perception-required");
  const boundedLocalContinuityReady = module !== null
    && active("full-coarse-transition")
    && criterion("seamless-region-crossing")?.status === "unimplemented"
    && module.spatial.signedRegions
    && module.spatial.extremeRegions
    && module.locomotion.crossRegion === false;
  const performanceEvidenceReady = active("performance-budget")
    && hasOwner("performance-budget", "test:core-ecology-spatial-top-k:v1");
  const representativeEmergenceReady = active("player-independent-scenario")
    && hasOwner("player-independent-scenario", "test:alpha21-shore-water-response:v1")
    && boundedActivityReady
    && amphibiousLocomotionReady
    && lawfulPerceptionReady
    && nonlethalInteractionsReady;
  const sameSpeciesTarget = module?.interactions.targets.find(({ targetClass }) => (
    targetClass === "same-species"
  ));
  const excludedClaimIntegrityReady = module !== null
    && runtimePolicy !== null
    && criterion("sound")?.status === "unimplemented"
    && criterion("environmental-evidence")?.status === "unimplemented"
    && criterion("same-species-interaction")?.status === "unimplemented"
    && criterion("food-web")?.status === "foundation"
    && module.sound.implementation === "unimplemented"
    && module.sound.repertoire.length === 0
    && module.evidence.status === "unimplemented"
    && module.evidence.produces.length === 0
    && runtimePolicy.evidenceKinds.length === 0
    && module.lifeHistory.mortality === "unimplemented"
    && module.lifeHistory.reproduction === "unimplemented"
    && module.health.implementation === "unimplemented"
    && module.health.causalDeath === false
    && module.aftermath.implementation === "unimplemented"
    && module.aftermath.carcassModel === "none"
    && module.social.group.status === "unimplemented"
    && module.social.territory.model === "none"
    && module.habitat.migrationModel === "none"
    && module.locomotion.crossRegion === false
    && module.environment.weather.status === "unimplemented"
    && module.environment.water.status === "unimplemented"
    && module.environment.tide.status === "unimplemented"
    && sameSpeciesTarget?.policy === "intentional-no-response"
    && module.interactions.targets.every(({ verbs }) => (
      verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ));

  const capabilities: readonly (
    readonly [Alpha21RiverOtterBoundedCapability, boolean]
  )[] = [
    ["species-profile", speciesProfileReady],
    ["individual-representation", individualRepresentationReady],
    ["habitat-placement", habitatPlacementReady],
    ["bounded-activity", boundedActivityReady],
    ["amphibious-locomotion", amphibiousLocomotionReady],
    ["lawful-perception", lawfulPerceptionReady],
    ["top-k-materialization", topKMaterializationReady],
    ["save-migration", saveMigrationReady],
    ["individual-presentation", individualPresentationReady],
    ["nonlethal-interactions", nonlethalInteractionsReady],
    ["bounded-local-continuity", boundedLocalContinuityReady],
    ["performance-budget", performanceEvidenceReady],
    ["representative-emergence", representativeEmergenceReady],
    ["excluded-claim-integrity", excludedClaimIntegrityReady],
  ];
  const blockingCapabilities = capabilities
    .filter(([, ready]) => !ready)
    .map(([capability]) => capability);
  const evidenceOwnerIds = gate === undefined
    ? []
    : [...new Set(gate.criteria.flatMap(({ evidenceOwnerIds: values }) => values))]
      .sort(compareText);
  const publicationRecordsReady = evidenceAuthenticated
    && active("tutorial-truth")
    && active("patch-note-truth");
  const exactTestedDeploymentVerified = evidenceAuthenticated
    && active("exact-tested-deployment");
  const boundedCandidateReady = evidenceAuthenticated
    && blockingCapabilities.length === 0;

  return deepFreeze({
    version: ALPHA21_RIVER_OTTER_BOUNDED_READINESS_VERSION,
    unitId: "alpha21-north-american-river-otter",
    scope: "one-bounded-amphibious-individual",
    speciesIds: [...ALPHA21_RIVER_OTTER_SPECIES],
    evidenceAuthenticated,
    speciesProfileReady,
    individualRepresentationReady,
    habitatPlacementReady,
    boundedActivityReady,
    amphibiousLocomotionReady,
    lawfulPerceptionReady,
    topKMaterializationReady,
    saveMigrationReady,
    individualPresentationReady,
    nonlethalInteractionsReady,
    boundedLocalContinuityReady,
    performanceEvidenceReady,
    representativeEmergenceReady,
    excludedClaimIntegrityReady,
    boundedCandidateReady,
    blockingCapabilities,
    evidenceOwnerIds,
    publicationRecordsReady,
    exactTestedDeploymentVerified,
    published: boundedCandidateReady
      && publicationRecordsReady
      && exactTestedDeploymentVerified,
    fullThirtyCriterionReady: report?.publicReady === true,
    excludedClaims: [...ALPHA21_RIVER_OTTER_EXCLUDED_CLAIMS],
  });
}

export const ALPHA21_RIVER_OTTER_BOUNDED_READINESS =
  alpha21RiverOtterBoundedReadiness();

/**
 * Source-only integration witness for the Alpha-22 tidal convergence. It
 * authenticates the already-landed bounded slices, then checks that their
 * shared policy, activity-affordance, perception, and conservation seams are
 * coherent. It deliberately cannot authorize publication, a live build,
 * worldwide ecology, or completion of Wave C / Directive 04_1.
 */
export function alpha22TidalConvergenceSourceCandidateReadiness():
Alpha22TidalConvergenceSourceCandidateReadinessReport {
  const tidalTable = waveCTidalTableBoundedReadiness();
  const blackDuck = alpha20AmericanBlackDuckBoundedReadiness();
  const riverOtter = alpha21RiverOtterBoundedReadiness();
  const candidateSpecies = new Set<string>(ALPHA22_TIDAL_CONVERGENCE_SPECIES);
  const candidateGates = ALPHA22_TIDAL_CONVERGENCE_SPECIES.map((speciesId) => (
    LIVING_SPECIES_RELEASE_GATES.gates.find((gate) => gate.speciesId === speciesId) ?? null
  ));
  const candidateModules = ALPHA22_TIDAL_CONVERGENCE_SPECIES.map(livingSpeciesModule);
  const historicalSliceEvidenceReady = [
    tidalTable.evidenceAuthenticated && tidalTable.boundedCandidateReady,
    blackDuck.evidenceAuthenticated && blackDuck.boundedCandidateReady,
    riverOtter.evidenceAuthenticated && riverOtter.boundedCandidateReady,
  ].every(Boolean);
  const evidenceAuthenticated = historicalSliceEvidenceReady
    && candidateGates.every((gate) => (
      gate !== null && auditLivingSpeciesReleaseGate(gate)?.evidenceAuthenticated === true
    ));

  const runtimePolicyErrors = validateCoreEcologySpeciesRuntimePolicies(
    LIVING_SPECIES_CATALOG,
  );
  const activityAffordanceErrors = validateCoreEcologyActivityAffordances();
  const activityCatalogCoherenceReady =
    CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.every((profile) => {
      const module = livingSpeciesModule(profile.speciesId);
      if (
        module === null
        || module.activity.ownerId !== CORE_ECOLOGY_ACTIVITY_OWNER_ID
        || module.activity.decisionModel !== "individual"
      ) return false;
      const media = new Set(module.locomotion.media.map(({ medium }) => medium));
      return profile.allowedTravelMedia.every((medium) => (
        medium === "air"
          ? media.has("air")
          : medium === "surface-water"
            ? media.has("shallow-water") || media.has("deep-water")
            : media.has("land")
              && (media.has("shallow-water") || media.has("deep-water"))
      ));
    });
  const registryCoherenceReady = runtimePolicyErrors.length === 0
    && activityAffordanceErrors.length === 0
    && activityCatalogCoherenceReady
    && new Set(ALPHA22_TIDAL_CONVERGENCE_SPECIES).size
      === ALPHA22_TIDAL_CONVERGENCE_SPECIES.length
    && candidateModules.every((module) => module !== null)
    && CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.every(({ ownerId }) => (
      ownerId === CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID
    ));

  const activityProfileSpecies = CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES
    .map(({ speciesId }) => speciesId);
  const activityProfileSpeciesSet = new Set<string>(activityProfileSpecies);
  const diurnalPolicySpecies = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES
    .filter(({ capabilities }) => capabilities.includes("diurnal-activity"))
    .map(({ speciesId }) => speciesId);
  const reusableActivityArchetypesReady = activityAffordanceErrors.length === 0
    && CORE_ECOLOGY_ACTIVITY_ARCHETYPES.length > 1
    && CORE_ECOLOGY_ACTIVITY_ARCHETYPES.every(({ archetypeId }) => (
      CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.some((profile) => (
        profile.archetypeId === archetypeId
      ))
    ))
    && activityProfileSpecies.length === CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES.length
    && activityProfileSpecies.every((speciesId, index) => (
      speciesId === CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES[index]
    ))
    && diurnalPolicySpecies.length === activityProfileSpecies.length
    && diurnalPolicySpecies.every((speciesId) => activityProfileSpeciesSet.has(speciesId))
    && CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.every(({ scheduleScope }) => (
      scheduleScope === "bounded-diurnal-window"
    ));

  const surfaceProfiles = CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.filter(
    ({ observationAffordance }) => observationAffordance.kind === "current-anonymous-area",
  );
  const surfacePolicies = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES.filter(
    ({ capabilities }) => capabilities.includes("surface-opportunity"),
  );
  const surfaceProfileSpecies = surfaceProfiles
    .map(({ speciesId }) => speciesId)
    .sort(compareText);
  const surfacePolicySpecies = surfacePolicies
    .map(({ speciesId }) => speciesId)
    .sort(compareText);
  const requiredSurfaceCapabilities = [
    "actor-address",
    "surface-opportunity",
    "tidal-activity",
  ] as const satisfies readonly CoreEcologySpeciesRuntimeCapability[];
  const supportsAerialObservationWithoutAquaticClaims = surfaceProfiles.some((profile) => {
    const policy = coreEcologySpeciesRuntimePolicy(profile.speciesId);
    return profile.locomotionClass === "aerial"
      && profile.allowedTravelMedia.length === 1
      && profile.allowedTravelMedia[0] === "air"
      && policy !== null
      && !policy.capabilities.includes("amphibious-locomotion")
      && !policy.capabilities.includes("aquatic-foraging")
      && !policy.capabilities.includes("aquatic-locomotion")
      && !policy.capabilities.includes("wading");
  });
  const capabilityDrivenSurfaceObservationReady = surfaceProfiles.length > 0
    && surfaceProfileSpecies.length === surfacePolicySpecies.length
    && surfaceProfileSpecies.every((speciesId, index) => (
      speciesId === surfacePolicySpecies[index]
    ))
    && surfaceProfiles.every((profile) => {
      const policy = coreEcologySpeciesRuntimePolicy(profile.speciesId);
      const perceptionState = LIVING_SPECIES_RELEASE_GATES.gates
        .find(({ speciesId }) => speciesId === profile.speciesId)
        ?.criteria.find(({ criterion }) => criterion === "perception-senses");
      const observation = profile.observationAffordance;
      return candidateSpecies.has(profile.speciesId)
        && policy !== null
        && requiredSurfaceCapabilities.every((capability) => (
          profile.requiredCapabilities.includes(capability)
          && policy.capabilities.includes(capability)
        ))
        && observation.kind === "current-anonymous-area"
        && observation.channel === "vision"
        && observation.perceivedClass === "aquatic-activity"
        && observation.subjectIdentity === "anonymous"
        && observation.freshness === "same-tick"
        && observation.requiresLineOfSight
        && (perceptionState?.status === "active" || perceptionState?.status === "foundation")
        && perceptionState.evidenceOwnerIds.includes("game:core-ecology-perception:v1");
    })
    && supportsAerialObservationWithoutAquaticClaims;

  const representativeTravelMedia = new Set(
    surfaceProfiles.flatMap(({ allowedTravelMedia }) => allowedTravelMedia),
  );
  const representativeEmergenceReady = historicalSliceEvidenceReady
    && reusableActivityArchetypesReady
    && capabilityDrivenSurfaceObservationReady
    && ["air", "surface-water", "amphibious"].every((medium) => (
      representativeTravelMedia.has(medium as "air" | "surface-water" | "amphibious")
    ))
    && candidateGates.every((gate) => (
      gate?.criteria.find(({ criterion }) => criterion === "player-independent-scenario")
        ?.status === "active"
    ));

  // The matching build-owned witness perturbs profiles, observations, motion,
  // coordinate signs, and input order through these shared boundaries. This
  // remains one abstraction fuzz, not a species-pair behavior matrix.
  const boundedAbstractionFuzzReady = registryCoherenceReady
    && reusableActivityArchetypesReady
    && capabilityDrivenSurfaceObservationReady
    && representativeEmergenceReady
    && surfaceProfiles.some(({ speciesId, locomotionClass, allowedTravelMedia }) => (
      speciesId === "gull"
      && locomotionClass === "aerial"
      && allowedTravelMedia.length === 1
      && allowedTravelMedia[0] === "air"
    ));

  const performanceEvidenceReady = tidalTable.performanceEvidenceReady
    && blackDuck.performanceEvidenceReady
    && riverOtter.performanceEvidenceReady
    && boundedAbstractionFuzzReady
    && candidateGates.every((gate) => {
      const state = gate?.criteria.find(({ criterion }) => criterion === "performance-budget");
      return state?.status === "active" || state?.status === "foundation";
    });

  const activityModules = CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES
    .map(({ speciesId }) => livingSpeciesModule(speciesId));
  const surfaceAquaticTargets = surfaceProfiles.flatMap(({ speciesId }) => {
    const target = livingSpeciesModule(speciesId)?.interactions.targets.find((candidate) => (
      candidate.targetClass === "aquatic-animal" && candidate.policy === "available"
    ));
    return target === undefined ? [] : [target];
  });
  const candidateAquaticTargets = candidateModules.flatMap((module) => {
    const target = module?.interactions.targets.find((candidate) => (
      candidate.targetClass === "aquatic-animal" && candidate.policy === "available"
    ));
    return target === undefined ? [] : [target];
  });
  const forbiddenInteractionVerbs = new Set(["attack", "capture", "consume", "kill"]);
  const resourceConservationReady = historicalSliceEvidenceReady
    && boundedAbstractionFuzzReady
    && activityModules.every((module) => {
    const food = module?.interactions.targets.find(({ targetClass }) => targetClass === "food");
    return food?.policy === "available"
      && food.escalationConstraints.includes("physical-resource-conservation");
  })
    && candidateAquaticTargets.length > 0
    && candidateAquaticTargets.every(({ escalationConstraints, verbs }) => (
      escalationConstraints.includes("aggregate-unit-conservation")
      && escalationConstraints.includes("direct-perception-required")
      && escalationConstraints.includes("nonlethal-pressure-only")
      && verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ))
    && surfaceAquaticTargets.length > 0
    && surfaceAquaticTargets.every(({ escalationConstraints }) => (
      escalationConstraints.includes("no-health-or-mortality-outcome")
    ));

  const excludedClaimIntegrityReady = candidateModules.every((module) => (
    module !== null
    && module.lifeHistory.mortality === "unimplemented"
    && module.lifeHistory.reproduction === "unimplemented"
    && module.health.causalDeath === false
    && module.aftermath.implementation === "unimplemented"
    && module.aftermath.carcassModel === "none"
    && module.habitat.migrationModel === "none"
    && module.locomotion.crossRegion === false
    && module.sound.implementation === "unimplemented"
    && module.interactions.targets.every(({ verbs }) => (
      verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ))
  ))
    && CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.every(({ scheduleScope }) => (
      scheduleScope === "bounded-diurnal-window"
    ))
    && surfaceProfiles.every(({ observationAffordance }) => (
      observationAffordance.kind === "current-anonymous-area"
      && observationAffordance.channel === "vision"
    ));

  const capabilities: readonly (
    readonly [Alpha22TidalConvergenceSourceCapability, boolean]
  )[] = [
    ["historical-slice-evidence", historicalSliceEvidenceReady],
    ["registry-coherence", registryCoherenceReady],
    ["reusable-activity-archetypes", reusableActivityArchetypesReady],
    ["capability-driven-surface-observation", capabilityDrivenSurfaceObservationReady],
    ["representative-emergence", representativeEmergenceReady],
    ["bounded-abstraction-fuzz", boundedAbstractionFuzzReady],
    ["performance-budget", performanceEvidenceReady],
    ["resource-conservation", resourceConservationReady],
    ["excluded-claim-integrity", excludedClaimIntegrityReady],
  ];
  const blockingCapabilities = capabilities
    .filter(([, ready]) => !ready)
    .map(([capability]) => capability);
  const evidenceOwnerIds = [...new Set([
    ...tidalTable.roles.flatMap(({ evidenceOwnerIds: values }) => values),
    ...blackDuck.evidenceOwnerIds,
    ...riverOtter.evidenceOwnerIds,
    CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID,
    CORE_ECOLOGY_SPECIES_RUNTIME_POLICY_OWNER_ID,
    "game:core-ecology-perception:v1",
    "test:alpha22-tidal-convergence-source-candidate:v1",
    "test:alpha22-tidal-convergence-abstraction-fuzz:v1",
    "test:alpha22-tidal-convergence-performance:v1",
    "test:core-ecology-tidal-table-performance:v1",
    "test:core-ecology-waterfowl-performance:v1",
    "test:runtime-core-ecology-physical-provision-conservation:v1",
  ])].sort(compareText);
  const sourceCandidateReady = evidenceAuthenticated && blockingCapabilities.length === 0;

  return deepFreeze({
    version: ALPHA22_TIDAL_CONVERGENCE_SOURCE_CANDIDATE_VERSION,
    unitId: "alpha22-tidal-convergence",
    scope: "bounded-starting-harbor-wave-c-integration",
    speciesIds: [...ALPHA22_TIDAL_CONVERGENCE_SPECIES],
    evidenceAuthenticated,
    historicalSliceEvidenceReady,
    registryCoherenceReady,
    reusableActivityArchetypesReady,
    capabilityDrivenSurfaceObservationReady,
    representativeEmergenceReady,
    boundedAbstractionFuzzReady,
    performanceEvidenceReady,
    resourceConservationReady,
    excludedClaimIntegrityReady,
    sourceCandidateReady,
    blockingCapabilities,
    evidenceOwnerIds,
    publicationRecordsReady: false,
    exactTestedDeploymentVerified: false,
    liveVerified: false,
    published: false,
    fullThirtyCriterionReady: false,
    fullWaveCReady: false,
    fullDirective041Ready: false,
    excludedClaims: [...ALPHA22_TIDAL_CONVERGENCE_EXCLUDED_CLAIMS],
  });
}

export const ALPHA22_TIDAL_CONVERGENCE_SOURCE_CANDIDATE_READINESS =
  alpha22TidalConvergenceSourceCandidateReadiness();

/**
 * Authenticated source witness for Alpha-24's one bounded settlement flock.
 * The witness follows broad interaction classes and shared runtime
 * capabilities, so adding another species does not add a species-pair matrix.
 * Settlement custody owns the home/caretaker relationship and physical store;
 * it does not become a second chicken cognition, movement, or inventory owner.
 */
export function alpha24DomesticChickenBoundedReadiness():
Alpha24DomesticChickenBoundedReadinessReport {
  const speciesId = ALPHA24_DOMESTIC_CHICKEN_SPECIES[0];
  const gate = LIVING_SPECIES_RELEASE_GATES.gates.find((candidate) => (
    candidate.speciesId === speciesId
  ));
  const report = gate === undefined ? null : auditLivingSpeciesReleaseGate(gate);
  const module = livingSpeciesModule(speciesId);
  const runtimePolicy = coreEcologySpeciesRuntimePolicy(speciesId);
  const criterion = (name: LivingSpeciesReleaseCriterion) => (
    gate?.criteria.find((state) => state.criterion === name)
  );
  const active = (name: LivingSpeciesReleaseCriterion): boolean => (
    criterion(name)?.status === "active"
  );
  const hasOwner = (name: LivingSpeciesReleaseCriterion, ownerId: string): boolean => (
    criterion(name)?.evidenceOwnerIds.includes(ownerId) === true
  );
  const ownsRuntimeCapability = (
    capability: CoreEcologySpeciesRuntimeCapability,
  ): boolean => runtimePolicy?.capabilities.includes(capability) === true;
  const evidenceAuthenticated = gate !== undefined
    && report?.evidenceAuthenticated === true;
  const sharedInvariantOwner = "test:alpha24-domestic-chicken-shared-invariants:v1";
  const performanceOwner = "test:alpha24-domestic-chicken-performance:v1";

  const requiredEcologicalClasses = [
    "alarm-source",
    "domestic-livestock",
    "forager",
    "omnivore",
    "prey",
    "small-prey",
  ] as const;
  const requiredRuntimeCapabilities = [
    "actor-address",
    "food-investigation",
    "group-coordination",
    "shared-alarm",
  ] as const satisfies readonly CoreEcologySpeciesRuntimeCapability[];
  const speciesProfileReady = module !== null
    && runtimePolicy !== null
    && active("species-profile")
    && active("ecological-niche")
    && module.profile.implementation === "active"
    && module.profile.taxonomicClass === "bird"
    && requiredEcologicalClasses.every((ecologicalClass) => (
      module.profile.ecologicalClasses.includes(ecologicalClass)
    ))
    && runtimePolicy.speciesId === speciesId
    && runtimePolicy.representation === "individual"
    && runtimePolicy.locomotionClass === "terrestrial"
    && runtimePolicy.capabilities.length === requiredRuntimeCapabilities.length
    && requiredRuntimeCapabilities.every(ownsRuntimeCapability);

  const individualFlockRepresentationReady = module !== null
    && runtimePolicy !== null
    && module.identity.implementation === "active"
    && module.identity.form === "individual"
    && module.identity.stableIdNamespace === "CHICKEN"
    && module.population.implementation === "active"
    && module.population.authoritativeUnit === "hybrid"
    && module.population.materialization === "mixed"
    && module.population.maxMaterializedPerRegion === 3
    && module.population.coarseSimulation
    && runtimePolicy.actorAddressable
    && runtimePolicy.identityForm === "individual"
    && runtimePolicy.maximumMaterializedActors === 3
    && runtimePolicy.presentationModel === "visible-flock"
    && runtimePolicy.aggregate === null
    && runtimePolicy.groupOrganization === "flock"
    && runtimePolicy.groupStableIdNamespace === "CHICKEN-FLOCK"
    && module.social.group.status === "active"
    && module.social.group.stableIdentity
    && module.social.group.stableIdNamespace === "CHICKEN-FLOCK"
    && module.social.group.membership;

  const domesticCustodyReady = module !== null
    && active("ecological-niche")
    && active("habitat-placement")
    && active("save-load")
    && hasOwner("ecological-niche", "game:settlement-ecology:v2")
    && hasOwner("habitat-placement", "game:settlement-ecology:v2")
    && hasOwner("save-load", "game:settlement-ecology:v2")
    && hasOwner("player-independent-scenario", "game:settlement-ecology:v2")
    && module.habitat.placementInputs.includes("domestic-animal-anchor")
    && ["settlement-edge", "storehouse-yard"].every((habitatClass) => (
      module.habitat.habitatClasses.includes(habitatClass)
    ))
    // Custody is external social/home authority, not learned animal identity,
    // a territorial AI, or an inventory silently mirroring the physical store.
    && !module.social.actorToActorRelationships
    && module.social.relationshipAxes.length === 0
    && module.social.territory.model === "none"
    && module.about.learnedFields.length === 0
    && module.inventory.implementation === "unimplemented"
    && !module.inventory.acceptsCustody;

  const habitatPlacementReady = module !== null
    && active("habitat-placement")
    && module.habitat.implementation === "active"
    && module.habitat.ownerId === "game:core-ecology-habitat:v8"
    && module.habitat.migrationModel === "none"
    && hasOwner("habitat-placement", "game:runtime-core-ecology:v1")
    && hasOwner("habitat-placement", sharedInvariantOwner);

  const boundedActivityReady = module !== null
    && runtimePolicy !== null
    && active("neutral-behavior")
    && active("player-independent-scenario")
    && module.activity.implementation === "active"
    && module.activity.ownerId === "game:core-wildlife-actor:v1"
    && module.activity.decisionModel === "individual"
    && module.activity.offscreenModel === "individual"
    && module.activity.circadian.status === "unimplemented"
    && runtimePolicy.activitySignals.length === 1
    && runtimePolicy.activitySignals[0] === "shared-alarm"
    && ownsRuntimeCapability("food-investigation")
    && ownsRuntimeCapability("shared-alarm")
    && !ownsRuntimeCapability("diurnal-activity");

  const locomotionMedia = module === null
    ? []
    : module.locomotion.media.map(({ medium }) => medium);
  const terrestrialLocomotionReady = module !== null
    && runtimePolicy !== null
    && active("locomotion")
    && module.locomotion.implementation === "active"
    && module.locomotion.ownerId === "game:core-wildlife-locomotion-profile:v1"
    && module.locomotion.decisionModel === "individual"
    && !module.locomotion.crossRegion
    && locomotionMedia.length === 2
    && locomotionMedia.includes("land")
    && locomotionMedia.includes("shallow-water")
    && module.locomotion.movementVerbs.length === 2
    && module.locomotion.movementVerbs.includes("forage")
    && module.locomotion.movementVerbs.includes("walk")
    && module.locomotion.terrainAffordances.includes("land")
    && module.locomotion.terrainAffordances.includes("standable-shallow-water")
    && !ownsRuntimeCapability("aerial-locomotion")
    && !ownsRuntimeCapability("amphibious-locomotion")
    && !ownsRuntimeCapability("aquatic-locomotion")
    && !ownsRuntimeCapability("water-depth-response");

  const lawfulPerceptionReady = module !== null
    && runtimePolicy !== null
    && criterion("perception-senses")?.status === "foundation"
    && hasOwner("perception-senses", "game:core-ecology-perception:v1")
    && hasOwner("perception-senses", "sim:actor-perception:v2")
    && module.senses.implementation === "foundation"
    && module.senses.ownerId === "game:living-actor-senses:v1"
    && module.cognition.implementation === "active"
    && module.cognition.ownerId === "game:core-wildlife-actor:v1"
    && module.cognition.attentionOwnerId === "sim:actor-perception:v2"
    && module.cognition.knowledgeSources.length === 1
    && module.cognition.knowledgeSources[0] === "direct-observation"
    && !module.cognition.inference
    && ownsRuntimeCapability("actor-address")
    && ownsRuntimeCapability("food-investigation")
    && ownsRuntimeCapability("shared-alarm");

  const sameSpeciesTarget = module?.interactions.targets.find(({ targetClass }) => (
    targetClass === "same-species"
  ));
  const flockCoordinationReady = module !== null
    && runtimePolicy !== null
    && active("same-species-interaction")
    && module.social.implementation === "active"
    && module.social.ownerId === "game:core-ecology-groups:v1"
    && module.social.group.ownerId === "game:core-ecology-groups:v1"
    && module.social.group.organizationKinds.length === 1
    && module.social.group.organizationKinds[0] === "flock"
    && module.social.group.informationPropagation
    && module.social.group.separationReunion
    && module.social.group.splitMerge
    && module.social.group.sharedMemory
    && ownsRuntimeCapability("group-coordination")
    && sameSpeciesTarget?.policy === "available"
    && sameSpeciesTarget.verbs.length === 2
    && sameSpeciesTarget.verbs.includes("alarm")
    && sameSpeciesTarget.verbs.includes("coordinate")
    && sameSpeciesTarget.escalationConstraints.includes("direct-perception-required")
    && sameSpeciesTarget.escalationConstraints.includes("shared-group-required");

  const availableTargetClasses = module === null
    ? []
    : module.interactions.targets
      .filter(({ policy }) => policy === "available")
      .map(({ targetClass }) => targetClass);
  const expectedAvailableTargetClasses = [
    "dog",
    "food",
    "human",
    "predator",
    "same-species",
  ] as const;
  const forbiddenInteractionVerbs = new Set(["attack", "capture", "consume", "kill"]);
  const broadClassInteractionsReady = module !== null
    && active("human-interaction")
    && active("dog-interaction")
    && active("same-species-interaction")
    && active("other-species-interaction")
    && module.interactions.targets.length === LIVING_SPECIES_INTERACTION_TARGET_CLASSES.length
    && module.interactions.targets.every((target, index) => (
      target.targetClass === LIVING_SPECIES_INTERACTION_TARGET_CLASSES[index]
      && (target.policy === "available" || target.policy === "intentional-no-response")
      && target.verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ))
    && availableTargetClasses.length === expectedAvailableTargetClasses.length
    && expectedAvailableTargetClasses.every((targetClass, index) => (
      availableTargetClasses[index] === targetClass
    ));

  const foodTarget = module?.interactions.targets.find(({ targetClass }) => (
    targetClass === "food"
  ));
  const physicalFoodConservationReady = module !== null
    && runtimePolicy !== null
    && criterion("food-web")?.status === "foundation"
    && hasOwner("food-web", "game:settlement-ecology:v2")
    && hasOwner("food-web", sharedInvariantOwner)
    && hasOwner("player-independent-scenario", sharedInvariantOwner)
    && module.diet.implementation === "foundation"
    && module.diet.requiresPhysicalResource
    && module.diet.resources.some(({ resourceClass, role }) => (
      resourceClass === "exposed-food" && role === "nutrition"
    ))
    && ownsRuntimeCapability("food-investigation")
    && foodTarget?.policy === "available"
    && foodTarget.verbs.length === 1
    && foodTarget.verbs[0] === "forage"
    && foodTarget.escalationConstraints.includes("direct-confirmation")
    && foodTarget.escalationConstraints.includes("physical-resource-conservation")
    && module.inventory.implementation === "unimplemented"
    && module.inventory.model === "none"
    && !module.inventory.acceptsCustody
    && !module.inventory.conservationRequired;

  const saveMigrationReady = module !== null
    && active("save-load")
    && hasOwner("save-load", "game:core-ecology:v4")
    && hasOwner("save-load", "game:runtime-save:v17")
    && hasOwner("save-load", "game:settlement-ecology:v2")
    && hasOwner("save-load", sharedInvariantOwner)
    && module.persistence.implementation === "active"
    && module.persistence.generationMigration === "preserve-materialized-identity";

  const knowledgeHonestPresentationReady = module !== null
    && runtimePolicy !== null
    && runtimePolicy.presentationModel === "visible-flock"
    && module.about.implementation === "active"
    && module.about.ownerId === "game:wildlife-about:v1"
    && module.about.directObservationRequired
    && module.about.learnedFields.length === 0
    && [
      "appearance",
      "about-disclosure",
      "knowledge-honesty",
      "accessibility",
      "mobile-parity",
    ].every((name) => active(name as LivingSpeciesReleaseCriterion))
    && hasOwner("mobile-parity", sharedInvariantOwner);

  const boundedLocalContinuityReady = module !== null
    && active("population-materialization")
    && active("full-coarse-transition")
    && active("save-load")
    && criterion("seamless-region-crossing")?.status === "unimplemented"
    && module.population.maxMaterializedPerRegion === 3
    && module.population.coarseSimulation
    && module.spatial.signedRegions
    && module.spatial.extremeRegions
    && module.social.group.stableIdentity
    && !module.locomotion.crossRegion;

  const sharedInvariantCoverageReady = module !== null
    && validateCoreEcologySpeciesRuntimePolicies(LIVING_SPECIES_CATALOG).length === 0
    && active("fuzz-testing")
    && hasOwner("fuzz-testing", sharedInvariantOwner)
    && hasOwner("population-materialization", sharedInvariantOwner)
    && hasOwner("full-coarse-transition", sharedInvariantOwner)
    && broadClassInteractionsReady
    && physicalFoodConservationReady
    && individualFlockRepresentationReady;

  const performanceEvidenceReady = active("performance-budget")
    && hasOwner("performance-budget", performanceOwner);

  const ownerCoherent = (status: string, ownerId: string | null): boolean => (
    status === "unimplemented"
      ? ownerId === null
      : (status === "active" || status === "foundation")
        && typeof ownerId === "string"
        && ownerId.length > 0
  );
  const ownerCoherenceReady = module !== null
    && [
      [module.profile.implementation, module.profile.ownerId],
      [module.morphology.implementation, module.morphology.ownerId],
      [module.habitat.implementation, module.habitat.ownerId],
      [module.identity.implementation, module.identity.ownerId],
      [module.spatial.implementation, module.spatial.ownerId],
      [module.population.implementation, module.population.ownerId],
      [module.senses.implementation, module.senses.ownerId],
      [module.physiology.implementation, module.physiology.ownerId],
      [module.locomotion.implementation, module.locomotion.ownerId],
      [module.diet.implementation, module.diet.ownerId],
      [module.foodWeb.implementation, module.foodWeb.ownerId],
      [module.lifeHistory.implementation, module.lifeHistory.ownerId],
      [module.health.implementation, module.health.ownerId],
      [module.activity.implementation, module.activity.ownerId],
      [module.social.implementation, module.social.ownerId],
      [module.social.group.status, module.social.group.ownerId],
      [module.sound.implementation, module.sound.ownerId],
      [module.cognition.implementation, module.cognition.ownerId],
      [module.evidence.status, module.evidence.ownerId],
      [module.aftermath.implementation, module.aftermath.ownerId],
      [module.interactions.implementation, module.interactions.ownerId],
      [module.inventory.implementation, module.inventory.ownerId],
      [module.about.implementation, module.about.ownerId],
      [module.persistence.implementation, module.persistence.ownerId],
      [module.activity.circadian.status, module.activity.circadian.ownerId],
      [module.environment.fire.status, module.environment.fire.ownerId],
      [module.environment.livingCover.status, module.environment.livingCover.ownerId],
      [module.environment.weather.status, module.environment.weather.ownerId],
      [module.environment.water.status, module.environment.water.ownerId],
      [module.environment.possibility.status, module.environment.possibility.ownerId],
      [module.environment.terrain.status, module.environment.terrain.ownerId],
      [module.environment.tide.status, module.environment.tide.ownerId],
    ].every(([status, ownerId]) => ownerCoherent(status as string, ownerId as string | null))
    && module.profile.ownerId === "sim:core-wildlife-identity:v1"
    && module.habitat.ownerId === "game:core-ecology-habitat:v8"
    && module.population.ownerId === "game:core-wildlife-actor:v1"
    && module.locomotion.ownerId === "game:core-wildlife-locomotion-profile:v1"
    && module.social.ownerId === "game:core-ecology-groups:v1"
    && module.activity.ownerId === "game:core-wildlife-actor:v1"
    && module.cognition.ownerId === "game:core-wildlife-actor:v1"
    && module.interactions.ownerId === "game:core-wildlife-actor:v1"
    && module.persistence.ownerId === "game:core-wildlife-actor:v1"
    && hasOwner("ecological-niche", "game:settlement-ecology:v2")
    && hasOwner("player-independent-scenario", "game:settlement-ecology:v2");

  const smallerPreyTarget = module?.interactions.targets.find(({ targetClass }) => (
    targetClass === "smaller-prey"
  ));
  const livestockTarget = module?.interactions.targets.find(({ targetClass }) => (
    targetClass === "livestock"
  ));
  const excludedClaimIntegrityReady = module !== null
    && runtimePolicy !== null
    && criterion("sound")?.status === "unimplemented"
    && criterion("environmental-evidence")?.status === "unimplemented"
    && criterion("seamless-region-crossing")?.status === "unimplemented"
    && module.sound.implementation === "unimplemented"
    && module.sound.repertoire.length === 0
    && module.sound.communicationSignals.length === 0
    && module.evidence.status === "unimplemented"
    && module.evidence.produces.length === 0
    && runtimePolicy.evidenceKinds.length === 0
    && module.health.implementation === "foundation"
    && module.health.vitalityAxis === "health"
    && module.health.injuryAxis === null
    && !module.health.incapacitation
    && !module.health.causalDeath
    && !module.health.recovery
    && module.lifeHistory.mortality === "unimplemented"
    && module.lifeHistory.reproduction === "unimplemented"
    && !module.lifeHistory.dynamicAging
    && module.aftermath.implementation === "unimplemented"
    && module.aftermath.carcassModel === "none"
    && module.activity.circadian.status === "unimplemented"
    && module.social.territory.model === "none"
    && !module.social.actorToActorRelationships
    && module.habitat.migrationModel === "none"
    && !module.locomotion.crossRegion
    && module.environment.fire.status === "unimplemented"
    && module.environment.weather.status === "unimplemented"
    && module.environment.water.status === "unimplemented"
    && module.environment.tide.status === "unimplemented"
    && smallerPreyTarget?.policy === "intentional-no-response"
    && livestockTarget?.policy === "intentional-no-response"
    && !module.diet.resources.some(({ resourceClass }) => resourceClass === "live-prey")
    && !ownsRuntimeCapability("live-prey-pursuit")
    && !ownsRuntimeCapability("diurnal-activity")
    && module.interactions.targets.every(({ verbs }) => (
      verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ));

  const capabilities: readonly (
    readonly [Alpha24DomesticChickenBoundedCapability, boolean]
  )[] = [
    ["species-profile", speciesProfileReady],
    ["individual-flock-representation", individualFlockRepresentationReady],
    ["domestic-custody", domesticCustodyReady],
    ["habitat-placement", habitatPlacementReady],
    ["bounded-activity", boundedActivityReady],
    ["terrestrial-locomotion", terrestrialLocomotionReady],
    ["lawful-perception", lawfulPerceptionReady],
    ["flock-coordination", flockCoordinationReady],
    ["broad-class-interactions", broadClassInteractionsReady],
    ["physical-food-conservation", physicalFoodConservationReady],
    ["save-migration", saveMigrationReady],
    ["knowledge-honest-presentation", knowledgeHonestPresentationReady],
    ["bounded-local-continuity", boundedLocalContinuityReady],
    ["shared-invariant-coverage", sharedInvariantCoverageReady],
    ["performance-budget", performanceEvidenceReady],
    ["owner-coherence", ownerCoherenceReady],
    ["excluded-claim-integrity", excludedClaimIntegrityReady],
  ];
  const blockingCapabilities = capabilities
    .filter(([, ready]) => !ready)
    .map(([capability]) => capability);
  const evidenceOwnerIds = gate === undefined
    ? []
    : [...new Set(gate.criteria.flatMap(({ evidenceOwnerIds: values }) => values))]
      .sort(compareText);
  const publicationRecordsReady = evidenceAuthenticated
    && active("tutorial-truth")
    && active("patch-note-truth");
  const exactTestedDeploymentVerified = evidenceAuthenticated
    && active("exact-tested-deployment");
  const boundedCandidateReady = evidenceAuthenticated
    && blockingCapabilities.length === 0;

  return deepFreeze({
    version: ALPHA24_DOMESTIC_CHICKEN_BOUNDED_READINESS_VERSION,
    unitId: "alpha24-domestic-chicken",
    scope: "one-bounded-settlement-flock",
    speciesIds: [...ALPHA24_DOMESTIC_CHICKEN_SPECIES],
    evidenceAuthenticated,
    speciesProfileReady,
    individualFlockRepresentationReady,
    domesticCustodyReady,
    habitatPlacementReady,
    boundedActivityReady,
    terrestrialLocomotionReady,
    lawfulPerceptionReady,
    flockCoordinationReady,
    broadClassInteractionsReady,
    physicalFoodConservationReady,
    saveMigrationReady,
    knowledgeHonestPresentationReady,
    boundedLocalContinuityReady,
    sharedInvariantCoverageReady,
    performanceEvidenceReady,
    ownerCoherenceReady,
    excludedClaimIntegrityReady,
    boundedCandidateReady,
    blockingCapabilities,
    evidenceOwnerIds,
    publicationRecordsReady,
    exactTestedDeploymentVerified,
    published: boundedCandidateReady
      && publicationRecordsReady
      && exactTestedDeploymentVerified,
    fullThirtyCriterionReady: report?.publicReady === true,
    excludedClaims: [...ALPHA24_DOMESTIC_CHICKEN_EXCLUDED_CLAIMS],
  });
}

export const ALPHA24_DOMESTIC_CHICKEN_BOUNDED_READINESS =
  alpha24DomesticChickenBoundedReadiness();

/**
 * Source-authenticated Alpha-25 witness for one existing flock and one new
 * two-member herd. It verifies shared properties and owner boundaries, never
 * chicken×goat or livestock×wildlife pair permutations.
 */
export function alpha25SharedDomesticLivestockReadiness():
Alpha25SharedDomesticLivestockReadinessReport {
  const chickenId = ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES[0];
  const goatId = ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES[1];
  const chicken = livingSpeciesModule(chickenId);
  const goat = livingSpeciesModule(goatId);
  const chickenPolicy = coreEcologySpeciesRuntimePolicy(chickenId);
  const goatPolicy = coreEcologySpeciesRuntimePolicy(goatId);
  const chickenGate = LIVING_SPECIES_RELEASE_GATES.gates.find(({ speciesId }) => (
    speciesId === chickenId
  ));
  const goatGate = LIVING_SPECIES_RELEASE_GATES.gates.find(({ speciesId }) => (
    speciesId === goatId
  ));
  const chickenReport = chickenGate === undefined
    ? null
    : auditLivingSpeciesReleaseGate(chickenGate);
  const goatReport = goatGate === undefined
    ? null
    : auditLivingSpeciesReleaseGate(goatGate);
  const goatCriterion = (name: LivingSpeciesReleaseCriterion) => (
    goatGate?.criteria.find(({ criterion }) => criterion === name)
  );
  const goatActive = (name: LivingSpeciesReleaseCriterion): boolean => (
    goatCriterion(name)?.status === "active"
  );
  const goatHasOwner = (name: LivingSpeciesReleaseCriterion, ownerId: string): boolean => (
    goatCriterion(name)?.evidenceOwnerIds.includes(ownerId) === true
  );
  const hasCapability = (
    policy: typeof chickenPolicy,
    capability: CoreEcologySpeciesRuntimeCapability,
  ): boolean => policy?.capabilities.includes(capability) === true;
  const sharedInvariantOwner = "test:alpha25-shared-domestic-livestock-invariants:v1";
  const performanceOwner = "test:alpha25-shared-domestic-livestock-performance:v1";
  const resourceBoundaryOwner = "game:core-wildlife-resource-claim-arbitration:v1";
  const evidenceAuthenticated = chickenReport?.evidenceAuthenticated === true
    && goatReport?.evidenceAuthenticated === true;

  const historicalChickenBaselineReady =
    ALPHA24_DOMESTIC_CHICKEN_BOUNDED_READINESS.boundedCandidateReady;

  const speciesProfilesReady = chicken !== null
    && goat !== null
    && chickenPolicy !== null
    && goatPolicy !== null
    && goatActive("species-profile")
    && goatActive("ecological-niche")
    && chicken.profile.implementation === "active"
    && goat.profile.implementation === "active"
    && chicken.profile.taxonomicClass === "bird"
    && goat.profile.taxonomicClass === "mammal"
    && [chicken, goat].every((module) => (
      module.profile.ecologicalClasses.includes("alarm-source")
      && module.profile.ecologicalClasses.includes("domestic-livestock")
      && module.profile.ecologicalClasses.includes("forager")
      && module.profile.ecologicalClasses.includes("prey")
    ))
    && chickenPolicy.representation === "individual"
    && goatPolicy.representation === "individual"
    && chickenPolicy.locomotionClass === "terrestrial"
    && goatPolicy.locomotionClass === "terrestrial";

  const boundedIndividualRepresentationsReady = chicken !== null
    && goat !== null
    && chickenPolicy !== null
    && goatPolicy !== null
    && chicken.identity.form === "individual"
    && goat.identity.form === "individual"
    && chicken.identity.stableIdNamespace === "CHICKEN"
    && goat.identity.stableIdNamespace === "GOAT"
    && chicken.population.materialization === "mixed"
    && goat.population.materialization === "mixed"
    && chicken.population.coarseSimulation
    && goat.population.coarseSimulation
    && chickenPolicy.actorAddressable
    && goatPolicy.actorAddressable
    && chickenPolicy.aggregate === null
    && goatPolicy.aggregate === null;

  const exactGoatPairReady = goat !== null
    && goatPolicy !== null
    && goat.population.maxMaterializedPerRegion === 2
    && goatPolicy.maximumMaterializedActors === 2
    && goatPolicy.presentationModel === "individual";

  const pluralDomesticCustodyReady = chicken !== null
    && goat !== null
    && historicalChickenBaselineReady
    && goatActive("ecological-niche")
    && goatActive("habitat-placement")
    && goatActive("save-load")
    && goatHasOwner("ecological-niche", "game:settlement-ecology:v3")
    && goatHasOwner("habitat-placement", "game:settlement-ecology:v3")
    && goatHasOwner("save-load", "game:settlement-ecology:v3")
    && goatHasOwner("player-independent-scenario", "game:settlement-ecology:v3")
    && goatHasOwner("fuzz-testing", sharedInvariantOwner)
    && [chicken, goat].every((module) => (
      module.habitat.placementInputs.includes("domestic-animal-anchor")
    ));

  const typedHomeStructuresReady = pluralDomesticCustodyReady
    && chicken !== null
    && goat !== null
    && chicken.habitat.habitatClasses.includes("storehouse-yard")
    && goat.habitat.habitatClasses.includes("livestock-pen")
    && chicken.habitat.habitatClasses.includes("settlement-edge")
    && goat.habitat.habitatClasses.includes("settlement-edge");

  const separatedHabitatPlacementReady = chicken !== null
    && goat !== null
    && goatActive("habitat-placement")
    && chicken.habitat.ownerId === "game:core-ecology-habitat:v8"
    && goat.habitat.ownerId === "game:core-ecology-habitat:v9"
    && goatHasOwner("habitat-placement", "game:core-ecology-habitat:v9")
    && goatHasOwner("habitat-placement", sharedInvariantOwner);

  const groupModuleReady = (
    module: NonNullable<typeof chicken>,
    organization: "flock" | "herd",
    namespace: "CHICKEN-FLOCK" | "HERD",
  ): boolean => module.social.implementation === "active"
    && module.social.ownerId === "game:core-ecology-groups:v1"
    && module.social.group.status === "active"
    && module.social.group.ownerId === "game:core-ecology-groups:v1"
    && module.social.group.organizationKinds.length === 1
    && module.social.group.organizationKinds[0] === organization
    && module.social.group.stableIdentity
    && module.social.group.stableIdNamespace === namespace
    && module.social.group.membership
    && module.social.group.informationPropagation
    && module.social.group.separationReunion;
  const sharedGroupAbstractionReady = chicken !== null
    && goat !== null
    && chickenPolicy !== null
    && goatPolicy !== null
    && goatActive("same-species-interaction")
    && groupModuleReady(chicken, "flock", "CHICKEN-FLOCK")
    && groupModuleReady(goat, "herd", "HERD")
    && hasCapability(chickenPolicy, "group-coordination")
    && hasCapability(goatPolicy, "group-coordination")
    && hasCapability(chickenPolicy, "shared-alarm")
    && hasCapability(goatPolicy, "shared-alarm");

  const lawfulPerceptionReady = chicken !== null
    && goat !== null
    && chickenPolicy !== null
    && goatPolicy !== null
    && goatCriterion("perception-senses")?.status === "foundation"
    && goatHasOwner("perception-senses", "game:core-ecology-perception:v1")
    && goatHasOwner("perception-senses", "sim:actor-perception:v2")
    && [chicken, goat].every((module) => (
      module.senses.implementation === "foundation"
      && module.senses.ownerId === "game:living-actor-senses:v1"
      && module.cognition.implementation === "active"
      && module.cognition.ownerId === "game:core-wildlife-actor:v1"
      && module.cognition.attentionOwnerId === "sim:actor-perception:v2"
      && module.cognition.knowledgeSources.length === 1
      && module.cognition.knowledgeSources[0] === "direct-observation"
      && !module.cognition.inference
    ))
    && hasCapability(chickenPolicy, "actor-address")
    && hasCapability(goatPolicy, "actor-address");

  const terrestrialModuleReady = (
    module: NonNullable<typeof chicken>,
  ): boolean => module.locomotion.implementation === "active"
    && module.locomotion.ownerId === "game:core-wildlife-locomotion-profile:v1"
    && module.locomotion.decisionModel === "individual"
    && !module.locomotion.crossRegion
    && module.locomotion.media.some(({ medium }) => medium === "land")
    && module.locomotion.media.some(({ medium }) => medium === "shallow-water")
    && module.locomotion.movementVerbs.includes("walk")
    && module.locomotion.terrainAffordances.includes("land")
    && module.locomotion.terrainAffordances.includes("standable-shallow-water");
  const sharedTerrestrialLocomotionReady = chicken !== null
    && goat !== null
    && chickenPolicy !== null
    && goatPolicy !== null
    && goatActive("locomotion")
    && terrestrialModuleReady(chicken)
    && terrestrialModuleReady(goat)
    && chickenPolicy.locomotionClass === "terrestrial"
    && goatPolicy.locomotionClass === "terrestrial"
    && !hasCapability(goatPolicy, "aerial-locomotion")
    && !hasCapability(goatPolicy, "amphibious-locomotion")
    && !hasCapability(goatPolicy, "aquatic-locomotion");

  const forbiddenInteractionVerbs = new Set(["attack", "capture", "consume", "kill"]);
  const broadInteractionModuleReady = (
    module: NonNullable<typeof chicken>,
  ): boolean => module.interactions.targets.length
      === LIVING_SPECIES_INTERACTION_TARGET_CLASSES.length
    && module.interactions.targets.every((target, index) => (
      target.targetClass === LIVING_SPECIES_INTERACTION_TARGET_CLASSES[index]
      && (target.policy === "available" || target.policy === "intentional-no-response")
      && target.verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ))
    && ["dog", "human", "predator", "same-species"].every((targetClass) => (
      module.interactions.targets.find((target) => target.targetClass === targetClass)
        ?.policy === "available"
    ));
  const broadClassInteractionsReady = chicken !== null
    && goat !== null
    && [
      "human-interaction",
      "dog-interaction",
      "same-species-interaction",
      "other-species-interaction",
    ].every((name) => goatActive(name as LivingSpeciesReleaseCriterion))
    && broadInteractionModuleReady(chicken)
    && broadInteractionModuleReady(goat);

  const physicalResourceBoundaryReady = chicken !== null
    && goat !== null
    && chickenPolicy !== null
    && goatPolicy !== null
    && hasCapability(chickenPolicy, "food-investigation")
    && chicken.diet.resources.some(({ resourceClass }) => resourceClass === "exposed-food")
    && !hasCapability(goatPolicy, "food-investigation")
    && goat.diet.resources.some(({ resourceClass }) => resourceClass === "browse")
    && !goat.diet.resources.some(({ resourceClass }) => resourceClass === "exposed-food")
    && goatHasOwner("food-web", resourceBoundaryOwner)
    && goatHasOwner("food-web", sharedInvariantOwner)
    && [chicken, goat].every((module) => (
      module.inventory.implementation === "unimplemented"
      && module.inventory.model === "none"
      && !module.inventory.acceptsCustody
      && !module.inventory.conservationRequired
    ));

  const saveMigrationReady = chicken !== null
    && goat !== null
    && historicalChickenBaselineReady
    && goatActive("save-load")
    && goatHasOwner("save-load", "game:core-ecology:v4")
    && goatHasOwner("save-load", "game:runtime-save:v18")
    && goatHasOwner("save-load", "game:settlement-ecology:v3")
    && goatHasOwner("save-load", sharedInvariantOwner)
    && chicken.persistence.generationMigration === "preserve-materialized-identity"
    && goat.persistence.generationMigration === "preserve-materialized-identity";

  const knowledgeHonestPresentationReady = chicken !== null
    && goat !== null
    && chickenPolicy !== null
    && goatPolicy !== null
    && [
      "appearance",
      "about-disclosure",
      "knowledge-honesty",
      "accessibility",
      "mobile-parity",
    ].every((name) => goatActive(name as LivingSpeciesReleaseCriterion))
    && [chicken, goat].every((module) => (
      module.about.implementation === "active"
      && module.about.ownerId === "game:wildlife-about:v1"
      && module.about.directObservationRequired
      && module.about.learnedFields.length === 0
    ))
    && chickenPolicy.presentationModel === "visible-flock"
    && goatPolicy.presentationModel === "individual"
    && goatHasOwner("mobile-parity", sharedInvariantOwner);

  const boundedLocalContinuityReady = chicken !== null
    && goat !== null
    && goatActive("population-materialization")
    && goatActive("full-coarse-transition")
    && goatActive("save-load")
    && goatCriterion("seamless-region-crossing")?.status === "unimplemented"
    && [chicken, goat].every((module) => (
      module.population.coarseSimulation
      && module.spatial.signedRegions
      && module.spatial.extremeRegions
      && module.social.group.stableIdentity
      && !module.locomotion.crossRegion
    ));

  const sharedInvariantCoverageReady = validateCoreEcologySpeciesRuntimePolicies(
    LIVING_SPECIES_CATALOG,
  ).length === 0
    && goatActive("fuzz-testing")
    && goatHasOwner("fuzz-testing", sharedInvariantOwner)
    && goatHasOwner("population-materialization", sharedInvariantOwner)
    && goatHasOwner("full-coarse-transition", sharedInvariantOwner)
    && pluralDomesticCustodyReady
    && sharedGroupAbstractionReady
    && broadClassInteractionsReady
    && physicalResourceBoundaryReady;

  const performanceEvidenceReady = historicalChickenBaselineReady
    && goatActive("performance-budget")
    && goatHasOwner("performance-budget", performanceOwner);

  const ownerCoherent = (status: string, ownerId: string | null): boolean => (
    status === "unimplemented"
      ? ownerId === null
      : (status === "active" || status === "foundation")
        && typeof ownerId === "string"
        && ownerId.length > 0
  );
  const moduleOwnersCoherent = (module: NonNullable<typeof chicken>): boolean => [
    [module.profile.implementation, module.profile.ownerId],
    [module.habitat.implementation, module.habitat.ownerId],
    [module.identity.implementation, module.identity.ownerId],
    [module.population.implementation, module.population.ownerId],
    [module.senses.implementation, module.senses.ownerId],
    [module.locomotion.implementation, module.locomotion.ownerId],
    [module.activity.implementation, module.activity.ownerId],
    [module.social.implementation, module.social.ownerId],
    [module.social.group.status, module.social.group.ownerId],
    [module.sound.implementation, module.sound.ownerId],
    [module.cognition.implementation, module.cognition.ownerId],
    [module.evidence.status, module.evidence.ownerId],
    [module.aftermath.implementation, module.aftermath.ownerId],
    [module.interactions.implementation, module.interactions.ownerId],
    [module.inventory.implementation, module.inventory.ownerId],
    [module.about.implementation, module.about.ownerId],
    [module.persistence.implementation, module.persistence.ownerId],
  ].every(([status, ownerId]) => ownerCoherent(status as string, ownerId as string | null));
  const ownerCoherenceReady = chicken !== null
    && goat !== null
    && moduleOwnersCoherent(chicken)
    && moduleOwnersCoherent(goat)
    && chicken.population.ownerId === "game:core-wildlife-actor:v1"
    && goat.population.ownerId === "game:core-wildlife-actor:v1"
    && chicken.social.ownerId === "game:core-ecology-groups:v1"
    && goat.social.ownerId === "game:core-ecology-groups:v1"
    && chicken.locomotion.ownerId === "game:core-wildlife-locomotion-profile:v1"
    && goat.locomotion.ownerId === "game:core-wildlife-locomotion-profile:v1"
    && goatHasOwner("ecological-niche", "game:settlement-ecology:v3")
    && goatHasOwner("player-independent-scenario", "game:settlement-ecology:v3");

  const excludedModuleReady = (module: NonNullable<typeof chicken>): boolean => (
    module.sound.implementation === "unimplemented"
    && module.sound.repertoire.length === 0
    && module.evidence.status === "unimplemented"
    && module.evidence.produces.length === 0
    && module.health.implementation === "foundation"
    && module.health.injuryAxis === null
    && !module.health.incapacitation
    && !module.health.causalDeath
    && !module.health.recovery
    && module.lifeHistory.mortality === "unimplemented"
    && module.lifeHistory.reproduction === "unimplemented"
    && !module.lifeHistory.dynamicAging
    && module.aftermath.implementation === "unimplemented"
    && module.aftermath.carcassModel === "none"
    && module.activity.circadian.status === "unimplemented"
    && module.social.territory.model === "none"
    && !module.social.actorToActorRelationships
    && module.habitat.migrationModel === "none"
    && !module.locomotion.crossRegion
    && module.environment.livingCover.status === "unimplemented"
    && module.environment.weather.status === "unimplemented"
    && module.environment.water.status === "unimplemented"
    && module.interactions.targets.every(({ verbs }) => (
      verbs.every((verb) => !forbiddenInteractionVerbs.has(verb))
    ))
  );
  const excludedClaimIntegrityReady = chicken !== null
    && goat !== null
    && goatPolicy !== null
    && goatCriterion("sound")?.status === "unimplemented"
    && goatCriterion("environmental-evidence")?.status === "unimplemented"
    && goatCriterion("seamless-region-crossing")?.status === "unimplemented"
    && excludedModuleReady(chicken)
    && excludedModuleReady(goat)
    && !hasCapability(goatPolicy, "food-investigation")
    && !hasCapability(goatPolicy, "live-prey-pursuit")
    && !hasCapability(goatPolicy, "diurnal-activity")
    && !goat.diet.resources.some(({ resourceClass }) => (
      resourceClass === "exposed-food" || resourceClass === "live-prey"
    ));

  const exactBoundedPopulationReady = boundedIndividualRepresentationsReady
    && exactGoatPairReady;
  const pluralCustodyAndHomesReady = pluralDomesticCustodyReady
    && typedHomeStructuresReady;
  const habitatSeparationReady = separatedHabitatPlacementReady;
  const sharedActorAbstractionsReady = sharedGroupAbstractionReady
    && lawfulPerceptionReady
    && sharedTerrestrialLocomotionReady;
  const persistenceAndPresentationReady = saveMigrationReady
    && knowledgeHonestPresentationReady
    && boundedLocalContinuityReady
    && ownerCoherenceReady;

  const capabilities: readonly (
    readonly [Alpha25SharedDomesticLivestockCapability, boolean]
  )[] = [
    ["historical-chicken-baseline", historicalChickenBaselineReady],
    ["species-profiles", speciesProfilesReady],
    ["exact-bounded-population", exactBoundedPopulationReady],
    ["plural-custody-and-homes", pluralCustodyAndHomesReady],
    ["habitat-separation", habitatSeparationReady],
    ["shared-actor-abstractions", sharedActorAbstractionsReady],
    ["broad-class-interactions", broadClassInteractionsReady],
    ["physical-resource-boundary", physicalResourceBoundaryReady],
    ["persistence-and-presentation", persistenceAndPresentationReady],
    ["shared-invariant-coverage", sharedInvariantCoverageReady],
    ["performance-budget", performanceEvidenceReady],
    ["excluded-claim-integrity", excludedClaimIntegrityReady],
  ];
  const blockingCapabilities = capabilities
    .filter(([, ready]) => !ready)
    .map(([capability]) => capability);
  const evidenceOwnerIds = [...new Set([
    ...(chickenGate?.criteria.flatMap(({ evidenceOwnerIds: values }) => values) ?? []),
    ...(goatGate?.criteria.flatMap(({ evidenceOwnerIds: values }) => values) ?? []),
    resourceBoundaryOwner,
    "test:alpha25-shared-domestic-livestock-source-candidate:v1",
  ])].sort(compareText);
  const boundedCandidateReady = evidenceAuthenticated
    && blockingCapabilities.length === 0;

  return deepFreeze({
    version: ALPHA25_SHARED_DOMESTIC_LIVESTOCK_READINESS_VERSION,
    unitId: "alpha25-shared-domestic-livestock",
    scope: "bounded-settlement-flock-and-herd",
    speciesIds: [...ALPHA25_SHARED_DOMESTIC_LIVESTOCK_SPECIES],
    evidenceAuthenticated,
    historicalChickenBaselineReady,
    speciesProfilesReady,
    exactBoundedPopulationReady,
    pluralCustodyAndHomesReady,
    habitatSeparationReady,
    sharedActorAbstractionsReady,
    broadClassInteractionsReady,
    physicalResourceBoundaryReady,
    persistenceAndPresentationReady,
    sharedInvariantCoverageReady,
    performanceEvidenceReady,
    excludedClaimIntegrityReady,
    boundedCandidateReady,
    blockingCapabilities,
    evidenceOwnerIds,
    publicationRecordsReady: false,
    exactTestedDeploymentVerified: false,
    liveVerified: false,
    published: false,
    fullThirtyCriterionReady: false,
    fullWaveDReady: false,
    fullDirective041Ready: false,
    excludedClaims: [...ALPHA25_SHARED_DOMESTIC_LIVESTOCK_EXCLUDED_CLAIMS],
  });
}

export const ALPHA25_SHARED_DOMESTIC_LIVESTOCK_READINESS =
  alpha25SharedDomesticLivestockReadiness();

function canonicalCriterionState(
  value: unknown,
  expectedCriterion: LivingSpeciesReleaseCriterion,
): LivingSpeciesReleaseCriterionState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "criterion",
    "evidenceOwnerIds",
    "notApplicable",
    "status",
  ])) return null;
  if (
    value.criterion !== expectedCriterion
    || !STATUS.has(value.status as string)
    || !canonicalStringSet(value.evidenceOwnerIds, MAX_RELEASE_EVIDENCE_OWNERS, evidenceOwnerId)
  ) return null;
  if (value.status === "active" || value.status === "foundation") {
    if (value.evidenceOwnerIds.length === 0 || value.notApplicable !== null) return null;
  } else if (value.status === "unimplemented") {
    if (value.evidenceOwnerIds.length !== 0 || value.notApplicable !== null) return null;
  } else {
    if (value.evidenceOwnerIds.length !== 0 || !validNotApplicable(value.notApplicable, expectedCriterion)) return null;
  }
  return deepFreeze({
    criterion: expectedCriterion,
    status: value.status as LivingSpeciesReleaseStatus,
    evidenceOwnerIds: [...value.evidenceOwnerIds],
    notApplicable: value.notApplicable === null
      ? null
      : {
          reason: value.notApplicable.reason,
          ecologyOwnerId: value.notApplicable.ecologyOwnerId,
        },
  });
}

function validNotApplicable(value: unknown, criterion: LivingSpeciesReleaseCriterion): value is LivingSpeciesNotApplicableEvidence {
  if (!plainRecord(value) || !exactKeys(value, ["ecologyOwnerId", "reason"])) return false;
  const allowed = NOT_APPLICABLE_REASONS[criterion];
  return allowed !== undefined
    && allowed.includes(value.reason as LivingSpeciesNotApplicableReason)
    && evidenceOwnerId(value.ecologyOwnerId);
}

function canonicalStringSet(
  value: unknown,
  maximum: number,
  predicate: (entry: unknown) => entry is string,
): value is readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  let prior = "";
  for (const entry of value) {
    if (!predicate(entry) || (prior !== "" && prior >= entry)) return false;
    prior = entry;
  }
  return true;
}

function evidenceOwnerId(value: unknown): value is string {
  return canonicalId(value, 96) && value.includes(":v");
}

function canonicalId(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && value === value.trim()
    && ID_PATTERN.test(value);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
      && leftKeys.every((key, index) => key === rightKeys[index] && sameData(left[key], right[key]));
  }
  return false;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
