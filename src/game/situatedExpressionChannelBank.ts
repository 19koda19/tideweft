import {
  SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT,
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionReductionReason,
  type SituatedExpressionState,
} from "./situatedExpression";
import {
  canonicalizeSituatedExpressionReception,
  situatedExpressionReceptionMatchesActiveEvent,
  type SituatedExpressionReception,
} from "./situatedExpressionReception";

/** Versioned, bounded owner for simultaneous per-source expression channels. */
export const SITUATED_EXPRESSION_CHANNEL_BANK_VERSION = 1 as const;
export const SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS = 16 as const;
export const SITUATED_EXPRESSION_CHANNEL_BANK_INTERVAL_SNAPSHOT_VERSION = 1 as const;

export interface SituatedExpressionChannel {
  readonly sourceActorId: string;
  readonly state: SituatedExpressionState;
  /** Present exactly while this channel has an active, exactly received event. */
  readonly reception: SituatedExpressionReception | null;
}

export interface SituatedExpressionChannelBank {
  readonly version: typeof SITUATED_EXPRESSION_CHANNEL_BANK_VERSION;
  readonly channels: readonly SituatedExpressionChannel[];
}

export interface SituatedExpressionChannelIntervalSnapshot {
  readonly sourceActorId: string;
  readonly activeEventId: string | null;
  /** Sorted exact triggers retained by this source before the boundary. */
  readonly triggerEventIds: readonly string[];
}

/**
 * Bounded transient token captured before a perception interval closes. It is
 * deliberately richer than an active-event list so already-expired cooldown
 * memory cannot survive merely because its presentation ended first.
 */
export interface SituatedExpressionChannelBankIntervalSnapshot {
  readonly version: typeof SITUATED_EXPRESSION_CHANNEL_BANK_INTERVAL_SNAPSHOT_VERSION;
  readonly channels: readonly SituatedExpressionChannelIntervalSnapshot[];
}

export interface ActiveSituatedExpressionChannelPair {
  readonly sourceActorId: string;
  readonly event: SituatedExpressionEvent;
  readonly reception: SituatedExpressionReception;
}

export type SituatedExpressionReceptionFactory = (
  event: SituatedExpressionEvent,
) => unknown;

export type SituatedExpressionChannelBankReductionReason =
  | SituatedExpressionReductionReason
  | "invalid-bank"
  | "channel-capacity-reached"
  | "invalid-reception";

export interface SituatedExpressionChannelBankReduction {
  readonly accepted: boolean;
  readonly reason: SituatedExpressionChannelBankReductionReason;
  /** Null only when the supplied bank itself was malformed. */
  readonly bank: SituatedExpressionChannelBank | null;
  readonly event: SituatedExpressionEvent | null;
}

export interface SituatedExpressionChannelBankAcknowledgement {
  readonly bank: SituatedExpressionChannelBank | null;
  /** Newly acknowledged active events, bounded by the channel limit. */
  readonly acknowledgements: readonly ActiveSituatedExpressionChannelPair[];
}

/** Creates an empty, immutable version-1 channel bank. */
export function createSituatedExpressionChannelBank(): SituatedExpressionChannelBank {
  return freezeBank([]);
}

/**
 * Reauthenticates the exact bank schema and every nested kernel state/receipt.
 * Cross-source state, duplicate source/event identity, idle retained channels,
 * and receipts that do not name the active event all fail closed.
 */
export function canonicalizeSituatedExpressionChannelBank(
  value: unknown,
): SituatedExpressionChannelBank | null {
  if (!plainRecord(value) || !exactKeys(value, ["channels", "version"])) return null;
  if (
    value.version !== SITUATED_EXPRESSION_CHANNEL_BANK_VERSION
    || !Array.isArray(value.channels)
    || value.channels.length > SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS
  ) return null;

  const channels: SituatedExpressionChannel[] = [];
  const sourceActorIds = new Set<string>();
  const activeEventIds = new Set<string>();
  for (let index = 0; index < value.channels.length; index += 1) {
    if (!(index in value.channels)) return null;
    const channel = canonicalizeChannel(value.channels[index]);
    if (channel === null || sourceActorIds.has(channel.sourceActorId)) return null;
    sourceActorIds.add(channel.sourceActorId);
    if (channel.state.active !== null) {
      if (activeEventIds.has(channel.state.active.eventId)) return null;
      activeEventIds.add(channel.state.active.eventId);
    }
    channels.push(channel);
  }
  channels.sort(compareChannels);
  return freezeBank(channels);
}

