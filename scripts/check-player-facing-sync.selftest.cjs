#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const {
  evaluateCommitRange,
  evaluateChangedFiles,
  extractTutorialVersion,
  isAuthoritativePath,
  normalizeRepoPath,
  parseNameStatusZ,
  requiredReviewSurface,
  resolveChangedFiles,
  validateBuildMetadata,
  validateContentDocuments,
  validateElectronSmokeMetadata,
  validateElectronSmokeSaveVersion,
  validateGameplayContract,
  validateLocalContent,
  validateReviewAdvancement,
} = require("./check-player-facing-sync.cjs");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/content/gameplayContract.json"), "utf8"));
const patchNotes = JSON.parse(fs.readFileSync(path.join(root, "src/content/patchNotes.json"), "utf8"));
const packageDocument = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tutorialSource = fs.readFileSync(path.join(root, manifest.tutorialSourcePath), "utf8");

let assertions = 0;
function test(name, body) {
  try {
    body();
    assertions += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("the exact one-difficulty identity and required mechanic surface validate", () => {
  assert.deepEqual(validateGameplayContract(manifest), []);
  assert.equal(manifest.contractId, "challenging-hard");
  assert.equal(manifest.displayName, "A CHALLENGING HARD");
  assert.equal(manifest.difficultyCount, 1);
  assert.ok(requiredReviewSurface.every((entry) => manifest.reviewSurface.includes(entry)));
});

test("authoritative path classification covers current, future, and Windows paths but not tests", () => {
  assert.equal(isAuthoritativePath("src/game/player.ts", manifest), true);
  assert.equal(isAuthoritativePath("src\\ui\\mobileBrace.ts", manifest), true);
  assert.equal(isAuthoritativePath("src/world/regions/streamer.ts", manifest), true);
  assert.equal(isAuthoritativePath("src/actors/bears.ts", manifest), true);
  assert.equal(isAuthoritativePath("src/content/itemCatalog.ts", manifest), true);
  assert.equal(isAuthoritativePath("src/future-system/newRule.ts", manifest), true);
  assert.equal(isAuthoritativePath("src/platform/saveMigration.ts", manifest), true);
  assert.equal(isAuthoritativePath("src/content/gameplayContract.json", manifest), true);
  assert.equal(isAuthoritativePath("src/content/patchNotes.ts", manifest), true);
  assert.equal(isAuthoritativePath("src/content/patchNotes.json", manifest), false);
  assert.equal(isAuthoritativePath("src/game/player.test.ts", manifest), false);
  assert.equal(isAuthoritativePath("src/ui/tutorialGuide.ts", manifest), false);
  assert.equal(isAuthoritativePath("README.md", manifest), false);
  assert.equal(normalizeRepoPath(".\\src\\game\\player.ts"), "src/game/player.ts");
  assert.equal(
    evaluateChangedFiles(["src/content/patchNotes.ts"], manifest).errors.length,
    2,
  );
});

test("an authoritative-only range fails both required reviews", () => {
  const result = evaluateChangedFiles(["src/game/player.ts"], manifest);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors.join(" "), /tutorialGuide\.ts/u);
  assert.match(result.errors.join(" "), /patchNotes\.json/u);
});

test("an authoritative plus tutorial range still fails without canonical patch notes", () => {
  const result = evaluateChangedFiles(["src/game/player.ts", manifest.tutorialSourcePath], manifest);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /patchNotes\.json/u);
});

test("authoritative, tutorial, and patch-note changes pass the range decision", () => {
  const result = evaluateChangedFiles([
    "src/game/player.ts",
    manifest.tutorialSourcePath,
    manifest.patchNoteSourcePath,
  ], manifest);
  assert.deepEqual(result.errors, []);
});

test("docs-only changes need no gameplay release review", () => {
  const result = evaluateChangedFiles(["README.md", "docs/GAME_DESIGN.md"], manifest);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.authoritativeFiles, []);
});

test("rename status checks both old and new paths", () => {
  const paths = parseNameStatusZ("R100\0src/game/oldRule.ts\0docs/oldRule.md\0M\0README.md\0");
  assert.deepEqual(paths, ["src/game/oldRule.ts", "docs/oldRule.md", "README.md"]);
  assert.equal(evaluateChangedFiles(paths, manifest).errors.length, 2);
});

