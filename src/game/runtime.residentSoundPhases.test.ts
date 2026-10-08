import { describe, expect, it } from "vitest";

import { stableStringify } from "../sim/util";
import { createSupplementalSoundSample, type SupplementalSoundSample } from "./humanPerception";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { playerEffortExpressionIntent } from "./playerEffortExpression";
import { prepareRuntimeSupplementalSoundSamplePhases } from "./runtime";
import { SITUATED_EXPRESSION_VERSION, type SituatedExpressionEvent, type SituatedExpressionIntent } from "./situatedExpression";
import { situatedExpressionAcoustics, situatedExpressionSoundClass, situatedExpressionSoundInterrupt } from "./situatedExpressionAcoustics";
import {
  appendSituatedExpressionAdmissionRecord,
  createHumanDangerWarningExpressionAdmissionRecord,
  createPlayerExhaustionExpressionAdmissionRecord,
  createPlayerFallRecoveryExpressionAdmissionRecord,
  createPlayerTraversalExpressionAdmissionRecord,
  createSettlementKeeperStoreResponseExpressionAdmissionRecord,
  createSituatedExpressionAdmissionLedger,
  type SituatedExpressionAdmissionLedger,
  type SituatedExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import { createSituatedExpressionChannelBank, reduceSituatedExpressionChannelBank, type SituatedExpressionChannelBank } from "./situatedExpressionChannelBank";
import { createSelfSituatedExpressionReception } from "./situatedExpressionReception";
import { createWorldPosition } from "./worldPosition";

const POSITION = createWorldPosition({ x: -3, y: 7 }, 12_500, 18_500);
const TICK = 420;
const PLAYER = LOCAL_PLAYER_LIVING_ACTOR_ID;

function requireValue<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`canonical sound timing fixture rejected ${label}`);
  return value;
}

function builder() {
  const samples: SupplementalSoundSample[] = [];
  let admissions = createSituatedExpressionAdmissionLedger();
  let channels = createSituatedExpressionChannelBank();
  return {
    add(record: SituatedExpressionAdmissionRecord, intent: SituatedExpressionIntent) {
      const reduction = reduceSituatedExpressionChannelBank(channels, intent,
        record.sourceActorId === PLAYER ? (event: SituatedExpressionEvent) => createSelfSituatedExpressionReception(event, TICK) : null);
      if (!reduction.accepted || reduction.bank === null || reduction.event === null) throw new Error(`canonical channel rejected ${reduction.reason}`);
      channels = reduction.bank;
      admissions = requireValue(appendSituatedExpressionAdmissionRecord(admissions, record), "admission append");
      const event = reduction.event;
      const acoustic = situatedExpressionAcoustics(event);
      samples.push(requireValue(createSupplementalSoundSample({
        id: `av-${TICK}-${record.sampleOrdinal}`, expressionEventId: event.eventId,
        sourceActorId: event.sourceActorId, position: event.position,
        soundLoudness: acoustic.loudness, soundRangeUnits: acoustic.rangeUnits,
        soundClass: situatedExpressionSoundClass(event), soundInterrupt: situatedExpressionSoundInterrupt(event),
      }), "sample"));
      return record.eventId;
    },
    result() { return { samples, admissions, channels }; },
  };
}

function commonIntent(record: SituatedExpressionAdmissionRecord): SituatedExpressionIntent {
  return { version: SITUATED_EXPRESSION_VERSION, sourceActorId: record.sourceActorId,
    triggerEventId: record.triggerEventId, position: POSITION, meaning: "steady-after-stumble",
    family: "footing", tone: "restrained", volume: "murmur", knowledgeBasis: "self-felt-stumble",
    priority: 180_000, salience: 260_000, variantSeed: 17, durationSteps: 8 };
}

function keeperRecord(ordinal: number, phase = 9) {
  const triggerEventId = `store:closure:${ordinal}`;
  return requireValue(createSettlementKeeperStoreResponseExpressionAdmissionRecord({
    sourceActorId: `H-sound-keeper-${ordinal}`, triggerEventId, sampleOrdinal: ordinal,
    admittedAtPlayerStepPhase: phase, storeId: `store:${ordinal}`, closureTransactionId: triggerEventId,
    sourceEvidenceId: `store:evidence:${ordinal}`, respondedAtTick: TICK,
    listenerPosition: POSITION, listenerFacingMilliRadians: 0, hearingCertainty: null,
  }), "keeper record");
}

