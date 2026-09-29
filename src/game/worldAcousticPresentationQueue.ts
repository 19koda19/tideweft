import type { WorldAcousticEvent } from "./worldAcoustics";
import {
  realizeWorldAcousticText,
  worldAcousticPresentationReceptionMatchesEvent,
  type WorldAcousticPresentationReception,
} from "./worldAcousticPresentation";

/** The retained text queue is deliberately smaller than the event/sound world. */
export const MAX_ACTIVE_WORLD_ACOUSTIC_PRESENTATIONS = 8;
/** Three seconds at the authoritative 100 ms cadence prevents locomotion spam. */
export const WORLD_ACOUSTIC_REPETITION_COOLDOWN_STEPS = 30;

export interface ActiveWorldAcousticPresentation {
  readonly event: WorldAcousticEvent;
  readonly remainingSteps: number;
  readonly repetitionCooldownSteps: number;
  readonly reception: WorldAcousticPresentationReception;
}

function comparePresentations(
  left: ActiveWorldAcousticPresentation,
  right: ActiveWorldAcousticPresentation,
): number {
  return Number(right.remainingSteps > 0) - Number(left.remainingSteps > 0)
    || right.event.priority - left.event.priority
    || right.event.salience - left.event.salience
    || right.event.occurredAtTick - left.event.occurredAtTick
    || left.event.eventId.localeCompare(right.event.eventId);
}

/** Advances only ephemeral presentation lifetime; world events never replay. */
export function advanceWorldAcousticPresentations(
  active: readonly ActiveWorldAcousticPresentation[],
): readonly ActiveWorldAcousticPresentation[] {
  return Object.freeze(active.flatMap((presentation) => {
    const repetitionCooldownSteps = Math.max(
      0,
      presentation.repetitionCooldownSteps - 1,
    );
    if (repetitionCooldownSteps === 0) return [];
    return [Object.freeze({
      event: presentation.event,
      remainingSteps: Math.max(0, presentation.remainingSteps - 1),
      repetitionCooldownSteps,
      reception: presentation.reception,
    })];
  }));
}

/**
 * Keeps presentation bounded and coalesces repetition by source plus semantic
 * key. The authoritative event still drives audio/hearing at event time; only
 * its optional floating-text lifetime is merged.
 */
export function admitWorldAcousticPresentation(
  active: readonly ActiveWorldAcousticPresentation[],
  event: WorldAcousticEvent,
  reception: WorldAcousticPresentationReception,
): readonly ActiveWorldAcousticPresentation[] {
  const repeated = active.find(({ event: retained }) => (
    retained.sourceId === event.sourceId
    && retained.repetitionKey === event.repetitionKey
  ));
  // Audio/hearing still consume the new authoritative event. Only optional
  // text remains quiet during the bounded semantic cooldown.
  if (repeated !== undefined && repeated.repetitionCooldownSteps > 0) {
    return active;
  }
  const next = active.filter(({ event: retained }) => (
    retained.eventId !== event.eventId
    && !(retained.sourceId === event.sourceId
      && retained.repetitionKey === event.repetitionKey)
  ));
  next.push(Object.freeze({
    event,
    remainingSteps: event.durationSteps,
    repetitionCooldownSteps: WORLD_ACOUSTIC_REPETITION_COOLDOWN_STEPS,
    reception,
  }));
  return Object.freeze(next
    .sort(comparePresentations)
    .slice(0, MAX_ACTIVE_WORLD_ACOUSTIC_PRESENTATIONS));
}

/** Highest-ranked retained event that can actually occupy the one DOM caption. */
export function selectWorldAcousticCaptionPresentation(
  active: readonly ActiveWorldAcousticPresentation[],
): ActiveWorldAcousticPresentation | null {
  return active.find(({ event, reception, remainingSteps }) => (
    worldAcousticPresentationReceptionMatchesEvent(reception, event)
    && realizeWorldAcousticText(event, remainingSteps) !== null
  )) ?? null;
}
