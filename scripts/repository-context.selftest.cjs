#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  ContextToolError,
  EXIT_CURRENT,
  EXIT_STALE,
  EXIT_UNAVAILABLE,
  atomicWrite,
  contextPacket,
  currentIndexState,
  generateIndex,
  outputPathFor,
  parseCli,
  recoveryPacket,
  routeContext,
  sha256,
  stableJson,
  workspaceIdentity,
} = require("./repository-context.cjs");

const CONFIG_PATH = "scripts/repository-context.config.json";
const LOCAL_CONFIG_PATH = ".context-local.json";
const OUTPUT_DIRECTORY = ".context-output";
const PRIVATE_SENTINEL = "SYNTHETIC-LOCAL-SENTINEL-7E91";

const architectureSource = `# Architecture

## Voice Contract

A committed physical cause creates one acoustic event. Lawful hearing remains
authoritative when optional presentation is suppressed. Hidden receipt never
reveals the exact source.

## Save Contract

Current state round-trips without duplication.
`;

const voiceSource = `import { bounded } from "./helper";

export interface VoiceReceipt {
  readonly heard: boolean;
}

export const VOICE_LIMIT = 4;

export function speak(value: string): string {
  return bounded(value, VOICE_LIMIT);
}

export class VoiceBus {
  emit(value: string): string {
    return speak(value);
  }
}
`;

const voiceTestSource = `import { speak } from "./voice";

export function fixture(): string {
  return speak("calling");
}
`;

const tests = [];

function test(name, body) {
  tests.push({ body, name });
}

function run(command, args, cwd, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!allowFailure) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return result;
}

function fileFingerprint(file) {
  const stat = fs.statSync(file);
  return {
    mode: stat.mode & 0o777,
    sha256: sha256(fs.readFileSync(file)),
  };
}

function trackedFingerprints(root) {
  const paths = run("git", ["ls-files", "-z"], root).stdout
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  return Object.fromEntries(paths.map((repoPath) => [
    repoPath,
    fileFingerprint(path.join(root, repoPath)),
  ]));
}

function write(root, repoPath, content) {
  const destination = path.join(root, repoPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, "utf8");
}

function writeJson(root, repoPath, value) {
  write(root, repoPath, stableJson(value));
}

function fixtureConfig() {
  return {
    schemaVersion: 1,
    toolVersion: "selftest-1",
    outputDirectory: OUTPUT_DIRECTORY,
    eligibleRoots: ["docs/", "scripts/", "src/"],
    eligibleFiles: [".gitignore", "package.json", "tsconfig.json"],
    eligibleExtensions: [".cjs", ".json", ".md", ".ts"],
    excludedPrefixes: [`${OUTPUT_DIRECTORY}/`, "local-sensitive/"],
    mandatoryPublicReferences: [
      {
        path: "docs/REPOSITORY_CONTEXT.md",
        reason: "synthetic navigation workflow",
      },
    ],
    domainRoutes: [
      {
        id: "voice-acoustics",
        aliases: ["acoustic", "caption", "hearing", "marsh fox", "voice"],
        purpose: "Find the synthetic voice contract, implementation, and tests.",
        canonicalSources: [
          { path: "docs/ARCHITECTURE.md", locator: "Voice Contract" },
        ],
        implementationEntries: ["src/game/voice.ts"],
        tests: ["src/game/voice.test.ts"],
        validationCommands: ["npm run test:voice", "npm run typecheck"],
        relatedContracts: ["voice-contract"],
      },
    ],
    reviewedSummaries: [
      {
        id: "voice-contract",
        kind: "reviewed-contract-summary",
        declaredStatus: "PARTIAL",
        source: {
          path: "docs/ARCHITECTURE.md",
          locatorType: "heading",
          locator: "Voice Contract",
        },
        reviewedSourceFingerprint: sha256(architectureSource),
        purpose: "Carry a committed sound through lawful hearing and bounded presentation.",
        preconditions: ["A physical source committed the sound."],
        inputs: ["source", "semantic sound"],
        outputs: ["hearing receipt", "optional caption"],
        invariants: ["Hidden receipt does not reveal source identity."],
        prohibitions: ["Presentation cannot author world truth."],
        exceptions: ["Some lawful sounds remain audio-only."],
        owner: "docs/ARCHITECTURE.md#voice-contract",
        evidence: ["src/game/voice.test.ts"],
        relatedContracts: [],
      },
    ],
    benchmarks: [],
  };
}

