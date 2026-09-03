# TIDEWEFT

> A restorative courier ecology about promises, tides, and the dependencies we create.

**Play the current Alpha:** https://19koda19.github.io/tideweft/

TIDEWEFT is a playable, original strand-type simulation game built with p5.js, TypeScript, Vite, and Electron. You cross a seeded estuary with physical supplies or an accountable signed report, strengthen the exact corridors you use, and watch autonomous settlements begin routing care through the network.

The name came from the image that inspired the game: every crossing is a loose thread until tide, memory, and shared use weave it into something other people can trust.

The same browser-pure game runs as a static GitHub Pages build and inside a sandboxed Electron shell.

## Alpha 0.3 snapshot

Alpha 0.3 grows the three earlier slices with a fourth fieldcraft layer:

- **The deliberate return:** every new and resumed estuary now uses the one official ruleset, **A CHALLENGING HARD**. A valid local save resumes automatically; deliberate replacement requires the exact `restartrestartrestart` phrase, **Unlock restart**, and a non-empty new seed. The two-stage form survives ordinary title refreshes and phone-keyboard blur without writing anything until START succeeds once. Offline Patch Notes, visible save-health recovery, longer unladen travel, compact mobile instruments, Relief rotation, and a world-north compass make that single path legible.
- **Tide Choir:** routes must be physically surveyed before shared parts can improve them. Closing a unique loop of three or more surveyed harbor legs awakens a one-time communal harmony and permanently strengthens that circuit.
- **Wild Reaches:** new worlds now span 96 × 72 tiles, keep every harbor at least 14 Manhattan tiles apart, and use seeded multi-octave gradient Perlin noise. Water is traversable, sounded depth scales stamina cost, civic field tools change difficult crossings, and deep-water exhaustion becomes a recoverable swept-away state.
- **Relief estuary:** the same authoritative terrain now drives a playable p5/WebGL height field with lit chunked land, dark depth-ordered water, depth fog, 3D routes, harbors, porters, cargo, soundings, pointer picking, zoom, and an orbiting camera. Relief water shares Chart's shallow/channel/deep palette, but uses a stronger discovery-masked opacity floor so shallow water is visibly dark, channels are darker, and deep water is darkest instead of washing into lit land. **Relief 3D** is the default where WebGL is available; **Chart 2D** is a persisted, reduced-motion-friendly fallback.
- **Living field presentation:** Relief now renders the same drizzle, rain, and squall visible in Chart, while sparse wind threads expose direction and relative force under any sky. Fine-pointer movement adds only a few eased pixels of presentation depth, labels settle with the camera, and inverse picking keeps commands exact. Touch, coarse pointers, and reduced-motion preferences receive a steady view. The HUD, compass, Promises, inspector, and actions now use floating typography, hairlines, and restrained symbols directly above the unobstructed world—no field panes or edge shelves. The title opens into a bounded deterministic tide field whose short synthesized crescendo waits for a lawful first tap or key.
- **People in the field:** the compatibility estuary's 42 humans now have stable seed-derived identities, coherent temperament and skill details, short histories, changing weather condition, bounded memories, and persistent player knowledge. People appear around their home settlements or on active routes. Click or tap somebody in direct sight for a pane-free **ABOUT** view; physical observations are separated from facts learned by getting within speaking distance and choosing **GREET**. ABOUT never pauses danger or exposes an internal identity, exact need score, or distant event.
- **Living commons:** nine seed-derived material families now grow visibly in suitable biomes. Desktop and touch gathering feed one exact shared pack, while the anywhere **KIT** turns those finds into six prepared components and eleven durable tools through mobile-safe **PACK / MAKE / MEND** tabs.
- **Footing and physical parcels:** stability is a live 0–100% physical-balance calculation, not a second stamina bar or accumulated drain. Actual speed, turning, grade, roughness, moisture, local water force, wind, load, footwear, fixtures, and BRACE determine the currently supported percentage; unchanged conditions hold one value and a safer bank recalculates it immediately. Hazardous entries can still deterministically stumble or fall, briefly alter the courier's color and silhouette, speak a tiny Atari-like callout, damage one exact cargo lot, and separate persistent parcels that drift, tumble, weather, save, reload, and remain recoverable.
- **Responsive river recovery:** desktop Shift now braces even when the document body or HUD has focus, with immediate BRACING copy and a color-independent planted marker in Chart and Relief. If stamina or stability still collapses in deep current, the courier becomes ADRIFT instead of being ejected to a bank: hold WASD/arrows or tap toward shallows to paddle, release movement to float and recover breath, then rise only after finding standable water with enough stamina. The current remains authoritative, full packs weaken a stroke, and separated physical parcels continue their own journey.
- **The unbroken world:** the courier can now walk beyond the original estuary without an edge action or transition. A bounded 120 × 120 presentation frame shifts in small increments while movement, routes, camera, weather, water, chart knowledge, Wayknots, and physical cargo retain their exact world positions. Ordinary play exposes one continuous E/N address rather than internal partitions. Existing 64 × 48 and 96 × 72 estuaries remain intact inside the continuous world.

