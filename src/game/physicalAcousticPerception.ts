import {
  ACTOR_PERCEPTION_SCALE,
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  createActorObservation,
  type ActorObservation,
  type ObservationInterrupt,
  type ObservedArea,
} from "../sim/actorPerception";
import { FIXED_POINT, type TerrainTileView, type WorldView } from "../sim/types";
import {
  calculateAmbientNoise,
  evaluateAudibleContact,
  type AudibleContact,
} from "./perception";
import { deriveWaterFlowProfile } from "./waterFlow";
import {
  prepareTerrainAudibleContactInput,
  type AcousticTerrainSupport,
} from "./terrainAcoustics";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";
import {
  isWorldAcousticSoundClass,
  type WorldAcousticSoundClass,
} from "./worldAcoustics";

export const PHYSICAL_ACOUSTIC_MAX_SAMPLES = 8 as const;
export const PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS =
  64 * WORLD_POSITION_UNITS_PER_TILE;

const HEARING_AREA_MAX_RADIUS_UNITS = 10_000_000;
const LOCAL_WATER_MASK_RADIUS_TILES = 2;
const SAMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const ACOUSTIC_EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
// Canonical samples are reused across every bounded listener in a frame. Keep
// their validation authority private so hot hearing loops do not repeatedly
// copy, sort, and freeze the same already-authenticated stimulus.
const CANONICAL_PHYSICAL_SOUND_SAMPLES = new WeakSet<object>();

/** A bounded, source-authenticated physical-world sound stimulus. */
export interface PhysicalSoundSample {
  readonly id: string;
  readonly position: WorldPosition;
  /** Fixed-point 0..1 source loudness; zero means no sound. */
  readonly soundLoudness: number;
  readonly soundRangeUnits: number;
  /** Strong unadmitted alarms keep their separate authenticated hearing carrier. */
  readonly soundClass: Exclude<WorldAcousticSoundClass, "animal-alarm">;
  readonly soundInterrupt: ObservationInterrupt;
  readonly sourceId: string;
  /** Committed world-acoustic fact; never exposed as perceived identity. */
  readonly acousticEventId: string;
}

/** The constructor validates a world class before returning the narrower carrier. */
export type PhysicalSoundSampleInput = Omit<PhysicalSoundSample, "soundClass"> & {
  readonly soundClass: WorldAcousticSoundClass;
};

export interface PhysicalAcousticListenerInput {
  readonly observationId: string;
  readonly observerId: string;
  readonly observerPosition: WorldPosition;
  readonly observedAtTick: number;
  readonly sample: PhysicalSoundSample;
  /** Listener-adjusted range, already bounded by the physical event range. */
  readonly effectiveRangeUnits: number;
  /** Normalized listener-local masking from rain and nearby turbulent water. */
  readonly ambientNoise: number;
  readonly wind: Readonly<{ readonly x: number; readonly y: number }>;
}

export type PhysicalAcousticListenerResult =
  | Readonly<{ readonly kind: "not-heard" }>
  | Readonly<{
      readonly kind: "heard";
      readonly contact: AudibleContact;
      readonly observation: ActorObservation;
    }>;

const NOT_HEARD: PhysicalAcousticListenerResult = Object.freeze({ kind: "not-heard" });

/** Creates one validated immutable physical-world hearing stimulus, or null. */
export function createPhysicalSoundSample(
  input: PhysicalSoundSampleInput,
): PhysicalSoundSample | null {
  const value: unknown = input;
  if (
    value !== null
    && typeof value === "object"
    && CANONICAL_PHYSICAL_SOUND_SAMPLES.has(value)
  ) return value as PhysicalSoundSample;
  if (!plainRecord(value) || !exactKeys(value, [
    "acousticEventId",
    "id",
    "position",
    "soundClass",
    "soundInterrupt",
    "soundLoudness",
    "soundRangeUnits",
    "sourceId",
  ])
    || typeof value.id !== "string"
    || !SAMPLE_ID_PATTERN.test(value.id)
    || !isWorldPosition(value.position)
    || !fixedUnit(value.soundLoudness)
    || !nonnegativeSafeInteger(value.soundRangeUnits)
    || value.soundRangeUnits > PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS
    || !isWorldAcousticSoundClass(value.soundClass)
    || value.soundClass === "animal-alarm"
    || (value.soundInterrupt !== "none" && value.soundInterrupt !== "strong")
    || !validSourceId(value.sourceId)
    || !validAcousticEventId(value.acousticEventId)
  ) return null;
  const sample = Object.freeze({
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
    sourceId: value.sourceId,
  });
  CANONICAL_PHYSICAL_SOUND_SAMPLES.add(sample);
  return sample;
}

