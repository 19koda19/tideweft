import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorObservations,
  canonicalizeActorPerceptionState,
  createActorObservation,
  queryActorAttention,
  queryActorSearch,
  type ActorObservation,
  type ActorPerceptionState,
  type ObservationInterrupt,
} from "../sim/actorPerception";
import { globalTileToRegion } from "../sim/regions";
import { FIXED_POINT, type WorldView } from "../sim/types";
import {
  evaluateAudibleContact,
  evaluateVisualContact,
  type AudibleContact,
} from "./perception";
import { buildWorldPerceptionCells } from "./outdoorIllumination";
import { prepareTerrainAudibleContactInput } from "./terrainAcoustics";
import type { RegionalTerrainWindow } from "./regionalTravel";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  regionalCompatibilityWorldForWorld,
  regionalWindowForWorld,
} from "./regionalWorldView";
import {
  residentPlacementInRegionalWindow,
  resolveResidentWorldPlacement,
  type ResidentWorldPlacement,
} from "./residentSpatial";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  isWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
  type SpatialFrame,
  type SpatialFramePoint,
  type WorldPosition,
} from "./worldPosition";
import {
  PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS,
  PHYSICAL_ACOUSTIC_MAX_SAMPLES,
  ambientNoiseAt,
  createPhysicalSoundSample,
  evaluatePhysicalAcousticListener,
  inferAnonymousHearingArea,
  type PhysicalSoundSample,
} from "./physicalAcousticPerception";
import {
  canonicalizeSituatedExpressionSemanticFact,
  type SituatedExpressionSemanticFact,
} from "./situatedExpressionAcoustics";

export {
  ambientNoiseAt,
  createPhysicalSoundSample,
  type PhysicalSoundSample,
} from "./physicalAcousticPerception";

export const PLAYER_SENSE_SAMPLE_VERSION = 1 as const;
export const LOCAL_PLAYER_SUBJECT_ID = LOCAL_PLAYER_LIVING_ACTOR_ID;
export const HUMAN_PERCEPTION_MAX_RESIDENTS = 64 as const;
export const HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES = 16 as const;
export const HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES = 8 as const;
export const HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES = PHYSICAL_ACOUSTIC_MAX_SAMPLES;
export const HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT =
  HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES * 2
  + HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES
  + HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES;
export const HUMAN_HEARING_MAX_RANGE_UNITS = PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS;

const SAMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const SOUND_CLASS_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const ACTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const EXPRESSION_EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,179}$/;
const ACOUSTIC_EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const EMPTY_BATCHES: readonly HumanObservationBatch[] = Object.freeze([]);
const EMPTY_SUPPLEMENTAL_SOUND_SAMPLES: readonly SupplementalSoundSample[] = Object.freeze([]);
const EMPTY_SUPPLEMENTAL_SEMANTIC_FACTS: readonly SituatedExpressionSemanticFact[] =
  Object.freeze([]);
const EMPTY_PHYSICAL_SOUND_SAMPLES: readonly PhysicalSoundSample[] = Object.freeze([]);
const EMPTY_UNADMITTED_ALARM_SOUND_SAMPLES: readonly UnadmittedAlarmSoundSample[] =
  Object.freeze([]);

/**
 * Shared physical acoustic fields. Player step samples retain these fields
 * without pretending that they are source-authenticated actor vocalizations.
 */
interface AcousticSample {
  readonly id: string;
  readonly position: WorldPosition;
  /** Fixed-point 0..1 source loudness; zero means no sound. */
  readonly soundLoudness: number;
  readonly soundRangeUnits: number;
  readonly soundClass: string;
  readonly soundInterrupt: ObservationInterrupt;
}

/**
 * One bounded, source-authenticated hearing-only actor expression sound.
 * Most current records are vocal, while embodied communicative signals may
 * reuse the same exact expression trajectory. Source position informs
 * propagation only and never grants observers identity.
 */
export interface SupplementalSoundSample extends AcousticSample {
  readonly sourceActorId: string;
  /** Exact situated-expression event that emitted this one pending sound fact. */
  readonly expressionEventId: string;
}

/**
 * A transient committed domain alarm whose optional expression was not admitted.
 * This carrier validates acoustic shape, not the originating action: the caller
 * authenticates cause, source, event, and locus before supplying it. It shares
 * physical-world hearing capacity and never claims a situated-expression event.
 */
export interface UnadmittedAlarmSoundSample extends AcousticSample {
  readonly sourceActorId: string;
  /** Exact committed domain event that owns the audible alarm. */
  readonly acousticEventId: string;
  readonly soundClass: "animal-alarm";
  readonly soundInterrupt: "strong";
}

