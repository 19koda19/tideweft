import { createActorObservation, type ActorObservation } from "../sim/actorPerception";
import {
  CORE_WILDLIFE_SPECIES,
  getCoreWildlifeProfile,
  getCoreWildlifeSpeciesMetadata,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import type { RootSeed } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  isRegionCoord,
  regionLocalToGlobalTile,
  type RegionCoord,
} from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_WILDLIFE_EVENT_VERSION,
  advanceCoreWildlifeActorCoarse,
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
  type CoreWildlifeActionAccessibility,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
  type CoreWildlifeFoodOpportunity,
  type CoreWildlifeNeutralActivityPreference,
  type CoreWildlifeRegroupOpportunity,
  type CoreWildlifeResourceClaim,
} from "./coreWildlifeActor";
import {
  CORE_ECOLOGY_GROUP_COHESION_RECOVERY,
  CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS,
  bridgeCoreEcologyGroupDormantCycles,
  canonicalizeCoreEcologyGroup,
  canonicalizeCoreEcologyGroupSet,
  coreEcologyGroupComponentForMember,
  createCoreEcologyGroupSet,
  emitCoreEcologyGroupSignal,
  reconcileCoreEcologyGroupAnchors,
  stepCoreEcologyGroupCoarse,
  stepCoreEcologyGroupSignalCadence,
  type CoreEcologyPlayerAbsentDisturbance,
  type CoreEcologyGroupSet,
  type CoreEcologyGroupState,
  type CoreEcologyGroupTransitionEvent,
} from "./coreEcologyGroups";
import {
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_VERSION,
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION,
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION,
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_VERSION,
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_VERSION,
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION,
  CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION,
  canonicalizeCoreEcologyDomesticPenHabitatAssemblage,
  canonicalizeCoreEcologyDomesticYardHabitatAssemblage,
  canonicalizeCoreEcologyHabitatAssemblage,
  canonicalizeCoreEcologyHarborEdgeHabitatAssemblage,
  canonicalizeCoreEcologyMarshEdgeHabitatAssemblage,
  canonicalizeCoreEcologyRainChorusHabitatAssemblage,
  canonicalizeCoreEcologyRegionalPredatorHabitatAssemblage,
  canonicalizeCoreEcologyRegionalUplandHabitatAssemblage,
  canonicalizeCoreEcologyTidalTableHabitatAssemblage,
  canonicalizeCoreEcologyTidalWebHabitatAssemblage,
  canonicalizeCoreEcologyWaterfowlHabitatAssemblage,
  type CoreEcologyDomesticPenHabitatAssemblage,
  type CoreEcologyDomesticYardHabitatAssemblage,
  type CoreEcologyHabitatAssemblage,
  type CoreEcologyHarborEdgeActivitySignal,
  type CoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatPopulationAnalysis,
  type CoreEcologyMarshEdgeHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
  type CoreEcologyRegionalUplandHabitatAssemblage,
  type CoreEcologyTidalTableHabitatAssemblage,
  type CoreEcologyTidalWebHabitatAssemblage,
  type CoreEcologyWaterfowlHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  canonicalizeCoreEcologyAlpineHabitat,
  type CoreEcologyAlpineHabitat,
} from "./coreEcologyAlpineHabitat";
import {
  coreEcologyAggregateSpeciesPolicy,
  isCoreEcologyAggregateSpecies,
  resolveCoreEcologyAggregateActivityIntensity,
  resolveCoreEcologyAggregateDisturbanceActivity,
  type CoreEcologyAggregateActivityKind,
  type CoreEcologyAggregateActivePeriod,
  type CoreEcologyAggregateSpecies,
} from "./coreEcologyAggregatePolicy";
import {
  CORE_ECOLOGY_DOMESTIC_SPECIES,
  CORE_ECOLOGY_REGIONAL_HABITAT_CATALOG_SPECIES_COUNT,
  CORE_ECOLOGY_REGIONAL_HABITAT_OWNER_ID,
  CORE_ECOLOGY_REGIONAL_HABITAT_VERSION,
  CORE_ECOLOGY_REGIONAL_WILD_SPECIES,
  coreEcologyRegionalGuildForSpecies,
  type CoreEcologyRegionalGuild,
  type CoreEcologyRegionalHabitat,
  type CoreEcologyRegionalPopulationCandidate,
} from "./coreEcologyRegionalHabitat";
import {
  coreEcologySpeciesPredatorContact,
  coreEcologySpeciesPhysicalBodyResourceUnits,
  coreEcologySpeciesPhysicalBodySizeUnits,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import { coreEcologyCanResolveMortalityTarget } from "./coreEcologyTrophic";
import {
  canonicalizeCoreEcologyMortalityTransaction,
  createCoreEcologyMortalityTransaction,
  type CoreEcologyMortalityTransaction,
} from "./coreEcologyMortality";
import {
  canonicalizeCoreWildlifeCarcass,
  createCoreWildlifeCarcass,
  releaseCoreWildlifeCarcass,
  type CoreWildlifeCarcass,
} from "./coreWildlifeCarcass";
import {
  canonicalizeCoreWildlifeMortalityEvent,
  resolveCoreWildlifePredatorContact,
  type CoreWildlifeMortalityResult,
} from "./coreWildlifeMortality";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_PATCH_VERSION = 3 as const;
export const CORE_ECOLOGY_AGGREGATE_PATCH_VERSION = 5 as const;
export const LEGACY_CORE_ECOLOGY_AGGREGATE_PATCH_VERSION = 4 as const;
export const TIDAL_LEGACY_CORE_ECOLOGY_AGGREGATE_PATCH_VERSION = 3 as const;
export const LEGACY_CORE_ECOLOGY_PATCH_VERSION = 2 as const;
export const FOUNDATION_LEGACY_CORE_ECOLOGY_PATCH_VERSION = 1 as const;
export const CORE_ECOLOGY_MAX_POPULATIONS = 18 as const;
export const CORE_ECOLOGY_MAX_MEMBERS = 48 as const;
export const CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS = 24 as const;
export const CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS = 4 as const;
export const CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS = 4 as const;
export const CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE = 24 as const;
export const CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES = 16 as const;
export const CORE_ECOLOGY_MAX_MORTALITY_TRANSACTIONS = 256 as const;
/** Published Tide Table cadence; shared with v3 adoption so processed edges cannot replay. */
export const CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS = 4 as const;
export const CORE_ECOLOGY_MAX_STEP_TICKS = 64 as const;
export const CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES = 16 * 1_024 * 1_024;
export const CORE_ECOLOGY_AGGREGATE_EVIDENCE_VERSION = 1 as const;

/**
 * Canonical patches are recursively frozen before they leave this module.
 * Remembering those exact object identities lets trusted runtime transitions
 * cross the public validation boundary repeatedly without reparsing the same
 * immutable habitat, actors, groups, and evidence on every lookup.
 */
const CANONICAL_AGGREGATE_PATCHES = new WeakSet<object>();

export const CORE_ECOLOGY_WAVE_A_INDIVIDUAL_SPECIES = [
  "deer",
  "gull",
  "black-bear",
] as const;
export const CORE_ECOLOGY_INDIVIDUAL_SPECIES = [
  ...CORE_ECOLOGY_WAVE_A_INDIVIDUAL_SPECIES,
  "domestic-cat",
  "marsh-rabbit",
  "marsh-fox",
  "fish-crow",
  "northern-harrier",
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
  "mountain-goat",
  "golden-eagle",
] as const;
export type CoreEcologyIndividualSpecies =
  (typeof CORE_ECOLOGY_INDIVIDUAL_SPECIES)[number];
export type { CoreEcologyAggregateSpecies } from "./coreEcologyAggregatePolicy";

export type CoreWildlifeMaterialization = "coarse" | "materialized";

export interface CoreEcologyPopulationMemberInput {
  readonly populationOrdinal: number;
  /** Aggregate population units represented by this exact active-window actor. */
  readonly representedUnits?: number;
  readonly position: WorldPosition;
  readonly heading?: number;
  readonly materialization: CoreWildlifeMaterialization;
}

export interface CoreEcologyPopulationInput {
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  readonly populationSize?: number;
  readonly members: readonly CoreEcologyPopulationMemberInput[];
}

export type CoreEcologyPatchDerivation =
  | Readonly<{ readonly kind: "bounded-input-v1" }>
  | Readonly<{
      readonly kind: "habitat-v1";
      readonly habitat: CoreEcologyHabitatAssemblage;
    }>
  | Readonly<{ readonly kind: "legacy-fixed-v1" }>;

export const CORE_ECOLOGY_REGIONAL_ADOPTION_SUPPRESSION_VERSION = 1 as const;

export interface CoreEcologyRegionalAdoptionActorSlotV1 {
  readonly baselineActorId: string;
  readonly baselinePopulationId: string;
  readonly baselineUnitOffset: number;
  readonly legacyActorId: string;
  readonly species: CoreWildlifeSpecies;
  readonly suppressedBaselineUnits: number;
}

export interface CoreEcologyRegionalAdoptionAggregateSlotV1 {
  readonly baselinePopulationId: string;
  readonly legacyAggregateId: string;
  readonly species: CoreWildlifeSpecies;
  readonly suppressedBaselineUnits: number;
}

/** Immutable substitution receipt embedded in a directly stepable regional owner. */
export interface CoreEcologyRegionalAdoptionSuppressionManifestV1 {
  readonly version: typeof CORE_ECOLOGY_REGIONAL_ADOPTION_SUPPRESSION_VERSION;
  readonly adoptionTransactionId: string;
  readonly sourcePatchHash: string;
  readonly baselineHash: string;
  readonly actorSlots: readonly CoreEcologyRegionalAdoptionActorSlotV1[];
  readonly aggregateSlots: readonly CoreEcologyRegionalAdoptionAggregateSlotV1[];
}

export interface CoreEcologySettlementHomeLegacyRetirementV1 {
  readonly legacyActorId: string;
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  readonly populationOrdinal: number;
  readonly representedUnitsBefore: number;
}

/** References legacy-owned deaths without copying their ledger or bodies. */
export interface CoreEcologySettlementHomeLegacySuppressionV1 {
  readonly version: 1;
  readonly sourcePatchHash: string;
  readonly retirements: readonly CoreEcologySettlementHomeLegacyRetirementV1[];
}

export type CoreEcologyAggregatePatchDerivation =
  | CoreEcologyPatchDerivation
  | Readonly<{
      readonly kind: "habitat-v2";
      readonly habitat: CoreEcologyHarborEdgeHabitatAssemblage;
    }>
  | Readonly<{
      /**
       * A frozen pre-habitat wildlife roster plus the authenticated harbor-edge
       * extension. The legacy actors remain authoritative; only cat and rat
       * presence is derived from the v2 habitat record.
       */
      readonly kind: "legacy-fixed-v1-with-habitat-v2";
      readonly habitat: CoreEcologyHarborEdgeHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v3";
      readonly habitat: CoreEcologyMarshEdgeHabitatAssemblage;
    }>
  | Readonly<{
      /**
       * A frozen pre-habitat wildlife roster plus the authenticated marsh-edge
       * extension. Legacy actors remain authoritative; only cat, rat, rabbit,
       * and fox presence is derived from the v3 habitat record.
       */
      readonly kind: "legacy-fixed-v1-with-habitat-v3";
      readonly habitat: CoreEcologyMarshEdgeHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v4";
      readonly habitat: CoreEcologyRainChorusHabitatAssemblage;
    }>
  | Readonly<{
      /**
       * Frozen pre-habitat actors remain authoritative while v4 contributes
       * every post-Wave-A individual and aggregate population.
       */
      readonly kind: "legacy-fixed-v1-with-habitat-v4";
      readonly habitat: CoreEcologyRainChorusHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v5";
      readonly habitat: CoreEcologyTidalTableHabitatAssemblage;
    }>
  | Readonly<{
      /** Frozen pre-habitat actors remain authoritative through the v5 extension. */
      readonly kind: "legacy-fixed-v1-with-habitat-v5";
      readonly habitat: CoreEcologyTidalTableHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v6";
      readonly habitat: CoreEcologyWaterfowlHabitatAssemblage;
    }>
  | Readonly<{
      /** Frozen pre-habitat actors remain authoritative through the v6 extension. */
      readonly kind: "legacy-fixed-v1-with-habitat-v6";
      readonly habitat: CoreEcologyWaterfowlHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v7";
      readonly habitat: CoreEcologyTidalWebHabitatAssemblage;
    }>
  | Readonly<{
      /** Frozen pre-habitat actors remain authoritative through the v7 extension. */
      readonly kind: "legacy-fixed-v1-with-habitat-v7";
      readonly habitat: CoreEcologyTidalWebHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v8";
      readonly habitat: CoreEcologyDomesticYardHabitatAssemblage;
    }>
  | Readonly<{
      /** Frozen pre-habitat actors remain authoritative through the v8 extension. */
      readonly kind: "legacy-fixed-v1-with-habitat-v8";
      readonly habitat: CoreEcologyDomesticYardHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v9";
      readonly habitat: CoreEcologyDomesticPenHabitatAssemblage;
    }>
  | Readonly<{
      /** Frozen pre-habitat actors remain authoritative through the v9 extension. */
      readonly kind: "legacy-fixed-v1-with-habitat-v9";
      readonly habitat: CoreEcologyDomesticPenHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v10";
      readonly habitat: CoreEcologyRegionalUplandHabitatAssemblage;
    }>
  | Readonly<{
      /** Frozen pre-habitat actors remain authoritative through the regional extension. */
      readonly kind: "legacy-fixed-v1-with-habitat-v10";
      readonly habitat: CoreEcologyRegionalUplandHabitatAssemblage;
    }>
  | Readonly<{
      readonly kind: "habitat-v11";
      readonly habitat: CoreEcologyRegionalPredatorHabitatAssemblage;
    }>
  | Readonly<{
      /** Frozen pre-habitat actors remain authoritative through the predator extension. */
      readonly kind: "legacy-fixed-v1-with-habitat-v11";
      readonly habitat: CoreEcologyRegionalPredatorHabitatAssemblage;
    }>
  | Readonly<{
      /** Canonical wild residents derived from one signed storage region. */
      readonly kind: "regional-habitat-v1";
      readonly habitat: CoreEcologyRegionalHabitat;
    }>
  | Readonly<{
      /** Regional baseline after exact v24 identities substitute reserved units. */
      readonly kind: "regional-habitat-v1-with-adoption-suppression";
      readonly habitat: CoreEcologyRegionalHabitat;
      readonly suppression: CoreEcologyRegionalAdoptionSuppressionManifestV1;
    }>
  | Readonly<{
      /** Settlement-owned domestic actors and storehouse rats only. */
      readonly kind: "settlement-home-v1";
      readonly habitat: CoreEcologyRegionalPredatorHabitatAssemblage;
      readonly legacySuppression?: CoreEcologySettlementHomeLegacySuppressionV1;
    }>
  | Readonly<{
      /** Append-only high-country residents owned by the Wave-F Alpine root. */
      readonly kind: "regional-alpine-v1";
      readonly habitat: CoreEcologyAlpineHabitat;
    }>
  | Readonly<{
      /**
       * Finite v24 compatibility authority after the regional-root adoption.
       * This opaque derivation is structurally canonical here; the regional
       * owner performs the strict receipt/source-state authentication.
       */
      readonly kind: "legacy-cohort-v1";
      readonly adoptionTransactionId: string;
      readonly rootSeedFingerprint: string;
      readonly sourcePatchHash: string;
    }>;

export interface CreateCoreEcologyPatchInput {
  readonly seed: RootSeed;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly tick?: number;
  readonly populations: readonly CoreEcologyPopulationInput[];
  /** Runtime worlds use habitat-v1; bounded-input-v1 is retained for pure fixtures. */
  readonly derivation?: CoreEcologyPatchDerivation;
  readonly groups?: CoreEcologyGroupSet;
}

export interface CreateCoreEcologyAggregatePatchInput {
  readonly seed: RootSeed;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly tick?: number;
  /** Rats are deliberately absent: every entry here owns full actor state. */
  readonly populations: readonly CoreEcologyPopulationInput[];
  readonly derivation: CoreEcologyAggregatePatchDerivation;
  readonly groups?: CoreEcologyGroupSet;
}

export interface CoreEcologyPopulationMemberState {
  readonly populationOrdinal: number;
  readonly representedUnits: number;
  readonly materialization: CoreWildlifeMaterialization;
  readonly actor: CoreWildlifeActorState;
}

export interface CoreEcologyPopulationState {
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  /** Immutable generated population before authenticated mortality deltas. */
  readonly baselinePopulationSize: number;
  /** Current living units, including exact bodies and anonymous reserve. */
  readonly populationSize: number;
  /** Living units intentionally not materialized as replacement bodies. */
  readonly reserveUnits: number;
  readonly members: readonly CoreEcologyPopulationMemberState[];
}

/** Bounded habitat patch; coarse members remain identified and persist dynamic state. */
export interface CoreEcologyPatchState {
  readonly version: typeof CORE_ECOLOGY_PATCH_VERSION;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly updatedAtTick: number;
  readonly derivation: CoreEcologyPatchDerivation;
  readonly groups: CoreEcologyGroupSet;
  readonly populations: readonly CoreEcologyPopulationState[];
}

export interface CoreEcologyAggregateAreaAnchor {
  readonly anchorOrdinal: number;
  readonly position: WorldPosition;
  readonly radiusUnits: number;
  readonly populationUnits: number;
}

export interface CoreEcologyAggregateActivitySignal {
  readonly kind: CoreEcologyAggregateActivityKind;
  readonly intensity: number;
  readonly activePeriod: CoreEcologyAggregateActivePeriod;
  readonly updatedAtTick: number;
  readonly source: "aggregate-state";
}

export type CoreEcologyAggregateEvidenceKind =
  | "burrow-opening"
  | "feeding-scrape"
  | "frog-track"
  | "gnaw-mark"
  | "haypile"
  | "shelter-sign"
  | "surface-dimple"
  | "talus-sign"
  | "tracks";
export type CoreEcologyAggregateEvidenceCause =
  | "animal-disturbance"
  | "food-attraction"
  | "human-disturbance"
  | "predator-pressure"
  | "population-activity"
  | "tide-pressure"
  | "weather-pressure";

/** Physical sign state; this is not itself a player observation or report. */
export interface CoreEcologyAggregateEvidence {
  readonly version: typeof CORE_ECOLOGY_AGGREGATE_EVIDENCE_VERSION;
  readonly evidenceId: string;
  readonly evidenceOrdinal: number;
  readonly kind: CoreEcologyAggregateEvidenceKind;
  readonly position: WorldPosition;
  readonly createdAtTick: number;
  readonly strength: number;
  readonly causeKind: CoreEcologyAggregateEvidenceCause;
  readonly causeReferenceId: string;
  readonly itemConsumption: "none";
  readonly disclosure: "direct-observation-required";
}

export interface CoreEcologyAggregateDisturbance {
  readonly disturbanceId: string;
  readonly disturbanceOrdinal: number;
  readonly atTick: number;
  readonly causeKind: Exclude<
    CoreEcologyAggregateEvidenceCause,
    "population-activity"
  >;
  readonly causeReferenceId: string;
  readonly fromAnchorOrdinal: number;
  readonly toAnchorOrdinal: number;
  readonly displacedUnits: number;
  readonly pressure: number;
  readonly nonlethal: true;
  readonly cargoInteraction: false;
  readonly itemConsumption: "none";
}

export interface CoreEcologyAggregatePopulationState {
  readonly aggregateId: string;
  /** Lossless seed fingerprint authenticating the stable area ID. */
  readonly seedFingerprint: string;
  readonly species: CoreEcologyAggregateSpecies;
  readonly representation: "aggregate-area" | "group-actor";
  readonly populationKey: string;
  readonly revision: number;
  readonly updatedAtTick: number;
  readonly habitatCapacity: number;
  readonly populationSize: number;
  readonly populationPressure: number;
  readonly trend: CoreEcologyHarborEdgeHabitatPopulationAnalysis["trend"];
  readonly trendSignal: number;
  readonly anchors: readonly CoreEcologyAggregateAreaAnchor[];
  readonly activitySignal: CoreEcologyAggregateActivitySignal;
  readonly evidence: readonly CoreEcologyAggregateEvidence[];
  readonly disturbances: readonly CoreEcologyAggregateDisturbance[];
  /** Durable transition clock; unlike the bounded disturbance tail it cannot be evicted. */
  readonly lastTidalRedistributionTick: number | null;
  readonly nextEvidenceOrdinal: number;
  readonly nextDisturbanceOrdinal: number;
}

export interface CoreEcologyAggregatePatchState {
  readonly version: typeof CORE_ECOLOGY_AGGREGATE_PATCH_VERSION;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly updatedAtTick: number;
  readonly derivation: CoreEcologyAggregatePatchDerivation;
  readonly groups: CoreEcologyGroupSet;
  readonly populations: readonly CoreEcologyPopulationState[];
  readonly aggregatePopulations: readonly CoreEcologyAggregatePopulationState[];
  /** Never reused: authoritative ordering for exact life-to-body transitions. */
  readonly nextMortalityOrdinal: number;
  readonly mortalityTransactions: readonly CoreEcologyMortalityTransaction[];
  /** Physical aftermath remains separate from the living actor roster. */
  readonly carcasses: readonly CoreWildlifeCarcass[];
}

export interface ApplyCoreEcologyWildlifeMortalityInput {
  readonly result: CoreWildlifeMortalityResult;
  /** Local physical temperature on the common fixed-point condition scale. */
  readonly temperature: number;
}

export interface ApplyCoreEcologyCrossOwnerWildlifeMortalityInput
  extends ApplyCoreEcologyWildlifeMortalityInput {
  /** Canonical current owner of the already-resolved event's attacker. */
  readonly attackerPatch: CoreEcologyAggregatePatchState;
}

export interface ApplyCoreEcologyWildlifeMortalityResult {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly event: CoreWildlifeMortalityResult["event"];
  readonly transaction: CoreEcologyMortalityTransaction | null;
  readonly carcass: CoreWildlifeCarcass | null;
}

export interface DisplaceCoreEcologyAggregatePopulationInput {
  readonly aggregateId: string;
  readonly atTick: number;
  readonly causeKind: Exclude<
    CoreEcologyAggregateEvidenceCause,
    "population-activity"
  >;
  readonly causeReferenceId: string;
  readonly fromAnchorOrdinal: number;
  readonly toAnchorOrdinal: number;
  readonly populationUnits: number;
  readonly pressure: number;
}

export interface DisplaceCoreEcologyAggregatePopulationResult {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly disturbance: CoreEcologyAggregateDisturbance;
  readonly evidence: CoreEcologyAggregateEvidence;
}

export interface SetCoreEcologyAggregateActivityIntensityInput {
  readonly aggregateId: string;
  /** Must equal the patch clock; this transition cannot advance simulation time. */
  readonly atTick: number;
  /** Fixed-point current observable population activity in 0..1. */
  readonly intensity: number;
}

export interface MarkCoreEcologyAggregateTidalRedistributionInput {
  readonly aggregateId: string;
  /** Must equal the patch clock; repeated marks at the same tick are idempotent. */
  readonly atTick: number;
}

export interface SetCoreEcologyMaterializationInput {
  readonly atTick: number;
  /** Exact desired materialized set; omission dematerializes while retaining state. */
  readonly actorIds: readonly string[];
}

export interface CoreEcologyActorStepInput {
  readonly actorId: string;
  readonly observations: readonly ActorObservation[];
  readonly foodOpportunities: readonly CoreWildlifeFoodOpportunity[];
  readonly accessibility: CoreWildlifeActionAccessibility;
  readonly neutralActivityPreference?: CoreWildlifeNeutralActivityPreference;
  readonly regroupOpportunity?: CoreWildlifeRegroupOpportunity;
}

export interface CoreEcologyPatchStepInput {
  readonly tick: number;
  /** Exactly one input per currently materialized actor. */
  readonly actorSteps: readonly CoreEcologyActorStepInput[];
}

export interface AdvanceCoreEcologyDormantAggregatePatchInput {
  readonly atTick: number;
}

export interface CoreEcologyPatchStepResult {
  readonly patch: CoreEcologyPatchState;
  readonly events: readonly CoreWildlifeCausalEvent[];
  /** Coarse and signal-cadence group transitions retained for downstream owners. */
  readonly groupEvents: readonly CoreEcologyGroupTransitionEvent[];
  /** Conflicts intentionally remain for the authoritative custody owner to arbitrate. */
  readonly resourceClaims: readonly CoreWildlifeResourceClaim[];
}

export interface CoreEcologyAggregatePatchStepResult {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly events: readonly CoreWildlifeCausalEvent[];
  readonly groupEvents: readonly CoreEcologyGroupTransitionEvent[];
  readonly resourceClaims: readonly CoreWildlifeResourceClaim[];
}

type CoreEcologyVersionedPatchState =
  | CoreEcologyPatchState
  | CoreEcologyAggregatePatchState;

export interface CoreEcologyAlarmObservationInput {
  readonly observerId: string;
  readonly observedAtTick: number;
  readonly radiusUnits: number;
  readonly confidence: number;
  readonly salience: number;
}

export interface CoreEcologyAlarmSignalProfile {
  /** Integer fixed-point source loudness on the shared simulation scale. */
  readonly sourceLoudness: number;
  readonly interrupt: "none" | "strong";
}

const UTF8_ENCODER = new TextEncoder();
const PATCH_KEY_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,63}$/u;
const ACTOR_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const SEED_FINGERPRINT_PATTERN = /^[0-9a-z]{7}(?:\.[0-9a-z]{7}){3}$/u;
const LEGACY_COHORT_TRANSACTION_PATTERN = /^regional-ecology-adoption:[0-9a-f]{16}$/u;
const CANONICAL_HASH_PATTERN = /^[0-9a-f]{16}$/u;
const MATERIALIZATION = new Set<string>(["coarse", "materialized"]);
const AGGREGATE_EVIDENCE_KINDS = new Set<string>([
  "burrow-opening",
  "feeding-scrape",
  "frog-track",
  "gnaw-mark",
  "haypile",
  "shelter-sign",
  "surface-dimple",
  "talus-sign",
  "tracks",
]);
const AGGREGATE_EVIDENCE_CAUSES = new Set<string>([
  "animal-disturbance",
  "food-attraction",
  "human-disturbance",
  "predator-pressure",
  "population-activity",
  "tide-pressure",
  "weather-pressure",
]);
const AGGREGATE_DISTURBANCE_CAUSES = new Set<string>([
  "animal-disturbance",
  "food-attraction",
  "human-disturbance",
  "predator-pressure",
  "tide-pressure",
  "weather-pressure",
]);

