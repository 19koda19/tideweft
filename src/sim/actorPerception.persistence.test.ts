import { describe, expect, it } from "vitest";

import { createWorldPosition } from "../game/worldPosition";
import {
  ACTOR_ATTENTION_CAP,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
  type ActorPerceptionState,
} from "./actorPerception";
import { runTicks } from "./engine";
import { assertWorldInvariants } from "./invariants";
import { deserializeWorld, hashWorld, serializeWorld } from "./persistence";
import {
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  type ResidentState,
  type WorldState,
} from "./types";
import { hashCanonical } from "./util";
import { createWorldView } from "./view";
import { createInitialWorld } from "./world";

function priorSim5Save(world: WorldState): string {
  const prior = structuredClone(world) as unknown as Record<string, unknown>;
  const meta = prior.meta as Record<string, unknown>;
  meta.saveFormatVersion = 3;
  meta.rulesVersion = "tideweft-sim/5";
  const residents = prior.residents as Array<Record<string, unknown>>;
  for (const resident of residents) delete resident.perception;
  return JSON.stringify({
    format: "tideweft-world",
    saveFormatVersion: 3,
    rulesVersion: "tideweft-sim/5",
    checksum: hashCanonical(prior),
    world: prior,
  });
}

function currentEnvelope(world: unknown): string {
  return JSON.stringify({
    format: "tideweft-world",
    saveFormatVersion: SAVE_FORMAT_VERSION,
    rulesVersion: RULES_VERSION,
    checksum: hashCanonical(world),
    world,
  });
}

function requireResident(world: WorldState, index = 0): ResidentState {
  const resident = world.residents[index];
  if (resident === undefined) throw new Error(`fixture resident ${index} is missing`);
  return resident;
}

function observedState(world: WorldState): ActorPerceptionState {
  if (world.meta.completedTick < 1) runTicks(world, 1);
  const observer = requireResident(world);
  const firstSubject = requireResident(world, 1);
  const secondSubject = requireResident(world, 2);
  const center = createWorldPosition({ x: 0, y: 0 }, 12_000, 8_000);
  const observations = [
    createActorObservation({
      id: "vision-contact-one",
      observerId: observer.identity.stableId,
      observedAtTick: world.meta.completedTick,
      channel: "vision",
      perceivedClass: "human",
      subjectId: firstSubject.identity.stableId,
      area: { center, radiusUnits: 0 },
      confidence: 820_000,
      salience: 910_000,
      identification: "identified",
    }),
    createActorObservation({
      id: "vision-contact-two",
      observerId: observer.identity.stableId,
      observedAtTick: world.meta.completedTick,
      channel: "vision",
      perceivedClass: "human",
      subjectId: secondSubject.identity.stableId,
      area: { center, radiusUnits: 0 },
      confidence: 730_000,
      salience: 760_000,
      identification: "identified",
    }),
  ];
  if (observations.some((observation) => observation === null)) {
    throw new Error("fixture observations must be canonical");
  }
  // Engine ticks keep every resident cognition clock current. Build this
  // explicit nonempty fixture from the immediately prior canonical tick so
  // the observation is new while the resulting state remains world-coherent.
  const state = stepActorPerception(createActorPerceptionState(
    observer.identity.stableId,
    world.meta.completedTick - 1,
  ), {
    tick: world.meta.completedTick,
    observations,
  });
  if (state === null) throw new Error("fixture perception step was rejected");
  return state;
}

