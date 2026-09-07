import { describe, expect, it } from "vitest";

import { ACTOR_PERCEPTION_SCALE, createActorObservation } from "../sim/actorPerception";
import { seedFromText, type RootSeed } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  coreEcologyActivityDestinationSemantic,
  coreEcologyActivityTravelMedium,
  projectCoreEcologyActivity,
  stepCoreEcologyActivityMotion,
  validateCoreEcologyActivityProjectionAffordance,
  type CoreEcologyActivityProjection,
} from "./coreEcologyActivity";
import {
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES,
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION,
  coreEcologyActivityAffordanceProfile,
  coreEcologyActivityArchetype,
  validateCoreEcologyActivityAffordances,
} from "./coreEcologyActivityAffordance";
import {
  deriveCoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  stepCoreWildlifeActor,
} from "./coreWildlifeActor";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

export const ALPHA22_TIDAL_CONVERGENCE_ABSTRACTION_FUZZ_OWNER_ID =
  "test:alpha22-tidal-convergence-abstraction-fuzz:v1" as const;

const REGION = createRegionCoord(0, 0);
const ROOT_SEED = seedFromText(ALPHA22_TIDAL_CONVERGENCE_ABSTRACTION_FUZZ_OWNER_ID);
const VARIANT_COUNT = 12;
const HABITAT = deriveHabitat(ROOT_SEED);
const DIRECTIONS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 1, y: 1 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: -1, y: 1 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: -1, y: -1 }),
  Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: 1, y: -1 }),
] as const);

