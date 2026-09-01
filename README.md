# TIDEWEFT

> A restorative courier ecology about promises, tides, and the dependencies we create.

**Play Alpha 0.1:** https://19koda19.github.io/tideweft/

TIDEWEFT is a playable, original strand-type simulation game built with p5.js, TypeScript, Vite, and Electron. You cross a seeded estuary with physical supplies or an accountable signed report, strengthen the exact corridors you use, and watch autonomous settlements begin routing care through the network.

The same browser-pure game runs as a static GitHub Pages build and inside a sandboxed Electron shell.

## What is playable

Each seed creates a 64 × 48 tidal world with seven settlements, 42 named residents, five resource economies, changing weather, shortage-driven promises, and five civic projects. The main loop is:

1. Inspect a settlement and choose a useful promise.
2. Reach its origin, accept the cargo, and choose a route.
3. Travel manually or set a pointer destination; scan, change pace, and protect the load.
4. Deliver at any condition grade and see stock, trust, civic work, the route, and the chronicle respond.
5. Tend corridors with shared parts or carry a sourced report between settlements.
6. Let resident porters inherit active multi-hop routes while you build loops around fragile bridges.
7. End with Quiet Hour, a causal recap and an explicit safe stopping point.

The campaign resolves when every settlement belongs to a sufficiently redundant active network. The estuary remains open afterward for optional tending.

### Systems in the current slice

- Deterministic terrain, tides, global weather, production, consumption, shortages, residents, relationships, intentions, projects, contracts, and conservation checks.
- Continuous foot/skiff travel with stamina, active bracing, load stability, fragile shock, perishable freshness, scanning, discovery, three paces, emergency camp, and infrastructure-enabled rescue.
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
| Space | Pulse the Loom and reveal nearby terrain |
| E / Enter | Interact, deliver, or inspect the harbor underfoot |
| [ / ] | Move between Rest, Steady, and Swift pace |
| P | Pause or resume world time |
| Escape / right click | Cancel the current pointer destination |
| ? | Open controls and help |

Holding Shift braces the load without stopping; standing still or using Rest pace also restores stability. Completed caches shelter perishable food from freshness loss while you are there. A weathered delivery still counts; exhaustion creates camp or connected-clinic rescue instead of deleting progress.

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

`package:desktop` rebuilds the web target and writes an unpacked app under `release/`. The smoke command launches that packaged app with isolated user data, verifies the secure `app://bundle/` build, starts a world, checks the canvas/UI/simulation, and writes `artifacts/electron-smoke.png` unless `--no-screenshot` is supplied. `make:desktop` creates the platform ZIP.

Development artifacts are not code-signed or notarized. Public desktop distribution still requires signing for each target platform.

## GitHub Pages

[Alpha 0.1 is live](https://19koda19.github.io/tideweft/). [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) type-checks, tests, builds, uploads `dist/`, and deploys on pushes to `main` or manual dispatch. Vite uses `base: './'`; the HTML, web manifest, SVG icon, and bundled assets therefore work below an arbitrary repository subpath.

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
src/render/    p5.js instance-mode map renderer
src/ui/        accessible DOM interface
src/audio/     procedural Web Audio soundscape
src/platform/  IndexedDB/localStorage saves and import/export validation
electron/      hardened desktop shell and packaged-app smoke probe
public/        static manifest and code-native SVG icon
docs/          research, game design, and architecture decisions
```

See [the build ledger](./PLAN.md), [progress evidence](./PROGRESS.md), [game design](./docs/GAME_DESIGN.md), [research](./docs/RESEARCH.md), and [architecture](./docs/ARCHITECTURE.md).
