#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const manifestRelativePath = "src/content/gameplayContract.json";
const packageRelativePath = "package.json";
const htmlMetadataRelativePath = "index.html";
const electronMainRelativePath = "electron/main.cjs";
const runtimeRelativePath = "src/game/runtime.ts";
const savePolicyRelativePath = "src/game/saveCompatibilityPolicy.ts";
const tutorialSourceRelativePath = "src/ui/tutorialGuide.ts";
const patchNoteSourceRelativePath = "src/content/patchNotes.json";
const generatedPatchNotesRelativePath = "CHANGELOG.md";
const requiredAuthoritativeExactPaths = [
  electronMainRelativePath,
  htmlMetadataRelativePath,
  manifestRelativePath,
];
const allowedAuthoritativeExcludedPaths = [
  patchNoteSourceRelativePath,
  tutorialSourceRelativePath,
];
const allowedAuthoritativeExcludedSuffixes = [
  ".test.cjs",
  ".test.js",
  ".test.ts",
  ".test.tsx",
  ".spec.cjs",
  ".spec.js",
  ".spec.ts",
  ".spec.tsx",
];
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

function hasSameStringMembers(actual, expected) {
  return isStringList(actual)
    && actual.length === expected.length
    && expected.every((entry) => actual.includes(entry));
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
  if (manifest.tutorialSourcePath !== tutorialSourceRelativePath) {
    errors.push(`tutorialSourcePath must remain ${tutorialSourceRelativePath}.`);
  }
  if (manifest.patchNoteSourcePath !== patchNoteSourceRelativePath) {
    errors.push(`patchNoteSourcePath must remain ${patchNoteSourceRelativePath}.`);
  }
  if (manifest.generatedPatchNotesPath !== generatedPatchNotesRelativePath) {
    errors.push(`generatedPatchNotesPath must remain ${generatedPatchNotesRelativePath}.`);
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
  if (Array.isArray(manifest.authoritativeExactPaths)) {
    for (const requiredPath of requiredAuthoritativeExactPaths) {
      if (!manifest.authoritativeExactPaths.includes(requiredPath)) {
        errors.push(`authoritativeExactPaths must retain ${requiredPath}.`);
      }
    }
  }
  if (
    Array.isArray(manifest.authoritativePathPrefixes)
    && !manifest.authoritativePathPrefixes.includes("src/")
  ) {
    errors.push("authoritativePathPrefixes must retain the src/ production-source safety net.");
  }
  if (!hasSameStringMembers(manifest.authoritativeExcludedPaths, allowedAuthoritativeExcludedPaths)) {
    errors.push(
      `authoritativeExcludedPaths may contain exactly ${allowedAuthoritativeExcludedPaths.join(", ")}.`,
    );
  }
  if (!hasSameStringMembers(manifest.authoritativeExcludedSuffixes, allowedAuthoritativeExcludedSuffixes)) {
    errors.push(
      "authoritativeExcludedSuffixes may contain only the supported test/spec filename suffixes.",
    );
  }
  if (
    Array.isArray(manifest.authoritativeExcludedPaths)
    && manifest.authoritativeExcludedPaths.includes(manifestRelativePath)
  ) {
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

function parseSemanticVersion(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(value);
  if (match === null) return null;
  const core = match.slice(1, 4).map(Number);
  if (!core.every(Number.isSafeInteger)) return null;
  return {
    core,
    prerelease: match[4] === undefined ? null : match[4].split("."),
  };
}

function compareSemanticVersions(leftValue, rightValue) {
  const left = parseSemanticVersion(leftValue);
  const right = parseSemanticVersion(rightValue);
  if (left === null || right === null) return null;
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) return Math.sign(left.core[index] - right.core[index]);
  }
  if (left.prerelease === null || right.prerelease === null) {
    if (left.prerelease === right.prerelease) return 0;
    return left.prerelease === null ? 1 : -1;
  }
  const width = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < width; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      if (leftPart === rightPart) return 0;
      return leftPart === undefined ? -1 : 1;
    }
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const leftNumber = BigInt(leftPart);
      const rightNumber = BigInt(rightPart);
      if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
      continue;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
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

function validateElectronSmokeMetadata(source, manifest, packageDocument) {
  if (typeof source !== "string") {
    return [`${electronMainRelativePath} is missing or unreadable.`];
  }
  const errors = [];
  const releaseMatches = [...source.matchAll(
    /\bconst\s+SMOKE_EXPECTED_RELEASE_VERSION\s*=\s*["']([^"']+)["']\s*;/gu,
  )];
  if (
    releaseMatches.length !== 1
    || releaseMatches[0]?.[1] !== packageDocument?.version
  ) {
    errors.push(
      `${electronMainRelativePath} must declare one packaged-smoke release matching package.json.`,
    );
  }
  const contractMatches = [...source.matchAll(
    /\bconst\s+SMOKE_EXPECTED_GAMEPLAY_CONTRACT_VERSION\s*=\s*([0-9]+)\s*;/gu,
  )];
  const contractVersion = Number(contractMatches[0]?.[1]);
  if (
    contractMatches.length !== 1
    || !Number.isSafeInteger(contractVersion)
    || contractVersion !== manifest.gameplayContractVersion
  ) {
    errors.push(
      `${electronMainRelativePath} must declare one packaged-smoke gameplay contract matching gameplayContract.json.`,
    );
  }
  return errors;
}

function validateElectronSmokeSaveVersion(electronSource, runtimeSource, savePolicySource) {
  if (
    typeof electronSource !== "string"
    || typeof runtimeSource !== "string"
    || typeof savePolicySource !== "string"
  ) {
    return ["Packaged-smoke and canonical save-version sources must all be readable."];
  }
  const electronMatches = [...electronSource.matchAll(
    /\bconst\s+SMOKE_EXPECTED_SAVE_VERSION\s*=\s*([0-9]+)\s*;/gu,
  )];
  const policyMatches = [...savePolicySource.matchAll(
    /\bexport\s+const\s+CURRENT_GAME_SAVE_VERSION\s*=\s*([0-9]+)\s+as\s+const\s*;/gu,
  )];
  const runtimeAliases = [...runtimeSource.matchAll(
    /\bconst\s+GAME_SAVE_VERSION\s*=\s*CURRENT_GAME_SAVE_VERSION\s*;/gu,
  )];
  const electronVersion = Number(electronMatches[0]?.[1]);
  const policyVersion = Number(policyMatches[0]?.[1]);
  if (
    electronMatches.length !== 1
    || policyMatches.length !== 1
    || runtimeAliases.length !== 1
    || !Number.isSafeInteger(electronVersion)
    || !Number.isSafeInteger(policyVersion)
    || electronVersion !== policyVersion
  ) {
    return [
      `${electronMainRelativePath} packaged-smoke save version and ${runtimeRelativePath} writer alias must match ${savePolicyRelativePath}.`,
    ];
  }
  return [];
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
  let electronMainSource;
  let runtimeSource;
  let savePolicySource;
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
  try {
    electronMainSource = fs.readFileSync(path.join(root, electronMainRelativePath), "utf8");
  } catch (error) {
    readErrors.push(`${electronMainRelativePath} is missing or unreadable: ${error.message}`);
  }
  try {
    runtimeSource = fs.readFileSync(path.join(root, runtimeRelativePath), "utf8");
  } catch (error) {
    readErrors.push(`${runtimeRelativePath} is missing or unreadable: ${error.message}`);
  }
  try {
    savePolicySource = fs.readFileSync(path.join(root, savePolicyRelativePath), "utf8");
  } catch (error) {
    readErrors.push(`${savePolicyRelativePath} is missing or unreadable: ${error.message}`);
  }
  if (readErrors.length > 0) return { errors: readErrors, manifest, tutorialVersion: null };
  const result = validateContentDocuments({ manifest, tutorialSource, patchNotes, packageDocument });
  return {
    ...result,
    errors: [
      ...result.errors,
      ...validateBuildMetadata(htmlSource, manifest, packageDocument),
      ...validateElectronSmokeMetadata(electronMainSource, manifest, packageDocument),
      ...validateElectronSmokeSaveVersion(electronMainSource, runtimeSource, savePolicySource),
    ],
    manifest,
    patchNotes,
    packageDocument,
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
  if (eventName === "workflow_dispatch") {
    assertRevisionAvailable(root, head, "Head revision");
    return { paths: [], mode: "history", base: "", head };
  }
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
    assertRevisionAvailable(root, head, "Head revision");
    return { paths: [], mode: "history", base: "", head };
  }
  const diff = runGit(root, ["diff", "--name-status", "-z", "HEAD", "--"]);
  const untracked = runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return {
    paths: [...parseNameStatusZ(diff.stdout), ...untracked.stdout.split("\0").filter(Boolean)],
    mode: "working-tree",
    base: "",
    head,
  };
}

function readGitFile(root, revision, relativePath) {
  const result = runGit(root, ["show", `${revision}:${relativePath}`], { allowFailure: true });
  return result.status === 0 ? result.stdout : null;
}

function validateReviewAdvancement({
  root,
  base,
  evaluation,
  manifest,
  tutorialVersion,
  patchNotes,
  packageDocument,
  requirePriorSources = false,
}) {
  const errors = [];
  if (evaluation.authoritativeFiles.length === 0 || !base || isAllZeroSha(base)) return errors;

  const previousTutorialSource = readGitFile(root, base, manifest.tutorialSourcePath);
  if (previousTutorialSource === null) {
    if (requirePriorSources) {
      errors.push(`Prior release checkpoint is missing ${manifest.tutorialSourcePath}.`);
    }
  } else {
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
  if (previousPatchSource === null) {
    if (requirePriorSources) {
      errors.push(`Prior release checkpoint is missing ${manifest.patchNoteSourcePath}.`);
    }
  } else {
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
      const previousReleases = previous?.releases;
      const currentReleases = patchNotes?.releases;
      const currentTail = Array.isArray(previousReleases) && Array.isArray(currentReleases)
        ? currentReleases.slice(-previousReleases.length)
        : [];
      const identityKeys = [
        "version",
        "releaseDate",
        "buildIdentity",
        "gameplayContractVersion",
        "tutorialVersion",
      ];
      const preservedTail = Array.isArray(previousReleases)
        && Array.isArray(currentReleases)
        && previousReleases.length > 0
        && currentReleases.length > previousReleases.length
        && previousReleases.every((release, index) => (
          identityKeys.every((key) => release?.[key] === currentTail[index]?.[key])
        ));
      if (!preservedTail) {
        errors.push("Patch-note review must append a new release while preserving prior release identities and order.");
      }
    } catch {
      errors.push("The prior canonical patch-note source is invalid and cannot establish release advancement.");
    }
  }

  const previousPackageSource = readGitFile(root, base, packageRelativePath);
  if (previousPackageSource === null) {
    if (requirePriorSources) {
      errors.push(`Prior release checkpoint is missing ${packageRelativePath}.`);
    }
  } else {
    try {
      const previousPackage = JSON.parse(previousPackageSource);
      const comparison = compareSemanticVersions(packageDocument?.version, previousPackage?.version);
      if (comparison === null || comparison <= 0) {
        errors.push("package.json version must advance beyond the prior release checkpoint.");
      }
    } catch {
      errors.push("The prior package.json is invalid and cannot establish release advancement.");
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
  // reachable non-merge commit is inspected in the same range, while novel
  // merge-authored resolutions are classified separately below.
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

function isCommitAncestor(root, ancestor, descendant) {
  const result = runGit(root, ["merge-base", "--is-ancestor", ancestor, descendant], {
    allowFailure: true,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const detail = (result.stderr || result.stdout || "unknown git error").trim();
  throw new Error(`Unable to compare commit ancestry: ${detail}`);
}

function novelMergeResolutionPaths(root, commit, parents, changedPaths) {
  if (parents.length < 2) return [];
  return changedPaths.filter((relativePath) => {
    const mergedObject = objectAtPath(root, commit, relativePath);
    return parents.every((parent) => objectAtPath(root, parent, relativePath) !== mergedObject);
  });
}

function isAtomicReviewCheckpoint(result) {
  return result.parents.length < 2
    && result.tutorialReviewed
    && result.patchNotesReviewed
    && result.packageReviewed;
}

function isReviewSurfaceMutation(result) {
  return result.tutorialReviewed || result.patchNotesReviewed || result.packageReviewed;
}

function isCoherentCheckpoint(root, candidate, fallbackManifest) {
  const loadedManifest = manifestAtRevision(root, candidate.commit, fallbackManifest);
  if (loadedManifest.errors.length > 0) return false;
  const reviewState = reviewStateAtCommit(root, candidate.commit, loadedManifest.manifest);
  return reviewState.errors.length === 0
    && reviewState.tutorialVersion !== null
    && reviewState.patchNotes !== null
    && reviewState.packageDocument !== null;
}

function historicalCheckpointCandidates(root, checkpoint, inRangeCandidates, fallbackManifest) {
  const candidates = new Map(inRangeCandidates.map((candidate) => [candidate.commit, candidate]));
  if (checkpoint.parents.length === 0) return [...candidates.values()];
  const listed = runGit(root, [
    "rev-list",
    "--reverse",
    "--topo-order",
    "--full-history",
    ...checkpoint.parents,
    "--",
    tutorialSourceRelativePath,
    patchNoteSourceRelativePath,
    packageRelativePath,
  ]);
  const commits = listed.stdout.trim().length === 0
    ? []
    : listed.stdout.trim().split(/\s+/u);
  for (const commit of commits) {
    if (candidates.has(commit)) continue;
    const parents = commitParents(root, commit);
    if (parents.length > 1) continue;
    const changedPaths = changedPathsForCommit(root, commit, parents);
    if (
      changedPaths.includes(tutorialSourceRelativePath)
      && changedPaths.includes(patchNoteSourceRelativePath)
      && changedPaths.includes(packageRelativePath)
    ) {
      candidates.set(commit, { commit, parents });
    }
  }
  return [...candidates.values()].filter((candidate) => (
    isCoherentCheckpoint(root, candidate, fallbackManifest)
  ));
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
    packageDocument: parsedPackage.value,
  };
}

function evaluateCommitRange({ root = projectRoot, base, head, fallbackManifest }) {
  const includesRepositoryRoots = !base;
  if (!includesRepositoryRoots) assertRevisionAvailable(root, base, "Base revision");
  assertRevisionAvailable(root, head, "Head revision");
  const revisionSet = includesRepositoryRoots ? head : `${base}..${head}`;
  const listed = runGit(root, ["rev-list", "--reverse", "--topo-order", revisionSet, "--"]);
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
    // A merge that changes authoritative state relative to its first parent is
    // itself an integration change, even when the selected object came intact
    // from another parent. Counting the full first-parent net prevents a stale
    // reviewed parent from laundering a gameplay revert.
    const rangeAuthoritativeFiles = evaluation.authoritativeFiles;
    const rangeReviewPaths = changedPaths;
    if (
      loadedManifest.errors.length > 0
      && (evaluation.authoritativeFiles.length > 0 || changedPaths.includes(manifestRelativePath))
    ) {
      commitErrors.push(...loadedManifest.errors);
    }

    errors.push(...commitErrors.map((error) => `${prefix}: ${error}`));
    results.push({
      commit,
      parents,
      kind: parents.length > 1 ? "merge-first-parent" : "non-merge",
      changedPaths,
      mergeResolutionPaths,
      authoritativeFiles: rangeAuthoritativeFiles,
      tutorialReviewed: rangeReviewPaths.includes(manifest.tutorialSourcePath),
      patchNotesReviewed: rangeReviewPaths.includes(manifest.patchNoteSourcePath),
      packageReviewed: rangeReviewPaths.includes(packageRelativePath),
      errors: commitErrors,
    });
  }

  const lastAuthoritativeIndex = results.findLastIndex(
    (result) => result.authoritativeFiles.length > 0,
  );
  if (lastAuthoritativeIndex >= 0) {
    const authoritativeCommits = results.filter(
      (result) => result.authoritativeFiles.length > 0,
    );
    const reviewMutationCommits = results.filter(isReviewSurfaceMutation);
    const checkpointCandidates = results.filter(isAtomicReviewCheckpoint);
    const checkpoint = checkpointCandidates.findLast((candidate) => (
      authoritativeCommits.every((authoritative) => (
        isCommitAncestor(root, authoritative.commit, candidate.commit)
      ))
      && reviewMutationCommits.every((mutation) => (
        isCommitAncestor(root, mutation.commit, candidate.commit)
      ))
    ));

    if (checkpointCandidates.length === 0) {
      errors.push(
        "Authoritative player-facing changes require one final atomic release checkpoint that updates "
        + `${fallbackManifest.tutorialSourcePath}, ${fallbackManifest.patchNoteSourcePath}, and ${packageRelativePath}.`,
      );
    } else if (checkpoint === undefined) {
      const finalCandidate = checkpointCandidates.at(-1);
      if (finalCandidate === undefined) {
        throw new Error("Unable to resolve cumulative release-checkpoint coverage.");
      }
      const uncovered = authoritativeCommits.findLast((authoritative) => (
        !isCommitAncestor(root, authoritative.commit, finalCandidate.commit)
      ));
      if (uncovered !== undefined) {
        errors.push(
          `Authoritative commit ${uncovered.commit.slice(0, 12)} is not contained in final release checkpoint `
          + `${finalCandidate.commit.slice(0, 12)}; add a new atomic tutorial, patch-note, and version review after integration.`,
        );
      } else {
        const uncoveredReview = reviewMutationCommits.findLast((mutation) => (
          !isCommitAncestor(root, mutation.commit, finalCandidate.commit)
        ));
        if (uncoveredReview === undefined) {
          throw new Error("Unable to resolve cumulative release-checkpoint coverage.");
        }
        errors.push(
          `Review-surface commit ${uncoveredReview.commit.slice(0, 12)} is not contained in final release checkpoint `
          + `${finalCandidate.commit.slice(0, 12)}; tutorial, patch-note, and version review must finish atomically.`,
        );
      }
    } else {
      const loadedManifest = manifestAtRevision(root, checkpoint.commit, fallbackManifest);
      const checkpointManifest = loadedManifest.manifest;
      const checkpointEvaluation = {
        authoritativeFiles: authoritativeCommits.flatMap((result) => result.authoritativeFiles),
        tutorialReviewed: true,
        patchNotesReviewed: true,
      };
      const reviewState = reviewStateAtCommit(root, checkpoint.commit, checkpointManifest);
      const checkpointErrors = [
        ...loadedManifest.errors,
        ...reviewState.errors,
      ];
      for (const relativePath of [
        checkpointManifest.tutorialSourcePath,
        checkpointManifest.patchNoteSourcePath,
        packageRelativePath,
      ]) {
        if (objectAtPath(root, checkpoint.commit, relativePath) !== objectAtPath(root, head, relativePath)) {
          checkpointErrors.push(
            `${relativePath} at the validated head must match the final release checkpoint.`,
          );
        }
      }
      if (reviewState.tutorialVersion !== null && reviewState.patchNotes !== null) {
        const historicalCandidates = historicalCheckpointCandidates(
          root,
          checkpoint,
          checkpointCandidates,
          fallbackManifest,
        );
        const priorCheckpoints = historicalCandidates.filter((candidate) => (
          candidate.commit !== checkpoint.commit
          && isCommitAncestor(root, candidate.commit, checkpoint.commit)
        ));
        const comparisonBases = priorCheckpoints.length > 0
          ? priorCheckpoints.map((prior) => prior.commit)
          : checkpoint.parents.slice(0, 1);
        for (const comparisonBase of comparisonBases) {
          checkpointErrors.push(...validateReviewAdvancement({
            root,
            base: comparisonBase,
            evaluation: checkpointEvaluation,
            manifest: checkpointManifest,
            tutorialVersion: reviewState.tutorialVersion,
            patchNotes: reviewState.patchNotes,
            packageDocument: reviewState.packageDocument,
            requirePriorSources: priorCheckpoints.length > 0,
          }));
        }
      }
      errors.push(...[...new Set(checkpointErrors)].map(
        (error) => `Release checkpoint ${checkpoint.commit.slice(0, 12)}: ${error}`,
      ));
    }
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

  if (changed.mode === "range" || changed.mode === "history") {
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
    const comparisonBase = changed.mode === "working-tree"
      ? "HEAD"
      : changed.base;
    errors.push(...validateReviewAdvancement({
      root,
      base: comparisonBase,
      evaluation,
      manifest: local.manifest,
      tutorialVersion: local.tutorialVersion,
      patchNotes: local.patchNotes,
      packageDocument: local.packageDocument,
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
      ? `; ${result.commits.length} commit(s) examined under cumulative checkpoint rules`
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
  validateElectronSmokeMetadata,
  validateElectronSmokeSaveVersion,
  validateGameplayContract,
  validateLocalContent,
  validatePatchNotes,
  validateReviewAdvancement,
};
