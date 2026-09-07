# TIDEWEFT Changelog

<!-- Generated from src/content/patchNotes.json. Run node scripts/render-patch-notes.cjs; do not edit release prose here. -->

Newest release first. Patch notes are bundled into the game and remain available offline.

## 0.3.3-alpha.25 — 2026-09-07

Build: `0.3.3-alpha.25` · Gameplay contract: 23 · Tutorial: 35

The Far Paddock adds one persistent two-goat herd at a habitat-derived pen, while plural custody, typed homes, and deterministic physical-resource arbitration strengthen the shared domestic-animal substrate.

### Gameplay

- The starting harbor now supports exactly two individually identified domestic goats in one stable herd. Their habitat-derived pen is deliberately separated from the storehouse yard and prior animal placements instead of clustering every new animal around the player.
- Goats compose the existing wildlife actor, direct perception, attention, terrestrial locomotion, broad ecological-role, and group-alarm owners. The herd has persistent membership and identity without a goat-only behavior tree or species-pair script.
- Settlement ecology now supports several canonical domestic custody relationships and typed coop or pen homes. Chickens retain their existing keeper, flock, coop, and physical store-food behavior; goats receive their own herd, pen, and custody while browse and store-provision use remain unavailable.

### Fixes

- Habitat version 9 preserves the complete version-8 population, tidal-anchor, and chicken-yard record as an exact prefix, then appends only the separated goat pen and its two-member herd. Bounded deterministic site selection works at ordinary, negative, and extreme signed coordinates.
- Physical-resource contention now validates each candidate against its real source and resolves each shared resource by physical reach, current need, and stable actor identity. Source iteration order can no longer decide which lawful contender receives custody.
- Plural domestic custody rejects duplicate custody, relationship, home, structure, group, or member authority. One actor or social group cannot silently belong to two domestic homes.

### Balancing

- A CHALLENGING HARD remains the only ruleset. The goats add another living source of attention, alarm, and route context; they grant no player statistic, free food, Promise reward, milk, wool, or combat resource.
- The new herd is deliberately bounded to two animals and one local pen. Its members may use land and standable shallow water, but receive no cross-region migration, autonomous home-return schedule, foliage browsing, herding, guardian, injury, or mortality behavior in this slice.
- Validation remains architecture-led: shared invariants, deterministic signed-coordinate properties, exact migration, group and item conservation, fair arbitration, bounded performance, and representative runtime composition replace a bespoke test suite for every animal or an N-squared pair matrix.

### Interface

- Chart 2D and Relief 3D render the same directly perceived goats with a distinct horned, bearded livestock form. Selection, quick inspection, and pane-free ABOUT disclose only visible identity, approximate size, appearance, condition, and current behavior.
- The two goats remain separate selectable actors even though they share one persistent herd. Reduced-motion presentation preserves the identifying silhouette and meaningful posture without adding decorative simulation state.
- Field Manual version 35 explains the Far Paddock, plural custody and homes, the shared behavior boundary, deterministic resource fairness, exact save adoption, and the larger livestock systems that remain future work.

### Save changes

- The outer session advances to version 18, habitat analysis advances to version 9, settlement ecology advances to version 3, and aggregate ecology remains version 4. Current records seal both goat identities, their herd, separated pen, custody relationship, and every previously established actor, group, item, Promise, and world fact.
- A sealed version-17 Yard Flock save migrates exactly once. Its complete habitat-8 record, chicken actors, flock, relationship, home, old coop identity, store state, food-use history, items, and Promises remain byte-identical before the deterministic goat herd, pen, and custody are appended.
- Earlier supported saves retain their established one-way migration chain. Save, reload, full/coarse/full continuity, negative coordinates, and extreme signed coordinates preserve the same livestock identities and homes; reload cannot reroll the herd, duplicate a group, or assign one group to two custodies.

### Known limitations

- This is one bounded starting-harbor goat herd beside the existing chicken flock, not worldwide livestock, complete Wave D settlement ecology, ecological cross-region migration, the full bestiary, or completion of Directive 04\_1.
- Goats have no authored call, persistent tracks or environmental evidence, harmful attack, injury, mortality, carcass, live-prey capture or consumption, foliage browsing, milk, wool, reproduction, complete circadian schedule, or autonomous home-return behavior in this release.
- Guardian and herding behavior, livestock search and rescue, wider ownership, full schedules, complete sound and scent fields, living-foliage use, and exhaustive species or pair coverage remain outside this release.

## 0.3.3-alpha.24 — 2026-09-07

Build: `0.3.3-alpha.24` · Gameplay contract: 22 · Tutorial: 34

The Yard Flock adds one persistent two-to-three-chicken flock to the starting harbor, composing domestic custody, shared animal perception and movement, flock response, and the Storehouse Door's physical food through existing Living Weft owners.

### Gameplay

- The starting harbor now supports one deterministic flock of two or three individual domestic chickens. Each bird and the flock itself have stable identities; the settlement's existing keeper, storehouse yard, and one bounded home relationship own their custody without becoming a second animal-AI system.
- Chickens use the shared wildlife actor, direct perception, attention, terrestrial locomotion, and group contracts. They can react to lawfully perceived humans, dogs, predators, flock alarms, and accessible food through broad ecological roles rather than chicken-to-species scripts.
- A hungry flock member can notice the exact physical produce lot only while the store is open, approach through ordinary terrain, and consume one authenticated unit per resolved event. Securing the door removes that opportunity; hidden activity remains world truth without becoming player narration.

### Fixes

- Habitat version 8 preserves the complete version-7 tidal-web population and anchor record as an exact prefix, then appends only the bounded domestic yard anchor and its supported two-to-three-bird flock. The same seed, signed coordinates, and generation version reproduce the same individuals and group.
- Domestic food use is staged, resolved, and recoverable against the existing store lot, custody relationship, member identity, event identity, and ordinal. A reload, interrupted save, competing claim, or replay cannot duplicate a chicken, duplicate food, consume a secured lot, or charge the same event twice.
- The store access footprint and movement destination now share one Euclidean contact law, so a bird that lawfully reaches the yard can resolve the same physical opportunity it approached instead of stopping at a mismatched distance boundary.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Chickens add ecological pressure and information, not free provisions, player statistics, Promise rewards, abstract settlement-stock changes, or a combat resource.
- The first flock is deliberately small, local, and settlement-bound. Birds can use land and standable shallow water, but receive no flight, deep-water, cross-region, guardian, herding, or autonomous long-range migration capability.
- Validation remains abstraction-led: shared invariants, signed-coordinate properties, migration and replay attacks, physical conservation, bounded performance, and one representative visible-yard composition replace a bespoke suite for every species or an animal-pair matrix.

### Interface

- Chart 2D and Relief 3D render the same directly perceived chickens with a distinct compact bird form. Selection, quick inspection, and pane-free ABOUT disclose only visible identity, approximate size, appearance, condition, current behavior, and the currently visible flock estimate.
- A directly witnessed store feeding can enter EVENTS with the visible bird and exact physical consequence. Facing away, leaving detail range, later returning, or merely knowing the store exists does not grant a retroactive report or hidden flock knowledge.
- Field Manual version 34 explains the bounded yard flock, stable settlement custody, shared behavior, physical open-store feeding, secured-store boundary, knowledge-honest presentation, and the larger domestic systems that remain future work.

### Save changes

- The outer session advances to version 17, habitat analysis advances to version 8, settlement ecology advances to version 2, and aggregate ecology remains version 4. Current records seal the flock identities, stable group, domestic yard anchor, custody relationship, food-use history, and every established actor, item, Promise, and world fact.
- A sealed version-16 Storehouse Door save migrates exactly once. Its complete version-7 habitat, store and lot identities, keeper knowledge, closure state, remaining food, loss history, actors, groups, aggregates, items, and Promises remain exact before the deterministic flock and custody relationship are appended.
- Save, reload, full/coarse/full continuity, negative coordinates, and extreme signed coordinates preserve the same flock, custody, store state, and food-use ordinals. Reload cannot reroll flock size, change an established bird, reopen a secured store, or replay a consumed unit.

