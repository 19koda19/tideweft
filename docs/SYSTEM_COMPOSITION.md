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
| Perception, embodied acoustics, and Living Voice | `src/sim/actorPerception.ts`, `src/game/humanPerception.ts`, `src/game/physicalAcousticPerception.ts`, `src/game/dogPhysicalAcousticPerception.ts`, `src/game/traversalFeedback.ts`, `src/game/worldAcoustics.ts`, `src/game/worldAcousticPresentation.ts`, `src/game/worldAcousticPresentationQueue.ts`, `src/game/situatedExpression.ts`, `src/game/playerStepState.ts`, `src/game/playerEffortExpression.ts`, `src/game/workingPeopleExpression.ts`, `src/game/dogSignalExpression.ts`, `src/game/coreWildlifeSignalExpression.ts`, `src/game/humanDangerWarningExpression.ts`, `src/game/settlementKeeperStoreResponseExpression.ts`, `src/game/settlementKeeperStoreResponseAdmissionAuthority.ts`, `src/game/residentIntroductionExpression.ts`, `src/game/residentIntroductionAdmissionAuthority.ts`, `src/game/residentWeatherHoldExpression.ts`, `src/game/residentWeatherHoldAdmissionAuthority.ts`, `src/game/situatedExpressionAcoustics.ts`, `src/render/acousticTextLayout.ts`, `src/render/playerPresentation.ts` | `ARCHITECTURE.md`, `GAME_DESIGN.md`; perception/expression/traversal/acoustic-layout/presentation tests. Vocal expression, the authenticated first resident introduction, one event-owned resident weather hold, committed secured-storekeeper reply, sparse committed dry-exhaustion murmur, human warning, traversal, cargo impact, representative dog contact, bounded human/dog contact hearing, directional unseen captioning, and shared Chart/Relief arbitration are live; producer/consumer breadth remains incomplete. |
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
| World time | day phase and authoritative elapsed ticks | needs, residents, wildlife routines, WAIT/REST/SLEEP, resource cadence | LIVE | STRONG | One fixed-step clock is shared and saved; no offline time advances it. |
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
| Alarm / danger observation | attention and behavioral pressure | other actors that lawfully perceive the event | LIVE | MODERATE | An attended belief that passes the shared core alarm-source policy and species threshold can commit a fish-crow or deer alarm; Living Voice consumes that same policy rather than maintaining a narrower threat allowlist. Both continue through core ecology to wildlife and dogs and create source-bound human hearing without disclosing the threat. General social information and audible alarm breadth remain incomplete. |
| World/actor event | semantic expression intent | player traversal/recovery and dry-exhaustion expression, first working-porter expression, committed secured-storekeeper response, authenticated first resident introduction, event-owned resident weather hold, three causal guardian signals, two causal core-wildlife alarms (fish crow and deer), and one perception-caused human warning | LIVE | STRONG | In the local unpublished candidate, expression is event-owned, deterministic, source-bound, reception-honest, and anti-spam. One committed dry-ground movement step from positive stamina to zero may produce a self-felt restrained murmur; its generic state trajectory is anchored before the first current sample, chained across later recovery, checked against final player state, and required to continue its exact movement-owned predecessor. A between-step stamina gap cannot masquerade as the cause. Idle/recovery, water/rescue, already-zero stamina, and same-step traversal incidents cannot originate the cue. The keeper reply consumes the exact applied closure and player-report evidence rather than session-local text. The first introduction atomically consumes a disposable candidate's exact interaction event, positive heard-visible receipt, shared-channel reservation, and acquaintance/fact/memory authority; masked or unreservable candidates leave the resident recognized. Name, role, and home wording is resolved only from authenticated projection facts, while anonymous hearers receive no identity payload. A resident weather hold consumes the exact committed shelter transition, active carried Promise, conserved cargo, shelter memory, and historical route locus; the continuing condition alone is silent. The human warning retains its source observation and cannot recursively propagate through derived human `danger-sound`; wider work, remaining animal repertoires, reports/rumors, and conversation remain active work. |
| Committed vocal or physical domain event | source-bound acoustic event | environmental propagation and listener-specific hearing receipts | PARTIAL | MODERATE | Situated player/porter/storekeeper/resident-introduction/resident-weather-hold/dog/fish-crow/deer/human-warning expression has stable admitted sound identity and shared hearing. The dry-exhaustion transition and exact route-shelter transition use that same acoustic/perception authority rather than private condition captions. Traversal incidents, committed cargo shocks, actual movement of the existing dogs, and an exact stable-ID ridge-cleat break now create structured events; traversal, standalone sweeps, and that authenticated gear break feed audio, optional text, and the bounded NPC player-sound sample from those semantics. Broader tool/material, non-dog animal physical contact, arbitrary-object/foliage contact, violence, and vessel emissions remain specified. |
| Source-bound acoustic event | lawful heard fact with uncertainty | human/animal attention, belief, interruption, and response | PARTIAL | STRONG | Vocal samples, including an admitted resident weather hold, reach nearby humans without granting visual identity; fish-crow and deer alarms retain ecology-owned wildlife/dog propagation while Living Voice owns deduplicated human hearing and player playback, and the resulting human warning can enter other residents' hearing anonymously. Player traversal and ridge-cleat-break contact reach nearby humans through the bounded player sample. Actual BIO0/working-dog contact enters a distinct authenticated carry before the player-hearing gate and reaches the next eligible nearby-human and eligible full-simulation in-window-dog frame exactly once through the shared physical evaluator, with listener-local weather/water masking, anonymous uncertainty, species-sensitive range, and source-ID exclusion. Ordinary `physical-*` contact can affect dog attention but is not relabeled as threat or assignment-compatible alarm. A frame rebase retires a contact only after its source leaves this current-frame consumer scope. Exact dog prior-position authority and non-dog object/animal consumers remain incomplete, as do broad cross-species and coarse/cross-frame hearing. Presentation suppression never removes this causal leg. |
| Lawful player acoustic receipt | audible semantic cue | audio, shared Living Voice world text, directional caption, and accessibility | PARTIAL | STRONG | Active expression channels, the secured-store response, the first resident introduction, the resident weather-hold response, guardian and supported core-wildlife calls, traversal, cargo, representative dog contact, and the direct-contact ridge-cleat break enter receipt-backed arbitration. A weather hold may be heard-visible, heard-unseen, or absent from player presentation while retaining world hearing; its phase-zero sleeping bit is persisted beside listener pose for exact reload validation. Remaining directly visible legacy resident state speech joins only the same world-label collision layout and cannot become an acoustic DOM caption until its interaction seam gains event-time sound authority. Chart and Relief share deterministic source-relative lanes, collision suppression, a four-label global cap, and a one-label-per-source cap; a bounded physical queue coalesces same-source repetition, and suppression never erases audio or hearing. Heard-visible/self/direct-contact physical events may anchor; heard-unseen physical events expose only a coarse accessible word and direction. Renderer-owned ambient-water syllables still bypass event identity and the shared budget; ADRIFT's old syllable fallback is suppressed whenever production shared projection is present. Ephemeral labels do not persist or replay; the introduction's exceptional current-interval readability guarantee is re-derived as an acknowledged presentation remainder from persisted semantic authority, not stored as UI state. |
| Predator perception + exact contact | one rabbit death and finite body | population decrement, carcass, claims, scavengers | LIVE | STRONG | This narrow rabbit path conserves exact identity and finite units through lawful perception. Unsupported victims and attackers fail closed. |
| Carcass + time/weather | decay state | scavenging, evidence, later material quality | SPECIFIED | NONE | A deterministic tested kernel exists, but no authoritative runtime caller advances it and no material-quality consumer is live. A foundation is not a composed loop. |
| Carcass | physical parts / food | PACK, processing, repair, settlement stock, trade | SPECIFIED | NONE | Harvest/processing is deliberately absent. Future work must transform the same finite body, not spawn loot. |
| Fish/crab/shrimp population | aquatic activity and evidence | birds, otter-like activity, player observation | LIVE | MODERATE | Conserved aggregates affect ecology. They are not currently catchable or economically productive. |
| Fish population | physical catch | player/NPC food, settlement stock, market, extraction pressure | SPECIFIED | NONE | Fishing, tackle, catch bodies, and population-pressure feedback are not live. |
| Physical settlement food lot | scent and finite quantity | rats, chickens, dogs, selected wildlife, keeper knowledge | LIVE | STRONG | Consumption changes the exact lot once. This lot is not reconciled with abstract settlement food stock. |
| Animal extraction | reduced local abundance | predators, future yield, settlement supply and demand | PARTIAL | WEAK | Rabbit death removes one population unit; recovery/reproduction and economic feedback are absent. |
| Resident relationship trust | belonging and selected actor appraisal | resident need/behavior state | LIVE | MODERATE | Resident relationship trust contributes to belonging. Wider willingness, access, teaching, and services remain specified consumers. |
| Living Voice fact transfer | structured warning/report/rumor | actor knowledge and later behavior | PARTIAL | MODERATE | An anonymous animal alarm can cause one source-honest human warning, and that warning can become anonymous `danger-sound` knowledge for other residents without disclosing predator identity or recursively re-warning. General reports, rumors, work-state transfer, and response breadth remain future bridges. |

