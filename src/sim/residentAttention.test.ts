import { describe, expect, it } from "vitest";

import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "../game/livingSpeciesRegistry";
import { createWorldPosition } from "../game/worldPosition";
import {
  createActorObservation,
  createActorPerceptionState,
  deserializeActorPerceptionState,
  queryActorAttention,
  queryActorSearch,
  serializeActorPerceptionState,
  stepActorPerception,
  type ActorObservation,
  type ActorObservationInput,
  type ActorPerceptionState,
} from "./actorPerception";
import { createRegionCoord } from "./regions";
import { RESIDENT_NEUTRAL_GLANCE_TICKS, queryResidentAttentionState } from "./residentAttention";

const OBSERVER_ID = "human:resident-attention-test";

function sighting(tick: number, overrides: Partial<ActorObservationInput> = {}): ActorObservation {
  const observation = createActorObservation({
    id: `courier-sighting-${tick}`,
    observerId: OBSERVER_ID,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "human",
    subjectId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    area: { center: createWorldPosition(createRegionCoord(0, 0), 12_000 + tick, 16_000), radiusUnits: 0 },
    confidence: 850_000,
    salience: 700_000,
    identification: "identified",
    interrupt: "none",
    ...overrides,
  });
  if (observation === null) throw new Error("Resident attention fixture observation is invalid");
  return observation;
}

function anonymousSound(tick: number, strong = false): ActorObservation {
  return sighting(tick, {
    id: `uncertain-sound-${tick}`,
    channel: "hearing",
    perceivedClass: "movement-sound",
    subjectId: null,
    area: { center: createWorldPosition(createRegionCoord(0, 0), 18_000, 16_000), radiusUnits: 2_000 },
    confidence: strong ? 950_000 : 700_000,
    salience: strong ? 980_000 : 650_000,
    identification: "anonymous",
    interrupt: strong ? "strong" : "none",
  });
}

function advance(
  state: ActorPerceptionState,
  tick: number,
  observations: readonly ActorObservation[] = [],
): ActorPerceptionState {
  const next = stepActorPerception(state, { tick, observations });
  if (next === null) throw new Error("Resident attention fixture step is invalid");
  return next;
}

