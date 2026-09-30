import {
  HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES,
  createSupplementalSoundSample,
  type SupplementalSoundSample,
} from "./humanPerception";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  canonicalizeSituatedExpressionState,
  situatedExpressionCooldownSteps,
  situatedExpressionEventIdForTrigger,
  type SituatedExpressionEvent,
  type SituatedExpressionMeaning,
  type SituatedExpressionMemory,
  type SituatedExpressionState,
} from "./situatedExpression";
import {
  canonicalizeSituatedExpressionChannelBank,
  type SituatedExpressionChannel,
} from "./situatedExpressionChannelBank";
import { createSelfSituatedExpressionReception } from "./situatedExpressionReception";
import {
  canonicalizeSituatedExpressionAdmissionLedger,
  createSituatedExpressionAdmissionLedger,
  type SituatedExpressionAdmissionLedger,
} from "./situatedExpressionAdmissionLedger";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const PLAYER_STEPS_PER_WORLD_TICK = 10;

export interface LegacyPlayerVocalizationSample {
  readonly id: string;
  readonly position: WorldPosition;
  readonly soundLoudness: number;
  readonly soundRangeUnits: number;
  readonly soundClass: string;
  readonly soundInterrupt: "none" | "strong";
}

export interface LegacyV33PlayerVocalizationMigration {
  readonly actorVocalizationSamples: readonly SupplementalSoundSample[];
  readonly situatedExpressionAdmissions: SituatedExpressionAdmissionLedger;
  /** Null when neither an active presentation nor a pending sound needs authority. */
  readonly playerChannel: SituatedExpressionChannel | null;
}

interface AcousticTuple {
  readonly loudness: number;
  readonly rangeUnits: number;
  readonly interrupt: LegacyPlayerVocalizationSample["soundInterrupt"];
}

interface MemoryCandidate {
  readonly memoryIndex: number;
  readonly age: number;
  readonly eventId: string;
}

/**
 * Reconstructs source/event binding absent from the exact v33 carry schema.
 * Capture order, newest-first memory order, and cooldown-derived age must admit
 * exactly one one-to-one assignment. Nothing is guessed or repaired.
 */