/**
 * Converts one authenticated physical sound into honest anonymous hearing.
 * The physical event remains world truth; this result contains only what this
 * listener could hear and never reveals source identity or exact position.
 */
export function evaluatePhysicalAcousticListener(
  input: PhysicalAcousticListenerInput,
  terrain?: Readonly<{
    readonly world: WorldView;
    readonly sourceSupport: AcousticTerrainSupport;
    readonly listenerSupport: AcousticTerrainSupport;
  }>,
): PhysicalAcousticListenerResult | null {
  const value: unknown = input;
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "ambientNoise",
      "effectiveRangeUnits",
      "observationId",
      "observedAtTick",
      "observerId",
      "observerPosition",
      "sample",
      "wind",
    ])
    || typeof value.observationId !== "string"
    || !validActorId(value.observerId)
    || !isWorldPosition(value.observerPosition)
    || !nonnegativeSafeInteger(value.observedAtTick)
    || !nonnegativeSafeInteger(value.effectiveRangeUnits)
    || value.effectiveRangeUnits > PHYSICAL_ACOUSTIC_MAX_RANGE_UNITS
    || !unitInterval(value.ambientNoise)
    || !validWind(value.wind)
  ) return null;
  const sample = createPhysicalSoundSample(value.sample as PhysicalSoundSample);
  if (sample === null || value.effectiveRangeUnits > sample.soundRangeUnits) return null;
  if (
    sample.sourceId === value.observerId
    || sample.soundLoudness <= 0
    || value.effectiveRangeUnits <= 0
  ) return NOT_HEARD;

  let delta: ReturnType<typeof worldPositionDelta>;
  try {
    delta = worldPositionDelta(value.observerPosition, sample.position);
  } catch {
    return null;
  }
  const acousticInput = {
    listener: { x: 0, y: 0 },
    source: { x: delta.x, y: delta.y },
    baseRange: value.effectiveRangeUnits,
    ambientNoise: value.ambientNoise,
    sourceLoudness: sample.soundLoudness / FIXED_POINT,
    wind: value.wind,
  };
  const prepared = terrain === undefined ? acousticInput
    : prepareTerrainAudibleContactInput(acousticInput, {
        ...terrain,
        listenerPosition: value.observerPosition,
        sourcePosition: sample.position,
      });
  if (prepared === null) return null;
  const contact = evaluateAudibleContact(prepared);
  if (contact === null) return NOT_HEARD;
  const area = inferAnonymousHearingArea(value.observerPosition, sample.position, contact);
  if (area === null) return null;
  const observation = createActorObservation({
    id: value.observationId,
    observerId: value.observerId,
    observedAtTick: value.observedAtTick,
    channel: "hearing",
    perceivedClass: sample.soundClass,
    subjectId: null,
    area,
    confidence: scaleContact(contact.certainty),
    salience: hearingSalience(contact.certainty, sample.soundLoudness),
    identification: "anonymous",
    interrupt: sample.soundInterrupt,
  });
  return observation === null
    ? null
    : Object.freeze({ kind: "heard", contact, observation });
}

/**
 * Shared listener-local rain/current masking used by every acoustic consumer.
 * Day phase alone is not a magic "quiet night" modifier: a future nocturnal
 * soundscape must contribute real environment/ecology-owned acoustic sources.
 */
