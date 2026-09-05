import {
  CORE_WILDLIFE_SPECIES,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { globalTileToRegion } from "../sim/regions";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  canonicalizeCoreEcologyPatch,
  setCoreEcologyMaterializedActors,
  type CoreEcologyPatchState,
  type CoreEcologyPopulationMemberState,
  type CoreEcologyPopulationState,
} from "./coreEcology";
import type { CoreWildlifeActorState } from "./coreWildlifeActor";
import { livingActorAddressInRegionalWindow } from "./livingActor";
import { livingSpeciesActorIdMatchesNamespace } from "./livingSpeciesRegistry";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import {
  hasValidPerceptionSignature,
  type PerceptionResult,
} from "./perception";
import {
  projectWildlifePresentation,
  type WildlifePresentation,
} from "./wildlifePresentation";

/** Minimal signed-frame subset consumed by actor projection. */
export interface CoreEcologyRuntimeWindow {
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly terrain: Readonly<{
    readonly width: number;
    readonly height: number;
  }>;
}

export interface CoreWildlifeSelectionTarget {
  readonly species: CoreWildlifeSpecies;
  readonly actorId: string;
}

export interface ProjectCoreEcologyWildlifeInput {
  readonly patch: unknown;
  readonly window: CoreEcologyRuntimeWindow;
  readonly perception: PerceptionResult;
  readonly tileSize: number;
  readonly selectedTarget?: CoreWildlifeSelectionTarget | null;
}

interface VisibleMember {
  readonly population: CoreEcologyPopulationState;
  readonly member: CoreEcologyPopulationMemberState;
  readonly presentation: WildlifePresentation;
}

/** Exact stable-ID set whose saved actor addresses lie in the current frame. */
export function deriveCoreEcologyMaterializedActorIds(
  patchValue: unknown,
  windowValue: unknown,
): readonly string[] | null {
  const patch = canonicalizeCoreEcologyPatch(patchValue);
  const window = canonicalWindow(windowValue);
  if (patch === null || window === null) return null;
  const actorIds = patch.populations.flatMap(({ members }) => members
    .filter(({ actor }) => livingActorAddressInRegionalWindow(actor.address, window) !== null)
    .map(({ actor }) => actor.identity.stableId));
  actorIds.sort(compareText);
  return actorIds.length <= CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
    ? Object.freeze(actorIds)
    : null;
}

/**
 * Reconciles only representation state. Every actor—including actors becoming
 * coarse—retains its exact identity, needs, condition, cognition, and history.
 */
export function setCoreEcologyMaterializationForWindow(
  patchValue: unknown,
  windowValue: unknown,
  atTick: unknown,
): CoreEcologyPatchState | null {
  const patch = canonicalizeCoreEcologyPatch(patchValue);
  const actorIds = deriveCoreEcologyMaterializedActorIds(patchValue, windowValue);
  if (
    patch === null
    || actorIds === null
    || !nonnegativeSafeInteger(atTick)
    || atTick < patch.updatedAtTick
  ) return null;
  try {
    return setCoreEcologyMaterializedActors(patch, { atTick, actorIds });
  } catch {
    return null;
  }
}

/**
 * Project the direct-detail subset of the already-materialized actor set.
 * Gull groupSize comes only from direct-visible representatives belonging to
 * the same saved population; populationSize and coarse members are not read.
 */
export function projectCoreEcologyWildlife(
  input: ProjectCoreEcologyWildlifeInput,
): readonly WildlifePresentation[] | null {
  if (
    !plainRecord(input)
    || !allowedProjectionInputKeys(input as unknown as Record<string, unknown>)
  ) return null;
  const patch = canonicalizeCoreEcologyPatch(input.patch);
  const window = canonicalWindow(input.window);
  if (
    patch === null
    || window === null
    || !validPerception(input.perception, window)
    || !Number.isFinite(input.tileSize)
    || input.tileSize <= 0
    || input.tileSize > 4_096
  ) return null;

  let selectedTarget: CoreWildlifeSelectionTarget | null = null;
  if (input.selectedTarget !== undefined && input.selectedTarget !== null) {
    selectedTarget = canonicalTarget(input.selectedTarget);
    if (selectedTarget === null) return null;
  }

  const visible: VisibleMember[] = [];
  const directGullsByPopulation = new Map<string, number>();
  for (const population of patch.populations) {
    for (const member of population.members) {
      if (member.materialization !== "materialized") continue;
      const presentation = projectWildlifePresentation({
        actor: member.actor,
        observation: { window, perception: input.perception },
        tileSize: input.tileSize,
        selected: targetMatchesActor(selectedTarget, member.actor),
      });
      if (presentation === null) continue;
      visible.push(Object.freeze({ population, member, presentation }));
      if (population.species === "gull") {
        directGullsByPopulation.set(
          population.populationKey,
          (directGullsByPopulation.get(population.populationKey) ?? 0) + 1,
        );
      }
    }
  }

  const presentations: WildlifePresentation[] = [];
  for (const { population, member, presentation } of visible) {
    if (population.species !== "gull") {
      presentations.push(presentation);
      continue;
    }
    const visibleAggregateCount = directGullsByPopulation.get(population.populationKey);
    if (visibleAggregateCount === undefined) return null;
    const withVisibleCount = projectWildlifePresentation({
      actor: member.actor,
      observation: { window, perception: input.perception, visibleAggregateCount },
      tileSize: input.tileSize,
      selected: targetMatchesActor(selectedTarget, member.actor),
    });
    if (withVisibleCount === null) return null;
    presentations.push(withVisibleCount);
  }
  presentations.sort(comparePresentation);
  return Object.freeze(presentations);
}

