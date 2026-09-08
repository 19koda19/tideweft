import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { type TerrainTileView, type WorldState, type WorldView } from "../sim/types";
import {
  applyCoreEcologyWildlifeMortality,
  canonicalizeCoreEcologyAggregatePatch,
  coreEcologyAggregatePatchActor,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  replaceCoreEcologyAggregatePatchCarcass,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { collectCoreEcologyVisualObservationBatches } from "./coreEcologyPerception";
import {
  deriveCoreEcologyRegionalPredatorHabitatAssemblage,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  coreEcologySpeciesCanFeedFromCarcass,
  coreEcologySpeciesCanGuardCarcass,
  coreEcologySpeciesPredatorContact,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  coreEcologyCanPursueLivingActor,
  coreEcologyCanResolveMortalityTarget,
} from "./coreEcologyTrophic";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeFoodOpportunity,
} from "./coreWildlifeActor";
import {
  claimCoreWildlifeCarcass,
  consumeCoreWildlifeCarcass,
} from "./coreWildlifeCarcass";
import {
  coreWildlifeMaximumStepUnits,
  coreWildlifeTraversabilityCell,
} from "./coreWildlifeLocomotionProfile";
import { resolveCoreWildlifePredatorContact } from "./coreWildlifeMortality";
import {
  createLivingActorTraversabilitySurface,
  resolveLivingActorLocomotion,
} from "./livingActorLocomotion";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

const REGION = createRegionCoord(0, 0);
const START_X = 38;
const Y = 30;
const TEMPERATURE = 500_000;

interface Fixture {
  readonly state: WorldState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
}

