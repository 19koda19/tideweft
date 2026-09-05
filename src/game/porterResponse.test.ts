import { describe, expect, it } from "vitest";

import {
  createActorPerceptionState,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT } from "../sim/types";
import {
  addActorCargoProvision,
  createActorCargoContainer,
  createActorCargoState,
  type ActorCargoState,
} from "./actorCargo";
import { createLivingActorAddress } from "./livingActor";
import {
  LIVING_ACTOR_VISUAL_CONTACT_VERSION,
  collectLivingActorVisualContactObservations,
} from "./livingActorVisualContact";
import {
  PORTER_RESPONSE_INTENTS,
  PORTER_RESPONSE_VERSION,
  applyPorterResponseDecision,
  canonicalizePorterResponseDecision,
  canonicalizePorterResponseState,
  createPorterResponseState,
  decidePorterResponse,
  decidePorterResponseForRequest,
  type PorterResponseAccessibility,
  type PorterResponseInput,
  type PorterResponseState,
} from "./porterResponse";
import { createWorldPosition } from "./worldPosition";

const HUMAN_ID = "H-porter-response";
const DOG_ID = "D-dog-response";
const PACK_ID = "pack:porter-response";
const FOOD_LOT_ID = "food:porter-response";

const ALL_ACCESSIBLE: PorterResponseAccessibility = Object.freeze({
  "secure-food": true,
  reroute: true,
  leave: true,
  "offer-food": true,
  "wait-observe": true,
});

function position(x: number) {
  return createWorldPosition(createRegionCoord(-91, 44), x, 30_000);
}

function perception(
  tick: number,
  clarity: "none" | "partial" | "identified" = "identified",
): ActorPerceptionState {
  const initial = createActorPerceptionState(HUMAN_ID);
  if (clarity === "none") {
    const empty = stepActorPerception(initial, { tick, observations: [] });
    if (empty === null) throw new Error("Empty perception fixture failed");
    return empty;
  }
  const observer = createLivingActorAddress({
    actorId: HUMAN_ID,
    species: "human",
    position: position(20_000),
    persistence: "promoted",
  });
  const subject = createLivingActorAddress({
    actorId: DOG_ID,
    species: "domestic-dog",
    position: position(23_000),
    persistence: "regional",
  });
  const observations = collectLivingActorVisualContactObservations({
    version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
    observer,
    tick,
    contacts: [{
      version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
      evidenceId: `dog-contact-${tick}`,
      perceivedClass: clarity === "identified" ? "domestic-dog" : "animal-silhouette",
      subject,
      lineOfSight: clarity === "identified" ? "clear" : "partial",
      confidence: clarity === "identified" ? 900_000 : 330_000,
      salience: clarity === "identified" ? 860_000 : 380_000,
      identityEligible: clarity === "identified",
    }],
  });
  if (observations === null) throw new Error("Visual perception fixture failed");
  const result = stepActorPerception(initial, { tick, observations });
  if (result === null) throw new Error("Actor perception fixture failed");
  return result;
}

function cargo(closure: "open" | "secured" = "open", quantity = 4): ActorCargoState {
  const empty = createActorCargoState([createActorCargoContainer({
    id: PACK_ID,
    custodianActorId: HUMAN_ID,
    capacityMilliLoad: 10_000,
    closure,
  })]);
  if (quantity === 0) return empty;
  const added = addActorCargoProvision(empty, {
    transactionId: "setup:porter-food",
    containerId: PACK_ID,
    lotId: FOOD_LOT_ID,
    provision: "dried-fish",
    quantity,
  });
  if (!added.ok) throw new Error(`Food cargo fixture failed: ${added.reason}`);
  return added.state;
}

function currentAt(
  tick: number,
  intent: PorterResponseState["intent"] = "wait-observe",
  nextThinkTick = tick,
): PorterResponseState {
  const state = canonicalizePorterResponseState({
    version: PORTER_RESPONSE_VERSION,
    actorId: HUMAN_ID,
    tick,
    intent,
    enteredAtTick: tick,
    nextThinkTick,
    lastDecisionId: null,
    lastOfferedSubjectId: null,
    lastOfferedAtTick: null,
  });
  if (state === null) throw new Error("Porter response state fixture failed");
  return state;
}

function input(
  tick = 10,
  overrides: Partial<PorterResponseInput> = {},
): PorterResponseInput {
  return {
    version: PORTER_RESPONSE_VERSION,
    tick,
    perception: perception(tick),
    cargo: cargo(),
    packContainerId: PACK_ID,
    weather: { rainIntensity: 0, coldPressure: 0, windPressure: 0 },
    needs: { food: 0, rest: 0, belonging: 0 },
    disposition: {
      traits: { resolve: 500_000, empathy: 500_000, curiosity: 500_000 },
      temperament: ["calm", "practical"],
    },
    accessibility: ALL_ACCESSIBLE,
    current: createPorterResponseState(HUMAN_ID),
    ...overrides,
  };
}

