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

Alpha 0.1 and Alpha 0.2 are verified and published. Alpha 0.2 was built additively from the frozen first-alpha baseline:

- **The Tide Choir** makes route memory truthful, surveying playable, and completed harbor loops capable of awakening one-time communal harmonies.
- **Wild Reaches** expands new seeds to a 96 × 72 Perlin estuary with meaningful terrain, sounded water, recoverable currents, and civic field tools.
- **The Estuary in Relief** adds an actual playable p5/WebGL presentation while retaining the complete Chart 2D fallback.
- **Wayknots** entered the published, untagged Phase 9 preview at `eb12db0` and its hardened live checkpoint is `1bc136e`; the working tree beyond it is now the untagged Phase 10 Tide Harps preview. Local web and packaged Electron verification are complete, while publication, remote CI, and live Pages verification remain pending.
- Tideletters, traveling companions, menu-level import/export, multiple visible slots, key remapping, and separate volume controls remain later subphases unless release playtesting promotes them.

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

Status: **complete for Alpha 0.2**

Purpose: turn walking, surveying, and redundant topology into a truthful, whimsical field system before adding new economies.

Subphases in the current working build:

1. **Truthful trails — verified:** delivery reinforcement follows actual overlap between the traveled trace and a corridor; a distant detour still marks its exact tiles but cannot magically strengthen an unrelated direct edge.
2. **Surveyed strands — verified:** a route becomes tendable only after the player genuinely travels enough of it between endpoint harbors. The route inspector explains both the survey gate and the exact one-part consequence.
3. **Harbor songs — verified:** consecutive surveyed legs form a personal route phrase. Closing a unique simple loop of at least three harbors awakens its Tide Choir once, gently restoring condition/reliability on those edges without minting cargo or bypassing traversal.
4. **Whimsical memory — verified:** canonical loop memories appear as color-independent halos, lantern-moth signals, a layered procedural chime, route-inspector history, and Quiet Hour causes; reduced-motion mode substitutes stable marks for animation.
5. **Comprehension repair — verified:** promise cards stop rebuilding beneath active clicks, the list scrolls, map/objective/card copy names pickup and delivery, reports are labeled as separate information jobs, route-work buttons state their cost/effect, and stability names its current cause.

Exit evidence will include deterministic overlap scoring, unseen-route tending rejection, canonical/repeat-safe cycle detection, save compatibility, replay/conservation/soak coverage, and full web/Electron verification.

## Phase 8B — Wild Reaches

Status: **core complete for Alpha 0.2**

Purpose: make the space between harbors a meaningful strand journey rather than empty commute time. Larger separation, new terrain, and tools must all feed the same promise/survey/infrastructure loop.

Implemented first slice:

1. **Longer seeded reaches — implemented, balance playtest pending:** new worlds are 96 × 72, every harbor is at least 14 Manhattan tiles from every other harbor, and multi-octave seeded gradient Perlin noise produces the height field. Stored 64 × 48 Alpha worlds migrate in place.
2. **Readable terrain — implemented, screenshot review pending:** built decking, shell sandbars, silt flats, shallows, channels, reed marsh, salt meadow, wind scrub, ridges, and deep water have distinct labels, colors, and deterministic non-color motifs.
3. **Sounded water — implemented, playtest pending:** ordinary discovery and bathymetry are separate; the starting Sounding line makes Loom pulses reveal depth, and deeper water adds a monotone, explicitly labeled stamina cost.
4. **Recoverable sweep — implemented, playtest pending:** deep-water exhaustion follows a deterministic adjacent path to a safe bank. Cargo quantity is never deleted, cargo weathers once, involuntary drift cannot earn survey/Choir credit, and connected clinics/ferries change recovery.
5. **Civic field kit — implemented, progression balance pending:** completed Crossings, Ferries, and Beacons entrust visiting couriers with Marsh stilts, a Tide sail, and a Storm kite. The tools change soft-ground drag, deep-water effort, wind stability, and sweep time without an isolated upgrade shop.
6. **Terrain-aware pointer paths — implemented, balance pending:** Loom routes price live depth and owned tools, conservatively penalizing unsounded water while leaving manual exploration legal.

Exit evidence will include deterministic terrain/spawn checks, old-save migration, depth/drain boundaries, swept recovery without cargo loss, tool effects, pathfinding, browser readability, and desktop smoke coverage.

