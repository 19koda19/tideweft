import {
  getCoreWildlifeProfile,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import type { RootSeed } from "../sim/rng";
import { createRegionCoord, isRegionCoord, type RegionCoord } from "../sim/regions";
import { FIXED_POINT } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_GROUP_VERSION = 1 as const;
export const CORE_ECOLOGY_GROUP_SET_VERSION = 1 as const;
export const CORE_ECOLOGY_GROUP_GENERATION_VERSION = 1 as const;
export const CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS = 8 as const;
export const CORE_ECOLOGY_GROUP_MAX_MEMBERS = 48 as const;
export const CORE_ECOLOGY_GROUP_MAX_COMPONENTS = 2 as const;
export const CORE_ECOLOGY_GROUP_MAX_SIGNALS = 8 as const;
export const CORE_ECOLOGY_GROUP_MAX_LINEAGE_EVENTS = 16 as const;
export const CORE_ECOLOGY_GROUP_MAX_AFTERMATH = 16 as const;
export const CORE_ECOLOGY_GROUP_MAX_GROUPS = 24 as const;
export const CORE_ECOLOGY_GROUP_MAX_SERIALIZED_BYTES = 512 * 1_024;
export const CORE_ECOLOGY_GROUP_SPLIT_PRESSURE = 650_000 as const;
export const CORE_ECOLOGY_GROUP_REJOIN_START_COHESION = 650_000 as const;
export const CORE_ECOLOGY_GROUP_REJOIN_COMPLETE_COHESION = 850_000 as const;
export const CORE_ECOLOGY_GROUP_COHESION_RECOVERY = 100_000 as const;

export type CoreEcologyGroupSpecies = Exclude<CoreWildlifeSpecies, "black-bear">;
export type CoreEcologyGroupOrganization = "herd" | "flock";
export type CoreEcologyGroupPhase = "cohesive" | "separated" | "rejoining";
export type CoreEcologyGroupSignalKind = "alarm" | "movement";
export type CoreEcologyGroupLineageKind = "origin" | "split" | "rejoin";
export type CoreEcologyGroupDisturbanceCause =
  | "aggregate-proximity"
  | "alarm-signal"
  | "habitat-pressure"
  | "weather-pressure";
export type CoreEcologyGroupAftermathKind =
  | "displacement"
  | "reunion"
  | "separation";

export interface CoreEcologyGroupIdentity {
  readonly generationVersion: typeof CORE_ECOLOGY_GROUP_GENERATION_VERSION;
  readonly stableId: string;
  /** Lossless four-word seed fingerprint used to authenticate stable identity. */
  readonly seedFingerprint: string;
  readonly species: CoreEcologyGroupSpecies;
  readonly organization: CoreEcologyGroupOrganization;
  readonly originRegion: RegionCoord;
  readonly populationKey: string;
  readonly groupOrdinal: number;
}

export interface CoreEcologyGroupComponentState {
  readonly componentId: string;
  readonly componentOrdinal: number;
  readonly createdByLineageId: string;
  readonly parentComponentIds: readonly string[];
  readonly memberOrdinals: readonly number[];
  readonly anchor: WorldPosition;
  /** Fixed-point turn in [0, 1,000,000). */
  readonly heading: number;
}

export interface CoreEcologyGroupLineageEvent {
  readonly lineageId: string;
  readonly lineageOrdinal: number;
  readonly kind: CoreEcologyGroupLineageKind;
  readonly atTick: number;
  readonly causeReferenceId: string | null;
  readonly parentComponentIds: readonly string[];
  readonly childComponentIds: readonly string[];
}

/**
 * A signal carries group-level information, never a hidden target identity or
 * exact threat position. Reached membership expands only at coarse cadence.
 */
export interface CoreEcologyGroupSignalState {
  readonly signalId: string;
  readonly signalOrdinal: number;
  readonly kind: CoreEcologyGroupSignalKind;
  readonly causeReferenceId: string;
  readonly sourceMemberOrdinal: number;
  readonly emittedAtTick: number;
  readonly lastPropagatedAtTick: number;
  readonly expiresAtTick: number;
  readonly pressure: number;
  readonly movementHeading: number;
  readonly reachedMemberOrdinals: readonly number[];
}

/**
 * Persisted aftermath is intentionally nonlethal and not a player report.
 * Presentation may expose it only after an independent direct observation.
 */
export interface CoreEcologyGroupAftermath {
  readonly version: typeof CORE_ECOLOGY_GROUP_VERSION;
  readonly aftermathId: string;
  readonly aftermathOrdinal: number;
  readonly kind: CoreEcologyGroupAftermathKind;
  readonly atTick: number;
  readonly incidentId: string;
  readonly causeKind: CoreEcologyGroupDisturbanceCause | "cohesion-recovery";
  readonly causeReferenceId: string;
  readonly beforeComponentIds: readonly string[];
  readonly afterComponentIds: readonly string[];
  readonly beforeAnchors: readonly WorldPosition[];
  readonly afterAnchors: readonly WorldPosition[];
  readonly playerAbsent: true;
  readonly harm: "none";
  readonly cargoInteraction: false;
  readonly disclosure: "direct-observation-required";
}

export interface CoreEcologyGroupState {
  readonly version: typeof CORE_ECOLOGY_GROUP_VERSION;
  readonly identity: CoreEcologyGroupIdentity;
  readonly revision: number;
  readonly updatedAtTick: number;
  readonly nextCoarseTick: number;
  readonly phase: CoreEcologyGroupPhase;
  readonly cohesion: number;
  readonly movementHeading: number;
  readonly memberOrdinals: readonly number[];
  readonly components: readonly CoreEcologyGroupComponentState[];
  /** Habitat owner validates this point before it enters the group record. */
  readonly rendezvousAnchor: WorldPosition;
  readonly signals: readonly CoreEcologyGroupSignalState[];
  readonly lineage: readonly CoreEcologyGroupLineageEvent[];
  readonly aftermath: readonly CoreEcologyGroupAftermath[];
  readonly nextComponentOrdinal: number;
  readonly nextSignalOrdinal: number;
  readonly nextLineageOrdinal: number;
  readonly nextAftermathOrdinal: number;
}

export interface CreateCoreEcologyGroupInput {
  readonly seed: RootSeed;
  readonly species: CoreWildlifeSpecies;
  readonly originRegion: RegionCoord;
  readonly populationKey: string;
  readonly groupOrdinal: number;
  readonly memberOrdinals: readonly number[];
  readonly anchor: WorldPosition;
  readonly heading?: number;
  readonly cohesion?: number;
  readonly tick?: number;
}

export interface EmitCoreEcologyGroupSignalInput {
  readonly atTick: number;
  readonly kind: CoreEcologyGroupSignalKind;
  readonly causeReferenceId: string;
  readonly sourceMemberOrdinal: number;
  readonly pressure: number;
  readonly movementHeading: number;
  /** Defaults to enough coarse steps to reach every current member. */
  readonly lifetimeCadences?: number;
}

/**
 * An upstream habitat/aggregate owner must authorize every disturbance and
 * destination. This module neither performs hidden sensing nor invents paths.
 */
export interface CoreEcologyPlayerAbsentDisturbance {
  readonly disturbanceId: string;
  readonly atTick: number;
  readonly causeKind: CoreEcologyGroupDisturbanceCause;
  readonly causeReferenceId: string;
  readonly pressure: number;
  readonly movementHeading: number;
  readonly destinationAnchors: readonly WorldPosition[];
  readonly rendezvousAnchor: WorldPosition;
  readonly playerAbsent: true;
  readonly nonlethal: true;
  readonly cargoInteraction: false;
}

export interface StepCoreEcologyGroupCoarseInput {
  /** Exactly the saved nextCoarseTick; callers cannot skip or double-step. */
  readonly atTick: number;
  readonly disturbances: readonly CoreEcologyPlayerAbsentDisturbance[];
}

export interface StepCoreEcologyGroupSignalCadenceInput {
  /** Exactly the saved nextCoarseTick; callers cannot skip or double-step. */
  readonly atTick: number;
}

export interface CoreEcologyGroupComponentAnchorInput {
  readonly componentId: string;
  /** Exact canonical anchor resolved by the upstream actor/habitat owner. */
  readonly anchor: WorldPosition;
}

export interface ReconcileCoreEcologyGroupAnchorsInput {
  /** Must fall in [updatedAtTick, nextCoarseTick). */
  readonly atTick: number;
  /** Exactly one entry for every current component; order has no meaning. */
  readonly componentAnchors: readonly CoreEcologyGroupComponentAnchorInput[];
  /** Defaults to the sole component anchor for a cohesive group, else the prior rendezvous. */
  readonly rendezvousAnchor?: WorldPosition;
}

export interface CoreEcologyGroupTransitionEvent {
  readonly eventId: string;
  readonly groupId: string;
  readonly atTick: number;
  readonly kind: "group-displaced" | "group-rejoined" | "group-split" | "signal-propagated";
  readonly causeReferenceId: string;
  readonly memberOrdinals: readonly number[];
  readonly componentIds: readonly string[];
  readonly nonlethal: true;
}

export interface CoreEcologyGroupCoarseStepResult {
  readonly group: CoreEcologyGroupState;
  readonly events: readonly CoreEcologyGroupTransitionEvent[];
}

export interface CoreEcologyGroupSet {
  readonly version: typeof CORE_ECOLOGY_GROUP_SET_VERSION;
  readonly groups: readonly CoreEcologyGroupState[];
}

const UTF8_ENCODER = new TextEncoder();
const POPULATION_KEY_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,63}$/u;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/@+-]{0,255}$/u;
const SEED_FINGERPRINT_PATTERN = /^[0-9a-z]{7}(?:\.[0-9a-z]{7}){3}$/u;
const GROUP_PHASES = new Set<string>(["cohesive", "rejoining", "separated"]);
const SIGNAL_KINDS = new Set<string>(["alarm", "movement"]);
const LINEAGE_KINDS = new Set<string>(["origin", "rejoin", "split"]);
const DISTURBANCE_CAUSES = new Set<string>([
  "aggregate-proximity",
  "alarm-signal",
  "habitat-pressure",
  "weather-pressure",
]);
const AFTERMATH_KINDS = new Set<string>(["displacement", "reunion", "separation"]);

