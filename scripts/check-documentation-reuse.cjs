#!/usr/bin/env node

// A navigation/release attestation can reuse its parent's CI only when no
// executable input changed. Unknown evidence always selects full validation.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const documentationPaths = new Set([
  "README.md", "CHANGELOG.md", "docs/ARCHITECTURE.md", "docs/GAME_DESIGN.md",
  "docs/RESEARCH.md", "docs/SYSTEM_INHERITANCE.md", "docs/SYSTEM_COMPOSITION.md",
  "docs/CRAFTING_DESIGN.md", "docs/REPOSITORY_CONTEXT.md",
]);
const validSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value)
  && !/^0{40}$/u.test(value);
const validRepository = (value) => typeof value === "string"
  && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value);

function nativeCiRun(run, sha, repository) {
  return run && run.head_sha === sha && run.head_branch === "main"
    && ["push", "workflow_dispatch"].includes(run.event)
    && run.path === ".github/workflows/ci.yml"
    && run.repository?.full_name === repository
    && run.head_repository?.full_name === repository
    && Number.isSafeInteger(run.id) && run.id > 0;
}

function classifyDocumentationDelta(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { eligible: false, reason: "No verified documentation delta." };
  }
  if (changes.some((change) => !change || change.status !== "M"
    || !documentationPaths.has(change.path)
    || change.beforeMode !== "100644" || change.afterMode !== "100644")) {
    return { eligible: false, reason: "Delta includes non-prose or structural changes." };
  }
  return { eligible: true, reason: "Only existing allowlisted regular prose files changed." };
}

function decideDocumentationReuse(input) {
  const full = (reason) => ({ reuse: false, reason });
  if (!input || input.eventName !== "push" || input.branch !== "main"
    || input.ref !== "refs/heads/main") {
    return full("Only main push attestations can reuse validation.");
  }
  if (!validSha(input.baseSha) || !validSha(input.headSha) || input.baseSha === input.headSha
    || !validRepository(input.repository)) {
    return full("Missing exact commit or repository identity.");
  }
  const delta = classifyDocumentationDelta(input.changes);
  if (!delta.eligible) return full(delta.reason);
  const runs = Array.isArray(input.runs) ? input.runs : [];
  const baseline = runs.find((run) => nativeCiRun(run, input.baseSha, input.repository)
    && run.status === "completed" && run.conclusion === "success");
  if (!baseline) return full("No successful same-repository CI at the exact parent commit.");
  return { reuse: true, reason: delta.reason, baselineRunId: baseline.id };
}

function decideCurrentCiReuse(input) {
  if (!input || input.eventName !== "push" || input.branch !== "main"
    || input.ref !== "refs/heads/main" || !validSha(input.headSha)
    || !validRepository(input.repository)) {
    return { reuse: false, reason: "Missing exact main-push CI identity." };
  }
  const runs = Array.isArray(input.runs) ? input.runs : [];
  const baseline = runs.find((run) => nativeCiRun(run, input.headSha, input.repository)
    && run.status === "completed" && run.conclusion === "success");
  if (!baseline) return { reuse: false, reason: "No successful CI at the exact current commit." };
  return { reuse: true, reason: "CI validated this exact current commit.",
    baselineRunId: baseline.id, basis: "head" };
}

function parseRawDiffZ(raw) {
  const fields = raw.split("\0");
  if (fields.pop() !== "" || fields.length % 2 !== 0) throw new Error("Malformed raw diff.");
  const changes = [];
  for (let i = 0; i < fields.length; i += 2) {
    const header = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Z][0-9]*)$/u.exec(fields[i]);
    if (!header || !fields[i + 1]) throw new Error("Malformed raw diff entry.");
    if (header[5] === "M" && (!validSha(header[3]) || !validSha(header[4]))) {
      throw new Error("Modified entry lacks exact object identities.");
    }
    changes.push({ beforeMode: header[1], afterMode: header[2], status: header[5], path: fields[i + 1] });
  }
  return changes;
}

function readDocumentationDelta(baseSha, headSha, cwd = process.cwd()) {
  if (!validSha(baseSha) || !validSha(headSha)) throw new Error("Invalid commit identity.");
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8", timeout: 10000,
    maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  if (git(["rev-parse", "HEAD"]).trim() !== headSha) throw new Error("Checkout does not match event HEAD.");
  git(["diff", "--quiet", "--no-ext-diff", "HEAD", "--"]);
  if (git(["ls-files", "--others", "--exclude-standard", "-z"]) !== "") {
    throw new Error("Checkout includes untracked inputs.");
  }
  git(["merge-base", "--is-ancestor", baseSha, headSha]);
  // No rename inference, external diff drivers or text conversion. Mode/type
  // changes, adds and deletes cannot disguise executable inputs as prose.
  return parseRawDiffZ(git(["diff", "--raw", "--no-abbrev", "--no-renames", "--no-ext-diff",
    "--no-textconv", "-z", baseSha, headSha, "--"]));
}