export function migrateLegacyV33PlayerVocalizations(
  legacyStateValue: unknown,
  legacySamplesValue: unknown,
  completedTick: number,
  playerStepsSinceWorldTick: number,
): LegacyV33PlayerVocalizationMigration | null {
  const legacyState = canonicalizeSituatedExpressionState(legacyStateValue);
  if (
    legacyState === null
    || !validNonnegativeInteger(completedTick)
    || !validNonnegativeInteger(playerStepsSinceWorldTick)
    || playerStepsSinceWorldTick >= PLAYER_STEPS_PER_WORLD_TICK
    || !Array.isArray(legacySamplesValue)
    || legacySamplesValue.length > HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES
    || !legacyStateBelongsToPlayer(legacyState)
    || !legacyStateUsesV33Meanings(legacyState)
  ) return null;

  const legacySamples: LegacyPlayerVocalizationSample[] = [];
  for (let ordinal = 0; ordinal < legacySamplesValue.length; ordinal += 1) {
    if (!(ordinal in legacySamplesValue)) return null;
    const sample = canonicalLegacySample(
      legacySamplesValue[ordinal],
      completedTick,
      ordinal,
    );
    if (sample === null) return null;
    legacySamples.push(sample);
  }

  const candidates = legacySamples.map((sample) => candidatesForSample(
    sample,
    legacyState,
    playerStepsSinceWorldTick,
  ));
  if (candidates.some((entries) => entries.length === 0)) return null;
  const assignments = uniqueOrderedAssignment(candidates);
  if (assignments === null) return null;

  const latestAssignment = assignments.at(-1);
  if (latestAssignment !== undefined) {
    const latestMemory = legacyState.recent[latestAssignment.memoryIndex];
    if (latestMemory === undefined) return null;
    const latestShouldRemainActive = latestAssignment.age
      < legacyExpressionDurationSteps(latestMemory.meaning);
    if (
      latestShouldRemainActive
        ? legacyState.active?.eventId !== latestAssignment.eventId
        : legacyState.active !== null
    ) return null;
  }

  const neededMemoryIndexes = new Set(assignments.map(({ memoryIndex }) => memoryIndex));
  if (legacyState.active !== null) {
    const activeMemoryIndex = legacyState.recent.findIndex((memory) => (
      memory.sourceActorId === legacyState.active?.sourceActorId
      && memory.triggerEventId === legacyState.active?.triggerEventId
      && memory.meaning === legacyState.active?.meaning
      && memory.family === legacyState.active?.family
      && memory.priority === legacyState.active?.priority
    ));
    const activeAssignment = assignments.find(({ memoryIndex }) => (
      memoryIndex === activeMemoryIndex
    ));
    if (
      activeMemoryIndex < 0
      || activeAssignment === undefined
      || legacyState.active.audioAcknowledged !== true
      || legacyState.active.durationSteps
        !== legacyExpressionDurationSteps(legacyState.active.meaning)
      || legacyState.active.remainingSteps
        !== legacyState.active.durationSteps - activeAssignment.age
      || activeAssignment.age >= legacyState.active.durationSteps
    ) return null;
    neededMemoryIndexes.add(activeMemoryIndex);
  }

  const earliestAdmissionPhase = assignments.reduce(
    (earliest, assignment) => Math.min(
      earliest,
      playerStepsSinceWorldTick - assignment.age,
    ),
    playerStepsSinceWorldTick,
  );

  const sanitizedState = canonicalizeSituatedExpressionState({
    version: legacyState.version,
    completedSteps: playerStepsSinceWorldTick - earliestAdmissionPhase,
    active: legacyState.active,
    recent: legacyState.recent.filter((_memory, index) => neededMemoryIndexes.has(index)),
  });
  if (sanitizedState === null) return null;

  const actorVocalizationSamples: SupplementalSoundSample[] = [];
  const admissionRecords = [];
  for (let ordinal = 0; ordinal < legacySamples.length; ordinal += 1) {
    const legacySample = legacySamples[ordinal];
    const assignment = assignments[ordinal];
    if (legacySample === undefined || assignment === undefined) return null;
    const sample = createSupplementalSoundSample({
      expressionEventId: assignment.eventId,
      id: `av-${completedTick}-${ordinal}`,
      position: legacySample.position,
      soundLoudness: legacySample.soundLoudness,
      soundRangeUnits: legacySample.soundRangeUnits,
      soundClass: legacySample.soundClass,
      soundInterrupt: legacySample.soundInterrupt,
      sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    });
    if (sample === null) return null;
    actorVocalizationSamples.push(sample);
    const memory = legacyState.recent[assignment.memoryIndex];
    if (memory === undefined) return null;
    admissionRecords.push({
      version: 1 as const,
      eventId: assignment.eventId,
      sourceActorId: memory.sourceActorId,
      triggerEventId: memory.triggerEventId,
      sampleOrdinal: ordinal,
      admittedAtPlayerStepPhase: playerStepsSinceWorldTick - assignment.age,
      kind: "legacy-v33-player" as const,
    });
  }

  const situatedExpressionAdmissions = admissionRecords.length === 0
    ? createSituatedExpressionAdmissionLedger()
    : canonicalizeSituatedExpressionAdmissionLedger({
        version: 1,
        records: admissionRecords,
      });
  if (situatedExpressionAdmissions === null) return null;

  const playerChannel = sanitizedPlayerChannel(sanitizedState, completedTick);
  if (playerChannel === undefined) return null;
  return Object.freeze({
    actorVocalizationSamples: Object.freeze(actorVocalizationSamples),
    situatedExpressionAdmissions,
    playerChannel,
  });
}

