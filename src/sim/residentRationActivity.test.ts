import { describe, expect, it } from "vitest";

import { translateWorldPosition } from "../game/worldPosition";
import { createWorld } from "./public";
import {
  RESIDENT_ACTIVITY_OWNER_ID,
  RESIDENT_ACTIVITY_VERSION,
  RESIDENT_SERVICE_ACTIVITY_OWNER_ID,
  RESIDENT_SERVICE_ACTIVITY_VERSION,
  canonicalizeResidentActivity,
} from "./residentActivity";
import { residentSettlementRationTarget } from "./residentActivityWorld";
import { stableStringify } from "./util";

// Codec-only model evidence with native identity and shared service geometry.
// A valid task shape is not proof of selected activity, actual arrival, stock
// consumption or a committed service/use receipt; those have separate owners.
const MODEL_WORLD = createWorld("resident ration activity codec", "standard");

function fixture(phase: "approaching" | "waiting" | "arrived" | "used" = "approaching") {
  const resident = MODEL_WORLD.residents.find((candidate) => candidate.location.kind === "settlement"
    && candidate.activeContractId === null)!;
  const target = residentSettlementRationTarget(MODEL_WORLD, resident);
  if (target === null || resident.location.kind !== "settlement") throw new Error("model needs native service geometry");
  const binding = { actorId: resident.identity.stableId, tick: resident.perception.tick };
  const task: Record<string, unknown> = {
    kind: "settlement-ration",
    settlementId: resident.location.settlementId,
    target: structuredClone(target),
    selectedAtTick: binding.tick - 1,
    phase,
    lastProgressAtTick: phase === "arrived" || phase === "used" ? binding.tick : binding.tick - 1,
    nextReassessmentAtTick: binding.tick + 1,
    waitReason: phase === "waiting" ? "no-traversable-route" : null,
    usedAtTick: phase === "used" ? binding.tick : null,
    foodUsed: phase === "used",
    waterUsed: false,
  };
  const raw: Record<string, unknown> = {
    version: RESIDENT_SERVICE_ACTIVITY_VERSION,
    ownerId: RESIDENT_SERVICE_ACTIVITY_OWNER_ID,
    actorId: binding.actorId,
    tick: binding.tick,
    poses: [{ position: structuredClone(target), heading: 0 }],
    restTask: null,
    rationTask: task,
  };
  return { raw, task, binding, target };
}

