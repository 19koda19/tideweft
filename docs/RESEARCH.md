# Research ledger

This file records evidence that changes the design. It is not an attempt to summarize every article about games; it captures the sources and constraints that can be turned into mechanics or verification.

## What makes play rewarding and restorative

### Psychological needs beat a pile of prizes

Ryan, Rigby, and Przybylski's studies associate in-game autonomy, competence, and relatedness with enjoyment and willingness to return. Their later model reports that intuitive control mastery is necessary for reaching those experiences but is not sufficient by itself. Design implication: movement must feel clear, then the world must offer meaningful choice, learnable mastery, and human consequence.

- [The Motivational Pull of Video Games](https://doi.org/10.1007/s11031-006-9051-8)
- [A Motivational Model of Video Game Engagement](https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf)

### Restorative games must avoid competence frustration

Tyack, Wyeth, and Johnson found improved competence, affect, and vitality during play after a frustrating task, while in-game need frustration predicted worse post-play affect. Follow-up work found that small decisions and autonomy can contribute to restoration, while competence frustration remains particularly harmful. Design implication: use graded outcomes, recovery routes, clear feedback, and player-selected pressure rather than surprise punishment or erased progress.

- [Restorative Play: Videogames Improve Player Wellbeing After a Need-Frustrating Event](https://doi.org/10.1145/3313831.3376332)
- [“The Small Decisions Are What Makes it Interesting”](https://doi.org/10.1145/3474709)

### Feedback should reveal causality, not replace the activity

Research on “juicy” game feedback points toward legible action–outcome bindings and graded success as important preconditions for competence-supporting moment-to-moment play. Self-determination research also distinguishes informational competence feedback from controlling rewards. Design implication: particles, sound, route illumination, and settlement reactions should explain what the player caused; rewards should unlock expressive decisions rather than command repetition.

- [How Does Juicy Game Feedback Motivate?](https://people.csail.mit.edu/dkao/pdf/3613904.3642656.pdf)
- [Self-Determination Theory and the Facilitation of Intrinsic Motivation](https://selfdeterminationtheory.org/SDT/documents/1991_DeciVallerandPelletierRyan_EP.pdf)

### Challenge should be legible and multidimensional

Studies of game flow support skill–challenge balance, but the evidence is more nuanced than “harder is better.” TIDEWEFT now has one official world ruleset—**A CHALLENGING HARD**—rather than selectable pressure modes or hidden adjustment. Player agency comes from preparation, route choice, recovery, and accessibility settings for input and presentation; those settings never change rewards, hazard probabilities, enemies, loot, or world rules.

- [Skill–challenge balance, expertise, flow, and urge to continue](https://pmc.ncbi.nlm.nih.gov/articles/PMC8943660/)

### Perpetual play needs a voluntary stopping ritual, not a forced session arc

Post-work play research identifies detachment, relaxation, mastery, and control as useful experiences; a diary study links evening-game mastery with next-morning vigor. Research on disengaging from games also reports that players value retained progress, closure, and agency over when they leave. Earlier prototypes exposed Drift, Weave, and Wander session shapes, but that direction is superseded: the live design is one perpetual world and one ruleset. **Quiet Hour** is the voluntary save-and-recap ritual; it stops local simulation without advancing time offline, imposing a timer, or declaring a quota.

- [Digital Games as a Context for Recovery from Work Strain](https://orca.cardiff.ac.uk/id/eprint/131795/)
- [Evening Gaming, Recovery, and Next-Morning Vigor](https://doi.org/10.1111/apps.12519)
- [Disengagement From Games](https://arxiv.org/abs/2406.00189)

Large-scale telemetry research has found little evidence that hours played alone cause changes in well-being; player motivation and the fit between play and life matter more. Design implication: success is a satisfying chosen session, not maximum session duration.

- [Oxford Internet Institute — play time and well-being](https://www.oii.ox.ac.uk/major-new-study-finds-little-evidence-for-causal-connection-between-well-being-and-video-game-playing/)

## Initial synthesis: the honest reward stack

| Horizon | Objective | Interesting action | Reward that changes play |
| --- | --- | --- | --- |
| 1–10 seconds | Read terrain and keep momentum | steer, scan, brace, choose a line | responsive motion, stable cargo, revealed information |
| 1–5 minutes | Reach a landmark or solve a local hazard | reroute, rest, build, share supplies | safer trace, discovery, cache, named rescue |
| 10–25 minutes | Complete a promise | choose cargo and route, adapt to weather | visible project progress, trust, route strand, new option |
| 1–3 sessions | Stabilize a corridor | sequence complementary deliveries and infrastructure | autonomous porter traffic, settlement specialization, mutual aid |
| campaign | Weave a resilient archipelago | shape network topology and relationships | communities solve problems without the player; unique chronicle |

The stack intentionally excludes paid/randomized rewards, daily streaks, expiring chores, offline decay, and empty numerical inflation.

## Technical research

### One renderer, two launch targets

The current official guidance supports a browser-first architecture. p5.js 2.x can be installed as an npm module and instantiated on a specific mount element. Vite can emit relative asset paths with `base: './'`, allowing the same artifact to work below a GitHub repository subpath and under a standard Electron custom scheme. Browser and desktop must therefore share the exact renderer; Node/Electron imports are prohibited from game and simulation code.

- [p5.js releases](https://github.com/processing/p5.js/releases)
- [p5 constructor / instance mode](https://p5js.org/reference/p5/p5/)
- [Vite public base path](https://vite.dev/guide/build#public-base-path)
- [Vite static deployment to GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)

### Electron is a privilege boundary

Electron recommends context isolation, process sandboxing, no renderer Node integration, restrictive content policy, current framework versions, bounded navigation/window creation, and narrow validated IPC. It also recommends a custom protocol over `file://`. TIDEWEFT initially exposes no preload API: its local game bundle runs with ordinary browser capabilities, and its save data lives in web storage under a standard secure `app://` scheme.

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol/)
- [Electron packaging guidance](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)

### Deployment is build-gated

GitHub Pages is a static host. A Pages workflow must build before upload and needs explicit Pages/id-token permissions. Cloud saves or real asynchronous multiplayer would require a separate future backend; personal traces and seed-based share URLs remain honest static-site features.

- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

### Version resolution note

The initial exact stack is p5.js 2.3.2, Electron 44.1.0, Vite 8.2.2, TypeScript 7.0.2, Vitest 4.1.11, and Electron Forge 7.11.2. Research initially found Vitest 4.1.10, but npm's current optional-peer graph failed under npm 10 while 4.1.11 resolved cleanly. Forge 7.11.2 declares the 1.x Electron fuses API, so the project pins compatible `@electron/fuses` 1.8.0 rather than forcing the current 2.x API through a peer conflict.

## Simulation-design findings

### Mixed-resolution ecology must preserve absence, identity, and causal limits

The Alpha 14 Wave-A implementation establishes a bounded scaling pattern for later biodiversity work. Habitat capacity, aggregate population units, pressure, and trend are authoritative facts separate from the small number of exact actors used to represent them nearby. A valid habitat can support no local member of a species; quiet ecology must not be treated as a generation failure. Deer and gull representatives retain stable herd/flock state across full and coarse simulation, while unloaded individuals age physiology and already-committed intent without inventing perception, movement, food claims, or harm. Bounded player-absent group displacement can occur only from persisted habitat pressure and validated anchors, remains nonlethal and cargo-neutral, and does not become player knowledge automatically.

Alpha 15 sharpens that pattern by choosing representation per ecological scale. A free-ranging domestic cat remains a persistent individual because its movement, appearance, current condition, and encounter choices are legible at actor scale; shared current observations can make it retreat from strong rain, leave bounded wet tracks, or guard food when another cat is visibly competing. Brown rats remain one habitat-derived population-area aggregate because simulating every rat would spend identity and perception budgets without creating equivalent decisions. Aggregate stimuli arrive only after the existing visual, scent, weather, terrain, and cargo owners resolve them; the population kernel does not scan actors, weather, or inventory on its own. Its response conserves population units, includes bounded density spacing between saved anchors, and can create directly observable physical signs without manufacturing rat actors, consuming an attracting provision, or granting remote player knowledge.

Alpha 16 adds a second scaling lesson: ecological roles need a physically plausible size boundary before they can drive behavior. A generic `predator`/`prey` comparison was broad enough to misclassify the domestic-cat/deer pair. Declaring small prey and small predators lets the same trophic resolver support cat-or-fox pressure on rabbits while keeping deer outside that relationship; the correction is a shared rule rather than another species-name branch. The resulting rabbit/fox crossing stops at a finite nonlethal pursuit: direct visual evidence can produce rabbit alarm and flight or fox pursuit, dog and large-predator pressure can redirect attention, shared terrain costs shape movement, and expiry or lost opportunity produces disengagement. Paired tracks and canid pawprints persist at the movement site but remain direct-sight, non-targetable evidence; their immutable source clarity derives deterministic fading and exact expiry after 180 ticks rather than save-cadence-dependent mutation. Thumps and yips are presented only when their causative event was visible. None of this implies an attack, kill, carcass, complete scent field, foliage consumption, circadian schedule, worldwide population, or complete bestiary.

The Alpha 17 Rain Chorus / Shadow Overhead release adds a third scaling lesson: a species can be plugged into shared policy and capability owners without pretending every ecological unit needs a full actor or a bespoke pairwise decision tree. Fish crows use no more than three persistent visible representatives and one saved flock when at least two are present; a northern harrier remains one solitary representative; a southern leopard-frog area conserves 64–72 units over no more than three anchors and never manufactures frog actors. The shared activity owner authenticates only a bounded daytime/rest distinction, habitat-valid crow perching, and deterministic harrier low quartering; it is deliberately not a complete circadian system. The physical-item owner still controls crow food custody, so a crow must reach and atomically consume the exact loose provision rather than receiving an abstract reward. The perception and trophic owners require a direct crow sighting of the harrier before alarm can become mobbing pressure and interrupt a finite nonlethal pursuit; co-presence alone does nothing.

The frog chorus demonstrates why stimulus and perception must remain separate. Rain raises aggregate activity, but the same rain masks the chorus through ordinary directional hearing. Quieting and one-unit redistribution modify the same conserved aggregate, while ABOUT, Chart, and Relief expose only lawful evidence rather than a hidden count or fake frogs. The current caption remains species-anonymous; its qualified direction and uncertainty-attenuated pan derive from the same heard-bearing band, and unresolved or co-located contact is stated honestly. Fish crows and the harrier likewise receive distinct visible forms and authenticated perch/quartering posture without fabricated bird ground tracks; the harrier receives no invented call. A selected visible flock's ABOUT estimate comes from its existing knowledge-filtered projection rather than a second hidden census. Habitat version 4 preserves the exact version-3 population prefix before appending these three analyses, and outer save version 12 performs the corresponding one-time adoption from an authenticated version-11 envelope. The release therefore exercises extension and conservation rather than treating a new roster as permission to reroll the old ecology.

The `0.3.3-alpha.18 — One Marsh, Many Eyes` release tests a fourth scaling lesson: aggregate perception can consume canonical addressable species and derive pressure from the same role/capability/trophic policy as individual encounters. A marsh fox can consequently pressure both current small-prey aggregates, while a co-present marsh rabbit creates no response; neither outcome requires adding another pair to a source allowlist. The catalog also closes every broad interaction target row as supported or intentional-no-response, making omission fail visibly without pretending each pair has a handcrafted fixture. A representation-aware readiness report authenticates these seven roles only under the literal `bounded-starting-harbor` scope and explicitly withholds worldwide ecology, migration, promotion, full 30-criterion readiness, and broader biodiversity completion. These are released bounded starting-harbor architecture and player-facing parity changes, not evidence of worldwide ecology, mortality, carcasses, complete scent, full circadian life, a complete bestiary, or N² interaction coverage. Exact feature commit `673fc373b2b6de81f299f4c176681c969ace6915` passed CI run `34027046007` and Pages run `34027046121`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

The `0.3.3-alpha.19 — The Tide Table` release tests a fifth scaling lesson: time-varying habitat should project from stable saved facts rather than rebuild ecology whenever the environment changes. Habitat version 5 retains the complete version-4 population array as an exact prefix and appends stable tidal anchors with baseline elevation. The target tick's authoritative tide then derives water depth, usable fish or crab activity, and egret wading opportunities without participating in population generation. Atlantic silversides and Atlantic marsh fiddler crabs remain conserved, non-addressable aggregates; ebb, flood, and lawful wader pressure may move only their existing units among saved anchors. A snowy egret remains one bounded individual and receives no hidden census or magical target: shared line of sight must produce a current anonymous aquatic-activity observation before its ordinary cognition and locomotion can choose that edge. Surface dimples, glints, burrows, and scrapes likewise remain direct evidence rather than fake animals. The architecture therefore composes tide, aggregate state, perception, cognition, movement, evidence, and presentation without pretending pressure means capture, mortality, consumption, or fishing. Its readiness boundary authenticates signed moving-frame continuity separately from ecological migration and carries dedicated performance evidence. This is the first bounded starting-harbor Wave-C unit, not worldwide ecology or completion of Wave C. Exact feature commit `7ef802398f4b5ea6d4e6503d436fc7a858ccbe30` passed CI run `34045602263` and Pages run `34045602240`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.20 — Between Water and Sky` release tests a sixth scaling lesson: a representative species should exercise a missing shared capability seam rather than accumulate a private pathfinder and detector. Habitat version 6 preserves the complete version-5 population and tidal-anchor record as an exact prefix, then may append zero or one stable persistent American black duck. Two saved dabbling-water destinations and one dry refuge support bounded float, scan, dabble, rest, surface-swim, and relocation-flight activity. The duck's current lawful sensory input is only anonymous aquatic activity produced by shared terrain-occluded vision. Its catalog permits only air plus shallow- and deep-water movement, while activity projects those routes as `air` or `surface-water` into the ordinary locomotion solver; it has no land/walk route. Tide and water select habitat, activity, and travel medium without directly mutating stress or condition. Chart, Relief, and ABOUT expose the same direct knowledge-honest individual, with no flock or invented wake.

The release also confirms that bounded presentation history cannot double as an authoritative operation clock. Internal aggregate schema version 4 stores a durable completed tide-edge operation marker outside the capped event tail, so evicting an old visible disturbance cannot make a same-tick redistribution eligible again. Outer session version 14 adopts an authenticated sealed version-13 record once while preserving all earlier actor, group, aggregate, item, Promise, custody, evidence, tidal-anchor, and world state. The proof remains deliberately representative: shared invariants, conservation, deterministic scenarios, bounded fuzzing, and performance witnesses scale better than a test for every animal pair. It does not add flocking, nesting, breeding, migration, cross-region ecology, mortality, carcasses, injury, capture, consumption, the otter-like predator, worldwide ecology, Wave-C completion, or directive completion. Exact feature commit `c11e4de0563876839158fb13a69ddfb4dadd6dbe` passed feature CI run `34061008077`, main CI run `34061513043`, and Pages run `34061512986`; the deployed HTML, icon, manifest, JavaScript, and CSS match the tested local build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.21 — The Living Channel` release tests a seventh scaling lesson: an amphibious representative should compose existing habitat, perception, role, activity, locomotion, materialization, physical-item, and presentation owners rather than receive an otter-specific parallel simulation. Habitat version 7 preserves the complete version-6 population and anchor record as an exact prefix, then may append zero or one stable North American river otter only where both tidal aggregates, usable foraging water, and a distinct dry haulout support it. Shared shore↔surface-water travel keeps the same actor and identity across media. Current anonymous aquatic activity reaches it only through ordinary occluded sight; fish and crab interactions remain nonlethal aggregate pressure; and one representative loose-food contest resolves through the generic physical claim and custody seam. Deterministic spatial top-K ranks every lawful intersecting individual by exact local distance with stable-ID ties before selecting the unchanged 24 full-detail actors, so source order cannot determine visibility and overflow identity remains authoritative in coarse state.

The release advances outer save format to 15 and adopts an authenticated version-14 envelope exactly once without rewriting its habitat-version-6 prefix. Chart, Relief, ABOUT, mouse, touch, and reduced-motion presentation project the same knowledge-honest individual. Exact feature commit `5514c24619fc6d41b34cbdd6315f4ae8d936f2dc` passed CI run `34067577935` and Pages run `34067577893`; the five fetched live assets match the tested committed build byte-for-byte. It deliberately adds no live-prey capture or consumption, harmful attacks, injury, mortality, carcasses, fishing, new sound or persistent evidence, reproduction, ecological migration, worldwide ecology, full Wave C, Directive 04_1 completion, or exhaustive pair testing.

The **LIVE_VERIFIED** `0.3.3-alpha.22 — Tidal Convergence` release tests an eighth scaling
hypothesis without adding a species: activities that already crossed different
media should converge behind reusable affordances before the roster grows
again. Six profiles now compose perch watching, low quartering, tidal wading,
dabbling waterfowl, shore-water foraging, and aerial surface opportunism from
required capabilities, destination authority, travel media, observation
affordance, presentation signals, and one deliberately bounded daylight/rest
window. Current anonymous aquatic surface observation is selected only by the
generic conjunction of actor addressability, surface-opportunity capability,
and tidal-activity capability, and still requires terrain-occluded same-tick
sight of an occupied, active, depth-usable fish or crab anchor. The existing
gull is the useful counterexample: it may fly toward and circle that observed
area, then return by air to an authenticated habitat anchor to rest, without
acquiring aquatic locomotion, an aquatic-foraging role, aggregate pressure, a
species/count disclosure, or a private prey target. Immediate lawful threat,
alarm, pursuit, and physical-food intents continue to outrank neutral activity.

This convergence leaves outer save 15, habitat 7, aggregate schema 4, the
seventeen-record catalog, aggregate-unit totals, physical-item custody, and the
nearest-24 materialization ceiling unchanged. Its validation strategy is the
scalable one: abstraction and property checks, conservation, bounded
interaction-graph fuzzing, performance budgets, and a small set of
representative emergence witnesses rather than species fixtures or an N² pair
matrix. It closes only the bounded starting-harbor Wave-C integration seam.
Exact feature commit `4dacd99e95a018314d65a72183b82cba8583774f`
passed CI run `34074045801` and Pages run `34074045818`; the five cache-bypassed
live assets match the tested committed build byte-for-byte. It does not
complete worldwide Wave C or Directive 04_1. Mortality, carcasses, harmful
attacks, live-prey capture or consumption, fishing, nesting, reproduction,
ecological cross-region migration, full circadian life, and a general
scent/sound/evidence system remain absent.

The **LIVE_VERIFIED** `0.3.3-alpha.23 — The Storehouse Door` release tests a ninth
scaling lesson without adding a species: settlement ecology should compose
existing physical custody, sensory projection, aggregate response, human
knowledge, and presentation owners rather than create a store-specific animal
simulation. One bounded starting-harbor store owns one stable physical
fresh-produce lot that is deliberately separate from abstract settlement food.
Its open door contributes source strength and packaging leakage; the existing
scent owner alone decides how wind, rain, distance, and uncertainty shape what
reaches the existing brown-rat aggregate. A matching attraction may relocate
one already-existing rat unit through ordinary aggregate policy, and only that
authenticated event can remove at most one exact physical produce unit. Rat
population remains conserved, while the physical lot's remaining quantity and
loss record remain exact across response, save, and reload.

The useful counterexample is the existing cat. Its lawfully visible presence
may pressure the rat aggregate through the same shared visual/trophic policy,
but the cat receives no rat-sign cognition, hidden rat knowledge, or new
investigation behavior. Likewise, Alpha 23's actual keeper secures the persistent
door only after an in-person player report; the shared kernel authenticates
direct keeper observations for later autonomous wiring. An unseen loss is
not reported merely because the player later returns. Outer save 16 adopts a
sealed version-15 world once while habitat 7 and aggregate schema 4 remain
unchanged. Confidence comes from shared abstraction checks, a bounded signed-
coordinate property sweep, exact item and aggregate conservation, deterministic
replay/migration, and one representative store-rat-visible-cat composition.
Existing shared fuzz and performance gates remain in regression rather than
expanding into an exhaustive species or pair matrix. Exact feature commit
`245997219eff02e4edcf75331dc7fd4850432efb` passed CI run `34080936761` and
Pages run `34080936748`; the five cache-bypassed live artifacts match the tested
local build byte-for-byte. This remains a bounded composition, not worldwide
store ecology, schedules, livestock, broad rumors, mortality, carcasses,
live-prey consumption, the full bestiary, or Directive 04_1 completion.

The **LIVE_VERIFIED** `0.3.3-alpha.24 — The Yard Flock` release tests a tenth scaling
lesson: domestic species should reuse the Living Weft and add custody as a
relationship, not receive a private livestock simulation. Habitat version 8
keeps the entire version-7 ecology and tidal record as an exact prefix, then
appends one bounded yard anchor, two or three stable chicken actors, and one
stable flock. Settlement ecology version 2 ties those identities to the
starting harbor and existing keeper. Each bird continues through the ordinary
perception, attention, group, locomotion, materialization, item-opportunity,
and presentation owners.

This composition also tests physical conservation across two systems. Only an
authenticated custody member can receive the open store's exact food
opportunity. The bird must reach the shared structural-access area, then a
staged transaction removes exactly one unit from the existing physical lot.
Closed stock yields no belief or claim, failed/replayed ticks cannot duplicate
or reconsume the unit, and offscreen activity cannot become retrospective
player knowledge. Outer save 17 adopts sealed version 16 once and preserves all
earlier actor, group, aggregate, item, Promise, store, closure, loss, evidence,
and world-fact identity. Confidence again comes from shared invariants,
signed-coordinate properties, conservation, replay/migration attacks, bounded
performance, and one representative visible-yard witness—not a chicken-only
test suite or a species-pair matrix. Exact release commit
`4067ac4439bb6f624ed88f69eb09cc591b246741` passed CI run `34093027893` and
Pages run `34093027917`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested local production build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.25 — The Far Paddock` release tests an eleventh
scaling lesson: adding a domestic species should require a profile and a
bounded habitat/custody suffix, while conflicts remain properties of shared
owners. Habitat version 9 preserves the version-8 record exactly before adding
one separated pen, two goat individuals, and one persistent herd. Settlement
ecology version 3 generalizes custody into a bounded collection of typed homes
and rejects duplicate actor, group, relationship, home, or structure
authority. Outer save 18 preserves the older flock, coop, store, physical food,
actors, aggregates, items, and Promises before that additive migration.

The shared resource arbiter accepts only source-validated contenders, then
orders them by physical contact, current need, and stable identity. This avoids
both first-array-wins behavior and a goat-specific food exception. The goat
profile has no store-food capability; its future browse diet remains dormant
until living foliage supplies a real conserved resource. Evidence therefore
comes from signed-coordinate habitat properties, shared custody/group
invariants, migration and replay attacks, item conservation, bounded
performance, and representative runtime composition. It does not come from
testing goats against every existing animal, and it does not claim calls,
tracks, injury, mortality, carcasses, reproduction, schedules, herding,
guardian behavior, cross-region migration, worldwide livestock, full Wave D,
or Directive 04_1 completion.

Exact release commit `29af7793346c0c3977a5ca727b79feb3a50b83bb` passed CI
run `34108539228` and Pages run `34108539255`; five cache-bypassed live
artifacts match the tested local production build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.26 — The Paddock Watch` release tests a twelfth
scaling lesson: a domestic job should be a persisted relationship over an
ordinary actor, not a second cognition system or a statistical livestock buff.
Exactly one separate seed-stable dog keeps the existing dog actor's needs,
condition, exposure, perception, intent, and self-preservation. Its kennel is a
third settlement custody, while a generic working-animal assignment records the
existing keeper as handler, the dog's custody, the protected goat custody and
herd, the pen worksite, and one exact current or pending activity.

The perception boundary now accepts bounded species-neutral external
participants and uses a deterministic local candidate index. Work may consume
only canonical cognition: an anonymous alarm contributes its observation ID
and uncertain area, never the hidden emitter or target. Investigation, escape,
and return reuse shared locomotion, and actor-owned retreat, shelter, avoidance,
rest, welfare, or an inaccessible route can defer duty. Save staging and crash
recovery commit the accepted transition exactly once. Direct-detail Chart,
Relief, and ABOUT may show only current observable activity.

The representative emergence proof is intentionally causal rather than
guaranteed. A rabbit alarm can recruit the dog toward perceived space; the fox
continues until it actually sees the dog, after which shared appraisal can
redirect it. No guardian aura, attack, injury, death, herding, bark, or remote
livestock knowledge is implied. Outer save 19 and settlement ecology 4 adopt a
sealed version-18 Far Paddock state while habitat 9 and aggregate ecology 4
remain unchanged. Evidence comes from shared assignment/perception/locomotion,
conservation, signed-world, migration/replay, bounded-performance, runtime, and
emergence invariants—not one test for each species or pair. Exact release
commit `e3aae174d962ec609b9463e40320227237c9fa1f` passed CI run `34143286763`
and Pages run `34143286720`; five cache-bypassed live artifacts match the
tested local production build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.27 — The Watch Returns` tests a thirteenth
scaling lesson: work needs a small lawful lifecycle, not a handler-specific
brain or an ever-growing activity log. The existing guardian's committed
investigation opens one bounded task around its source observation, uncertain
area, and deterministic shared-locomotion probe. Completion is physical probe
arrival, not discovery of a hidden emitter or proof that danger disappeared.
The same task then returns physically to the existing pen and closes only after
current handler sight acknowledges arrival.

Handler influence is information-constrained. The keeper's narrow
outside-duty recall can cancel investigation only when dog and keeper hold
fresh reciprocal identified visual beliefs; an occluded or unloaded dog
creates no remote command. Actor intent and welfare can suspend and resume work
without manufacturing an outcome. One exact-once transition contract covers
open, suspend, resume, complete, cancel, arrive, and acknowledge, while the save
retains only one current task, one pending transition, and one latest result.

This release adds no species, herding, separated-livestock search or rescue,
full schedule, autonomous kennel routine, attack, injury, mortality, carcass,
player command, or guaranteed defense. Validation is deliberately concentrated
on shared lifecycle, perception, locomotion, welfare, migration/replay,
conservation, signed-world, and bounded-performance invariants plus
representative runtime emergence—not a bespoke test for every species or pair.
Exact gameplay commit `f2c55413c64a8e6b8e3cc1fab06e50252df2399f` and public
attestation commit `6a5bc4352edb39b47ee2216ca01a1506f01419cb` passed final CI
`34160098140` and Pages `34160098112`; five cache-bypassed live artifacts match
the tested production build byte-for-byte.

The **LIVE_VERIFIED** `0.3.3-alpha.28 — The Missing Goat` release tests a
fourteenth scaling lesson: a recovery story should compose existing identity,
group, perception, locomotion, custody, home, and work owners rather than add a
goat-specific rescue brain. An exact in-frame split needs both a current caused
flee/retreat and real separation; distance alone is not a cause. Regroup
requires current identified peer sight, while danger and physiology remain
authoritative. The keeper must lawfully notice an absence before an explicit
last-known-area report can recruit the existing guardian. Search is an action,
not proof of finding.

The same exact bodies may physically rejoin. Current caretaker sight of every
member in the pen confirms closure; an already-known case can consume an
authenticated coarse reunion transition without inventing that sight. Treating
each social group as an indivisible materialization-cap unit prevents partial
groups from acquiring mismatched presentation and cognition. Fully coarse
members preserve identity and topology but gain no local senses or movement.
The new persistence surface is bounded to one case, one pending transaction,
and one latest result under an empty version-1 root and exact outer-v20-to-v21
adoption.

This closes only one starting-harbor Wave-D integration seam. It does not add
herding, complete schedules or home routines, guaranteed recovery, a remote
marker or player search command, attack, injury, mortality, carcasses, calls,
tracks, or full cross-region ecology. Confidence remains centered on shared
invariants, deterministic properties, migration/replay, bounded performance,
and representative emergence—not per-species or N² interaction tests.

Exact gameplay/release/main commit
`60c9bc34ac871425e5319c8369e715751b5d1c44` passed feature CI
`34174876320`, main CI `34175693435`, and Pages `34175693447`. The local gate
passed TypeScript, public-boundary and player-facing-sync checks, 220 test files
and 2,111 checks, a five-asset 3,284,606-byte served web build, a 10-entry
3,476,214-byte runtime-only Electron ASAR inspection, desktop/mobile/title
smoke, and clean invariant, save, and visual audits. The first cache-bypassed
five-file live comparison matched the tested build exactly.

The **LIVE_VERIFIED** `0.3.3-alpha.29 — What Remains` release tests a
fifteenth scaling lesson: harmful interaction and aftermath should compose
current perception, pursuit, exact contact, population conservation, physical
resources, and shared movement instead of adding a fox-only kill script or a
death-time loot table. Only an already-pursuing marsh fox that currently
identifies and physically contacts its exact marsh rabbit can resolve damage.
One death retires that actor once, removes one population unit, preserves any
other represented units as abstract reserve, and leaves one stable finite body.

The same ordinary vision and reach owners let a fox or fish crow discover and
approach that body. Exclusive claim and one-unit consumption conserve its
finite resource, while a fox may guard it. Chart, Relief, and EVENTS project
only bodies and events the player currently perceives; offscreen death,
feeding, attacker identity, cause, claimant, and remaining resource never
become retrospective narration. Group-member mortality fails closed, and the
slice does not claim broader attacks, mortality, population recovery,
decomposition, body movement or harvesting, scent, insects, worldwide ecology,
or later Wave-E species.

Exact gameplay commit `a0f7b571cf6068c41397ad0b8767347b04b24ac1`
passed feature CI `34187159628`, main CI `34187706800`, and Pages
`34187706784`. The release gate passed TypeScript, public-boundary and
player-facing-sync checks, 224 test files and 2,143 checks, a five-asset
3,323,332-byte served web build, a 10-entry 3,514,940-byte runtime-only
Electron ASAR inspection, desktop/mobile/title smoke, and clean invariant,
save, release-surface, and visual audits. The first cache-bypassed five-file
live comparison matched the tested build exactly.

The `0.3.3-alpha.30 — Beyond the Harbor` release is **LIVE_VERIFIED**. Its scaling lesson is that regional
biodiversity should add a bounded habitat source and parameterized species
records, not copy an animal-specific simulation. One deterministic remote
temperate-upland/forest-edge source adds wild boar, elk, and gray wolf as
`SOUNDER`, `HERD`, and `PACK` members through shared perception, locomotion,
group, materialization, and knowledge-honest Chart/Relief/ABOUT owners. Wolf
pursuit remains nonlethal pressure unless the wolf reaches exact contact with
an eligible solitary addressable marsh rabbit; grouped elk, deer, and all group
members cannot be harmed. A boar or wolf can see, reach, claim, and consume an
existing finite body, and a wolf may guard its claim. Habitat 10 and outer save 23 preserve the
complete habitat-9 and version-22 body-bearing state before exact append-only
adoption. Representative/property, conservation, and bounded-performance
checks cover the shared abstractions. Voice patterns remain inaudible
foundation data, dog interaction is an intentional unimplemented no-response,
and tactical pack combat, group mortality, cougar, additional bear ecotypes,
worldwide ecology, and full Wave E remain outside the release.

Exact gameplay commit `56dc4812c7c41b6227bae1b0273701b51076f34a` passed
feature CI `34215120610` and Pages `34216318509`. Verification-only descendant
`65e2ba59929a296139e578adbd03621f91d93fc2` raises the CI and Pages job
ceilings plus one slow integration-test allowance without changing production
code or artifacts; it passed main CI `34221064966` and Pages `34221064916`.
The complete local
gate passed TypeScript, public-boundary and player-facing-sync checks, 227 test
files and 2,177 checks, a five-asset 3,365,373-byte served
web build, a 10-entry 3,556,981-byte runtime-only Electron ASAR inspection,
desktop/mobile/title smoke, and clean invariant, save, release-surface, and
visual audits. A cache-bypassed live comparison matched all five production
files byte-for-byte.

The `0.3.3-alpha.31 — High Country Shadows` source release tests the next
scaling step: add two behaviorally distinct solitary predators without adding
two private controllers. Cougar and brown bear append to the exact existing
remote source through habitat version 11 and the twenty-four-record catalog.
Both reuse stable habitat-population records and, where carrying capacity
supports them, persistent individual identity, current direct perception,
attention, actor-owned locomotion, nearest-24 materialization, physical-body
claims, knowledge-honest dual-view presentation, and persistence. Cougar alone
uses a short direct-sight pursuit and may reach the current mortality kernel
only through exact contact with a currently identified solitary addressable
marsh rabbit. Brown bear has no live-prey pursuit or harmful contact. Either
may see, reach, claim, guard, and consume an already-existing finite body.

This unit is also a compatibility experiment. Habitat 11 must reproduce the
entire habitat-10 remote source and population sequence exactly—including the
existing trio's pressure and trend—before it evaluates two new population
records and appends only supported populations. Outer
save 24 must authenticate and adopt sealed version 23 once without changing
actors, groups, mortality, bodies, claims, consumption, or world facts.
Shared/property and signed-region checks, conservation, bounded performance,
and one representative predator/scavenger chain give more useful confidence
than multiplying per-species fixtures or building an N² interaction matrix.
The unit deliberately adds no group, track evidence, audible voice,
species-specific dog-directed behavior, player/human/group harm, broader
mortality, ecological migration, or worldwide distribution. Ordinary lawful
large-predator perception may still produce a non-harmful dog or porter
reaction through the shared cognition architecture. Live release evidence remains pending deployment.

Design implication: future worldwide populations and settlement ecology should expand this aggregate/representative, physical-custody, domestic-custody, working-relationship, recovery, knowledge, mortality/body, and shared-policy boundary rather than multiplying full actors or one-off detection hooks. Ecological confidence should come from shared invariants, property checks, bounded interaction-graph fuzzing, conservation, performance budgets, and a small set of representative witnesses—not a brittle species-by-species or N² matrix of bespoke animal-pair tests. Alpha 18 is the verified bounded starting-harbor closure, Alpha 19 is the verified first bounded tidal unit, Alpha 20 is the verified second bounded tidal unit, Alpha 21 is the verified final bounded starting-harbor role slice, Alpha 22 is the verified bounded integration closure across those roles, Alpha 23 is the verified storehouse composition, Alpha 24 is the verified Yard Flock release, Alpha 25 is the verified Far Paddock release, Alpha 26 is the verified Paddock Watch release, Alpha 27 is the verified bounded work-lifecycle extension, Alpha 28 is the verified bounded recovery-composition release, Alpha 29 is the verified first one-life/one-body mortality release, Alpha 30 is the verified first Wave-E regional breadth release, and Alpha 31 is the source-stage solitary-predator append awaiting live attestation. None completes worldwide aquatic or settlement ecology, broad attacks or mortality, population recovery, decomposition, body transport or harvesting, full circadian life, complete scent, worldwide populations, or the full bestiary. Broader species, reproduction, ecological migration, those absent physical systems, wider settlement ecology, and wider sound/evidence tracking still require their own authoritative owners and performance proof.

- Dwarf Fortress demonstrates that legible remembered events, relationships, loyalties, and consequences across sites can create depth without those details being the player's direct job. [Bay 12 development roadmap](https://bay12games.com/dwarves/dev.html)
- Factorio's transport design shows why constrained logistics and topology create problems worth solving, and why automating a genuinely solved route prevents the core loop becoming chores. [Factorio Friday Facts 224](https://www.factorio.com/blog/post/fff-224)
- The strand idea is strongest when assistance is embedded in ordinary terrain use. The official Death Stranding guide frames this as a gentle connection through infrastructure left for others. TIDEWEFT applies the principle to simulated communities and the player's own previous traces, without pretending NPC contributions are real people. [Kojima Productions beginner's guide](https://www.kojimaproductions.jp/index.php/en/death-stranding-directors-cut-beginners-guide)
- Weak ties can bridge otherwise separated groups. In game terms, a small connection between culturally or economically different settlements may create more new knowledge and resilience than repeatedly maximizing one hub. [Stanford — The Strength of Weak Ties](https://inequality.stanford.edu/publications/media/details/strength-weak-ties-0)

The resulting design treats network topology as the authored fortress: hubs provide efficiency, loops provide resilience, and every specialization creates a dependency that the player can understand and reshape.