### Known limitations

- This is one bounded starting-harbor chicken flock and one reusable domestic-custody seam, not worldwide livestock, full Wave D settlement ecology, ecological cross-region migration, or completion of Directive 04\_1.
- Chickens have no authored call, persistent tracks or environmental evidence, harmful attack, injury, mortality, carcass, live-prey capture or consumption, eggs, nesting, reproduction, complete circadian schedule, or autonomous home-return behavior in this release.
- Guardian and herding behavior, livestock search/rescue, wider ownership, broad schedules, complete sound and scent fields, full settlement food loops, and exhaustive species or pair coverage remain outside this release.

## 0.3.3-alpha.23 — 2026-09-07

Build: `0.3.3-alpha.23` · Gameplay contract: 21 · Tutorial: 33

The Storehouse Door adds one bounded starting-harbor food store whose physical produce, weather-shaped scent, existing wildlife pressure, keeper knowledge, and secured door meet through shared authoritative systems.

### Gameplay

- One starting-harbor store now owns a persistent physical fresh-produce lot through the ordinary settlement-cargo carrier contract. It is a distinct material stock, not a second view of the settlement's abstract food economy; its remaining quantity and every authenticated loss stay accounted for under one stable identity.
- An open store door projects the produce through the existing scent owner, so current wind, rain, distance, and packaging leakage determine whether the existing brown-rat aggregate receives an attraction stimulus. A matching authenticated attraction event can cause at most one physical produce-unit loss; rat relocation itself still conserves the aggregate and does not imply a rat actor, attack, death, or live-prey meal.
- An existing cat's lawfully visible presence can pressure the rat aggregate through shared perception; it gains no hidden rat knowledge or investigation. Alpha 23's keeper response is only the player's in-person report; direct keeper observations are merely authenticated by the shared kernel for later wiring. A secured door persists and contains scent.

### Fixes

- The store, keeper, rat population, nearest store anchor, produce lot, door state, and loss transaction use stable authenticated identities. A loss is staged and committed against the exact matching attraction event and exact physical unit, so a tick, reload, or interrupted save cannot replay it, duplicate food, or remove an unrelated lot.
- Storehouse presentation is derived from the same authoritative state in Chart and Relief. The directly visible settlement mark shows its small door status, while a nearby contextual action exposes only the in-person keeper request.
- Store losses enter EVENTS only when the courier directly caused or could observe them. Bringing a keeper or store back into view does not disclose an earlier unseen event, hidden rat count, private scent path, or distant simulation history.
- The pane-free ABOUT surface keeps a safe gap above the action dock at the narrowest supported portrait size while retaining its scrollable body and 44-pixel controls.

### Balancing

- A CHALLENGING HARD remains the only ruleset. The Storehouse Door adds no species, courier statistic, free resource, Promise payout, abstract settlement stock mutation, or general storage benefit.
- An open door creates a bounded ecological vulnerability; securing it contains scent and prevents later store loss without deleting the already-existing rat population or cat pressure. Each authenticated matching event can remove no more than one real produce unit.
- Shared abstraction checks, a bounded signed-coordinate property sweep, physical-item and aggregate conservation, deterministic migration and replay checks, and one representative store-rat-visible-cat witness validate this seam. Existing shared bounded-fuzz and performance gates remain in the regression suite; no exhaustive species-by-species or animal-pair matrix is required.

### Interface

- Chart 2D and Relief 3D present the same small storehouse-door state as part of the directly visible starting-harbor settlement mark. No new field pane or hidden ecology readout is added.
- When the player is physically near the store and its keeper, the contextual action offers the live in-person report that lets that keeper secure the door. Remote selection cannot issue the request, and no keeper reacts as though they heard the world offscreen.
- Field Manual version 33 explains the one physical store, open-door scent, wind and rain ownership, bounded authenticated loss, persistent secured state, direct keeper request, observation-safe EVENTS, unchanged species roster, and systems that remain absent.

### Save changes

- The outer session advances to version 16 while habitat analysis remains version 7 and aggregate ecology remains version 4. The new settlement-ecology root seals the stable store, keeper, rat aggregate and anchor binding, physical produce carrier, door state, knowledge, and bounded loss history.
- A sealed version-15 Tidal Convergence save migrates exactly once by deriving the same one starting-harbor store and physical produce lot from established world identity. Every earlier habitat, actor, aggregate unit, item, Promise, custody record, evidence record, and world fact remains exact; migration neither subtracts from nor adds to the settlement's abstract food stock.
- Save, reload, failed-tick rollback, region unload, negative coordinates, and extreme signed coordinates preserve the same store identity, closure, remaining units, and completed loss ordinals. Reload cannot reopen the door, reroll an event, duplicate the lot, or replay one loss.

### Known limitations

- This is one bounded starting-harbor storehouse fixture and a reusable settlement-ecology boundary, not worldwide settlement storage, a full domestic-life schedule, a complete food economy, livestock, or completion of Directive 04\_1.
- No new species is added. Wildlife still has no harmful attack, injury, mortality, carcass, live-prey capture or consumption, fishing, reproduction, ecological migration, or complete circadian-life system; store produce loss is a narrow authenticated physical transaction.
- General scent fields, complete sound and evidence tracking, rumors, broad keeper schedules, cat ownership, livestock guardianship or herding, and exhaustive species or pair coverage remain outside this release. Unseen store events remain world truth without becoming player knowledge.

## 0.3.3-alpha.22 — 2026-09-06

Build: `0.3.3-alpha.22` · Gameplay contract: 20 · Tutorial: 32

Tidal Convergence closes the bounded starting-harbor Wave-C integration seam without adding a species, replacing species-switched neutral activity with six reusable, capability-validated activity affordances.

### Gameplay

- A versioned activity-affordance registry now composes perch/watch, low quartering, tidal wading, dabbling waterfowl, shore-water foraging, and aerial surface opportunity across the existing fish crow, northern harrier, snowy egret, American black duck, North American river otter, and gull. No new species or population is added.
- A gull may act on current anonymous tidal surface activity only after shared terrain-occluded vision supplies that observation. It approaches through ordinary bounded air travel, circles visibly when it arrives, and returns to its authenticated habitat anchor during the bounded rest window.
- Immediate lawful threat, escape, alarm, food, guard, pursuit, retreat, and scavenging intents continue to outrank neutral activity. Profiles reuse the same perception, tide, locomotion, physical custody, and aggregate-conservation owners instead of bypassing them with species-specific behavior.

### Fixes

- Neutral activity is now selected through six named archetypes instead of fish-crow, harrier, egret, duck, or otter branches. Each profile declares required capabilities, locomotion class and allowed media, authenticated destination semantics, observation affordance, presentation signals, and its bounded schedule scope.
- The registry and runtime projection firewall fail closed when a profile is missing, duplicated, reordered, incompatible with its canonical runtime policy, or emits an undeclared signal, travel medium, destination meaning, perch claim, or stale observation source. Unknown species inherit no default activity, destination, observation, or presentation signal.
- Gull surface response uses the same current anonymous AQUATIC ACTIVITY observation already admitted through terrain-occluded vision. A stale, hidden, identified-as-prey, or otherwise unlawful tidal cue cannot become its destination or disclose a fish, crab, count, or private target.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Tidal Convergence changes no courier statistic, cargo value, Promise outcome, population total, habitat allocation, or materialization ceiling.
- The gull's new neutral response is air-only. It does not gain swimming, wading, amphibious travel, aquatic foraging, small-prey pursuit, capture, or a harmful attack merely because surface activity is visible.
- Shared properties, aggregate and item conservation, bounded fuzzing, performance budgets, and representative multimodal scenes validate the reusable activity architecture. The release deliberately does not require a bespoke test for every species or an N-squared matrix of animal pairs.