Playtest fixes also make the HUD lighter, keep the Promises list genuinely scrollable even in shallow windows, stop live contract-card updates from swallowing clicks, state why stability is changing, and put explicit **PICK UP** / **DELIVER** instructions on each physical cargo promise.

Portrait, short-landscape, and desktop layouts now use the same pane-free field facts over the world: terrain and biome, WATER or GROUND and known depth, effort, current stability percentage and cause, continuous E/N coordinates, and measured FPS. **PROMISES + / PROMISES −** opens a mutually exclusive safe-area workspace on compact screens. Discovered wet surface in Chart and Relief carries moving streamlines and sparse foam; SOUND / SCAN adds analytical arrowheads, while exact unsounded depth remains private. In water at or above **120,000** depth, either empty stamina or empty current stability enters the same controllable ADRIFT state on keyboard and touch.

The Alpha 0.3 feature baseline is published at commit `d22668b`. It includes the earlier perpetual/mobile/biome work, visible seed-derived material patches, renewable one-unit gathering, one exact shared pack limit, anywhere-accessible crafting and mending, persistent condition for crafted gear and the inherited Wayknots, and malformed-save hardening. Phase 9 introduced the six fixed, reusable Wayknots at `eb12db0` and hardened them at `1bc136e`; those Reed mats, Tide anchors, and Wind knots can be bound or reclaimed with **F**, change authoritative movement and pointer-route costs, appear physically in both views, and form a small **Waychord** where unlike fields overlap.

The published **Phase 10: Tide Harps** preview lets one Reed mat, one Tide anchor, and one Wind knot tune a compact, non-collinear triangle. The game derives every valid triangle, selects an exact maximum knot-disjoint set, then breaks equal solutions by smaller total perimeter and canonical component IDs. The eight deterministic instrument names are **Glass-Ebb**, **Gullweather**, **Moon-Reed**, **Lantern Shoal**, **Mothcurrent**, **Brine Lullaby**, **Quiet Rigging**, and **Estuary Chime**.

## What is playable

Each seed now creates one continuous deterministic terrain world. The preserved original 96 × 72 tidal country contains its well-separated harbor network, 42 persistent generated human residents, five resource economies, changing weather, shortage-driven promises, and five civic projects. Walking beyond that old extent requires no edge action or transition: terrain is prepared ahead, exact negative coordinates work, and the same chart, cargo, route, camera, and field kit continue. Alpha 0.1's existing 64 × 48 saves retain their authored world rather than being regenerated. Generated distant settlements and populations, dogs, wildlife, companions, and full actor-to-actor ecology remain later vertical slices; empty country is not padded with cloned harbors, people, or free loot. The main loop is:

