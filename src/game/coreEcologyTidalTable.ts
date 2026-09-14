import { tideAtTick } from "../sim/terrain";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE,
  CORE_ECOLOGY_MAX_STEP_TICKS,
  advanceCoreEcologyDormantAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  markCoreEcologyAggregateTidalRedistribution,
  setCoreEcologyAggregateActivityIntensity,
  type CoreEcologyAggregateDisturbance,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyAggregatePopulationState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH,
  CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH,
} from "./coreEcologyHabitat";
import {
  CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
  canonicalizeCoreEcologyBreadthHabitat,
} from "./coreEcologyBreadthHabitat";
import {
  CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES,
  coreEcologyTidalAnchorActivityUsable,
  coreEcologyTidalEvacuationDestinationOrdinal,
  coreEcologyTidalRedistributionIsDue,
  resolveCoreEcologyTidalAggregateActivity,
  resolveCoreEcologyTidalRedistribution,
  type CoreEcologyTidalAggregateSpecies,
} from "./coreEcologyTidalAggregatePolicy";
import type { WorldPosition } from "./worldPosition";

export type { CoreEcologyTidalAggregateSpecies } from "./coreEcologyTidalAggregatePolicy";

export const CORE_ECOLOGY_TIDAL_TABLE_VERSION = 1 as const;
export const CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID =
  "game:core-ecology-tidal-table:v1" as const;
/** Four anchovy-school plus four ghost-crab anchors in one breadth patch. */
export const CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS = 8 as const;
/**
 * Maximum number of tide cycles needed to prove that an aggregate-only patch
 * has entered a repeatable physical cycle before dormant reconciliation fails
 * closed. This bounds discovery independently of elapsed world time.
 */
export const CORE_ECOLOGY_TIDAL_DORMANT_MAX_CYCLE_PROBES = 32 as const;
const EGRET_PREFERRED_WADING_DEPTH = 34_000;
export const CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS =
  deriveTidalReplayCycleTicks();

/** A local depth derived from saved baseline elevation plus authoritative tide. */
export interface CoreEcologyTidalAnchorDepth {
  readonly aggregateId: string;
  readonly species: CoreEcologyTidalAggregateSpecies;
  readonly anchorOrdinal: number;
  readonly position: WorldPosition;
  readonly elevation: number;
  readonly waterDepth: number;
  readonly activityUsable: boolean;
}

export interface CoreEcologySnowyEgretTidalTarget {
  readonly purpose: "wading" | "refuge";
  readonly targetAnchorOrdinal: number;
  readonly targetPosition: WorldPosition;
  readonly waterDepth: number;
}

export interface CoreEcologySnowyEgretTidalActivity {
  readonly actorId: string;
  /** Every currently depth-safe, authenticated wading anchor in stable preference order. */
  readonly wadingTargets: readonly CoreEcologySnowyEgretTidalTarget[];
  /** Null means the current tide exposes no depth-safe feeding edge. */
  readonly wadingTarget: CoreEcologySnowyEgretTidalTarget | null;
  /** Every extant egret owns one authenticated, dry high-tide refuge. */
  readonly refugeTarget: CoreEcologySnowyEgretTidalTarget;
}

export interface CoreEcologyTidalAggregateActivity {
  readonly aggregateId: string;
  readonly species: CoreEcologyTidalAggregateSpecies;
  /** Target-tick activity derived from live tide, never the prior saved signal. */
  readonly intensity: number;
}

export interface CoreEcologyTidalTableProjection {
  readonly version: typeof CORE_ECOLOGY_TIDAL_TABLE_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID;
  readonly atTick: number;
  readonly tide: Readonly<{
    readonly phase: number;
    readonly level: number;
    readonly direction: -1 | 1;
  }>;
  readonly anchorDepths: readonly CoreEcologyTidalAnchorDepth[];
  readonly aggregateActivities: readonly CoreEcologyTidalAggregateActivity[];
  readonly snowyEgret: CoreEcologySnowyEgretTidalActivity | null;
}

export interface StepCoreEcologyTidalTableInput {
  /** Must equal the patch clock; no caller-supplied depth or tide is accepted. */
  readonly atTick: number;
}

export interface AdvanceCoreEcologyDormantTidalTableInput {
  /** The authoritative re-entry clock; caller-authored tide is never accepted. */
  readonly atTick: number;
}

export interface CoreEcologyTidalTableStepResult {
  readonly version: typeof CORE_ECOLOGY_TIDAL_TABLE_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly projection: CoreEcologyTidalTableProjection;
  readonly redistributions: readonly CoreEcologyAggregateDisturbance[];
  readonly mortality: "none";
  readonly cargoInteraction: false;
  readonly itemConsumption: "none";
}

interface CoreEcologyTidalHabitatPopulationLike {
  readonly species: string;
  readonly populationKey: string;
  readonly populationUnits: number;
  readonly activitySignal: Readonly<{ readonly intensity: number }>;
}

