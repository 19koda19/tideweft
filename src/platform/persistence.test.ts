import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSaveRepository,
  exportSave,
  importSave,
  type SaveRecord,
} from "./persistence";

const FALLBACK_KEY = "tideweft.saves.v1";

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
