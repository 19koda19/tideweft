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
} from "./perception";
import { buildWorldPerceptionCells } from "./outdoorIllumination";
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
const EMPTY_BATCHES: readonly HumanObservationBatch[] = Object.freeze([]);
const EMPTY_SUPPLEMENTAL_SOUND_SAMPLES: readonly SupplementalSoundSample[] = Object.freeze([]);
const EMPTY_PHYSICAL_SOUND_SAMPLES: readonly PhysicalSoundSample[] = Object.freeze([]);

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
 * One bounded, source-authenticated hearing-only actor vocalization. Source
 * position informs propagation only and never grants observers identity.
 */
export interface SupplementalSoundSample extends AcousticSample {
  readonly sourceActorId: string;
  /** Exact situated-expression event that emitted this one pending sound fact. */
  readonly expressionEventId: string;
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
  /** Bounded physical-world sounds bound to committed acoustic events. */
  readonly physicalSoundSamples?: readonly PhysicalSoundSample[];
}

export interface HumanObservationBatch {
  readonly residentId: number;
  readonly observerId: string;
  readonly priorState: ActorPerceptionState;
  readonly observations: readonly ActorObservation[];
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
): readonly HumanObservationBatch[] {
  const value: unknown = input;
  if (!plainRecord(value)) return EMPTY_BATCHES;
  const hasSupplementalSounds = Object.hasOwn(value, "supplementalSoundSamples");
  const hasPhysicalSounds = Object.hasOwn(value, "physicalSoundSamples");
  const expectedKeys = ["playerSamples", "targetTick", "window", "world"];
  if (hasSupplementalSounds) expectedKeys.push("supplementalSoundSamples");
  if (hasPhysicalSounds) expectedKeys.push("physicalSoundSamples");
  if (!exactKeys(value, expectedKeys)) return EMPTY_BATCHES;
  const { world, window, targetTick } = input;
  if (
    (hasSupplementalSounds && !Array.isArray(input.supplementalSoundSamples))
    || (hasPhysicalSounds && !Array.isArray(input.physicalSoundSamples))
  ) return EMPTY_BATCHES;
  const rawSupplementalSounds = input.supplementalSoundSamples
    ?? EMPTY_SUPPLEMENTAL_SOUND_SAMPLES;
  const rawPhysicalSounds = input.physicalSoundSamples
    ?? EMPTY_PHYSICAL_SOUND_SAMPLES;
  if (
    regionalWindowForWorld(world) !== window
    || !Number.isSafeInteger(targetTick)
    || targetTick < 0
    || !Array.isArray(input.playerSamples)
    || input.playerSamples.length > HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES
    || !Array.isArray(rawSupplementalSounds)
    || rawSupplementalSounds.length > HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES
    || !Array.isArray(rawPhysicalSounds)
    || rawPhysicalSounds.length > HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES
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
  const physicalSounds = canonicalPhysicalSoundSamples(rawPhysicalSounds);
  if (
    supplementalSounds === null
    || physicalSounds === null
    || !disjointSampleIds(samples, supplementalSounds, physicalSounds)
  ) return EMPTY_BATCHES;
  const cells = buildWorldPerceptionCells(world);
  if (cells === null) return EMPTY_BATCHES;

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
    const appendHearingObservation = (
      sample: AcousticSample,
      targetPoint: SpatialFramePoint,
    ): boolean => {
      if (sample.soundLoudness <= 0 || sample.soundRangeUnits <= 0) return true;
      const heard = evaluateAudibleContact({
        listener: projectedResident.position,
        source: targetPoint,
        baseRange: sample.soundRangeUnits,
        ambientNoise,
        sourceLoudness: sample.soundLoudness / FIXED_POINT,
        wind: {
          x: world.weather.windX / FIXED_POINT,
          y: world.weather.windY / FIXED_POINT,
        },
      });
      if (heard === null) return true;
      const area = inferAnonymousHearingArea(placement.position, sample.position, heard);
      if (area === null) return false;
      const observation = createActorObservation({
        id: observationId("h", targetTick, resident.id, sample.id),
        observerId: priorState.actorId,
        observedAtTick: targetTick,
        channel: "hearing",
        perceivedClass: sample.soundClass,
        subjectId: null,
        area,
        confidence: scaleContact(heard.certainty),
        salience: hearingSalience(heard.certainty, sample.soundLoudness),
        identification: "anonymous",
        interrupt: sample.soundInterrupt,
      });
      if (observation === null) return false;
      observations.push(observation);
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
      if (!appendHearingObservation(sample, targetPoint)) return EMPTY_BATCHES;
    }
    for (const sample of supplementalSounds) {
      if (sample.sourceActorId === priorState.actorId) continue;
      const targetPoint = projectedSamplePoint(frame, world, sample.position);
      if (targetPoint === null) continue;
      if (!appendHearingObservation(sample, targetPoint)) return EMPTY_BATCHES;
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
      });
      if (reception === null) return EMPTY_BATCHES;
      if (reception.kind === "heard") observations.push(reception.observation);
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
  return Object.freeze(batches);
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

function disjointSampleIds(
  playerSamples: readonly PlayerSenseSample[],
  supplementalSounds: readonly SupplementalSoundSample[],
  physicalSounds: readonly PhysicalSoundSample[],
): boolean {
  const ids = new Set(playerSamples.map(({ id }) => id));
  for (const { id } of supplementalSounds) {
    if (ids.has(id)) return false;
    ids.add(id);
  }
  return physicalSounds.every(({ id }) => !ids.has(id));
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
