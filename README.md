# TIDEWEFT

> A restorative courier ecology about promises, tides, and the dependencies we create.

**Play Alpha 0.2:** https://19koda19.github.io/tideweft/

TIDEWEFT is a playable, original strand-type simulation game built with p5.js, TypeScript, Vite, and Electron. You cross a seeded estuary with physical supplies or an accountable signed report, strengthen the exact corridors you use, and watch autonomous settlements begin routing care through the network.

The name came from the image that inspired the game: every crossing is a loose thread until tide, memory, and shared use weave it into something other people can trust.

The same browser-pure game runs as a static GitHub Pages build and inside a sandboxed Electron shell.

## Alpha 0.2 snapshot

Alpha 0.2 is built in three connected slices:

- **Tide Choir:** routes must be physically surveyed before shared parts can improve them. Closing a unique loop of three or more surveyed harbor legs awakens a one-time communal harmony and permanently strengthens that circuit.
- **Wild Reaches:** new worlds now span 96 × 72 tiles, keep every harbor at least 14 Manhattan tiles apart, and use seeded multi-octave gradient Perlin noise. Water is traversable, sounded depth scales stamina cost, civic field tools change difficult crossings, and deep-water exhaustion becomes a recoverable swept-away state.
- **Relief estuary:** the same authoritative terrain now drives a playable p5/WebGL height field with lit chunked land, translucent water, depth fog, 3D routes, harbors, porters, cargo, soundings, pointer picking, zoom, and an orbiting camera. **Relief 3D** is the default where WebGL is available; **Chart 2D** is a persisted, reduced-motion-friendly fallback.

Playtest fixes also make the HUD lighter, keep the Promises list genuinely scrollable even in shallow windows, stop live contract-card updates from swallowing clicks, state why stability is changing, and put explicit **PICK UP** / **DELIVER** instructions on each physical cargo promise.

The locally verified mobile/current hotfix replaces the desktop HUD on portrait phones and short landscape phones with one compact LED-style field strip. **PROMISES + / PROMISES −** opens a full safe-area Promises sheet; settlement interaction opens a mutually exclusive full-size inspector, so the two cannot stack over each other. The strip keeps the active pickup/delivery route, stamina/stability safety, truthful ground/water terrain, and contextual actions visible. Discovered wet surface in both Chart and Relief views carries sparse direction arrows before entry without exposing unsounded depth. In water at or above **120,000** depth, either empty stamina or empty stability now yields control to the same recoverable deterministic sweep path.

The latest published post-alpha checkpoint is **Phase 10: Tide Harps** at commit `6f74fe9`. It remains an untagged preview: the Alpha 0.2 tag has not moved. Phase 9 introduced the six fixed, reusable Wayknots at `eb12db0` and hardened them at `1bc136e`; those Reed mats, Tide anchors, and Wind knots can be bound or reclaimed with **F**, change authoritative movement and pointer-route costs, appear physically in both views, and form a small **Waychord** where unlike fields overlap.

The published **Phase 10: Tide Harps** preview lets one Reed mat, one Tide anchor, and one Wind knot tune a compact, non-collinear triangle. The game derives every valid triangle, selects an exact maximum knot-disjoint set, then breaks equal solutions by smaller total perimeter and canonical component IDs. The eight deterministic instrument names are **Glass-Ebb**, **Gullweather**, **Moon-Reed**, **Lantern Shoal**, **Mothcurrent**, **Brine Lullaby**, **Quiet Rigging**, and **Estuary Chime**.

## What is playable

