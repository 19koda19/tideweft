import type { RootSeed } from "../sim/rng";
import {
  createRegionTerrainBundleSource,
  type GeneratedRegionTerrain,
  type RegionTerrainBundleSource,
} from "../sim/regionTerrain";
import {
  REGION_COORD_LIMIT,
  isRegionCoord,
  regionKey,
  stableRegionId,
  type RegionCoord,
} from "../sim/regions";
import type { TerrainState } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  adoptRegionManifest,
  collectGeneratedRegionIdentity,
  commitGeneratedRegionModification,
  getDurableRegionRecord,
  serializeRegionManifest,
  validateRegionManifest,
  visitRegionManifest,
  type DurableRegionRecord,
  type RegionManifest,
  type RegionManifestCollectionInput,
  type RegionManifestCommit,
  type RegionManifestMutationInput,
} from "./regionManifest";

export const REGION_STREAMING_VERSION = 1 as const;
export const REGION_STREAMING_MAX_LOADED = 81;
export const REGION_STREAMING_MAX_RADIUS = 4;
export const REGION_STREAMING_MAX_SAVE_BYTES = 34 * 1_024 * 1_024;

export const DESKTOP_REGION_STREAMING_CONFIG: RegionStreamingConfig = Object.freeze({
  radius: 1,
  maxLoadedRegions: 9,
});

export const MOBILE_REGION_STREAMING_CONFIG: RegionStreamingConfig = Object.freeze({
  radius: 1,
  maxLoadedRegions: 5,
});

const UINT32_MAX = 0xffff_ffff;
const INTEGRITY_HASH_PATTERN = /^[0-9a-f]{16}$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{32}$/;
const REGION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,191}$/;
const TRUSTED_STREAMS = new WeakSet<object>();
const TRUSTED_GENERATED_REGIONS = new WeakSet<object>();
const UTF8_ENCODER = new TextEncoder();
const TERRAIN_GENERATOR_SEED_CACHE_LIMIT = 2;
const TERRAIN_GENERATOR_REGION_CACHE_LIMIT = 12;
const TERRAIN_GENERATORS = new Map<string, TerrainGeneratorCacheEntry>();

export interface RegionStreamingConfig {
  readonly radius: number;
  readonly maxLoadedRegions: number;
}

/** Narrow generation interface used by production terrain and fast stress fixtures. */
export interface GeneratedStreamRegion<T> {
  readonly coord: RegionCoord;
  readonly key: string;
  readonly regionId: string;
  readonly contentHash: string;
  readonly value: T;
}

export type RegionStreamGenerator<T> = (coord: RegionCoord) => GeneratedStreamRegion<T>;

/** Ephemeral bounded work; no cursor or partial job enters authoritative saves. */
export interface TerrainRegionPrefetchJob {
  readonly coord: RegionCoord;
  readonly key: string;
  readonly totalTiles: number;
  readonly completedTiles: number;
  readonly complete: boolean;
  readonly cancelled: boolean;
  /** Returns true once the exact immutable region is in the shared cache. */
  readonly step: (tileBudget: number) => boolean;
  /** Drops only ephemeral work. A later request deterministically starts again. */
  readonly cancel: () => void;
}

interface TerrainGeneratorCacheEntry {
  readonly seed: RootSeed;
  readonly source: RegionTerrainBundleSource;
  readonly regionCache: Map<string, GeneratedStreamRegion<TerrainState>>;
  readonly pending: Map<string, TerrainRegionPrefetchJob>;
  readonly generator: RegionStreamGenerator<TerrainState>;
}

export interface LoadedRegion<T> {
  readonly coord: RegionCoord;
  readonly key: string;
  readonly regionId: string;
  readonly contentHash: string;
  readonly value: T;
  readonly lastTouchedOrdinal: number;
  /** Durable overlay, or an ephemeral revision-zero view while still pristine. */
  readonly durable: LoadedRegionDurability;
}

export type PristineLoadedRegionRecord = Omit<
  DurableRegionRecord,
  "lastEventOrdinal" | "revision" | "visitedEventOrdinal"
> & {
  readonly visitedEventOrdinal: 0;
  readonly revision: 0;
  readonly lastEventOrdinal: 0;
};

export type LoadedRegionDurability = DurableRegionRecord | PristineLoadedRegionRecord;

