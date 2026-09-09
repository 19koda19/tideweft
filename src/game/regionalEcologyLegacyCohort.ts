import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  regionKey,
  type RegionCoord,
} from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyAggregatePopulationState,
  type CoreEcologyPopulationMemberState,
  type CoreEcologyPopulationState,
} from "./coreEcology";
import type { CoreEcologyGroupState } from "./coreEcologyGroups";
import { CORE_ECOLOGY_DOMESTIC_SPECIES } from "./coreEcologyRegionalHabitat";
import { canonicalizeCoreWildlifeActorState } from "./coreWildlifeActor";
import type { CoreWildlifeCarcass } from "./coreWildlifeCarcass";
import {
  canonicalRegionalEcologyRootForWorld,
  type RegionalEcologyActorDispositionV1,
  type RegionalEcologyRootV1,
} from "./regionalEcology";
import {
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const REGIONAL_ECOLOGY_LEGACY_COHORT_OWNER_ID =
  "game:regional-ecology-legacy-cohort:v1" as const;

export interface ProjectRegionalEcologyLegacyCohortInput {
  readonly rootSeed: RootSeed;
  /** Must be the exact canonical regional root carrying the v24 adoption receipt. */
  readonly root: RegionalEcologyRootV1;
}

export interface RegionalEcologyLegacyCohortWorldBinding
  extends ProjectRegionalEcologyLegacyCohortInput {
  readonly completedTick: number;
}

/**
 * Projects the finite v24 compatibility population into one stepable source.
 * The immutable source patch remains audit evidence in RegionalEcologyRoot;
 * this patch is the active owner at the receipt's committed placements. This
 * constructor is valid only at the adoption tick; later roots must load their
 * authenticated write-back snapshot instead of replaying the receipt.
 */
export function projectRegionalEcologyLegacyCohort(
  input: ProjectRegionalEcologyLegacyCohortInput,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(input)
    || !plainRecord(input.root)
    || !nonnegativeSafeInteger(input.root.updatedAtTick)
  ) return null;
  const root = canonicalRegionalEcologyRootForWorld(input.root, {
    rootSeed: input.rootSeed,
    completedTick: input.root.updatedAtTick,
  });
  if (
    root === null
    || root.adoption === null
    || root.updatedAtTick !== root.adoption.sourceCompletedTick
  ) return null;
  return projectCanonicalRoot(root);
}

/** Exact trust boundary for the first all-coarse receipt projection. */
export function canonicalRegionalEcologyLegacyCohortInitialProjection(
  value: unknown,
  binding: RegionalEcologyLegacyCohortWorldBinding,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalBoundRoot(binding);
  if (
    root === null
    || root.adoption === null
    || binding.completedTick !== root.adoption.sourceCompletedTick
  ) return null;
  const expected = projectCanonicalRoot(root);
  const patch = canonicalExactPatch(value);
  return expected !== null
      && patch !== null
      && stableStringify(patch) === stableStringify(expected)
    ? patch
    : null;
}

/**
 * Strict world binding for a later stepped/write-back state. It holds the
 * receipt-derived membership and immutable lineage closed while allowing the
 * canonical ecology kernel to evolve physiology, cognition, movement,
 * grouping signals, aggregate activity, mortality, and bodies.
 */
export function canonicalRegionalEcologyLegacyCohortPatchForWorld(
  value: unknown,
  binding: RegionalEcologyLegacyCohortWorldBinding,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalBoundRoot(binding);
  const patch = canonicalExactPatch(value);
  if (
    root === null
    || patch === null
    || patch.updatedAtTick !== binding.completedTick
  ) return null;
  const baseline = projectCanonicalRoot(root);
  return baseline !== null && legacyLineageMatches(baseline, patch)
    ? patch
    : null;
}

/**
 * Transition fence for the full-snapshot write-back owner. Past deaths and
 * physical bodies cannot be edited away even when bounded presentation/event
 * tails legitimately rotate.
 */
