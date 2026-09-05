import { createActorObservation, type ActorObservation } from "../sim/actorPerception";
import {
  CORE_WILDLIFE_SPECIES,
  getCoreWildlifeProfile,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import type { RootSeed } from "../sim/rng";
import { createRegionCoord, isRegionCoord, type RegionCoord } from "../sim/regions";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_WILDLIFE_EVENT_VERSION,
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  stepCoreWildlifeActor,
  type CoreWildlifeActionAccessibility,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
  type CoreWildlifeFoodOpportunity,
  type CoreWildlifeResourceClaim,
} from "./coreWildlifeActor";
import { isWorldPosition, type WorldPosition } from "./worldPosition";

export const CORE_ECOLOGY_PATCH_VERSION = 1 as const;
export const CORE_ECOLOGY_MAX_POPULATIONS = 12 as const;
export const CORE_ECOLOGY_MAX_MEMBERS = 48 as const;
export const CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS = 24 as const;
export const CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES = 16 * 1_024 * 1_024;

export type CoreWildlifeMaterialization = "coarse" | "materialized";

export interface CoreEcologyPopulationMemberInput {
  readonly populationOrdinal: number;
  readonly position: WorldPosition;
  readonly heading?: number;
  readonly materialization: CoreWildlifeMaterialization;
}

export interface CoreEcologyPopulationInput {
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  readonly members: readonly CoreEcologyPopulationMemberInput[];
}

export interface CreateCoreEcologyPatchInput {
  readonly seed: RootSeed;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly tick?: number;
  readonly populations: readonly CoreEcologyPopulationInput[];
}

export interface CoreEcologyPopulationMemberState {
  readonly populationOrdinal: number;
  readonly materialization: CoreWildlifeMaterialization;
  readonly actor: CoreWildlifeActorState;
}

export interface CoreEcologyPopulationState {
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  readonly populationSize: number;
  readonly members: readonly CoreEcologyPopulationMemberState[];
}

/** Bounded habitat patch; coarse members remain identified and persist dynamic state. */
export interface CoreEcologyPatchState {
  readonly version: typeof CORE_ECOLOGY_PATCH_VERSION;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly updatedAtTick: number;
  readonly populations: readonly CoreEcologyPopulationState[];
}

export interface SetCoreEcologyMaterializationInput {
  readonly atTick: number;
  /** Exact desired materialized set; omission dematerializes while retaining state. */
  readonly actorIds: readonly string[];
}

export interface CoreEcologyActorStepInput {
  readonly actorId: string;
  readonly observations: readonly ActorObservation[];
  readonly foodOpportunities: readonly CoreWildlifeFoodOpportunity[];
  readonly accessibility: CoreWildlifeActionAccessibility;
}

export interface CoreEcologyPatchStepInput {
  readonly tick: number;
  /** Exactly one input per currently materialized actor. */
  readonly actorSteps: readonly CoreEcologyActorStepInput[];
}

export interface CoreEcologyPatchStepResult {
  readonly patch: CoreEcologyPatchState;
  readonly events: readonly CoreWildlifeCausalEvent[];
  /** Conflicts intentionally remain for the authoritative custody owner to arbitrate. */
  readonly resourceClaims: readonly CoreWildlifeResourceClaim[];
}

export interface CoreEcologyAlarmObservationInput {
  readonly observerId: string;
  readonly observedAtTick: number;
  readonly radiusUnits: number;
  readonly confidence: number;
  readonly salience: number;
}

const UTF8_ENCODER = new TextEncoder();
const PATCH_KEY_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,63}$/u;
const ACTOR_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const MATERIALIZATION = new Set<string>(["coarse", "materialized"]);

