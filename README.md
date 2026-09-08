# TIDEWEFT

> A restorative courier ecology about promises, tides, and the dependencies we create.

**Play the current Alpha:** https://19koda19.github.io/tideweft/

The current public deployment is the **LIVE_VERIFIED**
`0.3.3-alpha.31 — High Country Shadows` release described below. Exact
gameplay commit `d124f71c1c8656db68a764d048c9a1e5d14163a7` passed feature CI
run `34241221388`, main CI run `34243147747`, and Pages run `34243147753`.
All five cache-bypassed live artifacts match the tested local production build
byte-for-byte.

TIDEWEFT is a playable, original strand-type simulation game built with p5.js, TypeScript, Vite, and Electron. You cross a seeded estuary with physical supplies or an accountable signed report, strengthen the exact corridors you use, and watch autonomous settlements begin routing care through the network.

The name came from the image that inspired the game: every crossing is a loose thread until tide, memory, and shared use weave it into something other people can trust.

The same browser-pure game runs as a static GitHub Pages build and inside a sandboxed Electron shell.

## Alpha 0.3 snapshot

Alpha 0.3 grows the earlier slices with fieldcraft, seamless travel, shared perception, and the first small living web:

- **The deliberate return:** every new and resumed estuary now uses the one official ruleset, **A CHALLENGING HARD**. A valid local save resumes automatically; deliberate replacement requires the exact `restartrestartrestart` phrase, **Unlock restart**, and a non-empty new seed. The two-stage form survives ordinary title refreshes and phone-keyboard blur without writing anything until START succeeds once. Offline Patch Notes, visible save-health recovery, longer unladen travel, compact mobile instruments, Relief rotation, and a world-north compass make that single path legible.
- **Tide Choir:** routes must be physically surveyed before shared parts can improve them. Closing a unique loop of three or more surveyed harbor legs awakens a one-time communal harmony and permanently strengthens that circuit.
- **Wild Reaches:** new worlds now span 96 × 72 tiles, keep every harbor at least 14 Manhattan tiles apart, and use seeded multi-octave gradient Perlin noise. Water is traversable, sounded depth scales stamina cost, civic field tools change difficult crossings, and deep-water exhaustion becomes a recoverable swept-away state.
- **Relief estuary:** the same authoritative terrain now drives a playable p5/WebGL height field with lit chunked land, dark depth-ordered water, depth fog, 3D routes, harbors, porters, cargo, soundings, pointer picking, zoom, and an orbiting camera. Relief water shares Chart's shallow/channel/deep palette, but uses a stronger discovery-masked opacity floor so shallow water is visibly dark, channels are darker, and deep water is darkest instead of washing into lit land. **Relief 3D** is the default where WebGL is available; **Chart 2D** is a persisted, reduced-motion-friendly fallback.
- **Living field presentation:** Relief now renders the same drizzle, rain, and squall visible in Chart, while sparse wind threads expose direction and relative force under any sky. Fine-pointer movement adds only a few eased pixels of presentation depth, labels settle with the camera, and inverse picking keeps commands exact. Touch, coarse pointers, and reduced-motion preferences receive a steady view. The HUD, compass, Promises, inspector, and actions now use floating typography, hairlines, and restrained symbols directly above the unobstructed world—no field panes or edge shelves. The title opens into a bounded deterministic tide field whose short synthesized crescendo waits for a lawful first tap or key.
- **People in the field:** the original estuary's 42 humans now have stable seed-derived identities, coherent temperament and skill details, short histories, changing weather condition, bounded memories, and persistent player knowledge. They can also see and anonymously hear the courier through a shared bounded perception loop: terrain and structures occlude sight, movement and weather alter visual contact, and rain or nearby turbulent water can mask sounds that wind may carry. If sight breaks, a person scans the last place they actually saw rather than tracking the courier through the world; lawful sight can reacquire the courier, otherwise suspicion fades and the search ends deterministically. Click or tap somebody in direct sight for a pane-free **ABOUT** view; its watching, listening, and searching cues reveal behavior without hidden coordinates or scores. **GREET** still reveals only what a nearby introduction can teach, and ABOUT never pauses danger.
- **First living web:** each seed now creates one independently generated dog beside one deterministically selected existing porter. The dog can smell the porter's physical dried-fish pack, move toward an uncertain scent belief over traversable ground, become wet or cold in current rain, and appear through the same knowledge-honest Chart/Relief **ABOUT** surface. The player may **ASK FOR HELP**, **SUGGEST SECURING BELONGINGS**, **WAIT AND WATCH**, **ROUTE AROUND THIS SPOT**, or **LEAVE**. The porter remains autonomous: a request can lead to waiting, securing the pack, rerouting, leaving, or an exact one-unit provision offer. A consumed meal creates bounded memory and persistence promotion, not ownership or a companion bond.
- **Bounded living ecology:** the production catalog retains its exact nineteen-record Alpha-29 prefix, while one separate remote source extends it to twenty-four records with wild boar, elk, gray wolf, cougar, and brown bear. Conserved aggregate populations, capped persistent individual representatives, groups, homes, and settlement custody all reuse shared perception, movement, activity, resource, mortality/body, and materialization owners; a social group enters detail atomically, while cougars and brown bears remain solitary. A marsh fox, gray wolf, or cougar already pursuing a currently identified solitary marsh rabbit may injure or kill that exact rabbit only at physical contact. Death retires it once, removes one population unit while any remaining represented units stay abstract reserve, and creates one stable finite carcass. A fox, fish crow, wild boar, gray wolf, cougar, or brown bear must lawfully see and physically reach that body to feed; each meal consumes one conserved unit, and eligible solitary predators may guard it. Brown bears have no live-prey pursuit or contact in this unit. Body and direct event presentation remain limited to current lawful perception. These remain bounded regional sources, not worldwide ecology, general animal mortality, reproduction, population recovery, or a complete bestiary.
- **Tidal Convergence:** Released Alpha 22 adds no species and changes no outer save, habitat, or aggregate schema. It composes the six existing activity-bearing wildlife roles through reusable **perch-watch**, **low-quartering**, **tidal-wader**, **dabbling-waterfowl**, **shore-water-forager**, and **aerial-surface-opportunist** profiles. A current terrain-occluded anonymous surface observation is available only to an addressable actor whose runtime capabilities include surface opportunity and tidal activity. That lets a gull circle a currently seen surface opportunity by air and return to its authenticated habitat anchor to rest without becoming an aquatic forager or gaining a hidden fish/crab target. Immediate lawful threat, alarm, pursuit, and physical-food intents still outrank neutral activity.
- **The Storehouse Door:** released Alpha 23 adds one bounded physical fresh-produce store at the starting harbor without adding a species. The settlement owns that exact lot separately from its abstract food economy. An open door projects food through the existing wind- and rain-shaped scent owner; a matching brown-rat attraction event may authenticate at most one real produce-unit loss, while rat population units remain conserved. An existing cat's lawfully visible presence can pressure the rat aggregate through shared perception policy, but the cat gains no hidden rat knowledge or new investigation behavior. Only a player standing near the real store and keeper can ask that keeper to secure it. The persistent secured door contains later scent, and an unseen loss never becomes a retrospective god's-ear event report.
- **The Yard Flock:** released Alpha 24 adds one stable group of two or three individual domestic chickens beside that store. The flock, each bird, its bounded yard anchor, and settlement custody persist independently of the camera. Chickens use the existing animal perception, attention, group alarm, terrestrial locomotion, broad-role interaction, and physical-item claim owners rather than a private behavior tree. A hungry bird must lawfully perceive and reach the exact open-store lot before one authenticated produce unit can be consumed; securing the door removes that opportunity. A witnessed meal is visible in EVENTS, while hidden activity never becomes retrospective narration.
- **The Far Paddock:** released Alpha 25 adds exactly two persistent domestic goats in one herd at a habitat-derived pen separated from the storehouse yard and prior animal placements. The goats plug into shared actor identity, direct perception, attention, terrestrial movement, broad-role interaction, group alarm, bounded materialization, Chart/Relief presentation, and pane-free ABOUT without a goat-only behavior tree. Settlement ecology now supports plural canonical custody and typed coop/pen homes, while physical-resource contention resolves by reach, current need, and stable identity. Goats deliberately receive neither store-provision access nor foliage browsing in this slice.
- **The Paddock Watch:** released Alpha 26 adds exactly one separate settlement working dog beside the existing two-goat herd. Its kennel and custody remain distinct from the original independent porter-scene dog, while one generic persisted guardian assignment binds the existing keeper, both custody relationships, the goat herd, and the pen worksite. The dog keeps ordinary cognition, needs, exposure, perception, and shared pathing; its own retreat, shelter, avoidance, or rest can outrank duty. It investigates only lawful uncertain alarm evidence, and any fox deterrence happens only after the fox actually perceives the dog—never through a hidden protection aura.
- **The Watch Returns:** released Alpha 27 adds no animal. The existing working dog's committed investigation now opens one bounded persisted task around a cognition-owned uncertain area and deterministic shared-locomotion probe. Reaching that probe completes investigation and sends the dog physically to the existing pen worksite; a keeper recall requires fresh reciprocal sight, cognition or welfare may suspend and resume work, and arrival waits for lawful handler acknowledgement. This remains one local lifecycle—not herding, separated-livestock recovery, a full schedule, mortality, attack, player command, or guaranteed defense.
- **The Missing Goat:** released Alpha 28 adds no species or actor. A current caused flee or retreat plus exact separation can split the two-goat herd; distance alone cannot. A separated goat may regroup only from current identified sight, with danger and welfare still taking priority. A keeper must lawfully notice the absence before an explicit last-known-area report can recruit the existing guardian's ordinary search, and search never proves a find. The same bodies may physically rejoin; current caretaker sight of every member inside the pen confirms closure. A retained known case can accept an authenticated coarse reunion transition without inventing remote sight. This closes one bounded starting-harbor Wave-D integration seam, not worldwide ecology.
- **What Remains:** released Alpha 29 adds no species, habitat, population, or actor. A current identified marsh-fox pursuit may injure or kill its exact marsh rabbit only after physical contact. Death retires that actor once, removes one population unit while any other represented units remain abstract reserve, and creates one stable finite physical carcass. Foxes and fish crows may detect, reach, and feed from that body through ordinary lawful perception and movement; foxes may guard it. Chart, Relief, and EVENTS reveal only current directly perceived aftermath. Broader mortality, population recovery, decomposition, body movement and harvesting, carcass scent and insects, worldwide ecology, and later Wave-E species remain outside this release.
- **Beyond the Harbor:** released Alpha 30 extends the catalog from nineteen to twenty-two records and places wild boar, elk, and gray wolf in one seed-stable remote temperate-upland/forest-edge source. Eligible individuals form reusable **SOUNDER**, **HERD**, and **PACK** groups through shared habitat, perception, attention, locomotion, materialization, and presentation owners. Wolves may exert role-driven pursuit pressure, but only exact contact with a solitary addressable marsh rabbit can enter the current mortality transaction; grouped elk, deer, and all other group members cannot be harmed. A boar or wolf may see, reach, claim, and consume from an existing finite body; a wolf may also guard its claim. Chart, Relief, quick inspection, and ABOUT remain knowledge-honest and shared across desktop and mobile. Voice patterns are foundation-only and inaudible; dog interaction is an intentional no-response; tactical pack combat, cougar, additional bear ecotypes, group mortality, ecological migration, worldwide ecology, and full Wave E remain absent.
- **High Country Shadows:** Alpha 31 appends cougar and brown bear at that exact remote source through the same habitat, population, perception, attention, actor-owned locomotion, top-K, presentation, and save abstractions. Both are distinct species; when habitat supports an individual, it remains solitary. A cougar alone adds a short direct-sight pursuit path into the existing exact-contact mortality gate for a currently identified solitary marsh rabbit; brown bear has no live-prey pursuit or harm. Either may lawfully reach, claim, guard, and consume an already-existing finite body. Neither adds group behavior, tracks, audible voice, species-specific dog-directed behavior, player/human harm, ecological migration, or worldwide distribution; a dog or porter that lawfully sees one may still react non-harmfully through the existing shared large-predator perception path.
- **Living commons:** nine seed-derived material families now grow visibly in suitable biomes. Desktop and touch gathering feed one exact shared pack, while the anywhere **KIT** turns those finds into six prepared components and eleven durable tools through mobile-safe **PACK / MAKE / MEND** tabs.
- **Footing and physical parcels:** stability is a live 0–100% physical-balance calculation, not a second stamina bar or accumulated drain. Actual speed, turning, grade, roughness, moisture, local water force, wind, load, footwear, fixtures, and BRACE determine the currently supported percentage; unchanged conditions hold one value and a safer bank recalculates it immediately. Hazardous entries can still deterministically stumble or fall, briefly alter the courier's color and silhouette, speak a tiny Atari-like callout, damage one exact cargo lot, and separate persistent parcels that drift, tumble, weather, save, reload, and remain recoverable.
- **Responsive river recovery:** desktop Shift now braces even when the document body or HUD has focus, with immediate BRACING copy and a color-independent planted marker in Chart and Relief. If stamina or stability still collapses in deep current, the courier becomes ADRIFT instead of being ejected to a bank: hold WASD/arrows or tap toward shallows to paddle, release movement to float and recover breath, then rise only after finding standable water with enough stamina. The current remains authoritative, full packs weaken a stroke, and separated physical parcels continue their own journey.
- **The unbroken world:** the courier can now walk beyond the original estuary without an edge action or transition. A bounded 120 × 120 presentation frame shifts in small increments while movement, routes, camera, weather, water, chart knowledge, Wayknots, and physical cargo retain their exact world positions. Ordinary play exposes one continuous E/N address rather than internal partitions. Existing 64 × 48 and 96 × 72 estuaries remain intact inside the continuous world.

