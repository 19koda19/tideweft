# TIDEWEFT Changelog

<!-- Generated from src/content/patchNotes.json. Run node scripts/render-patch-notes.cjs; do not edit release prose here. -->

Newest release first. Patch notes are bundled into the game and remain available offline.

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
