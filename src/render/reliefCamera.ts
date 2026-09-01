import type { TerrainMeshBounds } from "./terrainMesh";
import { discoveredReliefSurfaceHeightAt } from "./reliefTerrain";
import type { TerrainGridView, WorldPoint } from "./types";

export interface ReliefVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ReliefViewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Camera coordinates keep map x/y on the ground plane and express height as a
 * positive distance above it. `yaw = 0` observes the world from map south.
 */
export interface ReliefCameraState {
  readonly target: WorldPoint;
  readonly targetHeight: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly verticalFov: number;
  readonly near: number;
  readonly far: number;
}

export interface ReliefCameraPose {
  readonly eye: ReliefVector3;
  readonly target: ReliefVector3;
  readonly forward: ReliefVector3;
  readonly right: ReliefVector3;
  /** The direction that points toward the bottom of the canvas. */
  readonly down: ReliefVector3;
  readonly verticalFov: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
}

export interface ReliefProjection {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly visible: boolean;
}

export const MIN_RELIEF_PITCH = Math.PI * 0.12;
export const MAX_RELIEF_PITCH = Math.PI * 0.43;
export const MIN_RELIEF_FOV = Math.PI / 9;
export const MAX_RELIEF_FOV = Math.PI * 0.48;

const EPSILON = 1e-7;

/** Converts map x/y plus a positive elevation to p5 WEBGL coordinates. */
export function reliefWorldPoint(point: WorldPoint, height = 0): ReliefVector3 {
  return {
    x: finite(point.x, 0),
    y: -Math.max(0, finite(height, 0)),
    z: finite(point.y, 0),
  };
}

export function normalizeReliefCamera(state: ReliefCameraState): ReliefCameraState {
  const near = Math.max(0.1, finite(state.near, 1));
  return {
    target: {
      x: finite(state.target.x, 0),
      y: finite(state.target.y, 0),
    },
    targetHeight: Math.max(0, finite(state.targetHeight, 0)),
    yaw: wrapAngle(finite(state.yaw, 0)),
    pitch: clamp(finite(state.pitch, Math.PI / 4), MIN_RELIEF_PITCH, MAX_RELIEF_PITCH),
    distance: Math.max(8, finite(state.distance, 600)),
    verticalFov: clamp(finite(state.verticalFov, Math.PI / 3), MIN_RELIEF_FOV, MAX_RELIEF_FOV),
    near,
    far: Math.max(near + 1, finite(state.far, 8_000)),
  };
}

/**
 * Rotates canvas-relative travel into map coordinates. Positive input x is
 * screen-right and positive input y is screen-down, matching WASD/arrows at
 * yaw zero; orbiting the camera rotates that basis with the visible world.
 * The result snaps to the simulation's eight travel headings, with an octant
 * dead zone that prevents Relief's slight default orbit from turning W into
 * an accidental diagonal.
 */
export function cameraRelativeReliefMovement(
  movement: WorldPoint,
  yaw: number,
): WorldPoint {
  let inputX = clamp(finite(movement.x, 0), -1, 1);
  let inputY = clamp(finite(movement.y, 0), -1, 1);
  const magnitude = Math.hypot(inputX, inputY);
  if (magnitude > 1) {
    inputX /= magnitude;
    inputY /= magnitude;
  }
  const angle = finite(yaw, 0);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  let worldX = snapTravelAxis(inputX * cosine + inputY * sine);
  let worldY = snapTravelAxis(-inputX * sine + inputY * cosine);
  if (worldX !== 0 && worldY !== 0) {
    worldX *= Math.SQRT1_2;
    worldY *= Math.SQRT1_2;
  }
  return {
    x: worldX,
    y: worldY,
  };
}

export function reliefCameraPose(
  state: ReliefCameraState,
  viewport: ReliefViewport,
): ReliefCameraPose {
  const camera = normalizeReliefCamera(state);
  const horizontalDistance = Math.cos(camera.pitch) * camera.distance;
  const target = reliefWorldPoint(camera.target, camera.targetHeight);
  const eye = {
    x: target.x + Math.sin(camera.yaw) * horizontalDistance,
    y: target.y - Math.sin(camera.pitch) * camera.distance,
    z: target.z + Math.cos(camera.yaw) * horizontalDistance,
  };
  const forward = normalize(subtract(target, eye), { x: 0, y: 0, z: -1 });
  // p5's positive y points toward the bottom of its canvas. Keeping that as
  // the camera-up argument makes negative world y (terrain elevation) rise.
  const downHint = { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, downHint), { x: 1, y: 0, z: 0 });
  const down = normalize(cross(right, forward), downHint);

  return {
    eye,
    target,
    forward,
    right,
    down,
    verticalFov: camera.verticalFov,
    aspect: safeViewport(viewport).width / safeViewport(viewport).height,
    near: camera.near,
    far: camera.far,
  };
}

export function projectReliefPoint(
  point: WorldPoint,
  height: number,
  camera: ReliefCameraState,
  viewport: ReliefViewport,
): ReliefProjection {
  const safe = safeViewport(viewport);
  const pose = reliefCameraPose(camera, safe);
  const relative = subtract(reliefWorldPoint(point, height), pose.eye);
  const depth = dot(relative, pose.forward);
  if (depth <= EPSILON) {
    return { x: safe.width / 2, y: safe.height / 2, depth, visible: false };
  }

  const focalLength = safe.height / (2 * Math.tan(pose.verticalFov / 2));
  const x = safe.width / 2 + (dot(relative, pose.right) / depth) * focalLength;
  const y = safe.height / 2 + (dot(relative, pose.down) / depth) * focalLength;
  return {
    x,
    y,
    depth,
    visible: depth >= pose.near
      && depth <= pose.far
      && x >= 0
      && x <= safe.width
      && y >= 0
      && y <= safe.height,
  };
}

