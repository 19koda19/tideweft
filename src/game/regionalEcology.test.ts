import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
} from "../sim/actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  applyCoreEcologyWildlifeMortality,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import { createCoreEcologyGroup, createCoreEcologyGroupSet } from "./coreEcologyGroups";
import { deriveCoreEcologyRegionalHabitat } from "./coreEcologyRegionalHabitat";
import { createCoreEcologyRegionalResidentPatch } from "./regionalEcologyResidents";
import { coreEcologySpeciesPredatorContact } from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import { resolveCoreWildlifePredatorContact } from "./coreWildlifeMortality";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";
import {
  adoptRegionalEcologyFromV24,
  advanceRegionalEcologyRoot,
  canonicalRegionalEcologyRootForWorld,
  canonicalizeRegionalEcologyRegionDelta,
  canonicalizeRegionalEcologyRoot,
  createPristineRegionalEcologyRoot,
  createRegionalEcologyRegionDelta,
  deserializeRegionalEcologyRoot,
  putRegionalEcologyResidentDeviation,
  regionalEcologyResidentDeviation,
  regionalEcologyBaselineSlotId,
  serializeRegionalEcologyRoot,
} from "./regionalEcology";

const SEED = seedFromText("alpha32 regional ecology authority");
const OTHER_SEED = seedFromText("alpha32 wrong regional ecology authority");
const ORIGIN = createRegionCoord(-7, 11);
const TICK = 19;
const ENVELOPE_INTEGRITY = hashCanonical("sealed-v24-envelope");

function extremeRabbitWitness(): {
  readonly region: ReturnType<typeof createRegionCoord>;
  readonly habitat: ReturnType<typeof deriveCoreEcologyRegionalHabitat>;
} {
  for (let offsetY = 0; offsetY < 8; offsetY += 1) {
    for (let offsetX = 0; offsetX < 8; offsetX += 1) {
      const region = createRegionCoord(
        -REGION_COORD_LIMIT + offsetX,
        REGION_COORD_LIMIT - offsetY,
      );
      const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });
      if (habitat.populations.some(({ species, actorRepresentation, populationUnits }) => (
        species === "marsh-rabbit"
        && actorRepresentation === "individual"
        && populationUnits > 0
      ))) return Object.freeze({ region, habitat });
    }
  }
  throw new Error("Fixed extreme-coordinate search grid lacks rabbit capacity");
}

function sourcePatch(): CoreEcologyAggregatePatchState {
  const firstGullPosition = createWorldPosition(ORIGIN, 21_000, 20_000);
  const secondGullPosition = createWorldPosition(ORIGIN, 22_000, 20_000);
  const group = createCoreEcologyGroup({
    seed: SEED,
    species: "gull",
    originRegion: ORIGIN,
    populationKey: "alpha32/gull",
    groupOrdinal: 0,
    memberOrdinals: [0, 1],
    anchor: firstGullPosition,
    tick: TICK,
  });
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha32:v24-source",
    originRegion: ORIGIN,
    tick: TICK,
    derivation: { kind: "bounded-input-v1" },
    groups: createCoreEcologyGroupSet([group]),
    populations: [
      {
        species: "marsh-fox",
        populationKey: "alpha32/marsh-fox",
        members: [{
          populationOrdinal: 0,
          position: createWorldPosition(ORIGIN, 20_000, 20_000),
          materialization: "materialized",
        }],
      },
      {
        species: "gull",
        populationKey: "alpha32/gull",
        populationSize: 2,
        members: [firstGullPosition, secondGullPosition].map((position, populationOrdinal) => ({
          populationOrdinal,
          position,
          materialization: "materialized" as const,
        })),
      },
      {
        species: "marsh-rabbit",
        populationKey: "alpha32/marsh-rabbit",
        populationSize: 4,
        members: [{
          populationOrdinal: 0,
          representedUnits: 4,
          position: createWorldPosition(ORIGIN, 23_000, 20_000),
          materialization: "materialized" as const,
        }],
      },
    ],
  });
}