### Interface

- A lawfully visible gull can now show CIRCLING OVER SURFACE ACTIVITY in Chart, Relief, quick inspection, and ABOUT only after reaching the observed area. Transit remains the observation-honest FLYING, and Chart now gives habitat-resting gulls the same grounded posture Relief uses instead of an airborne flap.
- The existing fish crow, harrier, egret, duck, and otter retain their current visible perch, quartering, wading, dabbling, surface, and shore-water signals while those signals are now owned by their reusable activity profiles.
- Field Manual version 32 explains Tidal Convergence, the six existing-species activity profiles, the gull's anonymous terrain-occluded surface observation and air-only response, immediate-intent priority, unchanged save version, and the systems that remain absent.

### Save changes

- The outer session remains version 15, habitat analysis remains version 7, and the aggregate ecology record remains version 4. Activity-affordance profiles are derived from existing stable species identity and are not serialized as a second source of truth.
- No new save migration, population append, actor identity, habitat anchor, aggregate unit, item, Promise, custody record, evidence record, or world-history root is introduced by Tidal Convergence.
- Save, reload, coarse travel, full-detail return, negative coordinates, and extreme signed coordinates retain the same identities and conserved state. A profile can act only on the current lawful observation and authenticated destinations available after return; reload cannot create or reroll a tidal cue.

### Known limitations

- This closes only the bounded starting-harbor Wave-C integration seam. It is not worldwide ecology, ecological cross-region migration, the complete 75-to-150-profile bestiary, or completion of Directive 04\_1.
- Animals still have no harmful attack, injury, mortality, carcass, live-prey capture or consumption, fishing, reproduction, migration, or complete circadian-life system. Existing finite pursuit and pressure remain nonlethal.
- Complete sound propagation, general scent fields, broad persistent evidence and tracking, foliage consumption, social information, and exhaustive species-by-species or animal-pair coverage remain outside this release.

## 0.3.3-alpha.21 — 2026-09-06

Build: `0.3.3-alpha.21` · Gameplay contract: 20 · Tutorial: 31

The Living Channel adds a habitat-supported North American river otter to the bounded starting-harbor ecology, exercising shared amphibious movement, lawful aquatic observation, spatial materialization, and physical food competition without species-pair scripting.

### Gameplay

- Habitat version 7 preserves the entire version-6 population and anchor record as its exact prefix, then may append zero or one persistent North American river otter only where the existing silverside school, fiddler-crab area, usable foraging water, and a distinct dry shore haulout all support it. Unsupported habitat produces honest absence rather than a forced spawn or reload reroll.
- The otter can move between its authenticated shore haulout and surface water through the ordinary shared locomotion and path resolver. In water it may scan, dive, or forage, but a current anonymous aquatic-activity observation can guide it only after the shared terrain-occluded vision boundary lawfully supplies that fact.
- Shared roles and capabilities let a lawfully visible otter create nonlethal pressure for eligible fish and crab aggregates. The existing physical-item claim boundary also permits one representative loose-food competition and custody interaction without a private otter loot table or duplicated provision.

### Fixes

- Core-ecology materialization now ranks every lawful individual candidate by exact local distance to the bounded active field, breaks ties by stable actor ID, and selects the nearest 24 regardless of source array order. Overflow individuals retain their identities and authoritative coarse state instead of disappearing or exceeding the established actor ceiling.
- Amphibious activity now declares shore-and-water travel through one reusable capability seam. The same terrain surface and route solver reject an invalid shore or water step instead of granting the otter a private movement shortcut.
- Chart, Relief, selection, and ABOUT now agree on the same current otter identity, position, behavior, and knowledge boundary. Distant contact stays an unidentified aquatic mammal, and loss of lawful detail removes the target rather than leaving a remote tracker.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Otter pressure is aggregate avoidance or activity change only: it does not capture or consume live prey, injure or kill an actor, create a carcass, implement fishing, or alter the courier's statistics.
- The local patch still materializes no more than 24 individual wildlife actors. Deterministic spatial top-K selection changes which eligible nearby representatives receive detail; it does not increase population totals, fabricate actors, or make the camera authoritative.
- Shared invariants, property and bounded-fuzz checks, conservation rules, and representative shore-water, aggregate-pressure, and physical-custody witnesses validate the reusable architecture. The release deliberately does not require a bespoke test for every species or every possible animal pair.

### Interface

- Chart 2D and Relief 3D give the North American river otter a distinct low-slung swimming form, readable surface motion, matching mouse and touch targets, and reduced-motion parity while preserving the same direct-sight boundary.
- Close lawful ABOUT can identify one North American river otter and describe only observable form, condition, and current behavior such as foraging in water, moving between shore and water, diving, scanning, swimming, or resting. It never reveals a hidden target, exact trait value, aggregate census, or stable database ID.
- Field Manual version 31 explains the habitat-dependent one-otter unit, shared amphibious travel, lawful anonymous aquatic activity, nonlethal fish and crab pressure, physical loose-food competition, deterministic spatial materialization, version-15 save adoption, and the systems that remain absent.

### Save changes

- The outer session advances to version 15 and habitat analysis advances to version 7. Current records authenticate the exact version-6 prefix, zero-or-one otter identity and anchors, current individual materialization, aggregate conservation, and every established actor, item, Promise, custody, evidence, and world-history root.
- A sealed version-14 Between Water and Sky save migrates exactly once. Every earlier population, habitat anchor, actor, group, aggregate unit, tide-operation clock, item, Promise, custody record, evidence record, and world fact stays exact while the deterministic otter habitat extension is appended once.
- Save, reload, coarse travel, full-detail return, negative coordinates, and extreme signed coordinates preserve the same otter presence or honest absence, stable identity, shore and water anchors, materialization order, aggregate totals, and physical item custody. Reload cannot add another otter, reroll support, exceed the 24-actor cap, or duplicate food.

### Known limitations

- This is the final bounded starting-harbor Wave-C role slice, not completion of Wave C, Directive 04\_1, worldwide ecology, ecological cross-region migration, or the complete 75-to-150-profile bestiary.
- The otter cannot capture or consume live prey and has no harmful attack, injury, mortality, carcass, fishing, reproduction, migration, or complete circadian-life system. Its current fish and crab relationship is nonlethal aggregate pressure only.
- No otter-specific call, complete sound propagation, new persistent track or evidence type, complete scent field, broad information flow, or exhaustive species-pair test matrix is claimed. Wider aquatic and scavenger breadth remains future work.

## 0.3.3-alpha.20 — 2026-09-06

Build: `0.3.3-alpha.20` · Gameplay contract: 20 · Tutorial: 30

Between Water and Sky adds at most one persistent American black duck near the stable starting harbor, using shared lawful perception and an explicit air-or-surface-water movement seam rather than species-pair scripting.

### Gameplay

- Habitat version 6 preserves the entire Tide Table version-5 population and anchor record as its exact prefix, then may append one persistent American-black-duck representative, two saved dabbling-water destinations, and one dry refuge where the same bounded habitat can genuinely support them. Unsupported waterfowl remain honestly absent rather than being forced or rerolled.
- During its bounded daylight activity, the duck can float, scan, or dabble at currently wet saved habitat. A current anonymous aquatic-activity observation may guide its choice only after the shared terrain-occluded vision boundary produces that fact; otherwise it uses a deterministic eligible water destination or returns to its authenticated refuge as the tide changes.
- The activity itself selects a movement medium. Movement beginning at the dry refuge uses bounded flight, while movement already on water uses the shared traversability and path resolver over currently wet cells. The same capability-selected aggregate-observation bridge now serves eligible aquatic foragers without a duckDetectFish or species-pair detection function.

### Fixes

