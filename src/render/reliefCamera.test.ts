import { describe, expect, it } from "vitest";

import type { TerrainMeshBounds } from "./terrainMesh";
import {
  MAX_RELIEF_PITCH,
  MIN_RELIEF_PITCH,
  normalizeReliefCamera,
  projectReliefPoint,
  reliefBoundsVisible,
  reliefCameraPose,
  reliefFogAmount,
  screenToReliefPlane,
  type ReliefCameraState,
  type ReliefViewport,
} from "./reliefCamera";

const viewport: ReliefViewport = { width: 1_000, height: 700 };

const camera = (changes: Partial<ReliefCameraState> = {}): ReliefCameraState => ({
  target: { x: 400, y: 300 },
  targetHeight: 20,
  yaw: 0,
  pitch: Math.PI / 4,
  distance: 600,
  verticalFov: Math.PI / 3,
  near: 1,
  far: 4_000,
  ...changes,
});

const bounds = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  minZ = 0,
  maxZ = 80,
): TerrainMeshBounds => ({
  min: { x: minX, y: minY, z: minZ },
  max: { x: maxX, y: maxY, z: maxZ },
});

describe("relief camera normalization", () => {
  it("sanitizes unsafe values and wraps orbit angles", () => {
    const normalized = normalizeReliefCamera(camera({
      target: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      targetHeight: -5,
      yaw: Math.PI * 5,
      pitch: -20,
      distance: 0,
      verticalFov: 20,
      near: -3,
      far: 0,
    }));

    expect(normalized.target).toEqual({ x: 0, y: 0 });
    expect(normalized.targetHeight).toBe(0);
    expect(Math.abs(normalized.yaw)).toBeCloseTo(Math.PI, 12);
    expect(normalized.pitch).toBe(MIN_RELIEF_PITCH);
    expect(normalized.distance).toBe(8);
    expect(normalized.verticalFov).toBeLessThan(Math.PI / 2);
    expect(normalized.near).toBe(0.1);
    expect(normalized.far).toBe(1.1);

    expect(normalizeReliefCamera(camera({ pitch: 20 })).pitch).toBe(MAX_RELIEF_PITCH);
  });

  it("builds an orthonormal pose above the map target", () => {
    const pose = reliefCameraPose(camera(), viewport);
    const length = (value: { x: number; y: number; z: number }): number =>
      Math.hypot(value.x, value.y, value.z);
    const dot = (
      first: { x: number; y: number; z: number },
      second: { x: number; y: number; z: number },
    ): number => first.x * second.x + first.y * second.y + first.z * second.z;

    expect(pose.eye.y).toBeLessThan(pose.target.y);
    expect(length(pose.forward)).toBeCloseTo(1, 12);
    expect(length(pose.right)).toBeCloseTo(1, 12);
    expect(length(pose.down)).toBeCloseTo(1, 12);
    expect(dot(pose.forward, pose.right)).toBeCloseTo(0, 12);
    expect(dot(pose.forward, pose.down)).toBeCloseTo(0, 12);
    expect(dot(pose.right, pose.down)).toBeCloseTo(0, 12);
  });
});

describe("relief projection and picking", () => {
  it("projects the target to canvas center and round-trips the ground center", () => {
    const flatCamera = camera({ targetHeight: 0 });
    const projected = projectReliefPoint(flatCamera.target, 0, flatCamera, viewport);
    expect(projected).toMatchObject({ x: 500, y: 350, visible: true });

    const picked = screenToReliefPlane({ x: projected.x, y: projected.y }, 0, flatCamera, viewport);
    expect(picked?.x).toBeCloseTo(flatCamera.target.x, 9);
    expect(picked?.y).toBeCloseTo(flatCamera.target.y, 9);
  });

  it("round-trips off-center points on elevated planes while orbiting", () => {
    const orbit = camera({ yaw: 0.83, pitch: 0.68, targetHeight: 35 });
    const world = { x: 472, y: 246 };
    const projected = projectReliefPoint(world, 35, orbit, viewport);
    const picked = screenToReliefPlane(projected, 35, orbit, viewport);

    expect(projected.visible).toBe(true);
    expect(picked?.x).toBeCloseTo(world.x, 8);
    expect(picked?.y).toBeCloseTo(world.y, 8);
  });

  it("returns null when a ray cannot meet a plane in front of the camera", () => {
    const highPlane = screenToReliefPlane({ x: 500, y: 350 }, 10_000, camera(), viewport);
    expect(highPlane).toBeNull();
  });
});

describe("relief frustum and fog helpers", () => {
  it("keeps chunks around the target and rejects distant or behind-camera chunks", () => {
    expect(reliefBoundsVisible(bounds(340, 240, 460, 360), camera(), viewport)).toBe(true);
    expect(reliefBoundsVisible(bounds(8_000, 8_000, 8_200, 8_200), camera(), viewport)).toBe(false);
    // At yaw zero, a far-south chunk is behind the eye looking north.
    expect(reliefBoundsVisible(bounds(350, 1_300, 450, 1_400), camera(), viewport)).toBe(false);
  });

  it("produces a clamped monotonic smooth fog fade", () => {
    const near = reliefFogAmount(bounds(350, 250, 450, 350), camera(), viewport, 200, 900);
    const middle = reliefFogAmount(bounds(350, -150, 450, -50), camera(), viewport, 200, 900);
    const far = reliefFogAmount(bounds(350, -900, 450, -800), camera(), viewport, 200, 900);

    expect(near).toBeGreaterThanOrEqual(0);
    expect(middle).toBeGreaterThan(near);
    expect(far).toBe(1);
  });
});