function keeperIntent(record: SituatedExpressionAdmissionRecord): SituatedExpressionIntent {
  return { ...commonIntent(record), meaning: "keeper-secure-store-response", family: "work",
    volume: "spoken", knowledgeBasis: "self-committed-store-closure" };
}

function traversalRecord(ordinal: number, phase = 9) {
  return requireValue(createPlayerTraversalExpressionAdmissionRecord({
    sourceActorId: PLAYER, triggerEventId: `traversal:${ordinal}`, sampleOrdinal: ordinal,
    admittedAtPlayerStepPhase: phase, causalClass: "ordinary-stumble", incidentKind: "stumble",
    hazardSeverity: 220_000, cargoOutcome: "unchanged", selectedPayloadKind: null,
    cargoShock: 80_000, separatedEntityIds: [], separationEventId: null,
  }), "traversal record");
}

function mixedFixture(withExhaustion = false) {
  const current = builder();
  const keeper = keeperRecord(0);
  const keeperId = current.add(keeper, keeperIntent(keeper));
  const warning = requireValue(createHumanDangerWarningExpressionAdmissionRecord({
    sourceActorId: "H-sound-warning", triggerEventId: "human-warning:observation:1", sampleOrdinal: 1,
    admittedAtPlayerStepPhase: 0, sourceObservationId: "observation:danger:1", acceptedAtTick: TICK,
  }), "warning record");
  const warningId = current.add(warning, { ...commonIntent(warning), meaning: "human-danger-warning",
    family: "warning", tone: "alarmed", volume: "shout", knowledgeBasis: "self-heard-anonymous-alarm" });
  const traversal = traversalRecord(2);
  const traversalId = current.add(traversal, commonIntent(traversal));
  let exhaustionId: string | null = null;
  if (withExhaustion) {
    const evidence = { committedWorldTick: TICK, admittedAtPlayerStepPhase: 9,
      acceptedDistanceUnits: 105, resolution: "dry-exhaustion-camp" as const };
    const intent = requireValue(playerEffortExpressionIntent({ ...evidence, sourceActorId: PLAYER, position: POSITION }), "exhaustion intent");
    const record = requireValue(createPlayerExhaustionExpressionAdmissionRecord({ ...evidence,
      sourceActorId: PLAYER, triggerEventId: intent.triggerEventId, sampleOrdinal: 3 }), "exhaustion record");
    exhaustionId = current.add(record, intent);
  }
  return { ...current.result(), keeperId, warningId, traversalId, exhaustionId };
}

