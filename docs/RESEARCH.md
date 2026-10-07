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
