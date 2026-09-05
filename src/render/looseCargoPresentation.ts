import {
  LOOSE_CARGO_MAX_ENTITIES,
  LOOSE_CARGO_TILE_UNITS,
  looseCargoPayloadProperty,
  validateLooseCargoWorld,
  type LooseCargoOwner,
} from "../game/looseCargo";
import {
  CRAFTED_GEAR_DEFINITIONS,
  CRAFTING_STACK_DEFINITIONS,
} from "../game/crafting";
import { PROVISION_DEFINITIONS } from "../game/provisions";

import type {
  CargoProperty,
  LooseCargoConditionBandView,
  LooseCargoView,
  RendererCommand,
  WorldPoint,
} from "./types";

export const LOOSE_CARGO_MOBILE_HIT_DIAMETER_PX = 44;
export const LOOSE_CARGO_MOBILE_HIT_RADIUS_PX = LOOSE_CARGO_MOBILE_HIT_DIAMETER_PX / 2;
export const LOOSE_CARGO_FINE_HIT_RADIUS_PX = 11;
export const LOOSE_CARGO_RENDER_RADIUS_TILES = 32;

const CONDITION_MAX = 1_000_000;
const MAX_VIEW_ID_LENGTH = 240;

const PROMISE_RESOURCE_LABELS = {
  food: "Food",
  freshWater: "Fresh water",
  reed: "Reed",
  medicine: "Medicine",
  parts: "Parts",
} as const;

export interface LooseCargoProjectionOptions {
  /** Terrain-grid origin in renderer world units. */
  readonly worldOrigin: WorldPoint;
  /** Renderer world units represented by one fixed-point parcel tile. */
  readonly worldUnitsPerTile: number;
  readonly viewerOwner: LooseCargoOwner;
  /** Optional player-centered visual interest radius. Simulation/save state is never culled. */
  readonly renderDistance?: number;
  /** Active Promise parcels remain projected beyond ordinary visual culling for recovery. */
  readonly focusedPromiseContractId?: number | null;
  readonly player?: {
    readonly region: { readonly x: number; readonly y: number };
    readonly position: WorldPoint;
    /** Manhattan reach in renderer world units, matching kernel pickup quotes. */
    readonly recoveryReach: number;
  };
}

export interface LooseCargoVisualPresentation {
  readonly fill: string;
  readonly outline: string;
  readonly accent: string;
  readonly silhouette: "bundle" | "crate" | "case" | "sealed-case";
  readonly conditionMark: "none" | "slash" | "crack" | "cross";
  readonly motionMark: "still" | "wake" | "tumble" | "caught" | "boundary";
  readonly snagMark: "none" | "roots" | "thorns";
  readonly wetMark: boolean;
  readonly contaminationMarks: 0 | 1 | 2 | 3;
  readonly wake: WorldPoint;
  /** Stable presentation variation, never used as simulation identity. */
  readonly orientationRadians: number;
}

export interface LooseCargoScreenHit {
  readonly parcel: LooseCargoView;
  readonly screenPoint: WorldPoint;
  readonly distanceSquared: number;
}

export type LooseCargoScreenProjector = (parcel: LooseCargoView) => WorldPoint | null;

export interface LooseCargoPointerPress {
  readonly pointerId: number;
  readonly parcelId: string;
  readonly start: WorldPoint;
  readonly maximumTravelPixels: number;
  readonly modeKey: string;
}

export interface LooseCargoTouchSequence {
  readonly activePointerIds: readonly number[];
  /** Latched until every finger in the sequence has ended. */
  readonly suppressed: boolean;
}

export const EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE: LooseCargoTouchSequence = Object.freeze({
  activePointerIds: Object.freeze([]),
  suppressed: false,
});

export type LooseCargoTargetCommand = Extract<RendererCommand, { readonly type: "parcel-target" }>;

export interface LooseCargoPointerCaptureTarget {
  readonly hasPointerCapture: (pointerId: number) => boolean;
  readonly releasePointerCapture: (pointerId: number) => void;
}

export type LooseCargoPointerRelease =
  | { readonly consumesWorldTap: false; readonly command: null }
  | { readonly consumesWorldTap: true; readonly command: LooseCargoTargetCommand | null };

/**
 * Projects one validated physical-custody partition. The caller composes every
 * partition intersecting its bounded view; signed ownership and persistent IDs
 * remain unchanged when a parcel crosses an invisible storage boundary.
 */
