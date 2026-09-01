# Architecture decision record

## Decision

TIDEWEFT has one browser-pure game and two launch targets. Vite builds the same HTML, TypeScript, CSS, static manifest, SVG icon, and p5.js renderer for GitHub Pages and for a thin Electron shell. Electron does not host a second rules engine.

```text
keyboard / pointer / DOM commands
              │
              ▼
100 ms player host ── every 10 steps ──> deterministic world tick
              │                               │
              │                               ├── events / chronicle
              │                               ├── active route graph
              │                               └── versioned world snapshot
              ▼
immutable render + UI projections ──> p5 Chart 2D or Relief 3D / accessible DOM / Web Audio

IndexedDB (localStorage fallback)
    └── game-session envelope ──> checksummed simulation envelope
```

## Boundaries

- `src/sim`: authoritative deterministic world, active graph, rules, invariants, views, and serialization. It imports no DOM, p5, Electron, Node, wall clock, or browser persistence.
- `src/game`: fixed-step host, player travel, command scheduling, session flow, save orchestration, onboarding, and presentation projections.
- `src/render`: two swappable p5 instance-mode presentations, cameras, world hit-testing, a pure chunked height-mesh builder, and shared renderer commands. Only the active Chart 2D or Relief 3D canvas loops or accepts input.
- `src/ui`: accessible DOM panels and controls. It reads a view and emits typed commands.
- `src/audio`: procedural Web Audio feedback. It unlocks only after player interaction.
- `src/platform`: browser save repositories plus export/import validation.
- `electron`: hardened local protocol, desktop lifecycle, Forge packaging, and production smoke mode. There is no preload or renderer Node API.

## Determinism contract

The same rules version, pressure mode, seed, initial scenario, and canonically ordered commands produce the same completed state hash and events. Rendering frame rate, a save/load boundary, or batched headless stepping cannot change simulation results.

Authoritative simulation state uses integers:

- Terrain coordinates and quantities are integers.
- Trust, condition, confidence, tide, needs, and similar ratios use `0..1_000_000` fixed point.
- IDs are monotonic and never reused inside a world.
- Command and entity conflict resolution has explicit stable ordering.
- `Math.random`, wall-clock reads, locale-dependent ordering, and p5 noise are forbidden in `src/sim`.

Random decisions use a keyed generator derived from the root seed plus domain, tick, entity, purpose, and ordinal. An unrelated new draw therefore does not scramble every later result.

The interactive host advances player motion at 100 ms fixed steps and advances the authoritative world once per ten player steps. Pausing, the title screen, and Quiet Hour halt both. A capped accumulator prevents a hidden or stalled tab from applying an unbounded catch-up burst.

## Authoritative tick

One world tick:

1. Canonicalizes, validates, deduplicates, and applies queued commands.
2. Advances tide and due weather.
3. Runs due recipes, consumption, resident needs/intentions, and settlement pressure.
4. Applies civic-project materials and permanent effects.
5. Generates shortage contracts from real stock differences.
6. Offers the player a protected choice window before residents may claim work.
7. Plans or replans eligible resident deliveries over the active route graph.
8. Advances porters, resolves arrivals, conserves cargo, and grades deliveries.
9. Reinforces used routes and tile traces, trust, and sourced knowledge.
10. Emits bounded causal events and asserts invariants.

The main thread is sufficient at the current seven-settlement/42-resident scale. The view boundary permits a future Worker move after profiling without introducing a second implementation of the rules.

## World representation

The playable slice uses:

- A 96 × 72 tile field for new worlds, generated from seeded gradient Perlin/fBm elevation, moisture, channel meander, and roughness. It carries authoritative terrain, live tidal water depth, traversal cost, trace strength, player discovery, and a separate bathymetry mask. Migrated Alpha 0.1 saves preserve their serialized 64 × 48 field.
- Seven specialized settlements with five-resource inventories, recipes, stress, inter-settlement trust, sourced knowledge, and one civic project each.
- 42 named residents with roles, traits, needs, relationships, intention, location, and optional active contract.
- Shortage-derived contracts with a named requester, real origin stock, destination need, due tick, carrier, cargo conservation, condition grade, and traveled trace cost.
- A complete set of potential inter-settlement corridors. Only routes above the strand-strength and condition threshold participate in autonomous service.

Presented prose is derived from structured facts. UI copy may explain a cause, but it cannot invent stock, a person, a project contribution, or a route event that the simulation did not record.

## Active graph and multi-hop logistics

The active route graph is an authoritative subsystem rather than decoration:

- A route becomes eligible for porter automation at the strand threshold and remains unavailable when its condition is too low.
- Stable Dijkstra planning can chain any number of active legs. Tie-breaking uses route IDs.
- Edge cost combines base travel time, condition, reliability, current weather, active resident load, route traffic, and capacity.
- Severe storms can close marginal routes; a completed endpoint beacon lowers the reliability threshold.
- A porter stores both its route-ID sequence and settlement sequence. Its visible location advances leg by leg, and completion reinforces every used leg.
- Capacity rises with strand strength, and a completed endpoint ferry adds another porter slot.

