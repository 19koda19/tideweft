# Research ledger

This file records evidence that changes the design. It is not an attempt to summarize every article about games; it captures the sources and constraints that can be turned into mechanics or verification.

Local artifact retention — 2026-10-02: obsolete optimization working notes,
profiling captures, source-map dumps and frozen experimental builds were moved
to a recoverable archive outside the checkout. Historical artifact paths below
remain provenance, not promises that those files are still present. The local
workflow record retains recovery locations. Future comparisons must recover
the matching artifacts or capture a fresh baseline; no measured result, durable
performance rule or current validation certificate was removed by this cleanup.

Cleanup follow-up — 2026-10-02: the earlier external profiling archive is no
longer available at its recorded location; historical capture recovery is not
verified. Forty-one remaining ignored screenshot, log, probe and metadata files
were removed from the checkout into a separate recoverable local archive. This
includes two seed-discovery probes previously included in local test discovery,
not maintained product regression tests. Canonical evidence, supported profiling
tools, current builds and validation certificates remain. Future performance
comparisons must capture a fresh baseline if exact historical artifacts cannot
be recovered; the recorded measurements are historical, not a current rerun.

## Alpha64 short production comparison — 2026-10-07

Clean executable `785ff0f3359581bd3c3b2fce7550a976152c0fb5` prepares the
bounded Living Voice release candidate without changing gameplay contract51,
save50/carry14, generator or dependency versions. Standard web build, nested
static smoke, macOS arm64 package/normal packaged smoke and ZIP generation pass.
The measured and subsequently repackaged ASAR is exactly
`648a24e80ea2bc5558cec8ff0d4d9a087a75d53e19b8178701b616c70a3474bd`;
production JS SHA256 is
`96848c89394907d83b45571ca1a5ae82415eab1cffbe39887216480de107d90d`.
This record does not itself establish publication or directive closure.

The existing pre-AFTER Alpha62 rule is frozen before capture: paired mean
draw cost may increase at most5%, with no consistent callback-rate loss over5%.
Comparison uses the retained `water-motion-4f7b189` AFTER pair, not the older
Alpha60 scene with only three visible actors. Four new15-second estuary Relief
production windows run sequentially, two per platform, after the existing
at-least-30-frame controlled warm-up. Host is AC Apple M4/16GiB, macOS26.5.2,
Low Power Mode off;
Node22.20.0/npm10.9.3, Electron44.1.0/Chromium152 and Firefox157.0.1. CSS
viewport1440×900, DPR1, renderer quality and workloads are matched:72 actors,
54 materialized,22 visible/4 wildlife,950 aggregate units,1704 drawn terrain
tiles, one perception-material submission consuming156 visible chunk-local
perception segments,20 halos and7 active Relief label nodes. The generic node
count is not seven visible acoustic captions.
The user's ordinary Firefox stays open as in the retained comparison; possible
background contention remains a limit. No competing test, game or profiler runs.

| Platform | Retained paired draw mean | Candidate paired draw mean | Retained callback rate | Candidate callback rate |
| --- | --- | --- | --- | --- |
| Electron | 24.671824ms | 25.215441ms (+2.2034%) | 34.054161/s | 33.308016/s (−2.1911%) |
| Firefox | 20.702806ms | 20.459267ms (−1.1764%) | 31.732260/s | 32.152449/s (+1.3242%) |

Both platforms pass that **no-additional-short-regression** criterion. World
means remain89.81–90.49ms Electron and154.8–157.2ms Firefox; worst callback
gaps remain142.9ms and206ms. Each run contains only14–15 advances, so empirical
world p99 is effectively max, not a reliable population tail estimate. Accepted
steps are149/150 Electron and152/152 Firefox, with14/15 and15/15 advances;
these wall-window repetitions are not equal-terminal-state witnesses. Callback
rates and draw CPU are not GPU timing or verified presented FPS. Both Firefox
captures record zero runtime errors/rejections; all four finish with all six
selected pending counters at zero.
Explicit tail saves occur outside timed windows; no timed autosave or long-run
heap/resource convergence is certified. DOM count3753 versus3682 reflects the
new manual; identical DOM bytes are not claimed.

Commands are the existing `profile:baseline` with packaged executable,
`--scenario estuary-desktop-relief --sample-ms 15000`, and `profile:browser`
with its matching `--packaged-baseline` and `--sample-ms 15000`, each under
`caffeinate -i`. Ignored evidence is
`artifacts/validation/voice-current49/short-performance-785ff0f/`:
`electron-{1,2}.json` and `firefox-{1,2}.json`, with corresponding command logs.
No CPU sampler, hitch trace, new harness, optimization or fidelity reduction is
used. Historical45/40 callback floors remain unmet; the expanded Relief cost
and synchronous world hitch are documented known limitations, not fixed by
this comparison. Longer profiling/repair and longitudinal acceptance remain
unperformed. Installation/signing, other desktop targets, physical mobile
hardware, formal spoken assistive-output tests and exact live release checks
are not established by these observations. Dependency changes: NONE; upstream
p5/Electron source modified: NO.

The final local complete-correctness attempt on the same executable starts
2026-10-07T12:54:38.816Z under the explicit1500-second whole-command cap:
`caffeinate -i npm run test:ci -- --reporter=default --reporter=json
--outputFile=artifacts/validation/voice-current49/cumulative-785ff0f.json`.
Context28 and player-facing39 self-tests pass. The cap terminates only the
owned process group with SIGKILL after1500.020702seconds; supervisor exit124.
The log contains97 completed files/1409 passed tests and no reported failure
lines, but268 tracked test files lack completed results. No final JSON result
exists. This is **INCOMPLETE**, not a full cumulative pass, an identified game
regression or release permission. No extension/restart occurs. Log SHA256 is
`a91403ae51d339d77588598a6301add1a30a8c4ce4e5e2bcff79a6fd5cedb970`;
the local `cumulative-785ff0f-cap-coverage.json` records exact completed and
uncompleted paths without treating in-flight tests as passed. Runtime, tests,
schemas, configuration and build inputs remain unchanged; only prose evidence
is edited during the run. Complete correctness, CI, deployment and exact-live
verification remain unestablished, and Living Voice is not closed.

### Remaining-file completion — 2026-10-07

The subsequent user continuation authorizes finishing only the268 uncompleted
files, in batches individually capped at1500seconds. Two explicit134-file
Vitest invocations retain the current default isolation/configuration and
`--maxWorkers=2`, with default and JSON reporters. Batch1 passes1216 tests in
23.492seconds; batch2 passes1572 in15.371seconds, both terminal exit0.
No test expectation, timeout, executable or dependency changes. Their union
with the97 positive completed-file witnesses from the capped log covers exactly
365 tracked test files / **4,197 passing tests**, with no duplicate, unexpected,
missing, pending, todo or failed assertions in the completed batch reports.
Context28 and player-facing39 prerequisite passes are retained.

The ignored `voice-current49/complete-batched-785ff0f.json` certificate has
SHA256 `4f9beda0b8c225bfa304c833b2f4375664f6d0d57d7e3541f9f1cf9b9e738736`.
Its plan captures666 source/test/configuration inputs, all byte-unchanged at
completion; public HEAD3769c6e differs from785ff0f only in this Research prose.
Exact file membership, per-file assertions, terminal statuses and report/log
hashes are checked. Commands use the installed `vitest.mjs run` with the plan's
explicit file paths, the existing reporters and worker limit under
`caffeinate -i`; no new simulator, harness or published planning tool is added.

This is **complete batched cumulative coverage**, not a retroactive PASS of
the original capped `npm run test:ci`. That invocation remains incomplete and
has no terminal JSON/global teardown result for its97 log-backed file passes.
Separate invocations do not reproduce monolithic co-scheduling. The evidence
supports current local cumulative confidence on the unchanged executable,
not a longitudinal soak, performance repair or remote release. CI, Pages and
exact-live verification remain pending at this local checkpoint.

### Remote correctness and Pages timing diagnosis — 2026-10-07

CI run `37633687939` succeeds on pushed
`377df3ff63108cc5f6abb8b7b42b8462c7c2ffb4`, whose executable inputs remain
unchanged from `785ff0f`. The complete monolithic Vitest run passes365 files /
4,197 tests in2138.62seconds, together with context28, synchronization39,
type-check, web build and static smoke. This supplies the complete-run evidence
missing from the original locally capped invocation; that historical invocation
still remains INCOMPLETE.

Pages run `37633688000`, attempt1, fails one unchanged marsh-edge ecology
wall-time assertion:384 desktop ecology steps take8015.039ms against a strict
8000ms ceiling. The other364 files /4,196 tests pass. The same fixture passes
in the successful exact-commit CI run at6324.37ms and in two unchanged isolated
local rechecks at3458.22/3430.29ms (two tests each,6.32/6.28seconds overall).
Those passing witnesses report the same17 allocations,14 actors,384 desktop
steps,128 mobile steps and91,136 save bytes. Reported counts are not a full
intermediate-state equality proof; attempt1 fails before its later assertions.

Pages is approximately35% slower across the complete suite and neighboring
unchanged ecology/time files; the failed loop is26.7% slower than CI and misses
its ceiling by0.188%. This supports hosted-runner timing variability, not a
proved semantic regression, GC diagnosis or application repair. The assertion
measures synchronous ecology work, not rendered frames or presentation FPS.
No source, timeout, expectation, dependency or workflow is changed. Only the
failed Pages job is retried on the same commit; successful CI is retained.
Local evidence stays in the existing ignored `voice-current49` validation
owner. Deployment and exact-live verification remain pending at this record.

The unchanged attempt2 is also TERMINAL FAILURE:364 files /4,196 tests pass,
the same384-step proxy takes8056.472955ms against8000ms, and the complete suite
lasts2881.92seconds. All later build/deployment steps are skipped. Its retained
failed-job log SHA256 is
`0c3a726745d38f4f1b57289e8502c0b1bb1ec131eb31306f6e4645cd27adfbc6`.
This is not a second passing certificate or a render-performance measurement.
No assertion, workload or budget is weakened. The two failed Pages attempts
remain failed; the successful exact-commit CI and local fixture checks remain
separate evidence, not a guarantee every hosted runner meets the wall-time bound.

The user explicitly authorizes a narrower attestation workflow. Local policy
commit `66cdc51191cfbc608a1626443e374bbe4698aea3` admits only modified existing
allowlisted regular prose files plus a successful exact-parent CI receipt.
Its33 focused groups, critical105, context28, synchronization39, typecheck,
production web and nested static smoke pass; all five web asset hashes remain
identical. Source/configuration changes still require full CI, and ambiguous
evidence fails closed to full validation. An additional current-CI sharing
refinement makes Pages consume successful same-repository CI at its exact
current commit rather than rerun an identical suite. Its lookup remains
read-only, bounded and independent of deployment permissions; known failed CI
or an expired wait blocks deployment, while unavailable metadata retains the
original full Pages validation. Build/static/release consistency checks and
the existing dist-only deployment path stay mandatory. This refinement passes
45 policy groups (including injected-clock60-minute/241-attempt bounds with no
real sleep/network), critical6 files/105 tests, context28, synchronization39,
typecheck, web/static and YAML checks. All five web hashes remain unchanged.
No new remote success, deployment, timing repair, dependency change or Voice
closure is inferred.

The ensuing bootstrap is now terminal PASS at exact
`28c7e0c71dbcc7c94d94b71936a7424d0ebc64bd`: CI 37648061922 runs the complete
365-file/4,197-test suite in 2835.56 seconds, with context 28, synchronization 39,
policy 45, typecheck, build and static smoke. Pages 37648062032's read-only
scope returns `reuse:true`, basis `head`, baseline 37648061922 at 16:44:50 UTC.
Its cumulative Test step is explicitly skipped, not reported as another pass;
independent release synchronization/typecheck/build/static/deployment succeed.
Environment deployment 6915584726 succeeds at 16:45:31 UTC. At 16:47:03 UTC all
five cache-bypassed HTTPS files match the retained production bytes and hashes,
HTTP 200/appropriate MIME, total 4,780,761 bytes. The
[primary release receipt](../README.md#alpha64-living-voice-release-receipt)
owns the asset table and current public status.

This is actual application-release and workflow-reuse evidence, not a runtime
optimization. Both original failed Pages attempts and the locally capped
INCOMPLETE remain historical failures/limits. The game sources/dependencies
and product files remain unchanged from 785ff0f. The current available-producer
Voice scope has finite/cumulative/release evidence; broader repertoires,
physical-mobile/formal-AT/other-desktop certification and the accepted Relief
cost/world hitch are not promoted. Extended profiling/repair and longitudinal
Voice evidence remain deferred until full Living Foliage. Local terminal logs
have SHA-256 `704432d2162ad8ed22fa2aa18fd9f9a9030454335d36d08c7aa612fb09cf6ec4`
(CI) and `925ee84f3c51194252ff2efa8c5c68ec1bbf913a7c0bc16b9e33e64e84e2b333`
(Pages); they stay in the existing ignored validation owner, not public assets.

## Non-pausing modal announcement exposure — 2026-10-07

A short native macOS arm64 observation on clean `4f3a260` reproduced a real
accessibility defect in the current unpublished Alpha63 package, ASAR
`adb1beb0…5fac2`. Actual START, T, I and Escape controls showed the world
running while Chromium's partial AX query marked the sole `#announcer`
`ignored:true`, reason `activeModalDialog`, during both Manual and KIT. It
returned as a nonignored `status` on close. Full-tree inclusion agreed with the
direct backend-node query; absence from a pruned tree alone was not used as
proof. The five-stage run lasted5.877s. It did not generate a fictional sound,
change global accessibility settings or supply player saves.

The retained application-only correction in `createTideweftUI.ts` moves the one
existing endpoint into the current modal's non-inert subtree. It clears old
copy before host changes, keeps the existing queue and caption-ID ledger, and
re-primes a changed host before publishing pending copy. An open-only fallback
cannot displace a native modal; focus and observed open order handle stacked
dialogs. The observer watches only five `open` attributes. Teardown disconnects,
clears and restores the endpoint. No producer, audio, hearing, save/schema,
dependency, renderer-quality or simulation authority changes.

Five new queue/routing tests characterize pending-host changes, no replay on
reopen, close during hold, stacked/fallback routing and teardown. The affected
UI run passes seven files/139 tests; tutorial/KIT domain passes two files/30;
actual `npm run test:smoke` passes six files/105. Typecheck and the623-module
production build pass. The release synchronization wrapper correctly rejects
this ordinary unpublished delta; no new release identity or weakened gate was
manufactured. `npx electron-forge package` executes the existing build/security
configuration for a local functional candidate only. Static nested-path smoke
and the existing packaged desktop smoke pass.

On that candidate, ASAR `5136dc23…84241`, production JS `72d516a9…55fd0`, the
same native five-stage observation lasts6.694s: the one endpoint is a nonignored
live `status` inside Manual/KIT, then returns to BODY empty, without replay.
The world remains unpaused. A separate fresh Firefox157.0.1 production
`/tideweft/` observation lasts7.588s and confirms the same actual controls,
single endpoint, modal ancestry and empty restoration using passive reads.
No fetch/HTTP failures occur. One CSP eval denial is retained in the browser
record; this run does not assert an entirely clean console or certify audible
output. Its first attempt failed a probe's unsupported DOM-node return before
START; boolean readiness reads fix the probe, not game code.

Evidence is retained locally under `artifacts/validation/voice-current49/`:
`modal-ax-before-4f3a260.json` SHA256 `8d336749…826d6`,
`modal-ax-after-4f3a260-candidate.json` `90685d60…885b6`, and
`modal-firefox-candidate-v2.json` `b8c88949…10556`, plus the named
`modal-live-region-*` validation logs. Disposable profiles/processes are closed
and removed; real saves and the user's browser are untouched. The CDP client
uses its existing evaluation flags; these captures are not trusted-audio
activation evidence. Firefox reads explicitly request `userActivation:false`.
Native AX and DOM eligibility do not prove spoken VoiceOver output, actual
audio quality or physical mobile performance. No extended profile, soak,
cumulative rerun, distribution, signing or publication is claimed.

## Sparse footing reactions — 2026-10-06/07

Local unpublished `2da94a8` repairs the rapid near-fall wording cluster found
in the finite wilderness check below. The existing `playerExpressionRecency`
owner retains the same two exact footing origins and requires 600 accepted
steps before another fresh reaction of that meaning is eligible. Kernel
12/16-step semantic and priority-qualified 4/6-step family locks, catalog keys,
physical incidents/contact sounds and cargo choice remain unchanged. A first
serious reaction may still outrank ordinary footing. Current save50/carry14/
recency2 remain unchanged; the supported nested-v1 reader explicitly preserves
its original 12/16-step canonical prune fence, not the new current horizon.

Focused recency/effort units pass three files/30 tests; existing authority,
traversal, kernel and causal-authority tests pass four files/49. The complete
`npx vitest run src/game/runtime.fall.integration.test.ts --maxWorkers=1`
passes all28 cases in98.70s, including original real storm stumbles and the
new step30 consumed-history/current-reload proof. The original step11 exact
chart-revision/root comparison remains intact. An initial extension guessed an
incorrect extra publication-revision count; the final test separately compares
step30 authoritative roots and chart facts rather than weakening the original
proof. The post16 fresh-incident refusal is unit-proven; that runtime fixture's
second actual stumble is still only four steps later. Existing late introduction,
save and vocal-audio rollback passes one selected case/93 unselected;
`npm run test:smoke` passes six files/105. Typecheck/build and static web smoke
pass. No cumulative or whole-directive certificate follows from these checks.

The unchanged command `caffeinate -i node
artifacts/validation/voice-current49/native-play-9cc87d3.cjs 360000 wilderness`
passes on clean `2da94a8`, fresh production JS `8ecc2a19…45153` and unchanged
driver `aa425bdb…5a9b`. Firefox157.0.1,1440×900/DPR1; actual360.488s,
420→885,295.978 sampled northward tiles/four rests, no ADRIFT or terminal
recovery. Its361.497s census has2609 reads/11 retained candidates: two player
lines, three animal calls and six physical cues. The player says **That was
close.** at29.165s/tick449 and **Still here.** at357.896s/tick881, with no
adjacent observed repeat. Earlier `0df578b` had five lines/two repeats; the six
physical event IDs/copy match across the windows, while late ticks differ by
one. Native input timing and optional vocal receipt differences mean this is
finite observed improvement, not equal-input terminal-state equivalence,
complete emitted-event counts, audible silence or hours acceptance. No source,
event, actor, weather, route or save injection was used.

Terminal Chart image is inspected without an active caption wall. No observer
overflow/incomplete/raw-trace truncation, unexpected console/lifecycle failure
or profile leak occurs; the one known CSP probe denial remains classified.
Report `native-wilderness-2da94a8-360000-v20.json` SHA256
`57441ac9664dfecefb2dff9ee0c4fa7d1b525ed62fcb17900f626eac480f0c93`;
PNG `02fdd4449bbf1dce9e59c92b8701052a00bbaadb6a6f33de8b5348eb2ddcfc15`.
Bounded history, current persistence, shared physical-acoustic and priority
contracts are `INTEGRATED` at their existing owners; no new inheritance family,
composition bridge or future gameplay producer is claimed. Hardware audio/AT,
hours, crowd/performance, final cumulative and release gates remain separate.

The macOS arm64 app is also rebuilt from this accepted source through
`npm run package:desktop`, including release synchronization and the fresh
production web build. Its runtime-only ASAR has10 entries/5,000,868 bytes,
SHA256 `adb1beb0…5fac2`; all seven embedded manifest/main/dist files match
current bytes. Existing `npm run smoke:desktop -- --executable
release/tideweft-darwin-arm64/tideweft.app/Contents/MacOS/tideweft
--no-screenshot` passes with disposable data and no renderer/navigation/resource
failure. Real saves are untouched. This is packaged automated smoke, not manual
audio quality, signing/install/ZIP, other-platform or published release proof.

## Ordinary learned animal-call caption check — 2026-10-06

The ignored ordinary-controls observer compared raw call text with DOM copy,
missing the existing learned wording in
`src/ui/situatedExpressionCaption.ts:situatedExpressionCaptionVisibleText`.
It now derives expected animal copy only from the actually received public
recognition field, with unchanged anonymous text and coarse direction. DOM
expiry is distinct from projected-event expiry: screenshot checks may reference
the previously observed exact caption while its same-ID reading lease remains
visible. This does not create hearing, extend a world glyph or infer an emitter.
Syntax/local serialized-helper characterization passes; caption/layout tests
pass87 and maintained critical smoke passes105 (4.08s). No product change.

Frozen clean `d69764b`, unchanged Alpha63 JS
`015495e5529937a4797eb68d6bf5aa0343f27bb294dc6c7e49329e380f6c11cd`:
`caffeinate -i node artifacts/validation/voice-current49/native-play-9cc87d3.cjs
60000 animal` passes with observer revision22, SHA256
`40270c9eda47ada3c13784b42f416e18fad0d84dbd8645f77bce461051e33e0e`.
Report `native-animal-d69764b-60000-v22.json` SHA256
`4031bb12d7418f8a98e85c8b63055b9e0e6084e8bab59f10b9c3594c029d961c`.
Actual physical START/seed typing/movement, no save/actor/sound injection;
60.015s,420→480. At423 the DOM and ARIA say plain `chicken call`. Both inspected
1440×900 images have readable matching copy, no clipping or checked-caption
collision. Chart brackets retain the current receipt; Relief brackets honestly
record its reading lease after the current projection ends or changes. Actual
DOM disappearance is observed3433ms after observer start, at424. The bounded
observer has2128 frames;454 public reads over60.551s have no overflow. This is
one ordinary learned-call opportunity, not natural call rates, complete event
census, hardware audio/AT, saturation, long play or performance certification.

Earlier records remain: revision19 captured no qualifying DOM match despite
three chicken calls/one animal-caption census entry. Revision20's nominal PASS
confused projection disappearance with DOM expiry. Revision21 correctly found
DOM expiry but exited2 because its current-projection-only screenshot guard
rejected a legitimate retained lease. Neither is promoted to a complete current
presentation pass. Revision22 fixes both distinctions without changing native
actions or the game; subsequent local limitation-copy correction changes no
behavior. The captured script bytes are separately preserved. Each browser
exited and its disposable profile was removed; real saves were untouched.

## Current keeper/flock contention attempt — 2026-10-06

On that same clean HEAD/artifact, the unchanged existing local command
`caffeinate -i node artifacts/validation/voice-current49/native-learned-cat.cjs
keeper 60000` exits1: the two current chicken projections end during screenshot
capture. The requested60s observation/save continuation therefore did not run.
Report `native-keeper-running-d69764b-60000-v2.json` SHA256
`1cc14cf98ae6b14b7e3e48ae880b2ce690ffd05726bfc4dc3b99bb386e5c2498`.
Its exact current50/carry14 pre-action fixture is1,921,672bytes,
`ba937cd31ad9621d1c45b5dd4fa523b5aec5dc951c6e9a118e0386e2f6176269`:
real generated chickens/guardian/store footing, no supplied expression,
knowledge or closure. One neutral ordinary start and native E produce a real
secured-store response while two chicken calls compete. No scheduler stop
occurs during capture. The1.817s observer has13 states/149 callbacks,12 directly
projected humans, at most4 candidates/3 labels and17 readable keeper samples.
Two transient current-tuple mismatches remain reported; no overlap is recorded.
The inspected PNG visibly separates keeper speech, a flock cue and retained
physical caption, but the after-bracket has only keeper speech. This is not a
passing three-current-source screenshot, sustained dense stress, expiry/save,
audio/AT or performance proof; no world-glyph bracket was relaxed to obtain it.
Owned browser/profile cleanup passes. No blind retry or new producer follows.

The existing runtime case `voices the committed store closure once through
shared Living Voice authority` passes separately:
`npx vitest run src/game/runtime.settlementEcology.integration.test.ts
--maxWorkers=1 -t 'voices the committed store closure once through shared
Living Voice authority'` (1 selected/38 unselected,8.45s). Its genuine closure,
single committed audio, authenticated current restore/tamper rejection and
anonymous bounded NPC fact transfer/nonreplay are software evidence, not a
replacement for the failed native stress bracket. Broader acceptance stays open.

## Keeper capture-readiness correction and limit — 2026-10-06

One source-linked local observer correction replaces its historical readable-hit
latch plus second remote read with a new current public sample returned by the
same readiness query. Missing/stopped/overflow observations fail closed, including
overflow during sampling. Serialized-helper characterization and the maintained
critical suite pass (6files/105,4.07s); independent read-only review passes.
The strict post-image current-source, copy, geometry and identity guards remain.
This is ignored diagnostic tooling, not a scheduler, event-lifetime or game fix.

One justified attempt of the existing `keeper 60000` command on clean `54637ef`
and the unchanged Alpha63 artifact again exits1 at the screenshot bracket.
Probe SHA256 `1acf81900a345c26b9bfb3ee8df3cb5e64925eedf283af273e76c2bf9d309305`;
report `native-keeper-running-54637ef-60000-v2.json` SHA256
`3cbc22d8fa4b4b16fbda62ae38abbf642b43a17cabefb11d8a8125112ef6f2cd`.
Firefox157.0.1, exact same current fixture:1.892s/13states/163callbacks,17readable
samples; before1687ms has three current vocal sources, after1861ms has one.
The inspected image visibly separates keeper speech, flock cue and retained
physical caption; its SHA256 is
`da8870d2127ef75d1ac85f98ff7e15fc611f4ec6cc1841c1d03793e337995735`.
At most4candidates/3labels and12DIRECT public humans; two transient tuple timing
mismatches, no recorded overlap/overflow or unexpected console/lifecycle errors.
Owned browser/profile cleanup passes. Requested60s, continued-save and expiry
assertions were not reached. Neither capture is a sustained-stress certificate.
No further screenshot retry, extended event or runtime repair follows: this
particular photo is not a mandatory fixture. Actual current contention acceptance
must combine relevant representative runtime/layout/native evidence, without
claiming broad chatter, hardware, hours, saturation or whole-directive closure.

## Current finite wilderness wording check — 2026-10-06

On clean `0df578b`, unchanged Alpha63 production JS `015495e5…c11cd` and local
probe `aa425bdb…5a9b`, the existing command
`caffeinate -i node artifacts/validation/voice-current49/native-play-9cc87d3.cjs
360000 wilderness` passes. Physical START/seed/W and ordinary REST only; no
save, actor, weather, event, position or safe-route injection. Firefox157.0.1,
1440×900/DPR1;361.333s,420→885,295.978 sampled northward tiles,331 public
movement reads/four rests. Sampled exposure is339.963s moving/12.766s recovery/
7.295s stationary, with no ADRIFT or terminal recovery. These are public sample
categories, not exact continuous distance or equal-work/performance evidence.

The362.604s bounded census has2619 reads/14 distinct retained candidates: five
player lines, three animal calls and six physical sounds, no incomplete/overflow
or raw-trace truncation. Five player lines use three wordings; **That was close.**
appears at29.244/31.250/36.010s, followed by **Nearly had me.** at46.259s and
**Still here.** at358.980s. Long gaps support finite sparse presentation, not
acoustic silence; the short near-fall repetition cluster remains a concrete
quality finding. Current `situatedExpression.ts:selectRealization` independently
hashes each event. `playerExpressionRecency.ts` preserves only the existing
12/16-step footing meaning locks, so distinct committed slips can repeat quickly.
Investigate optional footing reannouncement eligibility at that bounded owner;
do not change physical incidents, contact sounds or authenticated saved line keys
to hide the finding. No such gameplay repair is implemented by this observation.

Terminal Chart image is inspected, with no active acoustic-caption wall. Report
`native-wilderness-0df578b-360000-v20.json` SHA256
`a6631b1912ce62a206c8eb4ff21fef531047d04261157d9c5b44f73ff678d4f1`;
PNG `93b699fa5047023bcc543f8df5d53cb4e5450578dd9c3cfda8dade8a6550acd1`.
Console/lifecycle and owned browser/profile cleanup pass, apart from the one
known CSP probe denial. No actual audio/AT hardware, hours, saturation,
current-save reload, performance or whole-directive closure claim follows.

## Current Voice native selection and caption check — 2026-10-06

Bounded tooling/evidence slice over `1c3f477`, unchanged Alpha63 game artifact.
Second-GREET failure diagnostics now bracket the one actual native canvas
click and observe the timeout separately: public projected selection/knowledge,
two resident positions, tick/frame/time and bounded DOM hit/control metadata.
No retries, forced selection, clock stop or caption extension were added.
Selection publishes synchronously, but recognition awaits the real queued
observation and DOM rendering follows separately. These observations can narrow
a failure; they do not establish exact click-time camera state or a past cause.
The selection guard remains intended ID + Recognized + enabled GREET, with a
five-second failure bound rather than a minute beyond the first reading lease.
Browser selftest and maintained critical smoke6files/105 pass (4.07s).

One fresh production Firefox157.0.1 run passes:
`npm run profile:browser -- --paired-greetings --reduced-motion
--presentation-width 390 --presentation-mode relief-3d --output
artifacts/validation/voice-current49/voice-pair-alpha63-selection-diagnostic.json`
with temporary `caffeinate -i`. Harness SHA256
`b5db38aaefc298027cc25818b4481849901412ab6ca36ac6764b6a9c80d988c3`;
game JS `015495e5529937a4797eb68d6bf5aa0343f27bb294dc6c7e49329e380f6c11cd`;
report `cde7eaacc37ec46711df8ee655645c64ef43b696d52d5a08e49f6b3b69906d04`.
The capture identifies dirty tooling over that HEAD, not a clean commit.
Real greetings commit424/426 while ordinary simulation continues between them;
the inspected image has two distinct, nonoverlapping source labels and separate
caption/ordinary feedback. Actual47/60-code-point reading leases last2243/2864ms
against2239/2858ms requirements, one announcement each. Both expire, current
save reload preserves both learned ABOUT records, and neither replays across
the existing eight post-restore absence checks. Only one live compact layout
was captured; this is not the eight-state live matrix or physical mobile proof.
No unexpected browser error or CSP increase; owned browser/profile cleaned.
The intermittent prior selection failure's cause remains unknown, not fixed.

The prior clean-HEAD normal-motion1280Chart single-GREET check also passes on
the same game artifact with the earlier unchanged harness4bbada5d…65a507.
Report `voice-chart-alpha63.json` SHA256
`9a77feaf4c0d6bbd7fec07e60b46e333d496ade20e42d93eefc80949fc53bf9c`;
actual47-code-point caption lasts2243ms, readable canvas speech/caption inspected,
and current-save facts survive without replay. These are finite latest-artifact
presentation/lifecycle witnesses, not mixed animal/physical coexistence,
audible AT/audio, whole-root equivalence, crowd/soak/performance or release gates.

## Finite Voice reload-control check — 2026-10-06

Local harness repair over `507468e`, not a gameplay/release change. After the
compact capture reload, the native title/CONTINUE path now settles two render
frames and requires the enabled target's rounded pointer center to hit that
control or its child inside the viewport. One real click must produce matching
runtime and dialog state. Failure reports bounded target/overlay diagnostics;
it does not inject dispatch, override title state or retry a failed click.
Synthetic helper/selftests and critical smoke 6 files/105 tests pass (4.05s).
This characterizes readiness, not proof of the old failure's exact cause.

Actual production Firefox 157.0.1 command:
`npm run profile:browser -- --voice-presentation --reduced-motion
--presentation-width 390 --presentation-mode relief-3d --output
artifacts/validation/voice-current49/voice-single-alpha63-postreload.json`
with a temporary `caffeinate -i` assertion passes. Artifact JS SHA256
`015495e5529937a4797eb68d6bf5aa0343f27bb294dc6c7e49329e380f6c11cd`;
harness `4bbada5d2973e19f83281ed046d48e4e2392145f76dac8e0d5d791b21e65a507`;
JSON `7dba4f913ec6aa24104d8b7dab3d41c32a1fa4c8fde6d85e77d6e9dd9c3468cd`.
Capture identity records dirty tooling/docs over that HEAD, not a clean-source
certificate. Actual GREET commits at424, expires430, reload resumes431.
The 47-code-point caption requires2239ms and was visible2331ms; announcement
count1, current-save learned facts/ABOUT preserved, expired cue never replayed.
The inspected 390px image contains a separate readable world label and caption.
Post-restore absence is checked in both views/four sizes, but only one live
caption layout was captured; this is not the eight-state matrix or hardware,
audible AT/audio, performance, all-root equality or long-play certification.
No unexpected browser errors; owned browser/profile cleanly removed.

The fresh paired run instead fails reselecting its second moving NPC before
the edited reload path. No completed report exists and it is not called a pass
or proof of a game defect. The earlier paired image discussed below remains
partial evidence. No repeated pair attempt, game change, packaging, dependency
or public deployment accompanies this bounded check.

Later local preview rebuild: after the user quit Alpha62, normal
`npm run package:desktop` passes on `909ef27` (sync, typecheck, Vite and Forge),
producing macOS arm64 Alpha63 with the same JS identity above. ASAR SHA256
`63cea4f8c27303ed9a27f351ed1223701e9c4fb89dce017d524700774ea978b9`
contains only10 permitted runtime entries. The existing `npm run smoke:desktop`
against that generated executable passes through hardened `app://` serving,
desktop/compact/title controls and its current-save probes, using disposable
data and fresh screenshots. Renderer warnings/navigation/resource failures
are empty. This is a local packaged preview, not ZIP/install/signing, another
platform, a performance certificate or public deployment; real saves untouched.

## Finite current animal-source audit — 2026-10-06

Current cause/semantic review plus
`npx vitest run src/game/dogSignalExpression.test.ts
src/game/coreWildlifeSignalExpression.test.ts
src/game/coreWildlifeWeatherDistressExpression.test.ts
src/game/coreWildlifePursuitExpression.test.ts
src/game/coreEcologyAggregateAudio.test.ts --maxWorkers=1`
passes 5 files/80 tests in4.71s over the unchanged game source at `507468e`.
The existing guardian, species alarm, cat-rain and fox-pursuit adapters bind
voices to exact committed causes; continued shelter/rain/pursuit states cannot
mint routine repeated calls. Species-appropriate semantics and quiet-versus-
warning policies stay source-bound. Aggregate frog chorus requires real active
rain-chorus intensity and24-tick cadence; rat rustle is physical redistribution,
not an invented rat voice. Shared hearing tests refuse out-of-range/masked cues.

Existing runtime tests separately contain the guardian's forty-step continuation
and step19 reload trace, real rain-masked unheard-cat negatives and lawful human/
dog frog hearing. Those long fixtures were inspected, not rerun here. The DEV
repetition report counts captured admitted vocal decisions, not every world
sound, audio release or refused event. This finite audit finds no new producer
defect; it does not establish sustained ordinary call rates, hours-level spam
acceptance, every-species runtime coverage or whole Living Voice completion.
Future repertoires stay future-owned; no new mechanics or audit subsystem.

## Water-motion readability and current-sight labels — 2026-10-06

Local source repair over `f1a4324`, not a release or directive closure. The
earlier water shader genuinely animated vertices, but its ordinary 24-unit
tile lift was only 0.072 calm / 0.1869 in the retained faster-flow fixture.
At the ordinary camera distance this is subpixel geometry, not convincing
visible undulation. The same shader/triangles now use a six-unit/quarter-tile
cap, a 35% calm floor, and the unchanged lawful flow-derived rate. Blue facet
shading is stronger; current-direction strokes clear the decorative crest.
There is no new geometry, draw pass, physical tide or save mutation.

Finite production Firefox WebGL2 check: existing ignored `water-probe.cjs
motion-visible-v2`, served actual `/tideweft/` files, five synthetic renderer
fixtures including broad blue water with no white current strokes. JS SHA256
`911765194a7d969cff2a082abf5443041c15f3d92430ab597f656ff1a783fdd0`;
actual linked lift 2.1 calm / 3.198045 faster flow. Uniform phase advances;
reduced/hidden cases make no further shader binds. Paired images inspected;
fixture tick/terrain unchanged, zero unexpected errors, owned browser/profile
cleanly removed. Pixel totals also include sky and other presentation: they
are not isolated wave, GPU-time, FPS or gameplay evidence. The first smaller
3.6-unit-cap draft was replaced before completion; no cost claim is inherited
from the older Alpha62 measurements below.

The concurrent finite Voice audit found an exact call glyph persisting after
current sight was lost. Projection now gates nonself vocal and heard-visible
physical anchors through the validated current DIRECT field, retaining
lawful captions/audio/knowledge and self/tactile localization. Characterization
was RED before the fix; source-auth fixtures now establish real current sight,
with heading loss, stale-mask refusal, physical/tactile and full-cone controls.
The mixed runtime positive fixture retains its genuine fall and all four
source/hearing/cargo assertions, but supplies a real downhill sight corridor:
its former isolated low landing genuinely hid the guardian behind higher land.
No actor/world admission, acoustic timing, schema or dependency changes.

Focused source checks: 12 affected files/356 tests pass, plus current release/
manual checks 2 files/30 after updating version73 assertions and explicitly
retaining the historical Alpha62 record test. Actual mixed/pending-restore
runtime controls 2 selected pass; late rollback/reduced-output controls 2
selected pass. Critical105, context28, release-sync39, production typecheck/
build and nested static smoke pass. Alpha63 metadata is a local preview only.
Correction after source and retained-image inspection: the attempted compact
native paired-GREET recheck captured both greetings, observed their expiry,
saved and reloaded before timing out at the post-reload title-menu click. The
retained 390px image contains both speech labels, but no completed JSON report
exists; a full post-repair caption/reload pass is still not claimed. The earlier
description of failure before any greeting was incorrect. The prior clean
`f1a4324` compact pass remains pre-repair evidence.
The user's Alpha62 app is still open and untouched; desktop replacement/smoke,
current performance, hardware, cumulative and public release gates remain
unrun. No dependencies, upstream source, supported formats or save policy change.

## Flow-informed decorative water motion — 2026-10-06

Local Alpha62 candidate over `4f7b189`; no public release or Living Voice
closure. One optional p5 material applies bounded positive vertex lift and a
small interpolated blue glint to the existing water triangles. It consumes the
first eight existing nearby, disclosed current cues, not hidden terrain or a
new velocity simulation. Shared hydrology strength increases amplitude/rate;
heading length is not speed. Reduced motion and unsupported shader contexts
retain the still opaque surface. Physical free surface, depth disclosure,
Chart, authority, save format50 and dependencies are unchanged.

Before/after artifacts are identified separately from their dirty source tree:
Alpha61 ASAR `63ea252cad4a0bae81fac5c4be2f142bbbea5ea99acf4c8e321aea3280da4857`,
web JS `13abc61b69df2df3249d2419fe130b2f405b2981c092dd8ec8302dccb5c77bba`;
Alpha62 ASAR `358b19d2c00bb53166502c8bbf3858a5b57b387e63a13ea7e0c9bf39a4251538`,
web JS `cca477bbb4c7558f35b4d32e85c25abb61ee8616fdabdeb5951d4bc7d3e5cf50`.
Frozen binaries remain unchanged during sampling. Two 15-second estuary Relief
windows per artifact/platform use the existing `profile:baseline` executable,
`--scenario estuary-desktop-relief --sample-ms 15000`, then `profile:browser`
with each matching packaged baseline. Host: AC Apple M4/10 logical cores/16GiB,
Low Power Mode0, Node22.20.0, Electron44.1.0/Chromium152 and Firefox157.0.1;
1440x900 CSS, existing 30-frame warm-up and unchanged quality. Normal user
Firefox was left open; background contention remains a limit. No CPU sampler,
GPU timing or presented-frame measurement. Local ignored outputs are under
`artifacts/validation/water-motion-4f7b189/`.

Finite triage criterion recorded before AFTER: real linked/visible motion,
paired-mean draw increase <=5%, no consistent callback-rate loss >5%, and no
visual/authority regression. This is not a full performance transition gate.

| Platform / artifact | Draw means, ms | Draw samples | Renderer callbacks/s | p99 / worst callback gaps, ms |
| --- | --- | --- | --- | --- |
| Electron before | 24.415 / 25.172 | 516 / 500 | 34.31 / 33.28 | 124.7 / 145.3; 124.4 / 141.7 |
| Electron after | 24.088 / 25.255 | 524 / 501 | 34.83 / 33.28 | 118.7 / 145.2; 118.6 / 145.6 |
| Firefox before | 20.846 / 20.379 | 482 / 486 | 31.47 / 31.88 | 184 / 222; 180 / 209 |
| Firefox after | 20.610 / 20.795 | 490 / 479 | 32.11 / 31.35 | 178 / 186; 180 / 202 |

Paired-mean draw delta: -0.49% Electron, +0.44% Firefox; callback-rate delta
+0.77% / +0.18%. These are within repetition noise, not optimization gains.
Intervals/draws fit the existing bounded4096 store; empirical nearest-rank p99
is short-window evidence only. Actual windows15.02–15.31s; Electron accepts149
fixed steps/14 world advances in every window, Firefox151–152/15. Matching
counts alone are not equal-state proof. All retain72 actors/54 materialized,
22 visible,4 visible wildlife and950 aggregate units. Post-window saves remain
1,891,170 bytes Electron; Firefox1,888,333–1,888,864 varies with accepted work.
No save occurs in the timed windows. No heap-convergence, long-soak or hitch-
repair claim; existing whole-game callback floors remain unmet.

The actual production Firefox WebGL2 renderer also passes four finite synthetic
public-view fixtures through `/tideweft/`: calm, faster-flow, reduced motion and
hidden water. Linked shader uniforms advance only for ordinary visible water;
amplitude0.072 calm /0.1869 faster flow, with unchanged fixture tick/terrain and
zero unexpected console errors. Paired images show motion; sky/camera/other
presentation can also change pixels, so counts do not isolate water. Manual
inspection preserves blue opacity/depth bands. Fixtures do not establish lawful
gameplay admission or exact per-cell velocity. Focused source tests separately
cover shared-flow derivation, hidden-input refusal, signed-origin continuity,
bounded clocks, shader fallback/context restoration and reduced motion.
Decision: retain the small presentation addition; prolonged/mobile/other-host
certification remains unrun rather than waived.

Final local checks pass: 12 affected files/270 tests, maintained critical
6 files/105 tests, context28 and player-facing39 checks, production typecheck/
web compilation, five-file nested static web smoke, and Macarm64 Forge package
plus the ordinary packaged smoke (no screenshot duplication). Packaged smoke
reports Alpha62 with no renderer warnings, navigation diagnostics or resource
failures. No ZIP, installation, signing/notarization, other-OS, complete
cumulative rerun, remote CI, deployment or exact-live claim.

Artifact cleanup in the same local session permanently removed99,390,405 bytes
of obsolete generated builds, closed checkpoints and superseded captures.
Current fixtures, certificates, accepted evidence and active work remain.
Historical paths remain provenance; deleted captures are not recoverable from
Git, and future comparisons must rebuild or recapture the matching artifact.

## Relief water range-boundary repair — 2026-10-06

Local, unpublished follow-up over `ef6b3df`: a player screenshot exposed a
remaining height discontinuity between nearby and distant water. Source
inspection found neutral undisclosed depth (`0.5`) used as a geometric lift;
bed-corner plus per-cell depth also produced seams. Current simulation instead
defines depth as tide level minus source elevation. The renderer now consumes
that existing free-surface level, separately from depth-colour disclosure.
Land above the plane retains depth-test occlusion; current surface anchors and
masked remembered anchors follow the same land-or-water top. Current bounded
wet-cell batches replace the redundant cached-water-plane eligibility guard.
No hydrology, perception authority, save format or dependency changed.

The corrected regression uses differing submerged beds with depth = tide minus
bed. Before repair it submitted height `52.65` instead of `63.09`; the focused
water-camera selection had one expected failure and four passes. Two surface
sampler characterizations also failed before repair. Final affected validation
passed 10 files / 303 tests, typecheck and the exact critical smoke suite
(6 files / 105 tests); context-tool selftests passed 28. Tests cover invariant
vertices across direct/broad/sounded metadata, tide changes, newly wet cells
with unchanged cache keys, hidden refusal, land occlusion and neutral colours.

Paired Firefox 157 production-WebGL captures use five stopped, display-only
12×12 fixtures with physically consistent tidal depths. The mixed detail
boundary visibly steps before and stays level after; shallow/channel/deep
colours remain distinct on one plane. Both captures passed with zero unexpected
browser errors (the existing startup CSP eval denial is separately recorded).
After bundle `index-BTr0mWhr.js` SHA-256:
`13abc61b69df2df3249d2419fe130b2f405b2981c092dd8ec8302dccb5c77bba`.
The local reusable probe and images are under
`artifacts/validation/voice-current49/water-9751b6b/`, `plane-before` / `plane-after`.
The earlier alternating-bed/uniform-depth fixture was not a physically valid
tidal world and proved only its renderer overlap case, not this fix. Pixel blue
counts include sky and are not exact water coverage or performance evidence.
Static `/tideweft/` smoke passed on the after artifact. These finite render
checks do not certify long play, GPU throughput, future water layering or a
public release; ordinary gameplay/packaged validation is separately recorded.

## Visibility and voice-clarity regression reconciliation — 2026-10-06

The complete suite on frozen `93cc63b` finished with 357/364 files and
4,115/4,128 tests passing; thirteen assertions failed, not timeouts. The failures
used obsolete short-cone, rear-circle, selectable-silhouette or fully
intelligible-storm assumptions after the intentional player visibility and
speech-clarity changes. Corrected fixtures use the current shared recognition
gate and real enabled interaction, retain broad-only selection refusal, and
distinguish committed spoken words/audio from an indistinct public caption.
Actual visible/intelligible warning receipts stay visible; genuine hidden calls
stay anonymous. An awake daylight chicken witness now has one modest physical
intervening crest, not a forged visibility mask. Full darkness removed its
actual alarm cause and a maximal ridge masked its quiet call; both unsuitable
fixture attempts were discarded. Conservation, hearing, exact saved meaning,
late rollback, optional-caption refusal and nonreplaying restore checks remain.

The two historical equal-work hash failures received a full state comparison,
not replacement hashes. Disposable source witnesses at `d3647fa` (before sight
changes) and `93cc63b` each accepted exactly 30 fixed steps / three world
advances for the estuary and density seeds, using the same dependencies and
synthetic clock. Estuary changed only the newly witnessed stock-consumption
announcement's id/message and next id. Density changed only event sequence 7's
`playerObserved` bit. Their required seals changed accordingly; every other
root and field was exact. These changes follow runtime's witnessed-consumption
and event-locus observation owners, not altered production, ecology or custody.
Reversing only those asserted observation outputs reproduces both original
`6215116` v47 digests. Maintained tests keep those hashes, current50 integrity,
empty additive knowledge/recency assertions and exact telemetry-disabled
current-save equality. Focused equal-work cases pass; chicken controls pass
11 tests. Four synthetic saves and diagnostic source witnesses remain ignored
under `artifacts/validation/voice-current49/save-characterization-93cc63b/`;
the temporary old worktree and untracked test sources were removed afterward.

The seven affected files finish with 235 passing tests and two timeouts, not a
clean domain pass. System power records show clamshell/maintenance sleep during
both timed-out unchanged generation cases, including a 971-second sleep inside
the egret witness. Both pass unchanged in a serial focused recheck (39.70 seconds
of tests / 41.66 seconds total), with original timeouts intact. This is scoped
recheck evidence, not a replacement cumulative certificate. Typecheck and the
maintained critical smoke suite (six files / 105 tests) pass.

This reconciliation changes tests and evidence, not runtime, schema, dependencies
or the packaged water repair. The old failed cumulative result is not a current
passing certificate. Broader validation and directive closure remain separate;
none of this establishes hours of play, dense acoustic stress or a release.

## What makes play rewarding and restorative

### Psychological needs beat a pile of prizes

Ryan, Rigby, and Przybylski's studies associate in-game autonomy, competence, and relatedness with enjoyment and willingness to return. Their later model reports that intuitive control mastery is necessary for reaching those experiences but is not sufficient by itself. Design implication: movement must feel clear, then the world must offer meaningful choice, learnable mastery, and human consequence.

- [The Motivational Pull of Video Games](https://doi.org/10.1007/s11031-006-9051-8)
- [A Motivational Model of Video Game Engagement](https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf)

### Restorative games must avoid competence frustration

Tyack, Wyeth, and Johnson found improved competence, affect, and vitality during play after a frustrating task, while in-game need frustration predicted worse post-play affect. Follow-up work found that small decisions and autonomy can contribute to restoration, while competence frustration remains particularly harmful. Design implication: use graded outcomes, recovery routes, clear feedback, and player-selected pressure rather than surprise punishment or erased progress.

- [Restorative Play: Videogames Improve Player Wellbeing After a Need-Frustrating Event](https://doi.org/10.1145/3313831.3376332)
- [“The Small Decisions Are What Makes it Interesting”](https://doi.org/10.1145/3474709)

### Feedback should reveal causality, not replace the activity

Research on “juicy” game feedback points toward legible action–outcome bindings and graded success as important preconditions for competence-supporting moment-to-moment play. Self-determination research also distinguishes informational competence feedback from controlling rewards. Design implication: particles, sound, route illumination, and settlement reactions should explain what the player caused; rewards should unlock expressive decisions rather than command repetition.

- [How Does Juicy Game Feedback Motivate?](https://people.csail.mit.edu/dkao/pdf/3613904.3642656.pdf)
- [Self-Determination Theory and the Facilitation of Intrinsic Motivation](https://selfdeterminationtheory.org/SDT/documents/1991_DeciVallerandPelletierRyan_EP.pdf)

### Challenge should be legible and multidimensional

Studies of game flow support skill–challenge balance, but the evidence is more nuanced than “harder is better.” TIDEWEFT now has one official world ruleset—**A CHALLENGING HARD**—rather than selectable pressure modes or hidden adjustment. Player agency comes from preparation, route choice, recovery, and accessibility settings for input and presentation; those settings never change rewards, hazard probabilities, enemies, loot, or world rules.

- [Skill–challenge balance, expertise, flow, and urge to continue](https://pmc.ncbi.nlm.nih.gov/articles/PMC8943660/)

### Perpetual play needs a voluntary stopping ritual, not a forced session arc

Post-work play research identifies detachment, relaxation, mastery, and control as useful experiences; a diary study links evening-game mastery with next-morning vigor. Research on disengaging from games also reports that players value retained progress, closure, and agency over when they leave. Earlier prototypes exposed Drift, Weave, and Wander session shapes, but that direction is superseded: the live design is one perpetual world and one ruleset. **Quiet Hour** is the voluntary save-and-recap ritual; it stops local simulation without advancing time offline, imposing a timer, or declaring a quota.

- [Digital Games as a Context for Recovery from Work Strain](https://orca.cardiff.ac.uk/id/eprint/131795/)
- [Evening Gaming, Recovery, and Next-Morning Vigor](https://doi.org/10.1111/apps.12519)
- [Disengagement From Games](https://arxiv.org/abs/2406.00189)

Large-scale telemetry research has found little evidence that hours played alone cause changes in well-being; player motivation and the fit between play and life matter more. Design implication: success is a satisfying chosen session, not maximum session duration.

- [Oxford Internet Institute — play time and well-being](https://www.oii.ox.ac.uk/major-new-study-finds-little-evidence-for-causal-connection-between-well-being-and-video-game-playing/)

## Initial synthesis: the honest reward stack

| Horizon | Objective | Interesting action | Reward that changes play |
| --- | --- | --- | --- |
| 1–10 seconds | Read terrain and keep momentum | steer, scan, brace, choose a line | responsive motion, stable cargo, revealed information |
| 1–5 minutes | Reach a landmark or solve a local hazard | reroute, rest, build, share supplies | safer trace, discovery, cache, named rescue |
| 10–25 minutes | Complete a promise | choose cargo and route, adapt to weather | visible project progress, trust, route strand, new option |
| 1–3 sessions | Stabilize a corridor | sequence complementary deliveries and infrastructure | autonomous porter traffic, settlement specialization, mutual aid |
| campaign | Weave a resilient archipelago | shape network topology and relationships | communities solve problems without the player; unique chronicle |

The stack intentionally excludes paid/randomized rewards, daily streaks, expiring chores, offline decay, and empty numerical inflation.

## Technical research

### One renderer, two launch targets

The current official guidance supports a browser-first architecture. p5.js 2.x can be installed as an npm module and instantiated on a specific mount element. Vite can emit relative asset paths with `base: './'`, allowing the same artifact to work below a GitHub repository subpath and under a standard Electron custom scheme. Browser and desktop must therefore share the exact renderer; Node/Electron imports are prohibited from game and simulation code.

- [p5.js releases](https://github.com/processing/p5.js/releases)
- [p5 constructor / instance mode](https://p5js.org/reference/p5/p5/)
- [Vite public base path](https://vite.dev/guide/build#public-base-path)
- [Vite static deployment to GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)

### Electron is a privilege boundary

Electron recommends context isolation, process sandboxing, no renderer Node integration, restrictive content policy, current framework versions, bounded navigation/window creation, and narrow validated IPC. It also recommends a custom protocol over `file://`. TIDEWEFT initially exposes no preload API: its local game bundle runs with ordinary browser capabilities, and its save data lives in web storage under a standard secure `app://` scheme.

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol/)
- [Electron packaging guidance](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)

### Deployment is build-gated

GitHub Pages is a static host. A Pages workflow must build before upload and needs explicit Pages/id-token permissions. Cloud saves or real asynchronous multiplayer would require a separate future backend; personal traces and seed-based share URLs remain honest static-site features.

- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

### Version resolution note

The initial exact stack is p5.js 2.3.2, Electron 44.1.0, Vite 8.2.2, TypeScript 7.0.2, Vitest 4.1.11, and Electron Forge 7.11.2. Research initially found Vitest 4.1.10, but npm's current optional-peer graph failed under npm 10 while 4.1.11 resolved cleanly. Forge 7.11.2 declares the 1.x Electron fuses API, so the project pins compatible `@electron/fuses` 1.8.0 rather than forcing the current 2.x API through a peer conflict.

### Production p5 policy experiment — 2026-10-01

**Scope:** bounded, local, unpublished runtime integration work. Before source
checkpoint `19408a68ff6349ec1798a0b8c688211ac391b089`; retained application fix
`a429993`. The starting tracked tree was clean. No gameplay producer, save
schema, simulation cadence or release identity changed. Whole-game performance
closure still requires the final implemented workload, stress and soak evidence.

**Dependency and configuration record:** DEPENDENCY CHANGES: NONE.
`package.json` and `package-lock.json` remain the installation authorities.
There is no override, patch, fork, transitive change or `node_modules` edit.
Application configuration: NONE; Electron, Vite, Forge and Pages settings are
unchanged. Upstream library source modified: p5.js NO; Electron NO. A clean
isolated reinstall was not run in this pass; installed exact versions matched
the manifest/lockfile without replacing the working installation.

**Observed bottleneck and hypothesis:** a separate 20-second, 1 ms CDP CPU
profile attributed about 3.43 seconds of inclusive sampled CPU time to p5
parameter validation/schema parsing. Production already requested disabled
Friendly Error validation, but the pinned Strands addon restored its module-load
flag after object-form `Shader.modify`. This silently reenabled repeated
validation for both p5 views. Preserving the configured flag should remove that
diagnostic work without changing drawing or simulation.

**Application implementation:** `src/render/p5RuntimePolicy.ts` adds
`preserveP5RuntimePolicy`; `p5ReliefSketch.ts` wraps lazy perception material
modification in it. `finally` restores the entry policy on success or failure.
Focused tests cover the true/false policy, return identity, original thrown
error and the actual integration boundary with a flag-resetting modifier.
The installed addon behavior was also reproduced directly using its exact
object-form wrapper. Shader strings, geometry, draw order and arguments do not
change. The after diagnostic contains no sampled validator stack.

**Upgrade constraint:** recheck the public flag and object-form modifier
against the exact upgraded p5 source. Remove the preservation boundary only
when supported behavior and the integration test establish that it is redundant;
rerun web and packaged desktop checks. No upstream patch needs maintaining.
Sources: [p5 public policy](https://p5js.org/reference/p5/disableFriendlyErrors/),
[public shader modification](https://p5js.org/reference/p5.Shader/modify/),
[versioned Strands implementation](https://github.com/processing/p5.js/blob/v2.3.2/src/strands/p5.strands.js).

#### Environment and comparable workloads

AC-powered Apple M4 MacBook Air, 10 CPU cores, 8 GPU cores, 16 GiB, macOS
26.5.2 / Darwin 25.5.0. Low Power Mode was off. Initial battery captures were
excluded after the operator identified the power difference. CoreGraphics
reported a 60 Hz main-display mode; requested p5 cadence was 60 Hz. Build shell
Node was 22.20.0/npm 10.9.3, within the manifest engine range; CI selects
`.nvmrc` 24.20.0. Electron 44.1.0 reports Chromium 152.0.7977.65 in its runtime
user agent and bundles Node 24.19.0; these are separate runtimes.
[Electron release metadata](https://releases.electronjs.org/release/v44.1.0)
records the bundled versions. Firefox 157.0 was tested headless.

Both artifacts were production builds, independently frozen before timing.
Existing fixtures/harnesses were reused with 30 renderer warmup frames, 20 s
stationary windows and a 210 s ordinary travel window. Estuary seed:
`runtime baseline estuary`; dense seed: `breathing room regional density 8`;
travel seed: `breathing-room all-tide corridor 187`. Stationary inputs were
none; travel used the existing bounded ordinary movement sequence. Quality,
camera, actor budgets and viewport were held constant per scenario. Desktop
viewport was 1440×900; mobile cases used the existing emulated viewport, not
mobile hardware. Actual active Electron Relief was WebGL2, CSS 1440×900 and
backing 2160×1350; Chart backing was 2880×1800. Density was selected at setup
from the physical display before profiler DPR emulation. No density or
antialiasing option changed.

Source mode: Chart P2D, Relief WEBGL, title Canvas 2D. Existing-context
diagnostics confirmed packaged Relief WebGL2 with antialias, depth, stencil
and preserveDrawingBuffer enabled. A separate capability query reported ANGLE
Metal / Apple M4. Browser-process CDP diagnostics for both actual packaged
launches also reported GPU compositing, rasterization and WebGL enabled on
ANGLE Metal / Apple M4; these status reports do not time presented GPU frames.
Firefox reported a privacy-reduced Apple renderer. There are no application
Graphics/framebuffers, offscreen passes, workers or pixel readbacks to migrate.

The existing packaged profiler uses explicit scheduling/occlusion overrides
only in its opt-in diagnostic launch. Normal launches retain their existing
throttling behavior; no flags or acceleration bypass were added. Trusted input,
viewport and lifecycle guards passed. Confirmation timings had CPU sampling
and hitch tracing disabled, while bounded existing telemetry remained enabled.

#### Before and after

Rows below are individual comparable full-matrix runs. FPS means renderer
callback-count throughput, **not verified presentation FPS**. Draw means CPU
time inside drawing, **not whole GPU frame time**. Interval p99 and worst use
the existing bounded, edge-censored renderer samples.

| Packaged Electron scenario | Callback FPS before → after | Draw mean ms before → after | Interval p99 ms before → after | Worst gap ms before → after |
| --- | ---: | ---: | ---: | ---: |
| Estuary desktop Relief | 55.33 → 55.75 | 8.57 → 6.56 | 92.0 → 89.5 | 126.6 → 122.3 |
| Estuary desktop Chart | 53.28 → 55.43 | 14.68 → 7.28 | 102.9 → 97.4 | 142.1 → 131.0 |
| Estuary mobile Relief | 55.98 → 55.95 | 6.55 → 5.56 | 89.6 → 90.1 | 118.3 → 118.0 |
| Estuary mobile Chart | 55.89 → 55.55 | 5.44 → 3.22 | 95.2 → 98.8 | 129.6 → 131.9 |
| Dense Relief | 54.52 → 54.80 | 9.52 → 7.36 | 106.0 → 104.0 | 143.1 → 139.9 |
| Dense Retina Relief | 54.63 → 54.93 | 9.31 → 7.23 | 107.9 → 106.0 | 143.9 → 136.8 |
| Continuous regional travel | 36.61 → 45.10 | 9.90 → 6.94 | 60.9 → 57.9 | 202.6 → 105.2 |

Desktop Relief repeated means were 8.57/7.36 ms before and 6.56/6.17 ms after:
the median of two per-run means was 7.97 → 6.37 ms, **20.1% lower**. This is
not a per-frame median. Stationary callback throughput stayed around 56/s.
Travel throughput and tails improved in one pair; that broader result has not
been repeated and is exploratory. Desktop before/after completed the same
199 fixed steps per stationary sample and 2099 for travel, identical start
projection hashes, actor counts, world ticks (420→439 / 420→629), travel
distance/end locus and zero discontinuity/projection-mismatch witnesses.

| Production Firefox, headless | Draw mean ms before → after | Callback FPS before → after | Interval p99 ms before → after | Worst gap ms before → after |
| --- | ---: | ---: | ---: | ---: |
| Estuary, repetition 1 | 7.40 → 5.40 | 47.72 → 48.44 | 165 → 157 | 189 → 198 |
| Estuary, repetition 2 | 7.04 → 5.55 | 47.24 → 47.45 | 158 → 162 | 178 → 195 |
| Estuary, 60 s confirmation | 6.94 → 5.30 | 48.76 → 49.87 | 169 → 165 | 253 → 206 |

The median of these two browser per-run draw means was 7.22 → 5.48 ms,
**24.1% lower**. Browser world ticks matched 420→440, but terminal fixed-step
counts varied (201–208), so these wall-clock runs do not prove identical final
session bytes. Browser callback FPS and tail improvement are not established;
short candidate worst gaps were longer. The 60 s pair matched 602 fixed steps
and ticks 420→480, reduced draw cost by 23.7% and did not repeat that worst-gap
regression. One attempted long candidate capture was rejected by the harness
because documentation changed during its repository-identity window; it was
discarded and rerun with a stable tree. No gain is extrapolated to Safari, ordinary
headed browsers, other GPUs or desktop platforms.

#### Supported zoom and current activity supplements

The reachable gameplay zoom endpoints were also exercised on AC in frozen
packaged builds, using the dense seed, 1440×900 viewport, unchanged quality,
public `renderer.focusWorld`, 2.2 s camera settling, the existing 30-frame warmup
and 20 s measurement. Each pair retained identical initial projection hashes,
actor counts, 199 fixed steps and ticks 420→439. These are single pairs rather
than repeated throughput claims.

| Packaged view / zoom | Draw mean ms before → after | Callback FPS before → after | Interval p99 ms before → after | Worst gap ms before → after |
| --- | ---: | ---: | ---: | ---: |
| Relief wide / 0.38 | 13.24 → 9.29 | 50.08 → 52.65 | 145.0 → 137.8 | 212.0 → 197.5 |
| Relief maximum / 3.2 | 5.56 → 4.89 | 54.58 → 54.79 | 111.9 → 107.7 | 165.6 → 170.0 |
| Chart wide / 0.58 | 29.92 → 16.60 | 25.60 → 42.24 | 182.1 → 177.4 | 223.4 → 248.0 |
| Chart maximum / 2.4 | 6.04 → 3.52 | 53.68 → 51.65 | 132.5 → 114.8 | 156.1 → 360.4 |

The maximum-Chart candidate window also recorded a 345.1 ms world tick.
A longer 60 s matched recheck did not repeat that outlier: draw mean
5.76→3.11 ms, callback FPS 53.62→54.58, interval p99 121.7→113.5 ms,
worst gap 239.6→144.9 ms, with identical 599 fixed steps and ticks 420→479.
This diagnoses an odd sample without claiming that all frame spikes are fixed.
Wide Chart remains a costly workload; its measured 42.24 callbacks/s does not
meet the default-scene 45/s guardrail, which was defined for different fixtures.

The local supplement also collected callback-interval quantiles. Browser rAF
p50/p95 was 16.7/33.3→16.7/18.4 ms for wide Relief and
33.3/50.4→16.7/33.4 ms for wide Chart. Maximum-zoom p50 remained 16.7 ms;
p95 was about 18 ms in both builds. These are edge-censored scheduling proxies,
not presented-frame or GPU quantiles; default-matrix p50/p95 remains uncollected.
Candidate screenshots at all four endpoints were visually inspected for
terrain masking, actors, labels and HUD information.

Dense fixtures contained 22 materialized wildlife, but zero directly visible
wildlife and only three visible actors. They prove near-cap simulation work,
not a visually crowded or saturated acoustic scene. A separate current-game
Firefox bout used trusted charged Space scans and 800 ms W movement in both
views, then a legal offered resident GREET. It observed one real introduction
expression/acoustic-text candidate in mist, with ordinary water/vegetation
presentation. The same committed caption was inspected in Chart and Relief;
simulation was stopped only for that visual witness, outside performance
windows. No actor, event or future producer was invented. Four-label saturation,
broad alarm migration and final producer stress remain closure obligations.

#### Decision, resource findings and remaining costs

Retain the policy fix: repeat draw-cost reductions exceed the pre-edit 15%
threshold at unchanged quality, with independent stack evidence explaining the
removed work. This pass claims rendering CPU headroom. It does not certify
universal FPS, complete frame-tail repair or whole-game performance closure.
The local finite guardrails were 45 callback FPS for stationary desktop, 30
for travel, renderer p99≤200 ms/worst≤350 ms, draw mean≤25 ms/p99≤50 ms,
fixed-step mean≤25 ms and world-advance mean≤150 ms; Firefox floors/ceilings
were 40 FPS, p99≤250 ms/worst≤400 ms, draw mean≤30 ms and world mean≤230 ms.
These measured metrics passed. Proposed p95 and retention ceilings were not
certified: existing output omits p50/p95 and short heap snapshots do not prove
retained growth. Stop this bounded integration experiment after artifact and
correctness validation; schedule further causal experiments under the existing
performance owner when the implemented workload is ready.

World advances remain the principal stationary spikes: about 87–101 ms in
Electron and 152–164 ms in Firefox. Regional aggregate commit alone measured
about 36 ms in the desktop estuary. A before diagnostic also sampled repeated
water depth-state `getParameter` calls at about 1.41 s self time over 20 s;
these blocking-query costs vary and need a separate state-preservation
experiment. Chart color conversion, unnecessary equal-size resize/DOM updates
and full-state copying are candidates requiring attribution, not implemented
optimizations. Do not replace existing depth-state restoration with an assumed
default or alter the authority cadence to hide these costs.

Main-process responsibilities are lifecycle, secure resource serving and
navigation/permission policy. Shared simulation, p5, DOM and Web Audio run on
the renderer JavaScript thread; saves use IndexedDB with the existing
localStorage fallback. There are no application IPC channels or preload bridge,
so IPC is not a game workload bottleneck. Main-process blocking, GPU/raster/
compositor durations, real input latency, startup timing, actual dropped frames
and tick-debt time series were not measured.

Existing terrain/perception caches are bounded and dispose resources on their
owned invalidation paths. Travel kept loaded terrain at 5 regions and active
ecology at 6, with no pending commands/save workers at the captured endpoint.
Point-in-time heap/ArrayBuffer counts fluctuated, including larger candidate
post-save snapshots; no retained-memory reduction or leak-free long soak is
claimed. No pooling, forced GC, extra canvas layer or resolution tradeoff was
introduced. No quality tradeoffs were implemented.

#### Compatibility and reproduction

Production web compilation and nested-path static smoke passed (613 modules,
5 output files). Candidate JS is `assets/index-CCtf4xYW.js`, SHA-256
`86318c8c83b19969a59d95bca9761bacbc0e6bbd80df9ef73c954eeb7f687502`.
The stopped initial fixture wrote byte-identical complete v47 envelopes in
both packaged builds (1,710,029 bytes, SHA-256
`c2853ae436978bf2c1b3a7363b49dfc93e6161886920ca36980cf41328f2dc3e`).
This is initial-state equivalence, not a claim about every wall-clock endpoint.
The Firefox performance witness loaded this actual output without Electron or
a development server, checked resource/error/CSP guards and wrote current saves.
Interactive Firefox 157 headless smoke passed actual Chart 2D/Relief WebGL2,
trusted brace/orbit input, resize, current-v47 primary/fallback save identity
across normal refresh, title pause/continue and usable context-loss fallback
with simulation continuing. Firefox backing was 1440×900 at density 1;
antialias was false on that existing context, with no application-quality
change. There were no HTTP/fetch failures or window errors/rejections. The
existing startup CSP eval rejection remained one per document; it was not
silenced or fixed by weakening CSP. An isolated native audio-graph witness
reported one running context, advancing clock and five scheduled oscillators.

Extended activity audio is separately **BLOCKED** in the tested Firefox environment:
both headless frozen before and candidate builds kept a native context suspended at
time zero, with the optional public title-cue resume promise pending even after
trusted pointer input. Protocol activation and a real gesture retry did not
resolve it; the cause was not attributed. The initial extended probes timed out
and remain failed records; subsequent bounded diagnostics preserved the
successful activity observations and reported audio as blocked. No autoplay
preference, audio fallback or shipping behavior was changed. A disposable
headed Firefox 157 candidate probe also passed initial loading, both views,
trusted input/orbit/resize, scans, movement and caption inspection, but reproduced
the suspended context and pending resume. The cause therefore cannot be assigned
to headless mode alone. No matched headed performance result is claimed.
Extended-session audio remains unverified; audible hardware output was NOT RUN.
Safari 26.5.2
automation was NOT RUN because Allow Remote Automation was disabled; browser
settings were preserved. Chrome and other supported browser/device targets
were not available for this pass.

The complete awake `caffeinate -i env CI=true npm run test:ci` run at
`49069a3e420f897ae22a787b8392ea592b6fa923` finished **FAIL**: 353/354 files and
3498/3499 tests passed in 1893.19 s; context-index 23 and player-facing policy
39 self-tests also passed. The sole failure is the Alpha-22 source-convergence
expectation in `src/game/livingSpeciesReleaseGate.test.ts`: current sound
implementation violates its historical sound-unimplemented predicate. The
same 32-pass/1-fail focused result reproduced in a clean detached worktree at
the untouched starting `19408a6`; all game/release-gate sources are unchanged
by this pass. This preexisting gameplay/evidence-owner issue is handed back
without changing the gate, test or historical directives. No clean cumulative
certificate or release readiness is claimed. An earlier interrupted full run
was invalidated by recorded host sleep; its four long integration timeout
failures did not recur in the awake run. The temporary idle-sleep assertion
changed no permanent power preference or shipping behavior.

macOS arm64 compilation, normal Forge packaging, generated-app launch and ZIP
generation passed. Packaged smoke verified a runtime-only 10-entry ASAR,
Node globals absent, views, keyboard/touch brace, resize, title/menu transitions,
gameplay transactions and current-save/reload scenarios, with no reported
resource/navigation/renderer errors. Desktop and compact screenshots were
visually inspected; this is scene verification rather than pixel equality.
The final make ASAR matches the launched candidate SHA-256
`a7c618df8c8cf754ffc2688749f45bc2db2b9f06c5b0557e0f4def0b0c3a87cb`.
No installer is configured; installation and signing/notarization were NOT RUN.
Linux, Windows and macOS x64 packaging/launch were NOT RUN (no compatible
runner in this environment).

Pages configuration was inspected and preserved: `.github/workflows/pages.yml`
uses npm CI and `.nvmrc`, validates and uploads only `dist/`, then deploys to
the Pages environment on main pushes/manual dispatch. Vite retains `base:'./'`.
The actual project path is `/tideweft/` at
`https://19koda19.github.io/tideweft/`; no custom domain, router or service worker
is configured. Local static artifact smoke passed. Pages deployment and exact
deployed candidate verification were NOT RUN: this pass did not push/publish.
No workflow trigger, permission, artifact destination, storage namespace,
security boundary or update policy changed. Synthetic profiles and ignored
local diagnostics kept private planning, credentials and real saves out of
the five-file web output and runtime-only ASAR.

Reproduce with the exact before/after source checkpoints and installed lockfile:

```sh
npm run build:web
npm run smoke:web
npm run package:desktop
npm run profile:baseline -- --executable <generated-executable> --sample-ms 20000 --output artifacts/performance/<matrix>.json
npm run profile:baseline -- --executable <generated-executable> --scenario estuary-desktop-relief --sample-ms 20000 --output artifacts/performance/<repeat>.json
npm run profile:browser -- --packaged-baseline artifacts/performance/<matrix>.json --sample-ms 20000 --output artifacts/performance/<browser>.json
npm run smoke:desktop -- --executable <generated-executable>
npm run make:desktop
```

Run one measurement at a time on AC power after warmup, retain artifact/harness
hashes and disable CPU sampling for confirmation. Existing benchmark commands
remain the lightweight regression entry points. Focused renderer tests passed
4 files/161 tests; the explicitly reconstructed six-file critical smoke passed
97 tests. No completed directive or gameplay resumption point was changed.

### World-advance encoding experiments — 2026-10-02

**Result: INCOMPLETE; no production repair retained.** Two small application
experiments were characterized and measured, then removed because the complete
frozen retention/no-regression criteria were not established. This is local,
unpublished investigation evidence, not hitch resolution or a release.
Starting executable `62151169cb6eed3a87cc2203a374820795a9ea31`; candidate-1
commit `eaaf2d7`, characterization checkpoint `c08b540`, restored executable
checkpoint `c1f7cd0e6d3ac59a61a21a9cf2375615d491552f`.
The final production sources are byte-identical to the starting checkpoint;
only five test files retain characterization. The earlier historical release
gate issue was already repaired by `87272db`; it was not an outstanding
prerequisite or changed in these experiments.

#### Operation, attribution, and scope

The operation is `src/game/runtime.ts:frame → runTickFailClosed → tick`, not
just `src/sim/engine.ts:stepWorld`. The 100-ms authoritative player step
accepts ten steps per advancing world tick/civil minute, with six ordinary
catch-up steps per renderer callback and an autosave every 600 world ticks.
`worldAdvanceStep` includes the fail-closed checkpoint, pre-world player and
sensory work, world/actor/ecology commits, post-world presentation, interval
closure and any due save preparation. Committed audio releases after the
successful transaction and timing-finally boundary. No cadence, debt, pause,
background, quality or transaction rules changed.

The inspected ordering is ecology/perception, world and resident simulation,
completed views and local/regional actors, ordered mortality/resource claims,
post-arbitration aggregate perception and V6/V1–V5 commit, circadian/resource
commit and updated view, Voice/aftermath, player reconciliation/presentation,
interval closure/save preparation, then committed audio. The five existing
disjoint phase spans do not cover this entire operation. Simulation,
presentation, audio and browser save preparation share the renderer JS thread;
`saveWorkerRunning` is an async queue drain, not a worker. Electron main
lifecycle/resource serving is not on this reviewed path. Relief already uses
WebGL; Chart intentionally uses Canvas 2D.

The source-mapped diagnostic before the experiments sampled 19 advances over
20 seconds at requested1-ms/actual mean1.25-ms sampling. V6 active commit accumulated461.600
inclusive ms (~24.29/advance), including309.413ms of util encoding/hashing leaf
work (~16.28/advance). All world-window util leaves accumulated512.517ms
(~26.97/advance). Subsequent presentation was a separate326.170ms sampled owner
(~17.17/advance). Inclusive ancestors overlap and must not be added. The
NavigationStart-based profiler/page alignment was approximate, not a paired
clock calibration. Large native structuredClone samples belonged to p5 drawing,
not evidence for removing rollback cloning. These are measured attribution
leads, not exact function durations or removable-work totals.

Implementation coverage: relevant runtime scheduler/world transaction,
canonical ecology/binding/receipt owners and downstream view/streaming/
presentation/save/platform blocks were inspected; the source/import inventory
was surveyed. Not every body of the large runtime, every module/test or every
historical ledger was read in full. Existing caches, prepared receipts and the
previous p5 policy repair were preserved rather than proposed as new work.

#### Frozen artifacts and method

AC Apple M4 MacBook Air,10logical cores/16GiB,macOS26.5.2,LowPowerMode off;
build Node22.20.0/npm10.9.3, Electron44.1.0/Chromium152.0.7977.65, p5 2.3.2,
Firefox157 headless. CI's unchanged .nvmrc selects24.20.0. Display refresh and
presented-frame/GPU timing were not freshly measured. There were no concurrent
profiler/test jobs during performance captures. Existing30-frame warmup,
1440×900CSS and unchanged quality were used; Electron Relief2160×1350/
density1.5 and Firefox DPR1. Diagnostic scheduling flags remain harness-only.

BEFORE ASAR SHA256:
`d14d63a50ed3c24a74ee12f71fed2876dab47f7876cdb39467032c036ce644d9`;
BEFORE/final JS SHA256:
`59d688322ef317cb117042249cab9aaa30cd096cef4292d0a8a19548e914f338`.
Candidate1 ASAR:
`e3d091f44dc2cf28f97f9e4e90fae87f305bdb8c941b40e0124c10b84a5b5e1f`;
JS:
`cd07cd936e512ffcd428ea77b923a12c03e04d80bd1013cff94158a62f80e59c`.
Candidate2 ASAR:
`b50effbeb3ab636b8c95f851a376a931c1e132c1ed9666a7875744623f3741c5`.
Baseline harness SHA256:
`dd120175a93f61808d2f40e33b84998042170b3f5f8bd4c2fc46773adbc7f3d2`;
browser harness:
`83cc78ee40fe21c3275b0d5971d4076022753a9cff2dd447f04b0f9ae310b4cc`.
Synthetic frozen builds, JSON captures, validation logs and pre-edit budgets
were captured under `artifacts/world-advance-repair/`, then recoverably archived
outside the checkout during the cleanup noted above. They are historical local
evidence, not shipped telemetry, fixtures or build assets. The current cumulative
certificate remains in `artifacts/validation/`.

Before editing, completion ceilings for world-step mean/p95/p99/max were
50/70/80/100ms Electron estuary,60/80/90/110ms dense and70/90/100/125ms Firefox.
Retention required ≥2ms **and** ≥2% repeated mean improvement on each tested
product plus no correlated-tail/input/throughput regression. Missing metrics
remain UNVERIFIED. These are finite host-specific experiment decisions, not
universal platform performance promises or budgets chosen from AFTER results.

#### Experiments and equal-work characterization

1. **Authenticated habitat identity — DISCARDED.** After existing structural,
   root-seed, signed-region/cohort and exact world-cache binding,
   `canonicalCoreEcologyBreadthHabitatForWorld` could avoid two whole encodes
   only when the immutable input was literally the expected authenticated
   object. Clone/load/cold/rederived/evicted/untrusted paths retained full
   canonical comparison. No cache, receipt, hash, byte ordering or schema was
   introduced. Actual scheduler fixtures at30accepted steps/3world advances
   counted360whole-habitat encodes/15immutable inputs/3,937,656UTF16 code units
   in estuary and252/10/2,916,840 in dense; candidate1 reduced these to zero.
   Serialized current-world save payload bytes/hashes stayed equal. This
   confirmed removable repeated input work and a stationary CPU gain, but broader tails/travel/
   input qualification was incomplete, so the shortcut was removed.

2. **Complete visitation derivation proof — DISCARDED.** A candidate compared
   every own key/value of already-canonical derivations before omitting the
   same proven-equal derivation from both ephemeral durable-signal comparisons.
   Full persisted/root encoding and unequal/clone fallback remained intact.
   The30-step fixtures retained114/86signal encodes but reduced their total
   code units1,894,978→853,954 /1,656,057→887,823. Save digests stayed exact.
   Incremental Electron estuary improvement was only0.511ms, dense1.144ms;
   one Firefox run improved2.500ms but only1.65%. This failed the pre-edit
   minimum and repetition requirements; only characterization tests remain.

Both experiments used existing owners, not a serialization cache or new
simulation. No third speculative renderer/pathfinding/worker experiment was
implemented: measured presentation and nested encoding leads did not yet
identify a separately proven safe, worthwhile duplicate.

The two restored-source30-step current-v47 save witnesses remain:
estuary1,814,914bytes SHA256
`6962f074f4c66d2c27ba23dfa7e49ad2cbf30d2782fa0b230f95107a6c3e96b7`;
dense1,870,814bytes
`e8fb77bbf910afd1066049afecda4ae3d588665634c0ffc1011bb10985827f1e`.
Tests cover real128-entry eviction, clone/rederivation, foreign seeds/signed
regions, altered self-consistent Unicode/lone-surrogate habitat and legacy/
suppressed visitation lineage. They use the existing runtime scheduler,
not a second simulator. Mocked timing/counters are not production performance;
mocked soundscape and serialized save equality do not independently prove every
nonserialized audio/event trace, movement sequence, periodic task or autosave.
Existing fail-closed interval-closure rollback/current-save checks also passed.

#### Stationary production comparisons

Two fresh BEFORE and two candidate1 windows per row,60seconds each, no CPU
sampler or hitch trace. Seeds `runtime baseline estuary` and
`breathing room regional density 8`. Means are medians of per-run means;
not per-advance medians. Callback p99 below is the renderer interval proxy,
not an operation-correlated or presented/GPU quantile.

| Product/scenario | World mean ms BEFORE → candidate | World max ms BEFORE / candidate, repetitions | Renderer interval p99 ms BEFORE / candidate |
| --- | ---: | --- | --- |
| Electron estuary | 87.393 → 82.214 (5.93% lower) | 117.1,115.4 /111.1,112.8 | 91.6,91.9 /85.3,87.4 |
| Electron dense | 100.016 → 96.197 (3.82% lower) | 130.7,129.4 /127.5,126.3 | 105.2,104.6 /101.3,101.0 |
| Firefox estuary | 160.899 → 151.700 (5.72% lower) | 190,191 /200,188 | 163,164 /154,153 |

Renderer worsts were124.5,122.2→118.1,119.3ms estuary;138.2,137.3→135.7,133.7
dense;196,198→206,193 Firefox. Browser worsts are mixed, not established as
improved. Each run has59–60world samples/599–601accepted steps over60.001–60.233s,
accepted throughput9.978–9.983steps/s. Window endpoints differ in some repeats;
these are not equal-terminal authoritative histories. World empirical p99
equals max with this count: low-sample evidence, not a strong population p99.
Existing telemetry does not retain raw world p50/p95 or measured input/debt
time series. SaveSnapshot count was zero throughout stationary windows.

Estuary72actors/54materialized/950aggregate units; dense76/66/881; both3visible
actors and0visible wildlife. This exercises simulation occupancy, not visual/
acoustic saturation. End-sample resource counts match in every before/candidate
pair; all pending queues are zero. Short Electron point-in-time JS heap readings
are mixed; Firefox omits those Chromium heap metrics. No retained-memory
improvement, leak-free soak or zero-memory claim follows from these snapshots.

#### Travel, platform validation, and remaining limits

Travel seed `breathing-room all-tide corridor 187`; unchanged harness enforces
≥210seconds even with the ordinary60-second sample argument. Fresh control and
two candidate1 runs each accepted2099steps/209world advances, tick420→629,
156.390263tiles across3regions/2transitions, with zero discontinuity/projection
mismatch and matching endpoint occupancy. Adaptive wall-driven commands differ;
equal endpoints do not prove identical accepted-command/event histories.

| Travel metric | Fresh BEFORE | Candidate1 | Candidate1 repeat |
| --- | ---: | ---: | ---: |
| World mean / p99 / max, ms (209samples) | 65.080 /92.9 /103.0 | 72.758 /104.7 /136.8 | 64.844 /92.2 /100.9 |
| Full-window rAF p99 / worst, ms | 82.9 /333.3 | 100.0 /433.3 | 83.3 /316.7 |
| Full-window gaps >80ms | 98 | 157 | 126 |

The older exploratory BEFORE61.233ms/349.1ms worst was not a substitute for the
fresh control. The slower candidate run affected all five disjoint phases,
not just the changed owner; the repeat did not reproduce that broad slowdown
but did not establish consistent no-regression behavior. Largest recorded gaps
have tick delta0 near a spatial recenter. This is a streaming/recentering
temporal association, not exclusive causal attribution or a GC diagnosis.
Full-window rAF worsts survive ring rollover; the renderer4096-tail worst must
not replace them. Fixed-step/detail rings retain the newest2048samples only.
No run crossed the first autosave boundary at tick1020; short travel cannot
certify autosave, long-session retention or the queued prolonged soak.

Candidate1 web/typecheck/build613modules and nested static smoke passed.
Interactive Firefox157 production-artifact smoke passed both views, keyboard
brace/orbit, resize, title pause/continue, context-loss fallback and byte-exact
v47 primary/fallback save across refresh (1,810,458bytes,
SHA256`6e78579d7419cf703e790d1c656c3dbef9fedf2b9c9c87e362f3e8aa4ab37176`).
Native audio graph ran/five oscillator starts; hardware audibility was NOT RUN.
Two existing startup/refresh CSP eval-fallback logs were observed; no additional
gameplay errors or HTTP/fetch failures. Visual Chart/Relief images were inspected.
These stages exercised candidate1; final bundle identity is separately equal
to BEFORE, not a claim that every lifecycle stage was rerun on every artifact.

After restoring the application, final static smoke passed all5byte-identical
BEFORE files (4,705,503served bytes). The same interactive Firefox harness was
rerun against that final artifact: PASS, both views/input/orbit/resize/pause/
refresh/fallback and byte-exact current-v47 primary/fallback save,
1,810,989bytes SHA256
`15274503c5af5b4abec4d2a3de3108cf7d36a12b42fc71257c9a1f4fbac2d73c`.
The same two known CSP fallback logs, no HTTP/fetch failures, and running native
audio graph were observed. Final Chart/Relief screenshots were inspected.

Macarm64 direct unchanged Forge packaging and candidate1 generated-app smoke
passed runtime-only10-entry ASAR, secure app:// boot, Node globals absent,
views/input/resize/title/menu/gameplay/current-save fixtures. Desktop/compact/
title images were inspected; compact desktop viewport is not mobile hardware.
The smoke/profiler scheduling mode is not a normal shipping cold-relaunch test.
Final desktop smoke was also rerun on the restored BEFORE archive: PASS with
no reported resource/navigation/renderer warnings; all three images inspected.
The generated release directory no longer contains the rejected candidate2.
`npm run package:desktop` correctly rejects unpublished release metadata;
that release-wrapper condition was not bypassed by altering its policy.
No final ZIP/install/sign/notarization or other-platform run is claimed.
Pages workflow/config was inspected unchanged; deployment/exact-live-build
verification NOT RUN. No push, merge, publishing or remote job was authorized.

DEPENDENCY CHANGES: NONE. Application configuration changes: NONE.
Upstream p5 source modified: NO. Upstream Electron source modified: NO.
No node_modules patch, worker, IPC bridge, new API/platform requirement,
storage namespace, security bypass, real-save reset or schema change.
Current outer47/carry14 remain unchanged. Synthetic ignored profiles/evidence
remain outside the five-file dist and runtime-only ASAR.

Final restored-source focused validation:5files/65tests; critical6files/105;
web/typecheck PASS. The immutable restored
checkpoint c1f7cd0 passed354files/3529tests in1621.01s, exit0/
JSON success:true with no failed/pending tests. Context-index23 and player-facing
policy39 self-tests also passed. Command:
`caffeinate -i env CI=true npm run test:ci -- --reporter=default --reporter=json
--outputFile.json=artifacts/validation/c1f7cd0-hitch-cumulative.json`.
That exact executable certificate remains valid through subsequent prose-only
reconciliation; it is not Voice closure, remote CI or release readiness.

Reproduction uses existing commands and the frozen matching artifacts:

```sh
npm run build:web
npm run smoke:web
npx electron-forge package
npm run profile:baseline -- --executable <frozen-executable> --scenario estuary-desktop-relief --sample-ms 60000 --output <ignored-output>
npm run profile:baseline -- --executable <frozen-executable> --scenario dense-biodiversity-relief --sample-ms 60000 --output <ignored-output>
npm run profile:baseline -- --executable <frozen-executable> --scenario continuous-regional-travel-relief --sample-ms 60000 --trace-hitches --output <ignored-output>
npm run profile:browser -- --packaged-baseline <matching-electron-json> --sample-ms 60000 --output <ignored-output>
```

The unresolved work is finer paired-clock/raw-tail/input/debt measurement of
nested canonical encoding, post-world publication and ordinary-step spatial
recentering, plus exact movement/event traces and actual autosave/current-save/
normal-lifecycle/long-soak witnesses. Existing owners retain that work; no
concurrency, broad rewrite or loss of simulation truth is implied by this lead.

### Living Voice ordinary repetition remeasurement — 2026-10-04

The local, unpublished accepted-effort repair (`c7d5a74`) separates recent
vocal choice from consumed acoustic events. Its packaged-smoke save expectation
is aligned with current schema 48 in `ee28a7d`; carry 14 and supported v47 remain.
The [canonical acoustic owner](./ARCHITECTURE.md#embodied-acoustic-event-and-receipt-pipeline)
owns that behavior; this record owns only the measured evidence.

All new captures used clean executable checkpoint
`ee28a7d0383855ef076387687bc4aef4d119b875`, AC power/Low Power Mode off on
Apple M4/16 GiB, Node 22.20/npm 10.9, Electron 44.1/Chromium 152 and headless
Firefox 157. Settings stayed at 1440×900 CSS, normal quality and the existing
requested 30-frame renderer warmup; platforms ran sequentially without tests or CPU
sampling. The unchanged desktop/browser harness hashes are respectively
`20d4db6ec302440fcf7b45f6f7ea49e471e2ee43805f072d51c94cb9f3cc44b7` and
`534f53e3d05e8850aa27cba89ee9579810d230539833330197a54c595fb78835`.
New ASAR SHA256 is
`c53423db7b7fadeff4436b742cffbf444499a6dd02ed17a6d9025e2a7b919103`;
five-file static integrity is
`2b13c04720293fb479c89e523db7f758e47801da304df3869cecb3ea72c897c9`.
Historical BEFORE ASAR/dist and synthetic JSON remain ignored local evidence,
not distributable assets; no real saves or private plans entered the package.

The existing public observer samples projections approximately every 100 ms,
with 512 retained IDs and 64-candidate capacity. It does not inspect wording,
hidden identities, actual audio, NPC hearing or DOM/glyph placement. Initial
and terminal reads can include already-active events; gaps can miss brief
events. All four new observations report no overflow/incompleteness, but the
selected scenarios are not the complete performance matrix.

| Current production witness | Actual seconds | Accepted steps | Projection samples | Observed player / animal IDs | Largest sample gap ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Electron estuary | 30.001 | 299 | 269 | 0 / 0 | 243.2 |
| Firefox estuary | 30.350 | 300 | 186 | 0 / 0 | 497 |
| Firefox repeat, same artifact | 30.008 | 299 | 220 | 0 / 0 | 359 |
| Electron regional travel | 210.021 | 2,099 | 1,746 | 18 / 1 | 525.4 |

The comparable historical travel capture observed 71 player speech IDs and one
anonymous animal-call caption. Current travel observes 18 and the same one-call
representative at tick 424. Both report 420→629, 209 world advances,
156.390263 tiles, three regions, 158 foot/camp transitions and zero continuity or
projection mismatches. Current samples contain 132 speech, 4 animal and 1,610 empty
projections; the longest empty sampled span is 134.475 seconds. This demonstrates
reduced observed speech exposure without stopping travel. It does **not** prove
full authoritative/event/save equality, every emission, acoustic silence,
semantic attribution of all native speech, or an hours-long annoyance pass.
The held-input runtime tests separately prove the repaired cause, exact
36-step expiry, reload/rollback and physical continuation. Physical camp cycling
is unchanged, and 18 late speech cues do not by themselves close sparse-Voice.

Timing remains observational, not an optimization claim. Electron renderer
callback rates remain about 54.53/s stationary and 35.94/s travelling. Firefox
varied 19.47→32.59/s across two captures of the same new artifact; world-advance
means varied 312.53→218.14 ms, versus 207.07 ms in the historical sample. No cause
for that variance, presented-FPS/GPU gain, universal platform equivalence or
hitch repair is established. The windows process different terminal counts;
world-tail estimates have only 29–30 observations. No result is discarded or
replaced by the faster repeat.

`npm run package:desktop` (including typecheck/production build), static
`npm run smoke:web` and normal `npm run smoke:desktop -- --executable
<generated-executable>` passed. The packaged smoke checked the runtime-only
10-entry ASAR, current v48 save/renderer reload, input, both views and responsive
surfaces; desktop/mobile screenshots were inspected. These are not mobile
hardware, fresh process relaunch, ZIP/install/signing, other desktop targets,
long soak, trusted-audibility, CI, Pages or deployed-build certification.
Both Firefox captures report zero guarded error/rejection/CSP deltas.
Dependencies, upstream sources, quality and shipping lifecycle are unchanged.

Reproduce with the current production artifact and existing commands:

```sh
npm run package:desktop
npm run smoke:web
npm run profile:baseline -- --executable <generated-executable> --scenario estuary-desktop-relief --sample-ms 30000 --observe-voice --output <ignored-electron-json>
npm run profile:browser -- --packaged-baseline <matching-electron-json> --sample-ms 30000 --observe-voice --output <ignored-browser-json>
npm run profile:baseline -- --executable <generated-executable> --scenario continuous-regional-travel-relief --sample-ms 30000 --observe-voice --output <ignored-travel-json>
```

Travel intentionally enforces a 210-second minimum despite the 30-second flag.
Evidence is retained under ignored `artifacts/validation/voice3AW/`, alongside
the historical `voice3AT/` observations. The remaining line/family/profanity,
mixed-scene, hardware-accessibility and hours-of-play requirements remain open;
neither Living Voice nor a performance/release checkpoint closes here.

#### Current-schema projected-wording observation — 2026-10-04

A subsequent local diagnostic at clean `0e75d02` adds exact player-wording
counts to the existing opt-in public observer, without changing the application,
simulation, quality, schemas or dependencies. The retained current-v49/carry-v14
application ASAR is
`16c26ebf781331fbfa711900ca78a10d03a5e03a7c333c6d522a9e30742a6195`;
the new harness SHA256 is
`6c880c4677e5d9fc1c0269050e517d3d2524f811c359566a35e12d229d898ce9`.
Node 22.20/npm 10.9, AC power and Low Power Mode off were verified. No competing
test/profiler ran; temporary `caffeinate -i` prevented idle sleep without changing
permanent power settings. The existing 1440×900/DPR1 Relief scenario and requested
30-frame warmup remained unchanged.

The existing three-region travel run completed 210.0116 seconds, 2,099 accepted
steps and 209 world advances (420→629), covering 156.390263 tiles and three regions.
There were 158 foot/camp transitions and zero continuity/projection mismatches.
Its initial projection hash matches the prior corridor witness. Matching those
work counts and public movement facts is not full authoritative/save equivalence.

Of 1,720 public samples, 1,586 had no projected acoustic cue. Eighteen retained
player-speech events used three exact wordings with counts 8/6/4; three successive
single-new-event observations repeated the preceding wording. No ambiguous-order,
invalid/changed-text, collision, incomplete or overflow condition was reported.
One anonymous animal-call caption was observed at tick 424; no animal source was
anchored and no mixed or physical cue was sampled. The longest empty sampled
span was 134.5034 seconds and the largest sample gap 591.7 ms. Emitted audio, lawful
NPC hearing, semantic families and missed brief events are outside this census.
Its bounded in-page dictionary exports comparison fingerprints/counts, not raw
wording or source identities; fingerprints are not cryptographic secrecy.

The result establishes sampled wording repetition, not an annoyance pass, broad
animal repertoire, busy-scene readability, hours of play or performance gain.
The stopped terminal save measured 1,710,134 bytes; this is not a cold-reload or
long-run storage proof. Existing physical foot/camp cycling was not modified.
Browser-native wording measurement was not run; standalone embedding and the
shared browser consumer passed their source selftests. Desktop observer tests,
typecheck and the maintained smoke suite (105 tests) passed before capture.

Exact command: `caffeinate -i npm run profile:baseline -- --executable
<generated-executable> --scenario continuous-regional-travel-relief --sample-ms
30000 --observe-voice --output <ignored-wording-json>`. Ignored evidence is
`artifacts/validation/voice-current49/electron-travel-wording-0e75d02.json`, SHA256
`268715755ae7f54e2a6d0477f2b512d24d0e6814d56b3feaeb097ae73802c93e`.
No deployment or release gate is claimed.

#### Native paired speech and an ordinary-label collision — 2026-10-04

The existing production-browser functional harness now supports
`--paired-greetings`. Physical selection and GREET controls introduce two
different residents while ordinary simulation continues; freezing happens only
after both committed speech cues coexist. Local tooling commit `f299cdc` changes
no game producer, schema, dependency, simulation timing or release identity.

Sequential Firefox 157 headless runs on AC power, Low Power Mode off, served the
retained current-v49/carry-v14 artifact below `/tideweft/`. JavaScript SHA256 was
`fddfd51adc42512d0da91d6c1c44e68bacda28ba41a0284a12c4dcd329e1a9fe`.
Commands used `npm run profile:browser -- --paired-greetings [--reduced-motion]`
and fresh ignored output stems. Both pairs committed at ticks 424/427. Two
distinct labels remained mutually nonoverlapping in all four Relief viewport
states (1280×720, 390×844, 320×640, 844×390). Both cues expired at tick 433;
after real reload, both learned ABOUT states persisted and no old cue or
announcement replayed. Existing single-GREET and anonymous-animal native modes
also passed. The capture harness SHA256 was
`3f9fe6b279e53f9fb88031513605aa919ba395695a2b8f062d0e57109d10152a`;
after capture, the harness added a pre-copy length guard for unsupported arrays.
Accepted single/pair inputs are unchanged; rejection selftests pass. Both
harness selftests, typecheck and critical smoke (105 tests) passed.

Screenshot inspection and bounded DOM diagnostics found a real remaining
cross-layer defect: the ordinary harbor label intersects speech at desktop,
320-wide and 844-wide Relief in both pair runs. `p5ReliefSketch` independently
places that label without consulting acoustic bounds. The pair's passing result
does **not** certify all-world-label readability. Chart has canvas/screenshot
evidence, not DOM glyph bounds; zero DOM labels there proves no such separation.
The next repair belongs to Relief presentation, not hearing or event generation.

Ignored final evidence is under `artifacts/validation/voice-current49/`, stems
`browser-paired-greetings[-reduced]-35a6e70-final` (JSON SHA256
`f9f8e442a136c410507ca200b10c9a99afad5d4fffa2aa958e11a806e9bec27d` /
`05a6a574e1f3f1e44eb53b66a5ea1d2f9eb72904b60a76950d7da5e64bee520c`).
This is two-human presentation/reload evidence, not mixed animal/physical scenes,
hours, audible audio, hardware assistive/mobile output, performance or release
closure. No cumulative suite is rerun solely for this harness slice.

Follow-up local renderer fix `c5bbc56` makes the optional Relief harbor name
yield to already placed acoustic text using its final eased/clamped conservative
envelope and at most four rectangle comparisons. No DOM reflow query, simulation,
hearing, save, dependency or release change is introduced. Destination/ADRIFT
guidance remains visible; conservative reservation can briefly hide a nearby
name that would not collide. Eight new characterization cases fail before the
fix; the four-file Chart/Relief/shared-layout set passes 207 tests, typecheck and
critical smoke pass (105 tests), and both harness selftests pass.

Browser captures used the dirty `1706059` candidate later preserved as `c5bbc56`
(tracked diff SHA256 `93456939d94627daf191da41cad94e1596896339fd4a79bc0e55a5ad2a4a821a`).
Normal/reduced Firefox production pairs retain the same 424/427→433→434 learned-
ABOUT/nonreplay facts. All four Relief sizes now have two separate speech labels
and zero visible harbor labels/ordinary overlaps; desktop and 320-wide images
were inspected. The updated harness rejects measured ordinary Relief overlap,
but Chart remains screenshot-only and this is not every-label/font certification.
Bundle SHA256 is `9f84e08011bc6b8364a08a08defe2a7c56dc382998eef146c82040a258dd8e94`.
Final ignored stems `browser-paired-greetings[-reduced]-1706059-harbor` retain
JSON SHA256 `1d41c5bac17243af274610737580219a9dfda8156a9e3734d751316c9ff07a5b` /
`892f52f1f170167c298572d157e2b191b6eb825828aef4085265131a0cf0d161`.

Nested-path static web smoke passes five files. The unchanged desktop wrapper
correctly rejects the initial dirty authoritative candidate; after its validated
local commit, normal `package:desktop` and `smoke:desktop` pass on macOS arm64,
including runtime-only ASAR, functional input, views, resize, save/reload and
desktop/mobile-sized screenshots. ASAR SHA256 is
`ca5e888ec33c64b4f3b9c082e39c96847d3a72b40c3dac4d6cd459a55e1fe6b1`.
The wrapper/CI/Pages policies were not bypassed or changed. No distributable,
installation, signing, other-platform, actual-mobile, hours or publication proof
is added; the larger Voice closure remains open.

#### Ordinary keeper response and physical parcel controls — 2026-10-04

A finite Firefox 157 headless check on clean local `9cc87d3` used the existing
production artifact below `/tideweft/` at 1440×900/DPR1. Its ignored one-off
probe reused the existing BiDi transport and static server, not a new shipping
harness. Physical seed entry, START, the exposed keeper warning, Promise pickup,
view toggle, keyboard movement and KIT/drop/recovery controls ran while ordinary
simulation continued. No actor, weather, event, inventory, position or save was
injected; no runtime dispatch or clock stop manufactured the result.

The real keeper replied “Storehouse door's barred.” at tick 420; its source-
associated Relief text was visually inspected and readable. Actual pickup
committed eight fresh-water units by tick 423. A short 0.7-tile carry retained
them; KIT DROP created a reachable physical parcel at tick 425, changed guidance
to RECOVER, and the native Interact action recovered all eight units into the
expected `loose:<parcel-id>` carrier lot with DELIVER restored. The original lot
was not expected to retain its ID. Ordinary environmental steps worsened sampled
condition from 0.999958 to 0.999937 before recovery; equality with an earlier
sample would incorrectly require time to stop. Exact commit-time material-state
equivalence was not established by these asynchronous public samples.

Final capture lasted 21.256 seconds / 139 samples through tick 440, with a
538-ms largest sample gap, one observed speech event and no overflow. No animal,
physical-caption or mixed scene was observed; these are coverage limits, not
silent-world or annoyance claims. The retained first probe failed a stale
condition-equality assumption; the second sampled an unready Interact DOM
control after KIT close. A bounded actual-control wait resolved the latter
without changing gameplay; its exact missing/hidden/disabled cause was not
established. Both diagnostic failures remain local, not hidden by a game fix.

The existing persistent Promise drop/recovery test passes unchanged (one selected
case; 79 excluded), as does critical smoke (105 tests). Bundle SHA256 remains
`9f84e08011bc6b8364a08a08defe2a7c56dc382998eef146c82040a258dd8e94`.
Ignored final `native-play-9cc87d3-3.json` SHA256 is
`80a61a5a514bbbf1f4c1690db2b4dc90b0284e5627745560b357746eb2aac2fb`;
probe SHA256 `76105c36430d6be67d3568bd864d6d38b1ea40087ec95114cd47f73147d34227`.
Only the already known startup CSP eval-probe denial was logged. This finite
functional check is not native reload/full-root equivalence, delivered cargo,
audible/assistive quality, hours of play, a performance result or public release.
The disposable profile was removed after its own browser closed; the user's
browser and data were untouched. No application, schema or dependency changed.

#### Ordinary travel, sampled quietness and a native bird call — 2026-10-04

Clean local `936f7b3` reused the unchanged current-schema production artifact
at `/tideweft/` in Firefox 157, 1440×900/DPR1, AC power and Low Power Mode off.
Ignored probes used physical START, Chart keys and exposed controls, not actor,
event, weather, inventory, save or position injection or a move-target adapter.
No application, dependency, schema or release policy changed.

The six-minute Promise check completed 361.319 seconds of journey / 366.703
seconds of observation, through tick 960. Actual chronicle receipts confirm
eight fresh-water units delivered to Latchmere at D1 09:38 and fourteen food
units to Bellwake at D1 15:20. Fourteen Reed was then picked up for Latchmere.
Action counters are input attempts, not transaction counts. Floating-window
position deltas are not physical travel distance; a later probe uses public
world origin plus local position for sampled global displacement instead.

Its 2,387 public reads first observed 18 player speech, one human speech and
21 physical-text IDs, with nine player wordings and no adjacent sampled player
repeats. Player projection rate was approximately 2.95 IDs per observed minute,
not emitted audio rate. There were 2,261 empty reads, at most three projected
candidates, no animal, unclassified record, incomplete census or capacity
overflow. Largest sampling gap was 1,163 ms. The 233.322-second empty-projection
sample span is not proof of continuous audible silence. Brief footing, cargo
loss and recovery words fit the encountered actions, but complete causal state
at every cue was not retained; counts alone do not establish non-annoyance.

Earlier extended captures remain failed evidence: one Interact control changed
availability before the click; another lost its in-page census when the BiDi
socket closed. The latter retained 96 stage records, with stationary Bellwake
position after its delivery marker left the window, despite usable public
south-west bearing. That was the probe's null-target stop, not a navigation
defect. A guarded coarse-bearing fallback passes local direction/refusal checks;
the finite run selected a different next Promise and did not exercise it
natively. Bounded atomic local observer checkpoints now retain partial samples
on disconnection. Nominal fifteen-minute windows close on the next callback;
boundary IDs can be counted again and must not be summed as unique emissions.

A separate 60.106-second ordinary animal attempt physically started the existing
`breathing-room all-tide corridor 187` seed and held Chart W. At tick 424,
3.864 seconds into that attempt, it heard one anonymous bird call. The captured
Chart image visibly reads `CALL. · direction unclear`; public attribution is
only “A bird,” not a hidden species or exact source. Movement was released
after the encounter. The subsequent Relief image no longer shows the caption;
it is not simultaneous two-view live-text proof. The 60.298-second observation
retains 525 reads, one animal-caption ID, 521 empty reads, a 259-ms largest gap
and no overflow or incomplete census. No Promise pickup was needed.

Promise JSON SHA256 is `6339b7fe465a960e3fedf3a65fab2e60567e05888ee560e509e42abf1bbf0f38`;
animal JSON is `34ecac834eedf714b673d6d28e2f277c3eeacd07f3c8ecba14b1dd8b8b9cd1fb`.
Exact ignored probe versions are `a9b6c5b73e64da1db59e81c191a2ef2a94e5c2853aa8e7e4b1cdb1732566a17a`
and `81d02ce69bba1c371bc0c14fd6b5550d329a26c3a229f79ba586eb757b752ee7`.
Bundle remains `9f84e08011bc6b8364a08a08defe2a7c56dc382998eef146c82040a258dd8e94`.
Both browsers exited normally and their disposable profiles were removed;
the user's browser/data were untouched. Each logged the known CSP eval-probe
denial, not a console-clean result. These observations add ordinary gameplay
evidence, not hours, dense/mixed-scene, audible/assistive, full conservation or
replay, mobile hardware, performance, directive closure or public-release proof.

A later twelve-minute ordinary-control capture on clean `10cbe5a` used that
same frozen artifact and power/platform settings. Actual journey lasted 721.041
seconds; 726.598 seconds / 4,514 projection reads ended at tick 1306. It first
observed 61 player, one human and 68 physical candidates, thirteen player
wordings and three adjacent sampled repeats. No animal was observed. At most
four candidates appeared together; 4,125 reads were empty, the largest gap was
2,039 ms and the longest empty-projection sample span was 106.540 seconds.
Neither empty samples nor candidate counts prove audible silence or rendered
physical glyphs. There was no census overflow or incompleteness.

Two handoffs occurred; the last Reed Promise remained unfinished with nine of
fourteen units carried and five loose. Input-attempt counts do not certify
transactions or full-root conservation. The guarded probe actually followed
the current RECOVER objective's coarse compass hint when the parcel marker
was outside the window; it never reconstructed hidden coordinates. A preceding
320-second failed capture had refused that legitimate public hint, a probe
limitation rather than a demonstrated game-navigation defect. This finite
result does not close hours, annoyance, mixed/animal presentation or release
acceptance. Browser exit was normal and its disposable profile was removed.
Result SHA256: `3374d0b5c8900cd7ce86fb6aebb98827af8f44a26e8f77830f72a79b3c9519a3`;
probe SHA256: `152b7d22261f2eeb80f380e25b582cfd4a5d8cf6c94eddd64f43e3b344070aef`.

#### Bounded development expression inspection — 2026-10-04

Local work over `10cbe5a` adds a default-off, development-only observer at the
existing expression admission boundaries, not a new gameplay producer. Its
64 copied records separate actual intent, source-local prior state, exact
pre-kernel/runtime refusal, committed event/admission/player receipt, catalog
realization and optional authenticated contextual introduction text. The
kernel-only preview is explicitly hypothetical and cannot submit events or
simulate physical recency, hearing, relationships or unrecorded causes.
The [canonical contract](ARCHITECTURE.md#development-expression-inspection)
owns these limits; this remains a partial debugger, not the full configurable
expression lab.

Focused kernel/channel/reception/acoustics/observer/runtime tests pass: six
files / eighty tests. Four selected existing runtime/fall tests pass, covering
successful contextual GREET, later interval-closure rollback, saturated sound
capacity and held-input exhaustion across current reload. The keeper fixture
compares enabled/disabled world-save bytes, view and audio; injected observer
failure cannot veto closure. Critical smoke passes six files / 105 tests.
Typecheck, production web build and nested-path static smoke pass. The emitted
bundle SHA256 is `fa2a5a62f375d5e117b55c37d8deaf4fcffe84ee78ac2b95e4ab390718b08efc`;
inspection finds no observer API, kernel-preview or diagnostic-only contextual
markers. Unit coverage separately checks the production API is absent.

Release synchronization deliberately fails on this unpublished runtime change:
the release-only wrapper requires a new tutorial/build/package identity. It
was not weakened, and no public version was manufactured for development
tooling. Fresh desktop packaging, native developer-console usage, complete
cumulative regression, audible/assistive quality and release verification have
not been run for this slice. Existing older packaged evidence does not certify
it. Save49/carry14, dependencies, platform configuration, RNG, physical causes,
audio and player presentation rules are unchanged. No upstream code, deployment
or completed directive changed.

#### Ordinary Relief physical glyph — 2026-10-04

Clean local `37e9555` reused the newly built production bundle above in Firefox
157 at `/tideweft/`, 1440×900/DPR1. Physical START and the exposed Promise pickup
committed eight fresh-water units at tick 422. A short camera-relative W+D
crossing in Relief then produced a real traversal `scrape` at tick 427. No
event, actor, weather, inventory, position or save was injected; the clock was
not stopped. This was exploratory movement, not a routed delivery.

A bounded page-local observer matched the actual visible physical DOM label
uniquely to the current public candidate's text/category/source-kind/family.
DOM exposes no event/source ID, so this is tuple association, not exact DOM
identity authentication. The recorded rectangle was 86×15.22 CSS pixels,
within viewport and label layer, with no text overflow or collision with
visible ordinary labels. At most two acoustic labels appeared. The screenshot
was independently inspected: `scrape` above the player and a separate `thud`
below were readable. Public candidate and DOM association disappeared by tick
428; this does not establish hidden authoritative event expiry.

The sixty-second opportunity ended early after its first encounter: actual
movement/confirmation lasted 7.931 seconds, total observation 10.109 seconds /
74 reads / 217 glyph-observer frames. No overflow or ambiguous tuple occurred.
Result SHA256: `64de6b34f842e35f5f250a3d09a8eb12dcfbe21625e429a1183ca9e1cfbe8765`;
probe SHA256: `1361973bd601fe951a43b1901714f58d4d8067b4c9e0939ab30319068615a94e`.
Browser exited normally, the disposable profile was removed, and only the
known startup CSP eval-probe denial was logged. This proves one ordinary native
physical-glyph encounter, not dog/human/physical coexistence, audio, assistive
output, replay, full conservation, hours, performance, mobile hardware or
directive closure. No application change or public release was made.

#### Sparse optional exhaustion reannouncement — 2026-10-04

An ordinary three-minute Chart exploration on local `1f7deff` exposed a real
repetition problem: 25 sampled exhaustion lines, often about four seconds
apart, among 29 player lines. The existing 36-step semantic policy was working
as designed; repeated physical micro-recoveries created fresh occasions too
soon. The repair changes only the existing accepted-effort history owner:
after one optional murmur, another fresh exhaustion must wait 600 accepted
player steps. The first qualifying exhaustion remains eligible. The pending
kernel's 36/12-step meaning/family law, physical movement, stamina, camp,
wording, event identities, hearing, and already-committed audio are unchanged.
The [canonical contract](ARCHITECTURE.md#embodied-acoustic-event-and-receipt-pipeline)
distinguishes admission eligibility from sound presentation and propagation.

Two recency unit files / 17 tests pass, including exact 599/600 expiry,
phase-ten, pause, batched advancement, and detached current-history roundtrip
beyond the former 36-step horizon. Eight selected runtime effort tests pass.
An 80-step held-input fixture compares uninterrupted and reload-at-49 runs:
multiple actual camp entries remain, only the first exhaustion speaks, current
roots/carry/event/mode/stamina/audio agree, and consumed sound cannot replay.
Its later reload adopts an already-published chart, so the earlier step-19
publication-counter expectation was corrected without dropping fact equality.
A separate recheck of the strengthened camp-entry oracle passes. Nine affected
kernel/channel/reception/acoustics/trajectory/admission/causal/diagnostic files /
148 tests and critical smoke / 105 tests pass. Typecheck, production web build,
and nested-path static smoke pass. Outer49/carry14 and wire shape are unchanged;
existing supported records load forward, forgotten null history stays null.
Older executables' former pruning rule cannot read newly retained age36–599
history; no reverse-reader compatibility is claimed.

The same finite ordinary native-control exploration was repeated against the
dirty candidate's production bundle
`519d46b88be2f85f35c40b0477e0fec46948c485d582d0f1d85b721a7a77e00d`.
Actual attempt: 180.407 seconds; observation: 180.892 seconds / 1,275 reads,
ticks420→600. It sampled five player lines, including two exhaustion wordings
at 66.085/135.114 seconds, twelve physical cues, and no adjacent sampled wording
repeat or overflow. Earlier observation was 180.486 seconds / 1,341 reads,
ticks420→599, eight physical cues and eleven adjacent wording repeats. The
probe changed only its nonoverwriting output suffix; seed, ordinary controls,
viewport and production serving stayed the same. Wall-timed paths and terminal
work differ: these counts are a playtest observation, not an exact before/after
simulation equivalence or performance claim. Result SHA256:
`0c1fbbb7f5075957a812f6ba1e7dec37c1e789f548f2595da88e6cb2ddea78b4`.

The final Chart screenshot was inspected. Browser exited normally and its
disposable profile was removed; only the known startup CSP eval-probe denial
was logged. No canine call was encountered, so that opportunity remains open.
No hours-of-play, audible/assistive quality, mobile hardware, desktop package,
complete cumulative, public release, or whole-Voice closure is certified here.
Dependencies, upstream code, save policy and completed directives are unchanged.

#### Captured traversal producer inspection — 2026-10-04

Local work over `e8b2056` extends the existing development inspector with the
exact input already supplied to `playerTraversalExpressionIntent`. Selecting
a retained traversal decision now replays that unchanged semantic mapper,
requires exact agreement with the recorded intent, then reruns the source's
copied prior kernel. This exposes actual cargo-versus-footing precedence and
suppression without configuring hypothetical physical events. The
[development inspection contract](ARCHITECTURE.md#development-expression-inspection)
owns detachment, bounded retention, unavailable contexts and authority limits.
Actual runtime refusal stays distinct from hypothetical mapper/kernel success;
neither authenticates nor repeats the physical transaction, recency, capacity,
hearing or presentation. Other producers have null context. Full selectable
personality/relationship/emotion/audience lab coverage remains open.

The diagnostics unit file passes 41 tests, covering current traversal branches,
copied/frozen inputs and outputs, exact-intent mismatch, malformed inputs,
exceptions, disabled no-work behavior and current-buffer lifecycle. Four
existing runtime storm-stumble/capacity/phase-ten tests pass: actual committed
causes are captured on acceptance and refusal, later failure publishes none,
current reload starts with no diagnostic history, and enabled/disabled runs
retain the same event/trajectory/audio/current-save roots. Ten inspector and
traversal-policy tests across two files pass; two selected existing GREET and
late introduction-rollback tests pass. Seven affected kernel/channel/reception/
acoustics/trajectory/admission/causal files pass 127 tests. Critical smoke / 105
tests, context-index checks / 28, typecheck, production web build and static
nested-path smoke pass.

The production bundle SHA256 is
`36387ee1532fe33a7cff50e853c4718dba20101ce1580e573db8fc6624a6c4c0`.
Inspection finds no inspector API, producer-replay or kernel-preview markers;
the production-environment runtime test also exposes no inspector. Native
developer-console usage, this new artifact's interactive browser/desktop
package, complete cumulative regression, audio/assistive quality and release
verification are not certified by these tests or earlier artifacts. No new
gameplay producer, save schema, dependency, platform configuration, RNG,
physical rule, upstream source or completed directive changed.

#### Ordinary developer-browser traversal inspection — 2026-10-04

The development-only inspector was exercised on clean local
`8fa44df573ce20f107c57888e390606f9062d884`, served by the existing Vite command
`npm run dev:web -- --port 5189`. A disposable Firefox profile used native
START, an eight-unit Promise pickup and Relief W+D controls. No fall, sound,
actor, weather, inventory, position or save was injected. Ordinary movement
produced a serious loose-rock stumble at tick427: the current public speech
event matched a retained accepted traversal decision and said “That was close.”

The inspector began disabled with capacity64 and no records or counters.
Enabling it retained one real decision. Replaying that current sequence
returned the expected captured-producer/kernel scope, producer kind, actual
runtime reason, exact intent and successful kernel result. Same-stack tick,
player, acoustic-candidate and caption projections remained unchanged during
replay and reset. Reset cleared both counters and records and made the old
sequence unavailable; a refetched final snapshot confirmed disablement and
empty state. This checks actual API access, not the complete selectable
personality, relationship, emotion or audience lab.

The attempt ended after 8.741 seconds within its 60-second bound; 76 public
reads spanned 11.205 seconds, ticks420→428. It sampled one player speech and
two physical candidates. Independent physical DOM observation found a readable
`scrape` glyph, no clipping or acoustic-label collision, at most two labels,
and public/DOM disappearance at tick428. The actual screenshot was inspected.
The glyph and diagnostic record are separate witnesses, not an authenticated
cross-link through DOM identity. Result SHA256:
`f3ce4588132d9d79eb54e0ad116e3038cf677865624734b47af188cde9662ed8`.

Source fingerprints remained unchanged through capture. The browser exited
normally and its disposable profile was removed; the separately owned Vite
server was stopped. Only the previously characterized startup CSP eval-probe
denial was logged. This is development-source evidence, not a production
artifact, whole-world/save/audio parity, audible quality, performance, mobile
hardware, assistive-technology, hours-of-play, cumulative or release proof.
The preceding slice's exact-source correctness/build evidence is not rerun
solely for this prose record. No executable or policy change was made here.

#### Captured guardian shelter-whine inspection — 2026-10-04

Local work over `32ebfed` adds one existing animal producer to the bounded
development inspector. The runtime retains the exact already-mapped guardian
input—dog/work roots, completed tick and shelter-intent score—through admission
only when the observer is enabled. A real decision copies that input; replay
uses the unchanged shelter-whine mapper and requires exact recorded-intent
agreement before rerunning the copied source-local kernel. No new whine,
animal behavior, hypothetical event, hearing or physical authority is created.
The [inspection contract](ARCHITECTURE.md#development-expression-inspection)
keeps weather exposure, kennel custody and physical shelter travel outside
replay's claimed proof.

Five new focused diagnostics tests preserve deterministic replay, detached
frozen evidence, recorded-refusal separation, unavailable malformed/continuing/
mismatched causes, exceptions and shared-buffer reset/eviction. The complete
diagnostics file passes 46 tests. The existing visible/unseen mixed scene now
compares observer-enabled and observer-disabled runs from the same current
save and exact fixed-step inputs: the full saved envelope and committed audio
calls agree. The real whine's captured intent replays exactly without changing
render/UI/audio projections; cold reload exposes no diagnostic history. A
later interval-closure failure occurs after the actual mapper produces the
whine, yet publishes no record or whine audio and restores eleven relevant
authoritative roots. Both mixed cases pass. Six selected fall/storm/capacity/
phase-ten/mixed tests and ten affected mapper/kernel/channel/reception/
admission/trajectory/authority/runtime-inspector files / 152 tests pass.
The existing late introduction/save/vocal-audio rollback case, critical smoke
/ 105 tests and context-index checks / 28 also pass.

Typecheck, production web build and nested-path static smoke pass. Bundle
SHA256 `371e42d66e4819e4fabc8d9e11b87e80d90915c1bedbb8ff495230426a91dbd9`
contains none of the inspector API, replay, preview or new guardian-capture
markers. Production does not retain this diagnostic input. These controlled
fixtures and bundle inspection do not certify a native canine encounter,
audible/assistive quality, hours-of-play, mobile hardware, desktop packaging,
complete cumulative confidence, full expression lab or public release.
Save49/carry14, dependencies, upstream source, physical rules, active order
and completed directives are unchanged.

#### Acoustic text versus field feedback — 2026-10-04

Local work over `0feb672` checked the actual existing storm shelter-whine,
player fall, and conserved Promise-cargo scene. Temporary test-only capture
copied the scene's public renderer/UI views and was then removed; the original
runtime test bytes match. A local adapter freezes those copies and mounts the
real development renderer/UI with no runtime, save, audio, or gameplay command
receiver. This is native presentation evidence from a controlled current
producer fixture, not an ordinary canine encounter or production simulation.

The initial 844×390 screenshot exposed a genuine overlap: WHINE... at
`383.1,219.47,86,13.67` intersected the shared speech caption at
`350.18,223.78,143.63,14.68` (CSS x/y/width/height). The previous snapshot
validator compared world labels with each other and feedback with itself,
but missed that boundary. The shared layout now receives three bounded UI
reservations with cached mount-relative measurements, as specified by the
[presentation owner](ARCHITECTURE.md#shared-acoustic-text-presentation-arbitration).
It relocates within existing lanes or suppresses optional world text; hearing,
audio, semantic events and accessible captions do not disappear with a label.

Production paired-GREET testing then caught a relocated speech box clipping
another resident's emotion mark in landscape view. Relief's existing optional
harbor-label yielding now also covers optional actor labels and marks at their
final eased/clamped envelope. Actor state/body rendering and essential
destination/ADRIFT guidance remain intact. This conservative envelope can
suppress a nearby noncolliding optional mark; it is not a complete all-label or
arbitrary-font collision guarantee. The maintained native validator now rejects
label intersections with caption, full EVENTS panel, and action dock, with
synthetic rejection/touching-edge selftests and bounded conflict diagnostics.

Final controlled Firefox 157 normal/reduced captures each pass four sizes
(1280×720, 390×844, 320×640, 844×390) in Chart and Relief. Public fixture inputs
remain byte-equivalent when serialized, with no meaningful dispatched commands.
Desktop/portrait Relief show the actual player speech and uniquely matched
shelter whine; short landscape retains speech and omits the whine. Lower
physical cues are also unplaced; an absent glyph is not proof of an absent
world event or of a particular suppression reason. Native DOM bounds,
nonintersection with feedback/ordinary labels, caption/ARIA and exactly one
announcement pass. Chart screenshots do not provide DOM acoustic-glyph proof.
The final v4 normal/reduced records have SHA256
`855f68e52e900ceaa750abed5051d1a65811b773a3380dd57c1ecf6783dff406`
and `c65fa9019c542358225e7c443b75ba637d618a0add43ed65c4fa9ddff666380b`
respectively. Actual desktop and landscape images
were inspected. These local derivatives remain ignored.

The production bundle `index-B8OhHy_S.js`, SHA256
`b0c7f562a6d8a9cdb61b80190272b19e38c978e004277fac2b9e85c9fdd83250`,
also passes the maintained `profile:browser -- --paired-greetings` and
`--reduced-motion` witnesses through the real `/tideweft/` static artifact.
Each uses two native selection/GREET actions, eight frozen presentation states,
expiry, current-schema reload/nonreplay and guarded lifecycle checks. The
earlier boundary failures and one run invalidated by concurrent test-file edits
are not passing certificates; final records match stable inspected inputs.

Affected presentation integration passes nine files/275 tests, including
17 layout and nine reservation-cache tests; the real mixed runtime fixture
passes both visible/unseen cases (22 unrelated cases excluded). Maintained
critical smoke passes 105 tests; browser selftests, typecheck, production web
build and static web smoke pass. This is not fresh desktop packaging, actual
assistive speech/audio, mobile hardware, long-session performance, full
cumulative confidence or public release. Save49/carry14, dependencies,
upstream sources and simulation authority are unchanged.

#### Noncritical animal world-label preference — 2026-10-04

Local work over `cd44054` adds the Field Manual → Accessibility Full / Important
control at the [shared presentation owner](ARCHITECTURE.md#shared-acoustic-text-presentation-arbitration).
Only explicitly noncritical animal world-label candidates are filtered;
unknown legacy importance remains visible. Importance comes from the existing
semantic interruption policy after reception/source validation, not tone,
glyphs, rank or decoded alarm intent. Audio, hearing, interruption, physical and
speech candidates, shared captions and announcements retain their owners.
The preference is browser-local, defaults to Full, and is not world-save data.

The same actual visible storm-whine/fall/cargo fixture was recaptured as public
views; temporary test-only capture was removed byte-exactly afterward. The
ignored frozen-view adapter passes eight Chart/Relief size states plus twelve
native preference stages in each normal/reduced-motion run. Pointer and bounded
Tab/Space activation hide and restore the actual WHINE... glyph on desktop and
portrait layouts without changing the frozen views, speech caption or its one
announcement. Reload retains Important in browser storage. Existing manual
opening sends WAIT/recovery cancellation requests; preference activation itself
sends none. Earlier local checks incorrectly assumed command-free manual
opening and page reset on reopen; those rejected runs are not certificates.
Final records retain two known startup/reload eval-CSP denials each, with no
other captured errors. Their SHA256 values are
`78b5bea3b56917f6fc26f4fe588262d2cdd8949aac48b5996a555ed449b6e35e`
and `2b7f36bacb815ab750593111fcc02a02204faab477e793a22b3650f0d3cd16ae`.

The actual production files served at `/tideweft/` separately pass ten native
Field Manual stages on paused Title at 1280×720 and 390×844 in Firefox 157.
Native T, pointer and Tab/Space reach the control; the 44px target, visible
keyboard focus, page visibility and Important reload reconstruction pass.
Four recorded full public render/UI comparisons remain byte-equal across
toggles at tick 420. Four screenshots corroborate the DOM bounds. The record
has SHA256 `6a6a90633d7413ae5c65af63271c39018c94ed1d534248b611a89cda53b4705b`;
it retains the same two documented startup/reload CSP denials and no other
captured error or failed request. This is production preference/DOM evidence,
not active-play animal, audio, full-save, AT or mobile-hardware acceptance.

Affected semantic/projection/presentation tests pass nine files/318 tests;
UI/announcement integration passes three files/68 tests. The real mixed runtime
passes both visible/unseen cases, including current-save/audio parity.
Maintained critical smoke passes 105 tests; typecheck, production web build and
five-artifact static smoke pass. Bundle `index-D75lgQA2.js` has SHA256
`6765be1c389dd46222b42a538499f8074520ee4b96baa835cb6c0ddf8797dcb5`.
The frozen browser fixture is native presentation evidence, not an ordinary
canine encounter, production simulation, heard audio, AT or hardware proof.
Fresh desktop packaging, hours, full cumulative confidence and public release
are not certified here. Save49/carry14 and dependencies remain unchanged.

#### Selected human-warning belief inspection — 2026-10-04

Local work over `3d9e927` fills one existing development-inspector field:
human warnings now supply the exact canonical belief selected by their current
authenticated resident pass. An enabled DEV-only, failure-isolated notification
retains the winner without another scan, candidate-shape change, new trigger or
save field. The existing transaction-staged buffer copies it; anonymous animal
hearing stays anonymous. The [inspection owner](ARCHITECTURE.md#development-expression-inspection)
remains a partial lab, not a full configurable actor/world simulator.

Fourteen selector tests pass exact candidate bytes/order, immutable winner,
multi-resident selection, absent/stale/recursive exclusions, throwing/mutating
notification isolation, DEV=false exclusion and no deep resident serialization.
The real controlled fish-crow → human-hearing → warning fixture passes enabled/
disabled full-current-save and committed-audio equality at twenty accepted fixed
steps. Its late closure failure observes a genuine provisional warning/causal
record, then verifies retirement, unchanged stored save, twelve restored roots
and no released warning audio. Cold reload starts with an empty disabled
inspector and does not replay audio. The existing fish-crow propagation/tamper
and mixed warning/bark/fall/acquired-cargo cases also pass. These are controlled
runtime proofs, not an ordinary native encounter or qualitative sound review.

Affected domain passes nine files/197 tests; maintained smoke passes 105.
The introduction/save/audio late-closure regression also passes unchanged in
8.51s under a temporary idle-sleep assertion. Its first attempt timed out across
a host-log-confirmed 903-second sleep; that failed attempt is not a certificate,
and neither its assertions nor 15-second timeout were changed.
Typecheck, production web build and nested static artifact smoke pass. Bundle
`index-CNd9X9Qc.js` SHA256
`5a5b8238834e18b164f9fb1d0453d6d758b51008ace0c986b0c5bcc350453bad`
contains none of the inspected diagnostic API/replay markers. An initial broad
`getSnapshot` text check matched existing production performance telemetry;
it was not evidence of an exposed expression inspector. No runtime was changed
to remove that legitimate interface. New native/desktop/hardware/AT, hours,
performance, full cumulative and release checks are not certified by this
slice. Schema49/carry14, dependencies and upstream sources remain unchanged.

#### Longer ordinary voice exposure — 2026-10-05

Clean local `df6b4dd` was exercised through native controls in Firefox 157,
using the existing production artifact at `/tideweft/`, a disposable profile
and seed `phase ten glass ebb`. Bundle SHA256 remains
`5a5b8238834e18b164f9fb1d0453d6d758b51008ace0c986b0c5bcc350453bad`.
The existing v10 probe performs START, the real keeper warning, physical cargo
pickup/drop/recovery and travel using current public guidance only; it injects
no actor, event, position, weather, inventory or save. Three delivery-button
attempts were recorded; retained chronicle proves two completed handoffs:
8 Fresh Water to Latchmere and 14 Food to Bellwake. The final Reed Promise
remains unfinished. Ten journey recovery attempts and five rests occurred.
Sampled global displacement was 116.67 tiles, not an exact continuous path or
conservation witness.

Actual journey: 360.607 s; observation: 366.827 s / 1,995 reads, ticks 420→841
including ordinary rest batches. The bounded observer recorded 73 distinct
projection IDs: 34 player speech, one human response and 38 physical cues.
Player wording covered 13 distinct strings and one adjacent sampled repeat.
Seven sampled
"We've lost cargo!" lines accompanied repeated cargo-loss/recovery traversal;
the observed repetition is a review flag, not proof of a duplicate producer.
At most three candidates projected at once. There were 1,785 empty-projection
reads and a longest 51.487 s empty sampled span; these do not establish acoustic
silence. Maximum sample gap was 1.252 s. Both overflow flags and all incomplete
flags remained false. No animal call was sampled, leaving animal acceptance
open rather than proving absence or a failed source.

The keeper Relief and final Chart screenshots were inspected: source-associated
speech and separate shared captions were readable, with no pile in those two
frames. This is not a continuous DOM-collision, audible/assistive, hours,
busy-settlement, mobile-hardware, desktop, performance or release certificate.
The sole recorded console error matches the previously documented CSP
eval-probe denial; browser exited normally and its disposable profile was
removed. Result SHA256:
`2bc1cc29d946581462ac33811f4936c276c4e423c3c2882ffe61e8bdefb96a42`;
probe SHA256:
`3cb7d627ae902d55d152b840e5b477d2c64326896a8b3b8a6461d4ade2825bd5`.
This adds finite ordinary-play evidence after the existing 600-step exhaustion
eligibility repair, not equal-work before/after comparison or Voice closure.

#### Captured player-listening inspection — 2026-10-05

Local work over `91c1228` extends the existing default-off, 64-decision DEV
inspector, not the hearing algorithm. One real keeper secure-store response
captures its already-evaluated player contact through a detached, failure-isolated
observer. A read-only preview verifies that baseline with the existing contact
calculator and accepts only bounded masking/wind overrides. Actual receipt,
actual contact and hypothetical contact remain separate. Other producers remain
uncaptured; this does not implement terrain transmission or a full sound lab.

Targeted diagnostics/runtime tests pass two files/64 tests, including exact
enabled/off current-save, full UI/render and committed-audio equality, no saved
diagnostic fields, reset/reload retirement, strict overrides and copy failure.
The affected acoustic domain passes seven files/124 tests; the unchanged
introduction/save/audio late-closure rollback case passes. Maintained smoke
passes six files/105; typecheck, context-index 28 and player-facing-policy 39
checks pass. Production web build and nested static smoke pass; bundle
`index-B5w0WHiD.js` SHA256
`d32016291ea669a52c5340cd8cd431b38bc7f31cdd0433f830930f64038f6a7b`
contains none of the inspected diagnostic API/listening markers.

Firefox 157 at 1440×900 uses native START and the visible keeper-warning button
against separately served development source. The accepted tick-420 response
has actual certainty 0.57386; masking 1 yields a null hypothetical contact while
preserving the actual contact/receipt and selected same-stack public physical/
custody fields. Reset retires preview and finishes disabled. Interaction takes
224 ms and observation 384 ms/four reads: the 60,000 ms CLI bound is not a soak.
The screenshot was inspected and the keeper label/shared caption are readable
in that frame only. One known CSP eval-probe denial remains; browser exits
normally and its disposable profile/server are removed. Result SHA256
`63bd70aa3f24e096b55ac0a5594214caa4a1644a5c3e5ce5d2ddc985b14e016a`;
probe SHA256 `797bef51ac1343c6fd3d579350f07437af9cd7f888d3a20c5eb47a63047c5e3a`.
This is DEV access evidence, not production interactive, desktop, audible/AT,
hours, performance, full cumulative, release or Voice-closure certification.
Schema49/carry14, dependencies and upstream sources remain unchanged.

#### Listener-local water masking for core alarms — 2026-10-05

Local work over `c3ba359` repairs an existing consumer, not a new animal sound.
`propagateCoreEcologyAlarmObservationBatches` authenticated its source/frame but
fixed water masking at zero. It now uses the existing `ambientNoiseAt` field
at each registered listener tile. Source cause, event order/locus, species
sensitivity, wind, anonymous uncertainty and listener limits are unchanged.

Before the production edit, `coreEcologyPerception.test.ts -t 'uses
listener-local water masking'` fails both new human/dog cases. The dry and
source-only controls pass before the listener-water check: at distance7,000,
masking0.29508 makes the human contact unavailable and lowers dog certainty
0.578947→0.283867. The separate controlled runtime case, `-t 'restores pending
alarm hearing with real listener-local water masking'`, fails exact contact
equality: rain-only certainty0.626656 versus water-aware0.331576. Both commands
use `npx vitest run`, their corresponding file, `--maxWorkers=1 --no-cache`.

After the core-only repair, the new runtime case passes. A real fixture actor
commits the alarm from its perception/cognition; one physical water tile is
staged beside the stationary player, not a fabricated sound. Its saved pending
alarm reconstructs the same T+1 contacts, audio calls and every authoritative
saved root as uninterrupted execution. Only session publication and its
enclosing seal are excluded; immediate reload releases no old audio.
The affected six-file perception/ecology domain passes140 tests, including
the new malformed-neighbor fail-closed case. Four existing remembered-threat
hearing/closure tests and the unchanged introduction/save/audio rollback case
pass; maintained smoke passes six files/105 tests. Source module SHA256 is
`c65e03e6535a4d2190d14f21fed9038693e4b865f6e218edd623b35ab94d9c0b`.
Typecheck and production web/static nested-path smoke pass; bundle
`index-B5NZQlMl.js` SHA256
`08bdd2359781c00cb51f2cfb6d02eea21586a9ed482a97f546ef3854cc583676`.
The existing large-chunk warning remains.

Subsequent boundary review found that this newly connected consumer had not
validated the tide scalar before calling the shared calculator. Eight new
malformed-tide cases fail before the guard: missing/null tide throws; missing,
nonfinite, negative, negative-zero, fractional and excessive levels are guessed
through normalization. The alarm admission boundary now requires a plain tide
record and the existing safe-integer fixed-point range; shared hydrology and
its tolerant normalization are unchanged. Both valid endpoints remain accepted.
Core perception passes31 tests, the same pending-alarm save/reload case passes,
and maintained smoke passes105 tests. Typecheck, production build and static
smoke pass again. Guarded source SHA256 is
`311a165ce56b0d03970584946191a3f9f1ca3efc47c6bdc8182e67ff187f3ca1`;
new bundle `index-BHcMAKh3.js` SHA256
`e45e78b63c97704be0f8c23f21b723122ab83f48b94e47937b509c07db2d05bc`.
This is malformed mutable-view boundary evidence, not observed save corruption.

These are controlled unit/current-save proofs, not ordinary native encounter,
audible/AT, mobile, desktop-package, hours, performance or full-cumulative
certification. Terrain/foliage/interior propagation and wider Voice gates stay
open. Schema49/carry14, supported readers, dependencies and upstream sources
are unchanged; historical beliefs are not recalculated or discarded.

#### Guardian whine captured listening — 2026-10-05

Local work over `1bf9008` connects the existing guardian shelter-whine producer
to the existing optional player-contact diagnostic observer. It captures the
already-calculated contact only when DEV inspection is enabled. No second
hearing query, new acoustic producer, mapper, preview API or gameplay rule is
introduced; warning barks and defensive growls remain uncaptured.

Before the seven-line runtime connection, both existing visible/unseen storm-
whine/fall/cargo fixtures fail at the new non-null listening-context assertion.
The command is `npx vitest run src/game/runtime.fall.integration.test.ts -t
'composes a current storm shelter whine with real Promise fall and cargo
impact' --maxWorkers=1 --no-cache`. After connection both pass, preserving all
prior assertions. Their actual condition/work-owned whine retains exact hearing
and source uncertainty. Baseline preview matches the real contact; masking 1
produces only a null hypothetical result. Detached frozen diagnostics,
unchanged UI/render/audio, enabled/off full authoritative-save equality,
reset/reload retirement and late-failure rollback remain covered. The separate
synthetic unit composition does not represent an ordinary animal encounter.

Diagnostics pass 62 unit tests; runtime diagnostics pass three; the unchanged
introduction/save/audio late-closure rollback test passes. Maintained critical
smoke passes six files/105 tests; typecheck, context-index 28 and player-facing
policy 39 checks pass. Production web build and nested-path static smoke pass
(five files, 4,733,618 bytes). Bundle `index-DjpwkpMi.js` SHA256
`433a1377278d6847db7bb3b651d3fc19b957dc475048f8561a8e1d41a0519432`
contains none of the inspected diagnostic API/listening markers. The existing
large-chunk warning remains. These are controlled current-save and production-
exclusion checks, not a new native browser encounter, audible/AT, mobile,
desktop-package, hours, performance, full-cumulative or Voice-closure
certificate. Full expression/sound labs and the knowledge auditor remain open.
Schema49/carry14, supported readers, dependencies and upstream sources are
unchanged; no release or directive transition occurred.

#### Captured current factual knowledge audit — 2026-10-05

Local work over `acfe447` extends the existing default-off,64-record DEV
inspector rather than adding comprehension or a second sensory simulation.
Event-time source checks call the existing keeper/introduction/warning/weather
validators. An optional observer copies the actual successful selected-human
listening frame; post-transaction finalization joins fresh retained beliefs by
listener, tick and observation ID. Player receipt matching is not comprehension.
The current keeper decoder alone carries anonymous `store-secured-report`
above its existing450000 threshold. Other speech conveys its sound class only.
Missing source/listener capture is reported as unavailable, not certified absent.

Ten new human-observer cases characterize clear/weak/masked contact, own-source
exclusion, unavailable geometry, malformed/late-invalid frames, detached frozen
copies, throwing callbacks, production exclusion and the existing64×8 bound.
Before implementation eight fail and two pass; final human perception passes
43/43. A new synthetic warning receipt initially exposed a diagnostic-validator
gap: without a decoder it accepted `large-predator` understanding. Checking the
existing `situatedExpressionSoundClass` fixes that report without changing
hearing. All13 source/listener audit tests pass, including actual committed
constructors for the four source validators. Synthetic receipt-shape tests do
not establish ordinary hearing or player-accessible encounters.

`npx vitest run src/game/humanPerception.test.ts
src/game/situatedExpressionDiagnostics.test.ts
src/game/situatedExpressionKnowledgeAudit.test.ts
src/game/settlementKeeperStoreResponseExpression.test.ts
src/game/residentIntroductionExpression.test.ts
src/game/humanDangerWarningExpression.test.ts
src/game/residentWeatherHoldExpression.test.ts --maxWorkers=1 --no-cache`
passes seven files/154 tests. Runtime diagnostics pass four tests, proving
the real keeper UI action, selected human observations and saved fresh beliefs,
enabled/off full-save/audio/UI parity, immutable query reports, reset/reload
retirement and provisional-audience rollback after a real late interval failure.
Unchanged introduction/save/audio rollback, keeper pending-save/one-time
receipt and two visible/unseen mixed whine/fall/cargo cases pass together:
three files/four selected tests,137 excluded. Maintained smoke passes6/105;
typecheck, context28 and player-facing policy39 checks pass.

Production web build and nested-path static smoke pass five files/4,733,775B.
Bundle `index-DigJMANA.js` SHA256
`74f37358efa18d5ae52afb10921af99d3f6c5a0ce0a4a58ee198accf32cbea4a`
contains none of nine inspected exact diagnostic markers. Substring searching
`knowledgeSource` also matches the legitimate existing species field
`knowledgeSources`; exact-marker inspection distinguishes that unrelated code.
The existing large-chunk warning remains. No new native browser/audio/AT/mobile/
desktop-package/hours/performance or current-head cumulative certificate is
claimed. The full knowledge auditor, expression/sound labs and broader Voice
closure remain open. Schema49/carry14, supported readers, dependencies and
upstream sources are unchanged; no release or directive transition occurred.

#### Quiet guardian recruitment and water-masked counterfactual — 2026-10-05

The complete regression on frozen local `2818375` finishes with 359/360 files
and 3844/3845 tests passing in 1314.12s. Its only failure is the existing
marsh-edge rabbit-alarm/guardian-investigation example. An unchanged focused
rerun reproduces it. The newly shared listener-local water mask is intentional;
the old fixture's nominal meadow corridor has elevation0 under tide505000.
At the actual registered guardian tile, depth505000 yields mask0.150434 and
anonymous alarm confidence139942, below the existing work threshold180000.
Clear air does not establish a quiet water field. Neither rabbit alarm meaning
nor guardian disposition/threshold was changed to make the test pass.

The correction changes only the controlled fixture: dry ground extends through
the listener's complete two-tile masking halo before regional-view construction.
The original investigation, physical search, fox-deterrence, anonymity and
nonlethal assertions remain. A same-source/distance flooded counterpart proves
real retained hearing with insufficient confidence and lawful `watch`, rather
than automatic task admission. These are controlled shared-owner proofs, not
ordinary player encounters or a new acoustic producer.

`npx vitest run src/game/coreEcologyMarshEdgeEmergence.test.ts
src/game/coreEcologyPerception.test.ts src/game/settlementWorkingAnimals.test.ts
src/game/settlementWorkingAnimals.guardianInvestigation.test.ts
src/game/dogBehavior.test.ts src/game/dogSignalExpression.test.ts
--maxWorkers=1 --no-cache` passes six files/88 tests. Maintained critical smoke
passes six/105 and typecheck passes. The failed cumulative result remains failed;
focused/domain passes do not certify the entire corrected head. Runtime, schema,
supported readers, dependencies, upstream and existing production artifacts are
unchanged. No release or directive transition occurred.

#### Bounded captured-expression repetition inspection — 2026-10-05

The local candidate based on `747619a` extends the existing default-off DEV
inspector, not gameplay or hearing. Its 64-record ring alone cannot retain
capture-period repetition or measure quiet exposure. Bounded first-seen groups
now count actual logged decisions/reasons and admitted-decision family, source
and supplied wording; overflow is explicit. These are not unique world-event,
audio, caption or settlement-density counts. The Architecture inspection
contract owns the API and its exclusions.

Nine synthetic unit cases include 2,000 logged decisions, ring eviction,
contextual wording, 64-key overflow, deterministic ranking, detached/frozen
reports, clone failure and saturation. They establish counter behavior only,
not actual producer rates or thousands of gameplay events. Joint diagnostics
and repetition tests pass two files/77 tests in1.21s with
`npx vitest run src/game/situatedExpressionDiagnostics.test.ts
src/game/situatedExpressionRepetition.test.ts --maxWorkers=1 --no-cache`.

The real runtime keeper action supplies one admitted response. Ten successful
quiet steps contribute1,000ms despite producing no further decision; disabled
capture contributes nothing. The short-window ratio60 per accepted simulation
minute is an extrapolated decision/exposure ratio, not an observed speech rate
over a minute. A new title/no-op characterization initially fails: the first
diagnostic hook incorrectly counts2callbacks/200ms because the wrapper succeeds
when `tick` returns without playing. Matching the existing tick-entry pause,
title and Quiet Hour gate fixes inspection only. Actual quiet/resume frames then
retain exactly7enabled steps out of9accepted steps; disabled and paused frames
do not inflate the denominator. Full save/UI/render/audio parity, reset/reload,
pure queries and failure isolation pass all six runtime-inspector cases in17.67s.
A late interval failure preserves nine prior steps and discards provisional
source/audience changes; failed exposure inspection cannot veto committed audio.

Existing kernel/channel/reception/knowledge tests pass four files/55. The
unchanged introduction-save/vocal-audio rollback case passes1, and both current
mixed shelter-whine/Promise-fall/cargo cases pass2. Maintained critical smoke
passes six/105; typecheck and production web build pass. Static nested-path smoke
passes five files/4,733,775 bytes. Production JavaScript remains byte-identical
to the prior inspector checkpoint: `index-DigJMANA.js`,4,619,056 bytes, SHA256
`74f37358efa18d5ae52afb10921af99d3f6c5a0ce0a4a58ee198accf32cbea4a`;
none of seven inspected diagnostic markers is present. No new browser/audio/AT/
mobile/desktop-package/performance/hours or current-head cumulative certificate
is claimed. Broader Voice/lab closure remains open. Schema49/carry14, readers,
dependencies, upstream sources and release/major-directive order are unchanged.

#### Current ordinary animal captions in Chart and Relief — 2026-10-05

Frozen local `c74975cf37a36be6fd2f03d8d5114a00a9f77b06`, tree
`ce2b7a14301f821a849128f45d8b989d05bb5c3c`, now passes the complete maintained
regression: 361 files/3,857 tests, zero failed or pending, in 1,284.82s. Exact
command is `caffeinate -i npm run test:ci -- --reporter=default --reporter=json
--outputFile=artifacts/validation/c74975c-cumulative.json`; the preceding context
and player-facing selftests also pass 28/39. The JSON SHA256 is
`fd995ab670a123563b4531bb15141adab95f1388d5afbc850d78dcc90b80637a`.
Executable, tests, configuration and HEAD stayed unchanged throughout. This
certifies that checkpoint, not whole Living Voice closure or publication.

After that run terminated, two finite ordinary-control animal opportunities
used the unchanged production bundle `index-DigJMANA.js`, SHA256
`74f37358efa18d5ae52afb10921af99d3f6c5a0ce0a4a58ee198accf32cbea4a`,
served at `/tideweft/` in disposable Firefox 157 profiles, 1440×900/DPR1,
Node 22.20.0/npm 10.9.3. The host was on battery 63%→61%, Low Power Mode off;
these are functional observations, not comparable performance measurements.
Physical START typed `breathing-room all-tide corridor 187`; native W movement
stopped after the real caption appeared. Chart movement is northward; Relief
movement is camera-relative. No actor, event, weather, inventory, position,
save or runtime-action injection, pause, or forced encounter was used.

The existing ignored local probe's former unconditional animal-attempt success
could pass with no call. Its bounded rAF observer now requires an actual current
animal UI caption, matching visible DOM event ID and exact wording, empty animal
speaker span, positive geometry, no clipping or overlapping field feedback,
and public disappearance. Screenshot brackets recheck computed visibility,
wording, ID and actual view before/after capture. No-call or expired-picture
opportunities cannot pass. Review caught and corrected initially weaker
screenshot brackets; syntax checks pass. The probe is not shipped, and no game
producer, hearing rule, presentation algorithm or persistent state changed.

The Chart-first opportunity lasts 60.041s, with 60.286s/531 public reads. At tick 424,
3.873s into its rAF observation, one anonymous bird caption joins the visible
DOM: `CALL. · direction unclear`, accessible copy
`[A bird calls; direction unclear.]`, and no exact world glyph. Its
203.583×17.717px rectangle is unclipped and does not intersect observed labels,
EVENTS or the action dock. The matching-ID screenshot bracket passes; inspected
pixels show readable text. The subsequent Relief capture crosses disappearance
and has no call: its bracket fails, so it is not live two-view proof.

The separate Relief-first opportunity lasts 60.103s, with 60.139s/463 reads. At
tick 424/4.206s its current caption has the same lawful anonymous wording, exact
public DOM-ID join, positive unclipped geometry and no observed peer overlap.
Its Relief screenshot bracket and inspected pixels pass. Its later Chart
capture is expired and unavailable. These are two independent finite exposures,
not two different species, simultaneous two-view text, or equal-input terminal
world equivalence. In each run one animal caption is observed; no actor-anchored
acoustic glyph appears. Public disappearance is observed at 4.315s/4.536s,
not authenticated expiry of a hidden event.

The captures retain 527/460 empty reads, 269/388ms maximum sample gaps, and no
observer overflow or incomplete census; these counts do not establish continuous
audible silence or emitted-call rates. JSON SHA256s are
`3f79e2b9572f0dd9cdd85f7339e8c1912673869c668750d82e738fbc1c8e1619`
and `df357872f1e81fcbcc60e578d7ef0f2efee04d1e379a54000f43e617fc541256`;
exact probe SHA256s are
`d7618c7f77cb543cbc637453a6ab93d1eaedfcde58cbf9078e759f83018dcfc4`
and `5a1fc30e1a7887ed5e904b06cf526906cb76db8532df219dc7ca876e5ae7457f`.
Both browsers exit normally and their disposable profiles are removed; the
user's browser and saves remain untouched. Each retains one known CSP eval-probe
denial, not a console-clean result. This adds current ordinary animal-caption
evidence only: hidden species/motivation, NPC hearing, audible/assistive quality,
dog encounters, dense/mixed scenes, mobile hardware, hours, performance,
desktop packaging and release/major-directive gates remain unclaimed.

### Narrow-viewport ordinary animal captions — 2026-10-05

Three sequential production-browser opportunities on clean local
`83af079376881477611765ed33c6736a703ed128` use the unchanged bundle above,
ordinary START/W controls, the same current seed, and a verified
390×844 CSS/DPR1 viewport. These are desktop Firefox 157 layout observations,
not physical mobile or touch evidence. Battery readings are 53% before and 50%
after, Low Power Mode off; the user's packaged game and browser remain running
and untouched. No performance comparison is claimed.

The existing ignored probe accepts explicit narrow Chart-first/Relief-first
aliases. Its initial v14 Chart-first run passes 60.057s; review then strengthens
screenshot brackets with capture-time clipping, bounded peer collision and
actual viewport checks. Version 15 also rejects unexpected/truncated console
errors and retains a profile if owned-browser exit is unconfirmed. Review finds
that late shutdown errors could evade the early verdict; v16 reevaluates the
console after teardown and bounds peer candidates before measuring them.
`node --check` and four isolated actual-helper characterizations pass, including
late unexpected errors and omitted error records. These are observer repairs,
not gameplay, hearing, presentation or save changes.

The final representative commands are:

```sh
node artifacts/validation/voice-current49/native-play-9cc87d3.cjs 60000 animal-relief-narrow
node artifacts/validation/voice-current49/native-play-9cc87d3.cjs 60000 animal-narrow
```

Both terminal runs pass. Relief-first/v15 lasts 60.003s and retains
535 reads over 60.074s; Chart-first/v16 lasts 60.071s and retains
537 reads over 60.207s. Each observes one anonymous bird caption at tick 424,
first seen at 4.034s/3.935s respectively. Exact current public and DOM IDs join
`CALL. · direction unclear`, with an empty speaker span and no world glyph.
The observed 169.833×14.683px rectangle at (110.083,681.417) is unclipped and
separate from active world labels, event text and controls. In each opportunity,
both Chart and Relief screenshot brackets pass before the same call expires;
all four inspected images contain readable, nonoverlapping captions. This is
across a native view switch, not simultaneous render loops or three species.

Public disappearance occurs at 4.430s/4.396s. The observer retains 531/533 empty
reads, maximum gaps 310/274ms and no overflow/incomplete result. These are
sampled presentation facts, not audio rates, continuous silence or authenticated
hidden-event expiry. Each final console contains only the one known CSP
eval-probe denial, not a console-clean result; browsers exit zero and owned
profiles are removed. No unknown late error appears.
The final JSON SHA256s are
`2298bd9f5d506a0e5e51e7f43c8df3a78125724fdd7c4c8b74079d8761187f92`
and `f1b97a50bba9e49dcfbf2716193332adae54bbd8d1a437c6cfde4ad581b34808`;
their probe SHA256s are
`b8d3560b8ea43aa1d6201c66ab2e8944f218ad4f054059b4101e549e076c8b78`
and `eed9f2bd233653d412072082922d71f6556f75fa3b48c8f2d29e4fa50c2822c4`.

No public executable, schema49/carry14, supported reader, dependency, directive
or release changes. The prior exact executable cumulative evidence remains
applicable under the documentation-only exception. Broad animal encounters,
mixed scenes, audible/assistive quality, mobile hardware, hours, terrain
propagation, performance and release gates remain open; this narrow result does
not certify them.

### Dry-ridge hearing characterization — 2026-10-05

The local candidate now has a producer-to-listener counterfactual in
`coreEcologyMarshEdgeEmergence.test.ts`: a real rabbit visual observation of a
fox drives its normal cognition to commit an alarm. The same authenticated
event, source pose, guardian pose, weather and tick are propagated first across
the dry corridor, then after raising only intervening tile `(39,31)` to a dry
ridge. The registered regional projection retains exact endpoint tiles and
both complete 5×5 water-depth masks; listener-local masking remains zero.
The changed projected tile is checked explicitly. No second alarm, injected
sound, movement, text, renderer visibility or optical hearing gate is used.

The current result is **identical audible contacts, anonymous observations and
fresh guardian beliefs**. Source exclusion and absence of rabbit/fox identities
from those hearing observations are checked. This confirms missing terrain-path
transmission; it is a baseline characterization, **not** passing terrain-hearing,
ordinary-play, historical-belief restore or runtime-transaction acceptance.
Optical obstruction coefficients are not acoustic absorption. Current aerial
activity has no event-time acoustic altitude, so a future law must not silently
assume every call is grounded or invent structure/foliage geometry.

The current save validator independently reconstructs active player receipts
at event time, including hearing certainty and anonymous bands. A propagation
change therefore needs an explicit compatible/versioned receipt decision before
admission; historical beliefs must not be rewritten, and pending stimuli still
receive lawful next-interval hearing once. No propagation law, schema, reader,
save policy, dependency or gameplay behavior changes in this characterization.

Final targeted command:
`npx vitest run src/game/coreEcologyMarshEdgeEmergence.test.ts --maxWorkers=1`
passed 1 file / 4 tests in 1.91 seconds; `npm run test:smoke` passed 6 files /
105 tests in 4.05 seconds, and `npm run typecheck` passed. No production/browser,
packaging, performance, cumulative, publication or directive-closure result is
claimed by this test-only slice.

## Simulation-design findings

### Length-dependent caption reading time — 2026-10-05

The local unpublished caption candidate over `4ec64f4` gives the existing
bottom caption a single UI-only reading lease at 21 visible Unicode code points
per second, minimum one second. Speaker prefixes and coarse directions count;
expanded screen-reader descriptions do not. The first display starts the clock,
not each publication. Routine incoming cues do not interrupt the reading slot;
explicit urgent cues may preempt, subject to existing priority. Live-region
admission remains independent. No audio, hearing, world-source label lifetime or
serialized event is extended by this presentation change.

Focused projection/UI tests passed 7 files/83 tests; reading-time and existing
runtime fall integration passed 2 files/68 tests. Typecheck and the maintained
critical smoke passed (6 files/105 tests). The changed exact caption-shape
expectations now include its real presentation priority, not relaxed matching.
The current candidate also compiled for production web and passed the static
`/tideweft/` artifact smoke; this is not interactive production-browser proof.
These focused checks do not certify other unfinished candidate changes.

The existing ignored mixed-view page hosted the actual current development UI
in Firefox 157 at 1280×720. A synthetic 16-character visible line retained its
one-second lease; an 85-character line retained its 4,048-ms lease. After absent
projection and unchanged-revision updates, both expired without replay and
released their reservation (3 boxes to 2). Urgent preemption and quiet-overlay
clear/no-replay passed; the frozen public fixture remained unchanged. Exact
source hashes, commands/probe and observations are retained in local
`artifacts/validation/voice-current49/native-caption-reading-21cps.json` and its
companion probe. One known CSP eval-probe denial remains, not a console-clean
claim. The owned browser exited and its disposable profile was removed.
This is synthetic DOM timing evidence, not ordinary gameplay, physical mobile,
assistive hardware, production-browser/packaged desktop or hours acceptance.
Old frozen-caption checks assuming indefinite paused display must be made
deadline-aware before reuse; old projection disappearance is not DOM expiry.

### Native caption-lease acceptance — 2026-10-06

The local unpublished tooling slice over `9b2ab37` reconciles the existing
Firefox functional harness with that reading contract, without changing game
source, save formats, dependencies or shipping caption lifetimes. Each live
viewport/view now uses a freshly earned existing producer in its own disposable
profile. Omitted selectors still require all eight states; explicit width/view
selectors report partial evidence. Passive bounded DOM observations count the
actual visible Unicode copy, never the expanded ARIA description. Actual DOM
speech may match either lawfully observed pair member, not necessarily the
latest projection. Reading and projected-event expiry are independent gates.
Same-ID live checks bracket screenshot capture; expiry during capture fails
before a PNG is accepted. No UI clock, sound or hearing event is extended.

Production `build:web` and nested-path `smoke:web` passed: 621 modules and five
served files / 4,754,987 bytes. The served artifact integrity is
`40074afa48b1bc93fa9bb02a21ace11c211f84806ab0fa2659dfc36f2cc6ee84`;
its JavaScript SHA-256 is
`fb679e7493b4c83ae1c786abd4673510fa7614e925a82155994fd8daf2f62414`.
Node 22.20.0/npm 10.9.3 and installed Firefox 157 were used. The final harness
SHA-256 is `e7374a82651d424eaaf521e9fc93c91cfabe11b24fbfd34998862ab27c62b890`;
its selftest is `8a04b56e71543b50208a942585092695dcf5499b08338ee2307b33a503e46337`.
The matched native capture records source HEAD and dirty diff
`e2c73f9859bcc0dbca8dcb8f8a199ed470249927f3ea3227633cf5911f075079`.

`profile:browser -- --voice-presentation --output
artifacts/validation/voice-current49/native-lease-greet-matrix-02.json` passed
all four supported viewports in Chart and Relief. Eight real introductions
each displayed 47 visible code points: budget 2,239 ms, observed native duration
2,243–2,400 ms. All eight current-save reloads preserved learned ABOUT facts
and excluded expired cue/announcement replay. Live geometry and post-capture
continuity passed; representative desktop, portrait and short-landscape
screenshots were inspected. The aggregate checks exact source/artifact/harness/
browser identity; children remain partial independent sessions, not equal-work
or uninterrupted-play witnesses.

Selected `--paired-greetings --reduced-motion --presentation-width 1280
--presentation-mode relief-3d` and `--animal-presentation --reduced-motion
--presentation-width 390 --presentation-mode relief-3d` passed with fresh
`native-lease-pair-desktop-02.json` and `native-lease-animal-portrait-02.json`
stems beside the matrix. The pair had two distinct nonoverlapping native labels,
zero ordinary-label overlap and both learned ABOUT states after reload. The
anonymous bird caption had no hidden-source anchor. Both observed reading
expiry, one-copy announcements, capture continuity and current-save nonreplay.
These selected producers do not establish their complete eight-state matrices.

The direct browser-harness selftest passed with original acceptance negatives
preserved and new lease, selector, matrix and capture-race characterizations.
Caption/live-region tests passed 2 files / 47 tests; maintained critical smoke
passed 6 files / 105 tests (final run 6.97 s). Initial single-state trials passed;
an earlier matrix was deliberately stopped after four partial children to add
the reviewer-found screenshot race guard, not counted as complete acceptance.
The final pipeline exited successfully. A known startup/reload CSP eval-probe
denial remains explicitly authenticated by the guard, not console-clean proof.
Disposable harness profiles were removed. This is synthetic-world production
browser presentation evidence, not audible audio, assistive hardware, physical
mobile, desktop packaging, full animal/physical coexistence, crowd/soak/FPS,
cumulative regression, publication or Living Voice closure.

Further unchanged-artifact checks at clean `715b6aa` passed the full normal
anonymous-animal matrix (eight freshly earned bird calls, 25 visible code
points / 1,191 ms budget / 1,211–1,469 ms observed). Every source remained
unanchored, expired naturally and did not replay after current-save reload.
Eight successful reduced-motion paired-speech witnesses were also accepted by
the existing `assertVoicePresentationMatrix`, reusing matched successful child
reports rather than rerunning them: 47/62 points, 2,240–2,261 / 2,956–3,105 ms
observed; both learned ABOUT states persisted. Relief placed two labels at
desktop/portrait widths and one at short landscape; no ordinary-label overlap.
Representative Chart/Relief screenshots were inspected. These are independent
finite sessions, not continuous-play, audio, mobile-hardware or soak proof.

The original paired matrix and one selected attempt stopped at the post-reload
desktop title-menu physical-click check. The exact unchanged compact recheck
and later remaining states passed. Failed attempts remain retained, not counted
as passes or silently replaced by a falsely completed original aggregate.
Two separately instrumented local passive click probes saw trusted down/up/click
delivery to the actual button and successful title opening; their extra observer
is excluded from acceptance. Responsive hit-layout timing remains an unverified
hypothesis, not a diagnosed game defect or delivered fix. No runtime or public
harness change followed those observations. The normal animal aggregate is
`native-lease-animal-matrix-03.json`; successful paired children span the `-03`,
`-04`, `-05` and `-08` stems under the same ignored validation directory.

### Captured traversal-context expression preview — 2026-10-06

The local development-only slice over `eb91237` adds `previewProducer()` to the
existing bounded inspector, not a new gameplay producer or simulation loop.
It first verifies exact captured traversal replay, then selects copied hazard
severity or cargo shock and reruns the current mapper/kernel. Tests cover the
existing serious-hazard and important-cargo thresholds, cargo-loss precedence,
unchanged identity/custody/prior state, malformed selections, failure isolation,
eviction/reset and actual refusal separate from hypothetical acceptance.
Uncaptured personality, relationships, full emotion and other producer
selections remain unavailable; the full lab is still partial.

Diagnostics passed 1 file / 83 tests. The actual two-stumble boundary-reload
fixture and complete current runtime-inspector owner passed 2 files / 7 tests
(26 unrelated fall tests unselected). Both hypothetical ordinary and serious
reactions leave actual views, audio, diagnostic counts and current-save bytes
unchanged; the original enabled/disabled/reload parity remains intact.
Maintained smoke passed 6 files / 105 tests. Typecheck, production web build
(622 modules) and static web smoke (5 files / 4,759,431 bytes) passed. The emitted
JS `index-CdoXx_bE.js` and CSS `index-BY0KDEk3.css` remain the same as the prior
learning slice; new preview markers are absent from production JS. These are
correctness and compile-time exclusion checks, not a new native playtest,
performance, package, cumulative, release or directive-closure certificate.
No schema, save reader, dependency, version or gameplay scope changed.

### Capture-period animal-vocal inspection — 2026-10-06

The unpublished DEV-only repetition report now separates admitted animal vocal
decisions from the wider `animal-signal` category. It reuses the existing closed
thirteen-family vocal lookup: human contours and rabbit body thumps do not
count. Event plus admission is still a captured decision, not reauthentication,
unique world events or total audio; optional ecology refusal can still produce
lawful sound outside this admitted subtotal. Rates use accepted simulation
time, with the existing quiet-step, rollback, reset, no-save and bounded policy.

Pure diagnostics/repetition/knowledge tests pass3files/147; the eight added
census cases are explicitly synthetic. Existing actual keeper/guardian mixed
integration passes2files/8selected,25unselected. The genuine storm shelter
whine contributes to the total over ten accepted100ms steps; save, inspection,
reset/reload and late failure preserve the existing authority and counter
boundaries. This short controlled rate is not ordinary animal-call frequency.
Critical smoke105, typecheck, production web622modules and nested static smoke
PASS. Production JS/CSS are byte-identical to the previous CdoXx_bE/BY0KDEk3
artifact, and new diagnostic markers are absent. No game producer, schema,
dependency, released behavior or hours-long annoyance claim changed.

Manual review of the current forty literal realizations across twenty-five
meanings and the authenticated introduction template finds no authored
profanity. Generated names, arbitrary contextual text, unheard/unobserved
events and actual long-play rates are not classified by that finite inventory.
No universal zero-profanity counter or NLP subsystem is claimed.

### Learned animal-call recognition — 2026-10-06

Native follow-up on clean `ba6deb0` uses the same current production bundle
`index-CdoXx_bE.js`, with an exported pre-call current50/carry14 rainy-cat
fixture from the existing ecology integration owner. Its temporary read-only
export hook was removed and the original test bytes restored. Initial knowledge
and pending vocal events are empty: the starting actor/environment fixture is
synthetic, not the call, learning or caption.

Firefox157 passed desktop Chart1280×720 and narrow Relief390×844 functional
checks. Actual fixed-step rain retreat at tick421 presents plain `cat call`,
without brackets or an extra speaker label, in both native text and ARIA copy.
Screenshots were inspected; both captions have positive in-viewport bounds and
no overflow. Each actual live region delivers exactly one `cat call`.
At tick427 current saves retain learned cat and chicken families from tick421;
the fixture also lawfully caused a chicken alarm, so it is not cat-exclusive.
Reload accepts the save and preserves the exact knowledge; the next real
interval reaches428 without replaying the consumed caption or announcement.

The local probe reuses existing BiDi/static-Pages serving and disposable
profiles. Both final children exit normally and remove those profiles. Three
retained known CSP eval-probe denials occur per child across its three documents;
this is not an unrestricted console-clean certificate or a security-policy
change. Earlier children verified text/ARIA/reload only; the final observation
uses the actual `#announcer`, rather than a generic polite region. Evidence is
local under `native-learned-cat-ba6deb0-*-announcer-v2`; this proves one selected
learned family from controlled initial conditions, not a later new unseen call,
ordinary encounter rate, emitted audio/AT hardware, full-root equivalence,
hours, mobile hardware, performance, packaging or directive closure.

The local unpublished slice over `03eb624` learns only an existing vocal family
from a fresh committed call jointly heard and directly seen. Real ecology
calls teach even with refused optional captions; a refused guardian vocal
intent is not a committed call and teaches nothing. The player root stores
at most thirteen current families, no caller identity, position or motive.
Later lawful captions use plain lowercase copy such as `fox call`, retaining
only the original direction/uncertainty. Public caption values contain animal
labels, not cause-bearing vocalization keys. Rabbit contact and aggregate
chorus identification remain excluded, not newly scaffolded gameplay.

Focused memory/projection/caption tests passed 3 files / 142 tests. Eleven
runtime persistence, real cat/fox/guardian, masked/unseen, refused-capacity and
late-failure cases passed across three owners. They preserve current roundtrip,
consumption and rollback; supported absent knowledge explicitly means empty,
whereas malformed present records fail closed. Reception/human hearing/save
policy/live-region tests passed 4 files / 69 tests; maintained smoke passed
6 files / 105 tests. Typecheck, context-index selftests, production web build
(622 modules) and nested static smoke (5 files / 4,759,431 bytes) passed.
These are correctness checks, not performance measurements or a new native
recognized-call/browser, package, hours, cumulative or Voice-closure proof.
Schema 50/carry 14 and release identity remain unchanged. The release-sync
wrapper correctly rejects the unpublished source delta until an intentional
atomic tutorial/patch/version review; no release gate was weakened.

### Ordinary Voice journey observation — 2026-10-06

Before that learning slice, clean `03eb624` used the unchanged production
artifact recorded above for one six-minute Firefox normal-controls journey.
The existing bounded passive probe observed 2,451 reads / 59 distinct projected
cues: 25 player, one keeper and 33 physical, with no animal call observed.
There were eleven player wordings, no adjacent-observation identical repeat,
and at most three projected candidates. Warning/recovery wording fit the
actual travel/cargo context; most reads had no projected cue. Empty projection
is not acoustic silence, and this finite run is not hours-annoyance acceptance.
Physical pickup/drop/recovery and two chronicle arrivals occurred, but the
final native Chart still required recovering three Reed before delivery.
The terminal probe passed and removed its disposable profile. One previously
authenticated startup CSP eval-probe denial was recorded; this is not
console-clean, exhaustive conservation, reload, audio/AT or performance proof.

### Interrupted extended ordinary Voice observation — 2026-10-06

Clean `11498d2ed44dfc419be940d121720b6dc6482a61` used the unchanged
production `index-CdoXx_bE.js` (SHA256
`22efa0f7fdda413a4dd916064657d1b5aa5e55a95a9ed328582cc56f75df4bb9`)
in Firefox at 1440×900/DPR1, served as static files under `/tideweft/`.
The local ordinary-controls probe requested 7,200,000ms, used the public
`phase ten glass ebb` start, and injected no actors, events, weather, inventory,
positions or saves. Initial physical pickup/drop/documented E-key recovery
passed its eight-unit lot, condition and restored-delivery checks. Subsequent
compass-guided travel, parcel recovery, rest and handoff inputs were ordinary
controls, not a safe-route oracle or a full transaction-conservation witness.

The run ended **incompletely** after its minute-56 checkpoint: WebDriver BiDi
reported a closed socket while a command was pending. Retained sampled exposure
is 3,366,629ms / 16,788 reads, with world tick420→4356. Three closed nominal
fifteen-minute windows retained177/124/172 first-observed projection IDs; the
665,647ms partial window retained104. Windows can recount an already-active
boundary cue, so these are not summed unique emitted events. Their player
speech counts are76/51/76/46, with5/8/6/2 adjacent single-observation wording
repeats. Repeated genuine cargo incidents under crude compass steering limit
annoyance conclusions. Distinct retained player events repeat `Got it back.`
575ms apart, `We've lost cargo!`1,204ms apart and `Hold fast.`1,853ms apart.
These are sampled wording gaps, not audio timing or invalid physical actions;
they warrant a narrow current cargo/traversal cooldown review before annoyance
acceptance. Snapshot chronicles retain five distinct `Promise kept` receipts;
seven delivery input attempts alone would not establish seven deliveries.
At most four projected candidates were sampled—not a
native four-label geometry or overlap certificate. No animal call was sampled;
that is not proof that no call occurred.

All window and wording incomplete/overflow flags are false. The separate raw
trace reached its512-event cap; it is not a complete event history. Sampling
gaps reach2,860ms. The sole retained console error is the previously identified
startup CSP eval-probe denial, not a console-clean claim. The owned browser
exited with SIGTERM during cleanup and its disposable profile was removed;
that does not establish a browser crash or the cause of the connection loss.
No terminal screenshot or authoritative save was obtained. This attempt does
not pass the requested two-hour observation, qualitative audio/accessibility,
wilderness coverage, performance or directive-closure gates. No game fix,
dependency, schema or quality reduction follows from the unverified failure.
Terminal local artifact `native-play-11498d2-7200000-v17.json` has SHA256
`a1d46bba5419b68add50a413e3a663ca44f3a6d108e3c0ec5f9f8fe13a3e2c6d`;
probe SHA256 is `ef8d78a858ca20950ee29f7d1be561b004c0d4e4558b97ca8ed55be01455a0c9`.

### Current cargo boundary and reduced-output characterization — 2026-10-06

The test-only local slice over `5aad99b` leaves production behavior and schemas
unchanged. `runtime.fall.integration.test.ts` acquires a real Promise, earns
one ridge fall on its existing controlled initial fixture, and reaches two
actual parcels. Recovery of the first at phase9 supplies the shared current
save. Both branches recover the second conserved parcel and add its exact
quantity to the carrier. An immediate second recovery refuses optional relief
with `meaning-cooldown`; one accepted idle step closes the old interval and
allows a fresh relief. That is only one step of the fourteen-step meaning law.
This locates the presently interval-local cargo limitation; it is not a
repetition fix or final annoyance acceptance. Consumed acoustic channels remain
retired under their existing contract. Separate durable accepted-choice history,
not replayable sound or a caption timer, is the appropriate repair owner.

`runtime.expressionDiagnostics.test.ts` also delegates to the real Soundscape
against a test-owned Web Audio graph. Normal, disabled, master-zero,
effects-zero and blocked-context output process the same keeper interaction
and ten accepted steps, world tick420→421. Exact pending/final authoritative
save strings, hearing/retained anonymous knowledge, captions, captured decisions
and attempted committed cues match. Normal schedules tones; zero gain still
schedules the same cues, while disabled or suspended output creates no tones.
Owned panner timers and pending resumes are cleaned up without faking the
simulation clock. This proves a representative current output/authority
separation, not device audio quality, actual assistive-technology delivery,
all producers, long-play, performance or directive closure.

### Cross-interval cargo choice repair — 2026-10-06

The local implementation over `85bcae4` extends the existing bounded
`playerExpressionRecency` owner to protection/loss/recovery, one latest origin
per meaning and three total. Actual traversal uses its movement-step frontier;
manual and automatic pickup use their committed action phase. Existing
12/20/14-step meaning and 4/8/5-step family laws remain exact. Recovery resolves
recent loss precedence without bypassing its own meaning lock. Sound-channel
closure, physical pickup and independent audio remain separate and unchanged.

The existing real-Promise/two-parcel fixture now proves relief refusal in the
same phase, across consumed interval/current reload, and at age13; exact age14
admits a new relief. Every pickup conserves the lot's total and exact recovered
quantity. A controlled optional-admission refusal at that same eligible
frontier changes neither physical cargo nor world state and mints no choice
history. Full fall/recovery tests also retain automatic audio release and
late-failure rollback of all authoritative roots. Factory-built contract tests
separately cover original-frontier ordering, bounded state and malformed facts;
they do not stand in for playable physics.

Outer50/carry14 now emits nested recency2. A small deliberately supported
exact-v1 load-only upgrade validates original state and pending physical/
acoustic facts, then adopts only known pending cargo; consumed history starts
empty. Actual pending/consumed loads replay no cue, and missing, duplicated,
extra or unknown current facts fail without overwriting their records. Current
writer validation stays strict; no outer-format retirement or dependency change.

Local validation: `npx vitest run` with one worker passed the eight authority/
recency/traversal/kernel/channel/causal-owner files (91 tests). Two-worker full
fall/time-action/WAIT/diagnostic integration passed four files/46 tests in
138.09s. Selected current-save/animal-knowledge/introduction-rollback runtime
tests passed5; maintained `npm run test:smoke` passed105. Typecheck and context
selftests28 passed. Learned-call/fox-caption selection passed49 tests; the
production web build and static `/tideweft/` artifact smoke also passed. This
is source/test acceptance of one repetition repair,
not a new native hours/quality/audio/accessibility, performance, cumulative,
published-release or whole-directive certificate.

### Cargo repair ordinary-controls check — 2026-10-06

Clean `41ca12c742b8d17ed4d97fa77da1163bf7337ad0` passed the existing
six-minute Firefox production normal-controls journey at 1440×900/DPR1,
served under `/tideweft/`. Its `index-B09tJR1g.js` SHA256 was
`d985be59199d644f9f82bb36ae1be9318e5b238372e67f9afde4bb600c8204a1`.
Initial eight-unit pickup/drop/E-key recovery passed; the journey lasted
361,966ms, advanced ticks420→931, and retained two distinct `Promise kept`
receipts. Three delivery input attempts do not establish three deliveries.
The inspected final Chart screenshot still requires recovering four Reed.

The bounded observer retained 2,355 reads/69 projected cues: 28 player, one
keeper and 40 physical, with 12 player wordings and no adjacent-observation
identical repeat. At most three candidates were sampled; 2,143 reads had no
cue. No animal call was observed. Raw/census overflow and incomplete flags
were false; the largest sampling gap was 1,324ms. These samples do not establish
emitted-event counts, acoustic silence, native label geometry or hours quality.

Only the known startup CSP eval-probe denial was retained. Added local bounded
transport/lifecycle evidence records no guarded navigation, context destruction
or prompt; cleanup closed the socket normally, the browser exited with code0, and its
disposable profile was removed. This does not diagnose the earlier v17 loss.
Terminal JSON SHA256 is
`0874c3ecdec6cfc21291117152308b93e2c185363e7dfb108bd70a3f68bd9952`.
The existing real warning/guardian-bark/fall/acquired-cargo integration case
also passed on this executable (one selected test, 78 unselected, 21.34s), including
bounded nonoverlap, independent anonymous NPC hearing, conserved physical cargo
and exact current reload without replay. No new producer, desktop package,
hardware audio/AT, performance, cumulative, release or directive closure is
claimed by this finite functional check.

### Learned-call equal-work characterization — 2026-10-06

The full local `test:ci` run on `206a6420a53aae7a6c4610bbe6cd3b1b3b75b7c4`
finished with 363/364 files and 4,050/4,052 tests passing in 1,675.19s;
context28 and player-facing39 selftests also passed. Its only failures were
the two historical v47 digest assertions in `runtime.performanceTelemetry.test.ts`.
The old projection still included the intentionally additive
`player.animalCallKnowledge` from the current witnessed-call learning slice.
This failed run is retained as failed, not a cumulative certificate.

The test-only reconciliation separately requires canonical empty call knowledge
for both stationary seeds, then excludes only that new player field alongside
the already-declared outer recency/version/seal differences from the historical
projection. **Both original historical hashes remain unchanged and pass.**
Every older root remains in the comparison; this is not an old-format load
promise or a relaxation of current save validation. Fresh telemetry-disabled
controls process the same 30 accepted steps/three world advances for each seed
and match the complete, unnormalized current save bytes exactly. Both runtimes
are cleaned on failure as well as success; the encoder spy is restored before
the control run.

The full affected file passed four tests in 17.44s; typecheck and the maintained
six-file/105-test critical smoke passed. No application, schema, timing,
dependency, artifact or release change was needed. This narrow revalidation
does not turn the earlier failed full run into a passing cumulative result or
close the remaining ordinary-play, hours, platform and release gates.

### Native unladen expedition driver — 2026-10-06

The existing ignored normal-controls probe on clean `35717e9` qualified its
short northward Chart driver on the unchanged production artifact above.
The 60,095ms journey advanced ticks420→506, kept cargo empty, performed one
actual REST and retained 45.213 tiles of sampled/net northward displacement.
Successive public reads classified 54,352ms as movement and 3,169ms as recovery;
these are approximate exposure categories, not authoritative continuous motion.

The 445-read observation retained nine projected cues: four player, one
anonymous bird call and four physical. Maximum candidates were two; 406 reads
were empty, with no overflow/incomplete and a 651ms maximum gap. Three separate
player cues said `That was close.` within 6,764ms. Static inspection confirms
the existing 16-accepted-step relief lock and deterministic three-line pool
permit this; projection samples do not prove exact admission age or a clock
bug. The repeated wording remains an unresolved qualitative concern, not a
quietness/annoyance pass or grounds to randomize captions.

The final Chart screenshot was inspected; known startup CSP probe denial was
the only retained error, guarded lifecycle counts were zero, and browser/profile
cleanup completed normally. JSON SHA256:
`28a23b0e132be31ff5fd370302344e9a970e801f079042e873dcb466c357fb9a`.
This qualifies the driver only—not long expedition, hours, audio/AT, mobile,
performance, all-species or whole-directive acceptance. No gameplay change.

The same existing driver then completed a 360,606ms observation on clean
`f72b22f`, using the unchanged production artifact: ticks420→885,
296.223 sampled/net northward tiles, four actual REST actions, empty cargo,
342,291ms classified as movement and no terminal recovery. Its 2,754 reads
retained 12 projected cues (five player, one anonymous bird, six physical),
at most two candidates and 2,705 empty reads. A 300,274ms empty-projection
span is not proof of acoustic silence. No observer overflow/incomplete was
reported; the largest sampling gap was 891ms. Three initial `That was close.`
cues still clustered within 6,861ms, followed by `Nearly had me.` and
`Still here.`; this remains qualitative evidence, not a demonstrated clock
defect or grounds to alter eligible physical incidents. Final Chart screenshot
and normal browser/profile cleanup were inspected; only the known startup CSP
probe denial was retained. JSON SHA256:
`aee4646cd68110d23ce2590f62520a041dab1cc03c88227b6fbb289e0f811281`.
This longer observation is still not hours, Relief, hardware audio/AT, mobile,
performance, absent NPC/dog or whole-directive acceptance.

The two-hour request on clean `b63fd3b`, using the same unchanged artifact and
driver, ended **incomplete** after 720,476ms at ticks420→1296. The declared
northward heading reached ADRIFT; the driver intentionally refused after
30 seconds of floating without a lawful escape direction. This is neither a
two-hour pass nor evidence of a game crash. Public samples retained 531.098
tiles of displacement / 518.194 net northward tiles, seven actual REST actions,
652,234ms movement, 23,446ms recovery, 30,863ms floating and 13,908ms stationary.
The terminal UI offered ordinary paddle/float controls; no hidden route or
authoritative intervention was supplied.

Its 5,166 reads over 720,582ms retained 32 projected cues (ten player, one
anonymous bird and 21 physical), at most two candidates and 5,056 empty reads.
The single partial 15-minute census had no reported overflow/incomplete;
maximum sample gap was 1,518ms. Three player wordings and three adjacent sampled
repeats remain qualitative observations, not exact producer timing, audio
silence, screen-space overlap or hours acceptance. Normal browser/profile
cleanup completed, with no guarded lifecycle error and only the known startup
CSP probe denial. No terminal screenshot was produced on this refusal path.
JSON SHA256:
`95e27b85a912dea9018210739bca37c488fe0b778edef4b2cd2d78e84879ce9e`.
No gameplay repair or repeated blind route follows from this driver limit.

### Running native mixed acoustic scene — 2026-10-06

On clean `1237ed0` and the unchanged production artifact, an existing current
fixture supplies initial storm/ridge/guardian conditions and a genuinely
acquired 14-Reed Promise. Export follows nine actual neutral steps and ordinary
save: outer50/carry14, tick421/phase9, with no prior incident, admitted call or
learned sound. The temporary export hook was removed byte-for-byte after the
two original mixed tests passed; no application or permanent test change.

The same existing native probe loads that record through production IndexedDB
in a disposable Firefox profile. A disclosed startup scheduler hold warms
Relief, then native D+S precedes one ordinary start. The genuine mid-action save
already presents play, not a Continue button; the first probe's incorrect title
assumption failed before movement and remains failed. The corrected capture
does not invent a title or stop the running world to retain its sounds.

At tick422, real movement produces a fall, cargo separation, player speech,
body impact and cargo impact; the actual guardian supplies its fresh shelter
whine. Four public acoustic candidates yield two readable speech/whine labels;
the two physical glyphs are legitimately unplaced. Native bounds and the
inspected, before/after-bracketed screenshot show no acoustic, ordinary-label
or feedback overlap in that mixed window. Source association uses a unique
current public tuple, not an invented DOM event ID. Two later expiry-boundary
samples briefly lack a current tuple until the next render; they are reported,
not recast as new sound or hidden identity.

The 3,020ms observation retains 21 states without overflow and continues to
tick424. Current save conserves the 14 units as12+1+1 and retains the genuinely
learned shelter-whine family at422. Actual caption/ARIA copy agrees and its
announcement appears once. Normal browser/profile cleanup completes, with
only the two known document-start CSP probe denials. JSON SHA256:
`cacf744052808f5063b346634433160441df2e3c94daa8b10799608c19e0f1d6`;
PNG SHA256:
`88b6365979a872a76cd6f306fff962f9aed8a442ac149335a462cc1a8f284f87`.
This is one controlled desktop production scene, not ordinary encounter rates,
full crowd, hours, device audio/AT, mobile hardware, performance or directive
closure. No source, dependency, schema, visual-quality or publication change.

Current-artifact recheck on clean `4f2fd6d` uses the same initial fixture and
native controls, with production JS SHA256
`2005f5f4c24ae8db19a35aa4127dc53b4131115bdb498bc8763a583d6ecd89a5`.
The existing `native-learned-cat.cjs mixed` command passes: 3,008ms, 19 retained
states without overflow, tick421→424, four candidates and at most two readable
labels. Manual PNG review confirms separate speech/whine/cargo placement;
physical glyph suppression remains legitimate. Two expiry-boundary tuple gaps
each resolve at the next sampled render eight milliseconds later. Current
outer50/carry14 save retains14 units as12+1+1 and the real whine learned at422;
caption/ARIA agrees and the cargo announcement occurs once. Source/artifact
identity remains fixed; normal owned-browser/profile cleanup completes with
no unexpected console errors. JSON SHA256
`e9286dba88222bb825c5c575190fe34ddaa45bbd6ddeba82359d64fd3ebca9db`;
PNG SHA256
`147ddd846bd60eb6f86e62c869a3a7906ab9f802b3fd35a7658e8c7adda64af5`.
The same controlled-scene, hardware and duration limits above still apply;
this is not a fresh performance, crowd, assistive-device or closure certificate.

Latest Alpha63 mixed recheck on clean `2878587` uses the same current50/carry14
pre-action export and unchanged native mixed probe, with game JS SHA256
`015495e5529937a4797eb68d6bf5aa0343f27bb294dc6c7e49329e380f6c11cd`.
The controlled production Relief run passes: 3,028ms,20 retained states,
421→424, no observer overflow or scheduler stop during capture. At422 all
four real speech/whine/body/cargo candidates coexist; two separated vocal
labels remain source-associated and lower-priority physical glyphs remain
unplaced. Manual review of the actual bracketed PNG confirms speech, whine,
cargo recovery label, caption and feedback remain separate. Two expiry-boundary
current-tuple gaps resolve at the next retained render9/7ms later; they are
reported, not hidden or claimed as new events. Current save again retains14
units as12+1+1 and the whine learned at422; one actual cargo
announcement, no unexpected console/lifecycle failure, owned browser/profile
cleaned. JSON `2ff45263ce9ae78a5c3a46c5cfc1bd86f22e87f44592b5faf1fa4024e6d60044`;
PNG `2df4b64693d9e8b23126a3c7be8635a0a05527b13bb96b2fe85cf5a700a4d654`.
This renews the finite mixed-scene witness after the current-sight anchor fix,
not the unchanged broader duration/hardware/crowd/performance/closure limits.

#### Warning follow-up and expedition-driver limits — 2026-10-06

A separate existing test exports a current quiet phase-zero save with a
genuinely acquired eight-unit fresh-water Promise. Its original warning/bark/
fall/cargo and hearing assertions pass; the temporary export hook is removed
exactly. Two running native captures genuinely observe the unseen human's
`Heads up! · direction unclear`, matching anonymous ARIA, and the guardian
bark at tick423. Northeast keyboard movement then causes a real fall and
cargo separation, but the six-step bark expires before the mixed projection.
The second capture reduces controller polling latency without changing world
timing; it still fails the simultaneous witness. Neither failed capture is a
crowd pass, a demonstrated game defect, or a frozen reconstruction. Their JSON
SHA256 values are `8d56268b71b9d162c6e22d8c9f79e8a79f4ee7007b726f924a09d285aeac1350`
and `5acd4f785d113367600a007cdccbeb69a9c067006b1edd19abc3d37f45acb450`.

The ordinary expedition driver now permits bounded native paddling with
stamina hysteresis rather than always releasing movement while ADRIFT. It
uses no hidden bank guidance and records paddling separately from floating.
An initial 60,956ms window on the unchanged production build advances420→507,
with46.086 sampled northward tiles, one real REST and no terminal recovery.
Nine sampled cues, no observer overflow and normal browser cleanup are
retained; the terminal Chart screenshot is inspected. This window contains
no ADRIFT episode, so it does not validate escape or the hours gate. Longer
play and current dense-settlement stress remain open. No application,
dependency, schema, presentation-quality or publication change.

#### Pending crow cause survives a current save — 2026-10-06

A new runtime characterization saves the existing acquired-cargo/crow fixture
after 19 neutral accepted steps, at phase 9. The crow's presentation has expired,
but its authenticated hearing cause remains pending. Destroy/load/save preserves
the exact authoritative world, player, cargo, ecology, dog/work, perception and
journey roots, with no replayed crow cue. One genuine northeast player step then
causes a fall and physical cargo separation as fresh guardian and human warning
responses consume that original crow cause. Their observation IDs identify that
cause; the acquired Promise quantity remains conserved, with a positive partial
drop. A further interval does not replay the crow or the bark.

This ordering legitimately receives the guardian as heard-unseen. Its fresh
audio is committed, but no exact source glyph is authorized; the projected
fall/cargo candidates remain. The original visible-guardian mixed-scene test is
unchanged. Both tests pass together, with type-checking and the maintained
105-test smoke suite. This is current-schema causal/replay/conservation evidence,
not a four-anchored-label native scene, a full listener census or dense stress.
No application, schema, sound lifetime or production artifact changed.

#### Fifteen-minute ordinary expedition qualification — 2026-10-06

On clean `5e7207a` and the same production artifact, the existing native-input
driver completes 900,190ms, tick420→1533, with empty cargo, ten real REST actions
and 604.394 sampled northward tiles. One actual ADRIFT episode ends after 64,418ms
with public swept=false, following three paddle/float cycles; no hidden bank or
route guides the inputs. The terminal Chart screenshot is inspected. Browser
and disposable-profile cleanup complete normally, with only the known startup
CSP probe denial and no guarded lifecycle interruption.

The 6,155 public reads retain 36 distinct projected cues: 12 player speech, one
anonymous bird call and 23 physical cues. Maximum candidate count is two;
6,038 samples are empty, and the longest sampled empty stretch is 299,761ms.
No observation or wording overflow is reported. The near-fall pool repeats
`That was close.` five times, including three separate early events; their
timing is compatible with existing cooldowns, but this remains a qualitative
repetition concern, not proof of a clock/replay defect. These are sampled
projections, not emitted audio, complete event chronology, silence, native
caption geometry or hours acceptance. JSON SHA256:
`5cf2bdfaafd0db9205286dd29790252bbc6ec22763afd4ab5e0972c45c952d4d`.
No application, dependency, schema, production-artifact or publication change.

#### Keeper and finite flock coexistence — 2026-10-06

One new runtime test uses the unchanged generated-chicken/store fixture. The
same current save offers the real keeper interaction before and after the
flock's T+1 calls. Securing the store commits its response without replacing
the finite chicken admissions, audio attempts or active source channels. Store
contents and domestic custody remain conserved. At the next interval, each
chicken sample produces its exact anonymous, noninterrupting keeper receipt;
neither the keeper response nor the chicken audio is repeated.

The new case passes alongside the existing keeper closure and ordinary/refused
chicken-hearing cases (four selected tests), plus type-checking and the maintained
105-test smoke suite. Its projected candidates are not measured placements,
and no preferred caption winner is assumed. This is same-save coexistence
evidence, not native overlap, broad chatter or sixteen-channel saturation.
No application, fixture, schema, production artifact or old test was changed.

#### Running keeper/flock presentation — 2026-10-06

One controlled production Firefox157/Relief witness on clean `513d21d` uses
the same quiet current-schema initial state as the coexistence test. After
disclosed renderer warm-up, the ordinary scheduler runs continuously. Only
after both real chicken calls and the public keeper action appear does native
E secure the store. Three current vocal candidates yield a readable keeper
line and one flock glyph, with no measured label/feedback overlap or clipping
in that window. The actual screenshot is inspected; its before/after brackets
retain all three public event IDs. Identical flock glyph tuples remain
ambiguous and do not identify an individual chicken.

The 8,205ms observation advances 420→428 with 43 retained states and no overflow.
Original cues expire during continued play. The physical `whump` reading lease
legitimately remains instead of a forced keeper caption; one real combined
interaction/keeper announcement is observed. The ordinary current save retains
the secured store, unchanged eight-unit stock, learned chicken family at 421
and two anonymous keeper-hearing receipts at 422. Two later expiry-boundary
DOM/current-tuple gaps remain reported; this is not exhaustive all-frame
identity certification. Cleanup completes normally, with only known startup
CSP probe denials. JSON SHA256:
`be8e2a03a53ae6f8c8c35d5e6fd0938b8bb3ac1b3e89756c05f6703be0c40859`.
This is a finite controlled three-source scene, not broad chatter, saturation,
hours, hardware audio/AT/mobile, performance, or release acceptance. No
application, schema, sound lifetime, dependency or production artifact changed.

#### Longer wilderness attempt ends at a bounded crossing — 2026-10-06

The unchanged native driver on clean `5560d7f` requests two hours, but ends after
1,026,295ms of observation, about seventeen minutes. One real ADRIFT episode
escapes after 65,507ms; a second remains swept after 121,337ms and the existing
120-second exploratory-paddling bound refuses. The game and transport remain
live until normal owned-browser cleanup. This is an incomplete expedition,
not two-hour acceptance, a crash or a demonstrated Voice defect. No terminal
screenshot or current-save stage is claimed.

The 6,944 public reads retain 37 unique projections: 11 player speech, one
anonymous bird call and 25 physical cues, with no observation overflow. The
five close-line wordings and four adjacent sampled repeats remain a qualitative
concern; a 299,673ms empty sampled span is not emitted-audio silence. Script,
production bundle and source remain unchanged. JSON SHA256:
`5459e9168b340609138850e35a6be5807a023bb079e2f0403bac2f6b0395f9a0`.
Continuation requires lawful route/visible knowledge rather than repeating
the same blind heading or changing simulation to make a probe pass.

### Current cumulative checkpoint — 2026-10-06

The committed, tracked-clean `e51791476fa92a040da0bb7b8ef60436dd0e29d7`
(tree `979ec06501707b7139c212f1d24ccf6cae23712a`) remained immutable during
`caffeinate -i npm run test:ci -- --reporter=default --reporter=json --outputFile=artifacts/validation/voice-current49/cumulative-e517914.json`.
The command exited successfully: context-index 28 and player-facing-sync 39
selftests passed; Vitest passed all 364 files / 4,054 tests in 1,589.10s,
with no failed or pending tests. The JSON report independently confirms both
new current-save pending-crow and keeper/flock coexistence cases passed.
Report SHA256:
`da09d31099d784f04af6d1f63768ef84f3c615b7efc4163e42a7cd88988a3f6f`.
Node22.20.0/npm10.9.3 remain unchanged; this is local evidence, not a run under
CI's distinct Node24.20.0 environment or a public release certificate.

Current save50/carry14 includes bounded accepted cargo protection/loss/recovery
history in the same recency-v2 owner as exhaustion and footing. The composition
summary is reconciled to that already-implemented rule, not a new migration or
gameplay change. Original Architecture remains the detailed contract owner.
Ordinary-play, sustained stress, hours, hardware, performance and release gates
remain separate. No application, dependency, schema, production artifact or
completed directive changed in this evidence/status reconciliation.

### Native public-route qualification — 2026-10-06

One production Firefox157/native-control opportunity on tracked-clean
`d7073ecfb4f61dd77d3fc6efd422dc7edab36075` follows the selected remembered route
after real pickup, DROP and E-key recovery. The six-minute argument is an upper
bound: the journey ends at its first fresh delivery after 72,418ms, ticks
425→545. Sampled movement is 61,441ms, recovery 10,390ms and stationary exposure
585ms; 189 reads retain 40.388 tiles of sampled displacement and 41 successive
waypoint advances, excluding the initial route join. Two native REST actions
occur; no ADRIFT episode does.

The public loop retains eight Fresh Water through pickup/drop/recovery, then
the actual Deliver action at 544 produces a fresh eight-unit Latchmere receipt
at 545, with carried/visible loose custody removed and no pending recovery.
This is public transaction evidence, not a full aggregate-stock digest or a
save/reload/relaunch test. The 77,857ms setup-inclusive observer retains 507
samples, one keeper line and one anonymous physical rustle, no observed animal
call/player speech, no overflow and a largest sample gap of 924ms. Sparse
projections do not establish emitted silence, annoyance or complete chronology.
The actual Chart screenshot is inspected: arrival feedback and public route
remain legible, unknown ground remains masked; no acoustic cue is active in
that terminal image. Only the known startup CSP probe denial occurs; the owned
browser exits normally and its synthetic profile is removed. JSON SHA256:
`e242781305a6cc9823e62f51b36691baf39e63359600545ee4976d9b21cbfbbf`.
The unchanged application bundle and existing local driver match their recorded
fingerprints. This qualifies one current player-accessible loop, not six minutes,
regional transitions, sustained itinerary availability, hours, dense stress,
hardware audio/AT/mobile, performance or release. No application change is made.

### Native continuation interrupted by host sleep — 2026-10-06

The next unchanged-production attempt on clean `a4879f3` does not qualify its
requested fifteen minutes: a completed native pointer command lacks a real
handoff, and the existing fifteen-second receipt bound refuses. All eight units
remain carried with the tracked DELIVER objective; button-command success is
not dispatch or fulfillment evidence. Its 84,278ms public observer is incomplete
long-play evidence, not a demonstrated game defect. The failed JSON is retained
unchanged (SHA256 `557e1f3a091b0ca1d2e37e5f6d0fc2dc3af8f8e4db256c5de82fdfb6e09a5627`).

A narrow existing-driver revision uses documented native E on the focused
Chart canvas, recording bounded public before/after input observations without
changing the receipt, announcement or custody checks. This actually delivers
eight Fresh Water at 512→513 and picks up the next fourteen-unit Food load.
The continuation then refuses its waypoint deadline after host sleep. The Mac
power log records lid-closed sleep during this run, including a 532-second
episode. Wall-clock journey time is 681,910ms, while the differently scoped,
setup-inclusive page observer records 156,988ms. Wall-based exposure counters
and the deadline include that interruption; they cannot certify continuous play.
The terminal fourteen-unit load remains carried. JSON SHA256:
`ca17e88fe54a5cfb06a51552c5ab442236c42586d0822821651349ea208ab245`.
Only the known startup CSP probe denial occurs; both owned browsers exit normally
and their synthetic profiles are removed. No terminal-image, save/reload,
fifteen-minute, hours, sound-quality or product-failure claim follows. No
application, schema, dependency or production artifact changes; the remaining
continuous-play observation requires an uninterrupted host window.

### Current Voice closure triage — 2026-10-06

On clean `8c7f09e`, the next native journey completes both eight Fresh Water
and fourteen Food deliveries. The existing local driver now checks the fresh
material receipt and cleared public custody rather than a replaceable latest
announcement. Campaign resolution can replace that announcement in the same
step; this was a driver false negative, not broken delivery. The 180,872ms
journey then stops at a new fourteen-Reed Promise whose destination is outside
the bounded spatial view. Its real distance/bearing remains available.
`regionalWorldView.ts`, `projection.ts` and `uiProjection.ts` confirm this lawful
distinction; the strict waypoint driver does not invent an unseen itinerary.
JSON SHA256: `caeb3e0ba75c4f025945dfd81058411536b8d98293b6ea51c862f5aa34ea65a6`.
This is incomplete prolonged-play evidence, not a game failure or fifteen-minute
pass. Another blind route retry or new route infrastructure is not warranted.

The existing keeper/flock observer then adds only bounded public resident counts
and a keeper-only 8–60-second duration option. The single production Firefox157
Relief run observes 60,008ms, ticks420→479, with 83 retained states and no overflow.
Exactly two DIRECT-detail-visible residents appear throughout: waiting then
watching, not invented future work. Three vocal candidates yield at most two
placed glyphs; the keeper/flock coexistence window has no measured overlap or
clipping. The actual screenshot is inspected and retains readable keeper speech,
one ambiguous flock glyph and the legitimate physical-caption reading lease.
Two later DOM/current-tuple expiry gaps remain reported, not an all-frame pass.
The current50/carry14 save preserves the secured store, unchanged eight-unit
stock and learned chicken family; no vocal sample or active channel remains.
JSON SHA256: `04c503c6c943b08150cf872652ffa9ea140baf37a8a53dd444a5eab1bcbc152a`.
This is continuing current-context evidence, not dense crowd/work, hours,
hardware audio/AT/mobile or performance certification. Both runs retain only
known startup CSP probe denials, exit normally and remove their disposable
profiles. Application, schema, dependency and production artifact are unchanged;
future producer breadth stays deferred and Voice's remaining gates stay open.

### Shared player visibility envelope — 2026-10-06

The local candidate over `d3647fa` reconciles two real player fields: terrain
previously used six close / 52 forward tiles and 160 degrees, whereas exact
detail used two close / ten forward tiles and 100 degrees. Current player
projection now shares the 52-tile, 160-degree envelope with an eight-tile close
circle, including directly seen bodies behind the player. Elevation rays,
opaque cover, weather, genuine darkness and sleep still gate disclosure;
non-player visual-contact profiles and interaction reach are unchanged.
Ordinary daylight resolves the full circle without altering physical light.

Directly seen cosmetic foliage no longer requires an additional durable map
discovery threshold. Relief places disclosed bodies, parcels, their hit anchors
and acoustic labels on the existing perceived surface; hidden/remote map
sampling remains discovery-safe. Water already used broad terrain sight:
the regression records 96 wet-surface vertices with detail absent, and none
when terrain is hidden. No water-layering or above-item depth fix is claimed.

Current50/carry14 is retained. Exact earlier anonymous call receipts may be
independently reauthenticated against their former event-time player profile,
without learning a hidden identity, changing the saved receipt or replaying
audio. Current gameplay never uses that historical profile. Real fall/cargo
and perception integrations passed 2 files / 56 tests; former-anonymous
receipt and independently resealed forgery controls remain strict. The final
affected unit/render/manual set passed 17 files / 358 tests; TypeScript and
the maintained `npm run test:smoke` passed (6 files / 105 tests). These are
local slice results, not a new cumulative, public-release, hardware or
performance certification. The earlier cumulative evidence below does not
certify this changed executable state.

The real animal-source subset passed six cases: deer, gull, elk and boar retain
anonymous hearing/WAIT/reload controls just outside the close circle, while a
forward fox genuinely remains seen and heard during its call and learns that
family once. Moving the anonymous fixtures to nine rear tiles first made them
inaudible under actual masking; that run failed and was not accepted. Eight
rear plus one side tile (radius approximately 8.062) preserves real hearing
outside the circle without changing production thresholds or supplying events.

### Retained cumulative checkpoint — 2026-10-06

The committed, tracked-clean `f72b22fa0d87b0931972506bccb967fd8fc87dfb`
(tree `616e84f1c0e0d6efda3fde90f59bbea9f6b40dab`) remained immutable during
`caffeinate -i npm run test:ci -- --reporter=default --reporter=json --outputFile=artifacts/validation/voice-current49/cumulative-f72b22f.json`.
The command exited successfully: context-index 28 and player-facing-sync 39
selftests passed; Vitest passed all 364 files / 4,052 tests in 1,655.36s,
with no failed or pending tests. Report SHA256:
`44afba28d25f1088b2b0b32bc645443db6171bbc967433cc3846e07e8f631289`.
This certifies these executable/test inputs, not a later changed runtime or
public deployment. The earlier failed cumulative run remains failed; the
test-only equal-work reconciliation above is the explicit intervening change.
Ordinary-play, hours, hardware, performance and release gates remain separate.
No dependency, schema, production-artifact or gameplay change was made by
this evidence/status reconciliation.

### Current cumulative confidence and live-caption capture — 2026-10-06

Frozen `0d46d3e4b5e11a700ae59ab56138117d3c5411ea` passed `npm run test:ci`
with both default and JSON reporters: 364 files / 4,128 tests / zero failures,
1,512.22 seconds, default two workers, Node 22.20.0/npm 10.9.3. Context28 and
player-facing39 self-tests also passed. Ignored `cumulative-0d46d3e.json` SHA256
is `9d5f9d1a78fd7edcf5990c38b41396c2c40cb1bf08953754af9dc63c7c8224b7`.
This certifies that exact source/configuration checkpoint, not later harness
edits or directive/release closure.

The paired-GREET browser driver had stopped simulation after two world cues
coexisted, then waited for an already consumed native caption. Its 2,239ms
reading lease had correctly expired; renewing or extending it would conceal
the test error. The existing driver now uses actual reduced-motion draws or
a bounded 450ms normal camera-settling window, retaining the physical
selected-ID, recognition and enabled-GREET checks. It requires a live actual
pair-member caption before stopping. Expected copies come from observed
captions, not ABOUT headings. Later displayed pair-ID leases join exact
committed speech text and supply the once-only/reload announcement guards.
Gameplay, audio, clocks, schemas, dependencies and build bytes are unchanged.

Final harness SHA256 `a3dbdd1ca03c6ba6817bd0ffc8634f40263a40e73893a5ab280bb0514a985b01`
passed selected production Firefox checks: `--paired-greetings
--presentation-width 1280 --presentation-mode relief-3d`, and the same with
`--reduced-motion --presentation-width 390`. Final ignored stems
`voice-desktop-native-capture-05` / `voice-compact-native-capture-06` contain
two distinct nonoverlapping world labels, live screenshot continuity, both
learned ABOUT states, both native announcements exactly once, natural expiry,
and zero old-copy replays across eight post-reload view states. Root reviewed
the screenshots. Observed 47/60-code-point reading times were respectively
2,245/2,866ms normal and 2,243/2,867ms reduced, against 2,239/2,858ms minimums.
Earlier expired-lease and screenshot-continuity refusals remain failed attempts,
not weakened gates. These are two selected layouts, not a full new matrix,
mobile hardware, audible/screen-reader output, dense stress or hours acceptance.

### Expanded-sight representative performance check — 2026-10-06

Five sequential captures froze clean `37f7df96681ec830b380375ba7166f105c35347e`,
current93 application bytes (ASAR `63ea252c…`, JS `13abc61b…`), on the same M4
16GiB Mac, AC power/Low Power Mode off, 1440×900 CSS, 30-frame warmup and
unchanged quality. Existing `profile:baseline` / matched `profile:browser`
commands used 60s, with travel lawfully extended to 210s. No CPU sampler,
voice observer or hitch trace ran in these timing windows. Ignored captures
are under `artifacts/validation/voice-current49/performance-37f7df9/`.

| Scenario | Renderer callbacks/s | Draw CPU mean (ms) | World-step mean (ms) | World steps | Full-window rAF worst (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Electron estuary Relief | 35.73 | 23.36 | 90.07 | 59 | 150.0 |
| Electron dense Relief | 36.41 | 22.46 | 102.55 | 59 | 166.7 |
| Firefox estuary Relief | 32.40 | 19.68 | 163.44 | 59 | 233.34 |
| Electron travel Relief | 35.00 | 14.22 | 64.79 | 209 | 350.0 |
| Electron estuary Chart | 54.52 | 11.19 | 94.87 | 59 | 133.3 |

The stationary Relief rows **fail** the retained desktop45/browser40 callback
floors. Chart and travel pass their corresponding floors. This is not a healthy
whole-gate result or a measured repair. Expanded sight changes occupancy:
estuary/dense expose22/15 actors versus the historical3, so old timing is context,
not an equal-work control for assigning cause. All stationary windows process
599 fixed steps; travel processes2,099 and crosses three regions/156.39tiles
without recorded discontinuity or projection mismatch. Pending queues end empty.
Travel's renderer tail retains only4,096 intervals (worst132.1ms); the table
correctly retains its full-window7,349-rAF-interval worst350ms instead.
No autosave occurs in these windows; explicit tail saves are separate. These
single host runs do not prove presented/GPU FPS, retained-memory health, hours,
acoustic saturation or low-end mobile; 59-advance world p99 is a low-sample max.

A separate20s CPU diagnostic extends the existing runner locally, changing no
gameplay or shipped source. Its16,140 samples over20,177.949ms (requested1ms,
actual mean≈1.25ms) use explicit page/CDP clock bookends. An isolated sourcemap
build has the **exact shipped JS prefix**, differing only by the appended map
comment; shipping dist/ASAR are untouched. Nearest first-party render-owner
sample weights identify water submission≈4,193ms (native depth-state query
≈2,000ms beneath it), current-streamline stroke submission≈3,874ms, biome motifs
≈2,827ms and ground rings≈1,585ms. These are disjoint nearest-owner sampled
weights, not exact function durations; parent inclusive samples must not be
added. The current-streamline owner still submits separate immediate lines,
and broader direct sight admits more motifs/halos. Another675ms is charged to
the current owner outside its stroke helper. No optimization is retained.
The next bounded candidate is equivalent segment submission at that measured
render owner, preserving sight, water height/colour, styles, physical currents
and all simulation. Depth-state preservation cannot be replaced by guessing.

#### Current-segment submission experiment — discarded, 2026-10-06

Starting at `d04223a`, one candidate replaced each cue/pass's independent p5
`line` calls with one supported `LINES` shape, duplicating endpoints to retain
independent caps. Characterization normalizes both submission forms into the
same ordered styled segments and foam points. Ordinary/SCAN, motion/time,
220-cue density, immutable inputs and absent/peripheral/direct-detail boundaries
are covered. No simulation, visibility, water height, schema or dependency changed.

Before editing, the ignored experiment record froze a minimum repeated 15%
draw-CPU reduction on each available platform, beyond run spread, as necessary
but insufficient acceptance; the existing absolute performance floors remain.
Two sequential 60s estuary repetitions per artifact/platform retained AC power,
Low Power Mode off, 1440×900 CSS, 30-frame warmup and unchanged quality, without
CPU sampling or hitch traces. The first BEFORE is the preceding record; the
second BEFORE and both AFTERs are retained alongside frozen artifacts in
`artifacts/validation/voice-current49/current-segment-submission/`.

| Platform | BEFORE draw means (ms) | Candidate draw means (ms) | Two-run mean reduction | BEFORE callbacks/s | Candidate callbacks/s |
| --- | --- | --- | ---: | --- | --- |
| Electron estuary | 23.359 / 23.296 | 21.373 / 21.752 | 7.6% | 35.73 / 35.49 | 38.85 / 38.39 |
| Firefox estuary | 19.678 / 19.576 | 17.209 / 18.050 | 10.2% | 32.40 / 32.20 | 33.57 / 32.66 |

The candidate **failed** its frozen gain threshold and still failed both
stationary callback floors. It was discarded, not relabeled a hitch repair.
The application renderer is byte-equal to the starting source. Electron pairs
accept 599 fixed steps/59 advances. Firefox's second BEFORE and both AFTERs
accept 602/60; its first BEFORE accepts 599/59. Matching counts are not full
authoritative-state/event/save equivalence. World-step means remain about
89–92ms Electron and 161–167ms Firefox; low-count world p99 equals the sample
maximum. These callback/CPU proxies do not measure presented FPS or GPU cost.

Useful characterization tests were retained independently of batching: final
seven affected render/current/water/perception files pass 270 tests; typecheck
and the maintained six-file/105-test critical smoke pass. The unpublished
candidate correctly failed the player-facing release wrapper, then packaged
with the existing Forge artifact subcommand and passed nested-path static web
smoke for comparison. No wrapper, version or release policy was weakened.
Frozen baseline ASAR `63ea252c…` and discarded candidate ASAR `af8e6507…` retain
distinct identities. Candidate dense/travel/soak, full visual/current-save
integration, other desktop targets and publication were not run: rejection
preceded those gates. No optimization or upstream/dependency change is retained.

#### Biome-frustum submission experiment — discarded, 2026-10-06

At `da77b66`, a second bounded candidate omitted wholly off-camera aesthetic
biome strokes. Conservative whole-cell/height bounds included side-plane and
pixel-stroke guards; original detail disclosure, signed-world hash, first 420
row-major admission, visible geometry/styles and terminal style state remained.
It did not change terrain/water polygons, visibility, simulation or save state.
The same pre-edit minimum 15% repeated draw-CPU reduction and absolute guardrails
applied. Accepted baseline ASAR `63ea252c…` and candidate `e3eeb490…` were frozen
with their dist files in the ignored local experiment records.

Two sequential production Electron estuary 60s windows used the preceding
matched AC/Low Power Mode off, 1440×900 CSS, 30-frame warmup and unchanged-quality
conditions without heavy diagnostics. BEFORE draw means 23.359/23.296ms versus
candidate 21.714/21.655ms give a two-run mean reduction of **7.0%**, below the
frozen threshold. Candidate callbacks 38.19/38.38s^-1 still miss the 45 floor;
world means 90.708/90.597ms and renderer-interval p99s 116.4/115.5ms do not establish
a world-hitch repair. Windows accept 600/60 and 599/59 fixed steps/advances, so
these are wall-window comparisons, not equal-work state/event/save witnesses.
Full-window rAF worsts 133.3/149.5ms are CPU callback proxies, not presented FPS.

The browser attempt timed out before acquiring a Firefox BiDi endpoint during
an application-update launch. It produced **no browser measurements**. An
inherited updater output pipe kept the failed Node harness alive after cleanup;
only that owned harness was terminated, leaving the user's browser/application
updater untouched. No timing gain is inferred for Firefox. The candidate was
discarded before visual/current-save, dense/travel, soak or other-platform
acceptance; its runtime hunk is removed. Useful original motif/disclosure/cap/
edge characterization remains independent of culling. No optimization, policy,
schema, dependency or upstream source change is retained.

Final retained characterization passes nine affected files/302 tests, typecheck
and the maintained six-file/105-test smoke. `package:desktop` passes its actual
release-sync, build and packaging hooks; nested `/tideweft/` static smoke passes.
All five regenerated dist files and Mac arm64 ASAR are byte-identical to the
accepted baseline. Prior exact-byte functional evidence retains its original
limits; no new interactive, ZIP/install/sign, other-platform or publication
verification is claimed.

### Local surface-hearing boundary — 2026-10-05

The unpublished candidate over `3630001` adds the first bounded relief
transmission rule for authenticated terrestrial alarm causes/listeners. The
prior dry-ridge characterization demonstrated that listener-local ambient noise
alone did not distinguish a crossed ridge. `terrainAcoustics.ts` now walks the
registered local supercover, without a full-world scan or retained cache. Its
greatest crossed-cell height excess uses the lower entry/exit endpoint of the
linear support baseline; a midpoint missed real obstruction on sloped paths.
Authored clearance/span/cap categories alter received strength, not committed
event intensity, timing, source identity or the independent optical gate.
Reverse-path and rising/falling tests retain exact transmission `0.5390625`.

Current core alarms, player alarm receipt reauthentication and the matching
resident hearing leg share that input adapter. Player steps have explicit
surface support. Unknown airborne/submerged support and off-frame paths remain
explicitly unmodeled/coarse, not invented ground contact or an inspected clear
path. Generic human/dog/physical consumers still require their own authenticated
joins. This is **PARTIAL** propagation coverage, not full Voice closure.

Outer save50/carry14 establishes this changed hearing boundary. Obsolete
unpublished Voice development formats33–49 are deliberately incompatible and
remain untouched on load; released readers1–32, including Alpha60, remain.
Their historical `player.timeAction` authority is retained. Current malformed
cause/species/receipt and no-overwrite negatives remain mandatory. A newly
added test initially confused a deliberately supported fish-crow admission
alias with a forgery; it now alters the authenticated current species instead.
No production rule was weakened to satisfy that mistaken expectation.

Final focused kernels/policy passed6 files/122 tests; fall, bio0, player time,
regional, V25/V26, resources and wait passed8 files/98 tests. Turning Day,
working-people and expression diagnostics passed3 files/18 tests. The real
warning/bark/fall/cargo case and forged-species rejection passed separately
(2 tests). The mixed fixture's existing player was staged two tiles nearer
existing residents inside their legitimately reduced impact range; the actual
rough fall, physical cargo, event/receipt conservation and non-overlap
assertions remain. Critical `npm run test:smoke` passed6 files/105 tests.
The full corrected core-ecology file then passed74 tests in633.01s, including
the real mixed-source case, current reload/forgery guards, authentic animal
alarms and physical conservation. Its final JSON is retained locally at
`artifacts/validation/voice-current49/terrain50-core-final.json`. A detached
earlier domain run lost its observation handle; terminal process absence and
distinct new Vitest cache entries recover passing runtime/perception/settlement/
telemetry file results, not a combined exit0 certificate.

The requested Alpha61 local preview passed `npm run make:desktop` (including
typecheck, production web compilation, Mac arm64 package and ZIP) and the
existing disposable-profile packaged smoke. Actual `app://bundle` boot,
Chart/Relief, controls, recovery and current-save checks passed with empty
renderer-warning, navigation-error and resource-failure lists; the world image
was inspected. Runtime-only ASAR has10 entries/4,970,315 bytes, SHA256
`0cba3cde562908833d4a5ef5a8512b843e1ebb13b283dfca884d7752bc339d5a`.
Static smoke passed the emitted five-file `/tideweft/` artifact. These are
focused runtime and host artifact checks, not ordinary travel, mobile hardware,
production FPS, a long soak, interactive production-browser certification,
signing, other desktop targets, cumulative regression or public release.
Canonical coverage and compatibility limits belong to
[Architecture](./ARCHITECTURE.md#local-surface-acoustic-transmission).

### Resident-body equal-work oracle reconciliation — 2026-10-08

The unpublished `ec687bdecd9a30f457b8da81b641936c78caa55a` cumulative attempt
reached its 25-minute cap, exited124 and produced no final JSON. Context28,
synchronization39 and documentation-reuse45 selftests passed. Five failures
were reported: two historical telemetry digests and three settlement fixtures.
This remains **INCOMPLETE**, not a cumulative, performance or release pass.

Separate synthetic captures used the ordinary runtime's same two stationary
seeds, 30 accepted fixed steps/three world advances and existing audio mock.
Compared with the retained authenticated `93cc63b` captures, every other root
is exact: only outer version/seal, all42 new body roots, awake receipt entry
420 rather than421, arrivalfalse rather than membership-derived true, and
exactly2,500 additional exhaustion per resident differ. The latter is the
removed first-tick unbound recovery: current adoption binds awake before that
tick, so settlement membership cannot grant restorative relief. No production
regression or performance improvement is inferred from these test captures.

The test now explicitly validates canonical stationary bodies at completed423,
their original source pose/heading, empty task and unchanged initial exhaustion
before reversing just that characterized historical delta. **Both original
v47 hashes remain unchanged.** Complete, unnormalized telemetry-on/off current
save equality runs before the historical assertion. No old-format load promise,
schema change or weakened current validation follows from test normalization.
The disposable audit passed2cases11.04s and was removed from source after
preserving its fixture/captures under ignored validation output.
`npx vitest run src/game/runtime.performanceTelemetry.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-telemetry-body-reconciliation.json`
passed4tests19.90s. These finite assertions do not certify production FPS,
normal visual play, service completion, prolonged soak or directive closure.

The settlement fixtures now retain actual phase-zero body/circadian roots and
cause-owned sound timing when staging a controlled listener. Continuing sleep
has real need pressure; removing that pressure at a cold boundary does not
replay routine selection. Waking at the next closure precedes lawful recovery
sight. The dawn cohort checks bounded displacement and actual task arrival,
not instant arrival by membership; the keeper's exact dawn wake remains checked.
`npx vitest run src/game/runtime.settlementEcology.integration.test.ts --maxWorkers=1 -t 'links a witnessed livestock split|keeps an unheard warning world-only|adopts every current settled resident|dry crest reduce understanding' --reporter=default --reporter=json --outputFile=artifacts/validation/world0-settlement-body-reconciliation-final.json`
passed all4selected cases56.70s (37unselected), including the shared dry-crest
hearing counterfactual. These are test-only reconciliations: production source,
schemas, dependencies and release identity remain unchanged.

### Existing ration accounting extraction — 2026-10-08

The unpublished `1025fe22fc8e14e7540a37bf7459bd5022d7a6be` engine supplied
the BEFORE characterization for a small accounting-owner extraction. Two
fixtures use the existing `createWorld`/`stepWorld`/serialization authority:
untouched `first lantern`, standard, and explicitly controlled native macro
presence/stocks/needs with the same food recipe. Both advance exactly60/120
world steps to absolute480/540. The controlled fixture admits a visitor at its
destination, excludes a route traveler, and makes the existing recipe's eight
food units necessary before the same-hour two-unit ration debit. There is no
authored successful task, body, meal, source/work livelihood or arrival receipt.

The initial fixture incorrectly reversed the canonical resident root and failed
the existing sorted-ID invariant before any step. Removing that illegal fixture
permutation, without changing the invariant, yielded2PASS979ms:
`TIDEWEFT_RATION_CHARACTERIZATION=1 npx vitest run src/sim/residentRations.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-ration-accounting-canonical-before.json`.
Four full-world/save/event SHA256 witnesses were then frozen in that public test
before replacing the engine arithmetic. AFTER17PASS1.02s retains all twelve
hashes exactly, plus segmented batching and cold continuation:
`TIDEWEFT_RATION_CHARACTERIZATION=1 npx vitest run src/sim/residentRations.integration.test.ts src/sim/residentRations.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-ration-accounting-after.json`.

`residentRations.ts` only computes the existing all-or-none food/water quantities
and aligned food needs. The engine retains cadence, presence/order, actual stock
and ledger commits, route growth, all other needs, intentions and stress. Unit
edges include no cohort, independent exact/insufficient stocks and one final
clamp at high/low need. This changes no save schema, supported format, dependency
or release identity. It prepares the existing accounting boundary, not physical
meal/service completion, a sourced-production fix or measured FPS improvement.

### Actual resident ration approach and use — 2026-10-08

Local construction extends parent `45528207312e6d96938c7ebc223707d839b035e2`
through the existing fixed-step body, circadian and hourly stock owners. Native
geometry, IDs and player spawn remain unchanged; short-fixture needs, weather
and contract availability are explicitly controlled. Neither selected tasks,
arrival nor a successful meal is injected. One actual native runtime witness
processes599 accepted100ms steps to tick479/phase9, then the same final step
to480 uninterrupted and cold. All saved authoritative roots agree, excluding
only the existing presentation/session recap. A later deliberate interval
closure failure rolls back the real meal, ledger, need and task effects and
releases no vocal cue. Actual nearby GREET acceptance and physical refusal on
that use tick separately prepare their disposable/original-world tokens; both
leave just one committed debit. Cold load after consumption cannot grant a
second benefit.

The service policy deliberately differs from unconditional legacy aggregate
relief: one stable actual-present cohort sets the full `ceil(N/3)` availability
budget independently for food/water; a group is charged once if it contains a
legitimate user, and only users receive relief. All-user results remain the old
batch and one final clamp; wholly unused groups cost nothing. No reservation,
coupon, personal food inventory or conversion of the separate physical store
lot is created. The exact hourly order remains production before needs, then
projects/contracts. The unchanged absent/v1 aggregate branch still matches the
four frozen whole-world/save/event witnesses. Lower-world native counterfactuals
prove shortage and duty interruption remove the actual downstream benefit.

Outer52/body-v2 explicitly versions the exclusive ration task; carry14 and
inner-world4/rules6 are unchanged. Supported51/body-v1 retains its true phase4/9
history and upgrades only through actual phase-zero routine reconciliation;
released50 stays supported/pre-body. Codec/save-capability tests do not claim
released fixture provenance or runtime gameplay. Preparation captures exact
world, roster, resident and immutable activity identities, burns a failed or
consumed token, and copies the complete explicit duty cohort. Review found a
same-resident activity-replacement custody gap; the bounded identity fence and
new characterization reject it without serializing or caching the world.

The first broader runtime/save selection reported38PASS/1FAIL: the new v1 cold
fixture wrongly expected upgrade one step after phase-zero closure. Inspecting
the existing closure routine confirmed upgrade at that actual boundary; the
fixture was corrected, not the implementation or invariant. Earlier temporary
readonly fixture errors and the replaced urgent-food movement oracle are
retained in local evidence; hunger now intentionally selects real ration
approach instead of a stationary unused eat intention.

Validation uses the maintained production owners, maxWorkers2 except the
focused GREET selection, with default+JSON reporters:

- `npx vitest run src/game/runtime.residentRest.integration.test.ts src/sim/residentRationUse.test.ts src/game/residentRationActivity.integration.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-ration-service-runtime-final.json`:
  3files36PASS42.41s, including the full native fixture, exact current-save
  continuation, supported51/released50, one-shot custody and honest close/hidden
  render/ABOUT output. The use label is not a private hunger/destination label
  or a manufactured acoustic event.
- `npx vitest run src/game/runtime.test.ts -t 'voices one committed GREET|keeps a resident recognized when the candidate introduction is not heard|rolls back introduction facts, save, and vocal audio when later interval closure fails|rolls back the whole interval when cause-owned hearing timing is rejected|restores the complete adopted body roster after a rejected fine-step replacement' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-ration-service-greet-regression.json`:
  5PASS/93unselected20.88s. These are the exact existing Voice/body regressions,
  not the complete98-case runtime suite.
- `npm run typecheck`: PASS. `npm run test:smoke`: maintained6files105PASS4.12s.

The final affected-domain command is
`npx vitest run src/sim/residentRationPulse.test.ts src/sim/residentRationUse.test.ts src/sim/residentRationActivity.test.ts src/sim/residentRations.test.ts src/sim/residentRations.integration.test.ts src/sim/residentActivity.test.ts src/sim/residentActivity.world.integration.test.ts src/sim/residentActivityEventLocus.test.ts src/sim/residentCircadianPhysiology.test.ts src/sim/systemComposition.integration.test.ts src/game/residentActivityExecution.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/residentRationActivity.integration.test.ts src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentActivityPublication.test.ts src/game/saveCompatibilityPolicy.test.ts src/game/humanPerception.presentation.test.ts src/game/uiProjection.test.ts src/game/projection.perception.test.ts src/game/projection.routes.test.ts src/game/projection.terrainMemo.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-ration-service-domain-final.json`:
22files415PASS20.36s. It covers shared body/receipt/physiology, publication,
save and presentation boundaries; it is not complete cumulative coverage.
The earlier capped cumulative remains incomplete. No manual visual,
natural-rate multi-day liveness, production performance, packaging, deployment,
directive closure or full settlement-service claim follows from these tests.
Material service, autonomous keeper inspection and physical delivery remain
with the existing active owner. No dependencies, upstream sources, release
identity, privacy policy or completed directive bytes change.

### Shared civic material bookkeeping — 2026-10-08

Local construction on `e6167898ee9ba7f90c423ffd0fb8c6b287c51d7e` gives
`engine.ts`'s existing hourly project update and delivery contribution one
private `commitProjectMaterial` bookkeeping owner. Their eligibility, amount,
cadence and ordering remain unchanged. The hourly caller still spends one
unit; delivery still deposits conserved cargo first, then consumes its
condition-qualified amount capped by remaining progress and stock. Completion
retains the same route, knowledge, stress, recovery and event effects. The
helper is not a worker, arrival admission, claim or second inventory.

Before the production edit, the new `civicProjects.integration.test.ts`
characterized thirteen cases on the unchanged engine. Fifteen labeled complete
world/save/ordered-event SHA256 triplets were captured and frozen before
extraction. Controlled conditions delay unrelated recipes/offers and set finite
initial stock, Promise terms and progress with matching conservation ledgers;
they inject no successful task or receipt. The tests cover all five native
project effects versus material shortage, completion once, legal headless
pickup/deposit, zero-condition minimum, resource mismatch, remaining cap,
already-completed project, rejected delivery replay, and exact pending-cargo
cold/batched continuation. On tick480 the matching delivery's four-unit credit
and hourly one-unit credit remain separate legitimate debits, not five units
credited twice. This is lower-world transaction proof, not normal physical
player travel or enacted resident material work.

Commands and terminal results:

- `npx vitest run src/sim/network.test.ts src/sim/residentRations.integration.test.ts src/game/projectEffects.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-project-accounting-before.json`: BEFORE3files10PASS1.00s.
- `TIDEWEFT_CIVIC_PROJECT_CHARACTERIZATION=1 npx vitest run src/sim/civicProjects.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-civic-project-characterization-before.json`: BEFORE13PASS2.32s, before any engine edit. After freezing those expectations, the same selection without the diagnostic flag passes13/13 in2.30s; `world0-civic-project-frozen-before.json` retains that result.
- `npx vitest run src/sim/civicProjects.integration.test.ts src/sim/network.test.ts src/sim/residentRations.integration.test.ts src/sim/systemComposition.integration.test.ts src/game/projectEffects.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-civic-project-accounting-after.json`: AFTER5files24PASS2.38s, all45 new hashes and12 earlier ration hashes unchanged.
- `npm run typecheck`: PASS. `npm run test:smoke`: maintained6files105PASS4.18s.

No source consumer, save schema/support set, dependency, release identity,
production recipe, actor timing, audio or visual rule changes. The inheritance
summary now correctly names the preceding locally connected ration consumer;
civic material/keeper services and accountable physical travelers remain
unfinished. No performance gain, fresh cumulative certificate, manual visual,
packaged build, deployment or directive closure is inferred. Actual material
service must replace its represented timer credit, validate the current
project/resource/site and preserve this same conserved result boundary.

### Current ration protocol in retained telemetry witnesses — 2026-10-08

A broader native check on `01950d8d0387327469121f8732423738dbc73eb0` found
two stale characterization expectations, not a measured performance regression:
`historicalStationaryWorld` still required the v1 body shape after current
phase-zero adoption deliberately moved to v2 with an explicit null ration task.
The exact current telemetry-on/off save comparisons had already passed before
that assertion failed. The fixture now requires the complete v2 shape for all
forty-two bodies, with unchanged source pose/heading, no rest/ration task and
the previously characterized circadian/exhaustion consequences. Both original
historical hashes, normalization scope and full current-save equality remain
unchanged. Production, schema and support bytes are untouched by this repair.

The initial command was
`npx vitest run src/game/runtime.performanceTelemetry.test.ts src/game/runtime.settlementEcology.integration.test.ts -t 'runtime performance telemetry|adopts every current settled resident atomically while preserving the keeper' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-ration-project-native-boundaries.json`:
3PASS/2FAIL/40unselected45.25s. The keeper's exact dawn/body adoption passes;
that is one selected keeper case, not its complete41-case file. The two failures
and original report remain retained, not relabeled green.

After the expectation reconciliation,
`npx vitest run src/game/runtime.performanceTelemetry.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-ration-telemetry-final.json`
passes all4cases20.10s, including both fixed historical hashes and equal
accepted work. Final `npm run typecheck` passes; `npm run test:smoke` passes
the maintained6files105tests4.30s. These mocked-clock diagnostics establish
observational/state correctness, not production timings or a hitch improvement.
No new cumulative, visual, platform, deployment or directive-closure claim.

### Enacted civic material service and current trace — 2026-10-08

Local construction on `cb9cd6d991107b94e0ce8fa4fc06aac223379714` connects
the existing resident body/routine/closing transaction to one finite project
contribution. Native identity, terrain, service site and player spawn remain
unchanged. Controlled needs, finite supply and schedules produce actual
selection, dry-foot approach, arrival and use; no successful task/receipt is
assigned. One real hourly pulse spends one unit through the existing project
bookkeeping owner, not timer plus action. Stock removal, blocked support,
urgent needs, current hourly hunger/intention or higher duty removes the result.
Oldest pending requests retain age through shortages; three actual contenders
receive distinct turns, including intermittent refill. A current used marker
may reference the now-complete project; completion occurs once. This is bounded
material service, not physical construction, professions, tool use or sourcing
the existing empty-input recipes.

The native RAF witness runs599 accepted100ms steps to479/phase9, then one
actual step to480. Uninterrupted and cold full authoritative roots agree;
only session/presentation recap is excluded. A deliberately failed later
interval closure restores stock, ledger, project, task, body and carry and
releases no committed vocal cue. Cold load after use grants no second debit or
progress. Sight-gated projection/ABOUT show only current committed use and
remain pure; they do not expose private work plans or invent acoustic events.

Outer53/body-v3 explicitly authorizes the exclusive material task. Supported
50/51/52 remain; their exact absent/v1/v2 partial history upgrades only through
the genuine whole-roster phase-zero owner. Review found that an accepted mixed
v3/non-v3 cohort could suppress legacy project timers elsewhere; the new mode
invariant now rejects before world mutation and at cold/save boundaries, while
historical v1/v2 mixtures remain supported. Carry14, inner-world4/rules6,
generator, release identity, retirement policy and dependencies do not change.

The first runtime selection passed9/10: a synthetic released50 reconstruction
removed bodies but retained a keeper address already moved by new civic work.
Cause-only urgent belonging now prevents unrelated civic movement during that
explicit historical-format construction; exact stationary keeper/BIO0 equality
is proved before body removal. Production load validation was not weakened.
Negative persistence fixtures now enable civic capability before testing other
malformations, rather than passing trivially at the earlier version fence.

The old stationary telemetry normalizer cannot erase real civic motion and its
lawful perception consequences. Its original outer47 digests remain historical
evidence at6215116 and the passing cb9cd6d ration checkpoint above, not current
state promises. New exact30-step/3-advance current-save SHA256 witnesses are
`d8a06da291c52122e7cf88118ffdd7867a784ed1c0a89bffc92d0bdc2f4f38d4`
(estuary) and
`27ea1651058431261eb42b4c046b386840945c88c274c724dbdc3382a66cf9ce`
(density8). They freeze the entire current envelope without stripping bodies,
perception, events or announcements; complete telemetry-on/off save equality
still passes. The two exact body-cohort hashes additionally protect reassessment
without teleporting cleared-task bodies back to old ordinal positions. Mocked
clock diagnostics are not production performance evidence.

Terminal validation, default+JSON reporters:

- `npx vitest run src/game/residentMaterialActivity.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-material-service-final-2.json`:15PASS18.76s, including actual contention, intermittent stock, phase4/9 cold continuation, completion once and hidden/visible presentation. Controlled refill and projection-only camera placement are explicit, not player acquisition or ordinary travel proof.
- `npx vitest run src/game/runtime.residentRest.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-material-runtime-final.json`:11PASS71.07s, including actual material pulse/rollback, supported52 ration history and released50 absence. Initial failed reports remain retained.
- `npx vitest run src/game/runtime.performanceTelemetry.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-material-telemetry-final-2.json`:4PASS20.21s. Earlier characterization failures remain evidence, not relabeled green.
- The exact five-case `runtime.test.ts` GREET/hearing/body selection documented in the preceding ration record, with output changed only to `artifacts/validation/world0-material-greet-regression.json`:5PASS/93unselected20.48s. This is not the complete98-case suite or material-specific GREET acceptance proof.
- `npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-material-smoke-final.json`:maintained6files105PASS4.28s. Final `npm run typecheck`:PASS. `npm run test:documentation-reuse`:45PASS.

Affected-domain command:

```sh
npx vitest run src/sim/residentRationPulse.test.ts src/sim/residentRationUse.test.ts src/sim/residentRationActivity.test.ts src/sim/residentRations.test.ts src/sim/residentRations.integration.test.ts src/sim/residentActivity.test.ts src/sim/residentActivity.world.integration.test.ts src/sim/residentActivityEventLocus.test.ts src/sim/residentMaterialActivity.test.ts src/sim/residentCircadianPhysiology.test.ts src/sim/systemComposition.integration.test.ts src/sim/civicProjects.integration.test.ts src/game/residentActivityExecution.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/residentRationActivity.integration.test.ts src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentActivityPublication.test.ts src/game/saveCompatibilityPolicy.test.ts src/game/humanPerception.presentation.test.ts src/game/humanPerception.activity.test.ts src/game/uiProjection.test.ts src/game/projection.perception.test.ts src/game/projection.routes.test.ts src/game/projection.terrainMemo.test.ts src/game/residentSpatial.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-material-domain-first.json
```

26files470PASS25.94s, including unchanged frozen coarse civic and ration
world/save/event witnesses. No manual Chart/Relief play, new production timing,
natural-rate long-run service guarantee, package/build/deployment or fresh
complete cumulative certificate is inferred. Autonomous keeper inspection,
local environmental/traveler execution and remaining integration acceptance
stay unfinished. Completed directive bytes and unrelated implementation remain
unchanged; this slice does not close the current expansion.

### Lawful in-place keeper inspection — 2026-10-08

Local construction on `726770e67e8b93f5ed0718d3fc370c9b09dd4bdc`
connects the existing physical store to its keeper without a player prompt.
`settlementKeeperInspection.ts` creates at most one pre-world visual candidate
from the actual body, source point, shared sight/light and materialized spatial
window. The lower post-command/sleep ingress still owns admission. Only an
exact admitted belief becomes direct evidence; this reveals neither hidden rat
activity, remaining quantity nor a remote loss. After current resource resolution
and routine/response reconciliation, an eligible awake keeper at the exact dry
store point can commit the existing idempotent closure. No cargo, report, speech,
task root or new save schema is created.

The native keeper starts one tile east of the service point, facing the
independent dog at that point. Fifteen ordinary seed probes showed that a
continuously identified dog could become permanent watch duty and deny all
service; changing the geometry or deleting the dog would conceal that defect.
The human appraisal owner now gives an ordinary identified domestic dog the
same persisted, nonrenewing two-tick glance as a human. Identified exposed-food
sight is task knowledge, not permanent watch. Exact beliefs/search remain;
anonymous uncertainty, strong dog signals, predators and actual porter/working-
animal duties retain their owners. The dog's own cognition is unchanged.

Native runtime tests retain the real spawn, store, terrain and competing dog.
Controlled need/stock/schedule conditions cause existing ration/material/rest
approach to bring the keeper into contact; no task, arrival, observation or
closure is assigned. They prove silent securing, player independence, urgent
rest delay, source-removal counterfactual, phase9 cold equality and complete
late-failure rollback. This is **in-place inspection**, not a dedicated
inspection-driven trip, natural-rate service/liveness guarantee, complete human
activity acceptance, normal visual play or a public release.

Same-tick direct sight exposed an existing causal ambiguity in the player-report
path: lexical latest-evidence selection could substitute autonomous sight for
the report and fail the correct Voice response. An optional exact retained
evidence ID now binds that response to its real report. Wrong, missing or future
evidence fails closed; ordinary autonomous callers retain latest-evidence
selection. Existing report expression and admission are not broadened.

Current53/body-v3, carry14, world4/rules6, support/retirement policy, generator,
release identity and dependencies remain unchanged. Evidence and closure use
the existing store root; load cannot invent or replay incidental sight/audio.
Two existing loss fixtures now preserve independently committed keeper history
and use actual higher-priority belonging pressure to delay inspection. Two BIO0
rollback fixtures capture the real phase9 boundary before rejecting the closing
step, rather than treating nine accepted body steps as failed work. Their full
world/carry equality assertions are stronger; no load/rollback law was weakened.

Whole-current-save telemetry witnesses deliberately change with the real
appraisal/motion/perception consequences. Exact30-step/3-advance SHA256 values:
`ac1ddb59964936f939e905b90c40570146d1bbeb5e749c4dd5755450c35e1be5`
(estuary) and
`30825913a44f7e9bcee3d1aaf94007fe8fd88eee79aa70d7e4ad1bbcf68af7fb`
(density8). The corresponding42-body hashes are
`da2531e5b19a8c82186680c6fd81a4126c388e795ca2d8af4e66fdc78bec6fdb`
and `e3a4f30eb04763a0d19093928b8b1a15a2696658b3fcac0d3bd785df749fbd12`.
Full telemetry-on/off envelope equality remains exact; no body, perception,
store, event or announcement is stripped. Prior witnesses remain historical
evidence in the preceding records/Git. These mocked-clock tests are not
production timing, throughput or hitch-repair measurements.

Validation uses default and JSON reporters; retained local reports include
initial characterization/fixture failures as well as the terminal results:

- `npx vitest run src/game/settlementEcology.test.ts src/game/settlementKeeperInspection.test.ts src/sim/residentAttention.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-keeper-kernel-final-3.json`:50 PASS; new inspection owner25, attention10, store15.
- `npx vitest run src/game/runtime.residentRest.integration.test.ts src/game/runtime.keeperInspection.integration.test.ts src/game/runtime.performanceTelemetry.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-keeper-native-final.json`:21 PASS,105.11s; rest/ration/material11, new keeper6, exact telemetry4.
- `npx vitest run src/game/runtime.settlementEcology.integration.test.ts -t 'projects and secures one directly witnessed physical store|preserves an accepted-phase keeper reply|voices the committed store closure once|migrates released v32 store state|lets a witnessed domestic chicken perceive and consume one open-store unit|consumes exactly one stored unit after the shared rat-attraction event|keeps an unwitnessed physical store loss|coexists with generated chicken calls when the visible keeper secures' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-keeper-existing-store-final-2.json`:9 PASS/32 unselected. This is not the complete41-case suite.
- `npx vitest run src/game/runtime.bio0.integration.test.ts -t 'rolls the world' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-keeper-bio0-closing-rollback.json`:2 PASS/27 unselected; exact world/ecology/response/carry rollback. Five other selected BIO0 cadence/dog-motion/barrier/off-window/contextual-sight cases passed in the earlier7-case report; that report's stale rollback fixture failure remains recorded.
- `npx vitest run src/game/runtime.test.ts -t 'voices one committed GREET|keeps a resident recognized when the candidate introduction is not heard|rolls back introduction facts, save, and vocal audio when later interval closure fails|rolls back the whole interval when cause-owned hearing timing is rejected|restores the complete adopted body roster after a rejected fine-step replacement' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-keeper-greet-regression.json`:5 PASS/93 unselected.
- `npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-keeper-smoke-final.json`:maintained6 files/105 PASS. Final `npm run typecheck`:PASS. `npm run test:documentation-reuse`:45 PASS.

Affected-domain command:

```sh
npx vitest run src/sim/residentAttention.test.ts src/sim/residentCircadianPhysiology.test.ts src/sim/residentRationUse.test.ts src/sim/residentMaterialActivity.test.ts src/game/residentCircadian.test.ts src/game/settlementKeeperCircadian.test.ts src/game/porterResponse.test.ts src/game/settlementWorkingAnimals.test.ts src/game/settlementWorkingAnimals.guardianInvestigation.test.ts src/game/settlementKeeperInspection.test.ts src/game/settlementKeeperStoreResponseExpression.test.ts src/game/settlementKeeperStoreResponseExpression.activity.test.ts src/game/settlementKeeperStoreResponseAdmissionAuthority.test.ts src/game/humanPerception.test.ts src/game/humanPerception.activity.test.ts src/game/humanPerception.presentation.test.ts src/game/residentActivityExecution.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-keeper-domain-first.json
```

19 files/276 PASS,27.14s. This domain pass preceded the additive report-evidence
selector; its directly affected store/report/Voice cases subsequently passed
above. No fresh complete cumulative, production profile, web/desktop artifact,
manual Chart/Relief, packaging or deployment result is inferred. Dedicated
keeper approach, local environment/traveler execution and remaining acceptance
stay unfinished. Completed directive bytes remain unchanged.

### Shared explicit resident service capabilities — 2026-10-08

Behavior-preserving application cleanup on
`320d31898c679f5cfcdd03f0e8ebd19dd425d718` centralizes the current
material-capability classification in `residentActivitySupportsMaterials`.
Existing civic mode, use eligibility, movement/reanchoring, outer-save fences
and in-place keeper consumers now use that same explicit classification. Ration
classification retains both deliberately supported v2 and current v3. This
removes scattered consumer checks that could otherwise lose an existing
capability during a later protocol extension; it does **not** add that extension,
an inspection task, a new format or new gameplay. Frozen exact codec mappings,
whole-roster validation, schema53/carry14, support and dependencies stay exact.
Version classification is not authority to bypass shape/custody/world checks.

Terminal validation:

- `npx vitest run src/sim/residentActivityCapabilities.test.ts --maxWorkers=1`:7 PASS,172ms. Explicit v1/v2/v3 matrix, absent/unsupported versions and immutable minimal inputs; no numeric future-version acceptance or full-shape validation claim.
- `npx vitest run src/sim/residentActivity.test.ts src/sim/residentActivity.world.integration.test.ts src/sim/residentMaterialActivity.test.ts src/sim/residentRationActivity.test.ts src/sim/residentRationUse.test.ts src/sim/civicProjects.integration.test.ts src/sim/residentRations.integration.test.ts src/game/residentActivityExecution.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/settlementKeeperInspection.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-civic-capability-domain.json`:11 files/243 PASS,7.09s.
- `npx vitest run src/game/runtime.residentRest.integration.test.ts src/game/runtime.keeperInspection.integration.test.ts src/game/runtime.performanceTelemetry.test.ts src/game/residentMaterialActivity.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-civic-capability-native.json`:4 files/36 PASS,119.61s. Actual rest/ration/material/keeper selection, approach/use, priorities, fair contention, supported cold formats, exact phase4/9 continuation and late-failure rollback remain intact. Both current whole-save/body-cohort hashes in the preceding keeper record are unchanged; telemetry-on/off equality and historical coarse civic/ration digests stay exact.
- `npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-civic-capability-smoke.json`:maintained6 files/105 PASS,4.69s. Final `npm run typecheck`:PASS.

No existing test expectation, digest or runtime fixture changed. This is neither
an optimization measurement nor full cumulative/platform/visual/release proof.
Dedicated keeper approach and the remaining existing-human integration stay
unfinished. Completed directive bytes are unchanged.

### Resident-body integration fixture reconciliation — 2026-10-08

The unpublished `4878418799cab62f4666077ae4f83d1d36a6ec9a` cumulative
attempt terminated at its then-required1500-second cap (supervisor124/SIGKILL,
1500.024s). Its retained log reports99 completed files/1437 tests and16
failures across six runtime integration files; no final JSON exists. Context28,
player-facing39 and documentation-reuse45 self-tests passed before Vitest.
This remains **INCOMPLETE**, not a cumulative pass. The subsequent user
instruction lifts correctness duration caps, while extended profiling and
longitudinal soaks remain deferred; it does not relabel this historical run.

Focused reproduction established fixture assumptions inconsistent with enacted
resident bodies, rather than a reason to relax production validation:

- Synthetic pre-body v5/v9/v32 worlds retained current moved-body BIO0 porter
  addresses. Fixtures now derive the historical address through the same
  world adapter and retain every other BIO0 field and strict canonical bytes.
- Porter-specific silence/expiry checks incorrectly required world-wide silence.
  They now identify the exact porter sample; independent lawful chicken calls,
  porter hearing-once, audio, caption and forgery assertions are retained.
- Controlled phase-zero route relocation kept settlement ration/material tasks.
  It now revokes applicable tasks through explicit supported capabilities,
  preserving the body/circadian roots and strict membership validation.
- Controlled fall/seam relocation retained home-time heard-visible chicken
  receipts. No receipt is erased: bounded genuine accepted intervals consume
  pending acoustics before geography changes. Cold-load checks remain strict.
- Hearing witnesses use native human bodies at authenticated sound phases,
  not a coarse location override or forced wake. The clear world stays exactly
  unchanged; the masked counterfactual changes one dry crest only. Regional
  BIO0 assertions retain exact canonical equality with only the same resident's
  position/heading independently derived from saved world authority.

All16 observed cases pass in focused rechecks. The complete six-file affected
domain then passes142tests/0failed/0unselected in729.14s, terminal exit0:

```sh
npx vitest run src/game/runtime.bio0.integration.test.ts src/game/runtime.perception.integration.test.ts src/game/runtime.settlementEcology.integration.test.ts src/game/runtime.workingPeople.integration.test.ts src/game/runtime.regional.integration.test.ts src/game/runtime.fall.integration.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/domain-six.json
```

Focused before/after reports are retained under that same ignored diagnostic
directory. Maintained `npm run test:smoke` passes6files/105tests in6.00s;
`npm run typecheck` passes. The frozen712 tracked non-Markdown inputs have
aggregateSHA256 `80599418f3d4546c455b4e7d195aa17b723c2948968af341ad580a64ae8e691d`.
This slice changes tests and factual prose only: no production algorithm,
schema53/carry14, supported reader, retirement rule, dependency, release or
completed directive changes. No performance, long-soak, manual visual, platform,
directive-closure or publication proof follows from these correctness checks.

### Core-ecology body and acoustic fixture reconciliation — 2026-10-08

The uncapped cumulative on exact local
`354227667f729ce459de618d67a9d88c4cd7fa1e` completed in1541.57s:
395files,394passed/1failed;4770tests,4764passed/6failed/0pending.
Its retained `artifacts/validation/3542276-cumulative.json` has SHA256
`0ca69cec4ef97ffde6d9d7cb46efd985bd04a68596c199408379067c665b4119`.
This is a complete **FAIL**, not certification of subsequent test bytes.
All six failures belonged to `runtime.coreEcology.integration.test.ts`.
Focused inspection established these fixture causes:

- A remembered-deer hearing witness moved a resident's coarse location after
  canonical body adoption. Its listener now starts on a real generated route
  before adoption and advances normally. The repeat leaves world/body/tasks/
  posture unchanged, retaining the exact7,000-unit hearing bound and ordinary
  listener consequence. This is controlled initial placement, not proof of
  spontaneous human travel.
- Two mixed crow/warning/cargo fixtures retained lawful chicken acoustics from
  their original home. Bounded genuine accepted intervals consume the complete
  pending bank before controlled geography changes; no receipt is deleted.
- A synthetic released v32 fixture retained unrelated later alarm-event loci.
  Its separate historical graph now omits only those then-unavailable loci
  across all canonical sibling patches. Current malformed-crow rejection
  remains separate and unchanged; canonical commit/sealing still authenticates
  the complete graph.
- Synthetic v22/v23 wildlife-body saves retained future human activity fields.
  They now reconstruct the actual pre-human-body world and independently derive
  the same person's BIO0 address, preserving every other field and exact bytes.
  Wildlife carcass/mortality, quantity, adoption-once and replay assertions
  remain. Existing event-time authority cannot be silently removed.

The six failed cases pass focused rechecks. The final complete affected file
passes80tests/0failed/0unselected/0pending in724.78s:

```sh
npx vitest run src/game/runtime.coreEcology.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/core-complete.json
```

That report's SHA256 is
`d0340fa74059479dd1bc140786957d623b7c35abb2dec4153ef0782f717cac00`.
The frozen712 tracked non-Markdown inputs, sorted and encoded as
`[{path,sha256},…]`, hash to
`dd05133598ec32ecb89970afe3a189399ade37e2c23f6bed280c14d4fecc470d`;
the changed file hashes to
`b35019d6c565e79ac815a199dcebf77f475a2341f2e92ad26b6d3ee4d6b19f3c`.
All other711 tracked non-Markdown files remain byte-equal to3542276.
Maintained `npm run test:smoke` passes6files/105tests in4.34s;
`npm run typecheck` passes. No production algorithm, schema53/carry14,
supported reader, save-retirement rule, dependency, gameplay, completed
directive or release changes. Full-suite PASS on these newer test bytes,
platform/manual/performance and long-soak evidence are not claimed.

### Native keeper inspection preconditions — 2026-10-08

The next controlled runtime witness retains the native keeper, store, dog,
terrain, heading and separate physical food lot. A declared initial shortage
adjusts only the existing non-ration project's aggregate stock and initial
ledger; delayed existing recipes/offers cannot refill it within the interval.
No activity, intention, sight, arrival or closure result is assigned.

After nine ordinary accepted steps, all ten body poses remain at the real
one-tile dry source; the actual civic task waits for unavailable material and
no store knowledge exists. At the tenth step, shared sight and lower admission
create one exact identified exposed-food belief and direct keeper evidence.
The body remains at the source and the store stays open. A matched absence
counterfactual exhausts the physical food lot through eight existing finite
setup transactions, retaining retired identity/accounting; the same accepted
interval creates no food belief, keeper evidence or closure. These are source/
knowledge preconditions, not dedicated inspection movement, ordinary animal
feeding, player acquisition, normal visual play or complete settlement work.

The full `runtime.keeperInspection.integration.test.ts` passes8tests/0failed/
0unselected in21.47s, including its unchanged existing in-place closure,
priority, cold and late-failure proofs:

```sh
npx vitest run src/game/runtime.keeperInspection.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/keeper-preconditions-final.json
```

Maintained `npm run test:smoke` passes6files/105tests in4.28s; typecheck
passes. An initial2-case failure was the new test's JSON property-order
comparison, corrected to exact structured position equality; its failed report
is retained separately. No production/schema/reader/support/dependency change.
Inspection-owned task selection, exclusive approach, cross-root evidence/source
validation and cancellation remain the next implementation, not delivered by
this fixture proof. Profiling/soaks and platform/release proof are not claimed.

### Audio diagnostic integration watchdog — 2026-10-08

The uncapped cumulative on exact local
`d2741963f4d1e2b73c59c9c889885ee196197fe8` completed in2113.84s:
395files,394passed/1failed;4772tests,4771passed/1failed/0pending.
The sole failure was `runtime.expressionDiagnostics.test.ts`'s five-mode
audio-output equivalence case: **Test timed out in15000ms**. No state, hearing,
caption or audio-equivalence assertion failed. Its previous unchanged3542276
case passed in11.05s; the new failure occurred at15.375s. These are correctness
test durations, not player-performance measurements.

All712 tracked non-Markdown inputs remained unchanged during the complete run;
the sorted `{path,sha256}` aggregate remained
`f74828ee5a0e2d3221b38823805adf77ea65c9654b7acd700d61076637516809`.
The original `artifacts/validation/d274196-cumulative.json` is retained as
**FAIL**, SHA256
`98cf8803fd3d64beb29dfad84befcec7b28bfe482450252a0b16b900a46a1859`.
Its lost observation handle was not a reason to restart: the original live
process, final log, JSON and process termination establish the disposition.

The unchanged case first passed all comparisons with a60-second command-line
watchdog (1passed/6unselected;11.03s command duration):

```sh
npx vitest run src/game/runtime.expressionDiagnostics.test.ts -t 'preserves keeper authority, hearing and captions under reduced or blocked audio output' --maxWorkers=1 --testTimeout=60000 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/audio-watchdog-before.json
```

Only that case now declares the same60-second bounded integration watchdog
used by runtime peers. All five normal/disabled/zero-gain/blocked modes, real
clocks, exact save/state/hearing/caption comparisons and cleanup remain unchanged.
No global timeout, runtime algorithm, performance assertion, schema53/carry14,
supported reader, dependency or completed directive changed. The complete
seven-case file then passes7/0failed/0unselected in20.15s:

```sh
npx vitest run src/game/runtime.expressionDiagnostics.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/audio-watchdog-final.json
```

Maintained `npm run test:smoke` passes6files/105tests in4.94s; typecheck passes.
This focused correction does not relabel the original cumulative as a pass
or certify a later whole-suite run. Profiling/soaks, manual/platform checks,
public release and completed gameplay expansion are not claimed.

### Evidence-owned keeper inspection approach — 2026-10-08

Local construction starts from `6f16a63cdcf8c24fb108e22aec76b11cbdbcccd8`,
not a new public release. The existing forty-two resident bodies gain explicit
v4 inspection capability under outer54, while supported50/51/52/53 retain their
deliberate readers, absent/partial history and next-phase-zero adoption. Carry14,
inner-world4/rules6, generator, dependency and compatibility lifecycle do not change.

The controlled native fixture has an existing dry one-tile keeper/store approach,
ordinary inputs and a declared aggregate civic-material shortage. No intended
task, knowledge, heading, arrival or closure is injected. Actual lower-admitted
sight at421 precedes task selection422; ten ordinary bounded motion steps then
permit fresh sight/contact and the existing exact-once closure at423. Removing
the independently conserved eight-unit physical food lot through real setup
transactions removes sight, inspection and closure while retaining the same
material shortage. This does not prove ordinary animal feeding/acquisition.

Store/keeper/site/evidence provenance is authenticated separately from the inner
body codec. Current routine/duty/rest/ration priorities remain authoritative;
inspection excludes simultaneous material work. Closure, source exhaustion or
selected-evidence eviction releases the immutable task, not its body/knowledge
history. Trusted last-unit cold recovery validates the original tuple before
revocation and refreshes the detached view. Normal Warn stages publication before
acoustic admission; an injected admission failure leaves every saved root unchanged,
retains pending work/open stock and releases no audio, while an ordinary retry
commits one closure/reply. Phase4/9 continuation, forged references and late
closing-step rollback preserve the same authoritative roots.

The affected domain passes25files/499tests in92.53s. A subsequently added Warn
failure case passes with the complete keeper file18/18 in42.05s; the other24
files and every production byte remain unchanged. Exact commands:

```sh
npx vitest run src/sim/resident*.test.ts src/game/residentActivityExecution.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/residentMaterialActivity.integration.test.ts src/game/residentRationActivity.integration.test.ts src/game/settlementKeeperInspection.test.ts src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentActivityPublication.test.ts src/game/saveCompatibilityPolicy.test.ts src/game/runtime.keeperInspection.integration.test.ts src/game/runtime.residentRest.integration.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/keeper-approach-domain-final.json
npx vitest run src/game/runtime.keeperInspection.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/keeper-approach-runtime-final.json
npx vitest run src/game/runtime.test.ts -t 'rolls back introduction facts, save, and vocal audio when later interval closure fails' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/keeper-approach-shared-rollback.json
```

The shared rollback case passes1/97unselected in7.78s. Maintained
`npm run test:smoke` passes6files/105tests in5.32s; typecheck and documentation-
reuse45checks pass. Initial failed runs exposed new fixture timing/property-order/
inner-envelope mistakes and stale current53 assertions, not an altered simulation
outcome; corrected tests retain arrival, conservation and exact-root comparisons.

Final713 tracked-or-new non-Markdown input rows `{path,sha256}` hash
`dfb28b36e8492f447dd95534853b7e12424ab1b9d4d7a54dff25dc03f260f5bb`.
Domain report SHA256 is
`026910099523e5892e4ee530c7214a0ff4a115e5c156ddccd38f1900e24f7ef9`;
final keeper report is
`1763cc96b319a7ca929b9827f2b62f91c9300837c4618528b0517f601555ce19`.
These correctness durations are not performance measurements or a complete
current cumulative certificate. No normal visual, natural-rate liveness,
production artifact, platform, profiling/soak or release proof is claimed.
`check:player-facing-sync` remains NOT READY for this unpublished candidate:
unchanged release/manual identities and the pre-existing packaged smoke expected51
are not current54 release evidence. The release gate is retained, not weakened.

### Current resident telemetry characterization and GREET watchdog — 2026-10-08

The uncapped cumulative on `19965f1d958df5c35c0e8997f2b1321fb08fba6e`
finished **FAIL**, not a whole-suite certificate:396files/4797tests,
394files/4794testsPASS,2files/3testsFAIL,0pending,2411.94s. All713
tracked-or-new non-Markdown inputs retained the preceding `dfb28b36…` digest
through completion. The original process/log/report were followed without a
restart after losing the observer; its direct process exit was not recovered.
The final log and JSON establish the result. Report
`artifacts/validation/19965f1-cumulative.json` SHA256 is
`749450608e6b3840bf2b57b77c78c8fb6f91b1eac588d30d79326fd943e4c399`.

Two stationary telemetry fixtures still froze v3 bodies/outer53. The current
runtime deliberately prepares v4/outer54, including an explicit nullable
inspection field. Narrow reproduction preserved complete telemetry-on/off save
byte equality before either failed body hash. Source inspection and opt-in
characterization then verified the actual consequences: all42 phase-zero bodies
retain their real motion/physiology; both keepers already reached their store
through civic work, received direct exposed-food sight at421, and secured it
through the existing in-place transaction. Each store retains seven of its eight
physical food units after one domestic use, with no rat loss. No pending
inspection remains at423. These stationary seeds therefore do **not** prove
dedicated inspection approach; that acceptance remains with its separate
runtime fixtures.

The test now freezes that current behavior explicitly, including exact keeper
body/BIO0 address parity and retained closure provenance. It preserves all
accepted-step/tick, identity, pose, movement bound, need/rest, material-use,
session announcement, event and complete body/save digest assertions. No body,
knowledge, session, custody or integrity field is stripped or normalized into a
legacy oracle. The current whole-save digests are
`a2660d36c76ec55a055cd42046d5f3446e00395bcfd53ebe0515d3f6b313e30c`
(estuary,1,844,683bytes) and
`5efdc8695de1315d07c49a00f6431f61b4ca2f135c82984a25399aede4e0bb15`
(dense,1,900,967bytes), reproduced with exactly30 accepted steps/3 advances.
An initial new fixture expectation omitted the canonical BIO0 address version;
that fixture-only error was corrected with the existing version constant,
retaining complete address equality rather than weakening the matcher.

The third cumulative failure was the existing whole-runtime GREET/tamper/
hearing/caption-expiry/cold-reload case hitting its15000ms local watchdog
(18955.97ms reported), not a behavioral assertion. The unchanged case first
passes with a CLI60000ms watchdog (1PASS/97unselected,10.52s). Only that case
now has an integration watchdog; real clocks, every accepted step, tamper
rejection, hearing, knowledge, save, expiry and no-replay assertion stay intact.
No production, save-reader/schema/support, dependency, platform, release or
global timeout policy changes are made.

Exact focused commands, with the final run using default-disabled diagnostics:

```sh
npx vitest run src/game/runtime.test.ts -t 'voices one committed GREET through Living Voice and reloads it without replay' --maxWorkers=1 --testTimeout=60000 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/greet-watchdog-before.json
TIDEWEFT_WORLD_ADVANCE_DIAGNOSTICS=1 npx vitest run src/game/runtime.performanceTelemetry.test.ts -t 'characterizes equal accepted work' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/inspection-telemetry-before.json
npx vitest run src/game/runtime.performanceTelemetry.test.ts src/game/runtime.test.ts -t 'runtime performance telemetry|voices one committed GREET through Living Voice and reloads it without replay' --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/inspection-telemetry-greet-final.json
```

The final focused run passes both files/5selected tests (97unselected) in19.60s;
it includes all four telemetry tests. Its report SHA256 is
`dd8bc936eb59215a3ad534a60fcf526bcb823b7298a1644cc0c35e65dc9444a4`.
Maintained smoke passes6files/105tests in4.84s; typecheck and documentation-
reuse45checks pass. The original cumulative remains FAIL; these focused results
do not claim a new complete cumulative pass or certify unselected cases anew.
No build, normal visual play, production performance, profiling/soak, deployment
or completed-directive claim follows from these correctness durations.

### Native tidal rest-target characterization — 2026-10-08

On production sources from `1d9f18c`, a native `marsh wait` human has a dry
one-tile approach to a settlement point flooded at420/421 and naturally dry
at422. The existing runtime test fixture controls needs, weather and offer
timing only; it assigns no terrain, tide, body, task, knowledge or arrival.
Ordinary accepted steps4/14/19 retain the stationary dry-bank body, waiting
reason and original request age without recovery. Step20 advances native tide
and schedules retry without movement; subsequent bounded steps reach the
actual target at30, then admit restorative rest. Terrain remains byte-equal
and world conservation invariants hold at each captured boundary.

A cold save at19 followed by11 accepted steps equals every authoritative saved
root of uninterrupted30-step play; only the existing session recap/integrity
comparison exception applies. Load releases no audio. This is **physical
wet-target waiting and tide-enabled retry**, not observed-water knowledge,
informed route choice, cat avoidance, manual play or completed crossing scope.
No production, schema, support, dependency or rendering change is made.

```sh
npx vitest run src/game/runtime.residentRest.integration.test.ts -t 'waits on a dry bank for a native tidal target' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/native-tidal-target-focused.json
npx vitest run src/game/runtime.residentRest.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/native-tidal-target-domain.json
```

Focused1PASS/11unselected in9.73s; full affected file12PASS in72.52s, including
both hourly services, supported cold formats and failed-transaction rollback.
Full report SHA256 is
`b718e9b5f711a69aa63dd9a3c129581fb6b038b6f66724c1ecf73fe5fcbef378`.
Maintained smoke6files/105PASS in4.49s and typecheckPASS. These are correctness
durations, not production performance measurements or a new cumulative pass.

### Observed settlement-rest water response — 2026-10-08

The unpublished candidate on `b8fd422` connects one real selected-rest target
to lawful qualitative sight and a durable waiting/reassessment consumer.
[Architecture](./ARCHITECTURE.md#observed-settlement-rest-support) owns the
behavior, admission limits and v5/outer55 capability. Supported50–54, frozen
v1–v4, world4/rules6 and carry14 remain supported; no save is retired.

Native seed `marsh wait 41` supplies a generated dry bank and flooded target.
Only existing need/weather/offer pressure is controlled; tests assign no
intended body, task, belief, terrain, tide or successful result. Closing sight
from physical421 is still wet when admitted422, despite the newly dry physical
support. The informed actor retains its hold through422, receives actual dry
sight423, then physically arrives/rests424. Removing only that target sight
restores physical-only retry/arrival423. The original off-frame `marsh wait`
control remains physical-only. Cold29+11 equals uninterrupted40 across every
authoritative save root under the existing recap/integrity comparison exception.
Late interval failure restores the held task, wet knowledge and every root;
only the deliberate integrity warning plays, not rejected world audio.

Explicit adapter/codec tests additionally retain the hold through stale,
missing, evicted or foreign knowledge; fresh dry knowledge still requires
independent physical support. Producer fixtures exercise actual heading,
night light, window absence, foreign-target rejection and authenticated sleep
gating. Ten retained player phases plus8voices/8physical contacts preserve all
26 hearing observations and one ground fact,37 total within the unchanged48
cap. These controlled contract fixtures are not native gameplay certification.

Review caught a genuine appraisal edge: a weak warning belief can expire while
its suspicion pressure remains. Surface-only neutrality now requires zero
pressure; an eight-tick cold-clone counterfactual preserves the exact warning
pressure, search and appraisal. Ordinary `none` observations keep their prior
rules; explicit classified/null-subject visual `information` does not add
threat pressure. Its semantic eligibility remains the producer's responsibility,
not an automatic classifier of every possible hazard.

Independent real stationary captures from detached `b8fd422` and the candidate
each process30 accepted steps/3advances/3human observation collections for the
existing estuary/dense seeds. Each pair has exactly87 differences:42 body
versions4→5,42 owner IDs, outer54→55 and resulting world checksum/envelope
integrity. Every other task, body, knowledge, event, stock, player, session and
ecology value is equal; neither save was downgraded, normalized or resealed.
These controls contain no new ground receipt and do not prove the water hold.
The local differential SHA256 is
`77773e3e787b47101faa36773d7a798aa8daeb2fba9ec7ab5c145b34906a0693`.
Save sizes remain1,844,683/1,900,967bytes. The permanent telemetry tests retain
full instrumented/uninstrumented equality and all meaningful body/store/BIO0
witnesses before checking the independently captured current hashes:

| Scenario | Current body SHA256 | Current whole-save SHA256 |
| --- | --- | --- |
| estuary | `323dbb3ffee3b3f83d269abfb90623409736c83ec40b2d5de771d4793eb86c36` | `413fda33df75b4549c8b47f9ee480b27bb25e9c8b2502c2cb84c52f1aa06158d` |
| dense | `3844f7e7e9ec5ed08eb9f2ce03677d90e03ce94ff795e9e60dacba441148ea30` | `70e93665725d24f4b559b65f2641ef84b80bf35d3663d88d16ca27ac7634b17d` |

Final native/runtime command:

```sh
npx vitest run src/game/runtime.performanceTelemetry.test.ts src/game/runtime.residentRest.integration.test.ts src/game/runtime.keeperInspection.integration.test.ts src/game/runtime.test.ts -t 'runtime performance telemetry|ordinary runtime resident rest execution|keeper inspection|rolls back introduction facts, save, and vocal audio when later interval closure fails' --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/resident-environment-native-final.json
```

It passes4files/39selected tests (97unselected) in114.83s, report SHA256
`87d5c46e0dd14927df0115f970b3adc3b4d47a150438e6f46b3989827fbe0f19`.
The broader34-file actor/perception/circadian/body/save/publication/service
selection passes611tests in49.52s, report
`cee2c5892671cb78f0217284f2118f7ebceb16e9d36e8a2b62cdf96aa39c716a`.
Its original33-file attempt remains600PASS/1FAIL: the proposed49 total cap
contradicted the unchanged48 contract; capacity was retained, not the test
weakened. The new producer fixture's initial night-clock recipe schedule and
rollback-audio expectation were corrected against their existing owners.
Maintained smoke105PASS in4.17s and typecheckPASS. Detailed local command/input
records and synthetic captures remain ignored; the temporary baseline worktree
was removed after preservation, and the capture source is retained as a fixture
rather than an auto-discovered test.

Read coverage includes the complete active execution contract, affected
perception/task/save owners and relevant runtime interval/publication ingress;
it is not a whole-runtime inspection. No manual visual play, production FPS,
general current/load/crossing alternative, cat evacuation, full WORLD0 closure,
new cumulative certificate or public release is claimed. Correctness remains
uncapped; extended profiling/soaks remain deferred to full Living Foliage.

### Observed-rest cumulative and narrow test correction — 2026-10-08

The uncapped cumulative on clean `94e53b06358c6097f56ee5d7955a2dac64d8a3f6`
finished **FAIL**:400 files,398 passing;4849 tests,4847 passing and2 failing,
0 pending,2296.17s. The executable tree stayed unchanged until termination;
Node22.20.0/npm10.9.3 and the718 recorded non-Markdown inputs identify its
scope. The retained JSON SHA256 is
`a51d310a525c006cd0979585794f826cdeb5b515aa80687540017ca4310d11bd`.

```sh
caffeinate -i npm run test:ci -- --reporter=default --reporter=json --outputFile=artifacts/validation/94e53b0-cumulative.json > artifacts/validation/94e53b0-cumulative.log 2>&1
npx vitest run src/game/coreEcologyBreadthHabitat.test.ts src/sim/residentMaterialActivity.test.ts -t 'retains exact world binding through real bounded-cache eviction|requires v3.s explicit field' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/94e53b0-two-failures-recheck.json
```

The actual cache-eviction error is the15000ms watchdog, with17282ms recorded
duration. Its unchanged isolated reproduction passes in8936ms; the original
fixture/source/configuration are also byte-unchanged from19965f1. The test
still performs130 real derivations and requires actual eviction, new identity,
exact canonical bytes and original world binding. Only this correctness case
now has a60000ms local watchdog, preserving the existing90000ms CI allowance.
No runtime cache, derivation, hash or production performance budget changes.

The material-protocol assertion independently reproduces its failure: it still
calls deliberately recognized v5 an unknown ration protocol. The corrected
fixture requires v5's existing ration capability while retaining rejection of
a v3 record relabeled v5 without the successor owner/required fields. Unknown
99 and MAX_SAFE_INTEGER protocols must reject through both complete decoding
and version-only capability classification. Frozen-reader, malformed-task,
exact-arrival, exclusivity and project-binding assertions remain intact.

```sh
npx vitest run src/game/coreEcologyBreadthHabitat.test.ts src/sim/residentMaterialActivity.test.ts src/sim/residentActivityCapabilities.test.ts src/sim/residentActivity.test.ts src/sim/residentInspectionActivity.test.ts src/sim/residentSurfaceKnowledge.test.ts src/game/residentActivitySaveBoundary.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/cache-watchdog-and-protocol-final.json
```

Final affected selection7files/175PASS in14.93s, including the real eviction
case in10187ms; report SHA256
`e42ec803b64b9436e4d6d7a3b2ff0727d69d709cc86a33506ce09e1a2fc24ff6`.
TypecheckPASS; maintained smoke6files/105PASS in4.17s.
Only the two test owners and this evidence record change. Production, schemas,
supported readers, dependencies and directive contracts remain unchanged.
The original full run stays FAIL; focused evidence is not a new whole-suite
certificate. These are correctness durations, not production performance,
normal-play, build, release or deferred-soak proof.

### Contract-bound origin pickup — 2026-10-08

Local construction on `d85ceac6c20762b1fb140a9a115972b547f0fc74` replaces
timer-only origin pickup for explicit body-v6 residents with actual selected
approach/arrival. [Architecture](./ARCHITECTURE.md#contract-bound-origin-pickup)
owns the binding and transaction. Existing `ContractState.cargoQuantity` remains
the one aggregate cargo authority; route execution and destination handoff
remain coarse, not completed physical travel or addressable item custody.
Outer56 deliberately versions the new nullable task; supported50–55, exact
frozen body1–5 histories, carry14, world4/rules6, generator and release baseline
remain unchanged. There is no retired reader, new migration chain, dependency,
renderer, acoustic emitter or platform configuration change.

Native runtime fixture `runtime baseline estuary`, wild pressure, starts at420
with the actual offered parts Promise127, origin5→1, quantity8 and native stock,
terrain and resident offsets. Controlled exclusivity/weather/need pressure,
not an authored assignment/task/body/arrival, permits normal automatic acceptance
at421 by an existing origin resident. Ordinary accepted fixed steps then approach the generated
dry service point; fine arrival alone cannot debit stock. Closure performs the
same existing stock-to-cargo transaction once. The earlier test fixture's
unrelated exclusivity beyond its actual deadline was invalid; it was removed
before the lower commit-time tests could exercise their intended action. That
initial failed result is retained rather than called a production regression.

Phase4/9 cold continuation matches uninterrupted authoritative saved roots
(session recap/presentation restart is explicitly excluded). Native source
stock or incident-route removal prevents pickup at actual arrival. Restoring
stock by transfer from another existing settlement, or restoring those original
route traces, preserves the body/request age and permits one transfer at424,
none again at425. Prior consumption remains recorded; no stock is minted.
Cancellation/expiry revoke partial work without a source snap or cargo creation;
those command/expiry witnesses are lower-engine fixtures from a real runtime
approach, not proof of a new player control. Supported55 mid-interval history
stays v5 through cold phase9 and upgrades only at genuine phasezero.

Focused lower-engine fixtures also admit fresh strong/weak/neutral sensory
inputs before commit. A qualifying strong disturbance blocks the debit, retains
the body and is subsequently consumed by the actual routine owner; neutral or
subthreshold evidence is retained without blocking legitimate pickup. These
trusted input fixtures are not real acoustic-producer or natural audibility
proof. The new runtime late-closure failure restores all saved roots and releases
no committed vocal cue; the existing introduction/knowledge/audio rollback
case independently passes1selected/97unselected in7.12s.

The first40-file affected run ends668PASS/3FAIL in104.10s. All three failures
are in older porter-voice fixtures; bounded diagnostics retain their actual
causes. Two assumed next-minute departure from generated wet source/target
positions, so dry-foot execution correctly waits without cargo. The third
actually departs at422 with `Easy.` and an independently admitted chicken
`SQUAWK.`; global one-expression cardinality incorrectly excludes the shared
world. Fixtures now select an actual native dry cardinal one-tile source/target,
validate both acceptance/departure tides, and preserve original exact porter
admission/sample/schema, hearing, caption priority, audio, reload and tamper
assertions without requiring unrelated actors to stay silent. No terrain/body/
task/arrival is injected and no coarse-compatibility fallback is enabled.
The unchanged failed assertions and opt-in diagnostic results remain local;
temporary logging was removed. The three corrected cases pass29.87s.

Two independent actual production-runtime stationary captures, not synthetic
version rewrites, compare d85/body5/outer55 with candidate body6/outer56 at the
same30accepted steps/3world advances/3human observation collections/completed423.
Estuary and density8 each retain42residents and no selected pickup task.
Each has exactly129 expected path differences:42versions,42owners,42explicit
null pickup fields, outer version and the two seals; every other root/path is
exact, including body poses, knowledge, perception, ecology, stock and events.
Original SaveRecords are neither normalized nor resealed for comparison.
Current save SHA256 values are
`b549c127533a6243637de686955bb6561ac413bc8a39906cc3b5971085ddccc7`
and `4a71fe51ce48607cb759f96daab9c2f7c606999609539437b22ee80745a01412`;
1845523/1901807bytes, exactly840more perseed for42nullable fields. This is not
long-run growth or performance certification. Fixture, manifests, commands,
original records and exact comparator are retained locally under
`artifacts/validation/world0-cumulative-diagnosis/pickup-capture-record.md`.
Baseline during/after296-input identity is exact; candidate before/after is
exact. The inactive detached baseline checkout was removed after preservation,
without touching the primary installation or necessary private backup.

Final affected-domain command (frozen source, tests, configuration and assets):

```sh
npx vitest run src/sim/residentAttention.test.ts src/sim/residentCircadian.persistence.test.ts src/sim/residentMaterialActivity.test.ts src/sim/residentRationActivity.test.ts src/sim/residentRationPulse.test.ts src/sim/residentPickupActivity.test.ts src/sim/residentPickupUse.test.ts src/sim/residentActivity.test.ts src/sim/residentActivityCapabilities.test.ts src/sim/residentSurfaceKnowledge.test.ts src/sim/residentRationUse.test.ts src/sim/residentActivityEventLocus.test.ts src/sim/residentActivity.world.integration.test.ts src/sim/residentRations.test.ts src/sim/residentInspectionActivity.test.ts src/sim/residentRations.integration.test.ts src/sim/residentCircadianPhysiology.test.ts src/sim/phase8.test.ts src/sim/systemComposition.integration.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivityExecution.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/residentEnvironmentExecution.test.ts src/game/residentRationActivity.integration.test.ts src/game/residentMaterialActivity.integration.test.ts src/game/runtime.residentActivityPublication.test.ts src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentSoundPhases.test.ts src/game/runtime.residentAlarmLocus.test.ts src/game/runtime.workingPeople.integration.test.ts src/game/residentSpatial.test.ts src/game/residentCircadian.test.ts src/game/workingPeopleExpression.activity.test.ts src/game/workingPeopleExpression.test.ts src/game/residentIntroductionExpression.activity.test.ts src/game/residentWeatherHoldExpression.activity.test.ts src/game/projection.perception.test.ts src/game/projection.residentPickup.test.ts src/game/saveCompatibilityPolicy.test.ts src/game/humanPerception.restSurface.test.ts src/game/runtime.residentPickup.integration.test.ts src/game/runtime.residentRest.integration.test.ts src/game/runtime.performanceTelemetry.test.ts src/game/runtime.keeperInspection.integration.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/pickup-domain-accepted.json
```

44files/717PASS,233.69s,0failed; report SHA256
`7e0184fd3770d0661214b45983b992f212ed27c690f0694793f3d88806409b8d`.
All722 public non-Markdown inputs, including tests/configuration/assets, remain
exact before/after with manifest SHA256
`7a24b844221aa3f756dd0a0be85f2a8dff209b37a77dda3bfcd7926b29eb3ff1`,
Node22.20.0/npm10.9.3. Earlier40-file failed report remains SHA256
`839968714ffa67cf4de356cfb361e2159614e87c1bf34d88d361b93bda4691fe`;
the correction does not relabel that invocation or older cumulative failures.
The independently executed native scarcity/recovery owner also passes8/8 in
27.69s, and the focused corrected Voice cases pass3/3 with9unselected.
Final `npm run typecheck` PASS; `npm run test:documentation-reuse`45PASS;
`npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/pickup-smoke-final.json`
passes the maintained6files/105tests in4.12s.
Exact focused commands:

```sh
npx vitest run src/game/runtime.residentPickup.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/pickup-native-recovery-final.json
npx vitest run src/game/runtime.workingPeople.integration.test.ts -t 'presents, persists, and perceives one nearby heavy departure|rejects a self-consistent checksum whose expired porter cooldown was forged|stays silent for.*light Promise cargo' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/pickup-old-voice-fixture-fixed.json
npx vitest run src/game/runtime.test.ts -t 'rolls back introduction facts, save, and vocal audio when later interval closure fails' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/pickup-existing-introduction-rollback.json
```

This is affected-domain correctness, not a fresh complete cumulative certificate,
normal Chart/Relief visual proof, production performance, build, package, public
release or full traveler/directive completion. Extended profiling/longitudinal
soaks remain deferred to full Living Foliage; the accepted Relief/world hitch
and the requested VoiceOver testing hold are unchanged. Completed directive
bytes remain immutable; no gameplay-order transition is implied.

### Accountable ordered resident travel — 2026-10-08

Local unpublished extension from `fd194300accb11ddcb1699d1e7f2c61d0619296f`;
not a directive closure, production performance result or release. The parent
cumulative independently passed404files/4922tests in2282.87s with all722 public
non-Markdown inputs unchanged. That certificate belongs only to the parent,
not these executable edits. Current validation uses Node22.20.0/npm10.9.3 and
the unchanged installed dependencies. No platform/configuration/dependency,
renderer or upstream change is part of this slice.

The v7/outer57 extension binds new conserved resident journeys to an ordered
leg/next-waypoint cursor and the retained body. Shared local locomotion spends
at most105units per accepted step. One-shot source-bound closing custody
permits only the remaining part of the same1050-unit interval budget outside
the real interaction window, stopping at its first included point. Actual
final waypoint/support gates the existing handoff; ETA cannot certify arrival.
All retained poses receive monotone, bounded route validation. Supported
outer50–56/frozen body1–6 remain exact until genuine phase-zero evolution;
already in-transit old journeys retain explicit per-journey legacy continuation.
No format is retired. World4/rules6/carry14 and the one aggregate cargo owner
remain unchanged. [Architecture](./ARCHITECTURE.md#accountable-ordered-resident-travel)
owns geometry, custody, invalidation, support and legacy law.

The ordinary-runtime witness uses the existing density8 native food133 offer,
generated route126 and the production-selected origin resident. It controls
exclusivity, weather and need pressure, not task, body, route geometry, pickup
or successful outcome. Real
automatic acceptance leads to dry origin approach, one stock-to-cargo debit,
local movement, actual window exit, bounded macro continuation beyond the old
ETA, and once-only stock/need/trust/history consequences with retained
destination body. Detached phase4→phase9→terminal work equals uninterrupted
authoritative roots. Only the existing session recap is excluded from those
root comparisons; body/cursor/cargo, economy, events, perception, ecology,
knowledge and other authoritative save roots are not excluded.

The same witness captures a real off-window phase9, confirms lower-world macro
progress actually occurred in the candidate, then rejects later expression
interval closure. All authoritative roots roll back and only the integrity
warning audio releases. A cold retry obtains fresh custody and equals an
independently accepted reference, without duplicate motion, cargo or handoff.
Synthetic fixtures separately exercise forward/reverse and multileg geometry,
corner/leg joins, exact signed clipping, inactive legs, waits, receipt reuse/
revocation, malformed history and old-format capability fences. These are not
additional native journeys or manual visual proof.

Integration initially exposed a real heavy-departure Voice regression: the
retained event was reauthenticated against CURRENT departure progress after
genuine fine movement. The narrow shared source-owner repair keeps fresh
selection phase-zero-only and validates retained same-interval speech against
its original captured phase-zero body, authenticated itinerary and current
cursor/custody. It cannot move/repeat the source or survive a later interval or
released custody; legacy checks remain strict. New real phase4/9 cold cases,
seventeen malformed authority contrasts and genuine interval expiry prove the
distinction. No emitter, caption rule or general runtime exemption was added.

Final affected validation is a union of51files/879passing tests, not a fabricated
single invocation. The broad48-file invocation passed47files/845tests and
failed only the newly authored native test helper: it expected no save warning
after deliberately causing a safe integrity halt. The correction asserts that
exact warning and retains every rollback/cold/conservation assertion. Its
independent rerun passes1test in60.45s. The other47 files' inputs did not change.
The separately passing3-file source/pickup selection contributes33tests; only
the unrelated new native test changed afterward. Original failures remain
failed reports, not relabeled certificates.

Exact broad command:

```sh
npx vitest run src/sim/residentAttention.test.ts src/sim/residentCircadian.persistence.test.ts src/sim/residentMaterialActivity.test.ts src/sim/residentRationActivity.test.ts src/sim/residentRationPulse.test.ts src/sim/residentPickupActivity.test.ts src/sim/residentActivity.test.ts src/sim/residentActivityCapabilities.test.ts src/sim/residentSurfaceKnowledge.test.ts src/sim/residentRationUse.test.ts src/sim/residentActivityEventLocus.test.ts src/sim/residentActivity.world.integration.test.ts src/sim/residentRations.test.ts src/sim/residentInspectionActivity.test.ts src/sim/residentRations.integration.test.ts src/sim/residentCircadianPhysiology.test.ts src/sim/phase8.test.ts src/sim/systemComposition.integration.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivityExecution.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/residentEnvironmentExecution.test.ts src/game/residentRationActivity.integration.test.ts src/game/residentMaterialActivity.integration.test.ts src/game/runtime.residentActivityPublication.test.ts src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentSoundPhases.test.ts src/game/runtime.residentAlarmLocus.test.ts src/game/runtime.workingPeople.integration.test.ts src/game/residentSpatial.test.ts src/game/residentCircadian.test.ts src/game/workingPeopleExpression.test.ts src/game/residentIntroductionExpression.activity.test.ts src/game/residentWeatherHoldExpression.activity.test.ts src/game/projection.perception.test.ts src/game/projection.residentPickup.test.ts src/game/saveCompatibilityPolicy.test.ts src/game/humanPerception.restSurface.test.ts src/game/runtime.residentRest.integration.test.ts src/game/runtime.performanceTelemetry.test.ts src/game/runtime.keeperInspection.integration.test.ts src/sim/residentTravelActivity.test.ts src/sim/residentTravelAdvance.test.ts src/sim/residentTravelRoute.test.ts src/game/runtime.residentTravel.integration.test.ts src/game/worldPosition.test.ts src/sim/network.test.ts src/sim/engine.perception.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-domain-final.json
```

Final source and failed-test correction commands:

```sh
npx vitest run src/game/workingPeopleExpression.activity.test.ts src/game/runtime.residentPickup.integration.test.ts src/sim/residentPickupUse.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-heavy-source-final.json
npx vitest run src/game/runtime.residentTravel.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-native-rollback-corrected.json
npx vitest run src/game/runtime.test.ts src/game/runtime.wait.integration.test.ts src/game/runtime.playerTimeAction.integration.test.ts --testNamePattern='voices one committed GREET|keeps a resident recognized|rolls back introduction facts|rolls back the whole interval when|restores the complete adopted body roster|releases fixed-step .* audio only after interval commit|loads and rewrites the current schema|produces identical authoritative state across two ordinary render cadences|commits exactly 100 RAF-driven fixed steps|preserves partial progress on cancel|restores the awake interval anchor|releases real SLEEP|advances REST through ordinary fixed steps|saves a real settlement SLEEP' --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-runtime-rollback-cadence.json
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-smoke-final.json
npm run typecheck
```

Existing runtime timing/rollback/cadence selection passes18tests across3files,
92unselected,68.40s. It includes real GREET/no-replay, introduction rollback,
whole-interval hearing rejection, complete roster rollback, fixed-step audio
commit/rejection, current saves, equal render cadences, ordinary WAIT and real
REST/SLEEP continuation/late failure. Maintained smoke passes6files/105tests
in6.22s; final typecheck passes. None substitutes for a new cumulative,
production artifact, manual play, performance, mobile or release gate.

Broad pre-validation manifest728inputs has SHA256
`5631c15e71ef391e7b1006aa3ecccaee7b0d13c51f0602bf16bac2a4edc62cbf`.
Corrected final manifest728inputs is
`cda38eac98a177fadc0a966db18757b8406fc5d6f2450a0d9565cef2506facde`;
the only delta is the new native test helper above. All production, existing
test, configuration and asset bytes are unchanged across those invocations.
Broad original report SHA256
`d543f094e1ee68f8a5b844adff4a3e4b46c13900f680616971881442bbc9dad3`;
corrected native report
`b03c74f466c81ed214d3bfb3a0188dcd3529ccd2215c612f175c09893ca46f84`;
source/pickup report
`35570fce32d273602b0e2368497801abe6dd3e3f436b705fe67350e5b3ff5d30`.
Original reports/manifests remain local under the same ignored validation owner.

Independent stationary production-runtime captures compare actual parent v6
and candidate v7, not synthesized/resealed saves, at the same30fixed steps/
3world advances/3human observation collections/completed423. Estuary and
density8 each show129expected version/null-task/seal differences,0unexpected,
and840additional bytes. Candidate saves are1846363/1902647bytes, SHA256
`15b9d5991721d9f6653ed726b162da561443ddfa410c5e8be2340a33a3b469d0`
and `79a5539feda95734a73489abb762556f706f26c5dd8779333d314405e8e804fa`.
This characterizes unchanged stationary authority and current telemetry
witnesses, not save-growth bounds or timing gains.

Inheritance: shared body/locomotion, fixed-step authority, physical conservation,
lawful Voice sources, current-save validation and bounded work are INTEGRATED
for this bounded journey. General water/current/load/known-alternative response,
native reverse/multihop and full/coarse/full acceptance, cancellation/failure/
recovery breadth, subsequent-task liveness and normal Chart/Relief play remain
with current existing-world work. Addressable porter lots retain arrival-economy
owners; broad gear, injury, maritime and professions are NOT APPLICABLE to this
slice and keep their existing future owners. Composition remains PARTIAL.
No whole traveler/directive completion, cat-water fix, new performance pass,
release or gameplay-order transition is claimed. Extended profiling/soaks remain
deferred until full Living Foliage, and the accepted Relief/world hitch remains.

### Native traveler interruption and moving-window reentry — 2026-10-08

Test-only follow-up on local `b483199`; production, schemas, dependencies and
platform configuration are unchanged. An independent native offer/pickup prefix
reaches a real outside-window body. Explicitly changing only route126's trace
availability holds that body, heading, cursor, assignment and conserved cargo
past ETA, with no handoff. Ordinary westward player input rebases the actual
window from x18 to x2 and admits that same stationary body. Restoring only the
original availability permits scheduled reassessment, then positive bounded
local motion. Phase4→9 and phase9→closure cold continuations equal every saved
root except the existing session recap and integrity field.

This is environmental input, not a claimed player repair. It proves moving-
window admission and one resumed local interval, not macro entry into a fixed
window, resumed final handoff, informed-water response or normal visual play.
The preceding independent native test retains full handoff/rollback coverage.

The first file invocation passed that unchanged original case in54.03s and
failed the new test's unverified assumption that the survey's resident94 must
win. Actual production selection chose resident99. The correction follows the
authenticated native winner without assigning it; all hold/motion/cargo/cold
assertions remain. A new test helper's closure narrowing was also corrected.
The original failed report remains failed. The corrected new case passes in
30.79s,33.03s total, with the original case deliberately unselected:

```sh
npx vitest run src/game/runtime.residentTravel.integration.test.ts --testNamePattern='holds the same native cargo' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-native-reentry-corrected.json
npm run typecheck
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-reentry-smoke.json
```

Typecheck PASS; smoke6files105PASS,4.33s. All728 non-Markdown inputs match before/
after corrected validation, digest
`ef607d5e3fd505c68cf597968de8dd6e6e6603f13cba2871084195f6daaaa5d7`.
Corrected report SHA256
`c9bc697728784b07057b019fa144ac805de5f3aea57d643ca2a22d7112962e19`.
No current cumulative, build, manual, performance, release or directive-closure
claim follows from these finite correctness witnesses.

### Observed next-segment travel support — 2026-10-08

Local unpublished extension from `3bb2fdf17d87e3b131eab5476e96d70ed8a7cfa7`.
The existing optional actor+locus ground observation now also serves an
authenticated physical traveler's next endpoint, not its whole itinerary.
Shared window, facing, terrain sight, outdoor light and remaining observation
capacity govern the qualitative fact. It is information, not threat pressure
or an exact sounding. Observed wet support retains a waiting cause through
missing/stale evidence and route/weather/disturbance blocks. Only eligible
fresh same-locus dry knowledge plus independent support clears it. Closing
sight describes pre-world terrain; falling tide alone cannot clear knowledge.
Macro transport cannot erase that cause or invent observation.
[Architecture](./ARCHITECTURE.md#observed-next-segment-travel-support) owns exact law.

Body8/outer58 explicitly versions this meaning. Frozen v7/outer57 rejects the
new reason and remains deliberately supported, including exact phase4/9
history until genuine phase-zero evolution. Mixed v7/v8 cohorts and lower
envelopes carrying even all-null v8 reject. World4/rules6/carry14, generator,
one cargo owner, dependencies, configuration, renderer and Voice emitters are
unchanged; no format is retired.

Producer/execution fixtures prove qualitative sight, source authentication,
pre-tide wet admission, fresh-dry recovery, blockers, macro suppression and
isolated v7 behavior. Their initial transit/body/terrain is explicitly
arranged: foundation evidence, not native flood response or normal play.
The initial24PASS/1FAIL came from malformed legacy absence before collection;
removing both adopted activity and its bound circadian arrival corrected the
setup without changing guards or outcomes. Corrected25PASS is included in the
broad run. A synthetic compatibility fixture preserves exact v7 phase4→9→
closing body/cargo/cursor and equal continuation, upgrades only at genuine
phase-zero, and proves lower57 rejects v8 without overwrite. Existing native
dry delivery/interruption/reentry and retained departure audio still pass;
they do not prove native water response.

Affected-domain union59 distinct files/1,014PASS comprises52files/832tests in
217.13s, separate codec5files/176tests in3.71s and native travel/telemetry2files/
6tests in100.47s. Typecheck PASS; maintained smoke6files/105PASS4.15s;
documentation-reuse45PASS. Exact52-file membership is retained in
`artifacts/validation/world0-cumulative-diagnosis/travel-water-domain.json`;
the lead ran that list through `npx vitest run --maxWorkers=2` with default/JSON
reporters. Separately reproducible commands:

```sh
npx vitest run src/sim/residentActivityCapabilities.test.ts src/sim/residentTravelActivity.test.ts src/sim/residentPickupActivity.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/saveCompatibilityPolicy.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-water-codecs.json
npx vitest run src/game/runtime.residentTravel.integration.test.ts src/game/runtime.performanceTelemetry.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-water-native-telemetry.json
npm run typecheck
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-water-smoke.json
npm run test:documentation-reuse
```

All731 public non-Markdown inputs match before/after final validation, SHA256
`c1b72951f920fa9461e111436db898d6dac691985051202d9e75b28ba5451389`.
Broad report SHA256
`a88307784fceeb11e09f3d72bd15e0445036b9c3e45208ea75d0c79aa7e0a572`;
codec report `50cc20bd633538dba7bda3b9726e384ea44f5a2e57e5f02f0a5c2976fb2c23d1`;
native/telemetry `d0bbc740cf9bd2ee22a9af7a2378e0fe21e986cd776f342856558662ccc3ada0`.
Original failed fixture report is retained, not relabeled.

Independent actual v7/v8 stationary runtime captures, each30 accepted steps/
3advances/completed423, show exactly87 expected body-owner/version, envelope
and checksum differences per seed and no other root differences. Each performs
three human collections with zero optional information receipts. Save sizes
remain1,846,363bytes estuary and1,902,647bytes density8. Captures were not
synthesized or resealed to update an oracle; telemetry hashes changed only
after comparing those actual records. This is equal stationary work and
current-save characterization, not performance or long-run growth.

Inheritance is INTEGRATED for bounded observation, execution, conservation,
fixed-step/cold/rollback authority and save fences. Composition stays
PARTIAL/WEAK pending native water response. General crossing/current/load/
known alternatives, reverse/multihop, subsequent-task liveness and normal
Chart/Relief play remain unfinished. Addressable porter lots, injury, gear
and maritime work retain their owners. No cat fix, build/package, visual,
cumulative, performance, publication or directive closure is claimed.
Extended profiling/soaks remain deferred to full Living Foliage; accepted
Relief/world hitch and VoiceOver hold persist.

### Native traveler tidal hold and evidence-qualified retry — 2026-10-08

Test-only follow-up on `f2d04ddbc61b19ad0d5697ad99fce32d994419cb`; no
production, schema, dependency, configuration or renderer change. The existing
estuary/wild parts127 fixture supplies a generated offer, native assignment,
unchanged terrain/routes and finite eight-unit source. Only offer exclusivity,
weather and need pressure are controlled. No body, task, belief, tide or
successful result is assigned.

Actual acceptance→approach→pickup→route121 movement reaches the native dry
bank(43,48), next endpoint(43,47), before449. Native tide still covers that
endpoint449 and exposes it450. Observed wet support holds the same body/cursor/
cargo after450 physics becomes dry, because closing sight still describes449.
Fresh dry sight451 permits subsequent bounded fine motion. Removing only that
actor+locus receipt from a genuinely held450phase9 fork leaves dry physical
support but unknown current knowledge, preserving observed-water and zero
motion. A second native branch removes only this endpoint sight throughout;
physical obstruction blocks fine steps, but uninformed phase-zero retry moves
as soon as450 support is dry. Thus the information source changes behavior
without modifying physical conditions or manufacturing another inventory.

Both branches cold restore actual449phase4 andphase9 saves without audio,
then process exactly20/15 further accepted steps to equal451phase4 roots.
Comparison excludes only session recap/integrity, not world, body/cursor,
cargo, economy, events, perception, hearing carry, ecology or knowledge.
An external preparation observer confirms real451 fresh-dry release before
deliberate late expression-closure rejection. Every root rolls back to450phase9,
only integrity-warning audio releases, and cold retry equals the independent
successful451 boundary and four-step continuation. Cargo remains8, origin
stock remains debited once and departure count is1; there is no fulfillment.
The following endpoint remains wet, so this proves first-endpoint response,
not a complete flood journey or known alternative.

Initial new selection passes the observed case and fails the uninformed
fixture's phase-zero wait assumption. That physical-only retry is legitimately
due at each new boundary; asserting its actual partial-phase blocked state
instead preserves bank immobility and every cargo/sight assertion. Initial
helper type errors used a nonexistent event spelling and an unnarrowed legacy/
physical union; both corrected in the test only. Original failed report is
retained as FAIL. Corrected selection2PASS/11unselected42.37s; final full file
13PASS71.83s, smoke6files105PASS4.18s, typecheckPASS:

```sh
npm run typecheck
npx vitest run src/game/runtime.residentPickup.integration.test.ts --testNamePattern='waits at a native tidal endpoint' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-water-native-corrected.json
npx vitest run src/game/runtime.residentPickup.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-water-native-full.json
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-water-native-smoke.json
```

All731 public non-Markdown inputs match before/after, digest
`3b6c52c8913c1c4e01cae0481718f2e01ff7c6517dcdb144736a9970b2f78c38`.
Full report SHA256
`7e5028893d51ee7c86cc8f516c42d43cbf6cf3dad31ebc40a8b018b9b6049a16`;
smoke `28678cbf3a893e13b188a4f229e54935305175c15ebf0d290f57d200d0566d80`.
Composition is PARTIAL/MODERATE, upgrading foundation-only evidence for this
one native consumer. This is headless ordinary-runtime authority, not manual
Chart/Relief, natural-rate liveness, current/load/alternative-route breadth,
performance, package, cumulative, release or whole-directive completion.
Existing accepted limitations and future-owner boundaries are unchanged.

### Route-bound human hearing fixture reconciliation — 2026-10-09

The exact clean local `b51bef3e474426218ae2e04d696afece2fd31da6` cumulative
run is terminal **FAIL**, not a certificate:411files (409passed/2failed),
5104tests (5095passed/9failed/0pending),2205.56s. All731 public non-Markdown
source/test/configuration/asset inputs and HEAD are unchanged before/after,
digest `3b6c52c8913c1c4e01cae0481718f2e01ff7c6517dcdb144736a9970b2f78c38`.
The retained `artifacts/validation/b51bef3-cumulative.json` has SHA256
`2aa9f4bbc7e9f69a406fd12d1bc086d3484a5fb7af1146b0a912903215ddf3c8`.

All nine failures belong to the two unchanged ecology integration tests.
Focused reproduction preserves every assertion and adds only the actual
announcement to a missing-frame error. It reproduces9FAIL in70.47s: eight
stop at adopted-routine validation and one directly rejects an unbound human
body. These fixtures put an uncommitted person on a route; current physical
travel correctly requires a bound in-transit Promise. Coarse membership is
also no longer an independent acoustic-listener position setter.

The correction changes controlled test geography only. The same free human
retains settlement membership, identity, knowledge, needs and custody. An
existing generated route selects a real point/tangent on a temporary copy;
the actual phase-zero pose and awake/arrival state use the activity/circadian
owners. Only a genuinely absent complete roster is adopted; partial cohorts,
consumed histories and unknown capabilities are not repaired. Applicable
tasks are cleared for the controlled relocation without changing their
supported versions or suppressing subsequent native selection/movement.
Real cat rain, goat alarm, keeper reply, guardian warning and remembered-deer
sources retain their existing producers and exact hearing/refusal, anonymity,
audio, cold/replay, tamper and rollback checks. No hearing result is injected.

The first corrected selection passes8cases but rejects the deer fixture's
newly staged current body inside its synthetic historical envelope. The final
deer-only ordering correction first completes that unchanged historical
ecology adoption, then stages the body in a current world-only reseal. Every
non-world/non-integrity root remains exact; no accepted step occurs between
the two cold stages. Deer subsequently passes its original case in21.98s;
the original cumulative and intermediate failed reports remain FAIL.

Complete affected-domain validation passes both files, all121tests, in863.53s;
maintained smoke passes6files/105tests in5.46s. Typecheck and all45 documentation
reuse checks pass. The731 public non-Markdown inputs and parent HEAD match
exactly before/after, digest
`819b7784b1a17ca37537ed7e69c87b4e48c0b85c9e4b8bb7278e48b6dbed2084`.
Reports in the existing ignored validation owner are
`hearing-fixture-domain.json` (SHA256
`23aa7de233962446c1942ed003f4ae5c995b54422c061737c168d970dbf4400d`) and
`hearing-fixture-smoke.json` (SHA256
`ef7a9a9e0866535743652c151e613638191aa27d0d5cdc0e1d0841dbe5ef3202`).
The identical before/after input manifests have SHA256
`31e644cbbcafa9144ba2166a3a3ca6a11e9c8d7588b24f366191ac56aaecce4a`.
This repairs the nine reproduced failures without recertifying the complete
cumulative suite. No manual visual, performance, package, release or
directive-closure result is claimed. Validation uses unchanged
Node22.20.0/npm10.9.3 dependencies:

```sh
npm run typecheck
npx vitest run src/game/runtime.coreEcology.integration.test.ts src/game/runtime.settlementEcology.integration.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/hearing-fixture-domain.json
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/hearing-fixture-smoke.json
```

No production algorithm, body v8/outer58/carry14 schema, supported reader,
retirement policy, platform/dependency/configuration, game behavior or completed
directive changes. The repair does not certify cat flood avoidance, general
NPC equipment, completed travel/environment scope or a new public release.

### Native interrupted courier handoff — 2026-10-09

Test-only follow-up on local `ce7909caf934bc9d4da1e8ad35bf181d308516d9`
extends the existing native density8 food133 witness through final handoff
after interruption. Automatic selection, origin approach and pickup retain the
same generated14-unit cargo and route126. Only route availability is controlled:
inactive trace stops the same off-window body/cursor beyond ETA, ordinary player
movement reenters its real interaction window, and restoring the saved native
trace permits due reassessment and bounded actual movement. This is not a
player repair action, direct sight, invented observation or assigned arrival.

The delegating primary-only observer captures primitive pre-call state and
new event sequences without consuming admissions or changing world work.
Remaining waypoint count gives a finite bound accounting for the unused step
allowance discarded at corners. Monotone fine/macro progress retains the same
1050-unit interval maximum. Physical final arrival transfers exactly14 from
the same contract to destination7 stock once, clears the commitment/task and
retains the actual destination body. Completion remains later than the old ETA.
Destination-specific recipe/project, hourly ration and competing-transfer
guards justify that stock delta without disabling those consumers or using a
global consumption total as a local substitute.

Exactly one further ordinary interval continues coherently. Phase4 cold work
joins phase9 after five accepted steps; phase9 reaches the identical terminal
at the same accepted-step count, comparing every saved root except the existing
session recap and envelope integrity exclusions. Subsequent legitimate task,
need or stock changes are not suppressed. This proves bounded continuation,
not indefinite task liveness, normal visual play or a recurring service.

Typecheck PASS; complete travel file2PASS93.00s and maintained smoke6files/
105PASS4.19s. All731 public non-Markdown inputs and parent HEAD match before/
after, digest `4e1b7bbed0c44d607213197d23897c6c9912c76e48dc56bb6231f58eaa1b64a6`.
Ignored `travel-reentry-handoff.json` report SHA256
`d28741af8c79717e3ecadd352006462b66847c5909243fb38d255298da9f74d7`;
smoke report `8972b2ebad1c595d094ff1a3b5c14d78250cdda93be1f1a5066a0a7db5241259`;
identical input manifests `39d2eebf191c2965734ec180ffae632b7c78cb3ae4ff3ecc82e82cf268691336`.
Commands retain current Node22.20.0/npm10.9.3:

```sh
npm run typecheck
npx vitest run src/game/runtime.residentTravel.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-reentry-handoff.json
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/travel-reentry-handoff-smoke.json
```

Production, schemas/readers, dependencies and configuration are unchanged.
Native reverse/multihop, current/load/support and informed alternatives,
carried-cargo legal failure/recovery, longer subsequent-task liveness and
normal Chart/Relief acceptance remain unfinished. No cumulative, production
performance, package, publication or whole-directive closure is inferred.

### Exact interrupted-courier cumulative checkpoint — 2026-10-09

The maintained complete `npm run test:ci` passes on clean
`bfc39970e2b2e4d5fc80e1fc865db8ef1cc32e51`:411files/5104tests,
0failed/0pending,2213.83s. All731 public non-Markdown inputs and HEAD match
before/after, input SHA256
`4e1b7bbed0c44d607213197d23897c6c9912c76e48dc56bb6231f58eaa1b64a6`.
Node22.20.0/npm10.9.3; the existing boundary/finished-directive checks remain
unchanged. Command:

```sh
caffeinate -i npm run test:ci -- --reporter=default --reporter=json --outputFile=artifacts/validation/bfc3997-cumulative.json > artifacts/validation/bfc3997-cumulative.log 2>&1
```

Ignored JSON report SHA256
`6f228afa68b7a561ae21039a3bce9fa93718f15b0f529bb3507ee54e354fe897`;
log `1bf69701af3aa4b303b644731d2908b2d7dd26c7e6f920a7949f0bf316293df3`;
both input manifests
`05ba389a5b8fb14728f8003bbdc3b2f180159af82fe638550bff24ff28c21f2f`.
The original earlier b51bef3 nine-failure report remains historical FAIL.
This is an exact cumulative correctness certificate, not a new production
performance, visual, package, release or complete traveler/directive result.
Subsequent cargo-work edits need their own applicable validation; this pass
cannot certify those changed executable/test bytes.

### Conserved cargo-aware resident travel work — 2026-10-09

Local construction on bfc3997 makes actual resident Promise cargo affect future
dry-route travel, not merely identity or speech. `cargoEnvironment.ts` now owns
the existing resource/property/unit-load mapping reused by player parcels and
resident work. Loose cargo retains its original quantity validation; aggregate
transit accepts its own positive-safe-integer quantity domain. Exact BigInt
arithmetic precedes bounded penalty saturation, including1,000,001 and
Number.MAX_SAFE_INTEGER foundation inputs; no quantity is truncated or duplicated.
[Architecture](./ARCHITECTURE.md#accountable-ordered-resident-travel) owns the
105-minus-rounded-load rule and32-unit ceiling. Food14 permits91units per
step; parts14 permits77. This is no NPC capacity or equipment claim.

Fine and macro execution consume one ten-step allowance. The one-shot closing
receipt binds the actual contract slot/root and captured cargo/assignment
inputs; changed inputs reject and revoke it. Current accepted105-unit prefixes
retain their paid history and future work saturates at zero rather than
rewriting a save or manufacturing obstruction. Frozen v7 partial intervals
retain105 through genuine closure; existing runtime compatibility tests retain
real phase-zero adoption. No schema, reader, format-support, dependency or
configuration change occurs: current outer58/carry14, world4/rules6 remain.

Source-conserving arranged adapter cases prove actual104/91/77 displacement,
retained v8 phase9 prefixes below/equal/above910, zero extra macro work, same
body/task, moving-v7 closure, and serialized/cloned phase4/9 equal-work
continuation. They are foundation evidence, not autonomous acquisition or
outer-save adoption. The real native food133 journey still performs automatic
acceptance, exact pickup, local/window-exit/macro continuation and once-only
handoff under its910-unit quota. Its interrupted counterpart retains cargo
past ETA, reenters through ordinary player motion and resumes to handoff plus
one following interval with equal cold terminal roots. No task, destination,
success, cargo or stock result is injected. Availability remains a controlled
environment input, not player repair. Native tidal parts127 still distinguishes
informed waiting from uninformed physical retry and preserves cold/rollback
proof. Its actual eight-unit load now permits89units: four dry steps356, not420.

The initial affected-domain run is retained as FAIL:28files/713tests,
712PASS/1FAIL,163.38s. The sole failure is that old unloaded420 assertion;
the new behavior produced exactly356. Only that test owner's import and exact
cargo-qualified expectation changed, preserving knowledge, movement, hearing,
custody and cold checks. Its complete13-case file then passes71.11s;
the unchanged27 complete passing files supply700 tests. Thus the verified
affected-domain union is28files/713tests, not a relabeled first invocation.
Maintained smoke6files/105tests, final typecheck and documentation-reuse45 pass.
Exact commands:

```sh
npx vitest run src/sim/cargoEnvironment.test.ts src/sim/residentActivity.test.ts src/sim/residentActivity.world.integration.test.ts src/sim/residentActivityCapabilities.test.ts src/sim/residentActivityEventLocus.test.ts src/sim/residentSurfaceKnowledge.test.ts src/sim/residentPickupUse.test.ts src/sim/residentPickupActivity.test.ts src/sim/residentTravelRoute.test.ts src/sim/residentTravelActivity.test.ts src/sim/residentTravelAdvance.test.ts src/sim/systemComposition.integration.test.ts src/game/looseCargo.test.ts src/game/player.test.ts src/game/residentActivityExecution.test.ts src/game/residentTravelEnvironmentExecution.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/saveCompatibilityPolicy.test.ts src/game/humanPerception.activity.test.ts src/game/humanPerception.presentation.test.ts src/game/projection.residentPickup.test.ts src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentActivityPublication.test.ts src/game/runtime.residentRest.integration.test.ts src/game/runtime.residentPickup.integration.test.ts src/game/runtime.residentTravel.integration.test.ts src/game/runtime.residentTravelEnvironmentCompatibility.integration.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/cargo-work-domain-first.json
npx vitest run src/game/runtime.residentPickup.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/cargo-work-pickup-final.json
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/cargo-work-smoke-final.json
npm run typecheck
npm run test:documentation-reuse
```

Both diagnostic/final intervals freeze all731 public non-Markdown inputs and
parent HEAD. Final input SHA256
`f7276eaf21a6ead61856b2271b9f7740b05d0b891cb6b7e9f980276349f92075`;
only `runtime.residentPickup.integration.test.ts` differs between them.
Ignored first report SHA256
`bb7f5559fcbf441f759dc21fdd558bc667913c1a6f4d7c017edce3a838a1d336`;
final pickup `f354557b637bc8f684dfc156b0e2a64f74c426451953b25a547e3fb221bae5c2`;
smoke `d744153a20633d49e2655e92ce0c192bf1bc2258708257c09edfb710be031ea2`.
Final before/after manifest SHA256
`32ede6e96d9debc07c49a1f80d249800d1beb77f315358dc0ebbd68709b57669`.
Node22.20.0/npm10.9.3. These are headless production-authority correctness
witnesses, not browser/package performance or normal Chart/Relief visual proof.

Applicable inheritance is INTEGRATED through existing deterministic timing,
physical conservation, accepted body/cursor history, full/coarse transport,
current-save/rollback and knowledge boundaries; no new acoustic event or HUD is
created. General water/current/footing/support, informed alternatives, native
reverse/multihop and legal carried-cargo failure remain unfinished with the
current world-response owner; addressable stock/lot conversion and physical
equipment remain their future owners. No whole-directive, cumulative-on-new-
bytes, production performance, package or public release is claimed. Accepted
Relief limitations and full-Foliage extended profiling/soak deferrals remain.

### Native reverse medicine journey — 2026-10-09

Test-only follow-up on local `7380612cca54e2180c6b55c203d6e12d3acdd597`
adds one reverse journey to the existing ordinary-runtime travel owner. The
actual wild density9 world independently supplies medicine offer129,
12units from settlement4 to3, using route117 stored3→4. Original terrain,
routes, stock, ledger, residents and all other offers remain unchanged. Only
the selected offer's exclusivity, clear weather and declared need pressure
are controlled, matching the forward witness's explicit fixture boundary.
No winner, task, body, pickup, cargo, arrival or handoff result is assigned.

Automatic selection finds an existing origin resident, approaches its real
source and debits12 medicine into the same contract. Local motion checks exact
reverse phase4/9 body and heading; ordered stored progress decreases while
physical distance increases. The actual120×120 interaction frame contains the
origin but not the destination. Fine and subsequent off-window macro work share
the900-unit interval ceiling from the conserved medicine load. The75,000-unit
journey completes at actual destination support beyond its old ETA, transfers
12medicine once, releases commitment/task and retains the arrived body.

The receiving settlement's real reed recipe and parts project do not consume
medicine; hourly rations consume food/water. Same-step competing medicine
departures/fulfillments are explicitly excluded by observed events rather than
disabling consumers. The fulfillment event records zero project contribution,
and world invariants remain checked at every delegated production step.
Exactly one following ordinary interval executes without injecting a new job
or suppressing subsequent legitimate activity. Cold phase4 advances five
accepted steps to the exact saved phase9 roots; a detached phase9 then advances
the identical suffix through handoff and that following interval. Every saved
root compares exactly except existing session recap and envelope integrity.

The initial focused case passes60.01s (two deliberately unselected cases).
The complete affected travel file passes all3cases158.00s; maintained smoke
6files/105tests passes4.16s; initial/final typecheck and documentation-reuse
checks pass. All731 public non-Markdown inputs and parent HEAD match before/
after, input SHA256
`56b45c9dce3d5c26f668f936d76485ae06ae5d32cc9e471bbeaad6acb4404ae2`.
Ignored final report SHA256
`e358b1c539235d43731c2649819826bd8e634433100e1807b372d09ff8ddfc2f`;
smoke `48f04369a6e2be9ed67bff912be3090679e5c7be8205879906b7dfb0b432cba5`;
identical before/after manifests
`d70c64d6ea95fec503a717caa58f41a35c8f8a2786f88615e95a2d7ac9d9ff1b`.
Node22.20.0/npm10.9.3. Exact validation commands:

```sh
npx vitest run src/game/runtime.residentTravel.integration.test.ts --testNamePattern='physically completes one native reverse medicine journey' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/reverse-travel-first.json
npx vitest run src/game/runtime.residentTravel.integration.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/reverse-travel-final.json
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/reverse-travel-smoke.json
npm run typecheck
npm run test:documentation-reuse
```

This upgrades reverse travel from arranged foundation-only evidence to one
headless native production-authority witness. It is not manual Chart/Relief,
audio hardware, performance, package, publication, general liveness or whole-
directive proof. Native multihop and wider environment/alternative/recovery
acceptance remain unfinished. Current carried resident interruptions preserve
position/cargo and retry; no legal in-transit resident cancellation producer
exists, so pre-pickup cancellation and player harbor return cannot certify
carried-resident failure. Deployed mat effects are available to the player but
resident movement and benefit-qualified atomic assisted wear remain unjoined;
their tested kernel alone is not live support. These gaps retain their actual
world-response/domain owners rather than invented outcomes or future equipment.
No production, schema/reader/support-set, dependency/configuration, completed
directive or release change. Existing Relief and full-Foliage deferrals remain.

### Shared resident dry-ground travel — 2026-10-09

Local follow-up on `5daff70bdaf9e0d5389e51b9e3239b7c312ad386` moves the exact
existing five-value player terrain drag map into `footing.ts` and reuses it
unchanged in player calculations. Current v8 local contract travel now uses
actual source/contact ground to constrain future displacement beneath the
existing conserved-cargo quota. Path preference is not kinetic authority;
target ground cannot help before contact. The remaining interval allowance is
not scaled twice. Frozen v7, accepted105-unit prefixes, macro transport,
service/pickup pace, support-set/readers and schema58/carry14 remain unchanged.

Source-conserving adapter contrasts prove food14's91-unit ceiling produces
55/62/84/51 on dry flat/marsh/meadow/ridge respectively. A retained870-unit
prefix with40remaining on ridge reaches910, not a second57% charge on40.
The existing below/equal/above-quota histories, moving v7 and exact serialized/
cloned phase4/9 continuation remain checked. These arranged contrasts are
foundations, not native acquisition. The actual native tidal pickup/wait test
derives four resumed steps from the unchanged bank tile; removing fresh sight
still changes knowledge behavior without granting exact-depth beliefs.

All three native journey cases still prove conserved pickup/handoff and equal
cold work. Reverse phase4/9 expectations derive EVERY step's actual native
source tile, including crossing the half-edge boundary, and check heading and
directed distance. Witness duration bounds now derive from real cardinal-edge
geometry and the slower of its two contact speeds, not arbitrary extra time
or modified terrain. They do not establish general interruption/liveness bounds.

Focused five-file report passes84tests. The complete affected domain passes
31files/743tests,0failed/0pending,202.35s; full native travel3passes185.74s.
Maintained smoke6files/105tests passes4.17s. The exact late-introduction closure
rollback case passes, with97other runtime cases deliberately unselected.
Initial/final typecheck pass. Exact commands for the broader/final evidence:

```sh
npx vitest run \
  src/sim/cargoEnvironment.test.ts src/sim/residentActivity.test.ts \
  src/sim/residentActivity.world.integration.test.ts src/sim/residentActivityCapabilities.test.ts \
  src/sim/residentActivityEventLocus.test.ts src/sim/residentSurfaceKnowledge.test.ts \
  src/sim/residentPickupUse.test.ts src/sim/residentPickupActivity.test.ts \
  src/sim/residentTravelRoute.test.ts src/sim/residentTravelActivity.test.ts \
  src/sim/residentTravelAdvance.test.ts src/sim/systemComposition.integration.test.ts \
  src/game/looseCargo.test.ts src/game/player.test.ts \
  src/game/residentActivityExecution.test.ts src/game/residentTravelEnvironmentExecution.test.ts \
  src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts \
  src/game/saveCompatibilityPolicy.test.ts src/game/humanPerception.activity.test.ts \
  src/game/humanPerception.presentation.test.ts src/game/projection.residentPickup.test.ts \
  src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentActivityPublication.test.ts \
  src/game/runtime.residentRest.integration.test.ts src/game/runtime.residentPickup.integration.test.ts \
  src/game/runtime.residentTravel.integration.test.ts src/game/runtime.residentTravelEnvironmentCompatibility.integration.test.ts \
  src/game/footing.test.ts src/game/footing.release.audit.test.ts src/game/player.gear.integration.test.ts \
  --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/ground-drag-domain.json
npm run test:smoke -- --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/ground-drag-smoke.json
npx vitest run src/game/runtime.test.ts --testNamePattern='rolls back introduction facts, save, and vocal audio when later interval closure fails' --maxWorkers=1 --reporter=default --reporter=json --outputFile=artifacts/validation/world0-cumulative-diagnosis/ground-drag-late-closure.json
npm run typecheck
```

All731 public non-Markdown inputs and parent HEAD match before/after. Input
SHA256 `b72779e0ab7ff96983d37ad41dc5ef05dd0833ae22b5574a8cd7c65b15fa3ca8`;
identical manifests `7b4a6dea45b85916f7c0d55689d65f06a3351f0bb9789f23c77c6ebc92c4f49d`.
Ignored domain report `460e74eec4c30df95c2d15c688d8007245c8ca2db1e524434aaab1c5ce1ff6a3`;
smoke `25353f83ed80bc3eda8ff151eddf6ae9539e109be56e54097d0c6c4a7a2e96bd`;
late closure `e8fa4e3b4cc1a2394c690256dc0193f25567974fcef379edad1b9c773487e0f9`.
Node22.20.0/npm10.9.3 unchanged. Root integrates the disjoint frozen test patches;
read-only review finds no production blocker, not independent execution proof.

This is local/unpublished travel pacing, not all human movement, full footing,
grade/current, mat assistance/wear, gear, injury, new knowledge or audio. The
terrain lookup remains O(1) inside the existing at-most-two-cell corridor; no
performance gain is claimed. Native multihop, support, known alternatives and
legal carried failure remain unfinished. No dependency/configuration, schema,
historical directive, artifact/platform/release or whole-directive change.
Earlier cumulative certificates retain their exact checkpoint scope only.

### Resident source-mat support and finite service — 2026-10-09

Local, unpublished follow-up on `56d80fe8c966579683a319bebd1965f32296d2c2`
connects current-v8 dry contract travel to an existing deployed source reed mat.
The shared setup-scaled effect increases resolved displacement beneath the same
cargo and interval ceilings; only an actual strictly helped tile entry charges
the winning source piece. Bodies and aid condition publish/roll back together.
[Architecture](./ARCHITECTURE.md#source-qualified-resident-reed-mat-service)
owns the exact law; broader channels, wet traversal and player-assisted wear
are not supplied by this consumer. Schemas58/carry14/readers stay unchanged.

Twenty new lower-owner cases characterize full/setting support and12,000/6,000
nominal service, source rather than destination contact, zero-benefit clipping,
inactive/reclaimed/removed aids, final use before breakage, wet rejection,
frozen-v7 parity, phase4/9 detached continuation and staged-roster failure.
The valid64×48 address contrast uses controlled geometry and persistent96-column
aid addresses; it is a dimension/conservation foundation, not native legacy
acquisition or player UI evidence.

The appended runtime case uses the existing generated estuary offer127 for
eight parts, real automatic acceptance/pickup and ordinary accepted steps
through native ebb. It discovers an actual qualifying entry at any fine phase,
cold-replays the exact interval prefix, then stages the finite saved starter
through the existing placement kernel. Placement debit/setup remain real, but
this is **foundation-only deployment**, not ordinary player movement/F placement.
Removing just that aid changes displacement. Equal-phase bare/aided stock and
the complete conservation ledger agree while legitimate settlement production
continues. Current-save phase4/9 continuations preserve every compared durable
root and replay no sound. Later real resident publication failure restores
body/aid/all saved roots; cold retry matches the successful step.

Initial new-case diagnostics failed on unavailable high-tide contact, a phase9
sampling restriction, a mismatched frame shape and stale pre-ebb stock totals.
Those failed reports remain failed. Corrections follow actual tidal opportunity,
all-phase service and equal-work comparison; they do not reshape native terrain,
move a body, assign a winner, clear lawful water knowledge or suppress production.

Final selected native case passes1test/13deliberately unselected in70.210s.
The complete affected35-file domain passes814tests,0failed/0pending,263.19s,
including all14 pickup cases and all3 native forward/interrupted/reverse journeys.
Maintained smoke passes6files/105tests in6.08s; the existing late Voice-closure
rollback and F-sounding/reclaim cases pass2tests/96deliberately unselected.
Initial/final typecheck and the45-case documentation-reuse self-test pass.
Commands:

```sh
npx vitest run src/game/runtime.residentPickup.integration.test.ts \
  --testNamePattern='commits real helped entry and finite mat wear, cold restores it, and rolls both back on later publication failure' \
  --maxWorkers=1
npx vitest run \
  src/sim/cargoEnvironment.test.ts src/sim/residentActivity.test.ts \
  src/sim/residentActivity.world.integration.test.ts src/sim/residentActivityCapabilities.test.ts \
  src/sim/residentActivityEventLocus.test.ts src/sim/residentSurfaceKnowledge.test.ts \
  src/sim/residentPickupUse.test.ts src/sim/residentPickupActivity.test.ts \
  src/sim/residentTravelRoute.test.ts src/sim/residentTravelActivity.test.ts \
  src/sim/residentTravelAdvance.test.ts src/sim/systemComposition.integration.test.ts \
  src/game/looseCargo.test.ts src/game/player.test.ts \
  src/game/residentActivityExecution.test.ts src/game/residentTravelEnvironmentExecution.test.ts \
  src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts \
  src/game/saveCompatibilityPolicy.test.ts src/game/humanPerception.activity.test.ts \
  src/game/humanPerception.presentation.test.ts src/game/projection.residentPickup.test.ts \
  src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentActivityPublication.test.ts \
  src/game/runtime.residentRest.integration.test.ts src/game/runtime.residentPickup.integration.test.ts \
  src/game/runtime.residentTravel.integration.test.ts src/game/runtime.residentTravelEnvironmentCompatibility.integration.test.ts \
  src/game/footing.test.ts src/game/footing.release.audit.test.ts src/game/player.gear.integration.test.ts \
  src/game/wayknots.test.ts src/game/wayknots.integration.test.ts src/game/regionalWayknots.test.ts \
  src/render/wayknots.test.ts --maxWorkers=2
npx vitest run src/game/runtime.test.ts \
  --testNamePattern='rolls back introduction facts, save, and vocal audio when later interval closure fails|requires a sounding before binding a flooded non-channel anchor but still permits reclaim' \
  --maxWorkers=1
npm run test:smoke
npm run typecheck
npm run test:documentation-reuse
```

All731 public non-Markdown inputs and parent HEAD match before/after:
`d71517d17470c78d01e6d722a52a8556374aef8fc4004ca8ca7fabac76584b9a`.
Timing above describes correctness runs, not production performance evidence.
No normal visual play, new cumulative certificate, package, public release or
whole-directive closure is claimed. Broader current/alternative/failure and
native multi-leg runtime work remain unfinished; no dependency change occurred.

### Native multi-leg coarse logistics foundation — 2026-10-09

Test-only local follow-up on `4a86b5c5f896e3ff82d7fea9665980d6ea701a26`
extends the existing lower-engine origin-pickup fixture. The generated estuary
offer127 carries eight parts over its actual5→4→3→2→1 itinerary and routes
121/117/112/106. Original acceptance, winner, dry origin approach, arrival,
stock and all five earlier cases are unchanged. Its declared clear weather,
needs and exclusivity controls remain explicit, not uncontrolled normal play.

Ten accepted fine samples precede each source-bound closing admission. This
fixture explicitly supplies no local interaction window and neutral duty rows
for all current humans; fine travel therefore remains stationary while the
existing macro owner spends the remaining cargo-qualified890-unit allowance.
Actual waypoint-owner calls establish all three intermediate joins and the
directed body/heading, rather than reconstructing a path from rounded progress.
Geometry and paid distance bound completion; ETA does not grant arrival.
The same original deadline remains1140. An initial test assumption incorrectly
imported an earlier runtime fixture's deadline and failed before route work;
only that new assertion was corrected. The original failed result remains failed.
This native case does **not** establish an overdue-delivery scenario.

The journey preserves one cargo quantity, completes one actual destination
handoff, retains the destination body and executes one subsequent interval.
Real route reinforcement, cap-aware reciprocal trust and already-present
delivery knowledge are checked. Absent knowledge records are not fabricated.
A same-closing-input local-admission control denies macro advancement without
altering stocks, recipes or projects. Actual transfer/project receipts and the
full conservation ledger account for legitimate concurrent production/service.
Phase4 clones and decoded lower-world saves converge at phase9; one detached
phase9 suffix reaches identical complete serialized world and event roots.
This is **foundation-only coarse admission**, not a native-runtime multi-leg
crossing, physical F/acquisition, hearing, outer58 save/relaunch, normal visual
play, wall-clock performance or general carried-failure proof.

Corrected selected case passes1test/5deliberately unselected in6.175s. The full
affected13-file domain passes492tests,0failed/0pending,9.81s; maintained smoke
passes6files/105tests in5.25s. Typecheck passes. Commands:

```sh
npx vitest run src/sim/residentPickupUse.test.ts \
  --testNamePattern='continues one native four-leg pickup through three exact joins and handoff with equal cloned and saved work' \
  --maxWorkers=1
npx vitest run \
  src/sim/residentPickupUse.test.ts src/sim/residentPickupActivity.test.ts \
  src/sim/residentTravelRoute.test.ts src/sim/residentTravelActivity.test.ts \
  src/sim/residentTravelAdvance.test.ts src/sim/residentActivity.test.ts \
  src/sim/residentActivity.world.integration.test.ts src/sim/residentActivityCapabilities.test.ts \
  src/sim/residentActivityEventLocus.test.ts src/sim/cargoEnvironment.test.ts \
  src/sim/systemComposition.integration.test.ts \
  src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts \
  --maxWorkers=2
npm run test:smoke
npm run typecheck
```

All731 public non-Markdown inputs and parent HEAD match before/after, digest
`320475f5fb40f59471745f9fd1a255c0dbb1726b84f664bbc7c0ffd1d00d16c1`.
No production algorithm, schema, supported reader, dependency or configuration
changed. Timing describes correctness runs only. No new cumulative, platform,
release or whole-directive closure is claimed; native-runtime multi-leg,
broader environment/alternatives and legal carried-failure consumers remain open.

### Shared source footing for unladen pickup — 2026-10-09

Local, unpublished follow-up on `31ae8bff0402532ea3b30d66088c45b10cd99565`
extends the existing source-contact calculation to current-v8 contract-pickup
approach. The same player ground profile and optional finite source mat apply
beneath the unladen105-unit ceiling; cargo is not created until the existing
origin transaction. Loaded travel retains its exact prior arithmetic. Frozen
v6/v7 pickup and unrelated rest/ration/material/inspection pace stay unchanged.
[Architecture](./ARCHITECTURE.md#source-qualified-resident-reed-mat-service)
owns contact, paid path distance, qualified wear and atomic body/aid publication.
Schemas58/carry14, accepted history and deliberately supported readers remain
unchanged; no equipment, inventory, knowledge or new transaction is introduced.

Twelve new lower-owner foundations cover four dry source profiles, full/setting
mat support and12,000/6,000 entry wear, destination-only/no-entry/clipped work,
absent aid parity, actual wet rejection, frozen-v6/v7 pacing, positive service
versus later malformed-roster rejection, and phase4/9 cloned/serialized world
plus detached aid continuation through a once-only real stock transfer. These
source-terrain contrasts and finite kernel deployment are explicitly synthetic
foundations, not ordinary player F placement or native positive pickup-mat proof.

The native estuary courier's actual source and target remain meadow. Its
1000-unit approach pays97 per accepted step, reaches the target on step11 and
debits only at the second closing boundary, tick423. The first real interval
retains970 paid units, cargo0 and unchanged source stock; no body, task, winner,
terrain or arrival is assigned to obtain this result. Existing sensory and
four-leg coarse cases now close this genuine extra interval and derive departure
timing. The runtime phase4/9 cold suffix processes the same20 total approach
steps; later-failure rollback starts from the real arrived-but-not-debited
phase9 prefix. Cancel/expiry and deliberately supported55/56 witnesses keep
their truthful older timing. All native tidal, stock/route absence, source-bound
sound and post-pickup mat checks remain intact and pass.

The complete modified lower file passes18tests in8.15s. The affected35-file
domain passes827tests,0failed/0pending,252.36s, including all14 native pickup,
all3 native journey and all14 rest/service cases. Maintained smoke passes
6files/105tests in4.83s; existing late Voice-closure rollback and F-sounding/
reclaim checks pass2tests/96deliberately unselected in14.70s. Frozen-input
typecheck and45 documentation-reuse self-tests pass. Commands:

```sh
npx vitest run src/sim/residentPickupUse.test.ts --maxWorkers=1
npx vitest run \
  src/sim/cargoEnvironment.test.ts src/sim/residentActivity.test.ts \
  src/sim/residentActivity.world.integration.test.ts src/sim/residentActivityCapabilities.test.ts \
  src/sim/residentActivityEventLocus.test.ts src/sim/residentSurfaceKnowledge.test.ts \
  src/sim/residentPickupUse.test.ts src/sim/residentPickupActivity.test.ts \
  src/sim/residentTravelRoute.test.ts src/sim/residentTravelActivity.test.ts \
  src/sim/residentTravelAdvance.test.ts src/sim/systemComposition.integration.test.ts \
  src/game/looseCargo.test.ts src/game/player.test.ts \
  src/game/residentActivityExecution.test.ts src/game/residentTravelEnvironmentExecution.test.ts \
  src/game/residentActivityPersistence.test.ts src/game/residentActivitySaveBoundary.test.ts \
  src/game/saveCompatibilityPolicy.test.ts src/game/humanPerception.activity.test.ts \
  src/game/humanPerception.presentation.test.ts src/game/projection.residentPickup.test.ts \
  src/game/runtime.residentActivityCircadian.test.ts src/game/runtime.residentActivityPublication.test.ts \
  src/game/runtime.residentRest.integration.test.ts src/game/runtime.residentPickup.integration.test.ts \
  src/game/runtime.residentTravel.integration.test.ts src/game/runtime.residentTravelEnvironmentCompatibility.integration.test.ts \
  src/game/footing.test.ts src/game/footing.release.audit.test.ts src/game/player.gear.integration.test.ts \
  src/game/wayknots.test.ts src/game/wayknots.integration.test.ts src/game/regionalWayknots.test.ts \
  src/render/wayknots.test.ts --maxWorkers=2
npx vitest run src/game/runtime.test.ts \
  --testNamePattern='rolls back introduction facts, save, and vocal audio when later interval closure fails|requires a sounding before binding a flooded non-channel anchor but still permits reclaim' \
  --maxWorkers=1
npm run test:smoke
npm run typecheck
npm run test:documentation-reuse
```

All731 public non-Markdown inputs and parent HEAD match before/after, digest
`b10d3d2d34d0e4251cf9e841acdce200df94733b5a5d1e9d3ee584401e943499`.
Timing describes correctness runs, not production performance. Queries remain
bounded by the existing six aids and local corridor; no optimization is claimed.
No new cumulative certificate, normal visual/platform build, public release or
whole-directive closure is inferred. Broader crossing/current/alternatives,
legal carried failure and normal acquisition/placement proof remain open.
Dependency and configuration changes: none. Historical directives are unchanged.

### Working People departure fixture continuation — 2026-10-09

The complete regression at `b497f055cadc016bb58f6f4197ed8786bcdb445c`
failed15tests in two unchanged Working People/Voice files;5178tests passed
across the remaining409files. Two selected reproductions confirmed that the
fixtures still expected pickup after the earlier ten-step allowance. This
failure remains recorded, not reclassified as a cumulative pass.

The test-only correction uses actual accepted steps and closing transactions.
The native meadow fixture first proves970units of unfinished approach, no
cargo or departure, conserved stock/ledger and the retained body. A real second
interval reaches the source and permits pickup. Runtime seeds are checked for
dry native support through that closing tick. No body, task, arrival or voice
event is injected; production, schemas and supported readers are unchanged.
Existing anonymous reception, inspector equivalence, expired-receipt handling,
no-replay, sensory/cooldown/sample forgery and phase4/9 cold assertions remain
intact. The passing storm-hold fixture is byte-identical.

Both complete files pass29tests in110.30s; maintained smoke passes105tests
in4.26s, and typecheck passes. Commands:

```sh
npx vitest run src/game/workingPeopleExpression.activity.test.ts \
  src/game/runtime.workingPeople.integration.test.ts --maxWorkers=1
npm run test:smoke
npm run typecheck
```

All731 public non-Markdown inputs match before/after, digest
`1056485ba96e96f339fc03fce51383ae1405798bfef19bb5b330755a778101a8`.
This proves the affected Voice boundary, not a new complete regression pass,
visual/platform/performance result, release or major-directive closure.

Subsequent complete recertification at
`58c1a157f4c33c3cdd167775f234a5f911d346bc` passes all411files/5193tests,
0failed/0pending, in2352.58s using `npm run test:ci` (including28context,
39player-facing and45documentation-reuse self-tests). All731 non-Markdown
inputs match before/after with the same digest above; the tracked tree stayed
clean. This certifies that exact checkpoint, not later executable changes,
normal visual/platform play, production performance, publication or closure.
The earlier `b497f055` full-suite failure remains historical evidence.

### Original-exclusivity native pickup and weather hold — 2026-10-09

A test-only witness at parent `adf1b800` uses a fresh runtime `runtime baseline
estuary` / gale / wander world and its original parts8 offer127: exclusivity720,
deadline1140, generated stock, terrain, weather and initial needs remain exact.
Ordinary westward renderer input, stamina-aware release and actual RAF steps
move the player from37.5/55.5 to−51.037/55.5 in1520 accepted steps. At tick572
the real120×120 frame begins−119/−5 and excludes the complete native four-leg
itinerary. This is physical-window exclusion, not fog-of-war or an injected
origin. Controls are released before the719 phase9 save.

The first bounded coarse-opportunity experiment **failed**: native acceptance
occurred720, pickup721, but no macro work occurred through724. The actual storm
intensity955160 caused a weather hold. That diagnostic remains failed evidence;
neither weather nor the deadline was rewritten to obtain progress.

The retained, scope-correct case characterizes this actual interruption. Native
selection chooses resident89, already at the37500/55500 origin; it does not prove
a new approach walk. One stock transfer moves eight conserved units into cargo.
The source's134→110 change accounts for all24units picked up by contemporaneous
native couriers, not an invented sole eight-unit debit. The test guards against
due parts recipes, hourly civic work and incoming parts fulfillment on that
transfer tick, checks each accepted-to-transit quantity and departure once,
and retains whole-world conservation validation.

The real weather hold begins722, not the departure tick721. Through724 the
same body/heading, first-edge cursor, active commitment and cargo remain;
there is one sheltered transition, three delay ticks and no fulfillment or
macro progress. Detached current-schema load preserves all saved authoritative
roots and event history for719 phase9→720 phase0 and the exact41 accepted-step
continuation to724 phase0. Only session recap and outer integrity are excluded
from equality, as in the existing native travel harness.

The selected retained case passes in97.62s. Its observer is read-only and
bounded to304 primary world advances; initial roots, tasks, body, winner,
stock and knowledge are never assigned to produce success. The original three
travel cases and all shared helpers remain byte-identical. This is headless
ordinary-control pickup/hold evidence, not four-leg completion, weather
resumption, physical shelter arrival, normal visual play, production performance,
public release or whole-directive closure. Production, schemas, readers,
dependencies and configuration are unchanged.

All four complete native travel cases pass in266.84s, including the unchanged
food, interruption/reentry and reverse-medicine journeys. Maintained smoke
passes6files/105tests in4.16s; typecheck and45documentation-reuse self-tests
pass. Commands:

```sh
npx vitest run src/game/runtime.residentTravel.integration.test.ts --maxWorkers=1
npm run test:smoke
npm run typecheck
npm run test:documentation-reuse
```

All731 public non-Markdown inputs match before/after at `adf1b800`, digest
`f41dffa9b156e947358735c59089950c8b46a676e90a6a9cc35d571fc230410f`.
The earlier complete `58c1a157` certificate does not certify this added test.
No complete suite, artifact build, platform smoke or release run is claimed
for this ordinary test-only slice. Historical directives remain unchanged.

### Current-body ABOUT and pickup motion parity — 2026-10-09

At local parent `ee1fe88d`, the shared scene projection correctly withheld
travel/carry copy for a stationary accepted courier, but ABOUT still said
`Carrying a Promise` from `activeContractId` alone. The existing native-offer
lower-adapter fixture establishes acceptance with zero cargo, actual approach
displacement and a later physically blocked step. New ABOUT assertions reproduce
the mismatch in both stationary cases before the correction:2failed,
3deliberately unselected. This is controlled projection evidence, not ordinary
runtime play, visual QA or a new custody capability.

`uiProjection.ts` now preserves sleep, lawful attention, rest, committed service,
weather-hold and current-motion priorities, then describes an adopted stationary
body as `Waiting nearby`. Only genuinely body-absent legacy presentation retains
coarse commitment/membership copy, matching the scene projection. Positive cargo
would establish custody, not knowledge of the person's private Promise purpose;
no contract lookup, task disclosure or new player knowledge is added. The same
five existing pickup cases now check ABOUT: accepted zero-cargo waiting, actual
movement, real stopped movement, absent legacy body and unseen source. All
original fixtures/assertions remain, including exact world-byte nonmutation.

Affected projection/ABOUT/attention/Voice tests pass5files/84tests in7.20s;
existing ration/material integration passes2files/20tests in19.25s, preserving
actual-use copy and stock/current-save proofs. Maintained smoke passes6files/
105tests in4.18s; typecheck passes. The projection run also included two unmatched
old filename patterns; they executed no tests and are not additional coverage.
The actual commands, excluding reporter/output arguments, were:

```sh
npx vitest run src/game/projection.residentPickup.test.ts src/game/npcAbout.audit.test.ts src/game/humanPerception.presentation.test.ts src/game/projection.situatedExpression.test.ts src/game/projection.residentRation.test.ts src/game/projection.residentMaterial.test.ts src/game/uiProjection.test.ts --maxWorkers=2
npx vitest run src/game/residentRationActivity.integration.test.ts src/game/residentMaterialActivity.integration.test.ts --maxWorkers=2
npm run test:smoke
npm run typecheck
```

All731 public non-Markdown inputs match before/after validation at the parent,
digest `e162e57c345e86d4f8b70082b6d93f4e4f125fe004ad3d3832033c585736d86f`.
Only shared ABOUT copy and its existing projection tests change executable
inputs. Simulation, timing, custody, schemas, accepted formats, dependencies and
renderers remain unchanged. Earlier cumulative evidence belongs to its original
inputs, not this candidate. No new build, platform, normal-visual, performance,
release or whole-integration closure is claimed; historical directives remain
unchanged.

### Untouched-world first-hour material work — 2026-10-09

A test-only runtime witness at local parent `9c0572c13786f2ad55362d3050ef8b6d08138a97`
starts `runtime baseline estuary` through ordinary `new-world`. The command's
legacy `journey` field does not change the current runtime's forced hard/gale,
wild-pressure perpetual preset. No needs, weather, stock, recipe, offer, body,
task, route, worker or decision result is assigned. The original fourteen cases
and their helpers remain unchanged.

599 accepted fixed steps reach tick479/phase9 without civic project credit.
The next real step closes480 and at least one previously arrived resident uses
the actual project's finite material at its dry authenticated site. A read-only
observer captures that single production `stepWorld` call; it neither runs a
second simulator nor alters ordering or RNG. Every site's project delta is0/1
and matches its actual used worker. Stock and ledger accounting includes native
due recipes, then the one-unit contribution: scheduled production is not
disabled or misreported as physical labor. All generated resident identities
remain unchanged; no Promise fulfillment or transit cargo is invented.

Detached479/phase9 load plus the same one accepted step matches every saved
authoritative root except the existing session recap and outer integrity
exclusions. A consumed480 reload neither replays audio nor duplicates credit;
the next ordinary interval preserves stock, projects and ledger. This is one
stationary seed's mocked-clock first hourly material pulse, not native ration,
all-service/fairness acceptance, rendered play, performance or directive closure.

Focused1case passes26.16s; full affected runtime/material integration passes
2files/30tests in107.68s, with the native case23.89s. Lower material tests pass
19cases; maintained smoke passes6files/105tests in4.11s; typecheck and
45documentation-reuse self-tests pass. Actual commands, excluding reporters:

```sh
npx vitest run src/game/runtime.residentRest.integration.test.ts -t 'uses native first-hour civic material' --maxWorkers=1
npx vitest run src/game/runtime.residentRest.integration.test.ts src/game/residentMaterialActivity.integration.test.ts src/sim/residentMaterialUse.test.ts --maxWorkers=2
npx vitest run src/sim/residentMaterialActivity.test.ts --maxWorkers=1
npm run test:smoke
npm run typecheck
npm run test:documentation-reuse
```

The domain command's unmatched `residentMaterialUse.test.ts` pattern supplies
no coverage; the following real lower test owner supplies the19cases. All731
public non-Markdown inputs match before/after, digest
`3d58832f712ca5546fa230103eadd0a9d3bba98831551f1ea3a825a243e49ac6`.
Production, timing, schemas, supported formats, dependencies and configuration
are unchanged. Prior cumulative evidence certifies its own inputs only; no new
cumulative, artifact/platform, release or historical-directive change is claimed.

### Informed water at the local-to-macro boundary — 2026-10-09

Two additive adapter-foundation cases at parent `8e0dec9` contrast a real local
wet-support obstruction with a kernel-admitted qualitative water hold. Both
close stationary at421. Due phase-zero preparation retries only the uninformed
obstruction; missing fresh dry sight retains `observed-water`. A controlled,
valid nonintersecting interaction window then accepts ten stationary samples
and the actual source-bound closing receipt at422. The uninformed network-only
continuation spends its1040-unit cargo-qualified allowance; the informed case
retains exact pose, cursor and cargo with zero macro work. Directed cursor
distance, not straight displacement across a corner, measures the paid work.

The same inner-world serialized and cloned boundaries produce exact terminal
bytes. Stocks, ledger, cohort, contract and departure/fulfillment events remain
unchanged; only ordinary perception decay occurs, with no refreshed sight or
new hazard knowledge. Original fixtures/cases are unchanged. This verifies the
existing documented macro abstraction, not native player/window movement,
general crossing, known alternatives, outer-session relaunch or visual play.

Focused2cases pass; affected5files/194tests pass6.09s; maintained smoke
6files/105tests passes5.00s; typecheck passes. Relevant commands:

```sh
npx vitest run src/game/residentTravelEnvironmentExecution.test.ts -t 'keeps informed=' --maxWorkers=1
npx vitest run src/game/residentTravelEnvironmentExecution.test.ts src/game/residentEnvironmentExecution.test.ts src/sim/residentTravelAdvance.test.ts src/sim/residentTravelActivity.test.ts src/sim/residentSurfaceKnowledge.test.ts --maxWorkers=2
npm run test:smoke
npm run typecheck
```

All731 public non-Markdown inputs match before/after, digest
`3381b084a72a61eac93cd6dbf4845824274649be0325db413baf1695d69381a8`.
Production, canonical policy, schemas, supported formats, dependencies and
configuration are unchanged. No new cumulative/platform/performance/release
or whole-directive closure is inferred; historical directives remain untouched.

### Familiar origin departure — 2026-10-09

At parent `9f03115`, a local/unpublished current-v8 consumer joins retained own
fulfilled courier history, bounded lawful entrance sight, shared physical support
and the existing conserved pickup. Architecture's **Familiar routes at origin
pickup** owns the policy. A past itinerary conveys topology, not current remote
safety; no departed path, receipt or captured Voice event is rewritten.

The positive adapter fixture arranges past work, an arrived pickup body, an active
chord, diagonal gaze and contrasting surfaces over actual estuary identities and
finite stock. Production perception records wet/default and dry/familiar support;
actual `stepWorld` chooses the remembered alternative, debits one part once and
publishes the matching departure/cursor and eligible Working People source.
Inner-world serialize/load and detached clone give exact terminal bytes; consumed
load adds no debit. Withholding history, gaze or dry support removes the choice;
frozen v7 keeps the old departure. This is source/consumer foundation evidence,
not native-earned familiarity, outer58 relaunch, rendered play or complete water
acceptance. Native alternate topology requires earned route reinforcement.

Independent review tightened chronology and authenticated pickup fields without
changing supported readers. Two initial new-fixture failures are retained locally:
the first arranged task had the wrong activity version; the later hostile source
incorrectly used a trusted factory that correctly rejected it first. Only new
fixture construction was corrected; no existing assertion or validator weakened.
Final affected14files/359tests and maintained6file/105test smoke pass. Existing
runtime integration passes6files/57tests in154.82s; the mandatory late closure
rollback case passes, with97 other runtime cases deliberately unselected. Commands
below omit reporter/output arguments, retained in the ignored validation record:

```sh
npx vitest run src/sim/residentKnownRoutes.test.ts src/game/residentKnownRoutes.integration.test.ts src/sim/residentPickupUse.test.ts src/game/humanPerception.test.ts src/game/humanPerception.restSurface.test.ts src/game/humanPerception.travelSurface.test.ts src/sim/residentTravelRoute.test.ts src/sim/residentTravelAdvance.test.ts src/game/residentTravelEnvironmentExecution.test.ts src/game/workingPeopleExpression.activity.test.ts src/game/residentActivitySaveBoundary.test.ts src/sim/residentActivity.world.integration.test.ts src/sim/systemComposition.integration.test.ts src/sim/simulation.test.ts --maxWorkers=2
npx vitest run src/game/runtime.residentPickup.integration.test.ts src/game/runtime.residentTravelEnvironmentCompatibility.integration.test.ts src/game/runtime.workingPeople.integration.test.ts src/game/runtime.residentSoundPhases.test.ts src/game/residentIntroductionExpression.activity.test.ts src/game/residentWeatherHoldExpression.activity.test.ts --maxWorkers=2
npx vitest run src/game/runtime.test.ts -t 'rolls back introduction facts, save, and vocal audio when later interval closure fails' --maxWorkers=1
npm run test:smoke
npm run typecheck
```

All734 public non-Markdown inputs match final-domain/smoke before/after, digest
`9e99a9de3c305f18feb9d8f5b17257905626011221e6ec9f79cffcfae678e380`.
The supplemental runtime/rollback run differs only in the two new known-route
testfiles: production, existing tests, configuration and toolchain match.
Typecheck passes on the final inputs. No schema/support-set, dependency, timing,
configuration, historical-directive or release change; no new cumulative,
production performance, platform artifact or whole-directive certificate.

### Familiar-origin cumulative checkpoint — 2026-10-09

Clean committed `92e14ecc5b09a1da417fd4cc4d920b179fc60fa9` subsequently passes
`npm run test:ci`: 413 files / 5,238 tests, zero failed or pending, 2,287.64s.
The context-index28, player-facing39 and documentation-reuse45 selftests also
pass. All734 public non-Markdown inputs, including tests/configuration/assets,
and HEAD match before/after; the input digest is the familiar-origin digest
above. No public source or documentation edits occurred while the run certified
that tree. The retained JSON report SHA256 is
`cc736b80d1d265e2942ed61b4e6c12b1ba0a2c613b3982d054f26293ddcc9ccc`.
Default and JSON reporters were used; the ignored report is
`artifacts/validation/world0-cumulative-diagnosis/familiar-origin-cumulative.json`.

The same source passes `npm run build:web` and `npm run smoke:web` against the
actual `/tideweft/` static artifact: five files,4,871,417 served bytes. The
existing large-chunk warning remains. This is cumulative correctness and static
artifact evidence, not interactive browser/desktop play, hardware performance,
deferred production profiling/soak, publication or whole-integration closure.
No dependency, schema, support-set, gameplay-policy or historical-directive change
is inferred. Later changed inputs need their own applicable validation.

### Untouched-world second-hour ration use — 2026-10-09

At parent `92e14ec`, one additive runtime test keeps the generated estuary's
needs, weather, recipes, stock, contracts, terrain, bodies and task selection
untouched. As in the first-hour material witness, the current new-world owner
forces hard/wild despite the legacy `journey` command field. There is no seed
search, assigned user or injected successful action.

1,199 accepted ordinary fixed steps reach tick539/phase9; the actual closing
step reaches540. At least one resident uses rations after prior authenticated
arrival. A read-only observer calls the original lower step once and captures
its actual input/output, independently checking production-before-needs, the
complete stable-order cohort's shared groups, stock/ledger and final-clamped
need relief. Civic material use shares that same conserved closing transaction.
All42 identities and zero-cargo contracts remain intact. Cold outer58 loading
of the539 prefix produces exactly the same saved roots after one step, excluding
only the existing session recap/integrity comparison fields. Consumed540 reload
replays no audio or benefit, and541 adds no duplicate service debit or relief.

Focused1case passes46.36s; the complete affected7-file/94-test set passes148.31s;
maintained6-file/105-test smoke passes5.25s. Typecheck and45 documentation-reuse
selftests pass. All734 public non-Markdown inputs match before/after, digest
`4945878a33e946f9ef919abdc90f26d4ea766804a85ee7988897596c26568eee`.

```sh
npx vitest run src/game/runtime.residentRest.integration.test.ts -t 'uses native second-hour rations without authored pressure' --maxWorkers=1
npx vitest run src/game/runtime.residentRest.integration.test.ts src/game/residentRationActivity.integration.test.ts src/sim/residentRationActivity.test.ts src/sim/residentRationUse.test.ts src/sim/residentRationPulse.test.ts src/sim/residentRations.test.ts src/sim/residentRations.integration.test.ts --maxWorkers=2
npm run test:smoke
npm run typecheck
npm run test:documentation-reuse
```

This is one native runtime meal pulse with mocked RAF/audio, not general
fairness/liveness, rendered play, performance, platform, release or whole-system
closure. Production, schemas, supported formats and dependencies are unchanged;
the prior full cumulative certificate belongs to its own exact inputs.

### Released pickup work continues without reset — 2026-10-09

At parent `effc6dc`, the existing controlled pre-pickup cancellation/expiry
cases now continue their actual tick422 released world through routine
preparation, ten fine steps, a fresh one-shot closing admission and423
preparation. Original, serialized/deserialized and plain-cloned branches have
identical complete inner-world bytes. The partial approach pose, identity,
membership, terminal contract and zero cargo remain intact; no stale pickup,
departure, fulfillment, second terminal event or extra stock debit appears.
The fixture's urgent belonging legitimately yields awake ordinary activity,
not an assigned successful service. Production code required no repair.

Focused2cases pass; affected4files/62tests pass142.27s, maintained smoke105
passes4.72s and typecheck passes. All734 public non-Markdown inputs match,
digest `b7ef2a32715ef9d3a701291771f0fd880779ce256bfdaea82c9cedbc39027893`.

```sh
npx vitest run src/game/runtime.residentPickup.integration.test.ts -t 'work at its real partial approach pose without a source snap' --maxWorkers=1
npx vitest run src/game/runtime.residentPickup.integration.test.ts src/game/residentActivityExecution.test.ts src/sim/residentActivity.world.integration.test.ts src/sim/residentPickupUse.test.ts --maxWorkers=2
npm run test:smoke
npm run typecheck
```

This is lower-owner foundation evidence with controlled obstruction, not a
public cancellation control, in-transit cargo failure, outer58 relaunch,
productive subsequent service, rendered play or long-run liveness. The old
outer fixture belongs to421 and is deliberately not resealed around a422 world
with mismatched carry/ecology/expression roots. Schemas, supported readers,
dependencies and gameplay policy remain unchanged; no broader closure follows.

### Rising-water observation order and cold continuation — 2026-10-09

At parent `88071687`, one additive travel-environment foundation reaches
tick1079 by running the actual lower engine for659 ticks. It retains all14
existing carried journeys and four fulfilled contracts, selects only a free
resident/unassigned offer, and transfers conserved parts14. The fixture's
terrain and initial transit remain arranged; it is not a native ford.

Ten accepted dry-bank steps reach offset430. The actual tide peaks at1080,
blocking further movement without changing position/custody. Pre-world wet
sight admitted at1081 retains the hold even though the physical tide has
already fallen. Only newly admitted dry sight at1082 permits actual progress
to473. Original, inner-world deserialize and plain-clone branches split at
phase9 agree in complete bytes, including ordinary hourly production, needs,
prior coarse arrivals and events. No task, belief or successful result is
assigned after setup, and no old fulfilled contract is reopened.

Focused1case passes1.96s; affected6files/168tests pass7.14s, maintained smoke105
passes4.72s and typecheck passes. All734 public non-Markdown inputs match,
digest `408ebbb02739826ff108b66f3298ea6e8630ffde63aa23ed02af0ac45fe06b78`.

```sh
npx vitest run src/game/residentTravelEnvironmentExecution.test.ts -t 'stops real dry-bank progress as water rises and resumes only after freshly admitted falling-water sight' --maxWorkers=1
npx vitest run src/game/residentTravelEnvironmentExecution.test.ts src/game/humanPerception.travelSurface.test.ts src/game/humanPerception.restSurface.test.ts src/sim/residentSurfaceKnowledge.test.ts src/sim/residentTravelAdvance.test.ts src/sim/residentTravelRoute.test.ts --maxWorkers=2
npm run test:smoke
npm run typecheck
```

This is controlled producer/execution evidence, not autonomous crossing,
ordinary controls, outer58 relaunch, rendered play, general water/current
behavior, performance or directive closure. Production, schemas, supported
readers, dependencies and policy remain unchanged. The reusable sight/response
contract was already canonical; this acceptance addition does not redefine it.

### Resident dry contact joins shared hearing — 2026-10-09

At parent `67e0cf507cbea1423e2b9819726a7b32a1c71a5f`, the local/unpublished
resident producer now derives one sparse contact from each current-v8 body's
first actual dry tile entry in the accepted fine-step prefix. The shared
terrain classification is extracted without changing existing dog semantics.
Fresh player audio uses surface propagation and the complete transaction;
closing human/dog hearing uses the actual occurrence phase before the world
step collapses that prefix. Routine contact has no caption or interruption.
No animation, apparent equipment, uncommitted intent or invented work is a
producer. Writer58/carry14, supported readers and dependencies are unchanged.

Two characterization counterexamples required corrections before acceptance:
later lower-ID contact must not displace an already accepted earlier cause,
and spatial rebasing must not replace an off-frame first entry with a later
one. Admission now orders occurrence phase then stable source, caps eight
before spatial filtering, and leaves filtered holes empty. This conservative
representation can omit later local sound; it does not promise every footfall.
The existing dog/aggregate and expressive priorities retain their own bounds.

The additive runtime case selects genuine native one-tile dry geometry but
uses controlled rest pressure. Initial broader fixture attempts exposed real
competition for the earliest-eight budget, not a legacy-format failure.
The final isolated mechanism witness suppresses unrelated material approaches
through the existing need priority rather than assigning bodies, tasks,
sound events or listener outcomes. It proves real approach, positive once-only
audio, anonymous surface hearing, routine-text absence, phase4/9 outer58 cold
continuation, consumed nonreplay, stationary silence and late-closing rollback.
All prior fixture branches and assertions remain intact. This is controlled
native-geometry runtime evidence, not untouched crowd behavior or visual play.

Frozen validation passes13 files/258 tests in11.74s for the affected acoustic,
activity and persistence owners; the runtime domain passes7 files/105 tests
in631.51s, and the full runtime owner passes98 tests in496.47s. The existing
late-closure rollback case separately passes. Maintained smoke passes6 files/
105 tests in5.88s; typecheck and45 documentation-reuse self-tests pass.

```sh
npx vitest run src/game/residentContactAcoustics.test.ts src/game/worldAcoustics.test.ts src/game/physicalAcousticPerception.test.ts src/game/dogPhysicalAcousticPerception.test.ts src/game/animalContactAcousticCarry.test.ts src/game/humanPerception.activity.test.ts src/game/humanPerception.restSurface.test.ts src/game/humanPerception.travelSurface.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/residentActivityPersistence.test.ts src/game/residentActivityExecution.test.ts src/sim/residentActivity.test.ts src/sim/residentActivity.world.integration.test.ts --maxWorkers=2
npx vitest run src/game/runtime.residentRest.integration.test.ts src/game/runtime.residentTravel.integration.test.ts src/game/runtime.residentTravelEnvironmentCompatibility.integration.test.ts src/game/runtime.workingPeople.integration.test.ts src/game/runtime.residentSoundPhases.test.ts src/game/runtime.residentActivityPublication.test.ts src/game/runtime.perception.integration.test.ts --maxWorkers=2
npx vitest run src/game/runtime.test.ts --maxWorkers=1
npx vitest run src/game/runtime.test.ts -t 'rolls back introduction facts, save, and vocal audio when later interval closure fails' --maxWorkers=1
npm run test:smoke
npm run typecheck
npm run test:documentation-reuse
npm run build:web
npm run smoke:web
```

All736 public non-Markdown inputs match before/after, digest
`f83a224c712fccee1254a8241866c2a668606f8a7bda085a185f896c91857993`,
on Node22.20.0. Production web compilation passes638 modules; local static
subpath smoke passes5 artifact files/4,875,083 served bytes. The existing
large-chunk warning remains. These are not interactive browser, packaged
desktop, hardware-audio, mobile, performance, long-session, release or full
cumulative certificates. Older protocols and coarse transport intentionally
produce no new contact until their established real phase-zero adoption.
Ordinary crowd liveness, broader physical contacts and water/current behavior
remain unfinished. No directive or publication boundary advances here.

### Selected-rest shallow-source egress — 2026-10-09

At parent `2da02741d00923b19c3d50059431a07f4f5bbbe0`, the native seed
`resident activity executable rest approach` places resident75 at tile89,27:
non-deep meadow, elevation502458, tide505000, depth2542. Its authenticated
refuge90,26 and both diagonal support cells are dry. Controlled urgent-rest
pressure selects the task through the actual routine; terrain, tide, clock,
identity, body and arrival are not authored. Before the execution correction,
the ordinary runtime case fails because the occupied wet source has no route.
Natural drying occurs later; it is not evidence of successful earlier egress.

The smallest production change opens only that occupied non-deep cell for
current-v8 selected, unladen rest at depth≤35,000. The shared ordinary-foot
constant replaces three identical existing literals without changing player
or flow arithmetic. Dry destination and all other wet-cell exclusions remain;
older protocols, other tasks, loaded travel, movement quotas and knowledge
admission retain their owners. No schema, reader, equipment, injury, vessel,
current-resistance capability or wet-contact sound is added.

Fifteen pure cases cover native motion before any tide change, the exact35k
boundary, deep-source/wet-target/wet-intermediate counterfactuals, frozen1–7
waiting, inner-world clone/load and actual closing arrival. The revised native
runtime case covers accepted motion while still wet, no phantom recovery,
dry arrival and real recovery, outer58 phase4/9 cold equality, and a later
interval failure after recovery actually occurred. Complete rollback and cold
retry preserve every authoritative save root; consumed load emits no audio.
These are controlled-need runtime and arranged capability foundations, not
untouched crowd behavior or rendered play.

Broader validation exposed an independently stale supported55 assertion.
An isolated clean checkout of the exact parent reproduces the same failure
before the shallow-source change. The old test compared remaining v5 work
with uninterrupted v8, although v5 intentionally cannot acquire the newly
implemented contact hearing. Its correction compares identical supported55
initial records and accepted work, adds an actual phase9 relaunch, and keeps
complete authoritative-root equality without stripping perception. A separate
positive-v8/negative-v5 hearing contrast preserves the capability distinction.
No supported reader or old interval semantics are changed to make it pass.

Focused native egress and supported55 checks pass. The affected pure domain
passes11 files/235 tests in12.61s. Final broader runtime validation passes
3 files/33 tests in198.57s; maintained smoke passes6 files/105 tests in4.94s,
and typecheck/documentation-reuse45 pass. All737 final public non-Markdown
inputs match before/after, digest
`1bca34256309a994f73d3ccdd571eabec1f3bff316dffc5731fe2ef50dacf284`,
on Node22.20.0. Only the supported55 runtime test changed after the pure-domain
run; its exact production and affected-test bytes remain unchanged, and the
final complete runtime selection covers the corrected assertion. An independent
bounded static review found no blocking ownership or compatibility defect.

```sh
npx vitest run src/game/residentRestShallowEgress.test.ts src/game/residentActivityExecution.test.ts src/game/residentActivitySaveBoundary.test.ts src/game/residentActivityPersistence.test.ts src/sim/residentActivity.world.integration.test.ts src/game/humanPerception.restSurface.test.ts src/game/footing.test.ts src/game/waterFlow.test.ts src/game/player.test.ts src/game/residentTravelEnvironmentExecution.test.ts src/game/residentContactAcoustics.test.ts --maxWorkers=2
npx vitest run src/game/runtime.residentRest.integration.test.ts src/game/runtime.residentTravelEnvironmentCompatibility.integration.test.ts src/game/runtime.residentPickup.integration.test.ts --maxWorkers=2
npm run test:smoke
npm run typecheck
npm run test:documentation-reuse
```

Shared flow is zero within this foot band. These results do not establish
meaningful current response, general wading/crossing, cat evacuation, broad
task liveness, normal controls/visual proof, production performance, a new
platform build, cumulative certification or release. Remaining obligations
retain their existing owners; no directive or publication boundary advances.

### Unladen service source-egress extension — 2026-10-09

At parent `f00b2d5094ce273f818f1551bfc5270699a936cf`, current-v8
ration/material/inspection approaches still rejected the occupied native
foot-shallow source already permitted for selected rest. The additive runtime
ration case failed after actual food-pressure selection (waiting at phase4),
before any authored tide, body, task or arrival. Its new adapter selection
tests independently reproduced six failures/12 passes: actual ration, civic
and informed inspection approaches,35k boundary and phase4/9 ration motion.
Inspection prerequisites passed: a declared foundation store/keeper binding
obtained real shared sight and lower-world admission before selecting the task
at421 while its native source was still wet. No evidence/result was assigned.

The correction extends the same explicit current-v8, no-active-commitment
whitelist to those three existing services. It opens only the occupied
non-deep source within35k; all other wet cells and the destination stay blocked.
Pickup and loaded travel remain excluded, including pickup's currently dry
source-aid query. No schema, supported reader, new capability, cargo copy,
stock authority, timing, decision frequency, audio or dependency changes.

The new18 adapter cases and existing15 rest cases pass. Civic/inspection
shallow-source cases prove approach, no premature debit/credit/closure and
wet-target blocking; controlled disposition or constructed keeper/store
binding is FOUNDATION, not untouched native autonomy or consummated
shallow-origin work. Frozen service first-version/v7 contrasts remain dry-only.
The native runtime ration case passes actual wet-source motion, dry arrival,
unchanged hourly group debit/relief, phase4/9 outer58 cold egress, hourly cold
use, observed attempted-use late rollback, cold retry and consumed silence.
The phase4/9 comparison ends at421; the later arrived/use branch and separate
hourly cold witness are distinct proofs, not a single uninterrupted cold run.

Local validation on the frozen candidate:

- New service plus existing shallow-rest tests:2 files/33 PASS7.37s.
- Focused added native-ration runtime case:1 PASS55.87s,17 unselected.
- Affected domain:14 files/295 PASS56.88s. Selection: service/rest shallow
  egress, activity execution/save-boundary/persistence, ration/material
  integration, keeper inspection, lower activity/ration-use/ration/material,
  travel-environment execution and resident-contact acoustics.
- Broader runtime:rest, pickup and keeper-inspection integration,3 files/52
  PASS511.27s. It includes the existing native material/ration, legacy protocol,
  real helped pickup, current-save and failed-transaction witnesses.
- Maintained `npm run test:smoke`:6 files/105 PASS11.73s;
  `npm run typecheck` and documentation-reuse45 PASS.

The affected/domain runs use `npx vitest run <selection> --maxWorkers=2`
with default/JSON reporters; focused runtime uses the exact added case name.
Local JSON reports retain exact selections and results. All738 public
non-Markdown validation inputs match before/after, digest
`18c4ccf6a1f7c4216d66127a8d2d0cc2d70708c3cd7a5fb516f29eee9926788c`.
Node22.20.0 uses the existing install. Parent cumulative and isolated runtime
validation overlap in wall time; durations are correctness evidence, not a
production performance comparison. No additional cumulative run is claimed.

This is local/unpublished source and correctness evidence, not a normal
rendered crowd, cat-water fix, meaningful current-force response, new platform
artifact, measured performance gain, cumulative certificate or release. Main's
separate frozen parent regression does not certify this executable delta.
Remaining work retains its existing owners; no directive transition.

### Shallow-origin civic approach reaches the existing contribution — 2026-10-09

At isolated parent `a2c176ceaad41648e09a3c97e32397c760849b40`, the
shallow-service adapter already proves initial material motion. One additive
runtime case now follows that real approach to its existing hourly consumer.
It uses `firstNativeFixture("wet-source")` and asserts the native work
intention rather than assigning it. Generated terrain, tide, actor/body source,
finite stock, project and destination remain intact. The inherited fixture
controls weather and offer timing; this case also controls competing need
pressure and recipe schedules. No selected task, pose, arrival, contribution,
receipt or success is authored. This is controlled native geometry, not an
untouched population-autonomy witness.

Actual phase4/9 motion occurs before the source dries and stays within the
occupied wet cell or dry ground; no project/inventory/ledger result occurs
during approach. Real dry arrival precedes the hourly contribution.600 accepted
steps reach tick480: stock−1, consumed ledger+1, project progress+1 and the
existing used marker. Cold4/9 branches compare every authoritative root at
421; an independent479-phase9 cold branch reaches the exact480 result. Actual
use followed by rejected expression-bank closure rolls all roots back;
cold retry matches successful work. Consumed reload is silent and the next
ten accepted steps add neither debit nor credit. This is not one uninterrupted
cold branch through the entire hour.

Initial focused case passes1/18 unselected54.79s. Only its fixture-provenance
comment is clarified afterward; final validation retains the same assertions.
Affected material/source-egress selection passes4 files/67 tests47.85s:
`residentServiceShallowEgress`, `residentRestShallowEgress`, material
activity integration and lower material-activity tests, two workers. Final
runtime selection passes3 cases/16 unselected160.56s: the new shallow-origin
case, existing controlled dry-material case and untouched first-hour civic
case. Exact command:

```sh
npx vitest run src/game/runtime.residentRest.integration.test.ts \
  -t 'completes native shallow-origin civic approach|uses real civic material after ordinary approach|uses native first-hour civic material without authored pressure' \
  --maxWorkers=1 --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-service-shallow/shallow-civic-runtime-domain.json
```

Default/JSON reporters retain exact local results. Maintained smoke passes
6 files/105 tests10.27s; typecheck and documentation-reuse45 pass. All738 public
non-Markdown final inputs match before/after, digest
`7881669b2c9dea02b5a693292f76d1d1d0bd788a6d70c974c0627059f9f2c774`.
Parent cumulative overlaps in wall time; these are correctness timings, not
production performance or a new full cumulative certificate.

No production owner, algorithm, schema, supported reader, task protocol,
inventory, control, dependency or release changes. Current native shallow
keeper autonomy, cat evacuation, current-force response, normal rendered play,
performance and major closure remain unproved. Main's separate frozen parent
cumulative result does not certify this additive test/canonical delta.

### Stationary save characterization after contact and service motion — 2026-10-09

Exact `f00b2d5094ce273f818f1551bfc5270699a936cf` cumulative regression
completed415 files/5,282 tests:414 files/5,281 PASS, one FAIL,0 pending,
2,927.01s. All737 public non-Markdown input fingerprints and HEAD matched
before/after. Its sole failure was the estuary complete-save golden in
`runtime.performanceTelemetry.test.ts`; complete telemetry-on/off equality
and the current body/store assertions passed first. This is a failed
cumulative checkpoint, not a partial certificate represented as PASS.

Independent frozen captures used both actual stationary seeds, ordinary
new-world controls,30 accepted fixed steps and3 advances420→423, the same
existing installation and unchanged capture fixture. Actual gameplay is the
runtime's hard/wild policy, not the requested legacy journey label. Pristine
`67e0cf507cbea1423e2b9819726a7b32a1c71a5f` reproduces the previous estuary
SHA `4948c73b38a07dce842b662a74a409a5806d454bf9e5c0665e0939dc17501568`.
Current f00b reproduces
`bef509ba7728fe385f96de5878193ece945fab6dba670e7c0e1ebcb6373a83c0`.
Both are current outer58 saves, not a synthetic downgrade/reseal comparison.

The complete parsed comparison changes151 paths: integrity/checksum and149
resident-perception consequences—63 anonymous noninterrupting contact beliefs,
63 attention keys,18 pressure changes and5 noticed transitions, across23
listeners. Bodies, tasks, stock, cargo, events, circadian state and other save
roots remain unchanged. Resident dry-contact production committed in
`2da02741d00923b19c3d50059431a07f4f5bbbe0` explains the delta:
accepted body tile entry → `residentContactAcoustics` → phase-correct runtime
physical samples → shared human hearing → existing perception/attention.
Heard impacts disclose neither emitter identity nor an exact hidden source.
The dense seed remains byte-identical at both checkpoints.

The accepted service tree
`9db03903af30d9dcd3b31e0777972c407ff95105` independently captures the
intended occupied-shallow-source extension:21 activity paths and89 perception
paths plus integrity/checksum differ from f00b. Only residents64,74,82,83,84,85
and87 are affected. Four native workers64/74/82/83 reach their material targets;
84 arrives earlier and87 follows its changed lawful approach. No stock,
project, event, cargo, circadian, session or ecology result changes during
these three minutes. Initial source depths13,045/8,042/3,909/5,835 are within
the existing ordinary-foot band. Resident64's target starts453 deep and dries
at421: final dry arrival does not assert initial dry access. Standard/hard
pressure shares initial seed geometry/placement; it is not a second gameplay
policy or proof of general wading/current resistance.

Final estuary body SHA is
`1e4f6676254535bc2b66643e304999e14091fd4cffb386d1c0e8614e3e4d366f`;
complete-save SHA is
`cd127e124ad5ad6718283e670c5415597662c7d4993d262032772f42d48dfc38`,
1,876,807 bytes. It retains59 anonymous contact beliefs across21 listeners.
Dense remains exactly
`a7b713dd04b7e96e637c441c313ef6bc4b124715ff2ebf4fd39301c5dbbe2944`,
1,902,647 bytes, with no resident-contact beliefs. The independently captured
production inputs match before/after at each checkpoint; no source changed
while any capture ran.

The test correction preserves every existing meaningful assertion, exact
full-cohort body hash, complete current-save hash and telemetry-on/off equality.
It additionally checks native foot-shallow origins, current dry material
arrival without premature use, and anonymous/null-subject/noninterrupting,
time-bounded, uncertain contact hearing. Neither knowledge nor body fields
are removed or normalized to restore an obsolete oracle. No production,
schema, supported-reader, dependency or release change belongs to this
characterization. Its focused correctness result cannot erase the failed
parent cumulative checkpoint; a new complete checkpoint must certify the
integrated executable state.

Final local validation passes the entire telemetry file4 tests19.75s, maintained
smoke6 files/105 tests4.19s, typecheck and documentation-reuse45. Relevant
contact/service/knowledge selection passes5 files/130 tests27.11s; its source,
tests, configuration and dependencies remain unchanged after the additional
native-arrival assertions in the separate telemetry file. Exact commands:

```sh
npx vitest run src/game/runtime.performanceTelemetry.test.ts --maxWorkers=1 \
  --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-cumulative-diagnosis/contact-telemetry-final2-test.json
npx vitest run src/game/residentContactAcoustics.test.ts \
  src/game/residentServiceShallowEgress.test.ts src/game/residentRestShallowEgress.test.ts \
  src/game/humanPerception.test.ts src/sim/actorPerception.test.ts --maxWorkers=2 \
  --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-cumulative-diagnosis/contact-telemetry-domain.json
npm run test:smoke -- --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-cumulative-diagnosis/contact-telemetry-final2-smoke.json
npm run typecheck
npm run test:documentation-reuse
```

All738 final public non-Markdown inputs match before/after at parent9db0390,
digest `9e749cf494652a0d4db6052a786414c321e343bfb60c107d201dfa3c7eccdf90`.
Local reports retain exact identities. These are correctness timings, not a
production performance comparison, platform artifact, new cumulative
certificate or release. The correction changes only this test and evidence;
current executable behavior stays with its accepted production owners.

### Native storm-held travel resumes after actual recovery — 2026-10-09

This unpublished test-only checkpoint extends the existing native multi-leg
storm-cargo case at parent
`c06124a162a6f8aaf191d6f50bb8db8dc5e9ac15`. It preserves the original
304-observation pickup/hold bound, ordinary controls, conservation assertions
and held-record cold comparison. Only afterward does
`continueNativeStormHold` open the actual tick724 current outer58 record.
No forecast, need, task, body, route, stock or cargo is assigned to force
resumption; production code, save schema and supported readers are unchanged.

The same resident89 and contract127 retain eight parts outside the actual
player interaction window. Existing keyed forecasts780 and960 remain storms;
both keep distance zero and extend the real arrival estimate/route delay.
The actual clear forecast1140 still leaves cold stress575,345 and no motion.
Tick1155 remains sheltered at335,345. Tick1156 recovers to319,345 and emits
exactly one resident-resumed event, but the body has not yet moved. Genuine
phase-zero preparation and closing work then pay890 fixed units east at1157.
The task becomes approaching without a second departure, handoff, invented
stock or ETA-only success. Identity, itinerary, commitment and custody remain
coherent throughout.

The separate continuation has a finite1185 stop and at most461 world
observations; it completes after433. Its tick1139/phase9 saved prefix follows
4,159 accepted steps from724. A separately loaded prefix processes the same
171-step suffix and matches every authoritative saved root, using only the
existing integrity/session-recap exclusions. Loading releases no audio.
This is native headless first-edge continuation, not physical shelter
construction, complete four-leg delivery, general wading/current resistance,
normal Chart/Relief play, performance or long-session certification.

Local validation passes the selected native case in491.14s, the affected
travel/activity domain5 files/158 tests in21.12s, maintained critical smoke
6 files/105 tests in10.51s, typecheck and documentation-reuse. The other three
cases in the runtime file are explicitly unselected by this focused command;
their separate parent cumulative result is not inferred here.

```sh
npx vitest run src/game/runtime.residentTravel.integration.test.ts --maxWorkers=1 \
  -t 'retains native multi-leg storm cargo outside' --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-native-resumption/native-runtime.json
npx vitest run src/sim/residentTravelAdvance.test.ts src/sim/residentTravelRoute.test.ts \
  src/sim/residentCircadianPhysiology.test.ts src/game/residentActivityExecution.test.ts \
  src/game/residentTravelEnvironmentExecution.test.ts --maxWorkers=1 \
  --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-native-resumption/travel-domain.json
npm run test:smoke -- --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-native-resumption/smoke.json
npm run typecheck
npm run test:documentation-reuse
```

All738 public non-Markdown inputs retain before/after digest
`82fd807e95dc64a9051d1e871a3b3055ac37c7240baf06a675b390b93b317d8e`.
Retained local report SHA256 values are native
`584d924ae99501f5fc47eb70a353975defad950088e83e77f8739ba8866ab963`,
domain
`76c86b5b6839a8558f555df1e4fd4f464e14b7dcb3533ac396a408c1e8f69df6`
and smoke
`439f15e123e4c8a8cbad770ba85de2981d84d03d25a264d25bb1d33ac4010af3`.
These are correctness timings under concurrent local regression load, not a
matched production speed comparison. No build, platform, performance,
publication or major-directive closure is claimed.

### Coincident resident access and production save-frontier checks — 2026-10-09

The local renderer repair `2174a6e01f32b7ef2ce09461799cc402b45b4839`
addresses an observed ordinary-control defect: exact coincident harbor/human
targets made the human inaccessible. Both views now share stable exact-nearest
tie cycling; current perception, distances and release validation are unchanged.
Its seven-file/332-test affected set and maintained105-test smoke pass.
The [shared pointer contract](./ARCHITECTURE.md#player-visibility-envelope)
owns the durable policy, not this experiment record.

At clean `3462f5af7349dd544533676fcb64718625c4878d`, production web/static
subpath checks pass over five files/4,875,735bytes. The newly packaged macOS
arm64 ASAR is5,104,171bytes, SHA256
`de2679c549506aeb32176a7e88503fc256dd5c0d3a6389f3c4fac4c929e4c515`.
Its embedded integrity matches; packaged main, package metadata and all five
dist files match the current files exactly. The ten-entry runtime whitelist
contains no source, tests, private planning or development cache. This identity
check alone does not establish functional packaged correctness.

The separate ordinary Firefox157.0.1 production witness serves the actual dist
at `/tideweft/`,1440×900 CSS/DPR1, through the existing static server and isolated
profile. Over140.195s it samples265 public projections, ticks420→560, with18
moving visible human IDs. Actual boundary480 shows civic activity;540 shows
ration activity. A physical Chart canvas click selects resident88 as unfamiliar;
the native GREET control changes that same public person to Acquainted and
discloses the introduction, then the native close control clears ABOUT. The
greeting screenshot was inspected. Source/artifact identity stays unchanged,
the browser exits normally and its disposable profile is removed. One known
startup CSP eval denial occurs before the guarded run; no guarded runtime error
is recorded. The ignored adapter waits for the actual enabled, unobstructed
DOM control rather than assuming selection and panel paint are simultaneous.

```sh
npm run smoke:web
node artifacts/validation/world0-normal-native/estuary-play.cjs \
  --run-name estuary-3462f5a-01
```

These public labels and sampled positions are not complete task, stock,
fairness, attention-expiry, performance, assistive-hardware or conservation
evidence. No source/task/need/weather/position/cargo/save is authored in that
browser witness. Existing camera focus uses an already disclosed human.

The actual346 desktop smoke passes both resident greeting gates but FAILS the
later relocation capture: repeated native saves observe phases1–9, never a
closed quiet phase0. This differs from the previous cdfe3a2 failure, where the
older installer fabricated empty phase0 carry and the real loader rejected it.
The current helper preserves all body, recency and pending-cause roots; its31
synthetic helper and40 existing body/save-boundary tests pass, but this package
run demonstrates that timer polling does not reliably reach the required native
boundary. Ordinary frames can accept multiple fixed steps before an external
callback; save preparation adds synchronous work. The log does not establish
which contribution dominates, and no loader rule is relaxed to conceal it.

The subsequent smoke-only capture uses the established ordinary WAIT control,
whose driver accepts one fixed step per RAF. It observes the public completed
tick, synchronously captures through native `save()`, and immediately cancels
only its own WAIT before awaiting storage. It still requires a genuinely empty
closed carry and a saved tick matching the retained immutable public view.
ADRIFT uses that matching captured view, not a later tide projection. It neither
assigns phase0 nor deletes resident histories, recency or pending acoustic facts.
At most80 observed RAF callbacks and a15s retry-admission budget are allowed;
the existing external smoke watchdog remains the hung-callback boundary.
This is controlled package-fixture preparation, not normal physical-input proof.

The existing WAIT and resident save-boundary domain passes45 tests32.41s,
including100 native accepted steps versus ordinary work, render-cadence equality,
partial cancellation/reload and failure-safe audio. Maintained smoke passes105
tests4.72s; typecheck,40 release-checker selftests and45 documentation-reuse
checks pass. The focused VM helper passes44 tests105ms, retaining the original31
preservation/error cases and adding ordinary-WAIT callback cadence,
save-before-cancel-before-storage ordering, ownership-safe cancellation, clock
validation, bounded no-change retries, matching saved/view ticks and a later
public projection arriving while storage is pending. Its
synthetic public snapshots are not a native loader or cadence proof. These are
correctness timings, not a speed comparison.

```sh
npx vitest run electron/smokeSaveFrontier.test.ts --maxWorkers=1 \
  --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-platform-current/wait-frontier-helper.json
npx vitest run src/game/runtime.wait.integration.test.ts \
  src/game/residentActivitySaveBoundary.test.ts --maxWorkers=1 \
  --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-platform-current/wait-frontier-domain.json
npm run test:smoke -- --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-platform-current/wait-frontier-smoke.json
```

The repair is committed locally as
`01506ee691e7d35ba68f4e31e38c052a3f24f4ac`. Fresh macOS arm64 packaging
and actual packaged smoke now PASS, including both physical resident greetings,
Harp relocation/reload, ADRIFT/recovery/exact autosave restoration, Chart/Relief,
pause/recovery and portrait/short-landscape layout gates. The executable uses
`app://bundle/index.html` and isolated disposable data, removed afterward. The
desktop and landscape ABOUT screenshots were inspected; these are bounded
functional gates, not complete visual QA, hardware-mobile or performance proof.
The retained terminal console is truncated by the tool's output limit, not a
complete structured event trace; the wrapper itself parses its full result,
requires `ok:true` and exits0. No trace equality is inferred from that console.

The new ASAR is5,106,002bytes, SHA256
`606a66dd605170d4b3d7847b62b922be7979808d35013d6a9138c74b6dc1eeec`.
An independent audit verifies all seven files/ten entries against the current
main, package and five dist files, the exact runtime-only whitelist, embedded
file/block hashes and Info.plist header integrity. Only packaged main changes;
all five web files and all ten source/dependency/harness fingerprints in the
retained346 Firefox identity match exactly. Its ordinary-browser proof remains
applicable to those identical web inputs within its original limits, not a new
browser run. Fresh `/tideweft/` static smoke also passes. Initial packaging hit
ENOTEMPTY after Finder created a6,148byte `.DS_Store` in the replaced generated
folder; moving that verified metadata-only remainder aside allowed the same
unchanged build to package. No game data or dependency was altered.

```sh
npm run package:desktop
npm run smoke:desktop -- \
  --executable release/tideweft-darwin-arm64/tideweft.app/Contents/MacOS/tideweft \
  --screenshot artifacts/validation/world0-platform-current/01506ee/desktop.png \
  --title-screenshot artifacts/validation/world0-platform-current/01506ee/title.png \
  --mobile-screenshot artifacts/validation/world0-platform-current/01506ee/mobile.png
npm run smoke:web
```

There is no new save schema, reader/support retirement, dependency change,
world-hitch result, longitudinal-soak result, ZIP/install/signing claim,
Linux/Windows certification, deployment or directive closure. The earlier exact
c06124a cumulative pass does not certify later bytes.

### Native flowing-water encounter retains custody and fresh-sight resumption — 2026-10-09

At local parent `8bbc691`, one additive test continues the existing estuary
offer127 fixture through ordinary accepted runtime steps. Its declared initial
clear-weather, need and player-exclusivity controls are retained; native terrain,
routes, source stock, assignment, approach, pickup and body motion are not
authored. This is a controlled headless encounter, not untouched ordinary play.
The same resident picks up eight parts at423 with exactly one departure.

The next generated route121 endpoint43,46 is genuinely flowing when the actual
body holds at bank43,47, waypoint15, at453: depth48,215, strength214,487 and
turbulence187,475 through the existing shared flow owner. At468, strength is0
but depth34,465 remains wet; the body and cargo remain held. At506 the physical
endpoint first becomes dry, but its admitted pre-world505 wet observation
still prevents progress. Fresh dry sight at507 releases the hold; four accepted
steps then produce bounded real motion. Terrain, native tide, assigned Promise,
cargo8 and the exact departure event are checked throughout, with no fulfillment.

Cold phase4 restores the same complete authoritative saved roots without load
audio and reaches the recorded phase9 after equal work. A separately opened
phase9 advances the same five-step suffix to identical final507/phase4 roots.
Only existing envelope integrity and presentation/session recaps are excluded.
The original fourteen cases and assertions remain unchanged and are unselected
by this command. The first new-case run failed solely on its added assertion's
incorrect `carrier` field; correcting it to schema-owned `carrierKind` gives
one PASS in46.163s/47.87s wall. The failed report remains local evidence.

```sh
npx vitest run src/game/runtime.residentPickup.integration.test.ts --maxWorkers=1 \
  -t 'retains native cargo at a genuinely flowing tidal endpoint until fresh dry sight permits progress' \
  --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-native-current/native-flowing-endpoint-carrier-corrected.json
npx vitest run src/game/waterFlow.test.ts src/game/humanPerception.travelSurface.test.ts \
  src/game/residentTravelEnvironmentExecution.test.ts src/sim/residentSurfaceKnowledge.test.ts \
  src/sim/residentTravelAdvance.test.ts --maxWorkers=1 --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-native-current/native-flowing-domain.json
npm run test:smoke -- --reporter=default --reporter=json \
  --outputFile=artifacts/validation/world0-native-current/native-flowing-smoke.json
npm run typecheck
```

Affected domain5files137PASS8.90s, maintained smoke6files105PASS4.25s and
typecheck pass. Production code, schema and supported readers are unchanged.
This proves a real flowing-water encounter under the current conservative
wet/dry policy, not current-force-sensitive appraisal, loaded water access,
complete journey, rendered play, performance, cumulative or directive closure.

### Current-sensitive occupied-source egress — 2026-10-09

Unpublished construction from parent56ede53 adds a bounded consumer of real
human aptitude/condition and the exact shared water-contact quote. The
[Architecture source-egress owner](./ARCHITECTURE.md#unladen-rest-and-service-shallow-source-egress)
defines its two independent gates and unchanged old/save boundaries; this is
not general swimming, water entry, equipment, injury or a new physics system.
`footing.ts` extracts the original current/rough-bed arithmetic without changing
player behavior. `residentActivityExecution.ts` quotes actual prospective
source-contact trajectory segments before committing movement, progress or wear.

One additive case in `runtime.residentRest.integration.test.ts` uses normal
fixed-step runtime play, with no authored task, need, body, skill, weather,
terrain or tide. Fresh `settlement keeper home night continuity` starts420.
Human84 (`H-v1-p0p0-1d9rhmy-2-1kt45xu`) actually selects material service,
waits at native(88.5,47.5) depth64,391 at420/phase1, then first moves east105
at445/phase1 while the same source still has depth41,474. Aptitude384,955,
rest404,468 and actual runtime exhaustion82,483 yield reserve595,532 and
capacity8,023; shared flow223,243/contact pressure5,199 passes. Its unchanged
dry service target is(89.5,47.5). Actual dry arrival at446 is approach completion,
not a claim that hourly medicine debit/project use already occurred.

The discovered actual445 phase-zero record resumes to real phases4/9 and
uninterrupted446 closure. Detached4→9 and9→closure match every saved root
apart from established session recap/envelope integrity exclusions; initial
loads are silent. Observed actual phase10 arrival followed by a late channel-
closure failure rolls every root back to9, releases only the existing warning,
and cold retry matches446. The original nineteen cases are byte-preserved.

Selected command:

```sh
npx vitest run src/game/runtime.residentRest.integration.test.ts \
  -t 'selects real native service, waits, and leaves bounded moving water through ordinary fixed steps' \
  --maxWorkers=1
```

Result:1PASS/19unselected,19.724s case/21.50s wall. The corresponding ignored
JSON retains exact evidence. Focused contact domain6files105, activity domain
12files434, runtime compatibility/publication/circadian/sound4files55,
critical `npm run test:smoke`6files105 and the existing late-introduction
rollback case1PASS/97unselected pass. The complete resident-rest file then
passes all20 cases in222.59s, including native hourly ration/material use,
old-format continuation, real rest recovery and the new native water case;
typecheck, context selftest28 and documentation-reuse45 also pass.
Lower-owner adapter tests retain genuine
generated445 material selection but explicitly activate protocol8; they are
not a second ordinary-runtime witness. Equal-depth transverse wind, removed
aptitude/reserve and independent depth-limit counterfactuals change motion to
waiting; phase4/9 cold continuation and later reserve reduction retain old poses.
The old service35001 foundation now explicitly has full exhaustion/no reserve,
preserving all its original boundary assertions under the new capability law.
A newly attempted direct tide-direction edit was rejected by the unchanged
clock invariant and removed from the new fixture, not accepted as world truth.

Inheritance: shared locomotion, physical current, existing actor/body/task,
fixed-step transactions and current persistence are INTEGRATED; physical gear,
new cargo and broad health are NOT APPLICABLE. Wet-contact acoustics, applicable
wet support, richer current knowledge/turbulence response and general crossings
remain DEFERRED to the existing-human integration owner. Unheard numeric state
never becomes belief. No cat-water, whole-population liveness, normal visual,
performance, new release or full cumulative certificate follows from these
bounded checks. Dependencies/upstream source/schema/support set are unchanged.

The exact01b2479 source candidate also passes host darwin-arm64 packaging and
the normal disposable-profile desktop smoke: both greeting controls, current
Harp/save/reload and ADRIFT/recovery/backup boundaries, both views, pause and
mobile layouts. Its runtime-only ASAR has10entries/5,107,206bytes and SHA256
`f7960cf543d18e30e2c610ac0357356303b2495660504488b6355b4176ebb634`;
all7 packaged files match current main/package/dist exactly. A first Forge
ENOTEMPTY was only the generated directory's6,148-byte Finder metadata; moving
that leftover recoverably allowed the unchanged retry to pass. Static
`/tideweft/` smoke passes. The desktop wrapper validated the full result, but
retained terminal output is truncated, not a complete structured event trace.
Screenshots were inspected. The retained ordinary Firefox adapter then passes
140.269s/264public samples,17moving IDs, exact civic480/ration540 and physical
canvas selection/GREET/Acquainted/close, with unchanged source/artifact identity
and zero guarded browser errors. This is bounded interaction/production-artifact
evidence, not full task fairness, hardware mobile/audio, measured performance,
soak, other-OS/signing/install, deployment or cumulative certification.

### Source-qualified tide-anchor contact service — 2026-10-09

Local construction from parent159a2dd connects one existing physical aid to
current-v8 unladen source escape. The
[Architecture owner](./ARCHITECTURE.md#source-qualified-resident-tide-anchor-service)
defines support, independent capability/depth gates, exact clipped-distance
wear and atomic publication. Two small extracts preserve the player's existing
fixture support and560000 mitigation; no second current scaling, actor gear,
new movement mode, receipt, schema, reader or dependency is introduced.

Foundations retain generated human84, its real selected medicine service and
native445 source(88.5,47.5), depth41474/capacity8023. Explicit transverse wind
433430 yields raw pressure8024;433429 remains within reserve. A legal arranged
anchor at(88,45) has radius2 support; full mitigation gives7349 and setting7686.
Removing the aid or making it carried, broken, foreign or out-of-radius restores
waiting. Bare-safe movement spends no aid condition. Ordinary player travel
cannot reach this initial site in time, so this is not normal F deployment or
an observed player-assisted crossing. No task, body, capability or result is
assigned by the contrast.

Actual east105 accepted steps charge only wet source contact105×4+80, not the
25-unit dry tail or subsequent dry approach. Full wear totals8000 condition,
setting4000; existing fractional remainder123456 survives detached cold4/9
continuation exactly. The independent depth/capability limit still blocks
exhausted reserve. Cold reclaim and newly broken condition remove future
support without changing saved prefixes. Strongest/lowest-ID arbitration and
later-invalid-roster rejection preserve input state and atomic publication;
constructed overlapping aid addresses remain explicit foundations.

The additive outer-runtime case first produces genuine ordinary442/445 body
and selected service history, then declares the placement/wind fixtures. It
compares carried-aid waiting with actual helped motion, saves phases4/9, and
joins complete saved roots across cold work (excluding only established session
recap/envelope integrity). A forced post-body/aid publication failure at phase5
restores every phase4 root, releases only the integrity warning, and cold retry
joins the actual uninterrupted phase5. Arrival is not hourly stock use. The
original twenty rest cases remain unchanged; all21 pass in241.86s.

Focused commands include:

```sh
npx vitest run src/game/fixtureFootingSupport.test.ts \
  src/game/residentWaterSupport.test.ts --maxWorkers=1
npx vitest run src/game/runtime.residentRest.integration.test.ts \
  -t 'commits only newly helped contact wear' --maxWorkers=1
```

The helper's7 cases and source-service18 cases pass; shared footing/player/
Wayknot/shallow domain7files146, activity12files434, runtime compatibility/
publication/circadian/sound4files55, critical `npm run test:smoke`6files105,
typecheck, context28 and documentation-reuse45 pass. The selected runtime case
passes1/20unselected in19.15s, before the complete21-case run above. An initial
new foundation failure was a reclaim-API typo, corrected to the actual stable-ID
signature without changing production or old tests. Current report scope,
not combined totals or historical cumulative results, owns each claim.
The existing runtime reed-mat transaction regression also passes1/14unselected
in73.94s; it preserves its original movement, finite wear, cold restore and
later-publication rollback assertions. The final combined support run passes
2files25tests in2.21s. The unchanged core introduction/save/vocal-audio
late-closure rollback also passes1/97unselected in7.04s on this candidate.

Shared physical support, finite aid identity/condition, fixed-step body
transactions and current persistence are INTEGRATED. NPC aid acquisition,
deployment, broad equipment/crossings, wet contact sound and fuller observed
current response remain DEFERRED to their actual owners; new boats/cargo/health
are NOT APPLICABLE. The partial bridge has a real local consumer, but no normal
assisted-play, whole-population fairness, measured performance, new production
artifact, deployment or complete cumulative certificate is implied here.
Completed directives and upstream source are unchanged; dependency changes: NONE.

The same executable840d499 then passes `npm run package:desktop`, its web
typecheck/build, `npm run smoke:web` and the existing disposable-profile
`npm run smoke:desktop`. ASAR3742460d… contains10 whitelist entries/7exact
current files,5,108,346bytes; independent extraction/file-integrity comparison
matches current package/main/dist. Static `/tideweft/` serves5files/4,878,079bytes.
Desktop current-save/Harp/ADRIFT/backup, greetings, both views and mobile-sized
layout gates pass; three screenshots inspected. Terminal output is truncated,
not a full retained event trace; the existing wrapper parsed the full result.

The retained ordinary Firefox adapter passes140.293s/267public samples and
18moving visible human IDs on157.0.1, reaches exact civic480/ration540 labels,
and physically selects88/GREET/Acquainted/close with unchanged source/dist.
The greeting screenshot is inspected and the disposable profile removed.
Guarded runtime errors are zero; one expected pre-guard CSP-blocked eval probe
is logged, not falsely reported as zero total errors. These are bounded available-
artifact/interaction checks, not normal assisted-anchor deployment, complete
tasks/fairness, hardware mobile/audio, performance, soak, ZIP/install/signing,
other-platform, CI/Pages/deployment or cumulative certification.

### Wet-support cumulative and ordinary attention evidence — 2026-10-10

Exact clean local `e9c665227904e412d0e87015b138f55d22f371b7` passes
`npm run test:ci -- --reporter=default --reporter=json
--outputFile=artifacts/validation/world0-water-egress/support-e9c6652-cumulative.json`:
419 test files /5,421 tests, zero failed/pending,2748.35s. Context28,
player-facing40 and documentation-reuse45 prerequisites pass. All750 tracked
input files retain the pre-run digest
`09d46a1fe1e40dd54132e13b7cf5451349a10ea878710bb3767c010cae04f033`;
report SHA256 is
`cf522ddd88798c0c709dab951dde29cf237a68a26a7e002993c711ef36088852`.
The ignored companion certificate records exact inputs/command/host toolchain.
This establishes cumulative local correctness for e9, not subsequent executable
edits, production performance, longitudinal Voice acceptance or directive closure.

A retrospective inspection reuses the unchanged140.293-second ordinary browser
witness recorded above, rather than repeating it solely for a new assertion.
Four native humans have public glancing/watching projections at421–422,
ordinary labels at423 and same-human ration presentation at540 in Relief.
One representative moves in the public projection during the glance without
body-heading reversal. Separately the greeted human stays waiting/name-only
through543–560; absence of a visible watch lock is not a positive post-GREET
glance-return/work proof. Exact original samples, report and reviewed projection/
attention source fingerprints match in the ignored `attention-review.json`.
This is bounded public-presentation evidence, not complete task/knowledge/stock
traces, pixel legibility, every-human fairness or a separate head/gaze model.
No new runtime run, task assignment or gameplay change produced this review.

### Resident occupied-source water acoustic carry — 2026-10-10

Local/unpublished construction extends the existing current-v8 accepted human
body-prefix producer at parent `e9c6652`; it does not add locomotion, a sound
save root, captions, gear, or another hearing pipeline. The first positive
occupied-source water contact yields one routine before-anchored slosh. Both
nondeep terrain records and both bounded-frame endpoints authenticate; a wet
neighbor destination or exact lower-edge outward zero contact stays silent.
Dry contact identities, frozen v1–v7 silence, occurrence-first eight-slot
admission, actual listener poses and transactional release remain unchanged.
Later reserve/task/aid changes cannot erase an already accepted cause.

The ordinary `runtime baseline estuary` journey reaches425 through50 accepted
fixed steps without assigning terrain, clock, task, body, needs or listener.
Generated human86 at(87.5,26.5) selects existing medicine project15 and moves
from its wet source after the tide opens a dry north neighbor. Its phase-one
`acoustic:traversal:c7c569d26dcb6627` reaches five actual independent human
listeners at closing426 as anonymous `physical-slosh`, with uncertain area and
no hidden identity. The real distant player receives no global audio or caption.
Exact phase4/9 complete saved-root cold continuation, consumed/load nonreplay,
late-channel-closure rollback of knowledge and cold retry pass. Only established
session recap/envelope integrity are excluded from root equality.

The separate ordinary445 positive-current source-egress witness is genuinely
outside frame(-56,-4)/120×120 and yields no admitted contact. A source-centered
lower-owner generated445 fixture does establish before-anchored contact,
retention after dry arrival and exact cold consumption, but it is FOUNDATION,
not runtime admission or player playback. Positive/masked/self-excluded hearing,
half-open boundary contrasts, malformed/deep/remote/wet-neighbor rejection,
both-endpoint rebase and early-wet/later-dry admission are directly tested.

Focused command `npx vitest run src/game/runtime.residentRest.integration.test.ts
-t 'hears real sparse rest-approach contact|selects real native service, waits|hears
the real estuary wet approach' --maxWorkers=1` passes3 selected/19 unselected
cases,37.06s; ignored JSON `wet-contact-runtime-group.json` retains exact result.
The complete contact/shared-acoustic/human-perception domain selection passes
8 files/159 tests,34.28s, in `wet-contact-hearing-domain.json`; unchanged old
producer26 cases remain, with17 additive water cases. Typecheck passes.
The full resident-rest file passes all22 cases in the original two-file domain
run; that report remains **FAIL**, because the telemetry oracle still expected
59 old dry contacts. Its failure was investigated rather than hidden. A retained
real thirty-step current58 capture, whose golden passed the clean e9 cumulative,
was compared with a new production capture at equal accepted work. Estuary
changes only anonymous physical perception and enclosing checksums/integrity:
34 surviving dry receipts are unchanged,16 new sloshes occupy earlier slots,
and25 later dry receipts are no longer admitted under the same eight-event
budget. Bodies/tasks, other knowledge, cargo, stock, events and all other roots
match; dense saved bytes match completely. Existing attention/pressure consumes
those changed lawful observations; no new threat rule is introduced.
The independently reviewed updated oracle retains full-save, complete-cohort
body and instrumentation-on/off equality. Its final four tests pass,29.84s;
estuary worldJson SHA256 is
`922d9c808e418f350cf9ad7f97a4544b8663080e0f328fc9eeea94b9d870ec56`,
dense stays `a7b713dd04b7e96e637c441c313ef6bc4b124715ff2ebf4fd39301c5dbbe2944`.
The final strengthened native case passes separately,19.72s: all five actual
listeners commit anonymous slosh beliefs, not merely computed observations.
The existing later-interval introduction/save/vocal-audio rollback case passes
1 selected/97 unselected,7.48s. Critical `npm run test:smoke` passes6 files/
105 tests,4.21s; context28/documentation-reuse45 and final typecheck pass.
Exact commands and original failed/final passed JSON reports remain in the
ignored local validation checkpoint. These are correctness characterizations,
not CPU, FPS, memory or production audio measurements.
This establishes one real anonymous listener loop, not wet player playback,
normal wet visual/audio acceptance, all-population liveness/fairness, production
performance, broad crossings/animals or directive closure. Writer58/carry14,
supported readers, dependencies and upstream source stay unchanged. The e9
cumulative certificate above does not certify these subsequent executable edits.

### Water-contact candidate artifact and ordinary interaction checks — 2026-10-10

Executable `8e23288a0bac79e8d8b617272e8284e115107f68` is local/unpublished.
`npm run package:desktop`, `npm run smoke:web`, and the maintained packaged
desktop smoke pass on macOS arm64. The isolated-profile wrapper exercises
current-save/relaunch, greeting, Harp, ADRIFT/recovery, pause, both views and
mobile-sized layouts. Its complete stdout, parsed result and before/after
package identity remain local. ASAR SHA256
`3f1dc6059b35c6f705af9843e5ecdc2a1ed131011284f614e5c274a33acab991`
is 5,108,583 bytes with ten entries; all seven packaged runtime files match
their source/build bytes. Static web serves the actual five output files under
`/tideweft/`; the existing large-chunk warning remains. No dependency changed.

A separate normal Firefox 157.0.1 run at the same clean executable/artifact uses
the untouched `runtime baseline estuary`, 1440×900 CSS/DPR1, real START/view,
pointer selection, GREET and close controls, ordinary RAF and bounded 500ms
public samples. No world/task/need/position/clock/save assignment or forced
simulation step is used. The 140.479s run retains 252 samples, exact tick480 civic
and tick540 ration labels, and unchanged tracked-source/build fingerprints. Visible
human91 is lawfully greeted at423; at424 ABOUT becomes Acquainted and the
restrained introduction identifies Oksana Ahmed. After physical close at424,
that same public actor identity presents `tending the project` at480 in both
Chart and Relief. Greeting and both return captures were inspected. The captures
do not independently prove pixel-visible activity-label legibility or a complete
stock/project transaction; lower-owner runtime tests own those consequences.
No guarded console failure occurs; one expected pre-guard CSP eval refusal is
retained. Browser exits normally and its disposable profile is removed.

The earlier 141.373s attempt reached480/540 and later same-actor project activity
but remained only Recognized: it is retained as incomplete greeting evidence.
Rapid coincident-selection cycling can precede the UI's cached-view paint.
The successful repeat waits two real UI RAF paints before pressing GREET,
without a forced update or production change. This resolves that harness
timing limitation, not an application defect claim. Public projection sampling
is not a complete authoritative trace, hearing/audio measurement, all-human
fairness, FPS/soak, hardware assistive/mobile or other-OS certification. No ZIP,
installation, signing, CI/Pages, deployment or directive closure is claimed.

### Native courier release and subsequent ration use — 2026-10-10

The additive `runtime.residentTravel.integration.test.ts` case extends the
existing generated density-eight food journey at local parent `f9ba08a`.
It retains original generated needs instead of the older fixture's explicit
need controls; clear weather and early player-exclusivity expiry remain declared
fixture controls. Terrain, identities, stocks, bodies, tasks and successful
results are not assigned. The native food14 offer133 selects its actual carrier,
hands off at496 and retains that same body at destination7 through release497.
This is controlled native runtime evidence, not untouched or rendered normal play.

The released carrier selects an actual civic task at497, but hourly needs make
it ineligible at540 and it clears541 without a fabricated work result. Ordinary
food pressure then selects an arrived ration at661; at720 real food/water use
reduces food need from484963 plus44200 growth to453163. The delivered quantity
joins the existing aggregate stock pool, not an individually identified meal or
second personal parcel. All scheduled production and other consumers stay live.
Independent arithmetic accounts due recipes, the complete stable-ID cohorts,
qualifying groups of three, destination stock and global food/water ledgers.
Another resident can legitimately eat and then accept a new commitment in the
same closing update. The first oracle missed that use after its temporary service
marker cleared; its failed result is retained. The final observer records actual
ration admission inputs without replacing the calculation and checks each
physical prerequisite, benefit and subsequent marker/commitment independently.

Detached current-save continuation497→719/phase9→720→721 agrees with the
uninterrupted complete roots. Separate pending and consumed reloads agree too;
only the established session-recap/envelope-integrity exclusions apply. Load
emits no audio, the old Promise remains fulfilled with zero cargo and released
travel/pickup, and no second departure/handoff or ration replay appears.
Focused command `npx vitest run src/game/runtime.residentTravel.integration.test.ts
-t 'releases a native food courier' --maxWorkers=1` passes one selected/four
unselected cases in239.832s. Typecheck and maintained critical smoke6/105 pass;
the ignored `post-handoff-current-save-final.json` retains the exact result.
The original four travel case bodies and default fixture controls are unchanged.
Their separate regression command uses the same file and worker limit with
`-t 'automatically picks up a native offer|holds the same native cargo|physically
completes one native reverse|retains native multi-leg storm cargo'`: four pass,
one deliberately unselected case,447.533s of tests/449.34s total. Together the
two selections cover all five cases at the same test bytes
`02a27ee2248e47e4e77e5aa735c2466734ac889f98d33d2cab921458bf07358e`;
the second ignored report is `post-handoff-existing-travel.json`.
This is test/evidence work, not a production/schema/support/dependency change,
performance measurement, population fairness, full lifecycle/normal-play
acceptance, public release or directive closure.

### Native civic request continuity across work opportunities — 2026-10-10

The existing first-hour `runtime.residentRest.integration.test.ts` civic case
now follows the untouched `runtime baseline estuary` through a second hourly
opportunity at local parent `5c72585`. Ordinary START/RAF steps retain native
needs, weather, offers, recipes, stocks, terrain, bodies and tasks. No worker,
arrival or successful result is assigned. The existing complete first-hour
accounting and cold assertions remain intact.

At settlement3/project13, the actual post-needs selector admits at least two
arrived contenders at480. The first equal-age winner contributes one real parts
unit; another retains its older pending request. All60 intervening world
closures retain that request and actual target position, while the successful
worker genuinely reselects with a newer age. Both remain eligible at540 and the
older waiter receives the next conserved contribution. This is one native
site's two-opportunity runtime witness: one successful use ahead of the older
request and60 civil ticks between uses, not a universal wall-time service
guarantee or all-population/long-run starvation certification.

Read-only wrappers return the original selector and step results. Independent
recipe-order arithmetic checks parts stocks and the global produced/consumed
ledger; the project advances1→2 and no contract transfer/cargo explains the
change. Detached539/phase9→540 and consumed540→541 loads match all saved roots
apart from the established session/envelope-integrity exclusions. The following
minute preserves stock, ledger and project results directly; load emits no audio.

The final native selection passes in48.977s; four adjacent lower-owner cases also
pass in that selection. The complete material integration and codec selection
(`npx vitest run src/game/residentMaterialActivity.integration.test.ts
src/sim/residentMaterialActivity.test.ts --maxWorkers=1`) passes34 tests in19.85s.
These cover the independent three-contender/intermittent-supply bound,
source/priority revocation and cold nonreplay. Maintained critical smoke6/105
and typecheck pass. Ignored `native-civic-fairness-final.json` and
`native-civic-fairness-material-domain.json` retain exact results. This is
test/evidence only: no runtime, schema, supported-reader, dependency, visual,
performance, public-release or directive-closure change is claimed.

### Untouched native keeper closure and current-save continuity — 2026-10-10

At local parent `e759f75`, an additive
`runtime.keeperInspection.integration.test.ts` case starts the untouched
`runtime baseline estuary` with ordinary journey/wander controls. Native needs,
weather, offers, recipes, stocks, terrain, tasks and evidence remain unchanged.
Store5's keeper makes a real civic material approach from its adjacent source;
the accepted phase9 body prefix contains positive movement toward the actual
store. There is no inspection task or player warning/selection.

The store remains open at420/phase9 with no committed keeper evidence. At421,
fresh lower-admitted identified sight of the exposed food lot and actual dry
store contact authorize the existing in-place securing transaction. Its receipt
binds the same keeper, store, evidence, tick, risk and confidence. A read-only
observer returns the original action result and verifies transaction-local
carrier/custody equality; legitimate domestic consumption elsewhere in that
interval is not mistaken for a closure debit. This is not a dedicated
inspection-driven trip or a general profession.

Independent pending420/phase9→421 and consumed421→422 cold continuations match
every saved root apart from the established session/envelope-integrity
exclusions. Loading emits no audio. The subsequent minute retains the closure
receipt and knowledge without a second securing action. Existing controlled
source-removal, inspection approach, priority, supported-history and rollback
cases remain unchanged.

`npx vitest run src/game/runtime.keeperInspection.integration.test.ts
src/game/settlementKeeperInspection.test.ts src/game/settlementEcology.test.ts
src/game/settlementKeeperStoreResponseExpression.activity.test.ts --maxWorkers=1`
passes four files/70 tests in54.61s. After strengthening only the new native
case's approach assertions, the same runtime file with
`-t 'secures the untouched native store' --maxWorkers=1` passes one selected/
20 unselected cases in7.287s of tests/9.52s total. Maintained critical smoke
six files/105 tests and final typecheck pass. The ignored
`native-keeper-domain.json` and `native-keeper-current-save-final.json` retain
the exact scopes. This is test/evidence only, not a runtime, schema, supported-
reader, dependency, visual, performance, public-release or directive-closure
change. One native in-place closure does not certify all-keeper liveness.

### Native receding-water endpoint arrival and cold continuation — 2026-10-10

At local parent `9be003b`, the existing native flowing-endpoint case in
`runtime.residentPickup.integration.test.ts` now follows its real released hold
through actual waypoint arrival. The original declared need/weather/exclusivity
controls, generated terrain, offer127, automatic carrier, source debit, wet/dry
sight, retained cargo and phase4/9 assertions are unchanged. No dry surface,
body, task, evidence or successful result is assigned.

The actual route121 endpoint `(43500,46500)` is flowing and wet at453. Loss of
flow at468 does not remove wetness or release the hold. Physical drying506
still retains the previously admitted wet observation; fresh dry sight507
permits movement. From507/phase4, ten further accepted steps reach the exact
formerly blocked endpoint at508/phase4 and advance cursor15→16. Every measured
fine displacement is bounded and remains on that cardinal edge. The same
parts8 cargo, assigned resident, single departure and unfulfilled commitment
persist throughout; no second pickup or premature destination handoff occurs.

The first new oracle incorrectly treated the native5→1 journey as a forward
stored path. Its failed report is retained. Actual endpoint arrival had passed;
the corrected oracle uses the real reverse itinerary and exact complementary
integer progress, without a production edit. Detached507/phase4 runs the same
ten-step suffix and matches every saved root apart from the established session/
integrity exclusions; loading emits no audio. Existing wet-hold cold chains and
source-removal/rollback tests remain intact.

`npx vitest run src/game/runtime.residentPickup.integration.test.ts
src/sim/residentTravelRoute.test.ts src/sim/residentSurfaceKnowledge.test.ts
--maxWorkers=1` passes three files/48 tests in189.40s, including the native case
in43.795s. Maintained critical smoke6/105 and final typecheck pass. Ignored
`native-dry-endpoint.json` retains the failed oracle and
`native-dry-endpoint-final.json` the final result. This is test/evidence only,
not a schema, supported-reader, dependency, performance, visual, public-release
or directive-closure change. Receded-water dry arrival does not prove loaded
water traversal, current-force appraisal, alternatives or a complete journey.

### Target-neutral visible attention copy — 2026-10-10

At local parent `5fb8ea6`, shared human visual receipt and resident appraisal
already retain identified nonplayer wildlife attention. The quick-label and
ABOUT projections nevertheless described that state as "watching you". Two
new sensory/projection fixtures, for a large predator and a heron, reproduce
that misleading claim. After correcting only the two strings to "watching
nearby", both projections remain target-neutral without exposing the subject
identity, species or hidden point. Attention, body, hearing, expression, timing,
physical transactions and current-save schemas are unchanged.

The complete presentation fixture state remains equal before and after
projection; this deliberately abbreviated-route fixture is not a valid save
or an autonomous player-accessible wildlife scene. The first test attempt
incorrectly called world serialization on that fixture and failed the route
invariant before reaching the copy oracle. Its corrected red characterization
fails exactly the two misleading labels; the existing thirteen cases pass.
Both reports are retained locally, not concealed by weakening an old oracle.

Affected presentation, ABOUT, human perception, resident attention and core
ecology receipt checks pass ten actual files/152 tests in26.88s. The command
also named nonexistent `projection.test.ts`; that filter supplied no coverage.
The real projection perception, situated-expression and resident-pickup owners
separately pass three files/59 tests in7.55s. Maintained critical smoke passes
six files/105 tests in4.54s; typecheck passes. Ignored
`nonplayer-watch-{red,red-final,domain,projection}.json` preserve these scopes.
The exact-parent419-file/5,441-test cumulative certificate remains parent-only,
not certification of these later changed bytes. This is a local presentation
correction, not natural visual play evidence, new cognition, performance,
public release or WORLD0 closure.

### Native water-egress work eligibility and nonreplayed priority change — 2026-10-10

At local parent `55aced1`, only the suffix of the existing untouched native
source-egress runtime case is extended. Original selection420, wet hold,
skill/current-qualified movement445, dry arrival446, partial cold continuations
and late-failure rollback remain unchanged. From the actual retry's446 closure,
339 accepted steps reach479/phase9; one more closes480. The same medicine
task is arrived and unspent, but the real hourly needs update changes its
resident's intention from work to rest. Post-needs selection finds no eligible
worker at that clinic. Medicine110 and project progress0 remain intact; arrival
does not manufacture work or spend stock.

Five other actual project users are independently captured through the real
selector. Declared due recipes, exact stocks, project increments and every
produced/consumed ledger delta reconcile; medicine consumption is zero. Existing
cargo quantities are unchanged and the real shortage pulse adds only zero-cargo
offers. The first new oracle wrongly required an unchanged contract ID set;
its failed report is retained, and the corrected oracle checks old custody and
new offers separately. No production algorithm or old assertion is changed.

Pending479/phase9→480 and closed480→481 cold chains match every authoritative
saved root apart from the established session/integrity exclusions. Loads are
silent;481 neither replays stock/project benefit nor restores the stale task.
Selected final case passes in33.195s. Full rest runtime passes its22 cases in
284.69s; the two nonexistent simulation integration filters supplied no coverage.
The actual game material-integration and simulation activity owners separately
pass two files/34 tests in20.41s. Critical smoke6/105 in4.26s, typecheck, diff
and documentation checks pass. Ignored `native-medicine-{observation,
continuation,continuation-final,domain,material-domain}.json` retain exact scopes.
This is test/evidence only: a genuine priority reassessment and no-unearned-work
proof, not positive medicine payoff, restorative rest, eventual service,
whole-population liveness, normal visual play, performance or directive closure.

### Resident-only terrain receipt experiment — 2026-10-10

**Initial short regression check: FAIL. The retained terrain repair below reduces
fine-step presentation cost, but the overall world-cost gate remains FAIL.**
Clean local `de37b40e8c8c6ec9316fac4d696526efe514a5ec` packages the current
`55aced1` executable source. Its ASAR SHA256 is
`dfee3bef860d7fe81fb57d7edbdd21e515d69aeba4fd57909dad38a539ce7f4a`;
production JS is `72986c69a0fbb4fd1c41edc446f72f4d0b1ec5c300763e4d8012d76167bce54c`.
Normal macOS arm64 packaged smoke and five-file static web smoke pass. The
ordinary Firefox production witness completes140.644s/native420→560, with
physical START, selection, GREET/acquaintance, close, both views and later
project/ration labels. Source/dist fingerprints remain unchanged. One
unguarded startup CSP eval-denial entry matches the existing harness's expected
p5 capability probe; guarded errors are zero, but a raw caller stack was not
retained. These checks do not prove a complete traveler loop or every physical
transaction. The desktop smoke's console JSON was truncated by the observation
tool; its terminal exit0/pass line and images survive, not a complete parsed
console record. No successful process was rerun just to recapture it.

Four fresh production measurements use the existing packaged/browser runners,
two sequential15s estuary Relief windows per platform, unchanged quality and
30-frame warmup. AC Apple M4/16GiB, macOS26.5.2, Low Power Mode off,
Node22.20.0/npm10.9.3, Electron44.1.0 and Firefox157.0.1 match the known retained
host/tooling conditions. No sampler, competing test/game or hitch trace runs
during these samples. The comparison uses the arithmetic mean of two per-run
means against the retained Alpha64 pair, not simultaneous alternated artifacts.
Frozen draw+5%/callback-loss5% limits remain unchanged; before these AFTERs,
the same allowance was explicitly applied to the inclusive world-step mean.

| Paired metric | Electron BEFORE → current | Firefox BEFORE → current |
| --- | ---: | ---: |
| Draw CPU mean |25.215→24.607ms|20.459→21.355ms|
| Renderer callback rate |33.308→31.227/s|32.152→28.728/s|
| Inclusive world-step mean |90.153→100.239ms|156→174.100ms|
| Maximum observed world step |117.5→134ms|184→210ms|

Draw passes its own limits; callback rate and inclusive world cost fail on
both platforms. Both repeated current world maxima raise the pre-frozen
attribution flag. Current Electron counts149/149 accepted fixed steps and14/14
world advances; Firefox151/151 and15/15. Historical counts differ, so matching
seed and wall duration do not prove equal terminal work. Current23 visible
actors/18 humans versus22/17 and one label versus seven are explicit workload
differences;72 total/54 materialized/950 aggregate population units persist.
Six pending counters end at zero, supplied resource caps hold, and explicit
tail saves1,980,354/1,944,167B remain below4MiB. Those saves are outside the
timed windows. Short low-count p99 is effectively the maximum, not population
p99. No p50/p95, backlog, acoustic queue peaks, memory-growth, autosave,
presented FPS, long-session or universal-platform claim follows.

A separate20.185s sampled diagnostic reuses the opt-in packaged runner, paired
page/profiler clocks and a separate sourcemap whose executable prefix exactly
matches the production JS. Its13,593 samples include19 world advances. Nearest
first-party charging assigns944.234ms to the terrain tile map; its enclosing
terrain projection accumulates1,183.924ms inclusive. Inclusive ancestors
overlap and are not summed; sample weights are neither exact durations nor call
counts, and sampling changes cost. A separate unused attention parse is only
19.522ms inclusive and is not the selected intervention.

Source inspection identifies an exact terrain-receipt miss: resident-only
publication already retains the registered physical-publication root, but the
receipt compares the new outer resident view instead. The small candidate
stores/compares that existing private physical identity. All eligibility,
time/seed/frame/weather/biome/light/perception and exact mutable knowledge,
mask and settlement guards remain. No whole view, actor, world outcome, save,
schema, cache capacity, cadence or dependency is replaced.

The first new reference fixture incorrectly spread a120×120 regional world
without its signed metadata and failed the legacy coordinate boundary. That
report is retained. Using a real mutable regional publication instead produces
the intended identity-only RED, one failed/eight passed; original six cases
remain intact. Candidate domain passes seven files/66 tests in36.57s, including
native equal-accepted-work/current-save characterizations for estuary and dense
seeds. Final strengthened terrain case updates a directly visible public
condition while sharing terrain and retains complete uncached projection parity
and nonmutation: all nine terrain cases pass in6.51s. Critical smoke6/105 in
4.14s and typecheck pass. A precommit packaging attempt correctly stops at the
dirty player-facing review gate; that release safeguard is not weakened, and
no new player release/version is fabricated for this internal performance
candidate. Production confirmation follows coherent local preservation.

Ignored `world0-short-performance/de37b40/` holds frozen acceptance, four
BEFORE hashes, four current captures, exact comparison, source-map/CPU evidence,
red/final/domain reports and package identity. This is local/unpublished
construction evidence, not hitch resolution, complete cumulative certification
of later executable bytes, a release or directive closure. Existing extended
profiling/soak deferrals remain unperformed; new regressions are not waived.

#### Terrain receipt production confirmation

Local `8f4f3aa4cda642a20c6d000558e2a4c1a64df1bc` preserves the correctness-
validated candidate. Its rebuilt runtime-only ASAR has10 entries/5,108,625B,
SHA256 `0094448def5d5a44105a43b8a9a72cd08feb02468c4742e5bfbec0d2a7c280cb`;
production JS SHA256 is
`6fd6b282289a9c0393d1331c79b4798984f2a82a565d8d3f34da734ee1e00056`.
All seven packaged files exactly match checkout/dist. The unchanged package
command's first attempt encounters a generated output containing only Finder
metadata; moving that exact file aside and removing the now-empty directory
permits the ordinary retry. No build/security/publication policy is bypassed.
Web build, five-file static web smoke and generated macOS arm64 packaged smoke
pass. Root inspects the actual desktop/mobile Relief screenshots; static
images do not prove motion, every branch or low-end mobile performance.
The packaged smoke enforces its complete internal result, but the observation
tool again truncates its enormous console record; only the surviving terminal
certificate, selected visible fields and images are retained independently.
The first ordinary Firefox follow-up is invalidated by the investigator editing
this research record during its window: the harness's complete tracked-diff
identity check correctly fails. Runtime/source bundle fingerprints stay equal
and public greeting/return labels are observed, but that is not a passed frozen-
tree check. The unchanged runner is retried only after local evidence preservation
with the entire tracked tree held fixed; no harness condition is weakened.

Two new15s production windows per platform retain the exact frozen acceptance,
host/power/quality/viewport/warmup and existing runners, with CPU sampling off
and platforms sequential. Compare the immediately preceding `de37b40` pair
for the repair effect, separately from the original Alpha64 regression limits:

| Paired per-run mean | Electron de37 → candidate | Firefox de37 → candidate |
| --- | ---: | ---: |
| View projection CPU |10.071→5.552ms|10.288→8.092ms|
| All accepted fixed-step CPU |20.503→16.002ms|29.066→26.878ms|
| Draw CPU |24.607→23.990ms|21.355→20.710ms|
| Renderer callback rate |31.227→33.843/s|28.728→29.875/s|
| Inclusive world-step CPU |100.239→102.029ms|174.100→174.367ms|

Each of the two repeats on each platform improves projection and fine-step
cost: paired projection falls44.87%/21.34%, callback rates rise8.38%/3.99%.
Retain the narrow removal of demonstrated redundant terrain work. There is
**no demonstrated world-advance improvement**: its paired mean is effectively
unchanged or slightly higher. The world-step frozen criterion still fails on
both platforms; Firefox callback rate also remains below its frozen floor.
Electron now passes its callback criterion; both pass draw. No gate is loosened,
and lower fine-step cost is not described as fixing the synchronous hitch.

Electron runs each accept149 steps/14 world advances/ticks420→434. Firefox
accepts152/151 steps and15/15 world advances/ticks420→435; its first window is
not exact-work comparable to the earlier151-step run. All four retain the
immediate baseline's72 actors/54 materialized/23 visible/18 visible humans/
950 aggregate population units. World maxima are133.2/131.5ms Electron and
217/193ms Firefox. Callback p99 gaps are126.3/129.9ms and201/198ms; worst gaps
155.7/153.9ms and242/214ms. These sparse tails provide no robust p99 or hitch-
removal evidence. Wall-window throughput is not authoritative state equality;
the independent native runtime/current-save characterizations and complete
cached-versus-uncached projection parity are the behavior-preservation proof.

All six endpoint pending counters remain zero and every supplied resource cap
holds. Tail saves1,980,354B Electron and1,948,809/1,944,167B Firefox remain below
4MiB. Snapshot CPU47.9/49ms and98/95ms, end-to-end91.5/92.2ms and146/140ms,
are outside timed windows, not autosave proof. Electron's actual before/after/
after-save heap observations are retained; they vary with collection and do
not establish retained growth or convergence. Firefox does not expose them.
No travel, saturation, full soak, GPU/presented-FPS, deployment, signing,
installation or other-platform certification follows.

The ignored `terrain-receipt-candidate` child retains package identity, exact
four capture hashes, full immediate-before/after extraction, unchanged frozen
budget verdict, heap observations and terminal desktop certificate. Architecture
changes only the existing terrain receipt's physical identity. After reopening
their unchanged source laws, the two acoustic/save context-summary review
fingerprints are refreshed without changing summary text or status. Context
tool self-tests28 and actual critical smoke6/105 pass. No dependency or upstream
source changes occur. WORLD0 remains unfinished and unpublished; this is a
useful internal repair, not a release or major-directive closure.

The proper fixed-tree ordinary Firefox retry at
`d53fed1529c1a9553b765dad5270507af67bdd97` passes140.547s/native420→560,
276 public samples. Real selection/GREET423–424 establishes acquaintance and
an introduction caption; closing425 permits the same resident's project label
at480 in both Chart and Relief, with four ration labels at540. Root views the
actual paired return screenshots. Complete source/dist/HEAD/dirty-diff identity
is equal before/after; Firefox exits0 and its disposable profile is removed.
One unguarded startup CSP eval denial is still reported under the existing
expected-probe allowlist, with zero guarded errors/navigation/prompts/context
destruction; no raw caller-stack attribution is invented. The retained report
SHA256 is `0674a96d8cf00cb784e8c087a4e0572fa953c68bfefd6d0c0a9fce3b2e6c37d5`.
This is ordinary public control/presentation proof, not an injected task, full
transaction conservation, traveler wet-hold loop, audible hardware, performance,
global fairness or long-session certification.

### Mixed-resolution ecology must preserve absence, identity, and causal limits

The Alpha 14 Wave-A implementation establishes a bounded scaling pattern for later biodiversity work. Habitat capacity, aggregate population units, pressure, and trend are authoritative facts separate from the small number of exact actors used to represent them nearby. A valid habitat can support no local member of a species; quiet ecology must not be treated as a generation failure. Deer and gull representatives retain stable herd/flock state across full and coarse simulation, while unloaded individuals age physiology and already-committed intent without inventing perception, movement, food claims, or harm. Bounded player-absent group displacement can occur only from persisted habitat pressure and validated anchors, remains nonlethal and cargo-neutral, and does not become player knowledge automatically.

Alpha 15 sharpens that pattern by choosing representation per ecological scale. A free-ranging domestic cat remains a persistent individual because its movement, appearance, current condition, and encounter choices are legible at actor scale; shared current observations can make it retreat from strong rain, leave bounded wet tracks, or guard food when another cat is visibly competing. Brown rats remain one habitat-derived population-area aggregate because simulating every rat would spend identity and perception budgets without creating equivalent decisions. Aggregate stimuli arrive only after the existing visual, scent, weather, terrain, and cargo owners resolve them; the population kernel does not scan actors, weather, or inventory on its own. Its response conserves population units, includes bounded density spacing between saved anchors, and can create directly observable physical signs without manufacturing rat actors, consuming an attracting provision, or granting remote player knowledge.

Alpha 16 adds a second scaling lesson: ecological roles need a physically plausible size boundary before they can drive behavior. A generic `predator`/`prey` comparison was broad enough to misclassify the domestic-cat/deer pair. Declaring small prey and small predators lets the same trophic resolver support cat-or-fox pressure on rabbits while keeping deer outside that relationship; the correction is a shared rule rather than another species-name branch. The resulting rabbit/fox crossing stops at a finite nonlethal pursuit: direct visual evidence can produce rabbit alarm and flight or fox pursuit, dog and large-predator pressure can redirect attention, shared terrain costs shape movement, and expiry or lost opportunity produces disengagement. Paired tracks and canid pawprints persist at the movement site but remain direct-sight, non-targetable evidence; their immutable source clarity derives deterministic fading and exact expiry after 180 ticks rather than save-cadence-dependent mutation. Thumps and yips are presented only when their causative event was visible. None of this implies an attack, kill, carcass, complete scent field, foliage consumption, circadian schedule, worldwide population, or complete bestiary.

The Alpha 17 Rain Chorus / Shadow Overhead release adds a third scaling lesson: a species can be plugged into shared policy and capability owners without pretending every ecological unit needs a full actor or a bespoke pairwise decision tree. Fish crows use no more than three persistent visible representatives and one saved flock when at least two are present; a northern harrier remains one solitary representative; a southern leopard-frog area conserves 64–72 units over no more than three anchors and never manufactures frog actors. At that release boundary the shared activity owner authenticated only a bounded daytime/rest distinction, habitat-valid crow perching, and deterministic harrier low quartering; it was not yet a complete circadian system. The physical-item owner still controls crow food custody, so a crow must reach and atomically consume the exact loose provision rather than receiving an abstract reward. The perception and trophic owners require a direct crow sighting of the harrier before alarm can become mobbing pressure and interrupt a finite nonlethal pursuit; co-presence alone does nothing.

The frog chorus demonstrates why stimulus and perception must remain separate. Rain raises aggregate activity, but the same rain masks the chorus through ordinary directional hearing. Quieting and one-unit redistribution modify the same conserved aggregate, while ABOUT, Chart, and Relief expose only lawful evidence rather than a hidden count or fake frogs. The current caption remains species-anonymous; its qualified direction and uncertainty-attenuated pan derive from the same heard-bearing band, and unresolved or co-located contact is stated honestly. Fish crows and the harrier likewise receive distinct visible forms and authenticated perch/quartering posture without fabricated bird ground tracks; the harrier receives no invented call. A selected visible flock's ABOUT estimate comes from its existing knowledge-filtered projection rather than a second hidden census. Habitat version 4 preserves the exact version-3 population prefix before appending these three analyses, and outer save version 12 performs the corresponding one-time adoption from an authenticated version-11 envelope. The release therefore exercises extension and conservation rather than treating a new roster as permission to reroll the old ecology.

The `0.3.3-alpha.18 — One Marsh, Many Eyes` release tests a fourth scaling lesson: aggregate perception can consume canonical addressable species and derive pressure from the same role/capability/trophic policy as individual encounters. A marsh fox can consequently pressure both current small-prey aggregates, while a co-present marsh rabbit creates no response; neither outcome requires adding another pair to a source allowlist. The catalog also closes every broad interaction target row as supported or intentional-no-response, making omission fail visibly without pretending each pair has a handcrafted fixture. A representation-aware readiness report authenticates these seven roles only under the literal `bounded-starting-harbor` scope and explicitly withholds worldwide ecology, migration, promotion, full 30-criterion readiness, and broader biodiversity completion. These are released bounded starting-harbor architecture and player-facing parity changes, not evidence of worldwide ecology, mortality, carcasses, complete scent, full circadian life, a complete bestiary, or N² interaction coverage. Exact feature commit `673fc373b2b6de81f299f4c176681c969ace6915` passed CI run `34027046007` and Pages run `34027046121`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

The `0.3.3-alpha.19 — The Tide Table` release tests a fifth scaling lesson: time-varying habitat should project from stable saved facts rather than rebuild ecology whenever the environment changes. Habitat version 5 retains the complete version-4 population array as an exact prefix and appends stable tidal anchors with baseline elevation. The target tick's authoritative tide then derives water depth, usable fish or crab activity, and egret wading opportunities without participating in population generation. Atlantic silversides and Atlantic marsh fiddler crabs remain conserved, non-addressable aggregates; ebb, flood, and lawful wader pressure may move only their existing units among saved anchors. A snowy egret remains one bounded individual and receives no hidden census or magical target: shared line of sight must produce a current anonymous aquatic-activity observation before its ordinary cognition and locomotion can choose that edge. Surface dimples, glints, burrows, and scrapes likewise remain direct evidence rather than fake animals. The architecture therefore composes tide, aggregate state, perception, cognition, movement, evidence, and presentation without pretending pressure means capture, mortality, consumption, or fishing. Its readiness boundary authenticates signed moving-frame continuity separately from ecological migration and carries dedicated performance evidence. This is the first bounded starting-harbor Wave-C unit, not worldwide ecology or completion of Wave C. Exact feature commit `7ef802398f4b5ea6d4e6503d436fc7a858ccbe30` passed CI run `34045602263` and Pages run `34045602240`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.20 — Between Water and Sky` release tests a sixth scaling lesson: a representative species should exercise a missing shared capability seam rather than accumulate a private pathfinder and detector. Habitat version 6 preserves the complete version-5 population and tidal-anchor record as an exact prefix, then may append zero or one stable persistent American black duck. Two saved dabbling-water destinations and one dry refuge support bounded float, scan, dabble, rest, surface-swim, and relocation-flight activity. The duck's current lawful sensory input is only anonymous aquatic activity produced by shared terrain-occluded vision. Its catalog permits only air plus shallow- and deep-water movement, while activity projects those routes as `air` or `surface-water` into the ordinary locomotion solver; it has no land/walk route. Tide and water select habitat, activity, and travel medium without directly mutating stress or condition. Chart, Relief, and ABOUT expose the same direct knowledge-honest individual, with no flock or invented wake.

The release also confirms that bounded presentation history cannot double as an authoritative operation clock. Internal aggregate schema version 4 stores a durable completed tide-edge operation marker outside the capped event tail, so evicting an old visible disturbance cannot make a same-tick redistribution eligible again. Outer session version 14 adopts an authenticated sealed version-13 record once while preserving all earlier actor, group, aggregate, item, Promise, custody, evidence, tidal-anchor, and world state. The proof remains deliberately representative: shared invariants, conservation, deterministic scenarios, bounded fuzzing, and performance witnesses scale better than a test for every animal pair. It does not add flocking, nesting, breeding, migration, cross-region ecology, mortality, carcasses, injury, capture, consumption, the otter-like predator, worldwide ecology, Wave-C completion, or broader biodiversity completion. Exact feature commit `c11e4de0563876839158fb13a69ddfb4dadd6dbe` passed feature CI run `34061008077`, main CI run `34061513043`, and Pages run `34061512986`; the deployed HTML, icon, manifest, JavaScript, and CSS match the tested local build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.21 — The Living Channel` release tests a seventh scaling lesson: an amphibious representative should compose existing habitat, perception, role, activity, locomotion, materialization, physical-item, and presentation owners rather than receive an otter-specific parallel simulation. Habitat version 7 preserves the complete version-6 population and anchor record as an exact prefix, then may append zero or one stable North American river otter only where both tidal aggregates, usable foraging water, and a distinct dry haulout support it. Shared shore↔surface-water travel keeps the same actor and identity across media. Current anonymous aquatic activity reaches it only through ordinary occluded sight; fish and crab interactions remain nonlethal aggregate pressure; and one representative loose-food contest resolves through the generic physical claim and custody seam. Deterministic spatial top-K ranks every lawful intersecting individual by exact local distance with stable-ID ties before selecting the unchanged 24 full-detail actors, so source order cannot determine visibility and overflow identity remains authoritative in coarse state.

The release advances outer save format to 15 and adopts an authenticated version-14 envelope exactly once without rewriting its habitat-version-6 prefix. Chart, Relief, ABOUT, mouse, touch, and reduced-motion presentation project the same knowledge-honest individual. Exact feature commit `5514c24619fc6d41b34cbdd6315f4ae8d936f2dc` passed CI run `34067577935` and Pages run `34067577893`; the five fetched live assets match the tested committed build byte-for-byte. It deliberately adds no live-prey capture or consumption, harmful attacks, injury, mortality, carcasses, fishing, new sound or persistent evidence, reproduction, ecological migration, worldwide ecology, full Wave C, broader biodiversity completion, or exhaustive pair testing.

The **LIVE_VERIFIED** `0.3.3-alpha.22 — Tidal Convergence` release tests an eighth scaling
hypothesis without adding a species: activities that already crossed different
media should converge behind reusable affordances before the roster grows
again. Six profiles now compose perch watching, low quartering, tidal wading,
dabbling waterfowl, shore-water foraging, and aerial surface opportunism from
required capabilities, destination authority, travel media, observation
affordance, presentation signals, and one deliberately bounded daylight/rest
window. Current anonymous aquatic surface observation is selected only by the
generic conjunction of actor addressability, surface-opportunity capability,
and tidal-activity capability, and still requires terrain-occluded same-tick
sight of an occupied, active, depth-usable fish or crab anchor. The existing
gull is the useful counterexample: it may fly toward and circle that observed
area, then return by air to an authenticated habitat anchor to rest, without
acquiring aquatic locomotion, an aquatic-foraging role, aggregate pressure, a
species/count disclosure, or a private prey target. Immediate lawful threat,
alarm, pursuit, and physical-food intents continue to outrank neutral activity.

This convergence leaves outer save 15, habitat 7, aggregate schema 4, the
seventeen-record catalog, aggregate-unit totals, physical-item custody, and the
nearest-24 materialization ceiling unchanged. Its validation strategy is the
scalable one: abstraction and property checks, conservation, bounded
interaction-graph fuzzing, performance budgets, and a small set of
representative emergence witnesses rather than species fixtures or an N² pair
matrix. It closes only the bounded starting-harbor Wave-C integration seam.
Exact feature commit `4dacd99e95a018314d65a72183b82cba8583774f`
passed CI run `34074045801` and Pages run `34074045818`; the five cache-bypassed
live assets match the tested committed build byte-for-byte. It does not
complete worldwide Wave C or broader biodiversity work. Mortality, carcasses, harmful
attacks, live-prey capture or consumption, fishing, nesting, reproduction,
ecological cross-region migration, full circadian life, and a general
scent/sound/evidence system were absent from that release.

The **LIVE_VERIFIED** `0.3.3-alpha.23 — The Storehouse Door` release tests a ninth
scaling lesson without adding a species: settlement ecology should compose
existing physical custody, sensory projection, aggregate response, human
knowledge, and presentation owners rather than create a store-specific animal
simulation. One bounded starting-harbor store owns one stable physical
fresh-produce lot that is deliberately separate from abstract settlement food.
Its open door contributes source strength and packaging leakage; the existing
scent owner alone decides how wind, rain, distance, and uncertainty shape what
reaches the existing brown-rat aggregate. A matching attraction may relocate
one already-existing rat unit through ordinary aggregate policy, and only that
authenticated event can remove at most one exact physical produce unit. Rat
population remains conserved, while the physical lot's remaining quantity and
loss record remain exact across response, save, and reload.

The useful counterexample is the existing cat. Its lawfully visible presence
may pressure the rat aggregate through the same shared visual/trophic policy,
but the cat receives no rat-sign cognition, hidden rat knowledge, or new
investigation behavior. Likewise, Alpha 23's actual keeper secures the persistent
door only after an in-person player report; the shared kernel authenticates
direct keeper observations for later autonomous wiring. An unseen loss is
not reported merely because the player later returns. Outer save 16 adopts a
sealed version-15 world once while habitat 7 and aggregate schema 4 remain
unchanged. Confidence comes from shared abstraction checks, a bounded signed-
coordinate property sweep, exact item and aggregate conservation, deterministic
replay/migration, and one representative store-rat-visible-cat composition.
Existing shared fuzz and performance gates remain in regression rather than
expanding into an exhaustive species or pair matrix. Exact feature commit
`245997219eff02e4edcf75331dc7fd4850432efb` passed CI run `34080936761` and
Pages run `34080936748`; the five cache-bypassed live artifacts match the tested
local build byte-for-byte. This remains a bounded composition, not worldwide
store ecology, schedules, livestock, broad rumors, mortality, carcasses,
live-prey consumption, the full bestiary, or broader biodiversity completion.

The **LIVE_VERIFIED** `0.3.3-alpha.24 — The Yard Flock` release tests a tenth scaling
lesson: domestic species should reuse the Living Weft and add custody as a
relationship, not receive a private livestock simulation. Habitat version 8
keeps the entire version-7 ecology and tidal record as an exact prefix, then
appends one bounded yard anchor, two or three stable chicken actors, and one
stable flock. Settlement ecology version 2 ties those identities to the
starting harbor and existing keeper. Each bird continues through the ordinary
perception, attention, group, locomotion, materialization, item-opportunity,
and presentation owners.

This composition also tests physical conservation across two systems. Only an
authenticated custody member can receive the open store's exact food
opportunity. The bird must reach the shared structural-access area, then a
staged transaction removes exactly one unit from the existing physical lot.
Closed stock yields no belief or claim, failed/replayed ticks cannot duplicate
or reconsume the unit, and offscreen activity cannot become retrospective
player knowledge. Outer save 17 adopts sealed version 16 once and preserves all
earlier actor, group, aggregate, item, Promise, store, closure, loss, evidence,
and world-fact identity. Confidence again comes from shared invariants,
signed-coordinate properties, conservation, replay/migration attacks, bounded
performance, and one representative visible-yard witness—not a chicken-only
test suite or a species-pair matrix. Exact release commit
`4067ac4439bb6f624ed88f69eb09cc591b246741` passed CI run `34093027893` and
Pages run `34093027917`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested local production build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.25 — The Far Paddock` release tests an eleventh
scaling lesson: adding a domestic species should require a profile and a
bounded habitat/custody suffix, while conflicts remain properties of shared
owners. Habitat version 9 preserves the version-8 record exactly before adding
one separated pen, two goat individuals, and one persistent herd. Settlement
ecology version 3 generalizes custody into a bounded collection of typed homes
and rejects duplicate actor, group, relationship, home, or structure
authority. Outer save 18 preserves the older flock, coop, store, physical food,
actors, aggregates, items, and Promises before that additive migration.

The shared resource arbiter accepts only source-validated contenders, then
orders them by physical contact, current need, and stable identity. This avoids
both first-array-wins behavior and a goat-specific food exception. The goat
profile has no store-food capability; its future browse diet remains dormant
until living foliage supplies a real conserved resource. Evidence therefore
comes from signed-coordinate habitat properties, shared custody/group
invariants, migration and replay attacks, item conservation, bounded
performance, and representative runtime composition. It does not come from
testing goats against every existing animal, and it does not claim calls,
tracks, injury, mortality, carcasses, reproduction, schedules, herding,
guardian behavior, cross-region migration, worldwide livestock, full Wave D,
or broader biodiversity completion.

Exact release commit `29af7793346c0c3977a5ca727b79feb3a50b83bb` passed CI
run `34108539228` and Pages run `34108539255`; five cache-bypassed live
artifacts match the tested local production build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.26 — The Paddock Watch` release tests a twelfth
scaling lesson: a domestic job should be a persisted relationship over an
ordinary actor, not a second cognition system or a statistical livestock buff.
Exactly one separate seed-stable dog keeps the existing dog actor's needs,
condition, exposure, perception, intent, and self-preservation. Its kennel is a
third settlement custody, while a generic working-animal assignment records the
existing keeper as handler, the dog's custody, the protected goat custody and
herd, the pen worksite, and one exact current or pending activity.

The perception boundary now accepts bounded species-neutral external
participants and uses a deterministic local candidate index. Work may consume
only canonical cognition: an anonymous alarm contributes its observation ID
and uncertain area, never the hidden emitter or target. Investigation, escape,
and return reuse shared locomotion, and actor-owned retreat, shelter, avoidance,
rest, welfare, or an inaccessible route can defer duty. Save staging and crash
recovery commit the accepted transition exactly once. Direct-detail Chart,
Relief, and ABOUT may show only current observable activity.

The representative emergence proof is intentionally causal rather than
guaranteed. A rabbit alarm can recruit the dog toward perceived space; the fox
continues until it actually sees the dog, after which shared appraisal can
redirect it. No guardian aura, attack, injury, death, herding, bark, or remote
livestock knowledge is implied. Outer save 19 and settlement ecology 4 adopt a
sealed version-18 Far Paddock state while habitat 9 and aggregate ecology 4
remain unchanged. Evidence comes from shared assignment/perception/locomotion,
conservation, signed-world, migration/replay, bounded-performance, runtime, and
emergence invariants—not one test for each species or pair. Exact release
commit `e3aae174d962ec609b9463e40320227237c9fa1f` passed CI run `34143286763`
and Pages run `34143286720`; five cache-bypassed live artifacts match the
tested local production build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.27 — The Watch Returns` tests a thirteenth
scaling lesson: work needs a small lawful lifecycle, not a handler-specific
brain or an ever-growing activity log. The existing guardian's committed
investigation opens one bounded task around its source observation, uncertain
area, and deterministic shared-locomotion probe. Completion is physical probe
arrival, not discovery of a hidden emitter or proof that danger disappeared.
The same task then returns physically to the existing pen and closes only after
current handler sight acknowledges arrival.

Handler influence is information-constrained. The keeper's narrow
outside-duty recall can cancel investigation only when dog and keeper hold
fresh reciprocal identified visual beliefs; an occluded or unloaded dog
creates no remote command. Actor intent and welfare can suspend and resume work
without manufacturing an outcome. One exact-once transition contract covers
open, suspend, resume, complete, cancel, arrive, and acknowledge, while the save
retains only one current task, one pending transition, and one latest result.

This release adds no species, herding, separated-livestock search or rescue,
full schedule, autonomous kennel routine, attack, injury, mortality, carcass,
player command, or guaranteed defense. Validation is deliberately concentrated
on shared lifecycle, perception, locomotion, welfare, migration/replay,
conservation, signed-world, and bounded-performance invariants plus
representative runtime emergence—not a bespoke test for every species or pair.
Exact gameplay commit `f2c55413c64a8e6b8e3cc1fab06e50252df2399f` and public
attestation commit `6a5bc4352edb39b47ee2216ca01a1506f01419cb` passed final CI
`34160098140` and Pages `34160098112`; five cache-bypassed live artifacts match
the tested production build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.28 — The Missing Goat` release tests a
fourteenth scaling lesson: a recovery story should compose existing identity,
group, perception, locomotion, custody, home, and work owners rather than add a
goat-specific rescue brain. An exact in-frame split needs both a current caused
flee/retreat and real separation; distance alone is not a cause. Regroup
requires current identified peer sight, while danger and physiology remain
authoritative. The keeper must lawfully notice an absence before an explicit
last-known-area report can recruit the existing guardian. Search is an action,
not proof of finding.

The same exact bodies may physically rejoin. Current caretaker sight of every
member in the pen confirms closure; an already-known case can consume an
authenticated coarse reunion transition without inventing that sight. Treating
each social group as an indivisible materialization-cap unit prevents partial
groups from acquiring mismatched presentation and cognition. Fully coarse
members preserve identity and topology but gain no local senses or movement.
The new persistence surface is bounded to one case, one pending transaction,
and one latest result under an empty version-1 root and exact outer-v20-to-v21
adoption.

This closes only one starting-harbor Wave-D integration seam. It does not add
herding, complete schedules or home routines, guaranteed recovery, a remote
marker or player search command, attack, injury, mortality, carcasses, calls,
tracks, or full cross-region ecology. Confidence remains centered on shared
invariants, deterministic properties, migration/replay, bounded performance,
and representative emergence—not per-species or N² interaction tests.

Exact gameplay/release/main commit
`60c9bc34ac871425e5319c8369e715751b5d1c44` passed feature CI
`34174876320`, main CI `34175693435`, and Pages `34175693447`. The local gate
passed TypeScript, public-boundary and player-facing-sync checks, 220 test files
and 2,111 checks, a five-asset 3,284,606-byte served web build, a 10-entry
3,476,214-byte runtime-only Electron ASAR inspection, desktop/mobile/title
smoke, and clean invariant, save, and visual audits. The first cache-bypassed
five-file live comparison matched the tested build exactly.

The **LIVE_VERIFIED** `0.3.3-alpha.29 — What Remains` release tests a
fifteenth scaling lesson: harmful interaction and aftermath should compose
current perception, pursuit, exact contact, population conservation, physical
resources, and shared movement instead of adding a fox-only kill script or a
death-time loot table. Only an already-pursuing marsh fox that currently
identifies and physically contacts its exact marsh rabbit can resolve damage.
One death retires that actor once, removes one population unit, preserves any
other represented units as abstract reserve, and leaves one stable finite body.

The same ordinary vision and reach owners let a fox or fish crow discover and
approach that body. Exclusive claim and one-unit consumption conserve its
finite resource, while a fox may guard it. Chart, Relief, and EVENTS project
only bodies and events the player currently perceives; offscreen death,
feeding, attacker identity, cause, claimant, and remaining resource never
become retrospective narration. Group-member mortality fails closed, and the
slice does not claim broader attacks, mortality, population recovery,
decomposition, body movement or harvesting, scent, insects, worldwide ecology,
or later Wave-E species.

Exact gameplay commit `a0f7b571cf6068c41397ad0b8767347b04b24ac1`
passed feature CI `34187159628`, main CI `34187706800`, and Pages
`34187706784`. The release gate passed TypeScript, public-boundary and
player-facing-sync checks, 224 test files and 2,143 checks, a five-asset
3,323,332-byte served web build, a 10-entry 3,514,940-byte runtime-only
Electron ASAR inspection, desktop/mobile/title smoke, and clean invariant,
save, release-surface, and visual audits. The first cache-bypassed five-file
live comparison matched the tested build exactly.

The `0.3.3-alpha.30 — Beyond the Harbor` release is **LIVE_VERIFIED**. Its scaling lesson is that regional
biodiversity should add a bounded habitat source and parameterized species
records, not copy an animal-specific simulation. One deterministic remote
temperate-upland/forest-edge source adds wild boar, elk, and gray wolf as
`SOUNDER`, `HERD`, and `PACK` members through shared perception, locomotion,
group, materialization, and knowledge-honest Chart/Relief/ABOUT owners. Wolf
pursuit remains nonlethal pressure unless the wolf reaches exact contact with
an eligible solitary addressable marsh rabbit; grouped elk, deer, and all group
members cannot be harmed. A boar or wolf can see, reach, claim, and consume an
existing finite body, and a wolf may guard its claim. Habitat 10 and outer save 23 preserve the
complete habitat-9 and version-22 body-bearing state before exact append-only
adoption. Representative/property, conservation, and bounded-performance
checks cover the shared abstractions. Voice patterns remain inaudible
foundation data, dog interaction is an intentional unimplemented no-response,
and tactical pack combat, group mortality, cougar, additional bear ecotypes,
worldwide ecology, and full Wave E remain outside the release.

Exact gameplay commit `56dc4812c7c41b6227bae1b0273701b51076f34a` passed
feature CI `34215120610` and Pages `34216318509`. Verification-only descendant
`65e2ba59929a296139e578adbd03621f91d93fc2` raises the CI and Pages job
ceilings plus one slow integration-test allowance without changing production
code or artifacts; it passed main CI `34221064966` and Pages `34221064916`.
The complete local
gate passed TypeScript, public-boundary and player-facing-sync checks, 227 test
files and 2,177 checks, a five-asset 3,365,373-byte served
web build, a 10-entry 3,556,981-byte runtime-only Electron ASAR inspection,
desktop/mobile/title smoke, and clean invariant, save, release-surface, and
visual audits. A cache-bypassed live comparison matched all five production
files byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.31 — High Country Shadows` release tests the next
scaling step: add two behaviorally distinct solitary predators without adding
two private controllers. Cougar and brown bear append to the exact existing
remote source through habitat version 11 and the twenty-four-record catalog.
Both reuse stable habitat-population records and, where carrying capacity
supports them, persistent individual identity, current direct perception,
attention, actor-owned locomotion, nearest-24 materialization, physical-body
claims, knowledge-honest dual-view presentation, and persistence. Cougar alone
uses a short direct-sight pursuit and may reach the current mortality kernel
only through exact contact with a currently identified solitary addressable
marsh rabbit. Brown bear has no live-prey pursuit or harmful contact. Either
may see, reach, claim, guard, and consume an already-existing finite body.

This unit is also a compatibility experiment. Habitat 11 must reproduce the
entire habitat-10 remote source and population sequence exactly—including the
existing trio's pressure and trend—before it evaluates two new population
records and appends only supported populations. Outer
save 24 must authenticate and adopt sealed version 23 once without changing
actors, groups, mortality, bodies, claims, consumption, or world facts.
Shared/property and signed-region checks, conservation, bounded performance,
and one representative predator/scavenger chain give more useful confidence
than multiplying per-species fixtures or building an N² interaction matrix.
The unit deliberately adds no group, track evidence, audible voice,
species-specific dog-directed behavior, player/human/group harm, broader
mortality, ecological migration, or worldwide distribution. Ordinary lawful
large-predator perception may still produce a non-harmful dog or porter
reaction through the shared cognition architecture. Exact gameplay commit
`d124f71c1c8656db68a764d048c9a1e5d14163a7` passed feature CI
`34241221388`, main CI `34243147747`, and Pages `34243147753`; the complete
local gate passed 230 files / 2,197 tests, the five served artifacts totaled
3,394,874 bytes, the 10-entry runtime-only Electron ASAR totaled 3,586,482
bytes, desktop/mobile/title smoke passed, and the cache-bypassed live
comparison matched 5/5 files byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.32 — Open Country Ledger` release tests
distribution rather than adding species. Existing wild populations derive
from the world seed, signed region
and territory identity, terrain, capacity, food or prey support, and density
budgets; empty results and unused capacity are legitimate. Large-ranging
species use one floor-correct host region. The starting settlement remains a
separate home owner with bounded rats and anchored chicken/goat populations,
while its free-ranging cat is habitat-optional.

The anti-clustering claim is measured before presentation. For the fixed
32-seed fresh-start corpus, the acceptance ceilings for wild individual
candidates are p50 6, p95 9, and hard maximum 10; the observed values are p50
1, p95 8, and maximum 9. Further acceptance ceilings hold all home and wild
candidates to a hard maximum of 18, aggregate anchors to p95 10 and hard
maximum 12, and large predators to no more than one population per initial
frame with at least half the starts predator-free. A separate fixed 64-root
signed/extreme corpus requires both honest empty and occupied wild roots, at
least 56 predator-free roots, no universally present wild species, and
repeat/input/cache/camera-order identity; its observed occupancy is 38/64
empty and 26/64 occupied. These are authoritative pre-cap acceptance and
observed measures, not a claim based on drawing fewer animals.

The release also tests ownership at seams. Lineage is separate from current
residence; all active owners share one group-atomic stable-distance top-K of 24
actors and one root-wide pre-step snapshot. Current visual, anonymous tidal-
activity, and alarm perception can cross an owner boundary without source-order
dependence. The pre-existing narrow mortality example can do so only when a
marsh fox, gray wolf, or cougar exactly contacts a currently identified eligible
solitary marsh rabbit; the victim owner commits the one retirement and conserved
body. Pristine regional baselines are
rederived while only deviations persist.

Outer save 25 authenticates normalized v24 once and records one deterministic,
group-atomic retain, redistribute, or explicit non-death-retire disposition.
It conserves actor and population identity, group topology, history, mortality,
bodies, items, cargo, Promises, and cross-owner references. This remains the
bounded 24-record catalog, not worldwide species breadth, ecological migration
behavior, reproduction, population recovery, general tactical mortality,
complete scent tracking, or the full bestiary.

Exact gameplay commit `29a745edbeda4dba7d2b8b3f4463f42e91a356fa`
passed feature CI
`34333446897`, main CI `34338398784`, and Pages `34338398816`. The complete
release gate passed all checks and audits across 241 test files and 2,274
tests, a five-file 3,551,649-byte served web build, a 10-entry 3,743,257-byte
runtime-only Electron ASAR, and desktop/mobile/title smoke. A cache-bypassed
live comparison matched all 5/5 production files exactly.

The **LIVE_VERIFIED** `0.3.3-alpha.33 — Talus and Sky` release tests the
next scaling hypothesis: a new ecological domain should be an authenticated
sparse sibling around frozen lineage, not a reason to rewrite the prior
regional owner. Its twenty-seven-record catalog preserves all twenty-four
Alpha32 records as an exact prefix, then appends mountain goat, American pika,
and golden eagle. `RegionalEcologyStateV2` retains the exact version-1 child and
adds a separate Alpine root and hot snapshots, while outer save 26 records one
v25 adoption. This makes rollback, migration, and cross-owner invariants easier
to reason about than a broad in-place schema rewrite.

The trio is deliberately a representation experiment. A mountain goat is an
addressable individual in an atomic `HERD`, a pika population is a conserved
non-addressable talus aggregate, and a golden eagle is one solitary
addressable actor. The same catalog can therefore describe morphology and
ecological role without demanding identical simulation cost or pretending
every animal is a clickable body. Pika haypiles, talus signs, and bounded
activity are honest evidence; they do not disclose a hidden census or create
an exact prey target.

The useful emergence witness is small and causal. The existing visual
stimulus, terrain line-of-sight, role/capability, and aggregate-response owners
let a lawfully visible eagle nonlethally quiet or redistribute current pika
activity. Putting a ridge between source and occupied anchor removes that
pressure. Population units remain conserved, and there is no capture, injury,
death, or carcass. This shows why one representative occluded/unoccluded chain
is more valuable than multiplying eagle×pika fixtures or constructing an N²
species matrix.

Terrain adaptation also remains compositional. The common path surface accepts
optional directed edge-grade authority; mountain goat opts in, while every
frozen-prefix species keeps the Alpha32 cost shape. Golden eagle plugs into a
generic `ridge-soar-perch` affordance whose ridge candidates are authenticated
from canonical terrain. Relief's lifted, flapping, banking eagle is a
state-based visualization of that activity, not evidence for authoritative
continuous 3D flight physics.

The performance lesson is that derived authority may be memoized only after
its provenance is stable. The release bounds immutable Alpine habitat cache
entries by seed/region and ridge activity by habitat/patch/actor, always
authenticates caller-supplied terrain, excludes cache contents from saves, and
keeps hashes independent of cache order. A local audit measured six cold
regional habitats at roughly 889 ms and six cold Alpine habitats at roughly
273 ms, while 22 repeated habitat requests collapsed to six derivation misses;
a representative runtime moved from roughly 2.47 s cold to 151 ms warm, with
save staging around 40–52 ms. These figures are diagnostic evidence for the
cache seam, not cross-device promises and not live-release evidence.

Talus and Sky remains the first bounded Alpine slice. It does not add new
mortality, exact pika targeting, live-prey capture, reproduction, audible
Living Voice, tactical combat, polar breadth, worldwide ecology, Wave-F
completion, or a complete bestiary.

Exact gameplay commit `2a9ade01329fa731931a1cfe1884f5269ff59bcd`
passed feature CI `34394901344`, main CI `34400426580`, and Pages
`34400426443`. The complete release gate passed TypeScript, public-boundary and
player-facing-sync checks, 252 test files and 2,343 checks, a five-file
3,649,061-byte served web build, inspection of a 10-entry 3,840,669-byte
runtime-only Electron ASAR, desktop/mobile/title smoke, and clean invariant,
save, release-surface, performance, and visual audits. A cache-bypassed
comparison matched all 5/5 live production files byte-for-byte.

The **preserved internal Alpha34 checkpoint, cumulatively released only through
Alpha39**, `0.3.3-alpha.34 — Coldwater Glint`, tests the next narrow scaling
question. It keeps
all 27 Alpha33 catalog records as an exact compatibility prefix and appends
Atlantic capelin as record 28. Capelin occur only where a separate deterministic
cold, saline polar-shore habitat admits them; lawful absence remains common.
Floor-correct signed territory derivation computes mathematical bounds before
independently clamping each axis, preserving one host and stable membership at
negative, corner, and coordinate-limit regions.

The representation choice is the main cost-control result. A supported habitat
owns one capelin school of up to 64 units over no more than four tide-safe
anchors, but no unit becomes an addressable actor or exact fish target. The
adapter delegates
depth, usable-anchor selection, cadence movement, activity, and pressure to the
generic tidal aggregate/Tide Table owners. Exact conservation survives
continuous stepping, runtime-order dormant reconciliation, long absence, save,
reload, and re-entry without creating a second tide or evidence authority.

The representative emergence proof reuses an existing gull rather than adding
a capelin-specific observer. With current unobstructed vision, it receives only
anonymous aquatic-activity evidence and the shared stimulus/small-world policy
may move at most one conserved unit. Intervening ridge terrain removes both
observation and pressure. Replay and input/source permutations agree, and no
individual fish, capture, injury, death, carcass, cargo mutation, or item
transaction appears. This is architecture-level evidence for cross-owner
composition, not a new species-pair matrix.

`RegionalEcologyStateV3` wraps the exact V2 base-and-Alpine child beside one
sparse polar-shore sibling, while outer save 27 authenticates and adopts a
sealed v26 child exactly once. All sources enter one insertion-order-independent,
group-atomic 24-addressable-actor plan and commit globally or not at all; the
school consumes no actor slot. Pristine or merely observed polar regions are
rederived rather than serialized, bounded habitat caches remain non-authoritative,
and active-key prefiltering rejects absent/non-host regions without scanning
explored history or reconciling unrelated dormant deltas. The result keeps
storage and hot-path work tied to genuine active deviations rather than the
size of the infinite world.

Coldwater Glint deliberately adds no Arctic fox, polar bear, seal, new seabird,
snow or ice behavior, mortality, live-prey capture, reproduction, audible
Living Voice, or Wave-F completion. Alpha34 was never a standalone public or
LIVE_VERIFIED release; this checkpoint is preserved as cumulative lineage in
the Alpha39 release.

The preserved internal Alpha35 checkpoint adds one Arctic fox only where
that authenticated capelin substrate overlaps suitable all-tide-dry cold shore.
It deliberately treats the fox as an ordinary solitary actor using shared
identity, perception, attention, locomotion, evidence, ABOUT, rendering, sparse
regional persistence, and aggregate-pressure owners. Its representative witness
is intentionally narrow: current direct sight may pressure the conserved school,
while an occluding ridge removes both knowledge and response. No exact fish,
capture, consumption, mortality, or physical body is inferred.

The **preserved internal Alpha36 checkpoint, cumulatively released only through
Alpha39**, `0.3.3-alpha.36 — Breath Between Tides`,
tests the final bounded Wave-F role combination: one addressable harbor seal and
one rarer polar bear over the exact existing capelin/cold-shore chain. NOAA
describes harbor seals using rocks, reefs, beaches, and glacial ice as haulouts
and feeding on fish, shellfish, and crustaceans; that supports an open-coast
water-plus-dry-haulout abstraction without requiring a sea-ice simulation.
[NOAA Fisheries — Harbor Seal](https://www.fisheries.noaa.gov/species/harbor-seal)

The polar-bear dependency is deliberately prey-backed rather than decorative.
Canada's status assessment records harbour seals among polar-bear prey in parts
of their range, and Ontario's recovery strategy reports harbour seal as a
meaningful secondary prey item in Southern Hudson Bay. TIDEWEFT therefore
admits the rarer bear only after the same source already admits the exact seal
candidate. This is an ecological-design inference from those sources, not a
claim that harbor seals replace ringed seals across polar-bear ecology.
[Government of Canada — Polar Bear status report (2018)](https://www.canada.ca/en/environment-climate-change/services/species-risk-public-registry/cosewic-assessments-status-reports/polar-bear-2018.html)
[Government of Canada — Polar Bear recovery strategy for Ontario](https://www.canada.ca/en/environment-climate-change/services/species-risk-public-registry/recovery-strategies/polar-bear-ontario-2011.html)

The seal receives one authenticated foraging-water/dry-haulout pair through the
same shore-water activity and amphibious pathing abstractions used by the river
otter. The bear uses shared individual cognition, amphibious traversability, and
role-based live-prey pursuit. In the representative emergence chain, a visible
seal can create conserved nonlethal pressure on capelin; the visible bear can
pursue the seal; and the seal can flee. Terrain occlusion removes both chains.
Neither species gains contact, capture, consumption, injury, mortality, body,
player-harm, dog-harm, or cargo authority in this slice.

`RegionalEcologyStateV5` retains the exact V4/v28 ecology state as a child and
adds one sparse polar-consumer sibling. Outer save v29 adopts an authenticated
v28 child exactly once. All five ecology layers still enter one insertion-order-
independent, group-atomic plan capped at 24 addressable actors and one atomic
commit. The two new actors therefore prove another reusable role composition;
they do not receive a private visibility budget or a species-local controller.
Passing this slice closes the directive's bounded Wave-F role checklist and
opens Wave G breadth, but it does not itself add sea ice, snow, reproduction,
population recovery, full scent, audible Living Voice, worldwide polar ecology,
or the 45-profile core-wildlife closure target. Alpha36 was never a standalone
LIVE_VERIFIED release; it is preserved as cumulative lineage in Alpha39.

The **preserved internal Alpha37 checkpoint, cumulatively released only through
Alpha39**, `0.3.3-alpha.37 — Estuary Surface Break`, opens Wave G with one
coherent five-profile estuary cohort. It preserves the exact 31-record
Alpha36/`RegionalEcologyStateV5`/outer-v29 child and appends bay anchovy,
Atlantic ghost crab, great blue heron, common tern, and osprey as records 32–36
through one sparse append-only breadth root. Terrain, salinity, shore distance,
carrying capacity, territory, density, regional quiet, and exact anchovy prey
support decide admission; an eligible-looking region can remain empty.

The representation boundary stays ecological rather than cosmetic. Anchovies
and ghost crabs remain conserved non-addressable aggregates. Heron and osprey
are solitary persistent individuals, and two to four common terns form one
group-atomic flock. Tide changes the usable anchovy schooling water and
ghost-crab flat activity without changing identity or total units. Great blue
heron uses a new shared `anchored-wader` activity profile tied to one
authenticated tide-depth-safe wading ground; common tern and osprey reuse the
existing air-only surface-opportunity/rest profile. Immediate danger still
preempts these bounded daylight/rest routines. They are not capture, feeding,
full circadian behavior, or continuously simulated 3D flight.

The first Alpha37 emergence witness is intentionally representative rather
than species-pair exhaustive. A common tern with clear current line of sight can
apply bounded nonlethal pressure to an occupied anchovy anchor; an intervening
ridge removes the observation and response. Both branches conserve every
anchovy unit and create no exact fish, capture, consumption, injury, mortality,
body, item, cargo, player, or dog outcome. `RegionalEcologyStateV6` retains the
exact V5 child beside the breadth root, and outer save v30 adopts one sealed
outer-v29 Alpha36 save exactly once. This was an internal checkpoint, not a
standalone public release; its lineage and the later Wave-G performance and
seamless actor-crossing closure proofs ship cumulatively in Alpha39.

The **preserved internal Alpha38 checkpoint, cumulatively released only through
Alpha39**, `0.3.3-alpha.38 — Marsh Channel Web`, preserves that exact 36-record
catalog and epoch-1 breadth prefix, then appends Atlantic menhaden, mummichog,
grass shrimp, blue crab, greater yellowlegs, belted kingfisher, and double-
crested cormorant as records 37–43 through breadth epoch 2. The first four are
conserved non-addressable aggregates. Yellowlegs form one group-atomic flock of
two to four, the kingfisher is solitary, and cormorants form one group-atomic
flock of two to three.

Admission remains ecological: signed terrain, salinity, channel and shore
structure, water depth, tide, carrying capacity, territory, density, regional
quiet, and exact local substrate must agree. Yellowlegs depend on grass shrimp,
kingfishers on mummichog, and cormorants on menhaden. Shared aggregate and Tide
Table policy conserves every unit, while the three birds reuse authenticated
wading, surface-opportunity, perch, diving-waterbird, perception, locomotion,
group, ABOUT, and dual-view presentation owners. Immediate danger still wins.

The representative Alpha38 witness remains intentionally architectural rather
than exhaustive: clear current sight allows bounded nonlethal cormorant
pressure on an occupied menhaden anchor, while an intervening ridge removes the
observation and response. No exact prey, capture, consumption, injury,
mortality, body, item, cargo, player, or dog result is created. Outer save v30
and `RegionalEcologyStateV6` remain unchanged. An authenticated epoch-1 state
appends epoch 2 exactly once at its saved tick, preserving its complete prefix;
an already-current load is a no-op.

Alpha38 reaches 41 core-wildlife profiles / 43 total living records. One final
coherent four-profile cohort reaches the 45 / 47 catalog boundary. Alpha38 was
never a standalone public or LIVE_VERIFIED release; it is preserved in the
Alpha39 lineage. Sound, capture/consumption, new mortality/bodies,
reproduction, full circadian life, and continuously simulated 3D flight were
later-owner work at that Alpha38 checkpoint.

The **LIVE_VERIFIED** `0.3.3-alpha.39 — Saltmarsh Small Worlds` release preserves the exact
forty-three-record Alpha38 catalog and both earlier breadth epochs, then appends
eastern saltmarsh mosquito, marsh periwinkle, seaside sparrow, and diamondback
terrapin as records 44–47 through epoch 3. Mosquitoes and periwinkles remain
conserved non-addressable aggregates over no more than two authenticated
anchors each. Seaside sparrows form one group-atomic flock of two to four; the
terrapin is solitary. Sparrow admission depends on the exact local mosquito
substrate and terrapin admission on periwinkle. Terrain, salinity, marsh
structure, depth, tide, capacity, territory, density, and regional quiet can
therefore leave plausible-looking country lawfully empty.

The cohort adds no species-local controller. Sparrows reuse shared perch-forage
activity and the terrapin reuses shared amphibious-margin activity, alongside
the existing identity, perception, movement, grouping, aggregation,
persistence, knowledge, and presentation owners. A representative current-sight
terrapin/periwinkle witness proves bounded nonlethal pressure and a ridge-
occluded negative branch while conserving every unit. Aggregate evidence stays
anonymous; no exact insect or snail actor is manufactured.

Outer save v30 and `RegionalEcologyStateV6` remain unchanged. An authenticated
epoch-2 state appends epoch 3 once at its saved tick, preserves both earlier
epochs and every real deviation as an exact prefix, and cannot reroll on reload.
All layers remain under one group-atomic 24-addressable-actor cap and atomic
conservation commit. Shared performance and seamless-crossing closure coverage
tests the architecture as a whole instead of every species and pair.

Alpha39 reaches the chosen Directive 04_1 boundary of 45 core-wildlife profiles
/ 47 total living records. Exact gameplay commit
`40bfeebde94729ffb1034764ffba3e18100ac1fc` and release/test-correction head
`c67f30b10066f60372d2cf84e1e6eacae1cbd31f` passed main CI `34905718204` and
Pages `34905718214`: 275 test files / 2,633 tests passed, and a cache-bypassed
comparison matched all 5/5 live production files exactly. Gameplay contract 37,
Field Manual 49, outer save v30, and `RegionalEcologyStateV6` were the released
authority at that historical checkpoint. This closed bounded Directive 04_1.
At that boundary Alpha39 added no bite or disease, capture or consumption, new
mortality or bodies, reproduction, sound/Living Voice, bounded Turning Day
daily life, or continuous 3D flight, and it authorized 04_1A The Turning Day.

### Broad pressure needs an explicit physical capability — 2026-10-03

The current unpublished Living Voice producer audit found that `predator`
without `small-predator` was sufficient to classify every subject as
`large-predator`. That also classified golden eagle, great blue heron, osprey
and double-crested cormorant as broad threats to people, dogs and goats. The
existing tests rejected those birds' pursuit of large prey but did not test
the inverse visual classification.

New characterization tests in `coreEcologyTrophic.test.ts` and
`coreEcologyPerception.test.ts` first failed on that exact classification. The
shared runtime-policy correction makes `large-predator-pressure` explicit for
the five currently applicable broad mammals; it is not inferred from diet,
pursuit or edible body yield. Ordinary sight of an aquatic bird remains lawful
identity instead of manufactured danger, and a goat does not alarm from that
contact. Bear pressure, aquatic aggregate pressure, crow/aerial relations and
small-prey pressure remain covered. The 12-file affected ecology set passed
229 tests; maintained critical smoke passed 105 tests. These are local source/
perception proofs, not a new public release or proof of an ordinary goat/bear
travel encounter. Generation, mortality, saved schema and dependencies are
unchanged; no complete cumulative, hardware or performance claim is made here.

### A complete day is a distributed invariant, not a scripted showcase

The **LIVE_VERIFIED** `0.3.3-alpha.53 — The Turning Day` release establishes the
next scaling conclusion: one deterministic fixed-step civil day must remain the
authority for outdoor light, WAIT, REST, SLEEP, human routines, dog continuity,
and wildlife rhythms. Separate UI, player, human, and species clocks would make
reload, frame-rate independence, interruption, and streaming disagree. The
released composition instead carries all 42 current humans, the
relationship-bearing settlement working dog, and the 17 current addressable
wildlife activity profiles through the same day/dusk/night/dawn authority while
physical arrival, work, travel, danger, weather, needs, watch/search, and lawful
strong disturbance retain priority.

The proof is deliberately distributed across production owners. Direct
witnesses establish exact WAIT results under distinct presented-frame cadences
and interruption by a lawfully heard alarm at its committed boundary. A bounded
three-day / 4,320-tick direct production-owner harness projects every current
resident, carries one real activity-bound Alpine golden eagle through daily
world serialization, restored regional-ecology continuation, and source
dematerialization/rematerialization alongside the
production dormant/coarse paths, and bounds save growth. It is not a
whole-runtime, all-wildlife, working-dog, or archived-v1 soak. Packaged witnesses
exercise the same clock and real REST path across desktop Chart/Relief and
mobile Relief while holding Title and Quiet Hour still. Together these shared
representative invariants prove one causal day more honestly than a monolithic
all-species tableau or an N² routine matrix.

That conclusion remains scoped. Alpha40–52 are internal cumulative milestones,
not independent releases. The existing settlement working dog is the
relationship-bearing continuity witness, not a bonded player companion; the
independent dog's shelter/routine, physical interiors, seasons, and broader
routines remain later work. Packaged timing is a regression/liveness floor, not
universal low-end certification.

Exact feature commit `a419f774260292331e8c93ebc65ee3fd5125f7c3` is preserved
beneath validation-only descendants `f6a8816`, `e3fe15d`, and
`da4a75f2eae7c14b2d05f5c89178788d0005aba4`. CI `35375612294` passed 290
test files / 2,791 tests and the production build; Pages `35375612200` deployed
that same final executable SHA, and a cache-bypassed comparison matched all 5/5 live
production files in the exact 4,251,968-byte web artifact. At that historical
released boundary, outer save v32, gameplay contract 51, and Field Manual 63
were current; simulation v4,
`RegionalEcologyStateV6`, and wildlife actor v1 remain unchanged. Directive
04_1A is complete.

The **LIVE_VERIFIED** `0.3.3-alpha.60 — The Breathing Room` release closes
Directive 04_1B. Bounded exact-match reuse removes repeated authenticated
ecology, projection, serialization, terrain-submission, traversal-query, and
stable-HUD work while complete canonical fallbacks preserve the same
deterministic world truth. Exact executable, source, and pushed commit
`c78977ba9733dbb17a1f2461a0a94c5dcdfc1fd0` passed CI `36442886220`; Pages
`36442886243` deployed it, and a cache-bypassed comparison matched all 5/5
production files in the exact 4,377,380-byte web artifact.

This evidence establishes restored headroom on the tested host and scenes, not
universal 60 FPS or broad low-power certification. Periodic worst-frame gaps
remain visible, and the measurements retain their documented host, platform,
view, seed, and resource-observation limits. The bounded reuse preserves truth;
it does not weaken simulation authority. Directive 04_1B is closed, and 04_2
**The Living Voice** is active in the local unpublished candidate.

Design implication: future species breadth and settlement ecology should
expand this aggregate/representative, physical-custody, domestic-custody,
working-relationship, recovery, knowledge, mortality/body, and shared-policy
boundary rather than multiplying full actors or one-off detection hooks.
Ecological confidence should come from shared invariants, property checks,
bounded interaction-graph fuzzing, conservation, performance budgets, and a
small set of representative witnesses—not a brittle species-by-species or N²
matrix of bespoke animal-pair tests. Alpha 18 is the verified bounded
starting-harbor closure, Alpha 19 is the verified first bounded tidal unit,
Alpha 20 is the verified second bounded tidal unit, Alpha 21 is the verified
final bounded starting-harbor role slice, Alpha 22 is the verified bounded
integration closure across those roles, Alpha 23 is the verified storehouse
composition, Alpha 24 is the verified Yard Flock release, Alpha 25 is the
verified Far Paddock release, Alpha 26 is the verified Paddock Watch release,
Alpha 27 is the verified bounded work-lifecycle extension, Alpha 28 is the
verified bounded recovery-composition release, Alpha 29 is the verified first
one-life/one-body mortality release, Alpha 30 is the verified first Wave-E
regional breadth release, Alpha 31 is the verified solitary-predator append,
Alpha 32 is the verified signed-region distribution closure for its frozen
24-record prefix, and Alpha 33 is the verified first bounded Alpine/Wave-F
slice, extending the catalog to 27 records through a separate sparse sibling.
Alpha34–36 are preserved internal polar-shore, cold-shore, and polar-consumer
checkpoints extending that lineage to 31 records. Alpha37 is the preserved
internal first Wave-G breadth checkpoint at 34 core-wildlife profiles / 36
living records, and Alpha38 is the preserved internal epoch-2 checkpoint at
41 / 43. None was a standalone LIVE_VERIFIED release. Alpha39 cumulatively
shipped that exact lineage as the historical LIVE_VERIFIED Directive 04_1
biodiversity closure at 45 / 47 through epoch 3 without quota padding.
Alpha40–52 are the internal cumulative daily-life milestones; none was an
independent release. Alpha53 cumulatively shipped their lineage as the
historical LIVE_VERIFIED Turning Day closure. Alpha60 is the current
LIVE_VERIFIED release.

Those biodiversity checkpoints did not complete broader aquatic or settlement
ecology, broad attacks or mortality, population recovery, decomposition, body
transport or harvesting, complete scent, worldwide species breadth, or the full
bestiary. Turning Day closes only its stated 42-human, relationship-bearing
working-dog, and 17-addressable-wildlife routine boundary. Broader species,
reproduction, ecological migration, independent-dog shelter/routine, bonded
companionship, physical interiors, seasons, broader routines, wider settlement
ecology, and wider sound/evidence tracking still require their own authoritative
owners. Alpha39's shared performance and seamless-crossing evidence closed
Directive 04_1; Alpha53's distributed production evidence closed Directive
04_1A; and Alpha60's bounded exact-reuse and exact-release evidence closes
Directive 04_1B. 04_2 **The Living Voice** is active in the local unpublished
candidate and is not part of that public release.

- Dwarf Fortress demonstrates that legible remembered events, relationships, loyalties, and consequences across sites can create depth without those details being the player's direct job. [Bay 12 development roadmap](https://bay12games.com/dwarves/dev.html)
- Factorio's transport design shows why constrained logistics and topology create problems worth solving, and why automating a genuinely solved route prevents the core loop becoming chores. [Factorio Friday Facts 224](https://www.factorio.com/blog/post/fff-224)
- The strand idea is strongest when assistance is embedded in ordinary terrain use. The official Death Stranding guide frames this as a gentle connection through infrastructure left for others. TIDEWEFT applies the principle to simulated communities and the player's own previous traces, without pretending NPC contributions are real people. [Kojima Productions beginner's guide](https://www.kojimaproductions.jp/index.php/en/death-stranding-directors-cut-beginners-guide)
- Weak ties can bridge otherwise separated groups. In game terms, a small connection between culturally or economically different settlements may create more new knowledge and resilience than repeatedly maximizing one hub. [Stanford — The Strength of Weak Ties](https://inequality.stanford.edu/publications/media/details/strength-weak-ties-0)

The resulting design treats network topology as the authored fortress: hubs provide efficiency, loops provide resilience, and every specialization creates a dependency that the player can understand and reshape.