test("the explicit tutorial constant is parsed without matching unrelated versions", () => {
  assert.equal(extractTutorialVersion("const version = 99;\nexport const TUTORIAL_CONTENT_VERSION = 6 as const;"), 6);
  assert.equal(extractTutorialVersion("export const TUTORIAL_CONTENT_VERSION = 0 as const;"), null);
  assert.equal(extractTutorialVersion("version: 6"), null);
  assert.equal(
    extractTutorialVersion(
      "export const TIDEWEFT_TUTORIAL_GUIDE: TutorialGuide = { version: 5, title: 'old' };",
      { allowLegacyGuideObject: true },
    ),
    5,
  );
});

test("current content contracts agree", () => {
  const result = validateContentDocuments({ manifest, tutorialSource, patchNotes, packageDocument });
  assert.deepEqual(result.errors, []);
  assert.equal(result.tutorialVersion, 74);
});

test("the first explicit tutorial contract advances the legacy v5 guide", () => {
  const fixture = createRangeFixture("legacy-guide", { legacyTutorial: true });
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
    fixture.commit("adopt explicit tutorial contract");
    const evaluation = evaluateChangedFiles([
      "src/game/player.ts",
      manifest.tutorialSourcePath,
      manifest.patchNoteSourcePath,
    ], manifest);
    assert.deepEqual(validateReviewAdvancement({
      root: fixture.root,
      base: fixture.base,
      evaluation,
      manifest,
      tutorialVersion: 10,
      patchNotes,
      packageDocument,
    }), []);
  } finally {
    fixture.destroy();
  }
});

test("browser metadata exposes the same official ruleset and release identity", () => {
  const valid = `<meta content="A CHALLENGING HARD" name="tideweft-ruleset"><meta name="tideweft-build" content="${packageDocument.version}">`;
  assert.deepEqual(validateBuildMetadata(valid, manifest, packageDocument), []);
  assert.equal(validateBuildMetadata(valid.replace("A CHALLENGING HARD", "Normal"), manifest, packageDocument).length, 1);
  assert.equal(validateBuildMetadata(valid.replace(packageDocument.version, "stale"), manifest, packageDocument).length, 1);
  assert.equal(validateBuildMetadata("", manifest, packageDocument).length, 2);
});

test("packaged smoke expectations match the current release contract", () => {
  const valid = `const SMOKE_EXPECTED_RELEASE_VERSION = '${packageDocument.version}';\n`
    + `const SMOKE_EXPECTED_GAMEPLAY_CONTRACT_VERSION = ${manifest.gameplayContractVersion};\n`;
  assert.deepEqual(validateElectronSmokeMetadata(valid, manifest, packageDocument), []);
  assert.equal(
    validateElectronSmokeMetadata(
      valid.replace(packageDocument.version, "0.0.0-stale"),
      manifest,
      packageDocument,
    ).length,
    1,
  );
  assert.equal(
    validateElectronSmokeMetadata(
      valid.replace(
        String(manifest.gameplayContractVersion),
        String(manifest.gameplayContractVersion - 1),
      ),
      manifest,
      packageDocument,
    ).length,
    1,
  );
  assert.equal(validateElectronSmokeMetadata("", manifest, packageDocument).length, 2);
});

test("packaged smoke expects the current authoritative save version", () => {
  const electronSource = "const SMOKE_EXPECTED_SAVE_VERSION = 23;";
  const runtimeSource = "const GAME_SAVE_VERSION = CURRENT_GAME_SAVE_VERSION;";
  const savePolicySource = "export const CURRENT_GAME_SAVE_VERSION = 23 as const;";
  assert.deepEqual(
    validateElectronSmokeSaveVersion(electronSource, runtimeSource, savePolicySource),
    [],
  );
  assert.equal(
    validateElectronSmokeSaveVersion(
      electronSource.replace("23", "22"),
      runtimeSource,
      savePolicySource,
    ).length,
    1,
  );
  assert.equal(
    validateElectronSmokeSaveVersion("", runtimeSource, savePolicySource).length,
    1,
  );
  assert.equal(
    validateElectronSmokeSaveVersion(electronSource, "", savePolicySource).length,
    1,
  );
  assert.equal(
    validateElectronSmokeSaveVersion(electronSource, runtimeSource, "").length,
    1,
  );
});

test("unsafe or missing gameplay schema fails closed", () => {
  const unsafe = structuredClone(manifest);
  unsafe.schemaVersion = 2;
  unsafe.authoritativeExactPaths = ["../src/game/player.ts"];
  const errors = validateGameplayContract(unsafe);
  assert.ok(errors.some((error) => error.includes("schemaVersion")));
  assert.ok(errors.some((error) => error.includes("unsafe")));

  const missing = structuredClone(manifest);
  delete missing.displayName;
  assert.match(validateGameplayContract(missing)[0], /exactly the supported/u);
});

