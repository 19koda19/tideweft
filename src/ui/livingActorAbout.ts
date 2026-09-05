import {
  projectDogAbout,
  projectDogQuickInspect,
  type DogAboutObservation,
} from "../game/dogAbout";
import type {
  ResidentAboutFactUIView,
  ResidentAboutUIView,
  LivingActorInteractionId,
  LivingActorInteractionUIView,
  LivingActorTargetUIView,
  SelectedLivingActorUIView,
  TideweftUIView,
} from "./types";

export type ActorAboutCloseCommand =
  | {
      readonly type: "resident";
      readonly action: "close";
      readonly residentId?: string;
    }
  | {
      readonly type: "living-actor";
      readonly action: "close";
      readonly target: LivingActorTargetUIView;
    };

/** Flattened rendering contract shared by compatibility humans and new actors. */
export interface ResolvedActorAboutSurface {
  readonly selectionKey: string;
  readonly species: LivingActorTargetUIView["species"];
  readonly heading: string;
  readonly identityLine: string;
  readonly quickSummary?: string;
  readonly knowledgeLabel: ResidentAboutUIView["knowledgeLabel"] | "Known individual";
  readonly observed: readonly ResidentAboutFactUIView[];
  readonly known: readonly ResidentAboutFactUIView[];
  readonly closeCommand: ActorAboutCloseCommand;
  readonly interactions: readonly LivingActorInteractionUIView[];
  /** Current compatibility-human action. New animal projections deliberately omit it. */
  readonly actionLabel?: "GREET";
  readonly actionDisabled?: boolean;
  readonly actionHint?: string;
}

/**
 * UI-only bridge over the authoritative dog inspection projector.
 *
 * The caller must pass the current player PerceptionResult together with the
 * regional window that produced it. `projectDogAbout` validates that signed
 * snapshot, derives the dog's tile/distance itself, and fails closed when the
 * actor is outside direct detail perception. This adapter never accepts a
 * caller-authored visibility flag and never adds interaction consequences.
 */
export function projectDogLivingActorInspection(
  actor: unknown,
  currentObservation: DogAboutObservation,
): SelectedLivingActorUIView | null {
  const quick = projectDogQuickInspect(actor, currentObservation);
  const about = projectDogAbout(actor, currentObservation);
  if (quick === null || about === null || quick.actorId !== about.actorId) return null;

  const target = freezeTarget({
    species: "domestic-dog",
    actorId: about.actorId,
  });
  return deepFreeze({
    target,
    quick: {
      target,
      heading: quick.heading,
      summary: quick.summary,
      distanceUnits: quick.distanceUnits,
    },
    about: {
      target,
      heading: about.heading,
      identityLine: about.identity,
      knowledgeLabel: about.knowledge,
      observed: about.observed.map(({ label, value }) => ({ label, value })),
      known: about.known.map(({ label, value }) => ({ label, value })),
    },
  });
}

/**
 * Attach only a small validated set of contextual proposals to one coherent
 * selection. This is presentation data; accepting an action still requires a
 * fresh authoritative runtime check.
 */
export function withLivingActorInteractions(
  selectionValue: unknown,
  interactionsValue: unknown,
): SelectedLivingActorUIView | null {
  if (!plainRecord(selectionValue)) return null;
  const selection = selectionValue as unknown as SelectedLivingActorUIView;
  if (!hasCoherentLivingActorInspection(selection)) return null;
  const interactions = canonicalInteractions(interactionsValue);
  if (interactions === null) return null;
  return deepFreeze({
    target: selection.target,
    quick: selection.quick,
    about: selection.about,
    ...(interactions.length === 0 ? {} : { interactions }),
  });
}

/**
 * Prefer the species-tagged selection when a host provides one. An incoherent
 * tagged record fails closed instead of falling through to a possibly stale
 * compatibility resident selection.
 */
