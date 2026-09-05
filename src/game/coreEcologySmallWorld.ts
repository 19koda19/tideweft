import {
  OBSERVATION_CHANNELS,
  type ObservationChannel,
} from "../sim/actorPerception";
import { FIXED_POINT } from "../sim/types";
import {
  canonicalizeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  type CoreEcologyAggregateAreaAnchor,
  type CoreEcologyAggregateEvidenceCause,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyAggregateSpecies,
} from "./coreEcology";

export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION = 2 as const;
export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION = 1 as const;
export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS = 8 as const;
export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI = 32 as const;

export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_SOURCE_KINDS = [
  "same-species",
  "cat",
  "dog",
  "human",
  "gull",
  "rain",
  "exposed-food",
] as const;

export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_CHANNELS = OBSERVATION_CHANNELS;

export type CoreEcologySettlementShadowsSourceKind =
  (typeof CORE_ECOLOGY_SETTLEMENT_SHADOWS_SOURCE_KINDS)[number];
export type CoreEcologySettlementShadowsChannel = ObservationChannel;
export type CoreEcologySettlementShadowsResponse = "pressure" | "attraction";

export interface CoreEcologySettlementShadowsAnchorInfluence {
  readonly anchorOrdinal: number;
  /** Fixed-point 0..1 signal already resolved by the authoritative owner. */
  readonly intensity: number;
}

/**
 * One aggregate-facing sensory/environmental fact. The caller, not this
 * population kernel, owns line-of-sight, sound/scent propagation, weather,
 * and physical-item custody. A stimulus may therefore be submitted only after
 * that authoritative owner has resolved what reaches each aggregate anchor.
 */
export interface CoreEcologySettlementShadowsStimulus {
  readonly version: typeof CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION;
  readonly stimulusId: string;
  readonly sourceReferenceId: string;
  readonly sourceKind: CoreEcologySettlementShadowsSourceKind;
  readonly response: CoreEcologySettlementShadowsResponse;
  readonly targetAggregateId: string;
  readonly channels: readonly CoreEcologySettlementShadowsChannel[];
  readonly anchorInfluences: readonly CoreEcologySettlementShadowsAnchorInfluence[];
}

export interface CoreEcologySettlementShadowsStimulusFrame {
  readonly version: typeof CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION;
  readonly atTick: number;
  readonly stimuli: readonly CoreEcologySettlementShadowsStimulus[];
}

export interface CoreEcologySettlementShadowsEvent {
  readonly version: typeof CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION;
  readonly eventId: string;
  readonly kind: "aggregate-redistributed";
  readonly atTick: number;
  readonly stimulusId: string;
  readonly sourceReferenceId: string;
  readonly sourceKind: CoreEcologySettlementShadowsSourceKind;
  readonly response: CoreEcologySettlementShadowsResponse;
  readonly channels: readonly CoreEcologySettlementShadowsChannel[];
  readonly causeKind: Exclude<CoreEcologyAggregateEvidenceCause, "population-activity">;
  readonly targetSpecies: CoreEcologyAggregateSpecies;
  readonly aggregateId: string;
  readonly evidenceId: string;
  readonly fromAnchorOrdinal: number;
  readonly toAnchorOrdinal: number;
  readonly displacedUnits: 1;
  readonly playerKnowledge: "none";
  readonly mortality: "none";
  readonly cargoInteraction: false;
  readonly itemConsumption: "none";
}

export interface CoreEcologySettlementShadowsStepResult {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly events: readonly CoreEcologySettlementShadowsEvent[];
}

interface SourcePolicy {
  readonly response: CoreEcologySettlementShadowsResponse;
  readonly causeKind: Exclude<CoreEcologyAggregateEvidenceCause, "population-activity">;
  readonly channels: ReadonlySet<CoreEcologySettlementShadowsChannel>;
}

interface RelocationCandidate {
  readonly stimulus: CoreEcologySettlementShadowsStimulus;
  readonly causeKind: SourcePolicy["causeKind"];
  readonly fromAnchorOrdinal: number;
  readonly toAnchorOrdinal: number;
  readonly relocationSignal: number;
  readonly peakSignal: number;
}

const ANIMAL_CHANNELS = new Set<CoreEcologySettlementShadowsChannel>([
  "vision",
  "hearing",
  "scent",
  "touch",
  "evidence",
]);
const FOOD_CHANNELS = new Set<CoreEcologySettlementShadowsChannel>([
  "vision",
  "scent",
  "touch",
  "evidence",
]);
const WEATHER_CHANNELS = new Set<CoreEcologySettlementShadowsChannel>([
  "hearing",
  "touch",
  "evidence",
]);
const SAME_SPECIES_CHANNELS = new Set<CoreEcologySettlementShadowsChannel>([
  "touch",
  "evidence",
]);
const SOURCE_POLICIES: Readonly<Record<
  CoreEcologySettlementShadowsSourceKind,
  SourcePolicy