test("gameplay manifest exclusions cannot weaken the production-source safety net", () => {
  const excludedGameplay = structuredClone(manifest);
  excludedGameplay.authoritativeExcludedPaths.push("src/game/player.ts");
  assert.ok(validateGameplayContract(excludedGameplay).some(
    (error) => error.includes("authoritativeExcludedPaths may contain exactly"),
  ));

  const broadSuffix = structuredClone(manifest);
  broadSuffix.authoritativeExcludedSuffixes.push(".ts");
  assert.ok(validateGameplayContract(broadSuffix).some(
    (error) => error.includes("supported test/spec filename suffixes"),
  ));

  const retargetedTutorial = structuredClone(manifest);
  retargetedTutorial.tutorialSourcePath = "src/game/player.ts";
  retargetedTutorial.authoritativeExcludedPaths = [
    retargetedTutorial.patchNoteSourcePath,
    retargetedTutorial.tutorialSourcePath,
  ];
  assert.ok(validateGameplayContract(retargetedTutorial).some(
    (error) => error.includes("tutorialSourcePath must remain"),
  ));

  const missingOuterRuntime = structuredClone(manifest);
  missingOuterRuntime.authoritativeExactPaths = missingOuterRuntime.authoritativeExactPaths.filter(
    (entry) => entry !== "electron/main.cjs",
  );
  assert.ok(validateGameplayContract(missingOuterRuntime).some(
    (error) => error.includes("must retain electron/main.cjs"),
  ));
});

test("malformed patch schema and stale coverage fail closed", () => {
  const malformed = structuredClone(patchNotes);
  malformed.releases[0].categories.secretDifficulty = ["easier loot"];
  malformed.releases[0].tutorialVersion = 5;
  const result = validateContentDocuments({ manifest, tutorialSource, patchNotes: malformed, packageDocument });
  assert.ok(result.errors.some((error) => error.includes("categories must contain exactly")));
  assert.ok(result.errors.some((error) => error.includes("current tutorial")));
});