interface CoreEcologyTidalHabitatAnchorLike {
  readonly species: string;
  readonly purpose: string;
  readonly anchorOrdinal: number;
  readonly position: WorldPosition;
  readonly elevation: number;
}

interface CoreEcologyTidalHabitatAdapter {
  readonly populations: readonly CoreEcologyTidalHabitatPopulationLike[];
  readonly tidalAnchors: readonly CoreEcologyTidalHabitatAnchorLike[];
  /** Legacy habitat families own the snowy-egret wading/refuge contract. */
  readonly snowyEgretAuthority: boolean;
}

/**
 * Reports whether a canonical patch owns the saved elevation/anchor metadata
 * required by the tidal-table transaction. Regional habitat v1 has a compact
 * non-tidal schema, settlement-home v1 owns only its domestic/rat subset, and
 * a receipt-bound legacy cohort may carry no habitat. Generic stepping should
 * preserve those patches unchanged rather than interpreting non-applicability
 * as invalid tidal state.
 */
export function coreEcologyPatchHasTidalTableAuthority(
  patchValue: unknown,
): boolean {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  return patch !== null && coreEcologyTidalHabitatAdapter(patch) !== null;
}

/**
 * Projects current local depths from canonical tidal-habitat elevation metadata.
 * Camera, player position, reported knowledge, and caller-authored water values
 * never participate. The same projection drives simulation and presentation.
 */
export function projectCoreEcologyTidalTable(
  patchValue: unknown,
  atTickValue: unknown,
): CoreEcologyTidalTableProjection | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    patch === null ||
    !nonnegativeSafeInteger(atTickValue) ||
    atTickValue < patch.updatedAtTick ||
    atTickValue - patch.updatedAtTick > CORE_ECOLOGY_MAX_STEP_TICKS
  )
    return null;
  const habitat = coreEcologyTidalHabitatAdapter(patch);
  if (habitat === null) return null;
  const tide = tideAtTick(atTickValue);
  const anchorDepths: CoreEcologyTidalAnchorDepth[] = [];
  for (const { species } of CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES) {
    const population = patch.aggregatePopulations.find(
      (candidate) => candidate.species === species,
    );
    const metadata = habitat.tidalAnchors.filter(
      (anchor) => anchor.species === species && anchor.purpose === "population",
    );
    if (population === undefined) {
      if (metadata.length !== 0) return null;
      continue;
    }
    if (metadata.length !== population.anchors.length) return null;
    for (const anchor of population.anchors) {
      const saved = metadata[anchor.anchorOrdinal];
      if (
        saved === undefined ||
        saved.anchorOrdinal !== anchor.anchorOrdinal ||
        !samePosition(saved.position, anchor.position)
      )
        return null;
      const waterDepth = Math.max(0, tide.level - saved.elevation);
      anchorDepths.push(
        Object.freeze({
          aggregateId: population.aggregateId,
          species,
          anchorOrdinal: anchor.anchorOrdinal,
          position: saved.position,
          elevation: saved.elevation,
          waterDepth,
          activityUsable: coreEcologyTidalAnchorActivityUsable(
            species,
            waterDepth,
          ),
        }),
      );
    }
  }
  if (anchorDepths.length > CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS)
    return null;
  anchorDepths.sort(compareDepthAddress);
  const aggregateActivities = projectAggregateActivities(
    patch,
    habitat,
    anchorDepths,
    tide.direction,
  );
  if (aggregateActivities === null) return null;
  const snowyEgret = projectSnowyEgretTidalActivity(patch, habitat, tide.level);
  if (snowyEgret === undefined) return null;
  return deepFreeze({
    version: CORE_ECOLOGY_TIDAL_TABLE_VERSION,
    ownerId: CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID,
    atTick: atTickValue,
    tide,
    anchorDepths,
    aggregateActivities,
    snowyEgret,
  });
}

/**
 * Applies live tide to stable population identity. Dry fish anchors evacuate
 * immediately; ordinary ebb/flood redistribution remains gradual and bounded.
 * The transaction can move only extant units among saved anchors and cannot
 * create actors, deaths, items, or cargo effects.
 */