>> = Object.freeze({
  "same-species": Object.freeze({
    response: "pressure",
    causeKind: "animal-disturbance",
    channels: SAME_SPECIES_CHANNELS,
  }),
  cat: Object.freeze({
    response: "pressure",
    causeKind: "predator-pressure",
    channels: ANIMAL_CHANNELS,
  }),
  dog: Object.freeze({
    response: "pressure",
    causeKind: "predator-pressure",
    channels: ANIMAL_CHANNELS,
  }),
  human: Object.freeze({
    response: "pressure",
    causeKind: "human-disturbance",
    channels: ANIMAL_CHANNELS,
  }),
  gull: Object.freeze({
    response: "pressure",
    causeKind: "animal-disturbance",
    channels: ANIMAL_CHANNELS,
  }),
  rain: Object.freeze({
    response: "pressure",
    causeKind: "weather-pressure",
    channels: WEATHER_CHANNELS,
  }),
  "exposed-food": Object.freeze({
    response: "attraction",
    causeKind: "food-attraction",
    channels: FOOD_CHANNELS,
  }),
});
const SOURCE_KIND_SET = new Set<string>(CORE_ECOLOGY_SETTLEMENT_SHADOWS_SOURCE_KINDS);
const CHANNEL_SET = new Set<string>(CORE_ECOLOGY_SETTLEMENT_SHADOWS_CHANNELS);
const STABLE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;

/** Strict, deterministic admission boundary for the runtime-owned stimulus frame. */
export function canonicalizeCoreEcologySettlementShadowsStimulusFrame(
  value: unknown,
): CoreEcologySettlementShadowsStimulusFrame | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["atTick", "stimuli", "version"])
    || value.version !== CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION
    || !nonnegativeSafeInteger(value.atTick)
    || !Array.isArray(value.stimuli)
    || value.stimuli.length > CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI
  ) return null;

  const stimuli: CoreEcologySettlementShadowsStimulus[] = [];
  const stimulusIds = new Set<string>();
  for (const candidate of value.stimuli) {
    const stimulus = canonicalStimulus(candidate);
    if (stimulus === null || stimulusIds.has(stimulus.stimulusId)) return null;
    stimulusIds.add(stimulus.stimulusId);
    stimuli.push(stimulus);
  }
  stimuli.sort(compareStimulus);
  return deepFreeze({
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    atTick: value.atTick,
    stimuli,
  });
}

/**
 * Bounded aggregate ecology step. It consumes an explicit, already-authorized
 * stimulus frame and never scans actors, items, weather, or the player. At
 * most one unit per aggregate moves on each fixed cadence; nothing dies, no
 * synthetic small-animal actor is created, and no cargo is touched or eaten.
 *
 * Omitting `stimulusFrame` is a migration-safe empty frame. Runtime owners
 * should always pass an explicit frame so ecological causality remains
 * inspectable.
 */