export function createCoreEcologyPatch(
  input: CreateCoreEcologyPatchInput,
): CoreEcologyPatchState {
  if (
    !plainRecord(input)
    || !validPatchKey(input.patchKey)
    || !isRegionCoord(input.originRegion)
    || !Array.isArray(input.populations)
    || input.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
  ) throw new RangeError("Core ecology patch creation input is malformed or unbounded");
  const tick = input.tick ?? 0;
  if (!nonnegativeSafeInteger(tick) || tick > Number.MAX_SAFE_INTEGER - 64) {
    throw new RangeError("Core ecology patch tick is outside the schedulable range");
  }
  const populations: CoreEcologyPopulationState[] = [];
  let memberCount = 0;
  let materializedCount = 0;
  for (const populationValue of input.populations) {
    if (
      !plainRecord(populationValue)
      || !allowedKeys(populationValue, ["members", "populationKey", "populationSize", "species"])
      || !Object.hasOwn(populationValue, "members")
      || !Object.hasOwn(populationValue, "populationKey")
      || !Object.hasOwn(populationValue, "species")
      || !isWaveAIndividualSpecies(populationValue.species)
      || !validPatchKey(populationValue.populationKey)
      || !Array.isArray(populationValue.members)
    ) throw new RangeError("Core ecology population input is malformed");
    const species = populationValue.species as CoreWildlifeSpecies;
    const profile = getCoreWildlifeProfile(species);
    if (
      populationValue.members.length === 0
      || populationValue.members.length > profile.maximumPatchPopulation
    ) throw new RangeError(`Core ecology ${species} population exceeds its patch budget`);
    const members: CoreEcologyPopulationMemberState[] = [];
    let representedPopulation = 0;
    for (const memberValue of populationValue.members) {
      if (
        !plainRecord(memberValue)
        || !allowedKeys(memberValue, [
          "heading",
          "materialization",
          "populationOrdinal",
          "position",
          "representedUnits",
        ])
        || !Object.hasOwn(memberValue, "materialization")
        || !Object.hasOwn(memberValue, "populationOrdinal")
        || !Object.hasOwn(memberValue, "position")
        || !nonnegativeSafeInteger(memberValue.populationOrdinal)
        || (memberValue.representedUnits !== undefined
          && !positiveSafeInteger(memberValue.representedUnits))
        || !MATERIALIZATION.has(memberValue.materialization as string)
        || !isWorldPosition(memberValue.position)
      ) throw new RangeError("Core ecology member input is malformed");
      const representedUnits = memberValue.representedUnits ?? 1;
      representedPopulation += representedUnits;
      if (!Number.isSafeInteger(representedPopulation)) {
        throw new RangeError("Core ecology population representation overflowed");
      }
      const actor = createCoreWildlifeActorState({
        seed: input.seed,
        species,
        originRegion: input.originRegion,
        populationKey: populationValue.populationKey,
        populationOrdinal: memberValue.populationOrdinal,
        position: memberValue.position,
        ...(memberValue.heading === undefined ? {} : { heading: memberValue.heading as number }),
        tick,
      });
      members.push(Object.freeze({
        populationOrdinal: memberValue.populationOrdinal,
        representedUnits,
        materialization: memberValue.materialization as CoreWildlifeMaterialization,
        actor,
      }));
      memberCount += 1;
      if (memberValue.materialization === "materialized") materializedCount += 1;
    }
    members.sort(compareMember);
    for (let index = 1; index < members.length; index += 1) {
      if (members[index - 1]?.populationOrdinal === members[index]?.populationOrdinal) {
        throw new RangeError("Core ecology population ordinals must be unique");
      }
    }
    const populationSize = populationValue.populationSize ?? representedPopulation;
    if (
      !positiveSafeInteger(populationSize)
      || populationSize !== representedPopulation
      || populationSize > profile.maximumPatchPopulation
    ) throw new RangeError(`Core ecology ${species} population representation is inconsistent`);
    populations.push(Object.freeze({
      species,
      populationKey: populationValue.populationKey,
      baselinePopulationSize: populationSize,
      populationSize,
      reserveUnits: 0,
      members: Object.freeze(members),
    }));
  }
  if (
    memberCount > CORE_ECOLOGY_MAX_MEMBERS
    || materializedCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) throw new RangeError("Core ecology patch exceeds its member or materialization budget");
  const groups = input.groups === undefined
    ? createCoreEcologyGroupSet()
    : canonicalizeCoreEcologyGroupSet(input.groups);
  const derivation = canonicalDerivation(input.derivation ?? { kind: "bounded-input-v1" });
  if (groups === null || derivation === null) {
    throw new RangeError("Core ecology derivation or group state is malformed");
  }
  const candidate = {
    version: CORE_ECOLOGY_PATCH_VERSION,
    patchKey: input.patchKey,
    originRegion: createRegionCoord(input.originRegion.x, input.originRegion.y),
    updatedAtTick: tick,
    derivation,
    groups,
    populations,
  };
  const patch = canonicalizeCoreEcologyPatch(candidate);
  if (patch === null) throw new Error("Generated core ecology patch failed validation");
  return patch;
}

export function canonicalizeCoreEcologyPatch(value: unknown): CoreEcologyPatchState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "derivation",
    "groups",
    "originRegion",
    "patchKey",
    "populations",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_PATCH_VERSION
    || !validPatchKey(value.patchKey)
    || !isRegionCoord(value.originRegion)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.populations)
    || value.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
  ) return null;
  const derivation = canonicalDerivation(value.derivation);
  const groups = canonicalizeCoreEcologyGroupSet(value.groups);
  if (derivation === null || groups === null) return null;
  const populations: CoreEcologyPopulationState[] = [];
  const actorIds = new Set<string>();
  let memberCount = 0;
  let materializedCount = 0;
  for (const rawPopulation of value.populations) {
    const population = canonicalPopulation(
      rawPopulation,
      value.originRegion,
      value.updatedAtTick,
      actorIds,
      isWaveAIndividualSpecies,
    );
    if (population === null) return null;
    populations.push(population);
    memberCount += population.members.length;
    materializedCount += population.members.filter(({ materialization }) =>
      materialization === "materialized"
    ).length;
  }
  populations.sort(comparePopulation);
  for (let index = 1; index < populations.length; index += 1) {
    if (comparePopulation(populations[index - 1]!, populations[index]!) === 0) return null;
  }
  if (
    memberCount > CORE_ECOLOGY_MAX_MEMBERS
    || materializedCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
    || populations.some(({ baselinePopulationSize, populationSize, reserveUnits }) => (
      baselinePopulationSize !== populationSize || reserveUnits !== 0
    ))
    || !groupsBelongToPatch(groups, populations, value.originRegion, value.updatedAtTick)
    || !derivationMatchesPopulations(derivation, populations, value.originRegion)
  ) return null;
  return deepFreeze({
    version: CORE_ECOLOGY_PATCH_VERSION,
    patchKey: value.patchKey,
    originRegion: createRegionCoord(value.originRegion.x, value.originRegion.y),
    updatedAtTick: value.updatedAtTick,
    derivation,
    groups,
    populations,
  });
}

export function serializeCoreEcologyPatch(value: unknown): string {
  const patch = requirePatch(value);
  const text = stableStringify(patch);
  if (UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Core ecology patch exceeds its save budget");
  }
  return text;
}

export function deserializeCoreEcologyPatch(text: unknown): CoreEcologyPatchState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const patch = canonicalizeCoreEcologyPatch(JSON.parse(text) as unknown);
    return patch !== null && stableStringify(patch) === text ? patch : null;
  } catch {
    return null;
  }
}

/**
 * One-way Alpha-13 adoption. The old exact actors and their dynamic state are
 * retained byte-for-byte inside the new representation; no habitat reroll is
 * permitted during this migration.
 */
export function migrateLegacyCoreEcologyPatch(text: unknown): CoreEcologyPatchState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const raw = JSON.parse(text) as unknown;
    if (!plainRecord(raw) || stableStringify(raw) !== text) return null;
    if (raw.version === LEGACY_CORE_ECOLOGY_PATCH_VERSION) {
      if (!exactKeys(raw, [
        "derivation",
        "groups",
        "originRegion",
        "patchKey",
        "populations",
        "updatedAtTick",
        "version",
      ]) || !Array.isArray(raw.populations)) return null;
      return canonicalizeCoreEcologyPatch({
        ...raw,
        version: CORE_ECOLOGY_PATCH_VERSION,
        populations: raw.populations.map((population) => (
          plainRecord(population)
            ? {
                ...population,
                baselinePopulationSize: population.populationSize,
                reserveUnits: 0,
              }
            : population
        )),
      });
    }
    const legacy = canonicalizeFoundationLegacyCoreEcologyPatch(raw);
    if (legacy === null) return null;
    return canonicalizeCoreEcologyPatch({
      version: CORE_ECOLOGY_PATCH_VERSION,
      patchKey: legacy.patchKey,
      originRegion: legacy.originRegion,
      updatedAtTick: legacy.updatedAtTick,
      derivation: { kind: "legacy-fixed-v1" },
      groups: createCoreEcologyGroupSet(),
      populations: legacy.populations.map((population) => ({
        ...population,
        baselinePopulationSize: population.populationSize,
        reserveUnits: 0,
        members: population.members.map((member) => ({
          ...member,
          representedUnits: 1,
        })),
      })),
    });
  } catch {
    return null;
  }
}

/**
 * Creates the additive aggregate patch. Aggregate populations are derived
 * from a signed habitat-v2/v3 record, never from a requested actor count. Old
 * v1/v2 constructors remain frozen and cannot create rat actors.
 */
export function createCoreEcologyAggregatePatch(
  input: CreateCoreEcologyAggregatePatchInput,
): CoreEcologyAggregatePatchState {
  if (
    !plainRecord(input)
    || !allowedKeys(input, [
      "derivation",
      "groups",
      "originRegion",
      "patchKey",
      "populations",
      "seed",
      "tick",
    ])
    || !canonicalRootSeed(input.seed)
    || !validPatchKey(input.patchKey)
    || !isRegionCoord(input.originRegion)
    || !Array.isArray(input.populations)
    || input.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
  ) throw new RangeError("Core ecology aggregate patch creation input is malformed or unbounded");
  const tick = input.tick ?? 0;
  if (!nonnegativeSafeInteger(tick) || tick > Number.MAX_SAFE_INTEGER - 64) {
    throw new RangeError("Core ecology aggregate patch tick is outside the schedulable range");
  }
  const derivation = canonicalAggregateDerivation(input.derivation);
  const groups = input.groups === undefined
    ? createCoreEcologyGroupSet()
    : canonicalizeCoreEcologyGroupSet(input.groups);
  if (derivation === null || groups === null) {
    throw new RangeError("Core ecology aggregate derivation or group state is malformed");
  }

  const populations: CoreEcologyPopulationState[] = [];
  let memberCount = 0;
  let materializedCount = 0;
  for (const populationValue of input.populations) {
    if (
      !plainRecord(populationValue)
      || !allowedKeys(populationValue, ["members", "populationKey", "populationSize", "species"])
      || !Object.hasOwn(populationValue, "members")
      || !Object.hasOwn(populationValue, "populationKey")
      || !Object.hasOwn(populationValue, "species")
      || !isCurrentIndividualSpecies(populationValue.species)
      || !validPatchKey(populationValue.populationKey)
      || !Array.isArray(populationValue.members)
    ) throw new RangeError("Core ecology individual population input is malformed");
    const species = populationValue.species;
    const profile = getCoreWildlifeProfile(species);
    if (
      populationValue.members.length === 0
      || populationValue.members.length > profile.maximumPatchPopulation
    ) throw new RangeError(`Core ecology ${species} population exceeds its patch budget`);
    const members: CoreEcologyPopulationMemberState[] = [];
    let representedPopulation = 0;
    for (const memberValue of populationValue.members) {
      if (
        !plainRecord(memberValue)
        || !allowedKeys(memberValue, [
          "heading",
          "materialization",
          "populationOrdinal",
          "position",
          "representedUnits",
        ])
        || !Object.hasOwn(memberValue, "materialization")
        || !Object.hasOwn(memberValue, "populationOrdinal")
        || !Object.hasOwn(memberValue, "position")
        || !nonnegativeSafeInteger(memberValue.populationOrdinal)
        || (memberValue.representedUnits !== undefined
          && !positiveSafeInteger(memberValue.representedUnits))
        || !MATERIALIZATION.has(memberValue.materialization as string)
        || !isWorldPosition(memberValue.position)
      ) throw new RangeError("Core ecology individual member input is malformed");
      const representedUnits = memberValue.representedUnits ?? 1;
      representedPopulation += representedUnits;
      if (!Number.isSafeInteger(representedPopulation)) {
        throw new RangeError("Core ecology individual representation overflowed");
      }
      const actor = createCoreWildlifeActorState({
        seed: input.seed,
        species,
        originRegion: input.originRegion,
        populationKey: populationValue.populationKey,
        populationOrdinal: memberValue.populationOrdinal,
        position: memberValue.position,
        ...(memberValue.heading === undefined ? {} : { heading: memberValue.heading as number }),
        tick,
      });
      members.push(Object.freeze({
        populationOrdinal: memberValue.populationOrdinal,
        representedUnits,
        materialization: memberValue.materialization as CoreWildlifeMaterialization,
        actor,
      }));
      memberCount += 1;
      if (memberValue.materialization === "materialized") materializedCount += 1;
    }
    members.sort(compareMember);
    for (let index = 1; index < members.length; index += 1) {
      if (members[index - 1]?.populationOrdinal === members[index]?.populationOrdinal) {
        throw new RangeError("Core ecology individual population ordinals must be unique");
      }
    }
    const populationSize = populationValue.populationSize ?? representedPopulation;
    if (
      !positiveSafeInteger(populationSize)
      || populationSize !== representedPopulation
      || populationSize > profile.maximumPatchPopulation
    ) throw new RangeError(`Core ecology ${species} population representation is inconsistent`);
    populations.push(Object.freeze({
      species,
      populationKey: populationValue.populationKey,
      baselinePopulationSize: populationSize,
      populationSize,
      reserveUnits: 0,
      members: Object.freeze(members),
    }));
  }
  if (
    memberCount > CORE_ECOLOGY_MAX_MEMBERS
    || materializedCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) throw new RangeError("Core ecology aggregate patch exceeds its actor budgets");

  const aggregatePopulations = derivation.kind === "habitat-v2"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v2"
    || derivation.kind === "habitat-v3"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v3"
    || derivation.kind === "habitat-v4"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v4"
    || derivation.kind === "habitat-v5"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v5"
    || derivation.kind === "habitat-v6"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v6"
    || derivation.kind === "habitat-v7"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v7"
    || derivation.kind === "habitat-v8"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v8"
    || derivation.kind === "habitat-v9"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v9"
    || derivation.kind === "habitat-v10"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v10"
    || derivation.kind === "habitat-v11"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v11"
    || derivation.kind === "regional-habitat-v1"
    || derivation.kind === "regional-habitat-v1-with-adoption-suppression"
    || derivation.kind === "settlement-home-v1"
    || derivation.kind === "regional-alpine-v1"
    ? aggregatePopulationsFromHabitat(
        input.seed,
        derivation.habitat,
        tick,
        derivation.kind === "regional-habitat-v1-with-adoption-suppression"
          ? derivation.suppression
          : null,
      )
        .filter((population) => (
          derivation.kind !== "settlement-home-v1"
          || population.species === "brown-rat"
        ))
    : Object.freeze([]);
  const candidate = {
    version: CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
    patchKey: input.patchKey,
    originRegion: createRegionCoord(input.originRegion.x, input.originRegion.y),
    updatedAtTick: tick,
    derivation,
    groups,
    populations,
    aggregatePopulations,
    nextMortalityOrdinal: 0,
    mortalityTransactions: [],
    carcasses: [],
  };
  const patch = canonicalizeCoreEcologyAggregatePatch(candidate);
  if (patch === null) throw new Error("Generated core ecology aggregate patch failed validation");
  return patch;
}

export function canonicalizeCoreEcologyAggregatePatch(
  value: unknown,
): CoreEcologyAggregatePatchState | null {
  if (
    typeof value === "object"
    && value !== null
    && CANONICAL_AGGREGATE_PATCHES.has(value)
  ) return value as CoreEcologyAggregatePatchState;
  if (!plainRecord(value) || !exactKeys(value, [
    "aggregatePopulations",
    "carcasses",
    "derivation",
    "groups",
    "mortalityTransactions",
    "nextMortalityOrdinal",
    "originRegion",
    "patchKey",
    "populations",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_AGGREGATE_PATCH_VERSION
    || !validPatchKey(value.patchKey)
    || !isRegionCoord(value.originRegion)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.populations)
    || value.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
    || !Array.isArray(value.aggregatePopulations)
    || value.aggregatePopulations.length > CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS
    || !nonnegativeSafeInteger(value.nextMortalityOrdinal)
    || !Array.isArray(value.mortalityTransactions)
    || value.mortalityTransactions.length > CORE_ECOLOGY_MAX_MORTALITY_TRANSACTIONS
    || !Array.isArray(value.carcasses)
    || value.carcasses.length > CORE_ECOLOGY_MAX_MORTALITY_TRANSACTIONS
  ) return null;
  const derivation = canonicalAggregateDerivation(value.derivation);
  const groups = canonicalizeCoreEcologyGroupSet(value.groups);
  if (derivation === null || groups === null) return null;
  const ownsExternalResidence = derivation.kind === "legacy-cohort-v1";
  const allowsExternalHistoricalActorReferences = ownsExternalResidence
    || derivation.kind === "regional-habitat-v1"
    || derivation.kind === "regional-habitat-v1-with-adoption-suppression"
    || derivation.kind === "settlement-home-v1";

  const populations: CoreEcologyPopulationState[] = [];
  const actorIds = new Set<string>();
  let memberCount = 0;
  let materializedCount = 0;
  for (const rawPopulation of value.populations) {
    const population = canonicalPopulation(
      rawPopulation,
      value.originRegion,
      value.updatedAtTick,
      actorIds,
      isCurrentIndividualSpecies,
    );
    if (population === null) return null;
    populations.push(population);
    memberCount += population.members.length;
    materializedCount += population.members.filter(({ materialization }) =>
      materialization === "materialized"
    ).length;
  }
  populations.sort(comparePopulation);
  for (let index = 1; index < populations.length; index += 1) {
    if (comparePopulation(populations[index - 1]!, populations[index]!) === 0) return null;
  }

  const aggregateIds = new Set<string>();
  const aggregatePopulations: CoreEcologyAggregatePopulationState[] = [];
  for (const rawPopulation of value.aggregatePopulations) {
    const population = canonicalAggregatePopulation(
      rawPopulation,
      value.originRegion,
      value.updatedAtTick,
      ownsExternalResidence,
    );
    if (population === null || aggregateIds.has(population.aggregateId)) return null;
    aggregateIds.add(population.aggregateId);
    aggregatePopulations.push(population);
  }
  aggregatePopulations.sort((left, right) =>
    compareText(left.species, right.species)
      || compareText(left.populationKey, right.populationKey));
  for (let index = 1; index < aggregatePopulations.length; index += 1) {
    const left = aggregatePopulations[index - 1];
    const right = aggregatePopulations[index];
    if (
      left !== undefined
      && right !== undefined
      && left.species === right.species
      && left.populationKey === right.populationKey
    ) return null;
  }

  const mortality = canonicalMortalityLedger({
    rawTransactions: value.mortalityTransactions,
    rawCarcasses: value.carcasses,
    nextMortalityOrdinal: value.nextMortalityOrdinal,
    populations,
    liveActorIds: actorIds,
    originRegion: value.originRegion,
    maximumTick: value.updatedAtTick,
    allowExternalActorReferences: allowsExternalHistoricalActorReferences,
  });
  if (mortality === null) return null;

  if (
    memberCount > CORE_ECOLOGY_MAX_MEMBERS
    || materializedCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
    || !groupsBelongToPatch(groups, populations, value.originRegion, value.updatedAtTick)
    || !aggregateDerivationMatchesPopulations(
      derivation,
      populations,
      aggregatePopulations,
      value.originRegion,
      mortality.transactions,
    )
  ) return null;
  const patch = deepFreeze({
    version: CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
    patchKey: value.patchKey,
    originRegion: createRegionCoord(value.originRegion.x, value.originRegion.y),
    updatedAtTick: value.updatedAtTick,
    derivation,
    groups,
    populations,
    aggregatePopulations,
    nextMortalityOrdinal: value.nextMortalityOrdinal,
    mortalityTransactions: mortality.transactions,
    carcasses: mortality.carcasses,
  });
  CANONICAL_AGGREGATE_PATCHES.add(patch);
  return patch;
}

export function serializeCoreEcologyAggregatePatch(value: unknown): string {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null) throw new TypeError("Core ecology aggregate patch state is malformed");
  const text = stableStringify(patch);
  if (UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Core ecology aggregate patch exceeds its save budget");
  }
  return text;
}

export function deserializeCoreEcologyAggregatePatch(
  text: unknown,
): CoreEcologyAggregatePatchState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const patch = canonicalizeCoreEcologyAggregatePatch(JSON.parse(text) as unknown);
    return patch !== null && stableStringify(patch) === text ? patch : null;
  } catch {
    return null;
  }
}

/**
 * One-way aggregate adoption. V4 receives empty mortality ownership and exact
 * baseline accounting. V3 first receives its historical durable tide clock,
 * then the same additive V5 fields. No living identity or population unit is
 * regenerated during either migration.
 */
export function migrateLegacyCoreEcologyAggregatePatch(
  text: unknown,
): CoreEcologyAggregatePatchState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const value = JSON.parse(text) as unknown;
    if (
      !plainRecord(value)
      || stableStringify(value) !== text
      || (value.version !== LEGACY_CORE_ECOLOGY_AGGREGATE_PATCH_VERSION
        && value.version !== TIDAL_LEGACY_CORE_ECOLOGY_AGGREGATE_PATCH_VERSION)
      || !exactKeys(value, [
        "aggregatePopulations",
        "derivation",
        "groups",
        "originRegion",
        "patchKey",
        "populations",
        "updatedAtTick",
        "version",
      ])
      || !Array.isArray(value.populations)
      || !Array.isArray(value.aggregatePopulations)
    ) return null;
    const populations = value.populations.map((population) => {
      if (!plainRecord(population) || !exactKeys(population, [
        "members",
        "populationKey",
        "populationSize",
        "species",
      ])) throw new TypeError("Legacy individual population shape is malformed");
      return {
        ...population,
        baselinePopulationSize: population.populationSize,
        reserveUnits: 0,
      };
    });
    const aggregatePopulations = value.version === LEGACY_CORE_ECOLOGY_AGGREGATE_PATCH_VERSION
      ? value.aggregatePopulations
      : value.aggregatePopulations.map((population) => {
      if (
        !plainRecord(population)
        || !exactKeys(population, [
          "activitySignal",
          "aggregateId",
          "anchors",
          "disturbances",
          "evidence",
          "habitatCapacity",
          "nextDisturbanceOrdinal",
          "nextEvidenceOrdinal",
          "populationKey",
          "populationPressure",
          "populationSize",
          "representation",
          "revision",
          "seedFingerprint",
          "species",
          "trend",
          "trendSignal",
          "updatedAtTick",
        ])
        || !Array.isArray(population.disturbances)
      ) throw new TypeError("Legacy aggregate population shape is malformed");
      let lastTidalRedistributionTick: number | null = null;
      for (const disturbance of population.disturbances) {
        if (
          plainRecord(disturbance)
          && disturbance.causeKind === "tide-pressure"
          && typeof disturbance.causeReferenceId === "string"
          && disturbance.causeReferenceId.endsWith(":edge")
          && nonnegativeSafeInteger(disturbance.atTick)
          && (lastTidalRedistributionTick === null
            || disturbance.atTick > lastTidalRedistributionTick)
        ) lastTidalRedistributionTick = disturbance.atTick;
      }
      // Alpha 19 saved only at completed world-tick boundaries, after the
      // Tide Table had evaluated that tick. Its bounded event tail could be
      // churned later in the same tick, so absence of an old :edge record is
      // not proof that the cadence opportunity remains pending.
      if (
        population.species === "atlantic-silverside"
        && nonnegativeSafeInteger(value.updatedAtTick)
        && value.updatedAtTick > 0
        && value.updatedAtTick
          % CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS === 0
      ) lastTidalRedistributionTick = value.updatedAtTick;
      return { ...population, lastTidalRedistributionTick };
    });
    return canonicalizeCoreEcologyAggregatePatch({
      ...value,
      version: CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
      populations,
      aggregatePopulations,
      nextMortalityOrdinal: 0,
      mortalityTransactions: [],
      carcasses: [],
    });
  } catch {
    return null;
  }
}

