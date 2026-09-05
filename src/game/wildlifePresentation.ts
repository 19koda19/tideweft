import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import { globalTileToRegion } from "../sim/regions";
import {
  getCoreWildlifeProfile,
  type CoreWildlifeLifeStage,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import {
  canonicalizeCoreWildlifeActorState,
  coreWildlifeEnvironmentalEvidenceStrengthAtTick,
  type CoreWildlifeActorState,
  type CoreWildlifeIntentKind,
} from "./coreWildlifeActor";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregateEvidenceKind,
} from "./coreEcology";
import {
  VISIBILITY_DIRECT,
  hasValidPerceptionSignature,
  type PerceptionResult,
} from "./perception";
import {
  headingToRadians,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { livingSpeciesRegistryEntry } from "./livingSpeciesRegistry";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

export const WILDLIFE_PRESENTATION_VERSION = 1 as const;
export const WILDLIFE_POPULATION_EVIDENCE_PRESENTATION_VERSION = 1 as const;
export const WILDLIFE_DIRECT_DETAIL_MAX_DISTANCE_UNITS = 96_000 as const;

/** Species with authoritative individual actor materialization. */
export type IndividualWildlifeSpecies = Exclude<CoreWildlifeSpecies, "brown-rat">;

export type WildlifePresentationBehavior =
  | "watch"
  | "alarm"
  | "flee"
  | "scavenge"
  | "forage"
  | "pursue"
  | "guard"
  | "retreat"
  | "rest";

/** Signed current player perception plus an optional count of visible gull representatives. */
export interface WildlifeDirectObservation {
  readonly window: Readonly<{
    readonly origin: Readonly<{ x: number; y: number }>;
    readonly terrain: Readonly<{ width: number; height: number }>;
  }>;
  readonly perception: PerceptionResult;
  /** Visible representatives only; this is never total or hidden flock membership. */
  readonly visibleAggregateCount?: number;
}

/** Renderer-neutral, directly observable wildlife data. */
export interface WildlifePresentation {
  readonly version: typeof WILDLIFE_PRESENTATION_VERSION;
  /** Stable routing identity; labels below remain observation-limited. */
  readonly actorId: string;
  readonly species: IndividualWildlifeSpecies;
  readonly quickLabel: string;
  readonly identityLabel: string;
  readonly speciesIdentified: boolean;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly facing: number;
  readonly sizeScale: number;
  readonly behavior: WildlifePresentationBehavior;
  readonly behaviorLabel: string;
  readonly conditionLabels: readonly string[];
  /** Directly visible body form; never an inferred capability or hidden trait. */
  readonly formLabel?: string;
  readonly appearanceLabel?: string;
  readonly lifeStageLabel?: string;
  /** Coarse visible bucket for a gull aggregate; absent for individuals or unknown count. */
  readonly groupSize?: number;
  readonly distanceUnits: number;
  readonly selected: boolean;
}

export interface WildlifePresentationInput {
  readonly actor: unknown;
  readonly observation: WildlifeDirectObservation;
  readonly tileSize: number;
  readonly selected?: boolean;
}

/** Signed direct-detail frame for physical wildlife evidence, with no count channel. */
export interface WildlifePopulationEvidenceObservation {
  readonly window: WildlifeDirectObservation["window"];
  readonly perception: PerceptionResult;
}

export type WildlifePopulationEvidenceForm =
  | "gnaw-marks"
  | "shelter-sign"
  | "small-tracks"
  | "paired-tracks"
  | "canid-pawprints";

/** One directly visible physical sign. It is neither an actor nor a population census. */
export interface WildlifePopulationEvidencePresentation {
  readonly version: typeof WILDLIFE_POPULATION_EVIDENCE_PRESENTATION_VERSION;
  /** Stable source routing identity; never a player-facing label. */
  readonly aggregateId: string;
  /** Stable physical-evidence routing identity. */
  readonly evidenceId: string;
  readonly species: "brown-rat" | "domestic-cat" | "marsh-rabbit" | "marsh-fox";
  readonly representation: "population-evidence" | "individual-evidence";
  readonly form: WildlifePopulationEvidenceForm;
  readonly quickLabel: string;
  readonly identityLabel: string;
  readonly evidenceLabel: string;
  readonly speciesIdentified: boolean;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly sizeScale: number;
  readonly distanceUnits: number;
  readonly selected: boolean;
}

export interface WildlifePopulationEvidencePresentationInput {
  readonly patch: unknown;
  readonly observation: WildlifePopulationEvidenceObservation;
  readonly tileSize: number;
  readonly selectedEvidenceId?: string;
}

/**
 * Tests one authoritative wildlife event locus against the same signed direct
 * detail field used by actors and physical signs. The caller must pass the
 * event-time position; a later actor position cannot grant retroactive sight.
 */
export function isWildlifeWorldPositionDirectlyObserved(
  position: WorldPosition,
  observation: WildlifePopulationEvidenceObservation,
): boolean {
  const context = directEvidenceObservationContext(observation);
  return context !== null && directEvidenceDetail(position, context) !== null;
}

interface DirectDetail {
  readonly point: Readonly<{ x: number; y: number }>;
  readonly heading: number;
  readonly distanceUnits: number;
  readonly visualClarity: number;
  readonly groupSize: number | undefined;
}

interface DirectEvidenceObservationContext {
  readonly window: WildlifePopulationEvidenceObservation["window"];
  readonly perception: PerceptionResult;
  readonly playerPoint: Readonly<{ x: number; y: number }>;
  readonly frameOrigin: WorldPosition;
}

interface DirectEvidenceDetail {
  readonly point: Readonly<{ x: number; y: number }>;
  readonly distanceUnits: number;
  readonly visualClarity: number;
}

type WildlifePresentationForm =
  | "deer"
  | "gull-flock"
  | "black-bear"
  | "brown-rat"
  | "domestic-cat"
  | "marsh-rabbit"
  | "marsh-fox";

interface WildlifeSpeciesPresentationDescriptor {
  readonly form: WildlifePresentationForm;
  readonly representation: "actor" | "population-area";
  readonly identificationClarity: number;
  readonly unidentifiedQuickLabel: string;
  readonly unidentifiedIdentityLabel: string;
  readonly identifiedNounNumber: "singular" | "plural";
  readonly groupNoun: "flock" | null;
  readonly appearanceStyle: "individual" | "plumage";
  readonly conditionStyle: "individual" | "flock" | "none";
  readonly exposesLifeStage: boolean;
  readonly baseSizeScale: number;
  readonly observableForm: string | null;
}

/** Exhaustive observable semantics; adding a species cannot inherit another animal's presentation. */
const PRESENTATION_BY_SPECIES: Readonly<
  Record<CoreWildlifeSpecies, WildlifeSpeciesPresentationDescriptor>
> = deepFreeze({
  deer: {
    form: "deer",
    representation: "actor",
    identificationClarity: 300_000,
    unidentifiedQuickLabel: "Unknown animal",
    unidentifiedIdentityLabel: "Unidentified animal",
    identifiedNounNumber: "singular",
    groupNoun: null,
    appearanceStyle: "individual",
    conditionStyle: "individual",
    exposesLifeStage: true,
    baseSizeScale: 1,
    observableForm: null,
  },
  gull: {
    form: "gull-flock",
    representation: "actor",
    identificationClarity: 220_000,
    unidentifiedQuickLabel: "Unknown birds",
    unidentifiedIdentityLabel: "Unidentified birds",
    identifiedNounNumber: "plural",
    groupNoun: "flock",
    appearanceStyle: "plumage",
    conditionStyle: "flock",
    exposesLifeStage: false,
    baseSizeScale: 0.64,
    observableForm: null,
  },
  "black-bear": {
    form: "black-bear",
    representation: "actor",
    identificationClarity: 420_000,
    unidentifiedQuickLabel: "Large animal",
    unidentifiedIdentityLabel: "Unidentified animal",
    identifiedNounNumber: "singular",
    groupNoun: null,
    appearanceStyle: "individual",
    conditionStyle: "individual",
    exposesLifeStage: true,
    baseSizeScale: 1.34,
    observableForm: null,
  },
  "brown-rat": {
    form: "brown-rat",
    representation: "population-area",
    identificationClarity: 360_000,
    unidentifiedQuickLabel: "Small animal",
    unidentifiedIdentityLabel: "Unidentified small animal",
    identifiedNounNumber: "singular",
    groupNoun: null,
    appearanceStyle: "individual",
    conditionStyle: "none",
    exposesLifeStage: false,
    baseSizeScale: 0.28,
    observableForm: null,
  },
  "domestic-cat": {
    form: "domestic-cat",
    representation: "actor",
    identificationClarity: 310_000,
    unidentifiedQuickLabel: "Unknown animal",
    unidentifiedIdentityLabel: "Unidentified animal",
    identifiedNounNumber: "singular",
    groupNoun: null,
    appearanceStyle: "individual",
    conditionStyle: "individual",
    exposesLifeStage: true,
    baseSizeScale: 0.68,
    observableForm: null,
  },
  "marsh-rabbit": {
    form: "marsh-rabbit",
    representation: "actor",
    identificationClarity: 430_000,
    unidentifiedQuickLabel: "Small animal",
    unidentifiedIdentityLabel: "Unidentified small animal",
    identifiedNounNumber: "singular",
    groupNoun: null,
    appearanceStyle: "individual",
    conditionStyle: "individual",
    exposesLifeStage: true,
    baseSizeScale: 0.52,
    observableForm: "Compact, long-eared",
  },
  "marsh-fox": {
    form: "marsh-fox",
    representation: "actor",
    identificationClarity: 410_000,
    unidentifiedQuickLabel: "Unknown canid",
    unidentifiedIdentityLabel: "Unidentified canid",
    identifiedNounNumber: "singular",
    groupNoun: null,
    appearanceStyle: "individual",
    conditionStyle: "individual",
    exposesLifeStage: true,
    baseSizeScale: 0.82,
    observableForm: "Lean, low-tailed canid",
  },
});
const BEHAVIOR_CLARITY = 180_000;
const CONDITION_CLARITY = 260_000;
const APPEARANCE_CLARITY = 620_000;
const LIFE_STAGE_CLARITY = 760_000;
const POPULATION_EVIDENCE_IDENTIFICATION_CLARITY = 520_000;

interface PopulationEvidenceDescriptor {
  readonly form: WildlifePopulationEvidenceForm;
  readonly minimumClarity: number;
  readonly identifiedLabel: string;
  readonly unidentifiedLabel: string;
  readonly sizeScale: number;
}

const POPULATION_EVIDENCE_BY_KIND: Readonly<
  Record<CoreEcologyAggregateEvidenceKind, PopulationEvidenceDescriptor>
> = deepFreeze({
  "gnaw-mark": {
    form: "gnaw-marks",
    minimumClarity: 300_000,
    identifiedLabel: "Rat gnaw marks",
    unidentifiedLabel: "Small gnaw marks",
    sizeScale: 0.82,
  },
  "shelter-sign": {
    form: "shelter-sign",
    minimumClarity: 260_000,
    identifiedLabel: "Brown rat shelter signs",
    unidentifiedLabel: "Small-animal shelter signs",
    sizeScale: 1,
  },
  tracks: {
    form: "small-tracks",
    minimumClarity: 340_000,
    identifiedLabel: "Brown rat tracks",
    unidentifiedLabel: "Small tracks",
    sizeScale: 0.72,
  },
});

type IndividualEvidenceSpecies = "domestic-cat" | "marsh-rabbit" | "marsh-fox";

interface IndividualEvidenceDescriptor {
  readonly expectedKind: "wet-tracks" | "paired-tracks" | "canid-pawprints";
  readonly form: WildlifePopulationEvidenceForm;
  readonly minimumClarity: number;
  readonly identifiedQuickLabel: string;
  readonly unidentifiedQuickLabel: string;
  readonly identifiedIdentityLabel: string;
  readonly unidentifiedIdentityLabel: string;
  readonly identifiedEvidenceLabel: string;
  readonly unidentifiedEvidenceLabel: string;
  readonly sizeScale: number;
}

/**
 * Exhaustive projection policy for saved individual signs. Each entry keeps
 * legacy cat wording intact while preventing one species from borrowing
 * another species' evidence kind or display semantics.
 */
const INDIVIDUAL_EVIDENCE_BY_SPECIES: Readonly<
  Record<IndividualEvidenceSpecies, IndividualEvidenceDescriptor>
> = deepFreeze({
  "domestic-cat": {
    expectedKind: "wet-tracks",
    form: "small-tracks",
    minimumClarity: 340_000,
    identifiedQuickLabel: "Domestic cat signs",
    unidentifiedQuickLabel: "Animal signs",
    identifiedIdentityLabel: "Domestic cat tracks",
    unidentifiedIdentityLabel: "Unidentified animal tracks",
    identifiedEvidenceLabel: "Wet cat pawprints",
    unidentifiedEvidenceLabel: "Wet pawprints",
    sizeScale: 1.02,
  },
  "marsh-rabbit": {
    expectedKind: "paired-tracks",
    form: "paired-tracks",
    minimumClarity: 320_000,
    identifiedQuickLabel: "Marsh rabbit signs",
    unidentifiedQuickLabel: "Paired tracks",
    identifiedIdentityLabel: "Marsh rabbit tracks",
    unidentifiedIdentityLabel: "Unidentified paired tracks",
    identifiedEvidenceLabel: "Paired rabbit tracks",
    unidentifiedEvidenceLabel: "Paired small-animal tracks",
    sizeScale: 0.94,
  },
  "marsh-fox": {
    expectedKind: "canid-pawprints",
    form: "canid-pawprints",
    minimumClarity: 350_000,
    identifiedQuickLabel: "Marsh fox signs",
    unidentifiedQuickLabel: "Canid signs",
    identifiedIdentityLabel: "Marsh fox tracks",
    unidentifiedIdentityLabel: "Unidentified canid tracks",
    identifiedEvidenceLabel: "Fox pawprints",
    unidentifiedEvidenceLabel: "Canid pawprints",
    sizeScale: 1.12,
  },
});

/**
 * Projects no animal at all unless the signed detail field directly contains
 * its current tile. Terrain visibility or a caller-authored boolean is never
 * enough to disclose an actor.
 */
export function projectWildlifePresentation(
  input: WildlifePresentationInput,
): WildlifePresentation | null {
  if (
    !plainRecord(input)
    || !allowedInputKeys(input as unknown as Record<string, unknown>)
    || !Number.isFinite(input.tileSize)
    || input.tileSize <= 0
    || input.tileSize > 4_096
    || (input.selected !== undefined && typeof input.selected !== "boolean")
  ) return null;
  const actor = canonicalizeCoreWildlifeActorState(input.actor);
  if (actor === null) return null;
  const species = actor.identity.species;
  // Aggregate-only species never acquire a synthetic individual actor or routing ID.
  if (!isIndividualWildlifeSpecies(species)) return null;
  const descriptor = PRESENTATION_BY_SPECIES[species];
  if (descriptor.representation !== "actor") return null;
  const detail = directDetail(actor, input.observation);
  if (detail === null) return null;

  const speciesIdentified = detail.visualClarity >= descriptor.identificationClarity;
  const behavior = presentationBehavior(actor.intent.kind);
  const behaviorLabel = detail.visualClarity >= BEHAVIOR_CLARITY
    ? observableBehavior(actor.intent.kind)
    : coarseMotion(actor.intent.kind);
  const conditionLabels = detail.visualClarity >= CONDITION_CLARITY
    ? observableConditionLabels(actor)
    : Object.freeze([]);
  const formLabel = detail.visualClarity >= APPEARANCE_CLARITY
    ? descriptor.observableForm ?? undefined
    : undefined;
  const appearanceLabel = detail.visualClarity >= APPEARANCE_CLARITY
    ? observableAppearance(actor)
    : undefined;
  const lifeStageLabel = descriptor.exposesLifeStage
    && detail.visualClarity >= LIFE_STAGE_CLARITY
    ? displayToken(actor.identity.lifeStage)
    : undefined;

  return deepFreeze({
    version: WILDLIFE_PRESENTATION_VERSION,
    actorId: actor.identity.stableId,
    species,
    quickLabel: quickLabel(species, speciesIdentified),
    identityLabel: identityLabel(species, speciesIdentified),
    speciesIdentified,
    position: {
      x: detail.point.x * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
      y: detail.point.y * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
    },
    facing: headingToRadians(detail.heading),
    sizeScale: sizeScale(species, actor.identity.lifeStage),
    behavior,
    behaviorLabel,
    conditionLabels,
    ...(formLabel === undefined ? {} : { formLabel }),
    ...(appearanceLabel === undefined ? {} : { appearanceLabel }),
    ...(lifeStageLabel === undefined ? {} : { lifeStageLabel }),
    ...(detail.groupSize === undefined ? {} : { groupSize: detail.groupSize }),
    distanceUnits: detail.distanceUnits,
    selected: input.selected ?? false,
  });
}

function isIndividualWildlifeSpecies(
  species: CoreWildlifeSpecies,
): species is IndividualWildlifeSpecies {
  return species !== "brown-rat";
}

/**
 * Projects only canonical physical evidence that is in the signed direct-detail
 * field. Habitat anchors, actor cognition, activity likelihood, counts, causes,
 * and population state remain withheld even when their terrain is visible.
 */
export function projectWildlifePopulationEvidencePresentations(
  input: WildlifePopulationEvidencePresentationInput,
): readonly WildlifePopulationEvidencePresentation[] | null {
  if (
    !plainRecord(input)
    || !allowedPopulationEvidenceInputKeys(input as unknown as Record<string, unknown>)
    || !Number.isFinite(input.tileSize)
    || input.tileSize <= 0
    || input.tileSize > 4_096
    || (input.selectedEvidenceId !== undefined
      && (typeof input.selectedEvidenceId !== "string"
        || input.selectedEvidenceId.length === 0
        || input.selectedEvidenceId.length > 256))
  ) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(input.patch);
  const context = directEvidenceObservationContext(input.observation);
  if (patch === null || context === null) return null;

  const presentations: WildlifePopulationEvidencePresentation[] = [];
  for (const population of patch.aggregatePopulations) {
    for (const evidence of population.evidence) {
      const detail = directEvidenceDetail(evidence.position, context);
      const descriptor = POPULATION_EVIDENCE_BY_KIND[evidence.kind];
      if (detail === null || detail.visualClarity < descriptor.minimumClarity) continue;
      const speciesIdentified = detail.visualClarity
        >= POPULATION_EVIDENCE_IDENTIFICATION_CLARITY;
      presentations.push(deepFreeze({
        version: WILDLIFE_POPULATION_EVIDENCE_PRESENTATION_VERSION,
        aggregateId: population.aggregateId,
        evidenceId: evidence.evidenceId,
        species: "brown-rat",
        representation: "population-evidence",
        form: descriptor.form,
        quickLabel: speciesIdentified ? "Brown rat signs" : "Small-animal signs",
        identityLabel: speciesIdentified
          ? "Brown rat population signs"
          : "Unidentified small-animal signs",
        evidenceLabel: speciesIdentified
          ? descriptor.identifiedLabel
          : descriptor.unidentifiedLabel,
        speciesIdentified,
        position: {
          x: detail.point.x * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
          y: detail.point.y * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
        },
        sizeScale: descriptor.sizeScale,
        distanceUnits: detail.distanceUnits,
        selected: evidence.evidenceId === input.selectedEvidenceId,
      }));
    }
  }
  for (const population of patch.populations) {
    if (!isIndividualEvidenceSpecies(population.species)) continue;
    const descriptor = INDIVIDUAL_EVIDENCE_BY_SPECIES[population.species];
    for (const member of population.members) {
      for (const memory of member.actor.memories) {
        const evidence = memory.environmentalEvidence;
        if (evidence === undefined || evidence.kind !== descriptor.expectedKind) continue;
        const detail = directEvidenceDetail(evidence.position, context);
        if (detail === null) continue;
        const evidenceStrength = coreWildlifeEnvironmentalEvidenceStrengthAtTick(
          evidence,
          patch.updatedAtTick,
        );
        const observableClarity = Math.min(detail.visualClarity, evidenceStrength);
        if (observableClarity < descriptor.minimumClarity) continue;
        const speciesIdentified = observableClarity
          >= POPULATION_EVIDENCE_IDENTIFICATION_CLARITY;
        presentations.push(deepFreeze({
          version: WILDLIFE_POPULATION_EVIDENCE_PRESENTATION_VERSION,
          // The legacy renderer field is a stable source identity. For an
          // individual sign it carries the owning actor's stable ID, but is
          // never displayed and says nothing about that actor's current place.
          aggregateId: member.actor.identity.stableId,
          evidenceId: evidence.evidenceId,
          species: population.species,
          representation: "individual-evidence",
          form: descriptor.form,
          quickLabel: speciesIdentified
            ? descriptor.identifiedQuickLabel
            : descriptor.unidentifiedQuickLabel,
          identityLabel: speciesIdentified
            ? descriptor.identifiedIdentityLabel
            : descriptor.unidentifiedIdentityLabel,
          evidenceLabel: speciesIdentified
            ? descriptor.identifiedEvidenceLabel
            : descriptor.unidentifiedEvidenceLabel,
          speciesIdentified,
          position: {
            x: detail.point.x * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
            y: detail.point.y * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
          },
          sizeScale: descriptor.sizeScale,
          distanceUnits: detail.distanceUnits,
          // Individual signs are deliberately non-targetable in this bounded
          // slice; ABOUT remains attached to a currently observed living actor.
          selected: false,
        }));
      }
    }
  }
  presentations.sort((left, right) => compareText(left.evidenceId, right.evidenceId));
  return Object.freeze(presentations);
}

function isIndividualEvidenceSpecies(
  species: CoreWildlifeSpecies,
): species is IndividualEvidenceSpecies {
  return species === "domestic-cat"
    || species === "marsh-rabbit"
    || species === "marsh-fox";
}

function directDetail(
  actor: CoreWildlifeActorState,
  value: unknown,
): DirectDetail | null {
  if (!plainRecord(value)) return null;
  const expected = value.visibleAggregateCount === undefined
    ? ["perception", "window"]
    : ["perception", "visibleAggregateCount", "window"];
  if (!exactKeys(value, expected) || !validWindow(value.window) || !plainRecord(value.perception)) {
    return null;
  }
  const window = value.window as unknown as WildlifeDirectObservation["window"];
  const perception = value.perception as unknown as PerceptionResult;
  if (
    perception.valid !== true
    || !hasValidPerceptionSignature(perception, window.terrain.width, window.terrain.height)
    || !nonnegativeSafeInteger(perception.playerTileIndex)
    || perception.playerTileIndex >= window.terrain.width * window.terrain.height
  ) return null;
  const placement = livingActorAddressInRegionalWindow(actor.address, window);
  if (
    placement === null
    || perception.detailVisibilityGrades[placement.tileIndex] !== VISIBILITY_DIRECT
  ) return null;

  let groupSize: number | undefined;
  if (value.visibleAggregateCount !== undefined) {
    const descriptor = PRESENTATION_BY_SPECIES[actor.identity.species];
    const maximum = getCoreWildlifeProfile(actor.identity.species).maximumPatchPopulation;
    if (
      descriptor.groupNoun === null
      || !positiveSafeInteger(value.visibleAggregateCount)
      || value.visibleAggregateCount > maximum
    ) return null;
    groupSize = approximateVisibleGroupSize(value.visibleAggregateCount);
  }

  const playerX = (perception.playerTileIndex % window.terrain.width)
    * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2;
  const playerY = Math.floor(perception.playerTileIndex / window.terrain.width)
    * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2;
  const distanceUnits = Math.round(Math.hypot(
    placement.point.x - playerX,
    placement.point.y - playerY,
  ));
  if (
    !nonnegativeSafeInteger(distanceUnits)
    || distanceUnits > WILDLIFE_DIRECT_DETAIL_MAX_DISTANCE_UNITS
  ) return null;
  const terrainStrength = perception.terrainVisibilityStrengths[placement.tileIndex];
  if (terrainStrength === undefined) return null;
  const distanceClarity = Math.max(0, ACTOR_PERCEPTION_SCALE - Math.round(
    distanceUnits * ACTOR_PERCEPTION_SCALE / WILDLIFE_DIRECT_DETAIL_MAX_DISTANCE_UNITS,
  ));
  const terrainClarity = Math.round(terrainStrength * ACTOR_PERCEPTION_SCALE / 255);
  return Object.freeze({
    point: placement.point,
    heading: placement.heading,
    distanceUnits,
    visualClarity: Math.min(distanceClarity, terrainClarity),
    groupSize,
  });
}

function directEvidenceObservationContext(
  value: unknown,
): DirectEvidenceObservationContext | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["perception", "window"])
    || !validWindow(value.window)
    || !plainRecord(value.perception)
  ) return null;
  const window = value.window as unknown as WildlifePopulationEvidenceObservation["window"];
  const perception = value.perception as unknown as PerceptionResult;
  if (
    perception.valid !== true
    || !hasValidPerceptionSignature(perception, window.terrain.width, window.terrain.height)
    || !nonnegativeSafeInteger(perception.playerTileIndex)
    || perception.playerTileIndex >= window.terrain.width * window.terrain.height
  ) return null;
  try {
    const origin = globalTileToRegion(window.origin.x, window.origin.y);
    return Object.freeze({
      window,
      perception,
      playerPoint: Object.freeze({
        x: (perception.playerTileIndex % window.terrain.width)
          * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
        y: Math.floor(perception.playerTileIndex / window.terrain.width)
          * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
      }),
      frameOrigin: createWorldPosition(
        origin.region,
        origin.localX * WORLD_POSITION_UNITS_PER_TILE,
        origin.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
    });
  } catch {
    return null;
  }
}