export function stepCoreEcologyTidalTable(
  patchValue: unknown,
  inputValue: unknown,
): CoreEcologyTidalTableStepResult | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    patch === null ||
    !plainRecord(inputValue) ||
    !exactKeys(inputValue, ["atTick"]) ||
    !nonnegativeSafeInteger(inputValue.atTick) ||
    inputValue.atTick !== patch.updatedAtTick
  )
    return null;
  const projection = projectCoreEcologyTidalTable(patch, inputValue.atTick);
  if (projection === null) return null;
  const habitat = coreEcologyTidalHabitatAdapter(patch);
  if (habitat === null) return null;
  const tideReference = `tidal-table:v1:${projection.tide.phase.toString(36)}:${
    projection.tide.direction > 0 ? "rising" : "falling"
  }`;
  let nextPatch = patch;
  const redistributions: CoreEcologyAggregateDisturbance[] = [];

  for (const policy of CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES) {
    const initialPopulation = nextPatch.aggregatePopulations.find(
      ({ species }) => species === policy.species,
    );
    const redistribution = policy.redistribution;
    if (initialPopulation === undefined || redistribution === null) continue;
    const populationDepths = projection.anchorDepths.filter(
      ({ aggregateId }) => aggregateId === initialPopulation.aggregateId,
    );
    const refugeOrdinal = coreEcologyTidalEvacuationDestinationOrdinal(
      policy.species,
      populationDepths,
    );
    const drySources = populationDepths
      .filter(
        ({ waterDepth, anchorOrdinal }) =>
          !coreEcologyTidalAnchorActivityUsable(policy.species, waterDepth) &&
          (initialPopulation.anchors[anchorOrdinal]?.populationUnits ?? 0) > 0,
      )
      .sort((left, right) => left.anchorOrdinal - right.anchorOrdinal);
    if (refugeOrdinal === null && drySources.length > 0) return null;
    for (const source of drySources) {
      if (refugeOrdinal === null) return null;
      const current = nextPatch.aggregatePopulations.find(
        ({ aggregateId }) => aggregateId === initialPopulation.aggregateId,
      );
      const units =
        current?.anchors[source.anchorOrdinal]?.populationUnits ?? 0;
      if (units === 0) continue;
      const displaced = displaceCoreEcologyAggregatePopulation(nextPatch, {
        aggregateId: initialPopulation.aggregateId,
        atTick: inputValue.atTick,
        causeKind: "tide-pressure",
        causeReferenceId: `${tideReference}:evacuate-${source.anchorOrdinal.toString(36)}`,
        fromAnchorOrdinal: source.anchorOrdinal,
        toAnchorOrdinal: refugeOrdinal,
        populationUnits: units,
        pressure: redistribution.evacuationPressure,
      });
      if (displaced === null) return null;
      nextPatch = displaced.patch;
      redistributions.push(displaced.disturbance);
    }

    const currentPopulation = nextPatch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === initialPopulation.aggregateId,
    );
    if (
      currentPopulation !== undefined &&
      coreEcologyTidalRedistributionIsDue(
        policy.species,
        inputValue.atTick,
        currentPopulation.lastTidalRedistributionTick,
      )
    ) {
      const relocation = resolveCoreEcologyTidalRedistribution(
        policy.species,
        currentPopulation,
        populationDepths,
        projection.tide.direction,
      );
      if (relocation !== null) {
        const displaced = displaceCoreEcologyAggregatePopulation(nextPatch, {
          aggregateId: currentPopulation.aggregateId,
          atTick: inputValue.atTick,
          causeKind: "tide-pressure",
          causeReferenceId: `${tideReference}:edge`,
          fromAnchorOrdinal: relocation.fromAnchorOrdinal,
          toAnchorOrdinal: relocation.toAnchorOrdinal,
          populationUnits: relocation.populationUnits,
          pressure: relocation.pressure,
        });
        if (displaced === null) return null;
        nextPatch = displaced.patch;
        redistributions.push(displaced.disturbance);
      }
      const marked = markCoreEcologyAggregateTidalRedistribution(nextPatch, {
        aggregateId: currentPopulation.aggregateId,
        atTick: inputValue.atTick,
      });
      if (marked === null) return null;
      nextPatch = marked;
    }
  }

  for (const { species } of CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES) {
    const population = nextPatch.aggregatePopulations.find(
      (candidate) => candidate.species === species,
    );
    if (population === undefined) continue;
    const habitatPopulation = habitat.populations.find(
      (analysis) =>
        analysis.species === species &&
        analysis.populationKey === population.populationKey,
    );
    if (habitatPopulation === undefined || habitatPopulation.populationUnits === 0) {
      return null;
    }
    const depths = projection.anchorDepths.filter(
      ({ aggregateId }) => aggregateId === population.aggregateId,
    );
    const averageDepth = populationWeightedDepth(population, depths);
    if (averageDepth === null) return null;
    const intensity = resolveCoreEcologyTidalAggregateActivity(
      species,
      habitatPopulation.activitySignal.intensity,
      averageDepth,
      projection.tide.direction,
      depths.some(
        ({ waterDepth, anchorOrdinal }) =>
          coreEcologyTidalAnchorActivityUsable(species, waterDepth) &&
          (population.anchors[anchorOrdinal]?.populationUnits ?? 0) > 0,
      ),
    );
    if (intensity === null) return null;
    const updated = setCoreEcologyAggregateActivityIntensity(nextPatch, {
      aggregateId: population.aggregateId,
      atTick: inputValue.atTick,
      intensity,
    });
    if (updated === null) return null;
    nextPatch = updated;
  }

  // The step result is an atomic view of the state it returns. Redistribution
  // can change the population-weighted depth used by activity, so the initial
  // projection is only suitable for making this tick's decisions. Reproject
  // the committed patch before exposing it to runtime or presentation.
  const committedProjection = projectCoreEcologyTidalTable(
    nextPatch,
    inputValue.atTick,
  );
  if (committedProjection === null) return null;

  return Object.freeze({
    version: CORE_ECOLOGY_TIDAL_TABLE_VERSION,
    ownerId: CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID,
    patch: nextPatch,
    projection: committedProjection,
    redistributions: Object.freeze(redistributions),
    mortality: "none",
    cargoInteraction: false,
    itemConsumption: "none",
  });
}

