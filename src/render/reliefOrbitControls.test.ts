import { describe, expect, it } from "vitest";

import {
  MAX_RELIEF_ORBIT_FRAME_MS,
  RELIEF_KEY_ORBIT_SPEED,
  RELIEF_TWIST_THRESHOLD,
  beginReliefTwist,
  heldReliefOrbitDelta,
  reliefOrbitKeyDirection,
  updateReliefTwist,
  wrapReliefOrbitRadians,
  type ReliefTouchPoint,
} from "./reliefOrbitControls";

const touch = (pointerId: number, x: number, y: number): ReliefTouchPoint => ({
  pointerId,
  x,
  y,
});

describe("held Relief orbit keys", () => {
  it("maps J left, L right, and opposed keys to no turn", () => {
    expect(reliefOrbitKeyDirection(new Set(["KeyJ"]))).toBe(-1);
    expect(reliefOrbitKeyDirection(new Set(["KeyL"]))).toBe(1);
    expect(reliefOrbitKeyDirection(new Set(["KeyJ", "KeyL"]))).toBe(0);
    expect(reliefOrbitKeyDirection(new Set())).toBe(0);
  });

  it("integrates smoothly by elapsed time and caps a resumed background frame", () => {
    expect(heldReliefOrbitDelta(new Set(["KeyL"]), 16))
      .toBeCloseTo(RELIEF_KEY_ORBIT_SPEED * 0.016, 12);
    expect(heldReliefOrbitDelta(new Set(["KeyJ"]), 16))
      .toBeCloseTo(-RELIEF_KEY_ORBIT_SPEED * 0.016, 12);
    expect(heldReliefOrbitDelta(new Set(["KeyL"]), 5_000))
      .toBeCloseTo(RELIEF_KEY_ORBIT_SPEED * MAX_RELIEF_ORBIT_FRAME_MS / 1_000, 12);
    expect(heldReliefOrbitDelta(new Set(), 16)).toBe(0);
  });
});

describe("two-finger Relief twist", () => {
  it("uses stable pointer identity and waits for intentional angular motion", () => {
    const started = beginReliefTwist([touch(8, 100, 0), touch(3, 0, 0)]);
    expect(started?.pointerIds).toEqual([3, 8]);
    if (!started) throw new Error("twist did not start");

    const quiet = updateReliefTwist(started, [
      touch(3, 0, 0),
      touch(8, Math.cos(RELIEF_TWIST_THRESHOLD / 2) * 100, Math.sin(RELIEF_TWIST_THRESHOLD / 2) * 100),
    ]);
    expect(quiet.gesture.recognized).toBe(false);
    expect(quiet.yawDelta).toBe(0);

    const recognized = updateReliefTwist(quiet.gesture, [
      touch(8, Math.cos(RELIEF_TWIST_THRESHOLD * 1.25) * 100, Math.sin(RELIEF_TWIST_THRESHOLD * 1.25) * 100),
      touch(3, 0, 0),
    ]);
    expect(recognized.justRecognized).toBe(true);
    expect(recognized.gesture.recognized).toBe(true);
    expect(recognized.yawDelta).toBeCloseTo(RELIEF_TWIST_THRESHOLD * 1.25, 10);
  });

  it("continues incrementally and crosses the -pi/pi seam on the short arc", () => {
    const nearPositivePi = beginReliefTwist([
      touch(1, 0, 0),
      touch(2, -100, 1),
    ]);
    if (!nearPositivePi) throw new Error("twist did not start");
    const primed = { ...nearPositivePi, recognized: true };
    const crossed = updateReliefTwist(primed, [
      touch(1, 0, 0),
      touch(2, -100, -1),
    ]);

    expect(crossed.yawDelta).toBeGreaterThan(0);
    expect(crossed.yawDelta).toBeLessThan(0.03);
  });

  it("does not jump if a tracked pointer disappears or the pair collapses", () => {
    const started = beginReliefTwist([touch(1, 0, 0), touch(2, 100, 0)]);
    if (!started) throw new Error("twist did not start");
    expect(updateReliefTwist(started, [touch(1, 0, 0)]).yawDelta).toBe(0);
    expect(updateReliefTwist(started, [touch(1, 2, 2), touch(2, 2, 2)]).yawDelta).toBe(0);
    expect(beginReliefTwist([touch(1, 2, 2), touch(2, 2, 2)])).toBeNull();
  });
});

describe("Relief yaw wrapping", () => {
  it("keeps equivalent turns inside one signed revolution", () => {
    expect(wrapReliefOrbitRadians(Math.PI * 5)).toBeCloseTo(Math.PI, 12);
    expect(wrapReliefOrbitRadians(-Math.PI * 5)).toBeCloseTo(-Math.PI, 12);
    expect(wrapReliefOrbitRadians(Number.NaN)).toBe(0);
  });
});