## Phase 8C — The Estuary in Relief

Status: **complete for Alpha 0.2**

The 96 × 72 height field compiles into deterministic cullable terrain chunks with seam-safe vertices and normals, consistent triangle winding, material/depth references, bounds, and a separate live-water plane. Default worlds produce 30 bounded chunks rather than one monolithic mesh. Pure tests cover geometry counts, seams, normals, water extrema, determinism, malformed input, camera projection, picking, culling, and fog.

The optional p5/WebGL renderer now consumes that mesh as a playable angled relief view with lit terrain, live tile water, distance fog, 3D strands/Choirs, harbors, porters, player cargo, soundings, scan ripples, terrain-aware pointer picking, zoom, and orbit. A persisted header control and V shortcut switch presentations without forking state; an unavailable or lost WebGL context falls back to the complete Chart 2D view. Reduced-motion users begin in Chart 2D unless they explicitly saved another choice.

Local Alpha 0.2 evidence captured 2026-09-01:

- `npm run check` passes TypeScript, 19 Vitest files / 122 checks, the production build, and the nested `/tideweft/` Pages smoke probe.
- Packaged Electron 44 starts Relief 3D by default, round-trips through Chart 2D, creates the exact 6,912-tile world, and reports no renderer warnings, resource failures, or Node-global leakage.
- The packaged UI smoke clicks a live available promise, observes 14 physical cargo units and `DELIVER CARGO · Latchmere`, then proves the Promises viewport still has real vertical overflow at 960 × 640.
- A 2,880 × 1,800 screenshot records the wedge-free 3D discovery island, loaded cargo HUD, explicit delivery objective, and scrollable promise card.
- GitHub repeated CI and Pages verification successfully on commit `d9b8cea`; tag `v0.2.0-alpha.1` and the public HTTPS build are live at https://19koda19.github.io/tideweft/.

## Phase 9 — Wayknots

Status: **published post-alpha preview on `main`**

Purpose: let terrain knowledge become small, reclaimable acts of care in the traveled world rather than another shop, currency, or permanent build menu.

Implemented in the current source checkpoint:

1. **Fixed reusable kit:** the player ferrier begins with six stable pieces—two Reed mats, two Tide anchors, and two Wind knots. F binds the terrain-appropriate piece or reclaims the exact numbered piece underfoot; no cargo, random drop, decay clock, or new currency is involved.
2. **Authoritative field effects:** mats reduce marsh/mudflat drag and stamina cost, anchors reduce nearby water effort and speed current recovery, and wind-knots reduce gust-driven stability loss on exposed scrub/ridge. Manual movement, the HUD, and pointer A* read the same deterministic Manhattan fields.
3. **Waychords:** unlike influences can overlap at terrain boundaries. Their bounded strongest-per-hazard effects remain distinct, while the overlap gives a small Loom-recharge harmony and a patterned connection in both presentations.
4. **Physical dual-view presence:** Chart 2D draws different non-color motifs; Relief 3D models woven slats, a buoyed anchor/line, and a ribbon mast on the discovery-masked surface.
5. **Relief field-feel repair:** movement rotates with the orbit camera, hidden authoritative height cannot leak through picking or label placement, and discovery signatures are memoized by immutable projected tile arrays.
6. **Save resilience:** legacy saves receive the carried kit, malformed placements repair conservatively, runtime IndexedDB errors stick to localStorage, cross-store reads select the newest available record, and saves requested during an in-flight write coalesce to the newest snapshot.
7. **Post-publication truth pass:** durable deletion markers suppress stale saves across recovered storage sessions; anchor reload validation uses maximum possible tide against elevation; sweep ETA simulates the same changing per-tile pull as live drift; and unsounded flooded flats expose only a neutral Sound-first action through both UI and runtime paths.

Local checkpoint evidence captured 2026-09-01:

