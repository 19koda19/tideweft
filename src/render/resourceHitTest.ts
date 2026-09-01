import type { FieldResourceNodeView, WorldPoint } from "./types";

export interface FieldResourceHit {
  readonly node: FieldResourceNodeView;
  readonly distanceSquared: number;
}

/** Stable nearest-first hit testing shared by Chart and Relief. */
export function hitTestFieldResource(
  nodes: readonly FieldResourceNodeView[],
  point: WorldPoint,
  radius: number,
): FieldResourceHit | null {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const radiusSquared = radius * radius;
  let nearest: FieldResourceHit | null = null;
  for (const node of nodes) {
    const dx = point.x - node.position.x;
    const dy = point.y - node.position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > radiusSquared) continue;
    if (
      nearest === null
      || distanceSquared < nearest.distanceSquared
      || (distanceSquared === nearest.distanceSquared && node.id < nearest.node.id)
    ) {
      nearest = { node, distanceSquared };
    }
  }
  return nearest;
}