function localConfig() {
  return {
    schemaVersion: 1,
    additionalSources: [
      {
        path: "local-sensitive/INSTRUCTIONS.md",
        mandatory: true,
        reason: "synthetic local instruction source",
      },
      {
        path: "local-sensitive/RECOVERY.md",
        mandatory: false,
        reason: "synthetic recovery source",
      },
    ],
    executionView: {
      source: "local-sensitive/execution.md",
      activePattern: "^ACTIVE: ([A-Za-z0-9_.-]+)$",
      activePathTemplate: "local-sensitive/directives/{active}.md",
    },
    recovery: {
      nextActionSource: "local-sensitive/RECOVERY.md",
    },
  };
}

function createFixture(label, { withLocal = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `tideweft-context-${label}-`));
  const git = (...args) => run("git", args, root).stdout.trim();

  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "context-selftest@test.invalid");
  git("config", "user.name", "TIDEWEFT Context Self-test");

  write(root, ".gitignore", [
    `/${OUTPUT_DIRECTORY}/`,
    `/${LOCAL_CONFIG_PATH}`,
    "/local-sensitive/",
    "",
  ].join("\n"));
  writeJson(root, "package.json", {
    name: "context-selftest-fixture",
    private: true,
    type: "module",
    scripts: { typecheck: "tsc --noEmit" },
  });
  writeJson(root, "tsconfig.json", {
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      module: "ESNext",
      moduleResolution: "Bundler",
      noEmit: true,
      strict: true,
      target: "ES2022",
    },
    include: ["src/**/*.ts"],
  });
  writeJson(root, CONFIG_PATH, fixtureConfig());
  write(root, "docs/ARCHITECTURE.md", architectureSource);
  write(root, "docs/REPOSITORY_CONTEXT.md", "# Repository Context\n\nDerived navigation only.\n");
  write(root, "docs/OTHER.md", "# Water Notes\n\nUnrelated current and river notes.\n");
  write(root, "src/game/helper.ts", [
    "export function bounded(value: string, limit: number): string {",
    "  return value.slice(0, limit);",
    "}",
    "",
  ].join("\n"));
  write(root, "src/game/voice.ts", voiceSource);
  write(root, "src/game/voice.test.ts", voiceTestSource);
  write(root, "src/game/resident.ts", "import { speak } from \"./voice\";\n\nexport const residentCall = speak(\"hello\");\n");
  write(root, "src/game/water.ts", "export const waterDepth = 2;\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "fixture base");

  const setupLocal = () => {
    writeJson(root, LOCAL_CONFIG_PATH, localConfig());
    write(
      root,
      "local-sensitive/INSTRUCTIONS.md",
      `# ${PRIVATE_SENTINEL}\n\nSynthetic local instructions.\n`,
    );
    write(root, "local-sensitive/RECOVERY.md", "# Recovery\n\nResume the synthetic voice task.\n");
    write(root, "local-sensitive/execution.md", "ACTIVE: VOICE\n");
    write(root, "local-sensitive/directives/VOICE.md", "# Voice\n\nCurrent synthetic work.\n");
    write(root, "local-sensitive/directives/NEXT.md", "# Next\n\nLater synthetic work.\n");
  };
  if (withLocal) {
    setupLocal();
  }

  return {
    git,
    root,
    setupLocal,
    destroy() {
      fs.rmSync(root, { force: true, recursive: true });
    },
  };
}

function publicOptions(fixture) {
  return { configPath: CONFIG_PATH, root: fixture.root };
}

function localOptions(fixture) {
  return {
    configPath: CONFIG_PATH,
    includePrivate: true,
    localConfigPath: LOCAL_CONFIG_PATH,
    root: fixture.root,
  };
}