1. Choose a physical cargo promise in the scrollable **Promises** panel.
2. Reach its explicit **PICK UP** harbor and choose **Pick up cargo here** (or press E when it is the only local pickup).
3. Travel manually or set a pointer destination; safe diagonal legs steer as one smooth heading without cutting named hazards, while uncertain water, terrain-driven footing warnings, and BRACE still govern the crossing. Pace changes automatically with stillness, recovery, downhill motion, and assisting current.
4. Deliver at any condition grade and see stock, trust, civic work, the route, and the chronicle respond.
5. Survey corridors by traveling between their endpoint harbors, then spend shared parts to tend the route. Separately, you may carry a sourced stock report between settlements.
6. Let resident porters inherit active multi-hop routes while you build loops around fragile bridges.
7. End with Quiet Hour, a causal recap and an explicit safe stopping point.

The campaign resolves when every settlement belongs to a sufficiently redundant active network. The estuary remains open afterward for optional tending.

### Systems in the current slice

- Deterministic multi-octave gradient Perlin terrain, tides, global weather, production, consumption, shortages, residents, relationships, intentions, projects, contracts, and conservation checks.
- Stable semantic identities for the original harbor country's 42 humans, including names composed from 226 given-name and 206 family-name entries, seed-derived appearance, occupation-shaped visible gear, coherent temperament pairs, skills, bounded background histories, weather-responsive condition, limited event-led emotion, bounded memories, and player knowledge. Selection and **ABOUT** remain gated by the same direct-detail field in Chart and Relief; **GREET** reveals only name, occupation, and home.
- Continuous terrain in every direction with exact global sampling, negative-coordinate support, a bounded 120 × 120 moving frame, deterministic prefetch, sparse durable world changes, persistent cartography, and exact Chart/Relief camera rebasing. The quiet HUD reports E/N world coordinates; remote Promise and report guidance retains its harbor name, global distance, and bearing.
- Continuous foot/wading/skiff travel with stamina, active bracing, terrain-driven footing and stability, deterministic stumbles/falls, automatically derived Rest/Steady/Swift state, fragile shock, perishable freshness, depth sounding, discovery, visible magnitude-scaled surface-current direction, emergency camp, controllable ADRIFT recovery, and infrastructure-enabled rescue.
- A civic field kit: the Sounding line is available immediately; completed Crossings, Ferries, and Beacons can entrust visiting couriers with Marsh stilts, a Tide sail, and a Storm kite.
- Nine visible, deterministic raw materials—Bladderkelp, Driftwood, Glimmer spore, Shellstone, Sunfiber, Hookstone, Cordreed, Pitchmoss, and Stormlichen—distributed by seed and biome. Desktop players stand on a discovered patch and press E; a touch tap routes to that exact patch and gathers one unit automatically on arrival. Ordinary harvest always leaves one living unit, and depleted stock regrows only through active world ticks, with bounded weather influence and no offline catch-up.
- One exact **18,000 milli-load** pack shared by Promise cargo, a signed report, natural finds, prepared components, and crafted gear. Every carried lot has a stable physical identity. **KIT** is available anywhere without pausing: I opens **PACK**, C opens **MAKE**, and the mobile **KIT** control opens the same safe-area **PACK / MAKE / MEND** surface. DROP releases an exact stack quantity or a whole Promise/gear lot into the world; crafting, mending, dismantling, reports, and Promise handoffs transact against those exact lots without duplication. Six component recipes feed eleven durable gear recipes; crafting is atomic, MEND restores condition for an explicit material cost, and DISMANTLE returns deliberately lossy salvage. Older 16,000-load Alpha saves migrate upward without losing contents.
- Six reusable inherited Wayknots carried from the start: Reed mats ease mudflat/marsh footing, Tide anchors reduce nearby water effort and shorten current recovery, and Wind knots soften exposed-ground gusts. Press F on suitable terrain to bind one; flooded flats first ask for a Space sounding so the field action cannot reveal hidden depth. Binding spends 8% condition, reclaiming the same numbered piece spends 4%, and a fresh placement gives half strength for three world ticks before setting fully. Reclaiming never restores durability; carry the piece and use MEND to repair it. Unlike overlapping fields hum as a Waychord and recharge the Loom a little faster.
- Four crafted wearables already affect authoritative travel and spend condition only when their help is used: Marsh wraps improve marsh/tidal-flat speed and footing; a Float sash lowers water stamina cost but does **not** weaken the current; Ridge cleats improve speed and footing on existing ridge terrain; and a Weather cape softens gust-driven stability loss. Broken gear gives no benefit.
- Phase 10 untagged preview: the selected one-of-each Wayknot triangles become Tide Harps without minting currency or adding a save field. Standing inside or on one adds a single bounded **+900 Loom charge per 100 ms player tick**, on top of normal and Waychord recharge. A successful Space pulse keeps its radius-8 player sounding and adds three radius-6 discovery-and-depth soundings—one from each knot—so the instrument has four truthful origins in all.
- An active route graph with stable multi-hop porter planning, weather closures, congestion, capacity, bridge detection, cycle rank, coverage, and resilience.
- Five permanent civic consequences: beacons support signals in storms, caches improve recovery, crossings shorten and harden routes, clinics enable connected rescue, and ferries increase capacity.
- Information as a separate carried document: one signed count records its source, subject, resource, observation tick, quantity, and confidence without moving the source's supplies. Its age remains visible when another settlement receives it.
- One player-facing ruleset: **A CHALLENGING HARD**. New worlds and older resumed saves use the same wild-pressure, perpetual rules with no timer or delivery quota. Accessibility can change input and presentation, never the reward economy or authoritative hazard rules. **Quiet Hour** remains a voluntary save-and-recap stop.
- A responsive p5 map, accessible DOM panels, color-independent labels and patterns, reduced-motion support, live announcements, procedural sound, and contextual onboarding.

