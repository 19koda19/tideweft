import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("./createTideweftUI.ts", import.meta.url), "utf8");
const chartSource = readFileSync(new URL("../render/p5Sketch.ts", import.meta.url), "utf8");
const reliefSource = readFileSync(new URL("../render/p5ReliefSketch.ts", import.meta.url), "utf8");
const desktopSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");

describe("resident ABOUT responsive shell", () => {
  it("is a semantic pane-free overlay with no glass class, fill, border, or blur", () => {
    expect(uiSource).toContain('createElement("aside", "resident-about")');
    expect(uiSource).not.toContain('"resident-about glass-panel"');
    expect(uiSource).toContain('residentAbout.setAttribute("role", "region")');
    const surfaceRule = styles.match(/#game-ui \.resident-about \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(surfaceRule).toContain("background: transparent");
    expect(surfaceRule).toContain("border: 0");
    expect(surfaceRule).toContain("box-shadow: none");
    expect(surfaceRule).toContain("backdrop-filter: none");
    expect(surfaceRule).toContain("pointer-events: none");
    expect(styles).toContain('.ui-layer[data-resident-about-open="true"] .chronicle-panel');
  });

  it("keeps both touch controls at 44px and clears the dock/safe areas in portrait and landscape", () => {
    expect(styles).toMatch(/\.resident-about__close,[\s\S]*?min-height: max\(2\.75rem, 44px\)/u);
    expect(styles).toMatch(/\.resident-about__greet[\s\S]*?min-width: max\(7\.25rem, 44px\)/u);
    expect(styles).toMatch(/\.resident-about__choice[\s\S]*?min-width: max\(5\.5rem, 44px\)/u);
    expect(styles).toContain("env(safe-area-inset-bottom)");
    expect(styles).toContain("@media (orientation: landscape) and (max-height: 34rem)");
    expect(styles).toContain("top: calc(var(--masthead-offset) + var(--ui-gap) + 5.1rem)");
    expect(styles).toContain("bottom: calc(max(0.35rem, env(safe-area-inset-bottom)) + 3.65rem)");
  });

  it("gives overflowing facts a real touch/wheel scroll target without capturing the whole overlay", () => {
    expect(uiSource).toContain('createElement("div", "resident-about__body")');
    expect(uiSource).toContain('residentAboutBody.setAttribute("aria-label", "Scrollable ABOUT details")');
    expect(uiSource).toContain("residentAboutBody.tabIndex = 0");
    const bodyRule = styles.match(/#game-ui \.resident-about__body \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(bodyRule).toContain("overflow-y: auto");
    expect(bodyRule).toContain("overscroll-behavior: contain");
    expect(bodyRule).toContain("touch-action: pan-y");
    expect(bodyRule).toContain("pointer-events: auto");
    expect(uiSource).toContain("if (actorChanged) refs.residentAboutBody.scrollTop = 0");
  });

  it("sends a settled discrete wheel gesture to the packaged ABOUT scroll surface", () => {
    expect(desktopSource).toContain("contents.focus()");
    expect(desktopSource).toContain("wheelTicksY: deltaY / 120");
    expect(desktopSource).toContain("hasPreciseScrollingDeltas: false");
    expect(desktopSource).toContain(
      "Math.abs((moved.residentAbout?.body?.scrollTop ?? 0) - initialScrollTop) > 1",
    );
  });

  it("renders an accessible visible reason whenever GREET is disabled", () => {
    expect(uiSource).toContain('residentAboutActionHint.id = "resident-about-action-hint"');
    expect(uiSource).toContain("const showDisabledReason = action.disabled && action.hint.length > 0");
    expect(uiSource).toContain('refs.residentAboutGreet.setAttribute("aria-describedby", refs.residentAboutActionHint.id)');
    expect(styles).toContain("#game-ui .resident-about__action-hint[hidden]");
    expect(uiSource).toContain('button.setAttribute("aria-describedby", hint.id)');
    expect(uiSource).toContain('"resident-about__choice-hint"');
  });

  it("announces without stealing focus, restores only entered focus, and never renders a porter name", () => {
    expect(uiSource).not.toContain('residentAbout.setAttribute("aria-live", "polite")');
    expect(uiSource).not.toContain("dataset.stableId");
    expect(uiSource).not.toContain("dataset.actorId");
    expect(uiSource).toContain("refs.residentAbout.dataset.species = actor.species");
    expect(uiSource).toContain('let lastResidentAbout = "__unrendered__"');
    expect(uiSource).not.toContain("refs.residentAboutClose.focus(");
    expect(uiSource).toContain('refs.residentAbout.addEventListener("focusin", onResidentAboutFocusIn)');
    expect(uiSource).toContain("const previous = event.relatedTarget");
    expect(uiSource).toContain("target.focus({ preventScroll: true })");
    const chartPorters = chartSource.slice(
      chartSource.indexOf("const drawPorters"),
      chartSource.indexOf("const drawDestination"),
    );
    const reliefPorters = reliefSource.slice(
      reliefSource.indexOf("const drawPorters"),
      reliefSource.indexOf("const drawDestination", reliefSource.indexOf("const drawPorters")),
    );
    expect(chartPorters).not.toContain("porter.name");
    expect(reliefPorters).not.toContain("porter.name");
    expect(chartPorters).toContain("porterQuickLabel");
    expect(chartPorters).not.toContain("p.rect(labelX");
    expect(reliefSource).toContain("porterQuickLabel");
    const porterTone = styles.match(/\.relief-world-label\[data-tone="porter"\] \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(porterTone).toContain("background: transparent");
    expect(porterTone).toContain("border: 0");
    expect(porterTone).toContain("box-shadow: none");
  });

  it("keeps quick and full actor disclosure as floating type and omits empty sections", () => {
    expect(uiSource).toContain('createElement("p", "resident-about__quick")');
    expect(uiSource).toContain("refs.residentAboutQuick.textContent = actor.quickSummary");
    expect(uiSource).toContain("refs.residentAboutKnownHeading.hidden = actor.known.length === 0");
    expect(uiSource).toContain("refs.residentAboutKnown.hidden = actor.known.length === 0");
    expect(styles).toContain("#game-ui .resident-about__quick[hidden]");
    const quickRule = styles.match(/#game-ui \.resident-about__quick \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(quickRule).not.toMatch(/background|border|box-shadow|backdrop-filter/u);
  });
});