test("deleted canonical sources cannot be hidden by a changed-file record", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tideweft-sync-test-"));
  try {
    fs.mkdirSync(path.join(tempRoot, "src/content"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "src/ui"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, manifestRelativeForTest()), JSON.stringify(manifest));
    fs.writeFileSync(path.join(tempRoot, manifest.tutorialSourcePath), tutorialSource);
    fs.writeFileSync(path.join(tempRoot, "package.json"), JSON.stringify(packageDocument));
    fs.writeFileSync(
      path.join(tempRoot, "index.html"),
      `<meta name="tideweft-ruleset" content="A CHALLENGING HARD"><meta name="tideweft-build" content="${packageDocument.version}">`,
    );
    const result = validateLocalContent(tempRoot);
    assert.ok(result.errors.some((error) => error.includes(manifest.patchNoteSourcePath)));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("all-zero pushes and manual dispatches validate repository history", () => {
  const fixture = createRangeFixture("history-events");
  try {
    fixture.writeCurrentReview();
    fixture.commit("initial reviewed release");
    const reviewedHead = fixture.git("rev-parse", "HEAD");

    const zero = resolveChangedFiles({
      root: fixture.root,
      base: "0".repeat(40),
      head: reviewedHead,
      eventName: "push",
    });
    assert.equal(zero.mode, "history");
    assert.equal(zero.base, "");
    assert.deepEqual(evaluateCommitRange({
      root: fixture.root,
      base: zero.base,
      head: zero.head,
      fallbackManifest: manifest,
    }).errors, []);

    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("unreviewed head authority");
    const unreviewedHead = fixture.git("rev-parse", "HEAD");
    const dispatch = resolveChangedFiles({
      root: fixture.root,
      base: fixture.base,
      head: unreviewedHead,
      eventName: "workflow_dispatch",
    });
    assert.equal(dispatch.mode, "history");
    assert.equal(dispatch.base, "");
    const result = evaluateCommitRange({
      root: fixture.root,
      base: dispatch.base,
      head: dispatch.head,
      fallbackManifest: manifest,
    });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /is not contained in final release checkpoint/u);
  } finally {
    fixture.destroy();
  }
});

test("history validation requires the final checkpoint to advance its immediate predecessor", () => {
  const fixture = createRangeFixture("history-advancement");
  try {
    fixture.writeCurrentReview();
    fixture.commit("reviewed release");
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("authoritative slice");
    fixture.write(manifest.tutorialSourcePath, `${tutorialSource}\n// stale review\n`);
    fixture.write(manifest.patchNoteSourcePath, `${JSON.stringify(patchNotes, null, 2)}\n`);
    fixture.write("package.json", `${JSON.stringify(packageDocument, null, 2)}\n`);
    fixture.commit("non-advancing checkpoint");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: "",
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.ok(result.errors.some((error) => error.includes("Tutorial review must advance")));
    assert.ok(result.errors.some((error) => error.includes("Patch-note review must add")));
  } finally {
    fixture.destroy();
  }
});

test("release advancement cannot rewrite the latest release in place", () => {
  const fixture = createRangeFixture("in-place-release-rewrite");
  try {
    fixture.writeCurrentReview();
    fixture.commit("reviewed release");
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("authoritative slice");

    const rewrittenPatchNotes = structuredClone(patchNotes);
    rewrittenPatchNotes.releases[0].tutorialVersion += 1;
    rewrittenPatchNotes.releases[0].buildIdentity += "-rewritten";
    fixture.write(
      manifest.tutorialSourcePath,
      tutorialSource.replace(
        /TUTORIAL_CONTENT_VERSION = [0-9]+ as const;/u,
        `TUTORIAL_CONTENT_VERSION = ${rewrittenPatchNotes.releases[0].tutorialVersion} as const;`,
      ),
    );
    fixture.write(manifest.patchNoteSourcePath, JSON.stringify(rewrittenPatchNotes, null, 2));
    fixture.write("package.json", JSON.stringify({
      ...packageDocument,
      description: "unrelated package touch",
    }, null, 2));
    fixture.commit("rewrite current release identity");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.ok(result.errors.some((error) => error.includes("package.json version must advance")));
    assert.ok(result.errors.some((error) => error.includes("preserving prior release identities and order")));
  } finally {
    fixture.destroy();
  }
});

test("deleted or malformed review shadows cannot hide the last coherent checkpoint", () => {
  for (const shadowKind of ["deleted", "malformed"]) {
    const fixture = createRangeFixture(`checkpoint-shadow-${shadowKind}`);
    try {
      fixture.writeCurrentReview();
      fixture.commit("coherent release checkpoint");

      if (shadowKind === "deleted") {
        for (const relativePath of [
          manifest.tutorialSourcePath,
          manifest.patchNoteSourcePath,
          "package.json",
        ]) {
          fs.rmSync(path.join(fixture.root, relativePath));
        }
      } else {
        fixture.write(manifest.tutorialSourcePath, "export const BROKEN_TUTORIAL = true;\n");
        fixture.write(manifest.patchNoteSourcePath, "{broken patch notes\n");
        fixture.write("package.json", "{broken package\n");
      }
      fixture.commit(`${shadowKind} review shadow`);
      fixture.write("src/game/player.ts", "export const pace = 2;\n");
      fixture.commit("authority after invalid shadow");
      fixture.writeCurrentReview();
      fixture.commit("restore unchanged coherent review");

      const result = evaluateCommitRange({
        root: fixture.root,
        base: fixture.base,
        head: "HEAD",
        fallbackManifest: manifest,
      });
      assert.ok(result.errors.some((error) => error.includes("Tutorial review must advance")));
      assert.ok(result.errors.some((error) => error.includes("package.json version must advance")));
      assert.ok(result.errors.some((error) => error.includes("Patch-note review must add")));
    } finally {
      fixture.destroy();
    }
  }
});

test("a coherent rollback cannot shadow a newer prior checkpoint", () => {
  const fixture = createRangeFixture("coherent-rollback-shadow");
  try {
    fixture.writeCurrentReview();
    fixture.commit("alpha 59 checkpoint");
    fixture.writeIntermediateReview();
    fixture.commit("coherent alpha 58 rollback shadow");
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("authority after rollback shadow");
    fixture.writeCurrentReview();
    fixture.commit("restore alpha 59 without advancing");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.ok(result.errors.some((error) => error.includes("Tutorial review must advance")));
    assert.ok(result.errors.some((error) => error.includes("Patch-note review must add")));
    assert.ok(result.errors.some((error) => error.includes("package.json version must advance")));
  } finally {
    fixture.destroy();
  }
});

test("an authoritative commit cannot be repaired by unrelated later docs", () => {
  const fixture = createRangeFixture("split-docs");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("authoritative only");
    const authoritativeCommit = fixture.git("rev-parse", "HEAD");
    fixture.write("README.md", "base\ndocs\n");
    fixture.commit("docs only");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.equal(result.commits.length, 2);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /final atomic release checkpoint/u);
    assert.match(result.errors[0], /tutorialGuide\.ts/u);
    assert.match(result.errors[0], /patchNotes\.json/u);
    assert.match(result.errors[0], /package\.json/u);
    assert.ok(authoritativeCommit.length > 0);
    assert.deepEqual(result.commits[1].errors, []);
  } finally {
    fixture.destroy();
  }
});

