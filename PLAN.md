# TIDEWEFT build ledger

This is the living checkpoint plan for the long-running build. Completed phase records describe running behavior; expansion ideas remain explicitly separate so the ledger can be rewritten after evidence rather than treated as a wish list.

## Goal contract

Build an original, systemic but approachable strand-type simulation that runs as a static p5.js website and a secure Electron desktop app. It is done when a new player can understand the loop, complete imperfect deliveries, alter a living world, save and resume, and reach a satisfying network-restoration arc; deterministic checks and both production targets must pass.

The game should feel restorative after a long day. It rewards competence, autonomy, connection, and closure without daily chores, paid/random rewards, streak pressure, offline decay, or irreversible early mistakes.

## Current release checkpoint

The playable vertical slice now contains the full core arc:

```text
shortage / sourced fact
          ↓
player journey and exact trace
          ↓
inventory + trust + project + route consequence
          ↓
active graph and autonomous multi-hop porters
          ↓
redundant regional weave and campaign resolution
```

Alpha 0.1 is verified and published. The next release path is additive Phase 8 work rather than a foundational rewrite:

- Begin Phase 8, **The Tide Choir**, from the frozen Alpha 0.1 baseline: make route memory truthful, make surveying playable, and let completed harbor loops awaken one-time communal harmonies.
- Treat tideletters, traveling companions, menu-level import/export, multiple visible slots, key remapping, and separate volume controls as later subphases unless release playtesting promotes them.

## Phase 0 — Evidence and contract

Status: **complete**

Evidence:

- Reward-loop research covers autonomy, competence, relatedness, flow, restorative play, legible “juicy” feedback, and voluntary stopping.
- Strand/simulation research connects repeated traces, weak-tie bridging, causal histories, and automation of solved logistics.
- Official stack research selected p5 instance mode, Vite relative-base output, deterministic TypeScript rules, Vitest, a standard secure Electron protocol, and the GitHub Pages artifact workflow.
- [Game design](./docs/GAME_DESIGN.md), [research](./docs/RESEARCH.md), and [architecture](./docs/ARCHITECTURE.md) record the contract and constraints.

Replan result: the “fortress” is the regional route graph; depth comes from dependencies, project rule changes, accountable information, and autonomous multi-hop care.

## Phase 1 — Shared walking skeleton

Status: **complete**

Implemented:

- npm, Vite, TypeScript, p5.js, Vitest, Electron Forge, and one browser-pure entry.
- Fixed player step, slower authoritative world tick, typed command queue, seeded RNG, immutable view projections, procedural sound, and versioned snapshots.
- Responsive canvas/DOM shell shared by web and Electron.
- Relative-path web build, CI, Pages workflow, web manifest, and SVG icon.
- Hardened Electron `app://bundle/` protocol, sandbox, navigation/permission denial, CSP, ASAR, and fuses.

Exit evidence: the production web build is the exact renderer loaded by packaged Electron.

## Phase 2 — The world breathes without the player

Status: **complete for the vertical-slice scale**

Implemented:

- 64 × 48 seeded terrain, tide, weather, seven settlements, 42 named residents, five resource families, recipes, needs, intentions, relationships, trust, knowledge, and stress.
- Stock-driven promises with named requesters, reserved player choice, resident claiming, cargo conservation, deadlines, and causal events.
- Deterministic world replay, invariants, save continuation, and long-run soak coverage.
- Potential inter-settlement corridors plus an active graph with stable multi-hop porter planning.

Replan result: keep the readable population scale; deeper biology and decorative agent state were rejected. Migration and richer personal histories remain expansion work.

## Phase 3 — A delivery worth taking

Status: **complete for the core journey**

Implemented:

- Continuous foot/skiff movement, pointer pathing, camera, terrain drag, three paces, stamina, active Shift-bracing, stability, differentiated fragile/perishable cargo, weather load, discovery, scanning, and rest.
- Contextual tutorial from movement through witnessing a consequence.
- Contract inspection/tracking, origin pickup, exact-trace delivery, four condition grades, safe handoff, and clear command rejection.
- Immediate audiovisual feedback plus inventory, trust, project, route, knowledge, and chronicle consequences.
- Emergency camp and active-route clinic rescue instead of destructive failure.

Replan result: infrastructure is currently created through civic projects and harbor route-tending rather than a free-placement construction mode.

## Phase 4 — The strand compounds

Status: **complete for the campaign slice**

Implemented:

- Delivery and one-part harbor tending strengthen shared corridor state.
- Routes above the active threshold carry resident promises across multiple hops.
- Planning accounts for weather, reliability, condition, congestion, traffic, and capacity.
- Beacons, caches, crossings, clinics, and ferries permanently change rules; cache shelter also halts perishable freshness loss.
- Graph metrics expose service coverage, components, bridges, cycles, resilient settlement degree, and regional resilience.
- Full coverage plus redundant loops produces a finite campaign resolution and optional endless continuation.

Replan result: topology now supplies early/mid/late differentiation. Migration, rumor conflict, and more contract families should be added only if playtests show they create decisions rather than bookkeeping.

## Phase 5 — Restorative presentation

Status: **complete for initial release; settings depth deferred**

Implemented:

- Procedural p5 terrain, tide/water, weather, settlements, resident porters, traces/strands, particles, scanner, map markers, and camera.
- Responsive DOM HUD, session objective, promise cards, settlement/route inspector, chronicle, title/continue flow, help, and Quiet Hour.
- Keyboard and pointer play; visible focus; native buttons/dialogs; skip link; live announcements; color-independent words/symbols/patterns; automatic reduced-motion behavior.
- Procedural ambient layers and immediate cues for movement, scans, promises, deliveries, warnings, strands, and rest.

