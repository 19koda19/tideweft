import type { SettlementStatus, TidePhase, WeatherKind } from "../render/types";
import type { RendererTelemetrySnapshot } from "../render/rendererTelemetry";
import { acceptsRestartPhrase, RESTART_PHRASE } from "../game/restartPolicy";
import {
  PERPETUAL_SESSION_SHAPE,
  type ChronicleEntryUIView,
  type ContractStatus,
  type ContractUIView,
  type KitTabId,
  type LivingActorAboutUIView,
  type ResidentAboutUIView,
  type SettlementInspectorUIView,
  type TideweftUIController,
  type TideweftUIOptions,
  type TideweftUICommand,
  type TideweftUIView,
  type SaveWarningUIView,
  type TitleOverlayUIView,
} from "./types";
import {
  resolveActorAboutSurface,
  type ActorAboutCloseCommand,
  type ResolvedActorAboutSurface,
} from "./livingActorAbout";
import {
  KIT_DIALOG_ID,
  createKitDialog,
  type KitDialogController,
} from "./kitDialog";
import { bindMobileBraceHold } from "./mobileBrace";
import { createTutorialDialog, type TutorialDialogController } from "./tutorialDialog";
import {
  PATCH_NOTES_DIALOG_ID,
  createPatchNotesDialog,
  type PatchNotesDialogController,
  type PatchNotesOpenSource,
} from "./patchNotesDialog";
import { bindTitleAtmosphere } from "./titleAtmosphere";

export const WAYKNOT_KEY_SHORTCUT = "F";
export const MOBILE_PROMISES_PANEL_ID = "promises-panel";
export const MOBILE_INSPECTOR_PANEL_ID = "settlement-inspector";
const COMPACT_HUD_MEDIA_QUERY = "(max-width: 44rem), (max-height: 34rem) and (max-width: 64rem)";
export const TIDE_HARP_HELP_COPY =
  "Place one Reed mat, one Tide anchor, and one Wind knot as a compact triangle to tune a Tide Harp. Stand inside its triangle for +900 Loom charge each tick; a Space pulse then sounds from you and all three knots.";
export const RECOVERY_SEED_REQUIRED_MESSAGE =
  "Enter a non-empty seed phrase before replacing the unreadable or conflicting local autosave.";
export const WORLD_CREATION_BLOCKED_MESSAGE =
  "Reload after local storage is available; this window will not create or replace a world.";
export const TITLE_SURFACE_COPY = {
  heading: "TIDEWEFT",
  seed: "Seed phrase",
  start: "START",
  patchNotes: "PATCH NOTES",
} as const;

export interface ResidentAboutSurfaceState {
  readonly hidden: boolean;
  readonly modal: false;
  readonly pausesGameplay: false;
}

/** ABOUT is resident field feedback, never a modal or a simulation pause. */
export function residentAboutSurfaceState(
  resident:
    | ResidentAboutUIView
    | LivingActorAboutUIView
    | ResolvedActorAboutSurface
    | undefined,
): ResidentAboutSurfaceState {
  return { hidden: !resident, modal: false, pausesGameplay: false };
}

export interface ResidentAboutActionPresentation {
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly hint: string;
}

/** Missing actions stay missing; an acquainted actor never regains a dead GREET button. */
export function residentAboutActionPresentation(
  resident: ResidentAboutUIView | ResolvedActorAboutSurface,
): ResidentAboutActionPresentation {
  const hidden = resident.actionLabel === undefined;
  return {
    hidden,
    disabled: hidden || Boolean(resident.actionDisabled),
    label: resident.actionLabel ?? "",
    hint: resident.actionHint ?? "",
  };
}

const signedAxis = (value: number): string => {
  const integer = Number.isFinite(value) ? Math.trunc(value) : 0;
  return integer > 0 ? `+${integer}` : String(integer);
};

/** Ordinary navigation exposes one continuous world address, never storage partitions. */
export function navigationTelemetryCopy(
  navigation: TideweftUIView["navigation"],
  telemetry: RendererTelemetrySnapshot | undefined,
  compact = false,
): string {
  const fps = telemetry?.active && telemetry.frameCount >= 2 && telemetry.fps > 0
    ? `${Math.round(telemetry.fps)} FPS`
    : "FPS —";
  if (!navigation) return `E ? · N ? · ${fps}`;
  const east = signedAxis(navigation.globalX);
  const north = signedAxis(navigation.globalY);
  return compact
    ? `E${east} · N${north} · ${fps}`
    : `E ${east} · N ${north} · ${fps}`;
}
const RESTART_SEED_REQUIRED_MESSAGE =
  "Enter a non-empty seed phrase before replacing this estuary.";

export interface MobileHudDisclosureState {
  readonly ariaExpanded: "true" | "false";
  readonly ariaControls: string;
  readonly visibleLabel: string;
  readonly accessibleLabel: string;
}

export interface MobileHudCopyInput {
  readonly objectiveTitle: string | undefined;
  readonly objectiveRoute: string | undefined;
  readonly objectiveProgress: string | undefined;
  readonly stamina: number;
  readonly stability: number;
  readonly stabilityHint: string;
  readonly bracing?: boolean;
  readonly isWater: boolean;
  readonly terrain: string;
  readonly depth: string;
  readonly effort: string;
  readonly swept: boolean;
  readonly fieldHint: string;
  readonly canScan: boolean | undefined;
  readonly interactLabel: string | undefined;
  readonly wayknotLabel: string | undefined;
}

export interface MobileHudCopy {
  readonly objective: string;
  readonly safety: string;
  readonly terrain: string;
  readonly actions: string;
}

export interface UnderfootTerrainSample {
  readonly terrainLabel: string;
  readonly isWater: boolean;
  readonly swept: boolean;
}

export interface UnderfootTerrainStabilizer {
  /**
   * Returns the terrain name that should be painted for this sample. Water and
   * ADRIFT boundaries remain immediate; ordinary neighboring terrain has to be
   * observed twice so a one-step diagonal correction cannot flash the HUD.
   */
  readonly present: (sample: UnderfootTerrainSample) => string;
  readonly reset: () => void;
}

const UNDERFOOT_TERRAIN_CONFIRMATIONS = 2;

/**
 * Presentation-only hysteresis for the prose name under the courier's feet.
 *
 * It does not alter simulation, collision, water state, depth, effort, current,
 * or safety copy. Entering/leaving water and entering/leaving ADRIFT therefore
 * remain truthful on the first sample, while ordinary biome seams no longer
 * alternate text during a single-tick path correction.
 */
export function createUnderfootTerrainStabilizer(
  confirmations = UNDERFOOT_TERRAIN_CONFIRMATIONS,
): UnderfootTerrainStabilizer {
  const required = Math.max(1, Math.trunc(Number.isFinite(confirmations) ? confirmations : 1));
  let committed: UnderfootTerrainSample | null = null;
  let candidate: UnderfootTerrainSample | null = null;
  let candidateCount = 0;

  const commit = (sample: UnderfootTerrainSample): string => {
    committed = sample;
    candidate = null;
    candidateCount = 0;
    return sample.terrainLabel;
  };

  return {
    present(sample) {
      if (committed === null) return commit(sample);
      if (
        sample.isWater !== committed.isWater
        || sample.swept !== committed.swept
      ) {
        return commit(sample);
      }
      if (sample.terrainLabel === committed.terrainLabel) {
        candidate = null;
        candidateCount = 0;
        return committed.terrainLabel;
      }
      if (
        candidate?.terrainLabel === sample.terrainLabel
        && candidate.isWater === sample.isWater
        && candidate.swept === sample.swept
      ) {
        candidateCount += 1;
      } else {
        candidate = sample;
        candidateCount = 1;
      }
      return candidateCount >= required ? commit(sample) : committed.terrainLabel;
    },
    reset() {
      committed = null;
      candidate = null;
      candidateCount = 0;
    },
  };
}

/** Avoids replacing a stable text node every fixed simulation step. */
export function syncTextContent(
  target: { textContent: string | null },
  next: string,
): boolean {
  if (target.textContent === next) return false;
  target.textContent = next;
  return true;
}

/** Native disclosure copy stays synchronized without becoming saved game state. */
export function mobileHudDisclosureState(
  expanded: boolean,
  sheet: "promises" | "inspector" = "promises",
): MobileHudDisclosureState {
  if (expanded && sheet === "inspector") {
    return {
      ariaExpanded: "true",
      ariaControls: MOBILE_INSPECTOR_PANEL_ID,
      visibleLabel: "CLOSE ×",
      accessibleLabel: "Close settlement details",
    };
  }
  return expanded
    ? {
        ariaExpanded: "true",
        ariaControls: MOBILE_PROMISES_PANEL_ID,
        visibleLabel: "PROMISES −",
        accessibleLabel: "Close promises",
      }
    : {
        ariaExpanded: "false",
        ariaControls: MOBILE_PROMISES_PANEL_ID,
        visibleLabel: "PROMISES +",
        accessibleLabel: "Open promises",
      };
}

/** Builds the three terse lines that remain readable while mobile panels are closed. */
export function mobileHudCopy(input: MobileHudCopyInput): MobileHudCopy {
  const stamina = Math.round(Math.max(0, Math.min(1, Number.isFinite(input.stamina) ? input.stamina : 0)) * 100);
  const stability = Math.round(Math.max(0, Math.min(1, Number.isFinite(input.stability) ? input.stability : 0)) * 100);
  const route = input.objectiveRoute?.trim() || "PICKUP cargo → DELIVER cargo";
  const objective = [
    route,
    input.objectiveTitle?.trim() || "Listen for a promise",
    input.objectiveProgress?.trim(),
  ].filter(Boolean).join(" · ");
  const stabilityCause = input.stabilityHint
    .replace(/^Falling(?::|\s*·)?\s*/u, "↓ ")
    .replace(/^Recovering(?: while)?\s*/u, "↑ ")
    .replace(/^Stable\s*·.*$/u, "STABLE")
    .replace(/\s*·\s*hold Shift to brace.*$/iu, "")
    .replace(/\s*·\s*Shift trades speed for control.*$/iu, "")
    .trim() || "STABLE";
  const sweepRule = "DEEP: STAM/STAB 0 → ADRIFT";
  const safety = input.swept
    ? `ADRIFT · ${input.fieldHint} · STAM ${stamina}% · STAB ${stability}%`
    : `${input.bracing ? "BRACING · " : ""}${stabilityCause} · STAB ${stability}% · ${sweepRule}`;
  const terrain = `${input.isWater ? "WATER" : "GROUND"} · ${input.terrain} · ${input.depth} · ${input.effort}`;
  const actions = [
    input.interactLabel?.trim() || "Interact",
    input.canScan === false ? "Scan recharging" : "Sound / Scan",
    input.wayknotLabel?.trim() || "Place Wayknot",
  ].join(" · ");
  return { objective, safety, terrain, actions };
}

export interface WayknotActionButtonState {
  readonly disabled: boolean;
  readonly label: string;
  readonly hint: string;
  readonly ariaLabel: string;
  readonly ariaKeyShortcuts: typeof WAYKNOT_KEY_SHORTCUT;
}

export interface TideHarpFieldStatus {
  readonly visible: string;
  readonly accessible: string;
  readonly active: boolean;
}

export interface SaveWarningPresentation {
  readonly hidden: boolean;
  readonly id: string;
  readonly message: string;
  readonly detail: string;
  readonly tone: "warning" | "danger";
}

export interface TitleSeedRequirement {
  readonly required: boolean;
  readonly validationMessage: string;
}

export interface TitleWorldCreationState {
  readonly blocked: boolean;
  readonly reason: string;
}

export function titleWorldCreationState(
  title: Pick<TitleOverlayUIView, "worldCreationBlocked">,
): TitleWorldCreationState {
  return title.worldCreationBlocked
    ? { blocked: true, reason: WORLD_CREATION_BLOCKED_MESSAGE }
    : { blocked: false, reason: "" };
}

/**
 * Keeps native input constraints and submit-time validation on one contract.
 * Recovery has no Continue/restart gate, but it must never inherit the ordinary
 * first-launch convenience where a blank phrase selects the default seed.
 */
export function titleSeedRequirement(
  title: Pick<TitleOverlayUIView, "hasSave" | "requiresSeed">,
  restartUnlocked: boolean,
): TitleSeedRequirement {
  if (title.requiresSeed) {
    return {
      required: true,
      validationMessage: RECOVERY_SEED_REQUIRED_MESSAGE,
    };
  }
  if (title.hasSave && restartUnlocked) {
    return {
      required: true,
      validationMessage: RESTART_SEED_REQUIRED_MESSAGE,
    };
  }
  return { required: false, validationMessage: "" };
}

const RESTART_LOCKED_STATUS =
  "Your current save stays intact. This only unlocks the required new-seed step.";
const RESTART_UNLOCKED_STATUS =
  "Restart unlocked. Enter a non-empty new seed, then choose START. Your current save remains intact until then.";

export interface TitleRestartFlowElements {
  readonly restartForm: HTMLFormElement;
  readonly restartInput: HTMLInputElement;
  readonly restartButton: HTMLButtonElement;
  readonly restartStatus: HTMLElement;
  readonly newWorldForm: HTMLFormElement;
  readonly seedInput: HTMLInputElement;
  readonly seedStatus: HTMLElement;
  readonly beginButton: HTMLButtonElement;
}

export interface TitleRestartFlowController {
  readonly unlocked: boolean;
  readonly seedDirty: boolean;
  readonly submitting: boolean;
  /** Reconciles local form state with the currently presented title surface. */
  readonly sync: (title: TitleOverlayUIView, presented: boolean) => void;
  readonly destroy: () => void;
}

interface TitleRestartFlowOptions {
  readonly elements: TitleRestartFlowElements;
  readonly getTitle: () => TitleOverlayUIView | null;
  readonly dispatch: (command: TideweftUICommand) => void;
  readonly announce: (message: string, assertive?: boolean) => void;
}

/**
 * Owns the two-stage saved-world restart form at the actual DOM boundary.
 *
 * The state deliberately lives outside the view projection: routine paused
 * renders must not relock a phrase that the player has just confirmed, while
 * closing the title always discards the temporary authorization. Native form
 * `invalid` is handled as well as `submit`, because mobile browsers can stop a
 * required blank seed before a submit listener ever runs.
 */
