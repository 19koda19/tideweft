import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  createActorPerceptionState,
  type ActorObservation,
} from "./actorPerception";
import { createWorld, stepWorld, type ResidentPerceptionFrame } from "./engine";
import type { ResidentState, WorldState } from "./types";

function firstResident(world: WorldState): ResidentState {
  const resident = world.residents[0];
  if (!resident) throw new Error("fixture has no resident");
  return resident;
}

function playerObservation(
  resident: ResidentState,
  tick: number,
  suffix = "visible",
) {
  const observation = createActorObservation({
    id: `test:${resident.id}:${tick}:${suffix}`,
    observerId: resident.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "human",
    subjectId: "player:local",
    area: {
      center: { region: { x: 0, y: 0 }, localX: 12_500, localY: 18_500 },
      radiusUnits: 0,
    },
    confidence: 900_000,
    salience: 840_000,
    identification: "identified",
  });
  if (!observation) throw new Error("fixture observation is invalid");
  return observation;
}

function completeFrameFor(
  world: WorldState,
  resident: ResidentState,
  tick: number,
  observations = [playerObservation(resident, tick)],
): ResidentPerceptionFrame {
  return {
    tick,
    residents: world.residents.map((candidate) => ({
      residentId: candidate.id,
      actorId: candidate.identity.stableId,
      observations: candidate.id === resident.id ? observations : [],
    })),
  };
}

function anonymousSound(
  resident: ResidentState,
  tick: number,
): ActorObservation {
  const observation = createActorObservation({
    id: `test:${resident.id}:${tick}:sound`,
    observerId: resident.identity.stableId,
    observedAtTick: tick,
    channel: "hearing",
    perceivedClass: "footstep-sound",
    subjectId: null,
    area: {
      center: { region: { x: 0, y: 0 }, localX: 12_500, localY: 18_500 },
      radiusUnits: 2_000,
    },
    confidence: 620_000,
    salience: 540_000,
    identification: "anonymous",
  });
  if (!observation) throw new Error("fixture sound is invalid");
  return observation;
}