/** Exact v2 adoption into the current aggregate form; actor/group state is retained. */
export function migrateCoreEcologyPatchToAggregatePatch(
  value: unknown,
): CoreEcologyAggregatePatchState | null {
  const patch = typeof value === "string"
    ? deserializeCoreEcologyPatch(value)
    : canonicalizeCoreEcologyPatch(value);
  if (patch === null) return null;
  return canonicalizeCoreEcologyAggregatePatch({
    version: CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
    patchKey: patch.patchKey,
    originRegion: patch.originRegion,
    updatedAtTick: patch.updatedAtTick,
    derivation: patch.derivation,
    groups: patch.groups,
    populations: patch.populations,
    aggregatePopulations: [],
    nextMortalityOrdinal: 0,
    mortalityTransactions: [],
    carcasses: [],
  });
}

/** Accepts canonical v5 through foundational v1 text and returns additive v5. */
export function deserializeOrMigrateCoreEcologyAggregatePatch(
  text: unknown,
): CoreEcologyAggregatePatchState | null {
  const current = deserializeCoreEcologyAggregatePatch(text);
  if (current !== null) return current;
  const fromV3 = migrateLegacyCoreEcologyAggregatePatch(text);
  if (fromV3 !== null) return fromV3;
  const fromV2 = migrateCoreEcologyPatchToAggregatePatch(text);
  if (fromV2 !== null) return fromV2;
  const fromV1 = migrateLegacyCoreEcologyPatch(text);
  return fromV1 === null ? null : migrateCoreEcologyPatchToAggregatePatch(fromV1);
}

export function stableCoreEcologyAggregatePopulationId(input: Readonly<{
  readonly seed: RootSeed;
  readonly originRegion: RegionCoord;
  readonly populationKey: string;
  readonly species?: CoreEcologyAggregateSpecies;
}>): string {
  if (
    !plainRecord(input)
    || !allowedKeys(input, ["originRegion", "populationKey", "seed", "species"])
    || !canonicalRootSeed(input.seed)
    || !isRegionCoord(input.originRegion)
    || !validPatchKey(input.populationKey)
    || input.species !== undefined && !isCoreEcologyAggregateSpecies(input.species)
  ) throw new RangeError("Core ecology aggregate identity input is malformed");
  return stableAggregateIdFromFields({
    seedFingerprint: rootSeedFingerprint(input.seed),
    originRegion: input.originRegion,
    populationKey: input.populationKey,
    species: input.species ?? "brown-rat",
  });
}

export function coreEcologyAggregatePopulation(
  value: unknown,
  aggregateId: unknown,
): CoreEcologyAggregatePopulationState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null || typeof aggregateId !== "string") return null;
  return patch.aggregatePopulations.find((population) =>
    population.aggregateId === aggregateId) ?? null;
}

/**
 * Replaces only the current activity of one conserved population area. The
 * caller owns the environmental/sensory derivation; this boundary guarantees
 * that identity, population units, anchors, evidence, and disturbances do not
 * change merely because a chorus becomes louder or quieter.
 */
export function setCoreEcologyAggregateActivityIntensity(
  value: unknown,
  input: SetCoreEcologyAggregateActivityIntensityInput,
): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !plainRecord(input)
    || !exactKeys(input, ["aggregateId", "atTick", "intensity"])
    || typeof input.aggregateId !== "string"
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick !== patch.updatedAtTick
    || !fixedInteger(input.intensity)
  ) return null;
  const populationIndex = patch.aggregatePopulations.findIndex(({ aggregateId }) => (
    aggregateId === input.aggregateId
  ));
  const population = patch.aggregatePopulations[populationIndex];
  if (population === undefined) return null;
  if (population.activitySignal.intensity === input.intensity) return patch;
  const aggregatePopulations = [...patch.aggregatePopulations];
  aggregatePopulations[populationIndex] = deepFreeze({
    ...population,
    activitySignal: {
      ...population.activitySignal,
      intensity: input.intensity,
      updatedAtTick: input.atTick,
    },
  });
  return canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    aggregatePopulations,
  });
}

/**
 * Records one completed tidal-edge opportunity outside bounded evidence tails.
 * This prevents same-tick re-evaluation after unrelated disturbances evict a
 * causal record, without creating an event or changing population units.
 */
export function markCoreEcologyAggregateTidalRedistribution(
  value: unknown,
  input: MarkCoreEcologyAggregateTidalRedistributionInput,
): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !plainRecord(input)
    || !exactKeys(input, ["aggregateId", "atTick"])
    || typeof input.aggregateId !== "string"
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick !== patch.updatedAtTick
  ) return null;
  const populationIndex = patch.aggregatePopulations.findIndex(({ aggregateId }) => (
    aggregateId === input.aggregateId
  ));
  const population = patch.aggregatePopulations[populationIndex];
  if (population === undefined || population.species !== "atlantic-silverside") return null;
  if (population.lastTidalRedistributionTick === input.atTick) return patch;
  if (
    population.lastTidalRedistributionTick !== null
    && input.atTick < population.lastTidalRedistributionTick
  ) return null;
  const aggregatePopulations = [...patch.aggregatePopulations];
  aggregatePopulations[populationIndex] = deepFreeze({
    ...population,
    lastTidalRedistributionTick: input.atTick,
  });
  return canonicalizeCoreEcologyAggregatePatch({ ...patch, aggregatePopulations });
}

/**
 * Transfers extant aggregate units between existing bounded anchors. It cannot
 * kill animals, create actors, consume items, or claim food/cargo resources.
 */
export function displaceCoreEcologyAggregatePopulation(
  value: unknown,
  input: DisplaceCoreEcologyAggregatePopulationInput,
): DisplaceCoreEcologyAggregatePopulationResult | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !plainRecord(input)
    || !exactKeys(input, [
      "aggregateId",
      "atTick",
      "causeKind",
      "causeReferenceId",
      "fromAnchorOrdinal",
      "populationUnits",
      "pressure",
      "toAnchorOrdinal",
    ])
    || typeof input.aggregateId !== "string"
    || !AGGREGATE_DISTURBANCE_CAUSES.has(input.causeKind)
    || typeof input.causeReferenceId !== "string"
    || !ACTOR_REFERENCE_PATTERN.test(input.causeReferenceId)
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick < patch.updatedAtTick
    || input.atTick - patch.updatedAtTick > CORE_ECOLOGY_MAX_STEP_TICKS
    || !nonnegativeSafeInteger(input.fromAnchorOrdinal)
    || !nonnegativeSafeInteger(input.toAnchorOrdinal)
    || input.fromAnchorOrdinal === input.toAnchorOrdinal
    || !positiveSafeInteger(input.populationUnits)
    || !fixedInteger(input.pressure)
    || input.pressure === 0
  ) return null;
  const populationIndex = patch.aggregatePopulations.findIndex((population) =>
    population.aggregateId === input.aggregateId);
  const population = patch.aggregatePopulations[populationIndex];
  if (population === undefined) return null;
  if (
    input.causeKind === "tide-pressure"
    && coreEcologyAggregateSpeciesPolicy(population.species).tideResponse === "neutral"
  ) return null;
  const fromAnchor = population.anchors.find((anchor) =>
    anchor.anchorOrdinal === input.fromAnchorOrdinal);
  const toAnchor = population.anchors.find((anchor) =>
    anchor.anchorOrdinal === input.toAnchorOrdinal);
  if (
    fromAnchor === undefined
    || toAnchor === undefined
    || input.populationUnits > fromAnchor.populationUnits
  ) return null;

  const disturbanceOrdinal = population.nextDisturbanceOrdinal;
  const disturbanceId = `${population.aggregateId}:disturbance:${disturbanceOrdinal.toString(36)}`;
  const disturbance: CoreEcologyAggregateDisturbance = Object.freeze({
    disturbanceId,
    disturbanceOrdinal,
    atTick: input.atTick,
    causeKind: input.causeKind,
    causeReferenceId: input.causeReferenceId,
    fromAnchorOrdinal: input.fromAnchorOrdinal,
    toAnchorOrdinal: input.toAnchorOrdinal,
    displacedUnits: input.populationUnits,
    pressure: input.pressure,
    nonlethal: true,
    cargoInteraction: false,
    itemConsumption: "none",
  });
  const evidenceOrdinal = population.nextEvidenceOrdinal;
  const evidence: CoreEcologyAggregateEvidence = Object.freeze({
    version: CORE_ECOLOGY_AGGREGATE_EVIDENCE_VERSION,
    evidenceId: `${population.aggregateId}:evidence:${evidenceOrdinal.toString(36)}`,
    evidenceOrdinal,
    kind: disturbanceEvidenceKind(population.species, input.causeKind),
    position: createWorldPosition(
      toAnchor.position.region,
      toAnchor.position.localX,
      toAnchor.position.localY,
    ),
    createdAtTick: input.atTick,
    strength: input.pressure,
    causeKind: input.causeKind,
    causeReferenceId: input.causeReferenceId,
    itemConsumption: "none",
    disclosure: "direct-observation-required",
  });
  const anchors = population.anchors.map((anchor) => {
    const populationUnits = anchor.anchorOrdinal === input.fromAnchorOrdinal
      ? anchor.populationUnits - input.populationUnits
      : anchor.anchorOrdinal === input.toAnchorOrdinal
      ? anchor.populationUnits + input.populationUnits
      : anchor.populationUnits;
    return Object.freeze({ ...anchor, populationUnits });
  });
  const nextPopulation = Object.freeze({
    ...population,
    revision: population.revision + 1,
    updatedAtTick: input.atTick,
    anchors: Object.freeze(anchors),
    activitySignal: Object.freeze({
      ...population.activitySignal,
      intensity: resolveCoreEcologyAggregateDisturbanceActivity(
        population.species,
        population.activitySignal.intensity,
        input.causeKind,
        input.pressure,
      ),
      updatedAtTick: input.atTick,
    }),
    evidence: retainAggregateEvidence([...population.evidence, evidence]),
    disturbances: retainAggregateDisturbances([...population.disturbances, disturbance]),
    nextEvidenceOrdinal: evidenceOrdinal + 1,
    nextDisturbanceOrdinal: disturbanceOrdinal + 1,
  });
  const aggregatePopulations = [...patch.aggregatePopulations];
  aggregatePopulations[populationIndex] = nextPopulation;
  const nextPatch = canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    updatedAtTick: input.atTick,
    aggregatePopulations,
  });
  if (nextPatch === null) return null;
  const canonicalPopulation = nextPatch.aggregatePopulations[populationIndex];
  const canonicalDisturbance = canonicalPopulation?.disturbances.find((candidate) =>
    candidate.disturbanceId === disturbanceId);
  const canonicalEvidence = canonicalPopulation?.evidence.find((candidate) =>
    candidate.evidenceId === evidence.evidenceId);
  if (canonicalDisturbance === undefined || canonicalEvidence === undefined) return null;
  return deepFreeze({
    patch: nextPatch,
    disturbance: canonicalDisturbance,
    evidence: canonicalEvidence,
  });
}

export function coreEcologyActor(
  value: unknown,
  actorId: unknown,
): CoreWildlifeActorState | null {
  const patch = canonicalizeCoreEcologyPatch(value);
  if (patch === null || typeof actorId !== "string") return null;
  for (const population of patch.populations) {
    const member = population.members.find(({ actor }) => actor.identity.stableId === actorId);
    if (member !== undefined) return member.actor;
  }
  return null;
}

export function coreEcologyAggregatePatchActor(
  value: unknown,
  actorId: unknown,
): CoreWildlifeActorState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null || typeof actorId !== "string") return null;
  for (const population of patch.populations) {
    const member = population.members.find(({ actor }) => actor.identity.stableId === actorId);
    if (member !== undefined) return member.actor;
  }
  return null;
}

/** Replaces one already-owned actor without permitting identity/population aliasing. */
export function replaceCoreEcologyActor(
  value: unknown,
  actorValue: unknown,
): CoreEcologyPatchState {
  const patch = requirePatch(value);
  const actor = canonicalizeCoreWildlifeActorState(actorValue);
  if (actor === null) throw new TypeError("Replacement core wildlife actor is malformed");
  let found = false;
  const populations = patch.populations.map((population) => Object.freeze({
    ...population,
    members: Object.freeze(population.members.map((member) => {
      if (member.actor.identity.stableId !== actor.identity.stableId) return member;
      found = true;
      if (
        actor.updatedAtTick < member.actor.updatedAtTick
        || actor.identity.species !== population.species
        || actor.identity.populationKey !== population.populationKey
        || actor.identity.populationOrdinal !== member.populationOrdinal
      ) throw new RangeError("Replacement actor does not belong to this population revision");
      return Object.freeze({ ...member, actor });
    })),
  }));
  if (!found) throw new RangeError("Replacement actor is not owned by this ecology patch");
  return requireCanonicalPatch({
    ...patch,
    updatedAtTick: Math.max(patch.updatedAtTick, actor.updatedAtTick),
    populations,
  });
}

/** Replaces one v4-owned individual actor and advances aggregate clocks only. */
export function replaceCoreEcologyAggregatePatchActor(
  value: unknown,
  actorValue: unknown,
): CoreEcologyAggregatePatchState {
  const patch = requireAggregatePatch(value);
  const actor = canonicalizeCoreWildlifeActorState(actorValue);
  if (actor === null) throw new TypeError("Replacement core wildlife actor is malformed");
  let found = false;
  const populations = patch.populations.map((population) => Object.freeze({
    ...population,
    members: Object.freeze(population.members.map((member) => {
      if (member.actor.identity.stableId !== actor.identity.stableId) return member;
      found = true;
      if (
        actor.updatedAtTick < member.actor.updatedAtTick
        || actor.identity.species !== population.species
        || actor.identity.populationKey !== population.populationKey
        || actor.identity.populationOrdinal !== member.populationOrdinal
      ) throw new RangeError("Replacement actor does not belong to this aggregate patch revision");
      return Object.freeze({ ...member, actor });
    })),
  }));
  if (!found) throw new RangeError("Replacement actor is not owned by this aggregate patch");
  const updatedAtTick = Math.max(patch.updatedAtTick, actor.updatedAtTick);
  return requireCanonicalAggregatePatch({
    ...patch,
    updatedAtTick,
    populations,
    aggregatePopulations: advanceAggregatePopulationClocks(
      patch.aggregatePopulations,
      updatedAtTick,
    ),
  });
}

/**
 * Atomically applies one already-perceived physical harm event. Injury keeps
 * the same living actor. Death retires that exact body, removes one population
 * unit, preserves anonymous survivors represented by it, and creates exactly
 * one finite carcass. Existing committed death events replay idempotently.
 */
export function applyCoreEcologyWildlifeMortality(
  value: unknown,
  inputValue: unknown,
): ApplyCoreEcologyWildlifeMortalityResult | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !plainRecord(inputValue)
    || !exactKeys(inputValue, ["result", "temperature"])
    || !fixedInteger(inputValue.temperature)
    || !plainRecord(inputValue.result)
    || !exactKeys(inputValue.result, ["event", "target"])
  ) return null;
  const event = canonicalizeCoreWildlifeMortalityEvent(inputValue.result.event);
  const target = canonicalizeCoreWildlifeActorState(inputValue.result.target);
  if (event === null || target === null || target.condition.health !== event.healthAfter) {
    return null;
  }

  const existing = patch.mortalityTransactions.find((transaction) => (
    transaction.event.eventId === event.eventId
  ));
  if (existing !== undefined) {
    const carcass = patch.carcasses.find(({ carcassId }) => carcassId === existing.carcassId);
    if (
      carcass === undefined
      || stableStringify(existing.event) !== stableStringify(event)
      || stableStringify(existing.retiredActor) !== stableStringify(target)
    ) return null;
    return deepFreeze({ patch, event, transaction: existing, carcass });
  }

  if (event.atTick !== patch.updatedAtTick) return null;
  let victimPopulation: CoreEcologyPopulationState | undefined;
  let victimMember: CoreEcologyPopulationMemberState | undefined;
  let attackerMember: CoreEcologyPopulationMemberState | undefined;
  for (const population of patch.populations) {
    for (const member of population.members) {
      if (member.actor.identity.stableId === event.victimId) {
        victimPopulation = population;
        victimMember = member;
      }
      if (member.actor.identity.stableId === event.attackerId) attackerMember = member;
    }
  }
  if (
    victimPopulation === undefined
    || victimMember === undefined
    || attackerMember === undefined
    || victimMember.materialization !== "materialized"
    || attackerMember.materialization !== "materialized"
    || attackerMember.actor.updatedAtTick !== event.atTick
  ) return null;
  const attacker = attackerMember.actor;
  const attack = coreEcologySpeciesPredatorContact(attacker.identity.species);
  if (
    attack === null
    || !coreEcologyCanResolveMortalityTarget(
      attacker.identity.species,
      victimPopulation.species,
    )
  ) return null;
  const verified = resolveCoreWildlifePredatorContact({
    attacker,
    target: victimMember.actor,
    atTick: event.atTick,
    contactRadiusUnits: attack.reachUnits,
    damageUnits: attack.damageUnits,
    cause: attack.cause,
  });
  if (
    verified === null
    || stableStringify(verified.event) !== stableStringify(event)
    || stableStringify(verified.target) !== stableStringify(target)
  ) return null;

  return commitVerifiedCoreEcologyMortality({
    patch,
    victimPopulation,
    victimMember,
    target,
    event,
    temperature: inputValue.temperature,
  });
}

/**
 * Commits an already-resolved contact when the attacker and victim have
 * different active owners. Both owners are authenticated, but only the victim
 * patch is ever revised. Passing the same exact owner delegates to the ordinary
 * path so same-owner results remain byte-for-byte identical.
 */
export function applyCoreEcologyCrossOwnerWildlifeMortality(
  victimPatchValue: unknown,
  inputValue: unknown,
): ApplyCoreEcologyWildlifeMortalityResult | null {
  const victimPatch = canonicalizeCoreEcologyAggregatePatch(victimPatchValue);
  if (
    victimPatch === null
    || !plainRecord(inputValue)
    || !exactKeys(inputValue, ["attackerPatch", "result", "temperature"])
    || !fixedInteger(inputValue.temperature)
  ) return null;
  const attackerPatch = canonicalizeCoreEcologyAggregatePatch(inputValue.attackerPatch);
  if (attackerPatch === null) return null;
  if (attackerPatch.patchKey === victimPatch.patchKey) {
    return stableStringify(attackerPatch) === stableStringify(victimPatch)
      ? applyCoreEcologyWildlifeMortality(victimPatch, {
          result: inputValue.result,
          temperature: inputValue.temperature,
        })
      : null;
  }
  if (
    attackerPatch.updatedAtTick !== victimPatch.updatedAtTick
    || !plainRecord(inputValue.result)
    || !exactKeys(inputValue.result, ["event", "target"])
  ) return null;
  const event = canonicalizeCoreWildlifeMortalityEvent(inputValue.result.event);
  const target = canonicalizeCoreWildlifeActorState(inputValue.result.target);
  if (
    event === null
    || target === null
    || target.condition.health !== event.healthAfter
    || !patchOwnsActorIdentity(attackerPatch, event.attackerId)
    || ownedEcologyIdsOverlap(attackerPatch, victimPatch)
  ) {
    return null;
  }
  const existing = victimPatch.mortalityTransactions.find((transaction) => (
    transaction.event.eventId === event.eventId
  ));
  if (existing !== undefined) {
    const carcass = victimPatch.carcasses.find(({ carcassId }) => (
      carcassId === existing.carcassId
    ));
    if (
      carcass === undefined
      || stableStringify(existing.event) !== stableStringify(event)
      || stableStringify(existing.retiredActor) !== stableStringify(target)
    ) return null;
    return deepFreeze({ patch: victimPatch, event, transaction: existing, carcass });
  }
  if (
    event.atTick !== victimPatch.updatedAtTick
    || event.atTick !== attackerPatch.updatedAtTick
  ) return null;
  const victimOwned = ecologyPopulationMember(victimPatch, event.victimId);
  const attackerOwned = ecologyPopulationMember(attackerPatch, event.attackerId);
  if (
    victimOwned === null
    || attackerOwned === null
    || victimOwned.member.materialization !== "materialized"
    || attackerOwned.member.materialization !== "materialized"
    || attackerOwned.member.actor.updatedAtTick !== event.atTick
  ) return null;
  const attack = coreEcologySpeciesPredatorContact(attackerOwned.member.actor.identity.species);
  if (
    attack === null
    || !coreEcologyCanResolveMortalityTarget(
      attackerOwned.member.actor.identity.species,
      victimOwned.population.species,
    )
  ) return null;
  const verified = resolveCoreWildlifePredatorContact({
    attacker: attackerOwned.member.actor,
    target: victimOwned.member.actor,
    atTick: event.atTick,
    contactRadiusUnits: attack.reachUnits,
    damageUnits: attack.damageUnits,
    cause: attack.cause,
  });
  if (
    verified === null
    || stableStringify(verified.event) !== stableStringify(event)
    || stableStringify(verified.target) !== stableStringify(target)
  ) return null;
  return commitVerifiedCoreEcologyMortality({
    patch: victimPatch,
    victimPopulation: victimOwned.population,
    victimMember: victimOwned.member,
    target,
    event,
    temperature: inputValue.temperature,
  });
}

function commitVerifiedCoreEcologyMortality(input: Readonly<{
  patch: CoreEcologyAggregatePatchState;
  victimPopulation: CoreEcologyPopulationState;
  victimMember: CoreEcologyPopulationMemberState;
  target: CoreWildlifeActorState;
  event: CoreWildlifeMortalityResult["event"];
  temperature: number;
}>): ApplyCoreEcologyWildlifeMortalityResult | null {
  const { patch, victimPopulation, victimMember, target, event } = input;
  if (event.outcome === "injured") {
    const nextPatch = replaceCoreEcologyAggregatePatchActor(patch, target);
    return deepFreeze({ patch: nextPatch, event, transaction: null, carcass: null });
  }
  const bodySizeUnits = coreEcologySpeciesPhysicalBodySizeUnits(victimPopulation.species);
  const resourceUnits = coreEcologySpeciesPhysicalBodyResourceUnits(victimPopulation.species);
  if (
    bodySizeUnits <= 0
    || resourceUnits <= 0
    || patch.mortalityTransactions.length >= CORE_ECOLOGY_MAX_MORTALITY_TRANSACTIONS
    || patch.groups.groups.some((group) => (
      group.identity.species === victimPopulation.species
      && group.identity.populationKey === victimPopulation.populationKey
      && group.memberOrdinals.includes(victimMember.populationOrdinal)
    ))
  ) return null;
  const carcass = createCoreWildlifeCarcass({
    mortalityEvent: event,
    sourceSpecies: victimPopulation.species,
    bodySizeUnits,
    resourceUnits,
    temperature: input.temperature,
  });
  if (carcass === null) return null;
  const transaction = createCoreEcologyMortalityTransaction({
    mortalityOrdinal: patch.nextMortalityOrdinal,
    event,
    retiredActor: target,
    representedUnitsBefore: victimMember.representedUnits,
    carcassId: carcass.carcassId,
  });
  const releasedCarcasses: CoreWildlifeCarcass[] = [];
  for (const existingCarcass of patch.carcasses) {
    if (existingCarcass.currentClaimantActorId !== target.identity.stableId) {
      releasedCarcasses.push(existingCarcass);
      continue;
    }
    const released = releaseCoreWildlifeCarcass(existingCarcass, {
      actorId: target.identity.stableId,
      atTick: event.atTick,
    });
    if (released === null) return null;
    releasedCarcasses.push(released);
  }
  const populations = patch.populations.map((population) => (
    population !== victimPopulation
      ? population
      : Object.freeze({
          ...population,
          populationSize: population.populationSize - 1,
          reserveUnits: population.reserveUnits + victimMember.representedUnits - 1,
          members: Object.freeze(population.members.filter(({ actor }) =>
            actor.identity.stableId !== target.identity.stableId
          )),
        })
  ));
  const nextPatch = canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    populations,
    nextMortalityOrdinal: patch.nextMortalityOrdinal + 1,
    mortalityTransactions: [...patch.mortalityTransactions, transaction],
    carcasses: [...releasedCarcasses, carcass],
  });
  if (nextPatch === null) return null;
  const committedCarcass = nextPatch.carcasses.find(({ carcassId }) => (
    carcassId === carcass.carcassId
  ));
  const committedTransaction = nextPatch.mortalityTransactions.find(({ mortalityId }) => (
    mortalityId === transaction.mortalityId
  ));
  if (committedCarcass === undefined || committedTransaction === undefined) return null;
  return deepFreeze({
    patch: nextPatch,
    event,
    transaction: committedTransaction,
    carcass: committedCarcass,
  });
}

