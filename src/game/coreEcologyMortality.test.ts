import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  applyCoreEcologyWildlifeMortality,
  canonicalizeCoreEcologyAggregatePatch,
  coreEcologyAggregatePatchActor,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
  type CoreEcologyMarshEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  coreEcologySpeciesPhysicalBodyResourceUnits,
  coreEcologySpeciesPhysicalBodySizeUnits,
  coreEcologySpeciesPredatorContact,
} from "./coreEcologySpeciesRuntimePolicy";
import { createCoreEcologyMortalityTransaction } from "./coreEcologyMortality";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import { createCoreWildlifeCarcass } from "./coreWildlifeCarcass";
import {
  canonicalizeCoreWildlifeMortalityEvent,
  resolveCoreWildlifePredatorContact,
  type CoreWildlifeMortalityResult,
} from "./coreWildlifeMortality";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

const SEED = seedFromText("alpha29 representative one-body retirement");
const ORIGIN = createRegionCoord(0, 0);
const CONTACT_X = 48_000;
const CONTACT_Y = 34_000;
const TEMPERATURE = 500_000;

function focus() {
  return createWorldPosition(
    ORIGIN,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function individualInputs(
  habitat: CoreEcologyMarshEdgeHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => {
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
  });
}

function marshPatch(): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyMarshEdgeHabitatAssemblage({
    rootSeed: SEED,
    originRegion: ORIGIN,
    focus: { position: focus(), radiusTiles: 32 },
  });
  const rabbit = habitat.populations.find(({ species }) => species === "marsh-rabbit");
  const fox = habitat.populations.find(({ species }) => species === "marsh-fox");
  if (
    rabbit === undefined
    || fox === undefined
    || rabbit.allocations[0] === undefined
    || fox.allocations[0] === undefined
    || rabbit.allocations[0].representedUnits <= 1
  ) throw new Error("Representative marsh fixture requires fox and multi-unit rabbit bodies");
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha29:mortality-witness",
    originRegion: ORIGIN,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v3", habitat },
  });
}

function actor(
  patch: CoreEcologyAggregatePatchState,
  species: "marsh-fox" | "marsh-rabbit",
): CoreWildlifeActorState {
  const value = patch.populations.find((population) => population.species === species)
    ?.members[0]?.actor;
  if (value === undefined) throw new Error(`Missing ${species} fixture actor`);
  return value;
}

