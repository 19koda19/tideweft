# TIDEWEFT Changelog

<!-- Generated from src/content/patchNotes.json. Run node scripts/render-patch-notes.cjs; do not edit release prose here. -->

Newest release first. Patch notes are bundled into the game and remain available offline.

## 0.3.2-alpha.0 — 2026-09-01

Build: `0.3.2-alpha.0` · Gameplay contract: 7 · Tutorial: 8

The ground can finally take the load: terrain-driven footing now causes legible stumbles and falls, while every dropped or separated parcel remains a persistent, recoverable physical object.

### Gameplay

- Stability is now terrain-responsive footing rather than a second stamina drain: grade, roughness, moisture, depth, current, wind, turning, load, footwear, Wayknots, and BRACE determine whether control holds, recovers, stumbles, or falls.
- Hazardous entries consume durable deterministic traversal ordinals. A fall briefly takes movement control, damages one exact carried lot, and can separate persistent parcels without allowing reloads to reroll the outcome.
- KIT can DROP exact stack quantities or whole Promise and gear lots. Loose parcels retain identity, material condition, wetness, contamination, origin, custody, and causal history while current moves them, grade tumbles them, impacts weather them, and local magic water applies material pressure.
- A dropped or fallen active Promise becomes a RECOVER CARGO objective. Delivery and renegotiation remain blocked until the contract's exact quantity is physically back in custody; desktop E recovers within reach and a touch parcel tap charts an approach before recovery.
- REST, STEADY, and SWIFT are now read-only movement states derived automatically from stillness, recovery, ordinary travel, downhill grade, and assisting deep current; the manual pace buttons and bracket-key commands are gone.

### Fixes

- Zero Stability in deep current now produces the same recoverable swept state as exhausted Stamina instead of remaining visually stable at zero.
- Promise pickup, handoff, rejection, report reservation, crafting, mending, dismantling, and Wayknot repair now transact against exact physical lots before their aggregate inventory mirrors update, closing reclaim and duplication paths.
- Physical cargo commits reject stale revisions, ordinal rollback, history rewriting, retired-lot resurrection, material improvement during conserved movement, and silent quantity deletion.
- The shared two-tile parcel reach now matches UI guidance and authoritative pickup checks, and Promise drop sends the whole identified lot instead of an invalid quantity argument.
- KIT suppresses overlapping touch gestures until every involved pointer ends, and Chart and Relief release surviving pointer captures safely on cancellation, focus loss, hidden pages, mode changes, and teardown.
- Sweep, fall, and shore messages no longer claim that every parcel stayed on the porter after physical separation.

### Balancing

- A CHALLENGING HARD remains the only ruleset. BRACE trades speed for control and fragile-cargo protection, but it cannot erase an unsupported edge or guarantee safety on an unprepared line.
- A stumble or fall applies one deterministic lot impact; severe falls can split divisible freight, while a full loaded-region cap keeps the lot carried but still applies the resolved damage instead of granting fall immunity.
- Cargo quantity is conserved through drop, fall, drift, save, reload, and recovery. Failure costs condition, time, position, and retrieval effort rather than deleting the Promise or creating free stock.

### Interface

- Chart 2D and Relief 3D now share balance-state colors, silhouettes, and structural marks for balanced, swaying, stumbling, fallen, swept, and recovering states.
- Stumbles and falls produce compact OOP, NNF, HUP, SKK, THUD, WHK, or WHHSH text near the courier plus deterministic square-wave and triangle-wave cues; compact placement avoids the mobile vital strip and action dock.
- Loose parcels are visible and selectable in both views with material, motion, condition, ownership, and recovery-range presentation. The objective and contextual action name RECOVER before delivery can continue.
- The version-8 T/? field manual removes obsolete pace controls and explains footing causes, BRACE on desktop and touch, falls, physical drop/recovery, parcel persistence, and honest current limitations.
- The title remains the quiet TIDEWEFT, Seed phrase, START, and PATCH NOTES surface without a prominent difficulty slogan.

### Save changes