describe("Alpha 31 shared predator and scavenger emergence", () => {
  it("lets a cougar catch one observed rabbit and a brown bear consume its one conserved body", () => {
    const current = fixture();
    let patch = predatorPatch(current);
    const initialCougar = hungry(actor(patch, "cougar"));
    const initialBear = hungry(actor(patch, "brown-bear"));
    const rabbit = actor(patch, "marsh-rabbit");
    const initialRabbit = replaceCoreWildlifeActorPhysiology(rabbit, {
      atTick: 0,
      needs: rabbit.needs,
      condition: { ...rabbit.condition, health: 700_000 },
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, initialCougar);
    patch = replaceCoreEcologyAggregatePatchActor(patch, initialBear);
    patch = replaceCoreEcologyAggregatePatchActor(patch, initialRabbit);

    const contactPolicy = coreEcologySpeciesPredatorContact("cougar");
    if (contactPolicy === null) throw new Error("Cougar contact policy is missing");
    const nearbyWithoutKnowledge = repositionCoreWildlifeActor(initialRabbit, {
      atTick: 0,
      position: createWorldPosition(
        REGION,
        initialCougar.address.position.localX + 100,
        initialCougar.address.position.localY,
      ),
      heading: initialRabbit.address.heading,
    });
    expect(resolveCoreWildlifePredatorContact({
      attacker: initialCougar,
      target: nearbyWithoutKnowledge,
      atTick: 0,
      contactRadiusUnits: contactPolicy.reachUnits,
      damageUnits: contactPolicy.damageUnits,
      cause: contactPolicy.cause,
    })).toBeNull();

    const sight = observationsFor(
      collectCoreEcologyVisualObservationBatches({
        actors: [initialRabbit, initialCougar],
        world: current.world,
        window: current.window,
        tick: 1,
      }),
      initialCougar.identity.stableId,
    ).find(({ subjectId }) => subjectId === initialRabbit.identity.stableId);
    expect(sight).toMatchObject({
      channel: "vision",
      perceivedClass: "live-prey",
      identification: "identified",
      area: { center: initialRabbit.address.position, radiusUnits: 0 },
    });
    if (sight === undefined) throw new Error("Cougar did not directly perceive the rabbit");

    const pursuit = stepCoreWildlifeActor(initialCougar, {
      tick: 1,
      observations: [sight],
      foodOpportunities: [livePreyOpportunity(sight, initialRabbit)],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    expect(pursuit?.decision.intent).toBe("pursue");
    if (pursuit === null) throw new Error("Cougar pursuit was rejected");

    const cougarMove = resolveLivingActorLocomotion({
      requestId: "alpha31:cougar-pursuit:1",
      tick: 1,
      actor: pursuit.actor.address,
      targetArea: sight.area,
      maximumStepUnits: coreWildlifeMaximumStepUnits("cougar", "pursue"),
      surface: flatSurface(pursuit.actor, 1),
    });
    expect(cougarMove).toMatchObject({ kind: "moved", reachedObservedArea: false });
    if (cougarMove.kind !== "moved") throw new Error("Shared cougar locomotion did not move");
    const cougarAtContact = repositionCoreWildlifeActor(pursuit.actor, {
      atTick: 1,
      position: cougarMove.actor.position,
      heading: cougarMove.actor.heading,
    });
    const rabbitAtContact = repositionCoreWildlifeActor(initialRabbit, {
      atTick: 1,
      position: initialRabbit.address.position,
      heading: initialRabbit.address.heading,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, cougarAtContact);
    patch = replaceCoreEcologyAggregatePatchActor(patch, rabbitAtContact);

    const mortality = resolveCoreWildlifePredatorContact({
      attacker: cougarAtContact,
      target: rabbitAtContact,
      atTick: 1,
      contactRadiusUnits: contactPolicy.reachUnits,
      damageUnits: contactPolicy.damageUnits,
      cause: contactPolicy.cause,
    });
    expect(mortality?.event).toMatchObject({
      outcome: "death",
      healthBefore: 700_000,
      healthAfter: 0,
    });
    if (mortality === null) throw new Error("Exact cougar contact did not resolve");

    const staleCougar = repositionCoreWildlifeActor(cougarAtContact, {
      atTick: 2,
      position: cougarAtContact.address.position,
      heading: cougarAtContact.address.heading,
    });
    const staleRabbit = repositionCoreWildlifeActor(rabbitAtContact, {
      atTick: 2,
      position: rabbitAtContact.address.position,
      heading: rabbitAtContact.address.heading,
    });
    expect(resolveCoreWildlifePredatorContact({
      attacker: staleCougar,
      target: staleRabbit,
      atTick: 2,
      contactRadiusUnits: contactPolicy.reachUnits,
      damageUnits: contactPolicy.damageUnits,
      cause: contactPolicy.cause,
    })).toBeNull();

    const coarse = canonicalizeCoreEcologyAggregatePatch({
      ...patch,
      populations: patch.populations.map((population) => ({
        ...population,
        members: population.members.map((member) => (
          member.actor.identity.stableId === cougarAtContact.identity.stableId
            ? { ...member, materialization: "coarse" }
            : member
        )),
      })),
    });
    expect(coarse).not.toBeNull();
    expect(applyCoreEcologyWildlifeMortality(coarse, {
      result: mortality,
      temperature: TEMPERATURE,
    })).toBeNull();

    const rabbitPopulationBefore = patch.populations.find(
      ({ species }) => species === "marsh-rabbit",
    );
    if (rabbitPopulationBefore === undefined) throw new Error("Rabbit population was lost");
    const death = applyCoreEcologyWildlifeMortality(patch, {
      result: mortality,
      temperature: TEMPERATURE,
    });
    if (death?.carcass === null || death?.transaction === null || death === null) {
      throw new Error("Cougar contact did not commit one body");
    }
    const rabbitPopulation = death.patch.populations.find(
      ({ species }) => species === "marsh-rabbit",
    );
    expect(rabbitPopulation?.populationSize).toBe(rabbitPopulationBefore.populationSize - 1);
    expect(
      (rabbitPopulation?.reserveUnits ?? 0)
        + (rabbitPopulation?.members.reduce(
          (total, member) => total + member.representedUnits,
          0,
        ) ?? 0),
    ).toBe(rabbitPopulation?.populationSize);
    expect(death.patch.mortalityTransactions).toHaveLength(1);
    expect(death.patch.carcasses).toHaveLength(1);
    expect(death.transaction.removedPopulationUnits).toBe(1);
    expect(coreEcologyAggregatePatchActor(
      death.patch,
      initialRabbit.identity.stableId,
    )).toBeNull();

    const body = death.carcass;
    const carrionSight = createActorObservation({
      id: "obs:alpha31:brown-bear-carrion:2",
      observerId: initialBear.identity.stableId,
      observedAtTick: 2,
      channel: "vision",
      perceivedClass: "carrion",
      subjectId: body.carcassId,
      area: {
        center: body.deathPosition,
        radiusUnits: Math.min(
          body.bodySizeUnits * 100,
          WORLD_POSITION_UNITS_PER_TILE,
        ),
      },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: 800_000,
      identification: "identified",
    });
    if (carrionSight === null) throw new Error("Bear carrion observation was rejected");
    const scavenging = stepCoreWildlifeActor(initialBear, {
      tick: 2,
      observations: [carrionSight],
      foodOpportunities: [carrionOpportunity(carrionSight, body)],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    expect(scavenging?.decision.intent).toBe("scavenge");
    expect(scavenging?.resourceClaims).toHaveLength(1);
    if (scavenging === null || scavenging.resourceClaims[0] === undefined) {
      throw new Error("Brown bear did not propose a carcass claim");
    }

    const bearMove = resolveLivingActorLocomotion({
      requestId: "alpha31:brown-bear-scavenge:2",
      tick: 2,
      actor: scavenging.actor.address,
      targetArea: carrionSight.area,
      maximumStepUnits: coreWildlifeMaximumStepUnits("brown-bear", "scavenge"),
      surface: flatSurface(scavenging.actor, 2),
    });
    expect(bearMove).toMatchObject({ kind: "moved", reachedObservedArea: true });
    if (bearMove.kind !== "moved") throw new Error("Shared brown-bear locomotion did not move");
    const bearAtBody = repositionCoreWildlifeActor(scavenging.actor, {
      atTick: 2,
      position: bearMove.actor.position,
      heading: bearMove.actor.heading,
    });
    let bearPatch = replaceCoreEcologyAggregatePatchActor(death.patch, bearAtBody);
    const delta = worldPositionDelta(bearAtBody.address.position, body.deathPosition);
    const reach = carrionSight.area.radiusUnits;
    expect(delta.x * delta.x + delta.y * delta.y).toBeLessThanOrEqual(reach * reach);

    const claim = scavenging.resourceClaims[0];
    const claimed = claimCoreWildlifeCarcass(body, {
      actorId: bearAtBody.identity.stableId,
      provenanceId: claim.eventId,
      atTick: 2,
    });
    const consumed = claimed === null ? null : consumeCoreWildlifeCarcass(claimed, {
      actorId: bearAtBody.identity.stableId,
      units: claim.requestedUnits,
      atTick: 2,
    });
    expect(coreEcologySpeciesCanFeedFromCarcass("brown-bear")).toBe(true);
    expect(coreEcologySpeciesCanGuardCarcass("brown-bear")).toBe(true);
    expect(consumed).toMatchObject({
      currentClaimantActorId: bearAtBody.identity.stableId,
      remainingResourceUnits: body.originalResourceUnits - 1,
      consumedResourceUnits: 1,
    });
    if (consumed === null) throw new Error("Brown bear did not consume the claimed body");
    const replaced = replaceCoreEcologyAggregatePatchCarcass(bearPatch, consumed);
    if (replaced === null) throw new Error("Consumed body did not return to patch custody");
    bearPatch = replaced;
    expect(bearPatch.carcasses).toHaveLength(1);
    expect(
      bearPatch.carcasses[0]!.remainingResourceUnits
        + bearPatch.carcasses[0]!.consumedResourceUnits
        + bearPatch.carcasses[0]!.decayedResourceUnits,
    ).toBe(body.originalResourceUnits);

    expect(coreEcologyCanPursueLivingActor("cougar", "marsh-rabbit")).toBe(true);
    expect(coreEcologyCanResolveMortalityTarget("cougar", "marsh-rabbit")).toBe(true);
    expect(coreEcologyCanPursueLivingActor("cougar", "elk")).toBe(true);
    expect(coreEcologyCanResolveMortalityTarget("cougar", "elk")).toBe(false);
    expect(coreEcologyCanResolveMortalityTarget("cougar", "deer")).toBe(false);
    expect(coreEcologyCanPursueLivingActor("brown-bear", "marsh-rabbit")).toBe(false);
  });
});

function predatorPatch(current: Fixture): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyRegionalPredatorHabitatAssemblage({
    rootSeed: current.state.meta.rootSeed,
    originRegion: REGION,
    domesticAnchor: {
      anchorId: "settlement:alpha31:storehouse-yard",
      species: "domestic-chicken",
      position: createWorldPosition(REGION, 64_500, 64_500),
      radiusTiles: 8,
    },
  });
  const required = ["cougar", "brown-bear", "marsh-rabbit"] as const;
  if (required.some((species) => (
    habitat.populations.find((population) => population.species === species)
      ?.populationUnits === 0
  ))) {
    throw new Error("Alpha 31 representative habitat did not support the required actors");
  }
  return createCoreEcologyAggregatePatch({
    seed: current.state.meta.rootSeed,
    patchKey: "alpha31:predator-scavenger",
    originRegion: REGION,
    derivation: { kind: "habitat-v11", habitat },
    populations: habitatPopulations(habitat),
  });
}

function habitatPopulations(habitat: CoreEcologyRegionalPredatorHabitatAssemblage) {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation, index) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: stagedPosition(population.species, index, allocation.position),
            heading: population.species === "marsh-rabbit" ? 500_000 : 0,
            materialization: index === 0 && (
              population.species === "cougar"
              || population.species === "brown-bear"
              || population.species === "marsh-rabbit"
            ) ? "materialized" as const : "coarse" as const,
          })),
        }]
  ));
}

