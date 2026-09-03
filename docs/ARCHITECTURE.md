# Architecture decision record

## Decision

TIDEWEFT has one browser-pure game and two launch targets. Vite builds the same HTML, TypeScript, CSS, static manifest, SVG icon, and p5.js renderer for GitHub Pages and for a thin Electron shell. Electron does not host a second rules engine.

```text
keyboard / pointer / touch / DOM commands
              │
              ▼
100 ms player host ── every 10 steps ──> deterministic world tick
              │                               │
              │                               ├── events / chronicle
              │                               ├── active route graph
              │                               └── versioned world snapshot
              ▼
immutable render + UI projections ──> p5 Chart 2D or Relief 3D / accessible DOM / Web Audio

local-first IndexedDB (sticky localStorage fallback)
    └── game-session envelope ──> checksummed simulation envelope
```

## Boundaries

- `src/sim`: authoritative deterministic world, active graph, rules, invariants, views, and serialization. It imports no DOM, p5, Electron, Node, wall clock, or browser persistence.
- `src/game`: fixed-step host, player travel, command scheduling, session flow, save orchestration, onboarding, and presentation projections.
- `src/render`: two swappable p5 instance-mode presentations, cameras, world hit-testing, a pure chunked height-mesh builder, and shared renderer commands. Only the active Chart 2D or Relief 3D canvas loops or accepts input.
- `src/ui`: accessible DOM panels, controls, and a data-driven versioned field manual. It reads a view and emits typed commands; tutorial position and small-screen disclosure/sheet state are local presentation state rather than authoritative or saved state.
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

The interactive host advances player motion at 100 ms fixed steps and advances the authoritative world once per ten player steps. There is no manual in-play pause command: ordinary field play advances continuously. Opening the title or Quiet Hour sets the internal paused state, saves, and halts both clocks until the player continues. A capped accumulator prevents a hidden or stalled tab from applying an unbounded catch-up burst.

## Authoritative tick

One world tick:

1. Canonicalizes, validates, deduplicates, and applies queued commands.
2. Advances every resident's bounded perception state from a validated observation frame, or from an empty frame when input fails closed.
3. Advances tide and due weather.
4. Runs due recipes, consumption, resident needs/intentions, and settlement pressure.
5. Applies civic-project materials and permanent effects.
6. Generates shortage contracts from real stock differences.
7. Offers the player a protected choice window before residents may claim work.
8. Plans or replans eligible resident deliveries over the active route graph.
9. Advances porters, resolves arrivals, conserves cargo, and grades deliveries.
10. Reinforces used routes and tile traces, trust, and sourced knowledge.
11. Emits bounded causal events and asserts invariants.

The main thread is sufficient at the current seven-settlement/42-resident scale. The view boundary permits a future Worker move after profiling without introducing a second implementation of the rules.

## World representation

The playable slice uses:

- One segmented continuous world addressed by exact signed storage-region coordinates plus normalized fixed-point local coordinates. The original 96 × 72 seeded Perlin/fBm estuary is embedded unchanged at its established global address, and migrated Alpha 0.1 saves preserve their serialized 64 × 48 terrain there. Outside that authored extent, terrain, water, biome, current, and weather inputs come from call-order-independent global sampling.
- A bounded 120 × 120 spatial frame projects the nearby world for traversal and rendering. It slides by 16 tiles before the player leaves its 52-tile safety band; presentation coordinates, routes, cameras, pointer targets, terrain memory, and projected objects rebase by one exact delta while authoritative world positions do not change. Internal 96 × 72 regions remain persistence and streaming partitions only and never become player geography.
- Seven specialized settlements with five-resource inventories, recipes, stress, inter-settlement trust, sourced knowledge, and one civic project each.
- 42 original-estuary human residents with immutable semantic origin identity, deterministic display identity, roles, traits, needs, relationships, condition, bounded memories, player knowledge, intention, location, and optional active contract.
- Shortage-derived contracts with a named requester, real origin stock, destination need, due tick, carrier, cargo conservation, condition grade, and traveled trace cost.
- A complete set of potential inter-settlement corridors. Only routes above the strand-strength and condition threshold participate in autonomous service.

