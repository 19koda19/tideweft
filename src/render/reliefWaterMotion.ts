import type { SurfaceCurrentCue } from "./currentCues";
import type { TerrainGridView, WorldPoint } from "./types";

export interface ReliefWaterMotionFrame {
  /** Maximum decorative lift in world units; never an authoritative water level. */
  readonly amplitude: number;
  /** Presentation phase rate, informed only by already perceived local flow. */
  readonly rate: number;
  readonly direction: readonly [number, number];
  /** Signed-world phases for along-flow (1.4) and cross-flow (2.1) tile frequencies. */
  readonly phase: readonly [number, number];
  readonly origin: readonly [number, number];
  readonly tileSize: number;
}

const TAU = Math.PI * 2;
const MAXIMUM_FLOW_SAMPLES = 8;

function unit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function phase(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const wrapped = value % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped === 0 ? 0 : wrapped;
}

/** Reduce before multiplying large signed tile coordinates, not afterward. */
function coordinatePhase(coordinate: number, frequency: number): number {
  if (!Number.isSafeInteger(coordinate)) return 0;
  let remaining = Math.abs(coordinate), factor = phase(frequency), result = 0;
  // Global tiles are safe integers: at most 53 iterations and no allocation.
  // This also avoids losing a frame's small phase delta near the world limit.
  while (remaining > 0) {
    if (remaining % 2 === 1) result = phase(result + factor);
    factor = phase(factor * 2);
    remaining = Math.floor(remaining / 2);
  }
  return coordinate < 0 ? phase(-result) : result;
}

function normalizedDirection(value: WorldPoint | undefined): readonly [number, number] {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return [1, 0];
  // Heading magnitude is not speed. Scaling first also avoids overflow for
  // large but finite presentation vectors.
  const scale = Math.max(Math.abs(value.x), Math.abs(value.y));
  if (scale === 0) return [1, 0];
  const x = value.x / scale, y = value.y / scale;
  const length = Math.hypot(x, y);
  return [x / length, y / length];
}

/**
 * Small shared parameters for one continuous GPU water wave. The caller supplies
 * the existing near-sorted, perception-gated current cues: this helper never
 * inspects tiles, hidden bathymetry, sounding, or physical simulation state.
 * No cues mean restrained ambient motion, not an invented current force.
 *
 * Sample coordinates are (position.xz - origin) / tileSize. Adding phase[0]
 * to their along-direction dot product times 1.4 (and phase[1] to the
 * perpendicular product times 2.1) preserves place through a signed frame slide.
 */
export function reliefWaterMotionFrame(
  grid: Pick<TerrainGridView, "origin" | "tileSize" | "worldTileOrigin">,
  cues: readonly SurfaceCurrentCue[],
  directionValue: WorldPoint | undefined,
  reducedMotion: boolean,
): ReliefWaterMotionFrame {
  const tileSize = Number.isFinite(grid.tileSize) && grid.tileSize >= 0.000_001
    ? grid.tileSize : 1;
  const count = Math.min(MAXIMUM_FLOW_SAMPLES, cues.length);
  // No perceived current must remain ambient: raw public heading alone does
  // not turn a broad-only water sheet into a directional flow cue.
  const direction: readonly [number, number] = count > 0
    ? normalizedDirection(cues[0]?.direction ?? directionValue) : [1, 0];
  let strength = 0, turbulence = 0;
  for (let index = 0; index < count; index += 1) {
    const cue = cues[index];
    strength += unit(cue?.strength ?? 0);
    turbulence += unit(cue?.turbulence ?? 0);
  }
  if (count > 0) {
    strength /= count;
    turbulence /= count;
  }
  const worldX = grid.worldTileOrigin?.x ?? 0;
  const worldY = grid.worldTileOrigin?.y ?? 0;
  const [dx, dy] = direction;
  return {
    // The old sub-unit lift projected to less than a pixel at the ordinary
    // Relief camera distance. Keep calm water readable, and stronger flow
    // visibly more energetic, without adding vertices or physical displacement.
    amplitude: reducedMotion ? 0 : Math.min(6, tileSize * 0.25) * (0.35 + strength * 0.65),
    rate: 0.5 + strength * 1.5 + turbulence * 0.25,
    direction,
    phase: [phase(coordinatePhase(worldX, dx * 1.4) + coordinatePhase(worldY, dy * 1.4)),
      phase(coordinatePhase(worldX, -dy * 2.1) + coordinatePhase(worldY, dx * 2.1))],
    origin: [Number.isFinite(grid.origin.x) ? grid.origin.x : 0,
      Number.isFinite(grid.origin.y) ? grid.origin.y : 0],
    tileSize,
  };
}
