# TIDEWEFT Changelog

<!-- Generated from src/content/patchNotes.json. Run node scripts/render-patch-notes.cjs; do not edit release prose here. -->

Newest release first. Patch notes are bundled into the game and remain available offline.

## 0.3.3-alpha.11 — 2026-09-05

Build: `0.3.3-alpha.11` · Gameplay contract: 19 · Tutorial: 21

The first living web adds one independently generated dog beside one existing porter: lawful food scent, rain and condition, knowledge-honest ABOUT, five player choices, physical provision custody, memory, promotion, and save-safe revisit.

### Gameplay

- Each seed now creates exactly one independent domestic dog beside one deterministically selected porter from the original harbor country's existing 42 humans. The dog has a stable generated identity, needs, temperament, weather adaptation, and condition; the pairing establishes this small causal web, not ownership or a companion bond.
- The dog follows the shared perception rules rather than reading food coordinates. An open or secured porter pack emits a bounded dried-fish scent shaped by containment, wind, and rain; the dog can move by traversable steps toward its uncertain belief area. The porter must separately perceive the dog through lawful occluded sight before considering a response.
- Selecting the visible dog exposes five choices: ASK FOR HELP, SUGGEST SECURING BELONGINGS, WAIT AND WATCH, ROUTE AROUND THIS SPOT, and LEAVE. Requests do not command the porter. ROUTE AROUND requires an automatic route and genuinely replans its existing destination around the dog's currently observed position.
- When the porter lawfully accepts a help request, exactly one dried-fish unit transfers from the porter's physical pack into dog custody before consumption. The meal creates bounded memories and promotes that same dog for persistence, so a reload can show FAMILIAR DOG and the known history Accepted food from a porter without minting another unit.

### Fixes

- Chart and Relief now render and hit-test the same knowledge-gated dog projection by stable actor ID. The dog and its ABOUT surface disappear immediately outside direct detail sight, so a stale selection cannot become an offscreen tracker.
- Dog movement consumes an uncertain perception-derived target and a bounded shared traversability surface. Deep water, blocked terrain, invalid coordinates, and unavailable paths close the action instead of teleporting the animal or consulting the true food position.
- Player requests, porter decisions, pack closure, one-unit transfer, dog consumption, memory, promotion, and the world tick commit transactionally. A malformed or interrupted step retains the prior world and custody state rather than leaving half an encounter or a duplicated provision.

### Balancing

- A CHALLENGING HARD remains the only ruleset. The porter-dog web adds one finite porter pack containing four dried-fish units and one independent dog; it adds no money, loot table, repeatable reward, difficulty option, combat target, or camera-triggered animal respawn.
- Food, rain, cold, wetness, exhaustion, safety, shelter access, human familiarity, and current lawful perception can change dog and porter decisions. The player can ask, observe, secure the attractant, take a real detour, or leave, but cannot force feeding or turn one meal into instant trust.
- Dog cognition, memories, player knowledge, actor-choice history, cargo history, and exact live carriers are capped. Full movement and new perception stay inside the loaded interaction window; unloaded state remains bounded and cannot discover offscreen subjects.

### Interface

- A directly visible dog receives a readable Chart and Relief marker, UNKNOWN DOG or FAMILIAR DOG quick text, and the shared non-pausing ABOUT surface. OBSERVED may show approximate size, coat, age, condition, and current behavior only at sufficient clarity; KNOWN shows only facts earned through the encounter.
- The five dog choices use the same pointer, keyboard-focus, and touch-sized ABOUT controls. Disabled copy explains when the player must move closer or set an automatic route first, and the route-around result announces whether the Loom found a valid line.
- Field Manual version 21 teaches the one-dog food-and-rain web, the request-versus-command boundary, exact one-unit transfer, persistent memory and promotion, real route-around action, and the explicit absence of a full animal roster or companion system.

### Save changes

- The outer session advances to version 7. It stores canonical first-living-web ecology, porter response, and living-actor player-choice roots alongside the existing physical cargo, regional travel, Promise journey, and pending sensory carry. The embedded simulation remains format 4 with tideweft-sim/6.
- Supported outer versions 1 through 5 deterministically initialize the same seed-bound dog web without inventing memory or duplicating provisions; version 5 retains its sealed partial sensory interval. Version 6 preserves its existing dog ecology and adds deterministic porter-response and empty player-choice state before version 7 is written.
- Dog identity, position, needs, condition, perception, intent, memory, player knowledge, promotion reason, provision custody, consumption evidence, and bounded causal history survive save, unload, revisit, and reload. A promoted dog remains an individual, not an implied companion.
- Version 7 requires exact top-level keys and matching envelope integrity. Missing, aliased, noncanonical, or contradictory dog-ecology, porter-response, player-choice, or physical-custody state is quarantined as an unreadable save rather than partially adopted.

### Known limitations

- This is exactly one porter-dog-provision-rain web near the original harbor country. Additional dogs, animal populations, generated distant actors, bears, birds, deer, predator-prey chains, reproduction, broad habitat ecology, and a complete species roster are not live.
- The dog is independent. Ownership, adoption, naming, affection, training, commands, equipment, rescue, bonded travel, and a full companion system are not live; persistence promotion only prevents an encounter with earned history from being discarded.
- The released animal sensing loop is deliberately narrow: physical food scent, porter visual contact, and player direct-detail inspection. Tracks, environmental evidence, group communication, dog-to-dog behavior, human-to-human sensing, physical human pursuit, other-species interactions, and broad sound repertoires remain later work.
- ASK FOR HELP and SUGGEST SECURING BELONGINGS are requests, so the porter may wait, secure the pack, reroute, leave, or decline to transfer food according to lawful state. ROUTE AROUND is available only for a current automatic route with a valid detour.

## 0.3.3-alpha.10 — 2026-09-03

Build: `0.3.3-alpha.10` · Gameplay contract: 18 · Tutorial: 20

The original estuary's 42 humans can now notice the courier through lawful sight or anonymous sound, remember a lost sighting, and give up a bounded search without gaining hidden knowledge.

### Gameplay

- The original harbor country's existing 42 humans now receive the first connected shared-perception slice. Their visual contact respects facing, close awareness, terrain elevation, ridges, dense obstruction, structures, active weather, the courier's movement, and terrain-dependent ambient exposure rather than using an omniscient distance trigger.
- Footfalls, splashes, and serious impacts can produce anonymous directional hearing. Rain and turbulent water near the listener mask sound; wind changes its practical reach and uncertainty. Hearing never grants the courier's identity or an exact source coordinate.
- Each person maintains bounded attention and suspicion. Losing a clearly identified visual contact starts an expiring scan of the last area actually seen; fresh lawful sight can reacquire the courier, while failure decays to deterministic give-up instead of following hidden live coordinates.

