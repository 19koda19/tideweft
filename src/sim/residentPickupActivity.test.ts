import { describe, expect, it } from "vitest";

import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "../game/worldPosition";
import { assertWorldInvariants, createWorld, findAutonomousRoutePlan, stepWorld } from "./public";
import {
  RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID,
  RESIDENT_ENVIRONMENT_ACTIVITY_VERSION,
  RESIDENT_PICKUP_ACTIVITY_OWNER_ID,
  RESIDENT_PICKUP_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  canonicalizeResidentActivity,
  replaceResidentActivity,
  residentActivitySupportsEnvironment,
  residentActivitySupportsInspection,
  residentActivitySupportsMaterials,
  residentActivitySupportsPickup,
  residentActivitySupportsRations,
  type ResidentActivity,
  type ResidentPickupTask,
} from "./residentActivity";
import {
  canonicalResidentActivityForWorld,
  residentAcceptedPickupBinding,
} from "./residentActivityWorld";
import type { ContractState, ResidentState, WorldState } from "./types";
import { stableStringify } from "./util";

// These are codec/world-reference foundations, not evidence that approach,
// pickup, transport or handoff has run through the player-accessible runtime.
// Acceptance itself uses a native offer and the engine's actual courier choice.
function nativeAcceptedWorld(): WorldState {
  const world = createWorld("resident activity executable rest approach", "standard");
  const contract = world.contracts.find((candidate) => candidate.status === "offered"
    && world.residents.some((resident) => resident.activeContractId === null
      && resident.location.kind === "settlement"
      && resident.location.settlementId === candidate.originSettlementId)
    && findAutonomousRoutePlan(world, candidate.originSettlementId, candidate.destinationSettlementId) !== undefined);
  if (contract === undefined) throw new Error("Pickup codec fixture needs a native eligible offer");
  for (const candidate of world.contracts) {
    candidate.playerExclusiveUntilTick = Math.min(candidate.dueTick - 1, world.meta.completedTick + 1_000);
  }
  contract.playerExclusiveUntilTick = world.meta.completedTick + 1;
  assertWorldInvariants(world);
  stepWorld(world);
  if (contract.status !== "accepted" || contract.assignedResidentId === null
    || contract.acceptedTick !== world.meta.completedTick || contract.cargoQuantity !== 0) {
    throw new Error("Native engine did not accept the selected offer without pickup");
  }
  assertWorldInvariants(world);
  return world;
}

const BASE = nativeAcceptedWorld();

function fixture(phase: ResidentPickupTask["phase"] = "approaching") {
  const world = structuredClone(BASE);
  const contract = world.contracts.find((candidate) => candidate.status === "accepted"
    && candidate.carrierKind === "resident" && candidate.assignedResidentId !== null)!;
  const resident = world.residents.find(({ id }) => id === contract.assignedResidentId)!;
  const origin = world.settlements.find(({ id }) => id === contract.originSettlementId)!;
  const tile = world.terrain.tiles[origin.tileIndex]!;
  // Independent expected geometry, not an arrangement through the helper under test.
  const target = createWorldPosition({ x: 0, y: 0 },
    tile.x * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    tile.y * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2);
  const tick = world.meta.completedTick;
  const pickupTask: ResidentPickupTask = {
    kind: "contract-pickup", contractId: contract.id, settlementId: origin.id, target,
    selectedAtTick: tick, phase, lastProgressAtTick: tick, nextReassessmentAtTick: tick + 1,
    waitReason: phase === "waiting" ? "no-stock" : null,
  };
  const raw = {
    version: RESIDENT_PICKUP_ACTIVITY_VERSION, ownerId: RESIDENT_PICKUP_ACTIVITY_OWNER_ID,
    actorId: resident.identity.stableId, tick,
    poses: [{ position: phase === "arrived" ? target : translateWorldPosition(target, -100, 0), heading: 0 }],
    restTask: null, rationTask: null, materialTask: null, inspectionTask: null, pickupTask,
  } satisfies ResidentActivity;
  return { world, contract, resident, origin, target, raw, binding: { actorId: raw.actorId, tick } };
}

function serviceTasks(current: ReturnType<typeof fixture>): Record<string, unknown> {
  const { origin, target, raw } = current;
  const common = {
    settlementId: origin.id, target, selectedAtTick: raw.tick, phase: "approaching",
    lastProgressAtTick: raw.tick, nextReassessmentAtTick: raw.tick + 1, waitReason: null,
  };
  return {
    restTask: { ...common, kind: "settlement-rest", cause: "urgent-rest", origin: "selected", legacySettlementOrdinal: null },
    rationTask: { ...common, kind: "settlement-ration", usedAtTick: null, foodUsed: false, waterUsed: false },
    materialTask: { ...common, kind: "settlement-material", projectId: origin.project.id, resource: origin.project.resource, usedAtTick: null },
    inspectionTask: { ...common, kind: "settlement-inspection", storeId: "STORE-codec-fixture", sourceEvidenceId: "store-evidence:codec-fixture" },
  };
}