Playtest fixes also make the HUD lighter, keep the Promises list genuinely scrollable even in shallow windows, stop live contract-card updates from swallowing clicks, state why stability is changing, and put explicit **PICK UP** / **DELIVER** instructions on each physical cargo promise.

Portrait, short-landscape, and desktop layouts now use the same pane-free field facts over the world: terrain and biome, WATER or GROUND and known depth, effort, current stability percentage and cause, continuous E/N coordinates, and measured FPS. **PROMISES + / PROMISES −** opens a mutually exclusive safe-area workspace on compact screens. Discovered wet surface in Chart and Relief carries moving streamlines and sparse foam; SOUND / SCAN adds analytical arrowheads, while exact unsounded depth remains private. In water at or above **120,000** depth, either empty stamina or empty current stability enters the same controllable ADRIFT state on keyboard and touch.

The initial Alpha 0.3 gameplay baseline was published at commit `4784315`. It includes the earlier perpetual/mobile/biome work, visible seed-derived material patches, renewable one-unit gathering, one exact shared pack limit, anywhere-accessible crafting and mending, persistent condition for crafted gear and the inherited Wayknots, the first porter-dog web, and the first bounded core-wildlife crossing. Phase 9 introduced the six fixed, reusable Wayknots at `eb12db0` and hardened them at `1bc136e`; those Reed mats, Tide anchors, and Wind knots can be bound or reclaimed with **F**, change authoritative movement and pointer-route costs, appear physically in both views, and form a small **Waychord** where unlike fields overlap.

The published **Phase 10: Tide Harps** preview lets one Reed mat, one Tide anchor, and one Wind knot tune a compact, non-collinear triangle. The game derives every valid triangle, selects an exact maximum knot-disjoint set, then breaks equal solutions by smaller total perimeter and canonical component IDs. The eight deterministic instrument names are **Glass-Ebb**, **Gullweather**, **Moon-Reed**, **Lantern Shoal**, **Mothcurrent**, **Brine Lullaby**, **Quiet Rigging**, and **Estuary Chime**.

## What is playable