- Save version 3 adds a sealed physical-cargo sidecar with stable lot, parcel, event, source, and retired identities; an expected manifest prevents duplication and silent deletion across save and reload.
- The traversal sidecar preserves the next deterministic ordinal and incident identity, marks loaded cues as heard, and prevents a reload from rerolling a fall or replaying its sound.
- Current saves require a matching outer payload-version fence, intact envelope integrity, canonical one-ruleset session/player/ecology/traversal state, valid physical manifests, and exact Promise custody before adoption.
- Compatible version-1 and version-2 saves migrate into canonical version-3 physical custody without regenerating collected resources or losing valid pack contents.

### Known limitations

- The playable world remains compatibility region (0,0); infinite streaming, negative-coordinate travel, floating origin, and distant simulation are not live.
- The deterministic rock and ladder kernel is still disconnected from production traversal. Existing ridge terrain and falls are live, but procedural ladder-gated outcrops, ravines, ropes, and regional vertical rescue are not.
- Mangrove and bramble snag behavior exists in the loose-cargo simulation kernel but is not connected to living field ecology, so the released game does not claim those catches yet.
- Terrain, water soundings, current arrows, and active stability causes are visible, but an exact pre-entry fall percentage is not yet projected in the route UI.
- Health, injury, hunger, thirst, camps, wildlife, human waylayers, actor speech, and regional weather fronts are not live in this release.

## 0.3.1-alpha.1 — 2026-09-01

Build: `0.3.1-alpha.1` · Gameplay contract: 6 · Tutorial: 7

A quieter first hello: the new-estuary title now presents only TIDEWEFT and the actions needed to begin or read the release ledger.

### Gameplay

- World rules, hazard pressure, rewards, and save continuity are unchanged in this interface-only checkpoint.

### Fixes

- The field location fallback now says Between harbors instead of repeating the difficulty contract in ordinary HUD chrome.

### Balancing

- No balance values changed.

### Interface

- The first-launch title is reduced to TIDEWEFT, Seed phrase, START, and PATCH NOTES; the slogan, difficulty banner, and redundant new-world heading were removed.

### Save changes

- Automatic return, visible save-health warnings, deliberate restart phrase, replacement seed requirement, and local-save protections are unchanged.

### Known limitations

- The playable world remains the finite compatibility region while infinite streaming is under construction.
- Physical falls, loose world cargo, and rock traversal are still in active integration and are not claimed by this title-only checkpoint.

## 0.3.1-alpha.0 — 2026-09-01

Build: `0.3.1-alpha.0` · Gameplay contract: 6 · Tutorial: 6

A deliberate return: one demanding ruleset, safer local continuity, longer unladen travel, legible mobile instruments, and a Relief map that can be turned without losing north.

### Gameplay

- Every new and resumed estuary uses the one official ruleset, A CHALLENGING HARD.
- A valid local save now enters its exact estuary automatically instead of asking the player to choose a session shape or difficulty again.
- Relief 3D rotation is available by holding J or L on desktop and by a two-finger twist over the world on touch screens; the compass continues to identify world north.

### Fixes

- Restart replacement now requires the exact raw phrase restartrestartrestart and a second submission containing a non-empty seed, so stray whitespace and blank replacement attempts leave the current world intact.
- Save ordering now uses an era and generation ahead of timestamps and world ticks, so an older tab or a saturated generation counter cannot revive a deliberately replaced world.
- An unreadable session or two different local copies claiming the same version is never chosen silently: the title explains the problem, hides Continue, and requires an explicit non-empty replacement seed while blank submission changes nothing.
- If either configured browser-storage backend cannot be read, the title now shows LOCAL SAVE UNAVAILABLE and disables Continue, seed creation, and restart instead of trusting an unverifiable surviving copy or presenting a destructive first-launch flow.
- A stale runtime that meets a different or newer durable copy now stops retrying and asks for a reload instead of repeatedly attempting to overwrite the authoritative copy.
- A failed local write now keeps a persistent visible LOCAL SAVE NOT STORED warning on the field, title, Quiet Hour, KIT, tutorial, and Patch Notes instead of disappearing behind the active surface.
- Compact 320-pixel layouts retain visible STAM, STAB, LOOM, and CARGO labels, and opening Quiet Hour no longer exposes a false Continue card on a first launch.

### Balancing

