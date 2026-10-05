import { describe, expect, it, vi } from "vitest";

import type { AnimalCallTextMode } from "../render/animalCallText";
import { bindAnimalCallTextControl } from "./animalCallTextControl";

class MockButton extends EventTarget {
  readonly attributes = new Map<string, string>();
  textContent = "";

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

const htmlButton = (button: MockButton): HTMLButtonElement => button as unknown as HTMLButtonElement;
const click = (button: MockButton): boolean => button.dispatchEvent(new Event("click", { cancelable: true }));

function expectReportedMode(button: MockButton, mode: AnimalCallTextMode): void {
  expect(button.textContent).toBe(mode === "important" ? "ANIMAL LABELS · IMPORTANT" : "ANIMAL LABELS · FULL");
  expect(button.getAttribute("aria-label")).toBe("Reduce noncritical animal call labels");
  expect(button.getAttribute("aria-pressed")).toBe(String(mode === "important"));
}

describe("animal call text control", () => {
  it.each(["full", "important"] as const)("renders the current %s mode without setting it", (mode) => {
    const button = new MockButton();
    const getMode = vi.fn(() => mode);
    const setMode = vi.fn();
    const control = bindAnimalCallTextControl(htmlButton(button), { getMode, setMode });
    expectReportedMode(button, mode);
    expect(getMode).toHaveBeenCalledTimes(1);
    expect(setMode).not.toHaveBeenCalled();
    expect(Object.isFrozen(control)).toBe(true);
    control.destroy();
  });

  it("toggles both directions and rereads the reported mode after each setter", () => {
    const button = new MockButton();
    let mode: AnimalCallTextMode = "full";
    const calls: string[] = [];
    const getMode = vi.fn(() => { calls.push(`get:${mode}`); return mode; });
    const setMode = vi.fn((next: AnimalCallTextMode) => { calls.push(`set:${next}`); mode = next; });
    const control = bindAnimalCallTextControl(htmlButton(button), { getMode, setMode });
    expect(click(button)).toBe(true);
    expectReportedMode(button, "important");
    expect(click(button)).toBe(true);
    expectReportedMode(button, "full");
    expect(setMode.mock.calls).toEqual([["important"], ["full"]]);
    expect(calls).toEqual([
      "get:full", "get:full", "set:important", "get:important",
      "get:important", "set:full", "get:full",
    ]);
    control.destroy();
  });

  it("consults fresh host state rather than the previously rendered copy", () => {
    const button = new MockButton();
    let mode: AnimalCallTextMode = "full";
    const getMode = vi.fn(() => mode);
    const setMode = vi.fn((next: AnimalCallTextMode) => { mode = next; });
    const control = bindAnimalCallTextControl(htmlButton(button), { getMode, setMode });
    expectReportedMode(button, "full");
    mode = "important";
    click(button);
    expect(setMode).toHaveBeenCalledExactlyOnceWith("full");
    expectReportedMode(button, "full");
    expect(getMode).toHaveBeenCalledTimes(3);
    control.destroy();
  });

  it.each(["full", "important"] as const)("keeps reported %s copy when the setter refuses the requested change", (mode) => {
    const button = new MockButton();
    const getMode = vi.fn(() => mode);
    const setMode = vi.fn((_next: AnimalCallTextMode) => {});
    const control = bindAnimalCallTextControl(htmlButton(button), { getMode, setMode });
    click(button);
    expect(setMode).toHaveBeenCalledExactlyOnceWith(mode === "full" ? "important" : "full");
    expect(getMode).toHaveBeenCalledTimes(3);
    expectReportedMode(button, mode);
    control.destroy();
  });

  it("uses only click plus reported host state, without consuming event fields or cancellation authority", () => {
    const button = new MockButton();
    let mode: AnimalCallTextMode = "important";
    const getMode = vi.fn(() => mode);
    const setMode = vi.fn((next: AnimalCallTextMode) => { mode = next; });
    const control = bindAnimalCallTextControl(htmlButton(button), { getMode, setMode });
    for (const type of ["change", "keydown", "pointerup"]) button.dispatchEvent(new Event(type));
    expect(setMode).not.toHaveBeenCalled();
    expect(getMode).toHaveBeenCalledTimes(1);
    const observedClick = vi.fn();
    button.addEventListener("click", observedClick);
    const event = new Event("click", { cancelable: true });
    Object.defineProperty(event, "mode", {
      get: () => { throw new Error("Event payload must not supply preference authority"); },
    });
    expect(button.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(observedClick).toHaveBeenCalledExactlyOnceWith(event);
    expect(setMode).toHaveBeenCalledExactlyOnceWith("full");
    expectReportedMode(button, "full");
    control.destroy();
  });

  it("removes the same click listener and makes no host callbacks after teardown", () => {
    const button = new MockButton();
    const add = vi.spyOn(button, "addEventListener");
    const remove = vi.spyOn(button, "removeEventListener");
    const getMode = vi.fn(() => "full" as const);
    const setMode = vi.fn();
    const control = bindAnimalCallTextControl(htmlButton(button), { getMode, setMode });
    expect(add).toHaveBeenCalledTimes(1);
    const listener = add.mock.calls[0]?.[1];
    expect(listener).toEqual(expect.any(Function));
    control.destroy();
    expect(remove).toHaveBeenCalledExactlyOnceWith("click", listener);
    getMode.mockClear();
    click(button);
    expect(getMode).not.toHaveBeenCalled();
    expect(setMode).not.toHaveBeenCalled();
    expectReportedMode(button, "full");
  });
});