/**
 * Advances every retained source by fixed simulation steps. A channel is
 * discarded only after its active event is gone and every semantic cooldown is
 * zero; reception evidence expires with its active event.
 */
export function advanceSituatedExpressionChannelBank(
  value: unknown,
  steps = 1,
): SituatedExpressionChannelBank | null {
  const bank = canonicalizeSituatedExpressionChannelBank(value);
  if (bank === null || !nonnegativeSafeInteger(steps)) return null;
  if (steps === 0) return bank;

  const channels: SituatedExpressionChannel[] = [];
  for (const channel of bank.channels) {
    const state = advanceSituatedExpression(channel.state, steps);
    if (state === null) return null;
    if (state.active === null && !hasAnyCooldown(state)) continue;
    channels.push(freezeChannel({
      sourceActorId: channel.sourceActorId,
      state,
      reception: state.active === null ? null : channel.reception,
    }));
  }
  return freezeBank(channels);
}

/** Captures the exact bounded source/event/trigger frontier before a boundary. */
export function captureSituatedExpressionChannelBankIntervalSnapshot(
  value: unknown,
): SituatedExpressionChannelBankIntervalSnapshot | null {
  const bank = canonicalizeSituatedExpressionChannelBank(value);
  if (bank === null) return null;
  return freezeIntervalSnapshot(bank.channels.map((channel) => freezeIntervalChannelSnapshot({
    sourceActorId: channel.sourceActorId,
    activeEventId: channel.state.active?.eventId ?? null,
    triggerEventIds: Object.freeze(
      channel.state.recent.map(({ triggerEventId }) => triggerEventId).sort(compareText),
    ),
  })));
}

/**
 * Consumes only state that existed at the captured perception boundary.
 *
 * A source absent from the token is post-boundary and survives unchanged. For
 * a snapshotted source, old memories are removed by exact trigger identity. An
 * unchanged old active event is removed with its receipt; a different active
 * event and its unsnapshotted memory survive as post-boundary state.
 */
export function closeSituatedExpressionChannelBankInterval(
  bankValue: unknown,
  snapshotValue: unknown,
): SituatedExpressionChannelBank | null {
  const bank = canonicalizeSituatedExpressionChannelBank(bankValue);
  const snapshot = canonicalizeIntervalSnapshot(snapshotValue);
  if (bank === null || snapshot === null) return null;
  const snapshotBySource = new Map(
    snapshot.channels.map((channel) => [channel.sourceActorId, channel] as const),
  );
  const channels: SituatedExpressionChannel[] = [];

  for (const channel of bank.channels) {
    const prior = snapshotBySource.get(channel.sourceActorId);
    if (prior === undefined) {
      channels.push(channel);
      continue;
    }
    const priorTriggers = new Set(prior.triggerEventIds);
    const currentActive = channel.state.active;
    if (
      currentActive !== null
      && currentActive.eventId !== prior.activeEventId
      && priorTriggers.has(currentActive.triggerEventId)
    ) return null;
    const active = currentActive?.eventId === prior.activeEventId ? null : currentActive;
    const recent = channel.state.recent.filter(
      ({ triggerEventId }) => !priorTriggers.has(triggerEventId),
    );
    const state = canonicalizeSituatedExpressionState({
      ...channel.state,
      active,
      recent,
    });
    if (state === null) return null;
    if (state.active === null && !hasAnyCooldown(state)) continue;
    channels.push(freezeChannel({
      sourceActorId: channel.sourceActorId,
      state,
      reception: state.active === null ? null : channel.reception,
    }));
  }
  return freezeBank(channels);
}

/**
 * Ends every currently active event at a perception-interval boundary without
 * advancing semantic time. Cooldown/recent memory is retained exactly; a
 * channel is pruned only when no cooldown remains after its active event is
 * dismissed. Reception evidence expires with the dismissed event.
 */
