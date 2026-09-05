import {
  LIVING_SPECIES_CATALOG,
  LIVING_SPECIES_CATALOG_VERSION,
  livingSpeciesModule,
} from "./livingSpeciesCatalog";
import type { LivingActorSpecies } from "./livingSpeciesRegistry";

export const LIVING_SPECIES_RELEASE_GATE_VERSION = 1 as const;
export const LIVING_SPECIES_READINESS_REPORT_VERSION = 1 as const;
export const MAX_RELEASE_EVIDENCE_OWNERS = 8 as const;

/** Complete species release gate. Order is stable and auditable. */
export const LIVING_SPECIES_RELEASE_CRITERIA = [
  "species-profile",
  "ecological-niche",
  "appearance",
  "sound",
  "habitat-placement",
  "food-web",
  "perception-senses",
  "locomotion",
  "human-interaction",
  "dog-interaction",
  "same-species-interaction",
  "other-species-interaction",
  "neutral-behavior",
  "disengagement",
  "environmental-evidence",
  "about-disclosure",
  "knowledge-honesty",
  "population-materialization",
  "full-coarse-transition",
  "save-load",
  "seamless-region-crossing",
  "performance-budget",
  "accessibility",
  "mobile-parity",
  "player-independent-scenario",
  "fuzz-testing",
  "clone-diversity",
  "tutorial-truth",
  "patch-note-truth",
  "exact-tested-deployment",
] as const;

export type LivingSpeciesReleaseCriterion = (typeof LIVING_SPECIES_RELEASE_CRITERIA)[number];
export type LivingSpeciesReleaseStatus =
  | "active"
  | "foundation"
  | "unimplemented"
  | "not-applicable";
export type LivingSpeciesNotApplicableReason =
  | "biologically-silent"
  | "no-human-ecological-overlap"
  | "no-dog-ecological-overlap";

export interface LivingSpeciesNotApplicableEvidence {
  readonly reason: LivingSpeciesNotApplicableReason;
  /** Authoritative ecology record proving that this is absence, not missing work. */
  readonly ecologyOwnerId: string;
}

export interface LivingSpeciesReleaseCriterionState {
  readonly criterion: LivingSpeciesReleaseCriterion;
  readonly status: LivingSpeciesReleaseStatus;
  /** Required and canonical for active/foundation; empty otherwise. */
  readonly evidenceOwnerIds: readonly string[];
  readonly notApplicable: LivingSpeciesNotApplicableEvidence | null;
}

export interface LivingSpeciesReleaseGate {
  readonly version: typeof LIVING_SPECIES_RELEASE_GATE_VERSION;
  readonly catalogVersion: typeof LIVING_SPECIES_CATALOG_VERSION;
  readonly speciesId: string;
  readonly moduleId: string;
  readonly criteria: readonly LivingSpeciesReleaseCriterionState[];
}

export interface LivingSpeciesReleaseGateSet {
  readonly version: typeof LIVING_SPECIES_RELEASE_GATE_VERSION;
  readonly gates: readonly LivingSpeciesReleaseGate[];
}

export type LivingSpeciesReadinessState = "invalid-claim" | "blocked" | "public-ready";

export interface LivingSpeciesReadinessCounts {
  readonly active: number;
  readonly foundation: number;
  readonly unimplemented: number;
  readonly notApplicable: number;
  readonly total: number;
}

export interface LivingSpeciesReadinessReport {
  readonly version: typeof LIVING_SPECIES_READINESS_REPORT_VERSION;
  readonly speciesId: string;
  readonly moduleId: string;
  /** Exact match against build-owned evidence, not a caller assertion. */
  readonly evidenceAuthenticated: boolean;
  readonly state: LivingSpeciesReadinessState;
  readonly publicReady: boolean;
  readonly counts: LivingSpeciesReadinessCounts;
  readonly blockingCriteria: readonly LivingSpeciesReleaseCriterion[];
}

const STATUS = new Set<string>(["active", "foundation", "unimplemented", "not-applicable"]);
const ID_PATTERN = /^[a-z][a-z0-9]*(?:(?:[._/-]|::?)[a-z0-9]+)*$/u;
const NOT_APPLICABLE_REASONS: Readonly<
  Partial<Record<LivingSpeciesReleaseCriterion, readonly LivingSpeciesNotApplicableReason[]>>