export function stableCoreEcologyGroupId(input: Readonly<{
  readonly seed: RootSeed;
  readonly species: CoreWildlifeSpecies;
  readonly originRegion: RegionCoord;
  readonly populationKey: string;
  readonly groupOrdinal: number;
}>): string {
  const generation = canonicalGenerationInput(input);
  if (generation === null || generation.species === "black-bear") {
    throw new RangeError("Only social deer and gull populations can own Wave-A groups");
  }
  return stableGroupIdFromFields({
    seedFingerprint: rootSeedFingerprint(generation.seed),
    species: generation.species,
    originRegion: generation.originRegion,
    populationKey: generation.populationKey,
    groupOrdinal: generation.groupOrdinal,
  });
}

export function createCoreEcologyGroup(
  input: CreateCoreEcologyGroupInput,
): CoreEcologyGroupState {
  if (!plainRecord(input) || !allowedCreateKeys(input)) {
    throw new TypeError("Core ecology group creation input is malformed");
  }
  const generation = canonicalGenerationInput(input);
  if (generation === null || generation.species === "black-bear") {
    throw new RangeError("Black bears remain solitary in the Wave-A group layer");
  }
  const memberOrdinals = canonicalOrdinalSet(input.memberOrdinals, 2, memberLimit(generation.species));
  const tick = input.tick ?? 0;
  const heading = input.heading ?? 0;
  const cohesion = input.cohesion ?? 900_000;
  if (
    memberOrdinals === null
    || !isWorldPosition(input.anchor)
    || !schedulableTick(tick)
    || !headingUnit(heading)
    || !fixedUnit(cohesion)
  ) throw new RangeError("Core ecology group members, anchor, or initial state are invalid");

  const stableId = stableCoreEcologyGroupId(generation);
  const identity: CoreEcologyGroupIdentity = deepFreeze({
    generationVersion: CORE_ECOLOGY_GROUP_GENERATION_VERSION,
    stableId,
    seedFingerprint: rootSeedFingerprint(generation.seed),
    species: generation.species,
    organization: organizationFor(generation.species),
    originRegion: createRegionCoord(generation.originRegion.x, generation.originRegion.y),
    populationKey: generation.populationKey,
    groupOrdinal: generation.groupOrdinal,
  });
  const initialComponentId = componentId(stableId, 0);
  const initialLineageId = lineageId(stableId, 0);
  const anchor = copyPosition(input.anchor);
  const candidate = {
    version: CORE_ECOLOGY_GROUP_VERSION,
    identity,
    revision: 0,
    updatedAtTick: tick,
    nextCoarseTick: safeFutureTick(tick, CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS),
    phase: "cohesive" as const,
    cohesion,
    movementHeading: heading,
    memberOrdinals,
    components: [{
      componentId: initialComponentId,
      componentOrdinal: 0,
      createdByLineageId: initialLineageId,
      parentComponentIds: [],
      memberOrdinals,
      anchor,
      heading,
    }],
    rendezvousAnchor: anchor,
    signals: [],
    lineage: [{
      lineageId: initialLineageId,
      lineageOrdinal: 0,
      kind: "origin" as const,
      atTick: tick,
      causeReferenceId: null,
      parentComponentIds: [],
      childComponentIds: [initialComponentId],
    }],
    aftermath: [],
    nextComponentOrdinal: 1,
    nextSignalOrdinal: 0,
    nextLineageOrdinal: 1,
    nextAftermathOrdinal: 0,
  };
  const group = canonicalizeCoreEcologyGroup(candidate);
  if (group === null) throw new Error("Generated core ecology group failed validation");
  return group;
}

