import { describe, expect, it } from "vitest";

import { createWorldPosition, translateWorldPosition } from "../game/worldPosition";
import {
  ACTOR_BELIEF_CAP,
  createActorObservation,
  createActorPerceptionState,
  deserializeActorPerceptionState,
  serializeActorPerceptionState,
  stepActorPerception,
  type ActorObservation,
  type ActorObservationInput,
  type ActorPerceptionState,
} from "./actorPerception";
import {
  isResidentRestSurfaceBelief,
  residentRestSurfaceKnowledge,
  residentRestSurfaceObservationId,
} from "./residentSurfaceKnowledge";

const ACTOR_ID = "human:resident-surface-test";
const OTHER_ACTOR_ID = "human:other-surface-observer";
const TARGET = createWorldPosition({ x: -1, y: 2 }, 32_500, 14_500);

// Synthetic sensory inputs exercise the knowledge contract only. Their shape
// does not establish real sight, a selected task, physical support or arrival.
function observation(
  tick: number,
  perceivedClass = "water-covered-ground",
  overrides: Partial<ActorObservationInput> = {},
): ActorObservation {
  const result = createActorObservation({
    id: residentRestSurfaceObservationId(ACTOR_ID, TARGET),
    observerId: ACTOR_ID,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass,
    subjectId: null,
    area: { center: TARGET, radiusUnits: 0 },
    confidence: 800_000,
    salience: 200_000,
    identification: "classified",
    interrupt: "none",
    ...overrides,
  });
  if (result === null) throw new Error("Surface knowledge fixture observation must be canonical");
  return result;
}

function advance(
  previous: ActorPerceptionState,
  tick: number,
  observations: readonly ActorObservation[] = [],
): ActorPerceptionState {
  const result = stepActorPerception(previous, { tick, observations });
  if (result === null || result.tick !== tick) throw new Error("Surface knowledge fixture step was rejected");
  return result;
}

function seen(perceivedClass = "water-covered-ground", overrides: Partial<ActorObservationInput> = {}) {
  return advance(createActorPerceptionState(ACTOR_ID), 1, [observation(1, perceivedClass, overrides)]);
}