Each seed now creates one continuous deterministic terrain world. The preserved original 96 × 72 tidal country contains its well-separated harbor network, 42 persistent generated human residents, five resource economies, changing weather, shortage-driven promises, civic projects, two distinct generated dogs, and the bounded original-harbor prefix of the living-species assemblage. Walking beyond that old extent requires no edge action or transition: terrain is prepared ahead, exact negative coordinates work, and the same chart, cargo, route, camera, field kit, and persistent objects continue. Alpha 0.1's existing 64 × 48 saves retain their authored world rather than being regenerated. Released Alpha 29 leaves that prefix at nineteen catalog records and adds only direct marsh-fox contact injury/death for an exact pursued marsh rabbit and one conserved finite body that a fox or fish crow can lawfully reach and feed from. Alpha 30 grows the catalog to twenty-two records and adds one deterministic remote upland source for wild boar, elk, and gray wolf; Alpha 31 preserves that exact source and extends the catalog to twenty-four with capacity-gated solitary cougar and brown-bear population records. Generated distant settlements and worldwide ecology, wider domestic ownership, companions, player/dog/human/broader-animal or group-member mortality, reproduction and population recovery, live decomposition, body drift/drag/harvest, scent and insects, and full actor-to-actor ecology remain later vertical slices; empty country is not padded with cloned harbors, people, animals, or free loot. The main loop is:

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
- Stable semantic identities for the original harbor country's 42 humans, including names composed from 226 given-name and 206 family-name entries, seed-derived appearance, occupation-shaped visible gear, coherent temperament pairs, skills, bounded background histories, weather-responsive condition, limited event-led emotion, bounded memories, and player knowledge. Those same humans now form bounded attention and suspicion from occluded visual contact or anonymous directional sound. Rain and nearby turbulent water mask hearing, wind changes sound reach and uncertainty, and a lost identified sighting becomes a saved last-known search area rather than live player tracking. Lawful visual contact reacquires the courier; otherwise the search gives up deterministically. Committed cognition survives save/reload. Selection and pane-free **ABOUT** remain gated by the same direct-detail field in Chart and Relief; **GREET** reveals only name, occupation, and home.
- One stable seed-generated domestic dog paired with one existing porter without making either the other's owner. Shared perception connects physical food scent, porter visual contact, rain/wind, bounded needs and condition, reachable movement, actor-owned provision custody, knowledge-honest ABOUT, five player choices, exact one-unit transfer and consumption, memory, promotion, and save/revisit continuity. This is one complete causal fixture, not a full animal population or companion system.
- One separate seed-stable settlement dog with its own kennel and custody, plus one versioned generic working-animal assignment tied to the existing keeper, goat custody, two-member herd, and pen worksite. Species-neutral perception participants admit the dog to the same lawful visual contacts and anonymous alarms as other actors; shared locomotion carries investigation toward perceived space or return toward duty. Ordinary dog cognition, needs, weather exposure, and actor-owned self-preservation remain authoritative. Chart, Relief, and quick inspection stay direct-detail gated; ABOUT exposes only current observable activity. The representative rabbit-alarm chain deters a pursuing fox only after the fox actually sees the dog; it adds no attack or guaranteed defense.
- One bounded core-wildlife assemblage with the same persistent individual and conserved aggregate roster; terrain-occluded sight; established weather-aware hearing; shared attention, alarm, flee, retreat, pursuit, activity, movement, grouping, custody, physical-resource, and direct-detail presentation owners; and a bounded 24-individual materialization ceiling. Released Alpha 29 adds one narrow harmful seam: a currently identified fox pursuit plus exact physical rabbit contact can create injury or death. Death retires that exact rabbit once, removes one population unit while remaining represented units stay reserve, and creates one stable finite body. Fox and fish-crow scavenging still requires current vision, physical reach, and one-unit consumption; a fox may guard its claim. No other actor mortality, social-group-member death, reproduction, population recovery, live decomposition, body drift/drag/harvest, carcass scent or insects, ecological migration, or worldwide habitat is claimed.
- One strict versioned species catalog covering exactly twenty-four current source records—the nineteen Alpha 29 records plus wild boar, elk, gray wolf, cougar, and brown bear. Rats, frogs, silversides, and fiddler crabs remain non-addressable aggregates. The five remote additions occupy one deterministic upland source and use shared representation, sensory, role, decision, locomotion, item-claim, mortality/body, materialization, and presentation contracts; boar, elk, and wolf retain their groups while cougar and brown bear remain solitary. Wolves and cougars can pressure eligible prey through role-driven pursuit, while harmful contact still admits only a currently identified solitary addressable rabbit; brown bears have no live-prey path. All four eligible upland scavengers can claim and consume finite existing bodies only after current sight and physical reach. Group-member harm, species-specific dog-directed behavior, audible upland calls, tactical pack combat, worldwide habitat, ecological migration/reproduction, and the rest of the food web remain absent; ordinary lawful large-predator perception remains shared. Shared invariants, deterministic properties, bounded fuzzing, conservation, representative scenarios, and performance witnesses replace a brittle species-by-species or N² test matrix.
- Released Alpha 22 keeps that exact seventeen-record catalog and validates its six activity profiles as shared abstractions. Chart, Relief, and ABOUT can project only gull behavior supported by that current lawful observation; they do not expose its hidden source or turn surface activity into a species identity, exact count, private target, capture, or consumption claim.
- Released Alpha 23 keeps the same seventeen-record catalog, habitat version 7, aggregate schema 4, and nearest-24 ceiling. One starting-harbor store owns a distinct settlement-cargo carrier with a stable fresh-produce lot and persistent door state. Existing weather-shaped scent can attract the existing rat aggregate; only a matching authenticated attraction event can commit one physical unit loss. An existing cat's lawfully visible presence can pressure that aggregate through the shared ecology boundary, and the player can ask the actual nearby keeper to act through an in-person report. Shared abstraction checks, a bounded signed-coordinate property sweep, physical-item and aggregate conservation, deterministic save/replay checks, and one representative store-rat-visible-cat composition exercise the seam; inherited shared fuzz and performance gates remain in regression instead of becoming exhaustive species or pair tests.
- Released Alpha 24 advances the catalog to eighteen records, habitat to version 8, settlement ecology to version 2, and the outer save to version 17. It appends one stable two-to-three-chicken flock, one yard anchor, and one settlement-custody relationship without changing the exact habitat-7 prefix. Shared direct perception, terrestrial movement, flock alarm, broad ecological roles, and the Storehouse Door's physical lot produce one representative visible feeding event while the secured and unseen branches remain knowledge-honest. Signed-coordinate invariants, migration/replay attacks, item conservation, bounded performance, and that representative composition validate the reusable architecture rather than every species or pair.
- Released Alpha 25 advances the catalog to nineteen records, habitat to version 9, settlement ecology to version 3, and the outer save to version 18. It preserves the complete Alpha 24 habitat, actors, flock, coop, custody, store, and food-use history before appending exactly two goats, one herd, one separated pen, and one second custody. Shared group, perception, locomotion, presentation, conservation, and deterministic claim-arbitration owners carry the new role; no per-species or N² interaction matrix is introduced.
- Released Alpha 26 keeps the nineteen-record catalog, habitat version 9, aggregate ecology version 4, and nearest-24 core-wildlife ceiling. Settlement ecology version 4 admits a kennel as the third typed domestic home, outer save 19 persists the separate dog roster and generic working-animal root, and sealed version 18 migrates once without rewriting the existing flock, herd, homes, actors, items, Promises, or world facts. Shared invariants and one representative runtime/emergence chain cover assignment, perception, pathing, recovery, and conditional deterrence rather than introducing species-by-species or N² tests.
- Released Alpha 27 advances outer save 20 and the working-animal records to version 2. One bounded exact-once task carries the existing guardian from lawful investigation through physical return and current handler acknowledgement; actor cognition and welfare may suspend and resume it without inventing evidence.
- Released Alpha 28 adds a version-1 domestic-recovery root and outer save 21 without changing the nineteen-record catalog, habitat 9, settlement ecology 4, aggregate ecology 4, existing actors, homes, or custodies. A keeper-observed split can become one knowledge-honest case; an explicit last-known-area report can recruit the existing guardian's ordinary search, and exact reunion plus current caretaker sight at the pen closes it. Whole social groups are atomic materialization candidates, so off-frame exact bodies retain authoritative topology but gain no local sensing or movement. The gate concentrates on shared invariants and representative emergence rather than bespoke tests for every species or pair.
- Released Alpha 29 advances outer save 22, core-ecology patch 3, aggregate record 5, gameplay contract 27, and Field Manual 39 without changing the roster or habitat. Sealed version-21 saves append empty authoritative mortality, reserve, and body ledgers exactly once. A committed fox-contact rabbit death, one-unit population consequence, stable body, claim, and finite consumption remain exact across reload; neither the event nor offscreen aftermath becomes automatic player knowledge.
- Alpha 31 advances outer save 24, habitat 11, gameplay contract 29, Field Manual 41, and the catalog to twenty-four records. Sealed version-23 saves preserve the exact habitat-10 source/population prefix and all mortality, body, claim, and consumption state before evaluating solitary cougar and brown-bear population records at that same source; only habitat-supported populations receive actors. Shared properties, conservation, signed-world determinism, bounded performance, and a representative predator/scavenger chain validate the abstraction rather than adding per-species or N² tests.
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