describe("resident actor-perception persistence", () => {
  it("links every new resident's honest initial state to their stable actor identity", () => {
    const world = createInitialWorld("every person begins without invented knowledge", "standard");

    expect(world.meta).toMatchObject({
      saveFormatVersion: 4,
      rulesVersion: "tideweft-sim/6",
      completedTick: 0,
    });
    expect(world.residents).toHaveLength(42);
    expect(world.residents.every((resident) => (
      resident.perception.actorId === resident.identity.stableId
      && resident.perception.tick === 0
      && resident.perception.suspicion === "unaware"
      && resident.perception.beliefs.length === 0
      && resident.perception.attentionKeys.length === 0
      && resident.perception.salientMemory.length === 0
      && resident.perception.search === null
    ))).toBe(true);
    expect(new Set(world.residents.map(({ perception }) => perception.actorId)).size).toBe(42);
    expect(() => assertWorldInvariants(world)).not.toThrow();
  });

  it("migrates authenticated format-3/rules-5 worlds at their prior completed tick without rerolling", () => {
    const source = createInitialWorld("old people wake with honest unknowns", "standard");
    runTicks(source, 37);
    const priorText = priorSim5Save(source);
    const first = deserializeWorld(priorText);
    const second = deserializeWorld(priorText);

    expect(first.meta).toMatchObject({
      completedTick: 37,
      saveFormatVersion: SAVE_FORMAT_VERSION,
      rulesVersion: RULES_VERSION,
    });
    for (const resident of first.residents) {
      expect(resident.perception).toEqual(
        createActorPerceptionState(resident.identity.stableId, 37),
      );
    }
    expect(second).toEqual(first);
    expect(hashWorld(second)).toBe(hashWorld(first));
    expect(serializeWorld(second)).toBe(serializeWorld(first));
    expect(() => assertWorldInvariants(first)).not.toThrow();
  });

  it("verifies a format-3 checksum before adding cognition or changing metadata", () => {
    const source = createInitialWorld("an old checksum speaks first", "standard");
    runTicks(source, 11);
    const tampered = JSON.parse(priorSim5Save(source)) as {
      world: { residents: Array<{ name: string }> };
    };
    const resident = tampered.world.residents[0];
    if (resident === undefined) throw new Error("fixture resident is missing");
    resident.name = `${resident.name} forged`;

    expect(() => deserializeWorld(JSON.stringify(tampered))).toThrow(/checksum/u);
  });

  it("round-trips nonempty cognition exactly and projects a deep independent copy", () => {
    const world = createInitialWorld("a witnessed person remains witnessed", "standard");
    const resident = requireResident(world);
    resident.perception = observedState(world);
    assertWorldInvariants(world);

    const encoded = serializeWorld(world);
    const restored = deserializeWorld(encoded);
    const restoredPerception = requireResident(restored).perception;
    expect(restoredPerception).toEqual(resident.perception);
    expect(serializeWorld(restored)).toBe(encoded);

    const projected = createWorldView(world);
    const viewPerception = projected.residents[0]?.perception;
    expect(viewPerception).toEqual(resident.perception);
    expect(viewPerception).not.toBe(resident.perception);
    expect(viewPerception?.attentionKeys).not.toBe(resident.perception.attentionKeys);
    expect(viewPerception?.beliefs).not.toBe(resident.perception.beliefs);
    expect(viewPerception?.beliefs[0]?.area).not.toBe(resident.perception.beliefs[0]?.area);
    expect(viewPerception?.beliefs[0]?.area.center)
      .not.toBe(resident.perception.beliefs[0]?.area.center);
    expect(viewPerception?.salientMemory).not.toBe(resident.perception.salientMemory);
  });

  it("rejects a current snapshot with missing cognition even under a valid checksum", () => {
    const raw = structuredClone(
      createInitialWorld("missing cognition is not legacy cognition", "standard"),
    ) as unknown as Record<string, unknown>;
    const residents = raw.residents as Array<Record<string, unknown>>;
    delete residents[0]?.perception;

    expect(() => deserializeWorld(currentEnvelope(raw))).toThrow(/perception is malformed/u);
  });

  it("rejects malformed, wrong-owner, unsafe, and future cognition under valid checksums", () => {
    const mutations: readonly ((world: Record<string, unknown>) => void)[] = [
      (world) => {
        const resident = (world.residents as Array<Record<string, unknown>>)[0];
        const perception = resident?.perception as Record<string, unknown>;
        perception.actorId = "H-v1-someone-else";
      },
      (world) => {
        const resident = (world.residents as Array<Record<string, unknown>>)[0];
        const perception = resident?.perception as Record<string, unknown>;
        perception.tick = 1;
      },
      (world) => {
        const resident = (world.residents as Array<Record<string, unknown>>)[0];
        const perception = resident?.perception as Record<string, unknown>;
        perception.suspicionPressure = 0.5;
      },
      (world) => {
        const resident = (world.residents as Array<Record<string, unknown>>)[0];
        const perception = resident?.perception as Record<string, unknown>;
        perception.attentionKeys = Array.from(
          { length: ACTOR_ATTENTION_CAP + 1 },
          (_, index) => `subject:H-v1-${index}`,
        );
      },
    ];

    for (const mutate of mutations) {
      const world = structuredClone(
        createInitialWorld("malformed cognition stays outside", "standard"),
      ) as unknown as Record<string, unknown>;
      mutate(world);
      expect(() => deserializeWorld(currentEnvelope(world))).toThrow(/invariant/u);
    }
  });

  it("rejects cognition whose clock lags the authoritative world tick", () => {
    const world = createInitialWorld("cognition advances with the world", "standard");
    runTicks(world, 1);
    const resident = requireResident(world);
    resident.perception = createActorPerceptionState(resident.identity.stableId, 0);

    expect(() => deserializeWorld(currentEnvelope(world))).toThrow(
      /perception tick does not match the world/u,
    );
  });

  it("rejects valid-but-noncanonical cognition ordering under a valid checksum", () => {
    const world = createInitialWorld("belief order cannot rewrite authority", "standard");
    const resident = requireResident(world);
    resident.perception = observedState(world);
    expect(resident.perception.beliefs).toHaveLength(2);

    const raw = structuredClone(world) as unknown as Record<string, unknown>;
    const residents = raw.residents as Array<Record<string, unknown>>;
    const rawPerception = residents[0]?.perception as {
      beliefs: unknown[];
    };
    rawPerception.beliefs.reverse();

    expect(() => deserializeWorld(currentEnvelope(raw))).toThrow(/not canonical/u);
  });
});
