import { describe, expect, it } from "vitest";

import {
  assertWorldInvariants, createWorld, createWorldView, deserializeWorld,
  serializeWorld, stepWorld,
} from "../sim/public";
import { RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS, readResidentActivityEventLocus } from "../sim/residentActivityEventLocus";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import type { SimEvent, WorldView } from "../sim/types";
import { stableStringify } from "../sim/util";
import { createPlayer } from "./player";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import {
  prepareResidentIntroductionEventTimeReceipt,
  residentIntroductionReceptionMatchesEventTime,
} from "./residentIntroductionAdmissionAuthority";
import {
  residentIntroductionExpressionEventMatchesWorld, residentIntroductionExpressionIntent,
  resumeResidentIntroductionPresentationEvent,
} from "./residentIntroductionExpression";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSituatedExpressionState, reduceSituatedExpression } from "./situatedExpression";
import { worldPositionDelta } from "./worldPosition";

// Production domain/adoption/motion/save owners, not normal runtime activation.
const BASE = createWorld("resident activity executable rest approach", "standard");

function fixture(phase = 4) {
  const state = structuredClone(BASE);
  state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: 1_000 };
  for (const resident of state.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of state.contracts) {
    contract.playerExclusiveUntilTick = 1_000;
    contract.dueTick = 2_000;
  }
  const chosen = state.residents.find((resident) => {
    const source = resolveResidentWorldPlacement(state, resident)?.position;
    const target = residentSettlementRestTarget(state, resident);
    if (!source || !target || !residentRestTargetHasDrySupport(state, source)
      || !residentRestTargetHasDrySupport(state, target)) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === 1_000;
  });
  if (!chosen) throw new Error("fixture needs native dry one-tile rest approach");
  const id = chosen.id;
  stepWorld(state, [{ id: "observe-before-body-introduction", type: "observe-resident", residentId: id }]);
  const observedTick = state.residents.find((resident) => resident.id === id)!.playerKnowledge.firstObservedTick!;
  expect(adoptResidentActivities(state)).toBe(true);
  state.residents.find((resident) => resident.id === id)!.needs.rest = 900_000;
  expect(prepareResidentRestActivities(state)).toBe(true);
  for (let step = 1; step <= phase; step += 1) expect(advanceResidentRestActivities(state, step)).not.toBeNull();
  const before = state.residents.find((resident) => resident.id === id)!.activity!;
  const pose = before.poses.at(-1)!;
  stepWorld(state, [{ id: "greet-at-actual-body", type: "greet-resident", residentId: id, observedTick }]);
  const event = state.events.find((candidate) => candidate.type === "resident-introduced" && candidate.subjectId === id)!;
  const world = createWorldView(state);
  const intent = residentIntroductionExpressionIntent({ world, event });
  if (!intent) throw new Error("actual body introduction was not derived");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduction.event || !reduction.state) throw new Error("actual body introduction was not accepted");
  return { state, id, before, pose, event, world, intent, expression: reduction.event, memory: reduction.state.recent[0]! };
}

function mapChangedEvent(world: WorldView, event: SimEvent) {
  return residentIntroductionExpressionIntent({ world: {
    ...world, events: world.events.map((candidate) => candidate.sequence === event.sequence ? event : candidate),
  }, event });
}