Each new seed creates a 96 × 72 tidal world with seven well-separated settlements, 42 named residents, five resource economies, changing weather, shortage-driven promises, and five civic projects. Alpha 0.1's existing 64 × 48 saves migrate without regenerating or discarding their world. The main loop is:

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
- Six reusable Wayknots carried from the start: Reed mats ease mudflat/marsh footing, Tide anchors reduce nearby water effort and shorten current recovery, and Wind knots soften exposed-ground gusts. Press F on suitable terrain to bind one; flooded flats first ask for a Space sounding so the field action cannot reveal hidden depth. Stand on a bound knot and press F again to reclaim the same numbered piece. Unlike overlapping fields hum as a Waychord and recharge the Loom a little faster.
- Phase 10 untagged preview: the selected one-of-each Wayknot triangles become Tide Harps without minting currency or adding a save field. Standing inside or on one adds a single bounded **+900 Loom charge per 100 ms player tick**, on top of normal and Waychord recharge. A successful Space pulse keeps its radius-8 player sounding and adds three radius-6 discovery-and-depth soundings—one from each knot—so the instrument has four truthful origins in all.
- An active route graph with stable multi-hop porter planning, weather closures, congestion, capacity, bridge detection, cycle rank, coverage, and resilience.
- Five permanent civic consequences: beacons support signals in storms, caches improve recovery, crossings shorten and harden routes, clinics enable connected rescue, and ferries increase capacity.
- Information as physical cargo: one signed count records its source, subject, resource, observation tick, quantity, and confidence. Its age remains visible when another settlement receives it.
- Three pressure postures—Hearth, Journey, and Gale—and three reward-neutral session shapes:
  - **Drift:** one complete promise.
  - **Weave:** one corridor milestone or two promises.
  - **Wander:** no quota.
- A responsive p5 map, accessible DOM panels, color-independent labels and patterns, reduced-motion support, live announcements, procedural sound, and contextual onboarding.

Drift and Weave remain part of this candidate's current title flow. The next compatibility-preserving pass will remove the 10/25-minute framing and make every new world perpetual by default; this is planned, not yet shipped. Following slices are planned for ladder-gated rock formations, physical dropped cargo that can tumble or drift and lose condition, and a safely available upgrade surface. Those are roadmap items, not claims about the current build.

## Controls

The world canvas must have focus for travel keys. Buttons and contract cards remain usable with pointer or keyboard navigation.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Travel |
| Hold Shift while moving | Brace: trade speed for stability and fragile-cargo protection |
| Pointer click | Chart a destination |
| Space | Pulse the Loom to reveal nearby terrain and sound water depth; an active Tide Harp echoes from all three knots |
| E / Enter | Interact, deliver, or inspect the harbor underfoot |
| F | Bind the terrain-appropriate Wayknot, or reclaim the one underfoot |
| [ / ] | Move between Rest, Steady, and Swift pace |
| P | Pause or resume world time |
| V / Header View control | Switch between playable Chart 2D and Relief 3D |
| Right-drag / Alt-drag | Orbit the Relief 3D camera |
| Mouse wheel | Zoom either world view |
| Escape / right click | Cancel the current pointer destination |
| ? | Open controls and help |
| PROMISES + / PROMISES − (portrait or short landscape phones) | Open or fold the full-size Promises sheet; route, safety, and actions remain visible |

Holding Shift braces the load without stopping; standing still or using Rest pace also restores stability. Completed caches shelter perishable food from freshness loss while you are there. The HUD names the live cause whenever stability falls.

Relief 3D travel is camera-relative: after orbiting, WASD/arrows continue to mean screen-left, screen-right, forward, and back. Hidden terrain remains flat possibility for rendering, labels, and pointer picking until it is genuinely discovered; the discovery mesh signature is cached per immutable projection instead of rehashed every animation frame.

Water never becomes an arbitrary invisible wall. Sparse arrows show the direction of moving water on already discovered wet surface, but their fixed shape and spacing reveal no unsounded depth. A sounding pulse marks nearby bathymetry; deeper water spends more stamina, while a Tide sail lowers that cost. Empty stamina on dry ground makes camp. In deep/current water at or above 120,000 depth, either stamina or stability reaching zero yields steering to a deterministic adjacent current path toward the nearest safe bank; cargo quantity is preserved, condition weathers once, and a connected clinic can prevent the sweep while a ferry or Storm kite shortens it.

Physical cargo promises and signed reports are different jobs. A promise moves actual supplies from its **PICK UP** harbor to its **DELIVER** harbor. A signed stock report uses one pack slot but moves information only: it records a named harbor's current stock count and becomes useful after you carry it to the named recipient. The contextual E button says which action it will perform.

## Saves

