import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorObservation,
  type ActorObservationChannel,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import {
  generateDogState,
  type DogIdentityGenerationInput,
  type GeneratedDogState,
} from "../sim/dogIdentity";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { createWorldPosition } from "./worldPosition";
import {
  DOG_BEHAVIOR_INTENTS,
  DOG_BEHAVIOR_VERSION,
  DOG_INTENT_SWITCH_MARGIN,
  decideDogBehavior,
  type DogActionAccessibility,
  type DogBehaviorDecision,
  type DogBehaviorInput,
  type DogBehaviorIntent,
} from "./dogBehavior";

interface ObservationSpec {
  readonly id: string;
  readonly perceivedClass: string;
  readonly channel: ActorObservationChannel;
  readonly confidence: number;
  readonly salience: number;
  readonly subjectId?: string;
  readonly x?: number;
  readonly y?: number;
}

const ALL_ACCESSIBLE: DogActionAccessibility = Object.freeze({
  retreat: true,
  "seek-shelter": true,
  "avoid-human": true,
  eat: true,
  "approach-food": true,
  rest: true,
  observe: true,
});

function dogGenerationInput(ordinal = 0): DogIdentityGenerationInput {
  return {
    seed: seedFromText("dog behavior consumes knowledge rather than omniscience"),
    originRegion: createRegionCoord(-11, 8),
    originNamespace: "regional",
    habitatClass: "coastal-lowland",
    habitatKey: "reed-bank",
    populationKey: "dogs:rain-season",
    populationOrdinal: ordinal,
  };
}

function dog(ordinal = 0): GeneratedDogState {
  const state = generateDogState(dogGenerationInput(ordinal));
  state.needs = { hunger: 0, thirst: 0, rest: 0, safety: 0, company: 0 };
  state.condition = {
    health: ACTOR_PERCEPTION_SCALE,
    wetness: 0,
    coldStress: 0,
    heatStress: 0,
    exhaustion: 0,
    injuries: [],
  };
  return state;
}

function findDogWithout(
  excluded: ReadonlySet<string>,
): GeneratedDogState {
  for (let ordinal = 0; ordinal < 1_000; ordinal += 1) {
    const state = dog(ordinal);
    if (state.identity.temperament.every((trait) => !excluded.has(trait))) return state;
  }
  throw new Error("Deterministic fixture could not find a neutral temperament");
}

function area(x = 20_000, y = 20_000, radiusUnits = 0) {
  return {
    center: createWorldPosition(createRegionCoord(-11, 8), x, y),
    radiusUnits,
  };
}

function observation(
  observerId: string,
  tick: number,
  spec: ObservationSpec,
): ActorObservation {
  const isScent = spec.channel === "scent";
  const isHearing = spec.channel === "hearing";
  const value = createActorObservation({
    id: spec.id,
    observerId,
    observedAtTick: tick,
    channel: spec.channel,
    perceivedClass: spec.perceivedClass,
    subjectId: isScent || isHearing ? null : (spec.subjectId ?? `subject:${spec.id}`),
    area: area(
      spec.x,
      spec.y,
      isScent ? 1_000 : isHearing ? MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS : 0,
    ),
    confidence: spec.confidence,
    salience: spec.salience,
    identification: isScent ? "classified" : isHearing ? "anonymous" : "identified",
  });
  if (value === null) throw new Error(`Invalid observation fixture ${spec.id}`);
  return value;
}

function perception(
  state: GeneratedDogState,
  tick: number,
  specs: readonly ObservationSpec[] = [],
): ActorPerceptionState {
  const initial = createActorPerceptionState(state.identity.stableId);
  const result = stepActorPerception(initial, {
    tick,
    observations: specs.map((spec) => observation(state.identity.stableId, tick, spec)),
  });
  if (result === null) throw new Error("Valid dog perception fixture failed");
  return result;
}

