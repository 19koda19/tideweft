import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createActorObservation, createActorPerceptionState, stepActorPerception } from "../sim/actorPerception";
import { assertWorldInvariants, deserializeWorld, runTicks, serializeWorld, type WorldState } from "../sim/public";
import { stableStringify } from "../sim/util";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { deserializeBio0Ecology } from "./bio0Ecology";
import { applyPorterResponseDecision, createPorterResponseState, decidePorterResponse, type PorterResponseState } from "./porterResponse";
import { adoptResidentActivities, advanceResidentRestActivities } from "./residentActivityExecution";
import { planResidentCircadian } from "./residentCircadian";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { advanceRuntimeResidentCircadian, createTideweftRuntime } from "./runtime";
import { deriveSettlementKeeperCircadianDuty } from "./settlementKeeperCircadian";
import { deserializeSettlementEcologyState, type SettlementEcologyState } from "./settlementEcology";
import { WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta } from "./worldPosition";

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  record: SaveRecord | undefined;
  async list() { return []; }
  async load() { return this.record === undefined ? undefined : structuredClone(this.record); }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }
}

let envelope: Record<string, unknown>;

beforeAll(async () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const repository = new MemoryRepository();
  const runtime = await createTideweftRuntime(repository);
  try {
    runtime.dispatchUI({ type: "new-world", seed: "resident activity executable rest approach", posture: "gale", sessionShape: "wander" });
    await runtime.save();
    if (repository.record === undefined) throw new Error("native runtime fixture omitted its save");
    envelope = JSON.parse(repository.record.worldJson) as Record<string, unknown>;
  } finally {
    runtime.destroy();
  }
}, 30_000);

afterAll(() => vi.unstubAllGlobals());

function freshFixture() {
  const world = deserializeWorld(String(envelope.world));
  const settlement = deserializeSettlementEcologyState(envelope.settlementEcology);
  const bio0 = deserializeBio0Ecology(envelope.bio0Ecology);
  if (bio0 === null) throw new Error("native runtime fixture omitted its physical porter cargo");
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  // Controlled short-fixture pressure; the native contracts and their cargo
  // remain intact, rather than inventing an accepted or completed job.
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = world.meta.completedTick + 1_000;
    contract.dueTick = world.meta.completedTick + 2_000;
  }
  const response = createPorterResponseState(settlement.identity.keeperActorId, world.meta.completedTick);
  return { world, settlement, bio0, response };
}

function keeperOf(world: WorldState, settlement: SettlementEcologyState) {
  const keeper = world.residents.find(({ identity }) => identity.stableId === settlement.identity.keeperActorId);
  if (keeper === undefined) throw new Error("native runtime fixture lost its keeper");
  return keeper;
}

function continuedRestFixture(state: "resting" | "asleep") {
  const fixture = freshFixture();
  for (const resident of fixture.world.residents) resident.needs.rest = 900_000;
  // Obtain genuine admitted refuge/posture receipts through the existing
  // no-body adapter. Fine-body adoption is tested only after that commitment.
  expect(advanceRuntimeResidentCircadian(fixture.world, fixture.settlement, fixture.response)).toBe(fixture.world);
  if (state === "asleep") {
    runTicks(fixture.world, 21);
    fixture.response = createPorterResponseState(fixture.settlement.identity.keeperActorId, fixture.world.meta.completedTick);
    expect(advanceRuntimeResidentCircadian(fixture.world, fixture.settlement, fixture.response)).toBe(fixture.world);
  }
  expect(fixture.world.residents.every((resident) => resident.circadian?.posture.state === state)).toBe(true);
  expect(adoptResidentActivities(fixture.world)).toBe(true);
  expect(fixture.world.residents.every((resident) => resident.activity?.restTask?.origin === "continued-admitted-rest")).toBe(true);
  return fixture;
}

function committedKeeperDuty(fixture: ReturnType<typeof freshFixture>): PorterResponseState {
  const keeper = keeperOf(fixture.world, fixture.settlement);
  const initial = createPorterResponseState(keeper.identity.stableId, fixture.world.meta.completedTick - 3);
  const decision = decidePorterResponse({
    version: 1, tick: fixture.world.meta.completedTick, perception: keeper.perception,
    cargo: fixture.bio0.cargo, packContainerId: fixture.bio0.foodSource.providerContainerId,
    weather: { rainIntensity: 1_000_000, coldPressure: 1_000_000, windPressure: 1_000_000 },
    needs: keeper.needs, disposition: { traits: keeper.traits, temperament: keeper.identity.temperament },
    accessibility: { "secure-food": true, reroute: true, leave: true, "offer-food": true, "wait-observe": true },
    current: initial,
  });
  expect(decision?.intent).toBe("secure-food");
  const applied = applyPorterResponseDecision(initial, decision);
  expect(applied.ok).toBe(true);
  if (applied.state === null) throw new Error("physical pack response did not commit");
  return applied.state;
}

