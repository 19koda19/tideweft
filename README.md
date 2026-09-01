# TIDEWEFT

> A restorative courier ecology about promises, tides, and the dependencies we create.

**Play Alpha 0.3:** https://19koda19.github.io/tideweft/

TIDEWEFT is a playable, original strand-type simulation game built with p5.js, TypeScript, Vite, and Electron. You cross a seeded estuary with physical supplies or an accountable signed report, strengthen the exact corridors you use, and watch autonomous settlements begin routing care through the network.

The name came from the image that inspired the game: every crossing is a loose thread until tide, memory, and shared use weave it into something other people can trust.

The same browser-pure game runs as a static GitHub Pages build and inside a sandboxed Electron shell.

## Alpha 0.3 snapshot

Alpha 0.3 grows the three earlier slices with a fourth fieldcraft layer:

- **Tide Choir:** routes must be physically surveyed before shared parts can improve them. Closing a unique loop of three or more surveyed harbor legs awakens a one-time communal harmony and permanently strengthens that circuit.
- **Wild Reaches:** new worlds now span 96 × 72 tiles, keep every harbor at least 14 Manhattan tiles apart, and use seeded multi-octave gradient Perlin noise. Water is traversable, sounded depth scales stamina cost, civic field tools change difficult crossings, and deep-water exhaustion becomes a recoverable swept-away state.
- **Relief estuary:** the same authoritative terrain now drives a playable p5/WebGL height field with lit chunked land, translucent water, depth fog, 3D routes, harbors, porters, cargo, soundings, pointer picking, zoom, and an orbiting camera. Relief water shares Chart's shallow/channel/deep palette, with only discovery-safe tide and biome conditioning instead of one uniform cyan sheet. **Relief 3D** is the default where WebGL is available; **Chart 2D** is a persisted, reduced-motion-friendly fallback.
- **Living commons:** nine seed-derived material families now grow visibly in suitable biomes. Desktop and touch gathering feed one exact shared pack, while the anywhere **KIT** turns those finds into six prepared components and eleven durable tools through mobile-safe **PACK / MAKE / MEND** tabs.

Playtest fixes also make the HUD lighter, keep the Promises list genuinely scrollable even in shallow windows, stop live contract-card updates from swallowing clicks, state why stability is changing, and put explicit **PICK UP** / **DELIVER** instructions on each physical cargo promise.

The published mobile/current hotfix replaces the desktop HUD on portrait phones and short landscape phones with one compact LED-style field strip. **PROMISES + / PROMISES −** opens a full safe-area Promises sheet; settlement interaction opens a mutually exclusive full-size inspector, so the two cannot stack over each other. Discovered wet surface in both Chart and Relief views carries sparse direction arrows before entry without exposing unsounded depth. In water at or above **120,000** depth, either empty stamina or empty stability yields control to the same recoverable deterministic sweep path.

The Alpha 0.3 feature baseline is published at commit `d22668b`. It includes the earlier perpetual/mobile/biome work, visible seed-derived material patches, renewable one-unit gathering, one exact shared pack limit, anywhere-accessible crafting and mending, persistent condition for crafted gear and the inherited Wayknots, and malformed-save hardening. Phase 9 introduced the six fixed, reusable Wayknots at `eb12db0` and hardened them at `1bc136e`; those Reed mats, Tide anchors, and Wind knots can be bound or reclaimed with **F**, change authoritative movement and pointer-route costs, appear physically in both views, and form a small **Waychord** where unlike fields overlap.

The published **Phase 10: Tide Harps** preview lets one Reed mat, one Tide anchor, and one Wind knot tune a compact, non-collinear triangle. The game derives every valid triangle, selects an exact maximum knot-disjoint set, then breaks equal solutions by smaller total perimeter and canonical component IDs. The eight deterministic instrument names are **Glass-Ebb**, **Gullweather**, **Moon-Reed**, **Lantern Shoal**, **Mothcurrent**, **Brine Lullaby**, **Quiet Rigging**, and **Estuary Chime**.