export function bindTitleRestartFlow(
  options: TitleRestartFlowOptions,
): TitleRestartFlowController {
  const elements = options.elements;
  let unlocked = false;
  let seedDirty = false;
  let submitting = false;
  let awaitingResult = false;
  let presentedPreviously = false;
  let priorMode = "";
  let blockedValidityApplied = false;

  const setInvalid = (input: HTMLInputElement, invalid: boolean): void => {
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
  };

  const focusControl = (input: HTMLInputElement, select = false): void => {
    input.focus({ preventScroll: true });
    if (select) input.select();
    input.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const reset = (): void => {
    unlocked = false;
    seedDirty = false;
    submitting = false;
    awaitingResult = false;
    blockedValidityApplied = false;
    elements.restartInput.value = "";
    elements.seedInput.value = "";
    elements.seedInput.required = false;
    elements.seedInput.setCustomValidity("");
    setInvalid(elements.restartInput, false);
    setInvalid(elements.seedInput, false);
    elements.restartStatus.textContent = RESTART_LOCKED_STATUS;
    elements.seedStatus.textContent = "";
    elements.seedStatus.hidden = true;
  };

  const sync = (title: TitleOverlayUIView, presented: boolean): void => {
    const mode = `${title.hasSave ? "saved" : "new"}:${title.requiresSeed ? "recovery" : "healthy"}`;
    const opening = presented && !presentedPreviously;
    const modeChanged = presented && priorMode !== "" && mode !== priorMode;

    if (!presented) {
      if (presentedPreviously || unlocked || submitting || elements.restartInput.value.length > 0) {
        reset();
      }
    } else if (opening || modeChanged) {
      reset();
    } else if (awaitingResult) {
      // The runtime has rendered another title state instead of closing it, so
      // the guarded replacement was rejected. Permit a deliberate retry, but
      // never a second command from the original double tap.
      awaitingResult = false;
      submitting = false;
      elements.seedStatus.hidden = false;
      elements.seedStatus.textContent =
        "The replacement was not accepted. No stored world was replaced; review the message and try again.";
    }

    presentedPreviously = presented;
    priorMode = presented ? mode : "";

    const worldCreation = titleWorldCreationState(title);
    const seedRequirement = titleSeedRequirement(title, unlocked);
    elements.restartForm.hidden = !title.hasSave || unlocked;
    elements.newWorldForm.hidden = title.hasSave && !unlocked;
    elements.seedInput.required = seedRequirement.required;
    elements.seedInput.disabled = worldCreation.blocked || submitting;
    elements.beginButton.disabled = worldCreation.blocked || submitting;
    elements.restartInput.disabled = worldCreation.blocked || submitting;
    elements.restartButton.disabled = worldCreation.blocked || submitting;
    elements.newWorldForm.setAttribute("aria-disabled", String(worldCreation.blocked || submitting));
    elements.restartForm.setAttribute("aria-disabled", String(worldCreation.blocked || submitting));
    elements.newWorldForm.setAttribute("aria-busy", String(submitting));
    if (worldCreation.blocked) {
      elements.seedInput.setCustomValidity(worldCreation.reason);
      blockedValidityApplied = true;
    } else if (blockedValidityApplied) {
      elements.seedInput.setCustomValidity("");
      blockedValidityApplied = false;
    }
    if (title.requiresSeed && !unlocked && elements.seedStatus.textContent.length === 0) {
      elements.seedInput.placeholder = "Required: enter a recovery seed phrase";
      elements.seedStatus.hidden = false;
      elements.seedStatus.textContent =
        "Enter a non-empty recovery seed. The unreadable or conflicting save remains untouched until START succeeds.";
    }
  };

  const rejectBlankSeed = (title: TitleOverlayUIView): void => {
    const requirement = titleSeedRequirement(title, unlocked);
    const message = requirement.validationMessage || RESTART_SEED_REQUIRED_MESSAGE;
    elements.seedInput.required = true;
    elements.seedInput.setCustomValidity(message);
    setInvalid(elements.seedInput, true);
    elements.seedStatus.hidden = false;
    elements.seedStatus.textContent = `${message} Your current save is unchanged.`;
    focusControl(elements.seedInput);
    options.announce(
      title.requiresSeed
        ? "The unreadable or conflicting autosave is unchanged. Enter a non-empty seed phrase to replace it safely."
        : "The current estuary is unchanged. Enter a new seed phrase to replace it.",
      true,
    );
  };

  const onRestartInput = (): void => {
    setInvalid(elements.restartInput, false);
    elements.restartStatus.textContent = RESTART_LOCKED_STATUS;
  };

  const unlockRestart = (): void => {
    if (unlocked) return;
    unlocked = true;
    seedDirty = false;
    setInvalid(elements.restartInput, false);
    elements.restartStatus.textContent = "Restart unlocked. Your current save is still intact.";
    elements.restartForm.hidden = true;
    elements.newWorldForm.hidden = false;
    elements.seedInput.value = "";
    elements.seedInput.placeholder = "Required: enter a new seed phrase";
    elements.seedInput.required = true;
    elements.seedInput.setCustomValidity("");
    setInvalid(elements.seedInput, false);
    elements.seedStatus.hidden = false;
    elements.seedStatus.textContent = RESTART_UNLOCKED_STATUS;
    focusControl(elements.seedInput);
    options.announce("Restart unlocked. Enter a non-empty new seed, then choose START.");
  };

  const onRestartChange = (): void => {
    const title = options.getTitle();
    if (
      !title
      || !presentedPreviously
      || !title.hasSave
      || submitting
      || titleWorldCreationState(title).blocked
      || !acceptsRestartPhrase(elements.restartInput.value)
    ) {
      return;
    }
    // Mobile virtual keyboards may commit a field with Done/change while the
    // submit control is below the reduced visual viewport. Exact confirmation
    // may reveal the seed step, but it still cannot replace a save by itself.
    unlockRestart();
  };

  const onRestartSubmit = (event: Event): void => {
    event.preventDefault();
    const title = options.getTitle();
    if (!title || !presentedPreviously || submitting) return;
    const worldCreation = titleWorldCreationState(title);
    if (worldCreation.blocked) {
      elements.restartStatus.textContent = worldCreation.reason;
      options.announce(worldCreation.reason, true);
      return;
    }
    if (!acceptsRestartPhrase(elements.restartInput.value)) {
      setInvalid(elements.restartInput, true);
      elements.restartStatus.textContent =
        `Not unlocked. Type ${RESTART_PHRASE} exactly; your current save is unchanged.`;
      focusControl(elements.restartInput, true);
      options.announce("Restart not unlocked. The current estuary is unchanged.", true);
      return;
    }
    unlockRestart();
  };

  const onSeedInput = (): void => {
    seedDirty = true;
    elements.seedInput.setCustomValidity("");
    setInvalid(elements.seedInput, false);
    if (unlocked) {
      elements.seedStatus.hidden = false;
      elements.seedStatus.textContent = RESTART_UNLOCKED_STATUS;
    }
  };

  const onSeedInvalid = (event: Event): void => {
    event.preventDefault();
    const title = options.getTitle();
    if (!title || !presentedPreviously || submitting) return;
    rejectBlankSeed(title);
  };

  const onNewWorldSubmit = (event: Event): void => {
    event.preventDefault();
    const title = options.getTitle();
    if (!title || !presentedPreviously || submitting) return;
    const worldCreation = titleWorldCreationState(title);
    if (worldCreation.blocked) {
      elements.seedInput.setCustomValidity(worldCreation.reason);
      setInvalid(elements.seedInput, true);
      elements.seedStatus.hidden = false;
      elements.seedStatus.textContent = worldCreation.reason;
      options.announce(worldCreation.reason, true);
      return;
    }
    if (title.hasSave && !unlocked) {
      elements.restartStatus.textContent = `Type ${RESTART_PHRASE} exactly before choosing a new seed.`;
      elements.restartForm.hidden = false;
      elements.newWorldForm.hidden = true;
      focusControl(elements.restartInput);
      return;
    }
    const seed = elements.seedInput.value.trim();
    const seedRequirement = titleSeedRequirement(title, unlocked);
    if (seedRequirement.required && seed.length === 0) {
      rejectBlankSeed(title);
      return;
    }

    submitting = true;
    awaitingResult = true;
    elements.seedInput.disabled = true;
    elements.beginButton.disabled = true;
    elements.newWorldForm.setAttribute("aria-busy", "true");
    elements.seedStatus.hidden = false;
    elements.seedStatus.textContent = "Starting this seed once…";
    try {
      options.dispatch({
        type: "new-world",
        seed,
        posture: "gale",
        sessionShape: PERPETUAL_SESSION_SHAPE,
        ...(title.hasSave ? { restartPhrase: RESTART_PHRASE } : {}),
      });
    } catch (error) {
      submitting = false;
      awaitingResult = false;
      elements.seedInput.disabled = false;
      elements.beginButton.disabled = false;
      elements.newWorldForm.setAttribute("aria-busy", "false");
      elements.seedStatus.textContent =
        "The replacement could not start. Your current save is unchanged; try again.";
      throw error;
    }
  };

  elements.restartInput.addEventListener("input", onRestartInput);
  elements.restartInput.addEventListener("change", onRestartChange);
  elements.restartForm.addEventListener("submit", onRestartSubmit);
  elements.seedInput.addEventListener("input", onSeedInput);
  elements.seedInput.addEventListener("invalid", onSeedInvalid);
  elements.newWorldForm.addEventListener("submit", onNewWorldSubmit);

  return {
    get unlocked() {
      return unlocked;
    },
    get seedDirty() {
      return seedDirty;
    },
    get submitting() {
      return submitting;
    },
    sync,
    destroy: () => {
      elements.restartInput.removeEventListener("input", onRestartInput);
      elements.restartInput.removeEventListener("change", onRestartChange);
      elements.restartForm.removeEventListener("submit", onRestartSubmit);
      elements.seedInput.removeEventListener("input", onSeedInput);
      elements.seedInput.removeEventListener("invalid", onSeedInvalid);
      elements.newWorldForm.removeEventListener("submit", onNewWorldSubmit);
    },
  };
}

export const SAVE_WARNING_SURFACES = [
  "field",
  "title",
  "quiet-hour",
  "tutorial",
  "patch-notes",
  "kit",
] as const;
type SaveWarningSurface = (typeof SAVE_WARNING_SURFACES)[number];

/** Keeps persistent storage health visibly distinct from transient announcements. */
export function saveWarningPresentation(
  warning: SaveWarningUIView | undefined,
): SaveWarningPresentation {
  if (!warning) {
    return { hidden: true, id: "", message: "", detail: "", tone: "warning" };
  }
  return {
    hidden: false,
    id: warning.id,
    message: warning.message,
    detail: warning.detail ?? "Your current session remains playable; keep this page open until storage recovers.",
    tone: warning.tone ?? "warning",
  };
}

/** Keeps the compact field line and its fuller assistive description truthful. */
export function tideHarpFieldStatus(
  tideHarps: TideweftUIView["field"]["tideHarps"],
): TideHarpFieldStatus {
  const active = tideHarps.activeId !== null;
  const visible = active
    ? `${tideHarps.activeLabel ?? "Tide Harp"} active · ${tideHarps.benefitLabel}`
    : tideHarps.tunedCount === 0
      ? "Tune one: Reed + Anchor + Wind in a compact triangle"
      : "Stand inside a tuned triangle to activate";
  const tunedSummary = tideHarps.tunedCount === 1
    ? "1 Tide Harp tuned"
    : `${tideHarps.tunedCount} Tide Harps tuned`;
  return {
    visible,
    accessible: active
      ? `${tunedSummary}. ${visible}.`
      : `${tunedSummary}. ${visible}. Benefit when active: ${tideHarps.benefitLabel}.`,
    active,
  };
}

/** Pure presentation state keeps the visible, tooltip, and spoken action in lockstep. */
export function wayknotActionButtonState(
  controls: TideweftUIView["controls"],
): WayknotActionButtonState {
  const label = controls?.wayknotLabel ?? "Place Wayknot";
  const hint = controls?.wayknotHint ?? "Place or reclaim a reusable Wayknot at your position";
  return {
    disabled: controls?.canWayknot === false,
    label,
    hint,
    ariaLabel: `${label}. ${hint}`,
    ariaKeyShortcuts: WAYKNOT_KEY_SHORTCUT,
  };
}

interface UIShortcutEvent {
  readonly code: string;
  readonly key: string;
  readonly repeat: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/**
 * Handles document-level non-movement shortcuts. Canvas handlers prevent the
 * same event first, so focused play never dispatches F twice; the global path
 * keeps the advertised shortcut usable while focus is elsewhere in the HUD.
 */
export function handleTideweftUIShortcut(
  event: UIShortcutEvent,
  canWayknot: boolean,
  dispatch: (command: TideweftUICommand) => void,
  openHelp: () => void,
  toggleKit: () => void = () => undefined,
  openMake: () => void = () => undefined,
): boolean {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  if (
    event.code === "KeyT"
    || event.key === "?"
    || (event.key === "/" && event.code === "Slash" && event.shiftKey)
  ) {
    event.preventDefault();
    openHelp();
    return true;
  }
  if (event.code === "KeyI") {
    event.preventDefault();
    toggleKit();
    return true;
  }
  if (event.code === "KeyC") {
    event.preventDefault();
    openMake();
    return true;
  }
  if (event.code !== "KeyF" || !canWayknot) return false;
  event.preventDefault();
  dispatch({ type: "wayknot" });
  return true;
}

/** Escape cancels a non-modal actor disclosure before other HUD shortcuts. */
export function handleActorAboutEscape(
  event: Pick<UIShortcutEvent, "key" | "defaultPrevented" | "preventDefault">,
  closeCommand: ActorAboutCloseCommand | undefined,
  dispatch: (command: TideweftUICommand) => void,
): boolean {
  if (event.defaultPrevented || event.key !== "Escape" || !closeCommand) return false;
  event.preventDefault();
  dispatch(closeCommand);
  return true;
}

/** Compatibility wrapper retained for the existing numeric-resident runtime. */
export function handleResidentAboutEscape(
  event: Pick<UIShortcutEvent, "key" | "defaultPrevented" | "preventDefault">,
  residentId: string | undefined,
  dispatch: (command: TideweftUICommand) => void,
): boolean {
  return handleActorAboutEscape(
    event,
    residentId
      ? { type: "resident", action: "close", residentId }
      : undefined,
    dispatch,
  );
}

interface UIRefs {
  shell: HTMLDivElement;
  saveWarningBanners: readonly SaveWarningBannerRefs[];
  mobileFieldStrip: HTMLElement;
  mobileHudToggle: HTMLButtonElement;
  mobileKitButton: HTMLButtonElement;
  mobileObjective: HTMLSpanElement;
  mobileStamina: HTMLProgressElement;
  mobileStaminaValue: HTMLSpanElement;
  mobileStability: HTMLProgressElement;
  mobileStabilityValue: HTMLSpanElement;
  mobileLoom: HTMLProgressElement;
  mobileLoomValue: HTMLSpanElement;
  mobileCargo: HTMLProgressElement;
  mobileCargoValue: HTMLSpanElement;
  mobileSafety: HTMLSpanElement;
  mobileTerrain: HTMLSpanElement;
  mobileActions: HTMLSpanElement;
  mobileNavigation: HTMLSpanElement;
  desktopFieldLine: HTMLElement;
  desktopFieldTerrain: HTMLSpanElement;
  desktopFieldSafety: HTMLSpanElement;
  desktopFieldNavigation: HTMLSpanElement;
  worldName: HTMLParagraphElement;
  clockDay: HTMLSpanElement;
  clockTime: HTMLSpanElement;
  tideReadout: HTMLDivElement;
  tideSymbol: HTMLSpanElement;
  tideLabel: HTMLSpanElement;
  tideProgress: HTMLProgressElement;
  tideNext: HTMLSpanElement;
  weatherReadout: HTMLDivElement;
  weatherSymbol: HTMLSpanElement;
  weatherLabel: HTMLSpanElement;
  weatherForecast: HTMLSpanElement;
  location: HTMLParagraphElement;
  navigation: HTMLParagraphElement;
  stamina: HTMLProgressElement;
  stability: HTMLProgressElement;
  stabilityDetail: HTMLSpanElement;
  scanCharge: HTMLProgressElement;
  cargo: HTMLProgressElement;
  cargoLabel: HTMLSpanElement;
  objectivePanel: HTMLElement;
  objectiveEyebrow: HTMLParagraphElement;
  objectiveTitle: HTMLHeadingElement;
  objectiveDescription: HTMLParagraphElement;
  objectiveProgress: HTMLProgressElement;
  objectiveProgressLabel: HTMLSpanElement;
  objectiveWhy: HTMLParagraphElement;
  fieldReadout: HTMLDivElement;
  fieldTerrain: HTMLSpanElement;
  fieldDepth: HTMLSpanElement;
  fieldEffort: HTMLSpanElement;
  fieldTools: HTMLSpanElement;
  fieldWayknots: HTMLDivElement;
  fieldWayknotCount: HTMLElement;
  fieldWayknotActive: HTMLSpanElement;
  fieldTideHarps: HTMLDivElement;
  fieldTideHarpCount: HTMLElement;
  fieldTideHarpActive: HTMLSpanElement;
  fieldHint: HTMLSpanElement;
  fieldSweep: HTMLProgressElement;
  choirReadout: HTMLDivElement;
  choirLabel: HTMLSpanElement;
  choirProgress: HTMLProgressElement;
  choirHint: HTMLSpanElement;
  contractDetails: HTMLDetailsElement;
  contractSummary: HTMLElement;
  contractCount: HTMLSpanElement;
  contractList: HTMLOListElement;
  inspector: HTMLElement;
  inspectorTitle: HTMLHeadingElement;
  inspectorSubtitle: HTMLParagraphElement;
  inspectorStatus: HTMLSpanElement;
  inspectorPopulation: HTMLSpanElement;
  inspectorVerified: HTMLSpanElement;
  inspectorSummary: HTMLParagraphElement;
  inspectorMetrics: HTMLDListElement;
  inspectorStocks: HTMLUListElement;
  inspectorResidents: HTMLUListElement;
  inspectorConnections: HTMLUListElement;
  inspectorReports: HTMLUListElement;
  inspectorFocus: HTMLButtonElement;
  inspectorClose: HTMLButtonElement;
  residentAbout: HTMLElement;
  residentAboutTitle: HTMLHeadingElement;
  residentAboutIdentity: HTMLParagraphElement;
  residentAboutQuick: HTMLParagraphElement;
  residentAboutBody: HTMLDivElement;
  residentAboutKnowledge: HTMLSpanElement;
  residentAboutObservedHeading: HTMLHeadingElement;
  residentAboutObserved: HTMLDListElement;
  residentAboutKnownHeading: HTMLHeadingElement;
  residentAboutKnown: HTMLDListElement;
  residentAboutClose: HTMLButtonElement;
  residentAboutActions: HTMLDivElement;
  residentAboutGreet: HTMLButtonElement;
  residentAboutLivingActions: HTMLDivElement;
  residentAboutActionHint: HTMLParagraphElement;
  chronicleDetails: HTMLDetailsElement;
  chronicleSummary: HTMLElement;
  chronicleCount: HTMLSpanElement;
  chroniclePreview: HTMLSpanElement;
  chronicleList: HTMLOListElement;
  scanButton: HTMLButtonElement;
  interactButton: HTMLButtonElement;
  wayknotButton: HTMLButtonElement;
  wayknotButtonLabel: HTMLSpanElement;
  braceButton: HTMLButtonElement;
  kitButton: HTMLButtonElement;
  quietButton: HTMLButtonElement;
  titleButton: HTMLButtonElement;
  helpButton: HTMLButtonElement;
  titleDialog: HTMLDialogElement;
  titleAtmosphereCanvas: HTMLCanvasElement;
  continueButton: HTMLButtonElement;
  continueName: HTMLSpanElement;
  continueSummary: HTMLSpanElement;
  restartForm: HTMLFormElement;
  restartInput: HTMLInputElement;
  restartButton: HTMLButtonElement;
  restartStatus: HTMLParagraphElement;
  newWorldForm: HTMLFormElement;
  seedInput: HTMLInputElement;
  seedStatus: HTMLParagraphElement;
  beginButton: HTMLButtonElement;
  quietDialog: HTMLDialogElement;
  quietTitle: HTMLHeadingElement;
  quietSummary: HTMLParagraphElement;
  quietDuration: HTMLSpanElement;
  quietDistance: HTMLSpanElement;
  quietDeliveries: HTMLSpanElement;
  quietStrands: HTMLSpanElement;
  quietChanges: HTMLUListElement;
  quietQuote: HTMLQuoteElement;
  quietFinish: HTMLButtonElement;
  quietContinue: HTMLButtonElement;
  titlePatchNotes: HTMLButtonElement;
  quietPatchNotes: HTMLButtonElement;
  tutorial: TutorialDialogController;
  patchNotes: PatchNotesDialogController;
  kit: KitDialogController;
}

interface SaveWarningBannerRefs {
  readonly element: HTMLDivElement;
  readonly message: HTMLElement;
  readonly detail: HTMLSpanElement;
}

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const createButton = (
  className: string,
  label: string,
  accessibleLabel?: string,
): HTMLButtonElement => {
  const button = createElement("button", className, label);
  button.type = "button";
  if (accessibleLabel) button.setAttribute("aria-label", accessibleLabel);
  return button;
};

const createSaveWarningBanner = (surface: SaveWarningSurface): SaveWarningBannerRefs => {
  const wrapper = createElement("div", "save-warning");
  wrapper.hidden = true;
  wrapper.dataset.ui = "save-warning";
  wrapper.dataset.surface = surface;
  wrapper.setAttribute("role", "status");
  wrapper.setAttribute("aria-live", "polite");
  wrapper.setAttribute("aria-atomic", "true");
  const message = createElement("strong", "save-warning__message");
  const detail = createElement("span", "save-warning__detail");
  wrapper.append(message, detail);
  return { element: wrapper, message, detail };
};

const appendTextRow = (
  parent: HTMLElement,
  label: string,
  value: string,
  className = "readout-row",
): void => {
  const row = createElement("div", className);
  row.append(createElement("span", `${className}__label`, label));
  row.append(createElement("span", `${className}__value`, value));
  parent.append(row);
};

const makeProgress = (label: string): HTMLProgressElement => {
  const progress = createElement("progress", "weft-progress");
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute("aria-label", label);
  return progress;
};

const clampUnit = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Synchronizes the native progress property rather than only its HTML
 * attribute. This is shared by desktop and compact meters and intentionally
 * exported so zero/recovery/re-entry transitions can be regression tested
 * without a browser-specific rendering harness.
 */
export const setProgress = (
  progress: HTMLProgressElement,
  value: number,
  valueText?: string,
): void => {
  progress.value = clampUnit(value);
  progress.setAttribute("aria-valuetext", valueText ?? `${Math.round(clampUnit(value) * 100)} percent`);
};

const syncDialog = (dialog: HTMLDialogElement, visible: boolean): void => {
  if (visible && !dialog.open) {
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
  } else if (!visible && dialog.open) {
    try {
      dialog.close();
    } catch {
      dialog.removeAttribute("open");
    }
  }
};

const weatherSymbol = (kind: WeatherKind): string => {
  switch (kind) {
    case "clear":
      return "◌";
    case "mist":
      return "≋";
    case "drizzle":
      return "╱";
    case "rain":
      return "╱╱";
    case "squall":
      return "⚡";
    case "aurora":
      return "⌁";
  }
};

const tideSymbol = (phase: TidePhase): string => {
  switch (phase) {
    case "ebb":
      return "↘";
    case "low":
      return "⇣";
    case "flood":
      return "↗";
    case "high":
      return "⇡";
  }
};

const statusSymbol = (status: SettlementStatus): string => {
  switch (status) {
    case "steady":
      return "●";
    case "watchful":
      return "◐";
    case "strained":
      return "▲";
    case "recovering":
      return "✦";
    case "evacuating":
      return "◆";
  }
};

const contractAction = (status: ContractStatus): "accept" | "track" | "renegotiate" | null => {
  switch (status) {
    case "available":
      return "accept";
    case "accepted":
      return "track";
    case "tracked":
      return "renegotiate";
    case "completed":
    case "lapsed":
      return null;
  }
};

const defaultContractActionLabel = (status: ContractStatus): string => {
  switch (status) {
    case "available":
      return "Make this promise";
    case "accepted":
      return "Track route";
    case "tracked":
      return "Review promise";
    case "completed":
      return "Completed";
    case "lapsed":
      return "Needs renegotiation";
  }
};

const contractSignature = (contracts: readonly ContractUIView[]): string =>
  contracts
    .map((contract) =>
      [
        contract.id,
        contract.title,
        contract.requester ?? "",
        contract.summary,
        contract.origin,
        contract.destination,
        contract.cargoLabel,
        contract.cargoProperty ?? "",
        contract.mood,
        contract.status,
        contract.selected ? 1 : 0,
        contract.disabled ? 1 : 0,
        contract.masteryHint ?? "",
        contract.consequence ?? "",
        contract.actionLabel ?? "",
      ].join(":"),
    )
    .join("|");

/**
 * Only report-specific state belongs in this signature. Route reliability,
 * stock counters, and the clock can all change while a player is aiming at a
 * report button; none of those updates should replace the hovered control.
 */
export const signedReportActionsSignature = (
  settlement: Pick<SettlementInspectorUIView, "id" | "name" | "connections">,
): string => JSON.stringify([
  settlement.id,
  settlement.name,
  ...settlement.connections
    .filter((connection) => connection.settlementId && connection.reportActionLabel)
    .map((connection) => [
      connection.id,
      connection.settlementId,
      connection.settlementName,
      connection.reportActionLabel,
      connection.reportActionHint ?? "",
      connection.reportActionDisabled ? 1 : 0,
    ]),
]);

/** Keep the pointer-down target alive until the browser has emitted click. */
export const shouldRefreshSignedReportActions = (
  previousSignature: string,
  nextSignature: string,
  pointerActive: boolean,
): boolean => nextSignature !== previousSignature && (previousSignature === "" || !pointerActive);

const chronicleSignature = (entries: readonly ChronicleEntryUIView[]): string =>
  entries
    .map((entry) =>
      [entry.id, entry.timeLabel, entry.title, entry.detail, entry.kind, entry.new ? 1 : 0].join(":"),
    )
    .join("|");

const buildShell = (options: TideweftUIOptions): UIRefs => {
  const shell = createElement("div", "ui-layer");
  shell.dataset.mobileHudExpanded = "false";
  shell.dataset.mobileSheet = "promises";
  const fieldSaveWarning = createSaveWarningBanner("field");

  const topbar = createElement("section", "hud-bar glass-panel");
  topbar.setAttribute("aria-label", "World and journey status");

  const identity = createElement("div", "hud-identity");
  const worldName = createElement("p", "hud-identity__world", "Uncharted estuary");
  const location = createElement("p", "hud-identity__location", "Listening for a shore…");
  const navigation = createElement(
    "p",
    "hud-identity__navigation",
    "E ? · N ? · FPS —",
  );
  identity.append(worldName, location, navigation);

  const clock = createElement("div", "clock-readout");
  clock.setAttribute("aria-label", "Estuary time");
  const clockDay = createElement("span", "clock-readout__day", "Day 1");
  const clockTime = createElement("span", "clock-readout__time", "Dawn");
  clock.append(clockDay, clockTime);

  const tideReadout = createElement("div", "condition-readout condition-readout--tide");
  tideReadout.dataset.phase = "low";
  const tideSymbolElement = createElement("span", "condition-readout__symbol", "⇣");
  tideSymbolElement.setAttribute("aria-hidden", "true");
  const tideCopy = createElement("span", "condition-readout__copy");
  const tideLabelElement = createElement("strong", "condition-readout__label", "Low tide");
  const tideNext = createElement("span", "condition-readout__detail", "Turning soon");
  const tideProgress = makeProgress("Tide phase progress");
  tideCopy.append(tideLabelElement, tideNext, tideProgress);
  tideReadout.append(tideSymbolElement, tideCopy);

  const weatherReadout = createElement("div", "condition-readout condition-readout--weather");
  weatherReadout.dataset.weather = "clear";
  const weatherSymbolElement = createElement("span", "condition-readout__symbol", "◌");
  weatherSymbolElement.setAttribute("aria-hidden", "true");
  const weatherCopy = createElement("span", "condition-readout__copy");
  const weatherLabelElement = createElement("strong", "condition-readout__label", "Clear");
  const weatherForecast = createElement("span", "condition-readout__detail", "A quiet horizon");
  weatherCopy.append(weatherLabelElement, weatherForecast);
  weatherReadout.append(weatherSymbolElement, weatherCopy);

  const vitals = createElement("div", "vitals-readout");
  const makeVital = (label: string, modifier: string): [HTMLDivElement, HTMLProgressElement] => {
    const wrapper = createElement("div", `vital vital--${modifier}`);
    const labelElement = createElement("span", "vital__label", label);
    const progress = makeProgress(label);
    wrapper.append(labelElement, progress);
    return [wrapper, progress];
  };
  const [staminaWrapper, stamina] = makeVital("Stamina", "stamina");
  const [stabilityWrapper, stability] = makeVital("Stability", "stability");
  const stabilityDetail = createElement("span", "vital__detail", "Stable · hold Shift to brace");
  stabilityWrapper.append(stabilityDetail);
  const [scanWrapper, scanCharge] = makeVital("Loom", "scan");
  const [cargoWrapper, cargo] = makeVital("Cargo", "cargo");
  const cargoLabel = createElement("span", "vital__value", "0 / 0");
  cargoWrapper.append(cargoLabel);
  vitals.append(staminaWrapper, stabilityWrapper, scanWrapper, cargoWrapper);
  topbar.append(identity, clock, tideReadout, weatherReadout, vitals);

  const desktopFieldLine = createElement("section", "desktop-field-line");
  desktopFieldLine.setAttribute(
    "aria-label",
    "Current terrain, depth or ground, effort, stability cause, continuous coordinates, and renderer cadence",
  );
  const desktopFieldTerrain = createElement(
    "span",
    "desktop-field-line__terrain",
    "GROUND · Uncharted ground · Dry footing · Normal stamina use",
  );
  const desktopFieldSafety = createElement(
    "span",
    "desktop-field-line__safety",
    "STABLE · DEEP: STAM/STAB 0 → ADRIFT",
  );
  const desktopFieldNavigation = createElement(
    "span",
    "desktop-field-line__navigation",
    "E ? · N ? · FPS —",
  );
  desktopFieldLine.append(desktopFieldTerrain, desktopFieldSafety, desktopFieldNavigation);

  const mobileFieldStrip = createElement("section", "mobile-field-strip glass-panel");
  mobileFieldStrip.setAttribute("aria-label", "Compact field status");
  const initialMobileDisclosure = mobileHudDisclosureState(false);
  const mobileHudToggle = createButton(
    "mobile-field-toggle",
    initialMobileDisclosure.visibleLabel,
    initialMobileDisclosure.accessibleLabel,
  );
  mobileHudToggle.setAttribute("aria-expanded", initialMobileDisclosure.ariaExpanded);
  mobileHudToggle.setAttribute("aria-controls", initialMobileDisclosure.ariaControls);
  const mobileKitButton = createButton(
    "mobile-kit-button",
    "KIT",
    "Open KIT inventory. The world continues while it is open.",
  );
  mobileKitButton.setAttribute("aria-keyshortcuts", "I");
  mobileKitButton.setAttribute("aria-haspopup", "dialog");
  mobileKitButton.setAttribute("aria-controls", KIT_DIALOG_ID);
  mobileKitButton.setAttribute("aria-expanded", "false");
  const mobileFieldCopy = createElement("div", "mobile-field-strip__copy");
  const mobileObjective = createElement(
    "span",
    "mobile-field-strip__line mobile-field-strip__objective",
    "PICKUP cargo → DELIVER cargo · Listen for a promise",
  );
  const mobileVitals = createElement("div", "mobile-field-strip__vitals");
  const makeMobileVital = (
    label: string,
    modifier: string,
  ): [HTMLDivElement, HTMLProgressElement, HTMLSpanElement] => {
    const wrapper = createElement("div", `mobile-vital mobile-vital--${modifier}`);
    const copy = createElement("span", "mobile-vital__copy");
    copy.append(createElement("span", "mobile-vital__label", label));
    const value = createElement("span", "mobile-vital__value", "100%");
    copy.append(value);
    const progress = makeProgress(`${label} status`);
    wrapper.append(copy, progress);
    return [wrapper, progress, value];
  };
  const [mobileStaminaWrapper, mobileStamina, mobileStaminaValue] = makeMobileVital(
    "STAM",
    "stamina",
  );
  const [mobileStabilityWrapper, mobileStability, mobileStabilityValue] = makeMobileVital(
    "STAB",
    "stability",
  );
  const [mobileLoomWrapper, mobileLoom, mobileLoomValue] = makeMobileVital("LOOM", "loom");
  const [mobileCargoWrapper, mobileCargo, mobileCargoValue] = makeMobileVital("CARGO", "cargo");
  mobileCargoValue.textContent = "0/16";
  mobileVitals.append(
    mobileStaminaWrapper,
    mobileStabilityWrapper,
    mobileLoomWrapper,
    mobileCargoWrapper,
  );
  const mobileSafety = createElement(
    "span",
    "mobile-field-strip__line mobile-field-strip__safety",
    "Stable · deep water at zero stamina or stability sweeps",
  );
  const mobileTerrain = createElement(
    "span",
    "mobile-field-strip__line mobile-field-strip__terrain",
    "WATER · depth unsounded · use Sound / Scan",
  );
  const mobileActions = createElement(
    "span",
    "mobile-field-strip__line mobile-field-strip__actions",
    "Sound / Scan · Interact · Place Wayknot",
  );
  const mobileNavigation = createElement(
    "span",
    "mobile-field-strip__line mobile-field-strip__navigation",
    "E? · N? · FPS —",
  );
  mobileFieldCopy.append(
    mobileObjective,
    mobileVitals,
    mobileSafety,
    mobileTerrain,
    mobileNavigation,
    mobileActions,
  );
  mobileFieldStrip.append(mobileHudToggle, mobileKitButton, mobileFieldCopy);

  const objectivePanel = createElement("aside", "objective-panel glass-panel");
  objectivePanel.setAttribute("aria-labelledby", "objective-title");
  const objectiveEyebrow = createElement("p", "panel-eyebrow", "Current thread");
  const objectiveTitle = createElement("h2", "objective-panel__title", "Listen to the estuary");
  objectiveTitle.id = "objective-title";
  const objectiveDescription = createElement(
    "p",
    "objective-panel__description",
    "A useful promise will appear when the world is ready.",
  );
  const objectiveProgress = makeProgress("Objective progress");
  const objectiveProgressLabel = createElement("span", "objective-panel__progress-label", "Not begun");
  const objectiveWhy = createElement("p", "objective-panel__why");
  const fieldReadout = createElement("div", "field-readout");
  fieldReadout.setAttribute(
    "aria-label",
    "Current terrain, water depth, stamina cost, field tools, Wayknots, and Tide Harps",
  );
  const fieldHeader = createElement("span", "field-readout__header");
  fieldHeader.append(createElement("span", "field-readout__symbol", "⌖"));
  const fieldTerrain = createElement("strong", "field-readout__terrain", "Uncharted ground");
  fieldHeader.append(fieldTerrain);
  const fieldMetrics = createElement("span", "field-readout__metrics");
  const fieldDepth = createElement("span", "field-readout__depth", "Depth unsounded");
  const fieldEffort = createElement("span", "field-readout__effort", "Normal stamina use");
  fieldMetrics.append(fieldDepth, fieldEffort);
  const fieldTools = createElement("span", "field-readout__tools", "FIELD KIT · Sounding line");
  const fieldWayknots = createElement("div", "field-readout__wayknots");
  const fieldWayknotCount = createElement(
    "strong",
    "field-readout__wayknot-count",
    "WAYKNOTS · 0 / 0 deployed",
  );
  const fieldWayknotActive = createElement(
    "span",
    "field-readout__wayknot-active",
    "No Wayknot active here",
  );
  fieldWayknots.setAttribute("role", "group");
  fieldWayknots.append(fieldWayknotCount, fieldWayknotActive);
  const fieldTideHarps = createElement(
    "div",
    "field-readout__wayknots field-readout__tide-harps",
  );
  const fieldTideHarpCount = createElement(
    "strong",
    "field-readout__wayknot-count field-readout__tide-harp-count",
    "TIDE HARPS · 0 tuned",
  );
  const fieldTideHarpActive = createElement(
    "span",
    "field-readout__wayknot-active field-readout__tide-harp-active",
    "Tune one: Reed + Anchor + Wind in a compact triangle",
  );
  fieldTideHarps.setAttribute("role", "group");
  fieldTideHarps.append(fieldTideHarpCount, fieldTideHarpActive);
  const fieldHint = createElement("span", "field-readout__hint", "Pulse Space to sound nearby water.");
  const fieldSweep = makeProgress("Legacy swept phase");
  fieldSweep.classList.add("field-readout__sweep");
  fieldSweep.hidden = true;
  fieldReadout.append(
    fieldHeader,
    fieldMetrics,
    fieldTools,
    fieldWayknots,
    fieldTideHarps,
    fieldHint,
    fieldSweep,
  );
  const choirReadout = createElement("div", "choir-readout");
  choirReadout.setAttribute("aria-label", "Tide Choir survey progress");
  const choirHeader = createElement("span", "choir-readout__header");
  choirHeader.append(createElement("span", "choir-readout__symbol", "⌁"));
  const choirLabel = createElement("span", "choir-readout__label", "No strands heard yet");
  choirHeader.append(choirLabel);
  const choirProgress = makeProgress("Tide Choir phrase progress");
  const choirHint = createElement("span", "choir-readout__hint", "Travel between harbors along a corridor to survey it.");
  choirReadout.append(choirHeader, choirProgress, choirHint);
  objectivePanel.append(
    objectiveEyebrow,
    objectiveTitle,
    objectiveDescription,
    objectiveProgress,
    objectiveProgressLabel,
    objectiveWhy,
    fieldReadout,
    choirReadout,
  );

  const contractDetails = createElement("details", "contract-rail glass-panel");
  contractDetails.id = MOBILE_PROMISES_PANEL_ID;
  contractDetails.open = true;
  const contractSummary = createElement("summary", "panel-summary");
  contractSummary.append(createElement("span", "panel-summary__title", "Promises"));
  const contractCount = createElement("span", "panel-summary__count", "0");
  contractSummary.append(contractCount);
  const contractList = createElement("ol", "contract-list");
  contractList.tabIndex = 0;
  contractList.setAttribute("aria-label", "Scrollable list of available and active promises");
  const contractGuide = createElement(
    "p",
    "contract-rail__guide",
    "Cargo promises: go to PICK UP, carry the goods, then DELIVER. Stock reports are separate information errands.",
  );
  contractDetails.append(contractSummary, contractGuide, contractList);

  const inspector = createElement("aside", "settlement-inspector glass-panel");
  inspector.id = MOBILE_INSPECTOR_PANEL_ID;
  inspector.setAttribute("aria-labelledby", "settlement-inspector-title");
  inspector.hidden = true;
  const inspectorHeader = createElement("header", "inspector-header");
  const inspectorHeading = createElement("div", "inspector-heading");
  const inspectorSubtitle = createElement("p", "panel-eyebrow", "Settlement");
  const inspectorTitle = createElement("h2", "inspector-title", "No shore selected");
  inspectorTitle.id = "settlement-inspector-title";
  inspectorHeading.append(inspectorSubtitle, inspectorTitle);
  const inspectorClose = createButton("icon-button", "×", "Close settlement inspector");
  inspectorHeader.append(inspectorHeading, inspectorClose);
  const inspectorFacts = createElement("div", "inspector-facts");
  const inspectorStatus = createElement("span", "status-chip", "● Steady");
  const inspectorPopulation = createElement("span", "fact-chip", "0 people");
  const inspectorVerified = createElement("span", "fact-chip fact-chip--age", "Unverified");
  inspectorFacts.append(inspectorStatus, inspectorPopulation, inspectorVerified);
  const inspectorSummary = createElement("p", "inspector-summary");
  const inspectorMetrics = createElement("dl", "metric-grid");
  const inspectorStockHeading = createElement("h3", "inspector-section-title", "Useful stocks");
  const inspectorStocks = createElement("ul", "stock-list");
  const inspectorResidentHeading = createElement("h3", "inspector-section-title", "People to know");
  const inspectorResidents = createElement("ul", "resident-list");
  const inspectorConnectionHeading = createElement("h3", "inspector-section-title", "Connections");
  const inspectorConnections = createElement("ul", "connection-list");
  const inspectorReportHeading = createElement(
    "h3",
    "inspector-section-title inspector-section-title--reports",
    "Signed reports · information only",
  );
  const inspectorReportGuide = createElement(
    "p",
    "inspector-section-note",
    "Reports carry a witnessed stock count in one document slot. They do not pick up or move cargo; physical deliveries are listed in Promises.",
  );
  const inspectorReports = createElement("ul", "report-list");
  inspectorReports.setAttribute("aria-label", "Signed information report destinations");
  const inspectorFocus = createButton("text-button text-button--primary", "Focus on map");
  inspector.append(
    inspectorHeader,
    inspectorFacts,
    inspectorSummary,
    inspectorMetrics,
    inspectorStockHeading,
    inspectorStocks,
    inspectorResidentHeading,
    inspectorResidents,
    inspectorConnectionHeading,
    inspectorConnections,
    inspectorReportHeading,
    inspectorReportGuide,
    inspectorReports,
    inspectorFocus,
  );

  const residentAbout = createElement("aside", "resident-about");
  residentAbout.hidden = true;
  residentAbout.setAttribute("role", "region");
  residentAbout.setAttribute("aria-labelledby", "resident-about-title");
  residentAbout.setAttribute(
    "aria-describedby",
    "resident-about-identity resident-about-quick",
  );
  const residentAboutHeader = createElement("header", "resident-about__header");
  const residentAboutHeading = createElement("div", "resident-about__heading");
  residentAboutHeading.append(createElement("p", "resident-about__eyebrow", "ABOUT"));
  const residentAboutTitle = createElement("h2", "resident-about__title", "Someone nearby");
  residentAboutTitle.id = "resident-about-title";
  const residentAboutIdentity = createElement("p", "resident-about__identity");
  residentAboutIdentity.id = "resident-about-identity";
  const residentAboutQuick = createElement("p", "resident-about__quick");
  residentAboutQuick.id = "resident-about-quick";
  residentAboutQuick.hidden = true;
  residentAboutHeading.append(residentAboutTitle, residentAboutIdentity, residentAboutQuick);
  const residentAboutClose = createButton(
    "resident-about__close",
    "×",
    "Close ABOUT details",
  );
  residentAboutHeader.append(residentAboutHeading, residentAboutClose);
  const residentAboutBody = createElement("div", "resident-about__body");
  residentAboutBody.tabIndex = 0;
  residentAboutBody.setAttribute("aria-label", "Scrollable ABOUT details");
  const residentAboutKnowledge = createElement("span", "resident-about__knowledge", "Unfamiliar");
  const residentAboutObservedHeading = createElement("h3", "resident-about__section-title", "OBSERVED");
  const residentAboutObserved = createElement("dl", "resident-about__facts");
  const residentAboutKnownHeading = createElement("h3", "resident-about__section-title", "KNOWN");
  const residentAboutKnown = createElement("dl", "resident-about__facts");
  const residentAboutActions = createElement("div", "resident-about__actions");
  const residentAboutGreet = createButton("resident-about__greet", "GREET");
  const residentAboutLivingActions = createElement(
    "div",
    "resident-about__living-actions",
  );
  const residentAboutActionHint = createElement("p", "resident-about__action-hint");
  residentAboutActionHint.id = "resident-about-action-hint";
  residentAboutActionHint.hidden = true;
  residentAboutActions.append(
    residentAboutActionHint,
    residentAboutGreet,
    residentAboutLivingActions,
  );
  residentAboutBody.append(
    residentAboutKnowledge,
    residentAboutObservedHeading,
    residentAboutObserved,
    residentAboutKnownHeading,
    residentAboutKnown,
  );
  residentAbout.append(
    residentAboutHeader,
    residentAboutBody,
    residentAboutActions,
  );

  const chronicleDetails = createElement("details", "chronicle-panel glass-panel");
  const chronicleSummary = createElement("summary", "panel-summary");
  chronicleSummary.append(createElement("span", "panel-summary__title", "EVENTS"));
  const chronicleCount = createElement("span", "panel-summary__count", "0");
  chronicleSummary.append(chronicleCount);
  const chroniclePreview = createElement("span", "chronicle-preview", "Nothing seen or heard yet.");
  chronicleSummary.append(chroniclePreview);
  const chronicleList = createElement("ol", "chronicle-list");
  chronicleList.setAttribute("aria-label", "Events the courier saw, heard, or directly caused");
  chronicleDetails.append(chronicleSummary, chronicleList);

  const actionDock = createElement("nav", "action-dock glass-panel");
  actionDock.setAttribute("aria-label", "Journey actions");
  const scanButton = createButton("action-button action-button--scan", "Sound / Scan", "Pulse the Loom to reveal terrain and water depth");
  scanButton.append(createElement("kbd", "keycap", "Space"));
  const interactButton = createButton("action-button action-button--interact", "Interact");
  interactButton.append(createElement("kbd", "keycap", "E"));
  const wayknotButton = createButton(
    "action-button action-button--wayknot",
    "",
    "Place or reclaim a reusable Wayknot",
  );
  const wayknotButtonLabel = createElement("span", "action-button__label", "Place Wayknot");
  wayknotButton.setAttribute("aria-keyshortcuts", WAYKNOT_KEY_SHORTCUT);
  wayknotButton.append(
    wayknotButtonLabel,
    createElement("kbd", "keycap", WAYKNOT_KEY_SHORTCUT),
  );
  const braceButton = createButton(
    "action-button brace-button",
    "BRACE",
    "Hold to brace. Trades travel speed for stability and protects fragile cargo.",
  );
  braceButton.setAttribute("aria-pressed", "false");
  const kitButton = createButton(
    "icon-button icon-button--labeled kit-button",
    "KIT",
    "Open KIT inventory. The world continues while it is open.",
  );
  kitButton.setAttribute("aria-keyshortcuts", "I");
  kitButton.setAttribute("aria-haspopup", "dialog");
  kitButton.setAttribute("aria-controls", KIT_DIALOG_ID);
  kitButton.setAttribute("aria-expanded", "false");
  const quietButton = createButton(
    "icon-button icon-button--labeled quiet-button",
    "",
    "Open Quiet Hour to save, review, or return to the title",
  );
  const quietDesktopLabel = createElement("span", "quiet-button__desktop", "Quiet Hour");
  const quietMobileLabel = createElement("span", "quiet-button__mobile", "☾");
  quietMobileLabel.setAttribute("aria-hidden", "true");
  quietButton.append(quietDesktopLabel, quietMobileLabel);
  const titleButton = createButton("icon-button title-menu-button", "⌂", "Open title and world menu");
  const helpButton = createButton("icon-button tutorial-button", "", "Open the complete tutorial");
  helpButton.setAttribute("aria-keyshortcuts", "T");
  const tutorialDesktopGlyph = createElement("span", "tutorial-button__desktop", "T");
  const tutorialMobileGlyph = createElement("span", "tutorial-button__mobile", "?");
  tutorialMobileGlyph.setAttribute("aria-hidden", "true");
  helpButton.append(tutorialDesktopGlyph, tutorialMobileGlyph);
  actionDock.append(
    scanButton,
    interactButton,
    braceButton,
    wayknotButton,
    kitButton,
    quietButton,
    titleButton,
    helpButton,
  );

  const titleDialog = createElement("dialog", "title-dialog estuary-dialog");
  titleDialog.setAttribute("aria-labelledby", "title-dialog-heading");
  const titleBackdrop = createElement("div", "title-dialog__backdrop");
  titleBackdrop.setAttribute("aria-hidden", "true");
  const titleAtmosphereCanvas = createElement("canvas", "title-atmosphere");
  titleBackdrop.append(titleAtmosphereCanvas);
  const titleContent = createElement("div", "title-dialog__content");
  const titleHeading = createElement("h1", "title-dialog__heading", TITLE_SURFACE_COPY.heading);
  titleHeading.id = "title-dialog-heading";
  const titleSaveWarning = createSaveWarningBanner("title");
  const continueButton = createButton("continue-card", "");
  const continueKicker = createElement("span", "continue-card__kicker", "Return to");
  const continueName = createElement("strong", "continue-card__name", "Your estuary");
  const continueSummary = createElement("span", "continue-card__summary", "No offline loss. The tide waits here.");
  continueButton.append(continueKicker, continueName, continueSummary);

  const restartForm = createElement("form", "restart-form");
  restartForm.setAttribute("aria-label", "Unlock a deliberate world restart");
  const restartHeading = createElement("h2", "new-world-form__heading", "Begin again");
  const restartLabel = createElement(
    "label",
    "field-label",
    `Type ${RESTART_PHRASE} to unlock a new seed`,
  );
  restartLabel.htmlFor = "restart-phrase";
  const restartInput = createElement("input", "seed-input restart-input");
  restartInput.id = "restart-phrase";
  restartInput.name = "restart-phrase";
  restartInput.type = "text";
  restartInput.maxLength = RESTART_PHRASE.length + 8;
  restartInput.autocomplete = "off";
  restartInput.spellcheck = false;
  restartInput.setAttribute("autocapitalize", "none");
  restartInput.setAttribute("autocorrect", "off");
  restartInput.setAttribute("enterkeyhint", "next");
  restartInput.setAttribute("aria-invalid", "false");
  restartInput.placeholder = "The current estuary stays safe until this matches";
  const restartStatus = createElement(
    "p",
    "restart-form__status",
    RESTART_LOCKED_STATUS,
  );
  restartStatus.id = "restart-status";
  restartStatus.setAttribute("role", "status");
  restartStatus.setAttribute("aria-live", "polite");
  restartStatus.setAttribute("aria-atomic", "true");
  restartInput.setAttribute("aria-describedby", restartStatus.id);
  const restartButton = createButton(
    "text-button text-button--wide restart-form__submit",
    "Unlock restart",
  );
  restartButton.type = "submit";
  restartForm.append(restartHeading, restartLabel, restartInput, restartStatus, restartButton);

  const newWorldForm = createElement("form", "new-world-form");
  newWorldForm.setAttribute("aria-label", "Begin a new estuary");
  const seedLabel = createElement("label", "field-label", TITLE_SURFACE_COPY.seed);
  seedLabel.htmlFor = "world-seed";
  const seedInput = createElement("input", "seed-input");
  seedInput.id = "world-seed";
  seedInput.name = "seed";
  seedInput.type = "text";
  seedInput.maxLength = 64;
  seedInput.autocomplete = "off";
  seedInput.spellcheck = false;
  seedInput.setAttribute("autocapitalize", "none");
  seedInput.setAttribute("autocorrect", "off");
  seedInput.setAttribute("enterkeyhint", "go");
  seedInput.setAttribute("aria-invalid", "false");
  seedInput.placeholder = "Leave blank for quiet-delta";

  const seedStatus = createElement("p", "new-world-form__status");
  seedStatus.id = "world-seed-status";
  seedStatus.hidden = true;
  seedStatus.setAttribute("role", "status");
  seedStatus.setAttribute("aria-live", "polite");
  seedStatus.setAttribute("aria-atomic", "true");
  seedInput.setAttribute("aria-describedby", seedStatus.id);

  const beginButton = createButton("text-button text-button--primary text-button--wide", TITLE_SURFACE_COPY.start);
  beginButton.type = "submit";
  newWorldForm.append(seedLabel, seedInput, seedStatus, beginButton);
  const titlePatchNotes = createButton(
    "text-button text-button--wide patch-notes-trigger",
    TITLE_SURFACE_COPY.patchNotes,
    "Open offline Patch Notes from the title",
  );
  titlePatchNotes.setAttribute("aria-haspopup", "dialog");
  titlePatchNotes.setAttribute("aria-controls", PATCH_NOTES_DIALOG_ID);
  titleContent.append(
    titleHeading,
    titleSaveWarning.element,
    continueButton,
    restartForm,
    newWorldForm,
    titlePatchNotes,
  );
  titleDialog.append(titleBackdrop, titleContent);

  const quietDialog = createElement("dialog", "quiet-dialog estuary-dialog");
  quietDialog.setAttribute("aria-labelledby", "quiet-hour-heading");
  const quietContent = createElement("div", "quiet-dialog__content");
  quietContent.append(createElement("p", "panel-eyebrow", "A place to stop without losing the thread"));
  const quietTitle = createElement("h2", "quiet-dialog__title", "Quiet Hour");
  quietTitle.id = "quiet-hour-heading";
  const quietSummary = createElement("p", "quiet-dialog__summary", "The estuary is ready to remember this session.");
  const quietSaveWarning = createSaveWarningBanner("quiet-hour");
  const quietStats = createElement("dl", "quiet-stats");
  const quietDuration = createElement("span");
  const quietDistance = createElement("span");
  const quietDeliveries = createElement("span");
  const quietStrands = createElement("span");
  const quietStatPairs: ReadonlyArray<[string, HTMLSpanElement]> = [
    ["Time together", quietDuration],
    ["Distance carried", quietDistance],
    ["Promises kept", quietDeliveries],
    ["New strand", quietStrands],
  ];
  for (const [label, value] of quietStatPairs) {
    const wrapper = createElement("div", "quiet-stat");
    wrapper.append(createElement("dt", "quiet-stat__label", label));
    const data = createElement("dd", "quiet-stat__value");
    data.append(value);
    wrapper.append(data);
    quietStats.append(wrapper);
  }
  const quietChangesHeading = createElement("h3", "quiet-dialog__changes-heading", "What changed this session");
  const quietChanges = createElement("ul", "quiet-change-list");
  const quietQuote = createElement("q", "quiet-dialog__quote");
  const quietActions = createElement("div", "dialog-actions");
  const quietContinue = createButton("text-button", "One more tide");
  const quietFinish = createButton("text-button text-button--primary", "Rest here");
  const quietPatchNotes = createButton(
    "text-button patch-notes-trigger",
    "PATCH NOTES",
    "Open offline Patch Notes from Quiet Hour",
  );
  quietPatchNotes.setAttribute("aria-haspopup", "dialog");
  quietPatchNotes.setAttribute("aria-controls", PATCH_NOTES_DIALOG_ID);
  quietActions.append(quietPatchNotes, quietContinue, quietFinish);
  quietContent.append(
    quietTitle,
    quietSummary,
    quietSaveWarning.element,
    quietStats,
    quietChangesHeading,
    quietChanges,
    quietQuote,
    quietActions,
  );
  quietDialog.append(quietContent);

  let tutorial: TutorialDialogController;
  const patchNotes = createPatchNotesDialog({
    beforeOpen: (source) => {
      if (source === "title") syncDialog(titleDialog, false);
      if (source === "quiet-hour") syncDialog(quietDialog, false);
      if (source === "tutorial") tutorial.suspend();
    },
    afterClose: (source) => {
      if (source === "title") syncDialog(titleDialog, true);
      if (source === "quiet-hour") syncDialog(quietDialog, true);
      if (source === "tutorial") tutorial.resume();
    },
  });
  tutorial = createTutorialDialog({
    onOpenPatchNotes: (trigger) => patchNotes.open(trigger, "tutorial"),
  });
  const kit = createKitDialog({
    dispatch: options.dispatch,
    onOpenChange: (open) => {
      const expanded = open ? "true" : "false";
      kitButton.setAttribute("aria-expanded", expanded);
      mobileKitButton.setAttribute("aria-expanded", expanded);
    },
  });
  const tutorialSaveWarning = createSaveWarningBanner("tutorial");
  const patchNotesSaveWarning = createSaveWarningBanner("patch-notes");
  const kitSaveWarning = createSaveWarningBanner("kit");
  const modalWarningMounts: ReadonlyArray<[
    HTMLDialogElement,
    string,
    SaveWarningBannerRefs,
  ]> = [
    [tutorial.element, ".tutorial-dialog__header", tutorialSaveWarning],
    [patchNotes.element, ".patch-notes-dialog__header", patchNotesSaveWarning],
    [kit.element, ".kit-dialog__header", kitSaveWarning],
  ];
  for (const [dialog, selector, banner] of modalWarningMounts) {
    const header = dialog.querySelector<HTMLElement>(selector);
    if (!header) throw new Error(`TIDEWEFT could not mount save health in ${selector}.`);
    header.append(banner.element);
  }
  const saveWarningBanners = {
    field: fieldSaveWarning,
    title: titleSaveWarning,
    "quiet-hour": quietSaveWarning,
    tutorial: tutorialSaveWarning,
    "patch-notes": patchNotesSaveWarning,
    kit: kitSaveWarning,
  } as const satisfies Readonly<Record<SaveWarningSurface, SaveWarningBannerRefs>>;

  const leftRail = createElement("div", "left-rail");
  leftRail.id = "field-hud-panels";
  leftRail.append(objectivePanel, contractDetails);

  shell.append(
    fieldSaveWarning.element,
    topbar,
    desktopFieldLine,
    mobileFieldStrip,
    leftRail,
    inspector,
    residentAbout,
    chronicleDetails,
    actionDock,
    titleDialog,
    quietDialog,
    tutorial.element,
    patchNotes.element,
    kit.element,
  );
  options.root.replaceChildren(shell);

  return {
    shell,
    saveWarningBanners: SAVE_WARNING_SURFACES.map((surface) => saveWarningBanners[surface]),
    mobileFieldStrip,
    mobileHudToggle,
    mobileKitButton,
    mobileObjective,
    mobileStamina,
    mobileStaminaValue,
    mobileStability,
    mobileStabilityValue,
    mobileLoom,
    mobileLoomValue,
    mobileCargo,
    mobileCargoValue,
    mobileSafety,
    mobileTerrain,
    mobileActions,
    mobileNavigation,
    desktopFieldLine,
    desktopFieldTerrain,
    desktopFieldSafety,
    desktopFieldNavigation,
    worldName,
    clockDay,
    clockTime,
    tideReadout,
    tideSymbol: tideSymbolElement,
    tideLabel: tideLabelElement,
    tideProgress,
    tideNext,
    weatherReadout,
    weatherSymbol: weatherSymbolElement,
    weatherLabel: weatherLabelElement,
    weatherForecast,
    location,
    navigation,
    stamina,
    stability,
    stabilityDetail,
    scanCharge,
    cargo,
    cargoLabel,
    objectivePanel,
    objectiveEyebrow,
    objectiveTitle,
    objectiveDescription,
    objectiveProgress,
    objectiveProgressLabel,
    objectiveWhy,
    fieldReadout,
    fieldTerrain,
    fieldDepth,
    fieldEffort,
    fieldTools,
    fieldWayknots,
    fieldWayknotCount,
    fieldWayknotActive,
    fieldTideHarps,
    fieldTideHarpCount,
    fieldTideHarpActive,
    fieldHint,
    fieldSweep,
    choirReadout,
    choirLabel,
    choirProgress,
    choirHint,
    contractDetails,
    contractSummary,
    contractCount,
    contractList,
    inspector,
    inspectorTitle,
    inspectorSubtitle,
    inspectorStatus,
    inspectorPopulation,
    inspectorVerified,
    inspectorSummary,
    inspectorMetrics,
    inspectorStocks,
    inspectorResidents,
    inspectorConnections,
    inspectorReports,
    inspectorFocus,
    inspectorClose,
    residentAbout,
    residentAboutTitle,
    residentAboutIdentity,
    residentAboutQuick,
    residentAboutBody,
    residentAboutKnowledge,
    residentAboutObservedHeading,
    residentAboutObserved,
    residentAboutKnownHeading,
    residentAboutKnown,
    residentAboutClose,
    residentAboutActions,
    residentAboutGreet,
    residentAboutLivingActions,
    residentAboutActionHint,
    chronicleDetails,
    chronicleSummary,
    chronicleCount,
    chroniclePreview,
    chronicleList,
    scanButton,
    interactButton,
    wayknotButton,
    wayknotButtonLabel,
    braceButton,
    kitButton,
    quietButton,
    titleButton,
    helpButton,
    titleDialog,
    titleAtmosphereCanvas,
    continueButton,
    continueName,
    continueSummary,
    restartForm,
    restartInput,
    restartButton,
    restartStatus,
    newWorldForm,
    seedInput,
    seedStatus,
    beginButton,
    quietDialog,
    quietTitle,
    quietSummary,
    quietDuration,
    quietDistance,
    quietDeliveries,
    quietStrands,
    quietChanges,
    quietQuote,
    quietFinish,
    quietContinue,
    titlePatchNotes,
    quietPatchNotes,
    tutorial,
    patchNotes,
    kit,
  };
};

export function createTideweftUI(options: TideweftUIOptions): TideweftUIController {
  const refs = buildShell(options);
  const mobileBrace = bindMobileBraceHold({
    button: refs.braceButton,
    documentTarget: document,
    windowTarget: window,
    onBraceChange: options.setBrace,
  });
  const announcer = options.announcer ?? document.getElementById("announcer") ?? createElement("div", "visually-hidden");
  if (!announcer.isConnected) {
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    options.root.append(announcer);
  }

  let latestView: TideweftUIView | null = null;
  let lastRevision = "";
  let lastContracts = "";
  let lastSignedReportActions = "";
  let lastChronicle = "";
  let lastResidentAbout = "__unrendered__";
  let lastAnnouncement = "";
  let lastNavigationCopy = "";
  let lastMobileNavigationCopy = "";
  let lastNavigationTitle = "";
  let lastUnderfootWorldName = "";
  let forcedTitle: boolean | null = null;
  let forcedQuietHour: boolean | null = null;
  let contractPointerActive = false;
  let signedReportPointerActive = false;
  let selectedInspectorId: string | null = null;
  let selectedActorAboutKey: string | null = null;
  let renderedActorAboutKey: string | null = null;
  let residentReturnFocus: HTMLElement | null = null;
  let running = false;
  let frameHandle: number | null = null;
  const underfootTerrain = createUnderfootTerrainStabilizer();

  const releaseContractPointer = (): void => {
    window.setTimeout(() => {
      contractPointerActive = false;
    }, 0);
  };

  const cancelContractPointer = (): void => {
    contractPointerActive = false;
  };

  const releaseSignedReportPointer = (): void => {
    window.setTimeout(() => {
      signedReportPointerActive = false;
    }, 0);
  };

  const cancelSignedReportPointer = (): void => {
    signedReportPointerActive = false;
  };

  const announce = (message: string, assertive = false): void => {
    announcer.setAttribute("aria-live", assertive ? "assertive" : "polite");
    announcer.textContent = "";
    window.setTimeout(() => {
      announcer.textContent = message;
    }, 20);
  };

  const titleAtmosphere = bindTitleAtmosphere({
    canvas: refs.titleAtmosphereCanvas,
    host: refs.titleDialog,
    ...(options.playTitleCrescendo
      ? { playCrescendo: options.playTitleCrescendo }
      : {}),
  });

  const restartFlow = bindTitleRestartFlow({
    elements: {
      restartForm: refs.restartForm,
      restartInput: refs.restartInput,
      restartButton: refs.restartButton,
      restartStatus: refs.restartStatus,
      newWorldForm: refs.newWorldForm,
      seedInput: refs.seedInput,
      seedStatus: refs.seedStatus,
      beginButton: refs.beginButton,
    },
    getTitle: () => latestView?.title ?? null,
    dispatch: options.dispatch,
    announce,
  });

  const setMobileHudExpanded = (expanded: boolean): void => {
    const sheet = refs.shell.dataset.mobileSheet === "inspector" ? "inspector" : "promises";
    const disclosure = mobileHudDisclosureState(expanded, sheet);
    refs.shell.dataset.mobileHudExpanded = disclosure.ariaExpanded;
    refs.mobileHudToggle.setAttribute("aria-expanded", disclosure.ariaExpanded);
    refs.mobileHudToggle.setAttribute("aria-controls", disclosure.ariaControls);
    refs.mobileHudToggle.setAttribute("aria-label", disclosure.accessibleLabel);
    refs.mobileHudToggle.textContent = disclosure.visibleLabel;
  };

  const openKit = (tab: KitTabId = "pack", trigger?: HTMLElement | null): void => {
    mobileBrace.release();
    if (refs.titleDialog.open || refs.quietDialog.open || refs.patchNotes.isOpen()) return;
    refs.tutorial.close(false);
    setMobileHudExpanded(false);
    refs.kit.open(tab, trigger);
  };

  const toggleKit = (tab: KitTabId = "pack", trigger?: HTMLElement | null): void => {
    mobileBrace.release();
    if (refs.kit.isOpen()) {
      refs.kit.close();
      return;
    }
    openKit(tab, trigger);
  };

  const openHelp = (trigger?: HTMLElement | null): void => {
    mobileBrace.release();
    if (refs.patchNotes.isOpen()) return;
    refs.kit.close(false);
    setMobileHudExpanded(false);
    refs.tutorial.open(trigger);
  };

  const toggleHelp = (trigger?: HTMLElement | null): void => {
    if (refs.tutorial.element.open) {
      refs.tutorial.close();
      return;
    }
    openHelp(trigger);
  };

  const closeFieldDialogs = (): void => {
    mobileBrace.release();
    refs.kit.close(false);
    refs.tutorial.close(false);
  };

  const openPatchNotes = (
    trigger?: HTMLElement | null,
    source: PatchNotesOpenSource = "field",
  ): void => {
    mobileBrace.release();
    refs.kit.close(false);
    setMobileHudExpanded(false);
    const titlePresented = latestView
      ? forcedTitle ?? latestView.title.visible
      : forcedTitle ?? false;
    titleAtmosphere.sync(titlePresented, false);
    const resolvedSource = source !== "field"
      ? source
      : refs.titleDialog.open
        ? "title"
        : refs.quietDialog.open
          ? "quiet-hour"
          : refs.tutorial.element.open
            ? "tutorial"
            : "field";
    refs.patchNotes.open(trigger, resolvedSource);
  };

  const renderSaveWarning = (warning: SaveWarningUIView | undefined): void => {
    const presentation = saveWarningPresentation(warning);
    for (const banner of refs.saveWarningBanners) {
      banner.element.hidden = presentation.hidden;
      banner.element.dataset.warningId = presentation.id;
      banner.element.dataset.tone = presentation.tone;
      banner.message.textContent = presentation.message;
      banner.detail.textContent = presentation.detail;
    }
  };

  const renderContracts = (contracts: readonly ContractUIView[]): void => {
    const signature = contractSignature(contracts);
    if (signature === lastContracts) return;
    // Never replace a button between pointer-down and click. Live ETA/progress
    // values are deliberately absent from the structural signature, so cards
    // otherwise update only when their actionable state actually changes.
    if (lastContracts !== "" && contractPointerActive) return;
    lastContracts = signature;
    refs.contractList.replaceChildren();
    refs.contractCount.textContent = String(contracts.length);
    refs.contractSummary.setAttribute(
      "aria-label",
      `${contracts.length} ${contracts.length === 1 ? "promise" : "promises"}`,
    );

    if (contracts.length === 0) {
      const empty = createElement("li", "empty-state");
      empty.append(createElement("strong", "empty-state__title", "No promises waiting"));
      empty.append(createElement("span", "empty-state__copy", "Listen at a settlement or let the tide turn."));
      refs.contractList.append(empty);
      return;
    }

    for (const contract of contracts) {
      const item = createElement("li", "contract-list__item");
      const article = createElement("article", "contract-card");
      article.dataset.mood = contract.mood;
      article.dataset.status = contract.status;
      if (contract.selected) article.dataset.selected = "true";

      const inspectButton = createButton(
        "contract-card__inspect",
        "",
        `Inspect ${contract.title}, from ${contract.origin} to ${contract.destination}`,
      );
      inspectButton.setAttribute("aria-pressed", contract.selected ? "true" : "false");
      const header = createElement("span", "contract-card__header");
      header.append(createElement("span", "contract-card__mood", contract.mood));
      header.append(createElement("span", "contract-card__status", contract.status));
      const title = createElement("strong", "contract-card__title", contract.title);
      const requester = contract.requester
        ? createElement("span", "contract-card__requester", contract.requester)
        : undefined;
      const summary = createElement("span", "contract-card__summary", contract.summary);
      const route = createElement("span", "contract-card__route");
      const pickup = createElement("span", "contract-card__route-stop contract-card__route-stop--pickup");
      pickup.append(createElement("span", "contract-card__route-verb", "PICK UP"));
      pickup.append(createElement("span", "contract-card__origin", contract.origin));
      const delivery = createElement("span", "contract-card__route-stop contract-card__route-stop--delivery");
      delivery.append(createElement("span", "contract-card__route-verb", "DELIVER"));
      delivery.append(createElement("span", "contract-card__destination", contract.destination));
      route.append(pickup);
      route.append(createElement("span", "contract-card__arrow", "→"));
      route.append(delivery);
      const cargo = createElement("span", "contract-card__cargo");
      cargo.append(createElement("span", "contract-card__cargo-symbol", "◇"));
      cargo.append(createElement("span", "contract-card__cargo-label", contract.cargoLabel));
      if (contract.cargoProperty && contract.cargoProperty !== "ordinary") {
        cargo.append(createElement("span", "property-chip", contract.cargoProperty));
      }
      if (contract.eta) cargo.append(createElement("span", "contract-card__eta", contract.eta));
      inspectButton.append(header, title);
      if (requester) inspectButton.append(requester);
      inspectButton.append(summary, route, cargo);
      if (contract.forecast) {
        inspectButton.append(createElement("span", "contract-card__forecast", contract.forecast));
      }
      if (contract.masteryHint) {
        inspectButton.append(createElement("span", "contract-card__mastery", contract.masteryHint));
      }
      inspectButton.addEventListener("click", () => {
        options.dispatch({ type: "contract", action: "inspect", contractId: contract.id });
      });

      article.append(inspectButton);
      if (contract.progress !== undefined) {
        const progress = makeProgress(`${contract.title} progress`);
        setProgress(progress, contract.progress);
        progress.classList.add("contract-card__progress");
        article.append(progress);
      }
      if (contract.consequence) {
        const consequence = createElement("p", "contract-card__consequence", contract.consequence);
        article.append(consequence);
      }

      const action = contractAction(contract.status);
      if (action) {
        const actionButton = createButton(
          "contract-card__action text-button",
          contract.actionLabel ?? defaultContractActionLabel(contract.status),
        );
        actionButton.disabled = Boolean(contract.disabled);
        actionButton.addEventListener("click", () => {
          options.dispatch({ type: "contract", action, contractId: contract.id });
        });
        article.append(actionButton);
      }
      item.append(article);
      refs.contractList.append(item);
    }
  };

  const renderInspector = (settlement: SettlementInspectorUIView | undefined): void => {
    refs.inspector.hidden = !settlement;
    if (!settlement) return;
    refs.inspector.dataset.status = settlement.status;
    refs.inspector.dataset.settlementId = settlement.id;
    refs.inspectorTitle.textContent = settlement.name;
    refs.inspectorSubtitle.textContent = settlement.subtitle ?? "Settlement";
    refs.inspectorStatus.textContent = `${statusSymbol(settlement.status)} ${settlement.statusLabel}`;
    refs.inspectorStatus.dataset.status = settlement.status;
    refs.inspectorPopulation.textContent = `${settlement.population} ${settlement.population === 1 ? "person" : "people"}`;
    refs.inspectorVerified.textContent = settlement.lastVerified;
    refs.inspectorSummary.textContent = settlement.summary;

    refs.inspectorMetrics.replaceChildren();
    for (const metric of settlement.metrics) {
      const wrapper = createElement("div", "metric");
      wrapper.dataset.tone = metric.tone ?? "neutral";
      const term = createElement("dt", "metric__label", metric.label);
      const data = createElement("dd", "metric__value");
      const progress = makeProgress(metric.label);
      progress.dataset.tone = metric.tone ?? "neutral";
      setProgress(progress, metric.value, metric.valueLabel);
      data.append(progress, createElement("span", "metric__value-label", metric.valueLabel));
      wrapper.append(term, data);
      refs.inspectorMetrics.append(wrapper);
    }

    refs.inspectorStocks.replaceChildren();
    for (const stock of settlement.stocks) {
      const item = createElement("li", "stock-item");
      item.dataset.trend = stock.trend;
      if (stock.critical) item.dataset.critical = "true";
      const symbol = stock.trend === "rising" ? "↑" : stock.trend === "falling" ? "↓" : "→";
      const trendLabel = stock.trend === "rising" ? "rising" : stock.trend === "falling" ? "falling" : "steady";
      item.append(createElement("span", "stock-item__name", stock.label));
      item.append(createElement("span", "stock-item__amount", stock.amountLabel));
      const trend = createElement("span", "stock-item__trend", `${symbol} ${trendLabel}`);
      item.append(trend);
      refs.inspectorStocks.append(item);
    }

    refs.inspectorResidents.replaceChildren();
    for (const resident of settlement.residents) {
      const item = createElement("li", "resident-item");
      const initial = resident.name.trim().charAt(0).toLocaleUpperCase() || "·";
      item.append(createElement("span", "resident-item__initial", initial));
      const copy = createElement("span", "resident-item__copy");
      copy.append(createElement("strong", "resident-item__name", resident.name));
      copy.append(createElement("span", "resident-item__role", resident.role));
      item.append(copy);
      if (resident.state) item.append(createElement("span", "resident-item__state", resident.state));
      refs.inspectorResidents.append(item);
    }

    refs.inspectorConnections.replaceChildren();
    for (const connection of settlement.connections) {
      const item = createElement("li", "connection-item");
      if (connection.redundant) item.dataset.redundant = "true";
      if (connection.surveyed) item.dataset.surveyed = "true";
      if (connection.choirMember) item.dataset.choir = "true";
      const copy = createElement("span", "connection-item__copy");
      copy.append(createElement("strong", "connection-item__name", connection.settlementName));
      copy.append(createElement("span", "connection-item__condition", connection.conditionLabel));
      const progress = makeProgress(`Route reliability to ${connection.settlementName}`);
      setProgress(progress, connection.reliability);
      item.append(copy, progress);
      const actions = createElement("span", "connection-item__actions");
      if (connection.routeId && connection.settlementId && connection.actionLabel) {
        const action = createButton(
          "connection-item__action text-button",
          connection.actionLabel,
          `${connection.actionLabel} on the route to ${connection.settlementName}`,
        );
        action.disabled = Boolean(connection.actionDisabled);
        action.addEventListener("click", () => {
          options.dispatch({
            type: "strand",
            action: "reinforce",
            routeId: connection.routeId!,
            settlementId: connection.settlementId!,
          });
        });
        actions.append(action);
      }
      if (connection.actionHint) {
        actions.append(createElement("span", "connection-item__action-hint", connection.actionHint));
      }
      if (actions.childElementCount > 0) item.append(actions);
      refs.inspectorConnections.append(item);
    }

    const reportSignature = signedReportActionsSignature(settlement);
    if (shouldRefreshSignedReportActions(lastSignedReportActions, reportSignature, signedReportPointerActive)) {
      lastSignedReportActions = reportSignature;
      refs.inspectorReports.replaceChildren();
      for (const connection of settlement.connections) {
        if (!connection.settlementId || !connection.reportActionLabel) continue;
        const reportItem = createElement("li", "report-item");
        const reportCopy = createElement("span", "report-item__copy");
        reportCopy.append(
          createElement("strong", "report-item__route", `${settlement.name} → ${connection.settlementName}`),
          createElement("span", "report-item__kind", "SIGNED INFORMATION · 1 DOCUMENT SLOT · NO GOODS MOVED"),
        );
        const reportAction = createButton(
          "report-item__action text-button",
          connection.reportActionLabel,
          `${connection.reportActionLabel}. This is information, not cargo.`,
        );
        reportAction.disabled = Boolean(connection.reportActionDisabled);
        reportAction.addEventListener("click", () => {
          options.dispatch({
            type: "report",
            action: "collect",
            sourceSettlementId: connection.settlementId!,
            targetSettlementId: connection.id,
          });
        });
        reportItem.append(reportCopy, reportAction);
        if (connection.reportActionHint) {
          reportItem.append(createElement("span", "report-item__hint", connection.reportActionHint));
        }
        refs.inspectorReports.append(reportItem);
      }
    }
  };

  const renderResidentAbout = (actor: ResolvedActorAboutSurface | undefined): void => {
    const signature = actor ? JSON.stringify(actor) : "";
    if (signature === lastResidentAbout) return;
    lastResidentAbout = signature;
    const surface = residentAboutSurfaceState(actor);
    refs.residentAbout.hidden = surface.hidden;
    refs.residentAbout.dataset.modal = String(surface.modal);
    refs.residentAbout.dataset.pausesGameplay = String(surface.pausesGameplay);
    refs.shell.dataset.residentAboutOpen = actor ? "true" : "false";
    if (!actor) {
      renderedActorAboutKey = null;
      delete refs.residentAbout.dataset.species;
      return;
    }
    const actorChanged = renderedActorAboutKey !== actor.selectionKey;
    renderedActorAboutKey = actor.selectionKey;
    refs.residentAbout.dataset.species = actor.species;
    if (actorChanged) refs.residentAboutBody.scrollTop = 0;
    refs.residentAboutTitle.textContent = actor.heading;
    refs.residentAboutIdentity.textContent = actor.identityLine;
    refs.residentAboutQuick.hidden = actor.quickSummary === undefined;
    refs.residentAboutQuick.textContent = actor.quickSummary ?? "";
    refs.residentAboutKnowledge.textContent = actor.knowledgeLabel;
    refs.residentAboutKnowledge.dataset.knowledge = actor.knowledgeLabel.toLocaleLowerCase();
    const renderFacts = (
      target: HTMLDListElement,
      facts: ResolvedActorAboutSurface["observed"],
    ): void => {
      target.replaceChildren();
      for (const fact of facts) {
        const row = createElement("div", "resident-about__fact");
        row.dataset.tone = fact.tone ?? "neutral";
        row.append(
          createElement("dt", "resident-about__fact-label", fact.label),
          createElement("dd", "resident-about__fact-value", fact.value),
        );
        target.append(row);
      }
    };
    refs.residentAboutObservedHeading.hidden = actor.observed.length === 0;
    refs.residentAboutObserved.hidden = actor.observed.length === 0;
    refs.residentAboutKnownHeading.hidden = actor.known.length === 0;
    refs.residentAboutKnown.hidden = actor.known.length === 0;
    renderFacts(refs.residentAboutObserved, actor.observed);
    renderFacts(refs.residentAboutKnown, actor.known);
    const action = residentAboutActionPresentation(actor);
    refs.residentAboutActions.hidden = action.hidden && actor.interactions.length === 0;
    refs.residentAboutGreet.hidden = action.hidden;
    refs.residentAboutGreet.textContent = action.label;
    refs.residentAboutGreet.disabled = action.disabled;
    refs.residentAboutGreet.title = action.hint;
    const showDisabledReason = action.disabled && action.hint.length > 0;
    refs.residentAboutActionHint.hidden = !showDisabledReason;
    refs.residentAboutActionHint.textContent = showDisabledReason ? action.hint : "";
    if (showDisabledReason) {
      refs.residentAboutGreet.setAttribute("aria-describedby", refs.residentAboutActionHint.id);
    } else {
      refs.residentAboutGreet.removeAttribute("aria-describedby");
    }
    refs.residentAboutLivingActions.replaceChildren();
    for (const interaction of actor.interactions) {
      const wrapper = createElement("div", "resident-about__living-action");
      const button = createButton(
        "resident-about__choice",
        interaction.label,
        interaction.hint,
      );
      button.disabled = Boolean(interaction.disabled);
      button.dataset.interaction = interaction.id;
      button.addEventListener("click", () => {
        const current = currentActorAbout();
        if (
          current?.closeCommand.type !== "living-actor"
          || current.selectionKey !== actor.selectionKey
          || !current.interactions.some(({ id }) => id === interaction.id)
        ) return;
        options.dispatch({
          type: "living-actor",
          action: "interact",
          target: current.closeCommand.target,
          interaction: interaction.id,
        });
      });
      wrapper.append(button);
      if (interaction.disabled && interaction.hint) {
        const hint = createElement(
          "span",
          "resident-about__choice-hint",
          interaction.hint,
        );
        hint.id = `resident-about-choice-${interaction.id}-hint`;
        button.setAttribute("aria-describedby", hint.id);
        wrapper.append(hint);
      }
      refs.residentAboutLivingActions.append(wrapper);
    }
  };

  const restoreResidentAboutFocus = (): void => {
    const target = residentReturnFocus;
    residentReturnFocus = null;
    const activeElement = document.activeElement;
    if (
      target?.isConnected
      && activeElement instanceof Node
      && refs.residentAbout.contains(activeElement)
    ) {
      target.focus({ preventScroll: true });
    }
  };

  const syncResidentAboutFocus = (actor: ResolvedActorAboutSurface | undefined): void => {
    const nextKey = actor?.selectionKey ?? null;
    if (nextKey === selectedActorAboutKey) return;
    selectedActorAboutKey = nextKey;
    if (nextKey) {
      const quick = actor?.quickSummary ? ` ${actor.quickSummary}.` : "";
      announce(`${actor?.heading ?? "Living actor"}.${quick} ABOUT details available.`);
    } else {
      restoreResidentAboutFocus();
    }
  };

  const onResidentAboutFocusIn = (event: FocusEvent): void => {
    if (residentReturnFocus) return;
    const previous = event.relatedTarget;
    if (previous instanceof HTMLElement && !refs.residentAbout.contains(previous)) {
      residentReturnFocus = previous;
    }
  };
  refs.residentAbout.addEventListener("focusin", onResidentAboutFocusIn);

  const renderChronicle = (entries: readonly ChronicleEntryUIView[]): void => {
    const signature = chronicleSignature(entries);
    if (signature === lastChronicle) return;
    lastChronicle = signature;
    refs.chronicleList.replaceChildren();
    refs.chronicleCount.textContent = String(entries.length);
    const latest = entries[0];
    refs.chroniclePreview.textContent = latest
      ? `${latest.title} · ${latest.detail}`
      : "Nothing seen or heard yet.";
    refs.chronicleSummary.setAttribute(
      "aria-label",
      `${entries.length} observed ${entries.length === 1 ? "event" : "events"}`,
    );
    for (const entry of entries.slice(0, 8)) {
      const item = createElement("li", "chronicle-entry");
      item.dataset.kind = entry.kind;
      if (entry.new) item.dataset.new = "true";
      const time = createElement("time", "chronicle-entry__time", entry.timeLabel);
      const copy = createElement("span", "chronicle-entry__copy");
      copy.append(createElement("strong", "chronicle-entry__title", entry.title));
      copy.append(createElement("span", "chronicle-entry__detail", entry.detail));
      item.append(time, copy);
      refs.chronicleList.append(item);
    }
    if (entries.length === 0) {
      refs.chronicleList.append(
        createElement("li", "empty-state empty-state--compact", "Nothing seen or heard yet."),
      );
    }
  };

  const renderQuietHour = (view: TideweftUIView): void => {
    const quiet = view.quietHour;
    if (!quiet) {
      syncDialog(refs.quietDialog, (forcedQuietHour ?? false) && !refs.patchNotes.isOpen());
      return;
    }
    refs.quietTitle.textContent = quiet.title ?? "Quiet Hour";
    refs.quietSummary.textContent = quiet.summary;
    refs.quietDuration.textContent = quiet.durationLabel;
    refs.quietDistance.textContent = quiet.distanceLabel;
    refs.quietDeliveries.textContent = String(quiet.deliveries);
    refs.quietStrands.textContent = quiet.strandLabel;
    refs.quietChanges.replaceChildren();
    for (const change of quiet.changes) {
      refs.quietChanges.append(createElement("li", "quiet-change-list__item", change));
    }
    refs.quietQuote.textContent = quiet.quote ?? "";
    refs.quietQuote.hidden = !quiet.quote;
    refs.quietFinish.disabled = quiet.canFinish === false;
    syncDialog(refs.quietDialog, (forcedQuietHour ?? quiet.visible) && !refs.patchNotes.isOpen());
  };

  const update = (providedView?: TideweftUIView | null): void => {
    const view = providedView === undefined ? options.getView() ?? null : providedView;
    latestView = view;
    const actorAbout = view ? resolveActorAboutSurface(view) : undefined;
    refs.kit.update(view?.kit);
    renderSaveWarning(view?.saveWarning);
    syncResidentAboutFocus(actorAbout);
    renderResidentAbout(actorAbout);
    if (!view) {
      mobileBrace.release();
      underfootTerrain.reset();
      lastUnderfootWorldName = "";
      refs.shell.dataset.ready = "false";
      closeFieldDialogs();
      const titlePresented = forcedTitle ?? true;
      titleAtmosphere.sync(titlePresented, titlePresented && !refs.patchNotes.isOpen());
      syncDialog(refs.titleDialog, (forcedTitle ?? true) && !refs.patchNotes.isOpen());
      return;
    }
    refs.shell.dataset.ready = "true";
    const telemetry = options.getRendererTelemetry?.();
    const navigationCopy = navigationTelemetryCopy(view.navigation, telemetry);
    const mobileNavigationCopy = navigationTelemetryCopy(view.navigation, telemetry, true);
    const navigationTitle = telemetry?.active && telemetry.frameTimeMs > 0
      ? `Actual renderer frame time ${telemetry.frameTimeMs.toFixed(1)} milliseconds`
      : "Renderer cadence is not available yet";
    if (navigationCopy !== lastNavigationCopy) {
      lastNavigationCopy = navigationCopy;
      refs.navigation.textContent = navigationCopy;
      refs.desktopFieldNavigation.textContent = navigationCopy;
    }
    if (mobileNavigationCopy !== lastMobileNavigationCopy) {
      lastMobileNavigationCopy = mobileNavigationCopy;
      refs.mobileNavigation.textContent = mobileNavigationCopy;
    }
    if (navigationTitle !== lastNavigationTitle) {
      lastNavigationTitle = navigationTitle;
      refs.navigation.title = navigationTitle;
      refs.desktopFieldNavigation.title = navigationTitle;
      refs.mobileNavigation.title = navigationTitle;
    }
    const titlePresented = forcedTitle ?? view.title.visible;
    restartFlow.sync(view.title, titlePresented);
    titleAtmosphere.sync(titlePresented, titlePresented && !refs.patchNotes.isOpen());
    if (
      titlePresented
      || (forcedQuietHour ?? view.quietHour?.visible ?? false)
    ) {
      mobileBrace.release();
      refs.kit.close(false);
    }
    const revision = String(view.revision);
    const isNewRevision = revision !== lastRevision;
    if (!isNewRevision) {
      syncDialog(refs.titleDialog, titlePresented && !refs.patchNotes.isOpen());
      syncDialog(
        refs.quietDialog,
        (forcedQuietHour ?? view.quietHour?.visible ?? false) && !refs.patchNotes.isOpen(),
      );
      return;
    }
    lastRevision = revision;
    if (lastUnderfootWorldName !== view.worldName) {
      underfootTerrain.reset();
      lastUnderfootWorldName = view.worldName;
    }
    const presentedTerrainLabel = underfootTerrain.present({
      terrainLabel: view.field.terrainLabel,
      isWater: view.field.isWater,
      swept: view.field.swept,
    });

    refs.worldName.textContent = view.worldName;
    refs.location.textContent = view.player.locationLabel ?? "Between harbors";
    refs.clockDay.textContent = view.clock.dayLabel ?? `Day ${view.clock.day}`;
    refs.clockTime.textContent = view.clock.timeLabel;
    refs.tideReadout.dataset.phase = view.tide.phase;
    refs.tideSymbol.textContent = tideSymbol(view.tide.phase);
    refs.tideLabel.textContent = view.tide.label;
    refs.tideNext.textContent = view.tide.nextLabel ?? "The water is between turns";
    setProgress(refs.tideProgress, view.tide.progress, `${Math.round(clampUnit(view.tide.progress) * 100)} percent through ${view.tide.label}`);
    refs.weatherReadout.dataset.weather = view.weather.kind;
    refs.weatherSymbol.textContent = weatherSymbol(view.weather.kind);
    refs.weatherLabel.textContent = view.weather.label;
    refs.weatherForecast.textContent = view.weather.forecast ?? "No forecast carried";
    refs.weatherReadout.setAttribute(
      "aria-label",
      `${view.weather.label}, intensity ${Math.round(clampUnit(view.weather.intensity) * 100)} percent`,
    );
    setProgress(refs.stamina, view.player.stamina);
    setProgress(refs.stability, view.player.stability);
    refs.stabilityDetail.textContent = view.player.bracing
      ? `BRACING · ${view.player.stabilityHint}`
      : view.player.stabilityHint;
    refs.stabilityDetail.dataset.trend = view.player.stabilityTrend;
    refs.stabilityDetail.dataset.bracing = view.player.bracing ? "true" : "false";
    setProgress(refs.scanCharge, view.player.scanCharge);
    const cargoRatio = view.player.cargoLoad / Math.max(1, view.player.cargoCapacity);
    setProgress(refs.cargo, cargoRatio, `${view.player.cargoLoad} of ${view.player.cargoCapacity}`);
    refs.cargoLabel.textContent = `${view.player.cargoLoad} / ${view.player.cargoCapacity}`;

    const objective = view.objective;
    refs.objectivePanel.hidden = !objective;
    if (objective) {
      refs.objectivePanel.dataset.completed = objective.completed ? "true" : "false";
      refs.objectiveEyebrow.textContent = objective.eyebrow ?? "Current thread";
      refs.objectiveTitle.textContent = objective.title;
      refs.objectiveDescription.textContent = objective.description;
      setProgress(refs.objectiveProgress, objective.progress, objective.progressLabel);
      refs.objectiveProgressLabel.textContent = objective.progressLabel;
      refs.objectiveWhy.textContent = objective.why ?? "";
      refs.objectiveWhy.hidden = !objective.why;
    }
    refs.choirLabel.textContent = view.choir.label;
    setProgress(refs.choirProgress, view.choir.progress, `${Math.round(view.choir.progress * 100)} percent of a harbor phrase`);
    refs.choirHint.textContent = view.choir.hint;
    refs.choirReadout.dataset.awake = view.choir.awakenedCount > 0 ? "true" : "false";
    syncTextContent(refs.fieldTerrain, presentedTerrainLabel);
    syncTextContent(refs.fieldDepth, view.field.depthLabel);
    refs.fieldDepth.dataset.known = view.field.depthKnown ? "true" : "false";
    syncTextContent(refs.fieldEffort, view.field.effortLabel);
    refs.fieldTools.textContent = `FIELD KIT · ${view.field.toolLabels.join(" · ")}`;
    const activeWayknotLabels = view.field.activeWayknotLabels;
    const wayknotStatus = activeWayknotLabels.length === 0
      ? "No Wayknot active here"
      : activeWayknotLabels.length === 1
        ? `${activeWayknotLabels[0]} active here`
        : `WAYCHORD · ${activeWayknotLabels.join(" + ")}`;
    const wayknotAccessibleStatus = activeWayknotLabels.length === 0
      ? "No Wayknot is active at your position."
      : activeWayknotLabels.length === 1
        ? `${activeWayknotLabels[0]} is active at your position.`
        : `Waychord active at your position: ${activeWayknotLabels.join(", ")}.`;
    refs.fieldWayknotCount.textContent =
      `WAYKNOTS · ${view.field.deployedWayknots} / ${view.field.wayknotCapacity} deployed`;
    refs.fieldWayknotActive.textContent = wayknotStatus;
    refs.fieldWayknots.dataset.active = activeWayknotLabels.length > 0 ? "true" : "false";
    refs.fieldWayknots.dataset.waychord = activeWayknotLabels.length > 1 ? "true" : "false";
    refs.fieldWayknots.dataset.full =
      view.field.wayknotCapacity > 0
      && view.field.deployedWayknots >= view.field.wayknotCapacity
        ? "true"
        : "false";
    const fieldWayknotAccessibleLabel =
      `${view.field.deployedWayknots} of ${view.field.wayknotCapacity} Wayknot slots deployed. ${wayknotAccessibleStatus}`;
    refs.fieldWayknots.setAttribute("aria-label", fieldWayknotAccessibleLabel);
    refs.fieldWayknots.title = fieldWayknotAccessibleLabel;
    const tideHarpStatus = tideHarpFieldStatus(view.field.tideHarps);
    refs.fieldTideHarpCount.textContent =
      `TIDE HARPS · ${view.field.tideHarps.tunedCount} tuned`;
    refs.fieldTideHarpActive.textContent = tideHarpStatus.visible;
    refs.fieldTideHarps.dataset.active = tideHarpStatus.active ? "true" : "false";
    refs.fieldTideHarps.dataset.harpId = view.field.tideHarps.activeId ?? "";
    refs.fieldTideHarps.setAttribute("aria-label", tideHarpStatus.accessible);
    refs.fieldTideHarps.title = tideHarpStatus.accessible;
    refs.fieldHint.textContent = view.field.hint;
    refs.fieldReadout.dataset.swept = view.field.swept ? "true" : "false";
    // Free ADRIFT steering makes the old precomputed-bank percentage false.
    // Categorical text above and below the playfield now reports only live
    // physical facts (paddling, breath recovery, depth, and readiness).
    refs.fieldSweep.hidden = true;

    renderContracts(view.contracts);
    renderInspector(view.selectedSettlement);
    const nextInspectorId = view.selectedSettlement?.id ?? null;
    const inspectorJustOpened = nextInspectorId !== null && nextInspectorId !== selectedInspectorId;
    selectedInspectorId = nextInspectorId;
    const inspectorOpenedOnCompactViewport =
      inspectorJustOpened
      && typeof window.matchMedia === "function"
      && window.matchMedia(COMPACT_HUD_MEDIA_QUERY).matches;
    if (nextInspectorId === null) {
      refs.shell.dataset.mobileSheet = "promises";
    } else if (inspectorOpenedOnCompactViewport) {
      refs.shell.dataset.mobileSheet = "inspector";
      setMobileHudExpanded(true);
    }
    renderChronicle(view.chronicle);

    refs.scanButton.disabled = view.controls?.canScan === false;
    refs.interactButton.disabled = view.controls?.canInteract === false;
    refs.interactButton.textContent = view.controls?.interactLabel ?? "Interact";
    refs.interactButton.append(createElement("kbd", "keycap", "E"));
    refs.interactButton.title = view.controls?.interactHint ?? "Interact with the current harbor";
    const wayknotAction = wayknotActionButtonState(view.controls);
    refs.wayknotButton.disabled = wayknotAction.disabled;
    refs.wayknotButtonLabel.textContent = wayknotAction.label;
    refs.wayknotButton.title = wayknotAction.hint;
    refs.wayknotButton.setAttribute("aria-label", wayknotAction.ariaLabel);
    refs.wayknotButton.setAttribute("aria-keyshortcuts", wayknotAction.ariaKeyShortcuts);
    const compactHud = mobileHudCopy({
      objectiveTitle: objective?.title,
      objectiveRoute: objective?.why,
      objectiveProgress: objective?.progressLabel,
      stamina: view.player.stamina,
      stability: view.player.stability,
      stabilityHint: view.player.stabilityHint,
      bracing: view.player.bracing === true,
      isWater: view.field.isWater,
      terrain: presentedTerrainLabel,
      depth: view.field.depthLabel,
      effort: view.field.effortLabel,
      swept: view.field.swept,
      fieldHint: view.field.hint,
      canScan: view.controls?.canScan,
      interactLabel: view.controls?.interactLabel,
      wayknotLabel: wayknotAction.label,
    });
    refs.mobileObjective.textContent = compactHud.objective;
    refs.mobileObjective.title = compactHud.objective;
    refs.mobileSafety.textContent = compactHud.safety;
    refs.mobileSafety.title = compactHud.safety;
    syncTextContent(refs.mobileTerrain, compactHud.terrain);
    refs.mobileTerrain.title = compactHud.terrain;
    syncTextContent(refs.desktopFieldTerrain, compactHud.terrain);
    refs.desktopFieldTerrain.title = compactHud.terrain;
    refs.desktopFieldSafety.textContent = compactHud.safety;
    refs.desktopFieldSafety.title = compactHud.safety;
    refs.mobileActions.textContent = compactHud.actions;
    refs.mobileActions.title = compactHud.actions;
    setProgress(refs.mobileStamina, view.player.stamina, `Stamina ${Math.round(view.player.stamina * 100)} percent`);
    refs.mobileStaminaValue.textContent = `${Math.round(view.player.stamina * 100)}%`;
    setProgress(refs.mobileStability, view.player.stability, `Stability ${Math.round(view.player.stability * 100)} percent. ${view.player.stabilityHint}`);
    refs.mobileStabilityValue.textContent = `${Math.round(view.player.stability * 100)}%`;
    setProgress(refs.mobileLoom, view.player.scanCharge, `Loom charge ${Math.round(view.player.scanCharge * 100)} percent`);
    refs.mobileLoomValue.textContent = `${Math.round(view.player.scanCharge * 100)}%`;
    const mobileCargoRatio = view.player.cargoLoad / Math.max(1, view.player.cargoCapacity);
    const mobileCargoCondition = view.player.cargoCondition === undefined
      ? "No physical cargo carried"
      : `Lowest cargo condition ${Math.round(view.player.cargoCondition * 100)} percent`;
    setProgress(
      refs.mobileCargo,
      mobileCargoRatio,
      `Cargo load ${view.player.cargoLoad} of ${view.player.cargoCapacity}. ${mobileCargoCondition}`,
    );
    refs.mobileCargoValue.textContent = `${view.player.cargoLoad}/${view.player.cargoCapacity}`;
    refs.mobileFieldStrip.dataset.swept = view.field.swept ? "true" : "false";
    refs.mobileFieldStrip.dataset.bracing = view.player.bracing ? "true" : "false";
    refs.mobileFieldStrip.dataset.stabilityTrend = view.player.stabilityTrend;
    refs.quietButton.disabled = view.controls?.canEndSession === false;
    if (
      !restartFlow.seedDirty
      && !restartFlow.unlocked
      && !view.title.requiresSeed
      && view.title.suggestedSeed
      && document.activeElement !== refs.seedInput
    ) {
      refs.seedInput.placeholder = view.title.suggestedSeed;
    }
    refs.continueButton.hidden = !view.title.hasSave;
    const worldCreation = titleWorldCreationState(view.title);
    refs.continueButton.disabled = worldCreation.blocked;
    refs.continueName.textContent = view.title.worldName ?? view.worldName;
    refs.continueSummary.textContent =
      view.title.continueSummary ?? "No offline loss. The tide waits exactly where you left it.";
    syncDialog(refs.titleDialog, titlePresented && !refs.patchNotes.isOpen());
    renderQuietHour(view);

    const mastheadStatus = document.getElementById("connection-status");
    if (mastheadStatus) {
      mastheadStatus.textContent = view.clock.paused
        ? `${view.worldName} · waiting safely`
        : `${view.worldName} · ${view.tide.label.toLocaleLowerCase()}`;
    }
    if (view.announcement && view.announcement.id !== lastAnnouncement) {
      lastAnnouncement = view.announcement.id;
      announce(view.announcement.message, view.announcement.assertive);
    }
  };

  refs.contractList.addEventListener("pointerdown", () => {
    contractPointerActive = true;
  });
  refs.inspectorReports.addEventListener("pointerdown", () => {
    signedReportPointerActive = true;
  });
  window.addEventListener("pointerup", releaseContractPointer);
  window.addEventListener("pointercancel", cancelContractPointer);
  window.addEventListener("pointerup", releaseSignedReportPointer);
  window.addEventListener("pointercancel", cancelSignedReportPointer);
  refs.scanButton.addEventListener("click", () => options.dispatch({ type: "scan" }));
  refs.interactButton.addEventListener("click", () => options.dispatch({ type: "interact" }));
  refs.wayknotButton.addEventListener("click", () => options.dispatch({ type: "wayknot" }));
  refs.kitButton.addEventListener("click", () => toggleKit("pack", refs.kitButton));
  refs.mobileKitButton.addEventListener("click", () => toggleKit("pack", refs.mobileKitButton));
  refs.mobileHudToggle.addEventListener("click", () => {
    const expanding = refs.shell.dataset.mobileHudExpanded !== "true";
    if (expanding) {
      // The HUD control always opens Promises. Settlement interaction opens a
      // separate full-size inspector sheet, so the two never compete for a
      // phone's short viewport.
      refs.shell.dataset.mobileSheet = "promises";
      if (latestView?.selectedSettlement) {
        options.dispatch({
          type: "settlement",
          action: "close",
          settlementId: latestView.selectedSettlement.id,
        });
      }
    } else if (latestView?.selectedSettlement) {
      options.dispatch({
        type: "settlement",
        action: "close",
        settlementId: latestView.selectedSettlement.id,
      });
    }
    setMobileHudExpanded(expanding);
  });
  refs.quietButton.addEventListener("click", () => {
    mobileBrace.release();
    closeFieldDialogs();
    options.dispatch({ type: "quiet-hour", action: "open" });
  });
  refs.titlePatchNotes.addEventListener("click", () => {
    openPatchNotes(refs.titlePatchNotes, "title");
  });
  refs.quietPatchNotes.addEventListener("click", () => {
    openPatchNotes(refs.quietPatchNotes, "quiet-hour");
  });
  refs.titleButton.addEventListener("click", () => {
    mobileBrace.release();
    closeFieldDialogs();
    options.dispatch({ type: "open-title" });
  });
  refs.helpButton.addEventListener("click", () => toggleHelp(refs.helpButton));
  refs.inspectorClose.addEventListener("click", () => {
    refs.shell.dataset.mobileSheet = "promises";
    setMobileHudExpanded(false);
    options.dispatch({
      type: "settlement",
      action: "close",
      ...(latestView?.selectedSettlement ? { settlementId: latestView.selectedSettlement.id } : {}),
    });
  });
  const currentActorAbout = (): ResolvedActorAboutSurface | undefined =>
    latestView ? resolveActorAboutSurface(latestView) : undefined;
  const closeResidentAbout = (): void => {
    const actor = currentActorAbout();
    if (!actor) return;
    options.dispatch(actor.closeCommand);
  };
  refs.residentAboutClose.addEventListener("click", closeResidentAbout);
  refs.residentAboutGreet.addEventListener("click", () => {
    const actor = currentActorAbout();
    const residentId = actor?.closeCommand.type === "resident"
      ? actor.closeCommand.residentId
      : undefined;
    if (!residentId || actor?.actionLabel !== "GREET") return;
    options.dispatch({ type: "resident", action: "greet", residentId });
  });
  refs.inspectorFocus.addEventListener("click", () => {
    const settlementId = latestView?.selectedSettlement?.id;
    if (!settlementId) return;
    options.dispatch({ type: "settlement", action: "focus", settlementId });
  });
  refs.continueButton.addEventListener("click", () => options.dispatch({ type: "resume-world" }));
  refs.titleDialog.addEventListener("cancel", (event) => {
    const worldCreation = titleWorldCreationState(latestView?.title ?? {});
    if (!latestView?.title.hasSave || worldCreation.blocked) {
      event.preventDefault();
      if (worldCreation.blocked) announce(worldCreation.reason, true);
      return;
    }
    event.preventDefault();
    options.dispatch({ type: "resume-world" });
  });
  refs.quietDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    options.dispatch({ type: "quiet-hour", action: "continue" });
  });
  refs.quietContinue.addEventListener("click", () => {
    options.dispatch({ type: "quiet-hour", action: "continue" });
  });
  refs.quietFinish.addEventListener("click", () => {
    options.dispatch({ type: "quiet-hour", action: "finish" });
  });

  const onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (handleActorAboutEscape(
      event,
      currentActorAbout()?.closeCommand,
      options.dispatch,
    )) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }
    handleTideweftUIShortcut(
      event,
      latestView?.controls?.canWayknot === true,
      options.dispatch,
      () => toggleHelp(),
      () => toggleKit("pack"),
      () => openKit("make"),
    );
  };
  document.addEventListener("keydown", onGlobalKeyDown);

  const frame = (): void => {
    if (!running) return;
    update();
    frameHandle = window.requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    frameHandle = window.requestAnimationFrame(frame);
  };

  const stop = (): void => {
    mobileBrace.release();
    const titlePresented = latestView
      ? forcedTitle ?? latestView.title.visible
      : forcedTitle ?? false;
    titleAtmosphere.sync(titlePresented, false);
    running = false;
    if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
    frameHandle = null;
  };

  update();
  if (options.autoStart !== false) start();

  return {
    update,
    start,
    stop,
    announce,
    setTitleVisible: (visible) => {
      forcedTitle = visible;
      if (latestView) restartFlow.sync(latestView.title, visible);
      titleAtmosphere.sync(visible, visible && !refs.patchNotes.isOpen());
      if (visible) {
        mobileBrace.release();
        refs.kit.close(false);
      }
      syncDialog(refs.titleDialog, visible && !refs.patchNotes.isOpen());
    },
    setQuietHourVisible: (visible) => {
      forcedQuietHour = visible;
      if (visible) {
        mobileBrace.release();
        refs.kit.close(false);
      }
      syncDialog(refs.quietDialog, visible && !refs.patchNotes.isOpen());
    },
    openHelp: () => openHelp(),
    closeHelp: () => refs.tutorial.close(),
    openPatchNotes: () => openPatchNotes(),
    closePatchNotes: () => refs.patchNotes.close(),
    openKit: (tab = "pack") => openKit(tab),
    closeKit: () => refs.kit.close(),
    destroy: () => {
      stop();
      restoreResidentAboutFocus();
      mobileBrace.destroy();
      restartFlow.destroy();
      titleAtmosphere.destroy();
      refs.residentAbout.removeEventListener("focusin", onResidentAboutFocusIn);
      document.removeEventListener("keydown", onGlobalKeyDown);
      window.removeEventListener("pointerup", releaseContractPointer);
      window.removeEventListener("pointercancel", cancelContractPointer);
      window.removeEventListener("pointerup", releaseSignedReportPointer);
      window.removeEventListener("pointercancel", cancelSignedReportPointer);
      refs.kit.destroy();
      refs.tutorial.destroy();
      refs.patchNotes.destroy();
      syncDialog(refs.quietDialog, false);
      syncDialog(refs.titleDialog, false);
      options.root.replaceChildren();
    },
  };
}
