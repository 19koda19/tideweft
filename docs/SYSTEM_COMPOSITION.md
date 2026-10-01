# TIDEWEFT system composition registry

## Purpose

This registry answers a different question from
[system inheritance](./SYSTEM_INHERITANCE.md):

- `SYSTEM_INHERITANCE` asks which established contracts a new thing must join.
- `SYSTEM_COMPOSITION` asks whether existing systems exchange real causes,
  objects, knowledge, resources, and consequences.

The governing test is:

> If a major system disappeared, which other systems would notice?

TIDEWEFT should not become a crafting game, animal game, delivery game, map
game, and social game that merely share a screen. Important outputs should
become legitimate inputs elsewhere. Important inputs should have accountable
sources. Connections should use domain-owned state, events, physical objects,
knowledge records, and bounded transactions rather than one central god
manager.

This document records repository truth. Detailed mechanics remain with
[architecture](./ARCHITECTURE.md), [game design](./GAME_DESIGN.md),
[crafting design](./CRAFTING_DESIGN.md), and their runtime owners. Completed
execution briefs are historical evidence and remain read-only; later findings
belong in current canonical documents and active or future execution owners.

## Evidence and status

Do not confuse five different levels of truth:

1. **DOCUMENTED** — a design contract describes the behavior.
2. **DATA PRESENT** — profiles, recipes, or records exist.
3. **RUNTIME FOUNDATION** — a reusable owner or transaction exists.
4. **LIVE GAMEPLAY LOOP** — an actor can cause and experience the interaction.
5. **COMPOSED LOOP** — the result materially changes another major system.

Every important relationship uses one of these statuses:

- **LIVE** — a verified runtime path connects producer and consumer.
- **PARTIAL** — a real connection exists but stops short of the intended loop.
- **SPECIFIED** — canonical design assigns the connection, but runtime does not
  yet provide it.
- **MISSING** — the connection should exist, but neither a live path nor a
  sufficient current owner does.
- **BYPASS** — behavior works by going around a canonical source, custody,
  knowledge, or consequence owner.
- **NOT APPLICABLE** — the relationship was evaluated and deliberately should
  not exist.

Connection quality is **STRONG** when real conserved state or sourced knowledge
crosses the boundary and persists, **MODERATE** when one side remains an
explicit abstraction, **WEAK** when the connection is mostly a display/stat
effect, and **NONE** when no meaningful bridge exists.

Status describes the current repository candidate, not a public-release claim.
The released boundary and any local unpublished behavior remain identified by
their canonical owner documents.

### Runtime evidence anchors

The matrices below summarize relationships; these anchors provide the actual
runtime path and primary canonical owner without repeating file lists in every
row.

| Domain | Runtime evidence | Canonical owner / verification |
| --- | --- | --- |
| Terrain, water, movement, Relief | `src/sim/regionTerrain.ts` → `src/game/player.ts` → `src/render/terrainMesh.ts` | `ARCHITECTURE.md`, `GAME_DESIGN.md`; footing/player/Relief tests |
| Seamless streaming and map knowledge | `src/game/regionStreaming.ts`, `src/game/regionalCartography.ts`, `src/render/reliefTerrain.ts` | `ARCHITECTURE.md`; regional streaming/cartography tests |
| Perception, embodied acoustics, and Living Voice | `src/sim/actorPerception.ts`, `src/game/humanPerception.ts`, `src/game/physicalAcousticPerception.ts`, `src/game/dogPhysicalAcousticPerception.ts`, `src/game/coreEcologyAggregateAudio.ts`, `src/game/traversalFeedback.ts`, `src/game/worldAcoustics.ts`, `src/game/worldAcousticPresentation.ts`, `src/game/worldAcousticPresentationQueue.ts`, `src/game/situatedExpression.ts`, `src/game/coreWildlifeWeatherDistressExpression.ts`, `src/game/coreWildlifePursuitExpression.ts`, `src/game/playerStepState.ts`, `src/game/playerEffortExpression.ts`, `src/game/workingPeopleExpression.ts`, `src/game/dogSignalExpression.ts`, `src/game/coreWildlifeSignalExpression.ts`, `src/game/humanDangerWarningExpression.ts`, `src/game/settlementKeeperStoreResponseExpression.ts`, `src/game/settlementKeeperStoreResponseAdmissionAuthority.ts`, `src/game/residentIntroductionExpression.ts`, `src/game/residentIntroductionAdmissionAuthority.ts`, `src/game/residentWeatherHoldExpression.ts`, `src/game/residentWeatherHoldAdmissionAuthority.ts`, `src/game/situatedExpressionAcoustics.ts`, `src/game/uiProjection.ts`, `src/ui/situatedExpressionCaption.ts`, `src/render/acousticTextLayout.ts`, `src/render/playerPresentation.ts` | `ARCHITECTURE.md`, `GAME_DESIGN.md`; perception/expression/traversal/acoustic-layout/presentation and `runtime.coreEcology.integration.test.ts` tests. Vocal expression, the authenticated first resident introduction, one event-owned resident weather hold, committed secured-storekeeper reply, sparse committed dry-exhaustion murmur, human warning, traversal, cargo impact, representative dog contact, ecology-owned aggregate frog chorus and brown-rat rustle, one exact domestic-cat rain-distress call, one exact marsh-fox pursuit yip, bounded human/dog world-sound hearing, directional unseen captioning, and shared presentation arbitration are live in the repository candidate; producer/consumer breadth remains incomplete. |
| Ecology, mortality, bodies | `src/game/coreEcology.ts`, `src/game/coreWildlifeMortality.ts`, `src/game/coreWildlifeCarcass.ts` | `ARCHITECTURE.md`, `GAME_DESIGN.md`; ecology/mortality/carcass tests |
| PACK / MAKE / MEND | `src/game/crafting.ts`, `src/game/gearEffects.ts` | `CRAFTING_DESIGN.md`; crafting/gear tests |
| Settlements, routes, Promises | `src/sim/world.ts` → `src/sim/engine.ts` → `src/sim/network.ts` | `GAME_DESIGN.md`, `ARCHITECTURE.md`; `src/sim/systemComposition.integration.test.ts` |
| Physical cargo and persistence | `src/game/fallCargo.ts`, `src/game/looseCargo.ts`, `src/game/runtime.ts` | `ARCHITECTURE.md`, `CRAFTING_DESIGN.md`; fall/loose-cargo/runtime tests |
| Promise/map presentation leaks | `src/game/uiProjection.ts`, objective focus paths in `src/game/runtime.ts` | expedition contracts in `GAME_DESIGN.md`, `ARCHITECTURE.md`, and `SYSTEM_INHERITANCE.md`; future expedition-cartography verification |

For an individual row, its named producer and consumer remain the domain
owners. Cross-domain transactions must stay in those owners rather than being
moved into this registry or a universal manager.

## Current composition diagnosis

TIDEWEFT already has several genuine composed spines:

