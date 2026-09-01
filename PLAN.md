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

Alpha 0.1 through Alpha 0.3 are verified and published. Alpha 0.3 grows additively from the frozen earlier baselines:

- **The Tide Choir** makes route memory truthful, surveying playable, and completed harbor loops capable of awakening one-time communal harmonies.
- **Wild Reaches** expands new seeds to a 96 × 72 Perlin estuary with meaningful terrain, sounded water, recoverable currents, and civic field tools.
- **The Estuary in Relief** adds an actual playable p5/WebGL presentation while retaining the complete Chart 2D fallback.
- **Wayknots** entered the published, untagged Phase 9 preview at `eb12db0` and its hardened checkpoint was `1bc136e`. The untagged Phase 10 Tide Harps preview is now published at `6f74fe9`; its exact-commit CI, Pages deployment, and live assets are verified. Alpha 0.2 remains tagged separately and unchanged.
- The focused post-Phase-10 mobile/current hotfix is published at `f8dc848`: compact-by-default HUD behavior on portrait and short-landscape phones, discovery-safe surface-current arrows, and deterministic deep-water sweep recovery triggered by either empty stamina or empty stability.
- The perpetual/mobile/biome checkpoint is published at `29ea8dc`: new worlds are perpetual, manual in-play pause is gone, the title/HUD is near-monochrome, the mobile travel interface carries four vitals and touch actions, T/? opens a complete field manual, reports are separate from cargo controls, and seven derived biomes plus shared 2D/3D water colors are visible. Pure cargo-environment and rock/ladder foundations remain deliberately unwired.
- The field ecology / KIT checkpoint is published as the **Alpha 0.3 feature baseline** at `d22668b`: nine visible deterministic raw materials can be gathered into one exact 16,000-milli-load pack, the anywhere KIT exposes PACK / MAKE / MEND, six components feed eleven durable gear recipes, inherited Wayknots have persistent placement/reclaim wear and setting time, and four crafted wearables affect authoritative travel. The coherent version promotion is commit `ab270db`, tagged `v0.3.0-alpha.1`, with main/tag CI and Pages verified.
- The immediate post-tag touch/visibility hotfix adds a momentary 44-pixel **BRACE / BRACING** control to compact layouts. It drives the exact desktop-Shift simulation bit during pointer routes and releases on pointer cancellation, lost capture, blur, visibility loss, dialogs, title transitions, stop, or teardown so mobile bracing cannot stick. Relief water retains the shared semantic palette while using stronger discovery-masked depth opacity, making shallow, channel, and deep water progressively darker against lit terrain.
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
- One autosave/Continue flow preserving player, cargo, signed report, chart, tutorial, a legacy-compatible session-shape field, and recap history.
- Periodic, visibility, exit, title, and Quiet Hour saves with no offline simulation.
- Versioned JSON import/export helpers with future-format, metadata, JSON, and 20 MB validation.
- One-slot signed information reports with source, subject, quantity, observation tick, age, confidence, and recipient knowledge update without moving physical goods.
- Hearth/Journey/Gale pressure inside perpetual new worlds. Older Drift/Weave/Wander values remain loadable and round-trip unchanged, but no longer choose objectives or quotas. Quiet Hour supplies voluntary saved closure.

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

Status: **verified and published untagged preview; Alpha 0.2 tag unchanged**

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

The final source passes `git diff --check`, and the scoped scan finds no private-key headers, credential-token patterns, credential assignments, credential-bearing URLs, or committed environment files. Exact commit `6f74fe9e016ba566116e2085b05ecf2988213754` is pushed; CI run `33494152504` and Pages run `33494152310` succeeded; and the live HTTPS origin serves the inspected `index-CKlzWR1L.css` and `index-D30XtHH3.js` assets with HTTP 200 responses. This is an untagged mainline preview: Alpha 0.2 remains `v0.2.0-alpha.1`.

## Focused mobile/current hotfix

Status: **implemented, verified, and published at `f8dc848`**

Purpose: keep the world playable on a phone and make water failure readable before it takes control away, without revealing bathymetry that the player has not sounded.

Implemented in the current working source:

