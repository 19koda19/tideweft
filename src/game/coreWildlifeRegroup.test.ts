import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  createCoreWildlifeActorState,
  replaceCoreWildlifeActorPhysiology,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import { createWorldPosition, translateWorldPosition } from "./worldPosition";

function goat(ordinal: number): CoreWildlifeActorState {
  const region = createRegionCoord(-31, 7);
  return replaceCoreWildlifeActorPhysiology(createCoreWildlifeActorState({
    seed: seedFromText("shared regroup abstraction"),
    species: "domestic-goat",
    originRegion: region,
    populationKey: "domestic-goat:recovery-fixture",
    populationOrdinal: ordinal,
    position: createWorldPosition(region, 20_000 + ordinal * 8_000, 18_000),
    tick: 0,
  }), {
    atTick: 0,
    needs: { hunger: 0, safety: 0, rest: 0 },
    condition: { health: ACTOR_PERCEPTION_SCALE, exhaustion: 0, stress: 0 },
  });
}

function sees(
  observer: CoreWildlifeActorState,
  subject: CoreWildlifeActorState,
  tick: number,
  perceivedClass = subject.identity.species,
): ActorObservation {
  const observation = createActorObservation({
    id: `obs:regroup:${observer.identity.populationOrdinal}:${subject.identity.populationOrdinal}:${tick}`,
    observerId: observer.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass,
    subjectId: subject.identity.stableId,
    area: { center: subject.address.position, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 700_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Invalid direct regroup observation fixture");
  return observation;
}

function regroupStep(
  actor: CoreWildlifeActorState,
  target: CoreWildlifeActorState,
  observation: ActorObservation,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return stepCoreWildlifeActor(actor, {
    tick: observation.observedAtTick,
    observations: [observation],
    foodOpportunities: [],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    regroupOpportunity: {
      groupId: "CEG-v1-recovery-fixture",
      observationId: observation.id,
      targetActorId: target.identity.stableId,
    },
    ...overrides,
  });
}

describe("shared actor-owned regroup intent", () => {
  it("lets a social actor choose a directly perceived group member without hidden coordinates", () => {
    const separated = goat(0);
    const herdMate = goat(1);
    const direct = sees(separated, herdMate, 1);
    const result = regroupStep(separated, herdMate, direct);

    expect(result?.decision).toMatchObject({
      intent: "regroup",
      cause: { kind: "perception", referenceId: direct.id },
      focusObservationId: direct.id,
      resourceReference: null,
    });
    expect(result?.actor.perception.beliefs[0]?.area.center).toEqual(herdMate.address.position);
  });

  it("fails closed when the offered target is not current identified same-species sight", () => {
    const separated = goat(0);
    const herdMate = goat(1);
    const wrongClass = sees(separated, herdMate, 1, "deer");
    expect(regroupStep(separated, herdMate, wrongClass)).toBeNull();

    const stale = sees(separated, herdMate, 1);
    expect(stepCoreWildlifeActor(separated, {
      tick: 2,
      observations: [],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      regroupOpportunity: {
        groupId: "CEG-v1-recovery-fixture",
        observationId: stale.id,
        targetActorId: herdMate.identity.stableId,
      },
    })).toBeNull();

    const inaccessible = regroupStep(separated, herdMate, stale, {
      accessibility: { ...CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE, regroup: false },
    });
    expect(inaccessible?.decision.intent).toBe("observe");
  });

  it("keeps danger and physiological recovery above social regrouping", () => {
    const separated = goat(0);
    const herdMate = goat(1);
    const direct = sees(separated, herdMate, 1);
    const predator = createActorObservation({
      id: "obs:regroup:black-bear:1",
      observerId: separated.identity.stableId,
      observedAtTick: 1,
      channel: "vision",
      perceivedClass: "large-predator",
      subjectId: "BEAR-regroup-threat",
      area: {
        center: translateWorldPosition(separated.address.position, 1_000, 0),
        radiusUnits: 0,
      },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "identified",
      interrupt: "strong",
    });
    if (predator === null) throw new Error("Invalid threat fixture");
    const threatened = regroupStep(separated, herdMate, direct, {
      observations: [direct, predator],
    });
    expect(threatened?.decision.intent).not.toBe("regroup");
    expect(threatened?.decision.cause.referenceId).toBe(predator.id);

    const exhausted = replaceCoreWildlifeActorPhysiology(separated, {
      atTick: 0,
      needs: { ...separated.needs, rest: 900_000 },
      condition: separated.condition,
    });
    expect(regroupStep(exhausted, herdMate, direct)?.decision.intent).toBe("rest");
  });
});
