import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import {
  migrateLegacyV33PlayerVocalizations,
  type LegacyPlayerVocalizationSample,
} from "./legacyPlayerVocalizationMigration";
import {
  SITUATED_EXPRESSION_VERSION,
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  reduceSituatedExpression,
  situatedExpressionEventIdForTrigger,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionState,
} from "./situatedExpression";
import { canonicalizeSituatedExpressionChannelBank } from "./situatedExpressionChannelBank";
import { canonicalizeSituatedExpressionTrajectory } from "./situatedExpressionTrajectory";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const PLAYER_ID = "player:local";
const POSITION = createWorldPosition(createRegionCoord(-3, 5), 31_000, 47_000);

describe("legacy v33 player-vocalization migration", () => {
  it("binds an expired seven-step expression through its cooldown-derived age", () => {
    const accepted = accept(createSituatedExpressionState(), stumble("legacy:expired-seven"));
    const expired = advanceSituatedExpression(accepted.state, 7);
    if (expired === null) throw new Error("Expired fixture failed canonical advancement");
    expect(expired.active).toBeNull();

    const migrated = migrateLegacyV33PlayerVocalizations(
      expired,
      [legacySample(41, 0, accepted.event)],
      41,
      8,
    );

    expect(migrated).not.toBeNull();
    expect(migrated?.actorVocalizationSamples).toEqual([
      expect.objectContaining({
        id: "av-41-0",
        expressionEventId: situatedExpressionEventIdForTrigger(
          PLAYER_ID,
          "legacy:expired-seven",
        ),
        sourceActorId: PLAYER_ID,
      }),
    ]);
    expect(migrated?.playerChannel).toMatchObject({
      sourceActorId: PLAYER_ID,
      state: {
        active: null,
        recent: [{
          triggerEventId: "legacy:expired-seven",
          meaningCooldownRemainingSteps: 5,
          familyCooldownRemainingSteps: 0,
        }],
      },
      reception: null,
    });
  });

  it("reconstructs an ordered multi-sample interruption and recovery chain", () => {
    const tick = 73;
    const samples: LegacyPlayerVocalizationSample[] = [];
    let state = createSituatedExpressionState();

    const first = accept(state, stumble("legacy:chain:stumble"));
    state = first.state;
    samples.push(legacySample(tick, 0, first.event));

    state = advance(state, 1);
    const protectedCargo = accept(state, protect("legacy:chain:protect"));
    state = protectedCargo.state;
    samples.push(legacySample(tick, 1, protectedCargo.event));

    state = advance(state, 1);
    const lostCargo = accept(state, loss("legacy:chain:loss"));
    state = lostCargo.state;
    samples.push(legacySample(tick, 2, lostCargo.event));

    const recoveredCargo = accept(state, recovery("legacy:chain:recovery"));
    state = recoveredCargo.state;
    samples.push(legacySample(tick, 3, recoveredCargo.event));

    const migrated = migrateLegacyV33PlayerVocalizations(state, samples, tick, 3);

    expect(migrated?.actorVocalizationSamples.map((sample) => ({
      id: sample.id,
      expressionEventId: sample.expressionEventId,
    }))).toEqual([
      eventBinding(tick, 0, "legacy:chain:stumble"),
      eventBinding(tick, 1, "legacy:chain:protect"),
      eventBinding(tick, 2, "legacy:chain:loss"),
      eventBinding(tick, 3, "legacy:chain:recovery"),
    ]);
    expect(migrated?.playerChannel?.state.recent.map(({ triggerEventId }) => triggerEventId))
      .toEqual([
        "legacy:chain:recovery",
        "legacy:chain:loss",
        "legacy:chain:protect",
        "legacy:chain:stumble",
      ]);
    expect(migrated?.playerChannel?.state.active?.triggerEventId)
      .toBe("legacy:chain:recovery");
    expect(migrated?.playerChannel?.reception).toMatchObject({
      kind: "self",
      eventId: recoveredCargo.event.eventId,
      receivedAtTick: tick,
    });
    expect(Object.isFrozen(migrated)).toBe(true);
    expect(Object.isFrozen(migrated?.actorVocalizationSamples)).toBe(true);
  });

  it("retains an interrupted protect shout as explicit legacy compatibility authority", () => {
    const tick = 84;
    const protectedCargo = accept(
      createSituatedExpressionState(),
      protectAlarmed("legacy:compat:protect-shout"),
    );
    const lostCargo = accept(protectedCargo.state, loss("legacy:compat:loss"));
    const samples = [
      legacySample(tick, 0, protectedCargo.event),
      legacySample(tick, 1, lostCargo.event),
    ];

    const migrated = migrateLegacyV33PlayerVocalizations(
      lostCargo.state,
      samples,
      tick,
      0,
    );
    expect(migrated?.actorVocalizationSamples).toEqual([
      expect.objectContaining({
        expressionEventId: protectedCargo.event.eventId,
        soundLoudness: 950_000,
        soundRangeUnits: 36 * WORLD_POSITION_UNITS_PER_TILE,
        soundInterrupt: "strong",
      }),
      expect.objectContaining({
        expressionEventId: lostCargo.event.eventId,
        soundLoudness: 950_000,
        soundRangeUnits: 36 * WORLD_POSITION_UNITS_PER_TILE,
        soundInterrupt: "strong",
      }),
    ]);
    expect(migrated?.situatedExpressionAdmissions.records.map((record) => ({
      kind: record.kind,
      triggerEventId: record.triggerEventId,
    }))).toEqual([
      { kind: "legacy-v33-player", triggerEventId: "legacy:compat:protect-shout" },
      { kind: "legacy-v33-player", triggerEventId: "legacy:compat:loss" },
    ]);

    const bank = canonicalizeSituatedExpressionChannelBank({
      version: 1,
      channels: migrated?.playerChannel === null || migrated?.playerChannel === undefined
        ? []
        : [migrated.playerChannel],
    });
    expect(bank).not.toBeNull();
    expect(canonicalizeSituatedExpressionTrajectory(
      bank,
      migrated?.situatedExpressionAdmissions,
      0,
      migrated?.actorVocalizationSamples,
    )).not.toBeNull();
  });

  it("fails closed when one sample has ambiguous or impossible recent-memory binding", () => {
    const near = accept(createSituatedExpressionState(), nearFall("legacy:ambiguous:near"));
    const recovered = accept(
      createSituatedExpressionState(),
      recovery("legacy:ambiguous:recovery"),
    );
    const ambiguous = canonicalizeSituatedExpressionState({
      version: SITUATED_EXPRESSION_VERSION,
      completedSteps: 0,
      active: null,
      recent: [recovered.state.recent[0], near.state.recent[0]],
    });
    if (ambiguous === null) throw new Error("Ambiguous fixture was not canonical");

    expect(migrateLegacyV33PlayerVocalizations(
      ambiguous,
      [legacySample(91, 0, recovered.event)],
      91,
      0,
    )).toBeNull();
    expect(migrateLegacyV33PlayerVocalizations(
      near.state,
      [legacySample(91, 0, stumble("legacy:impossible-acoustics"))],
      91,
      0,
    )).toBeNull();
  });

  it("rejects premature active erasure and a self-consistent duration reset", () => {
    const accepted = accept(
      createSituatedExpressionState(),
      stumble("legacy:active-integrity"),
    );
    const sample = legacySample(97, 0, accepted.event);
    const erased = canonicalizeSituatedExpressionState({
      ...accepted.state,
      active: null,
    });
    const reset = canonicalizeSituatedExpressionState({
      ...accepted.state,
      active: {
        ...accepted.state.active,
        durationSteps: 8,
        remainingSteps: 8,
      },
    });
    if (erased === null || reset === null) {
      throw new Error("Legacy tamper fixtures were not structurally canonical");
    }

    expect(migrateLegacyV33PlayerVocalizations(erased, [sample], 97, 0)).toBeNull();
    expect(migrateLegacyV33PlayerVocalizations(reset, [sample], 97, 0)).toBeNull();
  });

  it("rejects post-v33 meanings and malformed legacy sample identity", () => {
    const porter = accept(createSituatedExpressionState(), {
      ...baseIntent("legacy:future-porter"),
      meaning: "porter-heavy-load",
      family: "work",
      tone: "strained",
      volume: "spoken",
      knowledgeBasis: "self-handled-heavy-cargo",
      priority: 240_000,
      salience: 420_000,
      durationSteps: 8,
    });
    expect(migrateLegacyV33PlayerVocalizations(porter.state, [], 108, 0)).toBeNull();

    const fishCrow = accept(createSituatedExpressionState(), {
      ...baseIntent("legacy:future-fish-crow"),
      meaning: "fish-crow-alarm-call",
      family: "animal-signal",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-perceived-threat",
      priority: 760_000,
      salience: 840_000,
      durationSteps: 6,
    });
    expect(migrateLegacyV33PlayerVocalizations(fishCrow.state, [], 108, 0)).toBeNull();

    const marshRabbit = accept(createSituatedExpressionState(), {
      ...baseIntent("legacy:future-marsh-rabbit"),
      meaning: "marsh-rabbit-alarm-thump",
      family: "animal-signal",
      tone: "alarmed",
      volume: "murmur",
      knowledgeBasis: "self-perceived-threat",
      priority: 760_000,
      salience: 840_000,
      durationSteps: 6,
    });
    expect(migrateLegacyV33PlayerVocalizations(marshRabbit.state, [], 108, 0)).toBeNull();

    const marshFox = accept(createSituatedExpressionState(), {
      ...baseIntent("legacy:future-marsh-fox"),
      meaning: "marsh-fox-pursuit-yip",
      family: "animal-signal",
      tone: "restrained",
      volume: "spoken",
      knowledgeBasis: "self-perceived-prey",
      priority: 340_000,
      salience: 840_000,
      durationSteps: 6,
    });
    expect(migrateLegacyV33PlayerVocalizations(marshFox.state, [], 108, 0)).toBeNull();

    const player = accept(createSituatedExpressionState(), stumble("legacy:bad-id"));
    expect(migrateLegacyV33PlayerVocalizations(
      player.state,
      [{ ...legacySample(108, 0, player.event), id: "pv-108-7" }],
      108,
      1,
    )).toBeNull();
    expect(migrateLegacyV33PlayerVocalizations(
      player.state,
      [{ ...legacySample(108, 0, player.event), unexpected: true }],
      108,
      1,
    )).toBeNull();
    expect(migrateLegacyV33PlayerVocalizations(
      player.state,
      [
        legacySample(108, 0, player.event),
        legacySample(108, 1, player.event),
      ],
      108,
      1,
    )).toBeNull();
  });

  it("drops stale cooldown-only authority and retains only active-required memory", () => {
    const old = accept(createSituatedExpressionState(), stumble("legacy:stale"));
    const stale = advance(old.state, 12);
    if (stale === null) throw new Error("Stale fixture failed advancement");
    expect(migrateLegacyV33PlayerVocalizations(stale, [], 120, 0)).toEqual({
      actorVocalizationSamples: [],
      situatedExpressionAdmissions: { version: 1, records: [] },
      playerChannel: null,
    });

    const protectedCargo = accept(stale, protect("legacy:active-only"));
    const migrated = migrateLegacyV33PlayerVocalizations(
      protectedCargo.state,
      [],
      120,
      0,
    );
    expect(migrated).toBeNull();
  });
});

