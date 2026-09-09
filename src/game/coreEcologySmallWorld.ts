import {
  OBSERVATION_CHANNELS,
  type ObservationChannel,
} from "../sim/actorPerception";
import { FIXED_POINT } from "../sim/types";
import {
  canonicalizeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  setCoreEcologyAggregateActivityIntensity,
  type CoreEcologyAggregateAreaAnchor,
  type CoreEcologyAggregateEvidenceCause,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyAggregateSpecies,
} from "./coreEcology";
import {
  CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS,
  CORE_ECOLOGY_AGGREGATE_SPECIES,
  coreEcologyAggregateLivingSourceSpecies,
  coreEcologyAggregateSpeciesPolicy,
  resolveCoreEcologyAggregateLivingResponse,
  resolveCoreEcologyAggregateActivityIntensity,
  resolveCoreEcologyAggregateDisturbanceActivity,
  type CoreEcologyAggregateLivingSourceKind,
} from "./coreEcologyAggregatePolicy";
import { projectCoreEcologyTidalTable } from "./coreEcologyTidalTable";

export const CORE_ECOLOGY_SMALL_WORLD_VERSION = 3 as const;
export const CORE_ECOLOGY_SMALL_WORLD_OWNER_ID =
  "game:core-ecology-small-world:v3" as const;
/** Landed rat event revision remains stable for its legacy source vocabulary. */
export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION = 2 as const;
export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION = 1 as const;
export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS = 8 as const;
export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI = 32 as const;
export const CORE_ECOLOGY_SMALL_WORLD_MAX_SOURCES = 128 as const;

export type CoreEcologySettlementShadowsSourceKind =
  | "same-species"
  | "rain"
  | "exposed-food"
  | CoreEcologyAggregateLivingSourceKind;

const LEGACY_SETTLEMENT_SHADOWS_SOURCE_KINDS = [
  "same-species",
  "cat",
  "dog",
  "human",
  "gull",
  "rain",
  "exposed-food",
  "fish-crow",
  "northern-harrier",
] as const;
const LEGACY_SETTLEMENT_SHADOWS_SOURCE_KIND_SET = new Set<string>(
  LEGACY_SETTLEMENT_SHADOWS_SOURCE_KINDS,
);
/** Source kinds that already produced brown-rat redistribution events before Alpha 18. */
const LEGACY_RAT_EVENT_SOURCE_KIND_SET = new Set<string>([
  "same-species",
  "cat",
  "dog",
  "human",
  "gull",
  "rain",
  "exposed-food",
]);
export type CoreEcologySettlementShadowsLegacyRatEventSourceKind =
  | "same-species"
  | "cat"
  | "dog"
  | "human"
  | "gull"
  | "rain"
  | "exposed-food";
export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_SOURCE_KINDS:
readonly CoreEcologySettlementShadowsSourceKind[] = Object.freeze([
  ...LEGACY_SETTLEMENT_SHADOWS_SOURCE_KINDS,
  ...CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS.filter((sourceKind) => (
    !LEGACY_SETTLEMENT_SHADOWS_SOURCE_KIND_SET.has(sourceKind)
  )),
]);

export const CORE_ECOLOGY_SETTLEMENT_SHADOWS_CHANNELS = OBSERVATION_CHANNELS;

export type CoreEcologySettlementShadowsChannel = ObservationChannel;
export type CoreEcologySettlementShadowsResponse = "pressure" | "attraction";
export type CoreEcologySmallWorldSourceKind = CoreEcologySettlementShadowsSourceKind;
export type CoreEcologySmallWorldChannel = CoreEcologySettlementShadowsChannel;
export type CoreEcologySmallWorldResponse = CoreEcologySettlementShadowsResponse;

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