- Tidal edge redistribution now records one durable completed-operation tick outside the bounded disturbance tail. Evicting an old visible event with unrelated same-tick activity can no longer make a conserved fish unit perform the same tide-edge opportunity twice; sealed Alpha-19 records reconstruct that clock deterministically from their authenticated completed tick and retained history.
- The anonymous aquatic-activity bridge now authenticates every currently materialized aquatic-foraging observer against the saved ecology patch, applies the same current line-of-sight and depth-usable-anchor rules to each, and still exposes no aggregate actor ID, hidden census, or occluded target.
- Chart and Relief now agree on the American black duck's selected identity, behavior label, ABOUT disclosure, and one-individual scope. Surface swimming, dabbling, resting, and relocation flight are projected from the same authoritative activity state rather than inferred independently by either renderer.

### Balancing

- A CHALLENGING HARD remains the only ruleset. The duck changes no courier statistics, cargo rules, Promise outcome, or tidal population total; its current interactions are observation, alarm, nonlethal pressure, avoidance, and movement only.
- The extension adds at most one materialized duck and three saved waterfowl destinations while retaining the global 24-actor materialization ceiling and bounded habitat, anchor, path, observation, save-size, and tide-soak budgets.
- Shared capability invariants, deterministic signed-space checks, aggregate conservation, one representative multimodal route, and bounded performance witnesses validate the reusable scaffold. The release does not claim or require an exhaustive animal-by-animal interaction test matrix.

### Interface

- Chart 2D and Relief 3D give the American black duck a distinct broad-billed, mottled-brown form with a violet wing accent, color-independent silhouette detail, matching mouse and touch targets, and reduced-motion parity. It is never labeled as a flock.
- Close lawful ABOUT can identify the individual and describe only visible form, current condition, and authenticated behavior such as FLOATING, WATER SCAN, DABBLING, RESTING, SURFACE SWIMMING, or RELOCATION FLIGHT. It never reveals a hidden target, exact trait value, private aggregate count, or database ID.
- Field Manual version 30 explains the live one-duck waterfowl unit, lawful anonymous aquatic observation, explicit flight-versus-surface movement, version-14 save adoption, and the still-absent flock, nesting, migration, mortality, and carcass systems.

### Save changes

- The outer session advances to version 14, habitat analysis advances to version 6, and the aggregate ecology record advances to version 4 for its durable tide-operation clock. Current saves authenticate the exact waterfowl habitat, actor identity, movement state, aggregate conservation, and every established world and custody root.
- A sealed version-13 Tide Table save migrates exactly once. Every version-5 habitat population and tidal anchor, actor, group, aggregate unit, disturbance, evidence record, item, Promise, custody record, player fact, and world fact stays exact while the deterministic waterfowl habitat and zero-or-one duck population are appended once.
- Save, reload, coarse travel, full-detail return, negative coordinates, and extreme signed coordinates preserve the same duck presence or honest absence, identity, position, tide clock, and aggregate totals. A legacy inner ecology record cannot masquerade inside a current version-14 envelope, and refresh cannot reroll or duplicate the extension.

### Known limitations

- This is a bounded second Wave-C unit near the stable starting harbor. It is not worldwide ecology, ecological cross-region migration, completion of Wave C, the full biodiversity directive, or the complete 75-to-150-profile bestiary; the otter-like predator and wider waterfowl breadth remain later work.
- The duck has no simulated flock, nesting, reproduction, capture, consumption, injury, mortality, or carcass state. No call is invented merely to fill a sound row, and aquatic-foraging observations remain nonlethal information rather than feeding or population loss.
- Complete scent fields and tracking, foliage consumption, broad social information, full sleep and circadian schedules, wildlife promotion beyond current rules, worldwide populations, and harmful animal interactions remain future systems.

## 0.3.3-alpha.19 — 2026-09-06

Build: `0.3.3-alpha.19` · Gameplay contract: 20 · Tutorial: 29

The Tide Table begins bounded Wave-C tidal ecology near the stable starting harbor with a conserved Atlantic-silverside school, a conserved Atlantic-marsh-fiddler-crab area, and at most one snowy egret whose visible activity follows the live tide and lawful perception.

### Gameplay

- Habitat version 5 preserves the entire version-4 population analysis as its exact prefix, then deterministically appends an Atlantic-silverside school aggregate, an Atlantic-marsh-fiddler-crab area aggregate, and at most one persistent snowy-egret representative where the bounded starting-harbor habitat supports them. Unsupported roles remain honestly absent rather than being forced or rerolled.
- Each tidal aggregate owns stable saved anchors with baseline elevation. The authoritative tide derives current water depth, usable habitat, schooling or emergence activity, and bounded redistribution from those anchors without changing aggregate identity or total population. Fish evacuate a drying anchor into saved wet refuge immediately; ordinary edge movement transfers only one existing unit on its fixed opportunity.
- The snowy egret owns a saved dry refuge and depth-safe wading edges. During daylight it can relocate toward observed aquatic activity only after shared vision creates a current anonymous aquatic-activity observation; if no lawful cue exists, it holds a valid wading position or returns to refuge instead of using hidden population knowledge. A lawfully visible egret can create nonlethal pressure and conserved avoidance for both tidal aggregates through shared role-and-capability policy.

### Fixes

- Aggregate locomotion now rejects a currently depth-unusable fish destination, including a same-tick destination invalidated by the tide, so ordinary pressure cannot move conserved school units onto dry ground. Tidal depth comes only from authenticated saved elevation and the target tick's authoritative tide.
- Fish and crab evidence now follows current occupied, active, depth-usable anchors. Surface dimples, brief school glints, burrow openings, and feeding scrapes cannot reveal an empty or unusable anchor, fabricate an individual animal, disclose a hidden population count, or remain a remote tracker after direct-detail sight is lost.
- Snowy-egret activity, movement, rendering, hit targets, and ABOUT behavior authenticate the same actor and current activity projection. Stale, occluded, mismatched, or absent aggregate activity cannot be borrowed as a wading target, and save/reload preserves the same cognition, position, refuge, and aggregate identities.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Tides change where activity is viable and where a wader can safely stand, but the first tidal interaction is pressure and avoidance only: it cannot capture, injure, kill, consume, create a carcass, implement fishing, or alter cargo.
- The Tide Table is bounded by at most three silverside anchors, four fiddler-crab anchors, four egret wading anchors, one egret refuge, and one egret representative. Fixed-cadence aggregate movement and shared bounded visual-source selection prevent an unbounded all-pairs or camera-driven ecology loop.
- Shared invariants, deterministic properties, bounded interaction scenarios, runtime integration, save-adoption witnesses, and a dedicated performance budget validate the reusable architecture. The release does not claim an exhaustive animal-by-animal interaction matrix.

### Interface

- Chart 2D and Relief 3D render silverside surface activity, fiddler-crab burrows or feeding scrapes, and the snowy egret with distinct color-independent forms, matching mouse and touch targets, reduced-motion parity, and the same direct-sight knowledge boundary.
- ABOUT identifies only a lawfully observed egret or close aggregate sign. It may describe visible form, current behavior, evidence kind, or a coarse activity scale, but never an exact school or crab count, hidden anchor, private target, pressure value, or invented individual fish or crab.
- Field Manual version 29 explains the live Tide Table, stable aggregate identity, tide-derived depth and activity, lawful egret observation and relocation, direct evidence, version-13 save adoption, and the explicit limits of this first bounded Wave-C unit.

### Save changes

- The outer session advances to version 13 and core ecology advances to habitat version 5. It authenticates stable tidal elevations and anchors, conserved fish and crab aggregates, the snowy-egret identity and refuge, activity evidence, cognition, and motion beside all established actors, groups, aggregates, items, Promises, custody, and world history.
- A sealed version-12 save migrates exactly once. Every habitat-version-4 population byte, actor, group, aggregate, item, Promise, evidence record, disturbance, and world fact stays exact while the deterministic Tide Table extension is appended once; older supported saves continue through their frozen migration authorities into the same current result.
- Save, reload, coarse travel, full-detail return, signed moving-frame continuity, negative coordinates, and extreme coordinates preserve the same tidal identities and totals. Refresh cannot reroll or duplicate a school, crab area, egret, anchor, population unit, evidence record, or save-adoption append.

