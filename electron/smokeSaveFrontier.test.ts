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

function record(value = envelope()) {
  return { slotId: "autosave", seed: "synthetic-frontier", payloadVersion: SAVE_VERSION,
    updatedAt: 123, playTicks: 421, worldJson: JSON.stringify(value) };
}

function runtime() {
  return { save: vi.fn(async () => {}), stop: vi.fn(), start: vi.fn(),
    dispatch: vi.fn(), dispatchUI: vi.fn(), advance: vi.fn(), tick: vi.fn() };
}

interface CaptureResult {
  record: ReturnType<typeof record>;
  envelope: ReturnType<typeof envelope>;
  capture: { attempts: number; observedPhases: number[]; elapsedMs: number };
}
type Capture = (runtime: ReturnType<typeof runtime>, readRecord: () => Promise<unknown>,
  expectedVersion: number, timeoutMs: number) => Promise<CaptureResult>;

function capture(): Capture {
  // Only this function is evaluated. Electron imports and application startup
  // are deliberately outside the VM; real timer waits are replaced locally.
  return runInNewContext(`(${captureSource})`, { Date, setTimeout }) as Capture;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

describe("smoke save relocation frontier", () => {
  it("waits through partial records and returns the original quiet record without collapsing body or knowledge", async () => {
    const records = [record(envelope(9)), record(envelope(4)), record()].map((item) => Object.freeze(item));
    const before = records.map((item) => JSON.stringify(item));
    const calls: string[] = [], owner = runtime();
    owner.save.mockImplementation(async () => { calls.push("save"); });
    let next = 0;
    const read = vi.fn(async () => { calls.push("read"); return records[next++]; });
    const pending = capture()(owner, read, SAVE_VERSION, 1_000);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.record).toBe(records[2]);
    expect(result.envelope).toEqual(JSON.parse(records[2]!.worldJson));
    expect(result.envelope.world).toBe(envelope().world);
    expect(result.envelope.playerExpressionRecency).toEqual(envelope().playerExpressionRecency);
    expect(records.map((item) => JSON.stringify(item))).toEqual(before);
    expect(result.capture).toEqual({ attempts: 3, observedPhases: [0, 4, 9], elapsedMs: 120 });
    expect(calls).toEqual(["save", "read", "save", "read", "save", "read"]);
    for (const operation of [owner.stop, owner.start, owner.dispatch, owner.dispatchUI, owner.advance, owner.tick]) {
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
    const pendingRecord = Object.freeze(record(original)), quiet = Object.freeze(record());
    const before = JSON.stringify(pendingRecord), owner = runtime();
    const read = vi.fn().mockResolvedValueOnce(pendingRecord).mockResolvedValue(quiet);
    const pending = capture()(owner, read, SAVE_VERSION, 1_000);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.record).toBe(quiet);
    expect(result.capture).toEqual({ attempts: 2, observedPhases: [0], elapsedMs: 60 });
    expect(JSON.stringify(pendingRecord)).toBe(before);
  });

  it.each(["time action", "sleeping anchor"])("waits for eligibility after %s instead of rewriting it", async (cause) => {
    const original = envelope();
    if (cause === "time action") original.player.timeAction = { kind: "wait", remainingTicks: 2 };
    else original.perceptionCarry.intervalStartWasSleeping = true;
    const pendingRecord = Object.freeze(record(original)), quiet = Object.freeze(record());
    const before = JSON.stringify(pendingRecord);
    const read = vi.fn().mockResolvedValueOnce(pendingRecord).mockResolvedValue(quiet);
    const pending = capture()(runtime(), read, SAVE_VERSION, 1_000);
    await vi.runAllTimersAsync();
    expect((await pending).record).toBe(quiet);
    expect(read).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(pendingRecord)).toBe(before);
  });

  it.each([[120, 2], [100_000, 80]])("fails when no quiet frontier appears within deadline %s or attempt cap", async (timeoutMs, attempts) => {
    const original = Object.freeze(record(envelope(9))), before = JSON.stringify(original);
    const owner = runtime(), read = vi.fn().mockResolvedValue(original);
    const failure = expect(capture()(owner, read, SAVE_VERSION, timeoutMs))
      .rejects.toThrow(/no closed quiet interval/u);
    await vi.runAllTimersAsync();
    await failure;
    expect(owner.save).toHaveBeenCalledTimes(attempts);
    expect(read).toHaveBeenCalledTimes(attempts);
    expect(JSON.stringify(original)).toBe(before);
  });

  it.each([undefined, null, {}, { worldJson: 1 }])("rejects a missing or malformed record %j", async (badRecord) => {
    await expect(capture()(runtime(), vi.fn().mockResolvedValue(badRecord), SAVE_VERSION, 1_000))
      .rejects.toThrow(/persisted save/u);
  });

  it("rejects malformed JSON without changing the original record", async () => {
    const original = Object.freeze({ ...record(), worldJson: "{" });
    await expect(capture()(runtime(), vi.fn().mockResolvedValue(original), SAVE_VERSION, 1_000))
      .rejects.toThrow();
    expect(original.worldJson).toBe("{");
  });

  it.each(["format", "envelope version", "record version"])("rejects an unsupported %s", async (field) => {
    const value = envelope();
    if (field === "format") value.format = "unrelated-save";
    if (field === "envelope version") value.version = SAVE_VERSION - 1;
    const original = record(value);
    if (field === "record version") original.payloadVersion = SAVE_VERSION + 1;
    await expect(capture()(runtime(), vi.fn().mockResolvedValue(original), SAVE_VERSION, 1_000))
      .rejects.toThrow(/current save format/u);
  });

  it.each([-1, 10, 0.5, undefined])("rejects invalid or missing phase %s", async (phase) => {
    const value = envelope();
    const original = { ...record(), worldJson: JSON.stringify({ ...value,
      perceptionCarry: { ...value.perceptionCarry, playerStepsSinceWorldTick: phase } }) };
    await expect(capture()(runtime(), vi.fn().mockResolvedValue(original), SAVE_VERSION, 1_000))
      .rejects.toThrow(/invalid interval phase/u);
  });

  it.each(["missing", "non-array"])("does not treat a %s pending list as quiet", async (shape) => {
    const value = envelope();
    const original = { ...record(), worldJson: JSON.stringify({ ...value,
      perceptionCarry: { ...value.perceptionCarry,
        playerSenseSamples: shape === "missing" ? undefined : {} } }) };
    const failure = expect(capture()(runtime(), vi.fn().mockResolvedValue(original), SAVE_VERSION, 60))
      .rejects.toThrow(/no closed quiet interval/u);
    await vi.runAllTimersAsync();
    await failure;
  });

  it("propagates a failed save without reading or attempting to repair it", async () => {
    const owner = runtime(), read = vi.fn(), error = new Error("save failed");
    owner.save.mockRejectedValue(error);
    await expect(capture()(owner, read, SAVE_VERSION, 1_000)).rejects.toBe(error);
    expect(read).not.toHaveBeenCalled();
  });

  it("propagates a failed read after the real save", async () => {
    const owner = runtime(), error = new Error("read failed");
    await expect(capture()(owner, vi.fn().mockRejectedValue(error), SAVE_VERSION, 1_000))
      .rejects.toBe(error);
    expect(owner.save).toHaveBeenCalledTimes(1);
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
