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
- Exactly one independently generated domestic dog, paired deterministically with one existing porter for a bounded food-and-rain interaction without making either actor the other's owner or companion.
- Exactly one separate seed-stable settlement working dog in a bounded roster, with its own kennel custody and one generic persisted guardian assignment tied to the existing keeper, two-goat herd, and pen worksite. It does not rewrite the original dog's independent relationship.
- One canonical bounded core-ecology patch whose local deer, gull, black-bear, brown-rat, domestic-cat, domestic-chicken, domestic-goat, marsh-rabbit, marsh-fox, fish-crow, northern-harrier, southern-leopard-frog, Atlantic-silverside, Atlantic-marsh-fiddler-crab, snowy-egret, American-black-duck, and North American river otter populations derive from the seed, exact regional terrain, biome/climate signals, and a stable settlement-adjacent focus. Each wild-species analysis may resolve to ecological absence. Deer, gulls, bears, free-ranging cats, chickens, goats, rabbits, foxes, fish crows, northern harriers, snowy egrets, American black ducks, and river otters use capped persistent individual representatives with stable seed/region/population/ordinal identities, segmented positions, bounded dynamic state, and saved materialized/coarse state. Fish crows use at most three visible representatives and a stable flock record when grouping is viable; the starting settlement owns one stable two-to-three-chicken flock in a coop and one stable two-goat herd in a separate pen; northern harriers, snowy egrets, American black ducks, and river otters each expose at most one representative. The otter requires both tidal aggregate populations plus authenticated usable water and a distinct dry haulout. Brown rats, southern leopard frogs, Atlantic silversides, and Atlantic marsh fiddler crabs instead use stable aggregate populations; no fish or crab actor is synthesized. This remains one local assemblage rather than worldwide population generation or a complete bestiary.
- One released starting-harbor fresh-produce store, bound to an existing settlement, human keeper, and brown-rat aggregate anchor. Its food is one conserved physical settlement-cargo lot rather than a mirror of abstract settlement stock; its open/secured door, keeper knowledge, and completed or pending exact-loss transaction persist under stable identity.
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

This is not universal perception or a universal NPC architecture. The first porter-dog web, separate settlement working dog, and bounded harbor-edge assemblage extend the shared boundary through a narrow set of current consumers: one dog's physical food scent, bounded species-neutral external perception participants, individual-wildlife visual contact, explicit anonymous alarm calls, bounded individual decisions, exact physical scavenging transactions, one generic working-animal assignment, deer/gull/fish-crow signals inside persistent groups, four conserved aggregate populations receiving only declared lawful pressure, role-and-size-aware rabbit/fox/harrier pursuit, and snowy-egret, American-black-duck, or North American river otter actors receiving current anonymous aquatic-activity facts through ordinary visual occlusion. A fish crow can alarm at a directly perceived aerial predator; only that causally retained, directly visible behavior can become mobbing pressure that interrupts a northern harrier. A working dog may investigate an anonymous alarm area, but a fox is deterred only after lawfully seeing the dog. Current physical evidence is limited to directly observable rat/frog area signs, silverside surface activity, fiddler-crab burrows or feeding scrapes, rain-response cat pawprints, rabbit paired tracks, and fox canid pawprints. Fish crows, harriers, snowy egrets, American black ducks, river otters, and the working dog do not invent ground tracks or calls. General scent fields, broad evidence and tracking, social reports and rumors, broad cross-group communication, physical human pursuit/search pathfinding, human-to-human sensing, generated people beyond the original estuary, additional dogs beyond the current two, worldwide wildlife populations, the full bestiary, wider ownership and social networks, general physical NPC inventory, negotiation, guaranteed deterrence, foliage consumption, complete circadian life, and companion behavior remain later slices.

## First porter-dog living web

The game host creates one dog from the root seed, the selected existing porter's immutable origin identity, and stable regional generation inputs. Dog identity, actor address, needs, condition, perception, intent, bounded memory, player knowledge, and persistence tier are distinct from the porter's resident state. Their deterministic pairing is an interaction fixture, not ownership, adoption, or a companion relationship. Full-detail movement and new sensing are limited to the bounded loaded interaction window; promoted state preserves earned history without claiming a full coarse animal population simulation.

The dog receives a classified physical-food scent observation rather than a true food coordinate. Scent strength and uncertainty derive from the porter's conserved dried-fish pack, pack containment, distance, wind, and rain. The dog may take one bounded step toward a perception-derived belief area only across the shared traversability surface; invalid coordinates, deep water, blockers, or an unavailable path fail closed. Rain also updates bounded wetness and cold condition. The porter separately requires lawful, occlusion-tested visual contact with the dog before considering an actor response.

Chart and Relief render and hit-test the same direct-detail dog projection by stable actor ID. The non-pausing ABOUT surface distinguishes UNKNOWN DOG from FAMILIAR DOG and reveals only observed appearance, condition, behavior, and earned history. Losing exact sight removes the marker, target, and actions immediately.

The player-choice reducer exposes exactly five actions: **ASK FOR HELP**, **SUGGEST SECURING BELONGINGS**, **WAIT AND WATCH**, **ROUTE AROUND THIS SPOT**, and **LEAVE**. The first two record bounded requests; they do not command the porter or mutate inventory directly. Porter response, pack closure, any offer, dog consumption, memory, promotion, and custody commit through the same accepted world step. A successful offer moves exactly one dried-fish unit from the porter's container to the dog's container before consumption, and replay cannot mint a second unit. Route-around requires a current automatic route and replaces it with a real path to the same destination that avoids the observed dog area; if no valid detour exists, the old state is retained.

## Settlement working-dog composition

`src/game/dogActorRoster.ts` owns a bounded canonical collection for dog bodies
outside the original BIO0 relationship. Alpha 26 puts exactly one seed-stable
dog in that roster. Its actor state remains the existing `DogActorState` shape:
identity, segmented address, needs, condition, perception, intent, memory,
knowledge, and update tick. The roster creates no identity, infers no owner, and
cannot absorb the original independent dog.

Settlement ecology version 4 extends the typed domestic-home vocabulary from
`coop | pen` to `coop | kennel | pen`. One third custody binds the settlement,
existing keeper, roster dog, and kennel; the chicken and goat relationships
remain distinct. `src/game/settlementWorkingAnimals.ts` separately owns a
generic versioned assignment, not the actor body or livestock group. Its first
record binds the worker, handler, worker custody, protected goat custody and
group, pen worksite, duty area, role, and current or pending exact-once activity.
The role vocabulary currently contains only `guardian`, but the persistence and
arbitration boundary is species-neutral for addressable nonhuman actors.

The work arbiter consumes canonical actor perception and normalized welfare.
It may accept `watch`, `investigate`, `return`, `survival-override`, or
`defer-to-actor`; an investigation copies only an accepted observation ID and
uncertain area, never an emitter, threat identity, exact point, or protected
target. Staging and resolution are transactional, replay is inert, and load
recovers one pending acceptance without repeating perception, choice, or
movement. Ordinary dog cognition remains the self-preservation authority:
retreat, shelter, human avoidance, rest, inaccessible terrain, or urgent
welfare can supersede assignment work. Feeding and drinking actions stay
dormant because this slice has no physical settlement remedy for them.

Alpha 27's additive task lifecycle turns a committed investigation into one
bounded record rather than a second behavior tree. It retains the source
observation, uncertain perceived area, and a deterministic search probe derived
by the shared locomotion owner. Physical arrival at that probe records a
completed result and starts return toward the canonical pen worksite. A narrow
keeper policy may instead request cancellation after the investigating dog
leaves its duty area, but the transition is lawful only when worker and handler
hold fresh reciprocal identified visual beliefs. Arrival at the worksite waits
for a current handler observation before acknowledgement closes the task.

Task opening, suspension, resumption, completion, cancellation, arrival, and
acknowledgement share one exact-once staged transition contract. Actor-owned
intent or normalized welfare may suspend an open task and later resume it;
neither can manufacture a terminal result. The root retains at most one current
task, one pending transition, and one latest closed outcome, bounding both save
growth and replay surface. This is handler-aware relationship state over the
existing actor, cognition, perception, welfare, and locomotion owners—not a
remote command bus, herding system, full schedule, autonomous kennel-life
routine, combat system, mortality system, or guarantee of livestock safety.

`src/game/coreEcologyPerception.ts` now admits bounded external actors through
ordered `{ address, contactScope }` participants and indexes visual candidates
in deterministic local buckets. Core wildlife and opted-in external actors can
therefore perceive each other without a dog field, species-pair detector, or
unbounded scan. Investigation and escape use the shared living-actor
traversability, search-probe, and locomotion owners, including signed segmented
coordinates and fail-closed deep-water barriers. The representative chain is
causal: a rabbit alarm reaches the dog anonymously; work may move the dog toward
that perceived area; the fox retains pursuit until its own lawful contact sees
the dog; only then can shared appraisal redirect it. This is incidental
deterrence, not an attack, guardian aura, or livestock-safety guarantee.

Dog presentation composes an authenticated current work activity without
rewriting actor intent. Chart and Relief consume the same direct-detail dog
projection, while ABOUT can say only `Watching`, `Investigating something
nearby`, or `Returning nearby` at the current tick. It exposes no assignment
graph, alarm source, internal needs, hidden threat, or remote dog marker.

## Bounded domestic-animal recovery composition

Released Alpha 28 adds one versioned
`settlementDomesticAnimalRecovery` owner around the existing goat herd,
keeper, pen, custody, and working dog. An in-frame exact herd split may occur
only when a member is currently fleeing or retreating because of a lawful cause
and the members are separated beyond the shared threshold; distance alone is
insufficient. A separated member may select the shared `regroup` intent only
from current identified sight of its exact group peer, while danger, escape,
shelter, and urgent physiology remain higher priority. Presentation maps that
internal intent to neutral focused movement rather than exposing a hidden
system state.

The recovery owner retains at most one current case, one pending exact-once
transaction, and one latest result. The keeper must lawfully observe the
separation before a case can be noticed. Only an explicit report of the
observed last-known area may recruit the existing working dog into its ordinary
search; recruitment conveys no remote livestock marker and search completion
does not authenticate a find. The same exact goat bodies can rejoin through
shared group topology. Current caretaker sight of all members inside the
canonical pen confirms closure; a retained already-known case may also consume
an authenticated coarse reunion transition without pretending the keeper saw
the off-frame event.

Core-wildlife materialization treats a social group as one indivisible cap
candidate. Every exact member is admitted together or the entire group remains
coarse, preventing partial rendering or partial local cognition. Coarse bodies
retain exact identity and group topology but cannot perceive or move locally;
their group-level transitions remain available to existing authoritative
owners. This is a bounded starting-harbor composition, not herding, a full home
routine or schedule, guaranteed recovery, a player search command, remote map
tracking, attack, injury, mortality, carcasses, new calls or tracks, or
cross-region animal ecology.