> = Object.freeze({
  sound: Object.freeze(["biologically-silent"] as const),
  "human-interaction": Object.freeze(["no-human-ecological-overlap"] as const),
  "dog-interaction": Object.freeze(["no-dog-ecological-overlap"] as const),
});

type ClaimTuple = readonly [
  LivingSpeciesReleaseCriterion,
  LivingSpeciesReleaseStatus,
  readonly string[],
];

const U = "unimplemented" as const;
const F = "foundation" as const;
const A = "active" as const;

function waveACoreWildlifeEvidence(
  species: "deer" | "gull" | "black-bear",
): readonly ClaimTuple[] {
  const socialGroup = species !== "black-bear";
  const transitionEvidence = socialGroup
    ? [
        "game:core-ecology-groups:v1",
        "game:core-ecology:v2",
        "game:runtime-core-ecology:v1",
      ]
    : ["game:core-ecology:v2", "game:runtime-core-ecology:v1"];
  return [
    ["species-profile", A, ["game:living-species-catalog:v1", "sim:core-wildlife-identity:v1"]],
    ["ecological-niche", F, ["game:core-ecology-habitat:v1", "game:core-wildlife-actor:v1", "sim:core-wildlife-identity:v1"]],
    ["appearance", A, ["game:wildlife-presentation:v1", "sim:core-wildlife-identity:v1"]],
    ["sound", U, []],
    ["habitat-placement", A, ["game:core-ecology-habitat:v1", "game:runtime-core-ecology:v1"]],
    ["food-web", F, ["game:core-wildlife-actor:v1", "sim:core-wildlife-identity:v1"]],
    ["perception-senses", F, ["game:core-ecology-perception:v1", "game:living-actor-senses:v1", "sim:actor-perception:v2"]],
    ["locomotion", F, ["game:core-wildlife-actor:v1", "game:runtime-core-ecology:v1"]],
    ["human-interaction", A, ["game:core-ecology-perception:v1", "game:core-wildlife-actor:v1"]],
    ["dog-interaction", A, ["game:core-ecology-perception:v1", "game:core-wildlife-actor:v1"]],
    ["same-species-interaction", socialGroup ? A : U, socialGroup ? ["game:core-ecology-groups:v1"] : []],
    ["other-species-interaction", A, ["game:core-ecology-perception:v1", "game:core-wildlife-actor:v1"]],
    ["neutral-behavior", A, ["game:core-wildlife-actor:v1"]],
    ["disengagement", A, ["game:core-wildlife-actor:v1"]],
    ["environmental-evidence", U, []],
    ["about-disclosure", A, ["game:wildlife-about:v1"]],
    ["knowledge-honesty", A, ["game:core-ecology-perception:v1", "game:wildlife-about:v1", "sim:actor-perception:v2"]],
    ["population-materialization", A, ["game:core-ecology-habitat:v1", "game:core-ecology:v2", "game:runtime-core-ecology:v1"]],
    ["full-coarse-transition", A, transitionEvidence],
    ["save-load", A, ["game:core-ecology:v2", "game:runtime-save:v9"]],
    ["seamless-region-crossing", F, ["game:living-actor-address:v1", "game:world-position:v1"]],
    ["performance-budget", F, ["game:core-ecology-habitat:v1", "game:core-ecology:v2", "game:runtime-core-ecology:v1"]],
    ["accessibility", A, ["game:wildlife-about:v1", "game:wildlife-presentation:v1"]],
    ["mobile-parity", A, ["game:wildlife-about:v1", "game:wildlife-presentation:v1"]],
    ["player-independent-scenario", socialGroup ? A : U, socialGroup
      ? ["game:core-ecology-groups:v1", "game:core-ecology:v2"]
      : []],
    ["fuzz-testing", U, []],
    ["clone-diversity", A, ["sim:core-wildlife-identity:v1"]],
    ["tutorial-truth", A, ["ui:tutorial-guide:v24"]],
    ["patch-note-truth", A, ["content:patch-notes-alpha14:v1"]],
    // Exact deployment evidence is external and can exist only after this
    // immutable Alpha-14 candidate is live; Alpha-13 cannot attest this slice.
    ["exact-tested-deployment", U, []],
  ];
}

/**
 * Current build-owned evidence. This intentionally contains no future roster
 * and never upgrades a criterion merely because the design intends it.
 */