### Known limitations

- This is only the first bounded Wave-C unit near the stable starting harbor. It is not worldwide ecology, ecological cross-region migration, completion of Wave C, the full biodiversity directive, or the complete 75-to-150-profile bestiary.
- Animals still do not attack, receive injuries, die, leave carcasses, or consume live prey. Egret pressure is conserved avoidance rather than capture or feeding, and fishing, harvest, waterfowl, otters, reproduction, and population mortality remain outside this release.
- Complete scent fields and tracking, foliage consumption, broad social information, full sleep and circadian schedules, wildlife promotion beyond current rules, additional tidal species, and full species readiness remain future work.

## 0.3.3-alpha.18 — 2026-09-06

Build: `0.3.3-alpha.18` · Gameplay contract: 20 · Tutorial: 28

One Marsh, Many Eyes closes the seven-role Wave-B ecology inside the bounded starting-harbor assemblage through shared species and interaction contracts, while making visible flock estimates and unidentified chorus direction agree across world, sound, captions, and ABOUT.

### Gameplay

- Aggregate visual contact now carries a canonical living species into one shared role-and-trophic response policy. A lawfully perceived marsh fox can therefore create predator pressure for eligible brown-rat and southern-leopard-frog population areas, while a neutral marsh rabbit creates no disturbance merely by being nearby.
- Every brown-rat, domestic-cat, marsh-rabbit, marsh-fox, fish-crow, northern-harrier, and southern-leopard-frog module now declares every broad ecological target class as either an available interaction or an intentional non-response. Future species can compose through the same contract instead of acquiring private species-pair detection code.
- The bounded starting-harbor Wave-B roster now has one representation-aware closure witness across individual actors, a persistent flock, and aggregate population areas. This closes that local seven-role release wave without claiming worldwide ecology or complete 30-criterion readiness for every species.

### Fixes

- Aggregate perception no longer depends on a concrete runtime allow-list of cats, dogs, gulls, crows, and harriers. Source identity remains canonical at the sensory boundary and the shared ecological policy derives supported pressure or no response from declared species roles and capabilities.
- Selecting a visible gull or fish crow now carries the already filtered visible flock estimate into quick and full ABOUT. The inspection therefore agrees with the birds actually in sight and never drops the group summary merely because the player selected one representative.
- The rain-responsive chorus caption no longer identifies frogs before the player has learned that fact. It now reports an anonymous nearby or distant chorus and only the direction justified by the shared heard-bearing uncertainty; co-located or heavily masked sound says all around or direction unclear instead of inventing a cardinal fact.

### Balancing

- A CHALLENGING HARD remains the only ruleset. The shared bridge changes which lawful nearby species can influence an aggregate; it does not grant player bonuses, add combat, or turn neutral co-presence into automatic danger.
- Existing population, representative, group, stimulus, evidence, and save-size caps remain unchanged. Aggregate response still moves at most one conserved unit on a fixed opportunity and cannot consume cargo, create an animal, or produce mortality.
- Broad contract invariants, role-derived outcomes, and representative fox-to-aggregate and neutral-rabbit cases stand in for an exhaustive animal-by-animal test matrix. Emergent combinations remain free to use the same bounded scaffold.

### Interface

- Chart 2D and Relief 3D keep the same knowledge boundary. When multiple visible gulls or fish crows are summarized, the world label, quick inspection, and full ABOUT use the same approximate visible count rather than implying unseen flock members.
- Equivalent chorus captions and uncertainty-attenuated stereo pan now derive from the same lawful audible-bearing contact. A cardinal direction appears only when hearing resolves it; the caption remains species-anonymous and contains no hidden population identity.
- Field Manual version 28 explains the completed bounded Wave-B role scaffold, role-derived aggregate pressure, intentional neutral responses, visible-flock parity, anonymous directional chorus, and the limits of this local closure.

### Save changes

- The outer session remains version 12 and core ecology remains habitat version 4. No schema migration or rewrite of existing records is required; future lawful Alpha 18 aggregate responses persist through the existing version-4 aggregate fields rather than a new save shape.
- Existing stable animal, flock, population-area, evidence, cargo, and custody identities remain authoritative across save, reload, coarse travel, full-detail return, signed region seams, and extreme coordinates. The shared response bridge cannot reroll or duplicate them.
- Legacy cat and dog aliases remain canonical in transient Settlement Shadows stimulus/event payloads and retain the version-2 compatibility shape for pre-existing rat interactions. Newly admitted species pressure uses the additive version-3 small-world event shape, while the sensory boundary rejects duplicate domestic-cat or domestic-dog spellings.

### Known limitations

- Wave B is closed only as a bounded starting-harbor assemblage. Distant regions do not yet own their own habitat populations, so this is not worldwide ecology, ecological migration, or the full 75-to-150-profile biodiversity target.
- Animals still do not attack, receive injuries, die, leave carcasses, or consume live prey. Fox and harrier pursuit remains finite and nonlethal, and aggregate response remains conserved movement or activity rather than hidden mortality.
- Complete scent fields and tracking, foliage consumption, broad social information, complete sleep and circadian schedules, reproduction, promotion beyond current rules, additional species, and full species readiness remain future work.

## 0.3.3-alpha.17 — 2026-09-05

Build: `0.3.3-alpha.17` · Gameplay contract: 20 · Tutorial: 27

Rain Chorus / Shadow Overhead adds persistent fish crows, a solitary northern harrier, and a conserved southern leopard-frog population with a rain-responsive chorus through one shared species-capability scaffold, with bounded daily activity and knowledge-honest sound and presentation.

### Gameplay

- Habitat version 4 preserves every version-3 population byte-for-byte as its exact prefix and deterministically appends fish-crow, northern-harrier, and southern leopard-frog populations when the local habitat supports them. Fish crows use up to three persistent individual representatives in one saved CROW-FLOCK, the harrier remains a single solitary representative, and 64–72 frog population units share at most three aggregate habitat anchors without manufacturing individual frog actors.
- Fish crows can seek an authenticated habitat perch during their bounded rest window, form a persistent flock, physically reach and consume exactly one loose provision through ordinary custody, and raise a nasal double-call alarm only after directly identifying an aerial predator. A crow that is actually mobbing can become perceived pressure that interrupts the harrier's finite nonlethal pursuit; neutral co-presence alone cannot fabricate that response.
- The northern harrier rests outside its bounded daytime window and otherwise follows a deterministic low quartering search through the shared aerial locomotion boundary. Immediate hunger, perceived threats, and other lawful needs retain priority over this neutral activity; the schedule is a narrow day/rest owner rather than a claim of complete circadian life.
- The southern leopard-frog population becomes more active in rain, can quiet or redistribute one conserved unit under lawful local pressure, and can produce one bounded chorus from its strongest currently heard anchor. Weather changes activity and hearing conditions, never the aggregate's stable identity, anchor capacity, or total population by itself.

### Fixes

- A versioned species runtime policy now decides whether a species may own an actor address, group state, individual locomotion, aggregate response, activity projection, evidence, and presentation. The frog is therefore conserved as an aggregate everywhere, while crows and harriers retain individual identity through the same shared boundary instead of accumulating species-specific detection and rendering shortcuts.
- The frog chorus and fish-crow double call use original low-cost sound cues and anonymous equivalent captions. A chorus enters the shared directional hearing model from its actual saved anchor, rain can both increase frog activity and mask what is heard, simultaneous directional cues retain independent stereo placement, and hidden events do not become omniscient player EVENTS.
- Crow perch and harrier quartering presentation now require the current actor's authenticated activity projection. A stale or mismatched actor cannot borrow another population's perch, rest, target, label, hit target, or ABOUT state.
- Neutral scheduled movement uses the shared bounded aerial movement and validated world-position boundary, and yields to immediate pursuit, escape, forage, and scavenging movement. An unrepresentable activity target fails closed without corrupting or reclassifying the actor, and a bird can leave a saved night-rest posture when its daylight window begins.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Rain Chorus adds ecological warning, food pressure, weather-responsive chorus, and overhead pursuit without attacks, injury, death, carcasses, hunting rewards, live-prey consumption, or a companion bonus.
- The new slice is explicitly bounded: at most three crow representatives, one harrier representative, three frog anchors, one conserved frog-unit redistribution on its fixed opportunity, finite pursuit, and fixed-cadence activity and sound. Region streaming and coarse simulation preserve identities without an unbounded all-pairs interaction loop.
- Shared invariants, capability contracts, bounded fuzzing, performance budgets, and representative crow–harrier–rabbit–dog–human–frog scenarios validate emergent composition. The release does not pretend to enumerate or script every possible animal pair.