export interface RegionStreamingState<T> {
  readonly version: typeof REGION_STREAMING_VERSION;
  readonly rootSeedHash: string;
  readonly config: RegionStreamingConfig;
  readonly center: RegionCoord;
  readonly transitionOrdinal: number;
  readonly loaded: readonly LoadedRegion<T>[];
  readonly manifest: RegionManifest;
}

export interface RegionStreamingTransition<T> {
  readonly state: RegionStreamingState<T>;
  readonly generatedKeys: readonly string[];
  readonly evictedKeys: readonly string[];
  readonly retainedKeys: readonly string[];
}

interface RegionStreamingSavePayload {
  readonly version: typeof REGION_STREAMING_VERSION;
  readonly rootSeedHash: string;
  readonly config: RegionStreamingConfig;
  readonly center: RegionCoord;
  readonly transitionOrdinal: number;
  readonly manifest: RegionManifest;
}

interface RegionStreamingSaveEnvelope extends RegionStreamingSavePayload {
  readonly integrity: string;
}

export interface CreateRegionStreamingOptions<T> {
  readonly rootSeed: RootSeed;
  readonly generator: RegionStreamGenerator<T>;
  readonly center?: RegionCoord;
  readonly config?: RegionStreamingConfig;
  /** Undefined/null/exact v0 safely migrates compatibility region 0,0. */
  readonly manifest?: unknown;
}

/**
 * Domain-separated 128-bit identity for non-terrain stream generators.
 * Production terrain uses its manifest's equally strict 128-bit terrainHash.
 */
export function regionStreamContentHash(value: unknown): string {
  const canonical = stableStringify(value);
  return hashCanonical(["tideweft-region-stream-content/1", 0, canonical])
    + hashCanonical(["tideweft-region-stream-content/1", 1, canonical]);
}

export function createTerrainRegionGenerator(rootSeed: RootSeed): RegionStreamGenerator<TerrainState> {
  return terrainGeneratorEntry(rootSeed).generator;
}

/**
 * Prepare an immutable region in deterministic tile slices before physics can
 * reach it. Re-requesting the same coordinate shares work and completed data.
 */
export function createTerrainRegionPrefetchJob(
  rootSeed: RootSeed,
  coord: RegionCoord,
): TerrainRegionPrefetchJob {
  const entry = terrainGeneratorEntry(rootSeed);
  const canonical = canonicalCoord(coord);
  const key = regionKey(canonical);
  const existing = entry.pending.get(key);
  if (existing) return existing;
  const cached = entry.regionCache.get(key);
  if (cached) {
    touchTerrainRegionCache(entry, key, cached);
    return completedTerrainPrefetchJob(canonical, key, cached.value.tiles.length);
  }

  const sourceJob = entry.source.createJob(canonical);
  let finished = false;
  let cancelled = false;
  let job: TerrainRegionPrefetchJob;
  job = Object.freeze({
    coord: canonical,
    key,
    totalTiles: sourceJob.totalTiles,
    get completedTiles(): number {
      return sourceJob.completedTiles;
    },
    get complete(): boolean {
      return finished;
    },
    get cancelled(): boolean {
      return cancelled;
    },
    step: (tileBudget: number): boolean => {
      if (!Number.isSafeInteger(tileBudget) || tileBudget <= 0) {
        throw new RangeError("Region terrain job tile budget must be a positive safe integer");
      }
      if (cancelled) throw new RangeError("Cancelled terrain prefetch work cannot be resumed");
      if (finished) return true;
      const alreadyCached = entry.regionCache.get(key);
      if (alreadyCached) {
        touchTerrainRegionCache(entry, key, alreadyCached);
        entry.pending.delete(key);
        finished = true;
        return true;
      }
      const bundle = sourceJob.step(tileBudget);
      if (!bundle) return false;
      cacheTerrainBundle(entry, canonical, bundle);
      entry.pending.delete(key);
      finished = true;
      return true;
    },
    cancel: (): void => {
      if (finished || cancelled) return;
      if (entry.pending.get(key) === job) entry.pending.delete(key);
      cancelled = true;
    },
  });
  entry.pending.set(key, job);
  return job;
}