function ecologyPopulationMember(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): Readonly<{
  population: CoreEcologyPopulationState;
  member: CoreEcologyPopulationMemberState;
}> | null {
  for (const population of patch.populations) {
    const member = population.members.find(({ actor }) => actor.identity.stableId === actorId);
    if (member !== undefined) return Object.freeze({ population, member });
  }
  return null;
}

function ownedEcologyIdsOverlap(
  left: CoreEcologyAggregatePatchState,
  right: CoreEcologyAggregatePatchState,
): boolean {
  const owned = new Set([
    ...left.populations.flatMap(({ members }) => members.map(({ actor }) => (
      actor.identity.stableId
    ))),
    ...left.mortalityTransactions.map(({ retiredActor }) => retiredActor.identity.stableId),
    ...left.aggregatePopulations.map(({ aggregateId }) => aggregateId),
  ]);
  return [
    ...right.populations.flatMap(({ members }) => members.map(({ actor }) => (
      actor.identity.stableId
    ))),
    ...right.mortalityTransactions.map(({ retiredActor }) => retiredActor.identity.stableId),
    ...right.aggregatePopulations.map(({ aggregateId }) => aggregateId),
  ].some((id) => owned.has(id));
}

function patchOwnsActorIdentity(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): boolean {
  return patch.populations.some(({ members }) => members.some(({ actor }) => (
    actor.identity.stableId === actorId
  ))) || patch.mortalityTransactions.some(({ retiredActor }) => (
    retiredActor.identity.stableId === actorId
  ));
}

/** Replace one owned carcass after a lawful claim/consume/decay transition. */
export function replaceCoreEcologyAggregatePatchCarcass(
  value: unknown,
  carcassValue: unknown,
): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const carcass = canonicalizeCoreWildlifeCarcass(carcassValue);
  if (patch === null || carcass === null) return null;
  const previous = patch.carcasses.find(({ carcassId }) => carcassId === carcass.carcassId);
  if (
    previous === undefined
    || carcass.updatedAtTick < previous.updatedAtTick
    || carcass.updatedAtTick > patch.updatedAtTick
    || carcass.remainingResourceUnits > previous.remainingResourceUnits
    || carcass.consumedResourceUnits < previous.consumedResourceUnits
    || carcass.decayedResourceUnits < previous.decayedResourceUnits
    || carcass.condition.decay < previous.condition.decay
    || stableStringify({
      bodySizeUnits: carcass.bodySizeUnits,
      carcassId: carcass.carcassId,
      deathAtTick: carcass.deathAtTick,
      deathPosition: carcass.deathPosition,
      disclosure: carcass.disclosure,
      originalResourceUnits: carcass.originalResourceUnits,
      sourceActorId: carcass.sourceActorId,
      sourceMortalityEventId: carcass.sourceMortalityEventId,
      sourceSpecies: carcass.sourceSpecies,
      version: carcass.version,
    }) !== stableStringify({
      bodySizeUnits: previous.bodySizeUnits,
      carcassId: previous.carcassId,
      deathAtTick: previous.deathAtTick,
      deathPosition: previous.deathPosition,
      disclosure: previous.disclosure,
      originalResourceUnits: previous.originalResourceUnits,
      sourceActorId: previous.sourceActorId,
      sourceMortalityEventId: previous.sourceMortalityEventId,
      sourceSpecies: previous.sourceSpecies,
      version: previous.version,
    })
  ) return null;
  return canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    carcasses: patch.carcasses.map((candidate) => (
      candidate.carcassId === carcass.carcassId ? carcass : candidate
    )),
  });
}

export function setCoreEcologyMaterializedActors(
  value: unknown,
  input: SetCoreEcologyMaterializationInput,
): CoreEcologyPatchState {
  const patch = requirePatch(value);
  if (
    !plainRecord(input)
    || !exactKeys(input, ["actorIds", "atTick"])
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick < patch.updatedAtTick
    || !Array.isArray(input.actorIds)
    || input.actorIds.length > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
    || input.actorIds.some((actorId) => typeof actorId !== "string")
  ) throw new RangeError("Core ecology materialization set is malformed or stale");
  const desired = new Set(input.actorIds);
  if (desired.size !== input.actorIds.length) {
    throw new RangeError("Core ecology materialization IDs must be unique");
  }
  const known = new Set(allMembers(patch).map(({ actor }) => actor.identity.stableId));
  if ([...desired].some((actorId) => !known.has(actorId))) {
    throw new RangeError("Core ecology cannot materialize an actor outside its patch");
  }
  const advancedGroups = advanceGroupsThroughTick(patch, input.atTick);
  if (advancedGroups === null) {
    throw new RangeError("Core ecology groups could not reach the materialization tick");
  }
  const groups = reconcileGroupsBeforeMaterialization(
    advancedGroups.groups,
    patch.populations,
    desired,
    input.atTick,
  );
  if (groups === null) {
    throw new RangeError("Core ecology group anchors could not be reconciled");
  }
  const populations = patch.populations.map((population) => Object.freeze({
    ...population,
    members: Object.freeze(population.members.map((member) => Object.freeze({
      ...member,
      actor: desired.has(member.actor.identity.stableId)
        && member.materialization === "coarse"
        ? rematerializeGroupedActor(member, population, groups, input.atTick)
        : member.actor,
      materialization: desired.has(member.actor.identity.stableId)
        ? "materialized" as const
        : "coarse" as const,
    }))),
  }));
  return requireCanonicalPatch({
    ...patch,
    updatedAtTick: input.atTick,
    groups,
    populations,
  });
}

export function setCoreEcologyAggregatePatchMaterializedActors(
  value: unknown,
  input: SetCoreEcologyMaterializationInput,
): CoreEcologyAggregatePatchState {
  const patch = requireAggregatePatch(value);
  if (
    !plainRecord(input)
    || !exactKeys(input, ["actorIds", "atTick"])
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick < patch.updatedAtTick
    || !Array.isArray(input.actorIds)
    || input.actorIds.length > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
    || input.actorIds.some((actorId) => typeof actorId !== "string")
  ) throw new RangeError("Core ecology aggregate materialization set is malformed or stale");
  const desired = new Set(input.actorIds);
  if (desired.size !== input.actorIds.length) {
    throw new RangeError("Core ecology aggregate materialization IDs must be unique");
  }
  const known = new Set(allMembers(patch).map(({ actor }) => actor.identity.stableId));
  if ([...desired].some((actorId) => !known.has(actorId))) {
    throw new RangeError("Core ecology cannot materialize an actor outside its aggregate patch");
  }
  const advancedGroups = advanceGroupsThroughTick(patch, input.atTick);
  if (advancedGroups === null) {
    throw new RangeError("Core ecology groups could not reach the aggregate materialization tick");
  }
  const groups = reconcileGroupsBeforeMaterialization(
    advancedGroups.groups,
    patch.populations,
    desired,
    input.atTick,
  );
  if (groups === null) {
    throw new RangeError("Core ecology aggregate group anchors could not be reconciled");
  }
  const populations = patch.populations.map((population) => Object.freeze({
    ...population,
    members: Object.freeze(population.members.map((member) => Object.freeze({
      ...member,
      actor: desired.has(member.actor.identity.stableId)
        && member.materialization === "coarse"
        ? rematerializeGroupedActor(member, population, groups, input.atTick)
        : member.actor,
      materialization: desired.has(member.actor.identity.stableId)
        ? "materialized" as const
        : "coarse" as const,
    }))),
  }));
  return requireCanonicalAggregatePatch({
    ...patch,
    updatedAtTick: input.atTick,
    groups,
    populations,
    aggregatePopulations: advanceAggregatePopulationClocks(
      patch.aggregatePopulations,
      input.atTick,
    ),
  });
}

/** All-or-nothing deterministic step over the exact materialized actor set. */
export function stepCoreEcologyPatch(
  value: unknown,
  inputValue: unknown,
): CoreEcologyPatchStepResult | null {
  const patch = canonicalizeCoreEcologyPatch(value);
  if (patch === null) return null;
  const input = canonicalPatchStepInput(inputValue, patch);
  if (input === null) return null;
  const advancedGroups = advanceGroupsThroughTick(patch, input.tick);
  if (advancedGroups === null) return null;
  const stepByActor = new Map(input.actorSteps.map((step) => [step.actorId, step]));
  const events: CoreWildlifeCausalEvent[] = [];
  const claims: CoreWildlifeResourceClaim[] = [];
  const populations: CoreEcologyPopulationState[] = [];
  for (const population of patch.populations) {
    const members: CoreEcologyPopulationMemberState[] = [];
    for (const member of population.members) {
      if (member.materialization === "coarse") {
        members.push(Object.freeze({
          ...member,
          actor: advanceCoreWildlifeActorCoarse(member.actor, { atTick: input.tick }),
        }));
        continue;
      }
      const stepInput = stepByActor.get(member.actor.identity.stableId);
      if (stepInput === undefined) return null;
      const result = stepCoreWildlifeActor(member.actor, {
        tick: input.tick,
        observations: stepInput.observations,
        foodOpportunities: stepInput.foodOpportunities,
        accessibility: stepInput.accessibility,
        ...(stepInput.neutralActivityPreference === undefined
          ? {}
          : { neutralActivityPreference: stepInput.neutralActivityPreference }),
        ...(stepInput.regroupOpportunity === undefined
          ? {}
          : { regroupOpportunity: stepInput.regroupOpportunity }),
      });
      if (result === null) return null;
      members.push(Object.freeze({ ...member, actor: result.actor }));
      events.push(result.event);
      claims.push(...result.resourceClaims);
    }
    populations.push(Object.freeze({
      ...population,
      members: Object.freeze(members),
    }));
  }
  events.sort((left, right) => compareText(left.actorId, right.actorId));
  claims.sort((left, right) =>
    compareText(left.resourceId, right.resourceId) || compareText(left.actorId, right.actorId)
  );
  const groups = ingestMaterializedAlarmSignals(
    advancedGroups.groups,
    populations,
    events,
    input.tick,
  );
  if (groups === null) return null;
  const nextPatch = canonicalizeCoreEcologyPatch({
    ...patch,
    updatedAtTick: input.tick,
    groups,
    populations,
  });
  if (nextPatch === null) return null;
  return deepFreeze({
    patch: nextPatch,
    events,
    groupEvents: advancedGroups.events,
    resourceClaims: claims,
  });
}

/**
 * Exact optional accelerator for an all-coarse aggregate patch. Stable social
 * cycles are bridged transactionally; null is reserved for actor cognition,
 * intent, live group signals, or topology that still needs cadence replay.
 */
export function advanceCoreEcologyDormantAggregatePatch(
  value: unknown,
  inputValue: unknown,
): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !plainRecord(inputValue)
    || !exactKeys(inputValue, ["atTick"])
    || !nonnegativeSafeInteger(inputValue.atTick)
    || inputValue.atTick < patch.updatedAtTick
    || inputValue.atTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
  ) return null;
  const atTick = inputValue.atTick;
  if (atTick === patch.updatedAtTick) return patch;
  if (patch.populations.some(({ members }) => members.some(({ actor, materialization }) => (
    materialization !== "coarse"
    || !dormantActorSupportsExactSinglePass(actor, atTick)
  )))) return null;
  const groups = advanceDormantGroupsInOnePass(patch, atTick);
  if (groups === null) return null;
  return canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    updatedAtTick: atTick,
    groups,
    populations: patch.populations.map((population) => ({
      ...population,
      members: population.members.map((member) => ({
        ...member,
        actor: advanceCoreWildlifeActorCoarse(member.actor, { atTick }),
      })),
    })),
    aggregatePopulations: advanceAggregatePopulationClocks(
      patch.aggregatePopulations,
      atTick,
    ),
  });
}

/**
 * Steps only v4 individual actors. Aggregate distribution, evidence, and
 * disturbance history remain exact; their saved clocks advance to the tick.
 */
export function stepCoreEcologyAggregatePatch(
  value: unknown,
  inputValue: unknown,
): CoreEcologyAggregatePatchStepResult | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null) return null;
  const input = canonicalPatchStepInput(inputValue, patch);
  if (input === null) return null;
  const advancedGroups = advanceGroupsThroughTick(patch, input.tick);
  if (advancedGroups === null) return null;
  const stepByActor = new Map(input.actorSteps.map((step) => [step.actorId, step]));
  const events: CoreWildlifeCausalEvent[] = [];
  const claims: CoreWildlifeResourceClaim[] = [];
  const populations: CoreEcologyPopulationState[] = [];
  for (const population of patch.populations) {
    const members: CoreEcologyPopulationMemberState[] = [];
    for (const member of population.members) {
      if (member.materialization === "coarse") {
        members.push(Object.freeze({
          ...member,
          actor: advanceCoreWildlifeActorCoarse(member.actor, { atTick: input.tick }),
        }));
        continue;
      }
      const stepInput = stepByActor.get(member.actor.identity.stableId);
      if (stepInput === undefined) return null;
      const result = stepCoreWildlifeActor(member.actor, {
        tick: input.tick,
        observations: stepInput.observations,
        foodOpportunities: stepInput.foodOpportunities,
        accessibility: stepInput.accessibility,
        ...(stepInput.neutralActivityPreference === undefined
          ? {}
          : { neutralActivityPreference: stepInput.neutralActivityPreference }),
        ...(stepInput.regroupOpportunity === undefined
          ? {}
          : { regroupOpportunity: stepInput.regroupOpportunity }),
      });
      if (result === null) return null;
      members.push(Object.freeze({ ...member, actor: result.actor }));
      events.push(result.event);
      claims.push(...result.resourceClaims);
    }
    populations.push(Object.freeze({
      ...population,
      members: Object.freeze(members),
    }));
  }
  events.sort((left, right) => compareText(left.actorId, right.actorId));
  claims.sort((left, right) =>
    compareText(left.resourceId, right.resourceId) || compareText(left.actorId, right.actorId)
  );
  const groups = ingestMaterializedAlarmSignals(
    advancedGroups.groups,
    populations,
    events,
    input.tick,
  );
  if (groups === null) return null;
  const nextPatch = canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    updatedAtTick: input.tick,
    groups,
    populations,
    aggregatePopulations: advanceAggregatePopulationClocks(
      patch.aggregatePopulations,
      input.tick,
    ),
  });
  if (nextPatch === null) return null;
  return deepFreeze({
    patch: nextPatch,
    events,
    groupEvents: advancedGroups.events,
    resourceClaims: claims,
  });
}

/**
 * Generic event-to-hearing bridge. It reveals neither alarm source identity nor
 * intent; callers still decide whether propagation reaches this observer.
 */
export function createCoreEcologyAlarmObservation(
  event: CoreWildlifeCausalEvent,
  input: CoreEcologyAlarmObservationInput,
): ActorObservation | null {
  if (
    !plainRecord(event)
    || !exactKeys(event, [
      "actorId",
      "atTick",
      "causeReferenceId",
      "eventId",
      "kind",
      "observationId",
      "position",
      "resourceReference",
      "species",
      "version",
    ])
    || event.version !== CORE_WILDLIFE_EVENT_VERSION
    || event.kind !== "alarm"
    || !ACTOR_REFERENCE_PATTERN.test(event.eventId)
    || !ACTOR_REFERENCE_PATTERN.test(event.actorId)
    || !ACTOR_REFERENCE_PATTERN.test(event.causeReferenceId)
    || !CORE_WILDLIFE_SPECIES.includes(event.species)
    || !nonnegativeSafeInteger(event.atTick)
    || !(event.observationId === null || ACTOR_REFERENCE_PATTERN.test(event.observationId))
    || event.resourceReference !== null
    || !isWorldPosition(event.position)
    || !plainRecord(input)
    || !exactKeys(input, [
      "confidence",
      "observedAtTick",
      "observerId",
      "radiusUnits",
      "salience",
    ])
    || !nonnegativeSafeInteger(input.observedAtTick)
    || input.observedAtTick < event.atTick
  ) return null;
  const signal = coreEcologyAlarmSignalProfile(event.species);
  return createActorObservation({
    id: `alarm:${hashCanonical([event.eventId, input.observerId, input.observedAtTick])}`,
    observerId: input.observerId,
    observedAtTick: input.observedAtTick,
    channel: "hearing",
    perceivedClass: "animal-alarm",
    subjectId: null,
    area: {
      center: event.position,
      radiusUnits: input.radiusUnits,
    },
    confidence: input.confidence,
    salience: input.salience,
    identification: "anonymous",
    interrupt: signal.interrupt,
  });
}

/**
 * Shared emission capability for any alarm-source species. Small prey still
 * communicate a nearby warning, but a soft foot-thump does not carry or
 * preempt attention like a full bird/deer alarm call.
 */
export function coreEcologyAlarmSignalProfile(
  species: CoreWildlifeSpecies,
): CoreEcologyAlarmSignalProfile {
  const smallPrey = getCoreWildlifeProfile(species).roles.includes("small-prey");
  return smallPrey
    ? Object.freeze({ sourceLoudness: 420_000, interrupt: "none" as const })
    : Object.freeze({ sourceLoudness: FIXED_POINT, interrupt: "strong" as const });
}

function aggregatePopulationsFromHabitat(
  seed: RootSeed,
  habitat:
    | CoreEcologyHarborEdgeHabitatAssemblage
    | CoreEcologyMarshEdgeHabitatAssemblage
    | CoreEcologyRainChorusHabitatAssemblage
    | CoreEcologyTidalTableHabitatAssemblage
    | CoreEcologyWaterfowlHabitatAssemblage
    | CoreEcologyTidalWebHabitatAssemblage
    | CoreEcologyDomesticYardHabitatAssemblage
    | CoreEcologyDomesticPenHabitatAssemblage
    | CoreEcologyRegionalUplandHabitatAssemblage
    | CoreEcologyRegionalPredatorHabitatAssemblage
    | CoreEcologyRegionalHabitat
    | CoreEcologyAlpineHabitat,
  tick: number,
  regionalSuppression: CoreEcologyRegionalAdoptionSuppressionManifestV1 | null = null,
): readonly CoreEcologyAggregatePopulationState[] {
  const seedFingerprint = rootSeedFingerprint(seed);
  const aggregatePopulations: CoreEcologyAggregatePopulationState[] = [];
  for (const analysis of habitat.populations) {
    const regional = isRegionalHabitatPopulation(analysis);
    if (
      !isCoreEcologyAggregateSpecies(analysis.species)
      || (!regional
        && analysis.representation !== "aggregate-area"
        && analysis.representation !== "group-actor")
      || analysis.populationUnits === 0
    ) continue;
    const species = analysis.species;
    const policy = coreEcologyAggregateSpeciesPolicy(species);
    const suppressedUnits = regional && regionalSuppression !== null
      ? regionalSuppression.aggregateSlots.find(({ baselinePopulationId }) => (
          baselinePopulationId === analysis.stableId
        ))?.suppressedBaselineUnits ?? 0
      : 0;
    const survivingPopulationUnits = analysis.populationUnits - suppressedUnits;
    if (survivingPopulationUnits === 0) continue;
    const aggregateId = stableAggregateIdFromFields({
      seedFingerprint,
      originRegion: regionalHabitatOrigin(habitat),
      populationKey: analysis.populationKey,
      species,
    });
    let remainingSuppression = suppressedUnits;
    const sourceAnchors = regional
      ? analysis.anchors.map((anchor, anchorOrdinal) => {
        const removed = Math.min(anchor.allocatedPopulation, remainingSuppression);
        remainingSuppression -= removed;
        return {
          anchorOrdinal,
          position: createWorldPosition(
            regionalHabitatOrigin(habitat),
            anchor.localX * WORLD_POSITION_UNITS_PER_TILE
              + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
            anchor.localY * WORLD_POSITION_UNITS_PER_TILE
              + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
          ),
          representedUnits: anchor.allocatedPopulation - removed,
        };
      }).filter(({ representedUnits }) => representedUnits > 0)
      : analysis.allocations.map((allocation) => ({
          anchorOrdinal: allocation.allocationOrdinal,
          position: allocation.position,
          representedUnits: allocation.representedUnits,
        }));
    const anchors = sourceAnchors.map((allocation, anchorOrdinal) => Object.freeze({
      anchorOrdinal,
      position: createWorldPosition(
        allocation.position.region,
        allocation.position.localX,
        allocation.position.localY,
      ),
      radiusUnits: WORLD_POSITION_UNITS_PER_TILE * policy.anchorRadiusTiles,
      populationUnits: allocation.representedUnits,
    }));
    const activitySignal = aggregateActivitySignalFromHabitat(
      species,
      regional
        ? {
            kind: "foraging",
            intensity: analysis.habitatScore,
            activePeriod: "variable",
            source: "habitat-derived",
          }
        : analysis.activitySignal,
      tick,
    );
    const evidence = anchors.map((anchor) => {
      const evidenceOrdinal = anchor.anchorOrdinal;
      return Object.freeze({
        version: CORE_ECOLOGY_AGGREGATE_EVIDENCE_VERSION,
        evidenceId: `${aggregateId}:evidence:${evidenceOrdinal.toString(36)}`,
        evidenceOrdinal,
        kind: initialAggregateEvidenceKind(species, aggregateId, evidenceOrdinal),
        position: createWorldPosition(
          anchor.position.region,
          anchor.position.localX,
          anchor.position.localY,
        ),
        createdAtTick: tick,
        strength: Math.max(1, activitySignal.intensity),
        causeKind: "population-activity" as const,
        causeReferenceId: aggregateId,
        itemConsumption: "none" as const,
        disclosure: "direct-observation-required" as const,
      });
    });
    aggregatePopulations.push(deepFreeze({
      aggregateId,
      seedFingerprint,
      species,
      representation: policy.representation,
      populationKey: analysis.populationKey,
      revision: 0,
      updatedAtTick: tick,
      habitatCapacity: analysis.habitatCapacity,
      populationSize: survivingPopulationUnits,
      populationPressure: regional
        ? ratioFixed(survivingPopulationUnits, analysis.habitatCapacity)
        : analysis.populationPressure,
      trend: regional ? "stable" : analysis.trend,
      trendSignal: regional ? 0 : analysis.trendSignal,
      anchors,
      activitySignal,
      evidence,
      disturbances: [],
      lastTidalRedistributionTick: null,
      nextEvidenceOrdinal: evidence.length,
      nextDisturbanceOrdinal: 0,
    }));
  }
  return Object.freeze(aggregatePopulations);
}

type CoreEcologyRegionalLikePopulationCandidate =
  | CoreEcologyRegionalPopulationCandidate
  | CoreEcologyAlpineHabitat["populations"][number];

function isRegionalHabitatPopulation(
  value: unknown,
): value is CoreEcologyRegionalLikePopulationCandidate {
  return plainRecord(value) && "actorRepresentation" in value;
}

function regionalHabitatOrigin(
  habitat:
    | CoreEcologyHarborEdgeHabitatAssemblage
    | CoreEcologyMarshEdgeHabitatAssemblage
    | CoreEcologyRainChorusHabitatAssemblage
    | CoreEcologyTidalTableHabitatAssemblage
    | CoreEcologyWaterfowlHabitatAssemblage
    | CoreEcologyTidalWebHabitatAssemblage
    | CoreEcologyDomesticYardHabitatAssemblage
    | CoreEcologyDomesticPenHabitatAssemblage
    | CoreEcologyRegionalUplandHabitatAssemblage
    | CoreEcologyRegionalPredatorHabitatAssemblage
    | CoreEcologyRegionalHabitat
    | CoreEcologyAlpineHabitat,
): RegionCoord {
  return "region" in habitat ? habitat.region : habitat.originRegion;
}