## What is playable

Each new seed currently creates a finite 96 × 72 tidal region with a well-separated harbor network, 42 named residents, five resource economies, changing weather, shortage-driven promises, and five civic projects. Alpha 0.1's existing 64 × 48 saves migrate without regenerating or discarding their world. Procedurally extending regions and settlement networks are planned; the field manual never presents the current region size as the final world boundary. The main loop is:

1. Choose a physical cargo promise in the scrollable **Promises** panel.
2. Reach its explicit **PICK UP** harbor and choose **Pick up cargo here** (or press E when it is the only local pickup).
3. Travel manually or set a pointer destination; scan, change pace, and protect the load.
4. Deliver at any condition grade and see stock, trust, civic work, the route, and the chronicle respond.
5. Survey corridors by traveling between their endpoint harbors, then spend shared parts to tend the route. Separately, you may carry a sourced stock report between settlements.
6. Let resident porters inherit active multi-hop routes while you build loops around fragile bridges.
7. End with Quiet Hour, a causal recap and an explicit safe stopping point.

The campaign resolves when every settlement belongs to a sufficiently redundant active network. The estuary remains open afterward for optional tending.

### Systems in the current slice

- Deterministic multi-octave gradient Perlin terrain, tides, global weather, production, consumption, shortages, residents, relationships, intentions, projects, contracts, and conservation checks.
- Continuous foot/wading/skiff travel with stamina, active bracing, load stability, fragile shock, perishable freshness, depth sounding, discovery, visible surface-current direction, three paces, emergency camp, swept-current recovery, and infrastructure-enabled rescue.
- A civic field kit: the Sounding line is available immediately; completed Crossings, Ferries, and Beacons can entrust visiting couriers with Marsh stilts, a Tide sail, and a Storm kite.
- Nine visible, deterministic raw materials—Bladderkelp, Driftwood, Glimmer spore, Shellstone, Sunfiber, Hookstone, Cordreed, Pitchmoss, and Stormlichen—distributed by seed and biome. Desktop players stand on a discovered patch and press E; a touch tap routes to that exact patch and gathers one unit automatically on arrival. Ordinary harvest always leaves one living unit, and depleted stock regrows only through active world ticks, with bounded weather influence and no offline catch-up.
- One exact **16,000 milli-load** pack shared by Promise cargo, a signed report, natural finds, prepared components, and crafted gear. **KIT** is available anywhere without pausing: I opens **PACK**, C opens **MAKE**, and the mobile **KIT** control opens the same safe-area **PACK / MAKE / MEND** surface. Six component recipes feed eleven durable gear recipes; crafting is atomic, MEND restores condition for an explicit material cost, and DISMANTLE returns deliberately lossy salvage.
- Six reusable inherited Wayknots carried from the start: Reed mats ease mudflat/marsh footing, Tide anchors reduce nearby water effort and shorten current recovery, and Wind knots soften exposed-ground gusts. Press F on suitable terrain to bind one; flooded flats first ask for a Space sounding so the field action cannot reveal hidden depth. Binding spends 8% condition, reclaiming the same numbered piece spends 4%, and a fresh placement gives half strength for three world ticks before setting fully. Reclaiming never restores durability; carry the piece and use MEND to repair it. Unlike overlapping fields hum as a Waychord and recharge the Loom a little faster.
- Four crafted wearables already affect authoritative travel and spend condition only when their help is used: Marsh wraps improve marsh/tidal-flat speed and footing; a Float sash lowers water stamina cost but does **not** weaken the current; Ridge cleats improve speed and footing on existing ridge terrain; and a Weather cape softens gust-driven stability loss. Broken gear gives no benefit.
- Phase 10 untagged preview: the selected one-of-each Wayknot triangles become Tide Harps without minting currency or adding a save field. Standing inside or on one adds a single bounded **+900 Loom charge per 100 ms player tick**, on top of normal and Waychord recharge. A successful Space pulse keeps its radius-8 player sounding and adds three radius-6 discovery-and-depth soundings—one from each knot—so the instrument has four truthful origins in all.
- An active route graph with stable multi-hop porter planning, weather closures, congestion, capacity, bridge detection, cycle rank, coverage, and resilience.
- Five permanent civic consequences: beacons support signals in storms, caches improve recovery, crossings shorten and harden routes, clinics enable connected rescue, and ferries increase capacity.
- Information as a separate carried document: one signed count records its source, subject, resource, observation tick, quantity, and confidence without moving the source's supplies. Its age remains visible when another settlement receives it.
- Three pressure postures—Hearth, Journey, and Gale—inside one perpetual world with no session timer or delivery quota. **Quiet Hour** remains a voluntary save-and-recap stop.
- A responsive p5 map, accessible DOM panels, color-independent labels and patterns, reduced-motion support, live announcements, procedural sound, and contextual onboarding.