- TypeScript, 23 Vitest files / 168 checks, the production build, and the nested `/tideweft/` Pages smoke all pass; the final artifact references `index-DFAeV3cN.js` and `index-BVBXIgMF.css`.
- The packaged Electron 44 smoke walks one tile from Bellwake, binds Reed mat #1 through the real field-action button, and proves the projection, active field, `1 / 6 deployed` HUD, and reclaim control agree in both view modes.
- A fresh 2,880 × 1,800 Relief screenshot visibly records the woven 3D mat, its world label, active description, explicit cargo destination, and still-scrollable Promises pane.
- The source scan found no private-key headers, credential tokens, credential assignments, or credential-bearing URLs.
- GitHub CI and Pages repeated every web gate successfully on commit `eb12db0`; the live HTTPS origin serves the exact locally inspected JS/CSS artifacts. This is an untagged mainline preview after Alpha 0.2.
- The follow-up hardening candidate passes 24 Vitest files / 178 checks, produces `index-CtM8H4DA.js` and `index-DJ8ONY8I.css`, and repeats the packaged 3D Wayknot/minimum-viewport smoke with no renderer warnings or resource failures.

## Phase 10 — Tide Harps

Status: **locally verified implementation preview; publication pending**

Purpose: let the fixed Wayknot kit become a small spatial instrument—something the player composes by understanding terrain—without adding a shop, resource, upgrade track, or save migration.

Implemented in the current working source and covered by the local release gate:

1. **Exact derived formation:** every connected, non-collinear compact triangle containing exactly one Reed mat, one Tide anchor, and one Wind knot is enumerated from fixed-ID Wayknot placements and grid dimensions. The selector finds an exact maximum knot-disjoint set; equal-size sets prefer lower total Euclidean perimeter, then canonical R/A/W ID tuples. Collinear triples and formations sharing a selected knot do not become Harps.
2. **Stable identity and whimsy:** canonical IDs use the fixed components, while eight deterministic player-facing names—Glass-Ebb, Gullweather, Moon-Reed, Lantern Shoal, Mothcurrent, Brine Lullaby, Quiet Rigging, and Estuary Chime—give the formations memorable labels.
3. **Bounded field benefit:** when the courier's tile center is inside or on a selected triangle, one Harp adds exactly +900 Loom charge per 100 ms player step, capped at full charge and never multiplied by overlapping Harps. Normal recharge and the existing Waychord bonus remain separate.
4. **Four-origin sounding:** a successful Space pulse still discovers and sounds radius 8 around the courier, then discovers and sounds radius 6 around each of the active Harp's three fixed knot origins. It spends the existing Loom charge, preserves the boolean scan contract, and never exposes water depth before a genuine sounding.
5. **Derived, reward-neutral state:** Harps are recomputed from existing Wayknot placement and grid data. They mint no cargo or settlement stock and add no authoritative simulation member, player save field, currency, timer, format version, or legacy migration.
6. **Legible field instruction:** the HUD reports the total selected Harps. With none tuned it teaches `Reed + Anchor + Wind in a compact triangle`; outside an existing Harp it asks the player to stand inside; inside it names the instrument and states the +900/three-origin benefit. Help and the successful scan announcement repeat the formation and sounding model, while local unsounded-water guidance keeps priority.
7. **Dual-view instrument:** Chart 2D keeps three bowed strings along each triangle edge—nine in all—plus a persistent label and fixed active marks. Relief 3D raises three discovery-safe cords to a suspended faceted bell with stable beads/crown cues; reduced motion removes decorative bell bob and sway rather than removing the structure.

Local release evidence captured 2026-09-01:

- TypeScript, 28 Vitest files / 205 checks, the production build, and the nested `/tideweft/` web smoke pass. The inspected build emits `index-CKlzWR1L.css` and `index-D30XtHH3.js`.
- The packaged Electron smoke visibly paints the title controls; loads one physical cargo promise; validates the deterministic R1/A3/W5 Harp through the production save path; proves the active HUD/projection and remote knot echo; round-trips Chart/Relief; and keeps Promises scrollable without objective overlap at 1,440 × 900, 960 × 640, 927 × 640, and 700 × 640. It reports no renderer warnings or resource failures.
- Fresh 2,880 × 1,678 title and 2,880 × 1,800 Relief captures show the usable text-first start screen, explicit delivery state, active Harp copy, and actual discovery-safe bell/cord structure.

The final source passes `git diff --check`, and the scoped scan finds no private-key headers, credential-token patterns, credential assignments, credential-bearing URLs, or committed environment files. Before any Phase 10 publication claim, publish the exact reviewed commit and require its remote CI and Pages deployment to succeed. Alpha 0.2 remains tagged at `v0.2.0-alpha.1` throughout this preview.

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