function canonicalLegacySample(
  value: unknown,
  completedTick: number,
  ordinal: number,
): LegacyPlayerVocalizationSample | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "id",
    "position",
    "soundClass",
    "soundInterrupt",
    "soundLoudness",
    "soundRangeUnits",
  ])) return null;
  if (
    value.id !== `pv-${completedTick}-${ordinal}`
    || !isWorldPosition(value.position)
    || value.soundClass !== "human-vocalization"
    || (value.soundInterrupt !== "none" && value.soundInterrupt !== "strong")
    || !validNonnegativeInteger(value.soundLoudness)
    || value.soundLoudness > 1_000_000
    || !validNonnegativeInteger(value.soundRangeUnits)
    || value.soundRangeUnits > 10_000_000
  ) return null;
  return Object.freeze({
    id: value.id,
    position: value.position,
    soundLoudness: value.soundLoudness,
    soundRangeUnits: value.soundRangeUnits,
    soundClass: value.soundClass,
    soundInterrupt: value.soundInterrupt,
  });
}

function candidatesForSample(
  sample: LegacyPlayerVocalizationSample,
  state: SituatedExpressionState,
  playerStepsSinceWorldTick: number,
): readonly MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  for (let memoryIndex = 0; memoryIndex < state.recent.length; memoryIndex += 1) {
    const memory = state.recent[memoryIndex];
    if (memory === undefined) continue;
    const age = memoryAgeWithinPhase(memory, playerStepsSinceWorldTick);
    const eventId = situatedExpressionEventIdForTrigger(
      memory.sourceActorId,
      memory.triggerEventId,
    );
    if (
      age === null
      || eventId === null
      || !v33AcousticTuples(memory.meaning).some((tuple) => sampleMatchesTuple(sample, tuple))
      || !sampleMatchesActiveWhenApplicable(sample, state.active, eventId)
    ) continue;
    candidates.push(Object.freeze({ memoryIndex, age, eventId }));
  }
  return Object.freeze(candidates);
}

function memoryAgeWithinPhase(
  memory: SituatedExpressionMemory,
  playerStepsSinceWorldTick: number,
): number | null {
  const cooldowns = situatedExpressionCooldownSteps(memory.meaning);
  if (cooldowns === null) return null;
  let found: number | null = null;
  for (let age = 0; age <= playerStepsSinceWorldTick; age += 1) {
    if (
      memory.meaningCooldownRemainingSteps === Math.max(0, cooldowns.meaning - age)
      && memory.familyCooldownRemainingSteps === Math.max(0, cooldowns.family - age)
    ) {
      if (found !== null) return null;
      found = age;
    }
  }
  return found;
}

function sampleMatchesActiveWhenApplicable(
  sample: LegacyPlayerVocalizationSample,
  active: SituatedExpressionEvent | null,
  eventId: string,
): boolean {
  if (active?.eventId !== eventId) return true;
  return samePosition(sample.position, active.position)
    && sampleMatchesTuple(sample, acousticsFor(active.volume, (
      active.tone === "alarmed" || active.volume === "shout" ? "strong" : "none"
    )));
}