```text
SETTLEMENT STOCK + RESIDENT NEED
→ SHORTAGE
→ CREDIBLE DONOR-SUPPLY REPORT
→ PROMISE
→ CONSERVED CARGO
→ DELIVERY
→ DESTINATION STOCK + BENEFICIARY NEED + TRUST + ROUTE + PROJECT
```

```text
TERRAIN + WATER + WEATHER + LOAD
→ FOOTING / CURRENT / STABILITY
→ MOVEMENT / FALL / ADRIFT
→ PHYSICAL CARGO SEPARATION
→ DRIFT / DAMAGE / RECOVERY
→ DELIVERY CONDITION
```

```text
FIELD NODE
→ PHYSICAL PACK MATERIAL
→ COMPONENT / GEAR
→ TERRAIN-SPECIFIC BENEFIT
→ WEAR
→ MEND OR LOSSY DISMANTLE
```

```text
RABBIT LIFE
→ LAWFUL PREDATOR CONTACT
→ ONE FINITE BODY
→ LAWFUL DISCOVERY / CLAIM / SCAVENGING
→ FINITE REMAINS
```

The largest composition gaps are also clear:

- Harbor Credit, markets, buying, selling, barter, and paid services are not
  live.
- seamless terrain, regional ecology, cargo, and discovery extend through
  signed infinite space, while the settlement/route/Promise economy remains a
  fixed seven-settlement compatibility network rooted in region `(0, 0)`;
- settlement production can create food, fresh water, and reed through
  zero-input recipe clocks without plants, water, fish, workers, or tools;
- a physical settlement food lot and abstract settlement food stock are two
  unreconciled authorities;
- animal bodies and aquatic populations do not enter processing, crafting,
  player food, settlement stock, or trade;
- occupations label people and affect some decisions, but do not own production
  or project work;
- map knowledge gates a narrow surveyed route-reinforcement action, but has no
  general paid survey/information economy, and current unknown Promise targeting
  can expose exact destinations through presentation paths;
- storms degrade and can temporarily close routes, but condition floors at the
  active threshold and no persistent damage-to-shortage-to-repair loop closes;
- most trust, stress, and recorded travel-cost outputs have few downstream
  consumers.

These are architecture bridges, not requests for more species, currencies,
recipes, or pair-specific scripts.

## Producer / consumer registry

### World, environment, travel, and persistence

| Producer | Output | Consumer / consequence | Status | Quality | Current evidence and gap |
| --- | --- | --- | --- | --- | --- |
| Deterministic terrain | elevation, surface, moisture, roughness | footing, path cost, settlements, habitats, Relief | LIVE | STRONG | One terrain authority drives simulation and presentation. Chart contours and stronger Relief grade legibility remain specified extensions. |
| Terrain + movement + load | grade, speed, turn, contact, support | stamina, stability, fall risk, cargo incident | LIVE | STRONG | Shared footing and player movement consume real physical inputs. Future fast gait must extend this owner. |
| Water + tide + current | depth, flow, turbulence | player movement, ADRIFT, loose cargo, aquatic habitat, soundings | LIVE | STRONG | Water is a shared physical domain. Boats, fishing, flood damage, and broad rescue remain future consumers. |
| Weather + light + terrain | visibility and acoustic conditions | human/wildlife perception and local expression receipt | LIVE | STRONG | Observation is weather- and occlusion-aware. General scent/evidence and all-actor use remain partial. |
| Weather + current + material traits | wetting, impact, drift pressure | loose Promise parcels and recovery | LIVE | STRONG | The same parcel continues physically across drop, movement, region handoff, save, and recovery. Carried exposure and broad item families remain partial. |
| Weather + biome | resource-growth multiplier | field-node regeneration | LIVE | MODERATE | Weather changes real replenishment, but depletion does not yet affect habitat, settlements, or prices. |
| Weather + animal profile | activity/refuge pressure | selected wildlife and domestic routines | LIVE | MODERATE | Representative shared policies are live; fire, fishing yield, and the full settlement-supply/repair response are not. |
| Weather / tide / route state | delay and delivered condition | autonomous porter logistics | LIVE | STRONG | Porters use real route plans and settlement stock. Their cargo is conserved as contract quantity rather than an addressable physical parcel. |
| Weather | storm or adverse conditions | route damage → shortage → repair | PARTIAL | MODERATE | Storms lower route condition and weather can close route plans, but condition cannot fall below the active threshold and no causal maintenance demand closes the restoration loop. |
| World clock | authoritative elapsed ticks | weather, tide, deadlines, needs, recipes, resource cadence, WAIT/REST/SLEEP | LIVE | STRONG | One fixed-step clock is shared and saved; no offline time advances it. Resource cadence consumes elapsed time, not a fabricated day-phase modifier. |
| World phase + weather + terrain + completed beacons | physical outdoor illumination | perception, Chart, Relief | LIVE | STRONG | Only completed-beacon settlement lamps are current local sources; the production field does not yet consume distinct canopy/interior cover. Fire, lantern, astronomy and other local lights remain future producers. Brightness does not authorize sleep. |
| World phase + settlement presence + footing + weather | sleep admission window | player SLEEP action | LIVE | STRONG | Sleep uses time phase, a real settlement refuge, validated footing and storm state. It deliberately does not query outdoor brightness, so local light cannot silently permit or forbid sleep. |
| Time + authenticated destination + actor state | awake/resting/asleep/startled posture and restorative eligibility | forty-two current humans, one settlement working dog, seventeen addressable wildlife activity profiles | LIVE | MODERATE | This is bounded current-roster rest/activity, not general daily life. The other wildlife profiles, aggregate animals, independent dog, companion, occupations, physical homes/beds, feeding, seasons and hibernation are not enacted. |
| Authenticated tide/opportunity or rain/storm state | bounded non-clock routine driver | snowy-egret activity and black-duck activation/refuge | LIVE | MODERATE | These are the two current production examples. Generic driver vocabulary does not prove broader species adoption or downstream vocalization/work. |
| Routine profile + stable identity | `nextEvaluationTick` cadence hint | working-dog `nextThinkTick`; future bounded scheduling | PARTIAL | WEAK | The working dog consumes the hint. Neutral humans and wildlife still project each applicable authoritative tick; later gating must preserve event-driven invalidation rather than silently delaying perception, weather, tide, need or work changes. |
| Supported pre-Turning-Day resident without a routine receipt | clock/location-only recovery | legacy resident physiology continuity | BYPASS | WEAK | This explicit compatibility exception preserves supported old saves until lawful adoption. It is not the contract for new residents and must be retired through real adoption or explicit pre-1.0 format retirement, never fabricated sleep history. |
| Time/routine + occupation/source/work | daily work, feeding, home life and production | settlement stocks, relationships, ecology and expression | SPECIFIED | NONE | A clock, occupation label, driver enum or posture cannot create work. `S1`/`AUT0`, ecology, material-culture, companion, camp and health owners must supply real actions and consequences. |
| Signed infinite world | stable global position and deterministic region data | player, cargo, regional ecology, streaming, Chart/Relief | LIVE | STRONG | Traversal is seamless and bounded. Generated settlements and field resources remain geographically narrower than terrain. |
| Compatibility settlement network | seven settlements, complete pairwise routes, stocks, residents, Promises | infinite regional world | SPECIFIED | NONE | All current settlement origins are in region `(0, 0)`. The settlement-generation owner must scale the existing stock, custody, work, knowledge, and route contracts rather than create a procedural parallel economy. |
| Region streaming | full/coarse/materialized state transitions | ecology, cargo, renderer, saves | LIVE | STRONG | Identity and sparse deviations survive unload/reload. Distant causal breadth remains domain-dependent. |
| Sparse regional discovery | learned terrain and soundings | Chart, navigation, and surveyed route reinforcement | PARTIAL | MODERATE | Knowledge persists compactly and gates one infrastructure action, but there is no complete global expedition atlas, place registry, paid survey, or information economy. |
| Unknown Promise target | current exact settlement knowledge in UI paths | map marker, range, bearing, route/focus | BYPASS | WEAK | Current target presentation can disclose an exact undiscovered destination. Approximate sourced target knowledge and discovery conversion are reserved. |
| Elevation authority | height and grade | Chart contours | SPECIFIED | NONE | No authoritative contour presentation is live yet. It must derive from the existing height field and obey map knowledge. |
| World history | abandoned field equipment | physical salvage, traversal, provenance, trade | SPECIFIED | NONE | No causal sparse field-gear generator is live. It must not become a loot spawner or guaranteed obstacle solution. |