// Native-root phase-zero adapter evidence, not ordinary runtime adoption,
// physical NPC activation, or permission to save bodies in current outer50.
describe("runtime resident phase-zero circadian/body reconciliation", () => {
  it("selects an actual dry approach for neutral urgent rest without moving its captured body", () => {
    const { world, settlement, response, bio0 } = freshFixture();
    const chosen = world.residents.find((resident) => {
      const source = resolveResidentWorldPlacement(world, resident)?.position;
      const target = residentSettlementRestTarget(world, resident);
      if (!source || !target || !residentRestTargetHasDrySupport(world, source) || !residentRestTargetHasDrySupport(world, target)) return false;
      const delta = worldPositionDelta(source, target);
      return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
    });
    if (chosen === undefined) throw new Error("native fixture needs a one-tile dry refuge approach");
    chosen.needs.rest = 900_000;
    const actorId = chosen.identity.stableId;
    const source = resolveResidentWorldPlacement(world, chosen)!.position;
    const target = residentSettlementRestTarget(world, chosen);
    const untouched = stableStringify({ bio0, contracts: world.contracts, events: world.events });
    expect(adoptResidentActivities(world)).toBe(true);
    expect(advanceRuntimeResidentCircadian(world, settlement, response)).toBe(world);
    const current = world.residents.find(({ identity }) => identity.stableId === actorId)!;
    expect(current.activity?.restTask).toMatchObject({ origin: "selected", cause: "urgent-rest", phase: "approaching", target });
    expect(current.activity?.poses).toHaveLength(1);
    expect(current.activity?.poses[0]?.position).toEqual(source);
    expect(current.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    expect(stableStringify({ bio0, contracts: world.contracts, events: world.events })).toBe(untouched);
    assertWorldInvariants(world);
  });

  it.each(["resting", "asleep"] as const)("revokes a genuinely continued %s episode on clock wake at the same exact position", (state) => {
    const { world, settlement, response } = continuedRestFixture(state);
    const poses = world.residents.map((resident) => resident.activity!.poses);
    for (const resident of world.residents) resident.needs.rest = 100_000;
    expect(advanceRuntimeResidentCircadian(world, settlement, response)).toBe(world);
    expect(world.residents.every((resident) => resident.activity?.restTask === null && resident.circadian?.posture.state === "awake" && !resident.circadian.restDestinationArrived)).toBe(true);
    expect(world.residents.map((resident) => resident.activity!.poses)).toEqual(poses);
    assertWorldInvariants(world);
  });

  it("uses a committed physical keeper response as duty, not rest pressure or a guessed occupation", () => {
    const fixture = continuedRestFixture("resting");
    const response = committedKeeperDuty(fixture);
    const keeper = keeperOf(fixture.world, fixture.settlement);
    const pose = keeper.activity!.poses[0];
    expect(deriveSettlementKeeperCircadianDuty(keeper, fixture.settlement, response, fixture.world.meta.completedTick)).toEqual({ kind: "active-duty", referenceId: response.lastDecisionId });
    // Clear world weather isolates the retained response's duty from the
    // separate storm override; policy input above is a controlled producer.
    expect(fixture.world.weather.kind).toBe("clear");
    expect(advanceRuntimeResidentCircadian(fixture.world, fixture.settlement, response)).toBe(fixture.world);
    const current = keeperOf(fixture.world, fixture.settlement);
    expect(current.needs.rest).toBe(900_000);
    expect(current.activity?.restTask).toBeNull();
    expect(current.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    expect(current.activity?.poses[0]).toEqual(pose);
    assertWorldInvariants(fixture.world);
  });

  it("revokes continued sleep for a same-tick lawful strong anonymous observation without relocating the listener", () => {
    const { world, settlement, response } = continuedRestFixture("asleep");
    const keeper = keeperOf(world, settlement);
    const pose = keeper.activity!.poses[0]!;
    const tick = world.meta.completedTick;
    const observation = createActorObservation({
      id: "OBS-resident-body-current-alarm", observerId: keeper.identity.stableId, observedAtTick: tick,
      channel: "hearing", perceivedClass: "danger-sound", subjectId: null,
      area: { center: pose.position, radiusUnits: 1_000 }, confidence: 1_000_000,
      salience: 1_000_000, identification: "anonymous", interrupt: "strong",
    });
    if (observation === null) throw new Error("lawful observation fixture rejected");
    const perception = stepActorPerception(createActorPerceptionState(keeper.identity.stableId, tick - 1), { tick, observations: [observation] });
    if (perception === null) throw new Error("lawful observation was not retained");
    keeper.perception = perception;
    expect(advanceRuntimeResidentCircadian(world, settlement, response)).toBe(world);
    const current = keeperOf(world, settlement);
    expect(current.activity?.restTask).toBeNull();
    expect(current.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "startled", enteredAtTick: tick } });
    expect(current.activity?.poses[0]).toEqual(pose);
    expect(current.perception.beliefs[0]).toMatchObject({ sourceObservationId: observation.id, subjectId: null, strongInterrupt: true });
    assertWorldInvariants(world);
  });

  it.each(["missing", "null", "partial", "stale", "later-phase"] as const)("rejects %s body cohort atomically, without falling back to legacy", (kind) => {
    const { world, settlement, response } = freshFixture();
    expect(adoptResidentActivities(world)).toBe(true);
    const last = world.residents.at(-1)!;
    if (kind === "later-phase") expect(advanceResidentRestActivities(world, 1)).not.toBeNull();
    else if (kind === "missing") delete last.activity;
    else if (kind === "null") Object.assign(last, { activity: null });
    else if (kind === "partial") Object.assign(last, { activity: { version: last.activity!.version } });
    else Object.assign(last, { activity: { ...last.activity, tick: world.meta.completedTick - 1 } });
    const roster = world.residents;
    const bytes = stableStringify(roster);
    expect(advanceRuntimeResidentCircadian(world, settlement, response)).toBeNull();
    expect(world.residents).toBe(roster);
    expect(stableStringify(world.residents)).toBe(bytes);
  });

  it("rejects mismatched keeper response or store binding without publishing any replacement", () => {
    const { world, settlement, response } = freshFixture();
    expect(adoptResidentActivities(world)).toBe(true);
    const roster = world.residents;
    const bytes = stableStringify(roster);
    for (const wrong of [{ ...response, actorId: world.residents.find(({ identity }) => identity.stableId !== response.actorId)!.identity.stableId }, { ...response, tick: response.tick - 1 }]) {
      expect(advanceRuntimeResidentCircadian(world, settlement, wrong)).toBeNull();
    }
    const wrongStore = { ...settlement, identity: { ...settlement.identity, settlementId: keeperOf(world, settlement).homeSettlementId + 1 } };
    expect(advanceRuntimeResidentCircadian(world, wrongStore, response)).toBeNull();
    expect(world.residents).toBe(roster);
    expect(stableStringify(world.residents)).toBe(bytes);
  });

  it("reconciles exact cold inner-world bytes and preserves true legacy absence behavior", () => {
    const { world, settlement, response } = continuedRestFixture("resting");
    const saved = serializeWorld(world);
    const cold = deserializeWorld(saved);
    expect(serializeWorld(cold)).toBe(saved);
    expect(advanceRuntimeResidentCircadian(world, settlement, response)).toBe(world);
    expect(advanceRuntimeResidentCircadian(cold, structuredClone(settlement), structuredClone(response))).toBe(cold);
    expect(serializeWorld(cold)).toBe(serializeWorld(world));
    const legacy = freshFixture();
    const expected = legacy.world.residents.map((resident) => planResidentCircadian({ resident, duty: null, weather: legacy.world.weather, atTick: legacy.world.meta.completedTick }));
    expect(advanceRuntimeResidentCircadian(legacy.world, legacy.settlement, legacy.response)).toBe(legacy.world);
    expect(legacy.world.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    legacy.world.residents.forEach((resident, index) => {
      const plan = expected[index];
      if (plan?.kind !== "projected") throw new Error("native legacy fixture has no refuge projection");
      expect(resident.circadian).toEqual(plan.projection.receipt);
    });
    assertWorldInvariants(cold);
    assertWorldInvariants(legacy.world);
  });
});
