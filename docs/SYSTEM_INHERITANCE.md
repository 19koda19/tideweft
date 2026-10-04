# TIDEWEFT system inheritance registry

## Purpose

This registry answers one question:

> When a new thing enters TIDEWEFT, which existing contracts must it join?

It is an applicability map, not another design bible and not a release ledger.
Detailed mechanics remain with their canonical domain owners. The links in
this public registry route to durable public summaries without exposing
ignored/private planning or domain material:

- [Architecture](./ARCHITECTURE.md#cross-system-inheritance-and-bounded-work)
  summarizes runtime boundaries, deterministic authority, world
  representation, persistence, rendering, performance, platform, and
  verification contracts.
- [Game design](./GAME_DESIGN.md#living-world-slice) summarizes the
  player-facing world, loops, verbs, knowledge contract, recovery,
  accessibility, and honest current feature boundary.
- [Crafting design](./CRAFTING_DESIGN.md#authoritative-invariants) summarizes
  physical material, pack, recipe, condition, repair, dismantling, and
  field-equipment contracts.
- [System composition](./SYSTEM_COMPOSITION.md) records whether established
  systems actually exchange causal inputs, outputs, physical state, knowledge,
  and consequences. It is the composition registry, not another inheritance
  matrix.

The permanent rule is:

**NEW CONTENT INHERITS THE WORLD.**

A directive brief is an execution instrument. Once it establishes a reusable
law, that law must be reconciled into its canonical owner and registered here.
Future work should not need to reread every historical brief to discover the
world it is joining.

This registry reflects the contract families known when it was last updated.
The roadmap may add, insert, split, merge, or renumber directives. Every future
directive automatically enters this inheritance process and must register any
durable cross-cutting contract it establishes.

Directive numbers control execution order. Canonical contracts control
architecture. Never infer that the currently highest-numbered directive is the
last expansion or that the roadmap is permanently complete.

## How to read status

Status describes implementation truth, not importance:

- **LIVE** — a production contract exists and is documented as current. New
  work must use it. The owner document remains authoritative for exact scope.
- **PARTIAL** — a shared contract exists for a bounded current scope, while a
  broader owner or promised behavior remains incomplete. New work must reuse
  the live portion and must not pretend the absent portion exists.
- **RESERVED** — responsibility and integration law are allocated, but the
  full system is not current gameplay. Do not build a private substitute or
  make player-facing claims. Mark the dependency deferred unless the active
  work is authorized to implement that owner.

These labels never supersede current verified implementation evidence. If this
registry and an owner's honest current-boundary section disagree, reconcile the
registry before relying on it.

## Contract-family index

<!-- SYSTEM_INHERITANCE_CONTRACTS_BEGIN -->
| ID | Contract family | Status | Public owner summaries | Durable inheritance rule |
| --- | --- | --- | --- | --- |
| `governance` | Design and governance | LIVE | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Preserve A CHALLENGING HARD, deterministic emergent authority, local-first operation, honest release state, canonical ownership, playable vertical slices, anti-exploit behavior, accessibility/mobile parity, and no fake completion. |
| `asset-storage` | Assets and repository storage | LIVE | [Architecture](./ARCHITECTURE.md) | Prefer code-native/procedural geometry, reusable original assets, and more systemic game per byte; retain substantial headroom below the permanent 1 GB repository ceiling and avoid unnecessary binary families. |
| `world-streaming` | Seamless world and streaming | LIVE | [Architecture](./ARCHITECTURE.md) | Use continuous signed world coordinates, invisible persistence partitions, deterministic generation, bounded moving frames, sparse deviations, negative/extreme-coordinate safety, and crossing continuity. |
| `physical-conservation` | Physical identity, custody, and conservation | LIVE | [Architecture](./ARCHITECTURE.md#physical-cargo-environment-and-continuous-custody); [crafting design](./CRAFTING_DESIGN.md#one-physical-pack) | Conserve the representation appropriate to the thing: addressable objects/lots keep stable identity, location, custody, condition, and history; fungible stacks keep exact kind, quantity, custody, and provenance. Transfer, drift, storage, theft, recovery, transformation, and destruction update that same authority; presentation, save/load, boundaries, and reclaim never duplicate it. Future pickup locks and historical materialization must preserve this live conservation law. |
| `living-actor` | Living Weft actor architecture | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Autonomous actors use shared perception, bounded knowledge/belief, appraisal, attention, intent, action, evidence, memory, relationship, condition, and information limits. Current humans and bounded wildlife exercise substantial shared owners; universal adoption remains incomplete. A schema field, seed profile, catalog row, release-gate result, or generic intention does not prove an enacted behavior or consumer. Current human trust is a static symmetric baseline, not the future social graph. |
| `perception-information` | Perception, attention, evidence, and information | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Actors react only to what they perceive, remember, infer, or lawfully learn. Vision, hearing, scent, evidence, suspicion, search, reports, and social information extend shared observation/knowledge authority rather than species-specific detectors or global awareness. |
| `world-time` | Authoritative world time | LIVE | [Architecture](./ARCHITECTURE.md) | One saved fixed-step civil clock owns elapsed time and phase. Later schedules, sleep, work, ecology, weather, deadlines, and production consume it rather than inventing wall-time or per-feature clocks. A clock input alone does not prove an enacted routine. |
| `circadian-routine` | Bounded rest/activity composition | PARTIAL | [Architecture](./ARCHITECTURE.md#turning-day-audited-current-boundary); [game design](./GAME_DESIGN.md) | A real routine needs an applicable actor/profile, authenticated physical rest/activity destination, ordinary movement, priority and disturbance overrides, persistence, and a gameplay consumer. Current adoption is forty-two compatibility humans, one settlement working-dog role, and seventeen addressable wildlife profiles; only snowy-egret tide/opportunity and black-duck rain/storm inputs prove non-clock drivers. `nextEvaluationTick` is a hint, not universal scheduling, and reserved disturbance enums are not producers. New actors may inherit the kernel without claiming occupational shifts, interiors, feeding, every species, independent/companion dogs, aggregate individual sleep, or other absent enactment. |
| `ecology` | Biodiversity and ecology | LIVE | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Biological actors and non-addressable aggregates extend shared species, habitat, food-web, population/group, activity, materialization, evidence, promotion, and sparse-persistence owners. Aggregate activity may produce one bounded group acoustic event through `embodied-acoustics`, but never fabricates an actor, per-member facts, or a hidden census. Representative invariants replace bespoke species brains and an N-squared pair matrix. |
| `perf-early` | Early performance and scalability — Breathing Room | LIVE | [Architecture](./ARCHITECTURE.md) | Separate render and authoritative cadence; query spatially; avoid global/N-squared scans; reuse immutable authority only behind exact validation and complete fallbacks; stagger expensive work deterministically; bound materialization, UI, and allocation; release unloaded resources. Reduce work, not truth. |
| `perf-regression` | Measured performance regression | LIVE | [Architecture](./ARCHITECTURE.md#cross-system-inheritance-and-bounded-work) | Every major directive proves representative performance before transition; material regressions are profiled, repaired at the measured owner, and retested. New systems bound spatial work, event fan-out, listeners, presentation, allocation, caches, and streamed-resource lifetime without reducing world truth. |
| `living-voice` | Expression and Living Voice | PARTIAL | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Expression follows a committed experience or action through lawful perception, belief, salience and intent; deterministic realization may eventually be speech, vocalization, gesture or authored silence. It never fabricates a cause or grants knowledge merely because the game knows it. Current player, human, dog, wildlife and aggregate representatives reuse bounded per-source channels, repetition/priority rules, shared hearing, and current-schema authority without replaying acknowledged ephemeral output. Authored visual gesture, communicative silence, multilingual comprehension and broad conversation are not live merely because the vocabulary can represent them. New speakers reuse these owners rather than add global chatter timers, speaker-private perception, or bespoke cooldown systems. Unavailable future actions remain `SPECIFIED`/`DEFERRED` contracts, not live Voice claims. |
| `embodied-acoustics` | Acoustic world events, hearing receipts, and shared sound-text presentation | PARTIAL | [Architecture](./ARCHITECTURE.md#embodied-acoustic-event-and-receipt-pipeline); [game design](./GAME_DESIGN.md#embodied-sound-and-visible-acoustics) | A domain owns why contact, movement, work, impact, weapon, vessel or vocal sound occurred and emits/adapts one structured source-bound event. Shared propagation derives listener-specific receipts; Living Voice owns bounded optional acoustic text, collision/repetition/clutter arbitration and accessibility. Presentation suppression never erases lawful hearing or committed audio; heard-unseen sources expose no exact identity/anchor; save/load does not replay consumed labels/audio. Current traversal, cargo, gear-break, dog, rabbit, aggregate-frog and aggregate-rat representatives prove the common path. A domain enum, semantic pool, catalog repertoire or synthetic fixture proves interface compatibility only; a real producer is separately required. Hard Country, foliage, Work of Hands, Violence, Long Crossing, tools, vehicles and future physical actors must reuse it rather than create parallel floating-text systems. |
| `botany` | Living foliage and botanical sources | RESERVED | [Crafting design](./CRAFTING_DESIGN.md); [architecture](./ARCHITECTURE.md) | Future living plants add identity, biomass, harvest, regrowth, succession, and source custody without creating a second infinite resource stock for an existing field material. |
| `hard-country` | Hard Country and physical traversal | PARTIAL | [Game design](./GAME_DESIGN.md); [crafting design](./CRAFTING_DESIGN.md); [architecture](./ARCHITECTURE.md) | Extend current footing, current, slope, speed, weather, load, brace, and recovery through physical aids, deployment, reclaim, injury, detour, waiting, cargo staging, multi-trip solutions, and infrastructure. Easy-ground gait does not erase difficult-ground exertion or causal fast-gait instability. |
| `locomotion-gait` | Player gait and input intent | RESERVED | [Game design](./GAME_DESIGN.md#reconciled-expedition-movement-and-navigation-contract); [architecture](./ARCHITECTURE.md#reserved-expedition-movement-cartography-and-field-history-architecture) | Keyboard same-key double tap requests fast gait through real input edges; continuous nonzero direction chords preserve it and zero intent ends it. Device adapters feed one fixed-step movement owner. Flat walking is sustainable, sprinting exerts, and terrain/load/slope/injury determine actual capability. |
| `movement-visibility` | Continuous movement and local visibility | LIVE | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Pathfinding may reason in cells; visible movement happens continuously through world space. Close awareness improves nearby readability without granting identity, intent, hidden state, or sight through solid occlusion. Later gait changes preserve heading/velocity continuity rather than adding renderer-owned motion. |
| `actor-visuals` | Shared actor visual architecture | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Future visual breadth composes silhouette, dimensions, carried equipment/items, injury, weather, posture, animation, grounding, and LOD over the authoritative actor rather than creating a visual duplicate. |
| `deep-time` | Deep Time, provenance, and causal history | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Future ruins, infrastructure, archaeology, repair, salvage, settlement history, and abandoned field gear follow causal provenance rather than scatter content as loot. |
| `integration` | Integration and Beta-quality discipline | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Compose through common authority; verify determinism, conservation, migration, recovery, long sessions, platform parity, and exact release truth. A schema, demo, or renderer-only stub is not completion. |
| `system-composition` | Producer/consumer composition and causal closure | LIVE | [System composition](./SYSTEM_COMPOSITION.md); [architecture](./ARCHITECTURE.md#cross-system-inheritance-and-bounded-work) | Trace important inputs to accountable world sources and important outputs to real consumers. Classify bridges honestly, remove BYPASS paths through their domain owners, assign unresolved work to active/future owners, and use representative counterfactual scenarios rather than isolated feature claims or exhaustive pair matrices. |
| `maritime` | Long Crossing and physical water transport | RESERVED | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Boats and later water transport are physical world objects with cargo, passengers, ownership, tides, currents, grounding, mooring, rescue, seamless travel, persistence, and coarse simulation—not fast-travel menus. |
| `supernatural` | Other Shore and supernatural ecology | RESERVED | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Future beings and places first inherit applicable ordinary-world contracts, then add supernatural specialization; wonder does not bypass identity, ecology, knowledge, conservation, movement, persistence, or performance by default. |
| `systemic-effects` | Exceptional and undisclosed systemic effects | RESERVED | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Exceptional effects bend the finished world through existing transactions, identities, conservation, save, knowledge, weather, actor, and recovery owners. They do not introduce a parallel ruleset, leak private inputs, or substitute for unfinished dependencies. |
| `altered-perception` | Altered perception and subjective presentation | RESERVED | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Dreams, hallucinations, possibility echoes, and magical presentation may alter subjective cues but do not manufacture authoritative actors, collision, inventory, Promise targets, or true-sight information. |
| `memory-attunement` | Great Attunement, keepsakes, place memory, and lived familiarity | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Future attunement deepens interpretation, dreams, keepsakes, relationship history, and familiarity without becoming XP, raw stat inflation, guaranteed prophecy, or omniscience. |
| `human-identity` | Written Stars and complete human identity | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Future human roles inherit ordinary human identity. Later symbolic birthday/name grammar remains individual variance, never destiny, morality, violence, occupation, or a protected-trait mapping. |
| `violence` | Weight of Violence | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Future violence uses physical weapons/ammunition, injury, fear, surrender, retreat, de-escalation, witnesses, evidence, memory, ecology, social aftermath, and conservation. Hostility is context, not a species. |
| `material-culture` | Work of Hands and material culture | PARTIAL | [Crafting design](./CRAFTING_DESIGN.md); [architecture](./ARCHITECTURE.md) | Current positive-condition travel adaptations auto-apply from conserved carried gear through bounded benefit channels; no manual equipped state or separate gear tab is live. Future equipment selection, processing, and assembly extend the same stable items, PACK / MAKE / MEND, recipes, condition, repair, dismantling, and physical sources; they do not create Crafting V2, duplicate carried/equipped objects, or abstract loot from a real source without required processing. |
| `perf-scale` | Whole-game performance and scale — Lean World | RESERVED | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Deepen fidelity tiers, full/near/coarse/archive simulation, render LOD, camera/zoom discipline, streaming, save and memory growth, long-session stability, and mature-world/mobile profiling. Final certification profiles the real workload-producing expansions, including Far Settlements; only a measured missing prerequisite runs before them. Responsibility, not roadmap position, defines it. |
| `save-migration` | Save, migration, and restart authority | LIVE | [Architecture](./ARCHITECTURE.md#save-contract) | Every durable system must preserve current-schema authoritative state, stable identity, explicit versions, deterministic restore, interruption recovery, local-first conflict handling, and conservation. Before official stable 1.0, obsolete internal development formats may be explicitly retired fail-closed instead of migrated; from the official 1.0 baseline onward, supported player saves require deterministic forward migration permanently. |
| `chart-relief` | Chart, Relief, HUD, and knowledge projection | LIVE | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md) | Both views consume shared authoritative state and knowledge gates; presentation differs, world rules do not. Future Relief grade and Chart contours derive from one authoritative elevation field, and camera visibility is not simulation activation. |
| `expedition-cartography` | Persistent map and destination knowledge | PARTIAL | [Game design](./GAME_DESIGN.md#reconciled-expedition-movement-and-navigation-contract); [architecture](./ARCHITECTURE.md#reserved-expedition-movement-cartography-and-field-history-architecture) | Reuse the live sparse regional discovery/sounding substrate. Future terrain and place knowledge retain provenance; unknown delivery targets remain genuinely approximate, legitimate discovery converts them to precise permanent known locations, and save growth stays sparse. |
| `delivery-scale` | Expeditionary Promise distance | RESERVED | [Game design](./GAME_DESIGN.md#reconciled-expedition-movement-and-navigation-contract); [architecture](./ARCHITECTURE.md#reserved-expedition-movement-cartography-and-field-history-architecture) | Measure the ordinary current route distribution, then make its mean at least roughly three times farther through uneven settlement networks, destination eligibility, and logistics—not a grid, outlier trick, or distance-based enemy scaling. |
| `fall-cargo-recovery` | Incident-separated cargo recovery window | RESERVED | [Game design](./GAME_DESIGN.md#reconciled-expedition-movement-and-navigation-contract); [architecture](./ARCHITECTURE.md#reserved-expedition-movement-cartography-and-field-history-architecture) | When a fall, severe stumble, knockdown, hard landing, or ADRIFT incident actually separates cargo, it creates a saved deterministic self-pickup lock while the same parcel keeps moving. After actor recovery and lock expiry, ordinary reach/custody decides recovery. |
| `sparse-field-gear` | Causal abandoned traversal equipment | RESERVED | [Game design](./GAME_DESIGN.md#reconciled-expedition-movement-and-navigation-contract); [architecture](./ARCHITECTURE.md#reserved-expedition-movement-cartography-and-field-history-architecture) | Derive rare historical candidates from continuous world-space opportunity and provenance; promote relevant finds into ordinary conserved physical identity; never reroll them or guarantee the tool that solves a nearby obstacle. |
| `accessibility-mobile` | Accessibility, mobile, and platform parity | LIVE | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Alternate input and presentation preserve world rules, information, difficulty, and outcomes. Reduced motion, redundant cues, touch, focus, layout, and packaging are part of the feature. |
| `platform-distribution` | Platform packaging and distribution | PARTIAL | [Architecture](./ARCHITECTURE.md#platform-and-distribution-responsibility) | Web and hardened packaged Electron behavior are live; signed/notarized cross-platform distribution remains incomplete. Every platform carries the same tested simulation, save, input, accessibility, security, and local-first rules, and release claims bind to exact artifacts. |
| `promise-network` | Promises, settlements, trust, and accountable information | LIVE | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Promises move conserved cargo; reports move sourced information; trust, routes, settlements, projects, and knowledge change through witnessed events. Future accepted-target knowledge records source and precision; no marker, route, distance/bearing text, focus action, or hit target may expose an exact unknown destination. Future economy, rescue, rumor, and investment extend these owners. |
| `settlement-generation` | Far-settlement generation and continuity | RESERVED | [Architecture](./ARCHITECTURE.md#settlement-generation-responsibility-boundary); [game design](./GAME_DESIGN.md#harbor-network-arc) | Future settlements derive from geography/history, preserve stable identity and honest absence, keep sparse deviations and coarse population truth, and join routes, knowledge, economy, history, streaming, and Promises instead of appearing as isolated service menus. |
| `economy` | Credit economy and long-term progression | RESERVED | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | Progression should buy preparation, repair, services, equipment verbs, information, storage, and community infrastructure rather than conventional XP levels or repetitive killing. Trust is not currency. |
| `health-recovery` | Exposure, health, incapacity, death, rescue, and recovery | PARTIAL | [Game design](./GAME_DESIGN.md#setback-and-recovery); [architecture](./ARCHITECTURE.md#current-recovery-and-discovery-safe-cues) | Current setback, ADRIFT, and bounded recovery contracts are live; broader health, injury, death, and rescue remain incomplete. Extend them by naming causes, preserving time/cargo/Promise truth, deriving rescue from real relationships/infrastructure, and never rewinding the world. |
| `keepsakes` | Provenance-first keepsakes | RESERVED | [Game design](./GAME_DESIGN.md); [architecture](./ARCHITECTURE.md) | A keepsake is one persistent physical object whose person/place/event memory and specialized verb matter more than rarity or stat tier. Loss creates physical recovery history, not silent deletion or teleport return. |
| `environment` | Weather, water, light, and environmental interaction | PARTIAL | [Architecture](./ARCHITECTURE.md); [game design](./GAME_DESIGN.md); [crafting design](./CRAFTING_DESIGN.md) | Later fire, fronts, exposure, ecology, visibility, sound, scent, materials, and infrastructure consume the same authoritative weather, current, water, and light environment. |
<!-- SYSTEM_INHERITANCE_CONTRACTS_END -->

The table is intentionally responsibility-oriented. A contract marked RESERVED
still matters: it prevents an earlier feature from inventing an incompatible
parallel owner. It does not claim that the reserved gameplay is available.

## Mandatory feature inheritance audit

Before implementing any substantial new actor, species, human role,
supernatural being, item, tool, weapon, vehicle, material, structure,
settlement system, environmental system, interaction, or gameplay mechanic:

1. Name the new entity or system and its authoritative owner.
2. Check every contract family above for applicability.
3. Record one of these outcomes for each applicable question:
   - **INTEGRATED**
   - **NOT APPLICABLE — reason**
   - **DEFERRED — owner / reason**
   - **BLOCKED — owner / reason**
4. Reuse existing shared architecture before adding a bespoke path.
5. Identify current-schema persistence and compatibility-era behavior. Before
   official stable 1.0, name any deliberately retired development format; from
   the 1.0 baseline onward, identify the supported forward migration.
6. Identify bounded runtime cost and distant/coarse behavior.
7. Read `docs/SYSTEM_COMPOSITION.md`; trace the feature's important inputs and
   outputs through applicable existing systems and own any gaps or bypasses.
8. Test shared invariants and representative compositions. Do not respond by
   creating an exhaustive species-by-species or pair-by-pair matrix.
9. Reconcile any new durable law into its canonical owner and this registry.

Silent omission is not an outcome. RESERVED work is normally DEFERRED, not
quietly approximated. NOT APPLICABLE requires a reason; it is not shorthand
for “not considered.”

Use this concise record in the implementation plan, design decision, pull
request, or other durable work evidence:

```text
NEW FEATURE:
ENTITY / SYSTEM TYPE:
AUTHORITATIVE OWNER:

APPLICABLE PRIOR CONTRACTS:
- ...

INTEGRATED:
- ...

NOT APPLICABLE:
- ... because ...

DEFERRED:
- ... owner / reason ...

BLOCKED:
- ... owner / reason ...

SAVE / MIGRATION EFFECT:
WORLD / STREAMING EFFECT:
PERCEPTION / KNOWLEDGE EFFECT:
PHYSICAL CONSERVATION EFFECT:
MOVEMENT / VISIBILITY EFFECT:
ECOLOGY EFFECT:
ENVIRONMENT / HAZARD / HEALTH EFFECT:
SOCIAL / RELATIONSHIP EFFECT:
EXPRESSION EFFECT:
VISUAL EFFECT:
CHART / RELIEF / INSPECTION EFFECT:
HISTORY / DEEP-TIME EFFECT:
CRAFTING / MATERIAL EFFECT:
PERFORMANCE / COARSE-SIM EFFECT:
ACCESSIBILITY / MOBILE EFFECT:
```

Omit genuinely irrelevant effect rows; do not create paperwork whose only
content is “none.” The record exists to expose integration gaps before code
hardens around them.

## Representative applicability matrix

This matrix is a routing aid, not a substitute for the audit. “Conditional”
means the contract applies when that thing has the named capability or effect.

<!-- SYSTEM_INHERITANCE_MATRIX_BEGIN -->
| New thing | Baseline inherited contracts | Conditional / specialization contracts |
| --- | --- | --- |
| Ordinary human | `governance world-streaming living-actor perception-information world-time circadian-routine movement-visibility actor-visuals human-identity save-migration chart-relief accessibility-mobile perf-early perf-scale` | `physical-conservation material-culture deep-time memory-attunement promise-network living-voice embodied-acoustics hard-country violence environment` according to possessions, role, experience, expression, audible physical contact, travel, and conflict |
| Hostile or rogue human | Every ordinary-human contract | `violence` plus physical inventory/weapon `physical-conservation` and `health-recovery` for injury/incapacity; hostility adds context after the complete human exists |
| Hunter, fisher, courier, traveler, or worker | Every ordinary-human contract | `ecology maritime promise-network material-culture hard-country violence` only as the physical occupation requires |
| Dog | `governance world-streaming living-actor perception-information world-time ecology movement-visibility actor-visuals save-migration chart-relief accessibility-mobile perf-early perf-scale` | `circadian-routine` only for a role with a real rest destination (currently one settlement working dog); `physical-conservation` for custody/gear, `living-voice embodied-acoustics` for calls and audible body/world contact, `memory-attunement` for bond/history, `hard-country environment` for travel and exposure |
| Ordinary addressable wildlife | `governance world-streaming living-actor perception-information world-time ecology movement-visibility actor-visuals save-migration chart-relief accessibility-mobile perf-early perf-scale` | `circadian-routine` only when a real species/activity binding and physical destination exist; `living-voice embodied-acoustics violence physical-conservation deep-time memory-attunement` only when the species or individual supports vocalization, audible contact, or the other named behavior |
| Aggregate wildlife population | `governance world-streaming world-time ecology save-migration chart-relief accessibility-mobile perf-early perf-scale` | `perception-information living-voice embodied-acoustics` only for honest aggregate observation, pressure, vocal activity, or committed physical disturbance; never fabricate individual circadian receipts, bodies, or actors solely to satisfy an actor API |
| Recognizable or promoted wildlife individual | Ordinary addressable-wildlife contracts | `deep-time memory-attunement physical-conservation` for stable promotion, relationship, evidence, possessions/custody, and long-term state |
| Magical fox or magical animal | Complete ordinary species/fox contracts first | `supernatural altered-perception` only after ordinary ecology, movement, evidence, and performance are intact |
| Mermaid or intelligent aquatic being | `governance world-streaming living-actor perception-information movement-visibility actor-visuals save-migration chart-relief accessibility-mobile perf-early perf-scale` | `maritime ecology living-voice memory-attunement promise-network supernatural` according to physiology, intelligence, society, and authored nature |
| Fairy, spirit, or other supernatural actor | `governance world-streaming living-actor perception-information save-migration chart-relief accessibility-mobile perf-early perf-scale` where autonomous and persistent | `supernatural altered-perception living-voice movement-visibility ecology physical-conservation memory-attunement`; justify nonphysical exclusions |
| Plant or tree | `governance world-streaming ecology botany save-migration chart-relief accessibility-mobile perf-early perf-scale` | `physical-conservation material-culture deep-time environment` when harvestable, processed, significant, damaged, or weather-responsive |
| Carcass | `governance world-streaming physical-conservation ecology save-migration chart-relief accessibility-mobile perf-early perf-scale` | `material-culture deep-time environment` for processing, decomposition, evidence, or provenance; it is not a floating loot table |
| Raw plant/animal/geological material | `governance world-streaming physical-conservation material-culture save-migration chart-relief accessibility-mobile` | `botany ecology deep-time environment` according to physical source and transformation |
| Processed material or recipe output | `governance physical-conservation material-culture save-migration chart-relief accessibility-mobile` | `deep-time asset-storage perf-early` when persistent, visually distinct, or produced at scale |
| Tool | `governance world-streaming physical-conservation material-culture save-migration chart-relief accessibility-mobile` | `hard-country actor-visuals deep-time keepsakes violence sparse-field-gear embodied-acoustics` according to real verbs, provenance, discovery, use, and audible contact |
| Weapon | `governance world-streaming physical-conservation material-culture violence save-migration actor-visuals chart-relief accessibility-mobile perf-early perf-scale` | `health-recovery` for injury/incapacity and `deep-time keepsakes embodied-acoustics living-voice perception-information` for provenance, significance, lawful impact/shot acoustics, and vocal response |
| Cargo, parcel, or loose supply | `governance world-streaming physical-conservation promise-network save-migration chart-relief accessibility-mobile perf-early perf-scale` | `fall-cargo-recovery material-culture deep-time keepsakes environment perception-information embodied-acoustics` for incident separation, condition, provenance, significance, drift, wetness, heat, scent, shift, or impact |
| Keepsake | `governance world-streaming physical-conservation deep-time memory-attunement keepsakes save-migration chart-relief accessibility-mobile` | The ordinary contract of its physical object type still applies; keepsake status never replaces it |
| Boat | `governance world-streaming physical-conservation movement-visibility maritime hard-country save-migration actor-visuals chart-relief accessibility-mobile perf-early perf-scale` | `promise-network material-culture deep-time environment health-recovery embodied-acoustics` for cargo work, repair, provenance, weather/current, paddle/hull/rope contact, collision, grounding, exposure, injury, and rescue |
| Other vehicle | `governance world-streaming physical-conservation movement-visibility save-migration actor-visuals chart-relief accessibility-mobile perf-early perf-scale` | `maritime hard-country material-culture promise-network deep-time environment health-recovery embodied-acoustics` according to travel domain, audible operation/contact, collision/exposure risk, and use |
| Infrastructure or route aid | `governance world-streaming physical-conservation hard-country deep-time save-migration chart-relief accessibility-mobile perf-early perf-scale` | `material-culture promise-network environment maritime` for construction, civic funding, exposure, or water use |
| Settlement or service network | `governance world-streaming settlement-generation promise-network deep-time save-migration chart-relief accessibility-mobile perf-early perf-scale` | `delivery-scale expedition-cartography economy living-actor world-time living-voice health-recovery maritime perception-information` as destination distribution, discovery, population, schedules, trade, rescue, transport, and rumor become live |
| Ruin or historical site | `governance world-streaming deep-time save-migration chart-relief accessibility-mobile perf-early perf-scale` | `physical-conservation material-culture ecology supernatural altered-perception` according to real contents and causal history |
| Dream | `governance altered-perception memory-attunement chart-relief accessibility-mobile` | `living-voice supernatural`; no physical conservation or authoritative mutation unless a separate explicit event does real work |
| Hallucinated actor or presentation echo | `governance altered-perception chart-relief accessibility-mobile` | It references one real actor if appropriate but receives no independent collision, custody, inventory, Promise identity, or save identity |
| Supernatural place | `governance world-streaming supernatural save-migration chart-relief accessibility-mobile perf-early perf-scale` | `ecology altered-perception deep-time environment` according to real world effects and subjective presentation |
| Exceptional systemic effect | `governance systemic-effects save-migration perf-early perf-scale` | Every physical, actor, knowledge, weather, recovery, and presentation contract it actually bends; no parallel ruleset |
| Loud or violent sound | `governance living-actor perception-information environment embodied-acoustics chart-relief accessibility-mobile perf-early` | `violence deep-time living-voice` if it records violence/evidence or includes vocal expression; it propagates from a real source rather than globally informing actors |
| Recipe or processing action | `governance physical-conservation material-culture save-migration chart-relief accessibility-mobile` | `botany ecology deep-time perf-early embodied-acoustics` according to sources, by-products, provenance, scale, and real tool/material contact |
| Traversal mechanic | `governance world-streaming hard-country movement-visibility save-migration chart-relief accessibility-mobile perf-early perf-scale` | `locomotion-gait fall-cargo-recovery expedition-cartography physical-conservation health-recovery environment maritime embodied-acoustics` when it changes gait, separates cargo, records route knowledge, deploys items, causes injury, crosses water, or produces salient contact sound |
| Environmental or world-scale simulation | `governance world-streaming environment save-migration integration perf-early perf-scale` | Every domain contract whose truth it advances; scale never grants permission to flatten ownership, knowledge, ecology, or history |
| Save-backed system or schema migration | `governance save-migration integration perf-early perf-scale` | Every contract whose authority is serialized; always prove current-schema round-trip, interruption behavior, deterministic/conserved restore, validation, and bounded growth. Before official stable 1.0, either support or explicitly retire an obsolete development schema fail-closed; from the 1.0 baseline onward, prove supported forward migration. |
| Chart, Relief, HUD, or inspection projection | `governance chart-relief accessibility-mobile integration perf-early perf-scale` | `expedition-cartography` plus the authoritative and knowledge contracts for every fact projected; presentation never becomes a second simulation owner |
| Platform, input, packaging, or distribution surface | `governance accessibility-mobile platform-distribution integration asset-storage perf-early perf-scale` | `locomotion-gait save-migration chart-relief` and each affected interaction contract; packaging and deployment must preserve the exact tested world rather than fork rules |
| Future actor type not yet known | `governance world-streaming perception-information save-migration chart-relief accessibility-mobile integration perf-early perf-scale` | Audit `living-actor ecology movement-visibility actor-visuals living-voice physical-conservation deep-time memory-attunement supernatural` rather than defaulting to a custom class |
<!-- SYSTEM_INHERITANCE_MATRIX_END -->

## Permanent regression examples

### Rogue or hostile human

A rogue human begins as **HUMAN**, not `RogueHumanAI`, `EnemyHuman`, or a
combat-only species.

Before hostility is added, that person inherits ordinary human identity,
continuous position and movement, perception and bounded knowledge, appraisal,
attention, intent, needs, condition, temperament, name, history, birthday data
when that owner is live, relationships, memory, lawful name knowledge,
expression when live, physical inventory, persistence, visuals, coarse
simulation, accessibility, and save migration.

Only then may context explain why the person is currently hostile, desperate,
territorial, outlawed, coerced, retaliatory, frightened, isolated, or aligned
with a hostile group. The person can still become hungry or tired, know only
what they learned, misunderstand, fear, retreat, surrender, speak, remember,
reconcile, carry and lose objects, leave evidence, be witnessed, and matter to
history.

- If they speak, they use `living-voice`.
- If they move locally, they use `movement-visibility`.
- If they carry a weapon, it uses `physical-conservation` and `violence`.
- If they attack, injury, witnesses, evidence, fear, and aftermath apply.
- If they leave local relevance, `perf-early` / `perf-scale` governs coarse
  representation; they do not remain a full-rate hidden combat brain.

Hostility is a state and relationship context. It is not a human species.

### Magical fox

A magical fox begins with the ordinary fox/wildlife profile, habitat, food-web
role, population/materialization rules, perception, movement, activity,
evidence, circadian/weather behavior, promotion, persistence, visuals, and
performance bounds. `supernatural` then adds the smallest explicit exception or
new capability. It does not replace ordinary fox ecology with an unrelated
fantasy NPC that happens to use a fox model.

### Mermaid

An intelligent aquatic being joins `living-actor`, knowledge, relationship, memory,
movement, visual, save, performance, and accessibility owners. Aquatic travel
joins `maritime` and relevant ecology. If the being communicates, `living-voice`
applies; if supernatural, `supernatural` extends rather than bypasses those
contracts. It cannot know the player's identity or cargo without perception,
memory, records, or social information.

### Weapon

A weapon is one physical object, not a combat mode. It retains identity,
ownership, custody, location, condition, ammunition or energy source where
applicable, carried visual state, evidence, provenance, persistence, and
save/migration behavior. Dropping, stealing, firing, breaking, storing, or
recovering it changes that same object. Combat UI cannot create a second copy.

### Plant-derived material

The chain is:

```text
BOTANICAL SOURCE
→ HARVEST
→ PHYSICAL PART
→ PROCESSING
→ MATERIAL
→ CRAFT / REPAIR / USE
```

Do not maintain “plant cover” and “resource node” as two infinite stocks for
one source. Current field-resource identities remain authoritative until a
living-botany owner explicitly migrates or composes them.

### Vehicle

A vehicle is not a fast-travel menu. It occupies the seamless world, moves
continuously in its domain, has stable identity, ownership, condition, cargo,
passengers where relevant, history, persistence, controls, presentation, and
bounded full/coarse simulation. A boat additionally inherits tides, currents,
grounding, mooring, and water rescue from `maritime` when that owner is live.

### Altered perception

Keep this distinction absolute:

```text
WORLD TRUTH != SUBJECTIVE PRESENTATION
```

A dream, hallucination, reflection mismatch, or magical echo can affect what
an actor experiences. It does not create authoritative collision, inventory,
actors, cargo, or Promise targets; it cannot leak unknown truth. A real actor
may have several presentation echoes, but still has one authoritative identity.

## Cross-cutting inheritance laws

### Physical conservation

All later tools, weapons, cargo, boats, keepsakes, infrastructure, salvage, and
materials preserve representation-appropriate conservation. Addressable
objects/lots keep stable identity and custody; fungible stacks keep exact kind,
quantity, custody, and provenance through atomic transformations. Prohibit
duplicate ownership, teleport recovery, refund reclaim, save/load or boundary
duplication, and presentation copies becoming physical copies.

### Movement and local visibility

Pathfinding may think in cells. Physical movement happens through space.
Locally visible actors use appropriate speed, heading, turning, interpolation,
and locomotion without requiring expensive AI decisions every render frame.

Close awareness may keep an obvious nearby actor legible when just outside a
narrow forward cone. Solid occlusion remains authoritative, and awareness does
not disclose name, intent, inventory, emotion, or other hidden facts.

### Human identity and social name knowledge

Every future human role begins with the ordinary human identity architecture.
Hunters, guards, sailors, workers, travelers, and hostile people do not receive
stripped-down role identities. Symbolic identity grammar, when live, provides
fictional variation and never assigns morality, destiny, violence, occupation,
or protected characteristics.

People learn the player's name through introduction, records, reports,
conversation, reputation, or social propagation—not by reading save data.
Reputation may spread identity locally, but there is no global hive mind.

### Existing-human and world-response adoption

**PLANNED — not implemented.** The bounded existing-world integration owner
must include legacy settlement residents and travelers in applicable shared
actor architecture. Adoption inherits `living-actor`, `perception-information`,
`world-time`, `circadian-routine`, `movement-visibility`, `actor-visuals`,
`environment`, `physical-conservation`, `promise-network`, `living-voice`,
`embodied-acoustics`, `save-migration`, and bounded performance where relevant.
Their existing LIVE/PARTIAL/RESERVED statuses do not change by registration.

A stored intention or occupation is not an executable task. Applicable new
actions require a causal source, capability-aware approach, finite claims,
domain-owned completion/failure, release and reassessment, with at least one
real consumer. Local observation and sourced knowledge govern response;
recognition does not imply permanent watch or task interruption. Read the
[planned architecture boundary](./ARCHITECTURE.md#planned-bounded-existing-world-integration)
for ownership and acceptance. Broader livelihoods, commerce, physical porter
cargo, health, and maritime systems remain with their existing owners.

### Expression, acoustic world, and information

Expression follows experience, knowledge, emotion, relationship, intent, and
context. Human combat lines do not bypass `living-voice`; animal calls do not bypass
hearing/localization; supernatural beings are not omniscient exposition tools.
An actor may react only to what it perceives, remembers, infers, or lawfully
learns from another source.

Player condition expression likewise requires a committed causal transition,
not a sampled HUD value. Current dry exhaustion is one representative proof:
future effort states extend the same situated-expression, acoustic,
perception, causal-authority, and movement-owned step-state owners rather than
poll condition independently.

Continuing visible actor state is not automatically speech. Quick labels,
posture, emotion marks, condition details, and ABOUT may present lawfully
observable state without entering the acoustic channel; selection, render
cadence, a threshold that remains true, or a catalog line cannot manufacture
an utterance. Audible expression requires a newly committed source event.

When Living Voice adapts an existing ecological or working-animal signal, that
causal domain retains semantic and physical authority. Living Voice may add
human hearing and presentation only from one authenticated source-bound event
and acoustic leg; an optional presentation admission may retain that leg but is
not allowed to become its physical cause. Duplicate human observation or player
cue for the same event must be suppressed.
Listener knowledge is derived independently from producer intent: a signal that
means alarm inside ecology may remain only an anonymous impact to a human who
heard it. Interruption strength is explicit semantic authority, not inferred
from an alarmed tone. Event audio and lawful actor hearing must not depend on
optional caption/expression capacity; a saturated presenter suppresses
presentation, never the committed physical consequence. Likewise, expression
cooldown may coalesce optional text but must not erase a distinct newly
committed acoustic event from propagation or listener receipts.

Factual speech likewise requires an authenticated source event, expression,
admission and acoustic sample plus listener-specific audible confidence. The
current secured-store response is the bounded representative: sufficiently
clear hearing yields only the expressed anonymous report at an uncertain area;
weaker hearing remains generic vocalization. Authored prose, captions, hidden
identity and domain details never become knowledge authority, and pending
meaning is re-derived after reload rather than stored in a parallel dialogue
queue. Accepted-expression recency may outlive consumed hearing, but must be
bounded, causal, fixed-step-owned and separate from replayable sound/presentation.
The current dry-exhaustion representative is owned by `playerEffortRecency`;
future consumers must not retain old acoustic admissions merely to stay quiet.

The current unpublished aggregate-frog chorus and brown-rat redistribution
rustle are representative aggregate proofs: ecology identity/activity or a
committed physical disturbance is `INTEGRATED`; item custody is `NOT
APPLICABLE`; other aggregate repertoires remain `DEFERRED` to Living Voice. An
aggregate acoustic source may hold opaque stable
source/repetition identity, but it must not manufacture an addressable actor,
per-member events, exact listener knowledge, or serialized presentation.

Any applicable speech, vocalization, impact, contact, tool/material action,
movement sound, violent sound, or vessel/vehicle sound follows:

```text
COMMITTED DOMAIN EVENT
→ STRUCTURED SOURCE-BOUND ACOUSTIC EVENT
→ ENVIRONMENTAL PROPAGATION
→ LISTENER-SPECIFIC RECEIPT
→ ACTOR ATTENTION / BELIEF / RESPONSE
  + AUTHENTICATED PLAYER AUDIO / OPTIONAL ACOUSTIC TEXT
```

The producer owns the cause; `embodied-acoustics` owns shared propagation and
receipts; Living Voice owns vocal semantics and the shared restrained
acoustic-text presenter. Exact world anchoring requires heard-and-visible
source authentication or authenticated direct physical contact. Unseen hearing
stays uncertain/directional and unheard
events produce no player cue. Layout, repetition merging, and clutter
suppression never delete authoritative events or NPC hearing. Work of Hands,
Weight of Violence, Hard Country, cargo, foliage interaction, Long Crossing,
future tools, future vehicles, and new physical actors inherit this contract;
none may create a private floating-sound-text system.

### Biodiversity and ecology

New biological actors extend shared profiles and owners. Species-specific data
selects capabilities; it does not replace shared perception, locomotion,
activity, group, evidence, materialization, persistence, and projection.
Aggregate activity likewise remains aggregate when it becomes audible: shared
sound may use a bounded deterministic representative locus, but may not invent
an individual body, identity, count, or one event per hidden member.
Current harmful aftermath is only the exact solitary-rabbit mortality/body and
finite scavenger-use seam. Catalog capabilities and tested kernels do not make
player hunting, fishing, general harm, runtime decay, or material processing
live; later domains must consume their named ecology, health/recovery, and
material-culture owners rather than infer those mechanics from data.
Confidence comes from common invariants, deterministic properties,
conservation, bounded interaction-graph fuzzing, and representative emergent
compositions—not a bespoke test for every species or every interaction pair.

### Hard Country

New terrain and traversal preserve physical consequence and multiple honest
responses: preparation, equipment, route choice, detour, retreat, waiting,
staging cargo, or multiple trips. Tools remain physical, deployment remains
physical, and reclaim is an action rather than a refund.

### Maritime and vehicles

Paddles, hulls, ropes, cargo, grounding, waves, docks, collisions, and repair
remain actions of physical vessels and materials. When audible they emit
ordinary `embodied-acoustics` events through water/weather-aware propagation;
Long Crossing and future vehicles do not create boat-specific subtitle or
hearing universes.

### Deep Time and memory

Places and objects should gain content through causal provenance where
applicable:

```text
GEOGRAPHY
→ OLD USE
→ INFRASTRUCTURE
→ COLLAPSE / ABANDONMENT
→ SUCCESSION
→ REUSE / SALVAGE / REPAIR
→ PRESENT
```

History and familiarity improve interpretation, relationships, and meaning;
they are not generic power levels. Dreams remain subjective unless a separate
authoritative event changes the real world through normal rules.

### Violence

Weapons remain physical objects. Humans remain humans. Violent events can
produce injury, fear, retreat, surrender, de-escalation, witnesses, evidence,
ecological consequences, social consequences, memory, and recovery work. Do
not introduce combat XP, DPS tiers, enemy waves, or kill filler without an
explicit canonical replacement of the existing product law.

Impacts, weapon/material contact, projectiles, gunshots where canonical, body
falls, and breakage are committed physical events that inherit
`embodied-acoustics`. Living Voice owns cries, shouts, and other vocal response,
not the physical cause of a shot or strike. Presentation never names a hidden
attacker, weapon, or victim beyond what the listener lawfully perceived.

### Material culture

Future crafting extends PACK / MAKE / MEND, recipe knowledge, condition,
repair, dismantling, processing, assembly, and physical sources. Do not create
an unrelated Crafting V2. A fallen tree or carcass stays a world source until
real processing moves conserved matter into another form.

Committed cutting, chopping, sawing, scraping, hammering, lashing, tightening,
shaping, cooking, repairing, dismantling, breaking, and other tool/material
actions may emit sparse structured `embodied-acoustics` events. Repeated work
does not create per-tick text, and Work of Hands does not own a separate
crafting-floating-text system. The current carried ridge-cleat break is the
representative live contract: its stable physical item must spend exact
condition while actually supplying ridge grip before a shared `crack` can be
emitted. It does not make future workstation or general tool actions live.

### Chart, Relief, accessibility, and mobile

Chart and Relief project one authoritative state through the same knowledge
gate. Presentation, input, camera, and detail may differ; rules and information
may not. Accessibility may reduce flashing, motion, distortion, or input
complexity without quietly removing authored danger or granting hidden facts.
Mobile is a complete interaction surface, not a reduced ruleset.

## Performance inheritance

Three cumulative responsibilities coexist. **Early performance and scalability
— Breathing Room** restores development headroom and establishes bounded
implementation habits. A lightweight **per-directive regression gate** checks
every major transition and requires profile → targeted repair → retest only when a
material regression exists. **Whole-game performance and scale — Lean World**
later deepens fidelity tiers, LOD, streaming, save/memory growth, mobile
budgets, and long-session stability. Responsibility, not a presumed final
roadmap position, defines them. Detailed law lives in the
[architecture summary](./ARCHITECTURE.md#cross-system-inheritance-and-bounded-work).

Permanent principles:

**REDUCE WORK, NOT TRUTH.**

**SIMULATE WHAT MATTERS NOW. PRESERVE WHAT MATTERS LATER.**

**THE WORLD MAY BE ENORMOUS. THE ACTIVE COMPUTATIONAL PROBLEM MAY NOT BE.**

**FULL TRUTH DOES NOT REQUIRE FULL FREQUENCY.**

Optimization may reduce update frequency, render detail, animation detail,
particle detail, or distant fidelity. It may not silently change rules,
knowledge, ownership, ecology, relationships, difficulty, conservation, or
deterministic outcomes. Camera visibility does not automatically equal
simulation activation.

For every substantial system, answer:

1. Does it add work every render frame?
2. Does it add work every authoritative step?
3. Can some work be event-driven?
4. Can some work run at a lower deterministic cadence?
5. Is work bounded by space and relevance?
6. Does it scan the complete actor or world set?
7. Does it create N-squared behavior?
8. Does it require full materialization?
9. Can distant truth remain coarse?
10. Does a hot loop allocate temporary objects?
11. Does it rebuild unchanged UI or projection?
12. Does it grow saves unnecessarily?
13. Does it retain unloaded-region resources?
14. Does it preserve deterministic authority?
15. Does it preserve knowledge honesty?
16. Does it preserve ecology, relationships, and item truth at reduced cadence?
17. Does cost remain bounded as explored history grows?
18. Is event fan-out bounded by lawful, spatially relevant consumers?
19. Are listener, label, DOM, work, and presentation queues explicitly bounded?
20. Are caches, subscriptions, streamed entities, and render resources evicted
    when their owning scope unloads?
21. Does a representative production profile prove the new system did not
    materially regress frame time, simulation time, memory, or allocation?

## Applicability is not blind universality

Inheritance requires checking a contract, not attaching every system to every
thing:

- a fish does not need human symbolic identity;
- a plant does not need human dialogue;
- a nonphysical spirit may not need footing, but must justify how it moves and
  what remains authoritative;
- a rock does not need Living Weft;
- an aggregate population must not fabricate individuals to satisfy an actor
  schema;
- a hallucination must not gain physical conservation simply because it looks
  like an item.

Explicit NOT APPLICABLE is healthy. Silent bypass is not.

## Future-directive registration

Whenever a new directive establishes a durable reusable contract:

1. inspect current verified evidence and all relevant canonical owners;
2. reconcile detailed law into the correct owner document;
3. add or update one contract family here without silently dropping an existing
   durable family;
4. identify the existing and future entity/system categories that inherit it;
5. update any feature/status registry used by the repository;
6. add only a concise repository-guidance reminder when agent behavior itself
   changes;
7. add maintainable validation where it can reliably detect bypass or drift;
8. preserve execution-order neutrality if directives are later renumbered,
   inserted, split, merged, or appended.

For undisclosed systems, register only the public inheritance effect and opaque
responsibility needed to prevent architectural bypass. Do not publish secret
inputs, private codebooks, or other discovery material in this registry.

The durable flow is:

```text
DIRECTIVE BRIEF
→ IMPLEMENTATION / DESIGN DECISION
→ CANONICAL OWNER
→ SYSTEM INHERITANCE REGISTRY
→ FUTURE FEATURE APPLICABILITY
```

If detailed mechanics start accumulating here, move them to their domain owner
and retain only the contract, applicability, status, and link. If a critical
reminder helps every future agent avoid damage, it may remain concise in
repository guidance even when the full detail is canonical elsewhere.