function accept(
  state: SituatedExpressionState,
  intent: SituatedExpressionIntent,
): { readonly state: SituatedExpressionState; readonly event: SituatedExpressionEvent } {
  const reduction = reduceSituatedExpression(state, intent);
  if (!reduction.accepted || reduction.state === null || reduction.event === null) {
    throw new Error(`Expression fixture was not accepted: ${reduction.reason}`);
  }
  const acknowledged = acknowledgeSituatedExpression(reduction.state);
  if (acknowledged.state === null || acknowledged.reason !== "acknowledged") {
    throw new Error("Expression fixture was not acknowledged");
  }
  return { state: acknowledged.state, event: reduction.event };
}

function advance(state: SituatedExpressionState, steps: number): SituatedExpressionState {
  const advanced = advanceSituatedExpression(state, steps);
  if (advanced === null) throw new Error("Expression fixture failed advancement");
  return advanced;
}

function baseIntent(triggerEventId: string, position: WorldPosition = POSITION): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: PLAYER_ID,
    triggerEventId,
    position,
    meaning: "steady-after-stumble",
    family: "footing",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-felt-stumble",
    priority: 180_000,
    salience: 260_000,
    variantSeed: 33,
    durationSteps: 7,
  };
}

function stumble(triggerEventId: string): SituatedExpressionIntent {
  return baseIntent(triggerEventId);
}