export function canonicalRegionalEcologyLegacyCohortTransition(
  previousValue: unknown,
  nextValue: unknown,
  binding: RegionalEcologyLegacyCohortWorldBinding,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalBoundRoot(binding);
  const previous = canonicalExactPatch(previousValue);
  const next = canonicalExactPatch(nextValue);
  if (
    root === null
    || previous === null
    || next === null
    || previous.updatedAtTick > binding.completedTick
    || next.updatedAtTick !== binding.completedTick
    || next.updatedAtTick < previous.updatedAtTick
  ) return null;
  const baseline = projectCanonicalRoot(root);
  if (
    baseline === null
    || !legacyLineageMatches(baseline, previous)
    || !legacyLineageMatches(baseline, next)
    || !mortalityPrefix(previous, next)
    || !bodyHistoryAdvances(previous.carcasses, next.carcasses)
  ) return null;
  return next;
}

/** Current physical residence index for root-wide hot-region activation. */
export function regionalEcologyLegacyCohortResidentRegions(
  value: unknown,
): readonly RegionCoord[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null || patch.derivation.kind !== "legacy-cohort-v1") return null;
  const regions = new Map<string, RegionCoord>();
  const add = (position: WorldPosition): void => {
    regions.set(regionKey(position.region), copyRegion(position.region));
  };
  for (const population of patch.populations) {
    for (const member of population.members) add(member.actor.address.position);
  }
  for (const group of patch.groups.groups) {
    add(group.rendezvousAnchor);
    for (const component of group.components) add(component.anchor);
  }
  for (const aggregate of patch.aggregatePopulations) {
    for (const anchor of aggregate.anchors) add(anchor.position);
  }
  for (const body of patch.carcasses) add(body.deathPosition);
  return Object.freeze([...regions.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, region]) => region));
}

function projectCanonicalRoot(
  root: RegionalEcologyRootV1,
): CoreEcologyAggregatePatchState | null {
  const adoption = root.adoption;
  const cohort = root.legacyCohort;
  if (adoption === null || cohort === null) return null;
  const source = cohort.sourcePatch;
  const actorDispositions = new Map(adoption.actorDispositions.map((entry) => (
    [entry.actorId, entry] as const
  )));
  const groupDispositions = new Map(adoption.groupDispositions.map((entry) => (
    [entry.groupId, entry] as const
  )));
  const aggregateDispositions = new Map(adoption.aggregateDispositions.map((entry) => (
    [entry.aggregateId, entry] as const
  )));
  const retiredActorIds = new Set(cohort.retirements.map(({ actorId }) => actorId));
  const retiredAggregateIds = new Set(
    cohort.aggregateRetirements.map(({ aggregateId }) => aggregateId),
  );

  const populations: CoreEcologyPopulationState[] = [];
  for (const population of source.populations) {
    const projected = projectPopulation(
      population,
      actorDispositions,
      retiredActorIds,
    );
    if (projected === null) return null;
    if (projected.baselinePopulationSize > 0) populations.push(projected);
  }

  const livingIds = new Set(populations.flatMap(({ members }) => (
    members.map(({ actor }) => actor.identity.stableId)
  )));
  const groups: CoreEcologyGroupState[] = [];
  for (const group of source.groups.groups) {
    if (CORE_ECOLOGY_DOMESTIC_SPECIES.includes(group.identity.species)) continue;
    const disposition = groupDispositions.get(group.identity.stableId);
    if (
      disposition === undefined
      || disposition.sourceStateHash !== hashCanonical(group)
    ) return null;
    if (disposition.disposition === "retired") {
      if (disposition.destinationRegion !== null) return null;
      continue;
    }
    if (
      disposition.destinationRegion === null
      || disposition.memberActorIds.some((actorId) => !livingIds.has(actorId))
    ) return null;
    groups.push(disposition.disposition === "redistributed"
      ? relocateCurrentGroupResidence(group, disposition.destinationRegion)
      : group);
  }

  const aggregatePopulations: CoreEcologyAggregatePopulationState[] = [];
  for (const aggregate of source.aggregatePopulations) {
    // Storehouse rats belong to the settlement-home owner, never open country.
    if (aggregate.species === "brown-rat") continue;
    const disposition = aggregateDispositions.get(aggregate.aggregateId);
    if (
      disposition === undefined
      || disposition.sourceStateHash !== hashCanonical(aggregate)
      || disposition.sourcePopulationSize !== aggregate.populationSize
    ) return null;
    if (disposition.disposition === "retired") {
      if (!retiredAggregateIds.has(aggregate.aggregateId)) return null;
      continue;
    }
    if (
      disposition.destinationRegion === null
      || disposition.postAdoptionPopulationSize !== aggregate.populationSize
      || retiredAggregateIds.has(aggregate.aggregateId)
    ) return null;
    aggregatePopulations.push(relocateAggregateResidence(
      aggregate,
      disposition.destinationRegion,
    ));
  }

  const candidate = {
    version: CORE_ECOLOGY_AGGREGATE_PATCH_VERSION,
    patchKey: legacySourceKey(root),
    originRegion: copyRegion(source.originRegion),
    updatedAtTick: root.updatedAtTick,
    derivation: {
      kind: "legacy-cohort-v1" as const,
      adoptionTransactionId: adoption.transactionId,
      rootSeedFingerprint: adoption.rootSeedFingerprint,
      sourcePatchHash: cohort.sourcePatchHash,
    },
    groups: {
      version: source.groups.version,
      groups,
    },
    populations,
    aggregatePopulations,
    nextMortalityOrdinal: source.nextMortalityOrdinal,
    mortalityTransactions: source.mortalityTransactions,
    carcasses: source.carcasses,
  };
  return canonicalizeCoreEcologyAggregatePatch(candidate);
}