### Fixes

- Human perception now uses segmented world positions and stable resident placement across the moving presentation frame. A frame shift or signed address cannot turn local coordinates into false contact or move a saved search area; this release still generates no humans outside the original harbor country.
- Malformed or partial perception input fails closed for the whole world tick. Every resident's cognition still advances once for decay and search expiry, and no forged frame can selectively teach one person or leave half the population on a different cognition tick.
- A resident's search-facing direction is derived from saved attention or the next deterministic last-known-area probe. Breaking line of sight no longer leaves them visually locked onto the courier's hidden current position.

### Balancing

- Perception does not add an easier ruleset or change rewards. Sight, hearing, attention, belief, salient memory, and search duration are bounded for the same A CHALLENGING HARD simulation on desktop and mobile.
- Only a lawful identified visual contact can establish or refresh the courier's exact last-known point. Anonymous hearing may raise suspicion and guide an uncertain investigation, but it cannot identify or precisely reacquire the player.

### Interface

- Visible people can now use restrained pane-free quick labels, text faces, short speech, and ABOUT behavior such as listening, investigating, watching, alert, or searching nearby. Hidden attention keys, confidence values, and last-known coordinates remain private.
- Chart 2D and Relief 3D project the same human cognition and the same knowledge-honest ABOUT text. Desktop pointer, touch targets, portrait, and landscape layouts do not fork the sensing rules or expose a mobile-only shortcut.
- Field Manual version 20 explains what makes the current humans see or hear the courier, how weather and water noise alter contact, and why breaking sight produces a bounded last-known-area search rather than omniscient pursuit.

### Save changes

- The outer game save advances to version 5. Its embedded simulation advances to format 4 and tideweft-sim/6 so each original-estuary resident stores canonical perception, attention, suspicion, beliefs, bounded salient memory, and any active search.
- Outer save versions 1 through 4 migrate with an empty fixed-step sensory carry. Simulation formats 1 through 3 preserve established identities and initialize each resident as unaware at the old world's completed tick, so old saves gain no invented sightings or suspicion.
- Version 5 seals the partial fixed-step phase, its bounded player sensory samples, and the next sample ordinal. Saving between world ticks cannot erase or reroll an already-produced footstep, splash, or impact before residents evaluate it.
- Once a cognition tick commits, save/reload preserves the same last-known area, search progress, attention, decay, reacquisition, and eventual give-up; loading cannot reroll what a resident perceived.

### Known limitations

- This remains a bounded first perception slice for the original estuary's 42 humans sensing the local courier. It is not complete universal perception, human-to-human sensing, generated distant population behavior, or a claim that every actor perceives every other actor.
- Scent fields, blood or food odor, footprints and environmental evidence, tracking, social reports, rumors, group communication, dogs, birds, deer, bears, waylayers, companions, and broader wildlife ecology remain planned.
- Current searching changes attention, facing, labels, speech, ABOUT behavior, and memory. Humans do not yet physically pursue, investigate through pathfinding, coordinate a search, or create a persistent aftermath from that search.

## 0.3.3-alpha.9 — 2026-09-03

Build: `0.3.3-alpha.9` · Gameplay contract: 17 · Tutorial: 19

The courier, route, camera, weather, Wayknots, chart knowledge, and physical parcels can now continue beyond the original estuary through one deterministic world without a transition.

### Gameplay

- The courier can keep walking in every compass direction through one continuous deterministic terrain field. A bounded 120 by 120 presentation frame moves in small increments around the player while authoritative world position remains exact, including negative and extremely distant coordinates.
- Terrain is generated from stable global samples and prefetched in bounded work before movement needs it. Cardinal, diagonal, negative-coordinate, repeated-crossing, generation-order, and long-walk tests reproduce the same land, water, biome, current, weather, and identity facts.
- Currents and terrain now carry the same persistent loose parcel continuously beyond the old map extent. Parcel identity, condition, momentum, history, Promise custody, and save/reload remain intact; transfer never creates a replacement copy.

### Fixes

- Traveling beyond the original finite extent no longer announces a new area, resets the route, pauses movement, changes footsteps, or snaps the camera. Chart and Relief preserve the same world-space camera, pointer, route, and perception memory by one exact shift.
- Wayknots now influence travel on both sides of former cardinal and corner boundaries from their true global positions, and a Wayknot outside the current view remains deployed rather than being invalidated merely because its ground is not loaded.
- Biome and magical-water sampling now use the exact global tile address. Distant positive coordinates no longer alias an old compatibility-noise period, and the original estuary retains its established climate values.
- Original-estuary resource nodes retain one global address across a moving view. Traveling away and returning cannot reveal, gather, reset, or duplicate them at a matching local coordinate elsewhere.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Seamless travel grants no health, cargo capacity, money, trust, settlement, resource, or rare-find reroll; distance can be empty and risky without becoming an automatic reward farm.
- The world frame, prefetch cache, and parcel-neighborhood transfer stay strictly bounded for desktop and mobile. Presentation detail may be culled for performance, but world identity and simulation outcomes do not change by device.

### Interface

- Ordinary HUD navigation now shows one continuous E/N world address and measured FPS on desktop and compact mobile. Internal partition coordinates remain implementation diagnostics rather than geography the player must learn.
- The field manual now teaches only that the world keeps going: no edge tap, generation prompt, address banner, loading screen, or second click is needed. It distinguishes the live empty generated country from future distant settlements, people, wildlife, and opportunities.
- Placed Wayknots use continuous E/N locations in KIT. Camera gestures and charted routes stay attached to the same world positions while the hidden presentation frame moves underneath them.

### Save changes

- The outer game save remains version 4. The nested travel record advances to version 2 with an exact global presentation-frame origin; valid version-1 98 by 74 records migrate into a player-centered 120 by 120 frame without moving the courier or changing discovered ground.
- Atomic parcel ownership across the continuous world is committed under one conserved custody manifest. Save/reload during or after transfer cannot duplicate, delete, reroll, or relocate the parcel.
- Published finite 64 by 48 and 96 by 72 estuaries remain embedded at their original coordinates with their settlements, residents, routes, resources, Promises, Wayknots, cargo, and chart history preserved.

### Known limitations

