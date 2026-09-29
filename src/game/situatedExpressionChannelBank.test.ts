import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  canonicalizeSituatedExpressionState,
  SITUATED_EXPRESSION_VERSION,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
} from "./situatedExpression";
import {
  SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS,
  acknowledgeSituatedExpressionChannelBank,
  advanceSituatedExpressionChannelBank,
  canonicalizeSituatedExpressionChannelBank,
  captureSituatedExpressionChannelBankIntervalSnapshot,
  closeSituatedExpressionChannelBankInterval,
  createSituatedExpressionChannelBank,
  dismissActiveSituatedExpressionChannelBankEvents,
  dismissSituatedExpressionChannelBankEvents,
  listActiveSituatedExpressionChannelPairs,
  reduceSituatedExpressionChannelBank,
  type SituatedExpressionChannelBank,
} from "./situatedExpressionChannelBank";
import {
  createHeardVisibleSituatedExpressionReception,
  createSelfSituatedExpressionReception,
} from "./situatedExpressionReception";
import { createWorldPosition } from "./worldPosition";

const PLAYER_ID = LOCAL_PLAYER_LIVING_ACTOR_ID;
const PORTER_ID = "H-porter-channel-bank";
const GUARDIAN_DOG_ID = "D-guardian-channel-bank";
const POSITION = createWorldPosition(createRegionCoord(4, -9), 31_000, 27_000);

function expressionIntent(
  sourceActorId: string,
  triggerEventId: string,
  durationSteps = 4,
): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position: POSITION,
    meaning: "steady-after-stumble",
    family: "footing",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-felt-stumble",
    priority: 180_000,
    salience: 260_000,
    variantSeed: 17,
    durationSteps,
  };
}

function alarmIntent(
  sourceActorId: string,
  triggerEventId: string,
): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId,
    position: POSITION,
    meaning: "alarm-at-cargo-loss",
    family: "cargo",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-observed-cargo-loss",
    priority: 900_000,
    salience: 950_000,
    variantSeed: 91,
    durationSteps: 8,
  };
}

function guardianDogIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: GUARDIAN_DOG_ID,
    triggerEventId,
    position: POSITION,
    meaning: "guardian-dog-warning",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-heard-anonymous-alarm",
    priority: 760_000,
    salience: 840_000,
    variantSeed: 103,
    durationSteps: 6,
  };
}

function receive(event: SituatedExpressionEvent) {
  return event.sourceActorId === PLAYER_ID
    ? createSelfSituatedExpressionReception(event, 90)
    : createHeardVisibleSituatedExpressionReception(event, 90, 800_000, true);
}

function accept(
  bank: SituatedExpressionChannelBank,
  intent: SituatedExpressionIntent,
): SituatedExpressionChannelBank {
  const reduction = reduceSituatedExpressionChannelBank(bank, intent, receive);
  if (!reduction.accepted || reduction.bank === null) {
    throw new Error(`Expected accepted channel expression, received ${reduction.reason}`);
  }
  return reduction.bank;
}