function uniqueOrderedAssignment(
  candidatesBySample: readonly (readonly MemoryCandidate[])[],
): readonly MemoryCandidate[] | null {
  if (candidatesBySample.length === 0) return Object.freeze([]);
  const solutions: MemoryCandidate[][] = [];
  const selected: MemoryCandidate[] = [];
  const usedMemoryIndexes = new Set<number>();

  const visit = (
    sampleIndex: number,
    priorMemoryIndex: number,
    priorAge: number,
  ): void => {
    if (solutions.length > 1) return;
    if (sampleIndex >= candidatesBySample.length) {
      solutions.push([...selected]);
      return;
    }
    const candidates = candidatesBySample[sampleIndex] ?? [];
    for (const candidate of candidates) {
      // Legacy samples are oldest-first; recent memory is newest-first.
      if (
        usedMemoryIndexes.has(candidate.memoryIndex)
        || candidate.memoryIndex >= priorMemoryIndex
        || candidate.age > priorAge
      ) continue;
      usedMemoryIndexes.add(candidate.memoryIndex);
      selected.push(candidate);
      visit(sampleIndex + 1, candidate.memoryIndex, candidate.age);
      selected.pop();
      usedMemoryIndexes.delete(candidate.memoryIndex);
      if (solutions.length > 1) return;
    }
  };

  visit(0, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  return solutions.length === 1 ? Object.freeze(solutions[0] ?? []) : null;
}

function sanitizedPlayerChannel(
  state: SituatedExpressionState,
  completedTick: number,
): SituatedExpressionChannel | null | undefined {
  if (state.active === null && state.recent.length === 0) return null;
  const reception = state.active === null
    ? null
    : createSelfSituatedExpressionReception(state.active, completedTick);
  if (state.active !== null && reception === null) return undefined;
  const bank = canonicalizeSituatedExpressionChannelBank({
    version: 1,
    channels: [{
      sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      state,
      reception,
    }],
  });
  return bank?.channels[0];
}

function legacyStateBelongsToPlayer(state: SituatedExpressionState): boolean {
  return (state.active === null || state.active.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID)
    && state.recent.every(({ sourceActorId }) => sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID);
}

function legacyStateUsesV33Meanings(state: SituatedExpressionState): boolean {
  return (state.active === null || isLegacyV33PlayerMeaning(state.active.meaning))
    && state.recent.every(({ meaning }) => isLegacyV33PlayerMeaning(meaning));
}

function isLegacyV33PlayerMeaning(meaning: SituatedExpressionMeaning): boolean {
  return meaning === "steady-after-stumble"
    || meaning === "relief-after-near-fall"
    || meaning === "protect-important-cargo"
    || meaning === "alarm-at-cargo-loss"
    || meaning === "relief-after-cargo-recovery";
}

function v33AcousticTuples(meaning: SituatedExpressionMeaning): readonly AcousticTuple[] {
  switch (meaning) {
    case "steady-after-stumble":
      return [acousticsFor("murmur", "none")];
    case "relief-after-near-fall":
    case "relief-after-cargo-recovery":
      return [acousticsFor("spoken", "none")];
    case "protect-important-cargo":
      return [acousticsFor("spoken", "none"), acousticsFor("shout", "strong")];
    case "alarm-at-cargo-loss":
      return [acousticsFor("shout", "strong")];
    case "porter-heavy-load":
    case "guardian-dog-warning":
    case "guardian-dog-defensive-growl":
    case "guardian-dog-shelter-whine":
    case "fish-crow-alarm-call":
    case "human-danger-warning":
    case "keeper-secure-store-response":
    case "need-rest-after-exertion":
    case "resident-introduction":
      return [];
  }
}

function legacyExpressionDurationSteps(meaning: SituatedExpressionMeaning): number {
  switch (meaning) {
    case "steady-after-stumble": return 7;
    case "relief-after-near-fall": return 10;
    case "protect-important-cargo": return 12;
    case "alarm-at-cargo-loss": return 14;
    case "relief-after-cargo-recovery": return 9;
    case "porter-heavy-load": return 8;
    case "guardian-dog-warning": return 6;
    case "guardian-dog-defensive-growl": return 8;
    case "guardian-dog-shelter-whine": return 8;
    case "fish-crow-alarm-call": return 6;
    case "human-danger-warning": return 6;
    case "keeper-secure-store-response": return 12;
    case "need-rest-after-exertion": return 8;
    case "resident-introduction": return 56;
  }
}

function acousticsFor(
  volume: "murmur" | "spoken" | "shout",
  interrupt: AcousticTuple["interrupt"],
): AcousticTuple {
  return Object.freeze({
    loudness: volume === "shout" ? 950_000 : volume === "spoken" ? 620_000 : 360_000,
    rangeUnits: (volume === "shout" ? 36 : volume === "spoken" ? 18 : 8)
      * WORLD_POSITION_UNITS_PER_TILE,
    interrupt,
  });
}

function sampleMatchesTuple(
  sample: LegacyPlayerVocalizationSample,
  tuple: AcousticTuple,
): boolean {
  return sample.soundLoudness === tuple.loudness
    && sample.soundRangeUnits === tuple.rangeUnits
    && sample.soundInterrupt === tuple.interrupt;
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

function validNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length
    && keys.every((key, index) => key === sortedExpected[index]);
}
