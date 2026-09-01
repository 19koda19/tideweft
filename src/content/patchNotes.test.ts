import { describe, expect, it } from "vitest";

import patchNotesJson from "./patchNotes.json";
import {
  LATEST_PATCH_NOTE,
  PATCH_NOTE_CATEGORIES,
  PATCH_NOTES_SCHEMA_VERSION,
  TIDEWEFT_PATCH_NOTES,
  comparePatchNoteVersions,
  validatePatchNotesDocument,
} from "./patchNotes";

const copy = (): unknown => JSON.parse(JSON.stringify(patchNotesJson));
const allCategoryCopy = (category: (typeof PATCH_NOTE_CATEGORIES)[number]): string =>
  TIDEWEFT_PATCH_NOTES.releases.flatMap((release) => release.categories[category]).join(" ");

describe("canonical offline patch notes", () => {
  it("validates the one canonical source with all six ordered categories", () => {
    expect(TIDEWEFT_PATCH_NOTES.schemaVersion).toBe(PATCH_NOTES_SCHEMA_VERSION);
    expect(Object.keys(LATEST_PATCH_NOTE.categories)).toEqual(PATCH_NOTE_CATEGORIES);
    expect(LATEST_PATCH_NOTE).toMatchObject({
      version: "0.3.3-alpha.0",
      buildIdentity: "0.3.3-alpha.0",
      gameplayContractVersion: 9,
      tutorialVersion: 10,
    });
    expect(PATCH_NOTE_CATEGORIES.every(
      (category) => LATEST_PATCH_NOTE.categories[category].length > 0,
    )).toBe(true);
  });

  it("uses SemVer precedence to reject newest-first mistakes on the same date", () => {
    expect(comparePatchNoteVersions("0.3.1-alpha.0", "0.3.0-alpha.1")).toBeGreaterThan(0);
    const document = copy() as { releases: unknown[] };
    document.releases.reverse();
    expect(() => validatePatchNotesDocument(document)).toThrow(/newest first/u);
  });

  it("rejects duplicate versions, builds, missing categories, and malformed contracts", () => {
    const extraRoot = copy() as any;
    extraRoot.unreviewedRelease = true;
    expect(() => validatePatchNotesDocument(extraRoot)).toThrow(/exactly schemaVersion and releases/u);

    const duplicate = copy() as any;
    duplicate.releases[1].version = duplicate.releases[0].version;
    expect(() => validatePatchNotesDocument(duplicate)).toThrow(/Duplicate release version/u);

    const duplicateBuild = copy() as any;
    duplicateBuild.releases[1].buildIdentity = duplicateBuild.releases[0].buildIdentity;
    expect(() => validatePatchNotesDocument(duplicateBuild)).toThrow(/Duplicate build identity/u);

    const missingCategory = copy() as any;
    delete missingCategory.releases[0].categories.fixes;
    expect(() => validatePatchNotesDocument(missingCategory)).toThrow(/six canonical categories/u);

    const badContract = copy() as any;
    badContract.releases[0].tutorialVersion = 0;
    expect(() => validatePatchNotesDocument(badContract)).toThrow(/positive safe integer/u);
  });

  it("rejects raw markup and multiline injection before any renderer sees it", () => {
    const html = copy() as any;
    html.releases[0].summary = "<img src=x onerror=alert(1)>";
    expect(() => validatePatchNotesDocument(html)).toThrow(/plain text/u);

    const markdown = copy() as any;
    markdown.releases[0].categories.fixes[0] = "safe\n# injected heading";
    expect(() => validatePatchNotesDocument(markdown)).toThrow(/plain text/u);
  });

  it("does not announce foundation-only systems as live", () => {
    const activeCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => LATEST_PATCH_NOTE.categories[category])
      .join(" ");
    const limitations = allCategoryCopy("knownLimitations");
    expect(activeCopy).not.toMatch(/infinite region streaming|wildlife encounters are live|procedural ladder-gated outcrops are live/iu);
    expect(activeCopy).toContain("cross regional horizons");
    expect(activeCopy).toContain("Bounded five-region streaming");
    expect(limitations).toContain("not live");
    expect(limitations).toContain("infinite streaming");
  });

  it("states the non-pausing field behavior without claiming a hidden time stop", () => {
    const saveCopy = allCategoryCopy("saves");
    expect(saveCopy).toContain("dispatches no simulation or save command");
    expect(saveCopy).toContain("world continues underneath");
    expect(saveCopy).not.toContain("never advances the simulation");
  });

  it("documents persistent save failure, bounded fresh retries, and recovery", () => {
    const fixes = allCategoryCopy("fixes");
    const saves = allCategoryCopy("saves");
    expect(fixes).toContain("LOCAL SAVE NOT STORED");
    expect(fixes).toContain("Quiet Hour, KIT, tutorial, and Patch Notes");
    expect(saves).toContain("bounded backoff");
    expect(saves).toContain("fresh snapshot");
    expect(saves).toContain("changes made after the failure are included");
    expect(saves).toContain("LOCAL SAVE RESTORED");
    expect(fixes).toContain("never chosen silently");
    expect(fixes).toContain("non-empty replacement seed");
    expect(fixes).toContain("stops retrying");
    expect(fixes).toContain("either configured browser-storage backend cannot be read");
    expect(fixes).toContain("unverifiable surviving copy");
    expect(fixes).toContain("LOCAL SAVE UNAVAILABLE");
    expect(fixes).toContain("disables Continue, seed creation, and restart");
    expect(saves).toContain("version and fingerprint fences");
    expect(saves).toContain("newer durable version");
    expect(saves).toContain("only the latest requested snapshot");
    expect(saves).toContain("clear this game's stored site data");
    expect(saves).toContain("partial or total backend read failure");
    expect(saves).toContain("performs no automatic retry or write");
    expect(saves).toContain("if either store cannot be read, no copy is adopted");
    expect(allCategoryCopy("knownLimitations")).toContain("largest safe integer");
  });
});