The current game exposes one local autosave and a Continue card. It saves periodically, when the page is hidden or closed, when the title is opened, and when Quiet Hour begins. The simulation never advances while the game is closed.

Saves are local-first and remain on the player's device. IndexedDB is the primary store; localStorage is a sticky runtime fallback if opening or a later transaction fails. Reads choose the newest available copy, overlapping lifecycle/autosave requests coalesce behind an in-flight write, and a durable deletion marker prevents a stale primary copy from resurrecting after failover. The authoritative world has its own version and checksum, while the outer session save also preserves the player, chart, cargo/report, Wayknots, tutorial, session shape, and recap history. Corrupt or incompatible autosaves are ignored safely. The planned perpetual-world default will continue using this safe browser-local foundation rather than require a server.

Tide Harps are recomputed from the existing fixed-ID Wayknot placements and terrain dimensions. They add no currency, inventory, timer, authoritative world member, player member, save-format version, or migration burden; an older save that resumes with its Wayknots derives the same selected instruments.

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

`package:desktop` rebuilds the web target and writes an unpacked app under `release/`. The smoke command launches that packaged app with isolated user data, proves the text-only title controls are visibly painted, verifies the secure `app://bundle/` build, starts a 96 × 72 world in Relief 3D, accepts and physically loads a promise, and binds a real Wayknot through the field-action button. It then reloads a deterministic R1/A3/W5 Tide Harp fixture through production save validation, verifies projection/HUD agreement, sounds a remote tile that the ordinary player-radius pulse cannot reach, round-trips Chart and Relief, and checks non-overlapping objective/Promises layouts at 1,440 × 900, 960 × 640, and 927 × 640. At 700 × 640, 390 × 700 portrait, and 844 × 390 landscape it proves the compact HUD defaults closed, replaces the desktop HUD, exposes a 44-pixel disclosure control and current/safety guidance, opens a full-width scrollable Promises sheet without covering the strip or action dock, keeps the inspector mutually exclusive, and closes cleanly again. Unless `--no-screenshot` is supplied, it writes `artifacts/electron-title-smoke.png`, `artifacts/electron-mobile-smoke.png`, and `artifacts/electron-smoke.png`. `make:desktop` creates the platform ZIP.

The Phase 10 source also gives Chart 2D persistent bowed strings and a labeled center mark, while Relief 3D suspends an actual faceted bell on three cords above the discovery-safe surface. Active-state marks remain legible without color; reduced motion freezes decorative bob and sway. The candidate passed TypeScript, 28 Vitest files / 205 checks, the production and nested-path web gates, a scoped source secret scan, and the extended packaged smoke with no renderer warnings or resource failures. Fresh 2,880 × 1,678 title and 2,880 × 1,800 Relief captures show the start controls, actual bell/cords, active Harp copy, explicit delivery guidance, and unobstructed Promises rail. GitHub CI run `33494152504` and Pages run `33494152310` then succeeded for exact commit `6f74fe9e016ba566116e2085b05ecf2988213754`; the live page serves `index-CKlzWR1L.css` and `index-D30XtHH3.js`, both returning HTTP 200. This remains an untagged preview, not a new Alpha tag.

The focused mobile/current hotfix passes TypeScript, **31 Vitest files / 221 checks**, the production and nested `/tideweft/` web smoke, the scoped public-source secret scan, and the expanded packaged-device gate with no renderer warnings or resource failures. The inspected local web build emits `index-DTJENodE.css` and `index-CGVn5Ai9.js`; commit, Pages publication, and live verification remain pending.

Development artifacts are not code-signed or notarized. Public desktop distribution still requires signing for each target platform.

## GitHub Pages

[The current alpha is live](https://19koda19.github.io/tideweft/). [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) type-checks, tests, builds, uploads `dist/`, and deploys on pushes to `main` or manual dispatch. Vite uses `base: './'`; the HTML, web manifest, SVG icon, and bundled assets therefore work below an arbitrary repository subpath.

The live origin is verified at Phase 10 commit `6f74fe9e016ba566116e2085b05ecf2988213754`; successful CI run `33494152504` and Pages run `33494152310` produced the exact inspected `index-CKlzWR1L.css` and `index-D30XtHH3.js` assets.

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