The current source removes the old Drift/Weave 10/25-minute and Hearth/Journey/Gale title choices. Every world uses perpetual **A CHALLENGING HARD** semantics. Earlier saves may still contain compatible legacy shape/posture values, but loading normalizes their active pressure to the one ruleset and never restores a quota or timed objective. The manual in-play pause command is also gone: opening Quiet Hour or the title safely stops the simulation and saves, while ordinary play keeps the world moving. Its title and field chrome use a restrained near-monochrome, hairline treatment instead of stacked glass panes.

On phones, Alpha 0.3 exposes four translucent, labeled vitals—**Stamina, Stability, Loom, and Cargo**—plus a touch action dock, while keeping keyboard hints out of the travel HUD. A momentary **BRACE** control feeds the same authoritative rule as desktop Shift during tap-to-route travel: hold it through danger, then release. It visibly reads **BRACING** while active and fails safe on cancelled touches, lost focus, hidden pages, or opened dialogs. Desktop Shift now has the same focus-loss safety and remains available after using HUD controls; on hybrid devices, each touch or keyboard source keeps its own hold until physically released. An amber planted marker in either world view confirms the aggregate hold without relying on color alone. Harbor taps chart a route to the exact harbor center so arrival does not race a menu; tapping a visible loose parcel similarly charts an approach and recovers it only on entering the authoritative reach. Promises and settlement details remain independent safe-area sheets. The former mobile Title slot now opens the live **KIT** inventory and crafting surface; a 44-pixel **☾ Quiet Hour** control retains the saved recap and return-to-title path. Desktop **T** and the mobile **?** open the same versioned, independently scrollable field manual; its live/planned boundary is updated whenever a mechanic changes. Physical cargo remains in Promises, while each inspector report control names its exact source stock subject and recipient and identifies the journey as information-only. Duplicate source-subject-recipient inputs project as one stable touch-sized action rather than a stack of identical-looking document jobs.

Seven derived biomes—Tide Channel, Brine Flat, Reed Marsh, Rain Meadow, Sun Meadow, Wind Ridge, and Glimmerfen—are projected from the seeded terrain and presented with restrained color-and-motif language in both Chart and Relief. Their bounded rainfall, heat, salinity, exposure, and magical-water signals remain derived rather than separately saved. Alpha 0.3 uses biome identity to choose natural material families and active weather to bound their regrowth; loose parcels now read the local current, grade, impact, immersion, and magical-water flux through their material traits. Accumulated courier exposure, carried-cargo rain/heat reactions, infrastructure reactions, and settlement consequences remain future work.

