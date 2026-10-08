import { describe, expect, it, vi } from "vitest";

import { createWorld, createWorldView, deserializeWorld, serializeWorld } from "../sim/public";
import { MAX_TIDE_LEVEL } from "../sim/terrain";
import { FIXED_POINT, type WorldState, type WorldView } from "../sim/types";
import {
  collectExistingHumanObservations, createPhysicalSoundSample, createPlayerSenseSample,
  createSupplementalSoundSample, createUnadmittedAlarmSoundSample,
  type HumanPerceptionInput, type HumanSupplementalListeningReceipt, type PhysicalSoundSample,
} from "./humanPerception";
import { ambientNoiseAt, evaluatePhysicalAcousticListener } from "./physicalAcousticPerception";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow, type RegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { residentPlacementInRegionalWindow, resolveResidentWorldPlacement, resolveResidentWorldPlacementAtActivityPhase } from "./residentSpatial";
import { createWorldPosition, type WorldPosition } from "./worldPosition";

// Native human bodies and rest motion use their production owners. Controlled
// sound shapes exercise reception, not a claim that a new sound producer is live.
const BASE = createWorld("human retained activity perception", "standard");
interface Fixture {
  readonly state: WorldState;
  readonly economy: WorldView;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly stableId: string;
  readonly center: { readonly x: number; readonly y: number };
}

function nativeState() {
  const state = structuredClone(BASE);
  state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: state.meta.completedTick + 1_000 };
  for (const tile of state.terrain.tiles) Object.assign(tile, { terrain: "meadow", elevation: MAX_TIDE_LEVEL + 1, roughness: 0, baseTravelCost: 1_000 });
  for (const resident of state.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  const settlement = state.settlements.find(({ tileIndex, id }) => {
    const x = tileIndex % state.terrain.width;
    const y = Math.floor(tileIndex / state.terrain.width);
    return x >= 8 && y >= 8 && x + 5 < state.terrain.width && y + 5 < state.terrain.height
      && state.residents.filter((resident) => resident.homeSettlementId === id).length >= 5;
  });
  if (!settlement) throw new Error("fixture requires a native settlement and five humans");
  const residents = state.residents.filter((resident) => resident.homeSettlementId === settlement.id)
    .sort((a, b) => (a.identity.stableId < b.identity.stableId ? -1 : a.identity.stableId > b.identity.stableId ? 1 : 0) || a.id - b.id);
  const chosen = residents[4]!;
  chosen.needs.rest = 900_000;
  return { state, stableId: chosen.identity.stableId, center: {
    x: settlement.tileIndex % state.terrain.width,
    y: Math.floor(settlement.tileIndex / state.terrain.width),
  } };
}

function publish(input: ReturnType<typeof nativeState>, origin = { x: input.center.x - 60, y: input.center.y - 60 }): Fixture {
  const economy = createWorldView(input.state);
  const window = createRegionalTerrainWindow(input.state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: input.state.meta.rootSeed }), origin);
  const world = createRegionalWorldView(economy, window,
    projectRegionalCartographyWindow(createRegionalCartography(input.state.meta.rootSeed), window));
  return { ...input, economy, world, window };
}

function fixture(phase = 10, boundary = false): Fixture {
  const input = nativeState();
  expect(adoptResidentActivities(input.state)).toBe(true);
  // A real blocked corner makes the shared dry rest path turn west then north.
  // Capture the old body first; do not let legacy offset selection relocate it.
  input.state.terrain.tiles[input.center.y * input.state.terrain.width + input.center.x + 1]!.terrain = "deep-water";
  expect(prepareResidentRestActivities(input.state)).toBe(true);
  for (let step = 1; step <= phase; step += 1) expect(advanceResidentRestActivities(input.state, step)).not.toBeNull();
  return publish(input, boundary ? { x: input.center.x + 1, y: input.center.y - 60 } : undefined);
}