Seven derived biomes—Tide Channel, Brine Flat, Reed Marsh, Rain Meadow, Sun Meadow, Wind Ridge, and Glimmerfen—are projected from the seeded terrain and presented with restrained color-and-motif language in both Chart and Relief. Their bounded rainfall, heat, salinity, exposure, and magical-water signals remain derived rather than separately saved. Alpha 0.3 uses biome identity to choose natural material families and active weather to bound their regrowth; loose parcels read the local current, grade, impact, immersion, and magical-water flux through their material traits, while current rain/wind now affect the first dog's scent uncertainty, wetness, and cold condition. Accumulated courier exposure, carried-cargo rain/heat reactions, broader ecology, infrastructure reactions, and settlement consequences remain future work.

The cargo-environment evaluator is connected to physical loose parcels: material traits bound impact, wetness, contamination, decay, current/lift response, and magical-water pressure. Parcel identity and hash-chained event evidence persist inside outer save version 7; the recent detailed tail is compacted to a fixed budget while older evidence folds into its irreversible archive hash. All touched parcel worlds share one exact custody manifest, so leaving and returning neither deletes nor duplicates a parcel. A far parcel may leave the renderer's interest radius, but it is not rerolled and reappears as the same object when approached. Currents and terrain can now carry it continuously beyond the old map extent while preserving identity, condition, momentum, history, and Promise custody. A dropped active Promise remains recovery-focused and becomes a **RECOVER CARGO** objective that names its direction, distance, and motion; it cannot be delivered or renegotiated until its exact quantity returns to custody. The separate rock/ladder kernel still remains foundation-only: it derives coherent outcrops, crossing risk/cost, and a finite reusable ladder kit, but production movement does not yet supply those outcrops or ladders. Existing ridge terrain and terrain-driven falls are live; procedural ladder-gated formations, Pannier capacity, shroud/liner protection, crafted-Wayknot deployment, harbor lockers, survival exposure, and upgrades remain staged.

## Controls

The world canvas must have focus for directional travel keys. Shift-to-brace remains global during active play after the body or HUD receives focus; text fields and open dialogs keep keyboard ownership. Buttons and contract cards remain usable with pointer or keyboard navigation.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Travel; while ADRIFT, hold a direction to paddle and release to float |
| Hold Shift while moving | Brace: trade speed for stability and fragile-cargo protection |
| Hold BRACE (mobile) | Apply the same bracing rule during a charted touch route; release to stop |
| Pointer click / tap | Chart a destination; select a directly visible person, dog, individual wild animal, or rat/frog population sign; touch taps route to exact harbors/resources and recover visible parcels only on arrival within reach; travel continues wherever visible terrain permits without an edge action; fine-pointer parcel clicks never recover remotely |
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

Selecting the visible dog opens its non-pausing ABOUT surface and the five first-living-web choices. **ASK FOR HELP** and **SUGGEST SECURING BELONGINGS** are requests to the nearby porter, not direct inventory commands. **WAIT AND WATCH** stops the current automatic route for a short observation. **ROUTE AROUND THIS SPOT** requires an existing automatic route and computes a genuine path to the same destination that avoids the dog's observed location. **LEAVE** closes the interaction.

Selecting directly visible wildlife opens the same non-pausing ABOUT surface with only observation-supported identity, behavior, condition, appearance, life-stage, and visible-group detail. Wildlife offers **WAIT AND WATCH**, **ROUTE AROUND THIS SPOT**, and **LEAVE**; losing direct-detail sight immediately removes its rendering, label, hit target, and inspection rather than leaving a remote tracker.

Desktop world clicks route to resources but never harvest remotely: step onto the marked tile and press E. On touch, tapping a visible resource is the explicit gather command, so it routes to the exact tile and takes one unit on arrival. Either path rejects the whole action without changing the patch if the pack lacks room or only its final living unit remains. KIT can be opened between harbors; the tide, weather, residents, and route continue while PACK, MAKE, or MEND is visible.

There is no manual in-play pause. Open **Quiet Hour** for a saved causal recap, or open the title to save and step away; either safely halts world and player ticks until you continue.

Relief 3D travel is camera-relative: after orbiting with J/L, drag, or a two-finger twist, WASD/arrows continue to mean screen-left, screen-right, forward, and back. A pointer-transparent N compass stays north-up in Chart and turns with the Relief camera so world north remains legible without changing any simulation direction. In clear air, broad terrain reaches toward 52 tiles, remains fully legible through 34, and feathers across the final 18; exact people, parcels, resources, water detail, labels, actions, and pointer targets still use the shorter 10-tile field. Terrain that has just left broad sight keeps a sub-second visual impression before easing into dim durable Chart memory or uncharted darkness, and the same bounded scalar buffer follows a quick Chart/Relief switch. Exact detail disappears immediately; no perception memory is serialized.

Water never becomes an arbitrary invisible wall. Each wet tile derives one deterministic strength and turbulence profile from its physical bed, depth, tide, and weather. Discovered water shows that observable character through moving streamlines, sparse foam, real ambience, and occasional OHM or WHISSH text; SOUND / SCAN adds analytical arrowheads and records bathymetry. Surface character can warn that water is calm or rough, but it never provides the exact unsounded depth or effort value. Deeper water spends more stamina, while a Tide sail lowers that cost. Empty stamina on dry ground makes camp. In deep/current water at or above 120,000 depth, either stamina or the current stability percentage reaching zero enters ADRIFT: the live current always moves the courier, WASD/arrows or a bounded touch tap paddle across it, and releasing movement floats to regain stamina. A full pack weakens the stroke; direct upstream input can slow but never permanently reverse the physical current. Reaching water no deeper than 55,000 lets the courier recover in place until 100,000 stamina is available to stand. Cargo quantity remains physically accountable, and any separated parcels continue moving with current and grade until recovered. A connected clinic can prevent the incident while a ferry, Storm kite, Tide sail, or nearby Tide anchor provides bounded help without deleting the current.

Physical cargo promises and signed reports are different jobs. A promise moves actual supplies from its **PICK UP** harbor to its **DELIVER** harbor. A signed stock report uses one document slot but moves information only: it records a named harbor's current stock count and becomes useful after you carry it to the named recipient. Cargo choices live in Promises; reports live under the harbor inspector's separately labeled **Signed reports · information only** section. Every stable row spells out **[source]'s current [stock] count → [recipient]**; exact duplicate inputs collapse to one job without merging legitimately different sources or recipients.

## Saves

The game exposes one local autosave and enters it automatically on launch—there is no routine Continue gate. It saves periodically, when the page is hidden or closed, when the title is opened, when Quiet Hour begins, and immediately after a new world is confirmed. The simulation never advances while the game is closed. Replacing a healthy autosave is deliberately explicit: open the title through Quiet Hour, type `restartrestartrestart` exactly in **Begin again**, choose **Unlock restart**, enter a non-empty new Seed phrase, then choose **START**. Phone-keyboard blur and ordinary title refreshes preserve the in-progress unlock, while closing and reopening the title clears it. Mistyping, a blank seed, or a rapid second START changes nothing, and unlocking alone performs no storage write. If the stored session is unreadable or two storage copies claim the same version with different contents, neither is guessed into play: a persistent visible title warning requires a deliberate non-empty seed, and it remains until that higher-version replacement is durable. If either configured storage backend cannot be read, the title instead shows **LOCAL SAVE UNAVAILABLE**, disables Continue and both world-creation forms, performs no write, and asks for a reload when both stores are available.

Saves are local-first and remain on the player's device. IndexedDB is the primary store and localStorage carries a mirrored fallback. Healthy primary writes mirror the complete record, while compact version/fingerprint fences detect known rollback and same-version divergence. A launch adopts a record only after both configured stores can be read and compared; a partial or total read outage fails closed even when one survivor looks plausible. Reads compare save era, generation, timestamp, and world tick in that order; overlapping lifecycle/autosave requests coalesce behind an in-flight write, and a durable deletion marker prevents a stale primary copy from resurrecting after reconciliation. A stale tab or fork is not allowed to keep retrying over a different or newer durable record: saving stops, the warning persists across the field and all major dialogs, and the player is told to reload. Ordinary write failures after a safely loaded world still retry with bounded backoff and a fresh world snapshot, but the warning clears only when the latest requested snapshot in the current era and generation is durable.