/** One bounded, explicit physical player stimulus at a canonical world point. */
export interface PlayerSenseSample extends AcousticSample {
  readonly version: typeof PLAYER_SENSE_SAMPLE_VERSION;
  /** Monotonic position inside the bounded player-step window. */
  readonly sampleOrdinal: number;
  /** Fixed-point 0..1 movement visibility. */
  readonly movementSalience: number;
  /** Fixed-point 0..1 light falling on the player. */
  readonly lightVisibility: number;
}

export type SupplementalSoundSampleInput = SupplementalSoundSample;
export type PhysicalSoundSampleInput = PhysicalSoundSample;
export interface PlayerSenseSampleInput extends Omit<PlayerSenseSample, "version"> {}

export interface HumanPerceptionInput {
  /** The current regional WorldView registered to `window`. */
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly targetTick: number;
  readonly playerSamples: readonly PlayerSenseSample[];
  /** Bounded hearing-only facts carried beside, never merged into, physical step samples. */
  readonly supplementalSoundSamples?: readonly SupplementalSoundSample[];
  /**
   * Bounded meanings that the caller has re-derived from authenticated domain
   * authority. This bridge validates their shape and matching sound, but does
   * not authenticate the originating action/admission itself. A matching sound
   * must still be lawfully heard clearly enough by each actor.
   */
  readonly supplementalSemanticFacts?: readonly SituatedExpressionSemanticFact[];
  /** Bounded physical-world sounds bound to committed acoustic events. */
  readonly physicalSoundSamples?: readonly PhysicalSoundSample[];
  /** Shares the physical-world sound budget; never enters expression/save carry. */
  readonly unadmittedAlarmSoundSamples?: readonly UnadmittedAlarmSoundSample[];
  /**
   * Transient caller-authenticated surface support for supplied non-player
   * sounds. Omitted IDs have unmodeled support; sample identity or vocabulary
   * cannot establish physical height. Player step samples are already surface
   * actions and must not be repeated here. This metadata is never save carry.
   */
  readonly surfaceSoundSampleIds?: readonly string[];
}

export interface HumanObservationBatch {
  readonly residentId: number;
  readonly observerId: string;
  readonly priorState: ActorPerceptionState;
  readonly observations: readonly ActorObservation[];
}

/** Optional DEV evidence from the existing hearing query, never a knowledge input. */
export interface HumanSupplementalListeningReceipt {
  readonly expressionEventId: string;
  readonly sourceActorId: string;
  readonly sampleId: string;
  readonly residentId: number;
  readonly observerId: string;
  readonly observedAtTick: number;
  readonly outcome: "heard" | "not-heard" | "source-excluded" | "unavailable";
  readonly contact: AudibleContact | null;
  readonly semanticFact: SituatedExpressionSemanticFact | null;
  readonly observation: ActorObservation | null;
}

/** Creates one validated immutable hearing-only stimulus, or null without repair. */
export function createSupplementalSoundSample(
  input: SupplementalSoundSampleInput,
): SupplementalSoundSample | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "expressionEventId",
    "id",
    "position",
    "soundClass",
    "soundInterrupt",
    "soundLoudness",
    "soundRangeUnits",
    "sourceActorId",
  ])
    || !validSoundFields(value)
    || !validActorId(value.sourceActorId)
    || !validExpressionEventId(value.expressionEventId)
  ) return null;
  return Object.freeze({
    expressionEventId: value.expressionEventId,
    id: value.id,
    position: createWorldPosition(
      value.position.region,
      value.position.localX,
      value.position.localY,
    ),
    soundLoudness: value.soundLoudness,
    soundRangeUnits: value.soundRangeUnits,
    soundClass: value.soundClass,
    soundInterrupt: value.soundInterrupt,
    sourceActorId: value.sourceActorId,
  });
}

/** Validates only one immutable domain-alarm hearing shape, without repair. */
export function createUnadmittedAlarmSoundSample(
  input: UnadmittedAlarmSoundSample,
): UnadmittedAlarmSoundSample | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "acousticEventId",
    "id",
    "position",
    "soundClass",
    "soundInterrupt",
    "soundLoudness",
    "soundRangeUnits",
    "sourceActorId",
  ])
    || !validSoundFields(value)
    || value.soundClass !== "animal-alarm"
    || value.soundInterrupt !== "strong"
    || !validActorId(value.sourceActorId)
    || typeof value.acousticEventId !== "string"
    || !ACOUSTIC_EVENT_ID_PATTERN.test(value.acousticEventId)
  ) return null;
  return Object.freeze({
    acousticEventId: value.acousticEventId,
    id: value.id,
    position: createWorldPosition(
      value.position.region,
      value.position.localX,
      value.position.localY,
    ),
    soundLoudness: value.soundLoudness,
    soundRangeUnits: value.soundRangeUnits,
    soundClass: value.soundClass,
    soundInterrupt: value.soundInterrupt,
    sourceActorId: value.sourceActorId,
  });
}