The cargo-environment evaluator is connected to physical loose parcels: material traits bound impact, wetness, contamination, decay, current/lift response, and magical-water pressure. Parcel identity and hash-chained event evidence persist inside save version 4; the recent detailed tail is compacted to a fixed budget while older evidence folds into its irreversible archive hash. All touched parcel worlds share one exact custody manifest, so leaving and returning neither deletes nor duplicates a parcel. A far parcel may leave the renderer's interest radius, but it is not rerolled and reappears as the same object when approached. Currents and terrain can now carry it continuously beyond the old map extent while preserving identity, condition, momentum, history, and Promise custody. A dropped active Promise remains recovery-focused and becomes a **RECOVER CARGO** objective that names its direction, distance, and motion; it cannot be delivered or renegotiated until its exact quantity returns to custody. The separate rock/ladder kernel still remains foundation-only: it derives coherent outcrops, crossing risk/cost, and a finite reusable ladder kit, but production movement does not yet supply those outcrops or ladders. Existing ridge terrain and terrain-driven falls are live; procedural ladder-gated formations, Pannier capacity, shroud/liner protection, crafted-Wayknot deployment, harbor lockers, survival exposure, and upgrades remain staged.

## Controls

The world canvas must have focus for directional travel keys. Shift-to-brace remains global during active play after the body or HUD receives focus; text fields and open dialogs keep keyboard ownership. Buttons and contract cards remain usable with pointer or keyboard navigation.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Travel; while ADRIFT, hold a direction to paddle and release to float |
| Hold Shift while moving | Brace: trade speed for stability and fragile-cargo protection |
| Hold BRACE (mobile) | Apply the same bracing rule during a charted touch route; release to stop |
| Pointer click / tap | Chart a destination; touch taps route to exact harbors/resources and recovers visible parcels only on arrival within reach; travel continues wherever visible terrain permits without an edge action; fine-pointer parcel clicks never recover remotely |
| Space | Pulse the Loom to reveal nearby terrain and sound water depth; an active Tide Harp echoes from all three knots |
| E / Enter | Interact, deliver, inspect, gather underfoot, or recover a physical parcel within the marked two-tile reach |
| F | Bind the terrain-appropriate inherited Wayknot, or reclaim the one underfoot; both actions spend persistent condition |
| I | Open or close KIT on PACK |
| C | Open KIT directly on MAKE |
| V / Header View control | Switch between playable Chart 2D and Relief 3D |
| Hold J / L | Spin the Relief 3D map left / right; rotation stops when released |
| Right-drag / Alt-drag | Orbit the Relief 3D camera |
| Two-finger twist (mobile) | Spin Relief 3D without also charting a destination |
| Mouse wheel | Zoom either world view |
| Escape / right click | Cancel the current pointer destination |
| T on desktop / ? button on mobile | Open the complete field manual |
| PROMISES + / PROMISES − (portrait or short landscape phones) | Open or fold the full-size Promises sheet; the four vitals and touch controls remain available |
| KIT (mobile) | Open the safe-area PACK / MAKE / MEND inventory and crafting surface |

Holding Shift—or holding **BRACE** on mobile—trades speed for a higher currently supported stability percentage and fragile-cargo protection. Pace is read-only: **REST** means still, exhausted, floating ADRIFT, or recovering; **STEADY** is ordinary travel or an active paddle stroke; **SWIFT** appears automatically downhill or when controlled travel is carried with the current. Completed caches shelter perishable food from freshness loss while you are there. The HUD always names the current stability percentage and its strongest terrain, water, weather, motion, load, and support causes.

Desktop world clicks route to resources but never harvest remotely: step onto the marked tile and press E. On touch, tapping a visible resource is the explicit gather command, so it routes to the exact tile and takes one unit on arrival. Either path rejects the whole action without changing the patch if the pack lacks room or only its final living unit remains. KIT can be opened between harbors; the tide, weather, residents, and route continue while PACK, MAKE, or MEND is visible.

There is no manual in-play pause. Open **Quiet Hour** for a saved causal recap, or open the title to save and step away; either safely halts world and player ticks until you continue.