1. **Compact mobile field HUD:** at widths at or below 44rem, or short landscape viewports no wider than 64rem, the desktop HUD and detailed surfaces yield to a keyboard-accessible `PROMISES + / PROMISES −` disclosure with truthful `aria-expanded` and `aria-controls` state.
2. **Always-reachable essentials:** folding the large panels leaves a compact LED-style strip showing the active pickup/delivery route, stamina/stability safety, truthful ground/water terrain, and the contextual E/Space/F actions. `PROMISES +` opens a full safe-area Promises sheet; settlement interaction opens a mutually exclusive inspector sheet. The action dock remains available and neither sheet overlaps it.
3. **Two honest sweep causes:** in deep/current water at or above 120,000 depth, either stamina or stability reaching zero enters the same recoverable deterministic swept-current path. Dry ground and shallower water retain their existing recovery behavior; cargo quantity remains conserved and condition weathers once.
4. **Pre-entry current reading:** sparse arrows appear only on discovered wet surface in Chart 2D and Relief 3D. Their direction is derived from the same tide/wind current vector as recovery, while fixed geometry and spacing avoid leaking unsounded depth magnitude.
5. **No persistence expansion:** the hotfix adds presentation and derived cue state only. Saves remain local-first with IndexedDB primary and the existing sticky localStorage fallback.

Verification on 2026-09-01: **31 test files / 221 checks**, TypeScript, production build, nested `/tideweft/` web smoke, scoped public-source secret scan, and the packaged Electron gate all pass. The device gate covers 700 × 640, 390 × 700 portrait, and 844 × 390 landscape; it proves a 44-pixel toggle, scrollable full-width Promises, a separately scrollable inspector sheet, clean safe-area gaps, and zero renderer warnings or resource failures. Exact commit `f8dc8482cbd10df1352f87a3a28bbee4abcf8de2` is live after successful CI `33503039473` and Pages `33503039480`; its exact JS/CSS assets return HTTP 200.

## Perpetual/mobile/biome checkpoint and follow-ons

Status: **implemented, verified, and published at `29ea8dc`**

Implemented in the published checkpoint:

1. **Perpetual new worlds:** the title no longer offers Drift/Weave 10/25-minute choices; all new worlds use open-ended `wander` semantics. Valid legacy `drift`, `weave`, and `wander` save values remain in the type/save contract and round-trip unchanged, but every value projects the same no-timer/no-quota objective.
2. **Voluntary stopping, not manual freezing:** the P command and action-dock pause button are removed. Ordinary play advances continuously; Quiet Hour and the title still save and halt both fixed-step clocks until the player continues.
3. **Restrained field interface:** the title and field chrome use near-monochrome surfaces, hairline borders, and limited seafoam/gold cues. The visible Rest/Steady/Swift button cluster is removed without inventing a replacement simulation rule.
4. **Phone-first travel HUD:** the compact translucent overlay exposes labeled Stamina, Stability, Loom, and Cargo values/meters plus the route and immediate safety cause. A large touch dock supplies contextual interaction, Sound/Scan, and Wayknot actions without WASD or keyboard-hint clutter. Promises and settlement details occupy mutually exclusive safe-area sheets, and a harbor tap charts to its exact center instead of opening the inspector before arrival.
5. **Complete field manual:** desktop T and the mobile ? control open the same data-driven, versioned manual. Its desktop and safe-area mobile layouts scroll independently and cover every live mechanic, control, failure/recovery rule, save boundary, and explicit planned-versus-live distinction. Updating the manual is now part of completing each feature phase.
6. **Reports are not cargo promises:** physical supply work remains in Promises. The harbor inspector gives signed reports a separate information-only section, one-document-slot explanation, and stable **Sign info report → [harbor]** controls that remain clickable while live facts refresh.
7. **Visible derived biomes:** a pure fixed-point kernel derives smooth seed-addressed rainfall, heat, salinity, exposure, and magical-water influence, classifies Tide Channel, Brine Flat, Reed Marsh, Rain Meadow, Sun Meadow, Wind Ridge, and Glimmerfen, and applies bounded weather overlays. Projection and both Chart/Relief renderers expose the local biome and restrained color/motif language without adding persisted state. At this published checkpoint the signals had no rule consequences; the subsequent Alpha 0.3 field ecology / KIT checkpoint uses biome and active weather for natural-material identity and regrowth, while courier exposure, cargo, infrastructure, and settlement consequences remain staged.
8. **Deterministic cargo-environment foundation only:** a pure fixed-point evaluator defines material traits for ordinary, heavy, fragile, perishable, and confidential cargo; evaluates bounded condition loss, contamination, decay, and signed current/lift force from rain, heat, cold, immersion, impact, and magical-water flux; and returns canonically ordered readable causes. It does not yet create loose cargo entities or affect live cargo/save state.
9. **Deterministic rock/ladder foundation only:** a pure rules kernel derives coherent seeded outcrops, stable formations, crossing passability/risk/cost, and a finite reusable ladder kit with placement and reclaim validation. Runtime movement, pointer routing, rendering, UI, and saves do not consume it yet, so there are no live rock walls or ladders at this checkpoint.