/**
 * Casts a canvas-space ray onto a horizontal map plane. `planeHeight` uses the
 * same positive-up units as terrain mesh elevation.
 */
export function screenToReliefPlane(
  screen: WorldPoint,
  planeHeight: number,
  camera: ReliefCameraState,
  viewport: ReliefViewport,
): WorldPoint | null {
  const safe = safeViewport(viewport);
  const pose = reliefCameraPose(camera, safe);
  const focalLength = safe.height / (2 * Math.tan(pose.verticalFov / 2));
  const horizontal = (finite(screen.x, safe.width / 2) - safe.width / 2) / focalLength;
  const vertical = (finite(screen.y, safe.height / 2) - safe.height / 2) / focalLength;
  const direction = normalize(add(
    pose.forward,
    add(scale(pose.right, horizontal), scale(pose.down, vertical)),
  ), pose.forward);
  const targetY = -Math.max(0, finite(planeHeight, 0));
  if (Math.abs(direction.y) <= EPSILON) return null;
  const amount = (targetY - pose.eye.y) / direction.y;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    x: pose.eye.x + direction.x * amount,
    y: pose.eye.z + direction.z * amount,
  };
}

/**
 * Iteratively casts onto Relief's discovery-masked surface. Because the
 * sampler never reads an uncharted height, cursor movement and click targets
 * cannot disclose hidden ridges or water through parallax.
 */
export function screenToDiscoveredReliefSurface(
  screen: WorldPoint,
  grid: TerrainGridView,
  verticalScale: number,
  camera: ReliefCameraState,
  viewport: ReliefViewport,
): WorldPoint | null {
  const normalized = normalizeReliefCamera(camera);
  let point = screenToReliefPlane(screen, normalized.targetHeight, normalized, viewport)
    ?? screenToReliefPlane(screen, 0, normalized, viewport);
  if (!point) return null;
  for (let pass = 0; pass < 2; pass += 1) {
    const height = discoveredReliefSurfaceHeightAt(grid, point, verticalScale, true);
    point = screenToReliefPlane(screen, height, normalized, viewport) ?? point;
  }
  return point;
}

/** Conservative sphere/frustum test for independently renderable mesh chunks. */
export function reliefBoundsVisible(
  bounds: TerrainMeshBounds,
  camera: ReliefCameraState,
  viewport: ReliefViewport,
  margin = 0,
): boolean {
  const safe = safeViewport(viewport);
  const pose = reliefCameraPose(camera, safe);
  const center = reliefWorldPoint(
    {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
    },
    (bounds.min.z + bounds.max.z) / 2,
  );
  const radius = Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ) / 2 + Math.max(0, finite(margin, 0));
  const relative = subtract(center, pose.eye);
  const depth = dot(relative, pose.forward);
  if (depth + radius < pose.near || depth - radius > pose.far) return false;

  const halfHeight = Math.max(0, depth) * Math.tan(pose.verticalFov / 2);
  const halfWidth = halfHeight * pose.aspect;
  return Math.abs(dot(relative, pose.right)) <= halfWidth + radius
    && Math.abs(dot(relative, pose.down)) <= halfHeight + radius;
}

/** Smooth distance fade used as a cheap, shader-free estuary fog. */
export function reliefFogAmount(
  bounds: TerrainMeshBounds,
  camera: ReliefCameraState,
  viewport: ReliefViewport,
  start: number,
  end: number,
): number {
  const pose = reliefCameraPose(camera, viewport);
  const center = reliefWorldPoint({
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  }, (bounds.min.z + bounds.max.z) / 2);
  const depth = dot(subtract(center, pose.eye), pose.forward);
  const low = finite(start, 0);
  const high = Math.max(low + EPSILON, finite(end, low + 1));
  const amount = clamp((depth - low) / (high - low), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function safeViewport(viewport: ReliefViewport): ReliefViewport {
  return {
    width: Math.max(1, finite(viewport.width, 1)),
    height: Math.max(1, finite(viewport.height, 1)),
  };
}

function wrapAngle(value: number): number {
  const turn = Math.PI * 2;
  const wrapped = value % turn;
  return wrapped < -Math.PI ? wrapped + turn : wrapped > Math.PI ? wrapped - turn : wrapped;
}

function add(a: ReliefVector3, b: ReliefVector3): ReliefVector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: ReliefVector3, b: ReliefVector3): ReliefVector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: ReliefVector3, amount: number): ReliefVector3 {
  return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

function dot(a: ReliefVector3, b: ReliefVector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: ReliefVector3, b: ReliefVector3): ReliefVector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(value: ReliefVector3, fallback: ReliefVector3): ReliefVector3 {
  const length = Math.hypot(value.x, value.y, value.z);
  return length <= EPSILON || !Number.isFinite(length)
    ? fallback
    : scale(value, 1 / length);
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function snapTravelAxis(value: number): -1 | 0 | 1 {
  if (Math.abs(value) < Math.sin(Math.PI / 8)) return 0;
  return value < 0 ? -1 : 1;
}