## Bounded habitat-derived core-wildlife assemblage

`src/sim/coreWildlifeIdentity.ts` owns generation-v1 profiles for deer, gull, black bear, brown rat, domestic cat, domestic chicken, domestic goat, marsh rabbit, marsh fox, fish crow, northern harrier, southern leopard frog, Atlantic silverside, Atlantic marsh fiddler crab, snowy egret, American black duck, and North American river otter. Persistent individual identity applies to deer, gulls, bears, cats, chickens, goats, rabbits, foxes, fish crows, northern harriers, snowy egrets, American black ducks, and river otters; brown-rat, southern-leopard-frog, silverside, and fiddler-crab metadata explicitly select aggregate representation, so none can pass through the individual actor constructor. Individual identity derives from the root seed, signed origin region, semantic population key, population ordinal, species, and generation version—not array order or camera entry. Profiles supply bounded ecological roles, food affinities, behavior thresholds, morphs, temperament pairs, and individual trait ranges where those concepts apply. Domestic chickens declare domestic-livestock, omnivore, forager, prey, small-prey, and alarm-source roles; domestic goats declare domestic-livestock, herbivore, forager, prey, and alarm-source roles. Neither receives attack, capture, mortality, reproduction, schedule behavior, or unsupported foliage consumption. Current outcomes remain bounded to lawful observation, nonlethal pressure/avoidance, movement, group alarm, or authenticated physical-resource claims. `src/game/livingSpeciesRegistry.ts` is the lean runtime roster for nineteen current source records: human, domestic dog, deer, gull, black bear, brown rat, domestic cat, domestic chicken, domestic goat, marsh rabbit, marsh fox, fish crow, northern harrier, southern leopard frog, Atlantic silverside, Atlantic marsh fiddler crab, snowy egret, American black duck, and North American river otter. It owns representation and addressability as well as presentation, locomotion, ABOUT nouns, and relative senses. `src/game/livingSpeciesCatalog.ts` gives the same exact roster a strict versioned contract without treating any aggregate population as an actor. Every core-wildlife module declares every broad interaction target class in canonical order as either supported or an intentional no-response; an omitted row cannot acquire fallback behavior. Roster drift, an addressable aggregate, or a missing required sense or interaction contract fails closed. The catalog contains no planned species and does not imply absent health, death, full circadian behavior, ecological migration/reproduction, foliage-consumption, or worldwide-habitat capabilities.

`src/game/livingSpeciesReleaseGate.ts` authenticates build-owned evidence for that exact roster against 30 stable completeness criteria. A structurally valid caller claim cannot mark itself ready, absent behavior cannot smuggle an evidence owner, and biologically inapplicable criteria require narrow ecological proof. The rat and cat records may claim only the connected Settlement Shadows owners; the rabbit and fox records retain their bounded Alpha-16 owners; and the crow, harrier, frog, egret, duck, otter, chicken, and goat records may claim only their actual habitat, policy, activity, perception, movement, aggregate, custody, materialization, presentation, persistence, mobile, performance, and representative-scenario owners. Separate bounded reports authenticate Wave B, the Tide Table, the Alpha-20 duck, Alpha-21 otter, Alpha-22 convergence, Alpha-24 domestic-chicken unit, and Alpha-25 shared-livestock unit without promoting those scopes to worldwide ecology. The Alpha-25 witness covers plural custody and typed homes, a separate two-goat herd and pen, exact Alpha-24 preservation, lawful perception, shared terrestrial locomotion and alarm, broad-class interactions, deterministic resource contention, save migration, knowledge-honest presentation, local continuity, executable shared-invariant coverage, bounded performance, and explicit exclusions. It cannot authorize sound, tracks, harmful attack, injury, mortality, carcasses, live-prey capture or consumption, foliage browsing, milk, wool, eggs, nesting, reproduction, herding, guardian behavior, full schedules, home return, ecological cross-region migration, worldwide livestock, full Wave D, or Directive-04_1 completion. Immutable build-owned publication fields remain false because a bundle cannot attest its own post-deployment byte identity. Signed coordinate/frame continuity remains distinct from unsupported ecological cross-region migration. Shared invariants, deterministic properties, conservation, bounded fuzzing, and representative scenarios exercise the architecture without a species-by-species or quadratic animal-pair matrix. Same-species breadth, broad food-web turnover, complete multisensory coverage, health/death, worldwide ecology, foliage consumption, and full circadian life stay blocked where absent. This is a fail-closed development boundary, not a player statistic or a claim that one harbor-edge assemblage implements the eventual catalog.

`src/game/coreEcologyHabitat.ts` preserves the frozen Wave-A analysis for deer, gulls, and black bears, the version-2 harbor-edge extension for brown rats and domestic cats, the version-3 marsh-rabbit and marsh-fox extension, the version-4 fish-crow, northern-harrier, and southern-leopard-frog extension, the version-5 Tide Table extension, version-6 American-black-duck habitat, and version-7 North American river otter habitat. Habitat version 8 preserves the complete version-7 population and anchor record as an exact prefix, then appends one deterministic domestic-yard anchor and one two-to-three-member domestic-chicken population. Habitat version 9 preserves that complete record exactly before appending one separate pen anchor and exactly two domestic-goat individuals in one herd. Unlike terrain-derived wild habitat, both domestic populations are supported by the existing starting-settlement relationship; the stable world seed, signed origin, settlement focus, and generation version derive their anchors and allocations. The pen remains separated from the yard and every established individual allocation. Each animal receives one individual allocation, all members share the existing individual occupancy plane, and each population is represented by one stable group. Existing rat, frog, fish, and crab populations retain their aggregate occupancy planes and all tidal metadata remains exact. Inputs are call-order independent and valid at signed extreme region addresses; the runtime rederives the expected habitat on load and rejects a mismatch instead of accepting a reroll.

`src/game/coreEcology.ts` owns the aggregate-capable patch. Alpha 29 advances the core patch to version 3 and the aggregate record to version 5 while retaining hard limits of 13 individual populations, 48 exact representative members, 24 materialized actors, four aggregate populations, four anchors per aggregate, 24 retained evidence records, and 16 retained disturbances. Each representative declares the population units it represents; canonicalization requires exact conservation. One committed individual death transfers exactly one represented unit into the mortality ledger, retires that actor, and leaves any remaining units as abstract reserve rather than collateral death or replacement actors. Alpha 28's atomic social-group materialization remains: every member enters full detail together or all remain coarse. Current group-member death fails closed. Candidate input order and camera traversal cannot decide who exists. A coarse individual receives no local observation frame and cannot invent a sighting, target, contact, resource claim, movement, or decision.

`src/game/coreEcologyGroups.ts` adds one persistent herd or flock record when a derived deer, gull, fish-crow, domestic-chicken, or domestic-goat population has at least two representatives; black bears, northern harriers, snowy egrets, American black ducks, and North American river otters remain solitary. Crow, chicken, and goat groups use separate stable `CROW-FLOCK`, `CHICKEN-FLOCK`, and `GOAT-HERD` namespaces while preserving the shared membership, cohesion, phase, component-anchor, signal, split/rejoin, and aftermath contracts. Signals reach additional members only on exact coarse cadence rather than setting every hidden target at once. A fully coarse group may still undergo its bounded player-absent, nonlethal, cargo-neutral pressure transition; it remains unavailable as automatic player knowledge. In current detailed simulation, a split additionally requires a caused flee/retreat and exact separation, while distance alone is inert. Cohesion can later produce a saved reunion, and that transition is propagated through coarse stepping for an already-authoritative consumer. Full-to-coarse reconciliation copies lawful member positions into the group anchors; coarse-to-full return reuses the same actor IDs and places members around their saved component anchor without duplication. No authored home-return schedule exists: settlement custody is stable social/home authority, not a second movement controller.

`src/game/coreEcologyPerception.ts` converts current in-window visual contacts into the same classified observation vocabulary used by living actors. Terrain, structures, facing, weather visibility, and static target light affect current visual contact; target movement salience and species-specific visual acuity are still narrow inputs rather than a complete universal sensory field. In released Alpha 22, its Tide Table bridge selects a currently materialized surface observer only through the generic conjunction of `actor-address`, `surface-opportunity`, and `tidal-activity` runtime capabilities. It can then add a same-tick anonymous `aquatic-activity` visual fact—presently for a gull, snowy egret, American black duck, or North American river otter—only when an occupied, active, depth-usable fish or crab anchor passes the same direct line-of-sight test. The fact contains an approximate area but no aggregate identity, species, exact count, or actor ID. This observation capability alone does not grant aquatic locomotion, aquatic-foraging pressure, capture, or consumption. `src/game/coreEcologyTrophic.ts` then resolves only ecologically actionable relations from shared roles, runtime capabilities, and explicit physical size classes. Bears remain large-predator pressure to prey, dogs, humans, and smaller predators; a domestic dog can pressure a rabbit or fox; a fox, cat, or northern harrier can recognize eligible small prey; a snowy egret can exert wader pressure; and the otter's broad aquatic-foraging role can exert nonlethal pressure on both tidal aggregates. The duck and gull perception contracts stop at lawful anonymous aquatic activity. A fish crow directly seeing a northern harrier can emit a shared alarm. Only a crow whose retained identified direct-vision alarm still names that aerial predator presents `mobbing-pressure` back to the harrier; mere co-presence does not. That pressure can interrupt a finite nonlethal harrier pursuit without classifying the crow as prey. Other committed alarms propagate through bounded, weather/wind-modified hearing as anonymous approximate areas with no emitter ID/species, hidden target, or internal motive. The active set is tightly capped; broader density still requires spatial buckets instead of all-pairs scanning.