export function canonicalizeCoreEcologyGroup(value: unknown): CoreEcologyGroupState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "aftermath",
    "cohesion",
    "components",
    "identity",
    "lineage",
    "memberOrdinals",
    "movementHeading",
    "nextAftermathOrdinal",
    "nextCoarseTick",
    "nextComponentOrdinal",
    "nextLineageOrdinal",
    "nextSignalOrdinal",
    "phase",
    "rendezvousAnchor",
    "revision",
    "signals",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_GROUP_VERSION
    || !nonnegativeSafeInteger(value.revision)
    || !schedulableTick(value.updatedAtTick)
    || !nonnegativeSafeInteger(value.nextCoarseTick)
    || value.nextCoarseTick <= value.updatedAtTick
    || (value.nextCoarseTick - value.updatedAtTick) > CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS
    || !GROUP_PHASES.has(value.phase as string)
    || !fixedUnit(value.cohesion)
    || !headingUnit(value.movementHeading)
    || !isWorldPosition(value.rendezvousAnchor)
    || !nonnegativeSafeInteger(value.nextComponentOrdinal)
    || !nonnegativeSafeInteger(value.nextSignalOrdinal)
    || !nonnegativeSafeInteger(value.nextLineageOrdinal)
    || !nonnegativeSafeInteger(value.nextAftermathOrdinal)
  ) return null;
  const identity = canonicalIdentity(value.identity);
  if (identity === null) return null;
  const memberOrdinals = canonicalOrdinalSet(
    value.memberOrdinals,
    2,
    memberLimit(identity.species),
  );
  if (memberOrdinals === null) return null;
  const lineage = canonicalLineage(
    value.lineage,
    identity.stableId,
    value.updatedAtTick,
    value.nextLineageOrdinal,
  );
  if (lineage === null) return null;
  const components = canonicalComponents(
    value.components,
    identity.stableId,
    memberOrdinals,
    value.nextComponentOrdinal,
    new Set(lineage.map(({ lineageId: id }) => id)),
  );
  if (components === null) return null;
  if (
    (value.phase === "cohesive" && components.length !== 1)
    || (value.phase !== "cohesive" && components.length !== 2)
  ) return null;
  const signals = canonicalSignals(
    value.signals,
    identity.stableId,
    memberOrdinals,
    value.updatedAtTick,
    value.nextSignalOrdinal,
  );
  const aftermath = canonicalAftermath(
    value.aftermath,
    identity.stableId,
    value.updatedAtTick,
    value.nextAftermathOrdinal,
  );
  if (signals === null || aftermath === null) return null;

  return deepFreeze({
    version: CORE_ECOLOGY_GROUP_VERSION,
    identity,
    revision: value.revision,
    updatedAtTick: value.updatedAtTick,
    nextCoarseTick: value.nextCoarseTick,
    phase: value.phase as CoreEcologyGroupPhase,
    cohesion: value.cohesion,
    movementHeading: value.movementHeading,
    memberOrdinals,
    components,
    rendezvousAnchor: copyPosition(value.rendezvousAnchor),
    signals,
    lineage,
    aftermath,
    nextComponentOrdinal: value.nextComponentOrdinal,
    nextSignalOrdinal: value.nextSignalOrdinal,
    nextLineageOrdinal: value.nextLineageOrdinal,
    nextAftermathOrdinal: value.nextAftermathOrdinal,
  });
}

export function emitCoreEcologyGroupSignal(
  value: unknown,
  input: EmitCoreEcologyGroupSignalInput,
): CoreEcologyGroupState | null {
  const group = canonicalizeCoreEcologyGroup(value);
  if (group === null || !plainRecord(input) || !allowedSignalInputKeys(input)) return null;
  const lifetimeCadences = input.lifetimeCadences ?? group.memberOrdinals.length;
  if (
    !nonnegativeSafeInteger(input.atTick)
    || input.atTick < group.updatedAtTick
    || input.atTick >= group.nextCoarseTick
    || !SIGNAL_KINDS.has(input.kind)
    || !validReference(input.causeReferenceId)
    || !nonnegativeSafeInteger(input.sourceMemberOrdinal)
    || !group.memberOrdinals.includes(input.sourceMemberOrdinal)
    || !fixedUnit(input.pressure)
    || input.pressure === 0
    || !headingUnit(input.movementHeading)
    || !positiveSafeInteger(lifetimeCadences)
    || lifetimeCadences > CORE_ECOLOGY_GROUP_MAX_MEMBERS
    || group.nextSignalOrdinal >= Number.MAX_SAFE_INTEGER
    || group.revision >= Number.MAX_SAFE_INTEGER
  ) return null;
  const retainedSignals = group.signals.filter(({ expiresAtTick }) => expiresAtTick > input.atTick);
  if (retainedSignals.length >= CORE_ECOLOGY_GROUP_MAX_SIGNALS) return null;
  const duration = lifetimeCadences * CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS
    + CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS;
  let expiresAtTick: number;
  try {
    expiresAtTick = safeFutureTick(input.atTick, duration);
  } catch {
    return null;
  }
  const signalOrdinal = group.nextSignalOrdinal;
  const signal: CoreEcologyGroupSignalState = deepFreeze({
    signalId: signalId(group.identity.stableId, signalOrdinal),
    signalOrdinal,
    kind: input.kind,
    causeReferenceId: input.causeReferenceId,
    sourceMemberOrdinal: input.sourceMemberOrdinal,
    emittedAtTick: input.atTick,
    lastPropagatedAtTick: input.atTick,
    expiresAtTick,
    pressure: input.pressure,
    movementHeading: input.movementHeading,
    reachedMemberOrdinals: [input.sourceMemberOrdinal],
  });
  return canonicalizeCoreEcologyGroup({
    ...group,
    revision: group.revision + 1,
    updatedAtTick: input.atTick,
    signals: [...retainedSignals, signal],
    nextSignalOrdinal: signalOrdinal + 1,
  });
}

