import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConflictingSaveCopiesError,
  createFailoverSaveRepository,
  createSaveRepository,
  exportSave,
  importSave,
  NewerSaveUnavailableError,
  StaleSaveWriteError,
  type SaveRecord,
  type SaveRepository,
} from "./persistence";

const FALLBACK_KEY = "tideweft.saves.v1";
const DELETION_KEY = "tideweft.save-deletions.v1";
const VERSION_FENCE_KEY = "tideweft.save-version-fences.v1";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

function makeRecord(overrides: Partial<SaveRecord> = {}): SaveRecord {
  return {
    slotId: "autosave",
    label: "Quiet water",
    seed: "glass-reed-17",
    updatedAt: 1_700_000_000_000,
    playTicks: 720,
    settlementCount: 5,
    connectedCount: 3,
    worldJson: '{"world":"deterministic"}',
    ...overrides,
  };
}

function useFallbackRepository(storage = new MemoryStorage()) {
  vi.stubGlobal("indexedDB", undefined);
  vi.stubGlobal("localStorage", storage);
  return { repository: createSaveRepository(), storage };
}

function exportedFile(payload: unknown, name = "tideweft-save.json"): File {
  return new File([JSON.stringify(payload)], name, { type: "application/json" });
}

function summary(record: SaveRecord) {
  const { worldJson: _worldJson, screenshot, ...metadata } = record;
  return { ...metadata, hasScreenshot: Boolean(screenshot) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("local-storage save repository", () => {
  it("saves, loads, updates, lists, and removes slots deterministically", async () => {
    const { repository } = useFallbackRepository();
    const first = makeRecord({ slotId: "delta", updatedAt: 100, screenshot: "data:image/png;base64,AA==" });
    const second = makeRecord({ slotId: "alpha", updatedAt: 200, label: "Alpha crossing" });
    const third = makeRecord({ slotId: "beta", updatedAt: 200, label: "Beta crossing" });

    await repository.save(first);
    await repository.save(second);
    await repository.save(third);

    expect(await repository.list()).toEqual([
      {
        slotId: "alpha",
        label: "Alpha crossing",
        seed: second.seed,
        updatedAt: 200,
        playTicks: second.playTicks,
        settlementCount: second.settlementCount,
        connectedCount: second.connectedCount,
        hasScreenshot: false,
      },
      {
        slotId: "beta",
        label: "Beta crossing",
        seed: third.seed,
        updatedAt: 200,
        playTicks: third.playTicks,
        settlementCount: third.settlementCount,
        connectedCount: third.connectedCount,
        hasScreenshot: false,
      },
      {
        slotId: "delta",
        label: first.label,
        seed: first.seed,
        updatedAt: 100,
        playTicks: first.playTicks,
        settlementCount: first.settlementCount,
        connectedCount: first.connectedCount,
        hasScreenshot: true,
      },
    ]);

    expect(await repository.load("alpha")).toEqual(second);
    expect(await repository.load("missing")).toBeUndefined();

    await repository.save({ ...second, label: "Alpha restored", updatedAt: 300 });
    expect(await repository.list()).toHaveLength(3);
    expect(await repository.load("alpha")).toMatchObject({ label: "Alpha restored", updatedAt: 300 });

    await repository.remove("beta");
    await repository.remove("already-missing");
    expect((await repository.list()).map((summary) => summary.slotId)).toEqual(["alpha", "delta"]);
  });

  it("stores a clone instead of retaining the caller's mutable record", async () => {
    const { repository } = useFallbackRepository();
    const record = makeRecord();

    await repository.save(record);
    record.label = "Mutated after save";

    const loaded = await repository.load(record.slotId);
    expect(loaded?.label).toBe("Quiet water");
    if (loaded) loaded.label = "Mutated loaded copy";
    expect((await repository.load(record.slotId))?.label).toBe("Quiet water");
  });

  it("recovers from malformed storage and filters invalid records independently", async () => {
    const { repository, storage } = useFallbackRepository();
    storage.setItem(FALLBACK_KEY, "{not json");
    expect(await repository.list()).toEqual([]);

    const valid = makeRecord({ slotId: "valid" });
    storage.setItem(
      FALLBACK_KEY,
      JSON.stringify([
        valid,
        makeRecord({ slotId: "bad slot" }),
        makeRecord({ slotId: "negative", playTicks: -1 }),
        makeRecord({ slotId: "fraction", connectedCount: 1.5 }),
        { ...makeRecord({ slotId: "bad-shot" }), screenshot: 42 },
      ]),
    );

    expect(await repository.list()).toEqual([
      {
        slotId: "valid",
        label: valid.label,
        seed: valid.seed,
        updatedAt: valid.updatedAt,
        playTicks: valid.playTicks,
        settlementCount: valid.settlementCount,
        connectedCount: valid.connectedCount,
        hasScreenshot: false,
      },
    ]);
  });

  it("rejects invalid records without overwriting a valid slot", async () => {
    const { repository } = useFallbackRepository();
    const valid = makeRecord();
    await repository.save(valid);

    await expect(repository.save(makeRecord({ slotId: "Not Allowed" }))).rejects.toThrow(
      "Invalid save slot identifier",
    );
    await expect(repository.save(makeRecord({ playTicks: Number.NaN }))).rejects.toThrow(
      "invalid number",
    );
    await expect(
      repository.save({ ...makeRecord(), screenshot: 7 as unknown as string }),
    ).rejects.toThrow("missing required fields");

    expect(await repository.load(valid.slotId)).toEqual(valid);
  });

  it("does not replace a newer valid slot with an older snapshot", async () => {
    const { repository } = useFallbackRepository();
    const newest = makeRecord({ updatedAt: 500, playTicks: 900, label: "Newest crossing" });
    await repository.save(newest);

    await expect(
      repository.save(makeRecord({ updatedAt: 499, playTicks: 20, label: "Old clock" })),
    ).rejects.toBeInstanceOf(StaleSaveWriteError);
    await expect(
      repository.save(makeRecord({ updatedAt: 500, playTicks: 899, label: "Old tick" })),
    ).rejects.toBeInstanceOf(StaleSaveWriteError);

    expect(await repository.load(newest.slotId)).toEqual(newest);
  });

  it("orders replacement generations before clocks and treats legacy records as generation zero", async () => {
    const { repository, storage } = useFallbackRepository();
    const legacy = makeRecord({ updatedAt: 9_000, playTicks: 9_000, label: "Legacy crossing" });
    storage.setItem(FALLBACK_KEY, JSON.stringify([legacy]));

    expect(await repository.load("autosave")).toEqual(legacy);
    expect(await repository.list()).toEqual([summary(legacy)]);

    const replacement = makeRecord({
      saveGeneration: 1,
      updatedAt: 100,
      playTicks: 1,
      label: "Replacement crossing",
    });
    await repository.save(replacement);
    expect(await repository.load("autosave")).toEqual(replacement);

    await expect(repository.save(makeRecord({
      saveGeneration: 0,
      updatedAt: Number.MAX_SAFE_INTEGER,
      playTicks: Number.MAX_SAFE_INTEGER,
      label: "Late stale tab",
    }))).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(await repository.load("autosave")).toEqual(replacement);

    const nextReplacement = makeRecord({
      saveGeneration: 2,
      updatedAt: 0,
      playTicks: 0,
      label: "Next replacement",
    });
    await repository.save(nextReplacement);
    expect(await repository.load("autosave")).toEqual(nextReplacement);
    expect(await repository.list()).toEqual([summary(nextReplacement)]);
  });

  it("rejects invalid generation metadata without disturbing the stored save", async () => {
    const { repository } = useFallbackRepository();
    const valid = makeRecord({ saveGeneration: 3 });
    await repository.save(valid);

    await expect(repository.save(makeRecord({ saveGeneration: -1 }))).rejects.toThrow(
      "invalid number",
    );
    await expect(repository.save(makeRecord({ saveGeneration: 1.5 }))).rejects.toThrow(
      "invalid number",
    );
    await expect(repository.save(makeRecord({ saveGenerationEra: -1 }))).rejects.toThrow(
      "invalid number",
    );
    await expect(repository.save(makeRecord({ saveGenerationEra: 1.5 }))).rejects.toThrow(
      "invalid number",
    );
    expect(await repository.load("autosave")).toEqual(valid);
  });

  it("orders generation eras before saturated generations and retains them in summaries", async () => {
    const { repository } = useFallbackRepository();
    const saturatedLegacyEra = makeRecord({
      saveGeneration: Number.MAX_SAFE_INTEGER,
      updatedAt: Number.MAX_SAFE_INTEGER,
      playTicks: Number.MAX_SAFE_INTEGER,
      label: "Saturated era zero",
    });
    await repository.save(saturatedLegacyEra);

    const recovered = makeRecord({
      saveGenerationEra: 1,
      saveGeneration: 0,
      updatedAt: 0,
      playTicks: 0,
      label: "Recovered era one",
    });
    await repository.save(recovered);
    expect(await repository.load("autosave")).toEqual(recovered);
    expect(await repository.list()).toEqual([summary(recovered)]);

    await expect(repository.save(saturatedLegacyEra)).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(await repository.load("autosave")).toEqual(recovered);
  });

  it("accepts an identical retry but rejects divergent payloads at the same ordering tuple", async () => {
    const { repository } = useFallbackRepository();
    const durable = makeRecord({ updatedAt: 880, playTicks: 42, label: "Durable branch" });
    await repository.save(durable);
    await expect(repository.save(structuredClone(durable))).resolves.toBeUndefined();

    const conflict = { ...durable, label: "Divergent tab", worldJson: '{"world":"other"}' };
    await expect(repository.save(conflict)).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(await repository.load("autosave")).toEqual(durable);
  });

  it("treats the outer payload-version fence as part of an exact retry", async () => {
    const { repository } = useFallbackRepository();
    const durable = makeRecord({
      payloadVersion: 3,
      updatedAt: 881,
      playTicks: 43,
      worldJson: '{"format":"tideweft-session","version":3}',
    });
    await repository.save(durable);

    await expect(repository.save({ ...durable, payloadVersion: 2 }))
      .rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(await repository.load("autosave")).toEqual(durable);
  });
});

describe("IndexedDB runtime failover", () => {
  it("loads the newest copy across stores using ticks to break timestamp ties", async () => {
    const primaryRecord = makeRecord({ updatedAt: 700, playTicks: 80, label: "Primary copy" });
    const fallbackRecord = makeRecord({ updatedAt: 700, playTicks: 81, label: "Fallback copy" });
    const primary: SaveRepository = {
      list: vi.fn(async () => [summary(primaryRecord)]),
      load: vi.fn(async () => structuredClone(primaryRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => [summary(fallbackRecord)]),
      load: vi.fn(async () => structuredClone(fallbackRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback);

    const loaded = await repository.load("autosave");
    expect(loaded).toEqual(fallbackRecord);
    if (loaded) loaded.label = "mutated caller copy";
    expect(await repository.load("autosave")).toEqual(fallbackRecord);
    expect(await repository.list()).toEqual([summary(fallbackRecord)]);
  });

  it("loads the highest replacement generation across stores despite a lower clock", async () => {
    const primaryRecord = makeRecord({
      saveGeneration: 4,
      updatedAt: 100,
      playTicks: 1,
      label: "Replacement generation",
    });
    const fallbackRecord = makeRecord({
      saveGeneration: 3,
      updatedAt: Number.MAX_SAFE_INTEGER,
      playTicks: Number.MAX_SAFE_INTEGER,
      label: "Stale future clock",
    });
    const primary: SaveRepository = {
      list: vi.fn(async () => [summary(primaryRecord)]),
      load: vi.fn(async () => structuredClone(primaryRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => [summary(fallbackRecord)]),
      load: vi.fn(async () => structuredClone(fallbackRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback);

    expect(await repository.load("autosave")).toEqual(primaryRecord);
    expect(await repository.list()).toEqual([summary(primaryRecord)]);
  });

  it("rejects a stale write against a newer fallback before touching healthy primary storage", async () => {
    const primaryRecord = makeRecord({ updatedAt: 100, playTicks: 10, label: "Primary old" });
    const fallbackRecord = makeRecord({ updatedAt: 300, playTicks: 30, label: "Fallback newest" });
    const primary: SaveRepository = {
      list: vi.fn(async () => [summary(primaryRecord)]),
      load: vi.fn(async () => structuredClone(primaryRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => [summary(fallbackRecord)]),
      load: vi.fn(async () => structuredClone(fallbackRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback);

    await expect(repository.save(makeRecord({ updatedAt: 200, playTicks: 20 })))
      .rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(primary.save).not.toHaveBeenCalled();
    expect(fallback.save).not.toHaveBeenCalled();
  });

  it("rejects an equal-version divergent fallback before touching primary storage", async () => {
    const fallbackRecord = makeRecord({ updatedAt: 300, playTicks: 30, label: "Fallback branch" });
    const primary: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => [summary(fallbackRecord)]),
      load: vi.fn(async () => structuredClone(fallbackRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback);
    const conflict = { ...fallbackRecord, label: "Other tab", worldJson: '{"world":"fork"}' };

    await expect(repository.save(conflict)).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(primary.save).not.toHaveBeenCalled();
    expect(fallback.save).not.toHaveBeenCalled();
  });

  it("rejects equal-version divergent copies instead of choosing a backend silently", async () => {
    const primaryRecord = makeRecord({ updatedAt: 330, playTicks: 33, label: "Same summary" });
    const fallbackRecord = { ...primaryRecord, worldJson: '{"world":"divergent"}' };
    const primary: SaveRepository = {
      list: vi.fn(async () => [summary(primaryRecord)]),
      load: vi.fn(async () => structuredClone(primaryRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => [summary(fallbackRecord)]),
      load: vi.fn(async () => structuredClone(fallbackRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback);

    await expect(repository.load("autosave")).rejects.toBeInstanceOf(ConflictingSaveCopiesError);
    await expect(repository.list()).rejects.toBeInstanceOf(ConflictingSaveCopiesError);
  });

  it("rejects equal-version copies that disagree only on the outer payload-version fence", async () => {
    const primaryRecord = makeRecord({
      payloadVersion: 3,
      updatedAt: 331,
      playTicks: 34,
      worldJson: '{"format":"tideweft-session","version":3}',
    });
    const fallbackRecord = { ...primaryRecord, payloadVersion: 2 };
    const primary: SaveRepository = {
      list: vi.fn(async () => [summary(primaryRecord)]),
      load: vi.fn(async () => structuredClone(primaryRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => [summary(fallbackRecord)]),
      load: vi.fn(async () => structuredClone(fallbackRecord)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback);

    await expect(repository.load("autosave")).rejects.toBeInstanceOf(ConflictingSaveCopiesError);
    await expect(repository.list()).rejects.toBeInstanceOf(ConflictingSaveCopiesError);
  });

  it("surfaces a same-version divergence created between fallback preflight and mirror", async () => {
    const old = makeRecord({ updatedAt: 100, playTicks: 10, label: "Before race" });
    const candidate = makeRecord({ updatedAt: 200, playTicks: 20, label: "Candidate branch" });
    let primaryRecord: SaveRecord | undefined = structuredClone(old);
    let fallbackRecord: SaveRecord | undefined = structuredClone(old);
    const primary: SaveRepository = {
      list: vi.fn(async () => primaryRecord ? [summary(primaryRecord)] : []),
      load: vi.fn(async () => primaryRecord ? structuredClone(primaryRecord) : undefined),
      save: vi.fn(async (record) => {
        primaryRecord = structuredClone(record);
        fallbackRecord = { ...structuredClone(record), worldJson: '{"world":"racing tab"}' };
      }),
      remove: vi.fn(async () => { primaryRecord = undefined; }),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => fallbackRecord ? [summary(fallbackRecord)] : []),
      load: vi.fn(async () => fallbackRecord ? structuredClone(fallbackRecord) : undefined),
      save: vi.fn(async (record) => {
        if (fallbackRecord && fallbackRecord.updatedAt === record.updatedAt
          && fallbackRecord.playTicks === record.playTicks
          && fallbackRecord.worldJson !== record.worldJson) {
          throw new StaleSaveWriteError(record.slotId);
        }
        fallbackRecord = structuredClone(record);
      }),
      remove: vi.fn(async () => { fallbackRecord = undefined; }),
    };
    const repository = createFailoverSaveRepository(primary, fallback);

    await expect(repository.save(candidate)).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(primaryRecord).toEqual(candidate);
    expect(fallbackRecord?.worldJson).toBe('{"world":"racing tab"}');

    const nextSession = createFailoverSaveRepository(primary, fallback);
    await expect(nextSession.load("autosave")).rejects.toBeInstanceOf(ConflictingSaveCopiesError);
  });

  it("mirrors healthy primary saves but fails closed while a peer backend is unreadable", async () => {
    const deletionStorage = new MemoryStorage();
    let primaryRecord: SaveRecord | undefined = makeRecord({ updatedAt: 100, playTicks: 10 });
    let fallbackRecord: SaveRecord | undefined = structuredClone(primaryRecord);
    let primaryAvailable = true;
    const primary: SaveRepository = {
      list: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("IndexedDB unavailable");
        return primaryRecord ? [summary(primaryRecord)] : [];
      }),
      load: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("IndexedDB unavailable");
        return primaryRecord ? structuredClone(primaryRecord) : undefined;
      }),
      save: vi.fn(async (record) => { primaryRecord = structuredClone(record); }),
      remove: vi.fn(async () => { primaryRecord = undefined; }),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => fallbackRecord ? [summary(fallbackRecord)] : []),
      load: vi.fn(async () => fallbackRecord ? structuredClone(fallbackRecord) : undefined),
      save: vi.fn(async (record) => { fallbackRecord = structuredClone(record); }),
      remove: vi.fn(async () => { fallbackRecord = undefined; }),
    };
    const firstSession = createFailoverSaveRepository(primary, fallback, deletionStorage);
    const newest = makeRecord({ updatedAt: 200, playTicks: 20, label: "Mirrored newest" });

    await firstSession.save(newest);
    expect(primaryRecord).toEqual(newest);
    expect(fallbackRecord).toEqual(newest);
    expect(JSON.parse(deletionStorage.getItem(VERSION_FENCE_KEY) ?? "[]")).toEqual([
      expect.objectContaining({
        slotId: "autosave",
        updatedAt: 200,
        playTicks: 20,
        recordFingerprint: expect.any(String),
      }),
    ]);

    primaryAvailable = false;
    const outageSession = createFailoverSaveRepository(primary, fallback, deletionStorage);
    await expect(outageSession.load("autosave")).rejects.toThrow("IndexedDB unavailable");
    await expect(outageSession.list()).rejects.toThrow("complete save list cannot be verified");
    primaryAvailable = true;
    const recoveredSession = createFailoverSaveRepository(primary, fallback, deletionStorage);
    await expect(recoveredSession.load("autosave")).resolves.toEqual(newest);
    await expect(recoveredSession.list()).resolves.toEqual([summary(newest)]);
  });

  it("never treats a one-backend read failure as proven presence or absence", async () => {
    const latentPrimary = makeRecord({ label: "Latent IndexedDB-only save" });
    const emptyFallback: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const failedPrimary: SaveRepository = {
      list: vi.fn(async () => { throw new Error("primary list unreadable"); }),
      load: vi.fn(async () => { throw new Error("primary load unreadable"); }),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const primaryOutage = createFailoverSaveRepository(failedPrimary, emptyFallback);
    await expect(primaryOutage.load(latentPrimary.slotId)).rejects.toThrow("primary load unreadable");
    const primaryListOutage = createFailoverSaveRepository(failedPrimary, emptyFallback);
    await expect(primaryListOutage.list()).rejects.toThrow("primary list unreadable");

    const readablePrimary: SaveRepository = {
      list: vi.fn(async () => [summary(latentPrimary)]),
      load: vi.fn(async () => structuredClone(latentPrimary)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const failedFallback: SaveRepository = {
      list: vi.fn(async () => { throw new Error("fallback list unreadable"); }),
      load: vi.fn(async () => { throw new Error("fallback load unreadable"); }),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const fallbackOutage = createFailoverSaveRepository(readablePrimary, failedFallback);
    await expect(fallbackOutage.load(latentPrimary.slotId)).rejects.toThrow("fallback load unreadable");
    const fallbackListOutage = createFailoverSaveRepository(readablePrimary, failedFallback);
    await expect(fallbackListOutage.list()).rejects.toThrow("fallback list unreadable");

    const bothReadableAndEmpty = createFailoverSaveRepository(emptyFallback, emptyFallback);
    await expect(bothReadableAndEmpty.load("autosave")).resolves.toBeUndefined();
    await expect(bothReadableAndEmpty.list()).resolves.toEqual([]);
  });

  it("does not bless a stale survivor after an unfenced partial primary commit", async () => {
    const fenceStorage = new MemoryStorage();
    const originalSetItem = fenceStorage.setItem.bind(fenceStorage);
    let rejectFenceWrites = false;
    vi.spyOn(fenceStorage, "setItem").mockImplementation((key, value) => {
      if (rejectFenceWrites && key === VERSION_FENCE_KEY) {
        throw new Error("version fence quota failure");
      }
      originalSetItem(key, value);
    });
    const versionOne = makeRecord({ updatedAt: 100, playTicks: 10, label: "Version one" });
    const staleVersionTwo = makeRecord({ updatedAt: 200, playTicks: 20, label: "Stale version two" });
    const committedVersionThree = makeRecord({ updatedAt: 300, playTicks: 30, label: "Committed version three" });
    let primaryAvailable = true;
    let primaryRecord: SaveRecord | undefined = structuredClone(versionOne);
    let fallbackRecord: SaveRecord | undefined = structuredClone(versionOne);
    let rejectFallbackMutation = false;
    const primary: SaveRepository = {
      list: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("primary unavailable after partial commit");
        return primaryRecord ? [summary(primaryRecord)] : [];
      }),
      load: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("primary unavailable after partial commit");
        return primaryRecord ? structuredClone(primaryRecord) : undefined;
      }),
      save: vi.fn(async (record) => { primaryRecord = structuredClone(record); }),
      remove: vi.fn(async () => { primaryRecord = undefined; }),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => fallbackRecord ? [summary(fallbackRecord)] : []),
      load: vi.fn(async () => fallbackRecord ? structuredClone(fallbackRecord) : undefined),
      save: vi.fn(async (record) => {
        if (rejectFallbackMutation) throw new Error("fallback mirror quota failure");
        fallbackRecord = structuredClone(record);
      }),
      remove: vi.fn(async () => {
        if (rejectFallbackMutation) throw new Error("fallback removal unavailable");
        fallbackRecord = undefined;
      }),
    };

    const healthy = createFailoverSaveRepository(primary, fallback, fenceStorage);
    await expect(healthy.load("autosave")).resolves.toEqual(versionOne);
    fallbackRecord = structuredClone(staleVersionTwo);
    rejectFenceWrites = true;
    rejectFallbackMutation = true;
    await expect(healthy.save(committedVersionThree)).resolves.toBeUndefined();
    expect(primaryRecord).toEqual(committedVersionThree);
    expect(fallbackRecord).toEqual(staleVersionTwo);
    expect(JSON.parse(fenceStorage.getItem(VERSION_FENCE_KEY) ?? "[]"))
      .toEqual([expect.objectContaining({ updatedAt: 100, playTicks: 10 })]);

    primaryAvailable = false;
    const outage = createFailoverSaveRepository(primary, fallback, fenceStorage);
    await expect(outage.load("autosave"))
      .rejects.toThrow("primary unavailable after partial commit");
    expect(fallbackRecord).toEqual(staleVersionTwo);
  });

  it("uses a durable version fence instead of silently loading a stale fallback", async () => {
    const deletionStorage = new MemoryStorage();
    const old = makeRecord({ updatedAt: 100, playTicks: 10, label: "Old fallback" });
    const newest = makeRecord({ updatedAt: 200, playTicks: 20, label: "Primary only newest" });
    let primaryRecord: SaveRecord | undefined = structuredClone(old);
    let primaryAvailable = true;
    const primary: SaveRepository = {
      list: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("IndexedDB unavailable");
        return primaryRecord ? [summary(primaryRecord)] : [];
      }),
      load: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("IndexedDB unavailable");
        return primaryRecord ? structuredClone(primaryRecord) : undefined;
      }),
      save: vi.fn(async (record) => { primaryRecord = structuredClone(record); }),
      remove: vi.fn(async () => { primaryRecord = undefined; }),
    };
    const quotaFallback: SaveRepository = {
      list: vi.fn(async () => [summary(old)]),
      load: vi.fn(async () => structuredClone(old)),
      save: vi.fn(async () => { throw new Error("localStorage quota exceeded"); }),
      remove: vi.fn(async () => { throw new Error("localStorage unavailable"); }),
    };
    const healthySession = createFailoverSaveRepository(primary, quotaFallback, deletionStorage);

    await expect(healthySession.save(newest)).resolves.toBeUndefined();
    expect(primaryRecord).toEqual(newest);
    primaryAvailable = false;

    const outageSession = createFailoverSaveRepository(primary, quotaFallback, deletionStorage);
    await expect(outageSession.load("autosave")).rejects.toThrow("IndexedDB unavailable");
    await expect(outageSession.list()).rejects.toThrow("complete save list cannot be verified");

    const equalButDivergent = { ...newest, worldJson: '{"world":"equal metadata fork"}' };
    const divergentFallback: SaveRepository = {
      list: vi.fn(async () => [summary(equalButDivergent)]),
      load: vi.fn(async () => structuredClone(equalButDivergent)),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    primaryAvailable = true;
    primaryRecord = undefined;
    const conflictSession = createFailoverSaveRepository(primary, divergentFallback, deletionStorage);
    await expect(conflictSession.load("autosave"))
      .rejects.toBeInstanceOf(ConflictingSaveCopiesError);
    const conflictListSession = createFailoverSaveRepository(primary, divergentFallback, deletionStorage);
    await expect(conflictListSession.list())
      .rejects.toBeInstanceOf(ConflictingSaveCopiesError);
  });

  it("never adopts a lone fallback after a primary runtime failure", async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", storage);
    const fallback = createSaveRepository();
    const existing = makeRecord({ updatedAt: 900, playTicks: 400, label: "Safe fallback" });
    await fallback.save(existing);
    const primary: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => { throw new Error("IndexedDB transaction aborted"); }),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback);

    await expect(repository.load("autosave")).rejects.toThrow("IndexedDB transaction aborted");
    await expect(
      repository.save(makeRecord({ updatedAt: 899, playTicks: 999, label: "Stale runtime" })),
    ).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(await fallback.load("autosave")).toEqual(existing);
    expect(primary.save).not.toHaveBeenCalled();

    const latest = makeRecord({ updatedAt: 901, playTicks: 401, label: "Recovered runtime" });
    await repository.save(latest);
    expect(await fallback.load("autosave")).toEqual(latest);
    await expect(repository.load("autosave")).rejects.toThrow("Primary local save storage is unavailable");
    expect(primary.load).toHaveBeenCalledOnce();
    expect(primary.save).not.toHaveBeenCalled();
  });

  it("falls through when a primary save fails after opening successfully", async () => {
    let fallbackRecord = makeRecord({ updatedAt: 100, playTicks: 10 });
    const primary: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => { throw new Error("IndexedDB quota failure"); }),
      remove: vi.fn(async () => undefined),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => [summary(fallbackRecord)]),
      load: vi.fn(async () => structuredClone(fallbackRecord)),
      save: vi.fn(async (record) => { fallbackRecord = structuredClone(record); }),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback);
    const first = makeRecord({ updatedAt: 200, playTicks: 20, label: "First fallback" });
    const second = makeRecord({ updatedAt: 300, playTicks: 30, label: "Sticky fallback" });

    await repository.save(first);
    await repository.save(second);

    expect(primary.save).toHaveBeenCalledOnce();
    expect(fallback.save).toHaveBeenCalledTimes(2);
    expect(fallbackRecord).toEqual(second);
  });

  it("keeps a failed-primary deletion authoritative across repository instances", async () => {
    const deletionStorage = new MemoryStorage();
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const original = makeRecord({ updatedAt: 900, playTicks: 40, label: "Before deletion" });
    let primaryAvailable = true;
    let primaryRecord: SaveRecord | undefined = structuredClone(original);
    let fallbackRecord: SaveRecord | undefined = structuredClone(original);
    const primary: SaveRepository = {
      list: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("IndexedDB transaction aborted");
        return primaryRecord ? [summary(primaryRecord)] : [];
      }),
      load: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("IndexedDB transaction aborted");
        return primaryRecord ? structuredClone(primaryRecord) : undefined;
      }),
      save: vi.fn(async (record) => {
        if (!primaryAvailable) throw new Error("IndexedDB transaction aborted");
        primaryRecord = structuredClone(record);
      }),
      remove: vi.fn(async () => {
        if (!primaryAvailable) throw new Error("IndexedDB transaction aborted");
        primaryRecord = undefined;
      }),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => fallbackRecord ? [summary(fallbackRecord)] : []),
      load: vi.fn(async () => fallbackRecord ? structuredClone(fallbackRecord) : undefined),
      save: vi.fn(async (record) => { fallbackRecord = structuredClone(record); }),
      remove: vi.fn(async () => { fallbackRecord = undefined; }),
    };

    const healthySession = createFailoverSaveRepository(primary, fallback, deletionStorage);
    await expect(healthySession.load("autosave")).resolves.toEqual(original);
    primaryAvailable = false;

    const failedSession = createFailoverSaveRepository(primary, fallback, deletionStorage);
    await expect(failedSession.load("autosave")).rejects.toThrow("IndexedDB transaction aborted");
    await failedSession.remove("autosave");

    expect(primary.remove).not.toHaveBeenCalled();
    expect(primaryRecord).toEqual(original);
    expect(fallbackRecord).toBeUndefined();
    await expect(failedSession.load("autosave"))
      .rejects.toThrow("Primary local save storage is unavailable");
    await expect(failedSession.list()).rejects.toThrow("complete save list cannot be verified");
    expect(JSON.parse(deletionStorage.getItem(DELETION_KEY) ?? "[]")).toEqual([
      { slotId: "autosave", saveGeneration: 0, updatedAt: 1_000, playTicks: 0 },
    ]);

    primaryAvailable = true;
    const recoveredSession = createFailoverSaveRepository(primary, fallback, deletionStorage);
    expect(await recoveredSession.load("autosave")).toBeUndefined();
    expect(await recoveredSession.list()).toEqual([]);

    const staleSave = makeRecord({ updatedAt: 999, playTicks: 9_999, label: "Stale callback" });
    await expect(recoveredSession.save(staleSave)).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(primary.save).not.toHaveBeenCalled();
    expect(primaryRecord).toEqual(original);
    expect(await recoveredSession.load("autosave")).toBeUndefined();

    const recreated = makeRecord({ updatedAt: 1_001, playTicks: 1, label: "New crossing" });
    await recoveredSession.save(recreated);
    expect(primary.save).toHaveBeenCalledOnce();
    expect(primaryRecord).toEqual(recreated);
    expect(JSON.parse(deletionStorage.getItem(DELETION_KEY) ?? "[]")).toEqual([]);

    const nextSession = createFailoverSaveRepository(primary, fallback, deletionStorage);
    expect(await nextSession.load("autosave")).toEqual(recreated);
    expect(await nextSession.list()).toEqual([summary(recreated)]);
  });

  it("carries generations through deletion journals and blocks stale prior-generation resurrection", async () => {
    const deletionStorage = new MemoryStorage();
    vi.spyOn(Date, "now").mockReturnValue(50);
    let stored: SaveRecord | undefined = makeRecord({
      saveGeneration: 7,
      updatedAt: 40,
      playTicks: 12,
      label: "Before generated deletion",
    });
    const backend: SaveRepository = {
      list: vi.fn(async () => stored ? [summary(stored)] : []),
      load: vi.fn(async () => stored ? structuredClone(stored) : undefined),
      save: vi.fn(async (record) => { stored = structuredClone(record); }),
      remove: vi.fn(async () => { stored = undefined; }),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const deletingSession = createFailoverSaveRepository(backend, fallback, deletionStorage);

    await deletingSession.remove("autosave");
    expect(JSON.parse(deletionStorage.getItem(DELETION_KEY) ?? "[]")).toEqual([
      { slotId: "autosave", saveGeneration: 7, updatedAt: 40, playTicks: 12 },
    ]);

    const stale = makeRecord({
      saveGeneration: 6,
      updatedAt: Number.MAX_SAFE_INTEGER,
      playTicks: Number.MAX_SAFE_INTEGER,
      label: "Prior generation callback",
    });
    const staleSession = createFailoverSaveRepository(backend, fallback, deletionStorage);
    await expect(staleSession.save(stale)).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(backend.save).not.toHaveBeenCalled();
    expect(await staleSession.load("autosave")).toBeUndefined();

    const replacement = makeRecord({
      saveGeneration: 8,
      updatedAt: 0,
      playTicks: 0,
      label: "Replacement after deletion",
    });
    await staleSession.save(replacement);
    expect(backend.save).toHaveBeenCalledOnce();
    expect(await staleSession.load("autosave")).toEqual(replacement);
    expect(JSON.parse(deletionStorage.getItem(DELETION_KEY) ?? "[]")).toEqual([]);
  });

  it("retains generation eras in deletion journals and rejects saturated older-era resurrection", async () => {
    const deletionStorage = new MemoryStorage();
    let stored: SaveRecord | undefined = makeRecord({
      saveGenerationEra: 2,
      saveGeneration: 4,
      updatedAt: 80,
      playTicks: 18,
      label: "Era two before deletion",
    });
    const backend: SaveRepository = {
      list: vi.fn(async () => stored ? [summary(stored)] : []),
      load: vi.fn(async () => stored ? structuredClone(stored) : undefined),
      save: vi.fn(async (record) => { stored = structuredClone(record); }),
      remove: vi.fn(async () => { stored = undefined; }),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(backend, fallback, deletionStorage);

    await repository.remove("autosave");
    expect(JSON.parse(deletionStorage.getItem(DELETION_KEY) ?? "[]")).toEqual([
      {
        slotId: "autosave",
        saveGenerationEra: 2,
        saveGeneration: 4,
        updatedAt: 80,
        playTicks: 18,
      },
    ]);

    await expect(repository.save(makeRecord({
      saveGenerationEra: 1,
      saveGeneration: Number.MAX_SAFE_INTEGER,
      updatedAt: Number.MAX_SAFE_INTEGER,
      playTicks: Number.MAX_SAFE_INTEGER,
    }))).rejects.toBeInstanceOf(StaleSaveWriteError);

    const recreated = makeRecord({
      saveGenerationEra: 2,
      saveGeneration: 5,
      updatedAt: 0,
      playTicks: 0,
      label: "Era-aware recreation",
    });
    await repository.save(recreated);
    expect(await repository.load("autosave")).toEqual(recreated);
    expect(JSON.parse(deletionStorage.getItem(DELETION_KEY) ?? "[]")).toEqual([]);
  });

  it("reads legacy generationless deletion journals as generation zero", async () => {
    const deletionStorage = new MemoryStorage();
    deletionStorage.setItem(DELETION_KEY, JSON.stringify([
      { slotId: "autosave", updatedAt: 500, playTicks: 20 },
    ]));
    const legacy = makeRecord({ updatedAt: 500, playTicks: 20 });
    let primaryRecord: SaveRecord | undefined = structuredClone(legacy);
    const primary: SaveRepository = {
      list: vi.fn(async () => primaryRecord ? [summary(primaryRecord)] : []),
      load: vi.fn(async () => primaryRecord ? structuredClone(primaryRecord) : undefined),
      save: vi.fn(async (record) => { primaryRecord = structuredClone(record); }),
      remove: vi.fn(async () => { primaryRecord = undefined; }),
    };
    const fallback: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const repository = createFailoverSaveRepository(primary, fallback, deletionStorage);

    expect(await repository.load("autosave")).toBeUndefined();
    expect(await repository.list()).toEqual([]);

    const replacement = makeRecord({ saveGeneration: 1, updatedAt: 0, playTicks: 0 });
    await repository.save(replacement);
    expect(await repository.load("autosave")).toEqual(replacement);
  });
});