export function projectLooseCargoWorld(
  world: unknown,
  options: LooseCargoProjectionOptions,
): readonly LooseCargoView[] {
  const validation = validateLooseCargoWorld(world);
  if (!validation.valid || validation.state === null || !validProjectionOptions(options)) return [];
  const state = validation.state;
  const scale = options.worldUnitsPerTile / LOOSE_CARGO_TILE_UNITS;
  const player = options.player;
  const views: LooseCargoView[] = [];
  for (const entity of state.entities) {
    const position = {
      x: options.worldOrigin.x + entity.x * scale,
      y: options.worldOrigin.y + entity.y * scale,
    };
    const velocity = {
      x: entity.velocityX * scale,
      y: entity.velocityY * scale,
    };
    if (!finitePoint(position) || !finitePoint(velocity)) return [];
    const isFocusedPromise = entity.payload.kind === "promise"
      && entity.payload.contractId === options.focusedPromiseContractId;
    if (
      player
      && options.renderDistance !== undefined
      && sameRegion(state.region, player.region)
      && squaredDistance(position, player.position) > options.renderDistance ** 2
      && !isFocusedPromise
    ) continue;
    const recoverable = entity.owner.kind === "unclaimed"
      || sameOwner(entity.owner, options.viewerOwner);
    const reachable = Boolean(
      recoverable
      && player
      && sameRegion(state.region, player.region)
      && manhattan(position, player.position) <= player.recoveryReach,
    );
    const condition = fixedUnit(entity.materialState.condition);
    const contamination = fixedUnit(entity.materialState.contamination);
    const decay = fixedUnit(entity.materialState.decay);
    const causes = entity.causalSignature.split("|", 1)[0]?.split(",") ?? [];
    const wetness = causes.includes("water-immersion")
      ? 1
      : causes.includes("rain-soak") ? 0.55 : 0;
    const publicPayload = payloadPresentation(entity.payload);
    views.push(Object.freeze({
      id: entity.id,
      region: Object.freeze({ ...state.region }),
      position: Object.freeze(position),
      velocity: Object.freeze(velocity),
      ...publicPayload,
      condition,
      conditionBand: conditionBand(condition),
      wetness,
      contamination,
      decay,
      motion: entity.motion,
      snaggedBy: entity.snaggedBy,
      impactMark: impactMark(entity.causalSignature),
      ...(entity.payload.kind === "promise"
        ? { promiseContractId: entity.payload.contractId }
        : {}),
      recoverable,
      recovery: !recoverable ? "unavailable" : reachable ? "reachable" : "approach",
    }));
  }
  return Object.freeze(views);
}

/** Fail-closed view validation at the renderer boundary. */
export function safeLooseCargoViews(value: unknown): readonly LooseCargoView[] {
  if (!Array.isArray(value) || value.length > LOOSE_CARGO_MAX_ENTITIES) return [];
  const ids = new Set<string>();
  for (const candidate of value as readonly unknown[]) {
    if (!validLooseCargoView(candidate) || ids.has(candidate.id)) return [];
    ids.add(candidate.id);
  }
  return value as readonly LooseCargoView[];
}

/** Shared semantic styling consumed by both Chart 2D and Relief 3D. */
export function looseCargoVisual(parcel: LooseCargoView): LooseCargoVisualPresentation {
  const palette = conditionPalette(parcel.conditionBand);
  const magnitude = Math.hypot(parcel.velocity.x, parcel.velocity.y);
  const wake = magnitude > 0
    ? { x: parcel.velocity.x / magnitude, y: parcel.velocity.y / magnitude }
    : { x: 0, y: 0 };
  return {
    ...palette,
    silhouette: parcel.contentKind === "promise"
      ? "sealed-case"
      : parcel.contentKind === "gear"
        ? "case"
        : parcel.contentKind === "component" ? "crate" : "bundle",
    conditionMark: parcel.conditionBand === "sound"
      ? "none"
      : parcel.conditionBand === "worn"
        ? "slash"
        : parcel.conditionBand === "damaged" ? "crack" : "cross",
    motionMark: parcel.motion === "drifting"
      ? "wake"
      : parcel.motion === "tumbling"
        ? "tumble"
        : parcel.motion === "snagged"
          ? "caught"
          : parcel.motion === "boundary-rest" ? "boundary" : "still",
    snagMark: parcel.snaggedBy === "mangrove"
      ? "roots"
      : parcel.snaggedBy === "bramble" ? "thorns" : "none",
    wetMark: parcel.wetness > 0,
    contaminationMarks: contaminationBand(parcel.contamination),
    wake,
    orientationRadians: stableAngle(parcel.id),
  };
}