/** Creates one fully validated immutable stimulus, or null without repair. */
export function createPlayerSenseSample(input: PlayerSenseSampleInput): PlayerSenseSample | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "id",
    "lightVisibility",
    "movementSalience",
    "position",
    "sampleOrdinal",
    "soundClass",
    "soundInterrupt",
    "soundLoudness",
    "soundRangeUnits",
  ]) || !validSoundFields(value)) return null;
  if (
    !Number.isSafeInteger(value.sampleOrdinal)
    || (value.sampleOrdinal as number) < 0
    || (value.sampleOrdinal as number) >= HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES
    || !fixedUnit(value.movementSalience)
    || !fixedUnit(value.lightVisibility)
  ) return null;
  return Object.freeze({
    version: PLAYER_SENSE_SAMPLE_VERSION,
    id: value.id,
    sampleOrdinal: value.sampleOrdinal as number,
    position: createWorldPosition(
      value.position.region,
      value.position.localX,
      value.position.localY,
    ),
    movementSalience: value.movementSalience,
    lightVisibility: value.lightVisibility,
    soundLoudness: value.soundLoudness,
    soundRangeUnits: value.soundRangeUnits,
    soundClass: value.soundClass,
    soundInterrupt: value.soundInterrupt,
  });
}

/**
 * Produces deterministic F0 observation batches for current-frame existing
 * humans. It does not mutate or advance cognition; the simulation remains the
 * sole owner of applying these batches to each supplied prior state.
 */