`src/game/coreEcologyAggregatePerception.ts` is the sole runtime bridge from current world truth into the four aggregate populations: brown rats, southern leopard frogs, Atlantic silversides, and Atlantic marsh fiddler crabs. Each materialized visual source enters as one canonical, addressable living species; unknown species and non-addressable aggregates fail closed. Existing terrain/weather occlusion resolves per-anchor contact before `src/game/coreEcologyAggregatePolicy.ts` derives a response from shared runtime capabilities, ecological roles, and trophic size classes rather than a source-species allowlist. A marsh fox can therefore exert predator pressure on the two pre-Wave-C small-prey aggregates, while a snowy egret or North American river otter can exert its declared nonlethal pressure on the two tidal aggregates; neutral co-presence produces no stimulus. The capability-selected aquatic-observation side of the same bounded bridge serves the gull, egret, duck, and otter without species-specific fish detectors; only the egret and otter possess current roles that can turn that observation into aggregate pressure. The bridge also derives rat attraction only from currently existing loose provision objects through the shared wind- and rain-shaped scent evaluator, and weather pressure from authoritative rain plus each saved anchor's terrain exposure. It submits a bounded canonical stimulus frame rather than giving any aggregate kernel access to actor lists, player state, weather, or cargo. `src/game/coreEcologySmallWorld.ts` then applies species-owned response rules while retaining canonical `cat` and `dog` aliases in its transient stimulus/event payloads and the v2 shape for pre-existing rat interactions; no serialized event record depends on those aliases. Rats retain bounded attraction, quieting, and density spacing; rain raises an extant frog area's activity; and lawful pressure can quiet or redistribute only an existing eligible unit on the species' fixed cadence. A tidal fish destination must additionally be usable at the current depth. Identity, total units, and anchor custody remain conserved. Every disturbance records no mortality, cargo interaction, item consumption, or automatic player knowledge. These are aggregate population responses, not individual cognition, capture, or feeding.

`src/game/coreWildlifeActor.ts` turns accepted observations, bounded needs/condition, generated temperament, role affinities, runtime capabilities, and action accessibility into alarm, flee, retreat, guard, scavenge, forage, bounded pursue, rest, observe, or disengage. A proposal never mutates another actor or item. Rabbits retain causal alarm and flight; hungry foxes retain finite small-prey pursuit and pressure-based interruption. Alpha 29 leaves decision ownership intact: only the separate mortality resolver may translate an extant current fox pursuit plus exact rabbit contact into damage. Fish-crow alarm/mobbing, nonlethal harrier pursuit, cat food competition, and rain retreat retain their prior bounded rules.

`src/game/coreWildlifeMortality.ts` is the narrow species-neutral harm kernel.
It accepts only a named `predator-contact` event backed by the current exact
attacker and target, current identified direct-vision belief, matching active
pursuit/resource link, and exact physical contact. The current runtime policy
permits only a marsh fox against its individually represented marsh rabbit;
stale, anonymous, hidden, aggregate, non-pursued, or group-member candidates
fail closed. It produces injury or death without deciding population or body
state.

`src/game/coreEcologyMortality.ts` owns the exact-once ecological transaction.
A death stores the retired actor, named event, represented-unit accounting,
exactly one removed population unit, any remaining abstract reserve, and the
stable body identity. Replay cannot retire the actor or remove a unit twice.
`src/game/coreWildlifeCarcass.ts` owns one finite physical body per death event:
the stable carcass ID and death position do not reroll, original resource equals
remaining plus consumed plus decayed resource, claims are exclusive, and
feeding consumes one authenticated unit. A depleted record remains as a
finite tombstone rather than spawning new food. The live runtime currently
connects ordinary direct vision, shared reach, claim, feeding, and fox guarding
for marsh foxes and fish crows only; it does not schedule decomposition or
support body drift, dragging, harvesting, scent, insects, or other bodies.

`src/game/wildlifeCarcassPresentation.ts` derives Chart and Relief projections
only from the player's current lawful direct-detail perception. It may expose a
species body or remains when current clarity supports that identification,
otherwise only a generic animal body/remains. It never discloses the attacker,
cause, hidden resource count, claimant, or offscreen history. Direct injury,
death, and feeding announcements use the same event-time observation law;
returning later may reveal the persistent body but never creates retrospective
narration.

`src/game/coreEcologySpeciesRuntimePolicy.ts` composes representation, addressability, locomotion, group organization, aggregate response, food investigation, shared alarm, mobbing, pursuit, activity, evidence, and presentation capabilities without a species-pair behavior table. `src/game/coreEcologyAggregatePolicy.ts` separately owns aggregate namespaces, anchor bounds, activity/evidence vocabulary, rain response, and the shared role/trophic response bridge, so aggregate consumers do not branch on ad hoc species checks. `src/game/coreEcologyTidalTable.ts` owns only the pure target-tick tide/depth projection and its conservation-safe fish redistribution/activity step; it neither regenerates habitat nor owns cargo, consumption, or mortality. Its completed tidal-edge opportunity is recorded in the durable aggregate operation clock even when no unit moves. Released Alpha 22 adds `src/game/coreEcologyActivityAffordance.ts` as the data-and-capability owner for six reusable archetypes: `perch-watch`, `low-quartering`, `tidal-wader`, `dabbling-waterfowl`, `shore-water-forager`, and `aerial-surface-opportunist`. Each profile declares required runtime capabilities, locomotion class, allowed travel media, destination authority, observation affordance, presentation signals, and only a bounded daylight/rest window. Unknown species and incoherent capability/profile combinations fail closed. `src/game/coreEcologyActivity.ts` consumes those profiles for five birds plus the river otter, and a shared finalizer rejects any emitted signal, movement medium, destination semantic, perch claim, or observation reference outside the selected profile before it can reach movement or presentation. Immediate lawful alarm, flee/retreat/guard, pursuit/disengagement, and physical-food forage/scavenge intents outrank neutral activity. Otherwise a crow can return to its authenticated perch, a harrier follows deterministic low-quartering targets, a snowy egret uses a lawful wading edge or refuge, an American black duck uses eligible water or refuge, the otter uses its authenticated foraging-water or dry-haulout anchor, and a gull uses air only to circle a currently observed surface opportunity or return to its authenticated habitat anchor for rest. The gull's transit presentation remains generic flight until circling is directly inferable at the destination; its private cue never becomes player knowledge. This is not sleep, denning, a nocturnal schedule, capture/feeding resolution, or the complete circadian system.

`src/game/coreWildlifeLocomotionProfile.ts` layers species-shaped cost and gait data over one shared path resolver. The egret travels between an authenticated wading target and refuge through the aerial surface. The duck uses either bounded air or currently traversable `surface-water`. The otter selects the reusable `amphibious` medium: deep nonstandable water uses surface-water cost, while land and standable shallows use the ordinary terrain surface, allowing one actor to travel from dry haulout to water and back without an otter-specific pathfinder. A successful rabbit or fox relocation can atomically retain one rate-limited paired-track or canid-pawprint record at the destination; stationary actors cannot mint movement signs. Fish-crow, harrier, egret, duck, and otter movement deliberately produce no new ground evidence. Every retained individual-wildlife sign keeps immutable source strength while its visible clarity falls deterministically to exact expiry after 180 ticks, identically across full simulation, coarse time, save, and reload. This release adds no wake-as-evidence, attack/contact outcome, capture, fishing, injury, mortality, carcass, live-prey consumption, hunting, foliage consumption, ecological migration/reproduction, nesting, or reward loop.

When the habitat assemblage contains a bear, the runtime seeds one exact loose dried-fish parcel near it. Visual evidence can make that parcel a food opportunity for an eligible bear, gull, fish crow, or river otter, but only an identified, directly confirmed, accessible whole unit may produce a claim. The cargo owner rechecks exact segmented contact, payload kind, quantity, and current existence before atomically committing one custody path and any lawful ordinary-food consumption. Sorted claims, replay protection, and exact custody ensure a second actor or reload cannot consume another copy. The otter is deliberately only another consumer of this generic seam, not an owner of private loot or cargo rules. A malformed claim, partial stack, consumed item, or out-of-reach seam case leaves both cargo and ecology unchanged. Aggregate attraction never consumes, moves, aliases, or duplicates one. Player-facing narration is emitted only when the event-time actor was directly visible; otherwise authoritative history remains silent to the player.

Chart and Relief project the same direct-detail individual wildlife set and use species plus stable ID for selection. Domestic cats, domestic chickens, domestic goats, marsh rabbits, marsh foxes, fish crows, northern harriers, snowy egrets, American black ducks, and North American river otters receive distinct color-independent low-cost forms and the ordinary wildlife choices: **WAIT AND WATCH**, **ROUTE AROUND THIS SPOT**, and **LEAVE**; gulls retain their established flock form and the same direct-detail gate. Each visible crow, gull, chicken, or goat representative renders and hit-tests once; its group summary never manufactures decorative copies or extra targets. The duck and otter likewise render and hit-test as one addressable individual each and never receive a group suffix or hidden census. Authenticated perch, low-quartering, egret flight/refuge/wading, duck floating/scanning/dabbling/resting/surface-swimming/relocation-flight, otter foraging/diving/shore-water/resting, and candidate gull surface-circling/habitat-rest states have distinct presentation. Gull circling remains air-only and ABOUT reports only the authenticated visible behavior, never the anonymous observation's hidden source. At uncertain clarity the otter remains an unidentified aquatic mammal; direct ABOUT can identify its visible low-slung form and authenticated behavior without exposing a private target, exact trait, aggregate count, or stable ID. Rat/frog-area evidence, silverside surface activity, and fiddler-crab burrow or scrape evidence remain aggregate target types; cat/rabbit/fox tracks remain non-targetable. Mouse/touch and Chart/Relief share the same projection, reduced motion preserves the same facts, and loss of sight clears the ephemeral target.

`src/audio/soundscape.ts` adds an original fish-crow nasal double call and southern-leopard-frog chorus beside the earlier ecology cues. A crow call plays only for a causative new alarm transition witnessed at event time. The frog chorus is different: current rain raises the activity of an extant frog area, but that same rain contributes ambient masking when the shared hearing evaluator decides whether the player can hear it. At most the strongest lawful source produces one stereo cue and a species-anonymous caption such as `[chorus nearby — east]`. Caption direction and uncertainty-attenuated pan derive from the same heard-bearing band; a co-located or insufficiently resolved contact says `all around` or `direction unclear` rather than inventing a cardinal fact. Aggregate identity, exact coordinates, and hidden population remain undisclosed. The northern harrier, American black duck, and North American river otter have no fabricated calls in this release. These are redundant presentation cues and never permission to reveal hidden motives or activity outside legitimate sight/hearing.

## First settlement-store ecology composition

Released Alpha 23 adds no species. `src/game/settlementEcology.ts` owns one bounded starting-harbor store record with a stable store ID, the actual existing keeper's actor ID, one nearest saved brown-rat aggregate anchor, an open-or-secured closure, bounded keeper evidence, and the sole physical fresh-produce carrier. That carrier uses ordinary settlement cargo custody and does not alias or subtract from the settlement simulation's abstract food counter. The store source adapter exposes only the physical lot's source strength and door-dependent packaging leakage; the existing aggregate-perception owner still resolves wind, rain, distance, uncertainty, and whether any scent lawfully reaches the rat aggregate.

