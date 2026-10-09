import { RESIDENT_ACTIVITY_MAX_PHASE, RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION } from "../sim/residentActivity";
import { canonicalResidentActivityForWorld } from "../sim/residentActivityWorld";
import { residentTravelBodyIsLocal, residentTravelInteractionFrame } from "../sim/residentTravelRoute";
import { waterDepthAt } from "../sim/terrain";
import type { TerrainTile, WorldState } from "../sim/types";
import { hashCanonical } from "../sim/util";
import type { LivingActorInteractionWindow } from "./livingActorSimulation";
import { PHYSICAL_ACOUSTIC_MAX_SAMPLES, createPhysicalSoundSample, type PhysicalSoundSample } from "./physicalAcousticPerception";
import { acousticMaterialForTerrainContact, createWorldAcousticEvent, type WorldAcousticEvent } from "./worldAcoustics";
import { WORLD_POSITION_UNITS_PER_TILE, type WorldPosition } from "./worldPosition";

export interface ResidentContactAcousticFact {
  readonly phase: number;
  readonly event: WorldAcousticEvent;
  readonly sample: PhysicalSoundSample;
}

/** The current bounded compatibility cohort, not an infinite resident scan. */
export const RESIDENT_CONTACT_ACOUSTIC_MAX_SOURCES = 64;

/**
 * Sparse bare-ground contact from the already accepted current-v8 body prefix.
 * One entered cell per actor/interval represents ordinary dry locomotion, not
 * every microstep or invented tool/gear contact. Older retained protocols are
 * unchanged until their existing real phase-zero v8 adoption.
 *
 * The prefix itself is the pending-hearing authority: derive before stepWorld
 * collapses it. Audio callers may release ONLY facts at the newly accepted
 * phase, never replay this list on load. This is not an untrusted world decoder;
 * the existing world/save owners admit the cohort, tasks, terrain and phase.
 * Current physical terrain/tide are unchanged during the fine interval. Future
 * mutable contact surfaces need their own retained causal evidence.
 */
export function deriveResidentContactAcoustics(
  world: WorldState,
  window: LivingActorInteractionWindow,
  phase: number,
): readonly ResidentContactAcousticFact[] | null {
  if (!Number.isSafeInteger(phase) || phase < 0 || phase > RESIDENT_ACTIVITY_MAX_PHASE
    || Object.is(phase, -0) || world.residents.length > RESIDENT_CONTACT_ACOUSTIC_MAX_SOURCES) return null;
  const frame = residentTravelInteractionFrame(window);
  if (frame === null) return null;
  const present = world.residents.filter((resident) => Object.hasOwn(resident, "activity"));
  if (present.length === 0) return Object.freeze([]);
  if (present.length !== world.residents.length) return null;
  const facts: ResidentContactAcousticFact[] = [];
  const contactStarts = new Map<string, WorldPosition>();
  const ids = new Set<string>();
  try {
    for (const resident of present) {
      const activity = canonicalResidentActivityForWorld(world, resident);
      if (activity === null || activity.poses.length !== phase + 1
        || ids.has(activity.actorId)) return null;
      ids.add(activity.actorId);
      if (activity.version !== RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION) continue;
      for (let atPhase = 1; atPhase <= phase; atPhase += 1) {
        const before = activity.poses[atPhase - 1]!.position;
        const after = activity.poses[atPhase]!.position;
        const from = dryContactTile(world, before);
        const to = dryContactTile(world, after);
        if (from === null || to === null || from.index === to.index) continue;
        const material = acousticMaterialForTerrainContact({ terrain: to.terrain, waterDepth: 0 });
        const triggerEventId = `resident-contact:${activity.tick}:${atPhase}:${hashCanonical({
          seed: world.meta.rootSeed, actorId: activity.actorId, before, after, material,
        })}`;
        const event = createWorldAcousticEvent({
          triggerEventId, domain: "traversal", sourceId: activity.actorId,
          sourceCategory: "human", sourcePosition: after, occurredAtTick: activity.tick,
          action: material === "foliage" ? "brush" : "foot-contact",
          sourceMaterial: "body", surfaceMaterial: material,
          semanticFamily: material === "foliage" ? "rustle" : material === "stone" ? "scrape" : "thud",
          intensity: material === "foliage" ? 360_000 : material === "stone" ? 320_000 : 280_000,
          interrupt: "none", rangeUnits: 6 * WORLD_POSITION_UNITS_PER_TILE,
          durationSteps: 3, priority: 280_000, salience: 300_000,
          repetitionKey: `resident-contact:${activity.actorId}:${material}`,
          textualEligibility: "audio-only", accessibilityRelevance: "routine",
          variantSeed: Number.parseInt(hashCanonical(triggerEventId).slice(0, 8), 16) >>> 0,
        });
        const sample = event === null ? null : createPhysicalSoundSample({
          id: `prc-${hashCanonical(event.eventId)}`, acousticEventId: event.eventId,
          sourceId: event.sourceId, position: event.sourcePosition,
          soundClass: event.soundClass, soundInterrupt: event.interrupt,
          soundLoudness: event.intensity, soundRangeUnits: event.rangeUnits,
        });
        if (event === null || sample === null) return null;
        facts.push(Object.freeze({ phase: atPhase, event, sample }));
        contactStarts.set(event.sourceId, before);
        break;
      }
    }
  } catch {
    return null;
  }
  // Admission follows occurrence order, not roster order: later contacts must
  // not displace a cause whose fresh audio already committed. Select before
  // checking the current frame so rebasing cannot invent a later replacement
  // contact from the same source's prefix.
  return Object.freeze(facts.sort((left, right) => left.phase - right.phase || (
    left.event.sourceId < right.event.sourceId ? -1 : left.event.sourceId > right.event.sourceId ? 1 : 0
  )).slice(0, PHYSICAL_ACOUSTIC_MAX_SAMPLES).filter(({ event }) => {
    const before = contactStarts.get(event.sourceId);
    return before !== undefined && residentTravelBodyIsLocal(frame, before)
      && residentTravelBodyIsLocal(frame, event.sourcePosition);
  }));
}

function dryContactTile(world: WorldState, position: WorldPosition): TerrainTile | null {
  // The current resident locomotion owner has no remote generated-body path.
  if (position.region.x !== 0 || position.region.y !== 0) return null;
  const x = Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE);
  const y = Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE);
  if (x < 0 || y < 0 || x >= world.terrain.width || y >= world.terrain.height) return null;
  const tile = world.terrain.tiles[y * world.terrain.width + x];
  return tile !== undefined && tile.index === y * world.terrain.width + x
    && tile.x === x && tile.y === y && tile.terrain !== "deep-water"
    && waterDepthAt(tile, world.tide) === 0 ? tile : null;
}
