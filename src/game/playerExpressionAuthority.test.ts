import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { createCraftingInventory } from "./crafting";
import {
  dropLooseCargo,
  pickupLooseCargo,
  scatterLooseCargo,
} from "./looseCargo";
import { createPlayer } from "./player";
import { guardianDogShelterWhineTriggerEventId } from "./dogSignalExpression";
import { playerEffortExpressionPolicy } from "./playerEffortExpression";
import {
  commitPhysicalCargoState,
  createPhysicalCargoStateFromPlayer,
  type PhysicalCargoState,
} from "./physicalCargoState";
import {
  playerExpressionAdmissionSoundPolicy,
  playerExpressionEventMatchesAuthority,
  playerExpressionEventMatchesAdmission,
  playerExpressionMemoryMatchesAuthority,
  playerExpressionMemoryMatchesAdmission,
  type PlayerExpressionAuthority,
} from "./playerExpressionAuthority";
import {
  SITUATED_EXPRESSION_VERSION,
  advanceSituatedExpression,
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionMeaning,
  type SituatedExpressionMemory,
} from "./situatedExpression";
import {
  createCoreWildlifeAlarmExpressionAdmissionRecord,
  createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord,
  createGuardianDogShelterWhineExpressionAdmissionRecord,
  createLegacyV33PlayerExpressionAdmissionRecord,
  createPlayerExhaustionExpressionAdmissionRecord,
  createPlayerTraversalExpressionAdmissionRecord,
  type PlayerTraversalExpressionAdmissionRecord,
  type PlayerTraversalExpressionCausalClass,
} from "./situatedExpressionAdmissionLedger";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  TRAVERSAL_FEEDBACK_VERSION,
  type TraversalFeedbackState,
  type TraversalIncident,
} from "./traversalFeedback";
import { createWorldPosition } from "./worldPosition";

const POSITION = createWorldPosition(createRegionCoord(-3, 8), 4_000, 9_000);

function feedback(
  kind: TraversalIncident["kind"] = "stumble",
  overrides: Partial<TraversalIncident> = {},
): TraversalFeedbackState {
  const fell = kind === "fall" || kind === "sweep";
  const incident: TraversalIncident = {
    id: "player:0:traversal:7",
    actorId: 0,
    traversalOrdinal: 7,
    kind,
    primaryCause: "loose-rock",
    label: fell ? "THUD · loose rock" : "oop · loose rock",
    detail: fell
      ? "Cargo can separate; regain your feet before moving."
      : "Brace or choose a sounder line.",
    position: { x: 12, y: 14 },
    remainingSteps: fell ? 24 : 10,
    totalSteps: fell ? 24 : 10,
    variantSeed: 481,
    cue: kind === "sweep" ? "sweep" : fell ? "impact" : "stumble",
    ...overrides,
  };
  return {
    version: TRAVERSAL_FEEDBACK_VERSION,
    completedSteps: 0,
    nextTraversalOrdinal: 8,
    incident,
    lastAudibleIncidentId: incident.id,
  };
}

function noIncidentFeedback(): TraversalFeedbackState {
  return {
    version: TRAVERSAL_FEEDBACK_VERSION,
    completedSteps: 20,
    nextTraversalOrdinal: 8,
    incident: null,
    lastAudibleIncidentId: "player:0:traversal:7",
  };
}

function emptyPhysicalCargo(): PhysicalCargoState {
  const world = createWorldView(createWorld("player expression authority", "standard"));
  const player = createPlayer(world);
  player.craftingInventory = createCraftingInventory(1_000_000, { cordreed: 2 });
  return createPhysicalCargoStateFromPlayer(player, 8, 8);
}

function committedCargoMutation(
  prior: PhysicalCargoState,
  world: PhysicalCargoState["looseWorld"],
  carrier: PhysicalCargoState["carrier"],
): PhysicalCargoState {
  return commitPhysicalCargoState(prior, { looseWorld: world, carrier }, { kind: "conserved" });
}