- This release proves the first seamless-world slice around the preserved original estuary. Generated distant settlements, populations, roads, major watershed-scale geography, wildlife, companions, and causal wilderness opportunities remain later complete slices rather than cloned filler.
- Long-range multi-scale Chart navigation, coarse distant actor simulation, moving route-scale weather fronts, and continent-scale geographic structure are not complete in this release.
- Active currents and terrain can carry a parcel beyond the original map extent, but fully unloaded distant parcels do not yet receive continuous low-detail motion. Returning restores the same conserved object rather than rerolling it.

## 0.3.3-alpha.8 — 2026-09-02

Build: `0.3.3-alpha.8` · Gameplay contract: 16 · Tutorial: 18

The compatibility estuary's human residents are now persistent individuals you meet in the field: observe what is visible, exchange names at speaking distance, and watch weather alter their condition without gaining impossible knowledge.

### Gameplay

- The existing 42 compatibility-region humans now receive deterministic semantic identities with stable generated names drawn from 226 given names and 206 family names, age bands, height, build, distinguishing marks, visible occupation-shaped gear, coherent temperament pairs, useful skills, and a bounded generated background history. Their identity derives from world seed plus immutable origin settlement and actor ordinal rather than current array order or a disposable runtime ID.
- Residents now appear as physical people around their home settlements as well as porters on active routes. Directly visible people can be selected in Chart or Relief; leaving the short exact-detail field immediately removes their label, hit target, and ABOUT disclosure.
- Traveling residents accumulate wetness, cold pressure, and exhaustion according to live rain, wind, gear, temperament, and skills. Unsafe weather can make an assigned porter hold position and delay the same physical Promise, then resume when conditions ease; event-caused worried, afraid, tired, focused, content, and relieved states remain separate from player difficulty.
- A close GREET records one bounded met-player memory and reveals that person's name, occupation, and home. Observation must occur first, speaking is unavailable while the courier is ADRIFT, and repeated greetings cannot farm facts or rewards.

### Fixes

- Relief water no longer inherits the last visible terrain material or composites far river cells over nearer ones when the camera faces along a channel. Its opaque, depth-writing 3D surface now remains in bounded blue depth shades through every zoom, view direction, biome, tide, and weather state; unsounded water stays one neutral channel blue until direct detail or a sounding discloses more.
- The underfoot terrain name now confirms an ordinary land or biome seam before changing, and unchanged field text is no longer rewritten every movement step. Entering water, leaving water, and becoming ADRIFT still update immediately, and desktop and mobile consume the same stabilized wording.
- Promise cards no longer disclose an unknown requester's name or occupation before the player has learned it; they say only that a local resident requested the work.
- Resident selection and greeting now fail closed against stale or remote observation. The simulation requires the exact prior observation tick, so a UI command cannot manufacture acquaintance with somebody the player never saw.
- The EVENTS feed now stamps actor events only when they were directly observable at their event-time location. A distant route event cannot become retroactive god's-ear knowledge after its porter later walks into view.
- ABOUT no longer exposes internal stable IDs, recreates its facts every animation frame, blocks world input through transparent space, or leaves a dead GREET control after introduction.

### Balancing

- The clear-air terrain field now reaches toward fifty-two tiles, staying fully legible through thirty-four before an eighteen-tile atmospheric feather. Exact people, items, labels, live water detail, and actions remain constrained to the existing ten-tile field, so route-scale terrain context does not become actor or loot radar.
- A CHALLENGING HARD remains the only ruleset. ABOUT, generated identity, emotion marks, and event filtering reveal no exact hidden needs, temperament scores, skill values, or easier actor behavior.

### Interface

- Click or tap a directly visible person to open a compact pane-free ABOUT view. OBSERVED lists approximate physical and behavioral cues; KNOWN contains only facts learned through interaction. The view does not pause currents, weather, travel, or actors, and closes when sight is lost.
- Human states use restrained floating text faces such as :S, :\[, :|, =\], and :) alongside posture, short speech, and condition text. Wrapped overhead copy is clamped to the visible field without placing system explanations in a speech bubble.
- Chart and Relief use the same minimum 44-pixel person target on touch, the same disclosure rules, and the same non-blocking ABOUT actions.

### Save changes

- The outer game save remains version 4. Its embedded simulation snapshot advances to format 3 and tideweft-sim/5; compatible format-1 and format-2 snapshots migrate the existing 42 residents into deterministic identities, condition, knowledge, and bounded memory only after their old checksum is verified.
- Each identity stores immutable origin settlement key, origin actor ordinal, origin role, and generation version. Reordering a settlement population or moving a resident later cannot silently rename or replace that established person.
- Learned names, introduction facts, weather condition, route delays, resident memories, and event-time observation evidence persist through save/load without rerolling.

### Known limitations

- This is a deliberately limited human vertical slice for the seven compatibility-region settlements and their 42 residents. Universal generated humans beyond region 0,0, dogs, bears, birds, deer, companions, ownership, social networks, physical NPC inventories, and cross-species ecology are not live yet.
- Relationship knowledge currently stops at recognition and acquaintance: GREET reveals name, occupation, and home, but full conversation, negotiation, trust history, religion/language disclosure, intimidation, deterrence, and companion relationships remain planned.
- Weather-aware porters can hold and resume an assigned route, but they do not yet pathfind into a physical shelter. Anonymous sound-aware NPC contacts, actor-to-actor perception, regional NPC promotion/streaming, and complete needs-driven survival remain unfinished.

## 0.3.3-alpha.7 — 2026-09-02

Build: `0.3.3-alpha.7` · Gameplay contract: 15 · Tutorial: 17

Footing is now a live physical percentage, rivers visibly carry their own calm or rough character, and Relief keeps dry ground earthy on every frame.

### Gameplay

- Stability now resolves directly to the percentage of balance supported by current speed, turning, grade, roughness, moisture, depth, local current, wind, load, cargo shift, footwear, fixtures, posture, and BRACE. Identical conditions hold one value instead of draining it again each fixed step.
- Each wet tile now derives one deterministic local strength and turbulence profile from physical depth, bed roughness, tide, and weather. The same profile drives player footing, visible surface character, foam, and the river's restrained OHM or WHISSH voice.
- Deep-water loss of control still occurs only when stamina or the current stability percentage reaches zero. The existing controllable ADRIFT state, physical cargo consequences, and shallow-water recovery remain authoritative.

### Fixes