function terrainGeneratorEntry(rootSeed: RootSeed): TerrainGeneratorCacheEntry {
  const seed = canonicalRootSeed(rootSeed);
  const seedKey = seed.map((word) => word.toString(16).padStart(8, "0")).join("");
  const cachedGenerator = TERRAIN_GENERATORS.get(seedKey);
  if (cachedGenerator) {
    TERRAIN_GENERATORS.delete(seedKey);
    TERRAIN_GENERATORS.set(seedKey, cachedGenerator);
    return cachedGenerator;
  }
  const source = createRegionTerrainBundleSource(seed);
  const regionCache = new Map<string, GeneratedStreamRegion<TerrainState>>();
  const pending = new Map<string, TerrainRegionPrefetchJob>();
  let entry: TerrainGeneratorCacheEntry;
  const generator = (coord: RegionCoord): GeneratedStreamRegion<TerrainState> => {
    const key = regionKey(coord);
    const cached = regionCache.get(key);
    if (cached) {
      touchTerrainRegionCache(entry, key, cached);
      return cached;
    }
    const pendingJob = pending.get(key);
    if (pendingJob) {
      pendingJob.step(pendingJob.totalTiles);
      const completed = regionCache.get(key);
      if (!completed) throw new Error("Terrain prefetch completion lost its generated region");
      return completed;
    }
    return cacheTerrainBundle(entry, coord, source.generate(coord));
  };
  entry = { seed, source, regionCache, pending, generator };
  TERRAIN_GENERATORS.set(seedKey, entry);
  while (TERRAIN_GENERATORS.size > TERRAIN_GENERATOR_SEED_CACHE_LIMIT) {
    const oldest = TERRAIN_GENERATORS.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    TERRAIN_GENERATORS.delete(oldest);
  }
  return entry;
}

function cacheTerrainBundle(
  entry: TerrainGeneratorCacheEntry,
  coord: RegionCoord,
  bundle: GeneratedRegionTerrain,
): GeneratedStreamRegion<TerrainState> {
  if (bundle.manifest.regionId !== stableRegionId(entry.seed, coord)) {
    throw new Error("Generated region terrain returned a mismatched stable identity");
  }
  const generated: GeneratedStreamRegion<TerrainState> = deepFreeze({
    coord: bundle.manifest.coord,
    key: bundle.manifest.key,
    regionId: bundle.manifest.regionId,
    contentHash: bundle.manifest.terrainHash,
    value: bundle.terrain,
  });
  // Production generation already computed this exact terrain hash.
  TRUSTED_GENERATED_REGIONS.add(generated);
  touchTerrainRegionCache(entry, bundle.manifest.key, generated);
  return generated;
}

function touchTerrainRegionCache(
  entry: TerrainGeneratorCacheEntry,
  key: string,
  region: GeneratedStreamRegion<TerrainState>,
): void {
  entry.regionCache.delete(key);
  entry.regionCache.set(key, region);
  while (entry.regionCache.size > TERRAIN_GENERATOR_REGION_CACHE_LIMIT) {
    const oldest = entry.regionCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    entry.regionCache.delete(oldest);
  }
}

function completedTerrainPrefetchJob(
  coord: RegionCoord,
  key: string,
  totalTiles: number,
): TerrainRegionPrefetchJob {
  return Object.freeze({
    coord,
    key,
    totalTiles,
    completedTiles: totalTiles,
    complete: true,
    cancelled: false,
    step: (tileBudget: number): boolean => {
      if (!Number.isSafeInteger(tileBudget) || tileBudget <= 0) {
        throw new RangeError("Region terrain job tile budget must be a positive safe integer");
      }
      return true;
    },
    cancel: (): void => undefined,
  });
}

export function createTerrainRegionStreamingState(options: {
  readonly rootSeed: RootSeed;
  readonly center?: RegionCoord;
  readonly config?: RegionStreamingConfig;
  readonly manifest?: unknown;
}): RegionStreamingState<TerrainState> {
  return createRegionStreamingState({
    ...options,
    generator: createTerrainRegionGenerator(options.rootSeed),
  });
}