Presented prose is derived from structured facts. UI copy may explain a cause, but it cannot invent stock, a person, a project contribution, or a route event that the simulation did not record.

## Original-estuary human identity, perception, and ABOUT boundary

`src/sim/npcIdentity.ts` generates the current human slice from root seed, signed origin region, immutable settlement origin key, immutable actor ordinal, and origin role. A person's stable ID and display identity deliberately exclude the monotonic runtime entity ID and current household-array position. Generation-v1 freezes 226 normalized given names and 206 normalized family names behind deterministic golden tests; later dictionary changes require a new generation version, while already persisted people retain their exact identity. Curated temperament pairs avoid simple contradictions, while occupation-shaped gear and skills, age, height, build, appearance, and one or two background facts provide bounded variation.

The simulation persists four separate layers: immutable identity, dynamic condition, player knowledge, and actor perception. Traveling humans accumulate wetness, cold pressure, and exhaustion from live weather, gear, and relevant skills. Event-caused emotion can delay an assigned route through a weather hold; the hold is not yet physical shelter pathfinding. `observe-resident` moves a stranger only to recognized. `greet-resident` requires the exact prior observation tick and records one bounded memory before revealing only name, occupation, and home. Numeric entity IDs and raw need, skill, temperament, emotion, belief, confidence, or search coordinates never enter ordinary ABOUT copy.

`src/sim/actorPerception.ts` owns a deterministic fixed-point cognition kernel. Accepted vision and hearing observations become canonically ordered, decaying beliefs; a capped top-four attention set, bounded suspicion states, at most 24 active beliefs, and at most 16 salient memories prevent an actor from processing unbounded stimuli. Anonymous sound never carries an actor identity or exact source point. Only an identified visual observation can establish the courier's exact last-known area. Losing that sight starts a deterministic, expiring scan around the saved area; a new lawful visual contact reacquires the courier, while expiry returns the person to ordinary activity. The simulation advances every resident exactly once each world tick and prepares every next state before committing any of them, so malformed or partial observation frames cannot selectively teach one actor or half-advance the population.

The live game bridge applies that kernel only to the original harbor country's existing 42 humans observing the local courier. Each fixed player step contributes a bounded position sample with terrain-dependent exposure, movement salience, and—when caused—footfall, splash, or impact sound. Point-to-point visual contact uses the same short detail ranges, forward field, terrain elevation, ridges, dense rough ground, and built obstruction rules that protect player-facing detail; active weather shortens sight. Hearing remains anonymous and directional: rain and turbulent water near the listener create masking pressure, while wind changes reach and uncertainty. A person may face the highest lawful attention area or the next saved search probe, never the courier's hidden live position. Segmented world positions keep the underlying observation and saved-area contracts exact across signed and extreme coordinates, but this release does not generate humans outside the original harbor country.

The game projection places residents on non-deep tiles around their current original-estuary settlement and interpolates assigned porters along their real route. Both positions pass through the same ten-tile exact-detail perception mask before rendering, hit testing, ABOUT, or greeting. Chart and Relief emit the same typed resident command and maintain a minimum 44-pixel selection diameter. ABOUT is a pointer-local, pane-free non-modal DOM region: it never pauses the simulation, disappears when exact sight is lost, and leaves transparent space available to the world canvas. Quick labels, restrained text faces, short speech, and ABOUT behavior can truthfully say that a visible person is listening, investigating, watching, alert, or searching nearby; they do not reveal the hidden attention key, confidence, or saved search coordinate. Desktop, touch, Chart, and Relief consume the same projection.

Actor events are stamped at emission time only when their recorded route/settlement locus was directly observable. That persisted observation fact, player-caused commands, and a very small global-event allowlist feed the player chronicle. A porter walking into view later cannot reveal an unwitnessed historical event retroactively. Full causal events remain in authoritative simulation state.

