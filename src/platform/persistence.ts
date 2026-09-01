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
    transaction.objectStore(SAVE_STORE).put(structuredClone(record));
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
  private read(): SaveRecord[] {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    try {
      const records = JSON.parse(raw) as unknown;
      return Array.isArray(records) ? records.filter(isValidSaveRecord) : [];
    } catch {
      return [];
    }
  }

  private write(records: SaveRecord[]): void {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
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
    const records = this.read().filter((candidate) => candidate.slotId !== record.slotId);
    records.push(structuredClone(record));
    this.write(records);
  }

  async remove(slotId: string): Promise<void> {
    this.write(this.read().filter((record) => record.slotId !== slotId));
  }
}

export function createSaveRepository(): SaveRepository {
  return typeof indexedDB === "undefined"
    ? new LocalStorageSaveRepository()
    : new IndexedDbSaveRepository();
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

function validateRecord(record: SaveRecord): void {
  if (!isSaveRecord(record)) throw new Error("Save record is missing required fields.");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(record.slotId)) throw new Error("Invalid save slot identifier.");
  if (record.label.length > 80 || record.seed.length > 128) throw new Error("Save metadata is too long.");
  for (const value of [record.updatedAt, record.playTicks, record.settlementCount, record.connectedCount]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Save metadata contains an invalid number.");
  }
  if (record.worldJson.length > 20_000_000) throw new Error("Save data exceeds the 20 MB limit.");
}
