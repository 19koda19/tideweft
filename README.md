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
- Continuous foot/wading/skiff travel with stamina, active bracing, load stability, fragile shock, perishable freshness, depth sounding, discovery, three paces, emergency camp, swept-current recovery, and infrastructure-enabled rescue.
- A civic field kit: the Sounding line is available immediately; completed Crossings, Ferries, and Beacons can entrust visiting couriers with Marsh stilts, a Tide sail, and a Storm kite.
- An active route graph with stable multi-hop porter planning, weather closures, congestion, capacity, bridge detection, cycle rank, coverage, and resilience.
- Five permanent civic consequences: beacons support signals in storms, caches improve recovery, crossings shorten and harden routes, clinics enable connected rescue, and ferries increase capacity.
- Information as physical cargo: one signed count records its source, subject, resource, observation tick, quantity, and confidence. Its age remains visible when another settlement receives it.
- Three pressure postures—Hearth, Journey, and Gale—and three reward-neutral session shapes:
  - **Drift:** one complete promise.
  - **Weave:** one corridor milestone or two promises.
  - **Wander:** no quota.
- A responsive p5 map, accessible DOM panels, color-independent labels and patterns, reduced-motion support, live announcements, procedural sound, and contextual onboarding.

## Controls

The world canvas must have focus for travel keys. Buttons and contract cards remain usable with pointer or keyboard navigation.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Travel |
| Hold Shift while moving | Brace: trade speed for stability and fragile-cargo protection |
| Pointer click | Chart a destination |
| Space | Pulse the Loom to reveal nearby terrain and sound water depth |
| E / Enter | Interact, deliver, or inspect the harbor underfoot |
| [ / ] | Move between Rest, Steady, and Swift pace |
| P | Pause or resume world time |
| V / Header View control | Switch between playable Chart 2D and Relief 3D |
| Right-drag / Alt-drag | Orbit the Relief 3D camera |
| Mouse wheel | Zoom either world view |
| Escape / right click | Cancel the current pointer destination |
| ? | Open controls and help |

Holding Shift braces the load without stopping; standing still or using Rest pace also restores stability. Completed caches shelter perishable food from freshness loss while you are there. The HUD names the live cause whenever stability falls.

Water never becomes an arbitrary invisible wall. A sounding pulse marks nearby bathymetry; deeper water spends more stamina, while a Tide sail lowers that cost. Empty stamina on dry ground makes camp. Empty stamina in deep water yields steering to a deterministic adjacent current path toward the nearest safe bank; cargo quantity is preserved, condition weathers once, and a connected clinic can prevent the sweep while a ferry or Storm kite shortens it.

Physical cargo promises and signed reports are different jobs. A promise moves actual supplies from its **PICK UP** harbor to its **DELIVER** harbor. A signed stock report uses one pack slot but moves information only: it records a named harbor's current stock count and becomes useful after you carry it to the named recipient. The contextual E button says which action it will perform.

## Saves

The current game exposes one local autosave and a Continue card. It saves periodically, when the page is hidden or closed, when the title is opened, and when Quiet Hour begins. The simulation never advances while the game is closed.

IndexedDB is the primary store; localStorage is the fallback when IndexedDB is unavailable. The authoritative world has its own version and checksum, while the outer session save also preserves the player, chart, cargo/report, tutorial, session shape, and recap history. Corrupt or incompatible autosaves are ignored safely.

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

`package:desktop` rebuilds the web target and writes an unpacked app under `release/`. The smoke command launches that packaged app with isolated user data, verifies the secure `app://bundle/` build, starts a 96 × 72 world in Relief 3D, accepts and physically loads a promise, checks explicit delivery guidance, round-trips both views, verifies the Promises scroller at the minimum window size, and writes `artifacts/electron-smoke.png` unless `--no-screenshot` is supplied. `make:desktop` creates the platform ZIP.

Development artifacts are not code-signed or notarized. Public desktop distribution still requires signing for each target platform.

## GitHub Pages

[The current alpha is live](https://19koda19.github.io/tideweft/). [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) type-checks, tests, builds, uploads `dist/`, and deploys on pushes to `main` or manual dispatch. Vite uses `base: './'`; the HTML, web manifest, SVG icon, and bundled assets therefore work below an arbitrary repository subpath.

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
