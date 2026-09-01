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
const DELETION_KEY = "tideweft.save-deletions.v1";

/**
 * A deletion is a version marker rather than a synthetic SaveRecord. Keeping
 * it under a separate key means older builds continue to understand their
 * existing save array and no tombstone can leak through SaveRepository.
 */
interface SaveDeletionTombstone {
  readonly slotId: string;
  readonly updatedAt: number;
  readonly playTicks: number;
}

interface SaveDeletionJournal {
  list(): Promise<SaveDeletionTombstone[]>;
  load(slotId: string): Promise<SaveDeletionTombstone | undefined>;
  save(tombstone: SaveDeletionTombstone): Promise<void>;
  remove(slotId: string): Promise<void>;
}

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

class MemoryDeletionJournal implements SaveDeletionJournal {
  private readonly tombstones = new Map<string, SaveDeletionTombstone>();

  async list(): Promise<SaveDeletionTombstone[]> {
    return [...this.tombstones.values()].map((tombstone) => ({ ...tombstone }));
  }

  async load(slotId: string): Promise<SaveDeletionTombstone | undefined> {
    const tombstone = this.tombstones.get(slotId);
    return tombstone ? { ...tombstone } : undefined;
  }

  async save(tombstone: SaveDeletionTombstone): Promise<void> {
    const existing = this.tombstones.get(tombstone.slotId);
    if (!existing || isRecordNewer(tombstone, existing)) {
      this.tombstones.set(tombstone.slotId, { ...tombstone });
    }
  }

  async remove(slotId: string): Promise<void> {
    this.tombstones.delete(slotId);
  }
}

class LocalStorageDeletionJournal implements SaveDeletionJournal {
  constructor(private readonly storage: Storage) {}

  private read(): SaveDeletionTombstone[] {
    const raw = this.storage.getItem(DELETION_KEY);
    if (!raw) return [];
    try {
      const decoded = JSON.parse(raw) as unknown;
      if (!Array.isArray(decoded)) return [];
      const newest = new Map<string, SaveDeletionTombstone>();
      for (const value of decoded) {
        if (!isValidDeletionTombstone(value)) continue;
        const existing = newest.get(value.slotId);
        if (!existing || isRecordNewer(value, existing)) newest.set(value.slotId, value);
      }
      return [...newest.values()];
    } catch {
      return [];
    }
  }

  private write(tombstones: readonly SaveDeletionTombstone[]): void {
    this.storage.setItem(DELETION_KEY, JSON.stringify(tombstones));
  }

  async list(): Promise<SaveDeletionTombstone[]> {
    return this.read().map((tombstone) => ({ ...tombstone }));
  }

  async load(slotId: string): Promise<SaveDeletionTombstone | undefined> {
    const tombstone = this.read().find((candidate) => candidate.slotId === slotId);
    return tombstone ? { ...tombstone } : undefined;
  }

  async save(tombstone: SaveDeletionTombstone): Promise<void> {
    const stored = this.read();
    const existing = stored.find((candidate) => candidate.slotId === tombstone.slotId);
    if (existing && !isRecordNewer(tombstone, existing)) return;
    this.write([
      ...stored.filter((candidate) => candidate.slotId !== tombstone.slotId),
      { ...tombstone },
    ]);
  }

  async remove(slotId: string): Promise<void> {
    this.write(this.read().filter((tombstone) => tombstone.slotId !== slotId));
  }
}

/** Applies the same durable deletion semantics when IndexedDB is unavailable. */
class JournaledSaveRepository implements SaveRepository {
  constructor(
    private readonly repository: SaveRepository,
    private readonly deletions: SaveDeletionJournal,
  ) {}

  async list(): Promise<SaveSummary[]> {
    return filterDeletedSummaries(await this.repository.list(), this.deletions);
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    return filterDeletedRecord(await this.repository.load(slotId), this.deletions);
  }

  async save(record: SaveRecord): Promise<void> {
    validateRecord(record);
    const tombstone = await this.deletions.load(record.slotId);
    if (tombstone && !isRecordNewer(record, tombstone)) return;
    await this.repository.save(record);
    if (tombstone) await clearDeletionBestEffort(this.deletions, record.slotId);
  }

