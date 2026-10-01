import type { ActorObservation } from "../sim/actorPerception";
import { FIXED_POINT, type WorldView } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregateAreaAnchor,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyAggregatePopulationState,
} from "./coreEcology";
import {
  isLivingActorAddress,
  livingActorAddressInRegionalWindow,
  type LivingActorAddress,
} from "./livingActor";
import { livingActorSenseProfile } from "./livingActorSenses";
import type { AudibleContact } from "./perception";
import {
  ambientNoiseAt,
  createPhysicalSoundSample,
  evaluatePhysicalAcousticListener,
  type PhysicalSoundSample,
} from "./physicalAcousticPerception";
import type { RegionalTerrainWindow } from "./regionalTravel";
import { regionalWindowForWorld } from "./regionalWorldView";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";
import {
  audibleContactPan,
} from "./audibleContactPresentation";
import {
  createWorldAcousticEvent,
  type WorldAcousticEvent,
} from "./worldAcoustics";

export const CORE_ECOLOGY_CHORUS_CADENCE_TICKS = 24 as const;
export const CORE_ECOLOGY_CHORUS_MIN_ACTIVITY = 180_000 as const;
export const CORE_ECOLOGY_FROG_CHORUS_RANGE_UNITS =
  32 * WORLD_POSITION_UNITS_PER_TILE;

const CORE_ECOLOGY_CHORUS_DURATION_STEPS = 8;

export interface CoreEcologyAggregateChorusEventFrameInput {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly tick: number;
}

export interface CoreEcologyAggregateAudioFrameInput {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly player: LivingActorAddress;
  readonly tick: number;
  readonly window: RegionalTerrainWindow;
  readonly world: WorldView;
}

export interface CoreEcologyAggregateHeardCue {
  /** Stereo pan only; this is not a map bearing or an entity disclosure. */
  readonly pan: number;
  readonly volume: number;
  readonly variantSeed: number;
  /** Anonymous uncertainty bands from the shared hearing evaluator. */
  readonly contact: AudibleContact;
  /** Exact world truth for downstream audio/response; never player-facing prose. */
  readonly event: WorldAcousticEvent;
  /** Lawful heard-unseen receipt; identity and exact source position stay absent. */
  readonly observation: ActorObservation;
}

interface HeardCandidate {
  readonly cue: CoreEcologyAggregateHeardCue;
}

/**
 * Derives bounded ecology-owned chorus facts without consulting any listener.
 * Each qualifying population emits one group event, never one event per frog
 * or anchor. The largest occupied anchor represents that distributed chorus;
 * ties use the lowest stable ordinal. Aggregate identity owns the stable sound
 * source, while the representative anchor may move its current position.
 */
export function deriveCoreEcologyAggregateChorusEvents(
  value: unknown,
): readonly WorldAcousticEvent[] | null {
  const input = canonicalChorusEventInput(value);
  if (input === null) return null;
  return deriveCanonicalChorusEvents(input);
}