An open store with a matching scent observation may propose attraction, but the existing Settlement Shadows owner remains responsible for aggregate response and can relocate at most one already-existing rat unit on its ordinary opportunity. Only a matching authenticated relocation event may stage a store-loss transaction. Resolution atomically removes at most one exact physical produce unit for that event, retains the same conserved rat population, rejects an unrelated lot, and treats a replayed committed transaction as inert. An existing domestic cat's lawfully visible presence may separately pressure the rat aggregate through the shared visual/trophic policy; the cat receives no rat-sign cognition, hidden rat fact, private target, or new investigation proposal.

The knowledge kernel admits only an authenticated direct keeper observation or an explicit in-person player report. Alpha 23's playable runtime wires the report path: it is offered only while the player is physically near both the store and its actual keeper, and a remote settlement selection cannot command them. Autonomous keeper observation is not generated in this slice. Applying the response persistently secures the door and reduces later store leakage to zero without deleting the store, remaining food, rats, or cat pressure. Chart and Relief derive the same store mark and closure from this state. Store detail, the keeper action, and any loss narration remain gated by current lawful proximity or event-time observation, so returning later cannot turn unseen history into an EVENTS report.

This slice validates a reusable owner boundary through shared abstraction checks, a bounded signed-coordinate property sweep, exact item and aggregate conservation, deterministic migration/replay, and one representative store-rat-visible-cat composition. Existing shared bounded-fuzz and performance gates remain in the regression suite. It is not an exhaustive species or animal-pair matrix, worldwide settlement ecology, schedules, livestock, rumors, harmful attack, injury, mortality, carcasses, live-prey consumption, the full bestiary, or Directive 04_1 completion.

## First domestic-yard flock composition

Alpha 24 extends the same boundary with one stable two-to-three-member domestic
chicken flock at the starting storehouse. `src/game/coreEcologyHabitat.ts` owns
only deterministic placement and individual allocation; the shared wildlife
actor owns needs, attention, memory, and intent; the shared locomotion profile
and terrain solver own movement; and the shared group owner owns flock identity,
membership, alarm propagation, separation, and reunion. No chicken-to-species
detector or pair table is introduced. The catalog exposes broad human, dog,
predator, food, and same-species relations, and explicit no-response rows close
every other target class.

`src/game/settlementEcology.ts` version 2 adds one canonical domestic-custody
record that binds the existing settlement, keeper, stable flock ID, sorted
member IDs, yard home position, and bounded home radius. Custody neither owns
animal cognition nor aliases the physical store inventory. While the door is
open, a custody member may receive a direct identified food opportunity for the
exact produce-lot ID. It still has to select forage through ordinary attention,
move through the shared terrestrial solver, and reach the same three-tile
Euclidean structural-access footprint before a claim can resolve. A secured
door creates neither the opportunity nor a food belief.

Domestic food use is an exact staged transaction carrying store, food lot,
custody relationship, flock member, one-unit quantity, cause event, tick, and
monotonic ordinal. Resolution decrements only that physical lot and lowers only
the consuming actor's hunger after commit; replay is inert and malformed,
out-of-custody, out-of-reach, secured, stale, duplicate, or overdrawn claims fail
without partial mutation. Event presentation uses the current direct-detail
projection: a witnessed bird and meal may enter EVENTS, while the same valid
offscreen transaction remains silent to the player.

Outer session version 17 adopts a sealed version-16 Storehouse Door world once.
The complete habitat-7 population/anchor record and every existing actor, group,
aggregate unit, item, Promise, store/lot identity, closure, keeper fact, and loss
ordinal remain exact before habitat 8, the flock, and custody relationship are
appended. Reload cannot reroll flock size or identity, duplicate the group or
food, replay a meal, or reopen the store. Validation intentionally uses shared
invariants across signed/extreme coordinates, migration and replay attacks,
physical conservation, bounded performance, and one representative visible
yard event. It does not attempt an N² species matrix and does not claim calls,
tracks, attacks, injury, mortality, carcasses, live-prey consumption, eggs,
nesting, reproduction, herding, guardian behavior, schedules, autonomous home
return, cross-region migration, worldwide livestock, full Wave D, or Directive
04_1 completion.

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
2. `tideweft-session` contains the serialized world plus player motion/cargo/report/chart/Wayknot state, tutorial state, chosen posture, a legacy-compatible session-shape field, recap history, a sealed pending-perception carry, the first living web's dog ecology, porter response, player-choice state, the canonical core-ecology patch, settlement ecology, the separate dog roster, and settlement-working-animal state. Released Alpha 26 advances the outer session to version 19 and settlement ecology to version 4 while habitat analysis remains version 9 and aggregate ecology remains schema version 4. A sealed version-18 Far Paddock envelope is authenticated before one deterministic dog body, kennel custody, and generic guardian assignment are appended. Every habitat-9 population and anchor, prior actor, group, aggregate unit, item, Promise, evidence record, store fact, world fact, chicken and goat member, flock, herd, coop, pen, keeper, prior custody, and physical food-use transaction remains exact. Version 19 strictly persists both new roots and recovers one pending assignment activity exactly once; reload cannot reroll or duplicate the dog, relationship, assignment, activity ordinal, movement, group, structure, or provision. Versions 1 through 17 continue through their established frozen one-way migrations before this final adoption. Spatial top-K core-wildlife materialization remains a deterministic projection from local distance with stable actor identity breaking ties and does not rewrite authoritative coarse state; the separately bounded dog roster is not a hidden expansion of that habitat population. The sealed regional-travel payload remains version 2 and stores the exact global origin of the 120 × 120 presentation frame; valid version-1 98 × 74 payloads migrate into a player-centered frame without moving the courier or changing chart knowledge. It does not serialize derived Tide Harps, biome profiles, target-tick tidal depths, or the current materialized-detail selection.

Released Alpha 27 advances only the outer session to version 20 and
the working-animal root and assignment records to version 2. A sealed
version-19 Paddock Watch payload is authenticated and adopted by appending empty
task-lifecycle fields without changing the stable assignment identity or any
prior actor, habitat, group, home, custody, item, Promise, evidence, store, or
world fact. Task, transition, and bounded latest-outcome records begin at
version 1. Current records authenticate their worker, handler, source activity
and observation, uncertain area, search probe, worksite, cause, suspension,
outcome, and monotonic ordinals. One saved pending task transition recovers
exactly once without rerunning sight, geometry, movement, handler authority, or
outcome. Habitat 9, settlement ecology 4, aggregate ecology 4, the nineteen
species records, and the dog roster remain unchanged.

Released Alpha 28 advances the outer session to version 21 and
appends an empty version-1 domestic-animal-recovery root to an authenticated
sealed version-20 Watch Returns payload. Every existing species, actor,
population, habitat, group, home, custody, assignment, task, item, Promise,
evidence record, store fact, and world fact remains exact. The new root accepts
at most one current case, one pending transaction, and one latest result, all
bound to exact actor, group, custody, home, incident, report, and monotonic
ordinal identities. Pending recovery commits exactly once. Neither reload nor
migration can reroll a lawful absence observation, last-known area, guardian
recruitment, group reunion, or caretaker confirmation. Habitat 9, settlement
ecology 4, aggregate ecology 4, the nineteen species records, and all existing
actors remain unchanged.

Released Alpha 29 advances the outer session to version 22, the core-ecology
patch to version 3, and its aggregate record to version 5. An authenticated
sealed version-21 Missing Goat payload preserves every existing actor,
population, representative, group, reserve, home, relationship, task, recovery
case, item, Promise, evidence record, store fact, and world fact before empty
mortality and physical-body state is appended once. Current records bind one
retired actor, one-unit population consequence, named damage/death cause,
stable body ID and position, finite original/remaining/consumed/decayed
resource equation, claim, and event ordinals. Reload cannot reroll the result,
resurrect the actor, remove another population unit, duplicate or relocate the
body, restore consumed resource, or create player knowledge of an unseen event.
Habitat 9, settlement ecology 4, working-animal state 2, and the nineteen
species records remain unchanged.

The runtime currently writes one `autosave` slot on a world-tick interval, page visibility loss, page exit, title return, and Quiet Hour. It loads that slot for the Continue card and never simulates offline time.

The browser repository is local-first: it prefers IndexedDB and mirrors into localStorage. A compact local version fence stores the newest era/generation/timestamp/tick tuple and full-record fingerprint. Cross-store reads reconcile only after both configured stores are readable: known fence rollback produces `NewerSaveUnavailableError`, equal-version differing records produce `ConflictingSaveCopiesError`, and any partial or total read failure remains an unknown-authority error rather than trusting a plausible survivor. Record writes reject older or equal-version-different snapshots with `StaleSaveWriteError`. Overlapping runtime save requests coalesce to the newest complete snapshot behind the in-flight write, and only success for the latest requested sequence in the active era/generation clears persistent failure UI.

A separate versioned localStorage deletion journal is written before best-effort backend cleanup, so an inaccessible stale IndexedDB copy cannot reappear in a later repository instance; only a strictly newer save clears that marker. Deliberate replacement versions order by nonnegative safe-integer era, generation, timestamp, then play tick, allowing a saturated generation to carry into a new era without wrapping. A valid record whose session payload is unreadable, or a pair of different records claiming the same version, enters explicit recovery: neither world is adopted, the title requires a non-empty seed, and the visible six-surface warning remains until the higher-version replacement is durable. A generic repository read failure instead means absence is unproven: runtime creation, resume, lifecycle saves, and manual saves are blocked; the title disables Continue and both world-creation forms; and the player receives a persistent reload instruction. A stale running tab similarly enters a terminal reload-required state and never loops retries against the newer copy. Repository operations clone records, sort summaries deterministically, and isolate malformed data. The platform export/import envelope has a version, 20 MB limit, slot/metadata validation, future-format rejection, and object-URL cleanup. The current UI does not expose those import/export helpers yet.

The published checkpoint makes every new world perpetual and removes the 10/25-minute Drift/Weave title choice. `SessionShape` deliberately remains `drift | weave | wander` in the save/view contract: valid older values load and round-trip unchanged, while runtime objectives and milestone handling ignore them and remain open-ended. New saves use `wander`. Quiet Hour remains a voluntary save/recap boundary, and no server or cloud dependency is introduced.

Unsupported simulation versions fail rather than being guessed into a current world. Explicit checksum-first migrations preserve the prior 64 × 48 world under current Tide Choir rules; no migration silently regenerates terrain from its seed.

## Dual p5 presentation

Released Alpha 29 projects the same authoritative physical carcass through Chart and
Relief only while current direct-detail perception permits it. Both views use
the same body ID, world position, species-clarity boundary, and depleted/remains
state. Neither renderer owns body state or may
infer an attacker, cause, claimant, resource count, or offscreen event.