function observer(current: Fixture) {
  return current.world.residents.find(({ identity }) => identity.stableId === current.stableId)!;
}

function pose(current: Fixture, phase: number) {
  const value = resolveResidentWorldPlacementAtActivityPhase(current.economy, observer(current), current.state.meta.completedTick, phase);
  if (!value) throw new Error("fixture lost its actual retained body pose");
  return value;
}

function sounds(current: Fixture) {
  const position = createWorldPosition({ x: 0, y: 0 }, (current.center.x + 3) * 1_000 + 500, (current.center.y + 1) * 1_000 + 500);
  const fields = { position, soundLoudness: FIXED_POINT, soundRangeUnits: 5_000 };
  const voice = createSupplementalSoundSample({ ...fields, id: "retained-voice", sourceActorId: "HUMAN-CONTROLLED-SOURCE",
    expressionEventId: "situated-expression:event:retained-test", soundClass: "human-vocalization", soundInterrupt: "none" });
  const impact = createPhysicalSoundSample({ ...fields, id: "retained-impact", sourceId: "OBJECT-CONTROLLED-SOURCE",
    acousticEventId: "acoustic:retained-impact-test", soundClass: "physical-thud", soundInterrupt: "none" });
  const alarm = createUnadmittedAlarmSoundSample({ ...fields, id: "retained-alarm", sourceActorId: "DEER-CONTROLLED-SOURCE",
    acousticEventId: "ecology-alarm:retained-test", soundClass: "animal-alarm", soundInterrupt: "strong" });
  if (!voice || !impact || !alarm) throw new Error("fixture sound shape must be valid");
  return { voice, impact, alarm };
}

function inputFor(current: Fixture, phase: number): HumanPerceptionInput {
  const { voice, impact, alarm } = sounds(current);
  return {
    world: current.world, window: current.window, targetTick: current.state.meta.completedTick + 1,
    playerSamples: [], supplementalSoundSamples: [voice], physicalSoundSamples: [impact], unadmittedAlarmSoundSamples: [alarm],
    soundSamplePhases: [voice, impact, alarm].map(({ id }) => ({ sampleId: id, phase })),
    surfaceSoundSampleIds: [voice.id, impact.id, alarm.id],
  };
}

function expectedImpact(current: Fixture, phase: number, sample: PhysicalSoundSample) {
  const placement = pose(current, phase);
  const projected = residentPlacementInRegionalWindow(placement, current.window);
  if (!projected) throw new Error("explicit listener pose must occupy this frame");
  return evaluatePhysicalAcousticListener({
    observationId: `hp-h-${current.state.meta.completedTick + 1}-${observer(current).id}-${sample.id}`,
    observerId: current.stableId, observerPosition: placement.position, observedAtTick: current.state.meta.completedTick + 1,
    sample, effectiveRangeUnits: sample.soundRangeUnits, ambientNoise: ambientNoiseAt(current.world, projected.tileIndex)!,
    wind: { x: 0, y: 0 },
  }, { world: current.world, sourceSupport: "surface", listenerSupport: "surface" });
}

function playerSample(position: WorldPosition, sampleOrdinal: number) {
  const sample = createPlayerSenseSample({ id: "retained-player", sampleOrdinal, position,
    movementSalience: FIXED_POINT, lightVisibility: FIXED_POINT, soundLoudness: 0, soundRangeUnits: 0,
    soundClass: "movement-sound", soundInterrupt: "none" });
  if (!sample) throw new Error("fixture player sample must be valid");
  return sample;
}