export function createRegionStreamingState<T>(
  options: CreateRegionStreamingOptions<T>,
): RegionStreamingState<T> {
  const rootSeed = canonicalRootSeed(options.rootSeed);
  const rootSeedHash = hashCanonical(rootSeed);
  const config = canonicalConfig(options.config ?? DESKTOP_REGION_STREAMING_CONFIG);
  const center = canonicalCoord(options.center ?? { x: 0, y: 0 });
  const desired = desiredRegionCoords(center, config);
  const generated = new Map<string, LoadedGeneration<T>>();

  const load = (coord: RegionCoord): LoadedGeneration<T> => {
    const key = regionKey(coord);
    const prior = generated.get(key);
    if (prior) return prior;
    const next = loadGeneratedRegion(options.generator, coord);
    generated.set(key, next);
    return next;
  };

  const compatibility = load({ x: 0, y: 0 });
  const adopted = adoptRegionManifest(options.manifest, compatibility.contentHash);
  if (!adopted) throw new RangeError("Cannot adopt an invalid region manifest");
  for (const coord of desired) load(coord);
  const manifest = visitRegionManifest(
    adopted,
    desired.map((coord) => {
      const region = requiredGenerated(generated, regionKey(coord));
      return { coord, visitedHash: region.contentHash };
    }),
  );
  const loaded = materializeLoaded(desired, generated, manifest, 0);
  return sealStream({
    version: REGION_STREAMING_VERSION,
    rootSeedHash,
    config,
    center,
    transitionOrdinal: 0,
    loaded,
    manifest,
  });
}

export function moveRegionStreamingCenter<T>(
  state: RegionStreamingState<T>,
  center: RegionCoord,
  generator: RegionStreamGenerator<T>,
): RegionStreamingTransition<T> {
  const current = requireStream(state);
  const nextCenter = canonicalCoord(center);
  if (regionKey(current.center) === regionKey(nextCenter)) {
    return freezeTransition({
      state: current,
      generatedKeys: [],
      evictedKeys: [],
      retainedKeys: current.loaded.map(({ key }) => key),
    });
  }
  if (current.transitionOrdinal >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Region streaming transition ordinal capacity exhausted");
  }
  const transitionOrdinal = current.transitionOrdinal + 1;
  const desired = desiredRegionCoords(nextCenter, current.config);
  const priorByKey = new Map(current.loaded.map((region) => [region.key, region]));
  const generated = new Map<string, LoadedGeneration<T>>();
  const generatedKeys: string[] = [];
  const retainedKeys: string[] = [];

  for (const coord of desired) {
    const key = regionKey(coord);
    const retained = priorByKey.get(key);
    if (retained) {
      retainedKeys.push(key);
      generated.set(key, {
        coord: retained.coord,
        key: retained.key,
        regionId: retained.regionId,
        contentHash: retained.contentHash,
        value: retained.value,
      });
      continue;
    }
    generated.set(key, loadGeneratedRegion(generator, coord));
    generatedKeys.push(key);
  }

  const manifest = visitRegionManifest(
    current.manifest,
    desired.map((coord) => {
      const region = requiredGenerated(generated, regionKey(coord));
      return { coord, visitedHash: region.contentHash };
    }),
  );
  const loaded = materializeLoaded(desired, generated, manifest, transitionOrdinal);
  const nextKeys = new Set(loaded.map(({ key }) => key));
  const evictedKeys = current.loaded
    .map(({ key }) => key)
    .filter((key) => !nextKeys.has(key))
    .sort(compareText);
  const next = sealStream({
    version: REGION_STREAMING_VERSION,
    rootSeedHash: current.rootSeedHash,
    config: current.config,
    center: nextCenter,
    transitionOrdinal,
    loaded,
    manifest,
  });
  return freezeTransition({
    state: next,
    generatedKeys: generatedKeys.sort(compareText),
    evictedKeys,
    retainedKeys: retainedKeys.sort(compareText),
  });
}

/** First changes require a loaded hash; already-durable regions may update unloaded. */
export function commitStreamingRegionModification<T>(
  state: RegionStreamingState<T>,
  input: RegionManifestMutationInput,
): { readonly state: RegionStreamingState<T>; readonly commit: RegionManifestCommit } {
  const current = requireStream(state);
  const commit = commitGeneratedRegionModification(
    current.manifest,
    currentlyValidatedContentHash(current, input.region),
    input,
  );
  return deepFreeze({ state: withManifest(current, commit.manifest), commit });
}

/** Permanently tombstone a collected stable identity against unload/reload farming. */
export function collectStreamingRegionIdentity<T>(
  state: RegionStreamingState<T>,
  input: RegionManifestCollectionInput,
): { readonly state: RegionStreamingState<T>; readonly commit: RegionManifestCommit } {
  const current = requireStream(state);
  const commit = collectGeneratedRegionIdentity(
    current.manifest,
    currentlyValidatedContentHash(current, input.region),
    input,
  );
  return deepFreeze({ state: withManifest(current, commit.manifest), commit });
}

