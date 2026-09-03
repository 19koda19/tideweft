import { describe, expect, it } from "vitest";
import { seedFromText, type RootSeed } from "../sim/rng";
import { generateRegionTerrainBundle } from "../sim/regionTerrain";
import { REGION_COORD_LIMIT, regionKey, type RegionCoord } from "../sim/regions";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  collectStreamingRegionIdentity,
  commitStreamingRegionModification,
  createRegionStreamingState,
  createTerrainRegionGenerator,
  createTerrainRegionPrefetchJob,
  createTerrainRegionStreamingState,
  desiredRegionCoords,
  DESKTOP_REGION_STREAMING_CONFIG,
  getLoadedRegion,
  MOBILE_REGION_STREAMING_CONFIG,
  moveRegionStreamingCenter,
  regionStreamContentHash,
  REGION_STREAMING_MAX_SAVE_BYTES,
  restoreRegionStreamingState,
  restoreTerrainRegionStreamingState,
  serializeRegionStreamingState,
  type GeneratedStreamRegion,
  type RegionStreamGenerator,
  type RegionStreamingState,
} from "./regionStreaming";
import { getDurableRegionRecord, serializeRegionManifest } from "./regionManifest";

interface TinyRegion {
  readonly key: string;
  readonly altitude: number;
  readonly marker: readonly [number, number];
}

const SEED = seedFromText("bounded memory on an endless road");

function tinyGenerator(options: {
  readonly calls?: string[];
  readonly failKey?: string;
  readonly contentSalt?: string;
  readonly aliasRegionId?: boolean;
} = {}): RegionStreamGenerator<TinyRegion> {
  return (coord): GeneratedStreamRegion<TinyRegion> => {
    const key = regionKey(coord);
    options.calls?.push(key);
    if (key === options.failKey) throw new Error(`fixture failed at ${key}`);
    const value: TinyRegion = {
      key,
      altitude: Math.abs(coord.x * 31 + coord.y * 17) % 1_000,
      marker: [coord.x, coord.y],
      ...(options.contentSalt === undefined ? {} : { salt: options.contentSalt }),
    } as TinyRegion;
    return {
      coord: { x: coord.x, y: coord.y },
      key,
      regionId: options.aliasRegionId ? "test:aliased" : `test:${hashCanonical({ coord })}`,
      contentHash: regionStreamContentHash(value),
      value,
    };
  };
}

function resealStreamingEnvelope(value: Record<string, unknown>): string {
  const { integrity: _integrity, ...payload } = value;
  return stableStringify({ ...payload, integrity: hashCanonical(payload) });
}

function resealNestedManifest(value: Record<string, unknown>): string {
  const manifest = value.manifest as Record<string, unknown>;
  const { integrity: _manifestIntegrity, ...manifestPayload } = manifest;
  return resealStreamingEnvelope({
    ...value,
    manifest: { ...manifestPayload, integrity: hashCanonical(manifestPayload) },
  });
}

function regionRecord<T>(state: RegionStreamingState<T>, coord: RegionCoord) {
  const loaded = getLoadedRegion(state, coord);
  if (loaded) return loaded.durable;
  const durable = getDurableRegionRecord(state.manifest, coord);
  if (!durable) throw new Error(`missing region durability ${regionKey(coord)}`);
  return durable;
}