### Interface

- Chart 2D and Relief 3D now render fish crows, the northern harrier, and frog-population evidence with distinct color-independent forms, matching mouse and touch targets, reduced-motion parity, and the same direct-sight knowledge boundary.
- ABOUT may identify a visible crow or harrier and describe only observable form, condition, and current behavior. Perched and low-quartering labels appear only when their authenticated activity is current; frog ABOUT describes only directly visible population-level signs without inventing an individual frog, exact population count, hidden anchor, private pressure, or remote tracker.
- The crow's nasal double call and the frog chorus use restrained audio plus anonymous bottom-right captions. The northern harrier has no fabricated vocal cue in this release. Field Manual version 27 explains the new populations, aggregate chorus, bounded activity, physical custody, save migration, and explicit limits.

### Save changes

- The outer session advances to version 12 and its core-ecology record authenticates habitat version 4, fish-crow flock membership, northern-harrier identity, the conserved frog population area, new evidence, and physical crow provision custody beside all earlier actors, groups, aggregates, cargo, Promises, and world history.
- A sealed version-11 save migrates exactly once. Every established habitat-version-3 population byte, actor, group, aggregate, item, custody record, Promise, disturbance, evidence record, and world fact remains exact while the deterministic crow, harrier, and frog extension is appended once.
- Save, reload, coarse travel, full-detail return, signed region boundaries, and extreme coordinates preserve the same new actors, flock, aggregate population units, saved intent, evidence, and item history. Refresh cannot reroll or duplicate a bird, frog unit, chorus anchor, group, consumed provision, or migration append.

### Known limitations

- This remains one bounded habitat assemblage near the original harbor, not worldwide wildlife generation or the full bestiary. Broader populations, ecological migration, reproduction, and complete sleep or circadian schedules are not live.
- Animals still do not attack, receive injuries, die, leave carcasses, or consume live prey. Harrier pursuit is finite and nonlethal, frog pressure is conserved redistribution, and the harrier has no authored vocal cue yet.
- The frog chorus, crow alarm, narrow food custody, direct evidence, and activity windows are focused extensions of shared systems. Complete scent fields and tracking, foliage consumption, broad rumor or social-information flow, mortality, and an exhaustive species-pair interaction matrix are not live.

## 0.3.3-alpha.16 — 2026-09-05

Build: `0.3.3-alpha.16` · Gameplay contract: 20 · Tutorial: 26

Marsh-edge Pursuit adds habitat-derived marsh rabbits and marsh foxes, a readable nonlethal chase, direct movement signs, and knowledge-honest field cues without turning the ecology into combat.

### Gameplay

- Habitat version 3 extends the bounded original-harbor assemblage with deterministic marsh-rabbit and marsh-fox populations while preserving every earlier habitat analysis. Either species can be honestly absent when the local marsh edge cannot support it; present animals use bounded persistent individual representatives rather than camera-triggered spawns.
- A marsh rabbit that directly perceives a fox can alarm and then flee. A hungry marsh fox can pursue a directly perceived rabbit, while a lawfully perceived dog or large predator can replace that prey as the more urgent pressure and send the fox away.
- Rabbit flight and fox pursuit use the shared terrain and path resolver with distinct bounded gaits. Pursuit has a finite duration and disengages when its lawful opportunity ends; it never commits an attack, injury, kill, carcass, or prey-consumption transaction.
- Actual rabbit and fox movement can leave bounded paired tracks or canid pawprints at the saved movement site. A rabbit thump or fox yip is presented only for a causative transition visible at event time, so hidden behavior remains world state rather than remote player knowledge.

### Fixes

- Predator and prey appraisal now combines broad ecological role with a small-prey size class. This deliberately fixes the old size-blind result that could classify a domestic cat and a deer as a predator-prey pair; cats and marsh foxes can pursue declared small prey without treating deer as food.
- Rabbit and fox movement signs project from their persisted evidence coordinates rather than the animal's later position. They require current direct-detail sight, are not targetable, lose identifying clarity as they age, and disappear after three in-world hours instead of becoming permanent remote animal locators.
- Fox pursuits now have a deterministic time bound and cooldown, and blocked locomotion feeds back into the shared decision boundary instead of creating an endless chase or a terrain-bypassing move.
- Rabbit-thump and fox-yip cues use original low-cost sound patterns with equivalent anonymous bottom-right captions. Runtime emission remains gated to a newly visible causative event.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Marsh-edge Pursuit adds route pressure and readable animal behavior without combat, hunting rewards, carcass loot, free food, or a companion bonus.
- Rabbit and fox populations, materialized representatives, movement distance, pursuit duration, memories, and evidence are bounded. Full and coarse simulation preserve the same individuals without turning the local food-web relation into an unbounded all-pairs scan.
- The shared role, size, perception, decision, and locomotion contracts are tested through invariants, bounded fuzzing, and representative rabbit-fox-dog-predator scenarios rather than a bespoke script or exhaustive fixture for every possible species pair.

### Interface

- Chart 2D and Relief 3D now give marsh rabbits and marsh foxes distinct color-independent forms, movement cues, readable labels, generous shared mouse and touch targets, and reduced-motion parity.
- At uncertain range, ABOUT says SMALL ANIMAL or UNKNOWN CANID. Direct identification may add the observed species, approximate form, morph, life stage, condition, and current behavior, but never hidden statistics, a private target, population pressure, or habitat truth.
- Paired tracks and canid pawprints have distinct truthful forms under direct sight, but remain non-targetable evidence with no invented label or ABOUT record. Field Manual version 26 explains the pursuit, movement signs, visible-event sound, save migration, and the limits of this bounded slice.

### Save changes

- The outer session advances to version 11. Its existing aggregate-capable ecology record now authenticates the habitat-version-3 derivation, marsh-rabbit and marsh-fox populations, persistent actors, bounded movement evidence, and the earlier groups, rat area, cats, cargo, and world history.
- A sealed version-10 save migrates exactly once while preserving every established actor, group, aggregate population, item, custody record, Promise, disturbance, evidence record, and world fact. Only the deterministic marsh-rabbit and marsh-fox extension is appended.
- Save, reload, coarse travel, full-detail return, signed region boundaries, and extreme coordinates preserve rabbit and fox identities, saved intent, and movement signs. Refresh cannot reroll or duplicate the new populations, actors, or evidence.

### Known limitations

- This remains one bounded habitat assemblage near the original harbor, not worldwide wildlife generation or the full bestiary. Distant populations, reproduction, ecological migration, and circadian behavior are not live.
- Fox pursuit is intentionally nonlethal. Animals do not attack, receive injuries, die, leave carcasses, or consume live prey; hunting, capture, treatment, and predator-kill population effects are not live.
- Rabbit and fox tracks are a narrow direct movement-sign system, and their calls are visible-event presentation cues. Complete scent fields and tracking, foliage consumption, broader food-web turnover, social information, and an exhaustive species-pair interaction matrix are not live.

## 0.3.3-alpha.15 — 2026-09-05

Build: `0.3.3-alpha.15` · Gameplay contract: 20 · Tutorial: 25