This is not universal perception or the universal NPC architecture yet. Scent fields, environmental evidence and tracking, social reports and rumors, group communication, physical pursuit/search pathfinding, human-to-human sensing, generated people beyond the original estuary, persistence promotion tiers, dogs, bears, birds, deer, ownership and social networks, physical NPC inventory, negotiation, deterrence, and companion behavior remain explicit later slices.

## Derived biome/climate projection

The published `29ea8dc` checkpoint adds a pure `src/sim/biomes.ts` kernel without adding fields to `WorldState` or the fixed authoritative tick. Given the root seed, an existing terrain tile, grid height, optional live weather, and optional magical-water influence, it derives integer fixed-point rainfall, heat, salinity, exposure, and magical-water channels. Smooth keyed regional value noise is call-order independent and combines with the existing Perlin terrain channels; input bounds fail closed without mutation.

Long-lived baseline climate classifies one of seven stable IDs: tide-channel, brine-flat, reed-marsh, rain-meadow, sun-meadow, wind-ridge, or glimmerfen. A passing clear/mist/rain/storm front changes the current climate without renaming that baseline place. Biome coefficients expose bounded rain-retention, heat-load, salt-stress, and magical-resonance signals.

The immutable game projection derives and caches stable biome profiles from seed plus terrain, applies live weather only to the current climate layer, and attaches biome/climate views to projected tiles. `src/render/biomePresentation.ts` maps each discovered biome to one restrained color triplet and a redundant motif shared by Chart and Relief; fully undiscovered cells return no biome presentation. The local field readout names the derived biome. These remain presentation signals, not resources or saved state: courier exposure, cargo condition, ecology, infrastructure, and settlement rules do not consume them yet.

## Physical cargo environment and continuous custody

The pure `src/sim/cargoEnvironment.ts` evaluator preserves the five existing cargo properties—ordinary, heavy, fragile, perishable, and confidential—and resolves bounded resistance, spoilage, impact, current-coupling, and buoyancy traits. Runtime physical parcels consume that deterministic fixed-point result for rain, heat, cold, immersion, signed current, magical-water flux, and impact. They retain bounded condition, contamination, decay, force, motion, and canonically ordered causal evidence through save/reload.

Loose cargo is owned by exactly one persistent regional cargo world under one conserved custody manifest. When motion crosses an internal storage boundary, transfer removes the source and installs the same persistent parcel in the destination as one atomic operation; identity, payload, condition, momentum, event history, and Promise custody do not change. Tombstones and invariant checks reject replay, duplication, deletion, stale ownership, or mismatched Promise quantity. Ordinary presentation culling does not despawn an off-frame parcel, and an active lost Promise remains recovery-focused. Coarse unloaded-world drift and delivery compensation for recovered condition remain later work.

Inactive parcel regions live in an immutable, authenticated AVL index whose updates path-copy only the affected branches; fixed-step simulation, rendering, UI, and recovery query only the storage regions intersecting the bounded presentation frame. Each node caches its subtree size, integrity, and exact wire-size contribution, so local motion does not scan or clone the courier's lifetime cargo history. Persistence retains the existing version-2 flat regional array: save snapshots flatten it canonically, while load performs the deliberate full conservation audit and rebuilds a balanced runtime index.

## Derived rock/ladder foundation

`src/sim/rockTraversal.ts` is another pure, deterministic calculation contract. It derives bounded coherent outcrops and stable connected formation IDs from the root seed plus existing terrain, then classifies obstacle severity, walking blockage, fall-risk signal, and travel-cost signal. Its finite reusable ladder kit validates supported cardinal spans, formation continuity, occupancy, overlap, condition, placement, reclaim, and future damage without mutating caller state.

Nothing in the runtime, player/session state, pointer router, Chart/Relief projection, UI, or save envelope consumes this kernel yet. Therefore the candidate has no visible solid rock obstacles, no carried or deployed ladder, and no new fall outcome. Integrating the kernel will require one shared authoritative crossing query for manual and pointer travel plus explicit presentation and save migration; its existence alone is not a playable feature.