/**
 * Reconciles an unloaded aggregate patch through the same authoritative tidal
 * opportunities it would have received while continuously resident. Ticks
 * with no possible evacuation or policy cadence are skipped because they can
 * only overwrite the final activity clock. Long aggregate-only intervals are
 * compacted after a repeatable physical tide cycle is proven; bounded history,
 * durable ordinals, and operation clocks are translated with that cycle.
 */
export function advanceCoreEcologyDormantTidalTable(
  patchValue: unknown,
  inputValue: unknown,
): CoreEcologyAggregatePatchState | null {
  const canonical = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    canonical === null ||
    coreEcologyTidalHabitatAdapter(canonical) === null ||
    !plainRecord(inputValue) ||
    !exactKeys(inputValue, ["atTick"]) ||
    !nonnegativeSafeInteger(inputValue.atTick) ||
    inputValue.atTick < canonical.updatedAtTick ||
    inputValue.atTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
  ) {
    return null;
  }
  const initialStep = stepCoreEcologyTidalTable(canonical, {
    atTick: canonical.updatedAtTick,
  });
  if (initialStep === null) return null;
  let patch: CoreEcologyAggregatePatchState = initialStep.patch;
  const targetTick = inputValue.atTick;
  if (patch.updatedAtTick === targetTick) return patch;

  const phase = tideAtTick(patch.updatedAtTick).phase;
  const alignmentTick =
    phase === 0
      ? patch.updatedAtTick
      : patch.updatedAtTick + (CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS - phase);
  if (alignmentTick >= targetTick) {
    return replayDormantTidalOperations(patch, targetTick);
  }
  const aligned = replayDormantTidalOperations(patch, alignmentTick);
  if (aligned === null) return null;
  patch = aligned;

  let completeCycles = Math.floor(
    (targetTick - alignmentTick) / CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS,
  );
  if (
    completeCycles > 0 &&
    coreEcologyDormantAggregateCycleCompactionIsSafe(patch)
  ) {
    let previous = patch;
    let previousShape = coreEcologyDormantAggregateCycleShape(previous);
    let periodicStart: CoreEcologyAggregatePatchState | null = null;
    let cycleDeltas: ReadonlyMap<string, number> | null = null;
    let probes = 0;
    while (
      completeCycles > 0 &&
      probes < CORE_ECOLOGY_TIDAL_DORMANT_MAX_CYCLE_PROBES
    ) {
      const next = replayDormantTidalOperations(
        previous,
        previous.updatedAtTick + CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS,
      );
      if (next === null) return null;
      completeCycles -= 1;
      probes += 1;
      const shape = coreEcologyDormantAggregateCycleShape(next);
      if (shape === previousShape) {
        periodicStart = previous;
        cycleDeltas = coreEcologyDormantAggregateCycleDisturbanceDeltas(
          previous,
          next,
        );
        if (cycleDeltas === null) return null;
        patch = next;
        break;
      }
      previous = next;
      previousShape = shape;
      patch = next;
    }

    if (periodicStart !== null && cycleDeltas !== null) {
      while (
        completeCycles > 0 &&
        !coreEcologyDormantAggregatePeriodicHistoryReplaced(
          periodicStart,
          patch,
          cycleDeltas,
        )
      ) {
        const next = replayDormantTidalOperations(
          patch,
          patch.updatedAtTick + CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS,
        );
        if (
          next === null ||
          coreEcologyDormantAggregateCycleShape(next) !==
            coreEcologyDormantAggregateCycleShape(patch) ||
          !coreEcologyDormantAggregateCycleDeltasEqual(
            cycleDeltas,
            coreEcologyDormantAggregateCycleDisturbanceDeltas(patch, next),
          )
        ) {
          return null;
        }
        patch = next;
        completeCycles -= 1;
      }
      if (
        completeCycles > 0 &&
        coreEcologyDormantAggregatePeriodicHistoryReplaced(
          periodicStart,
          patch,
          cycleDeltas,
        )
      ) {
        const compacted = compactCoreEcologyDormantAggregateCycles(
          patch,
          periodicStart,
          completeCycles,
          cycleDeltas,
        );
        if (compacted === null) return null;
        patch = compacted;
        completeCycles = 0;
      }
    }
  }

  while (completeCycles > 0) {
    const replayed = replayDormantTidalOperations(
      patch,
      patch.updatedAtTick + CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS,
    );
    if (replayed === null) return null;
    patch = replayed;
    completeCycles -= 1;
  }
  return replayDormantTidalOperations(patch, targetTick);
}