describe("explicit resident ration activity protocol", () => {
  it("keeps frozen v1 body/rest identity distinct from service-capable v2", () => {
    expect(RESIDENT_ACTIVITY_VERSION).toBe(1);
    expect(RESIDENT_ACTIVITY_OWNER_ID).toBe("sim:resident-activity:v1");
    expect(RESIDENT_SERVICE_ACTIVITY_VERSION).toBe(2);
    expect(RESIDENT_SERVICE_ACTIVITY_OWNER_ID).toBe("sim:resident-activity:v2");
    const { raw, binding } = fixture();
    raw.rationTask = null;
    const v2 = canonicalizeResidentActivity(raw, binding)!;
    expect(v2).not.toBeNull();
    expect(Object.hasOwn(v2, "rationTask")).toBe(true);
    const v1 = { ...raw, version: RESIDENT_ACTIVITY_VERSION, ownerId: RESIDENT_ACTIVITY_OWNER_ID };
    delete (v1 as Record<string, unknown>).rationTask;
    const before = stableStringify(v1);
    const parsed = canonicalizeResidentActivity(v1, binding)!;
    expect(parsed).not.toBeNull();
    expect(Object.hasOwn(parsed, "rationTask")).toBe(false);
    expect(stableStringify(canonicalizeResidentActivity(structuredClone(parsed), binding))).toBe(before);
    expect(stableStringify(v1)).toBe(before);
    for (const rationTask of [null, fixture().task]) {
      expect(canonicalizeResidentActivity({ ...v1, rationTask }, binding)).toBeNull();
    }
  });

  it.each(["approaching", "waiting", "arrived", "used"] as const)("accepts exact %s ration shape without changing the model input", (phase) => {
    const { raw, task, binding } = fixture(phase);
    const before = structuredClone(raw);
    const parsed = canonicalizeResidentActivity(raw, binding)!;
    expect(parsed).not.toBeNull();
    expect(parsed.rationTask).toEqual(task);
    expect(parsed.restTask).toBeNull();
    expect(raw).toEqual(before);
    expect(canonicalizeResidentActivity(structuredClone(parsed), binding)).toEqual(parsed);
  });

  it.each([
    { foodUsed: true, waterUsed: false },
    { foodUsed: false, waterUsed: true },
    { foodUsed: true, waterUsed: true },
  ])("retains independent committed-use flags $foodUsed/$waterUsed", (flags) => {
    const { raw, task, binding } = fixture("used");
    Object.assign(task, flags);
    expect(canonicalizeResidentActivity(raw, binding)?.rationTask).toMatchObject({
      phase: "used", usedAtTick: binding.tick, ...flags,
    });
  });

  it("requires explicit v2 null/task, matching version/owner and exclusive rest/ration tasks", () => {
    const { raw, task, binding, target } = fixture();
    const missing = { ...raw };
    delete missing.rationTask;
    for (const candidate of [missing, { ...raw, rationTask: undefined },
      { ...raw, ownerId: RESIDENT_ACTIVITY_OWNER_ID }, { ...raw, version: 3 },
      { ...raw, version: RESIDENT_ACTIVITY_VERSION }, { ...raw, extraServiceField: true }]) {
      expect(canonicalizeResidentActivity(candidate, binding)).toBeNull();
    }
    raw.restTask = {
      kind: "settlement-rest", settlementId: task.settlementId, target,
      selectedAtTick: binding.tick - 1, cause: "urgent-rest", origin: "selected",
      legacySettlementOrdinal: null, phase: "approaching", lastProgressAtTick: binding.tick - 1,
      nextReassessmentAtTick: binding.tick + 1, waitReason: null,
    };
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
    raw.rationTask = null;
    expect(canonicalizeResidentActivity(raw, binding)?.restTask?.kind).toBe("settlement-rest");
  });

  it("rejects malformed task identity, field shape, clocks, waits and uncommitted-use flags", () => {
    const alterations: Array<(task: Record<string, unknown>, tick: number) => void> = [
      (task) => { delete task.usedAtTick; },
      (task) => { task.usedAtTick = undefined; },
      (task) => { task.kind = "meal-animation"; },
      (task) => { task.settlementId = 0; },
      (task) => { task.extra = true; },
      (task, tick) => { task.selectedAtTick = tick + 1; },
      (task) => { task.selectedAtTick = -0; },
      (task, tick) => { task.lastProgressAtTick = tick - 2; },
      (task, tick) => { task.lastProgressAtTick = tick + 1; },
      (task, tick) => { task.nextReassessmentAtTick = tick - 2; },
      (task) => { task.nextReassessmentAtTick = 0.5; },
      (task) => { task.phase = "complete"; },
      (task) => { task.phase = "waiting"; },
      (task) => { task.waitReason = "no-traversable-route"; },
      (task) => { task.phase = "waiting"; task.waitReason = "stock-created"; },
      (task) => { task.foodUsed = true; },
      (task) => { task.waterUsed = true; },
      (task) => { task.foodUsed = "true"; },
      (task) => { task.waterUsed = 1; },
      (task, tick) => { task.usedAtTick = tick; },
    ];
    for (const alter of alterations) {
      const { raw, task, binding } = fixture();
      alter(task, binding.tick);
      expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
    }
  });

  it("requires a later hourly use marker with matching progress and some consumed resource", () => {
    const alterations: Array<(task: Record<string, unknown>, tick: number) => void> = [
      (task) => { task.usedAtTick = null; },
      (task) => { task.usedAtTick = -0; },
      (task, tick) => { task.usedAtTick = tick + 60; },
      (task, tick) => { task.usedAtTick = tick - 1; },
      (task, tick) => { task.usedAtTick = tick - 60; task.lastProgressAtTick = tick - 60; },
      (task, tick) => { task.selectedAtTick = tick; },
      (task, tick) => { task.lastProgressAtTick = tick - 1; },
      (task) => { task.foodUsed = false; task.waterUsed = false; },
    ];
    for (const alter of alterations) {
      const { raw, task, binding } = fixture("used");
      alter(task, binding.tick);
      expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
    }
  });

  it.each(["arrived", "used"] as const)("requires the exact retained body point for %s", (phase) => {
    const { raw, task, binding, target } = fixture(phase);
    task.target = translateWorldPosition(target, 1, 0);
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
    // Approach is only a shape here. The world owner must still authenticate
    // service geography; the codec must not pretend to provide that proof.
    raw.rationTask = { ...task, phase: "approaching", usedAtTick: null, foodUsed: false, waterUsed: false };
    expect(canonicalizeResidentActivity(raw, binding)).not.toBeNull();
  });

  it("rejects accessors and hidden/symbol task fields without executing getters", () => {
    let reads = 0;
    const { raw, binding } = fixture();
    Object.defineProperty(raw, "version", { enumerable: true, get() { reads += 1; return 2; } });
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
    for (const alteration of ["accessor", "hidden", "symbol"] as const) {
      const current = fixture();
      if (alteration === "accessor") Object.defineProperty(current.task, "foodUsed", {
        enumerable: true, get() { reads += 1; return false; },
      });
      else if (alteration === "hidden") Object.defineProperty(current.raw, "rationTask", {
        enumerable: false, value: current.task,
      });
      else Object.defineProperty(current.task, Symbol("hidden ration cause"), { value: true });
      expect(canonicalizeResidentActivity(current.raw, current.binding)).toBeNull();
    }
    expect(reads).toBe(0);
  });

  it("returns detached recursively frozen service state with exact cold-clone content", () => {
    const { raw, binding, target } = fixture("used");
    const parsed = canonicalizeResidentActivity(raw, binding)!;
    const cold = canonicalizeResidentActivity(structuredClone(parsed), binding)!;
    expect(cold).toEqual(parsed);
    expect(cold).not.toBe(parsed);
    expect(cold.rationTask).not.toBe(parsed.rationTask);
    expect(stableStringify(cold)).toBe(stableStringify(parsed));
    for (const value of [parsed, parsed.poses, parsed.poses[0], parsed.poses[0]!.position,
      parsed.rationTask, parsed.rationTask!.target, parsed.rationTask!.target.region]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    (raw.rationTask as Record<string, unknown>).target = translateWorldPosition(target, 1, 0);
    expect(parsed.rationTask?.target).toEqual(target);
    expect(Object.hasOwn(MODEL_WORLD.residents[0]!, "activity")).toBe(false);
  });
});