describe("Alpha22 tidal-convergence activity abstraction fuzz", () => {
  it("keeps every reusable registry composition coherent without a species-pair matrix", () => {
    expect(validateCoreEcologyActivityAffordances()).toEqual([]);
    expect(CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.length).toBeGreaterThan(1);

    for (const profile of deterministicPermutation(
      CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES,
      0xa122_c0de,
    )) {
      const activityArchetype = coreEcologyActivityArchetype(profile.archetypeId);
      expect(activityArchetype).not.toBeNull();
      expect(coreEcologyActivityAffordanceProfile(profile.speciesId)).toBe(profile);
      expect(profile.version).toBe(CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION);
      expect(profile.requiredCapabilities).toBe(activityArchetype?.requiredCapabilities);
      expect(profile.allowedTravelMedia).toBe(activityArchetype?.allowedTravelMedia);
      expect(profile.destinations).toBe(activityArchetype?.destinations);
      expect(profile.observationAffordance).toBe(activityArchetype?.observationAffordance);
      expect(profile.presentationSignals).toBe(activityArchetype?.presentationSignals);
    }
  });

  it("keeps seeded gull surface-cue projections lawful and all population units conserved", () => {
    const variants = deterministicVariants(0x66f0_22aa, VARIANT_COUNT);
    const seenDirections = new Set<string>();

    for (const variant of variants) {
      const atTick = 361 + variant.ordinal;
      let patch = activityPatch(atTick - 1, variant.ordinal);
      const gull = gullActor(patch);
      const target = translateWorldPosition(
        gull.address.position,
        variant.dxTiles * WORLD_POSITION_UNITS_PER_TILE,
        variant.dyTiles * WORLD_POSITION_UNITS_PER_TILE,
      );
      seenDirections.add(`${Math.sign(variant.dxTiles)},${Math.sign(variant.dyTiles)}`);

      const observation = createActorObservation({
        id: `alpha22-surface:${variant.ordinal}:${variant.entropy}`,
        observerId: gull.identity.stableId,
        observedAtTick: atTick,
        channel: "vision",
        perceivedClass: "aquatic-activity",
        subjectId: null,
        area: { center: target, radiusUnits: 0 },
        confidence: ACTOR_PERCEPTION_SCALE,
        salience: ACTOR_PERCEPTION_SCALE,
        identification: "classified",
        interrupt: "none",
      });
      if (observation === null) throw new Error("Seeded surface observation was rejected");
      const observed = stepCoreWildlifeActor(gull, {
        tick: atTick,
        observations: [observation],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
        neutralActivityPreference: "observe",
      });
      if (observed === null) throw new Error("Seeded gull cognition step was rejected");
      patch = replaceCoreEcologyAggregatePatchActor(patch, observed.actor);

      const profile = coreEcologyActivityAffordanceProfile("gull");
      const projection = projectCoreEcologyActivity(patch, {
        actorId: gull.identity.stableId,
        atTick,
      });
      if (profile === null || projection === null) {
        throw new Error("Seeded surface projection was rejected");
      }
      expect(projection).toMatchObject({
        state: "seeking-surface-opportunity",
        sourceObservationId: observation.id,
        presentationSignal: "surface-opportunity-flight",
        motion: { kind: "target-area", verb: "seek-surface-opportunity" },
      });
      expect(validateCoreEcologyActivityProjectionAffordance(
        profile,
        observed.actor,
        projection,
      )).toEqual([]);
      assertProjectionUsesDeclaredContract(profile, projection);

      const beforeMotion = conservationSignature(patch);
      const moved = stepCoreEcologyActivityMotion(patch, {
        actorId: gull.identity.stableId,
        atTick,
        maximumStepUnits: variant.maximumStepUnits,
      });
      if (moved === null) throw new Error("Seeded activity motion was rejected");
      expect(moved.resolution).toBe("moved");
      expect(conservationSignature(moved.patch)).toEqual(beforeMotion);

      const arrived = stepCoreEcologyActivityMotion(patch, {
        actorId: gull.identity.stableId,
        atTick,
        maximumStepUnits: 64 * WORLD_POSITION_UNITS_PER_TILE,
      });
      if (arrived === null) throw new Error("Seeded arrival motion was rejected");
      expect(arrived.resolution).toBe("moved");
      expect(conservationSignature(arrived.patch)).toEqual(beforeMotion);

      const circling = projectCoreEcologyActivity(arrived.patch, {
        actorId: gull.identity.stableId,
        atTick,
      });
      if (circling === null) throw new Error("Seeded arrival projection was rejected");
      expect(circling).toMatchObject({
        state: "surface-circling",
        sourceObservationId: observation.id,
        presentationSignal: "surface-opportunity-flight",
        motion: { kind: "hold-position" },
      });
      expect(validateCoreEcologyActivityProjectionAffordance(
        profile,
        gullActor(arrived.patch),
        circling,
      )).toEqual([]);
      assertProjectionUsesDeclaredContract(profile, circling);
      expect(conservationSignature(
        stepCoreEcologyActivityMotion(arrived.patch, {
          actorId: gull.identity.stableId,
          atTick,
          maximumStepUnits: variant.maximumStepUnits,
        })?.patch ?? null,
      )).toEqual(beforeMotion);
    }

    expect(seenDirections.size).toBe(DIRECTIONS.length);
  });

  it("rejects adversarial projection mutations through the shared contract firewall", () => {
    const atTick = 361;
    let patch = activityPatch(atTick - 1, 99);
    const gull = gullActor(patch);
    const target = translateWorldPosition(
      gull.address.position,
      5 * WORLD_POSITION_UNITS_PER_TILE,
      -3 * WORLD_POSITION_UNITS_PER_TILE,
    );
    const observation = createActorObservation({
      id: "alpha22-adversarial-surface:0",
      observerId: gull.identity.stableId,
      observedAtTick: atTick,
      channel: "vision",
      perceivedClass: "aquatic-activity",
      subjectId: null,
      area: { center: target, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "classified",
      interrupt: "none",
    });
    if (observation === null) throw new Error("Adversarial observation fixture failed");
    const observed = stepCoreWildlifeActor(gull, {
      tick: atTick,
      observations: [observation],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      neutralActivityPreference: "observe",
    });
    if (observed === null) throw new Error("Adversarial cognition fixture failed");
    patch = replaceCoreEcologyAggregatePatchActor(patch, observed.actor);
    const profile = coreEcologyActivityAffordanceProfile("gull");
    const lawful = projectCoreEcologyActivity(patch, {
      actorId: gull.identity.stableId,
      atTick,
    });
    if (profile === null || lawful === null || lawful.motion.kind !== "target-area") {
      throw new Error("Adversarial projection fixture failed");
    }

    const mutations: readonly Readonly<{
      projection: CoreEcologyActivityProjection;
      expected: readonly string[];
    }>[] = [
      {
        projection: { ...lawful, presentationSignal: "perched" },
        expected: ["undeclared-presentation-signal"],
      },
      {
        projection: {
          ...lawful,
          motion: { ...lawful.motion, travelMedium: "surface-water" },
        } as CoreEcologyActivityProjection,
        expected: ["destination-rejects-travel-medium", "undeclared-travel-medium"],
      },
      {
        projection: {
          ...lawful,
          motion: { kind: "target-area", verb: "seek-perch", targetArea: lawful.motion.targetArea },
        },
        expected: ["undeclared-destination-semantic"],
      },
      {
        projection: { ...lawful, sourceObservationId: "forged:surface-cue" },
        expected: [
          "invalid-or-stale-observation-source",
          "observed-destination-without-current-source",
        ],
      },
      {
        projection: { ...lawful, sourceObservationId: null },
        expected: ["observed-destination-without-current-source"],
      },
      {
        projection: { ...lawful, actorId: `${lawful.actorId}:other` },
        expected: ["projection-actor-profile-mismatch"],
      },
    ];

    for (const mutation of deterministicPermutation(mutations, 0xbadc_0ffe)) {
      const errors = validateCoreEcologyActivityProjectionAffordance(
        profile,
        observed.actor,
        mutation.projection,
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toEqual(expect.arrayContaining([...mutation.expected]));
    }
  });
});

function activityPatch(tick: number, ordinal: number): CoreEcologyAggregatePatchState {
  const patch = createCoreEcologyAggregatePatch({
    seed: ROOT_SEED,
    patchKey: `alpha22-activity-fuzz:${ordinal}:${tick}`,
    originRegion: REGION,
    tick,
    populations: individualInputs(HABITAT),
    derivation: { kind: "habitat-v4", habitat: HABITAT },
  });
  gullActor(patch);
  return patch;
}

function deriveHabitat(seed: RootSeed): CoreEcologyRainChorusHabitatAssemblage {
  return deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: seed,
    originRegion: REGION,
    focus: {
      position: createWorldPosition(
        REGION,
        Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      ),
      radiusTiles: 32,
    },
  });
}