function regionalAnchorPosition(
  region: RegionCoord,
  anchor: CoreEcologyRegionalLikePopulationCandidate["anchors"][number],
): WorldPosition {
  return createWorldPosition(
    region,
    anchor.localX * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    anchor.localY * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function canonicalAggregatePopulation(
  value: unknown,
  originRegion: RegionCoord,
  maximumTick: number,
  allowExternalResidence = false,
): CoreEcologyAggregatePopulationState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "activitySignal",
    "aggregateId",
    "anchors",
    "disturbances",
    "evidence",
    "habitatCapacity",
    "lastTidalRedistributionTick",
    "nextDisturbanceOrdinal",
    "nextEvidenceOrdinal",
    "populationKey",
    "populationPressure",
    "populationSize",
    "representation",
    "revision",
    "seedFingerprint",
    "species",
    "trend",
    "trendSignal",
    "updatedAtTick",
  ])) return null;
  if (!isCoreEcologyAggregateSpecies(value.species)) return null;
  const species = value.species;
  const policy = coreEcologyAggregateSpeciesPolicy(species);
  if (
    value.representation !== policy.representation
    || typeof value.aggregateId !== "string"
    || !ACTOR_REFERENCE_PATTERN.test(value.aggregateId)
    || typeof value.seedFingerprint !== "string"
    || !SEED_FINGERPRINT_PATTERN.test(value.seedFingerprint)
    || !validPatchKey(value.populationKey)
    || value.aggregateId !== stableAggregateIdFromFields({
      seedFingerprint: value.seedFingerprint,
      originRegion,
      populationKey: value.populationKey,
      species,
    })
    || !nonnegativeSafeInteger(value.revision)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || value.updatedAtTick > maximumTick
    || !positiveSafeInteger(value.habitatCapacity)
    || value.habitatCapacity > getCoreWildlifeProfile(species).maximumPatchPopulation
    || !positiveSafeInteger(value.populationSize)
    || value.populationSize > value.habitatCapacity
    || !fixedInteger(value.populationPressure)
    || value.populationPressure !== ratioFixed(value.populationSize, value.habitatCapacity)
    || !signedFixedInteger(value.trendSignal)
    || !validPopulationTrend(value.trend, value.trendSignal)
    || !Array.isArray(value.anchors)
    || value.anchors.length === 0
    || value.anchors.length > CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS
    || value.anchors.length > policy.maximumAnchors
    || !Array.isArray(value.evidence)
    || value.evidence.length === 0
    || value.evidence.length > CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE
    || !Array.isArray(value.disturbances)
    || value.disturbances.length > CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES
    || !nonnegativeSafeInteger(value.nextEvidenceOrdinal)
    || !nonnegativeSafeInteger(value.nextDisturbanceOrdinal)
    || (value.lastTidalRedistributionTick !== null
      && (!nonnegativeSafeInteger(value.lastTidalRedistributionTick)
        || value.lastTidalRedistributionTick > value.updatedAtTick))
    || (species !== "atlantic-silverside" && value.lastTidalRedistributionTick !== null)
    || value.revision !== value.nextDisturbanceOrdinal
    || value.nextEvidenceOrdinal !== value.anchors.length + value.nextDisturbanceOrdinal
  ) return null;

  const anchors: CoreEcologyAggregateAreaAnchor[] = [];
  let representedPopulation = 0;
  for (let index = 0; index < value.anchors.length; index += 1) {
    const raw = value.anchors[index];
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["anchorOrdinal", "populationUnits", "position", "radiusUnits"])
      || raw.anchorOrdinal !== index
      || !isWorldPosition(raw.position)
      || (!allowExternalResidence && (
        raw.position.region.x !== originRegion.x
        || raw.position.region.y !== originRegion.y
      ))
      || raw.radiusUnits !== WORLD_POSITION_UNITS_PER_TILE * policy.anchorRadiusTiles
      || !nonnegativeSafeInteger(raw.populationUnits)
    ) return null;
    representedPopulation += raw.populationUnits;
    if (!Number.isSafeInteger(representedPopulation)) return null;
    anchors.push(Object.freeze({
      anchorOrdinal: index,
      position: createWorldPosition(
        allowExternalResidence ? raw.position.region : originRegion,
        raw.position.localX,
        raw.position.localY,
      ),
      radiusUnits: raw.radiusUnits,
      populationUnits: raw.populationUnits,
    }));
  }
  if (representedPopulation !== value.populationSize) return null;
  const activitySignal = canonicalAggregateActivitySignal(
    value.activitySignal,
    value.updatedAtTick,
    species,
  );
  if (activitySignal === null) return null;

  const evidence: CoreEcologyAggregateEvidence[] = [];
  let priorEvidenceOrdinal = -1;
  for (const raw of value.evidence) {
    const canonical = canonicalAggregateEvidence(
      raw,
      value.aggregateId,
      originRegion,
      value.updatedAtTick,
      species,
      allowExternalResidence,
    );
    if (
      canonical === null
      || canonical.evidenceOrdinal <= priorEvidenceOrdinal
      || canonical.evidenceOrdinal >= value.nextEvidenceOrdinal
    ) return null;
    priorEvidenceOrdinal = canonical.evidenceOrdinal;
    evidence.push(canonical);
  }
  if (priorEvidenceOrdinal !== value.nextEvidenceOrdinal - 1) return null;

  const disturbances: CoreEcologyAggregateDisturbance[] = [];
  let priorDisturbanceOrdinal = -1;
  for (const raw of value.disturbances) {
    const canonical = canonicalAggregateDisturbance(
      raw,
      value.aggregateId,
      species,
      anchors.length,
      value.updatedAtTick,
      value.populationSize,
    );
    if (
      canonical === null
      || canonical.disturbanceOrdinal <= priorDisturbanceOrdinal
      || canonical.disturbanceOrdinal >= value.nextDisturbanceOrdinal
    ) return null;
    priorDisturbanceOrdinal = canonical.disturbanceOrdinal;
    disturbances.push(canonical);
  }
  if (
    value.nextDisturbanceOrdinal > 0
    && priorDisturbanceOrdinal !== value.nextDisturbanceOrdinal - 1
  ) return null;

  return deepFreeze({
    aggregateId: value.aggregateId,
    seedFingerprint: value.seedFingerprint,
    species,
    representation: policy.representation,
    populationKey: value.populationKey,
    revision: value.revision,
    updatedAtTick: value.updatedAtTick,
    habitatCapacity: value.habitatCapacity,
    populationSize: value.populationSize,
    populationPressure: value.populationPressure,
    trend: value.trend,
    trendSignal: value.trendSignal,
    anchors,
    activitySignal,
    evidence,
    disturbances,
    lastTidalRedistributionTick: value.lastTidalRedistributionTick,
    nextEvidenceOrdinal: value.nextEvidenceOrdinal,
    nextDisturbanceOrdinal: value.nextDisturbanceOrdinal,
  });
}

function canonicalAggregateActivitySignal(
  value: unknown,
  expectedTick: number,
  species: CoreEcologyAggregateSpecies,
): CoreEcologyAggregateActivitySignal | null {
  const expected = coreEcologyAggregateSpeciesPolicy(species).activity;
  if (
    !plainRecord(value)
    || !exactKeys(value, ["activePeriod", "intensity", "kind", "source", "updatedAtTick"])
    || value.kind !== expected.kind
    || value.activePeriod !== expected.activePeriod
    || value.source !== "aggregate-state"
    || !fixedInteger(value.intensity)
    || value.updatedAtTick !== expectedTick
  ) return null;
  return Object.freeze({
    kind: expected.kind,
    intensity: value.intensity,
    activePeriod: expected.activePeriod,
    updatedAtTick: expectedTick,
    source: "aggregate-state",
  });
}

function canonicalAggregateEvidence(
  value: unknown,
  aggregateId: string,
  originRegion: RegionCoord,
  maximumTick: number,
  species: CoreEcologyAggregateSpecies,
  allowExternalResidence = false,
): CoreEcologyAggregateEvidence | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "causeKind",
    "causeReferenceId",
    "createdAtTick",
    "disclosure",
    "evidenceId",
    "evidenceOrdinal",
    "itemConsumption",
    "kind",
    "position",
    "strength",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_AGGREGATE_EVIDENCE_VERSION
    || !nonnegativeSafeInteger(value.evidenceOrdinal)
    || value.evidenceId !== `${aggregateId}:evidence:${value.evidenceOrdinal.toString(36)}`
    || !AGGREGATE_EVIDENCE_KINDS.has(value.kind as string)
    || !coreEcologyAggregateSpeciesPolicy(species).initialEvidenceKinds
      .includes(value.kind as CoreEcologyAggregateEvidenceKind)
    || !isWorldPosition(value.position)
    || (!allowExternalResidence && (
      value.position.region.x !== originRegion.x
      || value.position.region.y !== originRegion.y
    ))
    || !nonnegativeSafeInteger(value.createdAtTick)
    || value.createdAtTick > maximumTick
    || !fixedInteger(value.strength)
    || value.strength === 0
    || !AGGREGATE_EVIDENCE_CAUSES.has(value.causeKind as string)
    || (value.causeKind === "tide-pressure"
      && coreEcologyAggregateSpeciesPolicy(species).tideResponse === "neutral")
    || typeof value.causeReferenceId !== "string"
    || !ACTOR_REFERENCE_PATTERN.test(value.causeReferenceId)
    || value.itemConsumption !== "none"
    || value.disclosure !== "direct-observation-required"
  ) return null;
  return Object.freeze({
    version: CORE_ECOLOGY_AGGREGATE_EVIDENCE_VERSION,
    evidenceId: value.evidenceId,
    evidenceOrdinal: value.evidenceOrdinal,
    kind: value.kind as CoreEcologyAggregateEvidenceKind,
    position: createWorldPosition(
      allowExternalResidence ? value.position.region : originRegion,
      value.position.localX,
      value.position.localY,
    ),
    createdAtTick: value.createdAtTick,
    strength: value.strength,
    causeKind: value.causeKind as CoreEcologyAggregateEvidenceCause,
    causeReferenceId: value.causeReferenceId,
    itemConsumption: "none",
    disclosure: "direct-observation-required",
  });
}

function canonicalAggregateDisturbance(
  value: unknown,
  aggregateId: string,
  species: CoreEcologyAggregateSpecies,
  anchorCount: number,
  maximumTick: number,
  maximumUnits: number,
): CoreEcologyAggregateDisturbance | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "atTick",
    "cargoInteraction",
    "causeKind",
    "causeReferenceId",
    "displacedUnits",
    "disturbanceId",
    "disturbanceOrdinal",
    "fromAnchorOrdinal",
    "itemConsumption",
    "nonlethal",
    "pressure",
    "toAnchorOrdinal",
  ])) return null;
  if (
    !nonnegativeSafeInteger(value.disturbanceOrdinal)
    || value.disturbanceId
      !== `${aggregateId}:disturbance:${value.disturbanceOrdinal.toString(36)}`
    || !nonnegativeSafeInteger(value.atTick)
    || value.atTick > maximumTick
    || !AGGREGATE_DISTURBANCE_CAUSES.has(value.causeKind as string)
    || (value.causeKind === "tide-pressure"
      && coreEcologyAggregateSpeciesPolicy(species).tideResponse === "neutral")
    || typeof value.causeReferenceId !== "string"
    || !ACTOR_REFERENCE_PATTERN.test(value.causeReferenceId)
    || !nonnegativeSafeInteger(value.fromAnchorOrdinal)
    || value.fromAnchorOrdinal >= anchorCount
    || !nonnegativeSafeInteger(value.toAnchorOrdinal)
    || value.toAnchorOrdinal >= anchorCount
    || value.fromAnchorOrdinal === value.toAnchorOrdinal
    || !positiveSafeInteger(value.displacedUnits)
    || value.displacedUnits > maximumUnits
    || !fixedInteger(value.pressure)
    || value.pressure === 0
    || value.nonlethal !== true
    || value.cargoInteraction !== false
    || value.itemConsumption !== "none"
  ) return null;
  return Object.freeze({
    disturbanceId: value.disturbanceId,
    disturbanceOrdinal: value.disturbanceOrdinal,
    atTick: value.atTick,
    causeKind: value.causeKind as CoreEcologyAggregateDisturbance["causeKind"],
    causeReferenceId: value.causeReferenceId,
    fromAnchorOrdinal: value.fromAnchorOrdinal,
    toAnchorOrdinal: value.toAnchorOrdinal,
    displacedUnits: value.displacedUnits,
    pressure: value.pressure,
    nonlethal: true,
    cargoInteraction: false,
    itemConsumption: "none",
  });
}

interface CanonicalCoreEcologyMortalityLedger {
  readonly transactions: readonly CoreEcologyMortalityTransaction[];
  readonly carcasses: readonly CoreWildlifeCarcass[];
}

function canonicalMortalityLedger(input: Readonly<{
  readonly rawTransactions: readonly unknown[];
  readonly rawCarcasses: readonly unknown[];
  readonly nextMortalityOrdinal: number;
  readonly populations: readonly CoreEcologyPopulationState[];
  readonly liveActorIds: ReadonlySet<string>;
  readonly originRegion: RegionCoord;
  readonly maximumTick: number;
  /** Legacy regional owners may retain references whose actor moved to the home owner. */
  readonly allowExternalActorReferences?: boolean;
}>): CanonicalCoreEcologyMortalityLedger | null {
  const transactions: CoreEcologyMortalityTransaction[] = [];
  const mortalityIds = new Set<string>();
  const eventIds = new Set<string>();
  const retiredActorIds = new Set<string>();
  for (const raw of input.rawTransactions) {
    const transaction = canonicalizeCoreEcologyMortalityTransaction(raw);
    if (
      transaction === null
      || transaction.event.atTick > input.maximumTick
      || transaction.retiredActor.updatedAtTick > input.maximumTick
      || transaction.retiredActor.identity.originRegion.x !== input.originRegion.x
      || transaction.retiredActor.identity.originRegion.y !== input.originRegion.y
      || input.liveActorIds.has(transaction.retiredActor.identity.stableId)
      || mortalityIds.has(transaction.mortalityId)
      || eventIds.has(transaction.event.eventId)
      || retiredActorIds.has(transaction.retiredActor.identity.stableId)
    ) return null;
    mortalityIds.add(transaction.mortalityId);
    eventIds.add(transaction.event.eventId);
    retiredActorIds.add(transaction.retiredActor.identity.stableId);
    transactions.push(transaction);
  }
  transactions.sort((left, right) => left.mortalityOrdinal - right.mortalityOrdinal);
  if (
    input.nextMortalityOrdinal !== transactions.length
    || transactions.some((transaction, index) => transaction.mortalityOrdinal !== index)
  ) return null;

  const actorRetirements = new Map<string, Readonly<{
    tick: number;
    mortalityOrdinal: number;
  }>>();
  for (const transaction of transactions) {
    actorRetirements.set(
      transaction.retiredActor.identity.stableId,
      Object.freeze({
        tick: transaction.retiredActor.updatedAtTick,
        mortalityOrdinal: transaction.mortalityOrdinal,
      }),
    );
  }
  const currentActorTicks = new Map<string, number>();
  for (const population of input.populations) {
    for (const member of population.members) {
      currentActorTicks.set(member.actor.identity.stableId, member.actor.updatedAtTick);
    }
  }
  // New deaths are gated against the current species policy before commit.
  // Once committed, the canonical event and body are history: reapplying
  // today's reach, damage, or body-yield tuning here would make an otherwise
  // valid old save unreadable after a balance change. Ordinary patches still
  // own the attacker; a receipt-bound legacy cohort may preserve an exact
  // historical reference after the living attacker moved to another owner.
  for (let index = 0; index < transactions.length; index += 1) {
    const transaction = transactions[index]!;
    const previous = transactions[index - 1];
    const livingAttackerTick = currentActorTicks.get(transaction.event.attackerId);
    const attackerRetirement = actorRetirements.get(transaction.event.attackerId);
    const attackerWasAliveForEvent = livingAttackerTick !== undefined
      ? livingAttackerTick >= transaction.event.atTick
      : attackerRetirement !== undefined
        && (
          attackerRetirement.tick > transaction.event.atTick
          || (
            attackerRetirement.tick === transaction.event.atTick
            && attackerRetirement.mortalityOrdinal > transaction.mortalityOrdinal
          )
        );
    if (
      (!attackerWasAliveForEvent && !input.allowExternalActorReferences)
      || (previous !== undefined && transaction.event.atTick < previous.event.atTick)
    ) return null;
  }

  const carcasses: CoreWildlifeCarcass[] = [];
  const carcassIds = new Set<string>();
  for (const raw of input.rawCarcasses) {
    const carcass = canonicalizeCoreWildlifeCarcass(raw);
    if (
      carcass === null
      || carcass.updatedAtTick > input.maximumTick
      // The patch owns identities, not a prison cell. Exact actors can cross
      // signed region seams, so their committed physical bodies may lie in an
      // adjacent region while retaining the same population owner.
      || carcassIds.has(carcass.carcassId)
      || (carcass.currentClaimantActorId !== null
        && !input.liveActorIds.has(carcass.currentClaimantActorId)
        && !input.allowExternalActorReferences)
    ) return null;
    carcassIds.add(carcass.carcassId);
    carcasses.push(carcass);
  }
  carcasses.sort((left, right) => compareText(left.carcassId, right.carcassId));
  if (carcasses.length !== transactions.length) return null;
  const carcassById = new Map(carcasses.map((carcass) => [carcass.carcassId, carcass] as const));
  for (const transaction of transactions) {
    const carcass = carcassById.get(transaction.carcassId);
    if (
      carcass === undefined
      || carcass.sourceMortalityEventId !== transaction.event.eventId
      || carcass.sourceActorId !== transaction.event.victimId
      || carcass.sourceSpecies !== transaction.retiredActor.identity.species
      || carcass.deathAtTick !== transaction.event.atTick
      || !sameWorldPosition(carcass.deathPosition, transaction.event.victimPosition)
    ) return null;
    carcassById.delete(transaction.carcassId);
  }
  if (carcassById.size !== 0) return null;

  const transactionsByPopulation = new Map<string, CoreEcologyMortalityTransaction[]>();
  for (const transaction of transactions) {
    const actor = transaction.retiredActor;
    const key = `${actor.identity.species}:${actor.identity.populationKey}`;
    const population = input.populations.find((candidate) => (
      candidate.species === actor.identity.species
      && candidate.populationKey === actor.identity.populationKey
    ));
    if (population === undefined) return null;
    const bucket = transactionsByPopulation.get(key) ?? [];
    bucket.push(transaction);
    transactionsByPopulation.set(key, bucket);
  }
  for (const population of input.populations) {
    const key = `${population.species}:${population.populationKey}`;
    const retired = transactionsByPopulation.get(key) ?? [];
    if (
      population.baselinePopulationSize - population.populationSize !== retired.length
      || population.reserveUnits !== retired.reduce(
        (total, transaction) => total + transaction.representedUnitsBefore - 1,
        0,
      )
    ) return null;
    const ordinals = new Set(population.members.map(({ populationOrdinal }) => populationOrdinal));
    for (const transaction of retired) {
      const ordinal = transaction.retiredActor.identity.populationOrdinal;
      if (ordinals.has(ordinal)) return null;
      ordinals.add(ordinal);
    }
  }
  return Object.freeze({
    transactions: Object.freeze(transactions),
    carcasses: Object.freeze(carcasses),
  });
}

function canonicalPopulation(
  value: unknown,
  originRegion: RegionCoord,
  maximumTick: number,
  actorIds: Set<string>,
  allowedSpecies: (value: unknown) => value is CoreWildlifeSpecies,
): CoreEcologyPopulationState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "baselinePopulationSize",
    "members",
    "populationKey",
    "populationSize",
    "reserveUnits",
    "species",
  ])) return null;
  if (
    !allowedSpecies(value.species)
    || !validPatchKey(value.populationKey)
    || !positiveSafeInteger(value.baselinePopulationSize)
    || !nonnegativeSafeInteger(value.populationSize)
    || value.populationSize > value.baselinePopulationSize
    || !nonnegativeSafeInteger(value.reserveUnits)
    || value.reserveUnits > value.populationSize
    || !Array.isArray(value.members)
  ) return null;
  const species = value.species as CoreWildlifeSpecies;
  if (
    value.members.length > getCoreWildlifeProfile(species).maximumPatchPopulation
    || value.baselinePopulationSize > getCoreWildlifeProfile(species).maximumPatchPopulation
  ) return null;
  const members: CoreEcologyPopulationMemberState[] = [];
  let representedPopulation = 0;
  for (const raw of value.members) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "actor",
      "materialization",
      "populationOrdinal",
      "representedUnits",
    ])) return null;
    if (
      !nonnegativeSafeInteger(raw.populationOrdinal)
      || !positiveSafeInteger(raw.representedUnits)
      || !MATERIALIZATION.has(raw.materialization as string)
    ) return null;
    const actor = canonicalizeCoreWildlifeActorState(raw.actor);
    if (
      actor === null
      || actor.condition.health === 0
      || actor.updatedAtTick > maximumTick
      || actor.identity.species !== species
      || actor.identity.populationKey !== value.populationKey
      || actor.identity.populationOrdinal !== raw.populationOrdinal
      || actor.identity.originRegion.x !== originRegion.x
      || actor.identity.originRegion.y !== originRegion.y
      || actorIds.has(actor.identity.stableId)
    ) return null;
    actorIds.add(actor.identity.stableId);
    representedPopulation += raw.representedUnits;
    if (!Number.isSafeInteger(representedPopulation)) return null;
    members.push(Object.freeze({
      populationOrdinal: raw.populationOrdinal,
      representedUnits: raw.representedUnits,
      materialization: raw.materialization as CoreWildlifeMaterialization,
      actor,
    }));
  }
  members.sort(compareMember);
  for (let index = 1; index < members.length; index += 1) {
    if (members[index - 1]?.populationOrdinal === members[index]?.populationOrdinal) return null;
  }
  if (
    representedPopulation + value.reserveUnits !== value.populationSize
    || (value.populationSize === 0 && value.members.length !== 0)
  ) return null;
  return Object.freeze({
    species,
    populationKey: value.populationKey,
    baselinePopulationSize: value.baselinePopulationSize,
    populationSize: value.populationSize,
    reserveUnits: value.reserveUnits,
    members: Object.freeze(members),
  });
}

function canonicalPatchStepInput(
  value: unknown,
  patch: CoreEcologyVersionedPatchState,
): CoreEcologyPatchStepInput | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["actorSteps", "tick"])
    || !nonnegativeSafeInteger(value.tick)
    || value.tick <= patch.updatedAtTick
    || value.tick - patch.updatedAtTick > CORE_ECOLOGY_MAX_STEP_TICKS
    || value.tick > Number.MAX_SAFE_INTEGER - 64
    || !Array.isArray(value.actorSteps)
  ) return null;
  const materializedIds = allMembers(patch)
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actor.identity.stableId)
    .sort(compareText);
  if (value.actorSteps.length !== materializedIds.length) return null;
  const actorSteps: CoreEcologyActorStepInput[] = [];
  for (const raw of value.actorSteps) {
    if (!plainRecord(raw) || !requiredAndOptionalKeys(
      raw,
      ["accessibility", "actorId", "foodOpportunities", "observations"],
      ["neutralActivityPreference", "regroupOpportunity"],
    )) return null;
    if (
      typeof raw.actorId !== "string"
      || !Array.isArray(raw.observations)
      || !Array.isArray(raw.foodOpportunities)
    ) return null;
    if (
      raw.neutralActivityPreference !== undefined
      && raw.neutralActivityPreference !== "observe"
      && raw.neutralActivityPreference !== "rest"
    ) return null;
    actorSteps.push({
      actorId: raw.actorId,
      observations: raw.observations as readonly ActorObservation[],
      foodOpportunities: raw.foodOpportunities as readonly CoreWildlifeFoodOpportunity[],
      accessibility: raw.accessibility as CoreWildlifeActionAccessibility,
      ...(raw.neutralActivityPreference === undefined
        ? {}
        : { neutralActivityPreference: raw.neutralActivityPreference }),
      ...(raw.regroupOpportunity === undefined
        ? {}
        : { regroupOpportunity: raw.regroupOpportunity as CoreWildlifeRegroupOpportunity }),
    });
  }
  actorSteps.sort((left, right) => compareText(left.actorId, right.actorId));
  if (actorSteps.some((step, index) => step.actorId !== materializedIds[index])) return null;
  return { tick: value.tick, actorSteps: Object.freeze(actorSteps) };
}

function canonicalDerivation(value: unknown): CoreEcologyPatchDerivation | null {
  if (!plainRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "bounded-input-v1" || value.kind === "legacy-fixed-v1") {
    return exactKeys(value, ["kind"])
      ? Object.freeze({ kind: value.kind })
      : null;
  }
  if (value.kind !== "habitat-v1" || !exactKeys(value, ["habitat", "kind"])) return null;
  const habitat = canonicalizeCoreEcologyHabitatAssemblage(value.habitat);
  return habitat === null ? null : Object.freeze({ kind: "habitat-v1", habitat });
}

const REGIONAL_HABITAT_GUILDS = Object.freeze([
  "aerial-forager",
  "apex-predator",
  "aquatic-prey",
  "large-herbivore",
  "large-omnivore",
  "mesopredator",
  "small-prey",
  "tidal-detritivore",
  "wetland-bird",
] as const satisfies readonly CoreEcologyRegionalGuild[]);
const REGIONAL_HABITAT_ADMISSION_REASONS = new Set<string>([
  "admitted",
  "density-budget-exhausted",
  "density-roll-failed",
  "habitat-capacity-zero",
  "regional-quiet",
  "territory-owned-elsewhere",
  "unsupported-predator",
]);
const REGIONAL_HABITAT_TERRAIN_KEYS = Object.freeze([
  "deep-water",
  "tidal-flat",
  "marsh",
  "meadow",
  "ridge",
] as const);
const REGIONAL_HABITAT_BIOME_KEYS = Object.freeze([
  "tide-channel",
  "brine-flat",
  "reed-marsh",
  "rain-meadow",
  "sun-meadow",
  "wind-ridge",
  "glimmerfen",
] as const);

