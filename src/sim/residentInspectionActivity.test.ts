import { describe, expect, it } from "vitest";

import { adoptResidentActivities, prepareResidentRestActivities } from "../game/residentActivityExecution";
import { residentActivitySaveExtensionsValid } from "../game/residentActivitySaveBoundary";
import { translateWorldPosition } from "../game/worldPosition";
import { ACTOR_ID_MAX_LENGTH } from "./actorPerception";
import { createWorld, serializeWorld } from "./public";
import {
  RESIDENT_ACTIVITY_OWNER_ID, RESIDENT_ACTIVITY_VERSION,
  RESIDENT_SERVICE_ACTIVITY_OWNER_ID, RESIDENT_SERVICE_ACTIVITY_VERSION,
  RESIDENT_CIVIC_ACTIVITY_OWNER_ID, RESIDENT_CIVIC_ACTIVITY_VERSION,
  RESIDENT_INSPECTION_ACTIVITY_OWNER_ID, RESIDENT_INSPECTION_ACTIVITY_VERSION,
  canonicalizeResidentActivity, residentActivitySupportsInspection,
  type ResidentActivity,
} from "./residentActivity";
import {
  canonicalResidentActivityForWorld, residentCivicActivityCohortIsUniform,
  residentRestTargetHasDrySupport, residentSettlementRestTarget,
} from "./residentActivityWorld";
import { stableStringify } from "./util";

// Codec/capability evidence only. Native construction and phase-zero preparation
// supply real identities, body histories and settlement geometry. The v4 cohort
// and inspection task below are explicitly synthetic: they do not establish
// actual keeper evidence, autonomous selection, approach, arrival or closure.
function preparedModelWorld() {
  const world = createWorld("resident activity executable rest approach", "standard");
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 950_000 };
    resident.condition.exhaustion = 100_000;
  }
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world)).toBe(true);
  world.residents = world.residents.map((resident) => {
    const activity = canonicalizeResidentActivity({
      ...resident.activity,
      version: RESIDENT_INSPECTION_ACTIVITY_VERSION,
      ownerId: RESIDENT_INSPECTION_ACTIVITY_OWNER_ID,
      restTask: null, rationTask: null, materialTask: null, inspectionTask: null,
    }, { actorId: resident.identity.stableId, tick: world.meta.completedTick, phase: 0 });
    if (activity === null) throw new Error("Synthetic protocol fixture lost its native body");
    return { ...resident, activity };
  });
  return world;
}

const MODEL_WORLD = preparedModelWorld();

function fixture() {
  const world = structuredClone(MODEL_WORLD);
  const index = world.residents.findIndex((resident) => {
    const target = residentSettlementRestTarget(world, resident);
    return resident.location.kind === "settlement" && resident.location.settlementId === resident.homeSettlementId
      && resident.activeContractId === null && target !== null && residentRestTargetHasDrySupport(world, target);
  });
  if (index < 0) throw new Error("Codec fixture needs a native dry home settlement");
  const resident = world.residents[index]!;
  const target = residentSettlementRestTarget(world, resident)!;
  const tick = world.meta.completedTick;
  const task: Record<string, unknown> = {
    kind: "settlement-inspection", settlementId: resident.homeSettlementId,
    storeId: `store:codec:${resident.homeSettlementId}`,
    sourceEvidenceId: `keeper-evidence:codec:${tick}`,
    target: structuredClone(target), selectedAtTick: tick - 1,
    phase: "approaching", lastProgressAtTick: tick - 1,
    nextReassessmentAtTick: tick + 1, waitReason: null,
  };
  const raw: Record<string, unknown> = { ...resident.activity, inspectionTask: task };
  const binding = { actorId: resident.identity.stableId, tick, phase: 0 };
  return { world, index, target, task, raw, binding };
}

function install(current: ReturnType<typeof fixture>, raw = current.raw) {
  current.world.residents[current.index] = {
    ...current.world.residents[current.index]!, activity: raw as unknown as ResidentActivity,
  };
}