export function looseCargoHitRadiusPixels(
  coarsePointer: boolean,
  visibleRadiusPixels: number,
): number {
  if (!Number.isFinite(visibleRadiusPixels) || visibleRadiusPixels < 0) {
    return coarsePointer ? LOOSE_CARGO_MOBILE_HIT_RADIUS_PX : LOOSE_CARGO_FINE_HIT_RADIUS_PX;
  }
  return Math.max(
    coarsePointer ? LOOSE_CARGO_MOBILE_HIT_RADIUS_PX : LOOSE_CARGO_FINE_HIT_RADIUS_PX,
    visibleRadiusPixels,
  );
}

/** Stable screen-space hit testing; duplicate or malformed views fail closed. */
export function hitTestLooseCargoScreen(
  parcels: readonly LooseCargoView[],
  point: WorldPoint,
  radiusPixels: number,
  project: LooseCargoScreenProjector,
): LooseCargoScreenHit | null {
  const safe = safeLooseCargoViews(parcels);
  if (safe.length !== parcels.length || !finitePoint(point)
    || !Number.isFinite(radiusPixels) || radiusPixels <= 0) return null;
  const radiusSquared = radiusPixels * radiusPixels;
  let nearest: LooseCargoScreenHit | null = null;
  for (const parcel of safe) {
    if (!parcel.recoverable) continue;
    let screenPoint: WorldPoint | null;
    try {
      screenPoint = project(parcel);
    } catch {
      return null;
    }
    if (!screenPoint || !finitePoint(screenPoint)) continue;
    const distanceSquared = squaredDistance(point, screenPoint);
    if (distanceSquared > radiusSquared) continue;
    if (nearest === null
      || distanceSquared < nearest.distanceSquared
      || (distanceSquared === nearest.distanceSquared && parcel.id < nearest.parcel.id)) {
      nearest = { parcel, screenPoint, distanceSquared };
    }
  }
  return nearest;
}

/** Desktop E helper. The caller supplies an explicit world-space recovery radius. */
export function nearestRecoverableLooseCargo(
  parcels: readonly LooseCargoView[],
  point: WorldPoint,
  radius: number,
): LooseCargoView | null {
  const safe = safeLooseCargoViews(parcels);
  if (safe.length !== parcels.length || !finitePoint(point)
    || !Number.isFinite(radius) || radius <= 0) return null;
  const radiusSquared = radius * radius;
  let nearest: { readonly parcel: LooseCargoView; readonly distanceSquared: number } | null = null;
  for (const parcel of safe) {
    if (!parcel.recoverable) continue;
    const distanceSquared = squaredDistance(point, parcel.position);
    if (distanceSquared > radiusSquared) continue;
    if (nearest === null
      || distanceSquared < nearest.distanceSquared
      || (distanceSquared === nearest.distanceSquared && parcel.id < nearest.parcel.id)) {
      nearest = { parcel, distanceSquared };
    }
  }
  return nearest?.parcel ?? null;
}

/** Keyboard recovery is immediate-only; unlike touch it never autoroutes. */
export function keyboardLooseCargoRecoveryCommand(
  parcel: LooseCargoView | null,
): LooseCargoTargetCommand | null {
  return parcel?.recoverable && parcel.recovery === "reachable"
    ? Object.freeze({
        type: "parcel-target",
        parcelId: parcel.id,
        recoverOnArrival: false,
      })
    : null;
}

/** Best-effort release used before a renderer hides or destroys its canvas. */
export function releaseLooseCargoPointerCaptures(
  target: LooseCargoPointerCaptureTarget | null,
  pointerIds: readonly number[],
): void {
  if (!target) return;
  const visited = new Set<number>();
  for (const pointerId of pointerIds) {
    if (!Number.isSafeInteger(pointerId) || visited.has(pointerId)) continue;
    visited.add(pointerId);
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    } catch {
      // A detached canvas may reject one release. Continue releasing the rest.
    }
  }
}