function deriveCanonicalChorusEvents(
  input: CoreEcologyAggregateChorusEventFrameInput,
): readonly WorldAcousticEvent[] | null {
  if (input.tick % CORE_ECOLOGY_CHORUS_CADENCE_TICKS !== 0) {
    return Object.freeze([]);
  }
  const events: WorldAcousticEvent[] = [];
  for (const population of input.patch.aggregatePopulations) {
    if (!qualifyingFrogChorus(population)) continue;
    const anchor = representativeChorusAnchor(population.anchors);
    if (anchor === null) continue;
    const sourceHash = hashCanonical({
      aggregateId: population.aggregateId,
      purpose: "aggregate-chorus-source:v1",
    });
    const triggerHash = hashCanonical({
      activityTick: population.activitySignal.updatedAtTick,
      aggregateId: population.aggregateId,
      anchorOrdinal: anchor.anchorOrdinal,
      purpose: "aggregate-chorus-event:v1",
    });
    const variantSeed = Number.parseInt(hashCanonical({
      activityTick: population.activitySignal.updatedAtTick,
      aggregateId: population.aggregateId,
      anchorOrdinal: anchor.anchorOrdinal,
    }).slice(0, 8), 16) >>> 0;
    const event = createWorldAcousticEvent({
      triggerEventId: `ecology-chorus:${triggerHash}`,
      domain: "actor-vocalization",
      sourceId: `ecology-aggregate-source:${sourceHash}`,
      sourceCategory: "animal",
      sourcePosition: anchor.position,
      occurredAtTick: input.tick,
      action: "vocalize",
      sourceMaterial: "body",
      surfaceMaterial: "water",
      semanticFamily: "chorus",
      soundClass: "animal-call",
      // Collective activity remains the exact acoustic loudness authority.
      // Chorus is semantically noninterrupting even when many frogs make it
      // loud; loudness must not turn ambience into an impact/alarm receipt.
      interrupt: "none",
      intensity: population.activitySignal.intensity,
      rangeUnits: CORE_ECOLOGY_FROG_CHORUS_RANGE_UNITS,
      durationSteps: CORE_ECOLOGY_CHORUS_DURATION_STEPS,
      priority: 360_000,
      salience: 560_000,
      repetitionKey: `ecology-chorus-repeat:${sourceHash}`,
      textualEligibility: "salience-gated",
      accessibilityRelevance: "informative",
      variantSeed,
    });
    if (event === null || event.interrupt !== "none") return null;
    events.push(event);
  }
  events.sort((left, right) => compareText(left.eventId, right.eventId));
  return Object.freeze(events);
}

/** Shared bounded hearing stimulus for one authenticated aggregate chorus. */
export function coreEcologyAggregateChorusSoundSample(
  event: WorldAcousticEvent,
): PhysicalSoundSample | null {
  if (
    event.domain !== "actor-vocalization"
    || event.sourceCategory !== "animal"
    || event.action !== "vocalize"
    || event.sourceMaterial !== "body"
    || event.surfaceMaterial !== "water"
    || event.semanticFamily !== "chorus"
    || event.soundClass !== "animal-call"
    || event.interrupt !== "none"
    || !event.triggerEventId.startsWith("ecology-chorus:")
    || !event.sourceId.startsWith("ecology-aggregate-source:")
    || !event.repetitionKey.startsWith("ecology-chorus-repeat:")
  ) return null;
  const sampleHash = hashCanonical({
    eventId: event.eventId,
    purpose: "aggregate-chorus-sample:v1",
  });
  return createPhysicalSoundSample({
    acousticEventId: event.eventId,
    id: `chorus-${sampleHash.slice(0, 32)}`,
    position: event.sourcePosition,
    soundLoudness: event.intensity,
    soundRangeUnits: event.rangeUnits,
    soundClass: event.soundClass,
    soundInterrupt: event.interrupt,
    sourceId: event.sourceId,
  });
}

/**
 * Projects ecology-owned chorus events through ordinary player hearing. Source
 * truth is derived first and stays independent of this listener. The result
 * never creates a frog actor, reveals an aggregate ID, or emits a cue merely
 * because a population exists somewhere in the loaded region.
 */
