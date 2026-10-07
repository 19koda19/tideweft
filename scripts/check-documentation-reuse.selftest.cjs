#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  classifyDocumentationDelta,
  decideDocumentationReuse,
  parseRawDiffZ,
  readDocumentationDelta,
  determineScope,
} = require("./check-documentation-reuse.cjs");

const root = path.resolve(__dirname, "..");
const baseSha = "1".repeat(40);
const headSha = "2".repeat(40);
const repository = "example/tideweft";
const documentationPaths = [
  "README.md",
  "CHANGELOG.md",
  "docs/ARCHITECTURE.md",
  "docs/GAME_DESIGN.md",
  "docs/RESEARCH.md",
  "docs/SYSTEM_INHERITANCE.md",
  "docs/SYSTEM_COMPOSITION.md",
  "docs/CRAFTING_DESIGN.md",
  "docs/REPOSITORY_CONTEXT.md",
];

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

function change(overrides = {}) {
  return { status: "M", path: "README.md", beforeMode: "100644", afterMode: "100644", ...overrides };
}

function baseline(overrides = {}) {
  return {
    id: 1234,
    head_sha: baseSha,
    head_branch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
    path: ".github/workflows/ci.yml",
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    eventName: "push",
    branch: "main",
    ref: "refs/heads/main",
    baseSha,
    headSha,
    repository,
    changes: [change()],
    runs: [baseline()],
    ...overrides,
  };
}

function assertReason(result) {
  assert.equal(typeof result.reason, "string");
  assert.ok(result.reason.trim().length > 0, "decisions must explain their evidence or fallback");
}

function rejected(value) {
  const result = decideDocumentationReuse(value);
  assert.equal(result.reuse, false);
  assertReason(result);
}

test("all and only the declared documentation owners qualify as regular-file edits", () => {
  for (const sourcePath of documentationPaths) {
    const result = classifyDocumentationDelta([change({ path: sourcePath })]);
    assert.equal(result.eligible, true, sourcePath);
    assertReason(result);
  }
  assert.equal(classifyDocumentationDelta(documentationPaths.map((sourcePath) => (
    change({ path: sourcePath })
  ))).eligible, true);
});

test("additions, deletions, renames, copies and type changes cannot reuse validation", () => {
  for (const status of ["A", "D", "R", "R100", "C", "C100", "T", "U", "?", "m", ""]) {
    const result = classifyDocumentationDelta([change({ status })]);
    assert.equal(result.eligible, false, status);
    assertReason(result);
    rejected(input({ changes: [change({ status })] }));
  }
});

test("executable modes, symlinks and unknown modes fail closed on either side", () => {
  for (const mode of ["100755", "120000", "160000", "000000", "100600", 100644, null, undefined]) {
    for (const field of ["beforeMode", "afterMode"]) {
      const changes = [change({ [field]: mode })];
      assert.equal(classifyDocumentationDelta(changes).eligible, false, `${field}:${mode}`);
      rejected(input({ changes }));
    }
  }
});

test("an absent or malformed change inventory is not documentation evidence", () => {
  for (const changes of [undefined, null, [], {}, "README.md", [null], [undefined], [{}]]) {
    const result = classifyDocumentationDelta(changes);
    assert.equal(result.eligible, false);
    assertReason(result);
    rejected(input({ changes }));
  }
});

test("path aliases, similarly named documents and non-whitelisted files fail closed", () => {
  for (const sourcePath of [
    "./README.md", "README.MD", "readme.md", "docs/../README.md", "/README.md",
    "docs\\ARCHITECTURE.md", "docs/ARCHITECTURE.md/", "docs/ARCHITECTURE.md\0",
    "docs/NEW_GUIDE.md", "docs/example.json", "package.json", "src/game/player.ts",
    "src/ui/tutorialGuide.ts", "src/content/patchNotes.json", ".github/workflows/ci.yml",
  ]) {
    const changes = [change({ path: sourcePath })];
    assert.equal(classifyDocumentationDelta(changes).eligible, false, sourcePath);
    rejected(input({ changes }));
  }
});

test("one executable or configuration change prevents reuse of a mixed delta", () => {
  for (const sourcePath of ["src/game/player.ts", "package-lock.json", "vite.config.ts", "scripts/example.cjs"]) {
    rejected(input({ changes: [change(), change({ path: sourcePath })] }));
  }
});

test("an exact successful same-repository main CI baseline permits reuse", () => {
  const value = input();
  const original = structuredClone(value);
  const result = decideDocumentationReuse(value);
  assert.equal(result.reuse, true);
  assert.equal(result.baselineRunId, 1234);
  assertReason(result);
  assert.deepEqual(value, original, "classification must not alter its supplied evidence");
});

