import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { generateRegionTerrain } from "../sim/regionTerrain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  applyCoreEcologyCrossOwnerWildlifeMortality,
  advanceCoreEcologyDormantAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  CORE_ECOLOGY_MAX_STEP_TICKS,
  coreEcologyAggregatePatchActor,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  replaceCoreEcologyAggregatePatchCarcass,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { deriveCoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import { deriveCoreEcologyRegionalHabitat } from "./coreEcologyRegionalHabitat";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import {
  createCoreEcologyRegionalResidentPatchForRoot,
  createCoreEcologyRegionalResidentPatch,
} from "./regionalEcologyResidents";
import {
  adoptRegionalEcologyFromV24,
  advanceRegionalEcologyRoot,
  createPristineRegionalEcologyRoot,
  putRegionalEcologyResidentDeviation,
  regionalEcologyResidentDeviation,
} from "./regionalEcology";
import { projectRegionalEcologyLegacyCohort } from "./regionalEcologyLegacyCohort";
import {
  canonicalRegionalEcologyStateForWorld,
  canonicalizeRegionalEcologyState,
  commitRegionalEcologyActiveProjection,
  createRegionalEcologyState,
  deserializeRegionalEcologyState,
  projectRegionalEcologyActiveState,
  regionalEcologyActiveResidentPatches,
  regionalEcologyPatchResidenceRegions,
  regionalEcologyRegionalResidentsForActiveRegions,
  regionalEcologyResidentTransitionIsVisitationOnly,
  regionalEcologySourceOwnership,
  replaceRegionalEcologyActiveState,
  serializeRegionalEcologyState,
} from "./regionalEcologyState";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  repositionCoreWildlifeActorWithMovementEvidence,
  stepCoreWildlifeActor,
} from "./coreWildlifeActor";
import {
  claimCoreWildlifeCarcass,
  createCoreWildlifeCarcass,
  releaseCoreWildlifeCarcass,
} from "./coreWildlifeCarcass";
import { createCoreEcologyMortalityTransaction } from "./coreEcologyMortality";
import {
  resolveCoreWildlifePredatorContact,
  type CoreWildlifeMortalityEvent,
} from "./coreWildlifeMortality";
import { coreEcologySpeciesPredatorContact } from "./coreEcologySpeciesRuntimePolicy";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha32-regional-habitat-properties");
const TICK = 19;
const HOME_REGION = createRegionCoord(-3, 0);
const WILD_REGION = createRegionCoord(2, -5);
const PREDATOR_REGION = createRegionCoord(-3, -2);
const EMPTY_REGION = createRegionCoord(-2, 0);
const PRESSURE_REGION = createRegionCoord(-10, -20);
const LEGACY_ORIGIN = createRegionCoord(37, -41);
const OTHER_HOT_REGION = createRegionCoord(-1, 1);

function patchAt(region: ReturnType<typeof createRegionCoord>): CoreEcologyAggregatePatchState {
  return createCoreEcologyRegionalResidentPatch({
    seed: SEED,
    habitat: deriveCoreEcologyRegionalHabitat({ seed: SEED, region }),
    tick: TICK,
  });
}

function homeAt(region: ReturnType<typeof createRegionCoord>): CoreEcologyAggregatePatchState {
  const terrain = generateRegionTerrain(SEED, region);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `alpha32:owner:home:${region.x}:${region.y}`,
        species: "domestic-chicken" as const,
        position: createWorldPosition(
          region,
          x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
          y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        ),
        radiusTiles: 8,
      };
      try {
        return createCoreEcologySettlementHomePatch({
          seed: SEED,
          habitat: deriveCoreEcologyRegionalPredatorHabitatAssemblage({
            rootSeed: SEED,
            originRegion: region,
            terrain,
            domesticAnchor,
          }),
          tick: TICK,
        });
      } catch {
        // Search the deterministic terrain for a lawful settlement home.
      }
    }
  }
  throw new Error("Regional owner fixture could not place its settlement home");
}

function homeHabitatAt(region: ReturnType<typeof createRegionCoord>) {
  const terrain = generateRegionTerrain(SEED, region);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `alpha32:owner:home:${region.x}:${region.y}`,
        species: "domestic-chicken" as const,
        position: createWorldPosition(
          region,
          x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
          y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        ),
        radiusTiles: 8,
      };
      try {
        return deriveCoreEcologyRegionalPredatorHabitatAssemblage({
          rootSeed: SEED,
          originRegion: region,
          terrain,
          domesticAnchor,
        });
      } catch {
        // Search the deterministic terrain for a lawful settlement home.
      }
    }
  }
  throw new Error("Regional owner fixture could not derive its settlement home habitat");
}

function fixture() {
  const root = createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK });
  const home = homeAt(HOME_REGION);
  const wild = patchAt(WILD_REGION);
  if (home.populations.length === 0 || wild.populations.length === 0) {
    throw new Error("Regional owner fixture needs occupied source patches");
  }
  return { root, home, wild } as const;
}

function advanceCoarsePatchInCanonicalSteps(
  source: CoreEcologyAggregatePatchState,
  targetTick: number,
): CoreEcologyAggregatePatchState {
  let patch = source;
  while (patch.updatedAtTick < targetTick) {
    const result = stepCoreEcologyAggregatePatch(patch, {
      tick: Math.min(
        targetTick,
        patch.updatedAtTick + CORE_ECOLOGY_MAX_STEP_TICKS,
      ),
      actorSteps: [],
    });
    if (result === null) {
      throw new Error("Coarse ecology fixture could not reach its target tick");
    }
    patch = result.patch;
  }
  return patch;
}

function stateFixture() {
  const { root, home, wild } = fixture();
  return createRegionalEcologyState({
    root,
    settlementHome: { sourceKey: home.patchKey, patch: home },
    activeRegions: [WILD_REGION, HOME_REGION, WILD_REGION],
    activeResidents: [{
      kind: "regional-habitat",
      sourceKey: wild.patchKey,
      patch: wild,
    }],
  });
}

function legacyStateFixture() {
  const source = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha32:state-legacy-v24-source",
    originRegion: LEGACY_ORIGIN,
    tick: TICK,
    derivation: { kind: "bounded-input-v1" },
    populations: [{
      species: "marsh-rabbit",
      populationKey: "alpha32/state-legacy-rabbit",
      members: [{
        populationOrdinal: 0,
        position: createWorldPosition(LEGACY_ORIGIN, 20_000, 20_000),
        materialization: "materialized",
      }],
    }],
  });
  const actorId = source.populations[0]?.members[0]?.actor.identity.stableId;
  if (actorId === undefined) throw new Error("Legacy state fixture needs one actor");
  const root = adoptRegionalEcologyFromV24({
    rootSeed: SEED,
    completedTick: TICK,
    sourceEnvelopeIntegrity: hashCanonical("alpha32 state v24 envelope"),
    legacyPatch: source,
    protectedActorIds: [actorId],
  });
  const legacy = projectRegionalEcologyLegacyCohort({ rootSeed: SEED, root });
  if (legacy === null) throw new Error("Legacy state fixture projection failed");
  const home = homeAt(HOME_REGION);
  const state = createRegionalEcologyState({
    root,
    settlementHome: { sourceKey: home.patchKey, patch: home },
    activeRegions: [EMPTY_REGION],
    activeResidents: [{
      kind: "legacy-cohort",
      sourceKey: legacy.patchKey,
      patch: legacy,
    }],
  });
  return { source, root, legacy, home, state } as const;
}

function windowAt(region = HOME_REGION): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: regionLocalToGlobalTile(region, 0, 0),
    terrain: Object.freeze({ width: 120, height: 120 }),
  });
}

let CACHED_CROSS_OWNER_PATCHES: Readonly<{
  predator: CoreEcologyAggregatePatchState;
  prey: CoreEcologyAggregatePatchState;
}> | null = null;