export function dismissActiveSituatedExpressionChannelBankEvents(
  value: unknown,
): SituatedExpressionChannelBank | null {
  const bank = canonicalizeSituatedExpressionChannelBank(value);
  if (bank === null) return null;
  return dismissSituatedExpressionChannelBankEvents(
    bank,
    bank.channels.flatMap(({ state }) => state.active === null ? [] : [state.active.eventId]),
  );
}

/**
 * Ends only the active events named by an exact, bounded ID set. Valid IDs that
 * are no longer active are deterministic no-ops, allowing a boundary snapshot
 * to survive lawful expiry or interruption before closure. Every surviving
 * active event retains its exact reception evidence.
 */
export function dismissSituatedExpressionChannelBankEvents(
  value: unknown,
  eventIds: readonly string[],
): SituatedExpressionChannelBank | null {
  const bank = canonicalizeSituatedExpressionChannelBank(value);
  if (
    bank === null
    || !Array.isArray(eventIds)
    || eventIds.length > SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS
  ) return null;
  const dismissedEventIds = new Set<string>();
  for (let index = 0; index < eventIds.length; index += 1) {
    if (!(index in eventIds)) return null;
    const eventId = eventIds[index];
    if (!validId(eventId) || dismissedEventIds.has(eventId)) return null;
    dismissedEventIds.add(eventId);
  }

  const channels: SituatedExpressionChannel[] = [];
  for (const channel of bank.channels) {
    if (
      channel.state.active === null
      || !dismissedEventIds.has(channel.state.active.eventId)
    ) {
      channels.push(channel);
      continue;
    }
    const state = canonicalizeSituatedExpressionState({
      ...channel.state,
      active: null,
    });
    if (state === null) return null;
    if (!hasAnyCooldown(state)) continue;
    channels.push(freezeChannel({
      sourceActorId: channel.sourceActorId,
      state,
      reception: null,
    }));
  }
  return freezeBank(channels);
}

/**
 * Reduces one intent only against its source's channel. A reception value or
 * factory is consulted only if the kernel accepts a new active event. Failed
 * reception authentication rolls the whole candidate reduction back.
 */
export function reduceSituatedExpressionChannelBank(
  bankValue: unknown,
  intentValue: SituatedExpressionIntent | unknown,
  receptionInput: SituatedExpressionReception | SituatedExpressionReceptionFactory | unknown,
): SituatedExpressionChannelBankReduction {
  const bank = canonicalizeSituatedExpressionChannelBank(bankValue);
  if (bank === null) return reductionResult(false, "invalid-bank", null, null);

  const sourceActorId = candidateSourceActorId(intentValue);
  if (sourceActorId === null) {
    return reductionResult(false, "invalid-intent", bank, null);
  }
  const channelIndex = bank.channels.findIndex(
    (channel) => channel.sourceActorId === sourceActorId,
  );
  const priorState = channelIndex < 0
    ? createSituatedExpressionState()
    : bank.channels[channelIndex]?.state;
  if (priorState === undefined) {
    return reductionResult(false, "invalid-bank", null, null);
  }

  const reduction = reduceSituatedExpression(priorState, intentValue);
  if (!reduction.accepted || reduction.state === null || reduction.event === null) {
    return reductionResult(false, reduction.reason, bank, null);
  }
  if (
    channelIndex < 0
    && bank.channels.length >= SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS
  ) {
    return reductionResult(false, "channel-capacity-reached", bank, null);
  }

  const reception = receptionFor(receptionInput, reduction.event);
  if (reception === null) {
    return reductionResult(false, "invalid-reception", bank, null);
  }
  const nextChannel = freezeChannel({
    sourceActorId,
    state: reduction.state,
    reception,
  });
  const channels = [...bank.channels];
  if (channelIndex < 0) channels.push(nextChannel);
  else channels[channelIndex] = nextChannel;
  channels.sort(compareChannels);

  return reductionResult(true, reduction.reason, freezeBank(channels), reduction.event);
}

