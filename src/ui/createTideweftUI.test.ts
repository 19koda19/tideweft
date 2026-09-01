import { describe, expect, it, vi } from "vitest";

import {
  WAYKNOT_KEY_SHORTCUT,
  handleTideweftUIShortcut,
  wayknotActionButtonState,
} from "./createTideweftUI";

function keyEvent(overrides: Partial<{
  code: string;
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}> = {}) {
  return {
    code: "KeyF",
    key: "f",
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe("Wayknot UI accessibility", () => {
  it("keeps disabled sounding guidance consistent across visible and spoken button state", () => {
    const state = wayknotActionButtonState({
      canWayknot: false,
      wayknotLabel: "Sound water first",
      wayknotHint: "Sound this flooded ground with Space before using F.",
    });

    expect(state).toEqual({
      disabled: true,
      label: "Sound water first",
      hint: "Sound this flooded ground with Space before using F.",
      ariaLabel: "Sound water first. Sound this flooded ground with Space before using F.",
      ariaKeyShortcuts: "F",
    });
    expect(state.ariaKeyShortcuts).toBe(WAYKNOT_KEY_SHORTCUT);
  });

  it("projects an enabled contextual action without losing its F shortcut", () => {
    expect(wayknotActionButtonState({
      canWayknot: true,
      wayknotLabel: "Lay Reed mat",
      wayknotHint: "Reed mat fits this terrain. Press F to bind one reusable piece.",
    })).toEqual({
      disabled: false,
      label: "Lay Reed mat",
      hint: "Reed mat fits this terrain. Press F to bind one reusable piece.",
      ariaLabel: "Lay Reed mat. Reed mat fits this terrain. Press F to bind one reusable piece.",
      ariaKeyShortcuts: "F",
    });
  });

  it("dispatches one Wayknot command from global F only when the action is enabled", () => {
    const dispatch = vi.fn();
    const openHelp = vi.fn();
    const enabled = keyEvent();

    expect(handleTideweftUIShortcut(enabled, true, dispatch, openHelp)).toBe(true);
    expect(enabled.preventDefault).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "wayknot" });
    expect(openHelp).not.toHaveBeenCalled();

    const disabled = keyEvent();
    expect(handleTideweftUIShortcut(disabled, false, dispatch, openHelp)).toBe(false);
    expect(disabled.preventDefault).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("does not duplicate a canvas-handled F command or hijack modified/repeated keys", () => {
    const dispatch = vi.fn();
    const openHelp = vi.fn();
    const events = [
      keyEvent({ defaultPrevented: true }),
      keyEvent({ repeat: true }),
      keyEvent({ ctrlKey: true }),
      keyEvent({ metaKey: true }),
      keyEvent({ altKey: true }),
    ];

    for (const event of events) {
      expect(handleTideweftUIShortcut(event, true, dispatch, openHelp)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(openHelp).not.toHaveBeenCalled();
  });

});
