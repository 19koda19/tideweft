export interface SingleRetainedGeometryMetrics {
  readonly ownerTransitions: number;
  readonly promotions: number;
  readonly builds: number;
  readonly releases: number;
  readonly discards: number;
  readonly live: 0 | 1;
  readonly peakLive: 0 | 1;
  readonly vertices: number;
  readonly bytes: number;
}

/**
 * One-shot authority to admit or reject a build for one exact owner
 * incarnation. Runtime identity, not the public fields, is authoritative.
 */
declare const singleRetainedGeometryPromotionBrand: unique symbol;
export interface SingleRetainedGeometryPromotion {
  readonly ownerKey: string;
  readonly generation: number;
  readonly [singleRetainedGeometryPromotionBrand]: never;
}

export type SingleRetainedGeometrySelection<Geometry extends object> =
  | { readonly kind: "immediate" }
  | { readonly kind: "promote"; readonly permit: SingleRetainedGeometryPromotion }
  | { readonly kind: "retained"; readonly geometry: Geometry };

export interface SingleRetainedGeometrySlot<Geometry extends object> {
  readonly select: (
    ownerKey: string | null,
    nowMs: number,
  ) => SingleRetainedGeometrySelection<Geometry>;
  readonly admit: (
    permit: SingleRetainedGeometryPromotion,
    geometry: Geometry,
    vertices: number,
    bytes: number,
  ) => boolean;
  readonly reject: (permit: SingleRetainedGeometryPromotion) => void;
  /**
   * Releases a resident that failed while drawing while keeping its exact
   * owner rejected until presentation state changes.
   */
  readonly rejectResident: () => void;
  readonly release: () => void;
  readonly discard: () => void;
  readonly metrics: () => SingleRetainedGeometryMetrics;
}

export interface SingleRetainedGeometrySlotOptions {
  readonly quietPeriodMs?: number;
}

const DEFAULT_QUIET_PERIOD_MS = 150;

type PromotionDisposition = "release" | "discard";
type PromotionState = "open" | "release" | "discard" | "admitted" | "rejected";

interface PromotionRecord<Geometry extends object> {
  state: PromotionState;
  geometry: Geometry | null;
}

/**
 * Owns at most one renderer-local geometry for one exact presentation state.
 *
 * A changed owner synchronously releases the previous resource. The new owner
 * must remain exact for the quiet period before the caller may build anything;
 * rejected owners stay on their truthful immediate path until state changes.
 */