### Materials, settlements, Promises, and economy

| Producer | Output | Consumer / consequence | Status | Quality | Current evidence and gap |
| --- | --- | --- | --- | --- | --- |
| Compatibility-region field node | conserved raw material | player PACK | LIVE | STRONG | Gathering leaves a living reserve and records sparse depletion. Sources outside the compatibility region remain incomplete. |
| Raw field material | prepared component | gear recipes and repair | LIVE | STRONG | Six components consume exact stacks through an atomic DAG. |
| Components / raw materials | stable gear item | traversal benefit, carrying, wear, MEND, dismantle | PARTIAL | MODERATE | Four wearables have live physical benefits; seven catalog outputs are physical but gameplay-staged. |
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
| Crafted gear | player MAKE | use, condition, repair, dismantle | four live travel effects; exact ridge-cleat break can produce one shared acoustic consequence | no market or NPC material use; nearby humans may hear only the anonymous break | none | PARTIAL |
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
| Four live wearables | gather + MAKE | terrain/weather adaptation | wear + MEND + dismantle | none | stable item ID | LIVE |
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
| Speech + animal call + slip + cargo/tool impact → shared acoustic world | PARTIAL | Production now retains all active expression channels plus a bounded physical queue. A committed dry-ground positive-stamina-to-zero movement may produce one self-felt restrained murmur through shared expression, acoustic, and perception authority; idle/recovery, water/rescue, and traversal-conflict paths remain silent. The committed starting-store closure produces one receipt-backed keeper reply through shared audio/text/hearing. One exact `resident-sheltered` transition now produces a restrained route-hold utterance only while its human, active carried Promise, conserved cargo, weather memory, and historical route locus agree; continued shelter state cannot repeat it, and absent player reception does not erase bounded nearby-human hearing. The first successful resident introduction now adopts acquaintance only with its exact committed event, positive event-time receipt, phase-zero carry anchor, and reserved shared trajectory; masked/capacity-refused attempts remain recognized. It projects identity wording only from authenticated player facts and enters shared audio/text/hearing without exporting those facts to anonymous human listeners. Its event owns the exact route or settlement/ordinal source locus, its sound enters actor hearing once, and a protected bounded lease preserves configured text readability through same-source priority arbitration. The preceding outer-v44/carry-v12 reload preserved accepted pending expression and its hearing sample without replay; if an interruption hid the first line, runtime re-derived only the unexpired audio-acknowledged presentation remainder from authenticated carry rather than persisting or replaying a label. Current outer-v45/carry-v13 adds one species-aware fish-crow/deer admission, exact deer-alarm save authentication, deliberate v44 retirement, and no audio/hearing/text replay on reload. Outer v41 through v44 are deliberately rejected as incompatible pre-1.0 development saves, while supported pre-v41 migrations remain semantically fenced against later expression state. Remaining direct resident state speech, broader animal calls, traversal, committed cargo impact, representative dog movement, and an exact stable-ID ridge-cleat break enter one deterministic Chart/Relief layout; the break exists only after physical-cargo authority matches its condition receipt, and routine wear cannot fabricate it. Heard-unseen physical sound uses only a coarse accessible direction, and reload does not replay ephemeral labels. Dog contact is also retained as authenticated current-schema hearing carry, independent of player presentation, and consumed by the next eligible human/full-simulation-dog perception frame exactly once. A save/reload fixture proves one dog can hear another's real contact anonymously without self-hearing or replay; dog-behavior and working-assignment gates separately prove ordinary `physical-*` contact cannot become threat, alarm, retreat, or assigned investigation. A mixed projection fixture proves concurrent expression/physical arbitration, while broad domain producers, multi-source aggregate clustering, and non-dog animal response to contact remain incomplete. |
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
| Weather | traversal, route planning/condition, cargo, porter exposure, event-owned resident route-hold speech/hearing, perception, wildlife activity, and field-resource growth | strongly composed locally; persistent repair/economy circle incomplete |
| Routes | Promise generation, autonomous logistics, infrastructure, and settlement resilience | strongly composed inside the compatibility network |
| Physical cargo | Promise custody, falls/ADRIFT, delivery, save conservation, and field presentation | strongly composed |
| Biodiversity | habitat/activity/evidence, animal perception, finite food lots, narrow mortality and scavenging | composed ecologically; human material/economy bridge absent |
| Crafting/PACK | field harvesting, gear acquisition, four travel adaptations, wear, MEND, and dismantling | composed player loop; settlements/NPCs do not consume it |
| Cartography | navigation, learned-terrain projection, soundings, recovery cues, and surveyed route reinforcement | narrow infrastructure consumer; no general paid information economy |
| Living Voice / embodied-acoustics candidate | authenticated player/porter/storekeeper/resident-introduction/resident-weather-hold sound, sparse committed dry-exhaustion expression, three causal guardian calls, two ecology-owned core-wildlife alarms (fish crow and deer), one perception-caused human warning, traversal/cargo acoustics, one stable-item gear break, representative dog contact, and shared Chart/Relief text arbitration | the vocal slice is causally composed; removing it changes the dry-exhaustion murmur, secured-storekeeper response, first resident introduction, route-weather-hold expression and reception, world hearing, captions, interruption, anonymous warning propagation, and persisted semantic memory. Removing embodied acoustics also breaks traversal/standalone-sweep audio semantics, the ridge-cleat break's shared `crack`, NPC player-sound sampling, bounded dog-contact human/dog hearing, cargo/dog/tool contact presentation, directional physical captions, repetition coalescing, and shared collision control. Breadth remains partial because remaining legacy state speech, ambient-water syllables, and broad animal/object/tool/violence/vessel producers are not integrated. |
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

