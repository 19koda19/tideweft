import type { RootSeed } from "../sim/rng";
import { stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationMemberState,
  type CoreEcologyPopulationState,
} from "./coreEcology";
import type { CoreEcologyActivityAffordanceSpecies } from "./coreEcologyActivityAffordance";
import {
  type CoreEcologyHabitatAllocation,
  type CoreEcologyTidalWebHabitatAnchor,
} from "./coreEcologyHabitat";
import {
  deriveCoreEcologyRegionalActivityAnchors,
  deriveCoreEcologyRegionalHabitat,
  type CoreEcologyRegionalActivitySpecies,
} from "./coreEcologyRegionalHabitat";
import {
  canonicalRegionalEcologyRootForWorld,
  type RegionalEcologyRootV1,
} from "./regionalEcology";
import { canonicalRegionalEcologyLegacyCohortPatchForWorld } from "./regionalEcologyLegacyCohort";
import { canonicalCoreEcologyRegionalResidentPatchForRoot } from "./regionalEcologyResidents";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_ACTIVITY_AUTHORITY_VERSION = 1 as const;
export const CORE_ECOLOGY_ACTIVITY_AUTHORITY_OWNER_ID =
  "game:core-ecology-activity-authority:v1" as const;

export type CoreEcologyActivityAuthorityProvenance =
  | "legacy-habitat"
  | "regional-habitat";

/**
 * Transient, authenticated destination custody for one bounded activity actor.
 * This is deliberately absent from the regional root/save schema: it can be
 * reprojected from the exact root, source patch, seed, and migration receipt.
 */
export interface CoreEcologyActivityAuthorityV1 {
  readonly version: typeof CORE_ECOLOGY_ACTIVITY_AUTHORITY_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_ACTIVITY_AUTHORITY_OWNER_ID;
  readonly sourceKey: string;
  readonly actorId: string;
  readonly species: CoreEcologyActivityAffordanceSpecies;
  readonly provenance: CoreEcologyActivityAuthorityProvenance;
  readonly homeAnchor: WorldPosition;
  readonly tidalAnchors: readonly CoreEcologyTidalWebHabitatAnchor[];
}

export interface ProjectCoreEcologyActivityAuthorityInput {
  readonly rootSeed: RootSeed;
  readonly root: RegionalEcologyRootV1;
  readonly sourceKind: "regional-habitat" | "legacy-cohort";
  readonly patch: CoreEcologyAggregatePatchState;
  readonly actorId: string;
}

const ACTIVITY_SPECIES = new Set<CoreEcologyActivityAffordanceSpecies>([
  "fish-crow",
  "northern-harrier",
  "snowy-egret",
  "american-black-duck",
  "north-american-river-otter",
  "gull",
]);
const AUTHENTIC_AUTHORITIES = new WeakSet<object>();

/**
 * Reprojects one actor's activity destinations from its current lawful owner.
 * Migrated residents use the receipt destination; only retained residents may
 * continue to use the frozen v24 habitat allocation.
 */
export function projectCoreEcologyActivityAuthority(
  input: ProjectCoreEcologyActivityAuthorityInput,
): CoreEcologyActivityAuthorityV1 | null {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["actorId", "patch", "root", "rootSeed", "sourceKind"])
    || typeof input.actorId !== "string"
    || input.actorId.length === 0
    || input.actorId.length > 256
    || (input.sourceKind !== "regional-habitat" && input.sourceKind !== "legacy-cohort")
  ) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(input.patch);
  if (patch === null || stableStringify(patch) !== stableStringify(input.patch)) return null;
  const root = canonicalRegionalEcologyRootForWorld(input.root, {
    rootSeed: input.rootSeed,
    completedTick: patch.updatedAtTick,
  });
  if (root === null || root.updatedAtTick !== patch.updatedAtTick) return null;
  return input.sourceKind === "regional-habitat"
    ? projectRegionalAuthority(input.rootSeed, root, patch, input.actorId)
    : projectLegacyAuthority(input.rootSeed, root, patch, input.actorId);
}