export function stepCoreEcologyGroupCoarse(
  value: unknown,
  input: StepCoreEcologyGroupCoarseInput,
): CoreEcologyGroupCoarseStepResult | null {
  const group = canonicalizeCoreEcologyGroup(value);
  if (
    group === null
    || !plainRecord(input)
    || !exactKeys(input, ["atTick", "disturbances"])
    || input.atTick !== group.nextCoarseTick
    || !Array.isArray(input.disturbances)
    || group.revision >= Number.MAX_SAFE_INTEGER
  ) return null;
  let nextCoarseTick: number;
  try {
    nextCoarseTick = safeFutureTick(input.atTick, CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS);
  } catch {
    return null;
  }
  const disturbances = canonicalDisturbances(input.disturbances, input.atTick);
  if (disturbances === null) return null;

  const events: CoreEcologyGroupTransitionEvent[] = [];
  const propagatedSignals = propagateSignals(group, input.atTick, events);
  const selected = [...disturbances].sort((left, right) => (
    right.pressure - left.pressure || compareText(left.disturbanceId, right.disturbanceId)
  ))[0] ?? null;

  let phase = group.phase;
  let cohesion = group.cohesion;
  let movementHeading = group.movementHeading;
  let components = group.components;
  let rendezvousAnchor = group.rendezvousAnchor;
  let lineage = group.lineage;
  let aftermath = group.aftermath;
  let nextComponentOrdinal = group.nextComponentOrdinal;
  let nextLineageOrdinal = group.nextLineageOrdinal;
  let nextAftermathOrdinal = group.nextAftermathOrdinal;

  if (selected !== null) {
    if (nextAftermathOrdinal >= Number.MAX_SAFE_INTEGER) return null;
    const requiredAnchorCount = group.phase === "cohesive"
      && selected.pressure < CORE_ECOLOGY_GROUP_SPLIT_PRESSURE ? 1 : 2;
    if (selected.destinationAnchors.length !== requiredAnchorCount) return null;
    const beforeComponents = components;
    const beforeAnchors = beforeComponents.map(({ anchor }) => anchor);
    cohesion = Math.max(0, cohesion - Math.max(1, Math.floor(selected.pressure / 2)));
    movementHeading = selected.movementHeading;
    rendezvousAnchor = selected.rendezvousAnchor;

    if (phase === "cohesive" && selected.pressure >= CORE_ECOLOGY_GROUP_SPLIT_PRESSURE) {
      if (
        nextComponentOrdinal > Number.MAX_SAFE_INTEGER - 2
        || nextLineageOrdinal >= Number.MAX_SAFE_INTEGER
      ) return null;
      const parentIds = beforeComponents.map(({ componentId: id }) => id).sort(compareText);
      const childMembers = partitionMembers(group.memberOrdinals);
      const lineageOrdinal = nextLineageOrdinal;
      const transitionLineageId = lineageId(group.identity.stableId, lineageOrdinal);
      components = childMembers.map((members, index) => {
        const componentOrdinal = nextComponentOrdinal + index;
        return deepFreeze({
          componentId: componentId(group.identity.stableId, componentOrdinal),
          componentOrdinal,
          createdByLineageId: transitionLineageId,
          parentComponentIds: parentIds,
          memberOrdinals: members,
          anchor: selected.destinationAnchors[index]!,
          heading: selected.movementHeading,
        });
      }).sort(compareComponent);
      const lineageEvent: CoreEcologyGroupLineageEvent = deepFreeze({
        lineageId: transitionLineageId,
        lineageOrdinal,
        kind: "split",
        atTick: input.atTick,
        causeReferenceId: selected.causeReferenceId,
        parentComponentIds: parentIds,
        childComponentIds: components.map(({ componentId: id }) => id),
      });
      lineage = retainLineage([...lineage, lineageEvent]);
      nextComponentOrdinal += 2;
      nextLineageOrdinal += 1;
      phase = "separated";
      const recorded = appendAftermath(group.identity.stableId, aftermath, nextAftermathOrdinal, {
        kind: "separation",
        atTick: input.atTick,
        incidentId: selected.disturbanceId,
        causeKind: selected.causeKind,
        causeReferenceId: selected.causeReferenceId,
        beforeComponentIds: parentIds,
        afterComponentIds: components.map(({ componentId: id }) => id),
        beforeAnchors,
        afterAnchors: components.map(({ anchor }) => anchor),
      });
      aftermath = recorded.aftermath;
      nextAftermathOrdinal = recorded.nextOrdinal;
      events.push(transitionEvent(
        group,
        input.atTick,
        "group-split",
        selected.causeReferenceId,
        group.memberOrdinals,
        components.map(({ componentId: id }) => id),
        selected.disturbanceId,
      ));
    } else {
      phase = phase === "rejoining" ? "separated" : phase;
      components = components.map((component, index) => deepFreeze({
        ...component,
        anchor: selected.destinationAnchors[index]!,
        heading: selected.movementHeading,
      }));
      const recorded = appendAftermath(group.identity.stableId, aftermath, nextAftermathOrdinal, {
        kind: "displacement",
        atTick: input.atTick,
        incidentId: selected.disturbanceId,
        causeKind: selected.causeKind,
        causeReferenceId: selected.causeReferenceId,
        beforeComponentIds: beforeComponents.map(({ componentId: id }) => id),
        afterComponentIds: components.map(({ componentId: id }) => id),
        beforeAnchors,
        afterAnchors: components.map(({ anchor }) => anchor),
      });
      aftermath = recorded.aftermath;
      nextAftermathOrdinal = recorded.nextOrdinal;
      events.push(transitionEvent(
        group,
        input.atTick,
        "group-displaced",
        selected.causeReferenceId,
        group.memberOrdinals,
        components.map(({ componentId: id }) => id),
        selected.disturbanceId,
      ));
    }
  } else {
    cohesion = Math.min(FIXED_POINT, cohesion + CORE_ECOLOGY_GROUP_COHESION_RECOVERY);
    if (phase === "separated" && cohesion >= CORE_ECOLOGY_GROUP_REJOIN_START_COHESION) {
      phase = "rejoining";
    } else if (
      phase === "rejoining"
      && cohesion >= CORE_ECOLOGY_GROUP_REJOIN_COMPLETE_COHESION
    ) {
      if (
        nextComponentOrdinal >= Number.MAX_SAFE_INTEGER
        || nextLineageOrdinal >= Number.MAX_SAFE_INTEGER
        || nextAftermathOrdinal >= Number.MAX_SAFE_INTEGER
      ) return null;
      const beforeComponents = components;
      const beforeIds = beforeComponents.map(({ componentId: id }) => id).sort(compareText);
      const lineageOrdinal = nextLineageOrdinal;
      const transitionLineageId = lineageId(group.identity.stableId, lineageOrdinal);
      const merged: CoreEcologyGroupComponentState = deepFreeze({
        componentId: componentId(group.identity.stableId, nextComponentOrdinal),
        componentOrdinal: nextComponentOrdinal,
        createdByLineageId: transitionLineageId,
        parentComponentIds: beforeIds,
        memberOrdinals: group.memberOrdinals,
        anchor: rendezvousAnchor,
        heading: movementHeading,
      });
      const lineageEvent: CoreEcologyGroupLineageEvent = deepFreeze({
        lineageId: transitionLineageId,
        lineageOrdinal,
        kind: "rejoin",
        atTick: input.atTick,
        causeReferenceId: group.identity.stableId,
        parentComponentIds: beforeIds,
        childComponentIds: [merged.componentId],
      });
      lineage = retainLineage([...lineage, lineageEvent]);
      components = [merged];
      nextComponentOrdinal += 1;
      nextLineageOrdinal += 1;
      phase = "cohesive";
      const recorded = appendAftermath(group.identity.stableId, aftermath, nextAftermathOrdinal, {
        kind: "reunion",
        atTick: input.atTick,
        incidentId: transitionLineageId,
        causeKind: "cohesion-recovery",
        causeReferenceId: group.identity.stableId,
        beforeComponentIds: beforeIds,
        afterComponentIds: [merged.componentId],
        beforeAnchors: beforeComponents.map(({ anchor }) => anchor),
        afterAnchors: [rendezvousAnchor],
      });
      aftermath = recorded.aftermath;
      nextAftermathOrdinal = recorded.nextOrdinal;
      events.push(transitionEvent(
        group,
        input.atTick,
        "group-rejoined",
        group.identity.stableId,
        group.memberOrdinals,
        [merged.componentId],
        transitionLineageId,
      ));
    }
  }

  const candidate = canonicalizeCoreEcologyGroup({
    ...group,
    revision: group.revision + 1,
    updatedAtTick: input.atTick,
    nextCoarseTick,
    phase,
    cohesion,
    movementHeading,
    components,
    rendezvousAnchor,
    signals: propagatedSignals,
    lineage,
    aftermath,
    nextComponentOrdinal,
    nextLineageOrdinal,
    nextAftermathOrdinal,
  });
  if (candidate === null) return null;
  events.sort(compareTransitionEvent);
  return deepFreeze({ group: candidate, events });
}

/**
 * Advances only the bounded social-signal clock. Active exact actors may still
 * receive a signal on cadence, but aggregate cohesion and component topology
 * cannot change without an unloaded coarse transition or physical proof.
 */
export function stepCoreEcologyGroupSignalCadence(
  value: unknown,
  input: StepCoreEcologyGroupSignalCadenceInput,
): CoreEcologyGroupCoarseStepResult | null {
  const group = canonicalizeCoreEcologyGroup(value);
  if (
    group === null
    || !plainRecord(input)
    || !exactKeys(input, ["atTick"])
    || input.atTick !== group.nextCoarseTick
    || group.revision >= Number.MAX_SAFE_INTEGER
  ) return null;
  let nextCoarseTick: number;
  try {
    nextCoarseTick = safeFutureTick(input.atTick, CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS);
  } catch {
    return null;
  }
  const events: CoreEcologyGroupTransitionEvent[] = [];
  const signals = propagateSignals(group, input.atTick, events);
  const candidate = canonicalizeCoreEcologyGroup({
    ...group,
    revision: group.revision + 1,
    updatedAtTick: input.atTick,
    nextCoarseTick,
    signals,
  });
  if (candidate === null) return null;
  events.sort(compareTransitionEvent);
  return deepFreeze({ group: candidate, events });
}

/**
 * Reconciles full-simulation positions into persisted group anchors without
 * inventing movement, observations, cargo effects, or ecological incidents.
 */