export function getLoadedRegion<T>(
  state: RegionStreamingState<T>,
  coord: RegionCoord,
): LoadedRegion<T> | null {
  const current = requireStream(state);
  if (!isRegionCoord(coord)) return null;
  const key = regionKey(coord);
  return current.loaded.find((region) => region.key === key) ?? null;
}

export function serializeRegionStreamingState<T>(state: RegionStreamingState<T>): string {
  const current = requireStream(state);
  const payload: RegionStreamingSavePayload = deepFreeze({
    version: REGION_STREAMING_VERSION,
    rootSeedHash: current.rootSeedHash,
    config: current.config,
    center: current.center,
    transitionOrdinal: current.transitionOrdinal,
    manifest: current.manifest,
  });
  const envelope: RegionStreamingSaveEnvelope = deepFreeze({
    ...payload,
    integrity: hashCanonical(payload),
  });
  const encoded = stableStringify(envelope);
  if (serializedByteLength(encoded) > REGION_STREAMING_MAX_SAVE_BYTES) {
    throw new RangeError("Region streaming state exceeds the save budget");
  }
  return encoded;
}

export function restoreRegionStreamingState<T>(
  rootSeed: RootSeed,
  text: string,
  generator: RegionStreamGenerator<T>,
): RegionStreamingState<T> | null {
  if (typeof text !== "string" || text.length === 0 || text.length > REGION_STREAMING_MAX_SAVE_BYTES) {
    return null;
  }
  try {
    const seed = canonicalRootSeed(rootSeed);
    const parsed: unknown = JSON.parse(text);
    if (!plainRecord(parsed) || !exactKeys(parsed, [
      "center",
      "config",
      "integrity",
      "manifest",
      "rootSeedHash",
      "transitionOrdinal",
      "version",
    ])) return null;
    if (
      parsed.version !== REGION_STREAMING_VERSION
      || parsed.rootSeedHash !== hashCanonical(seed)
      || typeof parsed.integrity !== "string"
      || !INTEGRITY_HASH_PATTERN.test(parsed.integrity)
      || !Number.isSafeInteger(parsed.transitionOrdinal)
      || (parsed.transitionOrdinal as number) < 0
      || !canonicalCoordShape(parsed.center)
    ) return null;
    const config = canonicalConfig(parsed.config as RegionStreamingConfig);
    const validation = validateRegionManifest(parsed.manifest);
    if (!validation.valid || !validation.manifest) return null;
    const payload: RegionStreamingSavePayload = {
      version: REGION_STREAMING_VERSION,
      rootSeedHash: parsed.rootSeedHash,
      config,
      center: canonicalCoord(parsed.center),
      transitionOrdinal: parsed.transitionOrdinal as number,
      manifest: validation.manifest,
    };
    if (hashCanonical(payload) !== parsed.integrity) return null;
    if (stableStringify({ ...payload, integrity: parsed.integrity }) !== text) return null;

    const desired = desiredRegionCoords(payload.center, config);
    const generated = new Map<string, LoadedGeneration<T>>();
    for (const coord of desired) {
      const region = loadGeneratedRegion(generator, coord);
      generated.set(region.key, region);
    }
    visitRegionManifest(
      payload.manifest,
      desired.map((coord) => {
        const region = requiredGenerated(generated, regionKey(coord));
        return { coord, visitedHash: region.contentHash };
      }),
    );
    const loaded = materializeLoaded(
      desired,
      generated,
      payload.manifest,
      payload.transitionOrdinal,
    );
    return sealStream({ ...payload, loaded });
  } catch {
    return null;
  }
}

export function restoreTerrainRegionStreamingState(
  rootSeed: RootSeed,
  text: string,
): RegionStreamingState<TerrainState> | null {
  return restoreRegionStreamingState(rootSeed, text, createTerrainRegionGenerator(rootSeed));
}

export function desiredRegionCoords(
  center: RegionCoord,
  config: RegionStreamingConfig,
): readonly RegionCoord[] {
  const canonicalCenter = canonicalCoord(center);
  const canonical = canonicalConfig(config);
  const candidates: RegionCoord[] = [];
  for (let y = -canonical.radius; y <= canonical.radius; y += 1) {
    for (let x = -canonical.radius; x <= canonical.radius; x += 1) {
      const regionX = canonicalCenter.x + x;
      const regionY = canonicalCenter.y + y;
      if (
        Number.isSafeInteger(regionX)
        && Number.isSafeInteger(regionY)
        && Math.abs(regionX) <= REGION_COORD_LIMIT
        && Math.abs(regionY) <= REGION_COORD_LIMIT
      ) candidates.push(Object.freeze({ x: regionX, y: regionY }));
    }
  }
  candidates.sort((left, right) => compareDesired(canonicalCenter, left, right));
  return Object.freeze(candidates.slice(0, canonical.maxLoadedRegions));
}

