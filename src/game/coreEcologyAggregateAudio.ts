import { FIXED_POINT, type WorldView } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  isLivingActorAddress,
  livingActorAddressInRegionalWindow,
  type LivingActorAddress,
} from "./livingActor";
import { livingActorSenseProfile } from "./livingActorSenses";
import {
  calculateAmbientNoise,
  evaluateAudibleContact,
  type AudibleContact,
} from "./perception";
import type { RegionalTerrainWindow } from "./regionalTravel";
import { regionalAddressAt, regionalWindowForWorld } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  worldPositionToSpatialFrame,
} from "./worldPosition";

export const CORE_ECOLOGY_CHORUS_CADENCE_TICKS = 24 as const;
export const CORE_ECOLOGY_CHORUS_MIN_ACTIVITY = 180_000 as const;
export const CORE_ECOLOGY_FROG_CHORUS_RANGE_UNITS =
  32 * WORLD_POSITION_UNITS_PER_TILE;

export interface CoreEcologyAggregateAudioFrameInput {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly player: LivingActorAddress;
  readonly tick: number;
  readonly window: RegionalTerrainWindow;
  readonly world: WorldView;
}

export interface CoreEcologyAggregateHeardCue {
  readonly cue: "frog-chorus";
  readonly caption:
    | "[frog chorus nearby]"
    | "[frog chorus in the distance]";
  /** Stereo pan only; this is not a map bearing or an entity disclosure. */
  readonly pan: number;
  readonly volume: number;
  readonly variantSeed: number;
  /** Anonymous uncertainty bands from the shared hearing evaluator. */
  readonly contact: AudibleContact;
}

interface HeardCandidate {
  readonly anchorOrdinal: number;
  readonly aggregateId: string;
  readonly cue: CoreEcologyAggregateHeardCue;
}

/**
 * Projects an extant aggregate activity signal through ordinary player
 * hearing. It never creates a frog actor, reveals an aggregate ID, or emits a
 * cue merely because a population exists somewhere in the loaded region.
 */
export function projectCoreEcologyAggregateHeardCues(
  value: unknown,
): readonly CoreEcologyAggregateHeardCue[] | null {
  const input = canonicalInput(value);
  if (input === null) return null;
  if (input.tick % CORE_ECOLOGY_CHORUS_CADENCE_TICKS !== 0) {
    return Object.freeze([]);
  }
  const player = livingActorAddressInRegionalWindow(input.player, input.window);
  const origin = regionalAddressAt(input.world, 0);
  if (player === null || origin === null) return Object.freeze([]);
  let frame;
  try {
    frame = createSpatialFrame(
      createWorldPosition(
        origin.region,
        origin.localX * WORLD_POSITION_UNITS_PER_TILE,
        origin.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      input.world.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      input.world.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
  const raining = input.world.weather.kind === "rain"
    || input.world.weather.kind === "storm";
  const ambientNoise = calculateAmbientNoise({
    rainIntensity: raining ? input.world.weather.intensity / FIXED_POINT : 0,
    // Water ambience has its own spatial owner. Omitting it here is explicit;
    // this slice does not invent a listener-local turbulence sample.
    localWaterTurbulence: 0,
  });
  if (ambientNoise === null) return null;
  const hearing = livingActorSenseProfile(input.player.species).hearingSensitivity;
  const baseRange = Math.trunc(
    CORE_ECOLOGY_FROG_CHORUS_RANGE_UNITS * hearing / FIXED_POINT,
  );
  const candidates: HeardCandidate[] = [];
  for (const population of input.patch.aggregatePopulations) {
    if (
      population.species !== "southern-leopard-frog"
      || population.activitySignal.kind !== "rain-chorus"
      || population.activitySignal.intensity < CORE_ECOLOGY_CHORUS_MIN_ACTIVITY
    ) continue;
    for (const anchor of population.anchors) {
      if (anchor.populationUnits === 0) continue;
      const source = worldPositionToSpatialFrame(frame, anchor.position);
      if (source === null) continue;
      const populationFraction = anchor.populationUnits / population.populationSize;
      const sourceLoudness = clampUnit(
        population.activitySignal.intensity / FIXED_POINT
          * (0.72 + 0.28 * populationFraction),
      );
      const contact = evaluateAudibleContact({
        listener: player.point,
        source,
        baseRange,
        ambientNoise,
        sourceLoudness,
        wind: {
          x: input.world.weather.windX / FIXED_POINT,
          y: input.world.weather.windY / FIXED_POINT,
        },
      });
      if (contact === null) continue;
      candidates.push(Object.freeze({
        anchorOrdinal: anchor.anchorOrdinal,
        aggregateId: population.aggregateId,
        cue: Object.freeze({
          cue: "frog-chorus",
          caption: contact.distanceBand.maximum
              <= 8 * WORLD_POSITION_UNITS_PER_TILE
            ? "[frog chorus nearby]"
            : "[frog chorus in the distance]",
          pan: panFromBearing(contact.bearing.centerRadians),
          volume: clampUnit(0.2 + contact.certainty * 0.32),
          variantSeed: variantSeed(population.aggregateId, anchor.anchorOrdinal, input.tick),
          contact,
        }),
      }));
    }
  }
  candidates.sort((left, right) => (
    right.cue.contact.certainty - left.cue.contact.certainty
    || left.cue.contact.distanceBand.maximum - right.cue.contact.distanceBand.maximum
    || compareText(left.aggregateId, right.aggregateId)
    || left.anchorOrdinal - right.anchorOrdinal
  ));
  const selected = candidates[0];
  return selected === undefined
    ? Object.freeze([])
    : Object.freeze([selected.cue]);
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

function variantSeed(aggregateId: string, anchorOrdinal: number, tick: number): number {
  return Number.parseInt(hashCanonical({ aggregateId, anchorOrdinal, tick }).slice(0, 8), 16)
    >>> 0;
}

function panFromBearing(bearingRadians: number): number {
  return clampPan(Math.cos(bearingRadians));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampPan(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
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
