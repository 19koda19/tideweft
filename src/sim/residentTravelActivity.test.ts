import { describe, expect, it } from "vitest";

import { createWorldPosition, translateWorldPosition } from "../game/worldPosition";
import { createWorld } from "./public";
import {
  RESIDENT_PICKUP_ACTIVITY_OWNER_ID,
  RESIDENT_PICKUP_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  canonicalizeResidentActivity,
  replaceResidentActivity,
  residentActivitySupportsEnvironment,
  residentActivitySupportsInspection,
  residentActivitySupportsMaterials,
  residentActivitySupportsPickup,
  residentActivitySupportsRations,
  residentActivitySupportsTravel,
  type ResidentActivity,
  type ResidentPhysicalTravelTask,
  type ResidentTravelTask,
} from "./residentActivity";
import { stableStringify } from "./util";

// Synthetic codec/replacement foundations use a real generated identity only.
// Route membership and commitment below are arranged, not native acceptance,
// authenticated world itineraries, autonomous travel or destination handoff.
const MODEL_WORLD = createWorld("resident itinerary codec foundation", "standard");

function fixture(phase = 0) {
  const resident = structuredClone(MODEL_WORLD.residents[0]!);
  const route = MODEL_WORLD.routes[0]!;
  const contractId = MODEL_WORLD.contracts[0]!.id;
  const tick = resident.perception.tick;
  const position = createWorldPosition({ x: 0, y: 0 }, 20_500, 20_500);
  resident.location = { kind: "route", routeId: route.id, progress: 0 };
  resident.activeContractId = contractId;
  const travelTask: ResidentPhysicalTravelTask = {
    kind: "contract-travel", contractId, mode: "physical",
    legIndex: 0, waypointIndex: 1, selectedAtTick: tick,
    lastProgressAtTick: tick, nextReassessmentAtTick: tick + 1,
    phase: "approaching", waitReason: null,
  };
  const raw = {
    version: RESIDENT_TRAVEL_ACTIVITY_VERSION, ownerId: RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
    actorId: resident.identity.stableId, tick,
    poses: Array.from({ length: phase + 1 }, (_, index) => ({
      position: translateWorldPosition(position, index * 80, 0), heading: 0,
    })),
    restTask: null, rationTask: null, materialTask: null,
    inspectionTask: null, pickupTask: null, travelTask,
  } satisfies ResidentActivity;
  return { resident, raw, binding: { actorId: raw.actorId, tick, phase } };
}

function legacyActivity(phase = 0) {
  const current = fixture(phase);
  const travelTask: ResidentTravelTask = {
    kind: "contract-travel", contractId: current.raw.travelTask.contractId,
    mode: "legacy-coarse", adoptedAtTick: current.raw.tick - 1,
  };
  return { ...current, raw: {
    ...current.raw,
    poses: current.raw.poses.map(() => structuredClone(current.raw.poses[0]!)),
    travelTask,
  } };
}

function previousTasks(current: ReturnType<typeof fixture>): Record<string, unknown> {
  const common = {
    settlementId: current.resident.homeSettlementId,
    target: current.raw.poses[0]!.position,
    selectedAtTick: current.raw.tick,
    lastProgressAtTick: current.raw.tick,
    nextReassessmentAtTick: current.raw.tick + 1,
    phase: "approaching", waitReason: null,
  };
  return {
    restTask: { ...common, kind: "settlement-rest", cause: "urgent-rest", origin: "selected", legacySettlementOrdinal: null },
    rationTask: { ...common, kind: "settlement-ration", usedAtTick: null, foodUsed: false, waterUsed: false },
    materialTask: { ...common, kind: "settlement-material", projectId: 1, resource: "reed", usedAtTick: null },
    inspectionTask: { ...common, kind: "settlement-inspection", storeId: "STORE-travel-fixture", sourceEvidenceId: "store-evidence:travel-fixture" },
    pickupTask: { ...common, kind: "contract-pickup", contractId: current.raw.travelTask.contractId },
  };
}