/** Acknowledges every currently unacknowledged active event exactly once. */
export function acknowledgeSituatedExpressionChannelBank(
  value: unknown,
): SituatedExpressionChannelBankAcknowledgement {
  const bank = canonicalizeSituatedExpressionChannelBank(value);
  if (bank === null) return acknowledgementResult(null, []);

  const channels: SituatedExpressionChannel[] = [];
  const acknowledgements: ActiveSituatedExpressionChannelPair[] = [];
  for (const channel of bank.channels) {
    const acknowledgement = acknowledgeSituatedExpression(channel.state);
    if (acknowledgement.state === null) return acknowledgementResult(null, []);
    const nextChannel = freezeChannel({ ...channel, state: acknowledgement.state });
    channels.push(nextChannel);
    if (acknowledgement.event !== null && nextChannel.reception !== null) {
      acknowledgements.push(freezePair({
        sourceActorId: channel.sourceActorId,
        event: acknowledgement.event,
        reception: nextChannel.reception,
      }));
    }
  }
  return acknowledgementResult(freezeBank(channels), acknowledgements);
}

/** Lists active exact-event/reception pairs in stable source-ID order. */
export function listActiveSituatedExpressionChannelPairs(
  value: unknown,
): readonly ActiveSituatedExpressionChannelPair[] | null {
  const bank = canonicalizeSituatedExpressionChannelBank(value);
  if (bank === null) return null;
  return Object.freeze(bank.channels.flatMap((channel) => (
    channel.state.active === null || channel.reception === null
      ? []
      : [freezePair({
          sourceActorId: channel.sourceActorId,
          event: channel.state.active,
          reception: channel.reception,
        })]
  )));
}

/** Projection-named alias for presentation consumers of the deterministic list. */
export function projectSituatedExpressionChannelBank(
  value: unknown,
): readonly ActiveSituatedExpressionChannelPair[] | null {
  return listActiveSituatedExpressionChannelPairs(value);
}

function canonicalizeChannel(value: unknown): SituatedExpressionChannel | null {
  if (!plainRecord(value) || !exactKeys(value, ["reception", "sourceActorId", "state"])) {
    return null;
  }
  if (!validId(value.sourceActorId)) return null;
  const state = canonicalizeSituatedExpressionState(value.state);
  if (state === null || !stateBelongsOnlyToSource(state, value.sourceActorId)) return null;
  if (state.active === null) {
    if (value.reception !== null || !hasAnyCooldown(state)) return null;
    return freezeChannel({ sourceActorId: value.sourceActorId, state, reception: null });
  }
  const reception = canonicalizeSituatedExpressionReception(value.reception);
  if (
    reception === null
    || !situatedExpressionReceptionMatchesActiveEvent(reception, state.active)
  ) return null;
  return freezeChannel({ sourceActorId: value.sourceActorId, state, reception });
}

function stateBelongsOnlyToSource(
  state: SituatedExpressionState,
  sourceActorId: string,
): boolean {
  return (state.active === null || state.active.sourceActorId === sourceActorId)
    && state.recent.every((entry) => entry.sourceActorId === sourceActorId);
}

function hasAnyCooldown(state: SituatedExpressionState): boolean {
  return state.recent.some((entry) => (
    entry.meaningCooldownRemainingSteps > 0
      || entry.familyCooldownRemainingSteps > 0
  ));
}

function receptionFor(
  input: unknown,
  event: SituatedExpressionEvent,
): SituatedExpressionReception | null {
  let value = input;
  if (typeof input === "function") {
    try {
      value = (input as SituatedExpressionReceptionFactory)(event);
    } catch {
      return null;
    }
  }
  const reception = canonicalizeSituatedExpressionReception(value);
  return reception !== null
      && situatedExpressionReceptionMatchesActiveEvent(reception, event)
    ? reception
    : null;
}

function candidateSourceActorId(value: unknown): string | null {
  return plainRecord(value) && validId(value.sourceActorId)
    ? value.sourceActorId
    : null;
}

function reductionResult(
  accepted: boolean,
  reason: SituatedExpressionChannelBankReductionReason,
  bank: SituatedExpressionChannelBank | null,
  event: SituatedExpressionEvent | null,
): SituatedExpressionChannelBankReduction {
  return Object.freeze({ accepted, reason, bank, event });
}