Both renderers consume the same `TideweftView` and emit the same typed `RendererCommand`; neither owns simulation state. The projection carries the 120 × 120 frame's exact global tile origin alongside each selected Harp's canonical ID/label, fixed R/A/W knot tuple, three edges, center, and player-active boolean, the shared surface-current direction, projected roughness, derived per-tile biome/climate views, and knowledge-safe human, dog, individual-wildlife, and aggregate-evidence cues. Chart 2D keeps color-independent terrain/biome motifs and draws bounded streamlines plus foam over perceived water, adding arrowheads only while SOUND / SCAN is active. Relief 3D consumes `buildTerrainMesh()` chunks with seam-safe normals and biome-aware material references, resets persistent emissive state before every ground batch, draws the same flow vocabulary over live water, and projects pointer rays back onto the height field for selection and movement. Its Harps raise three cords from their knot objects to a suspended faceted bell, with stable cord beads and a crown when active. Both renderers give domestic cats, domestic chickens, marsh rabbits, marsh foxes, fish crows, northern harriers, snowy egrets, American black ducks, and North American river otters distinct color-independent individual forms. A directly visible chicken uses one compact body, beak, comb, legs, and current heading; visible flock size is coarse context on the selected representative, never decorative clones or a hidden census. Touch hit targets and reduced-motion presentation retain the same knowledge. Brown-rat and frog-area signs, silverside surface dimples or glints, and fiddler-crab burrows or feeding scrapes use aggregate evidence forms; cat/rabbit/fox tracks remain individual evidence, while chickens, crows, harriers, egrets, ducks, and otters produce no ground track in this release. Wildlife visuals, labels, generous hit targets, and ABOUT remain gated through the same direct-detail projection. Actor sensing remains simulation-owned and unchanged by renderer choice, camera orbit, reduced-motion presentation, pointer type, or compact layout.

The composite renderer owns one disposable terrain-perception-memory store shared by Chart and Relief. It retains only a capped `120 × 120` scalar visibility array and eases lost terrain strength to its durable map baseline over 900 milliseconds; eight quantized Relief bands keep rebatching bounded. Clear-air terrain reaches at most 52 tiles, remains fully legible through 34, and uses an 18-tile distance feather; the exact-detail field remains 10 tiles. The buffer never retains projected terrain objects, entity/detail masks, labels, actions, hit targets, or save state. Exact water presentation, actors, parcels, resources, and interaction routing continue to consume the raw current-detail field and fail closed immediately. When the bounded frame slides, its terrain impression rebases by the same exact spatial delta as both cameras and active pointer routes. World/geometry identity changes, clock/tick regression, reload/destruction, and reduced-motion presentation otherwise settle the buffer without changing authoritative perception.

Relief cord roots and bell/label placement sample the discovery-masked surface rather than authoritative hidden elevation. Reduced-motion mode sets decorative bell bob and sway to zero but leaves cords, bell, labels, crown, and active words intact. Geometry memoization keys immutable projected Harp data, keeping these derived strings/cords out of the fixed-step rules.

The composed controller stops and hides the inactive p5 instance, releases held movement/brace input during a switch, retains the shared terrain-only impression across a quick view handoff, and falls back to Chart 2D if WebGL setup fails or its context is lost. A frame shift rebases the active Chart or Relief camera, held pointer target, and queued route in one render command rather than canceling input or snapping to a new center. The explicit view preference and terrain impression are local presentation state and are deliberately outside the authoritative save/checksum.

The shared world-tap router distinguishes fine from coarse pointers. Fine-pointer harbor input retains selection/inspection. Coarse-pointer harbor input emits an exact-center movement target in both Chart and Relief, so a touch player arrives on the interaction tile before the contextual action can open the inspector. Ordinary terrain taps keep their existing route behavior.

At widths at or below 44rem—or at short landscape sizes no wider than 64rem—CSS removes the duplicate desktop HUD and folds the detailed objective, Promises, and inspector surfaces when the UI shell's disclosure flag is false. The shell starts compact and exposes a native 44-pixel `PROMISES + / PROMISES −` button whose `aria-expanded` state controls only the identified Promises surface. The compact strip is a translucent four-column projection of Stamina, Stability, Loom, and Cargo, with values and native progress semantics, followed by route and immediate safety/terrain cause. It deliberately hides keyboard-instruction copy; the large touch action dock remains reachable. The disclosure opens the existing scrollable Promises DOM as one full safe-area sheet, while settlement interaction opens the inspector as a mutually exclusive sheet. Neither disclosure nor sheet mode enters game saves.

The current CSS layer intentionally narrows the title and field palette to black/charcoal/off-white with small seafoam and gold semantic accents, hairline borders, and minimal blur. This is presentation-only; it does not fork DOM structure or gameplay between web and Electron.

## Versioned field manual

`src/ui/tutorialGuide.ts` is platform-neutral data with stable section/control IDs, audience filters, and explicit live/planned status. Guide versions 26 through 32 preserve the verified Alpha-16 through Alpha-22 lessons, while released version 33 records the Storehouse Door and outer-v15-to-v16 adoption. Released version 34 adds the one stable two-to-three-chicken yard flock, individual/group/custody identities, shared perception and terrestrial movement, broad ecological roles, exact open-store food transaction, secured-store and event-time knowledge boundaries, habitat-8 exact-prefix rule, settlement ecology 2, and outer-v16-to-v17 adoption. Released version 35 adds the separate stable two-goat herd and pen, plural custody, typed homes, shared resource arbitration, exact habitat-v8 and outer-v17 preservation, and outer-v18 adoption. Released version 36 adds the separate working dog and kennel custody, generic persisted guardian assignment, species-neutral perception participants, shared task and escape locomotion, actor-owned self-preservation, direct-detail work activity, conditional fox deterrence, and outer-v18-to-v19 adoption. Released version 37 adds the bounded investigation-to-return task lifecycle, mutual-sight handler cancellation, actor/welfare suspension and resumption, worksite arrival and handler acknowledgement, exact latest-outcome retention, and outer-v19-to-v20 adoption. It explicitly names new species, herding, separated-livestock search or rescue, full schedules, attacks, injury, mortality, carcasses, player commands, guaranteed livestock defense, autonomous kennel life, worldwide ecology, broader settlement-animal simulation, and exhaustive species/pair testing as absent. The player-facing world lesson uses continuous E/N coordinates and states that no edge action, generation prompt, address banner, loading screen, or second click is required.