function mortalitySourcePatch(): CoreEcologyAggregatePatchState {
  const focus = createWorldPosition(
    ORIGIN,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
  const habitat = deriveCoreEcologyMarshEdgeHabitatAssemblage({
    rootSeed: SEED,
    originRegion: ORIGIN,
    focus: { position: focus, radiusTiles: 32 },
  });
  const populations: readonly CoreEcologyPopulationInput[] = habitat.populations.flatMap(
    (population) => {
      if (
        population.representation !== "individual-representatives"
        || population.populationUnits === 0
      ) return [];
      return [{
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation, index) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: (
            index === 0
            && (population.species === "marsh-rabbit" || population.species === "marsh-fox")
          ) ? "materialized" as const : "coarse" as const,
        })),
      }];
    },
  );
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha32:mortality-source",
    originRegion: ORIGIN,
    derivation: { kind: "habitat-v3", habitat },
    populations,
  });
}

function adopted(
  patch = sourcePatch(),
  protectedActorIds: readonly string[] = [],
) {
  return adoptRegionalEcologyFromV24({
    rootSeed: SEED,
    completedTick: patch.updatedAtTick,
    sourceEnvelopeIntegrity: ENVELOPE_INTEGRITY,
    legacyPatch: patch,
    protectedActorIds,
  });
}

function actorOf(patch: CoreEcologyAggregatePatchState, species: "marsh-fox" | "marsh-rabbit") {
  const actor = patch.populations.find((population) => population.species === species)
    ?.members[0]?.actor;
  if (actor === undefined) throw new Error(`Missing ${species} fixture`);
  return actor;
}

