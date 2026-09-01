import { describe, expect, it, vi } from "vitest";

import {
  MOBILE_INSPECTOR_PANEL_ID,
  MOBILE_PROMISES_PANEL_ID,
  SAVE_WARNING_SURFACES,
  RECOVERY_SEED_REQUIRED_MESSAGE,
  WORLD_CREATION_BLOCKED_MESSAGE,
  TIDE_HARP_HELP_COPY,
  WAYKNOT_KEY_SHORTCUT,
  handleTideweftUIShortcut,
  mobileHudCopy,
  mobileHudDisclosureState,
  saveWarningPresentation,
  setProgress,
  shouldRefreshSignedReportActions,
  signedReportActionsSignature,
  tideHarpFieldStatus,
  titleSeedRequirement,
  titleWorldCreationState,
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

  it("opens the tutorial from T or the legacy question-mark shortcut", () => {
    const dispatch = vi.fn();
    const openTutorial = vi.fn();
    const t = keyEvent({ code: "KeyT", key: "t" });
    const question = keyEvent({ code: "Slash", key: "?", shiftKey: true });

    expect(handleTideweftUIShortcut(t, false, dispatch, openTutorial)).toBe(true);
    expect(handleTideweftUIShortcut(question, false, dispatch, openTutorial)).toBe(true);
    expect(t.preventDefault).toHaveBeenCalledOnce();
    expect(question.preventDefault).toHaveBeenCalledOnce();
    expect(openTutorial).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("toggles KIT with I and opens its MAKE tab with C without a gameplay command", () => {
    const dispatch = vi.fn();
    const openTutorial = vi.fn();
    const toggleKit = vi.fn();
    const openMake = vi.fn();
    const inventory = keyEvent({ code: "KeyI", key: "i" });
    const crafting = keyEvent({ code: "KeyC", key: "c" });

    expect(handleTideweftUIShortcut(
      inventory,
      false,
      dispatch,
      openTutorial,
      toggleKit,
      openMake,
    )).toBe(true);
    expect(handleTideweftUIShortcut(
      crafting,
      false,
      dispatch,
      openTutorial,
      toggleKit,
      openMake,
    )).toBe(true);
    expect(inventory.preventDefault).toHaveBeenCalledOnce();
    expect(crafting.preventDefault).toHaveBeenCalledOnce();
    expect(toggleKit).toHaveBeenCalledOnce();
    expect(openMake).toHaveBeenCalledOnce();
    expect(openTutorial).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("explains Tide Harp formation, activation, recharge, and three-origin sounding in words", () => {
    expect(TIDE_HARP_HELP_COPY).toContain("one Reed mat, one Tide anchor, and one Wind knot");
    expect(TIDE_HARP_HELP_COPY).toContain("compact triangle");
    expect(TIDE_HARP_HELP_COPY).toContain("+900 Loom charge each tick");
    expect(TIDE_HARP_HELP_COPY).toContain("sounds from you and all three knots");

    const active = tideHarpFieldStatus({
      tunedCount: 2,
      activeId: "tide-harp:r1-a3-w5",
      activeLabel: "Glass-Reed Harp",
      benefitLabel: "+900 Loom/tick · Space sounds from all 3 knots",
    });
    expect(active).toEqual({
      visible: "Glass-Reed Harp active · +900 Loom/tick · Space sounds from all 3 knots",
      accessible: "2 Tide Harps tuned. Glass-Reed Harp active · +900 Loom/tick · Space sounds from all 3 knots.",
      active: true,
    });
    expect(tideHarpFieldStatus({
      tunedCount: 2,
      activeId: null,
      activeLabel: null,
      benefitLabel: "+900 Loom/tick · Space sounds from all 3 knots",
    })).toEqual({
      visible: "Stand inside a tuned triangle to activate",
      accessible: "2 Tide Harps tuned. Stand inside a tuned triangle to activate. Benefit when active: +900 Loom/tick · Space sounds from all 3 knots.",
      active: false,
    });
    expect(tideHarpFieldStatus({
      tunedCount: 0,
      activeId: null,
      activeLabel: null,
      benefitLabel: "+900 Loom/tick · Space sounds from all 3 knots",
    }).visible).toBe("Tune one: Reed + Anchor + Wind in a compact triangle");
    expect(tideHarpFieldStatus({
      tunedCount: 1,
      activeId: "tide-harp:r1-a3-w5",
      activeLabel: "Glass-Ebb Tide Harp · R1 · A3 · W5",
      benefitLabel: "+900 Loom/tick · Space sounds from all 3 knots",
    }).accessible).toMatch(/^1 Tide Harp tuned\./u);
  });

});

describe("mobile field HUD accessibility", () => {
  it("requires an explicit recovery seed without exposing the ordinary restart gate", () => {
    expect(titleSeedRequirement({ hasSave: false, requiresSeed: true }, false)).toEqual({
      required: true,
      validationMessage: RECOVERY_SEED_REQUIRED_MESSAGE,
    });
    expect(titleSeedRequirement({ hasSave: true }, true)).toEqual({
      required: true,
      validationMessage: "Enter a non-empty seed phrase before replacing this estuary.",
    });
    expect(titleSeedRequirement({ hasSave: false }, false)).toEqual({
      required: false,
      validationMessage: "",
    });
  });

  it("disables every world-creation form when storage cannot prove the slot absent", () => {
    expect(titleWorldCreationState({ worldCreationBlocked: true })).toEqual({
      blocked: true,
      reason: WORLD_CREATION_BLOCKED_MESSAGE,
    });
    expect(titleWorldCreationState({})).toEqual({ blocked: false, reason: "" });
  });

  it("keeps persistent save health separate, explicit, and absent by default", () => {
    expect(SAVE_WARNING_SURFACES).toEqual([
      "field",
      "title",
      "quiet-hour",
      "tutorial",
      "patch-notes",
      "kit",
    ]);
    expect(saveWarningPresentation(undefined)).toEqual({
      hidden: true,
      id: "",
      message: "",
      detail: "",
      tone: "warning",
    });
    expect(saveWarningPresentation({
      id: "indexeddb-fallback",
      message: "Saving is using emergency local storage.",
      detail: "Keep this tab open while storage recovers.",
      tone: "danger",
    })).toEqual({
      hidden: false,
      id: "indexeddb-fallback",
      message: "Saving is using emergency local storage.",
      detail: "Keep this tab open while storage recovers.",
      tone: "danger",
    });
  });

  it("synchronously replaces a stale zero value after recovery and immediate re-entry", () => {
    const attributes = new Map<string, string>();
    const progress = {
      value: 1,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    } as unknown as HTMLProgressElement;

    setProgress(progress, 0, "Stamina 0 percent");
    expect(progress.value).toBe(0);
    expect(attributes.get("aria-valuetext")).toBe("Stamina 0 percent");

    setProgress(progress, 0.15, "Stamina 15 percent");
    expect(progress.value).toBe(0.15);

    setProgress(progress, 0.14345, "Stamina 14 percent");
    expect(progress.value).toBe(0.14345);
    expect(attributes.get("aria-valuetext")).toBe("Stamina 14 percent");
  });

  it("uses a native disclosure contract for both controlled panel surfaces", () => {
    expect(MOBILE_PROMISES_PANEL_ID).toBe("promises-panel");
    expect(mobileHudDisclosureState(false)).toEqual({
      ariaExpanded: "false",
      ariaControls: "promises-panel",
      visibleLabel: "PROMISES +",
      accessibleLabel: "Open promises",
    });
    expect(mobileHudDisclosureState(true)).toEqual({
      ariaExpanded: "true",
      ariaControls: "promises-panel",
      visibleLabel: "PROMISES −",
      accessibleLabel: "Close promises",
    });
    expect(MOBILE_INSPECTOR_PANEL_ID).toBe("settlement-inspector");
    expect(mobileHudDisclosureState(true, "inspector")).toEqual({
      ariaExpanded: "true",
      ariaControls: "settlement-inspector",
      visibleLabel: "CLOSE ×",
      accessibleLabel: "Close settlement details",
    });
  });

  it("keeps route, stability cause, water, and live actions in the collapsed copy", () => {
    const copy = mobileHudCopy({
      objectiveTitle: "PICK UP 8 Fresh Water ← Reedwake",
      objectiveRoute: "PICKUP: Reedwake · DELIVERY: Latchmere",
      objectiveProgress: "2.1 tiles to pickup · then deliver to Latchmere",
      stamina: 0.78,
      stability: 0.63,
      stabilityHint: "Falling · exposed to cross-current",
      isWater: true,
      terrain: "Tidal channel",
      depth: "Deep water",
      effort: "Heavy stamina use",
      swept: false,
      fieldHint: "Sound the water before crossing.",
      canScan: true,
      interactLabel: "Pick up cargo here",
      wayknotLabel: "Lay Tide anchor",
    });

    expect(copy.objective).toContain("PICKUP: Reedwake · DELIVERY: Latchmere");
    expect(copy.objective).toContain("then deliver to Latchmere");
    expect(copy.safety).toBe("↓ exposed to cross-current · DEEP: STAM/STAB 0 → SWEPT");
    expect(copy.terrain).toBe("WATER · Tidal channel · Deep water · Heavy stamina use");
    expect(copy.actions).toBe("Pick up cargo here · Sound / Scan · Lay Tide anchor");
  });

  it("states the recoverable sweep trigger when either deep-water resource reaches zero", () => {
    const copy = mobileHudCopy({
      objectiveTitle: undefined,
      objectiveRoute: undefined,
      objectiveProgress: undefined,
      stamina: 0,
      stability: 0,
      stabilityHint: "Stability exhausted",
      isWater: true,
      terrain: "Tidal channel",
      depth: "Chest deep",
      effort: "Severe stamina use",
      swept: true,
      fieldHint: "Brace toward the lit bank.",
      canScan: false,
      interactLabel: undefined,
      wayknotLabel: undefined,
    });

    expect(copy.objective).toContain("PICKUP cargo → DELIVER cargo");
    expect(copy.safety).toContain("SWEPT · Brace toward the lit bank.");
    expect(copy.safety).toContain("STAM 0% · STAB 0%");
    expect(copy.terrain).toContain("Chest deep");
    expect(copy.actions).toContain("Scan recharging");
  });

  it("labels dry terrain as ground instead of implying water everywhere", () => {
    const copy = mobileHudCopy({
      objectiveTitle: "Listen for a promise",
      objectiveRoute: undefined,
      objectiveProgress: undefined,
      stamina: 1,
      stability: 1,
      stabilityHint: "Stable · hold Shift to brace",
      isWater: false,
      terrain: "Bellwake harbor decking",
      depth: "Dry footing",
      effort: "Normal stamina use",
      swept: false,
      fieldHint: "Complete civic projects for tools.",
      canScan: true,
      interactLabel: "Inspect harbor",
      wayknotLabel: "Bind Wayknot",
    });

    expect(copy.terrain).toBe("GROUND · Bellwake harbor decking · Dry footing · Normal stamina use");
    expect(copy.safety).toBe("STABLE · DEEP: STAM/STAB 0 → SWEPT");
    expect(copy.safety).not.toMatch(/Shift|WASD|keyboard/iu);
  });
});

describe("signed information report controls", () => {
  const source = {
    id: "11",
    name: "Bellwake",
    connections: [
      {
        id: "17",
        routeId: "5",
        settlementId: "11",
        settlementName: "Reedwake",
        conditionLabel: "Surveyed · faint trace · 31% woven",
        reliability: 0.42,
        actionLabel: "Spend 1 part to strengthen route",
        actionHint: "Live route guidance",
        actionDisabled: false,
        reportActionLabel: "Sign info report → Reedwake",
        reportActionHint: "Uses 1 document slot and moves no cargo or supplies.",
        reportActionDisabled: false,
      },
    ],
  } as const;

  it("keeps the same report button mounted while unrelated live route telemetry changes", () => {
    const before = signedReportActionsSignature(source);
    const after = signedReportActionsSignature({
      ...source,
      connections: [{
        ...source.connections[0],
        conditionLabel: "Surveyed · faint trace · 49% woven",
        reliability: 0.61,
        actionHint: "A newly updated route hint",
      }],
    });

    expect(after).toBe(before);
    expect(shouldRefreshSignedReportActions(before, after, false)).toBe(false);
  });

  it("refreshes actual report state, but never between pointer-down and click", () => {
    const before = signedReportActionsSignature(source);
    const occupied = signedReportActionsSignature({
      ...source,
      connections: [{
        ...source.connections[0],
        reportActionLabel: "Document case already occupied",
        reportActionHint: "Deliver the report already carried before collecting another.",
        reportActionDisabled: true,
      }],
    });

    expect(occupied).not.toBe(before);
    expect(shouldRefreshSignedReportActions(before, occupied, true)).toBe(false);
    expect(shouldRefreshSignedReportActions(before, occupied, false)).toBe(true);
  });
});