The current published checkpoint removes the old Drift/Weave 10/25-minute title choice and creates every new world with perpetual semantics. Earlier saves may still contain `drift`, `weave`, or `wander`; all three values load and round-trip safely, but none restores a quota or timed objective. The manual in-play pause command is also gone: opening Quiet Hour or the title safely stops the simulation and saves, while ordinary play keeps the world moving. Its title and field chrome use a restrained near-monochrome, hairline treatment instead of stacked glass panes.

On phones, Alpha 0.3 exposes four translucent, labeled vitals—**Stamina, Stability, Loom, and Cargo**—plus a touch action dock, while keeping keyboard hints out of the travel HUD. Harbor taps chart a route to the exact harbor center so arrival does not race a menu. Promises and settlement details remain independent safe-area sheets. The former mobile Title slot now opens the live **KIT** inventory and crafting surface; a 44-pixel **☾ Quiet Hour** control retains the saved recap and return-to-title path. Desktop **T** and the mobile **?** open the same versioned, independently scrollable field manual; its live/planned boundary is updated whenever a mechanic changes. Physical cargo remains in Promises, while inspector controls say **Sign info report → [harbor]** and identify reports as information-only, one-document-slot journeys. Those stable, touch-sized controls are not rebuilt under the pointer as their facts refresh.

Seven derived biomes—Tide Channel, Brine Flat, Reed Marsh, Rain Meadow, Sun Meadow, Wind Ridge, and Glimmerfen—are projected from the seeded terrain and presented with restrained color-and-motif language in both Chart and Relief. Their bounded rainfall, heat, salinity, exposure, and magical-water signals remain derived rather than separately saved. Alpha 0.3 uses biome identity to choose natural material families and active weather to bound their regrowth, but climate still does **not** cause courier exposure, material-specific cargo damage, infrastructure reactions, or settlement consequences.

Two other deterministic modules remain foundation-only. The cargo-environment evaluator calculates bounded material traits, condition/contamination/decay pressures, readable causes, and future loose-cargo current/lift forces. The rock/ladder kernel derives coherent outcrops, crossing risk/cost, and a finite reusable ladder kit. Neither is connected to live runtime movement, rendering, UI, cargo entities, or saves. Although recipes can now make a Field ladder, Trail pannier, Cargo rain shroud, Glimmer liner, and additional Wayknot-shaped gear, ladder traversal, pannier capacity, shroud/liner cargo protection, crafted-Wayknot deployment, harbor lockers, falls, loose cargo, rocks, exposure, upgrades, and cargo/weather/magic-water consequences remain staged rather than playable.

## Controls