### Actors, ecology, perception, and expression

| Producer | Output | Consumer / consequence | Status | Quality | Current evidence and gap |
| --- | --- | --- | --- | --- | --- |
| Habitat + species catalog | identity, habitat, roles, eligible shared policies | ecology, materialization, perception, presentation | PARTIAL | MODERATE | Forty-five core wildlife profiles share catalog contracts without pairwise brains; seventeen currently have addressable/routine-bound activity profiles. Catalog breadth is not universal full-detail life. |
| Actor senses + world evidence | observation with uncertainty | attention, suspicion, search, intent, memory | LIVE | STRONG | Existing humans and representative animals react through bounded shared perception rather than omniscient state. |
| Physical food + wind/rain/containment | classified scent opportunity | dog and selected wildlife appraisal | PARTIAL | MODERATE | One real food-scent path is live. There is no general scent field for blood, bodies, people, fire, or tracking. |
| Alarm / danger observation | attention and behavioral pressure | other actors that lawfully perceive the event | LIVE | MODERATE | An attended belief that passes the shared core alarm-source policy and species threshold can commit a fish-crow, deer, or marsh-rabbit alarm; Living Voice consumes those same roots rather than maintaining a narrower threat allowlist. All three continue through core ecology to wildlife and dogs without disclosing the threat. Human hearing is species-honest: crow/deer may remain anonymous `animal-alarm`, while the rabbit foot-thump becomes non-interrupting anonymous `physical-thud` rather than decoded intent. General social information and audible alarm breadth remain incomplete. |
| Conserved frog aggregate + committed rain-chorus activity + cadence | one structured anonymous aggregate acoustic event | human/dog hearing, player audio, and shared Living Voice presentation | LIVE | STRONG | The local unpublished representative emits one bounded event per qualifying cadence, not per frog/anchor. Shared masking/range/uncertainty and the sample budget govern receipt; no actor, hidden count, exact anchor, duplicate playback, interruption, or reload replay is created. Other aggregate repertoires remain incomplete. |
| Committed brown-rat aggregate redistribution + paired physical evidence | one structured anonymous physical-rustle event | human/dog hearing, player audio, and shared Living Voice presentation | LIVE | STRONG | The local unpublished representative authenticates the persisted disturbance/evidence/destination tuple rather than using visibility as sound authority. It creates no rat actor or exact source disclosure; range, wind and masking govern receipt, the player gets only heard-unseen direction, and load cannot replay ephemeral audio/text. |
| Fresh domestic-cat rain retreat + matching rain observation and event-owned wet tracks | one source-bound noninterrupting weather-distress call | shared human acoustic carrier plus lawful player audio/caption | LIVE | MODERATE | The local unpublished representative emits only from the exact committed ecology/cognition tuple, not every cat transition. Player receipt and no-replay persistence are directly proven; unseen presentation cannot reveal cat identity, rain motive, or exact locus. Dog/other-animal hearing and broader cat repertoire remain deferred. |
| Selected committed world/actor event | semantic expression intent | current player, human, dog and wildlife representative expression | LIVE | STRONG | Dry exhaustion, porter departure, keeper closure, introduction, weather hold, guardian/wildlife/rabbit and human-warning representatives are event-owned, deterministic, source-bound, knowledge-honest and bounded. This does not imply general conversation/report breadth. |
| Continuing directly visible resident state | quick label, emotion mark, condition detail and ABOUT observation | player interpretation without an invented utterance | LIVE | MODERATE | The renderer-polled quoted-speech adapter is removed. Suspicion, posture, observable exposure, contract and selection remain non-acoustic state unless a committed transition enters Living Voice; authoritative hunger remains deliberately undisclosed rather than gaining invented speech or hidden-need UI. These facts consume no acoustic-text budget and grant no hearing/knowledge receipt. A placed event-owned callout suppresses ordinary labels only for its matching stable actor, preventing collision without hiding unrelated state. |
| Fresh marsh-fox pursuit onset + exact identified living prey | one source-bound restrained pursuit call | lawful player/human hearing, shared audio and bounded acoustic text | LIVE | STRONG | The local unpublished representative authenticates one newly entered ecology-owned pursuit from the materialized fox, exact living target, direct current prey belief, matching resource/memory and committed body locus. Visible presentation may identify the fox; heard-unseen receipt remains an anonymous animal call and cannot disclose prey or motive. Save/reload preserves the causal roots without replaying acknowledged audio/text or duplicating actor hearing. |
| Legacy generic wildlife-alarm fallback | direct sound + session announcement | player-only legacy cue | BYPASS | WEAK | This remaining generic compatibility path bypasses shared acoustic propagation, listener cognition, stable event identity and the acoustic-text presenter. Species-owned crow, rabbit, frog, rat, cat and marsh-fox representatives have migrated; the generic fallback remains active Living Voice integration or retirement work. |
| Directly observed addressable wildlife + current automatic route | immutable observed avoid area | shared path planner retaining the same destination | LIVE | STRONG | Chart/Relief selection, ABOUT, and the ordinary choice transaction work for settlement-home and non-home regional owners. A representative non-home deer detour reaches the destination, persists one replay-safe receipt, and reloads one stable actor; an impossible detour preserves the prior route and ledger, and later hidden movement cannot rewrite the observed spot. This is avoidance, not tracking, capture, hunting, or animal command. |
| Committed vocal or physical domain event | source-bound acoustic event | environmental propagation and listener-specific hearing receipts | PARTIAL | MODERATE | Current speech/calls plus traversal, cargo, dog contact, rabbit thump, frog chorus, rat rustle, cat rain distress, fox pursuit yip and one gear break share stable event identity and hearing. Broader tool/material, routine addressable non-dog contact, arbitrary object/foliage contact, violence and vessels remain `SPECIFIED` with their future producers. |
| Source-bound acoustic event | lawful heard fact with uncertainty | human/animal attention, belief, interruption and response | PARTIAL | STRONG | Current vocal and physical representatives enter bounded spatial hearing without granting visual identity or decoded producer intent. Interruption is explicit; sample saturation bounds fan-out; optional presentation cannot erase an admitted causal leg. Broader cross-species/coarse hearing remains incomplete. |
| Lawful player acoustic receipt | audible semantic cue | audio, shared Living Voice text, directional caption and accessibility | PARTIAL | STRONG | Current representatives share deterministic lanes, collision/repetition suppression, a four-label global cap and one label per source. Visible authenticated/direct-contact sources may anchor; unseen hearing stays coarse and directional. Audio/hearing survive optional text suppression; ephemeral labels/audio do not persist or replay. Legacy ambient-water syllables and step/paddle playback still need explicit event migration or non-acoustic classification. |
| Predator perception + exact contact | one rabbit death and finite body | population decrement, carcass, claims, scavengers | LIVE | STRONG | This narrow rabbit path conserves exact identity and finite units through lawful perception. Unsupported victims and attackers fail closed. |
| Carcass + time/weather | decay state | scavenging, evidence, later material quality | SPECIFIED | NONE | A deterministic tested kernel exists, but no authoritative runtime caller advances it and no material-quality consumer is live. A foundation is not a composed loop. |
| Carcass | physical parts / food | PACK, processing, repair, settlement stock, trade | SPECIFIED | NONE | Harvest/processing is deliberately absent. Future work must transform the same finite body, not spawn loot. |
| Fish/crab/shrimp population | aquatic activity and evidence | birds, otter-like activity, player observation | LIVE | MODERATE | Conserved aggregates affect ecology. They are not currently catchable or economically productive. |
| Fish population | physical catch | player/NPC food, settlement stock, market, extraction pressure | SPECIFIED | NONE | Fishing, tackle, catch bodies, and population-pressure feedback are not live. |
| Physical settlement food lot | scent and finite quantity | rats, chickens, dogs, selected wildlife, keeper knowledge | LIVE | STRONG | Consumption changes the exact lot once. This lot is not reconciled with abstract settlement food stock. |
| Animal extraction | reduced local abundance | predators, future yield, settlement supply and demand | PARTIAL | WEAK | Rabbit death removes one population unit; recovery/reproduction and economic feedback are absent. |
| Resident relationship trust | belonging pressure | resident need/intention selection | PARTIAL | MODERATE | Current relationships are seed-created symmetric one-axis baselines and have no ordinary runtime writer. They contribute to belonging, but do not form an evolving directed social graph or yet affect access, teaching, trade, services, or broad behavior. |
| Seed-derived resident profile | identity, appearance, role, skill/kit/history descriptors | presentation, weather modifiers and narrow courier selection | PARTIAL | WEAK | Names and core appearance are live; navigation/weather skills and two travel-kit tokens have narrow consumers. Other skills, apparent-kit tokens and generated biography are data present only. They are not physical inventory, enacted professions, witnessed history, or proof of a gameplay verb. |
| Living Voice fact transfer | structured warning/report/rumor | actor knowledge and later behavior | PARTIAL | MODERATE | An anonymous strong fish-crow/deer alarm can cause one source-honest human warning, and that warning can become anonymous `danger-sound` knowledge for other residents without disclosing predator identity or recursively re-warning. Separately, an exact committed store closure can authorize one keeper line whose sufficiently clear lawful hearing becomes an anonymous, uncertain `store-secured-report` belief for nearby humans; weak hearing remains generic vocalization, and save/reload consumes the receipt once without replay. A rabbit alarm reaches humans only as `physical-thud`. General reports, rumors, work-state transfer, replies, and broader behavioral response remain future bridges. |
| World phase / actor posture + admitted sound | lawful context for current expression, hearing admission, and interruption | Living Voice expression/receipt and player time actions | LIVE | MODERATE | Sleeping and light/perception state gate applicable current expression/receipt, and admitted strong lawful sound can interrupt player WAIT/REST/SLEEP. This proves admission context, not an ambient soundscape producer. |
| Environment/ecology/social producer + phase/routine context | insect chorus, routine-driven calls, negative-evidence silence, quieter-night masking, or time-aware chatter | Living Voice ambient expression and meaningful silence | SPECIFIED | NONE | Turning Day supplies context but does not emit these consequences. A clock, posture, repertoire, or semantic pool cannot manufacture them before an ecology, environment, or actor/social owner creates the real cause. |