export function collectExistingHumanObservations(
  input: HumanPerceptionInput,
  onSupplementalListening?: (receipts: readonly HumanSupplementalListeningReceipt[]) => void,
): readonly HumanObservationBatch[] {
  const value: unknown = input;
  if (!plainRecord(value)) return EMPTY_BATCHES;
  const hasSupplementalSounds = Object.hasOwn(value, "supplementalSoundSamples");
  const hasSupplementalSemanticFacts = Object.hasOwn(value, "supplementalSemanticFacts");
  const hasPhysicalSounds = Object.hasOwn(value, "physicalSoundSamples");
  const hasUnadmittedAlarmSounds = Object.hasOwn(value, "unadmittedAlarmSoundSamples");
  const hasSurfaceSoundSampleIds = Object.hasOwn(value, "surfaceSoundSampleIds");
  const expectedKeys = ["playerSamples", "targetTick", "window", "world"];
  if (hasSupplementalSounds) expectedKeys.push("supplementalSoundSamples");
  if (hasSupplementalSemanticFacts) expectedKeys.push("supplementalSemanticFacts");
  if (hasPhysicalSounds) expectedKeys.push("physicalSoundSamples");
  if (hasUnadmittedAlarmSounds) expectedKeys.push("unadmittedAlarmSoundSamples");
  if (hasSurfaceSoundSampleIds) expectedKeys.push("surfaceSoundSampleIds");
  if (!exactKeys(value, expectedKeys)) return EMPTY_BATCHES;
  const { world, window, targetTick } = input;
  if (
    (hasSupplementalSounds && !Array.isArray(input.supplementalSoundSamples))
    || (hasSupplementalSemanticFacts && !Array.isArray(input.supplementalSemanticFacts))
    || (hasPhysicalSounds && !Array.isArray(input.physicalSoundSamples))
    || (hasUnadmittedAlarmSounds && !Array.isArray(input.unadmittedAlarmSoundSamples))
    || (hasSurfaceSoundSampleIds && !Array.isArray(input.surfaceSoundSampleIds))
  ) return EMPTY_BATCHES;
  const rawSupplementalSounds = input.supplementalSoundSamples
    ?? EMPTY_SUPPLEMENTAL_SOUND_SAMPLES;
  const rawSupplementalSemanticFacts = input.supplementalSemanticFacts
    ?? EMPTY_SUPPLEMENTAL_SEMANTIC_FACTS;
  const rawPhysicalSounds = input.physicalSoundSamples
    ?? EMPTY_PHYSICAL_SOUND_SAMPLES;
  const rawUnadmittedAlarmSounds = input.unadmittedAlarmSoundSamples
    ?? EMPTY_UNADMITTED_ALARM_SOUND_SAMPLES;
  if (
    regionalWindowForWorld(world) !== window
    || !Number.isSafeInteger(targetTick)
    || targetTick < 0
    || !Array.isArray(input.playerSamples)
    || input.playerSamples.length > HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES
    || !Array.isArray(rawSupplementalSounds)
    || rawSupplementalSounds.length > HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES
    || !Array.isArray(rawSupplementalSemanticFacts)
    || rawSupplementalSemanticFacts.length > HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES
    || !Array.isArray(rawPhysicalSounds)
    || rawPhysicalSounds.length > HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES
    || !Array.isArray(rawUnadmittedAlarmSounds)
    || rawPhysicalSounds.length + rawUnadmittedAlarmSounds.length
      > HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES
    || !validRegionalWorld(world, window)
    || !validWeather(world)
  ) return EMPTY_BATCHES;
  const economy = regionalCompatibilityWorldForWorld(world);
  if (economy === null) return EMPTY_BATCHES;
  const frame = spatialFrameForWindow(window);
  if (frame === null) return EMPTY_BATCHES;
  const samples = canonicalSamples(input.playerSamples);
  if (samples === null) return EMPTY_BATCHES;
  const supplementalSounds = canonicalSupplementalSoundSamples(rawSupplementalSounds);
  const supplementalSemanticFacts = canonicalSupplementalSemanticFacts(
    rawSupplementalSemanticFacts,
    supplementalSounds,
  );
  const physicalSounds = canonicalPhysicalSoundSamples(rawPhysicalSounds);
  const unadmittedAlarmSounds = canonicalUnadmittedAlarmSoundSamples(rawUnadmittedAlarmSounds);
  if (
    supplementalSounds === null
    || supplementalSemanticFacts === null
    || physicalSounds === null
    || unadmittedAlarmSounds === null
    || !disjointSampleIds(samples, supplementalSounds, physicalSounds, unadmittedAlarmSounds)
    || !disjointAcousticEventIds(physicalSounds, unadmittedAlarmSounds)
  ) return EMPTY_BATCHES;
  const surfaceSoundSampleIds = validatedSurfaceSoundSampleIds(
    input.surfaceSoundSampleIds ?? [],
    supplementalSounds,
    physicalSounds,
    unadmittedAlarmSounds,
  );
  if (surfaceSoundSampleIds === null) return EMPTY_BATCHES;
  const cells = buildWorldPerceptionCells(world);
  if (cells === null) return EMPTY_BATCHES;
  const semanticFactByExpressionEventId = new Map(
    supplementalSemanticFacts.map((fact) => [fact.expressionEventId, fact]),
  );

  const positioned = world.residents.flatMap((resident) => {
    const placement = resolveResidentWorldPlacement(economy, resident);
    if (placement === null || residentPlacementInRegionalWindow(placement, window) === null) {
      return [];
    }
    return [{ resident, placement }];
  }).sort((left, right) => compareText(
    left.resident.identity.stableId,
    right.resident.identity.stableId,
  ) || left.resident.id - right.resident.id);
  const selected = positioned.slice(0, HUMAN_PERCEPTION_MAX_RESIDENTS);
  if (!uniqueResidents(selected)) return EMPTY_BATCHES;

  const batches: HumanObservationBatch[] = [];
  const listeningReceipts: HumanSupplementalListeningReceipt[] | null = import.meta.env.DEV
    && typeof onSupplementalListening === "function" ? [] : null;
  for (const { resident, placement } of selected) {
    const priorState = canonicalizeActorPerceptionState(resident.perception);
    if (
      priorState === null
      || priorState.actorId !== resident.identity.stableId
      || priorState.tick >= targetTick
    ) return EMPTY_BATCHES;
    const projectedResident = residentPlacementInRegionalWindow(placement, window);
    if (projectedResident === null) return EMPTY_BATCHES;
    const ambientNoise = ambientNoiseAt(world, projectedResident.tileIndex);
    if (ambientNoise === null) return EMPTY_BATCHES;
    const facing = lawfulResidentFacing(priorState, placement);
    const observations: ActorObservation[] = [];
    let latestIdentifiedVisual: {
      readonly sampleOrdinal: number;
      readonly observation: ActorObservation;
    } | null = null;
    const recordListening = (
      sample: SupplementalSoundSample | null,
      semanticFact: SituatedExpressionSemanticFact | null,
      outcome: HumanSupplementalListeningReceipt["outcome"],
      contact: AudibleContact | null = null,
      observation: ActorObservation | null = null,
    ): void => {
      if (import.meta.env.DEV && listeningReceipts !== null && sample !== null) {
        listeningReceipts.push({
          expressionEventId: sample.expressionEventId, sourceActorId: sample.sourceActorId,
          sampleId: sample.id, residentId: resident.id, observerId: priorState.actorId,
          observedAtTick: targetTick, outcome, contact, semanticFact, observation,
        });
      }
    };
    const appendHearingObservation = (
      sample: AcousticSample,
      targetPoint: SpatialFramePoint,
      semanticFact: SituatedExpressionSemanticFact | null = null,
      diagnosticSample: SupplementalSoundSample | null = null,
      sourceSupport: "surface" | "unmodeled" = surfaceSoundSampleIds.has(sample.id)
        ? "surface" : "unmodeled",
    ): boolean => {
      if (sample.soundLoudness <= 0 || sample.soundRangeUnits <= 0) {
        if (import.meta.env.DEV) recordListening(diagnosticSample, semanticFact, "not-heard");
        return true;
      }
      const acousticInput = prepareTerrainAudibleContactInput({
        listener: projectedResident.position,
        source: targetPoint,
        baseRange: sample.soundRangeUnits,
        ambientNoise,
        sourceLoudness: sample.soundLoudness / FIXED_POINT,
        wind: {
          x: world.weather.windX / FIXED_POINT,
          y: world.weather.windY / FIXED_POINT,
        },
      }, {
        world,
        listenerPosition: placement.position,
        sourcePosition: sample.position,
        sourceSupport,
        listenerSupport: "surface",
      });
      if (acousticInput === null) return false;
      const heard = evaluateAudibleContact(acousticInput);
      if (heard === null) {
        if (import.meta.env.DEV) recordListening(diagnosticSample, semanticFact, "not-heard");
        return true;
      }
      const area = inferAnonymousHearingArea(placement.position, sample.position, heard);
      if (area === null) return false;
      const hearingConfidence = scaleContact(heard.certainty);
      const perceivedClass = semanticFact !== null
        && hearingConfidence >= semanticFact.minimumHearingConfidence
        ? semanticFact.perceivedClass
        : sample.soundClass;
      const observation = createActorObservation({
        id: observationId("h", targetTick, resident.id, sample.id),
        observerId: priorState.actorId,
        observedAtTick: targetTick,
        channel: "hearing",
        perceivedClass,
        subjectId: null,
        area,
        confidence: hearingConfidence,
        salience: hearingSalience(heard.certainty, sample.soundLoudness),
        identification: "anonymous",
        interrupt: sample.soundInterrupt,
      });
      if (observation === null) return false;
      observations.push(observation);
      if (import.meta.env.DEV) recordListening(diagnosticSample, semanticFact, "heard", heard, observation);
      return true;
    };

    for (const sample of samples) {
      const targetPoint = projectedSamplePoint(frame, world, sample.position);
      if (targetPoint === null) continue;
      const targetX = Math.floor(targetPoint.x / WORLD_POSITION_UNITS_PER_TILE);
      const targetY = Math.floor(targetPoint.y / WORLD_POSITION_UNITS_PER_TILE);
      const targetTileIndex = targetY * world.terrain.width + targetX;
      const sight = evaluateVisualContact({
        columns: world.terrain.width,
        rows: world.terrain.height,
        cells,
        observerTileIndex: projectedResident.tileIndex,
        targetTileIndex,
        observerFacingRadians: facing,
        weatherVisibility: weatherVisibility(world),
        targetMovementSalience: sample.movementSalience / FIXED_POINT,
        targetLightVisibility: sample.lightVisibility / FIXED_POINT,
      });
      if (sight !== null) {
        const identified = sight.identityEligible;
        const observation = createActorObservation({
          id: observationId("v", targetTick, resident.id, sample.id),
          observerId: priorState.actorId,
          observedAtTick: targetTick,
          channel: "vision",
          perceivedClass: "human",
          subjectId: identified ? LOCAL_PLAYER_SUBJECT_ID : null,
          area: { center: sample.position, radiusUnits: 0 },
          confidence: scaleContact(sight.confidence),
          salience: visualSalience(sight.confidence, sample, identified),
          identification: identified ? "identified" : "classified",
          interrupt: "none",
        });
        if (observation === null) return EMPTY_BATCHES;
        if (!identified) {
          observations.push(observation);
        } else if (
          latestIdentifiedVisual === null
          || sample.sampleOrdinal > latestIdentifiedVisual.sampleOrdinal
        ) {
          // A world tick may contain several fixed player steps. Preserve the
          // latest lawful identified sighting as the actor's last-known point,
          // never an earlier but equally strong frame from the same interval.
          latestIdentifiedVisual = {
            sampleOrdinal: sample.sampleOrdinal,
            observation,
          };
        }
      }
      if (!appendHearingObservation(sample, targetPoint, null, null, "surface")) {
        return EMPTY_BATCHES;
      }
    }
    for (const sample of supplementalSounds) {
      const semanticFact = semanticFactByExpressionEventId.get(sample.expressionEventId) ?? null;
      if (sample.sourceActorId === priorState.actorId) {
        if (import.meta.env.DEV) recordListening(sample, semanticFact, "source-excluded");
        continue;
      }
      const targetPoint = projectedSamplePoint(frame, world, sample.position);
      if (targetPoint === null) {
        if (import.meta.env.DEV) recordListening(sample, semanticFact, "unavailable");
        continue;
      }
      if (!appendHearingObservation(
        sample,
        targetPoint,
        semanticFact,
        sample,
      )) return EMPTY_BATCHES;
    }
    for (const sample of physicalSounds) {
      const targetPoint = projectedSamplePoint(frame, world, sample.position);
      if (targetPoint === null) continue;
      const reception = evaluatePhysicalAcousticListener({
        observationId: observationId("h", targetTick, resident.id, sample.id),
        observerId: priorState.actorId,
        observerPosition: placement.position,
        observedAtTick: targetTick,
        sample,
        effectiveRangeUnits: sample.soundRangeUnits,
        ambientNoise,
        wind: {
          x: world.weather.windX / FIXED_POINT,
          y: world.weather.windY / FIXED_POINT,
        },
      }, {
        world,
        sourceSupport: surfaceSoundSampleIds.has(sample.id) ? "surface" : "unmodeled",
        listenerSupport: "surface",
      });
      if (reception === null) return EMPTY_BATCHES;
      if (reception.kind === "heard") observations.push(reception.observation);
    }
    for (const sample of unadmittedAlarmSounds) {
      if (sample.sourceActorId === priorState.actorId) continue;
      const targetPoint = projectedSamplePoint(frame, world, sample.position);
      if (targetPoint === null) continue;
      if (!appendHearingObservation(sample, targetPoint)) return EMPTY_BATCHES;
    }
    if (latestIdentifiedVisual !== null) {
      observations.push(latestIdentifiedVisual.observation);
    }

    const canonical = canonicalizeActorObservations(observations);
    if (canonical.length > HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT) {
      return EMPTY_BATCHES;
    }
    batches.push(Object.freeze({
      residentId: resident.id,
      observerId: priorState.actorId,
      priorState,
      observations: canonical,
    }));
  }
  if (import.meta.env.DEV && listeningReceipts !== null && onSupplementalListening !== undefined) {
    try {
      // Deliver only a complete successful frame. A failing later listener must
      // never publish partial evidence. Neither copying nor the observer can
      // veto, mutate or retain objects from the authoritative sensory result.
      onSupplementalListening(freezeListeningCopy(structuredClone(listeningReceipts)));
    } catch {
      // Optional diagnostics are deliberately failure-isolated.
    }
  }
  return Object.freeze(batches);
}