function scopeInput(env) {
  return {
    eventName: env.TIDEWEFT_CI_EVENT, branch: env.TIDEWEFT_CI_BRANCH, ref: env.GITHUB_REF,
    baseSha: env.TIDEWEFT_CI_BASE, headSha: env.TIDEWEFT_CI_HEAD,
    repository: env.GITHUB_REPOSITORY, changes: [], runs: [],
  };
}

async function readCiRuns(repository, sha, token, fetchImpl) {
  const url = new URL(`https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs`);
  url.search = new URLSearchParams({ head_sha: sha, branch: "main", per_page: "20" });
  const response = await fetchImpl(url, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10" },
    signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!response.ok) throw new Error("CI lookup failed.");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) throw new Error("Oversized CI metadata.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const data = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  if (!Array.isArray(data.workflow_runs) || data.workflow_runs.length > 20) throw new Error("Malformed CI metadata.");
  return data.workflow_runs;
}

async function determineScope(env = process.env, fetchImpl = fetch) {
  const input = scopeInput(env);
  if (input.eventName !== "push" || input.branch !== "main" || input.ref !== "refs/heads/main"
    || !validSha(input.baseSha)
    || !validSha(input.headSha) || !validRepository(input.repository)) {
    return decideDocumentationReuse(input);
  }
  try {
    input.changes = readDocumentationDelta(input.baseSha, input.headSha);
    if (!classifyDocumentationDelta(input.changes).eligible) return decideDocumentationReuse(input);
    if (!env.GH_TOKEN) return { reuse: false, reason: "No read-only baseline authentication available." };
    input.runs = await readCiRuns(input.repository, input.baseSha, env.GH_TOKEN, fetchImpl);
    return decideDocumentationReuse(input);
  } catch {
    // Do not echo API bodies, headers, tokens or arbitrary git diagnostics.
    return { reuse: false, reason: "Baseline or tree verification unavailable; full validation required." };
  }
}

async function determinePagesScope(env = process.env, fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowImpl = () => performance.now()) {
  const documentation = await determineScope(env, fetchImpl);
  if (documentation.reuse) return documentation;
  const input = scopeInput(env);
  if (input.eventName !== "push" || input.branch !== "main" || input.ref !== "refs/heads/main"
    || !validSha(input.headSha) || !validSha(input.baseSha)
    || !validRepository(input.repository) || !env.GH_TOKEN) return documentation;
  try {
    readDocumentationDelta(input.baseSha, input.headSha);
  } catch {
    return documentation;
  }
  const deadline = nowImpl() + 60 * 60 * 1000;
  for (let attempt = 0; attempt < 241; attempt += 1) {
    try {
      input.runs = await readCiRuns(input.repository, input.headSha, env.GH_TOKEN, fetchImpl);
    } catch {
      return { reuse: false, reason: "Current CI verification unavailable; full validation required." };
    }
    const current = decideCurrentCiReuse(input);
    if (current.reuse) return current;
    const matching = input.runs.filter((run) => nativeCiRun(run, input.headSha, input.repository));
    const pending = matching.some((run) => ["queued", "in_progress", "requested", "waiting", "pending"].includes(run.status));
    if (!pending && matching.some((run) => run.status === "completed" && run.conclusion !== "success")) {
      throw new Error("Exact-current-commit CI completed unsuccessfully; Pages is blocked.");
    }
    if (matching.some((run) => !["queued", "in_progress", "requested", "waiting", "pending", "completed"].includes(run.status))) {
      return { reuse: false, reason: "Ambiguous current CI state; full validation required." };
    }
    const remaining = deadline - nowImpl();
    if (remaining <= 0 || attempt === 240) {
      throw new Error("Exact-current-commit CI did not succeed within the bounded wait; Pages is blocked.");
    }
    if (attempt % 4 === 0) console.log("Waiting for successful CI at this exact commit; no duplicate suite started.");
    await sleepImpl(Math.min(15000, remaining));
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--pages")) throw new Error("Unsupported scope option.");
  const result = args[0] === "--pages" ? await determinePagesScope() : await determineScope();
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `reuse=${result.reuse}\nbaseline_run_id=${result.baselineRunId || ""}\n`);
  }
  if (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Validation scope\n\n${result.reuse ? `Reusing successful ${result.basis === "head" ? "exact-current-commit" : "parent"} CI run ${result.baselineRunId}; ${result.basis === "head" ? "this commit is validated" : "executable inputs unchanged"}.` : "Full cumulative validation required."}\n\n${result.reason}\n`);
  }
}

module.exports = { classifyDocumentationDelta, decideDocumentationReuse, decideCurrentCiReuse,
  parseRawDiffZ, readDocumentationDelta, determineScope, determinePagesScope };
if (require.main === module) main().catch(() => {
  console.error("Validation scope could not be established safely; deployment is blocked.");
  process.exitCode = 1;
});
