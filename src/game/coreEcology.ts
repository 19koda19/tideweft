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
  advanceCoreWildlifeActorCoarse,
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
  type CoreWildlifeActionAccessibility,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
  type CoreWildlifeFoodOpportunity,
  type CoreWildlifeResourceClaim,
} from "./coreWildlifeActor";
import {
  CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS,
  canonicalizeCoreEcologyGroupSet,
  coreEcologyGroupComponentForMember,
  createCoreEcologyGroupSet,
  emitCoreEcologyGroupSignal,
  reconcileCoreEcologyGroupAnchors,
  stepCoreEcologyGroupCoarse,
  stepCoreEcologyGroupSignalCadence,
  type CoreEcologyPlayerAbsentDisturbance,
  type CoreEcologyGroupSet,
  type CoreEcologyGroupState,
} from "./coreEcologyGroups";
import {
  canonicalizeCoreEcologyHabitatAssemblage,
  type CoreEcologyHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_PATCH_VERSION = 2 as const;
export const LEGACY_CORE_ECOLOGY_PATCH_VERSION = 1 as const;
export const CORE_ECOLOGY_MAX_POPULATIONS = 12 as const;
export const CORE_ECOLOGY_MAX_MEMBERS = 48 as const;
export const CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS = 24 as const;
export const CORE_ECOLOGY_MAX_STEP_TICKS = 64 as const;
export const CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES = 16 * 1_024 * 1_024;

export type CoreWildlifeMaterialization = "coarse" | "materialized";

export interface CoreEcologyPopulationMemberInput {
  readonly populationOrdinal: number;
  /** Aggregate population units represented by this exact active-window actor. */
  readonly representedUnits?: number;
  readonly position: WorldPosition;
  readonly heading?: number;
  readonly materialization: CoreWildlifeMaterialization;
}

export interface CoreEcologyPopulationInput {
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  readonly populationSize?: number;
  readonly members: readonly CoreEcologyPopulationMemberInput[];
}

export type CoreEcologyPatchDerivation =
  | Readonly<{ readonly kind: "bounded-input-v1" }>
  | Readonly<{
      readonly kind: "habitat-v1";
      readonly habitat: CoreEcologyHabitatAssemblage;
    }>
  | Readonly<{ readonly kind: "legacy-fixed-v1" }>;

export interface CreateCoreEcologyPatchInput {
  readonly seed: RootSeed;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly tick?: number;
  readonly populations: readonly CoreEcologyPopulationInput[];
  /** Runtime worlds use habitat-v1; bounded-input-v1 is retained for pure fixtures. */
  readonly derivation?: CoreEcologyPatchDerivation;
  readonly groups?: CoreEcologyGroupSet;
}

export interface CoreEcologyPopulationMemberState {
  readonly populationOrdinal: number;
  readonly representedUnits: number;
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
  readonly derivation: CoreEcologyPatchDerivation;
  readonly groups: CoreEcologyGroupSet;
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
      || !allowedKeys(populationValue, ["members", "populationKey", "populationSize", "species"])
      || !Object.hasOwn(populationValue, "members")
      || !Object.hasOwn(populationValue, "populationKey")
      || !Object.hasOwn(populationValue, "species")
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
    let representedPopulation = 0;
    for (const memberValue of populationValue.members) {
      if (
        !plainRecord(memberValue)
        || !allowedKeys(memberValue, [
          "heading",
          "materialization",
          "populationOrdinal",
          "position",
          "representedUnits",
        ])
        || !Object.hasOwn(memberValue, "materialization")
        || !Object.hasOwn(memberValue, "populationOrdinal")
        || !Object.hasOwn(memberValue, "position")
        || !nonnegativeSafeInteger(memberValue.populationOrdinal)
        || (memberValue.representedUnits !== undefined
          && !positiveSafeInteger(memberValue.representedUnits))
        || !MATERIALIZATION.has(memberValue.materialization as string)
        || !isWorldPosition(memberValue.position)
      ) throw new RangeError("Core ecology member input is malformed");
      const representedUnits = memberValue.representedUnits ?? 1;
      representedPopulation += representedUnits;
      if (!Number.isSafeInteger(representedPopulation)) {
        throw new RangeError("Core ecology population representation overflowed");
      }
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
        representedUnits,
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
    const populationSize = populationValue.populationSize ?? representedPopulation;
    if (
      !positiveSafeInteger(populationSize)
      || populationSize !== representedPopulation
      || populationSize > profile.maximumPatchPopulation
    ) throw new RangeError(`Core ecology ${species} population representation is inconsistent`);
    populations.push(Object.freeze({
      species,
      populationKey: populationValue.populationKey,
      populationSize,
      members: Object.freeze(members),
    }));
  }
  if (
    memberCount > CORE_ECOLOGY_MAX_MEMBERS
    || materializedCount > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
  ) throw new RangeError("Core ecology patch exceeds its member or materialization budget");
  const groups = input.groups === undefined
    ? createCoreEcologyGroupSet()
    : canonicalizeCoreEcologyGroupSet(input.groups);
  const derivation = canonicalDerivation(input.derivation ?? { kind: "bounded-input-v1" });
  if (groups === null || derivation === null) {
    throw new RangeError("Core ecology derivation or group state is malformed");
  }
  const candidate = {
    version: CORE_ECOLOGY_PATCH_VERSION,
    patchKey: input.patchKey,
    originRegion: createRegionCoord(input.originRegion.x, input.originRegion.y),
    updatedAtTick: tick,
    derivation,
    groups,
    populations,
  };
  const patch = canonicalizeCoreEcologyPatch(candidate);
  if (patch === null) throw new Error("Generated core ecology patch failed validation");
  return patch;
}

export function canonicalizeCoreEcologyPatch(value: unknown): CoreEcologyPatchState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "derivation",
    "groups",
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
    || value.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
  ) return null;
  const derivation = canonicalDerivation(value.derivation);
  const groups = canonicalizeCoreEcologyGroupSet(value.groups);
  if (derivation === null || groups === null) return null;
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
    || !groupsBelongToPatch(groups, populations, value.originRegion, value.updatedAtTick)
    || !derivationMatchesPopulations(derivation, populations, value.originRegion)
  ) return null;
  return deepFreeze({
    version: CORE_ECOLOGY_PATCH_VERSION,
    patchKey: value.patchKey,
    originRegion: createRegionCoord(value.originRegion.x, value.originRegion.y),
    updatedAtTick: value.updatedAtTick,
    derivation,
    groups,
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

/**
 * One-way Alpha-13 adoption. The old exact actors and their dynamic state are
 * retained byte-for-byte inside the new representation; no habitat reroll is
 * permitted during this migration.
 */
export function migrateLegacyCoreEcologyPatch(text: unknown): CoreEcologyPatchState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const legacy = canonicalizeLegacyCoreEcologyPatch(JSON.parse(text) as unknown);
    if (legacy === null || stableStringify(legacy) !== text) return null;
    return canonicalizeCoreEcologyPatch({
      version: CORE_ECOLOGY_PATCH_VERSION,
      patchKey: legacy.patchKey,
      originRegion: legacy.originRegion,
      updatedAtTick: legacy.updatedAtTick,
      derivation: { kind: "legacy-fixed-v1" },
      groups: createCoreEcologyGroupSet(),
      populations: legacy.populations.map((population) => ({
        ...population,
        members: population.members.map((member) => ({
          ...member,
          representedUnits: 1,
        })),
      })),
    });
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
  const advancedGroups = advanceGroupsThroughTick(patch, input.atTick);
  if (advancedGroups === null) {
    throw new RangeError("Core ecology groups could not reach the materialization tick");
  }
  const groups = reconcileGroupsBeforeMaterialization(
    advancedGroups,
    patch.populations,
    desired,
    input.atTick,
  );
  if (groups === null) {
    throw new RangeError("Core ecology group anchors could not be reconciled");
  }
  const populations = patch.populations.map((population) => Object.freeze({
    ...population,
    members: Object.freeze(population.members.map((member) => Object.freeze({
      ...member,
      actor: desired.has(member.actor.identity.stableId)
        && member.materialization === "coarse"
        ? rematerializeGroupedActor(member, population, groups, input.atTick)
        : member.actor,
      materialization: desired.has(member.actor.identity.stableId)
        ? "materialized" as const
        : "coarse" as const,
    }))),
  }));
  return requireCanonicalPatch({
    ...patch,
    updatedAtTick: input.atTick,
    groups,
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
  const advancedGroups = advanceGroupsThroughTick(patch, input.tick);
  if (advancedGroups === null) return null;
  const stepByActor = new Map(input.actorSteps.map((step) => [step.actorId, step]));
  const events: CoreWildlifeCausalEvent[] = [];
  const claims: CoreWildlifeResourceClaim[] = [];
  const populations: CoreEcologyPopulationState[] = [];
  for (const population of patch.populations) {
    const members: CoreEcologyPopulationMemberState[] = [];
    for (const member of population.members) {
      if (member.materialization === "coarse") {
        members.push(Object.freeze({
          ...member,
          actor: advanceCoreWildlifeActorCoarse(member.actor, { atTick: input.tick }),
        }));
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
  const groups = ingestMaterializedAlarmSignals(
    advancedGroups,
    populations,
    events,
    input.tick,
  );
  if (groups === null) return null;
  const nextPatch = canonicalizeCoreEcologyPatch({
    ...patch,
    updatedAtTick: input.tick,
    groups,
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
    || value.members.length === 0
  ) return null;
  const species = value.species as CoreWildlifeSpecies;
  if (
    value.members.length > getCoreWildlifeProfile(species).maximumPatchPopulation
    || value.populationSize > getCoreWildlifeProfile(species).maximumPatchPopulation
  ) return null;
  const members: CoreEcologyPopulationMemberState[] = [];
  let representedPopulation = 0;
  for (const raw of value.members) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "actor",
      "materialization",
      "populationOrdinal",
      "representedUnits",
    ])) return null;
    if (
      !nonnegativeSafeInteger(raw.populationOrdinal)
      || !positiveSafeInteger(raw.representedUnits)
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
    representedPopulation += raw.representedUnits;
    if (!Number.isSafeInteger(representedPopulation)) return null;
    members.push(Object.freeze({
      populationOrdinal: raw.populationOrdinal,
      representedUnits: raw.representedUnits,
      materialization: raw.materialization as CoreWildlifeMaterialization,
      actor,
    }));
  }
  members.sort(compareMember);
  for (let index = 1; index < members.length; index += 1) {
    if (members[index - 1]?.populationOrdinal === members[index]?.populationOrdinal) return null;
  }
  if (representedPopulation !== value.populationSize) return null;
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
    || value.tick - patch.updatedAtTick > CORE_ECOLOGY_MAX_STEP_TICKS
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

function canonicalDerivation(value: unknown): CoreEcologyPatchDerivation | null {
  if (!plainRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "bounded-input-v1" || value.kind === "legacy-fixed-v1") {
    return exactKeys(value, ["kind"])
      ? Object.freeze({ kind: value.kind })
      : null;
  }
  if (value.kind !== "habitat-v1" || !exactKeys(value, ["habitat", "kind"])) return null;
  const habitat = canonicalizeCoreEcologyHabitatAssemblage(value.habitat);
  return habitat === null ? null : Object.freeze({ kind: "habitat-v1", habitat });
}

function derivationMatchesPopulations(
  derivation: CoreEcologyPatchDerivation,
  populations: readonly CoreEcologyPopulationState[],
  originRegion: RegionCoord,
): boolean {
  if (derivation.kind !== "habitat-v1") return true;
  if (
    derivation.habitat.originRegion.x !== originRegion.x
    || derivation.habitat.originRegion.y !== originRegion.y
  ) return false;
  const byKey = new Map(populations.map((population) => [
    `${population.species}:${population.populationKey}`,
    population,
  ] as const));
  for (const analysis of derivation.habitat.populations) {
    const population = byKey.get(`${analysis.species}:${analysis.populationKey}`);
    if (analysis.populationUnits === 0) {
      if (population !== undefined) return false;
      continue;
    }
    if (
      population === undefined
      || population.populationSize !== analysis.populationUnits
      || population.members.length !== analysis.allocations.length
    ) return false;
    for (let index = 0; index < analysis.allocations.length; index += 1) {
      const allocation = analysis.allocations[index];
      const member = population.members[index];
      if (
        allocation === undefined
        || member === undefined
        || member.populationOrdinal !== allocation.allocationOrdinal
        || member.representedUnits !== allocation.representedUnits
      ) return false;
    }
    byKey.delete(`${analysis.species}:${analysis.populationKey}`);
  }
  return byKey.size === 0;
}

function groupsBelongToPatch(
  groupSet: CoreEcologyGroupSet,
  populations: readonly CoreEcologyPopulationState[],
  originRegion: RegionCoord,
  maximumTick: number,
): boolean {
  for (const group of groupSet.groups) {
    if (
      group.identity.originRegion.x !== originRegion.x
      || group.identity.originRegion.y !== originRegion.y
      || group.updatedAtTick > maximumTick
    ) return false;
    const population = populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ));
    if (population === undefined) return false;
    const ordinals = new Set(population.members.map(({ populationOrdinal }) => populationOrdinal));
    if (group.memberOrdinals.some((ordinal) => !ordinals.has(ordinal))) return false;
  }
  return true;
}

function advanceGroupsThroughTick(
  patch: CoreEcologyPatchState,
  atTick: number,
): CoreEcologyGroupSet | null {
  const groups: CoreEcologyGroupState[] = [];
  for (const initial of patch.groups.groups) {
    let group = initial;
    let steps = 0;
    const hasMaterializedMember = patch.populations.some((population) => (
      population.species === group.identity.species
      && population.populationKey === group.identity.populationKey
      && population.members.some((member) => (
        member.materialization === "materialized"
        && group.memberOrdinals.includes(member.populationOrdinal)
      ))
    ));
    while (group.nextCoarseTick <= atTick) {
      const result = hasMaterializedMember
        ? stepCoreEcologyGroupSignalCadence(group, { atTick: group.nextCoarseTick })
        : stepCoreEcologyGroupCoarse(group, {
            atTick: group.nextCoarseTick,
            disturbances: playerAbsentGroupDisturbances(patch, group, group.nextCoarseTick),
          });
      if (result === null || steps >= 8) return null;
      group = result.group;
      steps += 1;
    }
    groups.push(group);
  }
  return canonicalizeCoreEcologyGroupSet({
    version: patch.groups.version,
    groups,
  });
}

function reconcileGroupsBeforeMaterialization(
  value: CoreEcologyGroupSet,
  populations: readonly CoreEcologyPopulationState[],
  desired: ReadonlySet<string>,
  atTick: number,
): CoreEcologyGroupSet | null {
  const groups: CoreEcologyGroupState[] = [];
  for (const group of value.groups) {
    const population = populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ));
    if (population === undefined) return null;
    const members = population.members.filter(({ populationOrdinal }) =>
      group.memberOrdinals.includes(populationOrdinal));
    const changed = members.some((member) =>
      (member.materialization === "materialized")
        !== desired.has(member.actor.identity.stableId));
    if (!changed || members.every(({ materialization }) => materialization === "coarse")) {
      groups.push(group);
      continue;
    }
    const componentAnchors = group.components.map((component) => {
      const componentMembers = members
        .filter(({ populationOrdinal }) => component.memberOrdinals.includes(populationOrdinal))
        .sort(compareMember);
      const stayingMaterialized = componentMembers.find((member) => (
        member.materialization === "materialized"
        && desired.has(member.actor.identity.stableId)
      ));
      const enteringCoarse = componentMembers.find((member) => (
        member.materialization === "coarse"
        && desired.has(member.actor.identity.stableId)
      ));
      const leavingMaterialized = componentMembers.find((member) => (
        member.materialization === "materialized"
      ));
      const componentWasFullyCoarse = componentMembers.every(({ materialization }) => (
        materialization === "coarse"
      ));
      const anchor = componentWasFullyCoarse
        ? component.anchor
        : stayingMaterialized?.actor.address.position
          ?? enteringCoarse?.actor.address.position
          ?? leavingMaterialized?.actor.address.position
          ?? component.anchor;
      return componentMembers.length === 0
        ? null
        : { componentId: component.componentId, anchor };
    });
    if (componentAnchors.some((entry) => entry === null)) return null;
    const reconciled = reconcileCoreEcologyGroupAnchors(group, {
      atTick,
      componentAnchors: componentAnchors as readonly Readonly<{
        componentId: string;
        anchor: WorldPosition;
      }>[],
    });
    if (reconciled === null) return null;
    groups.push(reconciled);
  }
  return canonicalizeCoreEcologyGroupSet({ version: value.version, groups });
}

function rematerializeGroupedActor(
  member: CoreEcologyPopulationMemberState,
  population: CoreEcologyPopulationState,
  groups: CoreEcologyGroupSet,
  atTick: number,
): CoreWildlifeActorState {
  const group = groups.groups.find((candidate) => (
    candidate.identity.species === population.species
    && candidate.identity.populationKey === population.populationKey
    && candidate.memberOrdinals.includes(member.populationOrdinal)
  ));
  if (group === undefined) return member.actor;
  const component = coreEcologyGroupComponentForMember(group, member.populationOrdinal);
  if (component === null) throw new Error("Core ecology group lost a rematerializing member");
  const componentAlreadyHasMaterializedMember = population.members.some((candidate) => (
    candidate.populationOrdinal !== member.populationOrdinal
    && candidate.materialization === "materialized"
    && component.memberOrdinals.includes(candidate.populationOrdinal)
  ));
  if (componentAlreadyHasMaterializedMember) {
    // Hybrid components still own exact individual positions. Collapsing to an
    // aggregate anchor is permitted only after the whole component is dormant.
    return member.actor;
  }
  const ordinalWithinComponent = component.memberOrdinals.indexOf(member.populationOrdinal);
  const offset = rematerializationOffset(ordinalWithinComponent);
  return repositionCoreWildlifeActor(member.actor, {
    atTick,
    position: translateWithinAnchorTile(component.anchor, offset.x, offset.y),
    heading: component.heading,
  });
}

function rematerializationOffset(index: number): Readonly<{ x: number; y: number }> {
  const column = index % 5;
  const row = Math.trunc(index / 5) % 5;
  return Object.freeze({
    x: (column - 2) * 120,
    y: (row - 2) * 120,
  });
}

function translateWithinAnchorTile(
  anchor: WorldPosition,
  offsetX: number,
  offsetY: number,
): WorldPosition {
  const tileX = Math.trunc(anchor.localX / WORLD_POSITION_UNITS_PER_TILE);
  const tileY = Math.trunc(anchor.localY / WORLD_POSITION_UNITS_PER_TILE);
  const tileStartX = tileX * WORLD_POSITION_UNITS_PER_TILE;
  const tileStartY = tileY * WORLD_POSITION_UNITS_PER_TILE;
  const centerOffset = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  return createWorldPosition(
    anchor.region,
    Math.max(
      tileStartX + 1,
      Math.min(tileStartX + WORLD_POSITION_UNITS_PER_TILE - 1, tileStartX + centerOffset + offsetX),
    ),
    Math.max(
      tileStartY + 1,
      Math.min(tileStartY + WORLD_POSITION_UNITS_PER_TILE - 1, tileStartY + centerOffset + offsetY),
    ),
  );
}

function playerAbsentGroupDisturbances(
  patch: CoreEcologyPatchState,
  group: CoreEcologyGroupState,
  atTick: number,
): readonly CoreEcologyPlayerAbsentDisturbance[] {
  if (patch.derivation.kind !== "habitat-v1") return Object.freeze([]);
  const population = patch.populations.find((candidate) => (
    candidate.species === group.identity.species
    && candidate.populationKey === group.identity.populationKey
  ));
  if (
    population === undefined
    || population.members.some(({ materialization }) => materialization === "materialized")
  ) return Object.freeze([]);
  const analysis = patch.derivation.habitat.populations.find((candidate) => (
    candidate.species === group.identity.species
    && candidate.populationKey === group.identity.populationKey
  ));
  if (
    analysis === undefined
    || analysis.allocations.length < 2
    || analysis.populationPressure < 450_000
  ) return Object.freeze([]);
  const cadenceOrdinal = Math.trunc(atTick / CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS);
  const phase = Number.parseInt(hashCanonical([
    group.identity.stableId,
    "player-absent-population-pressure",
  ]).slice(0, 8), 16) % 8;
  if (cadenceOrdinal % 8 !== phase) return Object.freeze([]);
  const start = cadenceOrdinal % analysis.allocations.length;
  const first = analysis.allocations[start];
  const second = analysis.allocations[(start + 1) % analysis.allocations.length];
  if (first === undefined || second === undefined) return Object.freeze([]);
  const pressure = Math.min(
    1_000_000,
    450_000 + Math.trunc(analysis.populationPressure / 2),
  );
  return Object.freeze([Object.freeze({
    disturbanceId: `population-pressure:${hashCanonical([
      group.identity.stableId,
      atTick,
      analysis.populationPressure,
    ])}`,
    atTick,
    causeKind: "habitat-pressure" as const,
    causeReferenceId: analysis.populationKey,
    pressure,
    movementHeading: cadenceOrdinal * 131_071 % 1_000_000,
    destinationAnchors: Object.freeze([first.position, second.position]),
    rendezvousAnchor: first.position,
    playerAbsent: true as const,
    nonlethal: true as const,
    cargoInteraction: false as const,
  })]);
}

function ingestMaterializedAlarmSignals(
  value: CoreEcologyGroupSet,
  populations: readonly CoreEcologyPopulationState[],
  events: readonly CoreWildlifeCausalEvent[],
  atTick: number,
): CoreEcologyGroupSet | null {
  const groups = [...value.groups];
  for (const event of events) {
    if (event.kind !== "alarm" || event.species === "black-bear") continue;
    const population = populations.find((candidate) => (
      candidate.species === event.species
      && candidate.members.some(({ actor }) => actor.identity.stableId === event.actorId)
    ));
    const member = population?.members.find(({ actor }) => actor.identity.stableId === event.actorId);
    if (population === undefined || member === undefined) return null;
    const groupIndex = groups.findIndex((group) => (
      group.identity.species === population.species
      && group.identity.populationKey === population.populationKey
      && group.memberOrdinals.includes(member.populationOrdinal)
    ));
    if (groupIndex < 0) continue;
    const group = groups[groupIndex];
    if (group === undefined) return null;
    const signaled = emitCoreEcologyGroupSignal(group, {
      atTick,
      kind: "alarm",
      causeReferenceId: event.eventId,
      sourceMemberOrdinal: member.populationOrdinal,
      pressure: Math.max(1, getCoreWildlifeProfile(event.species).behavior.alarmThreshold),
      movementHeading: member.actor.address.heading,
    });
    // A saturated bounded signal queue drops the newest social echo; the
    // physical alarm event and lawful hearing observations remain authoritative.
    if (signaled !== null) groups[groupIndex] = signaled;
  }
  return canonicalizeCoreEcologyGroupSet({ version: value.version, groups });
}

interface LegacyCoreEcologyPopulationMemberState {
  readonly populationOrdinal: number;
  readonly materialization: CoreWildlifeMaterialization;
  readonly actor: CoreWildlifeActorState;
}

interface LegacyCoreEcologyPopulationState {
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  readonly populationSize: number;
  readonly members: readonly LegacyCoreEcologyPopulationMemberState[];
}

interface LegacyCoreEcologyPatchState {
  readonly version: typeof LEGACY_CORE_ECOLOGY_PATCH_VERSION;
  readonly patchKey: string;
  readonly originRegion: RegionCoord;
  readonly updatedAtTick: number;
  readonly populations: readonly LegacyCoreEcologyPopulationState[];
}

function canonicalizeLegacyCoreEcologyPatch(value: unknown): LegacyCoreEcologyPatchState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "originRegion",
    "patchKey",
    "populations",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== LEGACY_CORE_ECOLOGY_PATCH_VERSION
    || !validPatchKey(value.patchKey)
    || !isRegionCoord(value.originRegion)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !Array.isArray(value.populations)
    || value.populations.length === 0
    || value.populations.length > CORE_ECOLOGY_MAX_POPULATIONS
  ) return null;
  const actorIds = new Set<string>();
  const populations: LegacyCoreEcologyPopulationState[] = [];
  let memberCount = 0;
  let materializedCount = 0;
  for (const rawPopulation of value.populations) {
    if (!plainRecord(rawPopulation) || !exactKeys(rawPopulation, [
      "members",
      "populationKey",
      "populationSize",
      "species",
    ])) return null;
    if (
      !CORE_WILDLIFE_SPECIES.includes(rawPopulation.species as CoreWildlifeSpecies)
      || !validPatchKey(rawPopulation.populationKey)
      || !positiveSafeInteger(rawPopulation.populationSize)
      || !Array.isArray(rawPopulation.members)
      || rawPopulation.members.length !== rawPopulation.populationSize
    ) return null;
    const species = rawPopulation.species as CoreWildlifeSpecies;
    if (rawPopulation.members.length > getCoreWildlifeProfile(species).maximumPatchPopulation) {
      return null;
    }
    const members: LegacyCoreEcologyPopulationMemberState[] = [];
    for (const rawMember of rawPopulation.members) {
      if (!plainRecord(rawMember) || !exactKeys(rawMember, [
        "actor",
        "materialization",
        "populationOrdinal",
      ])) return null;
      if (
        !nonnegativeSafeInteger(rawMember.populationOrdinal)
        || !MATERIALIZATION.has(rawMember.materialization as string)
      ) return null;
      const actor = canonicalizeCoreWildlifeActorState(rawMember.actor);
      if (
        actor === null
        || actor.updatedAtTick > value.updatedAtTick
        || actor.identity.species !== species
        || actor.identity.populationKey !== rawPopulation.populationKey
        || actor.identity.populationOrdinal !== rawMember.populationOrdinal
        || actor.identity.originRegion.x !== value.originRegion.x
        || actor.identity.originRegion.y !== value.originRegion.y
        || actorIds.has(actor.identity.stableId)
      ) return null;
      actorIds.add(actor.identity.stableId);
      members.push(Object.freeze({
        populationOrdinal: rawMember.populationOrdinal,
        materialization: rawMember.materialization as CoreWildlifeMaterialization,
        actor,
      }));
      memberCount += 1;
      if (rawMember.materialization === "materialized") materializedCount += 1;
    }
    members.sort(compareMember);
    for (let index = 1; index < members.length; index += 1) {
      if (members[index - 1]?.populationOrdinal === members[index]?.populationOrdinal) return null;
    }
    populations.push(Object.freeze({
      species,
      populationKey: rawPopulation.populationKey,
      populationSize: rawPopulation.populationSize,
      members: Object.freeze(members),
    }));
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
    version: LEGACY_CORE_ECOLOGY_PATCH_VERSION,
    patchKey: value.patchKey,
    originRegion: createRegionCoord(value.originRegion.x, value.originRegion.y),
    updatedAtTick: value.updatedAtTick,
    populations,
  });
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