function projectPopulation(
  source: CoreEcologyPopulationState,
  dispositions: ReadonlyMap<string, RegionalEcologyActorDispositionV1>,
  retiredActorIds: ReadonlySet<string>,
): CoreEcologyPopulationState | null {
  const domestic = CORE_ECOLOGY_DOMESTIC_SPECIES.includes(source.species);
  const members: CoreEcologyPopulationMemberState[] = [];
  let removedUnits = domestic ? source.reserveUnits : 0;
  for (const member of source.members) {
    const actorId = member.actor.identity.stableId;
    const disposition = dispositions.get(actorId);
    if (
      disposition === undefined
      || disposition.sourceStateHash !== hashCanonical(member.actor)
      || disposition.species !== source.species
      || disposition.populationKey !== source.populationKey
      || disposition.populationOrdinal !== member.populationOrdinal
      || disposition.representedUnits !== member.representedUnits
    ) return null;
    if (domestic || disposition.disposition === "retired") {
      removedUnits += member.representedUnits;
      if (!domestic && !retiredActorIds.has(actorId)) return null;
      continue;
    }
    if (disposition.destinationPosition === null || retiredActorIds.has(actorId)) return null;
    const actor = canonicalizeCoreWildlifeActorState({
      ...member.actor,
      address: {
        ...member.actor.address,
        position: disposition.destinationPosition,
      },
    });
    if (actor === null) return null;
    members.push(Object.freeze({
      populationOrdinal: member.populationOrdinal,
      representedUnits: member.representedUnits,
      materialization: "coarse" as const,
      actor,
    }));
  }
  const baselinePopulationSize = source.baselinePopulationSize - removedUnits;
  const populationSize = source.populationSize - removedUnits;
  const reserveUnits = domestic ? 0 : source.reserveUnits;
  if (
    baselinePopulationSize < 0
    || populationSize < 0
    || populationSize < reserveUnits
  ) return null;
  return Object.freeze({
    species: source.species,
    populationKey: source.populationKey,
    baselinePopulationSize,
    populationSize,
    reserveUnits,
    members: Object.freeze(members),
  });
}