describe("bounded deterministic region streaming", () => {
  it("reuses a bounded immutable terrain generator cache across stream transitions", () => {
    const seed = seedFromText("the prefetched ground is still the same ground");
    const first = createTerrainRegionGenerator(seed);
    const second = createTerrainRegionGenerator([...seed] as RootSeed);
    const coord = { x: 2, y: -3 } as const;
    const generated = first(coord);

    expect(second).toBe(first);
    expect(second(coord)).toBe(generated);
    expect(Object.isFrozen(generated)).toBe(true);
    expect(Object.isFrozen(generated.value)).toBe(true);
    expect(generated.contentHash).toBe(generateRegionTerrainBundle(seed, coord).manifest.terrainHash);
  });

  it("prefetches terrain in bounded deterministic slices and shares the completed bundle", () => {
    const seed = seedFromText("the horizon arrives before the porter");
    const coord = { x: 11, y: -7 } as const;
    const job = createTerrainRegionPrefetchJob(seed, coord);
    expect(createTerrainRegionPrefetchJob(seed, coord)).toBe(job);
    expect(job.complete).toBe(false);
    expect(job.completedTiles).toBe(0);
    expect(() => job.step(0)).toThrow(/positive safe integer/u);

    let calls = 0;
    while (!job.step(257)) calls += 1;
    expect(calls).toBeGreaterThan(0);
    expect(job.complete).toBe(true);
    expect(job.completedTiles).toBe(job.totalTiles);

    const cached = createTerrainRegionGenerator(seed)(coord);
    expect(cached.contentHash).toBe(generateRegionTerrainBundle(seed, coord).manifest.terrainHash);
    expect(createTerrainRegionPrefetchJob(seed, coord).complete).toBe(true);
  });

  it("cancels only ephemeral prefetch work and cannot reroll regenerated ground", () => {
    const seed = seedFromText("turning around does not cancel the world");
    const coord = { x: -31, y: 22 } as const;
    const abandoned = createTerrainRegionPrefetchJob(seed, coord);
    expect(abandoned.step(311)).toBe(false);
    expect(abandoned.completedTiles).toBe(311);
    abandoned.cancel();
    expect(abandoned.cancelled).toBe(true);
    expect(() => abandoned.step(1)).toThrow(/cancelled/ui);

    const restarted = createTerrainRegionPrefetchJob(seed, coord);
    expect(restarted).not.toBe(abandoned);
    while (!restarted.step(509)) {
      // Deterministic bounded slices intentionally restart from tile zero.
    }
    const generated = createTerrainRegionGenerator(seed)(coord);
    expect(generated.contentHash).toBe(generateRegionTerrainBundle(seed, coord).manifest.terrainHash);
    expect(restarted.cancelled).toBe(false);
  });

  it("chooses desktop nine and mobile center-plus-cardinal five deterministically", () => {
    expect(desiredRegionCoords({ x: 0, y: 0 }, DESKTOP_REGION_STREAMING_CONFIG).map(regionKey))
      .toEqual([
        "r:0:0",
        "r:0:-1",
        "r:-1:0",
        "r:1:0",
        "r:0:1",
        "r:-1:-1",
        "r:1:-1",
        "r:-1:1",
        "r:1:1",
      ]);
    expect(desiredRegionCoords({ x: 0, y: 0 }, MOBILE_REGION_STREAMING_CONFIG).map(regionKey))
      .toEqual(["r:0:0", "r:0:-1", "r:-1:0", "r:1:0", "r:0:1"]);
  });

  it("keeps compatibility generation ephemeral and honors mobile and desktop budgets", () => {
    const calls: string[] = [];
    const state = createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator({ calls }),
      center: { x: 100, y: -200 },
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    expect(state.loaded).toHaveLength(5);
    expect(state.loaded.every(({ key }) => key.startsWith("r:"))).toBe(true);
    expect(state.manifest.regions).toEqual([]);
    expect(state.loaded.every(({ durable }) => durable.revision === 0)).toBe(true);
    expect(calls[0]).toBe("r:0:0");
    expect(new Set(state.loaded.map(({ regionId }) => regionId)).size).toBe(5);
    expect(state.loaded.every(({ contentHash }) => /^[0-9a-f]{32}$/u.test(contentHash))).toBe(true);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.loaded[0]?.value)).toBe(true);

    const desktop = createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      config: DESKTOP_REGION_STREAMING_CONFIG,
    });
    expect(desktop.loaded).toHaveLength(9);
    expect(desktop.manifest.regions).toEqual([]);
  });

  it("loads, retains, and evicts an exact deterministic set per crossing", () => {
    const state = createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    const first = moveRegionStreamingCenter(state, { x: 1, y: 0 }, tinyGenerator());
    const second = moveRegionStreamingCenter(state, { x: 1, y: 0 }, tinyGenerator());
    expect(first).toEqual(second);
    expect(first.state.loaded).toHaveLength(5);
    expect(first.state.transitionOrdinal).toBe(1);
    expect(first.generatedKeys).toEqual(["r:1:-1", "r:1:1", "r:2:0"]);
    expect(first.evictedKeys).toEqual(["r:-1:0", "r:0:-1", "r:0:1"]);
    expect(first.retainedKeys).toEqual(["r:0:0", "r:1:0"]);
    expect(state.center).toEqual({ x: 0, y: 0 });
  });

  it("makes a same-center transition a generation-free identity operation", () => {
    const state = createRegionStreamingState({ rootSeed: SEED, generator: tinyGenerator() });
    const calls: string[] = [];
    const transition = moveRegionStreamingCenter(state, { x: 0, y: 0 }, tinyGenerator({ calls }));
    expect(transition.state).toBe(state);
    expect(calls).toEqual([]);
    expect(transition.generatedKeys).toEqual([]);
  });

  it("preserves collected identities after eviction, revisit, save, and reload", () => {
    const generator = tinyGenerator();
    let state = createRegionStreamingState({
      rootSeed: SEED,
      generator,
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    const origin = regionRecord(state, { x: 0, y: 0 });
    state = collectStreamingRegionIdentity(state, {
      region: origin.coord,
      id: "resource:reed-clump:17",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: origin.revision,
    }).state;
    state = moveRegionStreamingCenter(state, { x: 20, y: 20 }, generator).state;
    expect(getLoadedRegion(state, { x: 0, y: 0 })).toBeNull();
    state = moveRegionStreamingCenter(state, { x: 0, y: 0 }, generator).state;
    expect(getLoadedRegion(state, { x: 0, y: 0 })?.durable.collected.map(({ id }) => id))
      .toEqual(["resource:reed-clump:17"]);
    const loaded = restoreRegionStreamingState(SEED, serializeRegionStreamingState(state), generator);
    expect(getLoadedRegion(loaded as RegionStreamingState<TinyRegion>, { x: 0, y: 0 })
      ?.durable.collected.map(({ id }) => id)).toEqual(["resource:reed-clump:17"]);
  });

  it("materializes a loaded pristine modification and preserves it across unload, revisit, and save", () => {
    const generator = tinyGenerator();
    let state = createRegionStreamingState({ rootSeed: SEED, generator });
    const origin = regionRecord(state, { x: 0, y: 0 });
    expect(origin.revision).toBe(0);
    state = commitStreamingRegionModification(state, {
      region: origin.coord,
      id: "evidence:storm-wreck:4",
      kind: "evidence",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: origin.revision,
      expectedModificationRevision: 0,
      removed: false,
      value: { cargoIds: ["lot:4"], severity: 810_000 },
    }).state;
    expect(state.manifest.regions).toHaveLength(1);
    expect(regionRecord(state, origin.coord).visitedHash).toBe(origin.visitedHash);
    state = moveRegionStreamingCenter(state, { x: 50, y: -50 }, generator).state;
    expect(getLoadedRegion(state, origin.coord)).toBeNull();
    const beforeRejectedChange = serializeRegionStreamingState(state);
    expect(() => commitStreamingRegionModification(state, {
      region: { x: 9, y: 9 },
      id: "evidence:unloaded-pristine:1",
      kind: "evidence",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: 0,
      expectedModificationRevision: 0,
      removed: false,
      value: { severity: 1 },
    })).toThrow(/must be loaded/);
    expect(serializeRegionStreamingState(state)).toBe(beforeRejectedChange);
    state = moveRegionStreamingCenter(state, origin.coord, generator).state;
    expect(getLoadedRegion(state, origin.coord)?.durable.modifications[0]).toMatchObject({
      id: "evidence:storm-wreck:4",
      value: { cargoIds: ["lot:4"], severity: 810_000 },
    });
    const restored = restoreRegionStreamingState(SEED, serializeRegionStreamingState(state), generator);
    expect(getLoadedRegion(restored as RegionStreamingState<TinyRegion>, origin.coord)
      ?.durable.modifications).toEqual(getLoadedRegion(state, origin.coord)?.durable.modifications);
  });

  it("rejects repeated pickup, stale updates, and collected resurrection", () => {
    let state = createRegionStreamingState({ rootSeed: SEED, generator: tinyGenerator() });
    const origin = regionRecord(state, { x: 0, y: 0 });
    const quote = {
      region: origin.coord,
      id: "resource:mushroom:1",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: origin.revision,
    };
    state = collectStreamingRegionIdentity(state, quote).state;
    expect(() => collectStreamingRegionIdentity(state, quote)).toThrow(/manifest quote is stale/);
    const current = regionRecord(state, origin.coord);
    expect(() => collectStreamingRegionIdentity(state, {
      region: origin.coord,
      id: "resource:mushroom:2",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: 0,
    })).toThrow(/region quote is stale/);
    expect(() => collectStreamingRegionIdentity(state, {
      ...quote,
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: current.revision,
    })).toThrow(/cannot be collected twice/);
    expect(() => commitStreamingRegionModification(state, {
      region: origin.coord,
      id: quote.id,
      kind: "resource",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: current.revision,
      expectedModificationRevision: 0,
      removed: false,
      value: { quantity: 1 },
    })).toThrow(/cannot be resurrected/);
  });

  it("round-trips exact save state without serializing loaded terrain", () => {
    const generator = tinyGenerator();
    let state = createRegionStreamingState({
      rootSeed: SEED,
      generator,
      center: { x: -1_000_000, y: 1_000_000 },
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    state = moveRegionStreamingCenter(state, { x: -999_999, y: 1_000_000 }, generator).state;
    const text = serializeRegionStreamingState(state);
    expect(text).not.toContain("altitude");
    const restored = restoreRegionStreamingState(SEED, text, generator);
    expect(restored).not.toBeNull();
    expect(serializeRegionStreamingState(restored as RegionStreamingState<TinyRegion>)).toBe(text);
    expect(restored?.loaded).toEqual(state.loaded);
    expect(serializeRegionManifest(restored?.manifest as NonNullable<typeof restored>["manifest"]))
      .toBe(serializeRegionManifest(state.manifest));
  });

  it("rejects the wrong seed, broken seals, noncanonical text, and oversized input", () => {
    const generator = tinyGenerator();
    const state = createRegionStreamingState({ rootSeed: SEED, generator });
    const text = serializeRegionStreamingState(state);
    expect(restoreRegionStreamingState(seedFromText("other world"), text, generator)).toBeNull();
    const raw = JSON.parse(text) as Record<string, unknown>;
    expect(restoreRegionStreamingState(SEED, stableStringify({ ...raw, center: { x: 8, y: 8 } }), generator))
      .toBeNull();
    expect(restoreRegionStreamingState(SEED, ` ${text}`, generator)).toBeNull();
    expect(restoreRegionStreamingState(SEED, "x".repeat(REGION_STREAMING_MAX_SAVE_BYTES + 1), generator))
      .toBeNull();
  });

  it("rejects corrupted nested manifests even under a freshly sealed outer envelope", () => {
    const state = createRegionStreamingState({ rootSeed: SEED, generator: tinyGenerator() });
    const raw = JSON.parse(serializeRegionStreamingState(state)) as Record<string, unknown>;
    const manifest = structuredClone(raw.manifest) as Record<string, unknown>;
    const regions = manifest.regions as Record<string, unknown>[];
    regions[0] = { ...regions[0], key: "r:00:0" };
    const { integrity: _innerIntegrity, ...manifestPayload } = manifest;
    raw.manifest = { ...manifestPayload, integrity: hashCanonical(manifestPayload) };
    expect(restoreRegionStreamingState(SEED, resealStreamingEnvelope(raw), tinyGenerator())).toBeNull();
  });

  it("fails a generator exception atomically", () => {
    const state = createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    const before = serializeRegionStreamingState(state);
    expect(() => moveRegionStreamingCenter(
      state,
      { x: 1, y: 0 },
      tinyGenerator({ failKey: "r:2:0" }),
    )).toThrow(/fixture failed/);
    expect(serializeRegionStreamingState(state)).toBe(before);
  });

  it("loads a saturated transition cursor but refuses to wrap it", () => {
    const generator = tinyGenerator();
    const state = createRegionStreamingState({ rootSeed: SEED, generator });
    const raw = JSON.parse(serializeRegionStreamingState(state)) as Record<string, unknown>;
    raw.transitionOrdinal = Number.MAX_SAFE_INTEGER;
    const saturated = restoreRegionStreamingState(SEED, resealStreamingEnvelope(raw), generator);
    expect(saturated?.transitionOrdinal).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => moveRegionStreamingCenter(
      saturated as RegionStreamingState<TinyRegion>,
      { x: 1, y: 0 },
      generator,
    )).toThrow(/ordinal capacity exhausted/);
  });

  it("allows pristine regeneration but rejects generation hash changes after touch", () => {
    let state = createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    const pristineOrigin = regionRecord(state, { x: 0, y: 0 });
    state = collectStreamingRegionIdentity(state, {
      region: pristineOrigin.coord,
      id: "resource:hash-anchor:1",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: pristineOrigin.revision,
    }).state;
    expect(restoreRegionStreamingState(
      SEED,
      serializeRegionStreamingState(state),
      tinyGenerator({ contentSalt: "reroll" }),
    )).toBeNull();
    state = moveRegionStreamingCenter(state, { x: 20, y: 20 }, tinyGenerator()).state;
    const before = serializeRegionStreamingState(state);
    expect(() => moveRegionStreamingCenter(
      state,
      { x: 0, y: 0 },
      tinyGenerator({ contentSalt: "reroll" }),
    )).toThrow(/different terrain hash/);
    expect(serializeRegionStreamingState(state)).toBe(before);

    let untouched = createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    untouched = moveRegionStreamingCenter(untouched, { x: 20, y: 20 }, tinyGenerator()).state;
    expect(() => moveRegionStreamingCenter(
      untouched,
      { x: 0, y: 0 },
      tinyGenerator({ contentSalt: "new-generator-contract" }),
    )).not.toThrow();
  });

  it("rejects coordinate identity aliases and dishonest content hashes", () => {
    expect(() => createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator({ aliasRegionId: true }),
      config: MOBILE_REGION_STREAMING_CONFIG,
    })).toThrow(/aliased two coordinates/);
    const dishonest: RegionStreamGenerator<TinyRegion> = (coord) => ({
      ...tinyGenerator()(coord),
      contentHash: "0".repeat(32),
    });
    expect(() => createRegionStreamingState({ rootSeed: SEED, generator: dishonest }))
      .toThrow(/does not match/);
    for (const malformedHash of ["0".repeat(16), "0".repeat(31)]) {
      const malformed: RegionStreamGenerator<TinyRegion> = (coord) => ({
        ...tinyGenerator()(coord),
        contentHash: malformedHash,
      });
      expect(() => createRegionStreamingState({ rootSeed: SEED, generator: malformed }))
        .toThrow(/noncanonical/);
    }
  });

  it("handles coordinate limits without overflowing or duplicating the center", () => {
    const center = { x: REGION_COORD_LIMIT, y: -REGION_COORD_LIMIT } as const;
    const state = createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      center,
      config: DESKTOP_REGION_STREAMING_CONFIG,
    });
    expect(state.loaded.length).toBe(4);
    expect(new Set(state.loaded.map(({ key }) => key)).size).toBe(4);
    expect(getLoadedRegion(state, center)).not.toBeNull();
  });

  it("keeps 10,001 one-direction pristine transitions sparse, bounded, and deterministic", () => {
    const run = (): { readonly state: RegionStreamingState<TinyRegion>; readonly elapsedMs: number } => {
      const generator = tinyGenerator();
      let state = createRegionStreamingState({
        rootSeed: SEED,
        generator,
        config: MOBILE_REGION_STREAMING_CONFIG,
      });
      const started = performance.now();
      for (let index = 0; index < 10_001; index += 1) {
        state = moveRegionStreamingCenter(
          state,
          { x: index + 1, y: -2_000_000 },
          generator,
        ).state;
        expect(state.loaded.length).toBeLessThanOrEqual(5);
        expect(state.manifest.regions).toHaveLength(0);
      }
      return { state, elapsedMs: performance.now() - started };
    };
    const first = run();
    const second = run();
    expect(serializeRegionStreamingState(second.state)).toBe(serializeRegionStreamingState(first.state));
    expect(first.state.manifest.regions).toHaveLength(0);
    expect(serializeRegionStreamingState(first.state).length).toBeLessThan(1_000);
    expect(first.elapsedMs).toBeLessThan(5_000);
  }, 15_000);

  it("connects the production terrain generator and restores its exact hashes", () => {
    const seed = seedFromText("the old estuary is region zero");
    const state = createTerrainRegionStreamingState({
      rootSeed: seed,
      config: { radius: 0, maxLoadedRegions: 1 },
    });
    const origin = getLoadedRegion(state, { x: 0, y: 0 });
    const expected = generateRegionTerrainBundle(seed, { x: 0, y: 0 }).manifest.terrainHash;
    expect(expected).toMatch(/^[0-9a-f]{32}$/u);
    expect(origin?.contentHash).toBe(expected);
    expect(origin?.durable.visitedHash).toBe(expected);
    expect(origin?.durable.revision).toBe(0);
    expect(state.manifest.regions).toEqual([]);
    const text = serializeRegionStreamingState(state);
    const restored = restoreTerrainRegionStreamingState(seed, text);
    expect(restored?.loaded[0]?.contentHash).toBe(origin?.contentHash);
    expect(serializeRegionStreamingState(restored as NonNullable<typeof restored>)).toBe(text);
  });

  it("round-trips a signed non-origin production terrain hash exactly", () => {
    const seed = seedFromText("the far western terrain seal returns");
    const center = { x: -1_000_000, y: 1_000_000 } as const;
    const state = createTerrainRegionStreamingState({
      rootSeed: seed,
      center,
      config: { radius: 0, maxLoadedRegions: 1 },
    });
    const expected = generateRegionTerrainBundle(seed, center).manifest.terrainHash;
    const loaded = getLoadedRegion(state, center);
    expect(loaded?.contentHash).toBe(expected);
    expect(loaded?.durable.visitedHash).toBe(expected);
    expect(loaded?.durable.revision).toBe(0);
    expect(state.manifest.regions).toEqual([]);
    const text = serializeRegionStreamingState(state);
    const restored = restoreTerrainRegionStreamingState(seed, text);
    expect(getLoadedRegion(restored as NonNullable<typeof restored>, center)?.contentHash)
      .toBe(expected);
    expect(serializeRegionStreamingState(restored as NonNullable<typeof restored>)).toBe(text);
  });

  it("rejects legacy, truncated, and coordinate-swapped terrain hashes after valid resealing", () => {
    const seed = seedFromText("terrain hashes belong to their own regions");
    let state = createTerrainRegionStreamingState({
      rootSeed: seed,
      config: MOBILE_REGION_STREAMING_CONFIG,
    });
    const first = regionRecord(state, { x: 0, y: 0 });
    state = collectStreamingRegionIdentity(state, {
      region: first.coord,
      id: "resource:terrain-hash-anchor:0",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: first.revision,
    }).state;
    const second = regionRecord(state, { x: 1, y: 0 });
    state = collectStreamingRegionIdentity(state, {
      region: second.coord,
      id: "resource:terrain-hash-anchor:1",
      expectedManifestRevision: state.manifest.revision,
      expectedRegionRevision: second.revision,
    }).state;
    const text = serializeRegionStreamingState(state);
    const raw = JSON.parse(text) as Record<string, unknown>;

    for (const length of [16, 31]) {
      const malformed = structuredClone(raw);
      const manifest = malformed.manifest as Record<string, unknown>;
      const regions = manifest.regions as Record<string, unknown>[];
      regions[0] = {
        ...regions[0],
        visitedHash: String(regions[0]?.visitedHash).slice(0, length),
      };
      expect(restoreTerrainRegionStreamingState(seed, resealNestedManifest(malformed))).toBeNull();
    }

    const swapped = structuredClone(raw);
    const swappedManifest = swapped.manifest as Record<string, unknown>;
    const swappedRegions = swappedManifest.regions as Record<string, unknown>[];
    expect(swappedRegions.length).toBeGreaterThan(1);
    const firstHash = swappedRegions[0]?.visitedHash;
    swappedRegions[0] = { ...swappedRegions[0], visitedHash: swappedRegions[1]?.visitedHash };
    swappedRegions[1] = { ...swappedRegions[1], visitedHash: firstHash };
    expect(restoreTerrainRegionStreamingState(seed, resealNestedManifest(swapped))).toBeNull();
    expect(serializeRegionStreamingState(state)).toBe(text);
  });

  it("rejects malformed configuration, coordinates, seed words, and generators", () => {
    expect(() => createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      config: { radius: 1, maxLoadedRegions: 10 },
    })).toThrow(/configuration/);
    expect(() => createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      center: { x: -0, y: 0 },
    })).toThrow(/center/);
    expect(() => createRegionStreamingState({
      rootSeed: SEED,
      generator: tinyGenerator(),
      center: { x: 0, y: 0, alias: true } as RegionCoord,
    })).toThrow(/center/);
    expect(() => createRegionStreamingState({
      rootSeed: [1, 2, 3, -1] as RootSeed,
      generator: tinyGenerator(),
    })).toThrow(/seed words/);
    expect(() => createRegionStreamingState({
      rootSeed: SEED,
      generator: (() => ({ key: "bad" })) as never,
    })).toThrow(/noncanonical/);
  });
});
