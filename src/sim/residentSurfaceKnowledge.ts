import { canonicalizeActorPerceptionState, type ActorBelief } from "./actorPerception";
import { hashCanonical } from "./util";
import type { WorldPosition } from "../game/worldPosition";

/** Stable locus identity: tick, body pose and changing surface class are not keys. */
export function residentRestSurfaceObservationId(actorId: string, target: WorldPosition): string {
  return `resident-ground-vision:${hashCanonical({ actorId, target })}`;
}

/** Qualitative task information, not an actor identity, exact sounding or threat. */
export function isResidentRestSurfaceBelief(actorId: string, belief: ActorBelief): boolean {
  return belief.channel === "vision" && belief.identification === "classified"
    && belief.subjectId === null && belief.area.radiusUnits === 0
    && (belief.perceivedClass === "water-covered-ground" || belief.perceivedClass === "dry-ground")
    && belief.sourceObservationId === residentRestSurfaceObservationId(actorId, belief.area.center)
    && !belief.strongInterrupt;
}

/** Missing/aged knowledge is unknown, never evidence that a held approach is safe. */
export function residentRestSurfaceKnowledge(
  value: unknown,
  target: WorldPosition,
  atTick: number,
): "wet" | "dry" | "unknown" | null {
  const perception = canonicalizeActorPerceptionState(value);
  if (perception === null || perception.tick !== atTick) return null;
  const id = residentRestSurfaceObservationId(perception.actorId, target);
  const belief = perception.beliefs.find((candidate) => candidate.sourceObservationId === id);
  if (belief === undefined || belief.lastObservedTick !== atTick
    || !isResidentRestSurfaceBelief(perception.actorId, belief)
    || belief.area.center.region.x !== target.region.x || belief.area.center.region.y !== target.region.y
    || belief.area.center.localX !== target.localX || belief.area.center.localY !== target.localY
    || belief.confidence <= 0) return "unknown";
  return belief.perceivedClass === "water-covered-ground" ? "wet" : "dry";
}