function relocateCurrentGroupResidence(
  group: CoreEcologyGroupState,
  region: RegionCoord,
): CoreEcologyGroupState {
  const relocate = (position: WorldPosition): WorldPosition => createWorldPosition(
    region,
    position.localX,
    position.localY,
  );
  return Object.freeze({
    ...group,
    components: Object.freeze(group.components.map((component) => Object.freeze({
      ...component,
      anchor: relocate(component.anchor),
    }))),
    rendezvousAnchor: relocate(group.rendezvousAnchor),
  });
}

function relocateAggregateResidence(
  aggregate: CoreEcologyAggregatePopulationState,
  region: RegionCoord,
): CoreEcologyAggregatePopulationState {
  return Object.freeze({
    ...aggregate,
    anchors: Object.freeze(aggregate.anchors.map((anchor) => Object.freeze({
      ...anchor,
      position: createWorldPosition(region, anchor.position.localX, anchor.position.localY),
    }))),
  });
}

function legacyLineageMatches(
  baseline: CoreEcologyAggregatePatchState,
  patch: CoreEcologyAggregatePatchState,
): boolean {
  if (
    patch.patchKey !== baseline.patchKey
    || !sameRegion(patch.originRegion, baseline.originRegion)
    || stableStringify(patch.derivation) !== stableStringify(baseline.derivation)
    || patch.updatedAtTick < baseline.mortalityTransactions.reduce(
      (tick, transaction) => Math.max(tick, transaction.event.atTick),
      0,
    )
    || !mortalityPrefix(baseline, patch)
    || !bodyHistoryAdvances(baseline.carcasses, patch.carcasses)
  ) return false;

  const baselinePopulations = new Map(baseline.populations.map((population) => (
    [populationIdentity(population), population] as const
  )));
  if (patch.populations.length !== baselinePopulations.size) return false;
  for (const population of patch.populations) {
    const expected = baselinePopulations.get(populationIdentity(population));
    if (
      expected === undefined
      || population.baselinePopulationSize !== expected.baselinePopulationSize
    ) return false;
  }

  const expectedActors = actorIdentityMap(baseline);
  const actualActors = actorIdentityMap(patch);
  if (expectedActors.size !== actualActors.size) return false;
  for (const [actorId, expected] of expectedActors) {
    const actual = actualActors.get(actorId);
    if (
      actual === undefined
      || stableStringify(actual.identity) !== stableStringify(expected.identity)
      || actual.updatedAtTick < expected.updatedAtTick
      || actual.representedUnits !== expected.representedUnits
    ) return false;
  }

  const baselineGroups = new Map(baseline.groups.groups.map((group) => (
    [group.identity.stableId, group] as const
  )));
  if (patch.groups.groups.length !== baselineGroups.size) return false;
  for (const group of patch.groups.groups) {
    const expected = baselineGroups.get(group.identity.stableId);
    if (
      expected === undefined
      || stableStringify(group.identity) !== stableStringify(expected.identity)
      || stableStringify(group.memberOrdinals) !== stableStringify(expected.memberOrdinals)
      || group.updatedAtTick < expected.updatedAtTick
      || group.revision < expected.revision
      || group.nextComponentOrdinal < expected.nextComponentOrdinal
      || group.nextLineageOrdinal < expected.nextLineageOrdinal
    ) return false;
  }

  const baselineAggregates = new Map(baseline.aggregatePopulations.map((aggregate) => (
    [aggregate.aggregateId, aggregate] as const
  )));
  if (patch.aggregatePopulations.length !== baselineAggregates.size) return false;
  for (const aggregate of patch.aggregatePopulations) {
    const expected = baselineAggregates.get(aggregate.aggregateId);
    if (expected === undefined || !aggregateLineageMatches(expected, aggregate)) return false;
  }
  return true;
}