- Relief now resets persistent WebGL emissive material state before every land batch. Water or actors from a prior frame can no longer tint later dry ground cyan after the correct first frame flashes by.
- The Relief light rig now preserves warm mudflat, sandbar, marsh, meadow, ridge, and built materials while keeping actual channel, shallows, and deep water visibly separate and blue.
- Rain and squalls no longer translate the Chart camera or the entire Relief world. Weather moves its screen-space precipitation, surface water, wind cues, and environmental effects without making the land shake.
- Leaving a river recalculates stability immediately from the bank's support, so a remaining crosswind cannot keep the courier trapped at a depleted water value.

### Balancing

- BRACE raises the currently supported stability percentage and reduces travel speed rather than slowing an inevitable repeated drain. Calm crossings can remain controllable; sufficiently rough unbraced water can still reduce current balance to zero.
- A CHALLENGING HARD remains the only ruleset. Accessibility can steady presentation, but it does not change river force, stability calculation, cargo risk, rewards, scarcity, or ADRIFT recovery.

### Interface

- Ordinary water uses moving streamlines and sparse foam instead of arrow carpets. SOUND / SCAN adds analytical arrowheads; surface character can communicate calm or rough flow without revealing an exact unsounded depth or effort value.
- Desktop and compact mobile layouts now expose the same pane-free field facts: terrain and biome, WATER or GROUND and known depth, effort, live stability percentage and cause, signed region/local/global coordinates, and measured FPS.
- Terrain that leaves the broad sight field now eases through a brief visual impression into dim Chart memory or uncharted darkness instead of snapping black. Chart and Relief share that terrain-only fade; people, parcels, resources, exact water detail, labels, actions, and hit targets still disappear immediately.
- Relief precipitation remains a bounded two-dimensional screen-space effect over the 3D field and always travels downward.

### Save changes

- Save version remains 4 and requires no migration. Existing numeric stamina and stability fields remain valid; the next physical contact deterministically recalculates stability from current conditions instead of replaying accumulated footing drain.
- Local river character is derived from existing terrain, tide, and weather, so save/reload and region revisit reproduce the same physical profile without storing or rerolling a new river object.
- The short terrain impression is one bounded presentation buffer, never save data or world knowledge. It clears on reload, world replacement, spatial recentering, and incompatible grid changes, and cannot preserve hidden actors or interactions.

### Known limitations

- Universal generated NPC identities, ABOUT inspection, state speech, actor emotions and deterrence, dogs, wildlife, health, all-water Possibility State, and generated regional settlement ecology are not live in this release.
- Surface water now has shared deterministic strength, turbulence, visual motion, and textual voice, but a complete continuous natural-water audio field for every hydrological scale remains an ongoing sound-design pass.
- Autonomous loose-parcel drift across a regional seam remains unfinished; a conserved parcel stays in the signed region where it stopped until that region becomes active again.

## 0.3.3-alpha.6 — 2026-09-02

Build: `0.3.3-alpha.6` · Gameplay contract: 14 · Tutorial: 16

Relief 3D once again keeps flooded land earthy beneath its clearly separate water surface.

### Gameplay

- Terrain sight still reaches forty-two tiles through its forward field while exact people, parcels, resources, labels, and interactions remain inside the short ten-tile detail field.

### Fixes

- Newly visible but not-yet-charted flooded marsh and meadow tiles no longer lose their biome identity and become blue channel ground in Relief 3D.
- Unsounded water neutralization now applies only to terrain that is physically a water kind; wet land keeps its earthy material beneath the separate rendered water sheet.

### Balancing

- A CHALLENGING HARD remains unchanged. Current force, footing, stability, stamina, exposure, cargo behavior, scarcity, and rewards are identical to the prior build.

### Interface

- Relief 3D now gives land and water distinct, readable layers during transient line of sight instead of washing the terrain silhouette into a continuous blue field.

### Save changes

- Save version remains 4 and requires no migration; this correction changes only material classification in the 3D presentation.

### Known limitations

- Universal generated NPC identities, ABOUT inspection, state speech, actor emotions and deterrence, dogs, wildlife, health, all-water Possibility State, and generated regional settlement ecology are not live in this hotfix.

## 0.3.3-alpha.5 — 2026-09-01

Build: `0.3.3-alpha.5` · Gameplay contract: 14 · Tutorial: 15

The courier now reads a wider, softer landscape ahead without gaining impossible knowledge of every person, parcel, or resource standing in it.

### Gameplay

- Clear-air terrain sight now reaches toward forty-two tiles through a 160-degree forward field with six-tile close awareness. The landscape remains fully legible through twenty-six tiles, then eases across a sixteen-tile atmospheric horizon.
- People, porters, loose cargo, field resources, names, current detail, live state, labels, and actions remain inside a short ten-tile, 100-degree exact-detail field with two-tile close awareness.
- Terrain and exact detail now use separate occlusion questions: substantial cover and structures can conceal an actor or item without erasing the larger terrain silhouette behind them, while actual elevation still creates a physical horizon.

### Fixes

- A rough meadow cell, harbor structure, or band of cover no longer cuts an implausible wall of blackness through every shoreline and ridge behind it.
- Two opaque cells touching at a diagonal now close that zero-width crack to exact sight, so an actor or parcel cannot be identified through a sealed corner; one genuinely open flank still permits a view around the edge.
- Widening terrain sight does not widen exact knowledge. Porters, parcels, resources, labels, and release-frame interactions still fail closed unless their current tile is directly visible in the short detail field.
- A supplied perception snapshot must now match every authoritative visibility byte and derived tile partition, not merely repeat the current signature; forged or mutated same-signature detail masks fail closed.
- Cached sight now verifies its own disclosure digest before reuse. If an internal typed visibility byte is altered, the cache is discarded and rebuilt from terrain, facing, and weather before render or interaction projection.
- The perception contract is now version 3, so a stale version-2 projection cannot be reused after the new range or occlusion rules take effect.
- Chart 2D and Relief 3D consume the same eased terrain strengths and the same conservative detail mask; turning or changing weather cannot make the two views disagree.

### Balancing

- A CHALLENGING HARD remains the only ruleset. This changes readable terrain information, not current force, stability, stamina, cargo loss, rewards, scarcity, actor behavior, or world outcomes.
- Weather still contracts terrain and detail together. Bad visibility can reduce the long horizon to a short local read without granting compensating item or actor detection.
- Hidden actors and items remain persistent simulation objects. Leaving exact sight removes them from draw and hit-test work; it never despawns, rerolls, duplicates, or relocates them.

### Interface

