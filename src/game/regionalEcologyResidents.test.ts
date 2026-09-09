import { describe, expect, it } from "vitest";

import { seedFromText, type RootSeed } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  CORE_ECOLOGY_MAX_MEMBERS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_GROUP_SPECIES,
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import { isCoreEcologyAggregateSpecies } from "./coreEcologyAggregatePolicy";
import {
  CORE_ECOLOGY_DOMESTIC_SPECIES,
  deriveCoreEcologyRegionalHabitat,
} from "./coreEcologyRegionalHabitat";
import {
  adoptRegionalEcologyFromV24,
  advanceRegionalEcologyRoot,
  canonicalRegionalEcologyRootForWorld,
  deserializeRegionalEcologyRoot,
  putRegionalEcologyResidentDeviation,
  regionalEcologyResidentDeviation,
  serializeRegionalEcologyRoot,
  type RegionalEcologyRegionDeltaV1,
  type RegionalEcologyRootV1,
} from "./regionalEcology";
import {
  canonicalCoreEcologyRegionalResidentPatch,
  canonicalCoreEcologyRegionalResidentPatchForRoot,
  createCoreEcologyRegionalResidentPatch,
  createCoreEcologyRegionalResidentPatchForRoot,
  deriveCoreEcologyRegionalResidentSet,
} from "./regionalEcologyResidents";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha32-regional-habitat-properties");
const OTHER_SEED = seedFromText("another-alpha32-world");
const ADOPTION_TICK = 37;
const ADOPTION_ENVELOPE = hashCanonical("alpha32 resident suppression envelope");

function findRegionalWitness(
  predicate: (habitat: ReturnType<typeof deriveCoreEcologyRegionalHabitat>) => boolean,
) {
  for (let radius = 0; radius <= 8; radius += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== radius) continue;
        const region = createRegionCoord(x, y);
        const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });
        if (predicate(habitat)) return region;
      }
    }
  }
  throw new Error("Fixed signed search grid lacks the required regional witness");
}

function adoptionSourcePatch(
  seed: RootSeed = SEED,
  origin = createRegionCoord(-5, 7),
): CoreEcologyAggregatePatchState {
  const positions = [18_000, 22_000].map((localX) => createWorldPosition(
    origin,
    localX,
    20_000,
  ));
  const group = createCoreEcologyGroup({
    seed,
    species: "gull",
    originRegion: origin,
    populationKey: "alpha32/adoption-gull",
    groupOrdinal: 0,
    memberOrdinals: [0, 1],
    anchor: positions[0]!,
    tick: ADOPTION_TICK,
  });
  return createCoreEcologyAggregatePatch({
    seed,
    patchKey: "alpha32:resident-adoption-source",
    originRegion: origin,
    tick: ADOPTION_TICK,
    derivation: { kind: "bounded-input-v1" },
    groups: createCoreEcologyGroupSet([group]),
    populations: [
      {
        species: "gull",
        populationKey: "alpha32/adoption-gull",
        populationSize: 2,
        members: positions.map((position, populationOrdinal) => ({
          populationOrdinal,
          position,
          materialization: "coarse" as const,
        })),
      },
      {
        species: "marsh-rabbit",
        populationKey: "alpha32/adoption-rabbit",
        populationSize: 4,
        members: [{
          populationOrdinal: 0,
          representedUnits: 4,
          position: createWorldPosition(origin, 26_000, 20_000),
          materialization: "coarse" as const,
        }],
      },
    ],
  });
}

function adoptedRoot(
  patch: CoreEcologyAggregatePatchState = adoptionSourcePatch(),
): RegionalEcologyRootV1 {
  return adoptRegionalEcologyFromV24({
    rootSeed: SEED,
    completedTick: patch.updatedAtTick,
    sourceEnvelopeIntegrity: ADOPTION_ENVELOPE,
    legacyPatch: patch,
  });
}