/** Exact selected-target lookup; coarse and cross-species aliases fail closed. */
export function selectedCoreEcologyActor(
  patchValue: unknown,
  targetValue: unknown,
): CoreWildlifeActorState | null {
  const patch = canonicalizeCoreEcologyPatch(patchValue);
  const target = canonicalTarget(targetValue);
  if (patch === null || target === null) return null;
  for (const population of patch.populations) {
    if (population.species !== target.species) continue;
    const member = population.members.find(({ actor, materialization }) =>
      materialization === "materialized"
      && actor.identity.species === target.species
      && actor.identity.stableId === target.actorId
    );
    if (member !== undefined) return member.actor;
  }
  return null;
}

function canonicalWindow(value: unknown): CoreEcologyRuntimeWindow | null {
  if (
    !plainRecord(value)
    || !plainRecord(value.origin)
    || !exactKeys(value.origin, ["x", "y"])
    || !safeInteger(value.origin.x)
    || !safeInteger(value.origin.y)
    || !plainRecord(value.terrain)
    || !positiveSafeInteger(value.terrain.width)
    || !positiveSafeInteger(value.terrain.height)
    || value.terrain.width !== REGIONAL_TRAVEL_COLUMNS
    || value.terrain.height !== REGIONAL_TRAVEL_ROWS
  ) return null;
  try {
    globalTileToRegion(value.origin.x, value.origin.y);
    globalTileToRegion(
      value.origin.x + value.terrain.width - 1,
      value.origin.y + value.terrain.height - 1,
    );
  } catch {
    return null;
  }
  return deepFreeze({
    origin: { x: value.origin.x, y: value.origin.y },
    terrain: { width: value.terrain.width, height: value.terrain.height },
  });
}

function validPerception(
  value: unknown,
  window: CoreEcologyRuntimeWindow,
): value is PerceptionResult {
  if (!plainRecord(value)) return false;
  const perception = value as unknown as PerceptionResult;
  return perception.valid === true
    && hasValidPerceptionSignature(perception, window.terrain.width, window.terrain.height)
    && nonnegativeSafeInteger(perception.playerTileIndex)
    && perception.playerTileIndex < window.terrain.width * window.terrain.height;
}

function canonicalTarget(value: unknown): CoreWildlifeSelectionTarget | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["actorId", "species"])
    || !CORE_WILDLIFE_SPECIES.includes(value.species as CoreWildlifeSpecies)
    || typeof value.actorId !== "string"
    || !livingSpeciesActorIdMatchesNamespace(value.actorId, value.species)
  ) return null;
  return Object.freeze({
    species: value.species as CoreWildlifeSpecies,
    actorId: value.actorId,
  });
}

function targetMatchesActor(
  target: CoreWildlifeSelectionTarget | null,
  actor: CoreWildlifeActorState,
): boolean {
  return target !== null
    && target.species === actor.identity.species
    && target.actorId === actor.identity.stableId;
}

function allowedProjectionInputKeys(value: Record<string, unknown>): boolean {
  const expected = Object.hasOwn(value, "selectedTarget")
    ? ["patch", "perception", "selectedTarget", "tileSize", "window"]
    : ["patch", "perception", "tileSize", "window"];
  return exactKeys(value, expected);
}

function comparePresentation(left: WildlifePresentation, right: WildlifePresentation): number {
  return compareText(left.species, right.species) || compareText(left.actorId, right.actorId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) > 0;
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length && keys.every((key, index) => key === canonical[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