Each deliberate replacement advances the backward-compatible two-part era/generation version before timestamp/tick comparison, including a safe carry into the next era if the generation counter is saturated. If both counters are already at JavaScript's largest safe integer, the game refuses to wrap them and visibly asks the player to clear Tideweft's stored site data before beginning again. Released Alpha 24 used outer session version 17, habitat version 8, settlement ecology version 2, and aggregate ecology version 4. A sealed version-16 Storehouse Door save migrates exactly once: every habitat-7 population and anchor, actor, group, aggregate unit, item, Promise, custody record, store and food-lot identity, closure, loss history, evidence record, player fact, and world fact remains exact before the deterministic two-to-three-chicken flock, yard anchor, and settlement relationship are appended. The staged domestic food-use transaction retains the exact actor, lot, cause event, tick, and ordinal, so save interruption and reload cannot duplicate a bird, replay a meal, or consume secured stock. Deterministic nearest-24 spatial materialization still ranks lawful candidates by local distance with stable-ID ties, preserving overflow actors in coarse state. Earlier supported versions retain their established migration chain without inventing observations or duplicating actors or cargo. Current payload fences reject half-completed actor or ecology transactions, mismatched ownership, stale chart, downgrade, rollback, duplication, or silent deletion before adoption. Older valid sessions keep their contents and original estuary intact; unreadable or structurally incompatible records are quarantined rather than silently loaded or overwritten. New worlds use perpetual `wander`; valid older `drift` and `weave` fields remain readable without regaining timed semantics. That release used outer session version 17.

Released Alpha 25 used outer session version 18, habitat version 9,
settlement ecology version 3, and aggregate ecology version 4. A sealed
version-17 Yard Flock save retains its complete habitat-8 prefix, chickens,
flock, relationship, home and coop identity, store state, items, Promises, and
world history byte-for-byte before exactly two goats, one herd, one separated
pen, and one second custody are appended. Plural custody rejects duplicate
actors, groups, relationships, homes, or structures, and deterministic shared
resource arbitration cannot give one physical item to two contenders.

Released Alpha 26 advances outer session to version 19 and
settlement ecology to version 4 while habitat analysis remains version 9 and
aggregate ecology remains version 4. A sealed version-18 Far Paddock envelope
retains its complete habitat, goats, herd, pen, chickens, flock, coop, store,
food history, actors, groups, aggregate units, items, Promises, evidence, and
world facts before appending one deterministic working dog, kennel custody,
dog-roster root, and generic guardian assignment. Current records authenticate
the assignment's staged activity and recover a pending transition exactly once;
reload, rollback, and representative regional travel cannot reroll or duplicate
the dog, relationship, work identity, activity ordinal, or position.

Released Alpha 27 advances outer session to version 20 and the
working-animal state and assignment records to version 2. A sealed version-19
Paddock Watch envelope retains every established actor, habitat, group, home,
custody, assignment, activity, item, Promise, evidence record, store fact, and
world fact before empty task-lifecycle fields are appended. Task, transition,
and latest-outcome records begin at version 1. A pending lifecycle transition
recovers exactly once; reload cannot reroll its lawful source evidence, search
probe, physical return, handler acknowledgement, or bounded result. Habitat 9,
settlement ecology 4, aggregate ecology 4, the nineteen-record species catalog,
and the existing dog roster do not change.

Released Alpha 28 advances outer session to version 21 and adds a
version-1 domestic-animal-recovery root. A sealed version-20 Watch Returns
envelope retains every existing species, actor, population, group, habitat,
home, custody, assignment, task, item, Promise, evidence record, store fact,
and world fact before an empty recovery root is appended. Current records bind
at most one case, one pending transaction, and one latest result to exact actor,
group, custody, home, incident, report, and monotonic ordinal identities. One
pending transaction recovers exactly once; reload cannot reroll the noticed
absence, last-known area, guardian recruitment, exact rejoin, or caretaker
confirmation. Habitat 9, settlement ecology 4, aggregate ecology 4, the
nineteen-record species catalog, and all established actors remain unchanged.

Released Alpha 29 advances outer session to version 22, the core-ecology patch
to version 3, and its aggregate record to version 5. A sealed version-21
Missing Goat envelope retains every prior actor, population, group, home,
relationship, task, recovery case, item, Promise, evidence record, and world
fact before empty mortality, population-reserve, and physical-body ledgers are
appended exactly once. A valid fox-contact rabbit death seals the exact retired
actor, one removed population unit, named cause, stable carcass identity,
finite remaining resource, claim, and consumption ordinals. Reload cannot
reroll the outcome, resurrect the actor, create another body, restore consumed
resource, or turn an unseen incident into player knowledge.

Released Alpha 30 advances outer session to version 23 and habitat
analysis to version 10 while retaining core-ecology patch 3 and aggregate
record 5. A sealed version-22 body-bearing world is authenticated and adopted
once: its entire habitat-version-9 record and every prior identity, physical
item, Promise, relationship, mortality event, reserve, body, claim, and
consumption ordinal remain exact before one remote source and the three new
populations/groups are appended. Reload cannot reroll the source, renumber an
established actor, duplicate a group, or rewrite Alpha 29 aftermath.

Released Alpha 22 deliberately retains outer session 15, habitat 7,
and aggregate schema 4. Its activity-profile convergence is derived from the
already-authenticated actors, anchors, observations, and physical items, so it
requires no migration and cannot reroll or duplicate them.

Released Alpha 23 advances outer session to version 16 while
retaining habitat 7 and aggregate schema 4. A sealed version-15 Tidal
Convergence save derives the same starting-harbor store, keeper and rat binding,
physical fresh-produce lot, open door, and empty bounded loss history exactly
once. Every earlier actor, aggregate unit, item, Promise, custody record,
evidence record, and world fact stays exact, and the new lot neither adds to nor
subtracts from the settlement's separate abstract food stock. Closure,
remaining physical units, and completed loss ordinals persist; reload cannot
reopen, reroll, duplicate, or replay them.

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

The `0.3.3-alpha.12` gameplay release carries gameplay contract 20 and tutorial 22. It keeps Alpha 11's bounded human/porter/dog web and adds the first local core-wildlife crossing described above. The outer game save is version 8; supported versions 1 through 7 migrate without inventing wildlife history or duplicating food. The nested simulation remains format 4 and `tideweft-sim/6`. The complete local gate passed 168 Vitest files / 1,574 tests, the production and nested-path web checks, and packaged Electron smoke. Exact release commit `4784315a77d815533a9370ece3d7daeb1cc8d5bc` passed CI run `33952159605` and Pages run `33952159606`, and the tested build was verified live. [CHANGELOG.md](./CHANGELOG.md), title and Quiet Hour Patch Notes, and the field manual's **What's New** page remain synchronized from one release ledger. Additional animals and worldwide habitat populations, ownership, naming, training, affection, companions, group ecology, environmental evidence, harmful contact, carcasses, physical human pursuit, and the broader biodiversity web remain planned rather than presented as complete.

Source version `0.3.3-alpha.13` is the contract closeout for that same playable slice: its five current living-actor types share one strict versioned species-and-senses catalog and a fail-closed release-evidence gate. Gameplay contract 20 and outer save 8 remain unchanged; this build adds no new species, encounter, or migration.

Source version `0.3.3-alpha.14` is the bounded Wave-A ecology closeout. It replaces fixed local membership with a habitat-derived assemblage that allows absence, separates aggregate capacity/pressure/trend from capped representative actors, gives group-sized deer and gull representative populations persistent group state, advances coarse physiology without omniscient offscreen behavior, records only nonlethal cargo-neutral player-absent group aftermath, and proves identity-preserving full/coarse/full return plus standable shallow-water movement. It adds no species and does not claim worldwide populations, reproduction, ecological migration, carcasses, or a general evidence/circadian/scent web. Outer save 9 makes the new habitat/group state authoritative; exact outer-version-8 ecology migrates once without rerolling its existing actors or cargo.

Source version `0.3.3-alpha.15` adds the bounded Settlement Shadows extension. Its seven-record catalog adds a conserved brown-rat population area and persistent free-ranging domestic cats, with directly observed rat signs, cat pawprints, lawful local pressure, and narrow loose-food scent response. Outer save 10 adopts that aggregate-capable ecology without claiming rat actors, attacks, mortality, complete tracking or scent, ownership, or worldwide ecology.

Source version `0.3.3-alpha.16` is the bounded Marsh-edge Pursuit release. Its nine-record catalog adds habitat-derived marsh rabbits and marsh foxes, finite nonlethal pursuit, shared locomotion, direct movement signs, and visible-event thump/yip cues. Outer save 11 adopts the deterministic extension from version 10 without rerolling established actors or cargo. This release does not claim attacks, injury, death, carcasses, live-prey consumption, complete tracking or scent, worldwide populations, the full bestiary, or an exhaustive species-pair matrix. Exact feature commit `f4aff83fa3bd9283ef6d35df7a87d2fd87dee934` passed CI run `33988451548` and Pages run `33988451531`, and the deployed assets match the tested committed build byte-for-byte.