describe("existing-human retained activity reception", () => {
  it("uses ordinal plus one for actual body position and heading rather than the final pose", () => {
    const current = fixture();
    const early = pose(current, 1);
    const late = pose(current, 10);
    expect(early.position).not.toEqual(late.position);
    expect(early.facing).not.toBe(late.facing);
    const position = createWorldPosition(early.position.region, early.position.localX - 4_000, early.position.localY);
    const collect = (ordinal: number) => collectExistingHumanObservations({ world: current.world, window: current.window,
      targetTick: current.state.meta.completedTick + 1, playerSamples: [playerSample(position, ordinal)] })
      .find(({ observerId }) => observerId === current.stableId)?.observations;
    expect(collect(0)).toContainEqual(expect.objectContaining({ channel: "vision", identification: "identified", subjectId: "player:local" }));
    expect(collect(9)?.some(({ channel }) => channel === "vision")).toBe(false);
  });

  it("binds all sound families to explicitly resolved hearing poses and never exposes source identity", () => {
    const current = fixture();
    const input = inputFor(current, 1);
    const impact = sounds(current).impact;
    const early = expectedImpact(current, 1, impact);
    const late = expectedImpact(current, 10, impact);
    expect(early?.kind).toBe("heard");
    expect(late?.kind).toBe("heard");
    if (early?.kind !== "heard" || late?.kind !== "heard") throw new Error("fixture sound must lawfully carry");
    expect(early.observation).not.toEqual(late.observation);
    const receipts = vi.fn<(value: readonly HumanSupplementalListeningReceipt[]) => void>();
    const before = JSON.stringify(input);
    const batch = collectExistingHumanObservations(input, receipts).find(({ observerId }) => observerId === current.stableId)!;
    expect(batch.observations.find(({ id }) => id.endsWith(impact.id))).toEqual(early.observation);
    expect(batch.observations).toHaveLength(3);
    for (const observation of batch.observations) {
      expect(observation).toMatchObject({ channel: "hearing", identification: "anonymous", subjectId: null });
      for (const key of ["sourceActorId", "sourceId", "expressionEventId", "acousticEventId"]) expect(observation).not.toHaveProperty(key);
    }
    expect(receipts.mock.calls[0]?.[0].find(({ observerId }) => observerId === current.stableId)?.contact).toEqual(early.contact);
    const finalBatch = collectExistingHumanObservations(inputFor(current, 10)).find(({ observerId }) => observerId === current.stableId)!;
    expect(finalBatch.observations).toHaveLength(3);
    expect(finalBatch.observations.find(({ id }) => id.endsWith(impact.id))).toEqual(late.observation);
    expect(collectExistingHumanObservations({ ...input, soundSamplePhases: [...input.soundSamplePhases!].reverse() })).toEqual(collectExistingHumanObservations(input));
    expect(JSON.stringify(input)).toBe(before);
  });

  it("retains an earlier in-window listener even when its latest pose has exited", () => {
    const current = fixture(10, true);
    expect(residentPlacementInRegionalWindow(pose(current, 0), current.window)).not.toBeNull();
    expect(residentPlacementInRegionalWindow(pose(current, 10), current.window)).toBeNull();
    const impact = sounds(current).impact;
    const expected = expectedImpact(current, 0, impact);
    expect(expected?.kind).toBe("heard");
    if (expected?.kind !== "heard") throw new Error("earlier in-frame sound must lawfully carry");
    const batch = collectExistingHumanObservations(inputFor(current, 0)).find(({ observerId }) => observerId === current.stableId);
    expect(batch?.observations).toContainEqual(expected.observation);
  });

  it("rejects malformed, incomplete or player phase mappings before any listener receipt", () => {
    const current = fixture();
    const input = inputFor(current, 1);
    const mappings = input.soundSamplePhases!;
    const symbol = Symbol("unexpected mapping key");
    const getter = { sampleId: mappings[0]!.sampleId, get phase() { throw new Error("getter must not run"); } };
    const extraArray = Object.assign([...mappings], { extra: true });
    const invalid: unknown[] = [null, undefined, {}, [], new Array(mappings.length), extraArray,
      [mappings[0], mappings[0], mappings[2]], mappings.slice(1),
      [mappings[0], mappings[2]], [mappings[0], mappings[1]],
      [{ ...mappings[0], sampleId: "unknown-sound" }, ...mappings.slice(1)],
      [{ ...mappings[0], extra: true }, ...mappings.slice(1)],
      [{ ...mappings[0], [symbol]: true }, ...mappings.slice(1)], [getter, ...mappings.slice(1)],
      ...[-1, -0, 11, 0.5, Number.NaN].map((phase) => [{ ...mappings[0], phase }, ...mappings.slice(1)]),
    ];
    const receipt = vi.fn<(value: readonly HumanSupplementalListeningReceipt[]) => void>();
    for (const soundSamplePhases of invalid) expect(collectExistingHumanObservations({ ...input, soundSamplePhases } as unknown as HumanPerceptionInput, receipt)).toEqual([]);
    const player = playerSample(pose(current, 1).position, 0);
    expect(collectExistingHumanObservations({ ...input, playerSamples: [player], soundSamplePhases: [...mappings, { sampleId: player.id, phase: 1 }] }, receipt)).toEqual([]);
    expect(collectExistingHumanObservations({ ...input, playerSamples: [player], soundSamplePhases: [...mappings.slice(1), { sampleId: player.id, phase: 1 }] }, receipt)).toEqual([]);
    const { soundSamplePhases: _omitted, ...missing } = input;
    expect(collectExistingHumanObservations(missing, receipt)).toEqual([]);
    expect(receipt).not.toHaveBeenCalled();
  });

  it("fails the entire batch for missing retained phases, stale bodies or explicitly malformed presence", () => {
    const incomplete = fixture(4);
    const receipt = vi.fn<(value: readonly HumanSupplementalListeningReceipt[]) => void>();
    expect(collectExistingHumanObservations(inputFor(incomplete, 10), receipt)).toEqual([]);
    expect(collectExistingHumanObservations({ world: incomplete.world, window: incomplete.window,
      targetTick: incomplete.state.meta.completedTick + 1, playerSamples: [playerSample(pose(incomplete, 1).position, 4)] }, receipt)).toEqual([]);
    const current = fixture();
    const resident = current.world.residents.at(-1)!;
    const activity = resident.activity!;
    for (const malformed of [null, undefined, { ...activity, tick: activity.tick - 1 }]) {
      Object.assign(resident, { activity: malformed });
      expect(collectExistingHumanObservations(inputFor(current, 1), receipt)).toEqual([]);
    }
    Object.assign(resident, { activity });
    expect(receipt).not.toHaveBeenCalled();
    expect(collectExistingHumanObservations(inputFor(current, 1)).length).toBeGreaterThan(0);
  });

  it("keeps legacy absence on its exact single placement when phase metadata is omitted", () => {
    const current = publish(nativeState());
    expect(current.world.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    const mapped = inputFor(current, 10);
    const { soundSamplePhases: _omitted, ...legacy } = mapped;
    const first = collectExistingHumanObservations(legacy);
    expect(first.length).toBeGreaterThan(0);
    expect(collectExistingHumanObservations(mapped)).toEqual(first);
    expect(resolveResidentWorldPlacement(current.economy, observer(current))).not.toBeNull();
  });

  it("preserves event-time reception after an exact cold mid-approach continuation", () => {
    const current = fixture(4);
    const text = serializeWorld(current.state);
    const restoredState = deserializeWorld(text);
    expect(serializeWorld(restoredState)).toBe(text);
    for (let phase = 5; phase <= 10; phase += 1) expect(advanceResidentRestActivities(restoredState, phase)).toEqual(advanceResidentRestActivities(current.state, phase));
    expect(serializeWorld(restoredState)).toBe(serializeWorld(current.state));
    const original = publish({ state: current.state, stableId: current.stableId, center: current.center });
    const restored = publish({ state: restoredState, stableId: current.stableId, center: current.center });
    expect(collectExistingHumanObservations(inputFor(restored, 4))).toEqual(collectExistingHumanObservations(inputFor(original, 4)));
  });
});