interface CoreEcologySettlementShadowsEventFields {
  readonly eventId: string;
  readonly kind: "aggregate-redistributed";
  readonly atTick: number;
  readonly stimulusId: string;
  readonly sourceReferenceId: string;
  readonly response: CoreEcologySettlementShadowsResponse;
  readonly channels: readonly CoreEcologySettlementShadowsChannel[];
  readonly causeKind: Exclude<CoreEcologyAggregateEvidenceCause, "population-activity">;
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

export type CoreEcologySettlementShadowsEvent =
  & CoreEcologySettlementShadowsEventFields
  & (
    | Readonly<{
        version: typeof CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION;
        sourceKind: CoreEcologySettlementShadowsLegacyRatEventSourceKind;
        targetSpecies: "brown-rat";
      }>
    | Readonly<{
        version: typeof CORE_ECOLOGY_SMALL_WORLD_VERSION;
        sourceKind: CoreEcologySettlementShadowsSourceKind;
        targetSpecies: CoreEcologyAggregateSpecies;
      }>
  );

export interface CoreEcologySettlementShadowsStepResult {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly events: readonly CoreEcologySettlementShadowsEvent[];
}

export interface CoreEcologySmallWorldSourceStepInput {
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly stimulusFrame: CoreEcologySettlementShadowsStimulusFrame;
}

export interface CoreEcologySmallWorldSourceStepResult
  extends CoreEcologySettlementShadowsStepResult {
  readonly sourceKey: string;
}

export type CoreEcologySmallWorldStimulus = CoreEcologySettlementShadowsStimulus;
export type CoreEcologySmallWorldStimulusFrame = CoreEcologySettlementShadowsStimulusFrame;
export type CoreEcologySmallWorldEvent = CoreEcologySettlementShadowsEvent;
export type CoreEcologySmallWorldStepResult = CoreEcologySettlementShadowsStepResult;

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
const STATIC_SOURCE_PROFILES: Readonly<Record<
  "same-species" | "rain" | "exposed-food",
  Readonly<Omit<SourcePolicy, "response">>
>> = Object.freeze({
  "same-species": Object.freeze({
    causeKind: "animal-disturbance",
    channels: SAME_SPECIES_CHANNELS,
  }),
  rain: Object.freeze({
    causeKind: "weather-pressure",
    channels: WEATHER_CHANNELS,
  }),
  "exposed-food": Object.freeze({
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
  const tidal = projectCoreEcologyTidalTable(patch, atTick);
  const aggregatesById = new Map(patch.aggregatePopulations.map((population) => (
    [population.aggregateId, population] as const
  )));
  if (frame.stimuli.some((stimulus) => {
    const population = aggregatesById.get(stimulus.targetAggregateId);
    return population === undefined
      || sourcePolicy(population.species, stimulus.sourceKind) === null
      || !stimuliFitPopulation([stimulus], population.anchors);
  })) {
    return null;
  }
  if (atTick % CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS !== 0) {
    patch = projectPolicyDrivenActivity(patch, frame);
    return Object.freeze({ patch, events: Object.freeze([]) });
  }

  const events: CoreEcologySettlementShadowsEvent[] = [];
  const aggregates = [...patch.aggregatePopulations].sort((left, right) => (
    compareText(left.aggregateId, right.aggregateId)
  ));
  for (const population of aggregates) {
    if (population.anchors.length < 2) continue;
    // A non-tidal derivation may still own inherited silverside history. It
    // participates in the same source-set step, but cannot relocate fish
    // until a tidal projection authenticates lawful destination anchors.
    const lawfulDestinations = population.species === "atlantic-silverside"
      ? new Set(tidal?.anchorDepths.filter(({ aggregateId, activityUsable }) => (
          aggregateId === population.aggregateId && activityUsable
        )).map(({ anchorOrdinal }) => anchorOrdinal) ?? [])
      : null;
    const relevantStimuli = frame.stimuli.filter(({ targetAggregateId }) => (
      targetAggregateId === population.aggregateId
    ));
    const candidates = relevantStimuli.flatMap((stimulus) => {
      const movement = relocationCandidate(
        stimulus,
        population.species,
        population.anchors,
        lawfulDestinations,
      );
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
        : relocationCandidate(
            density,
            population.species,
            population.anchors,
            lawfulDestinations,
          );
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
    const eventFields: CoreEcologySettlementShadowsEventFields = {
      eventId: `settlement-shadows:${population.aggregateId}:${displaced.disturbance.disturbanceOrdinal.toString(36)}`,
      kind: "aggregate-redistributed",
      atTick,
      stimulusId: selected.stimulus.stimulusId,
      sourceReferenceId: selected.stimulus.sourceReferenceId,
      response: selected.stimulus.response,
      channels: selected.stimulus.channels,
      causeKind: selected.causeKind,
      aggregateId: population.aggregateId,
      evidenceId: displaced.evidence.evidenceId,
      fromAnchorOrdinal: selected.fromAnchorOrdinal,
      toAnchorOrdinal: selected.toAnchorOrdinal,
      displacedUnits: 1,
      playerKnowledge: "none",
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    };
    if (
      population.species === "brown-rat"
      && isLegacyRatEventSourceKind(selected.stimulus.sourceKind)
    ) {
      events.push(deepFreeze({
        ...eventFields,
        version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_VERSION,
        sourceKind: selected.stimulus.sourceKind,
        targetSpecies: "brown-rat",
      } satisfies CoreEcologySettlementShadowsEvent));
    } else {
      events.push(deepFreeze({
        ...eventFields,
        version: CORE_ECOLOGY_SMALL_WORLD_VERSION,
        sourceKind: selected.stimulus.sourceKind,
        targetSpecies: population.species,
      } satisfies CoreEcologySettlementShadowsEvent));
    }
  }

  // Activity is a current environmental projection, not a relocation side
  // effect. Resolve it after any bounded movement so a pressure response is
  // applied once, while rain can still raise a chorus on a one-anchor patch
  // where redistribution is impossible.
  patch = projectPolicyDrivenActivity(patch, frame);

  return Object.freeze({ patch, events: Object.freeze(events) });
}

/** Generalized name for new consumers; the Settlement Shadows export remains compatible. */
export const canonicalizeCoreEcologySmallWorldStimulusFrame =
  canonicalizeCoreEcologySettlementShadowsStimulusFrame;
/** Generalized name for new consumers; both names execute the same deterministic kernel. */
export const stepCoreEcologySmallWorld = stepCoreEcologySettlementShadows;

/**
 * Step every aggregate owner as one deterministic source-key-ordered unit.
 * The caller derives each frame from one immutable world snapshot; this owner
 * validates every source and returns no candidate set when any member fails.
 */
export function stepCoreEcologySmallWorldSourceSet(
  value: unknown,
  atTick: unknown,
): readonly CoreEcologySmallWorldSourceStepResult[] | null {
  if (
    !Array.isArray(value)
    || value.length > CORE_ECOLOGY_SMALL_WORLD_MAX_SOURCES
    || !nonnegativeSafeInteger(atTick)
  ) return null;
  const seenSourceKeys = new Set<string>();
  const sources: CoreEcologySmallWorldSourceStepInput[] = [];
  for (const candidate of value) {
    if (
      !plainRecord(candidate)
      || !exactKeys(candidate, ["patch", "sourceKey", "stimulusFrame"])
      || !canonicalSourceKey(candidate.sourceKey)
      || seenSourceKeys.has(candidate.sourceKey)
    ) return null;
    const patch = canonicalizeCoreEcologyAggregatePatch(candidate.patch);
    const stimulusFrame = canonicalizeCoreEcologySettlementShadowsStimulusFrame(
      candidate.stimulusFrame,
    );
    if (
      patch === null
      || patch.patchKey !== candidate.sourceKey
      || patch.updatedAtTick !== atTick
      || stimulusFrame === null
      || stimulusFrame.atTick !== atTick
    ) return null;
    seenSourceKeys.add(candidate.sourceKey);
    sources.push(Object.freeze({
      sourceKey: candidate.sourceKey,
      patch,
      stimulusFrame,
    }));
  }
  sources.sort((left, right) => compareText(left.sourceKey, right.sourceKey));

  const results: CoreEcologySmallWorldSourceStepResult[] = [];
  for (const source of sources) {
    const stepped = stepCoreEcologySettlementShadows(
      source.patch,
      atTick,
      source.stimulusFrame,
    );
    if (stepped === null) return null;
    results.push(deepFreeze({ sourceKey: source.sourceKey, ...stepped }));
  }
  return Object.freeze(results);
}

function isLegacyRatEventSourceKind(
  value: CoreEcologySettlementShadowsSourceKind,
): value is CoreEcologySettlementShadowsLegacyRatEventSourceKind {
  return LEGACY_RAT_EVENT_SOURCE_KIND_SET.has(value);
}

function projectPolicyDrivenActivity(
  patch: CoreEcologyAggregatePatchState,
  frame: CoreEcologySettlementShadowsStimulusFrame,
): CoreEcologyAggregatePatchState {
  for (const population of patch.aggregatePopulations) {
    const aggregatePolicy = coreEcologyAggregateSpeciesPolicy(population.species);
    // Existing rat and tidal activity remain byte-for-byte under their
    // established displacement/tide owners. Only explicitly opted-in policies
    // receive a current-frame baseline or perceived-pressure projection.
    if (
      aggregatePolicy.activity.baselineProjection === "preserve"
      && aggregatePolicy.activity.perceivedPressureResponse === "preserve"
    ) continue;
    let rainIntensity = 0;
    let strongestPressure: Readonly<{
      causeKind: SourcePolicy["causeKind"];
      intensity: number;
    }> | null = null;
    for (const stimulus of frame.stimuli) {
      if (stimulus.targetAggregateId !== population.aggregateId) continue;
      const intensity = stimulus.anchorInfluences.reduce((maximum, influence) => (
        Math.max(maximum, influence.intensity)
      ), 0);
      if (stimulus.sourceKind === "rain") {
        rainIntensity = Math.max(rainIntensity, intensity);
        continue;
      }
      if (stimulus.response !== "pressure") continue;
      const policy = sourcePolicy(population.species, stimulus.sourceKind);
      if (
        policy !== null
        && (strongestPressure === null || intensity > strongestPressure.intensity)
      ) {
        strongestPressure = Object.freeze({
          causeKind: policy.causeKind,
          intensity,
        });
      }
    }
    let intensity = aggregatePolicy.activity.baselineProjection === "rain-responsive"
      ? resolveCoreEcologyAggregateActivityIntensity(
          population.species,
          habitatActivityIntensity(patch, population.aggregateId),
          rainIntensity,
        )
      : population.activitySignal.intensity;
    if (
      strongestPressure !== null
      && aggregatePolicy.activity.perceivedPressureResponse === "quiet"
    ) {
      intensity = resolveCoreEcologyAggregateDisturbanceActivity(
        population.species,
        intensity,
        strongestPressure.causeKind,
        strongestPressure.intensity,
      );
    }
    const next = setCoreEcologyAggregateActivityIntensity(patch, {
      aggregateId: population.aggregateId,
      atTick: frame.atTick,
      intensity,
    });
    if (next === null) {
      throw new Error("Rain-responsive aggregate activity projection broke invariants");
    }
    patch = next;
  }
  return patch;
}

function habitatActivityIntensity(
  patch: CoreEcologyAggregatePatchState,
  aggregateId: string,
): number {
  const population = patch.aggregatePopulations.find((candidate) => (
    candidate.aggregateId === aggregateId
  ));
  if (population === undefined) {
    throw new Error("Aggregate activity projection lost its population");
  }
  const derivation = patch.derivation;
  if (!("habitat" in derivation)) return population.activitySignal.intensity;
  const analysis = derivation.habitat.populations.find((candidate) => (
    candidate.species === population.species
    && candidate.populationKey === population.populationKey
  ));
  if (analysis === undefined) {
    throw new Error("Rain-responsive aggregate is absent from its habitat derivation");
  }
  // Habitat v1 predates aggregate activity ownership. Later habitat records
  // expose the authenticated baseline directly, so inheritance follows the
  // capability instead of an ever-growing list of schema-version names.
  return "activitySignal" in analysis
    ? analysis.activitySignal.intensity
    : population.activitySignal.intensity;
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
  const targetSpecies = aggregateSpeciesForTargetId(value.targetAggregateId);
  if (targetSpecies === null) return null;
  const policy = sourcePolicy(targetSpecies, sourceKind);
  if (policy === null) return null;
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
  targetSpecies: CoreEcologyAggregateSpecies,
  anchors: readonly CoreEcologyAggregateAreaAnchor[],
  lawfulDestinations: ReadonlySet<number> | null = null,
): RelocationCandidate | null {
  const policy = sourcePolicy(targetSpecies, stimulus.sourceKind);
  if (policy === null || stimulus.response !== policy.response) return null;
  const influenceByAnchor = new Map(stimulus.anchorInfluences.map((influence) => (
    [influence.anchorOrdinal, influence.intensity] as const
  )));
  let best: RelocationCandidate | null = null;
  for (const from of anchors) {
    if (from.populationUnits === 0) continue;
    const fromInfluence = influenceByAnchor.get(from.anchorOrdinal) ?? 0;
    for (const to of anchors) {
      if (from.anchorOrdinal === to.anchorOrdinal) continue;
      if (lawfulDestinations !== null && !lawfulDestinations.has(to.anchorOrdinal)) continue;
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

function sourcePolicy(
  targetSpecies: CoreEcologyAggregateSpecies,
  sourceKind: CoreEcologySettlementShadowsSourceKind,
): SourcePolicy | null {
  const target = coreEcologyAggregateSpeciesPolicy(targetSpecies);
  if (sourceKind === "same-species") {
    return Object.freeze({
      ...STATIC_SOURCE_PROFILES["same-species"],
      response: "pressure",
    });
  }
  if (sourceKind === "rain") {
    if (!target.rainSensitive) return null;
    return Object.freeze({
      ...STATIC_SOURCE_PROFILES.rain,
      response: target.rainResponse,
    });
  }
  if (sourceKind === "exposed-food") {
    return target.exposedFoodAttraction
      ? Object.freeze({
          ...STATIC_SOURCE_PROFILES["exposed-food"],
          response: "attraction",
        })
      : null;
  }
  const sourceSpecies = coreEcologyAggregateLivingSourceSpecies(sourceKind);
  if (sourceSpecies === null) return null;
  const response = resolveCoreEcologyAggregateLivingResponse(
    targetSpecies,
    sourceSpecies,
  );
  if (response === null) return null;
  return Object.freeze({
    channels: ANIMAL_CHANNELS,
    causeKind: response.causeKind,
    response: response.response,
  });
}

function aggregateSpeciesForTargetId(
  targetAggregateId: string,
): CoreEcologyAggregateSpecies | null {
  for (const species of CORE_ECOLOGY_AGGREGATE_SPECIES) {
    if (targetAggregateId.startsWith(coreEcologyAggregateSpeciesPolicy(species).stableIdPrefix)) {
      return species;
    }
  }
  return null;
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

function canonicalSourceKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && value.trim() === value;
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