function freezeListeningCopy<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) freezeListeningCopy(nested);
    Object.freeze(value);
  }
  return value;
}

function canonicalSamples(value: readonly PlayerSenseSample[]): readonly PlayerSenseSample[] | null {
  const samples: PlayerSenseSample[] = [];
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const raw of value) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "id",
      "lightVisibility",
      "movementSalience",
      "position",
      "sampleOrdinal",
      "soundClass",
      "soundInterrupt",
      "soundLoudness",
      "soundRangeUnits",
      "version",
    ]) || raw.version !== PLAYER_SENSE_SAMPLE_VERSION) return null;
    const sample = createPlayerSenseSample({
      id: raw.id,
      sampleOrdinal: raw.sampleOrdinal,
      position: raw.position,
      movementSalience: raw.movementSalience,
      lightVisibility: raw.lightVisibility,
      soundLoudness: raw.soundLoudness,
      soundRangeUnits: raw.soundRangeUnits,
      soundClass: raw.soundClass,
      soundInterrupt: raw.soundInterrupt,
    } as PlayerSenseSampleInput);
    if (sample === null || ids.has(sample.id) || ordinals.has(sample.sampleOrdinal)) return null;
    ids.add(sample.id);
    ordinals.add(sample.sampleOrdinal);
    samples.push(sample);
  }
  samples.sort((left, right) => (
    left.sampleOrdinal - right.sampleOrdinal || compareText(left.id, right.id)
  ));
  return Object.freeze(samples);
}