- The forward landscape now fades by distance, angle, and true terrain horizon instead of behaving like a short tiled flashlight. No pane, meter, outline, or radar marker was added.
- Relief's transient sight overlay now uses eight smooth visibility bands and canonical biome-or-terrain materials with a tested per-chunk batch ceiling. Durable terrain keeps its full climate material detail while the wider horizon submits substantially fewer 3D draw batches.
- Anonymous sound remains directional uncertainty only: hearing something outside sight does not reveal its identity, exact coordinate, inventory, or interaction target.
- The version-15 T and question-mark field manual explains the forty-two-tile terrain field, short ten-tile detail field, physical elevation horizon, cover, weather, and transient sight versus durable Chart memory.

### Save changes

- Save version remains 4 and requires no migration. Perception masks, eased strengths, and visibility signatures are derived from current terrain, facing, and weather rather than serialized.
- Existing exploration, soundings, actor identities, cargo custody, depletion, Promise state, and regional coordinates are unchanged by the wider view.
- Reloading cannot reroll sight or reveal hidden contents: the same world state, facing, weather, and perception version reproduce the same disclosure.

### Known limitations

- Universal generated NPC identities, ABOUT inspection, state speech, actor emotions and deterrence, dogs, wildlife, and generated regional settlement ecology remain future complete vertical slices.
- The complete health, injury, exposure, drowning, incapacitation, rescue, death, and incident-site system is not live.
- All ordinary water still uses the existing physical and magical-water climate signals; the planned all-water Possibility State and transactional reality shifts are not live.
- The anonymous nearby sound-contact kernel is not connected to generated humans or wildlife yet; this release preserves its no-god's-ear information boundary.

## 0.3.3-alpha.4 — 2026-09-01

Build: `0.3.3-alpha.4` · Gameplay contract: 13 · Tutorial: 14

A lost river crossing is now something the courier survives moment by moment: float, read the current, paddle toward shallows, recover enough breath to rise, and keep every separated parcel in the same physical world.

### Gameplay

- Deep-water stamina or stability collapse now enters a player-controlled ADRIFT state. Current keeps carrying the courier while WASD or arrows provide a held paddle stroke, a touch tap provides one bounded stroke toward that point, and releasing movement floats to recover stamina.
- Reaching standable shallows is physical progress rather than instant ejection. The courier floats there until at least 100,000 stamina is available, then rises; scanning, gathering, harbor work, Promise changes, and other grounded actions wait until footing returns.
- Clear-air terrain now carries thirty tiles ahead through the same 150-degree field. It remains fully legible through eighteen tiles and eases across a twelve-tile atmospheric horizon, while people, cargo, resources, labels, current detail, and actions remain inside the shorter eight-tile detail field.
- Public current direction now preserves wind magnitude instead of turning every nonzero crosswind into a full diagonal. The same fixed-point vector drives footing, loose parcels, current cues, and ADRIFT motion.

### Fixes

- A movement key already held when footing gives way now becomes the first paddle stroke instead of being discarded. Releasing it floats immediately, and touch steering expires after eight fixed beats or cancels on focus loss.
- Held input can no longer spend every tiny stamina recovery forever in shallow water. Standing takes precedence once the water is shallow enough, so recovery reaches a bounded exit.
- Paddling and maximum support can bend or slow a current but cannot turn direct upstream input into a permanent upstream motor; the downstream physical component remains authoritative.
- Current version-4 saves preserve an in-progress ADRIFT position, previous position, velocity, stamina, support, traversal evidence, cargo manifest, and valid adjacent guide exactly. Invalid legacy guides repair deterministically without moving the courier.
- Crossing a signed regional boundary while ADRIFT no longer crashes when a one-beat-old guide leaves the recentered five-region window. The disposable guide clears and replans from the exact preserved position.
- ADRIFT uses its own bounded paddle sound instead of land footsteps. OHM, WHHSH, and HUP remain separate from complete system explanations, and both views clamp the panel-free state copy inside the playable aperture.
- Tiny crosswind now remains tiny for player footing and parcel drift instead of receiving the same lateral force as a maximum crosswind; malformed and extreme vectors clamp safely.

### Balancing

- A CHALLENGING HARD remains the only ruleset. ADRIFT adds skillful recovery control rather than weaker water: tide, current, water depth, stamina, carried load, Tide anchors, Tide sails, Storm kites, and ferry support still determine what one stroke can accomplish.
- Floating restores 2,800 stamina per fixed beat; an exhausted attempted stroke restores less. A loaded pack weakens steering, and no legitimate combination of assistance erases the downstream current.
- The longer terrain horizon reveals ground shape only. Rear awareness remains five tiles, and exact detail remains two tiles around the courier or eight tiles inside its narrower forward field, so distant terrain never becomes loot or actor radar.
- ADRIFT no longer displays a fabricated percentage, distance, or arrival time. Live tide and free steering can invalidate an old bank estimate, so the interface reports only current physical state.

### Interface

- Chart 2D and Relief 3D now show a floating, paddling, breath-catching, or ready-to-rise pose with restrained color, wake, and separate Atari-like water syllables. No pane was added.
- The field and touch action copy now says ADRIFT and teaches MOVE / TAP TO PADDLE and RELEASE TO BREATHE. Canvas accessibility descriptions expose the same keyboard, touch, and recovery behavior.
- The terrain horizon fades monotonically from full clarity to darkness rather than ending in a hard ring; ridge occlusion and weather still contract the same shared Chart and Relief perception snapshot.
- The version-14 T and question-mark field manual teaches controllable ADRIFT, shallow-water standing, physical cargo consequences, magnitude-scaled currents, and the thirty-tile terrain versus eight-tile exact-detail boundary.

### Save changes

- Save version remains 4 and requires no migration. Held keys and touch pulses are transient input, while the physical ADRIFT state and all cargo custody remain inside the existing sealed session.
- Reloading an in-progress river incident cannot reroll its position, stamina, support, traversal result, damaged lot, or separated parcel state. Derived bank guides may be repaired but never replace those authoritative facts.
- The wider terrain falloff and current-vector projection are derived from existing world, weather, player, and perception state; neither adds serialized fog or presentation caches.

### Known limitations

- The complete health, injury, cold, wetness, drowning, incapacitation, rescue, and incident-site system is not live; ADRIFT currently recovers through stamina and shallows rather than an HP or exposure model.
- All ordinary water still uses the existing physical and magical-water climate signals; the planned all-water Possibility State, personal-history drift, and transactional reality shifts are not live.
- Universal generated NPC identities, ABOUT inspection, actor emotion and deterrence, dogs, wildlife, audible actor contacts, and generated regional settlements remain future complete vertical slices.
- Autonomous loose-parcel drift across a regional seam remains unfinished; a parcel stays conserved in the signed region where it stopped until that region is active again.