export function beginLooseCargoPointerPress(
  pointerId: number,
  point: WorldPoint,
  parcels: readonly LooseCargoView[],
  radiusPixels: number,
  maximumTravelPixels: number,
  project: LooseCargoScreenProjector,
  modeKey: string,
): LooseCargoPointerPress | null {
  if (!Number.isSafeInteger(pointerId)
    || !Number.isFinite(maximumTravelPixels)
    || maximumTravelPixels < 0
    || !validModeKey(modeKey)) return null;
  const hit = hitTestLooseCargoScreen(parcels, point, radiusPixels, project);
  return hit ? Object.freeze({
    pointerId,
    parcelId: hit.parcel.id,
    start: { ...point },
    maximumTravelPixels,
    modeKey,
  }) : null;
}

/** Cancels a press after deliberate pointer travel, while ignoring other fingers. */
export function moveLooseCargoPointerPress(
  press: LooseCargoPointerPress | null,
  pointerId: number,
  point: WorldPoint,
): LooseCargoPointerPress | null {
  if (!press || press.pointerId !== pointerId) return press;
  if (!finitePoint(point)) return null;
  return squaredDistance(press.start, point) > press.maximumTravelPixels * press.maximumTravelPixels
    ? null
    : press;
}

/**
 * Completes only the same stable ID pressed down. Projection is rerun against
 * the release-frame views, so moving parcels cannot be selected at stale points.
 */
export function completeLooseCargoPointerPress(
  press: LooseCargoPointerPress | null,
  pointerId: number,
  point: WorldPoint,
  parcels: readonly LooseCargoView[],
  radiusPixels: number,
  project: LooseCargoScreenProjector,
  modeKey: string,
): string | null {
  if (!press || press.pointerId !== pointerId || press.modeKey !== modeKey) return null;
  const safe = safeLooseCargoViews(parcels);
  if (safe.length !== parcels.length || !finitePoint(point)
    || !Number.isFinite(radiusPixels) || radiusPixels <= 0) return null;
  if (squaredDistance(press.start, point) > press.maximumTravelPixels * press.maximumTravelPixels) {
    return null;
  }
  const current = safe.find((parcel) => parcel.id === press.parcelId);
  if (!current?.recoverable) return null;
  // Resolve the pressed stable identity through the release-frame projection.
  // The parcel may have drifted away from a still finger; user travel is
  // independently canceled by moveLooseCargoPointerPress. Never retarget to a
  // different parcel that happened to move under the release point.
  try {
    const currentScreenPoint = project(current);
    return currentScreenPoint && finitePoint(currentScreenPoint) ? current.id : null;
  } catch {
    return null;
  }
}

/**
 * Parcel presses outrank settlements, resources, routes, and empty-world
 * movement. Even if that exact parcel disappears before release, consume the
 * gesture instead of leaking it through as an unrelated world command.
 */
export function resolveLooseCargoPointerRelease(
  press: LooseCargoPointerPress | null,
  pointerId: number,
  point: WorldPoint,
  parcels: readonly LooseCargoView[],
  radiusPixels: number,
  project: LooseCargoScreenProjector,
  modeKey: string,
  recoverOnArrival: boolean,
): LooseCargoPointerRelease {
  if (!press || press.pointerId !== pointerId || press.modeKey !== modeKey) {
    return { consumesWorldTap: false, command: null };
  }
  const parcelId = completeLooseCargoPointerPress(
    press,
    pointerId,
    point,
    parcels,
    radiusPixels,
    project,
    modeKey,
  );
  return {
    consumesWorldTap: true,
    command: parcelId
      ? { type: "parcel-target", parcelId, recoverOnArrival }
      : null,
  };
}

/** Used by pointercancel, lostpointercapture, blur, and renderer-mode switches. */
export function cancelLooseCargoPointerPress(
  press: LooseCargoPointerPress | null,
  pointerId?: number,
): null | LooseCargoPointerPress {
  return pointerId === undefined || press?.pointerId === pointerId ? null : press;
}

export function beginLooseCargoTouch(
  sequence: LooseCargoTouchSequence,
  pointerId: number,
): LooseCargoTouchSequence {
  if (!Number.isSafeInteger(pointerId)) {
    return Object.freeze({ activePointerIds: sequence.activePointerIds, suppressed: true });
  }
  if (sequence.activePointerIds.includes(pointerId)) return sequence;
  const activePointerIds = Object.freeze([...sequence.activePointerIds, pointerId].sort((a, b) => a - b));
  return Object.freeze({
    activePointerIds,
    suppressed: sequence.suppressed || activePointerIds.length > 1,
  });
}