## Current recovery and discovery-safe cues

The player host treats water depth of **120,000** fixed-point units or greater as deep/current water for involuntary recovery. If stamina or the live physical stability percentage reaches zero there, the result enters the same controllable ADRIFT state. Dry-ground stamina exhaustion still camps, and water below the threshold does not trigger the sweep rule. ADRIFT retains clinic interception and ferry, Storm-kite, and Tide-anchor modifiers; cargo quantity is conserved and any carried cargo is weathered once rather than repeatedly on each recovery step.

One pure fixed-point hydrology function derives local strength and turbulence from authoritative water depth, bed roughness, tide, and weather without random state. Player footing and both renderers consume that same profile. The visible projection treats calm/rough surface character as directly observable information: discovered wet tiles receive bounded streamlines, foam, ambience, and sparse OHM/WHISSH voice within the exact-detail field. It never projects an exact unsounded depth or effort value. SOUND / SCAN alone adds analytical arrowheads and records bathymetry. Reduced motion freezes decorative phase while retaining the same physical heading and coarse surface character.

## Derived Wayknot topology

Tide Harps live at the game/projection boundary, not in authoritative simulation or save state. Given the existing fixed-ID `WayknotState` and `{ width, height }` grid, the pure topology pass:

1. normalizes the fixed six-piece kit without inventing pieces;
2. enumerates every pairwise-connected, non-collinear triangle containing exactly one Reed mat, one Tide anchor, and one Wind knot;
3. sorts canonical R/A/W component tuples;
4. exhaustively selects the maximum number of knot-disjoint candidates;
5. resolves equal counts by minimum total Euclidean perimeter, then lexicographic canonical IDs.

The fixed kit bounds the candidate space, so exact search is smaller and more auditable than a heuristic. A canonical ID such as `tide-harp:r1-a3-w5` survives input order and save/load because its components already have stable identities. A deterministic mapping supplies eight player-facing names: Glass-Ebb, Gullweather, Moon-Reed, Lantern Shoal, Mothcurrent, Brine Lullaby, Quiet Rigging, and Estuary Chime.

Containment is an inclusive integer-cross-product test against tile centers. At a containing tile, gameplay asks only whether at least one selected Harp is active: the extra recharge is one bounded +900 fixed-point units per 100 ms player step, never one bonus per overlap. A successful scan retains the player-centered radius-8 discovery/bathymetry pass and performs three more radius-6 passes centered on the Harp's fixed R/A/W knot tiles. Discovery and exact bathymetry remain separate arrays, so geometry alone cannot reveal hidden depth.

This topology adds no resource, cargo, settlement inventory, clock, random draw, authoritative world field, `PlayerState` field, or save format. Reclaiming or rebinding an existing Wayknot simply changes what will be derived on the next projection or fixed step.

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

## Carried information

Knowledge is scoped to settlements. Each record names the subject settlement and resource, reported quantity, age, confidence, and whether it is locally verified.

The player can witness one signed count at its source harbor and carry it in a one-slot document case. “Signed” means accountable in-world provenance, not cryptography: the report contains source, target, subject, resource, observed quantity, observation tick, and confidence. Delivery validates those fields, preserves its age, applies transport confidence loss, updates the recipient’s record, and emits `knowledge-shared`.

Remote inspector values therefore distinguish direct knowledge from unverified reports. The player can move information without pretending to own an omniscient dashboard.

The candidate presents these jobs separately from physical Promises. Report controls live in an inspector section labeled information-only and say **Sign info report → [harbor]**; the action signature intentionally excludes live route reliability, stock counters, and clock data. The report subtree refreshes only when report-action structure changes, and a pointer-down guard keeps the exact button alive until click or cancellation. This prevents live simulation refreshes from producing hover flicker or swallowing the click.

## Save contract

There are two nested versions:

