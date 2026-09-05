import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  createActorObservation,
  type ActorObservation,
  type ActorObservationChannel,
} from "../sim/actorPerception";
import type {
  CoreWildlifeFoodClass,
  CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  CORE_WILDLIFE_ACTOR_VERSION,
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  deserializeCoreWildlifeActorState,
  repositionCoreWildlifeActor,
  replaceCoreWildlifeActorPhysiology,
  serializeCoreWildlifeActorState,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeFoodOpportunity,
} from "./coreWildlifeActor";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

function actor(species: CoreWildlifeSpecies = "deer"): CoreWildlifeActorState {
  const created = createCoreWildlifeActorState({
    seed: seedFromText("pure core wildlife actor fixture"),
    species,
    originRegion: createRegionCoord(-8, 12),
    populationKey: `${species}:marsh-edge`,
    populationOrdinal: 2,
    position: createWorldPosition(createRegionCoord(-8, 12), 24_000, 18_000),
    heading: 125_000,
  });
  return replaceCoreWildlifeActorPhysiology(created, {
    atTick: 0,
    needs: { hunger: 0, safety: 0, rest: 0 },
    condition: { health: ACTOR_PERCEPTION_SCALE, exhaustion: 0, stress: 0 },
  });
}

function observation(
  state: CoreWildlifeActorState,
  tick: number,
  spec: Readonly<{
    id: string;
    perceivedClass: string;
    subjectId?: string;
    channel?: ActorObservationChannel;
    confidence?: number;
    salience?: number;
  }>,
): ActorObservation {
  const channel = spec.channel ?? "vision";
  const value = createActorObservation({
    id: spec.id,
    observerId: state.identity.stableId,
    observedAtTick: tick,
    channel,
    perceivedClass: spec.perceivedClass,
    subjectId: channel === "vision" ? (spec.subjectId ?? `SUBJECT-${spec.id}`) : null,
    area: {
      center: state.address.position,
      radiusUnits: channel === "hearing" ? MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS : 0,
    },
    confidence: spec.confidence ?? ACTOR_PERCEPTION_SCALE,
    salience: spec.salience ?? ACTOR_PERCEPTION_SCALE,
    identification: channel === "vision" ? "identified" : "anonymous",
  });
  if (value === null) throw new Error(`Invalid observation fixture ${spec.id}`);
  return value;
}

function food(
  observationId: string,
  resourceId: string,
  foodClass: CoreWildlifeFoodClass,
  overrides: Partial<CoreWildlifeFoodOpportunity> = {},
): CoreWildlifeFoodOpportunity {
  return {
    resourceId,
    observationId,
    foodClass,
    sourceKind: foodClass === "live-prey" ? "living-actor" : "physical-item",
    availableUnits: 4,
    nutrition: 800_000,
    effort: 100_000,
    risk: 50_000,
    competition: 0,
    directlyConfirmed: true,
    accessible: true,
    ...overrides,
  };
}

function hungry(state: CoreWildlifeActorState, hunger = 900_000): CoreWildlifeActorState {
  return replaceCoreWildlifeActorPhysiology(state, {
    atTick: state.updatedAtTick,
    needs: { ...state.needs, hunger },
    condition: state.condition,
  });
}

