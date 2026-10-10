import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mainSource = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
const captureStart = mainSource.indexOf("async function captureSmokeRelocationSave(");
const captureEnd = mainSource.indexOf("\n/**\n * The proven Harp fixture", captureStart);
if (captureStart < 0 || captureEnd <= captureStart) {
  throw new Error("Cannot locate the standalone smoke relocation capture owner");
}
const captureSource = mainSource.slice(captureStart, captureEnd);
const SAVE_VERSION = 58;

interface Carry {
  version: number;
  playerStepsSinceWorldTick: number;
  intervalStartWasSleeping: boolean;
  nextPlayerSenseSampleOrdinal: number;
  playerSenseSamples: unknown[];
  playerStepStateSamples: unknown[];
  actorVocalizationSamples: unknown[];
  animalContactAcousticCarry: { version: number; records: unknown[] };
  situatedExpressionChannels: { version: number; channels: unknown[] };
  situatedExpressionAdmissions: { version: number; records: unknown[] };
  situatedExpressionCausalAuthority: { version: number; records: unknown[] };
}

function envelope(phase = 0, carryPatch: Partial<Carry> = {}) {
  // Synthetic envelope-gate fixtures, not complete runtime-loader save proofs.
  // Distinct body/history/knowledge data detects destructive carry collapsing.
  const perceptionCarry: Carry = {
    version: 14, playerStepsSinceWorldTick: phase, intervalStartWasSleeping: false,
    nextPlayerSenseSampleOrdinal: 0, playerSenseSamples: [], playerStepStateSamples: [],
    actorVocalizationSamples: [], animalContactAcousticCarry: { version: 1, records: [] },
    situatedExpressionChannels: { version: 1, channels: [] },
    situatedExpressionAdmissions: { version: 1, records: [] },
    situatedExpressionCausalAuthority: { version: 1, records: [] },
    ...carryPatch,
  };
  return {
    format: "tideweft-session", version: SAVE_VERSION,
    world: JSON.stringify({ residents: [{ id: "H-fixture", activity: {
      version: 8, acceptedPhase: phase, poses: [{ phase, localX: 17, localY: 29 }],
    }, perception: { lastObservedTick: 421, retainedBelief: "own-old-evidence" } }] }),
    player: { timeAction: null as unknown, stamina: 321_000 },
    playerExpressionRecency: { version: 2, consumedOrigin: "retained-original-choice" },
    perceptionCarry,
  };
}

function record(value = envelope(), tick = 421) {
  return { slotId: "autosave", seed: "synthetic-frontier", payloadVersion: SAVE_VERSION,
    updatedAt: 123, playTicks: tick, worldJson: JSON.stringify(value) };
}

interface SyntheticView { readonly tick: number; readonly phase: number; }
interface RuntimeOptions {
  frames?: readonly SyntheticView[];
  initialTick?: number;
  existingWait?: boolean;
  canWait?: boolean;
  acceptWait?: boolean;
}

function runtime(options: RuntimeOptions = {}) {
  // Synthetic public WAIT/clock contract only, not a second simulator. The
  // owner advances no private kernel; this fake rAF supplies public snapshots.
  let current: SyntheticView = Object.freeze({ tick: options.initialTick ?? 420, phase: 0 });
  let frame = 0;
  const controls = { waitActive: options.existingWait ?? false, canWait: options.canWait ?? true };
  return {
    save: vi.fn(async () => {}), stop: vi.fn(), start: vi.fn(), dispatch: vi.fn(),
    advance: vi.fn(), tick: vi.fn(), controls,
    getRenderView: vi.fn(() => current), getUIView: vi.fn(() => ({ controls })),
    dispatchUI: vi.fn((command: { type: string; action: string }) => {
      if (command.type !== "wait") throw new Error("Unexpected synthetic control");
      if (command.action === "begin") controls.waitActive = options.acceptWait !== false;
      else if (command.action === "cancel") controls.waitActive = false;
      else throw new Error("Unexpected synthetic wait action");
    }),
    requestFrame: (callback: (at: number) => void): void => {
      setTimeout(() => {
        if (controls.waitActive) {
          const next = options.frames?.[Math.min(frame, options.frames.length - 1)];
          current = next ?? Object.freeze({ tick: current.tick + 1, phase: 0 });
        }
        frame += 1;
        callback(Date.now());
      }, 16);
    },
  };
}

