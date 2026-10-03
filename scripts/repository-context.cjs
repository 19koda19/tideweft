#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INDEX_FORMAT_VERSION = 1;
const DEFAULT_CONFIG = "scripts/repository-context.config.json";
const DEFAULT_LOCAL_CONFIG = ".repository-context.local.json";
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const EXIT_CURRENT = 0;
const EXIT_STALE = 1;
const EXIT_UNAVAILABLE = 2;
const MAX_CONTEXT_RESULTS = 25;

class ContextToolError extends Error {
  constructor(message, exitCode = EXIT_STALE) {
    super(message);
    this.name = "ContextToolError";
    this.exitCode = exitCode;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeRepoPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function compactJson(value) {
  return `${JSON.stringify(stableValue(value))}\n`;
}

function runGit(root, args, { allowFailure = false, encoding = "utf8" } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFailure) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new ContextToolError(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function repositoryRoot(start = process.cwd()) {
  const result = runGit(path.resolve(start), ["rev-parse", "--show-toplevel"]);
  return fs.realpathSync(String(result.stdout).trim());
}

function assertSafeRelative(repoPath, label = "path") {
  if (typeof repoPath !== "string" || repoPath.length === 0) {
    throw new ContextToolError(`${label} must be a non-empty repository-relative path`);
  }
  const normalized = normalizeRepoPath(repoPath);
  if (
    normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || path.isAbsolute(repoPath)
    || normalized.includes("\0")
  ) {
    throw new ContextToolError(`${label} escapes the repository: ${repoPath}`);
  }
  return normalized;
}

function resolveInside(root, repoPath, label = "path") {
  const normalized = assertSafeRelative(repoPath, label);
  const resolved = path.resolve(root, normalized);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (resolved !== path.resolve(root) && !resolved.startsWith(prefix)) {
    throw new ContextToolError(`${label} escapes the repository: ${repoPath}`);
  }
  return resolved;
}

function safeSourceFile(root, repoPath, label = "source path") {
  const normalized = assertSafeRelative(repoPath, label);
  const absolute = resolveInside(root, normalized, label);
  let cursor = path.resolve(root);
  for (const segment of normalized.split("/")) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) {
      throw new ContextToolError(`${label} is missing: ${normalized}`);
    }
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      throw new ContextToolError(`${label} contains a symbolic link and was rejected: ${normalized}`);
    }
  }
  const realRoot = fs.realpathSync(root);
  const realSource = fs.realpathSync(absolute);
  if (realSource !== realRoot && !realSource.startsWith(`${realRoot}${path.sep}`)) {
    throw new ContextToolError(`${label} resolves outside this worktree: ${normalized}`);
  }
  if (!fs.statSync(realSource).isFile()) {
    throw new ContextToolError(`${label} is not a regular file: ${normalized}`);
  }
  return absolute;
}

function readJson(file, label = file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new ContextToolError(`Cannot read ${label}: ${error.message}`);
  }
}

function installedTypeScriptVersion() {
  return readJson(
    require.resolve("typescript/package.json"),
    "the installed TypeScript package",
  ).version;
}

function currentToolFingerprint() {
  return sha256(fs.readFileSync(__filename));
}

function readConfig(root, configPath = DEFAULT_CONFIG) {
  const normalized = assertSafeRelative(configPath, "config path");
  const absolute = safeSourceFile(root, normalized, "config path");
  const config = readJson(absolute, normalized);
  if (config.schemaVersion !== 1 || typeof config.toolVersion !== "string") {
    throw new ContextToolError(`${normalized} has an unsupported repository-context schema`);
  }
  if (!Array.isArray(config.eligibleRoots) || !Array.isArray(config.eligibleExtensions)) {
    throw new ContextToolError(`${normalized} is missing eligible source rules`);
  }
  return {
    absolute,
    config,
    fingerprint: sha256(fs.readFileSync(absolute)),
    path: normalized,
  };
}

function isIgnored(root, repoPath) {
  const result = runGit(root, ["check-ignore", "-q", "--", repoPath], { allowFailure: true });
  return result.status === 0;
}

function loadLocalConfig(root, {
  includePrivate = false,
  localConfigPath = DEFAULT_LOCAL_CONFIG,
} = {}) {
  if (!includePrivate) {
    return null;
  }
  const normalized = assertSafeRelative(localConfigPath, "local config path");
  const unresolved = resolveInside(root, normalized, "local config path");
  if (!fs.existsSync(unresolved)) {
    throw new ContextToolError(
      `Private context is unavailable because ${normalized} is absent; use public mode or ordinary repository inspection.`,
      EXIT_UNAVAILABLE,
    );
  }
  const absolute = safeSourceFile(root, normalized, "local config path");
  if (!isIgnored(root, normalized)) {
    throw new ContextToolError(`${normalized} must be ignored before private context can be read`);
  }
  const config = readJson(absolute, normalized);
  if (config.schemaVersion !== 1 || !Array.isArray(config.additionalSources)) {
    throw new ContextToolError(`${normalized} has an unsupported local context schema`);
  }
  return {
    absolute,
    config,
    fingerprint: sha256(fs.readFileSync(absolute)),
    path: normalized,
  };
}

function eligiblePublicPath(repoPath, config) {
  const normalized = normalizeRepoPath(repoPath);
  const basename = path.posix.basename(normalized).toLowerCase();
  if (
    basename === ".env"
    || basename.startsWith(".env.")
    || basename === "credentials.json"
    || basename === "service-account.json"
    || basename.includes("private-key")
  ) {
    return false;
  }
  if (config.excludedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }
  if (config.eligibleFiles.includes(normalized)) {
    return true;
  }
  if (!config.eligibleRoots.some((root) => normalized.startsWith(root))) {
    return false;
  }
  return config.eligibleExtensions.includes(path.posix.extname(normalized));
}

function listPublicSources(root, config) {
  const result = runGit(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "buffer",
  });
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizeRepoPath)
    .filter((repoPath) => eligiblePublicPath(repoPath, config))
    .filter((repoPath) => {
      const absolute = resolveInside(root, repoPath, "source path");
      if (!fs.existsSync(absolute)) {
        return false;
      }
      safeSourceFile(root, repoPath, "public source path");
      return true;
    })
    .sort((left, right) => left.localeCompare(right));
}

function parseExecutionView(root, localConfig) {
  const rule = localConfig?.config.executionView;
  if (!rule) {
    return null;
  }
  const sourcePath = assertSafeRelative(rule.source, "execution source");
  const unresolved = resolveInside(root, sourcePath, "execution source");
  if (!fs.existsSync(unresolved)) {
    return {
      activeDirective: null,
      activeDirectivePath: null,
      issue: `Execution source is missing: ${sourcePath}`,
      sourcePath,
    };
  }
  const absolute = safeSourceFile(root, sourcePath, "execution source");
  const content = fs.readFileSync(absolute, "utf8");
  const match = new RegExp(rule.activePattern, "mu").exec(content);
  if (!match || !match[1]) {
    return {
      activeDirective: null,
      activeDirectivePath: null,
      issue: `Active directive did not match the configured execution pattern in ${sourcePath}`,
      sourcePath,
    };
  }
  const activeDirective = match[1].trim();
  if (!/^[A-Za-z0-9_.-]+$/u.test(activeDirective)) {
    return {
      activeDirective: null,
      activeDirectivePath: null,
      issue: `Active directive contains unsupported path characters in ${sourcePath}`,
      sourcePath,
    };
  }
  const activeDirectivePath = rule.activePathTemplate
    ? assertSafeRelative(rule.activePathTemplate.replace("{active}", activeDirective), "active directive path")
    : null;
  const missingActiveDirective = activeDirectivePath
    && !fs.existsSync(resolveInside(root, activeDirectivePath, "active directive path"));
  return {
    activeDirective,
    activeDirectivePath,
    issue: missingActiveDirective ? `Active directive source is missing: ${activeDirectivePath}` : null,
    sourcePath,
  };
}

