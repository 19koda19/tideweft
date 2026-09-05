import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  isWorldPosition,
  translateWorldPosition,
  type WorldPosition,
} from "../game/worldPosition";
import {
  ACTOR_PERCEPTION_SCALE,
  MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS,
  createActorObservation,
  type ActorObservation,
  type ObservationInterrupt,
} from "./actorPerception";

/** Version for the pure source/environment-to-contact calculation. */
export const SCENT_PERCEPTION_VERSION = 1 as const;
/** A source profile may choose any smaller species-appropriate base range. */
export const MAX_SCENT_BASE_RANGE_UNITS = 5_000_000 as const;
/** A fully downwind plume can extend no farther than this closed local bound. */
export const MAX_SCENT_EFFECTIVE_RANGE_UNITS = 7_000_000 as const;
export const MAX_SCENT_OBSERVED_AREA_RADIUS_UNITS = 10_000_000 as const;

export interface FixedScentWind {
  /** Signed fixed-point component on ACTOR_PERCEPTION_SCALE. */
  readonly x: number;
  /** Signed fixed-point component on ACTOR_PERCEPTION_SCALE. */
  readonly y: number;
}

/**
 * World truth used transiently to evaluate one scent contact. It deliberately
 * has no source actor/item ID. Only the resulting uncertain classified contact
 * is allowed to enter cognition.
 */
export interface ActorScentObservationInput {
  readonly id: string;
  readonly observerId: string;
  readonly observedAtTick: number;
  readonly perceivedClass: string;
  readonly observerPosition: WorldPosition;
  readonly sourcePosition: WorldPosition;
  /** Maximum still-air reach for this source/sensor pairing, in world units. */
  readonly baseRangeUnits: number;
  /** Fixed-point 0..ACTOR_PERCEPTION_SCALE. */
  readonly sourceStrength: number;
  /** Zero is sealed; ACTOR_PERCEPTION_SCALE is fully exposed. */
  readonly packagingLeakage: number;
  /** Signed fixed-point direction plus magnitude, saturated at one. */
  readonly wind: FixedScentWind;
  /** Fixed-point 0..ACTOR_PERCEPTION_SCALE. */
  readonly rainIntensity: number;
  readonly interrupt?: ObservationInterrupt;
}

const SCALE_BIGINT = BigInt(ACTOR_PERCEPTION_SCALE);
const MAX_EFFECTIVE_RANGE_BIGINT = BigInt(MAX_SCENT_EFFECTIVE_RANGE_UNITS);
const RAIN_SUPPRESSION_AT_MAX = 650_000;
const WIND_RANGE_INFLUENCE = 400_000;
const CONTACT_PROXIMITY_WEIGHT = 700_000;
const CONTACT_FLOOR_WEIGHT = ACTOR_PERCEPTION_SCALE - CONTACT_PROXIMITY_WEIGHT;

/**
 * Evaluates a bounded airborne scent plume and emits only honest actor
 * knowledge. Null means malformed input or no detectable contact. All inputs
 * and outputs are integer fixed-point; no random sampling or float state is
 * involved.
 */