interface LoadedGeneration<T> extends GeneratedStreamRegion<T> {}

function loadGeneratedRegion<T>(
  generator: RegionStreamGenerator<T>,
  coord: RegionCoord,
): LoadedGeneration<T> {
  if (typeof generator !== "function") throw new TypeError("Region generator must be callable");
  const canonical = canonicalCoord(coord);
  const generated = generator(canonical);
  if (
    !plainRecord(generated)
    || !exactKeys(generated, ["contentHash", "coord", "key", "regionId", "value"])
    || !canonicalCoordShape(generated.coord)
    || regionKey(generated.coord) !== regionKey(canonical)
    || generated.key !== regionKey(canonical)
    || typeof generated.regionId !== "string"
    || !REGION_ID_PATTERN.test(generated.regionId)
    || typeof generated.contentHash !== "string"
    || !CONTENT_HASH_PATTERN.test(generated.contentHash)
  ) throw new RangeError("Region generator returned a noncanonical identity or coordinate");
  if (
    !TRUSTED_GENERATED_REGIONS.has(generated)
    && regionStreamContentHash(generated.value) !== generated.contentHash
  ) {
    throw new RangeError("Region generator content does not match its deterministic hash");
  }
  return deepFreeze({
    coord: canonical,
    key: generated.key,
    regionId: generated.regionId,
    contentHash: generated.contentHash,
    value: generated.value,
  });
}

function materializeLoaded<T>(
  desired: readonly RegionCoord[],
  generated: ReadonlyMap<string, LoadedGeneration<T>>,
  manifest: RegionManifest,
  transitionOrdinal: number,
): readonly LoadedRegion<T>[] {
  const regionIds = new Set<string>();
  const loaded = desired.map((coord): LoadedRegion<T> => {
    const key = regionKey(coord);
    const generatedRegion = requiredGenerated(generated, key);
    if (regionIds.has(generatedRegion.regionId)) {
      throw new RangeError("Region generator aliased two coordinates to one stable identity");
    }
    regionIds.add(generatedRegion.regionId);
    const durable = getDurableRegionRecord(manifest, coord)
      ?? pristineLoadedRegionRecord(generatedRegion);
    if (durable.visitedHash !== generatedRegion.contentHash) {
      throw new RangeError("Generated region does not match its durable first-change hash");
    }
    return deepFreeze({
      ...generatedRegion,
      lastTouchedOrdinal: transitionOrdinal,
      durable,
    });
  });
  return deepFreeze(loaded.sort((left, right) => compareText(left.key, right.key)));
}

function withManifest<T>(
  state: RegionStreamingState<T>,
  manifest: RegionManifest,
): RegionStreamingState<T> {
  const loaded = state.loaded.map((region) => {
    const durable = getDurableRegionRecord(manifest, region.coord);
    if (!durable) {
      if (region.durable.revision !== 0) {
        throw new RangeError("A loaded region lost its durable manifest record");
      }
      return region;
    }
    if (durable.visitedHash !== region.contentHash) {
      throw new RangeError("Generated region does not match its durable first-change hash");
    }
    return deepFreeze({ ...region, durable });
  });
  return sealStream({ ...state, loaded, manifest });
}

function currentlyValidatedContentHash<T>(
  state: RegionStreamingState<T>,
  coord: RegionCoord,
): string {
  const loaded = canonicalCoordShape(coord)
    ? state.loaded.find((region) => region.key === regionKey(coord))
    : undefined;
  if (loaded) return loaded.contentHash;
  const durable = getDurableRegionRecord(state.manifest, coord);
  if (durable) return durable.visitedHash;
  throw new RangeError("A pristine region must be loaded before its first durable change");
}

function pristineLoadedRegionRecord<T>(
  generated: LoadedGeneration<T>,
): PristineLoadedRegionRecord {
  return deepFreeze({
    coord: generated.coord,
    key: generated.key,
    visitedHash: generated.contentHash,
    visitedEventOrdinal: 0,
    revision: 0,
    lastEventOrdinal: 0,
    collected: [],
    modifications: [],
  });
}

