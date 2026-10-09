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
import { queryResidentAttentionState, residentAttentionFocus } from "../sim/residentAttention";
import { FIXED_POINT, type WorldView } from "../sim/types";
import { canonicalizeResidentActivity, RESIDENT_ACTIVITY_MAX_PHASE, residentActivitySupportsEnvironment, residentActivitySupportsTravelEnvironment } from "../sim/residentActivity";
import { residentAcceptedPickupBinding, residentSettlementRestTarget, residentTravelContractBinding } from "../sim/residentActivityWorld";
import { residentFamiliarDeparturePaths } from "../sim/residentKnownRoutes";
import { residentTravelLocation, residentTravelSegment, residentTravelSegmentOffset } from "../sim/residentTravelRoute";
import { residentRestSurfaceObservationId } from "../sim/residentSurfaceKnowledge";
import {
  evaluateAudibleContact,
  evaluateVisualContact,
  type AudibleContact,
} from "./perception";
import { buildOutdoorIlluminationField, buildWorldPerceptionCells } from "./outdoorIllumination";
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
  resolveResidentWorldPlacementAtActivityPhase,
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
   * Transient caller-authenticated surface support for supplied vocal/physical
   * sounds, including player vocal reactions. Omitted IDs have unmodeled
   * support; sample identity or vocabulary cannot establish physical height.
   * Player step samples are intrinsically surface actions and must not be
   * repeated here. This metadata is never save carry.
   */
  readonly surfaceSoundSampleIds?: readonly string[];
  /**
   * Transient event-time metadata authenticated by the caller's cause/admission
   * owner, never inferred from sound-list order. A body-bound interval requires
   * one entry for every supplied non-player sound. Player step ordinal n already
   * means accepted phase n+1. This metadata does not authenticate a producer.
   */
  readonly soundSamplePhases?: readonly HumanSoundSamplePhase[];
}