1. `tideweft-world` contains the save-format version, rules version, checksum, and canonical `WorldState`. The perception slice uses embedded simulation format 4 and `tideweft-sim/6`; checksum-first migrations from supported format-1 through format-3 worlds add deterministic resident identity, condition, knowledge, memory, and an initially unaware actor-perception state at the already-completed tick before current invariants run.
2. `tideweft-session` contains the serialized world plus player motion/cargo/report/chart/Wayknot state, tutorial state, chosen posture, a legacy-compatible session-shape field, recap history, and a sealed pending-perception carry. The outer session is version 5. Versions 1 through 4 migrate with an empty carry at a world-tick boundary. Version 5 records the partial fixed-step phase, a bounded canonically ordered suffix of player sensory samples, and its next ordinal; save/load between world ticks therefore preserves an already-produced footstep, splash, or impact for the same eventual resident evaluation. Its sealed regional-travel payload remains version 2 and stores the exact global origin of the 120 × 120 presentation frame; valid version-1 98 × 74 payloads migrate into a player-centered frame without moving the courier or changing chart knowledge. It does not serialize derived Tide Harps or biome profiles.

The runtime currently writes one `autosave` slot on a world-tick interval, page visibility loss, page exit, title return, and Quiet Hour. It loads that slot for the Continue card and never simulates offline time.

The browser repository is local-first: it prefers IndexedDB and mirrors into localStorage. A compact local version fence stores the newest era/generation/timestamp/tick tuple and full-record fingerprint. Cross-store reads reconcile only after both configured stores are readable: known fence rollback produces `NewerSaveUnavailableError`, equal-version differing records produce `ConflictingSaveCopiesError`, and any partial or total read failure remains an unknown-authority error rather than trusting a plausible survivor. Record writes reject older or equal-version-different snapshots with `StaleSaveWriteError`. Overlapping runtime save requests coalesce to the newest complete snapshot behind the in-flight write, and only success for the latest requested sequence in the active era/generation clears persistent failure UI.

A separate versioned localStorage deletion journal is written before best-effort backend cleanup, so an inaccessible stale IndexedDB copy cannot reappear in a later repository instance; only a strictly newer save clears that marker. Deliberate replacement versions order by nonnegative safe-integer era, generation, timestamp, then play tick, allowing a saturated generation to carry into a new era without wrapping. A valid record whose session payload is unreadable, or a pair of different records claiming the same version, enters explicit recovery: neither world is adopted, the title requires a non-empty seed, and the visible six-surface warning remains until the higher-version replacement is durable. A generic repository read failure instead means absence is unproven: runtime creation, resume, lifecycle saves, and manual saves are blocked; the title disables Continue and both world-creation forms; and the player receives a persistent reload instruction. A stale running tab similarly enters a terminal reload-required state and never loops retries against the newer copy. Repository operations clone records, sort summaries deterministically, and isolate malformed data. The platform export/import envelope has a version, 20 MB limit, slot/metadata validation, future-format rejection, and object-URL cleanup. The current UI does not expose those import/export helpers yet.

The published checkpoint makes every new world perpetual and removes the 10/25-minute Drift/Weave title choice. `SessionShape` deliberately remains `drift | weave | wander` in the save/view contract: valid older values load and round-trip unchanged, while runtime objectives and milestone handling ignore them and remain open-ended. New saves use `wander`. Quiet Hour remains a voluntary save/recap boundary, and no server or cloud dependency is introduced.

Unsupported simulation versions fail rather than being guessed into a current world. Explicit checksum-first migrations preserve the prior 64 × 48 world under current Tide Choir rules; no migration silently regenerates terrain from its seed.

## Dual p5 presentation

Both renderers consume the same `TideweftView` and emit the same typed `RendererCommand`; neither owns simulation state. The projection carries the 120 × 120 frame's exact global tile origin alongside each selected Harp's canonical ID/label, fixed R/A/W knot tuple, three edges, center, and player-active boolean, the shared surface-current direction, projected roughness, derived per-tile biome/climate views, and knowledge-safe resident behavior cues. Chart 2D keeps color-independent terrain/biome motifs and draws bounded streamlines plus foam over perceived water, adding arrowheads only while SOUND / SCAN is active. Relief 3D consumes `buildTerrainMesh()` chunks with seam-safe normals and biome-aware material references, resets persistent emissive state before every ground batch, draws the same flow vocabulary over live water, and projects pointer rays back onto the height field for selection and movement. Its Harps raise three cords from their knot objects to a suspended faceted bell, with stable cord beads and a crown when active. Human sensing remains simulation-owned and unchanged by renderer choice, camera orbit, pointer type, or compact layout.