Source version `0.3.3-alpha.17` is the Rain Chorus / Shadow Overhead release. Habitat version 4 preserves every version-3 population as its exact prefix, then adds bounded persistent fish crows, one solitary northern harrier, and a conserved southern leopard-frog population area where the local habitat supports them. The shared runtime policy now composes individual identity, flocking, aggregate response, perception, locomotion, activity, evidence, and presentation without creating fake frog actors or species-pair scripts. Released interactions include authenticated crow perching, low harrier quartering, direct crow alarm and mobbing pressure, finite nonlethal pursuit, physical crow provision custody, and a rain-responsive directional frog chorus. Outer save 12 adopts this deterministic extension from version 11 exactly once. Mortality, attacks, carcasses, live-prey consumption, complete scent/tracking, full circadian life, worldwide populations, the full bestiary, and an exhaustive species-pair matrix remain outside this bounded slice. Exact feature commit `70a8d913ab3f01bec7453299014b32da592447e4` passed CI run `34009707954` and Pages run `34009707969`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

Source version `0.3.3-alpha.18 — One Marsh, Many Eyes` is the bounded starting-harbor Wave-B closure release. Aggregate visual sources now retain canonical living-species identity until one shared capability/trophic policy derives a lawful response: a perceived marsh fox can pressure the rat and frog population areas, while neutral rabbit co-presence does nothing. All seven Wave-B species explicitly cover every broad ecological target as available or intentionally neutral, selected gull/crow ABOUT uses the same visible flock estimate as the world, and unidentified chorus captions remain anonymous while qualifying direction against the same uncertain heard-bearing contact used by stereo. A representation-aware readiness report authenticates individual, flock, and aggregate continuity while explicitly excluding worldwide ecology, migration, promotion, full species readiness, and completion of the broader biodiversity work. Outer save 12 and habitat version 4 remain unchanged. Exact feature commit `673fc373b2b6de81f299f4c176681c969ace6915` passed CI run `34027046007` and Pages run `34027046121`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

Source version `0.3.3-alpha.19 — The Tide Table` is the first bounded Wave-C tidal release near the stable starting harbor. Habitat version 5 preserves the complete version-4 population prefix, then may add one conserved Atlantic-silverside school aggregate, one conserved Atlantic-marsh-fiddler-crab area aggregate, and at most one persistent snowy egret. Stable saved elevations plus the live tide determine depth, usable anchors, aggregate activity, bounded redistribution, and safe wading edges without rerolling population identity. The egret can relocate toward observed aquatic activity only after shared vision produces a current anonymous aquatic-activity observation; its shared-policy interaction with fish and crab aggregates is pressure and conserved avoidance only. Chart, Relief, and close ABOUT expose direct surface, burrow, scrape, or individual evidence without fake fish/crab actors or a hidden census. Outer save 13 adopts the deterministic habitat-version-5 extension from sealed version 12 exactly once. This release does not claim Wave C complete, worldwide ecology, ecological cross-region migration, capture, fishing, injury, mortality, carcasses, or live-prey consumption. Exact feature commit `7ef802398f4b5ea6d4e6503d436fc7a858ccbe30` passed CI run `34045602263` and Pages run `34045602240`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

Source version `0.3.3-alpha.20 — Between Water and Sky` is the released second
bounded Wave-C unit. Habitat version 6 preserves the entire
version-5 population and tidal-anchor record as its exact prefix, then may
append at most one stable persistent American black duck with two saved
dabbling-water destinations and one dry refuge. Its bounded activity can
float, scan, dabble, rest, surface-swim, or relocate by air. Its catalog permits
only air plus shallow- and deep-water movement, and it never requests a
land/walk route. A current anonymous aquatic-activity observation may guide it
only after the shared occluded vision
boundary supplies that fact; movement then selects `air` or `surface-water`,
with surface travel delegated to the ordinary locomotion solver. Chart, Relief,
mouse, touch, reduced motion, and close ABOUT project the same one-individual,
knowledge-honest state. Tide and water select habitat, activity, and travel
medium without directly changing the duck's stress or condition. Outer session
14 adopts sealed session 13 exactly once,
and internal aggregate schema 4 gives completed tide-edge opportunities a
durable anti-reroll marker outside the bounded event tail. This release does
not add flocks, nesting, breeding, migration, the otter-like predator, capture,
consumption, injury, mortality, carcasses, worldwide ecology, complete Wave C,
or Directive 04_1 completion. Exact feature commit
`c11e4de0563876839158fb13a69ddfb4dadd6dbe` passed feature CI run
`34061008077`, main CI run `34061513043`, and Pages run `34061512986`; the five
inspected public assets match the tested local build byte-for-byte.

Source version `0.3.3-alpha.21 — The Living Channel` is the **LIVE_VERIFIED** final bounded
starting-harbor Wave-C role slice, but it does not claim Wave-C or Directive
04_1 completion. Habitat version 7 retains the entire habitat-version-6
population and anchor record as an exact prefix, then may append one stable
North American river otter only when the existing silverside and fiddler-crab
populations, usable foraging water, and a distinct dry shore haulout all
support it. The same actor uses shared amphibious pathing between shore and
surface water. Current anonymous aquatic activity can influence it only
through ordinary terrain-occluded vision; broad role policy supplies
nonlethal fish/crab pressure; and the generic physical-item claim owner
resolves a representative loose-food contest without duplication.

The release also replaces source-order truncation with deterministic spatial
top-K materialization: every lawful intersecting individual is ranked by local
distance, stable actor ID breaks ties, at most 24 enter full detail, and all
others retain identity and coarse state. Chart, Relief, quick inspection, and
ABOUT share the same otter projection, touch target, and reduced-motion
boundary. Outer save 15 adopts authenticated version 14 exactly once without
rewriting its v6 ecology. The release deliberately adds no live-prey capture
or consumption, harmful attacks, injury, mortality, carcasses, fishing,
new otter call or persistent track evidence, reproduction, migration,
worldwide ecology, complete Wave C, or Directive completion. Its confidence
comes from shared invariants, deterministic properties, bounded fuzzing,
conservation, and representative interaction witnesses—not a bespoke test for
every species or every pair. Exact feature commit
`5514c24619fc6d41b34cbdd6315f4ae8d936f2dc` passed CI run `34067577935` and
Pages run `34067577893`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested committed build byte-for-byte.

Source version `0.3.3-alpha.22 — Tidal Convergence` is the **LIVE_VERIFIED**
bounded starting-harbor Wave-C integration release. It adds no species and closes
only the bounded starting-harbor Wave-C integration seam by placing fish-crow
perching, northern-harrier quartering, snowy-egret wading, American-black-duck
dabbling, North American river otter shore-water foraging, and gull surface
opportunism behind six reusable activity archetypes and matching profiles.
Current anonymous aquatic surface observations are selected by the generic
combination of actor addressability, surface-opportunity capability, and tidal-
activity capability, then still require ordinary terrain-occluded line of
sight to an occupied, active, depth-usable aggregate anchor. The gull may fly
toward and circle that observed area or return by air to its authenticated
habitat anchor to rest; it never receives water locomotion, an aquatic-foraging
role, an aggregate identity, an exact count, or a private prey target. Immediate
lawful threat, alarm, pursuit, and physical-food intents retain priority over
all six neutral profiles. Chart, Relief, quick inspection, and ABOUT project
only the activity supported by that current observation, never its hidden
source.

The release retains outer save 15, habitat 7, aggregate schema 4, the
seventeen-record catalog, conserved aggregate units, exact physical-item
custody, and the nearest-24 materialization ceiling. Its confidence comes from
abstraction and property checks, conservation, bounded fuzzing, performance
budgets, and representative scenarios—not species-by-species or N² animal-pair
coverage. Exact feature commit
`4dacd99e95a018314d65a72183b82cba8583774f` passed CI run `34074045801` and
Pages run `34074045818`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested committed build byte-for-byte. The release does not complete
worldwide Wave C or Directive 04_1. It adds no mortality,
carcasses, harmful attacks, live-prey capture or consumption, fishing, nesting,
reproduction, ecological cross-region migration, full circadian life, or
general scent/sound/evidence system.

Source version `0.3.3-alpha.23 — The Storehouse Door` is **LIVE_VERIFIED**. It
adds no species. One bounded
starting-harbor store owns one stable physical fresh-produce lot through the
settlement-cargo carrier contract, separate from the settlement's abstract food
economy. While the door is open, existing wind, rain, distance, and packaging
rules shape the scent reaching the existing brown-rat aggregate. Only a matching
authenticated attraction event can commit at most one physical produce-unit
loss; the rat population remains conserved. An existing cat's lawfully visible
presence can pressure that aggregate through shared perception policy, without
giving the cat hidden rat knowledge or a new investigation behavior.