export function ambientNoiseAt(world: WorldView, listenerTileIndex: number): number | null {
  const listener = world.terrain.tiles[listenerTileIndex];
  if (!validTerrainTile(listener, listenerTileIndex, world.terrain.width)) return null;
  let waterTurbulence = 0;
  for (
    let offsetY = -LOCAL_WATER_MASK_RADIUS_TILES;
    offsetY <= LOCAL_WATER_MASK_RADIUS_TILES;
    offsetY += 1
  ) {
    for (
      let offsetX = -LOCAL_WATER_MASK_RADIUS_TILES;
      offsetX <= LOCAL_WATER_MASK_RADIUS_TILES;
      offsetX += 1
    ) {
      const x = listener.x + offsetX;
      const y = listener.y + offsetY;
      if (x < 0 || y < 0 || x >= world.terrain.width || y >= world.terrain.height) continue;
      const index = y * world.terrain.width + x;
      const tile = world.terrain.tiles[index];
      if (!validTerrainTile(tile, index, world.terrain.width)) return null;
      const profile = deriveWaterFlowProfile({
        waterDepth: tile.waterDepth,
        bedRoughness: tile.roughness,
        tideLevel: world.tide.level,
        weatherIntensity: world.weather.intensity,
      });
      const distance = Math.hypot(offsetX, offsetY);
      const attenuation = 1 / (1 + distance * 0.8);
      waterTurbulence = Math.max(
        waterTurbulence,
        profile.turbulence / FIXED_POINT * attenuation,
      );
    }
  }
  const raining = world.weather.kind === "rain" || world.weather.kind === "storm";
  return calculateAmbientNoise({
    rainIntensity: raining ? world.weather.intensity / FIXED_POINT : 0,
    localWaterTurbulence: Math.max(0, Math.min(1, waterTurbulence)),
  });
}

/** Derives an uncertain heard area without turning sound into exact-position radar. */
export function inferAnonymousHearingArea(
  listener: WorldPosition,
  source: WorldPosition,
  heard: AudibleContact,
): ObservedArea | null {
  const minimum = Math.max(0, Math.round(heard.distanceBand.minimum));
  const maximum = Math.max(minimum, Math.round(heard.distanceBand.maximum));
  const estimatedDistance = Math.round((minimum * 2 + maximum) / 3);
  const deltaX = Math.round(Math.cos(heard.bearing.centerRadians) * estimatedDistance);
  const deltaY = Math.round(Math.sin(heard.bearing.centerRadians) * estimatedDistance);
  let center = translatedOrNull(listener, deltaX, deltaY);
  if (center === null) return null;
  const radialUncertainty = Math.ceil((maximum - minimum) / 2);
  const angularUncertainty = Math.ceil(
    maximum * Math.sin(Math.min(Math.PI / 2, heard.bearing.uncertaintyRadians)),
  );
  const radiusUnits = Math.min(
    HEARING_AREA_MAX_RADIUS_UNITS,
    Math.max(
      MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
      radialUncertainty + angularUncertainty,
    ),
  );
  if (sameWorldPosition(center, source)) {
    const offsetX = Math.round(Math.cos(heard.bearing.centerRadians + Math.PI / 2)
      * MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS);
    const offsetY = Math.round(Math.sin(heard.bearing.centerRadians + Math.PI / 2)
      * MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS);
    center = translatedOrNull(center, offsetX, offsetY)
      ?? translatedOrNull(center, -offsetX, -offsetY);
    if (center === null || sameWorldPosition(center, source)) return null;
  }
  return Object.freeze({ center, radiusUnits });
}

function translatedOrNull(
  position: WorldPosition,
  deltaX: number,
  deltaY: number,
): WorldPosition | null {
  try {
    return translateWorldPosition(position, deltaX, deltaY);
  } catch {
    return null;
  }
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

function validTerrainTile(
  tile: TerrainTileView | undefined,
  expectedIndex: number,
  width: number,
): tile is TerrainTileView {
  return tile !== undefined
    && tile.index === expectedIndex
    && tile.x === expectedIndex % width
    && tile.y === Math.floor(expectedIndex / width)
    && fixedUnit(tile.elevation)
    && fixedUnit(tile.roughness)
    && fixedUnit(tile.waterDepth);
}

function validWind(value: unknown): value is Readonly<{ readonly x: number; readonly y: number }> {
  return plainRecord(value)
    && exactKeys(value, ["x", "y"])
    && signedUnitInterval(value.x)
    && signedUnitInterval(value.y);
}

function fixedUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= FIXED_POINT
    && !Object.is(value, -0);
}

function unitInterval(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 1
    && !Object.is(value, -0);
}

function signedUnitInterval(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Math.abs(value) <= 1
    && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && !Object.is(value, -0);
}

function validActorId(value: unknown): value is string {
  return validSourceId(value);
}

function validSourceId(value: unknown): value is string {
  return typeof value === "string" && SOURCE_ID_PATTERN.test(value);
}

function validAcousticEventId(value: unknown): value is string {
  return typeof value === "string" && ACOUSTIC_EVENT_ID_PATTERN.test(value);
}

function sameWorldPosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
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