function stageContact(patch: CoreEcologyAggregatePatchState, tick: number) {
  const initialRabbit = actorOf(patch, "marsh-rabbit");
  const rabbit = repositionCoreWildlifeActor(initialRabbit, {
    atTick: tick,
    position: createWorldPosition(ORIGIN, 30_000, 24_000),
    heading: 500_000,
  });
  const initialFox = actorOf(patch, "marsh-fox");
  const fedFox = replaceCoreWildlifeActorPhysiology(initialFox, {
    atTick: initialFox.updatedAtTick,
    needs: { ...initialFox.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: initialFox.condition,
  });
  let fox = repositionCoreWildlifeActor(fedFox, {
    atTick: initialFox.updatedAtTick,
    position: createWorldPosition(ORIGIN, 29_700, 24_000),
    heading: 0,
  });
  const observation = createActorObservation({
    id: `alpha32-contact-${tick}`,
    observerId: fox.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: rabbit.identity.stableId,
    area: { center: rabbit.address.position, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 900_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Invalid mortality observation fixture");
  const stepped = stepCoreWildlifeActor(fox, {
    tick,
    observations: [observation],
    foodOpportunities: [{
      resourceId: rabbit.identity.stableId,
      observationId: observation.id,
      foodClass: "live-prey",
      sourceKind: "living-actor",
      availableUnits: 1,
      nutrition: 900_000,
      effort: 10_000,
      risk: 0,
      competition: 0,
      directlyConfirmed: true,
      accessible: true,
    }],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (stepped === null || stepped.decision.intent !== "pursue") {
    throw new Error(`Mortality fixture predator did not pursue: ${stableStringify(stepped)}`);
  }
  fox = stepped.actor;
  const policy = coreEcologySpeciesPredatorContact("marsh-fox");
  if (policy === null) throw new Error("Missing marsh-fox contact policy");
  const result = resolveCoreWildlifePredatorContact({
    attacker: fox,
    target: rabbit,
    atTick: tick,
    contactRadiusUnits: policy.reachUnits,
    damageUnits: policy.damageUnits,
    cause: policy.cause,
  });
  if (result === null) throw new Error("Mortality fixture contact was rejected");
  const stagedPatch = replaceCoreEcologyAggregatePatchActor(
    replaceCoreEcologyAggregatePatchActor(patch, rabbit),
    fox,
  );
  return {
    patch: stagedPatch,
    result,
  };
}

function bodyBearingPatch(): CoreEcologyAggregatePatchState {
  const first = stageContact(mortalitySourcePatch(), 1);
  const injury = applyCoreEcologyWildlifeMortality(first.patch, {
    result: first.result,
    temperature: 500_000,
  });
  if (injury === null) throw new Error("Mortality fixture injury was rejected");
  const second = stageContact(injury.patch, 2);
  const death = applyCoreEcologyWildlifeMortality(second.patch, {
    result: second.result,
    temperature: 500_000,
  });
  if (death === null || death.transaction === null || death.carcass === null) {
    throw new Error("Mortality fixture death was rejected");
  }
  return death.patch;
}

describe("regional ecology root v1", () => {
  it("creates a pristine sparse root without legacy authority or region records", () => {
    const first = createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK });
    const second = createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: 1,
      revision: 0,
      lastEventOrdinal: 0,
      adoption: null,
      legacyCohort: null,
      regions: [],
    });
    expect(canonicalRegionalEcologyRootForWorld(first, {
      rootSeed: SEED,
      completedTick: TICK,
    })).toBe(first);
    expect(canonicalRegionalEcologyRootForWorld(first, {
      rootSeed: OTHER_SEED,
      completedTick: TICK,
    })).toBeNull();
  });

  it("adopts deterministically with group-atomic disposition and exact unit conservation", () => {
    const patch = sourcePatch();
    const first = adopted(patch);
    const second = adopted(patch);
    expect(serializeRegionalEcologyRoot(second)).toBe(serializeRegionalEcologyRoot(first));
    expect(first.adoption?.transactionId).toBe(second.adoption?.transactionId);
    expect(first.regions.length).toBeGreaterThan(0);
    expect(first.regions.every((region) => (
      stableStringify(canonicalizeRegionalEcologyRegionDelta(region, SEED))
        === stableStringify(region)
    ))).toBe(true);
    expect(canonicalRegionalEcologyRootForWorld(first, {
      rootSeed: SEED,
      completedTick: TICK,
    })).toBe(first);
    expect(first.adoption?.actorDispositions).toHaveLength(4);
    for (const accounting of first.adoption?.populationAccounting ?? []) {
      expect(accounting.postAdoptionPopulationSize).toBe(
        accounting.sourcePopulationSize - accounting.adoptionRetiredUnits,
      );
      expect(accounting.sourceReserveUnits + accounting.sourceMemberUnits)
        .toBe(accounting.sourcePopulationSize);
    }
    const group = first.adoption?.groupDispositions[0];
    const memberActions = group?.memberActorIds.map((actorId) => (
      first.adoption?.actorDispositions.find((entry) => entry.actorId === actorId)?.disposition
    ));
    expect(new Set(memberActions).size).toBe(1);
    const retiredUnits = first.legacyCohort?.retirements.reduce(
      (sum, entry) => sum + entry.representedUnits,
      0,
    ) ?? 0;
    expect(first.adoption?.actorDispositions.filter(({ disposition }) => (
      disposition === "retired"
    )).reduce((sum, entry) => sum + entry.representedUnits, 0)).toBe(retiredUnits);
    expect(first.legacyCohort?.sourcePatch).toEqual(patch);
    expect(first.regions.reduce((sum, region) => sum + region.baselineSuppressedUnits, 0))
      .toBe(first.adoption?.actorDispositions.reduce(
        (sum, entry) => sum + entry.suppressedBaselineUnits,
        0,
      ));
  });

  it("expands explicit protection to a whole group independent of input order", () => {
    const patch = sourcePatch();
    const gulls = patch.populations.find(({ species }) => species === "gull")!
      .members.map(({ actor }) => actor.identity.stableId);
    const first = adopted(patch, [...gulls].reverse());
    const second = adopted(patch, gulls);
    expect(first).toEqual(second);
    const group = first.adoption?.groupDispositions[0];
    expect(group).toMatchObject({
      disposition: "retained",
      reason: "protected-authority-retained",
    });
    expect(group?.memberActorIds.every((actorId) => (
      first.adoption?.actorDispositions.find((entry) => entry.actorId === actorId)?.reason
        === "protected-authority-retained"
    ))).toBe(true);
  });

  it("round-trips only canonical sealed bytes and fails closed on tamper", () => {
    const root = adopted();
    const text = serializeRegionalEcologyRoot(root);
    expect(deserializeRegionalEcologyRoot(text)).toEqual(root);

    const tampered = JSON.parse(text) as Record<string, unknown>;
    tampered.updatedAtTick = TICK + 1;
    expect(canonicalizeRegionalEcologyRoot(tampered)).toBeNull();

    const resealed = JSON.parse(text) as any;
    resealed.adoption.actorDispositions[0].representedUnits += 1;
    const { integrity: _receiptSeal, ...receiptBase } = resealed.adoption;
    resealed.adoption.integrity = hashCanonical(receiptBase);
    const { integrity: _rootSeal, ...rootBase } = resealed;
    resealed.integrity = hashCanonical(rootBase);
    expect(canonicalizeRegionalEcologyRoot(resealed)).toBeNull();

    expect(() => adoptRegionalEcologyFromV24({
      rootSeed: OTHER_SEED,
      completedTick: TICK,
      sourceEnvelopeIntegrity: ENVELOPE_INTEGRITY,
      legacyPatch: sourcePatch(),
    })).toThrow(/canonical v24 patch/u);
  });

  it("advances the owner clock without rewriting the committed adoption", () => {
    const root = adopted();
    const advanced = advanceRegionalEcologyRoot(root, TICK + 40);
    expect(advanced.updatedAtTick).toBe(TICK + 40);
    expect(advanced.adoption).toEqual(root.adoption);
    expect(advanced.legacyCohort).toEqual(root.legacyCohort);
    const reloaded = deserializeRegionalEcologyRoot(serializeRegionalEcologyRoot(advanced));
    expect(canonicalRegionalEcologyRootForWorld(reloaded, {
      rootSeed: SEED,
      completedTick: TICK + 40,
    })).toEqual(advanced);
    expect(() => advanceRegionalEcologyRoot(advanced, TICK)).toThrow(/rewind/u);
  });

  it("stores only changed regional residents and restores their exact coarse state", () => {
    let habitat: ReturnType<typeof deriveCoreEcologyRegionalHabitat> | null = null;
    for (let radius = 0; radius <= 6 && habitat === null; radius += 1) {
      for (let y = -radius; y <= radius && habitat === null; y += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          const candidate = deriveCoreEcologyRegionalHabitat({
            seed: SEED,
            region: createRegionCoord(x, y),
          });
          if (candidate.populations.some(({ actorRepresentation, populationUnits }) => (
            actorRepresentation === "individual" && populationUnits > 0
          ))) {
            habitat = candidate;
            break;
          }
        }
      }
    }
    if (habitat === null) throw new Error("Sparse-deviation fixture lacks an occupied region");
    const pristine = createCoreEcologyRegionalResidentPatch({ seed: SEED, habitat, tick: TICK });
    const actor = pristine.populations[0]?.members[0]?.actor;
    if (actor === undefined) throw new Error("Sparse-deviation fixture lacks an individual actor");
    const changedActor = replaceCoreWildlifeActorPhysiology(actor, {
      atTick: TICK,
      needs: { ...actor.needs, hunger: Math.min(1_000_000, actor.needs.hunger + 1) },
      condition: actor.condition,
    });
    const changed = replaceCoreEcologyAggregatePatchActor(pristine, changedActor);
    const root = createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK });
    const stored = putRegionalEcologyResidentDeviation(root, { rootSeed: SEED, patch: changed });

    expect(stored.regions).toHaveLength(1);
    expect(stored.regions[0]?.residentPatch?.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);
    expect(regionalEcologyResidentDeviation(stored, SEED, habitat.region)).toEqual(
      stored.regions[0]?.residentPatch,
    );
    const reloaded = deserializeRegionalEcologyRoot(serializeRegionalEcologyRoot(stored));
    expect(canonicalRegionalEcologyRootForWorld(reloaded, {
      rootSeed: SEED,
      completedTick: TICK,
    })).toEqual(stored);

    const cleared = putRegionalEcologyResidentDeviation(stored, {
      rootSeed: SEED,
      patch: pristine,
    });
    expect(cleared.regions).toEqual([]);
    expect(regionalEcologyResidentDeviation(cleared, SEED, habitat.region)).toBeNull();
  });

  it("preserves a mortality ledger, one physical body, and represented-unit accounting", () => {
    const patch = bodyBearingPatch();
    const root = adopted(patch);
    const reloaded = deserializeRegionalEcologyRoot(serializeRegionalEcologyRoot(root));
    expect(reloaded).not.toBeNull();
    expect(reloaded?.legacyCohort?.sourcePatch.mortalityTransactions)
      .toEqual(patch.mortalityTransactions);
    expect(reloaded?.legacyCohort?.sourcePatch.carcasses).toEqual(patch.carcasses);
    expect(reloaded?.legacyCohort?.sourcePatch.nextMortalityOrdinal)
      .toBe(patch.nextMortalityOrdinal);
    expect(reloaded?.adoption?.sourceBodiesHash).toBe(hashCanonical(patch.carcasses));
    const rabbit = patch.populations.find(({ species }) => species === "marsh-rabbit")!;
    expect(root.adoption?.populationAccounting.find(({ species }) => species === "marsh-rabbit"))
      .toMatchObject({
        baselinePopulationSize: rabbit.baselinePopulationSize,
        sourcePopulationSize: rabbit.populationSize,
        sourceReserveUnits: rabbit.reserveUnits,
        existingMortalityUnits: 1,
        adoptionRetiredUnits: 0,
        postAdoptionPopulationSize: rabbit.populationSize,
      });
  });

  it("accepts canonical signed/extreme placement deltas and rejects no-op or forged deltas", () => {
    const witness = extremeRabbitWitness();
    const extreme = witness.region;
    const destination = createWorldPosition(extreme, REGION_WIDTH_UNITS - 1, 0);
    const habitat = witness.habitat;
    const baseline = habitat.populations.find(({ species, actorRepresentation, populationUnits }) => (
      species === "marsh-rabbit"
      && actorRepresentation === "individual"
      && populationUnits > 0
    ));
    if (baseline === undefined) throw new Error("Extreme fixture lacks rabbit capacity");
    const delta = createRegionalEcologyRegionDelta({
      rootSeed: SEED,
      region: extreme,
      baselineHash: habitat.derivationHash,
      revision: 1,
      eventOrdinal: 2,
      legacyPlacements: [{
        baselineActorId: regionalEcologyBaselineSlotId(baseline.stableId, 0, 1),
        baselinePopulationId: baseline.stableId,
        baselineUnitOffset: 0,
        legacyActorId: actorOf(sourcePatch(), "marsh-rabbit").identity.stableId,
        species: "marsh-rabbit",
        populationKey: "alpha32/marsh-rabbit",
        destinationPosition: destination,
        suppressedBaselineUnits: 1,
      }],
    });
    expect(canonicalizeRegionalEcologyRegionDelta(delta, SEED)).toEqual(delta);
    expect(canonicalizeRegionalEcologyRegionDelta(delta, OTHER_SEED)).toBeNull();
    expect(() => createRegionalEcologyRegionDelta({
      rootSeed: SEED,
      region: extreme,
      baselineHash: habitat.derivationHash,
      revision: 1,
      eventOrdinal: 2,
      legacyPlacements: [],
    })).toThrow(/no-op/u);

    const forged = JSON.parse(stableStringify(delta)) as any;
    forged.region = { x: -0, y: REGION_COORD_LIMIT };
    expect(canonicalizeRegionalEcologyRegionDelta(forged, SEED)).toBeNull();
  });
});
