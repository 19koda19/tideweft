import { describe, expect, it } from "vitest";

import { createActorPerceptionState } from "../sim/actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import {
  DOG_ACTOR_MEMORY_CAP,
  DOG_ACTOR_PLAYER_KNOWLEDGE_CAP,
  applyDogBehaviorDecision,
  appendDogActorMemory,
  canonicalizeDogActorState,
  createDogActorState,
  deserializeDogActorState,
  learnDogPlayerKnowledge,
  promoteDogActor,
  repositionDogActor,
  replaceDogActorPerception,
  replaceDogActorPhysiology,
  serializeDogActorState,
  setDogActorIntent,
  type CreateDogActorInput,
  type DogActorMemory,
  type DogActorState,
  type DogPlayerKnowledgeFactKind,
} from "./dogActor";
import { DOG_BEHAVIOR_INTENTS, decideDogBehavior } from "./dogBehavior";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
} from "./worldPosition";

function fixtureInput(
  tick = 0,
  region = createRegionCoord(-73, 41),
): CreateDogActorInput {
  return {
    seed: seedFromText("BIO0 dog actor sidecar"),
    originRegion: region,
    originNamespace: "regional",
    habitatClass: "coastal-lowland",
    habitatKey: "east-channel/north-bank",
    populationKey: "rain-route/dogs-1",
    populationOrdinal: 9,
    position: createWorldPosition(region, 22_500, 31_750),
    heading: 875_000,
    tick,
  };
}

function memory(
  state: DogActorState,
  ordinal: number,
  salience = ordinal * 10_000,
): DogActorMemory {
  return {
    eventId: `dog-event-${ordinal}`,
    kind: ordinal % 2 === 0 ? "food" : "human-interaction",
    subjectId: ordinal % 2 === 0 ? "H:porter/17" : null,
    atTick: ordinal + 1,
    salience,
    location: state.address.position,
  };
}