In this slice, the actual nearby keeper secures the door only after the player's
in-person report. The reusable knowledge boundary also authenticates a keeper's
direct observation for later autonomous behavior, but this release does not
generate that path. The door state persists, contains later scent, and
Chart, Relief, the nearby contextual action, and EVENTS disclose only what the player
can currently observe—returning later never reveals an unseen loss. Outer save
16 adopts a sealed version-15 world exactly once while habitat 7 and aggregate
4 stay unchanged. Confidence comes from shared abstractions and properties,
physical-item and aggregate conservation, deterministic replay/migration, a
bounded signed-coordinate property sweep, and one representative store-rat-visible-cat
composition. Existing shared fuzz and performance limits remain in regression
rather than becoming exhaustive species or pair tests. This is not worldwide
settlement ecology, livestock, schedules, rumors, mortality, carcasses,
live-prey consumption, the full bestiary, or completion of Directive 04_1.

Source version `0.3.3-alpha.24 — The Yard Flock` is the **LIVE_VERIFIED** first
bounded Wave-D livestock release. Habitat version 8 preserves the entire version-7 tidal-web record as
its exact prefix, then adds one deterministic yard anchor and a stable flock of
two or three individually identified domestic chickens. Settlement ecology
version 2 binds those birds to one existing settlement, keeper, home area, and
flock without making custody a second cognition or inventory owner.

The chickens use the same direct observation, attention, broad ecological
roles, terrestrial movement, group alarm, materialization, and knowledge-honest
presentation contracts as the earlier web. A hungry member can investigate the
existing open-store lot, physically reach its structural access area, and
consume exactly one authenticated unit through a staged transaction. A secured
store exposes no food belief or claim. Chart, Relief, quick inspection, ABOUT,
and EVENTS disclose the bird and consequence only through current direct
perception. Outer save 17 adopts sealed version 16 once without changing the
prior habitat prefix, store identity, closure, lot quantity, keeper knowledge,
loss history, actors, groups, aggregate units, items, Promises, or world facts.

Confidence is deliberately abstraction-led: shared invariants, deterministic
signed-coordinate properties, migration/replay attacks, item conservation,
bounded performance, and one representative visible-yard composition replace
species-by-species and N² pair coverage. The release does not add chicken
sound or tracks, attacks, injury, mortality, carcasses, live-prey consumption,
eggs, nesting, reproduction, herding, guardian behavior, full schedules,
autonomous home return, cross-region migration, worldwide livestock, full Wave
D, or completion of Directive 04_1. Exact release commit
`4067ac4439bb6f624ed88f69eb09cc591b246741` passed CI run `34093027893` and
Pages run `34093027917`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested local production build byte-for-byte.

Source version `0.3.3-alpha.25 — The Far Paddock` is the **LIVE_VERIFIED**
bounded Wave-D release. Habitat version 9 preserves the complete version-8 record as
an exact prefix, then derives one pen separated from the storehouse yard and
prior animal placements. Exactly two persistent domestic goats form one stable
HERD and receive a second settlement custody without changing the existing
chickens, flock, coop, keeper, store, or food history.

The goats reuse the shared actor, perception, attention, broad-role, group,
terrestrial-locomotion, bounded-materialization, Chart/Relief, and pane-free
ABOUT owners. Settlement ecology version 3 generalizes plural custody and typed
coop/pen homes; one actor or group cannot belong to two homes. The shared
physical-resource boundary now resolves lawful contenders by reach, current
need, and stable identity rather than iteration order. Goats are intentionally
ineligible for store provisions, and living-foliage browsing remains absent.

Outer save 18 adopts sealed version 17 exactly once while keeping every older
population, actor, group, aggregate unit, item, Promise, evidence record, and
world fact exact. Shared invariants, signed-coordinate properties, migration
and replay attacks, physical conservation, bounded performance, and a few
representative runtime witnesses validate the reusable architecture rather
than testing every species or every animal pair. Calls, tracks, attacks,
injury, mortality, carcasses, reproduction, milk, wool, full schedules,
herding, guardian behavior, cross-region migration, worldwide livestock, full
Wave D, and Directive 04_1 completion remain outside this release. Exact release
commit `29af7793346c0c3977a5ca727b79feb3a50b83bb` passed CI run `34108539228`
and Pages run `34108539255`; the deployed HTML, icon, manifest, JavaScript, and
CSS match the tested local production build byte-for-byte.

Release `0.3.3-alpha.26 — The Paddock Watch` is **LIVE_VERIFIED** at exact
commit `e3aae174d962ec609b9463e40320227237c9fa1f`. CI run `34143286763` and
Pages run `34143286720` succeeded, and five cache-bypassed live artifacts match
the tested local production build byte-for-byte. It keeps
the nineteen-record species catalog and habitat version 9, then adds exactly
one settlement working dog as a separate actor from the original independent
porter-scene dog. The settlement owns a third domestic custody and typed
`kennel`; a versioned generic working-animal root binds that dog, the existing
keeper as handler, the protected goat custody and herd, and the pen worksite.

The dog remains governed by ordinary dog cognition, needs, exposure, condition,
and actor-owned intent. A bounded species-neutral perception-participant seam
supplies lawful contacts, shared locomotion moves only toward a cognition-owned
uncertain alarm area or back toward duty, and assignment work yields to retreat,
shelter, avoidance, rest, or other self-preservation. Chart, Relief, and quick
inspection remain direct-detail gated, while ABOUT projects only authenticated
current activity; none reveals the alarm emitter, hidden predator, protected
target, or assignment graph.

Outer save 19 adopts sealed version 18 exactly once. Settlement ecology version
4 adds kennel vocabulary and the third custody; the separate dog roster and
generic assignment/activity roots persist and recover an accepted pending work
transition exactly once. The representative emergence witness is conditional:
an anonymous rabbit alarm may recruit investigation, and a pursuing fox changes
course only after lawfully seeing the dog. This is incidental deterrence, not an
attack, aura, or guarantee of livestock safety. There is no herding, injury,
death, carcass, new sound, companion training, player command, autonomous
kennel schedule, worldwide dog population, cross-region animal ecology, full
Wave D, or Directive 04_1 completion. Validation remains shared-invariant and
representative-chain driven rather than species-by-species or N².

Release `0.3.3-alpha.27 — The Watch Returns` is **LIVE_VERIFIED**. It adds
no species, actor, population, habitat, home, or custody relationship. One
additive task owner gives the existing working dog a bounded investigation,
physical return, and handler-acknowledgement lifecycle over the already-shared
perception, cognition, welfare, and locomotion seams. Handler recall requires
fresh reciprocal identified sight; work may suspend for actor-owned or welfare
pressure and resume without inventing evidence. Outer save 20 adopts sealed
version 19 exactly once and retains only the latest closed task outcome. This
release does not add herding, separated-livestock search or rescue, full
schedules, autonomous kennel life, attack, injury, mortality, carcasses,
player commands, worldwide ecology, or guaranteed defense. Validation targets
shared invariants and representative emergence, not a bespoke species/pair
matrix. Exact gameplay commit
`f2c55413c64a8e6b8e3cc1fab06e50252df2399f` and public attestation commit
`6a5bc4352edb39b47ee2216ca01a1506f01419cb` passed final CI
`34160098140` and Pages `34160098112`; a cache-bypassed comparison matched all
five deployed files to the tested build byte-for-byte.

Release `0.3.3-alpha.28 — The Missing Goat` is **LIVE_VERIFIED**. It adds no
species, actor, population, habitat, home, custody, item, or Promise. A herd split now requires
a current caused flee or retreat plus exact member distance; distance alone
cannot split it. Regroup is available only from current identified sight and
still yields to danger and physiology. The keeper must lawfully observe an
absence before one explicit last-known-area report can recruit the existing
working dog's ordinary search; search does not reveal or guarantee the goat.
The same exact bodies may physically rejoin, and current caretaker sight of all
members inside the pen confirms closure. A previously known case can retain an
authenticated coarse reunion transition without manufacturing keeper sight.

Social groups are indivisible materialization-cap candidates: every member is
admitted together or the group remains wholly coarse, where exact bodies retain
authoritative topology but gain no local sensing or locomotion. Internal
`regroup` intent projects as neutral movement rather than exposing system
vocabulary. Outer save 21 adopts version 20 by appending an empty version-1
domestic-recovery root, and the release advances gameplay contract 26 and
field manual 38. It closes only this bounded starting-harbor Wave-D seam. It
does not add herding, full schedules or home routines, guaranteed recovery, a
remote marker or player search command, attacks, injury, mortality, carcasses,
new calls or tracks, or full cross-region ecology. Validation continues to use
shared invariants and representative emergence rather than per-species or N²
interaction tests.