function listPrivateSources(root, localConfig, executionView) {
  if (!localConfig) {
    return [];
  }
  const sources = localConfig.config.additionalSources.map((entry) => ({
    mandatory: Boolean(entry.mandatory),
    path: assertSafeRelative(entry.path, "private source path"),
    reason: String(entry.reason || "local navigation source"),
  }));
  if (executionView?.sourcePath) {
    sources.push({
      mandatory: true,
      path: executionView.sourcePath,
      reason: "execution status source configured by the local context map",
    });
  }
  if (executionView?.activeDirectivePath) {
    sources.push({
      mandatory: true,
      path: executionView.activeDirectivePath,
      reason: "complete active directive selected by the execution dispatcher",
    });
  }
  const unique = new Map();
  for (const entry of sources) {
    const absolute = resolveInside(root, entry.path, "private source path");
    if (!fs.existsSync(absolute)) {
      if (entry.mandatory) {
        throw new ContextToolError(`Mandatory private navigation source is missing: ${entry.path}`);
      }
      continue;
    }
    safeSourceFile(root, entry.path, "private source path");
    if (!isIgnored(root, entry.path)) {
      throw new ContextToolError(`Private source must be ignored: ${entry.path}`);
    }
    unique.set(entry.path, entry);
  }
  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function workspaceIdentity(root) {
  const gitDirectory = String(
    runGit(root, ["rev-parse", "--path-format=absolute", "--git-dir"]).stdout,
  ).trim();
  return sha256(`${fs.realpathSync(root)}\0${fs.realpathSync(gitDirectory)}`).slice(0, 16);
}

function assertOutputAncestorInsideRoot(root, directory) {
  const resolvedRoot = path.resolve(root);
  const resolvedDirectory = path.resolve(directory);
  if (
    resolvedDirectory !== resolvedRoot
    && !resolvedDirectory.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new ContextToolError("Context output directory escapes this worktree");
  }
  const relative = path.relative(resolvedRoot, resolvedDirectory);
  let cursor = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) {
      break;
    }
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      throw new ContextToolError("Context output directory contains a symbolic link");
    }
  }
  let existing = directory;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) {
      throw new ContextToolError(`Cannot establish a safe output ancestor for ${directory}`);
    }
    existing = parent;
  }
  const realRoot = fs.realpathSync(root);
  const realExisting = fs.realpathSync(existing);
  if (realExisting !== realRoot && !realExisting.startsWith(`${realRoot}${path.sep}`)) {
    throw new ContextToolError("Context output directory resolves outside this worktree");
  }
}

function outputPathFor(root, config, mode, workspaceId = workspaceIdentity(root)) {
  const outputDirectory = assertSafeRelative(config.outputDirectory, "output directory");
  const directory = resolveInside(root, path.posix.join(outputDirectory, workspaceId), "output directory");
  assertOutputAncestorInsideRoot(root, directory);
  const outputFile = path.join(directory, mode === "local-private" ? "local-index.json" : "public-index.json");
  const outputRepoPath = normalizeRepoPath(path.relative(root, outputFile));
  if (!isIgnored(root, outputRepoPath)) {
    throw new ContextToolError(
      `Context output must be Git-ignored before generation: ${outputRepoPath}`,
    );
  }
  if (fs.existsSync(outputFile)) {
    const stat = fs.lstatSync(outputFile);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new ContextToolError("Context output file must be an ordinary file inside its worktree output directory");
    }
  }
  return outputFile;
}