export function projectCoreEcologyAggregateHeardCues(
  value: unknown,
): readonly CoreEcologyAggregateHeardCue[] | null {
  const input = canonicalInput(value);
  if (input === null) return null;
  const player = livingActorAddressInRegionalWindow(input.player, input.window);
  if (player === null) return Object.freeze([]);
  const events = deriveCanonicalChorusEvents({
    patch: input.patch,
    tick: input.tick,
  });
  if (events === null) return null;
  if (events.length === 0) return Object.freeze([]);
  const ambientNoise = ambientNoiseAt(input.world, player.tileIndex);
  if (ambientNoise === null) return null;
  const hearing = livingActorSenseProfile(input.player.species).hearingSensitivity;
  const candidates: HeardCandidate[] = [];
  for (const event of events) {
    const sample = coreEcologyAggregateChorusSoundSample(event);
    if (sample === null) return null;
    const effectiveRangeUnits = Math.trunc(event.rangeUnits * hearing / FIXED_POINT);
    const reception = evaluatePhysicalAcousticListener({
      observationId: `aggregate-chorus-hearing:${hashCanonical({
        eventId: event.eventId,
        observerId: input.player.actorId,
        tick: input.tick,
      })}`,
      observerId: input.player.actorId,
      observerPosition: input.player.position,
      observedAtTick: input.tick,
      sample,
      effectiveRangeUnits,
      ambientNoise,
      wind: {
        x: input.world.weather.windX / FIXED_POINT,
        y: input.world.weather.windY / FIXED_POINT,
      },
    });
    if (reception === null) return null;
    if (reception.kind !== "heard") continue;
    const contact = reception.contact;
    candidates.push(Object.freeze({
      cue: Object.freeze({
        pan: panFromContact(contact),
        volume: clampUnit(0.2 + contact.certainty * 0.32),
        variantSeed: event.presentationVariantSeed,
        contact,
        event,
        observation: reception.observation,
      }),
    }));
  }
  candidates.sort((left, right) => (
    right.cue.contact.certainty - left.cue.contact.certainty
    || left.cue.contact.distanceBand.maximum - right.cue.contact.distanceBand.maximum
    || compareText(left.cue.event.eventId, right.cue.event.eventId)
  ));
  const selected = candidates[0];
  return selected === undefined
    ? Object.freeze([])
    : Object.freeze([selected.cue]);
}

function canonicalChorusEventInput(
  value: unknown,
): CoreEcologyAggregateChorusEventFrameInput | null {
  if (!plainRecord(value) || !exactKeys(value, ["patch", "tick"])) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value.patch);
  if (
    patch === null
    || !nonnegativeSafeInteger(value.tick)
    || patch.updatedAtTick !== value.tick
  ) return null;
  return Object.freeze({ patch, tick: value.tick });
}

function qualifyingFrogChorus(
  population: CoreEcologyAggregatePopulationState,
): boolean {
  return population.species === "southern-leopard-frog"
    && population.activitySignal.kind === "rain-chorus"
    && population.activitySignal.intensity >= CORE_ECOLOGY_CHORUS_MIN_ACTIVITY;
}

function representativeChorusAnchor(
  anchors: readonly CoreEcologyAggregateAreaAnchor[],
): CoreEcologyAggregateAreaAnchor | null {
  let selected: CoreEcologyAggregateAreaAnchor | null = null;
  for (const anchor of anchors) {
    if (anchor.populationUnits === 0) continue;
    if (
      selected === null
      || anchor.populationUnits > selected.populationUnits
      || (
        anchor.populationUnits === selected.populationUnits
        && anchor.anchorOrdinal < selected.anchorOrdinal
      )
    ) selected = anchor;
  }
  return selected;
}

function canonicalInput(value: unknown): CoreEcologyAggregateAudioFrameInput | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "patch",
    "player",
    "tick",
    "window",
    "world",
  ])) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value.patch);
  if (
    patch === null
    || !isLivingActorAddress(value.player)
    || value.player.species !== "human"
    || !nonnegativeSafeInteger(value.tick)
    || !plainRecord(value.world)
    || !plainRecord(value.window)
  ) return null;
  const world = value.world as unknown as WorldView;
  const window = value.window as unknown as RegionalTerrainWindow;
  if (
    patch.updatedAtTick !== value.tick
    || world.completedTick !== value.tick
    || regionalWindowForWorld(world) !== window
  ) return null;
  return Object.freeze({
    patch,
    player: value.player,
    tick: value.tick,
    window,
    world,
  });
}

function panFromContact(contact: AudibleContact): number {
  return audibleContactPan(contact);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length
    && actual.every((key, index) => key === sorted[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