function canonicalSupplementalSoundSamples(
  value: readonly SupplementalSoundSample[],
): readonly SupplementalSoundSample[] | null {
  const samples: SupplementalSoundSample[] = [];
  const ids = new Set<string>();
  const expressionEventIds = new Set<string>();
  for (const raw of value) {
    const sample = createSupplementalSoundSample(raw);
    if (
      sample === null
      || ids.has(sample.id)
      || expressionEventIds.has(sample.expressionEventId)
    ) return null;
    ids.add(sample.id);
    expressionEventIds.add(sample.expressionEventId);
    samples.push(sample);
  }
  samples.sort((left, right) => compareText(left.id, right.id));
  return Object.freeze(samples);
}

function canonicalSupplementalSemanticFacts(
  value: readonly SituatedExpressionSemanticFact[],
  samples: readonly SupplementalSoundSample[] | null,
): readonly SituatedExpressionSemanticFact[] | null {
  if (samples === null) return null;
  const sampleByEventId = new Map(samples.map((sample) => [sample.expressionEventId, sample]));
  const facts: SituatedExpressionSemanticFact[] = [];
  const eventIds = new Set<string>();
  for (const raw of value) {
    const fact = canonicalizeSituatedExpressionSemanticFact(raw);
    const sample = fact === null
      ? undefined
      : sampleByEventId.get(fact.expressionEventId);
    if (
      fact === null
      || sample === undefined
      || sample.sourceActorId !== fact.sourceActorId
      || sample.soundClass !== "human-vocalization"
      || eventIds.has(fact.expressionEventId)
    ) return null;
    eventIds.add(fact.expressionEventId);
    facts.push(fact);
  }
  facts.sort((left, right) => compareText(
    left.expressionEventId,
    right.expressionEventId,
  ));
  return Object.freeze(facts);
}

