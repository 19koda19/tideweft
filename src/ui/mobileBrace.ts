export interface MobileBraceButtonState {
  readonly active: boolean;
  readonly ariaPressed: "true" | "false";
  readonly visibleLabel: "BRACE" | "BRACING";
  readonly accessibleLabel: string;
  readonly title: string;
}

export interface MobileBraceHoldController {
  readonly active: () => boolean;
  /** Releases any held pointer/key source. Safe to call repeatedly. */
  readonly release: () => boolean;
  /** Removes listeners and releases before the UI surface disappears. */
  readonly destroy: () => void;
}

export interface MobileBraceHoldOptions {
  readonly button: HTMLButtonElement;
  readonly documentTarget: Document;
  readonly windowTarget: Window;
  readonly onBraceChange: (active: boolean) => void;
}

type HeldSource =
  | { readonly kind: "pointer"; readonly pointerId: number }
  | { readonly kind: "keyboard"; readonly code: "Enter" | "Space" };

const RELEASE_LABEL =
  "Hold to brace. Trades travel speed for stability and protects fragile cargo.";
const ACTIVE_LABEL = "Bracing. Release to stop bracing.";

/** One presentation contract for visible, pointer, and assistive state. */
export function mobileBraceButtonState(active: boolean): MobileBraceButtonState {
  return active
    ? {
        active: true,
        ariaPressed: "true",
        visibleLabel: "BRACING",
        accessibleLabel: ACTIVE_LABEL,
        title: ACTIVE_LABEL,
      }
    : {
        active: false,
        ariaPressed: "false",
        visibleLabel: "BRACE",
        accessibleLabel: RELEASE_LABEL,
        title: RELEASE_LABEL,
      };
}

/**
 * Binds a momentary touch-native brace control to the game's authoritative
 * brace bit. Every interruption path converges on the same idempotent release
 * so a lost pointer can never leave the porter bracing indefinitely.
 */
export function bindMobileBraceHold(
  options: MobileBraceHoldOptions,
): MobileBraceHoldController {
  const { button, documentTarget, windowTarget, onBraceChange } = options;
  let held: HeldSource | null = null;

  const render = (active: boolean): void => {
    const state = mobileBraceButtonState(active);
    button.dataset.active = String(state.active);
    button.setAttribute("aria-pressed", state.ariaPressed);
    button.setAttribute("aria-label", state.accessibleLabel);
    button.textContent = state.visibleLabel;
    button.title = state.title;
  };

  const activate = (source: HeldSource): boolean => {
    if (held !== null) return false;
    held = source;
    render(true);
    onBraceChange(true);
    return true;
  };

  const release = (): boolean => {
    const source = held;
    if (source === null) return false;
    // Clear first because releasePointerCapture may synchronously emit
    // lostpointercapture in some engines.
    held = null;
    if (source.kind === "pointer") {
      try {
        if (button.hasPointerCapture(source.pointerId)) {
          button.releasePointerCapture(source.pointerId);
        }
      } catch {
        // Capture can already be gone after OS/browser gesture cancellation.
      }
    }
    render(false);
    onBraceChange(false);
    return true;
  };

  const onPointerDown = ((rawEvent: Event): void => {
    const event = rawEvent as PointerEvent;
    if (event.isPrimary === false || (typeof event.button === "number" && event.button !== 0)) return;
    if (!activate({ kind: "pointer", pointerId: event.pointerId })) return;
    event.preventDefault();
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Window-level release listeners remain authoritative without capture.
    }
  }) as EventListener;

  const releasePointer = ((rawEvent: Event): void => {
    const event = rawEvent as PointerEvent;
    if (held?.kind !== "pointer" || held.pointerId !== event.pointerId) return;
    event.preventDefault();
    release();
  }) as EventListener;

  const onKeyDown = ((rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent;
    if (event.repeat || (event.code !== "Space" && event.code !== "Enter")) return;
    if (!activate({ kind: "keyboard", code: event.code })) return;
    event.preventDefault();
  }) as EventListener;

  const onKeyUp = ((rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent;
    if (held?.kind !== "keyboard" || held.code !== event.code) return;
    event.preventDefault();
    release();
  }) as EventListener;

  const onClick = ((event: Event): void => {
    // Pointer/key lifetimes, not a delayed synthesized click, own this button.
    event.preventDefault();
  }) as EventListener;
  const onBlur = (): void => {
    release();
  };
  const onVisibilityChange = (): void => {
    if (documentTarget.visibilityState !== "visible") release();
  };

  render(false);
  button.addEventListener("pointerdown", onPointerDown, { passive: false });
  button.addEventListener("pointerup", releasePointer, { passive: false });
  button.addEventListener("pointercancel", releasePointer, { passive: false });
  button.addEventListener("pointerleave", releasePointer, { passive: false });
  button.addEventListener("lostpointercapture", releasePointer, { passive: false });
  button.addEventListener("keydown", onKeyDown);
  button.addEventListener("keyup", onKeyUp);
  button.addEventListener("click", onClick);
  button.addEventListener("blur", onBlur);
  windowTarget.addEventListener("pointerup", releasePointer, { passive: false });
  windowTarget.addEventListener("pointercancel", releasePointer, { passive: false });
  windowTarget.addEventListener("keyup", onKeyUp);
  windowTarget.addEventListener("blur", onBlur);
  documentTarget.addEventListener("visibilitychange", onVisibilityChange);

  return {
    active: () => held !== null,
    release,
    destroy: () => {
      release();
      button.removeEventListener("pointerdown", onPointerDown);
      button.removeEventListener("pointerup", releasePointer);
      button.removeEventListener("pointercancel", releasePointer);
      button.removeEventListener("pointerleave", releasePointer);
      button.removeEventListener("lostpointercapture", releasePointer);
      button.removeEventListener("keydown", onKeyDown);
      button.removeEventListener("keyup", onKeyUp);
      button.removeEventListener("click", onClick);
      button.removeEventListener("blur", onBlur);
      windowTarget.removeEventListener("pointerup", releasePointer);
      windowTarget.removeEventListener("pointercancel", releasePointer);
      windowTarget.removeEventListener("keyup", onKeyUp);
      windowTarget.removeEventListener("blur", onBlur);
      documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
