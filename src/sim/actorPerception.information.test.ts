import { describe, expect, it } from "vitest";

import { createWorldPosition } from "../game/worldPosition";
import {
  canonicalizeActorObservations, createActorObservation, createActorPerceptionState,
  deserializeActorPerceptionState, serializeActorPerceptionState, stepActorPerception,
  type ActorObservation, type ActorObservationInput, type ActorPerceptionState,
} from "./actorPerception";

const actorId = "human:information-receipt";
function observation(tick: number, overrides: Partial<ActorObservationInput> = {}) {
  const result = createActorObservation({
    id: "surface-information", observerId: actorId, observedAtTick: tick,
    channel: "vision", perceivedClass: "dry-ground", subjectId: null,
    identification: "classified", area: { center: createWorldPosition({ x: 0, y: 0 }, 12_500, 28_500), radiusUnits: 0 },
    confidence: 1_000_000, salience: 300_000, interrupt: "information", ...overrides,
  });
  if (!result) throw new Error("information fixture was not valid");
  return result;
}
function advance(state: ActorPerceptionState, tick: number, observations: readonly ActorObservation[]) {
  const next = stepActorPerception(state, { tick, observations });
  if (!next) throw new Error("information fixture did not advance");
  return next;
}

describe("explicit qualitative visual information admission", () => {
  it("retains a bounded high-confidence fact without adding threat pressure or identity memory", () => {
    const fact = observation(1);
    expect(canonicalizeActorObservations([structuredClone(fact)])).toEqual([fact]);
    const state = advance(createActorPerceptionState(actorId), 1, [fact]);
    expect(state).toMatchObject({ suspicionPressure: 0, suspicion: "unaware", search: null, salientMemory: [] });
    expect(state.beliefs).toHaveLength(1);
    expect(state.beliefs[0]).toMatchObject({ confidence: 1_000_000, salience: 300_000,
      perceivedClass: "dry-ground", subjectId: null, strongInterrupt: false });
    expect(state.attentionKeys).toEqual([state.beliefs[0]!.key]);
    const bytes = serializeActorPerceptionState(state);
    const cold = deserializeActorPerceptionState(bytes);
    expect(cold).not.toBeNull();
    expect(serializeActorPerceptionState(cold)).toBe(bytes);
    expect(advance(cold!, 2, [])).toEqual(advance(state, 2, []));
  });

  it.each(["partial-animal", "identified-predator", "strong-alarm"] as const)("preserves genuine %s pressure and subsequent decay/search exactly", (kind) => {
    const prior = createActorPerceptionState(actorId);
    const signal = observation(1, kind === "strong-alarm" ? {
      id: "actual-alarm", channel: "hearing", perceivedClass: "animal-alarm", identification: "anonymous",
      area: { center: createWorldPosition({ x: 0, y: 0 }, 13_500, 28_500), radiusUnits: 1_000 },
      confidence: 950_000, salience: 980_000, interrupt: "strong",
    } : {
      id: "actual-animal", perceivedClass: kind === "partial-animal" ? "animal-silhouette" : "large-predator",
      identification: kind === "partial-animal" ? "classified" : "identified",
      subjectId: kind === "partial-animal" ? null : "animal:predator",
      confidence: kind === "partial-animal" ? 330_000 : 900_000,
      salience: kind === "partial-animal" ? 380_000 : 860_000, interrupt: "none",
    });
    let alone = advance(prior, 1, [signal]);
    let informed = advance(prior, 1, [signal, observation(1)]);
    for (let tick = 1; tick <= 8; tick += 1) {
      expect(informed.suspicionPressure).toBe(alone.suspicionPressure);
      expect(informed.suspicion).toBe(alone.suspicion);
      expect(informed.search).toEqual(alone.search);
      expect(informed.beliefs.filter(({ sourceObservationId }) => sourceObservationId !== "surface-information")).toEqual(alone.beliefs);
      if (tick < 8) {
        alone = advance(alone, tick + 1, []);
        informed = advance(informed, tick + 1, [observation(tick + 1)]);
      }
    }
    const ordinary = advance(prior, 1, [signal, observation(1, { interrupt: "none" })]);
    if (kind === "partial-animal") expect(ordinary.suspicionPressure).toBeGreaterThan(alone.suspicionPressure);
  });

  it("cannot neutralize heard warnings, scent or identified contacts through this admission flag", () => {
    const valid = observation(1);
    for (const patch of [
      { channel: "hearing", identification: "anonymous", area: { ...valid.area, radiusUnits: 1_000 } },
      { channel: "scent", area: { ...valid.area, radiusUnits: 1_000 } },
      { identification: "identified", subjectId: "animal:predator" },
      { interrupt: "unknown" },
    ]) expect(canonicalizeActorObservations([{ ...valid, ...patch }])).toEqual([]);
  });
});