test("TypeScript extraction records exported symbols, imports, and conservative test links", async () => {
  const fixture = createFixture("typescript-shape");
  try {
    const { index } = await generateIndex(publicOptions(fixture));
    const voice = index.files.find(({ source }) => source.path === "src/game/voice.ts");
    assert.ok(voice);
    assert.equal(voice.parseIssue, null);
    assert.ok(voice.symbols.some(({ exported, kind, name }) => (
      exported && kind === "InterfaceDeclaration" && name === "VoiceReceipt"
    )));
    assert.ok(voice.symbols.some(({ exported, kind, name }) => (
      exported && kind === "VariableDeclaration" && name === "VOICE_LIMIT"
    )), JSON.stringify(voice.symbols));
    assert.ok(voice.symbols.some(({ exported, kind, name }) => (
      exported && kind === "FunctionDeclaration" && name === "speak"
    )));
    assert.ok(voice.symbols.some(({ exported, kind, name }) => (
      exported && kind === "ClassDeclaration" && name === "VoiceBus"
    )));
    assert.deepEqual(
      voice.directImports.map(({ resolvedPath, specifier }) => ({ resolvedPath, specifier })),
      [{ resolvedPath: "src/game/helper.ts", specifier: "./helper" }],
    );
    assert.ok(voice.associatedTests.some(({ coverageProven, path: testPath }) => (
      testPath === "src/game/voice.test.ts" && coverageProven === false
    )));
    assert.ok(index.typescriptVersion);
    assert.match(index.toolFingerprint, /^[a-f0-9]{64}$/u);
  } finally {
    fixture.destroy();
  }
});

test("a dirty source edit becomes stale while HEAD remains unchanged", async () => {
  const fixture = createFixture("dirty-source");
  try {
    await generateIndex(publicOptions(fixture));
    const head = fixture.git("rev-parse", "HEAD");
    write(fixture.root, "src/game/voice.ts", `${voiceSource}\nexport const changed = true;\n`);
    assert.equal(fixture.git("rev-parse", "HEAD"), head);
    const state = currentIndexState(publicOptions(fixture));
    assert.equal(state.code, EXIT_STALE);
    assert.ok(state.issues.includes("Source changed: src/game/voice.ts"));
  } finally {
    fixture.destroy();
  }
});

test("new, renamed, and deleted eligible files invalidate source membership", async () => {
  const addition = createFixture("new-source");
  try {
    await generateIndex(publicOptions(addition));
    write(addition.root, "src/game/newVoice.ts", "export const newVoice = true;\n");
    const state = currentIndexState(publicOptions(addition));
    assert.equal(state.code, EXIT_STALE);
    assert.ok(state.issues.includes("New eligible source: src/game/newVoice.ts"));
  } finally {
    addition.destroy();
  }

  const rename = createFixture("renamed-source");
  try {
    await generateIndex(publicOptions(rename));
    fs.renameSync(
      path.join(rename.root, "src/game/water.ts"),
      path.join(rename.root, "src/game/river.ts"),
    );
    const state = currentIndexState(publicOptions(rename));
    assert.equal(state.code, EXIT_STALE);
    assert.ok(state.issues.includes("Indexed source renamed, deleted, or no longer eligible: src/game/water.ts"));
    assert.ok(state.issues.includes("New eligible source: src/game/river.ts"));
  } finally {
    rename.destroy();
  }

  const deletion = createFixture("deleted-source");
  try {
    await generateIndex(publicOptions(deletion));
    fs.unlinkSync(path.join(deletion.root, "src/game/water.ts"));
    const state = currentIndexState(publicOptions(deletion));
    assert.equal(state.code, EXIT_STALE);
    assert.ok(state.issues.includes("Indexed source renamed, deleted, or no longer eligible: src/game/water.ts"));
  } finally {
    deletion.destroy();
  }
});

test("execution status is worktree-current and reroutes only after regeneration", async () => {
  const fixture = createFixture("execution-view", { withLocal: true });
  try {
    const options = localOptions(fixture);
    const first = await generateIndex(options);
    const head = fixture.git("rev-parse", "HEAD");
    assert.equal(first.index.executionView.activeDirective, "VOICE");
    assert.equal(first.index.executionView.activeDirectivePath, "local-sensitive/directives/VOICE.md");
    write(fixture.root, "local-sensitive/execution.md", "ACTIVE: NEXT\n");
    assert.equal(fixture.git("rev-parse", "HEAD"), head);
    const stale = currentIndexState(options);
    assert.equal(stale.code, EXIT_STALE);
    assert.ok(stale.issues.some((issue) => issue.includes("local-sensitive/directives/VOICE.md")));
    assert.ok(stale.issues.some((issue) => issue.includes("local-sensitive/directives/NEXT.md")));
    const next = await generateIndex(options);
    assert.equal(next.index.executionView.activeDirective, "NEXT");
    assert.equal(next.index.executionView.activeDirectivePath, "local-sensitive/directives/NEXT.md");
  } finally {
    fixture.destroy();
  }
});