describe("save import and export", () => {
  it("imports a valid versioned envelope", async () => {
    const record = makeRecord({ slotId: "imported", screenshot: "data:image/webp;base64,AA==" });
    const file = exportedFile({ format: "tideweft-export", version: 1, record });

    await expect(importSave(file)).resolves.toEqual(record);
  });

  it("rejects malformed, foreign, future, and invalid exports with clear errors", async () => {
    await expect(importSave(new File(["{"], "broken.json"))).rejects.toThrow("valid JSON");
    await expect(importSave(exportedFile(null))).rejects.toThrow("not a TIDEWEFT save export");
    await expect(
      importSave(exportedFile({ format: "another-game", version: 1, record: makeRecord() })),
    ).rejects.toThrow("unknown or future format");
    await expect(
      importSave(exportedFile({ format: "tideweft-export", version: 2, record: makeRecord() })),
    ).rejects.toThrow("unknown or future format");
    await expect(
      importSave(
        exportedFile({
          format: "tideweft-export",
          version: 1,
          record: { ...makeRecord(), screenshot: { html: "not-an-image" } },
        }),
      ),
    ).rejects.toThrow("unknown or future format");
    await expect(
      importSave(
        exportedFile({
          format: "tideweft-export",
          version: 1,
          record: makeRecord({ updatedAt: -1 }),
        }),
      ),
    ).rejects.toThrow("invalid number");
  });

  it("rejects oversized imports before reading their contents", async () => {
    const text = vi.fn(async () => JSON.stringify({ format: "tideweft-export", version: 1 }));
    const oversized = { size: 20_000_001, text } as unknown as File;

    await expect(importSave(oversized)).rejects.toThrow("20 MB import limit");
    expect(text).not.toHaveBeenCalled();
  });

  it("exports the validated record in a downloadable versioned envelope and revokes its URL", async () => {
    vi.useFakeTimers();
    const record = makeRecord({ slotId: "evening-weave" });
    const anchor = { download: "", href: "", click: vi.fn() };
    const createElement = vi.fn(() => anchor);
    vi.stubGlobal("document", { createElement });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:tideweft-save");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    exportSave(record);

    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.download).toBe("tideweft-evening-weave.json");
    expect(anchor.href).toBe("blob:tideweft-save");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    await expect((blob as Blob).text()).resolves.toBe(
      JSON.stringify({ format: "tideweft-export", version: 1, record }),
    );

    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:tideweft-save");
  });
});
