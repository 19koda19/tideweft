import { describe, expect, it, vi } from "vitest";

import {
  MOBILE_INSPECTOR_PANEL_ID,
  MOBILE_PROMISES_PANEL_ID,
  SAVE_WARNING_SURFACES,
  RECOVERY_SEED_REQUIRED_MESSAGE,
  WORLD_CREATION_BLOCKED_MESSAGE,
  TIDE_HARP_HELP_COPY,
  TITLE_SURFACE_COPY,
  WAYKNOT_KEY_SHORTCUT,
  bindTitleRestartFlow,
  createUnderfootTerrainStabilizer,
  handleResidentAboutEscape,
  handleTideweftUIShortcut,
  mobileHudCopy,
  mobileHudDisclosureState,
  navigationTelemetryCopy,
  residentAboutActionPresentation,
  residentAboutSurfaceState,
  saveWarningPresentation,
  setProgress,
  shouldRefreshSignedReportActions,
  signedReportActionsSignature,
  syncTextContent,
  tideHarpFieldStatus,
  titleSeedRequirement,
  titleWorldCreationState,
  wayknotActionButtonState,
} from "./createTideweftUI";

class FakeForm extends EventTarget {
  hidden = false;
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

class FakeInput extends EventTarget {
  value = "";
  placeholder = "Leave blank for quiet-delta";
  required = false;
  disabled = false;
  validationMessage = "";
  readonly attributes = new Map<string, string>();
  readonly focus = vi.fn();
  readonly select = vi.fn();
  readonly scrollIntoView = vi.fn();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setCustomValidity(message: string): void {
    this.validationMessage = message;
  }
}

class FakeButton {
  disabled = false;
}

class FakeStatus {
  hidden = false;
  textContent = "";
}

function restartFlowHarness() {
  const restartForm = new FakeForm();
  const restartInput = new FakeInput();
  const restartButton = new FakeButton();
  const restartStatus = new FakeStatus();
  const newWorldForm = new FakeForm();
  const seedInput = new FakeInput();
  const seedStatus = new FakeStatus();
  const beginButton = new FakeButton();
  const dispatch = vi.fn();
  const announce = vi.fn();
  let title = {
    visible: false,
    hasSave: true,
    worldName: "Old estuary",
  };
  const flow = bindTitleRestartFlow({
    elements: {
      restartForm: restartForm as unknown as HTMLFormElement,
      restartInput: restartInput as unknown as HTMLInputElement,
      restartButton: restartButton as unknown as HTMLButtonElement,
      restartStatus: restartStatus as unknown as HTMLElement,
      newWorldForm: newWorldForm as unknown as HTMLFormElement,
      seedInput: seedInput as unknown as HTMLInputElement,
      seedStatus: seedStatus as unknown as HTMLElement,
      beginButton: beginButton as unknown as HTMLButtonElement,
    },
    getTitle: () => title,
    dispatch,
    announce,
  });
  return {
    flow,
    restartForm,
    restartInput,
    restartButton,
    restartStatus,
    newWorldForm,
    seedInput,
    seedStatus,
    beginButton,
    dispatch,
    announce,
    setTitle(next: typeof title) {
      title = next;
    },
    title: () => title,
  };
}

describe("minimal title surface", () => {
  it("keeps only the useful first-launch copy and no difficulty slogan", () => {
    expect(TITLE_SURFACE_COPY).toEqual({
      heading: "TIDEWEFT",
      seed: "Seed phrase",
      start: "START",
      patchNotes: "PATCH NOTES",
    });
    expect(Object.values(TITLE_SURFACE_COPY).join(" ")).not.toMatch(/challenging|ruleset|perpetual/iu);
  });
});

describe("underfoot terrain presentation", () => {
  const meadow = {
    terrainLabel: "Rain meadow · Salt meadow",
    isWater: false,
    swept: false,
  } as const;
  const ridge = {
    terrainLabel: "Wind ridge · Shell ridge",
    isWater: false,
    swept: false,
  } as const;

  it("ignores a one-step ordinary terrain seam and commits a sustained change", () => {
    const terrain = createUnderfootTerrainStabilizer();
    expect(terrain.present(meadow)).toBe(meadow.terrainLabel);
    expect(terrain.present(ridge)).toBe(meadow.terrainLabel);
    expect(terrain.present(meadow)).toBe(meadow.terrainLabel);
    expect(terrain.present(ridge)).toBe(meadow.terrainLabel);
    expect(terrain.present(ridge)).toBe(ridge.terrainLabel);
  });

  it("never delays water or ADRIFT boundary warnings", () => {
    const terrain = createUnderfootTerrainStabilizer();
    expect(terrain.present(meadow)).toBe(meadow.terrainLabel);

    const water = {
      terrainLabel: "Tide channel · Tidal channel",
      isWater: true,
      swept: false,
    } as const;
    expect(terrain.present(water)).toBe(water.terrainLabel);
    expect(terrain.present({ ...water, terrainLabel: "Glimmerfen · Tidal channel" }))
      .toBe(water.terrainLabel);

    const swept = { ...water, terrainLabel: "Tide channel · Fast water", swept: true } as const;
    expect(terrain.present(swept)).toBe(swept.terrainLabel);
    expect(terrain.present(meadow)).toBe(meadow.terrainLabel);
  });

  it("does not replace an unchanged DOM text node every movement revision", () => {
    let value: string | null = meadow.terrainLabel;
    let writes = 0;
    const target = Object.defineProperty({}, "textContent", {
      get: () => value,
      set: (next: string | null) => {
        value = next;
        writes += 1;
      },
    }) as { textContent: string | null };

    expect(syncTextContent(target, meadow.terrainLabel)).toBe(false);
    expect(writes).toBe(0);
    expect(syncTextContent(target, ridge.terrainLabel)).toBe(true);
    expect(writes).toBe(1);
    expect(value).toBe(ridge.terrainLabel);
  });
});

describe("navigation and renderer telemetry copy", () => {
  it("shows one continuous world address and measured renderer FPS", () => {
    expect(navigationTelemetryCopy({
      regionX: -304,
      regionY: 719,
      localX: 17,
      localY: 4,
      globalX: -29_775,
      globalY: 52_984,
    }, {
      fps: 59.6,
      frameTimeMs: 16.78,
      frameCount: 120,
      active: true,
    })).toBe("E -29775 · N +52984 · 60 FPS");
  });

  it("keeps compact mobile copy terse and refuses an unmeasured FPS guess", () => {
    expect(navigationTelemetryCopy({
      regionX: 0,
      regionY: -2,
      localX: 0,
      localY: 73,
      globalX: 0,
      globalY: -73,
    }, {
      fps: 144,
      frameTimeMs: 6.94,
      frameCount: 1,
      active: true,
    }, true)).toBe("E0 · N-73 · FPS —");
    expect(navigationTelemetryCopy(undefined, undefined, true))
      .toBe("E ? · N ? · FPS —");
  });
});

describe("saved-world restart DOM flow", () => {
  it("preserves a forced-open mobile draft across refresh and unlocks on virtual-keyboard commit", () => {
    const harness = restartFlowHarness();

    // Auto-resume keeps the authoritative title false; a host-forced title is
    // nevertheless logically open and must not have its draft cleared by rAF.
    harness.flow.sync(harness.title(), true);
    harness.restartInput.value = "restartrestartrestart";
    harness.restartInput.dispatchEvent(new Event("input"));
    harness.flow.sync({ ...harness.title() }, true);
    expect(harness.restartInput.value).toBe("restartrestartrestart");

    // Mobile Done/blur commits `change` even when the button is below the
    // shrunken visual viewport. This unlocks UI only; it cannot replace data.
    harness.restartInput.dispatchEvent(new Event("change"));
    expect(harness.flow.unlocked).toBe(true);
    expect(harness.restartForm.hidden).toBe(true);
    expect(harness.newWorldForm.hidden).toBe(false);
    expect(harness.seedInput.required).toBe(true);
    expect(harness.seedInput.placeholder).toBe("Required: enter a new seed phrase");
    expect(harness.seedInput.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(harness.seedInput.getAttribute("aria-invalid")).toBe("false");
    expect(harness.seedStatus.hidden).toBe(false);
    expect(harness.seedStatus.textContent).toContain("non-empty new seed");
    expect(harness.dispatch).not.toHaveBeenCalled();

    // A benign revision remains unlocked. A logical close and reopen does not.
    harness.flow.sync({ ...harness.title() }, true);
    expect(harness.flow.unlocked).toBe(true);
    harness.flow.sync(harness.title(), false);
    expect(harness.restartInput.value).toBe("");
    expect(harness.seedInput.value).toBe("");
    harness.flow.sync(harness.title(), true);
    expect(harness.flow.unlocked).toBe(false);
    expect(harness.restartForm.hidden).toBe(false);
    expect(harness.newWorldForm.hidden).toBe(true);
  });

  it("keeps wrong confirmation and both blank-seed event paths visibly safe", () => {
    const harness = restartFlowHarness();
    harness.flow.sync(harness.title(), true);

    harness.restartInput.value = "restartrestart";
    const wrongSubmit = new Event("submit", { cancelable: true });
    harness.restartForm.dispatchEvent(wrongSubmit);
    expect(wrongSubmit.defaultPrevented).toBe(true);
    expect(harness.flow.unlocked).toBe(false);
    expect(harness.restartInput.getAttribute("aria-invalid")).toBe("true");
    expect(harness.restartInput.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(harness.restartInput.select).toHaveBeenCalledOnce();
    expect(harness.restartStatus.textContent).toContain("current save is unchanged");
    expect(harness.dispatch).not.toHaveBeenCalled();

    harness.restartInput.value = "restartrestartrestart";
    harness.restartInput.dispatchEvent(new Event("change"));
    const nativeInvalid = new Event("invalid", { cancelable: true });
    harness.seedInput.dispatchEvent(nativeInvalid);
    expect(nativeInvalid.defaultPrevented).toBe(true);
    expect(harness.seedInput.getAttribute("aria-invalid")).toBe("true");
    expect(harness.seedInput.validationMessage).toContain("non-empty seed phrase");
    expect(harness.seedStatus.textContent).toContain("current save is unchanged");
    expect(harness.dispatch).not.toHaveBeenCalled();

    harness.seedInput.value = "   ";
    harness.newWorldForm.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(harness.dispatch).not.toHaveBeenCalled();
    expect(harness.seedInput.focus).toHaveBeenCalled();
  });

  it("dispatches exactly one guarded replacement for a rapid double activation", () => {
    const harness = restartFlowHarness();
    harness.flow.sync(harness.title(), true);
    harness.restartInput.value = "restartrestartrestart";
    harness.restartForm.dispatchEvent(new Event("submit", { cancelable: true }));
    harness.seedInput.value = "  glass mangrove  ";
    harness.seedInput.dispatchEvent(new Event("input"));

    harness.newWorldForm.dispatchEvent(new Event("submit", { cancelable: true }));
    harness.newWorldForm.dispatchEvent(new Event("submit", { cancelable: true }));

    expect(harness.dispatch).toHaveBeenCalledOnce();
    expect(harness.dispatch).toHaveBeenCalledWith({
      type: "new-world",
      seed: "glass mangrove",
      posture: "gale",
      sessionShape: "wander",
      restartPhrase: "restartrestartrestart",
    });
    expect(harness.flow.submitting).toBe(true);
    expect(harness.beginButton.disabled).toBe(true);
    expect(harness.newWorldForm.getAttribute("aria-busy")).toBe("true");
  });
});

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
    expect(copy.safety).toBe("↓ exposed to cross-current · STAB 63% · DEEP: STAM/STAB 0 → ADRIFT");
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
    expect(copy.safety).toContain("ADRIFT · Brace toward the lit bank.");
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
    expect(copy.safety).toBe("STABLE · STAB 100% · DEEP: STAM/STAB 0 → ADRIFT");
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

describe("resident ABOUT behavior", () => {
  it("is explicitly non-modal and leaves gameplay/charging unpaused", () => {
    const open = residentAboutSurfaceState({
      id: "porter-4",
      heading: "Reed-cloaked porter",
      identityLine: "A broad porter carrying an amber bale",
      knowledgeLabel: "Unfamiliar",
      observed: [],
      known: [],
      actionLabel: "GREET",
    });
    expect(open).toEqual({ hidden: false, modal: false, pausesGameplay: false });
    expect(residentAboutSurfaceState(undefined).hidden).toBe(true);
  });

  it("removes the greeting action after acquaintance instead of rendering a live-looking no-op", () => {
    const action = residentAboutActionPresentation({
      id: "porter-4",
      heading: "Mara Velo",
      identityLine: "Human · Adult",
      knowledgeLabel: "Acquainted",
      observed: [],
      known: [{ label: "Name", value: "Mara Velo" }],
    });

    expect(action).toEqual({ hidden: true, disabled: true, label: "", hint: "" });
  });

  it("cancels cleanly on Escape and consumes no unrelated key", () => {
    const dispatch = vi.fn();
    const escape = {
      key: "Escape",
      defaultPrevented: false,
      preventDefault: vi.fn(),
    };
    expect(handleResidentAboutEscape(escape, "porter-4", dispatch)).toBe(true);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "resident",
      action: "close",
      residentId: "porter-4",
    });

    expect(handleResidentAboutEscape(
      { ...escape, key: "Enter", preventDefault: vi.fn() },
      "porter-4",
      dispatch,
    )).toBe(false);
  });
});