Graph analysis computes active routes, connected components, largest-component coverage, bridges, cycle rank, degree resilience, and a combined resilience score. Campaign resolution requires full service coverage, at least two independent cycles, few remaining bridges, and redundant incident routes for almost every settlement. This makes topology—not raw score—the end condition.

## Civic projects are rule changes

Projects consume their named resource during scheduled simulation updates. Completion emits a causal event and changes authoritative behavior:

| Project | Permanent effect |
| --- | --- |
| Beacon | Raises incident-route reliability and local knowledge confidence; helps marginal active routes remain legible in severe storms; entrusts a visiting courier with a Storm kite |
| Cache | Improves incident-route condition, accelerates player stamina/load-stability recovery, and halts perishable-food decay while sheltered at that harbor |
| Crossing | Raises incident-route condition, reduces their base travel time, and entrusts a visiting courier with Marsh stilts |
| Clinic | Relieves local stress/needs and turns exhaustion on an incident active route into connected rescue |
| Ferry | Raises incident-route reliability, reduces travel time, adds porter capacity, and entrusts a visiting courier with a Tide sail |

Deliveries can contribute directly to a building project when the cargo matches its required resource. The contract UI explains this before acceptance, and the chronicle records completion and effect afterward.

## Information cargo

Knowledge is scoped to settlements. Each record names the subject settlement and resource, reported quantity, age, confidence, and whether it is locally verified.

The player can witness one signed count at its source harbor and carry it in a one-slot document case. “Signed” means accountable in-world provenance, not cryptography: the report contains source, target, subject, resource, observed quantity, observation tick, and confidence. Delivery validates those fields, preserves its age, applies transport confidence loss, updates the recipient’s record, and emits `knowledge-shared`.

Remote inspector values therefore distinguish direct knowledge from unverified reports. The player can move information without pretending to own an omniscient dashboard.

## Save contract

There are two nested versions:

1. `tideweft-world` contains the save-format version, rules version, checksum, and canonical `WorldState`. Deserialization checks shape, version, checksum, and every invariant.
2. `tideweft-session` contains the serialized world plus player motion/cargo/report/chart state, tutorial state, chosen posture/session shape, and recap history.

The runtime currently writes one `autosave` slot on a world-tick interval, page visibility loss, page exit, title return, and Quiet Hour. It loads that slot for the Continue card and never simulates offline time.

The browser repository prefers IndexedDB and falls back to localStorage. Repository operations clone writes, sort summaries deterministically, and isolate malformed records. The platform export/import envelope has a version, 20 MB limit, slot/metadata validation, future-format rejection, and object-URL cleanup. The current UI does not expose those import/export helpers yet.

Unsupported simulation versions fail rather than being guessed into a current world. Explicit checksum-first migrations preserve the prior 64 × 48 world under current Tide Choir rules; no migration silently regenerates terrain from its seed.

## Dual p5 presentation

Both renderers consume the same `TideweftView` and emit the same typed `RendererCommand`; neither owns simulation state. Chart 2D retains dense labels, color-independent terrain motifs, and low-motion readability. Relief 3D consumes `buildTerrainMesh()` chunks with seam-safe normals and material references, draws live per-tile water, and projects pointer rays back onto the height field for selection and movement. Its orbit, zoom, fog, and scan ripples are cosmetic local state.

The composed controller stops and hides the inactive p5 instance, releases held movement/brace input during a switch, and falls back to Chart 2D if WebGL setup fails or its context is lost. The explicit view preference is local presentation state and is deliberately outside the authoritative save/checksum.

## Electron security

Production loads packaged `dist/` files through a registered standard, secure `app://bundle/` protocol with URL decoding and path-containment checks. Development allows only the exact `http://127.0.0.1:5173` Vite origin.

The BrowserWindow has:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `webviewTag: false`

The app enables Chromium’s process sandbox, denies permissions and devices, denies new windows/webviews, blocks unexpected navigation, applies a restrictive production CSP, packages in ASAR, and flips the supported Electron fuses. The packaged smoke path checks that renderer Node globals remain absent.

## Web and GitHub Pages

Vite uses `base: './'`, a single HTML entry, relative build assets, and no history-router deep links. `public/manifest.webmanifest` and the code-native SVG icon are copied into `dist/` and referenced relatively, so the build works beneath an arbitrary GitHub project subpath and under `app://bundle/`.

The Pages workflow runs `npm ci`, type-checking, the deterministic suite, and the web build before uploading only `dist/`. Static Pages has local saves only; cloud continuity or genuine cross-player asynchronous strands would require an explicit backend and abuse/privacy design.

## Verification layers

1. RNG vectors and same-seed generation.
2. Generated-world invariants and long-run soak.
3. Replay equivalence across batched stepping.
4. Save/reload continuation and checksum rejection.
5. Economy/cargo conservation and legal contract transitions.
6. Active-graph pathfinding, storms, congestion, topology metrics, and project effects.
7. Player traversal, stability, recovery, tutorial, signed reports, and platform persistence.
8. Vite production build under relative paths.
9. Packaged Electron launch, `app://` resource load, exact 96 × 72 world probe, both Chart/Relief canvas switches, minimum-window Promises scrolling, Node-global absence, and screenshot evidence.