export function endLooseCargoTouch(
  sequence: LooseCargoTouchSequence,
  pointerId: number,
): LooseCargoTouchSequence {
  const activePointerIds = Object.freeze(
    sequence.activePointerIds.filter((candidate) => candidate !== pointerId),
  );
  return activePointerIds.length === 0
    ? EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE
    : Object.freeze({ activePointerIds, suppressed: sequence.suppressed });
}

export function looseCargoTouchCanDispatch(
  sequence: LooseCargoTouchSequence,
  pointerId: number,
): boolean {
  return !sequence.suppressed
    && sequence.activePointerIds.length === 1
    && sequence.activePointerIds[0] === pointerId;
}

export function looseCargoRecoveryLabel(parcel: LooseCargoView, coarsePointer: boolean): string {
  const quantity = parcel.quantity > 1 ? ` ×${parcel.quantity}` : "";
  const action = !parcel.recoverable
    ? "CLAIMED"
    : parcel.recovery === "reachable"
      ? coarsePointer ? "TAP TO RECOVER" : "E RECOVER"
      : coarsePointer ? "TAP TO APPROACH" : "APPROACH TO RECOVER";
  return `${parcel.resourceLabel}${quantity} · ${action}`;
}

function payloadPresentation(payload: Parameters<typeof payloadKind>[0]): {
  readonly contentKind: LooseCargoView["contentKind"];
  readonly resourceKind: string;
  readonly resourceLabel: string;
  readonly quantity: number;
  readonly property: CargoProperty;
} {
  const kind = payloadKind(payload);
  if (payload.kind === "stack") {
    const definition = CRAFTING_STACK_DEFINITIONS[payload.item];
    return {
      contentKind: kind,
      resourceKind: payload.item,
      resourceLabel: definition.label,
      quantity: payload.quantity,
      property: looseCargoPayloadProperty(payload),
    };
  }
  if (payload.kind === "gear") {
    const definition = CRAFTED_GEAR_DEFINITIONS[payload.gearKind];
    return {
      contentKind: kind,
      resourceKind: payload.gearKind,
      resourceLabel: definition.label,
      quantity: 1,
      property: looseCargoPayloadProperty(payload),
    };
  }
  if (payload.kind === "provision") {
    const definition = PROVISION_DEFINITIONS[payload.provision];
    return {
      contentKind: kind,
      resourceKind: payload.provision,
      resourceLabel: definition.label,
      quantity: payload.quantity,
      property: looseCargoPayloadProperty(payload),
    };
  }
  return {
    contentKind: kind,
    resourceKind: payload.resource,
    resourceLabel: `${PROMISE_RESOURCE_LABELS[payload.resource]} Promise cargo`,
    quantity: payload.quantity,
    property: payload.property,
  };
}

type KernelPayload = import("../game/looseCargo").LooseCargoPayload;

function payloadKind(payload: KernelPayload): LooseCargoView["contentKind"] {
  if (payload.kind === "promise") return "promise";
  if (payload.kind === "gear") return "gear";
  if (payload.kind === "provision") return "provision";
  return CRAFTING_STACK_DEFINITIONS[payload.item].tier === "raw" ? "raw-material" : "component";
}

function conditionBand(condition: number): LooseCargoConditionBandView {
  return condition <= 0 ? "ruined" : condition < 0.34 ? "damaged" : condition < 0.72 ? "worn" : "sound";
}

function conditionPalette(band: LooseCargoConditionBandView): Pick<
LooseCargoVisualPresentation,
"fill" | "outline" | "accent"
> {
  switch (band) {
    case "sound": return { fill: "#62dfc2", outline: "#e4fff3", accent: "#74bad0" };
    case "worn": return { fill: "#d8ac62", outline: "#fff1c7", accent: "#6eaec7" };
    case "damaged": return { fill: "#c66e5e", outline: "#ffe0d1", accent: "#5c94ad" };
    case "ruined": return { fill: "#5a6260", outline: "#e7e5d8", accent: "#456e7d" };
  }
}

function contaminationBand(value: number): 0 | 1 | 2 | 3 {
  return value <= 0 ? 0 : value < 0.34 ? 1 : value < 0.67 ? 2 : 3;
}

