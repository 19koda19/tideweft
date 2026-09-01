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

Phase 9: the Wayknots post-alpha preview is verified and live; refinement is the active gate.

- The public repository retains tagged Alpha 0.2 at `d9b8cea` / `v0.2.0-alpha.1`; Pages now also serves the untagged Phase 9 Wayknots preview from `eb12db0`.
- The complete local web and packaged desktop gates now cover the 96 × 72 Perlin world, real Relief 3D, physical promise pickup, an actually bound 3D Wayknot, explicit delivery guidance, renderer switching, and the shallow-window Promises scroller.
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

## 2026-09-01 — Alpha 0.2 release candidate verified

- Grew new worlds from 64 × 48 to 96 × 72 while preserving legacy Alpha saves, enforcing wide harbor separation, and replacing the old field with deterministic multi-octave gradient Perlin terrain.
- Added distinct terrain, live traversable water, separate depth sounding, monotone depth/stamina costs, deterministic swept-current recovery, and infrastructure-earned Sounding line, Marsh stilts, Tide sail, and Storm kite tools.
- Made corridor reinforcement follow actual traveled overlap, gated route tending behind genuine surveying, and added repeat-safe canonical Tide Choir cycles with persistent audiovisual memory.
- Repaired the comprehension failures from Alpha 0.1: stable live contract actions, explicit pickup/delivery copy and map markers, separate signed-report language, stability-cause text, route-work cost/effect text, and a Chromium `::details-content` scroll fix.
- Added an actual p5/WebGL Relief 3D renderer with chunked seam-safe terrain, live water, 3D entities/routes/soundings, orbit, zoom, terrain picking, persistent view switching, reduced-motion defaults, and secure Chart 2D fallback.
- Closed release races around optimistic pickup saves, legacy 64 × 48 migration, dynamic swept-water replanning, hidden WebGL context loss, and shutdown audio ordering.
- Passed `npm run check` with 19 files / 122 tests and a successful nested Pages artifact probe.
- Passed the packaged Electron smoke with Relief 3D active, physical cargo loaded, an explicit `DELIVER CARGO · Latchmere` marker, a working Chart/Relief round trip, a real 79px scroll viewport at 960 × 640, and zero renderer warnings or failed resources.

## 2026-09-01 — Alpha 0.2 published

- Secret-scanned and froze the verified Wild Reaches / Relief source as commit `d9b8cea` with annotated tag `v0.2.0-alpha.1`.
- Pushed public source and watched both tag/main CI runs plus the GitHub Pages deployment succeed on that exact commit.
- Confirmed the live HTTPS origin responds successfully and references the exact production JS/CSS hashes verified locally.
- Kept the long-running build goal active and moved the next gate to post-alpha terrain fieldwork and deeper whimsical simulation rather than declaring the game finished.

## 2026-09-01 — Phase 9 Wayknots opened

- Added a fixed six-piece reusable field kit: two Reed mats, two Tide anchors, and two Wind knots with stable save-safe identities, contextual F placement, exact reclaim, terrain/occupancy validation, and conservative legacy repair.
- Wired the aids into fixed-step movement and pointer routing: soft-ground drag/stamina, water effort/current recovery, and wind stability all use deterministic local influence queries rather than presentation-only bonuses.
- Added bounded Waychords where unlike influences overlap; the shared field recharges the Loom slightly faster and has explicit word/pattern feedback.
- Added physical Wayknot forms to both world presentations, including low-poly Relief 3D slats, buoy/anchor line, and ribbon mast on discovery-masked terrain.
- Repaired Relief field feel with camera-relative eight-way input, discovery-safe surface/picking/label heights, and per-projection discovery-signature memoization.
- Hardened persistence with sticky IndexedDB-to-localStorage runtime failover, newest-copy reconciliation, monotonic writes, clone isolation, and coalesced newest autosaves behind an in-flight write.
- Passed TypeScript, 23 Vitest files / 168 checks, the production build, and the nested `/tideweft/` Pages smoke; the source secret scan is clean.
- Rebuilt the packaged Electron 44 app and passed the deterministic physical-Wayknot smoke repeatedly: it walks to salt marsh, binds Reed mat #1 through the real button, observes one projected/active knot plus `1 / 6 deployed`, and preserves the Chart/Relief round trip with no warnings or resource failures.
- Inspected the fresh 2,880 × 1,800 evidence frame: the low-poly woven mat, world label, active field copy, reclaim button, loaded delivery objective, and scrollable Promises pane are all visible. Pages publication remains the checkpoint gate.

## 2026-09-01 — Phase 9 Wayknots candidate verified

- Added an integrated legacy-save assertion proving a published Alpha player snapshot with no Wayknot field receives exactly the six carried fixed-ID pieces without changing the old 64 × 48 world.
- Extended the packaged smoke harness from HUD inspection to actual play: public pointer routing reaches compatible terrain, the real action button binds the knot, and render/UI projections must agree before evidence capture.
- Completed the local release-candidate gate with 23 test files / 168 checks, production and nested-path web output, packaged Relief 3D play, screenshot review, dependency inspection, diff validation, and a scoped source secret scan.

## 2026-09-01 — Phase 9 Wayknots preview published

- Published the complete 29-file Wayknots/Relief/save-resilience checkpoint as `eb12db0` without changing the Alpha 0.2 tag or claiming a new packaged release.
- Watched both exact-commit GitHub CI and Pages workflows pass dependency installation, TypeScript, all 168 checks, production build, nested-path artifact smoke, upload, and deployment.
- Confirmed the live HTTPS page and the precise `index-DFAeV3cN.js` / `index-BVBXIgMF.css` artifacts return successfully.
- Kept the long-running build goal active; the next slice begins with save-delete resilience, tide-anchor reload truthfulness, sweep ETA accuracy, and sounded-depth action clarity found during the parallel review.

## 2026-09-01 — Phase 9 post-publication truth pass

- Added a separate, validated localStorage deletion journal so removing a slot remains authoritative when IndexedDB is down and after it recovers; stale callbacks cannot recreate it, while a strictly newer deliberate save can.
- Made low-tide anchor migration depend on whether peak tide can genuinely reach placement depth at that elevation. Impossible high-marsh/meadow/ridge imports return the fixed piece to the pack.
- Replaced start-tile sweep estimates with the exact fixed-step, tile-local pull used by live current recovery; generated tests now compare estimated ticks with actual ticks ashore after leaving an anchor field.
- Made unsounded flooded non-channel terrain depth-neutral: button, ARIA, global F shortcut, canvas F runtime enforcement, and field hint all say to sound first; existing objects always remain reclaimable.
- Added compact Wayknot status wrapping and focused accessibility/shortcut coverage, bringing the complete suite to 24 files / 178 checks.
- Rebuilt and re-smoked Electron 44 with the physical 3D Reed mat, Chart/Relief round trip, 79px Promises viewport, 2,880 × 1,800 evidence frame, and zero renderer/resource errors.