export function createCoreEcologyPatch(
  input: CreateCoreEcologyPatchInput,
): CoreEcologyPatchState {
  if (
    !plainRecord(input)
    || !validPatchKey(input.patchKey)
    || !isRegionCoord(input.originRegion)
    || !Array.isArray(input.populations)
    || input.populations.length === 0
    || input.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
  ) throw new RangeError("Core ecology patch creation input is malformed or unbounded");
  const tick = input.tick ?? 0;
  if (!nonnegativeSafeInteger(tick) || tick > Number.MAX_SAFE_INTEGER - 64) {
    throw new RangeError("Core ecology patch tick is outside the schedulable range");
  }
  const populations: CoreEcologyPopulationState[] = [];
  let memberCount = 0;
  let materializedCount = 0;
  for (const populationValue of input.populations) {
    if (
      !plainRecord(populationValue)
      || !exactKeys(populationValue, ["members", "populationKey", "species"])
      || !CORE_WILDLIFE_SPECIES.includes(populationValue.species as CoreWildlifeSpecies)
      || !validPatchKey(populationValue.populationKey)
      || !Array.isArray(populationValue.members)
    ) throw new RangeError("Core ecology population input is malformed");
    const species = populationValue.species as CoreWildlifeSpecies;
    const profile = getCoreWildlifeProfile(species);
    if (
      populationValue.members.length === 0
      || populationValue.members.length > profile.maximumPatchPopulation
    ) throw new RangeError(`Core ecology ${species} population exceeds its patch budget`);
    const members: CoreEcologyPopulationMemberState[] = [];
    for (const memberValue of populationValue.members) {
      if (
        !plainRecord(memberValue)
        || !allowedKeys(memberValue, ["heading", "materialization", "populationOrdinal", "position"])
        || !Object.hasOwn(memberValue, "materialization")
        || !Object.hasOwn(memberValue, "populationOrdinal")
        || !Object.hasOwn(memberValue, "position")
        || !nonnegativeSafeInteger(memberValue.populationOrdinal)
        || !MATERIALIZATION.has(memberValue.materialization as string)
        || !isWorldPosition(memberValue.position)
      ) throw new RangeError("Core ecology member input is malformed");
      const actor = createCoreWildlifeActorState({
        seed: input.seed,
        species,
        originRegion: input.originRegion,
        populationKey: populationValue.populationKey,
        populationOrdinal: memberValue.populationOrdinal,
        position: memberValue.position,
        ...(memberValue.heading === undefined ? {} : { heading: memberValue.heading as number }),
        tick,
      });
      members.push(Object.freeze({
        populationOrdinal: memberValue.populationOrdinal,
        materialization: memberValue.materialization as CoreWildlifeMaterialization,
        actor,
      }));
      memberCount += 1;
      if (memberValue.materialization === "materialized") materializedCount += 1;
    }
    members.sort(compareMember);
    for (let index = 1; index < members.length; index += 1) {
      if (members[index - 1]?.populationOrdinal === members[index]?.populationOrdinal) {
        throw new RangeError("Core ecology population ordinals must be unique");
      }
    }
    populations.push(Object.freeze({
      species,
      populationKey: populationValue.populationKey,
      populationSize: members.length,
      members: Object.freeze(members),
    }));
  }
  if (
    memberCount > CORE_ECOLOGY_MAX_MEMBERS
    || materializedCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) throw new RangeError("Core ecology patch exceeds its member or materialization budget");
  const candidate = {
    version: CORE_ECOLOGY_PATCH_VERSION,
    patchKey: input.patchKey,
    originRegion: createRegionCoord(input.originRegion.x, input.originRegion.y),
    updatedAtTick: tick,
    populations,
  };
  const patch = canonicalizeCoreEcologyPatch(candidate);
  if (patch === null) throw new Error("Generated core ecology patch failed validation");
  return patch;
}

export function canonicalizeCoreEcologyPatch(value: unknown): CoreEcologyPatchState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "originRegion",
    "patchKey",
    "populations",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_PATCH_VERSION
    || !validPatchKey(value.patchKey)
    || !isRegionCoord(value.originRegion)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.populations)
    || value.populations.length === 0
    || value.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
  ) return null;
  const populations: CoreEcologyPopulationState[] = [];
  const actorIds = new Set<string>();
  let memberCount = 0;
  let materializedCount = 0;
  for (const rawPopulation of value.populations) {
    const population = canonicalPopulation(
      rawPopulation,
      value.originRegion,
      value.updatedAtTick,
      actorIds,
    );
    if (population === null) return null;
    populations.push(population);
    memberCount += population.members.length;
    materializedCount += population.members.filter(({ materialization }) =>
      materialization === "materialized"
    ).length;
  }
  populations.sort(comparePopulation);
  for (let index = 1; index < populations.length; index += 1) {
    if (comparePopulation(populations[index - 1]!, populations[index]!) === 0) return null;
  }
  if (
    memberCount > CORE_ECOLOGY_MAX_MEMBERS
    || materializedCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) return null;
  return deepFreeze({
    version: CORE_ECOLOGY_PATCH_VERSION,
    patchKey: value.patchKey,
    originRegion: createRegionCoord(value.originRegion.x, value.originRegion.y),
    updatedAtTick: value.updatedAtTick,
    populations,
  });
}