describe("selected-rest qualitative surface knowledge", () => {
  it("uses one stable actor-plus-exact-target identity, including signed regions", () => {
    const before = JSON.stringify(TARGET);
    const id = residentRestSurfaceObservationId(ACTOR_ID, TARGET);
    expect(id).toBe(residentRestSurfaceObservationId(ACTOR_ID, structuredClone(TARGET)));
    expect(id).not.toBe(residentRestSurfaceObservationId(OTHER_ACTOR_ID, TARGET));
    expect(id).not.toBe(residentRestSurfaceObservationId(ACTOR_ID, translateWorldPosition(TARGET, 1, 0)));
    expect(id).not.toBe(residentRestSurfaceObservationId(ACTOR_ID,
      createWorldPosition({ x: 1, y: -2 }, TARGET.localX, TARGET.localY)));
    expect(observation(1).id).toBe(observation(2, "dry-ground").id);
    expect(JSON.stringify(TARGET)).toBe(before);
  });

  it("updates one classified contact from wet to dry without creating an actor identity or recognition memory", () => {
    const wet = seen();
    expect(residentRestSurfaceKnowledge(wet, TARGET, 1)).toBe("wet");
    const dry = advance(wet, 2, [observation(2, "dry-ground")]);
    expect(dry.beliefs).toHaveLength(1);
    expect(dry.beliefs[0]).toMatchObject({
      key: `contact:vision:${residentRestSurfaceObservationId(ACTOR_ID, TARGET)}`,
      perceivedClass: "dry-ground", identification: "classified", subjectId: null,
      firstObservedTick: 1, lastObservedTick: 2, area: { center: TARGET, radiusUnits: 0 },
    });
    expect(isResidentRestSurfaceBelief(ACTOR_ID, dry.beliefs[0]!)).toBe(true);
    expect(dry.salientMemory).toEqual([]);
    expect(dry.search).toBeNull();
    expect(residentRestSurfaceKnowledge(dry, TARGET, 2)).toBe("dry");
    expect(residentRestSurfaceKnowledge(wet, TARGET, 1)).toBe("wet");
  });

  it("preserves exact frozen and detached cold knowledge without modifying its source", () => {
    const state = advance(seen(), 2, [observation(2, "dry-ground")]);
    const bytes = serializeActorPerceptionState(state);
    const cold = deserializeActorPerceptionState(bytes);
    if (cold === null) throw new Error("Canonical surface knowledge must reload");
    expect(cold).not.toBe(state);
    expect(Object.isFrozen(cold)).toBe(true);
    expect(Object.isFrozen(cold.beliefs[0]!.area.center)).toBe(true);
    for (const value of [state, structuredClone(state), cold]) {
      expect(residentRestSurfaceKnowledge(value, TARGET, 2)).toBe("dry");
      expect(serializeActorPerceptionState(value)).toBe(bytes);
    }
    expect(serializeActorPerceptionState(state)).toBe(bytes);
  });

  it("treats absent and aged evidence as unknown, while rejecting a mismatched perception clock", () => {
    expect(residentRestSurfaceKnowledge(createActorPerceptionState(ACTOR_ID, 1), TARGET, 1)).toBe("unknown");
    const aged = advance(seen("dry-ground"), 2);
    expect(aged.beliefs[0]?.lastObservedTick).toBe(1);
    expect(residentRestSurfaceKnowledge(aged, TARGET, 2)).toBe("unknown");
    expect(residentRestSurfaceKnowledge(aged, TARGET, 1)).toBeNull();
    expect(residentRestSurfaceKnowledge(aged, TARGET, 3)).toBeNull();
  });

  it("keeps an evicted target unknown instead of treating the bounded belief store as dry", () => {
    const state = seen();
    const contacts = Array.from({ length: ACTOR_BELIEF_CAP + 1 }, (_, index) => observation(2, "stone-sign", {
      id: `surface-capacity-contact:${index}`,
      area: { center: translateWorldPosition(TARGET, index + 1, 0), radiusUnits: 0 },
      confidence: 1_000_000, salience: 1_000_000,
    }));
    const full = advance(state, 2, contacts);
    expect(full.beliefs).toHaveLength(ACTOR_BELIEF_CAP);
    expect(full.beliefs.some(({ sourceObservationId }) => sourceObservationId === observation(1).id)).toBe(false);
    expect(residentRestSurfaceKnowledge(full, TARGET, 2)).toBe("unknown");
    expect(residentRestSurfaceKnowledge(state, TARGET, 1)).toBe("wet");
  });

  it("does not borrow another actor's contact, another target or a forged same-ID locus", () => {
    const state = seen("dry-ground");
    const otherTarget = translateWorldPosition(TARGET, 1_000, 0);
    expect(residentRestSurfaceKnowledge(state, otherTarget, 1)).toBe("unknown");
    // The general perception codec does not authenticate domain-derived IDs.
    // The surface predicate independently rejects this foreign cold binding.
    expect(residentRestSurfaceKnowledge({ ...state, actorId: OTHER_ACTOR_ID }, TARGET, 1)).toBe("unknown");
    expect(isResidentRestSurfaceBelief(OTHER_ACTOR_ID, state.beliefs[0]!)).toBe(false);
    const forged = seen("dry-ground", { area: { center: otherTarget, radiusUnits: 0 } });
    expect(isResidentRestSurfaceBelief(ACTOR_ID, forged.beliefs[0]!)).toBe(false);
    expect(residentRestSurfaceKnowledge(forged, TARGET, 1)).toBe("unknown");
    expect(residentRestSurfaceKnowledge(forged, otherTarget, 1)).toBe("unknown");
  });

  it("accepts only the exact non-interrupting classified visual surface semantics", () => {
    const variants: readonly Partial<ActorObservationInput>[] = [
      { perceivedClass: "slippery-ground" },
      { identification: "anonymous" },
      { area: { center: TARGET, radiusUnits: 1 } },
      { interrupt: "strong" },
      { id: "unrelated-dry-ground-observation" },
      { confidence: 0 },
      { channel: "hearing", identification: "anonymous", area: { center: TARGET, radiusUnits: 250 } },
      { identification: "identified", subjectId: "terrain:invented-identity" },
    ];
    for (const variant of variants) {
      const state = seen("dry-ground", variant);
      expect(residentRestSurfaceKnowledge(state, TARGET, 1), JSON.stringify(variant)).toBe("unknown");
    }
  });

  it("rejects malformed perception rather than interpreting it as absent surface evidence", () => {
    const state = seen();
    const malformed: readonly unknown[] = [null, undefined, [], {},
      { ...state, tick: -1 }, { ...state, extra: true },
      { ...state, beliefs: [{ ...state.beliefs[0]!, lastObservedTick: 2 }] },
      { ...state, beliefs: [{ ...state.beliefs[0]!, key: "contact:vision:wrong" }] },
    ];
    for (const value of malformed) expect(residentRestSurfaceKnowledge(value, TARGET, 1)).toBeNull();
    expect(residentRestSurfaceKnowledge(state, TARGET, 1)).toBe("wet");
  });
});