export function reconcileCoreEcologyGroupAnchors(
  value: unknown,
  input: ReconcileCoreEcologyGroupAnchorsInput,
): CoreEcologyGroupState | null {
  const group = canonicalizeCoreEcologyGroup(value);
  if (
    group === null
    || !plainRecord(input)
    || !allowedAnchorReconciliationKeys(input)
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick < group.updatedAtTick
    || input.atTick >= group.nextCoarseTick
    || !Array.isArray(input.componentAnchors)
    || input.componentAnchors.length !== group.components.length
    || (input.rendezvousAnchor !== undefined && !isWorldPosition(input.rendezvousAnchor))
    || group.revision >= Number.MAX_SAFE_INTEGER
  ) return null;

  const anchors = new Map<string, WorldPosition>();
  for (const raw of input.componentAnchors) {
    if (
      !plainRecord(raw)
      || !exactKeys(raw, ["anchor", "componentId"])
      || !validReference(raw.componentId)
      || !isWorldPosition(raw.anchor)
      || anchors.has(raw.componentId)
    ) return null;
    anchors.set(raw.componentId, copyPosition(raw.anchor));
  }
  if (group.components.some(({ componentId: id }) => !anchors.has(id))) return null;

  const components = group.components.map((component) => deepFreeze({
    ...component,
    anchor: anchors.get(component.componentId)!,
  }));
  const rendezvousAnchor = input.rendezvousAnchor === undefined
    ? group.phase === "cohesive"
      ? components[0]!.anchor
      : group.rendezvousAnchor
    : copyPosition(input.rendezvousAnchor);
  return canonicalizeCoreEcologyGroup({
    ...group,
    revision: group.revision + 1,
    updatedAtTick: input.atTick,
    components,
    rendezvousAnchor,
    signals: group.signals.filter(({ expiresAtTick }) => expiresAtTick > input.atTick),
  });
}

export function createCoreEcologyGroupSet(
  groupsValue: readonly CoreEcologyGroupState[] = [],
): CoreEcologyGroupSet {
  const set = canonicalizeCoreEcologyGroupSet({
    version: CORE_ECOLOGY_GROUP_SET_VERSION,
    groups: groupsValue,
  });
  if (set === null) throw new RangeError("Core ecology group set is malformed or overlapping");
  return set;
}

export function canonicalizeCoreEcologyGroupSet(value: unknown): CoreEcologyGroupSet | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["groups", "version"])
    || value.version !== CORE_ECOLOGY_GROUP_SET_VERSION
    || !Array.isArray(value.groups)
    || value.groups.length > CORE_ECOLOGY_GROUP_MAX_GROUPS
  ) return null;
  const groups: CoreEcologyGroupState[] = [];
  const groupIds = new Set<string>();
  const memberOwners = new Set<string>();
  for (const raw of value.groups) {
    const group = canonicalizeCoreEcologyGroup(raw);
    if (group === null || groupIds.has(group.identity.stableId)) return null;
    groupIds.add(group.identity.stableId);
    for (const memberOrdinal of group.memberOrdinals) {
      const membershipKey = `${group.identity.species}:${group.identity.originRegion.x}:${group.identity.originRegion.y}:${group.identity.populationKey}:${memberOrdinal}`;
      if (memberOwners.has(membershipKey)) return null;
      memberOwners.add(membershipKey);
    }
    groups.push(group);
  }
  groups.sort((left, right) => compareText(left.identity.stableId, right.identity.stableId));
  return deepFreeze({ version: CORE_ECOLOGY_GROUP_SET_VERSION, groups });
}

export function serializeCoreEcologyGroupSet(value: unknown): string {
  const set = canonicalizeCoreEcologyGroupSet(value);
  if (set === null) throw new TypeError("Core ecology group set is malformed");
  const encoded = stableStringify(set);
  if (UTF8_ENCODER.encode(encoded).byteLength > CORE_ECOLOGY_GROUP_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Core ecology group state exceeds its save budget");
  }
  return encoded;
}

export function deserializeCoreEcologyGroupSet(text: unknown): CoreEcologyGroupSet | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_ECOLOGY_GROUP_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const set = canonicalizeCoreEcologyGroupSet(JSON.parse(text) as unknown);
    return set !== null && stableStringify(set) === text ? set : null;
  } catch {
    return null;
  }
}

export function coreEcologyGroupComponentForMember(
  value: unknown,
  memberOrdinal: unknown,
): CoreEcologyGroupComponentState | null {
  const group = canonicalizeCoreEcologyGroup(value);
  if (group === null || !nonnegativeSafeInteger(memberOrdinal)) return null;
  return group.components.find(({ memberOrdinals }) => memberOrdinals.includes(memberOrdinal)) ?? null;
}

function canonicalIdentity(value: unknown): CoreEcologyGroupIdentity | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "generationVersion",
    "groupOrdinal",
    "organization",
    "originRegion",
    "populationKey",
    "seedFingerprint",
    "species",
    "stableId",
  ])) return null;
  if (
    value.generationVersion !== CORE_ECOLOGY_GROUP_GENERATION_VERSION
    || (value.species !== "deer" && value.species !== "gull")
    || value.organization !== organizationFor(value.species)
    || !isRegionCoord(value.originRegion)
    || !validPopulationKey(value.populationKey)
    || !nonnegativeSafeInteger(value.groupOrdinal)
    || typeof value.seedFingerprint !== "string"
    || !SEED_FINGERPRINT_PATTERN.test(value.seedFingerprint)
    || typeof value.stableId !== "string"
    || !validReference(value.stableId)
    || value.stableId !== stableGroupIdFromFields({
      seedFingerprint: value.seedFingerprint,
      species: value.species,
      originRegion: value.originRegion,
      populationKey: value.populationKey,
      groupOrdinal: value.groupOrdinal,
    })
  ) return null;
  return deepFreeze({
    generationVersion: CORE_ECOLOGY_GROUP_GENERATION_VERSION,
    stableId: value.stableId,
    seedFingerprint: value.seedFingerprint,
    species: value.species,
    organization: value.organization,
    originRegion: createRegionCoord(value.originRegion.x, value.originRegion.y),
    populationKey: value.populationKey,
    groupOrdinal: value.groupOrdinal,
  });
}

function canonicalComponents(
  value: unknown,
  groupId: string,
  groupMembers: readonly number[],
  nextComponentOrdinal: number,
  lineageIds: ReadonlySet<string>,
): readonly CoreEcologyGroupComponentState[] | null {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > CORE_ECOLOGY_GROUP_MAX_COMPONENTS
  ) return null;
  const components: CoreEcologyGroupComponentState[] = [];
  const componentIds = new Set<string>();
  const ownedMembers = new Set<number>();
  for (const raw of value) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "anchor",
      "componentId",
      "componentOrdinal",
      "createdByLineageId",
      "heading",
      "memberOrdinals",
      "parentComponentIds",
    ])) return null;
    const members = canonicalOrdinalSet(raw.memberOrdinals, 1, groupMembers.length);
    const parents = canonicalReferenceSet(raw.parentComponentIds, CORE_ECOLOGY_GROUP_MAX_COMPONENTS);
    if (
      members === null
      || parents === null
      || !nonnegativeSafeInteger(raw.componentOrdinal)
      || raw.componentOrdinal >= nextComponentOrdinal
      || typeof raw.componentId !== "string"
      || raw.componentId !== componentId(groupId, raw.componentOrdinal)
      || componentIds.has(raw.componentId)
      || typeof raw.createdByLineageId !== "string"
      || !lineageIds.has(raw.createdByLineageId)
      || !isWorldPosition(raw.anchor)
      || !headingUnit(raw.heading)
    ) return null;
    for (const member of members) {
      if (!groupMembers.includes(member) || ownedMembers.has(member)) return null;
      ownedMembers.add(member);
    }
    componentIds.add(raw.componentId);
    components.push(deepFreeze({
      componentId: raw.componentId,
      componentOrdinal: raw.componentOrdinal,
      createdByLineageId: raw.createdByLineageId,
      parentComponentIds: parents,
      memberOrdinals: members,
      anchor: copyPosition(raw.anchor),
      heading: raw.heading,
    }));
  }
  if (ownedMembers.size !== groupMembers.length) return null;
  components.sort(compareComponent);
  return Object.freeze(components);
}