export function createSingleRetainedGeometrySlot<Geometry extends object>(
  releaseGeometry: (geometry: Geometry) => void,
  options: SingleRetainedGeometrySlotOptions = {},
): SingleRetainedGeometrySlot<Geometry> {
  const quietPeriodMs = options.quietPeriodMs ?? DEFAULT_QUIET_PERIOD_MS;
  if (!Number.isFinite(quietPeriodMs) || quietPeriodMs < 0) {
    throw new RangeError("Single retained geometry quiet period must be finite and nonnegative.");
  }

  let selectedOwnerKey: string | null = null;
  let selectedSinceMs = 0;
  let lastObservedMs = 0;
  let selectedRejected = false;
  let selectionGeneration = 0;
  let activePromotion: SingleRetainedGeometryPromotion | null = null;
  let residentPromotion: SingleRetainedGeometryPromotion | null = null;
  let retained: Geometry | null = null;
  let retainedVertices = 0;
  let retainedBytes = 0;
  let ownerTransitions = 0;
  let promotions = 0;
  let builds = 0;
  let releases = 0;
  let discards = 0;
  let peakLive: 0 | 1 = 0;
  const promotionRecords = new WeakMap<
    SingleRetainedGeometryPromotion,
    PromotionRecord<Geometry>
  >();
  const handledGeometries = new WeakSet<Geometry>();

  const invalidateActivePromotion = (disposition: PromotionDisposition): void => {
    if (activePromotion === null) return;
    const record = promotionRecords.get(activePromotion);
    if (record?.state === "open") record.state = disposition;
    activePromotion = null;
  };

  const clearGeometry = (disposition: PromotionDisposition): void => {
    const detached = retained;
    const detachedPromotion = residentPromotion;
    retained = null;
    residentPromotion = null;
    retainedVertices = 0;
    retainedBytes = 0;
    if (detached === null) return;
    const record = detachedPromotion === null
      ? undefined
      : promotionRecords.get(detachedPromotion);
    if (record) record.state = disposition;
    if (disposition === "release") {
      // Detach and account first so a throwing or re-entrant release cannot
      // double-own or double-free the resource.
      releases += 1;
      releaseGeometry(detached);
    } else {
      discards += 1;
    }
  };

  const resetSelection = (disposition: PromotionDisposition): void => {
    invalidateActivePromotion(disposition);
    selectedOwnerKey = null;
    selectedSinceMs = 0;
    lastObservedMs = 0;
    selectedRejected = false;
  };

  const rejectCurrentPromotion = (): void => {
    if (activePromotion === null) return;
    const record = promotionRecords.get(activePromotion);
    if (record?.state === "open") record.state = "rejected";
    activePromotion = null;
    selectedRejected = true;
  };

  const disposeRejectedGeometry = (
    geometry: Geometry,
    disposition: PromotionDisposition,
  ): void => {
    if (disposition === "discard") {
      discards += 1;
      return;
    }
    releases += 1;
    releaseGeometry(geometry);
  };

  return {
    select(ownerKey, nowMs) {
      if (ownerKey === null) {
        resetSelection("release");
        clearGeometry("release");
        return { kind: "immediate" };
      }
      if (selectedOwnerKey !== ownerKey) {
        const replacingOwner = selectedOwnerKey !== null;
        resetSelection("release");
        if (replacingOwner) ownerTransitions += 1;
        // The old resource is detached before cleanup. Establishing the new
        // selection first also makes a re-entrant cleanup fail closed rather
        // than restoring old ownership afterward.
        const validClock = Number.isFinite(nowMs) && nowMs >= 0;
        if (validClock) {
          selectedOwnerKey = ownerKey;
          selectedSinceMs = nowMs;
          lastObservedMs = nowMs;
          selectionGeneration += 1;
          if (!replacingOwner) ownerTransitions += 1;
        }
        clearGeometry("release");
        if (!validClock) {
          return { kind: "immediate" };
        }
        return { kind: "immediate" };
      }
      if (!Number.isFinite(nowMs) || nowMs < 0) {
        invalidateActivePromotion("release");
        return { kind: "immediate" };
      }
      if (nowMs < lastObservedMs) {
        selectedSinceMs = nowMs;
        lastObservedMs = nowMs;
        invalidateActivePromotion("release");
        return { kind: "immediate" };
      }
      lastObservedMs = nowMs;
      if (retained !== null) return { kind: "retained", geometry: retained };
      if (selectedRejected || nowMs - selectedSinceMs < quietPeriodMs) {
        invalidateActivePromotion("release");
        return { kind: "immediate" };
      }
      if (activePromotion === null) {
        activePromotion = Object.freeze({
          ownerKey,
          generation: selectionGeneration,
        }) as SingleRetainedGeometryPromotion;
        promotionRecords.set(activePromotion, { state: "open", geometry: null });
      }
      return { kind: "promote", permit: activePromotion };
    },
    admit(permit, geometry, vertices, bytes) {
      if (geometry === null || (typeof geometry !== "object" && typeof geometry !== "function")) {
        if (permit === activePromotion) rejectCurrentPromotion();
        return false;
      }
      if (handledGeometries.has(geometry)) {
        if (permit === activePromotion && geometry !== retained) rejectCurrentPromotion();
        return false;
      }
      handledGeometries.add(geometry);
      builds += 1;
      const record = promotionRecords.get(permit);
      const validCounts = Number.isSafeInteger(vertices)
        && vertices >= 0
        && Number.isSafeInteger(bytes)
        && bytes >= 0;
      const current = permit === activePromotion
        && record?.state === "open"
        && permit.ownerKey === selectedOwnerKey
        && retained === null
        && !selectedRejected;
      if (!current || !validCounts) {
        if (current) rejectCurrentPromotion();
        const disposition: PromotionDisposition = record?.state === "discard"
          ? "discard"
          : "release";
        if (record && record.geometry === null) record.geometry = geometry;
        disposeRejectedGeometry(geometry, disposition);
        return false;
      }
      if (!record) {
        // Kept as a defensive boundary if the permit registry is ever changed.
        disposeRejectedGeometry(geometry, "release");
        return false;
      }
      activePromotion = null;
      record.state = "admitted";
      record.geometry = geometry;
      retained = geometry;
      residentPromotion = permit;
      retainedVertices = vertices;
      retainedBytes = bytes;
      promotions += 1;
      peakLive = 1;
      return true;
    },
    reject(permit) {
      if (permit === activePromotion && retained === null) rejectCurrentPromotion();
    },
    rejectResident() {
      if (retained === null) return;
      // Commit the rejected-owner state before graphics cleanup so a throwing
      // or re-entrant release cannot re-arm this same bad resource.
      selectedRejected = true;
      clearGeometry("release");
    },
    release() {
      resetSelection("release");
      clearGeometry("release");
    },
    discard() {
      resetSelection("discard");
      clearGeometry("discard");
    },
    metrics() {
      return Object.freeze({
        ownerTransitions,
        promotions,
        builds,
        releases,
        discards,
        live: retained === null ? 0 : 1,
        peakLive,
        vertices: retainedVertices,
        bytes: retainedBytes,
      });
    },
  };
}