test("one final atomic checkpoint review covers preserved authoritative slice commits", () => {
  const fixture = createRangeFixture("split-reviews");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("first authoritative slice");
    const firstAuthoritativeCommit = fixture.git("rev-parse", "HEAD");
    fixture.write("src/game/route.ts", "export const routeCost = 3;\n");
    fixture.commit("second authoritative slice");
    const secondAuthoritativeCommit = fixture.git("rev-parse", "HEAD");
    fixture.writeCurrentReview();
    fixture.commit("final release checkpoint");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.deepEqual(result.errors, []);
    assert.ok(firstAuthoritativeCommit.length > 0);
    assert.ok(secondAuthoritativeCommit.length > 0);
    assert.equal(result.commits.length, 3);
    assert.deepEqual(result.commits[2].errors, []);
  } finally {
    fixture.destroy();
  }
});

test("tutorial and patch review without an atomic version update cannot close a range", () => {
  const fixture = createRangeFixture("split-reviews-no-version");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("authoritative slice");
    fixture.writeCurrentTutorialAndPatch();
    fixture.commit("incomplete release review");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /final atomic release checkpoint/u);
    assert.match(result.errors[0], /package\.json/u);
  } finally {
    fixture.destroy();
  }
});

test("an authoritative change after the final checkpoint review fails closed", () => {
  const fixture = createRangeFixture("post-checkpoint-authority");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
    fixture.commit("release checkpoint");
    const checkpointCommit = fixture.git("rev-parse", "HEAD");
    fixture.write("src/game/player.ts", "export const pace = 3;\n");
    fixture.commit("late authoritative change");
    const lateCommit = fixture.git("rev-parse", "HEAD");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], new RegExp(lateCommit.slice(0, 12), "u"));
    assert.match(result.errors[0], new RegExp(checkpointCommit.slice(0, 12), "u"));
    assert.match(result.errors[0], /is not contained in final release checkpoint/u);
  } finally {
    fixture.destroy();
  }
});

test("a docs-only commit after the final checkpoint remains allowed", () => {
  const fixture = createRangeFixture("post-checkpoint-docs");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
    fixture.commit("release checkpoint");
    fixture.write("README.md", "base\nrelease attestation\n");
    fixture.commit("attest release docs");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.commits.length, 2);
    assert.deepEqual(result.commits[1].authoritativeFiles, []);
  } finally {
    fixture.destroy();
  }
});

test("a partial review-surface mutation after the checkpoint fails closed", () => {
  const fixture = createRangeFixture("post-checkpoint-partial-review");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
    fixture.commit("release checkpoint");
    const checkpointCommit = fixture.git("rev-parse", "HEAD");
    fixture.write(manifest.tutorialSourcePath, `${tutorialSource}\n// late wording edit\n`);
    fixture.commit("late tutorial-only review");
    const lateReview = fixture.git("rev-parse", "HEAD");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], new RegExp(lateReview.slice(0, 12), "u"));
    assert.match(result.errors[0], new RegExp(checkpointCommit.slice(0, 12), "u"));
    assert.match(result.errors[0], /Review-surface commit/u);
  } finally {
    fixture.destroy();
  }
});

test("an intermediate invalid gameplay manifest fails closed even when a later checkpoint repairs it", () => {
  const fixture = createRangeFixture("invalid-intermediate-manifest");
  try {
    const invalidManifest = structuredClone(manifest);
    invalidManifest.schemaVersion = 2;
    fixture.write(manifestRelativeForTest(), JSON.stringify(invalidManifest, null, 2));
    fixture.commit("invalid gameplay manifest");
    const invalidCommit = fixture.git("rev-parse", "HEAD");

    fixture.write(manifestRelativeForTest(), JSON.stringify(manifest, null, 2));
    fixture.writeCurrentReview();
    fixture.commit("repair at release checkpoint");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.ok(result.errors.some((error) => error.includes(invalidCommit.slice(0, 12))));
    assert.ok(result.errors.some((error) => error.includes("schemaVersion")));
  } finally {
    fixture.destroy();
  }
});