function canonicalLineage(
  value: unknown,
  groupId: string,
  maximumTick: number,
  nextLineageOrdinal: number,
): readonly CoreEcologyGroupLineageEvent[] | null {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > CORE_ECOLOGY_GROUP_MAX_LINEAGE_EVENTS
  ) return null;
  const lineage: CoreEcologyGroupLineageEvent[] = [];
  const ordinals = new Set<number>();
  for (const raw of value) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "atTick",
      "causeReferenceId",
      "childComponentIds",
      "kind",
      "lineageId",
      "lineageOrdinal",
      "parentComponentIds",
    ])) return null;
    const parents = canonicalReferenceSet(raw.parentComponentIds, CORE_ECOLOGY_GROUP_MAX_COMPONENTS);
    const children = canonicalReferenceSet(raw.childComponentIds, CORE_ECOLOGY_GROUP_MAX_COMPONENTS);
    if (
      parents === null
      || children === null
      || children.length === 0
      || !nonnegativeSafeInteger(raw.lineageOrdinal)
      || raw.lineageOrdinal >= nextLineageOrdinal
      || ordinals.has(raw.lineageOrdinal)
      || raw.lineageId !== lineageId(groupId, raw.lineageOrdinal)
      || !LINEAGE_KINDS.has(raw.kind as string)
      || !nonnegativeSafeInteger(raw.atTick)
      || raw.atTick > maximumTick
      || !(raw.causeReferenceId === null || validReference(raw.causeReferenceId))
    ) return null;
    if (
      (raw.kind === "origin" && (
        raw.lineageOrdinal !== 0
        || raw.causeReferenceId !== null
        || parents.length !== 0
        || children.length !== 1
      ))
      || (raw.kind === "split" && (
        raw.causeReferenceId === null || parents.length !== 1 || children.length !== 2
      ))
      || (raw.kind === "rejoin" && (
        raw.causeReferenceId === null || parents.length !== 2 || children.length !== 1
      ))
    ) return null;
    ordinals.add(raw.lineageOrdinal);
    lineage.push(deepFreeze({
      lineageId: raw.lineageId,
      lineageOrdinal: raw.lineageOrdinal,
      kind: raw.kind as CoreEcologyGroupLineageKind,
      atTick: raw.atTick,
      causeReferenceId: raw.causeReferenceId as string | null,
      parentComponentIds: parents,
      childComponentIds: children,
    }));
  }
  lineage.sort((left, right) => left.lineageOrdinal - right.lineageOrdinal);
  if (lineage[0]?.lineageOrdinal !== 0 || lineage[0]?.kind !== "origin") return null;
  return Object.freeze(lineage);
}

function canonicalSignals(
  value: unknown,
  groupId: string,
  members: readonly number[],
  maximumTick: number,
  nextSignalOrdinal: number,
): readonly CoreEcologyGroupSignalState[] | null {
  if (!Array.isArray(value) || value.length > CORE_ECOLOGY_GROUP_MAX_SIGNALS) return null;
  const signals: CoreEcologyGroupSignalState[] = [];
  const ordinals = new Set<number>();
  for (const raw of value) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "causeReferenceId",
      "emittedAtTick",
      "expiresAtTick",
      "kind",
      "lastPropagatedAtTick",
      "movementHeading",
      "pressure",
      "reachedMemberOrdinals",
      "signalId",
      "signalOrdinal",
      "sourceMemberOrdinal",
    ])) return null;
    const reached = canonicalOrdinalSet(raw.reachedMemberOrdinals, 1, members.length);
    if (
      reached === null
      || !nonnegativeSafeInteger(raw.signalOrdinal)
      || raw.signalOrdinal >= nextSignalOrdinal
      || ordinals.has(raw.signalOrdinal)
      || raw.signalId !== signalId(groupId, raw.signalOrdinal)
      || !SIGNAL_KINDS.has(raw.kind as string)
      || !validReference(raw.causeReferenceId)
      || !nonnegativeSafeInteger(raw.sourceMemberOrdinal)
      || !members.includes(raw.sourceMemberOrdinal)
      || !reached.includes(raw.sourceMemberOrdinal)
      || reached.some((member) => !members.includes(member))
      || !nonnegativeSafeInteger(raw.emittedAtTick)
      || !nonnegativeSafeInteger(raw.lastPropagatedAtTick)
      || !nonnegativeSafeInteger(raw.expiresAtTick)
      || raw.emittedAtTick > raw.lastPropagatedAtTick
      || raw.lastPropagatedAtTick > maximumTick
      || raw.expiresAtTick <= maximumTick
      || !fixedUnit(raw.pressure)
      || raw.pressure === 0
      || !headingUnit(raw.movementHeading)
    ) return null;
    ordinals.add(raw.signalOrdinal);
    signals.push(deepFreeze({
      signalId: raw.signalId,
      signalOrdinal: raw.signalOrdinal,
      kind: raw.kind as CoreEcologyGroupSignalKind,
      causeReferenceId: raw.causeReferenceId,
      sourceMemberOrdinal: raw.sourceMemberOrdinal,
      emittedAtTick: raw.emittedAtTick,
      lastPropagatedAtTick: raw.lastPropagatedAtTick,
      expiresAtTick: raw.expiresAtTick,
      pressure: raw.pressure,
      movementHeading: raw.movementHeading,
      reachedMemberOrdinals: reached,
    }));
  }
  signals.sort((left, right) => left.signalOrdinal - right.signalOrdinal);
  return Object.freeze(signals);
}

function canonicalAftermath(
  value: unknown,
  groupId: string,
  maximumTick: number,
  nextAftermathOrdinal: number,
): readonly CoreEcologyGroupAftermath[] | null {
  if (!Array.isArray(value) || value.length > CORE_ECOLOGY_GROUP_MAX_AFTERMATH) return null;
  const aftermath: CoreEcologyGroupAftermath[] = [];
  const ordinals = new Set<number>();
  for (const raw of value) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "afterAnchors",
      "afterComponentIds",
      "aftermathId",
      "aftermathOrdinal",
      "atTick",
      "beforeAnchors",
      "beforeComponentIds",
      "cargoInteraction",
      "causeKind",
      "causeReferenceId",
      "disclosure",
      "harm",
      "incidentId",
      "kind",
      "playerAbsent",
      "version",
    ])) return null;
    const beforeIds = canonicalReferenceSet(raw.beforeComponentIds, CORE_ECOLOGY_GROUP_MAX_COMPONENTS);
    const afterIds = canonicalReferenceSet(raw.afterComponentIds, CORE_ECOLOGY_GROUP_MAX_COMPONENTS);
    const beforeAnchors = canonicalPositionSet(raw.beforeAnchors, CORE_ECOLOGY_GROUP_MAX_COMPONENTS);
    const afterAnchors = canonicalPositionSet(raw.afterAnchors, CORE_ECOLOGY_GROUP_MAX_COMPONENTS);
    if (
      raw.version !== CORE_ECOLOGY_GROUP_VERSION
      || beforeIds === null
      || afterIds === null
      || beforeIds.length === 0
      || afterIds.length === 0
      || beforeAnchors === null
      || afterAnchors === null
      || beforeAnchors.length !== beforeIds.length
      || afterAnchors.length !== afterIds.length
      || !nonnegativeSafeInteger(raw.aftermathOrdinal)
      || raw.aftermathOrdinal >= nextAftermathOrdinal
      || ordinals.has(raw.aftermathOrdinal)
      || raw.aftermathId !== aftermathId(groupId, raw.aftermathOrdinal)
      || !AFTERMATH_KINDS.has(raw.kind as string)
      || !nonnegativeSafeInteger(raw.atTick)
      || raw.atTick > maximumTick
      || !validReference(raw.incidentId)
      || !(DISTURBANCE_CAUSES.has(raw.causeKind as string) || raw.causeKind === "cohesion-recovery")
      || !validReference(raw.causeReferenceId)
      || raw.playerAbsent !== true
      || raw.harm !== "none"
      || raw.cargoInteraction !== false
      || raw.disclosure !== "direct-observation-required"
    ) return null;
    ordinals.add(raw.aftermathOrdinal);
    aftermath.push(deepFreeze({
      version: CORE_ECOLOGY_GROUP_VERSION,
      aftermathId: raw.aftermathId,
      aftermathOrdinal: raw.aftermathOrdinal,
      kind: raw.kind as CoreEcologyGroupAftermathKind,
      atTick: raw.atTick,
      incidentId: raw.incidentId,
      causeKind: raw.causeKind as CoreEcologyGroupAftermath["causeKind"],
      causeReferenceId: raw.causeReferenceId,
      beforeComponentIds: beforeIds,
      afterComponentIds: afterIds,
      beforeAnchors,
      afterAnchors,
      playerAbsent: true,
      harm: "none",
      cargoInteraction: false,
      disclosure: "direct-observation-required",
    }));
  }
  aftermath.sort((left, right) => left.aftermathOrdinal - right.aftermathOrdinal);
  return Object.freeze(aftermath);
}

