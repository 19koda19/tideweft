import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { mobileHudCopy, navigationTelemetryCopy } from "./createTideweftUI";

const source = readFileSync(new URL("./createTideweftUI.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("desktop/mobile authoritative field parity", () => {
  it("derives both layouts from the same terrain and stability copy", () => {
    const copy = mobileHudCopy({
      objectiveTitle: undefined,
      objectiveRoute: undefined,
      objectiveProgress: undefined,
      stamina: 0.74,
      stability: 0.51,
      stabilityHint: "Falling · cross-current and soft footing",
      isWater: false,
      terrain: "Brine Flat · Shell Sandbar",
      depth: "Dry footing",
      effort: "Soft ground effort",
      swept: false,
      fieldHint: "Watch your line",
      canScan: true,
      interactLabel: undefined,
      wayknotLabel: undefined,
    });
    expect(copy.terrain).toBe(
      "GROUND · Brine Flat · Shell Sandbar · Dry footing · Soft ground effort",
    );
    expect(copy.safety).toContain("cross-current and soft footing");
    expect(copy.safety).toContain("STAB 51%");
    expect(copy.safety).toContain("DEEP: STAM/STAB 0 → ADRIFT");
    expect(source).toContain("terrain: presentedTerrainLabel");
    expect(source).toContain("syncTextContent(refs.mobileTerrain, compactHud.terrain)");
    expect(source).toContain("syncTextContent(refs.desktopFieldTerrain, compactHud.terrain)");
    expect(source).toContain("refs.mobileSafety.textContent = compactHud.safety");
    expect(source).toContain("refs.desktopFieldSafety.textContent = compactHud.safety");
  });

  it("keeps continuous E/N coordinates and measured FPS in both copies", () => {
    const navigation = {
      regionX: -2,
      regionY: 3,
      localX: 4,
      localY: 5,
      globalX: -124,
      globalY: 215,
    };
    const telemetry = { fps: 59.8, frameTimeMs: 16.7, frameCount: 90, active: true };
    const desktop = navigationTelemetryCopy(navigation, telemetry);
    const mobile = navigationTelemetryCopy(navigation, telemetry, true);
    for (const token of ["-124", "+215", "60 FPS"]) {
      expect(desktop).toContain(token);
      expect(mobile).toContain(token);
    }
    expect(desktop).not.toMatch(/region|local/iu);
    expect(mobile).not.toMatch(/\bR\b|\bL\b/u);
  });

  it("mounts desktop field truth outside the optional objective and keeps it pane-free", () => {
    expect(source.indexOf("desktopFieldLine,")).toBeLessThan(source.indexOf("mobileFieldStrip,"));
    expect(source).toContain("refs.objectivePanel.hidden = !objective");
    const rule = styles.match(/#game-ui \.desktop-field-line \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(rule).toContain("background: transparent");
    expect(rule).toContain("border: 0");
    expect(rule).toContain("box-shadow: none");
  });
});