// Factory-generated custody/timing contract fixtures, not proof that the
// represented source action or terminal runtime producer has executed in play.
describe("runtime admitted supplemental sound phases", () => {
  it("uses committed admission phases rather than list ordinal, without mutating inputs", () => {
    const fixture = mixedFixture();
    const before = stableStringify(fixture);
    const result = prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, fixture.channels);
    expect(result).toEqual(fixture.samples.map(({ id }, index) => ({ sampleId: id, phase: [9, 0, 9][index] })));
    expect(Object.isFrozen(result)).toBe(true);
    expect(result?.every(Object.isFrozen)).toBe(true);
    expect(prepareRuntimeSupplementalSoundSamplePhases(structuredClone(fixture.samples), structuredClone(fixture.admissions), structuredClone(fixture.channels))).toEqual(result);
    expect(stableStringify(fixture)).toBe(before);
    expect(prepareRuntimeSupplementalSoundSamplePhases([], createSituatedExpressionAdmissionLedger(), createSituatedExpressionChannelBank())).toEqual([]);
  });

  it("changes only exact terminal player traversal/exhaustion IDs, including a retained interrupted event", () => {
    const fixture = mixedFixture(true);
    const ordinary = prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, fixture.channels);
    expect(ordinary?.map(({ phase }) => phase)).toEqual([9, 0, 9, 9]);
    const single = prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, fixture.channels, [fixture.traversalId]);
    expect(single?.map(({ phase }) => phase)).toEqual([9, 0, 10, 9]);
    const both = [fixture.traversalId, fixture.exhaustionId!];
    const before = stableStringify({ fixture, both });
    expect(prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, fixture.channels, both)?.map(({ phase }) => phase)).toEqual([9, 0, 10, 10]);
    expect(prepareRuntimeSupplementalSoundSamplePhases(structuredClone(fixture.samples), structuredClone(fixture.admissions), structuredClone(fixture.channels), [...both].reverse())?.map(({ phase }) => phase)).toEqual([9, 0, 10, 10]);
    expect(stableStringify({ fixture, both })).toBe(before);
  });

  it("rejects unused, duplicate, unbounded, nonplayer and wrong-kind terminal overrides", () => {
    const fixture = mixedFixture();
    for (const ids of [["situated-expression:event:unknown"], [fixture.traversalId, fixture.traversalId],
      [fixture.traversalId, fixture.keeperId, fixture.warningId], [fixture.keeperId], [fixture.warningId]]) {
      expect(prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, fixture.channels, ids)).toBeNull();
    }
    const current = builder();
    const recovery = requireValue(createPlayerFallRecoveryExpressionAdmissionRecord({
      sourceActorId: PLAYER, triggerEventId: "recovery:1", sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 9, recoveryEventId: "recovery:1", recoveredEntityId: "cargo:1",
    }), "recovery record");
    const id = current.add(recovery, { ...commonIntent(recovery), meaning: "relief-after-cargo-recovery",
      family: "cargo", tone: "relieved", knowledgeBasis: "self-recovered-cargo" });
    const recoveryFixture = current.result();
    expect(prepareRuntimeSupplementalSoundSamplePhases(recoveryFixture.samples, recoveryFixture.admissions, recoveryFixture.channels, [id])).toBeNull();
  });

  it("requires actual saved phase nine before any terminal phase-ten override", () => {
    const current = builder();
    const traversal = traversalRecord(0, 8);
    const id = current.add(traversal, commonIntent(traversal));
    const fixture = current.result();
    expect(prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, fixture.channels)).toEqual([{ sampleId: fixture.samples[0]!.id, phase: 8 }]);
    expect(prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, fixture.channels, [id])).toBeNull();
  });

  it.each(["missing", "duplicate-id", "reordered", "source", "event", "position", "loudness", "ordinal", "phase", "channel"] as const)("rejects %s sample/ledger/channel custody without modification", (kind) => {
    const fixture = mixedFixture();
    const samples = structuredClone(fixture.samples);
    const admissions = structuredClone(fixture.admissions);
    const channels = structuredClone(fixture.channels);
    if (kind === "missing") samples.pop();
    else if (kind === "duplicate-id") Object.assign(samples[1]!, { id: samples[0]!.id });
    else if (kind === "reordered") samples.reverse();
    else if (kind === "source") Object.assign(samples[0]!, { sourceActorId: samples[1]!.sourceActorId });
    else if (kind === "event") Object.assign(samples[0]!, { expressionEventId: samples[1]!.expressionEventId });
    else if (kind === "position") Object.assign(samples[0]!, { position: createWorldPosition(POSITION.region, POSITION.localX + 1_000, POSITION.localY) });
    else if (kind === "loudness") Object.assign(samples[0]!, { soundLoudness: samples[0]!.soundLoudness - 1 });
    else if (kind === "ordinal") Object.assign(admissions.records[0]!, { sampleOrdinal: 1 });
    else if (kind === "phase") Object.assign(admissions.records[0]!, { admittedAtPlayerStepPhase: 10 });
    else Object.assign(channels, { channels: channels.channels.filter(({ sourceActorId }) => sourceActorId !== samples[0]!.sourceActorId) });
    const before = stableStringify({ samples, admissions, channels });
    expect(prepareRuntimeSupplementalSoundSamplePhases(samples, admissions, channels)).toBeNull();
    expect(stableStringify({ samples, admissions, channels })).toBe(before);
  });

  it("accepts exactly eight genuine entries and rejects a ninth or malformed roots", () => {
    const current = builder();
    for (let ordinal = 0; ordinal < 8; ordinal += 1) {
      const record = keeperRecord(ordinal, ordinal % 2 === 0 ? 9 : 0);
      current.add(record, keeperIntent(record));
    }
    const fixture = current.result();
    expect(prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, fixture.channels)).toHaveLength(8);
    expect(prepareRuntimeSupplementalSoundSamplePhases([...fixture.samples, fixture.samples[0]!], fixture.admissions, fixture.channels)).toBeNull();
    expect(prepareRuntimeSupplementalSoundSamplePhases(new Array(8) as SupplementalSoundSample[], fixture.admissions, fixture.channels)).toBeNull();
    expect(prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, null as unknown as SituatedExpressionAdmissionLedger, fixture.channels)).toBeNull();
    expect(prepareRuntimeSupplementalSoundSamplePhases(fixture.samples, fixture.admissions, null as unknown as SituatedExpressionChannelBank)).toBeNull();
  });
});