function directEvidenceDetail(
  position: WorldPosition,
  context: DirectEvidenceObservationContext,
): DirectEvidenceDetail | null {
  let point: Readonly<{ x: number; y: number }>;
  try {
    point = worldPositionDelta(context.frameOrigin, position);
  } catch {
    return null;
  }
  const widthUnits = context.window.terrain.width * WORLD_POSITION_UNITS_PER_TILE;
  const heightUnits = context.window.terrain.height * WORLD_POSITION_UNITS_PER_TILE;
  if (
    point.x < 0
    || point.y < 0
    || point.x >= widthUnits
    || point.y >= heightUnits
  ) return null;
  const tileX = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const tileY = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  const tileIndex = tileY * context.window.terrain.width + tileX;
  if (context.perception.detailVisibilityGrades[tileIndex] !== VISIBILITY_DIRECT) return null;
  const distanceUnits = Math.round(Math.hypot(
    point.x - context.playerPoint.x,
    point.y - context.playerPoint.y,
  ));
  if (
    !nonnegativeSafeInteger(distanceUnits)
    || distanceUnits > WILDLIFE_DIRECT_DETAIL_MAX_DISTANCE_UNITS
  ) return null;
  const terrainStrength = context.perception.terrainVisibilityStrengths[tileIndex];
  if (terrainStrength === undefined) return null;
  const distanceClarity = Math.max(0, ACTOR_PERCEPTION_SCALE - Math.round(
    distanceUnits * ACTOR_PERCEPTION_SCALE / WILDLIFE_DIRECT_DETAIL_MAX_DISTANCE_UNITS,
  ));
  const terrainClarity = Math.round(terrainStrength * ACTOR_PERCEPTION_SCALE / 255);
  return Object.freeze({
    point,
    distanceUnits,
    visualClarity: Math.min(distanceClarity, terrainClarity),
  });
}