function stagedPosition(
  species: CoreEcologyRegionalPredatorHabitatAssemblage["populations"][number]["species"],
  index: number,
  fallback: CoreEcologyRegionalPredatorHabitatAssemblage["populations"][number]["allocations"][number]["position"],
) {
  if (index !== 0) return fallback;
  if (species === "cougar") {
    return createWorldPosition(REGION, 38_500, Y * 1_000 + 500);
  }
  if (species === "brown-bear") {
    return createWorldPosition(REGION, 38_700, Y * 1_000 + 500);
  }
  if (species === "marsh-rabbit") {
    return createWorldPosition(REGION, 39_500, Y * 1_000 + 500);
  }
  return fallback;
}

function actor(
  patch: CoreEcologyAggregatePatchState,
  species: "cougar" | "brown-bear" | "marsh-rabbit",
): CoreWildlifeActorState {
  const value = patch.populations.find((population) => population.species === species)
    ?.members[0]?.actor;
  if (value === undefined) throw new Error(`Missing ${species} fixture actor`);
  return value;
}

function hungry(actorState: CoreWildlifeActorState): CoreWildlifeActorState {
  return replaceCoreWildlifeActorPhysiology(actorState, {
    atTick: actorState.updatedAtTick,
    needs: { ...actorState.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: actorState.condition,
  });
}

function livePreyOpportunity(
  observation: ActorObservation,
  prey: CoreWildlifeActorState,
): CoreWildlifeFoodOpportunity {
  return Object.freeze({
    resourceId: prey.identity.stableId,
    observationId: observation.id,
    foodClass: "live-prey",
    sourceKind: "living-actor",
    availableUnits: 1,
    nutrition: 900_000,
    effort: 80_000,
    risk: 120_000,
    competition: 0,
    directlyConfirmed: true,
    accessible: true,
  });
}

function carrionOpportunity(
  observation: ActorObservation,
  body: CoreEcologyAggregatePatchState["carcasses"][number],
): CoreWildlifeFoodOpportunity {
  return Object.freeze({
    resourceId: body.carcassId,
    observationId: observation.id,
    foodClass: "carrion",
    sourceKind: "physical-carcass",
    availableUnits: body.remainingResourceUnits,
    nutrition: 900_000,
    effort: 100_000,
    risk: 120_000,
    competition: 0,
    directlyConfirmed: true,
    accessible: true,
  });
}

function flatSurface(actorState: CoreWildlifeActorState, tick: number) {
  const tile: TerrainTileView = {
    index: 0,
    x: 0,
    y: 0,
    terrain: "meadow",
    elevation: 0,
    moisture: 300_000,
    roughness: 0,
    baseTravelCost: 500_000,
    traceStrength: 0,
    waterDepth: 0,
  };
  return createLivingActorTraversabilitySurface({
    forActorId: actorState.identity.stableId,
    sampledAtTick: tick,
    origin: createWorldPosition(REGION, START_X * 1_000, Y * 1_000),
    widthTiles: 2,
    heightTiles: 1,
    cells: [
      coreWildlifeTraversabilityCell(actorState.identity.species, tile),
      coreWildlifeTraversabilityCell(actorState.identity.species, tile),
    ],
  });
}

function fixture(): Fixture {
  const state = createWorld("alpha31 cougar rabbit brown bear chain", "standard");
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  for (const settlement of state.settlements) settlement.tileIndex = 0;
  for (let x = START_X - 1; x <= START_X + 2; x += 1) {
    const tile = state.terrain.tiles[Y * state.terrain.width + x];
    if (tile === undefined) throw new Error("Alpha 31 perception corridor left terrain");
    tile.terrain = "meadow";
    tile.elevation = 0;
    tile.roughness = 0;
  }
  const economy = createWorldView(state);
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
    regionalFrameOriginAtAddress({ region: REGION, localX: START_X, localY: Y }),
  );
  const world = createRegionalWorldView(
    economy,
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  return { state, world, window };
}

function observationsFor(
  batches: readonly Readonly<{
    observerId: string;
    observations: readonly ActorObservation[];
  }>[] | null,
  observerId: string,
): readonly ActorObservation[] {
  return batches?.find((batch) => batch.observerId === observerId)?.observations ?? [];
}
