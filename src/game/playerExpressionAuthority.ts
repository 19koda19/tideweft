import { stableStringify } from "../sim/util";
import type { LooseCargoHistoryRecord, LooseCargoWorldState } from "./looseCargo";
import {
  physicalCargoWorlds,
  type PhysicalCargoState,
} from "./physicalCargoState";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  canonicalizeSituatedExpressionAdmissionRecord,
  type SituatedExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  SITUATED_EXPRESSION_VERSION,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionFamily,
  type SituatedExpressionIntent,
  type SituatedExpressionKnowledgeBasis,
  type SituatedExpressionMeaning,
  type SituatedExpressionMemory,
  type SituatedExpressionTone,
  type SituatedExpressionVolume,
} from "./situatedExpression";
import {
  canonicalizeTraversalFeedback,
  type TraversalFeedbackState,
  type TraversalIncident,
} from "./traversalFeedback";
import { createRegionCoord } from "../sim/regions";
import { createWorldPosition } from "./worldPosition";
import { playerEffortExpressionPolicy } from "./playerEffortExpression";

export interface PlayerExpressionAuthority {
  readonly traversalFeedback: TraversalFeedbackState;
  readonly physicalCargo: PhysicalCargoState;
}

interface PlayerExpressionPolicy {
  readonly meaning: SituatedExpressionMeaning;
  readonly family: SituatedExpressionFamily;
  readonly tone: SituatedExpressionTone;
  readonly volume: SituatedExpressionVolume;
  readonly knowledgeBasis: SituatedExpressionKnowledgeBasis;
  readonly priority: number;
  readonly salience: number;
  readonly durationSteps: number;
  readonly triggerEventId: string;
  readonly variantSeed: number;
}

export interface PlayerExpressionAdmissionSoundPolicy {
  readonly volume: SituatedExpressionVolume;
  readonly interrupt: "none" | "strong";
}

interface LocatedCargoHistory {
  readonly world: LooseCargoWorldState;
  readonly record: LooseCargoHistoryRecord;
}

const MEMORY_PROJECTION_POSITION = createWorldPosition(createRegionCoord(0, 0), 0, 0);

/**
 * Reauthenticates one current player expression at a persistence boundary.
 * Evolving remaining duration and audio acknowledgement are excluded; every
 * immutable semantic/catalog field is rederived from retained authority.
 */
export function playerExpressionEventMatchesAuthority(
  event: SituatedExpressionEvent,
  authority: PlayerExpressionAuthority,
): boolean {
  if (
    event.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || projectSituatedExpression(event) === null
  ) return false;
  const traversalFeedback = canonicalTraversalFeedback(authority.traversalFeedback);
  if (traversalFeedback === null) return false;
  const policy = policyFor(
    event.meaning,
    event.triggerEventId,
    traversalFeedback,
    authority.physicalCargo,
  );
  if (policy === null || event.variantSeed !== policy.variantSeed) return false;
  const expected = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    triggerEventId: policy.triggerEventId,
    position: event.position,
    meaning: policy.meaning,
    family: policy.family,
    tone: policy.tone,
    volume: policy.volume,
    knowledgeBasis: policy.knowledgeBasis,
    priority: policy.priority,
    salience: policy.salience,
    variantSeed: policy.variantSeed,
    durationSteps: policy.durationSteps,
  } satisfies SituatedExpressionIntent).event;
  return expected !== null
    && stableStringify(immutableEventFields(event))
      === stableStringify(immutableEventFields(expected));
}

/**
 * Reauthenticates one player anti-repetition memory and proves that both
 * cooldown counters are reachable through one shared fixed-step decay.
 */