Released guide version 38 documents the Alpha-28 exact goat split/reunion,
knowledge-honest recovery, atomic group materialization, and version-20-to-21
adoption. Released Alpha 29 advances the guide to version 39 and gameplay
contract to 27 for the exact-contact fox/rabbit harm boundary, one-life/one-body
conservation, finite fox/fish-crow carcass feeding, fox guarding, current-
perception-only aftermath presentation, outer save 22, core patch 3, aggregate
record 5, and exact version-21 adoption. It explicitly withholds every broader
mortality, population-recovery, decomposition/body-movement/scent/insect,
worldwide-ecology, and later-species claim.

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
11. Core-wildlife same-seed identity, version-4 twelve-record profile/registry coherence, explicit all-broad-target catalog rows, habitat hashes and honest absence, exact habitat-v3-prefix preservation under v4, individual and aggregate population-unit conservation, representative/group/materialization/evidence/disturbance caps, array-order independence, direct/peripheral/occluded sight, canonical species-driven aggregate visual sources, fox pressure versus neutral rabbit co-presence, anonymous alarm and group-signal propagation, deer/gull/crow flock continuity, role-and-size-aware trophic decisions, rabbit alarm/flee, finite nonlethal fox/harrier pursuit, causal crow alarm/mobbing interruption, shared terrestrial/aerial locomotion, authenticated perch and low-quartering activity, physical crow food custody, direct rat/frog/cat/rabbit/fox evidence boundaries, visible-event-only individual calls, rain-raised but rain-masked anonymous directional chorus, bounded aggregate quieting/redistribution, whole-parcel conservation, negative seam reach, nonlethal cargo-neutral player-absent aftermath, full/coarse/full continuity, exact outer-v11 migration/current-v12 reload, selected-flock ABOUT parity, and knowledge-safe Chart/Relief individual/aggregate inspection with mouse/touch and reduced-motion parity. Shared invariants, representative interaction scenarios, and bounded fuzzing stand in for an exhaustive species-pair matrix.
12. Fifteen-record current-registry coherence; habitat-v5 exact version-4-prefix preservation; stable tidal elevation metadata; target-tick water depth and usable-anchor projection; conserved silverside-school and fiddler-crab-area identities and totals; immediate dry-anchor fish refuge plus fixed-cadence one-unit redistribution; tide-responsive aggregate activity and direct evidence; one persistent snowy-egret identity, dry refuge, lawful anonymous aquatic-activity observation, shared aerial movement, and nonlethal pressure/avoidance; no capture, consumption, cargo mutation, mortality, fake aggregate actors, hidden census, or ecological migration; exact outer-v12-to-v13 adoption; and a bounded Tide Table readiness/performance witness.
13. Sixteen-record source-catalog coherence; habitat-v6 exact habitat-v5-prefix preservation; zero-or-one stable American-black-duck identity with two dabbling-water destinations and one dry refuge; lawful anonymous aquatic-activity observation; only air plus shallow/deep-water catalog movement; explicit `air` or `surface-water` activity projection through ordinary locomotion with no land/walk route; knowledge-honest Chart/Relief/ABOUT; durable schema-v4 completed tide-edge operation clocks after bounded event-tail eviction; exact sealed outer-v13-to-v14 adoption; and bounded representative/performance evidence with flock, nesting, mortality, wake, cross-region ecology, and direct water/tide condition mutation explicitly absent.
14. Seventeen-record source-catalog coherence; habitat-v7 exact habitat-v6 population/anchor-prefix preservation; zero-or-one stable North American river otter identity only with fish/crab/water/shore support; shared amphibious shore-to-water round trip; current anonymous aquatic activity through ordinary LOS; nonlethal fish/crab pressure; one representative generic physical loose-food claim/custody conflict; deterministic local-distance/stable-ID top-K under the unchanged 24-actor cap; knowledge-honest Chart/Relief/ABOUT/touch/reduced-motion presentation; exact sealed outer-v14-to-v15 adoption; and explicit absence of live-prey capture or consumption, harmful attacks, injury, mortality, carcasses, fishing, new sound/evidence, reproduction, migration, worldwide ecology, Wave-C/directive completion, and exhaustive species-pair testing.
15. Released Alpha-22 activity-affordance registry/profile coherence across six existing participants; generic actor-address plus surface-opportunity plus tidal-activity selection; terrain-occluded same-tick anonymous aquatic surface observation; gull air-only circling and authenticated habitat-anchor rest; immediate-intent priority; unchanged outer-save-15/habitat-7/aggregate-4 envelopes; exact physical-food and aggregate-unit conservation; knowledge-honest Chart/Relief/ABOUT presentation; abstraction and property checks, bounded interaction-graph fuzzing, performance budgets, and representative scenarios without new species or an N² pair matrix; and fail-closed exclusions for worldwide Wave C, mortality, carcasses, harmful attack, live-prey capture/consumption, fishing, nesting, reproduction, migration, full circadian life, and general scent/sound/evidence.
16. Released Alpha-23 stable store/keeper/lot/rat-anchor identity; physical store stock distinct from abstract settlement food; open/secured source leakage through the existing wind/rain scent owner; authenticated at-most-one-unit loss per matching relocation event; rat-population and physical-item conservation; exact-once pending/commit/replay behavior; visible-cat aggregate pressure without cat rat-sign cognition; a knowledge kernel that authenticates direct keeper observation plus the live in-person player-report path; persistent closure; event-time player-knowledge gating; exact sealed outer-v15-to-v16 adoption with habitat 7 and aggregate 4 unchanged; Chart/Relief parity; shared abstraction checks, a bounded signed-coordinate property sweep, conservation, and a representative store-rat-visible-cat witness while inherited shared fuzz/performance gates remain in regression rather than expanding into exhaustive species or pair tests; and explicit exclusion of new species, worldwide settlement ecology, schedules, livestock, rumors, mortality, carcasses, live-prey consumption, the full bestiary, and Directive completion.
17. Alpha-24 eighteen-record catalog coherence; habitat-v8 exact habitat-v7 population/anchor-prefix preservation; one stable two-to-three-member domestic-chicken population and `CHICKEN-FLOCK`; canonical settlement/keeper/member/home custody; broad-class direct perception and shared alarm; ordinary terrestrial movement; authenticated open-store exact-one-unit physical consumption with secured and unseen negative branches; event-time knowledge honesty; Chart/Relief/ABOUT/touch/reduced-motion parity; exact sealed outer-v16-to-v17 and settlement-v1-to-v2 adoption; shared signed-coordinate invariants, migration/replay attacks, physical conservation, bounded performance, and one representative visible-yard witness rather than species-by-species or N² pair testing; and explicit absence of calls/tracks, attacks, injury, mortality, carcasses, live-prey consumption, eggs, nesting, reproduction, herding, guardian behavior, complete schedules, autonomous home return, ecological cross-region migration, worldwide livestock, full Wave D, and Directive completion.
18. Alpha-25 nineteen-record catalog coherence; habitat-v9 exact habitat-v8 prefix preservation; one separate pen and exactly two stable domestic goats in one `GOAT-HERD`; plural canonical custody with typed coop/pen homes and unique member/group/relationship/home/structure authority; goat exclusion from store provisions and unsupported living-foliage browsing; deterministic shared resource contention by physical reach, current need, and stable identity; authenticated individual coat continuity across Chart and Relief; exact sealed outer-v17-to-v18 and settlement-v2-to-v3 adoption; shared signed-coordinate invariants, migration/replay attacks, conservation, bounded performance, and representative runtime composition rather than species-by-species or N² pair tests; and explicit absence of calls/tracks, attacks, injury, mortality, carcasses, reproduction, milk, wool, herding, guardian behavior, complete schedules, autonomous home return, cross-region ecological migration, worldwide livestock, full Wave D, and Directive completion.
19. Alpha-26 unchanged nineteen-record catalog and habitat-v9 prefix; one separate deterministic working dog in a bounded roster; third domestic custody and typed kennel; generic persisted assignment tied to the existing keeper, goat custody, herd, and pen; lawful anonymous alarm evidence through species-neutral external perception participants; shared investigation, escape, and return locomotion; actor-owned cognition, needs, exposure, and self-preservation; exact-once activity staging/recovery; direct-detail Chart/Relief/ABOUT activity; exact sealed outer-v18-to-v19 and settlement-v3-to-v4 adoption; runtime and regional-continuity proofs; and one representative rabbit-alarm/fox-sees-dog emergence chain. Shared invariants and representative witnesses replace species-by-species or N² coverage, and attacks, injury, death, carcasses, herding, new sound, guaranteed defense, worldwide dogs/livestock, cross-region animal ecology, full Wave D, and Directive completion remain absent.
20. Alpha-28 caused exact group split versus distance-only non-split; direct-sight regroup with danger/welfare priority; lawful caretaker absence knowledge, explicit last-known-area report, existing-guardian search without find proof, exact-body reunion, current pen confirmation, retained known-case coarse reunion, atomic whole-group materialization, no off-frame local cognition or locomotion, exact-once recovery persistence and outer-v20-to-v21 adoption. Shared invariants, properties, replay/migration checks, bounded performance, and representative emergence cover the seam without a per-species or N² matrix; herding, schedules, guaranteed recovery, remote markers/player search, attacks, injury, mortality, carcasses, calls, tracks, and full cross-region ecology remain absent.
21. Alpha-29 unchanged roster/habitat; current identified fox pursuit plus exact rabbit contact; named injury/death; exact-once actor retirement and one-unit population loss with conserved reserve; one stable finite physical body; lawful fox/fish-crow sight, reach, claim, one-unit feeding, and fox guarding; direct-perception-only Chart/Relief/EVENTS projection; exact outer-v21-to-v22, core-patch-v3, and aggregate-v5 adoption; migration/replay/conservation/signed-world/bounded-performance invariants; and representative mortality/scavenging scenarios rather than per-species or N² coverage. Broader mortality, group-member death, population recovery, live decomposition/body movement/harvest/scent/insects, worldwide ecology, and later Wave-E species remain absent.
22. Vite production build under relative paths.
23. Packaged Electron launch, visible title controls, `app://` resource load, preserved-estuary content inside the 120 × 120 moving frame, deterministic R1/A3/W5 Harp placement and remote echo, both Chart/Relief canvas switches, actual Relief bell/cord evidence, desktop plus portrait/landscape mobile probes, Node-global absence, and zero renderer warnings/resource failures.

The Phase 10 gate passes TypeScript, 28 Vitest files / 205 checks, the production and nested-path web gates, that extended packaged smoke, `git diff --check`, and a scoped source secret scan. Exact commit `6f74fe9e016ba566116e2085b05ecf2988213754` is published: CI run `33494152504` and Pages run `33494152310` succeeded, and the live HTML serves the inspected `index-CKlzWR1L.css` and `index-D30XtHH3.js` assets with HTTP 200 responses. The deployment is an untagged preview; `v0.2.0-alpha.1` remains unchanged.

The focused mobile/current hotfix adds unit coverage for both sweep causes, discovery-safe current geometry, shared direction projection, and compact HUD disclosure/copy. Its gate passes TypeScript, 31 test files / 221 checks, production and nested-path web builds, the scoped public-source secret scan, and packaged desktop/mobile smoke with no renderer warnings or resource failures. Exact commit `f8dc8482cbd10df1352f87a3a28bbee4abcf8de2` is live after CI `33503039473` and Pages `33503039480`; the exact inspected assets return HTTP 200.

The perpetual/manual-pause, interface/manual/report, visible-biome, shared Chart/Relief water palette, and pure cargo-environment/rock-ladder work is published at `29ea8dc60f309ebc43bcf8c1b567cfacf2bf8f95`. Focused coverage exercises perpetual defaults plus legacy-value round trips, bounded/call-order-independent climate derivation, projection and discovery-safe biome/water presentation, touch harbor routing, manual audience/content completeness, report refresh guards, mobile HUD copy, inert calm cargo exposure, bounded material responses, canonical causes, deterministic forces, outcrop stability, and ladder validation. The integrated gate passes 40 test files / 311 checks, nested-path web smoke, runtime-only packaged-ASAR inspection, and desktop/mobile packaged smoke; CI `33508654754` and Pages `33508654540` succeeded. Live ladder/fall traversal, physical dropped-cargo simulation, upgrades, and weather/magic-water effects on cargo, ecology, infrastructure, or settlements remain future architecture.

The verified Alpha `0.3.3-alpha.12` gameplay checkpoint is release commit `4784315a77d815533a9370ece3d7daeb1cc8d5bc`, gameplay contract 20, tutorial 22, outer session 8, and embedded simulation format 4 / `tideweft-sim/6`. CI run `33952159605` and Pages run `33952159606` both succeeded for that exact commit. It publishes only the bounded core-wildlife crossing described above; general habitat assemblages, persistent group ecology, evidence, wider species, and player-absent aftermath remain unimplemented.

Source version `0.3.3-alpha.13` adds the strict five-species catalog, routes production alarm-hearing and scent sensitivity through its matching relative capabilities, and authenticates a 30-criterion per-species release report against build-owned evidence. Species-specific visual acuity remains foundation-only. The build deliberately leaves incomplete capabilities blocked, changes no save schema, and adds no living actor or encounter.

Source version `0.3.3-alpha.14` closes the bounded Wave-A habitat/population/group slice described above and advances the outer session to version 9. It still contains exactly the same five production living-actor types. Worldwide habitat populations, broad species expansion, ecological migration/reproduction, injury/death/carcasses, physical evidence/tracking, general scent fields, circadian life, and release-scale ecological fuzz/performance proof remain future work.

Source version `0.3.3-alpha.15` adds the bounded Settlement Shadows I extension described above and advances the outer session to version 10. The production catalog now covers seven species records, but only domestic cats join the exact actor population; brown rats remain one aggregate population area disclosed through direct physical signs. The slice connects lawful visual pressure from cats, dogs, humans, and gulls, narrow loose-provision scent attraction, rain/terrain pressure, conserved density spacing, cat food competition and rain retreat, bounded rat signs and wet cat pawprints, visible-event-only sound, Chart/Relief ABOUT parity, and exact version-9 adoption. It does not claim worldwide ecology, general tracking or scent, attacks, injury/death/carcasses, hunting, reproduction, circadian life, cat ownership, or exhaustive pair-specific behavior.

Source version `0.3.3-alpha.16` adds the bounded Marsh-edge Pursuit extension described above and advances the outer session to version 11. The production catalog now covers nine species records; habitat version 3 appends persistent marsh-rabbit and marsh-fox populations without rewriting the version-2 prefix. The slice connects rabbit alarm/flee, directly perceived and strictly nonlethal fox pursuit, dog/large-predator interruption, finite disengagement, shared terrain locomotion, direct paired tracks and canid pawprints, visible-event-only thumps/yips with anonymous bottom-right captions, color-independent Chart/Relief forms, knowledge-honest ABOUT, and exact version-10 adoption. The role-and-size trophic resolver deliberately removes the former cat/deer predator-prey classification. It does not claim attacks, injury, death, carcasses, live-prey consumption, complete scent/tracking, foliage consumption, circadian behavior, worldwide populations, the full bestiary, or exhaustive pair-specific behavior.