### Materials, settlements, Promises, and economy

| Producer | Output | Consumer / consequence | Status | Quality | Current evidence and gap |
| --- | --- | --- | --- | --- | --- |
| Compatibility-region field node | conserved raw material | player PACK | LIVE | STRONG | Gathering leaves a living reserve and records sparse depletion. Sources outside the compatibility region remain incomplete. |
| Raw field material | prepared component | gear recipes and repair | LIVE | STRONG | Six components consume exact stacks through an atomic DAG. |
| Components / raw materials | stable carried gear item | contextual traversal benefit, wear, MEND, dismantle | PARTIAL | MODERATE | Four positive-condition wearables auto-apply while carried through one deterministic winner per benefit channel; seven catalog outputs are physical but gameplay-staged. Manual equipped state and a separate gear tab are not live. |
| Gear use | condition loss | MEND, replacement, lossy dismantle | LIVE | STRONG | Wear occurs only when a benefit resolves. Repair and salvage conserve exact inputs/outputs. |
| Living plant | biomass / physical part | current material catalog | SPECIFIED | NONE | Present resource nodes are abstractions, not living plants. Botany must reconcile rather than duplicate their stock. |
| Settlement recipe clock | abstract food/water/reed/medicine/parts | settlement inventory ledger | LIVE | MODERATE | Production is deterministic and ledgered, but some inputs are abstract or empty and no worker owns the act. |
| Plant/water/fish source + worker/tool | settlement production | local stock and ecological pressure | BYPASS | NONE | Food, fresh water, and reed can be minted by zero-input timer recipes. This is the largest current magic-input seam. |
| Food/water stock | resident rations and needs | food need and aggregate settlement stress | LIVE | STRONG | Physically present residents consume real counters; shortage changes food need and recomputed stress. Rest comes from circadian state and belonging from resident relationship trust. |
| Settlement stress | production, rationing, Promise urgency, price, behavior | downstream response | SPECIFIED | NONE | Stress is computed and a clinic can mutate it, but no meaningful causal consumer currently reads it; the next recomputation overwrites the clinic decrement. |
| Inter-settlement trust | delivery-history relationship | future access, willingness, information, service, or route decisions | SPECIFIED | NONE | Delivery writes this value, but non-test reads are presentation/session history rather than causal logistics or service decisions. |
| Project stock | project progress | route condition/time, knowledge, stress, recovery/service rules | LIVE | MODERATE | Projects make persistent rule changes, but labor, tools, and occupation are abstract. |
| Completed project | field tool | player physical item custody | BYPASS | NONE | Some project rewards append an enum unlock rather than transferring a stable condition-bearing object. |
| Shortage + credible settlement knowledge + route | Promise offer | player or autonomous porter work | LIVE | STRONG | Jobs arise from low stock only when a known donor and real route qualify. |
| Origin inventory | Promise cargo | player parcel or resident contract custody | PARTIAL | MODERATE | Player cargo receives stable physical identity. Autonomous porter cargo uses a legitimate conserved aggregate contract quantity; nearby addressable/visual custody remains absent. |
| Complete player cargo | destination inventory | stock, beneficiary need, trust, route, project, chronicle | LIVE | STRONG | The principal logistics loop is real and persistent. Exact parcel identity collapses into aggregate stock at handoff. |
| Partial cargo | proportional destination outcome | stock, need, trust, remaining physical parcel | SPECIFIED | NONE | Current handoff rejects an incomplete shipment. The future incident/logistics and arrival-economy owners specify proportional handoff. |
| Cargo condition | grade, project contribution, route reward | usable destination stock | PARTIAL | MODERATE | Condition affects several consequences, but even severely damaged cargo adds its full quantity to usable stock. |
| Signed report | sourced/aged settlement knowledge | donor eligibility and future Promise generation | LIVE | STRONG | Information is carried separately from goods and does not magically move stock. |
| Resident occupation | production or project labor | stock and infrastructure | SPECIFIED | NONE | Role/skills affect identity, porter selection, and beneficiaries, but do not perform settlement recipes or projects; the living-settlement owner carries the obligation. |
| Player crafting stock | settlement project, NPC work, trade, donation | world economy | SPECIFIED | NONE | Player materials currently remain in the personal crafting loop; future settlement/material-culture owners specify the crossing. |
| Harbor Credit | purchase, service, investment | physical stock and progression | SPECIFIED | NONE | HC, wallet, prices, buying, selling, and paid services do not exist at runtime. |
| Physical item / stock | buyer/seller/barter custody | regional market and provenance | SPECIFIED | NONE | There are no buy, sell, barter, vendor-stock, demand-saturation, or ownership-laundering paths yet; future economy owners are assigned. |
| Route distance/difficulty | Promise quote and regional price difference | preparation and trade choice | SPECIFIED | NONE | Travel cost is recorded, but no payment/pricing consumer exists. |