test("a changed canonical source leaves its reviewed summary explicitly stale", async () => {
  const fixture = createFixture("review-stale");
  try {
    const initial = await generateIndex(publicOptions(fixture));
    assert.equal(initial.index.reviewedSummaries[0].reviewState, "CURRENT");
    const reviewedFingerprint = initial.index.reviewedSummaries[0].reviewedSourceFingerprint;
    write(
      fixture.root,
      "docs/ARCHITECTURE.md",
      architectureSource.replace("optional presentation", "optional shared presentation"),
    );
    const refreshed = await generateIndex(publicOptions(fixture));
    const summary = refreshed.index.reviewedSummaries[0];
    assert.equal(summary.reviewedSourceFingerprint, reviewedFingerprint);
    assert.notEqual(summary.actualSourceFingerprint, reviewedFingerprint);
    assert.equal(summary.reviewState, "REVIEW_REQUIRED");
    assert.match(summary.verificationIssue, /source changed/u);
    assert.equal(currentIndexState(publicOptions(fixture)).code, EXIT_STALE);
  } finally {
    fixture.destroy();
  }
});

test("identical inputs produce byte-identical generated indexes", async () => {
  const fixture = createFixture("deterministic");
  try {
    const first = await generateIndex(publicOptions(fixture));
    const firstBytes = fs.readFileSync(first.outputFile);
    const second = await generateIndex(publicOptions(fixture));
    const secondBytes = fs.readFileSync(second.outputFile);
    assert.deepEqual(secondBytes, firstBytes);
    assert.equal(second.index.typescriptVersion, first.index.typescriptVersion);
    assert.equal(second.reusedRecords, second.index.files.length);
  } finally {
    fixture.destroy();
  }
});

test("generation leaves authored sources untouched and writes only ignored output", async () => {
  const fixture = createFixture("source-immutability");
  try {
    const before = trackedFingerprints(fixture.root);
    const result = await generateIndex(publicOptions(fixture));
    assert.deepEqual(trackedFingerprints(fixture.root), before);
    assert.equal(fixture.git("status", "--short", "--untracked-files=all"), "");
    const relativeOutput = path.relative(fs.realpathSync(fixture.root), result.outputFile);
    assert.equal(relativeOutput.startsWith(`${OUTPUT_DIRECTORY}${path.sep}`), true);
    assert.equal(fs.existsSync(result.outputFile), true);
  } finally {
    fixture.destroy();
  }
});

test("real worktrees sharing one HEAD retain distinct indexes and freshness", async () => {
  const fixture = createFixture("worktree-primary");
  const siblingParent = fs.mkdtempSync(path.join(os.tmpdir(), "tideweft-context-worktree-sibling-"));
  const sibling = path.join(siblingParent, "tree");
  try {
    const primary = await generateIndex(publicOptions(fixture));
    fixture.git("worktree", "add", "--quiet", "--detach", sibling, "HEAD");
    const siblingResult = await generateIndex({ configPath: CONFIG_PATH, root: sibling });
    assert.notEqual(primary.index.workspaceId, siblingResult.index.workspaceId);
    assert.notEqual(primary.outputFile, siblingResult.outputFile);
    assert.equal(primary.index.workspaceId, workspaceIdentity(fixture.root));
    assert.equal(siblingResult.index.workspaceId, workspaceIdentity(sibling));

    write(sibling, "src/game/voice.ts", `${voiceSource}\nexport const siblingOnly = true;\n`);
    assert.equal(currentIndexState(publicOptions(fixture)).code, EXIT_CURRENT);
    assert.equal(
      currentIndexState({ configPath: CONFIG_PATH, root: sibling }).code,
      EXIT_STALE,
    );
  } finally {
    run("git", ["worktree", "remove", "--force", sibling], fixture.root, { allowFailure: true });
    fs.rmSync(siblingParent, { force: true, recursive: true });
    fixture.destroy();
  }
});