function canonicalPhysicalSoundSamples(
  value: readonly PhysicalSoundSample[],
): readonly PhysicalSoundSample[] | null {
  const samples: PhysicalSoundSample[] = [];
  const ids = new Set<string>();
  const acousticEventIds = new Set<string>();
  for (const raw of value) {
    const sample = createPhysicalSoundSample(raw);
    if (
      sample === null
      || ids.has(sample.id)
      || acousticEventIds.has(sample.acousticEventId)
    ) return null;
    ids.add(sample.id);
    acousticEventIds.add(sample.acousticEventId);
    samples.push(sample);
  }
  samples.sort((left, right) => compareText(left.id, right.id));
  return Object.freeze(samples);
}

function canonicalUnadmittedAlarmSoundSamples(
  value: readonly UnadmittedAlarmSoundSample[],
): readonly UnadmittedAlarmSoundSample[] | null {
  const samples: UnadmittedAlarmSoundSample[] = [];
  const ids = new Set<string>();
  const acousticEventIds = new Set<string>();
  for (const raw of value) {
    const sample = createUnadmittedAlarmSoundSample(raw);
    if (
      sample === null
      || ids.has(sample.id)
      || acousticEventIds.has(sample.acousticEventId)
    ) return null;
    ids.add(sample.id);
    acousticEventIds.add(sample.acousticEventId);
    samples.push(sample);
  }
  samples.sort((left, right) => compareText(left.id, right.id));
  return Object.freeze(samples);
}

function validatedSurfaceSoundSampleIds(
  value: readonly string[],
  supplementalSounds: readonly SupplementalSoundSample[],
  physicalSounds: readonly PhysicalSoundSample[],
  unadmittedAlarmSounds: readonly UnadmittedAlarmSoundSample[],
): ReadonlySet<string> | null {
  if (value.length > HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES
    + HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES) return null;
  const suppliedIds = new Set<string>();
  for (const samples of [supplementalSounds, physicalSounds, unadmittedAlarmSounds]) {
    for (const sample of samples) suppliedIds.add(sample.id);
  }
  const surfaceIds = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !SAMPLE_ID_PATTERN.test(id)
      || surfaceIds.has(id) || !suppliedIds.has(id)) return null;
    surfaceIds.add(id);
  }
  return surfaceIds;
}

function disjointAcousticEventIds(
  physicalSounds: readonly PhysicalSoundSample[],
  unadmittedAlarmSounds: readonly UnadmittedAlarmSoundSample[],
): boolean {
  const ids = new Set(physicalSounds.map(({ acousticEventId }) => acousticEventId));
  return unadmittedAlarmSounds.every(({ acousticEventId }) => !ids.has(acousticEventId));
}

function disjointSampleIds(
  playerSamples: readonly PlayerSenseSample[],
  supplementalSounds: readonly SupplementalSoundSample[],
  physicalSounds: readonly PhysicalSoundSample[],
  unadmittedAlarmSounds: readonly UnadmittedAlarmSoundSample[],
): boolean {
  const ids = new Set(playerSamples.map(({ id }) => id));
  for (const { id } of supplementalSounds) {
    if (ids.has(id)) return false;
    ids.add(id);
  }
  for (const { id } of physicalSounds) {
    if (ids.has(id)) return false;
    ids.add(id);
  }
  return unadmittedAlarmSounds.every(({ id }) => !ids.has(id));
}