function fallCargoAuthority(): Readonly<{
  separated: PhysicalCargoState;
  recovered: PhysicalCargoState;
  separatedEntityId: string;
  separationEventId: string;
  recoveryEventId: string;
}> {
  const initial = emptyPhysicalCargo();
  const separated = scatterLooseCargo(initial.looseWorld, initial.carrier, {
    lotId: "crafting-stack:cordreed",
    x: 500_000,
    y: 500_000,
    cause: "fall-separation",
    parts: [{ quantity: 1, velocityX: 0, velocityY: 0 }],
  });
  if (!separated.ok || separated.entities[0] === undefined) {
    throw new Error("Fall authority fixture could not separate cargo");
  }
  const separatedEntityId = separated.entities[0].id;
  const separationEventId = separated.world.history.at(-1)?.id;
  if (separationEventId === undefined) {
    throw new Error("Fall authority fixture omitted its separation record");
  }
  const separatedState = committedCargoMutation(initial, separated.world, separated.carrier);
  const recovered = pickupLooseCargo(separated.world, separated.carrier, {
    entityId: separatedEntityId,
    x: 500_000,
    y: 500_000,
    reach: 0,
  });
  if (!recovered.ok) throw new Error("Fall authority fixture could not recover cargo");
  const recoveredState = committedCargoMutation(
    separatedState,
    recovered.world,
    recovered.carrier,
  );
  const recoveryEventId = recovered.world.history.at(-1)?.id;
  if (recoveryEventId === undefined) throw new Error("Recovery fixture omitted its record");
  return {
    separated: separatedState,
    recovered: recoveredState,
    separatedEntityId,
    separationEventId,
    recoveryEventId,
  };
}

function ordinaryRecoveryAuthority(): Readonly<{
  state: PhysicalCargoState;
  recoveryEventId: string;
}> {
  const initial = emptyPhysicalCargo();
  const dropped = dropLooseCargo(initial.looseWorld, initial.carrier, {
    lotId: "crafting-stack:cordreed",
    quantity: 1,
    x: 500_000,
    y: 500_000,
  });
  if (!dropped.ok || dropped.entity === null) {
    throw new Error("Ordinary recovery fixture could not drop cargo");
  }
  const droppedState = committedCargoMutation(initial, dropped.world, dropped.carrier);
  const recovered = pickupLooseCargo(dropped.world, dropped.carrier, {
    entityId: dropped.entity.id,
    x: 500_000,
    y: 500_000,
    reach: 0,
  });
  if (!recovered.ok) throw new Error("Ordinary recovery fixture could not recover cargo");
  const state = committedCargoMutation(droppedState, recovered.world, recovered.carrier);
  const recoveryEventId = recovered.world.history.at(-1)?.id;
  if (recoveryEventId === undefined) throw new Error("Recovery fixture omitted its record");
  return { state, recoveryEventId };
}

