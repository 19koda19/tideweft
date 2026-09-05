import { describe, expect, it } from "vitest";

import { createWorldPosition } from "../game/worldPosition";
import {
  ACTOR_ID_MAX_LENGTH,
  ACTOR_ATTENTION_CAP,
  ACTOR_BELIEF_CAP,
  ACTOR_PERCEPTION_VERSION,
  ACTOR_PERCEPTION_SCALE,
  ACTOR_SALIENT_MEMORY_CAP,
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  PRIOR_ACTOR_PERCEPTION_VERSION,
  canonicalizeActorObservations,
  canonicalizeActorPerceptionState,
  createActorObservation,
  createActorPerceptionState,
  deserializeActorPerceptionState,
  queryActorAttention,
  queryActorBelief,
  queryActorSalientMemory,
  queryActorSearch,
  serializeActorPerceptionState,
  stepActorPerception,
  type ActorObservation,
  type ActorObservationInput,
  type ActorPerceptionState,
  type ObservedArea,
} from "./actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord } from "./regions";

const OBSERVER_ID = "human:observer-01";

function level(value: number): number {
  return Math.round(value * ACTOR_PERCEPTION_SCALE);
}

function position(
  regionX = 0,
  regionY = 0,
  localX = 12_000,
  localY = 16_000,
) {
  return createWorldPosition(createRegionCoord(regionX, regionY), localX, localY);
}

function area(
  center = position(),
  radiusUnits = 0,
): ObservedArea {
  return { center, radiusUnits };
}

function observation(overrides: Partial<ActorObservationInput> = {}): ActorObservation {
  const result = createActorObservation({
    id: "obs-001",
    observerId: OBSERVER_ID,
    observedAtTick: 1,
    channel: "vision",
    perceivedClass: "human",
    subjectId: "human:target-01",
    area: area(),
    confidence: level(0.8),
    salience: level(0.7),
    identification: "identified",
    interrupt: "none",
    ...overrides,
  });
  if (result === null) throw new Error("Test observation was invalid");
  return result;
}

function sound(overrides: Partial<ActorObservationInput> = {}): ActorObservation {
  return observation({
    id: "sound-001",
    channel: "hearing",
    perceivedClass: "movement-sound",
    subjectId: null,
    area: area(position(), 2_000),
    confidence: level(0.55),
    salience: level(0.5),
    identification: "anonymous",
    ...overrides,
  });
}

function advance(
  state: ActorPerceptionState,
  tick: number,
  observations: readonly ActorObservation[] = [],
): ActorPerceptionState {
  const result = stepActorPerception(state, { tick, observations });
  if (result === null) throw new Error("Valid actor-perception step failed");
  return result;
}

function expectEveryNumberToBeSafeInteger(value: unknown): void {
  if (typeof value === "number") {
    expect(Number.isSafeInteger(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) expectEveryNumberToBeSafeInteger(entry);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) expectEveryNumberToBeSafeInteger(entry);
  }
}