Relief 3D travel is camera-relative: after orbiting with J/L, drag, or a two-finger twist, WASD/arrows continue to mean screen-left, screen-right, forward, and back. A pointer-transparent N compass stays north-up in Chart and turns with the Relief camera so world north remains legible without changing any simulation direction. In clear air, broad terrain reaches toward 52 tiles, remains fully legible through 34, and feathers across the final 18; exact people, parcels, resources, water detail, labels, actions, and pointer targets still use the shorter 10-tile field. Terrain that has just left broad sight keeps a sub-second visual impression before easing into dim durable Chart memory or uncharted darkness, and the same bounded scalar buffer follows a quick Chart/Relief switch. Exact detail disappears immediately; no perception memory is serialized.

Water never becomes an arbitrary invisible wall. Each wet tile derives one deterministic strength and turbulence profile from its physical bed, depth, tide, and weather. Discovered water shows that observable character through moving streamlines, sparse foam, real ambience, and occasional OHM or WHISSH text; SOUND / SCAN adds analytical arrowheads and records bathymetry. Surface character can warn that water is calm or rough, but it never provides the exact unsounded depth or effort value. Deeper water spends more stamina, while a Tide sail lowers that cost. Empty stamina on dry ground makes camp. In deep/current water at or above 120,000 depth, either stamina or the current stability percentage reaching zero enters ADRIFT: the live current always moves the courier, WASD/arrows or a bounded touch tap paddle across it, and releasing movement floats to regain stamina. A full pack weakens the stroke; direct upstream input can slow but never permanently reverse the physical current. Reaching water no deeper than 55,000 lets the courier recover in place until 100,000 stamina is available to stand. Cargo quantity remains physically accountable, and any separated parcels continue moving with current and grade until recovered. A connected clinic can prevent the incident while a ferry, Storm kite, Tide sail, or nearby Tide anchor provides bounded help without deleting the current.

Physical cargo promises and signed reports are different jobs. A promise moves actual supplies from its **PICK UP** harbor to its **DELIVER** harbor. A signed stock report uses one document slot but moves information only: it records a named harbor's current stock count and becomes useful after you carry it to the named recipient. Cargo choices live in Promises; reports live under the harbor inspector's separately labeled **Signed reports · information only** section. Every stable row spells out **[source]'s current [stock] count → [recipient]**; exact duplicate inputs collapse to one job without merging legitimately different sources or recipients.

## Saves

The game exposes one local autosave and enters it automatically on launch—there is no routine Continue gate. It saves periodically, when the page is hidden or closed, when the title is opened, when Quiet Hour begins, and immediately after a new world is confirmed. The simulation never advances while the game is closed. Replacing a healthy autosave is deliberately explicit: open the title through Quiet Hour, type `restartrestartrestart` exactly in **Begin again**, choose **Unlock restart**, enter a non-empty new Seed phrase, then choose **START**. Phone-keyboard blur and ordinary title refreshes preserve the in-progress unlock, while closing and reopening the title clears it. Mistyping, a blank seed, or a rapid second START changes nothing, and unlocking alone performs no storage write. If the stored session is unreadable or two storage copies claim the same version with different contents, neither is guessed into play: a persistent visible title warning requires a deliberate non-empty seed, and it remains until that higher-version replacement is durable. If either configured storage backend cannot be read, the title instead shows **LOCAL SAVE UNAVAILABLE**, disables Continue and both world-creation forms, performs no write, and asks for a reload when both stores are available.

Saves are local-first and remain on the player's device. IndexedDB is the primary store and localStorage carries a mirrored fallback. Healthy primary writes mirror the complete record, while compact version/fingerprint fences detect known rollback and same-version divergence. A launch adopts a record only after both configured stores can be read and compared; a partial or total read outage fails closed even when one survivor looks plausible. Reads compare save era, generation, timestamp, and world tick in that order; overlapping lifecycle/autosave requests coalesce behind an in-flight write, and a durable deletion marker prevents a stale primary copy from resurrecting after reconciliation. A stale tab or fork is not allowed to keep retrying over a different or newer durable record: saving stops, the warning persists across the field and all major dialogs, and the player is told to reload. Ordinary write failures after a safely loaded world still retry with bounded backoff and a fresh world snapshot, but the warning clears only when the latest requested snapshot in the current era and generation is durable.

