import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import {
  SITUATED_EXPRESSION_VERSION,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
} from "./situatedExpression";
import {
  captureSituatedExpressionChannelBankIntervalSnapshot,
  closeSituatedExpressionChannelBankInterval,
  createSituatedExpressionChannelBank,
  listActiveSituatedExpressionChannelPairs,
  reduceSituatedExpressionChannelBank,
  type ActiveSituatedExpressionChannelPair,
  type SituatedExpressionChannelBank,
} from "./situatedExpressionChannelBank";
import {
  createHeardVisibleSituatedExpressionReception,
} from "./situatedExpressionReception";
import {
  activeSituatedExpressionPresentationPairs,
  advanceSituatedExpressionPresentationLeases,
  captureReloadedIncidentalExpressionEventIds,
  createSituatedExpressionPresentationLeases,
  discardSituatedExpressionPresentationLeasesForSource,
  putSituatedExpressionPresentationLease,
  retainClosingSituatedExpressionPresentations,
} from "./situatedExpressionPresentationLease";
import { createWorldPosition } from "./worldPosition";

const SOURCE_ID = "H-presentation-lease-porter";
const POSITION = createWorldPosition(createRegionCoord(2, -3), 41_000, 29_000);
const INTRODUCTION_PROTECTION = new Set(["resident-introduction"] as const);

function intent(
  meaning: "resident-introduction" | "alarm-at-cargo-loss",
  triggerEventId: string,
): SituatedExpressionIntent {
  const introduction = meaning === "resident-introduction";
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SOURCE_ID,
    triggerEventId,
    position: POSITION,
    meaning,
    family: introduction ? "social" : "cargo",
    tone: introduction ? "restrained" : "alarmed",
    volume: introduction ? "spoken" : "shout",
    knowledgeBasis: introduction
      ? "self-committed-introduction"
      : "self-observed-cargo-loss",
    priority: introduction ? 650_000 : 900_000,
    salience: introduction ? 780_000 : 950_000,
    variantSeed: introduction ? 17 : 29,
    durationSteps: introduction ? 56 : 6,
  };
}

function receive(event: SituatedExpressionEvent) {
  return createHeardVisibleSituatedExpressionReception(event, 90, 850_000, true);
}

function rabbitThumpIntent(): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "RABBIT-same-seed-p0",
    triggerEventId: "RABBIT-same-seed-p0:e:1:alarm",
    position: POSITION,
    meaning: "marsh-rabbit-alarm-thump",
    family: "animal-signal",
    tone: "alarmed",
    volume: "murmur",
    knowledgeBasis: "self-perceived-threat",
    priority: 160_000,
    salience: 520_000,
    variantSeed: 41,
    durationSteps: 6,
  };
}

function catRainDistressIntent(): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "CAT-same-seed-p0",
    triggerEventId: "CAT-same-seed-p0:e:1:retreat",
    position: POSITION,
    meaning: "domestic-cat-rain-distress-call",
    family: "animal-signal",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-weather-distress",
    priority: 300_000,
    salience: 520_000,
    variantSeed: 43,
    durationSteps: 6,
  };
}

function accept(
  bank: SituatedExpressionChannelBank,
  nextIntent: SituatedExpressionIntent,
): Readonly<{
  bank: SituatedExpressionChannelBank;
  pair: ActiveSituatedExpressionChannelPair;
}> {
  const reduction = reduceSituatedExpressionChannelBank(bank, nextIntent, receive);
  if (!reduction.accepted || reduction.bank === null) {
    throw new Error(`Expected expression admission, received ${reduction.reason}`);
  }
  const pair = listActiveSituatedExpressionChannelPairs(reduction.bank)?.[0];
  if (pair === undefined) throw new Error("Expected one received active expression");
  return Object.freeze({ bank: reduction.bank, pair });
}

