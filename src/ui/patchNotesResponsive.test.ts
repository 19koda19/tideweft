import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("Patch Notes and save-health responsive contract", () => {
  it("keeps Patch Notes independently scrollable with 44-pixel controls", () => {
    expect(styles).toMatch(/\.patch-notes-dialog__scroll\s*\{[^}]*overflow:\s*auto/isu);
    expect(styles).toMatch(/\.patch-notes-dialog__close\s*\{[^}]*44px/isu);
    expect(styles).toMatch(/\.patch-notes-trigger,[\s\S]*\.tutorial-page__action\s*\{[^}]*44px/isu);
  });

  it("uses horizontal and vertical safe areas for compact portrait and landscape", () => {
    const compact = styles.slice(styles.indexOf("/* Canonical offline Patch Notes"));
    expect(compact).toContain("env(safe-area-inset-left)");
    expect(compact).toContain("env(safe-area-inset-right)");
    expect(compact).toContain("env(safe-area-inset-top)");
    expect(compact).toContain("env(safe-area-inset-bottom)");
    expect(compact).toMatch(/max-height:\s*34rem/iu);
    expect(compact).toMatch(/\.patch-release__categories\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/isu);
  });

  it("keeps save health pointer-transparent on the field and every modal surface", () => {
    expect(styles).toMatch(/\.save-warning\s*\{[^}]*pointer-events:\s*none\s*!important/isu);
    expect(styles).toContain('.save-warning[data-surface="field"]');
    expect(styles).toContain('.save-warning[data-surface="title"]');
    expect(styles).toContain('.save-warning[data-surface="quiet-hour"]');
    expect(styles).toContain(".tutorial-dialog__header > .save-warning");
    expect(styles).toContain(".patch-notes-dialog__header > .save-warning");
    expect(styles).toContain(".kit-dialog__header > .save-warning");
    expect(styles).toMatch(/\.save-warning\[hidden\]\s*\{\s*display:\s*none\s*!important/isu);
    expect(styles).toMatch(
      /\.save-warning\[data-surface="field"\]\s*\{[^}]*right:\s*calc\(max\(0\.5rem, env\(safe-area-inset-right\)\) \+ 4\.3rem\)/isu,
    );
  });
});