Each deliberate replacement advances the backward-compatible two-part era/generation version before timestamp/tick comparison, including a safe carry into the next era if the generation counter is saturated. If both counters are already at JavaScript's largest safe integer, the game refuses to wrap them and visibly asks the player to clear Tideweft's stored site data before beginning again. The Alpha 0.3 version-4 session retains sealed physical-cargo and traversal ledgers, a sparse durable world manifest, cartography, and Promise-journey evidence. Its nested travel record now stores the exact origin of the bounded moving frame; older 98 × 74 travel records migrate into the 120 × 120 frame without moving the courier. The outer payload fence rejects a half-completed internal transfer, mismatched cargo ownership, stale chart, downgrade, rollback, duplication, or silent deletion before adoption. Version-1, version-2, and version-3 sessions keep their valid contents and original estuary intact; unreadable or structurally incompatible records are quarantined rather than silently loaded or overwritten. New worlds use perpetual `wander`; valid older `drift` and `weave` fields remain readable without regaining timed semantics.

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

`package:desktop` rebuilds the web target and writes an unpacked app under `release/`. The smoke command launches that packaged app with isolated user data, proves the text-only title controls are visibly painted, verifies the secure `app://bundle/` build, opens the canonical Patch Notes from the title, starts the preserved estuary inside the 120 × 120 moving Relief frame, accepts and physically loads a promise, and binds a real Wayknot through the field-action button. It then reloads a deterministic R1/A3/W5 Tide Harp fixture through production save validation, verifies projection/HUD agreement, sounds a remote tile that the ordinary player-radius pulse cannot reach, round-trips Chart and Relief, exercises held-L camera rotation against the live compass, and checks non-overlapping objective/Promises layouts at 1,440 × 900, 960 × 640, and 927 × 640. At 700 × 640, 320 × 640 portrait, and 844 × 390 landscape it proves the compact HUD defaults closed, keeps all four vital labels visible, exposes touch-size controls and current/safety guidance, opens a full-width scrollable Promises sheet without covering the strip or action dock, exercises Patch Notes through the mobile tutorial and Quiet Hour, follows the visible Quiet Hour → saved title → return path, keeps the inspector mutually exclusive, and closes cleanly again. The resident ABOUT gate selects, greets, scrolls, and closes through physical packaged input on desktop, portrait, and short-landscape layouts without pausing the world. A separate 360 × 640 probe opens the real non-pausing KIT modal, checks PACK / MAKE / MEND and exact load, verifies all recipe targets and blockers, physically scrolls MAKE, and proves close restores focus. Unless `--no-screenshot` is supplied, the run writes `artifacts/electron-title-smoke.png`, `artifacts/electron-mobile-smoke.png`, `artifacts/electron-mobile-smoke-resident-about.png`, and `artifacts/electron-smoke.png`. `make:desktop` creates the platform ZIP.

The Phase 10 source also gives Chart 2D persistent bowed strings and a labeled center mark, while Relief 3D suspends an actual faceted bell on three cords above the discovery-safe surface. Active-state marks remain legible without color; reduced motion freezes decorative bob and sway. The candidate passed TypeScript, 28 Vitest files / 205 checks, the production and nested-path web gates, a scoped source secret scan, and the extended packaged smoke with no renderer warnings or resource failures. Fresh 2,880 × 1,678 title and 2,880 × 1,800 Relief captures show the start controls, actual bell/cords, active Harp copy, explicit delivery guidance, and unobstructed Promises rail. GitHub CI run `33494152504` and Pages run `33494152310` then succeeded for exact commit `6f74fe9e016ba566116e2085b05ecf2988213754`; the live page serves `index-CKlzWR1L.css` and `index-D30XtHH3.js`, both returning HTTP 200. This remains an untagged preview, not a new Alpha tag.

