import { describe, expect, it, vi } from "vitest";

import { bindMobileBraceHold, mobileBraceButtonState } from "./mobileBrace";

class FakeButton extends EventTarget {
  readonly dataset = {} as DOMStringMap;
  readonly attributes = new Map<string, string>();
  readonly captures = new Set<number>();
  textContent: string | null = null;
  title = "";

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setPointerCapture(pointerId: number): void {
    this.captures.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captures.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.captures.delete(pointerId);
  }
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

const pointerEvent = (
  type: string,
  pointerId = 7,
  overrides: Partial<{ button: number; isPrimary: boolean }> = {},
): Event => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    button: { value: overrides.button ?? 0 },
    isPrimary: { value: overrides.isPrimary ?? true },
  });
  return event;
};

const keyEvent = (type: string, code: string, repeat = false): Event => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: repeat },
  });
  return event;
};

const harness = () => {
  const button = new FakeButton();
  const documentTarget = new FakeDocument();
  const windowTarget = new EventTarget();
  const onBraceChange = vi.fn();
  const controller = bindMobileBraceHold({
    button: button as unknown as HTMLButtonElement,
    documentTarget: documentTarget as unknown as Document,
    windowTarget: windowTarget as unknown as Window,
    onBraceChange,
  });
  return { button, documentTarget, windowTarget, onBraceChange, controller };
};

describe("mobile hold-to-brace control", () => {
  it("keeps visible and assistive pressed state synchronized", () => {
    expect(mobileBraceButtonState(false)).toMatchObject({
      active: false,
      ariaPressed: "false",
      visibleLabel: "BRACE",
    });
    expect(mobileBraceButtonState(true)).toMatchObject({
      active: true,
      ariaPressed: "true",
      visibleLabel: "BRACING",
    });
    expect(mobileBraceButtonState(false).accessibleLabel).toContain("Hold to brace");
    expect(mobileBraceButtonState(true).accessibleLabel).toContain("Release");
  });

  it("activates the exact brace bit for one primary pointer and releases on pointer up", () => {
    const { button, windowTarget, onBraceChange, controller } = harness();
    const down = pointerEvent("pointerdown");
    button.dispatchEvent(down);

    expect(down.defaultPrevented).toBe(true);
    expect(controller.active()).toBe(true);
    expect(button.captures.has(7)).toBe(true);
    expect(button.dataset.active).toBe("true");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toBe("BRACING");
    expect(onBraceChange).toHaveBeenCalledWith(true);

    const up = pointerEvent("pointerup");
    windowTarget.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(controller.active()).toBe(false);
    expect(button.captures.has(7)).toBe(false);
    expect(button.dataset.active).toBe("false");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.textContent).toBe("BRACE");
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);

    controller.destroy();
  });

  it.each(["pointerup", "pointercancel", "pointerleave", "lostpointercapture"])(
    "cannot stick after %s",
    (terminalEvent) => {
      const { button, onBraceChange, controller } = harness();
      button.dispatchEvent(pointerEvent("pointerdown"));
      button.dispatchEvent(pointerEvent(terminalEvent));

      expect(controller.active()).toBe(false);
      expect(onBraceChange.mock.calls).toEqual([[true], [false]]);
      controller.destroy();
    },
  );

  it("releases on button/window blur, hidden visibility, and explicit dialog transitions", () => {
    const terminal = [
      (state: ReturnType<typeof harness>) => state.button.dispatchEvent(new Event("blur")),
      (state: ReturnType<typeof harness>) => state.windowTarget.dispatchEvent(new Event("blur")),
      (state: ReturnType<typeof harness>) => {
        state.documentTarget.visibilityState = "hidden";
        state.documentTarget.dispatchEvent(new Event("visibilitychange"));
      },
      (state: ReturnType<typeof harness>) => state.controller.release(),
    ];

    for (const finish of terminal) {
      const state = harness();
      state.button.dispatchEvent(pointerEvent("pointerdown"));
      finish(state);
      expect(state.controller.active()).toBe(false);
      expect(state.onBraceChange.mock.calls).toEqual([[true], [false]]);
      expect(state.controller.release()).toBe(false);
      state.controller.destroy();
    }
  });

  it("ignores secondary pointers and a different pointer cannot release the hold", () => {
    const { button, windowTarget, onBraceChange, controller } = harness();
    button.dispatchEvent(pointerEvent("pointerdown", 2, { button: 1 }));
    button.dispatchEvent(pointerEvent("pointerdown", 3, { isPrimary: false }));
    expect(onBraceChange).not.toHaveBeenCalled();

    button.dispatchEvent(pointerEvent("pointerdown", 7));
    windowTarget.dispatchEvent(pointerEvent("pointerup", 99));
    expect(controller.active()).toBe(true);
    expect(onBraceChange.mock.calls).toEqual([[true]]);
    controller.destroy();
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);
  });

  it("provides equivalent momentary semantics for keyboard and switch access", () => {
    const { button, windowTarget, onBraceChange, controller } = harness();
    button.dispatchEvent(keyEvent("keydown", "Space"));
    button.dispatchEvent(keyEvent("keydown", "Space", true));
    expect(controller.active()).toBe(true);
    expect(onBraceChange.mock.calls).toEqual([[true]]);

    windowTarget.dispatchEvent(keyEvent("keyup", "Space"));
    expect(controller.active()).toBe(false);
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);
    controller.destroy();
  });

  it("destroy releases once and detaches every listener", () => {
    const { button, onBraceChange, controller } = harness();
    button.dispatchEvent(pointerEvent("pointerdown"));
    controller.destroy();
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);

    button.dispatchEvent(pointerEvent("pointerdown", 8));
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);
  });
});