## Deliberate initial abstractions

- Autonomous porter cargo is a conserved aggregate contract quantity. That is
  a legitimate coarse authority; nearby addressable/visual custody remains a
  future parity improvement, not evidence that cargo was minted.
- One bounded dried-fish starting stimulus proves wildlife scavenging without a
  live fishery. It is acceptable only while explicit, finite, nonrenewable, and
  never presented as an ecology-produced catch.

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

| Priority | Bridge | Status | Canonical owner | Durable closure evidence |
| ---: | --- | --- | --- | --- |
| 1 | Infinite world ↔ settlement/logistics network | SPECIFIED | settlement generation + world streaming + Promise network | A deterministic distant settlement reuses existing stock, knowledge, custody, route, coarse-simulation, and save authority. |
| 2 | Physical lot ↔ aggregate settlement stock | SPECIFIED | physical conservation + settlement stock | One idempotent deposit/withdraw receipt prevents aliasing, minting, replay, and provenance loss. |
| 3 | Source/work/tool ↔ settlement production | BYPASS | settlement production + living-actor work | Representative production cites an actual source and bounded work receipt; removing either changes output. |
| 4 | Living plant ↔ existing field material | SPECIFIED | botany + material sources | Harvest changes one living source, yields an existing conserved material, affects habitat, and cannot double with a node. |
| 5 | Time/weather ↔ carcass aftermath | SPECIFIED | mortality/aftermath + environment | Authoritative time advances the finite body and its scavenger/evidence state across save and streaming. |
| 6 | Finite carcass ↔ physical part/food | SPECIFIED | material culture consuming mortality | Processing removes exact units, creates conserved outputs, and leaves altered remains rather than loot. |
| 7 | Ecological population ↔ livelihood/extraction pressure | SPECIFIED | ecology + work + settlement production | Catch/harvest changes availability; local stock and demand respond without per-species scripts. |
| 8 | Promise/service ↔ HC and conserved exchange | SPECIFIED | economy + physical conservation | Payment and one useful spend commit atomically with stock/item/service consequence and cannot replay. |
| 9 | Cargo quantity/condition ↔ proportional arrival | PARTIAL | Promise/logistics + settlement stock | Only accepted usable quantity changes stock/need/reward; every remainder keeps physical authority. |
| 10 | Storm route degradation ↔ shortage/maintenance/restoration | PARTIAL | environment + route/infrastructure | Existing damage propagates into logistics and accountable repair restores the same route. |
| 11 | Unknown destination knowledge ↔ Promise presentation | BYPASS | expedition cartography + Promise knowledge | No view, marker, route, focus, or control leaks an exact target before legitimate discovery. |
| 12 | Traversed/surveyed knowledge ↔ information economy | PARTIAL | cartography + accountable knowledge + economy | Beyond the live reinforcement gate, sourced survey work can consume learned facts and settle once. |
| 13 | Trust/stress/travel cost ↔ actor and offer decisions | SPECIFIED | Living Weft + settlements + Promise/economy | An already-produced value changes a lawful decision or opportunity through a bounded transparent rule. |
| 14 | Civic project output ↔ stable physical tool | BYPASS | infrastructure + physical items | A project transfers one source-owned stable-ID tool with condition, custody, loss, and repair. |
| 15 | Autonomous porter cargo ↔ nearby addressable custody | PARTIAL | cargo + actor visuals + coarse simulation | Full/near/coarse transitions preserve one conserved quantity while nearby custody becomes inspectable and recoverable. |

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
