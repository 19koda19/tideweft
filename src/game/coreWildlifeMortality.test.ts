import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  stepActorPerception,
  type ActorObservation,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  replaceCoreWildlifeActorPhysiology,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  CORE_WILDLIFE_MAX_CONTACT_DAMAGE_UNITS,
  CORE_WILDLIFE_MAX_CONTACT_RADIUS_UNITS,
  resolveCoreWildlifePredatorContact,
  type ResolveCoreWildlifePredatorContactInput,
} from "./coreWildlifeMortality";
import {
  LIVING_ACTOR_VISUAL_CONTACT_VERSION,
  collectLivingActorVisualContactObservations,
} from "./livingActorVisualContact";
import { createWorldPosition } from "./worldPosition";

const REGION = createRegionCoord(-48, 11);
const ATTACKER_X = 22_000;
const Y = 17_000;

interface PursuingPair {
  readonly attacker: CoreWildlifeActorState;
  readonly target: CoreWildlifeActorState;
  readonly observation: ActorObservation;
}

function wildlife(
  species: "marsh-fox" | "marsh-rabbit",
  x: number,
  tick: number,
  health: number = ACTOR_PERCEPTION_SCALE,
): CoreWildlifeActorState {
  const created = createCoreWildlifeActorState({
    seed: seedFromText("alpha29 shared mortality kernel"),
    species,
    originRegion: REGION,
    populationKey: `mortality-${species}`,
    populationOrdinal: 0,
    position: createWorldPosition(REGION, x, Y),
    tick,
  });
  return replaceCoreWildlifeActorPhysiology(created, {
    atTick: tick,
    needs: {
      ...created.needs,
      hunger: species === "marsh-fox" ? ACTOR_PERCEPTION_SCALE : 0,
    },
    condition: { ...created.condition, health },
  });
}