describe("explicit resident travel activity protocol foundations", () => {
  it("recognizes only the explicit successor and retains every prior capability", () => {
    for (const supports of [residentActivitySupportsRations, residentActivitySupportsMaterials,
      residentActivitySupportsInspection, residentActivitySupportsEnvironment,
      residentActivitySupportsPickup, residentActivitySupportsTravel]) {
      expect(supports({ version: RESIDENT_TRAVEL_ACTIVITY_VERSION })).toBe(true);
      for (const version of [8, 99, Number.MAX_SAFE_INTEGER]) {
        expect(supports({ version } as Pick<ResidentActivity, "version">)).toBe(false);
      }
    }
    expect(residentActivitySupportsTravel({ version: RESIDENT_PICKUP_ACTIVITY_VERSION })).toBe(false);
    expect(residentActivitySupportsTravel(null)).toBe(false);
    expect(residentActivitySupportsTravel(undefined)).toBe(false);
  });

  it("requires the explicit nullable field without treating null as a journey", () => {
    const { raw, binding } = fixture();
    const empty = { ...raw, travelTask: null };
    expect(canonicalizeResidentActivity(empty, binding)).toEqual(empty);
    const { travelTask: _task, ...missing } = empty;
    expect(canonicalizeResidentActivity(missing, binding)).toBeNull();
    expect(canonicalizeResidentActivity({ ...empty, travelTask: undefined }, binding)).toBeNull();
    expect(canonicalizeResidentActivity({ ...raw, ownerId: RESIDENT_PICKUP_ACTIVITY_OWNER_ID }, binding)).toBeNull();
  });

  it.each([0, 4, 9])("retains exact physical phase%s through detached cold clones", (phase) => {
    const { resident, raw, binding } = fixture(phase);
    const before = stableStringify(raw);
    const activity = canonicalizeResidentActivity(raw, binding);
    expect(activity).toEqual(raw);
    expect(Object.isFrozen(activity)).toBe(true);
    expect(Object.isFrozen(activity?.travelTask)).toBe(true);
    expect(Object.isFrozen(activity?.poses)).toBe(true);
    expect(Object.isFrozen(activity?.poses[0]?.position)).toBe(true);
    expect(Object.isFrozen(activity?.poses[0]?.position.region)).toBe(true);
    const cold = structuredClone(activity);
    expect(cold).not.toBe(activity);
    expect(canonicalizeResidentActivity(cold, binding)).toEqual(activity);
    expect(canonicalizeResidentActivity(cold, { ...binding, phase: phase + 1 })).toBeNull();
    expect(replaceResidentActivity(resident, cold).activity).toEqual(activity);
    expect(stableStringify(raw)).toBe(before);
    expect(Object.hasOwn(resident, "activity")).toBe(false);
  });

  it.each([0, 4, 9])("retains a stationary explicit legacy journey at phase%s", (phase) => {
    const { resident, raw, binding } = legacyActivity(phase);
    const before = stableStringify(raw);
    const activity = canonicalizeResidentActivity(structuredClone(raw), binding);
    expect(activity).toEqual(raw);
    expect(Object.isFrozen(activity?.travelTask)).toBe(true);
    expect(replaceResidentActivity(resident, activity).activity).toEqual(activity);
    expect(stableStringify(raw)).toBe(before);
  });

  it("does not permit fine displacement under legacy coarse permission", () => {
    const { raw, binding } = fixture(4);
    const legacy = legacyActivity(4).raw.travelTask;
    expect(canonicalizeResidentActivity({ ...raw, travelTask: legacy }, binding)).toBeNull();
  });

  it.each([1, 2, 3, 4, 5, 6] as const)("preserves frozen v%s without adding future travel authority", (version) => {
    const { raw, binding } = fixture();
    const prior: Record<string, unknown> = {
      ...raw, version, ownerId: `sim:resident-activity:v${version}`,
    };
    delete prior.travelTask;
    if (version < 6) delete prior.pickupTask;
    if (version < 4) delete prior.inspectionTask;
    if (version < 3) delete prior.materialTask;
    if (version < 2) delete prior.rationTask;
    expect(canonicalizeResidentActivity(prior, binding)).toEqual(prior);
    for (const travelTask of [null, raw.travelTask, legacyActivity().raw.travelTask]) {
      expect(canonicalizeResidentActivity({ ...prior, travelTask }, binding)).toBeNull();
    }
    expect(residentActivitySupportsTravel({ version })).toBe(false);
  });

  it.each([8, 99, Number.MAX_SAFE_INTEGER])("rejects genuinely unknown protocol %s", (version) => {
    const { raw, binding } = fixture();
    expect(canonicalizeResidentActivity({ ...raw, version, ownerId: `sim:resident-activity:v${version}` }, binding)).toBeNull();
  });

  it.each([
    { contractId: 0 }, { contractId: -0 }, { contractId: Number.MAX_SAFE_INTEGER + 1 },
    { mode: "coarse" }, { kind: "route-walk" }, { legIndex: -1 }, { legIndex: -0 },
    { legIndex: 0.5 }, { waypointIndex: 0 }, { waypointIndex: -0 }, { waypointIndex: NaN },
    { selectedAtTick: -1 }, { selectedAtTick: 999_999 }, { lastProgressAtTick: 0 },
    { lastProgressAtTick: 999_999 }, { nextReassessmentAtTick: 0 },
    { phase: "used" }, { phase: "waiting", waitReason: null },
    { waitReason: "no-active-route" }, { waitReason: "no-stock" }, { waitReason: "observed-water" },
    { adoptedAtTick: 420 }, { extra: true },
  ])("rejects malformed physical travel without partial fallback: %j", (delta) => {
    const { raw, binding } = fixture();
    expect(canonicalizeResidentActivity({ ...raw, travelTask: { ...raw.travelTask, ...delta } }, binding)).toBeNull();
  });

  it.each(["no-traversable-route", "outside-local-corridor", "no-active-route", "weather-hold", "disturbed"] as const)("retains the explicit physical waiting cause %s", (waitReason) => {
    const { raw, binding } = fixture();
    const candidate = { ...raw, travelTask: { ...raw.travelTask, phase: "waiting", waitReason } };
    expect(canonicalizeResidentActivity(candidate, binding)).toEqual(candidate);
  });

  it.each(["approaching", "arrived"] as const)("retains %s as shape only, without inventing world arrival proof", (phase) => {
    const { raw, binding } = fixture();
    const candidate = { ...raw, travelTask: { ...raw.travelTask, phase, waitReason: null } };
    expect(canonicalizeResidentActivity(candidate, binding)).toEqual(candidate);
    expect(canonicalizeResidentActivity({ ...candidate, travelTask: { ...candidate.travelTask, waitReason: "weather-hold" } }, binding)).toBeNull();
  });

  it.each([
    { contractId: 0 }, { adoptedAtTick: -1 }, { adoptedAtTick: -0 },
    { adoptedAtTick: 999_999 }, { adoptedAtTick: 0.5 }, { adoptedAtTick: Infinity },
    { legIndex: 0 }, { waypointIndex: 1 }, { phase: "waiting" }, { waitReason: null },
  ])("rejects malformed legacy permission: %j", (delta) => {
    const { raw, binding } = legacyActivity();
    expect(canonicalizeResidentActivity({ ...raw, travelTask: { ...raw.travelTask, ...delta } }, binding)).toBeNull();
  });

  it("requires every variant field and rejects accessor, symbolic or non-enumerable additions", () => {
    for (const current of [fixture(), legacyActivity()]) {
      const { raw, binding } = current;
      for (const key of Object.keys(raw.travelTask)) {
        const task: Record<string, unknown> = { ...raw.travelTask };
        delete task[key];
        expect(canonicalizeResidentActivity({ ...raw, travelTask: task }, binding), key).toBeNull();
      }
      const symbolic = { ...raw.travelTask, [Symbol("hidden")]: true };
      expect(canonicalizeResidentActivity({ ...raw, travelTask: symbolic }, binding)).toBeNull();
      const hidden = Object.defineProperty({ ...raw.travelTask }, "contractId", { value: raw.travelTask.contractId, enumerable: false });
      expect(canonicalizeResidentActivity({ ...raw, travelTask: hidden }, binding)).toBeNull();
      const accessor = Object.defineProperty({ ...raw.travelTask }, "mode", { get: () => raw.travelTask.mode, enumerable: true });
      expect(canonicalizeResidentActivity({ ...raw, travelTask: accessor }, binding)).toBeNull();
    }
  });

  it("keeps travel exclusive with all five earlier task families", () => {
    const current = fixture();
    for (const [name, task] of Object.entries(previousTasks(current))) {
      const priorOnly = { ...current.raw, travelTask: null, [name]: task };
      expect(canonicalizeResidentActivity(priorOnly, current.binding), name).not.toBeNull();
      expect(canonicalizeResidentActivity({ ...current.raw, [name]: task }, current.binding), name).toBeNull();
      expect(canonicalizeResidentActivity({ ...legacyActivity().raw, [name]: task }, current.binding), name).toBeNull();
    }
  });

  it.each(["physical", "legacy-coarse"] as const)("requires route membership and the exact active commitment for %s replacement", (mode) => {
    const { resident, raw, binding } = mode === "physical" ? fixture() : legacyActivity();
    expect(replaceResidentActivity(resident, raw).activity).toEqual(raw);
    expect(() => replaceResidentActivity({ ...resident, activeContractId: null }, raw)).toThrow(RangeError);
    expect(() => replaceResidentActivity({ ...resident, activeContractId: raw.travelTask.contractId + 1 }, raw)).toThrow(RangeError);
    expect(() => replaceResidentActivity({ ...resident, location: { kind: "settlement", settlementId: resident.homeSettlementId } }, raw)).toThrow(RangeError);
    expect(canonicalizeResidentActivity(raw, { ...binding, actorId: `${binding.actorId}-foreign` })).toBeNull();
    expect(canonicalizeResidentActivity(raw, { ...binding, tick: binding.tick + 1 })).toBeNull();
  });
});