describe("resident perception world-tick bridge", () => {
  it("admits only resident-local observations and advances everyone once", () => {
    const world = createWorld("resident perception frame");
    const watched = firstResident(world);
    const unwatched = world.residents[1];
    if (!unwatched) throw new Error("fixture has no second resident");

    stepWorld(world, [], completeFrameFor(world, watched, 1));

    expect(watched.perception.tick).toBe(1);
    expect(watched.perception.suspicion).toBe("identified");
    expect(watched.perception.beliefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ subjectId: "player:local", lastObservedTick: 1 }),
    ]));
    expect(unwatched.perception.tick).toBe(1);
    expect(unwatched.perception.suspicion).toBe("unaware");
  });

  it("searches saved last-known information, lawfully reacquires, and later gives up", () => {
    const world = createWorld("resident search lifecycle");
    const resident = firstResident(world);
    stepWorld(world, [], completeFrameFor(world, resident, 1));

    stepWorld(world);
    expect(resident.perception.suspicion).toBe("searching");
    expect(resident.perception.search?.lastKnownArea.center).toEqual({
      region: { x: 0, y: 0 },
      localX: 12_500,
      localY: 18_500,
    });

    // Hearing something near the last-known area is not lawful identity
    // reacquisition; the resident still knows only an anonymous contact.
    stepWorld(world, [], completeFrameFor(world, resident, 3, [anonymousSound(resident, 3)]));
    expect(resident.perception.suspicion).toBe("searching");
    expect(resident.perception.search?.subjectId).toBe("player:local");

    stepWorld(world, [], completeFrameFor(world, resident, 4, [playerObservation(resident, 4, "again")]));
    expect(resident.perception.suspicion).toBe("identified");
    expect(resident.perception.search).toBeNull();

    stepWorld(world);
    expect(resident.perception.suspicion).toBe("searching");
    for (let count = 0; count < 32 && resident.perception.suspicion === "searching"; count += 1) {
      stepWorld(world);
    }
    expect(resident.perception.suspicion).not.toBe("searching");
    expect(resident.perception.suspicion).not.toBe("identified");
    expect(resident.perception.suspicionPressure).toBeLessThan(ACTOR_PERCEPTION_SCALE);
  });

  it("rejects a malformed frame as a whole instead of admitting a forged subset", () => {
    const world = createWorld("closed resident perception frame");
    const resident = firstResident(world);
    const valid = playerObservation(resident, 1);
    const malformed = {
      ...completeFrameFor(world, resident, 1, [valid]),
      residents: [
        ...completeFrameFor(world, resident, 1, [valid]).residents,
        {
          residentId: Number.MAX_SAFE_INTEGER,
          actorId: "forged:observer",
          observations: [valid],
        },
      ],
    } as unknown as ResidentPerceptionFrame;

    stepWorld(world, [], malformed);

    expect(resident.perception.tick).toBe(1);
    expect(resident.perception.suspicion).toBe("unaware");
    expect(resident.perception.beliefs).toEqual([]);
  });

  it("rejects a valid-looking partial roster instead of selectively teaching one resident", () => {
    const world = createWorld("partial resident perception frame");
    const resident = firstResident(world);

    stepWorld(world, [], {
      tick: 1,
      residents: [{
        residentId: resident.id,
        actorId: resident.identity.stableId,
        observations: [playerObservation(resident, 1)],
      }],
    });

    expect(world.residents.every((candidate) => candidate.perception.tick === 1)).toBe(true);
    expect(resident.perception.suspicion).toBe("unaware");
    expect(resident.perception.beliefs).toEqual([]);
  });

  it("rejects every entry when one lawful resident carries a malformed observation", () => {
    const world = createWorld("atomic malformed observation frame");
    const first = world.residents[0];
    const second = world.residents[1];
    if (!first || !second) throw new Error("fixture lacks residents");
    const malformedSound = {
      ...anonymousSound(second, 1),
      subjectId: "player:local",
    } as unknown as ActorObservation;

    const frame = completeFrameFor(world, first, 1);
    stepWorld(world, [], {
      tick: 1,
      residents: frame.residents.map((entry) => entry.residentId === second.id
        ? {
            residentId: second.id,
            actorId: second.identity.stableId,
            observations: [malformedSound],
          }
        : entry),
    });

    expect(first.perception.suspicion).toBe("unaware");
    expect(first.perception.beliefs).toEqual([]);
    expect(second.perception.suspicion).toBe("unaware");
    expect(second.perception.beliefs).toEqual([]);
  });

  it("rejects raw player state instead of admitting it beside observations", () => {
    const world = createWorld("no raw player state");
    const resident = firstResident(world);
    const leaked = {
      ...completeFrameFor(world, resident, 1),
      playerPosition: {
        region: { x: 0, y: 0 },
        localX: 12_500,
        localY: 18_500,
      },
    } as unknown as ResidentPerceptionFrame;

    stepWorld(world, [], leaked);

    expect(resident.perception.tick).toBe(1);
    expect(resident.perception.suspicion).toBe("unaware");
    expect(resident.perception.beliefs).toEqual([]);
  });

  it("refuses a double/ahead cognition tick before mutating another resident", () => {
    const world = createWorld("one cognition step per tick");
    const first = world.residents[0];
    const second = world.residents[1];
    if (!first || !second) throw new Error("fixture lacks residents");
    second.perception = createActorPerceptionState(second.identity.stableId, 1);

    expect(() => stepWorld(world)).toThrow(/unsynchronized perception state/u);
    expect(first.perception.tick).toBe(0);
    expect(second.perception.tick).toBe(1);
    expect(world.meta.completedTick).toBe(0);
  });

  it("is independent of frame entry order", () => {
    const left = createWorld("perception ordering");
    const right = createWorld("perception ordering");
    const leftResidents = left.residents.slice(0, 2);
    const rightResidents = right.residents.slice(0, 2);
    if (leftResidents.length !== 2 || rightResidents.length !== 2) {
      throw new Error("fixture lacks residents");
    }
    const entries = left.residents.map((resident) => ({
      residentId: resident.id,
      actorId: resident.identity.stableId,
      observations: leftResidents.some((candidate) => candidate.id === resident.id)
        ? [playerObservation(resident, 1)]
        : [],
    }));
    const mirroredEntries = right.residents.map((resident) => ({
      residentId: resident.id,
      actorId: resident.identity.stableId,
      observations: rightResidents.some((candidate) => candidate.id === resident.id)
        ? [playerObservation(resident, 1)]
        : [],
    })).reverse();

    stepWorld(left, [], { tick: 1, residents: entries });
    stepWorld(right, [], { tick: 1, residents: mirroredEntries });

    expect(right).toEqual(left);
  });
});