export function serializeCoreEcologyPatch(value: unknown): string {
  const patch = requirePatch(value);
  const text = stableStringify(patch);
  if (UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Core ecology patch exceeds its save budget");
  }
  return text;
}

export function deserializeCoreEcologyPatch(text: unknown): CoreEcologyPatchState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const patch = canonicalizeCoreEcologyPatch(JSON.parse(text) as unknown);
    return patch !== null && stableStringify(patch) === text ? patch : null;
  } catch {
    return null;
  }
}

export function coreEcologyActor(
  value: unknown,
  actorId: unknown,
): CoreWildlifeActorState | null {
  const patch = canonicalizeCoreEcologyPatch(value);
  if (patch === null || typeof actorId !== "string") return null;
  for (const population of patch.populations) {
    const member = population.members.find(({ actor }) => actor.identity.stableId === actorId);
    if (member !== undefined) return member.actor;
  }
  return null;
}

/** Replaces one already-owned actor without permitting identity/population aliasing. */
export function replaceCoreEcologyActor(
  value: unknown,
  actorValue: unknown,
): CoreEcologyPatchState {
  const patch = requirePatch(value);
  const actor = canonicalizeCoreWildlifeActorState(actorValue);
  if (actor === null) throw new TypeError("Replacement core wildlife actor is malformed");
  let found = false;
  const populations = patch.populations.map((population) => Object.freeze({
    ...population,
    members: Object.freeze(population.members.map((member) => {
      if (member.actor.identity.stableId !== actor.identity.stableId) return member;
      found = true;
      if (
        actor.updatedAtTick < member.actor.updatedAtTick
        || actor.identity.species !== population.species
        || actor.identity.populationKey !== population.populationKey
        || actor.identity.populationOrdinal !== member.populationOrdinal
      ) throw new RangeError("Replacement actor does not belong to this population revision");
      return Object.freeze({ ...member, actor });
    })),
  }));
  if (!found) throw new RangeError("Replacement actor is not owned by this ecology patch");
  return requireCanonicalPatch({
    ...patch,
    updatedAtTick: Math.max(patch.updatedAtTick, actor.updatedAtTick),
    populations,
  });
}

export function setCoreEcologyMaterializedActors(
  value: unknown,
  input: SetCoreEcologyMaterializationInput,
): CoreEcologyPatchState {
  const patch = requirePatch(value);
  if (
    !plainRecord(input)
    || !exactKeys(input, ["actorIds", "atTick"])
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick < patch.updatedAtTick
    || !Array.isArray(input.actorIds)
    || input.actorIds.length > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
    || input.actorIds.some((actorId) => typeof actorId !== "string")
  ) throw new RangeError("Core ecology materialization set is malformed or stale");
  const desired = new Set(input.actorIds);
  if (desired.size !== input.actorIds.length) {
    throw new RangeError("Core ecology materialization IDs must be unique");
  }
  const known = new Set(allMembers(patch).map(({ actor }) => actor.identity.stableId));
  if ([...desired].some((actorId) => !known.has(actorId))) {
    throw new RangeError("Core ecology cannot materialize an actor outside its patch");
  }
  const populations = patch.populations.map((population) => Object.freeze({
    ...population,
    members: Object.freeze(population.members.map((member) => Object.freeze({
      ...member,
      materialization: desired.has(member.actor.identity.stableId)
        ? "materialized" as const
        : "coarse" as const,
    }))),
  }));
  return requireCanonicalPatch({
    ...patch,
    updatedAtTick: input.atTick,
    populations,
  });
}