  async remove(slotId: string): Promise<void> {
    const existing = await this.repository.load(slotId).catch(() => undefined);
    const tombstone = await deletionTombstone(slotId, this.deletions, [existing]);
    await this.deletions.save(tombstone);
    // The journal is now authoritative. Physical cleanup is best effort so a
    // backend outage cannot turn a completed delete into a later resurrection.
    await this.repository.remove(slotId).catch(() => undefined);
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
    private readonly deletions: SaveDeletionJournal,
  ) {}

  async list(): Promise<SaveSummary[]> {
    if (this.primaryFailed) {
      return filterDeletedSummaries(await this.fallback.list(), this.deletions);
    }

    let primary: SaveSummary[];
    try {
      primary = await this.primary.list();
    } catch {
      this.primaryFailed = true;
      return filterDeletedSummaries(await this.fallback.list(), this.deletions);
    }

    let fallback: SaveSummary[];
    try {
      fallback = await this.fallback.list();
    } catch {
      return filterDeletedSummaries(primary, this.deletions);
    }
    return filterDeletedSummaries(mergeNewest(primary, fallback), this.deletions);
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    if (this.primaryFailed) {
      return filterDeletedRecord(await this.fallback.load(slotId), this.deletions);
    }

    let primary: SaveRecord | undefined;
    try {
      primary = await this.primary.load(slotId);
    } catch {
      this.primaryFailed = true;
      return filterDeletedRecord(await this.fallback.load(slotId), this.deletions);
    }

    let fallback: SaveRecord | undefined;
    try {
      fallback = await this.fallback.load(slotId);
    } catch {
      return filterDeletedRecord(primary, this.deletions);
    }
    const newest = newestRecord(primary, fallback);
    return filterDeletedRecord(newest, this.deletions);
  }

