export interface SaveRecord {
  slotId: string;
  label: string;
  seed: string;
  updatedAt: number;
  playTicks: number;
  settlementCount: number;
  connectedCount: number;
  worldJson: string;
  screenshot?: string;
}

export interface SaveSummary extends Omit<SaveRecord, "worldJson" | "screenshot"> {
  hasScreenshot: boolean;
}

export interface SaveRepository {
  list(): Promise<SaveSummary[]>;
  load(slotId: string): Promise<SaveRecord | undefined>;
  save(record: SaveRecord): Promise<void>;
  remove(slotId: string): Promise<void>;
}

const DATABASE_NAME = "tideweft";
const DATABASE_VERSION = 1;
const SAVE_STORE = "saves";
const FALLBACK_KEY = "tideweft.saves.v1";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), {
      once: true,
    });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("IndexedDB transaction failed")),
      { once: true },
    );
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(SAVE_STORE)) {
      const saves = database.createObjectStore(SAVE_STORE, { keyPath: "slotId" });
      saves.createIndex("updatedAt", "updatedAt", { unique: false });
    }
  });
  return requestResult(request);
}

function summarize(record: SaveRecord): SaveSummary {
  return {
    slotId: record.slotId,
    label: record.label,
    seed: record.seed,
    updatedAt: record.updatedAt,
    playTicks: record.playTicks,
    settlementCount: record.settlementCount,
    connectedCount: record.connectedCount,
    hasScreenshot: Boolean(record.screenshot),
  };
}

class IndexedDbSaveRepository implements SaveRepository {
  private databasePromise: Promise<IDBDatabase> | undefined;

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase();
    return this.databasePromise;
  }

  async list(): Promise<SaveSummary[]> {
    const database = await this.database();
    const transaction = database.transaction(SAVE_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(SAVE_STORE).getAll() as IDBRequest<SaveRecord[]>);
    await transactionComplete(transaction);
    return records
      .sort((left, right) => right.updatedAt - left.updatedAt || left.slotId.localeCompare(right.slotId))
      .map(summarize);
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    const database = await this.database();
    const transaction = database.transaction(SAVE_STORE, "readonly");
    const record = await requestResult(
      transaction.objectStore(SAVE_STORE).get(slotId) as IDBRequest<SaveRecord | undefined>,
    );
    await transactionComplete(transaction);
    return record;
  }

  async save(record: SaveRecord): Promise<void> {
    validateRecord(record);
    const database = await this.database();
    const transaction = database.transaction(SAVE_STORE, "readwrite", { durability: "strict" });
    const store = transaction.objectStore(SAVE_STORE);
    const existing = await requestResult(
      store.get(record.slotId) as IDBRequest<SaveRecord | undefined>,
    );
    if (!existing || !isRecordNewer(existing, record)) {
      store.put(structuredClone(record));
    }
    await transactionComplete(transaction);
  }

  async remove(slotId: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(SAVE_STORE, "readwrite");
    transaction.objectStore(SAVE_STORE).delete(slotId);
    await transactionComplete(transaction);
  }
}

class LocalStorageSaveRepository implements SaveRepository {
  constructor(private readonly storage: Storage) {}

  private read(): SaveRecord[] {
    const raw = this.storage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    try {
      const records = JSON.parse(raw) as unknown;
      return Array.isArray(records) ? records.filter(isValidSaveRecord) : [];
    } catch {
      return [];
    }
  }

  private write(records: SaveRecord[]): void {
    this.storage.setItem(FALLBACK_KEY, JSON.stringify(records));
  }

  async list(): Promise<SaveSummary[]> {
    return this.read()
      .sort((left, right) => right.updatedAt - left.updatedAt || left.slotId.localeCompare(right.slotId))
      .map(summarize);
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    return this.read().find((record) => record.slotId === slotId);
  }

  async save(record: SaveRecord): Promise<void> {
    validateRecord(record);
    const stored = this.read();
    const existing = stored.find((candidate) => candidate.slotId === record.slotId);
    if (existing && isRecordNewer(existing, record)) return;
    const records = stored.filter((candidate) => candidate.slotId !== record.slotId);
    records.push(structuredClone(record));
    this.write(records);
  }

  async remove(slotId: string): Promise<void> {
    this.write(this.read().filter((record) => record.slotId !== slotId));
  }
}

/**
 * IndexedDB remains the roomy primary store, while localStorage is a small,
 * synchronous browser-owned lifeboat. Reading both stores prevents a newer
 * fallback written during an earlier IndexedDB outage from disappearing when
 * IndexedDB happens to open on the next launch. Once a primary operation
 * fails, this repository stays on the fallback for the rest of its lifetime;
 * alternating between a flaky primary and fallback could otherwise resurrect
 * stale state between consecutive saves.
 */
class FailoverSaveRepository implements SaveRepository {
  private primaryFailed = false;

  constructor(
    private readonly primary: SaveRepository,
    private readonly fallback: SaveRepository,
  ) {}

  async list(): Promise<SaveSummary[]> {
    if (this.primaryFailed) return this.fallback.list();

    let primary: SaveSummary[];
    try {
      primary = await this.primary.list();
    } catch {
      this.primaryFailed = true;
      return this.fallback.list();
    }

    let fallback: SaveSummary[];
    try {
      fallback = await this.fallback.list();
    } catch {
      return primary;
    }
    return mergeNewest(primary, fallback);
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    if (this.primaryFailed) return cloneRecord(await this.fallback.load(slotId));

    let primary: SaveRecord | undefined;
    try {
      primary = await this.primary.load(slotId);
    } catch {
      this.primaryFailed = true;
      return cloneRecord(await this.fallback.load(slotId));
    }

    let fallback: SaveRecord | undefined;
    try {
      fallback = await this.fallback.load(slotId);
    } catch {
      return cloneRecord(primary);
    }
    const newest = newestRecord(primary, fallback);
    return cloneRecord(newest);
  }