function canonicalDisturbances(
  value: readonly unknown[],
  atTick: number,
): readonly CoreEcologyPlayerAbsentDisturbance[] | null {
  if (value.length > CORE_ECOLOGY_GROUP_MAX_SIGNALS) return null;
  const disturbances: CoreEcologyPlayerAbsentDisturbance[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "atTick",
      "cargoInteraction",
      "causeKind",
      "causeReferenceId",
      "destinationAnchors",
      "disturbanceId",
      "movementHeading",
      "nonlethal",
      "playerAbsent",
      "pressure",
      "rendezvousAnchor",
    ])) return null;
    const destinations = canonicalPositionSet(raw.destinationAnchors, CORE_ECOLOGY_GROUP_MAX_COMPONENTS);
    if (
      !validReference(raw.disturbanceId)
      || ids.has(raw.disturbanceId)
      || raw.atTick !== atTick
      || !DISTURBANCE_CAUSES.has(raw.causeKind as string)
      || !validReference(raw.causeReferenceId)
      || !fixedUnit(raw.pressure)
      || raw.pressure === 0
      || !headingUnit(raw.movementHeading)
      || destinations === null
      || destinations.length === 0
      || !isWorldPosition(raw.rendezvousAnchor)
      || raw.playerAbsent !== true
      || raw.nonlethal !== true
      || raw.cargoInteraction !== false
    ) return null;
    ids.add(raw.disturbanceId);
    disturbances.push(deepFreeze({
      disturbanceId: raw.disturbanceId,
      atTick,
      causeKind: raw.causeKind as CoreEcologyGroupDisturbanceCause,
      causeReferenceId: raw.causeReferenceId,
      pressure: raw.pressure,
      movementHeading: raw.movementHeading,
      destinationAnchors: destinations,
      rendezvousAnchor: copyPosition(raw.rendezvousAnchor),
      playerAbsent: true,
      nonlethal: true,
      cargoInteraction: false,
    }));
  }
  disturbances.sort((left, right) => compareText(left.disturbanceId, right.disturbanceId));
  return Object.freeze(disturbances);
}

function propagateSignals(
  group: CoreEcologyGroupState,
  atTick: number,
  events: CoreEcologyGroupTransitionEvent[],
): readonly CoreEcologyGroupSignalState[] {
  const signals: CoreEcologyGroupSignalState[] = [];
  for (const signal of group.signals) {
    if (signal.expiresAtTick <= atTick) continue;
    const reached = new Set(signal.reachedMemberOrdinals);
    const newlyReached: number[] = [];
    for (const component of group.components) {
      const reachedHere = component.memberOrdinals.filter((member) => reached.has(member));
      if (reachedHere.length === 0) continue;
      const next = component.memberOrdinals
        .filter((member) => !reached.has(member))
        .map((member) => ({
          member,
          distance: Math.min(...reachedHere.map((prior) => Math.abs(prior - member))),
        }))
        .sort((left, right) => left.distance - right.distance || left.member - right.member)[0];
      if (next !== undefined) {
        reached.add(next.member);
        newlyReached.push(next.member);
      }
    }
    const reachedMemberOrdinals = Object.freeze([...reached].sort((left, right) => left - right));
    signals.push(deepFreeze({
      ...signal,
      lastPropagatedAtTick: atTick,
      reachedMemberOrdinals,
    }));
    if (newlyReached.length > 0) {
      events.push(transitionEvent(
        group,
        atTick,
        "signal-propagated",
        signal.signalId,
        newlyReached.sort((left, right) => left - right),
        group.components
          .filter(({ memberOrdinals }) => memberOrdinals.some((member) => newlyReached.includes(member)))
          .map(({ componentId: id }) => id),
        signal.signalId,
      ));
    }
  }
  signals.sort((left, right) => left.signalOrdinal - right.signalOrdinal);
  return Object.freeze(signals);
}

function appendAftermath(
  groupId: string,
  prior: readonly CoreEcologyGroupAftermath[],
  ordinal: number,
  input: Omit<
    CoreEcologyGroupAftermath,
    | "aftermathId"
    | "aftermathOrdinal"
    | "cargoInteraction"
    | "disclosure"
    | "harm"
    | "playerAbsent"
    | "version"
  >,
): Readonly<{ aftermath: readonly CoreEcologyGroupAftermath[]; nextOrdinal: number }> {
  if (ordinal >= Number.MAX_SAFE_INTEGER) throw new RangeError("Group aftermath ordinal exhausted");
  const entry: CoreEcologyGroupAftermath = deepFreeze({
    version: CORE_ECOLOGY_GROUP_VERSION,
    aftermathId: aftermathId(groupId, ordinal),
    aftermathOrdinal: ordinal,
    ...input,
    beforeComponentIds: [...input.beforeComponentIds].sort(compareText),
    afterComponentIds: [...input.afterComponentIds].sort(compareText),
    beforeAnchors: canonicalPositionSet(input.beforeAnchors, CORE_ECOLOGY_GROUP_MAX_COMPONENTS)!,
    afterAnchors: canonicalPositionSet(input.afterAnchors, CORE_ECOLOGY_GROUP_MAX_COMPONENTS)!,
    playerAbsent: true,
    harm: "none",
    cargoInteraction: false,
    disclosure: "direct-observation-required",
  });
  const aftermath = [...prior, entry]
    .sort((left, right) => left.aftermathOrdinal - right.aftermathOrdinal)
    .slice(-CORE_ECOLOGY_GROUP_MAX_AFTERMATH);
  return deepFreeze({ aftermath, nextOrdinal: ordinal + 1 });
}

function transitionEvent(
  group: CoreEcologyGroupState,
  atTick: number,
  kind: CoreEcologyGroupTransitionEvent["kind"],
  causeReferenceId: string,
  memberOrdinals: readonly number[],
  componentIds: readonly string[],
  eventSourceId: string,
): CoreEcologyGroupTransitionEvent {
  return deepFreeze({
    eventId: `${eventSourceId}:group-event:${kind}:${atTick.toString(36)}`,
    groupId: group.identity.stableId,
    atTick,
    kind,
    causeReferenceId,
    memberOrdinals: Object.freeze([...memberOrdinals].sort((left, right) => left - right)),
    componentIds: Object.freeze([...componentIds].sort(compareText)),
    nonlethal: true,
  });
}