export function createActorScentObservation(
  input: ActorScentObservationInput,
): ActorObservation | null {
  const raw: unknown = input;
  if (!plainRecord(raw) || !allowedInputKeys(raw)) return null;
  const wind = canonicalWind(raw.wind);
  if (
    wind === null
    || typeof raw.id !== "string"
    || typeof raw.observerId !== "string"
    || !nonnegativeSafeInteger(raw.observedAtTick)
    || typeof raw.perceivedClass !== "string"
    || !validInterrupt(raw.interrupt)
    || !isWorldPosition(raw.observerPosition)
    || !isWorldPosition(raw.sourcePosition)
    || !positiveSafeIntegerAtMost(raw.baseRangeUnits, MAX_SCENT_BASE_RANGE_UNITS)
    || !scaledUnit(raw.sourceStrength)
    || !scaledUnit(raw.packagingLeakage)
    || !scaledUnit(raw.rainIntensity)
  ) return null;

  const emission = multiplyScaled(raw.sourceStrength, raw.packagingLeakage);
  if (emission <= 0) return null;

  const displacement = worldDisplacement(raw.observerPosition, raw.sourcePosition);
  if (
    absolute(displacement.x) > MAX_EFFECTIVE_RANGE_BIGINT
    || absolute(displacement.y) > MAX_EFFECTIVE_RANGE_BIGINT
  ) return null;
  const deltaX = Number(displacement.x);
  const deltaY = Number(displacement.y);
  const distanceUnits = integerHypot(deltaX, deltaY);

  const windMagnitude = integerHypot(wind.x, wind.y);
  const windSpeed = Math.min(ACTOR_PERCEPTION_SCALE, windMagnitude);
  const downwindAlignment = directionalAlignment(
    deltaX,
    deltaY,
    distanceUnits,
    wind,
    windMagnitude,
  );
  const carriedAlignment = multiplyScaledSigned(downwindAlignment, windSpeed);
  const windTransport = ACTOR_PERCEPTION_SCALE
    + multiplyScaledSigned(carriedAlignment, WIND_RANGE_INFLUENCE);
  const rainTransmission = ACTOR_PERCEPTION_SCALE
    - multiplyScaled(raw.rainIntensity, RAIN_SUPPRESSION_AT_MAX);
  const weatherAvailable = multiplyScaled(emission, rainTransmission);
  const transportedStrength = multiplyScaled(weatherAvailable, windTransport);
  if (transportedStrength <= 0) return null;

  const effectiveRangeUnits = Math.min(
    MAX_SCENT_EFFECTIVE_RANGE_UNITS,
    multiplyScaled(raw.baseRangeUnits, transportedStrength),
  );
  if (effectiveRangeUnits <= 0 || distanceUnits > effectiveRangeUnits) return null;

  const proximity = ACTOR_PERCEPTION_SCALE - scaledRatio(distanceUnits, effectiveRangeUnits);
  const confidence = multiplyScaled(
    clampScaled(transportedStrength),
    CONTACT_FLOOR_WEIGHT + multiplyScaled(proximity, CONTACT_PROXIMITY_WEIGHT),
  );
  if (confidence <= 0) return null;
  const salience = Math.floor((confidence * 3 + clampScaled(transportedStrength)) / 4);
  const area = perceivedSourceArea(
    raw.observerPosition,
    raw.sourcePosition,
    displacement,
    confidence,
    raw.baseRangeUnits,
    raw.rainIntensity,
    wind,
    windMagnitude,
    windSpeed,
  );

  return createActorObservation({
    id: raw.id,
    observerId: raw.observerId,
    observedAtTick: raw.observedAtTick,
    channel: "scent",
    perceivedClass: raw.perceivedClass,
    subjectId: null,
    area,
    confidence,
    salience,
    identification: "classified",
    interrupt: raw.interrupt ?? "none",
  });
}

function perceivedSourceArea(
  observer: WorldPosition,
  source: WorldPosition,
  displacement: Readonly<{ x: bigint; y: bigint }>,
  confidence: number,
  baseRangeUnits: number,
  rainIntensity: number,
  wind: FixedScentWind,
  windMagnitude: number,
  windSpeed: number,
): Readonly<{ center: WorldPosition; radiusUnits: number }> {
  // The believed center is only halfway up the perceived plume. Even though
  // the evaluator transiently knows world truth, the observation never hands
  // cognition the physical source point.
  const center = translateWorldPosition(
    observer,
    Number(displacement.x / 2n),
    Number(displacement.y / 2n),
  );
  const sourceRemainder = worldDisplacement(center, source);
  const sourceContainmentRadius = integerHypotCeil(
    Number(sourceRemainder.x),
    Number(sourceRemainder.y),
  );
  const confidenceError = Math.ceil(
    multiplyScaled(baseRangeUnits, ACTOR_PERCEPTION_SCALE - confidence) / 4,
  );
  const rainError = Math.ceil(multiplyScaled(baseRangeUnits, rainIntensity) / 5);
  const crosswind = crosswindMagnitude(
    Number(displacement.x),
    Number(displacement.y),
    integerHypot(Number(displacement.x), Number(displacement.y)),
    wind,
    windMagnitude,
  );
  const carriedCrosswind = multiplyScaled(crosswind, windSpeed);
  const crosswindError = Math.ceil(multiplyScaled(baseRangeUnits, carriedCrosswind) / 6);
  const radiusUnits = Math.min(
    MAX_SCENT_OBSERVED_AREA_RADIUS_UNITS,
    Math.max(
      MIN_CLASSIFIED_SCENT_UNCERTAINTY_UNITS,
      sourceContainmentRadius,
      confidenceError,
      rainError,
      crosswindError,
    ),
  );
  return Object.freeze({ center, radiusUnits });
}