test("a completed successful manual CI baseline can certify the same base", () => {
  const result = decideDocumentationReuse(input({ runs: [baseline({ event: "workflow_dispatch" })] }));
  assert.equal(result.reuse, true);
  assert.equal(result.baselineRunId, 1234);
});

test("only main pushes can reuse a prior certificate", () => {
  for (const eventName of ["pull_request", "pull_request_target", "workflow_dispatch", "workflow_run", "", undefined]) {
    rejected(input({ eventName }));
  }
  for (const branch of ["feature/docs", "refs/heads/main", "Main", "", undefined]) {
    rejected(input({ branch }));
  }
  for (const ref of ["refs/tags/main", "refs/heads/feature/docs", "main", "", null, undefined]) {
    rejected(input({ ref }));
  }
});

test("both commit identities must be different nonzero lowercase forty-character SHAs", () => {
  for (const sha of ["0".repeat(40), "a".repeat(39), "a".repeat(41), "G".repeat(40), "A".repeat(40), "", null, undefined]) {
    rejected(input({ baseSha: sha }));
    rejected(input({ headSha: sha }));
  }
  rejected(input({ headSha: baseSha }));
});

test("missing baseline evidence never enables reuse", () => {
  for (const runs of [undefined, null, [], {}, "success", [null], [{}]]) rejected(input({ runs }));
});

test("failed, cancelled, skipped or unfinished CI runs cannot certify a base", () => {
  for (const conclusion of ["failure", "cancelled", "skipped", "neutral", "timed_out", "action_required", null, undefined]) {
    rejected(input({ runs: [baseline({ conclusion })] }));
  }
  for (const status of ["queued", "in_progress", "requested", "waiting", "", null, undefined]) {
    rejected(input({ runs: [baseline({ status })] }));
  }
});

test("a successful different commit or different workflow is not a baseline", () => {
  rejected(input({ runs: [baseline({ head_sha: headSha })] }));
  rejected(input({ runs: [baseline({ head_sha: "3".repeat(40) })] }));
  for (const workflowPath of [".github/workflows/pages.yml", "ci.yml", ".github/workflows/ci.yml@main", "", undefined]) {
    rejected(input({ runs: [baseline({ path: workflowPath })] }));
  }
});

test("forks and different repositories cannot supply reuse evidence", () => {
  for (const field of ["repository", "head_repository"]) {
    for (const value of [{ full_name: "other/tideweft" }, { full_name: "example/other" }, {}, null, undefined]) {
      rejected(input({ runs: [baseline({ [field]: value })] }));
    }
  }
  rejected(input({ repository: "other/tideweft" }));
  rejected(input({ repository: undefined }));
});

test("only native main push or manual CI metadata qualifies", () => {
  for (const event of ["pull_request", "pull_request_target", "workflow_run", "schedule", "", undefined]) {
    rejected(input({ runs: [baseline({ event })] }));
  }
  for (const head_branch of ["feature/docs", "refs/heads/main", "Main", "", undefined]) {
    rejected(input({ runs: [baseline({ head_branch })] }));
  }
});

test("baseline IDs must be positive safe native numbers", () => {
  for (const id of [0, -1, 1.5, "1234", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, undefined]) {
    rejected(input({ runs: [baseline({ id })] }));
  }
});

test("a valid baseline is selected from otherwise irrelevant completed runs", () => {
  const result = decideDocumentationReuse(input({ runs: [
    baseline({ id: 2345, head_sha: headSha }),
    baseline({ id: 3456, conclusion: "failure" }),
    baseline(),
  ] }));
  assert.equal(result.reuse, true);
  assert.equal(result.baselineRunId, 1234);
});

function rawEntry({ beforeMode = "100644", afterMode = "100644", beforeOid = baseSha,
  afterOid = headSha, status = "M", sourcePath = "README.md" } = {}) {
  return `:${beforeMode} ${afterMode} ${beforeOid} ${afterOid} ${status}\0${sourcePath}\0`;
}

test("raw NUL-delimited diff parsing preserves complete regular-file modifications", () => {
  assert.deepEqual(parseRawDiffZ(rawEntry()), [change()]);
  assert.deepEqual(parseRawDiffZ(rawEntry() + rawEntry({ sourcePath: "docs/RESEARCH.md" })), [
    change(), change({ path: "docs/RESEARCH.md" }),
  ]);
  assert.deepEqual(parseRawDiffZ(""), []);
  assert.equal(classifyDocumentationDelta(parseRawDiffZ("")).eligible, false);
});