## 0.3.3-alpha.3 — 2026-09-01

Build: `0.3.3-alpha.3` · Gameplay contract: 12 · Tutorial: 13

The horizon now breathes at two scales: terrain carries far enough ahead to plan a route, while people, cargo, labels, live conditions, and actions resolve only inside a shorter exact-detail field.

### Gameplay

- Clear-weather terrain sight now reaches about twenty tiles through a 150-degree forward field with five-tile close awareness; actors, cargo, resources, names, live status, current arrows, events, and exact interactions remain inside a shorter eight-tile, 120-degree detail field with two-tile close awareness.
- Ridges, substantial structures, and weather occlude or contract both fields deterministically. A 256-step distance-and-angle falloff eases the eight-tile outer terrain band into translucent darkness, while a bounded atmospheric frontier softens earlier ridge and obstruction cutoffs instead of ending at a hard tiled flashlight edge.
- Uncharted land and ordinary water can appear transiently while they are in the broad terrain field. Looking does not silently chart them: turning away restores darkness unless the courier physically explored or sounded the place.

### Fixes

- Relief 3D now draws current uncharted terrain from a separately cached sensory height field instead of flattening it through durable Chart discovery; turning changes only bounded material batches rather than rebuilding terrain geometry.
- Known harbor, Wayknot, and Tide-Harp names no longer remain readable outside exact detail. Neutral mapped silhouettes may persist without exposing live population, status, activity, or Promise badges.
- Loose cargo, porters, resources, particles, witnessed event markers, live route runs, and release-frame hit validation all consume the shorter detail mask, so widening terrain sight cannot restore distant labels or stale actions.
- Transiently visible water uses the established dark water language and the same eased horizon in Chart and Relief while hidden bathymetry, soundings, biome identity, and current arrows remain undisclosed.
- Hidden parcels no longer steer the Loom from live unseen coordinates, remembered routes cannot be selected through fog, and remote route strength cannot change local ambience.
- World events now use their typed physical locus: an origin departure cannot appear merely because its destination is visible, and unrelated numeric IDs cannot masquerade as settlement locations.
- Field-resource actors now leave the renderer entirely outside exact detail, reducing remote draw work and preventing hidden depletion from changing a remembered marker.

### Balancing

- A CHALLENGING HARD remains the only ruleset. The broader horizon changes readable terrain information, not current strength, stability pressure, cargo physics, loot, Promise rewards, actor behavior, or save outcomes.
- Bad weather still shortens sight substantially. Terrain remains readable farther than exact objects, so route planning improves without turning the fog into remote inventory or NPC radar.
- Hidden actors, items, resources, and cargo keep their persistent identities and continue authoritative simulation; leaving the detail field never despawns, rerolls, duplicates, or deletes them.

### Interface

- Chart 2D and Relief 3D now present the same broad-terrain and short-detail authority, including the graduated peripheral horizon, transient uncharted surfaces, fogged labels, and weather pressure.
- Relief labels now wrap instead of ellipsizing and clamp inside the playable aperture on compact screens, keeping their complete text visible without adding panes.
- The version-13 T and question-mark field manual explains the two perception scales, approximate clear-weather reach, occlusion, transient sight versus permanent map memory, and the exact kinds of information that remain close-range.

### Save changes

- Save version remains 4 and requires no migration. Both perception masks, the transient sensory mesh, and renderer caches are derived from the current world and are not serialized.
- Durable exploration, depth soundings, regional cartography, cargo custody, resource depletion, actor identity, and Promise state remain unchanged by momentary line of sight.

### Known limitations

- The floating regional presentation window still carries a one-tile seam halo; the wider visual horizon can contract briefly at an uncrossed regional edge before the ordinary floating-origin recenter completes.
- Swept movement still follows a deterministic bank path rather than the planned player-controlled ADRIFT paddling state; ordinary steering returns only after reaching shore.
- The anonymous nearby sound-contact kernel is not yet connected to generated humans or wildlife because those living actor systems are not live yet.
- Universal generated NPC identities, ABOUT inspection, actor emotion and deterrence, dog relationships, health and rescue, all-water possibility drift, and generated settlements remain future complete vertical slices.

## 0.3.3-alpha.2 — 2026-09-01

Build: `0.3.3-alpha.2` · Gameplay contract: 11 · Tutorial: 12

The field now reveals only what the courier can actually perceive: explored ground remains as quiet memory while unseen live detail, stale actions, remote events, and off-screen route work leave the draw path.

### Gameplay

- Chart 2D and Relief 3D now consume one shared cached perception snapshot: a forward direct-sight cone carries exact detail and actions, close peripheral awareness carries only coarse form, and terrain plus weather can occlude or shorten sight.
- Previously explored geography remains as dim cartographic memory, but unseen actors, loose cargo, resource detail, currents, particles, event callouts, and other changing field state are neither drawn nor targetable until directly perceived again.
- Tracked Promise destinations retain coarse navigation guidance without granting remote inspection, pickup, delivery, stock knowledge, or other exact interactions through fog.

### Fixes

- Observed EVENTS no longer grant a god's-ear account of remote incidents. The feed admits directly perceived events and events involving the courier or their active Promise, while hidden positions and unrelated distant details remain undisclosed.
- Short OOP, THUD, WHHSH, and similar actor sounds remain above the courier while the full cargo, footing, or recovery explanation appears in EVENTS; both Chart and Relief clamp overhead copy inside the usable viewport.
- Release-frame interaction validation now re-resolves settlements, resources, porters, and parcels against current perception, so turning away, weather occlusion, region motion, or a stale pointer target cannot execute a hidden exact action.
- Relief 3D precipitation now falls downward in a bounded final screen-space pass, and wind uses the same inexpensive two-dimensional presentation over the three-dimensional field.
- Known routes retain durable map geometry without revealing hidden live traffic or condition, and route work outside the visible field is clipped before drawing.

### Balancing

- Fog changes knowledge, interaction, and rendering only. It does not weaken hazards, alter rewards, reroll loot, regenerate resources, erase cargo, or create another difficulty beside A CHALLENGING HARD.
- Unseen persistent objects and regional state continue their authoritative simulation and return with the same identities and history when the courier can perceive them again.
- Bad weather can reduce direct visual reach, but close peripheral awareness remains available; exact actions still require direct perception rather than a hidden probability roll.

### Interface

