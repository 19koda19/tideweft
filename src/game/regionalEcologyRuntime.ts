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
  return Object.freeze(next);
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