test("one atomic authoritative, tutorial, patch, and version commit passes", () => {
  const fixture = createRangeFixture("atomic");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
    fixture.commit("atomic gameplay release");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.equal(result.commits.length, 1);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.commits[0].errors, []);
    assert.deepEqual(result.commits[0].authoritativeFiles, ["src/game/player.ts"]);
  } finally {
    fixture.destroy();
  }
});

test("a docs-only commit range remains exempt", () => {
  const fixture = createRangeFixture("docs-only");
  try {
    fixture.write("README.md", "base\ndocs\n");
    fixture.commit("docs only");
    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.commits[0].authoritativeFiles, []);
  } finally {
    fixture.destroy();
  }
});

test("an atomic feature merge requires a non-merge checkpoint after integration", () => {
  const fixture = createRangeFixture("merge");
  try {
    fixture.git("checkout", "--quiet", "-b", "feature", fixture.base);
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeIntermediateReview();
    fixture.commit("atomic feature release");

    fixture.git("checkout", "--quiet", "main");
    fixture.write("README.md", "base\nmain docs\n");
    fixture.commit("main docs");
    fixture.git("merge", "--quiet", "--no-ff", "feature", "-m", "merge feature");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    const merge = result.commits.find((commit) => commit.kind === "merge-first-parent");
    assert.ok(merge);
    assert.ok(result.errors.some((error) => error.includes(merge.commit.slice(0, 12))));
    assert.ok(result.errors.some((error) => error.includes("is not contained in final release checkpoint")));
    assert.equal(merge.parents.length, 2);
    assert.deepEqual(merge.errors, []);
    assert.deepEqual(merge.mergeResolutionPaths, []);
    assert.deepEqual(merge.authoritativeFiles, ["src/game/player.ts"]);

    fixture.writeCurrentReview();
    fixture.commit("advance post-merge release checkpoint");
    const advanced = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.deepEqual(advanced.errors, []);
  } finally {
    fixture.destroy();
  }
});

test("a second-parent checkpoint cannot review later authority on that branch", () => {
  const fixture = createRangeFixture("merge-second-parent-late-authority");
  try {
    fixture.git("checkout", "--quiet", "-b", "feature", fixture.base);
    fixture.writeIntermediateReview();
    fixture.commit("feature checkpoint");
    const featureCheckpoint = fixture.git("rev-parse", "HEAD");
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("unreviewed feature authority");
    const lateAuthority = fixture.git("rev-parse", "HEAD");

    fixture.git("checkout", "--quiet", "main");
    fixture.write("README.md", "base\nolder main\n");
    fixture.commit("older main docs");
    fixture.git("merge", "--quiet", "--no-ff", "feature", "-m", "merge feature");
    const mergeCommit = fixture.git("rev-parse", "HEAD");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    const merge = result.commits.find((commit) => commit.commit === mergeCommit);
    assert.ok(merge);
    assert.deepEqual(merge.authoritativeFiles, ["src/game/player.ts"]);
    assert.ok(result.errors.some((error) => error.includes(mergeCommit.slice(0, 12))));
    assert.ok(result.errors.some((error) => error.includes("is not contained in final release checkpoint")));
    assert.ok(featureCheckpoint.length > 0);
    assert.ok(lateAuthority.length > 0);
  } finally {
    fixture.destroy();
  }
});

test("split pre-merge review files cannot certify later feature authority", () => {
  const fixture = createRangeFixture("merge-split-review");
  try {
    fixture.git("checkout", "--quiet", "-b", "feature", fixture.base);
    fixture.write(manifest.tutorialSourcePath, tutorialSource);
    fixture.commit("feature tutorial review");
    fixture.write(manifest.patchNoteSourcePath, JSON.stringify(patchNotes, null, 2));
    fixture.commit("feature patch review");
    fixture.write("package.json", JSON.stringify(packageDocument, null, 2));
    fixture.commit("feature version review");
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("later feature authority");

    fixture.git("checkout", "--quiet", "main");
    fixture.write("README.md", "base\nolder main\n");
    fixture.commit("older main docs");
    fixture.git("merge", "--quiet", "--no-ff", "feature", "-m", "merge split review branch");
    const mergeCommit = fixture.git("rev-parse", "HEAD");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /final atomic release checkpoint/u);
    const merge = result.commits.find((commit) => commit.commit === mergeCommit);
    assert.ok(merge);
    assert.deepEqual(merge.authoritativeFiles, ["src/game/player.ts"]);
  } finally {
    fixture.destroy();
  }
});