Exact gameplay/release/main commit
`60c9bc34ac871425e5319c8369e715751b5d1c44` passed feature CI
`34174876320`, main CI `34175693435`, and Pages `34175693447`. The local gate
passed TypeScript, public-boundary and player-facing-sync checks, 220 test files
and 2,111 checks, a five-asset 3,284,606-byte served web build, inspection of a
10-entry 3,476,214-byte runtime-only Electron ASAR, desktop/mobile/title smoke,
and clean invariant, save, and visual audits. The first cache-bypassed live
comparison matched all five deployed files to the tested build byte-for-byte.

Release `0.3.3-alpha.29 — What Remains` is **LIVE_VERIFIED**. It adds no species, habitat,
population, home, or actor. A marsh fox already pursuing a currently identified
marsh rabbit may injure or kill only that rabbit and only after exact physical
contact. Death retires the actor once, removes exactly one population unit while
other represented units remain abstract reserve, and creates one stable finite
physical carcass. Foxes and fish crows can discover that body only through
ordinary current vision, must physically reach it to feed, consume one real
unit at a time, and a fox may guard its claim. Chart, Relief, and EVENTS expose
only current lawfully perceived bodies and direct events—no hidden attacker,
cause, claimant, resource count, or retrospective offscreen narration.

The release advances outer save 22, core-ecology patch 3, aggregate record 5,
gameplay contract 27, and Field Manual 39. It does not add player, dog, human,
other-animal, or group-member mortality; reproduction, recruitment, population
recovery; live-time decomposition; body drift, dragging, harvesting, scent, or
insects; worldwide ecology; or later Wave-E species. Verification is built
around shared invariants and representative emergence rather than exhaustive
species-by-species or N² interaction tests.

Exact gameplay commit `a0f7b571cf6068c41397ad0b8767347b04b24ac1`
passed feature CI `34187159628`, main CI `34187706800`, and Pages
`34187706784`. The complete local gate passed TypeScript, public-boundary and
player-facing-sync checks, 224 test files and 2,143 checks, a five-asset
3,323,332-byte served web build, inspection of a 10-entry 3,514,940-byte
runtime-only Electron ASAR, desktop/mobile/title smoke, and clean invariant,
save, release-surface, and visual audits. The first cache-bypassed five-file
live comparison matched the tested production build exactly.

### Released — Alpha 31 High Country Shadows

`0.3.3-alpha.31 — High Country Shadows` extends the same bounded Wave-E source
from twenty-two to twenty-four catalog records. Habitat version 11 preserves
the complete version-10 source and population sequence exactly, then evaluates
one solitary cougar population record and one solitary brown-bear population
record at that same seed-stable remote temperate-upland/forest-edge source.
Only habitat-supported populations receive persistent actors. They use the
existing habitat, population, identity, direct-perception, attention,
actor-owned locomotion, nearest-24 materialization, Chart/Relief, quick
inspection, ABOUT, and persistence owners; there is no species-local controller.

A cougar can enter one short direct-sight pursuit. Only exact physical contact
with its currently identified solitary addressable marsh rabbit may reach the
existing injury/mortality transaction. The brown bear has no live-prey pursuit
or harmful contact in this unit. Either new animal can lawfully see, physically
reach, claim, guard, and consume an already-existing finite body through the
same conserved aftermath rules. Neither can harm the player, dogs, humans,
social-group members, or other unsupported prey.

Outer save version 24 authenticates and adopts a sealed version-23 Beyond the
Harbor world exactly once. Existing populations, groups, actors, mortality,
bodies, claims, meals, and world facts remain exact; the selected remote source
does not reroll. The release is checked through shared roster and habitat
properties, conservation, signed-region determinism, bounded performance, and
a representative predator/scavenger chain instead of bespoke tests for every
species or an N² pair matrix. Cougar and brown bear add no group, persistent
track, audible voice, species-specific dog-directed behavior, body creation,
reproduction, ecological migration, or worldwide distribution. A dog or porter
that lawfully sees either animal can still respond non-harmfully through the
existing shared large-predator perception path.

### Released — Alpha 30 Beyond the Harbor

`0.3.3-alpha.30 — Beyond the Harbor` is **LIVE_VERIFIED**. It adds exactly three catalog
records—wild boar, elk, and gray wolf—and derives their persistent populations
from one seed-stable temperate-upland/forest-edge source beyond the original
harbor concentration. Boar use `SOUNDER`, elk reuse `HERD`, and wolves use
`PACK`; the same group, perception, actor-owned locomotion, top-K
materialization, Chart, Relief, quick-inspection, and ABOUT owners apply.

Gray wolves may begin and maintain role-driven pursuit pressure only from
lawful current perception. Pursuit eligibility is intentionally broader than
harm: only a solitary addressable marsh rabbit can enter the existing exact-
contact mortality/body transaction. Grouped elk, grouped deer, and every other
group member remain ineligible for injury and death. Wild boars and gray wolves
can scavenge an existing body only after seeing it, physically reaching it, and
winning the same finite conserved claim; wolves may also guard their claim, and
neither species creates or duplicates body resources.

Outer save 23 adopts a sealed outer-v22 world exactly once. Habitat 10 retains
the entire habitat-v9 record as an exact prefix before appending the regional
source and new populations/groups; the earlier mortality/body ledger remains
exact. The gameplay contract is 28, the Field Manual is 40, and the catalog
contains 22 records. Validation uses shared generated invariants, signed-region
properties, conservation checks, bounded performance, and representative
emergent scenarios rather than bespoke tests for every species or pair.

The released slice has no dog interaction with these species; that row is an
intentional no-response. Authored boar, elk, and wolf voice patterns are
foundation-only and are not emitted or audible. Tactical pack combat,
group-member mortality, cougar, additional bear ecotypes, ecological migration,
worldwide ecology, and full Wave E remain outside this release.

Exact gameplay commit `56dc4812c7c41b6227bae1b0273701b51076f34a`
passed feature CI `34215120610` and Pages `34216318509`. Verification-only
descendant `65e2ba59929a296139e578adbd03621f91d93fc2` raises the CI and Pages
job ceilings plus one slow integration-test allowance without changing
production code or artifacts; it passed main CI `34221064966` and Pages
`34221064916`. The
complete local gate passed TypeScript, public-boundary and
player-facing-sync checks, 227 test files and 2,177 checks, a five-asset
3,365,373-byte served web build, inspection of a 10-entry 3,556,981-byte
runtime-only Electron ASAR, desktop/mobile/title smoke, and clean invariant,
save, release-surface, and visual audits. The first cache-bypassed five-file
live comparison matched the tested production build exactly.

Development artifacts are not code-signed or notarized. Public desktop distribution still requires signing for each target platform.

## GitHub Pages

[The current alpha is live](https://19koda19.github.io/tideweft/). [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) type-checks, tests, builds, uploads `dist/`, and deploys on pushes to `main` or manual dispatch. Vite uses `base: './'`; the HTML, web manifest, SVG icon, and bundled assets therefore work below an arbitrary repository subpath.

The current Alpha 31 feature is **LIVE_VERIFIED** at exact gameplay commit
`d124f71c1c8656db68a764d048c9a1e5d14163a7`. Feature CI `34241221388`,
main CI `34243147747`, and Pages `34243147753` succeeded for that exact
commit. The latest cache-bypassed fetch matched all five live assets to the
tested production build exactly:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `index.html` | 4,168 | `31b8e9060480488bbeed6df670b7beaee8348f52b4daaaec39e23d041bd0f129` |
| `icon.svg` | 895 | `b0812d52ce2507a359864395450c73181038d2ddc3abd20db2fb768aec8a8875` |
| `manifest.webmanifest` | 486 | `a3dde946b385ac28502e38a50b749381b3a35caa4062f7af055374a97b89e132` |
| `assets/index-BOoi-0xo.js` | 3,282,564 | `e099aeec9b673a8e273fca0902b8c2bde18540fa3b818077ba43f89a0976da50` |
| `assets/index-BnNSHuv9.css` | 106,761 | `05ac88340ddce1bdde27d73638642979cdbaca4bf460d621ddcf52c94c114706` |

For future releases:

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

See the canonical [changelog](./CHANGELOG.md), [game design](./docs/GAME_DESIGN.md), [research](./docs/RESEARCH.md), and [architecture](./docs/ARCHITECTURE.md).
