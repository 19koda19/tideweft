# Repository context navigation

TIDEWEFT's repository-context tool is a small, local map to the repository. It
helps an agent find likely owners, symbols, contracts, tests, and validation
commands without loading unrelated large files. It does not replace source
code, canonical design, applicable instructions, current execution records, or
required full reads.

## Authority and intended workflow

Use the tool in this order:

1. read all applicable repository instructions;
2. establish the live worktree and current execution state;
3. request a bounded context packet for the task;
4. if it reports `STALE` or `UNAVAILABLE`, refresh the requested index or use
   ordinary repository search;
5. open the original canonical requirements, implementation, and tests before
   making a consequential change.

The index labels mechanically extracted facts separately from the two small
reviewed contract summaries currently included. An import is not proof of a
runtime dependency, a colocated filename is not proof of test coverage, and a
function's existence is not proof of player-accessible behavior. An empty
result means only that the bounded search found no match.

The source and current canonical documents remain authoritative. Reviewed
summaries retain the full source fingerprint present when a person checked
them. If that source changes, regeneration marks the summary
`REVIEW_REQUIRED`; it does not bless the old interpretation with a new hash.

## Commands

From the repository root:

```sh
npm run context:generate
npm run context:check
npm run context -- "sound emitted by a marsh fox pursuit"
npm run context -- --domain persistence
npm run context -- --file src/game/runtime.ts --symbol createTideweftRuntime
npm run context -- --contract save-compatibility-lifecycle --limit 5
npm run context:stats
npm run context:benchmark
npm run test:context-index
```

Local operators with the ignored local configuration may additionally run:

```sh
npm run context:generate -- --include-private
npm run context:check -- --include-private
npm run context -- --include-private "resume the current active work"
npm run context:recover -- --include-private
```

`generate` refreshes eligible records. `check` is read-only and exits `0` for a
current index, `1` for stale or broken records, and `2` when the requested index
is unavailable. `context` returns a bounded packet divided into mandatory
sources, canonical sources, critical reviewed constraints, and optional source
expansion. `recover` adds live branch/HEAD/dirty state and derived pointers into
the existing workflow owners; it is not a second progress ledger and cannot
restore unrecorded conversation state. `stats` describes index size and scope.
`benchmark` compares bounded literal-search discovery with indexed discovery
while charging both paths for the same required original-source reading.
Queries may be narrowed by domain, file, symbol, reviewed contract ID, or
directive reference; `--limit` bounds optional expansion from 1 through 25.

`context` and `recover` check freshness themselves before returning indexed
navigation. A successful `CURRENT` packet needs no preceding `context:check`.
Use the standalone check to diagnose freshness without requesting a packet.
Generate only when needed, and use the same public/private mode for generation
and the subsequent query.

Explicit `--file` and `--symbol` selectors restrict optional expansion to exact
matches; when both are supplied, the symbol must occur in that file. Associated
test candidates and bounded direct imports/consumers remain navigation hints.
Mandatory references and matched canonical contracts remain present. A missing
exact selector returns uncertainty rather than unrelated optional files; remove
the selector or use `rg` to broaden the investigation deliberately.

Generated indexes are written atomically below
`artifacts/repository-context/<worktree-id>/`. They contain no generation
timestamp, so identical inputs produce identical stable output. The worktree ID
is a hash of local repository/worktree identity; absolute personal paths are not
stored. Unchanged file records are reused when the format, tool, and
configuration are unchanged.

The generated manifest is compact machine-readable data. Do not paste or load
the whole manifest into an agent context; use `context`, `stats`, or a narrowed
file/symbol query to retrieve a bounded packet.

## Coverage

The first useful version provides:

- a public tracked/nonignored file inventory;
- Markdown heading navigation;
- TypeScript top-level symbol and static-import navigation using the pinned
  TypeScript parser;
- conservative CommonJS declaration and `require` navigation;
- explicitly unproven test candidates;
- authored routes for Living Voice/acoustics and persistence/save work;
- source-fingerprint-bound reviewed summaries for the acoustic event pipeline
  and save compatibility lifecycle;
- package-script discovery;
- optional local execution and recovery pointers supplied by an ignored local
  configuration.

It intentionally does not attempt full semantic coverage of every future
directive. Add a reviewed route or summary only when repeated real navigation
work justifies its maintenance cost.

## Freshness and invalidation

Freshness uses working-tree bytes and eligible membership, not only `HEAD`.
Checks detect changed content, new eligible files, rename/deletion, indexing
configuration changes, local execution-source changes, tool/parser changes,
and worktree mismatch. Generation fingerprints sources and configuration
before and after extraction and refuses to replace the previous index if they
changed during the run. Source and output paths containing symbolic links are
rejected rather than followed across repository or publication boundaries.

The stable index deliberately excludes volatile timing and generation dates.
Live branch, HEAD, and dirty paths are gathered only for a recovery packet.

Read this guide once in a retained working context and reread it when its bytes
change or that context is lost. A source pointer or fingerprint in a packet
does not mean its contents are already understood. Preserve mandatory initial
contract reads and full rereads of changed execution contracts; for unchanged
material already read, refresh the relevant original sections and inspect
intervening worktree changes. See [local development](../README.md#local-development)
for existing validation commands. Neither navigation nor a cached test result
can certify a changed source, test, configuration, dependency, toolchain, target,
or relevant environment.

## Privacy

Public generation discovers only Git-tracked or nonignored public candidates.
It never recursively scans ignored directories. The optional local mode reads
only paths explicitly allowlisted by an ignored local configuration; those
sources and all derived records are marked private and remain under the ignored
artifact directory. Private summaries inherit source sensitivity.

The tracked tool, guide, configuration, and self-tests work in a public-only
clone with no private documents. Tests use synthetic ignored fixtures rather
than enumerating local planning material. Credentials, environment files, real
saves, build artifacts, and unrelated user files are outside the eligible
surface.

Before staging or publishing, continue to run the repository's existing
privacy boundary guard. This tool does not change sharing policy.

## Maintenance and limitations

The tracked configuration owns public eligibility, authored task routes,
reviewed summary text and its review fingerprints, and representative benchmark
tasks. The ignored local configuration owns any local-only source allowlist and
recovery pointers. Neither is an architecture authority.

When a reviewed source changes, a maintainer must reopen the original section,
verify or update the compact summary, and then deliberately record its new full
source fingerprint. When the pinned TypeScript parser API changes, update the
mechanical extractor and its focused self-test together.

The tool does not infer dynamic event subscriptions, complete runtime call
graphs, actual test coverage, player reachability, or semantic agreement
between code and prose. It exposes broken references and stale reviewed
summaries that it can establish mechanically; other disagreements remain
investigation findings. If the index is missing, stale, ambiguous, or adds more
work than it saves, use ordinary `rg`, open the original sources, and continue.

Token counts in benchmark output are explicitly rough `characters / 4`
estimates because this repository does not install a tokenizer. Exact bytes,
characters, lines, and words are reported alongside them. Shorter output alone
does not establish a correct workflow: each benchmark also checks whether the
expected owners, contract records, and source/test paths were found.

The comparison is synthetic and deliberately favorable to the search baseline:
its follow-up is given the expected missed paths. Reported workflow totals are
task-specific discovery plus required source reads; they omit the identical
session-entry reading of instructions and execution state. Timing medians run
in-process against an already loaded index and do not include Node/npm startup.