function frozenProtocol(raw: Record<string, unknown>, version: 1 | 2 | 3): Record<string, unknown> {
  const { inspectionTask: _inspection, materialTask, rationTask, ...body } = raw;
  return {
    ...body, version,
    ownerId: version === RESIDENT_ACTIVITY_VERSION ? RESIDENT_ACTIVITY_OWNER_ID
      : version === RESIDENT_SERVICE_ACTIVITY_VERSION ? RESIDENT_SERVICE_ACTIVITY_OWNER_ID
        : RESIDENT_CIVIC_ACTIVITY_OWNER_ID,
    ...(version >= 2 ? { rationTask } : {}),
    ...(version === RESIDENT_CIVIC_ACTIVITY_VERSION ? { materialTask } : {}),
  };
}

describe("explicit resident inspection activity protocol", () => {
  it("requires explicit nullable v4 inspection state and rejects unknown protocol/owner mappings", () => {
    const { raw, binding } = fixture();
    const parsed = canonicalizeResidentActivity({ ...raw, inspectionTask: null }, binding);
    expect(parsed?.version).toBe(RESIDENT_INSPECTION_ACTIVITY_VERSION);
    expect(parsed?.ownerId).toBe(RESIDENT_INSPECTION_ACTIVITY_OWNER_ID);
    expect(Object.hasOwn(parsed!, "inspectionTask")).toBe(true);
    expect(residentActivitySupportsInspection(parsed)).toBe(true);
    const absent = { ...raw };
    delete absent.inspectionTask;
    for (const malformed of [absent, { ...raw, inspectionTask: undefined },
      { ...raw, version: 5, ownerId: "sim:resident-activity:v5" },
      { ...frozenProtocol(raw, 1), version: 5, ownerId: "sim:resident-activity:v5" },
      { ...raw, ownerId: RESIDENT_CIVIC_ACTIVITY_OWNER_ID }]) {
      expect(canonicalizeResidentActivity(malformed, binding)).toBeNull();
    }
  });

  it("returns exact detached frozen task/body records and preserves clone bytes without mutating inputs", () => {
    const { raw, task, binding } = fixture();
    const before = stableStringify(raw);
    const parsed = canonicalizeResidentActivity(raw, binding);
    expect(parsed).not.toBeNull();
    expect(stableStringify(parsed)).toBe(before);
    const cold = canonicalizeResidentActivity(structuredClone(parsed), binding);
    expect(cold).toEqual(parsed);
    expect(stableStringify(cold)).toBe(before);
    expect(stableStringify(raw)).toBe(before);
    expect(cold).not.toBe(parsed);
    expect(parsed!.inspectionTask).not.toBe(task);
    for (const value of [parsed, parsed!.poses, parsed!.poses[0], parsed!.inspectionTask,
      parsed!.inspectionTask!.target, parsed!.inspectionTask!.target.region]) expect(Object.isFrozen(value)).toBe(true);
    expect(Reflect.ownKeys(parsed!.inspectionTask!)).toEqual(Reflect.ownKeys(task));
    task.sourceEvidenceId = "changed:codec:evidence";
    expect(parsed!.inspectionTask!.sourceEvidenceId).not.toBe(task.sourceEvidenceId);
    expect(stableStringify(raw)).not.toBe(before);
    expect(stableStringify(parsed)).toBe(before);
  });

  it("rejects missing, hidden, accessor, symbol and additional task fields without invoking getters", () => {
    const { raw, task, binding } = fixture();
    let getterCalls = 0;
    for (const field of Object.keys(task)) {
      const missing = { ...task };
      delete missing[field];
      expect(canonicalizeResidentActivity({ ...raw, inspectionTask: missing }, binding), field).toBeNull();
      const hidden = { ...task };
      Object.defineProperty(hidden, field, { value: task[field], enumerable: false });
      expect(canonicalizeResidentActivity({ ...raw, inspectionTask: hidden }, binding), field).toBeNull();
      const accessor = { ...task };
      Object.defineProperty(accessor, field, { enumerable: true, get: () => { getterCalls += 1; return task[field]; } });
      expect(canonicalizeResidentActivity({ ...raw, inspectionTask: accessor }, binding), field).toBeNull();
    }
    const symbolic = { ...task, [Symbol("foreign")]: true };
    for (const malformed of [symbolic, { ...task, usedAtTick: null }, { ...task, closure: "secured" }]) {
      expect(canonicalizeResidentActivity({ ...raw, inspectionTask: malformed }, binding)).toBeNull();
    }
    for (const field of ["inspectionTask", "version"]) {
      const accessor = { ...raw };
      Object.defineProperty(accessor, field, { enumerable: true, get: () => { getterCalls += 1; return raw[field]; } });
      expect(canonicalizeResidentActivity(accessor, binding)).toBeNull();
    }
    expect(getterCalls).toBe(0);
  });

  it("rejects malformed source identifiers, timing, phases and waiting conditions", () => {
    const { raw, task, binding } = fixture();
    const changes: readonly Record<string, unknown>[] = [
      { kind: "settlement-material" }, { settlementId: 0 }, { settlementId: -0 }, { settlementId: 0.5 },
      { storeId: "" }, { storeId: "invalid store" }, { storeId: "x".repeat(ACTOR_ID_MAX_LENGTH + 1) },
      { sourceEvidenceId: "" }, { sourceEvidenceId: "invalid evidence" }, { sourceEvidenceId: undefined },
      { selectedAtTick: -0 }, { selectedAtTick: -1 }, { selectedAtTick: binding.tick + 1 },
      { lastProgressAtTick: binding.tick - 2 }, { lastProgressAtTick: binding.tick + 1 },
      { nextReassessmentAtTick: binding.tick - 2 }, { nextReassessmentAtTick: Number.NaN },
      { phase: "used" }, { phase: "waiting", waitReason: null },
      { waitReason: "no-material" }, { waitReason: "no-traversable-route" },
    ];
    for (const change of changes) expect(canonicalizeResidentActivity({ ...raw,
      inspectionTask: { ...task, ...change } }, binding),
    Object.entries(change).map(([key, value]) => `${key}=${String(value)}`).join(", ")).toBeNull();
  });

  it.each(["no-traversable-route", "outside-local-corridor"] as const)("retains truthful bounded waiting for %s", (waitReason) => {
    const { raw, task, binding } = fixture();
    expect(canonicalizeResidentActivity({ ...raw, inspectionTask: { ...task, phase: "waiting", waitReason } }, binding)
      ?.inspectionTask).toMatchObject({ phase: "waiting", waitReason, selectedAtTick: task.selectedAtTick });
  });

  it("requires exact current body inclusion for an arrived label, not a nearby pose", () => {
    const { raw, task, target, binding } = fixture();
    const arrived = { ...raw, poses: [{ position: target, heading: 0 }],
      inspectionTask: { ...task, phase: "arrived", lastProgressAtTick: binding.tick } };
    expect(canonicalizeResidentActivity(arrived, binding)?.inspectionTask?.phase).toBe("arrived");
    expect(canonicalizeResidentActivity({ ...arrived,
      poses: [{ position: translateWorldPosition(target, 1, 0), heading: 0 }] }, binding)).toBeNull();
  });

  it("keeps inspection exclusive with independently valid rest, ration and material task shapes", () => {
    const { world, index, raw, task, binding } = fixture();
    const common = { settlementId: task.settlementId, target: task.target,
      selectedAtTick: task.selectedAtTick, phase: "approaching", lastProgressAtTick: task.lastProgressAtTick,
      nextReassessmentAtTick: task.nextReassessmentAtTick, waitReason: null };
    const project = world.settlements.find(({ id }) => id === world.residents[index]!.homeSettlementId)!.project;
    const competing = [
      { restTask: { ...common, kind: "settlement-rest", cause: "urgent-rest", origin: "selected", legacySettlementOrdinal: null } },
      { rationTask: { ...common, kind: "settlement-ration", usedAtTick: null, foodUsed: false, waterUsed: false } },
      { materialTask: { ...common, kind: "settlement-material", projectId: project.id, resource: project.resource, usedAtTick: null } },
    ];
    for (const other of competing) {
      expect(canonicalizeResidentActivity({ ...raw, inspectionTask: null, ...other }, binding)).not.toBeNull();
      expect(canonicalizeResidentActivity({ ...raw, ...other }, binding)).toBeNull();
    }
  });

  it.each([1, 2, 3] as const)("preserves frozen v%i bytes and rejects a future inspection field even when null", (version) => {
    const { raw, task, binding } = fixture();
    const old = frozenProtocol(raw, version);
    const before = stableStringify(old);
    expect(stableStringify(canonicalizeResidentActivity(old, binding))).toBe(before);
    for (const inspectionTask of [null, task, undefined]) {
      expect(canonicalizeResidentActivity({ ...old, inspectionTask }, binding)).toBeNull();
    }
    expect(stableStringify(old)).toBe(before);
  });

  it("requires the inspection outer capability for the whole v4 cohort, including null tasks", () => {
    for (const withTask of [false, true]) {
      const current = fixture();
      if (withTask) install(current);
      const before = serializeWorld(current.world);
      expect(residentActivitySaveExtensionsValid(current.world, true, true, true, false)).toBe(false);
      expect(residentActivitySaveExtensionsValid(current.world, true, true, true, true)).toBe(true);
      expect(residentActivitySaveExtensionsValid(current.world, true, false, true, true)).toBe(false);
      expect(residentActivitySaveExtensionsValid(current.world, true, true, false, true)).toBe(false);
      expect(serializeWorld(current.world)).toBe(before);
    }
  });

  it("rejects mixed v3/v4 authority without rejecting an exact wholly frozen civic cohort", () => {
    const current = fixture();
    current.world.residents[current.index]!.activity = frozenProtocol(current.raw, 3) as unknown as ResidentActivity;
    const before = stableStringify(current.world);
    expect(residentCivicActivityCohortIsUniform(current.world.residents)).toBe(false);
    expect(residentActivitySaveExtensionsValid(current.world, true, true, true, true)).toBe(false);
    expect(() => serializeWorld(current.world)).toThrow(/whole-roster/u);
    expect(stableStringify(current.world)).toBe(before);
    current.world.residents = current.world.residents.map((resident) => ({ ...resident,
      activity: frozenProtocol(resident.activity! as unknown as Record<string, unknown>, 3) as unknown as ResidentActivity,
    }));
    expect(residentCivicActivityCohortIsUniform(current.world.residents)).toBe(true);
    expect(residentActivitySaveExtensionsValid(current.world, true, true, true, false)).toBe(true);
  });

  it("binds a model task to actual home geometry while leaving store/evidence authentication to the cross-root owner", () => {
    const current = fixture();
    install(current);
    const resident = current.world.residents[current.index]!;
    expect(canonicalResidentActivityForWorld(current.world, resident)).not.toBeNull();
    const foreign = current.world.settlements.find(({ id }) => id !== resident.homeSettlementId)!;
    expect(canonicalResidentActivityForWorld(current.world, { ...resident, homeSettlementId: foreign.id })).toBeNull();
    install(current, { ...current.raw, inspectionTask: { ...current.task, settlementId: foreign.id } });
    expect(canonicalResidentActivityForWorld(current.world, current.world.residents[current.index]!)).toBeNull();
    const wrongTarget = { ...current.raw, inspectionTask: {
      ...current.task, target: translateWorldPosition(current.target, 1, 0),
    } };
    expect(canonicalizeResidentActivity(wrongTarget, current.binding)).not.toBeNull();
    install(current, wrongTarget);
    expect(canonicalResidentActivityForWorld(current.world, current.world.residents[current.index]!)).toBeNull();
  });
});
