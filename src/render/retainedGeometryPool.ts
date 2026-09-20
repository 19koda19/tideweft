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
  /** Releases all retained GPU resources and clears the selected owner. */
  readonly release: () => void;
  /** Drops stale handles without touching an already-lost graphics context. */
  readonly discard: () => void;
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

  const clear = (releaseResources: boolean): void => {
    if (releaseResources) {
      for (const geometry of geometries.values()) releaseGeometry(geometry);
    }
    geometries.clear();
    owner = null;
  };

  return {
    begin(nextOwner) {
      if (owner === nextOwner) return;
      clear(true);
      owner = nextOwner;
    },
    geometryFor(batch, create) {
      if (owner === null) {
        throw new Error("Retained geometry requires an active presentation owner.");
      }
      const retained = geometries.get(batch);
      if (retained !== undefined) return retained;
      const geometry = create();
      if (geometries.size >= maximumGeometries) {
        const oldestBatch = geometries.keys().next().value as Batch | undefined;
        if (oldestBatch !== undefined) {
          const oldestGeometry = geometries.get(oldestBatch);
          geometries.delete(oldestBatch);
          if (oldestGeometry !== undefined) releaseGeometry(oldestGeometry);
        }
      }
      geometries.set(batch, geometry);
      return geometry;
    },
    release() {
      clear(true);
    },
    discard() {
      clear(false);
    },
  };
}