## Coverage reports

### Materials

| Material family | Source | Process | Current consumers | Trade / NPC use | Ecology return | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Nine field materials | deterministic compatibility-region nodes | direct use or six components | MAKE, MEND, four live and seven staged gear kinds | none | node regrowth only | PARTIAL |
| Prepared components | player MAKE | atomic recipe DAG | gear construction, repair, dismantle ancestry | none | none | LIVE |
| Crafted gear | player MAKE | carried auto-use, condition, repair, dismantle | four live travel effects; exact ridge-cleat break can produce one shared acoustic consequence | no market or NPC material use; nearby humans may hear only the anonymous break | same stable item remains carried or loose; no separate equipped copy | PARTIAL |
| Physical provisions | bounded initial/store lots | direct finite consumption | dogs, rats, livestock, selected wildlife | no ordinary producer/trade path | consumed units leave the lot | PARTIAL |
| Rabbit-body resource | exact mortality transaction | finite claims/feeding | six scavenger/predator profiles | no human processing | finite remains; no live decay caller | LIVE |
| Animal-derived material | no runtime source | future body processing | no runtime consumer | none | retained carcass required | SPECIFIED |
| Settlement resources | seeded and recipe-produced counters | recipes, rations, projects, Promises | residents, infrastructure, logistics | no market | disconnected from ecology | BYPASS |

No current raw field-material ID is completely orphaned in the recipe graph.
However, `driftwood` feeds only staged gear, and
`glimmer-spore → glimmer-seal` feeds only staged cargo protection. They are data
and physical outputs without a currently active final gameplay verb.

### Significant items and tools

| Family | Acquire | Use | Damage / repair | Sell / NPC use | Persistence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Player Promise parcel | settlement pickup | delivery, drop, recovery | condition changes physically | no sale | stable physical identity | LIVE |
| Autonomous porter cargo | settlement assignment | route delivery | weather/tide affect condition | aggregate resident custody; no nearby parcel projection | conserved contract quantity / manifests | PARTIAL |
| Four live wearables | gather + MAKE | auto-apply while carried to relevant terrain/weather | wear + MEND + dismantle | none | stable item ID; no equipped-state duplicate | LIVE |
| Seven staged gear kinds | gather + MAKE | advertised verb not live | MEND + dismantle | none | stable item ID | PARTIAL |
| Six inherited Wayknots | starting field kit | deploy/reclaim/traversal/Harp | condition and anti-refresh | no sale/NPC use | stable identity | LIVE |
| Civic field-tool rewards | completed project | traversal effect | limited enum state | none | saved unlock rather than stable physical identity | BYPASS |
| Carcass | narrow rabbit mortality | wildlife feeding | finite resource; tested decay kernel only | no processing/trade | stable body | LIVE |
| Abandoned field gear | no source | no live use path as found history | future condition/repair | future sale/NPC use | future stable identity | SPECIFIED |
| Crafting location / knowledge | anywhere KIT owns PACK / MAKE / MEND | direct known recipes | current personal field loop | workshops/lockers/NPC teaching staged | current pack/save | PARTIAL |

### Biological families

| Family | Ecological role | Player interaction | Body / material | Economy / NPC role | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Addressable wildlife | habitat, activity, groups, pressure | observe, avoid, limited food/custody interactions | rabbit-only body; no human materials | no market/production role | shared signs/ABOUT where supported | PARTIAL |
| Aggregate fish/crab/shrimp | aquatic biomass/activity | observe only | no catch/body | no fishing/stock role | lawful aggregate signs | PARTIAL |
| Rabbit | prey population | observe/avoid aftermath | one finite body | no processing | tracks/body | LIVE |
| Fox/wolf/cougar | exact-contact predator subset | observe/avoid | may create rabbit body | no hunting economy | pursuit/body claim | LIVE |
| Fox/fish crow/boar/wolf/cougar/brown bear | scavenger subset | observe/compete for remains | finite feeding only | no material economy | body claim/guarding | LIVE |
| Chicken/goat | settlement custody/groups | observe and affect store access | no eggs/milk/meat/hide output | no production role | group/home knowledge | PARTIAL |
| Plants/resource flora | field-resource abstraction | gather | nine materials | no NPC livelihood | visible nodes | PARTIAL |

An economic or crafting role is deliberately **NOT APPLICABLE** to many
species. Beauty, sound, ecological pressure, evidence, and relationship are
valid reasons to exist. The shared processing bridge should use body families
and finite state where appropriate, not force every species to drop a unique
material.

### Representative compatibility settlement