/** Only in-process projector products are accepted by the activity kernel. */
export function isTrustedCoreEcologyActivityAuthority(
  value: unknown,
): value is CoreEcologyActivityAuthorityV1 {
  return typeof value === "object"
    && value !== null
    && AUTHENTIC_AUTHORITIES.has(value);
}

function projectRegionalAuthority(
  rootSeed: RootSeed,
  root: RegionalEcologyRootV1,
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): CoreEcologyActivityAuthorityV1 | null {
  const canonical = canonicalCoreEcologyRegionalResidentPatchForRoot(patch, {
    seed: rootSeed,
    root,
    region: patch.originRegion,
    completedTick: patch.updatedAtTick,
  });
  if (
    canonical === null
    || (canonical.derivation.kind !== "regional-habitat-v1"
      && canonical.derivation.kind !== "regional-habitat-v1-with-adoption-suppression")
  ) return null;
  const owned = findActivityActor(canonical, actorId);
  if (owned === null) return null;
  const habitatPopulation = canonical.derivation.habitat.populations.find((candidate) => (
    candidate.species === owned.species
    && candidate.populationKey === owned.population.populationKey
  ));
  const anchor = habitatPopulation?.anchors[owned.member.populationOrdinal];
  if (anchor === undefined) return null;
  const homeAnchor = createWorldPosition(
    canonical.originRegion,
    anchor.localX * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    anchor.localY * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
  return regionalAuthority(
    rootSeed,
    canonical.patchKey,
    actorId,
    owned.species,
    homeAnchor,
  );
}

function projectLegacyAuthority(
  rootSeed: RootSeed,
  root: RegionalEcologyRootV1,
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): CoreEcologyActivityAuthorityV1 | null {
  const canonical = canonicalRegionalEcologyLegacyCohortPatchForWorld(patch, {
    rootSeed,
    root,
    completedTick: patch.updatedAtTick,
  });
  if (canonical === null || canonical.derivation.kind !== "legacy-cohort-v1") return null;
  const owned = findActivityActor(canonical, actorId);
  const disposition = root.adoption?.actorDispositions.find((entry) => (
    entry.actorId === actorId
  ));
  if (
    owned === null
    || disposition === undefined
    || disposition.disposition === "retired"
    || disposition.destinationPosition === null
    || disposition.species !== owned.species
    || disposition.populationKey !== owned.population.populationKey
    || disposition.populationOrdinal !== owned.member.populationOrdinal
  ) return null;
  if (disposition.disposition === "redistributed") {
    return regionalAuthority(
      rootSeed,
      canonical.patchKey,
      actorId,
      owned.species,
      disposition.destinationPosition,
    );
  }

  const source = root.legacyCohort?.sourcePatch;
  if (source === undefined || !isLegacyActivityHabitatDerivation(source)) return null;
  const sourceOwned = findActivityActor(source, actorId);
  if (
    sourceOwned === null
    || sourceOwned.species !== owned.species
    || sourceOwned.population.populationKey !== owned.population.populationKey
    || sourceOwned.member.populationOrdinal !== owned.member.populationOrdinal
  ) return null;
  const allocation = habitatAllocation(source, sourceOwned.population, sourceOwned.member);
  if (allocation === null) return null;
  const anchors = "tidalAnchors" in source.derivation.habitat
    ? source.derivation.habitat.tidalAnchors.filter(({ species }) => species === owned.species)
    : [];
  return makeAuthority({
    sourceKey: canonical.patchKey,
    actorId,
    species: owned.species,
    provenance: "legacy-habitat",
    homeAnchor: allocation.position,
    tidalAnchors: anchors,
  });
}

function regionalAuthority(
  rootSeed: RootSeed,
  sourceKey: string,
  actorId: string,
  species: CoreEcologyActivityAffordanceSpecies,
  homeAnchor: WorldPosition,
): CoreEcologyActivityAuthorityV1 | null {
  const habitat = deriveCoreEcologyRegionalHabitat({
    seed: rootSeed,
    region: homeAnchor.region,
  });
  const anchors = deriveCoreEcologyRegionalActivityAnchors({
    seed: rootSeed,
    habitat,
    species: species as CoreEcologyRegionalActivitySpecies,
    homeAnchor,
  });
  return anchors === null
    ? null
    : makeAuthority({
        sourceKey,
        actorId,
        species,
        provenance: "regional-habitat",
        homeAnchor: anchors.homeAnchor,
        tidalAnchors: anchors.tidalAnchors,
      });
}

function makeAuthority(input: Omit<
  CoreEcologyActivityAuthorityV1,
  "ownerId" | "version"
>): CoreEcologyActivityAuthorityV1 {
  const authority = deepFreeze({
    version: CORE_ECOLOGY_ACTIVITY_AUTHORITY_VERSION,
    ownerId: CORE_ECOLOGY_ACTIVITY_AUTHORITY_OWNER_ID,
    ...input,
    homeAnchor: copyPosition(input.homeAnchor),
    tidalAnchors: Object.freeze(input.tidalAnchors.map(copyTidalAnchor)),
  });
  AUTHENTIC_AUTHORITIES.add(authority);
  return authority;
}

function copyTidalAnchor(
  anchor: CoreEcologyTidalWebHabitatAnchor,
): CoreEcologyTidalWebHabitatAnchor {
  return Object.freeze({
    ...anchor,
    globalTile: Object.freeze({ ...anchor.globalTile }),
    position: copyPosition(anchor.position),
  });
}

function copyPosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(position.region, position.localX, position.localY);
}