const CURRENT_EVIDENCE: Readonly<Record<LivingActorSpecies, readonly ClaimTuple[]>> = {
  human: [
    ["species-profile", A, ["game:living-species-catalog:v1", "sim:npc-identity:v1"]],
    ["ecological-niche", F, ["sim:npc-identity:v1", "sim:resident-engine:v1"]],
    ["appearance", A, ["game:resident-projection:v1", "sim:npc-identity:v1"]],
    ["sound", U, []],
    ["habitat-placement", F, ["game:resident-spatial:v1", "sim:world-residents:v1"]],
    ["food-web", F, ["sim:resident-engine:v1"]],
    ["perception-senses", F, ["game:living-actor-senses:v1", "sim:actor-perception:v2"]],
    ["locomotion", A, ["game:resident-spatial:v1", "sim:resident-engine:v1"]],
    ["human-interaction", A, ["game:resident-about:v1", "sim:resident-engine:v1"]],
    ["dog-interaction", U, []],
    ["same-species-interaction", A, ["sim:resident-relationships:v1"]],
    ["other-species-interaction", U, []],
    ["neutral-behavior", A, ["sim:resident-engine:v1"]],
    ["disengagement", F, ["sim:resident-engine:v1"]],
    ["environmental-evidence", U, []],
    ["about-disclosure", A, ["game:resident-about:v1"]],
    ["knowledge-honesty", A, ["sim:actor-perception:v2", "sim:resident-memory-knowledge:v1"]],
    ["population-materialization", F, ["sim:world-residents:v1"]],
    ["full-coarse-transition", U, []],
    ["save-load", A, ["sim:persistence:v4", "sim:world-state:v4"]],
    ["seamless-region-crossing", U, []],
    ["performance-budget", U, []],
    ["accessibility", U, []],
    ["mobile-parity", U, []],
    ["player-independent-scenario", F, ["sim:resident-engine:v1"]],
    ["fuzz-testing", U, []],
    ["clone-diversity", F, ["sim:npc-identity:v1"]],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ],
  "domestic-dog": [
    ["species-profile", F, ["game:living-species-catalog:v1", "sim:dog-identity:v1"]],
    ["ecological-niche", F, ["game:dog-behavior:v1", "sim:dog-identity:v1"]],
    ["appearance", F, ["sim:dog-identity:v1"]],
    ["sound", U, []],
    ["habitat-placement", F, ["sim:dog-identity:v1"]],
    ["food-web", F, ["game:dog-behavior:v1"]],
    ["perception-senses", F, ["game:living-actor-senses:v1", "sim:actor-perception:v2"]],
    ["locomotion", F, ["game:dog-behavior:v1"]],
    ["human-interaction", F, ["game:dog-actor:v1", "game:dog-behavior:v1"]],
    ["dog-interaction", U, []],
    ["same-species-interaction", U, []],
    ["other-species-interaction", U, []],
    ["neutral-behavior", F, ["game:dog-behavior:v1"]],
    ["disengagement", F, ["game:dog-behavior:v1"]],
    ["environmental-evidence", U, []],
    ["about-disclosure", F, ["game:dog-about:v1"]],
    ["knowledge-honesty", F, ["game:dog-actor:v1", "sim:actor-perception:v2"]],
    ["population-materialization", U, []],
    ["full-coarse-transition", U, []],
    ["save-load", F, ["game:dog-actor:v1"]],
    ["seamless-region-crossing", U, []],
    ["performance-budget", U, []],
    ["accessibility", U, []],
    ["mobile-parity", U, []],
    ["player-independent-scenario", F, ["game:dog-behavior:v1"]],
    ["fuzz-testing", U, []],
    ["clone-diversity", F, ["sim:dog-identity:v1"]],
    ["tutorial-truth", U, []],
    ["patch-note-truth", U, []],
    ["exact-tested-deployment", U, []],
  ],
  deer: waveACoreWildlifeEvidence("deer"),
  gull: waveACoreWildlifeEvidence("gull"),
  "black-bear": waveACoreWildlifeEvidence("black-bear"),
};

if (LIVING_SPECIES_RELEASE_CRITERIA.length !== 30) {
  throw new Error("Living species release gate must retain all 30 criteria");
}

function gateFromEvidence(
  speciesId: LivingActorSpecies,
  claims: readonly ClaimTuple[],
): LivingSpeciesReleaseGate {
  const module = livingSpeciesModule(speciesId);
  if (module === null) throw new Error(`Release evidence references missing species ${speciesId}`);
  const input = {
    version: LIVING_SPECIES_RELEASE_GATE_VERSION,
    catalogVersion: LIVING_SPECIES_CATALOG_VERSION,
    speciesId,
    moduleId: module.moduleId,
    criteria: claims.map(([criterion, status, evidenceOwnerIds]) => ({
      criterion,
      status,
      evidenceOwnerIds,
      notApplicable: null,
    })),
  };
  const canonical = canonicalizeLivingSpeciesReleaseGate(input);
  if (canonical === null) throw new Error(`Built-in release evidence for ${speciesId} is invalid`);
  return canonical;
}