export function playerExpressionMemoryMatchesAuthority(
  memory: SituatedExpressionMemory,
  authority: PlayerExpressionAuthority,
): boolean {
  const canonicalState = canonicalizeSituatedExpressionState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: 0,
    active: null,
    recent: [memory],
  });
  const canonicalMemory = canonicalState?.recent[0];
  if (
    canonicalMemory === undefined
    || canonicalMemory.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
  ) return false;
  const traversalFeedback = canonicalTraversalFeedback(authority.traversalFeedback);
  if (traversalFeedback === null) return false;
  const policy = policyFor(
    canonicalMemory.meaning,
    canonicalMemory.triggerEventId,
    traversalFeedback,
    authority.physicalCargo,
  );
  if (policy === null) return false;
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    triggerEventId: policy.triggerEventId,
    position: MEMORY_PROJECTION_POSITION,
    meaning: policy.meaning,
    family: policy.family,
    tone: policy.tone,
    volume: policy.volume,
    knowledgeBasis: policy.knowledgeBasis,
    priority: policy.priority,
    salience: policy.salience,
    variantSeed: policy.variantSeed,
    durationSteps: policy.durationSteps,
  } satisfies SituatedExpressionIntent);
  const initial = reduction.state?.recent[0];
  if (
    !reduction.accepted
    || initial === undefined
    || canonicalMemory.sourceActorId !== initial.sourceActorId
    || canonicalMemory.triggerEventId !== initial.triggerEventId
    || canonicalMemory.meaning !== initial.meaning
    || canonicalMemory.family !== initial.family
    || canonicalMemory.priority !== initial.priority
  ) return false;
  const elapsedSteps = initial.meaningCooldownRemainingSteps
    - canonicalMemory.meaningCooldownRemainingSteps;
  return nonnegativeSafeInteger(elapsedSteps)
    && canonicalMemory.familyCooldownRemainingSteps === Math.max(
      0,
      initial.familyCooldownRemainingSteps - elapsedSteps,
    );
}

/**
 * Reauthenticates an admitted player event against the exact bounded causal
 * receipt that accompanied its conserved sound sample. Current incident and
 * cargo history are consulted wherever they still provide independent world
 * authority; older non-cargo stumble receipts remain bounded interval facts.
 */
export function playerExpressionEventMatchesAdmission(
  event: SituatedExpressionEvent,
  admissionValue: unknown,
  authority: PlayerExpressionAuthority,
): boolean {
  const admission = canonicalizeSituatedExpressionAdmissionRecord(admissionValue);
  if (
    admission === null
    || admission.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || admission.eventId !== event.eventId
    || admission.triggerEventId !== event.triggerEventId
    || (admission.kind !== "player-traversal"
      && admission.kind !== "player-fall-recovery"
      && admission.kind !== "player-exhaustion"
      && admission.kind !== "legacy-v33-player")
  ) return false;
  if (admission.kind === "legacy-v33-player") {
    // The v33 migrator already admitted only a uniquely reconstructed
    // event/memory/sample chain. Its original incident may have been superseded
    // later in the same unfinished interval, so current traversal state is not
    // valid authority for rejecting that older published event.
    return isLegacyV33PlayerMeaning(event.meaning)
      && projectSituatedExpression(event) !== null;
  }
  const policy = policyForAdmission(admission, authority, event.variantSeed);
  if (policy === null || event.variantSeed !== policy.variantSeed) return false;
  const expected = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    triggerEventId: policy.triggerEventId,
    position: event.position,
    meaning: policy.meaning,
    family: policy.family,
    tone: policy.tone,
    volume: policy.volume,
    knowledgeBasis: policy.knowledgeBasis,
    priority: policy.priority,
    salience: policy.salience,
    variantSeed: policy.variantSeed,
    durationSteps: policy.durationSteps,
  } satisfies SituatedExpressionIntent).event;
  return expected !== null
    && stableStringify(immutableEventFields(event))
      === stableStringify(immutableEventFields(expected));
}

/** Exact semantic binding for one admitted player cooldown memory. */
export function playerExpressionMemoryMatchesAdmission(
  memory: SituatedExpressionMemory,
  admissionValue: unknown,
  authority: PlayerExpressionAuthority,
): boolean {
  const admission = canonicalizeSituatedExpressionAdmissionRecord(admissionValue);
  if (
    admission === null
    || admission.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || admission.sourceActorId !== memory.sourceActorId
    || admission.triggerEventId !== memory.triggerEventId
    || (admission.kind !== "player-traversal"
      && admission.kind !== "player-fall-recovery"
      && admission.kind !== "player-exhaustion"
      && admission.kind !== "legacy-v33-player")
  ) return false;
  if (admission.kind === "legacy-v33-player") {
    return isLegacyV33PlayerMeaning(memory.meaning)
      && canonicalizeSituatedExpressionState({
      version: SITUATED_EXPRESSION_VERSION,
      completedSteps: 0,
      active: null,
      recent: [memory],
      }) !== null;
  }
  const policy = policyForAdmission(admission, authority, 0);
  return policy !== null
    && memory.meaning === policy.meaning
    && memory.family === policy.family
    && memory.priority === policy.priority;
}

