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
  run,
  validateBuildMetadata,
  validateContentDocuments,
  validateGameplayContract,
  validateLocalContent,
  validateReviewAdvancement,
} = require("./check-player-facing-sync.cjs");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/content/gameplayContract.json"), "utf8"));
const patchNotes = JSON.parse(fs.readFileSync(path.join(root, "src/content/patchNotes.json"), "utf8"));
const packageDocument = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tutorialSource = "export const TUTORIAL_CONTENT_VERSION = 22 as const;";

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
  assert.equal(result.tutorialVersion, 22);
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

test("all-zero push bases and manual dispatches take explicit content-validation modes", () => {
  const zero = resolveChangedFiles({
    root,
    base: "0".repeat(40),
    head: "deadbeef",
    eventName: "push",
  });
  assert.equal(zero.mode, "zero-base-content-only");
  assert.deepEqual(zero.paths, []);
  assert.deepEqual(run({ root, base: "0".repeat(40), head: "deadbeef", eventName: "push" }).errors, []);

  const dispatch = resolveChangedFiles({ root, eventName: "workflow_dispatch" });
  assert.equal(dispatch.mode, "dispatch-content-only");
});

test("an authoritative commit cannot be repaired by a later docs-only commit", () => {
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
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.every((error) => error.includes(authoritativeCommit.slice(0, 12))));
    assert.match(result.errors.join(" "), /tutorialGuide\.ts/u);
    assert.match(result.errors.join(" "), /patchNotes\.json/u);
    assert.deepEqual(result.commits[1].errors, []);
  } finally {
    fixture.destroy();
  }
});

test("a later tutorial and patch commit cannot launder an earlier authoritative commit", () => {
  const fixture = createRangeFixture("split-reviews");
  try {
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.commit("authoritative only");
    const authoritativeCommit = fixture.git("rev-parse", "HEAD");
    fixture.writeCurrentReview();
    fixture.commit("reviews later");

    const result = evaluateCommitRange({
      root: fixture.root,
      base: fixture.base,
      head: "HEAD",
      fallbackManifest: manifest,
    });
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.every((error) => error.includes(authoritativeCommit.slice(0, 12))));
    assert.deepEqual(result.commits[1].errors, []);
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

test("merge commits use deterministic first-parent integration while leaf commits remain atomic", () => {
  const fixture = createRangeFixture("merge");
  try {
    fixture.git("checkout", "--quiet", "-b", "feature", fixture.base);
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
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
    assert.deepEqual(result.errors, []);
    assert.ok(merge);
    assert.equal(merge.parents.length, 2);
    assert.deepEqual(merge.errors, []);
    assert.deepEqual(merge.mergeResolutionPaths, []);
    assert.ok(merge.authoritativeFiles.includes("src/game/player.ts"));
  } finally {
    fixture.destroy();
  }
});

test("a merge-authored gameplay resolution cannot borrow unchanged reviews from a parent", () => {
  const fixture = createRangeFixture("merge-resolution");
  try {
    fixture.git("checkout", "--quiet", "-b", "feature", fixture.base);
    fixture.write("src/game/player.ts", "export const pace = 2;\n");
    fixture.writeCurrentReview();
    fixture.commit("atomic feature release");

    fixture.git("checkout", "--quiet", "main");
    fixture.write("README.md", "base\nmain docs\n");
    fixture.commit("main docs");
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
    assert.equal(merge.errors.length, 2);
    assert.ok(merge.errors.every((error) => error.startsWith("novel merge resolution:")));
    assert.ok(result.errors.every((error) => error.includes(merge.commit.slice(0, 12))));
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
    destroy: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
  };
}

function manifestRelativeForTest() {
  return "src/content/gameplayContract.json";
}

console.log(`1..${assertions}`);
