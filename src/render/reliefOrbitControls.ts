import type { WorldPoint } from "./types";

export const RELIEF_KEY_ORBIT_SPEED = Math.PI * 0.48;
export const RELIEF_TWIST_THRESHOLD = Math.PI / 36;
export const MAX_RELIEF_ORBIT_FRAME_MS = 50;

export interface ReliefTouchPoint extends WorldPoint {
  readonly pointerId: number;
}

export interface ReliefTwistGesture {
  readonly pointerIds: readonly [number, number];
  readonly lastAngle: number;
  readonly pendingRadians: number;
  readonly recognized: boolean;
}

export interface ReliefTwistUpdate {
  readonly gesture: ReliefTwistGesture;
  /** Direct-manipulation yaw change to apply for this pointer sample. */
  readonly yawDelta: number;
  readonly justRecognized: boolean;
}

/** J spins the visible map left; L spins it right. Opposed keys cancel. */
export function reliefOrbitKeyDirection(heldCodes: ReadonlySet<string>): -1 | 0 | 1 {
  const left = heldCodes.has("KeyJ");
  const right = heldCodes.has("KeyL");
  return (Number(right) - Number(left)) as -1 | 0 | 1;
}

/** Frame-rate-independent held-key orbit with a background-tab jump cap. */
export function heldReliefOrbitDelta(
  heldCodes: ReadonlySet<string>,
  elapsedMilliseconds: number,
  radiansPerSecond = RELIEF_KEY_ORBIT_SPEED,
): number {
  const direction = reliefOrbitKeyDirection(heldCodes);
  if (direction === 0) return 0;
  const elapsed = clamp(finite(elapsedMilliseconds, 0), 0, MAX_RELIEF_ORBIT_FRAME_MS);
  const speed = Math.max(0, finite(radiansPerSecond, RELIEF_KEY_ORBIT_SPEED));
  return direction * speed * elapsed / 1_000;
}

/** Keeps long-running orbit input numerically stable while preserving direction. */
export function wrapReliefOrbitRadians(angle: number): number {
  const finiteAngle = finite(angle, 0);
  const fullTurn = Math.PI * 2;
  const wrapped = ((finiteAngle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  return wrapped === -Math.PI && finiteAngle > 0 ? Math.PI : wrapped;
}

/** Starts a stable two-pointer twist, independent of incoming event order. */
export function beginReliefTwist(
  touches: readonly ReliefTouchPoint[],
): ReliefTwistGesture | null {
  if (touches.length < 2) return null;
  const ordered = [...touches]
    .filter(validTouch)
    .sort((left, right) => left.pointerId - right.pointerId);
  const first = ordered[0];
  const second = ordered[1];
  if (!first || !second || first.pointerId === second.pointerId) return null;
  const angle = pairAngle(first, second);
  if (angle === null) return null;
  return {
    pointerIds: [first.pointerId, second.pointerId],
    lastAngle: angle,
    pendingRadians: 0,
    recognized: false,
  };
}

/**
 * Advances a twist using the shortest angular arc. Motion is buffered until
 * the recognition threshold, then the complete intentional turn is emitted.
 */
export function updateReliefTwist(
  gesture: ReliefTwistGesture,
  touches: readonly ReliefTouchPoint[],
  threshold = RELIEF_TWIST_THRESHOLD,
): ReliefTwistUpdate {
  const first = touches.find((touch) => touch.pointerId === gesture.pointerIds[0]);
  const second = touches.find((touch) => touch.pointerId === gesture.pointerIds[1]);
  if (!first || !second || !validTouch(first) || !validTouch(second)) {
    return { gesture, yawDelta: 0, justRecognized: false };
  }
  const angle = pairAngle(first, second);
  if (angle === null) return { gesture, yawDelta: 0, justRecognized: false };

  const incremental = wrapReliefOrbitRadians(angle - gesture.lastAngle);
  if (gesture.recognized) {
    return {
      gesture: { ...gesture, lastAngle: angle },
      yawDelta: incremental,
      justRecognized: false,
    };
  }

  const pendingRadians = gesture.pendingRadians + incremental;
  const recognized = Math.abs(pendingRadians) >= Math.max(0, finite(threshold, RELIEF_TWIST_THRESHOLD));
  return {
    gesture: {
      ...gesture,
      lastAngle: angle,
      pendingRadians: recognized ? 0 : pendingRadians,
      recognized,
    },
    yawDelta: recognized ? pendingRadians : 0,
    justRecognized: recognized,
  };
}

function pairAngle(first: ReliefTouchPoint, second: ReliefTouchPoint): number | null {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  if (Math.hypot(dx, dy) < 1) return null;
  return Math.atan2(dy, dx);
}

function validTouch(touch: ReliefTouchPoint): boolean {
  return Number.isFinite(touch.pointerId)
    && Number.isFinite(touch.x)
    && Number.isFinite(touch.y);
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