test("a missing index returns bounded fallback guidance without writing", async () => {
  const fixture = createFixture("missing-index");
  try {
    const options = { ...publicOptions(fixture), request: { query: "voice hearing" } };
    const expectedOutput = outputPathFor(
      fixture.root,
      fixtureConfig(),
      "public",
      workspaceIdentity(fixture.root),
    );
    const packet = contextPacket(options);
    assert.equal(packet.code, EXIT_UNAVAILABLE);
    assert.equal(packet.packet.freshness, "UNAVAILABLE");
    assert.ok(packet.packet.issues.some((entry) => entry.includes("ordinary repository inspection")));
    assert.ok(packet.packet.fallback.some((entry) => entry.includes("targeted repository search")));
    assert.equal(fs.existsSync(expectedOutput), false);
    assert.equal(fs.existsSync(path.join(fixture.root, OUTPUT_DIRECTORY)), false);
  } finally {
    fixture.destroy();
  }
});

test("public output excludes ignored local data while explicit local output inherits it", async () => {
  const fixture = createFixture("privacy", { withLocal: true });
  try {
    const publicResult = await generateIndex(publicOptions(fixture));
    const publicText = fs.readFileSync(publicResult.outputFile, "utf8");
    assert.equal(publicResult.index.mode, "public");
    assert.equal(publicText.includes(PRIVATE_SENTINEL), false);
    assert.equal(publicText.includes("local-sensitive/"), false);

    const localResult = await generateIndex(localOptions(fixture));
    const localText = fs.readFileSync(localResult.outputFile, "utf8");
    assert.equal(localResult.index.mode, "local-private");
    assert.equal(localText.includes(PRIVATE_SENTINEL), true);
    assert.ok(localResult.index.files.some(({ privacy, source }) => (
      privacy === "private" && source.path === "local-sensitive/INSTRUCTIONS.md"
    )));
    assert.notEqual(localResult.outputFile, publicResult.outputFile);
    assert.equal(fixture.git("status", "--short", "--untracked-files=all"), "");
  } finally {
    fixture.destroy();
  }
});

test("a public-only checkout generates, checks, and routes without local configuration", async () => {
  const fixture = createFixture("public-only");
  try {
    const options = publicOptions(fixture);
    const generated = await generateIndex(options);
    assert.equal(generated.index.mode, "public");
    assert.equal(currentIndexState(options).code, EXIT_CURRENT);
    const packet = contextPacket({ ...options, request: { query: "voice acoustic hearing" } });
    assert.equal(packet.code, EXIT_CURRENT);
    assert.equal(packet.packet.indexMode, "public");
  } finally {
    fixture.destroy();
  }
});

test("task routing returns relevant owners, implementation, tests, and constraints", async () => {
  const fixture = createFixture("routing");
  try {
    const { index } = await generateIndex(publicOptions(fixture));
    const packet = routeContext(index, { query: "marsh fox voice acoustic hearing caption" }, { limit: 8 });
    assert.ok(packet.matchedRoutes.some(({ id }) => id === "voice-acoustics"));
    assert.ok(packet.canonicalSourcesToOpen.some(({ path: sourcePath }) => (
      sourcePath === "docs/ARCHITECTURE.md"
    )));
    const route = packet.matchedRoutes.find(({ id }) => id === "voice-acoustics");
    assert.ok(route.implementationEntries.includes("src/game/voice.ts"));
    assert.ok(route.tests.includes("src/game/voice.test.ts"));
    assert.ok(route.relatedContracts.includes("voice-contract"));
    assert.ok(route.validationCommands.includes("npm run test:voice"));
    assert.ok(route.mechanicalLinks.dependencies.includes("src/game/helper.ts"));
    assert.ok(route.mechanicalLinks.affectedConsumers.includes("src/game/resident.ts"));
    assert.match(route.mechanicalLinks.basis, /incomplete/u);
    assert.ok(packet.criticalConstraints.some(({ id, reviewState }) => (
      id === "voice-contract" && reviewState === "CURRENT"
    )));
    assert.ok(packet.criticalConstraints.some(({ invariants }) => (
      invariants.includes("Hidden receipt does not reveal source identity.")
    )));
    assert.equal(packet.optionalExpansion.some(({ path: sourcePath }) => sourcePath === "src/game/water.ts"), false);
    assert.ok(packet.mandatorySourcesToOpen.some(({ path: sourcePath }) => (
      sourcePath === "docs/REPOSITORY_CONTEXT.md"
    )));
    assert.ok(packet.optionalExpansion.length <= 8);
  } finally {
    fixture.destroy();
  }
});