Planned follow-ons, not current behavior:

1. **Integrate ladder-gated rock and fall traversal:** connect the existing pure rock/ladder rules to authoritative procedural obstacles, world presentation, carried/recoverable ladders, and legible stability/fall consequences through the same manual movement and pointer-routing rules.
2. **Physical cargo and upgrades:** let carried cargo be deliberately dropped, tumble down steep rock, drift in current, and lose condition without silently disappearing. Arrival condition must feed trust/compensation, while a safe anywhere-accessible upgrade surface changes authoritative capacity and traversal rules rather than acting as a cosmetic menu.
3. **Living-field consequences:** connect the already-visible biome climate and cargo-environment signals to spatial weather, live cargo state, ecology, settlements, tools, and infrastructure through forecastable causal rules. Visible biome identity alone does not implement dropped cargo, upgrades, live rain/heat damage, or magical-water effects.

## Field ecology / KIT checkpoint

Status: **implemented, verified, and published as the Alpha 0.3 feature baseline at `d22668b`**

Purpose: turn the visible biomes into a legible material commons and close the mobile gathering/crafting loop without inventing a separate station, currency, or remote warehouse.

Implemented in Alpha 0.3:

1. **Seeded material commons:** the same root seed, terrain, and biome projection derive discovery-safe nodes for Bladderkelp, Driftwood, Glimmer spore, Shellstone, Sunfiber, Hookstone, Cordreed, Pitchmoss, and Stormlichen. Settlement tiles are excluded, the catalog has stable coordinate-addressed IDs, and only sparse depletion needs persistence.
2. **One-unit, input-honest gathering:** desktop requires the discovered node underfoot plus E. A touch selection routes to the exact visible node and gathers automatically on arrival, avoiding the harbor-inspector race. Harvest is atomic against capacity and stock, always leaves one living unit, spends material-specific stamina, and can immediately trigger the existing next-beat deep-water sweep when stamina reaches zero.
3. **Active-time ecology:** weather modifies bounded deterministic regrowth, but recovery advances only with authoritative world ticks. There is no real-time clock, offline growth, or offline decay.
4. **One physical pack:** Promise cargo, one signed report, nine raw stacks, six prepared components, and eleven durable gear kinds share an exact 16,000-milli-load limit. Capacity checks use integer thousandths rather than rounded display units, so gathering, Promise pickup, and crafting cannot disagree at the boundary.
5. **Anywhere KIT:** desktop I opens PACK and C opens MAKE; the compact mobile KIT control opens the same safe-area PACK / MAKE / MEND dialog. The surface does not pause the tide or simulation, shows transport and field load separately, and gives precise recipe, missing-material, capacity, repair, condition, and salvage copy.
6. **Atomic craft / mend / dismantle:** six shallow component recipes feed eleven gear recipes. A craft consumes all inputs only if the exact result fits; each crafted gear item receives a stable increasing ID and durable condition. MEND restores up to 25% for its shown material quote, while DISMANTLE gives condition-scaled, deliberately lossy salvage. Core inherited Wayknots can be mended only after reclaim.
7. **Durable inherited Wayknots:** binding costs 8% condition, reclaiming costs 4%, and neither operation duplicates nor refreshes a fixed-ID piece. A new placement supplies half strength for three world ticks before full service; broken or too-frail pieces remain visible/inactive and require material repair rather than reclaim/redeploy scumming.
8. **Four live wearable bridges:** Marsh wraps improve speed and footing on marsh/tidal flat; a Float sash reduces water stamina cost but does not alter current force; Ridge cleats improve speed and footing on existing ridge terrain; and a Weather cape reduces gust-driven stability loss. Positive-condition gear auto-applies, only one deterministic winning duplicate is charged, and condition is spent on qualifying entered tiles rather than every animation frame.
9. **Versioned persistence:** outer game saves advance to version 2 with crafting stacks/gear, stable gear-ID allocation, inherited-Wayknot durability/setting fields, and sparse resource ecology. Version-1 sessions migrate without regenerating their checksummed world, with a canonical empty crafting pack and full seed-derived landscape.
10. **Manual stays authoritative:** desktop T and mobile ? now explain gathering, exact load, PACK / MAKE / MEND, wear, repair, dismantling, and the live/staged boundary. The mobile dialog uses fixed summary/tabs plus an independent safe-area scroll region and touch-sized actions.

