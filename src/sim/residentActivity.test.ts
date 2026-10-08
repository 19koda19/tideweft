import { describe, expect, it } from "vitest";

import { headingFromRadians } from "../game/livingActor";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "../game/worldPosition";
import {
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  replaceResidentCircadian,
  residentSettlementRestNetworkId,
} from "./livingCircadian";
import { createWorld } from "./public";
import { REGION_COORD_LIMIT } from "./regions";
import {
  RESIDENT_ACTIVITY_MAX_PHASE,
  RESIDENT_ACTIVITY_OWNER_ID,
  RESIDENT_ACTIVITY_VERSION,
  RESIDENT_REST_APPROACH_STEP_UNITS,
  canonicalizeResidentActivity,
  replaceResidentActivity,
  residentActivityAtRestDestination,
  residentActivityCurrentPose,
  residentActivityPoseAtPhase,
  type ResidentActivityBinding,
  type ResidentBodyPose,
} from "./residentActivity";
import type { ResidentState } from "./types";

// Model fixtures use real generated identities, not a second population or a
// runtime rest demonstration. World target/support admission is a separate owner.
const MODEL_WORLD = createWorld("resident activity model foundation", "standard");

function fixture(source: ResidentState = MODEL_WORLD.residents[0]!) {
  const resident = structuredClone(source);
  const settlement = MODEL_WORLD.settlements.find(({ id }) => id === resident.homeSettlementId);
  const tile = settlement === undefined ? undefined : MODEL_WORLD.terrain.tiles[settlement.tileIndex];
  if (!tile) throw new Error("model fixture needs a real settlement tile");
  const position = createWorldPosition({ x: 0, y: 0 }, tile.x * 1_000 + 500, tile.y * 1_000 + 500);
  const binding: ResidentActivityBinding = {
    actorId: resident.identity.stableId,
    tick: resident.perception.tick,
  };
  return { resident, binding, position, raw: rawActivity(binding, [{ position, heading: 0 }]) };
}

function rawActivity(binding: ResidentActivityBinding, poses: readonly ResidentBodyPose[]): Record<string, unknown> {
  return {
    version: RESIDENT_ACTIVITY_VERSION,
    ownerId: RESIDENT_ACTIVITY_OWNER_ID,
    actorId: binding.actorId,
    tick: binding.tick,
    poses: structuredClone(poses),
    restTask: null,
  };
}

function rawRestTask(resident: ResidentState, target: WorldPosition): Record<string, unknown> {
  if (resident.location.kind !== "settlement") throw new Error("model fixture needs settlement membership");
  return {
    kind: "settlement-rest",
    settlementId: resident.location.settlementId,
    target: structuredClone(target),
    selectedAtTick: resident.perception.tick - 2,
    cause: "urgent-rest",
    origin: "selected",
    legacySettlementOrdinal: null,
    phase: "arrived",
    lastProgressAtTick: resident.perception.tick,
    nextReassessmentAtTick: resident.perception.tick + 1,
    waitReason: null,
  };
}

function withAdmittedPosture(resident: ResidentState, state: "resting" | "asleep"): ResidentState {
  const restDestinationId = residentSettlementRestNetworkId(resident.identity.stableId, resident.homeSettlementId);
  if (restDestinationId === null) throw new Error("model fixture needs an authenticated rest network");
  return replaceResidentCircadian(resident, {
    atTick: resident.perception.tick,
    circadian: {
      version: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.version,
      ownerId: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.ownerId,
      policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
      restDestinationId,
      restDestinationArrived: true,
      posture: { state, enteredAtTick: resident.perception.tick - 3 },
    },
  });
}