The Alpha-17 Rain Chorus / Shadow Overhead release appends fish crow, northern harrier, and southern leopard frog through habitat version 4 while preserving the exact version-3 prefix. It uses at most three persistent fish-crow representatives in a stable visible flock, at most one solitary harrier, and one non-addressable 64–72-unit frog area over at most three anchors. Shared capability policies drive aerial movement, authenticated crow perching, bounded diurnal harrier quartering, food investigation, group alarm, mobbing, aggregate quieting/redistribution, and knowledge-safe presentation. A crow can physically take one exact loose provision, and a causally alarmed/mobbing crow can make a harrier abandon a finite nonlethal pursuit. Rain raises frog activity while the same ambient rain masks the anonymous directional chorus through ordinary hearing. Outer-save version 12 adopts the extension once from an authenticated version-11 envelope. The release does not add attack, injury, mortality, carcasses, live-prey consumption, bird ground tracks, complete scent, worldwide ecology, the full bestiary, full circadian behavior, or an exhaustive pair matrix. The broader Wave B biodiversity expansion remains active.

Source version `0.3.3-alpha.18 — One Marsh, Many Eyes` is the bounded starting-harbor Wave-B policy and player-facing parity closure release. Aggregate visual input now carries canonical addressable species into the same role/capability/trophic resolver: representative marsh-fox presence can pressure rat and frog aggregates, while neutral marsh-rabbit co-presence does nothing. Every core-wildlife catalog record explicitly declares every broad target class as supported or an intentional no-response. Selected fish-crow and gull ABOUT views reuse the visible group estimate already exposed by projection, and an unlearned chorus remains species-anonymous while its caption and attenuated pan honor the same uncertain heard-bearing contact. Exact feature commit `673fc373b2b6de81f299f4c176681c969ace6915` passed CI run `34027046007` and Pages run `34027046121`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte. The release does not extend ecology beyond the starting-harbor patch and adds no attack, injury, mortality, carcasses, live-prey consumption, complete scent, worldwide populations, full circadian behavior, full bestiary, or N² interaction claim.

Source version `0.3.3-alpha.19 — The Tide Table` is the first bounded Wave-C tidal release in the same starting-harbor patch, using habitat version 5 and outer save version 13. The version-4 habitat population array is an exact prefix; stable appended tidal anchors store baseline elevation, while a pure target-tick Tide Table projection combines that elevation with the authoritative tide to derive water depth, current activity usability, aggregate intensity, and one egret's depth-safe wading choices. Atlantic silversides and Atlantic marsh fiddler crabs remain non-addressable conserved aggregates; current tide or lawful shared pressure can only redistribute existing units among saved anchors. The snowy egret remains one bounded individual and receives an anonymous aquatic-activity fact only through shared current vision of an occupied, active, usable anchor. Its cognition, shared movement, direct evidence, Chart/Relief presentation, close ABOUT, save migration, signed moving-frame continuity, and performance budget are authenticated without asserting ecological cross-region migration. This is the first bounded Wave-C unit, not Wave-C or broader biodiversity completion, and it adds no capture, fishing, attack, injury, mortality, carcass, live-prey consumption, complete scent, worldwide ecology, full circadian behavior, or exhaustive pair matrix. Exact feature commit `7ef802398f4b5ea6d4e6503d436fc7a858ccbe30` passed CI run `34045602263` and Pages run `34045602240`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

Source version `0.3.3-alpha.20 — Between Water and Sky` is the **LIVE_VERIFIED** second bounded starting-harbor Wave-C unit. Habitat version 6 preserves the complete version-5 population and tidal-anchor record as an exact prefix, then may append at most one stable persistent American black duck with two saved dabbling-water destinations and one dry refuge. Its current lawful sensory input is only anonymous aquatic activity obtained through shared terrain-occluded vision. Shared activity selects `air` or `surface-water`; the catalog supplies only air plus shallow- and deep-water movement, the ordinary locomotion solver owns both routes, and no land/walk route exists. Tide and water choose habitat, activity, and travel medium without directly mutating duck stress or condition. Chart, Relief, quick inspection, and ABOUT expose only the same direct knowledge-honest individual.

Outer session version 14 adopts an authenticated sealed version-13 record exactly once while preserving every prior actor, group, aggregate, item, Promise, custody record, evidence record, tidal anchor, and world fact. Internal aggregate schema version 4 places a durable completed tide-edge operation marker outside the bounded event tail, so eviction cannot permit a same-tick redistribution reroll. The slice uses shared capability/data owners and representative invariant, deterministic-scenario, bounded-fuzz, and performance evidence rather than a bespoke species-pair test matrix. It adds no flock, nesting, breeding, migration, cross-region ecology, wake, otter-like predator, capture, consumption, attack, injury, mortality, carcass, worldwide ecology, Wave-C completion, or directive completion. Exact feature commit `c11e4de0563876839158fb13a69ddfb4dadd6dbe` passed feature CI run `34061008077`, main CI run `34061513043`, and Pages run `34061512986`; the deployed HTML, icon, manifest, JavaScript, and CSS match the tested local build byte-for-byte. This external post-deployment attestation does not retroactively alter the immutable runtime witness described above.

Source version `0.3.3-alpha.21 — The Living Channel` is the **LIVE_VERIFIED** final bounded starting-harbor Wave-C role slice and appends one bounded
North American river otter role through habitat version 7 while preserving the
entire version-6 population and anchor record as an exact prefix. Fish and crab
support plus usable foraging water and a distinct dry haulout determine honest
presence or absence. Shared amphibious locomotion, current anonymous aquatic
observation, broad nonlethal aggregate pressure, the generic physical-item
claim/custody owner, and deterministic nearest-24 spatial materialization are
the architectural additions; Chart, Relief, ABOUT, touch, and reduced motion
project the same knowledge-honest state. Outer save 15 adopts authenticated
version 14 once. Shared invariants, deterministic properties, conservation,
bounded fuzzing, and representative interactions provide confidence without a
species-by-species or N² test matrix. Live-prey capture or consumption, harmful
attack, injury, mortality, carcasses, fishing, new otter sound or persistent
evidence, reproduction, migration, worldwide ecology, complete Wave C, and
Directive 04_1 completion remain absent. Exact feature commit
`5514c24619fc6d41b34cbdd6315f4ae8d936f2dc` passed CI run `34067577935` and
Pages run `34067577893`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested committed build byte-for-byte. This external post-deployment
attestation does not alter the immutable build-owned publication witness.

Source version `0.3.3-alpha.22 — Tidal Convergence` is the **LIVE_VERIFIED**
bounded starting-harbor Wave-C integration release. It adds no species and
introduces a versioned shared
activity-affordance owner with six archetypes/profiles for perch watching, low
quartering, tidal wading, dabbling waterfowl, shore-water foraging, and aerial
surface opportunism. The existing gull becomes the proof that current
anonymous aquatic surface observation is selected by generic actor-address,
surface-opportunity, and tidal-activity capabilities rather than by an aquatic-
forager or species allowlist: terrain-occluded sight can send it by air to
circle the observed area, while the existing habitat allocation supplies its
rest anchor. It receives no water locomotion, aquatic-foraging pressure,
aggregate identity, exact count, or private target. Immediate lawful threat,
alarm, pursuit, and physical-food intents retain priority, and Chart, Relief,
and ABOUT project only the same authenticated current state.

Outer session 15, habitat 7, aggregate schema 4, the seventeen-record catalog,
physical-food custody, aggregate-unit conservation, and the nearest-24
materialization ceiling remain unchanged. The immutable build-owned readiness witness
uses abstraction/property/conservation checks, bounded fuzzing, performance
budgets, and representative scenarios instead of species-by-species or N² pair
coverage, while structurally refusing to self-attest publication or live
deployment. External verification establishes that exact feature commit
`4dacd99e95a018314d65a72183b82cba8583774f` passed CI run `34074045801` and
Pages run `34074045818`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested committed build byte-for-byte. This closes only the bounded
starting-harbor Wave-C integration seam; it does
not complete worldwide Wave C or Directive 04_1 and adds no mortality,
carcasses, harmful attacks, live-prey capture or consumption, fishing, nesting,
reproduction, ecological cross-region migration, full circadian life, or
general scent/sound/evidence system.

Source version `0.3.3-alpha.23 — The Storehouse Door` is **LIVE_VERIFIED**. It
adds no species. One
bounded starting-harbor store owns a stable physical fresh-produce lot through
ordinary settlement cargo custody, separate from the settlement's abstract food
stock. While its door is open, existing wind, rain, distance, and packaging
rules shape scent reaching the existing brown-rat aggregate. That aggregate can
relocate an existing unit through its shared policy; only the matching
authenticated event may commit at most one exact physical produce-unit loss.
The rat population remains conserved. An existing domestic cat's lawfully
visible presence can pressure the aggregate through shared perception policy,
but the cat receives no hidden rat knowledge or investigation behavior.

In Alpha 23's playable path, the actual nearby keeper secures the store only
after the player's in-person report. The kernel separately authenticates direct
keeper observation for later autonomous wiring. Closure persists and contains later scent. Chart,
Relief, inspection, and EVENTS remain knowledge-honest: an event the player did
not directly cause or observe is not reported merely because the store returns
to view. Outer save 16 adopts sealed version 15 exactly once while habitat 7 and
aggregate schema 4 remain unchanged. Shared abstraction checks, a bounded
signed-coordinate property sweep, exact item and aggregate conservation,
deterministic migration/replay, and one representative store-rat-visible-cat
composition provide confidence. Existing shared fuzz and performance gates
remain in regression without expanding into exhaustive species or pair testing.
This is not worldwide settlement ecology, schedules, livestock, broad rumors,
mortality, carcasses, live-prey consumption, the full bestiary, or Directive
04_1 completion. Exact feature commit
`245997219eff02e4edcf75331dc7fd4850432efb` passed CI run `34080936761` and
Pages run `34080936748`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested local production build byte-for-byte.

Source version `0.3.3-alpha.24 — The Yard Flock` is **LIVE_VERIFIED**. Habitat
version 8 preserves the exact version-7 tidal-web prefix and
appends one deterministic storehouse-yard anchor, two or three stable chicken
actors, and one stable `CHICKEN-FLOCK`. Settlement ecology version 2 binds that
flock to the existing settlement and keeper through one canonical custody
record; it does not own a second cognition, locomotion, group, or inventory
model. The birds reuse direct observation, attention, broad interaction roles,
terrestrial movement, group alarm, top-K materialization, and knowledge-honest
Chart/Relief/ABOUT projection.