describe("authoritative dog actor sidecar", () => {
  it("creates one deterministic regional dog at signed extreme coordinates", () => {
    const extreme = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const input: CreateDogActorInput = {
      ...fixtureInput(7, extreme),
      habitatKey: `h/${"x".repeat(45)}`,
      populationKey: `p/${"y".repeat(45)}`,
      position: createWorldPosition(
        extreme,
        REGION_WIDTH_UNITS - 1,
        REGION_HEIGHT_UNITS - 1,
      ),
    };
    const first = createDogActorState(input);
    const second = createDogActorState({
      ...input,
      seed: [...input.seed] as [number, number, number, number],
      position: createWorldPosition({ ...extreme }, input.position.localX, input.position.localY),
    });

    expect(second).toEqual(first);
    expect(first.address).toMatchObject({
      actorId: first.identity.stableId,
      species: "domestic-dog",
      persistence: "regional",
      position: { region: extreme },
    });
    expect(first.perception.actorId).toBe(first.identity.stableId);
    expect(first.identity.stableId).toContain("/");
    expect(first.memories).toEqual([]);
    expect(first.playerKnowledge.facts).toEqual([]);
    expect(first.promotion).toBeNull();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.condition)).toBe(true);
    expect(Object.isFrozen(first.condition.injuries)).toBe(true);
  });

  it("starts with generated needs, condition, familiarity, and a lawful scheduled intent", () => {
    const state = createDogActorState(fixtureInput(20));
    const highestNeed = Object.entries(state.needs)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];

    expect(Object.values(state.needs).every((value) => value >= 0 && value <= FIXED_POINT)).toBe(true);
    expect(state.condition).toMatchObject({ health: FIXED_POINT, wetness: 0, injuries: [] });
    expect(state.humanFamiliarity.confidence).toBeGreaterThan(0);
    expect(state.intent.cause).toEqual({ kind: "need", referenceId: `need:${highestNeed}` });
    expect(state.intent.kind).toBe(highestNeed === "rest" ? "rest" : "observe");
    expect(state.intent.enteredAtTick).toBe(20);
    expect(state.intent.nextThinkTick).toBeGreaterThan(20);
    expect(state.intent.nextThinkTick).toBeLessThanOrEqual(28);

    for (const forbidden of ["name", "owner", "bond", "trust", "affection"]) {
      expect(state).not.toHaveProperty(forbidden);
      expect(state.identity).not.toHaveProperty(forbidden);
    }
  });

  it("roundtrips only canonical versioned serialization and rejects forged aliases", () => {
    const state = createDogActorState(fixtureInput());
    const encoded = serializeDogActorState(state);

    expect(deserializeDogActorState(encoded)).toEqual(state);
    expect(serializeDogActorState(deserializeDogActorState(encoded))).toBe(encoded);
    expect(deserializeDogActorState(JSON.stringify(state))).toBeNull();
    expect(deserializeDogActorState("{not-json")).toBeNull();
    expect(canonicalizeDogActorState({ ...state, debug: true })).toBeNull();
    expect(canonicalizeDogActorState({
      ...state,
      address: { ...state.address, actorId: "D-R-v1-impostor" },
    })).toBeNull();
    expect(canonicalizeDogActorState({
      ...state,
      perception: createActorPerceptionState("D-R-v1-impostor", state.updatedAtTick),
    })).toBeNull();
    expect(canonicalizeDogActorState({
      ...state,
      address: { ...state.address, persistence: "promoted" },
    })).toBeNull();
    expect(canonicalizeDogActorState({
      ...state,
      identity: { ...state.identity, owner: "H:invented" },
    })).toBeNull();

    const forgedStableId = `${state.identity.stableId}x`;
    expect(canonicalizeDogActorState({
      ...state,
      identity: { ...state.identity, stableId: forgedStableId },
      address: { ...state.address, actorId: forgedStableId },
      perception: createActorPerceptionState(forgedStableId, state.updatedAtTick),
    })).toBeNull();

    const alternateCoat = state.identity.coat.primaryColor === "black"
      && state.identity.coat.pattern === "solid"
      ? { primaryColor: "brown", secondaryColor: null, pattern: "solid" }
      : { primaryColor: "black", secondaryColor: null, pattern: "solid" };
    expect(canonicalizeDogActorState({
      ...state,
      identity: {
        ...state.identity,
        coat: { ...state.identity.coat, ...alternateCoat },
      },
    })).toBeNull();
  });

  it("appends exact memories idempotently, rejects ID collisions, and keeps the best sixteen", () => {
    let state = createDogActorState(fixtureInput());
    for (let ordinal = 0; ordinal <= DOG_ACTOR_MEMORY_CAP; ordinal += 1) {
      state = appendDogActorMemory(state, memory(state, ordinal));
    }

    expect(state.memories).toHaveLength(DOG_ACTOR_MEMORY_CAP);
    expect(state.memories.some(({ eventId }) => eventId === "dog-event-0")).toBe(false);
    expect(state.memories[0]?.eventId).toBe(`dog-event-${DOG_ACTOR_MEMORY_CAP}`);
    // An old exact transaction stays idempotent after later events advanced
    // the actor tick; causal ordering applies only to new information.
    const replay = appendDogActorMemory(state, memory(state, 1));
    expect(serializeDogActorState(replay)).toBe(serializeDogActorState(state));
    expect(() => appendDogActorMemory(state, {
      ...memory(state, DOG_ACTOR_MEMORY_CAP),
      kind: "safety",
    })).toThrow(/identity collision/u);

    const forged = structuredClone(state) as unknown as Record<string, unknown>;
    forged.memories = Array.from({ length: DOG_ACTOR_MEMORY_CAP + 1 }, (_, ordinal) =>
      memory(state, ordinal + 100, 500_000)
    );
    expect(canonicalizeDogActorState(forged)).toBeNull();
  });

  it("keeps player knowledge bounded and separate from promotion", () => {
    let state = createDogActorState(fixtureInput());
    state = appendDogActorMemory(state, {
      eventId: "seen-dog-1",
      kind: "identity-learning",
      subjectId: null,
      atTick: 1,
      salience: 700_000,
      location: state.address.position,
    });
    state = learnDogPlayerKnowledge(state, {
      fact: "species",
      source: "direct-observation",
      evidenceId: "seen-dog-1",
      learnedAtTick: 1,
      confidence: 700_000,
    });

    expect(state.playerKnowledge.facts).toEqual([{
      fact: "species",
      source: "direct-observation",
      evidenceId: "seen-dog-1",
      learnedAtTick: 1,
      confidence: 700_000,
    }]);
    expect(state.address.persistence).toBe("regional");
    expect(state.promotion).toBeNull();

    const weaker = learnDogPlayerKnowledge(state, {
      fact: "species",
      source: "trusted-report",
      evidenceId: "weak-report-2",
      learnedAtTick: 2,
      confidence: 400_000,
    });
    expect(weaker.playerKnowledge).toEqual(state.playerKnowledge);

    const factKinds: readonly DogPlayerKnowledgeFactKind[] = [
      "species",
      "approximate-size",
      "coat",
      "distinguishing-mark",
      "visible-condition",
      "human-familiarity",
      "temperament",
      "significant-history",
      "recognizable-individual",
    ];
    const forged = structuredClone(state) as unknown as Record<string, unknown>;
    forged.playerKnowledge = {
      version: 1,
      facts: Array.from({ length: DOG_ACTOR_PLAYER_KNOWLEDGE_CAP + 1 }, (_, ordinal) => ({
        fact: factKinds[ordinal % factKinds.length],
        source: "direct-observation",
        evidenceId: `evidence-${ordinal}`,
        learnedAtTick: 1,
        confidence: 700_000,
      })),
    };
    expect(canonicalizeDogActorState(forged)).toBeNull();
  });

  it("retains causal evidence while bounded memories turn over", () => {
    let state = createDogActorState(fixtureInput());
    state = appendDogActorMemory(state, {
      eventId: "observed-one-ear",
      kind: "identity-learning",
      subjectId: null,
      atTick: 1,
      salience: 1,
      location: state.address.position,
    });
    state = learnDogPlayerKnowledge(state, {
      fact: "recognizable-individual",
      source: "direct-observation",
      evidenceId: "observed-one-ear",
      learnedAtTick: 1,
      confidence: 900_000,
    });
    for (let ordinal = 20; ordinal < 20 + DOG_ACTOR_MEMORY_CAP + 2; ordinal += 1) {
      state = appendDogActorMemory(state, memory(state, ordinal, 900_000));
    }

    expect(state.memories).toHaveLength(DOG_ACTOR_MEMORY_CAP);
    expect(state.memories.some(({ eventId }) => eventId === "observed-one-ear")).toBe(true);
    expect(canonicalizeDogActorState(state)).toEqual(state);
  });

  it("promotes only through an explicit meaningful causal category", () => {
    let regional = createDogActorState(fixtureInput());

    expect(() => promoteDogActor(regional, {
      kind: "inspection",
      eventId: "about-clicked",
      atTick: 1,
    })).toThrow(/promotion/u);
    expect(regional.address.persistence).toBe("regional");

    regional = appendDogActorMemory(regional, {
      eventId: "recognized-one-ear-1",
      kind: "identity-learning",
      subjectId: null,
      atTick: 1,
      salience: 800_000,
      location: regional.address.position,
    });
    regional = learnDogPlayerKnowledge(regional, {
      fact: "recognizable-individual",
      source: "direct-observation",
      evidenceId: "recognized-one-ear-1",
      learnedAtTick: 1,
      confidence: 900_000,
    });
    const promoted = promoteDogActor(regional, {
      kind: "identity-learning",
      eventId: "recognized-one-ear-1",
      atTick: 1,
    });
    expect(promoted.address.persistence).toBe("promoted");
    expect(promoted.promotion).toEqual({
      reason: {
        kind: "identity-learning",
        eventId: "recognized-one-ear-1",
        atTick: 1,
      },
    });
    const replay = promoteDogActor(promoted, promoted.promotion?.reason);
    expect(serializeDogActorState(replay)).toBe(serializeDogActorState(promoted));
    const laterReason = promoteDogActor(promoted, {
      kind: "custody-change",
      eventId: "dog-carries-lot-1",
      atTick: 2,
    });
    expect(laterReason.promotion).toEqual(promoted.promotion);
  });

  it("binds advancing perception to the same stable identity", () => {
    const state = createDogActorState(fixtureInput());
    const perception = createActorPerceptionState(state.identity.stableId, 4);
    const advanced = replaceDogActorPerception(state, perception);

    expect(advanced.updatedAtTick).toBe(4);
    expect(advanced.perception).toEqual(perception);
    expect(() => replaceDogActorPerception(
      advanced,
      createActorPerceptionState("D-R-v1-other", 5),
    )).toThrow(/same stable actor identity/u);
    expect(() => replaceDogActorPerception(
      advanced,
      createActorPerceptionState(state.identity.stableId, 3),
    )).toThrow(/must advance/u);
  });

  it("persists the behavior kernel's exact intent, cause, and deterministic think tick", () => {
    const initial = createDogActorState(fixtureInput());
    const current = replaceDogActorPerception(
      initial,
      createActorPerceptionState(initial.identity.stableId, 1),
    );
    const decision = decideDogBehavior({
      tick: 1,
      dog: {
        identity: current.identity,
        needs: { ...current.needs },
        condition: { ...current.condition, injuries: [...current.condition.injuries] },
        humanFamiliarity: { ...current.humanFamiliarity },
      },
      perception: current.perception,
      weather: {
        coldPressure: 0,
        heatPressure: 0,
        rainIntensity: 0,
        windPressure: 0,
      },
      accessibility: Object.fromEntries(
        DOG_BEHAVIOR_INTENTS.map((intent) => [intent, true]),
      ) as Record<(typeof DOG_BEHAVIOR_INTENTS)[number], boolean>,
      foodContact: { directlyConfirmed: false, accessible: false },
      current: {
        intent: current.intent.kind,
        enteredAtTick: current.intent.enteredAtTick,
      },
    });
    if (decision === null) throw new Error("behavior fixture did not decide");

    const applied = applyDogBehaviorDecision(current, decision);
    expect(applied.intent).toEqual({
      kind: decision.intent,
      cause: decision.cause.kind === "prior-intent"
        ? current.intent.cause
        : decision.cause,
      enteredAtTick: decision.enteredAtTick,
      nextThinkTick: decision.nextThinkTick,
    });
    expect(applied.updatedAtTick).toBe(decision.tick);
    expect(decision.nextThinkTick).toBeGreaterThan(decision.tick);

    expect(() => applyDogBehaviorDecision(current, {
      ...decision,
      cause: { kind: "perception", referenceId: "subject:unseen-food" },
    })).toThrow(/did not perceive/u);

    const held = applyDogBehaviorDecision(current, {
      ...decision,
      intent: current.intent.kind,
      enteredAtTick: current.intent.enteredAtTick,
      nextThinkTick: 2,
      cause: { kind: "prior-intent", referenceId: `intent:${current.intent.kind}` },
      focusBeliefKey: null,
    });
    expect(held.intent.cause).toEqual(current.intent.cause);
  });

  it("updates intent, physiology, and segmented placement without changing identity", () => {
    const initial = createDogActorState(fixtureInput());
    const intent = setDogActorIntent(initial, {
      kind: "approach-food",
      cause: { kind: "perception", referenceId: "contact:scent:food-1" },
      enteredAtTick: 1,
      nextThinkTick: 4,
    });
    const physiology = replaceDogActorPhysiology(intent, {
      needs: { ...intent.needs, hunger: 800_000 },
      condition: { ...intent.condition, wetness: 620_000, coldStress: 210_000 },
      humanFamiliarity: intent.humanFamiliarity,
      atTick: 2,
    });
    const nextRegion = createRegionCoord(18, -912);
    const moved = repositionDogActor(physiology, {
      position: createWorldPosition(nextRegion, 10, 20),
      heading: 125_000,
      atTick: 3,
    });

    expect(moved.identity).toEqual(initial.identity);
    expect(moved.address.actorId).toBe(initial.identity.stableId);
    expect(moved.address.position).toEqual({ region: nextRegion, localX: 10, localY: 20 });
    expect(moved.address.heading).toBe(125_000);
    expect(moved.intent).toEqual(intent.intent);
    expect(moved.needs.hunger).toBe(800_000);
    expect(moved.condition).toMatchObject({ wetness: 620_000, coldStress: 210_000 });
    expect(moved.updatedAtTick).toBe(3);
  });
});