describe("situated-expression presentation leases", () => {
  it("releases reload-only thump suppression for a deterministic same-seed world replacement", () => {
    const reloaded = accept(
      createSituatedExpressionChannelBank(),
      rabbitThumpIntent(),
    );
    const reloadedEventIds = captureReloadedIncidentalExpressionEventIds(
      reloaded.bank,
    );
    expect(reloadedEventIds).toEqual(new Set([reloaded.pair.event.eventId]));

    const replacement = accept(
      createSituatedExpressionChannelBank(),
      rabbitThumpIntent(),
    );
    expect(replacement.pair.event.eventId).toBe(reloaded.pair.event.eventId);
    expect(activeSituatedExpressionPresentationPairs(
      replacement.bank,
      createSituatedExpressionPresentationLeases(),
    )?.filter(({ event }) => !reloadedEventIds.has(event.eventId))).toEqual([]);

    // `new-world` owns this generation boundary in the runtime. Once it
    // clears the reload-only set, the legitimate new physical event captions.
    reloadedEventIds.clear();
    expect(activeSituatedExpressionPresentationPairs(
      replacement.bank,
      createSituatedExpressionPresentationLeases(),
    )?.filter(({ event }) => !reloadedEventIds.has(event.eventId)).map(
      ({ event }) => event.eventId,
    )).toEqual([replacement.pair.event.eventId]);
  });

  it("does not repaint a reload-carried cat weather call as a fresh event", () => {
    const reloaded = accept(
      createSituatedExpressionChannelBank(),
      catRainDistressIntent(),
    );
    expect(captureReloadedIncidentalExpressionEventIds(reloaded.bank))
      .toEqual(new Set([reloaded.pair.event.eventId]));
  });

  it("preserves a guaranteed introduction through same-source priority and interval closure", () => {
    const introduction = accept(
      createSituatedExpressionChannelBank(),
      intent("resident-introduction", "sim-event:resident-introduced:3:7"),
    );
    let leases = putSituatedExpressionPresentationLease(
      createSituatedExpressionPresentationLeases(),
      introduction.pair,
    );

    const alarm = accept(
      introduction.bank,
      intent("alarm-at-cargo-loss", "cargo-loss:3:7"),
    );
    leases = discardSituatedExpressionPresentationLeasesForSource(
      leases,
      SOURCE_ID,
      INTRODUCTION_PROTECTION,
    );

    expect(activeSituatedExpressionPresentationPairs(alarm.bank, leases)?.map(
      ({ event }) => event.meaning,
    )).toEqual(["alarm-at-cargo-loss"]);

    const advancedLeases = advanceSituatedExpressionPresentationLeases(leases);
    expect(advancedLeases[0]?.event).toMatchObject({
      meaning: "resident-introduction",
      remainingSteps: 55,
    });

    const snapshot = captureSituatedExpressionChannelBankIntervalSnapshot(alarm.bank);
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const retained = retainClosingSituatedExpressionPresentations(
      advancedLeases,
      alarm.bank,
      snapshot,
      INTRODUCTION_PROTECTION,
    );
    const closed = closeSituatedExpressionChannelBankInterval(alarm.bank, snapshot);
    expect(retained?.map(({ event }) => event.meaning)).toEqual([
      "resident-introduction",
    ]);
    expect(closed).not.toBeNull();
    if (retained === null || closed === null) return;
    expect(activeSituatedExpressionPresentationPairs(closed, retained)?.map(
      ({ event }) => event.meaning,
    )).toEqual(["resident-introduction"]);
  });

  it("retires an ordinary stale lease when its source speaks again", () => {
    const introduction = accept(
      createSituatedExpressionChannelBank(),
      intent("resident-introduction", "sim-event:resident-introduced:5:9"),
    );
    const leases = putSituatedExpressionPresentationLease(
      createSituatedExpressionPresentationLeases(),
      introduction.pair,
    );

    expect(discardSituatedExpressionPresentationLeasesForSource(
      leases,
      SOURCE_ID,
    )).toEqual([]);
  });
});