| Concern | Current truth | Status |
| --- | --- | --- |
| Local sources | seeded stock plus timer recipes; physical store lot is separate | BYPASS |
| Production | deterministic settlement recipes | LIVE |
| Consumption | food/water rations, recipes, projects, Promise transfer | LIVE |
| Shortages | low counters raise stress and can generate knowledge-qualified work | LIVE |
| Exports/imports | exact Promise stock transfer | LIVE |
| Services | project effects exist; player MEND is anywhere KIT, not a settlement service; no paid service | PARTIAL |
| Occupations | stable roles/skills; no causal work ownership | SPECIFIED |
| Markets | no HC, prices, buying, selling, barter, or saturation | SPECIFIED |
| Infrastructure | stock-consuming projects and parts-based route reinforcement; labor remains abstract | PARTIAL |
| Wildlife/store interaction | one finite physical food store used by rats/livestock/dogs but disconnected from abstract stock | PARTIAL |

### Economy and trade truth

| Question | Verified current answer | Status |
| --- | --- | --- |
| Is Harbor Credit live? | No wallet, ledger, receipt, quote, or HC transaction exists at runtime. | SPECIFIED |
| How is HC earned or spent? | It is not. Promise delivery changes physical stock, need, trust, routes, qualifying projects, and history but pays no currency; repair consumes owned material rather than HC. | SPECIFIED |
| Can the player buy, sell, or barter physical goods? | No buying, selling, vendor stock, barter, regional price, or demand-saturation transaction exists. | SPECIFIED |
| Do settlements hold meaningful stock? | Yes. Counters feed rations, recipes, projects, shortages, and Promise transfers, but physical store lots are separate authority. | PARTIAL |
| Can shortages create work? | Yes, when a credible donor report and real route exist. | LIVE |
| Can the player invest in infrastructure? | Promise delivery can feed projects and projects change services/routes, but no quoted HC/material contribution verb exists. | PARTIAL |
| Does provenance survive trade? | No trade boundary exists to test; future exchange must retain custody/provenance through an atomic receipt. | SPECIFIED |
| Is a no-money softlock possible? | Not currently applicable because HC is absent. The future arrival/economy owner must include a recovery floor before money can gate necessities. | NOT APPLICABLE |
| Can current market arbitrage be exploited? | No market exists. Cargo/reward replay remains protected by command IDs and conservation invariants; future trade requires dedicated exploit tests. | NOT APPLICABLE |

### Reserved or deliberately bounded families

| Family | Current composition truth | Status |
| --- | --- | --- |
| Fire / camp / shelter | Weather, materials, light, scent, actor condition, and field remedies provide future owners; there is no complete physical fire/camp loop to compose yet. | SPECIFIED |
| Health / rescue | Setback, exposure pressure, ADRIFT, and bounded recovery are live; general injury, incapacity, death, rescue debt, and medical-service economy are incomplete. | PARTIAL |
| Human violence / weapons | General human harm, conserved weapon/ammunition economy, surrender, witnesses, and aftermath remain future work. Narrow rabbit mortality is a separate live animal seam. Future impacts, shots, clashes, falls, breakage, shouts, and cries must emit through the shared acoustic-event/hearing/presentation bridge rather than a combat subtitle system. | SPECIFIED |
| Work of Hands / processing | Current PACK / MAKE / MEND conserves materials, but embodied workstation/tool actions are not live. Future cutting, sawing, hammering, lashing, shaping, repair, and dismantling own their physical causes and feed shared acoustic events; repeated work text is clustered/suppressed by Living Voice. | SPECIFIED |
| Long Crossing / boats | Water is authoritative and shared; physical owned boats, passengers, mooring, maritime cargo, and coarse voyages are not live. Future paddle, hull, rope, grounding, wave, collision, and cargo sounds must join the shared acoustic bridge rather than create boat-specific captions. | SPECIFIED |
| Supernatural actors | Ordinary-world inheritance is reserved; no current autonomous supernatural ecology can be composition-tested. | SPECIFIED |
| Dreams / altered perception | The authority boundary is specified: subjective presentation may not mint inventory, actors, map truth, or Promise completion. No broad live loop is claimed. | SPECIFIED |
| Ordinary human identity | Existing humans have stable names, roles, needs, memory, and relationships. | LIVE |
| Human symbolic identity | Later Written Stars grammar must not determine morality, work, violence, or prices. | SPECIFIED |
| Keepsakes / attunement | Provenance-first persistent keepsakes and lived familiarity are reserved; current ordinary physical-item history must remain their substrate. | SPECIFIED |

## Representative causal scenarios

| Scenario | Current status | Composition acceptance |
| --- | --- | --- |
| Shortage + credible donor supply → Promise → delivery | LIVE | Removing the credible donor-supply report prevents the job; restoring it creates the job; pickup and delivery conserve quantity; destination stock, beneficiary need, trust, and route changes survive reload. Covered by `src/sim/systemComposition.integration.test.ts`. |
| Terrain/current → fall/ADRIFT → parcel recovery | LIVE | The same parcel moves, can cross a region, and remains recoverable without duplication. Future incident pickup lock remains specified. |
| Speech + animal call + slip + cargo/tool impact → shared acoustic world | PARTIAL | Current event-owned speech/calls, traversal, cargo, dog/rabbit/frog/rat, the narrow rain-distress cat and pursuit-yip fox representatives, and one gear break share one hearing/presentation path. Counterfactuals remove the causal domain event and therefore its sound/receipt; saturating optional text does not erase authenticated audio or bounded actor hearing, including the fox's admission-free fallback; reload does not replay ephemeral output. Broad tools, foliage, violence, vessels and routine addressable non-dog contact remain future-owner bridges. |
| Field node → gear → wear → MEND/dismantle | PARTIAL | One representative item consumes exact materials, changes an appropriate terrain consequence, wears only while helping, and conserves repair/salvage; seven other outputs remain staged. |
| Animal → body → scavenger | LIVE | One eligible rabbit death retires the life/population unit and creates one finite body used only after lawful perception, reach, and claim. |
| Animal → human processing → economy | SPECIFIED | Future scenario must retain the body, remove only finite parts, leave remains for ecology, then use or transfer the same physical output. |
| Fish shortage | SPECIFIED | Population pressure must affect catch, stock, demand/work, and later recovery without manufacturing individual fish merely for UI. |
| Storm damages route | PARTIAL | Weather already lowers route condition and can close planning. Future work must let meaningful damage propagate through supply/shortage/maintenance and let accountable repair restore the same route. |
| Long-haul delivery | PARTIAL | Current delivery/route consequences are live; future spacing, quote, preparation, map uncertainty, and discovered waypoint rules remain reserved. |
| Abandoned field tool | SPECIFIED | World history creates one sparse deterministic object; pickup, repair/use/sale, relocation, and revisit must preserve the same ID. |
| Owned salvage | SPECIFIED | Return/keep/sell consequences require owner knowledge, witnesses/evidence, and provenance that survives the transaction. |
| Plant → infrastructure | SPECIFIED | Harvest must alter a living source, create a conserved material, feed an actual component/project, and leave source/regrowth truth. |
| Map / survey economy | PARTIAL | Learned survey state already gates route reinforcement. A future sourced commission pays exactly once and makes broader route/hazard knowledge economically useful. |
| Failure / economic recovery | PARTIAL | Physical cargo recovery and accountable handoff exist. Debt, barter, local paid work, rescue costs, and no-money recovery cannot be evaluated before HC exists. |