export interface HumanSoundSamplePhase {
  readonly sampleId: string;
  readonly phase: number;
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
  const hasSoundSamplePhases = Object.hasOwn(value, "soundSamplePhases");
  const expectedKeys = ["playerSamples", "targetTick", "window", "world"];
  if (hasSupplementalSounds) expectedKeys.push("supplementalSoundSamples");
  if (hasSupplementalSemanticFacts) expectedKeys.push("supplementalSemanticFacts");
  if (hasPhysicalSounds) expectedKeys.push("physicalSoundSamples");
  if (hasUnadmittedAlarmSounds) expectedKeys.push("unadmittedAlarmSoundSamples");
  if (hasSurfaceSoundSampleIds) expectedKeys.push("surfaceSoundSampleIds");
  if (hasSoundSamplePhases) expectedKeys.push("soundSamplePhases");
  if (!exactKeys(value, expectedKeys)) return EMPTY_BATCHES;
  const { world, window, targetTick } = input;
  if (
    (hasSupplementalSounds && !Array.isArray(input.supplementalSoundSamples))
    || (hasSupplementalSemanticFacts && !Array.isArray(input.supplementalSemanticFacts))
    || (hasPhysicalSounds && !Array.isArray(input.physicalSoundSamples))
    || (hasUnadmittedAlarmSounds && !Array.isArray(input.unadmittedAlarmSoundSamples))
    || (hasSurfaceSoundSampleIds && !Array.isArray(input.surfaceSoundSampleIds))
    || (hasSoundSamplePhases && !Array.isArray(input.soundSamplePhases))
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
  const hasBodyResidents = world.residents.some((resident) => Object.hasOwn(resident, "activity"));
  const soundSamplePhases = validatedSoundSamplePhases(
    input.soundSamplePhases, supplementalSounds, physicalSounds, unadmittedAlarmSounds,
    hasBodyResidents,
  );
  if (soundSamplePhases === null) return EMPTY_BATCHES;
  const requiredPhases = new Set([
    ...samples.map(({ sampleOrdinal }) => sampleOrdinal + 1),
    ...soundSamplePhases.values(),
  ]);
  const cells = buildWorldPerceptionCells(world);
  if (cells === null) return EMPTY_BATCHES;
  const semanticFactByExpressionEventId = new Map(
    supplementalSemanticFacts.map((fact) => [fact.expressionEventId, fact]),
  );

  const positioned: Array<{ resident: WorldView["residents"][number]; placement: ResidentWorldPlacement }> = [];
  for (const resident of world.residents) {
    const placement = resolveResidentWorldPlacement(economy, resident);
    if (Object.hasOwn(resident, "activity")) {
      const activity = canonicalizeResidentActivity(resident.activity, {
        actorId: resident.identity.stableId, tick: economy.completedTick,
      });
      if (activity === null || placement === null
        || [...requiredPhases].some((phase) => phase >= activity.poses.length)) return EMPTY_BATCHES;
      // A listener can leave the window after hearing. Selection must include
      // its retained interval poses, not silently discard the earlier receipt.
      const inWindow = activity.poses.some((_pose, phase) => {
        const retained = resolveResidentWorldPlacementAtActivityPhase(economy, resident, economy.completedTick, phase);
        return retained !== null && residentPlacementInRegionalWindow(retained, window) !== null;
      });
      if (inWindow) positioned.push({ resident, placement });
    } else if (placement !== null && residentPlacementInRegionalWindow(placement, window) !== null) {
      positioned.push({ resident, placement });
    }
  }
  positioned.sort((left, right) => compareText(
    left.resident.identity.stableId,
    right.resident.identity.stableId,
  ) || left.resident.id - right.resident.id);
  const selected = positioned.slice(0, HUMAN_PERCEPTION_MAX_RESIDENTS);
  if (!uniqueResidents(selected)) return EMPTY_BATCHES;
  const hasTaskSurfaceTargets = selected.some(({ resident }) => {
    const task = resident.activity?.restTask;
    const travel = resident.activity?.travelTask;
    return (residentActivitySupportsEnvironment(resident.activity)
      && task?.origin === "selected" && task.phase !== "arrived")
      || (residentActivitySupportsTravelEnvironment(resident.activity)
        && (travel?.mode === "physical" && travel.phase !== "arrived"
          || resident.activity?.pickupTask?.phase === "arrived"));
  });
  const illumination = hasTaskSurfaceTargets ? buildOutdoorIlluminationField(world, cells) : null;
  if (hasTaskSurfaceTargets && illumination === null) return EMPTY_BATCHES;

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
    const listeners = new Map<number, {
      placement: ResidentWorldPlacement;
      projected: NonNullable<ReturnType<typeof residentPlacementInRegionalWindow>>;
      ambientNoise: number;
      facing: number;
    } | null>();
    const bodyBound = Object.hasOwn(resident, "activity");
    // An absent legacy body still has one spatial/noise projection. Do not
    // repeat that unchanged work for every player sample in its interval.
    for (const phase of bodyBound ? requiredPhases : [0]) {
      const retained = bodyBound
        ? resolveResidentWorldPlacementAtActivityPhase(economy, resident, economy.completedTick, phase)
        : placement;
      if (retained === null) return EMPTY_BATCHES;
      const projected = residentPlacementInRegionalWindow(retained, window);
      if (projected === null) { listeners.set(phase, null); continue; }
      const ambientNoise = ambientNoiseAt(world, projected.tileIndex);
      if (ambientNoise === null) return EMPTY_BATCHES;
      listeners.set(phase, {
        placement: retained, projected, ambientNoise,
        facing: lawfulResidentFacing(priorState, retained),
      });
    }
    const listenerAt = (phase: number) => listeners.get(bodyBound ? phase : 0);
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
      listener: NonNullable<ReturnType<typeof listeners.get>>,
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
        listener: listener.projected.position,
        source: targetPoint,
        baseRange: sample.soundRangeUnits,
        ambientNoise: listener.ambientNoise,
        sourceLoudness: sample.soundLoudness / FIXED_POINT,
        wind: {
          x: world.weather.windX / FIXED_POINT,
          y: world.weather.windY / FIXED_POINT,
        },
      }, {
        world,
        listenerPosition: listener.placement.position,
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
      const area = inferAnonymousHearingArea(listener.placement.position, sample.position, heard);
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
      const listener = listenerAt(sample.sampleOrdinal + 1);
      if (listener === null || listener === undefined) continue;
      const targetPoint = projectedSamplePoint(frame, world, sample.position);
      if (targetPoint === null) continue;
      const targetX = Math.floor(targetPoint.x / WORLD_POSITION_UNITS_PER_TILE);
      const targetY = Math.floor(targetPoint.y / WORLD_POSITION_UNITS_PER_TILE);
      const targetTileIndex = targetY * world.terrain.width + targetX;
      const sight = evaluateVisualContact({
        columns: world.terrain.width,
        rows: world.terrain.height,
        cells,
        observerTileIndex: listener.projected.tileIndex,
        targetTileIndex,
        observerFacingRadians: listener.facing,
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
      if (!appendHearingObservation(sample, targetPoint, listener, null, null, "surface")) {
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
      const listener = listenerAt(soundSamplePhases.get(sample.id) ?? 0);
      if (targetPoint === null || listener === null || listener === undefined) {
        if (import.meta.env.DEV) recordListening(sample, semanticFact, "unavailable");
        continue;
      }
      if (!appendHearingObservation(
        sample,
        targetPoint,
        listener,
        semanticFact,
        sample,
      )) return EMPTY_BATCHES;
    }
    for (const sample of physicalSounds) {
      const listener = listenerAt(soundSamplePhases.get(sample.id) ?? 0);
      if (listener === null || listener === undefined) continue;
      const targetPoint = projectedSamplePoint(frame, world, sample.position);
      if (targetPoint === null) continue;
      const reception = evaluatePhysicalAcousticListener({
        observationId: observationId("h", targetTick, resident.id, sample.id),
        observerId: priorState.actorId,
        observerPosition: listener.placement.position,
        observedAtTick: targetTick,
        sample,
        effectiveRangeUnits: sample.soundRangeUnits,
        ambientNoise: listener.ambientNoise,
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
      const listener = listenerAt(soundSamplePhases.get(sample.id) ?? 0);
      if (listener === null || listener === undefined) continue;
      const targetPoint = projectedSamplePoint(frame, world, sample.position);
      if (targetPoint === null) continue;
      if (!appendHearingObservation(sample, targetPoint, listener)) return EMPTY_BATCHES;
    }
    if (latestIdentifiedVisual !== null) {
      observations.push(latestIdentifiedVisual.observation);
    }
    const restTask = resident.activity?.restTask;
    const travelTask = resident.activity?.travelTask;
    const pickupTask = resident.activity?.pickupTask;
    let target: WorldPosition | null = null;
    let departureTargets: readonly WorldPosition[] | null = null;
    // One rest/travel sight, or <=4 distinct origin entrance sights, uses
    // remaining bounded capacity. Never
    // displace lawful hearing or reject a full frame to append a ground fact;
    // unavailable information conservatively retains an existing held task.
    if (residentActivitySupportsEnvironment(resident.activity)
      && restTask?.origin === "selected" && restTask.phase !== "arrived") {
      target = residentSettlementRestTarget(economy, resident);
      if (target === null || target.region.x !== restTask.target.region.x
        || target.region.y !== restTask.target.region.y || target.localX !== restTask.target.localX
        || target.localY !== restTask.target.localY) return EMPTY_BATCHES;
    } else if (residentActivitySupportsTravelEnvironment(resident.activity)
      && travelTask?.mode === "physical" && travelTask.phase !== "arrived") {
      const contract = residentTravelContractBinding(economy, resident);
      const segment = contract === null ? null : residentTravelSegment(economy, contract, travelTask);
      const location = segment === null ? null : residentTravelLocation(segment, travelTask, placement.position);
      if (contract === null || contract.id !== travelTask.contractId || segment === null
        || location?.kind !== "route" || resident.location.kind !== "route"
        || resident.location.routeId !== location.routeId || resident.location.progress !== location.progress) return EMPTY_BATCHES;
      target = segment.end;
    } else if (residentActivitySupportsTravelEnvironment(resident.activity)
      && pickupTask?.phase === "arrived") {
      const binding = residentAcceptedPickupBinding(economy, resident);
      if (binding === null || binding.contract.id !== pickupTask.contractId
        || binding.contract.originSettlementId !== pickupTask.settlementId
        || pickupTask.selectedAtTick < binding.contract.acceptedTick!
        || binding.target.region.x !== pickupTask.target.region.x
        || binding.target.region.y !== pickupTask.target.region.y
        || binding.target.localX !== pickupTask.target.localX
        || binding.target.localY !== pickupTask.target.localY
        || binding.target.region.x !== placement.position.region.x
        || binding.target.region.y !== placement.position.region.y
        || binding.target.localX !== placement.position.localX
        || binding.target.localY !== placement.position.localY) return EMPTY_BATCHES;
      const selected = residentTravelSegment(economy, binding.contract, {
        contractId: binding.contract.id, legIndex: 0, waypointIndex: 1,
      });
      const familiar = residentFamiliarDeparturePaths(economy, resident, binding.contract, targetTick);
      // No familiarity, no alternative inspection. Whole itineraries and
      // distinct first cardinal supports only; no arbitrary remote targets.
      if (selected !== null && familiar.length > 0) {
        if (residentTravelSegmentOffset(selected, placement.position) !== 0) return EMPTY_BATCHES;
        const unique = new Map<string, WorldPosition>();
        for (const point of [selected.end, ...familiar.map(({ firstSegment }) => firstSegment.end)]) {
          unique.set(`${point.region.x},${point.region.y}:${point.localX},${point.localY}`, point);
        }
        if (unique.size > 1) departureTargets = [...unique.values()];
      }
    }
    const surfaceTargets = departureTargets ?? (target === null ? [] : [target]);
    for (const target of surfaceTargets) {
      const observer = residentPlacementInRegionalWindow(placement, window);
      const point = projectedSamplePoint(frame, world, target);
      if (observer !== null && point !== null
        && observations.length < HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT) {
        const targetIndex = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE) * world.terrain.width
          + Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
        const tile = world.terrain.tiles[targetIndex];
        const light = illumination?.physicalIllumination[targetIndex];
        if (tile === undefined || light === undefined) return EMPTY_BATCHES;
        const sight = evaluateVisualContact({
          columns: world.terrain.width, rows: world.terrain.height, cells,
          observerTileIndex: observer.tileIndex, targetTileIndex: targetIndex,
          observerFacingRadians: lawfulResidentFacing(priorState, placement),
          weatherVisibility: weatherVisibility(world), targetMovementSalience: 0,
          targetLightVisibility: light / FIXED_POINT,
        });
        if (sight?.identityEligible) {
          const confidence = scaleContact(sight.confidence);
          const observation = createActorObservation({
            id: residentRestSurfaceObservationId(priorState.actorId, target),
            observerId: priorState.actorId, observedAtTick: targetTick, channel: "vision",
            perceivedClass: tile.terrain === "deep-water" || tile.waterDepth > 0
              ? "water-covered-ground" : "dry-ground",
            subjectId: null, identification: "classified", area: { center: target, radiusUnits: 0 },
            confidence, salience: Math.min(confidence, 300_000), interrupt: "information",
          });
          if (observation === null) return EMPTY_BATCHES;
          observations.push(observation);
        }
      }
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

/**
 * Transactional callers must distinguish rejected input from a legitimate
 * empty listener window. Keep the existing collection/receipt owner and its
 * public empty-array compatibility contract; do not infer failure by length.
 */
export function humanObservationCollectionRejected(
  batches: readonly HumanObservationBatch[],
): boolean {
  return batches === EMPTY_BATCHES;
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

function validatedSoundSamplePhases(
  value: readonly HumanSoundSamplePhase[] | undefined,
  supplementalSounds: readonly SupplementalSoundSample[],
  physicalSounds: readonly PhysicalSoundSample[],
  unadmittedAlarmSounds: readonly UnadmittedAlarmSoundSample[],
  bodyBound: boolean,
): ReadonlyMap<string, number> | null {
  const ids = new Set([
    ...supplementalSounds.map(({ id }) => id),
    ...physicalSounds.map(({ id }) => id),
    ...unadmittedAlarmSounds.map(({ id }) => id),
  ]);
  if (value === undefined) {
    // Legacy bodies have one placement, not a reconstructed phase history.
    // New body-bound hearing may never guess event time from list order.
    return bodyBound && ids.size > 0 ? null : new Map([...ids].map((id) => [id, 0]));
  }
  if (!Array.isArray(value) || value.length !== ids.size
    || Object.getPrototypeOf(value) !== Array.prototype
    || Reflect.ownKeys(value).length !== value.length + 1) return null;
  const phases = new Map<string, number>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = Object.getOwnPropertyDescriptor(value, index);
    if (entry?.enumerable !== true || !Object.hasOwn(entry, "value")) return null;
    const record = entry.value;
    if (!plainRecord(record) || Reflect.ownKeys(record).length !== 2
      || !exactKeys(record, ["phase", "sampleId"])
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(record, "phase") ?? {}, "value")
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(record, "sampleId") ?? {}, "value")
      || typeof record.sampleId !== "string" || !ids.has(record.sampleId)
      || phases.has(record.sampleId) || !Number.isSafeInteger(record.phase)
      || (record.phase as number) < 0 || (record.phase as number) > RESIDENT_ACTIVITY_MAX_PHASE
      || Object.is(record.phase, -0)) return null;
    phases.set(record.sampleId, record.phase as number);
  }
  return phases;
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
    // A bounded saved probe remains lawful sensory direction. It does not
    // imply watch duty, task cancellation or an omniscient live target.
    return facingTowardSavedPoint(placement, search.nextProbe);
  }
  const appraisal = queryResidentAttentionState(priorState);
  if (appraisal === "unaware" || appraisal === "none") return placement.facing;
  const attention = residentAttentionFocus(priorState);
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