The focused mobile/current hotfix passes TypeScript, **31 Vitest files / 221 checks**, the production and nested `/tideweft/` web smoke, the scoped public-source secret scan, and the expanded packaged-device gate with no renderer warnings or resource failures. Exact commit `f8dc8482cbd10df1352f87a3a28bbee4abcf8de2` is published: CI run `33503039473` and Pages run `33503039480` succeeded, and the live origin serves the inspected `index-DTJENodE.css` and `index-CGVn5Ai9.js` assets with HTTP 200.

The perpetual/mobile/biome checkpoint passes TypeScript, **40 Vitest files / 311 checks**, the production and nested `/tideweft/` smoke, the scoped source-secret scan, and a runtime-only packaged-ASAR smoke across desktop, compact portrait, and short landscape layouts. Exact commit `29ea8dc60f309ebc43bcf8c1b567cfacf2bf8f95` is live after successful CI run `33508654754` and Pages run `33508654540`; the inspected `index-DIX0Efr_.js` and `index-Cc-fErTR.css` assets return HTTP 200.

The Alpha 0.3 field ecology / KIT checkpoint passes TypeScript, **49 Vitest files / 386 checks**, the production build, the nested `/tideweft/` smoke, a scoped source-secret scan, and the packaged desktop/mobile/KIT gate with no renderer warnings or resource failures. Fresh title, portrait-gameplay, and Relief captures were inspected. Exact feature commit `d22668b3b481ea937e08ece5c7a26b6eb8c18870` passed CI run `33514087307` and Pages run `33514087320`; the live `index-CHONaHrC.js` and `index-cSiSqast.css` assets both return HTTP 200.

The coherent version promotion is exact commit `ab270dbae92730d65ded3f56408d3f7032f18fec`, tagged `v0.3.0-alpha.1`. Main CI run `33514967147`, tag CI run `33514966921`, and Pages run `33514967288` all succeeded. The public page serves the promotion build's inspected `index-2OVXbDIf.js` and `index-cSiSqast.css`, both returning HTTP 200.

The post-tag mobile BRACE and Relief-contrast hotfix is exact commit `683ce80069f79c8ffd146fd8f8e904305ae87693`. CI run `33517816633` and Pages run `33517816913` succeeded; the public page serves inspected `index-D7Vt-CeG.js` and `index-BZ61x1-O.css`, both returning HTTP 200.

The `0.3.3-alpha.9` source candidate carries gameplay contract 17 and tutorial 19. It removes the old edge interaction and internal-address presentation, replaces the 98 × 74 edge-centered view with a 120 × 120 sliding world frame, preserves active paths and both cameras through exact rebases, and gives physical parcels an atomic continuous crossing with no change of identity, momentum, history, or Promise custody. The outer game save stays version 4; its nested travel record migrates to version 2. [CHANGELOG.md](./CHANGELOG.md), title and Quiet Hour Patch Notes, and the field manual's **What's New** page remain synchronized from one release ledger. Generated distant settlements and actors, dogs, bears, birds, deer, companions, ownership, negotiation, deterrence, and cross-actor ecology are still planned rather than presented as complete.

Development artifacts are not code-signed or notarized. Public desktop distribution still requires signing for each target platform.

## GitHub Pages

[The current alpha is live](https://19koda19.github.io/tideweft/). [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) type-checks, tests, builds, uploads `dist/`, and deploys on pushes to `main` or manual dispatch. Vite uses `base: './'`; the HTML, web manifest, SVG icon, and bundled assets therefore work below an arbitrary repository subpath.

The live post-tag hotfix is verified at commit `683ce80069f79c8ffd146fd8f8e904305ae87693`; successful CI run `33517816633` and Pages run `33517816913` produced the exact inspected `index-D7Vt-CeG.js` and `index-BZ61x1-O.css` assets.

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

See the canonical [changelog](./CHANGELOG.md), [game design](./docs/GAME_DESIGN.md), [research](./docs/RESEARCH.md), and [architecture](./docs/ARCHITECTURE.md). Internal execution roadmaps and progress ledgers stay local rather than shipping with the public source.