function behaviorInput(
  state: GeneratedDogState,
  specs: readonly ObservationSpec[] = [],
  overrides: Partial<DogBehaviorInput> = {},
): DogBehaviorInput {
  const tick = overrides.tick ?? 10;
  return {
    tick,
    dog: state,
    perception: overrides.perception ?? perception(state, tick, specs),
    weather: overrides.weather ?? {
      coldPressure: 0,
      heatPressure: 0,
      rainIntensity: 0,
      windPressure: 0,
    },
    accessibility: overrides.accessibility ?? ALL_ACCESSIBLE,
    foodContact: overrides.foodContact ?? { directlyConfirmed: false, accessible: false },
    current: overrides.current ?? { intent: "observe", enteredAtTick: 0 },
  };
}

function decide(input: DogBehaviorInput): DogBehaviorDecision {
  const result = decideDogBehavior(input);
  if (result === null) throw new Error("Valid dog behavior fixture was rejected");
  return result;
}

function score(decision: DogBehaviorDecision, intent: DogBehaviorIntent): number {
  const entry = decision.scores.find((candidate) => candidate.intent === intent);
  if (entry === undefined) throw new Error(`Decision omitted ${intent}`);
  return entry.score;
}

const FOOD_SCENT: ObservationSpec = {
  id: "food-plume",
  perceivedClass: "food-scent",
  channel: "scent",
  confidence: 900_000,
  salience: 850_000,
};

const BEAR: ObservationSpec = {
  id: "bear-seen",
  perceivedClass: "bear",
  channel: "vision",
  confidence: ACTOR_PERCEPTION_SCALE,
  salience: ACTOR_PERCEPTION_SCALE,
};

