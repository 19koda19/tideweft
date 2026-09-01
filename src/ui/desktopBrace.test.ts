import { describe, expect, it, vi } from "vitest";

import { bindDesktopBraceHold } from "./desktopBrace";

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

const keyEvent = (
  type: string,
  code: string,
  options: Partial<{
    key: string;
    repeat: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
  }> = {},
): Event => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    key: { value: options.key ?? (code.startsWith("Shift") ? "Shift" : "") },
    repeat: { value: options.repeat ?? false },
    ctrlKey: { value: options.ctrlKey ?? false },
    metaKey: { value: options.metaKey ?? false },
    altKey: { value: options.altKey ?? false },
  });
  return event;
};

const harness = (canActivate = vi.fn(() => true)) => {
  const windowTarget = new EventTarget();
  const documentTarget = new FakeDocument();
  const onBraceChange = vi.fn();
  const controller = bindDesktopBraceHold({
    windowTarget: windowTarget as unknown as Window,
    documentTarget: documentTarget as unknown as Document,
    onBraceChange,
    canActivate,
  });
  return { windowTarget, documentTarget, onBraceChange, canActivate, controller };
};

describe("desktop Shift brace fallback", () => {
  it("braces from window/body focus and releases the same authoritative bit", () => {
    const state = harness();
    const down = keyEvent("keydown", "ShiftLeft");
    state.windowTarget.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(state.controller.active()).toBe(true);
    expect(state.onBraceChange.mock.calls).toEqual([[true]]);

    const repeated = keyEvent("keydown", "ShiftLeft", { repeat: true });
    state.windowTarget.dispatchEvent(repeated);
    expect(state.onBraceChange.mock.calls).toEqual([[true]]);

    const up = keyEvent("keyup", "ShiftLeft");
    state.windowTarget.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(state.controller.active()).toBe(false);
    expect(state.onBraceChange.mock.calls).toEqual([[true], [false]]);
    state.controller.destroy();
  });

  it("keeps bracing until both physical Shift keys are released", () => {
    const state = harness();
    state.windowTarget.dispatchEvent(keyEvent("keydown", "ShiftLeft"));
    state.windowTarget.dispatchEvent(keyEvent("keydown", "ShiftRight"));
    state.windowTarget.dispatchEvent(keyEvent("keyup", "ShiftLeft"));
    expect(state.controller.active()).toBe(true);
    expect(state.onBraceChange.mock.calls).toEqual([[true]]);
    state.windowTarget.dispatchEvent(keyEvent("keyup", "ShiftRight"));
    expect(state.onBraceChange.mock.calls).toEqual([[true], [false]]);
    state.controller.destroy();
  });

  it("defers canvas-owned keydown but releases a HUD hold after focus reaches canvas", () => {
    const state = harness();
    const down = keyEvent("keydown", "ShiftLeft");
    down.preventDefault();
    state.windowTarget.dispatchEvent(down);
    expect(state.controller.active()).toBe(false);
    expect(state.onBraceChange).not.toHaveBeenCalled();

    state.windowTarget.dispatchEvent(keyEvent("keydown", "ShiftRight"));
    const ownedUp = keyEvent("keyup", "ShiftRight");
    ownedUp.preventDefault();
    state.windowTarget.dispatchEvent(ownedUp);
    expect(state.controller.active()).toBe(false);
    expect(state.onBraceChange.mock.calls).toEqual([[true], [false]]);
    state.controller.destroy();
  });

  it("does not activate in editors, with command modifiers, or behind a closed gameplay gate", () => {
    const state = harness();
    const input = new EventTarget();
    Object.defineProperty(input, "tagName", { value: "INPUT" });
    const editorShift = keyEvent("keydown", "ShiftLeft");
    Object.defineProperty(editorShift, "target", { value: input });
    state.windowTarget.dispatchEvent(editorShift);
    state.windowTarget.dispatchEvent(keyEvent("keydown", "ShiftLeft", { metaKey: true }));
    state.canActivate.mockReturnValue(false);
    state.windowTarget.dispatchEvent(keyEvent("keydown", "ShiftRight"));
    expect(state.onBraceChange).not.toHaveBeenCalled();
    state.controller.destroy();
  });

  it("releases on blur, hidden visibility, explicit release, and destroy", () => {
    const terminals = [
      (state: ReturnType<typeof harness>) => state.windowTarget.dispatchEvent(new Event("blur")),
      (state: ReturnType<typeof harness>) => {
        state.documentTarget.visibilityState = "hidden";
        state.documentTarget.dispatchEvent(new Event("visibilitychange"));
      },
      (state: ReturnType<typeof harness>) => state.controller.release(),
      (state: ReturnType<typeof harness>) => state.controller.destroy(),
    ];
    for (const terminal of terminals) {
      const state = harness();
      state.windowTarget.dispatchEvent(keyEvent("keydown", "ShiftLeft"));
      terminal(state);
      expect(state.controller.active()).toBe(false);
      expect(state.onBraceChange.mock.calls).toEqual([[true], [false]]);
      state.controller.destroy();
    }
  });
});
