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

The complete but unpublished `0.3.3-alpha.20 — Between Water and Sky` candidate tests a sixth scaling lesson: a representative species should exercise a missing shared capability seam rather than accumulate a private pathfinder and detector. Habitat version 6 preserves the complete version-5 population and tidal-anchor record as an exact prefix, then may append zero or one stable persistent American black duck. Two saved dabbling-water destinations and one dry refuge support bounded float, scan, dabble, rest, surface-swim, and relocation-flight activity. The duck's current lawful sensory input is only anonymous aquatic activity produced by shared terrain-occluded vision. Its catalog permits only air plus shallow- and deep-water movement, while activity projects those routes as `air` or `surface-water` into the ordinary locomotion solver; it has no land/walk route. Tide and water select habitat, activity, and travel medium without directly mutating stress or condition. Chart, Relief, and ABOUT expose the same direct knowledge-honest individual, with no flock or invented wake.

This candidate also confirms that bounded presentation history cannot double as an authoritative operation clock. Internal aggregate schema version 4 stores a durable completed tide-edge operation marker outside the capped event tail, so evicting an old visible disturbance cannot make a same-tick redistribution eligible again. Outer session version 14 adopts an authenticated sealed version-13 record once while preserving all earlier actor, group, aggregate, item, Promise, custody, evidence, tidal-anchor, and world state. The proof remains deliberately representative: shared invariants, conservation, deterministic scenarios, bounded fuzzing, and performance witnesses scale better than a test for every animal pair. It does not add flocking, nesting, breeding, migration, cross-region ecology, mortality, carcasses, injury, capture, consumption, the otter-like predator, worldwide ecology, Wave-C completion, or directive completion. No CI, Pages, commit, or exact-live evidence is claimed until publication is actually verified.

Design implication: future worldwide populations should expand this aggregate/representative and shared-policy boundary rather than multiplying full actors. Ecological confidence should come from shared roles and capabilities with explicit physical constraints, conservation, deterministic outcome classes, representative encounters, and bounded interaction-graph fuzzing—not a brittle N² matrix of bespoke animal-pair tests. Alpha 18 is the verified bounded Wave-B starting-harbor closure, Alpha 19 is the verified first bounded Wave-C tidal unit, and Alpha 20 is presently only a complete unpublished second unit. None adds attacks, injury, mortality, carcasses, live-prey consumption, full circadian life, complete scent, worldwide populations, the full bestiary, or exhaustive pair behavior. Broader species, reproduction, ecological migration, those absent physical systems, and wider evidence tracking still require their own authoritative owners and performance proof.

- Dwarf Fortress demonstrates that legible remembered events, relationships, loyalties, and consequences across sites can create depth without those details being the player's direct job. [Bay 12 development roadmap](https://bay12games.com/dwarves/dev.html)
- Factorio's transport design shows why constrained logistics and topology create problems worth solving, and why automating a genuinely solved route prevents the core loop becoming chores. [Factorio Friday Facts 224](https://www.factorio.com/blog/post/fff-224)
- The strand idea is strongest when assistance is embedded in ordinary terrain use. The official Death Stranding guide frames this as a gentle connection through infrastructure left for others. TIDEWEFT applies the principle to simulated communities and the player's own previous traces, without pretending NPC contributions are real people. [Kojima Productions beginner's guide](https://www.kojimaproductions.jp/index.php/en/death-stranding-directors-cut-beginners-guide)
- Weak ties can bridge otherwise separated groups. In game terms, a small connection between culturally or economically different settlements may create more new knowledge and resilience than repeatedly maximizing one hub. [Stanford — The Strength of Weak Ties](https://inequality.stanford.edu/publications/media/details/strength-weak-ties-0)

The resulting design treats network topology as the authored fortress: hubs provide efficiency, loops provide resilience, and every specialization creates a dependency that the player can understand and reshape.