const trustedGates = (Object.keys(CURRENT_EVIDENCE) as (keyof typeof CURRENT_EVIDENCE)[])
  .map((speciesId) => gateFromEvidence(speciesId, CURRENT_EVIDENCE[speciesId]));
const currentGateSet = createLivingSpeciesReleaseGateSet(trustedGates);
if (currentGateSet === null) throw new Error("Built-in living species release gate set is invalid");
if (
  currentGateSet.gates.length !== LIVING_SPECIES_CATALOG.modules.length
  || currentGateSet.gates.some((gate, index) => gate.speciesId !== LIVING_SPECIES_CATALOG.modules[index]?.speciesId)
) throw new Error("Release evidence does not exactly cover the registered living species catalog");

export const LIVING_SPECIES_RELEASE_GATES: LivingSpeciesReleaseGateSet = currentGateSet;

/** Exact persisted-shape validation; it does not authenticate an evidence claim. */
export function canonicalizeLivingSpeciesReleaseGate(value: unknown): LivingSpeciesReleaseGate | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "catalogVersion",
    "criteria",
    "moduleId",
    "speciesId",
    "version",
  ])) return null;
  if (
    value.version !== LIVING_SPECIES_RELEASE_GATE_VERSION
    || value.catalogVersion !== LIVING_SPECIES_CATALOG_VERSION
    || !canonicalId(value.speciesId, 64)
    || !canonicalId(value.moduleId, 96)
    || !Array.isArray(value.criteria)
    || value.criteria.length !== LIVING_SPECIES_RELEASE_CRITERIA.length
  ) return null;
  const module = livingSpeciesModule(value.speciesId);
  if (module === null || module.moduleId !== value.moduleId) return null;
  const criteria: LivingSpeciesReleaseCriterionState[] = [];
  for (let index = 0; index < LIVING_SPECIES_RELEASE_CRITERIA.length; index += 1) {
    const criterion = canonicalCriterionState(value.criteria[index], LIVING_SPECIES_RELEASE_CRITERIA[index]!);
    if (criterion === null) return null;
    criteria.push(criterion);
  }
  return deepFreeze({
    version: LIVING_SPECIES_RELEASE_GATE_VERSION,
    catalogVersion: LIVING_SPECIES_CATALOG_VERSION,
    speciesId: value.speciesId,
    moduleId: value.moduleId,
    criteria,
  });
}

export function createLivingSpeciesReleaseGateSet(
  values: readonly unknown[],
): LivingSpeciesReleaseGateSet | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > LIVING_SPECIES_CATALOG.modules.length) return null;
  const gates: LivingSpeciesReleaseGate[] = [];
  for (const value of values) {
    const gate = canonicalizeLivingSpeciesReleaseGate(value);
    if (gate === null) return null;
    gates.push(gate);
  }
  gates.sort((left, right) => compareText(left.speciesId, right.speciesId));
  for (let index = 1; index < gates.length; index += 1) {
    if (
      gates[index - 1]?.speciesId === gates[index]?.speciesId
      || gates[index - 1]?.moduleId === gates[index]?.moduleId
    ) return null;
  }
  return deepFreeze({ version: LIVING_SPECIES_RELEASE_GATE_VERSION, gates });
}

export function canonicalizeLivingSpeciesReleaseGateSet(value: unknown): LivingSpeciesReleaseGateSet | null {
  if (!plainRecord(value) || !exactKeys(value, ["gates", "version"])) return null;
  if (value.version !== LIVING_SPECIES_RELEASE_GATE_VERSION || !Array.isArray(value.gates)) return null;
  const canonical = createLivingSpeciesReleaseGateSet(value.gates);
  return canonical !== null && sameData(canonical, value) ? canonical : null;
}

/**
 * Authenticate evidence against this exact build, then derive readiness.
 * Callers cannot assert or serialize `publicReady` themselves.
 */