function policy(
  meaning: SituatedExpressionMeaning,
  traversal: TraversalFeedbackState,
  recoveryEventId?: string,
): Omit<SituatedExpressionIntent, "version" | "sourceActorId" | "position"> {
  const incident = traversal.incident;
  const triggerEventId = recoveryEventId ?? incident?.id ?? "missing-authority";
  const variantSeed = recoveryEventId === undefined
    ? incident?.variantSeed ?? 0
    : Number(recoveryEventId.split(":").at(-1)) >>> 0;
  switch (meaning) {
    case "steady-after-stumble": return {
      triggerEventId,
      meaning,
      family: "footing",
      tone: "restrained",
      volume: "murmur",
      knowledgeBasis: "self-felt-stumble",
      priority: 180_000,
      salience: 260_000,
      variantSeed,
      durationSteps: 7,
    };
    case "relief-after-near-fall": return {
      triggerEventId,
      meaning,
      family: "footing",
      tone: "relieved",
      volume: "spoken",
      knowledgeBasis: "self-felt-near-fall",
      priority: 420_000,
      salience: 650_000,
      variantSeed,
      durationSteps: 10,
    };
    case "protect-important-cargo": {
      const alarmed = incident?.kind === "fall" || incident?.kind === "sweep";
      return {
        triggerEventId,
        meaning,
        family: "cargo",
        tone: alarmed ? "alarmed" : "strained",
        volume: alarmed ? "shout" : "spoken",
        knowledgeBasis: "self-observed-cargo-risk",
        priority: 620_000,
        salience: 760_000,
        variantSeed,
        durationSteps: 12,
      };
    }
    case "alarm-at-cargo-loss": return {
      triggerEventId,
      meaning,
      family: "cargo",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-observed-cargo-loss",
      priority: 950_000,
      salience: 980_000,
      variantSeed,
      durationSteps: 14,
    };
    case "relief-after-cargo-recovery": return {
      triggerEventId,
      meaning,
      family: "cargo",
      tone: "relieved",
      volume: "spoken",
      knowledgeBasis: "self-recovered-cargo",
      priority: 520_000,
      salience: 720_000,
      variantSeed,
      durationSteps: 9,
    };
    case "porter-heavy-load": throw new Error("Porter speech is not player authority");
    case "guardian-dog-warning": throw new Error("Dog calls are not player authority");
    case "guardian-dog-defensive-growl": throw new Error("Dog calls are not player authority");
    case "guardian-dog-shelter-whine": throw new Error("Dog calls are not player authority");
    case "domestic-cat-rain-distress-call": throw new Error("Cat calls are not player authority");
    case "fish-crow-alarm-call": throw new Error("Fish-crow calls are not player authority");
    case "deer-alarm-call": throw new Error("Deer calls are not player authority");
    case "gull-alarm-call": throw new Error("Gull calls are not player authority");
    case "elk-alarm-call": throw new Error("Elk calls are not player authority");
    case "wild-boar-alarm-call": throw new Error("Boar calls are not player authority");
    case "marsh-rabbit-alarm-thump": throw new Error("Rabbit calls are not player authority");
    case "marsh-fox-pursuit-yip": throw new Error("Fox calls are not player authority");
    case "human-danger-warning":
    case "keeper-secure-store-response":
    case "resident-introduction":
    case "resident-weather-hold":
      throw new Error("Other human expressions are not player authority");
    case "need-rest-after-exertion":
      throw new Error("Effort speech uses exact exhaustion admission authority");
  }
}

function eventFor(
  meaning: SituatedExpressionMeaning,
  traversal: TraversalFeedbackState,
  recoveryEventId?: string,
  overrides: Partial<SituatedExpressionIntent> = {},
): SituatedExpressionEvent {
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "player:local",
    position: POSITION,
    ...policy(meaning, traversal, recoveryEventId),
    ...overrides,
  });
  if (!reduction.accepted || reduction.event === null) {
    throw new Error(`Expression fixture was rejected: ${reduction.reason}`);
  }
  return reduction.event;
}

function memoryFor(event: SituatedExpressionEvent, elapsedSteps = 0): SituatedExpressionMemory {
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
    version: event.version,
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    position: event.position,
    meaning: event.meaning,
    family: event.family,
    tone: event.tone,
    volume: event.volume,
    knowledgeBasis: event.knowledgeBasis,
    priority: event.priority,
    salience: event.salience,
    variantSeed: event.variantSeed,
    durationSteps: event.durationSteps,
  });
  const advanced = advanceSituatedExpression(reduction.state, elapsedSteps);
  const memory = advanced?.recent[0];
  if (memory === undefined) throw new Error("Expression fixture omitted cooldown memory");
  return memory;
}

function fishCrowEvent(sourceActorId: string): SituatedExpressionEvent {
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId: "core-wildlife:fish-crow-alarm:authority",
    position: POSITION,
    meaning: "fish-crow-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 840_000,
    variantSeed: 113,
    durationSteps: 6,
  });
  if (!reduction.accepted || reduction.event === null) {
    throw new Error(`Fish-crow fixture was rejected: ${reduction.reason}`);
  }
  return reduction.event;
}