  async save(record: SaveRecord): Promise<void> {
    validateRecord(record);
    const snapshot = structuredClone(record);
    if (this.primaryFailed) {
      await this.fallback.save(snapshot);
      return;
    }

    // Do not let a stale runtime snapshot overwrite either backend after a
    // previous session successfully reached the fallback during an outage.
    try {
      const fallbackRecord = await this.fallback.load(snapshot.slotId);
      if (fallbackRecord && isRecordNewer(fallbackRecord, snapshot)) return;
    } catch {
      // A working primary is still useful when localStorage is unavailable or
      // over quota. A primary failure below will surface the fallback error.
    }

    try {
      await this.primary.save(structuredClone(snapshot));
    } catch {
      this.primaryFailed = true;
      await this.fallback.save(structuredClone(snapshot));
    }
  }

  async remove(slotId: string): Promise<void> {
    if (this.primaryFailed) {
      await this.fallback.remove(slotId);
      return;
    }

    try {
      await this.primary.remove(slotId);
    } catch {
      this.primaryFailed = true;
      await this.fallback.remove(slotId);
      return;
    }

    // Remove any older emergency copy too, or a merged read could resurrect a
    // slot that the player deliberately deleted.
    try {
      await this.fallback.remove(slotId);
    } catch {
      // The authoritative IndexedDB deletion succeeded. If localStorage is
      // unavailable, there is no readable fallback to resurrect in this run.
    }
  }
}

export function createFailoverSaveRepository(
  primary: SaveRepository,
  fallback: SaveRepository,
): SaveRepository {
  return new FailoverSaveRepository(primary, fallback);
}

export function createSaveRepository(): SaveRepository {
  const fallback = availableLocalStorage();
  if (typeof indexedDB === "undefined") {
    if (fallback) return fallback;
    throw new Error("This browser does not provide persistent save storage.");
  }
  const primary = new IndexedDbSaveRepository();
  return fallback ? createFailoverSaveRepository(primary, fallback) : primary;
}

export function exportSave(record: SaveRecord): void {
  validateRecord(record);
  const blob = new Blob([JSON.stringify({ format: "tideweft-export", version: 1, record })], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.download = `tideweft-${record.slotId}.json`;
  link.href = URL.createObjectURL(blob);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

export async function importSave(file: File): Promise<SaveRecord> {
  if (file.size > 20_000_000) throw new Error("That save is larger than the 20 MB import limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("This save file does not contain valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("This is not a TIDEWEFT save export.");
  const envelope = parsed as { format?: unknown; version?: unknown; record?: unknown };
  if (envelope.format !== "tideweft-export" || envelope.version !== 1 || !isSaveRecord(envelope.record)) {
    throw new Error("This save export has an unknown or future format.");
  }
  validateRecord(envelope.record);
  return envelope.record;
}

function isSaveRecord(value: unknown): value is SaveRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SaveRecord>;
  return (
    typeof record.slotId === "string" &&
    typeof record.label === "string" &&
    typeof record.seed === "string" &&
    typeof record.updatedAt === "number" &&
    typeof record.playTicks === "number" &&
    typeof record.settlementCount === "number" &&
    typeof record.connectedCount === "number" &&
    typeof record.worldJson === "string" &&
    (record.screenshot === undefined || typeof record.screenshot === "string")
  );
}

function isValidSaveRecord(value: unknown): value is SaveRecord {
  if (!isSaveRecord(value)) return false;
  try {
    validateRecord(value);
    return true;
  } catch {
    return false;
  }
}

function availableLocalStorage(): SaveRepository | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    return new LocalStorageSaveRepository(localStorage);
  } catch {
    return undefined;
  }
}

function isRecordNewer(
  candidate: Pick<SaveRecord, "updatedAt" | "playTicks">,
  reference: Pick<SaveRecord, "updatedAt" | "playTicks">,
): boolean {
  return candidate.updatedAt > reference.updatedAt
    || (candidate.updatedAt === reference.updatedAt && candidate.playTicks > reference.playTicks);
}

function newestRecord(
  primary: SaveRecord | undefined,
  fallback: SaveRecord | undefined,
): SaveRecord | undefined {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return isRecordNewer(fallback, primary) ? fallback : primary;
}

function cloneRecord(record: SaveRecord | undefined): SaveRecord | undefined {
  return record ? structuredClone(record) : undefined;
}

function mergeNewest(primary: SaveSummary[], fallback: SaveSummary[]): SaveSummary[] {
  const merged = new Map<string, SaveSummary>();
  for (const summary of primary) merged.set(summary.slotId, summary);
  for (const summary of fallback) {
    const existing = merged.get(summary.slotId);
    if (!existing || isRecordNewer(summary, existing)) merged.set(summary.slotId, summary);
  }
  return [...merged.values()].map((summary) => structuredClone(summary))
    .sort((left, right) => right.updatedAt - left.updatedAt || left.slotId.localeCompare(right.slotId));
}

function validateRecord(record: SaveRecord): void {
  if (!isSaveRecord(record)) throw new Error("Save record is missing required fields.");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(record.slotId)) throw new Error("Invalid save slot identifier.");
  if (record.label.length > 80 || record.seed.length > 128) throw new Error("Save metadata is too long.");
  for (const value of [record.updatedAt, record.playTicks, record.settlementCount, record.connectedCount]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Save metadata contains an invalid number.");
  }
  if (record.worldJson.length > 20_000_000) throw new Error("Save data exceeds the 20 MB limit.");
}