function canonicalRegionalHabitat(value: unknown): CoreEcologyRegionalHabitat | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedSpeciesCount",
    "catalogSpeciesCount",
    "cell",
    "density",
    "derivationHash",
    "evaluatedWildSpeciesCount",
    "ownerId",
    "populations",
    "region",
    "regionId",
    "summary",
    "terrainHash",
    "totalPopulationUnits",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_REGIONAL_HABITAT_VERSION
    || value.ownerId !== CORE_ECOLOGY_REGIONAL_HABITAT_OWNER_ID
    || !isRegionCoord(value.region)
    || !regionalHabitatId(value.regionId)
    || !regionalHabitatHash(value.terrainHash)
    || !regionalHabitatHash(value.derivationHash)
    || value.catalogSpeciesCount !== CORE_ECOLOGY_REGIONAL_HABITAT_CATALOG_SPECIES_COUNT
    || value.evaluatedWildSpeciesCount !== CORE_ECOLOGY_REGIONAL_WILD_SPECIES.length
    || !nonnegativeSafeInteger(value.totalPopulationUnits)
    || !nonnegativeSafeInteger(value.admittedSpeciesCount)
    || !Array.isArray(value.populations)
    || value.populations.length !== CORE_ECOLOGY_REGIONAL_WILD_SPECIES.length
    || !canonicalRegionalCell(value.cell, value.region)
    || !canonicalRegionalSummary(value.summary)
    || !canonicalRegionalDensity(value.density)
  ) return null;
  const candidateIds = new Set<string>();
  const populationKeys = new Set<string>();
  const anchorIds = new Set<string>();
  const anchorTiles = new Set<number>();
  let totalPopulationUnits = 0;
  let admittedSpeciesCount = 0;
  const guildTotals = new Map<CoreEcologyRegionalGuild, number>();
  const speciesOrder: string[] = [];
  for (const candidate of value.populations) {
    if (!canonicalRegionalPopulation(
      candidate,
      value.region,
      value.summary,
      value.density,
      candidateIds,
      populationKeys,
      anchorIds,
      anchorTiles,
    )) return null;
    speciesOrder.push(candidate.species);
    totalPopulationUnits += candidate.populationUnits;
    if (!Number.isSafeInteger(totalPopulationUnits)) return null;
    if (candidate.populationUnits > 0) admittedSpeciesCount += 1;
    guildTotals.set(
      candidate.guild,
      (guildTotals.get(candidate.guild) ?? 0) + candidate.populationUnits,
    );
  }
  if (
    speciesOrder.some((species, index) => species !== CORE_ECOLOGY_REGIONAL_WILD_SPECIES[index])
    || totalPopulationUnits !== value.totalPopulationUnits
    || admittedSpeciesCount !== value.admittedSpeciesCount
  ) return null;
  const density = value.density as Record<string, unknown>;
  const guildCeilings = density.guildCeilings as Record<string, unknown>;
  for (const [guild, units] of guildTotals) {
    if (units > (guildCeilings[guild] as number)) return null;
  }
  const { derivationHash: _derivationHash, ...base } = value;
  if (hashCanonical(base) !== value.derivationHash) return null;
  try {
    return deepFreeze(JSON.parse(stableStringify(value)) as CoreEcologyRegionalHabitat);
  } catch {
    return null;
  }
}

function canonicalRegionalCell(value: unknown, region: RegionCoord): boolean {
  if (!plainRecord(value) || !exactKeys(value, [
    "address",
    "bounds",
    "spanRegions",
    "stableId",
    "version",
  ])) return false;
  if (
    value.version !== CORE_ECOLOGY_REGIONAL_HABITAT_VERSION
    || value.spanRegions !== 2
    || !regionalHabitatId(value.stableId)
    || !plainRecord(value.address)
    || !exactKeys(value.address, ["x", "y"])
    || !signedSafeInteger(value.address.x)
    || !signedSafeInteger(value.address.y)
    || !plainRecord(value.bounds)
    || !exactKeys(value.bounds, ["maximum", "minimum"])
    || !isRegionCoord(value.bounds.minimum)
    || !isRegionCoord(value.bounds.maximum)
  ) return false;
  const addressX = Math.floor(region.x / 2);
  const addressY = Math.floor(region.y / 2);
  const minimumX = Math.max(-REGION_COORD_LIMIT, addressX * 2);
  const minimumY = Math.max(-REGION_COORD_LIMIT, addressY * 2);
  const maximumX = Math.min(REGION_COORD_LIMIT, addressX * 2 + 1);
  const maximumY = Math.min(REGION_COORD_LIMIT, addressY * 2 + 1);
  return value.address.x === addressX
    && value.address.y === addressY
    && value.bounds.minimum.x === minimumX
    && value.bounds.minimum.y === minimumY
    && value.bounds.maximum.x === maximumX
    && value.bounds.maximum.y === maximumY;
}

function canonicalRegionalSummary(value: unknown): boolean {
  if (!plainRecord(value) || !exactKeys(value, [
    "aquaticProductivity",
    "averageElevation",
    "averageExposure",
    "averageHeat",
    "averageMoisture",
    "averageRainfall",
    "averageRoughness",
    "biomeTileCounts",
    "carryingSignal",
    "cover",
    "shoreTileCount",
    "terrainDiversity",
    "terrainTileCounts",
    "terrestrialProductivity",
    "tileCount",
  ])) return false;
  if (
    value.tileCount !== WORLD_WIDTH * WORLD_HEIGHT
    || !nonnegativeSafeInteger(value.shoreTileCount)
    || value.shoreTileCount > value.tileCount
    || !REGIONAL_HABITAT_SUMMARY_FIXED_FIELDS.every((field) => fixedInteger(value[field]))
    || !canonicalRegionalCountRecord(value.terrainTileCounts, REGIONAL_HABITAT_TERRAIN_KEYS, value.tileCount)
    || !canonicalRegionalCountRecord(value.biomeTileCounts, REGIONAL_HABITAT_BIOME_KEYS, value.tileCount)
  ) return false;
  return true;
}

const REGIONAL_HABITAT_SUMMARY_FIXED_FIELDS = Object.freeze([
  "aquaticProductivity",
  "averageElevation",
  "averageExposure",
  "averageHeat",
  "averageMoisture",
  "averageRainfall",
  "averageRoughness",
  "carryingSignal",
  "cover",
  "terrainDiversity",
  "terrestrialProductivity",
] as const);

function canonicalRegionalCountRecord(
  value: unknown,
  keys: readonly string[],
  expectedTotal: number,
): boolean {
  if (!plainRecord(value) || !exactKeys(value, keys)) return false;
  let total = 0;
  for (const key of keys) {
    const count = value[key];
    if (!nonnegativeSafeInteger(count)) return false;
    total += count;
  }
  return total === expectedTotal;
}

function canonicalRegionalDensity(value: unknown): boolean {
  if (!plainRecord(value) || !exactKeys(value, [
    "guildCeilings",
    "regionalQuiet",
    "regionalQuietRoll",
    "regionalQuietThreshold",
  ])) return false;
  return typeof value.regionalQuiet === "boolean"
    && fixedInteger(value.regionalQuietRoll)
    && fixedInteger(value.regionalQuietThreshold)
    && canonicalRegionalIntegerRecord(value.guildCeilings, REGIONAL_HABITAT_GUILDS);
}

function canonicalRegionalIntegerRecord(value: unknown, keys: readonly string[]): boolean {
  if (!plainRecord(value) || !exactKeys(value, keys)) return false;
  return keys.every((key) => nonnegativeSafeInteger(value[key]));
}

function canonicalRegionalPopulation(
  value: unknown,
  region: RegionCoord,
  summaryValue: unknown,
  densityValue: unknown,
  candidateIds: Set<string>,
  populationKeys: Set<string>,
  anchorIds: Set<string>,
  anchorTiles: Set<number>,
): value is CoreEcologyRegionalPopulationCandidate {
  if (!plainRecord(value) || !exactKeys(value, [
    "actorRepresentation",
    "admissionReason",
    "anchors",
    "densityRoll",
    "densityThreshold",
    "guild",
    "guildCeiling",
    "habitatCapacity",
    "habitatScore",
    "populationKey",
    "populationUnits",
    "preySupportUnits",
    "species",
    "stableId",
    "suitableTileCount",
    "territoryHostRegion",
    "territoryId",
    "territoryOwnedHere",
    "trophicCeiling",
    "version",
  ])) return false;
  if (
    value.version !== CORE_ECOLOGY_REGIONAL_HABITAT_VERSION
    || !CORE_ECOLOGY_REGIONAL_WILD_SPECIES.includes(value.species as CoreWildlifeSpecies)
    || !REGIONAL_HABITAT_GUILDS.includes(value.guild as CoreEcologyRegionalGuild)
    || value.guild !== coreEcologyRegionalGuildForSpecies(value.species as CoreWildlifeSpecies)
    || value.actorRepresentation
      !== getCoreWildlifeSpeciesMetadata(value.species as CoreWildlifeSpecies).actorRepresentation
    || !regionalHabitatId(value.stableId)
    || candidateIds.has(value.stableId)
    || !validPatchKey(value.populationKey)
    || populationKeys.has(value.populationKey)
    || !regionalHabitatId(value.territoryId)
    || !isRegionCoord(value.territoryHostRegion)
    || typeof value.territoryOwnedHere !== "boolean"
    || (value.territoryOwnedHere && (
      value.territoryHostRegion.x !== region.x || value.territoryHostRegion.y !== region.y
    ))
    || !fixedInteger(value.habitatScore)
    || !nonnegativeSafeInteger(value.suitableTileCount)
    || !plainRecord(summaryValue)
    || !nonnegativeSafeInteger(summaryValue.tileCount)
    || value.suitableTileCount > summaryValue.tileCount
    || !nonnegativeSafeInteger(value.habitatCapacity)
    || value.habitatCapacity > getCoreWildlifeProfile(value.species as CoreWildlifeSpecies).maximumPatchPopulation
    || !fixedInteger(value.densityRoll)
    || !fixedInteger(value.densityThreshold)
    || !nonnegativeSafeInteger(value.preySupportUnits)
    || !nonnegativeSafeInteger(value.trophicCeiling)
    || !nonnegativeSafeInteger(value.guildCeiling)
    || !plainRecord(densityValue)
    || !plainRecord(densityValue.guildCeilings)
    || value.guildCeiling !== densityValue.guildCeilings[value.guild as string]
    || !nonnegativeSafeInteger(value.populationUnits)
    || value.populationUnits > value.habitatCapacity
    || !REGIONAL_HABITAT_ADMISSION_REASONS.has(value.admissionReason as string)
    || !Array.isArray(value.anchors)
    || value.anchors.length > CORE_ECOLOGY_MAX_AGGREGATE_ANCHORS
  ) return false;
  const admitted = value.populationUnits > 0;
  if (
    admitted !== (value.admissionReason === "admitted")
    || admitted !== (value.anchors.length > 0)
    || (admitted && !value.territoryOwnedHere)
    || (value.admissionReason === "territory-owned-elsewhere" && value.territoryOwnedHere)
  ) return false;
  let allocatedPopulation = 0;
  for (const anchor of value.anchors) {
    if (!plainRecord(anchor) || !exactKeys(anchor, [
      "allocatedPopulation",
      "globalX",
      "globalY",
      "habitatScore",
      "localX",
      "localY",
      "stableId",
    ])) return false;
    if (
      !regionalHabitatId(anchor.stableId)
      || anchorIds.has(anchor.stableId)
      || !nonnegativeSafeInteger(anchor.localX)
      || anchor.localX >= WORLD_WIDTH
      || !nonnegativeSafeInteger(anchor.localY)
      || anchor.localY >= WORLD_HEIGHT
      || !signedSafeInteger(anchor.globalX)
      || !signedSafeInteger(anchor.globalY)
      || !fixedInteger(anchor.habitatScore)
      || !positiveSafeInteger(anchor.allocatedPopulation)
    ) return false;
    const global = regionLocalToGlobalTile(region, anchor.localX, anchor.localY);
    const tileKey = anchor.localY * WORLD_WIDTH + anchor.localX;
    if (
      anchor.globalX !== global.x
      || anchor.globalY !== global.y
      || anchorTiles.has(tileKey)
    ) return false;
    anchorIds.add(anchor.stableId);
    anchorTiles.add(tileKey);
    allocatedPopulation += anchor.allocatedPopulation;
  }
  if (allocatedPopulation !== value.populationUnits) return false;
  candidateIds.add(value.stableId);
  populationKeys.add(value.populationKey);
  return true;
}

function regionalHabitatHash(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/u.test(value);
}

function regionalHabitatId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function signedSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function canonicalRegionalSuppression(
  value: unknown,
): CoreEcologyRegionalAdoptionSuppressionManifestV1 | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "actorSlots",
    "adoptionTransactionId",
    "aggregateSlots",
    "baselineHash",
    "sourcePatchHash",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_REGIONAL_ADOPTION_SUPPRESSION_VERSION
    || typeof value.adoptionTransactionId !== "string"
    || !LEGACY_COHORT_TRANSACTION_PATTERN.test(value.adoptionTransactionId)
    || typeof value.sourcePatchHash !== "string"
    || !CANONICAL_HASH_PATTERN.test(value.sourcePatchHash)
    || !regionalHabitatHash(value.baselineHash)
    || !Array.isArray(value.actorSlots)
    || value.actorSlots.length > CORE_ECOLOGY_MAX_MEMBERS
    || !Array.isArray(value.aggregateSlots)
    || value.aggregateSlots.length > CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS
    || value.actorSlots.length + value.aggregateSlots.length === 0
  ) return null;

  const actorSlots: CoreEcologyRegionalAdoptionActorSlotV1[] = [];
  const actorIds = new Set<string>();
  const baselineSlotIds = new Set<string>();
  for (const raw of value.actorSlots) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "baselineActorId",
      "baselinePopulationId",
      "baselineUnitOffset",
      "legacyActorId",
      "species",
      "suppressedBaselineUnits",
    ])) return null;
    if (
      typeof raw.baselineActorId !== "string"
      || !ACTOR_REFERENCE_PATTERN.test(raw.baselineActorId)
      || !regionalHabitatId(raw.baselinePopulationId)
      || !nonnegativeSafeInteger(raw.baselineUnitOffset)
      || typeof raw.legacyActorId !== "string"
      || !ACTOR_REFERENCE_PATTERN.test(raw.legacyActorId)
      || raw.baselineActorId === raw.legacyActorId
      || !isCurrentIndividualSpecies(raw.species)
      || !positiveSafeInteger(raw.suppressedBaselineUnits)
      || raw.baselineUnitOffset + raw.suppressedBaselineUnits > Number.MAX_SAFE_INTEGER
      || raw.baselineActorId !== regionalSuppressionSlotId(
        raw.baselinePopulationId,
        raw.baselineUnitOffset,
        raw.suppressedBaselineUnits,
      )
      || baselineSlotIds.has(raw.baselineActorId)
      || actorIds.has(raw.legacyActorId)
    ) return null;
    baselineSlotIds.add(raw.baselineActorId);
    actorIds.add(raw.legacyActorId);
    actorSlots.push(Object.freeze({
      baselineActorId: raw.baselineActorId,
      baselinePopulationId: raw.baselinePopulationId,
      baselineUnitOffset: raw.baselineUnitOffset,
      legacyActorId: raw.legacyActorId,
      species: raw.species,
      suppressedBaselineUnits: raw.suppressedBaselineUnits,
    }));
  }
  actorSlots.sort(compareRegionalSuppressionActorSlot);
  for (let index = 1; index < actorSlots.length; index += 1) {
    const prior = actorSlots[index - 1]!;
    const current = actorSlots[index]!;
    if (
      prior.baselinePopulationId === current.baselinePopulationId
      && current.baselineUnitOffset
        < prior.baselineUnitOffset + prior.suppressedBaselineUnits
    ) return null;
  }

  const aggregateSlots: CoreEcologyRegionalAdoptionAggregateSlotV1[] = [];
  const aggregateIds = new Set<string>();
  const aggregatePopulations = new Set<string>();
  for (const raw of value.aggregateSlots) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "baselinePopulationId",
      "legacyAggregateId",
      "species",
      "suppressedBaselineUnits",
    ])) return null;
    if (
      !regionalHabitatId(raw.baselinePopulationId)
      || typeof raw.legacyAggregateId !== "string"
      || !ACTOR_REFERENCE_PATTERN.test(raw.legacyAggregateId)
      || raw.baselinePopulationId === raw.legacyAggregateId
      || !isCoreEcologyAggregateSpecies(raw.species)
      || !positiveSafeInteger(raw.suppressedBaselineUnits)
      || aggregatePopulations.has(raw.baselinePopulationId)
      || aggregateIds.has(raw.legacyAggregateId)
      || actorIds.has(raw.legacyAggregateId)
    ) return null;
    aggregatePopulations.add(raw.baselinePopulationId);
    aggregateIds.add(raw.legacyAggregateId);
    aggregateSlots.push(Object.freeze({
      baselinePopulationId: raw.baselinePopulationId,
      legacyAggregateId: raw.legacyAggregateId,
      species: raw.species,
      suppressedBaselineUnits: raw.suppressedBaselineUnits,
    }));
  }
  aggregateSlots.sort(compareRegionalSuppressionAggregateSlot);

  return deepFreeze({
    version: CORE_ECOLOGY_REGIONAL_ADOPTION_SUPPRESSION_VERSION,
    adoptionTransactionId: value.adoptionTransactionId,
    sourcePatchHash: value.sourcePatchHash,
    baselineHash: value.baselineHash,
    actorSlots,
    aggregateSlots,
  });
}

function canonicalSettlementHomeLegacySuppression(
  value: unknown,
): CoreEcologySettlementHomeLegacySuppressionV1 | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "retirements",
    "sourcePatchHash",
    "version",
  ])) return null;
  if (
    value.version !== 1
    || typeof value.sourcePatchHash !== "string"
    || !CANONICAL_HASH_PATTERN.test(value.sourcePatchHash)
    || !Array.isArray(value.retirements)
    || value.retirements.length === 0
    || value.retirements.length > CORE_ECOLOGY_MAX_MORTALITY_TRANSACTIONS
  ) return null;
  const domestic = new Set<CoreWildlifeSpecies>(CORE_ECOLOGY_DOMESTIC_SPECIES);
  const actorIds = new Set<string>();
  const allocationKeys = new Set<string>();
  const retirements: CoreEcologySettlementHomeLegacyRetirementV1[] = [];
  for (const raw of value.retirements) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "legacyActorId",
      "populationKey",
      "populationOrdinal",
      "representedUnitsBefore",
      "species",
    ])) return null;
    const allocationKey = `${raw.species}:${raw.populationKey}:${raw.populationOrdinal}`;
    if (
      typeof raw.legacyActorId !== "string"
      || !ACTOR_REFERENCE_PATTERN.test(raw.legacyActorId)
      || !domestic.has(raw.species as CoreWildlifeSpecies)
      || !validPatchKey(raw.populationKey)
      || !nonnegativeSafeInteger(raw.populationOrdinal)
      || !positiveSafeInteger(raw.representedUnitsBefore)
      || actorIds.has(raw.legacyActorId)
      || allocationKeys.has(allocationKey)
    ) return null;
    actorIds.add(raw.legacyActorId);
    allocationKeys.add(allocationKey);
    retirements.push(Object.freeze({
      legacyActorId: raw.legacyActorId,
      species: raw.species as CoreWildlifeSpecies,
      populationKey: raw.populationKey,
      populationOrdinal: raw.populationOrdinal,
      representedUnitsBefore: raw.representedUnitsBefore,
    }));
  }
  retirements.sort((left, right) => compareText(left.legacyActorId, right.legacyActorId));
  return deepFreeze({
    version: 1,
    sourcePatchHash: value.sourcePatchHash,
    retirements,
  });
}

function regionalSuppressionMatchesHabitat(
  habitat: CoreEcologyRegionalHabitat,
  suppression: CoreEcologyRegionalAdoptionSuppressionManifestV1,
): boolean {
  if (suppression.baselineHash !== habitat.derivationHash) return false;
  for (const slot of suppression.actorSlots) {
    const population = habitat.populations.find(({ stableId }) => (
      stableId === slot.baselinePopulationId
    ));
    if (
      population === undefined
      || population.species !== slot.species
      || population.actorRepresentation !== "individual"
      || slot.baselineUnitOffset + slot.suppressedBaselineUnits
        > population.populationUnits
    ) return false;
  }
  for (const slot of suppression.aggregateSlots) {
    const population = habitat.populations.find(({ stableId }) => (
      stableId === slot.baselinePopulationId
    ));
    if (
      population === undefined
      || population.species !== slot.species
      || population.actorRepresentation !== "aggregate"
      || slot.suppressedBaselineUnits > population.populationUnits
    ) return false;
  }
  return true;
}

function compareRegionalSuppressionActorSlot(
  left: CoreEcologyRegionalAdoptionActorSlotV1,
  right: CoreEcologyRegionalAdoptionActorSlotV1,
): number {
  return compareText(left.baselinePopulationId, right.baselinePopulationId)
    || left.baselineUnitOffset - right.baselineUnitOffset
    || compareText(left.legacyActorId, right.legacyActorId);
}

function compareRegionalSuppressionAggregateSlot(
  left: CoreEcologyRegionalAdoptionAggregateSlotV1,
  right: CoreEcologyRegionalAdoptionAggregateSlotV1,
): number {
  return compareText(left.baselinePopulationId, right.baselinePopulationId)
    || compareText(left.legacyAggregateId, right.legacyAggregateId);
}

function regionalSuppressionSlotId(
  populationId: string,
  startUnit: number,
  units: number,
): string {
  return `regional-baseline-slot:${hashCanonical([populationId, startUnit, units])}`;
}

function canonicalAggregateDerivation(
  value: unknown,
): CoreEcologyAggregatePatchDerivation | null {
  if (!plainRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "legacy-cohort-v1") {
    if (!exactKeys(value, [
      "adoptionTransactionId",
      "kind",
      "rootSeedFingerprint",
      "sourcePatchHash",
    ])) return null;
    if (
      typeof value.adoptionTransactionId !== "string"
      || !LEGACY_COHORT_TRANSACTION_PATTERN.test(value.adoptionTransactionId)
      || typeof value.rootSeedFingerprint !== "string"
      || !CANONICAL_HASH_PATTERN.test(value.rootSeedFingerprint)
      || typeof value.sourcePatchHash !== "string"
      || !CANONICAL_HASH_PATTERN.test(value.sourcePatchHash)
    ) return null;
    return Object.freeze({
      kind: "legacy-cohort-v1",
      adoptionTransactionId: value.adoptionTransactionId,
      rootSeedFingerprint: value.rootSeedFingerprint,
      sourcePatchHash: value.sourcePatchHash,
    });
  }
  if (value.kind === "regional-habitat-v1") {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalRegionalHabitat(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: "regional-habitat-v1", habitat });
  }
  if (value.kind === "regional-habitat-v1-with-adoption-suppression") {
    if (!exactKeys(value, ["habitat", "kind", "suppression"])) return null;
    const habitat = canonicalRegionalHabitat(value.habitat);
    const suppression = canonicalRegionalSuppression(value.suppression);
    return habitat === null
      || suppression === null
      || !regionalSuppressionMatchesHabitat(habitat, suppression)
      ? null
      : Object.freeze({
          kind: "regional-habitat-v1-with-adoption-suppression",
          habitat,
          suppression,
        });
  }
  if (value.kind === "regional-alpine-v1") {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyAlpineHabitat(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: "regional-alpine-v1", habitat });
  }
  if (
    value.kind === "habitat-v2"
    || value.kind === "legacy-fixed-v1-with-habitat-v2"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyHarborEdgeHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v3"
    || value.kind === "legacy-fixed-v1-with-habitat-v3"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyMarshEdgeHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v4"
    || value.kind === "legacy-fixed-v1-with-habitat-v4"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyRainChorusHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v5"
    || value.kind === "legacy-fixed-v1-with-habitat-v5"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyTidalTableHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v6"
    || value.kind === "legacy-fixed-v1-with-habitat-v6"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyWaterfowlHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v7"
    || value.kind === "legacy-fixed-v1-with-habitat-v7"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyTidalWebHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v8"
    || value.kind === "legacy-fixed-v1-with-habitat-v8"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyDomesticYardHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v9"
    || value.kind === "legacy-fixed-v1-with-habitat-v9"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyDomesticPenHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v10"
    || value.kind === "legacy-fixed-v1-with-habitat-v10"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyRegionalUplandHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (
    value.kind === "habitat-v11"
    || value.kind === "legacy-fixed-v1-with-habitat-v11"
  ) {
    if (!exactKeys(value, ["habitat", "kind"])) return null;
    const habitat = canonicalizeCoreEcologyRegionalPredatorHabitatAssemblage(value.habitat);
    return habitat === null
      ? null
      : Object.freeze({ kind: value.kind, habitat });
  }
  if (value.kind === "settlement-home-v1") {
    if (!requiredAndOptionalKeys(value, ["habitat", "kind"], ["legacySuppression"])) {
      return null;
    }
    const habitat = canonicalizeCoreEcologyRegionalPredatorHabitatAssemblage(value.habitat);
    if (habitat === null) return null;
    if (value.legacySuppression === undefined) {
      return Object.freeze({ kind: "settlement-home-v1", habitat });
    }
    const legacySuppression = canonicalSettlementHomeLegacySuppression(
      value.legacySuppression,
    );
    return legacySuppression === null
      ? null
      : Object.freeze({ kind: "settlement-home-v1", habitat, legacySuppression });
  }
  return canonicalDerivation(value);
}