function approximateVisibleGroupSize(count: number): number | undefined {
  if (count <= 1) return undefined;
  if (count <= 3) return 2;
  if (count <= 7) return 5;
  if (count <= 12) return 10;
  if (count <= 18) return 15;
  return 20;
}

function quickLabel(species: CoreWildlifeSpecies, identified: boolean): string {
  const descriptor = PRESENTATION_BY_SPECIES[species];
  if (!identified) return descriptor.unidentifiedQuickLabel;
  const noun = livingSpeciesRegistryEntry(species)?.aboutNoun;
  if (noun === undefined) return "Unknown animal";
  return descriptor.identifiedNounNumber === "plural"
    ? `${displayToken(noun)}s`
    : displayToken(noun);
}

function identityLabel(species: CoreWildlifeSpecies, identified: boolean): string {
  const descriptor = PRESENTATION_BY_SPECIES[species];
  if (!identified) return descriptor.unidentifiedIdentityLabel;
  const noun = livingSpeciesRegistryEntry(species)?.aboutNoun;
  if (noun === undefined) return "Unidentified animal";
  return descriptor.groupNoun === null
    ? displayToken(noun)
    : `${displayToken(noun)} ${descriptor.groupNoun}`;
}

function observableAppearance(actor: CoreWildlifeActorState): string {
  const appearance = displayToken(actor.identity.morph);
  return PRESENTATION_BY_SPECIES[actor.identity.species].appearanceStyle === "plumage"
    ? `Predominantly ${appearance.toLowerCase()}`
    : appearance;
}