describe("shared actor observation kernel", () => {
  it("admits the shared lossless regional actor-ID envelope without accepting aliases", () => {
    const maximumId = `D-route/bank:${"x".repeat(ACTOR_ID_MAX_LENGTH - 13)}`;
    expect(maximumId).toHaveLength(ACTOR_ID_MAX_LENGTH);
    expect(createActorPerceptionState(maximumId).actorId).toBe(maximumId);
    expect(() => createActorPerceptionState(`${maximumId}x`)).toThrow(/canonical actor ID/u);
    expect(() => createActorPerceptionState("actor id with spaces")).toThrow(/canonical actor ID/u);
  });

  it("creates a frozen empty state and validates its canonical persisted shape", () => {
    const state = createActorPerceptionState(OBSERVER_ID);

    expect(state).toEqual({
      version: ACTOR_PERCEPTION_VERSION,
      actorId: OBSERVER_ID,
      tick: 0,
      suspicion: "unaware",
      suspicionPressure: 0,
      attentionKeys: [],
      beliefs: [],
      salientMemory: [],
      search: null,
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.beliefs)).toBe(true);
    expect(canonicalizeActorPerceptionState(structuredClone(state))).toEqual(state);
  });

  it("explicitly adopts canonical version-1 cognition without changing its knowledge", () => {
    const current = advance(createActorPerceptionState(OBSERVER_ID), 1, [
      observation(),
      sound(),
    ]);
    const prior = {
      ...structuredClone(current),
      version: PRIOR_ACTOR_PERCEPTION_VERSION,
    };

    expect(canonicalizeActorPerceptionState(prior)).toEqual(current);
    expect(deserializeActorPerceptionState(JSON.stringify(prior))).toEqual(current);
  });

  it("canonicalizes observation and attention order independently of input array order", () => {
    const observations = [
      observation({ id: "obs-c", subjectId: "human:c", salience: level(0.6) }),
      observation({ id: "obs-a", subjectId: "human:a", salience: level(0.8) }),
      observation({ id: "obs-b", subjectId: "human:b", salience: level(0.7) }),
    ];
    const forward = advance(createActorPerceptionState(OBSERVER_ID), 1, observations);
    const reverse = advance(createActorPerceptionState(OBSERVER_ID), 1, [...observations].reverse());

    expect(canonicalizeActorObservations(observations).map((item) => item.id))
      .toEqual(["obs-a", "obs-b", "obs-c"]);
    expect(serializeActorPerceptionState(forward)).toBe(serializeActorPerceptionState(reverse));
    expect(queryActorAttention(forward).map((belief) => belief.subjectId))
      .toEqual(["human:a", "human:b", "human:c"]);
  });

  it("keeps attention, active beliefs, and salient memory strictly bounded", () => {
    const observations = Array.from({ length: 48 }, (_, index) => observation({
      id: `obs-${String(index).padStart(3, "0")}`,
      subjectId: `human:target-${String(index).padStart(3, "0")}`,
      confidence: level(0.8),
      salience: level((index + 1) / 50),
    }));
    const state = advance(createActorPerceptionState(OBSERVER_ID), 1, observations);

    expect(queryActorAttention(state)).toHaveLength(ACTOR_ATTENTION_CAP);
    expect(state.attentionKeys).toHaveLength(ACTOR_ATTENTION_CAP);
    expect(state.beliefs).toHaveLength(ACTOR_BELIEF_CAP);
    expect(queryActorSalientMemory(state)).toHaveLength(ACTOR_SALIENT_MEMORY_CAP);
    expect(queryActorAttention(state).map((belief) => belief.subjectId)).toEqual([
      "human:target-047",
      "human:target-046",
      "human:target-045",
      "human:target-044",
    ]);
  });

  it("keeps routine and strong anonymous sounds from flooding salient memory", () => {
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [observation({
      id: "meaningful-sighting",
      salience: level(0.6),
    })]);

    for (let tick = 2; tick <= 25; tick += 1) {
      state = advance(state, tick, [sound({
        id: `ordinary-footstep-${tick}`,
        observedAtTick: tick,
        confidence: level(0.96),
        salience: level(0.96),
      })]);
    }
    state = advance(state, 26, [sound({
      id: "strong-anonymous-impact",
      observedAtTick: 26,
      confidence: level(1),
      salience: level(1),
      interrupt: "strong",
    })]);

    expect(queryActorSalientMemory(state)).toEqual([
      expect.objectContaining({
        observationId: "meaningful-sighting",
        subjectId: "human:target-01",
      }),
    ]);
    expect(state.beliefs.some((belief) => (
      belief.perceivedClass === "movement-sound" && belief.subjectId === null
    ))).toBe(true);
  });

  it("replaces repeated sightings of one identified actor with one fresh memory", () => {
    let state = createActorPerceptionState(OBSERVER_ID);
    for (let tick = 1; tick <= 20; tick += 1) {
      state = advance(state, tick, [observation({
        id: `player-sighting-${String(tick).padStart(2, "0")}`,
        observedAtTick: tick,
        area: area(position(0, 0, 12_000 + tick, 16_000)),
      })]);
    }

    expect(queryActorSalientMemory(state)).toEqual([
      expect.objectContaining({
        observationId: "player-sighting-20",
        beliefKey: "subject:human:target-01",
        observedAtTick: 20,
        area: area(position(0, 0, 12_020, 16_000)),
      }),
    ]);
  });

  it("rejects persisted anonymous or merely classified entries in salient memory", () => {
    const identified = advance(createActorPerceptionState(OBSERVER_ID), 1, [observation()]);
    const anonymousHearing = structuredClone(identified) as unknown as {
      salientMemory: Array<Record<string, unknown>>;
    };
    const heard = anonymousHearing.salientMemory[0];
    if (!heard) throw new Error("fixture needs salient memory");
    heard.channel = "hearing";
    heard.subjectId = null;
    heard.beliefKey = `contact:hearing:${String(heard.observationId)}`;
    heard.area = area(position(), MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS);

    const classifiedVisual = structuredClone(identified) as unknown as {
      salientMemory: Array<Record<string, unknown>>;
    };
    const silhouette = classifiedVisual.salientMemory[0];
    if (!silhouette) throw new Error("fixture needs salient memory");
    silhouette.subjectId = null;
    silhouette.beliefKey = `contact:vision:${String(silhouette.observationId)}`;

    expect(canonicalizeActorPerceptionState(anonymousHearing)).toBeNull();
    expect(canonicalizeActorPerceptionState(classifiedVisual)).toBeNull();
  });

  it("lets weak repeated signals decay instead of stun-locking suspicion", () => {
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [sound({
      confidence: level(0.7),
      salience: level(0.65),
    })]);
    expect(state.suspicion).toBe("suspicious");

    for (let tick = 2; tick <= 12; tick += 1) {
      state = advance(state, tick, [sound({
        id: `weak-${tick}`,
        observedAtTick: tick,
        confidence: level(0.02),
        salience: level(0.02),
      })]);
    }

    expect(state.suspicion).toBe("unaware");
    expect(state.suspicionPressure).toBe(0);
  });

  it("identifies only a directly observed subject and ages its last-known area", () => {
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [observation()]);

    expect(state.suspicion).toBe("identified");
    const key = state.attentionKeys[0];
    expect(key).toBe("subject:human:target-01");
    expect(queryActorBelief(state, key)).toMatchObject({
      subjectId: "human:target-01",
      identification: "identified",
      ageTicks: 0,
      area: area(),
    });

    state = advance(state, 2);
    expect(queryActorBelief(state, key)).toMatchObject({ ageTicks: 1 });
  });

  it("makes F0 heard contacts anonymous and spatially uncertain by construction", () => {
    expect(createActorObservation({
      ...sound(),
      subjectId: "human:hidden-source",
    })).toBeNull();
    expect(createActorObservation({
      ...sound(),
      area: area(position(), 0),
    })).toBeNull();

    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [sound({
      interrupt: "strong",
    })]);
    const contact = queryActorAttention(state)[0];
    expect(contact).toMatchObject({
      channel: "hearing",
      subjectId: null,
      identification: "anonymous",
    });
    expect(contact?.area.radiusUnits).toBeGreaterThanOrEqual(
      MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
    );
    expect(state.suspicion).toBe("alert");

    state = advance(state, 2);
    expect(state.search).toBeNull();
    expect(queryActorSearch(state)).toBeNull();
  });

  it("searches a saved last-known belief, gives up deterministically, and reacquires lawfully", () => {
    const lastSeen = area(position(-9, 12, 95_500, 70_500), 0);
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [observation({
      area: lastSeen,
    })]);
    state = advance(state, 2);

    expect(state.suspicion).toBe("searching");
    const initialSearch = queryActorSearch(state);
    expect(initialSearch).toMatchObject({
      subjectId: "human:target-01",
      lastKnownArea: lastSeen,
      ageTicks: 1,
      searchRadiusUnits: 0,
      nextProbe: lastSeen.center,
    });

    // An anonymous sound cannot be promoted into knowledge of the missing ID.
    state = advance(state, 3, [sound({ id: "possible-footstep", observedAtTick: 3 })]);
    expect(state.suspicion).toBe("searching");
    expect(queryActorSearch(state)?.subjectId).toBe("human:target-01");
    expect(queryActorSearch(state)?.searchRadiusUnits).toBeGreaterThan(0);

    state = advance(state, 4, [observation({
      id: "reacquired",
      observedAtTick: 4,
      area: area(position(-9, 12, 95_200, 70_200), 0),
    })]);
    expect(state.suspicion).toBe("identified");
    expect(queryActorSearch(state)).toBeNull();

    state = advance(state, 5);
    const secondSearch = queryActorSearch(state);
    expect(secondSearch).not.toBeNull();
    const expiresAtTick = state.search?.expiresAtTick;
    expect(expiresAtTick).toBeTypeOf("number");
    state = advance(state, expiresAtTick as number);
    expect(state.search).toBeNull();
    expect(state.suspicion).toBe("unaware");
  });

  it("allows a strong interrupt to preempt search without inventing source knowledge", () => {
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [observation()]);
    state = advance(state, 2);
    expect(state.suspicion).toBe("searching");

    state = advance(state, 3, [sound({
      id: "rockfall",
      observedAtTick: 3,
      perceivedClass: "rockfall-sound",
      interrupt: "strong",
    })]);

    expect(state.suspicion).toBe("alert");
    expect(state.search).toBeNull();
    expect(queryActorAttention(state)[0]).toMatchObject({
      perceivedClass: "rockfall-sound",
      subjectId: null,
    });
  });

  it("does not let an ordinary louder anonymous contact erase an attended identified target", () => {
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [
      observation({
        id: "seen-player",
        confidence: level(0.7),
        salience: level(0.65),
      }),
      sound({
        id: "louder-ordinary-sound",
        confidence: level(0.96),
        salience: level(0.96),
      }),
    ]);

    expect(state.suspicion).toBe("identified");
    expect(queryActorAttention(state)[0]).toMatchObject({
      subjectId: null,
      perceivedClass: "movement-sound",
    });
    expect(queryActorAttention(state).some((belief) => (
      belief.subjectId === "human:target-01"
    ))).toBe(true);

    state = advance(state, 2);

    expect(state.suspicion).toBe("searching");
    expect(queryActorSearch(state)).toMatchObject({
      subjectId: "human:target-01",
      lastKnownArea: area(),
    });
  });

  it("round-trips one canonical save byte-for-byte during an active search", () => {
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [observation()]);
    state = advance(state, 2);
    state = advance(state, 3);
    const serialized = serializeActorPerceptionState(state);
    const restored = deserializeActorPerceptionState(serialized);

    expect(serialized).not.toBeNull();
    expect(restored).toEqual(state);
    expect(serializeActorPerceptionState(restored)).toBe(serialized);
    expect(queryActorSearch(restored)).toEqual(queryActorSearch(state));
    expectEveryNumberToBeSafeInteger(restored);
  });

  it("rejects forged search duration, probe history, and last-known coordinates", () => {
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [observation()]);
    state = advance(state, 2);
    if (state.search === null) throw new Error("fixture did not enter search");

    expect(canonicalizeActorPerceptionState({
      ...state,
      search: {
        ...state.search,
        expiresAtTick: state.search.expiresAtTick + 1,
      },
    })).toBeNull();
    expect(canonicalizeActorPerceptionState({
      ...state,
      search: {
        ...state.search,
        probeOrdinal: 1,
      },
    })).toBeNull();
    expect(canonicalizeActorPerceptionState({
      ...state,
      search: {
        ...state.search,
        lastKnownArea: area(position(0, 0, 13_000, 16_000)),
      },
    })).toBeNull();
  });

  it("preserves negative and extreme segmented W1 coordinates without flattening them", () => {
    const extreme = position(
      -REGION_COORD_LIMIT,
      REGION_COORD_LIMIT,
      0,
      71_999,
    );
    let state = advance(createActorPerceptionState(OBSERVER_ID), 1, [observation({
      area: area(extreme, 1_500),
    })]);
    state = advance(state, 2);
    state = advance(state, 3);

    expect(queryActorSearch(state)?.lastKnownArea.center).toEqual(extreme);
    expect(queryActorSearch(state)?.nextProbe.region.x).toBeGreaterThanOrEqual(
      -REGION_COORD_LIMIT,
    );
    expect(queryActorSearch(state)?.nextProbe.region.y).toBeLessThanOrEqual(
      REGION_COORD_LIMIT,
    );
    expect(deserializeActorPerceptionState(serializeActorPerceptionState(state)))
      .toEqual(state);
  });

  it("fails closed on unsupported channels, collisions, malformed state, and bad steps", () => {
    const valid = observation();
    const reservedFutureChannel = createActorObservation({
      ...valid,
      channel: "touch",
    });
    expect(reservedFutureChannel).toBeNull();
    expect(createActorObservation({ ...valid, confidence: 0.5 })).toBeNull();

    const collision = observation({ id: valid.id, confidence: level(0.2) });
    expect(canonicalizeActorObservations([valid, collision])).toEqual([]);
    expect(canonicalizeActorObservations([valid, { ...valid, confidence: Number.NaN }]))
      .toEqual([]);

    const state = advance(createActorPerceptionState(OBSERVER_ID), 1, [valid]);
    const before = serializeActorPerceptionState(state);
    expect(stepActorPerception(state, {
      tick: 2,
      observations: [observation({
        id: "wrong-observer",
        observerId: "human:somebody-else",
        observedAtTick: 2,
      })],
    })).toEqual(state);
    expect(serializeActorPerceptionState(stepActorPerception(state, {
      tick: 2,
      observations: [{ ...valid, observedAtTick: 2, extra: true }],
    }))).toBe(before);

    expect(canonicalizeActorPerceptionState({ ...state, extra: true })).toBeNull();
    expect(deserializeActorPerceptionState("{not-json")).toBeNull();
    expect(deserializeActorPerceptionState(JSON.stringify({
      ...state,
      suspicionPressure: Number.POSITIVE_INFINITY,
    }))).toBeNull();
  });
});