test("modified raw entries require full nonzero lowercase object identities", () => {
  for (const oid of ["0".repeat(40), "a".repeat(7), "a".repeat(39), "a".repeat(41), "A".repeat(40)]) {
    assert.throws(() => parseRawDiffZ(rawEntry({ beforeOid: oid })), Error);
    assert.throws(() => parseRawDiffZ(rawEntry({ afterOid: oid })), Error);
  }
});

test("malformed raw headers, missing terminators and trailing fields fail closed", () => {
  for (const raw of [
    rawEntry().slice(0, -1), rawEntry() + "trailing", rawEntry() + "\0",
    rawEntry({ sourcePath: "" }), rawEntry({ beforeMode: "644" }),
    rawEntry().replace(":100644", "100644"), rawEntry({ status: "modified" }),
    `:${"100644 100644"} ${baseSha} ${headSha} M\tREADME.md\0`,
  ]) assert.throws(() => parseRawDiffZ(raw), Error);
});

test("newline-bearing or aliased raw paths never become reusable documentation", () => {
  for (const sourcePath of ["README.md\n", "README.md\r", "README.md\nother.md", "./README.md", "README.md\0extra"]) {
    let parsed;
    try {
      parsed = parseRawDiffZ(rawEntry({ sourcePath }));
    } catch (error) {
      assert.ok(error instanceof Error);
      continue;
    }
    assert.equal(classifyDocumentationDelta(parsed).eligible, false, sourcePath);
  }
});

test("structural raw additions, deletions and mode changes cannot disguise prose edits", () => {
  for (const raw of [
    rawEntry({ beforeMode: "000000", beforeOid: "0".repeat(40), status: "A" }),
    rawEntry({ afterMode: "000000", afterOid: "0".repeat(40), status: "D" }),
    rawEntry({ afterMode: "100755" }), rawEntry({ afterMode: "120000", status: "T" }),
  ]) assert.equal(classifyDocumentationDelta(parseRawDiffZ(raw)).eligible, false);
});