function sourceSnapshot(root, publicPaths, privateSources = [], mandatoryPublicReferences = []) {
  const mandatoryPublic = new Map(
    mandatoryPublicReferences.map((entry) => [normalizeRepoPath(entry.path), entry.reason]),
  );
  const sources = [
    ...publicPaths.map((repoPath) => ({
      mandatory: mandatoryPublic.has(repoPath),
      path: repoPath,
      privacy: "public",
      reason: mandatoryPublic.get(repoPath) || null,
    })),
    ...privateSources.map((entry) => ({ ...entry, privacy: "private" })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const entries = sources.map((entry) => {
    const absolute = safeSourceFile(root, entry.path, "indexed source path");
    const stat = fs.statSync(absolute);
    if (stat.size > MAX_SOURCE_BYTES) {
      throw new ContextToolError(
        `Indexed source exceeds the ${MAX_SOURCE_BYTES}-byte safety bound: ${entry.path}`,
      );
    }
    const bytes = fs.readFileSync(absolute);
    return {
      bytes: bytes.length,
      mandatory: Boolean(entry.mandatory),
      path: entry.path,
      privacy: entry.privacy,
      reason: entry.reason || null,
      sha256: sha256(bytes),
    };
  });
  return {
    entries,
    fingerprint: sha256(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n")),
  };
}

function extractMarkdownHeadings(content) {
  const headings = [];
  const lines = content.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/u.exec(lines[index]);
    if (!match) {
      continue;
    }
    headings.push({
      level: match[1].length,
      line: index + 1,
      text: match[2].replace(/\s+#+$/u, "").trim(),
    });
  }
  return headings;
}

function extractMarkdownSection(content, heading) {
  const lines = content.split(/\r?\n/u);
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/u.exec(lines[index]);
    if (match && match[2].replace(/\s+#+$/u, "").trim().toLowerCase() === heading.toLowerCase()) {
      start = index;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) {
    return null;
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+/u.exec(lines[index]);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return `${lines.slice(start, end).join("\n").trimEnd()}\n`;
}

function lineCount(content) {
  if (content.length === 0) {
    return 0;
  }
  return content.split(/\r?\n/u).length;
}

async function createTypeScriptExtractor(root, changedPaths) {
  const typescriptPaths = changedPaths.filter((repoPath) => /\.tsx?$/u.test(repoPath));
  if (typescriptPaths.length === 0) {
    return {
      close() {},
      extract() {
        return { directImports: [], symbols: [] };
      },
      version: installedTypeScriptVersion(),
    };
  }
  let syncApi;
  let astApi;
  try {
    syncApi = await import("typescript/unstable/sync");
    astApi = await import("typescript/unstable/ast");
  } catch (error) {
    throw new ContextToolError(`TypeScript parser unavailable: ${error.message}`);
  }
  const typescriptVersion = installedTypeScriptVersion();
  const api = new syncApi.API({ cwd: root });
  let snapshot;
  try {
    snapshot = api.updateSnapshot({ openProjects: [path.join(root, "tsconfig.json")] });
  } catch (error) {
    api.close();
    throw new ContextToolError(`TypeScript project extraction failed: ${error.message}`);
  }
  const project = snapshot.getProjects()[0];
  if (!project || !project.program) {
    snapshot.dispose();
    api.close();
    throw new ContextToolError("TypeScript parser returned no configured project");
  }
  const { SyntaxKind } = astApi;
  function statementLine(sourceFile, statement) {
    return sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
  }
  function isExported(statement) {
    return statement.modifiers?.some(
      (modifier) => SyntaxKind[modifier.kind] === "ExportKeyword",
    ) ?? false;
  }
  return {
    close() {
      snapshot.dispose();
      api.close();
    },
    extract(repoPath) {
      const sourceFile = project.program.getSourceFile(path.join(root, repoPath));
      if (!sourceFile) {
        return {
          directImports: [],
          parseIssue: "not present in the configured TypeScript project",
          symbols: [],
        };
      }
      const directImports = [];
      const symbols = [];
      for (const statement of sourceFile.statements) {
        const kind = SyntaxKind[statement.kind] || `SyntaxKind(${statement.kind})`;
        const line = statementLine(sourceFile, statement);
        if (statement.kind === SyntaxKind.ImportDeclaration && statement.moduleSpecifier?.text) {
          directImports.push({
            basis: "mechanically-extracted-static-import",
            line,
            specifier: statement.moduleSpecifier.text,
          });
        }
        if (statement.kind === SyntaxKind.VariableStatement) {
          for (const declaration of statement.declarationList?.declarations || []) {
            const name = declaration.name?.text;
            if (typeof name === "string") {
              symbols.push({
                exported: isExported(statement),
                kind: "VariableDeclaration",
                line,
                name,
              });
            }
          }
          continue;
        }
        const name = statement.name?.text;
        if (typeof name === "string") {
          symbols.push({
            exported: isExported(statement),
            kind,
            line,
            name,
          });
        }
      }
      return { directImports, symbols };
    },
    version: typescriptVersion,
  };
}

function extractCommonJsFacts(content) {
  const directImports = [];
  const symbols = [];
  const lines = content.split(/\r?\n/u);
  lines.forEach((lineText, index) => {
    const requireMatch = /\brequire\(["']([^"']+)["']\)/u.exec(lineText);
    if (requireMatch) {
      directImports.push({
        basis: "mechanically-extracted-cjs-require",
        line: index + 1,
        specifier: requireMatch[1],
      });
    }
    const declarationMatch = /^\s*(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/u.exec(lineText);
    if (declarationMatch) {
      symbols.push({
        exported: false,
        kind: lineText.includes("class ") ? "ClassDeclaration" : "FunctionDeclaration",
        line: index + 1,
        name: declarationMatch[1],
      });
    }
  });
  return { directImports, symbols };
}

function recordKind(repoPath) {
  if (/\.test\.[cm]?[jt]sx?$/u.test(repoPath) || /\.selftest\.cjs$/u.test(repoPath)) {
    return "test-source";
  }
  if (/\.[cm]?[jt]sx?$/u.test(repoPath)) {
    return "source-module";
  }
  if (/\.md$/u.test(repoPath)) {
    return "documentation";
  }
  if (/\.json$/u.test(repoPath)) {
    return "structured-data";
  }
  return "repository-file";
}

function resolveImportPath(sourcePath, specifier, sourcePaths) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const sourceDirectory = path.posix.dirname(sourcePath);
  const candidate = path.posix.normalize(path.posix.join(sourceDirectory, specifier));
  const possibilities = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.js`,
    `${candidate}.cjs`,
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
    `${candidate}/index.js`,
  ];
  return possibilities.find((entry) => sourcePaths.has(entry)) || null;
}

async function buildFileRecords(root, snapshot, {
  oldIndex = null,
  reuseAllowed = false,
} = {}) {
  const oldRecords = new Map((oldIndex?.files || []).map((record) => [record.source.path, record]));
  const changed = snapshot.entries.filter((entry) => {
    const prior = oldRecords.get(entry.path);
    return !reuseAllowed || !prior || prior.source.sha256 !== entry.sha256;
  });
  const extractor = await createTypeScriptExtractor(root, changed.map((entry) => entry.path));
  const records = [];
  try {
    for (const entry of snapshot.entries) {
      const prior = oldRecords.get(entry.path);
      if (reuseAllowed && prior && prior.source.sha256 === entry.sha256) {
        records.push({ ...prior, mandatory: entry.mandatory, reason: entry.reason });
        continue;
      }
      const absolute = safeSourceFile(root, entry.path, "indexed source path");
      const content = fs.readFileSync(absolute, "utf8");
      let extracted = { directImports: [], symbols: [] };
      if (/\.tsx?$/u.test(entry.path)) {
        extracted = extractor.extract(entry.path);
      } else if (/\.cjs$/u.test(entry.path)) {
        extracted = extractCommonJsFacts(content);
      }
      records.push({
        associatedTests: [],
        directImports: extracted.directImports,
        extraction: "MECHANICAL",
        headings: /\.md$/u.test(entry.path) ? extractMarkdownHeadings(content) : [],
        id: `file:${entry.path}`,
        kind: recordKind(entry.path),
        mandatory: entry.mandatory,
        parseIssue: extracted.parseIssue || null,
        privacy: entry.privacy,
        reason: entry.reason,
        source: {
          bytes: entry.bytes,
          lines: lineCount(content),
          path: entry.path,
          sha256: entry.sha256,
        },
        symbols: extracted.symbols,
      });
    }
  } finally {
    extractor.close();
  }
  const sourcePaths = new Set(records.map((record) => record.source.path));
  for (const record of records) {
    record.directImports = record.directImports.map((entry) => ({
      ...entry,
      resolvedPath: resolveImportPath(record.source.path, entry.specifier, sourcePaths),
    }));
  }
  const tests = records.filter((record) => record.kind === "test-source");
  for (const record of records) {
    if (record.kind === "test-source") {
      continue;
    }
    const sourceStem = record.source.path.replace(/\.[^.]+$/u, "");
    record.associatedTests = tests
      .filter((testRecord) => {
        const sameName = testRecord.source.path.startsWith(`${sourceStem}.`);
        const importsSource = testRecord.directImports.some(
          (entry) => entry.resolvedPath === record.source.path,
        );
        return sameName || importsSource;
      })
      .map((testRecord) => ({
        basis: testRecord.source.path.startsWith(`${sourceStem}.`)
          ? "name-family-candidate"
          : "mechanically-extracted-direct-import",
        coverageProven: false,
        path: testRecord.source.path,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }
  return {
    records: records.sort((left, right) => left.source.path.localeCompare(right.source.path)),
    typescriptVersion: extractor.version,
  };
}

function createReviewedSummaries(root, summaries, filesByPath) {
  return summaries.map((summary) => {
    const sourcePath = assertSafeRelative(summary.source.path, "reviewed summary source");
    const sourceRecord = filesByPath.get(sourcePath);
    if (!sourceRecord) {
      return {
        ...summary,
        actualLocatorFingerprint: null,
        actualSourceFingerprint: null,
        missingEvidence: (summary.evidence || []).filter((entry) => !filesByPath.has(entry)),
        reviewState: "REVIEW_REQUIRED",
        verificationIssue: `Source is not indexed: ${sourcePath}`,
      };
    }
    const content = fs.readFileSync(safeSourceFile(root, sourcePath, "reviewed summary source"), "utf8");
    let located = null;
    if (summary.source.locatorType === "heading") {
      located = extractMarkdownSection(content, summary.source.locator);
    }
    const actualSourceFingerprint = sourceRecord.source.sha256;
    const actualLocatorFingerprint = located ? sha256(located) : null;
    const current = summary.reviewedSourceFingerprint === actualSourceFingerprint && Boolean(located);
    return {
      ...summary,
      actualLocatorFingerprint,
      actualSourceFingerprint,
      missingEvidence: (summary.evidence || []).filter((entry) => !filesByPath.has(entry)),
      reviewState: current ? "CURRENT" : "REVIEW_REQUIRED",
      verificationIssue: located
        ? (current ? null : "Authored source changed after this semantic summary was reviewed")
        : `Locator was not found: ${summary.source.locator}`,
    };
  });
}

function validateRoutes(root, routes, filesByPath, summariesById, configSource) {
  return routes.map((route) => {
    const references = [
      ...route.canonicalSources.map((entry) => entry.path),
      ...route.implementationEntries,
      ...route.tests,
    ];
    const missingReferences = references.filter((repoPath) => !filesByPath.has(repoPath));
    const missingContracts = route.relatedContracts.filter((id) => !summariesById.has(id));
    const missingLocators = route.canonicalSources.filter((entry) => {
      if (!filesByPath.has(entry.path)) {
        return false;
      }
      const content = fs.readFileSync(safeSourceFile(root, entry.path, "route source"), "utf8");
      if (entry.locatorType === "heading") {
        return extractMarkdownSection(content, String(entry.locator)) === null;
      }
      if (entry.locatorType === "contract-id" || entry.locatorType === undefined) {
        return !content.toLowerCase().includes(String(entry.locator).toLowerCase());
      }
      return true;
    });
    return {
      ...route,
      kind: "authored-navigation-route",
      missingContracts,
      missingLocators,
      missingReferences,
      source: {
        basis: "reviewed navigation metadata",
        path: configSource.path,
        sha256: configSource.fingerprint,
        configRecord: route.id,
      },
    };
  });
}

function packageCommands(root) {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) {
    return {};
  }
  return readJson(packagePath, "package.json").scripts || {};
}

function readExistingIndex(outputFile) {
  if (!fs.existsSync(outputFile)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(outputFile, "utf8"));
  } catch {
    return null;
  }
}

function atomicWrite(root, file, content) {
  const directory = path.dirname(file);
  assertOutputAncestorInsideRoot(root, directory);
  fs.mkdirSync(directory, { recursive: true });
  assertOutputAncestorInsideRoot(root, directory);
  const realDirectory = fs.realpathSync(directory);
  const temporary = path.join(realDirectory, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    assertOutputAncestorInsideRoot(root, directory);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) {
      fs.unlinkSync(temporary);
    }
  }
}

async function generateIndex(options = {}) {
  const root = repositoryRoot(options.root || process.cwd());
  const toolFingerprint = currentToolFingerprint();
  const configInfo = readConfig(root, options.configPath || DEFAULT_CONFIG);
  const localConfig = loadLocalConfig(root, options);
  const mode = localConfig ? "local-private" : "public";
  const executionView = parseExecutionView(root, localConfig);
  const publicPaths = listPublicSources(root, configInfo.config);
  const privateSources = listPrivateSources(root, localConfig, executionView);
  const before = sourceSnapshot(
    root,
    publicPaths,
    privateSources,
    configInfo.config.mandatoryPublicReferences || [],
  );
  if (typeof options.afterInitialSnapshot === "function") {
    options.afterInitialSnapshot({ root, snapshot: before });
  }
  const workspaceId = workspaceIdentity(root);
  const outputFile = outputPathFor(root, configInfo.config, mode, workspaceId);
  const oldIndex = readExistingIndex(outputFile);
  const typescriptVersion = installedTypeScriptVersion();
  const reuseAllowed = Boolean(
    oldIndex
    && oldIndex.formatVersion === INDEX_FORMAT_VERSION
    && oldIndex.toolVersion === configInfo.config.toolVersion
    && oldIndex.toolFingerprint === toolFingerprint
    && oldIndex.configFingerprint === configInfo.fingerprint
    && oldIndex.localConfigFingerprint === (localConfig?.fingerprint || null)
    && oldIndex.typescriptVersion === typescriptVersion
  );
  const extracted = await buildFileRecords(root, before, { oldIndex, reuseAllowed });
  const filesByPath = new Map(extracted.records.map((record) => [record.source.path, record]));
  const missingMandatoryPublic = (configInfo.config.mandatoryPublicReferences || [])
    .map((entry) => normalizeRepoPath(entry.path))
    .filter((sourcePath) => !filesByPath.has(sourcePath));
  if (missingMandatoryPublic.length > 0) {
    throw new ContextToolError(
      `Mandatory public navigation source is missing: ${missingMandatoryPublic.join(", ")}`,
    );
  }
  const reviewedSummaries = createReviewedSummaries(
    root,
    configInfo.config.reviewedSummaries || [],
    filesByPath,
  );
  const summariesById = new Map(reviewedSummaries.map((summary) => [summary.id, summary]));
  const routes = validateRoutes(
    root,
    configInfo.config.domainRoutes || [],
    filesByPath,
    summariesById,
    configInfo,
  );
  const afterPublicPaths = listPublicSources(root, configInfo.config);
  const afterExecutionView = parseExecutionView(root, localConfig);
  const afterPrivateSources = listPrivateSources(root, localConfig, afterExecutionView);
  const after = sourceSnapshot(
    root,
    afterPublicPaths,
    afterPrivateSources,
    configInfo.config.mandatoryPublicReferences || [],
  );
  if (before.fingerprint !== after.fingerprint) {
    throw new ContextToolError(
      "Repository sources changed during generation; the previous index was preserved. Regenerate from a stable snapshot.",
    );
  }
  const finalConfigInfo = readConfig(root, options.configPath || DEFAULT_CONFIG);
  const finalLocalConfig = loadLocalConfig(root, options);
  if (
    finalConfigInfo.fingerprint !== configInfo.fingerprint
    || (finalLocalConfig?.fingerprint || null) !== (localConfig?.fingerprint || null)
  ) {
    throw new ContextToolError(
      "Repository context configuration changed during generation; the previous index was preserved. Regenerate from a stable snapshot.",
    );
  }
  if (installedTypeScriptVersion() !== typescriptVersion) {
    throw new ContextToolError(
      "The TypeScript parser changed during generation; the previous index was preserved. Regenerate from a stable toolchain.",
    );
  }
  if (currentToolFingerprint() !== toolFingerprint) {
    throw new ContextToolError(
      "The context tool changed during generation; the previous index was preserved. Regenerate from a stable tool version.",
    );
  }
  const index = {
    authority: {
      conflictRule: "Investigate code/document disagreement in original sources; this derived index cannot resolve it.",
      statement: "Derived navigation only. Original source, canonical documents, and current execution records remain authoritative.",
    },
    configFingerprint: configInfo.fingerprint,
    configPath: configInfo.path,
    executionView,
    files: extracted.records,
    formatVersion: INDEX_FORMAT_VERSION,
    localConfigFingerprint: localConfig?.fingerprint || null,
    mode,
    packageCommands: packageCommands(root),
    reviewedSummaries,
    routes,
    sourceSetFingerprint: before.fingerprint,
    toolFingerprint,
    toolVersion: configInfo.config.toolVersion,
    typescriptVersion: extracted.typescriptVersion,
    workspaceId,
  };
  const serialized = compactJson(index);
  atomicWrite(root, outputFile, serialized);
  return {
    index,
    outputFile,
    reusedRecords: reuseAllowed
      ? extracted.records.filter((record) => oldIndex?.files?.some(
        (prior) => prior.source.path === record.source.path && prior.source.sha256 === record.source.sha256,
      )).length
      : 0,
    serializedBytes: Buffer.byteLength(serialized),
  };
}

function currentIndexState(options = {}) {
  const root = repositoryRoot(options.root || process.cwd());
  const configInfo = readConfig(root, options.configPath || DEFAULT_CONFIG);
  let localConfig;
  try {
    localConfig = loadLocalConfig(root, options);
  } catch (error) {
    if (error instanceof ContextToolError && error.exitCode === EXIT_UNAVAILABLE) {
      return {
        code: EXIT_UNAVAILABLE,
        issues: [error.message],
        index: null,
        outputFile: null,
        root,
      };
    }
    throw error;
  }
  const mode = localConfig ? "local-private" : "public";
  const workspaceId = workspaceIdentity(root);
  const outputFile = outputPathFor(root, configInfo.config, mode, workspaceId);
  if (!fs.existsSync(outputFile)) {
    return {
      code: EXIT_UNAVAILABLE,
      issues: ["Context index is unavailable; generate it or continue with ordinary repository inspection."],
      index: null,
      outputFile,
      root,
    };
  }
  let index;
  try {
    index = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  } catch (error) {
    return {
      code: EXIT_STALE,
      issues: [`Context index is unreadable: ${error.message}`],
      index: null,
      outputFile,
      root,
    };
  }
  const issues = [];
  if (index.formatVersion !== INDEX_FORMAT_VERSION) {
    issues.push("Index format version changed");
  }
  if (index.toolVersion !== configInfo.config.toolVersion) {
    issues.push("Index tool version changed");
  }
  if (index.toolFingerprint !== currentToolFingerprint()) {
    issues.push("Index tool implementation changed");
  }
  if (index.configFingerprint !== configInfo.fingerprint) {
    issues.push("Index configuration changed");
  }
  if (index.localConfigFingerprint !== (localConfig?.fingerprint || null)) {
    issues.push("Local context configuration changed");
  }
  if (index.typescriptVersion !== installedTypeScriptVersion()) {
    issues.push("TypeScript parser version changed");
  }
  if (index.workspaceId !== workspaceId) {
    issues.push("Index belongs to a different worktree");
  }
  const executionView = parseExecutionView(root, localConfig);
  const publicPaths = listPublicSources(root, configInfo.config);
  const privateSources = listPrivateSources(root, localConfig, executionView);
  const snapshot = sourceSnapshot(
    root,
    publicPaths,
    privateSources,
    configInfo.config.mandatoryPublicReferences || [],
  );
  if (index.sourceSetFingerprint !== snapshot.fingerprint) {
    const indexed = new Map((index.files || []).map((record) => [record.source.path, record.source.sha256]));
    const current = new Map(snapshot.entries.map((entry) => [entry.path, entry.sha256]));
    for (const sourcePath of [...new Set([...indexed.keys(), ...current.keys()])].sort()) {
      if (!indexed.has(sourcePath)) {
        issues.push(`New eligible source: ${sourcePath}`);
      } else if (!current.has(sourcePath)) {
        issues.push(`Indexed source renamed, deleted, or no longer eligible: ${sourcePath}`);
      } else if (indexed.get(sourcePath) !== current.get(sourcePath)) {
        issues.push(`Source changed: ${sourcePath}`);
      }
      if (issues.length >= 25) {
        issues.push("Additional source changes omitted");
        break;
      }
    }
  }
  for (const summary of index.reviewedSummaries || []) {
    if (summary.reviewState !== "CURRENT") {
      issues.push(`Reviewed summary requires review: ${summary.id}`);
    }
    if (summary.missingEvidence?.length) {
      issues.push(`Reviewed summary ${summary.id} has missing evidence: ${summary.missingEvidence.join(", ")}`);
    }
  }
  for (const route of index.routes || []) {
    if (route.missingReferences?.length) {
      issues.push(`Route ${route.id} has missing references: ${route.missingReferences.join(", ")}`);
    }
    if (route.missingContracts?.length) {
      issues.push(`Route ${route.id} has missing contracts: ${route.missingContracts.join(", ")}`);
    }
    if (route.missingLocators?.length) {
      issues.push(
        `Route ${route.id} has missing locators: ${route.missingLocators.map(
          (entry) => `${entry.path}#${entry.locator}`,
        ).join(", ")}`,
      );
    }
  }
  if (executionView?.issue) {
    issues.push(executionView.issue);
  }
  return {
    code: issues.length ? EXIT_STALE : EXIT_CURRENT,
    index,
    issues,
    outputFile,
    root,
  };
}

function tokenize(value) {
  return [...new Set(String(value).toLowerCase().match(/[a-z0-9][a-z0-9_.-]{1,}/gu) || [])]
    .filter((token) => !new Set(["and", "for", "from", "into", "the", "this", "with"]).has(token));
}

function recordSearchText(record) {
  return [
    record.source.path,
    ...record.headings.map((entry) => entry.text),
    ...record.symbols.map((entry) => entry.name),
    ...record.directImports.map((entry) => entry.specifier),
  ].join(" ").toLowerCase();
}

function scoreText(text, tokens) {
  let score = 0;
  const reasons = [];
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const count = (text.match(new RegExp(escaped, "gu")) || []).length;
    if (count > 0) {
      score += 1;
      reasons.push(token);
    }
  }
  return { reasons, score };
}

function selectRoutePaths(paths, tokens, limit = 2) {
  return paths
    .map((entry, ordinal) => ({
      entry,
      ordinal,
      score: scoreText(entry.toLowerCase(), tokens).score,
    }))
    .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

function routeContext(index, request, { limit = 3 } = {}) {
  const boundedLimit = Number.isInteger(limit) && limit >= 1
    ? Math.min(limit, MAX_CONTEXT_RESULTS)
    : 3;
  const requestedContract = String(request.contract || "").trim();
  const requestedFile = request.file ? normalizeRepoPath(request.file) : null;
  const hasExactScope = Boolean(requestedFile || request.symbol);
  const tokens = tokenize([
    request.query,
    request.domain,
    request.file,
    request.symbol,
    request.contract,
    request.directive,
  ].filter(Boolean).join(" "));
  const routeMatches = (index.routes || []).map((route) => {
    const text = [route.id, route.purpose, ...(route.aliases || [])].join(" ").toLowerCase();
    const scored = scoreText(text, tokens);
    if (requestedContract && route.relatedContracts?.includes(requestedContract)) {
      scored.score += 100;
      scored.reasons.push("exact-contract-route");
    }
    return { ...scored, route };
  }).filter((entry) => entry.score >= Math.min(2, Math.max(1, tokens.length)))
    .sort((left, right) => right.score - left.score || left.route.id.localeCompare(right.route.id));
  const routeContractIds = new Set(
    routeMatches.slice(0, 3).flatMap((entry) => entry.route.relatedContracts || []),
  );
  const summaryMatches = (index.reviewedSummaries || []).map((summary) => {
    const text = [
      summary.id,
      summary.purpose,
      summary.declaredStatus,
      ...(summary.inputs || []),
      ...(summary.outputs || []),
      ...(summary.invariants || []),
      ...(summary.prohibitions || []),
    ].join(" ").toLowerCase();
    const scored = scoreText(text, tokens);
    if (requestedContract && summary.id === requestedContract) {
      scored.score += 100;
      scored.reasons.push("exact-contract");
    }
    if (routeContractIds.has(summary.id)) {
      scored.score += 5;
      scored.reasons.push("selected-domain-contract");
    }
    return { ...scored, summary };
  }).filter((entry) => (
    routeContractIds.size > 0
      ? routeContractIds.has(entry.summary.id)
      : entry.score >= 2
  ))
    .sort((left, right) => right.score - left.score || left.summary.id.localeCompare(right.summary.id));
  const seededPaths = new Set();
  for (const match of routeMatches.slice(0, 3)) {
    match.route.canonicalSources.forEach((entry) => seededPaths.add(entry.path));
    match.route.implementationEntries.forEach((entry) => seededPaths.add(entry));
    match.route.tests.forEach((entry) => seededPaths.add(entry));
  }
  const fileMatches = (index.files || []).map((record) => {
    const scored = scoreText(recordSearchText(record), tokens);
    if (seededPaths.has(record.source.path)) {
      scored.score += 5;
      scored.reasons.push("selected-domain-route");
    }
    if (requestedFile && record.source.path === requestedFile) {
      scored.score += 100;
      scored.reasons.push("exact-file");
    }
    if (request.symbol && record.symbols.some((entry) => entry.name === request.symbol)) {
      scored.score += 100;
      scored.reasons.push("exact-symbol");
    }
    return { ...scored, record };
  }).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.record.source.path.localeCompare(right.record.source.path));
  const mandatory = (index.files || [])
    .filter((record) => record.mandatory)
    .map((record) => ({
      path: record.source.path,
      reason: record.reason || "configured mandatory source",
      sha256: record.source.sha256,
    }));
  const recordsByPath = new Map((index.files || []).map((record) => [record.source.path, record]));
  function directDependencies(paths) {
    const selected = new Set(paths);
    const dependencies = new Set();
    for (const sourcePath of selected) {
      for (const dependency of recordsByPath.get(sourcePath)?.directImports || []) {
        if (dependency.resolvedPath && !selected.has(dependency.resolvedPath)) {
          dependencies.add(dependency.resolvedPath);
        }
      }
    }
    return [...dependencies].sort().slice(0, 2);
  }
  function directConsumers(paths) {
    const selected = new Set(paths);
    return (index.files || [])
      .filter((record) => (
        record.kind === "source-module"
        && !selected.has(record.source.path)
        && record.directImports.some((dependency) => selected.has(dependency.resolvedPath))
      ))
      .map((record) => record.source.path)
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 2);
  }
  const canonicalByPath = new Map();
  function addCanonical(pathValue, locator, reason) {
    const existing = canonicalByPath.get(pathValue) || {
      locators: [],
      path: pathValue,
      selectedBy: [],
    };
    if (!existing.locators.includes(locator)) {
      existing.locators.push(locator);
    }
    if (!existing.selectedBy.includes(reason)) {
      existing.selectedBy.push(reason);
    }
    canonicalByPath.set(pathValue, existing);
  }
  for (const match of routeMatches.slice(0, 3)) {
    for (const source of match.route.canonicalSources) {
      addCanonical(source.path, source.locator, match.route.id);
    }
  }
  for (const match of summaryMatches.slice(0, 3)) {
    addCanonical(match.summary.source.path, match.summary.source.locator, match.summary.id);
  }
  const canonical = [...canonicalByPath.values()];
  const expansionCandidates = hasExactScope
    ? fileMatches.filter((entry) => (
      (!requestedFile || entry.reasons.includes("exact-file"))
      && (!request.symbol || entry.reasons.includes("exact-symbol"))
    ))
    : (routeMatches.length > 0 ? [] : fileMatches);
  const mechanicalMatchCount = hasExactScope ? expansionCandidates.length : fileMatches.length;
  const selectedFiles = expansionCandidates.slice(0, boundedLimit).map((entry) => ({
    associatedTests: entry.record.associatedTests.slice(0, 2).map((test) => test.path),
    ...(hasExactScope ? { affectedConsumers: directConsumers([entry.record.source.path]) } : {}),
    dependencies: entry.record.directImports
      .map((dependency) => dependency.resolvedPath)
      .filter(Boolean)
      .slice(0, 2),
    kind: entry.record.kind,
    locators: [
      ...entry.record.headings
        .filter((heading) => tokens.some((token) => heading.text.toLowerCase().includes(token)))
        .slice(0, 2)
        .map((heading) => ({ heading: heading.text, line: heading.line })),
      ...entry.record.symbols
        .filter((symbol) => request.symbol
          ? symbol.name === request.symbol
          : tokens.some((token) => symbol.name.toLowerCase().includes(token)))
        .slice(0, 2)
        .map((symbol) => ({ line: symbol.line, symbol: symbol.name })),
    ],
    path: entry.record.source.path,
    privacy: entry.record.privacy,
    reason: `matched ${[...new Set(entry.reasons)].join(", ")}`,
    sourceFingerprint: entry.record.source.sha256,
  }));
  const uncertainty = [];
  if (tokens.length === 0) {
    uncertainty.push("No searchable task terms were supplied.");
  }
  if (hasExactScope && expansionCandidates.length === 0) {
    uncertainty.push(
      "No indexed source matches all explicit file/symbol selectors. This does not prove that the source or symbol is absent; use ordinary repository search.",
    );
  }
  if (routeMatches.length === 0 && fileMatches.length === 0 && summaryMatches.length === 0) {
    uncertainty.push(
      "No indexed match was found. This does not prove that the behavior, requirement, or relationship is absent; use ordinary repository search.",
    );
  }
  uncertainty.push(
    "Mechanical links are incomplete and do not prove runtime use, reachability, or coverage.",
  );
  return {
    authority: "Derived; open cited sources before consequential edits.",
    canonicalSourcesToOpen: canonical,
    criticalConstraints: summaryMatches.slice(0, 3).map((entry) => ({
      declaredStatus: entry.summary.declaredStatus,
      exceptions: entry.summary.exceptions,
      id: entry.summary.id,
      invariants: entry.summary.invariants.slice(0, 2),
      prohibitions: entry.summary.prohibitions.slice(0, 1),
      reviewState: entry.summary.reviewState,
      source: {
        locator: entry.summary.source.locator,
        path: entry.summary.source.path,
      },
    })),
    mandatorySourcesToOpen: mandatory,
    matchedRoutes: routeMatches.slice(0, 3).map((entry) => {
      const implementationEntries = selectRoutePaths(entry.route.implementationEntries, tokens);
      return {
        id: entry.route.id,
        implementationEntries,
        matchedTerms: entry.reasons,
        mechanicalLinks: {
          affectedConsumers: directConsumers(implementationEntries),
          basis: "direct imports; incomplete",
          dependencies: directDependencies(implementationEntries),
        },
        purpose: entry.route.purpose,
        relatedContracts: entry.route.relatedContracts || [],
        tests: selectRoutePaths(entry.route.tests, tokens),
        validationCommands: entry.route.validationCommands || [],
      };
    }),
    optionalExpansion: selectedFiles,
    requestedScope: request,
    selectionBudget: {
      additionalMechanicalMatches: Math.max(0, mechanicalMatchCount - selectedFiles.length),
      next: mechanicalMatchCount > selectedFiles.length
        ? (hasExactScope ? "raise --limit or narrow with --file" : "narrow with --file/--symbol")
        : null,
      optionalRecordsReturned: selectedFiles.length,
    },
    uncertainty,
  };
}

function contextPacket(options = {}) {
  const state = currentIndexState(options);
  if (state.code !== EXIT_CURRENT) {
    return {
      code: state.code,
      packet: {
        fallback: [
          "Inspect applicable repository instructions and current execution state directly.",
          "Use targeted repository search, then open the current canonical source and relevant implementation/tests.",
          "Generate or refresh the context index when convenient; do not treat it as required for ordinary work."
        ],
        freshness: state.code === EXIT_UNAVAILABLE ? "UNAVAILABLE" : "STALE",
        issues: state.issues,
        requestedScope: options.request || {},
      },
    };
  }
  return {
    code: EXIT_CURRENT,
    packet: {
      freshness: "CURRENT",
      indexMode: state.index.mode,
      workspaceId: state.index.workspaceId,
      ...routeContext(state.index, options.request || {}, { limit: options.limit }),
    },
  };
}

function liveRepositoryState(root) {
  const branch = String(runGit(root, ["branch", "--show-current"], { allowFailure: true }).stdout).trim() || "DETACHED";
  const head = String(runGit(root, ["rev-parse", "HEAD"], { allowFailure: true }).stdout).trim() || "UNBORN";
  const dirty = String(runGit(root, ["status", "--short", "--untracked-files=all"]).stdout)
    .split(/\r?\n/u)
    .filter(Boolean);
  return { branch, dirty, head };
}

function recoveryPacket(options = {}) {
  const state = currentIndexState(options);
  const root = state.root || repositoryRoot(options.root || process.cwd());
  const localConfig = loadLocalConfig(root, options);
  const recovery = localConfig?.config.recovery || {};
  const liveExecutionView = parseExecutionView(root, localConfig);
  const indexedExecutionView = state.index?.executionView || null;
  const executionChanged = JSON.stringify(liveExecutionView) !== JSON.stringify(indexedExecutionView);
  return {
    code: state.code,
    packet: {
      authority: "Recovery pointers are derived navigation only; inspect the live worktree before editing unfinished work.",
      executionView: liveExecutionView,
      freshness: state.code === EXIT_CURRENT ? "CURRENT" : (state.code === EXIT_STALE ? "STALE" : "UNAVAILABLE"),
      issues: state.issues,
      liveRepository: liveRepositoryState(root),
      pointers: recovery,
      priorIndexedExecutionView: executionChanged ? indexedExecutionView : null,
      warning: "This packet cannot restore conversation details or prove an unrecorded request was completed.",
    },
  };
}

function indexStatistics(index, serializedBytes = null) {
  const files = index.files || [];
  const sourceBytes = files.reduce((total, record) => total + record.source.bytes, 0);
  const serialized = compactJson(index);
  const indexBytes = serializedBytes ?? Buffer.byteLength(serialized);
  const indexCharacters = [...serialized].length;
  return {
    estimatedIndexTokensCharsDividedByFour: Math.ceil(indexCharacters / 4),
    fileRecords: files.length,
    headingRecords: files.reduce((total, record) => total + record.headings.length, 0),
    indexBytes,
    indexCharacters,
    indexToSourceRatio: sourceBytes === 0 ? 0 : Number((indexBytes / sourceBytes).toFixed(4)),
    reviewedSummaries: (index.reviewedSummaries || []).length,
    reviewedSummariesNeedingReview: (index.reviewedSummaries || []).filter(
      (summary) => summary.reviewState !== "CURRENT",
    ).length,
    sourceBytes,
    symbolRecords: files.reduce((total, record) => total + record.symbols.length, 0),
  };
}

function exactTextMetrics(text) {
  return {
    bytes: Buffer.byteLength(text),
    characters: [...text].length,
    estimatedTokensCharsDividedByFour: Math.ceil([...text].length / 4),
    lines: text.length === 0 ? 0 : text.split(/\r?\n/u).length,
    words: (text.match(/\S+/gu) || []).length,
  };
}

function baselineSearch(root, index, query, limit = 12) {
  const tokens = tokenize(query);
  const matches = [];
  for (const record of index.files || []) {
    const content = fs.readFileSync(safeSourceFile(root, record.source.path, "benchmark source"), "utf8");
    const lines = content.split(/\r?\n/u);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const lower = lines[lineIndex].toLowerCase();
      const matched = tokens.filter((token) => lower.includes(token));
      if (matched.length) {
        matches.push({
          line: lineIndex + 1,
          path: record.source.path,
          score: matched.length,
          text: lines[lineIndex].trim().slice(0, 240),
        });
      }
    }
  }
  return matches
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path) || left.line - right.line)
    .slice(0, limit)
    .map((entry) => `${entry.path}:${entry.line}:${entry.text}`)
    .join("\n");
}

function baselineCorrectionSearch(root, task, baselinePaths) {
  const tokens = tokenize(task.query);
  const lines = [];
  for (const sourcePath of task.requiredPaths.filter((entry) => !baselinePaths.has(entry))) {
    const absolute = resolveInside(root, sourcePath, "benchmark correction source");
    if (!fs.existsSync(absolute)) {
      continue;
    }
    safeSourceFile(root, sourcePath, "benchmark correction source");
    lines.push(`follow-up file search -> ${sourcePath}`);
    const contentLines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u);
    const witnesses = [];
    for (let index = 0; index < contentLines.length && witnesses.length < 2; index += 1) {
      const lower = contentLines[index].toLowerCase();
      if (tokens.some((token) => lower.includes(token))) {
        witnesses.push(`${sourcePath}:${index + 1}:${contentLines[index].trim().slice(0, 200)}`);
      }
    }
    lines.push(...witnesses);
  }
  return lines.join("\n");
}

function requiredReadingText(root, task) {
  const parts = [];
  for (const read of task.requiredReads || []) {
    const absolute = resolveInside(root, read.path, "benchmark required read");
    if (!fs.existsSync(absolute)) {
      continue;
    }
    safeSourceFile(root, read.path, "benchmark required read");
    const content = fs.readFileSync(absolute, "utf8");
    const section = read.heading ? extractMarkdownSection(content, read.heading) : content;
    if (section) {
      parts.push(section);
    }
  }
  return parts.join("\n");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function benchmarkIndex(options = {}) {
  const state = currentIndexState(options);
  if (state.code !== EXIT_CURRENT) {
    return { code: state.code, report: { issues: state.issues } };
  }
  const configInfo = readConfig(state.root, options.configPath || DEFAULT_CONFIG);
  const tasks = configInfo.config.benchmarks || [];
  const taskReports = [];
  for (const task of tasks) {
    const request = { query: task.query };
    const packet = routeContext(state.index, request);
    const indexedDiscovery = compactJson(packet);
    const baselineDiscovery = baselineSearch(state.root, state.index, task.query);
    const requiredReading = requiredReadingText(state.root, task);
    const indexedPaths = new Set([
      ...packet.mandatorySourcesToOpen.map((entry) => entry.path),
      ...packet.canonicalSourcesToOpen.map((entry) => entry.path),
      ...packet.optionalExpansion.map((entry) => entry.path),
      ...packet.matchedRoutes.flatMap((entry) => entry.implementationEntries || []),
      ...packet.matchedRoutes.flatMap((entry) => entry.tests || []),
    ]);
    const indexedIds = new Set(packet.criticalConstraints.map((entry) => entry.id));
    const baselinePaths = new Set(
      baselineDiscovery.split(/\r?\n/u).filter(Boolean).map((line) => line.split(":")[0]),
    );
    const baselineCorrection = baselineCorrectionSearch(state.root, task, baselinePaths);
    const correctedBaselinePaths = new Set([
      ...baselinePaths,
      ...baselineCorrection
        .split(/\r?\n/u)
        .filter((line) => line.startsWith("follow-up file search -> "))
        .map((line) => line.slice("follow-up file search -> ".length)),
    ]);
    taskReports.push({
      baselineCorrection: exactTextMetrics(baselineCorrection),
      baselineDiscovery: exactTextMetrics(baselineDiscovery),
      baselineRequiredPathHits: task.requiredPaths.filter((entry) => baselinePaths.has(entry)).length,
      baselineRequiredPathHitsAfterCorrection: task.requiredPaths.filter(
        (entry) => correctedBaselinePaths.has(entry),
      ).length,
      fixedRequiredReading: exactTextMetrics(requiredReading),
      id: task.id,
      indexedDiscovery: exactTextMetrics(indexedDiscovery),
      indexedRequiredContractHits: task.requiredRecordIds.filter((entry) => indexedIds.has(entry)).length,
      indexedRequiredPathHits: task.requiredPaths.filter((entry) => indexedPaths.has(entry)).length,
      requiredContractCount: task.requiredRecordIds.length,
      requiredPathCount: task.requiredPaths.length,
      totalBaselineWorkflow: exactTextMetrics(`${baselineDiscovery}\n${baselineCorrection}\n${requiredReading}`),
      totalIndexedWorkflow: exactTextMetrics(`${indexedDiscovery}\n${requiredReading}`),
    });
  }
  const checkTimings = [];
  const contextTimings = [];
  for (let run = 0; run < 5; run += 1) {
    let started = process.hrtime.bigint();
    currentIndexState(options);
    checkTimings.push(Number(process.hrtime.bigint() - started) / 1e6);
    started = process.hrtime.bigint();
    routeContext(state.index, { query: tasks[run % Math.max(tasks.length, 1)]?.query || "context" });
    contextTimings.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  return {
    code: EXIT_CURRENT,
    report: {
      method: {
        baseline: "bounded literal repository search, a minimum targeted follow-up for each missed expected owner, plus the same required original-source reads",
        caveat: "Character/4 values are estimates, not tokenizer-exact counts. Both workflows retain identical required original-source reading.",
        indexed: "bounded task packet plus the same required canonical sections",
      },
      overhead: {
        contextMedianMillisecondsFiveRuns: Number(median(contextTimings).toFixed(3)),
        freshnessCheckMedianMillisecondsFiveRuns: Number(median(checkTimings).toFixed(3)),
      },
      tasks: taskReports,
    },
  };
}

function parseCli(argv) {
  const positional = [];
  const options = {
    includePrivate: false,
    request: {},
  };
  function optionValue(option, ordinal) {
    const value = argv[ordinal + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new ContextToolError(`${option} requires a value`, EXIT_UNAVAILABLE);
    }
    return value;
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--include-private") {
      options.includePrivate = true;
    } else if (argument === "--root") {
      options.root = optionValue(argument, index);
      index += 1;
    } else if (argument === "--config") {
      options.configPath = optionValue(argument, index);
      index += 1;
    } else if (argument === "--local-config") {
      options.localConfigPath = optionValue(argument, index);
      index += 1;
    } else if (argument === "--limit") {
      const rawLimit = optionValue(argument, index);
      index += 1;
      options.limit = Number(rawLimit);
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_CONTEXT_RESULTS) {
        throw new ContextToolError(
          `--limit must be an integer from 1 through ${MAX_CONTEXT_RESULTS}`,
          EXIT_UNAVAILABLE,
        );
      }
    } else if (["--domain", "--file", "--symbol", "--contract", "--directive"].includes(argument)) {
      options.request[argument.slice(2)] = optionValue(argument, index);
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new ContextToolError(`Unknown option: ${argument}`, EXIT_UNAVAILABLE);
    } else {
      positional.push(argument);
    }
  }
  return {
    command: positional.shift() || "help",
    options: {
      ...options,
      request: {
        ...options.request,
        query: positional.join(" "),
      },
    },
  };
}

function usage() {
  return `TIDEWEFT repository context router

Usage:
  node scripts/repository-context.cjs generate [--include-private]
  node scripts/repository-context.cjs check [--include-private]
  node scripts/repository-context.cjs context <task words> [--domain NAME] [--file PATH] [--symbol NAME]
    [--contract ID] [--directive ID] [--limit 1..${MAX_CONTEXT_RESULTS}] [--include-private]
  node scripts/repository-context.cjs recover --include-private
  node scripts/repository-context.cjs stats [--include-private]
  node scripts/repository-context.cjs benchmark [--include-private]

The index is derived navigation. It never replaces current instructions,
canonical sources, implementation, tests, or execution authority.
`;
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseCli(argv);
  const { command, options } = parsed;
  if (command === "help" || command === "--help") {
    process.stdout.write(usage());
    return EXIT_CURRENT;
  }
  if (command === "generate") {
    const started = process.hrtime.bigint();
    const result = await generateIndex(options);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    process.stdout.write(stableJson({
      elapsedMilliseconds: Number(elapsed.toFixed(3)),
      files: result.index.files.length,
      mode: result.index.mode,
      output: path.relative(repositoryRoot(options.root || process.cwd()), result.outputFile),
      reviewedSummariesNeedingReview: result.index.reviewedSummaries.filter(
        (summary) => summary.reviewState !== "CURRENT",
      ).map((summary) => ({ id: summary.id, actualSourceFingerprint: summary.actualSourceFingerprint })),
      reusedRecords: result.reusedRecords,
      serializedBytes: result.serializedBytes,
      workspaceId: result.index.workspaceId,
    }));
    return result.index.reviewedSummaries.some((summary) => summary.reviewState !== "CURRENT")
      ? EXIT_STALE
      : EXIT_CURRENT;
  }
  if (command === "check") {
    const state = currentIndexState(options);
    process.stdout.write(stableJson({
      freshness: state.code === EXIT_CURRENT ? "CURRENT" : (state.code === EXIT_STALE ? "STALE" : "UNAVAILABLE"),
      issues: state.issues,
      output: state.outputFile ? path.relative(state.root, state.outputFile) : null,
    }));
    return state.code;
  }
  if (command === "context") {
    const result = contextPacket(options);
    process.stdout.write(compactJson(result.packet));
    return result.code;
  }
  if (command === "recover") {
    if (!options.includePrivate) {
      throw new ContextToolError("Recovery requires explicit --include-private", EXIT_UNAVAILABLE);
    }
    const result = recoveryPacket(options);
    process.stdout.write(stableJson(result.packet));
    return result.code;
  }
  if (command === "stats") {
    const state = currentIndexState(options);
    if (state.code !== EXIT_CURRENT) {
      process.stdout.write(stableJson({ issues: state.issues }));
      return state.code;
    }
    process.stdout.write(stableJson(indexStatistics(state.index)));
    return EXIT_CURRENT;
  }
  if (command === "benchmark") {
    const result = benchmarkIndex(options);
    process.stdout.write(stableJson(result.report));
    return result.code;
  }
  throw new ContextToolError(`Unknown command: ${command}`, EXIT_UNAVAILABLE);
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      const code = error instanceof ContextToolError ? error.exitCode : EXIT_STALE;
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = code;
    },
  );
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_LOCAL_CONFIG,
  EXIT_CURRENT,
  EXIT_STALE,
  EXIT_UNAVAILABLE,
  INDEX_FORMAT_VERSION,
  ContextToolError,
  atomicWrite,
  benchmarkIndex,
  compactJson,
  contextPacket,
  createReviewedSummaries,
  currentIndexState,
  exactTextMetrics,
  extractMarkdownHeadings,
  extractMarkdownSection,
  generateIndex,
  indexStatistics,
  listPublicSources,
  loadLocalConfig,
  main,
  normalizeRepoPath,
  outputPathFor,
  parseCli,
  recoveryPacket,
  repositoryRoot,
  routeContext,
  sha256,
  stableJson,
  workspaceIdentity,
};
