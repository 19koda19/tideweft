import {
  LIVING_SPECIES_CATALOG,
  LIVING_SPECIES_CATALOG_VERSION,
  LIVING_SPECIES_INTERACTION_TARGET_CLASSES,
  livingSpeciesModule,
} from "./livingSpeciesCatalog";
import {
  coreEcologySpeciesRuntimePolicy,
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