test("an exact contract request returns its constraint and owning route", async () => {
  const fixture = createFixture("exact-contract");
  try {
    const { index } = await generateIndex(publicOptions(fixture));
    const packet = routeContext(index, { contract: "voice-contract" });
    assert.ok(packet.criticalConstraints.some(({ id }) => id === "voice-contract"));
    assert.ok(packet.matchedRoutes.some(({ id }) => id === "voice-acoustics"));
    assert.ok(packet.canonicalSourcesToOpen.some(({ path: sourcePath }) => (
      sourcePath === "docs/ARCHITECTURE.md"
    )));
  } finally {
    fixture.destroy();
  }
});

test("recovery reports live execution state even when the stored index is stale", async () => {
  const fixture = createFixture("live-recovery", { withLocal: true });
  try {
    const options = localOptions(fixture);
    await generateIndex(options);
    write(fixture.root, "local-sensitive/execution.md", "ACTIVE: NEXT\n");
    const recovery = recoveryPacket(options);
    assert.equal(recovery.code, EXIT_STALE);
    assert.equal(recovery.packet.executionView.activeDirective, "NEXT");
    assert.equal(recovery.packet.priorIndexedExecutionView.activeDirective, "VOICE");
  } finally {
    fixture.destroy();
  }
});

test("unknown requests remain explicitly uncertain rather than proving absence", async () => {
  const fixture = createFixture("uncertainty");
  try {
    const { index } = await generateIndex(publicOptions(fixture));
    const packet = routeContext(index, { query: "quasar loom causality" }, { limit: 4 });
    assert.equal(packet.matchedRoutes.length, 0);
    assert.equal(packet.optionalExpansion.length, 0);
    assert.ok(packet.uncertainty.some((entry) => entry.includes("does not prove")));
    assert.ok(packet.uncertainty.some((entry) => entry.includes("incomplete")));
  } finally {
    fixture.destroy();
  }
});

test("a source mutation during generation preserves the prior complete index", async () => {
  const fixture = createFixture("mixed-snapshot");
  try {
    const options = publicOptions(fixture);
    const initial = await generateIndex(options);
    const before = fs.readFileSync(initial.outputFile);
    await assert.rejects(
      generateIndex({
        ...options,
        afterInitialSnapshot() {
          write(fixture.root, "src/game/voice.ts", `${voiceSource}\nexport const raced = true;\n`);
        },
      }),
      (error) => error instanceof ContextToolError && /changed during generation/u.test(error.message),
    );
    assert.deepEqual(fs.readFileSync(initial.outputFile), before);
    assert.equal(currentIndexState(options).code, EXIT_STALE);
  } finally {
    fixture.destroy();
  }
});

test("a local configuration mutation during generation preserves the prior index", async () => {
  const fixture = createFixture("mixed-local-config", { withLocal: true });
  try {
    const options = localOptions(fixture);
    const initial = await generateIndex(options);
    const before = fs.readFileSync(initial.outputFile);
    await assert.rejects(
      generateIndex({
        ...options,
        afterInitialSnapshot() {
          const changed = localConfig();
          changed.recovery.additionalPointer = "local-sensitive/INSTRUCTIONS.md";
          writeJson(fixture.root, LOCAL_CONFIG_PATH, changed);
        },
      }),
      (error) => error instanceof ContextToolError && /configuration changed during generation/u.test(error.message),
    );
    assert.deepEqual(fs.readFileSync(initial.outputFile), before);
    assert.equal(currentIndexState(options).code, EXIT_STALE);
  } finally {
    fixture.destroy();
  }
});