  async save(record: SaveRecord): Promise<void> {
    validateRecord(record);
    const snapshot = structuredClone(record);
    const tombstone = await this.deletions.load(snapshot.slotId);
    if (tombstone && !isRecordNewer(snapshot, tombstone)) return;
    if (this.primaryFailed) {
      await this.fallback.save(snapshot);
      if (tombstone) await clearDeletionBestEffort(this.deletions, snapshot.slotId);
      return;
    }

    // Do not let a stale runtime snapshot overwrite either backend after a
    // previous session successfully reached the fallback during an outage.
    try {
      const fallbackRecord = await this.fallback.load(snapshot.slotId);
      if (fallbackRecord && isRecordNewer(fallbackRecord, snapshot)) {
        if (tombstone) await clearDeletionBestEffort(this.deletions, snapshot.slotId);
        return;
      }
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
    if (tombstone) await clearDeletionBestEffort(this.deletions, snapshot.slotId);
  }

  async remove(slotId: string): Promise<void> {
    let primaryRecord: SaveRecord | undefined;
    if (!this.primaryFailed) {
      try {
        primaryRecord = await this.primary.load(slotId);
      } catch {
        this.primaryFailed = true;
      }
    }
    const fallbackRecord = await this.fallback.load(slotId).catch(() => undefined);
    const tombstone = await deletionTombstone(
      slotId,
      this.deletions,
      [primaryRecord, fallbackRecord],
    );
    // Persist first. Even if the failed backend cannot physically delete its
    // stale copy, every later repository instance will suppress that copy.
    await this.deletions.save(tombstone);

    if (!this.primaryFailed) {
      try {
        await this.primary.remove(slotId);
      } catch {
        this.primaryFailed = true;
      }
    }
    try {
      await this.fallback.remove(slotId);
    } catch {
      // The tombstone is durable, so an undeleted physical fallback remains
      // invisible and can be cleaned by a future successful remove.
    }
  }
}

export function createFailoverSaveRepository(
  primary: SaveRepository,
  fallback: SaveRepository,
  deletionStorage?: Storage,
): SaveRepository {
  const deletions = deletionStorage
    ? new LocalStorageDeletionJournal(deletionStorage)
    : new MemoryDeletionJournal();
  return new FailoverSaveRepository(primary, fallback, deletions);
}

export function createSaveRepository(): SaveRepository {
  const fallbackStorage = availableLocalStorage();
  const fallback = fallbackStorage
    ? new LocalStorageSaveRepository(fallbackStorage)
    : undefined;
  if (typeof indexedDB === "undefined") {
    if (fallback && fallbackStorage) {
      return new JournaledSaveRepository(
        fallback,
        new LocalStorageDeletionJournal(fallbackStorage),
      );
    }
    throw new Error("This browser does not provide persistent save storage.");
  }
  const primary = new IndexedDbSaveRepository();
  return fallback && fallbackStorage
    ? createFailoverSaveRepository(primary, fallback, fallbackStorage)
    : primary;
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

function isValidSlotId(slotId: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slotId);
}

function isValidDeletionTombstone(value: unknown): value is SaveDeletionTombstone {
  if (!value || typeof value !== "object") return false;
  const tombstone = value as Partial<SaveDeletionTombstone>;
  return (
    typeof tombstone.slotId === "string" &&
    isValidSlotId(tombstone.slotId) &&
    Number.isSafeInteger(tombstone.updatedAt) &&
    (tombstone.updatedAt ?? -1) >= 0 &&
    Number.isSafeInteger(tombstone.playTicks) &&
    (tombstone.playTicks ?? -1) >= 0
  );
}

async function deletionTombstone(
  slotId: string,
  deletions: SaveDeletionJournal,
  records: readonly (Pick<SaveRecord, "updatedAt" | "playTicks"> | undefined)[],
): Promise<SaveDeletionTombstone> {
  if (!isValidSlotId(slotId)) throw new Error("Invalid save slot identifier.");
  const now = Date.now();
  let newest: SaveDeletionTombstone = {
    slotId,
    updatedAt: Number.isSafeInteger(now) && now >= 0 ? now : 0,
    playTicks: 0,
  };
  const existing = await deletions.load(slotId);
  for (const version of [existing, ...records]) {
    if (version && isRecordNewer(version, newest)) {
      newest = { slotId, updatedAt: version.updatedAt, playTicks: version.playTicks };
    }
  }
  return newest;
}

async function clearDeletionBestEffort(
  deletions: SaveDeletionJournal,
  slotId: string,
): Promise<void> {
  try {
    await deletions.remove(slotId);
  } catch {
    // A newer record remains visible by version even if journal cleanup fails.
  }
}

async function filterDeletedRecord(
  record: SaveRecord | undefined,
  deletions: SaveDeletionJournal,
): Promise<SaveRecord | undefined> {
  if (!record) return undefined;
  const tombstone = await deletions.load(record.slotId);
  if (!tombstone) return cloneRecord(record);
  if (!isRecordNewer(record, tombstone)) return undefined;
  await clearDeletionBestEffort(deletions, record.slotId);
  return cloneRecord(record);
}

async function filterDeletedSummaries(
  summaries: readonly SaveSummary[],
  deletions: SaveDeletionJournal,
): Promise<SaveSummary[]> {
  const tombstones = new Map(
    (await deletions.list()).map((tombstone) => [tombstone.slotId, tombstone] as const),
  );
  const visible: SaveSummary[] = [];
  for (const summary of summaries) {
    const tombstone = tombstones.get(summary.slotId);
    if (tombstone && !isRecordNewer(summary, tombstone)) continue;
    if (tombstone) await clearDeletionBestEffort(deletions, summary.slotId);
    visible.push(structuredClone(summary));
  }
  return visible;
}

function availableLocalStorage(): Storage | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    return localStorage;
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
  if (!isValidSlotId(record.slotId)) throw new Error("Invalid save slot identifier.");
  if (record.label.length > 80 || record.seed.length > 128) throw new Error("Save metadata is too long.");
  for (const value of [record.updatedAt, record.playTicks, record.settlementCount, record.connectedCount]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Save metadata contains an invalid number.");
  }
  if (record.worldJson.length > 20_000_000) throw new Error("Save data exceeds the 20 MB limit.");
}