describe("optional resident activity model foundation", () => {
  it("accepts every real generated H- identity without adopting absent state", () => {
    expect(MODEL_WORLD.residents).toHaveLength(42);
    for (const resident of MODEL_WORLD.residents) {
      const { raw, binding, position } = fixture(resident);
      expect(binding.actorId.startsWith("H-")).toBe(true);
      expect(canonicalizeResidentActivity(raw, binding)).toMatchObject({
        actorId: resident.identity.stableId,
        tick: resident.perception.tick,
        restTask: null,
      });
      expect(residentActivityCurrentPose(raw, binding)).toEqual({ position, heading: 0 });
      expect(Object.hasOwn(resident, "activity")).toBe(false);
    }
  });

  it("retains exact signed seam-crossing poses0–10 without flattening distant coordinates", () => {
    const { binding } = fixture();
    const anchor = createWorldPosition(
      { x: -REGION_COORD_LIMIT + 1, y: REGION_COORD_LIMIT - 1 },
      REGION_WIDTH_UNITS - 50,
      REGION_HEIGHT_UNITS - 50,
    );
    const poses = Array.from({ length: RESIDENT_ACTIVITY_MAX_PHASE + 1 }, (_, phase) => ({
      position: translateWorldPosition(anchor, phase * RESIDENT_REST_APPROACH_STEP_UNITS, 0),
      heading: 0,
    }));
    const raw = rawActivity(binding, poses);
    const activity = canonicalizeResidentActivity(raw, { ...binding, phase: 10 });
    expect(activity).not.toBeNull();
    expect(activity?.poses).toEqual(poses);
    expect(activity?.poses[1]?.position.region.x).toBe(anchor.region.x + 1);
    for (let phase = 0; phase <= RESIDENT_ACTIVITY_MAX_PHASE; phase += 1) {
      expect(residentActivityPoseAtPhase(activity, binding, phase)).toEqual(poses[phase]);
    }
    expect(worldPositionDelta(anchor, residentActivityCurrentPose(activity, binding)!.position))
      .toEqual({ x: 10 * RESIDENT_REST_APPROACH_STEP_UNITS, y: 0 });
    expect(residentActivityPoseAtPhase(activity, binding, 11)).toBeNull();
    expect(residentActivityPoseAtPhase(activity, binding, -1)).toBeNull();
    expect(residentActivityPoseAtPhase(activity, binding, 0.5)).toBeNull();
  });

  it.each([
    [105, 0], [-105, 0], [0, 105], [0, -105],
    [63, 84], [63, -84], [-63, 84], [-63, -84],
  ])("accepts bounded displacement(%s,%s) only with its shared body heading", (dx, dy) => {
    const { binding, position } = fixture();
    const moved = { position: translateWorldPosition(position, dx, dy), heading: headingFromRadians(Math.atan2(dy, dx)) };
    const raw = rawActivity(binding, [{ position, heading: 0 }, moved]);
    expect(canonicalizeResidentActivity(raw, { ...binding, phase: 1 })?.poses[1]).toEqual(moved);
    const wrong = rawActivity(binding, [{ position, heading: 0 }, { ...moved, heading: (moved.heading + 1) % 1_000_000 }]);
    expect(canonicalizeResidentActivity(wrong, binding)).toBeNull();
  });

  it("rejects excessive straight/diagonal displacement and stationary body rotation", () => {
    const { binding, position } = fixture();
    for (const [dx, dy] of [[106, 0], [75, 75], [0, -106]]) {
      expect(canonicalizeResidentActivity(rawActivity(binding, [
        { position, heading: 0 },
        { position: translateWorldPosition(position, dx!, dy!), heading: headingFromRadians(Math.atan2(dy!, dx!)) },
      ]), binding)).toBeNull();
    }
    expect(canonicalizeResidentActivity(rawActivity(binding, [
      { position, heading: 0 }, { position, heading: 250_000 },
    ]), binding)).toBeNull();
    expect(canonicalizeResidentActivity(rawActivity(binding, [
      { position, heading: 250_000 }, { position, heading: 250_000 },
    ]), binding)).not.toBeNull();
  });

  it("accepts a real movement turn and rejects an unrepresentable distant step", () => {
    const { binding, position } = fixture();
    const east = translateWorldPosition(position, 105, 0);
    const south = translateWorldPosition(east, 0, 105);
    expect(canonicalizeResidentActivity(rawActivity(binding, [
      { position, heading: 0 }, { position: east, heading: 0 }, { position: south, heading: 250_000 },
    ]), binding)).not.toBeNull();
    expect(canonicalizeResidentActivity(rawActivity(binding, [
      { position: createWorldPosition({ x: -REGION_COORD_LIMIT, y: 0 }, 500, 500), heading: 0 },
      { position: createWorldPosition({ x: REGION_COORD_LIMIT, y: 0 }, 500, 500), heading: 0 },
    ]), binding)).toBeNull();
  });

  it("requires exact actor/tick/phase bindings even for authenticated canonical objects", () => {
    const { raw, binding } = fixture();
    const parsed = canonicalizeResidentActivity(raw, binding)!;
    const foreignActor = MODEL_WORLD.residents[1]!.identity.stableId;
    for (const value of [raw, parsed, structuredClone(parsed)]) {
      expect(canonicalizeResidentActivity(value, { ...binding, phase: 0 })).not.toBeNull();
      expect(canonicalizeResidentActivity(value, { ...binding, actorId: foreignActor })).toBeNull();
      expect(canonicalizeResidentActivity(value, { ...binding, tick: binding.tick + 1 })).toBeNull();
      expect(canonicalizeResidentActivity(value, { ...binding, phase: 1 })).toBeNull();
      expect(residentActivityPoseAtPhase(value, binding, 1)).toBeNull();
    }
    for (const phase of [-0, -1, 0.5, 11, Number.NaN, Number.MAX_SAFE_INTEGER + 1, undefined]) {
      expect(canonicalizeResidentActivity(parsed, { ...binding, phase } as ResidentActivityBinding)).toBeNull();
    }
    expect(canonicalizeResidentActivity(parsed, { ...binding, extra: true } as ResidentActivityBinding)).toBeNull();
  });

  it.each([
    ["future version", (raw: Record<string, unknown>) => { raw.version = RESIDENT_ACTIVITY_VERSION + 1; }],
    ["wrong owner", (raw: Record<string, unknown>) => { raw.ownerId = "sim:other-activity:v1"; }],
    ["foreign identity", (raw: Record<string, unknown>) => { raw.actorId = MODEL_WORLD.residents[1]!.identity.stableId; }],
    ["wrong namespace", (raw: Record<string, unknown>) => { raw.actorId = "dog:activity"; }],
    ["invalid identity characters", (raw: Record<string, unknown>) => { raw.actorId = "H-invalid actor"; }],
    ["oversized identity", (raw: Record<string, unknown>) => { raw.actorId = `H-${"x".repeat(193)}`; }],
    ["negative zero tick", (raw: Record<string, unknown>) => { raw.tick = -0; }],
    ["fractional tick", (raw: Record<string, unknown>) => { raw.tick = 0.5; }],
    ["foreign tick", (raw: Record<string, unknown>) => { raw.tick = MODEL_WORLD.meta.completedTick + 1; }],
    ["missing task", (raw: Record<string, unknown>) => { delete raw.restTask; }],
    ["undefined task", (raw: Record<string, unknown>) => { raw.restTask = undefined; }],
    ["extra field", (raw: Record<string, unknown>) => { raw.extra = true; }],
    ["symbol field", (raw: Record<string, unknown>) => { Object.defineProperty(raw, Symbol("extra"), { value: true }); }],
    ["foreign prototype", (raw: Record<string, unknown>) => { Object.setPrototypeOf(raw, { extra: true }); }],
    ["empty history", (raw: Record<string, unknown>) => { raw.poses = []; }],
    ["oversized history", (raw: Record<string, unknown>) => { raw.poses = Array.from({ length: 12 }, () => (raw.poses as unknown[])[0]); }],
    ["sparse history", (raw: Record<string, unknown>) => { raw.poses = new Array(1); }],
    ["extra history property", (raw: Record<string, unknown>) => { Object.assign(raw.poses as object, { extra: true }); }],
    ["symbol history property", (raw: Record<string, unknown>) => { Object.defineProperty(raw.poses as object, Symbol("extra"), { value: true }); }],
  ] as const)("rejects malformed present activity: %s", (_name, mutate) => {
    const { raw, binding } = fixture();
    mutate(raw);
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
  });

  it.each([
    ["invalid heading", { heading: 1_000_000 }],
    ["fractional heading", { heading: 0.5 }],
    ["negative zero heading", { heading: -0 }],
    ["extra pose field", { extra: true }],
    ["noncanonical local coordinate", { position: { region: { x: 0, y: 0 }, localX: REGION_WIDTH_UNITS, localY: 500 } }],
    ["extra segmented coordinate", { position: { region: { x: 0, y: 0 }, localX: 500, localY: 500, extra: true } }],
    ["invalid signed region", { position: { region: { x: REGION_COORD_LIMIT + 1, y: 0 }, localX: 500, localY: 500 } }],
  ])("rejects malformed pose: %s", (_name, patch) => {
    const { raw, binding } = fixture();
    Object.assign((raw.poses as object[])[0]!, patch);
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
  });

  it("rejects activity/binding accessors without executing them", () => {
    const { raw, binding } = fixture();
    let reads = 0;
    Object.defineProperty(raw, "tick", { enumerable: true, get() { reads += 1; return binding.tick; } });
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
    const hostileBinding = { ...binding };
    Object.defineProperty(hostileBinding, "tick", { enumerable: true, get() { reads += 1; return binding.tick; } });
    expect(canonicalizeResidentActivity(fixture().raw, hostileBinding)).toBeNull();
    expect(reads).toBe(0);
  });

  it("returns detached recursively frozen records and rechecks clone bindings", () => {
    const { raw, binding, resident, position } = fixture();
    raw.restTask = rawRestTask(resident, position);
    const parsed = canonicalizeResidentActivity(raw, binding)!;
    expect(parsed).not.toBeNull();
    expect(canonicalizeResidentActivity(parsed, binding)).toBe(parsed);
    const restored = canonicalizeResidentActivity(structuredClone(parsed), binding)!;
    expect(restored).toEqual(parsed);
    expect(restored).not.toBe(parsed);
    expect(restored.poses[0]).not.toBe(parsed.poses[0]);
    expect(restored.restTask?.target).not.toBe(parsed.restTask?.target);
    for (const value of [parsed, parsed.poses, parsed.poses[0], parsed.poses[0]!.position,
      parsed.poses[0]!.position.region, parsed.restTask, parsed.restTask!.target, parsed.restTask!.target.region]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Reflect.set(parsed.poses[0]!.position.region, "x", 1)).toBe(false);
    ((raw.poses as Array<{ position: { localX: number } }>)[0]!).position.localX += 1;
    (raw.restTask as { target: { localY: number } }).target.localY += 1;
    expect(parsed.poses[0]!.position).toEqual(position);
    expect(parsed.restTask!.target).toEqual(position);
  });

  it("requires an exact arrived target, not intention, an approach, or an arrived word", () => {
    const { raw, binding, resident, position } = fixture();
    resident.intention = "rest";
    expect(residentActivityAtRestDestination(resident)).toBe(false);
    const task = rawRestTask(resident, position);
    raw.restTask = task;
    task.phase = "approaching";
    const approaching = replaceResidentActivity(resident, raw);
    expect(residentActivityAtRestDestination(approaching)).toBe(false);
    task.phase = "arrived";
    const arrived = replaceResidentActivity(resident, raw);
    expect(residentActivityAtRestDestination(arrived)).toBe(true);
    task.target = translateWorldPosition(position, 1, 0);
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
    expect(residentActivityAtRestDestination({ ...resident, activity: raw })).toBe(false);
  });

  it.each([
    ["future selection", (task: Record<string, unknown>, tick: number) => { task.selectedAtTick = tick + 1; }],
    ["progress before selection", (task: Record<string, unknown>, tick: number) => { task.lastProgressAtTick = tick - 3; }],
    ["future progress", (task: Record<string, unknown>, tick: number) => { task.lastProgressAtTick = tick + 1; }],
    ["retry before selection", (task: Record<string, unknown>, tick: number) => { task.nextReassessmentAtTick = tick - 3; }],
    ["invalid settlement", (task: Record<string, unknown>) => { task.settlementId = 0; }],
    ["extra task field", (task: Record<string, unknown>) => { task.extra = true; }],
    ["unknown kind", (task: Record<string, unknown>) => { task.kind = "crafting"; }],
    ["unknown cause", (task: Record<string, unknown>) => { task.cause = "script"; }],
    ["unknown phase", (task: Record<string, unknown>) => { task.phase = "complete"; }],
    ["waiting without reason", (task: Record<string, unknown>) => { task.phase = "waiting"; }],
    ["reason without waiting", (task: Record<string, unknown>) => { task.waitReason = "no-traversable-route"; }],
    ["unknown wait reason", (task: Record<string, unknown>) => { task.phase = "waiting"; task.waitReason = "timer-finished"; }],
    ["continued cause without origin", (task: Record<string, unknown>) => { task.cause = "continued-admission"; }],
    ["continued origin without cause", (task: Record<string, unknown>) => { task.origin = "continued-admitted-rest"; }],
    ["missing admission ordinal", (task: Record<string, unknown>) => { delete task.legacySettlementOrdinal; }],
    ["undefined admission ordinal", (task: Record<string, unknown>) => { task.legacySettlementOrdinal = undefined; }],
    ["selected task borrowing old admission", (task: Record<string, unknown>) => { task.legacySettlementOrdinal = 0; }],
  ] as const)("rejects malformed rest task: %s", (_name, mutate) => {
    const { raw, binding, resident, position } = fixture();
    const task = rawRestTask(resident, position);
    mutate(task, binding.tick);
    raw.restTask = task;
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
  });

  it.each(["no-traversable-route", "outside-local-corridor"] as const)("retains a bounded truthful wait: %s", (reason) => {
    const { raw, binding, resident, position } = fixture();
    raw.restTask = { ...rawRestTask(resident, translateWorldPosition(position, 105, 0)), phase: "waiting", waitReason: reason };
    expect(canonicalizeResidentActivity(raw, binding)?.restTask).toMatchObject({ phase: "waiting", waitReason: reason });
    expect(residentActivityAtRestDestination(replaceResidentActivity(resident, raw))).toBe(false);
  });

  it("replaces only nested activity without changing an absent original or aliasing input", () => {
    const { raw, resident, position } = fixture();
    const replacement = replaceResidentActivity(resident, raw);
    expect(replacement).not.toBe(resident);
    expect(Object.hasOwn(resident, "activity")).toBe(false);
    expect(replacement.identity).toBe(resident.identity);
    expect(replacement.condition).toBe(resident.condition);
    expect(replacement.activity?.poses[0]?.position).toEqual(position);
    expect(replacement.activity?.poses[0]).not.toBe((raw.poses as unknown[])[0]);
    for (const value of [undefined, null, {}, { ...raw, tick: resident.perception.tick + 1 },
      { ...raw, actorId: MODEL_WORLD.residents[1]!.identity.stableId }]) {
      expect(() => replaceResidentActivity(resident, value)).toThrow(RangeError);
    }
    expect(Object.hasOwn(resident, "activity")).toBe(false);
    expect(residentActivityAtRestDestination({ ...resident, activity: undefined })).toBe(false);
  });

  it("rejects rest tasks conflicting with commitments or membership but permits a body without a task", () => {
    const { raw, resident, position } = fixture();
    raw.restTask = rawRestTask(resident, position);
    const otherSettlement = MODEL_WORLD.settlements.find(({ id }) => id !== resident.homeSettlementId)!;
    const route = MODEL_WORLD.routes[0]!;
    const incompatible: ResidentState[] = [
      { ...resident, activeContractId: MODEL_WORLD.contracts[0]!.id },
      { ...resident, location: { kind: "settlement", settlementId: otherSettlement.id } },
      { ...resident, location: { kind: "route", routeId: route.id, progress: 0 } },
    ];
    for (const candidate of incompatible) {
      expect(() => replaceResidentActivity(candidate, raw)).toThrow(RangeError);
      expect(residentActivityAtRestDestination({ ...candidate, activity: raw })).toBe(false);
    }
    raw.restTask = null;
    expect(replaceResidentActivity(incompatible[2]!, raw).activity?.restTask).toBeNull();
    expect(residentActivityAtRestDestination(replaceResidentActivity(incompatible[2]!, raw))).toBe(false);
  });

  it("requires matching explicit target for a visitor's local eligibility", () => {
    const { raw, resident } = fixture();
    const foreign = MODEL_WORLD.settlements.find(({ id }) => id !== resident.homeSettlementId)!;
    const tile = MODEL_WORLD.terrain.tiles[foreign.tileIndex]!;
    const position = createWorldPosition({ x: 0, y: 0 }, tile.x * 1_000 + 500, tile.y * 1_000 + 500);
    resident.location = { kind: "settlement", settlementId: foreign.id };
    raw.poses = [{ position, heading: 0 }];
    raw.restTask = rawRestTask(resident, position);
    const visitor = replaceResidentActivity(resident, raw);
    expect(visitor.homeSettlementId).not.toBe(foreign.id);
    expect(residentActivityAtRestDestination(visitor)).toBe(true);
  });

  it.each(["resting", "asleep"] as const)("preserves an admitted %s continuation only while that episode holds", (state) => {
    const { raw, binding, resident, position } = fixture();
    const bound = withAdmittedPosture(resident, state);
    raw.restTask = {
      ...rawRestTask(bound, position),
      origin: "continued-admitted-rest",
      cause: "continued-admission",
      legacySettlementOrdinal: 0,
    };
    const continuing = replaceResidentActivity(bound, raw);
    expect(continuing.circadian).toBe(bound.circadian);
    expect(residentActivityAtRestDestination(continuing)).toBe(true);
    expect(canonicalizeResidentActivity(structuredClone(continuing.activity), binding)).toEqual(continuing.activity);
    expect(residentActivityAtRestDestination({ ...continuing, circadian: undefined })).toBe(false);
    expect(residentActivityAtRestDestination({ ...continuing, circadian: {
      ...bound.circadian!, restDestinationArrived: false,
    } })).toBe(false);
    for (const posture of ["awake", "startled", "invalid"]) {
      expect(residentActivityAtRestDestination({ ...continuing, circadian: {
        ...bound.circadian!, posture: { state: posture, enteredAtTick: binding.tick },
      } })).toBe(false);
    }
    const task = raw.restTask as Record<string, unknown>;
    task.phase = "waiting";
    task.waitReason = "no-traversable-route";
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
  });

  it("cannot preserve inherited admission by moving away and returning within the interval", () => {
    const { raw, binding, resident, position } = fixture();
    raw.poses = [
      { position, heading: 0 },
      { position: translateWorldPosition(position, 105, 0), heading: 0 },
      { position, heading: 500_000 },
    ];
    raw.restTask = rawRestTask(resident, position);
    expect(canonicalizeResidentActivity(raw, binding)).not.toBeNull();
    raw.restTask = {
      ...raw.restTask as object,
      origin: "continued-admitted-rest",
      cause: "continued-admission",
      legacySettlementOrdinal: 0,
    };
    expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
  });

  it.each([0, 41])("retains finite captured ordinal %s only for a continuation", (ordinal) => {
    const { raw, binding, resident, position } = fixture();
    raw.restTask = {
      ...rawRestTask(resident, position),
      origin: "continued-admitted-rest",
      cause: "continued-admission",
      legacySettlementOrdinal: ordinal,
    };
    // This proves bounded shape only. The world owner must authenticate the
    // captured ordinal's real legacy locus and its continued admission.
    expect(canonicalizeResidentActivity(raw, binding)?.restTask?.legacySettlementOrdinal).toBe(ordinal);
    const selected = { ...raw.restTask as object, origin: "selected", cause: "urgent-rest" };
    expect(canonicalizeResidentActivity({ ...raw, restTask: selected }, binding)).toBeNull();
  });

  it.each([-0, -1, 0.5, 42, Number.NaN, Number.POSITIVE_INFINITY, null, undefined])(
    "rejects an invalid continued admission ordinal: %s",
    (ordinal) => {
      const { raw, binding, resident, position } = fixture();
      raw.restTask = {
        ...rawRestTask(resident, position),
        origin: "continued-admitted-rest",
        cause: "continued-admission",
        legacySettlementOrdinal: ordinal,
      };
      expect(canonicalizeResidentActivity(raw, binding)).toBeNull();
    },
  );

  it("does not manufacture activity or admission from absent and malformed residents", () => {
    const { raw, binding, resident } = fixture();
    for (const value of [undefined, null, false, 0, "activity", [], {}, resident]) {
      expect(residentActivityAtRestDestination(value)).toBe(false);
    }
    for (const value of [undefined, null, false, 0, "activity", []]) {
      expect(canonicalizeResidentActivity(value, binding)).toBeNull();
      expect(residentActivityCurrentPose(value, binding)).toBeNull();
      expect(residentActivityPoseAtPhase(value, binding, 0)).toBeNull();
    }
    expect(residentActivityAtRestDestination({ ...resident, activity: null })).toBe(false);
    expect(residentActivityAtRestDestination({ ...resident, activity: raw })).toBe(false);
    expect(Object.hasOwn(resident, "activity")).toBe(false);
  });
});