The world canvas must have focus for travel keys. Buttons and contract cards remain usable with pointer or keyboard navigation.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Travel |
| Hold Shift while moving | Brace: trade speed for stability and fragile-cargo protection |
| Pointer click / tap | Chart a destination; a touch harbor tap routes to its exact center, while a visible resource tap routes to that exact patch and gathers on arrival |
| Space | Pulse the Loom to reveal nearby terrain and sound water depth; an active Tide Harp echoes from all three knots |
| E / Enter | Interact, deliver, inspect a harbor, or gather one discovered resource unit underfoot |
| F | Bind the terrain-appropriate inherited Wayknot, or reclaim the one underfoot; both actions spend persistent condition |
| I | Open or close KIT on PACK |
| C | Open KIT directly on MAKE |
| [ / ] | Move between Rest, Steady, and Swift pace |
| V / Header View control | Switch between playable Chart 2D and Relief 3D |
| Right-drag / Alt-drag | Orbit the Relief 3D camera |
| Mouse wheel | Zoom either world view |
| Escape / right click | Cancel the current pointer destination |
| T on desktop / ? button on mobile | Open the complete field manual |
| PROMISES + / PROMISES − (portrait or short landscape phones) | Open or fold the full-size Promises sheet; the four vitals and touch controls remain available |
| KIT (mobile) | Open the safe-area PACK / MAKE / MEND inventory and crafting surface |

Holding Shift braces the load without stopping; standing still or using Rest pace also restores stability. Completed caches shelter perishable food from freshness loss while you are there. The HUD names the live cause whenever stability falls.

Desktop world clicks route to resources but never harvest remotely: step onto the marked tile and press E. On touch, tapping a visible resource is the explicit gather command, so it routes to the exact tile and takes one unit on arrival. Either path rejects the whole action without changing the patch if the pack lacks room or only its final living unit remains. KIT can be opened between harbors; the tide, weather, residents, and route continue while PACK, MAKE, or MEND is visible.

There is no manual in-play pause. Open **Quiet Hour** for a saved causal recap, or open the title to save and step away; either safely halts world and player ticks until you continue.

Relief 3D travel is camera-relative: after orbiting, WASD/arrows continue to mean screen-left, screen-right, forward, and back. Hidden terrain remains flat possibility for rendering, labels, and pointer picking until it is genuinely discovered; the discovery mesh signature is cached per immutable projection instead of rehashed every animation frame.

Water never becomes an arbitrary invisible wall. Sparse arrows show the direction of moving water on already discovered wet surface, but their fixed shape and spacing reveal no unsounded depth. A sounding pulse marks nearby bathymetry; deeper water spends more stamina, while a Tide sail lowers that cost. Empty stamina on dry ground makes camp. In deep/current water at or above 120,000 depth, either stamina or stability reaching zero yields steering to a deterministic adjacent current path toward the nearest safe bank; cargo quantity is preserved, condition weathers once, and a connected clinic can prevent the sweep while a ferry or Storm kite shortens it.

Physical cargo promises and signed reports are different jobs. A promise moves actual supplies from its **PICK UP** harbor to its **DELIVER** harbor. A signed stock report uses one document slot but moves information only: it records a named harbor's current stock count and becomes useful after you carry it to the named recipient. Cargo choices live in Promises; reports live under the harbor inspector's separately labeled **Signed reports · information only** section. Its stable button says **Sign info report → [harbor]**, while the contextual action names the handoff it will perform.

## Saves

The current game exposes one local autosave and a Continue card. It saves periodically, when the page is hidden or closed, when the title is opened, and when Quiet Hour begins. The simulation never advances while the game is closed.

Saves are local-first and remain on the player's device. IndexedDB is the primary store; localStorage is a sticky runtime fallback if opening or a later transaction fails. Reads choose the newest available copy, overlapping lifecycle/autosave requests coalesce behind an in-flight write, and a durable deletion marker prevents a stale primary copy from resurrecting after failover. The Alpha 0.3 version-2 outer session preserves the player, chart, cargo/report, crafting stacks and durable gear, the next stable gear ID, inherited-Wayknot condition/setting state, sparse field-resource depletion/regrowth, tutorial, the legacy-compatible session-shape field, and recap history. The complete resource catalog is re-derived from seed and terrain rather than bloating the save, and its ecology advances only during active world ticks. Version-1 sessions migrate with an empty crafting pack, pristine compatible core Wayknots, and a canonical full landscape; corrupt or incompatible autosaves are ignored safely. New worlds use perpetual `wander`; valid older `drift` and `weave` fields remain readable without regaining timed semantics.