Settlement Shadows adds a stable brown-rat population area, persistent free-ranging domestic cats, directly observable rat signs and wet cat tracks, and bounded ecological responses to nearby life, loose food, terrain, and rain.

### Gameplay

- The original-harbor habitat assemblage now derives brown rats and domestic cats beside the existing deer, gulls, and black bears. Brown rats use one stable population-area aggregate with no individual rat actors; free-ranging domestic cats are bounded, deterministic individual wildlife with persistent generated identity.
- Current lawful visual contact from nearby cats, dogs, people, or gulls can press rat activity between its saved habitat anchors. Exposed loose physical provisions can create scent attraction, while rain and terrain exposure create their own pressure. On each eight-tick opportunity, at most one rat population unit redistributes inside the existing area.
- The aggregate response is nonlethal and conserves the world. It never creates or kills a rat actor, consumes or moves the attracting provision, changes Promise custody, or reveals the hidden population automatically. Domestic cats reuse the shared wildlife observation and movement rules across full and coarse representation.
- A hungry domestic cat can act on a directly seen loose provision. Seeing another cat at the same opportunity can change foraging into guarded food, while sufficiently strong local rain can produce a bounded retreat and persistent wet pawprints without inventing injury, death, or ownership.

### Fixes

- Brown-rat activity is now represented by persistent gnaw marks, small tracks, or shelter signs instead of fake rat sprites. A sign can render, label, select, and open ABOUT only while current direct-detail sight supports it; turning away clears the ephemeral selection rather than creating a remote tracker.
- Domestic cats, the existing dog, humans, and gulls now enter the Settlement Shadows web through the same terrain-occluded visual contact boundary. Loose-food attraction uses the shared wind- and rain-shaped scent evaluator after physical cargo custody has resolved instead of reading an item through a species-specific proximity shortcut.
- Rat rustles and domestic-cat calls are emitted only for newly visible activity. Hidden redistribution and offscreen cat decisions remain authoritative world state without entering the player's EVENTS feed or granting a god's-ear cue.
- Wet cat pawprints survive save, load, and coarse travel but render only under current direct-detail perception. They remain non-targetable environmental evidence and expose neither the cat's hidden cognition nor the cause of its movement.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Settlement Shadows adds route information and local ecological pressure without combat, hunting rewards, loot rats, free provisions, cat ownership, or a companion bonus.
- Rat redistribution is limited to one population unit per aggregate on a fixed eight-tick cadence and to already validated habitat anchors. A substantially crowded anchor may space one conserved unit toward a quieter anchor; food attraction records no consumption, and cat, dog, human, gull, rain, and terrain pressure cannot cause injury, death, carcasses, or cargo mutation.
- The shared ecology scaffold is validated through conservation rules, outcome classes, deterministic representative encounters, and bounded fuzzing rather than a bespoke script or exact fixture for every possible species pair.

### Interface

- Chart 2D and Relief 3D now draw distinct low-cost domestic-cat forms, brown-rat signs, and directly visible wet cat pawprints from the same perception-safe projection. Mouse and touch use the same actor and rat-sign hit targets, quick labels, close behavior, and non-pausing ABOUT surface; wet cat tracks are deliberately not a remote-selectable tracker.
- Rat-sign ABOUT reports only the directly observable evidence and, at sufficient clarity, its brown-rat classification. It never exposes exact population count, activity, pressure, habitat anchors, cause, persistent IDs, or an invented individual rat.
- Field Manual version 25 explains the difference between an individual cat and an aggregate rat population, visible signs and sound cues, lawful pressure and food scent, fixed-cadence redistribution, physical conservation, save migration, and the limits of this local slice.

### Save changes

- The outer session advances to version 10 and the core-ecology record adopts its aggregate-capable habitat form. It stores the stable rat population area, anchors, activity, bounded evidence and disturbances, plus the existing individual wildlife, groups, physical cargo, and world history.
- A sealed version-9 save migrates exactly once while preserving every established actor, position, condition, group, item, custody record, Promise, and prior ecology fact. The seed-derived rat area and free-ranging cats are added once without rerolling or replacing the original wildlife.
- Save, reload, coarse travel, and full-detail return preserve the same cat identities and rat aggregate. Current version-10 saves require the canonical new ecology shape, so refresh cannot duplicate cats, food, signs, populations, or migration effects.

### Known limitations

- This is still one bounded assemblage around the original harbor, not worldwide ecology. Further species, distant habitat populations, ecological migration, reproduction, circadian schedules, and broad food webs remain future work.
- Animals do not attack, receive injuries, die, or leave carcasses. Hunting, capture, treatment, taming, breeding, cat ownership, bonding, naming, recruitment, and companion behavior are not live.
- Rat signs and wet cat pawprints are narrow directly observed evidence systems, and loose provisions feed only bounded scent pressure without rat consumption. General scent plumes, broad evidence trails and tracking, social information, and exhaustive species-to-species behavior are not live.

## 0.3.3-alpha.14 — 2026-09-05

Build: `0.3.3-alpha.14` · Gameplay contract: 20 · Tutorial: 24

The first wildlife crossing is now derived from its actual habitat and backed by bounded populations, persistent group-sized deer herds and gull flocks, solitary bears, and nonlethal player-absent group history.

### Gameplay

- The bounded wildlife assemblage near the original harbor is now derived deterministically from the local terrain, biome, water, cover, food, nesting conditions, and predator pressure. A species may be honestly absent when the habitat cannot support it instead of being forced into a fixed roster.
- Each deer, gull, or black-bear population now records habitat capacity, represented population units, pressure, and a deterministic pressure trend. The active window materializes only a bounded set of persistent individual representatives; one representative may stand for several aggregate population units without merging its identity with another actor.
- In new habitat-derived assemblages, group-sized deer form persistent herds and gulls form persistent flocks, with stable membership, cohesion, alarm-signal state, split/rejoin lineage, and saved anchors. Black bears remain solitary. A fully coarse group may undergo deterministic nonlethal habitat-pressure displacement while the player is absent. The record never enters player EVENTS or knowledge automatically; player-facing aftermath inspection is not yet live.

### Fixes

- Full-to-coarse transitions now preserve each wildlife identity and reconcile group anchors before the same actors rematerialize. Coarse actors age only their already-authoritative physiology and current saved intent; they do not invent movement, targets, perception, food, or player knowledge while unloaded.
- Threatened deer on valid standable shallow water can now choose and complete a valid move back across standable shallow terrain. Deep or nonstandable water remains closed to ordinary land-animal movement.
- Habitat generation now evaluates only the exact bounded focus tiles it selected and reuses a small frozen cache for the same seed-bound local analysis, keeping repeated runtime construction bounded without changing ecological results.

### Balancing

- A CHALLENGING HARD remains the only ruleset. Habitat capacity and pressure create ecological constraints rather than spawn quotas, so a quiet patch with no valid bear, deer, or gull remains a legitimate deterministic outcome.
- Player-absent group incidents are limited to separation, displacement, or reunion. They cannot harm actors, touch cargo, manufacture a witnessed event, or reveal remote information to the player.
- The release proves shared invariants and representative deer, gull, and bear outcomes instead of scripting every possible species pairing. Novel combinations remain free to emerge through the same bounded sensory, needs, movement, and group contracts.

### Interface

- Field Manual version 24 explains habitat-derived presence, aggregate populations, deer herds, gull flocks, solitary bears, coarse limits, and the difference between an event existing in the world and the player knowing about it.
- Existing Chart, Relief, selection, and ABOUT surfaces remain knowledge-gated. They show only materialized actors and earned observations, never exact hidden population pressure, remote group incidents, or an omniscient wildlife tracker.

### Save changes