function crossOwnerRegionalPatches() {
  if (CACHED_CROSS_OWNER_PATCHES !== null) return CACHED_CROSS_OWNER_PATCHES;
  const predator = patchAt(PREDATOR_REGION);
  const prey = patchAt(WILD_REGION);
  const foxes = predator.populations.find(({ species }) => species === "marsh-fox")
    ?.members.map(({ actor }) => actor).sort((left, right) => (
      compareText(left.identity.stableId, right.identity.stableId)
    ));
  const rabbit = prey.populations.find(({ species }) => species === "marsh-rabbit")
    ?.members[0]?.actor;
  if (foxes === undefined || foxes.length < 2 || rabbit === undefined) {
    throw new Error("Cross-owner state fixture needs two foxes and one foreign rabbit");
  }
  CACHED_CROSS_OWNER_PATCHES = Object.freeze({ predator, prey });
  return CACHED_CROSS_OWNER_PATCHES;
}

function stageCrossOwnerDeath(attackerIndex: 0 | 1 = 0) {
  const initial = crossOwnerRegionalPatches();
  const foxes = initial.predator.populations.find(({ species }) => species === "marsh-fox")
    ?.members.map(({ actor }) => actor).sort((left, right) => (
      compareText(left.identity.stableId, right.identity.stableId)
    ));
  const rabbit = initial.prey.populations.find(({ species }) => species === "marsh-rabbit")
    ?.members[0]?.actor;
  const selectedFox = foxes?.[attackerIndex];
  const otherFox = foxes?.[attackerIndex === 0 ? 1 : 0];
  const policy = coreEcologySpeciesPredatorContact("marsh-fox");
  if (selectedFox === undefined || otherFox === undefined || rabbit === undefined || policy === null) {
    throw new Error("Cross-owner death fixture lost its actors or contact policy");
  }
  const predator = setCoreEcologyAggregatePatchMaterializedActors(initial.predator, {
    atTick: TICK,
    actorIds: [selectedFox.identity.stableId],
  });
  const prey = setCoreEcologyAggregatePatchMaterializedActors(initial.prey, {
    atTick: TICK,
    actorIds: [rabbit.identity.stableId],
  });
  const fox = coreEcologyAggregatePatchActor(predator, selectedFox.identity.stableId);
  const rabbitActor = coreEcologyAggregatePatchActor(prey, rabbit.identity.stableId);
  if (fox === null || rabbitActor === null) throw new Error("Cross-owner materialization failed");
  const eventTick = TICK + 1;
  const contact = rabbitActor.address.position;
  const hungryFox = replaceCoreWildlifeActorPhysiology(fox, {
    atTick: TICK,
    needs: { ...fox.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: fox.condition,
  });
  const positionedFox = repositionCoreWildlifeActor(hungryFox, {
    atTick: TICK,
    position: contact,
    heading: 0,
  });
  const weakenedRabbit = replaceCoreWildlifeActorPhysiology(rabbitActor, {
    atTick: TICK,
    needs: rabbitActor.needs,
    condition: { ...rabbitActor.condition, health: policy.damageUnits },
  });
  const positionedRabbit = repositionCoreWildlifeActor(weakenedRabbit, {
    atTick: eventTick,
    position: contact,
    heading: 500_000,
  });
  const sight = createActorObservation({
    id: `obs:alpha32:state-cross-owner:${attackerIndex}:${eventTick}`,
    observerId: positionedFox.identity.stableId,
    observedAtTick: eventTick,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: positionedRabbit.identity.stableId,
    area: { center: contact, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: ACTOR_PERCEPTION_SCALE,
    identification: "identified",
  });
  if (sight === null) throw new Error("Cross-owner state observation failed");
  const pursuit = stepCoreWildlifeActor(positionedFox, {
    tick: eventTick,
    observations: [sight],
    foodOpportunities: [{
      resourceId: positionedRabbit.identity.stableId,
      observationId: sight.id,
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
  if (pursuit === null || pursuit.decision.intent !== "pursue") {
    throw new Error("Cross-owner state predator did not pursue");
  }
  const predatorAtEvent = replaceCoreEcologyAggregatePatchActor(predator, pursuit.actor);
  const preyAtEvent = replaceCoreEcologyAggregatePatchActor(prey, positionedRabbit);
  const result = resolveCoreWildlifePredatorContact({
    attacker: pursuit.actor,
    target: positionedRabbit,
    atTick: eventTick,
    contactRadiusUnits: policy.reachUnits,
    damageUnits: policy.damageUnits,
    cause: policy.cause,
  });
  if (result === null || result.event.outcome !== "death") {
    throw new Error("Cross-owner state death did not resolve");
  }
  const death = applyCoreEcologyCrossOwnerWildlifeMortality(preyAtEvent, {
    attackerPatch: predatorAtEvent,
    result,
    temperature: 500_000,
  });
  if (death === null || death.carcass === null || death.transaction === null) {
    throw new Error("Cross-owner state death did not commit");
  }
  return Object.freeze({
    initial,
    eventTick,
    attackerId: pursuit.actor.identity.stableId,
    otherFoxId: otherFox.identity.stableId,
    predatorAtEvent,
    preyAtEvent: death.patch,
    event: death.event,
    carcass: death.carcass,
  });
}

function crossOwnerClaimStateFixture() {
  const death = stageCrossOwnerDeath(0);
  const currentTick = death.eventTick + 1;
  const carrionSight = createActorObservation({
    id: `obs:alpha32:state-carrion:${currentTick}`,
    observerId: death.attackerId,
    observedAtTick: currentTick,
    channel: "vision",
    perceivedClass: "carrion",
    subjectId: death.carcass.carcassId,
    area: {
      center: death.carcass.deathPosition,
      radiusUnits: Math.min(
        death.carcass.bodySizeUnits * 100,
        WORLD_POSITION_UNITS_PER_TILE,
      ),
    },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: ACTOR_PERCEPTION_SCALE,
    identification: "identified",
  });
  if (carrionSight === null) throw new Error("Cross-owner carrion sight failed");
  const predatorStep = stepCoreEcologyAggregatePatch(death.predatorAtEvent, {
    tick: currentTick,
    actorSteps: [{
      actorId: death.attackerId,
      observations: [carrionSight],
      foodOpportunities: [{
        resourceId: death.carcass.carcassId,
        observationId: carrionSight.id,
        foodClass: "carrion",
        sourceKind: "physical-carcass",
        availableUnits: death.carcass.remainingResourceUnits,
        nutrition: 900_000,
        effort: 10_000,
        risk: 0,
        competition: 0,
        directlyConfirmed: true,
        accessible: true,
      }],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    }],
  });
  const preyStep = stepCoreEcologyAggregatePatch(death.preyAtEvent, {
    tick: currentTick,
    actorSteps: [],
  });
  const claim = predatorStep?.resourceClaims[0];
  const currentBody = preyStep?.patch.carcasses.find(({ carcassId }) => (
    carcassId === death.carcass.carcassId
  ));
  if (
    predatorStep === null
    || preyStep === null
    || claim === undefined
    || currentBody === undefined
  ) throw new Error("Cross-owner claim fixture did not step");
  const claimed = claimCoreWildlifeCarcass(currentBody, {
    actorId: death.attackerId,
    provenanceId: claim.eventId,
    atTick: currentTick,
  });
  const prey = claimed === null
    ? null
    : replaceCoreEcologyAggregatePatchCarcass(preyStep.patch, claimed);
  if (prey === null) throw new Error("Cross-owner claim fixture did not acquire its body");
  const home = homeAt(HOME_REGION);
  const homeStep = stepCoreEcologyAggregatePatch(home, {
    tick: currentTick,
    actorSteps: [],
  });
  if (homeStep === null) throw new Error("Cross-owner claim home did not advance");
  const pristineRoot = advanceRegionalEcologyRoot(
    createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK }),
    currentTick,
  );
  const withPredator = putRegionalEcologyResidentDeviation(pristineRoot, {
    rootSeed: SEED,
    patch: predatorStep.patch,
  });
  const root = putRegionalEcologyResidentDeviation(withPredator, {
    rootSeed: SEED,
    patch: prey,
  });
  const state = createRegionalEcologyState({
    root,
    settlementHome: { sourceKey: homeStep.patch.patchKey, patch: homeStep.patch },
    activeRegions: [HOME_REGION, PREDATOR_REGION, WILD_REGION],
    activeResidents: [
      {
        kind: "regional-habitat",
        sourceKey: predatorStep.patch.patchKey,
        patch: predatorStep.patch,
      },
      { kind: "regional-habitat", sourceKey: prey.patchKey, patch: prey },
    ],
  });
  return Object.freeze({
    ...death,
    currentTick,
    pristineRoot,
    root,
    home: homeStep.patch,
    predator: predatorStep.patch,
    prey,
    state,
  });
}

function retireCrossOwnerAttackerAtEventTick(
  death: ReturnType<typeof stageCrossOwnerDeath>,
): CoreEcologyAggregatePatchState {
  const attacker = coreEcologyAggregatePatchActor(death.predatorAtEvent, death.attackerId);
  const killer = coreEcologyAggregatePatchActor(death.predatorAtEvent, death.otherFoxId);
  if (attacker === null || killer === null) throw new Error("Retirement fixture lost a fox");
  const currentKiller = replaceCoreWildlifeActorPhysiology(killer, {
    atTick: death.eventTick,
    needs: killer.needs,
    condition: killer.condition,
  });
  const withCurrentKiller = replaceCoreEcologyAggregatePatchActor(
    death.predatorAtEvent,
    currentKiller,
  );
  const terminalAttacker = replaceCoreWildlifeActorPhysiology(attacker, {
    atTick: death.eventTick,
    needs: attacker.needs,
    condition: { ...attacker.condition, health: 0 },
  });
  const eventBody = Object.freeze({
    version: 1 as const,
    atTick: death.eventTick,
    cause: "predator-contact" as const,
    causeReferenceId: `obs:alpha32:state-retirement:${death.attackerId}`,
    observationId: `obs:alpha32:state-retirement:${death.attackerId}`,
    attackerId: death.otherFoxId,
    victimId: death.attackerId,
    attackerPosition: attacker.address.position,
    victimPosition: attacker.address.position,
    contactRadiusUnits: 1,
    contactDistanceSquaredUnits: 0,
    damageUnits: attacker.condition.health,
    healthBefore: attacker.condition.health,
    healthAfter: 0,
    outcome: "death" as const,
  });
  const event: CoreWildlifeMortalityEvent = Object.freeze({
    ...eventBody,
    eventId: `wildlife-harm:${hashCanonical(eventBody)}`,
  });
  const body = createCoreWildlifeCarcass({
    mortalityEvent: event,
    sourceSpecies: attacker.identity.species,
    bodySizeUnits: 1,
    resourceUnits: 1,
    temperature: 500_000,
  });
  if (body === null) throw new Error("Retirement fixture body failed");
  const transaction = createCoreEcologyMortalityTransaction({
    mortalityOrdinal: 0,
    event,
    retiredActor: terminalAttacker,
    representedUnitsBefore: withCurrentKiller.populations
      .find(({ species }) => species === attacker.identity.species)
      ?.members.find(({ actor }) => actor.identity.stableId === death.attackerId)
      ?.representedUnits ?? 0,
    carcassId: body.carcassId,
  });
  const populations = withCurrentKiller.populations.map((population) => {
    const member = population.members.find(({ actor }) => (
      actor.identity.stableId === death.attackerId
    ));
    if (member === undefined) return population;
    return Object.freeze({
      ...population,
      populationSize: population.populationSize - 1,
      reserveUnits: population.reserveUnits + member.representedUnits - 1,
      members: Object.freeze(population.members.filter(({ actor }) => (
        actor.identity.stableId !== death.attackerId
      ))),
    });
  });
  const patch = canonicalizeCoreEcologyAggregatePatch({
    ...withCurrentKiller,
    populations,
    nextMortalityOrdinal: 1,
    mortalityTransactions: [transaction],
    carcasses: [body],
  });
  if (patch === null) throw new Error("Retirement fixture patch failed canonicalization");
  return patch;
}

describe("regional ecology v25 owner substrate", () => {
  it("canonicalizes one home plus a bounded order-independent hot neighborhood", () => {
    const first = stateFixture();
    const { root, home, wild } = fixture();
    const replay = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, WILD_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: wild.patchKey,
        patch: wild,
      }],
    });

    expect(stableStringify(replay)).toBe(stableStringify(first));
    expect(first.updatedAtTick).toBe(first.root.updatedAtTick);
    expect(first.activeRegions).toEqual(
      [...first.activeRegions].sort((left, right) => {
        const leftKey = `r:${left.x}:${left.y}`;
        const rightKey = `r:${right.x}:${right.y}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
    );
    expect(first.activeResidents.every(({ patch }) => patch.updatedAtTick === TICK)).toBe(true);
    expect([first.settlementHome, ...first.activeResidents].flatMap(({ patch }) => (
      patch.populations.flatMap(({ members }) => members)
    )).every(({ materialization }) => materialization === "coarse")).toBe(true);

    const text = serializeRegionalEcologyState(first);
    expect(deserializeRegionalEcologyState(text)).toEqual(first);
    expect(canonicalizeRegionalEcologyState(first)).toBe(first);
    expect(canonicalRegionalEcologyStateForWorld(first, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBe(first);
    expect(canonicalRegionalEcologyStateForWorld(first, {
      rootSeed: seedFromText("forged-alpha32-world"),
      completedTick: TICK,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBeNull();
    expect(canonicalRegionalEcologyStateForWorld(first, {
      rootSeed: SEED,
      completedTick: TICK + 1,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBeNull();
    expect(deserializeRegionalEcologyState(`${text}\n`)).toBeNull();
    expect(canonicalizeRegionalEcologyState({ ...first, debug: true })).toBeNull();

    const ownership = regionalEcologySourceOwnership(first);
    expect(ownership?.map(({ sourceKey }) => sourceKey)).toEqual(
      [...(ownership ?? [])].map(({ sourceKey }) => sourceKey).sort(),
    );
    expect(new Set(ownership?.flatMap(({ actorIds }) => actorIds)).size).toBe(
      ownership?.flatMap(({ actorIds }) => actorIds).length,
    );
  });

  it("keeps the settlement owner active when one of its bodies crosses the home seam", () => {
    const root = createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK });
    const home = homeAt(HOME_REGION);
    const actor = home.populations.flatMap(({ members }) => members)[0]?.actor;
    if (actor === undefined) throw new Error("Home residence fixture needs one actor");
    const movedActor = repositionCoreWildlifeActor(actor, {
      atTick: TICK,
      position: createWorldPosition(OTHER_HOT_REGION, 24_000, 24_000),
      heading: actor.address.heading,
    });
    const movedHome = replaceCoreEcologyAggregatePatchActor(home, movedActor);
    const state = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: movedHome.patchKey, patch: movedHome },
      activeRegions: [OTHER_HOT_REGION],
      activeResidents: [],
    });

    expect(regionalEcologyPatchResidenceRegions(state.settlementHome.patch))
      .toContainEqual(OTHER_HOT_REGION);
    expect(regionalEcologyActiveResidentPatches(state)?.map(({ sourceKey }) => sourceKey))
      .toEqual([movedHome.patchKey]);
    expect(regionalEcologySourceOwnership(state, true)?.map(({ sourceKey }) => sourceKey))
      .toEqual([movedHome.patchKey]);
    expect(projectRegionalEcologyActiveState(state, windowAt(OTHER_HOT_REGION))?.residents
      .map(({ sourceKey }) => sourceKey)).toEqual([movedHome.patchKey]);
  });

  it("authenticates one foreign death and current body claim without duplicating biomass", () => {
    const fixture = crossOwnerClaimStateFixture();
    const body = fixture.prey.carcasses.find(({ sourceActorId }) => (
      sourceActorId === fixture.event.victimId
    ));
    expect(body).toMatchObject({
      currentClaimantActorId: fixture.attackerId,
      sourceMortalityEventId: fixture.event.eventId,
    });
    expect(fixture.prey.mortalityTransactions).toHaveLength(1);
    expect(fixture.prey.carcasses).toHaveLength(1);
    expect(body === undefined
      ? 0
      : body.remainingResourceUnits
        + body.consumedResourceUnits
        + body.decayedResourceUnits)
      .toBe(body?.originalResourceUnits);

    const replay = createRegionalEcologyState({
      root: fixture.root,
      settlementHome: { sourceKey: fixture.home.patchKey, patch: fixture.home },
      activeRegions: [WILD_REGION, HOME_REGION, PREDATOR_REGION],
      activeResidents: [
        { kind: "regional-habitat", sourceKey: fixture.prey.patchKey, patch: fixture.prey },
        {
          kind: "regional-habitat",
          sourceKey: fixture.predator.patchKey,
          patch: fixture.predator,
        },
      ],
    });
    expect(stableStringify(replay)).toBe(stableStringify(fixture.state));
    expect(deserializeRegionalEcologyState(serializeRegionalEcologyState(fixture.state)))
      .toEqual(fixture.state);
    expect(canonicalRegionalEcologyStateForWorld(fixture.state, {
      rootSeed: SEED,
      completedTick: fixture.currentTick,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBe(fixture.state);

    const projection = projectRegionalEcologyActiveState(
      fixture.state,
      windowAt(WILD_REGION),
    );
    if (projection === null) throw new Error("Cross-owner state did not project");
    const committed = commitRegionalEcologyActiveProjection(fixture.state, projection, {
      root: fixture.root,
      rootSeed: SEED,
      settlementHome: null,
      residents: projection.residents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
    });
    expect(committed?.integrity).toBe(fixture.state.integrity);

    const releasedBody = releaseCoreWildlifeCarcass(body, {
      actorId: fixture.attackerId,
      atTick: fixture.currentTick,
    });
    const releasedPrey = releasedBody === null
      ? null
      : replaceCoreEcologyAggregatePatchCarcass(fixture.prey, releasedBody);
    if (releasedPrey === null) throw new Error("Historical attacker fixture lost its body");
    const releasedRoot = putRegionalEcologyResidentDeviation(fixture.root, {
      rootSeed: SEED,
      patch: releasedPrey,
    });
    expect(() => createRegionalEcologyState({
      root: releasedRoot,
      settlementHome: { sourceKey: fixture.home.patchKey, patch: fixture.home },
      activeRegions: [HOME_REGION, WILD_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: releasedPrey.patchKey,
        patch: releasedPrey,
      }],
    })).not.toThrow();
  });

  it("rejects dangling or physically stale claimants at create, load, and commit boundaries", () => {
    const fixture = crossOwnerClaimStateFixture();
    expect(() => createRegionalEcologyState({
      root: fixture.pristineRoot,
      settlementHome: { sourceKey: fixture.home.patchKey, patch: fixture.home },
      activeRegions: [HOME_REGION, PREDATOR_REGION, WILD_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: fixture.prey.patchKey,
        patch: fixture.prey,
      }],
    })).toThrow(/invalid references/u);

    const victimSnapshot = fixture.state.activeResidents.find(({ sourceKey }) => (
      sourceKey === fixture.prey.patchKey
    ));
    if (victimSnapshot === undefined) throw new Error("Dangling load fixture lost its victim");
    const rawBase = {
      version: fixture.state.version,
      ownerId: fixture.state.ownerId,
      updatedAtTick: fixture.state.updatedAtTick,
      root: fixture.pristineRoot,
      settlementHome: fixture.state.settlementHome,
      activeRegions: fixture.state.activeRegions,
      activeResidents: [victimSnapshot],
    };
    expect(canonicalizeRegionalEcologyState({
      ...rawBase,
      integrity: hashCanonical(rawBase),
    })).toBeNull();

    const claimedBody = fixture.prey.carcasses.find(({ sourceActorId }) => (
      sourceActorId === fixture.event.victimId
    ));
    const localActor = fixture.prey.populations.flatMap(({ members }) => members)
      .find(({ actor: candidate }) => candidate.identity.stableId !== fixture.event.victimId)
      ?.actor;
    if (claimedBody === undefined || localActor === undefined) {
      throw new Error("Same-owner claimant fixture lacks a live actor or body");
    }
    const released = releaseCoreWildlifeCarcass(claimedBody, {
      actorId: fixture.attackerId,
      atTick: fixture.currentTick,
    });
    const locallyClaimed = released === null ? null : claimCoreWildlifeCarcass(released, {
      actorId: localActor.identity.stableId,
      provenanceId: "claim:alpha32:state-local-stale",
      atTick: fixture.currentTick,
    });
    const invalidLocalPrey = locallyClaimed === null
      ? null
      : replaceCoreEcologyAggregatePatchCarcass(fixture.prey, locallyClaimed);
    if (invalidLocalPrey === null) throw new Error("Same-owner stale claim fixture failed");
    expect(() => createRegionalEcologyState({
      root: fixture.pristineRoot,
      settlementHome: { sourceKey: fixture.home.patchKey, patch: fixture.home },
      activeRegions: [HOME_REGION, PREDATOR_REGION, WILD_REGION],
      activeResidents: [
        {
          kind: "regional-habitat",
          sourceKey: fixture.predator.patchKey,
          patch: fixture.predator,
        },
        {
          kind: "regional-habitat",
          sourceKey: invalidLocalPrey.patchKey,
          patch: invalidLocalPrey,
        },
      ],
    })).toThrow(/invalid references/u);

    const projection = projectRegionalEcologyActiveState(
      fixture.state,
      windowAt(WILD_REGION),
    );
    if (projection === null) throw new Error("Stale-claim commit fixture did not project");
    const predatorProjection = projection.residents.find(({ sourceKey }) => (
      sourceKey === fixture.predator.patchKey
    ));
    const actor = predatorProjection === undefined
      ? null
      : coreEcologyAggregatePatchActor(predatorProjection.patch, fixture.attackerId);
    if (predatorProjection === undefined || actor === null) {
      throw new Error("Stale-claim commit fixture lost its claimant");
    }
    const moved = repositionCoreWildlifeActor(actor, {
      atTick: fixture.currentTick,
      position: createWorldPosition(PREDATOR_REGION, 1_000, 1_000),
      heading: actor.address.heading,
    });
    const movedPredator = replaceCoreEcologyAggregatePatchActor(
      predatorProjection.patch,
      moved,
    );
    expect(commitRegionalEcologyActiveProjection(fixture.state, projection, {
      root: fixture.root,
      rootSeed: SEED,
      settlementHome: null,
      residents: projection.residents.map(({ sourceKey, patch }) => ({
        sourceKey,
        patch: sourceKey === movedPredator.patchKey ? movedPredator : patch,
      })),
    })).toBeNull();
  });

  it("uses global attacker order to authenticate a same-tick retired attacker", () => {
    const earlierAttacker = stageCrossOwnerDeath(0);
    expect(compareText(earlierAttacker.attackerId, earlierAttacker.otherFoxId)).toBeLessThan(0);
    const validRetiredOwner = retireCrossOwnerAttackerAtEventTick(earlierAttacker);
    const root = advanceRegionalEcologyRoot(
      createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK }),
      earlierAttacker.eventTick,
    );
    const home = stepCoreEcologyAggregatePatch(homeAt(HOME_REGION), {
      tick: earlierAttacker.eventTick,
      actorSteps: [],
    })?.patch;
    if (home === undefined) throw new Error("Same-tick lineage fixture lost home");
    expect(() => createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, PREDATOR_REGION, WILD_REGION],
      activeResidents: [
        {
          kind: "regional-habitat",
          sourceKey: validRetiredOwner.patchKey,
          patch: validRetiredOwner,
        },
        {
          kind: "regional-habitat",
          sourceKey: earlierAttacker.preyAtEvent.patchKey,
          patch: earlierAttacker.preyAtEvent,
        },
      ],
    })).not.toThrow();

    const laterAttacker = stageCrossOwnerDeath(1);
    expect(compareText(laterAttacker.otherFoxId, laterAttacker.attackerId)).toBeLessThan(0);
    const impossibleRetiredOwner = retireCrossOwnerAttackerAtEventTick(laterAttacker);
    expect(() => createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, PREDATOR_REGION, WILD_REGION],
      activeResidents: [
        {
          kind: "regional-habitat",
          sourceKey: impossibleRetiredOwner.patchKey,
          patch: impossibleRetiredOwner,
        },
        {
          kind: "regional-habitat",
          sourceKey: laterAttacker.preyAtEvent.patchKey,
          patch: laterAttacker.preyAtEvent,
        },
      ],
    })).toThrow(/invalid references/u);
  });

  it("keeps one receipt-bound legacy source resident outside the hot neighborhood", () => {
    const { root, legacy, home, state } = legacyStateFixture();
    expect(state.activeRegions).toEqual([EMPTY_REGION]);
    expect(state.activeResidents).toHaveLength(1);
    expect(state.activeResidents[0]).toMatchObject({
      kind: "legacy-cohort",
      region: LEGACY_ORIGIN,
      sourceKey: legacy.patchKey,
    });
    expect(canonicalRegionalEcologyStateForWorld(state, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBe(state);
    expect(regionalEcologyActiveResidentPatches(state)?.map(({ sourceKey }) => sourceKey))
      .toEqual([legacy.patchKey]);

    const projection = projectRegionalEcologyActiveState(state, windowAt(EMPTY_REGION));
    expect(projection?.residents).toHaveLength(1);
    expect(projection?.residents[0]).toMatchObject({
      kind: "legacy-cohort",
      sourceKey: legacy.patchKey,
    });
    expect(projection?.residents[0]?.patch.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);

    const moved = replaceRegionalEcologyActiveState(state, {
      expectedIntegrity: state.integrity,
      root,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [OTHER_HOT_REGION],
      activeResidents: [{
        kind: "legacy-cohort",
        sourceKey: legacy.patchKey,
        patch: legacy,
      }],
    });
    expect(moved.activeResidents[0]?.sourceKey).toBe(legacy.patchKey);
    expect(() => replaceRegionalEcologyActiveState(state, {
      expectedIntegrity: state.integrity,
      root,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [OTHER_HOT_REGION],
      activeResidents: [],
    })).toThrow(/Legacy ecology cannot unload/u);
  });

  it("rejects missing, foreign-receipt, and wrong-world legacy authority", () => {
    const { source, root, legacy, home, state } = legacyStateFixture();
    expect(canonicalRegionalEcologyStateForWorld(state, {
      rootSeed: seedFromText("alpha32 forged legacy state seed"),
      completedTick: TICK,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBeNull();

    const missing = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [EMPTY_REGION],
      activeResidents: [],
    });
    expect(canonicalRegionalEcologyStateForWorld(missing, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBeNull();

    const foreignRoot = adoptRegionalEcologyFromV24({
      rootSeed: SEED,
      completedTick: TICK,
      sourceEnvelopeIntegrity: hashCanonical("alpha32 different v24 envelope"),
      legacyPatch: source,
      protectedActorIds: source.populations.flatMap(({ members }) => (
        members.map(({ actor }) => actor.identity.stableId)
      )),
    });
    const crossedReceipts = createRegionalEcologyState({
      root: foreignRoot,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [EMPTY_REGION],
      activeResidents: [{
        kind: "legacy-cohort",
        sourceKey: legacy.patchKey,
        patch: legacy,
      }],
    });
    expect(canonicalRegionalEcologyStateForWorld(crossedReceipts, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBeNull();
  });

  it("steps and atomically commits the root-wide legacy source without replay", () => {
    const { root, legacy, home, state } = legacyStateFixture();
    const projection = projectRegionalEcologyActiveState(state, windowAt(EMPTY_REGION));
    const projectedLegacy = projection?.residents.find(({ kind }) => (
      kind === "legacy-cohort"
    ));
    if (projection === null || projectedLegacy === undefined) {
      throw new Error("Legacy commit fixture was not projected");
    }
    const nextTick = TICK + 1;
    const legacyStep = stepCoreEcologyAggregatePatch(projectedLegacy.patch, {
      tick: nextTick,
      actorSteps: [],
    });
    const homeStep = stepCoreEcologyAggregatePatch(home, {
      tick: nextTick,
      actorSteps: [],
    });
    if (legacyStep === null || homeStep === null) {
      throw new Error("Legacy commit fixture could not advance its coarse sources");
    }
    const advancedRoot = advanceRegionalEcologyRoot(root, nextTick);
    const committed = commitRegionalEcologyActiveProjection(state, projection, {
      root: advancedRoot,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: homeStep.patch },
      residents: [{ sourceKey: legacy.patchKey, patch: legacyStep.patch }],
    });
    expect(committed?.updatedAtTick).toBe(nextTick);
    expect(committed?.activeResidents[0]?.patch).toEqual(legacyStep.patch);
    expect(canonicalRegionalEcologyStateForWorld(committed, {
      rootSeed: SEED,
      completedTick: nextTick,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBe(committed);
    expect(projectRegionalEcologyLegacyCohort({
      rootSeed: SEED,
      root: advancedRoot,
    })).toBeNull();

    const forged = canonicalizeCoreEcologyAggregatePatch({
      ...legacyStep.patch,
      derivation: {
        ...legacyStep.patch.derivation,
        sourcePatchHash: hashCanonical("forged legacy lineage"),
      },
    });
    if (forged === null) throw new Error("Legacy transition tamper fixture was malformed");
    expect(commitRegionalEcologyActiveProjection(state, projection, {
      root: advancedRoot,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: homeStep.patch },
      residents: [{ sourceKey: legacy.patchKey, patch: forged }],
    })).toBeNull();
    expect(state.updatedAtTick).toBe(TICK);
    expect(state.activeResidents[0]?.patch).toEqual(legacy);
  });

  it("omits honest absence and rejects out-of-neighborhood or duplicate ownership", () => {
    const { root, home, wild } = fixture();
    const empty = patchAt(EMPTY_REGION);
    expect(empty.populations).toEqual([]);
    expect(empty.aggregatePopulations).toEqual([]);

    expect(() => createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [EMPTY_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: empty.patchKey,
        patch: empty,
      }],
    })).toThrow(/Honestly empty/u);

    expect(() => createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: wild.patchKey,
        patch: wild,
      }],
    })).toThrow(/active neighborhood/u);

    const aliased = canonicalizeCoreEcologyAggregatePatch({
      ...wild,
      patchKey: "legacy:aliased-cohort",
    });
    if (aliased === null) throw new Error("Aliased ownership fixture was not canonical");
    expect(() => createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, WILD_REGION],
      activeResidents: [
        { kind: "regional-habitat", sourceKey: wild.patchKey, patch: wild },
        { kind: "regional-habitat", sourceKey: aliased.patchKey, patch: aliased },
      ],
    })).toThrow(/overlap/u);

    expect(() => createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: Array.from({ length: 10 }, (_, x) => createRegionCoord(x, 0)),
      activeResidents: [],
    })).toThrow(/oversized/u);
  });

  it("selects a durable foreign-lineage owner by physical residence without transferring identity", () => {
    const { root, home, wild } = fixture();
    const actor = wild.populations.flatMap(({ members }) => members)[0]?.actor;
    if (actor === undefined) throw new Error("Residence fixture needs one regional actor");
    const movedActor = repositionCoreWildlifeActor(actor, {
      atTick: TICK,
      position: createWorldPosition(HOME_REGION, 24_000, 24_000),
      heading: actor.address.heading,
    });
    const moved = replaceCoreEcologyAggregatePatchActor(wild, movedActor);
    const durableRoot = putRegionalEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: moved,
    });
    const forward = regionalEcologyRegionalResidentsForActiveRegions(
      durableRoot,
      SEED,
      [HOME_REGION],
    );
    const replay = regionalEcologyRegionalResidentsForActiveRegions(
      durableRoot,
      SEED,
      [HOME_REGION, HOME_REGION],
    );
    const resident = forward?.find(({ sourceKey }) => sourceKey === moved.patchKey);
    expect(stableStringify(replay)).toBe(stableStringify(forward));
    expect(regionalEcologyPatchResidenceRegions(moved)).toContainEqual(HOME_REGION);
    expect(resident?.patch.originRegion).toEqual(WILD_REGION);
    expect(movedActor.identity.originRegion).toEqual(WILD_REGION);
    expect(movedActor.address.position.region).toEqual(HOME_REGION);
    const agedTick = TICK + CORE_ECOLOGY_MAX_STEP_TICKS * 2 + 7;
    const expectedAgedDeviation = advanceCoarsePatchInCanonicalSteps(moved, agedTick);
    const agedRoot = advanceRegionalEcologyRoot(durableRoot, agedTick);
    const agedRootBytes = stableStringify(agedRoot);
    const agedForward = regionalEcologyRegionalResidentsForActiveRegions(
      agedRoot,
      SEED,
      [HOME_REGION],
    );
    const agedReplay = regionalEcologyRegionalResidentsForActiveRegions(
      agedRoot,
      SEED,
      [HOME_REGION, HOME_REGION],
    );
    const agedResident = agedForward
      ?.find(({ sourceKey }) => sourceKey === moved.patchKey);
    expect(stableStringify(agedReplay)).toBe(stableStringify(agedForward));
    expect(agedResident?.patch).toEqual(expectedAgedDeviation);
    expect(agedResident?.patch.populations.flatMap(({ members }) => members)
      .find(({ actor: candidate }) => candidate.identity.stableId === actor.identity.stableId)
      ?.actor.address.position.region).toEqual(HOME_REGION);

    const populationConservation = (patch: CoreEcologyAggregatePatchState) => (
      patch.populations.map((population) => ({
        populationKey: population.populationKey,
        populationSize: population.populationSize,
        reserveUnits: population.reserveUnits,
        representedUnits: population.members.reduce((sum, member) => (
          sum + member.representedUnits
        ), 0),
      }))
    );
    expect(populationConservation(expectedAgedDeviation)).toEqual(
      populationConservation(moved),
    );

    const agedHome = advanceCoarsePatchInCanonicalSteps(home, agedTick);
    const coldResidents = regionalEcologyRegionalResidentsForActiveRegions(
      agedRoot,
      SEED,
      [EMPTY_REGION],
    );
    const warmResidents = regionalEcologyRegionalResidentsForActiveRegions(
      agedRoot,
      SEED,
      [HOME_REGION],
    );
    if (agedHome === undefined || coldResidents === null || warmResidents === null) {
      throw new Error("Aged residence fixture could not derive its clock-aligned owners");
    }
    expect(coldResidents.some(({ sourceKey }) => sourceKey === moved.patchKey)).toBe(false);
    expect(warmResidents.some(({ sourceKey }) => sourceKey === moved.patchKey)).toBe(true);
    const coldState = createRegionalEcologyState({
      root: agedRoot,
      settlementHome: { sourceKey: agedHome.patchKey, patch: agedHome },
      activeRegions: [EMPTY_REGION],
      activeResidents: coldResidents,
    });
    const reentered = replaceRegionalEcologyActiveState(coldState, {
      expectedIntegrity: coldState.integrity,
      root: agedRoot,
      rootSeed: SEED,
      settlementHome: { sourceKey: agedHome.patchKey, patch: agedHome },
      activeRegions: [HOME_REGION],
      activeResidents: warmResidents,
    });
    expect(reentered.activeResidents.find(
      ({ sourceKey }) => sourceKey === moved.patchKey,
    )?.patch).toEqual(expectedAgedDeviation);
    expect(stableStringify(reentered.root)).toBe(agedRootBytes);
    expect(reentered.root.revision).toBe(agedRoot.revision);
    expect(reentered.root.lastEventOrdinal).toBe(agedRoot.lastEventOrdinal);
    expect(regionalEcologyResidentDeviation(reentered.root, SEED, WILD_REGION))
      .toEqual(moved);
    const restored = deserializeRegionalEcologyState(
      serializeRegionalEcologyState(reentered),
    );
    expect(restored).toEqual(reentered);
    expect(canonicalRegionalEcologyStateForWorld(restored, {
      rootSeed: SEED,
      completedTick: agedTick,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBe(restored);
    const recooled = replaceRegionalEcologyActiveState(reentered, {
      expectedIntegrity: reentered.integrity,
      root: agedRoot,
      rootSeed: SEED,
      settlementHome: { sourceKey: agedHome.patchKey, patch: agedHome },
      activeRegions: [EMPTY_REGION],
      activeResidents: coldResidents,
    });
    expect(stableStringify(recooled.root)).toBe(agedRootBytes);

    const state = createRegionalEcologyState({
      root: durableRoot,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: forward ?? [],
    });
    const originalOwnership = regionalEcologySourceOwnership(state)
      ?.find(({ sourceKey }) => sourceKey === moved.patchKey);
    const reenteredOwnership = regionalEcologySourceOwnership(reentered)
      ?.find(({ sourceKey }) => sourceKey === moved.patchKey);
    expect({
      sourceKey: reenteredOwnership?.sourceKey,
      kind: reenteredOwnership?.kind,
      region: reenteredOwnership?.region,
      lineageHash: reenteredOwnership?.lineageHash,
      populationKeys: reenteredOwnership?.populationKeys,
      actorIds: reenteredOwnership?.actorIds,
      groupIds: reenteredOwnership?.groupIds,
      aggregateIds: reenteredOwnership?.aggregateIds,
      mortalityIds: reenteredOwnership?.mortalityIds,
      bodyIds: reenteredOwnership?.bodyIds,
    }).toEqual({
      sourceKey: originalOwnership?.sourceKey,
      kind: originalOwnership?.kind,
      region: originalOwnership?.region,
      lineageHash: originalOwnership?.lineageHash,
      populationKeys: originalOwnership?.populationKeys,
      actorIds: originalOwnership?.actorIds,
      groupIds: originalOwnership?.groupIds,
      aggregateIds: originalOwnership?.aggregateIds,
      mortalityIds: originalOwnership?.mortalityIds,
      bodyIds: originalOwnership?.bodyIds,
    });
    expect(canonicalRegionalEcologyStateForWorld(state, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBe(state);

    const forged = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: moved.patchKey,
        patch: moved,
      }],
    });
    expect(canonicalRegionalEcologyStateForWorld(forged, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitatAt(HOME_REGION),
    })).toBeNull();
  });

  it("re-enters signed-region pressure deviations exactly without replaying huge dormant time", () => {
    const root = createPristineRegionalEcologyRoot({
      rootSeed: SEED,
      completedTick: TICK,
    });
    const pressurePatch = patchAt(PRESSURE_REGION);
    const group = pressurePatch.groups.groups[0];
    const actor = pressurePatch.populations.flatMap(({ members }) => members)[0]?.actor;
    if (
      group === undefined
      || actor === undefined
      || pressurePatch.populations.some(({ members }) => (
        members.some(({ materialization }) => materialization !== "coarse")
      ))
    ) throw new Error("Signed pressure fixture requires one dormant shared group");
    const moved = replaceCoreEcologyAggregatePatchActor(
      pressurePatch,
      repositionCoreWildlifeActor(actor, {
        atTick: TICK,
        position: createWorldPosition(PRESSURE_REGION, 24_000, 24_000),
        heading: actor.address.heading,
      }),
    );
    const durableRoot = putRegionalEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: moved,
    });
    const referenceTick = TICK + 6_400 + 7;
    const referenceExpected = advanceCoarsePatchInCanonicalSteps(moved, referenceTick);
    const referenceRoot = advanceRegionalEcologyRoot(durableRoot, referenceTick);
    const referenceRootBytes = stableStringify(referenceRoot);
    const referenceResidents = regionalEcologyRegionalResidentsForActiveRegions(
      referenceRoot,
      SEED,
      [PRESSURE_REGION],
    );
    const referenceActual = referenceResidents
      ?.find(({ sourceKey }) => sourceKey === moved.patchKey)?.patch;
    expect(stableStringify(referenceActual)).toBe(stableStringify(referenceExpected));
    expect(stableStringify(referenceRoot)).toBe(referenceRootBytes);
    expect(regionalEcologyResidentDeviation(referenceRoot, SEED, PRESSURE_REGION)).toEqual(moved);

    const agedTick = TICK + 640_000 + 7;
    const expected = advanceCoreEcologyDormantAggregatePatch(moved, { atTick: agedTick });
    if (expected === null) throw new Error("Signed pressure accelerator rejected its fixture");
    const agedRoot = advanceRegionalEcologyRoot(durableRoot, agedTick);
    const rootBytes = stableStringify(agedRoot);
    const startedAt = performance.now();
    const residents = regionalEcologyRegionalResidentsForActiveRegions(
      agedRoot,
      SEED,
      [PRESSURE_REGION],
    );
    const elapsed = performance.now() - startedAt;
    const actual = residents?.find(({ sourceKey }) => sourceKey === moved.patchKey)?.patch;
    expect(stableStringify(actual)).toBe(stableStringify(expected));
    expect(elapsed).toBeLessThan(2_000);
    expect(stableStringify(agedRoot)).toBe(rootBytes);
    expect(regionalEcologyResidentDeviation(agedRoot, SEED, PRESSURE_REGION)).toEqual(moved);
    expect(actual?.groups.groups[0]).toMatchObject({
      revision: 80_000,
      nextLineageOrdinal: 20_000,
      nextAftermathOrdinal: 19_999,
    });

    const conservation = (patch: CoreEcologyAggregatePatchState) => patch.populations.map(
      (population) => ({
        populationKey: population.populationKey,
        populationSize: population.populationSize,
        reserveUnits: population.reserveUnits,
        representedUnits: population.members.reduce((sum, member) => (
          sum + member.representedUnits
        ), 0),
        actorIds: population.members.map(({ actor: memberActor }) => (
          memberActor.identity.stableId
        )),
      }),
    );
    expect(actual === undefined ? null : conservation(actual)).toEqual(conservation(moved));
    const actorIds = actual?.populations.flatMap(({ members }) => (
      members.map(({ actor: memberActor }) => memberActor.identity.stableId)
    )) ?? [];
    expect(new Set(actorIds).size).toBe(actorIds.length);
    expect(stableStringify(regionalEcologyRegionalResidentsForActiveRegions(
      agedRoot,
      SEED,
      [PRESSURE_REGION],
    ))).toBe(stableStringify(residents));
  });

  it("canonically chunks dormant cognition that cannot use the single-pass clock", () => {
    const root = createPristineRegionalEcologyRoot({
      rootSeed: SEED,
      completedTick: TICK,
    });
    const wild = patchAt(WILD_REGION);
    const actor = wild.populations.flatMap(({ members }) => members)[0]?.actor;
    if (actor === undefined || wild.groups.groups.length !== 0) {
      throw new Error("Dormant cognition fixture requires one group-free actor");
    }
    const moved = replaceCoreEcologyAggregatePatchActor(wild, repositionCoreWildlifeActor(actor, {
      atTick: TICK,
      position: createWorldPosition(HOME_REGION, 24_000, 24_000),
      heading: actor.address.heading,
    }));
    const materialized = setCoreEcologyAggregatePatchMaterializedActors(moved, {
      atTick: TICK,
      actorIds: [actor.identity.stableId],
    });
    const observedTick = TICK + 1;
    const observation = createActorObservation({
      id: `obs:alpha32:dormant-cognition:${observedTick}`,
      observerId: actor.identity.stableId,
      observedAtTick: observedTick,
      channel: "vision",
      perceivedClass: "human",
      subjectId: "human:alpha32:dormant-cognition",
      area: { center: actor.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "identified",
      interrupt: "strong",
    });
    if (observation === null) throw new Error("Dormant cognition observation failed");
    const observed = stepCoreEcologyAggregatePatch(materialized, {
      tick: observedTick,
      actorSteps: [{
        actorId: actor.identity.stableId,
        observations: [observation],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      }],
    });
    if (observed === null) throw new Error("Dormant cognition step failed");
    const dormant = setCoreEcologyAggregatePatchMaterializedActors(observed.patch, {
      atTick: observedTick,
      actorIds: [],
    });
    const dormantActor = dormant.populations.flatMap(({ members }) => members)
      .find(({ actor: candidate }) => candidate.identity.stableId === actor.identity.stableId)
      ?.actor;
    if (dormantActor === undefined) throw new Error("Dormant cognition actor was lost");
    expect(dormantActor.perception.suspicion).toBe("alert");
    expect(dormantActor.perception.salientMemory).toHaveLength(1);

    const durableRoot = putRegionalEcologyResidentDeviation(
      advanceRegionalEcologyRoot(root, observedTick),
      { rootSeed: SEED, patch: dormant },
    );
    const agedTick = observedTick + CORE_ECOLOGY_MAX_STEP_TICKS * 100 + 7;
    const expected = advanceCoarsePatchInCanonicalSteps(dormant, agedTick);
    const actual = regionalEcologyRegionalResidentsForActiveRegions(
      advanceRegionalEcologyRoot(durableRoot, agedTick),
      SEED,
      [HOME_REGION],
    )?.find(({ sourceKey }) => sourceKey === dormant.patchKey)?.patch;
    expect(actual).toEqual(expected);
  });

  it("rebases a neutral visit to pristine authority but retains physical movement and evidence", () => {
    const { root, home, wild } = fixture();
    const state = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [WILD_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: wild.patchKey,
        patch: wild,
      }],
    });
    const projection = projectRegionalEcologyActiveState(
      state,
      windowAt(WILD_REGION),
    );
    const projected = projection?.residents[0]?.patch;
    if (projection === null || projected === undefined) {
      throw new Error("Neutral visitation fixture failed to project");
    }
    const materialized = projected.populations.flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized");
    expect(materialized.length).toBeGreaterThan(0);
    const nextTick = TICK + 1;
    const neutral = stepCoreEcologyAggregatePatch(projected, {
      tick: nextTick,
      actorSteps: materialized.map(({ actor }) => ({
        actorId: actor.identity.stableId,
        observations: [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      })),
    });
    const homeStep = stepCoreEcologyAggregatePatch(home, {
      tick: nextTick,
      actorSteps: [],
    });
    if (neutral === null || homeStep === null) throw new Error("Neutral visitation step failed");
    expect(regionalEcologyResidentTransitionIsVisitationOnly(wild, neutral.patch)).toBe(true);
    const advancedRoot = advanceRegionalEcologyRoot(root, nextTick);
    const committed = commitRegionalEcologyActiveProjection(state, projection, {
      root: advancedRoot,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: homeStep.patch },
      residents: [{ sourceKey: neutral.patch.patchKey, patch: neutral.patch }],
    });
    if (committed === null) throw new Error("Neutral visitation commit failed");
    const stored = putRegionalEcologyResidentDeviation(advancedRoot, {
      rootSeed: SEED,
      patch: committed.activeResidents[0]!.patch,
    });
    expect(stored.regions).toEqual([]);
    const unloaded = replaceRegionalEcologyActiveState(committed, {
      expectedIntegrity: committed.integrity,
      root: stored,
      rootSeed: SEED,
      settlementHome: {
        sourceKey: homeStep.patch.patchKey,
        patch: homeStep.patch,
      },
      activeRegions: [HOME_REGION],
      activeResidents: [],
    });
    expect(unloaded.root.regions).toEqual([]);

    const actor = neutral.patch.populations.flatMap(({ members }) => members)[0]?.actor;
    if (actor === undefined) throw new Error("Movement fixture needs an actor");
    const movedActor = repositionCoreWildlifeActorWithMovementEvidence(actor, {
      atTick: nextTick,
      position: createWorldPosition(HOME_REGION, 24_000, 24_000),
      heading: actor.address.heading,
      strength: 500_000,
    });
    const moved = replaceCoreEcologyAggregatePatchActor(neutral.patch, movedActor);
    expect(regionalEcologyResidentTransitionIsVisitationOnly(wild, moved)).toBe(false);
    const movementRoot = putRegionalEcologyResidentDeviation(advancedRoot, {
      rootSeed: SEED,
      patch: moved,
    });
    expect(movementRoot.regions).toHaveLength(1);
    expect(movementRoot.regions[0]?.residentPatch?.populations.flatMap(({ members }) => members)
      .find(({ actor: candidate }) => candidate.identity.stableId === actor.identity.stableId)
      ?.actor.memories.some(({ environmentalEvidence }) => environmentalEvidence !== undefined))
      .toBe(true);
  });

  it("projects globally, commits all sources, and erases presentation-only materialization", () => {
    const { root, home } = fixture();
    const state = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [],
    });
    const projection = projectRegionalEcologyActiveState(state, windowAt());
    if (projection === null) throw new Error("Active projection was rejected");
    const materialized = projection.residents.flatMap(({ patch }) => patch.populations)
      .flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized");
    expect(materialized.length).toBeGreaterThan(0);

    const committed = commitRegionalEcologyActiveProjection(state, projection, {
      root,
      rootSeed: SEED,
      settlementHome: null,
      residents: projection.residents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
    });
    expect(committed?.integrity).toBe(state.integrity);
    expect(serializeRegionalEcologyState(committed)).toBe(serializeRegionalEcologyState(state));
    expect(committed?.settlementHome.patch.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);

    expect(commitRegionalEcologyActiveProjection(state, projection, {
      root,
      rootSeed: SEED,
      settlementHome: null,
      residents: [],
    })).toBeNull();
  });

  it("preserves authoritative actor changes while enforcing stale-write and lineage fences", () => {
    const { root, home } = fixture();
    const state = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [],
    });
    const projection = projectRegionalEcologyActiveState(state, windowAt());
    const projectedPatch = projection?.residents[0]?.patch;
    const actor = projectedPatch?.populations[0]?.members[0]?.actor;
    if (projection === null || projectedPatch === undefined || actor === undefined) {
      throw new Error("Actor-change fixture was not materialized");
    }
    const hunger = Math.min(1_000_000, actor.needs.hunger + 1);
    const changedActor = replaceCoreWildlifeActorPhysiology(actor, {
      atTick: TICK,
      needs: { ...actor.needs, hunger },
      condition: actor.condition,
    });
    const changedPatch = replaceCoreEcologyAggregatePatchActor(projectedPatch, changedActor);
    const committed = commitRegionalEcologyActiveProjection(state, projection, {
      root,
      rootSeed: SEED,
      settlementHome: null,
      residents: [{ sourceKey: changedPatch.patchKey, patch: changedPatch }],
    });
    const storedActor = committed?.settlementHome.patch.populations
      .flatMap(({ members }) => members)
      .find(({ actor: candidate }) => candidate.identity.stableId === actor.identity.stableId);
    expect(storedActor?.actor.needs.hunger).toBe(hunger);
    expect(storedActor?.materialization).toBe("coarse");

    const movedView = replaceRegionalEcologyActiveState(state, {
      expectedIntegrity: state.integrity,
      root,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [EMPTY_REGION],
      activeResidents: [],
    });
    expect(regionalEcologyActiveResidentPatches(movedView)).toEqual([]);
    expect(commitRegionalEcologyActiveProjection(movedView, projection, {
      root,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      residents: projection.residents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
    })).toBeNull();
    expect(() => replaceRegionalEcologyActiveState(state, {
      expectedIntegrity: "0000000000000000",
      root,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [],
    })).toThrow(/stale/u);
  });

  it("requires changed regional residents to survive unload through the sparse root", () => {
    const { root, home, wild } = fixture();
    const state = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, WILD_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: wild.patchKey,
        patch: wild,
      }],
    });
    const actor = wild.populations[0]?.members[0]?.actor;
    if (actor === undefined) throw new Error("Unload fixture needs one regional actor");
    const hunger = Math.min(1_000_000, actor.needs.hunger + 1);
    const changedActor = replaceCoreWildlifeActorPhysiology(actor, {
      atTick: TICK,
      needs: { ...actor.needs, hunger },
      condition: actor.condition,
    });
    const changed = replaceCoreEcologyAggregatePatchActor(wild, changedActor);

    expect(() => replaceRegionalEcologyActiveState(state, {
      expectedIntegrity: state.integrity,
      root,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [],
    })).not.toThrow();
    const changedState = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, WILD_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: changed.patchKey,
        patch: changed,
      }],
    });
    expect(() => replaceRegionalEcologyActiveState(changedState, {
      expectedIntegrity: changedState.integrity,
      root,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [],
    })).toThrow(/persist before unload/u);

    const persistedRoot = putRegionalEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: changed,
    });
    const persistedState = createRegionalEcologyState({
      root: persistedRoot,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, WILD_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: changed.patchKey,
        patch: changed,
      }],
    });
    const unloaded = replaceRegionalEcologyActiveState(persistedState, {
      expectedIntegrity: persistedState.integrity,
      root: persistedRoot,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [],
    });
    const restored = regionalEcologyResidentDeviation(persistedRoot, SEED, WILD_REGION);
    if (restored === null) throw new Error("Persisted regional deviation was lost");
    const revisited = replaceRegionalEcologyActiveState(unloaded, {
      expectedIntegrity: unloaded.integrity,
      root: persistedRoot,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, WILD_REGION],
      activeResidents: [{
        kind: "regional-habitat",
        sourceKey: restored.patchKey,
        patch: restored,
      }],
    });
    const revisitedActor = revisited.activeResidents[0]?.patch.populations
      .flatMap(({ members }) => members)
      .find(({ actor: candidate }) => candidate.identity.stableId === actor.identity.stableId);
    expect(revisitedActor?.actor.needs.hunger).toBe(hunger);
  });

  it("unloads an unchanged adopted baseline without persisting it or churning the root", () => {
    const source = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "alpha32:state-adopted-baseline-source",
      originRegion: LEGACY_ORIGIN,
      tick: TICK,
      derivation: { kind: "bounded-input-v1" },
      populations: [{
        species: "marsh-rabbit",
        populationKey: "alpha32/state-adopted-baseline-rabbit",
        members: [{
          populationOrdinal: 0,
          position: createWorldPosition(LEGACY_ORIGIN, 20_000, 20_000),
          materialization: "coarse",
        }],
      }],
    });
    const root = adoptRegionalEcologyFromV24({
      rootSeed: SEED,
      completedTick: TICK,
      sourceEnvelopeIntegrity: hashCanonical("alpha32 state adopted baseline envelope"),
      legacyPatch: source,
    });
    const delta = root.regions.find((candidate) => (
      candidate.legacyPlacements.length > 0
    ));
    if (delta === undefined) throw new Error("Adopted baseline fixture lacks a placement delta");
    const regional = createCoreEcologyRegionalResidentPatchForRoot({
      seed: SEED,
      root,
      region: delta.region,
    });
    const legacy = projectRegionalEcologyLegacyCohort({ rootSeed: SEED, root });
    if (regional === null || legacy === null) {
      throw new Error("Adopted baseline fixture lacks a live projection");
    }
    const home = homeAt(HOME_REGION);
    const state = createRegionalEcologyState({
      root,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION, delta.region],
      activeResidents: [
        { kind: "regional-habitat", sourceKey: regional.patchKey, patch: regional },
        { kind: "legacy-cohort", sourceKey: legacy.patchKey, patch: legacy },
      ],
    });
    const unloaded = replaceRegionalEcologyActiveState(state, {
      expectedIntegrity: state.integrity,
      root,
      rootSeed: SEED,
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [HOME_REGION],
      activeResidents: [{
        kind: "legacy-cohort",
        sourceKey: legacy.patchKey,
        patch: legacy,
      }],
    });
    expect(unloaded.root).toEqual(root);
    expect(unloaded.root.revision).toBe(root.revision);
    expect(unloaded.root.lastEventOrdinal).toBe(root.lastEventOrdinal);
    expect(unloaded.root.regions.find(({ key }) => key === delta.key)?.residentPatch).toBeNull();
  });
});
