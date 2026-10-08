import { describe, expect, it } from "vitest";

import { createWorld } from "./public";
import {
  RESIDENT_CIVIC_ACTIVITY_OWNER_ID, RESIDENT_CIVIC_ACTIVITY_VERSION,
  RESIDENT_SERVICE_ACTIVITY_OWNER_ID, RESIDENT_SERVICE_ACTIVITY_VERSION,
  canonicalizeResidentActivity, residentActivitySupportsRations,
} from "./residentActivity";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport, residentSettlementRationTarget } from "./residentActivityWorld";
import { stableStringify } from "./util";

// Codec/world-reference fixtures, not proof of selected or completed work.
const BASE = createWorld("resident activity executable rest approach", "standard");

function fixture(phase: "approaching" | "waiting" | "arrived" | "used" = "approaching") {
  const world = structuredClone(BASE);
  const resident = world.residents.find((candidate) => {
    const target = residentSettlementRationTarget(world, candidate);
    return candidate.activeContractId === null && target !== null && residentRestTargetHasDrySupport(world, target);
  })!;
  if (resident.location.kind !== "settlement") throw new Error("Native codec fixture needs membership");
  const settlement = world.settlements.find(({ id }) => resident.location.kind === "settlement"
    && id === resident.location.settlementId)!;
  const target = residentSettlementRationTarget(world, resident)!;
  const tick = world.meta.completedTick;
  const raw = {
    version: RESIDENT_CIVIC_ACTIVITY_VERSION, ownerId: RESIDENT_CIVIC_ACTIVITY_OWNER_ID,
    actorId: resident.identity.stableId, tick, poses: [{ position: target, heading: 0 }],
    restTask: null, rationTask: null,
    materialTask: {
      kind: "settlement-material", settlementId: settlement.id, projectId: settlement.project.id,
      resource: settlement.project.resource, target, selectedAtTick: tick - 1,
      phase, lastProgressAtTick: phase === "used" ? tick : tick - 1,
      nextReassessmentAtTick: tick + 1,
      waitReason: phase === "waiting" ? "no-material" : null,
      usedAtTick: phase === "used" ? tick : null,
    },
  };
  return { world, resident, settlement, raw, binding: { actorId: raw.actorId, tick } };
}

describe("explicit civic material activity protocol", () => {
  it.each(["approaching", "waiting", "arrived", "used"] as const)("retains strict %s shape through a cold clone", (phase) => {
    const { raw, binding } = fixture(phase);
    const before = stableStringify(raw);
    const activity = canonicalizeResidentActivity(raw, binding);
    expect(activity).toEqual(raw);
    expect(Object.isFrozen(activity)).toBe(true);
    expect(canonicalizeResidentActivity(structuredClone(activity), binding)).toEqual(activity);
    expect(stableStringify(raw)).toBe(before);
    expect(residentActivitySupportsRations(activity)).toBe(true);
  });

  it("requires v3's explicit field and never imports it through v2 or a future numeric version", () => {
    const { raw, binding } = fixture();
    const v2 = { ...raw, version: RESIDENT_SERVICE_ACTIVITY_VERSION, ownerId: RESIDENT_SERVICE_ACTIVITY_OWNER_ID };
    expect(canonicalizeResidentActivity(v2, binding)).toBeNull();
    expect(canonicalizeResidentActivity({ ...v2, materialTask: null }, binding)).toBeNull();
    const { materialTask: _material, ...legacy } = v2;
    expect(canonicalizeResidentActivity(legacy, binding)).not.toBeNull();
    expect(canonicalizeResidentActivity({ ...raw, materialTask: undefined }, binding)).toBeNull();
    const { materialTask: _task, ...missing } = raw;
    expect(canonicalizeResidentActivity(missing, binding)).toBeNull();
    expect(canonicalizeResidentActivity({ ...raw, version: 4 }, binding)).toBeNull();
    expect(residentActivitySupportsRations({ version: 4 } as unknown as typeof raw)).toBe(false);
  });

  it.each([
    { projectId: 0 }, { projectId: -0 }, { resource: "invented" }, { selectedAtTick: 999_999 },
    { lastProgressAtTick: -1 }, { nextReassessmentAtTick: -1 }, { phase: "waiting", waitReason: null },
    { waitReason: "no-material" }, { usedAtTick: 420 },
    { phase: "used", usedAtTick: 419, lastProgressAtTick: 419 },
    { phase: "used", usedAtTick: 480, lastProgressAtTick: 480 }, { extra: true },
  ])("rejects malformed task without partial fallback: %j", (delta) => {
    const { raw, binding } = fixture();
    expect(canonicalizeResidentActivity({ ...raw, materialTask: { ...raw.materialTask, ...delta } }, binding)).toBeNull();
  });

  it("requires exact arrival pose and exclusive service/rest tasks", () => {
    const { raw, binding } = fixture("arrived");
    expect(canonicalizeResidentActivity({ ...raw, poses: [{ position: { ...raw.poses[0]!.position, localX: raw.poses[0]!.position.localX + 1 }, heading: 0 }] }, binding)).toBeNull();
    expect(canonicalizeResidentActivity({ ...raw, rationTask: {
      kind: "settlement-ration", settlementId: raw.materialTask.settlementId, target: raw.materialTask.target,
      selectedAtTick: binding.tick - 1, phase: "approaching", lastProgressAtTick: binding.tick - 1,
      nextReassessmentAtTick: binding.tick + 1, waitReason: null, usedAtTick: null, foodUsed: false, waterUsed: false,
    } }, binding)).toBeNull();
  });

  it("binds project/resource and permits a completed-use marker, not an unfinished request to a completed project", () => {
    const { world, resident, settlement, raw } = fixture();
    resident.activity = raw as unknown as NonNullable<typeof resident.activity>;
    expect(canonicalResidentActivityForWorld(world, resident)).not.toBeNull();
    settlement.project.id += 1;
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
    settlement.project.id -= 1;
    const originalResource = settlement.project.resource;
    settlement.project.resource = originalResource === "parts" ? "reed" : "parts";
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
    settlement.project.resource = originalResource;
    settlement.project.status = "complete";
    settlement.project.progress = settlement.project.target;
    expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
    // Codec-only completed-marker construction, not proof of actual work.
    const used = fixture("used").raw;
    resident.activity = used as unknown as NonNullable<typeof resident.activity>;
    expect(canonicalResidentActivityForWorld(world, resident)).not.toBeNull();
    for (const invalid of [
      { kind: "invented" }, { status: "unknown" }, { target: 0 }, { progress: -1 }, { progress: -0 },
    ]) {
      Object.assign(settlement.project, invalid);
      expect(canonicalResidentActivityForWorld(world, resident)).toBeNull();
    }
  });
});