function observableConditionLabels(actor: CoreWildlifeActorState): readonly string[] {
  const labels: string[] = [];
  switch (PRESENTATION_BY_SPECIES[actor.identity.species].conditionStyle) {
    case "individual":
      if (actor.condition.health <= 260_000) labels.push("MOVING POORLY");
      else if (actor.condition.health <= 580_000) labels.push("HURT");
      if (actor.condition.exhaustion >= 680_000) labels.push("EXHAUSTED");
      else if (actor.condition.exhaustion >= 340_000) labels.push("TIRED");
      if (actor.condition.stress >= 720_000) labels.push("DISTRESSED");
      else if (actor.condition.stress >= 380_000) labels.push("TENSE");
      break;
    case "flock":
      if (actor.condition.stress >= 500_000) labels.push("RESTLESS");
      break;
    case "none":
      break;
  }
  return Object.freeze(labels);
}

function presentationBehavior(intent: CoreWildlifeIntentKind): WildlifePresentationBehavior {
  switch (intent) {
    case "observe": return "watch";
    case "disengage":
    case "retreat": return "retreat";
    case "flee": return "flee";
    case "alarm": return "alarm";
    case "guard": return "guard";
    case "scavenge": return "scavenge";
    case "forage": return "forage";
    case "pursue": return "pursue";
    case "rest": return "rest";
  }
}