function partitionMembers(members: readonly number[]): readonly (readonly number[])[] {
  const left: number[] = [];
  const right: number[] = [];
  members.forEach((member, index) => (index % 2 === 0 ? left : right).push(member));
  if (left.length === 0 || right.length === 0) {
    throw new Error("A social group cannot split into an empty component");
  }
  return Object.freeze([Object.freeze(left), Object.freeze(right)]);
}

function retainLineage(
  events: readonly CoreEcologyGroupLineageEvent[],
): readonly CoreEcologyGroupLineageEvent[] {
  const ordered = [...events].sort((left, right) => left.lineageOrdinal - right.lineageOrdinal);
  if (ordered.length <= CORE_ECOLOGY_GROUP_MAX_LINEAGE_EVENTS) return Object.freeze(ordered);
  const origin = ordered.find(({ lineageOrdinal }) => lineageOrdinal === 0);
  if (origin === undefined) throw new Error("Group lineage lost its origin");
  return Object.freeze([
    origin,
    ...ordered.slice(-(CORE_ECOLOGY_GROUP_MAX_LINEAGE_EVENTS - 1)),
  ]);
}

function canonicalGenerationInput(value: unknown): Readonly<{
  seed: RootSeed;
  species: CoreWildlifeSpecies;
  originRegion: RegionCoord;
  populationKey: string;
  groupOrdinal: number;
}> | null {
  if (!plainRecord(value)) return null;
  if (
    !Array.isArray(value.seed)
    || value.seed.length !== 4
    || value.seed.some((word) => (
      !nonnegativeSafeInteger(word) || word > 0xffff_ffff
    ))
    || (value.species !== "deer" && value.species !== "gull" && value.species !== "black-bear")
    || !isRegionCoord(value.originRegion)
    || !validPopulationKey(value.populationKey)
    || !nonnegativeSafeInteger(value.groupOrdinal)
  ) return null;
  return Object.freeze({
    seed: Object.freeze([...value.seed]) as unknown as RootSeed,
    species: value.species,
    originRegion: createRegionCoord(value.originRegion.x, value.originRegion.y),
    populationKey: value.populationKey,
    groupOrdinal: value.groupOrdinal,
  });
}

function stableGroupIdFromFields(input: Readonly<{
  seedFingerprint: string;
  species: CoreEcologyGroupSpecies;
  originRegion: RegionCoord;
  populationKey: string;
  groupOrdinal: number;
}>): string {
  const prefix = input.species === "deer" ? "HERD" : "FLOCK";
  return `${prefix}-v1-${input.seedFingerprint}-${encodeSigned(input.originRegion.x)}.${encodeSigned(input.originRegion.y)}-${input.populationKey.length.toString(36)}.${input.populationKey}-${input.groupOrdinal.toString(36)}`;
}

function rootSeedFingerprint(seed: RootSeed): string {
  return seed.map((word) => word.toString(36).padStart(7, "0")).join(".");
}

function organizationFor(species: CoreEcologyGroupSpecies): CoreEcologyGroupOrganization {
  return species === "deer" ? "herd" : "flock";
}

function memberLimit(species: CoreEcologyGroupSpecies): number {
  return Math.min(CORE_ECOLOGY_GROUP_MAX_MEMBERS, getCoreWildlifeProfile(species).maximumPatchPopulation);
}

function componentId(groupId: string, ordinal: number): string {
  return `${groupId}:component:${ordinal.toString(36)}`;
}

function signalId(groupId: string, ordinal: number): string {
  return `${groupId}:signal:${ordinal.toString(36)}`;
}

function lineageId(groupId: string, ordinal: number): string {
  return `${groupId}:lineage:${ordinal.toString(36)}`;
}

function aftermathId(groupId: string, ordinal: number): string {
  return `${groupId}:aftermath:${ordinal.toString(36)}`;
}

function encodeSigned(value: number): string {
  return value < 0 ? `n${(-value).toString(36)}` : `p${value.toString(36)}`;
}

function canonicalOrdinalSet(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): readonly number[] | null {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > maximumLength) {
    return null;
  }
  const ordinals = [...value];
  if (ordinals.some((ordinal) => !nonnegativeSafeInteger(ordinal))) return null;
  ordinals.sort((left, right) => left - right);
  if (ordinals.some((ordinal, index) => index > 0 && ordinal === ordinals[index - 1])) return null;
  return Object.freeze(ordinals);
}

function canonicalReferenceSet(value: unknown, maximumLength: number): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximumLength) return null;
  const references = [...value];
  if (references.some((reference) => !validReference(reference))) return null;
  references.sort(compareText);
  if (references.some((reference, index) => index > 0 && reference === references[index - 1])) {
    return null;
  }
  return Object.freeze(references);
}

function canonicalPositionSet(
  value: unknown,
  maximumLength: number,
): readonly WorldPosition[] | null {
  if (!Array.isArray(value) || value.length > maximumLength) return null;
  const positions: WorldPosition[] = [];
  for (const raw of value) {
    if (!isWorldPosition(raw)) return null;
    positions.push(copyPosition(raw));
  }
  positions.sort(comparePosition);
  if (positions.some((position, index) => (
    index > 0 && comparePosition(position, positions[index - 1]!) === 0
  ))) return null;
  return Object.freeze(positions);
}

function copyPosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(
    createRegionCoord(position.region.x, position.region.y),
    position.localX,
    position.localY,
  );
}

function comparePosition(left: WorldPosition, right: WorldPosition): number {
  return left.region.x - right.region.x
    || left.region.y - right.region.y
    || left.localX - right.localX
    || left.localY - right.localY;
}

function compareComponent(
  left: CoreEcologyGroupComponentState,
  right: CoreEcologyGroupComponentState,
): number {
  return left.componentOrdinal - right.componentOrdinal;
}

function compareTransitionEvent(
  left: CoreEcologyGroupTransitionEvent,
  right: CoreEcologyGroupTransitionEvent,
): number {
  return compareText(left.eventId, right.eventId);
}

function validPopulationKey(value: unknown): value is string {
  return typeof value === "string"
    && POPULATION_KEY_PATTERN.test(value)
    && value === value.normalize("NFC");
}

function validReference(value: unknown): value is string {
  return typeof value === "string"
    && REFERENCE_PATTERN.test(value)
    && value === value.normalize("NFC");
}

function fixedUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function headingUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value < FIXED_POINT;
}

function schedulableTick(value: unknown): value is number {
  return nonnegativeSafeInteger(value)
    && value <= Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS;
}

function safeFutureTick(tick: number, duration: number): number {
  const result = tick + duration;
  if (!Number.isSafeInteger(result)) throw new RangeError("Core ecology group tick overflow");
  return result;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function allowedCreateKeys(value: object): boolean {
  const keys = [
    "anchor",
    "groupOrdinal",
    "memberOrdinals",
    "originRegion",
    "populationKey",
    "seed",
    "species",
  ];
  if (Object.hasOwn(value, "cohesion")) keys.push("cohesion");
  if (Object.hasOwn(value, "heading")) keys.push("heading");
  if (Object.hasOwn(value, "tick")) keys.push("tick");
  return exactKeys(value, keys);
}

function allowedSignalInputKeys(value: object): boolean {
  const keys = [
    "atTick",
    "causeReferenceId",
    "kind",
    "movementHeading",
    "pressure",
    "sourceMemberOrdinal",
  ];
  if (Object.hasOwn(value, "lifetimeCadences")) keys.push("lifetimeCadences");
  return exactKeys(value, keys);
}

function allowedAnchorReconciliationKeys(value: object): boolean {
  const keys = ["atTick", "componentAnchors"];
  if (Object.hasOwn(value, "rendezvousAnchor")) keys.push("rendezvousAnchor");
  return exactKeys(value, keys);
}

function plainRecord(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const canonical = [...expected].sort(compareText);
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