Staged after this checkpoint, not current behavior:

- Crafted Reed mats, Tide anchors, and Wind knots are durable PACK items but do not deploy through F; only the six inherited numbered core pieces form live fields, Waychords, and Harps.
- The Field ladder does not bridge rock, the Trail pannier does not increase capacity, the Cargo rain shroud and Glimmer liner do not protect cargo, and harbor lockers do not exist yet.
- Procedural blocking rocks, ladder traversal, falls, dropped/tumbling/drifting cargo, live weather/exposure or magical-water cargo reactions, trust-money upgrades, and broader ecology/settlement consequences remain later authoritative integrations.

Alpha 0.3 feature evidence captured 2026-09-01:

- TypeScript and **49 Vitest files / 386 checks** are green, including deterministic resource generation/regrowth, desktop and touch gathering, exact capacity, v1 migration/v2 persistence, crafting atomicity, Wayknot wear/setting, four live wearable movement effects, KIT interaction, tutorial truthfulness, and malformed-save quarantine.
- The production and nested `/tideweft/` web gates, responsive visual review, scoped source-secret scan, and packaged Electron smoke are green. The 360 × 640 device probe opens PACK, switches to MAKE, verifies 44-pixel actions and explicit blockers, scrolls the panel, confirms world-tick advance, and restores focus on close. Exact feature commit `d22668b3b481ea937e08ece5c7a26b6eb8c18870` passed CI run `33514087307` and Pages run `33514087320`; live assets `index-CHONaHrC.js` and `index-cSiSqast.css` return HTTP 200.
- Version-promotion commit `ab270dbae92730d65ded3f56408d3f7032f18fec` is tagged `v0.3.0-alpha.1`. Main CI run `33514967147`, tag CI run `33514966921`, and Pages run `33514967288` succeeded; exact live assets `index-2OVXbDIf.js` and `index-cSiSqast.css` return HTTP 200.

## Reward-loop acceptance audit

1. **Immediate legibility — implemented:** commands have visual/audio/text responses and rejected state changes explain why.
2. **Early competence — implemented, timing playtest pending:** onboarding leads through movement, scan, promise, travel, arrival, and witness without an external manual.
3. **Graded success — implemented:** pristine, weathered, improvised, and rescued arrivals all move material and leave a trace.
4. **Autonomy — implemented structurally, seed audit pending:** contracts expose consequence/mood; travel supports manual and pointer paths; reports and route tending provide non-contract work.
5. **Relatedness — implemented:** promises name a requester and arrival copy identifies the person/harbor/project helped.
6. **Compounding impact — implemented:** deliveries and parts can cross the self-carrying threshold; earlier corridors later carry resident work.
7. **Voluntary closure — implemented:** new worlds have no timer or quota; Quiet Hour and the title save and safely stop simulation. There is no manual in-play pause or reward for stopping at a prescribed time.
8. **No coercion — implemented:** no streak, daily reset, paid/random payout, offline loss, or continue bonus.
9. **Low frustration — implemented:** cargo weathers instead of vanishing; camp, clinic rescue, and harbor handoff preserve progress and knowledge.
10. **Intrinsic core — qualitative playtest pending:** movement, planning, charting, and observing porters are built to stand without score escalation.

## Next replan gate

The first external Pages playtest promoted mobile obstruction and unreadable current failure above expansion work. Those fixes and the material/KIT slice now form Alpha 0.3; the immediate replan order is:

1. integrate the pure rock/ladder kernel as procedural traversal and fall rules through shared movement/pathfinding;
2. add physical cargo, current drift, impact damage, and condition-sensitive trust/compensation;
3. extend the finite seed-generated region into a safely persisted procedural world with dynamic settlement networks;
4. integrate spatial weather, magical water, exposure, broader ecology, upgrades, infrastructure, and settlement interactions;
5. build later alpine and glacier regions on the shared elevation/fall kernel, with visible ravines and crevasses, ladder spans, anchors, and rope-based descent and ascent.

Continue classifying later feedback into:

- comprehension failures that block the current loop;
- reward/pace problems that weaken restoration;
- topology problems that collapse route choice;
- presentation/accessibility defects;
- expansion requests.

Fix the first four before adding the fifth. Rewrite the next phase from observed play, not from feature-count momentum.
