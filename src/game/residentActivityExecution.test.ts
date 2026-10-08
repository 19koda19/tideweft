import { describe, expect, it } from "vitest";

import {
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  projectLivingCircadianClockPreference,
  replaceResidentCircadian,
  residentSettlementRestNetworkId,
} from "../sim/livingCircadian";
import {
  assertWorldInvariants,
  createWorld,
  deserializeWorld,
  serializeWorld,
  stepWorld,
} from "../sim/public";
import { RESIDENT_REST_APPROACH_STEP_UNITS } from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import type { ResidentState, WorldState } from "../sim/types";
import {
  adoptResidentActivities,
  advanceResidentRestActivities,
  prepareResidentRestActivities,
  type ResidentActivityDuty,
} from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta, type WorldPosition } from "./worldPosition";

// Production adapter/lower-world evidence only: the runtime has not yet joined
// its fixed-step, publication, hearing and rollback boundaries to this adapter.
const BASE = createWorld("resident activity executable rest approach", "standard");

function freshWorld(): WorldState {
  const world = structuredClone(BASE);
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  // Keep the native offered contracts, but do not let unrelated automatic
  // acceptance consume the resident during this deliberately short rest proof.
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = world.meta.completedTick + 1_000;
    contract.dueTick = world.meta.completedTick + 2_000;
  }
  return world;
}

function residentAt(world: WorldState, stableId: string): ResidentState {
  const resident = world.residents.find(({ identity }) => identity.stableId === stableId);
  if (resident === undefined) throw new Error("fixture lost its native resident");
  return resident;
}

function restFixture() {
  const world = freshWorld();
  const chosen = world.residents.find((resident) => {
    const source = resolveResidentWorldPlacement(world, resident)?.position;
    const target = residentSettlementRestTarget(world, resident);
    if (!source || !target || !residentRestTargetHasDrySupport(world, source)
      || !residentRestTargetHasDrySupport(world, target)) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
  });
  if (!chosen) throw new Error("fixture needs a native one-tile dry rest approach");
  chosen.needs.rest = 900_000;
  chosen.condition.exhaustion = 300_000;
  const stableId = chosen.identity.stableId;
  const target = residentSettlementRestTarget(world, chosen)!;
  const source = resolveResidentWorldPlacement(world, chosen)!.position;
  return { world, stableId, target, source };
}

function tileAt(world: WorldState, position: WorldPosition) {
  return world.terrain.tiles[Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE) * world.terrain.width
    + Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE)]!;
}

function finishInterval(world: WorldState, fromPhase = 1) {
  for (let phase = fromPhase; phase <= 10; phase += 1) {
    const result = advanceResidentRestActivities(world, phase);
    expect(result).not.toBeNull();
    expect(result?.maximumSurfaceCells).toBeLessThanOrEqual(16 * 16);
  }
}