test("a merge checkpoint must advance every incomparable prior checkpoint", () => {
  const fixture = createRangeFixture("merge-prior-frontier");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeOlderReview();
    fixture.commit("older main checkpoint");

    fixture.git("checkout", "--quiet", "-b", "feature", fixture.base);
    fixture.write("src/game/route.ts", "export const routeCost = 3;\n");
    fixture.writeIntermediateReview();
    fixture.commit("newer feature checkpoint");

    fixture.git("checkout", "--quiet", "main");
    fixture.git("merge", "--quiet", "--no-ff", "--no-commit", "-X", "ours", "feature");
    fixture.commit("merge checkpoint histories while retaining main review");
    fixture.writeIntermediateReview();
    fixture.commit("reuse only the feature release identity");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.ok(result.errors.some((error) => error.includes("Tutorial review must advance")));
    assert.ok(result.errors.some((error) => error.includes("package.json version must advance")));
    assert.ok(result.errors.some((error) => error.includes("preserving prior release identities and order")));
  } finally {
    fixture.destroy();
  }
});

test("a checkpoint on a sibling branch cannot cover authority merged later", () => {
  const fixture = createRangeFixture("sibling-checkpoint");
  try {
    fixture.writeIntermediateReview();
    fixture.commit("main branch checkpoint");
    const siblingCheckpoint = fixture.git("rev-parse", "HEAD");

    fixture.git("checkout", "--quiet", "-b", "feature", fixture.base);
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("feature authority only");
    const featureAuthority = fixture.git("rev-parse", "HEAD");

    fixture.git("checkout", "--quiet", "main");
    fixture.git("merge", "--quiet", "--no-ff", "feature", "-m", "merge feature authority");
    const mergeCommit = fixture.git("rev-parse", "HEAD");

    const uncovered = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.equal(uncovered.errors.length, 1);
    assert.match(uncovered.errors[0], new RegExp(mergeCommit.slice(0, 12), "u"));
    assert.match(uncovered.errors[0], new RegExp(siblingCheckpoint.slice(0, 12), "u"));
    assert.match(uncovered.errors[0], /is not contained in final release checkpoint/u);
    assert.ok(featureAuthority.length > 0);

    fixture.writeCurrentReview();
    fixture.commit("post-merge release checkpoint");
    const covered = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.deepEqual(covered.errors, []);
  } finally {
    fixture.destroy();
  }
});

test("a merge-authored gameplay resolution requires a later atomic checkpoint review", () => {
  const fixture = createRangeFixture("merge-resolution");
  try {
    fixture.git("checkout", "--quiet", "-b", "feature", fixture.base);
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
    fixture.commit("atomic feature release");

    fixture.git("checkout", "--quiet", "main");
    fixture.writeCurrentReview();
    fixture.write("README.md", "base\nmain docs\n");
    fixture.commit("main release checkpoint");
    fixture.git("merge", "--quiet", "--no-ff", "--no-commit", "feature");
    fixture.write("src/game/player.ts", "export const pace = 3;\n");
    fixture.commit("merge with novel gameplay resolution");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    const merge = result.commits.find((commit) => commit.kind === "merge-first-parent");
    assert.ok(merge);
    assert.deepEqual(merge.mergeResolutionPaths, ["src/game/player.ts"]);
    assert.deepEqual(merge.errors, []);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], new RegExp(merge.commit.slice(0, 12), "u"));
    assert.match(result.errors[0], /is not contained in final release checkpoint/u);
  } finally {
    fixture.destroy();
  }
});

test("a merge cannot launder a reviewed stale parent over newer gameplay", () => {
  const fixture = createRangeFixture("merge-stale-parent");
  try {
    fixture.git("checkout", "--quiet", "-b", "stale", fixture.base);
    fixture.writeCurrentReview();
    fixture.commit("review old gameplay on stale branch");

    fixture.git("checkout", "--quiet", "main");
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
    fixture.commit("review newer main gameplay");
    fixture.git("merge", "--quiet", "--no-ff", "--no-commit", "stale");
    fixture.writeCurrentReview();
    fixture.write("src/game/player.ts", "export const pace = 1;\n");
    fixture.commit("merge stale gameplay object");
    const mergeCommit = fixture.git("rev-parse", "HEAD");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    const merge = result.commits.find((commit) => commit.commit === mergeCommit);
    assert.ok(merge);
    assert.deepEqual(merge.authoritativeFiles, ["src/game/player.ts"]);
    assert.ok(result.errors.some((error) => error.includes(mergeCommit.slice(0, 12))));
    assert.ok(result.errors.some((error) => error.includes("is not contained in final release checkpoint")));
  } finally {
    fixture.destroy();
  }
});