describe("regional ecology resident patches", () => {
  it("creates one deterministic canonical patch owned by the actual signed region", () => {
    const habitat = deriveCoreEcologyRegionalHabitat({
      seed: SEED,
      region: createRegionCoord(-3, 0),
    });
    expect(habitat.totalPopulationUnits).toBeGreaterThan(0);
    const first = createCoreEcologyRegionalResidentPatch({
      seed: SEED,
      habitat,
      tick: 19,
    });
    const replay = createCoreEcologyRegionalResidentPatch({
      seed: SEED,
      habitat,
      tick: 19,
    });

    expect(stableStringify(replay)).toBe(stableStringify(first));
    expect(first.originRegion).toEqual(habitat.region);
    expect(first.derivation.kind).toBe("regional-habitat-v1");
    expect(first.populations.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_POPULATIONS);
    expect(first.aggregatePopulations.length)
      .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS);
    expect(first.populations.flatMap(({ members }) => members).length)
      .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MEMBERS);
    expect(first.populations.flatMap(({ members }) => members).every(({ actor }) => (
      actor.identity.originRegion.x === habitat.region.x
      && actor.identity.originRegion.y === habitat.region.y
    ))).toBe(true);
    expect(first.populations.some(({ species }) => (
      (CORE_ECOLOGY_DOMESTIC_SPECIES as readonly string[]).includes(species)
    ))).toBe(false);

    const encoded = serializeCoreEcologyAggregatePatch(first);
    expect(deserializeCoreEcologyAggregatePatch(encoded)).toEqual(first);
    expect(canonicalizeCoreEcologyAggregatePatch(first)).toBe(first);
  });

  it("round-trips a regional resident at the clipped negative coordinate limit", () => {
    const region = createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT);
    const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });
    const patch = createCoreEcologyRegionalResidentPatch({ seed: SEED, habitat, tick: 29 });
    const encoded = serializeCoreEcologyAggregatePatch(patch);

    expect(deserializeCoreEcologyAggregatePatch(encoded)).toEqual(patch);
    expect(canonicalCoreEcologyRegionalResidentPatch(patch, {
      seed: SEED,
      region,
      completedTick: 29,
    })).toBe(patch);
  });

  it("canonicalizes traversal order, omits honest absence, and preserves gull as one group actor population", () => {
    const emptyRegion = findRegionalWitness(({ totalPopulationUnits }) => totalPopulationUnits === 0);
    const occupiedRegion = findRegionalWitness(({ totalPopulationUnits }) => totalPopulationUnits > 0);
    const gullRegion = findRegionalWitness(({ populations }) => populations.some(({ species, populationUnits }) => (
      species === "gull" && populationUnits > 0
    )));
    const forward = deriveCoreEcologyRegionalResidentSet({
      seed: SEED,
      regions: [emptyRegion, occupiedRegion, gullRegion, occupiedRegion],
      tick: 21,
    });
    const reversed = deriveCoreEcologyRegionalResidentSet({
      seed: SEED,
      regions: [gullRegion, occupiedRegion, emptyRegion],
      tick: 21,
    });

    expect(stableStringify(reversed)).toBe(stableStringify(forward));
    expect(forward.residents.map(({ sourceKey }) => sourceKey)).toEqual(
      [...forward.residents.map(({ sourceKey }) => sourceKey)].sort(),
    );
    expect(new Set(forward.residents.map(({ sourceKey }) => sourceKey)).size)
      .toBe(forward.residents.length);
    expect(forward.residents.some(({ region }) => (
      region.x === emptyRegion.x && region.y === emptyRegion.y
    ))).toBe(false);

    const gullSource = forward.residents.find(({ region }) => (
      region.x === gullRegion.x && region.y === gullRegion.y
    ));
    expect(gullSource).toBeDefined();
    const gullPopulation = gullSource?.patch.populations.find(({ species }) => species === "gull");
    expect(gullPopulation?.populationSize).toBeGreaterThan(0);
    expect(gullSource?.patch.aggregatePopulations.some(({ species }) => (
      (species as string) === "gull"
    )))
      .toBe(false);
    const gullGroups = gullSource?.patch.groups.groups.filter(({ identity }) =>
      identity.species === "gull") ?? [];
    expect(gullGroups).toHaveLength(1);
    expect(gullGroups[0]?.memberOrdinals).toEqual(
      gullPopulation?.members.map(({ populationOrdinal }) => populationOrdinal),
    );
  });

  it("refuses a habitat derived by another root seed before creating actors", () => {
    const region = createRegionCoord(-3, 0);
    const foreignHabitat = deriveCoreEcologyRegionalHabitat({
      seed: seedFromText("foreign-alpha32-regional-root"),
      region,
    });
    expect(() => createCoreEcologyRegionalResidentPatch({
      seed: SEED,
      habitat: foreignHabitat,
    })).toThrow(/root seed/u);
  });

  it("uses the shared individual, aggregate, and social policies without hidden units", () => {
    const habitat = deriveCoreEcologyRegionalHabitat({
      seed: SEED,
      region: createRegionCoord(-3, 0),
    });
    const patch = createCoreEcologyRegionalResidentPatch({ seed: SEED, habitat });
    const admitted = habitat.populations.filter(({ populationUnits }) => populationUnits > 0);
    const expectedIndividuals = admitted.filter(({ species }) =>
      !isCoreEcologyAggregateSpecies(species));
    const expectedAggregates = admitted.filter(({ species }) =>
      isCoreEcologyAggregateSpecies(species));
    expect(patch.populations.map(({ species }) => species).sort())
      .toEqual(expectedIndividuals.map(({ species }) => species).sort());
    expect(patch.aggregatePopulations.map(({ species }) => species).sort())
      .toEqual(expectedAggregates.map(({ species }) => species).sort());
    expect(patch.populations.every((population) => (
      population.reserveUnits === 0
      && population.populationSize
        === population.members.reduce((sum, member) => sum + member.representedUnits, 0)
    ))).toBe(true);
    expect(patch.groups.groups.every(({ identity, memberOrdinals }) => (
      CORE_ECOLOGY_GROUP_SPECIES.includes(identity.species)
      && memberOrdinals.length >= 2
    ))).toBe(true);

    const emptyHabitat = deriveCoreEcologyRegionalHabitat({
      seed: SEED,
      region: createRegionCoord(-2, 0),
    });
    const emptyPatch = createCoreEcologyRegionalResidentPatch({
      seed: SEED,
      habitat: emptyHabitat,
    });
    expect(emptyPatch.populations).toEqual([]);
    expect(emptyPatch.aggregatePopulations).toEqual([]);
    expect(emptyPatch.groups.groups).toEqual([]);
  });

  it("rejects a valid-looking patch outside its exact world, region, or tick binding", () => {
    const region = findRegionalWitness(({ totalPopulationUnits }) => totalPopulationUnits > 0);
    const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });
    const patch = createCoreEcologyRegionalResidentPatch({ seed: SEED, habitat, tick: 23 });

    expect(canonicalCoreEcologyRegionalResidentPatch(patch, {
      seed: SEED,
      region,
      completedTick: 23,
    })).toBe(patch);
    expect(canonicalCoreEcologyRegionalResidentPatch(patch, {
      seed: OTHER_SEED,
      region,
      completedTick: 23,
    })).toBeNull();
    expect(canonicalCoreEcologyRegionalResidentPatch(patch, {
      seed: SEED,
      region: createRegionCoord(region.x + 1, region.y),
      completedTick: 23,
    })).toBeNull();
    expect(canonicalCoreEcologyRegionalResidentPatch(patch, {
      seed: SEED,
      region,
      completedTick: 24,
    })).toBeNull();
  });

  it("rejects self-consistent foreign-seed or rewritten regional group authority", () => {
    const region = findRegionalWitness(({ populations }) => populations.some((population) => (
      CORE_ECOLOGY_GROUP_SPECIES.includes(population.species)
      && population.populationUnits > 0
      && population.anchors.length >= 3
    )));
    const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });
    const patch = createCoreEcologyRegionalResidentPatch({ seed: SEED, habitat, tick: 31 });
    const target = patch.groups.groups.find(({ memberOrdinals }) => memberOrdinals.length >= 3);
    if (target === undefined) throw new Error("Regional group authority fixture has no group");
    const replaceTarget = (replacement: typeof target) => canonicalizeCoreEcologyAggregatePatch({
      ...patch,
      groups: createCoreEcologyGroupSet(patch.groups.groups.map((group) => (
        group.identity.stableId === target.identity.stableId ? replacement : group
      ))),
    });
    const foreignSeedGroup = createCoreEcologyGroup({
      seed: OTHER_SEED,
      species: target.identity.species,
      originRegion: target.identity.originRegion,
      populationKey: target.identity.populationKey,
      groupOrdinal: target.identity.groupOrdinal,
      memberOrdinals: target.memberOrdinals,
      anchor: target.rendezvousAnchor,
      tick: 31,
    });
    const rewrittenMembershipGroup = createCoreEcologyGroup({
      seed: SEED,
      species: target.identity.species,
      originRegion: target.identity.originRegion,
      populationKey: target.identity.populationKey,
      groupOrdinal: target.identity.groupOrdinal,
      memberOrdinals: target.memberOrdinals.slice(0, -1),
      anchor: target.rendezvousAnchor,
      tick: 31,
    });
    const foreignSeedPatch = replaceTarget(foreignSeedGroup);
    const rewrittenMembershipPatch = replaceTarget(rewrittenMembershipGroup);
    if (foreignSeedPatch === null || rewrittenMembershipPatch === null) {
      throw new Error("Generic patch fixture should remain structurally canonical");
    }

    for (const forged of [foreignSeedPatch, rewrittenMembershipPatch]) {
      expect(canonicalCoreEcologyRegionalResidentPatch(forged, {
        seed: SEED,
        region,
        completedTick: 31,
      })).toBeNull();
    }
  });

  it("suppresses only receipt-reserved units while conserving every regional population", () => {
    const root = adoptedRoot();
    expect(root.regions.length).toBeGreaterThan(0);
    let witnessedPartialRegion = false;
    for (const delta of root.regions) {
      const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region: delta.region });
      const baseline = createCoreEcologyRegionalResidentPatch({
        seed: SEED,
        habitat,
        tick: ADOPTION_TICK,
      });
      const projected = createCoreEcologyRegionalResidentPatchForRoot({
        seed: SEED,
        root,
        region: delta.region,
      });
      expectRegionalConservation(habitat, delta, projected);
      if (projected !== null) {
        witnessedPartialRegion = true;
        expect(projected.derivation.kind)
          .toBe("regional-habitat-v1-with-adoption-suppression");
        expect(canonicalCoreEcologyRegionalResidentPatchForRoot(projected, {
          seed: SEED,
          root,
          region: delta.region,
          completedTick: ADOPTION_TICK,
        })).toBe(projected);
        const legacyIds = new Set(delta.legacyPlacements.map(({ legacyActorId }) => legacyActorId));
        expect(projected.populations.flatMap(({ members }) => members)
          .some(({ actor }) => legacyIds.has(actor.identity.stableId))).toBe(false);
        for (const population of projected.populations) {
          const baselinePopulation = baseline.populations.find(({ species, populationKey }) => (
            species === population.species && populationKey === population.populationKey
          ));
          expect(baselinePopulation).toBeDefined();
          for (const member of population.members) {
            const baselineMember = baselinePopulation?.members.find(({ populationOrdinal }) => (
              populationOrdinal === member.populationOrdinal
            ));
            expect(member.actor.identity).toEqual(baselineMember?.actor.identity);
          }
          const group = projected.groups.groups.find(({ identity }) => (
            identity.species === population.species
            && identity.populationKey === population.populationKey
          ));
          if (
            CORE_ECOLOGY_GROUP_SPECIES.includes(population.species)
            && population.members.length >= 2
          ) {
            expect(group?.memberOrdinals).toEqual(
              population.members.map(({ populationOrdinal }) => populationOrdinal),
            );
          } else {
            expect(group).toBeUndefined();
          }
        }
        for (const aggregate of projected.aggregatePopulations) {
          expect(aggregate.aggregateId).toBe(baseline.aggregatePopulations.find(
            ({ species, populationKey }) => (
              species === aggregate.species && populationKey === aggregate.populationKey
            ),
          )?.aggregateId);
        }
      }
    }
    expect(witnessedPartialRegion).toBe(true);
  });

  it("is deterministic across ordering/reload and remains directly stepable", () => {
    const root = adoptedRoot();
    const reloaded = deserializeRegionalEcologyRoot(serializeRegionalEcologyRoot(root));
    expect(reloaded).not.toBeNull();
    if (reloaded === null) return;
    for (const delta of [...root.regions].reverse()) {
      const first = createCoreEcologyRegionalResidentPatchForRoot({
        seed: SEED,
        root,
        region: delta.region,
      });
      const replay = createCoreEcologyRegionalResidentPatchForRoot({
        seed: SEED,
        root: reloaded,
        region: delta.region,
      });
      expect(stableStringify(replay)).toBe(stableStringify(first));
      if (first === null) continue;
      const stepped = stepCoreEcologyAggregatePatch(first, {
        tick: ADOPTION_TICK + 1,
        actorSteps: [],
      });
      expect(stepped).not.toBeNull();
      const advancedRoot = advanceRegionalEcologyRoot(root, ADOPTION_TICK + 1);
      expect(canonicalCoreEcologyRegionalResidentPatchForRoot(stepped?.patch, {
        seed: SEED,
        root: advancedRoot,
        region: delta.region,
        completedTick: ADOPTION_TICK + 1,
      })).toBe(stepped?.patch);
    }
  });

  it("persists, reloads, and root-authenticates a stepped suppressed deviation", () => {
    const adopted = adoptedRoot();
    const delta = adopted.regions.find((candidate) => (
      createCoreEcologyRegionalResidentPatchForRoot({
        seed: SEED,
        root: adopted,
        region: candidate.region,
      }) !== null
    ));
    if (delta === undefined) throw new Error("Adoption fixture lacks a surviving resident region");
    const baseline = createCoreEcologyRegionalResidentPatchForRoot({
      seed: SEED,
      root: adopted,
      region: delta.region,
    });
    if (baseline === null) throw new Error("Suppressed baseline unexpectedly absent");
    const completedTick = ADOPTION_TICK + 1;
    const advanced = advanceRegionalEcologyRoot(adopted, completedTick);
    const stepped = stepCoreEcologyAggregatePatch(baseline, {
      tick: completedTick,
      actorSteps: [],
    });
    if (stepped === null) throw new Error("Suppressed baseline did not step");
    const stored = putRegionalEcologyResidentDeviation(advanced, {
      rootSeed: SEED,
      patch: stepped.patch,
    });
    const reloaded = deserializeRegionalEcologyRoot(serializeRegionalEcologyRoot(stored));
    expect(canonicalRegionalEcologyRootForWorld(reloaded, {
      rootSeed: SEED,
      completedTick,
    })).toEqual(stored);
    expect(regionalEcologyResidentDeviation(stored, SEED, delta.region))
      .toEqual(stepped.patch);

    const forged = JSON.parse(stableStringify(stepped.patch)) as any;
    forged.derivation.suppression.sourcePatchHash = "0000000000000000";
    const structurallyCanonical = canonicalizeCoreEcologyAggregatePatch(forged);
    expect(structurallyCanonical).not.toBeNull();
    expect(() => putRegionalEcologyResidentDeviation(advanced, {
      rootSeed: SEED,
      patch: structurallyCanonical!,
    })).toThrow(/bound resident patch/u);
  });

  it("conserves aggregate baselines without keeping a duplicate aggregate owner", () => {
    const region = findRegionalWitness(({ populations }) => populations.some((candidate) => (
      candidate.actorRepresentation === "aggregate" && candidate.populationUnits > 0
    )));
    const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });
    const baseline = createCoreEcologyRegionalResidentPatch({
      seed: SEED,
      habitat,
      tick: ADOPTION_TICK,
    });
    const aggregateOnly = canonicalizeCoreEcologyAggregatePatch({
      ...baseline,
      patchKey: "alpha32:aggregate-adoption-source",
      derivation: {
        kind: "legacy-cohort-v1",
        adoptionTransactionId: `regional-ecology-adoption:${hashCanonical("aggregate-source")}`,
        rootSeedFingerprint: hashCanonical(SEED),
        sourcePatchHash: hashCanonical(baseline),
      },
      groups: createCoreEcologyGroupSet(),
      populations: [],
    });
    if (aggregateOnly === null) throw new Error("Aggregate-only v24 fixture is invalid");
    const root = adoptedRoot(aggregateOnly);
    const delta = root.regions.find(({ legacyAggregatePlacements }) => (
      legacyAggregatePlacements.length > 0
    ));
    expect(delta).toBeDefined();
    if (delta === undefined) return;
    const projectedHabitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region: delta.region });
    const projected = createCoreEcologyRegionalResidentPatchForRoot({
      seed: SEED,
      root,
      region: delta.region,
    });
    expectRegionalConservation(projectedHabitat, delta, projected);
    const legacyAggregateIds = new Set(delta.legacyAggregatePlacements.map(
      ({ legacyAggregateId }) => legacyAggregateId,
    ));
    expect(projected?.aggregatePopulations.some(({ aggregateId }) => (
      legacyAggregateIds.has(aggregateId)
    )) ?? false).toBe(false);
  });

  it("projects signed extreme adoption slots and fails closed on manifest tamper", () => {
    const witness = findExtremeIndividualWitness();
    const candidate = witness.habitat.populations.find(({ actorRepresentation, populationUnits }) => (
      actorRepresentation === "individual" && populationUnits > 0
    ));
    if (candidate === undefined) throw new Error("Extreme witness lost its population");
    const anchor = candidate.anchors[0];
    if (anchor === undefined) throw new Error("Extreme witness lost its anchor");
    const source = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "alpha32:extreme-adoption-source",
      originRegion: witness.region,
      tick: ADOPTION_TICK,
      derivation: { kind: "bounded-input-v1" },
      populations: [{
        species: candidate.species,
        populationKey: `alpha32/extreme/${candidate.species}`,
        members: [{
          populationOrdinal: 0,
          representedUnits: 1,
          position: createWorldPosition(
            witness.region,
            anchor.localX * WORLD_POSITION_UNITS_PER_TILE
              + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
            anchor.localY * WORLD_POSITION_UNITS_PER_TILE
              + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
          ),
          materialization: "coarse",
        }],
      }],
    });
    const root = adoptedRoot(source);
    const delta = root.regions.find(({ region }) => (
      region.x === witness.region.x && region.y === witness.region.y
    ));
    expect(delta).toBeDefined();
    if (delta === undefined) return;
    const projected = createCoreEcologyRegionalResidentPatchForRoot({
      seed: SEED,
      root,
      region: witness.region,
    });
    expectRegionalConservation(witness.habitat, delta, projected);
    expect(projected).not.toBeNull();
    if (projected === null) throw new Error("Extreme adoption suppressed its whole habitat");
    expect(canonicalCoreEcologyRegionalResidentPatchForRoot(projected, {
      seed: OTHER_SEED,
      root,
      region: witness.region,
      completedTick: ADOPTION_TICK,
    })).toBeNull();

    const forged = JSON.parse(stableStringify(projected)) as any;
    forged.derivation.suppression.sourcePatchHash = "0000000000000000";
    const structurallyCanonical = canonicalizeCoreEcologyAggregatePatch(forged);
    expect(structurallyCanonical).not.toBeNull();
    expect(canonicalCoreEcologyRegionalResidentPatchForRoot(structurallyCanonical, {
      seed: SEED,
      root,
      region: witness.region,
      completedTick: ADOPTION_TICK,
    })).toBeNull();

    const normal = createCoreEcologyRegionalResidentPatch({
      seed: SEED,
      habitat: witness.habitat,
      tick: ADOPTION_TICK,
    });
    expect(canonicalCoreEcologyRegionalResidentPatchForRoot(normal, {
      seed: SEED,
      root,
      region: witness.region,
      completedTick: ADOPTION_TICK,
    })).toBeNull();
  });
});

