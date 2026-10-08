import { describe, expect, it } from "vitest";

import { headingFromRadians } from "../game/livingActor";
import {
  resolveResidentRouteWorldPlacement,
  resolveResidentWorldPlacement,
} from "../game/residentSpatial";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  translateWorldPosition,
  type WorldPosition,
} from "../game/worldPosition";
import {
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  replaceResidentCircadian,
  residentSettlementRestNetworkId,
} from "./livingCircadian";
import {
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  hashWorld,
  serializeWorld,
  stepWorld,
} from "./public";
import {
  RESIDENT_ACTIVITY_OWNER_ID,
  RESIDENT_ACTIVITY_VERSION,
  canonicalizeResidentActivity,
  type ResidentActivity,
  type ResidentBodyPose,
  type ResidentRestTask,
} from "./residentActivity";
import {
  canonicalResidentActivityForWorld,
  residentRestTargetHasDrySupport,
  residentSettlementRestTarget,
} from "./residentActivityWorld";
import { RULES_VERSION, SAVE_FORMAT_VERSION, type ResidentState, type WorldState } from "./types";

// These are real lower-world persistence/transaction consumers. They do not
// establish that the future runtime rest-approach action is player-accessible.
const BASE = createWorld("resident activity world boundary", "standard");

function fixture() {
  const world = structuredClone(BASE);
  const index = world.residents.findIndex((resident) => {
    const target = residentSettlementRestTarget(world, resident);
    return target !== null && residentRestTargetHasDrySupport(world, target);
  });
  if (index < 0) throw new Error("fixture needs a real dry settlement target");
  return { world, index, resident: world.residents[index]! };
}

function selectedTask(resident: ResidentState, target: WorldPosition): ResidentRestTask {
  if (resident.location.kind !== "settlement") throw new Error("fixture needs settled resident");
  return {
    kind: "settlement-rest",
    settlementId: resident.location.settlementId,
    target,
    selectedAtTick: resident.perception.tick,
    cause: "urgent-rest",
    origin: "selected",
    legacySettlementOrdinal: null,
    phase: "arrived",
    lastProgressAtTick: resident.perception.tick,
    nextReassessmentAtTick: resident.perception.tick + 1,
    waitReason: null,
  };
}

function install(
  world: WorldState,
  index: number,
  poses?: readonly ResidentBodyPose[],
  continuationOrdinal: number | null = null,
): ResidentState {
  const original = world.residents[index]!;
  const target = residentSettlementRestTarget(world, original, continuationOrdinal);
  if (target === null) throw new Error("fixture has no authenticated rest point");
  const task: ResidentRestTask = continuationOrdinal === null
    ? selectedTask(original, target)
    : {
      ...selectedTask(original, target),
      cause: "continued-admission",
      origin: "continued-admitted-rest",
      legacySettlementOrdinal: continuationOrdinal,
    };
  const activity = canonicalizeResidentActivity({
    version: RESIDENT_ACTIVITY_VERSION,
    ownerId: RESIDENT_ACTIVITY_OWNER_ID,
    actorId: original.identity.stableId,
    tick: world.meta.completedTick,
    poses: poses ?? [{ position: target, heading: 0 }],
    restTask: task,
  }, { actorId: original.identity.stableId, tick: world.meta.completedTick });
  if (activity === null) throw new Error("fixture activity is not a canonical model");
  const restDestinationId = residentSettlementRestNetworkId(original.identity.stableId, original.homeSettlementId);
  if (restDestinationId === null) throw new Error("fixture has no reciprocal rest network");
  const admission = {
    atTick: original.perception.tick,
    circadian: {
      version: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.version,
      ownerId: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.ownerId,
      policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
      restDestinationId,
      restDestinationArrived: true,
      posture: {
        state: continuationOrdinal === null ? "awake" as const : "asleep" as const,
        enteredAtTick: original.perception.tick,
      },
    },
  };
  // Continuation inherits a real pre-existing admission. Installing a body
  // cannot itself manufacture the old resting/asleep episode it references.
  const alreadyAdmitted = continuationOrdinal === null
    ? original : replaceResidentCircadian(original, admission);
  const resident = replaceResidentCircadian({ ...alreadyAdmitted, activity }, admission);
  world.residents[index] = resident;
  return resident;
}

