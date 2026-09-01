export interface DesktopBraceHoldOptions {
  readonly windowTarget: Window;
  readonly documentTarget: Document;
  readonly onBraceChange: (active: boolean) => void;
  /** Runtime/UI gate: title, pause, and modal surfaces must not start a hold. */
  readonly canActivate?: (event: KeyboardEvent) => boolean;
}

export interface DesktopBraceHoldController {
  readonly active: () => boolean;
  readonly release: () => boolean;
  readonly destroy: () => void;
}

type ShiftCode = "ShiftLeft" | "ShiftRight" | "ShiftUnknown";

function shiftCode(event: KeyboardEvent): ShiftCode | null {
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") return event.code;
  return event.key === "Shift" ? "ShiftUnknown" : null;
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as Partial<HTMLElement>;
  const tagName = typeof candidate.tagName === "string" ? candidate.tagName.toLowerCase() : "";
  return tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
    || candidate.isContentEditable === true;
}

/**
 * Global desktop Shift fallback.
 *
 * Canvas-focused play keeps using the renderer's existing keyboard owner. This
 * controller catches the equally valid case where a HUD button, the document
 * body, or browser focus owns the key event. `defaultPrevented` is therefore a
 * deliberate ownership signal rather than a reason to emit the brace bit
 * twice. Every terminal path still clears local state and releases once.
 */
export function bindDesktopBraceHold(
  options: DesktopBraceHoldOptions,
): DesktopBraceHoldController {
  const { windowTarget, documentTarget, onBraceChange } = options;
  const held = new Set<ShiftCode>();

  const release = (): boolean => {
    if (held.size === 0) return false;
    held.clear();
    onBraceChange(false);
    return true;
  };

  const onKeyDown = ((rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent;
    const code = shiftCode(event);
    if (code === null || event.defaultPrevented) return;
    if (
      event.ctrlKey
      || event.metaKey
      || event.altKey
      || isEditingTarget(event.target)
      || options.canActivate?.(event) === false
    ) return;
    event.preventDefault();
    const wasActive = held.size > 0;
    held.add(code);
    if (!wasActive) onBraceChange(true);
  }) as EventListener;

  const onKeyUp = ((rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent;
    const code = shiftCode(event);
    if (code === null) return;
    const removed = held.delete(code);
    // The key may have gone down over the HUD and come up over the canvas.
    // Release this controller's source even when the renderer also owns and
    // prevents the keyup; the host aggregates the two sources independently.
    if (!removed) return;
    if (!event.defaultPrevented) event.preventDefault();
    if (held.size === 0) onBraceChange(false);
  }) as EventListener;

  const onBlur = (): void => {
    release();
  };
  const onVisibilityChange = (): void => {
    if (documentTarget.visibilityState !== "visible") release();
  };

  windowTarget.addEventListener("keydown", onKeyDown);
  windowTarget.addEventListener("keyup", onKeyUp);
  windowTarget.addEventListener("blur", onBlur);
  documentTarget.addEventListener("visibilitychange", onVisibilityChange);

  return {
    active: () => held.size > 0,
    release,
    destroy: () => {
      release();
      windowTarget.removeEventListener("keydown", onKeyDown);
      windowTarget.removeEventListener("keyup", onKeyUp);
      windowTarget.removeEventListener("blur", onBlur);
      documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
