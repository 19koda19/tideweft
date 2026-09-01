# Progress log

## 2026-08-31 — Goal and Phase 0 opened

- Converted the broad game ambition into a durable goal with verifiable build, playability, simulation, persistence, Electron, and GitHub Pages criteria.
- Confirmed the workspace was completely empty and contained no work to preserve.
- Audited local tooling: Node 22, npm and pnpm are available; Electron/Vite are not installed globally.
- Identified a 5 GB free-disk constraint and selected a shared browser-first renderer with a thin Electron shell.
- Began parallel research into systemic strand design, restorative/rewarding play, stack constraints, and deterministic simulation architecture.
- Added a first living phase ledger. Phase 0 will be rewritten once research reports return.
- Reward-loop research established autonomy, competence, relatedness, restorative closure, graded success, causal feedback, and non-coercive session shape as acceptance criteria.
- Strand/simulation research sharpened the concept into TIDEWEFT: a tidal courier ecology with delayed information, network dependency, causal biographies, automation of solved routes, and failure that creates care/recovery stories.
- Official stack research selected p5.js 2.x in instance mode, Vite relative-base output shared by Pages and Electron, a custom secure Electron protocol, and Vitest for the pure simulation.
- Added the first architecture decision record and crossed the Phase 0 replan gate.

## 2026-08-31 — Phase 0 closed and plan rewritten

- Consolidated design research around autonomy, competence, relatedness, weak-tie networks, causal simulation, graded arrival, restorative play, and chosen stopping points.
- Named the game **TIDEWEFT: An Estuary of Promises** and made route topology the central fortress-like system.
- Chose an intentionally non-coercive reward contract: no streaks, daily pressure, paid/random rewards, offline decay, or infinite score treadmill.
- Pinned a browser-first stack that fits the workspace disk constraint and recorded official-source decisions in `docs/RESEARCH.md`.

## 2026-08-31 — Phases 1–3 became playable

- Scaffolded Vite, TypeScript, p5.js, Vitest, Electron Forge, CI, and GitHub Pages around one shared renderer.
- Implemented a deterministic 64 × 48 world with seven settlements, 42 residents, five resources, recipes, needs, intentions, relationships, trust, knowledge, weather, tide, projects, and shortage contracts.
- Added keyed RNG, canonical commands, invariant checks, cargo conservation, serialization checksums, replay comparison, and long-run soak coverage.
- Added continuous traversal, pointer pathing, foot/skiff state, paces, stamina, Shift-bracing, stability, fragile shock, perishable freshness, scanning, chart discovery, emergency camp, graded arrivals, and safe promise handoff.
- Connected the contextual tutorial to real movement, scan, contract, travel, arrival, and witness state rather than a detached help checklist.

## 2026-08-31 — Phase 4 topology pass

- Promoted routes from decorative pair links to an active graph with strength/condition thresholds.
- Added stable multi-hop resident planning across route IDs and settlement IDs, with weather, reliability, condition, traffic, congestion, and capacity in edge cost.
- Added live porter location across each planned leg and reinforcement of every leg used on arrival.
- Added components, bridges, cycle rank, service coverage, settlement redundancy, resilience, and a finite resilient-weave campaign resolution.
- Made all civic projects authoritative rule changes: beacon signal/storm support, cache recovery and perishable shelter, crossing travel improvement, clinic rescue, and ferry capacity/speed.
- Added harbor route tending with shared parts so a player can deliberately cross the self-carrying threshold.

## 2026-08-31 — Information and restorative-session pass

- Implemented one-slot signed report cargo with source, target, subject, resource, observed count/tick, age, and confidence.
- Kept remote inventories epistemically honest: inspectors distinguish locally verified state from sourced, aging reports.
- Added Hearth/Journey/Gale pressure postures without changing reward value.
- Added Drift/Weave/Wander session shapes with explicit closure thresholds and no continue bonus.
- Added Quiet Hour save-and-pause recaps for duration, distance, deliveries, reports, strands, discoveries, and causal changes.

## 2026-08-31 — Presentation, persistence, and release pass

- Built a responsive procedural p5 map with tide/weather/terrain layers, moving residents, route patterns, scan/camera feedback, and color-independent markers.
- Built the accessible DOM shell: title/continue, HUD, promise cards, objective, harbor/route inspector, chronicle, help, native dialogs, focus treatment, live announcements, and reduced-motion handling.
- Added procedural Web Audio ambience and action cues unlocked by player gesture.
- Implemented one-session autosave/continue over IndexedDB with localStorage fallback; saves include the checksummed world plus player, chart, cargo/report, tutorial, session, and recap state.
- Added deterministic fallback-repository tests and guarded JSON export/import helpers for future menu wiring.
- Hardened Electron with a contained `app://bundle/` protocol, process/renderer sandboxing, no Node bridge, denied permissions/navigation/windows, CSP, ASAR, and supported fuses.
- Added a packaged-app smoke harness that probes the production origin, assets, canvas, UI, world advancement, renderer logs, and missing Node globals, with screenshot evidence support.
- Added the relative-base Vite build, pinned CI/Pages workflows, web manifest, and code-native SVG identity.

## Current checkpoint

Phase 7: final merged verification and publication.

- Re-run the complete check and packaged smoke after parallel gameplay changes settle.
- The Pages workflow is ready, but this checkout has no Git remote and the configured GitHub CLI credential is invalid; authenticated repository creation/push is the remaining external deployment step.
- Menu-level import/export, visible multiple save slots, key remapping, volume controls, and broader simulation families remain documented follow-up work rather than hidden release claims.

## 2026-09-01 — Alpha 0.1 verification recovered

- Recreated the durable build goal after the interrupted session record was lost; the workspace itself remained intact.
- Passed the final integrated `npm run check`: TypeScript, all 48 Vitest checks, the production web build, and the nested `/tideweft/` Pages smoke probe.
- Rebuilt the macOS arm64 Electron package and passed the packaged smoke probe at the secure `app://bundle/` origin with no renderer warnings, resource failures, or Node-global leakage.
- Captured a fresh 2,880 × 1,678 packaged-app screenshot as Alpha 0.1 evidence.
- Promoted publication to the immediate gate before further mechanics. The local GitHub CLI session for `19koda19` is expired, so repository creation/push awaits renewed authentication.
- Replanned the first post-alpha expansion as **The Tide Choir**: truthful route overlap, genuinely surveyed strands, and one-time audiovisual harmonies for unique harbor loops. Personal tideletters and traveling companions follow after that topology-centered slice.

## 2026-09-01 — Alpha 0.1 published

- Secret-scanned and froze the verified source as commit `5b9e154` with tag `v0.1.0-alpha.1`.
- Created the public repository at https://github.com/19koda19/tideweft and pushed `main` plus the alpha tag.
- Enabled the repository's GitHub Actions Pages source with enforced HTTPS.
- Watched the complete Pages deployment succeed; the remote workflow repeated dependency installation, TypeScript, all simulation/game tests, the production build, nested-path smoke, upload, and deployment.
- Verified the public deployment responds successfully at https://19koda19.github.io/tideweft/.
- Opened Phase 8, **The Tide Choir**, from this published baseline.