function rawActivity(resident: ResidentState): Record<string, unknown> {
  return structuredClone(resident.activity) as unknown as Record<string, unknown>;
}

function inject(resident: ResidentState, value: unknown): void {
  Object.assign(resident, { activity: value });
}

function resealedSave(world: WorldState, mutate: (world: WorldState) => void): string {
  const envelope = JSON.parse(serializeWorld(world)) as { world: WorldState; checksum: string };
  mutate(envelope.world);
  envelope.checksum = hashWorld(envelope.world);
  return JSON.stringify(envelope);
}

function restoredResident(world: WorldState, stableId: string): ResidentState {
  const resident = world.residents.find(({ identity }) => identity.stableId === stableId);
  if (resident === undefined) throw new Error("fixture lost its real resident");
  return resident;
}

describe("resident activity lower-world foundation integration", () => {
  it("preserves absent legacy state exactly through serialization, projection and an ordinary tick", () => {
    const { world } = fixture();
    const text = serializeWorld(world);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    expect(restored.meta.saveFormatVersion).toBe(SAVE_FORMAT_VERSION);
    expect(restored.meta.rulesVersion).toBe(RULES_VERSION);
    expect(restored.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    expect(createWorldView(restored).residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    stepWorld(restored);
    expect(restored.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    assertWorldInvariants(restored);
  });

  it("roundtrips exact optional body/history and returns detached frozen view state", () => {
    const { world, index, resident } = fixture();
    const target = residentSettlementRestTarget(world, resident)!;
    const bound = install(world, index, [
      { position: translateWorldPosition(target, -210, 0), heading: 0 },
      { position: translateWorldPosition(target, -105, 0), heading: 0 },
      { position: target, heading: 0 },
    ]);
    assertWorldInvariants(world);
    const text = serializeWorld(world);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    const restoredBody = restoredResident(restored, bound.identity.stableId).activity!;
    expect(restoredBody).toEqual(bound.activity);
    expect(restoredBody).not.toBe(bound.activity);
    expect(restoredBody.poses[0]?.position).not.toBe(bound.activity?.poses[0]?.position);
    const viewBody = createWorldView(restored).residents[index]?.activity!;
    expect(viewBody).toEqual(restoredBody);
    expect(viewBody).not.toBe(restoredBody);
    expect(viewBody.poses).not.toBe(restoredBody.poses);
    expect(viewBody.restTask?.target).not.toBe(restoredBody.restTask?.target);
    expect(Object.isFrozen(viewBody)).toBe(true);
    expect(Object.isFrozen(viewBody.poses[0]?.position.region)).toBe(true);
    expect(Reflect.set(viewBody.poses[0]!.position, "localX", 0)).toBe(false);
  });

  it.each([null, undefined])("rejects malformed present activity(%s) instead of treating it as absent", (value) => {
    const { world, index } = fixture();
    const resident = install(world, index);
    inject(resident, value);
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
    expect(() => assertWorldInvariants(world)).toThrow(/activity/u);
    expect(() => serializeWorld(world)).toThrow(/activity/u);
    if (value === null) {
      const valid = fixture();
      install(valid.world, valid.index);
      const text = resealedSave(valid.world, (candidate) => inject(candidate.residents[valid.index]!, null));
      expect(() => deserializeWorld(text)).toThrow(/activity/u);
    }
  });

  it.each([
    ["foreign actor", (raw: Record<string, unknown>, world: WorldState) => { raw.actorId = world.residents[1]!.identity.stableId; }],
    ["foreign tick", (raw: Record<string, unknown>, world: WorldState) => { raw.tick = world.meta.completedTick + 1; }],
    ["forged physical target", (raw: Record<string, unknown>) => {
      const task = raw.restTask as Record<string, unknown>;
      const target = translateWorldPosition(task.target as WorldPosition, 1, 0);
      task.target = target;
      raw.poses = [{ position: target, heading: 0 }];
    }],
    ["borrowed captured ordinal", (raw: Record<string, unknown>) => {
      (raw.restTask as Record<string, unknown>).legacySettlementOrdinal = 0;
    }],
  ] as const)("rejects resealed source forgery: %s", (_name, mutate) => {
    const { world, index } = fixture();
    const resident = install(world, index);
    const text = resealedSave(world, (candidate) => {
      const value = rawActivity(candidate.residents[index]!);
      mutate(value, candidate);
      inject(candidate.residents[index]!, value);
    });
    expect(() => deserializeWorld(text)).toThrow(/activity/u);
    const value = rawActivity(resident);
    mutate(value, world);
    inject(resident, value);
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
  });

  it("requires canonical circadian admission whenever an optional body is present", () => {
    const { world, index } = fixture();
    const resident = install(world, index);
    delete resident.circadian;
    expect(() => assertWorldInvariants(world)).toThrow(/rest admission/u);
    expect(() => serializeWorld(world)).toThrow(/rest admission/u);
    const valid = fixture();
    install(valid.world, valid.index);
    expect(() => deserializeWorld(resealedSave(valid.world, (candidate) => {
      delete candidate.residents[valid.index]!.circadian;
    }))).toThrow(/rest admission/u);
  });

  it("binds the world roster, cognition tick, membership and commitment independently of model custody", () => {
    const { world, index } = fixture();
    const resident = install(world, index);
    expect(canonicalResidentActivityForWorld(world, resident)).toBe(resident.activity);
    expect(canonicalResidentActivityForWorld(world, resident, world.meta.completedTick + 1)).toBeNull();
    expect(canonicalResidentActivityForWorld(world, { ...resident, id: 999_999 })).toBeNull();
    expect(canonicalResidentActivityForWorld(world, { ...resident, perception: {
      ...resident.perception, tick: resident.perception.tick + 1,
    } })).toBeNull();
    const foreign = world.settlements.find(({ id }) => id !== resident.homeSettlementId)!;
    expect(canonicalResidentActivityForWorld(world, { ...resident, location: {
      kind: "settlement", settlementId: foreign.id,
    } })).toBeNull();
    expect(canonicalResidentActivityForWorld(world, { ...resident, activeContractId: world.contracts[0]!.id })).toBeNull();
    expect(canonicalResidentActivityForWorld(world, { ...resident, location: {
      kind: "route", routeId: world.routes[0]!.id, progress: 0,
    } })).toBeNull();
  });

  it("requires dry physical support for a new arrived target", () => {
    const { world, index } = fixture();
    const resident = install(world, index);
    const target = resident.activity!.restTask!.target;
    const tileIndex = Math.floor(target.localY / WORLD_POSITION_UNITS_PER_TILE) * world.terrain.width
      + Math.floor(target.localX / WORLD_POSITION_UNITS_PER_TILE);
    expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
    world.terrain.tiles[tileIndex]!.elevation = world.tide.level - 1;
    expect(residentRestTargetHasDrySupport(world, target)).toBe(false);
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
    expect(() => serializeWorld(world)).toThrow(/activity/u);
    expect(residentRestTargetHasDrySupport(world, { ...target, region: { x: 1, y: 0 } })).toBe(false);
  });

  it("retains only an already-admitted episode at its authenticated original refuge", () => {
    const { world, index } = fixture();
    const resident = install(world, index, undefined, 0);
    const target = resident.activity!.restTask!.target;
    const tileIndex = Math.floor(target.localY / WORLD_POSITION_UNITS_PER_TILE) * world.terrain.width
      + Math.floor(target.localX / WORLD_POSITION_UNITS_PER_TILE);
    world.terrain.tiles[tileIndex]!.elevation = world.tide.level - 1;
    expect(residentRestTargetHasDrySupport(world, target)).toBe(false);
    expect(canonicalResidentActivityForWorld(world, resident)).toBe(resident.activity);
    assertWorldInvariants(world);
    const text = serializeWorld(world);
    expect(serializeWorld(deserializeWorld(text))).toBe(text);
    for (const posture of ["awake", "startled"] as const) {
      expect(canonicalResidentActivityForWorld(world, { ...resident, circadian: {
        ...resident.circadian!, posture: { state: posture, enteredAtTick: world.meta.completedTick },
      } })).toBeNull();
    }
    expect(canonicalResidentActivityForWorld(world, { ...resident, circadian: {
      ...resident.circadian!, restDestinationArrived: false,
    } })).toBeNull();
    const raw = rawActivity(resident);
    const task = raw.restTask as Record<string, unknown>;
    task.legacySettlementOrdinal = 1;
    expect(canonicalizeResidentActivity(raw, { actorId: resident.identity.stableId, tick: world.meta.completedTick })).not.toBeNull();
    expect(canonicalResidentActivityForWorld(world, { ...resident, activity: raw as unknown as ResidentActivity })).toBeNull();
  });

  it("keeps captured body/locus stable when another resident departs the present roster", () => {
    const { world } = fixture();
    const settlement = world.settlements[0]!;
    const present = world.residents.filter((resident) => resident.location.kind === "settlement"
      && resident.location.settlementId === settlement.id)
      .sort((left, right) => left.identity.stableId < right.identity.stableId ? -1
        : left.identity.stableId > right.identity.stableId ? 1 : left.id - right.id);
    if (present.length < 2) throw new Error("fixture needs two present residents");
    const index = world.residents.findIndex(({ id }) => id === present[1]!.id);
    const resident = install(world, index, undefined, 1);
    const original = resolveResidentWorldPlacement(world, resident)!.position;
    const foreign = world.settlements.find(({ id }) => id !== settlement.id)!;
    present[0]!.location = { kind: "settlement", settlementId: foreign.id };
    expect(world.residents).toHaveLength(42);
    expect(residentSettlementRestTarget(world, resident, 1)).toEqual(original);
    expect(resolveResidentWorldPlacement(world, resident)!.position).toEqual(original);
    expect(canonicalResidentActivityForWorld(world, resident)).toBe(resident.activity);
    assertWorldInvariants(world);
    const restored = deserializeWorld(serializeWorld(world));
    expect(resolveResidentWorldPlacement(restored, restoredResident(restored, resident.identity.stableId))!.position).toEqual(original);
  });

  it("rejects a resealed continuation whose captured ordinal no longer proves its stored target", () => {
    const { world, index } = fixture();
    const resident = install(world, index, undefined, 0);
    const original = resident.activity!.restTask!.target;
    expect(residentSettlementRestTarget(world, resident, 1)).not.toEqual(original);
    const text = resealedSave(world, (candidate) => {
      const value = rawActivity(candidate.residents[index]!);
      (value.restTask as Record<string, unknown>).legacySettlementOrdinal = 1;
      inject(candidate.residents[index]!, value);
    });
    expect(() => deserializeWorld(text)).toThrow(/activity/u);
    expect(serializeWorld(deserializeWorld(serializeWorld(world)))).toBe(serializeWorld(world));
    expect(residentSettlementRestTarget(world, resident, -0)).toBeNull();
    expect(residentSettlementRestTarget(world, resident, -1)).toBeNull();
    expect(residentSettlementRestTarget(world, resident, 0.5)).toBeNull();
    expect(residentSettlementRestTarget(world, resident, world.residents.length)).toBeNull();
  });

  it("resets the accepted interval clock/history without moving an unchanged settlement body", () => {
    const { world, index, resident } = fixture();
    const target = residentSettlementRestTarget(world, resident)!;
    const original = install(world, index, [
      { position: translateWorldPosition(target, -105, 0), heading: 0 },
      { position: target, heading: 0 },
    ]);
    const retained = structuredClone(original.activity!.poses.at(-1)!);
    const startTick = world.meta.completedTick;
    stepWorld(world);
    const stepped = restoredResident(world, original.identity.stableId);
    expect(stepped.perception.tick).toBe(startTick + 1);
    expect(stepped.activity?.tick).toBe(startTick + 1);
    expect(stepped.activity?.poses).toEqual([retained]);
    expect(original.activity?.poses).toHaveLength(2);
    expect(original.activity?.tick).toBe(startTick);
    assertWorldInvariants(world);
    expect(serializeWorld(deserializeWorld(serializeWorld(world)))).toBe(serializeWorld(world));
  });

  it("keeps native coarse contract travel, body clock and cargo custody coherent", () => {
    const { world } = fixture();
    const contract = world.contracts.find((candidate) => candidate.status === "offered"
      && world.residents.some((resident) => resident.location.kind === "settlement"
        && resident.location.settlementId === candidate.originSettlementId));
    if (contract === undefined) throw new Error("fixture needs a native offered contract");
    const index = world.residents.findIndex((resident) => resident.location.kind === "settlement"
      && resident.location.settlementId === contract.originSettlementId);
    const courier = install(world, index);
    const origin = world.settlements.find(({ id }) => id === contract.originSettlementId)!;
    const stockBefore = origin.inventory[contract.resource];
    const acceptedAt = world.meta.completedTick + 1;
    stepWorld(world, [{ id: "activity-native-accept", type: "accept-contract", carrier: "resident",
      contractId: contract.id, residentId: courier.id }]);
    expect(contract.status).toBe("accepted");
    expect(contract.cargoQuantity).toBe(0);
    const accepted = restoredResident(world, courier.identity.stableId);
    expect(accepted.activeContractId).toBe(contract.id);
    expect(accepted.activity?.tick).toBe(acceptedAt);
    expect(accepted.activity?.restTask).toBeNull();
    expect(accepted.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    assertWorldInvariants(world);

    stepWorld(world);
    expect(contract.status).toBe("in-transit");
    expect(contract.cargoQuantity).toBe(contract.quantity);
    expect(origin.inventory[contract.resource]).toBe(stockBefore - contract.quantity);
    for (let tick = 0; tick < 3; tick += 1) {
      const travelling = restoredResident(world, courier.identity.stableId);
      const placement = resolveResidentRouteWorldPlacement(world, travelling)!;
      expect(travelling.location.kind).toBe("route");
      expect(travelling.activity?.tick).toBe(world.meta.completedTick);
      expect(travelling.activity?.poses).toEqual([{ position: placement.position, heading: headingFromRadians(placement.facing) }]);
      expect(travelling.activity?.restTask).toBeNull();
      expect(travelling.circadian?.restDestinationArrived).toBe(false);
      assertWorldInvariants(world);
      const text = serializeWorld(world);
      const restored = deserializeWorld(text);
      expect(serializeWorld(restored)).toBe(text);
      expect(restored.contracts.find(({ id }) => id === contract.id)?.cargoQuantity).toBe(contract.quantity);
      expect(restoredResident(restored, courier.identity.stableId).activity).toEqual(travelling.activity);
      stepWorld(world);
    }
    // Coarse itinerary progress remains the old owner. These anchors are not a
    // claim that a new fine-step porter departure or physical handoff is live.
    expect(world.events.some((event) => event.type === "contract-departed" && event.subjectId === contract.id)).toBe(true);
    let furtherAdvances = 0;
    while (contract.status === "in-transit" && furtherAdvances < 480) {
      stepWorld(world);
      furtherAdvances += 1;
      const travelling = restoredResident(world, courier.identity.stableId);
      expect(travelling.activity?.tick).toBe(world.meta.completedTick);
      expect(travelling.activity?.poses).toHaveLength(1);
      expect(travelling.activity?.restTask).toBeNull();
      expect(travelling.circadian?.restDestinationArrived).toBe(false);
      if (travelling.location.kind === "route") {
        const placement = resolveResidentRouteWorldPlacement(world, travelling)!;
        expect(travelling.activity?.poses[0]).toEqual({
          position: placement.position, heading: headingFromRadians(placement.facing),
        });
      }
      // The native stock/cargo ledger must balance through production, needs,
      // route work and fulfillment, not only at our chosen boundary snapshots.
      assertWorldInvariants(world);
    }
    expect(contract.status).toBe("fulfilled");
    expect(contract.cargoQuantity).toBe(0);
    const arrived = restoredResident(world, courier.identity.stableId);
    expect(arrived.location).toEqual({ kind: "settlement", settlementId: contract.destinationSettlementId });
    expect(arrived.activeContractId).toBeNull();
    expect(arrived.activity?.restTask).toBeNull();
    expect(arrived.circadian?.restDestinationArrived).toBe(false);
    expect(world.events.filter((event) => event.type === "contract-fulfilled" && event.subjectId === contract.id)).toHaveLength(1);
    const text = serializeWorld(world);
    const restored = deserializeWorld(text);
    expect(serializeWorld(restored)).toBe(text);
    expect(restored.contracts.find(({ id }) => id === contract.id)).toMatchObject({ status: "fulfilled", cargoQuantity: 0 });
    expect(restoredResident(restored, courier.identity.stableId).activity).toEqual(arrived.activity);
  });
});