The composite renderer owns one disposable terrain-perception-memory store shared by Chart and Relief. It retains only a capped `120 × 120` scalar visibility array and eases lost terrain strength to its durable map baseline over 900 milliseconds; eight quantized Relief bands keep rebatching bounded. Clear-air terrain reaches at most 52 tiles, remains fully legible through 34, and uses an 18-tile distance feather; the exact-detail field remains 10 tiles. The buffer never retains projected terrain objects, entity/detail masks, labels, actions, hit targets, or save state. Exact water presentation, actors, parcels, resources, and interaction routing continue to consume the raw current-detail field and fail closed immediately. When the bounded frame slides, its terrain impression rebases by the same exact spatial delta as both cameras and active pointer routes. World/geometry identity changes, clock/tick regression, reload/destruction, and reduced-motion presentation otherwise settle the buffer without changing authoritative perception.

Relief cord roots and bell/label placement sample the discovery-masked surface rather than authoritative hidden elevation. Reduced-motion mode sets decorative bell bob and sway to zero but leaves cords, bell, labels, crown, and active words intact. Geometry memoization keys immutable projected Harp data, keeping these derived strings/cords out of the fixed-step rules.

The composed controller stops and hides the inactive p5 instance, releases held movement/brace input during a switch, retains the shared terrain-only impression across a quick view handoff, and falls back to Chart 2D if WebGL setup fails or its context is lost. A frame shift rebases the active Chart or Relief camera, held pointer target, and queued route in one render command rather than canceling input or snapping to a new center. The explicit view preference and terrain impression are local presentation state and are deliberately outside the authoritative save/checksum.

The shared world-tap router distinguishes fine from coarse pointers. Fine-pointer harbor input retains selection/inspection. Coarse-pointer harbor input emits an exact-center movement target in both Chart and Relief, so a touch player arrives on the interaction tile before the contextual action can open the inspector. Ordinary terrain taps keep their existing route behavior.

At widths at or below 44rem—or at short landscape sizes no wider than 64rem—CSS removes the duplicate desktop HUD and folds the detailed objective, Promises, and inspector surfaces when the UI shell's disclosure flag is false. The shell starts compact and exposes a native 44-pixel `PROMISES + / PROMISES −` button whose `aria-expanded` state controls only the identified Promises surface. The candidate strip is a translucent four-column projection of Stamina, Stability, Loom, and Cargo, with values and native progress semantics, followed by route and immediate safety/terrain cause. It deliberately hides keyboard-instruction copy; the large touch action dock remains reachable. The disclosure opens the existing scrollable Promises DOM as one full safe-area sheet, while settlement interaction opens the inspector as a mutually exclusive sheet. Neither disclosure nor sheet mode enters game saves.

The candidate's final CSS layer intentionally narrows the title and field palette to black/charcoal/off-white with small seafoam and gold semantic accents, hairline borders, and minimal blur. This is presentation-only; it does not fork DOM structure or gameplay between web and Electron.

## Versioned field manual

`src/ui/tutorialGuide.ts` is platform-neutral data with guide version 20, stable section/control IDs, audience filters, and explicit live/planned status. Its eighteen topics include the unbroken-world contract, original-estuary human identity and perception, OBSERVED-versus-KNOWN, GREET, and non-pausing ABOUT alongside premise, movement, Promises, reports, traversal, fieldcraft, routes, views/HUD, saves/Quiet Hour, accessibility, and build boundaries. The people lesson explains that movement, cover, weather, wind, rain, and river noise affect what these humans see or anonymously hear; losing sight yields a bounded last-known-area search rather than omniscient pursuit. The player-facing world lesson uses continuous E/N coordinates and states that no edge action, generation prompt, address banner, loading screen, or second click is required. Every completed feature phase must update this source and its focused tests before the mechanic can be considered explained.