/** All-or-nothing deterministic step over the exact materialized actor set. */
export function stepCoreEcologyPatch(
  value: unknown,
  inputValue: unknown,
): CoreEcologyPatchStepResult | null {
  const patch = canonicalizeCoreEcologyPatch(value);
  if (patch === null) return null;
  const input = canonicalPatchStepInput(inputValue, patch);
  if (input === null) return null;
  const stepByActor = new Map(input.actorSteps.map((step) => [step.actorId, step]));
  const events: CoreWildlifeCausalEvent[] = [];
  const claims: CoreWildlifeResourceClaim[] = [];
  const populations: CoreEcologyPopulationState[] = [];
  for (const population of patch.populations) {
    const members: CoreEcologyPopulationMemberState[] = [];
    for (const member of population.members) {
      if (member.materialization === "coarse") {
        members.push(member);
        continue;
      }
      const stepInput = stepByActor.get(member.actor.identity.stableId);
      if (stepInput === undefined) return null;
      const result = stepCoreWildlifeActor(member.actor, {
        tick: input.tick,
        observations: stepInput.observations,
        foodOpportunities: stepInput.foodOpportunities,
        accessibility: stepInput.accessibility,
      });
      if (result === null) return null;
      members.push(Object.freeze({ ...member, actor: result.actor }));
      events.push(result.event);
      claims.push(...result.resourceClaims);
    }
    populations.push(Object.freeze({
      ...population,
      members: Object.freeze(members),
    }));
  }
  events.sort((left, right) => compareText(left.actorId, right.actorId));
  claims.sort((left, right) =>
    compareText(left.resourceId, right.resourceId) || compareText(left.actorId, right.actorId)
  );
  const nextPatch = canonicalizeCoreEcologyPatch({
    ...patch,
    updatedAtTick: input.tick,
    populations,
  });
  if (nextPatch === null) return null;
  return deepFreeze({
    patch: nextPatch,
    events,
    resourceClaims: claims,
  });
}

/**
 * Generic event-to-hearing bridge. It reveals neither alarm source identity nor
 * intent; callers still decide whether propagation reaches this observer.
 */
export function createCoreEcologyAlarmObservation(
  event: CoreWildlifeCausalEvent,
  input: CoreEcologyAlarmObservationInput,
): ActorObservation | null {
  if (
    !plainRecord(event)
    || !exactKeys(event, [
      "actorId",
      "atTick",
      "causeReferenceId",
      "eventId",
      "kind",
      "observationId",
      "position",
      "resourceReference",
      "species",
      "version",
    ])
    || event.version !== CORE_WILDLIFE_EVENT_VERSION
    || event.kind !== "alarm"
    || !ACTOR_REFERENCE_PATTERN.test(event.eventId)
    || !ACTOR_REFERENCE_PATTERN.test(event.actorId)
    || !ACTOR_REFERENCE_PATTERN.test(event.causeReferenceId)
    || !CORE_WILDLIFE_SPECIES.includes(event.species)
    || !nonnegativeSafeInteger(event.atTick)
    || !(event.observationId === null || ACTOR_REFERENCE_PATTERN.test(event.observationId))
    || event.resourceReference !== null
    || !isWorldPosition(event.position)
    || !plainRecord(input)
    || !exactKeys(input, [
      "confidence",
      "observedAtTick",
      "observerId",
      "radiusUnits",
      "salience",
    ])
    || !nonnegativeSafeInteger(input.observedAtTick)
    || input.observedAtTick < event.atTick
  ) return null;
  return createActorObservation({
    id: `alarm:${hashCanonical([event.eventId, input.observerId, input.observedAtTick])}`,
    observerId: input.observerId,
    observedAtTick: input.observedAtTick,
    channel: "hearing",
    perceivedClass: "animal-alarm",
    subjectId: null,
    area: {
      center: event.position,
      radiusUnits: input.radiusUnits,
    },
    confidence: input.confidence,
    salience: input.salience,
    identification: "anonymous",
    interrupt: "strong",
  });
}