- The frameless field now carries signed region, local, and global coordinates plus smoothed FPS measured from the active renderer rather than an invented timer.
- The bottom-right EVENTS typography replaces the old water-memory framing, shows the latest complete observed explanation on compact screens without clipping, and leaves character vocalizations physically near their source.
- Relief weather remains a resource-bounded screen-space weather pass, so rain and wind stay readable without filling the three-dimensional scene with persistent particle objects.
- The version-12 T and question-mark field manual explains direct sight, peripheral awareness, fogged map memory, hidden actions, event provenance, signed coordinates, measured FPS, and the current deterministic sweep behavior.

### Save changes

- Save version remains 4 and requires no migration. Perception snapshots and renderer telemetry are derived presentation state and are never written as new world truth.
- Exploration, stable identities, physical cargo custody, collected-resource depletion, regional manifests, and active Promise recovery remain authoritative across fog, unload, save, and reload.

### Known limitations

- Swept movement still follows a deterministic bank path rather than the planned player-controlled ADRIFT paddling state; ordinary steering returns only after reaching shore.
- The anonymous nearby sound-contact kernel is not yet connected to generated humans or wildlife because those living actor systems are not live yet.
- Universal generated NPC identities, ABOUT inspection, actor emotion and deterrence, dog relationships, health and rescue, all-water possibility drift, and generated settlements remain future complete vertical slices.
- Weather now has bounded cross-view presentation and perception pressure, but the complete systemic language for every weather state—including exposure, fire, ecology, and actor responses—remains unfinished.

## 0.3.3-alpha.1 — 2026-09-01

Build: `0.3.3-alpha.1` · Gameplay contract: 10 · Tutorial: 11

A fairer footing pass makes BRACE matter through a river and restores control on a windy bank, deliberate restart and signed information jobs survive the phone interactions that obscured them, and the frameless field now carries visible rain, wind, eased depth, and a living Tideweft title.

### Gameplay

- BRACE now provides a meaningfully planted crossing window: the same held Shift or touch input still slows travel, protects fragile cargo, and resists footing pressure without making deep water or unsupported edges safe.
- Dry supported footing can perform corrective recovery while resisting crosswind, so leaving a river creates a real route back from zero Stability instead of another hidden endurance drain.
- Each signed information action now has one stable source-subject-recipient identity and names both the exact stock fact and its recipient.

### Fixes

- The exact restartrestartrestart phrase now survives touch-keyboard blur, ordinary title refreshes, and a later tap of Unlock restart; the temporary authorization clears only when the title actually closes or changes recovery mode.
- Blank replacement seeds remain rejected before dispatch, rapid repeated START input can issue at most one replacement command, and a failed runtime replacement returns the form to a safe retry state without changing the current save.
- Duplicate trust or fact ordering can no longer create duplicate-looking signed-report actions; projection selects one deterministic entry per source, subject, and recipient without mutating the simulation.
- A severe crosswind on a dry bank no longer prevents every point of Stability recovery while the courier is planted.
- Relief 3D now renders the same authoritative drizzle, rain, and squall state already visible in Chart 2D; a bounded dual-contrast precipitation pass remains legible over pale water and dark terrain.
- Pointer travel on safe diagonal ground now follows a bounded deterministic lookahead instead of alternating visibly between cardinal steps. It retains every named hazard contact, rejects blocked corners and costlier shortcuts, and settles inside a fixed deadzone without reversing past the target.

### Balancing

- Held BRACE footing-pressure mitigation rises from 46 percent to 62 percent. Its 62 percent travel-speed multiplier remains, so preparation and time still carry a cost while the control now buys substantially more crossing distance.
- Deep water and unsupported edges do not receive the new dry-ground corrective recovery. Continued deep-current exposure can still exhaust even a braced courier, and terrain, current direction, load, tools, and route choice remain decisive.
- A CHALLENGING HARD remains the only ruleset; no loot, Promise reward, cargo condition, encounter, or save rule changes with player performance.

### Interface

- The saved-world title now gives separate persistent status for restart unlocking and the required new seed, uses phone-safe text-input hints, and keeps the current save consequence visible at every step.
- Signed-report rows spell out Subject and Recipient in both their action and explanation, so several legitimate destinations no longer resemble repeated generic document quests.
- The title is now a full-viewport, frameless deterministic tide field with a bounded opening bloom. Its short synthesized crescendo waits for the first lawful tap or key, plays at most once per genuine opening, and shares the existing audio graph.
- Opaque field panes, edge shelves, and boxed controls are gone: the HUD, compass, Promises, inspector, and actions now float as readable typography, hairlines, and restrained symbols directly above the unobstructed world, while desktop and touch scrolling semantics remain intact.
- Sparse deterministic wind threads expose authoritative direction and relative strength in clear weather as well as storms. Relief rotates the visual vector with camera orbit while preserving world-north compass truth.
- Mouse position now supplies at most a few pixels of presentation-only eased depth, and world text follows camera motion with bounded easing. Touch, coarse pointers, and reduced-motion users receive a stable view, while inverse projection keeps targets exact.
- The version-11 T and question-mark field manual documents windy-bank recovery, visible weather and wind, the frameless title and HUD, the stronger but finite BRACE window, unique report identities, and the exact two-stage desktop and touch restart flow.

### Save changes

- Save version remains 4 and requires no migration. Existing region, cargo, cartography, Wayknot, Promise, report, and history records remain byte-compatible.
- Unlocking restart remains temporary UI state and performs no storage write. Only one accepted non-empty seed command can create the higher-generation replacement; rejected phrases, blank seeds, blur, and double taps leave the durable world intact.

### Known limitations

- Swept movement still follows a deterministic bank path rather than the planned player-controlled ADRIFT paddling state; cargo remains physical and recoverable under the current system.
- Current visibility is still discovery-based rather than the planned facing, occlusion, and sound-contact perception budget; the coordinate and smoothed FPS overlay is not live in this hotfix.
- Distant humans, wildlife, emotion, deterrence, aftermath, dog relationships, survival ecology, and generated settlements are not live yet.
- Rain and wind now have cross-view presentation, but the complete distinct systemic language for clear, mist, drizzle, rain, squall, and aurora—including local fronts, exposure, fire, ecology, and actor responses—remains a future series of connected slices.
- Autonomous loose-parcel drift across a regional seam, procedural ravines, ropes, ladders, living mangrove catches, bramble, and regional weather fronts remain future complete vertical slices.

## 0.3.3-alpha.0 — 2026-09-01