function directObservation(
  attacker: CoreWildlifeActorState,
  target: CoreWildlifeActorState,
  tick: number,
  id = `obs:mortality:${tick}`,
): ActorObservation {
  const observation = createActorObservation({
    id,
    observerId: attacker.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: target.identity.stableId,
    area: { center: target.address.position, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 900_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Invalid direct-contact observation fixture");
  return observation;
}

function pursue(
  attacker: CoreWildlifeActorState,
  target: CoreWildlifeActorState,
  tick: number,
): Readonly<{ attacker: CoreWildlifeActorState; observation: ActorObservation }> {
  const observation = directObservation(attacker, target, tick);
  const result = stepCoreWildlifeActor(attacker, {
    tick,
    observations: [observation],
    foodOpportunities: [{
      resourceId: target.identity.stableId,
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
  if (result?.decision.intent !== "pursue") {
    throw new Error("Representative predator failed to choose a pursuit");
  }
  return Object.freeze({ attacker: result.actor, observation });
}

function pair(
  distanceUnits = 300,
  targetHealth = 600_000,
): PursuingPair {
  const target = wildlife("marsh-rabbit", ATTACKER_X + distanceUnits, 1, targetHealth);
  const pursuit = pursue(wildlife("marsh-fox", ATTACKER_X, 0), target, 1);
  return Object.freeze({ ...pursuit, target });
}

function advanceNeutral(
  actor: CoreWildlifeActorState,
  tick: number,
): CoreWildlifeActorState {
  const result = stepCoreWildlifeActor(actor, {
    tick,
    observations: [],
    foodOpportunities: [],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (result === null) throw new Error("Could not advance neutral target fixture");
  return result.actor;
}

function request(
  current: Pick<PursuingPair, "attacker" | "target">,
  overrides: Readonly<Record<string, unknown>> = {},
): ResolveCoreWildlifePredatorContactInput {
  return {
    attacker: current.attacker,
    target: current.target,
    atTick: current.attacker.updatedAtTick,
    contactRadiusUnits: 400,
    damageUnits: 350_000,
    cause: "predator-contact",
    ...overrides,
  } as ResolveCoreWildlifePredatorContactInput;
}

describe("shared core-wildlife contact mortality", () => {
  it("applies a first physical contact as injury and a later lawful contact as death", () => {
    const initial = pair();
    const first = resolveCoreWildlifePredatorContact(request(initial));

    expect(first?.target.identity.stableId).toBe(initial.target.identity.stableId);
    expect(first?.target.condition).toEqual({
      ...initial.target.condition,
      health: 250_000,
    });
    expect(first?.target.needs).toEqual(initial.target.needs);
    expect(first?.event).toMatchObject({
      atTick: 1,
      cause: "predator-contact",
      causeReferenceId: initial.observation.id,
      observationId: initial.observation.id,
      attackerId: initial.attacker.identity.stableId,
      victimId: initial.target.identity.stableId,
      attackerPosition: initial.attacker.address.position,
      victimPosition: initial.target.address.position,
      contactRadiusUnits: 400,
      contactDistanceSquaredUnits: 90_000,
      damageUnits: 350_000,
      healthBefore: 600_000,
      healthAfter: 250_000,
      outcome: "injured",
    });

    if (first === null) throw new Error("First contact unexpectedly failed");
    const targetAtTwo = advanceNeutral(first.target, 2);
    const nextPursuit = pursue(initial.attacker, targetAtTwo, 2);
    const second = resolveCoreWildlifePredatorContact(request({
      attacker: nextPursuit.attacker,
      target: targetAtTwo,
    }));

    expect(second?.target.identity.stableId).toBe(initial.target.identity.stableId);
    expect(second?.target.condition.health).toBe(0);
    expect(second?.event).toMatchObject({
      atTick: 2,
      healthBefore: 250_000,
      healthAfter: 0,
      outcome: "death",
    });
    expect(resolveCoreWildlifePredatorContact(request({
      attacker: nextPursuit.attacker,
      target: second!.target,
    }))).toBeNull();
  });

  it("refuses stale, unidentified, distant, and blocked perception linkage", () => {
    const initial = pair();
    const targetAtTwo = advanceNeutral(initial.target, 2);

    const staleAttacker = replaceCoreWildlifeActorPhysiology(initial.attacker, {
      atTick: 2,
      needs: initial.attacker.needs,
      condition: initial.attacker.condition,
    });
    expect(resolveCoreWildlifePredatorContact(request({
      attacker: staleAttacker,
      target: targetAtTwo,
    }))).toBeNull();

    const classified = createActorObservation({
      id: "obs:mortality:classified:2",
      observerId: initial.attacker.identity.stableId,
      observedAtTick: 2,
      channel: "vision",
      perceivedClass: "live-prey",
      subjectId: null,
      area: { center: targetAtTwo.address.position, radiusUnits: 0 },
      confidence: 700_000,
      salience: 700_000,
      identification: "classified",
    });
    if (classified === null) throw new Error("Invalid classified fixture");
    const classifiedPerception = stepActorPerception(initial.attacker.perception, {
      tick: 2,
      observations: [classified],
    });
    if (classifiedPerception === null || initial.attacker.intent.resourceReference === null) {
      throw new Error("Could not construct classified canonical fixture");
    }
    const unidentifiedAttacker = canonicalizeCoreWildlifeActorState({
      ...initial.attacker,
      updatedAtTick: 2,
      perception: classifiedPerception,
      intent: {
        ...initial.attacker.intent,
        cause: { kind: "perception", referenceId: classified.id },
        focusObservationId: classified.id,
        resourceReference: {
          ...initial.attacker.intent.resourceReference,
          observationId: classified.id,
        },
      },
    });
    if (unidentifiedAttacker === null) throw new Error("Unidentified actor fixture is not canonical");
    expect(resolveCoreWildlifePredatorContact(request({
      attacker: unidentifiedAttacker,
      target: targetAtTwo,
    }))).toBeNull();

    const distant = pair(700);
    expect(resolveCoreWildlifePredatorContact(request(distant))).toBeNull();

    const blockedObservations = collectLivingActorVisualContactObservations({
      version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
      observer: initial.attacker.address,
      tick: 2,
      contacts: [{
        version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
        evidenceId: "blocked-contact",
        perceivedClass: "live-prey",
        subject: targetAtTwo.address,
        lineOfSight: "blocked",
        confidence: 0,
        salience: 0,
        identityEligible: false,
      }],
    });
    expect(blockedObservations).toEqual([]);
    const blockedPerception = stepActorPerception(initial.attacker.perception, {
      tick: 2,
      observations: blockedObservations ?? [],
    });
    const blockedAttacker = blockedPerception === null
      ? null
      : canonicalizeCoreWildlifeActorState({
          ...initial.attacker,
          updatedAtTick: 2,
          perception: blockedPerception,
        });
    if (blockedAttacker === null) throw new Error("Blocked actor fixture is not canonical");
    expect(resolveCoreWildlifePredatorContact(request({
      attacker: blockedAttacker,
      target: targetAtTwo,
    }))).toBeNull();
  });

  it("derives one deterministic immutable event from the same canonical contact", () => {
    const initial = pair();
    const first = resolveCoreWildlifePredatorContact(request(initial));
    const replay = resolveCoreWildlifePredatorContact(request(initial));

    expect(first).toEqual(replay);
    expect(first?.event.eventId).toBe(replay?.event.eventId);
    expect(first?.event.eventId).toMatch(/^wildlife-harm:[0-9a-f]{16}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.event)).toBe(true);
    expect(Object.isFrozen(first?.event.attackerPosition)).toBe(true);
    expect(Object.isFrozen(first?.event.attackerPosition.region)).toBe(true);
    expect(Object.isFrozen(first?.target)).toBe(true);
  });

  it("fails malformed, unbounded, mismatched, or nonliving requests closed", () => {
    const initial = pair();
    const valid = request(initial);
    expect(resolveCoreWildlifePredatorContact(null)).toBeNull();
    expect(resolveCoreWildlifePredatorContact({ ...valid, debug: true })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({ ...valid, atTick: -0 })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({ ...valid, atTick: 2 })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({ ...valid, cause: "random-damage" })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({ ...valid, contactRadiusUnits: 0 })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({
      ...valid,
      contactRadiusUnits: CORE_WILDLIFE_MAX_CONTACT_RADIUS_UNITS + 1,
    })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({ ...valid, damageUnits: 0 })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({
      ...valid,
      damageUnits: CORE_WILDLIFE_MAX_CONTACT_DAMAGE_UNITS + 1,
    })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({
      ...valid,
      target: { ...initial.target, debug: true },
    })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({
      ...valid,
      target: replaceCoreWildlifeActorPhysiology(initial.target, {
        atTick: 1,
        needs: initial.target.needs,
        condition: { ...initial.target.condition, health: 0 },
      }),
    })).toBeNull();
    expect(resolveCoreWildlifePredatorContact({
      ...valid,
      target: initial.attacker,
    })).toBeNull();
  });
});