export function resolveActorAboutSurface(
  view: Pick<TideweftUIView, "selectedLivingActor" | "selectedResident">,
): ResolvedActorAboutSurface | undefined {
  const selected = view.selectedLivingActor;
  if (selected !== undefined) {
    if (!hasCoherentLivingActorInspection(selected)) return undefined;
    return {
      selectionKey: `${selected.target.species}:${selected.target.actorId}`,
      species: selected.target.species,
      heading: selected.about.heading,
      identityLine: selected.about.identityLine,
      quickSummary: selected.quick.summary,
      knowledgeLabel: selected.about.knowledgeLabel,
      observed: selected.about.observed,
      known: selected.about.known,
      closeCommand: {
        type: "living-actor",
        action: "close",
        target: selected.target,
      },
      interactions: selected.interactions ?? [],
    };
  }

  const resident = view.selectedResident;
  if (resident === undefined) return undefined;
  return {
    selectionKey: `human-compat:${resident.id}`,
    species: "human",
    heading: resident.heading,
    identityLine: resident.identityLine,
    knowledgeLabel: resident.knowledgeLabel,
    observed: resident.observed,
    known: resident.known,
    closeCommand: {
      type: "resident",
      action: "close",
      residentId: resident.id,
    },
    interactions: [],
    ...(resident.actionLabel === undefined ? {} : { actionLabel: resident.actionLabel }),
    ...(resident.actionDisabled === undefined ? {} : { actionDisabled: resident.actionDisabled }),
    ...(resident.actionHint === undefined ? {} : { actionHint: resident.actionHint }),
  };
}

/** Fail closed if independently supplied quick/full records do not share a target. */
export function hasCoherentLivingActorInspection(
  value: SelectedLivingActorUIView,
): boolean {
  return plainRecord(value)
    && plainRecord(value.quick)
    && plainRecord(value.about)
    && validTarget(value.target)
    && sameTarget(value.target, value.quick.target)
    && sameTarget(value.target, value.about.target)
    && Number.isSafeInteger(value.quick.distanceUnits)
    && value.quick.distanceUnits >= 0
    && (value.interactions === undefined || canonicalInteractions(value.interactions) !== null);
}

const INTERACTION_IDS: ReadonlySet<LivingActorInteractionId> = new Set([
  "help",
  "secure-food",
  "wait",
  "reroute",
  "leave",
]);

function canonicalInteractions(value: unknown): readonly LivingActorInteractionUIView[] | null {
  if (!Array.isArray(value) || value.length > INTERACTION_IDS.size) return null;
  const seen = new Set<LivingActorInteractionId>();
  const interactions: LivingActorInteractionUIView[] = [];
  for (const raw of value) {
    if (!plainRecord(raw)) return null;
    const expected = raw.disabled === undefined && raw.hint === undefined
      ? ["id", "label"]
      : raw.disabled === undefined
        ? ["hint", "id", "label"]
        : raw.hint === undefined
          ? ["disabled", "id", "label"]
          : ["disabled", "hint", "id", "label"];
    const keys = Object.keys(raw).sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      return null;
    }
    if (
      typeof raw.id !== "string"
      || !INTERACTION_IDS.has(raw.id as LivingActorInteractionId)
      || seen.has(raw.id as LivingActorInteractionId)
      || typeof raw.label !== "string"
      || raw.label.trim() !== raw.label
      || raw.label.length === 0
      || raw.label.length > 48
      || (raw.disabled !== undefined && typeof raw.disabled !== "boolean")
      || (raw.hint !== undefined && (
        typeof raw.hint !== "string"
        || raw.hint.trim() !== raw.hint
        || raw.hint.length === 0
        || raw.hint.length > 240
      ))
    ) return null;
    const id = raw.id as LivingActorInteractionId;
    seen.add(id);
    interactions.push(Object.freeze({
      id,
      label: raw.label,
      ...(raw.disabled === undefined ? {} : { disabled: raw.disabled }),
      ...(raw.hint === undefined ? {} : { hint: raw.hint }),
    }));
  }
  return Object.freeze(interactions);
}

export function sameLivingActorTarget(
  left: LivingActorTargetUIView,
  right: LivingActorTargetUIView,
): boolean {
  return validTarget(left) && validTarget(right) && sameTarget(left, right);
}

function freezeTarget(target: LivingActorTargetUIView): LivingActorTargetUIView {
  return Object.freeze(target);
}

function validTarget(value: unknown): value is LivingActorTargetUIView {
  if (
    !plainRecord(value)
    || typeof value.actorId !== "string"
    || value.actorId.length === 0
    || value.actorId.length > 192
    || !/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value.actorId)
  ) return false;
  return value.species === "human"
    ? value.actorId.startsWith("H-")
    : value.species === "domestic-dog" && value.actorId.startsWith("D-");
}

function sameTarget(
  left: unknown,
  right: unknown,
): boolean {
  return validTarget(left)
    && validTarget(right)
    && left.species === right.species
    && left.actorId === right.actorId;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