test("a parser-version mismatch invalidates reuse and freshness", async () => {
  const fixture = createFixture("parser-version");
  try {
    const options = publicOptions(fixture);
    const initial = await generateIndex(options);
    const altered = JSON.parse(fs.readFileSync(initial.outputFile, "utf8"));
    altered.typescriptVersion = "0.0.0-synthetic";
    fs.writeFileSync(initial.outputFile, `${JSON.stringify(altered)}\n`, "utf8");
    const stale = currentIndexState(options);
    assert.equal(stale.code, EXIT_STALE);
    assert.ok(stale.issues.includes("TypeScript parser version changed"));
    const regenerated = await generateIndex(options);
    assert.equal(regenerated.reusedRecords, 0);
  } finally {
    fixture.destroy();
  }
});

test("tracked source symlinks cannot escape the worktree", async () => {
  const fixture = createFixture("source-symlink");
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "tideweft-context-external-"));
  try {
    const sentinel = "EXTERNAL-SOURCE-MUST-NOT-BE-INDEXED";
    const target = path.join(external, "secret.md");
    fs.writeFileSync(target, sentinel, "utf8");
    fs.symlinkSync(target, path.join(fixture.root, "docs/LEAK.md"));
    fixture.git("add", "docs/LEAK.md");
    await assert.rejects(
      generateIndex(publicOptions(fixture)),
      (error) => error instanceof ContextToolError && /symbolic link/u.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(fixture.root, OUTPUT_DIRECTORY)), false);
  } finally {
    fs.rmSync(external, { force: true, recursive: true });
    fixture.destroy();
  }
});

test("output-directory symlinks cannot redirect generated data into authored paths", async () => {
  const fixture = createFixture("output-symlink");
  try {
    fs.symlinkSync(path.join(fixture.root, "docs"), path.join(fixture.root, OUTPUT_DIRECTORY), "dir");
    await assert.rejects(
      generateIndex(publicOptions(fixture)),
      (error) => error instanceof ContextToolError && /output directory contains a symbolic link/u.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(fixture.root, "docs", "repository-context")), false);
  } finally {
    fixture.destroy();
  }
});

test("generation rejects a nonignored output location before writing", async () => {
  const fixture = createFixture("nonignored-output");
  try {
    const unsafe = fixtureConfig();
    unsafe.outputDirectory = "docs/generated-context";
    writeJson(fixture.root, "scripts/nonignored-context.json", unsafe);
    await assert.rejects(
      generateIndex({ configPath: "scripts/nonignored-context.json", root: fixture.root }),
      (error) => error instanceof ContextToolError && /must be Git-ignored/u.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(fixture.root, "docs/generated-context")), false);
  } finally {
    fixture.destroy();
  }
});

test("CLI option values and result limits fail closed", () => {
  assert.throws(
    () => parseCli(["context", "voice", "--limit", "NaN"]),
    (error) => error instanceof ContextToolError && /integer from 1 through 25/u.test(error.message),
  );
  assert.throws(
    () => parseCli(["context", "--contract"]),
    (error) => error instanceof ContextToolError && /requires a value/u.test(error.message),
  );
});

test("unsafe paths fail closed and atomic-write failure leaves no temporary artifact", async () => {
  const fixture = createFixture("path-safety");
  try {
    const unsafe = fixtureConfig();
    unsafe.outputDirectory = "../outside";
    writeJson(fixture.root, "scripts/unsafe-context.json", unsafe);
    await assert.rejects(
      generateIndex({ configPath: "scripts/unsafe-context.json", root: fixture.root }),
      (error) => error instanceof ContextToolError && /escapes the repository/u.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(path.dirname(fixture.root), "outside")), false);

    const targetDirectory = path.join(fixture.root, OUTPUT_DIRECTORY, "atomic-target");
    fs.mkdirSync(targetDirectory, { recursive: true });
    const parent = path.dirname(targetDirectory);
    assert.throws(() => atomicWrite(fixture.root, targetDirectory, "must not replace a directory\n"));
    assert.equal(fs.statSync(targetDirectory).isDirectory(), true);
    assert.deepEqual(
      fs.readdirSync(parent).filter((entry) => entry.includes(".atomic-target.") && entry.endsWith(".tmp")),
      [],
    );
  } finally {
    fixture.destroy();
  }
});

async function main() {
  let failures = 0;
  for (const { body, name } of tests) {
    try {
      await body();
      process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`not ok - ${name}\n${error.stack || error.message}\n`);
    }
  }
  process.stdout.write(`1..${tests.length}\n`);
  if (failures > 0) {
    process.stderr.write(`${failures} repository-context self-test(s) failed.\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