/** Exact causal acoustic policy for active or already-interrupted player speech. */
export function playerExpressionAdmissionSoundPolicy(
  admissionValue: unknown,
  authority: PlayerExpressionAuthority,
): PlayerExpressionAdmissionSoundPolicy | null {
  const admission = canonicalizeSituatedExpressionAdmissionRecord(admissionValue);
  if (
    admission === null
    || admission.sourceActorId !== LOCAL_PLAYER_LIVING_ACTOR_ID
    || (admission.kind !== "player-traversal"
      && admission.kind !== "player-fall-recovery"
      && admission.kind !== "player-exhaustion")
  ) return null;
  const policy = policyForAdmission(admission, authority, 0);
  return policy === null
    ? null
    : Object.freeze({
        volume: policy.volume,
        interrupt: policy.tone === "alarmed" || policy.volume === "shout"
          ? "strong"
          : "none",
      });
}

function policyForAdmission(
  admission: Extract<SituatedExpressionAdmissionRecord, {
    readonly kind: "player-traversal" | "player-fall-recovery" | "player-exhaustion";
  }>,
  authority: PlayerExpressionAuthority,
  candidateVariantSeed: number,
): PlayerExpressionPolicy | null {
  if (admission.kind === "player-exhaustion") {
    const policy = playerEffortExpressionPolicy(admission.sourceActorId, {
      committedWorldTick: admission.committedWorldTick,
      admittedAtPlayerStepPhase: admission.admittedAtPlayerStepPhase,
      acceptedDistanceUnits: admission.acceptedDistanceUnits,
      resolution: admission.resolution,
    });
    return policy === null || admission.triggerEventId !== policy.triggerEventId
      ? null
      : policy;
  }
  const traversalFeedback = canonicalTraversalFeedback(authority.traversalFeedback);
  if (traversalFeedback === null) return null;
  if (admission.kind === "player-fall-recovery") {
    const recovery = exactFallCargoRecovery(
      authority.physicalCargo,
      admission.recoveryEventId,
    );
    if (
      recovery === null
      || admission.triggerEventId !== admission.recoveryEventId
      || recovery.record.entityIds[0] !== admission.recoveredEntityId
    ) return null;
    return {
      meaning: "relief-after-cargo-recovery",
      family: "cargo",
      tone: "relieved",
      volume: "spoken",
      knowledgeBasis: "self-recovered-cargo",
      priority: 520_000,
      salience: 720_000,
      durationSteps: 9,
      triggerEventId: admission.recoveryEventId,
      variantSeed: recovery.record.ordinal >>> 0,
    };
  }

  if (
    admission.causalClass === "cargo-separation"
    && !exactFallCargoSeparationMatchesAdmission(authority.physicalCargo, admission)
  ) return null;
  const retainedIncident = traversalFeedback.incident?.id === admission.triggerEventId
    ? traversalFeedback.incident
    : null;
  if (retainedIncident !== null && retainedIncident.kind !== admission.incidentKind) return null;
  const variantSeed = retainedIncident === null
    ? candidateVariantSeed >>> 0
    : retainedIncident.variantSeed >>> 0;
  switch (admission.causalClass) {
    case "ordinary-stumble":
      return receiptTraversalPolicy(admission.triggerEventId, variantSeed, {
        meaning: "steady-after-stumble",
        family: "footing",
        tone: "restrained",
        volume: "murmur",
        knowledgeBasis: "self-felt-stumble",
        priority: 180_000,
        salience: 260_000,
        durationSteps: 7,
      });
    case "serious-stumble":
      return receiptTraversalPolicy(admission.triggerEventId, variantSeed, {
        meaning: "relief-after-near-fall",
        family: "footing",
        tone: "relieved",
        volume: "spoken",
        knowledgeBasis: "self-felt-near-fall",
        priority: 420_000,
        salience: 650_000,
        durationSteps: 10,
      });
    case "important-cargo-impact":
      return receiptTraversalPolicy(admission.triggerEventId, variantSeed, {
        meaning: "protect-important-cargo",
        family: "cargo",
        tone: admission.incidentKind === "stumble" ? "strained" : "alarmed",
        volume: admission.incidentKind === "stumble" ? "spoken" : "shout",
        knowledgeBasis: "self-observed-cargo-risk",
        priority: 620_000,
        salience: 760_000,
        durationSteps: 12,
      });
    case "cargo-separation":
      return receiptTraversalPolicy(admission.triggerEventId, variantSeed, {
        meaning: "alarm-at-cargo-loss",
        family: "cargo",
        tone: "alarmed",
        volume: "shout",
        knowledgeBasis: "self-observed-cargo-loss",
        priority: 950_000,
        salience: 980_000,
        durationSteps: 14,
      });
  }
}