describe("explicit contract-pickup activity protocol foundations", () => {
  it("binds an actual automatically accepted native offer without creating cargo or mutating the world", () => {
    const { world, resident, contract, target } = fixture();
    const before = stableStringify(world);
    expect(world.events.some((event) => event.type === "contract-accepted"
      && event.subjectId === contract.id && event.data.residentId === resident.id)).toBe(true);
    const binding = residentAcceptedPickupBinding(world, resident);
    expect(binding?.contract).toBe(contract);
    expect(binding?.target).toEqual(target);
    expect(contract.cargoQuantity).toBe(0);
    expect(stableStringify(world)).toBe(before);
  });

  it.each(["approaching", "waiting", "arrived"] as const)("retains exact %s shape through a cold clone", (phase) => {
    const { world, resident, raw, binding } = fixture(phase);
    const bytes = stableStringify(raw);
    const activity = canonicalizeResidentActivity(raw, binding);
    expect(activity).toEqual(raw);
    expect(Object.isFrozen(activity)).toBe(true);
    expect(Object.isFrozen(activity?.pickupTask)).toBe(true);
    expect(Object.isFrozen(activity?.pickupTask?.target)).toBe(true);
    expect(Object.isFrozen(activity?.poses)).toBe(true);
    expect(canonicalizeResidentActivity(structuredClone(activity), binding)).toEqual(activity);
    resident.activity = activity!;
    expect(canonicalResidentActivityForWorld(world, resident)).toEqual(activity);
    const cold = structuredClone(world);
    const coldResident = cold.residents.find(({ id }) => id === resident.id)!;
    expect(canonicalResidentActivityForWorld(cold, coldResident)).toEqual(activity);
    expect(stableStringify(raw)).toBe(bytes);
  });

  it("requires v6's explicit nullable field and retains all inherited capabilities", () => {
    const { raw, binding } = fixture();
    const empty = { ...raw, pickupTask: null };
    expect(canonicalizeResidentActivity(empty, binding)).not.toBeNull();
    const { pickupTask: _task, ...missing } = empty;
    expect(canonicalizeResidentActivity(missing, binding)).toBeNull();
    expect(canonicalizeResidentActivity({ ...empty, pickupTask: undefined }, binding)).toBeNull();
    for (const supports of [residentActivitySupportsRations, residentActivitySupportsMaterials,
      residentActivitySupportsInspection, residentActivitySupportsEnvironment, residentActivitySupportsPickup]) {
      expect(supports({ version: RESIDENT_PICKUP_ACTIVITY_VERSION })).toBe(true);
    }
    expect(residentActivitySupportsPickup({ version: RESIDENT_ENVIRONMENT_ACTIVITY_VERSION })).toBe(false);
  });

  it.each([1, 2, 3, 4, 5] as const)("preserves frozen v%s and rejects an added pickup field", (version) => {
    const { raw, binding } = fixture();
    const legacy: Record<string, unknown> = { ...raw, version, ownerId: `sim:resident-activity:v${version}` };
    delete legacy.pickupTask;
    if (version < 4) delete legacy.inspectionTask;
    if (version < 3) delete legacy.materialTask;
    if (version < 2) delete legacy.rationTask;
    expect(canonicalizeResidentActivity(legacy, binding)).not.toBeNull();
    expect(canonicalizeResidentActivity({ ...legacy, pickupTask: null }, binding)).toBeNull();
    expect(canonicalizeResidentActivity({ ...legacy, pickupTask: raw.pickupTask }, binding)).toBeNull();
    expect(residentActivitySupportsPickup({ version })).toBe(false);
  });

  it("rejects version-only relabeling, mismatched ownership and genuinely unknown successors", () => {
    const { raw, binding } = fixture();
    expect(canonicalizeResidentActivity({ ...raw, ownerId: RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID }, binding)).toBeNull();
    // v7 is recognized, but merely relabeling a frozen v6 root cannot supply
    // the successor's required explicit nullable travel field.
    expect(canonicalizeResidentActivity({ ...raw, version: RESIDENT_TRAVEL_ACTIVITY_VERSION,
      ownerId: RESIDENT_TRAVEL_ACTIVITY_OWNER_ID }, binding)).toBeNull();
    expect(canonicalizeResidentActivity({ ...raw, version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
      ownerId: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID }, binding)).toBeNull();
    for (const version of [9, 99, Number.MAX_SAFE_INTEGER]) {
      expect(canonicalizeResidentActivity({ ...raw, version, ownerId: `sim:resident-activity:v${version}` }, binding)).toBeNull();
      expect(residentActivitySupportsPickup({ version } as unknown as Pick<ResidentActivity, "version">)).toBe(false);
    }
    expect(residentActivitySupportsPickup(null)).toBe(false);
    expect(residentActivitySupportsPickup(undefined)).toBe(false);
  });

  it("retains the frozen v6 pickup shape in an explicitly complete v7 root", () => {
    const { raw, binding } = fixture();
    const successor = { ...raw, version: RESIDENT_TRAVEL_ACTIVITY_VERSION,
      ownerId: RESIDENT_TRAVEL_ACTIVITY_OWNER_ID, travelTask: null };
    const before = stableStringify(successor);
    expect(residentActivitySupportsPickup({ version: RESIDENT_TRAVEL_ACTIVITY_VERSION })).toBe(true);
    expect(canonicalizeResidentActivity(successor, binding)).toEqual(successor);
    expect(canonicalizeResidentActivity(structuredClone(successor), binding)).toEqual(successor);
    expect(stableStringify(successor)).toBe(before);
  });

  it("retains the exact pickup task in a complete v8 root without extending its waiting vocabulary", () => {
    const { raw, binding } = fixture("waiting");
    const successor = { ...raw, version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
      ownerId: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID, travelTask: null };
    const before = stableStringify(successor);
    expect(residentActivitySupportsPickup({ version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION })).toBe(true);
    expect(canonicalizeResidentActivity(successor, binding)).toEqual(successor);
    expect(canonicalizeResidentActivity(structuredClone(successor), binding)).toEqual(successor);
    expect(canonicalizeResidentActivity({ ...successor,
      pickupTask: { ...successor.pickupTask, waitReason: "observed-water" },
    }, binding)).toBeNull();
    expect(stableStringify(successor)).toBe(before);
  });

  it.each([
    { contractId: 0 }, { contractId: -0 }, { settlementId: -1 }, { selectedAtTick: -1 },
    { selectedAtTick: 999_999 }, { lastProgressAtTick: 0 }, { nextReassessmentAtTick: 0 },
    { phase: "used" }, { phase: "waiting", waitReason: null },
    { waitReason: "no-stock" }, { waitReason: "observed-water" }, { extra: true },
  ])("rejects malformed pickup state without partial fallback: %j", (delta) => {
    const { raw, binding } = fixture();
    expect(canonicalizeResidentActivity({ ...raw, pickupTask: { ...raw.pickupTask, ...delta } }, binding)).toBeNull();
  });

  it("requires every explicit task field and canonical target coordinates", () => {
    const { raw, binding } = fixture();
    for (const key of Object.keys(raw.pickupTask)) {
      const task: Record<string, unknown> = { ...raw.pickupTask };
      delete task[key];
      expect(canonicalizeResidentActivity({ ...raw, pickupTask: task }, binding), key).toBeNull();
    }
    expect(canonicalizeResidentActivity({ ...raw, pickupTask: { ...raw.pickupTask,
      target: { ...raw.pickupTask.target, localX: -1 },
    } }, binding)).toBeNull();
  });

  it.each(["no-traversable-route", "outside-local-corridor", "no-stock", "no-active-route"] as const)("retains the explicit waiting cause %s", (waitReason) => {
    const { raw, binding } = fixture("waiting");
    const candidate = { ...raw, pickupTask: { ...raw.pickupTask, waitReason } };
    expect(canonicalizeResidentActivity(candidate, binding)).toEqual(candidate);
  });

  it("requires the arrived body to be at the exact target", () => {
    const { raw, target, binding } = fixture("arrived");
    expect(canonicalizeResidentActivity({ ...raw,
      poses: [{ position: translateWorldPosition(target, 1, 0), heading: 0 }],
    }, binding)).toBeNull();
  });

  it("keeps every existing task exclusive with pickup and forbidden under the accepted commitment", () => {
    const current = fixture();
    for (const [name, task] of Object.entries(serviceTasks(current))) {
      const serviceOnly = { ...current.raw, pickupTask: null, [name]: task };
      expect(canonicalizeResidentActivity(serviceOnly, current.binding), name).not.toBeNull();
      expect(canonicalizeResidentActivity({ ...current.raw, [name]: task }, current.binding), name).toBeNull();
      expect(() => replaceResidentActivity(current.resident, serviceOnly), name).toThrow(RangeError);
    }
    expect(replaceResidentActivity(current.resident, current.raw).activity).toEqual(current.raw);
    expect(() => replaceResidentActivity(current.resident, { ...current.raw,
      pickupTask: { ...current.raw.pickupTask, contractId: current.contract.id + 1 },
    })).toThrow(RangeError);
    expect(() => replaceResidentActivity(current.resident, { ...current.raw,
      pickupTask: { ...current.raw.pickupTask, settlementId: current.contract.destinationSettlementId },
    })).toThrow(RangeError);
  });

  it("authenticates the pickup binding independently of a malformed activity", () => {
    const { world, resident, contract, target } = fixture();
    resident.activity = { malformed: true } as unknown as ResidentActivity;
    expect(residentAcceptedPickupBinding(world, resident)).toEqual({ contract, target });
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
  });

  it.each([
    ["foreign assignment", (contract: ContractState, resident: ResidentState) => { contract.assignedResidentId = resident.id + 1; }],
    ["player custody", (contract: ContractState) => { contract.carrierKind = "player"; }],
    ["missing acceptance", (contract: ContractState) => { contract.acceptedTick = null; }],
    ["already carrying", (contract: ContractState) => { contract.cargoQuantity = 1; }],
    ["not accepted", (contract: ContractState) => { contract.status = "in-transit"; }],
    ["released commitment", (_contract: ContractState, resident: ResidentState) => { resident.activeContractId = null; }],
    ["foreign active contract", (contract: ContractState, resident: ResidentState) => { resident.activeContractId = contract.id + 1; }],
    ["foreign origin membership", (contract: ContractState, resident: ResidentState) => {
      resident.location = { kind: "settlement", settlementId: contract.destinationSettlementId };
    }],
    ["coarse route membership", (contract: ContractState, resident: ResidentState) => {
      resident.location = { kind: "route", routeId: contract.routeId, progress: 0 };
    }],
  ] as const)("rejects %s at the world boundary", (_label, mutate) => {
    const { world, contract, resident, raw } = fixture();
    resident.activity = raw;
    mutate(contract, resident);
    expect(residentAcceptedPickupBinding(world, resident)).toBeNull();
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
  });

  it.each(["duplicate-id", "second-accepted", "second-in-transit"] as const)("rejects ambiguous contract authority: %s", (mode) => {
    const { world, contract, resident, raw } = fixture();
    resident.activity = raw;
    world.contracts.push({ ...structuredClone(contract),
      id: mode === "duplicate-id" ? contract.id : world.meta.nextEntityId,
      status: mode === "second-in-transit" ? "in-transit" : "accepted",
    });
    expect(residentAcceptedPickupBinding(world, resident)).toBeNull();
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
  });

  it("binds task contract, origin, center and selection time to the accepted offer", () => {
    const { world, resident, contract, raw, target, binding } = fixture();
    for (const delta of [
      { contractId: contract.id + 1 }, { settlementId: contract.destinationSettlementId },
      { target: translateWorldPosition(target, 1, 0) },
      { selectedAtTick: contract.acceptedTick! - 1 },
    ]) {
      const candidate = { ...raw, pickupTask: { ...raw.pickupTask, ...delta } };
      expect(canonicalizeResidentActivity(candidate, binding)).not.toBeNull();
      resident.activity = candidate;
      expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
    }
  });

  it("keeps binding separate from support while requiring dry support for actual arrival", () => {
    const { world, resident, contract, origin, target, raw } = fixture("arrived");
    resident.activity = raw;
    world.terrain.tiles[origin.tileIndex]!.terrain = "deep-water";
    expect(residentAcceptedPickupBinding(world, resident)).toEqual({ contract, target });
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
    resident.activity = { ...raw, pickupTask: { ...raw.pickupTask, phase: "waiting", waitReason: "no-traversable-route" } };
    expect(canonicalResidentActivityForWorld(world, resident)).toEqual(resident.activity);
  });

  it.each(["stock-shortage", "no-active-route", "deadline-pending"] as const)("retains an authenticated task through transient %s before engine handling", (condition) => {
    const { world, resident, contract, origin, raw, target } = fixture("waiting");
    resident.activity = raw;
    if (condition === "stock-shortage") {
      world.ledger.consumed[contract.resource] += origin.inventory[contract.resource];
      origin.inventory[contract.resource] = 0;
    } else if (condition === "no-active-route") {
      for (const route of world.routes) route.condition = 0;
      expect(findAutonomousRoutePlan(world, contract.originSettlementId, contract.destinationSettlementId)).toBeUndefined();
    } else {
      contract.dueTick = world.meta.completedTick - 1;
    }
    expect(residentAcceptedPickupBinding(world, resident)).toEqual({ contract, target });
    expect(canonicalResidentActivityForWorld(world, resident)).toEqual(raw);
    expect(contract.status).toBe("accepted");
    expect(contract.cargoQuantity).toBe(0);
  });
});
