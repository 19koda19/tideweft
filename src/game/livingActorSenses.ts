import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorObservations,
  type ActorObservation,
  type ObservationInterrupt,
} from "../sim/actorPerception";
import {
  MAX_SCENT_BASE_RANGE_UNITS,
  createActorScentObservation,
  type FixedScentWind,
} from "../sim/scentPerception";
import { hashCanonical } from "../sim/util";
import {
  isLivingActorAddress,
  type LivingActorAddress,
} from "./livingActor";
import {
  LIVING_SPECIES_REGISTRY,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";
import { isWorldPosition, type WorldPosition } from "./worldPosition";

export const LIVING_ACTOR_SENSES_VERSION = 1 as const;
export const MAX_SCENT_STIMULI_PER_ACTOR_STEP = 128 as const;

export interface LivingActorSenseProfile {
  readonly version: typeof LIVING_ACTOR_SENSES_VERSION;
  readonly species: LivingActorSpecies;
  /** Relative capability only; line-of-sight still governs actual vision. */
  readonly visionAcuity: number;
  /** Relative capability only; sound propagation still governs hearing. */
  readonly hearingSensitivity: number;
  /** Relative source strength perceived through smell. */
  readonly scentSensitivity: number;
  /** Hard local ceiling before source/weather modifiers. */
  readonly scentBaseRangeUnits: number;
}

export interface LivingActorScentStimulus {
  /** World-truth event/source key. It is hashed and never enters cognition. */
  readonly stimulusId: string;
  readonly perceivedClass: string;
  readonly position: WorldPosition;
  readonly sourceStrength: number;
  readonly packagingLeakage: number;
  readonly interrupt?: ObservationInterrupt;
}

export interface LivingActorScentFrameInput {
  readonly observer: LivingActorAddress;
  readonly tick: number;
  readonly wind: FixedScentWind;
  readonly rainIntensity: number;
  readonly stimuli: readonly LivingActorScentStimulus[];
}

const PROFILE_BY_SPECIES = new Map<LivingActorSpecies, LivingActorSenseProfile>();
for (const entry of LIVING_SPECIES_REGISTRY) {
  PROFILE_BY_SPECIES.set(entry.species, Object.freeze({
    version: LIVING_ACTOR_SENSES_VERSION,
    species: entry.species,
    ...entry.senses,
  }));
}

export function livingActorSenseProfile(
  species: LivingActorSpecies,
): LivingActorSenseProfile {
  const profile = PROFILE_BY_SPECIES.get(species);
  if (profile === undefined) {
    throw new RangeError(`Unsupported sensory species ${String(species)}`);
  }
  return profile;
}

/**
 * Convert bounded world-truth scent stimuli into honest cognition. This is one
 * common evaluator for every species; capability comes from data, not a
 * dogDetectFood-style branch.
 */
export function collectLivingActorScentObservations(
  input: LivingActorScentFrameInput,
): readonly ActorObservation[] | null {
  if (
    !plainRecord(input)
    || !isLivingActorAddress(input.observer)
    || !nonnegativeSafeInteger(input.tick)
    || !validWind(input.wind)
    || !scaledUnit(input.rainIntensity)
    || !Array.isArray(input.stimuli)
    || input.stimuli.length > MAX_SCENT_STIMULI_PER_ACTOR_STEP
  ) return null;
  const profile = livingActorSenseProfile(input.observer.species);
  const seenStimuli = new Set<string>();
  const canonicalStimuli: LivingActorScentStimulus[] = [];
  for (const raw of input.stimuli as readonly unknown[]) {
    const stimulus = canonicalStimulus(raw);
    if (stimulus === null || seenStimuli.has(stimulus.stimulusId)) return null;
    seenStimuli.add(stimulus.stimulusId);
    canonicalStimuli.push(stimulus);
  }
  canonicalStimuli.sort((left, right) => left.stimulusId < right.stimulusId ? -1 : 1);

  const observations: ActorObservation[] = [];
  for (const stimulus of canonicalStimuli) {
    const sensedStrength = multiplyUnit(stimulus.sourceStrength, profile.scentSensitivity);
    const observation = createActorScentObservation({
      id: `scent:${hashCanonical({
        observerId: input.observer.actorId,
        stimulusId: stimulus.stimulusId,
        tick: input.tick,
      })}`,
      observerId: input.observer.actorId,
      observedAtTick: input.tick,
      perceivedClass: stimulus.perceivedClass,
      observerPosition: input.observer.position,
      sourcePosition: stimulus.position,
      baseRangeUnits: Math.min(profile.scentBaseRangeUnits, MAX_SCENT_BASE_RANGE_UNITS),
      sourceStrength: sensedStrength,
      packagingLeakage: stimulus.packagingLeakage,
      wind: input.wind,
      rainIntensity: input.rainIntensity,
      interrupt: stimulus.interrupt ?? "none",
    });
    if (observation !== null) observations.push(observation);
  }
  return canonicalizeActorObservations(observations);
}

function canonicalStimulus(value: unknown): LivingActorScentStimulus | null {
  if (!plainRecord(value)) return null;
  const keys = Object.keys(value).sort();
  const expected = value.interrupt === undefined
    ? ["packagingLeakage", "perceivedClass", "position", "sourceStrength", "stimulusId"]
    : ["interrupt", "packagingLeakage", "perceivedClass", "position", "sourceStrength", "stimulusId"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
  if (
    typeof value.stimulusId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u.test(value.stimulusId)
    || typeof value.perceivedClass !== "string"
    || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.perceivedClass)
    || !isWorldPosition(value.position)
    || !scaledUnit(value.sourceStrength)
    || !scaledUnit(value.packagingLeakage)
    || (value.interrupt !== undefined && value.interrupt !== "none" && value.interrupt !== "strong")
  ) return null;
  return Object.freeze({
    stimulusId: value.stimulusId,
    perceivedClass: value.perceivedClass,
    position: value.position,
    sourceStrength: value.sourceStrength,
    packagingLeakage: value.packagingLeakage,
    ...(value.interrupt === undefined ? {} : { interrupt: value.interrupt }),
  });
}

function validWind(value: unknown): value is FixedScentWind {
  return plainRecord(value)
    && Object.keys(value).sort().join(",") === "x,y"
    && signedUnit(value.x)
    && signedUnit(value.y);
}

function multiplyUnit(left: number, right: number): number {
  return Number(BigInt(left) * BigInt(right) / BigInt(ACTOR_PERCEPTION_SCALE));
}

function scaledUnit(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= ACTOR_PERCEPTION_SCALE
    && !Object.is(value, -0);
}

function signedUnit(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Math.abs(value as number) <= ACTOR_PERCEPTION_SCALE
    && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