function receiptTraversalPolicy(
  triggerEventId: string,
  variantSeed: number,
  policy: Omit<PlayerExpressionPolicy, "triggerEventId" | "variantSeed">,
): PlayerExpressionPolicy {
  return { ...policy, triggerEventId, variantSeed };
}

function exactFallCargoSeparationMatchesAdmission(
  physicalCargo: PhysicalCargoState,
  admission: Extract<SituatedExpressionAdmissionRecord, { readonly kind: "player-traversal" }>,
): boolean {
  if (admission.separationEventId === null) return false;
  const history = retainedCargoHistory(physicalCargo);
  if (history === null) return false;
  const terminalMatches = history.filter(
    ({ record }) => record.id === admission.separationEventId,
  );
  if (terminalMatches.length !== 1) return false;
  const terminal = terminalMatches[0];
  if (terminal === undefined) return false;
  const separationRecords = history.filter((candidate) => (
    candidate.world.region.x === terminal.world.region.x
    && candidate.world.region.y === terminal.world.region.y
    && candidate.record.step === terminal.record.step
    && candidate.record.kind === "scatter"
    && candidate.record.causes.includes("fall-separation")
    && candidate.record.ordinal <= terminal.record.ordinal
    && candidate.record.ordinal
      > terminal.record.ordinal - admission.separatedEntityIds.length
  )).sort((left, right) => left.record.ordinal - right.record.ordinal);
  return separationRecords.length === admission.separatedEntityIds.length
    && separationRecords.every((candidate, index) => (
      candidate.record.ordinal
        === terminal.record.ordinal - separationRecords.length + index + 1
      && candidate.record.entityIds.length === 1
    ))
    && stableStringify(separationRecords.flatMap(({ record }) => record.entityIds).sort())
      === stableStringify([...admission.separatedEntityIds].sort());
}

function policyFor(
  meaning: SituatedExpressionMeaning,
  triggerEventId: string,
  traversalFeedback: TraversalFeedbackState,
  physicalCargo: PhysicalCargoState,
): PlayerExpressionPolicy | null {
  if (meaning === "relief-after-cargo-recovery") {
    const recovery = exactFallCargoRecovery(physicalCargo, triggerEventId);
    return recovery === null
      ? null
      : {
          meaning,
          family: "cargo",
          tone: "relieved",
          volume: "spoken",
          knowledgeBasis: "self-recovered-cargo",
          priority: 520_000,
          salience: 720_000,
          durationSteps: 9,
          triggerEventId: recovery.record.id,
          variantSeed: recovery.record.ordinal >>> 0,
        };
  }

  const incident = traversalFeedback.incident;
  if (incident === null || incident.id !== triggerEventId) return null;
  switch (meaning) {
    case "steady-after-stumble":
      return incident.kind !== "stumble"
        ? null
        : traversalPolicy(incident, {
            meaning,
            family: "footing",
            tone: "restrained",
            volume: "murmur",
            knowledgeBasis: "self-felt-stumble",
            priority: 180_000,
            salience: 260_000,
            durationSteps: 7,
          });
    case "relief-after-near-fall":
      return incident.kind !== "stumble"
        ? null
        : traversalPolicy(incident, {
            meaning,
            family: "footing",
            tone: "relieved",
            volume: "spoken",
            knowledgeBasis: "self-felt-near-fall",
            priority: 420_000,
            salience: 650_000,
            durationSteps: 10,
          });
    case "protect-important-cargo":
      return incident.kind === "stumble"
        ? traversalPolicy(incident, {
            meaning,
            family: "cargo",
            tone: "strained",
            volume: "spoken",
            knowledgeBasis: "self-observed-cargo-risk",
            priority: 620_000,
            salience: 760_000,
            durationSteps: 12,
          })
        : incident.kind === "fall" || incident.kind === "sweep"
          ? traversalPolicy(incident, {
              meaning,
              family: "cargo",
              tone: "alarmed",
              volume: "shout",
              knowledgeBasis: "self-observed-cargo-risk",
              priority: 620_000,
              salience: 760_000,
              durationSteps: 12,
            })
          : null;
    case "alarm-at-cargo-loss":
      return (incident.kind === "fall" || incident.kind === "sweep")
          && hasRetainedFallSeparation(physicalCargo)
        ? traversalPolicy(incident, {
            meaning,
            family: "cargo",
            tone: "alarmed",
            volume: "shout",
            knowledgeBasis: "self-observed-cargo-loss",
            priority: 950_000,
            salience: 980_000,
            durationSteps: 14,
          })
        : null;
    case "porter-heavy-load":
    case "guardian-dog-warning":
    case "guardian-dog-defensive-growl":
    case "guardian-dog-shelter-whine":
    case "domestic-cat-rain-distress-call":
    case "fish-crow-alarm-call":
    case "deer-alarm-call":
    case "gull-alarm-call":
    case "elk-alarm-call":
    case "marsh-rabbit-alarm-thump":
    case "marsh-fox-pursuit-yip":
    case "human-danger-warning":
    case "keeper-secure-store-response":
    case "need-rest-after-exertion":
    case "resident-introduction":
    case "resident-weather-hold":
      return null;
  }
}

