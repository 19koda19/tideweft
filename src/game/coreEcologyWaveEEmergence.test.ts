import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import { type CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, type TerrainTileView, type WorldState, type WorldView } from "../sim/types";
import { collectCoreEcologyVisualObservationBatches } from "./coreEcologyPerception";
import {
  coreEcologySpeciesCanFeedFromCarcass,
  coreEcologySpeciesCanGuardCarcass,
  coreEcologySpeciesPhysicalBodyResourceUnits,
  coreEcologySpeciesPhysicalBodySizeUnits,
  coreEcologySpeciesPredatorContact,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  coreEcologyCanPursueLivingActor,
  coreEcologyCanResolveMortalityTarget,
} from "./coreEcologyTrophic";
import { createCoreEcologyMortalityTransaction } from "./coreEcologyMortality";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  createCoreWildlifeActorState,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeFoodOpportunity,
} from "./coreWildlifeActor";
import {
  claimCoreWildlifeCarcass,
  consumeCoreWildlifeCarcass,
  createCoreWildlifeCarcass,
  releaseCoreWildlifeCarcass,
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

interface Fixture {
  readonly state: WorldState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
}

describe("Wave E role-driven mortality emergence", () => {
  it("lets a wolf lawfully catch solitary prey and a boar lawfully consume the conserved body", () => {
    const current = fixture("alpha30 wolf rabbit boar chain");
    const initialWolf = hungry(wildlife(current, "gray-wolf", START_X, 0, 0));
    const rabbit = wildlife(current, "marsh-rabbit", START_X + 1, 500_000, 0);
    const initialRabbit = replaceCoreWildlifeActorPhysiology(rabbit, {
      atTick: 0,
      needs: rabbit.needs,
      condition: { health: 600_000, exhaustion: 0, stress: 0 },
    });
    const sight = observationsFor(
      collectCoreEcologyVisualObservationBatches({
        actors: [initialRabbit, initialWolf],
        world: current.world,
        window: current.window,
        tick: 1,
      }),
      initialWolf.identity.stableId,
    ).find(({ subjectId }) => subjectId === initialRabbit.identity.stableId);
    expect(sight).toMatchObject({
      channel: "vision",
      perceivedClass: "live-prey",
      identification: "identified",
      area: { center: initialRabbit.address.position, radiusUnits: 0 },
    });
    if (sight === undefined) throw new Error("Wolf did not directly perceive the rabbit");

    const pursuit = stepCoreWildlifeActor(initialWolf, {
      tick: 1,
      observations: [sight],
      foodOpportunities: [livePreyOpportunity(sight, initialRabbit)],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    expect(pursuit?.decision.intent).toBe("pursue");
    if (pursuit === null) throw new Error("Wolf pursuit was rejected");

    const wolfMove = resolveLivingActorLocomotion({
      requestId: "alpha30:wolf-pursuit:1",
      tick: 1,
      actor: pursuit.actor.address,
      targetArea: sight.area,
      maximumStepUnits: coreWildlifeMaximumStepUnits("gray-wolf", "pursue"),
      surface: flatSurface(pursuit.actor, 1, START_X, 2),
    });
    expect(wolfMove).toMatchObject({ kind: "moved", reachedObservedArea: false });
    if (wolfMove.kind !== "moved") throw new Error("Shared wolf locomotion did not move");
    const wolfAtContact = repositionCoreWildlifeActor(pursuit.actor, {
      atTick: 1,
      position: wolfMove.actor.position,
      heading: wolfMove.actor.heading,
    });
    const rabbitAtContact = repositionCoreWildlifeActor(initialRabbit, {
      atTick: 1,
      position: initialRabbit.address.position,
      heading: initialRabbit.address.heading,
    });
    const contact = coreEcologySpeciesPredatorContact("gray-wolf");
    if (contact === null) throw new Error("Gray wolf contact policy is missing");
    const mortality = resolveCoreWildlifePredatorContact({
      attacker: wolfAtContact,
      target: rabbitAtContact,
      atTick: 1,
      contactRadiusUnits: contact.reachUnits,
      damageUnits: contact.damageUnits,
      cause: contact.cause,
    });
    expect(mortality?.event).toMatchObject({
      outcome: "death",
      healthBefore: 600_000,
      healthAfter: 0,
    });
    if (mortality === null) throw new Error("Exact wolf contact did not resolve");

    const body = createCoreWildlifeCarcass({
      mortalityEvent: mortality.event,
      sourceSpecies: "marsh-rabbit",
      bodySizeUnits: coreEcologySpeciesPhysicalBodySizeUnits("marsh-rabbit"),
      resourceUnits: coreEcologySpeciesPhysicalBodyResourceUnits("marsh-rabbit"),
      temperature: 500_000,
    });
    if (body === null) throw new Error("Rabbit body transaction was rejected");
    const transaction = createCoreEcologyMortalityTransaction({
      mortalityOrdinal: 0,
      event: mortality.event,
      retiredActor: mortality.target,
      representedUnitsBefore: 1,
      carcassId: body.carcassId,
    });
    expect(transaction).toMatchObject({
      removedPopulationUnits: 1,
      carcassId: body.carcassId,
    });

    const initialBoar = hungry(wildlife(current, "wild-boar", START_X, 0, 1));
    const carrionSight = createActorObservation({
      id: "obs:alpha30:boar-carrion:2",
      observerId: initialBoar.identity.stableId,
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
    if (carrionSight === null) throw new Error("Boar carrion observation was rejected");
    const scavenging = stepCoreWildlifeActor(initialBoar, {
      tick: 2,
      observations: [carrionSight],
      foodOpportunities: [{
        resourceId: body.carcassId,
        observationId: carrionSight.id,
        foodClass: "carrion",
        sourceKind: "physical-carcass",
        availableUnits: body.remainingResourceUnits,
        nutrition: 900_000,
        effort: 100_000,
        risk: 120_000,
        competition: 0,
        directlyConfirmed: true,
        accessible: true,
      }],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    expect(scavenging?.decision.intent).toBe("scavenge");
    expect(scavenging?.resourceClaims).toHaveLength(1);
    if (scavenging === null || scavenging.resourceClaims[0] === undefined) {
      throw new Error("Boar did not propose a carcass claim");
    }
    const boarMove = resolveLivingActorLocomotion({
      requestId: "alpha30:boar-scavenge:2",
      tick: 2,
      actor: scavenging.actor.address,
      targetArea: carrionSight.area,
      maximumStepUnits: coreWildlifeMaximumStepUnits("wild-boar", "scavenge"),
      surface: flatSurface(scavenging.actor, 2, START_X, 2),
    });
    expect(boarMove).toMatchObject({ kind: "moved", reachedObservedArea: true });
    if (boarMove.kind !== "moved") throw new Error("Shared boar locomotion did not move");
    const boarAtBody = repositionCoreWildlifeActor(scavenging.actor, {
      atTick: 2,
      position: boarMove.actor.position,
      heading: boarMove.actor.heading,
    });
    const delta = worldPositionDelta(boarAtBody.address.position, body.deathPosition);
    const reach = carrionSight.area.radiusUnits;
    expect(delta.x * delta.x + delta.y * delta.y).toBeLessThanOrEqual(reach * reach);

    const claim = scavenging.resourceClaims[0];
    const claimed = claimCoreWildlifeCarcass(body, {
      actorId: boarAtBody.identity.stableId,
      provenanceId: claim.eventId,
      atTick: 2,
    });
    const consumed = claimed === null ? null : consumeCoreWildlifeCarcass(claimed, {
      actorId: boarAtBody.identity.stableId,
      units: claim.requestedUnits,
      atTick: 2,
    });
    const released = consumed === null ? null : releaseCoreWildlifeCarcass(consumed, {
      actorId: boarAtBody.identity.stableId,
      atTick: 2,
    });
    expect(coreEcologySpeciesCanFeedFromCarcass("wild-boar")).toBe(true);
    expect(coreEcologySpeciesCanGuardCarcass("wild-boar")).toBe(false);
    expect(released).toMatchObject({
      currentClaimantActorId: null,
      remainingResourceUnits: body.originalResourceUnits - 1,
      consumedResourceUnits: 1,
    });
    expect(
      (released?.remainingResourceUnits ?? 0)
      + (released?.consumedResourceUnits ?? 0)
      + (released?.decayedResourceUnits ?? 0),
    ).toBe(body.originalResourceUnits);
  });

  it("drops pursuit after terrain occludes current evidence and rejects grouped or unapproved victims", () => {
    const open = fixture("alpha30 ridge knowledge", undefined);
    const occluded = fixture("alpha30 ridge knowledge", START_X + 2);
    const wolf = hungry(wildlife(open, "gray-wolf", START_X, 0, 0));
    const rabbit = wildlife(open, "marsh-rabbit", START_X + 4, 500_000, 0);
    const firstSight = observationsFor(
      collectCoreEcologyVisualObservationBatches({
        actors: [rabbit, wolf],
        world: open.world,
        window: open.window,
        tick: 1,
      }),
      wolf.identity.stableId,
    ).find(({ subjectId }) => subjectId === rabbit.identity.stableId);
    if (firstSight === undefined) throw new Error("Open corridor did not reveal rabbit");
    const pursuit = stepCoreWildlifeActor(wolf, {
      tick: 1,
      observations: [firstSight],
      foodOpportunities: [livePreyOpportunity(firstSight, rabbit)],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    if (pursuit === null) throw new Error("Initial wolf pursuit was rejected");
    expect(pursuit.decision.intent).toBe("pursue");

    const rabbitAtTickOne = repositionCoreWildlifeActor(rabbit, {
      atTick: 1,
      position: rabbit.address.position,
      heading: rabbit.address.heading,
    });
    const hiddenObservations = observationsFor(
      collectCoreEcologyVisualObservationBatches({
        actors: [rabbitAtTickOne, pursuit.actor],
        world: occluded.world,
        window: occluded.window,
        tick: 2,
      }),
      pursuit.actor.identity.stableId,
    );
    expect(hiddenObservations).toEqual([]);
    const disengaged = stepCoreWildlifeActor(pursuit.actor, {
      tick: 2,
      observations: hiddenObservations,
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    expect(disengaged?.decision.intent).not.toBe("pursue");
    if (disengaged === null) throw new Error("Occluded wolf step was rejected");

    const wolfAtFalseContact = repositionCoreWildlifeActor(disengaged.actor, {
      atTick: 2,
      position: createWorldPosition(REGION, 40_000, Y * 1_000 + 500),
      heading: 0,
    });
    const rabbitAtFalseContact = repositionCoreWildlifeActor(rabbitAtTickOne, {
      atTick: 2,
      position: createWorldPosition(REGION, 40_100, Y * 1_000 + 500),
      heading: 500_000,
    });
    const contact = coreEcologySpeciesPredatorContact("gray-wolf");
    if (contact === null) throw new Error("Gray wolf contact policy is missing");
    expect(resolveCoreWildlifePredatorContact({
      attacker: wolfAtFalseContact,
      target: rabbitAtFalseContact,
      atTick: 2,
      contactRadiusUnits: contact.reachUnits,
      damageUnits: contact.damageUnits,
      cause: contact.cause,
    })).toBeNull();
    expect(coreEcologyCanPursueLivingActor("gray-wolf", "elk")).toBe(true);
    expect(coreEcologyCanPursueLivingActor("gray-wolf", "deer")).toBe(true);
    expect(coreEcologyCanResolveMortalityTarget("gray-wolf", "elk")).toBe(false);
    expect(coreEcologyCanResolveMortalityTarget("gray-wolf", "deer")).toBe(false);
    expect(coreEcologyCanPursueLivingActor("wild-boar", "marsh-rabbit")).toBe(false);
  });
});

function hungry(actor: CoreWildlifeActorState): CoreWildlifeActorState {
  return replaceCoreWildlifeActorPhysiology(actor, {
    atTick: actor.updatedAtTick,
    needs: { ...actor.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: actor.condition,
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

function flatSurface(
  actor: CoreWildlifeActorState,
  tick: number,
  originTileX: number,
  widthTiles: number,
) {
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
    forActorId: actor.identity.stableId,
    sampledAtTick: tick,
    origin: createWorldPosition(REGION, originTileX * 1_000, Y * 1_000),
    widthTiles,
    heightTiles: 1,
    cells: Array.from({ length: widthTiles }, () => (
      coreWildlifeTraversabilityCell(actor.identity.species, tile)
    )),
  });
}

function fixture(seedText: string, ridgeAtX?: number): Fixture {
  const state = createWorld(seedText, "standard");
  state.weather = {
    ...state.weather,
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
  };
  for (const settlement of state.settlements) settlement.tileIndex = 0;
  for (let x = START_X - 1; x <= START_X + 5; x += 1) {
    const tile = state.terrain.tiles[Y * state.terrain.width + x];
    if (tile === undefined) throw new Error("Wave E perception corridor left terrain");
    tile.terrain = "meadow";
    tile.elevation = 0;
    tile.roughness = 0;
  }
  if (ridgeAtX !== undefined) {
    const ridge = state.terrain.tiles[Y * state.terrain.width + ridgeAtX];
    if (ridge === undefined) throw new Error("Wave E ridge left terrain");
    ridge.terrain = "ridge";
    ridge.elevation = FIXED_POINT;
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

function wildlife(
  current: Fixture,
  species: CoreWildlifeSpecies,
  tileX: number,
  heading: number,
  populationOrdinal: number,
): CoreWildlifeActorState {
  return createCoreWildlifeActorState({
    seed: current.state.meta.rootSeed,
    species,
    originRegion: REGION,
    populationKey: `alpha30:${species}`,
    populationOrdinal,
    position: createWorldPosition(
      REGION,
      tileX * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
      Y * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    ),
    heading,
  });
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