describe("situated-expression per-source channel bank", () => {
  it("admits an unreceived non-player world event without weakening player receipts", () => {
    const worldOnly = reduceSituatedExpressionChannelBank(
      createSituatedExpressionChannelBank(),
      guardianDogIntent("working-animal:activity:warning:world-only"),
      null,
    );

    expect(worldOnly).toMatchObject({ accepted: true, reason: "accepted" });
    expect(worldOnly.bank?.channels).toHaveLength(1);
    expect(worldOnly.bank?.channels[0]).toMatchObject({
      sourceActorId: GUARDIAN_DOG_ID,
      reception: null,
      state: {
        active: {
          sourceActorId: GUARDIAN_DOG_ID,
          meaning: "guardian-dog-warning",
          audioAcknowledged: false,
        },
      },
    });
    expect(canonicalizeSituatedExpressionState(
      JSON.parse(JSON.stringify(worldOnly.bank?.channels[0]?.state)),
    )).toEqual(worldOnly.bank?.channels[0]?.state);
    expect(canonicalizeSituatedExpressionChannelBank(
      JSON.parse(JSON.stringify(worldOnly.bank)),
    )).toEqual(worldOnly.bank);
    expect(listActiveSituatedExpressionChannelPairs(worldOnly.bank)).toEqual([]);

    const acknowledged = acknowledgeSituatedExpressionChannelBank(worldOnly.bank);
    expect(acknowledged.acknowledgements).toEqual([]);
    expect(acknowledged.bank?.channels[0]?.state.active?.audioAcknowledged).toBe(true);
    expect(acknowledgeSituatedExpressionChannelBank(acknowledged.bank).bank)
      .toEqual(acknowledged.bank);

    const unreceivedPlayer = reduceSituatedExpressionChannelBank(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:player:unreceived"),
      null,
    );
    expect(unreceivedPlayer).toEqual({
      accepted: false,
      reason: "invalid-reception",
      bank: createSituatedExpressionChannelBank(),
      event: null,
    });
    const factoryFailure = reduceSituatedExpressionChannelBank(
      createSituatedExpressionChannelBank(),
      guardianDogIntent("working-animal:activity:warning:factory-null"),
      () => null,
    );
    expect(factoryFailure).toMatchObject({
      accepted: false,
      reason: "invalid-reception",
    });

    const receivedPlayer = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:player:receipt-required"),
    );
    expect(canonicalizeSituatedExpressionChannelBank({
      ...receivedPlayer,
      channels: [{ ...receivedPlayer.channels[0], reception: null }],
    })).toBeNull();
  });

  it("accepts simultaneous player and porter expressions without cross-source suppression", () => {
    const player = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:player"),
    );
    const both = accept(player, expressionIntent(PORTER_ID, "stumble:porter"));

    expect(listActiveSituatedExpressionChannelPairs(both)?.map((pair) => ({
      sourceActorId: pair.sourceActorId,
      receiptKind: pair.reception.kind,
      triggerEventId: pair.event.triggerEventId,
    }))).toEqual([
      {
        sourceActorId: PORTER_ID,
        receiptKind: "heard-visible",
        triggerEventId: "stumble:porter",
      },
      {
        sourceActorId: PLAYER_ID,
        receiptKind: "self",
        triggerEventId: "stumble:player",
      },
    ]);
  });

  it("keeps cooldown and active-line priority local to one source", () => {
    const player = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:player:cooldown", 2),
    );
    const both = accept(
      player,
      expressionIntent(PORTER_ID, "stumble:porter:cooldown", 2),
    );
    const advanced = advanceSituatedExpressionChannelBank(both, 2);
    if (advanced === null) throw new Error("Valid bank did not advance");

    const playerRepeated = reduceSituatedExpressionChannelBank(
      advanced,
      expressionIntent(PLAYER_ID, "stumble:player:repeated", 2),
      receive,
    );
    expect(playerRepeated).toMatchObject({ accepted: false, reason: "meaning-cooldown" });

    const thirdSource = reduceSituatedExpressionChannelBank(
      advanced,
      expressionIntent("H-third-channel-bank", "stumble:third", 2),
      (event: SituatedExpressionEvent) => createHeardVisibleSituatedExpressionReception(
        event,
        92,
        700_000,
        true,
      ),
    );
    expect(thirdSource).toMatchObject({ accepted: true, reason: "accepted" });
  });

  it("expires active receptions independently and prunes only exhausted channels", () => {
    const short = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:short", 2),
    );
    const mixed = accept(short, expressionIntent(PORTER_ID, "stumble:long", 5));
    const afterShortExpiry = advanceSituatedExpressionChannelBank(mixed, 2);
    if (afterShortExpiry === null) throw new Error("Valid bank did not advance");

    expect(listActiveSituatedExpressionChannelPairs(afterShortExpiry)?.map(
      ({ sourceActorId }) => sourceActorId,
    )).toEqual([PORTER_ID]);
    expect(afterShortExpiry.channels).toHaveLength(2);
    expect(afterShortExpiry.channels.find(
      ({ sourceActorId }) => sourceActorId === PLAYER_ID,
    )).toMatchObject({ reception: null, state: { active: null } });

    const fullyCooled = advanceSituatedExpressionChannelBank(afterShortExpiry, 10);
    expect(fullyCooled).toEqual(createSituatedExpressionChannelBank());
  });

  it("acknowledges every active channel exactly once in deterministic order", () => {
    const player = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:player:audio"),
    );
    const both = accept(player, expressionIntent(PORTER_ID, "stumble:porter:audio"));
    const first = acknowledgeSituatedExpressionChannelBank(both);

    expect(first.acknowledgements.map(({ sourceActorId }) => sourceActorId)).toEqual([
      PORTER_ID,
      PLAYER_ID,
    ]);
    expect(first.acknowledgements).toHaveLength(2);
    expect(first.acknowledgements.every(({ event }) => event.audioAcknowledged)).toBe(true);
    expect(first.bank?.channels.every(({ state }) => state.active?.audioAcknowledged)).toBe(true);
    expect(Object.isFrozen(first.acknowledgements)).toBe(true);

    const second = acknowledgeSituatedExpressionChannelBank(first.bank);
    expect(second.acknowledgements).toEqual([]);
    expect(second.bank).toEqual(first.bank);
  });

  it("dismisses every active boundary event while preserving cooldown memory", () => {
    const player = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:player:boundary", 20),
    );
    const both = accept(
      player,
      expressionIntent(PORTER_ID, "stumble:porter:boundary", 20),
    );
    const dismissed = dismissActiveSituatedExpressionChannelBankEvents(both);

    expect(dismissed).not.toBeNull();
    expect(Object.isFrozen(dismissed)).toBe(true);
    expect(listActiveSituatedExpressionChannelPairs(dismissed)).toEqual([]);
    expect(dismissed?.channels).toHaveLength(2);
    for (const channel of dismissed?.channels ?? []) {
      const prior = both.channels.find(({ sourceActorId }) => (
        sourceActorId === channel.sourceActorId
      ));
      expect(channel.reception).toBeNull();
      expect(channel.state.active).toBeNull();
      expect(channel.state.completedSteps).toBe(prior?.state.completedSteps);
      expect(channel.state.recent).toEqual(prior?.state.recent);
    }
    expect(dismissActiveSituatedExpressionChannelBankEvents(dismissed)).toEqual(dismissed);
    expect(dismissActiveSituatedExpressionChannelBankEvents(null)).toBeNull();

    const fullyCooledWhileActive = advanceSituatedExpressionChannelBank(
      accept(
        createSituatedExpressionChannelBank(),
        expressionIntent(PLAYER_ID, "stumble:boundary-prune", 120),
      ),
      12,
    );
    expect(fullyCooledWhileActive?.channels[0]?.state.active).not.toBeNull();
    expect(dismissActiveSituatedExpressionChannelBankEvents(fullyCooledWhileActive))
      .toEqual(createSituatedExpressionChannelBank());
  });

  it("dismisses only exact boundary event IDs and retains surviving receptions", () => {
    const player = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:player:selective", 20),
    );
    const both = accept(
      player,
      expressionIntent(PORTER_ID, "stumble:porter:post-boundary", 20),
    );
    const playerEventId = both.channels.find(
      ({ sourceActorId }) => sourceActorId === PLAYER_ID,
    )?.state.active?.eventId;
    const porter = both.channels.find(({ sourceActorId }) => sourceActorId === PORTER_ID);
    if (
      playerEventId === undefined
      || porter === undefined
      || porter.state.active === null
      || porter.reception === null
    ) {
      throw new Error("Expected two active received expression channels");
    }

    const dismissed = dismissSituatedExpressionChannelBankEvents(both, [playerEventId]);
    expect(listActiveSituatedExpressionChannelPairs(dismissed)).toEqual([{
      sourceActorId: PORTER_ID,
      event: porter.state.active,
      reception: porter.reception,
    }]);
    expect(dismissed?.channels.find(
      ({ sourceActorId }) => sourceActorId === PLAYER_ID,
    )).toMatchObject({ state: { active: null }, reception: null });
    expect(dismissSituatedExpressionChannelBankEvents(dismissed, [
      "situated-expression:event:v1:0000000000000000",
    ])).toEqual(dismissed);

    expect(dismissSituatedExpressionChannelBankEvents(both, [playerEventId, playerEventId]))
      .toBeNull();
    expect(dismissSituatedExpressionChannelBankEvents(both, [" padded "])).toBeNull();
    expect(dismissSituatedExpressionChannelBankEvents(
      both,
      Array.from(
        { length: SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS + 1 },
        (_, index) => `situated-expression:event:v1:${String(index).padStart(16, "0")}`,
      ),
    )).toBeNull();
    const sparse = new Array<string>(1);
    expect(dismissSituatedExpressionChannelBankEvents(both, sparse)).toBeNull();
  });

  it("closes every unchanged active player and porter channel from an exact snapshot", () => {
    const player = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:interval:player", 20),
    );
    const both = accept(
      player,
      expressionIntent(PORTER_ID, "stumble:interval:porter", 20),
    );
    const snapshot = captureSituatedExpressionChannelBankIntervalSnapshot(both);

    expect(snapshot).not.toBeNull();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.channels)).toBe(true);
    expect(snapshot?.channels.every((channel) => (
      Object.isFrozen(channel) && Object.isFrozen(channel.triggerEventIds)
    ))).toBe(true);
    expect(closeSituatedExpressionChannelBankInterval(both, snapshot))
      .toEqual(createSituatedExpressionChannelBank());
  });

  it("removes an unchanged expired recent-only channel at interval closure", () => {
    const active = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:interval:expired", 4),
    );
    const expired = advanceSituatedExpressionChannelBank(active, 4);
    if (expired === null || expired.channels[0]?.state.active !== null) {
      throw new Error("Interval fixture did not retain expired cooldown memory");
    }
    const snapshot = captureSituatedExpressionChannelBankIntervalSnapshot(expired);

    expect(snapshot?.channels[0]?.activeEventId).toBeNull();
    expect(closeSituatedExpressionChannelBankInterval(expired, snapshot))
      .toEqual(createSituatedExpressionChannelBank());
  });

  it("preserves a speaker introduced after the interval snapshot", () => {
    const before = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:interval:before", 20),
    );
    const snapshot = captureSituatedExpressionChannelBankIntervalSnapshot(before);
    const after = accept(
      before,
      expressionIntent(PORTER_ID, "stumble:interval:new-speaker", 20),
    );
    const porter = after.channels.find(({ sourceActorId }) => sourceActorId === PORTER_ID);
    if (!porter) throw new Error("Interval fixture omitted its post-boundary speaker");

    expect(closeSituatedExpressionChannelBankInterval(after, snapshot)).toEqual({
      version: 1,
      channels: [porter],
    });
  });

  it("retains only post-snapshot state when the same source accepts a replacement", () => {
    const before = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:interval:replaced", 20),
    );
    const snapshot = captureSituatedExpressionChannelBankIntervalSnapshot(before);
    const after = accept(before, alarmIntent(PLAYER_ID, "cargo:interval:replacement"));
    const replacement = after.channels[0]?.state.active;
    if (replacement === null || replacement === undefined) {
      throw new Error("Interval fixture omitted its replacement expression");
    }

    const closed = closeSituatedExpressionChannelBankInterval(after, snapshot);
    expect(closed?.channels).toHaveLength(1);
    expect(closed?.channels[0]).toMatchObject({
      sourceActorId: PLAYER_ID,
      state: {
        active: { eventId: replacement.eventId },
        recent: [{ triggerEventId: replacement.triggerEventId }],
      },
      reception: { eventId: replacement.eventId },
    });
    expect(closed?.channels[0]?.state.recent).toHaveLength(1);
  });

  it("fails closed for malformed or over-cap interval snapshots", () => {
    const bank = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:interval:validation"),
    );
    const snapshot = captureSituatedExpressionChannelBankIntervalSnapshot(bank);
    if (snapshot === null) throw new Error("Interval fixture snapshot was rejected");
    const channel = snapshot.channels[0];
    if (!channel) throw new Error("Interval fixture snapshot omitted its channel");

    expect(closeSituatedExpressionChannelBankInterval(bank, {
      ...snapshot,
      unexpected: true,
    })).toBeNull();
    expect(closeSituatedExpressionChannelBankInterval(bank, {
      ...snapshot,
      channels: [{ ...channel, triggerEventIds: ["z", "a"] }],
    })).toBeNull();
    expect(closeSituatedExpressionChannelBankInterval(bank, {
      ...snapshot,
      channels: Array.from(
        { length: SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS + 1 },
        (_, index) => ({
          sourceActorId: `H-interval-overflow-${index}`,
          activeEventId: null,
          triggerEventIds: [`trigger:interval:${index}`],
        }),
      ),
    })).toBeNull();
    const sparseChannels = new Array(1);
    expect(closeSituatedExpressionChannelBankInterval(bank, {
      version: 1,
      channels: sparseChannels,
    })).toBeNull();
    expect(closeSituatedExpressionChannelBankInterval(null, snapshot)).toBeNull();
  });

  it("round-trips canonical save data and fails closed on forged channel bindings", () => {
    const player = accept(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:player:save"),
    );
    const bank = accept(player, expressionIntent(PORTER_ID, "stumble:porter:save"));
    const roundTrip = canonicalizeSituatedExpressionChannelBank(
      JSON.parse(JSON.stringify(bank)),
    );

    expect(roundTrip).toEqual(bank);
    expect(Object.isFrozen(roundTrip)).toBe(true);
    expect(Object.isFrozen(roundTrip?.channels)).toBe(true);
    expect(roundTrip?.channels.every(Object.isFrozen)).toBe(true);

    const first = bank.channels[0];
    const second = bank.channels[1];
    if (first === undefined || second === undefined || first.reception === null) {
      throw new Error("Expected two received expression channels");
    }
    expect(canonicalizeSituatedExpressionChannelBank({
      ...bank,
      channels: [first, first],
    })).toBeNull();
    expect(canonicalizeSituatedExpressionChannelBank({
      ...bank,
      channels: [{ ...first, sourceActorId: "H-forged-source" }, second],
    })).toBeNull();
    expect(canonicalizeSituatedExpressionChannelBank({
      ...bank,
      channels: [{ ...first, reception: second.reception }, second],
    })).toBeNull();

    const mismatchedReduction = reduceSituatedExpressionChannelBank(
      createSituatedExpressionChannelBank(),
      expressionIntent(PLAYER_ID, "stumble:mismatched-receipt"),
      first.reception,
    );
    expect(mismatchedReduction).toEqual({
      accepted: false,
      reason: "invalid-reception",
      bank: createSituatedExpressionChannelBank(),
      event: null,
    });
  });

  it("bounds independently retained source channels", () => {
    let bank = createSituatedExpressionChannelBank();
    for (let index = SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS - 1; index >= 0; index -= 1) {
      const sourceActorId = `H-bounded-${String(index).padStart(2, "0")}`;
      bank = accept(bank, expressionIntent(sourceActorId, `stumble:bounded:${index}`));
    }
    expect(bank.channels).toHaveLength(SITUATED_EXPRESSION_CHANNEL_BANK_MAX_CHANNELS);
    expect(bank.channels.map(({ sourceActorId }) => sourceActorId)).toEqual(
      [...bank.channels].map(({ sourceActorId }) => sourceActorId).sort(),
    );

    const overflow = reduceSituatedExpressionChannelBank(
      bank,
      expressionIntent("H-overflow", "stumble:overflow"),
      receive,
    );
    expect(overflow).toMatchObject({
      accepted: false,
      reason: "channel-capacity-reached",
      bank,
    });
  });
});