function actorIdentityMap(
  patch: CoreEcologyAggregatePatchState,
): ReadonlyMap<string, Readonly<{
  readonly identity: CoreEcologyPopulationMemberState["actor"]["identity"];
  readonly updatedAtTick: number;
  readonly representedUnits: number;
}>> {
  const result = new Map<string, Readonly<{
    readonly identity: CoreEcologyPopulationMemberState["actor"]["identity"];
    readonly updatedAtTick: number;
    readonly representedUnits: number;
  }>>();
  for (const population of patch.populations) {
    for (const member of population.members) {
      result.set(member.actor.identity.stableId, {
        identity: member.actor.identity,
        updatedAtTick: member.actor.updatedAtTick,
        representedUnits: member.representedUnits,
      });
    }
  }
  for (const transaction of patch.mortalityTransactions) {
    result.set(transaction.retiredActor.identity.stableId, {
      identity: transaction.retiredActor.identity,
      updatedAtTick: transaction.retiredActor.updatedAtTick,
      representedUnits: transaction.representedUnitsBefore,
    });
  }
  return result;
}

function aggregateLineageMatches(
  baseline: CoreEcologyAggregatePopulationState,
  value: CoreEcologyAggregatePopulationState,
): boolean {
  if (
    value.seedFingerprint !== baseline.seedFingerprint
    || value.species !== baseline.species
    || value.representation !== baseline.representation
    || value.populationKey !== baseline.populationKey
    || value.habitatCapacity !== baseline.habitatCapacity
    || value.populationSize !== baseline.populationSize
    || value.anchors.length !== baseline.anchors.length
    || value.revision < baseline.revision
    || value.updatedAtTick < baseline.updatedAtTick
    || value.nextEvidenceOrdinal < baseline.nextEvidenceOrdinal
    || value.nextDisturbanceOrdinal < baseline.nextDisturbanceOrdinal
    || (baseline.lastTidalRedistributionTick !== null
      && (value.lastTidalRedistributionTick === null
        || value.lastTidalRedistributionTick < baseline.lastTidalRedistributionTick))
  ) return false;
  for (let index = 0; index < baseline.anchors.length; index += 1) {
    const expected = baseline.anchors[index];
    const actual = value.anchors[index];
    if (
      expected === undefined
      || actual === undefined
      || actual.anchorOrdinal !== expected.anchorOrdinal
      || actual.radiusUnits !== expected.radiusUnits
      || stableStringify(actual.position) !== stableStringify(expected.position)
    ) return false;
  }
  const baselineEvidence = new Map(baseline.evidence.map((entry) => (
    [entry.evidenceOrdinal, entry] as const
  )));
  for (const entry of value.evidence) {
    const expected = baselineEvidence.get(entry.evidenceOrdinal);
    if (expected !== undefined && stableStringify(entry) !== stableStringify(expected)) return false;
  }
  const baselineDisturbances = new Map(baseline.disturbances.map((entry) => (
    [entry.disturbanceOrdinal, entry] as const
  )));
  for (const entry of value.disturbances) {
    const expected = baselineDisturbances.get(entry.disturbanceOrdinal);
    if (expected !== undefined && stableStringify(entry) !== stableStringify(expected)) return false;
  }
  return true;
}

function mortalityPrefix(
  previous: CoreEcologyAggregatePatchState,
  next: CoreEcologyAggregatePatchState,
): boolean {
  if (
    next.nextMortalityOrdinal < previous.nextMortalityOrdinal
    || next.mortalityTransactions.length < previous.mortalityTransactions.length
  ) return false;
  for (let index = 0; index < previous.mortalityTransactions.length; index += 1) {
    if (
      stableStringify(next.mortalityTransactions[index])
        !== stableStringify(previous.mortalityTransactions[index])
    ) return false;
  }
  const originalLivingIds = new Set(previous.populations.flatMap(({ members }) => (
    members.map(({ actor }) => actor.identity.stableId)
  )));
  for (const transaction of next.mortalityTransactions.slice(
    previous.mortalityTransactions.length,
  )) {
    // This transition owns the victim lineage, not every actor capable of
    // harming it. The root-wide contact resolver authenticates an external
    // attacker's current owner before committing only the victim-side death.
    // Requiring the attacker here would make a valid cross-owner kill
    // impossible while still requiring the victim to have been live in this
    // exact pre-step legacy snapshot.
    if (!originalLivingIds.has(transaction.event.victimId)) return false;
  }
  return true;
}