function replayDormantTidalOperations(
  initial: CoreEcologyAggregatePatchState,
  targetTick: number,
): CoreEcologyAggregatePatchState | null {
  let patch = initial;
  while (patch.updatedAtTick < targetTick) {
    const nextTick = nextCoreEcologyDormantTidalOperationTick(
      patch,
      targetTick,
    );
    if (nextTick === null) return null;
    const advanced = advanceCoreEcologyDormantAggregatePatch(patch, {
      atTick: nextTick,
    });
    if (advanced === null) return null;
    const tidal = stepCoreEcologyTidalTable(advanced, { atTick: nextTick });
    if (tidal === null) return null;
    patch = tidal.patch;
  }
  return patch;
}

export function nextCoreEcologyDormantTidalOperationTick(
  patch: CoreEcologyAggregatePatchState,
  targetTick: number,
): number | null {
  if (
    coreEcologyTidalHabitatAdapter(patch) === null
    || targetTick <= patch.updatedAtTick
  ) {
    return null;
  }
  let nextTick = targetTick;
  let ownsRedistribution = false;
  for (const population of patch.aggregatePopulations) {
    const redistribution = CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES.find(
      ({ species }) => species === population.species,
    )?.redistribution;
    if (redistribution === null || redistribution === undefined) continue;
    ownsRedistribution = true;
    const remainder = patch.updatedAtTick % redistribution.cadenceTicks;
    const cadenceTick =
      patch.updatedAtTick +
      (remainder === 0
        ? redistribution.cadenceTicks
        : redistribution.cadenceTicks - remainder);
    nextTick = Math.min(nextTick, cadenceTick);
  }
  if (!ownsRedistribution) return nextTick;
  nextTick = Math.min(
    nextTick,
    patch.updatedAtTick + CORE_ECOLOGY_MAX_STEP_TICKS,
  );
  for (let tick = patch.updatedAtTick + 1; tick <= nextTick; tick += 1) {
    if (patchHasOccupiedUnusableTidalAnchorAtTick(patch, tick)) return tick;
  }
  return nextTick;
}

function patchHasOccupiedUnusableTidalAnchorAtTick(
  patch: CoreEcologyAggregatePatchState,
  atTick: number,
): boolean {
  const habitat = coreEcologyTidalHabitatAdapter(patch);
  if (habitat === null) return true;
  const tide = tideAtTick(atTick);
  for (const population of patch.aggregatePopulations) {
    const policy = CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES.find(
      ({ species }) => species === population.species,
    );
    if (policy?.redistribution?.evacuateUnusableAnchors !== true) continue;
    const resolved = population.anchors.map((anchor) => {
      const saved = habitat.tidalAnchors.find(
        (candidate) =>
          candidate.species === population.species &&
          candidate.purpose === "population" &&
          candidate.anchorOrdinal === anchor.anchorOrdinal,
      );
      const usable = saved !== undefined
        && samePosition(saved.position, anchor.position)
        && coreEcologyTidalAnchorActivityUsable(
          population.species,
          Math.max(0, tide.level - saved.elevation),
        );
      return { anchor, saved, usable };
    });
    for (const { anchor, saved, usable } of resolved) {
      if (anchor.populationUnits === 0) continue;
      if (
        saved === undefined ||
        !samePosition(saved.position, anchor.position) ||
        !usable
      ) {
        return true;
      }
    }
  }
  return false;
}

export function coreEcologyDormantAggregateCycleCompactionIsSafe(
  patch: CoreEcologyAggregatePatchState,
): boolean {
  return (
    patch.populations.length === 0 &&
    patch.groups.groups.length === 0 &&
    patch.mortalityTransactions.length === 0 &&
    patch.carcasses.length === 0
  );
}

export function coreEcologyDormantAggregateCycleShape(
  patch: CoreEcologyAggregatePatchState,
): string {
  return JSON.stringify(
    patch.aggregatePopulations.map((population) => ({
      aggregateId: population.aggregateId,
      populationSize: population.populationSize,
      anchors: population.anchors.map(({ anchorOrdinal, populationUnits }) => ({
        anchorOrdinal,
        populationUnits,
      })),
      activityIntensity: population.activitySignal.intensity,
      lastTidalRedistributionPhase:
        population.lastTidalRedistributionTick === null
          ? null
          : tideAtTick(population.lastTidalRedistributionTick).phase,
    })),
  );
}