function observableBehavior(intent: CoreWildlifeIntentKind): string {
  switch (intent) {
    case "observe": return "Watching";
    case "disengage": return "Moving away";
    case "flee": return "Fleeing";
    case "alarm": return "Calling and alert";
    case "retreat": return "Backing away";
    case "guard": return "Holding ground";
    case "scavenge": return "Scavenging";
    case "forage": return "Foraging";
    case "pursue": return "Moving with focus";
    case "rest": return "Resting";
  }
}

function coarseMotion(intent: CoreWildlifeIntentKind): string {
  return intent === "observe" || intent === "guard" || intent === "rest"
    ? "Still"
    : "Moving";
}

function sizeScale(species: CoreWildlifeSpecies, lifeStage: CoreWildlifeLifeStage): number {
  const descriptor = PRESENTATION_BY_SPECIES[species];
  const speciesScale = descriptor.baseSizeScale;
  if (!descriptor.exposesLifeStage) return speciesScale;
  const ageScale = lifeStage === "juvenile" ? 0.76 : lifeStage === "older" ? 0.96 : 1;
  return Math.round(speciesScale * ageScale * 1_000) / 1_000;
}

function displayToken(value: string): string {
  const label = value.replaceAll("-", " ");
  return label.length === 0 ? label : label[0]!.toUpperCase() + label.slice(1);
}

function validWindow(value: unknown): value is WildlifeDirectObservation["window"] {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["origin", "terrain"])
    || !plainRecord(value.origin)
    || !exactKeys(value.origin, ["x", "y"])
    || !safeInteger(value.origin.x)
    || !safeInteger(value.origin.y)
    || !plainRecord(value.terrain)
    || !exactKeys(value.terrain, ["height", "width"])
    || !positiveSafeInteger(value.terrain.width)
    || !positiveSafeInteger(value.terrain.height)
  ) return false;
  const cells = value.terrain.width * value.terrain.height;
  return Number.isSafeInteger(cells) && cells > 0 && cells <= 1_048_576;
}

function allowedInputKeys(value: Record<string, unknown>): boolean {
  const expected = value.selected === undefined
    ? ["actor", "observation", "tileSize"]
    : ["actor", "observation", "selected", "tileSize"];
  return exactKeys(value, expected);
}

function allowedPopulationEvidenceInputKeys(value: Record<string, unknown>): boolean {
  const expected = value.selectedEvidenceId === undefined
    ? ["observation", "patch", "tileSize"]
    : ["observation", "patch", "selectedEvidenceId", "tileSize"];
  return exactKeys(value, expected);
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) > 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length && keys.every((key, index) => key === canonical[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