function derivationMatchesPopulations(
  derivation: CoreEcologyPatchDerivation,
  populations: readonly CoreEcologyPopulationState[],
  originRegion: RegionCoord,
): boolean {
  if (derivation.kind !== "habitat-v1") return true;
  if (
    derivation.habitat.originRegion.x !== originRegion.x
    || derivation.habitat.originRegion.y !== originRegion.y
  ) return false;
  const byKey = new Map(populations.map((population) => [
    `${population.species}:${population.populationKey}`,
    population,
  ] as const));
  for (const analysis of derivation.habitat.populations) {
    const population = byKey.get(`${analysis.species}:${analysis.populationKey}`);
    if (analysis.populationUnits === 0) {
      if (population !== undefined) return false;
      continue;
    }
    if (
      population === undefined
      || population.populationSize !== analysis.populationUnits
      || population.members.length !== analysis.allocations.length
    ) return false;
    for (let index = 0; index < analysis.allocations.length; index += 1) {
      const allocation = analysis.allocations[index];
      const member = population.members[index];
      if (
        allocation === undefined
        || member === undefined
        || member.populationOrdinal !== allocation.allocationOrdinal
        || member.representedUnits !== allocation.representedUnits
      ) return false;
    }
    byKey.delete(`${analysis.species}:${analysis.populationKey}`);
  }
  return byKey.size === 0;
}

function aggregateDerivationMatchesPopulations(
  derivation: CoreEcologyAggregatePatchDerivation,
  populations: readonly CoreEcologyPopulationState[],
  aggregatePopulations: readonly CoreEcologyAggregatePopulationState[],
  originRegion: RegionCoord,
  mortalityTransactions: readonly CoreEcologyMortalityTransaction[],
): boolean {
  // The regional owner authenticates this finite compatibility projection
  // against the committed v24 receipt. Generic core validation owns only its
  // bounded structural, group, mortality, and body invariants.
  if (derivation.kind === "legacy-cohort-v1") return true;
  if (derivation.kind === "settlement-home-v1") {
    return settlementHomeDerivationMatchesPopulations(
      derivation.habitat,
      populations,
      aggregatePopulations,
      originRegion,
      mortalityTransactions,
      derivation.legacySuppression ?? null,
    );
  }
  if (derivation.kind === "regional-habitat-v1") {
    return regionalDerivationMatchesPopulations(
      derivation.habitat,
      populations,
      aggregatePopulations,
      originRegion,
      mortalityTransactions,
    );
  }
  if (derivation.kind === "regional-habitat-v1-with-adoption-suppression") {
    return regionalDerivationMatchesPopulations(
      derivation.habitat,
      populations,
      aggregatePopulations,
      originRegion,
      mortalityTransactions,
      derivation.suppression,
    );
  }
  if (derivation.kind === "regional-alpine-v1") {
    return mortalityTransactions.length === 0
      && regionalDerivationMatchesPopulations(
        derivation.habitat,
        populations,
        aggregatePopulations,
        originRegion,
        mortalityTransactions,
      );
  }
  const isHarborEdgeDerivation = derivation.kind === "habitat-v2"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v2";
  const isMarshEdgeDerivation = derivation.kind === "habitat-v3"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v3";
  const isRainChorusDerivation = derivation.kind === "habitat-v4"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v4";
  const isTidalTableDerivation = derivation.kind === "habitat-v5"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v5";
  const isWaterfowlDerivation = derivation.kind === "habitat-v6"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v6";
  const isTidalWebDerivation = derivation.kind === "habitat-v7"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v7";
  const isDomesticYardDerivation = derivation.kind === "habitat-v8"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v8";
  const isDomesticPenDerivation = derivation.kind === "habitat-v9"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v9";
  const isRegionalUplandDerivation = derivation.kind === "habitat-v10"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v10";
  const isRegionalPredatorDerivation = derivation.kind === "habitat-v11"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v11";
  if (
    !isHarborEdgeDerivation
    && !isMarshEdgeDerivation
    && !isRainChorusDerivation
    && !isTidalTableDerivation
    && !isWaterfowlDerivation
    && !isTidalWebDerivation
    && !isDomesticYardDerivation
    && !isDomesticPenDerivation
    && !isRegionalUplandDerivation
    && !isRegionalPredatorDerivation
  ) {
    return mortalityTransactions.length === 0
      && aggregatePopulations.length === 0
      && derivationMatchesPopulations(derivation, populations, originRegion);
  }
  if (!("habitat" in derivation)) return false;
  const preservesLegacyRoster = derivation.kind === "legacy-fixed-v1-with-habitat-v2"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v3"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v4"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v5"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v6"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v7"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v8"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v9"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v10"
    || derivation.kind === "legacy-fixed-v1-with-habitat-v11";
  const expectedHabitatVersion = isHarborEdgeDerivation
    ? CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION
    : isMarshEdgeDerivation
    ? CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION
    : isRainChorusDerivation
    ? CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION
    : isTidalTableDerivation
    ? CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION
    : isWaterfowlDerivation
    ? CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION
    : isTidalWebDerivation
    ? CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION
    : isDomesticYardDerivation
    ? CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_VERSION
    : isDomesticPenDerivation
    ? CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION
    : isRegionalUplandDerivation
    ? CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_VERSION
    : CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_VERSION;
  if (
    derivation.habitat.generationVersion !== expectedHabitatVersion
    || derivation.habitat.originRegion.x !== originRegion.x
    || derivation.habitat.originRegion.y !== originRegion.y
  ) return false;
  const individualsByKey = new Map<string, CoreEcologyPopulationState>(populations.map((population) => [
    `${population.species}:${population.populationKey}`,
    population,
  ] as const));
  const aggregatesByKey = new Map<string, CoreEcologyAggregatePopulationState>(aggregatePopulations.map((population) => [
    `${population.species}:${population.populationKey}`,
    population,
  ] as const));
  const mortalityByKey = new Map<string, CoreEcologyMortalityTransaction[]>();
  for (const transaction of mortalityTransactions) {
    const actor = transaction.retiredActor;
    const key = `${actor.identity.species}:${actor.identity.populationKey}`;
    const values = mortalityByKey.get(key) ?? [];
    values.push(transaction);
    mortalityByKey.set(key, values);
  }
  for (const analysis of derivation.habitat.populations) {
    const key = `${analysis.species}:${analysis.populationKey}`;
    if (
      analysis.representation === "aggregate-area"
      || analysis.representation === "group-actor"
    ) {
      if (!isCoreEcologyAggregateSpecies(analysis.species)) return false;
      const policy = coreEcologyAggregateSpeciesPolicy(analysis.species);
      const population = aggregatesByKey.get(key);
      if (analysis.populationUnits === 0) {
        if (population !== undefined) return false;
        continue;
      }
      if (
        population === undefined
        || population.representation !== analysis.representation
        || population.representation !== policy.representation
        || population.populationSize !== analysis.populationUnits
        || population.habitatCapacity !== analysis.habitatCapacity
        || population.populationPressure !== analysis.populationPressure
        || population.trend !== analysis.trend
        || population.trendSignal !== analysis.trendSignal
        || population.anchors.length !== analysis.allocations.length
      ) return false;
      for (let index = 0; index < analysis.allocations.length; index += 1) {
        const allocation = analysis.allocations[index];
        const anchor = population.anchors[index];
        if (
          allocation === undefined
          || anchor === undefined
          || anchor.anchorOrdinal !== allocation.allocationOrdinal
          || anchor.position.region.x !== allocation.position.region.x
          || anchor.position.region.y !== allocation.position.region.y
          || anchor.position.localX !== allocation.position.localX
          || anchor.position.localY !== allocation.position.localY
          || anchor.radiusUnits !== WORLD_POSITION_UNITS_PER_TILE * policy.anchorRadiusTiles
          || (population.revision === 0
            && anchor.populationUnits !== allocation.representedUnits)
        ) return false;
      }
      aggregatesByKey.delete(key);
      continue;
    }
    // The authenticated extension owns only the newly introduced individual
    // species. Frozen deer/gull/bear state is validated against the published
    // legacy topology at the runtime boundary instead of being rewritten to a
    // history that did not exist in that save.
    if (
      preservesLegacyRoster
      && isWaveAIndividualSpecies(analysis.species)
    ) continue;
    const population = individualsByKey.get(key);
    const retired = mortalityByKey.get(key) ?? [];
    if (analysis.populationUnits === 0) {
      if (population !== undefined || retired.length !== 0) return false;
      continue;
    }
    if (
      population === undefined
      || population.baselinePopulationSize !== analysis.populationUnits
      || population.members.length + retired.length !== analysis.allocations.length
    ) return false;
    const allocations = new Map(analysis.allocations.map((allocation) => [
      allocation.allocationOrdinal,
      allocation,
    ] as const));
    for (const member of population.members) {
      const allocation = allocations.get(member.populationOrdinal);
      if (allocation === undefined || member.representedUnits !== allocation.representedUnits) {
        return false;
      }
      allocations.delete(member.populationOrdinal);
    }
    for (const transaction of retired) {
      const ordinal = transaction.retiredActor.identity.populationOrdinal;
      const allocation = allocations.get(ordinal);
      if (
        allocation === undefined
        || transaction.representedUnitsBefore !== allocation.representedUnits
      ) return false;
      allocations.delete(ordinal);
    }
    if (allocations.size !== 0) return false;
    individualsByKey.delete(key);
    mortalityByKey.delete(key);
  }
  return mortalityByKey.size === 0
    && aggregatesByKey.size === 0
    && (preservesLegacyRoster
      ? [...individualsByKey.values()].every(({ species }) => isWaveAIndividualSpecies(species))
      : individualsByKey.size === 0);
}

function settlementHomeDerivationMatchesPopulations(
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
  populations: readonly CoreEcologyPopulationState[],
  aggregatePopulations: readonly CoreEcologyAggregatePopulationState[],
  originRegion: RegionCoord,
  mortalityTransactions: readonly CoreEcologyMortalityTransaction[],
  legacySuppression: CoreEcologySettlementHomeLegacySuppressionV1 | null,
): boolean {
  if (
    habitat.originRegion.x !== originRegion.x
    || habitat.originRegion.y !== originRegion.y
    || (legacySuppression !== null && mortalityTransactions.length !== 0)
  ) return false;
  const domesticSpecies = new Set<CoreWildlifeSpecies>(CORE_ECOLOGY_DOMESTIC_SPECIES);
  const expectedIndividuals = habitat.populations.filter((analysis) => (
    domesticSpecies.has(analysis.species)
    && analysis.representation === "individual-representatives"
    && analysis.populationUnits > 0
  ));
  const expectedRat = habitat.populations.find((analysis) => (
    analysis.species === "brown-rat"
    && (
      analysis.representation === "aggregate-area"
      || analysis.representation === "group-actor"
    )
    && analysis.populationUnits > 0
  ));
  if (expectedRat === undefined) return false;

  const individualsByKey = new Map<string, CoreEcologyPopulationState>(populations.map((population) => [
    `${population.species}:${population.populationKey}`,
    population,
  ] as const));
  const mortalityByKey = new Map<string, CoreEcologyMortalityTransaction[]>();
  for (const transaction of mortalityTransactions) {
    const actor = transaction.retiredActor;
    if (!domesticSpecies.has(actor.identity.species)) return false;
    const key = `${actor.identity.species}:${actor.identity.populationKey}`;
    const entries = mortalityByKey.get(key) ?? [];
    entries.push(transaction);
    mortalityByKey.set(key, entries);
  }
  const suppressedByKey = new Map<string, CoreEcologySettlementHomeLegacyRetirementV1[]>();
  for (const retirement of legacySuppression?.retirements ?? []) {
    const key = `${retirement.species}:${retirement.populationKey}`;
    const entries = suppressedByKey.get(key) ?? [];
    entries.push(retirement);
    suppressedByKey.set(key, entries);
  }
  for (const analysis of expectedIndividuals) {
    const key = `${analysis.species}:${analysis.populationKey}`;
    const population = individualsByKey.get(key);
    const retired = mortalityByKey.get(key) ?? [];
    const suppressed = suppressedByKey.get(key) ?? [];
    const expectedBaselinePopulation = analysis.populationUnits - suppressed.length;
    const allocations = new Map(analysis.allocations.map((allocation) => [
      allocation.allocationOrdinal,
      allocation,
    ] as const));
    let expectedReserveUnits = 0;
    for (const retirement of suppressed) {
      const allocation = allocations.get(retirement.populationOrdinal);
      if (
        allocation === undefined
        || retirement.representedUnitsBefore !== allocation.representedUnits
      ) return false;
      expectedReserveUnits += retirement.representedUnitsBefore - 1;
      allocations.delete(retirement.populationOrdinal);
    }
    if (expectedBaselinePopulation === 0) {
      if (population !== undefined || retired.length !== 0 || allocations.size !== 0) return false;
      suppressedByKey.delete(key);
      continue;
    }
    if (
      population === undefined
      || population.baselinePopulationSize !== expectedBaselinePopulation
      || population.reserveUnits !== expectedReserveUnits
      || population.members.length + retired.length !== allocations.size
    ) return false;
    for (const member of population.members) {
      const allocation = allocations.get(member.populationOrdinal);
      if (
        allocation === undefined
        || member.representedUnits !== allocation.representedUnits
      ) return false;
      allocations.delete(member.populationOrdinal);
    }
    for (const transaction of retired) {
      const ordinal = transaction.retiredActor.identity.populationOrdinal;
      const allocation = allocations.get(ordinal);
      if (
        allocation === undefined
        || transaction.representedUnitsBefore !== allocation.representedUnits
      ) return false;
      allocations.delete(ordinal);
    }
    if (allocations.size !== 0) return false;
    individualsByKey.delete(key);
    mortalityByKey.delete(key);
    suppressedByKey.delete(key);
  }
  if (
    individualsByKey.size !== 0
    || mortalityByKey.size !== 0
    || suppressedByKey.size !== 0
  ) return false;
  if (aggregatePopulations.length !== 1) return false;
  const rat = aggregatePopulations[0];
  const policy = coreEcologyAggregateSpeciesPolicy("brown-rat");
  if (
    rat === undefined
    || rat.species !== "brown-rat"
    || rat.populationKey !== expectedRat.populationKey
    || rat.representation !== expectedRat.representation
    || rat.representation !== policy.representation
    || rat.populationSize !== expectedRat.populationUnits
    || rat.habitatCapacity !== expectedRat.habitatCapacity
    || rat.populationPressure !== expectedRat.populationPressure
    || rat.trend !== expectedRat.trend
    || rat.trendSignal !== expectedRat.trendSignal
    || rat.anchors.length !== expectedRat.allocations.length
  ) return false;
  for (let index = 0; index < expectedRat.allocations.length; index += 1) {
    const allocation = expectedRat.allocations[index];
    const anchor = rat.anchors[index];
    if (
      allocation === undefined
      || anchor === undefined
      || anchor.anchorOrdinal !== allocation.allocationOrdinal
      || !sameWorldPosition(anchor.position, allocation.position)
      || anchor.radiusUnits !== WORLD_POSITION_UNITS_PER_TILE * policy.anchorRadiusTiles
      || (rat.revision === 0 && anchor.populationUnits !== allocation.representedUnits)
    ) return false;
  }
  return true;
}

function regionalDerivationMatchesPopulations(
  habitat: CoreEcologyRegionalHabitat | CoreEcologyAlpineHabitat,
  populations: readonly CoreEcologyPopulationState[],
  aggregatePopulations: readonly CoreEcologyAggregatePopulationState[],
  originRegion: RegionCoord,
  mortalityTransactions: readonly CoreEcologyMortalityTransaction[],
  suppression: CoreEcologyRegionalAdoptionSuppressionManifestV1 | null = null,
): boolean {
  if (
    habitat.region.x !== originRegion.x
    || habitat.region.y !== originRegion.y
  ) return false;
  const individualsByKey = new Map<string, CoreEcologyPopulationState>(populations.map((population) => [
    `${population.species}:${population.populationKey}`,
    population,
  ] as const));
  const aggregatesByKey = new Map<string, CoreEcologyAggregatePopulationState>(
    aggregatePopulations.map((population) => [
      `${population.species}:${population.populationKey}`,
      population,
    ] as const),
  );
  const mortalityByKey = new Map<string, CoreEcologyMortalityTransaction[]>();
  for (const transaction of mortalityTransactions) {
    const actor = transaction.retiredActor;
    const key = `${actor.identity.species}:${actor.identity.populationKey}`;
    const values = mortalityByKey.get(key) ?? [];
    values.push(transaction);
    mortalityByKey.set(key, values);
  }
  for (const candidate of habitat.populations) {
    const key = `${candidate.species}:${candidate.populationKey}`;
    if (isCoreEcologyAggregateSpecies(candidate.species)) {
      const suppressedUnits = suppression?.aggregateSlots.find(({ baselinePopulationId }) => (
        baselinePopulationId === candidate.stableId
      ))?.suppressedBaselineUnits ?? 0;
      const expectedPopulationUnits = candidate.populationUnits - suppressedUnits;
      const population = aggregatesByKey.get(key);
      if (expectedPopulationUnits === 0) {
        if (population !== undefined) return false;
        continue;
      }
      const policy = coreEcologyAggregateSpeciesPolicy(candidate.species);
      let remainingSuppression = suppressedUnits;
      const expectedAnchors = candidate.anchors.flatMap((anchor) => {
        const removed = Math.min(anchor.allocatedPopulation, remainingSuppression);
        remainingSuppression -= removed;
        return anchor.allocatedPopulation === removed
          ? []
          : [Object.freeze({
              anchor,
              populationUnits: anchor.allocatedPopulation - removed,
            })];
      });
      if (
        population === undefined
        || population.representation !== policy.representation
        || population.populationSize !== expectedPopulationUnits
        || population.habitatCapacity !== candidate.habitatCapacity
        || population.populationPressure
          !== ratioFixed(expectedPopulationUnits, candidate.habitatCapacity)
        || population.trend !== "stable"
        || population.trendSignal !== 0
        || population.anchors.length !== expectedAnchors.length
      ) return false;
      for (let index = 0; index < expectedAnchors.length; index += 1) {
        const expected = expectedAnchors[index];
        const actual = population.anchors[index];
        if (
          expected === undefined
          || actual === undefined
          || actual.anchorOrdinal !== index
          || !sameWorldPosition(
            actual.position,
            regionalAnchorPosition(habitat.region, expected.anchor),
          )
          || actual.radiusUnits !== WORLD_POSITION_UNITS_PER_TILE * policy.anchorRadiusTiles
          || (population.revision === 0
            && actual.populationUnits !== expected.populationUnits)
        ) return false;
      }
      if (remainingSuppression !== 0) return false;
      aggregatesByKey.delete(key);
      continue;
    }
    const expectedAllocations = regionalIndividualAllocationsAfterSuppression(
      candidate,
      suppression,
    );
    const expectedPopulationUnits = [...expectedAllocations.values()].reduce(
      (sum, units) => sum + units,
      0,
    );
    const population = individualsByKey.get(key);
    const retired = mortalityByKey.get(key) ?? [];
    if (expectedPopulationUnits === 0) {
      if (population !== undefined || retired.length !== 0) return false;
      continue;
    }
    if (
      population === undefined
      || population.baselinePopulationSize !== expectedPopulationUnits
      || population.members.length + retired.length !== expectedAllocations.size
    ) return false;
    const allocations = new Map(expectedAllocations);
    for (const member of population.members) {
      const representedUnits = allocations.get(member.populationOrdinal);
      if (representedUnits === undefined || member.representedUnits !== representedUnits) {
        return false;
      }
      allocations.delete(member.populationOrdinal);
    }
    for (const transaction of retired) {
      const ordinal = transaction.retiredActor.identity.populationOrdinal;
      const representedUnits = allocations.get(ordinal);
      if (
        representedUnits === undefined
        || transaction.representedUnitsBefore !== representedUnits
      ) return false;
      allocations.delete(ordinal);
    }
    if (allocations.size !== 0) return false;
    individualsByKey.delete(key);
    mortalityByKey.delete(key);
  }
  return mortalityByKey.size === 0
    && individualsByKey.size === 0
    && aggregatesByKey.size === 0;
}

function regionalIndividualAllocationsAfterSuppression(
  candidate: CoreEcologyRegionalLikePopulationCandidate,
  suppression: CoreEcologyRegionalAdoptionSuppressionManifestV1 | null,
): ReadonlyMap<number, number> {
  const slots = suppression?.actorSlots.filter(({ baselinePopulationId }) => (
    baselinePopulationId === candidate.stableId
  )) ?? [];
  const allocations = new Map<number, number>();
  let anchorStart = 0;
  for (let ordinal = 0; ordinal < candidate.anchors.length; ordinal += 1) {
    const anchor = candidate.anchors[ordinal]!;
    const anchorEnd = anchorStart + anchor.allocatedPopulation;
    let removed = 0;
    for (const slot of slots) {
      const slotEnd = slot.baselineUnitOffset + slot.suppressedBaselineUnits;
      removed += Math.max(
        0,
        Math.min(anchorEnd, slotEnd) - Math.max(anchorStart, slot.baselineUnitOffset),
      );
    }
    const remaining = anchor.allocatedPopulation - removed;
    if (remaining > 0) allocations.set(ordinal, remaining);
    anchorStart = anchorEnd;
  }
  return allocations;
}

function groupsBelongToPatch(
  groupSet: CoreEcologyGroupSet,
  populations: readonly CoreEcologyPopulationState[],
  originRegion: RegionCoord,
  maximumTick: number,
): boolean {
  for (const group of groupSet.groups) {
    if (
      group.identity.originRegion.x !== originRegion.x
      || group.identity.originRegion.y !== originRegion.y
      || group.updatedAtTick > maximumTick
    ) return false;
    const population = populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ));
    if (population === undefined) return false;
    const ordinals = new Set(population.members.map(({ populationOrdinal }) => populationOrdinal));
    if (group.memberOrdinals.some((ordinal) => !ordinals.has(ordinal))) return false;
  }
  return true;
}

function dormantActorSupportsExactSinglePass(
  actor: CoreWildlifeActorState,
  atTick: number,
): boolean {
  const perception = actor.perception;
  return (
    (actor.intent.expiresAtTick === null || actor.intent.expiresAtTick > atTick)
    && perception.suspicion === "unaware"
    && perception.suspicionPressure === 0
    && perception.attentionKeys.length === 0
    && perception.beliefs.length === 0
    && perception.search === null
  );
}

function advanceDormantGroupsInOnePass(
  patch: CoreEcologyAggregatePatchState,
  atTick: number,
): CoreEcologyGroupSet | null {
  const groups: CoreEcologyGroupState[] = [];
  for (const group of patch.groups.groups) {
    const advanced = advanceDormantGroupInOnePass(patch, group, atTick);
    if (advanced === null) return null;
    groups.push(advanced);
  }
  return canonicalizeCoreEcologyGroupSet({
    version: patch.groups.version,
    groups,
  });
}

function advanceDormantGroupInOnePass(
  patch: CoreEcologyAggregatePatchState,
  group: CoreEcologyGroupState,
  atTick: number,
): CoreEcologyGroupState | null {
  if (group.nextCoarseTick > atTick) return group;
  if (playerAbsentGroupDisturbanceContext(patch, group) !== null) {
    return advanceDormantPressureGroup(patch, group, atTick);
  }
  if (group.phase !== "cohesive" || group.signals.length > 0) return null;
  const cadenceCount = Math.floor(
    (atTick - group.nextCoarseTick) / CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS,
  ) + 1;
  const revision = group.revision + cadenceCount;
  if (!Number.isSafeInteger(revision)) return null;
  const updatedAtTick = group.nextCoarseTick
    + (cadenceCount - 1) * CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS;
  const nextCoarseTick = updatedAtTick + CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS;
  const stepsToFullCohesion = Math.ceil(
    (FIXED_POINT - group.cohesion) / CORE_ECOLOGY_GROUP_COHESION_RECOVERY,
  );
  const cohesion = cadenceCount >= stepsToFullCohesion
    ? FIXED_POINT
    : group.cohesion + cadenceCount * CORE_ECOLOGY_GROUP_COHESION_RECOVERY;
  return canonicalizeCoreEcologyGroup({
    ...group,
    revision,
    updatedAtTick,
    nextCoarseTick,
    cohesion,
  });
}

const DORMANT_GROUP_ALIGNMENT_MAX_CADENCES = 64;
const DORMANT_GROUP_PRESSURE_CYCLE_CADENCES = 8;
const DORMANT_GROUP_RETAINED_TAIL_CYCLES = 9;