function nearFall(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...baseIntent(triggerEventId),
    meaning: "relief-after-near-fall",
    knowledgeBasis: "self-felt-near-fall",
    tone: "relieved",
    volume: "spoken",
    priority: 420_000,
    salience: 650_000,
    durationSteps: 10,
  };
}

function protect(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...baseIntent(triggerEventId),
    meaning: "protect-important-cargo",
    family: "cargo",
    knowledgeBasis: "self-observed-cargo-risk",
    tone: "strained",
    volume: "spoken",
    priority: 620_000,
    salience: 760_000,
    durationSteps: 12,
  };
}

function protectAlarmed(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...protect(triggerEventId),
    tone: "alarmed",
    volume: "shout",
  };
}

function loss(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...baseIntent(triggerEventId),
    meaning: "alarm-at-cargo-loss",
    family: "cargo",
    knowledgeBasis: "self-observed-cargo-loss",
    tone: "alarmed",
    volume: "shout",
    priority: 950_000,
    salience: 980_000,
    durationSteps: 14,
  };
}

function recovery(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...baseIntent(triggerEventId),
    meaning: "relief-after-cargo-recovery",
    family: "cargo",
    knowledgeBasis: "self-recovered-cargo",
    tone: "relieved",
    volume: "spoken",
    priority: 520_000,
    salience: 720_000,
    durationSteps: 9,
  };
}

function legacySample(
  completedTick: number,
  ordinal: number,
  eventOrIntent: Pick<SituatedExpressionEvent | SituatedExpressionIntent, "position" | "tone" | "volume">,
): LegacyPlayerVocalizationSample {
  const loudness = eventOrIntent.volume === "shout"
    ? 950_000
    : eventOrIntent.volume === "spoken"
      ? 620_000
      : 360_000;
  const rangeTiles = eventOrIntent.volume === "shout"
    ? 36
    : eventOrIntent.volume === "spoken"
      ? 18
      : 8;
  return {
    id: `pv-${completedTick}-${ordinal}`,
    position: eventOrIntent.position,
    soundLoudness: loudness,
    soundRangeUnits: rangeTiles * WORLD_POSITION_UNITS_PER_TILE,
    soundClass: "human-vocalization",
    soundInterrupt: eventOrIntent.tone === "alarmed" || eventOrIntent.volume === "shout"
      ? "strong"
      : "none",
  };
}

function eventBinding(completedTick: number, ordinal: number, triggerEventId: string) {
  return {
    id: `av-${completedTick}-${ordinal}`,
    expressionEventId: situatedExpressionEventIdForTrigger(PLAYER_ID, triggerEventId),
  };
}