export function auditLivingSpeciesReleaseGate(value: unknown): LivingSpeciesReadinessReport | null {
  const gate = canonicalizeLivingSpeciesReleaseGate(value);
  if (gate === null) return null;
  const trusted = LIVING_SPECIES_RELEASE_GATES.gates.find(({ speciesId }) => speciesId === gate.speciesId);
  const evidenceAuthenticated = trusted !== undefined && sameData(gate, trusted);
  const counts: LivingSpeciesReadinessCounts = deepFreeze({
    active: gate.criteria.filter(({ status }) => status === "active").length,
    foundation: gate.criteria.filter(({ status }) => status === "foundation").length,
    unimplemented: gate.criteria.filter(({ status }) => status === "unimplemented").length,
    notApplicable: gate.criteria.filter(({ status }) => status === "not-applicable").length,
    total: gate.criteria.length,
  });
  const blockingCriteria = evidenceAuthenticated
    ? gate.criteria
      .filter(({ status }) => status !== "active" && status !== "not-applicable")
      .map(({ criterion }) => criterion)
    : [...LIVING_SPECIES_RELEASE_CRITERIA];
  const publicReady = evidenceAuthenticated && blockingCriteria.length === 0;
  return deepFreeze({
    version: LIVING_SPECIES_READINESS_REPORT_VERSION,
    speciesId: gate.speciesId,
    moduleId: gate.moduleId,
    evidenceAuthenticated,
    state: evidenceAuthenticated ? (publicReady ? "public-ready" : "blocked") : "invalid-claim",
    publicReady,
    counts,
    blockingCriteria,
  });
}

export function livingSpeciesReadinessReport(speciesId: string): LivingSpeciesReadinessReport | null {
  const gate = LIVING_SPECIES_RELEASE_GATES.gates.find((candidate) => candidate.speciesId === speciesId);
  return gate === undefined ? null : auditLivingSpeciesReleaseGate(gate);
}

function canonicalCriterionState(
  value: unknown,
  expectedCriterion: LivingSpeciesReleaseCriterion,
): LivingSpeciesReleaseCriterionState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "criterion",
    "evidenceOwnerIds",
    "notApplicable",
    "status",
  ])) return null;
  if (
    value.criterion !== expectedCriterion
    || !STATUS.has(value.status as string)
    || !canonicalStringSet(value.evidenceOwnerIds, MAX_RELEASE_EVIDENCE_OWNERS, evidenceOwnerId)
  ) return null;
  if (value.status === "active" || value.status === "foundation") {
    if (value.evidenceOwnerIds.length === 0 || value.notApplicable !== null) return null;
  } else if (value.status === "unimplemented") {
    if (value.evidenceOwnerIds.length !== 0 || value.notApplicable !== null) return null;
  } else {
    if (value.evidenceOwnerIds.length !== 0 || !validNotApplicable(value.notApplicable, expectedCriterion)) return null;
  }
  return deepFreeze({
    criterion: expectedCriterion,
    status: value.status as LivingSpeciesReleaseStatus,
    evidenceOwnerIds: [...value.evidenceOwnerIds],
    notApplicable: value.notApplicable === null
      ? null
      : {
          reason: value.notApplicable.reason,
          ecologyOwnerId: value.notApplicable.ecologyOwnerId,
        },
  });
}

function validNotApplicable(value: unknown, criterion: LivingSpeciesReleaseCriterion): value is LivingSpeciesNotApplicableEvidence {
  if (!plainRecord(value) || !exactKeys(value, ["ecologyOwnerId", "reason"])) return false;
  const allowed = NOT_APPLICABLE_REASONS[criterion];
  return allowed !== undefined
    && allowed.includes(value.reason as LivingSpeciesNotApplicableReason)
    && evidenceOwnerId(value.ecologyOwnerId);
}

function canonicalStringSet(
  value: unknown,
  maximum: number,
  predicate: (entry: unknown) => entry is string,
): value is readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  let prior = "";
  for (const entry of value) {
    if (!predicate(entry) || (prior !== "" && prior >= entry)) return false;
    prior = entry;
  }
  return true;
}

function evidenceOwnerId(value: unknown): value is string {
  return canonicalId(value, 96) && value.includes(":v");
}

function canonicalId(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && value === value.trim()
    && ID_PATTERN.test(value);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) {
    return Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameData(entry, right[index]));
  }
  if (plainRecord(left)) {
    if (!plainRecord(right)) return false;
    const leftKeys = Object.keys(left).sort(compareText);
    const rightKeys = Object.keys(right).sort(compareText);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && sameData(left[key], right[key]));
  }
  return false;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