Scenario tests should change or remove one real cause and observe the downstream
result. Do not satisfy composition with a scripted scene ID. Use representative
families and shared invariants rather than a species-by-species or N-squared
interaction suite.

## Causal ablation results

| Remove or neutralize | Systems that currently notice | Diagnosis |
| --- | --- | --- |
| Terrain/elevation | habitat, movement, stamina, falls, cargo motion, discovery, and Relief | strongly composed |
| Weather | traversal, route planning/condition, cargo, porter exposure, event-owned resident route-hold speech/hearing, cat rain-distress expression, perception, wildlife activity, and field-resource growth | strongly composed locally; persistent repair/economy circle incomplete |
| Routes | Promise generation, autonomous logistics, infrastructure, and settlement resilience | strongly composed inside the compatibility network |
| Physical cargo | Promise custody, falls/ADRIFT, delivery, save conservation, and field presentation | strongly composed |
| Biodiversity | habitat/activity/evidence, animal perception, finite food lots, narrow mortality and scavenging | composed ecologically; human material/economy bridge absent |
| Crafting/PACK | field harvesting, gear acquisition, four travel adaptations, wear, MEND, and dismantling | composed player loop; settlements/NPCs do not consume it |
| Cartography | navigation, learned-terrain projection, soundings, recovery cues, and surveyed route reinforcement | narrow infrastructure consumer; no general paid information economy |
| World time / Turning Day | weather, tides, needs, recipes, player time actions, physical light, forty-two human rest projections, one working dog, and seventeen wildlife routines | strongly composed for elapsed time and the named bounded roster; daily work, feeding, interiors, companion life, broad nocturnal ecology and time-aware Voice remain future |
| Living Voice / embodied-acoustics candidate | current event-owned player/human/dog/wildlife expression plus traversal/cargo/gear acoustics, lawful hearing and shared bounded presentation | removing the candidate changes real expression, hearing, warning/knowledge consequences, audio/captions and collision control. Breadth remains partial because the generic-alarm player-only cue, ambient-water syllables, legacy step/paddle playback and broad animal/object/tool/violence/vessel producers are not integrated. Continuing resident state is deliberately non-acoustic. |
| Settlement stock/logistics core | shortages, Promises, residents, projects, routes, trust, and histories | strong finite loop; no HC/market and no infinite-world settlement bridge |
| Deep Time / field gear / supernatural systems | almost no current gameplay | correctly marked future rather than falsely live |

## Highest-value dead ends

1. **Inter-settlement trust** is produced by delivery but has no meaningful
   decision, access, information, route, or service consumer beyond
   presentation/history.
2. **Settlement stress** is produced by needs and shortages but does not yet
   change production, rationing, urgency, markets, or most behavior.
3. **Resident occupations** provide identity, skills, courier suitability, and
   beneficiary selection but do not perform the work their labels imply.
4. **Delivery trace cost** is stored but has no quote/payment consumer.
5. **Seven crafted gear outputs** are physical and maintainable but lack their
   advertised live verb.
6. **Carcass decay** has a deterministic foundation without a complete live
   environmental caller.
7. **Most diet and food-web metadata** does not yet lead to consumption,
   biomass change, settlement output, or economic pressure.
8. **Field-resource depletion** changes only that node's regrowth; habitats,
   wildlife, settlements, and markets do not notice.
9. **Persistent map knowledge** helps presentation/navigation and gates one
   surveyed route-reinforcement action, but has no general survey job or
   information-market consumer.
10. **Living Voice facts** now support one causal human-warning propagation
    slice, but general reports, rumors, work-state transfer, and response breadth
    remain unfinished.
11. **Human profile breadth** includes skills, apparent-kit tokens, biography,
    generic intentions and static trust whose current consumers are narrower
    than their names. Future owners must connect them to real actions rather
    than treating persisted data as completed gameplay.

## Magic inputs and bypasses

1. Food, fresh water, and reed settlement recipes have empty input arrays and
   run on a timer. The conservation ledger records production, but ecology,
   water access, labor, tools, and weather are bypassed.
2. Civic projects consume one stock unit at cadence without a worker, tool, or
   location-owned work transaction.
3. Some completed projects append a field-tool enum to the player rather than
   transfer a persistent condition-bearing object.
4. Physical settlement produce and abstract settlement food are separate stock
   realities; a rat or chicken can consume one without affecting shortages.
5. Damaged Promise cargo adds its entire quantity to usable settlement stock.
6. Current unknown-destination presentation can reveal exact objective location
   through markers, distance/bearing, routing, focus, or touch despite the
   intended knowledge contract.
7. The generic wildlife-alarm compatibility cue plays directly to the player
   and announces through the session path rather than entering shared acoustic
   propagation and actor cognition. The marsh-fox pursuit yip no longer uses
   this bypass.
8. Ambient-water syllables and legacy step/paddle playback still sit outside
   the committed acoustic-event/receipt boundary; they require explicit
   migration or a truthful non-acoustic classification before Voice closes.

## Deliberate initial abstractions

- Autonomous porter cargo is a conserved aggregate contract quantity. That is
  a legitimate coarse authority; nearby addressable/visual custody remains a
  future parity improvement, not evidence that cargo was minted.
- One bounded dried-fish starting stimulus proves wildlife scavenging without a
  live fishery. It is acceptable only while explicit, finite, nonrenewable, and
  never presented as an ecology-produced catch.
- An occupied settlement is a reciprocal rest refuge for the current human
  routine. It authenticates physical presence and recovery without pretending a
  house, room, bed, guest berth or interior has been simulated.

## Authority risks to close

These are exposure risks rather than demonstrated player-facing bypasses:

1. Important route-reinforcement location/survey preconditions are enforced by
   the current runtime adapter rather than the lower simulation command owner;
   a future caller could omit them.
2. A low-level self-source knowledge command can accept caller-supplied
   quantity/confidence. The live runtime supplies witnessed authoritative
   values, but future callers must not bypass that adapter.

## Deliberate non-connections

Strong composition also requires boundaries:

- dreams and hallucinations do not mint currency, inventory, actors, collision,
  map truth, or Promise completion;
- human symbolic identity does not determine morality, prices, occupation, or
  violence;
- accessibility and mobile alter input/presentation, not world scarcity or
  economic rules;
- supernatural beings are not efficient generic crafting-resource nodes;
- human remains do not enter an ordinary material economy;
- many wildlife species have no player-facing material or market role;
- camera visibility does not activate simulation truth;
- expression does not grant knowledge merely because the game knows a fact;
- map knowledge does not reveal every item inside mapped terrain;
- a nearby obstacle does not cause its solution tool to spawn.

## High-leverage composition repair registry