export function stepCoreEcologySettlementShadows(
  value: unknown,
  atTick: unknown,
  stimulusFrame?: unknown,
): CoreEcologySettlementShadowsStepResult | null {
  let patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !nonnegativeSafeInteger(atTick)
    || atTick !== patch.updatedAtTick
  ) return null;
  const frame = stimulusFrame === undefined
    ? emptyStimulusFrame(atTick)
    : canonicalizeCoreEcologySettlementShadowsStimulusFrame(stimulusFrame);
  if (frame === null || frame.atTick !== atTick) return null;
  const aggregatesById = new Map(patch.aggregatePopulations.map((population) => (
    [population.aggregateId, population] as const
  )));
  if (frame.stimuli.some((stimulus) => {
    const population = aggregatesById.get(stimulus.targetAggregateId);
    return population === undefined
      || !stimuliFitPopulation([stimulus], population.anchors);
  })) {
    return null;
  }
  if (atTick % CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS !== 0) {
    return Object.freeze({ patch, events: Object.freeze([]) });
  }

  const events: CoreEcologySettlementShadowsEvent[] = [];
  const aggregates = [...patch.aggregatePopulations].sort((left, right) => (
    compareText(left.aggregateId, right.aggregateId)
  ));
  for (const population of aggregates) {
    if (population.anchors.length < 2) continue;
    const relevantStimuli = frame.stimuli.filter(({ targetAggregateId }) => (
      targetAggregateId === population.aggregateId
    ));
    const candidates = relevantStimuli.flatMap((stimulus) => {
      const movement = relocationCandidate(stimulus, population.anchors);
      return movement === null ? [] : [movement];
    });
    // A population-area aggregate still needs one genuine same-species rule.
    // Crowding disperses one unit only when two anchors differ by at least two
    // units, so indivisible balanced populations do not oscillate forever.
    // External perceived facts take precedence whenever one can cause a
    // lawful relocation; this bounded fallback never invents an individual
    // rat, target, injury, death, or food transaction.
    if (candidates.length === 0) {
      const density = aggregateDensityStimulus(population, atTick);
      const movement = density === null
        ? null
        : relocationCandidate(density, population.anchors);
      if (movement !== null) candidates.push(movement);
    }
    candidates.sort(compareRelocationCandidate);
    const selected = candidates[0];
    if (selected === undefined) continue;

    const displaced = displaceCoreEcologyAggregatePopulation(patch, {
      aggregateId: population.aggregateId,
      atTick,
      causeKind: selected.causeKind,
      causeReferenceId: selected.stimulus.sourceReferenceId,
      fromAnchorOrdinal: selected.fromAnchorOrdinal,
      toAnchorOrdinal: selected.toAnchorOrdinal,
      populationUnits: 1,
      pressure: selected.relocationSignal,
    });
    if (displaced === null) return null;
    patch = displaced.patch;
    events.push(deepFreeze({
      version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION,
      eventId: `settlement-shadows:${population.aggregateId}:${displaced.disturbance.disturbanceOrdinal.toString(36)}`,
      kind: "aggregate-redistributed",
      atTick,
      stimulusId: selected.stimulus.stimulusId,
      sourceReferenceId: selected.stimulus.sourceReferenceId,
      sourceKind: selected.stimulus.sourceKind,
      response: selected.stimulus.response,
      channels: selected.stimulus.channels,
      causeKind: selected.causeKind,
      targetSpecies: population.species,
      aggregateId: population.aggregateId,
      evidenceId: displaced.evidence.evidenceId,
      fromAnchorOrdinal: selected.fromAnchorOrdinal,
      toAnchorOrdinal: selected.toAnchorOrdinal,
      displacedUnits: 1,
      playerKnowledge: "none",
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    }));
  }

  return Object.freeze({ patch, events: Object.freeze(events) });
}

function aggregateDensityStimulus(
  population: CoreEcologyAggregatePatchState["aggregatePopulations"][number],
  atTick: number,
): CoreEcologySettlementShadowsStimulus | null {
  if (population.populationSize < 2 || population.anchors.length < 2) return null;
  let minimum = Number.MAX_SAFE_INTEGER;
  let maximum = 0;
  for (const anchor of population.anchors) {
    minimum = Math.min(minimum, anchor.populationUnits);
    maximum = Math.max(maximum, anchor.populationUnits);
  }
  if (maximum - minimum < 2) return null;
  const anchorInfluences = population.anchors.map((anchor) => Object.freeze({
    anchorOrdinal: anchor.anchorOrdinal,
    intensity: Math.floor(anchor.populationUnits * FIXED_POINT / population.populationSize),
  }));
  return deepFreeze({
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    stimulusId: `density:${population.aggregateId}:${atTick.toString(36)}`,
    sourceReferenceId: population.aggregateId,
    sourceKind: "same-species",
    response: "pressure",
    targetAggregateId: population.aggregateId,
    channels: ["touch"],
    anchorInfluences,
  });
}