export function coreEcologyDormantAggregateCycleDisturbanceDeltas(
  before: CoreEcologyAggregatePatchState,
  after: CoreEcologyAggregatePatchState,
): ReadonlyMap<string, number> | null {
  if (
    before.aggregatePopulations.length !== after.aggregatePopulations.length
  ) {
    return null;
  }
  const deltas = new Map<string, number>();
  for (const population of before.aggregatePopulations) {
    const next = after.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === population.aggregateId,
    );
    if (
      next === undefined ||
      next.nextDisturbanceOrdinal < population.nextDisturbanceOrdinal
    ) {
      return null;
    }
    deltas.set(
      population.aggregateId,
      next.nextDisturbanceOrdinal - population.nextDisturbanceOrdinal,
    );
  }
  return deltas;
}

export function coreEcologyDormantAggregateCycleDeltasEqual(
  expected: ReadonlyMap<string, number>,
  candidate: ReadonlyMap<string, number> | null,
): boolean {
  if (candidate === null || candidate.size !== expected.size) return false;
  for (const [aggregateId, delta] of expected) {
    if (candidate.get(aggregateId) !== delta) return false;
  }
  return true;
}

export function coreEcologyDormantAggregatePeriodicHistoryReplaced(
  periodicStart: CoreEcologyAggregatePatchState,
  current: CoreEcologyAggregatePatchState,
  deltas: ReadonlyMap<string, number>,
): boolean {
  for (const population of current.aggregatePopulations) {
    const delta = deltas.get(population.aggregateId);
    const start = periodicStart.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === population.aggregateId,
    );
    if (delta === undefined || start === undefined) return false;
    if (delta === 0) continue;
    if (
      population.nextDisturbanceOrdinal - start.nextDisturbanceOrdinal <
      CORE_ECOLOGY_MAX_AGGREGATE_EVIDENCE
    ) {
      return false;
    }
    if (
      population.disturbances.some(
        ({ disturbanceOrdinal }) =>
          disturbanceOrdinal < start.nextDisturbanceOrdinal,
      ) ||
      population.evidence.some(
        ({ evidenceOrdinal }) => evidenceOrdinal < start.nextEvidenceOrdinal,
      )
    ) {
      return false;
    }
  }
  return true;
}

export function compactCoreEcologyDormantAggregateCycles(
  patch: CoreEcologyAggregatePatchState,
  periodicStart: CoreEcologyAggregatePatchState,
  cycleCount: number,
  deltas: ReadonlyMap<string, number>,
): CoreEcologyAggregatePatchState | null {
  if (
    !positiveSafeInteger(cycleCount) ||
    !coreEcologyDormantAggregateCycleCompactionIsSafe(patch)
  ) {
    return null;
  }
  const tickShift = cycleCount * CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS;
  const updatedAtTick = patch.updatedAtTick + tickShift;
  if (
    !Number.isSafeInteger(tickShift) ||
    !nonnegativeSafeInteger(updatedAtTick) ||
    updatedAtTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
  ) {
    return null;
  }
  const aggregatePopulations = patch.aggregatePopulations.map((population) => {
    const delta = deltas.get(population.aggregateId);
    const start = periodicStart.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === population.aggregateId,
    );
    if (delta === undefined || start === undefined) return null;
    const ordinalShift = delta * cycleCount;
    if (
      !Number.isSafeInteger(ordinalShift) ||
      !Number.isSafeInteger(population.nextDisturbanceOrdinal + ordinalShift) ||
      !Number.isSafeInteger(population.nextEvidenceOrdinal + ordinalShift)
    ) {
      return null;
    }
    if (
      delta > 0 &&
      (population.disturbances.some(
        ({ disturbanceOrdinal }) =>
          disturbanceOrdinal < start.nextDisturbanceOrdinal,
      ) ||
        population.evidence.some(
          ({ evidenceOrdinal }) => evidenceOrdinal < start.nextEvidenceOrdinal,
        ))
    ) {
      return null;
    }
    return {
      ...population,
      revision: population.revision + ordinalShift,
      updatedAtTick,
      activitySignal: {
        ...population.activitySignal,
        updatedAtTick,
      },
      evidence:
        delta === 0
          ? population.evidence
          : population.evidence.map((evidence) => {
              const evidenceOrdinal = evidence.evidenceOrdinal + ordinalShift;
              return {
                ...evidence,
                evidenceId: `${population.aggregateId}:evidence:${evidenceOrdinal.toString(36)}`,
                evidenceOrdinal,
                createdAtTick: evidence.createdAtTick + tickShift,
              };
            }),
      disturbances:
        delta === 0
          ? population.disturbances
          : population.disturbances.map((disturbance) => {
              const disturbanceOrdinal =
                disturbance.disturbanceOrdinal + ordinalShift;
              return {
                ...disturbance,
                disturbanceId: `${population.aggregateId}:disturbance:${disturbanceOrdinal.toString(36)}`,
                disturbanceOrdinal,
                atTick: disturbance.atTick + tickShift,
              };
            }),
      lastTidalRedistributionTick:
        population.lastTidalRedistributionTick === null
          ? null
          : population.lastTidalRedistributionTick + tickShift,
      nextEvidenceOrdinal: population.nextEvidenceOrdinal + ordinalShift,
      nextDisturbanceOrdinal: population.nextDisturbanceOrdinal + ordinalShift,
    };
  });
  if (aggregatePopulations.some((population) => population === null)) {
    return null;
  }
  return canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    updatedAtTick,
    aggregatePopulations,
  });
}