function marshRabbitEvent(sourceActorId: string): SituatedExpressionEvent {
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId: "core-wildlife:marsh-rabbit-alarm:authority",
    position: POSITION,
    meaning: "marsh-rabbit-alarm-thump",
    family: "animal-signal",
    tone: "alarmed",
    volume: "murmur",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 840_000,
    variantSeed: 127,
    durationSteps: 6,
  });
  if (!reduction.accepted || reduction.event === null) {
    throw new Error(`Marsh-rabbit fixture was rejected: ${reduction.reason}`);
  }
  return reduction.event;
}

function marshFoxPursuitEvent(sourceActorId: string): SituatedExpressionEvent {
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId,
    triggerEventId: "core-wildlife:marsh-fox-pursuit:authority",
    position: POSITION,
    meaning: "marsh-fox-pursuit-yip",
    family: "animal-signal",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-perceived-prey",
    priority: 340_000,
    salience: 840_000,
    variantSeed: 131,
    durationSteps: 6,
  });
  if (!reduction.accepted || reduction.event === null) {
    throw new Error(`Marsh-fox fixture was rejected: ${reduction.reason}`);
  }
  return reduction.event;
}

function authority(
  traversalFeedback: TraversalFeedbackState,
  physicalCargo: PhysicalCargoState,
): PlayerExpressionAuthority {
  return { traversalFeedback, physicalCargo };
}

function traversalAdmission(
  event: SituatedExpressionEvent,
  causalClass: PlayerTraversalExpressionCausalClass,
  fallCargo?: ReturnType<typeof fallCargoAuthority>,
): PlayerTraversalExpressionAdmissionRecord {
  const separated = causalClass === "cargo-separation";
  const important = causalClass === "important-cargo-impact";
  const incidentKind = event.tone === "alarmed" ? "fall" : "stumble";
  const record = createPlayerTraversalExpressionAdmissionRecord({
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    causalClass,
    incidentKind,
    hazardSeverity: causalClass === "ordinary-stumble" ? 200_000 : 800_000,
    cargoOutcome: separated
      ? "separated"
      : important
        ? "impacted-carried"
        : "unchanged",
    selectedPayloadKind: separated || important ? "promise" : null,
    cargoShock: separated || important ? 700_000 : 0,
    separatedEntityIds: separated && fallCargo !== undefined
      ? [fallCargo.separatedEntityId]
      : [],
    separationEventId: separated && fallCargo !== undefined
      ? fallCargo.separationEventId
      : null,
  });
  if (record === null) throw new Error("Expression fixture omitted its causal admission");
  return record;
}

function exhaustionFixture() {
  const evidence = {
    committedWorldTick: 73,
    admittedAtPlayerStepPhase: 3,
    acceptedDistanceUnits: 105,
    resolution: "dry-exhaustion-camp" as const,
  };
  const policyValue = playerEffortExpressionPolicy("player:local", evidence);
  if (policyValue === null) throw new Error("Expected effort policy fixture");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "player:local",
    position: POSITION,
    ...policyValue,
  });
  if (!reduction.accepted || reduction.event === null) {
    throw new Error("Expected effort event fixture");
  }
  const admission = createPlayerExhaustionExpressionAdmissionRecord({
    sourceActorId: "player:local",
    triggerEventId: policyValue.triggerEventId,
    sampleOrdinal: 0,
    ...evidence,
  });
  if (admission === null) throw new Error("Expected effort admission fixture");
  return { event: reduction.event, admission } as const;
}