function stageContact(
  initial: CoreEcologyAggregatePatchState,
  tick: number,
  positions: Readonly<{
    fox: CoreWildlifeActorState["address"]["position"];
    rabbit: CoreWildlifeActorState["address"]["position"];
  }> = {
    fox: createWorldPosition(ORIGIN, CONTACT_X, CONTACT_Y),
    rabbit: createWorldPosition(ORIGIN, CONTACT_X + 400, CONTACT_Y),
  },
): Readonly<{
  patch: CoreEcologyAggregatePatchState;
  result: CoreWildlifeMortalityResult;
}> {
  const initialFox = actor(initial, "marsh-fox");
  const initialRabbit = actor(initial, "marsh-rabbit");
  const fedFox = replaceCoreWildlifeActorPhysiology(initialFox, {
    atTick: initialFox.updatedAtTick,
    needs: { ...initialFox.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: initialFox.condition,
  });
  const positionedFox = repositionCoreWildlifeActor(fedFox, {
    atTick: initialFox.updatedAtTick,
    position: positions.fox,
    heading: 0,
  });
  const positionedRabbit = repositionCoreWildlifeActor(initialRabbit, {
    atTick: tick,
    position: positions.rabbit,
    heading: 500_000,
  });
  const observation = createActorObservation({
    id: `obs:alpha29-contact:${tick}`,
    observerId: positionedFox.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: positionedRabbit.identity.stableId,
    area: { center: positions.rabbit, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 900_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Contact observation fixture was rejected");
  const pursuit = stepCoreWildlifeActor(positionedFox, {
    tick,
    observations: [observation],
    foodOpportunities: [{
      resourceId: positionedRabbit.identity.stableId,
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
  if (pursuit === null || pursuit.decision.intent !== "pursue") {
    throw new Error("Representative fox did not choose its observed rabbit");
  }
  let patch = replaceCoreEcologyAggregatePatchActor(initial, positionedRabbit);
  patch = replaceCoreEcologyAggregatePatchActor(patch, pursuit.actor);
  const policy = coreEcologySpeciesPredatorContact("marsh-fox");
  if (policy === null) throw new Error("Marsh fox contact policy is missing");
  const result = resolveCoreWildlifePredatorContact({
    attacker: pursuit.actor,
    target: positionedRabbit,
    atTick: tick,
    contactRadiusUnits: policy.reachUnits,
    damageUnits: policy.damageUnits,
    cause: policy.cause,
  });
  if (result === null) throw new Error("Canonical predator contact was rejected");
  return Object.freeze({ patch, result });
}

function committedDeath() {
  const initial = marshPatch();
  const rabbitBefore = initial.populations.find(({ species }) => species === "marsh-rabbit");
  if (rabbitBefore === undefined) throw new Error("Missing rabbit population");
  const first = stageContact(initial, 1);
  const injury = applyCoreEcologyWildlifeMortality(first.patch, {
    result: first.result,
    temperature: TEMPERATURE,
  });
  if (injury === null) throw new Error("Representative injury was rejected");
  const second = stageContact(injury.patch, 2);
  const death = applyCoreEcologyWildlifeMortality(second.patch, {
    result: second.result,
    temperature: TEMPERATURE,
  });
  if (death?.transaction === null || death?.carcass === null || death === null) {
    throw new Error("Representative death was not committed");
  }
  return { initial, rabbitBefore, first, injury, second, death } as const;
}

describe("core ecology mortality ownership", () => {
  it("injures, then retires one exact multi-unit rabbit body without erasing survivors", () => {
    const { rabbitBefore, first, injury, second, death } = committedDeath();
    const policy = coreEcologySpeciesPredatorContact("marsh-fox");
    expect(policy).toMatchObject({ damageUnits: 550_000, reachUnits: 500 });
    expect(first.result.event).toMatchObject({
      healthBefore: ACTOR_PERCEPTION_SCALE,
      healthAfter: 450_000,
      outcome: "injured",
    });
    expect(injury.transaction).toBeNull();
    expect(injury.carcass).toBeNull();
    expect(coreEcologyAggregatePatchActor(
      injury.patch,
      first.result.target.identity.stableId,
    )?.condition.health).toBe(450_000);

    const retiredMember = rabbitBefore.members.find(({ actor: current }) => (
      current.identity.stableId === second.result.target.identity.stableId
    ));
    const rabbitAfter = death.patch.populations.find(({ species }) => species === "marsh-rabbit");
    if (retiredMember === undefined || rabbitAfter === undefined) {
      throw new Error("Rabbit conservation fixture was lost");
    }
    expect(retiredMember.representedUnits).toBeGreaterThan(1);
    expect(second.result.event).toMatchObject({
      healthBefore: 450_000,
      healthAfter: 0,
      outcome: "death",
    });
    expect(coreEcologyAggregatePatchActor(
      death.patch,
      second.result.target.identity.stableId,
    )).toBeNull();
    expect(rabbitAfter).toMatchObject({
      baselinePopulationSize: rabbitBefore.baselinePopulationSize,
      populationSize: rabbitBefore.populationSize - 1,
      reserveUnits: rabbitBefore.reserveUnits + retiredMember.representedUnits - 1,
    });
    expect(rabbitAfter.reserveUnits + rabbitAfter.members.reduce(
      (total, member) => total + member.representedUnits,
      0,
    )).toBe(rabbitAfter.populationSize);
    expect(death.patch.nextMortalityOrdinal).toBe(1);
    expect(death.patch.mortalityTransactions).toHaveLength(1);
    expect(death.patch.carcasses).toHaveLength(1);
    expect(death.transaction).toMatchObject({
      mortalityOrdinal: 0,
      representedUnitsBefore: retiredMember.representedUnits,
      removedPopulationUnits: 1,
    });
    expect(death.carcass).toMatchObject({
      sourceActorId: second.result.target.identity.stableId,
      sourceMortalityEventId: second.result.event.eventId,
      bodySizeUnits: coreEcologySpeciesPhysicalBodySizeUnits("marsh-rabbit"),
      originalResourceUnits: coreEcologySpeciesPhysicalBodyResourceUnits("marsh-rabbit"),
      remainingResourceUnits: 4,
    });
  });

  it("rejects a contact whose attacker is only a coarse population representative", () => {
    const staged = stageContact(marshPatch(), 1);
    const coarseAttackerPatch = canonicalizeCoreEcologyAggregatePatch({
      ...staged.patch,
      populations: staged.patch.populations.map((population) => ({
        ...population,
        members: population.members.map((member) => (
          member.actor.identity.stableId === staged.result.event.attackerId
            ? { ...member, materialization: "coarse" }
            : member
        )),
      })),
    });
    if (coarseAttackerPatch === null) {
      throw new Error("Coarse-attacker fixture could not be canonicalized");
    }

    expect(applyCoreEcologyWildlifeMortality(coarseAttackerPatch, {
      result: staged.result,
      temperature: TEMPERATURE,
    })).toBeNull();
  });

  it("rejects a same-tick attack ordered after the attacker's own death", () => {
    const { death } = committedDeath();
    if (death.transaction === null) {
      throw new Error("Same-tick ordering fixture lost its first retirement");
    }
    const retiredRabbit = death.transaction.retiredActor;
    const foxPopulation = death.patch.populations.find(
      ({ species }) => species === "marsh-fox",
    );
    const foxMember = foxPopulation?.members[0];
    if (foxPopulation === undefined || foxMember === undefined) {
      throw new Error("Same-tick ordering fixture lost its fox");
    }
    const fox = foxMember.actor;
    const contactDelta = worldPositionDelta(
      retiredRabbit.address.position,
      fox.address.position,
    );
    const eventBody = Object.freeze({
      version: 1 as const,
      atTick: death.patch.updatedAtTick,
      cause: "predator-contact" as const,
      causeReferenceId: "obs:alpha29:post-mortem",
      observationId: "obs:alpha29:post-mortem",
      attackerId: retiredRabbit.identity.stableId,
      victimId: fox.identity.stableId,
      attackerPosition: retiredRabbit.address.position,
      victimPosition: fox.address.position,
      contactRadiusUnits: 500,
      contactDistanceSquaredUnits: contactDelta.x * contactDelta.x
        + contactDelta.y * contactDelta.y,
      damageUnits: fox.condition.health,
      healthBefore: fox.condition.health,
      healthAfter: 0,
      outcome: "death" as const,
    });
    const impossibleEvent = canonicalizeCoreWildlifeMortalityEvent({
      ...eventBody,
      eventId: `wildlife-harm:${hashCanonical(eventBody)}`,
    });
    const terminalFox = replaceCoreWildlifeActorPhysiology(fox, {
      atTick: death.patch.updatedAtTick,
      needs: fox.needs,
      condition: { ...fox.condition, health: 0 },
    });
    if (impossibleEvent === null) {
      throw new Error("Same-tick ordering event fixture was not canonical");
    }
    const body = createCoreWildlifeCarcass({
      mortalityEvent: impossibleEvent,
      sourceSpecies: fox.identity.species,
      bodySizeUnits: 5,
      resourceUnits: 6,
      temperature: TEMPERATURE,
    });
    if (body === null) throw new Error("Same-tick ordering body fixture was rejected");
    const transaction = createCoreEcologyMortalityTransaction({
      mortalityOrdinal: 1,
      event: impossibleEvent,
      retiredActor: terminalFox,
      representedUnitsBefore: foxMember.representedUnits,
      carcassId: body.carcassId,
    });

    expect(canonicalizeCoreEcologyAggregatePatch({
      ...death.patch,
      populations: death.patch.populations.map((population) => (
        population !== foxPopulation
          ? population
          : {
              ...population,
              populationSize: population.populationSize - 1,
              reserveUnits: population.reserveUnits + foxMember.representedUnits - 1,
              members: population.members.filter(({ actor: candidate }) => (
                candidate.identity.stableId !== fox.identity.stableId
              )),
            }
      )),
      nextMortalityOrdinal: 2,
      mortalityTransactions: [...death.patch.mortalityTransactions, transaction],
      carcasses: [...death.patch.carcasses, body],
    })).toBeNull();
  });

  it("replays idempotently and round-trips without resurrecting or duplicating the body", () => {
    const { second, death } = committedDeath();
    const replay = applyCoreEcologyWildlifeMortality(death.patch, {
      result: second.result,
      temperature: TEMPERATURE,
    });
    expect(replay?.patch).toBe(death.patch);
    expect(replay?.transaction).toBe(death.transaction);
    expect(replay?.carcass).toBe(death.carcass);

    const reloaded = deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(death.patch),
    );
    expect(reloaded).not.toBeNull();
    expect(coreEcologyAggregatePatchActor(
      reloaded,
      second.result.target.identity.stableId,
    )).toBeNull();
    expect(reloaded?.mortalityTransactions).toHaveLength(1);
    expect(reloaded?.carcasses).toHaveLength(1);
    const replayAfterReload = applyCoreEcologyWildlifeMortality(reloaded, {
      result: second.result,
      temperature: TEMPERATURE,
    });
    expect(replayAfterReload?.patch).toEqual(reloaded);
    expect(replayAfterReload?.patch.mortalityTransactions).toHaveLength(1);
    expect(replayAfterReload?.patch.carcasses).toHaveLength(1);
  });

  it("retains a body when exact contact crosses a signed region seam", () => {
    const acrossSeam = {
      fox: createWorldPosition(ORIGIN, REGION_WIDTH_UNITS - 200, CONTACT_Y),
      rabbit: createWorldPosition(createRegionCoord(1, 0), 100, CONTACT_Y),
    } as const;
    const first = stageContact(marshPatch(), 1, acrossSeam);
    const injury = applyCoreEcologyWildlifeMortality(first.patch, {
      result: first.result,
      temperature: TEMPERATURE,
    });
    if (injury === null) throw new Error("Cross-region injury was rejected");
    const second = stageContact(injury.patch, 2, acrossSeam);
    const death = applyCoreEcologyWildlifeMortality(second.patch, {
      result: second.result,
      temperature: TEMPERATURE,
    });

    expect(death?.carcass?.deathPosition).toEqual(acrossSeam.rabbit);
    expect(death?.patch.originRegion).toEqual(ORIGIN);
    const reloaded = death === null
      ? null
      : deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(death.patch));
    expect(reloaded?.carcasses[0]?.deathPosition).toEqual(acrossSeam.rabbit);
  });

  it("treats committed contact and body tuning as durable history", () => {
    const first = stageContact(marshPatch(), 1);
    const injury = applyCoreEcologyWildlifeMortality(first.patch, {
      result: first.result,
      temperature: TEMPERATURE,
    });
    if (injury === null) throw new Error("Historical-tuning fixture lost its injury");
    const staged = stageContact(injury.patch, 2);
    const fox = actor(staged.patch, "marsh-fox");
    const rabbit = actor(staged.patch, "marsh-rabbit");
    const historical = resolveCoreWildlifePredatorContact({
      attacker: fox,
      target: rabbit,
      atTick: 2,
      contactRadiusUnits: 450,
      damageUnits: 500_000,
      cause: "predator-contact",
    });
    if (historical === null || historical.event.outcome !== "death") {
      throw new Error("Historical-tuning contact was not lethal");
    }
    const population = staged.patch.populations.find(
      ({ species }) => species === "marsh-rabbit",
    );
    const member = population?.members.find(({ actor: candidate }) => (
      candidate.identity.stableId === rabbit.identity.stableId
    ));
    if (population === undefined || member === undefined) {
      throw new Error("Historical-tuning fixture lost its population member");
    }
    const body = createCoreWildlifeCarcass({
      mortalityEvent: historical.event,
      sourceSpecies: "marsh-rabbit",
      bodySizeUnits: 5,
      resourceUnits: 6,
      temperature: TEMPERATURE,
    });
    if (body === null) throw new Error("Historical-tuning body was rejected");
    const transaction = createCoreEcologyMortalityTransaction({
      mortalityOrdinal: 0,
      event: historical.event,
      retiredActor: historical.target,
      representedUnitsBefore: member.representedUnits,
      carcassId: body.carcassId,
    });
    const candidate = canonicalizeCoreEcologyAggregatePatch({
      ...staged.patch,
      populations: staged.patch.populations.map((candidatePopulation) => (
        candidatePopulation !== population
          ? candidatePopulation
          : {
              ...candidatePopulation,
              populationSize: candidatePopulation.populationSize - 1,
              reserveUnits: candidatePopulation.reserveUnits + member.representedUnits - 1,
              members: candidatePopulation.members.filter(({ actor: candidateActor }) => (
                candidateActor.identity.stableId !== rabbit.identity.stableId
              )),
            }
      )),
      nextMortalityOrdinal: 1,
      mortalityTransactions: [transaction],
      carcasses: [body],
    });

    expect(candidate?.mortalityTransactions[0]?.event).toMatchObject({
      contactRadiusUnits: 450,
      damageUnits: 500_000,
    });
    expect(candidate?.carcasses[0]).toMatchObject({
      bodySizeUnits: 5,
      originalResourceUnits: 6,
    });
    expect(deserializeCoreEcologyAggregatePatch(
      serializeCoreEcologyAggregatePatch(candidate),
    )).toEqual(candidate);
  });

  it("fails closed when population accounting or death-to-carcass provenance is altered", () => {
    const { second, death } = committedDeath();
    expect(canonicalizeCoreEcologyAggregatePatch({
      ...death.patch,
      populations: death.patch.populations.map((population) => (
        population.species === "marsh-rabbit"
          ? { ...population, reserveUnits: population.reserveUnits + 1 }
          : population
      )),
    })).toBeNull();
    expect(canonicalizeCoreEcologyAggregatePatch({
      ...death.patch,
      carcasses: death.patch.carcasses.map((carcass) => ({
        ...carcass,
        sourceActorId: second.result.event.attackerId,
      })),
    })).toBeNull();
    expect(canonicalizeCoreEcologyAggregatePatch({
      ...death.patch,
      mortalityTransactions: [],
    })).toBeNull();
  });
});
