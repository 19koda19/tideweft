import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorObservations,
  type ActorObservation,
} from "../sim/actorPerception";
import { FIXED_POINT, type WorldView } from "../sim/types";
import { hashCanonical } from "../sim/util";
import type { CoreEcologyObservationBatch } from "./coreEcologyPerception";
import {
  canonicalizeDogActorState,
  type DogActorState,
} from "./dogActor";
import { livingActorAddressInRegionalWindow } from "./livingActor";
import { livingActorSenseProfile } from "./livingActorSenses";
import {
  PHYSICAL_ACOUSTIC_MAX_SAMPLES,
  ambientNoiseAt,
  createPhysicalSoundSample,
  evaluatePhysicalAcousticListener,
  type PhysicalSoundSample,
} from "./physicalAcousticPerception";
import type { RegionalTerrainWindow } from "./regionalTravel";
import { regionalWindowForWorld } from "./regionalWorldView";

export const DOG_PHYSICAL_ACOUSTIC_MAX_LISTENERS = 64 as const;
const EMPTY_BATCHES: readonly CoreEcologyObservationBatch[] = Object.freeze([]);

/**
 * Offers authenticated physical contact to each eligible in-window dog through
 * the same anonymous acoustic law used by humans. The ordinary `physical-*`
 * facts enter cognition only; this bridge never relabels them as alarm, threat,
 * or assigned investigation.
 */
export function collectDogPhysicalAcousticObservationBatches(input: Readonly<{
  readonly dogs: readonly DogActorState[];
  readonly physicalSoundSamples: readonly PhysicalSoundSample[];
  /** Transient IDs whose authenticated physical cause supplies surface support. */
  readonly surfaceSoundSampleIds?: readonly string[];
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly targetTick: number;
}>): readonly CoreEcologyObservationBatch[] | null {
  if (
    !Array.isArray(input.dogs)
    || input.dogs.length > DOG_PHYSICAL_ACOUSTIC_MAX_LISTENERS
    || !Array.isArray(input.physicalSoundSamples)
    || input.physicalSoundSamples.length > PHYSICAL_ACOUSTIC_MAX_SAMPLES
    || (Object.hasOwn(input, "surfaceSoundSampleIds")
      && !Array.isArray(input.surfaceSoundSampleIds))
    || (input.surfaceSoundSampleIds?.length ?? 0) > PHYSICAL_ACOUSTIC_MAX_SAMPLES
    || !Number.isSafeInteger(input.targetTick)
    || input.targetTick < 0
  ) return null;
  // Almost every fixed step has no pending body contact. Do not sort actors or
  // scan listener-local water tiles when there is no acoustic fact to consume.
  if (input.physicalSoundSamples.length === 0) {
    return (input.surfaceSoundSampleIds?.length ?? 0) === 0 ? EMPTY_BATCHES : null;
  }
  if (regionalWindowForWorld(input.world) !== input.window) return null;
  const samples: PhysicalSoundSample[] = [];
  for (const raw of input.physicalSoundSamples) {
    const sample = createPhysicalSoundSample(raw);
    if (sample === null) return null;
    samples.push(sample);
  }
  const sampleIds = new Set(samples.map(({ id }) => id));
  const surfaceSampleIds = new Set<string>();
  for (const id of input.surfaceSoundSampleIds ?? []) {
    if (!sampleIds.has(id) || surfaceSampleIds.has(id)) return null;
    surfaceSampleIds.add(id);
  }
  const batches: CoreEcologyObservationBatch[] = [];
  const dogs: DogActorState[] = [];
  for (const raw of input.dogs) {
    const dog = canonicalizeDogActorState(raw);
    if (dog === null) return null;
    dogs.push(dog);
  }
  dogs.sort((left, right) => compareText(
    left.identity.stableId,
    right.identity.stableId,
  ));
  if (new Set(dogs.map(({ identity }) => identity.stableId)).size !== dogs.length) return null;

  for (const dog of dogs) {
    const placement = livingActorAddressInRegionalWindow(dog.address, input.window);
    if (placement === null) continue;
    const ambientNoise = ambientNoiseAt(input.world, placement.tileIndex);
    if (ambientNoise === null) return null;
    const hearingSensitivity = livingActorSenseProfile(dog.address.species).hearingSensitivity;
    const observations: ActorObservation[] = [];
    for (const sample of samples) {
      const effectiveRangeUnits = Math.floor(
        sample.soundRangeUnits * hearingSensitivity / ACTOR_PERCEPTION_SCALE,
      );
      const reception = evaluatePhysicalAcousticListener({
        observationId: `physical-hearing:${hashCanonical({
          acousticEventId: sample.acousticEventId,
          observerId: dog.identity.stableId,
          targetTick: input.targetTick,
        })}`,
        observerId: dog.identity.stableId,
        observerPosition: dog.address.position,
        observedAtTick: input.targetTick,
        sample,
        effectiveRangeUnits,
        ambientNoise,
        wind: {
          x: input.world.weather.windX / FIXED_POINT,
          y: input.world.weather.windY / FIXED_POINT,
        },
      }, {
        world: input.world,
        sourceSupport: surfaceSampleIds.has(sample.id) ? "surface" : "unmodeled",
        listenerSupport: "surface",
      });
      if (reception === null) return null;
      if (reception.kind === "heard") observations.push(reception.observation);
    }
    const canonical = canonicalizeActorObservations(observations);
    if (canonical.length !== observations.length) return null;
    batches.push(Object.freeze({
      observerId: dog.identity.stableId,
      observations: canonical,
    }));
  }
  return Object.freeze(batches);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