function projectSnowyEgretTidalActivity(
  patch: CoreEcologyAggregatePatchState,
  habitat: CoreEcologyTidalHabitatAdapter,
  tideLevel: number,
): CoreEcologySnowyEgretTidalActivity | null | undefined {
  if (!habitat.snowyEgretAuthority) return null;
  const population = patch.populations.find(
    ({ species }) => species === "snowy-egret",
  );
  const habitatPopulation = habitat.populations.find(
    ({ species }) => species === "snowy-egret",
  );
  const anchors = habitat.tidalAnchors.filter(
    ({ species }) => species === "snowy-egret",
  );
  if (population === undefined) {
    return (habitatPopulation === undefined ||
      habitatPopulation.populationUnits === 0) &&
      anchors.length === 0
      ? null
      : undefined;
  }
  const actor = population.members[0]?.actor;
  if (
    habitatPopulation === undefined ||
    habitatPopulation.populationUnits !== 1 ||
    population.populationSize !== 1 ||
    population.members.length !== 1 ||
    actor === undefined
  )
    return undefined;
  const wadingTargets = anchors
    .filter((anchor) => anchor.purpose === "wading")
    .map((anchor) => ({
      anchor,
      waterDepth: Math.max(0, tideLevel - anchor.elevation),
    }))
    .filter(
      ({ waterDepth }) =>
        waterDepth >= CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH &&
        waterDepth <= CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH,
    )
    .sort(
      (left, right) =>
        Math.abs(left.waterDepth - EGRET_PREFERRED_WADING_DEPTH) -
          Math.abs(right.waterDepth - EGRET_PREFERRED_WADING_DEPTH) ||
        left.anchor.anchorOrdinal - right.anchor.anchorOrdinal,
    )
    .map(({ anchor, waterDepth }) =>
      Object.freeze({
        purpose: "wading" as const,
        targetAnchorOrdinal: anchor.anchorOrdinal,
        targetPosition: anchor.position,
        waterDepth,
      }),
    );
  const refuge = anchors.find((anchor) => anchor.purpose === "refuge");
  if (refuge === undefined) return undefined;
  const refugeDepth = Math.max(0, tideLevel - refuge.elevation);
  if (refugeDepth !== 0) return undefined;
  return Object.freeze({
    actorId: actor.identity.stableId,
    wadingTargets: Object.freeze(wadingTargets),
    wadingTarget: wadingTargets[0] ?? null,
    refugeTarget: Object.freeze({
      purpose: "refuge" as const,
      targetAnchorOrdinal: refuge.anchorOrdinal,
      targetPosition: refuge.position,
      waterDepth: 0,
    }),
  });
}

function projectAggregateActivities(
  patch: CoreEcologyAggregatePatchState,
  habitat: CoreEcologyTidalHabitatAdapter,
  depths: readonly CoreEcologyTidalAnchorDepth[],
  tideDirection: -1 | 1,
): readonly CoreEcologyTidalAggregateActivity[] | null {
  const activities: CoreEcologyTidalAggregateActivity[] = [];
  for (const { species } of CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES) {
    const population = patch.aggregatePopulations.find(
      (candidate) => candidate.species === species,
    );
    if (population === undefined) continue;
    const habitatPopulation = habitat.populations.find(
      (analysis) =>
        analysis.species === species &&
        analysis.populationKey === population.populationKey,
    );
    if (habitatPopulation === undefined || habitatPopulation.populationUnits === 0) {
      return null;
    }
    const populationDepths = depths.filter(
      ({ aggregateId }) => aggregateId === population.aggregateId,
    );
    const averageDepth = populationWeightedDepth(population, populationDepths);
    if (averageDepth === null) return null;
    const intensity = resolveCoreEcologyTidalAggregateActivity(
      species,
      habitatPopulation.activitySignal.intensity,
      averageDepth,
      tideDirection,
      populationDepths.some(
        ({ waterDepth, anchorOrdinal }) =>
          coreEcologyTidalAnchorActivityUsable(species, waterDepth) &&
          (population.anchors[anchorOrdinal]?.populationUnits ?? 0) > 0,
      ),
    );
    if (intensity === null) return null;
    activities.push(
      Object.freeze({
        aggregateId: population.aggregateId,
        species,
        intensity,
      }),
    );
  }
  activities.sort((left, right) =>
    compareText(left.aggregateId, right.aggregateId),
  );
  return Object.freeze(activities);
}

