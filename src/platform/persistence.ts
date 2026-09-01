export interface SaveRecord {
  slotId: string;
  label: string;
  seed: string;
  /**
   * Major component of the slot's monotonic replacement version. Legacy saves
   * omit it and are era zero. It advances only when saveGeneration reaches the
   * largest safe integer, allowing a corrupt saturated record to be replaced
   * without wrapping or letting an old tab become newest again.
   */
  saveGenerationEra?: number;
  /**
   * Minor component of the slot's monotonic replacement version. Saves
   * written before generations existed omit it and are treated as zero.
   */
  saveGeneration?: number;
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

/** A write that cannot become authoritative must never masquerade as saved. */
export class StaleSaveWriteError extends Error {
  constructor(slotId: string) {
    super(`Save slot ${slotId} already contains a different or newer durable version.`);
    this.name = "StaleSaveWriteError";
  }
}

export interface SaveVersionMetadata {
  readonly slotId: string;
  readonly saveGenerationEra?: number;
  readonly saveGeneration?: number;
  readonly updatedAt: number;
  readonly playTicks: number;
  /** Compact deterministic identity for an exact record at this version. */
  readonly recordFingerprint?: string;
}

/** A known-newer save exists, but no currently readable backend can supply it. */
export class NewerSaveUnavailableError extends Error {
  readonly latestVersion: SaveVersionMetadata;

  constructor(version: SaveVersionMetadata) {
    super(`A newer durable version of save slot ${version.slotId} is temporarily unavailable.`);
    this.name = "NewerSaveUnavailableError";
    this.latestVersion = { ...version };
  }
}

/** Two backends claim the same version tuple for different save payloads. */
export class ConflictingSaveCopiesError extends Error {
  readonly latestVersion: SaveVersionMetadata;

  constructor(version: SaveVersionMetadata) {
    super(`Save slot ${version.slotId} has conflicting durable copies at one version.`);
    this.name = "ConflictingSaveCopiesError";
    this.latestVersion = { ...version };
  }
}

const DATABASE_NAME = "tideweft";
const DATABASE_VERSION = 1;
const SAVE_STORE = "saves";
const FALLBACK_KEY = "tideweft.saves.v1";
const DELETION_KEY = "tideweft.save-deletions.v1";
const VERSION_FENCE_KEY = "tideweft.save-version-fences.v1";

/**
 * A deletion is a version marker rather than a synthetic SaveRecord. Keeping
 * it under a separate key means older builds continue to understand their
 * existing save array and no tombstone can leak through SaveRepository.
 */
interface SaveDeletionTombstone {
  readonly slotId: string;
  /** Missing on legacy journals and therefore interpreted as era 0. */
  readonly saveGenerationEra?: number;
  /** Missing on legacy journals and therefore interpreted as generation 0. */
  readonly saveGeneration?: number;
  readonly updatedAt: number;
  readonly playTicks: number;
}

type SaveVersion = Pick<
  SaveRecord,
  "saveGenerationEra" | "saveGeneration" | "updatedAt" | "playTicks"
>;

type SaveVersionFence = SaveVersionMetadata;

interface SaveDeletionJournal {
  list(): Promise<SaveDeletionTombstone[]>;
  load(slotId: string): Promise<SaveDeletionTombstone | undefined>;
  save(tombstone: SaveDeletionTombstone): Promise<void>;
  remove(slotId: string): Promise<void>;
}

interface SaveVersionFenceJournal {
  list(): Promise<SaveVersionFence[]>;
  load(slotId: string): Promise<SaveVersionFence | undefined>;
  save(fence: SaveVersionFence): Promise<void>;
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
    ...(record.saveGenerationEra === undefined ? {} : { saveGenerationEra: record.saveGenerationEra }),
    ...(record.saveGeneration === undefined ? {} : { saveGeneration: record.saveGeneration }),
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
      .filter(isValidSaveRecord)
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
    return record && isValidSaveRecord(record) ? structuredClone(record) : undefined;
  }

  async save(record: SaveRecord): Promise<void> {
    validateRecord(record);
    const database = await this.database();
    const transaction = database.transaction(SAVE_STORE, "readwrite", { durability: "strict" });
    const store = transaction.objectStore(SAVE_STORE);
    const existing = await requestResult(
      store.get(record.slotId) as IDBRequest<SaveRecord | undefined>,
    );
    const superseded = Boolean(
      existing
      && isValidSaveRecord(existing)
      && saveWriteConflicts(existing, record),
    );
    if (!superseded) {
      store.put(structuredClone(record));
    }
    await transactionComplete(transaction);
    if (superseded) throw new StaleSaveWriteError(record.slotId);
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
    if (existing && saveWriteConflicts(existing, record)) {
      throw new StaleSaveWriteError(record.slotId);
    }
    if (existing && sameSaveRecord(existing, record)) return;
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

class MemoryVersionFenceJournal implements SaveVersionFenceJournal {
  private readonly fences = new Map<string, SaveVersionFence>();

  async list(): Promise<SaveVersionFence[]> {
    return [...this.fences.values()].map((fence) => ({ ...fence }));
  }

  async load(slotId: string): Promise<SaveVersionFence | undefined> {
    const fence = this.fences.get(slotId);
    return fence ? { ...fence } : undefined;
  }

  async save(fence: SaveVersionFence): Promise<void> {
    if (!isValidSaveVersionMetadata(fence)) throw new Error("Invalid save version fence.");
    const existing = this.fences.get(fence.slotId);
    if (!existing || isRecordNewer(fence, existing) || shouldEnrichFence(existing, fence)) {
      this.fences.set(fence.slotId, { ...fence });
      return;
    }
    assertFenceCompatible(existing, fence);
  }
}

class LocalStorageVersionFenceJournal implements SaveVersionFenceJournal {
  constructor(private readonly storage: Storage) {}

  private read(): SaveVersionFence[] {
    const raw = this.storage.getItem(VERSION_FENCE_KEY);
    if (!raw) return [];
    try {
      const decoded = JSON.parse(raw) as unknown;
      if (!Array.isArray(decoded)) return [];
      const newest = new Map<string, SaveVersionFence>();
      for (const value of decoded) {
        if (!isValidSaveVersionMetadata(value)) continue;
        const existing = newest.get(value.slotId);
        if (!existing || isRecordNewer(value, existing)) newest.set(value.slotId, value);
      }
      return [...newest.values()];
    } catch {
      return [];
    }
  }

  private write(fences: readonly SaveVersionFence[]): void {
    this.storage.setItem(VERSION_FENCE_KEY, JSON.stringify(fences));
  }

  async list(): Promise<SaveVersionFence[]> {
    return this.read().map((fence) => ({ ...fence }));
  }

  async load(slotId: string): Promise<SaveVersionFence | undefined> {
    const fence = this.read().find((candidate) => candidate.slotId === slotId);
    return fence ? { ...fence } : undefined;
  }

  async save(fence: SaveVersionFence): Promise<void> {
    if (!isValidSaveVersionMetadata(fence)) throw new Error("Invalid save version fence.");
    const stored = this.read();
    const existing = stored.find((candidate) => candidate.slotId === fence.slotId);
    if (existing && !isRecordNewer(fence, existing) && !shouldEnrichFence(existing, fence)) {
      assertFenceCompatible(existing, fence);
      return;
    }
    this.write([
      ...stored.filter((candidate) => candidate.slotId !== fence.slotId),
      { ...fence },
    ]);
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
    if (tombstone && !isRecordNewer(record, tombstone)) {
      throw new StaleSaveWriteError(record.slotId);
    }
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
 * fails during a write, this repository stays on the fallback for later
 * writes; alternating between a flaky primary and fallback could otherwise
 * resurrect stale state. Reads fail closed whenever either backend cannot be
 * compared because neither a fence nor a surviving copy can prove that an
 * unavailable peer lacks a newer, partially committed record.
 */
class FailoverSaveRepository implements SaveRepository {
  private primaryFailed = false;

  constructor(
    private readonly primary: SaveRepository,
    private readonly fallback: SaveRepository,
    private readonly deletions: SaveDeletionJournal,
    private readonly fences: SaveVersionFenceJournal,
  ) {}

  async list(): Promise<SaveSummary[]> {
    if (this.primaryFailed) {
      throw new Error("Primary local save storage is unavailable; the complete save list cannot be verified.");
    }

    let primary: SaveSummary[];
    try {
      primary = await this.primary.list();
    } catch (error) {
      this.primaryFailed = true;
      throw error;
    }

    let fallback: SaveSummary[];
    try {
      fallback = await this.fallback.list();
    } catch (error) {
      throw error;
    }
    await this.assertNoCrossStoreConflicts(primary, fallback);
    const summaries = await this.enforceVersionFences(
      await filterDeletedSummaries(mergeNewest(primary, fallback), this.deletions),
    );
    const records = await Promise.all(summaries.map((summary) => this.load(summary.slotId)));
    return records
      .filter((record): record is SaveRecord => record !== undefined)
      .map(summarize)
      .sort((left, right) => right.updatedAt - left.updatedAt || left.slotId.localeCompare(right.slotId));
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    if (this.primaryFailed) {
      throw new Error(`Primary local save storage is unavailable for slot ${slotId}.`);
    }

    let primary: SaveRecord | undefined;
    try {
      primary = await this.primary.load(slotId);
    } catch (error) {
      this.primaryFailed = true;
      throw error;
    }

    let fallback: SaveRecord | undefined;
    try {
      fallback = await this.fallback.load(slotId);
    } catch (error) {
      throw error;
    }
    const newest = newestRecord(primary, fallback);
    const record = await this.enforceVersionFence(
      slotId,
      await filterDeletedRecord(newest, this.deletions),
    );
    if (record) await this.persistFenceBestEffort(record);
    return record;
  }

  async save(record: SaveRecord): Promise<void> {
    validateRecord(record);
    const snapshot = structuredClone(record);
    const tombstone = await this.deletions.load(snapshot.slotId);
    if (tombstone && !isRecordNewer(snapshot, tombstone)) {
      throw new StaleSaveWriteError(snapshot.slotId);
    }
    const fence = await this.fences.load(snapshot.slotId).catch(() => undefined);
    if (fence && isRecordNewer(fence, snapshot)) {
      throw new StaleSaveWriteError(snapshot.slotId);
    }
    if (this.primaryFailed) {
      await this.fallback.save(snapshot);
      await this.persistFenceBestEffort(snapshot);
      if (tombstone) await clearDeletionBestEffort(this.deletions, snapshot.slotId);
      return;
    }

    // Do not let a stale runtime snapshot overwrite either backend after a
    // previous session successfully reached the fallback during an outage.
    let fallbackRecord: SaveRecord | undefined;
    try {
      fallbackRecord = await this.fallback.load(snapshot.slotId);
    } catch {
      // A working primary is still useful when localStorage is unavailable or
      // over quota. A primary failure below will surface the fallback error.
    }
    if (fallbackRecord && saveWriteConflicts(fallbackRecord, snapshot)) {
      throw new StaleSaveWriteError(snapshot.slotId);
    }

    try {
      await this.primary.save(structuredClone(snapshot));
    } catch (error) {
      if (error instanceof StaleSaveWriteError) throw error;
      this.primaryFailed = true;
      await this.fallback.save(structuredClone(snapshot));
      await this.persistFenceBestEffort(snapshot);
      if (tombstone) await clearDeletionBestEffort(this.deletions, snapshot.slotId);
      return;
    }

    // Keep the compact fallback current after every healthy IndexedDB write.
    // If quota prevents mirroring, the small fence (or removal of an older
    // fallback) still prevents a later primary outage from rolling backward.
    const fencePersisted = await this.persistFenceBestEffort(snapshot);
    try {
      await this.fallback.save(structuredClone(snapshot));
    } catch (error) {
      if (error instanceof StaleSaveWriteError) throw error;
      const currentFallback = await this.fallback.load(snapshot.slotId).catch(() => undefined);
      if (currentFallback && saveWriteConflicts(currentFallback, snapshot)) {
        throw new StaleSaveWriteError(snapshot.slotId);
      }
      if (!currentFallback || !sameSaveRecord(currentFallback, snapshot)) {
        let removed = false;
        try {
          await this.fallback.remove(snapshot.slotId);
          removed = true;
        } catch {
          // The durable fingerprint fence still suppresses a retained older copy.
        }
        if (!fencePersisted) await this.persistFenceBestEffort(snapshot);
        if (removed) {
          try {
            // Removing an older payload often frees enough quota for one exact
            // latest lifeboat copy. Failure remains safe behind the fence.
            await this.fallback.save(structuredClone(snapshot));
          } catch (retryError) {
            if (retryError instanceof StaleSaveWriteError) throw retryError;
          }
        }
      }
    }
    if (tombstone) await clearDeletionBestEffort(this.deletions, snapshot.slotId);
  }

  private async persistFenceBestEffort(record: SaveRecord): Promise<boolean> {
    try {
      await this.fences.save(saveVersionMetadata(record));
      return true;
    } catch {
      return false;
    }
  }

  private async enforceVersionFence(
    slotId: string,
    record: SaveRecord | undefined,
  ): Promise<SaveRecord | undefined> {
    const fence = await this.fences.load(slotId).catch(() => undefined);
    if (!fence) return cloneRecord(record);
    if (!record) {
      const tombstone = await this.deletions.load(slotId).catch(() => undefined);
      if (tombstone && !isRecordNewer(fence, tombstone)) return undefined;
      throw new NewerSaveUnavailableError(fence);
    }
    if (isRecordNewer(fence, record)) throw new NewerSaveUnavailableError(fence);
    if (
      sameSaveVersion(fence, record)
      && fence.recordFingerprint !== undefined
      && fence.recordFingerprint !== saveRecordFingerprint(record)
    ) {
      throw new ConflictingSaveCopiesError(fence);
    }
    if (isRecordNewer(record, fence)) await this.persistFenceBestEffort(record);
    return cloneRecord(record);
  }

  private async enforceVersionFences(summaries: SaveSummary[]): Promise<SaveSummary[]> {
    const fences = await this.fences.list().catch(() => []);
    for (const fence of fences) {
      const summary = summaries.find((candidate) => candidate.slotId === fence.slotId);
      if (summary && !isRecordNewer(fence, summary)) {
        if (sameSaveVersion(fence, summary) && fence.recordFingerprint !== undefined) {
          // A summary cannot prove payload identity. Reuse the full load path
          // so list() cannot bless an equal-version fork that load() rejects.
          await this.load(fence.slotId);
        }
        continue;
      }
      const tombstone = await this.deletions.load(fence.slotId).catch(() => undefined);
      if (!summary && tombstone && !isRecordNewer(fence, tombstone)) continue;
      throw new NewerSaveUnavailableError(fence);
    }
    return summaries.map((summary) => structuredClone(summary));
  }

  private async assertNoCrossStoreConflicts(
    primary: readonly SaveSummary[],
    fallback: readonly SaveSummary[],
  ): Promise<void> {
    const fallbackBySlot = new Map(fallback.map((summary) => [summary.slotId, summary] as const));
    for (const primarySummary of primary) {
      const fallbackSummary = fallbackBySlot.get(primarySummary.slotId);
      if (!fallbackSummary || !sameSaveVersion(primarySummary, fallbackSummary)) continue;
      if (!sameSaveSummary(primarySummary, fallbackSummary)) {
        throw new ConflictingSaveCopiesError(saveVersionMetadata(primarySummary));
      }
      const [primaryRecord, fallbackRecord] = await Promise.all([
        this.primary.load(primarySummary.slotId),
        this.fallback.load(primarySummary.slotId),
      ]);
      if (
        primaryRecord
        && fallbackRecord
        && sameSaveVersion(primaryRecord, fallbackRecord)
        && !sameSaveRecord(primaryRecord, fallbackRecord)
      ) {
        throw new ConflictingSaveCopiesError(saveVersionMetadata(primaryRecord));
      }
    }
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
  const fences = deletionStorage
    ? new LocalStorageVersionFenceJournal(deletionStorage)
    : new MemoryVersionFenceJournal();
  return new FailoverSaveRepository(primary, fallback, deletions, fences);
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
    (record.saveGenerationEra === undefined || typeof record.saveGenerationEra === "number") &&
    (record.saveGeneration === undefined || typeof record.saveGeneration === "number") &&
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
    (tombstone.saveGenerationEra === undefined || (
      Number.isSafeInteger(tombstone.saveGenerationEra) &&
      (tombstone.saveGenerationEra ?? -1) >= 0
    )) &&
    (tombstone.saveGeneration === undefined || (
      Number.isSafeInteger(tombstone.saveGeneration) &&
      (tombstone.saveGeneration ?? -1) >= 0
    )) &&
    Number.isSafeInteger(tombstone.updatedAt) &&
    (tombstone.updatedAt ?? -1) >= 0 &&
    Number.isSafeInteger(tombstone.playTicks) &&
    (tombstone.playTicks ?? -1) >= 0
  );
}

function isValidSaveVersionMetadata(value: unknown): value is SaveVersionMetadata {
  if (!value || typeof value !== "object") return false;
  const version = value as Partial<SaveVersionMetadata>;
  return (
    typeof version.slotId === "string"
    && isValidSlotId(version.slotId)
    && (version.saveGenerationEra === undefined || (
      Number.isSafeInteger(version.saveGenerationEra)
      && (version.saveGenerationEra ?? -1) >= 0
    ))
    && (version.saveGeneration === undefined || (
      Number.isSafeInteger(version.saveGeneration)
      && (version.saveGeneration ?? -1) >= 0
    ))
    && Number.isSafeInteger(version.updatedAt)
    && (version.updatedAt ?? -1) >= 0
    && Number.isSafeInteger(version.playTicks)
    && (version.playTicks ?? -1) >= 0
    && (version.recordFingerprint === undefined || (
      typeof version.recordFingerprint === "string"
      && /^[a-z0-9-]{8,80}$/u.test(version.recordFingerprint)
    ))
  );
}

function saveVersionMetadata(record: SaveVersion & { readonly slotId: string }): SaveVersionMetadata {
  const fullRecord = "worldJson" in record && typeof record.worldJson === "string"
    ? record as SaveRecord
    : undefined;
  return {
    slotId: record.slotId,
    ...(record.saveGenerationEra === undefined
      ? {}
      : { saveGenerationEra: record.saveGenerationEra }),
    ...(record.saveGeneration === undefined
      ? {}
      : { saveGeneration: record.saveGeneration }),
    updatedAt: record.updatedAt,
    playTicks: record.playTicks,
    ...(fullRecord ? { recordFingerprint: saveRecordFingerprint(fullRecord) } : {}),
  };
}

function shouldEnrichFence(existing: SaveVersionFence, candidate: SaveVersionFence): boolean {
  return sameSaveVersion(existing, candidate)
    && existing.recordFingerprint === undefined
    && candidate.recordFingerprint !== undefined;
}

function assertFenceCompatible(existing: SaveVersionFence, candidate: SaveVersionFence): void {
  if (
    sameSaveVersion(existing, candidate)
    && existing.recordFingerprint !== undefined
    && candidate.recordFingerprint !== undefined
    && existing.recordFingerprint !== candidate.recordFingerprint
  ) {
    throw new ConflictingSaveCopiesError(existing);
  }
}

async function deletionTombstone(
  slotId: string,
  deletions: SaveDeletionJournal,
  records: readonly (SaveVersion | undefined)[],
): Promise<SaveDeletionTombstone> {
  if (!isValidSlotId(slotId)) throw new Error("Invalid save slot identifier.");
  const now = Date.now();
  let newest: SaveDeletionTombstone = {
    slotId,
    saveGeneration: 0,
    updatedAt: Number.isSafeInteger(now) && now >= 0 ? now : 0,
    playTicks: 0,
  };
  const existing = await deletions.load(slotId);
  for (const version of [existing, ...records]) {
    if (version && isRecordNewer(version, newest)) {
      newest = {
        slotId,
        ...(saveGenerationEraOf(version) === 0
          ? {}
          : { saveGenerationEra: saveGenerationEraOf(version) }),
        saveGeneration: saveGenerationOf(version),
        updatedAt: version.updatedAt,
        playTicks: version.playTicks,
      };
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

function saveGenerationOf(version: SaveVersion): number {
  return version.saveGeneration ?? 0;
}

function saveGenerationEraOf(version: SaveVersion): number {
  return version.saveGenerationEra ?? 0;
}

function isRecordNewer(candidate: SaveVersion, reference: SaveVersion): boolean {
  const candidateEra = saveGenerationEraOf(candidate);
  const referenceEra = saveGenerationEraOf(reference);
  if (candidateEra !== referenceEra) {
    return candidateEra > referenceEra;
  }
  const candidateGeneration = saveGenerationOf(candidate);
  const referenceGeneration = saveGenerationOf(reference);
  if (candidateGeneration !== referenceGeneration) {
    return candidateGeneration > referenceGeneration;
  }
  return candidate.updatedAt > reference.updatedAt
    || (candidate.updatedAt === reference.updatedAt && candidate.playTicks > reference.playTicks);
}

function sameSaveVersion(left: SaveVersion, right: SaveVersion): boolean {
  return (
    saveGenerationEraOf(left) === saveGenerationEraOf(right)
    && saveGenerationOf(left) === saveGenerationOf(right)
    && left.updatedAt === right.updatedAt
    && left.playTicks === right.playTicks
  );
}

function saveWriteConflicts(existing: SaveRecord, candidate: SaveRecord): boolean {
  if (isRecordNewer(existing, candidate)) return true;
  if (isRecordNewer(candidate, existing)) return false;
  return !sameSaveRecord(existing, candidate);
}

function sameSaveRecord(left: SaveRecord, right: SaveRecord): boolean {
  return (
    left.slotId === right.slotId
    && left.label === right.label
    && left.seed === right.seed
    && saveGenerationEraOf(left) === saveGenerationEraOf(right)
    && saveGenerationOf(left) === saveGenerationOf(right)
    && left.updatedAt === right.updatedAt
    && left.playTicks === right.playTicks
    && left.settlementCount === right.settlementCount
    && left.connectedCount === right.connectedCount
    && left.worldJson === right.worldJson
    && left.screenshot === right.screenshot
  );
}

/**
 * Two independent 32-bit streams plus length make accidental equal-version
 * payload collisions vanishingly unlikely without copying multi-megabyte save
 * JSON into localStorage a second time. This is an integrity fence, not a
 * cryptographic authenticity claim.
 */
function saveRecordFingerprint(record: SaveRecord): string {
  const parts = [
    record.slotId,
    record.label,
    record.seed,
    String(saveGenerationEraOf(record)),
    String(saveGenerationOf(record)),
    String(record.updatedAt),
    String(record.playTicks),
    String(record.settlementCount),
    String(record.connectedCount),
    record.worldJson,
    record.screenshot ?? "",
  ] as const;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  let length = 0;
  let ordinal = 0;
  for (const part of parts) {
    // Length-prefix every field so adjacent values cannot produce the same
    // stream through a different split. Hash directly to avoid duplicating a
    // potentially multi-megabyte worldJson string in memory on mobile.
    for (const segment of [`${part.length}:`, part]) {
      length += segment.length;
      for (let index = 0; index < segment.length; index += 1) {
        const code = segment.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193) >>> 0;
        second = Math.imul(second ^ (code + ordinal), 0x85ebca6b) >>> 0;
        ordinal += 1;
      }
    }
  }
  return `${length.toString(36)}-${first.toString(36).padStart(7, "0")}-${second.toString(36).padStart(7, "0")}`;
}

function sameSaveSummary(left: SaveSummary, right: SaveSummary): boolean {
  return (
    left.slotId === right.slotId
    && left.label === right.label
    && left.seed === right.seed
    && sameSaveVersion(left, right)
    && left.settlementCount === right.settlementCount
    && left.connectedCount === right.connectedCount
    && left.hasScreenshot === right.hasScreenshot
  );
}

function newestRecord(
  primary: SaveRecord | undefined,
  fallback: SaveRecord | undefined,
): SaveRecord | undefined {
  if (!primary) return fallback;
  if (!fallback) return primary;
  if (isRecordNewer(fallback, primary)) return fallback;
  if (isRecordNewer(primary, fallback)) return primary;
  if (!sameSaveRecord(primary, fallback)) {
    throw new ConflictingSaveCopiesError(saveVersionMetadata(primary));
  }
  return primary;
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
  for (const value of [
    record.saveGenerationEra ?? 0,
    record.saveGeneration ?? 0,
    record.updatedAt,
    record.playTicks,
    record.settlementCount,
    record.connectedCount,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Save metadata contains an invalid number.");
  }
  if (record.worldJson.length > 20_000_000) throw new Error("Save data exceeds the 20 MB limit.");
}
