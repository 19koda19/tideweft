import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  deriveCoreEcologyMaterializationUnits,
  type CoreEcologyMaterializationUnit,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";

export const REGIONAL_ECOLOGY_RUNTIME_VERSION = 1 as const;

export interface RegionalEcologyResidentPatch {
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface RegionalEcologyMaterializationUnit
  extends CoreEcologyMaterializationUnit {
  readonly sourceKey: string;
}

export interface RegionalEcologyMaterializationCommand {
  readonly sourceKey: string;
  readonly actorIds: readonly string[];
}

interface RegionalEcologyMaterializationReceiptEntry {
  readonly sourceKey: string;
  readonly sourcePatch: CoreEcologyAggregatePatchState;
  readonly projectedPatch: CoreEcologyAggregatePatchState;
}

interface RegionalEcologyMaterializationReceipt {
  readonly atTick: number;
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  readonly sourceCount: number;
  readonly entriesBySource: ReadonlyMap<
    string,
    RegionalEcologyMaterializationReceiptEntry
  >;
}

/**
 * A receipt authenticates only the exact frozen output array minted by the
 * atomic planner below. It is deliberately process-local and weakly held: it
 * is neither projection data nor save authority.
 */
const MATERIALIZATION_RECEIPTS = new WeakMap<
  readonly RegionalEcologyResidentPatch[],
  RegionalEcologyMaterializationReceipt
>();

/**
 * Select one group-atomic actor set across every resident ecology owner. The
 * presentation ceiling is global: loading another region never grants it a
 * second independent allowance of materialized bodies.
 */
export function deriveRegionalEcologyMaterializationPlan(
  residentsValue: readonly RegionalEcologyResidentPatch[],
  window: CoreEcologyRuntimeWindow,
): readonly RegionalEcologyMaterializationCommand[] | null {
  if (!Array.isArray(residentsValue)) return null;

  const sourceKeys = new Set<string>();
  const actorOwners = new Set<string>();
  const candidates: RegionalEcologyMaterializationUnit[] = [];
  const residentKeys: string[] = [];

  for (const residentValue of residentsValue) {
    if (
      residentValue === null
      || typeof residentValue !== "object"
      || Array.isArray(residentValue)
      || !canonicalSourceKey(residentValue.sourceKey)
      || sourceKeys.has(residentValue.sourceKey)
    ) return null;
    const patch = canonicalizeCoreEcologyAggregatePatch(residentValue.patch);
    if (patch === null || patch.patchKey !== residentValue.sourceKey) return null;
    sourceKeys.add(residentValue.sourceKey);
    residentKeys.push(residentValue.sourceKey);

    for (const population of patch.populations) {
      for (const member of population.members) {
        const actorId = member.actor.identity.stableId;
        if (actorOwners.has(actorId)) return null;
        actorOwners.add(actorId);
      }
    }

    const units = deriveCoreEcologyMaterializationUnits(patch, window);
    if (units === null) return null;
    for (const unit of units) {
      candidates.push(Object.freeze({
        ...unit,
        sourceKey: residentValue.sourceKey,
      }));
    }
  }

  candidates.sort(compareRegionalUnit);
  const selectedBySource = new Map<string, string[]>(
    residentKeys.map((sourceKey) => [sourceKey, []]),
  );
  let admitted = 0;
  for (const candidate of candidates) {
    if (candidate.actorIds.length > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS - admitted) {
      continue;
    }
    const selected = selectedBySource.get(candidate.sourceKey);
    if (selected === undefined) return null;
    selected.push(...candidate.actorIds);
    admitted += candidate.actorIds.length;
    if (admitted === CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS) break;
  }

  return Object.freeze([...selectedBySource]
    .sort(([left], [right]) => compareText(left, right))
    .map(([sourceKey, actorIds]) => Object.freeze({
      sourceKey,
      actorIds: Object.freeze(actorIds.sort(compareText)),
    })));
}

/** Apply every command against the same plan, or reject the whole transition. */
export function setRegionalEcologyMaterializationForWindow(
  residentsValue: readonly RegionalEcologyResidentPatch[],
  window: CoreEcologyRuntimeWindow,
  atTick: number,
): readonly RegionalEcologyResidentPatch[] | null {
  if (!Number.isSafeInteger(atTick) || atTick < 0) return null;
  const plan = deriveRegionalEcologyMaterializationPlan(residentsValue, window);
  if (plan === null) return null;
  const commandBySource = new Map(plan.map((command) => [command.sourceKey, command]));
  const next: RegionalEcologyResidentPatch[] = [];
  for (const residentValue of residentsValue) {
    const patch = canonicalizeCoreEcologyAggregatePatch(residentValue.patch);
    const command = commandBySource.get(residentValue.sourceKey);
    if (
      patch === null
      || patch.patchKey !== residentValue.sourceKey
      || command === undefined
      || atTick < patch.updatedAtTick
    ) return null;
    let updated: CoreEcologyAggregatePatchState;
    try {
      updated = setCoreEcologyAggregatePatchMaterializedActors(patch, {
        atTick,
        actorIds: command.actorIds,
      });
    } catch {
      return null;
    }
    next.push(Object.freeze({ sourceKey: residentValue.sourceKey, patch: updated }));
  }
  next.sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  const result = Object.freeze(next);
  const windowScalars = materializationWindowScalars(window);
  if (windowScalars !== null) {
    const projectedBySource = new Map(
      result.map((resident) => [resident.sourceKey, resident.patch] as const),
    );
    const entriesBySource = new Map<
      string,
      RegionalEcologyMaterializationReceiptEntry
    >();
    for (const resident of residentsValue) {
      const projectedPatch = projectedBySource.get(resident.sourceKey);
      if (projectedPatch === undefined) return null;
      entriesBySource.set(resident.sourceKey, Object.freeze({
        sourceKey: resident.sourceKey,
        sourcePatch: resident.patch,
        projectedPatch,
      }));
    }
    if (entriesBySource.size !== residentsValue.length) return null;
    MATERIALIZATION_RECEIPTS.set(result, Object.freeze({
      atTick,
      ...windowScalars,
      sourceCount: residentsValue.length,
      entriesBySource,
    }));
  }
  return result;
}

/**
 * @internal Closed projection boundary: only the exact whole batch produced by
 * `setRegionalEcologyMaterializationForWindow` can satisfy this predicate.
 * Array copies, reversals, structured clones, changed source identities, a
 * different signed window, or a different tick all fail closed.
 */
export function isRegionalEcologyMaterializationBatchReceipt(
  batchValue: unknown,
  sourcesValue: readonly RegionalEcologyResidentPatch[],
  window: CoreEcologyRuntimeWindow,
  atTick: number,
): batchValue is readonly RegionalEcologyResidentPatch[] {
  if (!Array.isArray(batchValue) || !Array.isArray(sourcesValue)) return false;
  const receipt = MATERIALIZATION_RECEIPTS.get(batchValue);
  const windowScalars = materializationWindowScalars(window);
  if (
    receipt === undefined
    || windowScalars === null
    || receipt.atTick !== atTick
    || !Object.is(receipt.originX, windowScalars.originX)
    || !Object.is(receipt.originY, windowScalars.originY)
    || !Object.is(receipt.width, windowScalars.width)
    || !Object.is(receipt.height, windowScalars.height)
    || receipt.sourceCount !== sourcesValue.length
    || receipt.sourceCount !== batchValue.length
  ) return false;

  const seen = new Set<string>();
  for (const source of sourcesValue) {
    if (
      source === null
      || typeof source !== "object"
      || Array.isArray(source)
      || !canonicalSourceKey(source.sourceKey)
      || seen.has(source.sourceKey)
    ) return false;
    const entry = receipt.entriesBySource.get(source.sourceKey);
    if (entry === undefined || entry.sourcePatch !== source.patch) return false;
    seen.add(source.sourceKey);
  }
  if (seen.size !== receipt.entriesBySource.size) return false;

  const projectedKeys = new Set<string>();
  for (const projected of batchValue) {
    if (
      projected === null
      || typeof projected !== "object"
      || Array.isArray(projected)
      || !canonicalSourceKey(projected.sourceKey)
      || projectedKeys.has(projected.sourceKey)
      || receipt.entriesBySource.get(projected.sourceKey)?.projectedPatch
        !== projected.patch
    ) return false;
    projectedKeys.add(projected.sourceKey);
  }
  return projectedKeys.size === receipt.entriesBySource.size;
}

/**
 * @internal Authenticate one exact source-to-projection transition inside a
 * still-live whole-batch receipt. This does not accept structurally equivalent
 * patches because doing so would turn the optimization into another authority.
 */
export function regionalEcologyMaterializationBatchOwnsTransition(
  batchValue: unknown,
  sourceKey: string,
  sourcePatch: CoreEcologyAggregatePatchState,
  projectedPatch: CoreEcologyAggregatePatchState,
  atTick: number,
): boolean {
  if (!Array.isArray(batchValue)) return false;
  const receipt = MATERIALIZATION_RECEIPTS.get(batchValue);
  const entry = receipt?.entriesBySource.get(sourceKey);
  return receipt !== undefined
    && receipt.atTick === atTick
    && entry !== undefined
    && entry.sourcePatch === sourcePatch
    && entry.projectedPatch === projectedPatch;
}

/** @internal Explicitly revoke a synchronous receipt after projection. */
export function releaseRegionalEcologyMaterializationBatchReceipt(
  batchValue: unknown,
): void {
  if (Array.isArray(batchValue)) MATERIALIZATION_RECEIPTS.delete(batchValue);
}

function compareRegionalUnit(
  left: RegionalEcologyMaterializationUnit,
  right: RegionalEcologyMaterializationUnit,
): number {
  return left.distanceFromWindowCenterSquared - right.distanceFromWindowCenterSquared
    || compareText(left.priorityActorId, right.priorityActorId)
    || compareText(left.sourceKey, right.sourceKey)
    || compareText(left.unitKey, right.unitKey);
}

function canonicalSourceKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && value.trim() === value;
}

function materializationWindowScalars(
  value: CoreEcologyRuntimeWindow,
): Readonly<{
  originX: number;
  originY: number;
  width: number;
  height: number;
}> | null {
  try {
    const originX = value.origin.x;
    const originY = value.origin.y;
    const width = value.terrain.width;
    const height = value.terrain.height;
    return Number.isSafeInteger(originX)
      && Number.isSafeInteger(originY)
      && Number.isSafeInteger(width)
      && width > 0
      && Number.isSafeInteger(height)
      && height > 0
      ? Object.freeze({ originX, originY, width, height })
      : null;
  } catch {
    return null;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
