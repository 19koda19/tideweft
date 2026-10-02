import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import {
  SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT,
  SITUATED_EXPRESSION_VERSION,
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionIntent,
  type SituatedExpressionState,
} from "./situatedExpression";
import { createWorldPosition } from "./worldPosition";

const SPEAKER_ID = "H-expression-test";
const POSITION = createWorldPosition(createRegionCoord(-7, 12), 23_000, 41_000);

function stumbleIntent(
  triggerEventId: string,
  overrides: Partial<SituatedExpressionIntent> = {},
): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
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
    durationSteps: 4,
    ...overrides,
  };
}

function protectCargoIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "protect-important-cargo",
    family: "cargo",
    tone: "strained",
    volume: "spoken",
    knowledgeBasis: "self-observed-cargo-risk",
    priority: 420_000,
    salience: 540_000,
    variantSeed: 81,
    durationSteps: 12,
  };
}

function cargoLossIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "alarm-at-cargo-loss",
    family: "cargo",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-observed-cargo-loss",
    priority: 950_000,
    salience: 980_000,
    variantSeed: 144,
    durationSteps: 9,
  };
}

function cargoRecoveryIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "relief-after-cargo-recovery",
    family: "cargo",
    tone: "relieved",
    volume: "spoken",
    knowledgeBasis: "self-recovered-cargo",
    priority: 520_000,
    salience: 720_000,
    variantSeed: 233,
    durationSteps: 7,
  };
}

function heavyPorterIntent(
  triggerEventId: string,
  overrides: Partial<SituatedExpressionIntent> = {},
): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "porter-heavy-load",
    family: "work",
    tone: "strained",
    volume: "spoken",
    knowledgeBasis: "self-handled-heavy-cargo",
    priority: 240_000,
    salience: 320_000,
    variantSeed: 377,
    durationSteps: 6,
    ...overrides,
  };
}

function fishCrowAlarmIntent(
  triggerEventId: string,
  overrides: Partial<SituatedExpressionIntent> = {},
): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "CROW-expression-test",
    triggerEventId,
    position: POSITION,
    meaning: "fish-crow-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 920_000,
    variantSeed: 610,
    durationSteps: 6,
    ...overrides,
  };
}

function deerAlarmIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...fishCrowAlarmIntent(triggerEventId),
    sourceActorId: "DEER-expression-test",
    meaning: "deer-alarm-call",
    variantSeed: 611,
  };
}

function gullAlarmIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...fishCrowAlarmIntent(triggerEventId),
    sourceActorId: "GULL-expression-test",
    meaning: "gull-alarm-call",
    variantSeed: 613,
  };
}

function elkAlarmIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...fishCrowAlarmIntent(triggerEventId),
    sourceActorId: "ELK-expression-test",
    meaning: "elk-alarm-call",
    variantSeed: 614,
  };
}

function marshRabbitAlarmIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...fishCrowAlarmIntent(triggerEventId),
    sourceActorId: "RABBIT-expression-test",
    meaning: "marsh-rabbit-alarm-thump",
    volume: "murmur",
    variantSeed: 612,
  };
}

function marshFoxPursuitIntent(
  triggerEventId: string,
  overrides: Partial<SituatedExpressionIntent> = {},
): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "FOX-expression-test",
    triggerEventId,
    position: POSITION,
    meaning: "marsh-fox-pursuit-yip",
    family: "animal-signal",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-perceived-prey",
    priority: 340_000,
    salience: 900_000,
    variantSeed: 614,
    durationSteps: 6,
    ...overrides,
  };
}

function domesticCatRainDistressIntent(
  triggerEventId: string,
  overrides: Partial<SituatedExpressionIntent> = {},
): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "CAT-expression-test",
    triggerEventId,
    position: POSITION,
    meaning: "domestic-cat-rain-distress-call",
    family: "animal-signal",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-weather-distress",
    priority: 300_000,
    salience: 680_000,
    variantSeed: 613,
    durationSteps: 6,
    ...overrides,
  };
}

function keeperStoreResponseIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "H-store-keeper-expression-test",
    triggerEventId,
    position: POSITION,
    meaning: "keeper-secure-store-response",
    family: "work",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-committed-store-closure",
    priority: 600_000,
    salience: 700_000,
    variantSeed: 987,
    durationSteps: 12,
  };
}

function effortIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: SPEAKER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "need-rest-after-exertion",
    family: "condition",
    tone: "strained",
    volume: "murmur",
    knowledgeBasis: "self-felt-exhaustion",
    priority: 260_000,
    salience: 440_000,
    variantSeed: 1_597,
    durationSteps: 8,
  };
}

function accepted(
  state: SituatedExpressionState,
  intent: SituatedExpressionIntent,
): SituatedExpressionState {
  const reduction = reduceSituatedExpression(state, intent);
  if (!reduction.accepted || reduction.state === null) {
    throw new Error(`Expected expression acceptance, received ${reduction.reason}`);
  }
  return reduction.state;
}

describe("generic situated-expression kernel", () => {
  it("keeps effort sparse and yields its shared channel to urgent warnings", () => {
    const effort = reduceSituatedExpression(
      createSituatedExpressionState(),
      effortIntent("player-dry-exhaustion:effort-1"),
    );
    expect(effort).toMatchObject({
      accepted: true,
      event: {
        meaning: "need-rest-after-exertion",
        family: "condition",
        vocalization: "strained",
      },
    });
    expect(projectSituatedExpression(effort.event)?.text)
      .toMatch(/^(Need a minute\.|Just a second\.|Catch my breath\.)$/u);
    if (effort.state === null) throw new Error("Effort fixture omitted state");
    const afterLine = advanceSituatedExpression(effort.state, 8);
    if (afterLine === null) throw new Error("Effort fixture failed to advance");
    expect(reduceSituatedExpression(
      afterLine,
      effortIntent("player-dry-exhaustion:effort-2"),
    )).toMatchObject({ accepted: false, reason: "meaning-cooldown" });

    const warning = accepted(
      createSituatedExpressionState(),
      cargoLossIntent("cargo:loss:warning-first"),
    );
    expect(reduceSituatedExpression(
      warning,
      effortIntent("player-dry-exhaustion:effort-blocked"),
    )).toMatchObject({
      accepted: false,
      reason: "active-expression-has-priority",
      state: warning,
    });
    expect(reduceSituatedExpression(
      accepted(
        createSituatedExpressionState(),
        effortIntent("player-dry-exhaustion:effort-first"),
      ),
      cargoLossIntent("cargo:loss:warning-interrupts"),
    )).toMatchObject({
      accepted: true,
      reason: "interrupted",
      event: { meaning: "alarm-at-cargo-loss" },
    });
  });

  it("projects the keeper's committed reply as fixed authored speech", () => {
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      keeperStoreResponseIntent("STORE-SECURE-store-1-evidence-1"),
    );
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "keeper-secure-store-response",
        family: "work",
        vocalization: "steady",
        volume: "spoken",
        durationSteps: 12,
      },
    });
    expect(projectSituatedExpression(reduction.event)).toMatchObject({
      text: "Storehouse door's barred.",
      vocalization: "steady",
    });
    expect(reduceSituatedExpression(createSituatedExpressionState(), {
      ...keeperStoreResponseIntent("STORE-SECURE-store-1-evidence-1"),
      knowledgeBasis: "self-handled-heavy-cargo",
    })).toMatchObject({ accepted: false, reason: "invalid-intent" });
  });

  it("suppresses a repeated mild stumble by semantic meaning", () => {
    const first = reduceSituatedExpression(
      createSituatedExpressionState(),
      stumbleIntent("traversal:stumble:1"),
    );
    expect(first).toMatchObject({
      accepted: true,
      reason: "accepted",
      silenceReason: null,
    });
    if (first.state === null) throw new Error("Accepted expression omitted state");

    const afterVisibleExpiry = advanceSituatedExpression(first.state, 4);
    if (afterVisibleExpiry === null) throw new Error("Valid state failed to advance");
    expect(afterVisibleExpiry.active).toBeNull();
    const repeated = reduceSituatedExpression(
      afterVisibleExpiry,
      stumbleIntent("traversal:stumble:2", { variantSeed: 18 }),
    );
    expect(repeated).toMatchObject({
      accepted: false,
      reason: "meaning-cooldown",
      silenceReason: "meaning-cooldown",
      event: null,
    });
    expect(repeated.state).toEqual(afterVisibleExpiry);
    expect(reduceSituatedExpression(
      afterVisibleExpiry,
      stumbleIntent("traversal:stumble:1"),
    )).toMatchObject({
      accepted: false,
      reason: "duplicate-trigger",
    });
  });

  it("lets urgent cargo loss interrupt lower-priority cargo protection", () => {
    const protecting = accepted(
      createSituatedExpressionState(),
      protectCargoIntent("cargo:risk:1"),
    );
    const alarm = reduceSituatedExpression(protecting, cargoLossIntent("cargo:loss:1"));
    expect(alarm).toMatchObject({
      accepted: true,
      reason: "interrupted",
      event: {
        sourceActorId: SPEAKER_ID,
        triggerEventId: "cargo:loss:1",
        meaning: "alarm-at-cargo-loss",
        family: "cargo",
        vocalization: "alarm",
        audioAcknowledged: false,
      },
    });
    expect(alarm.state?.active).toEqual(alarm.event);
  });

  it("lets committed cargo recovery immediately resolve the active loss alarm", () => {
    const protecting = accepted(
      createSituatedExpressionState(),
      protectCargoIntent("cargo:risk:2"),
    );
    const alarm = reduceSituatedExpression(protecting, cargoLossIntent("cargo:loss:2"));
    if (alarm.state === null) throw new Error("Cargo-loss alarm omitted state");

    const recovery = reduceSituatedExpression(
      alarm.state,
      cargoRecoveryIntent("cargo:recovery:2"),
    );
    expect(recovery).toMatchObject({
      accepted: true,
      reason: "interrupted",
      event: {
        meaning: "relief-after-cargo-recovery",
        vocalization: "relief",
        remainingSteps: 7,
      },
    });
    if (recovery.state === null) throw new Error("Cargo recovery omitted state");
    expect(reduceSituatedExpression(
      recovery.state,
      cargoRecoveryIntent("cargo:recovery:3"),
    )).toMatchObject({
      accepted: false,
      reason: "meaning-cooldown",
    });
  });

  it("acknowledges active audio exactly once without consuming text projection", () => {
    const state = accepted(
      createSituatedExpressionState(),
      cargoLossIntent("cargo:loss:audio"),
    );
    const first = acknowledgeSituatedExpression(state);
    expect(first).toMatchObject({
      reason: "acknowledged",
      event: { audioAcknowledged: true, vocalization: "alarm" },
    });
    if (first.state === null || first.event === null) {
      throw new Error("First acknowledgement omitted state or event");
    }
    expect(projectSituatedExpression(first.event)).toMatchObject({
      realizationKey: first.event.realizationKey,
      vocalization: "alarm",
    });

    const second = acknowledgeSituatedExpression(first.state);
    expect(second).toEqual({
      reason: "already-acknowledged",
      state: first.state,
      event: null,
    });
  });

  it("selects authored realization deterministically without storing prose", () => {
    const intent = stumbleIntent("traversal:stable-realization", { variantSeed: 4_294_967_295 });
    const first = reduceSituatedExpression(createSituatedExpressionState(), intent);
    const second = reduceSituatedExpression(createSituatedExpressionState(), structuredClone(intent));
    expect(first.event).toEqual(second.event);
    if (first.event === null) throw new Error("Deterministic expression was not accepted");

    const projection = projectSituatedExpression(first.event);
    expect(projection).toEqual(projectSituatedExpression(structuredClone(first.event)));
    expect(projection?.realizationKey).toBe(first.event.realizationKey);
    expect(projection?.vocalization).toBe("steady");
    expect(projection?.text.length).toBeGreaterThan(0);
    expect(Object.keys(first.event)).not.toContain("text");
    expect(JSON.stringify(first.event)).not.toContain(projection?.text ?? "impossible-text");
  });

  it("admits restrained heavy-porter work only from self-handled cargo truth", () => {
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      heavyPorterIntent("work:porter:heavy:1"),
    );
    expect(reduction).toMatchObject({
      accepted: true,
      reason: "accepted",
      event: {
        meaning: "porter-heavy-load",
        family: "work",
        tone: "strained",
        volume: "spoken",
        knowledgeBasis: "self-handled-heavy-cargo",
        vocalization: "strained",
      },
    });
    if (reduction.event === null) throw new Error("Heavy porter expression was not accepted");
    expect(projectSituatedExpression(reduction.event)?.text).toMatch(/^(Heavy one\.|Got it\.|Easy\.)$/u);

    for (const forged of [
      heavyPorterIntent("work:porter:heavy:wrong-family", { family: "cargo" }),
      heavyPorterIntent("work:porter:heavy:wrong-knowledge", {
        knowledgeBasis: "self-observed-cargo-risk",
      }),
      heavyPorterIntent("work:porter:heavy:wrong-tone", { tone: "alarmed" }),
      heavyPorterIntent("work:porter:heavy:wrong-volume", { volume: "shout" }),
    ]) {
      expect(reduceSituatedExpression(createSituatedExpressionState(), forged)).toMatchObject({
        accepted: false,
        reason: "invalid-intent",
        event: null,
      });
    }
  });

  it("registers one species-specific fish-crow alarm without translating its cause", () => {
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      fishCrowAlarmIntent("CROW-expression-test:e:1:alarm"),
    );
    expect(reduction).toMatchObject({
      accepted: true,
      reason: "accepted",
      event: {
        meaning: "fish-crow-alarm-call",
        family: "animal-signal",
        tone: "alarmed",
        volume: "shout",
        knowledgeBasis: "self-perceived-threat",
        vocalization: "fish-crow-alarm",
      },
    });
    if (reduction.event === null) throw new Error("Fish-crow alarm was not accepted");
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "KRAA! KRAA!",
      realizationKey: "situated-expression.en.v1.fish-crow-alarm-call.0",
      vocalization: "fish-crow-alarm",
    });
    expect(Object.keys(reduction.event)).not.toContain("causeReferenceId");

    for (const forged of [
      fishCrowAlarmIntent("CROW-expression-test:e:2:alarm", { family: "footing" }),
      fishCrowAlarmIntent("CROW-expression-test:e:3:alarm", { tone: "restrained" }),
      fishCrowAlarmIntent("CROW-expression-test:e:4:alarm", { volume: "spoken" }),
      fishCrowAlarmIntent("CROW-expression-test:e:5:alarm", {
        knowledgeBasis: "self-heard-anonymous-alarm",
      }),
    ]) {
      expect(reduceSituatedExpression(createSituatedExpressionState(), forged)).toMatchObject({
        accepted: false,
        reason: "invalid-intent",
        event: null,
      });
    }
  });

  it("registers the deer alarm through the same animal-signal policy", () => {
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      deerAlarmIntent("DEER-expression-test:e:1:alarm"),
    );
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "deer-alarm-call",
        family: "animal-signal",
        vocalization: "deer-alarm-snort",
      },
    });
    if (reduction.event === null) throw new Error("Deer alarm was not accepted");
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "SNORT!",
      realizationKey: "situated-expression.en.v1.deer-alarm-call.0",
      vocalization: "deer-alarm-snort",
    });
  });

  it("registers the gull alarm through the shared animal-signal policy", () => {
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      gullAlarmIntent("GULL-expression-test:e:1:alarm"),
    );
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "gull-alarm-call",
        family: "animal-signal",
        vocalization: "gull-alarm-cry",
      },
    });
    if (reduction.event === null) throw new Error("Gull alarm was not accepted");
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "KEE-AH!",
      realizationKey: "situated-expression.en.v1.gull-alarm-call.0",
      vocalization: "gull-alarm-cry",
    });
  });

  it("registers and roundtrips the restrained elk alarm bark through the shared policy", () => {
    const intent = elkAlarmIntent("ELK-expression-test:e:1:alarm");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "elk-alarm-call",
        family: "animal-signal",
        tone: "alarmed",
        volume: "shout",
        vocalization: "elk-alarm-bark",
        durationSteps: 6,
      },
    });
    if (reduction.event === null || reduction.state === null) {
      throw new Error("Elk alarm was not accepted");
    }
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "BARK!",
      realizationKey: "situated-expression.en.v1.elk-alarm-call.0",
      vocalization: "elk-alarm-bark",
    });
    expect(canonicalizeSituatedExpressionState(JSON.parse(JSON.stringify(reduction.state))))
      .toEqual(reduction.state);
    for (const forged of [
      { ...intent, volume: "murmur" },
      { ...intent, tone: "restrained" },
      { ...intent, knowledgeBasis: "self-heard-anonymous-alarm" },
    ]) {
      expect(reduceSituatedExpression(createSituatedExpressionState(), forged))
        .toMatchObject({ accepted: false, reason: "invalid-intent" });
    }
  });

  it("registers the marsh-rabbit foot-thump without promoting it to a shout", () => {
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      marshRabbitAlarmIntent("RABBIT-expression-test:e:1:alarm"),
    );
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "marsh-rabbit-alarm-thump",
        family: "animal-signal",
        tone: "alarmed",
        volume: "murmur",
        vocalization: "marsh-rabbit-alarm-thump",
      },
    });
    if (reduction.event === null) throw new Error("Marsh-rabbit alarm was not accepted");
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "thump",
      realizationKey: "situated-expression.en.v1.marsh-rabbit-alarm-thump.0",
      vocalization: "marsh-rabbit-alarm-thump",
    });
    expect(reduceSituatedExpression(createSituatedExpressionState(), {
      ...marshRabbitAlarmIntent("RABBIT-expression-test:e:2:alarm"),
      volume: "shout",
    })).toMatchObject({ accepted: false, reason: "invalid-intent" });
  });

  it("registers one restrained marsh-fox pursuit yip without exposing prey", () => {
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      marshFoxPursuitIntent("FOX-expression-test:e:1:pursue"),
    );
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "marsh-fox-pursuit-yip",
        family: "animal-signal",
        tone: "restrained",
        volume: "spoken",
        knowledgeBasis: "self-perceived-prey",
        vocalization: "marsh-fox-pursuit-yip",
      },
    });
    if (reduction.event === null) throw new Error("Marsh-fox pursuit yip was not accepted");
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "YIP.",
      realizationKey: "situated-expression.en.v1.marsh-fox-pursuit-yip.0",
      vocalization: "marsh-fox-pursuit-yip",
    });
    expect(JSON.stringify(reduction.event)).not.toContain("prey-actor");

    for (const forged of [
      marshFoxPursuitIntent("FOX-expression-test:e:2:pursue", {
        knowledgeBasis: "self-perceived-threat",
      }),
      marshFoxPursuitIntent("FOX-expression-test:e:3:pursue", { tone: "alarmed" }),
      marshFoxPursuitIntent("FOX-expression-test:e:4:pursue", { volume: "shout" }),
      marshFoxPursuitIntent("FOX-expression-test:e:5:pursue", { family: "warning" }),
    ]) {
      expect(reduceSituatedExpression(createSituatedExpressionState(), forged))
        .toMatchObject({ accepted: false, reason: "invalid-intent" });
    }
  });

  it("registers the restrained domestic-cat rain call as authored animal sound", () => {
    const reduction = reduceSituatedExpression(
      createSituatedExpressionState(),
      domesticCatRainDistressIntent("CAT-expression-test:e:1:retreat"),
    );
    expect(reduction).toMatchObject({
      accepted: true,
      event: {
        meaning: "domestic-cat-rain-distress-call",
        family: "animal-signal",
        tone: "restrained",
        volume: "murmur",
        knowledgeBasis: "self-weather-distress",
        vocalization: "domestic-cat-rain-distress",
        durationSteps: 6,
      },
    });
    expect(projectSituatedExpression(reduction.event)).toEqual({
      text: "MRROW.",
      realizationKey: "situated-expression.en.v1.domestic-cat-rain-distress-call.0",
      vocalization: "domestic-cat-rain-distress",
    });
    for (const forged of [
      domesticCatRainDistressIntent("CAT-expression-test:e:2:retreat", {
        knowledgeBasis: "self-perceived-threat",
      }),
      domesticCatRainDistressIntent("CAT-expression-test:e:3:retreat", {
        tone: "alarmed",
      }),
      domesticCatRainDistressIntent("CAT-expression-test:e:4:retreat", {
        volume: "spoken",
      }),
    ]) {
      expect(reduceSituatedExpression(createSituatedExpressionState(), forged))
        .toMatchObject({ accepted: false, reason: "invalid-intent" });
    }
  });

  it("keeps heavy-work chatter bounded and every restrained authored line reachable", () => {
    const acceptedWork = reduceSituatedExpression(
      createSituatedExpressionState(),
      heavyPorterIntent("work:porter:heavy:cooldown"),
    );
    if (acceptedWork.state === null) throw new Error("Heavy porter cooldown fixture was not accepted");
    const afterLine = advanceSituatedExpression(acceptedWork.state, 6);
    if (afterLine === null) throw new Error("Heavy porter cooldown state failed to advance");
    expect(reduceSituatedExpression(
      afterLine,
      heavyPorterIntent("work:porter:heavy:too-soon", { variantSeed: 378 }),
    )).toMatchObject({
      accepted: false,
      reason: "meaning-cooldown",
    });

    const lines = new Set<string>();
    for (let variantSeed = 0; variantSeed < 64; variantSeed += 1) {
      const event = reduceSituatedExpression(
        createSituatedExpressionState(),
        heavyPorterIntent(`work:porter:heavy:line:${variantSeed}`, { variantSeed }),
      ).event;
      if (event === null) throw new Error("Heavy porter realization fixture was not accepted");
      const projection = projectSituatedExpression(event);
      if (projection === null) throw new Error("Heavy porter realization did not project");
      lines.add(projection.text);
    }
    expect([...lines].sort()).toEqual(["Easy.", "Got it.", "Heavy one."]);
  });

  it("scopes semantic cooldowns to the actor who actually spoke", () => {
    const first = reduceSituatedExpression(
      createSituatedExpressionState(),
      heavyPorterIntent("work:porter:heavy:first"),
    );
    if (first.state === null) throw new Error("First porter expression was not accepted");
    const afterLine = advanceSituatedExpression(first.state, 6);
    if (afterLine === null) throw new Error("Porter expression state failed to advance");

    expect(reduceSituatedExpression(
      afterLine,
      heavyPorterIntent("work:porter:heavy:other", {
        sourceActorId: "human:porter:other",
      }),
    )).toMatchObject({
      accepted: true,
      reason: "accepted",
      event: { sourceActorId: "human:porter:other" },
    });
  });

  it("keeps existing version-one states canonical after appending work vocabulary", () => {
    const priorVocabularyState = accepted(
      createSituatedExpressionState(41),
      stumbleIntent("traversal:v1-compatibility"),
    );
    const serialized = structuredClone(priorVocabularyState);
    const restored = canonicalizeSituatedExpressionState(serialized);
    expect(restored).toEqual(priorVocabularyState);
    expect(restored).toMatchObject({
      version: 1,
      active: {
        version: 1,
        catalogVersion: 1,
        meaning: "steady-after-stumble",
        family: "footing",
      },
    });
  });

  it("fails closed on malformed input and keeps recent memory bounded", () => {
    const validState = createSituatedExpressionState();
    const invalidIntent = {
      ...stumbleIntent("traversal:malformed"),
      knowledgeBasis: "self-observed-cargo-loss",
    };
    expect(reduceSituatedExpression(validState, invalidIntent)).toEqual({
      accepted: false,
      reason: "invalid-intent",
      silenceReason: "invalid-intent",
      state: validState,
      event: null,
    });
    expect(reduceSituatedExpression(
      { ...validState, completedSteps: -1 },
      stumbleIntent("traversal:valid"),
    )).toEqual({
      accepted: false,
      reason: "invalid-state",
      silenceReason: "invalid-state",
      state: null,
      event: null,
    });
    expect(advanceSituatedExpression({ ...validState, recent: [{}] })).toBeNull();
    expect(acknowledgeSituatedExpression({ ...validState, extra: true })).toEqual({
      reason: "invalid-state",
      state: null,
      event: null,
    });

    let state = validState;
    for (let index = 0; index < SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT + 3; index += 1) {
      state = accepted(state, stumbleIntent(`traversal:bounded:${index}`, {
        variantSeed: index,
      }));
      const advanced = advanceSituatedExpression(state, 12);
      if (advanced === null) throw new Error("Bounded-memory state failed to advance");
      state = advanced;
    }
    expect(state.recent).toHaveLength(SITUATED_EXPRESSION_RECENT_MEMORY_LIMIT);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.recent)).toBe(true);

    const projected = reduceSituatedExpression(
      createSituatedExpressionState(),
      stumbleIntent("traversal:forged-projection"),
    ).event;
    if (projected === null) throw new Error("Projection fixture was not accepted");
    const tampered = {
      ...projected,
      realizationKey: "situated-expression.en.v1.forged.0",
    };
    expect(projectSituatedExpression(tampered)).toBeNull();
  });
});