describe("body-captured resident introduction source", () => {
  it.each([0, 4, 10])("captures the real closing pose at phase%s before re-anchoring", (phase) => {
    const current = fixture(phase);
    expect(readResidentActivityEventLocus(current.event.data)).toEqual({
      tick: current.before.tick, phase, position: current.pose.position, heading: current.pose.heading,
    });
    expect(current.event.tick).toBe(current.before.tick + 1);
    expect(current.intent.position).toEqual(current.pose.position);
    expect(current.state.residents.find(({ id }) => id === current.id)!.activity!.poses).toHaveLength(1);
    if (phase === 4) expect(current.intent.position).not.toEqual(current.before.poses[0]!.position);
    assertWorldInvariants(current.state);
  });

  it("keeps committed speech at its old source through later real motion and exact cold save", () => {
    const current = fixture();
    expect(prepareResidentRestActivities(current.state)).toBe(true);
    for (let phase = 1; phase <= 3; phase += 1) expect(advanceResidentRestActivities(current.state, phase)).not.toBeNull();
    expect(resolveResidentWorldPlacement(current.state, current.state.residents.find(({ id }) => id === current.id)!)!.position)
      .not.toEqual(current.expression.position);
    const text = serializeWorld(current.state);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    const world = createWorldView(restored);
    expect(residentIntroductionExpressionEventMatchesWorld(world, current.expression)).toBe(true);
    const resumed = resumeResidentIntroductionPresentationEvent(world, current.memory);
    expect(resumed?.position).toEqual(current.expression.position);
    expect(resumed?.audioAcknowledged).toBe(true);
    expect(world.events).toEqual(current.state.events);
  });

  it("admits the previous closing body pose at new-interval phase0 without exposing identity through hearing", () => {
    const current = fixture(10);
    const window = createRegionalTerrainWindow(current.state.meta.rootSeed,
      createTerrainRegionStreamingState({ rootSeed: current.state.meta.rootSeed }));
    const spatialWorld = createRegionalWorldView(current.world, window,
      projectRegionalCartographyWindow(createRegionalCartography(current.state.meta.rootSeed), window));
    const resident = current.world.residents.find(({ id }) => id === current.id)!;
    const player = createPlayer(current.world, resident.homeSettlementId);
    const x = current.pose.position.localX - window.origin.x * 1_000;
    const y = current.pose.position.localY - window.origin.y * 1_000;
    Object.assign(player, { x, y, previousX: x, previousY: y,
      worldWidth: window.terrain.width, worldHeight: window.terrain.height });
    const input = { economyWorld: current.world, spatialWorld, window, playerTemplate: player, event: current.expression };
    const prepared = prepareResidentIntroductionEventTimeReceipt({ ...input, sampleOrdinal: 0 });
    expect(prepared).not.toBeNull();
    expect(prepared?.admission.admittedAtPlayerStepPhase).toBe(0);
    expect(readResidentActivityEventLocus(current.event.data)?.phase).toBe(10);
    expect(residentIntroductionReceptionMatchesEventTime({ ...input, admission: prepared!.admission, reception: prepared!.reception })).toBe(true);
    expect(prepared!.reception).not.toHaveProperty("name");
    expect(prepared!.reception).not.toHaveProperty("homeName");
  });

  it("rejects partial/invalid body fields and wrong cause tick instead of falling back to a settlement slot", () => {
    const current = fixture();
    for (const key of RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS) {
      const event = structuredClone(current.event);
      delete event.data[key];
      expect(mapChangedEvent(current.world, event), key).toBeNull();
    }
    for (const [key, value] of [
      ["eventBodyVersion", 2], ["eventBodyPhase", 11], ["eventBodyTick", current.event.tick],
      ["eventBodyTick", current.before.tick - 1], ["eventBodyHeading", 1_000_000],
      ["eventBodyLocalX", 120_000], ["eventBodyLocalY", -1],
      ["eventBodyRegionX", -0], ["unknownBodyField", 1],
    ] as const) {
      const event = structuredClone(current.event);
      event.data[key] = value;
      expect(mapChangedEvent(current.world, event), `${key}:${value}`).toBeNull();
    }
    const forged = structuredClone(current.event);
    forged.data.eventBodyLocalX = (forged.data.eventBodyLocalX as number) + 1;
    expect(residentIntroductionExpressionIntent({ world: current.world, event: forged })).toBeNull();
    for (const key of RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS) {
      const altered = structuredClone(current.event);
      const value = altered.data[key] as number;
      altered.data[key] = key === "eventBodyPhase" ? (value + 1) % 11
        : key === "eventBodyHeading" ? (value + 1) % 1_000_000 : value + 1;
      expect(residentIntroductionExpressionIntent({ world: current.world, event: altered }), key).toBeNull();
    }
    expect(residentIntroductionExpressionEventMatchesWorld({ ...current.world,
      events: current.world.events.map((event) => event.sequence === forged.sequence ? forged : event),
    }, current.expression)).toBe(false);
  });

  it("does not change legacy event bytes or reinterpret their captured macro source through a later body", () => {
    const state = structuredClone(BASE);
    const resident = state.residents[0]!;
    stepWorld(state, [{ id: "legacy-observe", type: "observe-resident", residentId: resident.id }]);
    stepWorld(state, [{ id: "legacy-greet", type: "greet-resident", residentId: resident.id,
      observedTick: resident.playerKnowledge.firstObservedTick! }]);
    const event = state.events.find((candidate) => candidate.type === "resident-introduced")!;
    expect(Object.keys(event.data)).toHaveLength(8);
    const before = residentIntroductionExpressionIntent({ world: createWorldView(state), event });
    const bytes = stableStringify(event);
    expect(adoptResidentActivities(state)).toBe(true);
    expect(residentIntroductionExpressionIntent({ world: createWorldView(state), event })).toEqual(before);
    expect(stableStringify(event)).toBe(bytes);
  });
});