function projectedSamplePoint(
  frame: SpatialFrame,
  world: WorldView,
  position: WorldPosition,
): SpatialFramePoint | null {
  const point = worldPositionToSpatialFrame(frame, position);
  if (point === null) return null;
  const targetX = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const targetY = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  return targetX < 0
    || targetY < 0
    || targetX >= world.terrain.width
    || targetY >= world.terrain.height
    ? null
    : point;
}

function lawfulResidentFacing(
  priorState: ActorPerceptionState,
  placement: ResidentWorldPlacement,
): number {
  const search = queryActorSearch(priorState);
  if (search !== null) {
    return facingTowardSavedPoint(placement, search.nextProbe);
  }
  const attention = queryActorAttention(priorState)[0];
  if (attention !== undefined) {
    return facingTowardSavedPoint(placement, attention.area.center);
  }
  return placement.facing;
}

function facingTowardSavedPoint(
  placement: ResidentWorldPlacement,
  point: WorldPosition,
): number {
  try {
    const delta = worldPositionDelta(placement.position, point);
    return delta.x === 0 && delta.y === 0
      ? placement.facing
      : Math.atan2(delta.y, delta.x);
  } catch {
    return placement.facing;
  }
}

function spatialFrameForWindow(window: RegionalTerrainWindow): SpatialFrame | null {
  try {
    const address = globalTileToRegion(window.origin.x, window.origin.y);
    return createSpatialFrame(
      createWorldPosition(
        address.region,
        address.localX * WORLD_POSITION_UNITS_PER_TILE,
        address.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      window.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      window.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
}

function validRegionalWorld(world: WorldView, window: RegionalTerrainWindow): boolean {
  return world.terrain.width === window.terrain.width
    && world.terrain.height === window.terrain.height
    && world.terrain.tiles.length === world.terrain.width * world.terrain.height
    && window.addresses.length === world.terrain.tiles.length;
}

function validWeather(world: WorldView): boolean {
  return fixedUnit(world.weather.intensity)
    && signedFixedUnit(world.weather.windX)
    && signedFixedUnit(world.weather.windY)
    && fixedUnit(world.tide.level);
}

function uniqueResidents(
  values: readonly { readonly resident: WorldView["residents"][number] }[],
): boolean {
  const ids = new Set<number>();
  const stableIds = new Set<string>();
  for (const { resident } of values) {
    if (ids.has(resident.id) || stableIds.has(resident.identity.stableId)) return false;
    ids.add(resident.id);
    stableIds.add(resident.identity.stableId);
  }
  return true;
}

function observationId(
  channel: "v" | "h",
  tick: number,
  residentId: number,
  sampleId: string,
): string {
  return `hp-${channel}-${tick}-${residentId}-${sampleId}`;
}

function visualSalience(
  confidence: number,
  sample: PlayerSenseSample,
  identified: boolean,
): number {
  return Math.max(
    scaleContact(confidence),
    Math.round(sample.movementSalience * 0.85),
    identified ? 650_000 : 0,
  );
}

function hearingSalience(certainty: number, loudness: number): number {
  return Math.min(
    ACTOR_PERCEPTION_SCALE,
    Math.round(certainty * ACTOR_PERCEPTION_SCALE * 0.7 + loudness * 0.3),
  );
}

function scaleContact(value: number): number {
  return Math.max(0, Math.min(ACTOR_PERCEPTION_SCALE, Math.round(
    value * ACTOR_PERCEPTION_SCALE,
  )));
}

function weatherVisibility(world: WorldView): number {
  return Math.max(0, Math.min(1, 1 - world.weather.intensity / FIXED_POINT * 0.52));
}

function validSoundFields(
  value: Readonly<Record<string, unknown>>,
): value is Readonly<Record<string, unknown>> & AcousticSample {
  const soundRangeUnits = value.soundRangeUnits;
  return typeof value.id === "string"
    && SAMPLE_ID_PATTERN.test(value.id)
    && isWorldPosition(value.position)
    && fixedUnit(value.soundLoudness)
    && typeof soundRangeUnits === "number"
    && Number.isSafeInteger(soundRangeUnits)
    && soundRangeUnits >= 0
    && soundRangeUnits <= HUMAN_HEARING_MAX_RANGE_UNITS
    && typeof value.soundClass === "string"
    && SOUND_CLASS_PATTERN.test(value.soundClass)
    && (value.soundInterrupt === "none" || value.soundInterrupt === "strong");
}

function validActorId(value: unknown): value is string {
  return typeof value === "string" && ACTOR_ID_PATTERN.test(value);
}

function validExpressionEventId(value: unknown): value is string {
  return typeof value === "string" && EXPRESSION_EVENT_ID_PATTERN.test(value);
}

function fixedUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= FIXED_POINT;
}

function signedFixedUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= -FIXED_POINT
    && value <= FIXED_POINT;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