describe("bounded resident rest execution adapter", () => {
  it("captures all native bodies once without letting another departure reshuffle them", () => {
    const world = freshWorld();
    const positions = world.residents.map((resident) => resolveResidentWorldPlacement(world, resident)!.position);
    expect(adoptResidentActivities(world, 1)).toBe(false);
    expect(world.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    expect(adoptResidentActivities(world)).toBe(true);
    expect(world.residents.map((resident) => resident.activity!.poses[0]!.position)).toEqual(positions);
    expect(world.residents.every((resident) => resident.activity?.restTask === null
      && resident.circadian?.restDestinationArrived === false)).toBe(true);
    const before = serializeWorld(world);
    expect(adoptResidentActivities(world)).toBe(true);
    expect(serializeWorld(world)).toBe(before);
    const first = world.residents[0]!;
    const second = world.residents.find((resident) => resident.homeSettlementId === first.homeSettlementId && resident.id !== first.id)!;
    const retained = resolveResidentWorldPlacement(world, second)!.position;
    first.location = { kind: "settlement", settlementId: world.settlements.find(({ id }) => id !== first.homeSettlementId)!.id };
    expect(resolveResidentWorldPlacement(world, second)!.position).toEqual(retained);
    assertWorldInvariants(world);
  });

  it("uses real rest pressure to approach an exact dry target before physiological recovery", () => {
    const { world, stableId, target, source } = restFixture();
    expect(adoptResidentActivities(world)).toBe(true);
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(residentAt(world, stableId).activity?.restTask).toMatchObject({ phase: "approaching", cause: "urgent-rest" });
    expect(residentAt(world, stableId).circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    let previous = source;
    for (let phase = 1; phase <= 10; phase += 1) {
      const result = advanceResidentRestActivities(world, phase);
      expect(result).not.toBeNull();
      expect(result?.maximumSurfaceCells).toBeLessThanOrEqual(16 * 16);
      const body = residentAt(world, stableId).activity!;
      const position = body.poses.at(-1)!.position;
      const delta = worldPositionDelta(previous, position);
      expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
      expect(body.poses).toHaveLength(phase + 1);
      previous = position;
    }
    const arrived = residentAt(world, stableId);
    expect(arrived.activity?.poses.at(-1)?.position).toEqual(target);
    expect(arrived.activity?.restTask?.phase).toBe("arrived");
    expect(arrived.circadian).toMatchObject({ restDestinationArrived: true, posture: { state: "resting" } });
    const exhaustion = arrived.condition.exhaustion;
    stepWorld(world);
    expect(residentAt(world, stableId).condition.exhaustion).toBeLessThan(exhaustion);
    assertWorldInvariants(world);
  });

  it.each(["wet-target", "blocked-origin"] as const)("waits without phantom relief, then retries next tick after %s is repaired", (obstruction) => {
    const { world, stableId, target, source } = restFixture();
    // Capture the actual body before support changes: legacy ordinal placement
    // deliberately chooses another offset when its original tile is blocked.
    expect(adoptResidentActivities(world)).toBe(true);
    const blocked = tileAt(world, obstruction === "wet-target" ? target : source);
    const original = { terrain: blocked.terrain, elevation: blocked.elevation };
    if (obstruction === "wet-target") blocked.elevation = world.tide.level - 10_000;
    else blocked.terrain = "deep-water";
    expect(prepareResidentRestActivities(world)).toBe(true);
    const selectedAt = residentAt(world, stableId).activity!.restTask!.selectedAtTick;
    const first = advanceResidentRestActivities(world, 1);
    expect(first?.waitingActorIds).toContain(stableId);
    expect(residentAt(world, stableId).activity?.poses.at(-1)?.position).toEqual(source);
    expect(residentAt(world, stableId).activity?.restTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route", nextReassessmentAtTick: world.meta.completedTick + 1 });
    expect(prepareResidentRestActivities(world)).toBe(false);
    finishInterval(world, 2);
    const exhaustion = residentAt(world, stableId).condition.exhaustion;
    stepWorld(world);
    expect(residentAt(world, stableId).condition.exhaustion).toBe(exhaustion);
    expect(residentAt(world, stableId).circadian?.restDestinationArrived).toBe(false);
    Object.assign(blocked, original);
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(residentAt(world, stableId).activity?.restTask).toMatchObject({ phase: "approaching", selectedAtTick: selectedAt });
    const retried = advanceResidentRestActivities(world, 1);
    expect(retried?.movedActorIds).toContain(stableId);
    expect(residentAt(world, stableId).activity?.poses.at(-1)?.position).not.toEqual(source);
    assertWorldInvariants(world);
  });

  it("continues equal accepted work identically after a detached mid-approach reload", () => {
    const { world, stableId } = restFixture();
    expect(adoptResidentActivities(world)).toBe(true);
    expect(prepareResidentRestActivities(world)).toBe(true);
    for (let phase = 1; phase <= 4; phase += 1) expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
    const text = serializeWorld(world);
    const restored = deserializeWorld(text);
    expect(residentAt(restored, stableId).activity).not.toBe(residentAt(world, stableId).activity);
    for (let phase = 5; phase <= 10; phase += 1) {
      expect(advanceResidentRestActivities(restored, phase)).toEqual(advanceResidentRestActivities(world, phase));
      expect(serializeWorld(restored)).toBe(serializeWorld(world));
    }
    stepWorld(world);
    stepWorld(restored);
    expect(serializeWorld(restored)).toBe(serializeWorld(world));
    expect(restored.events).toEqual(world.events);
  });

  it("canonicalizes a cold phase-zero body save without changing its exact serialized state", () => {
    const { world } = restFixture();
    expect(adoptResidentActivities(world)).toBe(true);
    expect(prepareResidentRestActivities(world)).toBe(true);
    const text = serializeWorld(world);
    const restored = deserializeWorld(text);
    const coldRoots = restored.residents.map(({ activity, circadian }) => ({ activity, circadian }));
    expect(adoptResidentActivities(restored)).toBe(true);
    const expectFrozen = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) expectFrozen(child);
    };
    for (const [index, resident] of restored.residents.entries()) {
      expect(resident.activity).toEqual(coldRoots[index]!.activity);
      expect(resident.circadian).toEqual(coldRoots[index]!.circadian);
      expectFrozen(resident.activity);
      expectFrozen(resident.circadian);
      expect(resident.activity?.poses).toHaveLength(1);
    }
    expect(serializeWorld(restored)).toBe(text);
    assertWorldInvariants(restored);
  });

  it("rejects explicitly present malformed duties before publishing any resident", () => {
    const { world, stableId } = restFixture();
    expect(adoptResidentActivities(world)).toBe(true);
    const validShape = { kind: "active-duty", referenceId: "malformed-boundary-test" };
    const symbol = Symbol("extra duty field");
    const invalidRecords: Array<readonly [string, unknown]> = [
      ["null duty", { actorId: stableId, duty: null }],
      ["undefined duty", { actorId: stableId, duty: undefined }],
      ["symbol duty", { actorId: stableId, duty: symbol }],
      ["extra entry field", { actorId: stableId, duty: validShape, extra: true }],
      ["symbol entry field", { actorId: stableId, duty: validShape, [symbol]: true }],
      ["extra duty field", { actorId: stableId, duty: { ...validShape, extra: true } }],
      ["symbol duty field", { actorId: stableId, duty: { ...validShape, [symbol]: true } }],
    ];
    const residents = world.residents;
    const text = serializeWorld(world);
    for (const [label, record] of invalidRecords) {
      expect(prepareResidentRestActivities(world, [record] as readonly ResidentActivityDuty[]), label).toBe(false);
      expect(world.residents, label).toBe(residents);
      expect(serializeWorld(world), label).toBe(text);
    }
  });

  it.each(["storm", "urgent-food"] as const)("does not start a rest approach through actual %s priority", (pressure) => {
    const { world, stableId, source } = restFixture();
    if (pressure === "storm") world.weather.kind = "storm";
    else residentAt(world, stableId).needs.food = 1_000_000;
    expect(adoptResidentActivities(world)).toBe(true);
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(residentAt(world, stableId).activity?.restTask).toBeNull();
    expect(residentAt(world, stableId).circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    expect(advanceResidentRestActivities(world, 1)?.movedActorIds).not.toContain(stableId);
    expect(residentAt(world, stableId).activity?.poses.at(-1)?.position).toEqual(source);
    assertWorldInvariants(world);
  });

  it("keeps a natively accepted Promise and subsequent coarse route ahead of urgent rest", () => {
    const world = freshWorld();
    const contract = world.contracts.find((candidate) => candidate.status === "offered"
      && world.residents.some((resident) => resident.location.kind === "settlement"
        && resident.location.settlementId === candidate.originSettlementId));
    if (!contract) throw new Error("fixture needs a native offered Promise");
    const courier = world.residents.find((resident) => resident.location.kind === "settlement"
      && resident.location.settlementId === contract.originSettlementId)!;
    courier.needs.rest = 900_000;
    const stableId = courier.identity.stableId;
    stepWorld(world, [{ id: "rest-priority-native-accept", type: "accept-contract",
      carrier: "resident", contractId: contract.id, residentId: courier.id }]);
    expect(contract.status).toBe("accepted");
    expect(adoptResidentActivities(world)).toBe(true);
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(residentAt(world, stableId).activity?.restTask).toBeNull();
    finishInterval(world);
    stepWorld(world);
    expect(contract.status).toBe("in-transit");
    expect(residentAt(world, stableId).location.kind).toBe("route");
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(residentAt(world, stableId).activity?.restTask).toBeNull();
    expect(residentAt(world, stableId).circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    assertWorldInvariants(world);
  });

  it("does not reinterpret an unbound macro weather hold as restorative body admission", () => {
    const world = freshWorld();
    const contract = world.contracts.find((candidate) => candidate.status === "offered"
      && world.residents.some((resident) => resident.location.kind === "settlement"
        && resident.location.settlementId === candidate.originSettlementId));
    if (!contract) throw new Error("weather fixture needs a native offered Promise");
    const courier = world.residents.find((resident) => resident.location.kind === "settlement"
      && resident.location.settlementId === contract.originSettlementId)!;
    const stableId = courier.identity.stableId;
    stepWorld(world, [{ id: "weather-native-accept", type: "accept-contract",
      carrier: "resident", contractId: contract.id, residentId: courier.id }]);
    stepWorld(world);
    expect(contract.status).toBe("in-transit");
    const routed = residentAt(world, stableId);
    expect(routed.location.kind).toBe("route");
    expect(routed.circadian).toBeUndefined();
    contract.arrivalTick = world.meta.completedTick + 100;
    routed.condition.sheltering = true;
    routed.condition.exhaustion = 300_000;
    routed.condition.coldStress = 400_000;
    world.weather = { kind: "storm", intensity: 950_000, windX: 0, windY: 0,
      nextChangeTick: world.meta.completedTick + 100 };
    const bound = deserializeWorld(serializeWorld(world));
    expect(adoptResidentActivities(bound)).toBe(true);
    for (const kind of ["storm", "clear"] as const) {
      for (const current of [world, bound]) {
        current.weather = { kind, intensity: kind === "storm" ? 950_000 : 0,
          windX: 0, windY: 0, nextChangeTick: current.meta.completedTick + 100 };
        stepWorld(current);
        assertWorldInvariants(current);
      }
      const unbound = residentAt(world, stableId);
      const adopted = residentAt(bound, stableId);
      expect(unbound.condition.exhaustion).toBe(kind === "storm" ? 299_000 : 294_000);
      expect(adopted.condition.exhaustion).toBe(300_000);
      expect(adopted.circadian?.restDestinationArrived).toBe(false);
      expect(adopted.activity?.restTask).toBeNull();
      expect(adopted.location).toEqual(unbound.location);
      expect(adopted.condition.routeDelayTicks).toBe(unbound.condition.routeDelayTicks);
      expect(bound.contracts).toEqual(world.contracts);
    }
  });

  it.each(["resting", "asleep"] as const)("preserves every already-admitted %s body and revokes its finite continuation on a genuine clock wake", (state) => {
    const world = freshWorld();
    const positions = world.residents.map((resident) => resolveResidentWorldPlacement(world, resident)!.position);
    world.residents = world.residents.map((resident) => replaceResidentCircadian(resident, {
      atTick: world.meta.completedTick,
      circadian: {
        version: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.version,
        ownerId: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.ownerId,
        policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
        restDestinationId: residentSettlementRestNetworkId(resident.identity.stableId, resident.homeSettlementId)!,
        restDestinationArrived: true,
        posture: { state, enteredAtTick: world.meta.completedTick - 3 },
      },
    }));
    expect(adoptResidentActivities(world)).toBe(true);
    expect(world.residents.map((resident) => resident.activity!.poses[0]!.position)).toEqual(positions);
    expect(world.residents.every((resident) => resident.activity?.restTask?.origin === "continued-admitted-rest"
      && resident.circadian?.posture.state === state
      && resident.circadian.posture.enteredAtTick === world.meta.completedTick - 3)).toBe(true);
    for (const resident of world.residents) expect(projectLivingCircadianClockPreference(resident.identity.stableId, world.meta.completedTick, RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY)).toBe("active");
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(world.residents.every((resident) => resident.activity?.restTask === null
      && resident.circadian?.posture.state === "awake"
      && resident.circadian.restDestinationArrived === false)).toBe(true);
    expect(world.residents.map((resident) => resident.activity!.poses[0]!.position)).toEqual(positions);
    assertWorldInvariants(world);
    expect(serializeWorld(deserializeWorld(serializeWorld(world)))).toBe(serializeWorld(world));
  });

  it("rejects wrong or duplicate phases and later malformed actors without partial population publication", () => {
    const { world } = restFixture();
    expect(adoptResidentActivities(world)).toBe(true);
    expect(prepareResidentRestActivities(world)).toBe(true);
    for (const phase of [0, 2, 11, 0.5, Number.NaN]) {
      const before = world.residents;
      expect(advanceResidentRestActivities(world, phase)).toBeNull();
      expect(world.residents).toBe(before);
    }
    expect(advanceResidentRestActivities(world, 1)).not.toBeNull();
    const before = world.residents;
    expect(advanceResidentRestActivities(world, 1)).toBeNull();
    expect(world.residents).toBe(before);
    Object.assign(world.residents.at(-1)!, { activity: null });
    expect(advanceResidentRestActivities(world, 2)).toBeNull();
    expect(world.residents).toBe(before);
    expect(world.residents.slice(0, -1).every((resident) => resident.activity?.poses.length === 2)).toBe(true);
  });
});