Build: `0.3.3-alpha.0` · Gameplay contract: 9 · Tutorial: 10

The horizon now opens: one deterministic signed world streams through continuous terrain while the floating chart, physical cargo, Wayknots, and local save keep their exact places.

### Gameplay

- The courier can cross regional horizons in every direction, including negative coordinates. Bounded five-region streaming and a one-tile overlap evaluate the real terrain on both sides before the floating 98 × 74 field recenters.
- Region 0,0 remains the exact authored Alpha estuary. Deterministic generated terrain beyond it continues rivers, relief, water, and biome signals without cloning harbors or easy resource opportunities.
- Carried lots, region-specific loose-parcel worlds, chart marks, depth soundings, and all six reusable Wayknots retain signed identities across crossing, unloading, return, save, and reload.
- Promise cargo may take a regional detour and still be delivered after returning. A journey that leaves the authored route network cannot claim fabricated route-reinforcement credit.

### Fixes

- Compatibility resource patches now project only at their true region-0 coordinates; matching local coordinates in another region cannot duplicate, gather, or reset them.
- Remote PICK UP, DELIVER, and signed-report objectives retain the correct harbor name, finite global distance, and compass bearing instead of collapsing to a false nearby position.
- Crossing a horizon cancels stale Chart drags, Relief orbit/twist state, pointer captures, and queued local targets so an old spatial frame cannot issue an accidental command in the new one.
- Published 64 × 48 Alpha saves migrate into compatibility region 0,0 inside the current floating window while preserving their original world, cargo, chart, and choir baseline.
- A deep-water sweep can continue toward a horizon when no safe bank exists in the current region, rather than deadlocking at the old map edge.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Regional travel does not change fall chances, stamina costs, cargo damage, settlement rewards, or resource rarity.
- Crossing an empty horizon grants no stock, money, trust, or guaranteed find. Dangerous distance is possibility, not an automatic loot payout.

### Interface

- A restrained horizon message names the signed region after recentering, and the ordinary location line shows R x,y outside the original harbor country.
- The version-10 T/? field manual adds a complete Horizons page for desktop and touch: crossing, signed addresses, persistence, Promise detours, return guidance, and current frontier limitations.
- Both Chart 2D and Relief 3D snap cleanly to the same new spatial epoch while preserving camera legibility and the world-north compass.

### Save changes

- Save version 4 adds a sealed regional-travel sidecar containing the signed stream center, transition ordinal, sparse durable manifest, and regional cartography; loaded terrain itself is regenerated from the original seed.
- The physical-cargo sidecar now separates one active regional parcel world from sealed touched inactive worlds under one exact global custody manifest, preventing unload duplication or silent deletion.
- Version-1, version-2, and version-3 saves migrate into region 0,0. A version-4 save whose player, cartography, cargo region, or inner and outer seals disagree is quarantined rather than repaired into a different history.
- The complete outer save is checked against a fixed browser-storage budget before any write; a rejected oversized snapshot cannot overwrite the last durable copy.

### Known limitations

- Authored settlements, residents, Promise generation, route infrastructure, and natural material patches currently exist only in compatibility region 0,0. Generated regional settlement ecology and causal sparse opportunities are not live yet.
- Loose parcels persist in the region where they stop and reappear with the same identity on return, but autonomous parcel drift does not yet transfer an object across a regional seam.
- Distant actors, wildlife, humans, aftermath scenes, survival ecology, and low-fidelity unloaded event simulation are not live in this release.
- Procedural ravines, ladder and rope traversal, living mangrove or bramble catches, and regional weather fronts remain future vertical slices; existing generated ridges, water, global weather, footing, falls, and sweeps are live.

## 0.3.2-alpha.1 — 2026-09-01

Build: `0.3.2-alpha.1` · Gameplay contract: 8 · Tutorial: 9

Brace now answers wherever active play has focus, while a bounded cargo-evidence and rendering path keeps recoverable river parcels from dragging the field to a crawl.

### Gameplay

- Desktop Shift and mobile BRACE still use one authoritative rule: held bracing trades speed for stability recovery and fragile-cargo protection without guaranteeing safety on unsupported terrain.
- Ordinary far-away parcel bodies now leave a 32-tile player-centered render interest radius, but physical parcels are never despawned, deleted, or rerolled; an active Promise stays recovery-focused and its objective names direction, distance, and motion.

### Fixes

- Desktop Shift now reaches the brace rule after the document body or a HUD control receives focus; text editors and open dialogs retain keyboard ownership.
- Both Shift keys share one hold safely, and blur, hidden-page, teardown, and final-key release paths clear bracing instead of leaving a stuck safety state.
- Canvas Shift, document-level Shift, and touch BRACE now retain independent hold ownership, so releasing one input on a hybrid device cannot cancel another that is still held.
- Physical-cargo commits no longer revalidate a freshly sealed immutable prior sidecar or repeatedly hash a multi-thousand-record detailed event tail on every 100 ms movement beat.
- A production-path regression now advances the full 64-parcel cap through sealed simulation while proving exact identities, archive evidence, save validation, and a bounded completion budget.

### Balancing

- No hazard probability, cargo damage, stamina cost, reward, or difficulty value changed; A CHALLENGING HARD remains the only ruleset.
- The recent physical-cargo evidence tail retains 256 exact records while older records fold into the existing irreversible archive hash; this changes storage work, not simulation outcomes or recovery rights.

### Interface

- Holding Shift or touch BRACE immediately adds BRACING to the safety readout and draws a structural amber planted-foot mark around the courier in both Chart 2D and Relief 3D.
- The version-9 T/? field manual explains global desktop brace focus, the visible held-state confirmation, bounded ordinary-parcel rendering, and active-Promise recovery guidance.

### Save changes

- Save format remains version 3. Existing sealed physical-cargo saves remain valid; their larger legacy history tail compacts safely into hash-chained archive evidence on a later authoritative parcel step.
- Distant render culling never mutates the physical-cargo sidecar, expected manifest, quantities, material condition, custody, source tombstones, or stable parcel identities.

### Known limitations

- The playable world remains compatibility region (0,0); true cross-region parcel transfer, unloaded low-fidelity simulation, negative-coordinate travel, and floating origin are not live.
- Parcels outside the render interest radius continue authoritative loaded-region simulation rather than a completed distant-simulation summary; bounded regional streaming is still in progress.
- Procedural ladder-gated rocks and ravines, survival meters, wildlife, human actors and speech, living mangrove or bramble catches, and regional weather fronts are not live in this hotfix.

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
