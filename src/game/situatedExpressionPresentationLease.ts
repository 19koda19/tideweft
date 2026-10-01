import type { SituatedExpressionMeaning } from "./situatedExpression";
import {
  listActiveSituatedExpressionChannelPairs,
  type ActiveSituatedExpressionChannelPair,
  type SituatedExpressionChannelBank,
  type SituatedExpressionChannelBankIntervalSnapshot,
} from "./situatedExpressionChannelBank";

/** Ephemeral readability budget; it is deliberately never save authority. */
export const SITUATED_EXPRESSION_PRESENTATION_LEASE_MAX = 16 as const;

export type SituatedExpressionPresentationLeases =
  readonly ActiveSituatedExpressionChannelPair[];

const NO_PROTECTED_PRESENTATION_MEANINGS = new Set<SituatedExpressionMeaning>();

export function createSituatedExpressionPresentationLeases():
SituatedExpressionPresentationLeases {
  return Object.freeze([]);
}

/**
 * Capture only reload-carried embodied labels that must not repaint as fresh
 * presentation. The mutable set is an ephemeral runtime-generation guard: a
 * confirmed authoritative world replacement clears it, so a same-seed world
 * may lawfully reuse the same deterministic event identity.
 */
export function captureReloadedIncidentalExpressionEventIds(
  bank: SituatedExpressionChannelBank,
): Set<string> {
  return new Set(bank.channels.flatMap(({ state }) => (
    state.active?.meaning === "marsh-rabbit-alarm-thump"
      || state.active?.meaning === "domestic-cat-rain-distress-call"
      || state.active?.meaning === "marsh-fox-pursuit-yip"
      ? [state.active.eventId]
      : []
  )));
}

/**
 * Combine current sound authority with older presentation-only leases. A live
 * source always wins its one source lane; an old lease can become visible
 * after that higher-priority utterance ends, but never duplicates it.
 */
export function activeSituatedExpressionPresentationPairs(
  bank: SituatedExpressionChannelBank,
  leases: SituatedExpressionPresentationLeases,
): readonly ActiveSituatedExpressionChannelPair[] | null {
  const active = listActiveSituatedExpressionChannelPairs(bank);
  if (active === null) return null;
  const activeSourceIds = new Set(active.map(({ sourceActorId }) => sourceActorId));
  const activeEventIds = new Set(active.map(({ event }) => event.eventId));
  const leased = leases.filter((pair) => (
    !activeSourceIds.has(pair.sourceActorId)
    && !activeEventIds.has(pair.event.eventId)
    && pair.event.remainingSteps > 0
  ));
  return sortedBounded([...active, ...leased]);
}

/** Ephemeral time advances even when a higher-priority source event hides it. */
export function advanceSituatedExpressionPresentationLeases(
  leases: SituatedExpressionPresentationLeases,
): SituatedExpressionPresentationLeases {
  return sortedBounded(leases.flatMap((pair) => {
    if (pair.event.remainingSteps <= 1) return [];
    return [Object.freeze({
      sourceActorId: pair.sourceActorId,
      event: Object.freeze({
        ...pair.event,
        remainingSteps: pair.event.remainingSteps - 1,
      }),
      reception: pair.reception,
    })];
  }));
}

/** Replace one source's fallback with an exact newly guaranteed presentation. */
export function putSituatedExpressionPresentationLease(
  leases: SituatedExpressionPresentationLeases,
  pair: ActiveSituatedExpressionChannelPair,
): SituatedExpressionPresentationLeases {
  return sortedBounded([
    ...leases.filter(({ sourceActorId }) => sourceActorId !== pair.sourceActorId),
    pair,
  ]);
}

/**
 * Ordinary newer speech retires stale same-source presentation. A small named
 * protected set supports transaction-owned facts (currently the first
 * introduction) that must survive same-tick priority arbitration long enough
 * to receive a later clean lane.
 */
export function discardSituatedExpressionPresentationLeasesForSource(
  leases: SituatedExpressionPresentationLeases,
  sourceActorId: string,
  protectedMeanings: ReadonlySet<SituatedExpressionMeaning> =
    NO_PROTECTED_PRESENTATION_MEANINGS,
): SituatedExpressionPresentationLeases {
  return sortedBounded(leases.filter(({ sourceActorId: candidate, event }) => (
    candidate !== sourceActorId || protectedMeanings.has(event.meaning)
  )));
}

/** Carry closing active text beyond its one actor-hearing interval. */
export function retainClosingSituatedExpressionPresentations(
  leases: SituatedExpressionPresentationLeases,
  bank: SituatedExpressionChannelBank,
  snapshot: SituatedExpressionChannelBankIntervalSnapshot,
  protectedMeanings: ReadonlySet<SituatedExpressionMeaning> =
    NO_PROTECTED_PRESENTATION_MEANINGS,
): SituatedExpressionPresentationLeases | null {
  const closingEventIds = new Set(snapshot.channels.flatMap(({ activeEventId }) => (
    activeEventId === null ? [] : [activeEventId]
  )));
  const closingPairs = listActiveSituatedExpressionChannelPairs(bank);
  if (closingPairs === null) return null;
  const protectedSources = new Set(leases.flatMap(({ sourceActorId, event }) => (
    protectedMeanings.has(event.meaning) ? [sourceActorId] : []
  )));
  const retained = closingPairs.filter(({ sourceActorId, event }) => (
    closingEventIds.has(event.eventId)
    && event.remainingSteps > 0
    // A transaction-owned fact already guaranteed a later clean lane. The
    // newer expression has had the live lane; closing the hearing interval
    // must not silently erase the older guarantee.
    && !protectedSources.has(sourceActorId)
  ));
  const retainedSources = new Set(retained.map(({ sourceActorId }) => sourceActorId));
  return sortedBounded([
    ...leases.filter(({ sourceActorId, event }) => (
      !retainedSources.has(sourceActorId) && event.remainingSteps > 0
    )),
    ...retained,
  ]);
}

function sortedBounded(
  values: readonly ActiveSituatedExpressionChannelPair[],
): SituatedExpressionPresentationLeases {
  return Object.freeze([...values].sort((left, right) => (
    right.event.priority - left.event.priority
    || right.event.salience - left.event.salience
    || left.event.eventId.localeCompare(right.event.eventId)
  )).slice(0, SITUATED_EXPRESSION_PRESENTATION_LEASE_MAX));
}