An open store exposes its exact physical produce lot as an identified food
opportunity only to an authenticated custody member. The bird must approach
through ordinary movement and enter the shared Euclidean structural-access
area before a staged one-unit transaction can commit. Secured stock produces no
food belief or claim; replay and interruption cannot duplicate or reconsume the
unit; and an offscreen result remains absent from player narration. Outer save
17 adopts sealed version 16 once while preserving every earlier habitat entry,
actor, group, aggregate unit, store/lot identity, closure, loss record, item,
Promise, evidence record, and world fact. Shared invariants, signed-coordinate
properties, conservation, migration/replay attacks, bounded performance, and
one representative visible-yard event provide evidence without an N² pair
matrix. Exact release commit `4067ac4439bb6f624ed88f69eb09cc591b246741`
passed CI run `34093027893` and Pages run `34093027917`; the deployed HTML,
icon, manifest, JavaScript, and CSS match the tested local production build
byte-for-byte. Immutable build-owned publication fields remain false because
runtime code cannot attest its own later deployment. Calls/tracks, attacks, injury,
mortality, carcasses, live-prey consumption, eggs, nesting, reproduction,
herding, guardian behavior, schedules, autonomous home return, ecological
cross-region migration, worldwide livestock, full Wave D, and Directive 04_1
completion remain absent.

Source version `0.3.3-alpha.25 — The Far Paddock` is **LIVE_VERIFIED** and extends that bounded domestic
substrate without creating a goat-specific simulation. Habitat version 9 keeps
the complete version-8 population, tidal-anchor, and domestic-yard record as an
exact prefix, then uses a fixed-budget deterministic habitat lookup to place a
separate pen and exactly two persistent `domestic-goat` actors. The actors form
one stable `HERD` through the same group owner used by other social wildlife;
their catalog profile supplies terrestrial locomotion, direct-observation
attention, broad interaction roles, alarm propagation, materialization, and
knowledge-honest Chart/Relief/ABOUT presentation.

Settlement ecology version 3 replaces the singular domestic relationship root
with a bounded canonical custody collection and a typed `coop | pen` home
structure. Migration preserves the Alpha-24 relationship ID, home ID, former
coop ID, chicken members, and flock byte-for-byte; only the goat relationship,
pen, and herd are appended. Canonicalization rejects reused actor, group,
relationship, home, or structure authority, so one social group cannot belong
to two homes. The single physical settlement carrier and pending transaction
lane remain authoritative.

`coreWildlifeResourceClaimArbitration` is the shared contention boundary after
source-specific capability, ownership, and contact validation. It orders
contenders for each physical resource by exact contact distance, then current
need pressure, then stable actor and event identity. Input or population
iteration order cannot assign custody. The goat profile deliberately lacks the
food-investigation capability and exposed-food diet, so it cannot inherit the
chickens' store opportunity; living-foliage browse remains a later owner. Outer
save 18 adopts sealed version 17 once, retaining every established actor,
group, aggregate unit, item, Promise, store fact, and world fact before the
additive suffix. Evidence remains abstraction-led: shared invariants,
signed-coordinate properties, migration/replay attacks, conservation, bounded
performance, and representative runtime composition—not per-species or N²
pair coverage. Calls, tracks, attacks, injury, mortality, carcasses,
reproduction, milk, wool, schedules, herding, guardian behavior, cross-region
migration, worldwide livestock, full Wave D, and Directive 04_1 completion are
still absent from this release. Exact release commit
`29af7793346c0c3977a5ca727b79feb3a50b83bb` passed CI run `34108539228` and
Pages run `34108539255`; five cache-bypassed live artifacts match the tested
local production build byte-for-byte.

Release `0.3.3-alpha.26 — The Paddock Watch` is **LIVE_VERIFIED** at exact
commit `e3aae174d962ec609b9463e40320227237c9fa1f`. CI run `34143286763` and
Pages run `34143286720` succeeded, and five cache-bypassed live artifacts match
the tested local production build byte-for-byte. It retains the
nineteen-record catalog, habitat version 9, aggregate schema 4, and the prior
core-wildlife materialization ceiling. One separate deterministic dog enters a
bounded `DogActorState` roster, settlement ecology version 4 adds its kennel as
a third custody home, and a generic working-animal root ties that dog, the
existing keeper, both dog and goat custody, the goat herd, and the pen worksite
together. Neither the roster nor assignment can absorb or silently assign the
original independent porter-scene dog.

The assignment stores relationship and accepted activity authority rather than
an actor brain. Ordinary dog cognition, needs, condition, exposure, perception,
and intent arbitrate self-preservation first. Species-neutral external
participants enter the bounded visual-contact index; an anonymous alarm retains
only a cognition-owned uncertain area; shared search probes and locomotion own
investigation, escape, and return. A pending work transition commits or recovers
exactly once. Presentation composes only authenticated current work activity
under the same direct-detail Chart/Relief/ABOUT gate.

Outer save 19 adopts sealed version 18 once, preserving every Alpha-25 habitat,
actor, group, aggregate, item, Promise, store, food, custody, and world fact
before the dog roster, kennel custody, and work root are appended. The
representative rabbit-alarm chain redirects a fox only after the fox actually
perceives the dog. It proves incidental deterrence, not an attack, hidden
guardian radius, or successful-defense guarantee. Attacks, injury, death,
carcasses, herding, a new sound system, companion commands, autonomous kennel
return, worldwide dogs or livestock, ecological cross-region animal migration,
full Wave D, and Directive 04_1 completion remain absent. Validation uses
shared invariants and representative runtime/emergence chains rather than a
species-by-species or N² matrix.

Release `0.3.3-alpha.27 — The Watch Returns` is **LIVE_VERIFIED**. It
changes no species, population, habitat, settlement home, custody relationship,
or actor owner. Working-animal root and assignment version 2 add one bounded
task over the existing guardian's committed investigation. The task derives a
deterministic shared-locomotion probe from lawful uncertain evidence; physical
probe arrival produces a completed result, while fresh reciprocal worker and
handler sight may authenticate the keeper's narrow outside-duty recall and a
cancelled result. Either outcome returns the dog through ordinary locomotion to
the exact pen worksite, where current handler sight acknowledges and closes it.

Actor intent and welfare may suspend and resume the task without manufacturing
completion. All seven transition kinds use one exact-once transaction seam;
only one current task, one pending transition, and the latest closed outcome
persist. Outer save 20 adopts sealed version 19 once, preserving every prior
identity, relationship, item, Promise, and world fact. This is no remote command
system, herding, livestock search/rescue, complete schedule, autonomous kennel
life, attack, injury, mortality, carcass, new species, worldwide ecology, or
broader settlement-animal simulation. Evidence remains shared-invariant,
property, replay/migration, bounded-performance, runtime-composition, and
representative-emergence based. Exact gameplay commit
`f2c55413c64a8e6b8e3cc1fab06e50252df2399f` and public attestation commit
`6a5bc4352edb39b47ee2216ca01a1506f01419cb` passed final CI
`34160098140` and Pages `34160098112`; all five cache-bypassed deployed
artifacts match the tested production build exactly.

Release `0.3.3-alpha.28 — The Missing Goat` is **LIVE_VERIFIED** and closes one
bounded starting-harbor Wave-D composition without adding a species or rewriting an
actor. A caused current flee/retreat plus exact separation can split the goat
herd; distance alone cannot. Current identified group sight can propose
regroup, but danger and physiology outrank it. The keeper must lawfully notice
the absence before an explicit last-known-area report recruits the existing
guardian's ordinary search. Search does not authenticate a find. The exact
bodies can physically rejoin, and current caretaker sight of all members in
the pen closes the case; an already-known case can retain an authenticated
coarse reunion transition without fabricating sight.

The release makes each social group an indivisible materialization-cap unit,
so all members enter full detail together or remain coarse with no local
perception or locomotion. It adds a bounded version-1 recovery root and exact
outer-v20-to-v21 adoption, gameplay contract 26, and field manual 38. It adds
no herding, complete schedule or home routine, guaranteed recovery, remote
marker or player search command, attack, injury, mortality, carcass, call,
track, or full cross-region ecology. Verification remains shared-invariant,
property, replay/migration, bounded-performance, and representative-emergence
based rather than per-species or N².

Exact gameplay/release/main commit
`60c9bc34ac871425e5319c8369e715751b5d1c44` passed feature CI
`34174876320`, main CI `34175693435`, and Pages `34175693447`. The release gate
passed TypeScript, public-boundary and player-facing-sync checks, 220 test files
and 2,111 checks, a five-asset 3,284,606-byte served web build, a 10-entry
3,476,214-byte runtime-only Electron ASAR inspection, desktop/mobile/title
smoke, and clean invariant, save, and visual audits. Its first cache-bypassed
five-file live comparison matched the tested production build exactly.

Release `0.3.3-alpha.29 — What Remains` is **LIVE_VERIFIED** and changes no species, habitat,
population allocation, home, custody, or actor construction. The runtime
resolves only current identified marsh-fox pursuit plus exact contact with that
exact marsh rabbit. A named damage event may injure or kill; death retires the
actor once, removes one population unit while any remaining represented units
become abstract reserve, and creates one deterministic physical carcass with a
finite conserved resource. Foxes and fish crows use ordinary current vision,
shared reach, exclusive claim, and exact one-unit consumption; a fox may guard
its body claim. Current direct-detail perception alone authorizes Chart/Relief
body projection and direct-event presentation.

Outer save 22, core-ecology patch 3, aggregate record 5, gameplay contract 27,
and Field Manual 39 persist the transaction through exact version-21 adoption.
The slice adds no player/dog/human/other-animal or group-member mortality,
reproduction, recruitment, population recovery, live-time decomposition, body
drift/drag/harvest, carcass scent, insects, worldwide ecology, or later Wave-E
species. Evidence uses shared invariants, deterministic properties,
conservation, replay/migration attacks, bounded performance, and representative
emergent scenarios rather than per-species or N² tests.

Exact gameplay commit `a0f7b571cf6068c41397ad0b8767347b04b24ac1`
passed feature CI `34187159628`, main CI `34187706800`, and Pages
`34187706784`. The complete release gate passed TypeScript, public-boundary and
player-facing-sync checks, 224 test files and 2,143 checks, a five-asset
3,323,332-byte served web build, a 10-entry 3,514,940-byte runtime-only
Electron ASAR inspection, desktop/mobile/title smoke, and clean invariant,
save, release-surface, and visual audits. Its first cache-bypassed five-file
live comparison matched the tested production build exactly.