- The outer session advances to version 9 and the core-ecology record advances to its canonical habitat-and-group format. It stores habitat derivation, represented units, capacity, pressure, trend, group membership, component anchors, signals, lineage, aftermath, and the same persistent actor states.
- A sealed version-8 save migrates once into version 9 while preserving its exact wildlife identities and dynamic states, physical cargo identities and custody, Promise state, and world progress. Reloading cannot reroll the migrated actors, and migration does not invent habitat or group history.
- Older supported saves receive the current seed-derived untouched habitat baseline without invented observations or incident history. Current version-9 saves reject legacy inner ecology records instead of silently applying a second migration.

### Known limitations

- This remains one bounded local habitat assemblage around the original harbor, not worldwide ecology or a larger bestiary. Additional species, distant habitat populations, ecological migration, reproduction, and circadian life remain future work.
- Animals still do not attack, receive injuries, die, or leave carcasses. Hunting, combat, capture, treatment, breeding, and predator-kill population effects are not live.
- The player-absent ecology slice supports only authorized nonlethal group pressure and aftermath. General scent plumes, evidence trails, tracking, rumors, sleep schedules, multi-species food webs, and exhaustive species-to-species behavior are not live.

## 0.3.3-alpha.13 — 2026-09-05

Build: `0.3.3-alpha.13` · Gameplay contract: 20 · Tutorial: 23

The five living actor types already present now share one strict, versioned species and sensory contract, with release evidence that stays explicit about every unfinished capability.

### Gameplay

- Humans, domestic dogs, deer, gulls, and black bears now share one validated versioned species catalog. The catalog must exactly match the current living-actor roster and fails closed on missing, duplicate, malformed, or extra modules.
- The current wildlife records remain persistent individuals with bounded needs, condition, attention, memory, and materialization. A visible gull flock is only a summary of directly observed gulls; it does not merge their identities or reveal hidden population state.

### Fixes

- The species catalog and its build-owned release evidence now cover all five actor types already present instead of stopping at humans and domestic dogs.
- Production alarm hearing and scent sensitivity now read the matching relative capabilities through the validated species contract. Species-specific visual acuity remains recorded foundation data rather than a claimed live input.

### Balancing

- A CHALLENGING HARD remains the only ruleset. This reconciliation preserves the existing five sensory profiles and does not add detection range, omniscient awareness, wildlife rewards, or easier travel.
- Relative sensory capability is not a detection radius. Line of sight, distance, physical sound or scent evidence, wind, rain, packaging, and current observation rules still determine what an actor can lawfully perceive.

### Interface

- Field Manual version 23 identifies the shared five-actor species-and-senses contract and states plainly that this release adds no new species or behavior.
- Existing Chart and Relief markers, selection, and ABOUT disclosure remain knowledge-gated; this contract review adds no remote tracker or hidden-stat display.

### Save changes

- The outer session remains version 8 and the embedded simulation remains format 4 with tideweft-sim/6. This release requires no save migration and does not rewrite established actor identities or ecology state.
- Species contracts and release evidence are build-owned validation data rather than serialized world entities, so loading an existing Alpha 12 save preserves its exact actors, cargo, memories, and materialization state.

### Known limitations

- This release adds no new species, spawn site, population, behavior, interaction, attack, or ecological outcome. It reconciles only the five actor types already present in the bounded Alpha 12 living web.
- Animal sound repertoires, injuries, incapacitation, causal death, carcasses, circadian schedules, persistent herds or flocks, environmental evidence, worldwide habitat populations, unloaded-region ecology, and player-independent scenarios remain not live.

## 0.3.3-alpha.12 — 2026-09-05

Build: `0.3.3-alpha.12` · Gameplay contract: 20 · Tutorial: 22

A bounded wildlife crossing adds directly observable deer, gulls, and one black bear to the first living web, with shared sight and alarm evidence, physical food scavenging, and save-safe persistence.

### Gameplay

- The first living web now includes one deterministic local population patch containing deer, gulls, and a black bear. Each actor has a stable generated identity and bounded individual state; the visible gull presentation may summarize the directly observed part of its flock without revealing the hidden population.
- Deer, gulls, the black bear, the nearby dog, and the porter reuse shared sight and alarm observations. A visible predator may change animal behavior, while a heard alarm remains an anonymous direction rather than magically identifying a bear. A nearby porter can secure exposed food, reroute, leave, or wait according to what reached their own perception and their current policy.
- A hungry black bear can reach and consume the crossing's exposed one-unit dried-fish parcel as a real world object. Consumption removes that exact persistent entity, writes animal-consumption history, and cannot be replayed to remove or create another unit.

### Fixes

- Chart and Relief now gate wildlife rendering, labels, hit targets, selection, and ABOUT through the same current direct-detail sight. Turning away or losing lawful sight closes the observation instead of leaving a remote animal tracker.
- Shared alarm propagation is bounded by range and carries uncertainty without smuggling the caller's stable identity, species, hidden target, or exact internal motive into another actor's knowledge.
- Wildlife food claims now fail closed unless the exact whole provision is physically within reach. Malformed, partial, non-provision, out-of-range, or already-consumed claims leave cargo and ecology unchanged.

### Balancing

- A CHALLENGING HARD remains the only ruleset. The new animals create information, route pressure, and one finite scavenging consequence without adding combat rewards, random loot, free food, or a second difficulty.
- WAIT AND WATCH, ROUTE AROUND THIS SPOT, and LEAVE remain grounded field choices. Waiting halts the current automatic route briefly, rerouting must preserve the existing destination through a valid path around the observed spot, and a rejected detour leaves the prior route intact.
- Detailed wildlife simulation is bounded to the active moving world window. The same stable actors cross between full and coarse representation without camera-driven respawn, identity rerolls, or an unbounded all-pairs interaction loop.

### Interface

- Directly visible deer, gulls, and black bears now receive distinct low-cost Chart and Relief silhouettes, readable hover or selection labels, and the shared non-pausing ABOUT surface. A gull may appear as GULL FLOCK when several members are currently visible.
- Wildlife ABOUT reports only current observable species clarity, group estimate, condition, behavior, appearance, and life stage. Hidden needs, targets, causal references, population totals, raw scores, and stable database IDs remain private.
- Field Manual version 22 teaches the deer, gull, and black-bear crossing, shared sight and anonymous alarms, autonomous porter responses, WAIT, REROUTE, LEAVE, whole-parcel scavenging, persistence, and the explicit limits of this bounded release.

### Save changes

- The outer session advances to version 8 and adds one canonical core-ecology record alongside the existing physical cargo, regional travel, first dog web, porter response, player choices, Promise journey, and pending sensory carry. The embedded simulation remains format 4 with tideweft-sim/6.
- Supported outer versions 1 through 7 migrate deterministically. A version-7 save keeps its established world, dog, porter choices, cargo, and history while receiving the same seed-derived untouched wildlife baseline and exposed provision exactly once.
- Wildlife identities, segmented positions, materialization state, needs, condition, perception, intent, bounded memories, population membership, reactions, and physical food-consumption evidence survive save, unload, revisit, and reload without rerolling.
- Version 8 requires its exact canonical ecology and cargo roots with matching integrity and conservation. Missing, aliased, stale, duplicated, or contradictory state is quarantined rather than partially adopted.

### Known limitations

- This is one bounded deer, gull, and black-bear crossing attached to the existing porter-dog web, not a full bestiary or complete worldwide animal population. Additional species, broad habitat generation, reproduction, migration, social groups, and distant ecological opportunities remain later work.
- Animals do not attack, receive injuries, die, or leave carcasses in this release. Hunting, combat, deterrence, capture, treatment, breeding, and a general predator-kill loop are not live.
- The wildlife ABOUT choices are WAIT AND WATCH, ROUTE AROUND THIS SPOT, and LEAVE. The player cannot command, feed, tame, name, own, recruit, or directly manipulate these animals through ABOUT.
- The shared wildlife channel covers bounded visual contact and explicit alarm calls for this crossing. General evidence trails, blood, tracking, social rumor, complete scent ecology, full offscreen predation, and every-species-to-every-species behavior are not live.

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