function impactMark(signature: string): LooseCargoView["impactMark"] {
  const causes = signature.split("|", 1)[0]?.split(",") ?? [];
  if (causes.includes("rock-impact")) return "rock";
  if (causes.includes("region-boundary-rest")) return "boundary";
  const bandText = signature.split("|impact:")[1];
  return Number(bandText) > 0 ? "other" : "none";
}

function validProjectionOptions(options: LooseCargoProjectionOptions): boolean {
  return finitePoint(options.worldOrigin)
    && Number.isFinite(options.worldUnitsPerTile)
    && options.worldUnitsPerTile > 0
    && (options.renderDistance === undefined
      || (Number.isFinite(options.renderDistance) && options.renderDistance > 0))
    && (options.focusedPromiseContractId === undefined
      || options.focusedPromiseContractId === null
      || (Number.isSafeInteger(options.focusedPromiseContractId)
        && options.focusedPromiseContractId > 0))
    && validOwner(options.viewerOwner)
    && (options.player === undefined || (
      validRegion(options.player.region)
      && finitePoint(options.player.position)
      && Number.isFinite(options.player.recoveryReach)
      && options.player.recoveryReach >= 0
    ));
}

function validLooseCargoView(value: unknown): value is LooseCargoView {
  if (!isRecord(value)
    || typeof value.id !== "string" || value.id.length === 0 || value.id.length > MAX_VIEW_ID_LENGTH
    || !validRegion(value.region)
    || !finitePoint(value.position)
    || !finitePoint(value.velocity)
    || !["raw-material", "component", "gear", "promise", "provision"].includes(value.contentKind as string)
    || typeof value.resourceKind !== "string" || value.resourceKind.length === 0
    || typeof value.resourceLabel !== "string" || value.resourceLabel.length === 0
    || typeof value.quantity !== "number" || !Number.isSafeInteger(value.quantity) || value.quantity <= 0
    || !["ordinary", "heavy", "fragile", "perishable", "confidential"].includes(value.property as string)
    || !fixedPresentationUnit(value.condition)
    || !["sound", "worn", "damaged", "ruined"].includes(value.conditionBand as string)
    || !fixedPresentationUnit(value.wetness)
    || !fixedPresentationUnit(value.contamination)
    || !fixedPresentationUnit(value.decay)
    || !["resting", "drifting", "tumbling", "snagged", "boundary-rest"].includes(value.motion as string)
    || (value.snaggedBy !== null && value.snaggedBy !== "mangrove" && value.snaggedBy !== "bramble")
    || !["none", "rock", "boundary", "other"].includes(value.impactMark as string)
    || typeof value.recoverable !== "boolean"
    || !["unavailable", "approach", "reachable"].includes(value.recovery as string)
    || (value.promiseContractId !== undefined
      && (typeof value.promiseContractId !== "number"
        || !Number.isSafeInteger(value.promiseContractId)
        || value.promiseContractId <= 0))) return false;
  return value.recoverable ? value.recovery !== "unavailable" : value.recovery === "unavailable";
}

function validOwner(value: unknown): value is LooseCargoOwner {
  if (!isRecord(value)) return false;
  if (value.kind === "unclaimed") return true;
  if (value.kind === "player" || value.kind === "actor") {
    return typeof value.id === "string" && value.id.length > 0;
  }
  return value.kind === "settlement" && Number.isSafeInteger(value.id) && (value.id as number) > 0;
}

function sameOwner(left: LooseCargoOwner, right: LooseCargoOwner): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "unclaimed" || right.kind === "unclaimed") return true;
  return left.id === right.id;
}

function validRegion(value: unknown): value is { readonly x: number; readonly y: number } {
  return isRecord(value) && Number.isSafeInteger(value.x) && Number.isSafeInteger(value.y);
}

function sameRegion(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): boolean {
  return left.x === right.x && left.y === right.y;
}

function fixedUnit(value: number): number {
  return Math.max(0, Math.min(1, value / CONDITION_MAX));
}

function fixedPresentationUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function finitePoint(value: unknown): value is WorldPoint {
  return isRecord(value)
    && typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y);
}

function validModeKey(value: string): boolean {
  return value.length > 0 && value.length <= 64;
}

function manhattan(left: WorldPoint, right: WorldPoint): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function squaredDistance(left: WorldPoint, right: WorldPoint): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function stableAngle(id: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) / 4_294_967_295) * Math.PI * 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