function individualInputs(
  habitat: CoreEcologyRainChorusHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: population.species === "gull"
              && allocation.allocationOrdinal === 0
              ? "materialized" as const
              : "coarse" as const,
          })),
        }]
  ));
}

function gullActor(patch: CoreEcologyAggregatePatchState) {
  const actor = patch.populations.find(({ species }) => species === "gull")
    ?.members.find(({ materialization }) => materialization === "materialized")?.actor;
  if (actor === undefined) throw new Error("Activity abstraction fixture requires one gull");
  return actor;
}

function assertProjectionUsesDeclaredContract(
  profile: NonNullable<ReturnType<typeof coreEcologyActivityAffordanceProfile>>,
  projection: CoreEcologyActivityProjection,
): void {
  if (projection.presentationSignal !== null) {
    expect(profile.presentationSignals).toContain(projection.presentationSignal);
  }
  const medium = coreEcologyActivityTravelMedium(projection.motion);
  const semantic = coreEcologyActivityDestinationSemantic(projection.motion);
  if (medium !== null) expect(profile.allowedTravelMedia).toContain(medium);
  if (semantic !== null) {
    const destination = profile.destinations.find((entry) => entry.semantic === semantic);
    expect(destination).toBeDefined();
    if (medium !== null) expect(destination?.allowedTravelMedia).toContain(medium);
  }
}

function conservationSignature(patch: CoreEcologyAggregatePatchState | null) {
  if (patch === null) return null;
  const populations = patch.populations.map((population) => ({
    species: population.species,
    populationKey: population.populationKey,
    populationSize: population.populationSize,
    members: population.members.map((member) => ({
      stableId: member.actor.identity.stableId,
      populationOrdinal: member.populationOrdinal,
      representedUnits: member.representedUnits,
    })),
  }));
  const aggregatePopulations = patch.aggregatePopulations.map((population) => ({
    aggregateId: population.aggregateId,
    species: population.species,
    populationKey: population.populationKey,
    populationSize: population.populationSize,
    anchors: population.anchors.map((anchor) => ({
      anchorOrdinal: anchor.anchorOrdinal,
      populationUnits: anchor.populationUnits,
    })),
  }));
  return {
    populations,
    aggregatePopulations,
    representedUnits: populations.reduce((total, population) => (
      total + population.members.reduce((subtotal, member) => (
        subtotal + member.representedUnits
      ), 0)
    ), 0),
    aggregateUnits: aggregatePopulations.reduce((total, population) => (
      total + population.anchors.reduce((subtotal, anchor) => (
        subtotal + anchor.populationUnits
      ), 0)
    ), 0),
  };
}

interface DeterministicVariant {
  readonly ordinal: number;
  readonly entropy: number;
  readonly dxTiles: number;
  readonly dyTiles: number;
  readonly maximumStepUnits: number;
}

function deterministicVariants(seed: number, count: number): readonly DeterministicVariant[] {
  let state = seed >>> 0;
  const variants: DeterministicVariant[] = [];
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    state = xorshift32(state);
    const direction = DIRECTIONS[ordinal % DIRECTIONS.length];
    if (direction === undefined) throw new Error("Direction fixture is incomplete");
    const xMagnitude = 3 + state % 6;
    state = xorshift32(state);
    const yMagnitude = 3 + state % 6;
    state = xorshift32(state);
    variants.push(Object.freeze({
      ordinal,
      entropy: state,
      dxTiles: direction.x * xMagnitude,
      dyTiles: direction.y * yMagnitude,
      maximumStepUnits: 1 + state % (2 * WORLD_POSITION_UNITS_PER_TILE),
    }));
  }
  return Object.freeze(variants);
}

function deterministicPermutation<T>(values: readonly T[], seed: number): readonly T[] {
  let state = seed >>> 0;
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = xorshift32(state);
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
  }
  return Object.freeze(result);
}

function xorshift32(value: number): number {
  let result = value >>> 0;
  result ^= result << 13;
  result ^= result >>> 17;
  result ^= result << 5;
  return result >>> 0;
}