- Base combined carrying capacity rises from 16.000 to 18.000 load while valid existing pack contents remain intact during migration.
- Dry, empty, steady travel now lasts roughly two minutes before exhaustion; burden scales nonlinearly so a full pack still demands route and rest judgment.
- Terrain and water exertion remain additive and are not softened by hidden adaptive difficulty.

### Interface

- The title names the single ruleset directly and removes obsolete posture and session-shape choices.
- A compact north compass appears in both Chart 2D and Relief 3D; Chart remains north-up while the Relief pointer compensates for camera yaw.
- Patch Notes are available offline from the title, Quiet Hour, and the field manual's What's New page, with an independently scrollable safe-area layout.

### Save changes

- No save migration choice is required: compatible legacy saves adopt A CHALLENGING HARD, keep their contents, gain the 18.000 capacity floor, and receive era zero and generation zero before later replacements advance that two-part version.
- Healthy primary writes keep the fallback copy current. Compact version and fingerprint fences reject known rollback and equal-version divergence when both stores are readable; if either store cannot be read, no copy is adopted.
- After an ordinary failed write, automatic retries use bounded backoff and take a fresh snapshot of the current in-memory estuary, so changes made after the failure are included; only the latest requested snapshot for the current era and generation clears LOCAL SAVE NOT STORED and announces LOCAL SAVE RESTORED.
- Unreadable or conflicting copies remain quarantined until a named replacement seed is durably stored; if a newer durable version is unavailable or supersedes this tab, saving is blocked and the visible warning asks the player to reload.
- A partial or total backend read failure is reload-required and performs no automatic retry or write in that window, preserving any durable record that may still exist.
- If both components of the replacement version have reached the largest safe integer, Tideweft refuses to wrap them and explicitly asks the player to clear this game's stored site data before beginning again.
- Opening Patch Notes or the field manual dispatches no simulation or save command and preserves the player's title and Quiet Hour state; when opened from the active field, the world continues underneath.
- Saves remain local to this browser or packaged application and do not synchronize across devices.

### Known limitations

- A save whose era and generation are both already at the largest safe integer cannot be replaced automatically; the title explains the required site-data reset instead of risking rollback.
- The playable estuary is still one finite seed-generated compatibility region; deterministic infinite region streaming, negative-coordinate travel, and distant simulation are not live.
- Cargo condition is live, but dropped cargo does not yet become a persistent world object that can tumble, drift, snag, or be recovered.
- Seven biome and climate signals are visible, but accumulated exposure, hunger, thirst, wildlife, human waylayers, fire ecology, ravines, ropes, and ladders do not yet affect play.

## 0.3.0-alpha.1 — 2026-09-01

Build: `ab270db` · Gameplay contract: 5 · Tutorial: 5

Field ecology became a physical pack loop: seeded materials can be gathered, carried, crafted, mended, and used as durable traversal adaptations.

### Gameplay

- Nine deterministic field materials inhabit matching terrain and can be gathered one unit at a time without exhausting an ordinary node's living reserve.
- PACK, MAKE, and MEND combine Promise freight, signed reports, finds, components, and durable gear under one exact load limit.
- Six inherited Wayknots can be bound or reclaimed in the field, and unlike nearby knots can tune a Tide Harp.

### Fixes

- Malformed inventory and field-resource save data are rejected or normalized instead of duplicating physical stock.
- Promise pickup, delivery, and signed-report actions expose their exact location and blocker instead of relying on ambiguous card text.

### Balancing

- Crafting is atomic, mending restores at most one quarter condition per action, and dismantling returns a deliberately lossy salvage amount.
- Renewable nodes regrow only while the local simulation advances; reopening a closed world grants no offline harvest.

### Interface

- The anywhere KIT supplies separate PACK, MAKE, and MEND tabs with exact ingredient, result, condition, and load readouts.
- The mobile Promises sheet, contextual action dock, and full field manual use touch-sized controls and independently scrollable panels.

### Save changes

- Field resources, gathered quantities, crafted gear identities, condition, and Wayknot wear persist locally across save and reload.
- This release keeps compatibility with earlier finite-estuary saves and does not simulate progress while the game is closed.

### Known limitations

- The world is a finite seed-generated estuary rather than an unbounded streamed region network.
- Harbor lockers, physical dropped cargo, regional survival, animals, human encounters, and alpine traversal are not live in this release.