function step(
  state: CoreWildlifeActorState,
  tick: number,
  observations: readonly ActorObservation[] = [],
  foodOpportunities: readonly CoreWildlifeFoodOpportunity[] = [],
) {
  const result = stepCoreWildlifeActor(state, {
    tick,
    observations,
    foodOpportunities,
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (result === null) throw new Error("Valid core wildlife step was rejected");
  return result;
}

describe("core Wave-A wildlife actor", () => {
  it("creates immutable actor records with identity separate from dynamic state", () => {
    for (const species of ["deer", "gull", "black-bear"] as const) {
      const state = actor(species);
      expect(state.version).toBe(CORE_WILDLIFE_ACTOR_VERSION);
      expect(state.address.species).toBe(species);
      expect(state.address.actorId).toBe(state.identity.stableId);
      expect(state.perception.actorId).toBe(state.identity.stableId);
      expect(state.needs).not.toBe(state.identity);
      expect(state.condition).not.toBe(state.identity);
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state.identity)).toBe(true);
      expect(Object.isFrozen(state.needs)).toBe(true);
    }
  });

  it("roundtrips canonical saves and rejects mutation or noncanonical text", () => {
    const state = actor("black-bear");
    const encoded = serializeCoreWildlifeActorState(state);
    expect(deserializeCoreWildlifeActorState(encoded)).toEqual(state);
    expect(serializeCoreWildlifeActorState(deserializeCoreWildlifeActorState(encoded)))
      .toBe(encoded);
    expect(deserializeCoreWildlifeActorState(` ${encoded}`)).toBeNull();
    expect(canonicalizeCoreWildlifeActorState({ ...state, debug: true })).toBeNull();
    expect(canonicalizeCoreWildlifeActorState({
      ...state,
      address: { ...state.address, actorId: "BEAR-alias" },
    })).toBeNull();
    expect(canonicalizeCoreWildlifeActorState({
      ...state,
      needs: { ...state.needs, hunger: -1 },
    })).toBeNull();
  });

  it("applies same-tick locomotion after cognition without changing actor internals", () => {
    const observed = step(actor("deer"), 1).actor;
    const target = translateWorldPosition(observed.address.position, 750, -500);
    const moved = repositionCoreWildlifeActor(observed, {
      atTick: observed.updatedAtTick,
      position: target,
      heading: 875_000,
    });

    expect(moved.updatedAtTick).toBe(observed.updatedAtTick);
    expect(moved.address).toMatchObject({ position: target, heading: 875_000 });
    expect(moved.identity).toEqual(observed.identity);
    expect(moved.perception).toEqual(observed.perception);
    expect(moved.needs).toEqual(observed.needs);
    expect(moved.condition).toEqual(observed.condition);
    expect(moved.intent).toEqual(observed.intent);
    expect(moved.memories).toEqual(observed.memories);
    expect(moved.identity.stableId).toBe(observed.identity.stableId);
  });

  it("accepts caller-normalized movement across signed region seams", () => {
    const originRegion = createRegionCoord(-1, -1);
    const state = createCoreWildlifeActorState({
      seed: seedFromText("wildlife signed seam locomotion"),
      species: "black-bear",
      originRegion,
      populationKey: "black-bear:signed-seam",
      populationOrdinal: 0,
      position: createWorldPosition(
        originRegion,
        REGION_WIDTH_UNITS - 25,
        20,
      ),
    });
    const normalized = translateWorldPosition(state.address.position, 50, -40);
    expect(normalized.region).toEqual({ x: 0, y: -2 });
    expect(normalized.localX).toBe(25);
    expect(normalized.localY).toBe(REGION_HEIGHT_UNITS - 20);

    const moved = repositionCoreWildlifeActor(state, {
      atTick: 1,
      position: normalized,
      heading: 250_000,
    });
    expect(moved.address.position).toEqual(normalized);
    expect(moved.identity).toEqual(state.identity);
    expect(moved.identity.originRegion).toEqual(originRegion);
  });

  it("rejects stale, malformed, unnormalized, and invalid-heading movement", () => {
    const current = step(actor("gull"), 2).actor;
    const validMove = {
      atTick: 2,
      position: current.address.position,
      heading: 0,
    };
    expect(() => repositionCoreWildlifeActor(current, { ...validMove, atTick: 1 }))
      .toThrow(/ordered/u);
    expect(() => repositionCoreWildlifeActor(current, {
      ...validMove,
      position: {
        ...current.address.position,
        localX: REGION_WIDTH_UNITS,
      },
    })).toThrow(/ordered/u);
    expect(() => repositionCoreWildlifeActor(current, { ...validMove, heading: 1_000_000 }))
      .toThrow(/heading/u);
    expect(() => repositionCoreWildlifeActor(current, { ...validMove, heading: -0 }))
      .toThrow(/heading/u);
    expect(() => repositionCoreWildlifeActor(current, {
      ...validMove,
      debug: true,
    } as typeof validMove)).toThrow(/ordered/u);
  });

  it("keeps no-contact behavior neutral and permits real rest pressure", () => {
    const deer = actor("deer");
    const neutral = step(deer, 1);
    expect(neutral.decision.intent).toBe("observe");
    expect(neutral.decision.cause).toEqual({
      kind: "condition",
      referenceId: "condition:neutral-watch",
    });
    expect(neutral.resourceClaims).toEqual([]);

    const tired = replaceCoreWildlifeActorPhysiology(neutral.actor, {
      atTick: 1,
      needs: { ...neutral.actor.needs, rest: 800_000 },
      condition: neutral.actor.condition,
    });
    const resting = step(tired, 2);
    expect(resting.decision.intent).toBe("rest");
    expect(resting.actor.needs.rest).toBeLessThan(tired.needs.rest);
  });

  it("emits a causal alarm before fleeing from the same still-perceived threat", () => {
    const deer = actor("deer");
    const firstThreat = observation(deer, 1, {
      id: "obs:large-predator",
      perceivedClass: "large-predator",
      subjectId: "PREDATOR-1",
    });
    const alarmed = step(deer, 1, [firstThreat]);
    expect(alarmed.decision.intent).toBe("alarm");
    expect(alarmed.event).toMatchObject({
      actorId: deer.identity.stableId,
      species: "deer",
      kind: "alarm",
      causeReferenceId: "obs:large-predator",
    });
    expect(JSON.stringify(alarmed.event)).not.toContain("player");

    const secondThreat = observation(alarmed.actor, 2, {
      id: "obs:large-predator",
      perceivedClass: "large-predator",
      subjectId: "PREDATOR-1",
    });
    const fleeing = step(alarmed.actor, 2, [secondThreat]);
    expect(fleeing.decision.intent).toBe("flee");
    expect(fleeing.decision.focusObservationId).toBe("obs:large-predator");

    const warnedDeer = actor("deer");
    const heardAlarm = observation(warnedDeer, 1, {
      id: "obs:heard-alarm",
      perceivedClass: "alarm-call",
      channel: "hearing",
    });
    expect(step(warnedDeer, 1, [heardAlarm]).decision.intent).toBe("flee");
  });

  it("allows a bear to retreat from a perceived human without forcing an attack", () => {
    const bear = actor("black-bear");
    const porter = observation(bear, 1, {
      id: "obs:nearby-porter",
      perceivedClass: "porter",
      subjectId: "H-porter",
    });
    const result = step(bear, 1, [porter]);
    expect(result.decision.intent).toBe("retreat");
    expect(result.decision.cause).toEqual({
      kind: "perception",
      referenceId: porter.id,
    });
    expect(result.resourceClaims).toEqual([]);
  });

  it("uses profile roles for forage and scavenging and returns reference-only claims", () => {
    const cases = [
      { species: "deer", foodClass: "browse", intent: "forage" },
      { species: "gull", foodClass: "exposed-food", intent: "scavenge" },
      { species: "black-bear", foodClass: "carrion", intent: "scavenge" },
    ] as const;
    for (const fixture of cases) {
      const state = hungry(actor(fixture.species));
      const seen = observation(state, 1, {
        id: `obs:${fixture.species}:food`,
        perceivedClass: fixture.foodClass,
        subjectId: `ITEM-${fixture.species}`,
      });
      const opportunity = food(
        seen.id,
        `ITEM-${fixture.species}`,
        fixture.foodClass,
        { sourceKind: fixture.foodClass === "browse" ? "natural-forage" : "physical-item" },
      );
      const before = structuredClone(opportunity);
      const result = step(state, 1, [seen], [opportunity]);
      expect(result.decision.intent).toBe(fixture.intent);
      expect(result.resourceClaims).toEqual([{
        eventId: result.event.eventId,
        actorId: state.identity.stableId,
        resourceId: opportunity.resourceId,
        foodClass: opportunity.foodClass,
        observedAvailableUnits: 4,
        requestedUnits: 1,
      }]);
      expect(opportunity).toEqual(before);
      expect(result.actor.needs.hunger).toBeGreaterThan(state.needs.hunger);
    }
  });

  it("lets an omnivore choose easier physical food over live prey", () => {
    const bear = hungry(actor("black-bear"), ACTOR_PERCEPTION_SCALE);
    const preySeen = observation(bear, 1, {
      id: "obs:prey",
      perceivedClass: "prey",
      subjectId: "DEER-prey",
    });
    const packSeen = observation(bear, 1, {
      id: "obs:pack",
      perceivedClass: "exposed-food",
      subjectId: "PACK-fish",
    });
    const prey = food(preySeen.id, "DEER-prey", "live-prey", {
      effort: 930_000,
      risk: 350_000,
      nutrition: ACTOR_PERCEPTION_SCALE,
    });
    const pack = food(packSeen.id, "PACK-fish", "exposed-food", {
      effort: 20_000,
      risk: 10_000,
      nutrition: 700_000,
    });
    const result = step(bear, 1, [preySeen, packSeen], [prey, pack]);
    expect(result.decision.intent).toBe("scavenge");
    expect(result.decision.resourceReference?.resourceId).toBe("PACK-fish");
  });

  it("supports guarding but never converts observation snapshots into item mutation", () => {
    const bear = hungry(actor("black-bear"));
    const seen = observation(bear, 1, {
      id: "obs:guard-food",
      perceivedClass: "carrion",
      subjectId: "CARCASS-1",
    });
    const opportunity = food(seen.id, "CARCASS-1", "carrion", {
      availableUnits: 7,
      competition: 900_000,
    });
    const result = step(bear, 1, [seen], [opportunity]);
    expect(result.decision.intent).toBe("guard");
    expect(result.resourceClaims).toEqual([]);
    expect(result.decision.resourceReference).toMatchObject({
      resourceId: "CARCASS-1",
      observedAvailableUnits: 7,
    });
    expect(opportunity.availableUnits).toBe(7);
  });

  it("forces bounded pursuit to disengage and applies a deterministic cooldown", () => {
    const bear = hungry(actor("black-bear"), ACTOR_PERCEPTION_SCALE);
    const preyAtOne = observation(bear, 1, {
      id: "obs:bounded-prey",
      perceivedClass: "prey",
      subjectId: "DEER-bounded",
    });
    const prey = food(preyAtOne.id, "DEER-bounded", "live-prey", {
      effort: 250_000,
      risk: 100_000,
    });
    const pursuing = step(bear, 1, [preyAtOne], [prey]);
    expect(pursuing.decision.intent).toBe("pursue");
    expect(pursuing.decision.expiresAtTick).toBe(11);

    const preyAtLimit = observation(pursuing.actor, 11, {
      id: "obs:bounded-prey",
      perceivedClass: "prey",
      subjectId: "DEER-bounded",
    });
    const disengaged = step(pursuing.actor, 11, [preyAtLimit], [prey]);
    expect(disengaged.decision.intent).toBe("disengage");
    expect(disengaged.resourceClaims).toEqual([]);

    const preyDuringCooldown = observation(disengaged.actor, 12, {
      id: "obs:bounded-prey",
      perceivedClass: "prey",
      subjectId: "DEER-bounded",
    });
    const coolingDown = step(disengaged.actor, 12, [preyDuringCooldown], [prey]);
    expect(coolingDown.decision.intent).not.toBe("pursue");
  });

  it("canonicalizes input order and fails closed on unlawful contacts", () => {
    const gull = hungry(actor("gull"));
    const leftSeen = observation(gull, 1, {
      id: "obs:left",
      perceivedClass: "exposed-food",
      subjectId: "ITEM-left",
    });
    const rightSeen = observation(gull, 1, {
      id: "obs:right",
      perceivedClass: "exposed-food",
      subjectId: "ITEM-right",
    });
    const left = food(leftSeen.id, "ITEM-left", "exposed-food");
    const right = food(rightSeen.id, "ITEM-right", "exposed-food");
    const first = step(gull, 1, [rightSeen, leftSeen], [right, left]);
    const second = step(gull, 1, [leftSeen, rightSeen], [left, right]);
    expect(second).toEqual(first);
    expect(first.decision.resourceReference?.resourceId).toBe("ITEM-left");

    expect(stepCoreWildlifeActor(gull, {
      tick: 1,
      observations: [leftSeen],
      foodOpportunities: [food("obs:not-seen", "ITEM-hidden", "exposed-food")],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    })).toBeNull();
    expect(stepCoreWildlifeActor(gull, {
      tick: 1,
      observations: [{ ...leftSeen, observerId: "GULL-impostor" }],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    })).toBeNull();
  });
});