function sealStream<T>(state: RegionStreamingState<T>): RegionStreamingState<T> {
  if (state.loaded.length > state.config.maxLoadedRegions) {
    throw new RangeError("Loaded region count exceeds its configured cap");
  }
  const canonical: RegionStreamingState<T> = deepFreeze({
    version: REGION_STREAMING_VERSION,
    rootSeedHash: state.rootSeedHash,
    config: canonicalConfig(state.config),
    center: canonicalCoord(state.center),
    transitionOrdinal: state.transitionOrdinal,
    loaded: [...state.loaded],
    manifest: state.manifest,
  });
  TRUSTED_STREAMS.add(canonical);
  return canonical;
}

function requireStream<T>(value: RegionStreamingState<T>): RegionStreamingState<T> {
  if (value !== null && typeof value === "object" && TRUSTED_STREAMS.has(value)) return value;
  throw new RangeError("Region streaming state was not created by the canonical kernel");
}

function canonicalRootSeed(seed: RootSeed): RootSeed {
  const value: unknown = seed;
  if (
    !Array.isArray(value)
    || value.length !== 4
    || !value.every((word) => Number.isSafeInteger(word)
      && word >= 0
      && word <= UINT32_MAX
      && !Object.is(word, -0))
  ) throw new RangeError("Region streaming requires exactly four canonical uint32 seed words");
  return Object.freeze([value[0], value[1], value[2], value[3]]) as RootSeed;
}

function canonicalConfig(value: RegionStreamingConfig): RegionStreamingConfig {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["maxLoadedRegions", "radius"])
    || !Number.isSafeInteger(value.radius)
    || value.radius < 0
    || value.radius > REGION_STREAMING_MAX_RADIUS
    || !Number.isSafeInteger(value.maxLoadedRegions)
    || value.maxLoadedRegions < 1
    || value.maxLoadedRegions > REGION_STREAMING_MAX_LOADED
    || value.maxLoadedRegions > (value.radius * 2 + 1) ** 2
  ) throw new RangeError("Region streaming configuration is outside the bounded load budget");
  return Object.freeze({ radius: value.radius, maxLoadedRegions: value.maxLoadedRegions });
}

function canonicalCoord(value: RegionCoord): RegionCoord {
  if (!canonicalCoordShape(value)) throw new RangeError("Region streaming center is not canonical");
  return Object.freeze({ x: value.x, y: value.y });
}

function compareDesired(center: RegionCoord, left: RegionCoord, right: RegionCoord): number {
  const leftX = Math.abs(left.x - center.x);
  const leftY = Math.abs(left.y - center.y);
  const rightX = Math.abs(right.x - center.x);
  const rightY = Math.abs(right.y - center.y);
  const manhattan = leftX + leftY - rightX - rightY;
  if (manhattan !== 0) return manhattan;
  const chebyshev = Math.max(leftX, leftY) - Math.max(rightX, rightY);
  if (chebyshev !== 0) return chebyshev;
  if (left.y !== right.y) return left.y - right.y;
  return left.x - right.x;
}

function requiredGenerated<T>(
  generated: ReadonlyMap<string, LoadedGeneration<T>>,
  key: string,
): LoadedGeneration<T> {
  const value = generated.get(key);
  if (!value) throw new Error(`Missing generated region ${key}`);
  return value;
}

function freezeTransition<T>(transition: RegionStreamingTransition<T>): RegionStreamingTransition<T> {
  return deepFreeze({
    state: transition.state,
    generatedKeys: [...transition.generatedKeys],
    evictedKeys: [...transition.evictedKeys],
    retainedKeys: [...transition.retainedKeys],
  });
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function canonicalCoordShape(value: unknown): value is RegionCoord {
  return isRegionCoord(value)
    && plainRecord(value)
    && exactKeys(value, ["x", "y"]);
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** Useful for diagnostics without serializing generated terrain into the save. */
export function regionStreamingSaveSize<T>(state: RegionStreamingState<T>): number {
  return serializedByteLength(serializeRegionStreamingState(state));
}

/** The durable manifest is separately serializable for the future save-v4 envelope. */
export function regionStreamingManifestText<T>(state: RegionStreamingState<T>): string {
  return serializeRegionManifest(requireStream(state).manifest);
}

function serializedByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}