describe("pure deterministic dog behavior", () => {
  it("returns a canonical fixed-point neutral observation decision", () => {
    const decision = decide(behaviorInput(dog()));

    expect(decision).toMatchObject({
      version: DOG_BEHAVIOR_VERSION,
      tick: 10,
      intent: "observe",
      enteredAtTick: 0,
      cause: { kind: "condition", referenceId: "condition:neutral-watch" },
      focusBeliefKey: null,
    });
    expect(decision.nextThinkTick).toBeGreaterThan(decision.tick);
    expect(decision.nextThinkTick).toBeLessThanOrEqual(decision.tick + 7);
    expect(decision.scores.map(({ intent }) => intent)).toEqual(DOG_BEHAVIOR_INTENTS);
    for (const entry of decision.scores) {
      expect(Number.isSafeInteger(entry.score)).toBe(true);
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(ACTOR_PERCEPTION_SCALE);
    }
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.scores)).toBe(true);
  });

  it("lets classified food scent justify approach without granting exact food contact", () => {
    const state = dog();
    state.needs.hunger = 900_000;
    const scentOnly = decide(behaviorInput(state, [FOOD_SCENT]));

    expect(scentOnly.intent).toBe("approach-food");
    expect(scentOnly.focusBeliefKey).toBe("contact:scent:food-plume");
    expect(scentOnly.cause).toEqual({
      kind: "perception",
      referenceId: "contact:scent:food-plume",
    });
    expect(score(scentOnly, "eat")).toBe(0);
    expect(JSON.stringify(scentOnly)).not.toContain("sourcePosition");
    expect(JSON.stringify(scentOnly)).not.toContain("sourceId");
  });

  it("requires both direct confirmation and physical accessibility before eating", () => {
    const state = dog();
    state.needs.hunger = 950_000;
    const base = behaviorInput(state, [FOOD_SCENT]);

    expect(decide({
      ...base,
      foodContact: { directlyConfirmed: false, accessible: true },
    }).intent).toBe("approach-food");
    expect(decide({
      ...base,
      foodContact: { directlyConfirmed: true, accessible: false },
    }).intent).toBe("approach-food");
    const eating = decide({
      ...base,
      foodContact: { directlyConfirmed: true, accessible: true },
    });
    expect(eating.intent).toBe("eat");
    expect(eating.cause).toEqual({ kind: "contact", referenceId: "contact:food" });
  });

  it("prefers urgent shelter over attractive food when wet-cold exposure is severe", () => {
    const state = dog();
    state.needs.hunger = ACTOR_PERCEPTION_SCALE;
    state.condition.wetness = ACTOR_PERCEPTION_SCALE;
    state.condition.coldStress = 900_000;
    const decision = decide(behaviorInput(state, [FOOD_SCENT], {
      weather: {
        coldPressure: ACTOR_PERCEPTION_SCALE,
        heatPressure: 0,
        rainIntensity: ACTOR_PERCEPTION_SCALE,
        windPressure: 900_000,
      },
    }));

    expect(decision.intent).toBe("seek-shelter");
    expect(decision.cause).toEqual({
      kind: "condition",
      referenceId: "condition:weather-exposure",
    });
    expect(score(decision, "seek-shelter")).toBeGreaterThan(score(decision, "approach-food"));
  });

  it("retreats from a strong perceived threat despite hunger", () => {
    const state = dog();
    state.needs.hunger = ACTOR_PERCEPTION_SCALE;
    state.needs.safety = ACTOR_PERCEPTION_SCALE;
    const decision = decide(behaviorInput(state, [FOOD_SCENT, BEAR]));

    expect(decision.intent).toBe("retreat");
    expect(decision.cause.kind).toBe("perception");
    expect(decision.focusBeliefKey).toContain("bear-seen");
    expect(score(decision, "retreat")).toBeGreaterThan(score(decision, "approach-food"));
  });

  it("uses human familiarity and accepted human perception for avoidance", () => {
    const state = dog();
    state.humanFamiliarity = { level: "wary", confidence: 300_000 };
    state.needs.safety = 500_000;
    const decision = decide(behaviorInput(state, [{
      id: "porter-seen",
      perceivedClass: "human",
      channel: "vision",
      confidence: 850_000,
      salience: 800_000,
    }]));

    expect(decision.intent).toBe("avoid-human");
    expect(decision.focusBeliefKey).toContain("porter-seen");
  });

  it("rests when fatigue dominates and no danger or exposure is perceived", () => {
    const state = dog();
    state.needs.rest = 950_000;
    state.condition.exhaustion = 900_000;
    const decision = decide(behaviorInput(state));

    expect(decision.intent).toBe("rest");
    expect(decision.cause).toEqual({ kind: "need", referenceId: "need:rest" });
    expect(score(decision, "rest")).toBeGreaterThan(score(decision, "observe"));
  });

  it("holds approach and retreat briefly, then disengages neutrally when evidence disappears", () => {
    const approachState = dog();
    const heldApproach = decide(behaviorInput(approachState, [], {
      tick: 12,
      perception: perception(approachState, 12),
      current: { intent: "approach-food", enteredAtTick: 10 },
    }));
    expect(heldApproach.intent).toBe("approach-food");
    expect(heldApproach.focusBeliefKey).toBeNull();
    expect(heldApproach.cause).toEqual({
      kind: "prior-intent",
      referenceId: "intent:approach-food",
    });

    const releasedApproach = decide(behaviorInput(approachState, [], {
      tick: 15,
      perception: perception(approachState, 15),
      current: { intent: "approach-food", enteredAtTick: 10 },
    }));
    expect(releasedApproach.intent).toBe("observe");

    const retreatState = dog(1);
    const heldRetreat = decide(behaviorInput(retreatState, [], {
      tick: 12,
      perception: perception(retreatState, 12),
      current: { intent: "retreat", enteredAtTick: 10 },
    }));
    expect(heldRetreat.intent).toBe("retreat");

    const releasedRetreat = decide(behaviorInput(retreatState, [], {
      tick: 14,
      perception: perception(retreatState, 14),
      current: { intent: "retreat", enteredAtTick: 10 },
    }));
    expect(releasedRetreat.intent).toBe("observe");
  });

  it("uses switch-margin hysteresis but permits urgent safety interruption", () => {
    const state = findDogWithout(new Set([
      "food-motivated",
      "persistent",
      "curious",
      "observant",
      "playful",
    ]));
    const weakFood: ObservationSpec = {
      ...FOOD_SCENT,
      id: "weak-food-plume",
      confidence: 100_000,
      salience: 100_000,
    };
    const marginal = decide(behaviorInput(state, [weakFood], {
      current: { intent: "approach-food", enteredAtTick: 0 },
    }));
    const advantage = score(marginal, "observe") - score(marginal, "approach-food");
    expect(advantage).toBeGreaterThan(0);
    expect(advantage).toBeLessThan(DOG_INTENT_SWITCH_MARGIN);
    expect(marginal.intent).toBe("approach-food");

    state.needs.safety = ACTOR_PERCEPTION_SCALE;
    const interrupted = decide(behaviorInput(state, [weakFood, BEAR], {
      tick: 1,
      perception: perception(state, 1, [weakFood, BEAR]),
      current: { intent: "approach-food", enteredAtTick: 0 },
    }));
    expect(interrupted.intent).toBe("retreat");
  });

  it("respects physical action accessibility and drops an inaccessible current intent immediately", () => {
    const state = dog();
    state.needs.hunger = 900_000;
    const accessibility: DogActionAccessibility = {
      ...ALL_ACCESSIBLE,
      "approach-food": false,
    };
    const decision = decide(behaviorInput(state, [FOOD_SCENT], {
      tick: 11,
      perception: perception(state, 11, [FOOD_SCENT]),
      accessibility,
      current: { intent: "approach-food", enteredAtTick: 10 },
    }));

    expect(decision.intent).not.toBe("approach-food");
    expect(decision.scores.find(({ intent }) => intent === "approach-food")?.accessible).toBe(false);
    expect(decideDogBehavior(behaviorInput(state, [FOOD_SCENT], {
      accessibility: { ...ALL_ACCESSIBLE, observe: false },
    }))).toBeNull();
  });

  it("is independent of observation input order and hidden source coordinates/identity", () => {
    const state = dog();
    state.needs.safety = 600_000;
    state.humanFamiliarity = { level: "wary", confidence: 300_000 };
    const specs: ObservationSpec[] = [
      {
        id: "human-a",
        perceivedClass: "human",
        channel: "vision",
        confidence: 700_000,
        salience: 650_000,
        subjectId: "human:one",
        x: 10_000,
        y: 10_000,
      },
      FOOD_SCENT,
      {
        id: "sound-a",
        perceivedClass: "danger-sound",
        channel: "hearing",
        confidence: 350_000,
        salience: 500_000,
        subjectId: "sound:one",
      },
    ];
    const forward = decide(behaviorInput(state, specs));
    const reverse = decide(behaviorInput(state, [...specs].reverse()));
    expect(reverse).toEqual(forward);

    const movedAndRenamed = specs.map((spec) => spec.id === "human-a"
      ? { ...spec, subjectId: "human:entirely-different", x: 80_000, y: 60_000 }
      : spec
    );
    const altered = decide(behaviorInput(state, movedAndRenamed));
    expect(altered.intent).toBe(forward.intent);
    expect(altered.scores).toEqual(forward.scores);
  });

  it("fails closed on malformed, mismatched, stale, or unbounded inputs", () => {
    const state = dog();
    const valid = behaviorInput(state);
    const otherDog = dog(99);
    const malformedDog = structuredClone(state);
    malformedDog.needs.hunger = ACTOR_PERCEPTION_SCALE + 1;
    const invalid: unknown[] = [
      { ...valid, tick: -1 },
      { ...valid, tick: 1.5 },
      { ...valid, tick: Number.MAX_SAFE_INTEGER },
      { ...valid, perception: perception(otherDog, valid.tick) },
      { ...valid, tick: valid.tick + 1 },
      { ...valid, dog: malformedDog },
      { ...valid, weather: { ...valid.weather, coldPressure: ACTOR_PERCEPTION_SCALE + 1 } },
      { ...valid, weather: { ...valid.weather, rainIntensity: 0.5 } },
      { ...valid, current: { intent: "attack", enteredAtTick: 0 } },
      { ...valid, current: { intent: "observe", enteredAtTick: valid.tick + 1 } },
      { ...valid, foodContact: { directlyConfirmed: true } },
      { ...valid, accessibility: { ...valid.accessibility, fly: true } },
      { ...valid, hiddenFoodSourceId: "item:secret" },
    ];

    for (const input of invalid) {
      expect(decideDogBehavior(input as DogBehaviorInput)).toBeNull();
    }
  });
});