Tide Harps are still recomputed from fixed-ID inherited-Wayknot placements and terrain dimensions. The Harp derivation itself adds no currency, stored topology, timer, or migration burden; an older save that resumes with compatible Wayknot placements derives the same selected instruments.

The platform layer already validates multi-slot list/load/remove and versioned JSON import/export, including size and future-format guards. Those import/export controls are not yet exposed in the game menu.

## Local development

Requirements: Node.js 22.12 or newer. CI uses the version in [`.nvmrc`](./.nvmrc).

```bash
npm ci
npm run dev:web
```

The web game runs at `http://127.0.0.1:5173`. Launch Vite and Electron together with:

```bash
npm run dev
```

Both p5 presentations consume the same immutable projection and emit the same commands; changing view cannot fork simulation state. The selector safely persists an explicit choice, falls back when WebGL is unavailable, and starts reduced-motion users in Chart 2D unless they deliberately selected Relief 3D before.

Run all web quality gates:

```bash
npm run check
```

Or run them separately:

```bash
npm run typecheck
npm run test:ci
npm run build:web
npm run preview
```

## Desktop release

```bash
npm run package:desktop
npm run smoke:desktop
npm run make:desktop
```

`package:desktop` rebuilds the web target and writes an unpacked app under `release/`. The smoke command launches that packaged app with isolated user data, proves the text-only title controls are visibly painted, verifies the secure `app://bundle/` build, starts a 96 × 72 world in Relief 3D, accepts and physically loads a promise, and binds a real Wayknot through the field-action button. It then reloads a deterministic R1/A3/W5 Tide Harp fixture through production save validation, verifies projection/HUD agreement, sounds a remote tile that the ordinary player-radius pulse cannot reach, round-trips Chart and Relief, and checks non-overlapping objective/Promises layouts at 1,440 × 900, 960 × 640, and 927 × 640. At 700 × 640, 390 × 700 portrait, and 844 × 390 landscape it proves the compact HUD defaults closed, replaces the desktop HUD, exposes touch-size controls and current/safety guidance, opens a full-width scrollable Promises sheet without covering the strip or action dock, keeps the inspector mutually exclusive, and closes cleanly again. A separate 360 × 640 probe opens the real non-pausing KIT modal, checks PACK / MAKE / MEND and exact load, verifies all recipe targets and blockers, physically scrolls MAKE, and proves close restores focus. Unless `--no-screenshot` is supplied, the run writes `artifacts/electron-title-smoke.png`, `artifacts/electron-mobile-smoke.png`, and `artifacts/electron-smoke.png`. `make:desktop` creates the platform ZIP.

The Phase 10 source also gives Chart 2D persistent bowed strings and a labeled center mark, while Relief 3D suspends an actual faceted bell on three cords above the discovery-safe surface. Active-state marks remain legible without color; reduced motion freezes decorative bob and sway. The candidate passed TypeScript, 28 Vitest files / 205 checks, the production and nested-path web gates, a scoped source secret scan, and the extended packaged smoke with no renderer warnings or resource failures. Fresh 2,880 × 1,678 title and 2,880 × 1,800 Relief captures show the start controls, actual bell/cords, active Harp copy, explicit delivery guidance, and unobstructed Promises rail. GitHub CI run `33494152504` and Pages run `33494152310` then succeeded for exact commit `6f74fe9e016ba566116e2085b05ecf2988213754`; the live page serves `index-CKlzWR1L.css` and `index-D30XtHH3.js`, both returning HTTP 200. This remains an untagged preview, not a new Alpha tag.