`src/ui/tutorialDialog.ts` renders that one source into a native modal. Desktop T and the header control open a two-pane topic/page layout; the mobile ? opens the same content with a horizontal topic strip, independently scrolling page, safe-area sizing, and 44-pixel navigation. Opening the manual does not mutate simulation state or invoke the removed manual pause. The controller restores focus on close, and audience content is recomputed when the viewport changes.

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
7. Player traversal, stamina/stability sweep causes, deterministic recovery, tutorial, signed reports, and platform persistence.
8. Tide Harp candidate/selection/containment determinism, active/inactive recharge and four-origin sounding, cargo/inventory non-mutation, legacy save shape, UI copy, and discovery-safe/reduced-motion render geometry.
9. Derived biome stability/weather transforms/projection/presentation, coarse-pointer harbor routing, field-manual audiences/content, report-action refresh guards, four-vital mobile HUD copy, pure cargo-environment evaluation, and pure rock/ladder derivation/validation.
10. Existing-human visual occlusion and salience, anonymous directional hearing, weather/water masking, wind propagation, bounded attention/suspicion, last-known search/reacquisition/give-up, whole-frame fail-closed input, save migration, and knowledge-safe quick/ABOUT projection.
11. Vite production build under relative paths.
12. Packaged Electron launch, visible title controls, `app://` resource load, preserved-estuary content inside the 120 × 120 moving frame, deterministic R1/A3/W5 Harp placement and remote echo, both Chart/Relief canvas switches, actual Relief bell/cord evidence, 1,440 × 900 / 960 × 640 / 927 × 640 / 700 × 640 desktop layouts plus 390 × 700 portrait and 844 × 390 landscape mobile-sheet probes, Node-global absence, zero renderer warnings/resource failures, and separate title/game/mobile screenshots.

The Phase 10 gate passes TypeScript, 28 Vitest files / 205 checks, the production and nested-path web gates, that extended packaged smoke, `git diff --check`, and a scoped source secret scan. Exact commit `6f74fe9e016ba566116e2085b05ecf2988213754` is published: CI run `33494152504` and Pages run `33494152310` succeeded, and the live HTML serves the inspected `index-CKlzWR1L.css` and `index-D30XtHH3.js` assets with HTTP 200 responses. The deployment is an untagged preview; `v0.2.0-alpha.1` remains unchanged.

The focused mobile/current hotfix adds unit coverage for both sweep causes, discovery-safe current geometry, shared direction projection, and compact HUD disclosure/copy. Its gate passes TypeScript, 31 test files / 221 checks, production and nested-path web builds, the scoped public-source secret scan, and packaged desktop/mobile smoke with no renderer warnings or resource failures. Exact commit `f8dc8482cbd10df1352f87a3a28bbee4abcf8de2` is live after CI `33503039473` and Pages `33503039480`; the exact inspected assets return HTTP 200.

The perpetual/manual-pause, interface/manual/report, visible-biome, shared Chart/Relief water palette, and pure cargo-environment/rock-ladder work is published at `29ea8dc60f309ebc43bcf8c1b567cfacf2bf8f95`. Focused coverage exercises perpetual defaults plus legacy-value round trips, bounded/call-order-independent climate derivation, projection and discovery-safe biome/water presentation, touch harbor routing, manual audience/content completeness, report refresh guards, mobile HUD copy, inert calm cargo exposure, bounded material responses, canonical causes, deterministic forces, outcrop stability, and ladder validation. The integrated gate passes 40 test files / 311 checks, nested-path web smoke, runtime-only packaged-ASAR inspection, and desktop/mobile packaged smoke; CI `33508654754` and Pages `33508654540` succeeded. Live ladder/fall traversal, physical dropped-cargo simulation, upgrades, and weather/magic-water effects on cargo, ecology, infrastructure, or settlements remain future architecture.