function withGitFixture(body) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tideweft-documentation-reuse-test-"));
  const previousCwd = process.cwd();
  const cleanup = () => {
    process.chdir(previousCwd);
    fs.rmSync(directory, { recursive: true, force: true });
  };
  const git = (args, options = {}) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8", timeout: 10000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "absent-config") },
    ...options,
  }).trim();
  let result;
  try {
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Documentation Reuse Fixture"]);
    git(["config", "user.email", "fixture@example.invalid"]);
    git(["config", "core.hooksPath", ".git/no-hooks"]);
    git(["config", "commit.gpgsign", "false"]);
    fs.writeFileSync(path.join(directory, ".gitignore"), "generated/\n");
    fs.writeFileSync(path.join(directory, "README.md"), "Synthetic first prose.\n");
    git(["add", ".gitignore", "README.md"]);
    git(["commit", "-m", "synthetic base"]);
    const before = git(["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(directory, "README.md"), "Synthetic revised prose.\n");
    git(["add", "README.md"]);
    git(["commit", "-m", "synthetic prose edit"]);
    const after = git(["rev-parse", "HEAD"]);
    process.chdir(directory);
    result = body({ directory, git, before, after });
  } catch (error) {
    cleanup();
    throw error;
  }
  if (result && typeof result.then === "function") return Promise.resolve(result).finally(cleanup);
  cleanup();
  return result;
}

test("delta reading authenticates an exact clean checkout and rejects foreign ancestry", () => {
  withGitFixture(({ git, before, after }) => {
    assert.deepEqual(readDocumentationDelta(before, after), [change()]);
    assert.throws(() => readDocumentationDelta(before, before), Error);
    assert.throws(() => readDocumentationDelta("0".repeat(40), after), Error);
    const unrelated = git(["commit-tree", "HEAD^{tree}"], { input: "synthetic unrelated root\n" });
    assert.throws(() => readDocumentationDelta(unrelated, after), Error);
  });
});

test("tracked and nonignored untracked dirty files cannot reuse a committed delta", () => {
  withGitFixture(({ directory, before, after }) => {
    const readme = path.join(directory, "README.md");
    fs.writeFileSync(readme, "Synthetic uncommitted edit.\n");
    assert.throws(() => readDocumentationDelta(before, after), Error);
    fs.writeFileSync(readme, "Synthetic revised prose.\n");
    const looseFile = path.join(directory, "untracked.txt");
    fs.writeFileSync(looseFile, "Synthetic untracked input.\n");
    assert.throws(() => readDocumentationDelta(before, after), Error);
    fs.unlinkSync(looseFile);
    fs.mkdirSync(path.join(directory, "generated"));
    fs.writeFileSync(path.join(directory, "generated", "local.txt"), "Synthetic ignored output.\n");
    assert.deepEqual(readDocumentationDelta(before, after), [change()]);
  });
});

test("delta reading exposes mixed executable changes instead of filtering them away", () => {
  withGitFixture(({ directory, git, before }) => {
    fs.writeFileSync(path.join(directory, "example.cjs"), "module.exports = 1;\n");
    git(["add", "example.cjs"]);
    git(["commit", "-m", "synthetic executable addition"]);
    const changes = readDocumentationDelta(before, git(["rev-parse", "HEAD"]));
    assert.ok(changes.some((entry) => entry.path === "example.cjs"));
    assert.equal(classifyDocumentationDelta(changes).eligible, false);
  });
});

function workflow(name) {
  return fs.readFileSync(path.join(root, ".github/workflows", `${name}.yml`), "utf8");
}

function namedStep(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^      - name: ${escaped}\\n([\\s\\S]*?)(?=^      - name: |$(?![\\s\\S]))`, "m"));
  assert.ok(match, `missing workflow step: ${name}`);
  return match[1];
}

function namedJob(source, name) {
  const match = source.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, "m"));
  assert.ok(match, `missing workflow job: ${name}`);
  return match[1];
}

test("CI and Pages retain their existing triggers, checkout policy and pinned actions", () => {
  const ci = workflow("ci");
  const pages = workflow("pages");
  assert.ok(ci.includes("on:\n  push:\n  pull_request:\n  workflow_dispatch:\n"));
  assert.ok(pages.includes("on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n"));
  for (const source of [ci, pages]) {
    assert.ok(source.includes("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"));
    assert.ok(source.includes("actions/setup-node@820762786026740c76f36085b0efc47a31fe5020"));
    assert.match(source, /fetch-depth: 0/u);
    assert.match(source, /persist-credentials: false/u);
    assert.match(source, /node-version-file: \.nvmrc/u);
    for (const [, action] of source.matchAll(/^\s*uses:\s*(\S+)/gmu)) {
      assert.match(action, /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/u);
    }
  }
  for (const action of [
    "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d",
    "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9",
    "actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128",
  ]) assert.ok(pages.includes(action));
});

test("both workflows always test the reuse policy and only conditionally omit cumulative tests", () => {
  for (const name of ["ci", "pages"]) {
    const source = workflow(name);
    const policy = namedStep(source, "Check documentation reuse policy");
    assert.match(policy, /run: npm run test:documentation-reuse/u);
    assert.doesNotMatch(policy, /^\s*if:/mu);
    const decision = namedStep(source, "Determine documentation validation scope");
    assert.match(decision, /id: documentation/u);
    assert.match(decision, /check-documentation-reuse\.cjs/u);
    assert.doesNotMatch(decision, /^\s*if:/mu);
    const cumulative = namedStep(source, "Test");
    const condition = name === "ci"
      ? /if: steps\.documentation\.outputs\.reuse != 'true'/u
      : /if: needs\.validation_scope\.outputs\.reuse != 'true'/u;
    assert.match(cumulative, condition);
    assert.match(cumulative, /run: npm run test:ci/u);
  }
});

test("documentation reuse never skips synchronization, type checking, building or static smoke", () => {
  for (const name of ["ci", "pages"]) {
    const source = name === "pages" ? namedJob(workflow(name), "deploy") : workflow(name);
    for (const [step, command] of [
      ["Install dependencies", "npm ci"],
      ["Check player-facing contract, tutorial, and patch notes", "npm run check:player-facing-sync"],
      ["Type-check", "npm run typecheck"],
      ["Build web target", "npm run build:web"],
      ["Smoke-test Pages artifact", "npm run smoke:web"],
    ]) {
      const block = namedStep(source, step);
      assert.ok(block.includes(`run: ${command}`), `${name}: ${step}`);
      assert.doesNotMatch(block, /^\s*if:/mu, `${name}: ${step} must remain unconditional`);
    }
  }
});

test("Pages still uploads dist only and retains deployment permissions and action", () => {
  const source = workflow("pages");
  const top = source.slice(0, source.indexOf("\njobs:"));
  assert.doesNotMatch(top, /^\s*(?:pages|id-token): write$/mu);
  const classification = namedJob(source, "validation_scope");
  assert.match(classification, /^\s+contents: read$/mu);
  assert.match(classification, /^\s+actions: read$/mu);
  assert.doesNotMatch(classification, /^\s*(?:pages|id-token): write$/mu);
  assert.match(classification, /reuse: \$\{\{ steps\.documentation\.outputs\.reuse \}\}/u);
  const deploy = namedJob(source, "deploy");
  assert.match(deploy, /^\s+needs: validation_scope$/mu);
  assert.match(deploy, /^\s+pages: write$/mu);
  assert.match(deploy, /^\s+id-token: write$/mu);
  const upload = namedStep(deploy, "Upload Pages artifact");
  assert.match(upload, /^          path: dist$/mu);
  assert.doesNotMatch(upload, /^\s*if:/mu);
  const deployment = namedStep(deploy, "Deploy to GitHub Pages");
  assert.match(deployment, /id: deployment/u);
  assert.doesNotMatch(deployment, /^\s*if:/mu);
});

test("CI's classifier uses read-only action metadata permission", () => {
  const source = workflow("ci");
  assert.match(source, /^  contents: read$/mu);
  assert.match(source, /^  actions: read$/mu);
  assert.doesNotMatch(source, /^\s*(?:pages|id-token): write$/mu);
});

async function testAsync(name, body) {
  try {
    await body();
    assertions += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function scopeEnvironment(before, after, overrides = {}) {
  return {
    TIDEWEFT_CI_EVENT: "push", TIDEWEFT_CI_BRANCH: "main", GITHUB_REF: "refs/heads/main",
    TIDEWEFT_CI_BASE: before, TIDEWEFT_CI_HEAD: after, GITHUB_REPOSITORY: repository,
    GH_TOKEN: "synthetic-authentication-not-a-secret", ...overrides,
  };
}

async function testScopeLookup() {
  await testAsync("scope lookup uses exact committed evidence and standard Actions ref", () => (
    withGitFixture(async ({ before, after }) => {
      let calls = 0;
      const result = await determineScope(scopeEnvironment(before, after), async (url, options) => {
        calls += 1;
        assert.equal(url.origin, "https://api.github.com");
        assert.equal(url.pathname, `/repos/${repository}/actions/workflows/ci.yml/runs`);
        assert.equal(url.searchParams.get("head_sha"), before);
        assert.equal(url.searchParams.get("branch"), "main");
        assert.equal(url.searchParams.get("per_page"), "20");
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        return new Response(JSON.stringify({ workflow_runs: [baseline({ head_sha: before })] }));
      });
      assert.equal(calls, 1);
      assert.equal(result.reuse, true);
      assert.equal(result.baselineRunId, 1234);
    })
  ));

  await testAsync("tag refs, missing authentication and dirty checkout never request a baseline", () => (
    withGitFixture(async ({ directory, before, after }) => {
      let calls = 0;
      const unexpectedLookup = async () => { calls += 1; throw new Error("Unexpected synthetic lookup."); };
      for (const overrides of [{ GITHUB_REF: "refs/tags/main" }, { GH_TOKEN: "" }]) {
        const result = await determineScope(scopeEnvironment(before, after, overrides), unexpectedLookup);
        assert.equal(result.reuse, false);
        assertReason(result);
      }
      fs.writeFileSync(path.join(directory, "README.md"), "Synthetic dirty input.\n");
      const dirty = await determineScope(scopeEnvironment(before, after), unexpectedLookup);
      assert.equal(dirty.reuse, false);
      assertReason(dirty);
      assert.equal(calls, 0);
    })
  ));

  await testAsync("failed or malformed injected baseline responses select full validation", () => (
    withGitFixture(async ({ before, after }) => {
      for (const lookup of [
        async () => { throw new Error("synthetic-authentication-not-a-secret"); },
        async () => new Response("synthetic raw error body", { status: 403 }),
        async () => new Response("not JSON"),
        async () => new Response(JSON.stringify({ workflow_runs: {} })),
        async () => new Response(JSON.stringify({ workflow_runs: Array.from({ length: 21 }, () => baseline()) })),
        async () => new Response("x".repeat(1024 * 1024 + 1)),
      ]) {
        const result = await determineScope(scopeEnvironment(before, after), lookup);
        assert.equal(result.reuse, false);
        assertReason(result);
        assert.doesNotMatch(JSON.stringify(result), /synthetic-authentication|synthetic raw error/u);
      }
    })
  ));
  console.log(`1..${assertions}`);
}

testScopeLookup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
