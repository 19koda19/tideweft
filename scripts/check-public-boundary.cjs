#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

const PRIVATE_EXACT_PATHS = new Set([
  "plan.md",
  "progress.md",
  "docs/feature_registry.json",
  "docs/living_hazards_design.md",
]);

const PRIVATE_DIRECTORY_PREFIXES = [
  ".agents/",
  ".codex/",
  ".private/",
  "docs/directives/",
  "docs/private/",
];

function normalizeRepositoryPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function privatePathReason(filePath) {
  const normalized = normalizeRepositoryPath(filePath);
  const basename = path.posix.basename(normalized);
  const foldedPath = normalized.toLocaleLowerCase("en-US");
  const foldedBasename = basename.toLocaleLowerCase("en-US");

  if (foldedBasename === "agents.md") return "agent instruction file";
  if (PRIVATE_EXACT_PATHS.has(foldedPath)) return "private planning file";
  if (PRIVATE_DIRECTORY_PREFIXES.some((prefix) => foldedPath.startsWith(prefix))) {
    return "private operator/planning directory";
  }
  if (/roadmap/iu.test(basename)) return "roadmap file";
  if (/^(?:execution[_ -]?order|directive).*/iu.test(basename)) return "directive file";
  if (/^(?:plan|progress)(?:[._ -]|$)/iu.test(basename)) return "planning/progress file";
  if (/_(?:private|internal)\.md$/iu.test(basename)) return "private/internal document";
  return null;
}

function repositoryPaths() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  return output.split("\0").filter(Boolean).map(normalizeRepositoryPath);
}

function runSelfTest() {
  const expectedPrivate = [
    "AGENTS.md",
    "tools/agents.MD",
    "TOOLS/AGENTS.md",
    "PLAN.md",
    "PROGRESS.md",
    "docs/MASTER_EXECUTION_ROADMAP.md",
    "docs/directives/02_UNBROKEN_WORLD.md",
    "docs/private/codebook.json",
    "DOCS/PRIVATE/codebook.json",
    "docs/FEATURE_REGISTRY.json",
    "docs/LIVING_HAZARDS_DESIGN.md",
    ".codex/settings.json",
    "SYSTEM_INTERNAL.md",
  ];
  const expectedPublic = [
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/GAME_DESIGN.md",
    "docs/CRAFTING_DESIGN.md",
    "docs/RESEARCH.md",
    "src/game/planRoute.ts",
    "src/game/progressMeter.ts",
  ];

  const failures = [];
  for (const candidate of expectedPrivate) {
    if (!privatePathReason(candidate)) failures.push(`expected private: ${candidate}`);
  }
  for (const candidate of expectedPublic) {
    if (privatePathReason(candidate)) failures.push(`expected public: ${candidate}`);
  }
  if (failures.length > 0) {
    console.error(`Public-boundary self-test failed (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Public-boundary self-tests passed (${expectedPrivate.length + expectedPublic.length}).`);
}

function runRepositoryCheck() {
  const findings = [];
  for (const candidate of repositoryPaths()) {
    const reason = privatePathReason(candidate);
    if (reason) findings.push({ candidate, reason });
  }
  if (findings.length > 0) {
    console.error(`Public-boundary check failed (${findings.length}):`);
    for (const finding of findings) console.error(`- ${finding.candidate}: ${finding.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log("Public-boundary check passed: no private operator or planning paths are publishable.");
}

if (process.argv.includes("--self-test")) runSelfTest();
else runRepositoryCheck();