Deferred polish: user-facing mute/volume controls, remapping, explicit contrast selector, and additional small-screen playtesting.

## Phase 6 — Memory, truth, and chosen closure

Status: **core complete; player-facing save management deferred**

Implemented:

- Checksummed/versioned deterministic world save nested inside a versioned game-session envelope.
- IndexedDB primary repository with localStorage fallback, deterministic summaries, clone isolation, corruption filtering, and record validation.
- One autosave/Continue flow preserving player, cargo, signed report, chart, tutorial, session shape, and recap history.
- Periodic, visibility, exit, title, and Quiet Hour saves with no offline simulation.
- Versioned JSON import/export helpers with future-format, metadata, JSON, and 20 MB validation.
- Signed report cargo with source, subject, quantity, observation tick, age, confidence, and recipient knowledge update.
- Hearth/Journey/Gale pressure plus Drift/Weave/Wander session shapes; Quiet Hour supplies causal closure.

Deferred polish: wire import/export and multiple slots into the menu. Unsupported future simulation versions already fail safely instead of being guessed.

## Phase 7 — Verification, packaging, and publication

Status: **complete for Alpha 0.1**

Implemented:

- Unit/integration coverage for RNG, replay, invariants, conservation, persistence, traversal, tutorial, information, active graph, project effects, and soak behavior.
- Vite production build with relative assets.
- Electron Forge packaging and a packaged-app smoke harness that probes the secure origin, UI, canvas, simulation advancement, missing Node globals, renderer/resource errors, and optional screenshot.
- CI workflow and a Pages deployment workflow that type-check, test, and build before upload.
- Release README, controls, architecture, design boundaries, save behavior, desktop commands, and deployment instructions.

Final local evidence captured 2026-09-01:

- `npm run check` passes TypeScript, 48/48 Vitest checks, the Vite production build, and the nested-path Pages smoke probe.
- `npm run package:desktop && npm run smoke:desktop` passes against the packaged macOS arm64 app.
- The desktop probe loads `app://bundle/index.html`, advances the simulation, finds all seven settlements and 3,072 terrain tiles, exposes no Node globals, and reports no renderer warnings or resource failures.
- A fresh 2,880 × 1,678 smoke screenshot records the verified Alpha 0.1 frame.
- GitHub Actions repeated CI and Pages verification successfully on commit `5b9e154`.
- The public HTTPS deployment responds successfully at https://19koda19.github.io/tideweft/ and the source is tagged `v0.1.0-alpha.1`.

## Phase 8 — The Tide Choir

Status: **in progress after Alpha 0.1 publication**

Purpose: turn walking, surveying, and redundant topology into a truthful, whimsical field system before adding new economies.

Planned subphases:

1. **Truthful trails:** delivery reinforcement follows actual overlap between the traveled trace and a corridor; a distant detour still marks its exact tiles but cannot magically strengthen an unrelated direct edge.
2. **Surveyed strands:** a route becomes tendable only after the player genuinely travels enough of it between endpoint harbors. Route and porter selection become first-class inspectable interactions.
3. **Harbor songs:** consecutive surveyed legs form a personal route phrase. Closing a unique simple loop of at least three harbors awakens its Tide Choir once, gently restoring condition/reliability on those edges without minting cargo or bypassing traversal.
4. **Whimsical memory:** canonical loop memories appear as color-independent halos, lantern-moth signals, a layered procedural chime, route-inspector history, and Quiet Hour causes; reduced-motion mode substitutes stable marks for animation.

Exit evidence will include deterministic overlap scoring, unseen-route tending rejection, canonical/repeat-safe cycle detection, save compatibility, replay/conservation/soak coverage, and full web/Electron verification.

## Reward-loop acceptance audit

1. **Immediate legibility — implemented:** commands have visual/audio/text responses and rejected state changes explain why.
2. **Early competence — implemented, timing playtest pending:** onboarding leads through movement, scan, promise, travel, arrival, and witness without an external manual.
3. **Graded success — implemented:** pristine, weathered, improvised, and rescued arrivals all move material and leave a trace.
4. **Autonomy — implemented structurally, seed audit pending:** contracts expose consequence/mood; travel supports manual and pointer paths; reports and route tending provide non-contract work.
5. **Relatedness — implemented:** promises name a requester and arrival copy identifies the person/harbor/project helped.
6. **Compounding impact — implemented:** deliveries and parts can cross the self-carrying threshold; earlier corridors later carry resident work.
7. **Session closure — implemented:** Drift and Weave declare completion; Wander has no quota; Quiet Hour pauses, saves, and recaps.
8. **No coercion — implemented:** no streak, daily reset, paid/random payout, offline loss, or continue bonus.
9. **Low frustration — implemented:** cargo weathers instead of vanishing; camp, clinic rescue, and harbor handoff preserve progress and knowledge.
10. **Intrinsic core — qualitative playtest pending:** movement, planning, charting, and observing porters are built to stand without score escalation.

## Next replan gate

After the first external Pages playtest, classify feedback into:

- comprehension failures that block the current loop;
- reward/pace problems that weaken restoration;
- topology problems that collapse route choice;
- presentation/accessibility defects;
- expansion requests.

Fix the first four before adding the fifth. Rewrite the next phase from observed play, not from feature-count momentum.