function canonicalPopulation(
  value: unknown,
  originRegion: RegionCoord,
  maximumTick: number,
  actorIds: Set<string>,
): CoreEcologyPopulationState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "members",
    "populationKey",
    "populationSize",
    "species",
  ])) return null;
  if (
    !CORE_WILDLIFE_SPECIES.includes(value.species as CoreWildlifeSpecies)
    || !validPatchKey(value.populationKey)
    || !positiveSafeInteger(value.populationSize)
    || !Array.isArray(value.members)
    || value.members.length !== value.populationSize
  ) return null;
  const species = value.species as CoreWildlifeSpecies;
  if (value.members.length > getCoreWildlifeProfile(species).maximumPatchPopulation) return null;
  const members: CoreEcologyPopulationMemberState[] = [];
  for (const raw of value.members) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "actor",
      "materialization",
      "populationOrdinal",
    ])) return null;
    if (
      !nonnegativeSafeInteger(raw.populationOrdinal)
      || !MATERIALIZATION.has(raw.materialization as string)
    ) return null;
    const actor = canonicalizeCoreWildlifeActorState(raw.actor);
    if (
      actor === null
      || actor.updatedAtTick > maximumTick
      || actor.identity.species !== species
      || actor.identity.populationKey !== value.populationKey
      || actor.identity.populationOrdinal !== raw.populationOrdinal
      || actor.identity.originRegion.x !== originRegion.x
      || actor.identity.originRegion.y !== originRegion.y
      || actorIds.has(actor.identity.stableId)
    ) return null;
    actorIds.add(actor.identity.stableId);
    members.push(Object.freeze({
      populationOrdinal: raw.populationOrdinal,
      materialization: raw.materialization as CoreWildlifeMaterialization,
      actor,
    }));
  }
  members.sort(compareMember);
  for (let index = 1; index < members.length; index += 1) {
    if (members[index - 1]?.populationOrdinal === members[index]?.populationOrdinal) return null;
  }
  return Object.freeze({
    species,
    populationKey: value.populationKey,
    populationSize: value.populationSize,
    members: Object.freeze(members),
  });
}

function canonicalPatchStepInput(
  value: unknown,
  patch: CoreEcologyPatchState,
): CoreEcologyPatchStepInput | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["actorSteps", "tick"])
    || !nonnegativeSafeInteger(value.tick)
    || value.tick <= patch.updatedAtTick
    || value.tick > Number.MAX_SAFE_INTEGER - 64
    || !Array.isArray(value.actorSteps)
  ) return null;
  const materializedIds = allMembers(patch)
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actor.identity.stableId)
    .sort(compareText);
  if (value.actorSteps.length !== materializedIds.length) return null;
  const actorSteps: CoreEcologyActorStepInput[] = [];
  for (const raw of value.actorSteps) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "accessibility",
      "actorId",
      "foodOpportunities",
      "observations",
    ])) return null;
    if (
      typeof raw.actorId !== "string"
      || !Array.isArray(raw.observations)
      || !Array.isArray(raw.foodOpportunities)
    ) return null;
    actorSteps.push({
      actorId: raw.actorId,
      observations: raw.observations as readonly ActorObservation[],
      foodOpportunities: raw.foodOpportunities as readonly CoreWildlifeFoodOpportunity[],
      accessibility: raw.accessibility as CoreWildlifeActionAccessibility,
    });
  }
  actorSteps.sort((left, right) => compareText(left.actorId, right.actorId));
  if (actorSteps.some((step, index) => step.actorId !== materializedIds[index])) return null;
  return { tick: value.tick, actorSteps: Object.freeze(actorSteps) };
}

function allMembers(patch: CoreEcologyPatchState): readonly CoreEcologyPopulationMemberState[] {
  return patch.populations.flatMap(({ members }) => members);
}

function requirePatch(value: unknown): CoreEcologyPatchState {
  const patch = canonicalizeCoreEcologyPatch(value);
  if (patch === null) throw new TypeError("Core ecology patch state is malformed");
  return patch;
}

function requireCanonicalPatch(value: unknown): CoreEcologyPatchState {
  const patch = canonicalizeCoreEcologyPatch(value);
  if (patch === null) throw new Error("Core ecology transition broke patch invariants");
  return patch;
}

function comparePopulation(
  left: Pick<CoreEcologyPopulationState, "species" | "populationKey">,
  right: Pick<CoreEcologyPopulationState, "species" | "populationKey">,
): number {
  return compareText(left.species, right.species)
    || compareText(left.populationKey, right.populationKey);
}

function compareMember(
  left: Pick<CoreEcologyPopulationMemberState, "populationOrdinal">,
  right: Pick<CoreEcologyPopulationMemberState, "populationOrdinal">,
): number {
  return left.populationOrdinal - right.populationOrdinal;
}

function validPatchKey(value: unknown): value is string {
  return typeof value === "string"
    && PATCH_KEY_PATTERN.test(value)
    && value === value.normalize("NFC");
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function allowedKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