function expectRegionalConservation(
  habitat: ReturnType<typeof deriveCoreEcologyRegionalHabitat>,
  delta: RegionalEcologyRegionDeltaV1,
  projected: CoreEcologyAggregatePatchState | null,
): void {
  for (const candidate of habitat.populations) {
    const reserved = delta.legacyPlacements
      .filter(({ baselinePopulationId }) => baselinePopulationId === candidate.stableId)
      .reduce((sum, placement) => sum + placement.suppressedBaselineUnits, 0)
      + delta.legacyAggregatePlacements
        .filter(({ baselinePopulationId }) => baselinePopulationId === candidate.stableId)
        .reduce((sum, placement) => sum + placement.suppressedBaselineUnits, 0);
    const surviving = isCoreEcologyAggregateSpecies(candidate.species)
      ? projected?.aggregatePopulations.find(({ species, populationKey }) => (
          species === candidate.species && populationKey === candidate.populationKey
        ))?.populationSize ?? 0
      : projected?.populations.find(({ species, populationKey }) => (
          species === candidate.species && populationKey === candidate.populationKey
        ))?.baselinePopulationSize ?? 0;
    expect(surviving + reserved).toBe(candidate.populationUnits);
  }
  const survivingTotal = (projected?.populations.reduce(
    (sum, population) => sum + population.baselinePopulationSize,
    0,
  ) ?? 0) + (projected?.aggregatePopulations.reduce(
    (sum, population) => sum + population.populationSize,
    0,
  ) ?? 0);
  expect(survivingTotal + delta.baselineSuppressedUnits).toBe(habitat.totalPopulationUnits);
}

function findExtremeIndividualWitness() {
  for (let offsetY = 0; offsetY < 10; offsetY += 1) {
    for (let offsetX = 0; offsetX < 10; offsetX += 1) {
      const region = createRegionCoord(
        -REGION_COORD_LIMIT + offsetX,
        REGION_COORD_LIMIT - offsetY,
      );
      const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });
      if (habitat.totalPopulationUnits > 1 && habitat.populations.some(({
        actorRepresentation,
        populationUnits,
      }) => (
        actorRepresentation === "individual" && populationUnits > 0
      ))) return Object.freeze({ region, habitat });
    }
  }
  throw new Error("Fixed extreme grid lacks individual regional capacity");
}