interface CaptureResult {
  record: ReturnType<typeof record>;
  envelope: ReturnType<typeof envelope>;
  view: SyntheticView;
  capture: { attempts: number; observedPhases: number[]; frames: number; elapsedMs: number;
    strategy: "ordinary-wait-boundary" };
}
type Capture = (runtime: ReturnType<typeof runtime>, readRecord: () => Promise<unknown>,
  expectedVersion: number, timeoutMs: number) => Promise<CaptureResult>;

function capture(): Capture {
  // Only this function is evaluated. Electron imports and application startup
  // are deliberately outside the VM; real timer waits are replaced locally.
  return (owner, ...args) => {
    const isolated = runInNewContext(`(${captureSource})`, {
      Date, requestAnimationFrame: owner.requestFrame,
    }) as Capture;
    return isolated(owner, ...args);
  };
}

async function finish<T>(pending: Promise<T>): Promise<T> {
  // Observe rejection before pumping fake rAF, avoiding unhandled rejection
  // artifacts when a deliberately malformed synthetic record is captured.
  const outcome = pending.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const settled = await outcome;
  if (!settled.ok) throw settled.error;
  return settled.value;
}

function waitCommands(owner: ReturnType<typeof runtime>) {
  return owner.dispatchUI.mock.calls.map(([command]) => command);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

describe("smoke save relocation frontier", () => {
  it("waits through partial records and returns the original quiet record without collapsing body or knowledge", async () => {
    const records = [record(envelope(9), 421), record(envelope(4), 422), record(envelope(), 423)]
      .map((item) => Object.freeze(item));
    const before = records.map((item) => JSON.stringify(item));
    const calls: string[] = [], owner = runtime();
    owner.save.mockImplementation(async () => { calls.push("save"); });
    let next = 0;
    const read = vi.fn(async () => { calls.push("read"); return records[next++]; });
    const result = await finish(capture()(owner, read, SAVE_VERSION, 1_000));
    expect(result.record).toBe(records[2]);
    expect(result.envelope).toEqual(JSON.parse(records[2]!.worldJson));
    expect(result.envelope.world).toBe(envelope().world);
    expect(result.envelope.playerExpressionRecency).toEqual(envelope().playerExpressionRecency);
    expect(records.map((item) => JSON.stringify(item))).toEqual(before);
    expect(result.view).toBe(owner.getRenderView());
    expect(result.capture).toEqual({ attempts: 3, observedPhases: [0, 4, 9], frames: 3,
      elapsedMs: 48, strategy: "ordinary-wait-boundary" });
    expect(calls).toEqual(["save", "read", "save", "read", "save", "read"]);
    expect(waitCommands(owner)).toEqual(Array.from({ length: 3 }, () => [
      { type: "wait", action: "begin" }, { type: "wait", action: "cancel" },
    ]).flat());
    for (const operation of [owner.stop, owner.start, owner.dispatch, owner.advance, owner.tick]) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  const pendingCarry: readonly [string, (carry: Carry) => void][] = [
    ["sense", (carry) => carry.playerSenseSamples.push({ source: "sense" })],
    ["step", (carry) => carry.playerStepStateSamples.push({ source: "step" })],
    ["vocal", (carry) => carry.actorVocalizationSamples.push({ source: "vocal" })],
    ["animal", (carry) => carry.animalContactAcousticCarry.records.push({ source: "animal" })],
    ["channels", (carry) => carry.situatedExpressionChannels.channels.push({ source: "channel" })],
    ["admissions", (carry) => carry.situatedExpressionAdmissions.records.push({ source: "admission" })],
    ["causal", (carry) => carry.situatedExpressionCausalAuthority.records.push({ source: "causal" })],
    ["ordinal", (carry) => { carry.nextPlayerSenseSampleOrdinal = 1; }],
  ];
  it.each(pendingCarry)("retains a phase-zero pending %s until a later empty record", async (_name, arrange) => {
    const original = envelope();
    arrange(original.perceptionCarry);
    const pendingRecord = Object.freeze(record(original)), quiet = Object.freeze(record(envelope(), 422));
    const before = JSON.stringify(pendingRecord), owner = runtime();
    const read = vi.fn().mockResolvedValueOnce(pendingRecord).mockResolvedValue(quiet);
    const result = await finish(capture()(owner, read, SAVE_VERSION, 1_000));
    expect(result.record).toBe(quiet);
    expect(result.capture).toEqual({ attempts: 2, observedPhases: [0], frames: 2,
      elapsedMs: 32, strategy: "ordinary-wait-boundary" });
    expect(JSON.stringify(pendingRecord)).toBe(before);
  });

  it.each(["time action", "sleeping anchor"])("waits for eligibility after %s instead of rewriting it", async (cause) => {
    const original = envelope();
    if (cause === "time action") original.player.timeAction = { kind: "wait", remainingTicks: 2 };
    else original.perceptionCarry.intervalStartWasSleeping = true;
    const pendingRecord = Object.freeze(record(original)), quiet = Object.freeze(record(envelope(), 422));
    const before = JSON.stringify(pendingRecord);
    const read = vi.fn().mockResolvedValueOnce(pendingRecord).mockResolvedValue(quiet);
    expect((await finish(capture()(runtime(), read, SAVE_VERSION, 1_000))).record).toBe(quiet);
    expect(read).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(pendingRecord)).toBe(before);
  });

  it.each([[120, 8], [100_000, 80]])("fails when no quiet frontier appears within deadline %s or frame cap", async (timeoutMs, attempts) => {
    const original = Object.freeze(record(envelope(9))), before = JSON.stringify(original);
    const owner = runtime(), read = vi.fn().mockResolvedValue(original);
    const failure = expect(finish(capture()(owner, read, SAVE_VERSION, timeoutMs)))
      .rejects.toThrow(/no closed quiet interval/u);
    await failure;
    expect(owner.save).toHaveBeenCalledTimes(attempts);
    expect(read).toHaveBeenCalledTimes(attempts);
    expect(owner.controls.waitActive).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
  });

  it.each([undefined, null, {}, { worldJson: 1 }])("rejects a missing or malformed record %j", async (badRecord) => {
    await expect(finish(capture()(runtime(), vi.fn().mockResolvedValue(badRecord), SAVE_VERSION, 1_000)))
      .rejects.toThrow(/persisted save/u);
  });

  it("rejects malformed JSON without changing the original record", async () => {
    const original = Object.freeze({ ...record(), worldJson: "{" });
    await expect(finish(capture()(runtime(), vi.fn().mockResolvedValue(original), SAVE_VERSION, 1_000)))
      .rejects.toThrow();
    expect(original.worldJson).toBe("{");
  });

  it.each(["format", "envelope version", "record version"])("rejects an unsupported %s", async (field) => {
    const value = envelope();
    if (field === "format") value.format = "unrelated-save";
    if (field === "envelope version") value.version = SAVE_VERSION - 1;
    const original = record(value);
    if (field === "record version") original.payloadVersion = SAVE_VERSION + 1;
    await expect(finish(capture()(runtime(), vi.fn().mockResolvedValue(original), SAVE_VERSION, 1_000)))
      .rejects.toThrow(/current save format/u);
  });

  it.each([-1, 10, 0.5, undefined])("rejects invalid or missing phase %s", async (phase) => {
    const value = envelope();
    const original = { ...record(), worldJson: JSON.stringify({ ...value,
      perceptionCarry: { ...value.perceptionCarry, playerStepsSinceWorldTick: phase } }) };
    await expect(finish(capture()(runtime(), vi.fn().mockResolvedValue(original), SAVE_VERSION, 1_000)))
      .rejects.toThrow(/invalid interval phase/u);
  });

  it.each(["missing", "non-array"])("does not treat a %s pending list as quiet", async (shape) => {
    const value = envelope();
    const original = { ...record(), worldJson: JSON.stringify({ ...value,
      perceptionCarry: { ...value.perceptionCarry,
        playerSenseSamples: shape === "missing" ? undefined : {} } }) };
    const failure = expect(finish(capture()(runtime(), vi.fn().mockResolvedValue(original), SAVE_VERSION, 60)))
      .rejects.toThrow(/no closed quiet interval/u);
    await failure;
  });

  it("propagates a failed save without reading or attempting to repair it", async () => {
    const owner = runtime(), read = vi.fn(), error = new Error("save failed");
    owner.save.mockRejectedValue(error);
    await expect(finish(capture()(owner, read, SAVE_VERSION, 1_000))).rejects.toBe(error);
    expect(read).not.toHaveBeenCalled();
    expect(owner.controls.waitActive).toBe(false);
  });

  it("propagates a failed read after the real save", async () => {
    const owner = runtime(), error = new Error("read failed");
    await expect(finish(capture()(owner, vi.fn().mockRejectedValue(error), SAVE_VERSION, 1_000)))
      .rejects.toBe(error);
    expect(owner.save).toHaveBeenCalledTimes(1);
    expect(owner.controls.waitActive).toBe(false);
  });

  it("observes multiple accepted-phase callbacks but saves only the changed public world tick", async () => {
    const closed = Object.freeze({ tick: 421, phase: 0 });
    const frames = [
      ...Array.from({ length: 9 }, (_, index) => Object.freeze({ tick: 420, phase: index + 1 })),
      closed,
    ];
    const owner = runtime({ frames }), original = Object.freeze(record());
    const read = vi.fn().mockResolvedValue(original);
    const result = await finish(capture()(owner, read, SAVE_VERSION, 1_000));
    expect(result.view).toBe(closed);
    expect(result.record).toBe(original);
    expect(result.capture).toEqual({ attempts: 1, observedPhases: [0], frames: 10,
      elapsedMs: 160, strategy: "ordinary-wait-boundary" });
    expect(owner.save).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(waitCommands(owner)).toEqual([
      { type: "wait", action: "begin" }, { type: "wait", action: "cancel" },
    ]);
  });

  it("captures synchronously then cancels its wait before awaiting deferred storage or reading the record", async () => {
    const owner = runtime(), calls: string[] = [];
    const dispatch = owner.dispatchUI.getMockImplementation()!;
    owner.dispatchUI.mockImplementation((command) => { calls.push(command.action); dispatch(command); });
    let resolveSaving!: () => void;
    const writing = new Promise<void>((resolve) => { resolveSaving = resolve; });
    owner.save.mockImplementation(() => { calls.push("save"); return writing; });
    const original = Object.freeze(record());
    const read = vi.fn(async () => { calls.push("read"); return original; });
    const pending = capture()(owner, read, SAVE_VERSION, 1_000);
    await vi.advanceTimersByTimeAsync(16);
    const capturedView = owner.getRenderView();
    expect(calls).toEqual(["begin", "save", "cancel"]);
    expect(owner.controls.waitActive).toBe(false);
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(80);
    expect(owner.getRenderView()).toBe(capturedView);
    // A later ordinary public projection may arrive while storage is pending.
    // Relocation must retain the save's captured projection, not reacquire it.
    const laterView = Object.freeze({ tick: 422, phase: 1 });
    owner.getRenderView.mockReturnValue(laterView);
    resolveSaving();
    const result = await finish(pending);
    expect(calls).toEqual(["begin", "save", "cancel", "read"]);
    expect(result.view).toBe(capturedView);
    expect(owner.getRenderView()).toBe(laterView);
    expect(result.record).toBe(original);
    expect(result.record.playTicks).toBe(result.view.tick);
  });

  it("never cancels or replaces a pre-existing wait", async () => {
    const owner = runtime({ existingWait: true }), read = vi.fn();
    await expect(finish(capture()(owner, read, SAVE_VERSION, 1_000)))
      .rejects.toThrow(/cannot replace an existing wait/u);
    expect(owner.controls.waitActive).toBe(true);
    expect(waitCommands(owner)).toEqual([]);
    expect(owner.save).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("fails without dispatch when ordinary wait is unavailable", async () => {
    const owner = runtime({ canWait: false }), read = vi.fn();
    await expect(finish(capture()(owner, read, SAVE_VERSION, 1_000)))
      .rejects.toThrow(/available ordinary wait/u);
    expect(waitCommands(owner)).toEqual([]);
    expect(owner.save).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("does not cancel an unaccepted wait request", async () => {
    const owner = runtime({ acceptWait: false }), read = vi.fn();
    await expect(finish(capture()(owner, read, SAVE_VERSION, 1_000)))
      .rejects.toThrow(/could not begin ordinary wait/u);
    expect(waitCommands(owner)).toEqual([{ type: "wait", action: "begin" }]);
    expect(owner.controls.waitActive).toBe(false);
    expect(owner.save).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it.each([Number.NaN, 419])("rejects invalid or regressing public tick %s and releases only its own wait", async (tick) => {
    const owner = runtime({ frames: [{ tick, phase: 0 }] }), read = vi.fn();
    await expect(finish(capture()(owner, read, SAVE_VERSION, 1_000)))
      .rejects.toThrow(/invalid world clock/u);
    expect(waitCommands(owner)).toEqual([
      { type: "wait", action: "begin" }, { type: "wait", action: "cancel" },
    ]);
    expect(owner.controls.waitActive).toBe(false);
    expect(owner.save).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it.each([Number.NaN, -1])("rejects an invalid initial public tick %s before requesting any wait", async (initialTick) => {
    const owner = runtime({ initialTick }), read = vi.fn();
    await expect(finish(capture()(owner, read, SAVE_VERSION, 1_000)))
      .rejects.toThrow(/invalid world clock/u);
    expect(waitCommands(owner)).toEqual([]);
    expect(owner.save).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it.each([[64, 4], [100_000, 80]])("bounds no-change public clock by %s milliseconds or %s frames without saving", async (timeoutMs, frames) => {
    const owner = runtime({ frames: [{ tick: 420, phase: 0 }] }), read = vi.fn();
    await expect(finish(capture()(owner, read, SAVE_VERSION, timeoutMs)))
      .rejects.toThrow(/no closed quiet interval/u);
    expect(Date.now()).toBe(frames * 16);
    expect(waitCommands(owner)).toEqual([
      { type: "wait", action: "begin" }, { type: "wait", action: "cancel" },
    ]);
    expect(owner.controls.waitActive).toBe(false);
    expect(owner.save).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("retries mismatched persisted ticks instead of pairing a stale record with a fresh view", async () => {
    const stale = Object.freeze(record(envelope(), 420)), fresh = Object.freeze(record(envelope(), 422));
    const before = JSON.stringify(stale), owner = runtime();
    const read = vi.fn().mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    const result = await finish(capture()(owner, read, SAVE_VERSION, 1_000));
    expect(result.record).toBe(fresh);
    expect(result.view).toBe(owner.getRenderView());
    expect(result.view.tick).toBe(422);
    expect(result.record.playTicks).toBe(result.view.tick);
    expect(result.capture.attempts).toBe(2);
    expect(JSON.stringify(stale)).toBe(before);
  });

  it("does not begin a wait after its admission deadline has already expired", async () => {
    const owner = runtime(), read = vi.fn();
    await expect(finish(capture()(owner, read, SAVE_VERSION, 0)))
      .rejects.toThrow(/no closed quiet interval/u);
    expect(waitCommands(owner)).toEqual([]);
    expect(owner.save).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["installSmokeTideHarpFixture", "player.wayknots.wayknots ="],
    ["installSmokeAdriftFixture", "player.x ="],
  ])("captures before %s starts controlled relocation", (name, mutation) => {
    const begin = mainSource.indexOf(`async function ${name}(`);
    const end = mainSource.indexOf("\nasync function ", begin + 1);
    const source = mainSource.slice(begin, end < 0 ? undefined : end);
    const captureAt = source.indexOf("captureSmokeRelocationSave.toString()");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(captureAt).toBeGreaterThanOrEqual(0);
    expect(source.indexOf(mutation)).toBeGreaterThan(captureAt);
    expect(source.indexOf("envelope.perceptionCarry =")).toBeGreaterThan(captureAt);
  });
});