describe("resident appraisal of shared perception", () => {
  it("ends the brief neutral courier glance despite repeated fresh visible recognition", () => {
    let state = createActorPerceptionState(OBSERVER_ID);
    const firstObservedTick = 1;
    for (let tick = firstObservedTick; tick <= 8; tick += 1) {
      state = advance(state, tick, [sighting(tick)]);
      const before = serializeActorPerceptionState(state);

      expect(state.suspicion).toBe("identified");
      expect(queryResidentAttentionState(state)).toBe(
        tick - firstObservedTick < RESIDENT_NEUTRAL_GLANCE_TICKS ? "glance" : "none",
      );
      expect(queryActorAttention(state)[0]).toMatchObject({
        subjectId: LOCAL_PLAYER_LIVING_ACTOR_ID,
        identification: "identified",
        firstObservedTick,
        lastObservedTick: tick,
      });
      expect(serializeActorPerceptionState(state)).toBe(before);
    }
  });

  it("keeps the exact saved recognition clock through clone and reload without renewing the glance", () => {
    let uninterrupted = createActorPerceptionState(OBSERVER_ID);
    let restored = createActorPerceptionState(OBSERVER_ID);
    for (let tick = 1; tick <= 6; tick += 1) {
      const observations = [sighting(tick)];
      uninterrupted = advance(uninterrupted, tick, observations);
      restored = advance(restored, tick, observations);
      const bytes = serializeActorPerceptionState(restored);
      const reloaded = deserializeActorPerceptionState(bytes);
      if (reloaded === null) throw new Error("Resident appraisal fixture did not reload");

      expect(queryResidentAttentionState(structuredClone(restored)))
        .toBe(queryResidentAttentionState(uninterrupted));
      expect(queryResidentAttentionState(reloaded)).toBe(queryResidentAttentionState(uninterrupted));
      expect(serializeActorPerceptionState(reloaded)).toBe(serializeActorPerceptionState(uninterrupted));
      expect(reloaded.beliefs[0]?.firstObservedTick).toBe(1);
      restored = reloaded;
    }
    expect(queryResidentAttentionState(restored)).toBe("none");
    expect(restored.suspicion).toBe("identified");
  });

  it("does not turn a saved lost neutral courier search into work or restart the glance on reacquisition", () => {
    const seen = advance(createActorPerceptionState(OBSERVER_ID), 1, [sighting(1)]);
    const lost = advance(seen, 2);
    const before = serializeActorPerceptionState(lost);
    const search = queryActorSearch(lost);

    expect(lost.suspicion).toBe("searching");
    expect(search).toMatchObject({ subjectId: LOCAL_PLAYER_LIVING_ACTOR_ID, ageTicks: 1 });
    expect(queryResidentAttentionState(lost)).toBe("none");
    expect(queryActorSearch(lost)).toEqual(search);
    expect(serializeActorPerceptionState(lost)).toBe(before);

    const regained = advance(lost, 3, [sighting(3)]);
    expect(regained.suspicion).toBe("identified");
    expect(regained.search).toBeNull();
    expect(regained.beliefs[0]?.firstObservedTick).toBe(1);
    expect(queryResidentAttentionState(regained)).toBe("none");
  });

  it("retains meaningful anonymous uncertainty and fresh strong signals without inventing identity", () => {
    const uncertain = advance(createActorPerceptionState(OBSERVER_ID), 1, [anonymousSound(1)]);
    expect(uncertain.suspicion).toBe("suspicious");
    expect(queryResidentAttentionState(uncertain)).toBe(uncertain.suspicion);
    expect(queryActorAttention(uncertain)[0]).toMatchObject({
      channel: "hearing",
      subjectId: null,
      identification: "anonymous",
      area: { radiusUnits: 2_000 },
    });

    let neutral = createActorPerceptionState(OBSERVER_ID);
    for (let tick = 1; tick <= 3; tick += 1) neutral = advance(neutral, tick, [sighting(tick)]);
    expect(queryResidentAttentionState(neutral)).toBe("none");
    const interrupted = advance(neutral, 4, [sighting(4), anonymousSound(4, true)]);
    const before = serializeActorPerceptionState(interrupted);
    expect(interrupted.suspicion).toBe("alert");
    expect(queryResidentAttentionState(interrupted)).toBe("alert");
    expect(queryActorAttention(interrupted)[0]).toMatchObject({
      channel: "hearing", subjectId: null, strongInterrupt: true,
    });
    expect(serializeActorPerceptionState(interrupted)).toBe(before);

    const strongVisual = advance(neutral, 4, [sighting(4, { interrupt: "strong" })]);
    expect(queryResidentAttentionState(strongVisual)).toBe("alert");
  });

  it("gives another neutrally recognized human the same bounded glance rather than watch duty", () => {
    let state = createActorPerceptionState(OBSERVER_ID);
    for (let tick = 1; tick <= 5; tick += 1) {
      state = advance(state, tick, [sighting(tick, { subjectId: "human:other-resident" })]);
      expect(state.suspicion).toBe("identified");
      expect(queryResidentAttentionState(state)).toBe(tick <= RESIDENT_NEUTRAL_GLANCE_TICKS ? "glance" : "none");
    }
    expect(queryResidentAttentionState(advance(state, 6))).toBe("none");
  });

  it("retains identified nonhuman attention and its lawful lost-contact search", () => {
    let state = createActorPerceptionState(OBSERVER_ID);
    for (let tick = 1; tick <= 5; tick += 1) {
      state = advance(state, tick, [sighting(tick, {
        perceivedClass: "large-predator", subjectId: "animal:large-predator",
      })]);
      expect(state.suspicion).toBe("identified");
      expect(queryResidentAttentionState(state)).toBe("identified");
    }
    const lost = advance(state, 6);
    expect(lost.suspicion).toBe("searching");
    expect(queryActorSearch(lost)?.subjectId).toBe("animal:large-predator");
    expect(queryResidentAttentionState(lost)).toBe("searching");
  });

  it("does not make a neutrally recognized domestic dog permanent human watch duty", () => {
    let state = createActorPerceptionState(OBSERVER_ID);
    for (let tick = 1; tick <= 5; tick += 1) {
      state = advance(state, tick, [sighting(tick, {
        perceivedClass: "domestic-dog", subjectId: "dog:recognized-nearby",
      })]);
      const before = serializeActorPerceptionState(state);
      expect(state.suspicion).toBe("identified");
      expect(queryResidentAttentionState(state)).toBe(tick <= RESIDENT_NEUTRAL_GLANCE_TICKS ? "glance" : "none");
      expect(queryActorAttention(state)[0]?.subjectId).toBe("dog:recognized-nearby");
      expect(serializeActorPerceptionState(state)).toBe(before);
    }
    const lost = advance(state, 6);
    expect(lost.suspicion).toBe("searching");
    expect(queryActorSearch(lost)?.subjectId).toBe("dog:recognized-nearby");
    expect(queryResidentAttentionState(deserializeActorPerceptionState(serializeActorPerceptionState(lost))))
      .toBe("none");
    const reacquired = advance(lost, 7, [sighting(7, {
      perceivedClass: "domestic-dog", subjectId: "dog:recognized-nearby",
    })]);
    expect(queryResidentAttentionState(reacquired)).toBe("none");
    expect(queryActorAttention(reacquired)[0]?.firstObservedTick).toBe(1);
    const alarming = advance(state, 6, [sighting(6, {
      perceivedClass: "domestic-dog", subjectId: "dog:recognized-nearby", interrupt: "strong",
    })]);
    expect(queryResidentAttentionState(alarming)).toBe("alert");
    expect(queryResidentAttentionState(advance(state, 6, [anonymousSound(6, true)]))).toBe("alert");
    const uncertain = advance(createActorPerceptionState(OBSERVER_ID, 5), 6, [sighting(6, {
      perceivedClass: "animal-silhouette", subjectId: null, identification: "anonymous",
    })]);
    expect(queryResidentAttentionState(uncertain)).toBe(uncertain.suspicion);
  });

  it("keeps identified finite food as task knowledge rather than permanent watch or lost-source duty", () => {
    let state = createActorPerceptionState(OBSERVER_ID);
    for (let tick = 1; tick <= 3; tick += 1) {
      state = advance(state, tick, [sighting(tick, {
        perceivedClass: "exposed-food", subjectId: "STORE-FOOD-finite-lot",
      })]);
      const before = serializeActorPerceptionState(state);
      expect(state.suspicion).toBe("identified");
      expect(queryResidentAttentionState(state)).toBe("none");
      expect(queryActorAttention(state)[0]?.subjectId).toBe("STORE-FOOD-finite-lot");
      expect(serializeActorPerceptionState(state)).toBe(before);
    }
    const lost = advance(state, 4);
    expect(lost.suspicion).toBe("searching");
    expect(queryActorSearch(lost)?.subjectId).toBe("STORE-FOOD-finite-lot");
    expect(queryResidentAttentionState(deserializeActorPerceptionState(serializeActorPerceptionState(lost))))
      .toBe("none");
    const strong = advance(state, 4, [sighting(4, {
      perceivedClass: "exposed-food", subjectId: "STORE-FOOD-finite-lot", interrupt: "strong",
    })]);
    expect(queryResidentAttentionState(strong)).toBe("alert");
  });

  it("keeps a more salient anonymous contact alongside recognized neutral sight as meaningful attention", () => {
    const state = advance(createActorPerceptionState(OBSERVER_ID), 1, [
      sighting(1),
      sighting(1, {
        ...anonymousSound(1), id: "salient-anonymous-contact", confidence: 960_000, salience: 960_000,
      }),
    ]);
    expect(state.suspicion).toBe("identified");
    expect(queryActorAttention(state)[0]?.subjectId).toBeNull();
    expect(queryResidentAttentionState(state)).toBe("identified");
  });

  it("fails malformed saved perception closed rather than treating it as harmless", () => {
    const valid = advance(createActorPerceptionState(OBSERVER_ID), 1, [sighting(1)]);
    const impossibleBelief = structuredClone(valid) as unknown as { beliefs: Array<{ firstObservedTick: number }> };
    impossibleBelief.beliefs[0]!.firstObservedTick = 2;
    const nonexistentSearch = { ...valid, search: { beliefKey: "subject:missing" } };
    for (const malformed of [null, undefined, [], {}, { ...valid, tick: -1 }, impossibleBelief, nonexistentSearch]) {
      expect(queryResidentAttentionState(malformed)).toBeNull();
    }
    expect(queryResidentAttentionState(createActorPerceptionState(OBSERVER_ID))).toBe("unaware");
  });
});