Execution planning owns detailed dependency ordering, minimum slices, tests,
and assignment. This canonical registry keeps only durable gap, status, owner,
and closure truth.

| Priority | Bridge | Status | Canonical owner | Execution frontier | Durable closure evidence |
| ---: | --- | --- | --- | --- | --- |
| 1 | Infinite world ↔ settlement/logistics network | SPECIFIED | settlement generation + world streaming + Promise network | `S1-CIRCUIT`, then 15_2 breadth | A deterministic distant settlement reuses existing stock, knowledge, custody, route, coarse-simulation, and save authority. |
| 2 | Physical lot ↔ aggregate settlement stock | SPECIFIED | physical conservation + settlement stock | `P1A` deposit / `P1C` withdrawal; `S1` exchange | One idempotent deposit/withdraw receipt prevents aliasing, minting, replay, and provenance loss. |
| 3 | Source/work/tool ↔ settlement production | BYPASS | settlement production + living-actor work | `S1`, consumed by `AUT0` | Representative production cites an actual source and bounded work receipt; removing either changes output. |
| 4 | Living plant ↔ existing field material | SPECIFIED | botany + material sources | `BOT1`/`BOT2` | Harvest changes one living source, yields an existing conserved material, affects habitat, and cannot double with a node. |
| 5 | Time/weather ↔ carcass aftermath | SPECIFIED | mortality/aftermath + environment | `E1`/`A1` | Authoritative time advances the finite body and its scavenger/evidence state across save and streaming. |
| 6 | Finite carcass ↔ physical part/food | SPECIFIED | material culture consuming mortality | Work of Hands: `Nothing Wasted` | Processing removes exact units, creates conserved outputs, and leaves altered remains rather than loot. |
| 7 | Ecological population ↔ livelihood/extraction pressure | SPECIFIED | ecology + work + settlement production | `S1` + Fisher/harvest slices | Catch/harvest changes availability; local stock and demand respond without per-species scripts. |
| 8 | Promise/service ↔ HC and conserved exchange | SPECIFIED | economy + physical conservation | `P1A`, then `S1` | Payment and one useful spend commit atomically with stock/item/service consequence and cannot replay. |
| 9 | Cargo quantity/condition ↔ proportional arrival | PARTIAL | Promise/logistics + settlement stock | `P1A` | Only accepted usable quantity changes stock/need/reward; every remainder keeps physical authority. |
| 10 | Storm route degradation ↔ shortage/maintenance/restoration | PARTIAL | environment + route/infrastructure | `T1` + `S1` + `AUT0` + HARD | Existing damage propagates into logistics and accountable repair restores the same route. |
| 11 | Unknown destination knowledge ↔ Promise presentation | BYPASS | expedition cartography + Promise knowledge | `Q1-GAIT-JOURNEY` map slice | No view, marker, route, focus, or control leaks an exact target before legitimate discovery. |
| 12 | Traversed/surveyed knowledge ↔ information economy | PARTIAL | cartography + accountable knowledge + economy | `T1`/`S1` | Beyond the live reinforcement gate, sourced survey work can consume learned facts and settle once. |
| 13 | Trust/stress/travel cost ↔ actor and offer decisions | SPECIFIED | Living Weft + settlements + Promise/economy | `S1` and later offer owners | An already-produced value changes a lawful decision or opportunity through a bounded transparent rule. |
| 14 | Civic project output ↔ stable physical tool | BYPASS | infrastructure + physical items | `P1A` service / HARD aid | A project transfers one source-owned stable-ID tool with condition, custody, loss, and repair. |
| 15 | Autonomous porter cargo ↔ nearby addressable custody | PARTIAL | cargo + actor visuals + coarse simulation | `P1C` + `VIS0-CORE` | Full/near/coarse transitions preserve one conserved quantity while nearby custody becomes inspectable and recoverable. |

The ordering prioritizes reusable architecture bridges over content count. A
future owner may refine order when dependencies change, but it must update this
registry rather than silently dropping the obligation.

## Performance, persistence, and authority gate

Composition does not authorize every system to query every other system.

Before accepting a new bridge, ask whether it creates full-world fan-out,
duplicated computation, actor-to-actor/all-to-all work, unbounded event,
listener, or presentation propagation, or repeated derivation of state another
owner already computes. A causal connection is not healthy if every producer
awakens every possible consumer. Route consequences through the smallest
lawful spatial/event candidate set and one shared derived-state owner or exact
cache with explicit invalidation.

Use:

- domain-owned transactions;
- typed world events;
- physical object/custody records;
- sourced knowledge records;
- spatial candidate queries;
- scheduled or event-driven work;
- full / near / coarse / archived fidelity;
- sparse deviations and bounded receipts.

Reject:

- per-frame economy recomputation;
- every settlement checking every animal;
- every actor checking every market;
- pairwise species interaction functions;
- cross-system mutation through renderer/UI state;
- full-world scans where an index or event suffices;
- unbounded event/listener/label queues or broadcast fan-out;
- duplicate Chart/Relief, perception, acoustic, terrain, or market derivation;
- save logs that append every routine use forever.

Every completed bridge must survive current-schema save/reload. A sold item
stays sold, processed body stays processed, stock stays moved, route stays
repaired, population pressure stays changed, and a receipt cannot pay twice.
That conservation requirement is independent of compatibility era. Before
official stable 1.0, an obsolete internal development format may instead be
explicitly rejected and reset fail-closed; it must never receive a best-effort
partial load. From the official 1.0 baseline onward, the same consequences must
also survive every supported deterministic forward migration, and later
prerelease work cannot retire that baseline.

## Feature-closure composition record

For substantial future work, record only the applicable rows:

```text
FEATURE:
PRODUCES:
CONSUMES:
AFFECTS:
AFFECTED BY:

LIVE CONNECTIONS:
PARTIAL:
SPECIFIED:
MISSING:
BYPASS CONNECTIONS:
NOT APPLICABLE:

PHYSICAL CONSERVATION:
KNOWLEDGE HONESTY:
NPC / COARSE PARITY:
ECONOMY / STOCK:
ECOLOGY:
PERSISTENCE / MIGRATION:
PERFORMANCE:
TESTED COMPOSITION SCENE:
```

Before closing a major system:

1. inventory its meaningful outputs and inputs;
2. trace each important output to a consumer and each important input to a
   causal source;
3. classify the connections above;
4. remove or explicitly own every BYPASS;
5. assign unresolved work to an active or future owner;
6. update this registry and `SYSTEM_INHERITANCE` only when a durable reusable
   contract changes;
7. use at least one counterfactual multi-system scenario;
8. preserve bounded runtime work and exact save authority;
9. leave completed historical execution records unchanged.

The permanent laws are:

**MAJOR SYSTEMS SHOULD CREATE CONSEQUENCES OTHER SYSTEMS CAN CONSUME.**

**IMPORTANT INPUTS NEED ACCOUNTABLE SOURCES.**

**NEW CONTENT INHERITS THE WORLD.**

**NOTHING IMPORTANT HAPPENS IN A VACUUM.**
