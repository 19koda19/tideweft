#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const manifestRelativePath = "src/content/gameplayContract.json";
const packageRelativePath = "package.json";
const htmlMetadataRelativePath = "index.html";
const releaseCategoryKeys = [
  "gameplay",
  "fixes",
  "balancing",
  "interface",
  "saves",
  "knownLimitations",
];
const requiredReviewSurface = [
  "movement",
  "brace",
  "pace",
  "stamina",
  "capacity",
  "cargo",
  "promises",
  "rewards",
  "items",
  "crafting",
  "health",
  "survival",
  "tides",
  "weather",
  "combat",
  "wildlife",
  "region-travel",
  "saving",
  "routes",
  "failure",
  "recovery",
  "desktop-controls",
  "mobile-controls",
];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function normalizeRepoPath(value) {
  if (typeof value !== "string") return "";
  const slashed = value.replace(/\\/gu, "/").replace(/^(?:\.\/)+/u, "");
  const normalized = path.posix.normalize(slashed);
  return normalized === "." ? "" : normalized;
}

function isCanonicalRepoPath(value, { prefix = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return false;
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  if (normalizeRepoPath(value) !== value || value === ".." || value.startsWith("../")) return false;
  return !prefix || value.endsWith("/");
}

function isStringList(value, { nonEmpty = true } = {}) {
  return Array.isArray(value)
    && (!nonEmpty || value.length > 0)
    && value.every((item) => typeof item === "string" && item.length > 0)
    && new Set(value).size === value.length;
}

function validateGameplayContract(manifest) {
  const errors = [];
  const keys = [
    "schemaVersion",
    "contractId",
    "displayName",
    "difficultyCount",
    "gameplayContractVersion",
    "minimumTutorialVersion",
    "patchNotesSchemaVersion",
    "accessibilityPolicy",
    "tutorialSourcePath",
    "patchNoteSourcePath",
    "generatedPatchNotesPath",
    "reviewSurface",
    "authoritativeExactPaths",
    "authoritativePathPrefixes",
    "authoritativeExcludedPaths",
    "authoritativeExcludedSuffixes",
  ];
  if (!hasExactKeys(manifest, keys)) {
    return ["gameplayContract.json must contain exactly the supported schema-v1 fields."];
  }
  if (manifest.schemaVersion !== 1) errors.push("gameplay contract schemaVersion must be 1.");
  if (manifest.contractId !== "challenging-hard") errors.push("gameplay contract id must be challenging-hard.");
  if (manifest.displayName !== "A CHALLENGING HARD") {
    errors.push("official ruleset displayName must be exactly A CHALLENGING HARD.");
  }
  if (manifest.difficultyCount !== 1) errors.push("TIDEWEFT must declare exactly one difficulty.");
  if (!Number.isSafeInteger(manifest.gameplayContractVersion) || manifest.gameplayContractVersion < 1) {
    errors.push("gameplayContractVersion must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(manifest.minimumTutorialVersion)
    || manifest.minimumTutorialVersion < manifest.gameplayContractVersion
  ) {
    errors.push("minimumTutorialVersion must be a safe integer covering the gameplay contract version.");
  }
  if (manifest.patchNotesSchemaVersion !== 1) errors.push("patchNotesSchemaVersion must be 1.");
  if (manifest.accessibilityPolicy !== "presentation-input-only") {
    errors.push("accessibility policy must not create alternate simulation or reward rules.");
  }
  for (const key of ["tutorialSourcePath", "patchNoteSourcePath", "generatedPatchNotesPath"]) {
    if (!isCanonicalRepoPath(manifest[key])) errors.push(`${key} must be a canonical repository path.`);
  }
  if (!isStringList(manifest.reviewSurface)) {
    errors.push("reviewSurface must be a non-empty unique string list.");
  } else {
    for (const mechanic of requiredReviewSurface) {
      if (!manifest.reviewSurface.includes(mechanic)) errors.push(`reviewSurface is missing ${mechanic}.`);
    }
  }
  for (const key of ["authoritativeExactPaths", "authoritativeExcludedPaths"]) {
    if (!isStringList(manifest[key])) {
      errors.push(`${key} must be a non-empty unique string list.`);
    } else if (!manifest[key].every((entry) => isCanonicalRepoPath(entry))) {
      errors.push(`${key} contains an unsafe or non-canonical repository path.`);
    }
  }
  if (!isStringList(manifest.authoritativePathPrefixes)) {
    errors.push("authoritativePathPrefixes must be a non-empty unique string list.");
  } else if (!manifest.authoritativePathPrefixes.every((entry) => isCanonicalRepoPath(entry, { prefix: true }))) {
    errors.push("authoritativePathPrefixes contains an unsafe prefix or one without a trailing slash.");
  }
  if (
    !isStringList(manifest.authoritativeExcludedSuffixes)
    || !manifest.authoritativeExcludedSuffixes.every((entry) => entry.startsWith("."))
  ) {
    errors.push("authoritativeExcludedSuffixes must be a non-empty unique list of dotted suffixes.");
  }
  if (!manifest.authoritativeExactPaths.includes(manifestRelativePath)) {
    errors.push("The gameplay contract manifest must classify itself as authoritative.");
  }
  if (!manifest.authoritativePathPrefixes.includes("src/")) {
    errors.push("authoritativePathPrefixes must retain the src/ production-source safety net.");
  }
  if (
    !manifest.authoritativeExcludedPaths.includes(manifest.tutorialSourcePath)
    || !manifest.authoritativeExcludedPaths.includes(manifest.patchNoteSourcePath)
  ) {
    errors.push("Tutorial and canonical patch-note review sources must be explicit authoritative-path exclusions.");
  }
  if (manifest.authoritativeExcludedPaths.includes(manifestRelativePath)) {
    errors.push("The gameplay contract manifest cannot exclude itself from release review.");
  }
  return errors;
}

function extractTutorialVersion(source, { allowLegacyGuideObject = false } = {}) {
  if (typeof source !== "string") return null;
  const match = source.match(/export\s+const\s+TUTORIAL_CONTENT_VERSION\s*=\s*([0-9]+)(?:\s+as\s+const)?\s*;/u);
  const legacyMatch = allowLegacyGuideObject
    ? source.match(/export\s+const\s+TIDEWEFT_TUTORIAL_GUIDE[^=]*=\s*\{[\s\S]{0,400}?\bversion:\s*([0-9]+)/u)
    : null;
  const value = Number(match?.[1] ?? legacyMatch?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().startsWith(value);
}

function validatePatchNotes(document, manifest, tutorialVersion, packageDocument) {
  const errors = [];
  if (!hasExactKeys(document, ["schemaVersion", "releases"])) {
    return ["patchNotes.json must contain exactly schemaVersion and releases."];
  }
  if (document.schemaVersion !== manifest.patchNotesSchemaVersion) {
    errors.push(`patchNotes.json schemaVersion must be ${manifest.patchNotesSchemaVersion}.`);
  }
  if (!Array.isArray(document.releases) || document.releases.length === 0) {
    return [...errors, "patchNotes.json must contain at least one release."];
  }

  const versions = new Set();
  const buildIdentities = new Set();
  let previousDate = "9999-12-31";
  for (const [index, release] of document.releases.entries()) {
    const label = `patchNotes.json release ${index}`;
    if (!hasExactKeys(release, [
      "version",
      "releaseDate",
      "buildIdentity",
      "summary",
      "gameplayContractVersion",
      "tutorialVersion",
      "categories",
    ])) {
      errors.push(`${label} has missing or unsupported fields.`);
      continue;
    }
    if (typeof release.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(release.version)) {
      errors.push(`${label} version must be a non-empty semantic version.`);
    } else if (versions.has(release.version)) {
      errors.push(`${label} duplicates version ${release.version}.`);
    } else {
      versions.add(release.version);
    }
    if (!isCalendarDate(release.releaseDate)) {
      errors.push(`${label} releaseDate must be a real YYYY-MM-DD date.`);
    } else if (release.releaseDate > previousDate) {
      errors.push("patchNotes.json releases must be newest first.");
    } else {
      previousDate = release.releaseDate;
    }
    if (typeof release.buildIdentity !== "string" || release.buildIdentity.trim() !== release.buildIdentity || release.buildIdentity.length === 0) {
      errors.push(`${label} buildIdentity must be a non-empty trimmed string.`);
    } else if (buildIdentities.has(release.buildIdentity)) {
      errors.push(`${label} duplicates build identity ${release.buildIdentity}.`);
    } else {
      buildIdentities.add(release.buildIdentity);
    }
    if (typeof release.summary !== "string" || release.summary.trim().length === 0) {
      errors.push(`${label} summary must be non-empty.`);
    }
    if (!Number.isSafeInteger(release.gameplayContractVersion) || release.gameplayContractVersion < 1) {
      errors.push(`${label} gameplayContractVersion must be a positive safe integer.`);
    }
    if (!Number.isSafeInteger(release.tutorialVersion) || release.tutorialVersion < 1) {
      errors.push(`${label} tutorialVersion must be a positive safe integer.`);
    }
    if (!hasExactKeys(release.categories, releaseCategoryKeys)) {
      errors.push(`${label} categories must contain exactly ${releaseCategoryKeys.join(", ")}.`);
    } else {
      for (const category of releaseCategoryKeys) {
        const entries = release.categories[category];
        if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === "string" && entry.trim().length > 0)) {
          errors.push(`${label} category ${category} must be an array of non-empty strings.`);
        }
      }
    }
  }

  const latest = document.releases[0];
  if (isPlainObject(latest)) {
    if (latest.gameplayContractVersion !== manifest.gameplayContractVersion) {
      errors.push("The newest patch note must match the current gameplay contract version.");
    }
    if (latest.tutorialVersion !== tutorialVersion) {
      errors.push("The newest patch note must identify the current tutorial content version.");
    }
    if (latest.version !== packageDocument?.version) {
      errors.push("The newest patch-note version must match package.json.");
    }
  }
  return errors;
}

function htmlAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu");
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function validateBuildMetadata(htmlSource, manifest, packageDocument) {
  if (typeof htmlSource !== "string") return [`${htmlMetadataRelativePath} is missing or unreadable.`];
  const metaTags = [...htmlSource.matchAll(/<meta\b[^>]*>/giu)].map((match) => match[0]);
  const readNamedMeta = (name) => metaTags
    .filter((tag) => htmlAttribute(tag, "name") === name)
    .map((tag) => htmlAttribute(tag, "content"));
  const errors = [];
  const rulesetValues = readNamedMeta("tideweft-ruleset");
  if (rulesetValues.length !== 1 || rulesetValues[0] !== manifest.displayName) {
    errors.push(`${htmlMetadataRelativePath} must expose exactly one tideweft-ruleset meta value of ${manifest.displayName}.`);
  }
  const buildValues = readNamedMeta("tideweft-build");
  if (buildValues.length !== 1 || buildValues[0] !== packageDocument.version) {
    errors.push(`${htmlMetadataRelativePath} tideweft-build metadata must match package.json.`);
  }
  return errors;
}

function validateContentDocuments({ manifest, tutorialSource, patchNotes, packageDocument }) {
  const errors = validateGameplayContract(manifest);
  if (errors.length > 0) return { errors, tutorialVersion: null };

  const tutorialVersion = extractTutorialVersion(tutorialSource);
  if (tutorialVersion === null) {
    errors.push("tutorialGuide.ts must export a positive integer TUTORIAL_CONTENT_VERSION constant.");
  } else if (tutorialVersion < manifest.minimumTutorialVersion) {
    errors.push(
      `Tutorial content v${tutorialVersion} does not cover gameplay contract v${manifest.gameplayContractVersion}; `
      + `v${manifest.minimumTutorialVersion} or newer is required.`,
    );
  }
  if (!isPlainObject(packageDocument) || typeof packageDocument.version !== "string") {
    errors.push("package.json must contain a string version.");
  }
  if (tutorialVersion !== null && isPlainObject(packageDocument)) {
    errors.push(...validatePatchNotes(patchNotes, manifest, tutorialVersion, packageDocument));
  }
  return { errors, tutorialVersion };
}

function readJsonFile(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${relativePath} could not be read as JSON: ${message}`);
  }
}

function validateLocalContent(root = projectRoot) {
  let manifest;
  try {
    manifest = readJsonFile(root, manifestRelativePath);
  } catch (error) {
    return { errors: [error.message], manifest: null, tutorialVersion: null };
  }
  const manifestErrors = validateGameplayContract(manifest);
  if (manifestErrors.length > 0) return { errors: manifestErrors, manifest, tutorialVersion: null };

  let tutorialSource;
  let patchNotes;
  let packageDocument;
  let htmlSource;
  const readErrors = [];
  try {
    tutorialSource = fs.readFileSync(path.join(root, manifest.tutorialSourcePath), "utf8");
  } catch (error) {
    readErrors.push(`${manifest.tutorialSourcePath} is missing or unreadable: ${error.message}`);
  }
  try {
    patchNotes = readJsonFile(root, manifest.patchNoteSourcePath);
  } catch (error) {
    readErrors.push(error.message);
  }
  try {
    packageDocument = readJsonFile(root, packageRelativePath);
  } catch (error) {
    readErrors.push(error.message);
  }
  try {
    htmlSource = fs.readFileSync(path.join(root, htmlMetadataRelativePath), "utf8");
  } catch (error) {
    readErrors.push(`${htmlMetadataRelativePath} is missing or unreadable: ${error.message}`);
  }
  if (readErrors.length > 0) return { errors: readErrors, manifest, tutorialVersion: null };
  const result = validateContentDocuments({ manifest, tutorialSource, patchNotes, packageDocument });
  return {
    ...result,
    errors: [...result.errors, ...validateBuildMetadata(htmlSource, manifest, packageDocument)],
    manifest,
    patchNotes,
  };
}

function isAuthoritativePath(candidatePath, manifest) {
  const normalized = normalizeRepoPath(candidatePath);
  if (!isCanonicalRepoPath(normalized)) return false;
  if (manifest.authoritativeExcludedPaths.includes(normalized)) return false;
  if (manifest.authoritativeExcludedSuffixes.some((suffix) => normalized.endsWith(suffix))) return false;
  return manifest.authoritativeExactPaths.includes(normalized)
    || manifest.authoritativePathPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function evaluateChangedFiles(changedPaths, manifest) {
  const normalizedPaths = [...new Set(changedPaths.map(normalizeRepoPath).filter(Boolean))];
  const authoritativeFiles = normalizedPaths.filter((entry) => isAuthoritativePath(entry, manifest));
  const tutorialReviewed = normalizedPaths.includes(manifest.tutorialSourcePath);
  const patchNotesReviewed = normalizedPaths.includes(manifest.patchNoteSourcePath);
  const errors = [];
  if (authoritativeFiles.length > 0 && !tutorialReviewed) {
    errors.push(
      `Authoritative player-facing files changed without ${manifest.tutorialSourcePath}: ${authoritativeFiles.join(", ")}`,
    );
  }
  if (authoritativeFiles.length > 0 && !patchNotesReviewed) {
    errors.push(
      `Authoritative player-facing files changed without ${manifest.patchNoteSourcePath}: ${authoritativeFiles.join(", ")}`,
    );
  }
  return { authoritativeFiles, tutorialReviewed, patchNotesReviewed, errors, normalizedPaths };
}

function parseNameStatusZ(output) {
  const tokens = output.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  const paths = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (typeof status !== "string" || !/^[A-Z?][0-9]*$/u.test(status)) {
      throw new Error(`Unable to parse git change status ${JSON.stringify(status)}.`);
    }
    const firstPath = tokens[index++];
    if (firstPath === undefined) throw new Error(`Git status ${status} is missing its path.`);
    paths.push(firstPath);
    if (status.startsWith("R") || status.startsWith("C")) {
      const secondPath = tokens[index++];
      if (secondPath === undefined) throw new Error(`Git status ${status} is missing its destination path.`);
      paths.push(secondPath);
    }
  }
  return paths;
}

function runGit(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || "unknown git error").trim();
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
  return result;
}

function isAllZeroSha(value) {
  return typeof value === "string" && /^0{40,64}$/u.test(value);
}

function isSafeGitRevision(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("-") && /^[0-9A-Za-z._/-]+$/u.test(value);
}

function assertRevisionAvailable(root, revision, label) {
  if (!isSafeGitRevision(revision)) throw new Error(`${label} is not a safe git revision.`);
  const result = runGit(root, ["cat-file", "-e", `${revision}^{commit}`], { allowFailure: true });
  if (result.status !== 0) {
    throw new Error(
      `${label} ${revision} is unavailable. CI must check out full history (fetch-depth: 0); refusing to skip the sync gate.`,
    );
  }
}

function resolveChangedFiles({ root = projectRoot, base = "", head = "HEAD", eventName = "" } = {}) {
  if (base && !isAllZeroSha(base)) {
    assertRevisionAvailable(root, base, "Base revision");
    assertRevisionAvailable(root, head, "Head revision");
    const diff = runGit(root, ["diff", "--name-status", "-z", `${base}...${head}`, "--"]);
    return { paths: parseNameStatusZ(diff.stdout), mode: "range", base, head };
  }
  if ((eventName === "push" || eventName === "pull_request") && !isAllZeroSha(base)) {
    throw new Error(`${eventName} validation requires TIDEWEFT_SYNC_BASE; refusing a content-only pass.`);
  }
  if (base && isAllZeroSha(base)) {
    return { paths: [], mode: "zero-base-content-only", base, head };
  }

  const diff = runGit(root, ["diff", "--name-status", "-z", "HEAD", "--"]);
  const untracked = runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return {
    paths: [...parseNameStatusZ(diff.stdout), ...untracked.stdout.split("\0").filter(Boolean)],
    mode: eventName === "workflow_dispatch" ? "dispatch-content-only" : "working-tree",
    base: "",
    head,
  };
}

function readGitFile(root, revision, relativePath) {
  const result = runGit(root, ["show", `${revision}:${relativePath}`], { allowFailure: true });
  return result.status === 0 ? result.stdout : null;
}

function validateReviewAdvancement({ root, base, evaluation, manifest, tutorialVersion, patchNotes }) {
  const errors = [];
  if (evaluation.authoritativeFiles.length === 0 || !base || isAllZeroSha(base)) return errors;

  const previousTutorialSource = readGitFile(root, base, manifest.tutorialSourcePath);
  if (previousTutorialSource !== null) {
    const previousTutorialVersion = extractTutorialVersion(previousTutorialSource, { allowLegacyGuideObject: true });
    if (previousTutorialVersion === null) {
      errors.push(`Base ${manifest.tutorialSourcePath} lacks TUTORIAL_CONTENT_VERSION; migrate it in this release.`);
    } else if (tutorialVersion <= previousTutorialVersion) {
      errors.push(
        `Tutorial review must advance TUTORIAL_CONTENT_VERSION above base v${previousTutorialVersion}; current is v${tutorialVersion}.`,
      );
    }
  }

  const previousPatchSource = readGitFile(root, base, manifest.patchNoteSourcePath);
  if (previousPatchSource !== null) {
    try {
      const previous = JSON.parse(previousPatchSource);
      const oldLatest = previous?.releases?.[0];
      const newLatest = patchNotes?.releases?.[0];
      if (
        oldLatest?.version === newLatest?.version
        && oldLatest?.buildIdentity === newLatest?.buildIdentity
      ) {
        errors.push("Patch-note review must add a new release/build identity for this player-facing build.");
      }
    } catch {
      // The current strict schema validation is authoritative; a malformed
      // historical source cannot safely provide a comparable release identity.
    }
  }
  return errors;
}

function parseJsonAtRevision(root, revision, relativePath) {
  const source = readGitFile(root, revision, relativePath);
  if (source === null) return { value: null, error: `${relativePath} is missing at ${revision}.` };
  try {
    return { value: JSON.parse(source), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: null, error: `${relativePath} is invalid JSON at ${revision}: ${message}` };
  }
}

function manifestAtRevision(root, revision, fallbackManifest) {
  const source = readGitFile(root, revision, manifestRelativePath);
  if (source === null) {
    // The first gate-adoption range legitimately begins before the manifest
    // exists. Its new commit is still classified with the validated head
    // manifest, whose mandatory src/ safety net catches production changes.
    return { manifest: fallbackManifest, errors: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      manifest: fallbackManifest,
      errors: [`${manifestRelativePath} is invalid JSON at ${revision}: ${message}`],
    };
  }
  const errors = validateGameplayContract(parsed);
  return { manifest: errors.length === 0 ? parsed : fallbackManifest, errors };
}

function commitParents(root, commit) {
  const result = runGit(root, ["rev-list", "--parents", "-n", "1", commit, "--"]);
  const fields = result.stdout.trim().split(/\s+/u).filter(Boolean);
  if (fields[0] !== commit) throw new Error(`Unable to resolve parents for commit ${commit}.`);
  return fields.slice(1);
}

function changedPathsForCommit(root, commit, parents) {
  if (parents.length === 0) {
    const diff = runGit(root, [
      "diff-tree",
      "--root",
      "--no-commit-id",
      "--name-status",
      "--no-renames",
      "-z",
      "-r",
      commit,
      "--",
    ]);
    return parseNameStatusZ(diff.stdout);
  }
  // A merge is an explicit first-parent integration commit. Every newly
  // reachable non-merge commit is also evaluated on its own, so a merge can
  // neither launder an earlier split change nor depend on parent ordering that
  // is not already recorded authoritatively in the commit object.
  const diff = runGit(root, [
    "diff",
    "--name-status",
    "--no-renames",
    "-z",
    parents[0],
    commit,
    "--",
  ]);
  return parseNameStatusZ(diff.stdout);
}

function objectAtPath(root, revision, relativePath) {
  const result = runGit(root, ["rev-parse", "--verify", "--quiet", `${revision}:${relativePath}`], {
    allowFailure: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function novelMergeResolutionPaths(root, commit, parents, changedPaths) {
  if (parents.length < 2) return [];
  return changedPaths.filter((relativePath) => {
    const mergedObject = objectAtPath(root, commit, relativePath);
    return parents.every((parent) => objectAtPath(root, parent, relativePath) !== mergedObject);
  });
}

function reviewStateAtCommit(root, commit, manifest) {
  const errors = [];
  const tutorialSource = readGitFile(root, commit, manifest.tutorialSourcePath);
  const tutorialVersion = extractTutorialVersion(tutorialSource);
  if (tutorialVersion === null) {
    errors.push(`${manifest.tutorialSourcePath} must export TUTORIAL_CONTENT_VERSION at this commit.`);
  } else if (tutorialVersion < manifest.minimumTutorialVersion) {
    errors.push(
      `${manifest.tutorialSourcePath} v${tutorialVersion} does not cover gameplay contract v${manifest.gameplayContractVersion}.`,
    );
  }

  const parsedPatchNotes = parseJsonAtRevision(root, commit, manifest.patchNoteSourcePath);
  const parsedPackage = parseJsonAtRevision(root, commit, packageRelativePath);
  if (parsedPatchNotes.error !== null) errors.push(parsedPatchNotes.error);
  if (parsedPackage.error !== null) errors.push(parsedPackage.error);
  if (
    tutorialVersion !== null
    && parsedPatchNotes.value !== null
    && parsedPackage.value !== null
  ) {
    errors.push(...validatePatchNotes(parsedPatchNotes.value, manifest, tutorialVersion, parsedPackage.value));
  }
  return {
    errors,
    tutorialVersion,
    patchNotes: parsedPatchNotes.value,
  };
}

function evaluateCommitRange({ root = projectRoot, base, head, fallbackManifest }) {
  assertRevisionAvailable(root, base, "Base revision");
  assertRevisionAvailable(root, head, "Head revision");
  const listed = runGit(root, ["rev-list", "--reverse", "--topo-order", `${base}..${head}`, "--"]);
  const commits = listed.stdout.trim().length === 0
    ? []
    : listed.stdout.trim().split(/\s+/u);
  const results = [];
  const errors = [];

  for (const commit of commits) {
    const parents = commitParents(root, commit);
    const changedPaths = changedPathsForCommit(root, commit, parents);
    const loadedManifest = manifestAtRevision(root, commit, fallbackManifest);
    const manifest = loadedManifest.manifest;
    const evaluation = evaluateChangedFiles(changedPaths, manifest);
    const kind = parents.length > 1 ? "merge; first-parent net" : "non-merge";
    const prefix = `Commit ${commit.slice(0, 12)} (${kind})`;
    const commitErrors = [];
    const mergeResolutionPaths = novelMergeResolutionPaths(root, commit, parents, changedPaths);
    const mergeResolutionEvaluation = evaluateChangedFiles(mergeResolutionPaths, manifest);
    if (
      loadedManifest.errors.length > 0
      && (evaluation.authoritativeFiles.length > 0 || changedPaths.includes(manifestRelativePath))
    ) {
      commitErrors.push(...loadedManifest.errors);
    }
    commitErrors.push(...evaluation.errors);
    if (mergeResolutionEvaluation.authoritativeFiles.length > 0) {
      commitErrors.push(...mergeResolutionEvaluation.errors.map(
        (error) => `novel merge resolution: ${error}`,
      ));
    }

    if (
      evaluation.authoritativeFiles.length > 0
      && evaluation.tutorialReviewed
      && evaluation.patchNotesReviewed
    ) {
      const reviewState = reviewStateAtCommit(root, commit, manifest);
      commitErrors.push(...reviewState.errors);
      if (reviewState.tutorialVersion !== null && reviewState.patchNotes !== null) {
        commitErrors.push(...validateReviewAdvancement({
          root,
          base: parents[0] ?? "",
          evaluation,
          manifest,
          tutorialVersion: reviewState.tutorialVersion,
          patchNotes: reviewState.patchNotes,
        }));
      }
    }

    errors.push(...commitErrors.map((error) => `${prefix}: ${error}`));
    results.push({
      commit,
      parents,
      kind: parents.length > 1 ? "merge-first-parent" : "non-merge",
      changedPaths,
      mergeResolutionPaths,
      authoritativeFiles: evaluation.authoritativeFiles,
      errors: commitErrors,
    });
  }
  return { commits: results, errors };
}

function run(options = {}) {
  const root = options.root ?? projectRoot;
  const local = validateLocalContent(root);
  const errors = [...local.errors];
  if (local.manifest === null) return { errors, mode: "content", authoritativeFiles: [] };

  let changed;
  try {
    changed = resolveChangedFiles({
      root,
      base: options.base ?? process.env.TIDEWEFT_SYNC_BASE ?? "",
      head: options.head ?? process.env.TIDEWEFT_SYNC_HEAD ?? "HEAD",
      eventName: options.eventName ?? process.env.TIDEWEFT_SYNC_EVENT ?? "",
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { errors, mode: "unresolved", authoritativeFiles: [] };
  }

  if (changed.mode === "range") {
    try {
      const range = evaluateCommitRange({
        root,
        base: changed.base,
        head: changed.head,
        fallbackManifest: local.manifest,
      });
      errors.push(...range.errors);
      return {
        errors,
        mode: changed.mode,
        authoritativeFiles: [...new Set(range.commits.flatMap((commit) => commit.authoritativeFiles))],
        commits: range.commits,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return { errors, mode: "unresolved", authoritativeFiles: [], commits: [] };
    }
  }

  const evaluation = evaluateChangedFiles(changed.paths, local.manifest);
  errors.push(...evaluation.errors);
  if (local.tutorialVersion !== null && local.patchNotes !== undefined) {
    const comparisonBase = changed.mode === "working-tree" || changed.mode === "dispatch-content-only"
      ? "HEAD"
      : changed.base;
    errors.push(...validateReviewAdvancement({
      root,
      base: comparisonBase,
      evaluation,
      manifest: local.manifest,
      tutorialVersion: local.tutorialVersion,
      patchNotes: local.patchNotes,
    }));
  }
  return { errors, mode: changed.mode, authoritativeFiles: evaluation.authoritativeFiles, commits: [] };
}

if (require.main === module) {
  const result = run();
  if (result.errors.length > 0) {
    console.error("Player-facing release synchronization failed:\n");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    const scope = result.authoritativeFiles.length === 0
      ? "no authoritative rule changes"
      : `${result.authoritativeFiles.length} authoritative file(s) with tutorial and patch-note review`;
    const commitScope = result.commits.length > 0
      ? `; ${result.commits.length} commit(s) independently checked`
      : "";
    console.log(`Player-facing synchronization passed (${result.mode}; ${scope}${commitScope}).`);
  }
}

module.exports = {
  evaluateCommitRange,
  evaluateChangedFiles,
  extractTutorialVersion,
  isAuthoritativePath,
  isCanonicalRepoPath,
  normalizeRepoPath,
  parseNameStatusZ,
  requiredReviewSurface,
  resolveChangedFiles,
  run,
  validateBuildMetadata,
  validateContentDocuments,
  validateGameplayContract,
  validateLocalContent,
  validatePatchNotes,
  validateReviewAdvancement,
};