function decide(value: PorterResponseInput) {
  const decision = decidePorterResponse(value);
  if (decision === null) throw new Error("Valid porter response input was rejected");
  return decision;
}

describe("deterministic porter food-and-animal response policy", () => {
  it("offers one exact physical food lot when lawful sight and empathy support it", () => {
    const decision = decide(input(10, {
      disposition: {
        traits: { resolve: 500_000, empathy: FIXED_POINT, curiosity: 0 },
        temperament: ["protective", "social"],
      },
    }));
    expect(decision).toMatchObject({
      actorId: HUMAN_ID,
      intent: "offer-food",
      subjectId: DOG_ID,
      packContainerId: PACK_ID,
      foodLotId: FOOD_LOT_ID,
      cause: { kind: "perception" },
    });
    expect(canonicalizePorterResponseDecision(decision)).toEqual(decision);

    const applied = applyPorterResponseDecision(createPorterResponseState(HUMAN_ID), decision);
    expect(applied).toMatchObject({ ok: true, reason: "applied" });
    if (applied.state === null) throw new Error("Applied porter decision omitted state");
    expect(applied.state).toMatchObject({
      lastOfferedSubjectId: DOG_ID,
      lastOfferedAtTick: 10,
    });
    const replay = applyPorterResponseDecision(applied.state, decision);
    expect(replay).toEqual({ ok: true, reason: "already-applied", state: applied.state });

    const later = decide(input(20, {
      current: applied.state,
      disposition: {
        traits: { resolve: 500_000, empathy: FIXED_POINT, curiosity: 0 },
        temperament: ["protective", "social"],
      },
    }));
    expect(later.intent).not.toBe("offer-food");

    const afterCooldown = decide(input(22, {
      current: applied.state,
      disposition: {
        traits: { resolve: 500_000, empathy: FIXED_POINT, curiosity: 0 },
        temperament: ["protective", "social"],
      },
    }));
    expect(afterCooldown.intent).toBe("offer-food");
  });

  it("secures an open food pack when rain and cautious practical behavior dominate", () => {
    expect(decide(input(10, {
      weather: { rainIntensity: 850_000, coldPressure: 400_000, windPressure: 300_000 },
      disposition: {
        traits: { resolve: 500_000, empathy: 0, curiosity: 0 },
        temperament: ["cautious", "practical"],
      },
    }))).toMatchObject({
      intent: "secure-food",
      subjectId: null,
      foodLotId: null,
      cause: { kind: "pack", referenceId: PACK_ID },
    });
  });

  it("reroutes in severe exposure when a cautious porter has already secured food", () => {
    expect(decide(input(10, {
      cargo: cargo("secured"),
      weather: { rainIntensity: FIXED_POINT, coldPressure: FIXED_POINT, windPressure: FIXED_POINT },
      disposition: {
        traits: { resolve: 0, empathy: 0, curiosity: 0 },
        temperament: ["nervous", "cautious", "practical"],
      },
    }))).toMatchObject({
      intent: "reroute",
      subjectId: DOG_ID,
      cause: { kind: "weather", referenceId: "weather:exposure" },
    });
  });

  it("leaves when the safer reroute is inaccessible and danger remains severe", () => {
    expect(decide(input(10, {
      cargo: cargo("secured"),
      weather: { rainIntensity: FIXED_POINT, coldPressure: FIXED_POINT, windPressure: FIXED_POINT },
      needs: { food: 0, rest: FIXED_POINT, belonging: 0 },
      disposition: {
        traits: { resolve: 0, empathy: 0, curiosity: 0 },
        temperament: ["nervous", "reserved"],
      },
      accessibility: { ...ALL_ACCESSIBLE, reroute: false },
    }))).toMatchObject({ intent: "leave", subjectId: DOG_ID });
  });

  it("waits on an uncertain silhouette rather than inventing identity or offering food", () => {
    const decision = decide(input(10, {
      perception: perception(10, "partial"),
      cargo: cargo("secured"),
      disposition: {
        traits: { resolve: FIXED_POINT, empathy: FIXED_POINT, curiosity: FIXED_POINT },
        temperament: ["calm", "curious", "patient"],
      },
    }));
    expect(decision).toMatchObject({
      intent: "wait-observe",
      subjectId: null,
      foodLotId: null,
      cause: { kind: "perception" },
    });
  });

  it("cannot respond to an animal the porter did not perceive", () => {
    const decision = decide(input(10, {
      perception: perception(10, "none"),
      cargo: cargo("secured"),
      disposition: {
        traits: { resolve: 0, empathy: FIXED_POINT, curiosity: FIXED_POINT },
        temperament: ["protective", "social"],
      },
    }));
    expect(decision.intent).toBe("wait-observe");
    expect(decision.focusBeliefKey).toBeNull();
    expect(decision.subjectId).toBeNull();
    for (const intent of ["offer-food", "reroute", "leave"] as const) {
      expect(decision.scores.find((score) => score.intent === intent)?.accessible).toBe(false);
    }
  });

  it("uses minimum hold and score margin hysteresis before switching from observation", () => {
    const held = currentAt(10, "wait-observe", 15);
    const tempting = {
      disposition: {
        traits: { resolve: 500_000, empathy: FIXED_POINT, curiosity: 0 },
        temperament: ["protective", "social"] as const,
      },
    };
    expect(decide(input(11, { current: held, ...tempting })).intent).toBe("wait-observe");
    expect(decide(input(20, { current: held, ...tempting })).intent).toBe("offer-food");
  });

  it("treats a heard request as influence rather than consent", () => {
    const cautiousInput = input(10, {
      cargo: cargo("secured"),
      disposition: {
        traits: { resolve: 500_000, empathy: 0, curiosity: FIXED_POINT },
        temperament: ["calm", "curious"],
      },
    });
    expect(decide(cautiousInput).intent).toBe("wait-observe");
    expect(decidePorterResponseForRequest(cautiousInput, {
      version: PORTER_RESPONSE_VERSION,
      requestId: "living-choice:offer-request",
      kind: "offer-provision",
      subjectId: DOG_ID,
    })).toMatchObject({
      intent: "offer-food",
      subjectId: DOG_ID,
      cause: {
        kind: "communication",
        referenceId: "living-choice:offer-request",
      },
    });

    const unsafeInput = input(10, {
      cargo: cargo("secured"),
      weather: { rainIntensity: FIXED_POINT, coldPressure: FIXED_POINT, windPressure: FIXED_POINT },
      disposition: {
        traits: { resolve: 0, empathy: 0, curiosity: 0 },
        temperament: ["nervous", "cautious", "practical"],
      },
    });
    expect(decidePorterResponseForRequest(unsafeInput, {
      version: PORTER_RESPONSE_VERSION,
      requestId: "living-choice:unsafe-offer-request",
      kind: "offer-provision",
      subjectId: DOG_ID,
    })?.intent).toBe("reroute");
  });

  it("is deterministic and rejects extra keys, wrong custody, and inaccessible neutral action", () => {
    const valid = input();
    expect(decidePorterResponse(valid)).toEqual(decidePorterResponse(valid));
    expect(decidePorterResponse({ ...valid, debugDogIntent: "hungry" })).toBeNull();
    expect(decidePorterResponse({
      ...valid,
      accessibility: { ...ALL_ACCESSIBLE, "wait-observe": false },
    })).toBeNull();

    const foreignCargo = createActorCargoState([createActorCargoContainer({
      id: PACK_ID,
      custodianActorId: "H-someone-else",
      capacityMilliLoad: 10_000,
      closure: "open",
    })]);
    expect(decidePorterResponse({ ...valid, cargo: foreignCargo })).toBeNull();
    expect(PORTER_RESPONSE_INTENTS).toEqual([
      "secure-food",
      "reroute",
      "leave",
      "offer-food",
      "wait-observe",
    ]);
  });

  it("fails closed on malformed state and inconsistent idempotent replay evidence", () => {
    const decision = decide(input(10, {
      disposition: {
        traits: { resolve: 500_000, empathy: FIXED_POINT, curiosity: 0 },
        temperament: ["protective", "social"],
      },
    }));
    expect(applyPorterResponseDecision({ actorId: HUMAN_ID }, decision)).toEqual({
      ok: false,
      reason: "invalid-state",
      state: null,
    });
    const inconsistent = canonicalizePorterResponseState({
      ...createPorterResponseState(HUMAN_ID),
      tick: decision.tick,
      intent: decision.intent,
      enteredAtTick: decision.enteredAtTick,
      nextThinkTick: decision.nextThinkTick,
      lastDecisionId: decision.decisionId,
    });
    if (inconsistent === null) throw new Error("Inconsistent replay fixture was malformed");
    expect(applyPorterResponseDecision(inconsistent, decision)).toMatchObject({
      ok: false,
      reason: "invalid-decision",
    });
  });
});