function acknowledgementResult(
  bank: SituatedExpressionChannelBank | null,
  acknowledgements: readonly ActiveSituatedExpressionChannelPair[],
): SituatedExpressionChannelBankAcknowledgement {
  return Object.freeze({ bank, acknowledgements: Object.freeze([...acknowledgements]) });
}

function freezeBank(
  channels: readonly SituatedExpressionChannel[],
): SituatedExpressionChannelBank {
  return Object.freeze({
    version: SITUATED_EXPRESSION_CHANNEL_BANK_VERSION,
    channels: Object.freeze([...channels]),
  });
}

function canonicalizeIntervalSnapshot(
  value: unknown,
): SituatedExpressionChannelBankIntervalSnapshot | null {
  if (!plainRecord(value) || !exactKeys(value, ["channels", "version"])) return null;
  if (
    value.version !== SITUATED_EXPRESSION_CHANNEL_BANK_INTERVAL_SNAPSHOT_VERSION
    || !Array.isArray(value.channels)
    || value.channels.length > SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS
  ) return null;

  const channels: SituatedExpressionChannelIntervalSnapshot[] = [];
  const sourceActorIds = new Set<string>();
  const activeEventIds = new Set<string>();
  for (let index = 0; index < value.channels.length; index += 1) {
    if (!(index in value.channels)) return null;
    const raw = value.channels[index];
    if (!plainRecord(raw) || !exactKeys(raw, [
      "activeEventId",
      "sourceActorId",
      "triggerEventIds",
    ])) return null;
    if (
      !validId(raw.sourceActorId)
      || sourceActorIds.has(raw.sourceActorId)
      || (raw.activeEventId !== null && !validId(raw.activeEventId))
      || !Array.isArray(raw.triggerEventIds)
      || raw.triggerEventIds.length === 0
      || raw.triggerEventIds.length > SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT
    ) return null;
    const triggerEventIds: string[] = [];
    for (let triggerIndex = 0; triggerIndex < raw.triggerEventIds.length; triggerIndex += 1) {
      if (!(triggerIndex in raw.triggerEventIds)) return null;
      const triggerEventId = raw.triggerEventIds[triggerIndex];
      if (
        !validId(triggerEventId)
        || (triggerIndex > 0 && compareText(triggerEventIds[triggerIndex - 1]!, triggerEventId) >= 0)
      ) return null;
      triggerEventIds.push(triggerEventId);
    }
    if (raw.activeEventId !== null) {
      if (activeEventIds.has(raw.activeEventId)) return null;
      activeEventIds.add(raw.activeEventId);
    }
    sourceActorIds.add(raw.sourceActorId);
    channels.push(freezeIntervalChannelSnapshot({
      sourceActorId: raw.sourceActorId,
      activeEventId: raw.activeEventId,
      triggerEventIds: Object.freeze(triggerEventIds),
    }));
  }
  for (let index = 1; index < channels.length; index += 1) {
    if (compareText(channels[index - 1]!.sourceActorId, channels[index]!.sourceActorId) >= 0) {
      return null;
    }
  }
  return freezeIntervalSnapshot(channels);
}

function freezeIntervalSnapshot(
  channels: readonly SituatedExpressionChannelIntervalSnapshot[],
): SituatedExpressionChannelBankIntervalSnapshot {
  return Object.freeze({
    version: SITUATED_EXPRESSION_CHANNEL_BANK_INTERVAL_SNAPSHOT_VERSION,
    channels: Object.freeze([...channels]),
  });
}

function freezeIntervalChannelSnapshot(
  channel: SituatedExpressionChannelIntervalSnapshot,
): SituatedExpressionChannelIntervalSnapshot {
  return Object.freeze({
    ...channel,
    triggerEventIds: Object.freeze([...channel.triggerEventIds]),
  });
}

function freezeChannel(channel: SituatedExpressionChannel): SituatedExpressionChannel {
  return Object.freeze({ ...channel });
}

function freezePair(
  pair: ActiveSituatedExpressionChannelPair,
): ActiveSituatedExpressionChannelPair {
  return Object.freeze({ ...pair });
}

function compareChannels(
  left: SituatedExpressionChannel,
  right: SituatedExpressionChannel,
): number {
  return compareText(left.sourceActorId, right.sourceActorId);
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