function canonicalStimulus(value: unknown): CoreEcologySettlementShadowsStimulus | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "anchorInfluences",
    "channels",
    "response",
    "sourceKind",
    "sourceReferenceId",
    "stimulusId",
    "targetAggregateId",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION
    || !stableReference(value.stimulusId)
    || !stableReference(value.sourceReferenceId)
    || !SOURCE_KIND_SET.has(value.sourceKind as string)
    || (value.response !== "pressure" && value.response !== "attraction")
    || !stableReference(value.targetAggregateId)
    || !Array.isArray(value.channels)
    || value.channels.length === 0
    || value.channels.length > CORE_ECOLOGY_SETTLEMENT_SHADOWS_CHANNELS.length
    || !Array.isArray(value.anchorInfluences)
    || value.anchorInfluences.length === 0
    || value.anchorInfluences.length > 4
  ) return null;
  const sourceKind = value.sourceKind as CoreEcologySettlementShadowsSourceKind;
  const policy = SOURCE_POLICIES[sourceKind];
  if (value.response !== policy.response) return null;

  const channels: CoreEcologySettlementShadowsChannel[] = [];
  const seenChannels = new Set<string>();
  for (const channel of value.channels) {
    if (
      typeof channel !== "string"
      || !CHANNEL_SET.has(channel)
      || !policy.channels.has(channel as CoreEcologySettlementShadowsChannel)
      || seenChannels.has(channel)
    ) return null;
    seenChannels.add(channel);
    channels.push(channel as CoreEcologySettlementShadowsChannel);
  }
  channels.sort((left, right) => (
    CORE_ECOLOGY_SETTLEMENT_SHADOWS_CHANNELS.indexOf(left)
    - CORE_ECOLOGY_SETTLEMENT_SHADOWS_CHANNELS.indexOf(right)
  ));

  const anchorInfluences: CoreEcologySettlementShadowsAnchorInfluence[] = [];
  const seenOrdinals = new Set<number>();
  let positiveInfluence = false;
  for (const influence of value.anchorInfluences) {
    if (
      !plainRecord(influence)
      || !exactKeys(influence, ["anchorOrdinal", "intensity"])
      || !nonnegativeSafeInteger(influence.anchorOrdinal)
      || !fixedPoint(influence.intensity)
      || seenOrdinals.has(influence.anchorOrdinal)
    ) return null;
    seenOrdinals.add(influence.anchorOrdinal);
    positiveInfluence ||= influence.intensity > 0;
    anchorInfluences.push(Object.freeze({
      anchorOrdinal: influence.anchorOrdinal,
      intensity: influence.intensity,
    }));
  }
  if (!positiveInfluence) return null;
  anchorInfluences.sort((left, right) => left.anchorOrdinal - right.anchorOrdinal);

  return deepFreeze({
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    stimulusId: value.stimulusId,
    sourceReferenceId: value.sourceReferenceId,
    sourceKind,
    response: value.response,
    targetAggregateId: value.targetAggregateId,
    channels,
    anchorInfluences,
  });
}

function relocationCandidate(
  stimulus: CoreEcologySettlementShadowsStimulus,
  anchors: readonly CoreEcologyAggregateAreaAnchor[],
): RelocationCandidate | null {
  const policy = SOURCE_POLICIES[stimulus.sourceKind];
  const influenceByAnchor = new Map(stimulus.anchorInfluences.map((influence) => (
    [influence.anchorOrdinal, influence.intensity] as const
  )));
  let best: RelocationCandidate | null = null;
  for (const from of anchors) {
    if (from.populationUnits === 0) continue;
    const fromInfluence = influenceByAnchor.get(from.anchorOrdinal) ?? 0;
    for (const to of anchors) {
      if (from.anchorOrdinal === to.anchorOrdinal) continue;
      const toInfluence = influenceByAnchor.get(to.anchorOrdinal) ?? 0;
      const relocationSignal = stimulus.response === "pressure"
        ? fromInfluence - toInfluence
        : toInfluence - fromInfluence;
      if (relocationSignal <= 0) continue;
      const candidate: RelocationCandidate = {
        stimulus,
        causeKind: policy.causeKind,
        fromAnchorOrdinal: from.anchorOrdinal,
        toAnchorOrdinal: to.anchorOrdinal,
        relocationSignal,
        peakSignal: Math.max(fromInfluence, toInfluence),
      };
      if (best === null || compareRelocationCandidate(candidate, best) < 0) best = candidate;
    }
  }
  return best;
}

function stimuliFitPopulation(
  stimuli: readonly CoreEcologySettlementShadowsStimulus[],
  anchors: readonly CoreEcologyAggregateAreaAnchor[],
): boolean {
  const anchorOrdinals = new Set(anchors.map(({ anchorOrdinal }) => anchorOrdinal));
  return stimuli.every(({ anchorInfluences }) => anchorInfluences.every(({ anchorOrdinal }) => (
    anchorOrdinals.has(anchorOrdinal)
  )));
}

function compareRelocationCandidate(
  left: RelocationCandidate,
  right: RelocationCandidate,
): number {
  return right.relocationSignal - left.relocationSignal
    || right.peakSignal - left.peakSignal
    || compareText(left.stimulus.stimulusId, right.stimulus.stimulusId)
    || compareText(left.stimulus.sourceReferenceId, right.stimulus.sourceReferenceId)
    || left.fromAnchorOrdinal - right.fromAnchorOrdinal
    || left.toAnchorOrdinal - right.toAnchorOrdinal;
}

function compareStimulus(
  left: CoreEcologySettlementShadowsStimulus,
  right: CoreEcologySettlementShadowsStimulus,
): number {
  return compareText(left.targetAggregateId, right.targetAggregateId)
    || compareText(left.stimulusId, right.stimulusId)
    || compareText(left.sourceReferenceId, right.sourceReferenceId);
}

function emptyStimulusFrame(atTick: number): CoreEcologySettlementShadowsStimulusFrame {
  return Object.freeze({
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    atTick,
    stimuli: Object.freeze([]),
  });
}

function fixedPoint(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= FIXED_POINT;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function stableReference(value: unknown): value is string {
  return typeof value === "string" && STABLE_REFERENCE_PATTERN.test(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