test("an unavailable base fails closed instead of skipping a shallow range", () => {
  assert.throws(
    () => resolveChangedFiles({ root, base: "f".repeat(40), head: "HEAD", eventName: "push" }),
    /fetch-depth: 0/u,
  );
});

function createRangeFixture(label, { legacyTutorial = false } = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `tideweft-${label}-`));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = (relativePath, value) => {
    const destination = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, value);
  };
  const commit = (message) => {
    git("add", "-A");
    git("commit", "--quiet", "-m", message);
  };
  const writeCurrentReview = () => {
    write(manifest.tutorialSourcePath, tutorialSource);
    write(manifest.patchNoteSourcePath, JSON.stringify(patchNotes, null, 2));
    write("package.json", JSON.stringify(packageDocument, null, 2));
  };
  const writeCurrentTutorialAndPatch = () => {
    write(manifest.tutorialSourcePath, tutorialSource);
    write(manifest.patchNoteSourcePath, JSON.stringify(patchNotes, null, 2));
  };
  const writeIntermediateReview = () => {
    const intermediatePatchNotes = {
      schemaVersion: patchNotes.schemaVersion,
      releases: patchNotes.releases.slice(1),
    };
    const intermediateRelease = intermediatePatchNotes.releases[0];
    assert.ok(intermediateRelease, "The fixture needs a release before the current one.");
    write(
      manifest.tutorialSourcePath,
      tutorialSource.replace(
        /TUTORIAL_CONTENT_VERSION = [0-9]+ as const;/u,
        `TUTORIAL_CONTENT_VERSION = ${intermediateRelease.tutorialVersion} as const;`,
      ),
    );
    write(manifest.patchNoteSourcePath, JSON.stringify(intermediatePatchNotes, null, 2));
    write("package.json", JSON.stringify({
      ...packageDocument,
      version: intermediateRelease.version,
    }, null, 2));
  };
  const writeOlderReview = () => {
    const olderPatchNotes = {
      schemaVersion: patchNotes.schemaVersion,
      releases: patchNotes.releases.slice(2),
    };
    const olderRelease = olderPatchNotes.releases[0];
    assert.ok(olderRelease, "The fixture needs two releases before the current one.");
    write(
      manifest.tutorialSourcePath,
      tutorialSource.replace(
        /TUTORIAL_CONTENT_VERSION = [0-9]+ as const;/u,
        `TUTORIAL_CONTENT_VERSION = ${olderRelease.tutorialVersion} as const;`,
      ),
    );
    write(manifest.patchNoteSourcePath, JSON.stringify(olderPatchNotes, null, 2));
    write("package.json", JSON.stringify({
      ...packageDocument,
      version: olderRelease.version,
    }, null, 2));
  };

  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "sync-gate@test.invalid");
  git("config", "user.name", "TIDEWEFT Sync Test");
  const baseRelease = patchNotes.releases.find((release) => release.tutorialVersion === 5);
  assert.ok(baseRelease, "The fixture needs the canonical v5 release for its comparison base.");
  write(manifestRelativeForTest(), JSON.stringify(manifest, null, 2));
  write(
    manifest.tutorialSourcePath,
    legacyTutorial
      ? "export const TIDEWEFT_TUTORIAL_GUIDE = { version: 5, title: 'legacy' };\n"
      : "export const TUTORIAL_CONTENT_VERSION = 5 as const;\n",
  );
  write(manifest.patchNoteSourcePath, JSON.stringify({ schemaVersion: 1, releases: [baseRelease] }, null, 2));
  write("package.json", JSON.stringify({ name: "fixture", version: baseRelease.version }, null, 2));
  write("README.md", "base\n");
  write("src/game/player.ts", "export const pace = 1;\n");
  commit("base");
  const base = git("rev-parse", "HEAD");

  return {
    root: fixtureRoot,
    base,
    git,
    write,
    commit,
    writeCurrentReview,
    writeCurrentTutorialAndPatch,
    writeIntermediateReview,
    writeOlderReview,
    destroy: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
  };
}

function manifestRelativeForTest() {
  return "src/content/gameplayContract.json";
}

console.log(`1..${assertions}`);