function isLegacyV33PlayerMeaning(meaning: SituatedExpressionMeaning): boolean {
  return meaning === "steady-after-stumble"
    || meaning === "relief-after-near-fall"
    || meaning === "protect-important-cargo"
    || meaning === "alarm-at-cargo-loss"
    || meaning === "relief-after-cargo-recovery";
}

function traversalPolicy(
  incident: TraversalIncident,
  policy: Omit<PlayerExpressionPolicy, "triggerEventId" | "variantSeed">,
): PlayerExpressionPolicy {
  return {
    ...policy,
    triggerEventId: incident.id,
    variantSeed: incident.variantSeed >>> 0,
  };
}

function hasRetainedFallSeparation(physicalCargo: PhysicalCargoState): boolean {
  const history = retainedCargoHistory(physicalCargo);
  return history !== null && history.some(({ record }) => (
    record.kind === "scatter" && record.causes.includes("fall-separation")
  ));
}

function exactFallCargoRecovery(
  physicalCargo: PhysicalCargoState,
  triggerEventId: string,
): LocatedCargoHistory | null {
  const history = retainedCargoHistory(physicalCargo);
  if (history === null) return null;
  const matches = history.filter(({ record }) => record.id === triggerEventId);
  if (matches.length !== 1) return null;
  const recovery = matches[0];
  if (
    recovery === undefined
    || (recovery.record.kind !== "pickup" && recovery.record.kind !== "merge")
    || !recovery.record.causes.includes("recovery")
    || recovery.record.entityIds.length !== 1
  ) return null;
  const entityId = recovery.record.entityIds[0];
  return entityId !== undefined && history.some((candidate) => (
    candidate.record.kind === "scatter"
    && candidate.record.entityIds.includes(entityId)
    && candidate.record.causes.includes("fall-separation")
    && cargoRecordPrecedes(candidate, recovery)
  ))
    ? recovery
    : null;
}

function cargoRecordPrecedes(
  candidate: LocatedCargoHistory,
  successor: LocatedCargoHistory,
): boolean {
  if (candidate.record.step !== successor.record.step) {
    return candidate.record.step < successor.record.step;
  }
  return candidate.world.region.x === successor.world.region.x
    && candidate.world.region.y === successor.world.region.y
    && candidate.record.ordinal < successor.record.ordinal;
}

/** Whole-storage history scans are confined to this persistence validator. */
function retainedCargoHistory(
  physicalCargo: PhysicalCargoState,
): readonly LocatedCargoHistory[] | null {
  try {
    return physicalCargoWorlds(physicalCargo).flatMap((world) => (
      world.history.map((record) => ({ world, record }))
    ));
  } catch {
    return null;
  }
}

function canonicalTraversalFeedback(
  value: TraversalFeedbackState,
): TraversalFeedbackState | null {
  try {
    return canonicalizeTraversalFeedback(value);
  } catch {
    return null;
  }
}

function immutableEventFields(event: SituatedExpressionEvent): Readonly<Record<string, unknown>> {
  return {
    version: event.version,
    catalogVersion: event.catalogVersion,
    eventId: event.eventId,
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    position: event.position,
    meaning: event.meaning,
    family: event.family,
    tone: event.tone,
    volume: event.volume,
    knowledgeBasis: event.knowledgeBasis,
    vocalization: event.vocalization,
    priority: event.priority,
    salience: event.salience,
    variantSeed: event.variantSeed,
    realizationKey: event.realizationKey,
    durationSteps: event.durationSteps,
  };
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}