describe("player situated-expression authority", () => {
  it("reauthenticates every supported traversal policy and evolving event fields", () => {
    const emptyCargo = emptyPhysicalCargo();
    const stumble = feedback("stumble");
    const fall = feedback("fall");
    const fallCargo = fallCargoAuthority();
    const cases = [
      [eventFor("steady-after-stumble", stumble), authority(stumble, emptyCargo)],
      [eventFor("relief-after-near-fall", stumble), authority(stumble, emptyCargo)],
      [eventFor("protect-important-cargo", stumble), authority(stumble, emptyCargo)],
      [eventFor("protect-important-cargo", fall), authority(fall, emptyCargo)],
      [eventFor("alarm-at-cargo-loss", fall), authority(fall, fallCargo.separated)],
      [
        eventFor(
          "relief-after-cargo-recovery",
          noIncidentFeedback(),
          fallCargo.recoveryEventId,
        ),
        authority(noIncidentFeedback(), fallCargo.recovered),
      ],
    ] as const;

    for (const [event, evidence] of cases) {
      expect(playerExpressionEventMatchesAuthority(event, evidence)).toBe(true);
      expect(playerExpressionEventMatchesAuthority({
        ...event,
        remainingSteps: Math.max(1, event.remainingSteps - 1),
        audioAcknowledged: true,
      }, evidence)).toBe(true);
    }
  });

  it("rejects wrong source, trigger, variant, kind, or semantic policy", () => {
    const cargo = emptyPhysicalCargo();
    const stumble = feedback("stumble");
    const fall = feedback("fall");
    const exact = eventFor("steady-after-stumble", stumble);
    expect(playerExpressionEventMatchesAuthority({
      ...exact,
      sourceActorId: "H-forged-player",
    }, authority(stumble, cargo))).toBe(false);
    expect(playerExpressionEventMatchesAuthority(
      eventFor("steady-after-stumble", feedback("stumble", {
        id: "player:0:traversal:6",
        traversalOrdinal: 6,
      })),
      authority(stumble, cargo),
    )).toBe(false);
    expect(playerExpressionEventMatchesAuthority(
      eventFor("steady-after-stumble", feedback("stumble", { variantSeed: 482 })),
      authority(stumble, cargo),
    )).toBe(false);
    expect(playerExpressionEventMatchesAuthority(
      eventFor("steady-after-stumble", stumble),
      authority(fall, cargo),
    )).toBe(false);
    expect(playerExpressionEventMatchesAuthority(
      eventFor("protect-important-cargo", fall, undefined, {
        tone: "alarmed",
        volume: "spoken",
      }),
      authority(fall, cargo),
    )).toBe(false);
    expect(playerExpressionEventMatchesAuthority(
      eventFor("steady-after-stumble", stumble, undefined, { priority: 180_001 }),
      authority(stumble, cargo),
    )).toBe(false);
  });

  it("requires retained separation and exact same-entity recovery history", () => {
    const fall = feedback("fall");
    const fallCargo = fallCargoAuthority();
    const alarm = eventFor("alarm-at-cargo-loss", fall);
    expect(playerExpressionEventMatchesAuthority(
      alarm,
      authority(fall, fallCargo.separated),
    )).toBe(true);
    expect(playerExpressionEventMatchesAuthority(
      alarm,
      authority(fall, emptyPhysicalCargo()),
    )).toBe(false);

    const recovery = eventFor(
      "relief-after-cargo-recovery",
      noIncidentFeedback(),
      fallCargo.recoveryEventId,
    );
    expect(playerExpressionEventMatchesAuthority(
      recovery,
      authority(noIncidentFeedback(), fallCargo.recovered),
    )).toBe(true);
    const ordinary = ordinaryRecoveryAuthority();
    expect(playerExpressionEventMatchesAuthority(
      eventFor(
        "relief-after-cargo-recovery",
        noIncidentFeedback(),
        ordinary.recoveryEventId,
      ),
      authority(noIncidentFeedback(), ordinary.state),
    )).toBe(false);
  });

  it("authenticates exact memory identity and one shared cooldown decay", () => {
    const cargo = emptyPhysicalCargo();
    const stumble = feedback("stumble");
    const event = eventFor("steady-after-stumble", stumble);
    const memory = memoryFor(event, 4);
    expect(playerExpressionMemoryMatchesAuthority(memory, authority(stumble, cargo))).toBe(true);
    expect(playerExpressionMemoryMatchesAuthority({
      ...memory,
      familyCooldownRemainingSteps: memory.familyCooldownRemainingSteps + 1,
    }, authority(stumble, cargo))).toBe(false);
    expect(playerExpressionMemoryMatchesAuthority({
      ...memory,
      priority: memory.priority + 1,
    }, authority(stumble, cargo))).toBe(false);
    expect(playerExpressionMemoryMatchesAuthority({
      ...memory,
      sourceActorId: "H-forged-player",
    }, authority(stumble, cargo))).toBe(false);
    expect(playerExpressionMemoryMatchesAuthority(
      memory,
      authority(noIncidentFeedback(), cargo),
    )).toBe(false);

    const fall = feedback("fall");
    const fallCargo = fallCargoAuthority();
    const alarmMemory = memoryFor(eventFor("alarm-at-cargo-loss", fall), 6);
    expect(playerExpressionMemoryMatchesAuthority(
      alarmMemory,
      authority(fall, fallCargo.separated),
    )).toBe(true);
    expect(playerExpressionMemoryMatchesAuthority(
      alarmMemory,
      authority(fall, emptyPhysicalCargo()),
    )).toBe(false);
  });

  it("requires exact recovery evidence for recovery cooldown memory", () => {
    const fallCargo = fallCargoAuthority();
    const event = eventFor(
      "relief-after-cargo-recovery",
      noIncidentFeedback(),
      fallCargo.recoveryEventId,
    );
    const memory = memoryFor(event, 5);
    expect(playerExpressionMemoryMatchesAuthority(
      memory,
      authority(noIncidentFeedback(), fallCargo.recovered),
    )).toBe(true);
    expect(playerExpressionMemoryMatchesAuthority(
      memory,
      authority(noIncidentFeedback(), fallCargo.separated),
    )).toBe(false);
  });

  it("derives exact conserved sound policy from each traversal admission", () => {
    const emptyCargo = emptyPhysicalCargo();
    const stumble = feedback("stumble");
    const fall = feedback("fall");
    const fallCargo = fallCargoAuthority();
    const cases = [
      {
        event: eventFor("steady-after-stumble", stumble),
        admissionClass: "ordinary-stumble",
        evidence: authority(stumble, emptyCargo),
        expected: {
          volume: "murmur",
          interrupt: "none",
          loudness: 360_000,
          rangeUnits: 8_000,
        },
      },
      {
        event: eventFor("relief-after-near-fall", stumble),
        admissionClass: "serious-stumble",
        evidence: authority(stumble, emptyCargo),
        expected: {
          volume: "spoken",
          interrupt: "none",
          loudness: 620_000,
          rangeUnits: 18_000,
        },
      },
      {
        event: eventFor("protect-important-cargo", fall),
        admissionClass: "important-cargo-impact",
        evidence: authority(fall, emptyCargo),
        expected: {
          volume: "shout",
          interrupt: "strong",
          loudness: 950_000,
          rangeUnits: 36_000,
        },
      },
      {
        event: eventFor("alarm-at-cargo-loss", fall),
        admissionClass: "cargo-separation",
        evidence: authority(fall, fallCargo.separated),
        expected: {
          volume: "shout",
          interrupt: "strong",
          loudness: 950_000,
          rangeUnits: 36_000,
        },
      },
    ] as const;

    for (const { event, admissionClass, evidence, expected } of cases) {
      const admission = traversalAdmission(event, admissionClass, fallCargo);
      const soundPolicy = playerExpressionAdmissionSoundPolicy(admission, evidence);
      expect(soundPolicy).toEqual({
        volume: expected.volume,
        interrupt: expected.interrupt,
      });
      expect(situatedExpressionAcoustics(expected.volume)).toEqual({
        loudness: expected.loudness,
        rangeUnits: expected.rangeUnits,
      });
      expect(playerExpressionEventMatchesAdmission(event, admission, evidence)).toBe(true);
      expect(playerExpressionMemoryMatchesAdmission(
        memoryFor(event, 2),
        admission,
        evidence,
      )).toBe(true);
    }
  });

  it("reauthenticates dry effort only from its exact exhaustion admission", () => {
    const { event, admission } = exhaustionFixture();
    const evidence = authority(noIncidentFeedback(), emptyPhysicalCargo());
    expect(playerExpressionEventMatchesAdmission(event, admission, evidence)).toBe(true);
    expect(playerExpressionMemoryMatchesAdmission(
      memoryFor(event, 3),
      admission,
      evidence,
    )).toBe(true);
    expect(playerExpressionAdmissionSoundPolicy(admission, evidence)).toEqual({
      volume: "murmur",
      interrupt: "none",
    });
    expect(situatedExpressionAcoustics("murmur")).toEqual({
      loudness: 360_000,
      rangeUnits: 8_000,
    });

    for (const forged of [
      { ...event, meaning: "steady-after-stumble" as const },
      { ...event, family: "footing" as const },
      { ...event, knowledgeBasis: "self-felt-stumble" as const },
      { ...event, priority: event.priority + 1 },
      { ...event, variantSeed: event.variantSeed + 1 },
      { ...event, durationSteps: event.durationSteps + 1 },
    ]) {
      expect(playerExpressionEventMatchesAdmission(forged, admission, evidence)).toBe(false);
    }
    expect(playerExpressionEventMatchesAdmission(event, {
      ...admission,
      acceptedDistanceUnits: admission.acceptedDistanceUnits + 1,
    }, evidence)).toBe(false);
  });

  it("rejects a self-consistent event or memory whose causal class was swapped", () => {
    const stumble = feedback("stumble");
    const evidence = authority(stumble, emptyPhysicalCargo());
    const ordinaryEvent = eventFor("steady-after-stumble", stumble);
    const seriousEvent = eventFor("relief-after-near-fall", stumble);
    const seriousAdmissionForOrdinary = traversalAdmission(
      ordinaryEvent,
      "serious-stumble",
    );
    const ordinaryAdmissionForSerious = traversalAdmission(
      seriousEvent,
      "ordinary-stumble",
    );

    expect(playerExpressionEventMatchesAdmission(
      ordinaryEvent,
      seriousAdmissionForOrdinary,
      evidence,
    )).toBe(false);
    expect(playerExpressionMemoryMatchesAdmission(
      memoryFor(ordinaryEvent, 2),
      seriousAdmissionForOrdinary,
      evidence,
    )).toBe(false);
    expect(playerExpressionEventMatchesAdmission(
      seriousEvent,
      ordinaryAdmissionForSerious,
      evidence,
    )).toBe(false);
    expect(playerExpressionMemoryMatchesAdmission(
      memoryFor(seriousEvent, 2),
      ordinaryAdmissionForSerious,
      evidence,
    )).toBe(false);
  });

  it("keeps shelter-whine admission outside player expression authority", () => {
    const activityTransactionId = "working-animal:activity:guardian-shelter-whine:test";
    const triggerEventId = guardianDogShelterWhineTriggerEventId(
      activityTransactionId,
      720_000,
    );
    if (triggerEventId === null) throw new Error("Expected whine trigger fixture");
    const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
      version: SITUATED_EXPRESSION_VERSION,
      sourceActorId: "D-guardian-whine-authority",
      triggerEventId,
      position: POSITION,
      meaning: "guardian-dog-shelter-whine",
      family: "animal-signal",
      tone: "restrained",
      volume: "murmur",
      knowledgeBasis: "self-weather-distress",
      priority: 740_000,
      salience: 650_000,
      variantSeed: 41,
      durationSteps: 8,
    });
    const event = reduction.event;
    const admission = createGuardianDogShelterWhineExpressionAdmissionRecord({
      sourceActorId: "D-guardian-whine-authority",
      triggerEventId,
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      assignmentId: "working-animal:assignment:guardian:test",
      activityTransactionId,
      acceptedAtTick: 72,
      shelterIntentScore: 720_000,
      listenerWasSleepingAtAdmission: false,
    });
    if (event === null || admission === null) throw new Error("Expected whine fixtures");
    const evidence = authority(noIncidentFeedback(), emptyPhysicalCargo());

    expect(playerExpressionEventMatchesAdmission(event, admission, evidence)).toBe(false);
    expect(playerExpressionMemoryMatchesAdmission(
      memoryFor(event, 2),
      admission,
      evidence,
    )).toBe(false);
    expect(playerExpressionAdmissionSoundPolicy(admission, evidence)).toBeNull();
  });

  it("rejects wildlife-alarm semantics and admissions from player-only authority", () => {
    const evidence = authority(noIncidentFeedback(), emptyPhysicalCargo());
    const forgedPlayerEvent = fishCrowEvent("player:local");
    const forgedPlayerMemory = memoryFor(forgedPlayerEvent, 2);
    const legacyAdmission = createLegacyV33PlayerExpressionAdmissionRecord({
      sourceActorId: forgedPlayerEvent.sourceActorId,
      triggerEventId: forgedPlayerEvent.triggerEventId,
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
    });
    if (legacyAdmission === null) throw new Error("Expected legacy admission fixture");

    expect(playerExpressionEventMatchesAuthority(forgedPlayerEvent, evidence)).toBe(false);
    expect(playerExpressionMemoryMatchesAuthority(forgedPlayerMemory, evidence)).toBe(false);
    expect(playerExpressionEventMatchesAdmission(
      forgedPlayerEvent,
      legacyAdmission,
      evidence,
    )).toBe(false);
    expect(playerExpressionMemoryMatchesAdmission(
      forgedPlayerMemory,
      legacyAdmission,
      evidence,
    )).toBe(false);

    const crowEvent = fishCrowEvent("C-player-authority-fish-crow");
    const crowAdmission = createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord({
      sourceActorId: crowEvent.sourceActorId,
      triggerEventId: crowEvent.triggerEventId,
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      sourceOwnerKey: "regional-ecology:player-authority-test",
      sourceObservationId: "observation:aerial-predator:player-authority-test",
      acceptedAtTick: 72,
    });
    if (crowAdmission === null) throw new Error("Expected fish-crow admission fixture");

    expect(playerExpressionEventMatchesAdmission(crowEvent, crowAdmission, evidence)).toBe(false);
    expect(playerExpressionMemoryMatchesAdmission(
      memoryFor(crowEvent, 2),
      crowAdmission,
      evidence,
    )).toBe(false);
    expect(playerExpressionAdmissionSoundPolicy(crowAdmission, evidence)).toBeNull();

    const rabbitEvent = marshRabbitEvent("M-player-authority-marsh-rabbit");
    const rabbitAdmission = createCoreWildlifeAlarmExpressionAdmissionRecord({
      sourceActorId: rabbitEvent.sourceActorId,
      triggerEventId: rabbitEvent.triggerEventId,
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      sourceSpecies: "marsh-rabbit",
      sourceOwnerKey: "regional-ecology:player-authority-test",
      sourceObservationId: "observation:ground-predator:player-authority-test",
      acceptedAtTick: 72,
    });
    if (rabbitAdmission === null) throw new Error("Expected marsh-rabbit admission fixture");

    expect(playerExpressionEventMatchesAuthority(rabbitEvent, evidence)).toBe(false);
    expect(playerExpressionMemoryMatchesAuthority(
      memoryFor(rabbitEvent, 2),
      evidence,
    )).toBe(false);
    expect(playerExpressionEventMatchesAdmission(
      rabbitEvent,
      rabbitAdmission,
      evidence,
    )).toBe(false);
    expect(playerExpressionMemoryMatchesAdmission(
      memoryFor(rabbitEvent, 2),
      rabbitAdmission,
      evidence,
    )).toBe(false);
    expect(playerExpressionAdmissionSoundPolicy(rabbitAdmission, evidence)).toBeNull();

    const foxEvent = marshFoxPursuitEvent("F-player-authority-marsh-fox");
    expect(playerExpressionEventMatchesAuthority(foxEvent, evidence)).toBe(false);
    expect(playerExpressionMemoryMatchesAuthority(memoryFor(foxEvent, 2), evidence))
      .toBe(false);
  });
});