The focused mobile/current hotfix passes TypeScript, **31 Vitest files / 221 checks**, the production and nested `/tideweft/` web smoke, the scoped public-source secret scan, and the expanded packaged-device gate with no renderer warnings or resource failures. Exact commit `f8dc8482cbd10df1352f87a3a28bbee4abcf8de2` is published: CI run `33503039473` and Pages run `33503039480` succeeded, and the live origin serves the inspected `index-DTJENodE.css` and `index-CGVn5Ai9.js` assets with HTTP 200.

The perpetual/mobile/biome checkpoint passes TypeScript, **40 Vitest files / 311 checks**, the production and nested `/tideweft/` smoke, the scoped source-secret scan, and a runtime-only packaged-ASAR smoke across desktop, compact portrait, and short landscape layouts. Exact commit `29ea8dc60f309ebc43bcf8c1b567cfacf2bf8f95` is live after successful CI run `33508654754` and Pages run `33508654540`; the inspected `index-DIX0Efr_.js` and `index-Cc-fErTR.css` assets return HTTP 200.

The Alpha 0.3 field ecology / KIT checkpoint passes TypeScript, **49 Vitest files / 386 checks**, the production build, the nested `/tideweft/` smoke, a scoped source-secret scan, and the packaged desktop/mobile/KIT gate with no renderer warnings or resource failures. Fresh title, portrait-gameplay, and Relief captures were inspected. Exact feature commit `d22668b3b481ea937e08ece5c7a26b6eb8c18870` passed CI run `33514087307` and Pages run `33514087320`; the live `index-CHONaHrC.js` and `index-cSiSqast.css` assets both return HTTP 200.

Development artifacts are not code-signed or notarized. Public desktop distribution still requires signing for each target platform.

## GitHub Pages

[The current alpha is live](https://19koda19.github.io/tideweft/). [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) type-checks, tests, builds, uploads `dist/`, and deploys on pushes to `main` or manual dispatch. Vite uses `base: './'`; the HTML, web manifest, SVG icon, and bundled assets therefore work below an arbitrary repository subpath.

The Alpha 0.3 feature baseline is verified at commit `d22668b3b481ea937e08ece5c7a26b6eb8c18870`; successful CI run `33514087307` and Pages run `33514087320` produced the exact inspected `index-CHONaHrC.js` and `index-cSiSqast.css` assets.

To publish:

1. Create or connect the GitHub repository and push this project to its `main` branch.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. Run **Deploy GitHub Pages**, or push a new commit to `main`.
4. Confirm the deployment URL reported by the workflow environment.

The source repository is [19koda19/tideweft](https://github.com/19koda19/tideweft), and `main` tracks its `origin/main` branch. Pages is static: saves stay on the device, and real cross-player asynchronous structures would require a deliberately designed backend.

## Design ethics

TIDEWEFT aims for autonomy, competence, relatedness, legible causality, recoverable setbacks, and satisfying closure. It has no paid or randomized rewards, daily streaks, expiring chores, offline decay, punishment for taking a break, or infinite numerical treadmill.

## Repository map

```text
src/sim/       deterministic authoritative world, graph, and rules
src/game/      fixed-step host, player travel, session flow, and projections
src/render/    shared Chart 2D and Relief 3D p5.js presentations
src/ui/        accessible DOM interface
src/audio/     procedural Web Audio soundscape
src/platform/  IndexedDB/localStorage saves and import/export validation
electron/      hardened desktop shell and packaged-app smoke probe
public/        static manifest and code-native SVG icon
docs/          research, game design, and architecture decisions
```

See [the build ledger](./PLAN.md), [progress evidence](./PROGRESS.md), [game design](./docs/GAME_DESIGN.md), [research](./docs/RESEARCH.md), and [architecture](./docs/ARCHITECTURE.md).