function bodyHistoryAdvances(
  previous: readonly CoreWildlifeCarcass[],
  next: readonly CoreWildlifeCarcass[],
): boolean {
  if (next.length < previous.length) return false;
  const nextById = new Map(next.map((body) => [body.carcassId, body] as const));
  for (const body of previous) {
    const candidate = nextById.get(body.carcassId);
    if (
      candidate === undefined
      || stableStringify(bodyIdentity(candidate)) !== stableStringify(bodyIdentity(body))
      || candidate.updatedAtTick < body.updatedAtTick
      || candidate.condition.updatedAtTick < body.condition.updatedAtTick
      || candidate.condition.decay < body.condition.decay
      || candidate.remainingResourceUnits > body.remainingResourceUnits
      || candidate.consumedResourceUnits < body.consumedResourceUnits
      || candidate.decayedResourceUnits < body.decayedResourceUnits
      || (body.retiredAtTick !== null && candidate.retiredAtTick !== body.retiredAtTick)
    ) return false;
  }
  return true;
}

function bodyIdentity(body: CoreWildlifeCarcass): unknown {
  return {
    version: body.version,
    carcassId: body.carcassId,
    sourceMortalityEventId: body.sourceMortalityEventId,
    sourceActorId: body.sourceActorId,
    sourceSpecies: body.sourceSpecies,
    deathPosition: body.deathPosition,
    deathAtTick: body.deathAtTick,
    bodySizeUnits: body.bodySizeUnits,
    originalResourceUnits: body.originalResourceUnits,
    disclosure: body.disclosure,
  };
}

function legacySourceKey(root: RegionalEcologyRootV1): string {
  const adoption = root.adoption;
  const cohort = root.legacyCohort;
  if (adoption === null || cohort === null) {
    throw new RangeError("Legacy source key requires a committed v24 adoption");
  }
  return `legacy-cohort-v1:${hashCanonical({
    ownerId: REGIONAL_ECOLOGY_LEGACY_COHORT_OWNER_ID,
    transactionId: adoption.transactionId,
    sourcePatchHash: cohort.sourcePatchHash,
    resultEcologyStateHash: adoption.resultEcologyStateHash,
  })}`;
}

function canonicalBoundRoot(
  binding: RegionalEcologyLegacyCohortWorldBinding,
): RegionalEcologyRootV1 | null {
  if (
    !plainRecord(binding)
    || !plainRecord(binding.root)
    || !nonnegativeSafeInteger(binding.completedTick)
    || binding.root.updatedAtTick !== binding.completedTick
  ) return null;
  return canonicalRegionalEcologyRootForWorld(binding.root, {
    rootSeed: binding.rootSeed,
    completedTick: binding.completedTick,
  });
}

function canonicalExactPatch(value: unknown): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  return patch !== null && stableStringify(patch) === stableStringify(value)
    ? patch
    : null;
}

function populationIdentity(
  population: Pick<CoreEcologyPopulationState, "species" | "populationKey">,
): string {
  return `${population.species.length}:${population.species}:${population.populationKey}`;
}

function sameRegion(left: RegionCoord, right: RegionCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

function copyRegion(value: RegionCoord): RegionCoord {
  if (!isRegionCoord(value)) throw new RangeError("Legacy cohort region is malformed");
  return createRegionCoord(value.x, value.y);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
