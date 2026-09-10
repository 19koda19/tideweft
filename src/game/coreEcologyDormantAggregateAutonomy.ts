import {
  CORE_ECOLOGY_MAX_STEP_TICKS,
  advanceCoreEcologyDormantAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS,
  stepCoreEcologySmallWorld,
} from "./coreEcologySmallWorld";
import {
  CORE_ECOLOGY_TIDAL_DORMANT_MAX_CYCLE_PROBES,
  CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS,
  compactCoreEcologyDormantAggregateCycles,
  coreEcologyDormantAggregateCycleCompactionIsSafe,
  coreEcologyDormantAggregateCycleDeltasEqual,
  coreEcologyDormantAggregateCycleDisturbanceDeltas,
  coreEcologyDormantAggregateCycleShape,
  coreEcologyDormantAggregatePeriodicHistoryReplaced,
  coreEcologyPatchHasTidalTableAuthority,
  nextCoreEcologyDormantTidalOperationTick,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";

export const CORE_ECOLOGY_DORMANT_AGGREGATE_AUTONOMY_VERSION = 1 as const;
export const CORE_ECOLOGY_DORMANT_AGGREGATE_AUTONOMY_OWNER_ID =
  "game:core-ecology-dormant-aggregate-autonomy:v1" as const;

export interface AdvanceCoreEcologyDormantAggregateAutonomyInput {
  readonly atTick: number;
}

/**
 * Replays the no-exogenous-input aggregate baseline in runtime order:
 * authoritative clock, tide, then the shared empty-frame small-world response.
 * Only due policy/safety ticks are visited, and proven periodic cycles compact
 * without changing retained evidence, disturbance ordinals, or population.
 */
export function advanceCoreEcologyDormantAggregateAutonomy(
  patchValue: unknown,
  inputValue: unknown,
): CoreEcologyAggregatePatchState | null {
  const canonical = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    canonical === null ||
    !coreEcologyPatchHasTidalTableAuthority(canonical) ||
    !plainRecord(inputValue) ||
    !exactKeys(inputValue, ["atTick"]) ||
    !nonnegativeSafeInteger(inputValue.atTick) ||
    inputValue.atTick < canonical.updatedAtTick ||
    inputValue.atTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
  ) {
    return null;
  }
  const targetTick = inputValue.atTick;
  if (canonical.updatedAtTick === targetTick) return canonical;

  let patch = canonical;
  const phase = patch.updatedAtTick % CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS;
  const alignmentTick =
    phase === 0
      ? patch.updatedAtTick
      : patch.updatedAtTick + (CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS - phase);
  if (alignmentTick >= targetTick) {
    return replayCoreEcologyDormantAggregateAutonomy(patch, targetTick);
  }
  const aligned = replayCoreEcologyDormantAggregateAutonomy(
    patch,
    alignmentTick,
  );
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
      const next = replayCoreEcologyDormantAggregateAutonomy(
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
        const next = replayCoreEcologyDormantAggregateAutonomy(
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
    const replayed = replayCoreEcologyDormantAggregateAutonomy(
      patch,
      patch.updatedAtTick + CORE_ECOLOGY_TIDAL_REPLAY_CYCLE_TICKS,
    );
    if (replayed === null) return null;
    patch = replayed;
    completeCycles -= 1;
  }
  return replayCoreEcologyDormantAggregateAutonomy(patch, targetTick);
}

function replayCoreEcologyDormantAggregateAutonomy(
  initial: CoreEcologyAggregatePatchState,
  targetTick: number,
): CoreEcologyAggregatePatchState | null {
  let patch = initial;
  while (patch.updatedAtTick < targetTick) {
    const tidalTick = nextCoreEcologyDormantTidalOperationTick(
      patch,
      targetTick,
    );
    if (tidalTick === null) return null;
    const remainder =
      patch.updatedAtTick % CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS;
    const smallWorldTick =
      patch.updatedAtTick +
      (remainder === 0
        ? CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS
        : CORE_ECOLOGY_SETTLEMENT_SHADOWS_CADENCE_TICKS - remainder);
    const nextTick = Math.min(targetTick, tidalTick, smallWorldTick);
    const clocked = advanceCoreEcologyDormantAggregatePatch(patch, {
      atTick: nextTick,
    });
    if (clocked === null) return null;
    const tidal = stepCoreEcologyTidalTable(clocked, { atTick: nextTick });
    if (tidal === null) return null;
    const smallWorld = stepCoreEcologySmallWorld(tidal.patch, nextTick);
    if (smallWorld === null) return null;
    patch = smallWorld.patch;
  }
  return patch;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return (
    keys.length === sorted.length &&
    keys.every((key, index) => key === sorted[index])
  );
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0)
  );
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