function populationWeightedDepth(
  population: CoreEcologyAggregatePopulationState,
  depths: readonly CoreEcologyTidalAnchorDepth[],
): number | null {
  let weighted = 0;
  let units = 0;
  for (const depth of depths) {
    const populationUnits =
      population.anchors[depth.anchorOrdinal]?.populationUnits;
    if (populationUnits === undefined) return null;
    weighted += depth.waterDepth * populationUnits;
    units += populationUnits;
  }
  return units === population.populationSize && units > 0
    ? Math.trunc(weighted / units)
    : null;
}

function compareDepthAddress(
  left: Pick<CoreEcologyTidalAnchorDepth, "aggregateId" | "anchorOrdinal">,
  right: Pick<CoreEcologyTidalAnchorDepth, "aggregateId" | "anchorOrdinal">,
): number {
  return left.aggregateId < right.aggregateId
    ? -1
    : left.aggregateId > right.aggregateId
      ? 1
      : left.anchorOrdinal - right.anchorOrdinal;
}

/**
 * Normalizes the two canonical habitat families that own tidal metadata.
 * Breadth habitats are independently re-canonicalized at this boundary so an
 * untrusted derivation cannot acquire tide authority through its kind string.
 */
function coreEcologyTidalHabitatAdapter(
  patch: CoreEcologyAggregatePatchState,
): CoreEcologyTidalHabitatAdapter | null {
  if (patch.derivation.kind === CORE_ECOLOGY_BREADTH_DERIVATION_KIND) {
    const habitat = canonicalizeCoreEcologyBreadthHabitat(
      patch.derivation.habitat,
    );
    return habitat === null
      ? null
      : Object.freeze({
          populations: habitat.populations,
          tidalAnchors: habitat.tidalAnchors,
          snowyEgretAuthority: false,
        });
  }
  if (!isLegacyTidalHabitatDerivation(patch)) return null;
  return Object.freeze({
    populations: patch.derivation.habitat.populations,
    tidalAnchors: patch.derivation.habitat.tidalAnchors,
    snowyEgretAuthority: true,
  });
}

function isLegacyTidalHabitatDerivation(
  patch: CoreEcologyAggregatePatchState,
): patch is CoreEcologyAggregatePatchState &
  Readonly<{
    derivation: Extract<
      CoreEcologyAggregatePatchState["derivation"],
      {
        readonly kind:
          | "habitat-v5"
          | "legacy-fixed-v1-with-habitat-v5"
          | "habitat-v6"
          | "legacy-fixed-v1-with-habitat-v6"
          | "habitat-v7"
          | "legacy-fixed-v1-with-habitat-v7"
          | "habitat-v8"
          | "legacy-fixed-v1-with-habitat-v8"
          | "habitat-v9"
          | "legacy-fixed-v1-with-habitat-v9"
          | "habitat-v10"
          | "legacy-fixed-v1-with-habitat-v10"
          | "habitat-v11"
          | "legacy-fixed-v1-with-habitat-v11"
          | "regional-polar-shore-v1";
      }
    >;
  }> {
  return (
    patch.derivation.kind === "habitat-v5" ||
    patch.derivation.kind === "legacy-fixed-v1-with-habitat-v5" ||
    patch.derivation.kind === "habitat-v6" ||
    patch.derivation.kind === "legacy-fixed-v1-with-habitat-v6" ||
    patch.derivation.kind === "habitat-v7" ||
    patch.derivation.kind === "legacy-fixed-v1-with-habitat-v7" ||
    patch.derivation.kind === "habitat-v8" ||
    patch.derivation.kind === "legacy-fixed-v1-with-habitat-v8" ||
    patch.derivation.kind === "habitat-v9" ||
    patch.derivation.kind === "legacy-fixed-v1-with-habitat-v9" ||
    patch.derivation.kind === "habitat-v10" ||
    patch.derivation.kind === "legacy-fixed-v1-with-habitat-v10" ||
    patch.derivation.kind === "habitat-v11" ||
    patch.derivation.kind === "legacy-fixed-v1-with-habitat-v11" ||
    patch.derivation.kind === "regional-polar-shore-v1"
  );
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return (
    left.region.x === right.region.x &&
    left.region.y === right.region.y &&
    left.localX === right.localX &&
    left.localY === right.localY
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deriveTidalReplayCycleTicks(): number {
  const origin = tideAtTick(0);
  for (let tick = 1; tick <= 10_000; tick += 1) {
    const candidate = tideAtTick(tick);
    if (
      candidate.phase === origin.phase &&
      candidate.level === origin.level &&
      candidate.direction === origin.direction
    ) {
      return tick;
    }
  }
  throw new Error("Authoritative tide has no bounded replay cycle");
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0)
  );
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return Object.freeze(value);
}
