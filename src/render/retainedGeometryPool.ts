/**
 * Owns renderer-only retained geometry for one immutable presentation owner.
 *
 * The owner is deliberately an object identity rather than a revision string:
 * callers must first construct and validate their authoritative presentation
 * data, then may retain only the geometry derived from that exact snapshot.
 * Replacing the snapshot releases every GPU resource before any new geometry
 * can be admitted.
 */
export interface RetainedGeometryPool<
  Owner extends object,
  Batch extends object,
  Geometry,
> {
  /** Selects the exact presentation snapshot whose batches may be retained. */
  readonly begin: (owner: Owner | null) => void;
  /** Returns one geometry per batch identity for the selected owner. */
  readonly geometryFor: (batch: Batch, create: () => Geometry) => Geometry;
  /** Tests residency without creating, releasing, or refreshing a geometry. */
  readonly hasGeometryFor: (batch: Batch) => boolean;
  /** Releases all retained GPU resources and clears the selected owner. */
  readonly release: () => void;
  /** Drops stale handles without touching an already-lost graphics context. */
  readonly discard: () => void;
  /** Bounded diagnostic counters; never authoritative simulation state. */
  readonly metrics: () => RetainedGeometryPoolMetrics;
  /** Restarts diagnostic counters while preserving the live resident set. */
  readonly resetMetrics: () => void;
}

export interface RetainedGeometryPoolMetrics {
  /** Counts since the most recent diagnostic reset. */
  readonly ownerTransitions: number;
  readonly creations: number;
  readonly releases: number;
  readonly discards: number;
  readonly evictions: number;
  readonly cacheHits: number;
  readonly live: number;
  readonly peakLive: number;
}

export interface RetainedGeometryPoolOptions {
  /** Hard bound on JavaScript and GPU-backed geometry retained by this pool. */
  readonly maximumGeometries?: number;
}

export function createRetainedGeometryPool<
  Owner extends object,
  Batch extends object,
  Geometry,
>(
  releaseGeometry: (geometry: Geometry) => void,
  options: RetainedGeometryPoolOptions = {},
): RetainedGeometryPool<Owner, Batch, Geometry> {
  const maximumGeometries = options.maximumGeometries ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(maximumGeometries) || maximumGeometries < 1) {
    throw new RangeError("Retained geometry maximum must be a positive safe integer.");
  }
  let owner: Owner | null = null;
  const geometries = new Map<Batch, Geometry>();
  let ownerTransitions = 0;
  let creations = 0;
  let releases = 0;
  let discards = 0;
  let evictions = 0;
  let cacheHits = 0;
  let peakLive = 0;

  const increment = (value: number, amount = 1): number =>
    Math.min(Number.MAX_SAFE_INTEGER, value + amount);

  const clear = (releaseResources: boolean): void => {
    if (releaseResources) {
      for (const geometry of geometries.values()) {
        releaseGeometry(geometry);
        releases = increment(releases);
      }
    } else {
      discards = increment(discards, geometries.size);
    }
    geometries.clear();
    owner = null;
  };

  return {
    begin(nextOwner) {
      if (owner === nextOwner) return;
      ownerTransitions = increment(ownerTransitions);
      clear(true);
      owner = nextOwner;
    },
    geometryFor(batch, create) {
      if (owner === null) {
        throw new Error("Retained geometry requires an active presentation owner.");
      }
      const retained = geometries.get(batch);
      if (retained !== undefined) {
        cacheHits = increment(cacheHits);
        return retained;
      }
      const geometry = create();
      creations = increment(creations);
      if (geometries.size >= maximumGeometries) {
        const oldestBatch = geometries.keys().next().value as Batch | undefined;
        if (oldestBatch !== undefined) {
          const oldestGeometry = geometries.get(oldestBatch);
          geometries.delete(oldestBatch);
          if (oldestGeometry !== undefined) {
            releaseGeometry(oldestGeometry);
            releases = increment(releases);
          }
          evictions = increment(evictions);
        }
      }
      geometries.set(batch, geometry);
      peakLive = Math.max(peakLive, geometries.size);
      return geometry;
    },
    hasGeometryFor(batch) {
      return geometries.has(batch);
    },
    release() {
      clear(true);
    },
    discard() {
      clear(false);
    },
    metrics() {
      return {
        ownerTransitions,
        creations,
        releases,
        discards,
        evictions,
        cacheHits,
        live: geometries.size,
        peakLive,
      };
    },
    resetMetrics() {
      ownerTransitions = 0;
      // Residents that predate the window remain visible through `live`; do
      // not misreport them as geometry created during the measured interval.
      creations = 0;
      releases = 0;
      discards = 0;
      evictions = 0;
      cacheHits = 0;
      peakLive = geometries.size;
    },
  };
}