function directionalAlignment(
  deltaX: number,
  deltaY: number,
  distance: number,
  wind: FixedScentWind,
  windMagnitude: number,
): number {
  if (distance === 0 || windMagnitude === 0) return 0;
  // Wind flowing from source toward observer is downwind and positive.
  const numerator = -(
    BigInt(wind.x) * BigInt(deltaX)
    + BigInt(wind.y) * BigInt(deltaY)
  ) * SCALE_BIGINT;
  const denominator = BigInt(windMagnitude) * BigInt(distance);
  return clampSignedScaled(Number(numerator / denominator));
}

function crosswindMagnitude(
  deltaX: number,
  deltaY: number,
  distance: number,
  wind: FixedScentWind,
  windMagnitude: number,
): number {
  if (distance === 0 || windMagnitude === 0) return 0;
  const numerator = absolute(
    BigInt(deltaX) * BigInt(wind.y) - BigInt(deltaY) * BigInt(wind.x),
  ) * SCALE_BIGINT;
  const denominator = BigInt(distance) * BigInt(windMagnitude);
  return clampScaled(Number(numerator / denominator));
}

function worldDisplacement(
  from: WorldPosition,
  to: WorldPosition,
): Readonly<{ x: bigint; y: bigint }> {
  return Object.freeze({
    x: (BigInt(to.region.x) - BigInt(from.region.x)) * BigInt(REGION_WIDTH_UNITS)
      + BigInt(to.localX) - BigInt(from.localX),
    y: (BigInt(to.region.y) - BigInt(from.region.y)) * BigInt(REGION_HEIGHT_UNITS)
      + BigInt(to.localY) - BigInt(from.localY),
  });
}

function integerHypot(x: number, y: number): number {
  return Number(integerSquareRoot(BigInt(x) * BigInt(x) + BigInt(y) * BigInt(y)));
}

function integerHypotCeil(x: number, y: number): number {
  const squared = BigInt(x) * BigInt(x) + BigInt(y) * BigInt(y);
  const floor = integerSquareRoot(squared);
  return Number(floor * floor === squared ? floor : floor + 1n);
}

function integerSquareRoot(value: bigint): bigint {
  if (value < 2n) return value;
  let current = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  while (true) {
    const next = (current + value / current) >> 1n;
    if (next >= current) return current;
    current = next;
  }
}

function multiplyScaled(left: number, right: number): number {
  return Number(BigInt(left) * BigInt(right) / SCALE_BIGINT);
}

function multiplyScaledSigned(left: number, right: number): number {
  return Number(BigInt(left) * BigInt(right) / SCALE_BIGINT);
}

function scaledRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return ACTOR_PERCEPTION_SCALE;
  return clampScaled(Number(BigInt(numerator) * SCALE_BIGINT / BigInt(denominator)));
}

function canonicalWind(value: unknown): FixedScentWind | null {
  if (!plainRecord(value) || !exactKeys(value, ["x", "y"])) return null;
  if (!signedScaledUnit(value.x) || !signedScaledUnit(value.y)) return null;
  return Object.freeze({ x: value.x, y: value.y });
}

function allowedInputKeys(value: Readonly<Record<string, unknown>>): boolean {
  const required = [
    "baseRangeUnits",
    "id",
    "observedAtTick",
    "observerId",
    "observerPosition",
    "packagingLeakage",
    "perceivedClass",
    "rainIntensity",
    "sourcePosition",
    "sourceStrength",
    "wind",
  ] as const;
  const keys = Object.keys(value);
  if (keys.length !== required.length && keys.length !== required.length + 1) return false;
  if (!required.every((key) => Object.hasOwn(value, key))) return false;
  return keys.every((key) => required.includes(key as (typeof required)[number]) || key === "interrupt");
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= ACTOR_PERCEPTION_SCALE;
}

function signedScaledUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= -ACTOR_PERCEPTION_SCALE
    && value <= ACTOR_PERCEPTION_SCALE;
}

function validInterrupt(value: unknown): value is ObservationInterrupt | undefined {
  return value === undefined || value === "none" || value === "strong";
}

function positiveSafeIntegerAtMost(value: unknown, maximum: number): value is number {
  return nonnegativeSafeInteger(value) && value > 0 && value <= maximum;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= 0;
}

function clampScaled(value: number): number {
  return Math.max(0, Math.min(ACTOR_PERCEPTION_SCALE, value));
}

function clampSignedScaled(value: number): number {
  return Math.max(-ACTOR_PERCEPTION_SCALE, Math.min(ACTOR_PERCEPTION_SCALE, value));
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
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