interface OwnedActivityActor {
  readonly population: CoreEcologyPopulationState;
  readonly member: CoreEcologyPopulationMemberState;
  readonly species: CoreEcologyActivityAffordanceSpecies;
}

function findActivityActor(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): OwnedActivityActor | null {
  for (const population of patch.populations) {
    if (!isActivitySpecies(population.species)) continue;
    const member = population.members.find(({ actor }) => actor.identity.stableId === actorId);
    if (member !== undefined) {
      return Object.freeze({ population, member, species: population.species });
    }
  }
  return null;
}

function habitatAllocation(
  patch: CoreEcologyAggregatePatchState,
  population: CoreEcologyPopulationState,
  member: CoreEcologyPopulationMemberState,
): CoreEcologyHabitatAllocation | null {
  if (!isLegacyActivityHabitatDerivation(patch)) return null;
  const analysis = patch.derivation.habitat.populations.find((candidate) => (
    candidate.species === population.species
    && candidate.populationKey === population.populationKey
    && candidate.representation === "individual-representatives"
  ));
  return analysis?.allocations.find(({ allocationOrdinal }) => (
    allocationOrdinal === member.populationOrdinal
  )) ?? null;
}

function isLegacyActivityHabitatDerivation(
  patch: CoreEcologyAggregatePatchState,
): patch is CoreEcologyAggregatePatchState & Readonly<{
  derivation: Extract<
    CoreEcologyAggregatePatchState["derivation"],
    { readonly kind:
      | "habitat-v4"
      | "legacy-fixed-v1-with-habitat-v4"
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
      | "settlement-home-v1" }
  >;
}> {
  return patch.derivation.kind === "habitat-v4"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v4"
    || patch.derivation.kind === "habitat-v5"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v5"
    || patch.derivation.kind === "habitat-v6"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v6"
    || patch.derivation.kind === "habitat-v7"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v7"
    || patch.derivation.kind === "habitat-v8"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v8"
    || patch.derivation.kind === "habitat-v9"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
    || patch.derivation.kind === "habitat-v10"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v10"
    || patch.derivation.kind === "habitat-v11"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v11"
    || patch.derivation.kind === "settlement-home-v1";
}

function isActivitySpecies(value: string): value is CoreEcologyActivityAffordanceSpecies {
  return ACTIVITY_SPECIES.has(value as CoreEcologyActivityAffordanceSpecies);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