function advanceDormantPressureGroup(
  patch: CoreEcologyAggregatePatchState,
  initial: CoreEcologyGroupState,
  atTick: number,
): CoreEcologyGroupState | null {
  let group = initial;
  let alignmentSteps = 0;
  while (
    group.nextCoarseTick <= atTick
    && !dormantGroupAtStablePressureBoundary(patch, group)
  ) {
    if (alignmentSteps >= DORMANT_GROUP_ALIGNMENT_MAX_CADENCES) return null;
    const stepped = stepDormantPressureGroupOnce(patch, group);
    if (stepped === null) return null;
    group = stepped;
    alignmentSteps += 1;
  }
  if (group.nextCoarseTick > atTick) return group;

  const dueCadences = Math.floor(
    (atTick - group.nextCoarseTick) / CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS,
  ) + 1;
  const fullCycles = Math.floor(
    dueCadences / DORMANT_GROUP_PRESSURE_CYCLE_CADENCES,
  );
  if (fullCycles > DORMANT_GROUP_RETAINED_TAIL_CYCLES) {
    const cycleStart = group;
    let oneCycle = cycleStart;
    for (let cadence = 0; cadence < DORMANT_GROUP_PRESSURE_CYCLE_CADENCES; cadence += 1) {
      const stepped = stepDormantPressureGroupOnce(patch, oneCycle);
      if (stepped === null) return null;
      oneCycle = stepped;
    }
    if (!dormantGroupAtStablePressureBoundary(patch, oneCycle)) return null;
    const bridged = bridgeCoreEcologyGroupDormantCycles(cycleStart, oneCycle, {
      cycleCount: fullCycles - DORMANT_GROUP_RETAINED_TAIL_CYCLES,
    });
    if (bridged === null) return null;
    group = bridged;
  }

  let retainedTailSteps = 0;
  const maximumRetainedTailSteps = DORMANT_GROUP_RETAINED_TAIL_CYCLES
    * DORMANT_GROUP_PRESSURE_CYCLE_CADENCES
    + DORMANT_GROUP_PRESSURE_CYCLE_CADENCES - 1;
  while (group.nextCoarseTick <= atTick) {
    if (retainedTailSteps >= maximumRetainedTailSteps) return null;
    const stepped = stepDormantPressureGroupOnce(patch, group);
    if (stepped === null) return null;
    group = stepped;
    retainedTailSteps += 1;
  }
  return group;
}

function dormantGroupAtStablePressureBoundary(
  patch: CoreEcologyAggregatePatchState,
  group: CoreEcologyGroupState,
): boolean {
  return group.phase === "cohesive"
    && group.cohesion === FIXED_POINT
    && group.signals.length === 0
    && playerAbsentGroupDisturbances(patch, group, group.nextCoarseTick).length === 1;
}

function stepDormantPressureGroupOnce(
  patch: CoreEcologyAggregatePatchState,
  group: CoreEcologyGroupState,
): CoreEcologyGroupState | null {
  return stepCoreEcologyGroupCoarse(group, {
    atTick: group.nextCoarseTick,
    disturbances: playerAbsentGroupDisturbances(patch, group, group.nextCoarseTick),
  })?.group ?? null;
}

function advanceGroupsThroughTick(
  patch: CoreEcologyVersionedPatchState,
  atTick: number,
): Readonly<{
  groups: CoreEcologyGroupSet;
  events: readonly CoreEcologyGroupTransitionEvent[];
}> | null {
  const groups: CoreEcologyGroupState[] = [];
  const events: CoreEcologyGroupTransitionEvent[] = [];
  for (const initial of patch.groups.groups) {
    let group = initial;
    let steps = 0;
    const hasMaterializedMember = patch.populations.some((population) => (
      population.species === group.identity.species
      && population.populationKey === group.identity.populationKey
      && population.members.some((member) => (
        member.materialization === "materialized"
        && group.memberOrdinals.includes(member.populationOrdinal)
      ))
    ));
    while (group.nextCoarseTick <= atTick) {
      const result = hasMaterializedMember
        ? stepCoreEcologyGroupSignalCadence(group, { atTick: group.nextCoarseTick })
        : stepCoreEcologyGroupCoarse(group, {
            atTick: group.nextCoarseTick,
            disturbances: playerAbsentGroupDisturbances(patch, group, group.nextCoarseTick),
          });
      if (result === null || steps >= 8) return null;
      group = result.group;
      events.push(...result.events);
      steps += 1;
    }
    groups.push(group);
  }
  const canonicalGroups = canonicalizeCoreEcologyGroupSet({
    version: patch.groups.version,
    groups,
  });
  if (canonicalGroups === null) return null;
  events.sort((left, right) => (
    left.atTick - right.atTick
    || compareText(left.eventId, right.eventId)
  ));
  return deepFreeze({ groups: canonicalGroups, events });
}

function reconcileGroupsBeforeMaterialization(
  value: CoreEcologyGroupSet,
  populations: readonly CoreEcologyPopulationState[],
  desired: ReadonlySet<string>,
  atTick: number,
): CoreEcologyGroupSet | null {
  const groups: CoreEcologyGroupState[] = [];
  for (const group of value.groups) {
    const population = populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ));
    if (population === undefined) return null;
    const members = population.members.filter(({ populationOrdinal }) =>
      group.memberOrdinals.includes(populationOrdinal));
    const changed = members.some((member) =>
      (member.materialization === "materialized")
        !== desired.has(member.actor.identity.stableId));
    if (!changed || members.every(({ materialization }) => materialization === "coarse")) {
      groups.push(group);
      continue;
    }
    const componentAnchors = group.components.map((component) => {
      const componentMembers = members
        .filter(({ populationOrdinal }) => component.memberOrdinals.includes(populationOrdinal))
        .sort(compareMember);
      const stayingMaterialized = componentMembers.find((member) => (
        member.materialization === "materialized"
        && desired.has(member.actor.identity.stableId)
      ));
      const enteringCoarse = componentMembers.find((member) => (
        member.materialization === "coarse"
        && desired.has(member.actor.identity.stableId)
      ));
      const leavingMaterialized = componentMembers.find((member) => (
        member.materialization === "materialized"
      ));
      const componentWasFullyCoarse = componentMembers.every(({ materialization }) => (
        materialization === "coarse"
      ));
      const anchor = componentWasFullyCoarse
        ? component.anchor
        : stayingMaterialized?.actor.address.position
          ?? enteringCoarse?.actor.address.position
          ?? leavingMaterialized?.actor.address.position
          ?? component.anchor;
      return componentMembers.length === 0
        ? null
        : { componentId: component.componentId, anchor };
    });
    if (componentAnchors.some((entry) => entry === null)) return null;
    const reconciled = reconcileCoreEcologyGroupAnchors(group, {
      atTick,
      componentAnchors: componentAnchors as readonly Readonly<{
        componentId: string;
        anchor: WorldPosition;
      }>[],
    });
    if (reconciled === null) return null;
    groups.push(reconciled);
  }
  return canonicalizeCoreEcologyGroupSet({ version: value.version, groups });
}

function rematerializeGroupedActor(
  member: CoreEcologyPopulationMemberState,
  population: CoreEcologyPopulationState,
  groups: CoreEcologyGroupSet,
  atTick: number,
): CoreWildlifeActorState {
  const group = groups.groups.find((candidate) => (
    candidate.identity.species === population.species
    && candidate.identity.populationKey === population.populationKey
    && candidate.memberOrdinals.includes(member.populationOrdinal)
  ));
  if (group === undefined) return member.actor;
  const component = coreEcologyGroupComponentForMember(group, member.populationOrdinal);
  if (component === null) throw new Error("Core ecology group lost a rematerializing member");
  const componentAlreadyHasMaterializedMember = population.members.some((candidate) => (
    candidate.populationOrdinal !== member.populationOrdinal
    && candidate.materialization === "materialized"
    && component.memberOrdinals.includes(candidate.populationOrdinal)
  ));
  if (componentAlreadyHasMaterializedMember) {
    // Hybrid components still own exact individual positions. Collapsing to an
    // aggregate anchor is permitted only after the whole component is dormant.
    return member.actor;
  }
  const ordinalWithinComponent = component.memberOrdinals.indexOf(member.populationOrdinal);
  const offset = rematerializationOffset(ordinalWithinComponent);
  return repositionCoreWildlifeActor(member.actor, {
    atTick,
    position: translateWithinAnchorTile(component.anchor, offset.x, offset.y),
    heading: component.heading,
  });
}

function rematerializationOffset(index: number): Readonly<{ x: number; y: number }> {
  const column = index % 5;
  const row = Math.trunc(index / 5) % 5;
  return Object.freeze({
    x: (column - 2) * 120,
    y: (row - 2) * 120,
  });
}

function translateWithinAnchorTile(
  anchor: WorldPosition,
  offsetX: number,
  offsetY: number,
): WorldPosition {
  const tileX = Math.trunc(anchor.localX / WORLD_POSITION_UNITS_PER_TILE);
  const tileY = Math.trunc(anchor.localY / WORLD_POSITION_UNITS_PER_TILE);
  const tileStartX = tileX * WORLD_POSITION_UNITS_PER_TILE;
  const tileStartY = tileY * WORLD_POSITION_UNITS_PER_TILE;
  const centerOffset = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  return createWorldPosition(
    anchor.region,
    Math.max(
      tileStartX + 1,
      Math.min(tileStartX + WORLD_POSITION_UNITS_PER_TILE - 1, tileStartX + centerOffset + offsetX),
    ),
    Math.max(
      tileStartY + 1,
      Math.min(tileStartY + WORLD_POSITION_UNITS_PER_TILE - 1, tileStartY + centerOffset + offsetY),
    ),
  );
}

interface PlayerAbsentGroupDisturbanceContext {
  readonly populationKey: string;
  readonly allocations: readonly Readonly<{
    readonly allocationOrdinal: number;
    readonly position: WorldPosition;
  }>[];
  readonly populationPressure: number;
}

function playerAbsentGroupDisturbanceContext(
  patch: CoreEcologyVersionedPatchState,
  group: CoreEcologyGroupState,
): PlayerAbsentGroupDisturbanceContext | null {
  if (!("habitat" in patch.derivation)) return null;
  const population = patch.populations.find((candidate) => (
    candidate.species === group.identity.species
    && candidate.populationKey === group.identity.populationKey
  ));
  if (
    population === undefined
    || population.members.some(({ materialization }) => materialization === "materialized")
  ) return null;
  const analysis = patch.derivation.habitat.populations.find((candidate) => (
    candidate.species === group.identity.species
    && candidate.populationKey === group.identity.populationKey
  ));
  const regional = isRegionalHabitatPopulation(analysis);
  const allocations = regional
    ? analysis.anchors.map((anchor, allocationOrdinal) => ({
        allocationOrdinal,
        position: regionalAnchorPosition(patch.originRegion, anchor),
      }))
    : analysis?.allocations;
  const populationPressure = regional
    ? ratioFixed(analysis.populationUnits, analysis.habitatCapacity)
    : analysis?.populationPressure;
  if (
    analysis === undefined
    || allocations === undefined
    || allocations.length < 2
    || populationPressure === undefined
    || populationPressure < 450_000
  ) return null;
  return Object.freeze({
    populationKey: analysis.populationKey,
    allocations,
    populationPressure,
  });
}

function playerAbsentGroupDisturbances(
  patch: CoreEcologyVersionedPatchState,
  group: CoreEcologyGroupState,
  atTick: number,
): readonly CoreEcologyPlayerAbsentDisturbance[] {
  // Every authenticated habitat generation owns the same bounded population-
  // pressure inputs. Follow that capability so later append-only habitat
  // records—and their legacy-roster migration wrappers—inherit the established
  // coarse, player-absent behavior without another schema-version allowlist.
  const context = playerAbsentGroupDisturbanceContext(patch, group);
  if (context === null) return Object.freeze([]);
  const { allocations, populationKey, populationPressure } = context;
  const cadenceOrdinal = Math.trunc(atTick / CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS);
  const phase = Number.parseInt(hashCanonical([
    group.identity.stableId,
    "player-absent-population-pressure",
  ]).slice(0, 8), 16) % 8;
  if (cadenceOrdinal % 8 !== phase) return Object.freeze([]);
  const start = cadenceOrdinal % allocations.length;
  const first = allocations[start];
  const second = allocations[(start + 1) % allocations.length];
  if (first === undefined || second === undefined) return Object.freeze([]);
  const pressure = Math.min(
    1_000_000,
    450_000 + Math.trunc(populationPressure / 2),
  );
  return Object.freeze([Object.freeze({
    disturbanceId: `population-pressure:${hashCanonical([
      group.identity.stableId,
      atTick,
      populationPressure,
    ])}`,
    atTick,
    causeKind: "habitat-pressure" as const,
    causeReferenceId: populationKey,
    pressure,
    movementHeading: cadenceOrdinal * 131_071 % 1_000_000,
    destinationAnchors: Object.freeze([first.position, second.position]),
    rendezvousAnchor: first.position,
    playerAbsent: true as const,
    nonlethal: true as const,
    cargoInteraction: false as const,
  })]);
}

function ingestMaterializedAlarmSignals(
  value: CoreEcologyGroupSet,
  populations: readonly CoreEcologyPopulationState[],
  events: readonly CoreWildlifeCausalEvent[],
  atTick: number,
): CoreEcologyGroupSet | null {
  const groups = [...value.groups];
  for (const event of events) {
    if (event.kind !== "alarm" || !isGroupIndividualSpecies(event.species)) continue;
    const population = populations.find((candidate) => (
      candidate.species === event.species
      && candidate.members.some(({ actor }) => actor.identity.stableId === event.actorId)
    ));
    const member = population?.members.find(({ actor }) => actor.identity.stableId === event.actorId);
    if (population === undefined || member === undefined) return null;
    const groupIndex = groups.findIndex((group) => (
      group.identity.species === population.species
      && group.identity.populationKey === population.populationKey
      && group.memberOrdinals.includes(member.populationOrdinal)
    ));
    if (groupIndex < 0) continue;
    const group = groups[groupIndex];
    if (group === undefined) return null;
    const signaled = emitCoreEcologyGroupSignal(group, {
      atTick,
      kind: "alarm",
      causeReferenceId: event.eventId,
      sourceMemberOrdinal: member.populationOrdinal,
      pressure: Math.max(1, getCoreWildlifeProfile(event.species).behavior.alarmThreshold),
      movementHeading: member.actor.address.heading,
    });
    // A saturated bounded signal queue drops the newest social echo; the
    // physical alarm event and lawful hearing observations remain authoritative.
    if (signaled !== null) groups[groupIndex] = signaled;
  }
  return canonicalizeCoreEcologyGroupSet({ version: value.version, groups });
}

interface LegacyCoreEcologyPopulationMemberState {
  readonly populationOrdinal: number;
  readonly materialization: CoreWildlifeMaterialization;
  readonly actor: CoreWildlifeActorState;
}

interface LegacyCoreEcologyPopulationState {
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  readonly populationSize: number;
  readonly members: readonly LegacyCoreEcologyPopulationMemberState[];
}

interface LegacyCoreEcologyPatchState {
  readonly version: typeof FOUNDATION_LEGACY_CORE_ECOLOGY_PATCH_VERSION;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly updatedAtTick: number;
  readonly populations: readonly LegacyCoreEcologyPopulationState[];
}

function canonicalizeFoundationLegacyCoreEcologyPatch(
  value: unknown,
): LegacyCoreEcologyPatchState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "originRegion",
    "patchKey",
    "populations",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== FOUNDATION_LEGACY_CORE_ECOLOGY_PATCH_VERSION
    || !validPatchKey(value.patchKey)
    || !isRegionCoord(value.originRegion)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.populations)
    || value.populations.length === 0
    || value.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
  ) return null;
  const actorIds = new Set<string>();
  const populations: LegacyCoreEcologyPopulationState[] = [];
  let memberCount = 0;
  let materializedCount = 0;
  for (const rawPopulation of value.populations) {
    if (!plainRecord(rawPopulation) || !exactKeys(rawPopulation, [
      "members",
      "populationKey",
      "populationSize",
      "species",
    ])) return null;
    if (
      !isWaveAIndividualSpecies(rawPopulation.species)
      || !validPatchKey(rawPopulation.populationKey)
      || !positiveSafeInteger(rawPopulation.populationSize)
      || !Array.isArray(rawPopulation.members)
      || rawPopulation.members.length !== rawPopulation.populationSize
    ) return null;
    const species = rawPopulation.species as CoreWildlifeSpecies;
    if (rawPopulation.members.length > getCoreWildlifeProfile(species).maximumPatchPopulation) {
      return null;
    }
    const members: LegacyCoreEcologyPopulationMemberState[] = [];
    for (const rawMember of rawPopulation.members) {
      if (!plainRecord(rawMember) || !exactKeys(rawMember, [
        "actor",
        "materialization",
        "populationOrdinal",
      ])) return null;
      if (
        !nonnegativeSafeInteger(rawMember.populationOrdinal)
        || !MATERIALIZATION.has(rawMember.materialization as string)
      ) return null;
      const actor = canonicalizeCoreWildlifeActorState(rawMember.actor);
      if (
        actor === null
        || actor.updatedAtTick > value.updatedAtTick
        || actor.identity.species !== species
        || actor.identity.populationKey !== rawPopulation.populationKey
        || actor.identity.populationOrdinal !== rawMember.populationOrdinal
        || actor.identity.originRegion.x !== value.originRegion.x
        || actor.identity.originRegion.y !== value.originRegion.y
        || actorIds.has(actor.identity.stableId)
      ) return null;
      actorIds.add(actor.identity.stableId);
      members.push(Object.freeze({
        populationOrdinal: rawMember.populationOrdinal,
        materialization: rawMember.materialization as CoreWildlifeMaterialization,
        actor,
      }));
      memberCount += 1;
      if (rawMember.materialization === "materialized") materializedCount += 1;
    }
    members.sort(compareMember);
    for (let index = 1; index < members.length; index += 1) {
      if (members[index - 1]?.populationOrdinal === members[index]?.populationOrdinal) return null;
    }
    populations.push(Object.freeze({
      species,
      populationKey: rawPopulation.populationKey,
      populationSize: rawPopulation.populationSize,
      members: Object.freeze(members),
    }));
  }
  populations.sort(comparePopulation);
  for (let index = 1; index < populations.length; index += 1) {
    if (comparePopulation(populations[index - 1]!, populations[index]!) === 0) return null;
  }
  if (
    memberCount > CORE_ECOLOGY_MAX_MEMBERS
    || materializedCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) return null;
  return deepFreeze({
    version: FOUNDATION_LEGACY_CORE_ECOLOGY_PATCH_VERSION,
    patchKey: value.patchKey,
    originRegion: createRegionCoord(value.originRegion.x, value.originRegion.y),
    updatedAtTick: value.updatedAtTick,
    populations,
  });
}

function allMembers(
  patch: CoreEcologyVersionedPatchState,
): readonly CoreEcologyPopulationMemberState[] {
  return patch.populations.flatMap(({ members }) => members);
}

function requirePatch(value: unknown): CoreEcologyPatchState {
  const patch = canonicalizeCoreEcologyPatch(value);
  if (patch === null) throw new TypeError("Core ecology patch state is malformed");
  return patch;
}

function requireCanonicalPatch(value: unknown): CoreEcologyPatchState {
  const patch = canonicalizeCoreEcologyPatch(value);
  if (patch === null) throw new Error("Core ecology transition broke patch invariants");
  return patch;
}

function requireAggregatePatch(value: unknown): CoreEcologyAggregatePatchState {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null) throw new TypeError("Core ecology aggregate patch state is malformed");
  return patch;
}

function requireCanonicalAggregatePatch(value: unknown): CoreEcologyAggregatePatchState {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null) throw new Error("Core ecology transition broke aggregate patch invariants");
  return patch;
}

function advanceAggregatePopulationClocks(
  populations: readonly CoreEcologyAggregatePopulationState[],
  atTick: number,
): readonly CoreEcologyAggregatePopulationState[] {
  return Object.freeze(populations.map((population) => {
    if (atTick < population.updatedAtTick) {
      throw new RangeError("Core ecology aggregate clock cannot move backward");
    }
    if (atTick === population.updatedAtTick) return population;
    return deepFreeze({
      ...population,
      updatedAtTick: atTick,
      activitySignal: {
        ...population.activitySignal,
        updatedAtTick: atTick,
      },
    });
  }));
}

function comparePopulation(
  left: Pick<CoreEcologyPopulationState, "species" | "populationKey">,
  right: Pick<CoreEcologyPopulationState, "species" | "populationKey">,
): number {
  return compareText(left.species, right.species)
    || compareText(left.populationKey, right.populationKey);
}

function compareMember(
  left: Pick<CoreEcologyPopulationMemberState, "populationOrdinal">,
  right: Pick<CoreEcologyPopulationMemberState, "populationOrdinal">,
): number {
  return left.populationOrdinal - right.populationOrdinal;
}

function validPatchKey(value: unknown): value is string {
  return typeof value === "string"
    && PATCH_KEY_PATTERN.test(value)
    && value === value.normalize("NFC");
}

function isWaveAIndividualSpecies(value: unknown): value is CoreWildlifeSpecies {
  return typeof value === "string"
    && (CORE_ECOLOGY_WAVE_A_INDIVIDUAL_SPECIES as readonly string[]).includes(value);
}

function isCurrentIndividualSpecies(value: unknown): value is CoreWildlifeSpecies {
  return typeof value === "string"
    && (CORE_ECOLOGY_INDIVIDUAL_SPECIES as readonly string[]).includes(value);
}

function isGroupIndividualSpecies(value: unknown): value is CoreWildlifeSpecies {
  return typeof value === "string"
    && coreEcologySpeciesRuntimePolicy(value)?.groupOrganization !== null;
}

function aggregateActivitySignalFromHabitat(
  species: CoreEcologyAggregateSpecies,
  signal: CoreEcologyHarborEdgeActivitySignal,
  tick: number,
): CoreEcologyAggregateActivitySignal {
  const policy = coreEcologyAggregateSpeciesPolicy(species).activity;
  return Object.freeze({
    kind: policy.kind,
    // Habitat suitability is the stable baseline, not a claim that a
    // rain-responsive population is already chorusing. The first frame must
    // be truthful even before runtime has projected live weather stimuli.
    intensity: resolveCoreEcologyAggregateActivityIntensity(species, signal.intensity, 0),
    activePeriod: policy.activePeriod,
    updatedAtTick: tick,
    source: "aggregate-state",
  });
}

function initialAggregateEvidenceKind(
  species: CoreEcologyAggregateSpecies,
  aggregateId: string,
  evidenceOrdinal: number,
): CoreEcologyAggregateEvidenceKind {
  const kinds = coreEcologyAggregateSpeciesPolicy(species).initialEvidenceKinds;
  const selection = Number.parseInt(
    hashCanonical([aggregateId, "initial-evidence", evidenceOrdinal]).slice(0, 8),
    16,
  ) % kinds.length;
  return kinds[selection] ?? "tracks";
}

function disturbanceEvidenceKind(
  species: CoreEcologyAggregateSpecies,
  cause: CoreEcologyAggregateDisturbance["causeKind"],
): CoreEcologyAggregateEvidenceKind {
  if (species === "southern-leopard-frog") return "frog-track";
  if (species === "american-pika") return "talus-sign";
  if (species === "atlantic-silverside") return "surface-dimple";
  if (species === "atlantic-marsh-fiddler-crab") {
    return cause === "tide-pressure" ? "feeding-scrape" : "burrow-opening";
  }
  return cause === "weather-pressure" ? "shelter-sign" : "tracks";
}

function retainAggregateEvidence(
  values: readonly CoreEcologyAggregateEvidence[],
): readonly CoreEcologyAggregateEvidence[] {
  const sorted = [...values].sort((left, right) =>
    left.evidenceOrdinal - right.evidenceOrdinal);
  return Object.freeze(sorted.slice(-CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE));
}

function retainAggregateDisturbances(
  values: readonly CoreEcologyAggregateDisturbance[],
): readonly CoreEcologyAggregateDisturbance[] {
  const sorted = [...values].sort((left, right) =>
    left.disturbanceOrdinal - right.disturbanceOrdinal);
  return Object.freeze(sorted.slice(-CORE_ECOLOGY_MAX_AGGREGATE_DISTURBANCES));
}

function stableAggregateIdFromFields(input: Readonly<{
  seedFingerprint: string;
  originRegion: RegionCoord;
  populationKey: string;
  species: CoreEcologyAggregateSpecies;
}>): string {
  return `${coreEcologyAggregateSpeciesPolicy(input.species).stableIdPrefix}${hashCanonical([
    input.seedFingerprint,
    input.originRegion.x,
    input.originRegion.y,
    input.populationKey,
  ])}`;
}

function rootSeedFingerprint(seed: RootSeed): string {
  return seed.map((word) => word.toString(36).padStart(7, "0")).join(".");
}

function canonicalRootSeed(value: unknown): value is RootSeed {
  return Array.isArray(value)
    && value.length === 4
    && value.every((word) => nonnegativeSafeInteger(word) && word <= 0xffff_ffff);
}

function fixedInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function signedFixedInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= -FIXED_POINT
    && value <= FIXED_POINT
    && !Object.is(value, -0);
}

function ratioFixed(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(FIXED_POINT, Math.trunc((numerator * FIXED_POINT) / denominator));
}

function validPopulationTrend(value: unknown, signal: number): value is CoreEcologyAggregatePopulationState["trend"] {
  return signal >= 80_000
    ? value === "growing"
    : signal <= -80_000
    ? value === "declining"
    : value === "stable";
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameWorldPosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
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

function allowedKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function requiredAndOptionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  return required.every((key) => Object.hasOwn(value, key))
    && allowedKeys(value, [...required, ...optional]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
